#!/usr/bin/env python3
"""
Local launcher for the Modlist Dependency Planner + one-click MO2 sync.

Run this INSTEAD of `python -m http.server`:

    python serve.py            # serves on http://localhost:8000
    python serve.py 8080       # ...or another port

It serves the planner's static files AND exposes read-only endpoints the
"Sync from MO2" button uses. Because this is a server process (not the sandboxed
browser page), it can read your MO2 files by path directly — no folder picker,
no 90k-file scan, works in any browser including Brave:

    GET /api/profiles                 -> { profiles, base, instance, ...found flags, defaults }
    GET /api/modlist?profile=Name     -> { profile, modlist }               (for the separator picker)
    GET /api/sync?profile=Name        -> { profile, modlist, categories, ... }

Two locations matter, and each endpoint accepts them as optional overrides (set from
the app's "Instance..." dialog; omitted -> the defaults below):
    ?base=<Base Directory>    folder that holds mods, profiles and downloads
    ?instance=<Instance path> folder that holds categories.dat (MO2's "Open Instance folder")

Only these paths are read; nothing is written. Bound to 127.0.0.1 (localhost only).
Env vars also override the defaults: MO2_BASE, MO2_INSTANCE.
"""
import http.server, socketserver, json, os, re, sys, urllib.parse

# ---- default config (used when the app doesn't send an override) --------------
# Base Directory — where mods\, profiles\ and downloads\ live:
MO2_BASE     = os.environ.get("MO2_BASE",
                    r"D:\Games\Mod Organizer 2")
# Instance path — the folder that contains categories.dat (MO2's "Open Instance folder"):
MO2_INSTANCE = os.environ.get("MO2_INSTANCE",
                    r"C:\Users\USER\AppData\Local\ModOrganizer\MO2 Instance")
DEFAULT_PORT = 8000
WEBROOT      = os.path.dirname(os.path.abspath(__file__))
# -------------------------------------------------------------------------------

# categories.dat spells a few names differently from the planner's curated set; re-spell those
# so they inherit the planner's colours. Everything else is passed through verbatim.
CANON = {
    "ui": "User Interface",
    "visuals": "Visuals and Graphics",
    "bugfixes": "Bug Fixes",
    "modders resources": "Modders Resources",
    "models & textures": "Models and Textures",
}
# Fallback id->name (the default SkyrimSE set) if categories.dat can't be read.
FALLBACK_CATS = {
    "1": "Animations", "52": "Poses", "2": "Armour", "53": "Power Armor", "3": "Audio",
    "38": "Music", "39": "Voice", "5": "Clothing", "41": "Jewelry", "42": "Backpacks",
    "6": "Collectables", "28": "Companions", "7": "Creatures Mounts and Vehicles", "8": "Factions",
    "9": "Gameplay", "27": "Combat", "43": "Crafting", "48": "Overhauls", "49": "Perks",
    "54": "Radio", "55": "Shouts", "22": "Skills and Levelling", "58": "Weather and Lighting",
    "44": "Equipment", "45": "Home and Settlement", "10": "Body, Face, and Hair",
    "40": "Character Presets", "11": "Items", "32": "Mercantile", "37": "Ammo", "19": "Weapons",
    "36": "Weapon and Armour Sets", "23": "Player Homes", "25": "Castles and Mansions",
    "51": "Settlements", "12": "Locations", "4": "Cities", "31": "Landscape Changes",
    "29": "Environment", "30": "Immersion", "20": "Magic", "21": "Models and Textures",
    "33": "Modders Resources", "13": "NPCs", "24": "Bug Fixes", "14": "Patches", "35": "Utilities",
    "26": "Cheats", "15": "Quests", "16": "Races and Classes", "34": "Stealth",
    "17": "User Interface", "18": "Visuals and Graphics", "50": "Pip-Boy", "46": "Shader Presets",
    "47": "Miscellaneous",
}
CAT_LINE_RE = re.compile(r'^\s*category\s*=\s*"?([0-9,\-]+)"?', re.I | re.M)


def canonical(name):
    return CANON.get(name.strip().lower(), name.strip())


def resolve_paths(query):
    """Return (base_dir, instance_dir, categories_dat) for this request. The app may send
       ?base=<Base Directory> and ?instance=<Instance path>; either falls back to its default.
       categories.dat lives in the instance folder; if it isn't there, a portable copy in the
       base folder is tried before giving up (load_category_ids then uses the built-in map)."""
    base = (query.get("base") or [""])[0].strip() or MO2_BASE
    instance = (query.get("instance") or [""])[0].strip() or MO2_INSTANCE
    cat = os.path.join(instance, "categories.dat")
    if not os.path.isfile(cat):
        portable = os.path.join(base, "categories.dat")
        if os.path.isfile(portable):
            cat = portable
    return base, instance, cat


def load_category_ids(cat_path):
    """id -> category name, from categories.dat (pipe-delimited 'id|name|parent').
       Authoritative for the instance; falls back to the default set if unreadable."""
    ids = {}
    try:
        with open(cat_path, encoding="utf-8", errors="ignore") as f:
            for line in f:
                parts = line.rstrip("\n").split("|")
                if len(parts) >= 2 and parts[0].strip().isdigit():
                    ids[parts[0].strip()] = canonical(parts[1])
    except OSError:
        pass
    return ids or dict(FALLBACK_CATS)


def list_profiles(base):
    pdir = os.path.join(base, "profiles")
    try:
        return sorted(
            (d for d in os.listdir(pdir) if os.path.isdir(os.path.join(pdir, d))),
            key=str.lower)
    except OSError:
        return []


def read_modlist(base, profile):
    path = os.path.join(base, "profiles", profile, "modlist.txt")
    with open(path, encoding="utf-8", errors="ignore") as f:
        return f.read()


def read_mod_categories(base, cat_path):
    """mod folder name -> resolved category name, reading each mods/<mod>/meta.ini by path.
       Only ~one file per mod (no recursive asset scan)."""
    id_map = load_category_ids(cat_path)
    out = {}
    moddir = os.path.join(base, "mods")
    try:
        entries = os.listdir(moddir)
    except OSError:
        return out, len(id_map)
    for d in entries:
        meta = os.path.join(moddir, d, "meta.ini")
        if not os.path.isfile(meta):
            continue
        try:
            with open(meta, encoding="utf-8", errors="ignore") as f:
                txt = f.read()
        except OSError:
            continue
        m = CAT_LINE_RE.search(txt)
        if not m:
            continue
        primary = m.group(1).split(",")[0].strip()
        if not primary or primary in ("-1", "0"):
            continue
        out[d] = id_map.get(primary, "Category " + primary)
    return out, len(id_map)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=WEBROOT, **k)

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _resolve_profile(self, base, query):
        """Return (profile, profiles) with the requested profile validated, or (None, profiles)."""
        profiles = list_profiles(base)
        profile = (query.get("profile") or [""])[0] or (profiles[0] if profiles else "")
        return (profile if profile in profiles else None), profiles

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/api/profiles":
            base, instance, cat = resolve_paths(query)
            return self._json({
                "profiles": list_profiles(base),
                "base": base,
                "instance": instance,
                "categoriesDat": cat,
                "baseFound": os.path.isdir(base),
                "categoriesFound": os.path.isfile(cat),
                "defaults": {"base": MO2_BASE, "instance": MO2_INSTANCE},
            })

        if parsed.path == "/api/modlist":
            base, _, _ = resolve_paths(query)
            profile, profiles = self._resolve_profile(base, query)
            if profile is None:
                return self._json({"error": "profile not found", "profiles": profiles}, 404)
            try:
                return self._json({"profile": profile, "modlist": read_modlist(base, profile)})
            except OSError as e:
                return self._json({"error": f"could not read modlist.txt: {e}"}, 500)

        if parsed.path == "/api/sync":
            base, instance, cat = resolve_paths(query)
            profile, profiles = self._resolve_profile(base, query)
            if profile is None:
                return self._json({"error": "profile not found", "profiles": profiles}, 404)
            try:
                modlist = read_modlist(base, profile)
            except OSError as e:
                return self._json({"error": f"could not read modlist.txt: {e}"}, 500)
            cats, cat_count = read_mod_categories(base, cat)
            return self._json({
                "profile": profile,
                "modlist": modlist,
                "categories": cats,
                "modsWithCategory": len(cats),
                "categoryCount": cat_count,
            })

        return super().do_GET()

    def log_message(self, *args):
        pass  # keep the console quiet


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        cat = os.path.join(MO2_INSTANCE, "categories.dat")
        print(f"Modlist Planner + MO2 sync  ->  http://localhost:{port}")
        print(f"  base directory : {MO2_BASE}  {'(found)' if os.path.isdir(MO2_BASE) else '(NOT FOUND — set it in the app or edit MO2_BASE)'}")
        print(f"  instance path  : {MO2_INSTANCE}  {'(categories.dat found)' if os.path.isfile(cat) else '(no categories.dat — built-in default map used)'}")
        print("  Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()

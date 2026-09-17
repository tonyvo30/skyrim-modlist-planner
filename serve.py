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
    GET /api/sync?profile=Name        -> { profile, modlist, categories, comments (meta.ini notes), ... }

Two locations matter, and each endpoint accepts them as optional overrides (set from
the app's "Instance..." dialog; omitted -> the defaults below):
    ?base=<Base Directory>    folder that holds mods, profiles and downloads
    ?instance=<Instance path> folder that holds categories.dat (MO2's "Open Instance folder")

Only these paths are read; nothing is written. Bound to 127.0.0.1 (localhost only).
Env vars also override the defaults: MO2_BASE, MO2_INSTANCE.
"""
import http.server, json, os, re, sys, urllib.parse

# ---- config ------------------------------------------------------------------
DEFAULT_PORT = 8000
WEBROOT      = os.path.dirname(os.path.abspath(__file__))
LOCAL_CONFIG = os.path.join(WEBROOT, "mo2-config.json")


def load_mo2_paths():
    """Where the user's MO2 lives. These are personal paths, so they are kept OUT of source and
       git history (F-3). Resolution order, first non-empty wins per field:
         1. env vars  MO2_BASE / MO2_INSTANCE
         2. an untracked  mo2-config.json  next to this file  ({"base": "...", "instance": "..."})
         3. empty — the server still serves the static planner and simply reports 'base not found';
            the user can then set the paths from the app's Instance dialog.
       Base Directory holds mods/profiles/downloads; Instance path holds categories.dat."""
    base = os.environ.get("MO2_BASE", "").strip()
    instance = os.environ.get("MO2_INSTANCE", "").strip()
    if (not base or not instance) and os.path.isfile(LOCAL_CONFIG):
        try:
            with open(LOCAL_CONFIG, encoding="utf-8") as f:
                cfg = json.load(f)
            base = base or str(cfg.get("base", "")).strip()
            instance = instance or str(cfg.get("instance", "")).strip()
        except (OSError, ValueError):
            pass
    return base, instance


MO2_BASE, MO2_INSTANCE = load_mo2_paths()
# ------------------------------------------------------------------------------

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
COMMENT_LINE_RE = re.compile(r'^\s*comments\s*=(.*)$', re.I | re.M)


def canonical(name):
    return CANON.get(name.strip().lower(), name.strip())


_QSETTINGS_ESCAPES = {"\\": "\\", '"': '"', "n": "\n", "t": "\t", "r": "\r",
                      "a": "\a", "b": "\b", "f": "\f", "v": "\v", "0": "\0"}


def _qsettings_unescape(s):
    """Reverse Qt QSettings' string escaping (used inside a quoted meta.ini value): \\\\ -> \\,
       \\" -> ", the usual C control escapes, and \\xHH hex bytes. An unknown escape keeps its
       backslash verbatim rather than silently dropping it."""
    out, i, n = [], 0, len(s)
    while i < n:
        c = s[i]
        if c == "\\" and i + 1 < n:
            nxt = s[i + 1]
            if nxt in _QSETTINGS_ESCAPES:
                out.append(_QSETTINGS_ESCAPES[nxt]); i += 2; continue
            if nxt == "x":
                hexd = s[i + 2:i + 4]
                if len(hexd) == 2 and all(ch in "0123456789abcdefABCDEF" for ch in hexd):
                    out.append(chr(int(hexd, 16))); i += 4; continue
            out.append(c); i += 1; continue
        out.append(c); i += 1
    return "".join(out)


def clean_comment(value):
    """MO2 stores the meta.ini 'comments=' note via Qt QSettings, which wraps the value in double
       quotes and backslash-escapes it whenever it contains a special char (comma, quote, …). Strip
       the surrounding pair and reverse the escaping (F-13) so quotes/backslashes/newlines survive
       intact; return '' for an empty/whitespace note so it's simply skipped."""
    value = value.strip()
    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        return _qsettings_unescape(value[1:-1]).strip()
    return value.strip()


# Hostnames a legitimate local request may carry in its Host / Origin header. A page on a
# DNS-rebound attacker domain sends that domain here instead — see the Host/Origin guard in
# the handler (F-1). urllib's .hostname and our request_hostname() both return these unbracketed.
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


class PathRejected(Exception):
    """A ?base=/?instance= override pointed outside the configured roots, or held a null byte."""


def request_hostname(host_header):
    """The hostname portion of a Host header, lowercased and unbracketed:
       '127.0.0.1:8000' -> '127.0.0.1', 'localhost' -> 'localhost', '[::1]:8000' -> '::1'."""
    host = (host_header or "").strip().lower()
    if host.startswith("["):                    # IPv6 literal: [::1] or [::1]:8000
        return host[1:host.index("]")] if "]" in host else host[1:]
    return host.rsplit(":", 1)[0] if ":" in host else host


def confine_or_default(value, root):
    """Resolve a caller-supplied path override against a configured root.
       - blank override            -> the root itself (the normal case; no override sent)
       - override inside the root  -> its realpath (equality-or-descendant, case-insensitively)
       - null byte, or escaping .. -> None (caller turns this into a 400)
       Confining to the configured root turns the API from a general path oracle into a bounded
       reader of the user's own MO2 tree. To point at a different install, change MO2_BASE /
       MO2_INSTANCE (constant or env var) — the server operator's decision, not a URL parameter."""
    root_real = os.path.realpath(root)
    value = (value or "").strip()
    if not value:
        return root_real
    if "\x00" in value:
        return None
    cand = os.path.realpath(value)
    root_nc = os.path.normcase(root_real)
    cand_nc = os.path.normcase(cand)
    if cand_nc == root_nc or cand_nc.startswith(root_nc + os.sep):
        return cand
    return None


def resolve_paths(query):
    """Return (base_dir, instance_dir, categories_dat) for this request. The app may send
       ?base=<Base Directory> and ?instance=<Instance path>; either falls back to its default and
       is confined to the configured root (raises PathRejected otherwise — see confine_or_default).
       categories.dat lives in the instance folder; if it isn't there, a portable copy in the
       base folder is tried before giving up (load_category_ids then uses the built-in map)."""
    base = confine_or_default((query.get("base") or [""])[0], MO2_BASE)
    instance = confine_or_default((query.get("instance") or [""])[0], MO2_INSTANCE)
    if base is None or instance is None:
        raise PathRejected()
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
    """Read each mods/<mod>/meta.ini by path (only ~one file per mod, no recursive asset scan) and
       return (categories, comments, category_count):
         categories -> { mod folder name: resolved category name }   (from 'category=')
         comments   -> { mod folder name: note text }                (from 'comments=', non-empty only)"""
    id_map = load_category_ids(cat_path)
    cats, comments = {}, {}
    moddir = os.path.join(base, "mods")
    try:
        entries = os.listdir(moddir)
    except OSError:
        return cats, comments, len(id_map)
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
        if m:
            primary = m.group(1).split(",")[0].strip()
            if primary and primary not in ("-1", "0"):
                cats[d] = id_map.get(primary, "Category " + primary)
        cm = COMMENT_LINE_RE.search(txt)
        if cm:
            note = clean_comment(cm.group(1))
            if note:
                comments[d] = note
    return cats, comments, len(id_map)


class Handler(http.server.SimpleHTTPRequestHandler):
    # Don't advertise "SimpleHTTP/0.6 Python/x.y" — no need to fingerprint the service (N-5).
    server_version = "modlist-planner"
    sys_version = ""
    # Per-request socket timeout so a stalled client can't wedge its worker thread (F-12).
    timeout = 30

    def __init__(self, *a, **k):
        super().__init__(*a, directory=WEBROOT, **k)

    def end_headers(self):
        # A second barrier for a cross-origin embedder even if the Host/Origin guard is ever
        # bypassed: browsers refuse to hand this response to a document of another origin.
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        # Don't cache anything: API responses carry live MO2 data, and static assets change during
        # development — a stale cached .js otherwise silently runs old code after an edit.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _is_local_request(self):
        """DNS-rebinding / cross-origin defense (F-1). The no-CORS posture does NOT survive DNS
           rebinding: after a malicious site rebinds its domain to 127.0.0.1, its page is
           same-origin to us and can read our JSON. But such a request still carries the attacker
           domain in Host (and Origin), whereas genuine local use carries localhost/127.0.0.1.
           Emit 403 and return False for anything else; this gates static files too, so the
           whole-repo exposure (F-4) can't be pulled cross-origin either."""
        if request_hostname(self.headers.get("Host")) not in LOCAL_HOSTS:
            self._json({"error": "forbidden"}, 403)
            return False
        origin = self.headers.get("Origin")
        if origin and (urllib.parse.urlparse(origin).hostname or "").lower() not in LOCAL_HOSTS:
            self._json({"error": "forbidden"}, 403)
            return False
        return True

    def _paths_or_400(self, query):
        """resolve_paths(query), or send a generic 400 and return None if an override was rejected
           (outside the configured root, or a null byte — F-1 confinement / F-9)."""
        try:
            return resolve_paths(query)
        except PathRejected:
            self._json({"error": "path not allowed"}, 400)
            return None

    def _resolve_profile(self, base, query):
        """Return (profile, profiles) with the requested profile validated, or (None, profiles)."""
        profiles = list_profiles(base)
        profile = (query.get("profile") or [""])[0] or (profiles[0] if profiles else "")
        return (profile if profile in profiles else None), profiles

    def _static_blocked(self, url_path):
        """The webroot is the whole repo, so static serving must not hand out anything but the app
           itself (F-4). Block any path segment that is a dot-entry (.git, .gitignore, …), the
           private/ data dir, __pycache__, or any server-side source/cache/config file. Only the
           planner's own files (index.html, styles.css, js/*, the example config) get through."""
        segments = [s for s in urllib.parse.unquote(url_path).replace("\\", "/").split("/") if s]
        for s in segments:
            low = s.lower()
            if s.startswith(".") or low in ("private", "__pycache__"):
                return True
            if low.endswith((".py", ".pyc")) or low == "mo2-config.json":
                return True
        return False

    def list_directory(self, path):
        # No directory indexes — a bare directory URL should not enumerate the tree (F-4).
        self.send_error(404, "Not found")
        return None

    def do_GET(self):
        if not self._is_local_request():
            return
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/api/profiles":
            pr = self._paths_or_400(query)
            if pr is None:
                return
            base, instance, cat = pr
            return self._json({
                "profiles": list_profiles(base),
                "base": base,
                "instance": instance,
                "categoriesDat": cat,
                "baseFound": os.path.isdir(base),
                "categoriesFound": os.path.isfile(cat),
                # Home paths are still returned (the app uses them as dialog placeholders), but only
                # to a caller that clears the Host/Origin guard above — closes F-11's remote reach.
                "defaults": {"base": MO2_BASE, "instance": MO2_INSTANCE},
            })

        if parsed.path == "/api/modlist":
            pr = self._paths_or_400(query)
            if pr is None:
                return
            base, _, _ = pr
            profile, profiles = self._resolve_profile(base, query)
            if profile is None:
                return self._json({"error": "profile not found", "profiles": profiles}, 404)
            try:
                return self._json({"profile": profile, "modlist": read_modlist(base, profile)})
            except OSError as e:
                # Generic client message; keep the path-bearing detail server-side only (F-10).
                sys.stderr.write(f"[modlist] {e}\n")
                return self._json({"error": "could not read modlist.txt"}, 500)

        if parsed.path == "/api/sync":
            pr = self._paths_or_400(query)
            if pr is None:
                return
            base, instance, cat = pr
            profile, profiles = self._resolve_profile(base, query)
            if profile is None:
                return self._json({"error": "profile not found", "profiles": profiles}, 404)
            try:
                modlist = read_modlist(base, profile)
            except OSError as e:
                sys.stderr.write(f"[sync] {e}\n")
                return self._json({"error": "could not read modlist.txt"}, 500)
            cats, comments, cat_count = read_mod_categories(base, cat)
            return self._json({
                "profile": profile,
                "modlist": modlist,
                "categories": cats,
                "comments": comments,
                "modsWithCategory": len(cats),
                "modsWithNote": len(comments),
                "categoryCount": cat_count,
            })

        if self._static_blocked(parsed.path):
            return self.send_error(404, "Not found")
        return super().do_GET()

    def log_message(self, *args):
        pass  # keep the console quiet


def _base_status():
    if not MO2_BASE:
        return "(not set - set MO2_BASE / mo2-config.json, or use the app's Instance dialog)"
    return "(found)" if os.path.isdir(MO2_BASE) else "(NOT FOUND - check the path)"


def _instance_status(cat):
    if not MO2_INSTANCE:
        return "(not set - built-in default category map will be used)"
    return "(categories.dat found)" if os.path.isfile(cat) else "(no categories.dat - built-in default map used)"


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:                                       # N-3: validate the port argument
        arg = sys.argv[1]
        if not (arg.isdigit() and 0 < int(arg) < 65536):
            print(f"invalid port {arg!r} - give a whole number 1-65535 (default {DEFAULT_PORT})")
            return
        port = int(arg)
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    try:                                                        # N-3: report a taken port cleanly
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError as e:
        print(f"could not bind 127.0.0.1:{port} - {e}")
        return
    with httpd:
        cat = os.path.join(MO2_INSTANCE, "categories.dat") if MO2_INSTANCE else ""
        print(f"Modlist Planner + MO2 sync  ->  http://localhost:{port}")
        print(f"  base directory : {MO2_BASE or '(unset)'}  {_base_status()}")
        print(f"  instance path  : {MO2_INSTANCE or '(unset)'}  {_instance_status(cat)}")
        print("  Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()

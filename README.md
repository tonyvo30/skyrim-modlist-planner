# Skyrim Modlist Dependency Planner

A static, single-page dependency planner for a Skyrim SE 1.5.97 modlist. Cytoscape
dependency graph with categories, hierarchy levels, any-of (OR) requirements,
symmetric conflicts, MO2 import/reconcile with a per-separator picker, and a
severity-filtered message panel.

Migrated from a Claude artifact to a plain multi-file static app that runs locally
and is version-controlled.

## Run locally

No build step. Serve the folder over HTTP (needed because it loads `js/*` and fonts):

```
python -m http.server 8000
```

then open http://localhost:8000/ . (Opening `index.html` directly via `file://`
mostly works but a local server avoids fetch/CORS quirks.)

## Data & persistence

- The mod graph lives in your **browser** (`localStorage` key `skyrim-deps-v1`) —
  it is **not** committed to this repo (git-ignored under `private/`).
- **Back up or move between devices** with **Export JSON** (downloads a file) and
  **Import JSON** (Replace catalog).
- Seed your graph from a Mod Organizer 2 profile with **Import MO2** (`modlist.txt`),
  choosing which separators to include.

## Layout

- `index.html` — shell + markup, loads `styles.css` and the `js/*` modules in order.
- `styles.css` — all styles.
- `js/10-categories.js` … `js/99-boot.js` — plain (non-module) scripts sharing global
  scope, loaded in dependency order; `99-boot.js` runs last.

## External dependencies (CDN)

- Cytoscape 3.30.2 (cdnjs)
- Google Fonts: Cinzel, IBM Plex Sans, IBM Plex Mono

# Skyrim Modlist Dependency Planner

A static, single-page dependency planner for a Skyrim SE 1.5.97 modlist. Cytoscape
dependency graph with categories, hierarchy levels, any-of (OR) requirements,
symmetric conflicts, MO2 import/reconcile with a per-separator picker, and a
severity-filtered message panel.

Migrated from a Claude artifact to a plain multi-file static app that runs locally
and is version-controlled.

## Run locally

No build step. Two ways to serve the folder over HTTP (needed because it loads
`js/*` and fonts):

- **`python serve.py`** (recommended) — serves the app **and** the read-only
  `/api/*` endpoints that power one-click **Sync from MO2**. Defaults to port 8000
  (`python serve.py 8080` for another). It reads your MO2 files by path; tell it
  where they are with a `mo2-config.json` (copy `mo2-config.example.json`) or the
  `MO2_BASE` / `MO2_INSTANCE` env vars, or set them later in the app's **Paths**
  dialog. It binds `127.0.0.1` only.
- **`python -m http.server 8000`** — plain static serving. The app works, but the
  **Sync from MO2** button stays hidden (no `/api`); **Import MO2** still works.

Both default to port 8000, so run only one at a time. Then open
http://localhost:8000/ . (Opening `index.html` via `file://` mostly works, but a
local server avoids fetch/CORS quirks and is required for Sync.)

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

Pinned versions, loaded with Subresource Integrity and constrained by a
Content-Security-Policy `<meta>` in `index.html`:

- Cytoscape 3.30.2 (cdnjs)
- fcose layout: layout-base 2.0.1, cose-base 2.2.0, cytoscape-fcose 2.2.0 (jsdelivr)
- Google Fonts: Cinzel, IBM Plex Sans, IBM Plex Mono

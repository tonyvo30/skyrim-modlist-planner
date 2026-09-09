# -*- coding: utf-8 -*-
# One-time splitter: rev31 single-file artifact -> multi-file static app (index.html + styles.css + js/*).
import os
SRC = r"C:\Users\USER\AppData\Local\Temp\claude\C--Users-USER-Desktop-Skyrim-Mod-Planning\41da047b-aede-46d4-adcd-f46f42d75b06\scratchpad\planner_rev31.html"
ROOT = r"C:\Users\USER\Desktop\Skyrim Mod Planning\skyrim-modlist-planner"
html = open(SRC, encoding="utf-8").read()

def rep(old, new, n=1):
    global html
    c = html.count(old)
    assert c == n, f"expected {n}, got {c} for: {old[:60]!r}"
    html = html.replace(old, new)

# ---- header: drop the artifact 'sync revNN' tag ----
rep('<span class="tag">Skyrim SE · 1.5.97 · sync rev31</span>',
    '<span class="tag">Skyrim SE · 1.5.97</span>')

# ---- persistence: drop Claude db, keep localStorage only ----
rep(
'''function persist(){
  state.updatedAt=Date.now();saveLocal();
  if(db&&docRef){
    // Capture the payload NOW, at edit time — a later state change can't alter what this write sends.
    const mods=JSON.parse(JSON.stringify(state.mods));
    const at=state.updatedAt;
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{docRef.set({mods,updatedAt:at,writer:myWriter}).then(()=>{lastSynced=JSON.stringify(mods);}).catch(()=>{});},250);
  }
}''',
'''function persist(){
  state.updatedAt=Date.now();saveLocal();
}''')

rep(
'''async function initPersistence(){
  // instant: localStorage
  try{const ls=localStorage.getItem("skyrim-deps-v1");if(ls){const p=JSON.parse(ls);if(p&&Array.isArray(p.mods)){state=p;migrateMods(state.mods);render(true);}}}catch(e){}
  const d=await safeUse("db");
  if(!d){setPersistBadge("local");return;}
  db=d;docRef=db.doc("state/catalog");
  try{
    const snap=await docRef.get();
    if(snap.exists){const data=snap.data();if(data&&Array.isArray(data.mods)){state={mods:clone(data.mods),updatedAt:data.updatedAt||0};migrateMods(state.mods);lastSynced=JSON.stringify(state.mods);render(true);saveLocal();}}  // clone: db snapshots are frozen; state must be mutable
    else{lastSynced=JSON.stringify(state.mods);await docRef.set({mods:state.mods,updatedAt:state.updatedAt||Date.now(),writer:myWriter});}
    setPersistBadge("synced");
  }catch(e){setPersistBadge("local");return;}
  // Deliberately NO live onSnapshot that overwrites local state. Local edits are
  // authoritative for this session; the latest server copy is fetched once on load
  // (get() above), and every edit persists via set(). This makes editing revert-proof.
  // Cross-device changes show up on next open rather than live — a fine trade for a
  // single-user planner, and it removes any chance of a background sync stomping an edit.
}''',
'''function initPersistence(){
  // localStorage is the store: load any saved graph, else keep the seed catalog.
  // Back up / move between devices with Export/Import JSON.
  try{const ls=localStorage.getItem("skyrim-deps-v1");if(ls){const p=JSON.parse(ls);if(p&&Array.isArray(p.mods)){state=p;migrateMods(state.mods);render(true);}}}catch(e){}
  setPersistBadge("local");
}''')

# safeUse no longer needed
rep('async function safeUse(name){try{if(window.claude&&claude.use)return await claude.use(name);}catch(e){}return null;}\n', '')

# ---- export: real browser download instead of the sandbox downloads capability ----
rep(
'''document.getElementById("json-action").onclick=async()=>{
  if(jsonMode==="export"){
    const data=JSON.stringify(state.mods,null,2);
    const dl=await safeUse("downloads");
    if(dl){try{await dl.save({filename:"skyrim-modlist-deps.json",data});toast("Saved");}catch(e){toast("Save cancelled");}}
    else{navigator.clipboard&&navigator.clipboard.writeText(data);toast("Downloads unavailable — copied to clipboard");}
  }else{''',
'''document.getElementById("json-action").onclick=()=>{
  if(jsonMode==="export"){
    const data=JSON.stringify(state.mods,null,2);
    const blob=new Blob([data],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="skyrim-modlist-deps.json";
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    toast("Downloaded");
  }else{''')

# ============ split into css / body / js ============
pre_style, rest = html.split("<style>", 1)
css, rest2 = rest.split("</style>", 1)
body, script_part = rest2.split("<script>", 1)
js = script_part.split("</script>", 1)[0]

# preserve the [hidden] + img behaviour the artifact skeleton used to provide
css = "[hidden]{display:none!important}\nimg{max-width:100%}\n" + css.strip() + "\n"

# ---- split js by the section-banner comments ----
files = [
  ("js/10-categories.js", "/* ---------- category metadata ---------- */"),
  ("js/20-catalog.js",    "/* ---------- seed catalog: the Phase 1 foundation, pre-wired ---------- */"),
  ("js/30-state.js",      "/* ---------- state ---------- */"),
  ("js/40-validate.js",   "/* ---------- upstream / transitive dependency analysis ---------- */"),
  ("js/50-render.js",     "/* ---------- rendering ---------- */"),
  ("js/60-inspector.js",  "/* ---------- inspector ---------- */"),
  ("js/70-graph.js",      "/* ---------- graph ---------- */"),
  ("js/80-ui.js",         "/* ---------- tabs ---------- */"),
  ("js/85-import.js",     "/* ---------- import MO2 ---------- */"),
  ("js/90-io-persist.js", "/* export / import JSON */"),
  ("js/99-boot.js",       "/* ---------- boot ---------- */"),
]
idx = []
for fn, banner in files:
    assert js.count(banner) == 1, f"banner not unique/found: {banner!r} count={js.count(banner)}"
    idx.append((fn, js.index(banner)))
# ensure monotonically increasing (files are in file order)
for i in range(1, len(idx)):
    assert idx[i][1] > idx[i-1][1], f"order broken at {files[i][0]}"
parts = {}
for i,(fn,start) in enumerate(idx):
    end = idx[i+1][1] if i+1 < len(idx) else len(js)
    parts[fn] = js[start:end].strip("\n")

# ============ write files ============
os.makedirs(os.path.join(ROOT, "js"), exist_ok=True)
open(os.path.join(ROOT, "styles.css"), "w", encoding="utf-8").write(css)
for fn, _ in files:
    open(os.path.join(ROOT, fn), "w", encoding="utf-8").write(parts[fn] + "\n")

script_tags = "\n".join(f'<script src="{fn}"></script>' for fn,_ in files)
index = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Modlist Dependency Planner</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="styles.css">
</head>
<body>
{body.strip()}
<script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.2/cytoscape.min.js"></script>
{script_tags}
</body>
</html>
'''
open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(index)

# .gitignore keeps the private export out of the public repo
open(os.path.join(ROOT, ".gitignore"), "w", encoding="utf-8").write("private/\n")

print("styles.css:", len(css), "bytes")
for fn,_ in files:
    p = parts[fn]
    print(f"  {fn}: {p.count(chr(10))+1} lines, {len(p)} bytes")
print("index.html:", len(index), "bytes")

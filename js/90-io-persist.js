/* export / import JSON */
const mJson=document.getElementById("modal-json");
let jsonMode="export";
document.getElementById("btn-export").onclick=()=>{
  jsonMode="export";
  document.getElementById("json-title").textContent="Export catalog";
  document.getElementById("json-desc").textContent="Copy this as a backup, or drop it into version control next to your modlist. “Save file” downloads it.";
  document.getElementById("json-text").value=JSON.stringify(state.mods,null,2);
  document.getElementById("json-text").readOnly=true;
  document.getElementById("json-action").textContent="Save file";
  mJson.classList.add("show");
};
document.getElementById("btn-importjson").onclick=()=>{
  jsonMode="import";
  document.getElementById("json-title").textContent="Import catalog JSON";
  document.getElementById("json-desc").textContent="Paste a previously exported catalog. This REPLACES the current catalog.";
  document.getElementById("json-text").value="";
  document.getElementById("json-text").readOnly=false;
  document.getElementById("json-action").textContent="Replace catalog";
  mJson.classList.add("show");
};
document.getElementById("json-cancel").onclick=()=>mJson.classList.remove("show");
document.getElementById("json-action").onclick=()=>{
  if(jsonMode==="export"){
    const data=JSON.stringify(state.mods,null,2);
    const blob=new Blob([data],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="skyrim-modlist-deps.json";
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    if(persistBlocked){persistBlocked=false;toast("Downloaded — editing is safe again; new changes will save.");}  // backup taken, release the corrupt-store hold (F-8)
    else toast("Downloaded");
  }else{
    let parsed;
    try{parsed=JSON.parse(document.getElementById("json-text").value);}
    catch(e){toast("Invalid JSON");return;}
    const res=normalizeImportedCatalog(parsed);
    if(res.error){toast("Import rejected: "+res.error);return;}
    state.mods=migrateMods(res.mods);
    persistBlocked=false;                       // a deliberate replace clears any corrupt-store hold (F-8)
    mJson.classList.remove("show");selected=null;editing=null;persist();render(true);
    toast(`Catalog replaced — ${state.mods.length} mods`);
  }
};
// Validate + normalize a parsed Import-JSON payload before it can touch state.mods (F-6). A shared
// catalog file is the app's primary delivery path, so a malformed or hostile one must not brick the
// UI: reject non-objects, coerce every field to its expected shape, re-slug + de-duplicate ids
// (hostile ids are already neutralised by slugId, F-2), and drop malformed relation refs. Returns
// {mods} on success or {error} to refuse the import without replacing the current catalog.
function normalizeImportedCatalog(parsed){
  if(!Array.isArray(parsed)) return {error:"expected a JSON array of mods"};
  const REL=["requires","conflicts","loadAfter","patchFor"];
  const cleaned=[], usedIds=new Set();
  for(let i=0;i<parsed.length;i++){
    const raw=parsed[i];
    if(!raw||typeof raw!=="object"||Array.isArray(raw)) return {error:`entry #${i+1} is not an object`};
    const m=Object.assign({},raw);
    m.name=(typeof m.name==="string"?m.name:m.name==null?"":String(m.name)).trim()||"Untitled mod";
    m.id=slugId(m.id);                                  // valid grammar + non-empty (F-2)
    while(usedIds.has(m.id))m.id+="-2";                 // no duplicate ids (would throw in cy.add)
    usedIds.add(m.id);
    m.cat=typeof m.cat==="string"?m.cat:"other";
    m.type=typeof m.type==="string"?m.type:"skse-dll";
    m.pin=typeof m.pin==="string"?m.pin:"";
    m.note=typeof m.note==="string"?m.note:"";
    ["enabled","adult","external","needsReview"].forEach(k=>{m[k]=!!m[k];});
    REL.forEach(k=>{m[k]=Array.isArray(m[k])?m[k].filter(r=>r&&typeof r==="object"&&r.k==="mod"&&typeof r.ref==="string").map(r=>({k:"mod",ref:r.ref})):[];});
    m.anyOf=Array.isArray(m.anyOf)?m.anyOf.filter(g=>g&&typeof g==="object").map(g=>({mods:Array.isArray(g.mods)?g.mods.filter(x=>typeof x==="string"):[],exclusive:!!g.exclusive})):[];
    cleaned.push(m);
  }
  return {mods:cleaned};
}

/* toast */
let toastTimer;
function toast(msg){
  let t=document.getElementById("__toast");
  if(!t){t=document.createElement("div");t.id="__toast";
    t.style.cssText="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#19232d;border:1px solid #25333f;color:#e7edf3;padding:9px 16px;border-radius:9px;font-size:13px;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.4)";document.body.appendChild(t);}
  t.textContent=msg;t.style.opacity="1";clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.style.opacity="0",2200);
}

/* ---------- persistence ---------- */
// Set when the stored blob was found corrupt on load: refuse to overwrite it (the seed would
// otherwise clobber the recoverable data on the next save) until the user Exports or does a
// deliberate Import-replace — both clear this (F-8).
let persistBlocked=false;
let saveFailWarned=false;   // one-shot so a full-quota store doesn't toast on every keystroke
function saveLocal(){
  if(persistBlocked)return false;
  try{
    localStorage.setItem("skyrim-deps-v1",JSON.stringify(state));
    saveFailWarned=false;setPersistBadge("local");return true;
  }catch(e){
    // quota exceeded or storage unavailable — the change is NOT persisted; say so once (F-8)
    setPersistBadge("error");
    if(!saveFailWarned){saveFailWarned=true;toast("Save failed — browser storage is full or blocked. Export JSON to keep your changes.");}
    return false;
  }
}
function setPersistBadge(mode){const p=document.getElementById("persist");const t=document.getElementById("persist-t");if(!p||!t)return;
  p.classList.remove("local","error");
  if(mode==="error"){p.classList.add("error");t.textContent="not saved";}
  else{p.classList.add("local");t.textContent="local only";}}
function persist(){
  state.updatedAt=Date.now();saveLocal();
}
function initPersistence(){
  // localStorage is the store: load any saved graph, else keep the seed catalog.
  // Back up / move between devices with Export/Import JSON.
  let raw=null;
  try{raw=localStorage.getItem("skyrim-deps-v1");}catch(e){ setPersistBadge("local"); return; }  // storage unreadable (private mode) — run on the seed, nothing to clobber
  if(raw){
    let p=null,bad=false;
    try{p=JSON.parse(raw);}catch(e){bad=true;}
    if(bad||!p||!Array.isArray(p.mods)){
      // Corrupt/foreign blob: keep the in-memory seed for display but do NOT let persist() overwrite
      // the stored copy — the user may be able to recover it. Export (or Import-replace) releases this.
      persistBlocked=true;setPersistBadge("error");
      toast("Saved data couldn't be read — showing the default catalog. Your stored copy is left intact; Export before editing to be safe.");
      return;
    }
    state=p;migrateMods(state.mods);render(true);
  }
  setPersistBadge("local");
}

/* ---------- util ---------- */
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

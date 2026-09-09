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
    toast("Downloaded");
  }else{
    try{const parsed=JSON.parse(document.getElementById("json-text").value);
      if(!Array.isArray(parsed))throw 0;
      state.mods=migrateMods(parsed.map(m=>Object.assign({requires:[],conflicts:[],loadAfter:[],enabled:true,cat:"other",type:"skse-dll"},m)));
      mJson.classList.remove("show");selected=null;editing=null;persist();render(true);toast("Catalog replaced");
    }catch(e){toast("Invalid JSON");}
  }
};

/* toast */
let toastTimer;
function toast(msg){
  let t=document.getElementById("__toast");
  if(!t){t=document.createElement("div");t.id="__toast";
    t.style.cssText="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#19232d;border:1px solid #25333f;color:#e7edf3;padding:9px 16px;border-radius:9px;font-size:13px;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.4)";document.body.appendChild(t);}
  t.textContent=msg;t.style.opacity="1";clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.style.opacity="0",2200);
}

/* ---------- persistence ---------- */
function saveLocal(){try{localStorage.setItem("skyrim-deps-v1",JSON.stringify(state));}catch(e){}}
function setPersistBadge(mode){const p=document.getElementById("persist");const t=document.getElementById("persist-t");
  p.classList.remove("synced","local");if(mode==="synced"){p.classList.add("synced");t.textContent="synced";}else{p.classList.add("local");t.textContent="local only";}}
function persist(){
  state.updatedAt=Date.now();saveLocal();
}
function initPersistence(){
  // localStorage is the store: load any saved graph, else keep the seed catalog.
  // Back up / move between devices with Export/Import JSON.
  try{const ls=localStorage.getItem("skyrim-deps-v1");if(ls){const p=JSON.parse(ls);if(p&&Array.isArray(p.mods)){state=p;migrateMods(state.mods);render(true);}}}catch(e){}
  setPersistBadge("local");
}

/* ---------- util ---------- */
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

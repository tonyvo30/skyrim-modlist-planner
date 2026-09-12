/* ---------- one-click MO2 sync via serve.py -------------------------------------------------
   The planner page can't read local files by path (browser sandbox), so this talks to the small
   local server in serve.py, which reads the MO2 instance by path and returns JSON:
     GET /api/profiles          -> { profiles:[...], instance }
     GET /api/sync?profile=Name -> { profile, modlist (raw text), categories:{modFolder:catName}, ... }
   "Sync from MO2" then merges exactly like Import → Merge/update: new mods added (flagged
   needs-review) with their real category, existing mods refreshed (enabled state + category).
   The whole feature auto-hides unless the /api endpoints answer, so opening the page from a
   plain file server or file:// simply shows the normal Import MO2 flow instead.
   Reuses helpers from earlier files (parseMO2, resolveTemplate, buildEntry, catFromMeta,
   metaCatByName, saveMetaCat, ikey), so it must load after them. */

let mo2Available=false;      // did the serve.py /api endpoints answer?
let mo2Profiles=[];          // profile names from the server
let mo2Profile="";           // selected profile
let mo2Defaults={base:"",instance:""};   // serve.py's baked-in default paths (for placeholders)
function saveMo2Profile(){try{localStorage.setItem("skyrim-planner-mo2profile",mo2Profile);}catch(e){}}
function loadMo2Profile(){try{mo2Profile=localStorage.getItem("skyrim-planner-mo2profile")||"";}catch(e){}}

// Path overrides. Base Directory = the folder with mods\/profiles\/downloads\; Instance path =
// the folder with categories.dat. Blank = use serve.py's baked-in defaults. Sent to every /api call.
let mo2BaseDir="", mo2InstancePath="";
function loadMo2Paths(){try{mo2BaseDir=localStorage.getItem("skyrim-planner-mo2base")||"";mo2InstancePath=localStorage.getItem("skyrim-planner-mo2instance")||"";}catch(e){}}
function saveMo2Paths(){try{localStorage.setItem("skyrim-planner-mo2base",mo2BaseDir);localStorage.setItem("skyrim-planner-mo2instance",mo2InstancePath);}catch(e){}}
// build an /api URL carrying the path overrides (and any extra params)
function mo2ApiUrl(path,extra){
  const p=new URLSearchParams(extra||{});
  if(mo2BaseDir.trim()) p.set("base",mo2BaseDir.trim());
  if(mo2InstancePath.trim()) p.set("instance",mo2InstancePath.trim());
  const qs=p.toString();
  return path+(qs?("?"+qs):"");
}
// serve.py runs over http(s) on localhost; a file:// page can't reach it, so sync is unavailable there.
function mo2ServedContext(){return location.protocol==="http:"||location.protocol==="https:";}

// which separator groups Sync includes: { [separatorName|NOSEP_KEY]: bool }. Persisted, so a
// one-click Sync honours the choices you set in the Separators… dialog. Untouched groups default
// to included, except Output/WIP which default to skipped (same rule as the Import picker).
let mo2SepChoice={};
function saveMo2SepChoice(){try{localStorage.setItem("skyrim-planner-mo2sepchoice",JSON.stringify(mo2SepChoice));}catch(e){}}
function loadMo2SepChoice(){try{const r=localStorage.getItem("skyrim-planner-mo2sepchoice");if(r)mo2SepChoice=JSON.parse(r)||{};}catch(e){}}
function mo2SepIncluded(key){
  if(key in mo2SepChoice) return mo2SepChoice[key]!==false;
  return key===NOSEP_KEY ? true : !DEFAULT_SKIP_SEP_RE.test(key);
}
// Build the include-set parseMO2 expects, from the persisted choices applied to this modlist.
function mo2SepSet(modlistText){
  const {seps,noSepCount}=parseMO2Grouped(modlistText);
  const selected=new Set();
  seps.forEach(s=>{ if(mo2SepIncluded(s.name)) selected.add(s.name); });
  if(noSepCount && mo2SepIncluded(NOSEP_KEY)) selected.add(NOSEP_KEY);
  return selected;
}

// probe the server on boot; show the sync controls only if it's the serve.py backend
async function mo2Init(){
  loadMo2Profile();
  loadMo2SepChoice();
  loadMo2Paths();
  // file:// can't talk to serve.py — disable sync outright (no failed fetch, no console noise)
  if(!mo2ServedContext()){ mo2Available=false; updateMo2UI(); return; }
  try{
    const resp=await fetch(mo2ApiUrl("/api/profiles"),{cache:"no-store"});
    if(!resp.ok) throw new Error("no api");
    const data=await resp.json();
    if(!Array.isArray(data.profiles)) throw new Error("bad api");
    mo2Available=true;
    mo2Profiles=data.profiles;
    if(data.defaults) mo2Defaults=data.defaults;
    if(mo2Profiles.length && !mo2Profiles.includes(mo2Profile)) mo2Profile=mo2Profiles[0];
  }catch(e){
    mo2Available=false;   // plain static server (no serve.py) — no sync, Import MO2 still works
  }
  updateMo2UI();
}

async function mo2Sync(){
  if(!mo2Available){toast("Run the planner with serve.py to enable Sync");return;}
  if(!mo2Profile){toast("No MO2 profile to sync");return;}
  const syncBtn=document.getElementById("mo2-sync"), prevLabel=syncBtn?syncBtn.textContent:"";
  if(syncBtn){syncBtn.disabled=true;syncBtn.textContent="Syncing…";}
  try{
    const resp=await fetch(mo2ApiUrl("/api/sync",{profile:mo2Profile}),{cache:"no-store"});
    const data=await resp.json();
    if(!resp.ok||data.error){toast("Sync failed — "+(data.error||("HTTP "+resp.status)));return;}

    // categories: { modFolderName: categoryName } -> the same remembered map Import uses
    const cats=data.categories||{};
    Object.keys(cats).forEach(name=>{ metaCatByName[ikey(name)]=cats[name]; });
    saveMetaCat();

    const entries=parseMO2(data.modlist||"", mo2SepSet(data.modlist||""));   // honour the Separators… choices
    if(!entries.length){toast("That profile's modlist is empty (after separator filtering)");return;}

    // merge — identical rules to Import → Merge/update
    let added=0,updated=0;
    entries.forEach(({name,enabled})=>{
      const template=resolveTemplate(name);
      const existing=template?state.mods.find(m=>m.id===template.id):state.mods.find(m=>ikey(m.name)===ikey(name));
      if(existing){existing.enabled=enabled;const metaCat=catFromMeta(name);if(metaCat)existing.cat=metaCat;updated++;}
      else{state.mods.push(buildEntry(name,enabled,false));added++;}
    });
    selected=null;editing=null;persist();render(true);
    toast(`Synced ${data.profile} — ${added} new, ${updated} updated · ${data.modsWithCategory||0} categories`);
  }catch(e){
    console.error("MO2 sync failed",e);
    toast("Sync failed — "+(e&&e.message||"network error"));
  }finally{
    if(syncBtn){syncBtn.disabled=false;syncBtn.textContent=prevLabel||"Sync from MO2";}
  }
}

function updateMo2UI(){
  const wrap=document.getElementById("mo2sync"); if(!wrap)return;
  wrap.hidden=!mo2Available;
  const profileSel=document.getElementById("mo2-profile");
  if(profileSel && mo2Available)
    profileSel.innerHTML=mo2Profiles.map(p=>`<option value="${esc(p)}"${p===mo2Profile?" selected":""}>${esc(p)}</option>`).join("");
}

/* ---- Separators… dialog: which separator groups Sync includes ---- */
// Render the checklist for a modlist into #mo2sep-list (reuses the Import picker's styling).
function renderMo2SepList(modlistText){
  const box=document.getElementById("mo2sep-list"); if(!box)return;
  const {seps,noSepCount}=parseMO2Grouped(modlistText);
  const keys=seps.map(s=>({key:s.name,label:s.name,count:s.count}));
  if(noSepCount)keys.push({key:NOSEP_KEY,label:"(no separator — bottom of list)",count:noSepCount});
  if(!keys.length){box.innerHTML=`<div class="hint">This profile has no separators.</div>`;return;}
  const on=keys.filter(k=>mo2SepIncluded(k.key)).length;
  box.innerHTML=`<div class="sep-pick-head">Separator groups <span class="hint">${on}/${keys.length} · unchecked skipped</span><span class="sep-pick-ctl"><button type="button" class="btn" data-sp="all">All</button><button type="button" class="btn" data-sp="none">None</button></span></div><div class="sep-pick-list">`+keys.map(k=>`<label class="sep-pick-row"><input type="checkbox" class="sep-cb" data-key="${esc(k.key)}" ${mo2SepIncluded(k.key)?"checked":""}><span class="sep-nm">${esc(k.label)}</span><span class="sep-ct">${k.count}</span></label>`).join("")+`</div>`;
  box.querySelectorAll(".sep-cb").forEach(cb=>cb.onchange=()=>{mo2SepChoice[cb.dataset.key]=cb.checked;saveMo2SepChoice();renderMo2SepList(modlistText);});
  box.querySelector('[data-sp="all"]').onclick=()=>{keys.forEach(k=>mo2SepChoice[k.key]=true);saveMo2SepChoice();renderMo2SepList(modlistText);};
  box.querySelector('[data-sp="none"]').onclick=()=>{keys.forEach(k=>mo2SepChoice[k.key]=false);saveMo2SepChoice();renderMo2SepList(modlistText);};
}
async function openMo2Seps(){
  if(!mo2Available){toast("Run the planner with serve.py to configure sync");return;}
  const modal=document.getElementById("modal-mo2seps"), box=document.getElementById("mo2sep-list");
  if(box)box.innerHTML=`<div class="hint">Loading ${esc(mo2Profile)}…</div>`;
  if(modal)modal.classList.add("show");
  try{
    const resp=await fetch(mo2ApiUrl("/api/modlist",{profile:mo2Profile}),{cache:"no-store"});
    const data=await resp.json();
    if(!resp.ok||data.error){if(box)box.innerHTML=`<div class="hint">Couldn't load modlist — ${esc(data.error||("HTTP "+resp.status))}</div>`;return;}
    renderMo2SepList(data.modlist||"");
  }catch(e){ if(box)box.innerHTML=`<div class="hint">Couldn't load modlist — ${esc(e&&e.message||"network error")}</div>`; }
}

/* ---- Paths dialog: which MO2 folders Sync reads from ---- */
function openMo2Instance(){
  const modal=document.getElementById("modal-mo2instance"); if(!modal)return;
  const baseInput=document.getElementById("mo2-inst-base"), pathInput=document.getElementById("mo2-inst-path");
  if(baseInput){ baseInput.value=mo2BaseDir; baseInput.placeholder=mo2Defaults.base||"…folder with mods\\ profiles\\ downloads\\"; }
  if(pathInput){ pathInput.value=mo2InstancePath; pathInput.placeholder=mo2Defaults.instance||"…folder with categories.dat"; }
  const bs=document.getElementById("mo2-inst-base-state"), cs=document.getElementById("mo2-inst-cat-state");
  if(bs)bs.textContent=""; if(cs)cs.textContent="";
  modal.classList.add("show");
}
async function saveMo2InstanceDialog(){
  const baseInput=document.getElementById("mo2-inst-base"), pathInput=document.getElementById("mo2-inst-path");
  mo2BaseDir=baseInput?baseInput.value.trim():"";
  mo2InstancePath=pathInput?pathInput.value.trim():"";
  saveMo2Paths();
  // re-probe with the new paths so the profile list + defaults refresh
  const bs=document.getElementById("mo2-inst-base-state"), cs=document.getElementById("mo2-inst-cat-state");
  try{
    const data=await fetch(mo2ApiUrl("/api/profiles"),{cache:"no-store"}).then(r=>r.json());
    mo2Profiles=Array.isArray(data.profiles)?data.profiles:[];
    if(data.defaults)mo2Defaults=data.defaults;
    if(mo2Profiles.length && !mo2Profiles.includes(mo2Profile))mo2Profile=mo2Profiles[0];
    saveMo2Profile(); updateMo2UI();
    if(bs)bs.textContent=data.baseFound?`✓ found · ${mo2Profiles.length} profile${mo2Profiles.length!==1?"s":""}`:"⚠ base directory not found — check the path";
    if(cs)cs.textContent=data.categoriesFound?"✓ categories.dat found":"categories.dat not found here — using the built-in category map";
    if(data.baseFound && mo2Profiles.length){ document.getElementById("modal-mo2instance").classList.remove("show"); toast("Paths set — "+mo2Profiles.length+" profiles"); }
  }catch(e){ if(bs)bs.textContent="⚠ couldn't reach serve.py"; }
}

/* wiring */
(function(){
  const profileSel=document.getElementById("mo2-profile"), syncBtn=document.getElementById("mo2-sync"),
        sepBtn=document.getElementById("mo2-seps"), sepClose=document.getElementById("mo2sep-close"),
        sepModal=document.getElementById("modal-mo2seps"),
        instBtn=document.getElementById("mo2-instance"), instModal=document.getElementById("modal-mo2instance"),
        instCancel=document.getElementById("mo2-inst-cancel"), instSave=document.getElementById("mo2-inst-save");
  if(profileSel)profileSel.onchange=()=>{mo2Profile=profileSel.value;saveMo2Profile();};
  if(syncBtn)syncBtn.onclick=mo2Sync;
  if(sepBtn)sepBtn.onclick=openMo2Seps;
  if(sepClose)sepClose.onclick=()=>{if(sepModal)sepModal.classList.remove("show");};
  if(instBtn)instBtn.onclick=openMo2Instance;
  if(instCancel)instCancel.onclick=()=>{if(instModal)instModal.classList.remove("show");};
  if(instSave)instSave.onclick=saveMo2InstanceDialog;
})();

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
function saveMo2Profile(){try{localStorage.setItem("skyrim-planner-mo2profile",mo2Profile);}catch(e){}}
function loadMo2Profile(){try{mo2Profile=localStorage.getItem("skyrim-planner-mo2profile")||"";}catch(e){}}

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
  try{
    const resp=await fetch("/api/profiles",{cache:"no-store"});
    if(!resp.ok) throw new Error("no api");
    const data=await resp.json();
    if(!Array.isArray(data.profiles)) throw new Error("bad api");
    mo2Available=true;
    mo2Profiles=data.profiles;
    if(mo2Profiles.length && !mo2Profiles.includes(mo2Profile)) mo2Profile=mo2Profiles[0];
  }catch(e){
    mo2Available=false;   // plain static server / file:// — no sync, Import MO2 still works
  }
  updateMo2UI();
}

async function mo2Sync(){
  if(!mo2Available){toast("Run the planner with serve.py to enable Sync");return;}
  if(!mo2Profile){toast("No MO2 profile to sync");return;}
  const syncBtn=document.getElementById("mo2-sync"), prevLabel=syncBtn?syncBtn.textContent:"";
  if(syncBtn){syncBtn.disabled=true;syncBtn.textContent="Syncing…";}
  try{
    const resp=await fetch("/api/sync?profile="+encodeURIComponent(mo2Profile),{cache:"no-store"});
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
    const resp=await fetch("/api/modlist?profile="+encodeURIComponent(mo2Profile),{cache:"no-store"});
    const data=await resp.json();
    if(!resp.ok||data.error){if(box)box.innerHTML=`<div class="hint">Couldn't load modlist — ${esc(data.error||("HTTP "+resp.status))}</div>`;return;}
    renderMo2SepList(data.modlist||"");
  }catch(e){ if(box)box.innerHTML=`<div class="hint">Couldn't load modlist — ${esc(e&&e.message||"network error")}</div>`; }
}

/* wiring */
(function(){
  const profileSel=document.getElementById("mo2-profile"), syncBtn=document.getElementById("mo2-sync"),
        sepBtn=document.getElementById("mo2-seps"), sepClose=document.getElementById("mo2sep-close"),
        sepModal=document.getElementById("modal-mo2seps");
  if(profileSel)profileSel.onchange=()=>{mo2Profile=profileSel.value;saveMo2Profile();};
  if(syncBtn)syncBtn.onclick=mo2Sync;
  if(sepBtn)sepBtn.onclick=openMo2Seps;
  if(sepClose)sepClose.onclick=()=>{if(sepModal)sepModal.classList.remove("show");};
})();

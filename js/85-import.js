/* ---------- import MO2 ---------- */
const mImport=document.getElementById("modal-import");
document.getElementById("mo2-text").addEventListener("input",()=>renderSepPicker("import"));
document.getElementById("rec-text").addEventListener("input",()=>renderSepPicker("rec"));
function ikey(s){return s.toLowerCase().replace(/\.es[pml]$/,"").replace(/[^a-z0-9]/g,"");}
function itype(n){return /\.esm$/i.test(n)?"esm":/\.esl$/i.test(n)?"esl":/\.esp$/i.test(n)?"esp":"skse-dll";}
// Map common MO2 display names onto the known-template ids so they wire up their dependencies.
const IMPORT_ALIASES={
  crashlogger:"crash-logger", addresslibraryallinone:"address-library",
  scrambledbugsspecialedition:"scrambled-bugs", bugfixesssespecialedition:"bugfixes",
  papyrusutilsescriptingutilityfunctions:"papyrusutil",
  backportedextendedeslsupportbees:"bees", backportedextendedeslsupportbeespapyrusscripts:"bees",
  powerofthreespapyrusextender:"po3-papyrus", powerofthreestweaks:"po3-tweaks",
  moreinformativeconsole:"mic", netscriptframework:"net-script", sseenginefixes:"engine-fixes"
};
const TEMPLATE_BY_KEY={};DEFAULT_CATALOG.forEach(t=>{TEMPLATE_BY_KEY[ikey(t.name)]=t;});
function resolveTemplate(name){
  const k=ikey(name), nlow=name.toLowerCase();
  if(IMPORT_ALIASES[k])return DEFAULT_CATALOG.find(t=>t.id===IMPORT_ALIASES[k]);
  if(TEMPLATE_BY_KEY[k])return TEMPLATE_BY_KEY[k];
  for(const t of DEFAULT_CATALOG){if(/^cc/i.test(t.pin||"")&&nlow.includes(t.pin.toLowerCase()))return t;}
  return null;
}
// MO2 category IDs -> names, taken verbatim from the user's MO2 categories.dat (the default
// SkyrimSE set). meta.ini "category=" stores these IDs directly (nexuscatmap.dat is empty, so
// MO2 does no Nexus->MO2 remap), and the primary (first) id wins. Names that have a planner
// KNOWN_CATS equivalent are spelled to match it (so they inherit the curated colour): e.g.
// "Models and Textures", "Bug Fixes", "User Interface", "Visuals and Graphics". Everything else
// keeps its categories.dat name and gets a stable generated colour. Unknown IDs (custom
// categories, or a non-default categories.dat) still fall back to "Category N".
const NEXUS_CAT_IDS={
  "1":"Animations","52":"Poses",
  "2":"Armour","53":"Power Armor",
  "3":"Audio","38":"Music","39":"Voice",
  "5":"Clothing","41":"Jewelry","42":"Backpacks",
  "6":"Collectables","28":"Companions","7":"Creatures Mounts and Vehicles","8":"Factions",
  "9":"Gameplay","27":"Combat","43":"Crafting","48":"Overhauls","49":"Perks","54":"Radio",
  "55":"Shouts","22":"Skills and Levelling","58":"Weather and Lighting","44":"Equipment","45":"Home and Settlement",
  "10":"Body, Face, and Hair","40":"Character Presets",
  "11":"Items","32":"Mercantile","37":"Ammo","19":"Weapons","36":"Weapon and Armour Sets",
  "23":"Player Homes","25":"Castles and Mansions","51":"Settlements",
  "12":"Locations","4":"Cities","31":"Landscape Changes","29":"Environment","30":"Immersion",
  "20":"Magic","21":"Models and Textures","33":"Modders Resources","13":"NPCs",
  "24":"Bug Fixes","14":"Patches","35":"Utilities","26":"Cheats",
  "15":"Quests","16":"Races and Classes","34":"Stealth",
  "17":"User Interface","18":"Visuals and Graphics","50":"Pip-Boy","46":"Shader Presets","47":"Miscellaneous"
};
// name(normalised) -> category, built from a picked mods folder's meta.ini files. Persisted to
// localStorage so the Mods folder is a ONE-TIME pick: once read, every later import (this session
// or a future one) auto-applies categories without re-selecting the folder.
let metaCatByName={};
function saveMetaCat(){try{localStorage.setItem("skyrim-planner-metacat",JSON.stringify(metaCatByName));}catch(e){}}
function loadMetaCat(){try{const r=localStorage.getItem("skyrim-planner-metacat");if(r)metaCatByName=JSON.parse(r)||{};}catch(e){}}
function catFromMeta(name){return metaCatByName[ikey(name)]||null;}

const PREFIX_RE=/^(Creation Club|DLC|Unmanaged|Root|Managed):\s*/i;
// Parse a modlist.txt into {name, enabled}. Separators, the DLC:/Creation Club:/Unmanaged:
// prefixes and the Bashed Patch are stripped/skipped. Categories are NOT taken from separators —
// a mod's category comes from its matched template (its real MO2/Nexus category).
// Output mods (anything under an "Output(s)" separator — PGPatcher/xEdit/DynDOLOD/TexGen output,
// etc.) are skipped: they're generated files, not planning nodes. In modlist.txt a separator
// owns the entries ABOVE it (the file is stored bottom-to-top vs the left pane), so we buffer
// mods and drop the buffer when the separator that closes it matches /output/i.
const OUTPUT_SEP_RE=/output/i;
const DEFAULT_SKIP_SEP_RE=/output|wip/i;   // separators unchecked by default in the import/reconcile pickers
const NOSEP_KEY="\uFFFFnosep";             // grouping key for trailing mods with no separator below them
// Group modlist lines under their owning separator (the group header they sit beneath in the MO2 UI;
// in modlist.txt that separator appears just BELOW them, so a separator closes the buffer above it).
// Trailing mods with no separator below them get sep=null.
function parseMO2Grouped(txt){
  const toks=[];
  (txt||"").split(/\r?\n/).forEach(line=>{
    let l=line.trim();if(!l||l[0]==="#")return;
    let enabled=true,name=l;
    if(l[0]==="+"){enabled=true;name=l.slice(1);}
    else if(l[0]==="-"){enabled=false;name=l.slice(1);}
    else if(l[0]==="*"){enabled=true;name=l.slice(1);}
    else return;
    name=name.trim();
    if(/_separator$/i.test(name)){toks.push({sep:name.replace(/_separator$/i,"")});return;}
    name=name.replace(PREFIX_RE,"").trim();
    if(!name||/^bashed patch/i.test(name))return;
    toks.push({name,enabled});
  });
  const entries=[];let buf=[];const sepOrder=[],sepCount={};
  toks.forEach(t=>{
    if(t.sep!==undefined){
      buf.forEach(e=>e.sep=t.sep);
      if(!(t.sep in sepCount)){sepCount[t.sep]=0;sepOrder.push(t.sep);}
      sepCount[t.sep]+=buf.length; entries.push(...buf); buf=[];
    } else buf.push({name:t.name,enabled:t.enabled,sep:null});
  });
  buf.forEach(e=>e.sep=null); entries.push(...buf);   // trailing mods with no separator below them
  const seps=sepOrder.map(nm=>({name:nm,count:sepCount[nm]}));
  const noSepCount=entries.reduce((a,e)=>a+(e.sep===null?1:0),0);
  return {entries,seps,noSepCount};
}
// Flatten to {name,enabled}, keeping only mods whose separator is selected. selSet = Set of separator
// keys to INCLUDE (a separator name, or NOSEP_KEY). Omit selSet to fall back to the built-in default:
// everything except Output/WIP separators (the old hardcoded Output skip, plus WIP).
function parseMO2(txt,selSet){
  const {entries}=parseMO2Grouped(txt);
  return entries.filter(e=>{
    const key=e.sep===null?NOSEP_KEY:e.sep;
    if(selSet) return selSet.has(key);
    return e.sep===null?true:!DEFAULT_SKIP_SEP_RE.test(e.sep);
  }).map(e=>({name:e.name,enabled:e.enabled}));
}
/* ---------- separator multiselect: which MO2 separators to import / reconcile ---------- */
const sepPick={import:{},rec:{}};   // which -> { [sepKey]: checked bool }; keyed by separator name (or NOSEP_KEY)
function renderSepPicker(which){
  const txtId=which==="import"?"mo2-text":"rec-text", boxId=which==="import"?"import-seps":"rec-seps";
  const box=document.getElementById(boxId); if(!box)return;
  const {seps,noSepCount}=parseMO2Grouped(document.getElementById(txtId).value);
  const choice=sepPick[which];
  const keys=seps.map(s=>({key:s.name,label:s.name,count:s.count}));
  if(noSepCount)keys.push({key:NOSEP_KEY,label:"(no separator \u2014 bottom of list)",count:noSepCount});
  keys.forEach(k=>{if(!(k.key in choice))choice[k.key]=k.key===NOSEP_KEY?true:!DEFAULT_SKIP_SEP_RE.test(k.key);});
  if(!keys.length){box.hidden=true;box.innerHTML="";return;}
  box.hidden=false;
  const on=keys.filter(k=>choice[k.key]!==false).length;
  box.innerHTML=`<div class="sep-pick-head">Separators to import <span class="hint">${on}/${keys.length} \u00b7 unchecked skipped</span><span class="sep-pick-ctl"><button type="button" class="btn" data-sp="all">All</button><button type="button" class="btn" data-sp="none">None</button></span></div><div class="sep-pick-list">`+keys.map(k=>`<label class="sep-pick-row"><input type="checkbox" class="sep-cb" data-key="${esc(k.key)}" ${choice[k.key]!==false?"checked":""}><span class="sep-nm">${esc(k.label)}</span><span class="sep-ct">${k.count}</span></label>`).join("")+`</div>`;
  box.querySelectorAll(".sep-cb").forEach(cb=>cb.onchange=()=>{choice[cb.dataset.key]=cb.checked;renderSepPicker(which);});
  box.querySelector('[data-sp="all"]').onclick=()=>{keys.forEach(k=>choice[k.key]=true);renderSepPicker(which);};
  box.querySelector('[data-sp="none"]').onclick=()=>{keys.forEach(k=>choice[k.key]=false);renderSepPicker(which);};
}
function chosenSepSet(which){
  const choice=sepPick[which], ks=Object.keys(choice); if(!ks.length)return undefined;
  const s=new Set(); ks.forEach(k=>{if(choice[k]!==false)s.add(k);}); return s;
}
function buildEntry(name,enabled,asImported){
  const metaCat=catFromMeta(name);   // real MO2 category from meta.ini, if a mods folder was read
  const t=resolveTemplate(name);
  if(t){const c=clone(t);c.enabled=enabled;if(metaCat)c.cat=metaCat;return c;}  // meta.ini wins over template's default
  // Unknown (non-template) mod: flag needsReview so it surfaces in the review queue until you've
  // wired its dependencies/fields. Template-matched mods come pre-wired, so they are not flagged.
  return {id:uniqId(slug(name)),name,cat:metaCat||(asImported?"Imported":"Other"),type:itype(name),enabled,pin:"",requires:[],conflicts:[],loadAfter:[],note:"Imported from MO2",needsReview:true,addedAt:Date.now()};
}
// pull in any known template a required mod-ref points to but the profile didn't list (e.g. SKSE installed to root)
function closureAddMissing(list){
  const ids=new Set(list.map(m=>m.id));let changed=true,guard=0;
  while(changed&&guard++<25){changed=false;
    list.slice().forEach(m=>{(m.requires||[]).forEach(r=>{
      if(r.k==="mod"&&!ids.has(r.ref)){const t=DEFAULT_CATALOG.find(x=>x.id===r.ref);
        if(t){const c=clone(t);c.enabled=true;c.note=(c.note?c.note+" ":"")+"(auto-added: required but not in profile)";list.push(c);ids.add(c.id);changed=true;}}
    });});
  }
}
function doImport(mode){
  const asImported=document.getElementById("mo2-cat").checked;
  const entries=parseMO2(document.getElementById("mo2-text").value,chosenSepSet("import"));
  if(!entries.length){toast("Nothing to import — paste or load a modlist first");return;}
  let added=0,updated=0;
  if(mode==="replace"){
    const next=[],seen={};
    entries.forEach(({name,enabled})=>{
      const e=buildEntry(name,enabled,asImported);
      if(seen[e.id]){if(enabled)seen[e.id].enabled=true;return;}
      seen[e.id]=e;next.push(e);
    });
    closureAddMissing(next);
    state.mods=next;
  }else{
    entries.forEach(({name,enabled})=>{
      const t=resolveTemplate(name);
      const existing=t?state.mods.find(m=>m.id===t.id):state.mods.find(m=>ikey(m.name)===ikey(name));
      if(existing){existing.enabled=enabled;const mc=catFromMeta(name);if(mc)existing.cat=mc;updated++;}  // meta.ini category applied if available
      else{state.mods.push(buildEntry(name,enabled,asImported));added++;}
    });
  }
  mImport.classList.remove("show");document.getElementById("mo2-text").value="";resetImportModal();
  selected=null;editing=null;persist();render(true);
  toast(mode==="replace"?`Graph rebuilt from profile — ${state.mods.length} mods`:`Merged — ${added} new, ${updated} updated`);
}
function resetImportModal(){const c=document.getElementById("import-confirm"),b=document.getElementById("import-buttons");if(c)c.hidden=true;if(b)b.hidden=false;}
document.getElementById("btn-import").onclick=()=>{resetImportModal();const st=document.getElementById("mo2-mods-status");
  const cached=Object.keys(metaCatByName).length;   // keep any persisted categories; don't wipe on open
  if(st)st.textContent=cached?`${cached} mod categories remembered — re-pick the folder only to refresh`:"";
  renderSepPicker("import");mImport.classList.add("show");};
document.getElementById("import-cancel").onclick=()=>mImport.classList.remove("show");
document.getElementById("import-merge").onclick=()=>doImport("update");
document.getElementById("import-replace").onclick=()=>{document.getElementById("import-confirm").hidden=false;document.getElementById("import-buttons").hidden=true;};
document.getElementById("import-back").onclick=resetImportModal;
document.getElementById("import-replace-go").onclick=()=>doImport("replace");
document.getElementById("mo2-file").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{document.getElementById("mo2-text").value=r.result;renderSepPicker("import");};r.readAsText(f);};

/* ---------- reconcile: find planner mods not in the MO2 profile ---------- */
const mRec=document.getElementById("modal-reconcile");
let recOrphans=[];
// planner ids that a modlist entry resolves to (same matching the merge-import uses)
function matchedIdsFromModlist(entries){
  const matched=new Set();
  entries.forEach(({name})=>{
    const t=resolveTemplate(name);
    const m=t?byId(t.id):state.mods.find(x=>ikey(x.name)===ikey(name));
    if(m)matched.add(m.id);
  });
  return matched;
}
function openReconcile(){
  document.getElementById("rec-results").hidden=true;
  document.getElementById("rec-scan-row").hidden=false;
  document.getElementById("rec-text").value="";
  const rf=document.getElementById("rec-file");if(rf)rf.value="";
  renderSepPicker("rec");
  mRec.classList.add("show");
}
function scanOrphans(){
  const entries=parseMO2(document.getElementById("rec-text").value,chosenSepSet("rec"));
  if(!entries.length){toast("Paste or load your modlist.txt first");return;}
  const sb=document.getElementById("rec-seps");if(sb)sb.hidden=true;
  const matched=matchedIdsFromModlist(entries);
  recOrphans=state.mods.filter(m=>!matched.has(m.id)&&!m.external);
  const extCount=state.mods.filter(m=>m.external).length;
  document.getElementById("rec-scan-row").hidden=true;
  document.getElementById("rec-results").hidden=false;
  document.getElementById("rec-summary").innerHTML=
    `Profile: <b>${entries.length}</b> entries · matched <b>${matched.size}</b> planner mods · `+
    `<b>${recOrphans.length}</b> in planner but not in profile`+(extCount?` · <b>${extCount}</b> external excluded`:``);
  const list=document.getElementById("rec-list");
  if(!recOrphans.length){list.innerHTML=`<div class="empty good">✓ Nothing orphaned — every planner mod (external ones aside) is in the profile.</div>`;updateRecDeleteBtn();return;}
  list.innerHTML=recOrphans.map(m=>`<label class="rec-row"><input type="checkbox" class="rec-cb" data-id="${esc(m.id)}"><span class="rec-name">${esc(m.name)}</span><span class="rec-meta">${esc(catLabel(m.cat))}${m.enabled?"":" · off"}</span></label>`).join("");
  list.querySelectorAll(".rec-cb").forEach(cb=>cb.onchange=updateRecDeleteBtn);
  updateRecDeleteBtn();
}
function selectedRecIds(){return [...document.querySelectorAll(".rec-cb:checked")].map(cb=>cb.dataset.id);}
function updateRecDeleteBtn(){const n=selectedRecIds().length;const b=document.getElementById("rec-delete");b.textContent=`Delete selected (${n})`;b.disabled=n===0;}
function deleteSelectedOrphans(){
  const ids=new Set(selectedRecIds());
  if(!ids.size)return;
  state.mods=state.mods.filter(m=>!ids.has(m.id));
  // scrub references to the deleted mods
  state.mods.forEach(m=>{["requires","conflicts","loadAfter","patchFor"].forEach(k=>{m[k]=(m[k]||[]).filter(r=>!(r&&r.k==="mod"&&ids.has(r.ref)));});});
  if(ids.has(selected)){selected=null;editing=null;}
  persist();
  const n=ids.size;
  scanOrphans();   // refresh the list against the same pasted modlist
  render(true);
  toast(`Deleted ${n} mod${n!==1?"s":""}`);
}
document.getElementById("btn-reconcile").onclick=openReconcile;
document.getElementById("rec-cancel").onclick=()=>mRec.classList.remove("show");
document.getElementById("rec-close").onclick=()=>mRec.classList.remove("show");
document.getElementById("rec-back").onclick=()=>{document.getElementById("rec-results").hidden=true;document.getElementById("rec-scan-row").hidden=false;renderSepPicker("rec");};
document.getElementById("rec-scan").onclick=scanOrphans;
document.getElementById("rec-all").onclick=()=>{document.querySelectorAll(".rec-cb").forEach(cb=>cb.checked=true);updateRecDeleteBtn();};
document.getElementById("rec-none").onclick=()=>{document.querySelectorAll(".rec-cb").forEach(cb=>cb.checked=false);updateRecDeleteBtn();};
document.getElementById("rec-delete").onclick=deleteSelectedOrphans;
document.getElementById("rec-file").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{document.getElementById("rec-text").value=r.result;renderSepPicker("rec");};r.readAsText(f);};
// read categories from each mod's meta.ini in a picked mods folder
document.getElementById("mo2-mods").onchange=async e=>{
  const files=[...e.target.files].filter(f=>/(^|[\\/])meta\.ini$/i.test(f.webkitRelativePath||f.name));
  const st=document.getElementById("mo2-mods-status");
  if(st)st.textContent="Reading…";
  let unknown=new Set(),read=0;   // merge into the persisted map (don't wipe) so partial folder picks accumulate
  for(const f of files){
    let text;try{text=await f.text();}catch(_){continue;}
    const m=text.match(/^\s*category\s*=\s*"?([0-9,\-]+)"?/im);if(!m)continue;
    const primary=(m[1].split(",")[0]||"").trim();
    if(!primary||primary==="-1")continue;
    const cat=NEXUS_CAT_IDS[primary]||("Category "+primary);
    if(!NEXUS_CAT_IDS[primary])unknown.add(primary);
    const parts=(f.webkitRelativePath||"").split("/");
    const modName=parts.length>=2?parts[parts.length-2]:null;
    if(modName){metaCatByName[ikey(modName)]=cat;read++;}
  }
  saveMetaCat();
  const total=Object.keys(metaCatByName).length;
  if(st)st.textContent=read?`Read ${read} categories · ${total} remembered`+(unknown.size?` · unknown IDs: ${[...unknown].join(", ")}`:""):"No meta.ini categories found";
};

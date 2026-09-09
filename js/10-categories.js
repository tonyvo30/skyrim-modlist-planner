/* ---------- category metadata ---------- */
// Categories mirror MO2's embedded (Nexus) category field. Common ones get a curated
// colour; anything else gets a stable generated colour. Matching is case-insensitive.
const KNOWN_CATS = {
  "utilities":{label:"Utilities",color:"#74d4e3"},
  "modders resources":{label:"Modders Resources",color:"#7f93a6"},
  "bug fixes":{label:"Bug Fixes",color:"#69c07a"},
  "patches":{label:"Patches",color:"#5fc9a6"},
  "user interface":{label:"User Interface",color:"#a98fd4"},
  "visuals and graphics":{label:"Visuals and Graphics",color:"#b98fd4"},
  "models and textures":{label:"Models and Textures",color:"#6fb4e3"},
  "audio":{label:"Audio",color:"#e08a4e"},
  "gameplay":{label:"Gameplay",color:"#d49a6f"},
  "immersion":{label:"Immersion",color:"#c9b06f"},
  "miscellaneous":{label:"Miscellaneous",color:"#8f9aa6"},
  "unmanaged":{label:"Unmanaged",color:"#6c7d8c"},
  "imported":{label:"Imported",color:"#6c7d8c"},
  "other":{label:"Other",color:"#6c7d8c"}
};
const CAT_PREF=["utilities","modders resources","bug fixes","patches","user interface","visuals and graphics","models and textures","audio","gameplay","immersion","miscellaneous","unmanaged","imported","other"];
const CAT_PALETTE=["#74d4e3","#a98fd4","#e0a94e","#6fb4e3","#b98fd4","#e08a4e","#5fc9a6","#8fd4a9","#d47fa0","#7f93a6","#c9b06f","#6fd4c2","#d49a6f","#8f9aa6"];
const _catColorCache={};
function catNorm(c){return String(c==null?"other":c).trim().toLowerCase()||"other";}
function catColor(c){const k=catNorm(c);if(KNOWN_CATS[k])return KNOWN_CATS[k].color;
  if(_catColorCache[k])return _catColorCache[k];
  let h=0;for(let i=0;i<k.length;i++)h=(h*31+k.charCodeAt(i))>>>0;
  return _catColorCache[k]=CAT_PALETTE[h%CAT_PALETTE.length];}
function catLabel(c){const k=catNorm(c);if(KNOWN_CATS[k])return KNOWN_CATS[k].label;
  return String(c||"Other").replace(/\b\w/g,ch=>ch.toUpperCase());}
function orderedCats(){
  const present=new Set(state.mods.map(m=>catNorm(m.cat)));
  const inpref=CAT_PREF.filter(k=>present.has(k));
  const extra=[...present].filter(k=>!CAT_PREF.includes(k)).sort();
  return [...inpref,...extra];
}
// full category picker: every known Nexus category + any in-use + the current value, then "Custom…"
function catOptions(cur){
  const map=new Map();
  Object.keys(KNOWN_CATS).forEach(k=>{if(k!=="other"&&k!=="imported")map.set(k,KNOWN_CATS[k].label);});
  state.mods.forEach(m=>map.set(catNorm(m.cat),catLabel(m.cat)));
  if(cur)map.set(catNorm(cur),catLabel(cur));
  const curN=catNorm(cur||"");
  const items=[...map.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  return items.map(([k,label])=>`<option value="${esc(label)}"${k===curN?" selected":""}>${esc(label)}</option>`).join("")
    +`<option value="__custom__">Custom…</option>`;
}
// The real MO2/Nexus category for each seed mod (from the user's meta.ini where installed,
// else the mod's actual Nexus category). Used to categorise the seed and to migrate any
// catalog still carrying the old internal keys.
const SEED_CATS={
  skse:"Utilities","address-library":"Utilities",papyrusutil:"Utilities","po3-papyrus":"Utilities",jcontainers:"Utilities","net-script":"Utilities","display-tweaks":"Utilities","skyrim-priority":"Utilities","enb-helper":"Utilities","dll-loader":"Utilities","ach-enabler":"Utilities",
  "engine-fixes":"Bug Fixes","po3-tweaks":"Bug Fixes",bugfixes:"Bug Fixes","scrambled-bugs":"Bug Fixes",ussep:"Bug Fixes",landwater:"Bug Fixes","actor-limit":"Bug Fixes",animlimit:"Bug Fixes",cellfreeze:"Bug Fixes",mfgfix:"Bug Fixes",
  bees:"Modders Resources","crash-logger":"Modders Resources",consoleutil:"Modders Resources","mcm-helper":"Modders Resources",spid:"Modders Resources",kid:"Modders Resources",bos:"Modders Resources",skypatcher:"Modders Resources","animobject-swapper":"Modders Resources","upscaler-base":"Modders Resources",
  mic:"User Interface",skyui:"User Interface",dsd:"User Interface",scaleform:"User Interface",
  fuzrodoh:"Miscellaneous",
  "enb-binary":"Visuals and Graphics",picho:"Visuals and Graphics","reshade-addon":"Visuals and Graphics",puredark:"Visuals and Graphics",obsidian:"Visuals and Graphics",
  resourcepack:"Unmanaged","cc-survival":"Unmanaged","cc-curios":"Unmanaged","cc-saints":"Unmanaged","cc-fishing":"Unmanaged"
};
const LEGACY_CAT={core:"Utilities",diag:"Modders Resources",fw:"Utilities",dist:"Modders Resources",fix:"Bug Fixes",perf:"Utilities",ui:"User Interface",beth:"Bug Fixes",enb:"Visuals and Graphics",up:"Visuals and Graphics",weather:"Visuals and Graphics",content:"Unmanaged",imported:"Imported",other:"Other"};
// capability layer removed: convert any legacy {k:"cap"} refs into direct {k:"mod"} links
// (resolved through the providers declared in the same data), then drop the provides field.
function migrateMods(list){
  const provMap={};(list||[]).forEach(x=>(x.provides||[]).forEach(cap=>{(provMap[cap]=provMap[cap]||[]).push(x.id);}));
  (list||[]).forEach(m=>{
    if(SEED_CATS[m.id])m.cat=SEED_CATS[m.id];           // known seed mod → its real MO2 category
    else if(LEGACY_CAT[m.cat]!==undefined)m.cat=LEGACY_CAT[m.cat]; // any lingering old key
    ["requires","conflicts"].forEach(k=>{
      if(!Array.isArray(m[k]))return;
      const out=[];
      m[k].forEach(r=>{
        if(r&&r.k==="cap"){
          (provMap[r.ref]||[]).forEach(pid=>{if(pid!==m.id&&!out.some(o=>o.k==="mod"&&o.ref===pid))out.push({k:"mod",ref:pid});});
        }else if(r&&r.k==="mod"){
          if(!out.some(o=>o.k==="mod"&&o.ref===r.ref))out.push({k:"mod",ref:r.ref});
        }else if(r){out.push(r);}
      });
      m[k]=out;
    });
    delete m.provides;
  });
  return list;
}

/* ---------- inspector ---------- */
const REL_TYPES=[["requires","Requires (hard)","req"],["conflicts","Conflicts with","conf"],["loadAfter","Load after","la"],["patchFor","Patches (main mods)","pf"]];
function openInspector(id){selected=id;editing=id==="__new__"?newMod():clone(byId(id));curTab="inspector";setTab("inspector");render(false);
  if(cyReady&&cy&&id!=="__new__"){const n=cy.$id(id);if(n.length&&n.style("display")!=="none")cy.animate({center:{eles:n}},{duration:250});}
}
function highlightInspected(){
  if(!cyReady||!cy)return;
  cy.batch(()=>{
    cy.nodes().removeClass("inspectnode");
    if(selected&&selected!=="__new__"){const n=cy.$id(selected);if(n.length)n.addClass("inspectnode");}
  });
}
function newMod(){return {id:"__new__",name:"",cat:"other",type:"skse-dll",enabled:true,adult:false,external:false,pin:"",requires:[],conflicts:[],loadAfter:[],patchFor:[],anyOf:[],note:""};}

function renderInspector(){
  const el=document.getElementById("panel-inspector");
  if(!editing){el.innerHTML=`<div class="empty">Select a mod, or click <b>+ Add mod</b>.</div>`;return;}
  const e=editing, isNew=e.id==="__new__";
  const myLvl=isNew?null:computeLevels()[e.id];
  const opts=(sel)=>state.mods.filter(m=>m.id!==e.id).map(m=>`<option value="${m.id}" ${sel===m.id?"selected":""}>${esc(m.name)}</option>`).join("");
  el.innerHTML=`<div class="insp">
    <h3>${isNew?"New mod":esc(e.name||"(unnamed)")}</h3>
    <div class="sub">${isNew?"add to catalog":esc(e.id)}${myLvl!=null?` &middot; hierarchy level <b style="color:var(--frost)">${myLvl}</b>`:""}</div>
    <div class="field"><label>Name</label><input id="f-name" value="${esc(e.name)}"></div>
    <div class="row2">
      <div class="field"><label>Category</label><select id="f-cat-sel">${catOptions(e.cat)}</select><input id="f-cat-custom" placeholder="type a new category name…" value="" style="margin-top:6px" hidden></div>
      <div class="field"><label>Type</label><select id="f-type">${["esm","esp","esl","skse-dll","reshade","enb","tool","resource"].map(t=>`<option ${e.type===t?"selected":""}>${t}</option>`).join("")}</select></div>
    </div>
    <div class="row2">
      <div class="field"><label>Version pin</label><input id="f-pin" value="${esc(e.pin||"")}"></div>
      <div class="field"><label>Enabled</label><select id="f-en"><option value="1" ${e.enabled?"selected":""}>Enabled</option><option value="0" ${!e.enabled?"selected":""}>Disabled</option></select></div>
    </div>
    <div class="field"><label class="adult-check"><input type="checkbox" id="f-adult" ${e.adult?"checked":""}> Adult content (18+)</label></div>
    <div class="field"><label class="adult-check"><input type="checkbox" id="f-external" ${e.external?"checked":""}> External — manual install, not in MO2 modlist (excluded from Reconcile)</label></div>
    ${relBlock("requires",e)}
    ${anyOfBlock(e)}
    ${relBlock("patchFor",e)}
    ${relBlock("conflicts",e)}
    ${relBlock("loadAfter",e)}
    <div class="field"><label>Notes</label><textarea id="f-note">${esc(e.note||"")}</textarea></div>
    <div class="insp-actions">
      <button class="btn primary" id="i-save">${isNew?"Add mod":"Save changes"}</button>
      ${isNew?"":`<button class="btn danger" id="i-del">Delete</button>`}
      <button class="btn" id="i-cancel">Cancel</button>
    </div>
  </div>`;

  // wire live-capture of simple fields into editing
  const cap=(idf,key,fn)=>{const n=document.getElementById(idf);if(n)n.oninput=n.onchange=()=>{editing[key]=fn?fn(n.value):n.value;};};
  cap("f-name","name");cap("f-type","type");cap("f-pin","pin");cap("f-note","note");
  (()=>{const sel=document.getElementById("f-cat-sel"),ci=document.getElementById("f-cat-custom");
    sel.onchange=()=>{if(sel.value==="__custom__"){ci.hidden=false;ci.focus();editing.cat=ci.value.trim();}else{ci.hidden=true;editing.cat=sel.value;}};
    ci.oninput=()=>{editing.cat=ci.value.trim();};})();
  document.getElementById("f-en").onchange=ev=>{editing.enabled=ev.target.value==="1";};
  document.getElementById("f-adult").onchange=ev=>{editing.adult=ev.target.checked;};
  document.getElementById("f-external").onchange=ev=>{editing.external=ev.target.checked;};

  REL_TYPES.forEach(([key])=>wireAddRel(key));
  wireAnyOf();
  document.getElementById("i-save").onclick=saveMod;
  document.getElementById("i-cancel").onclick=()=>{editing=null;selected=null;render(false);};
  const del=document.getElementById("i-del");if(del)del.onclick=deleteMod;
}

function anyOfBlock(e){
  const groups=e.anyOf||[];
  const gh=groups.map((g,gi)=>{
    const chips=(g.mods||[]).map((id,mi)=>{
      const t=byId(id);const bad=!t;
      return `<span class="relchip ${bad?"bad":""}">${esc(t?t.name:id)}<button data-ag="${gi}" data-am="${mi}" class="rm-anyof">\u00d7</button></span>`;
    }).join("")||'<span class="hint">no options yet</span>';
    const cands=state.mods.filter(m=>m.id!==e.id&&!(g.mods||[]).includes(m.id)).slice().sort((a,b)=>a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    const opts=cands.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join("");
    return `<div class="anyof-grp"><div class="chiprow">${chips}</div>
      <div class="addrel"><select class="add-anyof-mod" data-ag="${gi}"><option value="">+ add option\u2026</option>${opts}</select></div>
      <label class="anyof-x"><input type="checkbox" class="anyof-excl" data-ag="${gi}" ${g.exclusive?"checked":""}> mutually exclusive (only one active at a time)</label>
      <button class="btn danger anyof-del" data-ag="${gi}">Remove group</button></div>`;
  }).join("");
  return `<div class="rel-block"><div class="rt">Requires \u2014 any of (OR)</div>
    ${gh||'<span class="hint">none \u2014 add a group; the mod is satisfied if ANY one option in it is enabled</span>'}
    <button class="btn anyof-add">+ any-of group</button></div>`;
}
function wireAnyOf(){
  const el=document.getElementById("panel-inspector");
  el.querySelectorAll(".anyof-add").forEach(b=>b.onclick=()=>{editing.anyOf=editing.anyOf||[];editing.anyOf.push({mods:[],exclusive:false});renderInspector();});
  el.querySelectorAll(".anyof-del").forEach(b=>b.onclick=()=>{editing.anyOf.splice(+b.dataset.ag,1);renderInspector();});
  el.querySelectorAll(".rm-anyof").forEach(b=>b.onclick=()=>{editing.anyOf[+b.dataset.ag].mods.splice(+b.dataset.am,1);renderInspector();});
  el.querySelectorAll(".anyof-excl").forEach(cb=>cb.onchange=()=>{editing.anyOf[+cb.dataset.ag].exclusive=cb.checked;});
  el.querySelectorAll(".add-anyof-mod").forEach(sel=>sel.onchange=()=>{const g=editing.anyOf[+sel.dataset.ag];if(sel.value&&!g.mods.includes(sel.value))g.mods.push(sel.value);renderInspector();});
}
function relBlock(key,e){
  const label=key==="requires"?"Requires (hard)":key==="conflicts"?"Conflicts with":key==="patchFor"?"Patches (main mods)":"Load after";
  const items=(e[key]||[]).map((r,i)=>{
    const t=byId(r.ref);
    const missing=!t;
    const via=(key==="requires"&&t)?upstreamVia(e,r.ref):null;
    const txt=t?t.name:r.ref;
    const cls=`relchip ${missing?"bad":""} ${via?"redundant":""}`.trim();
    const title=via?` title="Already upstream via ${esc(via)} — this direct link is redundant"`:"";
    return `<span class="${cls}"${title}>${via?"↑ ":""}${esc(txt)}<button data-k="${key}" data-i="${i}" class="rmrel">×</button></span>`;
  }).join("");
  // dropdown options — alphabetical; for 'requires', covered/dimmed ones (dup or upstream) sink to the bottom
  const cands=state.mods.filter(m=>m.id!==e.id).slice().sort((a,b)=>a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  let opts;
  if(key==="requires"){
    const plain=[],covered=[];
    cands.forEach(m=>{
      const isDup=(e.requires||[]).some(r=>r.k==="mod"&&r.ref===m.id);
      const via=isDup?null:upstreamVia(e,m.id);
      if(isDup) covered.push(`<option value="${m.id}" class="opt-cov">${esc(m.name)} — already added</option>`);
      else if(via) covered.push(`<option value="${m.id}" class="opt-cov">${esc(m.name)} — ↑ upstream via ${esc(via)}</option>`);
      else plain.push(`<option value="${m.id}">${esc(m.name)}</option>`);
    });
    opts=plain.join("")+covered.join("");
  } else {
    opts=cands.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join("");
  }
  const confirmBox=key==="requires"?`<div id="req-red-confirm" class="redwarn" hidden></div>`:"";
  return `<div class="rel-block"><div class="rt">${label}</div>
    <div class="chiprow">${items||'<span class="hint">none</span>'}</div>
    ${confirmBox}
    <div class="addrel">
      <select id="add-${key}-mod"><option value="">+ mod…</option>${opts}</select>
    </div></div>`;
}
function showReqRedundantConfirm(targetId,viaName){
  const box=document.getElementById("req-red-confirm");if(!box)return;
  const nm=byId(targetId)?byId(targetId).name:targetId;
  box.hidden=false;
  box.innerHTML=`<span>↑ <b>${esc(nm)}</b> is already an upstream dependency via <b>${esc(viaName)}</b>. A direct link is redundant and clutters the graph.</span>
    <div class="cbtns"><button class="btn" id="red-skip">Skip</button><button class="btn danger" id="red-add">Add anyway</button></div>`;
  document.getElementById("red-skip").onclick=()=>{box.hidden=true;box.innerHTML="";};
  document.getElementById("red-add").onclick=()=>{editing.requires=editing.requires||[];editing.requires.push({k:"mod",ref:targetId});renderInspector();};
}
function wireAddRel(key){
  document.querySelectorAll(`.rmrel[data-k="${key}"]`).forEach(b=>{
    b.onclick=()=>{const i=+b.dataset.i;editing[key].splice(i,1);renderInspector();};
  });
  const ms=document.getElementById(`add-${key}-mod`);
  if(ms)ms.onchange=()=>{
    const val=ms.value;if(!val)return;
    if(key==="requires"){
      if((editing.requires||[]).some(r=>r.k==="mod"&&r.ref===val)){ms.value="";toast((byId(val)?byId(val).name:val)+" is already required");return;}
      const via=upstreamVia(editing,val);
      if(via){ms.value="";showReqRedundantConfirm(val,via);return;}
    }
    editing[key]=editing[key]||[];editing[key].push({k:"mod",ref:val});renderInspector();
  };
}
function saveMod(){
  if(!editing.name.trim()){editing.name="Untitled mod";}
  if(editing.id==="__new__"){editing.id=uniqId(slug(editing.name));state.mods.push(editing);selected=editing.id;}
  else{const idx=state.mods.findIndex(m=>m.id===editing.id);if(idx>=0)state.mods[idx]=editing;}
  editing=clone(byId(selected));persist();render(true);
}
function deleteMod(){
  const id=editing.id;
  state.mods=state.mods.filter(m=>m.id!==id);
  // scrub references
  state.mods.forEach(m=>{["requires","conflicts","loadAfter","patchFor"].forEach(k=>{m[k]=(m[k]||[]).filter(r=>!(r.k==="mod"&&r.ref===id));});});
  editing=null;selected=null;persist();render(true);
}

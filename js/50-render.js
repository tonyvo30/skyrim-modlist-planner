/* ---------- rendering ---------- */
function render(structural){
  const warns = validate();
  const errSet = new Set(warns.filter(w=>w.sev!=="info").map(w=>w.mod));
  renderStats(warns);
  renderWarnings(warns);
  renderList(errSet);
  renderCatLegend();
  if(curTab==="inspector") renderInspector();
  if(structural) rebuildGraph(errSet); else refreshGraph(errSet);
  highlightInspected();
  if(typeof updateReviewBtn==="function") updateReviewBtn();
}
function renderCatLegend(){
  const el=document.getElementById("cat-legend");if(!el)return;
  const cats=orderedCats();
  let html=`<span class="cat-hint">categories · click to hide</span>`;
  html+=cats.map(k=>{
    const hid=hiddenCats.has(k);
    return `<span class="catchip${hid?" hid":""}" data-cat="${esc(k)}" title="${hid?"Show":"Hide"} ${esc(catLabel(k))} in the graph"><i class="ld" style="background:${catColor(k)}"></i>${esc(catLabel(k))}</span>`;
  }).join("");
  const hiddenPresent=cats.filter(k=>hiddenCats.has(k)).length;
  if(hiddenPresent) html+=`<span class="catchip reset" id="cat-showall" title="Show every category again">↺ show all (${hiddenPresent} hidden)</span>`;
  el.innerHTML=html;
  el.querySelectorAll(".catchip[data-cat]").forEach(c=>c.onclick=()=>toggleCat(c.dataset.cat));
  const sa=document.getElementById("cat-showall");
  if(sa) sa.onclick=()=>{hiddenCats.clear();saveCatFilter();render(true);};
}
function toggleCat(k){
  if(hiddenCats.has(k))hiddenCats.delete(k); else hiddenCats.add(k);
  saveCatFilter();render(true);   // rebuild excludes the filtered nodes, so the tree repacks
}

function renderStats(warns){
  const total=state.mods.length, on=state.mods.filter(m=>m.enabled).length;
  const errs=warns.filter(w=>w.sev==="error").length;
  const ws=warns.filter(w=>w.sev==="warn").length;
  document.getElementById("s-total").innerHTML=`<b>${total}</b> mods`;
  document.getElementById("s-enabled").innerHTML=`<b>${on}</b> on`;
  const se=document.getElementById("s-err");se.textContent=`${errs} error${errs!==1?"s":""}`;se.classList.toggle("zero",errs===0);
  const sw=document.getElementById("s-warn");sw.textContent=`${ws} warning${ws!==1?"s":""}`;sw.classList.toggle("zero",ws===0);
  const bw=document.getElementById("b-warn");bw.textContent=warns.length;bw.classList.toggle("err",errs>0);
  document.getElementById("b-list").textContent=total;
}

const SEV_LABELS={error:"Error",warn:"Warning",info:"Info"};
const SEV_RANK={error:0,warn:1,info:2};
function sevLabel(s){return SEV_LABELS[s]||s.charAt(0).toUpperCase()+s.slice(1);}
function renderWarnings(warns){
  const el=document.getElementById("panel-warnings");
  if(!warns.length){el.innerHTML=`<div class="empty good">✓ All dependencies satisfied — no conflicts, nothing missing.</div>`;return;}
  // severities present, ordered error > warn > info > (anything else, alphabetical)
  const counts={}; warns.forEach(w=>counts[w.sev]=(counts[w.sev]||0)+1);
  [...msgSevHidden].forEach(s=>{if(!(s in counts))msgSevHidden.delete(s);});  // prune stale
  const rk=s=>(SEV_RANK[s]!==undefined?SEV_RANK[s]:9);
  const sevs=Object.keys(counts).sort((a,b)=>rk(a)-rk(b)||a.localeCompare(b));
  const filtered=warns.filter(w=>!msgSevHidden.has(w.sev));
  const chips=sevs.map(s=>`<span class="sev-chip sev-${esc(s)}${msgSevHidden.has(s)?" off":""}" data-sev="${esc(s)}" title="${msgSevHidden.has(s)?"Show":"Hide"} ${esc(sevLabel(s))} messages"><i class="sev-dot"></i>${esc(sevLabel(s))} <b>${counts[s]}</b></span>`).join("");
  el.innerHTML=`<div class="sev-filter">${chips}</div>`;
  if(!filtered.length) el.insertAdjacentHTML("beforeend",`<div class="empty">All ${warns.length} message${warns.length!==1?"s":""} hidden by the filter.</div>`);
  filtered.forEach(w=>{
    const m=byId(w.mod);
    const d=document.createElement("div");
    d.className="warn-item "+w.sev;
    d.innerHTML=`<div class="wh"><span class="wsev ${w.sev}">${w.sev}</span><span class="wmod">${m?esc(m.name):esc(w.mod)}</span></div><div class="wmsg">${esc(w.msg)}</div>`;
    d.onclick=()=>{openInspector(w.mod); if(cyReady&&cy){const n=cy.$id(w.mod);if(n.length){cy.animate({center:{eles:n},zoom:1.1},{duration:300});flash(w.mod);}}};
    el.appendChild(d);
  });
  el.querySelectorAll(".sev-chip").forEach(ch=>ch.onclick=()=>{const s=ch.dataset.sev;
    if(msgSevHidden.has(s))msgSevHidden.delete(s); else msgSevHidden.add(s);
    saveMsgSev(); renderWarnings(validate());});
}

function renderList(errSet){
  const el=document.getElementById("panel-list");
  const adultCount=state.mods.filter(m=>m.adult).length;
  const adultNote=adultMode==="only"?`<span class="list-adult-note only">showing only 18+</span>`
    :adultMode==="hide"?`<span class="list-adult-note hide">18+ hidden</span>`
    :(adultCount?`<span class="list-adult-note">${adultCount} flagged 18+</span>`:"");
  el.innerHTML=`<div class="listctl"><input class="search" id="search" placeholder="Filter mods…" value="${esc(searchTxt)}">${adultNote}</div>`;
  const q=searchTxt.trim().toLowerCase();
  const pass=m=>{
    if(q && !(m.name.toLowerCase().includes(q)||m.id.includes(q)||catNorm(m.cat).includes(q))) return false;
    if(adultMode==="only" && !m.adult) return false;
    if(adultMode==="hide" && m.adult) return false;
    if(showOnlyReview && !m.needsReview) return false;
    return true;
  };
  const makeRow=m=>{
    const row=document.createElement("div");
    row.className="mod"+(m.enabled?"":" disabled")+(selected===m.id?" sel":"")+(errSet.has(m.id)?" haswarn":"")+(m.needsReview?" needsreview":"");
    row.innerHTML=`<button class="toggle ${m.enabled?"on":""}" title="Enable/disable"></button>
      <div class="minfo"><div class="mname">${esc(m.name)}</div>
      <div class="mmeta">${esc(m.type)}${m.pin?" · "+esc(m.pin):""}</div></div>
      ${m.needsReview?`<span class="review-badge" title="Flagged for review / todo">⚑ REVIEW</span>`:""}${m.adult?`<span class="adult-badge" title="Adult content">18+</span>`:""}${m.external?`<span class="ext-badge" title="External / manual install — not in MO2 modlist">EXT</span>`:""}`;
    row.querySelector(".toggle").onclick=e=>{e.stopPropagation();m.enabled=!m.enabled;persist();render(false);};
    row.querySelector(".minfo").onclick=()=>openInspector(m.id);
    return row;
  };
  const addGroup=(cls,dot,label,count,mods)=>{
    const g=document.createElement("div");g.className="catgroup"+(cls?" "+cls:"");
    g.innerHTML=`<h4><span class="cdot" style="background:${dot}"></span>${esc(label)}${count!=null?` <span class="hint">${count}</span>`:""}</h4>`;
    mods.forEach(m=>g.appendChild(makeRow(m)));
    el.appendChild(g);
  };
  // Pinned "Needs review" queue at the very TOP of the list — all flagged mods across every
  // category. Skipped when the review filter already limits the whole list to flagged mods.
  const flagged=state.mods.filter(m=>m.needsReview && pass(m));
  const topReview = flagged.length>0 && !showOnlyReview;
  if(topReview){
    flagged.sort((a,b)=>{const ai=CAT_PREF.indexOf(catNorm(a.cat)),bi=CAT_PREF.indexOf(catNorm(b.cat));
      return (ai<0?99:ai)-(bi<0?99:bi) || a.name.toLowerCase().localeCompare(b.name.toLowerCase());});
    addGroup("review-group","#e0a94e","⚑ Needs review",flagged.length,flagged);
  }
  const groups={};
  state.mods.forEach(m=>{
    if(!pass(m)) return;
    if(topReview && m.needsReview) return;   // already shown in the top queue
    const k=catNorm(m.cat);
    (groups[k]=groups[k]||{label:catLabel(m.cat),mods:[]}).mods.push(m);
  });
  orderedCats().forEach(cat=>{
    const grp=groups[cat];if(!grp||!grp.mods.length)return;
    addGroup(null,catColor(cat),grp.label,null,grp.mods);
  });
  const s=document.getElementById("search");
  s.oninput=e=>{searchTxt=e.target.value;renderList(errSet);const n=document.getElementById("search");n.focus();n.setSelectionRange(n.value.length,n.value.length);};
}

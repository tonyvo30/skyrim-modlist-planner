/* ---------- graph ---------- */
// A mod is filtered OUT of the graph (not just dimmed) when its category is hidden
// or the adult filter excludes it. Excluding — rather than display:none-hiding — lets
// the layout truly repack the remaining tiers instead of reserving empty slots.
// the "Models and Textures" family (the real Nexus category, plus plausible custom variants)
function isModelTexCat(c){const k=catNorm(c);return k==="models and textures"||k==="models"||k==="textures";}
// lvlMap (when supplied) enables the "hide level-1 Models & Textures" declutter, in both views:
// a foundational (level-1) M&T mod is dropped from the graph entirely so the layout repacks.
function isFilteredOut(m, lvlMap){
  if(hiddenCats.has(catNorm(m.cat))) return true;
  const a=!!m.adult;
  if(adultMode==="only"&&!a) return true;
  if(adultMode==="hide"&&a) return true;
  if(showOnlyReview && !m.needsReview) return true;   // review queue: hide everything else
  if(lvlMap && isModelTexCat(m.cat) && lvlMap[m.id]===(showRoot?1:0)) return true;
  return false;
}
// ---- organic clustering (force view "Group clusters") --------------------------------------
// Louvain modularity clustering (single-level local moving) over the REQUIRES / PATCHES / ANY-OF
// graph among the visible ids. Category and names are never read — clusters emerge purely from
// connectivity. `resolution` tunes granularity (higher => more, smaller clusters). Degree-0 nodes
// (no dependency edges) share one "no dependencies" cluster. Returns {comm, hub, color}.
let lastClusterCount = 0;   // #clusters from the most recent grouped build (for the slider readout)
function hslHex(h,s,l){ // h,s,l in [0,1] -> "#rrggbb"
  const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l),v=l-a*Math.max(-1,Math.min(k-3,9-k,1));return Math.round(v*255);};
  const x=v=>v.toString(16).padStart(2,"0"); return "#"+x(f(0))+x(f(8))+x(f(4));
}
// Weighted multi-level Louvain. `edges` are [u,v,w] over node indices 0..N-1 (self-loops allowed).
// Returns an array: original node index -> final community label. Includes the aggregation phase,
// so `resolution` meaningfully controls granularity (higher => more, smaller communities).
function louvain(N, edges, resolution){
  const buildGraph=(n,elist)=>{
    const nbr=Array.from({length:n},()=>new Map()), self=new Array(n).fill(0), k=new Array(n).fill(0);
    let m=0;
    elist.forEach(([u,v,w])=>{
      if(u===v){ self[u]+=w; k[u]+=2*w; m+=w; }
      else{ nbr[u].set(v,(nbr[u].get(v)||0)+w); nbr[v].set(u,(nbr[v].get(u)||0)+w); k[u]+=w; k[v]+=w; m+=w; }
    });
    return {n,nbr,self,k,m:m||1};
  };
  let cur=buildGraph(N,edges);
  let origToCur=Array.from({length:N},(_,i)=>i);
  while(true){
    const {n,nbr,self,k,m}=cur;
    const comm=Array.from({length:n},(_,i)=>i), sTot=k.slice();
    let improved=true, anyMove=false, guard=0;
    while(improved&&guard++<100){ improved=false;
      for(let i=0;i<n;i++){
        const ci=comm[i]; sTot[ci]-=k[i];
        const wTo=new Map(); nbr[i].forEach((w,j)=>{const cj=comm[j];wTo.set(cj,(wTo.get(cj)||0)+w);});
        let best=ci, bestGain=(wTo.get(ci)||0)-resolution*sTot[ci]*k[i]/(2*m);
        wTo.forEach((w,c)=>{ const g=w-resolution*sTot[c]*k[i]/(2*m); if(g>bestGain+1e-12){bestGain=g;best=c;} });
        comm[i]=best; sTot[best]+=k[i]; if(best!==ci){improved=true;anyMove=true;}
      }
    }
    const lab=new Map(); let c=0;
    const newComm=comm.map(x=>{ if(!lab.has(x))lab.set(x,c++); return lab.get(x); });
    origToCur=origToCur.map(cn=>newComm[cn]);
    if(!anyMove||c===n) break;                 // converged: nothing merged this round
    const em=new Map();                         // aggregate into c super-nodes
    for(let i=0;i<n;i++){
      const ca=newComm[i];
      if(self[i]){const key=ca+","+ca; em.set(key,(em.get(key)||0)+self[i]);}
      nbr[i].forEach((w,j)=>{ if(j>i){ const cb=newComm[j], a=Math.min(ca,cb), b=Math.max(ca,cb); const key=a+","+b; em.set(key,(em.get(key)||0)+w);} });
    }
    const elist2=[]; em.forEach((w,key)=>{const p=key.split(",");elist2.push([+p[0],+p[1],w]);});
    cur=buildGraph(c,elist2);
  }
  return origToCur;
}
function detectCommunities(incSet, resolution){
  const ids=[...incSet], idx={}; ids.forEach((id,i)=>idx[id]=i);
  const deg=new Array(ids.length).fill(0), edges=[];
  ids.forEach(id=>{ const m=byId(id); if(!m)return; const a=idx[id];
    const link=ref=>{ if(incSet.has(ref)&&ref!==id){ edges.push([a,idx[ref],1]); deg[a]++; deg[idx[ref]]++; } };
    (m.requires||[]).forEach(r=>{if(r.k==="mod")link(r.ref);});
    (m.patchFor||[]).forEach(r=>{if(r.k==="mod")link(r.ref);});
    (m.anyOf||[]).forEach(g=>(g.mods||[]).forEach(x=>link(x)));
  });
  const lab=louvain(ids.length, edges, resolution);
  const comm={}; ids.forEach((id,i)=>{ comm[id]= deg[i]===0 ? "__nodeps__" : "c"+lab[i]; });
  const members={}; ids.forEach(id=>{(members[comm[id]]=members[comm[id]]||[]).push(id);});
  const order=Object.keys(members).sort((a,b)=>members[b].length-members[a].length);
  const hub={}, color={};
  order.forEach((c,i)=>{
    if(c==="__nodeps__"){ hub[c]="No dependencies"; color[c]="#6c7d8c"; return; }
    let best=members[c][0],bd=-1; members[c].forEach(id=>{const d=deg[idx[id]];if(d>bd){bd=d;best=id;}});
    hub[c]=byId(best)?byId(best).name:best;
    color[c]=hslHex((i*0.61803398875)%1, 0.55, 0.63);
  });
  return {comm, hub, color};
}
function buildElements(){
  const els=[];
  const confSeen=new Set();   // dedupe symmetric conflict pairs to a single edge
  // level map only needed when the L1 M&T hide is on. computeLevels() is a pure requires-graph
  // longest-path (layout-independent), so it's equally valid in the hierarchy and force views.
  const lvlMap=hideL1MT?computeLevels():null;
  const inc=new Set(state.mods.filter(m=>!isFilteredOut(m,lvlMap)).map(m=>m.id));  // ids present in the graph
  const shown=id=>inc.has(id);
  // Force view "Group clusters": wrap each mod in a compound box for its detected community, so
  // fcose keeps a cluster together and the boxes get pushed apart. Node colour follows the cluster
  // (not the category) here. Omitted in the tree view and when the toggle is off.
  const grouped = curLayout==="force" && groupByCluster;
  let CM=null;
  if(grouped){
    CM=detectCommunities(inc, clusterResolution);
    const cset=new Set(); inc.forEach(id=>cset.add(CM.comm[id]));
    lastClusterCount=cset.size;
    cset.forEach(c=>els.push({data:{id:"grp::"+c,label:CM.hub[c]||"Cluster",color:CM.color[c]||"#6c7d8c"},classes:"catgroup"}));
  }
  state.mods.forEach(m=>{
    if(!inc.has(m.id))return;
    const d={id:m.id,label:m.name,cat:m.cat,adult:!!m.adult};
    if(grouped){ const c=CM.comm[m.id]; d.parent="grp::"+c; d.gcolor=CM.color[c]; }
    els.push({data:d,classes:m.enabled?"":"off"});
  });
  state.mods.forEach(m=>{
    if(!inc.has(m.id))return;
    (m.requires||[]).forEach(r=>{
      if(r.k==="mod"&&shown(r.ref)) els.push({data:{id:`e_req_${r.ref}_${m.id}`,source:r.ref,target:m.id},classes:"req"+(upstreamVia(m,r.ref)?" redundant":"")});
    });
    (m.conflicts||[]).forEach(r=>{if(r.k==="mod"&&shown(r.ref)){const ck=[m.id,r.ref].sort().join("__");if(!confSeen.has(ck)){confSeen.add(ck);els.push({data:{id:`e_cf_${ck}`,source:m.id,target:r.ref},classes:"conf"});}}});
    (m.loadAfter||[]).forEach(ref=>{if(shown(ref))els.push({data:{id:`e_la_${ref}_${m.id}`,source:ref,target:m.id},classes:"la"});});
    (m.patchFor||[]).forEach(r=>{if(r.k==="mod"&&shown(r.ref))els.push({data:{id:`e_pf_${m.id}_${r.ref}`,source:m.id,target:r.ref},classes:"patch"});});
    (m.anyOf||[]).forEach((g,gi)=>{(g.mods||[]).forEach(ref=>{if(shown(ref))els.push({data:{id:`e_any_${gi}_${ref}_${m.id}`,source:ref,target:m.id},classes:"anyof"+(g.exclusive?" anyofx":"")});});});
  });
  // cardinal "Skyrim" root: parent every included node whose dependencies are all
  // absent (either genuinely rootless, or its only deps got filtered out)
  if(showRoot){
    els.push({data:{id:ROOT_ID,label:"Skyrim",cat:"__base__"},classes:"base"});
    state.mods.forEach(m=>{
      if(!inc.has(m.id))return;
      const hasHard=depsOfMod(m).filter(d=>shown(d)).length>0;
      const hasAny=(m.anyOf||[]).some(g=>(g.mods||[]).some(id=>shown(id)));
      if(!hasHard&&!hasAny) els.push({data:{id:`e_root_${m.id}`,source:ROOT_ID,target:m.id},classes:"rootlink"});
    });
  }
  return els;
}
function cyStyle(){
  return [
    {selector:"node",style:{"background-color":ele=>ele.data("gcolor")||catColor(ele.data("cat")),"label":"data(label)",
      "color":"#dfe8ef","font-size":"10px","font-family":"IBM Plex Sans, sans-serif","text-wrap":"wrap",
      "text-max-width":"96px","text-valign":"bottom","text-margin-y":4,"width":18,"height":18,
      "border-width":2,"border-color":"#0b0f14","text-outline-width":2,"text-outline-color":"#0b0f14"}},
    {selector:"node.off",style:{"opacity":.32,"font-size":"9px"}},
    {selector:"node.catgroup",style:{"shape":"round-rectangle","background-color":"data(color)","background-opacity":0.05,
      "border-width":1.5,"border-color":"data(color)","border-opacity":0.5,"label":"data(label)","text-valign":"top",
      "text-halign":"center","font-family":"Cinzel, serif","font-size":"14px","font-weight":700,"color":"data(color)",
      "text-margin-y":-6,"padding":"20px","text-outline-width":2,"text-outline-color":"#0b0f14"}},
    {selector:"node.base",style:{"background-color":"#f4f9fb","shape":"round-diamond","width":30,"height":30,
      "font-family":"Cinzel, serif","font-size":"13px","font-weight":700,"color":"#f4f9fb","border-width":2,"border-color":"#74d4e3","text-margin-y":5}},
    {selector:"node.adultnode",style:{"border-width":3,"border-color":"#a98fd4"}},
    {selector:"node.warnnode",style:{"border-width":3,"border-color":"#e0685f"}},
    {selector:"node.reviewnode",style:{"outline-width":3,"outline-color":"#e0a94e","outline-opacity":.95,"outline-offset":2}},
    {selector:"node.flash",style:{"border-width":4,"border-color":"#74d4e3"}},
    {selector:"node.inspectnode",style:{"outline-width":4,"outline-color":"#74d4e3","outline-opacity":.9,"outline-offset":3}},
    {selector:"node.dim",style:{"opacity":.12}},
    {selector:"edge",style:{"curve-style":"bezier","width":1.4,"target-arrow-shape":"triangle",
      "arrow-scale":.8,"line-color":"#7f93a6","target-arrow-color":"#7f93a6","opacity":.55}},
    {selector:"edge.conf",style:{"line-color":"#e0685f","target-arrow-color":"#e0685f","source-arrow-color":"#e0685f","line-style":"dashed","target-arrow-shape":"tee","source-arrow-shape":"tee"}},
    {selector:"edge.la",style:{"line-color":"#6c7d8c","target-arrow-color":"#6c7d8c","line-style":"dotted","opacity":.4}},
    {selector:"edge.patch",style:{"line-color":"#e0a94e","target-arrow-color":"#e0a94e","line-style":"dashed","target-arrow-shape":"diamond","width":1.6}},
    {selector:"edge.redundant",style:{"line-style":"dotted","opacity":.2,"line-color":"#6c7d8c","target-arrow-color":"#6c7d8c","width":1}},
    {selector:"edge.rootlink",style:{"line-color":"#3d8fa0","target-arrow-color":"#3d8fa0","opacity":.3,"width":1,"target-arrow-shape":"none"}},
    {selector:"edge.anyof",style:{"line-color":"#69c07a","target-arrow-color":"#69c07a","line-style":"dashed","width":1.6,"target-arrow-shape":"triangle","opacity":.6}},
    {selector:"edge.anyofx",style:{"line-color":"#a98fd4","target-arrow-color":"#a98fd4"}},
    {selector:"edge.dim",style:{"opacity":.06}},
    {selector:"edge.hi",style:{"opacity":1,"width":2.4}}
  ];
}
function layoutCfg(kind){
  if(kind==="force"){
    const base={name:"fcose",animate:false,quality:"default",randomize:true,packComponents:true,
      numIter:2500,padding:20,nodeDimensionsIncludeLabels:true};
    // grouped: tight (high gravity, low repulsion, strong compound gravity) so clusters pack small;
    // plain fcose: moderate spread.
    if(groupByCluster) return Object.assign(base,{nodeSeparation:35,idealEdgeLength:45,nodeRepulsion:4000,
      gravity:0.7,gravityRange:2.2,gravityCompound:3.0,gravityRangeCompound:1.6,nestingFactor:0.9});
    return Object.assign(base,{nodeSeparation:80,idealEdgeLength:70,nodeRepulsion:9000,gravity:0.35,gravityRange:3.2});
  }
  const roots=showRoot?[ROOT_ID]:state.mods.filter(m=>depsOfMod(m).length===0).map(m=>m.id);
  // maximal:true = longest-path (DAG) layering — a mod is placed BELOW everything it requires,
  // instead of breadthfirst's default shortest-hop depth (which let a mod with a short alternate
  // route to the root sit above one of its own dependencies).
  return {name:"breadthfirst",directed:true,maximal:true,padding:30,spacingFactor:0.75,avoidOverlap:true,nodeDimensionsIncludeLabels:true,roots};
}
// fit the viewport to only the visible (non-filtered) nodes
function fitVisible(){if(!cyReady||!cy)return;const vis=cy.elements(":visible");if(vis.length)cy.fit(vis,30);}
// After the grouped force layout, push the cluster compound boxes apart so they don't overlap.
// fcose keeps each cluster's members together but doesn't guarantee the boxes separate; this is an
// iterative minimum-translation rectangle separation, moving each box's children along with it.
function separateGroupBoxes(){
  if(!cy)return;
  const parents=cy.nodes().filter(n=>n.isParent());
  if(parents.length<2)return;
  const PAD=20;
  const info=()=>parents.map(p=>{const bb=p.boundingBox({includeLabels:false});
    return {p, x:(bb.x1+bb.x2)/2, y:(bb.y1+bb.y2)/2, hw:bb.w/2+PAD, hh:bb.h/2+PAD};});
  for(let iter=0;iter<1200;iter++){
    const B=info(), disp={}; parents.forEach(p=>disp[p.id()]={x:0,y:0}); let moved=false;
    for(let i=0;i<B.length;i++)for(let j=i+1;j<B.length;j++){
      const a=B[i],b=B[j]; let dx=b.x-a.x,dy=b.y-a.y; if(!dx&&!dy){dx=Math.random()-0.5;dy=Math.random()-0.5;}
      const ox=(a.hw+b.hw)-Math.abs(dx), oy=(a.hh+b.hh)-Math.abs(dy);
      if(ox>0&&oy>0){ moved=true;
        if(ox<oy){const s=(dx<0?-1:1)*ox/2; disp[a.p.id()].x-=s; disp[b.p.id()].x+=s;}
        else{const s=(dy<0?-1:1)*oy/2; disp[a.p.id()].y-=s; disp[b.p.id()].y+=s;}
      }
    }
    if(!moved)break;
    parents.forEach(p=>{const d=disp[p.id()]; if(d.x||d.y) p.children().positions(ele=>({x:ele.position('x')+d.x,y:ele.position('y')+d.y}));});
  }
}
// The hierarchy is defined by REQUIRES only. Patch / conflict / load-after links still render,
// but they must NOT drive the tree levels — a "patches" link isn't "depends on", and feeding it
// into the layout distorts depths (foundational, heavily-patched mods like USSEP sink below their
// own patches) and can even create cycles. So the breadthfirst layout runs on the requires + the
// root-link subgraph only; the force layout can use everything (it's organic, no levels).
// ---- hierarchy level = requires-only longest-path depth (the TRUE dependency level) ----
// A mod sits one tier below the deepest thing it REQUIRES. Patch / conflict / load-after links
// are not dependencies, so they never move a mod's level. ROOT is tier 0; a mod with no (shown)
// requirements sits at tier 1 under the Skyrim root (tier 0 when the root is hidden).
// This is computed in code and used BOTH to position the tree and to show the number in the
// inspector — so the rendered tier always matches the reported level (cytoscape's own
// breadthfirst depth was unreliable: it let short alternate routes float a mod above its deps).
function computeLevels(){
  const lvl={}, visiting={};
  const base = showRoot ? 1 : 0;
  function depth(id){
    if(lvl[id]!==undefined) return lvl[id];
    if(visiting[id]) return lvl[id]=base;          // cycle guard (requires graph should be acyclic)
    visiting[id]=true;
    const m=byId(id);
    const ds=m?depsOfMod(m):[];
    let lv= ds.length ? Math.max(...ds.map(depth))+1 : base;
    // any-of groups: a mod sits one tier below the SHALLOWEST resolvable option of each group
    (m&&m.anyOf||[]).forEach(g=>{const ms=(g.mods||[]).map(x=>byId(x)).filter(Boolean);
      if(ms.length) lv=Math.max(lv, Math.min(...ms.map(x=>depth(x.id)))+1);});
    lvl[id]=lv;
    visiting[id]=false;
    return lvl[id];
  }
  state.mods.forEach(m=>depth(m.id));
  return lvl;
}
// deterministic tiered positions: y = level; within a level, order by the average x of each
// node's parents (barycenter) to keep edges short and crossings low.
function tieredPositions(vis){
  const lvl=computeLevels();
  const visIds=new Set(vis.nodes().map(n=>n.id()));
  const levelOf=id=> id===ROOT_ID?0 : (lvl[id]!==undefined?lvl[id]:(showRoot?1:0));
  const parents={};
  state.mods.forEach(m=>{ if(visIds.has(m.id)){ let ds=depsOfMod(m).filter(d=>visIds.has(d)); (m.anyOf||[]).forEach(g=>(g.mods||[]).forEach(id=>{if(visIds.has(id)&&!ds.includes(id))ds.push(id);})); parents[m.id]= ds.length?ds:(showRoot?[ROOT_ID]:[]); } });
  const byLevel={};
  visIds.forEach(id=>{ const L=levelOf(id); (byLevel[L]=byLevel[L]||[]).push(id); });
  const xGap=150, yGap=120, pos={}, xPos={};
  Object.keys(byLevel).map(Number).sort((a,b)=>a-b).forEach(L=>{
    const row=byLevel[L].sort((a,b)=>{
      const px=ids=>{const v=(ids||[]).map(p=>xPos[p]).filter(n=>n!==undefined);return v.length?v.reduce((s,n)=>s+n,0)/v.length:1e9;};
      const ba=px(parents[a]), bb=px(parents[b]);
      if(ba!==bb) return ba-bb;
      return (byId(a)?byId(a).name:a).localeCompare(byId(b)?byId(b).name:b);
    });
    // centre each level's row on x=0 so the whole tree is symmetric rather than left-aligned
    row.forEach((id,i)=>{ const x=(i-(row.length-1)/2)*xGap; xPos[id]=x; pos[id]={x, y:L*yGap}; });
  });
  return pos;
}
// ---- node sizing by dependent count (force view only) ----
// How many OTHER mods transitively depend on this one (walk the requires edges upward).
// Foundational libraries (SKSE, Address Library) and the Skyrim root come out largest.
function dependentsCount(){
  const revKids={};                       // id -> ids that directly require it
  state.mods.forEach(m=>depsOfMod(m).forEach(d=>{(revKids[d]=revKids[d]||[]).push(m.id);}));
  const out={};
  state.mods.forEach(m=>{
    const seen=new Set(), stack=[...(revKids[m.id]||[])];
    while(stack.length){const x=stack.pop();if(seen.has(x))continue;seen.add(x);
      (revKids[x]||[]).forEach(y=>{if(!seen.has(y))stack.push(y);});}
    out[m.id]=seen.size;
  });
  return out;
}
function updateSizeBtn(){const b=document.getElementById("toggle-sizedeps");if(!b)return;
  b.textContent="Size by deps: "+(sizeByDeps?"on":"off");b.classList.toggle("primary",sizeByDeps);}
function updateHideL1Btn(){const b=document.getElementById("toggle-l1mt");if(!b)return;
  b.textContent="Hide L1 textures: "+(hideL1MT?"on":"off");b.classList.toggle("primary",hideL1MT);}
// Active only in force view with the toggle on; otherwise inline sizes are stripped so the
// stylesheet's fixed node sizes return. sqrt scaling keeps the big foundational nodes from
// dwarfing everything; the Skyrim root (everything hangs off it) is pinned to the max.
function applyNodeSizing(){
  if(!cyReady||!cy)return;
  if(!(sizeByDeps&&curLayout==="force")){cy.nodes().removeStyle("width height");return;}
  const counts=dependentsCount(), nodes=cy.nodes();
  let vmax=1;
  nodes.forEach(n=>{const id=n.id();const cnt=id===ROOT_ID?nodes.length:(counts[id]||0);if(cnt>vmax)vmax=cnt;});
  const MIN=16,MAX=70;
  cy.batch(()=>{nodes.forEach(n=>{const id=n.id();const cnt=id===ROOT_ID?nodes.length:(counts[id]||0);
    const px=Math.round(MIN+(MAX-MIN)*Math.sqrt(cnt/vmax));n.style({width:px,height:px});});});
}
// re-run the current layout on ONLY the visible nodes, then fit the view to what's left
function relayout(){
  if(!cyReady||!cy)return;
  const vis=cy.elements(":visible");
  if(!vis.length)return;
  applyNodeSizing();   // force: size by dependents (before layout); tree: strips inline sizes
  if(curLayout==="force"){
    // fcose is loaded from a CDN; if it failed to register, fall back to the built-in cose
    let cfg=layoutCfg("force"),l;
    try{ l=vis.layout(cfg); }
    catch(e){ l=vis.layout(Object.assign({},cfg,{name:"cose"})); }
    l.one("layoutstop",()=>{ if(cy.nodes().some(n=>n.isParent())) separateGroupBoxes(); fitVisible(); });
    l.run(); return;
  }
  const pos=tieredPositions(vis);
  const l=vis.layout({name:"preset",positions:n=>pos[n.id()]||{x:0,y:0},fit:false,padding:30,animate:false});
  l.one("layoutstop",fitVisible); l.run();
}
function initGraph(){
  if(typeof cytoscape==="undefined"){document.getElementById("gfb").style.display="flex";return;}
  cy=cytoscape({container:document.getElementById("cy"),elements:buildElements(),style:cyStyle(),
    layout:{name:"preset"},minZoom:.05,maxZoom:2.5,wheelSensitivity:.25});
  cyReady=true;
  cy.on("tap","node",ev=>{const id=ev.target.id();if(id===ROOT_ID||id.indexOf("grp::")===0)return;openInspector(id);});
  cy.on("mouseover","node",ev=>highlightNeighbors(ev.target));
  cy.on("mouseout","node",()=>{cy.elements().removeClass("dim hi");});
  cy.on("tap",ev=>{if(ev.target===cy)cy.elements().removeClass("dim hi");});
  refreshGraph(new Set(validate().filter(w=>w.sev!=="info").map(w=>w.mod)));
  relayout();   // requires-only breadthfirst layout + fit (initial elements already exclude persisted filters)
}
function highlightNeighbors(n){
  const hood=n.closedNeighborhood();cy.elements().addClass("dim");hood.removeClass("dim");hood.connectedEdges().addClass("hi");
}
function rebuildGraph(errSet){
  if(!cyReady||!cy)return;
  cy.batch(()=>{cy.elements().remove();cy.add(buildElements());});  // buildElements already omits filtered nodes
  relayout();                       // lay out + fit the remaining nodes (repacks the tiers)
  refreshGraph(errSet);
}
function refreshGraph(errSet){
  if(!cyReady||!cy)return;
  cy.batch(()=>{
    state.mods.forEach(m=>{const n=cy.$id(m.id);if(!n.length)return;n.toggleClass("off",!m.enabled);n.toggleClass("warnnode",errSet.has(m.id));n.toggleClass("adultnode",!!m.adult);n.toggleClass("reviewnode",!!m.needsReview);});
  });
}
function setAdultMode(m){
  adultMode=m;saveAdultMode();
  const b=document.getElementById("btn-adult");
  if(b){b.textContent="Adult: "+(m==="all"?"all":m==="only"?"only":"hidden");
    b.classList.toggle("a-only",m==="only");b.classList.toggle("a-hide",m==="hide");}
  render(true);   // rebuild excludes/includes adult nodes and repacks the graph + list
}
function flash(id){const n=cy.$id(id);if(!n.length)return;n.addClass("flash");setTimeout(()=>n.removeClass("flash"),900);}

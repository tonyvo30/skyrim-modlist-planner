/* ---------- tabs ---------- */
function setTab(t,skipRender){curTab=t;
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));
  document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id==="panel-"+t));
  // skipRender lets a caller that is about to render() anyway avoid a duplicate inspector build
  if(t==="inspector"&&!skipRender)renderInspector();
}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

/* ---------- toolbar actions ---------- */
document.getElementById("btn-add").onclick=()=>openInspector("__new__");
document.getElementById("fit").onclick=()=>{if(cyReady)fitVisible();};
function errNow(){return new Set(validate().filter(w=>w.sev!=="info").map(w=>w.mod));}
// Switching view may change the node set (force view can add cluster compound nodes), so rebuild.
document.getElementById("lay-tree").onclick=()=>{curLayout="tree";if(cyReady)rebuildGraph(errNow());else relayout();};
document.getElementById("lay-force").onclick=()=>{curLayout="force";if(cyReady)rebuildGraph(errNow());else relayout();};
document.getElementById("toggle-root").onclick=()=>{showRoot=!showRoot;document.getElementById("toggle-root").textContent="Skyrim root: "+(showRoot?"on":"off");if(cyReady)rebuildGraph(new Set(validate().filter(w=>w.sev!=="info").map(w=>w.mod)));};
document.getElementById("btn-adult").onclick=()=>{setAdultMode(adultMode==="all"?"only":adultMode==="only"?"hide":"all");};
// ---- needs-review / todo queue ----
function reviewCount(){return state.mods.filter(m=>m.needsReview).length;}
function updateReviewBtn(){const b=document.getElementById("toggle-review");if(!b)return;
  const n=reviewCount();
  b.textContent="Needs review: "+n;
  b.classList.toggle("primary",showOnlyReview);
  b.classList.toggle("has-review",n>0&&!showOnlyReview);}
document.getElementById("toggle-review").onclick=()=>{
  if(!showOnlyReview && reviewCount()===0){toast("Nothing flagged for review");return;}
  showOnlyReview=!showOnlyReview; render(true); updateReviewBtn();
};
let legendMin=false;
function saveLegendMin(){try{localStorage.setItem("skyrim-planner-legendmin",legendMin?"1":"0");}catch(e){}}
function loadLegendMin(){try{legendMin=localStorage.getItem("skyrim-planner-legendmin")==="1";}catch(e){}}
function applyLegendMin(){const body=document.getElementById("legend-body"),btn=document.getElementById("legend-toggle"),leg=document.getElementById("legend2");
  if(!body||!btn)return; body.hidden=legendMin; btn.textContent=legendMin?"Legend +":"Legend -"; btn.title=legendMin?"Show legend":"Minimize legend"; if(leg)leg.classList.toggle("min",legendMin);}
document.getElementById("legend-toggle").onclick=()=>{legendMin=!legendMin;saveLegendMin();applyLegendMin();};
document.getElementById("toggle-sizedeps").onclick=()=>{sizeByDeps=!sizeByDeps;saveSizeByDeps();updateSizeBtn();if(cyReady){if(curLayout==="force")relayout();else applyNodeSizing();}};
document.getElementById("toggle-l1mt").onclick=()=>{hideL1MT=!hideL1MT;saveHideL1MT();updateHideL1Btn();if(cyReady)rebuildGraph(errNow());};
// ---- organic clustering (force view) ----
function updateClusterUI(){
  const b=document.getElementById("toggle-cluster"), w=document.getElementById("cluster-res-wrap"),
        v=document.getElementById("cluster-res-val"), s=document.getElementById("cluster-res");
  if(!b)return;
  b.textContent="Group clusters: "+(groupByCluster?"on":"off");
  b.classList.toggle("primary",groupByCluster);
  if(w)w.hidden=!groupByCluster;
  if(s)s.value=String(clusterResolution);
  if(v)v.textContent=groupByCluster?(clusterResolution.toFixed(1)+" · "+(lastClusterCount||0)+" clusters"):"";
}
document.getElementById("toggle-cluster").onclick=()=>{
  groupByCluster=!groupByCluster; saveGroupByCluster();
  if(groupByCluster) curLayout="force";   // clusters only render in the force view
  if(cyReady)rebuildGraph(errNow());
  updateClusterUI();
};
(function(){
  const s=document.getElementById("cluster-res"), v=document.getElementById("cluster-res-val");
  if(!s)return;
  s.oninput=()=>{clusterResolution=parseFloat(s.value)||1; if(v)v.textContent=clusterResolution.toFixed(1)+" · …";};
  s.onchange=()=>{clusterResolution=parseFloat(s.value)||1; saveClusterRes();
    if(cyReady&&groupByCluster){rebuildGraph(errNow());} updateClusterUI();};
})();

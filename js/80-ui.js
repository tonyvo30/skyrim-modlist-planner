/* ---------- tabs ---------- */
function setTab(t){curTab=t;
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));
  document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id==="panel-"+t));
  if(t==="inspector")renderInspector();
}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

/* ---------- toolbar actions ---------- */
document.getElementById("btn-add").onclick=()=>openInspector("__new__");
document.getElementById("fit").onclick=()=>{if(cyReady)fitVisible();};
document.getElementById("lay-tree").onclick=()=>{curLayout="tree";relayout();};
document.getElementById("lay-force").onclick=()=>{curLayout="force";relayout();};
document.getElementById("toggle-root").onclick=()=>{showRoot=!showRoot;document.getElementById("toggle-root").textContent="Skyrim root: "+(showRoot?"on":"off");if(cyReady)rebuildGraph(new Set(validate().filter(w=>w.sev!=="info").map(w=>w.mod)));};
document.getElementById("btn-adult").onclick=()=>{setAdultMode(adultMode==="all"?"only":adultMode==="only"?"hide":"all");};
let legendMin=false;
function saveLegendMin(){try{localStorage.setItem("skyrim-planner-legendmin",legendMin?"1":"0");}catch(e){}}
function loadLegendMin(){try{legendMin=localStorage.getItem("skyrim-planner-legendmin")==="1";}catch(e){}}
function applyLegendMin(){const body=document.getElementById("legend-body"),btn=document.getElementById("legend-toggle"),leg=document.getElementById("legend2");
  if(!body||!btn)return; body.hidden=legendMin; btn.textContent=legendMin?"Legend +":"Legend -"; btn.title=legendMin?"Show legend":"Minimize legend"; if(leg)leg.classList.toggle("min",legendMin);}
document.getElementById("legend-toggle").onclick=()=>{legendMin=!legendMin;saveLegendMin();applyLegendMin();};
document.getElementById("toggle-sizedeps").onclick=()=>{sizeByDeps=!sizeByDeps;saveSizeByDeps();updateSizeBtn();if(cyReady){if(curLayout==="force")relayout();else applyNodeSizing();}};

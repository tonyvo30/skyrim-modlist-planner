/* ---------- boot ---------- */
loadCatFilter();
loadAdultMode();
loadSizeByDeps();
loadMsgSev();
loadLegendMin();
render(true);
initGraph();
// reflect loaded adult mode on the toolbar button
(()=>{const b=document.getElementById("btn-adult");if(!b)return;
  b.textContent="Adult: "+(adultMode==="all"?"all":adultMode==="only"?"only":"hidden");
  b.classList.toggle("a-only",adultMode==="only");b.classList.toggle("a-hide",adultMode==="hide");})();
updateSizeBtn();
applyLegendMin();
initPersistence();

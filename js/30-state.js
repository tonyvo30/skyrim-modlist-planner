/* ---------- state ---------- */
let state = {mods: clone(DEFAULT_CATALOG), updatedAt: 0};
let selected = null;      // mod id in inspector, or "__new__"
let editing = null;       // working copy for inspector
let curTab = "warnings";
let searchTxt = "";
let cy = null, cyReady = false, curLayout = "tree", showRoot = true;
let hiddenCats = new Set();   // category keys filtered out of the graph
let adultMode = "all";        // "all" | "only" | "hide" — how adult-flagged mods are shown
let sizeByDeps = false;       // force view only: scale node size by how many mods depend on it
const ROOT_ID = "__skyrim__";
function saveCatFilter(){try{localStorage.setItem("skyrim-planner-hiddencats",JSON.stringify([...hiddenCats]));}catch(e){}}
function loadCatFilter(){try{const r=localStorage.getItem("skyrim-planner-hiddencats");if(r)JSON.parse(r).forEach(k=>hiddenCats.add(k));}catch(e){}}
function saveAdultMode(){try{localStorage.setItem("skyrim-planner-adultmode",adultMode);}catch(e){}}
function loadAdultMode(){try{const r=localStorage.getItem("skyrim-planner-adultmode");if(r==="all"||r==="only"||r==="hide")adultMode=r;}catch(e){}}
function saveSizeByDeps(){try{localStorage.setItem("skyrim-planner-sizedeps",sizeByDeps?"1":"0");}catch(e){}}
function loadSizeByDeps(){try{sizeByDeps=localStorage.getItem("skyrim-planner-sizedeps")==="1";}catch(e){}}
let hideL1MT = false;         // hierarchy + force views: hide level-1 Models & Textures mods to declutter
function saveHideL1MT(){try{localStorage.setItem("skyrim-planner-hidel1mt",hideL1MT?"1":"0");}catch(e){}}
function loadHideL1MT(){try{hideL1MT=localStorage.getItem("skyrim-planner-hidel1mt")==="1";}catch(e){}}
let groupByCluster = false;   // force view: box mods into organic communities detected from the dep graph
function saveGroupByCluster(){try{localStorage.setItem("skyrim-planner-groupcluster",groupByCluster?"1":"0");}catch(e){}}
function loadGroupByCluster(){try{groupByCluster=localStorage.getItem("skyrim-planner-groupcluster")==="1";}catch(e){}}
let clusterResolution = 1;    // Louvain resolution: higher = more, smaller clusters
function saveClusterRes(){try{localStorage.setItem("skyrim-planner-clusterres",String(clusterResolution));}catch(e){}}
function loadClusterRes(){try{const r=parseFloat(localStorage.getItem("skyrim-planner-clusterres"));if(isFinite(r)&&r>0)clusterResolution=r;}catch(e){}}
let msgSevHidden=new Set();   // message severities hidden in the Messages tab
function saveMsgSev(){try{localStorage.setItem("skyrim-planner-msgsev",JSON.stringify([...msgSevHidden]));}catch(e){}}
function loadMsgSev(){try{const r=localStorage.getItem("skyrim-planner-msgsev");if(r)JSON.parse(r).forEach(s=>msgSevHidden.add(s));}catch(e){}}
let db = null, docRef = null, saveTimer = null;
const myWriter = Math.random().toString(36).slice(2) + "-" + Date.now();
let pendingWrite = false;
let lastSynced = null;  // JSON of mods that matches the server; local != this means we have unsynced edits

function clone(x){return JSON.parse(JSON.stringify(x));}
function byId(id){return state.mods.find(m=>m.id===id);}
function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48)||("mod-"+Math.random().toString(36).slice(2,7));}
function uniqId(base){let id=base,n=2;while(byId(id)){id=base+"-"+n++;}return id;}

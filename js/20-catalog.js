/* ---------- seed catalog: the Phase 1 foundation, pre-wired ---------- */
function R(k,ref){return {k,ref};}
const DEFAULT_CATALOG = [
  {id:"skse",name:"SKSE64",cat:"core",type:"tool",enabled:true,pin:"2.0.20",requires:[],conflicts:[],loadAfter:[],note:"Hard version pin. Not version-independent."},
  {id:"address-library",name:"Address Library",cat:"core",type:"skse-dll",enabled:true,pin:"All in one (SE)",requires:[R("mod","skse")],conflicts:[],loadAfter:[],note:"Makes other DLLs version-independent."},
  {id:"engine-fixes",name:"SSE Engine Fixes",cat:"core",type:"skse-dll",enabled:true,pin:"SE + Part 2",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:"Part 2 is a manual drop into game root."},
  {id:"bees",name:"Backported ESL Support",cat:"core",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},
  {id:"po3-tweaks",name:"powerofthree's Tweaks",cat:"core",type:"skse-dll",enabled:true,pin:"1.5.97 build",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},
  {id:"bugfixes",name:"Bug Fixes SSE",cat:"core",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},
  {id:"scrambled-bugs",name:"Scrambled Bugs",cat:"core",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},

  {id:"crash-logger",name:"Crash Logger SSE",cat:"diag",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:"Primary crash logger."},
  {id:"net-script",name:".NET Script Framework",cat:"diag",type:"skse-dll",enabled:false,pin:"v18",requires:[R("mod","skse")],conflicts:[],loadAfter:[],note:"Enable only if a mod requires it."},
  {id:"mic",name:"More Informative Console",cat:"diag",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},

  {id:"papyrusutil",name:"PapyrusUtil SE",cat:"fw",type:"skse-dll",enabled:true,pin:"3.9",requires:[R("mod","skse")],conflicts:[],loadAfter:[],note:""},
  {id:"po3-papyrus",name:"po3's Papyrus Extender",cat:"fw",type:"skse-dll",enabled:true,pin:"5.6.1",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:"NOT 6.x/7.x."},
  {id:"jcontainers",name:"JContainers SE",cat:"fw",type:"skse-dll",enabled:true,pin:"4.1.13",requires:[R("mod","skse")],conflicts:[],loadAfter:[],note:""},
  {id:"consoleutil",name:"ConsoleUtilSSE NG",cat:"fw",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},
  {id:"skyui",name:"SkyUI",cat:"ui",type:"esp",enabled:true,pin:"5.2 SE",requires:[R("mod","skse")],conflicts:[],loadAfter:[],note:""},
  {id:"mcm-helper",name:"MCM Helper",cat:"fw",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","skyui")],conflicts:[],loadAfter:[],note:""},
  {id:"dsd",name:"Dynamic String Distributor",cat:"fw",type:"skse-dll",enabled:false,pin:"",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:"Increasingly required by UI/translation mods."},

  {id:"spid",name:"SPID",cat:"dist",type:"skse-dll",enabled:true,pin:"6.6.2",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:"NOT 7.x."},
  {id:"kid",name:"Keyword Item Distributor",cat:"dist",type:"skse-dll",enabled:true,pin:"3.0.4",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},
  {id:"bos",name:"Base Object Swapper",cat:"dist",type:"skse-dll",enabled:true,pin:"2.6.x",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},
  {id:"skypatcher",name:"SkyPatcher",cat:"dist",type:"skse-dll",enabled:true,pin:"SE",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},
  {id:"animobject-swapper",name:"AnimObject Swapper",cat:"dist",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},

  {id:"fuzrodoh",name:"Fuz Ro D'oh",cat:"ui",type:"esp",enabled:true,pin:"",requires:[R("mod","skse")],conflicts:[],loadAfter:[],note:""},
  {id:"scaleform",name:"Scaleform Translation++ NG",cat:"ui",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},

  {id:"ussep",name:"USSEP",cat:"beth",type:"esp",enabled:true,pin:"4.2.5b",requires:[],conflicts:[],loadAfter:[],note:"Last 1.5.97 release. A master — pin it."},
  {id:"landwater",name:"Skyrim Landscape & Water Fixes",cat:"beth",type:"esp",enabled:true,pin:"",requires:[R("mod","ussep")],conflicts:[],loadAfter:["ussep"],note:""},

  {id:"actor-limit",name:"Actor Limit Fix",cat:"fix",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},
  {id:"animlimit",name:"Animation Limit Crash Fix",cat:"fix",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","skse")],conflicts:[],loadAfter:[],note:""},
  {id:"cellfreeze",name:"Cell Load Freeze Fix NG",cat:"fix",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},
  {id:"mfgfix",name:"Mfg Fix",cat:"fix",type:"skse-dll",enabled:true,pin:"1.5.97",requires:[R("mod","address-library")],conflicts:[],loadAfter:[],note:""},
  {id:"ach-enabler",name:"Achievements Mods Enabler",cat:"fix",type:"skse-dll",enabled:false,pin:"",requires:[R("mod","skse")],conflicts:[R("mod","engine-fixes")],loadAfter:[],note:"Redundant — Engine Fixes already enables achievements."},

  {id:"display-tweaks",name:"SSE Display Tweaks",cat:"perf",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","skse")],conflicts:[],loadAfter:[],note:"Frame cap + physics only; let the upscaler own internal resolution."},
  {id:"skyrim-priority",name:"Skyrim Priority SE AE",cat:"perf",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","skse")],conflicts:[],loadAfter:[],note:""},

  {id:"enb-binary",name:"ENBSeries binary",cat:"enb",type:"enb",enabled:true,pin:"per Pi-Cho",requires:[],conflicts:[],loadAfter:[],note:"Manual to game root. Match the version Pi-Cho lists."},
  {id:"enb-helper",name:"ENB Helper SE",cat:"enb",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","enb-binary")],conflicts:[],loadAfter:["enb-binary"],note:""},
  {id:"picho",name:"Pi-Cho ENB",cat:"enb",type:"enb",enabled:true,pin:"carried over",requires:[R("mod","enb-binary"),R("mod","obsidian")],conflicts:[],loadAfter:["enb-binary"],note:"Tuned for a specific weather mod — swapping weather will flag here."},
  {id:"obsidian",name:"Obsidian Weathers",cat:"weather",type:"esp",enabled:true,pin:"example",requires:[R("mod","ussep")],conflicts:[],loadAfter:["ussep"],note:"Example weather provider — swap for your Pi-Cho-matched weather."},

  {id:"reshade-addon",name:"ReShade (Addon build)",cat:"up",type:"reshade",enabled:true,pin:"Addon variant",requires:[],conflicts:[],loadAfter:[],note:"Must be the Add-on build for PureDark."},
  {id:"dll-loader",name:"DLL Plugin Loader",cat:"up",type:"tool",enabled:true,pin:"",requires:[],conflicts:[],loadAfter:[],note:""},
  {id:"upscaler-base",name:"Upscaler Base Plugin",cat:"up",type:"skse-dll",enabled:true,pin:"",requires:[R("mod","skse")],conflicts:[],loadAfter:[],note:""},
  {id:"puredark",name:"PureDark AIO Upscaler",cat:"up",type:"reshade",enabled:true,pin:"paid · carried",requires:[R("mod","upscaler-base"),R("mod","dll-loader"),R("mod","reshade-addon")],conflicts:[],loadAfter:["enb-binary","display-tweaks"],note:"DLSS path on the 4090 (frame-gen GPU). Renders before ENB."},

  {id:"resourcepack",name:"_ResourcePack.esl",cat:"content",type:"esl",enabled:true,pin:"",requires:[R("mod","bees")],conflicts:[],loadAfter:[],note:"Shared asset bundle for the free CC content. v1.71 header — needs BEES on 1.5.97 or the game CTDs."},
  {id:"cc-survival",name:"Survival Mode (CC)",cat:"content",type:"esl",enabled:true,pin:"ccQDRSSE001",requires:[R("mod","bees")],conflicts:[],loadAfter:[],note:"Free CC content. v1.71 header — needs BEES on 1.5.97."},
  {id:"cc-curios",name:"Rare Curios (CC)",cat:"content",type:"esl",enabled:true,pin:"ccBGSSSE037",requires:[R("mod","resourcepack")],conflicts:[],loadAfter:["resourcepack"],note:"Uses _ResourcePack assets. Needs BEES on 1.5.97."},
  {id:"cc-saints",name:"Saints & Seducers (CC)",cat:"content",type:"esm",enabled:true,pin:"ccBGSSSE025",requires:[R("mod","resourcepack")],conflicts:[],loadAfter:["resourcepack"],note:"AdvDSGS. Uses _ResourcePack assets. Needs BEES on 1.5.97."},
  {id:"cc-fishing",name:"Fishing (CC)",cat:"content",type:"esm",enabled:true,pin:"ccBGSSSE001",requires:[R("mod","bees")],conflicts:[],loadAfter:[],note:"Free CC content. v1.71 header — needs BEES on 1.5.97."}
];

migrateMods(DEFAULT_CATALOG);  // seed uses MO2-style category names

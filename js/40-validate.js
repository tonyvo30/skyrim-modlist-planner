/* ---------- upstream / transitive dependency analysis ---------- */
// mod ids this mod DIRECTLY depends on: hard mod-requires
function depsOfMod(m){const out=[];(m.requires||[]).forEach(r=>{
  if(r.k==="mod"&&byId(r.ref))out.push(r.ref);
});return out;}
function depsOfId(id){const m=byId(id);return m?depsOfMod(m):[];}
// If mod m can reach targetId through its OTHER dependencies (not the direct m->target edge),
// return the name of the intermediary dependency it routes through; else null. targetId is then
// already an UPSTREAM (transitive) dependency, so a direct link to it is redundant.
function upstreamVia(m,targetId){
  const firstHops=depsOfMod(m).filter(x=>x!==targetId);
  for(const d of firstHops){
    if(d===targetId)continue;
    const seen=new Set([d]);const stack=[d];
    while(stack.length){const c=stack.pop();
      for(const n of depsOfId(c)){if(n===targetId){const dm=byId(d);return dm?dm.name:d;}
        if(!seen.has(n)){seen.add(n);stack.push(n);}}}
  }
  return null;
}

/* ---------- validation ---------- */
function validate(){
  const warns = [];

  state.mods.forEach(m=>{
    // dangling refs (always check)
    (m.requires||[]).forEach(r=>{
      if(r.k==="mod" && !byId(r.ref)) warns.push({sev:"warn",mod:m.id,type:"dangling",msg:`requires unknown mod "${r.ref}"`});
    });
    (m.conflicts||[]).forEach(r=>{if(r.k==="mod" && !byId(r.ref)) warns.push({sev:"info",mod:m.id,type:"dangling",msg:`conflicts with unknown mod "${r.ref}"`});});
    // redundant (transitive) requires: a direct link to something already reachable upstream
    (m.requires||[]).forEach(r=>{
      if(r.k==="mod" && byId(r.ref)){
        const via=upstreamVia(m,r.ref);
        if(via) warns.push({sev:"info",mod:m.id,type:"redundant",msg:`requires ${byId(r.ref).name} directly, but it's already upstream via ${via} — the direct link is redundant`,focus:r.ref});
      }
    });
    // patches (main mods) — soft/available: recommend when all targets are on, warn when the patch is on but a target is off
    const pf=(m.patchFor||[]).filter(r=>r.k==="mod");
    if(pf.length){
      const targets=pf.map(r=>byId(r.ref)).filter(Boolean);
      if(m.enabled){
        pf.forEach(r=>{const t=byId(r.ref);
          if(!t) warns.push({sev:"warn",mod:m.id,type:"patch",msg:`patches unknown mod "${r.ref}"`});
          else if(!t.enabled) warns.push({sev:"error",mod:m.id,type:"patch",msg:`patch for ${t.name}, which is disabled — the patch needs it (missing master)`,focus:r.ref});
        });
      } else if(targets.length===pf.length && targets.length && targets.every(t=>t.enabled)){
        warns.push({sev:"info",mod:m.id,type:"patch",msg:`all its main mods (${targets.map(t=>t.name).join(", ")}) are enabled — this compatibility patch is available; consider enabling it`,focus:targets[0].id});
      }
    }
    // any-of (OR) requirement groups: satisfied when >=1 member is enabled; exclusive flag warns if >1 on
    (m.anyOf||[]).forEach(g=>{
      const members=g.mods||[];
      const resolved=members.map(id=>byId(id)).filter(Boolean);
      members.forEach(id=>{ if(!byId(id)) warns.push({sev:"info",mod:m.id,type:"anyof",msg:`any-of option references unknown mod "${id}"`}); });
      const enabledMembers=resolved.filter(t=>t.enabled);
      if(g.exclusive && enabledMembers.length>1)
        warns.push({sev:"warn",mod:m.id,type:"anyof",msg:`exclusive any-of group has ${enabledMembers.length} enabled at once (${enabledMembers.map(t=>t.name).join(", ")}) — keep only one active`, focus:enabledMembers[1].id});
      if(m.enabled && resolved.length && enabledMembers.length===0)
        warns.push({sev:"error",mod:m.id,type:"anyof",msg:`needs one of: ${resolved.map(t=>t.name).join(", ")} — none are enabled`, focus:resolved[0].id});
    });
    if(!m.enabled) return;
    // hard requires
    (m.requires||[]).forEach(r=>{
      if(r.k==="mod"){
        const t=byId(r.ref);
        if(t && !t.enabled) warns.push({sev:"error",mod:m.id,type:"req",msg:`needs ${t.name}, which is disabled`, focus:r.ref});
      }
    });
  });
  // conflicts are symmetric: one warning per unordered pair (declared on either side), when both enabled
  const confSeen=new Set();
  state.mods.forEach(m=>{
    (m.conflicts||[]).forEach(r=>{
      if(r.k!=="mod")return; const t=byId(r.ref); if(!t)return;
      const key=[m.id,t.id].sort().join("__");
      if(confSeen.has(key))return; confSeen.add(key);
      if(m.enabled && t.enabled) warns.push({sev:"warn",mod:m.id,type:"conflict",msg:`conflicts with ${t.name} (both enabled)`, focus:t.id});
    });
  });
  // stable order: error, warn, info
  const rank={error:0,warn:1,info:2};
  warns.sort((a,b)=>rank[a.sev]-rank[b.sev]);
  return warns;
}

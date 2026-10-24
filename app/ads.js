// ads.js — Ad Campaigns feature (AdRow + AdsApp), extracted from index.html (Phase 3.6 split).
// Plain script: window.AMS_ADS.buildAds(deps) -> { AdsApp }. Shared helpers (rupee/GST_RATE/
// AD_PLATFORMS/isoDate/adStats/monthKey — also used by SEO & Billing) are injected from index.html.
(function(){
  function buildAds(deps){
    const {React,h,useState,useEffect,useRef,useCallback,useMemo,supabase,db,dbInsert,dbPatch,dbDelete,rpcCall,Skel,Av,Metric,insertNotif,isPrivilegedRole,fmtS,todayISO,isoDate,monthKey,rupee,adStats,GST_RATE,AD_PLATFORMS} = deps;

    // ── AdRow ──
function AdRow({ad,spendLog,onSaveEntry,onUpdate,onDelete,showToast}){
  const[expanded,setExpanded]=useState(false);
  const[edit,setEdit]=useState(false);
  const[form,setForm]=useState({name:ad.name||'',start_date:ad.start_date||'',total_budget:ad.total_budget||'',daily_budget:ad.daily_budget||'',post_link:ad.post_link||'',status:ad.status||'active',platform:ad.platform||'instagram'});
  const log=spendLog||{};
  const s=adStats(ad,log);
  const pct=s&&ad.total_budget>0?Math.min(100,Math.round((s.spent/ad.total_budget)*100)):0;
  const plat=AD_PLATFORMS[ad.platform||'instagram']||AD_PLATFORMS.other;
  const save=async()=>{
    try{const clean={name:form.name,start_date:form.start_date,total_budget:parseFloat(form.total_budget)||0,daily_budget:parseFloat(form.daily_budget)||0,post_link:form.post_link||null,status:form.status,platform:form.platform};await dbPatch('ads',ad.id,clean);onUpdate({...ad,...clean});setEdit(false);showToast('Ad updated ✓');}catch(e){showToast('Save failed');}
  };
  const remove=async()=>{
    if(!confirm('Delete this ad campaign?'))return;
    try{await dbDelete('ads',ad.id);onDelete(ad.id);showToast('Ad deleted');}catch(e){showToast('Delete failed');}
  };
  let cum=0;
  const rows=s?s.blendedRows.map(r=>{cum+=r.amount;return{...r,gst:r.amount*GST_RATE,dayTotal:r.amount*(1+GST_RATE),cumSpent:cum,cumGst:cum*GST_RATE,cumTotal:cum*(1+GST_RATE)};}):[];
  const statusPill=ad.status==='active'?'pg':ad.status==='paused'?'py':'pb';
  return h`<div class="crd" style=${{padding:14,marginBottom:10}}>
    ${edit?h`<div>
      <div class="fi-grid fi-group"><div><div class="fi-lbl">Ad name</div><input class="fi" value=${form.name} onChange=${e=>setForm(f=>({...f,name:e.target.value}))}/></div><div><div class="fi-lbl">Platform</div><select class="fi fi-select" value=${form.platform} onChange=${e=>setForm(f=>({...f,platform:e.target.value}))}>${Object.entries(AD_PLATFORMS).map(([k,v])=>h`<option key=${k} value=${k}>${v.lbl}</option>`)}</select></div></div>
      <div class="fi-grid fi-group"><div><div class="fi-lbl">Status</div><select class="fi fi-select" value=${form.status} onChange=${e=>setForm(f=>({...f,status:e.target.value}))}>${[['active','Active'],['paused','Paused'],['completed','Completed']].map(([v,l])=>h`<option key=${v} value=${v}>${l}</option>`)}</select></div><div><div class="fi-lbl">Start date</div><input class="fi" type="date" value=${form.start_date||''} onChange=${e=>setForm(f=>({...f,start_date:e.target.value}))}/></div></div>
      <div class="fi-grid fi-group"><div><div class="fi-lbl">Total budget (₹)</div><input class="fi" type="number" value=${form.total_budget} onChange=${e=>setForm(f=>({...f,total_budget:e.target.value}))}/></div><div><div class="fi-lbl">Daily spend (₹)</div><input class="fi" type="number" value=${form.daily_budget} onChange=${e=>setForm(f=>({...f,daily_budget:e.target.value}))}/></div></div>
      <div class="fi-group"><div class="fi-lbl">Post / Reel link</div><input class="fi" value=${form.post_link} onChange=${e=>setForm(f=>({...f,post_link:e.target.value}))} placeholder="https://..."/></div>
      <div style=${{display:'flex',gap:8}}><button class="btn-pri" onClick=${save}>Save</button><button class="btn-sec" onClick=${()=>setEdit(false)}>Cancel</button><button class="btn-sec" style=${{marginLeft:'auto',color:'var(--red)',borderColor:'var(--red)'}} onClick=${remove}><i class="ti ti-trash" style=${{fontSize:14}}></i>Delete</button></div>
    </div>`:h`<div>
      <div style=${{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:10}}>
        <div style=${{flex:1,minWidth:0}}>
          <div style=${{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
            <span class="pill" style=${{background:plat.bg,color:plat.col,display:'inline-flex',alignItems:'center',gap:4}}><i class=${'ti '+plat.ic} style=${{fontSize:12}}></i>${plat.lbl}</span>
            <div style=${{fontWeight:600,fontSize:15,color:'var(--t1)'}}>${ad.name||'Untitled ad'}</div>
          </div>
          <div style=${{fontSize:12,color:'var(--t3)',display:'flex',gap:12,flexWrap:'wrap'}}>
            <span><i class="ti ti-calendar" style=${{fontSize:12,marginRight:3}}></i>Started ${fmtS(ad.start_date)}</span>
            <span><i class="ti ti-currency-rupee" style=${{fontSize:12,marginRight:3}}></i>${rupee(ad.daily_budget)}/day</span>
            ${ad.post_link&&h`<a href=${ad.post_link} target="_blank" style=${{color:'var(--blue)',textDecoration:'none'}}><i class="ti ti-external-link" style=${{fontSize:12,marginRight:3}}></i>View post</a>`}
          </div>
        </div>
        <div style=${{display:'flex',gap:6,alignItems:'center'}}>
          <span class=${'pill '+statusPill}>${(ad.status||'active').replace(/^./,c=>c.toUpperCase())}</span>
          <button class="btn-sec" style=${{padding:'4px 8px',fontSize:12}} onClick=${()=>setEdit(true)}><i class="ti ti-pencil" style=${{fontSize:13}}></i></button>
        </div>
      </div>
      ${s&&h`<div>
        <div style=${{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:10}}>
          <${Metric} label="Spent so far" value=${rupee(s.spent)} sub=${'+ '+rupee(s.gst)+' GST · '+s.actualDays+' day'+(s.actualDays===1?'':'s')+' logged'}/>
          <${Metric} label="Total budget" value=${rupee(ad.total_budget||0)} sub=${'+ '+rupee((ad.total_budget||0)*GST_RATE)+' GST'}/>
          <${Metric} label="Days running" value=${s.daysSince+(isFinite(s.maxDays)?'/~'+s.maxDays:'')} sub=${s.isComplete?'Budget exhausted':s.daysRemaining!==null?'~'+s.daysRemaining+' days left':'No cap'}/>
          <${Metric} label="Expected end" value=${s.endDate?fmtS(isoDate(s.endDate)):'—'} sub=${s.isComplete?'Stopped':s.actualDays>=2?'Based on actual avg':'Projected'} ok=${!s.isComplete}/>
        </div>
        ${ad.total_budget>0&&h`<div class="lineup-prog" style=${{marginBottom:10}}><div class="lineup-prog-fill" style=${{width:pct+'%',background:s.isComplete?'#DC2626':pct>80?'#B45309':'#1D4ED8'}}></div></div>`}
        <button class="btn-sec" style=${{padding:'4px 10px',fontSize:12,display:'inline-flex',alignItems:'center',gap:4}} onClick=${()=>setExpanded(x=>!x)}><i class=${'ti '+(expanded?'ti-chevron-up':'ti-chevron-down')} style=${{fontSize:13}}></i>${expanded?'Hide':'Show'} daily breakdown · log actual spend</button>
        ${expanded&&rows.length>0&&h`<div class="ltbl-wrap" style=${{marginTop:10}}>
          <div style=${{fontSize:11,color:'var(--t3)',marginBottom:6}}>Type the actual amount spent that day to override the projection. Empty = use ₹${ad.daily_budget} projected.</div>
          <table class="ltbl"><thead><tr><th>Day</th><th>Date</th><th>Actual spend (₹)</th><th>GST (18%)</th><th>Day total</th><th>Cumulative spend</th><th>Cumulative w/ GST</th></tr></thead><tbody>${rows.map(r=>h`<tr key=${r.dateKey} style=${r.isActual?{background:'rgba(34,197,94,.06)'}:{}}>
            <td>Day ${r.day}</td>
            <td style=${{whiteSpace:'nowrap',color:'var(--t2)'}}>${fmtS(r.dateKey)}</td>
            <td><input key=${r.entry?.id||'e'+r.dateKey+(r.entry?.amount_spent||'')} type="number" defaultValue=${r.isActual?r.entry.amount_spent:''} placeholder=${ad.daily_budget+' (proj)'} class="fi" style=${{width:96,padding:'2px 6px',fontSize:11,fontStyle:r.isActual?'normal':'italic',color:r.isActual?'var(--t1)':'var(--t3)'}} onBlur=${e=>{const v=e.target.value;if((v||'')!==String(r.entry?.amount_spent??''))onSaveEntry(ad.id,r.dateKey,v);}}/></td>
            <td style=${{color:'var(--t3)'}}>${rupee(r.gst)}</td>
            <td>${rupee(r.dayTotal)}</td>
            <td style=${{fontWeight:500}}>${rupee(r.cumSpent)}</td>
            <td style=${{fontWeight:500,color:'var(--t2)'}}>${rupee(r.cumTotal)}</td>
          </tr>`)}</tbody></table>
        </div>`}
      </div>`}
    </div>`}
  </div>`;
}

    // ── AdsApp (Ads dashboard) ──
function AdsApp({clients,currentUser,showToast,onClientUpdate}){
  const[ads,setAds]=useState([]);const[spendLog,setSpendLog]=useState({});const[loading,setLoading]=useState(true);const[fetchErr,setFetchErr]=useState(null);
  const[showAddFor,setShowAddFor]=useState(null);
  const[form,setForm]=useState({name:'',start_date:todayISO(),total_budget:'',daily_budget:'',post_link:'',status:'active',platform:'instagram'});
  const[onlyActive,setOnlyActive]=useState(false);
  const[showManage,setShowManage]=useState(false);
  useEffect(()=>{
    Promise.all([
      db('ads','&order=start_date.desc'),
      db('ad_spend_entries','&order=date.asc').catch(e=>{console.warn('[ads] spend entries fetch failed (table missing?)',e);return[];})
    ]).then(([adRows,entries])=>{
      setAds(adRows);setFetchErr(null);
      const log={};entries.forEach(e=>{if(!log[e.ad_id])log[e.ad_id]={};log[e.ad_id][e.date]=e;});
      setSpendLog(log);
    }).catch(e=>{console.warn('[ads] fetch failed',e);setFetchErr(e.message||'Could not load ads');}).finally(()=>setLoading(false));
  },[]);
  // Realtime: keep ads + spend entries in sync across browsers
  useEffect(()=>{
    const ch=supabase.channel('ads-realtime')
      .on('postgres_changes',{event:'*',schema:'public',table:'ads'},payload=>{
        const ev=payload.eventType;const n=payload.new;const o=payload.old;
        if(ev==='INSERT')setAds(prev=>prev.find(a=>a.id===n.id)?prev:[n,...prev]);
        else if(ev==='UPDATE')setAds(prev=>prev.map(a=>a.id===n.id?n:a));
        else if(ev==='DELETE'){const id=(o&&o.id)||(n&&n.id);if(id)setAds(prev=>prev.filter(a=>a.id!==id));}
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'ad_spend_entries'},payload=>{
        const ev=payload.eventType;const n=payload.new;const o=payload.old;
        if(ev==='INSERT'||ev==='UPDATE'){setSpendLog(log=>({...log,[n.ad_id]:{...(log[n.ad_id]||{}),[n.date]:n}}));}
        else if(ev==='DELETE'){const aid=o?.ad_id;const dt=o?.date;if(aid&&dt)setSpendLog(log=>{const c={...log};if(c[aid]){const d={...c[aid]};delete d[dt];c[aid]=d;}return c;});}
      })
      .subscribe();
    return()=>supabase.removeChannel(ch);
  },[]);
  const adsByClient={};ads.forEach(a=>{(adsByClient[a.client_id]=adsByClient[a.client_id]||[]).push(a);});
  const sortedClients=[...clients].filter(c=>c.status!=='inactive').sort((a,b)=>{const aHas=(adsByClient[a.id]||[]).length>0;const bHas=(adsByClient[b.id]||[]).length>0;if(aHas!==bHas)return aHas?-1:1;return a.name.localeCompare(b.name);});
  const monthSpend=(cid)=>{
    const now=new Date();const monthStart=new Date(now.getFullYear(),now.getMonth(),1);monthStart.setHours(0,0,0,0);
    const t=new Date();t.setHours(0,0,0,0);
    let monthTotal=0;
    (adsByClient[cid]||[]).forEach(ad=>{
      if(!ad.start_date||!ad.daily_budget)return;
      const start=new Date(ad.start_date);start.setHours(0,0,0,0);
      if(start>t)return;
      const log=spendLog[ad.id]||{};
      // Paused approximation: we don't store WHEN an ad was paused, so while it is
      // paused we stop projecting daily_budget beyond the last actually-logged day —
      // from there on only logged actual entries count. Days up to the last logged
      // entry still project (the ad was evidently running then). Resuming the ad
      // (status back to 'active') restores normal projection.
      const paused=ad.status==='paused';
      const lastLogged=paused?(Object.keys(log).sort().pop()||null):null;
      let cumSpent=0;
      for(let d=new Date(start);d<=t;d.setDate(d.getDate()+1)){
        if(ad.total_budget>0&&cumSpent>=ad.total_budget)break;
        const dk=isoDate(d);
        const entry=log[dk];
        let amt=entry?Number(entry.amount_spent)||0:(paused&&(!lastLogged||dk>lastLogged)?0:ad.daily_budget);
        if(ad.total_budget>0)amt=Math.min(amt,ad.total_budget-cumSpent);
        cumSpent+=amt;
        if(d>=monthStart)monthTotal+=amt;
      }
    });
    return monthTotal;
  };
  const openAdd=(cid,platform='instagram')=>{setShowAddFor({cid,platform});setForm({name:'',start_date:todayISO(),total_budget:'',daily_budget:'',post_link:'',status:'active',platform});};
  const submitAdd=async(cid)=>{
    if(!form.name||!form.start_date||!form.daily_budget){showToast('Name, start date and daily spend are required');return;}
    try{const payload={client_id:cid,name:form.name,start_date:form.start_date,total_budget:parseFloat(form.total_budget)||0,daily_budget:parseFloat(form.daily_budget)||0,post_link:form.post_link||null,status:form.status,platform:form.platform};const rows=await dbInsert('ads',[payload]);setAds(a=>[rows[0],...a]);setShowAddFor(null);showToast('Ad added ✓');}catch(e){showToast('Failed to add ad — '+(e.message||'check ads table exists'));}
  };
  const saveBudget=async(c,val)=>{const clean=val===''||val===null?null:parseFloat(val);try{await rpcCall('client_update',{p_client_id:c.id,p_patch:{monthly_ad_budget:clean}});onClientUpdate&&onClientUpdate({...c,monthly_ad_budget:clean});showToast('Monthly budget updated');}catch(e){showToast('Save failed — does `monthly_ad_budget` column exist on clients?');}};
  const updateAdInList=(u)=>setAds(a=>a.map(x=>x.id===u.id?u:x));
  const removeAd=(id)=>setAds(a=>a.filter(x=>x.id!==id));
  const saveEntry=async(adId,dateKey,rawVal)=>{
    const val=(rawVal==null?'':String(rawVal)).trim();
    const existing=spendLog[adId]?.[dateKey];
    try{
      if(val===''&&existing){
        await dbDelete('ad_spend_entries',existing.id);
        setSpendLog(log=>{const c={...log};if(c[adId]){const d={...c[adId]};delete d[dateKey];c[adId]=d;}return c;});
        showToast('Entry cleared');
      }else if(val!==''){
        const amt=parseFloat(val);if(isNaN(amt))return;
        if(existing){
          await dbPatch('ad_spend_entries',existing.id,{amount_spent:amt});
          setSpendLog(log=>({...log,[adId]:{...(log[adId]||{}),[dateKey]:{...existing,amount_spent:amt}}}));
        }else{
          const rows=await dbInsert('ad_spend_entries',[{ad_id:adId,date:dateKey,amount_spent:amt,created_by:currentUser?.name||null}]);
          setSpendLog(log=>({...log,[adId]:{...(log[adId]||{}),[dateKey]:rows[0]}}));
        }
        showToast('Spend logged');
      }
    }catch(e){console.warn('[ads] save entry failed',e);showToast('Failed to save — does `ad_spend_entries` table exist?');}
  };
  // Budget exhaustion alerts: per-ad (2 days before projected end) + per-client (90% monthly budget).
  // Dedupe is two-layered: localStorage is only a per-browser fast path — the shared
  // notifications table is the source of truth (same title + link within the period),
  // so N staff members / devices opening the Ads tab don't each fire a duplicate.
  // Best-effort: two truly simultaneous opens can still race, which is acceptable.
  useEffect(()=>{
    if(loading||!currentUser||!isPrivilegedRole(currentUser.role_level))return;
    const today=todayISO();const mk=today.slice(0,7);const now=new Date();
    const alreadyNotified=async(title,linkType,linkId,sinceISO)=>{
      try{
        const rows=await db('notifications',`&title=eq.${encodeURIComponent(title)}&link_type=eq.${linkType}&link_id=eq.${linkId}&created_at=gte.${sinceISO}&limit=1`);
        return rows.length>0;
      }catch(e){console.warn('[ads] notif dedupe check failed',e);return false;}
    };
    (async()=>{
      for(const ad of ads){
        if(ad.status!=='active')continue;
        const s=adStats(ad,spendLog[ad.id]||{});
        if(!s||!s.endDate||s.isComplete)continue;
        const daysLeft=Math.ceil((s.endDate-now)/86400000);
        if(daysLeft<0||daysLeft>2)continue;
        const key=`ams_ad_endsoon_${ad.id}_${today}`;
        if(localStorage.getItem(key))continue;
        const title='🎯 Ad budget running out';
        if(await alreadyNotified(title,'ad',ad.id,today)){localStorage.setItem(key,'1');continue;}
        localStorage.setItem(key,'1');
        const c=clients.find(x=>x.id===ad.client_id);const plat=AD_PLATFORMS[ad.platform||'instagram']?.lbl||'';
        insertNotif('role:admin,manager',title,`${c?.name||'A client'}'s ${plat} ad "${ad.name||'Untitled'}" will exhaust budget in ${Math.max(daysLeft,0)+1} day${daysLeft<=0?'':'s'}`,'alert',c?.name||null,null,'ad',ad.id);
      }
      for(const c of clients){
        const budget=c.monthly_ad_budget||0;if(!budget)continue;
        const spent=monthSpend(c.id);if(spent/budget<0.9)continue;
        const key=`ams_ad_budget90_${c.id}_${mk}`;
        if(localStorage.getItem(key))continue;
        const title='💰 Monthly ad budget 90% used';
        if(await alreadyNotified(title,'client',c.id,`${mk}-01`)){localStorage.setItem(key,'1');continue;}
        localStorage.setItem(key,'1');
        const pct=Math.round((spent/budget)*100);
        insertNotif('role:admin,manager',title,`${c.name} has used ${pct}% of their monthly ad budget (${rupee(spent)} of ${rupee(budget)})`,'alert',c.name,null,'client',c.id);
      }
    })();
  },[loading,ads,spendLog,clients,currentUser]);
  if(loading)return h`<div><${Skel} h=${120}/><${Skel} h=${120}/></div>`;
  if(fetchErr)return h`<div class="empty"><i class="ti ti-database-off"></i><div class="empty-t">Ads table not found</div><div class="empty-s">Create the table in Supabase first. Run this SQL in your project's SQL editor:</div><pre style=${{textAlign:'left',background:'var(--bg)',padding:14,borderRadius:8,marginTop:14,fontSize:12,overflow:'auto'}}>create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  name text not null,
  start_date date not null,
  total_budget numeric default 0,
  daily_budget numeric default 0,
  post_link text,
  status text default 'active',
  platform text default 'instagram',
  created_at timestamptz default now()
);
alter table public.ads disable row level security;
alter table public.clients add column if not exists monthly_ad_budget numeric;
alter table public.clients add column if not exists ad_platforms text;

create table if not exists public.ad_spend_entries (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ads(id) on delete cascade,
  date date not null,
  amount_spent numeric not null default 0,
  note text,
  created_by text,
  created_at timestamptz default now(),
  unique(ad_id, date)
);
alter table public.ad_spend_entries disable row level security;

-- Enable realtime (skip if already added):
alter publication supabase_realtime add table public.ads;
alter publication supabase_realtime add table public.ad_spend_entries;</pre></div>`;
  const clientPlatforms=(c)=>(c.ad_platforms||'').split(',').map(s=>s.trim()).filter(Boolean);
  const isTracked=(c)=>clientPlatforms(c).length>0||(adsByClient[c.id]||[]).length>0;
  const enabledClients=sortedClients.filter(isTracked);
  const visible=onlyActive?enabledClients.filter(c=>(adsByClient[c.id]||[]).some(a=>a.status==='active')):enabledClients;
  const togglePlatform=async(c,p)=>{const cur=clientPlatforms(c);const on=cur.includes(p);const next=on?cur.filter(x=>x!==p):[...cur,p];try{await rpcCall('client_update',{p_client_id:c.id,p_patch:{ad_platforms:next.join(',')}});onClientUpdate&&onClientUpdate({...c,ad_platforms:next.join(',')});showToast(`${c.name}: ${AD_PLATFORMS[p].lbl} ${on?'off':'on'}`);}catch(e){showToast('Save failed — does `ad_platforms` column exist on clients?');}};
  const manageList=h`<div class="crd" style=${{padding:16,marginBottom:16}}>
    <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
      <div style=${{fontWeight:600,fontSize:14}}>Manage tracked platforms</div>
      <span style=${{fontSize:12,color:'var(--t3)'}}>${enabledClients.length} client${enabledClients.length===1?'':'s'} tracked</span>
    </div>
    <div style=${{fontSize:12,color:'var(--t3)',marginBottom:12}}>Tick the platforms each client runs ads on. Also editable from each client's Overview tab.</div>
    <div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:10}}>
      ${sortedClients.map(c=>{const sel=clientPlatforms(c);return h`<div key=${c.id} style=${{padding:'8px 10px',background:'var(--bg)',borderRadius:8}}>
        <div style=${{fontSize:13,fontWeight:500,color:'var(--t1)',marginBottom:6,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>${c.name}</div>
        <div style=${{display:'flex',gap:4,flexWrap:'wrap'}}>${Object.entries(AD_PLATFORMS).filter(([k])=>k!=='other').map(([k,v])=>{const on=sel.includes(k);return h`<button key=${k} class=${'fb'+(on?' on':'')} style=${{fontSize:11,padding:'2px 8px',display:'inline-flex',alignItems:'center',gap:3}} onClick=${()=>togglePlatform(c,k)}>${on?h`<i class="ti ti-check" style=${{fontSize:11}}></i>`:h`<i class=${'ti '+v.ic} style=${{fontSize:11}}></i>`}${v.lbl}</button>`;})}</div>
      </div>`;})}
    </div>
  </div>`;
  return h`<div>
    <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:12}}>
      <div style=${{fontSize:13,color:'var(--t2)'}}>Track ad spend per client. GST charged at 18% (auto-calculated).</div>
      <div style=${{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
        <label style=${{fontSize:13,color:'var(--t2)',display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}><input type="checkbox" checked=${onlyActive} onChange=${e=>setOnlyActive(e.target.checked)}/>Only clients with active ads</label>
        <button class="btn-sec" style=${{padding:'5px 12px',fontSize:13}} onClick=${()=>setShowManage(x=>!x)}><i class=${'ti '+(showManage?'ti-chevron-up':'ti-adjustments')} style=${{fontSize:14}}></i>${showManage?'Hide':'Manage'} platforms</button>
      </div>
    </div>
    ${showManage&&manageList}
    ${enabledClients.length===0?h`<div class="empty"><i class="ti ti-target-arrow"></i><div class="empty-t">No clients tracked yet</div><div class="empty-s">Tick the ad platforms each client runs on. Also available from each client's Overview tab.</div>
      <div style=${{marginTop:18,maxWidth:640,margin:'18px auto 0',textAlign:'left',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:10}}>
        ${sortedClients.slice(0,18).map(c=>{const sel=clientPlatforms(c);return h`<div key=${c.id} style=${{padding:'8px 10px',background:'var(--bg)',borderRadius:8}}>
          <div style=${{fontSize:13,fontWeight:500,color:'var(--t1)',marginBottom:6}}>${c.name}</div>
          <div style=${{display:'flex',gap:4,flexWrap:'wrap'}}>${Object.entries(AD_PLATFORMS).filter(([k])=>k!=='other').map(([k,v])=>{const on=sel.includes(k);return h`<button key=${k} class=${'fb'+(on?' on':'')} style=${{fontSize:11,padding:'2px 8px',display:'inline-flex',alignItems:'center',gap:3}} onClick=${()=>togglePlatform(c,k)}>${on?h`<i class="ti ti-check" style=${{fontSize:11}}></i>`:h`<i class=${'ti '+v.ic} style=${{fontSize:11}}></i>`}${v.lbl}</button>`;})}</div>
        </div>`;})}
      </div>
    </div>`
    :visible.length===0?h`<div class="empty"><i class="ti ti-filter-off"></i><div class="empty-t">No active ads</div><div class="empty-s">Tracked clients have no active campaigns. Uncheck the "Only active" filter to see all.</div></div>`
    :visible.map(c=>{
      const cAds=adsByClient[c.id]||[];
      const spent=monthSpend(c.id);
      const budget=c.monthly_ad_budget||0;
      const pct=budget>0?Math.min(100,Math.round((spent/budget)*100)):0;
      const over=budget>0&&spent>budget;
      const col=c.brand_color_primary||c.color||'#4F46E5';
      const platforms=clientPlatforms(c);
      const orphanAds=cAds.filter(a=>!platforms.includes(a.platform||'instagram'));
      const platformsToShow=[...platforms,...(orphanAds.length>0?['other']:[])];
      return h`<div key=${c.id} class="crd" style=${{padding:18,marginBottom:16}}>
        <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:14,flexWrap:'wrap'}}>
          <div style=${{display:'flex',alignItems:'center',gap:12}}>
            <${Av} i=${c.initials||c.name.slice(0,2).toUpperCase()} c=${col} s=${36}/>
            <div><div style=${{fontWeight:600,fontSize:16,color:'var(--t1)'}}>${c.name}</div><div style=${{fontSize:12,color:'var(--t3)'}}>${platforms.map(p=>AD_PLATFORMS[p]?.lbl).filter(Boolean).join(' · ')||'No platforms ticked'} · ${cAds.filter(a=>a.status==='active').length} active ad${cAds.filter(a=>a.status==='active').length===1?'':'s'}</div></div>
          </div>
        </div>
        <div style=${{background:'var(--bg)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
          <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,gap:12,flexWrap:'wrap'}}>
            <div style=${{display:'flex',alignItems:'center',gap:8}}>
              <span class="fi-lbl" style=${{margin:0}}>Client monthly ad budget</span>
              <input class="fi" type="number" defaultValue=${c.monthly_ad_budget||''} placeholder="0" style=${{width:120,padding:'4px 8px',fontSize:13}} onBlur=${e=>{if((e.target.value||'')!==String(c.monthly_ad_budget||''))saveBudget(c,e.target.value);}}/>
            </div>
            <div style=${{fontSize:13,color:over?'var(--red)':'var(--t2)'}}>${rupee(spent)} spent this month${budget?' / '+rupee(budget):''}${over?' · over budget':''}</div>
          </div>
          ${budget>0&&h`<div class="lineup-prog"><div class="lineup-prog-fill" style=${{width:pct+'%',background:over?'#DC2626':pct>80?'#B45309':'#1D4ED8'}}></div></div>`}
        </div>
        ${platformsToShow.length===0?h`<div style=${{textAlign:'center',padding:'18px',color:'var(--t3)',fontSize:13}}>No platforms ticked for this client. Open their Overview tab or the Manage panel above.</div>`
        :platformsToShow.map(p=>{
          const pinfo=AD_PLATFORMS[p]||AD_PLATFORMS.other;
          const ads=cAds.filter(a=>(a.platform||'instagram')===p);
          const isAdding=showAddFor&&showAddFor.cid===c.id&&showAddFor.platform===p;
          return h`<div key=${p} style=${{marginBottom:14}}>
            <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'6px 0 8px',borderBottom:'1px solid var(--bd)',marginBottom:10,gap:8,flexWrap:'wrap'}}>
              <div style=${{display:'flex',alignItems:'center',gap:8}}>
                <span class="pill" style=${{background:pinfo.bg,color:pinfo.col,display:'inline-flex',alignItems:'center',gap:4}}><i class=${'ti '+pinfo.ic} style=${{fontSize:13}}></i>${pinfo.lbl} Ads</span>
                <span style=${{fontSize:12,color:'var(--t3)'}}>${ads.length} ad${ads.length===1?'':'s'}</span>
              </div>
              ${p!=='other'&&h`<button class="btn-sec" style=${{padding:'4px 10px',fontSize:12}} onClick=${()=>openAdd(c.id,p)}><i class="ti ti-plus" style=${{fontSize:13}}></i>Add ${pinfo.lbl} ad</button>`}
            </div>
            ${isAdding&&h`<div class="crd" style=${{padding:14,marginBottom:12,background:'var(--bg)'}}>
              <div style=${{fontWeight:600,marginBottom:10,display:'flex',alignItems:'center',gap:6}}><i class=${'ti '+pinfo.ic} style=${{fontSize:15,color:pinfo.col}}></i>New ${pinfo.lbl} ad for ${c.name}</div>
              <div class="fi-grid fi-group"><div><div class="fi-lbl">Ad name</div><input class="fi" value=${form.name} onChange=${e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Diwali reel boost"/></div><div><div class="fi-lbl">Start date</div><input class="fi" type="date" value=${form.start_date} onChange=${e=>setForm(f=>({...f,start_date:e.target.value}))}/></div></div>
              <div class="fi-grid fi-group"><div><div class="fi-lbl">Total budget (₹)</div><input class="fi" type="number" value=${form.total_budget} onChange=${e=>setForm(f=>({...f,total_budget:e.target.value}))} placeholder="1000"/></div><div><div class="fi-lbl">Daily spend (₹)</div><input class="fi" type="number" value=${form.daily_budget} onChange=${e=>setForm(f=>({...f,daily_budget:e.target.value}))} placeholder="300"/></div></div>
              <div class="fi-group"><div class="fi-lbl">Post / Reel link (optional)</div><input class="fi" value=${form.post_link} onChange=${e=>setForm(f=>({...f,post_link:e.target.value}))} placeholder="https://instagram.com/..."/></div>
              <div style=${{display:'flex',gap:8}}><button class="btn-pri" onClick=${()=>submitAdd(c.id)}>Add ad</button><button class="btn-sec" onClick=${()=>setShowAddFor(null)}>Cancel</button></div>
            </div>`}
            ${ads.length===0&&!isAdding?h`<div style=${{textAlign:'center',padding:'12px',color:'var(--t3)',fontSize:12}}>No ${pinfo.lbl} ads yet</div>`
              :ads.map(ad=>h`<${AdRow} key=${ad.id} ad=${ad} spendLog=${spendLog[ad.id]||{}} onSaveEntry=${saveEntry} onUpdate=${updateAdInList} onDelete=${removeAd} showToast=${showToast}/>`)}
          </div>`;
        })}
      </div>`;
    })}
  </div>`;
}

    return { AdsApp };
  }
  window.AMS_ADS = { buildAds };
})();

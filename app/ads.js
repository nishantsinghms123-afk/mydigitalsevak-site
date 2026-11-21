// ads.js — Ad Campaigns feature (AdRow + AdsApp), extracted from index.html (Phase 3.6 split).
// Plain script: window.AMS_ADS.buildAds(deps) -> { AdsApp }. Shared helpers (rupee/GST_RATE/
// AD_PLATFORMS/isoDate/adStats/monthKey — also used by SEO & Billing) are injected from index.html.
(function(){
  function buildAds(deps){
    const {React,h,useState,useEffect,useRef,useCallback,useMemo,supabase,db,dbInsert,dbPatch,dbDelete,rpcCall,Skel,Av,Metric,insertNotif,isPrivilegedRole,fmtS,todayISO,isoDate,monthKey,rupee,adStats,GST_RATE,AD_PLATFORMS,SB_URL,SB_KEY} = deps;
    const sessTok=()=>{try{return localStorage.getItem('ams_session_token')||'';}catch(_){return '';}};
    const ago=(iso)=>{if(!iso)return'never';const m=Math.round((Date.now()-new Date(iso).getTime())/60000);if(m<2)return'just now';if(m<60)return m+' min ago';const hr=Math.round(m/60);if(hr<48)return hr+' h ago';return Math.round(hr/24)+' days ago';};

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
            ${ad.source==='meta'&&h`<span class="pill" title="Campaign, status, budget and daily spend come from Meta and refresh by themselves" style=${{background:'#E7F0FF',color:'#0866FF',display:'inline-flex',alignItems:'center',gap:4}}><i class="ti ti-refresh" style=${{fontSize:11}}></i>From Meta</span>`}
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
          <div style=${{fontSize:11,color:'var(--t3)',marginBottom:6}}>${ad.source==='meta'?'Daily spend comes from Meta and refreshes by itself; a number typed here is replaced at the next sync.':`Type the actual amount spent that day to override the projection. Empty = use ₹${ad.daily_budget} projected.`}</div>
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

    // ── Meta report (live, read-only; meta-ads-report Edge Function) ──
    // The monthly client report, laid out exactly like the agency's PDF (The Royal Art, Oct 2026):
    // Overview → More numbers → Timeline → Campaigns → Ads → Device → State → What worked →
    // Recommendations. Every figure comes straight from Meta for the chosen dates; rates are worked
    // out here from Meta's base numbers so screen, CSV and PDF always agree.
    const ADR_CSS=`
.adr{--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--good:#008a00;--bad:#d03b3b;--grid:#e1e0d9;--axis:#c3c2b7;--ring:#fff;--head:#f3f2ee}
html.dark .adr{--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--good:#3ddc5f;--bad:#ff7b7b;--grid:#2c2c2a;--axis:#383835;--ring:#1a1a19;--head:rgba(255,255,255,.06)}
.adr-doc{color:var(--t1);line-height:1.5;font-size:14.5px;max-width:860px}
.adr-h1,.adr-h2{font-family:Georgia,"Times New Roman",serif;font-weight:400;color:var(--t1);letter-spacing:-.01em}
.adr-h1{font-size:32px;line-height:1.15;margin:0 0 14px}
.adr-h2{font-size:22px;margin:0}
.adr-h3{font-size:14.5px;font-weight:600;margin:14px 0 6px;color:var(--t1)}
.adr-pills{display:flex;align-items:center;gap:8px;margin-bottom:20px;font-size:13px;color:var(--t1)}
.adr-pill{background:var(--head);border-radius:6px;padding:2px 9px}
.adr-sec{margin:0 0 30px}
.adr-sec-hd{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:8px}
.adr-lead{margin:0 0 12px;color:var(--t1);font-size:15.5px}
.adr-src{font-size:13px;color:var(--t2);margin:10px 0 14px}
.adr-err{font-size:12.5px;color:var(--bad);margin:6px 0}
.adr-pdf{font-size:12px;color:var(--t3);display:inline-flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap}
.adr-list{margin:10px 0 14px;padding-left:22px}.adr-list li{margin-bottom:6px}
.adr-card-t{font-size:15px;font-weight:600;color:var(--t1)}
.adr-card-s{font-size:12px;color:var(--t2);margin-bottom:10px}
.adr-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.adr-group{border:1px solid var(--grid);border-radius:12px;padding:14px;background:var(--surface);break-inside:avoid}
.adr-group.wide{grid-column:1/-1}
.adr-group-t{font-size:14px;font-weight:600;margin-bottom:10px;color:var(--t1)}
.adr-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.adr-group.wide .adr-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}
.adr-tile{position:relative;border:1px solid;border-radius:9px;padding:10px 12px 8px 14px;min-width:0}
.adr-tile:before{content:"";position:absolute;left:-1px;top:10px;height:20px;width:4px;border-radius:0 3px 3px 0}
.adr-tile.b{background:rgba(42,120,214,.13);border-color:rgba(42,120,214,.5)}.adr-tile.b:before{background:var(--s1)}
.adr-tile.o{background:rgba(235,104,52,.13);border-color:rgba(235,104,52,.5)}.adr-tile.o:before{background:var(--s2)}
.adr-tile.g{background:rgba(27,175,122,.13);border-color:rgba(27,175,122,.5)}.adr-tile.g:before{background:var(--s3)}
.adr-tile-l{font-size:12.5px;font-weight:500;color:var(--t1)}
.adr-tile-v{font-size:23px;font-weight:600;color:var(--t1);line-height:1.35;white-space:nowrap}
.adr-tile-f{display:flex;justify-content:space-between;gap:6px;font-size:11.5px;color:var(--t2);flex-wrap:wrap}
.adr-d{font-weight:600;white-space:nowrap}.adr-d.good{color:var(--good)}.adr-d.bad{color:var(--bad)}.adr-d.flat{color:var(--t2)}
.adr-twrap{overflow-x:auto}
.adr-t{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.adr-t th{text-align:left;font-weight:400;color:var(--t2);background:var(--head);padding:8px 10px;border:1px solid var(--grid);vertical-align:top}
.adr-t td{padding:8px 10px;border:1px solid var(--grid);color:var(--t1);vertical-align:top}
.adr-t .tot td{font-weight:600}
.adr-t .adr-d.flat{color:var(--t1);font-weight:400}
.adr-t .lv1 td:first-child{padding-left:26px}.adr-t .lv2 td:first-child{padding-left:44px}
.adr-t .lv1 td,.adr-t .lv2 td{color:var(--t2)}
.adr-exp{border:none;background:none;padding:0 5px 0 0;color:var(--t3);cursor:pointer;font-size:11px}
.adr-ad{display:flex;gap:8px;align-items:flex-start}
.adr-ad img{width:38px;height:38px;border-radius:6px;object-fit:cover;flex:none;background:var(--head)}
.adr-chart{position:relative;margin-bottom:6px;break-inside:avoid}
.adr-legend{display:flex;gap:18px;font-size:12.5px;color:var(--t1);margin-bottom:4px}
.adr-key{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.adr-key.line{height:3px;border-radius:2px;vertical-align:3px;width:18px}
.adr-svg{width:100%;height:auto;display:block}
.adr-svg text{font-size:11px;fill:var(--t2);font-variant-numeric:tabular-nums}
.adr-svg text.ann{fill:var(--t1);font-size:11.5px}.adr-svg text.ann.b{font-weight:600}
.adr-tip{position:absolute;z-index:3;pointer-events:none;background:var(--t1);color:var(--ring);border-radius:7px;padding:6px 9px;font-size:12px;white-space:nowrap}
.adr-donut{display:flex;align-items:center;gap:26px;flex-wrap:wrap}
.adr-dev{flex:1;min-width:320px;display:grid;grid-template-columns:auto auto 1fr 1fr;gap:12px 14px;font-size:13px;align-items:center;font-variant-numeric:tabular-nums}
.adr-dev .r{text-align:right;color:var(--t2)}
.adr-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}
.adr-kv{display:grid;grid-template-columns:90px 1fr auto;gap:6px;font-size:13px;align-items:baseline;margin-top:6px}
.adr-kv b{font-size:15px}
.adr-state{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.adr-state th{font-size:12px;font-weight:500;color:var(--t2);text-align:right;padding:5px 8px;border-bottom:1px solid var(--grid)}
.adr-state td{padding:5px 8px;border-bottom:1px solid var(--grid);text-align:right;color:var(--t1)}
.adr-state th:nth-child(-n+2),.adr-state td:nth-child(-n+2){text-align:left}
.adr-bar{display:flex;align-items:center;gap:6px;min-width:170px}
.adr-bar i{display:block;height:15px;border-radius:0 3px 3px 0;background:var(--s1);opacity:.4;flex:none}
.adr-state tr.top td{font-weight:600}.adr-state tr.top .adr-bar i{opacity:1}
.adr-topstate{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-top:14px}
.adr-topstate dl{display:flex;gap:22px;margin:0;font-size:12px;color:var(--t2)}
.adr-topstate dd{margin:2px 0 0;font-size:15px;font-weight:600;color:var(--t1)}
.adr-note{white-space:pre-wrap;color:var(--t1);margin:0 0 10px}
.adr-printonly{display:none}
.adr-ctl{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px;margin-bottom:20px}
@media screen and (max-width:760px){.adr-groups,.adr-cards{grid-template-columns:minmax(0,1fr)}.adr-group.wide .adr-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.adr-h1{font-size:25px}}
`;
    const adrPrintCss=(title)=>`
@page{size:A4;margin:16mm 14mm;
  @top-left{content:"${String(title).replace(/["\\\n]/g,' ')}";font:9px system-ui,sans-serif;color:#6f6e69}
  @bottom-right{content:"Page " counter(page) " of " counter(pages);font:9px system-ui,sans-serif;color:#6f6e69}}
:root{--t1:#111110;--t2:#52514e;--t3:#6f6e69;--bd:#e1e0d9;--surface:#fff}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.adr-doc{max-width:none;font-size:13.5px}
.adr-printonly{display:block}
.adr-twrap{overflow:visible}
.adr-t{font-size:11px}.adr-t th,.adr-t td{padding:6px 7px}
.adr-t thead{display:table-header-group}.adr-t tr,.adr-state tr{break-inside:avoid}
.adr-h2,.adr-h3,.adr-card-t,.adr-card-s,.adr-sec-hd,.adr-lead{break-after:avoid}
.adr-tile,.adr-cards,.adr-donut,.adr-state,.adr-group{break-inside:avoid}
.adr-tile-v{font-size:21px}
.adr-tip{display:none}
`;
    const adrCss=()=>{if(document.getElementById('adr-css'))return;const st=document.createElement('style');st.id='adr-css';st.textContent=ADR_CSS;document.head.appendChild(st);};
    const esc=(s)=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

    // ── dates ──
    const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
    const pd=(s)=>{const[y,m,d]=String(s).split('-').map(Number);return{y,m:m-1,d};};
    const isoUTC=(t)=>new Date(t).toISOString().slice(0,10);
    const isFullMonth=(a,b)=>{const s=pd(a),e=pd(b);return s.d===1&&s.y===e.y&&s.m===e.m&&e.d===new Date(Date.UTC(s.y,s.m+1,0)).getUTCDate();};
    const dayLabel=(s)=>{const p=pd(s);return p.d+' '+MONTHS[p.m].slice(0,3);};
    const dayLong=(s)=>{const p=pd(s);return p.d+' '+MONTHS[p.m];};
    const periodLabel=(a,b)=>{const s=pd(a),e=pd(b);
      if(a===b)return dayLabel(a)+' '+s.y;
      if(s.y===e.y&&s.m===e.m)return s.d+'–'+e.d+' '+MONTHS[s.m].slice(0,3)+' '+s.y;
      return dayLabel(a)+' – '+dayLabel(b)+' '+e.y;};
    const periodTitle=(a,b)=>{const s=pd(a);return isFullMonth(a,b)?MONTHS[s.m]+' '+s.y:periodLabel(a,b);};
    const noYear=(s)=>s.replace(/ \d{4}$/,'');
    const presetRange=(key)=>{
      const today=todayISO(),t=pd(today),T=Date.UTC(t.y,t.m,t.d),D=86400000;
      if(key==='this_month')return{since:isoUTC(Date.UTC(t.y,t.m,1)),until:today};
      if(key==='last_7')return{since:isoUTC(T-7*D),until:isoUTC(T-D)};
      if(key==='last_30')return{since:isoUTC(T-30*D),until:isoUTC(T-D)};
      return{since:isoUTC(Date.UTC(t.y,t.m-1,1)),until:isoUTC(Date.UTC(t.y,t.m,0))};};
    const PRESETS=[['last_month','Last month'],['this_month','This month'],['last_7','Last 7 days'],['last_30','Last 30 days'],['custom','Custom']];

    // ── numbers ──
    const ratio=(a,b)=>b>0?a/b:null;
    const derive=(r)=>{r=r||{};const n=(k)=>Number(r[k])||0;const s=n('spend'),imp=n('impressions'),link=n('link_clicks'),ord=n('orders'),rev=n('revenue');
      const per=(a,b)=>{const v=ratio(a,b);return v==null?null:v*100;};
      return{...r,spend:s,impressions:imp,reach:n('reach'),clicks:n('clicks'),link_clicks:link,orders:ord,revenue:rev,landing_page_views:n('landing_page_views'),adds_to_cart:n('adds_to_cart'),checkouts:n('checkouts'),leads:n('leads'),messages:n('messages'),
        frequency:ratio(imp,n('reach')),cpm:imp>0?s/imp*1000:null,ctr_all:per(n('clicks'),imp),ctr_link:per(link,imp),cpc_link:ratio(s,link),
        roas:rev>0?ratio(rev,s):null,aov:ratio(rev,ord),cpo:ratio(s,ord),cost_lpv:ratio(s,n('landing_page_views')),cost_atc:ratio(s,n('adds_to_cart')),
        atc_to_checkout:per(n('checkouts'),n('adds_to_cart')),site_cvr:per(ord,n('landing_page_views')),spend_share:rev>0?per(s,rev):null,cpl:ratio(s,n('leads')),cost_msg:ratio(s,n('messages'))};};
    const sumRows=(rows)=>{const o={};rows.forEach(r=>['spend','impressions','reach','clicks','link_clicks','orders','revenue','landing_page_views','adds_to_cart','checkouts','leads','messages'].forEach(k=>{o[k]=(o[k]||0)+(Number(r[k])||0);}));return derive(o);};
    const mkFmt=(currency)=>{const cur=currency||'INR';
      const money=(d)=>{let f;try{f=new Intl.NumberFormat('en-IN',{style:'currency',currency:cur,minimumFractionDigits:d,maximumFractionDigits:d});}catch(_){f=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:d,maximumFractionDigits:d});}return(v)=>v==null?'—':f.format(v);};
      const int=new Intl.NumberFormat('en-IN',{maximumFractionDigits:0});
      const symbol=money(0)(0).replace(/[\d.,\s]/g,'');
      return{m0:money(0),m2:money(2),n:(v)=>v==null?'—':int.format(v),p:(v,d=2)=>v==null?'—':v.toFixed(d)+'%',x:(v)=>v==null?'—':v.toFixed(2)+'x',f2:(v)=>v==null?'—':v.toFixed(2),symbol};};
    const compact=(v)=>{const t=(x,u)=>(Math.round(x*10)/10).toString()+u;return v>=1e7?t(v/1e7,'Cr'):v>=1e5?t(v/1e5,'L'):v>=1e3?t(v/1e3,'k'):String(Math.round(v*100)/100);};
    const niceMax=(v)=>{if(!(v>0))return 1;const p=Math.pow(10,Math.floor(Math.log10(v))),m=v/p;return(m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:m<=8?8:10)*p;};
    const change=(cur,prev)=>(prev>0&&cur!=null)?(cur-prev)/prev*100:null;
    const STATUS={ACTIVE:'Active',PAUSED:'Paused',CAMPAIGN_PAUSED:'Paused',ADSET_PAUSED:'Paused',ARCHIVED:'Archived',DELETED:'Deleted',IN_PROCESS:'In process',WITH_ISSUES:'Has issues',PENDING_REVIEW:'In review',DISAPPROVED:'Not approved',PREAPPROVED:'Approved',PENDING_BILLING_INFO:'Billing needed',ADSET_ENDED:'Ended',CAMPAIGN_ENDED:'Ended'};
    const statusLabel=(s)=>s?(STATUS[s]||s.charAt(0)+s.slice(1).toLowerCase().replace(/_/g,' ')):'—';
    const titleCase=(s)=>String(s||'').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
    const PLATFORM={instagram:'Instagram',facebook:'Facebook',audience_network:'Audience Network',messenger:'Messenger',threads:'Threads',unknown:'Unknown'};
    const placementLabel=(r)=>{const p=PLATFORM[r.publisher_platform]||titleCase(r.publisher_platform);const pos=String(r.platform_position||'').replace(new RegExp('^'+(r.publisher_platform||'')+'_'),'');return p+' · '+titleCase(pos);};
    const DEVICE={mobile_app:['Mobile app','--s1'],mobile_web:['Mobile web','--s4'],desktop:['Desktop','--s2'],unknown:['Unknown','--s3']};
    // Where the month changed gear: the split with the biggest gap in ROAS (or clicks a day when
    // nothing sold). Middle third only, and only if the two sides really differ.
    function bestSplit(days,sales){
      const n=days.length;if(n<14)return null;
      const val=(x,len)=>sales?(x.roas||0):x.link_clicks/len;
      let best=null;
      for(let i=Math.ceil(n/3);i<=n-Math.ceil(n/3);i++){
        const a=sumRows(days.slice(0,i)),b=sumRows(days.slice(i));const va=val(a,i),vb=val(b,n-i);const hi=Math.max(va,vb);if(!(hi>0))continue;
        const gap=Math.abs(vb-va)/hi;if(!best||gap>best.gap)best={i,a,b,gap,va,vb,na:i,nb:n-i};
      }
      return best&&best.gap>=0.2?best:null;
    }

    // ── CSV ──
    const csvCell=(v)=>{if(v==null)return'';if(typeof v==='number')return String(Math.round(v*10000)/10000);let s=String(v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return/[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    const downloadCsv=(name,cols,rows)=>{const body=[cols.map(c=>csvCell(c.l.trim())).join(','),...rows.map(r=>cols.map(c=>csvCell(c.v(r))).join(','))].join('\r\n');
      const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+body],{type:'text/csv;charset=utf-8'}));a.download=name.replace(/[\\/:*?"<>|]+/g,' ')+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);};
    const CsvBtn=({name,cols,rows})=>h`<button class="btn-sec adr-noprint" style=${{padding:'3px 9px',fontSize:12}} onClick=${()=>downloadCsv(name,cols,rows)}><i class="ti ti-download" style=${{fontSize:13}}></i> CSV</button>`;

    // ── small pieces ──
    function Delta({cur,prev,sense,isNew}){
      if(isNew)return h`<span class="adr-d flat">New</span>`;
      const c=change(cur,prev);if(c==null)return null;
      const flat=Math.abs(c)<0.05;const up=c>0;
      const cls=flat||sense==='flat'?'flat':((up&&sense==='up')||(!up&&sense==='down'))?'good':'bad';
      return h`<span class=${'adr-d '+cls}>${flat?'':up?'▲ ':'▼ '}${Math.abs(c).toFixed(1)}%</span>`;
    }
    function Tile({tone,label,value,cur,prev,prevText,sense}){
      return h`<div class=${'adr-tile '+tone}>
        <div class="adr-tile-l">${label}</div>
        <div class="adr-tile-v">${value}</div>
        <div class="adr-tile-f"><${Delta} cur=${cur} prev=${prev} sense=${sense}/><span>${prevText}</span></div>
      </div>`;
    }
    function Sec({id,title,lead,pdf,setPdf,off,children}){
      const on=pdf[id]!==false&&!off;
      return h`<section class="adr-sec" data-pdf=${on?'1':'0'}>
        <div class="adr-sec-hd"><h2 class="adr-h2">${title}</h2>
          <label class="adr-pdf adr-noprint"><input type="checkbox" checked=${pdf[id]!==false} onChange=${e=>setPdf(p=>({...p,[id]:e.target.checked}))}/>In PDF</label></div>
        ${lead&&h`<p class="adr-lead">${lead}</p>`}
        ${children}
      </section>`;
    }
    const SecErr=({msg})=>msg?h`<div class="adr-err">Meta did not return this part: ${msg}</div>`:null;
    const Bullets=({items})=>items&&items.length?h`<ul class="adr-list">${items.map((t,i)=>h`<li key=${i}>${t}</li>`)}</ul>`:null;
    function Tbl({cols,rows,total,rowKey}){
      return h`<div class="adr-twrap"><table class="adr-t">
        <thead><tr>${cols.map(c=>h`<th key=${c.l}>${c.l.trim()}</th>`)}</tr></thead>
        <tbody>
          ${rows.map((r,i)=>h`<tr key=${rowKey?rowKey(r):i}>${cols.map(c=>h`<td key=${c.l}>${c.cell?c.cell(r):c.f?c.f(c.v(r),r):c.v(r)}</td>`)}</tr>`)}
          ${total&&h`<tr class="tot">${cols.map(c=>h`<td key=${c.l}>${c.cell?c.cell(total):c.f?c.f(c.v(total),total):c.v(total)}</td>`)}</tr>`}
        </tbody></table></div>`;
    }
    // Bold the best figure in a column, as the client PDF does.
    const markBest=(cols,rows)=>cols.map(c=>{
      if(!c.best)return c;
      const vals=rows.map(c.v).filter(v=>v!=null&&v>0);if(vals.length<2)return c;
      const top=c.best==='max'?Math.max(...vals):Math.min(...vals);const inner=c.f;
      return{...c,f:(v,r)=>v===top?h`<b>${inner(v,r)}</b>`:inner(v,r)};
    });
    // Daily chart: bars, plus an optional line on the same scale (or on its own right-hand scale),
    // with the before/after split marked when the period really changed gear.
    function DayChart({title,sub,days,bar,line,fmtTip,yPrefix,split,splitLeft,splitRight,xCaption}){
      const[hov,setHov]=useState(null);
      const n=days.length;if(!n)return null;
      const twoAxes=!!(line&&line.right);
      const W=720,H=270,L=50,R=twoAxes?44:8,T=split?28:8,B=xCaption?38:22;
      const peak=(fn)=>Math.max(...days.map(d=>fn(d)||0));
      const topL=niceMax(line&&!twoAxes?Math.max(peak(bar.v),peak(line.v)):peak(bar.v));
      const topR=twoAxes?niceMax(peak(line.v)):topL;
      const yOf=(v,top)=>T+(H-T-B)*(1-(v||0)/top);const y=(v)=>yOf(v,topL);const yLine=(v)=>yOf(v,topR);
      const band=(W-L-R)/n;const bw=Math.min(18,Math.max(2,band*0.68));const x=(i)=>L+band*i+band/2;
      const path=(i,v)=>{const y1=y(v),y0=y(0),ht=y0-y1;if(ht<=0)return'';const r=Math.min(2,ht,bw/2),a=x(i)-bw/2,b=x(i)+bw/2;return`M${a},${y0}V${y1+r}Q${a},${y1} ${a+r},${y1}H${b-r}Q${b},${y1} ${b},${y1+r}V${y0}Z`;};
      const every=Math.max(1,Math.ceil(n/11));const sameMonth=days[0].date_start.slice(0,7)===days[n-1].date_start.slice(0,7);
      const lab=(s)=>sameMonth?String(pd(s).d):dayLabel(s);
      const splitX=split?L+band*split.i:0;
      const lead=topL/Math.pow(10,Math.floor(Math.log10(topL)));const divs=(lead===5||lead===2.5)?5:4;const fracs=Array.from({length:divs+1},(_,i)=>i/divs);
      return h`<div class="adr-chart" onMouseLeave=${()=>setHov(null)}>
        <div class="adr-card-t">${title}</div>${sub&&h`<div class="adr-card-s">${sub}</div>`}
        ${line&&h`<div class="adr-legend"><span><span class="adr-key" style=${{background:`var(${bar.color})`}}></span>${bar.label}</span><span><span class="adr-key line" style=${{background:`var(${line.color})`}}></span>${line.label}</span></div>`}
        <svg class="adr-svg" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${title}>
          ${fracs.map(f=>h`<g key=${f}><line x1=${L} x2=${W-R} y1=${y(f*topL)} y2=${y(f*topL)} stroke=${f===0?'var(--axis)':'var(--grid)'} stroke-width="1"/><text x=${L-6} y=${y(f*topL)+4} text-anchor="end">${(yPrefix||'')+compact(f*topL)}</text>${twoAxes&&h`<text x=${W-R+6} y=${y(f*topL)+4}>${compact(f*topR)}</text>`}</g>`)}
          ${days.map((d,i)=>h`<path key=${d.date_start} d=${path(i,bar.v(d))} fill=${`var(${bar.color})`}/>`)}
          ${line&&h`<polyline points=${days.map((d,i)=>x(i)+','+yLine(line.v(d))).join(' ')} fill="none" stroke=${`var(${line.color})`} stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`}
          ${line&&days.map((d,i)=>h`<circle key=${d.date_start} cx=${x(i)} cy=${yLine(line.v(d))} r="2.5" fill=${`var(${line.color})`}/>`)}
          ${split&&h`<g><line x1=${splitX} x2=${splitX} y1=${6} y2=${y(0)} stroke="var(--t2)" stroke-width="1" stroke-dasharray="3 3"/><text class="ann" x=${L+6} y=${18}>${splitLeft}</text><text class="ann b" x=${splitX+7} y=${18}>${splitRight}</text></g>`}
          ${days.map((d,i)=>i%every===0&&h`<text key=${d.date_start} x=${x(i)} y=${H-B+15} text-anchor="middle">${lab(d.date_start)}</text>`)}
          ${xCaption&&h`<text x=${(L+W-R)/2} y=${H-5} text-anchor="middle">${xCaption}</text>`}
          ${hov!=null&&h`<line x1=${x(hov)} x2=${x(hov)} y1=${T} y2=${y(0)} stroke="var(--axis)" stroke-width="1"/>`}
          ${hov!=null&&line&&h`<circle cx=${x(hov)} cy=${yLine(line.v(days[hov]))} r="4" fill=${`var(${line.color})`} stroke="var(--ring)" stroke-width="2"/>`}
          ${days.map((d,i)=>h`<rect key=${d.date_start} x=${L+band*i} y=${T} width=${band} height=${H-T-B} fill="transparent" onMouseEnter=${()=>setHov(i)}/>`)}
        </svg>
        ${hov!=null&&h`<div class="adr-tip" style=${{top:70,...(hov>n/2?{right:((W-x(hov))/W*100+2)+'%'}:{left:(x(hov)/W*100+2)+'%'})}}><b>${dayLabel(days[hov].date_start)}</b>${fmtTip(days[hov]).map(t=>h`<div key=${t}>${t}</div>`)}</div>`}
      </div>`;
    }
    function Donut({parts,centre,centreSub}){
      const total=parts.reduce((s,p)=>s+p.value,0)||1;const r=70,C=2*Math.PI*r;let at=0;
      return h`<svg viewBox="0 0 190 190" width="190" height="190" role="img" aria-label=${parts.map(p=>p.label+' '+(p.value/total*100).toFixed(1)+'%').join(', ')}>
        <g transform="rotate(-90 95 95)">${parts.map(p=>{const len=p.value/total*C;const el=h`<circle key=${p.label} cx="95" cy="95" r=${r} fill="none" stroke=${p.color} stroke-width="38" stroke-dasharray=${`${len} ${C-len}`} stroke-dashoffset=${-at}/>`;at+=len;return el;})}</g>
        <text x="95" y="94" text-anchor="middle" style=${{fontSize:22,fontWeight:700,fill:'var(--t1)'}}>${centre}</text>
        <text x="95" y="112" text-anchor="middle" style=${{fontSize:12,fill:'var(--t2)'}}>${centreSub}</text>
      </svg>`;
    }

    // ── the words: facts from the numbers only ──
    const moved=(c)=>c>0?'rose':'fell';
    function overviewText(F,t,p,name,prevName,has){
      const parts=[];
      if(has.sales){
        const first=`${name} brought in ${F.m0(t.revenue)} from ${F.m0(t.spend)} of ad spend — a ${F.x(t.roas)} ROAS on ${F.n(t.orders)} order${t.orders===1?'':'s'}.`;
        if(p){const o=change(t.orders,p.orders),a=change(t.aov,p.aov);
          // ROAS is order value ÷ cost per order: if cost per order held or improved and ROAS still fell, order value is the reason.
          const aovReason=a!=null&&a<0&&p.roas!=null&&t.roas!=null&&t.roas<p.roas&&t.cpo!=null&&p.cpo!=null&&t.cpo<=p.cpo;
          if(o!=null&&aovReason)return{first,rest:`Orders ${moved(o)} ${Math.abs(Math.round(o))}% on ${prevName}, but ROAS slipped from ${F.x(p.roas)} because the average order fell ${Math.abs(Math.round(a))}%, from ${F.m0(p.aov)} to ${F.m0(t.aov)}.`};
          if(o!=null)parts.push(`Orders ${moved(o)} ${Math.abs(Math.round(o))}% on ${prevName}`);
          if(p.roas!=null&&t.roas!=null)parts.push(`ROAS ${t.roas>=p.roas?'rose':'slipped'} from ${F.x(p.roas)} to ${F.x(t.roas)}`);
          if(a!=null&&p.aov!=null)parts.push(`the average order ${moved(a)} ${Math.abs(Math.round(a))}%, from ${F.m0(p.aov)} to ${F.m0(t.aov)}`);}
        return{first,rest:parts.length?parts.join(', ')+'.':''};
      }
      const res=[];if(t.leads)res.push(`${F.n(t.leads)} lead${t.leads===1?'':'s'} at ${F.m0(t.cpl)} each`);if(t.messages)res.push(`${F.n(t.messages)} message conversation${t.messages===1?'':'s'} at ${F.m0(t.cost_msg)} each`);
      if(!res.length)res.push(`${F.n(t.link_clicks)} link clicks at ${F.m2(t.cpc_link)} each`);
      const first=`${name}: ${F.m0(t.spend)} of ad spend reached ${F.n(t.reach)} accounts and brought ${res.join(' and ')}.`;
      if(p){const s=change(t.spend,p.spend);if(s!=null)parts.push(`Spend ${moved(s)} ${Math.abs(Math.round(s))}% on ${prevName}`);const r=change(t.reach,p.reach);if(r!=null)parts.push(`reach ${moved(r)} ${Math.abs(Math.round(r))}%`);}
      return{first,rest:parts.length?parts.join(', ')+'.':''};
    }
    function draftNotes(F,R,prevName,has){
      const t=R.t,p=R.p,worked=[],didnt=[];
      if(p&&has.sales&&change(t.orders,p.orders)>0&&t.cpo!=null&&p.cpo!=null&&t.cpo<=p.cpo)worked.push(`Scaling: spend rose ${Math.round(change(t.spend,p.spend))}% and orders rose ${Math.round(change(t.orders,p.orders))}%, with cost per order down to ${F.m0(t.cpo)}.`);
      const bigSet=R.adsets.filter(c=>c.spend>=t.spend*0.2&&c.roas!=null).sort((a,b)=>b.roas-a.roas)[0];
      if(bigSet)worked.push(`${bigSet.adset_name}: ${F.n(bigSet.orders)} orders at ${F.x(bigSet.roas)} ROAS and ${F.m0(bigSet.cpo)} per order.`);
      if(R.split&&has.sales&&R.split.vb>R.split.va)worked.push(`From ${dayLabel(R.days[R.split.i].date_start)}: ROAS climbed from ${F.x(R.split.a.roas)} to ${F.x(R.split.b.roas)}.`);
      const star=R.ads.filter(a=>a.orders>=3&&a.roas!=null).sort((a,b)=>b.roas-a.roas)[0];
      if(star)worked.push(`${star.ad_name}: ${F.n(star.orders)} orders from ${F.m0(star.spend)}, a ${F.x(star.roas)} ROAS.`);
      if(p&&t.aov!=null&&p.aov!=null&&t.aov<p.aov)didnt.push(`Lower order value: the average order fell from ${F.m0(p.aov)} to ${F.m0(t.aov)}.`);
      if(t.adds_to_cart>0&&t.checkouts<t.adds_to_cart&&has.sales)didnt.push(`Cart drop-off: ${F.n(t.adds_to_cart-t.checkouts)} of ${F.n(t.adds_to_cart)} carts never reached checkout${p&&p.atc_to_checkout!=null?`. Cart-to-checkout went from ${F.p(p.atc_to_checkout,1)} to ${F.p(t.atc_to_checkout,1)}`:''}.`);
      R.campaigns.filter(c=>t.roas!=null&&c.roas!=null&&c.spend>=t.spend*0.05&&c.roas<t.roas*0.7).forEach(c=>didnt.push(`${c.campaign_name}: ${F.x(c.roas)} ROAS and ${F.m0(c.cpo)} per order${c.frequency>=4?`, with frequency at ${F.f2(c.frequency)}`:''}.`));
      if(has.sales&&t.cpo!=null){const dead=R.ads.filter(a=>a.orders===0&&a.spend>=t.cpo).slice(0,2);if(dead.length)didnt.push(`High spend, no sales: ${dead.map(a=>a.ad_name).join(' and ')} used ${F.m0(dead.reduce((s,a)=>s+a.spend,0))} with no orders.`);}
      return{worked:worked.map(x=>'• '+x).join('\n'),didnt:didnt.map(x=>'• '+x).join('\n')};
    }

    const reportCache=new Map();     // same account + dates within 15 minutes: no new call to Meta
    function AdsReport({clients,accounts,currentUser,showToast,reloadAccounts}){
      adrCss();
      const brands=useMemo(()=>{const ids=new Set(accounts.map(a=>a.client_id));return clients.filter(c=>ids.has(c.id)).sort((a,b)=>a.name.localeCompare(b.name));},[clients,accounts]);
      const[clientId,setClientId]=useState(null);
      const client=brands.find(c=>c.id===clientId)||brands[0]||null;
      const mine=client?accounts.filter(a=>a.client_id===client.id):[];
      const[acctId,setAcctId]=useState(null);
      const acct=mine.find(a=>a.id===acctId)||mine[0]||null;
      const[preset,setPreset]=useState('last_month');
      const[custom,setCustom]=useState(()=>presetRange('last_30'));
      const range=preset==='custom'?custom:presetRange(preset);
      const validRange=/^\d{4}-\d{2}-\d{2}$/.test(range.since||'')&&/^\d{4}-\d{2}-\d{2}$/.test(range.until||'')&&range.until>=range.since;
      const[data,setData]=useState(null);const[loading,setLoading]=useState(false);const[err,setErr]=useState(null);
      const seq=useRef(0);const docRef=useRef(null);
      const[pdf,setPdf]=useState({audience:false});   // the extra tables are on screen only unless ticked
      const[showAllAds,setShowAllAds]=useState(false);const[showDaily,setShowDaily]=useState(false);const[open,setOpen]=useState({});
      const load=useCallback(async(force)=>{
        if(!acct||!validRange)return;
        const key=[acct.id,range.since,range.until].join('|');
        const hit=reportCache.get(key);
        if(!force&&hit&&Date.now()-hit.at<900000){seq.current++;setData(hit.data);setErr(null);setLoading(false);return;}
        const me=++seq.current;setLoading(true);setErr(null);setData(null);
        try{
          const r=await fetch(`${SB_URL}/functions/v1/meta-ads-report`,{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${SB_KEY}`,apikey:SB_KEY},body:JSON.stringify({session_token:sessTok(),client_id:acct.client_id,account_id:acct.id,since:range.since,until:range.until})}).then(x=>x.json()).catch(()=>null);
          if(me!==seq.current)return;
          if(!r||!r.ok){setErr((r&&r.error)||'Could not reach Meta. Try again.');if(r&&r.expired&&reloadAccounts)reloadAccounts();return;}
          reportCache.set(key,{at:Date.now(),data:r});setData(r);
        }finally{if(me===seq.current)setLoading(false);}
      },[acct&&acct.id,acct&&acct.client_id,range.since,range.until,validRange]);
      useEffect(()=>{load(false);},[load]);
      useEffect(()=>{setOpen({});setShowAllAds(false);},[acct&&acct.id,range.since,range.until]);

      // what the agency writes for the PDF: kept in this browser per account + dates
      const noteKey=acct?`ams_adreport_notes_${acct.id}_${range.since}_${range.until}`:'';
      const[notes,setNotes]=useState({worked:'',didnt:'',recs:''});
      useEffect(()=>{let v=null;try{v=JSON.parse(localStorage.getItem(noteKey)||'null');}catch(_){}setNotes(v||{worked:'',didnt:'',recs:''});},[noteKey]);
      const setNote=(k,val)=>setNotes(n=>{const next={...n,[k]:val};try{localStorage.setItem(noteKey,JSON.stringify(next));}catch(_){}return next;});

      const R=useMemo(()=>{
        if(!data||!data.cur)return null;
        const c=data.cur;
        const prevCamp={};(data.prev&&data.prev.campaigns||[]).forEach(r=>{prevCamp[r.campaign_id]=derive(r);});
        const bySpend=(a,b)=>b.spend-a.spend;
        const t=derive(c.total);const days=(c.daily||[]).map(derive);
        return{t,p:data.prev&&data.prev.total?derive(data.prev.total):null,days,split:bestSplit(days,t.orders>0||t.revenue>0),
          campaigns:(c.campaigns||[]).map(derive).sort(bySpend),adsets:(c.adsets||[]).map(derive).sort(bySpend),ads:(c.ads||[]).map(derive).sort(bySpend),prevCamp,
          device:(c.device||[]).map(derive),prevDevice:(data.prev&&data.prev.device||[]).map(derive),
          region:(c.region||[]).map(r=>({...derive(r),region:String(r.region||'').replace(/ region$/,'')})).sort((a,b)=>b.impressions-a.impressions),age:(c.age||[]).map(derive),gender:(c.gender||[]).map(derive),
          platform:(c.platform||[]).map(derive).sort(bySpend),placement:(c.placement||[]).map(derive).sort(bySpend)};
      },[data]);

      useEffect(()=>{
        if(!R||!acct||!data)return;
        let saved=null;try{saved=localStorage.getItem(noteKey);}catch(_){}
        if(saved)return;
        const full=isFullMonth(data.since,data.until);
        const d=draftNotes(mkFmt(acct.currency),R,full?MONTHS[pd(data.prev_since).m]:'the previous period',{sales:R.t.orders>0||R.t.revenue>0,leads:R.t.leads>0,msgs:R.t.messages>0});
        setNotes({worked:d.worked,didnt:d.didnt,recs:''});
      },[R,noteKey]);

      const controls=h`<div class="adr-ctl">
        <div><div class="fi-lbl">Brand</div><select class="fi fi-select" style=${{minWidth:190}} value=${client?client.id:''} onChange=${e=>{setClientId(e.target.value);setAcctId(null);}}>${brands.map(c=>h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}</select></div>
        ${mine.length>1&&h`<div><div class="fi-lbl">Ad account</div><select class="fi fi-select" style=${{minWidth:190}} value=${acct?acct.id:''} onChange=${e=>setAcctId(e.target.value)}>${mine.map(a=>h`<option key=${a.id} value=${a.id}>${a.name||a.ad_account_id}</option>`)}</select></div>`}
        <div><div class="fi-lbl">Dates</div><div style=${{display:'flex',gap:6,flexWrap:'wrap'}}>${PRESETS.map(([k,l])=>h`<button key=${k} class=${'fb'+(preset===k?' on':'')} style=${{fontSize:13,padding:'5px 12px'}} onClick=${()=>setPreset(k)}>${l}</button>`)}</div></div>
        ${preset==='custom'&&h`<div style=${{display:'flex',gap:6,alignItems:'flex-end'}}><div><div class="fi-lbl">From</div><input class="fi" type="date" value=${custom.since} onChange=${e=>setCustom(c=>({...c,since:e.target.value}))}/></div><div><div class="fi-lbl">To</div><input class="fi" type="date" value=${custom.until} onChange=${e=>setCustom(c=>({...c,until:e.target.value}))}/></div></div>`}
        <div style=${{marginLeft:'auto',display:'flex',gap:8}}>
          <button class="btn-sec" disabled=${loading||!acct} onClick=${()=>load(true)}><i class=${'ti '+(loading?'ti-loader-2 spinner':'ti-refresh')} style=${{fontSize:14}}></i> Refresh</button>
          <button class="btn-pri" disabled=${!R} onClick=${()=>savePdf()}><i class="ti ti-file-type-pdf" style=${{fontSize:14}}></i> Download PDF</button>
        </div>
      </div>`;

      const name=validRange?periodTitle(range.since,range.until):'';
      const title=client?`${client.name} — Meta Ads Report, ${name}`:'';
      function savePdf(){
        const node=docRef.current;if(!node)return;
        const copy=node.cloneNode(true);
        copy.querySelectorAll('.adr-noprint,[data-pdf="0"]').forEach(e=>e.remove());
        const w=window.open('','_blank');
        if(!w){showToast('Allow pop-ups for this site, then press Download PDF again');return;}
        let done=false;const go=()=>{if(done)return;done=true;w.focus();w.print();};
        w.document.open();
        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${ADR_CSS}${adrPrintCss(title)}</style></head><body><div class="adr">${copy.outerHTML}</div></body></html>`);
        w.document.close();
        w.addEventListener('load',go);setTimeout(go,2500);
        showToast('Choose "Save as PDF" in the print window');
      }

      if(!brands.length)return h`<div class="empty"><i class="ti ti-brand-meta"></i><div class="empty-t">No Meta ad account linked yet</div><div class="empty-s">Settings → Connected accounts → pick the brand → Connect, then tick its ad account in the list. Its report appears here straight away.</div></div>`;

      let body=null;
      if(!validRange)body=h`<div class="empty-s">Pick a start date before the end date.</div>`;
      else if(loading&&!data)body=h`<div><div style=${{fontSize:13,color:'var(--t3)',marginBottom:10}}>Fetching this report from Meta…</div><${Skel} h=${150}/><${Skel} h=${220}/><${Skel} h=${180}/></div>`;
      else if(err)body=h`<div class="empty"><i class="ti ti-plug-connected-x"></i><div class="empty-t">Could not load this report</div><div class="empty-s">${err}</div></div>`;
      else if(R&&!(R.t.spend>0||R.t.impressions>0))body=h`<div class="empty"><i class="ti ti-chart-bar-off"></i><div class="empty-t">No ads ran in ${name}</div><div class="empty-s">${acct.name||acct.ad_account_id} shows no spend for these dates. Try another period.</div></div>`;
      else if(R)body=renderDoc();

      function renderDoc(){
        const F=mkFmt(acct.currency);const{t,p,split}=R;const errs=data.errors||{};
        const full=isFullMonth(data.since,data.until);
        const curRange=periodLabel(data.since,data.until),prevRange=periodLabel(data.prev_since,data.prev_until);
        const shortName=full?MONTHS[pd(data.since).m]:'This period';
        const prevFull=full?MONTHS[pd(data.prev_since).m]:'the previous period';
        const prevShort=full?MONTHS[pd(data.prev_since).m].slice(0,3):'Before';
        const prevColumn=full?MONTHS[pd(data.prev_since).m]:'Previous period';
        const nextMonth=MONTHS[(pd(data.until).m+1)%12];
        const has={sales:t.orders>0||t.revenue>0,leads:t.leads>0,msgs:t.messages>0};
        const ov=overviewText(F,t,p,shortName,prevFull,has);
        const srcAcct=`Meta Ads Manager · ad account ${acct.name||acct.ad_account_id}`;
        const tile=(tone,label,key,fmt,sense)=>h`<${Tile} key=${label} tone=${tone} label=${label} value=${fmt(t[key])} cur=${t[key]} prev=${p?p[key]:null} sense=${sense} prevText=${p?prevShort+' '+fmt(p[key]):''}/>`;
        const moreRows=[
          ['Landing page views','landing_page_views',F.n,'pct'],['Cost per landing page view','cost_lpv',F.m2,'pct'],
          ...(has.sales?[['Cost per add to cart','cost_atc',F.m2,'pct'],['Checkouts started','checkouts',F.n,'pct'],['Add to cart → checkout rate','atc_to_checkout',v=>F.p(v,1),'pts',1],['Website conversion rate (orders ÷ landing page views)','site_cvr',v=>F.p(v,2),'pts',2],['Ad spend as % of revenue','spend_share',v=>F.p(v,1),'pts',1]]
            :[['Link click-through rate','ctr_link',v=>F.p(v,2),'pts',2],['Click-through rate (all clicks)','ctr_all',v=>F.p(v,2),'pts',2]]),
        ];
        const chg=(cur,prev,kind,dp)=>{if(cur==null||prev==null)return'—';if(kind==='pts'){const d=cur-prev;return(d>=0?'+':'−')+Math.abs(d).toFixed(dp||1)+' pts';}const c=change(cur,prev);return c==null?'—':(c>=0?'+':'−')+Math.abs(c).toFixed(1)+'%';};

        // timeline wording
        const dayRate=(v,len)=>(v/len).toFixed(1);
        const seg=split?{left:noYear(periodLabel(data.since,R.days[split.i-1].date_start)),right:noYear(periodLabel(R.days[split.i].date_start,data.until)),from:R.days[split.i].date_start}:null;
        const upSplit=split&&split.vb>split.va;
        const best=has.sales&&R.days.length?R.days.reduce((a,b)=>b.revenue>a.revenue?b:a):null;
        const dry=has.sales?R.days.filter(d=>d.spend>0&&d.orders===0):[];
        const lead1=split?(has.sales?`Results ${upSplit?'picked up':'slowed'} after ${dayLong(seg.from)}: orders went from ${dayRate(split.a.orders,split.na)} a day to ${dayRate(split.b.orders,split.nb)} a day, and ROAS from ${F.x(split.a.roas)} to ${F.x(split.b.roas)}.`:`Link clicks went from ${Math.round(split.va)} a day to ${Math.round(split.vb)} a day after ${dayLong(seg.from)}.`):'';
        const lead2=[dry.length&&dry.length<=4?`No orders on ${dry.map(d=>`${dayLabel(d.date_start)} (${F.m0(d.spend)} spent)`).join(', ')}.`:dry.length?`${dry.length} days had spend but no orders.`:'',best&&best.revenue>0?`The best day was ${dayLong(best.date_start)} — ${F.m0(best.revenue)} from ${F.m0(best.spend)}, a ${best.roas.toFixed(1).replace(/\.0$/,'')}x return.`:''].filter(Boolean).join(' ');
        const lead3=split?`Impressions averaged ${F.n(split.b.impressions/split.nb)} a day from ${dayLabel(seg.from)}, against ${F.n(split.a.impressions/split.na)} before. Link CTR went from ${F.p(split.a.ctr_link,1)} to ${F.p(split.b.ctr_link,1)}.`:'';
        const sameMonth=data.since.slice(0,7)===data.until.slice(0,7);
        const xCap=sameMonth?`Day of ${MONTHS[pd(data.since).m]} ${pd(data.since).y}`:null;

        // campaigns
        const dCol=(l,key)=>({l,v:r=>{const c=r._prev?change(r[key],r._prev[key]):null;return c==null?(r._new?'New':''):Number(c.toFixed(1));},cell:r=>h`<${Delta} cur=${r[key]} prev=${r._prev&&r._prev[key]} sense="flat" isNew=${r._new}/>`});
        const delCols=[{l:'Campaign',v:r=>r.campaign_name},{l:'Impressions',v:r=>r.impressions,f:F.n},dCol('% Δ','impressions'),{l:'Reach',v:r=>r.reach,f:F.n},dCol('% Δ ','reach'),{l:'Link clicks',v:r=>r.link_clicks,f:F.n},dCol('% Δ  ','link_clicks'),{l:'Amount spent',v:r=>r.spend,f:F.m0},dCol('% Δ   ','spend')];
        const campRows=R.campaigns.map(c=>{const q=R.prevCamp[c.campaign_id];return{...c,_prev:q||null,_new:!q&&!!p};});
        const campTotal={...t,campaign_name:'Total',_prev:p,_new:false};
        const resultCols=[
          {l:'Spend',v:r=>r.spend,f:F.m0},
          ...(has.sales?[{l:'Revenue',v:r=>r.revenue,f:(v)=>v>0?F.m0(v):'—'},{l:'ROAS',best:'max',v:r=>r.roas==null?null:Number(r.roas.toFixed(2)),f:(v)=>F.x(v)},{l:'Orders',v:r=>r.orders,f:F.n},{l:'AOV',v:r=>r.aov,f:F.m0},{l:'Cost per order',v:r=>r.cpo,f:F.m0}]:[]),
          ...(has.leads?[{l:'Leads',v:r=>r.leads,f:F.n},{l:'Cost per lead',v:r=>r.cpl,f:F.m0}]:[]),
          ...(has.msgs?[{l:'Messages',v:r=>r.messages,f:F.n},{l:'Cost per message',v:r=>r.cost_msg,f:F.m0}]:[]),
        ];
        const treeCols=markBest([{l:'Status (now)',v:r=>statusLabel(r.status)},...resultCols,{l:'CPM',v:r=>r.cpm,f:F.m0},{l:'CTR (all)',v:r=>r.ctr_all,f:v=>F.p(v,2)}],R.campaigns);
        const cell=(c,r)=>c.f?c.f(c.v(r),r):c.v(r);
        const toggle=(k)=>setOpen(o=>({...o,[k]:!o[k]}));
        const main=R.campaigns[0];const mainPrev=main&&R.prevCamp[main.campaign_id];
        const campLead=main&&t.spend>0?`${main.campaign_name} carried ${shortName} with ${Math.round(main.spend/t.spend*100)}% of spend${has.sales&&t.revenue>0?`, ${Math.round(main.revenue/t.revenue*100)}% of revenue${main.roas!=null?` and a ${F.x(main.roas)} ROAS`:''}`:''}.${mainPrev&&change(main.spend,mainPrev.spend)!=null?` Its spend ${moved(change(main.spend,mainPrev.spend))} ${Math.abs(Math.round(change(main.spend,mainPrev.spend)))}% on ${prevFull}${has.sales&&mainPrev.roas!=null?`; ROAS was ${F.x(mainPrev.roas)}`:''}.`:''}`:'';
        const campBullets=[];
        const sized=R.campaigns.filter(c=>c.spend>=t.spend*0.05);
        const hiCtr=sized.slice().sort((a,b)=>(b.ctr_all||0)-(a.ctr_all||0))[0];
        if(hiCtr&&sized.length>1)campBullets.push(h`<span><b>${hiCtr.campaign_name}</b> drew the highest click rate (${F.p(hiCtr.ctr_all,2)}) at a CPM of ${F.m0(hiCtr.cpm)}${hiCtr.cpo!=null?`, with cost per order at ${F.m0(hiCtr.cpo)}`:''}.</span>`);
        const hiAov=has.sales?R.campaigns.filter(c=>c.orders>0).sort((a,b)=>(b.aov||0)-(a.aov||0))[0]:null;
        if(hiAov&&R.campaigns.filter(c=>c.orders>0).length>1)campBullets.push(h`<span><b>${hiAov.campaign_name}</b> had the highest order value (${F.m0(hiAov.aov)})${`, with ${F.n(hiAov.reach)} accounts seeing each ad ${(hiAov.frequency||0).toFixed(1)} times and cost per order at ${F.m0(hiAov.cpo)}`}.</span>`);
        if(has.sales)R.campaigns.filter(c=>c.orders===0&&c.spend>0).forEach(c=>campBullets.push(h`<span><b>${c.campaign_name}</b> spent ${F.m0(c.spend)} with no orders${c.objective&&!/SALES|CONVERSIONS/.test(c.objective)?`: it ran on the ${titleCase(String(c.objective).replace(/^OUTCOME_/,'').toLowerCase())} objective, so it is not built to drive or track sales`:''}.</span>`));

        // ads: everything that took a real share of spend; the long tail is one sentence
        const adsSorted=R.ads;
        const listed=showAllAds?adsSorted:adsSorted.filter(a=>a.spend>=t.spend*0.004).slice(0,12);
        const restAds=adsSorted.slice(listed.length);const restSum=restAds.length?sumRows(restAds):null;
        const thumb=(a)=>{const pic=a.thumbnail&&/^https:/.test(a.thumbnail)?h`<img class="adr-noprint" src=${a.thumbnail} alt="" loading="lazy" referrerpolicy="no-referrer" onError=${e=>{e.target.style.visibility='hidden';}}/>`:null;
          return h`<div class="adr-ad">${pic}<div>${a.permalink&&/^https:/.test(a.permalink)?h`<a href=${a.permalink} target="_blank" rel="noopener" style=${{color:'inherit',textDecoration:'none'}}>${a.ad_name}</a>`:a.ad_name}</div></div>`;};
        const withBest=(rows)=>markBest([{l:'Ad',v:r=>r.ad_name,cell:thumb},{l:'Ad set',v:r=>r.adset_name},...resultCols.map(c=>c.l==='AOV'?{...c,best:'max'}:c.l==='Cost per order'?{...c,best:'min'}:c),{l:'CTR (all)',v:r=>r.ctr_all,f:v=>F.p(v,2)},{l:'Cost per link click',best:'min',v:r=>r.cpc_link,f:F.m2}],rows);
        const adCols=withBest(listed);
        const adBullets=[];
        const star=R.ads.filter(a=>a.orders>=3&&a.roas!=null).sort((a,b)=>b.roas-a.roas)[0];
        if(star)adBullets.push(h`<span><b>Best creative of the period: ${star.ad_name}</b> — ${F.n(star.orders)} orders from ${F.m0(star.spend)} at a ${F.x(star.roas)} ROAS.</span>`);
        if(has.sales&&t.cpo!=null){const hot=R.ads.filter(a=>a.orders===0&&a.spend>=t.cpo&&(a.ctr_all||0)>(t.ctr_all||0)).slice(0,2);
          if(hot.length){const ctrs=hot.map(a=>a.ctr_all);adBullets.push(h`<span><b>Clicks without sales.</b> ${hot.map(a=>a.ad_name).join(' and ')} had CTRs of ${F.p(Math.min(...ctrs),1)}${hot.length>1?`–${F.p(Math.max(...ctrs),1)}`:''} yet no orders from ${F.m0(hot.reduce((s,a)=>s+a.spend,0))}${hot.length>1?' combined':''}.</span>`);}
          const odd=R.ads.filter(a=>a.adds_to_cart>=10&&a.link_clicks>0&&a.adds_to_cart/a.link_clicks>=0.4).slice(0,3);
          if(odd.length)adBullets.push(h`<span><b>Check the add-to-cart tracking.</b> ${odd.map(a=>`${a.ad_name} logged ${F.n(a.adds_to_cart)} adds to cart from ${F.n(a.link_clicks)} link click${a.link_clicks===1?'':'s'}`).join(' and ')}: rates that suggest view-through or duplicate cart events.</span>`);}

        // device
        const devRows=R.device.slice().sort((a,b)=>b.impressions-a.impressions);
        const devImp=devRows.reduce((s,r)=>s+r.impressions,0);
        const devName=(r)=>(DEVICE[r.device_platform]||[titleCase(r.device_platform)])[0];
        const devColor=(r)=>`var(${(DEVICE[r.device_platform]||[0,'--s3'])[1]})`;
        const devCsv=[{l:'Device',v:devName},{l:'Share',v:r=>devImp?Number((r.impressions/devImp*100).toFixed(1)):null},{l:'Impressions',v:r=>r.impressions},{l:'Link clicks',v:r=>r.link_clicks},...resultCols];
        const grp=(rows,keys)=>sumRows(rows.filter(r=>keys.includes(r.device_platform)));
        const devPair=[['Mobile (app + web)',['mobile_app','mobile_web'],'b'],['Computer (desktop)',['desktop'],'o']].map(([label,keys,tone])=>{const c=grp(R.device,keys),q=R.prevDevice.length?grp(R.prevDevice,keys):null;
          return h`<div key=${label} class=${'adr-tile '+tone}><div style=${{fontWeight:600,fontSize:14}}>${label}</div>
            <div class="adr-kv"><span>Impressions</span><b>${F.n(c.impressions)}</b>${q&&h`<${Delta} cur=${c.impressions} prev=${q.impressions} sense="up"/>`}</div>
            <div class="adr-kv"><span>Link clicks</span><b>${F.n(c.link_clicks)}</b>${q&&h`<${Delta} cur=${c.link_clicks} prev=${q.link_clicks} sense="up"/>`}</div>
            <div style=${{fontSize:12.5,marginTop:8}}>${F.m0(c.spend)} spend${has.sales?` · ${F.n(c.orders)} order${c.orders===1?'':'s'}${c.roas!=null?` · ${F.x(c.roas)} ROAS`:''}`:''}</div></div>`;});
        const topDev=devRows[0];const topShare=topDev&&devImp?topDev.impressions/devImp*100:0;
        const devHead=topDev?`${devName(topDev)} delivered ${F.p(topShare,1)} of impressions${has.sales&&t.orders?` and ${F.n(topDev.orders)} of ${F.n(t.orders)} orders`:''}`:'';
        const devLead=topDev?`${topShare>=80&&/^mobile/.test(topDev.device_platform)?`Nearly everything happened on mobile: the ${devName(topDev).toLowerCase()} took`:`${devName(topDev)} took`} ${F.p(topShare,1)} of impressions${has.sales&&t.orders?` and ${F.n(topDev.orders)} of the ${F.n(t.orders)} orders`:''}.`:'';
        const devOthers=devRows.filter(r=>r!==topDev&&r.spend>=1);const devOtherSpend=devOthers.reduce((s,r)=>s+r.spend,0);
        const devAfter=devOthers.length&&t.spend>0&&devOtherSpend/t.spend<0.05?`${devOthers.slice().sort((a,b)=>b.spend-a.spend).map((r,i)=>i?devName(r).toLowerCase():devName(r)).join(' and ')} ${devOthers.length>1?'together ':''}used ${F.m0(devOtherSpend)} (${F.p(devOtherSpend/t.spend*100,1)} of spend).`:'';

        // state
        const top10=R.region.slice(0,10);const maxImp=top10.length?top10[0].impressions:0;
        const allImp=R.region.reduce((s,r)=>s+r.impressions,0)||1,allSpend=R.region.reduce((s,r)=>s+r.spend,0)||1;
        const topImp=top10.reduce((s,r)=>s+r.impressions,0),topSpend=top10.reduce((s,r)=>s+r.spend,0);
        const stateCsv=[{l:'State',v:r=>r.region},{l:'Impressions',v:r=>r.impressions},{l:'Link clicks',v:r=>r.link_clicks},{l:'CTR (link)',v:r=>r.ctr_link},{l:'Cost per click',v:r=>r.cpc_link},{l:'Spend',v:r=>r.spend}];
        const first=top10[0],second=top10[1];
        const stateLead=first?`${first.region} was the biggest market${second&&second.impressions?`, with ${(first.impressions/second.impressions).toFixed(1)} times the impressions of ${second.region}, the next state`:''}.`:'';
        const qualified=top10.filter(r=>r.link_clicks>=20);const bestCtr=qualified.slice().sort((a,b)=>b.ctr_link-a.ctr_link)[0],cheapest=qualified.slice().sort((a,b)=>a.cpc_link-b.cpc_link)[0];

        const dimCols=(label,fn)=>[{l:label,v:fn},{l:'Impressions',v:r=>r.impressions,f:F.n},{l:'Reach',v:r=>r.reach,f:F.n},{l:'Link clicks',v:r=>r.link_clicks,f:F.n},{l:'CTR (link)',v:r=>r.ctr_link,f:v=>F.p(v,2)},...resultCols];
        const dayCols=[{l:'Date',v:r=>r.date_start,f:v=>dayLabel(v)},{l:'Spend',v:r=>r.spend,f:F.m0},...(has.sales?[{l:'Purchase value',v:r=>r.revenue,f:F.m0},{l:'ROAS',v:r=>r.roas==null?null:Number(r.roas.toFixed(2)),f:F.x},{l:'Orders',v:r=>r.orders,f:F.n}]:[]),...(has.leads?[{l:'Leads',v:r=>r.leads,f:F.n}]:[]),...(has.msgs?[{l:'Messages',v:r=>r.messages,f:F.n}]:[]),{l:'Impressions',v:r=>r.impressions,f:F.n},{l:'Reach',v:r=>r.reach,f:F.n},{l:'Link clicks',v:r=>r.link_clicks,f:F.n}];
        const unlisted=t.spend-R.campaigns.reduce((s,c)=>s+c.spend,0);
        const fileBase=`${client.name} ${name}`;
        const noteBox=(k,label,ph)=>h`<div key=${k} style=${{marginBottom:12}}>
          ${(notes[k]||'').trim()?h`<div class="adr-printonly">${label&&h`<h3 class="adr-h3">${label}</h3>`}<div class="adr-note">${notes[k]}</div></div>`:null}
          <div class="adr-noprint">${label&&h`<div class="fi-lbl">${label}</div>`}<textarea class="fi" rows="6" style=${{width:'100%',resize:'vertical',fontFamily:'inherit'}} placeholder=${ph} value=${notes[k]||''} onChange=${e=>setNote(k,e.target.value)}></textarea></div>
        </div>`;
        const today=new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});

        return h`<div class="adr-doc" ref=${docRef}>
          <h1 class="adr-h1">${title}</h1>
          <div class="adr-pills"><span class="adr-pill">${today}</span>${currentUser&&currentUser.name&&h`<span>·</span><span class="adr-pill">${currentUser.name}</span>`}</div>

          <${Sec} id="overview" title="Overview" lead=${h`<b>${ov.first}</b>${ov.rest?' '+ov.rest:''}`} pdf=${pdf} setPdf=${setPdf}>
            <div class="adr-card-t">${has.sales?`${shortName}: ${F.m0(t.revenue)} revenue on ${F.m0(t.spend)} spend, a ${F.x(t.roas)} ROAS`:`${shortName}: ${F.m0(t.spend)} spend, ${F.n(t.reach)} accounts reached`}</div>
            <div class="adr-card-s">${curRange}${p?` · arrows = change vs ${periodTitle(data.prev_since,data.prev_until)}`:''} · green better, red worse, grey neutral</div>
            <div class="adr-groups">
              <div class="adr-group"><div class="adr-group-t">Progress over time</div><div class="adr-tiles">
                ${tile('b','Impressions','impressions',F.n,'up')}${tile('b','Reach','reach',F.n,'up')}${tile('b','Frequency','frequency',F.f2,'flat')}${tile('b','CPM','cpm',F.m2,'down')}
              </div></div>
              <div class="adr-group"><div class="adr-group-t">Conversions</div><div class="adr-tiles">
                ${tile('o','Link clicks','link_clicks',F.n,'up')}${tile('o','CTR (link clicks)','ctr_link',v=>F.p(v,2),'up')}${tile('o','Cost / link click','cpc_link',F.m2,'down')}${tile('o','Amount spent','spend',F.m0,'flat')}
              </div></div>
              ${has.sales&&h`<div class="adr-group wide"><div class="adr-group-t">Sales and return</div><div class="adr-tiles">
                ${tile('g','Purchase value (revenue)','revenue',F.m0,'up')}${tile('g','ROAS','roas',F.x,'up')}${tile('g','Orders','orders',F.n,'up')}${tile('g','Average order value','aov',F.m0,'up')}${tile('g','Cost per order','cpo',F.m0,'down')}${tile('g','Adds to cart','adds_to_cart',F.n,'up')}
              </div></div>`}
              ${(has.leads||has.msgs)&&h`<div class="adr-group wide"><div class="adr-group-t">Leads and messages</div><div class="adr-tiles" style=${{gridTemplateColumns:`repeat(${has.leads&&has.msgs?4:2},minmax(0,1fr))`}}>
                ${has.leads&&tile('g','Leads','leads',F.n,'up')}${has.leads&&tile('g','Cost per lead','cpl',F.m0,'down')}${has.msgs&&tile('g','Messages started','messages',F.n,'up')}${has.msgs&&tile('g','Cost per message','cost_msg',F.m0,'down')}
              </div></div>`}
            </div>
            <p class="adr-src">${srcAcct} · ${noYear(curRange)}${p?` vs ${prevRange}`:''}</p>
            <div class="adr-twrap"><table class="adr-t"><thead><tr><th>More numbers</th><th>${shortName}</th><th>${p?prevColumn:''}</th><th>Change</th></tr></thead><tbody>
              ${moreRows.filter(([, k])=>t[k]||(p&&p[k])).map(([l,k,f,kind,dp])=>h`<tr key=${k}><td>${l}</td><td>${f(t[k])}</td><td>${p?f(p[k]):'—'}</td><td>${p?chg(t[k],p[k],kind,dp):'—'}</td></tr>`)}
            </tbody></table></div>
            <p class="adr-lead" style=${{marginTop:12}}>All figures are Meta-reported${has.sales?' (pixel purchases, default attribution)':''} in ${acct.currency||'INR'}.</p>
          <//>

          ${R.days.length>0&&h`<${Sec} id="timeline" title="Timeline" lead=${lead1} pdf=${pdf} setPdf=${setPdf}>
            <${SecErr} msg=${errs.daily}/>
            ${has.sales?h`<${DayChart} title=${split?`ROAS ${upSplit?'rose':'fell'} from ${split.a.roas.toFixed(1)}x to ${split.b.roas.toFixed(1)}x from ${dayLabel(seg.from)}`:'Purchase value and ad spend by day'} sub=${`Daily purchase value vs daily ad spend, ${F.symbol}, ${curRange}`} days=${R.days} bar=${{v:d=>d.revenue,color:'--s3',label:'Purchase value'}} line=${{v:d=>d.spend,color:'--s2',label:'Ad spend'}} yPrefix=${F.symbol} xCaption=${xCap} split=${split} splitLeft=${seg?`${seg.left}: ${F.m0(split.a.spend)} spend → ${F.x(split.a.roas)} ROAS`:''} splitRight=${seg?`${seg.right}: ${F.m0(split.b.spend)} spend → ${F.x(split.b.roas)} ROAS`:''} fmtTip=${d=>[`Purchase value ${F.m0(d.revenue)}`,`Ad spend ${F.m0(d.spend)}`,`${F.n(d.orders)} order${d.orders===1?'':'s'}${d.roas!=null?' · '+F.x(d.roas):''}`]}/>`
              :h`<${DayChart} title="Ad spend by day" sub=${curRange} days=${R.days} bar=${{v:d=>d.spend,color:'--s2',label:'Ad spend'}} yPrefix=${F.symbol} xCaption=${xCap} fmtTip=${d=>[`Ad spend ${F.m0(d.spend)}`]}/>`}
            <p class="adr-src">Meta Ads Manager · daily, ${curRange}</p>
            ${lead2&&h`<p class="adr-lead">${lead2}</p>`}
            ${(()=>{const c1=split?split.a.link_clicks/split.na:0,c2=split?split.b.link_clicks/split.nb:0;return h`<${DayChart} title=${split?`Link clicks ${c2>=c1?'rose':'fell'} from ${F.n(c1)} to ${F.n(c2)} a day from ${dayLabel(seg.from)}`:'Link clicks and impressions by day'} sub=${`Daily link clicks (bars, left axis) and impressions (line, right axis), ${curRange}`} days=${R.days} bar=${{v:d=>d.link_clicks,color:'--s2',label:'Link clicks'}} line=${{v:d=>d.impressions,color:'--s1',label:'Impressions',right:true}} xCaption=${xCap} split=${split} splitLeft=${seg?`${seg.left}: ${F.n(c1)} clicks a day`:''} splitRight=${seg?`${seg.right}: ${F.n(c2)} clicks a day`:''} fmtTip=${d=>[`${F.n(d.link_clicks)} link clicks`,`${F.n(d.impressions)} impressions`,`CTR ${F.p(d.ctr_link,2)}`]}/>`;})()}
            <p class="adr-src">Meta Ads Manager · daily, ${curRange}</p>
            ${lead3&&h`<p class="adr-lead">${lead3}</p>`}
            <div class="adr-noprint" style=${{display:'flex',gap:8,alignItems:'center'}}>
              <button class="btn-sec" style=${{padding:'3px 9px',fontSize:12}} onClick=${()=>setShowDaily(x=>!x)}>${showDaily?'Hide':'Show'} day-by-day numbers</button>
              <${CsvBtn} name=${fileBase+' daily'} cols=${dayCols} rows=${R.days}/>
            </div>
            ${showDaily&&h`<div class="adr-noprint" style=${{marginTop:8}}><${Tbl} cols=${dayCols} rows=${R.days} rowKey=${r=>r.date_start}/></div>`}
          <//>`}

          <${Sec} id="campaigns" title="Campaigns" pdf=${pdf} setPdf=${setPdf} lead=${campLead}>
            <${SecErr} msg=${errs.campaigns}/>
            <div class="adr-noprint" style=${{display:'flex',justifyContent:'flex-end',marginBottom:6}}><${CsvBtn} name=${fileBase+' campaigns'} cols=${delCols} rows=${campRows}/></div>
            <${Tbl} cols=${delCols} rows=${campRows} total=${campTotal} rowKey=${r=>r.campaign_id}/>
            <p class="adr-lead" style=${{marginTop:10}}>% Δ = change vs ${prevRange}. Total reach counts each account once, so it is less than the sum of the rows.${unlisted>1?` ${F.m0(unlisted)} of the total came from campaigns Meta no longer lists.`:''}</p>
            <h3 class="adr-h3">${has.sales?`Sales by campaign, ${shortName}`:`Results by campaign, ${shortName}`}</h3>
            <div class="adr-noprint" style=${{fontSize:12,color:'var(--t3)',marginBottom:6}}>Press ▸ to open a campaign into its ad sets, and an ad set into its ads.</div>
            <div class="adr-twrap"><table class="adr-t">
              <thead><tr><th>Campaign</th>${treeCols.map(c=>h`<th key=${c.l}>${c.l}</th>`)}</tr></thead>
              <tbody>
                ${R.campaigns.map(c=>{const k='c'+c.campaign_id;const kids=R.adsets.filter(s=>s.campaign_id===c.campaign_id);return h`<${React.Fragment} key=${k}>
                  <tr><td>${kids.length>0&&h`<button class="adr-exp adr-noprint" aria-expanded=${!!open[k]} aria-label=${'Open '+c.campaign_name} onClick=${()=>toggle(k)}>${open[k]?'▾':'▸'}</button>`}${c.campaign_name}</td>${treeCols.map(col=>h`<td key=${col.l}>${cell(col,c)}</td>`)}</tr>
                  ${open[k]&&kids.map(s=>{const sk='s'+s.adset_id;const ads=R.ads.filter(a=>a.adset_id===s.adset_id);return h`<${React.Fragment} key=${sk}>
                    <tr class="lv1"><td>${ads.length>0&&h`<button class="adr-exp adr-noprint" aria-expanded=${!!open[sk]} aria-label=${'Open '+s.adset_name} onClick=${()=>toggle(sk)}>${open[sk]?'▾':'▸'}</button>`}${s.adset_name}</td>${treeCols.map(col=>h`<td key=${col.l}>${cell(col,s)}</td>`)}</tr>
                    ${open[sk]&&ads.map(a=>h`<tr class="lv2" key=${a.ad_id}><td>${thumb(a)}</td>${treeCols.map(col=>h`<td key=${col.l}>${cell(col,a)}</td>`)}</tr>`)}
                  <//>`;})}
                <//>`;})}
                <tr class="tot"><td>Total</td>${treeCols.map(col=>h`<td key=${col.l}>${col.l==='Status (now)'?'':cell(col,t)}</td>`)}</tr>
              </tbody>
            </table></div>
            <${SecErr} msg=${errs.adsets}/>
            <${Bullets} items=${campBullets}/>
            <div class="adr-noprint" style=${{marginTop:6}}><${CsvBtn} name=${fileBase+' ad sets'} cols=${[{l:'Ad set',v:r=>r.adset_name},...treeCols]} rows=${R.adsets}/></div>
          <//>

          ${adsSorted.length>0&&h`<${Sec} id="ads" title="Ad and creative performance" pdf=${pdf} setPdf=${setPdf} lead=${adsSorted.length>=2&&t.spend>0?`The top two ads took ${Math.round((adsSorted[0].spend+adsSorted[1].spend)/t.spend*100)}% of spend${has.sales&&t.revenue>0?` and returned ${Math.round((adsSorted[0].revenue+adsSorted[1].revenue)/t.revenue*100)}% of revenue`:''}.`:''}>
            <${SecErr} msg=${errs.ads||errs.ad_info}/>
            <div class="adr-noprint" style=${{display:'flex',justifyContent:'flex-end',gap:8,marginBottom:6}}>
              ${adsSorted.length>listed.length||showAllAds?h`<button class="btn-sec" style=${{padding:'3px 9px',fontSize:12}} onClick=${()=>setShowAllAds(x=>!x)}>${showAllAds?'Show main ads only':`Show all ${adsSorted.length} ads`}</button>`:null}
              <${CsvBtn} name=${fileBase+' ads'} cols=${adCols} rows=${adsSorted}/>
            </div>
            <${Tbl} cols=${adCols} rows=${listed} rowKey=${r=>r.ad_id}/>
            ${restSum&&h`<p class="adr-lead" style=${{marginTop:10}}>${restAds.length} other ad${restAds.length===1?'':'s'} spent ${F.m0(restSum.spend)} combined${has.sales?(restSum.orders?`, with ${F.n(restSum.orders)} order${restSum.orders===1?'':'s'}`:' with no orders'):''}.</p>`}
            <${Bullets} items=${adBullets}/>
          <//>`}

          ${devRows.length>0&&h`<${Sec} id="device" title="Device performance" lead=${devLead} pdf=${pdf} setPdf=${setPdf}>
            <${SecErr} msg=${errs.device}/>
            <div class="adr-noprint" style=${{display:'flex',justifyContent:'flex-end'}}><${CsvBtn} name=${fileBase+' devices'} cols=${devCsv} rows=${devRows}/></div>
            <div class="adr-card-t">${devHead}</div>
            <div class="adr-card-s">Impressions by device, and mobile vs computer, ${curRange}${p?` · arrows = change vs ${prevFull}`:''}</div>
            <div class="adr-donut">
              <${Donut} parts=${devRows.filter(r=>r.impressions>0).map(r=>({label:devName(r),value:r.impressions,color:devColor(r)}))} centre=${F.p(topShare,1)} centreSub=${topDev?devName(topDev).toLowerCase():''}/>
              <div class="adr-dev">${devRows.map(r=>h`<${React.Fragment} key=${r.device_platform}>
                <span><span class="adr-key" style=${{background:devColor(r)}}></span>${devName(r)}</span>
                <b>${F.p(devImp?r.impressions/devImp*100:0,1)}</b>
                <span class="r">${F.n(r.impressions)} impressions</span>
                <span class="r">${F.n(r.link_clicks)} link clicks</span>
              <//>`)}</div>
            </div>
            <div class="adr-cards">${devPair}</div>
            <p class="adr-src">Meta Ads Manager · device breakdown · ${noYear(curRange)}${p?` vs ${prevRange}`:''}</p>
            ${devAfter&&h`<p class="adr-lead">${devAfter}</p>`}
          <//>`}

          ${top10.length>0&&h`<${Sec} id="state" title="State performance" lead=${stateLead} pdf=${pdf} setPdf=${setPdf}>
            <${SecErr} msg=${errs.region}/>
            <div style=${{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
              <div>
                <div class="adr-card-t">${first.region} took ${Math.round(first.impressions/allImp*100)}% of impressions and ${Math.round(first.spend/allSpend*100)}% of spend</div>
                <div class="adr-card-s">Top ${top10.length} states by impressions, ${curRange}<br/>These ${top10.length} states took ${(topImp/allImp*100).toFixed(1)}% of impressions and ${(topSpend/allSpend*100).toFixed(1)}% of spend</div>
              </div>
              <${CsvBtn} name=${fileBase+' states'} cols=${stateCsv} rows=${R.region}/>
            </div>
            <table class="adr-state"><thead><tr><th>State</th><th>Impressions</th><th>Link clicks</th><th>CTR (link)</th><th>Cost / click</th><th>Spend</th></tr></thead><tbody>
              ${top10.map((r,i)=>h`<tr key=${r.region} class=${i===0?'top':''}><td>${r.region}</td><td><div class="adr-bar"><i style=${{width:Math.max(2,(maxImp?r.impressions/maxImp:0)*200)+'px'}}></i><span>${F.n(r.impressions)}</span></div></td><td>${F.n(r.link_clicks)}</td><td>${F.p(r.ctr_link,2)}</td><td>${F.m2(r.cpc_link)}</td><td>${F.m0(r.spend)}</td></tr>`)}
            </tbody></table>
            <div class="adr-tile b adr-topstate">
              <div><div class="adr-tile-l">Top performing state</div><div class="adr-tile-v">${first.region}</div><div class="adr-tile-l">${(first.impressions/allImp*100).toFixed(1)}% of impressions, ${(first.spend/allSpend*100).toFixed(1)}% of spend</div></div>
              <dl><div><dt>Impressions</dt><dd>${F.n(first.impressions)}</dd></div><div><dt>Link clicks</dt><dd>${F.n(first.link_clicks)}</dd></div><div><dt>Spent</dt><dd>${F.m0(first.spend)}</dd></div><div><dt>CTR (link)</dt><dd>${F.p(first.ctr_link,2)}</dd></div><div><dt>CPC (link)</dt><dd>${F.m2(first.cpc_link)}</dd></div></dl>
            </div>
            <p class="adr-src">Meta Ads Manager · region breakdown · ${curRange}</p>
            <p class="adr-lead">${bestCtr&&cheapest?`Among the top ${top10.length}, ${bestCtr.region} had the best link CTR (${F.p(bestCtr.ctr_link,2)}) and ${cheapest.region} the cheapest link click (${F.m2(cheapest.cpc_link)}). `:''}Meta does not report orders by state, so this section covers delivery and clicks only.</p>
          <//>`}

          <${Sec} id="notes" title="What worked, what didn't" pdf=${pdf} setPdf=${setPdf} off=${!((notes.worked||'').trim()||(notes.didnt||'').trim())}>
            <div class="adr-noprint" style=${{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:10}}>
              <button class="btn-sec" style=${{padding:'4px 10px',fontSize:12.5}} onClick=${()=>{const d=draftNotes(F,R,prevFull,has);if(((notes.worked||'')+(notes.didnt||'')).trim()&&!confirm('Replace what you have written in "Worked" and "Didn\'t work"?'))return;setNote('worked',d.worked);setNote('didnt',d.didnt);}}>Redo the draft from the numbers</button>
              <span style=${{fontSize:12,color:'var(--t3)'}}>Drafted from the numbers: facts only. Edit it and add the reasons in your own words. Your edits stay in this browser.</span>
            </div>
            ${noteBox('worked','Worked','What went well this period')}
            ${noteBox('didnt',"Didn't work",'What held results back')}
          <//>

          <${Sec} id="recs" title=${`Recommendations for ${nextMonth}`} pdf=${pdf} setPdf=${setPdf} off=${!(notes.recs||'').trim()}>
            <div class="adr-noprint" style=${{fontSize:12,color:'var(--t3)',marginBottom:6}}>This is your advice to the client, so it is yours to write. Left empty, this section stays out of the PDF.</div>
            ${noteBox('recs','','1. Scale the winner. Keep the main ad set as the main budget line…')}
          <//>

          <${Sec} id="audience" title="Audience and placement" pdf=${pdf} setPdf=${setPdf}>
            ${[['Age',R.age,r=>r.age,errs.age,'age'],['Gender',R.gender,r=>titleCase(r.gender),errs.gender,'gender'],['Facebook and Instagram',R.platform,r=>PLATFORM[r.publisher_platform]||titleCase(r.publisher_platform),errs.platform,'platforms'],['Placement',R.placement,placementLabel,errs.placement,'placements']].map(([label,rows,fn,e,file])=>{const cols=dimCols(label,fn);return h`<div key=${label} style=${{marginBottom:14}}>
              <div style=${{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}><h3 class="adr-h3">${label}</h3><${CsvBtn} name=${fileBase+' '+file} cols=${cols} rows=${rows}/></div>
              <${SecErr} msg=${e}/>${rows.length>0&&h`<${Tbl} cols=${cols} rows=${rows}/>`}
            </div>`;})}
          <//>
        </div>`;
      }

      return h`<div class="adr">${controls}${body}</div>`;
    }

    // ── AdsApp (Ads dashboard) ──
function AdsApp({clients,currentUser,showToast,onClientUpdate}){
  const[ads,setAds]=useState([]);const[spendLog,setSpendLog]=useState({});const[loading,setLoading]=useState(true);const[fetchErr,setFetchErr]=useState(null);
  const[showAddFor,setShowAddFor]=useState(null);
  const[form,setForm]=useState({name:'',start_date:todayISO(),total_budget:'',daily_budget:'',post_link:'',status:'active',platform:'instagram'});
  const[onlyActive,setOnlyActive]=useState(false);
  const[showManage,setShowManage]=useState(false);
  // Meta ad accounts linked per brand (migration 162) + the self-sync
  const[adAccts,setAdAccts]=useState([]);const[syncing,setSyncing]=useState(null);   // null | 'all' | client id
  const[view,setView]=useState(null);   // null = report when an ad account is linked, otherwise the spend tracker
  const loadAll=useCallback(()=>Promise.all([
      db('ads','&order=start_date.desc'),
      db('ad_spend_entries','&order=date.asc').catch(e=>{console.warn('[ads] spend entries fetch failed (table missing?)',e);return[];})
    ]).then(([adRows,entries])=>{
      setAds(adRows);setFetchErr(null);
      const log={};entries.forEach(e=>{if(!log[e.ad_id])log[e.ad_id]={};log[e.ad_id][e.date]=e;});
      setSpendLog(log);
    }).catch(e=>{console.warn('[ads] fetch failed',e);setFetchErr(e.message||'Could not load ads');}).finally(()=>setLoading(false)),[]);
  const loadAccts=useCallback(()=>rpcCall('ad_accounts_list',{}).then(r=>{const l=Array.isArray(r)?r:[];setAdAccts(l);return l;}).catch(()=>{setAdAccts([]);return[];}),[]);
  // force=false: the function only touches accounts last synced over 3 hours ago
  const syncMeta=useCallback(async(clientId,force)=>{
    setSyncing(clientId||'all');
    try{
      const r=await fetch(`${SB_URL}/functions/v1/meta-ads-sync`,{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${SB_KEY}`,apikey:SB_KEY},body:JSON.stringify({session_token:sessTok(),client_id:clientId||null,force:!!force})}).then(x=>x.json()).catch(()=>null);
      if(r&&r.ok&&(r.results||[]).length){await loadAll();}
      await loadAccts();
      if(force){const bad=((r&&r.results)||[]).find(x=>!x.ok);showToast(!r||!r.ok?'Sync failed, try again':bad?'Sync: '+(bad.error||'failed'):'Synced from Meta ✓');}
    }finally{setSyncing(null);}
  },[loadAll,loadAccts]);
  useEffect(()=>{loadAll();loadAccts().then(l=>{if(l.some(a=>a.status==='active'))syncMeta(null,false);});},[]);
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
        let amt=entry?Number(entry.amount_spent)||0:(ad.source==='meta'||(paused&&(!lastLogged||dk>lastLogged))?0:ad.daily_budget);
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
  const isTracked=(c)=>clientPlatforms(c).length>0||(adsByClient[c.id]||[]).length>0||adAccts.some(a=>a.client_id===c.id);
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
  const trackerView=h`<div>
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
          ${(()=>{const mine=adAccts.filter(a=>a.client_id===c.id);
            if(!mine.length)return h`<div style=${{fontSize:12,color:'var(--t3)',marginTop:8}}><i class="ti ti-brand-meta" style=${{fontSize:13,marginRight:4}}></i>No Meta ad account linked. To fill this in by itself: Settings → Connected accounts → pick ${c.name} → Connect, then tick the ad account in the list.</div>`;
            return h`<div style=${{display:'flex',flexDirection:'column',gap:4,marginTop:8}}>${mine.map(a=>{const days=a.token_expires_at?Math.round((new Date(a.token_expires_at).getTime()-Date.now())/86400000):null;const bad=a.status!=='active'||(days!=null&&days<0);
              return h`<div key=${a.id} style=${{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',fontSize:12,color:'var(--t2)'}}>
                <i class="ti ti-brand-meta" style=${{fontSize:14,color:'#0866FF'}}></i><b style=${{color:'var(--t1)',fontWeight:500}}>${a.name||a.ad_account_id}</b>
                <span style=${{color:bad?'var(--red)':'var(--t3)'}}>${bad?'Connection expired: reconnect in Settings → Connected accounts':'synced '+ago(a.last_synced_at)}${!bad&&days!=null&&days<=10?` · reconnect within ${days} day${days===1?'':'s'}`:''}</span>
                ${a.last_error&&!bad&&h`<span style=${{color:'var(--red)'}}>${a.last_error}</span>`}
                <button class="btn-sec" style=${{padding:'2px 8px',fontSize:11.5,marginLeft:'auto'}} disabled=${!!syncing} onClick=${()=>syncMeta(c.id,true)}>${syncing===c.id||syncing==='all'?h`<i class="ti ti-loader-2 spinner" style=${{fontSize:12}}></i> Syncing`:h`<i class="ti ti-refresh" style=${{fontSize:12}}></i> Sync now`}</button>
              </div>`;})}</div>`;})()}
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
  const shown=view||(adAccts.length?'report':'tracker');
  return h`<div>
    <div style=${{display:'flex',gap:6,marginBottom:16}}>
      ${[['report','Meta report'],['tracker','Spend tracker']].map(([k,l])=>h`<button key=${k} class=${'fb'+(shown===k?' on':'')} onClick=${()=>setView(k)}>${l}</button>`)}
    </div>
    ${shown==='report'?h`<${AdsReport} clients=${clients} accounts=${adAccts} currentUser=${currentUser} showToast=${showToast} reloadAccounts=${loadAccts}/>`:trackerView}
  </div>`;
}

    return { AdsApp };
  }
  window.AMS_ADS = { buildAds };
})();

// seo.js — SEO dashboard + per-client SEO reports + SEO approvals (Phase 3.4 split).
// Plain script: window.AMS_SEO.buildSeo(deps) -> {SEOReportsDueCard, ClientSEOTab, SEOApp}.
// All external refs injected from index.html (generic helpers, shared _seo* rank helpers,
// monthKey/STATUS_STYLE used by other features, and the Ads helpers it borrows).
(function(){
  function buildSeo(deps){
    const {React,h,useState,useEffect,useRef,useCallback,useMemo,db,dbInsert,dbPatch,dbDelete,rpcCall,_loadFail,Skel,Av,insertNotif,generateAndUploadReportPdf,safeUrl,writeHash,updateSheetRange,sendSeoReportEmail,_isoWeekParts,_isoWeekKey,_isoWeekRange,_monthKey,_monthRange,_seoPeriodLabel,_seoRankDelta,_seoRankBadge,fmtMo,monthKey,STATUS_STYLE,isoDate,adStats,rupee,AD_PLATFORMS,GST_RATE} = deps;

    // Sheets API key resolution: the org-level key (agency_settings.sheets_api_key,
    // managed in Settings) wins; the per-browser localStorage key is a legacy fallback
    // so existing setups keep working. Cached per page-load.
    let _sheetsKeyP=null;
    const getSheetsApiKey=()=>{
      if(!_sheetsKeyP)_sheetsKeyP=rpcCall('agency_settings_get')
        .then(s=>(s&&s.sheets_api_key)||localStorage.getItem('ams_sheets_api_key')||'')
        .catch(()=>localStorage.getItem('ams_sheets_api_key')||'');
      return _sheetsKeyP;
    };

    // ── region A: SEOReportsDueCard (dashboard card) ──
function SEOReportsDueCard({clients}){
  const[reports,setReports]=useState([]);
  const[loaded,setLoaded]=useState(false);
  useEffect(()=>{
    // Only need the most recent report per client to compute "due" — cap at 500.
    db('seo_reports','&order=period_start.desc&limit=500')
      .then(r=>setReports(r||[]))
      .catch(_loadFail('seo_due'))
      .finally(()=>setLoaded(true));
  },[]);
  const due=(()=>{
    const arr=Object.values(clients||{}).filter(c=>(c.seo_report_cadence==='weekly'||c.seo_report_cadence==='monthly')&&(c.status||'active')!=='inactive');
    if(!arr.length)return[];
    const now=new Date();
    const lastWeek=new Date(now);lastWeek.setDate(now.getDate()-7);
    const wp=_isoWeekParts(lastWeek);
    const lastWeekKey=`${wp.year}-W${String(wp.week).padStart(2,'0')}`;
    const lastMonth=new Date(now.getFullYear(),now.getMonth()-1,1);
    const lastMonthKey=`${lastMonth.getFullYear()}-${String(lastMonth.getMonth()+1).padStart(2,'0')}`;
    return arr.filter(c=>{
      const expected=c.seo_report_cadence==='weekly'?lastWeekKey:lastMonthKey;
      return!reports.some(r=>String(r.client_id)===String(c.id)&&r.period_key===expected);
    });
  })();
  if(!loaded||due.length===0)return null;
  const open=(c)=>writeHash({tab:'clients',clientId:c.id,clientTab:'seo'});
  return h`<div style=${{background:'linear-gradient(135deg,rgba(255,0,238,.06),rgba(255,0,238,.02))',border:'1px solid rgba(255,0,238,.18)',borderRadius:'var(--r)',padding:'14px 16px',marginBottom:16}}>
    <div style=${{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
      <i class="ti ti-trending-up" style=${{fontSize:18,color:'#ff00ee'}}></i>
      <div style=${{flex:1}}>
        <div style=${{fontSize:13.5,fontWeight:600,color:'var(--t1)'}}>SEO report${due.length===1?'':'s'} due · ${due.length}</div>
        <div style=${{fontSize:11.5,color:'var(--t2)',marginTop:1}}>Last completed period hasn't been filed yet for ${due.length===1?'this client':'these clients'}.</div>
      </div>
    </div>
    <div style=${{display:'flex',gap:6,flexWrap:'wrap'}}>
      ${due.map(c=>h`<button key=${c.id} onClick=${()=>open(c)} style=${{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 10px',background:'var(--surface)',border:'1px solid var(--bd)',borderRadius:999,fontSize:12,color:'var(--t1)',cursor:'pointer'}}>
        <span style=${{width:7,height:7,borderRadius:'50%',background:c.brand_color_primary||'#ff00ee'}}></span>
        ${c.name}
        <span style=${{fontSize:10,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--t3)'}}>${c.seo_report_cadence==='weekly'?'wk':'mo'}</span>
      </button>`)}
    </div>
  </div>`;
}

    // ── region B: SEOReportForm + ClientSEOTab (per-client SEO reports) ──
function SEOReportForm({client,keywords,lastReport,onClose,onSave,showToast}){
  const cadence=(client.seo_report_cadence||'monthly')==='weekly'?'weekly':'monthly';
  // Default to the LAST completed period (clients want to recap something
  // already finished, not the in-progress week/month).
  const initPeriod=(()=>{
    const now=new Date();
    if(cadence==='weekly'){
      const prev=new Date(now);prev.setDate(now.getDate()-7);
      const{year,week}=_isoWeekParts(prev);
      const{start,end}=_isoWeekRange(year,week);
      return{type:'weekly',key:`${year}-W${String(week).padStart(2,'0')}`,start,end};
    }
    const prev=new Date(now.getFullYear(),now.getMonth()-1,1);
    const y=prev.getFullYear(),m=prev.getMonth()+1;
    const{start,end}=_monthRange(y,m);
    return{type:'monthly',key:`${y}-${String(m).padStart(2,'0')}`,start,end};
  })();

  // Prefill previous-rank values from the last saved report's keyword_rankings.
  const lastRanksByKw=(()=>{
    const out={};const arr=lastReport?.keyword_rankings;
    if(Array.isArray(arr))arr.forEach(k=>{if(k?.keyword)out[String(k.keyword).toLowerCase()]=k.current_rank;});
    return out;
  })();
  const activeKw=(keywords||[]).filter(k=>k.is_active!==false);
  const initRankRows=activeKw.map(k=>({keyword:k.keyword,previous_rank:lastRanksByKw[k.keyword.toLowerCase()]??null,current_rank:null,notes:''}));

  const[form,setForm]=useState({
    period_type:initPeriod.type,
    period_key:initPeriod.key,
    period_start:initPeriod.start,
    period_end:initPeriod.end,
    sheet_url:client.seo_sheet_url||'',
    backlinks_total:lastReport?.backlinks_total??null,
    backlinks_delta:null,
    blogs_published:0,
    press_releases:0,
    onpage_changes:'',
    next_period_plan:'',
    agency_notes:'',
    keyword_rankings:initRankRows,
  });
  const[saving,setSaving]=useState(false);
  const[emailOnSave,setEmailOnSave]=useState(true);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  // When admin types a new backlinks_total, auto-fill the delta vs. last report.
  const bkTouched=useRef(false); // manual typing wins over the sheet autofill
  const onBacklinksTotalChange=(v)=>{
    bkTouched.current=true;setBkAuto(false);
    const n=v===''||v===null?null:parseInt(v);
    setForm(f=>{
      const prev=lastReport?.backlinks_total;
      const delta=(n!==null&&prev!==null&&prev!==undefined)?n-prev:f.backlinks_delta;
      return{...f,backlinks_total:n,backlinks_delta:delta};
    });
  };

  // Autofill backlinks_total from the client's backlink sheet (already the source of
  // truth for the SEO dashboard cards) — counts all dated rows up to period_end.
  // Stays editable: any manual keystroke (bkTouched) stops further auto-applies.
  const[bkAuto,setBkAuto]=useState(false);
  const sheetDataRef=useRef(null);
  const applySheetTotal=(data,periodEnd)=>{
    if(!data||bkTouched.current||!periodEnd)return;
    const end=new Date(periodEnd+'T23:59:59');
    let total=0;
    SEO_TABS.forEach(t=>{(data[t]||[]).forEach(r=>{
      const d=r.date instanceof Date?r.date:parseSheetDate(r.date);
      if(d&&d<=end)total++;
    });});
    if(!total)return;
    setForm(f=>{
      const prev=lastReport?.backlinks_total;
      const delta=(prev!==null&&prev!==undefined)?total-prev:f.backlinks_delta;
      return{...f,backlinks_total:total,backlinks_delta:delta};
    });
    setBkAuto(true);
  };
  useEffect(()=>{
    const sid=getSheetId(client.seo_sheet_url);
    if(!sid)return;
    let cancelled=false;
    getSheetsApiKey().then(k=>{
      if(!k||cancelled)return null;
      return fetchAllSEOData(sid,k);
    }).then(data=>{
      if(!data||cancelled)return;
      sheetDataRef.current=data;
      applySheetTotal(data,form.period_end);
    }).catch(()=>{});
    return()=>{cancelled=true;};
  },[client.seo_sheet_url]);
  // Re-apply when the admin picks a different period (sheet already fetched).
  useEffect(()=>{applySheetTotal(sheetDataRef.current,form.period_end);},[form.period_end]);

  // When admin picks a different week/month, recompute key + range.
  const onWeekChange=(weekStr)=>{
    // weekStr is "YYYY-Www" from <input type="week">
    const m=/^(\d{4})-W(\d{2})$/.exec(weekStr||'');if(!m)return;
    const year=parseInt(m[1]),week=parseInt(m[2]);
    const{start,end}=_isoWeekRange(year,week);
    setForm(f=>({...f,period_key:weekStr,period_start:start,period_end:end}));
  };
  const onMonthChange=(monthStr)=>{
    const m=/^(\d{4})-(\d{2})$/.exec(monthStr||'');if(!m)return;
    const year=parseInt(m[1]),month=parseInt(m[2]);
    const{start,end}=_monthRange(year,month);
    setForm(f=>({...f,period_key:monthStr,period_start:start,period_end:end}));
  };
  const onTypeChange=(t)=>{
    const now=new Date();
    if(t==='weekly'){
      const prev=new Date(now);prev.setDate(now.getDate()-7);
      const{year,week}=_isoWeekParts(prev);
      const{start,end}=_isoWeekRange(year,week);
      setForm(f=>({...f,period_type:'weekly',period_key:`${year}-W${String(week).padStart(2,'0')}`,period_start:start,period_end:end}));
    }else{
      const prev=new Date(now.getFullYear(),now.getMonth()-1,1);
      const y=prev.getFullYear(),m=prev.getMonth()+1;
      const{start,end}=_monthRange(y,m);
      setForm(f=>({...f,period_type:'monthly',period_key:`${y}-${String(m).padStart(2,'0')}`,period_start:start,period_end:end}));
    }
  };

  // Keyword grid row mutations
  const setKw=(i,patch)=>setForm(f=>({...f,keyword_rankings:f.keyword_rankings.map((k,j)=>j===i?{...k,...patch}:k)}));
  const removeKw=(i)=>setForm(f=>({...f,keyword_rankings:f.keyword_rankings.filter((_,j)=>j!==i)}));
  const addAdHocKw=()=>setForm(f=>({...f,keyword_rankings:[...f.keyword_rankings,{keyword:'',previous_rank:null,current_rank:null,notes:'',ad_hoc:true}]}));

  const submit=async()=>{
    if(!form.period_key){showToast('Pick a period first');return;}
    setSaving(true);
    try{
      // Clean up the keyword grid before save — drop blank rows, normalize types.
      const krs=form.keyword_rankings
        .map(k=>({
          keyword:String(k.keyword||'').trim(),
          previous_rank:k.previous_rank===''||k.previous_rank===null||k.previous_rank===undefined?null:parseInt(k.previous_rank),
          current_rank:k.current_rank===''||k.current_rank===null||k.current_rank===undefined?null:parseInt(k.current_rank),
          notes:String(k.notes||'').trim()||null,
        }))
        .filter(k=>k.keyword);
      const payload={
        client_id:client.id,
        period_type:form.period_type,
        period_key:form.period_key,
        period_start:form.period_start,
        period_end:form.period_end,
        sheet_url:form.sheet_url?.trim()||null,
        backlinks_total:form.backlinks_total===''||form.backlinks_total===null?null:parseInt(form.backlinks_total),
        backlinks_delta:form.backlinks_delta===''||form.backlinks_delta===null?null:parseInt(form.backlinks_delta),
        blogs_published:parseInt(form.blogs_published)||0,
        press_releases:parseInt(form.press_releases)||0,
        onpage_changes:form.onpage_changes?.trim()||null,
        next_period_plan:form.next_period_plan?.trim()||null,
        agency_notes:form.agency_notes?.trim()||null,
        keyword_rankings:krs,
      };
      const rows=await dbInsert('seo_reports',[payload]);
      const saved=rows[0];
      onSave(saved);
      // Generate + upload branded AMS PDF before the email fires, so
      // send-seo-report can include the Download CTA. Best-effort.
      let pdfOk=false;
      if(saved?.id){
        const pdf=await generateAndUploadReportPdf('seo',saved,client);
        pdfOk=!!pdf.url;
      }
      if(emailOnSave&&saved?.id){
        const out=await sendSeoReportEmail(saved.id);
        if(out.ok)showToast(`SEO report saved${pdfOk?' (PDF generated)':''} & emailed to ${out.to||client.name} ✓`);
        else if(out.error==='no email on file for this client')showToast(`Saved ✓ — no contact email on file, email skipped`);
        else showToast(`Saved ✓ — email failed (${out.error||'unknown'})`);
      }else{
        showToast(`SEO report saved${pdfOk?' (PDF generated)':''} ✓`);
      }
      onClose();
    }catch(e){
      console.error('[seo-report] save failed',e);
      const msg=String(e?.message||e);
      if(msg.includes('uniq_seo_reports_period')||msg.includes('duplicate key'))showToast('A report already exists for that period — delete the old one or pick a different period');
      else showToast('Save failed: '+msg);
    }finally{setSaving(false);}
  };

  const numFi=(label,key,placeholder)=>h`<div class="fi-group"><div class="fi-lbl">${label}</div><input class="fi" type="number" min="0" placeholder=${placeholder} value=${form[key]===null||form[key]===undefined?'':form[key]} onInput=${e=>set(key,e.target.value===''?null:parseInt(e.target.value))}/></div>`;

  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose()}}>
    <div class="modal-box" style=${{maxWidth:'720px'}}>
      <div class="modal-head"><div><div style=${{fontSize:16,fontWeight:600}}>New SEO report</div><div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>${client.name} · ${form.period_type==='weekly'?'Weekly':'Monthly'} recap</div></div><button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button></div>
      <div class="modal-body">
        <div class="fi-grid fi-group">
          <div><div class="fi-lbl">Cadence</div>
            <select class="fi fi-select" value=${form.period_type} onChange=${e=>onTypeChange(e.target.value)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div><div class="fi-lbl">Period</div>
            ${form.period_type==='weekly'
              ?h`<input class="fi" type="week" value=${form.period_key} onChange=${e=>onWeekChange(e.target.value)}/>`
              :h`<input class="fi" type="month" value=${form.period_key} onChange=${e=>onMonthChange(e.target.value)}/>`}
            <div style=${{fontSize:11,color:'var(--t3)',marginTop:4}}>${_seoPeriodLabel(form)}</div>
          </div>
        </div>

        <div style=${{fontSize:14,fontWeight:500,color:'var(--t1)',marginBottom:12}}>Pillars <span style=${{fontSize:12,color:'var(--t3)',fontWeight:400}}>(the four KPIs that hit the client's email)</span></div>
        <div class="fi-grid">
          <div class="fi-group"><div class="fi-lbl">Backlinks — total to date</div><input class="fi" type="number" min="0" placeholder=${lastReport?.backlinks_total?`last: ${lastReport.backlinks_total}`:'e.g. 2489'} value=${form.backlinks_total===null||form.backlinks_total===undefined?'':form.backlinks_total} onInput=${e=>onBacklinksTotalChange(e.target.value)}/>
            ${bkAuto&&h`<div style=${{fontSize:11,color:'#15803D',marginTop:4,display:'flex',alignItems:'center',gap:4}}><i class="ti ti-sparkles" style=${{fontSize:11}}></i>Auto-filled from the backlink sheet — edit if needed</div>`}
          </div>
          <div class="fi-group"><div class="fi-lbl">Backlinks Δ this period</div><input class="fi" type="number" placeholder="auto-computed from total" value=${form.backlinks_delta===null||form.backlinks_delta===undefined?'':form.backlinks_delta} onInput=${e=>{bkTouched.current=true;set('backlinks_delta',e.target.value===''?null:parseInt(e.target.value));}}/></div>
        </div>
        <div class="fi-grid">
          ${numFi('Blogs published','blogs_published','e.g. 4')}
          ${numFi('Press releases','press_releases','e.g. 2')}
        </div>

        <div class="fi-group"><div class="fi-lbl">On-page changes <span style=${{color:'var(--t3)',fontWeight:400}}>(one per line — rendered as bullets in the email)</span></div>
          <textarea class="fi" rows="4" placeholder=${"Updated H1s + meta descriptions on 4 category pages\nAdded internal links from blog to product pages\nCompressed hero images on home + collection pages"} value=${form.onpage_changes} onInput=${e=>set('onpage_changes',e.target.value)}></textarea>
        </div>

        <div style=${{fontSize:14,fontWeight:500,color:'var(--t1)',margin:'8px 0 10px'}}>
          Keyword rankings
          <span style=${{fontSize:12,color:'var(--t3)',fontWeight:400}}> · auto-loaded from this client's targeted-keywords list. Leave a current rank blank to mark "100+".</span>
        </div>
        ${form.keyword_rankings.length===0?h`<div class="empty" style=${{padding:'18px 14px',marginBottom:14}}><i class="ti ti-search-off"></i><div class="empty-t">No keywords yet</div><div class="empty-s">Add some in the Targeted keywords section, or use "+ Add keyword" below.</div></div>`
        :h`<div style=${{border:'1px solid var(--bd)',borderRadius:'var(--r)',overflow:'hidden',marginBottom:10}}>
          <div style=${{display:'grid',gridTemplateColumns:'1fr 90px 90px 60px 28px',gap:8,padding:'8px 12px',background:'var(--bg)',fontSize:11,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',fontWeight:600}}>
            <div>Keyword</div><div style=${{textAlign:'right'}}>Previous</div><div style=${{textAlign:'right'}}>Current</div><div style=${{textAlign:'center'}}>Δ</div><div></div>
          </div>
          ${form.keyword_rankings.map((k,i)=>h`<div key=${i} style=${{display:'grid',gridTemplateColumns:'1fr 90px 90px 60px 28px',gap:8,padding:'7px 12px',alignItems:'center',borderTop:'1px solid var(--bd)'}}>
            ${k.ad_hoc?h`<input class="fi" type="text" placeholder="keyword..." value=${k.keyword} style=${{fontSize:13,padding:'4px 8px'}} onInput=${e=>setKw(i,{keyword:e.target.value})}/>`:h`<div style=${{fontSize:13,color:'var(--t1)'}}>${k.keyword}</div>`}
            <input class="fi" type="number" min="1" placeholder="—" value=${k.previous_rank===null||k.previous_rank===undefined?'':k.previous_rank} style=${{fontSize:13,padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}} onInput=${e=>setKw(i,{previous_rank:e.target.value===''?null:parseInt(e.target.value)})}/>
            <input class="fi" type="number" min="1" placeholder="—" value=${k.current_rank===null||k.current_rank===undefined?'':k.current_rank} style=${{fontSize:13,padding:'4px 8px',textAlign:'right',fontFamily:'monospace',fontWeight:500}} onInput=${e=>setKw(i,{current_rank:e.target.value===''?null:parseInt(e.target.value)})}/>
            <div style=${{textAlign:'center'}}>${_seoRankBadge(k.previous_rank,k.current_rank)}</div>
            <button class="icon-btn" onClick=${()=>removeKw(i)} title="Remove from this report" style=${{padding:3}}><i class="ti ti-x" style=${{fontSize:14,color:'var(--t3)'}}></i></button>
          </div>`)}
        </div>`}
        <button class="btn-sec" onClick=${addAdHocKw} style=${{padding:'6px 12px',fontSize:12,marginBottom:16}}><i class="ti ti-plus" style=${{fontSize:13}}></i>Add keyword (this report only)</button>

        <div class="fi-group"><div class="fi-lbl">Plan for next ${form.period_type==='weekly'?'week':'month'} <span style=${{color:'var(--t3)',fontWeight:400}}>(one per line)</span></div>
          <textarea class="fi" rows="3" placeholder=${"Pitch 3 lifestyle blogs for guest posts\nOptimise checkout funnel meta tags\nContinue weekly publishing — 2 blogs, 1 PR"} value=${form.next_period_plan} onInput=${e=>set('next_period_plan',e.target.value)}></textarea>
        </div>

        <div class="fi-group"><div class="fi-lbl">Agency notes <span style=${{color:'var(--t3)',fontWeight:400}}>(your commentary — what stood out, what to double down on)</span></div>
          <textarea class="fi" rows="3" placeholder="Big momentum on the long-tail set this month — recommend doubling down with 2 dedicated blogs..." value=${form.agency_notes} onInput=${e=>set('agency_notes',e.target.value)}></textarea>
        </div>

        <div class="fi-group"><div class="fi-lbl">Backlinks sheet URL <span style=${{color:'var(--t3)',fontWeight:400}}>(optional — link button in email)</span></div>
          <input class="fi" type="url" placeholder="https://docs.google.com/spreadsheets/..." value=${form.sheet_url} onInput=${e=>set('sheet_url',e.target.value)}/>
        </div>
      </div>
      <div class="modal-foot" style=${{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <label style=${{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--t2)',cursor:'pointer',marginRight:'auto'}}>
          <input type="checkbox" checked=${emailOnSave} onChange=${e=>setEmailOnSave(e.target.checked)} style=${{accentColor:'#ff00ee',cursor:'pointer'}}/>
          <span><i class="ti ti-mail" style=${{fontSize:14,verticalAlign:'-2px',marginRight:4,color:'#ff00ee'}}></i>Email this report to ${client.name} on save</span>
        </label>
        <button class="btn-sec" onClick=${onClose}>Cancel</button>
        <button class="btn-pri" onClick=${submit} disabled=${saving}>${saving?h`<i class="ti ti-loader-2 spinner"></i> Saving${emailOnSave?' & sending':''}...`:emailOnSave?'Save & email report':'Save report'}</button>
      </div>
    </div>
  </div>`;
}

// Tiny inline rank-over-time sparkline. series = chronological current_rank values
// (null = not ranked / 100+). Lower rank is better, so rank 1 plots at the top.
function KeywordSparkline({series}){
  const pts=series.map((v,i)=>({i,v})).filter(p=>p.v!==null&&p.v!==undefined);
  if(pts.length<2)return h`<span style=${{fontSize:11,color:'var(--t3)',width:110,textAlign:'center'}}>not enough data</span>`;
  const W=110,H=24,P=3;
  const vals=pts.map(p=>p.v);
  const min=Math.min(...vals),max=Math.max(...vals);
  const x=(i)=>series.length>1?P+i*(W-2*P)/(series.length-1):W/2;
  const y=(v)=>max===min?H/2:P+((v-min)/(max-min))*(H-2*P);
  const path=pts.map((p,j)=>`${j===0?'M':'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last=pts[pts.length-1];
  return h`<svg width=${W} height=${H} viewBox=${`0 0 ${W} ${H}`} style=${{flexShrink:0,display:'block'}}>
    <path d=${path} fill="none" stroke="#ff00ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"/>
    <circle cx=${x(last.i).toFixed(1)} cy=${y(last.v).toFixed(1)} r="2.5" fill="#ff00ee"/>
  </svg>`;
}

function ClientSEOTab({c,onUpdate,showToast}){
  const[keywords,setKeywords]=useState([]);
  const[reports,setReports]=useState([]);
  const[loading,setLoading]=useState(true);
  const[showForm,setShowForm]=useState(false);
  const[resendingId,setResendingId]=useState(null);
  const[pdfBusyId,setPdfBusyId]=useState(null);
  const[newKw,setNewKw]=useState('');
  const cadence=c.seo_report_cadence||'none';

  const pdfReport=async(report,forceRegen=false)=>{
    if(pdfBusyId)return;
    if(report.pdf_url&&!forceRegen){window.open(report.pdf_url,'_blank','noopener');return;}
    setPdfBusyId(report.id);
    try{
      const out=await generateAndUploadReportPdf('seo',report,c);
      if(out.url){setReports(rs=>rs.map(r=>r.id===report.id?{...r,pdf_url:out.url,pdf_generated_at:new Date().toISOString()}:r));window.open(out.url,'_blank','noopener');showToast('PDF ready ✓');}
      else showToast('PDF failed: '+(out.error||'unknown'));
    }finally{setPdfBusyId(null);}
  };

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      db('client_keywords',`&client_id=eq.${c.id}&order=is_active.desc,sort_order.asc,created_at.asc`),
      db('seo_reports',`&client_id=eq.${c.id}&order=period_start.desc`),
    ]).then(([kw,rp])=>{setKeywords(kw||[]);setReports(rp||[]);})
      .catch(_loadFail('seo_data'))
      .finally(()=>setLoading(false));
  },[c.id]);

  const setCadence=async(v)=>{
    try{await rpcCall('client_update_seo',{p_client_id:c.id,p_patch:{seo_report_cadence:v}});onUpdate({...c,seo_report_cadence:v});showToast(v==='none'?'Cadence cleared':`Cadence set to ${v}`);}
    catch(e){showToast('Save failed');}
  };

  const addKeyword=async()=>{
    const kw=newKw.trim();if(!kw)return;
    try{
      const rows=await dbInsert('client_keywords',[{client_id:c.id,keyword:kw,is_active:true,sort_order:keywords.length}]);
      setKeywords(ks=>[...ks,rows[0]]);
      setNewKw('');
    }catch(e){
      const msg=String(e?.message||e);
      if(msg.includes('uniq_client_keywords_lower'))showToast('That keyword is already in the list');
      else showToast('Add failed: '+msg);
    }
  };
  const toggleKeyword=async(k)=>{
    const v=!k.is_active;
    try{await dbPatch('client_keywords',k.id,{is_active:v});setKeywords(ks=>ks.map(x=>x.id===k.id?{...x,is_active:v}:x));}
    catch(e){showToast('Save failed');}
  };
  const deleteKeyword=async(k)=>{
    if(!confirm(`Remove "${k.keyword}" from the targeted keywords list?\n\nPast reports keep their snapshot of this keyword's rankings.`))return;
    try{await dbDelete('client_keywords',k.id);setKeywords(ks=>ks.filter(x=>x.id!==k.id));}
    catch(e){showToast('Delete failed');}
  };

  const deleteReport=async(id)=>{
    if(!confirm('Delete this SEO report?'))return;
    await dbDelete('seo_reports',id);
    setReports(rs=>rs.filter(r=>r.id!==id));
    showToast('Deleted');
  };
  const resendReport=async(r)=>{
    if(resendingId)return;
    if(!confirm(`Re-send the ${_seoPeriodLabel(r)} SEO report to ${c.name}?`))return;
    setResendingId(r.id);
    try{
      const out=await sendSeoReportEmail(r.id);
      if(out.ok)showToast(`SEO report email re-sent to ${out.to||c.name} ✓`);
      else if(out.error==='no email on file for this client')showToast(`No contact email on file for ${c.name} — add one first`);
      else showToast(`Email failed: ${out.error||'unknown'}`);
    }finally{setResendingId(null);}
  };

  const lastReport=reports[0]||null;
  const activeKwCount=keywords.filter(k=>k.is_active).length;

  // Keyword rank trends across the client's recent reports — every seo_reports row
  // already snapshots keyword_rankings, so this is a pure re-read of fetched data.
  // Chronological (oldest → newest), capped at the last 8 filed periods.
  const trendReports=useMemo(()=>[...reports].reverse().filter(r=>Array.isArray(r.keyword_rankings)&&r.keyword_rankings.length>0).slice(-8),[reports]);
  const trendRows=useMemo(()=>{
    if(trendReports.length<2)return[];
    const order=[];const label={};
    const push=(kw)=>{const lk=String(kw||'').trim().toLowerCase();if(lk&&!label[lk]){label[lk]=String(kw).trim();order.push(lk);}};
    keywords.filter(k=>k.is_active!==false).forEach(k=>push(k.keyword));
    trendReports.forEach(r=>r.keyword_rankings.forEach(k=>push(k?.keyword)));
    return order.map(lk=>{
      const series=trendReports.map(r=>{
        const hit=(r.keyword_rankings||[]).find(k=>String(k?.keyword||'').trim().toLowerCase()===lk);
        return hit&&hit.current_rank!==null&&hit.current_rank!==undefined?hit.current_rank:null;
      });
      return{keyword:label[lk],series,latest:series[series.length-1],prev:series[series.length-2]};
    }).filter(row=>row.series.some(v=>v!==null));
  },[trendReports,keywords]);

  return h`<div>
    <!-- Cadence header -->
    <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:20,paddingBottom:14,borderBottom:'1px solid var(--bd)',flexWrap:'wrap'}}>
      <div>
        <div style=${{fontSize:18,fontWeight:500,color:'var(--t1)'}}>SEO recap</div>
        <div style=${{fontSize:13,color:'var(--t2)',marginTop:3}}>Track targeted keywords, file weekly or monthly reports, email them to ${c.name}.</div>
      </div>
      <div style=${{display:'flex',alignItems:'center',gap:8}}>
        <span style=${{fontSize:11,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',fontWeight:600}}>Cadence</span>
        <select class="fi fi-select" value=${cadence} onChange=${e=>setCadence(e.target.value)} style=${{width:'auto',padding:'6px 28px 6px 10px',fontSize:13}}>
          <option value="none">— Not set —</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
    </div>

    <!-- Targeted keywords -->
    <div style=${{marginBottom:28}}>
      <div style=${{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10}}>
        <div>
          <div style=${{fontSize:15,fontWeight:500,color:'var(--t1)'}}>Targeted keywords</div>
          <div style=${{fontSize:12,color:'var(--t2)',marginTop:2}}>${activeKwCount} active${keywords.length>activeKwCount?` · ${keywords.length-activeKwCount} inactive`:''}</div>
        </div>
      </div>
      ${loading?h`<${Skel} h=${80}/>`:h`<div style=${{background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:'var(--r)',padding:'10px 12px'}}>
        ${keywords.length===0&&h`<div style=${{fontSize:13,color:'var(--t3)',padding:'14px 4px'}}>No keywords yet — add the ones you're working on for ${c.name} below. They auto-load into every new SEO report.</div>`}
        ${keywords.length>0&&h`<div style=${{display:'flex',flexDirection:'column',gap:4,marginBottom:8}}>
          ${keywords.map(k=>h`<div key=${k.id} style=${{display:'flex',alignItems:'center',gap:10,padding:'5px 6px',borderRadius:6,opacity:k.is_active?1:0.5}}>
            <button class="icon-btn" onClick=${()=>toggleKeyword(k)} title=${k.is_active?'Mark inactive':'Mark active'} style=${{padding:3}}>
              ${k.is_active?h`<i class="ti ti-circle-check-filled" style=${{fontSize:16,color:'#15803D'}}></i>`:h`<i class="ti ti-circle" style=${{fontSize:16,color:'var(--t3)'}}></i>`}
            </button>
            <div style=${{flex:1,fontSize:13,color:'var(--t1)',textDecoration:k.is_active?'none':'line-through'}}>${k.keyword}</div>
            <button class="icon-btn" onClick=${()=>deleteKeyword(k)} title="Remove" style=${{padding:3}}><i class="ti ti-trash" style=${{fontSize:14,color:'var(--t3)'}}></i></button>
          </div>`)}
        </div>`}
        <div style=${{display:'flex',gap:8,alignItems:'center',paddingTop:keywords.length>0?8:0,borderTop:keywords.length>0?'1px solid var(--bd)':'none'}}>
          <input class="fi" type="text" placeholder=${'e.g. organic cotton baby wear'} value=${newKw} onInput=${e=>setNewKw(e.target.value)} onKeyDown=${e=>{if(e.key==='Enter')addKeyword();}} style=${{flex:1,fontSize:13,padding:'6px 10px'}}/>
          <button class="btn-pri" onClick=${addKeyword} disabled=${!newKw.trim()} style=${{padding:'6px 14px',fontSize:13}}><i class="ti ti-plus"></i>Add</button>
        </div>
      </div>`}
    </div>

    <!-- Keyword trends (rendered from the keyword_rankings snapshots already fetched) -->
    ${!loading&&trendRows.length>0&&h`<div style=${{marginBottom:28}}>
      <div style=${{fontSize:15,fontWeight:500,color:'var(--t1)'}}>Keyword trends</div>
      <div style=${{fontSize:12,color:'var(--t2)',margin:'2px 0 10px'}}>Rank movement across the last ${trendReports.length} reports · lower is better</div>
      <div style=${{background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:'var(--r)',padding:'8px 12px'}}>
        <div style=${{display:'flex',alignItems:'center',gap:10,padding:'4px 6px',fontSize:10,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--t3)',fontWeight:600}}>
          <div style=${{flex:1}}>Keyword</div>
          <div style=${{width:110,textAlign:'center'}}>Trend</div>
          <div style=${{width:54,textAlign:'right'}}>Now</div>
          <div style=${{width:52,textAlign:'center'}}>Δ</div>
        </div>
        ${trendRows.map(row=>h`<div key=${row.keyword} style=${{display:'flex',alignItems:'center',gap:10,padding:'5px 6px',borderTop:'1px solid var(--bd)'}}>
          <div style=${{flex:1,fontSize:13,color:'var(--t1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${row.keyword}</div>
          <${KeywordSparkline} series=${row.series}/>
          <div style=${{width:54,textAlign:'right',fontSize:12.5,fontFamily:'monospace',fontWeight:600,color:row.latest!==null?'var(--t1)':'var(--t3)'}}>${row.latest!==null?'#'+row.latest:'100+'}</div>
          <div style=${{width:52,textAlign:'center'}}>${_seoRankBadge(row.prev,row.latest)}</div>
        </div>`)}
      </div>
    </div>`}

    <!-- Reports list -->
    <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
      <div>
        <div style=${{fontSize:15,fontWeight:500,color:'var(--t1)'}}>Reports</div>
        <div style=${{fontSize:12,color:'var(--t2)',marginTop:2}}>${reports.length} filed${cadence==='none'?' · set a cadence above to surface "due" reminders':''}</div>
      </div>
      <button class="btn-pri" onClick=${()=>setShowForm(true)}><i class="ti ti-plus"></i>New SEO report</button>
    </div>
    ${loading?h`<div style=${{display:'flex',flexDirection:'column',gap:10}}>${[...Array(2)].map((_,i)=>h`<${Skel} key=${i} h=${72}/>`)}</div>`
    :reports.length===0?h`<div class="empty"><i class="ti ti-file-analytics"></i><div class="empty-t">No SEO reports yet for ${c.name}</div><div class="empty-s">Click "New SEO report" to file the first one</div></div>`
    :h`<div>${reports.map(r=>{
      const krs=Array.isArray(r.keyword_rankings)?r.keyword_rankings:[];
      const improved=krs.filter(k=>_seoRankDelta(k.previous_rank,k.current_rank).dir==='up').length;
      return h`<div key=${r.id} class="report-card">
        <div style=${{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
          <div style=${{flex:1,minWidth:0}}>
            <div class="report-month" style=${{display:'flex',alignItems:'center',gap:8}}>
              ${_seoPeriodLabel(r)}
              <span style=${{fontSize:10,textTransform:'uppercase',letterSpacing:'.06em',padding:'2px 8px',borderRadius:4,background:r.period_type==='weekly'?'#ddd6fe':'#fde68a',color:r.period_type==='weekly'?'#5b21b6':'#92400e',fontWeight:600}}>${r.period_type}</span>
            </div>
            <div class="report-stats">
              <span><strong>${r.backlinks_delta>0?'+':''}${r.backlinks_delta||0}</strong> backlinks</span>
              <span><strong>${r.blogs_published||0}</strong> blog${r.blogs_published===1?'':'s'}</span>
              <span><strong>${r.press_releases||0}</strong> PR${r.press_releases===1?'':'s'}</span>
              ${krs.length>0&&h`<span><strong>${improved}/${krs.length}</strong> keywords ↑</span>`}
            </div>
          </div>
          <div style=${{display:'flex',gap:8,alignItems:'center'}}>
            <button class="icon-btn" onClick=${()=>resendReport(r)} disabled=${resendingId===r.id} title="Email this report to ${c.name}" style=${{padding:6}}>${resendingId===r.id?h`<i class="ti ti-loader-2 spinner" style=${{fontSize:15,color:'var(--t3)'}}></i>`:h`<i class="ti ti-mail-forward" style=${{color:'#ff00ee',fontSize:16}}></i>`}</button>
            <button class="btn-pri" onClick=${()=>pdfReport(r)} disabled=${pdfBusyId===r.id} title=${r.pdf_url?'Open the generated PDF':'Generate the branded AMS PDF'} style=${{padding:'7px 14px',fontSize:13}}>${pdfBusyId===r.id?h`<i class="ti ti-loader-2 spinner"></i>`:h`<i class=${r.pdf_url?'ti ti-file-download':'ti ti-file-export'}></i>`}PDF</button>
            ${r.pdf_url&&h`<button class="icon-btn" onClick=${()=>pdfReport(r,true)} disabled=${pdfBusyId===r.id} title="Regenerate PDF" style=${{padding:6}}><i class="ti ti-refresh" style=${{fontSize:14,color:'var(--t3)'}}></i></button>`}
            <button class="icon-btn" onClick=${()=>deleteReport(r.id)}><i class="ti ti-trash"></i></button>
          </div>
        </div>
      </div>`;
    })}</div>`}
    ${showForm&&h`<${SEOReportForm} client=${c} keywords=${keywords} lastReport=${lastReport} onClose=${()=>setShowForm(false)} onSave=${r=>setReports(rs=>[r,...rs])} showToast=${showToast}/>`}
  </div>`;
}

    // ── region C: SEO dashboard + approvals (monthKey & STATUS_STYLE stay in index.html, injected) ──
const SEO_TABS=['Social Bookmarking','Profile Creation','Articles','Classifieds'];
const SEO_COLORS={'Social Bookmarking':'#3B82F6','Profile Creation':'#10B981','Articles':'#F59E0B','Classifieds':'#8B5CF6'};
const SEO_ICONS={'Social Bookmarking':'ti-bookmark','Profile Creation':'ti-user-check','Articles':'ti-file-text','Classifieds':'ti-ad-2'};
const SEO_DEFAULT_SPLIT={'Social Bookmarking':35,'Profile Creation':30,'Articles':20,'Classifieds':15};

const getSheetId=url=>{const m=(url||'').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);return m?m[1]:null;};
const parseSheetDate=s=>{if(!s||!s.includes('/'))return null;const[d,mo,y]=s.split('/');return new Date(`${y}-${(mo||'').padStart(2,'0')}-${(d||'').padStart(2,'0')}`);};
const fmtMonth=mk=>{if(!mk)return'';const[y,m]=mk.split('-');return new Date(+y,+m-1,1).toLocaleString('default',{month:'long',year:'numeric'});};

async function fetchSheetTab(sheetId,tabName,apiKey){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(tabName+'!A:K')}?key=${apiKey}`;
  const res=await fetch(url);
  if(!res.ok){const e=await res.json();throw new Error(e.error?.message||'Sheet API error '+res.status);}
  const data=await res.json();
  // Keep real sheet row index (1-based; header is row 1, first data row is 2)
  return(data.values||[]).map((r,i)=>({row:r,sheetRow:i+1})).slice(1).filter(x=>x.row&&x.row[0]);
}

const SEO_COL={STATUS:'H',REVIEWER:'I',NOTES:'J'};
const isDocUrl=(u)=>!!u&&/docs\.google\.com\/(document|presentation|spreadsheets)/i.test(u);

async function fetchAllSEOData(sheetId,apiKey){
  // Per-tab failures are collected on results.__errors (tab → message) instead of
  // being swallowed as silent empty arrays — callers surface them as warning chips.
  const results={};const errors={};
  for(const tab of SEO_TABS){
    // lastDate carry-forward is per-tab: undated leading rows in one tab must not
    // inherit the trailing date of the previous tab (mis-buckets them into the wrong month).
    let lastDate=null;
    try{
      const rows=await fetchSheetTab(sheetId,tab,apiKey);
      results[tab]=rows.map(({row:r,sheetRow})=>{
        const date=r[0]&&r[0].includes('/')?parseSheetDate(r[0]):(lastDate||null);
        if(date)lastDate=date;
        return{date,website:r[1],da:parseInt(r[2])||0,pa:parseInt(r[3])||0,ss:r[4],keyword:r[5],url:r[6],
          status:(r[7]||'').trim(),reviewer:r[8]||'',notes:r[9]||'',assignee:r[10]||'',
          sheetRow,tab};
      });
    }catch(e){results[tab]=[];errors[tab]=e?.message||'fetch failed';}
  }
  if(Object.keys(errors).length)results.__errors=errors;
  return results;
}

function countByMonth(tabRows,mk){
  return tabRows.filter(r=>{
    if(!r.date)return false;
    const d=r.date instanceof Date?r.date:parseSheetDate(r.date);
    return d&&monthKey(d)===mk;
  }).length;
}

function SEOApiKeyPrompt({onSave}){
  const[k,setK]=useState('');
  return h`<div style=${{padding:32,textAlign:'center',maxWidth:500,margin:'0 auto'}}>
    <i class="ti ti-key" style=${{fontSize:40,color:'var(--t3)',marginBottom:12,display:'block'}}></i>
    <div style=${{fontSize:18,fontWeight:500,color:'var(--t1)',marginBottom:8}}>Connect Google Sheets</div>
    <div style=${{fontSize:14,color:'var(--t2)',marginBottom:24,lineHeight:1.6}}>
      To pull backlink data automatically, add a Google Sheets API key.<br/>
      <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style=${{color:'var(--blue)'}}>Get API key from Google Cloud Console</a> → enable Sheets API → restrict to Sheets API only.
    </div>
    <input class="fi" type="text" placeholder="AIzaSy..." value=${k} onInput=${e=>setK(e.target.value)} style=${{marginBottom:12,textAlign:'left'}}/>
    <button class="btn-pri" style=${{width:'100%',justifyContent:'center'}} onClick=${()=>k.trim()&&onSave(k.trim())} disabled=${!k.trim()}>
      <i class="ti ti-plug"></i> Save API key & connect
    </button>
    <div style=${{fontSize:12,color:'var(--t3)',marginTop:12}}>Also ensure each sheet is set to "Anyone with link can view"</div>
  </div>`;
}

function SEOMilestoneBar({done,total,tab}){
  const pct=total>0?Math.min(100,Math.round(done/total*100)):0;
  const color=SEO_COLORS[tab]||'var(--blue)';
  return h`<div style=${{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
    <i class=${'ti '+SEO_ICONS[tab]} style=${{fontSize:12,color,width:14,textAlign:'center',flexShrink:0}}></i>
    <div style=${{fontSize:12,color:'var(--t2)',width:120,flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${tab}</div>
    <div style=${{flex:1,height:5,background:'var(--bd)',borderRadius:3,overflow:'hidden',minWidth:30}}>
      <div style=${{height:'100%',width:pct+'%',background:color,borderRadius:3,transition:'width .4s'}}></div>
    </div>
    <div style=${{fontSize:12,color:'var(--t3)',width:64,textAlign:'right',flexShrink:0,whiteSpace:'nowrap'}}>${done}/${total||'—'}</div>
  </div>`;
}

function SEOClientSettingsModal({client,onSave,onClose}){
  const[sheetUrl,setSheetUrl]=useState(client.seo_sheet_url||'');
  const[target,setTarget]=useState(String(client.seo_monthly_target||''));
  const[saving,setSaving]=useState(false);
  const save=async()=>{
    setSaving(true);
    try{
      await rpcCall('client_update_seo',{p_client_id:client.id,p_patch:{seo_sheet_url:sheetUrl.trim()||null,seo_monthly_target:parseInt(target)||0}});
      onSave(sheetUrl.trim()||null,parseInt(target)||0);
    }catch(e){}finally{setSaving(false);}
  };
  return h`<div class="modal-overlay" onClick=${e=>e.target===e.currentTarget&&onClose()}>
    <div class="modal-box" style=${{maxWidth:460}}>
      <div class="modal-head"><div class="modal-title"><i class="ti ti-settings"></i> SEO Settings — ${client.name}</div><button class="close-btn" onClick=${onClose}>✕</button></div>
      <div style=${{padding:20}}>
        <div class="fi-group"><div class="fi-lbl">Google Sheet URL</div>
          <input class="fi" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value=${sheetUrl} onInput=${e=>setSheetUrl(e.target.value)}/>
          <div style=${{fontSize:12,color:'var(--t3)',marginTop:4}}>Sheet must be "Anyone with link can view" in Google Drive</div>
        </div>
        <div class="fi-group"><div class="fi-lbl">Monthly backlink target (e.g. 600)</div>
          <input class="fi" type="number" min="0" placeholder="e.g. 600" value=${target} onInput=${e=>setTarget(e.target.value)}/>
        </div>
        <div style=${{display:'flex',gap:8}}>
          <button class="btn-pri" style=${{flex:1,justifyContent:'center'}} onClick=${save} disabled=${saving}>${saving?'Saving…':'Save settings'}</button>
          <button class="btn-sec" onClick=${onClose}>Cancel</button>
        </div>
      </div>
    </div>
  </div>`;
}

function SEOAddClientModal({allClients,seoClientIds,onAdd,onClose}){
  const[search,setSearch]=useState('');
  const available=allClients.filter(c=>!seoClientIds.includes(c.id));
  const shown=search?available.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())):available;
  return h`<div class="modal-overlay" onClick=${e=>e.target===e.currentTarget&&onClose()}>
    <div class="modal-box" style=${{maxWidth:400}}>
      <div class="modal-head"><div class="modal-title"><i class="ti ti-plus"></i> Add SEO client</div><button class="close-btn" onClick=${onClose}>✕</button></div>
      <div style=${{padding:16}}>
        <div style=${{fontSize:13,color:'var(--t2)',marginBottom:12}}>Pick a client. You'll set their sheet URL and monthly target next.</div>
        <input class="fi" placeholder="Search clients…" value=${search} onInput=${e=>setSearch(e.target.value)} style=${{marginBottom:10}}/>
        <div style=${{maxHeight:260,overflowY:'auto',display:'flex',flexDirection:'column',gap:4}}>
          ${shown.length===0?h`<div style=${{fontSize:13,color:'var(--t3)',padding:12,textAlign:'center'}}>No clients found</div>`
          :shown.map(c=>h`<div key=${c.id} onClick=${()=>onAdd(c)} style=${{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,cursor:'pointer',border:'1px solid var(--bd)',background:'var(--bg)',transition:'background .15s'}}
            onMouseEnter=${e=>e.currentTarget.style.background='var(--bg2)'} onMouseLeave=${e=>e.currentTarget.style.background='var(--bg)'}>
            <${Av} i=${c.initials||c.name.slice(0,2)} c=${c.color||'#FF00EE'} s=${32}/>
            <div style=${{minWidth:0}}><div style=${{fontSize:14,fontWeight:500,color:'var(--t1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${c.name}</div><div style=${{fontSize:12,color:'var(--t3)'}}>${c.industry||'No industry set'}</div></div>
            <i class="ti ti-chevron-right" style=${{fontSize:13,color:'var(--t3)',flexShrink:0,marginLeft:'auto'}}></i>
          </div>`)}
        </div>
      </div>
    </div>
  </div>`;
}

function SEOClientCard({client,month,apiKey,onViewDetails,onEditTargets,onSettings,onRemove}){
  const[data,setData]=useState(null);const[loading,setLoading]=useState(false);const[err,setErr]=useState('');
  const cfg=client.seo_config||{};
  const monthCfg=cfg[month]||{};
  const totalTarget=monthCfg.total||client.seo_monthly_target||0;
  const tabTargets=SEO_TABS.reduce((acc,t)=>{acc[t]=monthCfg[t]||Math.round(totalTarget*(SEO_DEFAULT_SPLIT[t]/100));return acc;},{});

  useEffect(()=>{
    if(!apiKey||!client.seo_sheet_url){setLoading(false);return;}
    const sid=getSheetId(client.seo_sheet_url);
    if(!sid){setErr('Invalid sheet URL');setLoading(false);return;}
    setLoading(true);setErr('');
    fetchAllSEOData(sid,apiKey).then(d=>{setData(d);setLoading(false);}).catch(e=>{setErr(e.message);setLoading(false);});
  },[client.seo_sheet_url,apiKey,month]);

  const counts=data?SEO_TABS.reduce((acc,t)=>{acc[t]=countByMonth(data[t]||[],month);return acc;},{}):{};
  const tabErrs=data&&data.__errors?Object.entries(data.__errors):[];
  const totalDone=Object.values(counts).reduce((a,b)=>a+b,0);
  const pct=totalTarget>0?Math.min(100,Math.round(totalDone/totalTarget*100)):0;
  const daysInMonth=new Date(+month.split('-')[0],+month.split('-')[1],0).getDate();
  const today=new Date();const isCurrentMonth=monthKey(today)===month;
  const daysPassed=isCurrentMonth?today.getDate():daysInMonth;
  const expectedPct=Math.round(daysPassed/daysInMonth*100);
  const status=!totalTarget?'no-target':pct>=expectedPct?'on-track':pct>=expectedPct-20?'at-risk':'behind';
  const statusMap={'on-track':{label:'On Track ✅',color:'var(--green)'},'at-risk':{label:'At Risk 🟡',color:'var(--amber)'},'behind':{label:'Behind 🔴',color:'var(--red)'},'no-target':{label:'No target set',color:'var(--t3)'}};
  const s=statusMap[status];
  const ibtn=(icon,click,title,hi)=>h`<button class="icon-btn" title=${title} onClick=${click}
    style=${{width:28,height:28,borderRadius:6,border:'1px solid '+(hi||'var(--bd)'),background:hi?'rgba(59,130,246,.08)':'var(--bg2)',color:hi||'var(--t2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
    <i class=${'ti '+icon} style=${{fontSize:13}}></i></button>`;

  return h`<div style=${{background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:12,padding:16,marginBottom:10}}>
    <div style=${{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
      <${Av} i=${client.initials||client.name.slice(0,2)} c=${client.color||'#FF00EE'} s=${34}/>
      <div style=${{flex:1,minWidth:0}}>
        <div style=${{fontSize:14,fontWeight:500,color:'var(--t1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${client.name}</div>
        <div style=${{fontSize:12,color:s.color,marginTop:1}}>${s.label}</div>
      </div>
      <div style=${{display:'flex',gap:4,flexShrink:0}}>
        ${client.seo_sheet_url&&h`<a href=${safeUrl(client.seo_sheet_url)} target="_blank" rel="noopener" class="icon-btn" title="Open Google Sheet"
          style=${{width:28,height:28,borderRadius:6,border:'1px solid #15803D',background:'rgba(21,128,61,.08)',color:'#15803D',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,textDecoration:'none'}}>
          <i class="ti ti-table" style=${{fontSize:13}}></i></a>`}
        ${ibtn('ti-settings',()=>onSettings(client),'Sheet & target settings')}
        ${ibtn('ti-target',()=>onEditTargets(client),'Set monthly targets')}
        ${data&&ibtn('ti-table-options',()=>onViewDetails(client,data),'View backlink log','#3B82F6')}
        ${ibtn('ti-trash',()=>onRemove(client),'Remove from SEO dashboard','var(--red)')}
      </div>
    </div>
    ${!client.seo_sheet_url&&h`<div style=${{fontSize:12,color:'var(--amber)',padding:'6px 10px',background:'rgba(245,158,11,.08)',borderRadius:6,marginBottom:8,display:'flex',gap:6,alignItems:'center'}}><i class="ti ti-alert-triangle" style=${{fontSize:12}}></i> No sheet linked — click ⚙ to connect Google Sheet</div>`}
    ${loading&&h`<div style=${{fontSize:12,color:'var(--t3)',display:'flex',gap:6,alignItems:'center',padding:'4px 0'}}><i class="ti ti-loader-2 spinner"></i> Fetching from sheet…</div>`}
    ${err&&h`<div style=${{fontSize:12,color:'var(--red)',padding:'6px 10px',background:'rgba(239,68,68,.08)',borderRadius:6,marginBottom:6}}>${err}</div>`}
    ${!loading&&tabErrs.length>0&&h`<div style=${{display:'flex',flexDirection:'column',gap:4,marginBottom:6}}>
      ${tabErrs.map(([t,m])=>h`<div key=${t} style=${{fontSize:12,color:'var(--amber)',padding:'6px 10px',background:'rgba(245,158,11,.08)',borderRadius:6,display:'flex',gap:6,alignItems:'center'}}><i class="ti ti-alert-triangle" style=${{fontSize:12,flexShrink:0}}></i><span>Couldn't read tab "${t}" — check the sheet (${m})</span></div>`)}
    </div>`}
    ${!loading&&h`<div>
      <div style=${{display:'flex',alignItems:'center',gap:10,margin:'6px 0 8px'}}>
        <div style=${{flex:1,height:7,background:'var(--bd)',borderRadius:4,overflow:'hidden'}}>
          <div style=${{height:'100%',width:pct+'%',background:pct>=80?'var(--green)':pct>=50?'var(--amber)':'var(--red)',borderRadius:4,transition:'width .4s'}}></div>
        </div>
        <div style=${{fontSize:13,fontWeight:600,color:'var(--t1)',flexShrink:0,whiteSpace:'nowrap'}}>${totalDone}${totalTarget?'/'+totalTarget:' links'}${' '}<span style=${{fontSize:11,fontWeight:400,color:'var(--t3)'}}>(${pct}%)</span></div>
      </div>
      ${SEO_TABS.map(t=>h`<${SEOMilestoneBar} key=${t} tab=${t} done=${counts[t]||0} total=${tabTargets[t]||0}/>`)}
    </div>`}
  </div>`;
}

function SEOTargetEditor({client,month,onSave,onClose}){
  const cfg=client.seo_config||{};const mc=cfg[month]||{};
  const total=mc.total||client.seo_monthly_target||0;
  const[form,setForm]=useState({'total':total,'Social Bookmarking':mc['Social Bookmarking']||Math.round(total*.35),'Profile Creation':mc['Profile Creation']||Math.round(total*.30),'Articles':mc['Articles']||Math.round(total*.20),'Classifieds':mc['Classifieds']||Math.round(total*.15)});
  const set=(k,v)=>setForm(f=>({...f,[k]:parseInt(v)||0}));
  const sum=SEO_TABS.reduce((a,t)=>a+(form[t]||0),0);
  return h`<div class="modal-overlay" onClick=${e=>e.target===e.currentTarget&&onClose()}>
    <div class="modal-box" style=${{maxWidth:440}}>
      <div class="modal-head"><div class="modal-title"><i class="ti ti-target"></i> ${fmtMonth(month)} Targets — ${client.name}</div><button class="close-btn" onClick=${onClose}>✕</button></div>
      <div style=${{padding:20}}>
        <div class="fi-group"><div class="fi-lbl">Total backlinks this month</div>
          <input class="fi" type="number" min="0" value=${form.total} onInput=${e=>{const v=parseInt(e.target.value)||0;setForm(f=>({...f,total:v,'Social Bookmarking':Math.round(v*.35),'Profile Creation':Math.round(v*.30),'Articles':Math.round(v*.20),'Classifieds':Math.round(v*.15)}));}}/>
        </div>
        <div style=${{background:'var(--bg2)',borderRadius:8,padding:12,marginBottom:16}}>
          <div style=${{fontSize:12,color:'var(--t3)',marginBottom:10}}>Or set per category (auto-splits when you type total above):</div>
          ${SEO_TABS.map(t=>h`<div key=${t} style=${{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <i class=${'ti '+SEO_ICONS[t]} style=${{color:SEO_COLORS[t],fontSize:14,width:16,flexShrink:0}}></i>
            <div style=${{fontSize:13,color:'var(--t2)',flex:1}}>${t}</div>
            <input class="fi" type="number" min="0" value=${form[t]} onInput=${e=>set(t,e.target.value)} style=${{width:80,textAlign:'center'}}/>
          </div>`)}
          <div style=${{fontSize:12,color:'var(--t3)',textAlign:'right',marginTop:4,borderTop:'1px solid var(--bd)',paddingTop:4}}>Category sum: <strong>${sum}</strong></div>
        </div>
        <div style=${{display:'flex',gap:8}}>
          <button class="btn-pri" style=${{flex:1,justifyContent:'center'}} onClick=${()=>onSave(client,month,{...form,total:form.total||sum})}>Save targets</button>
          <button class="btn-sec" onClick=${onClose}>Cancel</button>
        </div>
      </div>
    </div>
  </div>`;
}

function SEODetailsModal({client,month,data,apiKey,onClose}){
  const[tab,setTab]=useState('Social Bookmarking');const[search,setSearch]=useState('');const[sort,setSort]=useState('date_desc');
  const rows=((data&&data[tab])||[]).filter(r=>{
    if(!r.date)return false;
    const d=r.date instanceof Date?r.date:parseSheetDate(r.date);
    return d&&monthKey(d)===month;
  });
  const filtered=rows.filter(r=>!search||(r.website||'').toLowerCase().includes(search.toLowerCase())||(r.keyword||'').toLowerCase().includes(search.toLowerCase()));
  const sorted=[...filtered].sort((a,b)=>sort==='da_desc'?(b.da||0)-(a.da||0):sort==='da_asc'?(a.da||0)-(b.da||0):sort==='date_desc'?(b.date||0)-(a.date||0):(a.date||0)-(b.date||0));
  const avgDA=filtered.length>0?Math.round(filtered.reduce((s,r)=>s+(r.da||0),0)/filtered.length):0;
  const avgPA=filtered.length>0?Math.round(filtered.reduce((s,r)=>s+(r.pa||0),0)/filtered.length):0;
  return h`<div class="modal-overlay" onClick=${e=>e.target===e.currentTarget&&onClose()}>
    <div class="modal-box" style=${{maxWidth:900,maxHeight:'90vh',display:'flex',flexDirection:'column'}}>
      <div class="modal-head">
        <div class="modal-title"><i class="ti ti-link"></i> Backlink Log — ${client.name} · ${fmtMonth(month)}</div>
        <button class="close-btn" onClick=${onClose}>✕</button>
      </div>
      <div style=${{padding:'0 20px 10px',display:'flex',gap:6,flexWrap:'wrap',borderBottom:'1px solid var(--bd)'}}>
        ${SEO_TABS.map(t=>{const cnt=data?(data[t]||[]).filter(r=>{const d=r.date instanceof Date?r.date:parseSheetDate(r.date);return d&&monthKey(d)===month;}).length:0;return h`<button key=${t} class=${'vbtn'+(tab===t?' on':'')} onClick=${()=>setTab(t)} style=${{fontSize:12}}>
          <i class=${'ti '+SEO_ICONS[t]} style=${{color:SEO_COLORS[t]}}></i>${t} <span style=${{fontSize:11,opacity:.7}}>(${cnt})</span>
        </button>`;})}
      </div>
      <div style=${{padding:'10px 20px',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',borderBottom:'1px solid var(--bd)'}}>
        <div style=${{position:'relative',flex:1,minWidth:180}}>
          <i class="ti ti-search" style=${{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'var(--t3)',pointerEvents:'none'}}></i>
          <input class="fi" placeholder="Search website or keyword…" value=${search} onInput=${e=>setSearch(e.target.value)} style=${{paddingLeft:30}}/>
        </div>
        <select class="fi fi-select" value=${sort} onChange=${e=>setSort(e.target.value)} style=${{maxWidth:160}}>
          <option value="date_desc">Newest first</option><option value="date_asc">Oldest first</option>
          <option value="da_desc">DA: High → Low</option><option value="da_asc">DA: Low → High</option>
        </select>
        <div style=${{display:'flex',gap:16,marginLeft:'auto'}}>
          <div style=${{textAlign:'center'}}><div style=${{fontSize:17,fontWeight:600,color:'var(--t1)'}}>${filtered.length}</div><div style=${{fontSize:11,color:'var(--t3)'}}>Links</div></div>
          <div style=${{textAlign:'center'}}><div style=${{fontSize:17,fontWeight:600,color:'var(--blue)'}}>${avgDA}</div><div style=${{fontSize:11,color:'var(--t3)'}}>Avg DA</div></div>
          <div style=${{textAlign:'center'}}><div style=${{fontSize:17,fontWeight:600,color:'var(--green)'}}>${avgPA}</div><div style=${{fontSize:11,color:'var(--t3)'}}>Avg PA</div></div>
        </div>
      </div>
      <div style=${{flex:1,overflowY:'auto',padding:'0 20px 20px'}}>
        ${sorted.length===0?h`<div class="empty"><i class="ti ti-search-off"></i><div class="empty-t">No links found</div></div>`
        :h`<table style=${{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style=${{borderBottom:'2px solid var(--bd)'}}>
            <th style=${{textAlign:'left',padding:'8px',color:'var(--t3)',fontWeight:500}}>Date</th>
            <th style=${{textAlign:'left',padding:'8px',color:'var(--t3)',fontWeight:500}}>Website</th>
            <th style=${{textAlign:'center',padding:'8px',color:'var(--t3)',fontWeight:500}}>DA</th>
            <th style=${{textAlign:'center',padding:'8px',color:'var(--t3)',fontWeight:500}}>PA</th>
            <th style=${{textAlign:'center',padding:'8px',color:'var(--t3)',fontWeight:500}}>SS%</th>
            <th style=${{textAlign:'left',padding:'8px',color:'var(--t3)',fontWeight:500}}>Keyword</th>
            <th style=${{padding:'8px'}}></th>
          </tr></thead>
          <tbody>${sorted.map((r,i)=>{const d=r.date instanceof Date?r.date:parseSheetDate(r.date);
            const da=r.da||0;const daColor=da>=60?'var(--green)':da>=30?'var(--amber)':'var(--red)';
            return h`<tr key=${i} style=${{borderBottom:'1px solid var(--bd)',background:i%2===0?'transparent':'var(--bg2)'}}>
              <td style=${{padding:'6px 8px',color:'var(--t3)',whiteSpace:'nowrap'}}>${d?d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}):'—'}</td>
              <td style=${{padding:'6px 8px',color:'var(--t1)',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${(r.website||'').replace(/^https?:\/\//,'')}</td>
              <td style=${{padding:'6px 8px',textAlign:'center'}}><span style=${{color:daColor,fontWeight:600}}>${da||'—'}</span></td>
              <td style=${{padding:'6px 8px',textAlign:'center',color:'var(--t2)'}}>${r.pa||'—'}</td>
              <td style=${{padding:'6px 8px',textAlign:'center',color:'var(--t3)',fontSize:11}}>${r.ss||'—'}</td>
              <td style=${{padding:'6px 8px',color:'var(--t2)',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${r.keyword||'—'}</td>
              <td style=${{padding:'6px 8px'}}>${r.url&&h`<a href=${safeUrl(r.url)} target="_blank" style=${{color:'var(--blue)',fontSize:11}}><i class="ti ti-external-link"></i></a>`}</td>
            </tr>`;})}
          </tbody>
        </table>`}
      </div>
    </div>
  </div>`;
}

/* ── SEO APPROVALS ── */
const docPreviewUrl=(u)=>{const m=(u||'').match(/\/document\/d\/([a-zA-Z0-9-_]+)/);if(m)return`https://docs.google.com/document/d/${m[1]}/preview`;const m2=(u||'').match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);if(m2)return`https://docs.google.com/presentation/d/${m2[1]}/preview`;const m3=(u||'').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);if(m3)return`https://docs.google.com/spreadsheets/d/${m3[1]}/preview`;return u;};
const statusKey=(s)=>{const v=(s||'').trim().toLowerCase();if(v==='approved')return'Approved';if(v==='rejected')return'Rejected';if(v.startsWith('change'))return'Changes';if(v)return'Pending';return'Pending';};

function ApprovalReviewModal({client,item,currentUser,onClose,onDone,showToast}){
  const[notes,setNotes]=useState(item.notes||'');
  const[saving,setSaving]=useState(null);
  const[err,setErr]=useState('');
  const sheetId=getSheetId(client.seo_sheet_url);
  const preview=docPreviewUrl(item.url);

  const submit=async(decision)=>{
    setErr('');setSaving(decision);
    try{
      const range=`${item.tab}!${SEO_COL.STATUS}${item.sheetRow}:${SEO_COL.NOTES}${item.sheetRow}`;
      await updateSheetRange(sheetId,range,[[decision,currentUser?.name||'',notes||'']]);
      // Notify SEO assignee + admin/manager
      const actor=currentUser?.name||'Reviewer';
      const titleMap={Approved:'✓ Approved',Rejected:'✗ Rejected','Changes Requested':'✎ Changes requested'};
      const title=titleMap[decision]||decision;
      const msg=`${actor} ${decision.toLowerCase()} "${item.keyword||item.website||item.tab}" (${client.name})${notes?' — '+notes:''}`;
      if(item.assignee)insertNotif(item.assignee,title,msg,decision==='Approved'?'success':decision==='Rejected'?'alert':'info',client.name,item.keyword||item.website||null,'seo',client.id);
      insertNotif(`role:admin,manager!${actor}`,title,msg,'info',client.name,item.keyword||item.website||null,'seo',client.id);
      showToast(`${decision} ✓`);
      onDone({...item,status:decision,reviewer:currentUser?.name||'',notes});
    }catch(e){setErr(e.message);}
    finally{setSaving(null);}
  };

  return h`<div class="modal-overlay" onClick=${e=>e.target===e.currentTarget&&onClose()}>
    <div class="modal-box" style=${{maxWidth:1100,width:'95vw',maxHeight:'92vh',display:'flex',flexDirection:'column'}}>
      <div class="modal-head">
        <div class="modal-title" style=${{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0}}>
          <i class="ti ti-file-text" style=${{color:'#F59E0B'}}></i>
          <span style=${{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${item.keyword||item.website||item.tab} · ${client.name}</span>
        </div>
        <a href=${safeUrl(item.url)} target="_blank" rel="noopener" class="btn-sec" style=${{fontSize:12,padding:'5px 10px',marginRight:8,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:5}}>
          <i class="ti ti-external-link" style=${{fontSize:13}}></i> Open in Docs
        </a>
        <button class="close-btn" onClick=${onClose}>✕</button>
      </div>
      <div style=${{padding:'10px 20px',display:'flex',gap:14,flexWrap:'wrap',fontSize:12,color:'var(--t3)',borderBottom:'1px solid var(--bd)'}}>
        <div><i class="ti ti-folder" style=${{fontSize:12,marginRight:4}}></i>${item.tab}</div>
        ${item.date&&h`<div><i class="ti ti-calendar" style=${{fontSize:12,marginRight:4}}></i>${(item.date instanceof Date?item.date:parseSheetDate(item.date))?.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})||'—'}</div>`}
        ${item.assignee&&h`<div><i class="ti ti-user" style=${{fontSize:12,marginRight:4}}></i>By ${item.assignee}</div>`}
        ${item.reviewer&&h`<div style=${{color:'var(--t2)'}}><i class="ti ti-shield-check" style=${{fontSize:12,marginRight:4}}></i>Last reviewed by ${item.reviewer}</div>`}
      </div>
      <div style=${{flex:1,minHeight:380,background:'#000',position:'relative'}}>
        <iframe src=${preview} style=${{width:'100%',height:'100%',border:0,background:'#fff'}} title="Document preview" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>
      <div style=${{padding:'12px 20px',borderTop:'1px solid var(--bd)',display:'flex',flexDirection:'column',gap:10}}>
        <div>
          <div class="fi-lbl" style=${{fontSize:11,marginBottom:4}}>Reviewer notes (optional — shared with the writer)</div>
          <textarea class="fi" rows="2" value=${notes} onInput=${e=>setNotes(e.target.value)} placeholder="e.g. Tighten intro, add 1 internal link, looks good otherwise" style=${{resize:'vertical',minHeight:48,fontSize:13,fontFamily:'inherit'}}></textarea>
        </div>
        ${err&&h`<div style=${{fontSize:12,color:'var(--red)',background:'rgba(220,38,38,.08)',padding:'6px 10px',borderRadius:6}}><i class="ti ti-alert-circle" style=${{fontSize:12,marginRight:4}}></i>${err}</div>`}
        <div style=${{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button class="btn-pri" style=${{background:'#15803D',border:'none',color:'#fff',flex:'1 1 140px',justifyContent:'center'}} onClick=${()=>submit('Approved')} disabled=${!!saving}>
            ${saving==='Approved'?h`<span><i class="ti ti-loader-2 spinner"></i> Approving…</span>`:h`<span><i class="ti ti-check"></i> Approve</span>`}
          </button>
          <button class="btn-sec" style=${{flex:'1 1 140px',justifyContent:'center',borderColor:'#6D28D9',color:'#6D28D9'}} onClick=${()=>submit('Changes Requested')} disabled=${!!saving}>
            ${saving==='Changes Requested'?h`<span><i class="ti ti-loader-2 spinner"></i> Sending…</span>`:h`<span><i class="ti ti-edit"></i> Request changes</span>`}
          </button>
          <button class="btn-sec" style=${{flex:'1 1 120px',justifyContent:'center',borderColor:'#DC2626',color:'#DC2626'}} onClick=${()=>submit('Rejected')} disabled=${!!saving}>
            ${saving==='Rejected'?h`<span><i class="ti ti-loader-2 spinner"></i> Rejecting…</span>`:h`<span><i class="ti ti-x"></i> Reject</span>`}
          </button>
          <button class="btn-sec" onClick=${onClose} disabled=${!!saving}>Close</button>
        </div>
        <div style=${{fontSize:11,color:'var(--t3)'}}>Writes Status, Reviewer & Notes back to ${item.tab} row ${item.sheetRow} (columns H–J). Requires Google sign-in (one-time per session).</div>
      </div>
    </div>
  </div>`;
}

function ApprovalsView({clients,apiKey,currentUser,showToast,items,setItems,loading,err,onRefresh}){
  const seoClients=clients.filter(c=>c.seo_sheet_url);
  const[filter,setFilter]=useState('pending'); // pending | all
  const[reviewing,setReviewing]=useState(null); // {client,item}

  const visible=items.filter(it=>{
    const s=statusKey(it.status);
    if(filter==='pending')return s==='Pending'||s==='Changes';
    return true;
  });
  const pendingCount=items.filter(it=>{const s=statusKey(it.status);return s==='Pending'||s==='Changes';}).length;

  const onItemUpdated=(updated)=>{
    setItems(arr=>arr.map(it=>(it.client.id===reviewing.client.id&&it.tab===updated.tab&&it.sheetRow===updated.sheetRow)?{...it,...updated}:it));
    setReviewing(null);
  };

  if(!apiKey)return h`<div class="empty"><i class="ti ti-key"></i><div class="empty-t">Connect Google Sheets first</div><div class="empty-s">Open the SEO tab to add your Sheets API key, then come back.</div></div>`;
  if(seoClients.length===0)return h`<div class="empty"><i class="ti ti-trending-up"></i><div class="empty-t">No SEO clients linked</div><div class="empty-s">Link a client's Google Sheet in the SEO tab to start collecting approvals.</div></div>`;

  return h`<div>
    ${reviewing&&h`<${ApprovalReviewModal} client=${reviewing.client} item=${reviewing.item} currentUser=${currentUser} onClose=${()=>setReviewing(null)} onDone=${onItemUpdated} showToast=${showToast}/>`}
    <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
      <div>
        <div style=${{fontSize:22,fontWeight:500,color:'var(--t1)'}}>Pending Approvals</div>
        <div style=${{fontSize:13,color:'var(--t3)',marginTop:2}}>${pendingCount} awaiting review · across ${seoClients.length} SEO client${seoClients.length!==1?'s':''}</div>
      </div>
      <div style=${{display:'flex',gap:6,alignItems:'center'}}>
        <div style=${{display:'flex',background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:8,padding:3}}>
          <button class=${'vbtn'+(filter==='pending'?' on':'')} onClick=${()=>setFilter('pending')} style=${{fontSize:12}}>Pending (${pendingCount})</button>
          <button class=${'vbtn'+(filter==='all'?' on':'')} onClick=${()=>setFilter('all')} style=${{fontSize:12}}>All (${items.length})</button>
        </div>
        <button class="btn-sec" style=${{fontSize:12}} onClick=${onRefresh} title="Re-fetch from sheets"><i class="ti ti-refresh" style=${{fontSize:13}}></i> Refresh</button>
      </div>
    </div>

    ${loading?h`<div style=${{display:'flex',flexDirection:'column',gap:8}}>${[...Array(3)].map((_,i)=>h`<${Skel} key=${i} h=${72}/>`)} </div>`
    :err?h`<div class="err"><i class="ti ti-alert-circle" style=${{fontSize:18}}></i>${err}</div>`
    :visible.length===0?h`<div class="empty" style=${{padding:'40px 20px'}}>
      <i class=${'ti '+(filter==='pending'?'ti-checks':'ti-inbox')}></i>
      <div class="empty-t">${filter==='pending'?'All caught up ✨':'Nothing to show'}</div>
      <div class="empty-s">${filter==='pending'?'No documents waiting for review right now.':'Try switching filter to Pending.'}</div>
    </div>`
    :h`<div style=${{display:'flex',flexDirection:'column',gap:8}}>
      ${visible.map((it,i)=>{
        const s=statusKey(it.status);const st=STATUS_STYLE[s];
        const d=it.date instanceof Date?it.date:parseSheetDate(it.date);
        const ageDays=d?Math.floor((Date.now()-d.getTime())/86400000):null;
        return h`<div key=${it.client.id+'-'+it.tab+'-'+it.sheetRow} style=${{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:10}}>
          <${Av} i=${it.client.initials||it.client.name.slice(0,2)} c=${it.client.color||'#FF00EE'} s=${36}/>
          <div style=${{flex:1,minWidth:0}}>
            <div style=${{display:'flex',alignItems:'center',gap:8,marginBottom:2,flexWrap:'wrap'}}>
              <span style=${{fontSize:14,fontWeight:500,color:'var(--t1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:340}}>${it.keyword||it.website||'(untitled)'}</span>
              <span style=${{fontSize:11,padding:'2px 7px',borderRadius:5,background:'var(--bg2)',color:'var(--t3)',border:'1px solid var(--bd)'}}>
                <i class=${'ti '+SEO_ICONS[it.tab]} style=${{fontSize:11,color:SEO_COLORS[it.tab],marginRight:3}}></i>${it.tab}
              </span>
            </div>
            <div style=${{fontSize:12,color:'var(--t3)',display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
              <span style=${{fontWeight:500,color:'var(--t2)'}}>${it.client.name}</span>
              ${d&&h`<span><i class="ti ti-calendar" style=${{fontSize:11,marginRight:3}}></i>${d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}${ageDays!=null&&ageDays>1?` · ${ageDays}d old`:''}</span>`}
              ${it.assignee&&h`<span><i class="ti ti-user" style=${{fontSize:11,marginRight:3}}></i>${it.assignee}</span>`}
              ${it.reviewer&&h`<span><i class="ti ti-shield-check" style=${{fontSize:11,marginRight:3}}></i>${it.reviewer}</span>`}
              ${it.notes&&h`<span style=${{fontStyle:'italic',color:'var(--t2)',maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>"${it.notes}"</span>`}
            </div>
          </div>
          <div style=${{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 9px',borderRadius:6,background:st.bg,color:st.col,fontSize:12,fontWeight:500,flexShrink:0}}>
            <i class=${'ti '+st.ic} style=${{fontSize:12}}></i>${s}
          </div>
          <button class="btn-pri" style=${{fontSize:12,padding:'6px 12px',flexShrink:0}} onClick=${()=>setReviewing({client:it.client,item:it})}>
            <i class="ti ti-eye" style=${{fontSize:13}}></i> Review
          </button>
        </div>`;
      })}
    </div>`}
  </div>`;
}

function SEOApp({clients,currentUser,showToast,onClientsUpdate}){
  const seoClients=clients.filter(c=>c.seo_sheet_url);
  const now=new Date();
  const[seoTab,setSeoTab]=useState('dashboard'); // 'dashboard' | 'approvals'
  const[month,setMonth]=useState(monthKey(now));
  const[apiKey,setApiKey]=useState(()=>localStorage.getItem('ams_sheets_api_key')||'');
  const[search,setSearch]=useState('');
  const[editTargets,setEditTargets]=useState(null);
  const[detailClient,setDetailClient]=useState(null);const[detailData,setDetailData]=useState(null);
  const[settingsClient,setSettingsClient]=useState(null);
  const[showAdd,setShowAdd]=useState(null);// null or client object (to open settings after pick)
  const[editingKey,setEditingKey]=useState(false);const[tempKey,setTempKey]=useState('');
  const[localClients,setLocalClients]=useState(clients);
  // Approvals data — lifted so the sub-tab badge reflects pending count without mounting ApprovalsView
  const[apItems,setApItems]=useState([]);
  const[apLoading,setApLoading]=useState(true);
  const[apErr,setApErr]=useState('');
  const[apRefreshKey,setApRefreshKey]=useState(0);

  // Keep localClients synced with parent
  useEffect(()=>setLocalClients(clients),[clients]);
  // Prefer the org-level key (agency_settings.sheets_api_key, set once in Settings)
  // over the per-browser localStorage key the state was seeded from.
  useEffect(()=>{
    let cancelled=false;
    getSheetsApiKey().then(k=>{if(!cancelled&&k)setApiKey(k);});
    return()=>{cancelled=true;};
  },[]);
  const localSEO=localClients.filter(c=>c.seo_sheet_url);
  const filtered=search?localSEO.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())):localSEO;

  // Fetch approvals once per SEOApp mount (and on manual refresh / sheet link change)
  useEffect(()=>{
    if(!apiKey){setApLoading(false);return;}
    if(seoClients.length===0){setApItems([]);setApLoading(false);return;}
    let cancelled=false;
    setApLoading(true);setApErr('');
    Promise.all(seoClients.map(c=>{const sid=getSheetId(c.seo_sheet_url);if(!sid)return Promise.resolve({client:c,data:null});
      return fetchAllSEOData(sid,apiKey).then(d=>({client:c,data:d})).catch(e=>({client:c,data:null,err:e.message}));
    })).then(results=>{
      if(cancelled)return;
      const out=[];
      results.forEach(({client,data})=>{
        if(!data)return;
        SEO_TABS.forEach(tab=>{(data[tab]||[]).forEach(r=>{
          if(!isDocUrl(r.url))return;
          out.push({client,...r});
        });});
      });
      out.sort((a,b)=>{
        const ap=statusKey(a.status)==='Approved'||statusKey(a.status)==='Rejected'?1:0;
        const bp=statusKey(b.status)==='Approved'||statusKey(b.status)==='Rejected'?1:0;
        if(ap!==bp)return ap-bp;
        const ad=a.date instanceof Date?a.date.getTime():0;
        const bd=b.date instanceof Date?b.date.getTime():0;
        return ad-bd;
      });
      setApItems(out);setApLoading(false);
    }).catch(e=>{if(!cancelled){setApErr(e.message);setApLoading(false);}});
    return()=>{cancelled=true;};
  },[apiKey,apRefreshKey,seoClients.length]);

  const apPendingCount=apItems.filter(it=>{const s=statusKey(it.status);return s==='Pending'||s==='Changes';}).length;

  const saveApiKey=(k)=>{localStorage.setItem('ams_sheets_api_key',k);_sheetsKeyP=null;setApiKey(k);showToast('API key saved ✓ — set it in Settings to share it with the whole team');};

  const saveTargets=async(client,mk,targets)=>{
    const newCfg={...(client.seo_config||{}),[mk]:targets};
    try{await rpcCall('client_update_seo',{p_client_id:client.id,p_patch:{seo_config:newCfg,seo_monthly_target:targets.total||0}});showToast('Targets saved ✓');}catch(e){showToast('Failed to save');}
    setEditTargets(null);
  };

  const handleSettings=async(url,target,client)=>{
    setLocalClients(prev=>prev.map(c=>c.id===client.id?{...c,seo_sheet_url:url,seo_monthly_target:target}:c));
    setSettingsClient(null);setShowAdd(null);
    showToast('Settings saved ✓');
  };

  const removeFromSEO=async(client)=>{
    if(!confirm(`Remove ${client.name} from SEO dashboard?`))return;
    try{await rpcCall('client_update_seo',{p_client_id:client.id,p_patch:{seo_sheet_url:null,seo_monthly_target:0}});
    setLocalClients(prev=>prev.map(c=>c.id===client.id?{...c,seo_sheet_url:null}:c));showToast('Removed from SEO dashboard');}catch(e){showToast('Error removing');}
  };

  const changeMonth=(dir)=>{const[y,m]=month.split('-');setMonth(monthKey(new Date(+y,+m-1+dir,1)));};

  if(!apiKey)return h`<div class="scroll"><${SEOApiKeyPrompt} onSave=${saveApiKey}/></div>`;

  return h`<div class="scroll">
    ${editTargets&&h`<${SEOTargetEditor} client=${editTargets} month=${month} onSave=${saveTargets} onClose=${()=>setEditTargets(null)}/>`}
    ${detailClient&&h`<${SEODetailsModal} client=${detailClient} month=${month} data=${detailData} apiKey=${apiKey} onClose=${()=>{setDetailClient(null);setDetailData(null);}}/>`}
    ${settingsClient&&h`<${SEOClientSettingsModal} client=${settingsClient} onSave=${(url,tgt)=>handleSettings(url,tgt,settingsClient)} onClose=${()=>setSettingsClient(null)}/>`}
    ${showAdd&&typeof showAdd==='object'&&h`<${SEOClientSettingsModal} client=${showAdd} onSave=${(url,tgt)=>handleSettings(url,tgt,showAdd)} onClose=${()=>setShowAdd(null)}/>`}
    ${showAdd==='pick'&&h`<${SEOAddClientModal} allClients=${localClients} seoClientIds=${localSEO.map(c=>c.id)} onAdd=${c=>setShowAdd(c)} onClose=${()=>setShowAdd(null)}/>`}

    <!-- Sub-tabs: Dashboard / Approvals -->
    <div class="subtabs" style=${{marginBottom:16}}>
      <button class=${'subtab'+(seoTab==='dashboard'?' on':'')} onClick=${()=>setSeoTab('dashboard')}>
        <i class="ti ti-trending-up"></i>Dashboard
      </button>
      <button class=${'subtab'+(seoTab==='approvals'?' on':'')} onClick=${()=>setSeoTab('approvals')}>
        <i class="ti ti-checks"></i>Approvals
        ${apPendingCount>0&&h`<span style=${{marginLeft:6,minWidth:18,height:18,padding:'0 6px',display:'inline-flex',alignItems:'center',justifyContent:'center',borderRadius:9,background:'#DC2626',color:'#fff',fontSize:11,fontWeight:600,lineHeight:1}}>${apPendingCount>99?'99+':apPendingCount}</span>`}
      </button>
    </div>

    ${seoTab==='approvals'?h`<${ApprovalsView} clients=${clients} apiKey=${apiKey} currentUser=${currentUser} showToast=${showToast} items=${apItems} setItems=${setApItems} loading=${apLoading} err=${apErr} onRefresh=${()=>setApRefreshKey(k=>k+1)}/>`:h`<div>
    <!-- Header -->
    <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
      <div>
        <div style=${{fontSize:22,fontWeight:500,color:'var(--t1)'}}>SEO Dashboard</div>
        <div style=${{fontSize:13,color:'var(--t3)',marginTop:2}}>${localSEO.length} active SEO client${localSEO.length!==1?'s':''} · live from Google Sheets</div>
      </div>
      <div style=${{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
        <div style=${{display:'flex',alignItems:'center',gap:3,background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:8,padding:'3px 6px'}}>
          <button class="icon-btn" onClick=${()=>changeMonth(-1)} style=${{padding:'3px 5px'}}><i class="ti ti-chevron-left" style=${{fontSize:13}}></i></button>
          <div style=${{fontSize:13,fontWeight:500,color:'var(--t1)',minWidth:110,textAlign:'center'}}>${fmtMonth(month)}</div>
          <button class="icon-btn" onClick=${()=>changeMonth(1)} style=${{padding:'3px 5px'}}><i class="ti ti-chevron-right" style=${{fontSize:13}}></i></button>
        </div>
        <button class="btn-pri" style=${{fontSize:12}} onClick=${()=>setShowAdd('pick')}>
          <i class="ti ti-plus" style=${{fontSize:13}}></i> Add SEO client
        </button>
        <button class="btn-sec" style=${{fontSize:12}} onClick=${()=>{setEditingKey(true);setTempKey(apiKey);}}>
          <i class="ti ti-key" style=${{fontSize:13}}></i> API Key
        </button>
      </div>
    </div>

    ${editingKey&&h`<div style=${{background:'var(--bg)',border:'1px solid var(--amber)',borderRadius:8,padding:10,marginBottom:14,display:'flex',gap:8,alignItems:'center'}}>
      <i class="ti ti-key" style=${{fontSize:14,color:'var(--amber)',flexShrink:0}}></i>
      <input class="fi" type="text" placeholder="Google Sheets API Key (AIzaSy…)" value=${tempKey} onInput=${e=>setTempKey(e.target.value)} style=${{flex:1}}/>
      <button class="btn-pri" onClick=${()=>{saveApiKey(tempKey);setEditingKey(false);}} disabled=${!tempKey.trim()}>Save</button>
      <button class="btn-sec" onClick=${()=>setEditingKey(false)}>Cancel</button>
    </div>`}

    <!-- Search bar -->
    ${localSEO.length>1&&h`<div style=${{position:'relative',marginBottom:12}}>
      <i class="ti ti-search" style=${{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'var(--t3)',pointerEvents:'none'}}></i>
      <input class="fi" placeholder="Search SEO clients…" value=${search} onInput=${e=>setSearch(e.target.value)} style=${{paddingLeft:32}}/>
    </div>`}

    ${filtered.length===0&&localSEO.length===0?h`<div class="empty">
      <i class="ti ti-trending-up"></i>
      <div class="empty-t">No SEO clients yet</div>
      <div class="empty-s">Click "Add SEO client" to link a client's Google Sheet and start tracking</div>
    </div>`:filtered.length===0?h`<div class="empty"><i class="ti ti-search-off"></i><div class="empty-t">No clients match "${search}"</div></div>`
    :filtered.map(c=>h`<${SEOClientCard}
      key=${c.id} client=${c} month=${month} apiKey=${apiKey}
      onEditTargets=${setEditTargets}
      onSettings=${setSettingsClient}
      onRemove=${removeFromSEO}
      onViewDetails=${(cl,d)=>{setDetailClient(cl);setDetailData(d);}}
    />`)}
    </div>`}
  </div>`;
}

    return { SEOReportsDueCard, ClientSEOTab, SEOApp };
  }
  window.AMS_SEO = { buildSeo };
})();

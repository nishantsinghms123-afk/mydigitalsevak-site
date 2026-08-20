// reports.js — Monthly Reports feature, extracted from index.html (Phase 3.2 code-split).
//
// Plain script (loads before the deferred inline module in index.html, like
// client_portal.js). Defines window.AMS_REPORTS.buildReports(deps) which returns
// { ReportsTab, ReportForm }. All dependencies — React hooks, db helpers, and the
// SHARED utilities (_loadFail, Skel, fmtMo, compressImg, generateAndUploadReportPdf,
// sendMonthlyReportEmail) — are injected from index.html so there's a single React
// instance (hooks stay safe) and the shared helpers aren't duplicated.
(function () {
  function buildReports(deps) {
    const { React, h, useState, useEffect, db, dbInsert, dbDelete, rpcCall, SB_URL, _loadFail, Skel, fmtMo, compressImg, generateAndUploadReportPdf, sendMonthlyReportEmail } = deps;
    const sessTok=()=>{try{return localStorage.getItem('ams_session_token')||'';}catch(_){return '';}};

    // `existing` (optional) = a saved monthly_reports row → the form prefills
    // from it and saves through the report_update RPC instead of inserting.
    function ReportForm({client,onClose,onSave,showToast,existing}){
      const today=new Date();
      const REPORT_FIELDS=['total_reach','total_impressions','engagement_rate','new_followers','profile_visits','website_clicks','story_reach','agency_notes','top_post_1_title','top_post_1_reach','top_post_1_engagement','top_post_1_image','top_post_2_title','top_post_2_reach','top_post_2_engagement','top_post_2_image','top_post_3_title','top_post_3_reach','top_post_3_engagement','top_post_3_image'];
      const[form,setForm]=useState(()=>{
        if(existing){const f={month:String(existing.month||'').slice(0,7)};REPORT_FIELDS.forEach(k=>{f[k]=existing[k]==null?(k.endsWith('_image')?null:(k==='agency_notes'||k.endsWith('_title')?'':0)):existing[k];});return f;}
        return{month:`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`,total_reach:0,total_impressions:0,engagement_rate:0,new_followers:0,profile_visits:0,website_clicks:0,story_reach:0,agency_notes:'',top_post_1_title:'',top_post_1_reach:0,top_post_1_engagement:0,top_post_1_image:null,top_post_2_title:'',top_post_2_reach:0,top_post_2_engagement:0,top_post_2_image:null,top_post_3_title:'',top_post_3_reach:0,top_post_3_engagement:0,top_post_3_image:null};
      });
      const[counts,setCounts]=useState({total:0,reel:0,creative:0,carousel:0,extra:0});const[saving,setSaving]=useState(false);
      const[emailOnSave,setEmailOnSave]=useState(!existing);const[pulling,setPulling]=useState(false);
      const[platform,setPlatform]=useState('instagram');
      const set=(k,v)=>setForm(f=>({...f,[k]:v}));
      const fnMissing=(e)=>/PGRST202|could not find|does not exist|404/i.test(String(e?.code||'')+' '+String(e?.message||''));
      // Auto-fill the metrics by querying Meta LIVE for the report's month, via the
      // meta-report-pull edge function (date-ranged Graph queries → accurate totals
      // for ANY past month, not just cached days). Fills the selected platform's
      // KPIs + that month's top-3 posts; fields with no data are left untouched.
      // (Requires the account's token to carry insights scopes — reconnect once
      // after the meta-oauth scope update if a brand still returns nothing.)
      const pullFromMeta=async()=>{
        if(!form.month){showToast('Pick a report month first');return;}
        setPulling(true);
        try{
          const res=await fetch(`${SB_URL}/functions/v1/meta-report-pull`,{method:'POST',
            headers:{'content-type':'application/json'},
            body:JSON.stringify({session_token:sessTok(),client_id:client.id,month:form.month})});
          const r=await res.json().catch(()=>null);
          if(!r||!r.ok){showToast('Pull failed: '+((r&&r.error)||'try again'));return;}
          const d=platform==='facebook'?r.facebook:r.instagram;
          if(!d){showToast(`No ${platform==='facebook'?'Facebook':'Instagram'} account connected for this brand`);return;}
          const top=d.top_posts||[];
          setForm(f=>{
            const nf={...f};
            const put=(field,v)=>{if(v!=null)nf[field]=v;};   // never overwrite a filled field with null
            put('total_reach',d.reach);
            put('total_impressions',d.impressions);
            put('profile_visits',d.profile_views);
            put('website_clicks',d.website_clicks);
            put('engagement_rate',d.engagement_rate);
            put('new_followers',d.new_followers!=null?Math.max(0,d.new_followers):null);
            // story_reach: not exposed by the Graph account-insights set — left for manual entry.
            top.slice(0,3).forEach((p,i)=>{
              const n=i+1;
              if(p.title)nf['top_post_'+n+'_title']=p.title;
              if(p.reach!=null)nf['top_post_'+n+'_reach']=p.reach;
              const eng=(p.reach)?Math.round(((p.likes||0)+(p.comments||0)+(p.saves||0)+(p.shares||0))/p.reach*1000)/10:0;
              if(eng)nf['top_post_'+n+'_engagement']=eng;
            });
            return nf;
          });
          const hadAny=d.reach!=null||d.impressions!=null||top.length>0;
          showToast(hadAny
            ?`Pulled ${platform==='facebook'?'Facebook':'Instagram'} numbers for ${form.month} ✓ — review, then save`
            :`Meta returned no ${platform==='facebook'?'Facebook':'Instagram'} data for ${form.month} — reconnect the account (Settings → Connected accounts) if this persists`);
        }catch(e){showToast('Pull failed: '+(e.message||e.code||'try again'));}finally{setPulling(false);}
      };
      useEffect(()=>{if(!form.month)return;const[y,m]=form.month.split('-').map(Number);const start=`${y}-${String(m).padStart(2,'0')}-01`;const end=new Date(y,m,0);const endStr=`${y}-${String(m).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;db('content',`&client_id=eq.${client.id}&post_date=gte.${start}&post_date=lte.${endStr}`).then(posts=>{setCounts({total:posts.length,reel:posts.filter(p=>p.type==='reel').length,creative:posts.filter(p=>p.type==='creative').length,carousel:posts.filter(p=>p.type==='carousel').length,extra:posts.filter(p=>p.type==='extra').length});}).catch(_loadFail('report-monthly-counts'));},[form.month,client.id]);
      const submit=async()=>{setSaving(true);try{
        // Compress images before saving to avoid 5MB DB limit
        const f={...form};
        for(const n of[1,2,3]){const k='top_post_'+n+'_image';if(f[k]&&String(f[k]).startsWith('data:'))f[k]=await compressImg(f[k]);}
        let saved;
        if(existing){
          // Edit path: patch the saved row via the report_update RPC.
          const patch={...f,month:f.month+'-01'};
          try{
            const out=await rpcCall('report_update',{p_id:existing.id,p_patch:patch});
            saved=(out&&out.id)?out:{...existing,...patch};
          }catch(e){
            if(fnMissing(e)){showToast('Editing saved reports needs the latest DB migration (report_update) — apply it first');setSaving(false);return;}
            throw e;
          }
        }else{
          const rows=await dbInsert('monthly_reports',[{...f,month:f.month+'-01',client_id:client.id}]);
          saved=rows[0];
        }
        // Generate + upload branded AMS PDF (best-effort — never blocks the save).
        // For edits this REGENERATES the PDF so it matches the corrected numbers.
        // Fires before the email so send-monthly-report sees pdf_url and adds the
        // Download CTA.
        let pdfOk=false;
        if(saved?.id){
          const pdf=await generateAndUploadReportPdf('social',saved,client,counts);
          pdfOk=!!pdf.url;
          if(pdf.url)saved={...saved,pdf_url:pdf.url};
        }
        onSave(saved);
        if(emailOnSave&&saved?.id){
          const out=await sendMonthlyReportEmail(saved.id);
          if(out.ok)showToast(`Report ${existing?'updated':'saved'}${pdfOk?' (PDF regenerated)':''} & emailed to ${out.to||client.name} ✓`);
          else if(out.error==='no email on file for this client')showToast(`Report ${existing?'updated':'saved'} ✓ — no contact email on file, email skipped`);
          else showToast(`Report ${existing?'updated':'saved'} ✓ — email failed (${out.error||'unknown'})`);
        }else{
          showToast(`Report ${existing?'updated':'saved'}${pdfOk?' (PDF regenerated)':''} ✓`);
        }
        onClose();
      }catch(e){showToast('Save failed: '+(e.message||'check DB table exists'));console.error(e);}finally{setSaving(false);}};
      const numFi=(label,key,placeholder)=>h`<div class="fi-group"><div class="fi-lbl">${label}</div><input class="fi" type="number" min="0" placeholder=${placeholder} value=${form[key]||''} onInput=${e=>set(key,parseFloat(e.target.value)||0)}/></div>`;
      return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose()}}>
        <div class="modal-box">
          <div class="modal-head"><div><div style=${{fontSize:16,fontWeight:600}}>${existing?'Edit monthly report':'New monthly report'}</div><div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>${client.name}${existing?' · '+fmtMo(existing.month):''}</div></div><button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button></div>
          <div class="modal-body">
            <div class="fi-group"><div class="fi-lbl">Report month</div><input class="fi" type="month" value=${form.month} onChange=${e=>set('month',e.target.value)}/></div>
            ${counts.total>0&&h`<div class="month-auto"><i class="ti ti-circle-check" style=${{fontSize:16,flexShrink:0}}></i><div><strong>Auto-counted:</strong> ${counts.total} posts — ${counts.reel} reels, ${counts.creative} creatives, ${counts.carousel} carousels, ${counts.extra} extra</div></div>`}
            <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:12}}>
              <div style=${{fontSize:14,fontWeight:500,color:'var(--t1)'}}>Instagram / Facebook metrics</div>
              <div style=${{display:'flex',gap:6,alignItems:'center'}}>
                <select class="fi fi-select" value=${platform} onChange=${e=>setPlatform(e.target.value)} style=${{width:110,padding:'5px 8px',fontSize:12}} title="Which platform to pull — the summary never mixes platforms">
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                </select>
                <button class="btn-sec" style=${{padding:'5px 11px',fontSize:12}} onClick=${pullFromMeta} disabled=${pulling} title="Auto-fill this month's KPIs & top posts from the connected account">${pulling?h`<i class="ti ti-loader-2 spinner" style=${{fontSize:13}}></i> Pulling…`:h`<i class="ti ti-brand-meta" style=${{fontSize:14,color:'#A8009C'}}></i> Pull from Meta`}</button>
              </div>
            </div>
            <div class="fi-grid">${numFi('Total reach','total_reach','e.g. 142800')}${numFi('Total impressions','total_impressions','e.g. 284000')}${numFi('Engagement rate (%)','engagement_rate','e.g. 4.7')}${numFi('New followers','new_followers','e.g. 1247')}${numFi('Profile visits','profile_visits','e.g. 4820')}${numFi('Website clicks','website_clicks','e.g. 312')}</div>
            ${numFi('Story reach','story_reach','e.g. 38200')}
            <div style=${{fontSize:14,fontWeight:500,color:'var(--t1)',margin:'8px 0 14px'}}>Top 3 posts</div>
            <div style=${{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
              ${[1,2,3].map(n=>h`<div key=${n} style=${{background:'var(--bg)',borderRadius:'var(--r)',padding:12}}>
                <div style=${{fontSize:12,fontWeight:500,color:'var(--t2)',marginBottom:8}}>Post ${n}</div>
                <div class="img-drop" style=${{minHeight:70,marginBottom:8}} onClick=${()=>document.getElementById('img'+n).click()} onDragOver=${e=>e.preventDefault()} onDrop=${e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f){const r=new FileReader();r.onload=ev=>set('top_post_'+n+'_image',ev.target.result);r.readAsDataURL(f);}}}>
                  ${form['top_post_'+n+'_image']?h`<img src=${form['top_post_'+n+'_image']} style=${{width:'100%',height:'70px',objectFit:'cover',display:'block'}}/>`:h`<div style=${{textAlign:'center',color:'var(--t3)',fontSize:11,padding:'10px'}}><i class="ti ti-photo" style=${{fontSize:18,display:'block',marginBottom:3}}></i>Screenshot</div>`}
                </div>
                <input id=${'img'+n} type="file" accept="image/*" style=${{display:'none'}} onChange=${e=>{const f=e.target.files[0];if(f){const r=new FileReader();r.onload=ev=>set('top_post_'+n+'_image',ev.target.result);r.readAsDataURL(f);}}}/>
                ${form['top_post_'+n+'_image']&&h`<button style=${{fontSize:11,color:'var(--red)',background:'transparent',border:'none',cursor:'pointer',marginBottom:6,padding:0}} onClick=${()=>set('top_post_'+n+'_image',null)}>Remove</button>`}
                <input class="fi" type="text" placeholder="Post title..." style=${{fontSize:12,padding:'5px 8px',marginBottom:6}} value=${form['top_post_'+n+'_title']||''} onInput=${e=>set('top_post_'+n+'_title',e.target.value)}/>
                <div style=${{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}><input class="fi" type="number" placeholder="Reach" style=${{fontSize:12,padding:'5px 8px'}} value=${form['top_post_'+n+'_reach']||''} onInput=${e=>set('top_post_'+n+'_reach',parseInt(e.target.value)||0)}/><input class="fi" type="number" placeholder="Eng %" style=${{fontSize:12,padding:'5px 8px'}} step="0.1" value=${form['top_post_'+n+'_engagement']||''} onInput=${e=>set('top_post_'+n+'_engagement',parseFloat(e.target.value)||0)}/></div>
              </div>`)}
            </div>
            <div class="fi-group"><div class="fi-lbl">Agency notes</div><textarea class="fi" rows="4" placeholder="Aruj's commentary for the client — highlights, recommendations for next month..." value=${form.agency_notes} onInput=${e=>set('agency_notes',e.target.value)}></textarea></div>
          </div>
          <div class="modal-foot" style=${{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <label style=${{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--t2)',cursor:'pointer',marginRight:'auto'}}>
              <input type="checkbox" checked=${emailOnSave} onChange=${e=>setEmailOnSave(e.target.checked)} style=${{accentColor:'#ff00ee',cursor:'pointer'}}/>
              <span><i class="ti ti-mail" style=${{fontSize:14,verticalAlign:'-2px',marginRight:4,color:'#ff00ee'}}></i>Email this report to ${client.name} on save</span>
            </label>
            <button class="btn-sec" onClick=${onClose}>Cancel</button>
            <button class="btn-pri" onClick=${submit} disabled=${saving}>${saving?h`<i class="ti ti-loader-2 spinner"></i> Saving${emailOnSave?' & sending':''}...`:emailOnSave?(existing?'Save changes & email':'Save & email report'):(existing?'Save changes':'Save report')}</button>
          </div>
        </div>
      </div>`;
    }

    function ReportsTab({client,showToast}){
      const[reports,setReports]=useState([]);const[loading,setLoading]=useState(true);const[showForm,setShowForm]=useState(false);
      const[editing,setEditing]=useState(null); // saved report row being edited
      const[resendingId,setResendingId]=useState(null);
      const[pdfBusyId,setPdfBusyId]=useState(null);
      useEffect(()=>{db('monthly_reports',`&client_id=eq.${client.id}&order=month.desc`).then(setReports).catch(_loadFail('monthly_reports')).finally(()=>setLoading(false));},[client.id]);
      // Compute post counts for a given report month — needed by the PDF body.
      const countsFor=async(report)=>{const[y,m]=report.month.split('-').map(Number);const start=`${y}-${String(m).padStart(2,'0')}-01`;const end=new Date(y,m,0);const endStr=`${y}-${String(m).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;const posts=await db('content',`&client_id=eq.${client.id}&post_date=gte.${start}&post_date=lte.${endStr}`).catch(()=>[]);return{total:posts.length,reel:posts.filter(p=>p.type==='reel').length,creative:posts.filter(p=>p.type==='creative').length,carousel:posts.filter(p=>p.type==='carousel').length,extra:posts.filter(p=>p.type==='extra').length};};
      // Open or generate-then-open the branded PDF. forceRegen=true rebuilds even
      // if pdf_url is already set (useful after editing notes etc.).
      const pdfReport=async(report,forceRegen=false)=>{
        if(pdfBusyId)return;
        if(report.pdf_url&&!forceRegen){window.open(report.pdf_url,'_blank','noopener');return;}
        setPdfBusyId(report.id);
        try{
          const counts=await countsFor(report);
          const out=await generateAndUploadReportPdf('social',report,client,counts);
          if(out.url){setReports(rs=>rs.map(r=>r.id===report.id?{...r,pdf_url:out.url,pdf_generated_at:new Date().toISOString()}:r));window.open(out.url,'_blank','noopener');showToast('PDF ready ✓');}
          else showToast('PDF failed: '+(out.error||'unknown'));
        }finally{setPdfBusyId(null);}
      };
      const deleteReport=async(id)=>{if(!confirm('Delete this report?'))return;await dbDelete('monthly_reports',id);setReports(rs=>rs.filter(r=>r.id!==id));showToast('Deleted');};
      const resendReport=async(r)=>{
        if(resendingId)return;
        if(!confirm(`Re-send the ${fmtMo(r.month)} report to ${client.name}?\n\nA gracious-tone email with all the KPIs, top posts, and your notes will go to the brand's contact email on file.`))return;
        setResendingId(r.id);
        try{
          const out=await sendMonthlyReportEmail(r.id);
          if(out.ok)showToast(`Report email re-sent to ${out.to||client.name} ✓`);
          else if(out.error==='no email on file for this client')showToast(`No contact email on file for ${client.name} — add one first`);
          else showToast(`Email failed: ${out.error||'unknown'}`);
        }finally{setResendingId(null);}
      };
      if(loading)return h`<div style=${{display:'flex',flexDirection:'column',gap:10}}>${[...Array(3)].map((_,i)=>h`<${Skel} key=${i} h=${80}/>`)}</div>`;
      return h`<div>
        <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
          <div><div style=${{fontSize:18,fontWeight:500,color:'var(--t1)'}}>Monthly reports</div><div style=${{fontSize:14,color:'var(--t2)',marginTop:3}}>Aruj fills metrics · PDF in one click</div></div>
          <button class="btn-pri" onClick=${()=>setShowForm(true)}><i class="ti ti-plus"></i>New report</button>
        </div>
        ${reports.length===0?h`<div class="empty"><i class="ti ti-file-analytics"></i><div class="empty-t">No reports yet for ${client.name}</div><div class="empty-s">Click "New report" to create the first one</div></div>`
        :h`<div>${reports.map(r=>h`<div key=${r.id} class="report-card"><div style=${{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}><div><div class="report-month">${fmtMo(r.month)}</div><div class="report-stats"><span><strong>${(r.total_reach||0).toLocaleString()}</strong> reach</span><span><strong>${r.engagement_rate||0}%</strong> engagement</span><span><strong>+${(r.new_followers||0).toLocaleString()}</strong> followers</span></div></div><div style=${{display:'flex',gap:8,alignItems:'center'}}><button class="icon-btn" onClick=${()=>setEditing(r)} title="Edit this report" style=${{padding:6}}><i class="ti ti-pencil" style=${{fontSize:15,color:'var(--t2)'}}></i></button><button class="icon-btn" onClick=${()=>resendReport(r)} disabled=${resendingId===r.id} title="Email this report to ${client.name}" style=${{padding:6}}>${resendingId===r.id?h`<i class="ti ti-loader-2 spinner" style=${{fontSize:15,color:'var(--t3)'}}></i>`:h`<i class="ti ti-mail-forward" style=${{color:'#ff00ee',fontSize:16}}></i>`}</button><button class="btn-pri" onClick=${()=>pdfReport(r)} disabled=${pdfBusyId===r.id} title=${r.pdf_url?'Open the generated PDF':'Generate the branded AMS PDF'} style=${{padding:'7px 14px',fontSize:13}}>${pdfBusyId===r.id?h`<i class="ti ti-loader-2 spinner"></i>`:h`<i class=${r.pdf_url?'ti ti-file-download':'ti ti-file-export'}></i>`}PDF</button>${r.pdf_url&&h`<button class="icon-btn" onClick=${()=>pdfReport(r,true)} disabled=${pdfBusyId===r.id} title="Regenerate PDF" style=${{padding:6}}><i class="ti ti-refresh" style=${{fontSize:14,color:'var(--t3)'}}></i></button>`}<button class="icon-btn" onClick=${()=>deleteReport(r.id)}><i class="ti ti-trash"></i></button></div></div></div>`)} </div>`}
        ${(showForm||editing)&&h`<${ReportForm} client=${client} existing=${editing} onClose=${()=>{setShowForm(false);setEditing(null);}} onSave=${r=>{setReports(rs=>rs.some(x=>x.id===r.id)?rs.map(x=>x.id===r.id?r:x):[r,...rs]);}} showToast=${showToast}/>`}
      </div>`;
    }

    return { ReportsTab, ReportForm };
  }
  window.AMS_REPORTS = { buildReports };
})();

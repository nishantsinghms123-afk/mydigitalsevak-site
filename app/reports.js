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
    const { React, h, useState, useEffect, db, dbInsert, dbDelete, rpcCall, SB_URL, _loadFail, Skel, fmtMo, compressImg, generateAndUploadReportPdf, sendMonthlyReportEmail, uploadReportImage, _rpPeriodLabel } = deps;
    const sessTok=()=>{try{return localStorage.getItem('ams_session_token')||'';}catch(_){return '';}};
    const periodLabel=(r)=>r.period_start&&r.period_end&&_rpPeriodLabel?_rpPeriodLabel(r.period_start,r.period_end):fmtMo(r.month);

    // ── Report builder (migration 161) ─────────────────────────────────────
    // Pick dates → the dashboard pulls Instagram (meta-report-pull, range mode) and its own
    // facts (report_period_data: posts, shoots, ad spend, followers) → Aruj attaches the
    // screenshots the report needs from the Instagram app and writes notes → save makes the
    // 4-page PDF (generateAMSReportHTML, report_data.v === 2). Save stays locked until every
    // required screenshot is attached. A new report's draft is kept in localStorage.
    const pad2=n=>String(n).padStart(2,'0');
    const ymd=d=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
    const PRESETS=[
      ['last_month','Last month',()=>{const t=new Date();return[ymd(new Date(t.getFullYear(),t.getMonth()-1,1)),ymd(new Date(t.getFullYear(),t.getMonth(),0))];}],
      ['this_month','This month',()=>{const t=new Date();return[ymd(new Date(t.getFullYear(),t.getMonth(),1)),ymd(t)];}],
      ['last_30','Last 30 days',()=>{const t=new Date();return[ymd(new Date(t.getFullYear(),t.getMonth(),t.getDate()-29)),ymd(t)];}],
      ['last_7','Last 7 days',()=>{const t=new Date();return[ymd(new Date(t.getFullYear(),t.getMonth(),t.getDate()-6)),ymd(t)];}],
    ];
    const nIN=v=>v==null||v===''?'—':Number(v).toLocaleString('en-IN');
    const pct=(c,p)=>(c==null||p==null||!Number(p))?null:Math.round((c-p)/Math.abs(p)*1000)/10;
    const istHour=ts=>{const d=new Date(Date.parse(ts)+5.5*3600000);return d.getUTCHours();};
    const ratio=x=>(Math.round(x*10)/10).toString().replace(/\.0$/,'');

    // Plain-language observations from the numbers; Aruj edits them before saving.
    // Drops (views down, fewer followers, posts missed) only when the report shows every change.
    function autoInsights(D){
      const out=[],ig=D.ig,media=(ig&&ig.media)||[],all=D.compare==='all';
      const withViews=media.filter(p=>p.views!=null);
      const reels=media.filter(p=>p.is_reel);
      if(reels.length&&withViews.length>reels.length){
        const all=withViews.reduce((s,p)=>s+p.views,0),rv=withViews.filter(p=>p.is_reel).reduce((s,p)=>s+p.views,0);
        if(all>0)out.push(`Reels were ${reels.length} of the ${media.length} posts published in this period but brought ${Math.round(rv/all*100)}% of their views.`);
      }
      const evening=media.filter(p=>p.reach!=null&&istHour(p.timestamp)>=17&&istHour(p.timestamp)<22),other=media.filter(p=>p.reach!=null&&!(istHour(p.timestamp)>=17&&istHour(p.timestamp)<22));
      if(evening.length>=2&&other.length>=2){
        const a=evening.reduce((s,p)=>s+p.reach,0)/evening.length,b=other.reduce((s,p)=>s+p.reach,0)/other.length;
        if(b>0&&a/b>=1.2)out.push(`Posts published between 5 and 10 pm reached ${ratio(a/b)}× more people than posts at other times.`);
        else if(a>0&&b/a>=1.2)out.push(`Posts published outside 5–10 pm reached ${ratio(b/a)}× more people than evening posts.`);
      }
      if(ig&&ig.cur){
        const v=pct(ig.cur.views,ig.prev&&ig.prev.views);
        if(v!=null&&(v>=5||(all&&v<=-5)))out.push(`Views were ${v>0?'up':'down'} ${Math.abs(v)}% on the previous period.`);
        const w=pct(ig.cur.website_clicks,ig.prev&&ig.prev.website_clicks);
        if(all&&w!=null&&w<=-5)out.push(`Website clicks fell ${Math.abs(w)}%. Worth checking the link in bio.`);
      }
      const F=D.followers||{};
      const g=pct(F.gained,F.prev_gained);
      if(g!=null&&(g>=10||(all&&g<=-10))&&F.prev_gained>0)out.push(`Followers grew ${Math.abs(g)}% ${g>0?'faster':'slower'} than in the previous period.`);
      const Dl=D.deliverables||{};
      if(all&&Dl.planned>Dl.posted)out.push(`${Dl.planned-Dl.posted} of ${Dl.planned} planned posts were not posted in this period.`);
      return out.slice(0,5);
    }
    function whyLine(best,list,key,noun){
      if(!best||best[key]==null)return'';
      const rest=list.filter(p=>p!==best&&p.id!==best.id&&p[key]!=null);
      if(!rest.length)return'';
      const avg=rest.reduce((s,p)=>s+p[key],0)/rest.length;
      if(!avg||best[key]/avg<1.2)return'';
      return`${ratio(best[key]/avg)}× the ${key==='views'?'views':'reach'} of your average ${noun} in this period.`;
    }

    function ReportBuilder({client,existing,onClose,onSave,showToast}){
      const draftKey='ams_rpt_draft_'+client.id;
      const draft=(()=>{if(existing)return null;try{return JSON.parse(localStorage.getItem(draftKey)||'null');}catch(_){return null;}})();
      const init=existing?{since:existing.period_start,until:existing.period_end,notes:existing.agency_notes||'',
          insights:((existing.report_data||{}).insights||[]).join('\n'),plan:((existing.report_data||{}).plan||[]).join('\n'),
          shots:Array.isArray(existing.screenshots)?existing.screenshots:[],manual:((existing.report_data||{}).ads||{}).manual||{}}
        :draft||(()=>{const[s,u]=PRESETS[0][2]();return{since:s,until:u,notes:'',insights:'',plan:'',shots:[],manual:{}};})();
      const[since,setSince]=useState(init.since);const[until,setUntil]=useState(init.until);
      const[data,setData]=useState(existing?existing.report_data:null);
      const[building,setBuilding]=useState(false);const[warn,setWarn]=useState([]);
      const[notes,setNotes]=useState(init.notes);const[insights,setInsights]=useState(init.insights);const[plan,setPlan]=useState(init.plan);
      const[shots,setShots]=useState(init.shots||[]);const[manual,setManual]=useState(init.manual||{});
      const[uploading,setUploading]=useState(null);const[saving,setSaving]=useState(false);const[emailOnSave,setEmailOnSave]=useState(!existing);
      const builtFor=data&&data.period?data.period.start+'|'+data.period.end:null;
      const stale=builtFor&&builtFor!==since+'|'+until;

      useEffect(()=>{if(existing)return;try{localStorage.setItem(draftKey,JSON.stringify({since,until,notes,insights,plan,shots,manual}));}catch(_){}},[since,until,notes,insights,plan,shots,manual]);
      // Every number is editable: edits go straight into `data` (what the PDF draws).
      const upd=fn=>setData(d=>{const c=JSON.parse(JSON.stringify(d||{}));fn(c);return c;});
      const numOf=e=>e.target.value===''?null:Number(e.target.value);
      useEffect(()=>{if(draft&&draft.since&&draft.until)build();},[]);

      const build=async()=>{
        if(!since||!until||until<since){showToast('Pick a start date and an end date after it');return;}
        setBuilding(true);setWarn([]);
        const w=[];
        try{
          const[dash,meta]=await Promise.all([
            rpcCall('report_period_data',{p_client_id:client.id,p_start:since,p_end:until}).catch(e=>{w.push(/PGRST202|could not find|does not exist/i.test(String(e&&e.message))?'Apply migration 161 in Supabase first — deliverables, shoots, ad spend and followers need it.':'Could not load deliverables / shoots / ad spend: '+(e.message||'error'));return null;}),
            fetch(`${SB_URL}/functions/v1/meta-report-pull`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session_token:sessTok(),client_id:client.id,since,until})}).then(r=>r.json()).catch(()=>null),
          ]);
          let ig=null;
          if(meta&&meta.ok&&meta.instagram){
            const m=meta.instagram;
            // the VPS function may hand back its internal storage host; point it at the public one
            const fix=p=>p&&p.img?{...p,img:String(p.img).replace(/^https?:\/\/kong(:\d+)?/,SB_URL)}:p;
            ig={username:m.username,followers_now:m.followers_now,cur:m.cur||{},prev:m.prev||{},media:(m.media||[]).map(fix),
              best_reel:fix(m.best_reel),best_post:fix(m.best_post),runners_up:(m.runners_up||[]).map(fix),new_followers_meta:m.new_followers_meta};
            if(ig.best_reel)ig.best_reel.why=whyLine(ig.best_reel,ig.media.filter(p=>p.is_reel),'views','reel');
            if(ig.best_post)ig.best_post.why=whyLine(ig.best_post,ig.media.filter(p=>!p.is_reel),'reach','post');
            if(m.cur&&m.cur.error&&m.cur.windows===0)w.push('Meta did not return account numbers: '+m.cur.error);
          }else if(meta&&meta.ok&&meta.instagram_error){
            w.push(meta.instagram_error==='no_instagram_account'?'No Instagram account is connected for this brand (Settings → Connected accounts). You can type the numbers in by hand below.'
              :meta.instagram_error==='no_token'?'The Instagram connection has expired. Reconnect it in Settings → Connected accounts, or type the numbers in by hand below.'
              :'Instagram: '+meta.instagram_error);
          }else{
            w.push(meta&&meta.error?'Instagram pull failed: '+meta.error:'Instagram pull failed. Try Build again in a minute.');
          }
          const F0=(dash&&dash.followers)||{};
          const F={start:F0.start??null,end:F0.end??null,series:F0.series||[],source:'snapshots'};
          const today=ymd(new Date());
          if(F.end==null&&ig&&ig.followers_now!=null&&until>=ymd(new Date(Date.now()-86400000)))F.end=ig.followers_now;
          F.gained=F.start!=null&&F.end!=null?F.end-F.start:null;
          F.prev_gained=F0.prev_start!=null&&F0.prev_end!=null?F0.prev_end-F0.prev_start:null;
          if(F.gained==null&&ig&&ig.new_followers_meta!=null){F.gained=ig.new_followers_meta;F.source='meta';}
          if(F.gained==null)w.push('Followers gained: the dashboard has no daily follower count for '+(F.start==null?since:until)+' and Meta only keeps the last 30 days. Followers will show as "—".');
          if(!ig)ig={manual:true,cur:{},prev:{},media:[],runners_up:[]};
          const D={v:2,period:{start:since,end:until},prev:dash?dash.prev_period:null,built_at:new Date().toISOString(),
            compare:(data&&data.compare)||'up',hide:(data&&data.hide)||{},
            ig,followers:F,deliverables:(dash&&dash.deliverables)||{},shoots:(dash&&dash.shoots)||[],shoots_open:dash?dash.shoots_open:0,
            ads:(dash&&dash.ads)||{total:0,campaigns:[]},today};
          // paid ads straight from Meta for these exact dates, when an ad account is linked (migration 162)
          if(meta&&meta.ads&&meta.ads.cur){
            const M=meta.ads;
            D.ads={...D.ads,logged:D.ads.total,total:Math.round(M.cur.spend*100)/100,prev_total:Math.round(M.prev.spend*100)/100,meta:M};
            setManual(m=>({...m,campaigns:m.campaigns??M.cur.campaigns,reach:m.reach??(M.cur.reach||null),clicks:m.clicks??(M.cur.clicks||null)}));
            if(M.error)w.push('Meta ads: '+M.error);
          }
          ['reel','creative','carousel','extra'].forEach(k=>{const bt=D.deliverables.by_type=D.deliverables.by_type||{};if(!bt[k])bt[k]={planned:0,posted:0};});
          setData(D);setWarn(w);
          if(!insights.trim())setInsights(autoInsights(D).join('\n'));
        }finally{setBuilding(false);}
      };

      const ig=data&&data.ig;
      const adTotal=data&&!(data.hide&&data.hide.ads)?(Number((data.ads||{}).total)||0)+(Number(manual.extra_spend)||0):0;
      const lbl=since&&until&&_rpPeriodLabel?_rpPeriodLabel(since,until):'';
      const SLOTS=data?[
        {slot:'overview',title:'Account insights overview',how:h`Profile → Professional dashboard → <b>Account insights</b> → set the dates to ${lbl}.`,req:true},
        {slot:'followers',title:'Followers',how:h`Account insights → tap <b>Followers</b> (same dates).`,req:true},
        {slot:'ads',title:'Meta Ads Manager',how:adTotal>0?h`Ads Manager → Campaigns, dates set to ${lbl}, showing spend.`:'Not needed: no ad spend for these dates.',req:adTotal>0},
        {slot:'reel',title:'Best reel insights',how:ig&&ig.best_reel?h`Open the reel <b>"${(ig.best_reel.title||'no caption').slice(0,60)}"</b> → View insights.`:'Not needed: no reel was published in this period.',req:!!(ig&&ig.best_reel)},
        {slot:'post',title:'Best post insights',how:ig&&ig.best_post?h`Open the post <b>"${(ig.best_post.title||'no caption').slice(0,60)}"</b> → View insights.`:'Not needed: no post was published in this period.',req:!!(ig&&ig.best_post)},
      ]:[];
      const has=s=>shots.some(x=>x.slot===s&&x.url);
      const missing=SLOTS.filter(s=>s.req&&!has(s.slot));
      const extras=shots.filter(s=>s.slot==='extra');

      const pickFile=(slot,replaceUrl)=>{
        const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
        inp.onchange=async()=>{const f=inp.files&&inp.files[0];if(!f)return;setUploading(slot);
          try{const url=await uploadReportImage(f,client.id);if(!url)throw new Error('no url');
            setShots(ss=>slot==='extra'?(replaceUrl?ss.map(x=>x.url===replaceUrl?{...x,url}:x):[...ss,{slot,url,label:''}]):[...ss.filter(x=>x.slot!==slot),{slot,url,label:(SLOTS.find(s=>s.slot===slot)||{}).title||''}]);
          }catch(e){showToast('Upload failed: '+(e.message||'try again'));}finally{setUploading(null);}};
        inp.click();
      };
      const removeShot=(slot,url)=>setShots(ss=>ss.filter(x=>!(x.slot===slot&&(slot!=='extra'||x.url===url))));

      const save=async()=>{
        if(!data){showToast('Build the report first');return;}
        if(stale){showToast('The dates changed: press Build again first');return;}
        if(missing.length){showToast(`Attach ${missing.length} more screenshot${missing.length===1?'':'s'} first`);return;}
        setSaving(true);
        try{
          let me={};try{me=JSON.parse(localStorage.getItem('ams_user')||'{}')||{};}catch(_){}
          const igOut=data.ig;
          const D={...data,ig:igOut,ads:{...data.ads,manual},insights:insights.split('\n').map(s=>s.trim()).filter(Boolean),
            plan:plan.split('\n').map(s=>s.trim()).filter(Boolean),author:{name:me.name||'',role:me.title||me.designation||''}};
          delete D.today;
          const cur=(igOut&&igOut.cur)||{};
          const tops=[igOut&&igOut.best_reel,igOut&&igOut.best_post,...((igOut&&igOut.runners_up)||[])].filter(Boolean).slice(0,3);
          const eng=p=>p&&p.reach?Math.round(((p.likes||0)+(p.comments||0)+(p.saves||0)+(p.shares||0))/p.reach*1000)/10:0;
          const row={month:since.slice(0,7)+'-01',period_start:since,period_end:until,report_data:D,screenshots:shots,agency_notes:notes,
            total_reach:Number(cur.reach)||0,total_impressions:Number(cur.views)||0,
            engagement_rate:cur.reach&&cur.total_interactions!=null?Math.round(cur.total_interactions/cur.reach*1000)/10:0,
            new_followers:Math.max(0,Number(D.followers&&D.followers.gained)||0),profile_visits:Number(cur.profile_views)||0,
            website_clicks:Number(cur.website_clicks)||0,story_reach:0};
          [1,2,3].forEach(i=>{const p=tops[i-1];row['top_post_'+i+'_title']=p?(p.title||'(no caption)'):'';row['top_post_'+i+'_reach']=p?(p.reach||0):0;row['top_post_'+i+'_engagement']=eng(p);row['top_post_'+i+'_image']=p&&p.img?p.img:null;});
          let saved;
          if(existing){
            const out=await rpcCall('report_update',{p_id:existing.id,p_patch:row});
            saved=(out&&out.id)?out:{...existing,...row};
          }else{
            const rows=await dbInsert('monthly_reports',[{...row,client_id:client.id}]);
            saved=rows[0];
          }
          let pdfOk=false;
          if(saved&&saved.id){const pdf=await generateAndUploadReportPdf('social',saved,client,{});pdfOk=!!pdf.url;if(pdf.url)saved={...saved,pdf_url:pdf.url};}
          if(!existing)try{localStorage.removeItem(draftKey);}catch(_){}
          onSave(saved);
          if(emailOnSave&&saved&&saved.id){
            const out=await sendMonthlyReportEmail(saved.id);
            if(out.ok)showToast(`Report saved${pdfOk?' with PDF':''} & emailed to ${out.to||client.name} ✓`);
            else if(out.error==='no email on file for this client')showToast('Report saved ✓ — no contact email on file, email skipped');
            else showToast(`Report saved ✓ — email failed (${out.error||'unknown'})`);
          }else showToast(`Report saved${pdfOk?' · PDF ready':' · PDF failed, use the PDF button to retry'} ✓`);
          onClose();
        }catch(e){showToast('Save failed: '+(e.message||'try again'));console.error(e);}finally{setSaving(false);}
      };

      const sec=(title,sub,body)=>h`<div style=${{borderTop:'1px solid var(--border)',paddingTop:14,marginTop:14}}>
        <div style=${{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:8,marginBottom:10}}><div style=${{fontSize:14,fontWeight:600,color:'var(--t1)'}}>${title}</div>${sub&&h`<div style=${{fontSize:11.5,color:'var(--t3)'}}>${sub}</div>`}</div>${body}</div>`;
      const mode=(data&&data.compare)||'all';
      const hidden=k=>!!(data&&data.hide&&data.hide[k]);
      const showIn=(k,label)=>h`<label title="Show this in the PDF" style=${{display:'inline-flex',alignItems:'center',gap:4,fontSize:11.5,fontWeight:400,color:'var(--t2)',cursor:'pointer',whiteSpace:'nowrap'}}><input type="checkbox" checked=${!hidden(k)} onChange=${e=>{const on=e.target.checked;upd(c=>{c.hide=c.hide||{};c.hide[k]=!on;});}} style=${{accentColor:'#ff00ee',cursor:'pointer'}}/>${label||'In PDF'}</label>`;
      // what the PDF will print for a change: nothing for a drop unless "Show all changes"
      const deltaEl=(c,p)=>{const d=pct(c,p);if(d==null)return null;const shown=mode==='all'||(mode==='up'&&d>=0);
        return h`<span style=${{fontSize:11,fontWeight:600,color:!shown?'var(--t3)':d>=0?'#15803d':'#b91c1c',textDecoration:shown?'none':'line-through'}} title=${shown?'Printed in the PDF':'Hidden in the PDF'}>${d>=0?'▲':'▼'} ${Math.abs(d)}%</span>`;};
      const numIn=(val,on,big,ph)=>h`<input class="fi" type="number" value=${val??''} placeholder=${ph||'—'} onInput=${on} style=${big?{padding:'5px 8px',fontSize:16,fontWeight:600,marginTop:4}:{padding:'3px 6px',fontSize:12,width:96}}/>`;
      const tileBox=(k,children)=>h`<div style=${{background:'var(--bg)',borderRadius:8,padding:'10px 12px',opacity:k&&hidden(k)?.45:1}}>${children}</div>`;
      const tileHead=(l,k)=>h`<div style=${{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6}}><span style=${{fontSize:10.5,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.04em'}}>${l}</span>${k&&showIn(k)}</div>`;
      const vsRow=(prevVal,onPrev,curVal)=>h`<div style=${{display:'flex',alignItems:'center',gap:6,marginTop:6,fontSize:11.5,color:'var(--t3)'}}>vs ${numIn(prevVal,onPrev,false,'previous')} ${deltaEl(curVal,prevVal)}</div>`;
      const igTile=(key,l)=>tileBox(key,h`${tileHead(l,key)}${numIn(cur[key],e=>{const v=numOf(e);upd(c=>{c.ig.cur[key]=v;});},true)}${mode!=='none'&&vsRow(prev[key],e=>{const v=numOf(e);upd(c=>{c.ig.prev=c.ig.prev||{};c.ig.prev[key]=v;});},cur[key])}`);
      const grid3={display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:8};
      const cur=(ig&&ig.cur)||{},prev=(ig&&ig.prev)||{};
      const F=(data&&data.followers)||{},Dl=(data&&data.deliverables)||{},A=(data&&data.ads)||{};
      const TYPES=[['reel','Reels'],['creative','Static posts'],['carousel','Carousels'],['extra','Stories & extras']];
      const setType=(k,f,v)=>upd(c=>{const bt=c.deliverables.by_type=c.deliverables.by_type||{};bt[k]={...(bt[k]||{planned:0,posted:0}),[f]:v||0};
        c.deliverables.planned=Object.values(bt).reduce((s,t)=>s+(Number(t.planned)||0),0);c.deliverables.posted=Object.values(bt).reduce((s,t)=>s+(Number(t.posted)||0),0);});
      const setFol=(f,v)=>upd(c=>{const x=c.followers=c.followers||{};x[f]=v;
        if((f==='start'||f==='end')&&x.start!=null&&x.end!=null)x.gained=x.end-x.start;if(f!=='prev_gained')x.source='manual';});
      const setShoot=(i,f,v)=>upd(c=>{c.shoots[i]={...c.shoots[i],[f]:v};});
      const pickCover=slot=>{const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
        inp.onchange=async()=>{const f=inp.files&&inp.files[0];if(!f)return;setUploading('cover-'+slot);
          try{const url=await uploadReportImage(f,client.id);if(url)upd(c=>{c.ig[slot]={...c.ig[slot],img:url};});}
          catch(e){showToast('Upload failed: '+(e.message||'try again'));}finally{setUploading(null);}};inp.click();};
      const bestEd=(slot,kind)=>{const p=ig&&ig[slot];const list=((ig&&ig.media)||[]).filter(m=>kind==='reel'?m.is_reel:!m.is_reel);
        const choose=id=>{const m=list.find(x=>x.id===id);if(m)upd(c=>{c.ig[slot]={...m,img:m.img||null,why:''};});};
        const setP=(f,v)=>upd(c=>{c.ig[slot]={...c.ig[slot],[f]:v};});
        const mets=kind==='reel'?[['views','Views'],['reach','Reach'],['likes','Likes'],['saves','Saves'],['shares','Shares'],['comments','Comments']]:[['reach','Reach'],['likes','Likes'],['saves','Saves'],['shares','Shares'],['comments','Comments'],['views','Views']];
        return h`<div style=${{background:'var(--bg)',borderRadius:8,padding:10}}>
          <div style=${{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:p?8:0}}>
            <span style=${{fontSize:10.5,fontWeight:700,color:'#A8009C',textTransform:'uppercase',letterSpacing:'.05em',marginRight:'auto'}}>${kind==='reel'?'Best reel':'Best post'}</span>
            ${list.length>0&&h`<select class="fi fi-select" style=${{width:'auto',maxWidth:260,padding:'4px 8px',fontSize:12}} value="" onChange=${e=>choose(e.target.value)}>
              <option value="">Pick another ${kind}…</option>${list.map(m=>h`<option key=${m.id} value=${m.id}>${(m.title||'(no caption)').slice(0,40)} · ${kind==='reel'?nIN(m.views)+' views':nIN(m.reach)+' reach'}</option>`)}</select>`}
            ${p?h`<button class="btn-sec" style=${{padding:'4px 10px',fontSize:12}} onClick=${()=>upd(c=>{c.ig[slot]=null;})}>Leave out</button>`
              :h`<button class="btn-sec" style=${{padding:'4px 10px',fontSize:12}} onClick=${()=>upd(c=>{c.ig[slot]={id:'manual-'+slot,title:'',is_reel:kind==='reel'};})}>Add by hand</button>`}
          </div>
          ${!p?h`<div style=${{fontSize:12.5,color:'var(--t3)'}}>Not in the PDF.</div>`:h`<div style=${{display:'flex',gap:12,alignItems:'flex-start'}}>
            <div style=${{display:'flex',flexDirection:'column',gap:6,alignItems:'center',flexShrink:0}}>
              <div style=${{width:64,height:88,borderRadius:6,background:p.img?`center/cover url('${p.img}')`:'repeating-linear-gradient(135deg,#fff 0 6px,#fdf2fc 6px 12px)',border:'1px solid var(--border)'}}></div>
              <button class="btn-sec" style=${{padding:'3px 8px',fontSize:11}} disabled=${!!uploading} onClick=${()=>pickCover(slot)}>${uploading==='cover-'+slot?h`<i class="ti ti-loader-2 spinner"></i>`:p.img?'Change image':'Add image'}</button>
            </div>
            <div style=${{flex:1,minWidth:0,display:'flex',flexDirection:'column',gap:6}}>
              <input class="fi" placeholder="Title shown in the PDF" value=${p.title||''} onInput=${e=>setP('title',e.target.value)} style=${{padding:'5px 8px',fontSize:13}}/>
              <div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(96px,1fr))',gap:6}}>${mets.map(([k,l])=>h`<div key=${k}><div style=${{fontSize:10,color:'var(--t3)',textTransform:'uppercase'}}>${l}</div>${numIn(p[k],e=>setP(k,numOf(e)))}</div>`)}</div>
              <input class="fi" placeholder="One line on why it worked (optional)" value=${p.why||''} onInput=${e=>setP('why',e.target.value)} style=${{padding:'5px 8px',fontSize:12}}/>
              ${p.permalink&&h`<a href=${p.permalink} target="_blank" rel="noopener" style=${{fontSize:11.5,color:'#A8009C'}}>Open on Instagram</a>`}
            </div></div>`}
        </div>`;};
      const ta=(val,set,rows,ph)=>h`<textarea class="fi" rows=${rows} placeholder=${ph} value=${val} onInput=${e=>set(e.target.value)}></textarea>`;
      const shotRow=(s)=>{const got=shots.find(x=>x.slot===s.slot&&x.url);const st=got?'done':s.req?'todo':'na';
        return h`<div key=${s.slot} style=${{display:'flex',gap:12,alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          <span style=${{width:24,height:24,borderRadius:'50%',flexShrink:0,display:'grid',placeItems:'center',fontSize:12,fontWeight:700,background:st==='done'?'#dcfce7':st==='todo'?'#fee2e2':'var(--bg)',color:st==='done'?'#15803d':st==='todo'?'#b91c1c':'var(--t3)'}}>${st==='done'?'✓':st==='todo'?'!':'–'}</span>
          ${got&&h`<a href=${got.url} target="_blank" rel="noopener"><img src=${got.url} style=${{width:34,height:60,objectFit:'cover',borderRadius:5,border:'1px solid var(--border)',display:'block'}}/></a>`}
          <div style=${{flex:1,minWidth:0}}><div style=${{fontSize:13,fontWeight:600,color:'var(--t1)'}}>${s.title}${s.req?'':h` <span style=${{fontWeight:400,color:'var(--t3)'}}>(optional)</span>`}</div><div style=${{fontSize:12,color:'var(--t2)',lineHeight:1.45}}>${s.how}</div></div>
          ${got&&h`<button class="btn-sec" style=${{padding:'5px 10px',fontSize:12}} onClick=${()=>removeShot(s.slot)}>Remove</button>`}
          <button class=${got?'btn-sec':'btn-pri'} style=${{padding:'6px 12px',fontSize:12}} disabled=${!!uploading} onClick=${()=>pickFile(s.slot)}>${uploading===s.slot?h`<i class="ti ti-loader-2 spinner"></i>`:got?'Replace':'Upload'}</button>
        </div>`;};

      return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget&&!saving)onClose()}}>
        <div class="modal-box" style=${{maxWidth:880,width:'calc(100vw - 32px)'}}>
          <div class="modal-head"><div><div style=${{fontSize:16,fontWeight:600}}>${existing?'Edit report':'New report'}</div><div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>${client.name}${lbl?' · '+lbl:''}</div></div><button class="icon-btn" onClick=${onClose} disabled=${saving}><i class="ti ti-x"></i></button></div>
          <div class="modal-body">
            <div style=${{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}}>
              <div class="fi-group" style=${{marginBottom:0}}><div class="fi-lbl">From</div><input class="fi" type="date" value=${since||''} max=${until||undefined} onChange=${e=>setSince(e.target.value)}/></div>
              <div class="fi-group" style=${{marginBottom:0}}><div class="fi-lbl">To</div><input class="fi" type="date" value=${until||''} min=${since||undefined} onChange=${e=>setUntil(e.target.value)}/></div>
              <button class="btn-pri" onClick=${build} disabled=${building}>${building?h`<i class="ti ti-loader-2 spinner"></i> Building…`:h`<i class="ti ti-wand"></i>${data?'Build again':'Build report'}`}</button>
            </div>
            <div style=${{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>${PRESETS.map(([k,l,f])=>h`<button key=${k} class="btn-sec" style=${{padding:'4px 10px',fontSize:12}} onClick=${()=>{const[s,u]=f();setSince(s);setUntil(u);}}>${l}</button>`)}</div>
            ${stale&&h`<div class="month-auto" style=${{marginTop:10,background:'#fef3c7',color:'#92400e'}}><i class="ti ti-alert-triangle"></i><div>The dates changed. Press <b>Build again</b> so the numbers match.</div></div>`}
            ${warn.map((m,i)=>h`<div key=${i} class="month-auto" style=${{marginTop:10,background:'#fef3c7',color:'#92400e'}}><i class="ti ti-info-circle" style=${{flexShrink:0}}></i><div>${m}</div></div>`)}
            ${!data&&!building&&h`<div style=${{marginTop:18,fontSize:13,color:'var(--t2)',lineHeight:1.6}}>Pick the dates and press <b>Build report</b>. The dashboard fills in the Instagram numbers, content delivered, shoots, ad spend and followers. Then attach the screenshots it asks for.</div>`}
            ${data&&h`<div>
              <div style=${{marginTop:14,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',background:'rgba(255,0,238,.06)',borderRadius:8,padding:'10px 12px'}}>
                <span style=${{fontSize:13,fontWeight:600,color:'var(--t1)'}}>Changes vs the previous period in the PDF</span>
                <select class="fi fi-select" style=${{width:'auto',padding:'5px 8px',fontSize:12.5}} value=${mode} onChange=${e=>{const v=e.target.value;upd(c=>{c.compare=v;});}}>
                  <option value="up">Show only increases (hide drops)</option>
                  <option value="all">Show all changes</option>
                  <option value="none">Do not compare</option>
                </select>
                <span style=${{fontSize:11.5,color:'var(--t3)'}}>Every number below can be changed. Untick "In PDF" to leave one out.</span>
              </div>
              ${sec('Instagram numbers',ig&&ig.manual?'Instagram not connected: type them in':(cur.reach_approx?'Reach over 30 days is a sum of 30-day blocks':'From Meta'+(ig&&ig.username?' · @'+ig.username:'')),
                h`<div style=${grid3}>${igTile('views','Views')}${igTile('reach','Accounts reached')}${igTile('profile_views','Profile visits')}${igTile('total_interactions','Interactions')}${igTile('website_clicks','Website clicks')}</div>`)}
              ${sec(h`Followers <span style=${{marginLeft:8}}>${showIn('followers','In PDF')}</span> <span style=${{marginLeft:8}}>${showIn('chart','Daily chart')}</span>`,F.source==='meta'?'From Meta: new followers, before unfollows':F.source==='manual'?'Edited by hand':'From the daily follower count',
                h`<div style=${{...grid3,opacity:hidden('followers')?.45:1}}>
                  ${tileBox(null,h`${tileHead('Gained')}${numIn(F.gained,e=>setFol('gained',numOf(e)),true)}${mode!=='none'&&vsRow(F.prev_gained,e=>setFol('prev_gained',numOf(e)),F.gained)}`)}
                  ${tileBox(null,h`${tileHead('Start')}${numIn(F.start,e=>setFol('start',numOf(e)),true)}`)}
                  ${tileBox(null,h`${tileHead('End')}${numIn(F.end,e=>setFol('end',numOf(e)),true)}`)}
                </div>`)}
              ${sec(h`Content delivered <span style=${{marginLeft:8}}>${showIn('content','In PDF')}</span>`,`${nIN(Dl.posted)} posted of ${nIN(Dl.planned)} planned`,
                h`<div style=${{...grid3,opacity:hidden('content')?.45:1}}>${TYPES.map(([k,l])=>{const t=(Dl.by_type||{})[k]||{planned:0,posted:0};return h`<div key=${k}>${tileBox(null,h`${tileHead(l)}
                  <div style=${{display:'flex',alignItems:'center',gap:6,marginTop:6,fontSize:11.5,color:'var(--t3)'}}>Posted ${numIn(t.posted,e=>setType(k,'posted',numOf(e)))}</div>
                  <div style=${{display:'flex',alignItems:'center',gap:6,marginTop:6,fontSize:11.5,color:'var(--t3)'}}>Planned ${numIn(t.planned,e=>setType(k,'planned',numOf(e)))}</div>`)}</div>`;})}
                  ${mode!=='none'&&tileBox(null,h`${tileHead('Previous period')}<div style=${{display:'flex',alignItems:'center',gap:6,marginTop:6,fontSize:11.5,color:'var(--t3)'}}>Posted ${numIn(Dl.prev_posted,e=>{const v=numOf(e);upd(c=>{c.deliverables.prev_posted=v;});})}</div>`)}</div>
                ${(Dl.planned||0)>(Dl.posted||0)&&h`<div style=${{fontSize:12,color:'var(--t2)',marginTop:8}}>Counted from posts marked <b>Posted</b> in the calendar. Type the real numbers if some went live without being marked.</div>`}`)}
              ${sec(h`Shoots done <span style=${{marginLeft:8}}>${showIn('shoots','In PDF')}</span>`,`${(data.shoots||[]).length} in the report${data.shoots_open?' · '+data.shoots_open+' shoot task(s) still open':''}`,
                h`<div style=${{display:'flex',flexDirection:'column',gap:6,opacity:hidden('shoots')?.45:1}}>
                  ${(data.shoots||[]).map((s,i)=>h`<div key=${s.id||i} style=${{display:'grid',gridTemplateColumns:'140px 1fr 130px 90px 32px',gap:6,alignItems:'center'}}>
                    <input class="fi" type="date" value=${s.date||''} onChange=${e=>setShoot(i,'date',e.target.value)} style=${{padding:'4px 6px',fontSize:12}}/>
                    <input class="fi" placeholder="What was shot" value=${s.title||''} onInput=${e=>setShoot(i,'title',e.target.value)} style=${{padding:'4px 8px',fontSize:12}}/>
                    <input class="fi" placeholder="Shot by" value=${s.by||''} onInput=${e=>setShoot(i,'by',e.target.value)} style=${{padding:'4px 8px',fontSize:12}}/>
                    <input class="fi" type="number" min="0" placeholder="Posts" title="Posts made from this shoot" value=${s.posts??''} onInput=${e=>setShoot(i,'posts',numOf(e))} style=${{padding:'4px 6px',fontSize:12}}/>
                    <button class="icon-btn" title="Remove" onClick=${()=>upd(c=>{c.shoots.splice(i,1);})}><i class="ti ti-x"></i></button></div>`)}
                  <button class="btn-sec" style=${{alignSelf:'flex-start',fontSize:12,padding:'5px 10px'}} onClick=${()=>upd(c=>{c.shoots=c.shoots||[];c.shoots.push({id:'m'+Date.now(),date:until,title:'',by:'',posts:null});})}><i class="ti ti-plus"></i> Add a shoot</button>
                </div>`)}
              ${sec(h`Ad spend <span style=${{marginLeft:8}}>${showIn('ads','In PDF')}</span>`,A.meta?`From Meta Ads for these dates${A.meta.reach_summed?' · reach added across ad accounts':''}`:`₹${nIN(A.logged!=null?A.logged:A.total)} logged in the Ads tab for these dates · link the ad account to fill this in by itself`,
                h`<div style=${{...grid3,opacity:hidden('ads')?.45:1}}>
                  <div><div class="fi-lbl">Total spend (₹, before GST)</div>${numIn(A.total,e=>{const v=numOf(e);upd(c=>{c.ads=c.ads||{};if(c.ads.logged==null)c.ads.logged=c.ads.total||0;c.ads.total=v;});},true)}</div>
                  ${mode!=='none'&&h`<div><div class="fi-lbl">Previous period spend (₹)</div>${numIn(A.prev_total,e=>{const v=numOf(e);upd(c=>{c.ads=c.ads||{};c.ads.prev_total=v;});},true)}</div>`}
                  <div><div class="fi-lbl">Campaigns</div>${numIn(manual.campaigns!=null?manual.campaigns:((A.campaigns||[]).length||null),e=>{const v=numOf(e);setManual(m=>({...m,campaigns:v}));},true)}</div>
                  <div><div class="fi-lbl">People reached by ads</div>${numIn(manual.reach,e=>{const v=numOf(e);setManual(m=>({...m,reach:v}));},true)}</div>
                  <div><div class="fi-lbl">Link clicks</div>${numIn(manual.clicks,e=>{const v=numOf(e);setManual(m=>({...m,clicks:v}));},true)}</div>
                </div>`)}
              ${sec('Best content','Picked automatically · change anything',h`<div style=${{display:'flex',flexDirection:'column',gap:8}}>${bestEd('best_reel','reel')}${bestEd('best_post','post')}
                ${((ig&&ig.runners_up)||[]).length>0&&h`<div style=${{fontSize:12,color:'var(--t2)'}}>Also in the PDF: ${(ig.runners_up||[]).map((r,i)=>h`<span key=${r.id||i} style=${{display:'inline-flex',alignItems:'center',gap:4,background:'var(--bg)',borderRadius:12,padding:'2px 4px 2px 10px',margin:'2px 4px 2px 0'}}>${(r.title||'(no caption)').slice(0,30)}<button class="icon-btn" style=${{padding:2}} title="Leave out" onClick=${()=>upd(c=>{c.ig.runners_up.splice(i,1);})}><i class="ti ti-x" style=${{fontSize:12}}></i></button></span>`)}</div>`}
              </div>`)}
              ${sec('Screenshots from the Instagram app',missing.length?`${missing.length} still needed`:'All attached ✓',h`<div>
                <div style=${{fontSize:12.5,color:'var(--t2)',marginBottom:4}}>In the Instagram app, set the date range to <b>${lbl}</b> before each screenshot.</div>
                ${SLOTS.map(shotRow)}
                ${extras.map((x,i)=>h`<div key=${x.url} style=${{display:'flex',gap:12,alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                  <img src=${x.url} style=${{width:34,height:60,objectFit:'cover',borderRadius:5,border:'1px solid var(--border)'}}/>
                  <input class="fi" style=${{flex:1}} placeholder="What is this? e.g. Top locations" value=${x.label||''} onInput=${e=>{const v=e.target.value;setShots(ss=>ss.map(y=>y.url===x.url?{...y,label:v}:y));}}/>
                  <button class="btn-sec" style=${{padding:'5px 10px',fontSize:12}} onClick=${()=>removeShot('extra',x.url)}>Remove</button></div>`)}
                ${extras.length<4&&h`<button class="btn-sec" style=${{marginTop:10,fontSize:12}} disabled=${!!uploading} onClick=${()=>pickFile('extra')}>${uploading==='extra'?h`<i class="ti ti-loader-2 spinner"></i>`:h`<i class="ti ti-plus"></i>`} Add an extra screenshot (optional, up to 4)</button>`}
              </div>`)}
              ${sec('What the numbers tell us','One point per line · suggested from the numbers, edit freely',ta(insights,setInsights,5,'One observation per line'))}
              ${sec('Notes from the account manager','Shown in the PDF with your name',ta(notes,setNotes,4,'Highlights, what worked, what we change next…'))}
              ${sec('Plan for the next period','One point per line',ta(plan,setPlan,3,'e.g. One behind-the-scenes reel every week'))}
            </div>`}
          </div>
          <div class="modal-foot" style=${{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <label style=${{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--t2)',cursor:'pointer',marginRight:'auto'}}>
              <input type="checkbox" checked=${emailOnSave} onChange=${e=>setEmailOnSave(e.target.checked)} style=${{accentColor:'#ff00ee',cursor:'pointer'}}/>
              <span>Email the report to ${client.name} on save</span>
            </label>
            ${data&&missing.length>0&&h`<span style=${{fontSize:12.5,fontWeight:600,color:'#b91c1c'}}>Attach ${missing.length} more screenshot${missing.length===1?'':'s'}</span>`}
            <button class="btn-sec" onClick=${onClose} disabled=${saving}>Cancel</button>
            <button class="btn-pri" onClick=${save} disabled=${saving||building||!data||stale||missing.length>0}>${saving?h`<i class="ti ti-loader-2 spinner"></i> Saving…`:emailOnSave?'Save, make PDF & email':'Save & make PDF'}</button>
          </div>
        </div>
      </div>`;
    }

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
        if(!confirm(`Re-send the ${periodLabel(r)} report to ${client.name}?\n\nA gracious-tone email with all the KPIs, top posts, and your notes will go to the brand's contact email on file.`))return;
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
          <div><div style=${{fontSize:18,fontWeight:500,color:'var(--t1)'}}>Reports</div><div style=${{fontSize:14,color:'var(--t2)',marginTop:3}}>Pick any dates · numbers fill in · add the Instagram screenshots · 4-page PDF</div></div>
          <button class="btn-pri" onClick=${()=>setShowForm(true)}><i class="ti ti-plus"></i>New report</button>
        </div>
        ${reports.length===0?h`<div class="empty"><i class="ti ti-file-analytics"></i><div class="empty-t">No reports yet for ${client.name}</div><div class="empty-s">Click "New report" to create the first one</div></div>`
        :h`<div>${reports.map(r=>h`<div key=${r.id} class="report-card"><div style=${{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}><div><div class="report-month">${periodLabel(r)}${r.report_data&&r.report_data.v===2&&h` <span style=${{fontSize:11,fontWeight:500,color:'#A8009C',background:'rgba(255,0,238,.12)',borderRadius:10,padding:'2px 8px',marginLeft:6,verticalAlign:'2px'}}>${(r.screenshots||[]).length} screenshots</span>`}</div><div class="report-stats"><span><strong>${(r.total_reach||0).toLocaleString()}</strong> reach</span><span><strong>${r.engagement_rate||0}%</strong> engagement</span><span><strong>+${(r.new_followers||0).toLocaleString()}</strong> followers</span></div></div><div style=${{display:'flex',gap:8,alignItems:'center'}}><button class="icon-btn" onClick=${()=>setEditing(r)} title="Edit this report" style=${{padding:6}}><i class="ti ti-pencil" style=${{fontSize:15,color:'var(--t2)'}}></i></button><button class="icon-btn" onClick=${()=>resendReport(r)} disabled=${resendingId===r.id} title="Email this report to ${client.name}" style=${{padding:6}}>${resendingId===r.id?h`<i class="ti ti-loader-2 spinner" style=${{fontSize:15,color:'var(--t3)'}}></i>`:h`<i class="ti ti-mail-forward" style=${{color:'#ff00ee',fontSize:16}}></i>`}</button><button class="btn-pri" onClick=${()=>pdfReport(r)} disabled=${pdfBusyId===r.id} title=${r.pdf_url?'Open the generated PDF':'Generate the branded AMS PDF'} style=${{padding:'7px 14px',fontSize:13}}>${pdfBusyId===r.id?h`<i class="ti ti-loader-2 spinner"></i>`:h`<i class=${r.pdf_url?'ti ti-file-download':'ti ti-file-export'}></i>`}PDF</button>${r.pdf_url&&h`<button class="icon-btn" onClick=${()=>pdfReport(r,true)} disabled=${pdfBusyId===r.id} title="Regenerate PDF" style=${{padding:6}}><i class="ti ti-refresh" style=${{fontSize:14,color:'var(--t3)'}}></i></button>`}<button class="icon-btn" onClick=${()=>deleteReport(r.id)}><i class="ti ti-trash"></i></button></div></div></div>`)} </div>`}
        ${(showForm||editing)&&(()=>{const close=()=>{setShowForm(false);setEditing(null);};const onSaved=r=>{setReports(rs=>rs.some(x=>x.id===r.id)?rs.map(x=>x.id===r.id?r:x):[r,...rs]);};
          // reports made with the old monthly form keep editing in that form
          return editing&&!(editing.report_data&&editing.report_data.v===2)
            ?h`<${ReportForm} client=${client} existing=${editing} onClose=${close} onSave=${onSaved} showToast=${showToast}/>`
            :h`<${ReportBuilder} client=${client} existing=${editing} onClose=${close} onSave=${onSaved} showToast=${showToast}/>`;})()}
      </div>`;
    }

    return { ReportsTab, ReportForm, ReportBuilder };
  }
  window.AMS_REPORTS = { buildReports };
})();

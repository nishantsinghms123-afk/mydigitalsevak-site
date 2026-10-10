// social.js — auto-publishing UI (Instagram + Facebook).
//
// window.AMS_SOCIAL.buildSocial(deps) -> { ConnectedAccountsSection, PublishSection }
//
//   • ConnectedAccountsSection — Settings → "Connected accounts". Per brand:
//     Connect Instagram / Connect Facebook (kicks off the Meta OAuth flow via the
//     meta-oauth edge function), list connected destinations, set primary,
//     disconnect.
//   • PublishSection — lives in the content post panel. For an approved post it
//     offers Schedule / Post now; for a scheduled/posted/failed post it shows the
//     live status from publish_jobs with cancel / reschedule.
//
// All DB access goes through the migration-065 RPCs via rpcCall (session auto-
// injected). The backend (edge fns + pg_cron worker) does the actual posting.
// See docs/social-publishing.md. Single React instance — hooks come from index.html.
(function(){
  function buildSocial(deps){
    const {React,h,useState,useEffect,useCallback,rpcCall,SB_URL} = deps;

    const PLAT = {
      instagram:{label:'Instagram',icon:'ti-brand-instagram',color:'#E1306C'},
      facebook:{label:'Facebook',icon:'ti-brand-facebook',color:'#1877F2'},
    };
    const fmtWhen=(iso)=>{ if(!iso)return ''; try{return new Date(iso).toLocaleString([], {dateStyle:'medium',timeStyle:'short'});}catch(_){return iso;} };
    // datetime-local needs "YYYY-MM-DDTHH:mm" in LOCAL time.
    const toLocalInput=(d)=>{ const p=(n)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
    // Seed the schedule form from the post's OWN planned date/time (post_date +
    // posting_time) so staff don't re-enter the date they already picked. Falls
    // back to "next hour" only when the post has no usable future plan date.
    const nextHour=()=>{ const d=new Date(Date.now()+60*60*1000); d.setMinutes(0,0,0); return d; };
    const defaultWhen=(post)=>{
      if(post&&post.post_date){
        const t=(post.posting_time&&/^\d{2}:\d{2}/.test(post.posting_time))?String(post.posting_time).slice(0,5):'10:00';
        const d=new Date(`${String(post.post_date).slice(0,10)}T${t}`);
        if(!isNaN(d)&&d.getTime()>Date.now()) return toLocalInput(d);
      }
      return toLocalInput(nextHour());
    };
    const fmtNum=(n)=>n==null?'—':Number(n).toLocaleString();
    const sessTok=()=>{try{return localStorage.getItem('ams_session_token')||'';}catch(_){return '';}};

    // ── Per-brand social performance (Phase 2: reports/analytics) ───────────
    function SocialInsightsCard({clientId,showToast}){
      const[data,setData]=useState(null);
      const[loading,setLoading]=useState(false);
      const[syncing,setSyncing]=useState(false);
      const load=useCallback(async()=>{
        if(!clientId){setData(null);return;}
        setLoading(true);
        try{ const r=await rpcCall('social_insights_summary',{p_client_id:clientId,p_days:30}); setData(r&&r.ok?r:null); }
        catch(_){ setData(null); }finally{ setLoading(false); }
      },[clientId]);
      useEffect(()=>{ load(); },[load]);
      const syncNow=async()=>{
        setSyncing(true);
        try{
          const res=await fetch(`${SB_URL}/functions/v1/meta-insights-sync`,{method:'POST',
            headers:{'content-type':'application/json'},
            body:JSON.stringify({session_token:sessTok(),client_id:clientId})});
          const j=await res.json().catch(()=>({}));
          showToast&&showToast(j&&j.ok?`Synced ${j.synced||0} account(s) ✓`:'Sync failed — check Meta access');
          await load();
        }catch(_){ showToast&&showToast('Sync failed'); }finally{ setSyncing(false); }
      };
      const latest=data&&data.latest, series=(data&&data.series)||[], top=(data&&data.top_posts)||[];
      const fa=series.find(s=>s.followers!=null), la=[...series].reverse().find(s=>s.followers!=null);
      const growth=(fa&&la&&fa!==la)?(la.followers-fa.followers):null;
      const stat=(label,val,col)=>h`<div style=${{flex:'1 1 86px',minWidth:0}}><div style=${{fontSize:20,fontWeight:600,color:col||'var(--t1)'}}>${val}</div><div style=${{fontSize:11,color:'var(--t3)'}}>${label}</div></div>`;
      return h`<div class="settings-section">
        <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
          <div class="settings-section-title" style=${{marginBottom:0}}><i class="ti ti-chart-line" style=${{fontSize:16}}></i>Social performance (30d)</div>
          <button class="btn-sec" style=${{padding:'4px 10px',fontSize:11.5}} onClick=${syncNow} disabled=${syncing||!clientId}><i class=${'ti ti-refresh'+(syncing?' spinner':'')} style=${{fontSize:12}}></i>${syncing?'Syncing…':'Sync now'}</button>
        </div>
        <div style=${{height:12}}></div>
        ${loading?h`<div style=${{fontSize:13,color:'var(--t3)'}}>Loading…</div>`
          :!latest?h`<div style=${{fontSize:12.5,color:'var(--t3)',lineHeight:1.5}}>No insights cached yet. Click <strong>Sync now</strong> to pull from Meta. (Live for clients once App Review grants insights access; in development it pulls your own connected accounts.)</div>`
          :h`<div>
            <div style=${{display:'flex',gap:16,flexWrap:'wrap',marginBottom:14}}>
              ${stat('Followers',fmtNum(latest.followers))}
              ${stat('Reach (28d)',fmtNum(latest.reach))}
              ${growth!=null?stat('Follower Δ (30d)',(growth>=0?'+':'')+fmtNum(growth),growth>=0?'var(--green)':'var(--red)'):''}
            </div>
            ${top.length>0&&h`<div><div style=${{fontSize:11,fontWeight:600,color:'var(--t2)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.04em'}}>Top posts</div>
              ${top.map(p=>h`<div key=${p.content_id||p.title} style=${{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderTop:'1px solid var(--bd)',fontSize:12.5}}>
                <span style=${{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--t1)'}}>${p.title||'Untitled'}</span>
                <span style=${{color:'var(--t3)',whiteSpace:'nowrap'}}>${(p.performance&&p.performance.reach!=null)?fmtNum(p.performance.reach)+' reach':'—'}</span>
                ${p.post_link&&h`<a href=${p.post_link} target="_blank" rel="noopener" style=${{color:'#1877F2'}}><i class="ti ti-external-link" style=${{fontSize:13}}></i></a>`}
              </div>`)}
            </div>`}
          </div>`}
      </div>`;
    }

    // ── Settings → Connected accounts ──────────────────────────────────────
    function ConnectedAccountsSection({clients=[],showToast}){
      const active=clients.filter(c=>!c.deleted_at);
      const[clientId,setClientId]=useState(active[0]?.id||'');
      const[accounts,setAccounts]=useState([]);
      const[loading,setLoading]=useState(false);
      const[connecting,setConnecting]=useState('');
      const[candidates,setCandidates]=useState([]);   // post-OAuth picker list
      const[selected,setSelected]=useState({});        // "platform:id" -> bool
      const[picking,setPicking]=useState(false);
      const keyOf=(c)=>c.platform+':'+c.platform_account_id;

      const load=useCallback(async(cid)=>{
        if(!cid){setAccounts([]);return;}
        setLoading(true);
        try{ const rows=await rpcCall('social_accounts_list',{p_client_id:cid}); setAccounts(Array.isArray(rows)?rows:[]); }
        catch(e){ showToast&&showToast('Failed to load accounts'); }
        finally{ setLoading(false); }
      },[]);
      useEffect(()=>{ load(clientId); },[clientId,load]);

      // Auto-publish-on-approval (org setting; admin can toggle).
      const[autoPub,setAutoPub]=useState(null);
      useEffect(()=>{ rpcCall('agency_get_auto_publish',{}).then(setAutoPub).catch(()=>{}); },[]);
      const toggleAuto=async()=>{
        const nv=!(autoPub&&autoPub.on);
        setAutoPub(a=>({...(a||{}),on:nv}));
        try{ await rpcCall('agency_set_auto_publish',{p_on:nv}); showToast&&showToast(nv?'Auto-publish on approval: ON':'Auto-publish on approval: OFF'); }
        catch(_){ setAutoPub(a=>({...(a||{}),on:!nv})); showToast&&showToast('Failed — admin only'); }
      };
      const setAutoHour=async(hr)=>{
        const prev=autoPub&&autoPub.hour;
        setAutoPub(a=>({...(a||{}),hour:hr}));
        try{ await rpcCall('agency_set_auto_publish',{p_on:!!(autoPub&&autoPub.on),p_hour:hr}); showToast&&showToast(`Default publish time → ${String(hr).padStart(2,'0')}:00 IST`); }
        catch(_){ setAutoPub(a=>({...(a||{}),hour:prev})); showToast&&showToast('Failed to save hour — admin only'); }
      };

      // After OAuth returns, load the picker (the discovered Pages/IG accounts the
      // admin manages) so staff link only the one(s) for this brand.
      const loadCandidates=useCallback(async()=>{
        try{
          const r=await rpcCall('social_oauth_candidates',{});
          if(r&&r.ok&&Array.isArray(r.candidates)&&r.candidates.length){
            if(r.client_id)setClientId(r.client_id);
            setCandidates(r.candidates);setSelected({});
          }
        }catch(_){}
      },[]);

      // Bounce-back from the OAuth flow → clean URL, then show picker (or error).
      useEffect(()=>{
        const q=new URLSearchParams(window.location.search);
        if(q.has('social_pick')||q.has('social_connected')){
          const failed=q.get('social_connected')==='0';
          if(failed)showToast&&showToast(`Connect failed — ${q.get('reason')||'try again'}`);
          q.delete('social_pick');q.delete('social_connected');q.delete('count');q.delete('reason');
          const url=window.location.pathname+(q.toString()?'?'+q.toString():'')+window.location.hash;
          window.history.replaceState({},'',url);
          if(!failed)loadCandidates();
        }
      },[loadCandidates]);

      const doPick=async()=>{
        const sel=candidates.filter(c=>selected[keyOf(c)]).map(keyOf);
        if(!sel.length){showToast&&showToast('Tick at least one account');return;}
        setPicking(true);
        try{
          const r=await rpcCall('social_oauth_pick',{p_selected:sel});
          showToast&&showToast(`Linked ${r?.connected||sel.length} account(s) ✓`);
          setCandidates([]);setSelected({});load(clientId);
        }catch(e){showToast&&showToast('Failed to link');}finally{setPicking(false);}
      };
      const disconnectAll=async()=>{
        if(!confirm('Disconnect ALL accounts for this brand?\n\nAny pending scheduled posts to them will be CANCELLED. Already-published posts and their history are kept.'))return;
        try{ await rpcCall('social_account_disconnect_all',{p_client_id:clientId}); showToast&&showToast('All disconnected — pending posts cancelled'); load(clientId); }
        catch(e){ showToast&&showToast('Failed to disconnect: '+String(e?.message||e?.code||'unknown')); }
      };

      const connect=async(platform)=>{
        if(!clientId){showToast&&showToast('Pick a brand first');return;}
        setConnecting(platform);
        try{
          const r=await rpcCall('social_oauth_begin',{p_client_id:clientId,p_platform:platform});
          if(r&&r.state){
            window.location.href=`${SB_URL}/functions/v1/meta-oauth?action=start&state=${encodeURIComponent(r.state)}`;
          }else{ showToast&&showToast('Could not start connect'); setConnecting(''); }
        }catch(e){ showToast&&showToast('Connect not available yet — check Meta setup'); setConnecting(''); }
      };
      const setPrimary=async(id)=>{ try{ await rpcCall('social_account_set_primary',{p_id:id}); load(clientId); }catch(e){ showToast&&showToast('Failed to set primary: '+String(e?.message||e?.code||'unknown')); } };
      const disconnect=async(id)=>{ if(!confirm('Disconnect this account?\n\nPending scheduled posts to it will be CANCELLED. Already-published posts and their history are kept.'))return; try{ await rpcCall('social_account_disconnect',{p_id:id}); showToast&&showToast('Disconnected — pending posts cancelled, history kept'); load(clientId); }catch(e){ showToast&&showToast('Failed to disconnect: '+String(e?.message||e?.code||'unknown')); } };

      return h`<div>
        <div style=${{fontSize:20,fontWeight:500,color:'var(--t1)',marginBottom:6}}>Connected accounts</div>
        <div style=${{fontSize:13,color:'var(--t2)',marginBottom:20,lineHeight:1.5}}>Link a brand's Instagram & Facebook so approved posts auto-publish at their scheduled time. Instagram must be a <strong>Business</strong> account linked to a Facebook Page.</div>

        <div class="settings-section">
          <div class="settings-section-title"><i class="ti ti-building-store" style=${{fontSize:16}}></i>Brand</div>
          <select class="fi fi-select" value=${clientId} onChange=${e=>setClientId(e.target.value)} style=${{maxWidth:360}}>
            ${active.length===0&&h`<option value="">No brands yet</option>`}
            ${active.map(c=>h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
          </select>

          <div style=${{display:'flex',gap:10,marginTop:16,flexWrap:'wrap'}}>
            ${Object.entries(PLAT).map(([k,p])=>h`<button key=${k} class="btn-sec" onClick=${()=>connect(k)} disabled=${!clientId||connecting===k} style=${{display:'inline-flex',alignItems:'center',gap:7,borderColor:p.color,color:p.color}}>
              <i class=${'ti '+p.icon} style=${{fontSize:16}}></i>${connecting===k?'Redirecting…':'Connect '+p.label}
            </button>`)}
          </div>
        </div>

        ${candidates.length>0&&h`<div class="settings-section" style=${{border:'1px solid #A8009C'}}>
          <div class="settings-section-title" style=${{color:'#A8009C'}}><i class="ti ti-list-check" style=${{fontSize:16}}></i>Pick which account(s) belong to this brand</div>
          <div style=${{fontSize:12.5,color:'var(--t2)',marginBottom:12,lineHeight:1.5}}>Your login manages ${candidates.length} destination(s). Tick only the one(s) for <strong>${(active.find(c=>c.id===clientId)||{}).name||'this brand'}</strong> — the rest are ignored.</div>
          <div style=${{display:'flex',flexDirection:'column',gap:6,maxHeight:320,overflow:'auto'}}>
            ${candidates.map(c=>{const k=keyOf(c);const p=PLAT[c.platform]||{};return h`<label key=${k} style=${{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',border:'1px solid var(--bd)',borderRadius:8,cursor:'pointer',background:selected[k]?'rgba(168,0,156,.07)':'var(--bg)'}}>
              <input type="checkbox" checked=${!!selected[k]} onChange=${e=>setSelected(s=>({...s,[k]:e.target.checked}))}/>
              <i class=${'ti '+(p.icon||'ti-link')} style=${{fontSize:16,color:p.color||'var(--t2)'}}></i>
              <span style=${{fontSize:13,color:'var(--t1)'}}>${c.platform_username||c.platform_account_id}</span>
              <span style=${{fontSize:11,color:'var(--t3)',marginLeft:'auto'}}>${p.label||c.platform}</span>
            </label>`;})}
          </div>
          <div style=${{display:'flex',gap:8,marginTop:14}}>
            <button class="btn-pri" onClick=${doPick} disabled=${picking}><i class="ti ti-link" style=${{fontSize:13}}></i>${picking?'Linking…':'Link selected'}</button>
            <button class="btn-sec" onClick=${()=>{setCandidates([]);setSelected({});}}>Cancel</button>
          </div>
        </div>`}

        <div class="settings-section">
          <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
            <div class="settings-section-title" style=${{marginBottom:0}}><i class="ti ti-plug-connected" style=${{fontSize:16}}></i>Linked destinations</div>
            ${accounts.length>0&&h`<button class="btn-sec" style=${{padding:'4px 10px',fontSize:11.5,color:'var(--red)',borderColor:'var(--red)'}} onClick=${disconnectAll}>Disconnect all</button>`}
          </div>
          <div style=${{height:10}}></div>
          ${loading?h`<div style=${{fontSize:13,color:'var(--t3)'}}>Loading…</div>`
            :accounts.length===0?h`<div style=${{fontSize:13,color:'var(--t3)'}}>Nothing connected for this brand yet. Use the buttons above.</div>`
            :h`<div style=${{display:'flex',flexDirection:'column',gap:8}}>${accounts.map(a=>{const p=PLAT[a.platform]||{};return h`<div key=${a.id} style=${{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',border:'1px solid var(--bd)',borderRadius:10,background:'var(--bg)'}}>
              <i class=${'ti '+(p.icon||'ti-link')} style=${{fontSize:20,color:p.color||'var(--t2)'}}></i>
              <div style=${{flex:1,minWidth:0}}>
                <div style=${{fontSize:14,fontWeight:500,color:'var(--t1)'}}>${a.platform_username||a.platform_account_id} ${a.is_primary&&h`<span style=${{fontSize:10,color:'var(--green)',fontWeight:600,marginLeft:6}}>● PRIMARY</span>`}</div>
                <div style=${{fontSize:12,color:'var(--t3)'}}>${p.label||a.platform}${a.status!=='active'?' · '+a.status:''}${a.last_published_at?' · last posted '+fmtWhen(a.last_published_at):''}</div>
                ${a.last_error&&h`<div style=${{fontSize:11,color:'var(--red)',marginTop:2}}>${a.last_error}</div>`}
              </div>
              ${!a.is_primary&&h`<button class="btn-sec" style=${{padding:'5px 10px',fontSize:11.5}} onClick=${()=>setPrimary(a.id)}>Make primary</button>`}
              <button class="icon-btn" title="Disconnect" onClick=${()=>disconnect(a.id)} style=${{color:'var(--red)'}}><i class="ti ti-unlink" style=${{fontSize:15}}></i></button>
            </div>`;})}</div>`}
        </div>

        ${h`<${SocialInsightsCard} clientId=${clientId} showToast=${showToast}/>`}

        ${autoPub&&h`<div class="settings-section">
          <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
            <div>
              <div style=${{fontSize:14,fontWeight:500,color:'var(--t1)'}}>Auto-publish on approval</div>
              <div style=${{fontSize:12.5,color:'var(--t3)',marginTop:2,lineHeight:1.5}}>When a client approves a post, schedule it automatically on its planned date at the default time below, on the brand's primary account — no manual Schedule click.</div>
            </div>
            <button class="toggle" style=${{background:autoPub.on?'#A8009C':'#D0D0CC',flexShrink:0}} onClick=${toggleAuto}>
              <div class="toggle-knob" style=${{left:autoPub.on?'23px':'3px'}}></div>
            </button>
          </div>
          <div style=${{display:'flex',alignItems:'center',gap:10,marginTop:12,paddingTop:12,borderTop:'1px solid var(--bd)',flexWrap:'wrap'}}>
            <span style=${{fontSize:12.5,color:'var(--t2)'}}>Default publish time</span>
            <select class="fi fi-select" style=${{width:110,fontSize:12.5,padding:'5px 28px 5px 10px'}} value=${autoPub.hour!=null?autoPub.hour:10} onChange=${e=>setAutoHour(parseInt(e.target.value,10))}>
              ${Array.from({length:24},(_,i)=>h`<option key=${i} value=${i}>${String(i).padStart(2,'0')}:00</option>`)}
            </select>
            <span style=${{fontSize:11.5,color:'var(--t3)',lineHeight:1.5,flex:'1 1 220px'}}>Times are <strong>IST</strong> (your org timezone). A post's own <strong>Posting time</strong> — set when adding the post to the calendar — overrides this default for that post.</span>
          </div>
        </div>`}
      </div>`;
    }

    // ── Post panel → Publishing ────────────────────────────────────────────
    // Shown to admin/manager on an approved/scheduled/posted post. Reads the
    // live jobs (one per destination) from publish_jobs_list and the brand's
    // connected accounts. A post can publish to several accounts at once
    // (e.g. Instagram AND Facebook) — destinations are tick-boxes.
    function PublishSection({post,fields,currentUser,showToast}){
      const role=currentUser?.role_level;
      const privileged=role==='admin'||role==='manager';
      const[accounts,setAccounts]=useState(null);
      const[jobs,setJobs]=useState(undefined);   // undefined=loading
      const[when,setWhen]=useState(()=>defaultWhen(post));
      const[sel,setSel]=useState({});             // accountId -> bool (destinations)
      const[formOpen,setFormOpen]=useState(false);
      const[busy,setBusy]=useState(false);

      const load=useCallback(async()=>{
        if(!post?.client_id)return;
        try{
          const[accs,jl]=await Promise.all([
            rpcCall('social_accounts_list',{p_client_id:post.client_id}),
            rpcCall('publish_jobs_list',{p_client_id:post.client_id}),
          ]);
          const list=Array.isArray(accs)?accs.filter(a=>a.status==='active'):[];
          setAccounts(list);
          setJobs((Array.isArray(jl)?jl:[]).filter(j=>j.content_id===post.id));
        }catch(e){ setAccounts([]); setJobs([]); }
      },[post?.id,post?.client_id]);
      useEffect(()=>{ if(privileged)load(); },[privileged,load]);

      // Default the destination ticks: accounts that already have a live/posted
      // job stay ticked; otherwise tick every connected account ("both" by default).
      useEffect(()=>{
        if(!accounts||jobs===undefined)return;
        const livePlats=new Set(jobs.filter(j=>j.status!=='cancelled').map(j=>j.platform));
        const init={};
        accounts.forEach(a=>{ init[a.id]=livePlats.size?livePlats.has(a.platform):true; });
        setSel(init);
      },[accounts,jobs]);

      if(!privileged)return null;
      if(accounts===null||jobs===undefined)return null;   // still loading

      const approved=fields.client_approval==='approved';
      const activeJobs=jobs.filter(j=>j.status!=='cancelled'&&j.status!=='deleted');
      const hasAny=activeJobs.length>0;
      const anyPending=activeJobs.some(j=>j.status==='pending');
      const perf=(fields&&fields.performance)||post.performance;
      const selIds=accounts.filter(a=>sel[a.id]).map(a=>a.id);

      // How many of the post's jobs are mid-'publishing' right now (worker has
      // claimed them — a cancel/reschedule can no longer stop those).
      const inFlightCount=activeJobs.filter(j=>j.status==='publishing').length;
      // Newer RPCs (migration 073+) return info about in-flight jobs they could
      // not touch — read it defensively (absent on older migrations).
      const inFlightFromResult=(r)=>{ if(!r)return 0; const v=r.publishing??r.in_flight??r.publishing_jobs??r.publishing_count; return Array.isArray(v)?v.length:Number(v)||0; };

      const schedule=async(now)=>{
        if(!accounts.length){showToast&&showToast('Connect an account for this brand in Settings → Connected accounts');return;}
        if(!selIds.length){showToast&&showToast('Tick at least one destination');return;}
        setBusy(true);
        try{
          const p_when=now?null:new Date(when).toISOString();
          const r=await rpcCall('content_schedule_multi',{p_id:post.id,p_when,p_account_ids:selIds});
          const fl=inFlightFromResult(r);
          showToast&&showToast(fl>0
            ?`Saved — but ${fl} destination(s) were already mid-publish and may go out with the OLD time`
            :now?`Posting to ${selIds.length} account(s) shortly…`:`Scheduled to ${selIds.length} account(s) ✓`);
          setFormOpen(false);
          await load();
        }catch(e){
          const m=String(e.message||e.code||'');
          showToast&&showToast(m.includes('not_approved')?'Client must approve first':m.includes('no_account')?'No account connected for this brand':'Failed to schedule: '+(m||'unknown'));
        }finally{ setBusy(false); }
      };
      const cancelAll=async()=>{
        if(inFlightCount>0&&!confirm(`${inFlightCount} destination(s) are publishing RIGHT NOW — those may already be going live and cannot be stopped.\n\nCancel the remaining pending destination(s)?`))return;
        setBusy(true);
        try{
          const r=await rpcCall('content_unschedule',{p_id:post.id});
          const fl=inFlightFromResult(r)||inFlightCount;
          showToast&&showToast(fl>0?`Pending cancelled — ${fl} destination(s) were mid-publish and may still go live`:'Schedule cancelled');
          await load();
        }catch(e){ showToast&&showToast('Failed to cancel: '+String(e?.message||e?.code||'unknown')); }finally{ setBusy(false); }
      };
      // One-click retry for a failed destination (publish_job_retry, migration 073+).
      const retryJob=async(j)=>{
        setBusy(true);
        try{
          await rpcCall('publish_job_retry',{p_job_id:j.id});
          showToast&&showToast('Retrying — it will post within a minute');
          await load();
        }catch(e){
          const m=String(e?.message||'')+' '+String(e?.code||'');
          showToast&&showToast(/PGRST202|schema cache|could not find/i.test(m)
            ?'Retry needs the latest migration — use Reschedule for now'
            :'Retry failed: '+String(e?.message||e?.code||'unknown'));
        }finally{ setBusy(false); }
      };
      // Delete a live post so a corrected version can be re-published. Facebook
      // deletes via the Graph API; Instagram has no delete endpoint, so staff
      // remove it in the app and then "mark deleted" here to unlock re-publish.
      const delFacebook=async(j)=>{
        if(!confirm('Delete this post from Facebook? This removes the live post. You can then re-publish a corrected version.'))return;
        setBusy(true);
        try{
          const res=await fetch(`${SB_URL}/functions/v1/meta-delete`,{method:'POST',
            headers:{'content-type':'application/json'},
            body:JSON.stringify({job_id:j.id,session_token:sessTok()})});
          const r=await res.json().catch(()=>({}));
          showToast&&showToast(r&&r.ok?'Deleted from Facebook ✓ — re-publish below':'Delete failed: '+((r&&r.error)||'try the Meta dashboard'));
          await load();
        }catch(_){ showToast&&showToast('Delete failed'); }finally{ setBusy(false); }
      };
      const markDeleted=async(j)=>{
        if(!confirm('Mark this post as deleted here?\n\nDo this AFTER you have deleted it on Instagram (Meta blocks deleting IG posts via API). It unlocks re-publishing a corrected version.'))return;
        setBusy(true);
        try{ await rpcCall('publish_job_mark_deleted',{p_job_id:j.id}); showToast&&showToast('Marked deleted — you can re-publish below'); await load(); }
        catch(_){ showToast&&showToast('Failed'); }finally{ setBusy(false); }
      };

      const box={padding:'12px 14px',borderRadius:'var(--r)',marginBottom:14,border:'1px solid var(--bd)',background:'var(--bg)'};
      const head=h`<div style=${{display:'flex',alignItems:'center',gap:8,marginBottom:10}}><i class="ti ti-send" style=${{fontSize:14,color:'#A8009C'}}></i><span style=${{fontSize:12.5,fontWeight:600,color:'var(--t1)'}}>Auto-publish</span></div>`;
      const chip=(l,v)=>v==null?'':h`<span style=${{display:'inline-flex',gap:4,padding:'2px 8px',borderRadius:999,background:'var(--bg2)',border:'1px solid var(--bd)',fontSize:11.5,color:'var(--t2)'}}><strong style=${{color:'var(--t1)'}}>${Number(v).toLocaleString()}</strong>${l}</span>`;

      // One status row per destination job. Statuses spelled out so partial
      // failures (IG posted, FB failed) are visible at a glance.
      const jobLine=(j)=>{ const p=PLAT[j.platform]||{};
        const attempts=(j.attempt!=null&&j.attempt>1)?` (attempt ${j.attempt})`:'';
        const txt=j.status==='published'?`✅ Posted · ${fmtWhen(j.published_at)}`
          :j.status==='failed'?`⚠️ Failed${attempts}: ${j.last_error||'unknown error from the platform'}`
          :j.status==='publishing'?'Publishing now… (already going out — can no longer be cancelled)'
          :j.status==='pending'?`⏳ Scheduled · ${fmtWhen(j.scheduled_publish_at)}`
          :`${j.status} · ${fmtWhen(j.scheduled_publish_at)}`;
        const col=j.status==='published'?'var(--green)':j.status==='failed'?'var(--red)':j.status==='publishing'?'#A8009C':'var(--t2)';
        const isFb=j.platform==='facebook';
        return h`<div key=${j.id} style=${{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderTop:'1px solid var(--bd)',flexWrap:'wrap'}}>
          <i class=${'ti '+(p.icon||'ti-link')} style=${{fontSize:18,color:p.color||'var(--t2)'}}></i>
          <div style=${{flex:1,minWidth:120}}>
            <div style=${{fontSize:13,fontWeight:500,color:'var(--t1)'}}>${p.label||j.platform}${isFb&&post.type==='reel'?h`<span style=${{fontSize:10.5,fontWeight:400,color:'var(--t3)',marginLeft:6}}>posts as a Page video</span>`:''}</div>
            <div style=${{fontSize:11.5,color:col}}>${txt}</div>
          </div>
          ${j.status==='failed'&&h`<button class="btn-sec" style=${{padding:'4px 10px',fontSize:11.5,color:'#A8009C',borderColor:'#A8009C'}} onClick=${()=>retryJob(j)} disabled=${busy} title="Retry this destination now (one attempt, posts within a minute)">↻ Retry</button>`}
          ${j.permalink&&h`<a href=${j.permalink} target="_blank" rel="noopener" title="View live post" style=${{color:'#1877F2'}}><i class="ti ti-external-link" style=${{fontSize:15}}></i></a>`}
          ${j.status==='published'&&(isFb
            ? h`<button class="btn-sec" style=${{padding:'4px 10px',fontSize:11.5,color:'var(--red)',borderColor:'var(--red)'}} onClick=${()=>delFacebook(j)} disabled=${busy} title="Delete the live Facebook post"><i class="ti ti-trash" style=${{fontSize:12}}></i>Delete</button>`
            : h`<div style=${{display:'flex',gap:6}}>
                ${j.permalink&&h`<a class="btn-sec" href=${j.permalink} target="_blank" rel="noopener" style=${{padding:'4px 10px',fontSize:11.5,textDecoration:'none'}} title="Instagram can't be deleted via API — open the post and delete it in the app">Open to delete</a>`}
                <button class="btn-sec" style=${{padding:'4px 10px',fontSize:11.5,color:'var(--red)',borderColor:'var(--red)'}} onClick=${()=>markDeleted(j)} disabled=${busy} title="After deleting on Instagram, mark it here to unlock re-publish"><i class="ti ti-trash" style=${{fontSize:12}}></i>Mark deleted</button>
              </div>`)}
        </div>`;
      };

      // The destination + time form (used for first schedule and reschedule).
      const formCard=()=>h`<div style=${{display:'flex',flexDirection:'column',gap:12}}>
        <div>
          <div style=${{fontSize:11.5,fontWeight:600,color:'var(--t2)',marginBottom:7,textTransform:'uppercase',letterSpacing:'.04em'}}>Publish to</div>
          <div style=${{display:'flex',flexDirection:'column',gap:6}}>
            ${accounts.map(a=>{const p=PLAT[a.platform]||{};const fbReel=a.platform==='facebook'&&post.type==='reel';return h`<label key=${a.id} style=${{display:'flex',alignItems:'center',gap:9,padding:'7px 10px',border:'1px solid var(--bd)',borderRadius:8,cursor:'pointer',background:sel[a.id]?'rgba(168,0,156,.07)':'var(--bg)'}}>
              <input type="checkbox" checked=${!!sel[a.id]} onChange=${e=>setSel(s=>({...s,[a.id]:e.target.checked}))}/>
              <i class=${'ti '+(p.icon||'ti-link')} style=${{fontSize:16,color:p.color||'var(--t2)'}}></i>
              <span style=${{fontSize:12.5,color:'var(--t1)'}}>${p.label||a.platform} · ${a.platform_username||a.platform_account_id}</span>
              ${fbReel&&h`<span style=${{fontSize:10.5,color:'var(--t3)',marginLeft:'auto',whiteSpace:'nowrap'}}>posts as a Page video</span>`}
            </label>`;})}
          </div>
        </div>
        <div>
          <input type="datetime-local" class="fi" value=${when} min=${toLocalInput(new Date())} onInput=${e=>setWhen(e.target.value)} style=${{fontSize:12.5}}/>
          <div style=${{fontSize:11,color:'var(--t3)',marginTop:4,lineHeight:1.5}}>Pre-filled from the post's planned date + its per-post Posting time. Times are IST. Picking a past time publishes within a minute.</div>
        </div>
        <div style=${{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button class="btn-pri" style=${{padding:'7px 14px',fontSize:12.5}} onClick=${()=>schedule(false)} disabled=${busy}><i class="ti ti-calendar-plus" style=${{fontSize:13}}></i>${hasAny?'Reschedule':'Schedule'}</button>
          <button class="btn-sec" style=${{padding:'7px 14px',fontSize:12.5}} onClick=${()=>schedule(true)} disabled=${busy}><i class="ti ti-send" style=${{fontSize:13}}></i>Post now</button>
          ${(hasAny||formOpen)&&h`<button class="btn-sec" style=${{padding:'7px 14px',fontSize:12.5}} onClick=${()=>setFormOpen(false)} disabled=${busy}>Close</button>`}
        </div>
      </div>`;

      // No accounts connected at all.
      if(accounts.length===0)return h`<div style=${{...box}}>${head}
        <div style=${{fontSize:12.5,color:'var(--t3)'}}>No Instagram/Facebook connected for this brand. Add one in <strong>Settings → Connected accounts</strong>.</div>
      </div>`;

      // Not approved and nothing scheduled yet → nudge.
      if(!approved&&!hasAny)return h`<div style=${{...box}}>${head}
        <div style=${{fontSize:12.5,color:'var(--t3)'}}>Once the client approves this post, you can schedule it to auto-publish here.</div>
      </div>`;

      // Has jobs → show per-destination status (+ reschedule/cancel controls or the open form).
      if(hasAny)return h`<div style=${{...box,borderColor:'rgba(168,0,156,.35)'}}>${head}
        ${activeJobs.map(jobLine)}
        ${perf&&activeJobs.some(j=>j.status==='published')&&h`<div style=${{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}}>${chip('reach',perf.reach)}${chip('likes',perf.likes)}${chip('comments',perf.comments)}${chip('saves',perf.saved)}${chip('shares',perf.shares)}${chip('plays',perf.plays)}</div>`}
        ${formOpen?h`<div style=${{marginTop:12,paddingTop:12,borderTop:'1px solid var(--bd)'}}>${formCard()}</div>`
          :h`<div style=${{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
              <button class="btn-sec" style=${{padding:'6px 12px',fontSize:12}} onClick=${()=>setFormOpen(true)} disabled=${busy}><i class="ti ti-calendar-cog" style=${{fontSize:12}}></i>Reschedule / change destinations</button>
              ${anyPending&&h`<button class="btn-sec" style=${{padding:'6px 12px',fontSize:12,color:'var(--red)',borderColor:'var(--red)'}} onClick=${cancelAll} disabled=${busy}><i class="ti ti-x" style=${{fontSize:12}}></i>Cancel schedule</button>`}
            </div>`}
      </div>`;

      // Approved, nothing scheduled → show the form straight away.
      return h`<div style=${{...box}}>${head}${formCard()}</div>`;
    }

    return { ConnectedAccountsSection, PublishSection };
  }

  // ── Cross-brand publishing queue ──────────────────────────────────────────
  // window.AMS_SOCIAL.buildPublishQueue(deps) -> { PublishQueue }
  //
  // One screen for the social manager running N brands: what goes out today /
  // in the next 48h, what failed last night (with one-click Retry), and what
  // just went live (with permalinks). Data comes from publish_jobs_overview
  // (migration 073+) — org-wide jobs joined with content title/type, client
  // name and account handle. Renders nothing for non-privileged roles and a
  // gentle "apply the migration" note if the RPC isn't installed yet.
  //
  // deps: {React,h,useState,useEffect,useCallback,rpcCall,writeHash}
  // props: {currentUser, showToast}
  function buildPublishQueue(deps){
    const {React,h,useState,useEffect,useCallback,rpcCall,writeHash} = deps;
    const PLAT = {
      instagram:{label:'Instagram',icon:'ti-brand-instagram',color:'#E1306C'},
      facebook:{label:'Facebook',icon:'ti-brand-facebook',color:'#1877F2'},
    };
    const fmtTime=(iso)=>{ if(!iso)return ''; try{return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}catch(_){return iso;} };
    const fmtDT=(iso)=>{ if(!iso)return ''; try{return new Date(iso).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}catch(_){return iso;} };

    function PublishQueue({currentUser,showToast}){
      const role=currentUser?.role_level;
      const privileged=role==='admin'||role==='manager';
      const[state,setState]=useState({loading:true});
      const[busyId,setBusyId]=useState('');
      const load=useCallback(async()=>{
        setState(s=>({...s,loading:true}));
        try{
          const r=await rpcCall('publish_jobs_overview',{p_days:2});
          // Migration 073 shape: {ok, upcoming:[], failed:[], published:[]} —
          // each row carries its own status. Flat-array shapes also tolerated.
          const rows=Array.isArray(r)?r
            :(r&&(Array.isArray(r.upcoming)||Array.isArray(r.failed)||Array.isArray(r.published)))
              ?[...(r.upcoming||[]),...(r.failed||[]),...(r.published||[])]
            :(r&&Array.isArray(r.jobs))?r.jobs:(r&&Array.isArray(r.rows))?r.rows:[];
          setState({rows});
        }catch(e){
          const m=String(e?.message||'')+' '+String(e?.code||'');
          if(/PGRST202|schema cache|could not find/i.test(m))setState({unsupported:true});
          else setState({error:String(e?.message||e?.code||'failed to load')});
        }
      },[]);
      useEffect(()=>{ if(privileged)load(); },[privileged,load]);
      if(!privileged)return null;

      const retry=async(j)=>{
        const id=j.id||j.job_id;
        setBusyId(id);
        try{ await rpcCall('publish_job_retry',{p_job_id:id}); showToast&&showToast('Retrying — posts within a minute'); await load(); }
        catch(e){ showToast&&showToast('Retry failed: '+String(e?.message||e?.code||'unknown')); }
        finally{ setBusyId(''); }
      };
      const openClient=(j)=>{ if(writeHash&&j.client_id)writeHash({tab:'clients',clientId:j.client_id,clientTab:'content'}); };

      const rows=state.rows||[];
      const now=Date.now(), in48=now+48*3600*1000;
      const todayStr=new Date().toDateString();
      const tsOf=(j)=>{ const t=new Date(j.scheduled_publish_at||0).getTime(); return isNaN(t)?0:t; };
      const pending=rows.filter(j=>j.status==='pending'||j.status==='publishing').sort((a,b)=>tsOf(a)-tsOf(b));
      const today=pending.filter(j=>tsOf(j)<=now||new Date(j.scheduled_publish_at).toDateString()===todayStr);
      const upcoming=pending.filter(j=>!today.includes(j)&&tsOf(j)<=in48);
      const failed=rows.filter(j=>j.status==='failed');
      const published=rows.filter(j=>j.status==='published').sort((a,b)=>new Date(b.published_at||0)-new Date(a.published_at||0));

      const groupByClient=(list)=>{ const m=new Map(); list.forEach(j=>{ const k=j.client_name||j.client||'Unknown brand'; if(!m.has(k))m.set(k,[]); m.get(k).push(j); }); return[...m.entries()]; };

      const jobRow=(j,{retryBtn=false,permalink=false,timeOnly=false}={})=>{
        const p=PLAT[j.platform]||{};
        const id=j.id||j.job_id;
        const handle=j.platform_username||j.account_handle||j.handle||j.platform_account_id||'';
        const title=j.title||j.content_title||'Untitled';
        const type=j.type||j.content_type||'';
        const t=j.status==='published'?(timeOnly?fmtTime(j.published_at):fmtDT(j.published_at)):(timeOnly?fmtTime(j.scheduled_publish_at):fmtDT(j.scheduled_publish_at));
        return h`<div key=${id} style=${{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderTop:'1px solid var(--bd)',fontSize:12.5,flexWrap:'wrap'}}>
          <i class=${'ti '+(p.icon||'ti-link')} style=${{fontSize:15,color:p.color||'var(--t2)',flexShrink:0}} title=${p.label||j.platform}></i>
          ${handle&&h`<span style=${{color:'var(--t3)',fontSize:11.5,whiteSpace:'nowrap'}}>@${handle}</span>`}
          <span onClick=${()=>openClient(j)} style=${{flex:1,minWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--t1)',cursor:writeHash&&j.client_id?'pointer':'default'}} title=${title}>${title}</span>
          ${type&&h`<span style=${{fontSize:10,padding:'1px 6px',borderRadius:4,background:'var(--bg2)',border:'1px solid var(--bd)',color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.04em'}}>${type}</span>`}
          <span style=${{color:'var(--t3)',fontSize:11.5,whiteSpace:'nowrap'}}>${j.status==='publishing'?'publishing now…':t}</span>
          ${retryBtn&&h`<button class="btn-sec" style=${{padding:'2px 8px',fontSize:11,color:'#A8009C',borderColor:'#A8009C'}} onClick=${()=>retry(j)} disabled=${busyId===id} title=${j.last_error||''}>↻ Retry</button>`}
          ${permalink&&j.permalink&&h`<a href=${j.permalink} target="_blank" rel="noopener" title="View live post" style=${{color:'#1877F2'}}><i class="ti ti-external-link" style=${{fontSize:13}}></i></a>`}
          ${retryBtn&&j.last_error&&h`<div style=${{flexBasis:'100%',fontSize:11,color:'var(--red)',paddingLeft:23}}>${j.last_error}</div>`}
        </div>`;
      };

      const bucket=(label,icon,col,list,opts)=>{
        if(!list.length)return '';
        return h`<div style=${{marginBottom:14}}>
          <div style=${{fontSize:11,fontWeight:600,color:col,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4,display:'flex',alignItems:'center',gap:6}}><i class=${'ti '+icon} style=${{fontSize:13}}></i>${label} · ${list.length}</div>
          ${groupByClient(list).map(([name,js])=>h`<div key=${name} style=${{marginBottom:6}}>
            <div style=${{fontSize:11.5,fontWeight:600,color:'var(--t2)',padding:'4px 0 2px'}}>${name}</div>
            ${js.map(j=>jobRow(j,opts))}
          </div>`)}
        </div>`;
      };

      const body=state.unsupported
        ?h`<div style=${{fontSize:12.5,color:'var(--t3)',lineHeight:1.5}}>The queue needs the latest social migration (publish_jobs_overview). Apply it in Supabase, then refresh.</div>`
        :state.error
        ?h`<div style=${{fontSize:12.5,color:'var(--red)'}}>Could not load the queue: ${state.error}</div>`
        :(rows.length===0&&!state.loading)
        ?h`<div style=${{fontSize:12.5,color:'var(--t3)'}}>Nothing in the queue — schedule any approved post from its post panel.</div>`
        :h`<div>
            ${bucket('Today','ti-clock-play','#A8009C',today,{timeOnly:true})}
            ${bucket('Upcoming (48h)','ti-calendar-time','var(--t2)',upcoming,{})}
            ${bucket('Failed — needs attention','ti-alert-triangle','var(--red)',failed,{retryBtn:true})}
            ${bucket('Recently published','ti-circle-check','var(--green)',published,{permalink:true})}
          </div>`;

      return h`<div style=${{background:'var(--surface)',border:'1px solid var(--bd)',borderRadius:'var(--r)',padding:'14px 16px',marginBottom:16}}>
        <div style=${{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
          <i class="ti ti-send" style=${{fontSize:18,color:'#ff00ee'}}></i>
          <div style=${{flex:1,fontSize:13.5,fontWeight:600,color:'var(--t1)'}}>Publishing queue</div>
          <button class="btn-sec" style=${{padding:'3px 10px',fontSize:11.5}} onClick=${load} disabled=${!!state.loading}><i class=${'ti ti-refresh'+(state.loading?' spinner':'')} style=${{fontSize:12}}></i>${state.loading?'Loading…':'Refresh'}</button>
        </div>
        ${body}
      </div>`;
    }

    return { PublishQueue };
  }

  window.AMS_SOCIAL = { buildSocial, buildPublishQueue };
})();

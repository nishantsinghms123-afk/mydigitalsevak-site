// employee.js — Employee/Tasks app shell (TasksApp), the editor/designer mobile app (Phase 3.8 split).
// TasksApp is a router that renders shared views (HomeTab/CalendarTab/BrandsView/EmployeeView/etc.) which
// stay in index.html and are injected. window.AMS_EMPLOYEE.buildEmployee(deps) -> { TasksApp }.
(function(){
  function buildEmployee(deps){
    const {React,h,useState,useEffect,useRef,useCallback,useMemo,supabase,SB_KEY,SB_URL,db,dbPatch,rpcCall,_loadFail,writeHash,parseHash,t,PRIORITY,Av,Toast,ThemeToggle,BottomNav,LoadErrorBanner,UrgentDTBanner,MorningDigest,HomeTab,CalendarTab,BrandsView,EmployeeView,PostPanel,DirectTasksHomePanel,isNotifForUser,notifyContent,showLocalNotification,subscribeToPush,taskOverdue,taskToday,todayISO,useAttendanceReminder,useDirectTasks,useHashRoute,usePushSubscription,NotifPanel,DesktopNotifBanner,MessagesApp,useChatUnread,useTeamChat} = deps;

    // ── TasksApp ──
function TasksApp({user,theme,setTheme,onSignOut}){
  const[tasks,setTasks]=useState([]);const[loading,setLoading]=useState(true);const[sel,setSel]=useState(null);const[panelOpen,setPanelOpen]=useState(false);const[toast,setToast]=useState(null);const tk=useRef(0);const showToast=(msg)=>{tk.current++;setToast({msg,k:tk.current});};
  const[clients,setClients]=useState({});
  const[notifs,setNotifs]=useState([]);const[showNotifs,setShowNotifs]=useState(false);
  const[tab,setTab]=useState(()=>{const r=parseHash();return(r.tab==='home'||r.tab==='employee'||r.tab==='brands'||r.tab==='calendar'||r.tab==='chat')?r.tab:'home';});
  const[team,setTeam]=useState([]);
  const[drawerOpen,setDrawerOpen]=useState(false);
  // Sync tab → URL hash
  useEffect(()=>{writeHash({tab});},[tab]);
  // Sync URL hash → tab (back/forward, paste-in-URL)
  const route=useHashRoute();
  useEffect(()=>{
    const desired=(route.tab==='home'||route.tab==='employee'||route.tab==='brands'||route.tab==='calendar'||route.tab==='chat')?route.tab:'home';
    if(desired!==tab)setTab(desired);
  },[route.tab]);
  const[showDesktopBanner,setShowDesktopBanner]=useState(false);
  // Direct tasks (assignee side — editors/designers receive them)
  const[directTasks,setDirectTasks,dtLoaded]=useDirectTasks(user);
  const[dtInboxOpen,setDTInboxOpen]=useState(false);const[showDigest,setShowDigest]=useState(false);
  const[dtAutoOpenId,setDtAutoOpenId]=useState(null);
  const openDTInbox=()=>{setDTInboxOpen(true);setDrawerOpen(false);};
  const closeDTInbox=()=>{setDTInboxOpen(false);setDtAutoOpenId(null);};
  const openDT=(t)=>{setDtAutoOpenId(t.id);setDTInboxOpen(true);setDrawerOpen(false);};
  const updateDTInList=(u)=>{setDirectTasks(ts=>ts.map(t=>t.id===u.id?u:t));};
  const deleteDTFromList=(id)=>{setDirectTasks(ts=>ts.filter(t=>t.id!==id));};
  const unreadCount=notifs.filter(n=>!n.read).length;
  const {total:chatUnread,dmUnread}=useTeamChat?useTeamChat(user):{total:0,dmUnread:{}};
  const[tcCollapsed,setTcCollapsed]=useState(()=>localStorage.getItem('ams_teamrail')==='1');
  const toggleTeamRail=()=>{setTcCollapsed(v=>{const nv=!v;try{localStorage.setItem('ams_teamrail',nv?'1':'0');}catch(_){}return nv;});};
  const openTeamChat=(m)=>{setTab('chat');setDrawerOpen(false);window.__amsPendingDm=m.id;try{window.dispatchEvent(new CustomEvent('ams-open-dm',{detail:m.id}));}catch(_){}};
  // Morning digest once per day
  useEffect(()=>{
    if(!user||!dtLoaded)return;
    const key='ams_dt_digest_'+user.name+'_'+new Date().toISOString().slice(0,10);
    if(localStorage.getItem(key))return;
    const mine=directTasks.filter(t=>t.assignee===user.name&&t.status!=='done');
    if(mine.length===0)return;
    localStorage.setItem(key,'1');setShowDigest(true);
  },[dtLoaded,user?.name]);
  // Build a clients array for the panel (it expects an array, we have a map by id)
  const clientsArr=Object.values(clients||{});
  useAttendanceReminder(user);
  usePushSubscription(user);
  useEffect(()=>{
    if(typeof Notification!=='undefined'&&Notification.permission==='default'&&!localStorage.getItem('ams_notif_dismissed')){
      setShowDesktopBanner(true);
    }
  },[]);
  const enableDesktopNotifs=()=>{if(typeof Notification==='undefined'){setShowDesktopBanner(false);showToast('Notifications need a desktop browser or the installed PWA');return;}Notification.requestPermission().then(p=>{setShowDesktopBanner(false);if(p==='granted'){showToast('Notifications enabled ✓');subscribeToPush(user);}});};
  const dismissBanner=()=>{setShowDesktopBanner(false);localStorage.setItem('ams_notif_dismissed','1');};
  const[loadErr,setLoadErr]=useState(null);
  useEffect(()=>{db('team_members','&status=neq.revoked&role_level=neq.client&order=name.asc').then(setTeam).catch(_loadFail('team_members'));},[]);

  // Visibility = the task's ASSIGN date (task_given_date) has arrived: show it once
  // task_given_date ≤ today, however far off the post_date is, so staff can hand a
  // task to a designer/editor days ahead. Legacy / AI / CSV rows have a NULL assign
  // date — those fall back to the old forward horizon (post_date ≤ today+7). Posts in
  // workflow_status='revision' always show. HomeTab buckets these for display.
  const fISO=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const todayStr=()=>fISO(new Date());
  const taskHorizon=()=>{const h7=new Date();h7.setDate(h7.getDate()+7);return fISO(h7);};
  // Mirror of the loadTasks() PostgREST filter, for the realtime predicate below.
  const isVisible=(p)=>{
    if(!p)return false;
    if(p.workflow_status==='revision')return true;
    if(p.task_given_date)return p.task_given_date.slice(0,10)<=todayStr();
    return !!(p.post_date&&p.post_date.slice(0,10)<=taskHorizon());
  };
  const fetchClients=(posts)=>{const ids=[...new Set(posts.map(p=>p.client_id).filter(Boolean))];if(ids.length){db('clients',`&id=in.(${ids.join(',')})`).then(cs=>{setClients(m=>{const out={...m};cs.forEach(c=>{out[c.id]=c;});return out;});}).catch(_loadFail('clients-for-tasks'));}};
  const loadTasks=()=>db('content',`&assigned_to=eq.${encodeURIComponent(user.name)}&or=(task_given_date.lte.${todayStr()},and(task_given_date.is.null,post_date.lte.${taskHorizon()}),workflow_status.eq.revision)&order=post_date.asc`).then(posts=>{setTasks(posts);fetchClients(posts);setLoadErr(null);}).catch(_loadFail('my-tasks',e=>setLoadErr(e?.message||'network'))).finally(()=>setLoading(false));
  useEffect(()=>{
    loadTasks();
    const mine=(p)=>p&&p.assigned_to===user.name&&isVisible(p);
    const live=(p)=>p&&!p.deleted_at;
    const ch=supabase.channel('content-tasks-'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'content'},payload=>{
      const ev=payload.eventType;const n=payload.new;const o=payload.old;
      if(ev==='INSERT'){if(mine(n)&&live(n))setTasks(ts=>{if(ts.find(t=>t.id===n.id))return ts;fetchClients([n]);return [...ts,n];});}
      else if(ev==='UPDATE'){setTasks(ts=>{const present=ts.find(t=>t.id===n.id);if(mine(n)&&live(n)){if(!present)fetchClients([n]);return present?ts.map(t=>t.id===n.id?n:t):[...ts,n];}return ts.filter(t=>t.id!==n.id);});}
      else if(ev==='DELETE'){const id=(o&&o.id)||(n&&n.id);if(id)setTasks(ts=>ts.filter(t=>t.id!==id));}
    }).subscribe();
    const poll=setInterval(loadTasks,90000);
    return()=>{supabase.removeChannel(ch);clearInterval(poll);};
  },[user.name,user.id]);

  // Notification poll. Realtime on `notifications` is permanently quiet post-075
  // (anon SELECT revoked + FORCE RLS — no row images), so the poll is the delivery
  // path: it diffs against seen ids and pops the OS notification for new arrivals.
  // The tag matches the Web Push path ('ams-notif-<id>') so a device that also
  // gets the background push shows one notification, not two.
  useEffect(()=>{
    const relevant=(n)=>isNotifForUser(n,user);
    let seenIds=null; // null until first load — never pop the backlog on login
    const popNew=(list)=>{
      const fresh=seenIds?list.filter(n=>!seenIds.has(n.id)):[];
      seenIds=seenIds||new Set();list.forEach(n=>seenIds.add(n.id));
      const cutoff=Date.now()-10*60*1000; // only recent arrivals, not stale rows after a long sleep
      fresh.filter(n=>(Date.parse(n.created_at)||0)>=cutoff).slice(0,5)
        .forEach(n=>showLocalNotification(n.title,{body:n.message,tag:'ams-notif-'+n.id}));
    };
    // Post-075: notif_list returns ONLY the caller's rows with a per-caller `read` flag.
    // Legacy db() path kept as fallback for pre-075 DBs (anon SELECT still granted there).
    const refresh=async()=>{
      try{
        const res=await rpcCall('notif_list',{p_limit:20},{silentAuth:true});
        const rows=Array.isArray(res)?res:(res?.rows||[]);
        const unread=rows.filter(n=>!n.read); // defensive: p_unread_only defaults true, but tolerate read rows
        console.info('[notif] poll (tasks, rpc)',{user:user?.name,role:user?.role_level,total:rows.length,unread:unread.length});
        popNew(unread);setNotifs(unread);
        return;
      }catch(e){/* pre-075 DB or auth hiccup — fall back to legacy table read */}
      db('notifications','&read=eq.false&order=created_at.desc&limit=20').then(rows=>{const list=rows.filter(relevant);console.info('[notif] poll (tasks)',{user:user?.name,role:user?.role_level,total:rows.length,relevant:list.length});popNew(list);setNotifs(list);}).catch(e=>console.warn('[notif] poll failed',e));
    };
    refresh();
    const poll=setInterval(refresh,30000);
    // Catch up immediately when the tab / installed PWA returns to the foreground.
    const onVis=()=>{if(document.visibilityState==='visible')refresh();};
    document.addEventListener('visibilitychange',onVis);
    return()=>{clearInterval(poll);document.removeEventListener('visibilitychange',onVis);};
  },[user.name]);

  // Notification history: the live list above only carries unread rows, so anything
  // marked read vanishes. "Show earlier" pulls the last 30 for this user regardless of
  // read state — display-only (read-state/markRead plumbing is deliberately untouched).
  const[earlierNotifs,setEarlierNotifs]=useState(null); // null = history not requested
  const[earlierLoading,setEarlierLoading]=useState(false);
  const loadEarlier=async()=>{
    setEarlierLoading(true);
    try{
      // Post-075: server filters per-caller (recipient grammar) — no client-side filter needed.
      const res=await rpcCall('notif_list',{p_limit:30,p_unread_only:false},{silentAuth:true});
      setEarlierNotifs(Array.isArray(res)?res:(res?.rows||[]));
    }catch(_){
      // Legacy fallback (pre-075): raw table read, filtered client-side.
      try{
        const rows=await db('notifications','&order=created_at.desc&limit=30');
        setEarlierNotifs(rows.filter(n=>isNotifForUser(n,user)));
      }catch(e){console.warn('[notif] history fetch failed',e);showToast('Could not load earlier notifications');}
    }
    finally{setEarlierLoading(false);}
  };
  // Merge for display: live (unread) rows win over their history copies.
  const panelNotifs=earlierNotifs
    ?[...notifs,...earlierNotifs.filter(e=>!notifs.some(n=>n.id===e.id))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
    :notifs;

  const markAllRead=async()=>{const ids=notifs.filter(n=>!n.read).map(n=>n.id);setNotifs(ns=>ns.map(n=>({...n,read:true})));if(!ids.length)return;
    try{await rpcCall('notif_mark_all_read',{},{silentAuth:true});}
    catch(_){ // legacy fallback (pre-075): PATCH the shared rows directly
      try{await fetch(`${SB_URL}/rest/v1/notifications?id=in.(${ids.join(',')})`,{method:'PATCH',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({read:true})});}catch(e){}
    }};
  const markRead=async(id)=>{setNotifs(ns=>ns.map(n=>n.id===id?{...n,read:true}:n));
    try{await rpcCall('notif_mark_read',{p_ids:[id]},{silentAuth:true});}
    catch(_){ // legacy fallback (pre-075)
      try{await dbPatch('notifications',id,{read:true});}catch(e){}
    }};

  // Editor surface: only Home + Employee tabs exist. We route content/direct_task/attendance.
  const[empSubtab,setEmpSubtab]=useState(null);
  const[pendingLink,setPendingLink]=useState(()=>{
    try{const p=new URLSearchParams(window.location.search);const lt=p.get('lt');if(!lt)return null;const li=p.get('li');return{lt,li};}catch(_){return null;}
  });
  const openNotifTarget=async(link_type,link_id)=>{
    if(!link_type)return;
    switch(link_type){
      case 'content':{
        if(!link_id)return;
        let p=tasks.find(t=>t.id===link_id);
        if(!p){try{const rows=await db('content',`&id=eq.${link_id}`);p=rows&&rows[0];}catch(_){}}
        if(!p||p.deleted_at){showToast('Post no longer available');return;}
        openCard(p);
        break;
      }
      case 'direct_task':{
        if(link_id)setDtAutoOpenId(link_id);else setDtAutoOpenId(null);
        setDTInboxOpen(true);
        break;
      }
      case 'attendance':  setEmpSubtab({sub:'attendance',k:Date.now()});setTab('employee');break;
      case 'leave':       setEmpSubtab({sub:'leaves',k:Date.now()});setTab('employee');break;
      default: break;
    }
  };
  // Fallback when a notification has no deep-link: route by type so the click still responds.
  const notifFallbackNav=(n)=>{
    switch(n?.type){
      case 'approval':case 'revision':case 'production_done':
      case 'status':case 'task':case 'drive':                   setTab('home');return true;
      default: return false;
    }
  };
  const handleNotifClick=(n)=>{
    if(!n)return;
    if(n.id&&!n.read)markRead(n.id);
    setShowNotifs(false);
    if(n.link_type){openNotifTarget(n.link_type,n.link_id);return;}
    if(!notifFallbackNav(n))showToast('Nothing more to open for this notification');
  };

  // Cold-open deep link: fire once data is ready, then strip ?lt=&li= from the URL.
  useEffect(()=>{
    if(!pendingLink||loading)return;
    openNotifTarget(pendingLink.lt,pendingLink.li);
    setPendingLink(null);
    try{const u=new URL(window.location.href);u.searchParams.delete('lt');u.searchParams.delete('li');window.history.replaceState({},'',u.pathname+(u.search?u.search:'')+u.hash);}catch(_){}
  },[pendingLink,loading,tasks.length]);

  // Warm path: SW notificationclick → postMessage → route in-place.
  useEffect(()=>{
    if(!('serviceWorker' in navigator))return;
    const onMsg=(e)=>{const d=e?.data;if(!d||d.type!=='ams:notif-click')return;openNotifTarget(d.linkType,d.linkId);};
    navigator.serviceWorker.addEventListener('message',onMsg);
    return()=>navigator.serviceWorker.removeEventListener('message',onMsg);
  },[]);

  const openCard=(p)=>{setSel(p);setPanelOpen(true);};
  const closePanel=()=>{setPanelOpen(false);setTimeout(()=>setSel(null),260);};
  const updateTask=(u)=>{setTasks(ts=>ts.map(t=>t.id===u.id?u:t));setSel(u);};
  const updatePriority=async(task,priority)=>{
    setTasks(ts=>ts.map(t=>t.id===task.id?{...t,priority}:t));
    try{await rpcCall('content_update',{p_id:task.id,p_patch:{priority}});showToast('Priority updated');
      const actor=user?.name||'Someone';
      notifyContent({actor,assignee:task.assigned_to,title:'Priority updated',message:`${actor} set ${PRIORITY[priority]?.label||'priority'} on "${task.title||'a post'}"`,type:'info',postTitle:task.title,postId:task.id,key:'priority',debounce:true});
    }catch(e){showToast('Failed to update priority');}
  };

  const todayCount=tasks.filter(t=>taskToday(t)||taskOverdue(t)).length;

  const goTab=(t)=>{setTab(t);setDrawerOpen(false);};
  return h`<div class="layout">
    <aside class=${'sidebar'+(drawerOpen?' drawer-open':'')}>
      <div class="sb-top"><div class="sb-mark">A</div><div><div class="sb-name">AMS</div><div class="sb-sub">${user.name}</div></div></div>
      ${showDesktopBanner&&h`<${DesktopNotifBanner} onEnable=${enableDesktopNotifs} onDismiss=${dismissBanner}/>`}
      <div class="sb-sec" style=${{flex:'0 0 auto'}}><div class="sb-lbl">Workspace</div>
        <div class=${'nav'+(tab==='home'?' on':'')} onClick=${()=>goTab('home')}><i class="ti ti-home"></i><span>Home</span><span class="nav-ct">${todayCount}</span></div>
        <div class=${'nav'+(tab==='calendar'?' on':'')} onClick=${()=>goTab('calendar')}><i class="ti ti-calendar-month"></i><span>Calendar</span></div>
        <div class=${'nav'+(tab==='brands'?' on':'')} onClick=${()=>goTab('brands')}><i class="ti ti-building-store"></i><span>Brands</span></div>
        <div class=${'nav'+(tab==='employee'?' on':'')} onClick=${()=>goTab('employee')}><i class="ti ti-calendar-stats"></i><span>Employee</span></div>
        ${MessagesApp&&h`<div class=${'nav'+(tab==='chat'?' on':'')} onClick=${()=>goTab('chat')}><i class="ti ti-message-2"></i><span>Chat</span>${chatUnread>0&&h`<span class="msg-unread" style=${{marginLeft:'auto'}}>${chatUnread>99?'99+':chatUnread}</span>`}</div>`}
        <div class=${'nav'+(showNotifs?' on':'')} onClick=${()=>{setShowNotifs(true);setDrawerOpen(false);}}>
          <i class="ti ti-bell"></i><span>Notifications</span>
          ${unreadCount>0&&h`<span class="notif-badge">${unreadCount>9?'9+':unreadCount}</span>`}
        </div>
      </div>
      ${MessagesApp&&team&&team.filter(m=>m.id!==user.id).length>0&&h`<div class=${'sb-sec sb-teamchat'+(tcCollapsed?' collapsed':'')} style=${{flex:'1 1 auto',minHeight:0,display:'flex',flexDirection:'column'}}>
        <div class="sb-cli-hd"><span class="sb-cli-lbl"><i class="ti ti-messages" style=${{fontSize:13,marginRight:5,color:'var(--brand-dark)'}}></i>Team chat${!tcCollapsed?h`<span class="sb-cli-ct">${team.filter(m=>m.id!==user.id).length}</span>`:''}${chatUnread>0&&h`<span class="msg-unread" style=${{marginLeft:6}}>${chatUnread>99?'99+':chatUnread}</span>`}</span><button class="sb-cli-add" title=${tcCollapsed?'Expand team chat':'Collapse team chat'} onClick=${toggleTeamRail}><i class=${'ti '+(tcCollapsed?'ti-chevron-down':'ti-chevron-up')}></i></button></div>
        ${tcCollapsed
          ?h`<div class="tc-rail">${team.filter(m=>m.id!==user.id).map(m=>h`<div key=${m.id} class="tc-av" title=${'Chat with '+m.name} onClick=${()=>openTeamChat(m)}><${Av} i=${m.initials||m.name.slice(0,2).toUpperCase()} c=${m.color||'#999'} s=${30} round=${true}/>${dmUnread[m.id]>0&&h`<span class="tc-dot"></span>`}</div>`)}</div>`
          :h`<div class="tc-list" style=${{maxHeight:'none',flex:1}}>${team.filter(m=>m.id!==user.id).map(m=>h`<div key=${m.id} class="tc-row" onClick=${()=>openTeamChat(m)}><${Av} i=${m.initials||m.name.slice(0,2).toUpperCase()} c=${m.color||'#999'} s=${28} round=${true}/><span class="tc-nm">${m.name}</span>${dmUnread[m.id]>0&&h`<span class="msg-unread">${dmUnread[m.id]>99?'99+':dmUnread[m.id]}</span>`}</div>`)}</div>`}
      </div>`}
      <div class="sb-foot">
        <${ThemeToggle} theme=${theme} setTheme=${setTheme}/>
        <div class="sb-user" onClick=${onSignOut}>
          <${Av} i=${user.initials||user.name.slice(0,2).toUpperCase()} c=${user.color||'#FF00EE'} s=${30} round=${true}/>
          <div style=${{flex:1}}><div style=${{fontSize:13,fontWeight:500,color:'var(--t1)'}}>${user.name}</div><div style=${{fontSize:11,color:'var(--t3)'}}>Sign out</div></div>
        </div>
      </div>
    </aside>
    <div class="main">
      <${UrgentDTBanner} tasks=${directTasks} currentUser=${user} onOpen=${openDT}/>
      <div class="topbar">
        <button class="nav-toggle" aria-label="Open menu" onClick=${()=>setDrawerOpen(true)}><i class="ti ti-menu-2"></i></button>
        <div class="tb-crumb"><span class="tb-title">${tab==='employee'?'Employee':tab==='brands'?'Brands':tab==='calendar'?'Calendar':tab==='chat'?'Chat':'Home'}</span></div>
        ${tab==='home'&&h`<div class="tb-kpi">${todayCount} for today</div>`}
      </div>
      ${tab==='chat'&&MessagesApp
      ?h`<div style=${{flex:1,minHeight:0,display:'flex'}}><${MessagesApp} currentUser=${user}/></div>`
      :h`<div class="scroll">
        <${LoadErrorBanner} msg=${loadErr} onRetry=${()=>{setLoadErr(null);setLoading(true);loadTasks();}}/>
        ${tab==='home'
        ?h`<${HomeTab} user=${user} clients=${clients} team=${[]} allTasks=${tasks} loading=${loading} onCard=${openCard} onPriChange=${updatePriority} directTasks=${directTasks} onOpenDTInbox=${openDTInbox}/>`
        :tab==='calendar'
        ?h`<${CalendarTab} user=${user} showToast=${showToast}/>`
        :tab==='brands'
        ?h`<${BrandsView} showToast=${showToast}/>`
        :h`<${EmployeeView} currentUser=${user} team=${team} showToast=${showToast} initialSubtab=${empSubtab}/>`}
      </div>`}
    </div>
    <div class=${'overlay'+(panelOpen||showNotifs||dtInboxOpen?' show':'')} onClick=${()=>{closePanel();setShowNotifs(false);closeDTInbox();}}></div>
    <div class=${'panel'+(showNotifs?' open':'')}>
      <${NotifPanel} notifs=${panelNotifs} onClose=${()=>setShowNotifs(false)} onMarkAllRead=${markAllRead} onOpen=${handleNotifClick} currentUser=${user}/>
      <div style=${{padding:'10px 16px',borderTop:'1px solid var(--bd)'}}>
        ${earlierNotifs===null
          ?h`<button class="btn-sec" style=${{width:'100%',justifyContent:'center',fontSize:12}} onClick=${loadEarlier} disabled=${earlierLoading}>${earlierLoading?h`<i class="ti ti-loader-2 spinner" style=${{fontSize:13}}></i>`:h`<i class="ti ti-history" style=${{fontSize:13}}></i>`} Show earlier notifications</button>`
          :h`<div style=${{fontSize:11,color:'var(--t3)',textAlign:'center'}}>Showing the last 30 notifications, read and unread</div>`}
      </div>
    </div>
    <div class=${'panel'+(panelOpen&&!showNotifs?' open':'')}>
      <${PostPanel} post=${sel} onClose=${closePanel} onUpdate=${updateTask} showToast=${showToast} currentUser=${user} clientName=${sel?clients[sel.client_id]?.name:null}/>
    </div>
    <div class=${'panel'+(dtInboxOpen&&!showNotifs&&!panelOpen?' open':'')}>
      <${DirectTasksHomePanel} key=${dtAutoOpenId||'inbox'} tasks=${directTasks} clients=${clientsArr} currentUser=${user} onClose=${closeDTInbox} onUpdate=${updateDTInList} onDelete=${deleteDTFromList} showToast=${showToast} initialTaskId=${dtAutoOpenId}/>
    </div>
    ${showDigest&&h`<${MorningDigest} tasks=${directTasks} currentUser=${user} onClose=${()=>setShowDigest(false)} onOpen=${openDT}/>`}
    <div class=${'drawer-backdrop'+(drawerOpen?' show':'')} onClick=${()=>setDrawerOpen(false)}></div>
    <${BottomNav} tab=${tab} items=${[{id:'home',ic:'ti-home',lb:'Home'},{id:'employee',ic:'ti-calendar-stats',lb:'Employee'},...(MessagesApp?[{id:'chat',ic:'ti-message-2',lb:'Chat'}]:[])]} onNav=${goTab} onNotifs=${()=>setShowNotifs(true)} unreadCount=${unreadCount} notifsActive=${showNotifs}/>
    ${toast&&h`<${Toast} key=${toast.k} msg=${toast.msg}/>`}
  </div>`;
}

    return { TasksApp };
  }
  window.AMS_EMPLOYEE = { buildEmployee };
})();

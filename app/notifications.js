// notifications.js — notification panel + desktop banner (presentational), extracted
// from index.html (Phase 3.7 split). The notification HELPERS (insertNotif, notifyContent,
// polling/realtime) are cross-cutting glue and stay in index.html. window.AMS_NOTIFS.buildNotifs(deps)
// -> { NotifPanel, DesktopNotifBanner }.
(function(){
  function buildNotifs(deps){
    const {React,h,useState,useEffect,NOTIF_ICONS,fmtRelative,t} = deps;

    // ── NotifPanel (bell dropdown) ──
function NotifPanel({notifs,onClose,onMarkAllRead,onOpen,currentUser}){
  const unread=notifs.filter(n=>!n.read).length;
  return h`<div>
    <div class="panel-head">
      <div><div style=${{fontSize:15,fontWeight:600}}>Notifications</div>${unread>0&&h`<div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>${unread} unread</div>`}</div>
      <div style=${{display:'flex',gap:6}}>
        ${unread>0&&h`<button class="btn-sec" style=${{padding:'6px 12px',fontSize:12}} onClick=${onMarkAllRead}>Mark all read</button>`}
        <button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button>
      </div>
    </div>
    ${notifs.length===0?h`<div class="empty" style=${{padding:'60px 20px'}}><i class="ti ti-bell" style=${{fontSize:36,display:'block',marginBottom:12,color:'var(--t3)'}}></i><div class="empty-t" style=${{fontSize:15}}>All caught up</div><div class="empty-s" style=${{fontSize:13}}>Notifications show here when your team makes updates</div></div>`
    :notifs.map(n=>{const ni=NOTIF_ICONS[n.type]||NOTIF_ICONS.info;const hasLink=!!n.link_type;return h`<div key=${n.id} class=${'notif-item'+(n.read?'':' unread')+(hasLink?' has-link':'')} onClick=${()=>onOpen(n)} title=${hasLink?'Open':''}>
      <div class="notif-icon" style=${{background:ni.bg}}><i class=${'ti '+ni.icon} style=${{color:ni.col}}></i></div>
      <div style=${{flex:1,minWidth:0}}>
        <div class="notif-title">${n.title}</div>
        <div class="notif-msg">${n.message}</div>
        ${(n.client_name||n.post_title)&&h`<div style=${{fontSize:11,color:'var(--t3)',marginTop:3}}>${[n.client_name,n.post_title].filter(Boolean).join(' · ')}</div>`}
        <div class="notif-time">${fmtRelative(n.created_at)}</div>
      </div>
      ${!n.read&&h`<div class="notif-dot"></div>`}
      ${hasLink&&h`<i class="ti ti-chevron-right notif-chev"></i>`}
    </div>`;})
  }
  </div>`;
}

    // ── DesktopNotifBanner ──
function DesktopNotifBanner({onEnable,onDismiss}){
  return h`<div class="desktop-notif-banner">
    <i class="ti ti-bell-ringing" style=${{color:'#fff',fontSize:16,flexShrink:0}}></i>
    <div style=${{flex:1,fontSize:12,color:'rgba(255,255,255,.9)',lineHeight:1.4}}>Enable notifications on this device for instant team updates</div>
    <button onClick=${onEnable}>Enable</button>
    <button onClick=${onDismiss} style=${{background:'transparent',border:'none',padding:'4px'}}><i class="ti ti-x" style=${{color:'rgba(255,255,255,.6)',fontSize:14}}></i></button>
  </div>`;
}

    return { NotifPanel, DesktopNotifBanner };
  }
  window.AMS_NOTIFS = { buildNotifs };
})();

// client_portal.js — Mobile-first client-facing portal for the AMS dashboard.
//
// Loaded as a module BEFORE the inline script in index.html. Defines
// window.AMS_PORTAL.buildClientPortal(deps) — a factory the inline script
// calls (once its own React/htm/db helpers are ready) to receive ClientPortal.
//
// Routing: the App component in index.html checks role_level==='client'
// and renders <ClientPortal> instead of DashboardApp/TasksApp. Login flow
// itself is unchanged — we reuse verify_login_hash and the existing
// team_members row, just with role_level='client' and a client_id FK.

(function () {
  function injectFonts() {
    if (document.getElementById('cp-fonts-1')) return;
    [
      ['cp-fonts-1', 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&display=swap'],
      ['cp-fonts-2', 'https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap'],
    ].forEach(([id, href]) => {
      const link = document.createElement('link');
      link.id = id; link.rel = 'stylesheet'; link.href = href;
      document.head.appendChild(link);
    });
  }
  function injectStyles() {
    if (document.getElementById('cp-styles')) return;
    injectFonts();
    const css = `
/* Scoped solid theme tokens — the main app defines --bg as a translucent
   glass-morphism color (rgba ...,.72) and never defines --bg2 at all, so any
   .cp-* surface that says background:var(--bg) bleeds the layer behind it.
   Redefine the tokens inside .cp-root so the portal renders fully opaque. */
.cp-root{
  --bg:#FFFFFF;
  --bg2:#F5F5F0;
  --bd:rgba(60,60,55,.10);
  --bd2:rgba(60,60,55,.22);
  --t1:#1A1A1A;
  --t2:#5E5C58;
  --t3:#8E8C87;
}
html.dark .cp-root{
  --bg:#0F0F0E;
  --bg2:#1A1A19;
  --bd:rgba(255,255,255,.10);
  --bd2:rgba(255,255,255,.20);
  --t1:#EDEDEC;
  --t2:#B5B3AD;
  --t3:#7F7D77;
}
.cp-root{position:fixed;inset:0;background:var(--bg);color:var(--t1);display:flex;flex-direction:column;font-family:inherit;z-index:100;overflow:hidden}
.cp-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 12px;border-bottom:1px solid var(--bd);background:var(--bg);flex-shrink:0}
.cp-head-l{display:flex;align-items:center;gap:10px;min-width:0}
.cp-mark{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px;flex-shrink:0;letter-spacing:.02em}
.cp-head-name{font-size:14px;font-weight:600;line-height:1.15;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-head-sub{font-size:10.5px;color:var(--t3);margin-top:1px;letter-spacing:.02em;text-transform:uppercase}
.cp-head-r{display:flex;align-items:center;gap:2px;flex-shrink:0}
.cp-bell{border:none;background:transparent;padding:6px;cursor:pointer;position:relative;color:var(--t1);border-radius:8px}
.cp-bell:hover{background:var(--bg2)}
.cp-bell .dot{position:absolute;top:4px;right:4px;width:7px;height:7px;background:var(--brand,#ff00ee);border-radius:50%}
.cp-help-sheet{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:260;display:flex;align-items:flex-end;animation:cp-fade .15s ease}
.cp-help-panel{width:100%;background:var(--bg);border-radius:18px 18px 0 0;max-height:90vh;display:flex;flex-direction:column;animation:cp-slide .22s ease}
.cp-help-grip{width:36px;height:4px;background:var(--bd);border-radius:2px;margin:10px auto 0}
.cp-help-head{padding:14px 18px 8px;display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--bd)}
.cp-help-h{font-family:'Fraunces',Georgia,serif;font-weight:400;font-size:20px;letter-spacing:-.01em;color:var(--t1);font-variation-settings:'opsz' 48}
.cp-help-sub{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:12px;color:var(--t3)}
.cp-help-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:8px 4px max(24px,env(safe-area-inset-bottom))}
.cp-faq{border-bottom:1px solid var(--bd);padding:0 14px}
.cp-faq:last-child{border-bottom:none}
.cp-faq-q{width:100%;background:transparent;border:none;font-family:inherit;text-align:left;padding:14px 4px;font-size:13.5px;font-weight:500;color:var(--t1);cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;-webkit-tap-highlight-color:transparent}
.cp-faq-q i{font-size:16px;color:var(--t3);flex-shrink:0;transition:transform .2s ease}
.cp-faq.open .cp-faq-q i{transform:rotate(180deg);color:var(--brand,#ff00ee)}
.cp-faq-a{display:none;font-size:13px;line-height:1.6;color:var(--t2);padding:0 4px 14px;font-family:'Newsreader',Georgia,serif}
.cp-faq-a em{font-style:italic}
.cp-faq.open .cp-faq-a{display:block}
.cp-faq-foot{padding:18px 18px 12px;text-align:center;font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:12.5px;color:var(--t3);line-height:1.6}
.cp-faq-foot a{color:var(--t2);text-decoration:none;border-bottom:1px solid var(--bd);padding-bottom:1px}
.cp-faq-foot a:hover{color:var(--brand,#ff00ee);border-color:var(--brand,#ff00ee)}
.cp-notif-sheet{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:260;display:flex;align-items:flex-end;animation:cp-fade .15s ease}
.cp-notif-panel{width:100%;background:var(--bg);border-radius:18px 18px 0 0;max-height:90vh;display:flex;flex-direction:column;animation:cp-slide .22s ease}
.cp-notif-head{padding:14px 18px 12px;display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--bd)}
.cp-notif-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px 0 max(16px,env(safe-area-inset-bottom))}
.cp-notif-row{display:flex;align-items:flex-start;gap:12px;padding:13px 16px;border-bottom:1px solid var(--bd);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .12s ease}
.cp-notif-row:hover{background:var(--bg2)}
.cp-notif-row.unread{background:rgba(255,0,238,.045)}
.cp-notif-row.unread:hover{background:rgba(255,0,238,.07)}
.cp-notif-ic{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px}
.cp-notif-ic.approval{background:rgba(21,128,61,.1);color:#15803D}
.cp-notif-ic.revision{background:rgba(220,38,38,.1);color:#DC2626}
.cp-notif-ic.info{background:rgba(255,0,238,.1);color:#A8009C}
.cp-notif-ic.alert{background:rgba(180,83,9,.12);color:#B45309}
.cp-notif-ic.status{background:rgba(67,56,202,.1);color:#4338CA}
html.dark .cp-notif-ic.approval{background:rgba(74,222,128,.16);color:#4ADE80}
html.dark .cp-notif-ic.revision{background:rgba(248,113,113,.16);color:#F87171}
html.dark .cp-notif-ic.info{background:rgba(255,0,238,.18);color:#FF66F5}
html.dark .cp-notif-ic.alert{background:rgba(251,191,36,.16);color:#FBBF24}
.cp-notif-mid{flex:1;min-width:0}
.cp-notif-title{font-size:13px;font-weight:600;color:var(--t1);line-height:1.35;word-break:break-word}
.cp-notif-msg{font-size:12px;color:var(--t2);margin-top:3px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.cp-notif-time{font-size:10.5px;color:var(--t3);margin-top:5px;font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:.04em}
.cp-notif-dot{width:8px;height:8px;border-radius:50%;background:var(--brand,#ff00ee);flex-shrink:0;margin-top:14px}
.cp-notif-empty{padding:48px 24px;text-align:center;color:var(--t3)}
.cp-notif-empty i{font-size:38px;display:block;margin-bottom:14px;color:var(--t3)}
.cp-notif-empty p{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:13px;line-height:1.5;margin:0}
.cp-select-circle{position:absolute;top:12px;left:12px;z-index:4;width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1.5px solid rgba(255,255,255,.6);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .12s ease,transform .08s ease}
.cp-select-circle i{font-size:14px;opacity:0;transition:opacity .12s ease}
.cp-select-circle:active{transform:scale(.92)}
.cp-select-circle.on{background:#15803D;border-color:#15803D}
.cp-select-circle.on i{opacity:1}
.cp-batch-bar{position:fixed;left:0;right:0;bottom:0;z-index:160;background:var(--bg);border-top:1px solid var(--bd);padding:12px 16px calc(12px + env(safe-area-inset-bottom));display:flex;gap:8px;align-items:center;box-shadow:0 -4px 16px rgba(0,0,0,.06);animation:cp-batch-up .22s ease}
@keyframes cp-batch-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
.cp-batch-count{flex:1;font-family:'Fraunces',Georgia,serif;font-size:14px;color:var(--t1);letter-spacing:-.005em;font-variation-settings:'opsz' 24}
.cp-batch-count em{font-style:italic;color:var(--brand,#ff00ee)}
.cp-batch-cancel{background:transparent;border:1px solid var(--bd);color:var(--t2);font-family:inherit;font-size:12.5px;font-weight:500;padding:10px 14px;border-radius:9px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.cp-batch-approve{background:#15803D;color:#fff;border:none;font-family:inherit;font-size:13px;font-weight:600;padding:11px 18px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;-webkit-tap-highlight-color:transparent;letter-spacing:.01em}
.cp-batch-approve:disabled{opacity:.6;cursor:not-allowed}
.cp-batch-approve:active{transform:scale(.98)}
html.dark .cp-batch-approve{background:#16A34A}
.cp-batch-spacer{height:96px}
.cp-main{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain}
.cp-ptr{height:0;display:flex;align-items:center;justify-content:center;color:var(--t3);overflow:hidden;transition:height .18s ease,opacity .18s ease;opacity:0}
.cp-ptr i{font-size:18px}
.cp-ptr.refreshing i{animation:cp-spin 1s linear infinite;color:var(--brand,#ff00ee)}
@keyframes cp-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.cp-pad{padding:18px 16px 32px}
.cp-greet{font-size:20px;font-weight:600;color:var(--t1);line-height:1.2}
.cp-greet-sub{font-size:12.5px;color:var(--t2);margin-top:4px}
.cp-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0 22px}
.cp-tile{background:var(--bg2);border-radius:12px;padding:12px 14px;min-height:78px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid var(--bd)}
.cp-tile-lbl{font-size:10.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;font-weight:500}
.cp-tile-val{font-size:22px;font-weight:600;color:var(--t1);line-height:1.05;margin-top:6px}
.cp-tile-meta{font-size:10.5px;color:var(--t3);margin-top:4px;display:flex;align-items:center;gap:3px}
.cp-tile-meta.up{color:#15803D}
.cp-tile.soon .cp-tile-val{color:var(--t3);font-size:15px;font-weight:500;font-style:italic}
.cp-section-head{display:flex;align-items:center;justify-content:space-between;margin:0 0 12px}
.cp-section-title{font-size:14px;font-weight:600;color:var(--t1)}
.cp-pill{padding:2px 9px;border-radius:10px;font-size:10.5px;font-weight:600;background:#FEE2E2;color:#DC2626}
.cp-pill.zero{background:var(--bg2);color:var(--t3)}
.cp-empty{padding:32px 18px;text-align:center;color:var(--t3);font-size:13px;background:var(--bg2);border-radius:12px;border:1px dashed var(--bd)}
.cp-empty i{font-size:32px;margin-bottom:10px;display:block;color:var(--t3)}
.cp-card{border:1px solid var(--bd);border-radius:14px;overflow:hidden;background:var(--bg);margin-bottom:12px}
.cp-card-img{aspect-ratio:4/5;display:flex;align-items:flex-end;padding:18px;color:#fff;position:relative;overflow:hidden}
.cp-card-img.has-link{cursor:pointer}
.cp-card-img-inner{position:relative;z-index:2}
.cp-card-img::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,rgba(0,0,0,.45) 100%);pointer-events:none}
.cp-card-mark{font-size:26px;font-weight:600;letter-spacing:-.02em}
.cp-card-cap{font-size:12px;opacity:.92;margin-top:4px;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.cp-card-body{padding:14px}
.cp-card-meta{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:var(--t3);margin-bottom:8px;text-transform:uppercase;letter-spacing:.03em}
.cp-card-meta .l{display:inline-flex;align-items:center;gap:5px;font-weight:500}
.cp-card-caption{margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--t1);max-height:84px;overflow:hidden;position:relative}
.cp-card-caption.collapsed::after{content:'';position:absolute;left:0;right:0;bottom:0;height:24px;background:linear-gradient(180deg,transparent,var(--bg))}
.cp-acts{display:flex;gap:8px}
.cp-btn{flex:1;padding:11px;font-size:12.5px;border-radius:10px;border:none;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:inherit;-webkit-tap-highlight-color:transparent;transition:transform .08s ease,opacity .15s ease}
.cp-btn:active{transform:scale(.97)}
.cp-btn:disabled{opacity:.5;cursor:not-allowed}
.cp-btn.pri{background:#15803D;color:#fff}
.cp-btn.sec{border:1px solid var(--bd);background:transparent;color:var(--t1)}
.cp-btn.rev{border:1px solid #DC2626;background:transparent;color:#DC2626}
.cp-card-foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:11px;color:var(--t3)}
.cp-card-foot a{color:var(--t2);text-decoration:none;display:inline-flex;align-items:center;gap:4px}
.cp-card-foot a:hover{color:var(--brand,#ff00ee)}
.cp-dots{display:flex;justify-content:center;gap:6px;margin:14px 0 20px}
.cp-dots span{width:5px;height:5px;border-radius:50%;background:var(--bd)}
.cp-dots span.on{background:var(--t1);width:18px;border-radius:3px}
.cp-week{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:22px}
.cp-day{background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:8px 4px;text-align:center}
.cp-day.today{border-color:var(--brand,#ff00ee);background:rgba(255,0,238,.06)}
.cp-day-dow{font-size:9.5px;color:var(--t3);text-transform:uppercase;font-weight:500;letter-spacing:.04em}
.cp-day-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin:6px 0;background:var(--bd)}
.cp-day-dot.pending{background:#B45309}
.cp-day-dot.approved{background:#15803D}
.cp-day-dot.posted{background:#0E7490}
.cp-day-dot.revision{background:#DC2626}
.cp-day-dot.scheduled{background:#4338CA}
.cp-day-num{font-size:11px;color:var(--t1);font-weight:500}
.cp-act-row{display:flex;align-items:center;gap:10px;padding:11px 12px;background:var(--bg2);border:1px solid var(--bd);border-radius:10px;margin-bottom:6px;font-size:12px}
.cp-act-av{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:600;color:#fff;flex-shrink:0}
.cp-act-text{flex:1;min-width:0;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-act-text b{font-weight:600}
.cp-act-time{font-size:10px;color:var(--t3);flex-shrink:0}
.cp-nav{display:flex;border-top:1px solid var(--bd);background:var(--bg);padding:8px 0 max(10px,env(safe-area-inset-bottom));flex-shrink:0}
.cp-nav-btn{flex:1;background:transparent;border:none;cursor:pointer;text-align:center;color:var(--t3);padding:6px 0;font-family:inherit;-webkit-tap-highlight-color:transparent;position:relative}
.cp-nav-btn:active{opacity:.6}
.cp-nav-btn.on{color:var(--t1)}
.cp-nav-btn i{font-size:22px;display:block;margin-bottom:2px}
.cp-nav-btn span{font-size:10px;font-weight:500}
.cp-nav-badge{position:absolute;top:0;right:calc(50% - 18px);background:var(--brand,#ff00ee);color:#fff;font-size:9.5px;font-weight:600;padding:1px 5px;border-radius:8px;min-width:16px;text-align:center;line-height:1.4}
.cp-list{display:flex;flex-direction:column;gap:0}
.cp-sheet-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:200;display:flex;align-items:flex-end;animation:cp-fade .15s ease}
.cp-sheet{width:100%;background:var(--bg);border-radius:18px 18px 0 0;padding:20px 18px max(24px,env(safe-area-inset-bottom));animation:cp-slide .2s ease}
.cp-sheet-grip{width:36px;height:4px;background:var(--bd);border-radius:2px;margin:0 auto 14px}
.cp-sheet-title{font-size:16px;font-weight:600;color:var(--t1);margin-bottom:4px}
.cp-sheet-sub{font-size:12.5px;color:var(--t2);margin-bottom:14px}
.cp-sheet-ta{width:100%;min-height:110px;border:1px solid var(--bd);background:var(--bg2);border-radius:10px;padding:12px;font-size:13.5px;color:var(--t1);font-family:inherit;resize:none;outline:none;line-height:1.5}
.cp-sheet-ta:focus{border-color:var(--brand,#ff00ee);background:var(--bg)}
.cp-sheet-acts{display:flex;gap:8px;margin-top:14px}
.cp-toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:10px 14px 10px 16px;border-radius:24px;font-size:12.5px;z-index:300;display:flex;align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);animation:cp-toast .25s ease;max-width:calc(100vw - 32px)}
.cp-toast i{color:#4ADE80;font-size:14px}
.cp-toast-action{background:transparent;border:none;color:#FF66F5;font-family:inherit;font-size:12px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;cursor:pointer;padding:4px 6px;-webkit-tap-highlight-color:transparent}
.cp-toast-action:hover{color:#fff}
.cp-toast-action:active{opacity:.7}
.cp-loading{display:flex;align-items:center;justify-content:center;height:100%;color:var(--t3);font-size:13px;flex-direction:column;gap:10px}
.cp-loading i{font-size:24px}
.cp-status-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:10px;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em}
.cp-status-pill.pending{background:#FEF3C7;color:#B45309}
.cp-status-pill.approved{background:#DCFCE7;color:#15803D}
.cp-status-pill.revision{background:#FEE2E2;color:#DC2626}
.cp-status-pill.scheduled{background:#E0E7FF;color:#4338CA}
.cp-status-pill.posted{background:#CCFBF1;color:#0E7490}
.cp-tz-tag{display:inline-flex;align-items:center;margin-left:6px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:8.5px;font-weight:500;letter-spacing:.18em;color:var(--t3);background:var(--bg2);padding:2px 5px 1px;border-radius:2px;text-transform:uppercase;line-height:1.4}
.cp-rev-tag{display:inline-flex;align-items:center;gap:4px;margin-left:6px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:8.5px;font-weight:600;letter-spacing:.18em;color:#A8009C;background:rgba(255,0,238,.1);padding:2px 6px 1px;border-radius:2px;text-transform:uppercase;line-height:1.4}
.cp-rev-tag i{font-size:9px}
html.dark .cp-rev-tag{color:#FF66F5;background:rgba(255,0,238,.18)}
.cp-acct{padding:24px 18px}
.cp-acct-head{display:flex;align-items:center;gap:14px;margin-bottom:24px}
.cp-acct-mark{width:54px;height:54px;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:22px;letter-spacing:.02em}
.cp-acct-name{font-size:18px;font-weight:600;color:var(--t1)}
.cp-acct-email{font-size:12.5px;color:var(--t3);margin-top:3px}
.cp-acct-row{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-radius:10px;background:var(--bg2);border:1px solid var(--bd);margin-bottom:8px;font-size:13px;color:var(--t1)}
.cp-acct-row .lbl{display:flex;align-items:center;gap:10px;color:var(--t2)}
.cp-acct-row .lbl i{font-size:16px;color:var(--t3)}
.cp-acct-row .val{color:var(--t1);font-weight:500;max-width:55%;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-team{margin:4px 0 16px;padding:14px;border:1px solid var(--bd);border-radius:12px;background:linear-gradient(180deg,rgba(255,0,238,.04),rgba(255,0,238,.01) 60%,transparent)}
.cp-team-h{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--t3);font-weight:500;margin-bottom:12px}
.cp-team-card{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.cp-team-av{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px;letter-spacing:.02em;flex-shrink:0;box-shadow:0 2px 8px rgba(255,0,238,.25)}
.cp-team-body{flex:1;min-width:0}
.cp-team-name{font-family:'Fraunces',Georgia,serif;font-size:16px;font-weight:400;color:var(--t1);letter-spacing:-.005em;font-variation-settings:'opsz' 24;line-height:1.2}
.cp-team-role{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:11.5px;color:var(--t2);margin-top:2px}
.cp-team-contact{display:flex;gap:8px}
.cp-team-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px;border-radius:9px;border:1px solid var(--bd);background:var(--bg);color:var(--t1);text-decoration:none;font-size:12.5px;font-weight:500;font-family:inherit;-webkit-tap-highlight-color:transparent;transition:background .12s ease}
.cp-team-btn:hover{background:var(--bg2)}
.cp-team-btn:active{transform:scale(.98)}
.cp-team-btn i{font-size:15px}
.cp-team-btn.wa{color:#15803D;border-color:rgba(21,128,61,.3)}
html.dark .cp-team-btn.wa{color:#4ADE80;border-color:rgba(74,222,128,.32)}
.cp-acct-row .edit-btn{background:transparent;border:none;color:var(--t3);padding:4px 6px;border-radius:6px;cursor:pointer;flex-shrink:0;-webkit-tap-highlight-color:transparent}
.cp-acct-row .edit-btn:hover{background:var(--bg);color:var(--brand,#ff00ee)}
.cp-acct-row .edit-btn i{font-size:14px}
.cp-acct-edit{background:var(--bg);border:1px solid var(--brand,#ff00ee);box-shadow:0 0 0 3px rgba(255,0,238,.08);align-items:stretch;flex-direction:column;gap:8px;padding:12px 14px}
.cp-acct-edit .lbl{margin-bottom:2px}
.cp-acct-edit input{width:100%;border:1px solid var(--bd);background:var(--bg2);border-radius:8px;padding:9px 11px;font-size:13.5px;color:var(--t1);font-family:inherit;outline:none;-webkit-appearance:none;appearance:none}
.cp-acct-edit input:focus{border-color:var(--brand,#ff00ee);background:var(--bg);box-shadow:0 0 0 2px rgba(255,0,238,.12)}
.cp-acct-edit .acts{display:flex;gap:6px;margin-top:2px}
.cp-acct-edit .acts button{flex:1;padding:9px;border-radius:8px;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer;-webkit-tap-highlight-color:transparent;border:1px solid var(--bd2);background:transparent;color:var(--t1)}
.cp-acct-edit .acts button.save{background:var(--brand,#ff00ee);color:#fff;border-color:var(--brand,#ff00ee)}
.cp-acct-edit .acts button.save:disabled{opacity:.55;cursor:not-allowed}
.cp-acct-edit .acts button:active{transform:scale(.98)}
.cp-acct-help{margin:6px 2px 4px;font-size:11px;color:var(--t3);line-height:1.5;font-family:'Newsreader',Georgia,serif;font-style:italic}
.cp-prefs{margin:10px 0 14px;padding:14px;border:1px solid var(--bd);border-radius:12px;background:var(--bg2)}
.cp-prefs-h{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--t3);font-weight:500;margin-bottom:10px}
.cp-brand-team{margin:4px 0 16px;padding:14px;border:1px solid var(--bd);border-radius:12px;background:var(--bg2)}
.cp-brand-team-row{display:flex;align-items:center;gap:12px;padding:10px 2px}
.cp-brand-team-row:not(:last-child){border-bottom:1px solid var(--bd)}
.cp-brand-team-av{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:12px;letter-spacing:.02em;flex-shrink:0}
.cp-brand-team-mid{flex:1;min-width:0}
.cp-brand-team-name{font-family:'Fraunces',Georgia,serif;font-weight:400;font-size:15px;color:var(--t1);letter-spacing:-.005em;line-height:1.2;display:flex;align-items:center;gap:6px;font-variation-settings:'opsz' 24}
.cp-brand-team-you{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:8.5px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--brand,#ff00ee);background:rgba(255,0,238,.1);padding:2px 6px 1px;border-radius:2px}
.cp-brand-team-sub{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:11.5px;color:var(--t2);margin-top:1px}
.cp-brand-team-pri{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:8.5px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#A8009C;background:rgba(255,0,238,.1);padding:3px 7px 2px;border-radius:2px;flex-shrink:0}
html.dark .cp-brand-team-pri{color:#FF66F5;background:rgba(255,0,238,.18)}
.cp-brand-team-foot{margin-top:10px;padding-top:10px;border-top:1px solid var(--bd);font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:11.5px;color:var(--t3);line-height:1.5}
.cp-prefs-row{display:flex;align-items:center;gap:12px;padding:9px 2px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.cp-prefs-row:not(:last-child){border-bottom:1px solid var(--bd)}
.cp-prefs-mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.cp-prefs-lbl{font-size:13px;color:var(--t1);font-weight:500}
.cp-prefs-hint{font-size:11.5px;color:var(--t3);font-family:'Newsreader',Georgia,serif;font-style:italic;line-height:1.3}
.cp-switch{position:relative;flex-shrink:0}
.cp-switch input{position:absolute;opacity:0;width:0;height:0}
.cp-switch-track{display:block;width:38px;height:22px;border-radius:99px;background:rgba(60,60,55,.22);transition:background .18s ease;position:relative}
.cp-switch-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:transform .18s cubic-bezier(.2,.8,.2,1)}
.cp-switch.on .cp-switch-track{background:var(--brand,#ff00ee)}
.cp-switch.on .cp-switch-knob{transform:translateX(16px)}
.cp-switch.busy{opacity:.6}
html.dark .cp-switch-track{background:rgba(255,255,255,.18)}
html.dark .cp-switch.on .cp-switch-track{background:var(--brand,#ff00ee)}
.cp-signout{margin-top:18px;width:100%;padding:14px;background:transparent;border:1px solid #DC2626;color:#DC2626;border-radius:10px;font-size:13.5px;font-weight:600;font-family:inherit;cursor:pointer}
.cp-signout:active{background:rgba(220,38,38,.08)}
.cp-soon{padding:48px 24px;text-align:center;color:var(--t3)}
.cp-soon i{font-size:42px;margin-bottom:16px;display:block;color:var(--t3)}
.cp-soon h3{font-size:16px;font-weight:600;color:var(--t1);margin:0 0 8px}
.cp-soon p{font-size:12.5px;line-height:1.55;margin:0;max-width:280px;margin:0 auto}
@keyframes cp-fade{from{opacity:0}to{opacity:1}}
@keyframes cp-slide{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes cp-toast{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
html.dark .cp-tile-meta.up{color:#4ADE80}
html.dark .cp-status-pill.pending{background:rgba(245,158,11,.18);color:#FBBF24}
html.dark .cp-status-pill.approved{background:rgba(34,197,94,.18);color:#4ADE80}
html.dark .cp-status-pill.revision{background:rgba(239,68,68,.18);color:#F87171}
html.dark .cp-status-pill.scheduled{background:rgba(99,102,241,.18);color:#A5B4FC}
html.dark .cp-status-pill.posted{background:rgba(20,184,166,.18);color:#5EEAD4}
html.dark .cp-btn.pri{background:#16A34A}
.cp-detail{position:fixed;inset:0;background:var(--bg);z-index:250;display:flex;flex-direction:column;animation:cp-slide-up .22s ease}
.cp-detail-head{display:flex;align-items:center;gap:10px;padding:14px 14px 12px;border-bottom:1px solid var(--bd);background:var(--bg);flex-shrink:0}
.cp-detail-head .x{border:none;background:transparent;color:var(--t1);padding:6px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;-webkit-tap-highlight-color:transparent}
.cp-detail-head .x:active{background:var(--bg2)}
.cp-detail-head-t{flex:1;min-width:0;font-size:14px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-detail-main{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}
.cp-detail-hero{aspect-ratio:4/5;display:flex;align-items:flex-end;padding:22px;color:#fff;position:relative;overflow:hidden;cursor:pointer}
.cp-detail-hero::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,rgba(0,0,0,.5) 100%);pointer-events:none}
.cp-detail-hero-inner{position:relative;z-index:2;width:100%}
.cp-detail-hero-mark{font-size:34px;font-weight:600;letter-spacing:-.02em;line-height:1}
.cp-detail-hero-title{font-size:17px;font-weight:600;margin-top:8px;line-height:1.25;text-shadow:0 1px 3px rgba(0,0,0,.3)}
.cp-detail-hero-hint{position:absolute;top:14px;right:14px;z-index:2;background:rgba(0,0,0,.4);color:#fff;padding:4px 10px;border-radius:14px;font-size:10px;font-weight:500;display:flex;align-items:center;gap:5px;backdrop-filter:blur(6px)}
.cp-detail-body{padding:18px 16px 32px}
.cp-detail-meta{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--t3);margin-bottom:14px;text-transform:uppercase;letter-spacing:.03em;flex-wrap:wrap}
.cp-detail-meta .l{display:inline-flex;align-items:center;gap:5px;font-weight:500}
.cp-detail-block{margin-bottom:18px}
.cp-detail-block-lbl{font-size:10.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-bottom:6px}
.cp-detail-block-lbl-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
.cp-detail-block-lbl-row .cp-detail-block-lbl{margin-bottom:0}
.cp-copy-btn{display:inline-flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--bd);color:var(--t2);font-family:inherit;font-size:10.5px;font-weight:500;letter-spacing:.02em;padding:4px 10px;border-radius:99px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .12s ease,color .12s ease,border-color .12s ease}
.cp-copy-btn i{font-size:13px}
.cp-copy-btn:hover{background:var(--bg2);color:var(--t1)}
.cp-copy-btn:active{transform:scale(.97)}
.cp-copy-btn.done{background:rgba(21,128,61,.08);border-color:rgba(21,128,61,.3);color:#15803D}
html.dark .cp-copy-btn.done{background:rgba(74,222,128,.12);border-color:rgba(74,222,128,.35);color:#4ADE80}
.cp-detail-caption{font-size:13.5px;line-height:1.55;color:var(--t1);white-space:pre-wrap;word-break:break-word;background:var(--bg2);border:1px solid var(--bd);border-radius:10px;padding:12px 14px}
.cp-detail-tags{font-size:13px;line-height:1.55;color:#6D28D9;word-break:break-word}
.cp-detail-tags strong{color:var(--t2)}
.cp-detail-links{display:flex;gap:8px;flex-wrap:wrap}
.cp-link-btn{flex:1;min-width:140px;padding:11px 14px;border-radius:10px;border:1px solid var(--bd);background:var(--bg2);color:var(--t1);font-size:12.5px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;text-decoration:none;font-family:inherit}
.cp-link-btn:active{transform:scale(.98)}
.cp-link-btn i{font-size:15px}
.cp-detail-acts{display:flex;gap:8px;margin-top:18px;padding-top:18px;border-top:1px solid var(--bd)}
.cp-thread{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.cp-bubble{padding:9px 12px;border-radius:10px;font-size:13px;line-height:1.5;color:var(--t1);max-width:88%;word-break:break-word;white-space:pre-wrap}
.cp-bubble.mine{align-self:flex-end;background:rgba(255,0,238,.1);border:1px solid rgba(255,0,238,.25);color:var(--t1)}
.cp-bubble.theirs{align-self:flex-start;background:var(--bg2);border:1px solid var(--bd)}
.cp-bubble-meta{font-size:10px;color:var(--t3);margin-top:4px;text-align:right}
.cp-bubble.theirs .cp-bubble-meta{text-align:left}
.cp-bubble-author{font-weight:600;font-size:10.5px;margin-bottom:3px;display:flex;align-items:center;gap:5px}
.cp-bubble.mine .cp-bubble-author{color:#A8009C}
.cp-bubble.theirs .cp-bubble-author{color:var(--t2)}
.cp-thread-empty{font-size:12px;color:var(--t3);font-style:italic;padding:18px 8px;text-align:center}
.cp-reply{display:flex;gap:6px;margin-top:14px;align-items:flex-end}
.cp-reply textarea{flex:1;min-height:42px;max-height:140px;resize:none;border:1px solid var(--bd);background:var(--bg2);border-radius:12px;padding:10px 14px;font-size:13.5px;color:var(--t1);font-family:inherit;outline:none;line-height:1.45}
.cp-reply textarea:focus{border-color:var(--brand,#ff00ee);background:var(--bg)}
.cp-reply button{padding:10px 12px;border-radius:12px;border:none;background:var(--brand,#ff00ee);color:#fff;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;gap:5px;font-family:inherit;min-width:44px}
.cp-reply button:disabled{opacity:.4;cursor:not-allowed}
.cp-reply button:active{transform:scale(.96)}
.cp-reply.rev textarea:focus{border-color:#DC2626}
.cp-reply.rev button{background:#DC2626}
.cp-reply-acts{display:flex;align-items:center;gap:6px}
.cp-attach-btn{background:transparent;border:1px solid var(--bd);color:var(--t2);padding:9px 11px;border-radius:12px;cursor:pointer;flex-shrink:0;-webkit-tap-highlight-color:transparent;transition:background .12s ease,color .12s ease,border-color .12s ease}
.cp-attach-btn:hover{background:var(--bg2);color:var(--brand,#ff00ee);border-color:rgba(255,0,238,.4)}
.cp-attach-btn:disabled{opacity:.45;cursor:not-allowed}
.cp-attach-btn i{font-size:16px}
.cp-attach-pending{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}
.cp-attach-chip{position:relative;width:56px;height:56px;border-radius:8px;overflow:hidden;border:1px solid var(--bd);background:var(--bg2);display:flex;align-items:center;justify-content:center}
.cp-attach-chip img{width:100%;height:100%;object-fit:cover;display:block}
.cp-attach-chip.uploading{opacity:.6}
.cp-attach-chip .x{position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#DC2626;color:#fff;border:none;font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.cp-attach-chip .spinner-overlay{position:absolute;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;animation:cp-spin 1s linear infinite}
.cp-bubble-imgs{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:5px;margin-top:6px;max-width:240px}
.cp-bubble-img{aspect-ratio:1/1;border-radius:6px;overflow:hidden;background:var(--bg2);cursor:pointer;border:1px solid var(--bd);-webkit-tap-highlight-color:transparent}
.cp-bubble-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s ease}
.cp-bubble-img:active img{transform:scale(.97)}
.cp-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:300;display:flex;align-items:center;justify-content:center;animation:cp-fade .15s ease;-webkit-tap-highlight-color:transparent;cursor:zoom-out;padding:env(safe-area-inset-top) 16px env(safe-area-inset-bottom)}
.cp-lightbox img{max-width:100%;max-height:100%;object-fit:contain}
.cp-lightbox .close{position:absolute;top:max(14px,env(safe-area-inset-top));right:14px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#fff;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer}
.cp-rev-link{display:inline-flex;align-items:center;gap:4px;margin-left:8px;font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:12px;color:var(--t2);background:transparent;border:none;border-bottom:1px solid var(--bd);padding:0 1px 1px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.cp-rev-link:hover{color:var(--brand,#ff00ee);border-color:var(--brand,#ff00ee)}
.cp-ver-sheet{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:280;display:flex;align-items:flex-end;animation:cp-fade .15s ease}
.cp-ver-panel{width:100%;background:var(--bg);border-radius:18px 18px 0 0;max-height:92vh;display:flex;flex-direction:column;animation:cp-slide .22s ease}
.cp-ver-head{padding:14px 18px 12px;display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--bd)}
.cp-ver-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:4px 0 max(20px,env(safe-area-inset-bottom))}
.cp-ver-item{padding:16px 18px;border-bottom:1px solid var(--bd)}
.cp-ver-item:last-child{border-bottom:none}
.cp-ver-item-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}
.cp-ver-tag{display:inline-flex;align-items:center;gap:5px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9.5px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#A8009C;background:rgba(255,0,238,.1);padding:3px 8px 2px;border-radius:2px}
.cp-ver-tag.current{color:#15803D;background:rgba(21,128,61,.1)}
html.dark .cp-ver-tag{color:#FF66F5;background:rgba(255,0,238,.18)}
html.dark .cp-ver-tag.current{color:#4ADE80;background:rgba(74,222,128,.16)}
.cp-ver-when{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:11.5px;color:var(--t3)}
.cp-ver-by{font-size:11px;color:var(--t3);margin-top:2px}
.cp-ver-remarks{background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.18);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:12.5px;color:var(--t2);line-height:1.55}
.cp-ver-remarks-lbl{display:block;font-family:'JetBrains Mono',ui-monospace,monospace;font-style:normal;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#DC2626;font-weight:600;margin-bottom:5px}
.cp-ver-strip{display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:4px;margin-bottom:10px}
.cp-ver-strip::-webkit-scrollbar{display:none}
.cp-ver-thumb{flex:0 0 92px;aspect-ratio:1/1;border-radius:6px;overflow:hidden;background:var(--bg2);border:1px solid var(--bd);cursor:pointer;-webkit-tap-highlight-color:transparent}
.cp-ver-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.cp-ver-thumb.video{display:flex;align-items:center;justify-content:center;background:#000;color:#fff;flex-direction:column;gap:4px;font-size:10px;font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase}
.cp-ver-thumb.video i{font-size:20px}
.cp-ver-cap{font-size:13px;line-height:1.55;color:var(--t1);background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:11px 13px;white-space:pre-wrap;word-break:break-word;font-family:'Newsreader',Georgia,serif;max-height:200px;overflow-y:auto}
.cp-ver-cap.collapsed{max-height:96px;position:relative;cursor:pointer}
.cp-ver-cap.collapsed::after{content:'';position:absolute;left:0;right:0;bottom:0;height:36px;background:linear-gradient(180deg,transparent,var(--bg2));border-radius:0 0 8px 8px}
.cp-ver-tags{font-size:12px;color:#6D28D9;line-height:1.5;margin-top:8px;word-break:break-word}
.cp-ver-empty-cap{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:12px;color:var(--t3);padding:4px 2px}
.cp-rev-presets{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}
.cp-rev-chip{border:1px solid var(--bd);background:var(--bg2);color:var(--t2);font-family:inherit;font-size:11.5px;font-weight:500;padding:6px 11px;border-radius:99px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .12s ease,color .12s ease,border-color .12s ease}
.cp-rev-chip:hover{background:var(--bg);color:var(--t1)}
.cp-rev-chip:active{transform:scale(.96)}
.cp-rev-chip.on{border-color:#DC2626;background:rgba(220,38,38,.06);color:#DC2626}
.cp-reply-cancel{align-self:flex-end;background:transparent;border:none;color:var(--t3);font-size:11.5px;cursor:pointer;font-family:inherit;padding:6px 4px;margin-top:6px;text-align:left;font-weight:500;letter-spacing:.01em}
.cp-reply-cancel:hover{color:var(--t2)}
.cp-banner{background:linear-gradient(135deg,rgba(255,0,238,.08),rgba(255,0,238,.04));border:1px solid rgba(255,0,238,.18);border-radius:12px;padding:14px;margin-bottom:18px;display:flex;align-items:flex-start;gap:12px}
.cp-banner .ic{width:38px;height:38px;border-radius:10px;background:rgba(255,0,238,.12);color:var(--brand,#ff00ee);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.cp-banner-body{flex:1;min-width:0}
.cp-banner-t{font-size:13px;font-weight:600;color:var(--t1);margin-bottom:2px}
.cp-banner-s{font-size:11.5px;color:var(--t2);line-height:1.4}
.cp-banner-acts{display:flex;gap:8px;margin-top:10px}
.cp-banner-btn{padding:7px 14px;border-radius:8px;border:none;background:var(--brand,#ff00ee);color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}
.cp-banner-btn.sec{background:transparent;color:var(--t2);border:1px solid var(--bd)}
.cp-banner-btn:active{transform:scale(.97)}
.cp-banner .close{border:none;background:transparent;color:var(--t3);padding:4px;cursor:pointer;font-size:16px;align-self:flex-start;flex-shrink:0}
.cp-ios-steps{font-size:12px;color:var(--t2);line-height:1.55;margin-top:8px;padding:10px 12px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px}
.cp-ios-steps b{color:var(--t1)}
@keyframes cp-slide-up{from{transform:translateY(100%)}to{transform:translateY(0)}}

/* ── editorial-luxe additions (STEP 1 · Yesterday/Today/Tomorrow strip) ── */
.cp-tl{margin:14px -16px 6px}
.cp-tl-rail{display:flex;gap:12px;padding:0 16px 14px;overflow-x:auto;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;scrollbar-width:none}
.cp-tl-rail::-webkit-scrollbar{display:none}
.cp-tl-day{flex:0 0 64%;max-width:240px;scroll-snap-align:start;display:flex;flex-direction:column}
.cp-tl-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;padding:0 2px}
.cp-tl-when{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--t3);font-weight:500}
.cp-tl-when.now{color:var(--brand,#ff00ee)}
.cp-tl-when.now::before{content:'';display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--brand,#ff00ee);margin-right:7px;vertical-align:2px;animation:cp-tl-pulse 1.8s ease-in-out infinite}
@keyframes cp-tl-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
.cp-tl-date{font-family:'Fraunces',Georgia,serif;font-weight:300;font-size:18px;letter-spacing:-.01em;color:var(--t1);font-variation-settings:'opsz' 14}
.cp-tl-card{border:1px solid var(--bd);background:var(--bg);border-radius:3px;overflow:hidden;flex:1;display:flex;flex-direction:column;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .15s ease}
.cp-tl-card:active{transform:scale(.99)}
.cp-tl-thumb{aspect-ratio:4/5;color:#fff;padding:12px;display:flex;flex-direction:column;justify-content:space-between;position:relative}
.cp-tl-type{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;background:rgba(255,255,255,.14);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:4px 8px;align-self:flex-start;border-radius:2px;font-weight:500}
.cp-tl-cap{font-family:'Newsreader',Georgia,serif;font-style:italic;font-weight:300;font-size:13px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-shadow:0 1px 4px rgba(0,0,0,.3)}
.cp-tl-stack{display:flex;gap:3px;padding:8px 12px 0}
.cp-tl-stack i{flex:1;height:3px;background:var(--bd);border-radius:1px}
.cp-tl-stack i.on{background:var(--t1)}
.cp-tl-foot{padding:11px 12px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--bd);background:var(--bg)}
.cp-tl-arrow{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:16px;line-height:1;color:var(--t2)}
.cp-tl-more{margin-top:6px;display:flex;flex-direction:column;gap:4px}
.cp-tl-mini{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg);border:1px solid var(--bd);border-radius:3px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .12s ease,transform .08s ease}
.cp-tl-mini:hover{background:var(--bg2)}
.cp-tl-mini:active{transform:scale(.99)}
.cp-tl-mini-sq{width:22px;height:22px;border-radius:2px;flex-shrink:0;background-size:cover;background-position:center}
.cp-tl-mini-mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.cp-tl-mini-type{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--t3);font-weight:500}
.cp-tl-mini-cap{font-size:11px;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'Newsreader',Georgia,serif;font-style:italic;font-weight:400;line-height:1.25}
.cp-tl-mini-arrow{color:var(--t3);font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:14px;line-height:1;flex-shrink:0}
.cp-tl-empty{flex:1;border:1px dashed var(--bd);border-radius:3px;padding:24px 18px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:var(--bg2);min-height:200px}
.cp-tl-empty .cp-tl-mark{width:32px;height:32px;border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;font-family:'Fraunces',Georgia,serif;font-size:18px;font-weight:300;font-style:italic;color:var(--t3);margin-bottom:14px;border-radius:50%}
.cp-tl-empty p{font-family:'Newsreader',Georgia,serif;font-style:italic;font-weight:300;font-size:13px;line-height:1.45;color:var(--t3);max-width:170px;margin:0}
/* dot+label status — used by the new editorial pieces (existing pills stay for older surfaces) */
.cp-stat{display:inline-flex;align-items:center;gap:7px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;font-weight:500}
.cp-stat .d{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.cp-stat.posted .d{background:#1A1714} .cp-stat.posted{color:#1A1714}
.cp-stat.scheduled .d{background:#3F3995} .cp-stat.scheduled{color:#3F3995}
.cp-stat.approved .d{background:#2D5F3F} .cp-stat.approved{color:#2D5F3F}
.cp-stat.review .d{background:#B57A1B} .cp-stat.review{color:#B57A1B}
.cp-stat.revision .d{background:#B33A1A;box-shadow:0 0 0 3px rgba(179,58,26,.12)} .cp-stat.revision{color:#B33A1A}
html.dark .cp-stat.posted .d{background:#FAF6EF} html.dark .cp-stat.posted{color:#FAF6EF}
html.dark .cp-stat.approved .d{background:#4ADE80} html.dark .cp-stat.approved{color:#4ADE80}
html.dark .cp-stat.scheduled .d{background:#A5B4FC} html.dark .cp-stat.scheduled{color:#A5B4FC}
html.dark .cp-stat.review .d{background:#FBBF24} html.dark .cp-stat.review{color:#FBBF24}
html.dark .cp-stat.revision .d{background:#F87171;box-shadow:0 0 0 3px rgba(248,113,113,.12)} html.dark .cp-stat.revision{color:#F87171}

/* ── Payments tab (FRAME 3) ── editorial-luxe, paper-and-ink, mono-uppercase labels */
.cp-root{
  --pay-forest:#2D5F3F;
  --pay-terra:#B33A1A;
  --pay-mustard:#B57A1B;
  --pay-mag:var(--brand,#FF00EE);
  --pay-mag-deep:#A8009C;
  --pay-mag-tint:rgba(255,0,238,.07);
  --pay-paper-2:#F2ECE0;
  --pay-hair:rgba(60,60,55,.10);
}
html.dark .cp-root{
  --pay-forest:#4ADE80;
  --pay-terra:#F87171;
  --pay-mustard:#FBBF24;
  --pay-mag-tint:rgba(255,0,238,.16);
  --pay-paper-2:#1F1B17;
  --pay-hair:rgba(255,255,255,.10);
}

.pay-eye{padding:22px 16px 10px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--t2);font-weight:500}
.pay-eye .d{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--pay-terra);margin-right:8px;vertical-align:2px;animation:cp-tl-pulse 1.8s ease-in-out infinite}
.pay-eye.is-due .d{background:var(--pay-mag)}
.pay-eye.is-clear .d{background:var(--pay-forest);animation:none}

.pay-hero{margin:0 16px;padding:22px 22px 24px;background:var(--pay-paper-2);border:1px solid var(--pay-hair);border-radius:4px;position:relative;overflow:hidden}
.pay-hero::before{content:'';position:absolute;top:0;left:0;width:60px;height:2px;background:var(--pay-mag)}
.pay-hero-r{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:12px}
.pay-hero-period{font-family:'Fraunces',Georgia,serif;font-style:italic;font-weight:300;font-size:14px;color:var(--t1);font-variation-settings:'opsz' 14}
.pay-hero-period em{font-style:italic;font-weight:400}
.pay-hero-amount{font-family:'Fraunces',Georgia,serif;font-weight:300;font-size:54px;letter-spacing:-.035em;line-height:.95;color:var(--t1);font-variation-settings:'opsz' 144;display:flex;align-items:flex-start;gap:2px;font-variant-numeric:tabular-nums}
.pay-hero-amount .cur{font-size:32px;font-weight:300;padding-top:8px;color:var(--t3)}
.pay-hero-amount .dec{font-size:22px;color:var(--t3);padding-top:14px;letter-spacing:-.02em}
.pay-hero-meta{display:flex;justify-content:space-between;align-items:center;margin-top:16px;gap:10px;flex-wrap:wrap}
.pay-hero-meta .due{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:13px;color:var(--t2)}
.pay-hero-meta .due b{font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:500;font-style:normal;color:var(--pay-terra);letter-spacing:.04em;font-size:12px}
.pay-hero-meta .due.clear b{color:var(--pay-forest)}
.pay-hero-inv{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:12.5px;color:var(--t3)}

.pay-cta{display:flex;gap:10px;padding:14px 16px 4px}
.pay-cta .btn{flex:1;padding:13px 16px;border-radius:4px;border:none;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:8px;-webkit-tap-highlight-color:transparent;transition:transform .08s ease,background .15s ease}
.pay-cta .btn:active{transform:scale(.985)}
.pay-cta .btn:disabled{opacity:.55;cursor:not-allowed}
.pay-cta .btn.pri{background:var(--pay-mag);color:#fff;flex:1.5;letter-spacing:.005em}
.pay-cta .btn.pri:hover{background:var(--pay-mag-deep)}
.pay-cta .btn.pri .arrow{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:18px;line-height:0;margin-left:2px}
.pay-cta .btn.ghost{background:transparent;color:var(--t1);border:1px solid var(--bd2)}
.pay-cta .btn.ghost:hover{background:var(--bg2)}
.pay-methods{padding:8px 16px 2px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--t3);font-weight:500}
.pay-partial-toggle{display:inline-block;margin:10px 16px 0;font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:12.5px;color:var(--t2);background:transparent;border:none;border-bottom:1px solid var(--bd);padding:2px 1px 1px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.pay-partial-toggle:hover{color:var(--brand,#ff00ee);border-color:var(--brand,#ff00ee)}
.pay-partial-box{margin:10px 16px 0;padding:13px 14px;background:var(--bg2);border:1px solid var(--bd);border-radius:6px;display:flex;flex-direction:column;gap:10px}
.pay-partial-row{display:flex;align-items:center;gap:8px}
.pay-partial-row .cur{font-family:'Fraunces',Georgia,serif;font-weight:300;font-size:18px;color:var(--t3);padding-left:2px}
.pay-partial-input{flex:1;border:1px solid var(--bd2);background:var(--bg);border-radius:4px;padding:10px 11px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:15px;color:var(--t1);font-variant-numeric:tabular-nums;outline:none;-webkit-appearance:none;appearance:none}
.pay-partial-input:focus{border-color:var(--brand,#ff00ee);box-shadow:0 0 0 2px rgba(255,0,238,.12)}
.pay-partial-input.invalid{border-color:#DC2626}
.pay-partial-hint{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:11.5px;color:var(--t3);line-height:1.5}
.pay-partial-hint.err{color:#DC2626;font-style:normal;font-family:inherit}
.pay-partial-acts{display:flex;gap:8px}
.pay-partial-acts button{padding:10px 14px;border-radius:4px;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer;-webkit-tap-highlight-color:transparent;border:none}
.pay-partial-acts .submit{flex:1;background:var(--brand,#ff00ee);color:#fff}
.pay-partial-acts .submit:disabled{opacity:.5;cursor:not-allowed}
.pay-partial-acts .cancel{background:transparent;color:var(--t2);border:1px solid var(--bd2)}
.pay-fine{padding:6px 16px 0;font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:12px;color:var(--t3);line-height:1.55}
.pay-fine a{color:var(--t2);text-decoration:none;border-bottom:1px solid var(--bd);padding-bottom:1px;cursor:pointer}
.pay-fine a:hover{color:var(--pay-mag);border-color:var(--pay-mag)}

.pay-sec-head{display:flex;align-items:baseline;justify-content:space-between;padding:24px 16px 10px}
.pay-sec-title{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--t2);font-weight:500}
.pay-sec-meta{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:12.5px;color:var(--t3)}

.pay-inv-list{padding:6px 0 16px}
.pay-inv{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--bd);background:transparent;transition:background .12s ease;cursor:default}
.pay-inv:last-child{border-bottom:none}
.pay-inv:hover{background:var(--bg2)}
.pay-inv-num{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9.5px;letter-spacing:.18em;color:var(--t3);font-weight:500}
.pay-inv-mid{min-width:0}
.pay-inv-period{font-family:'Fraunces',Georgia,serif;font-weight:300;font-size:17px;letter-spacing:-.01em;line-height:1.15;color:var(--t1);font-variation-settings:'opsz' 14}
.pay-inv-period .extra{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:11px;color:var(--t3);margin-left:5px;font-weight:300}
.pay-inv-foot{display:flex;gap:10px;margin-top:6px;align-items:center}
.pay-inv-amt{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-size:13px;font-weight:500;color:var(--t1);text-align:right;letter-spacing:-.01em;white-space:nowrap}
.pay-inv-amt .cur{font-size:10px;color:var(--t3);margin-right:2px}
.pay-inv-amt.waived{color:var(--t3)}

.pay-stat{display:inline-flex;align-items:center;gap:6px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;font-weight:500}
.pay-stat .d{width:6px;height:6px;border-radius:50%;display:inline-block;flex-shrink:0}
.pay-stat.paid .d{background:var(--pay-forest)} .pay-stat.paid{color:var(--pay-forest)}
.pay-stat.overdue .d{background:var(--pay-terra);box-shadow:0 0 0 3px rgba(179,58,26,.12)} .pay-stat.overdue{color:var(--pay-terra)}
.pay-stat.due .d{background:var(--pay-mag)} .pay-stat.due{color:var(--pay-mag)}
.pay-stat.waived .d{background:var(--pay-mustard)} .pay-stat.waived{color:var(--pay-mustard)}
.pay-stat.cancelled .d{background:var(--t3)} .pay-stat.cancelled{color:var(--t3)}

.pay-empty{margin:32px 16px;padding:36px 24px;border:1px dashed var(--bd);border-radius:4px;text-align:center;background:var(--bg2)}
.pay-empty .pay-empty-mark{width:36px;height:36px;border:1px solid var(--bd2);display:inline-flex;align-items:center;justify-content:center;font-family:'Fraunces',Georgia,serif;font-size:20px;font-weight:300;font-style:italic;color:var(--t3);margin-bottom:14px;border-radius:50%}
.pay-empty p{font-family:'Newsreader',Georgia,serif;font-style:italic;font-weight:300;font-size:14px;line-height:1.5;color:var(--t2);max-width:240px;margin:0 auto}

.pay-success-overlay{position:absolute;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 32px;z-index:20;animation:cp-slide-up .4s ease-out}
.pay-success-mark{width:64px;height:64px;border-radius:50%;background:var(--pay-forest);display:flex;align-items:center;justify-content:center;color:#fff;margin-bottom:24px;animation:pay-pop .5s cubic-bezier(.34,1.56,.64,1) .1s both}
@keyframes pay-pop{0%{transform:scale(0)}100%{transform:scale(1)}}
.pay-success-mark svg{width:32px;height:32px}
.pay-success-eye{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--t3);margin-bottom:10px}
.pay-success-title{font-family:'Fraunces',Georgia,serif;font-weight:300;font-size:32px;letter-spacing:-.025em;line-height:1.1;color:var(--t1);margin-bottom:14px;text-align:center}
.pay-success-title em{font-style:italic;font-weight:300;color:var(--pay-mag)}
.pay-success-msg{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:14px;line-height:1.55;color:var(--t2);text-align:center;max-width:280px;margin-bottom:28px}
.pay-success-amt{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.04em;color:var(--t3);font-variant-numeric:tabular-nums}
.pay-success-close{margin-top:28px;padding:11px 28px;background:transparent;border:1px solid var(--bd2);color:var(--t1);border-radius:4px;font-family:inherit;font-size:12.5px;letter-spacing:.02em;cursor:pointer}

/* Invoice sheet (tap-to-view full Zoho-style invoice from portal) */
.inv-sheet-overlay{position:fixed;inset:0;background:rgba(20,20,18,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:200;display:flex;flex-direction:column;animation:cp-slide-up .25s ease-out}
.inv-sheet{background:#F2ECE0;flex:1;display:flex;flex-direction:column;overflow:hidden}
html.dark .inv-sheet{background:#1A1815}
.inv-sheet-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg);border-bottom:1px solid var(--bd);flex-shrink:0}
.inv-sheet-head .l{display:flex;align-items:baseline;gap:8px;min-width:0}
.inv-sheet-head .num{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;font-weight:500;color:var(--t1);letter-spacing:.04em}
.inv-sheet-head .meta{font-size:11.5px;color:var(--t3)}
.inv-sheet-head .close{background:transparent;border:none;padding:8px;color:var(--t1);cursor:pointer;border-radius:8px}
.inv-sheet-head .close:hover{background:var(--bg2)}
.inv-sheet-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 0}
.inv-sheet-body .inv-doc{width:auto;min-height:auto;padding:24px;margin:0 12px;font-size:10.5px;box-shadow:0 2px 12px rgba(0,0,0,.06)}
.inv-sheet-body .inv-doc .inv-strip{margin:-24px -24px 18px}
.inv-sheet-body .inv-doc .inv-head{flex-direction:column;gap:14px}
.inv-sheet-body .inv-doc .inv-h-r{text-align:left;min-width:0}
.inv-sheet-body .inv-doc .inv-meta-grid{text-align:left;font-size:10px}
.inv-sheet-body .inv-doc .inv-billto-row{grid-template-columns:1fr;gap:14px;margin:14px 0}
.inv-sheet-body .inv-doc table.inv-items{font-size:10px}
.inv-sheet-body .inv-doc table.inv-items thead th{padding:7px 6px;font-size:8.5px}
.inv-sheet-body .inv-doc table.inv-items tbody td{padding:8px 6px;font-size:10px}
.inv-sheet-body .inv-doc .inv-foot{grid-template-columns:1fr;gap:14px;margin-top:18px}
.inv-sheet-body .inv-doc .inv-stamp{right:40px;top:200px;font-size:18px;padding:12px 18px}
.inv-sheet-foot{padding:12px 16px max(12px,env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--bd);display:flex;gap:8px;flex-shrink:0}
.inv-sheet-foot button{flex:1;padding:13px;border-radius:4px;border:none;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.inv-sheet-foot .btn-pay{background:var(--pay-mag);color:#fff;flex:1.5}
.inv-sheet-foot .btn-pay:disabled{opacity:.6}
.inv-sheet-foot .btn-pdf{background:transparent;color:var(--t1);border:1px solid var(--bd2)}

/* ── Post media: previews + reels ────────────────────────────────────────
   The portal renders three flavours of post media:
     · Carousel (images cached from Drive → preview_urls[])
     · Reel    (Drive embed iframe → video_url, with poster from preview)
     · None    (colour-block fallback with client initials)
   Mobile-first throughout; constrained to a phone-shaped column on larger
   viewports so a desktop browser doesn't blow the hero up to 1920px wide.
   Editorial tokens (JetBrains Mono caps, magenta brand accents) match the
   rest of the portal's aesthetic. */

/* — Card thumbnail (list view) — */
.cp-card-img.has-photo{padding:0;background:var(--bg2)}
.cp-card-img-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;transition:transform .6s cubic-bezier(.2,.8,.2,1)}
.cp-card-img.has-link:active .cp-card-img-photo{transform:scale(1.015)}
.cp-card-img.has-photo .cp-card-img-inner{padding:18px;align-self:flex-end;width:100%;background:linear-gradient(180deg,transparent 38%,rgba(0,0,0,.55) 78%,rgba(168,0,156,.32) 100%)}
.cp-card-img-count{position:absolute;top:12px;right:12px;z-index:3;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9.5px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;background:rgba(0,0,0,.55);color:#fff;padding:5px 9px 4px;border-radius:2px;display:inline-flex;align-items:center;gap:6px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.cp-card-img-count i{font-size:11px;opacity:.85}

/* — Reel play icon overlay (card view) — */
.cp-card-img-playicon{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;width:62px;height:62px;border-radius:50%;background:rgba(0,0,0,.58);color:#fff;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 4px 28px rgba(255,0,238,.38),0 2px 12px rgba(0,0,0,.4);pointer-events:none;animation:cp-play-pulse 2.6s ease-in-out infinite}
.cp-card-img-playicon i{font-size:26px;margin-left:3px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))}
.cp-card-img.has-link:active .cp-card-img-playicon{transform:translate(-50%,-50%) scale(.9);transition:transform .12s ease}
@keyframes cp-play-pulse{0%,100%{box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 4px 28px rgba(255,0,238,.38),0 2px 12px rgba(0,0,0,.4)}50%{box-shadow:inset 0 0 0 1px rgba(255,255,255,.22),0 6px 38px rgba(255,0,238,.55),0 2px 16px rgba(0,0,0,.45)}}
@media (prefers-reduced-motion:reduce){.cp-card-img-playicon{animation:none}}

/* — Detail sheet hero (carousel + reel iframe) — */
.cp-detail-hero.has-photo{padding:0;background:var(--bg2);cursor:default}
.cp-detail-hero.has-photo::after{display:none}
.cp-detail-hero.has-video{display:block;padding:0;background:#000;cursor:default;aspect-ratio:9/16;max-height:min(78vh,820px);overflow:hidden;position:relative}
.cp-detail-hero.has-video::after{content:none;display:none}
.cp-detail-hero.has-video::before{content:none;display:none}
.cp-detail-video{width:100%;height:100%;border:0;display:block;background:#000;position:absolute;inset:0}

/* "REEL" tag in the detail header (sits next to the status pill, never on top of Drive's controls). */
.cp-reel-tag{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9.5px;font-weight:500;letter-spacing:.28em;color:#fff;background:var(--brand,#ff00ee);padding:5px 9px 4px;border-radius:2px;flex-shrink:0;box-shadow:0 2px 8px rgba(255,0,238,.35)}

/* — Carousel mechanics — */
.cp-carousel{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;aspect-ratio:4/5;max-height:min(74vh,720px);background:var(--bg2);scroll-behavior:smooth}
.cp-carousel::-webkit-scrollbar{display:none}
.cp-carousel-slide{flex:0 0 100%;scroll-snap-align:start;display:flex;align-items:center;justify-content:center;position:relative}
.cp-carousel-img{width:100%;height:100%;object-fit:contain;background:#000}

/* — Carousel dots + counter (editorial mono badge) — */
.cp-carousel-dots{position:absolute;bottom:16px;left:0;right:0;display:flex;justify-content:center;gap:6px;z-index:3;pointer-events:none}
.cp-carousel-dot{width:6px;height:6px;border-radius:99px;background:rgba(255,255,255,.42);transition:width .32s cubic-bezier(.2,.8,.2,1),background-color .2s ease,box-shadow .2s ease;box-shadow:0 0 0 1px rgba(0,0,0,.3)}
.cp-carousel-dot.on{background:var(--brand,#ff00ee);width:22px;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 0 14px rgba(255,0,238,.6)}
.cp-carousel-count{position:absolute;top:14px;right:14px;z-index:3;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;font-weight:500;letter-spacing:.22em;background:rgba(0,0,0,.55);color:#fff;padding:5px 10px 4px;border-radius:2px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}

/* — Larger viewports: keep portal phone-shaped (don't stretch the hero) — */
@media (min-width:560px){
  .cp-detail-hero.has-photo,.cp-detail-hero.has-video,.cp-carousel{max-width:520px;margin-left:auto;margin-right:auto}
}

/* — Landscape phones: keep the player visible without scrolling — */
@media (max-height:500px) and (orientation:landscape){
  .cp-detail-hero.has-video{aspect-ratio:auto;height:92vh;max-height:92vh}
  .cp-carousel{aspect-ratio:auto;height:88vh;max-height:88vh}
}

/* ── Onboarding wizard — full-takeover, replaces normal portal ────── */
.cp-wiz{position:fixed;inset:0;background:var(--bg);color:var(--t1);display:flex;flex-direction:column;z-index:120;overflow:hidden;font-family:inherit}
.cp-wiz-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;border-bottom:1px solid var(--bd);background:var(--bg);flex-shrink:0;gap:10px}
.cp-wiz-head-l{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.cp-wiz-mark{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:13px;flex-shrink:0;letter-spacing:.02em}
.cp-wiz-head-name{font-family:'Fraunces','Newsreader',Georgia,serif;font-size:17px;font-weight:500;line-height:1.1;color:var(--t1);letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variation-settings:'opsz' 80}
.cp-wiz-head-sub{font-size:10px;color:var(--t3);margin-top:2px;letter-spacing:.12em;text-transform:uppercase;font-family:'JetBrains Mono',ui-monospace,monospace}
.cp-wiz-signout{border:1px solid var(--bd);background:transparent;color:var(--t2);padding:6px 12px;border-radius:7px;font-size:11.5px;cursor:pointer}
.cp-wiz-signout:active{background:var(--bg2)}
.cp-wiz-progress{padding:10px 16px 14px;background:var(--bg);flex-shrink:0;border-bottom:1px solid var(--bd)}
.cp-wiz-progress-bar{height:4px;background:var(--bg2);border-radius:99px;overflow:hidden}
.cp-wiz-progress-fill{height:100%;background:var(--brand,#ff00ee);border-radius:99px;transition:width .35s cubic-bezier(.2,.8,.2,1)}
.cp-wiz-progress-lbl{display:flex;justify-content:space-between;font-size:10.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.08em;font-weight:500;margin-bottom:6px}
.cp-wiz-progress-step{color:var(--t1);font-weight:600}
.cp-wiz-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:24px 18px 120px}
.cp-wiz-stepname{font-family:'Fraunces','Newsreader',Georgia,serif;font-size:28px;line-height:1.15;letter-spacing:-.02em;color:var(--t1);font-weight:400;margin-bottom:6px;font-variation-settings:'opsz' 96}
.cp-wiz-steplead{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:15px;color:var(--t2);line-height:1.55;margin-bottom:24px}
.cp-wiz-field{margin-bottom:20px}
.cp-wiz-lbl{font-size:13px;font-weight:500;color:var(--t1);margin-bottom:4px;display:flex;align-items:center;gap:5px}
.cp-wiz-lbl .req{color:var(--brand,#ff00ee);font-size:11px}
.cp-wiz-help{font-size:12px;color:var(--t3);margin-bottom:10px;line-height:1.5}
.cp-wiz-input,.cp-wiz-textarea,.cp-wiz-select{width:100%;border:1px solid var(--bd2);background:var(--bg);color:var(--t1);border-radius:9px;padding:11px 13px;font-size:15px;font-family:inherit;outline:none;-webkit-appearance:none;appearance:none}
.cp-wiz-input:focus,.cp-wiz-textarea:focus,.cp-wiz-select:focus{border-color:var(--brand,#ff00ee);box-shadow:0 0 0 3px rgba(255,0,238,.12)}
.cp-wiz-textarea{min-height:96px;resize:vertical;line-height:1.5}
.cp-wiz-select{background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path fill='%238E8C87' d='M6 8L2 4h8z'/></svg>");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}
.cp-wiz-color{display:flex;align-items:center;gap:10px;background:var(--bg2);border-radius:9px;padding:8px 12px;border:1px solid var(--bd)}
.cp-wiz-color input[type=color]{width:42px;height:42px;border:none;border-radius:7px;cursor:pointer;padding:0;background:transparent}
.cp-wiz-color-hex{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;color:var(--t2);text-transform:uppercase;letter-spacing:.02em}
.cp-wiz-chips{display:flex;flex-wrap:wrap;gap:7px}
.cp-wiz-chip{border:1px solid var(--bd2);background:var(--bg);color:var(--t2);padding:9px 14px;border-radius:99px;font-size:13px;cursor:pointer;transition:all .15s;font-family:inherit}
.cp-wiz-chip.on{border-color:var(--brand,#ff00ee);background:rgba(255,0,238,.08);color:var(--brand,#ff00ee);font-weight:500}
.cp-wiz-check{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:9px;background:var(--bg2);border:1px solid var(--bd);cursor:pointer}
.cp-wiz-check input[type=checkbox]{margin-top:2px;width:18px;height:18px;accent-color:var(--brand,#ff00ee);flex-shrink:0}
.cp-wiz-check-text{font-size:13px;color:var(--t1);line-height:1.5}
.cp-wiz-guide{margin-top:8px;border:1px solid var(--bd);border-radius:9px;background:var(--bg2);overflow:hidden}
.cp-wiz-guide-tog{width:100%;display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border:none;background:transparent;color:var(--t2);font-size:12.5px;font-weight:500;cursor:pointer;font-family:inherit;text-align:left}
.cp-wiz-guide-tog i{transition:transform .2s}
.cp-wiz-guide.open .cp-wiz-guide-tog i{transform:rotate(180deg)}
.cp-wiz-guide-body{padding:0 16px 14px;font-size:12.5px;color:var(--t2);line-height:1.65;display:none}
.cp-wiz-guide.open .cp-wiz-guide-body{display:block}
.cp-wiz-guide-body strong{color:var(--t1)}
.cp-wiz-guide-body code{background:var(--bg);padding:1px 6px;border-radius:4px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11.5px;color:var(--brand,#ff00ee)}
.cp-wiz-guide-body ol,.cp-wiz-guide-body ul{margin:6px 0 6px 18px}
.cp-wiz-guide-body li{margin-bottom:3px}
.cp-wiz-foot{position:fixed;left:0;right:0;bottom:0;padding:14px 16px calc(14px + env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--bd);display:flex;gap:10px;justify-content:space-between;align-items:center;z-index:10}
.cp-wiz-foot-l{font-size:11.5px;color:var(--t3)}
.cp-wiz-btn{border:none;border-radius:10px;padding:13px 18px;font-size:14.5px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;-webkit-tap-highlight-color:transparent}
.cp-wiz-btn-pri{background:var(--brand,#ff00ee);color:#fff;flex:1;justify-content:center;min-height:48px}
.cp-wiz-btn-pri:disabled{opacity:.5;cursor:default}
.cp-wiz-btn-sec{background:transparent;color:var(--t2);border:1px solid var(--bd2)}
.cp-wiz-saved{font-size:11px;color:#15803D;display:flex;align-items:center;gap:4px;font-weight:500}
.cp-wiz-error{background:#FEE2E2;color:#B91C1C;padding:11px 14px;border-radius:9px;font-size:13px;margin-bottom:16px;display:flex;align-items:flex-start;gap:8px}
.cp-wiz-error i{font-size:16px;margin-top:1px}
.cp-wiz-welcome{padding:24px 0 8px;text-align:center}
.cp-wiz-welcome-mark{width:64px;height:64px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:26px;letter-spacing:-.02em;margin-bottom:18px}
.cp-wiz-welcome-h{font-family:'Fraunces','Newsreader',Georgia,serif;font-size:30px;line-height:1.12;letter-spacing:-.02em;color:var(--t1);font-weight:400;margin-bottom:10px;font-variation-settings:'opsz' 96}
.cp-wiz-welcome-h em{color:var(--brand,#ff00ee);font-family:'Newsreader',Georgia,serif;font-style:italic}
.cp-wiz-welcome-body{font-family:'Newsreader',Georgia,serif;font-size:16px;color:var(--t2);line-height:1.65;text-align:left;margin-top:14px;white-space:pre-wrap}
.cp-wiz-welcome-meta{margin:24px 0 6px;padding:16px;background:var(--bg2);border-radius:12px;text-align:left;border:1px solid var(--bd)}
.cp-wiz-welcome-meta-row{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;color:var(--t2);padding:5px 0}
.cp-wiz-welcome-meta-row strong{color:var(--t1);font-weight:500}
.cp-wiz-complete{padding:60px 24px;text-align:center}
.cp-wiz-complete-mark{font-size:54px;color:#15803D;margin-bottom:14px}
.cp-wiz-complete-h{font-family:'Fraunces','Newsreader',Georgia,serif;font-size:26px;color:var(--t1);font-weight:400;line-height:1.2;letter-spacing:-.02em;margin-bottom:10px}
.cp-wiz-complete-body{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:15px;color:var(--t2);line-height:1.6;max-width:340px;margin:0 auto}
/* ── Insights & Reports ── */
.cp-ins-seg{display:flex;background:var(--bg2);border:1px solid var(--bd);border-radius:10px;padding:3px;gap:3px;margin-bottom:16px}
.cp-ins-seg button{flex:1;border:none;background:transparent;font-family:inherit;font-size:12.5px;font-weight:500;color:var(--t2);padding:8px 10px;border-radius:8px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.cp-ins-seg button.on{background:var(--bg);color:var(--t1);box-shadow:0 1px 3px rgba(0,0,0,.07);font-weight:600}
.cp-plat-chips{display:flex;gap:6px;margin-bottom:14px}
.cp-plat-chip{border:1px solid var(--bd2);background:transparent;color:var(--t2);font-family:inherit;font-size:11.5px;font-weight:500;padding:5px 12px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;-webkit-tap-highlight-color:transparent}
.cp-plat-chip.on{border-color:var(--brand,#ff00ee);color:var(--brand,#ff00ee);background:rgba(255,0,238,.06)}
.cp-spark-card{background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:12px 14px 8px;margin-bottom:8px}
.cp-spark-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.cp-spark-lbl{font-size:10.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;font-weight:500}
.cp-spark-val{font-size:20px;font-weight:600;color:var(--t1)}
.cp-spark-delta{font-size:10.5px;font-weight:500;color:var(--t3)}
.cp-spark-delta.up{color:#15803D}
.cp-spark-delta.down{color:#DC2626}
html.dark .cp-spark-delta.up{color:#4ADE80}
html.dark .cp-spark-delta.down{color:#F87171}
.cp-spark-svg{display:block;width:100%;height:44px;margin-top:6px}
.cp-spark-flat{font-family:'Newsreader',Georgia,serif;font-style:italic;font-size:11.5px;color:var(--t3);padding:12px 0 8px}
.cp-top-post{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg2);border:1px solid var(--bd);border-radius:10px;margin-bottom:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .12s ease}
.cp-top-post:active{transform:scale(.99)}
.cp-top-thumb{width:40px;height:40px;border-radius:8px;flex-shrink:0;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px}
.cp-top-mid{flex:1;min-width:0}
.cp-top-title{font-size:12.5px;font-weight:500;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-top-meta{font-size:10.5px;color:var(--t3);margin-top:2px;font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:.02em}
.cp-rep-card{background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:14px;margin-bottom:8px}
.cp-rep-month{font-family:'Fraunces',Georgia,serif;font-size:17px;font-weight:500;color:var(--t1);letter-spacing:-.01em}
.cp-rep-sent{font-size:10.5px;color:var(--t3);margin-top:2px}
.cp-rep-kpis{display:flex;gap:16px;margin:10px 0 12px;flex-wrap:wrap}
.cp-rep-kpi{display:flex;flex-direction:column;gap:1px}
.cp-rep-kpi b{font-size:14px;font-weight:600;color:var(--t1)}
.cp-rep-kpi span{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em}
.cp-rep-open{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--bd2);background:var(--bg);color:var(--t1);font-family:inherit;font-size:12px;font-weight:500;padding:8px 14px;border-radius:9px;cursor:pointer;-webkit-tap-highlight-color:transparent;text-decoration:none}
.cp-rep-open:active{transform:scale(.98)}
/* Calendar day sheet — sits BELOW the post detail sheet (250) so tapping a
   row slides the detail over it and back returns to the day list. */
.cp-day-sheet{z-index:240}
.cp-dayrow{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--bd);cursor:pointer;-webkit-tap-highlight-color:transparent}
.cp-dayrow:hover{background:var(--bg2)}
.cp-dayrow:last-child{border-bottom:none}
.cp-dayrow-thumb{width:44px;height:44px;border-radius:9px;flex-shrink:0;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px}
.cp-dayrow-mid{flex:1;min-width:0}
.cp-dayrow-title{font-size:13px;font-weight:500;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-dayrow-sub{font-size:11px;color:var(--t3);margin-top:2px;text-transform:capitalize}
/* Scheduled-publish line on cards/detail */
.cp-sched-line{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--t2);margin-top:8px;font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:.01em}
.cp-sched-line i{color:var(--brand,#ff00ee);font-size:13px}
`;
    const tag = document.createElement('style');
    tag.id = 'cp-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function buildClientPortal(AMS) {
    const { React, h, useState, useEffect, useMemo, useCallback, useRef, supabase, db, dbPatch, dbInsert, rpcCall, insertNotif, subscribeToPush, hashPwd, hashPwdPbkdf2 } = AMS;
    // Phase 2: dashboard-side helpers shared via AMS bridge. Older bridges without
    // these still work — InvoiceSheet falls back to a minimal renderer.
    const InvoiceTemplate = AMS.InvoiceTemplate;
    const fmtINR2 = AMS.fmtINR || ((n, d=false) => (Number(n)||0).toLocaleString('en-IN', { maximumFractionDigits: d?2:0, minimumFractionDigits: d?2:0 }));
    const fmtMonthYear2 = AMS.fmtMonthYear || ((s) => { try { const d=new Date(s); return d.toLocaleDateString('en-IN',{month:'long',year:'numeric'}); } catch(_) { return s; } });

    // ── Hash routing ──
    // Formats:
    //   #/<tab>                          — top-level tab
    //   #/<tab>/post/<id>                — open a post's detail sheet (Approve flow)
    //   #/payments/invoice/<uuid>        — open a specific invoice sheet (WhatsApp share link)
    const CP_TABS = ['home', 'approve', 'calendar', 'insights', 'payments', 'account'];
    function cpParseHash() {
      try {
        const raw = (window.location.hash || '').replace(/^#\/?/, '');
        const parts = raw.split('/').filter(Boolean);
        const first = parts[0] || '';
        const tab = CP_TABS.includes(first) ? first : '';
        let postId = null;
        const pi = parts.indexOf('post');
        if (pi >= 0 && parts[pi + 1]) {
          const n = Number(parts[pi + 1]);
          if (Number.isFinite(n)) postId = n;
        }
        let invoiceId = null;
        const ii = parts.indexOf('invoice');
        if (ii >= 0 && parts[ii + 1]) invoiceId = parts[ii + 1];   // UUID
        return { tab, postId, invoiceId };
      } catch (_) { return { tab: '', postId: null, invoiceId: null }; }
    }
    function cpWriteHash({ tab, postId, invoiceId }) {
      let next = tab ? `#/${tab}` : '';
      if (postId) next += `/post/${postId}`;
      if (invoiceId) next += `/invoice/${invoiceId}`;
      cpSheetState.lastHash = next;   // sheet-back suppress re-asserts this on stale entries
      if (next === window.location.hash) return;
      try { history.replaceState(null, '', next || (window.location.pathname + window.location.search)); }
      catch (_) { window.location.hash = next; }
    }

    // Posts visible to the client: anything past 'sent_to_client'. They never see drafts.
    const CLIENT_STATUSES = ['sent_to_client', 'revision', 'approved', 'scheduled', 'posted'];

    // Stable hash → color so a brand without brand_color_primary still gets a consistent mark.
    function brandColor(client) {
      const explicit = client?.brand_color_primary;
      if (explicit) return explicit;
      const palette = ['#1F3A93', '#722B85', '#0E7490', '#B45309', '#15803D', '#6D28D9'];
      const name = (client?.name || '?').toString();
      let hash = 0;
      for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
      return palette[Math.abs(hash) % palette.length];
    }

    function initials(s) {
      const t = (s || '?').toString().trim();
      if (!t) return '?';
      const parts = t.split(/\s+/);
      return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || t[0].toUpperCase();
    }

    function fmtDow(dateStr) {
      try { return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' }); } catch (_) { return ''; }
    }
    function fmtShort(dateStr) {
      try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      } catch (_) { return dateStr || ''; }
    }
    function timeAgo(stamp) {
      if (!stamp) return '';
      const diff = (Date.now() - new Date(stamp).getTime()) / 1000;
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h';
      if (diff < 604800) return Math.floor(diff / 86400) + 'd';
      try { return new Date(stamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
      catch (_) { return ''; }
    }

    function typeIcon(t) {
      return ({ reel: 'ti-video', creative: 'ti-photo', carousel: 'ti-layout-grid', extra: 'ti-sparkles' })[t] || 'ti-photo';
    }

    // Local-date key (YYYY-MM-DD). NEVER use toISOString().slice(0,10) for day
    // keys — UTC conversion shifts every IST date back a day before 05:30.
    function localDayKey(d) {
      const yy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    }

    // Creative thumbnail for a post — same gating as ApprovalCard. Reels use
    // the video thumbnail (or first preview) once the preview pipeline is
    // ready; statics/carousels use preview_urls[0]. NOTE: content has no
    // media_url column — that only exists on publish_jobs.
    function thumbFor(post) {
      if (!post) return null;
      const previews = Array.isArray(post.preview_urls) ? post.preview_urls : [];
      if (post.type === 'reel') {
        if (post.preview_status === 'ready' && post.video_url) return post.video_thumbnail_url || previews[0] || null;
        return null;
      }
      return (post.preview_status === 'ready' && previews.length > 0) ? previews[0] : null;
    }

    // Compact KPI number — 1.2k / 3.4M reads better on a 78px tile.
    function fmtCompact(n) {
      const v = Number(n);
      if (n == null || !Number.isFinite(v)) return '—';
      if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
      if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
      return String(Math.round(v));
    }

    function fmtSchedAt(ts) {
      if (!ts) return '';
      try { return new Date(ts).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
      catch (_) { return ''; }
    }

    // ── Hardware-back support for sheets ──
    // Every bottom sheet / overlay mounts this hook: it pushes one history
    // entry so the Android back button (and back-gesture) closes the sheet
    // instead of exiting the installed PWA. ONE global popstate listener owns
    // the whole stack (per-sheet listeners would mis-handle stacked sheets):
    //   · real back press → close the topmost sheet, tag the event consumed
    //     so the portal's hash-sync listener doesn't re-parse a stale hash.
    //   · manual close (✕ / backdrop) → the unmount cleanup pops its own
    //     entry via history.back(); `suppress` swallows that synthetic pop,
    //     and we re-assert the app's last-written hash so a deep-linked
    //     entry (e.g. #/home/post/12 from a push tap) can't resurrect the
    //     sheet that was just closed.
    // Hash routing itself stays replaceState-based, exactly as before.
    const cpSheetState = { suppress: 0, stack: [], lastHash: null, consumedEvent: null };
    window.addEventListener('popstate', (e) => {
      if (cpSheetState.suppress > 0) {
        cpSheetState.suppress--;
        cpSheetState.consumedEvent = e;
        // The entry we landed on may carry a stale route (deep-link case) —
        // rewrite it to whatever the app last wrote.
        if (cpSheetState.lastHash != null && window.location.hash !== cpSheetState.lastHash) {
          try { history.replaceState(null, '', cpSheetState.lastHash || (window.location.pathname + window.location.search)); } catch (_) {}
        }
        return;
      }
      const top = cpSheetState.stack.pop();
      if (top) {
        top.popped = true;
        cpSheetState.consumedEvent = e;
        try { top.close(); } catch (_) {}
      }
    });
    function useSheetBack(onClose) {
      const onCloseRef = useRef(onClose);
      onCloseRef.current = onClose;
      useEffect(() => {
        let token = null;
        try {
          history.pushState({ cpSheet: true }, '', window.location.href);
          token = { popped: false, close: () => { if (onCloseRef.current) onCloseRef.current(); } };
          cpSheetState.stack.push(token);
        } catch (_) { token = null; }
        return () => {
          if (!token || token.popped) return;
          const i = cpSheetState.stack.indexOf(token);
          if (i >= 0) cpSheetState.stack.splice(i, 1);
          cpSheetState.suppress++;
          try { history.back(); }
          catch (_) { cpSheetState.suppress = Math.max(0, cpSheetState.suppress - 1); }
        };
      }, []);
    }

    // Defensive normalizer for the insights_summary_for_self RPC (migration
    // 073). The real shape is { ok, platform: 'instagram', latest, series,
    // platforms: { instagram: {latest, series}, facebook: {…} }, top_posts }
    // — platforms is an OBJECT keyed by platform name, top_posts is top-level.
    // Also tolerates array shapes / flat single-account payloads. Missing RPC,
    // ok:false or no data → null (caller shows the not-connected state).
    function normalizeInsights(raw) {
      if (!raw || raw.ok === false) return null;
      let list = [];
      const pf = raw.platforms;
      if (Array.isArray(pf)) list = pf;
      else if (pf && typeof pf === 'object') list = Object.keys(pf).map(k => ({ platform: k, ...(pf[k] || {}) }));
      else if (Array.isArray(raw.accounts)) list = raw.accounts;
      else if (Array.isArray(raw)) list = raw;
      if (!list.length && (raw.latest || (Array.isArray(raw.series) && raw.series.length))) list = [raw];
      const platforms = list.map(p => ({
        platform: ((p.platform || (p.latest && p.latest.platform) || 'instagram') + '').toLowerCase(),
        latest: p.latest || null,
        series: Array.isArray(p.series) ? p.series : [],
      })).filter(p => p.latest || p.series.length);
      const primary = ((raw.platform || '') + '').toLowerCase() || (platforms[0] ? platforms[0].platform : null);
      if (primary) platforms.sort((a, b) => (a.platform === primary ? -1 : 0) - (b.platform === primary ? -1 : 0));
      const top_posts = Array.isArray(raw.top_posts)
        ? raw.top_posts
        : list.flatMap(p => Array.isArray(p.top_posts) ? p.top_posts : []);
      if (!platforms.length && !top_posts.length) return null;
      return { platforms, top_posts, primary };
    }

    // Aggregate KPIs across the selected platforms. engagementIsRate flags
    // whether the engagement figure is a percentage (metrics.engagement_rate)
    // or a raw interaction count (metrics.engagement).
    function insightsKpis(platforms) {
      let followers = null, reach = null, engagement = null, engagementIsRate = false, followersDelta = null, asOf = null;
      (platforms || []).forEach(p => {
        const l = p.latest || {};
        if (l.followers != null) followers = (followers || 0) + (Number(l.followers) || 0);
        if (l.reach != null) reach = (reach || 0) + (Number(l.reach) || 0);
        if (l.captured_on && (!asOf || l.captured_on > asOf)) asOf = l.captured_on;
        const m = l.metrics || {};
        if (engagement == null) {
          if (m.engagement_rate != null) { engagement = Number(m.engagement_rate); engagementIsRate = true; }
          else if (m.engagement != null) { engagement = Number(m.engagement); }
        }
        const s = (p.series || []).filter(x => x && x.followers != null);
        if (s.length >= 2) followersDelta = (followersDelta || 0) + (Number(s[s.length - 1].followers) - Number(s[0].followers));
      });
      return { followers, reach, engagement, engagementIsRate, followersDelta, asOf };
    }

    // ─── Sub-components ────────────────────────────────────────────────────

    function Toast({ toast, onAction }) {
      if (!toast) return null;
      const msg = typeof toast === 'string' ? toast : toast.msg;
      const actionLabel = typeof toast === 'object' ? toast.actionLabel : null;
      return h`<div class="cp-toast">
        <i class="ti ti-circle-check"></i>
        <span>${msg}</span>
        ${actionLabel && h`<button class="cp-toast-action" onClick=${onAction}>${actionLabel}</button>`}
      </div>`;
    }

    function StatusPill({ post }) {
      const ap = post.client_approval || 'pending';
      const ws = post.workflow_status;
      let key = ap;
      let label = ap.charAt(0).toUpperCase() + ap.slice(1);
      if (ap === 'pending' && ws === 'sent_to_client') { label = 'Awaiting you'; key = 'pending'; }
      if (ws === 'scheduled') { label = 'Scheduled'; key = 'scheduled'; }
      if (ws === 'posted') { label = 'Posted'; key = 'posted'; }
      return h`<span class=${'cp-status-pill ' + key}>${label}</span>`;
    }

    function RevisionInline({ post, onSubmit, busy, onCancel }) {
      const [text, setText] = useState('');
      const [preset, setPreset] = useState(null);
      const taRef = useRef(null);
      const wrapRef = useRef(null);
      // Common revision categories. Tapping prefills a starter line; client
      // can keep typing to add specifics. The chip stays highlighted only
      // while the textarea still starts with the prefill — once they edit
      // past it we drop the highlight so it doesn't lie.
      const PRESETS = [
        { key: 'copy',    label: 'Change copy',    seed: 'Please change the copy: ' },
        { key: 'design',  label: 'Fix design',     seed: 'Design tweak needed: ' },
        { key: 'reshoot', label: 'Reshoot/redo',   seed: 'Needs a reshoot / redo because: ' },
        { key: 'tags',    label: 'Adjust hashtags',seed: 'Please adjust the hashtags: ' },
        { key: 'date',    label: 'Reschedule',     seed: 'Please reschedule this post to: ' },
      ];
      useEffect(() => {
        // Scroll the composer into view first, then focus — on mobile the
        // composer can expand below the fold, so without this the user thinks
        // nothing happened. Delay focus by a frame so the scroll completes
        // before the keyboard fights for the viewport.
        if (wrapRef.current) {
          try { wrapRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        }
        const t = setTimeout(() => { if (taRef.current) taRef.current.focus(); }, 220);
        return () => clearTimeout(t);
      }, []);
      const pickPreset = (p) => {
        setPreset(p.key);
        setText(p.seed);
        try { if (taRef.current) { taRef.current.focus(); const i = p.seed.length; taRef.current.setSelectionRange(i, i); } } catch (_) {}
      };
      const onTextChange = (e) => {
        const v = e.target.value;
        setText(v);
        // Drop the active chip if the prefill no longer matches.
        if (preset) {
          const seed = PRESETS.find(p => p.key === preset)?.seed || '';
          if (!v.startsWith(seed)) setPreset(null);
        }
      };
      const send = () => {
        const t = text.trim();
        if (!t || busy) return;
        onSubmit(post, t);
      };
      return h`<div ref=${wrapRef} style=${{ marginTop: 8 }}>
        <div class="cp-rev-presets">
          ${PRESETS.map(p => h`<button key=${p.key} class=${'cp-rev-chip' + (preset === p.key ? ' on' : '')} onClick=${() => pickPreset(p)} disabled=${busy}>${p.label}</button>`)}
        </div>
        <div class="cp-reply rev">
          <textarea ref=${taRef} placeholder="What needs to change?" value=${text} onInput=${onTextChange}
            onKeyDown=${e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}/>
          <button onClick=${send} disabled=${busy || !text.trim()} aria-label="Send request to team">
            ${busy ? h`<i class="ti ti-loader-2 spinner"></i>` : h`<i class="ti ti-send" style=${{ fontSize: 15 }}></i>`}
          </button>
        </div>
        <button class="cp-reply-cancel" onClick=${onCancel} disabled=${busy}>Cancel</button>
      </div>`;
    }

    function ApprovalCard({ post, client, onApprove, onRevision, onOpenDetail, busy, selectable, selected, onToggleSelect }) {
      const [revOpen, setRevOpen] = useState(false);
      const color = brandColor(client);
      const ini = initials(client?.name || post.title);
      const caption = post.caption || post.concept || '';
      const isPending = post.client_approval === 'pending' && post.workflow_status === 'sent_to_client';
      const submit = async (p, t) => {
        await onRevision(p, t);
        setRevOpen(false);
      };
      const previews = Array.isArray(post.preview_urls) ? post.preview_urls : [];
      const isReel = post.type === 'reel';
      const hasVideo = isReel && post.preview_status === 'ready' && !!post.video_url;
      const reelPoster = post.video_thumbnail_url || previews[0];
      const hasPreview = !isReel && post.preview_status === 'ready' && previews.length > 0;
      const showPoster = hasVideo && reelPoster;
      const showSelect = !!(selectable && isPending);
      return h`<div class="cp-card">
        <div class=${'cp-card-img has-link' + (hasPreview || showPoster ? ' has-photo' : '')} style=${hasPreview || showPoster ? {} : { background: color }} onClick=${() => onOpenDetail(post)}>
          ${hasPreview && h`<img class="cp-card-img-photo" src=${previews[0]} alt=${post.title || 'Post preview'} loading="lazy"/>`}
          ${hasPreview && previews.length > 1 && h`<div class="cp-card-img-count"><i class="ti ti-layout-grid"></i>1/${previews.length}</div>`}
          ${showPoster && h`<img class="cp-card-img-photo" src=${reelPoster} alt=${post.title || 'Reel preview'} loading="lazy"/>`}
          ${hasVideo && h`<div class="cp-card-img-playicon"><i class="ti ti-player-play-filled"></i></div>`}
          ${showSelect && h`<div class=${'cp-select-circle' + (selected ? ' on' : '')} onClick=${(e) => { e.stopPropagation(); onToggleSelect(post); }} role="checkbox" aria-checked=${selected ? 'true' : 'false'} aria-label=${(selected ? 'Deselect' : 'Select') + ' for batch approval'}>
            <i class="ti ti-check"></i>
          </div>`}
          <div class="cp-card-img-inner">
            ${!hasPreview && !showPoster && h`<div class="cp-card-mark">${ini}</div>`}
            <div class="cp-card-cap">${post.title || 'Untitled post'}</div>
          </div>
        </div>
        <div class="cp-card-body">
          <div class="cp-card-meta">
            <span class="l"><i class=${'ti ' + typeIcon(post.type)}></i>${(post.type || 'post')} · ${fmtShort(post.post_date)}<span class="cp-tz-tag">IST</span>${Number(post.revision_round) > 0 && h`<span class="cp-rev-tag" title=${'Round ' + (Number(post.revision_round) + 1)}><i class="ti ti-refresh"></i>v${Number(post.revision_round) + 1}</span>`}</span>
            <${StatusPill} post=${post}/>
          </div>
          ${post.workflow_status === 'scheduled' && post.scheduled_publish_at && h`<div class="cp-sched-line"><i class="ti ti-clock"></i>Scheduled · ${fmtSchedAt(post.scheduled_publish_at)}</div>`}
          ${caption && h`<p class="cp-card-caption" onClick=${() => onOpenDetail(post)} style=${{ cursor: 'pointer' }}>${caption}</p>`}
          ${isPending && !revOpen ? h`<div class="cp-acts">
            <button class="cp-btn pri" disabled=${busy} onClick=${() => onApprove(post)}><i class="ti ti-check"></i>Approve</button>
            <button class="cp-btn rev" disabled=${busy} onClick=${() => setRevOpen(true)}><i class="ti ti-message-circle"></i>Request changes</button>
          </div>` : null}
          ${isPending && revOpen ? h`<${RevisionInline} post=${post} onSubmit=${submit} onCancel=${() => setRevOpen(false)} busy=${busy}/>` : null}
          <div class="cp-card-foot">
            <a onClick=${(e) => { e.preventDefault(); onOpenDetail(post); }} href="#" style=${{ cursor: 'pointer' }}><i class="ti ti-arrow-right"></i>Open details &amp; comments</a>
            ${post.post_link ? h`<a href=${post.post_link} target="_blank" rel="noopener"><i class="ti ti-external-link"></i>View live post ↗</a>` : null}
          </div>
        </div>
      </div>`;
    }

    // Swipeable carousel for the detail sheet. Uses CSS scroll-snap (native,
    // smooth on iOS) and tracks the active slide via a scroll listener so the
    // dot indicator stays in sync. Single-image posts use this too — the dots
    // and count badge hide automatically.
    function HeroCarousel({ urls, alt }) {
      const ref = useRef(null);
      const [active, setActive] = useState(0);
      useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const onScroll = () => {
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== active) setActive(i);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
      }, [active]);
      const multi = urls.length > 1;
      return h`<div class="cp-carousel" ref=${ref}>
        ${urls.map((u, i) => h`<div key=${i} class="cp-carousel-slide">
          <img class="cp-carousel-img" src=${u} alt=${(alt || 'Post preview') + (multi ? ' ' + (i + 1) + ' of ' + urls.length : '')} loading=${i === 0 ? 'eager' : 'lazy'}/>
        </div>`)}
        ${multi && h`<div class="cp-carousel-count">${active + 1}/${urls.length}</div>`}
        ${multi && h`<div class="cp-carousel-dots">${urls.map((_, i) => h`<div key=${i} class=${'cp-carousel-dot' + (i === active ? ' on' : '')}></div>`)}</div>`}
      </div>`;
    }

    // Bottom sheet listing every prior version of this post (powered by
    // content_versions, snapshotted on every sent_to_client transition by
    // the dashboard). Each item: round badge, when it was sent, the note
    // that triggered the next round, thumb strip, expandable caption.
    // Newest first (current version sits at top, marked "Current").
    function VersionHistorySheet({ post, onClose, onOpenImage }) {
      useSheetBack(onClose);
      const [rows, setRows] = useState([]);
      const [loading, setLoading] = useState(true);
      const [expanded, setExpanded] = useState(new Set());
      useEffect(() => {
        if (!post?.id) return;
        let alive = true;
        db('content_versions', `&post_id=eq.${post.id}&order=revision_round.desc&limit=20`)
          .then(r => { if (alive) { setRows(r || []); setLoading(false); } })
          .catch(() => { if (alive) setLoading(false); });
        // Realtime: if the team re-sends while this sheet is open, prepend
        // the new version without making the user close + reopen.
        const ch = supabase.channel('cp-ver-' + post.id)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'content_versions', filter: 'post_id=eq.' + post.id }, (payload) => {
            const n = payload.new;
            if (!n) return;
            setRows(cs => cs.find(x => x.id === n.id) ? cs : [n, ...cs].sort((a, b) => (b.revision_round || 0) - (a.revision_round || 0)));
          })
          .subscribe();
        return () => { alive = false; try { supabase.removeChannel(ch); } catch (_) {} };
      }, [post?.id]);

      const fmtWhen = (t) => {
        if (!t) return '';
        try { return new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
        catch (_) { return ''; }
      };
      const toggleExpand = (id) => setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      const currentRound = Math.max(0, ...rows.map(r => r.revision_round || 0));

      return h`<div class="cp-ver-sheet" onClick=${onClose}>
        <div class="cp-ver-panel" onClick=${(e) => e.stopPropagation()}>
          <div class="cp-help-grip"></div>
          <div class="cp-ver-head">
            <div>
              <div class="cp-help-h">Version history</div>
              <div class="cp-help-sub">${loading ? 'Loading…' : (rows.length ? `${rows.length} version${rows.length === 1 ? '' : 's'} on file` : 'No prior versions on file')}</div>
            </div>
            <button class="cp-bell" aria-label="Close" onClick=${onClose}><i class="ti ti-x" style=${{ fontSize: 18 }}></i></button>
          </div>
          <div class="cp-ver-body">
            ${loading ? h`<div class="cp-loading" style=${{ height: 'auto', padding: '32px 16px' }}><i class="ti ti-loader-2 spinner"></i>Loading…</div>`
              : rows.length === 0
                ? h`<div class="cp-notif-empty"><i class="ti ti-history-off"></i><p>This post hasn't been revised yet — there's only the version you're looking at.</p></div>`
                : rows.map(r => {
                    const isCurrent = (r.revision_round || 0) === currentRound;
                    const isExpanded = expanded.has(r.id);
                    const urls = Array.isArray(r.preview_urls) ? r.preview_urls : [];
                    const isReel = !!r.video_url;
                    const poster = r.video_thumbnail_url || urls[0];
                    return h`<div key=${r.id} class="cp-ver-item">
                      <div class="cp-ver-item-head">
                        <div>
                          <span class=${'cp-ver-tag' + (isCurrent ? ' current' : '')}>${isCurrent ? 'Current' : 'v' + ((r.revision_round || 0) + 1)}</span>
                          <span class="cp-ver-when" style=${{ marginLeft: 8 }}>${fmtWhen(r.sent_at)}</span>
                          ${r.triggered_by && h`<div class="cp-ver-by">Sent by ${r.triggered_by}</div>`}
                        </div>
                      </div>
                      ${r.client_remarks && h`<div class="cp-ver-remarks">
                        <span class="cp-ver-remarks-lbl">You asked for</span>
                        ${r.client_remarks}
                      </div>`}
                      ${(urls.length > 0 || isReel) && h`<div class="cp-ver-strip">
                        ${isReel ? h`<div class="cp-ver-thumb video" onClick=${() => poster && onOpenImage(poster)} style=${poster ? { background: `url("${(poster + '').replace(/"/g, '\\"')}") center/cover` } : {}}>
                          ${!poster && h`<i class="ti ti-video"></i>`}
                          ${!poster && h`<span>Reel</span>`}
                        </div>` : null}
                        ${urls.map((u, i) => h`<div key=${i} class="cp-ver-thumb" onClick=${() => onOpenImage(u)}>
                          <img src=${u} alt=${'v' + ((r.revision_round || 0) + 1) + ' image ' + (i + 1)} loading="lazy"/>
                        </div>`)}
                      </div>`}
                      ${r.caption
                        ? h`<div class=${'cp-ver-cap' + (isExpanded ? '' : ' collapsed')} onClick=${() => toggleExpand(r.id)} role="button" aria-label=${isExpanded ? 'Collapse caption' : 'Expand caption'}>${r.caption}</div>`
                        : h`<div class="cp-ver-empty-cap">(no caption in this version)</div>`}
                      ${r.hashtags && h`<div class="cp-ver-tags">${r.hashtags}</div>`}
                    </div>`;
                  })}
          </div>
        </div>
      </div>`;
    }

    // Full-screen attachment viewer. A component (not inline markup) so it can
    // own a history entry — the Android back button closes just the lightbox.
    function CpLightbox({ url, onClose }) {
      useSheetBack(onClose);
      return h`<div class="cp-lightbox" onClick=${onClose}>
        <button class="close" aria-label="Close" onClick=${(e) => { e.stopPropagation(); onClose(); }}><i class="ti ti-x"></i></button>
        <img src=${url} alt="Attachment"/>
      </div>`;
    }

    function PostDetailSheet({ post, client, user, onClose, onApprove, onRevision, onSendComment, busy }) {
      useSheetBack(onClose);
      const [comments, setComments] = useState([]);
      const [draft, setDraft] = useState('');
      const [sending, setSending] = useState(false);
      const [revOpen, setRevOpen] = useState(false);
      const [copied, setCopied] = useState(null); // 'caption' | 'tags' | null
      // Pending attachments — each entry: { id, status: 'uploading' | 'done' | 'error', url, previewUrl, file }
      const [pending, setPending] = useState([]);
      const [lightbox, setLightbox] = useState(null); // URL string when open
      const [verOpen, setVerOpen] = useState(false);
      const fileInputRef = useRef(null);
      const threadEndRef = useRef(null);
      const MAX_ATTACH_BYTES = 5 * 1024 * 1024; // 5 MB per file
      const MAX_ATTACH_COUNT = 6;

      const pickFiles = () => { if (fileInputRef.current) fileInputRef.current.click(); };
      const onFilesPicked = async (e) => {
        const files = Array.from(e.target.files || []);
        // Reset the input so picking the same file twice still fires onChange.
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (!files.length || !post?.id) return;
        // Count slots in a LOCAL variable — `pending` in this closure goes
        // stale after the first setPending, so a 7-file pick would sail past
        // MAX_ATTACH_COUNT and then trip the DB's 6-attachment CHECK on send.
        let slots = pending.length;
        for (const file of files) {
          if (slots >= MAX_ATTACH_COUNT) break;
          if (!file.type.startsWith('image/')) continue;
          if (file.size > MAX_ATTACH_BYTES) {
            slots++;
            setPending(p => [...p, { id: Math.random().toString(36).slice(2), status: 'error', err: 'Too large (max 5 MB)', file }]);
            continue;
          }
          slots++;
          const tempId = Math.random().toString(36).slice(2);
          const previewUrl = URL.createObjectURL(file);
          setPending(p => [...p, { id: tempId, status: 'uploading', file, previewUrl }]);
          try {
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
            const path = `${post.id}/${tempId}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from('post-comments')
              .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from('post-comments').getPublicUrl(path);
            const url = pub?.publicUrl;
            if (!url) throw new Error('no_url');
            setPending(p => p.map(x => x.id === tempId ? { ...x, status: 'done', url } : x));
          } catch (err) {
            console.warn('[attach] upload failed', err);
            setPending(p => p.map(x => x.id === tempId ? { ...x, status: 'error', err: 'Upload failed' } : x));
          }
        }
      };
      const dropPending = (id) => {
        setPending(p => {
          const target = p.find(x => x.id === id);
          if (target?.previewUrl) try { URL.revokeObjectURL(target.previewUrl); } catch (_) {}
          return p.filter(x => x.id !== id);
        });
      };
      // Cleanup pending object URLs on unmount / post change.
      useEffect(() => () => {
        pending.forEach(x => { if (x.previewUrl) try { URL.revokeObjectURL(x.previewUrl); } catch (_) {} });
      }, [post?.id]);

      // Copy helper — prefers async clipboard API, falls back to a textarea +
      // execCommand for older WebViews. Briefly flashes "Copied" on the button.
      const copyToClipboard = async (which, text) => {
        if (!text) return;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
          }
          setCopied(which);
          setTimeout(() => setCopied(c => (c === which ? null : c)), 1400);
        } catch (_) { /* silent — user can still long-press */ }
      };

      // Load + subscribe to comments for this post
      useEffect(() => {
        if (!post?.id) return;
        let alive = true;
        db('post_comments', `&post_id=eq.${post.id}&order=created_at.asc`).then(rows => {
          if (alive) setComments(rows || []);
        }).catch(() => {});
        const ch = supabase.channel('cp-pc-' + post.id)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_comments', filter: 'post_id=eq.' + post.id }, (payload) => {
            setComments(cs => cs.find(x => x.id === payload.new.id) ? cs : [...cs, payload.new]);
          })
          .subscribe();
        return () => { alive = false; try { supabase.removeChannel(ch); } catch (_) {} };
      }, [post?.id]);

      // Auto-scroll thread to bottom on new comment
      useEffect(() => {
        if (threadEndRef.current) threadEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, [comments.length]);

      const send = async () => {
        const txt = draft.trim();
        const readyUrls = pending.filter(x => x.status === 'done' && x.url).map(x => x.url);
        if (!txt && readyUrls.length === 0) return;
        setSending(true);
        try {
          await onSendComment(post, txt, readyUrls);
          setDraft('');
          // Revoke object URLs + clear pending after successful send.
          pending.forEach(x => { if (x.previewUrl) try { URL.revokeObjectURL(x.previewUrl); } catch (_) {} });
          setPending([]);
        } finally {
          setSending(false);
        }
      };
      const uploadingCount = pending.filter(x => x.status === 'uploading').length;
      const readyAttachCount = pending.filter(x => x.status === 'done').length;
      const canSend = !sending && uploadingCount === 0 && (draft.trim() || readyAttachCount > 0);

      const isPending = post.client_approval === 'pending' && post.workflow_status === 'sent_to_client';
      const color = brandColor(client);
      const ini = initials(client?.name || post.title);
      const caption = post.caption || post.concept || '';
      const tags = post.hashtags;
      const remarks = post.client_remarks;
      const previews = Array.isArray(post.preview_urls) ? post.preview_urls : [];
      const isReel = post.type === 'reel';
      const hasVideo = isReel && post.preview_status === 'ready' && !!post.video_url;
      const hasPreview = !isReel && post.preview_status === 'ready' && previews.length > 0;

      return h`<div class="cp-detail">
        <div class="cp-detail-head">
          <button class="x" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          <div class="cp-detail-head-t">${post.title || 'Post details'}</div>
          ${isReel && h`<span class="cp-reel-tag">REEL</span>`}
          <${StatusPill} post=${post}/>
        </div>
        <div class="cp-detail-main">
          ${hasVideo
            ? h`<div class="cp-detail-hero has-video"><iframe class="cp-detail-video" src=${post.video_url} allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write; accelerometer; gyroscope" allowfullscreen webkitallowfullscreen mozallowfullscreen referrerpolicy="strict-origin-when-cross-origin" title=${post.title || 'Reel preview'}></iframe></div>`
            : hasPreview
            ? h`<div class="cp-detail-hero has-photo"><${HeroCarousel} urls=${previews} alt=${post.title}/></div>`
            : h`<div class="cp-detail-hero" style=${{ background: color }} onClick=${post.drive_link ? () => window.open(post.drive_link, '_blank', 'noopener') : undefined}>
                ${post.drive_link && h`<div class="cp-detail-hero-hint"><i class="ti ti-brand-google-drive"></i>Tap to open Drive</div>`}
                <div class="cp-detail-hero-inner">
                  <div class="cp-detail-hero-mark">${ini}</div>
                  <div class="cp-detail-hero-title">${post.title || 'Untitled post'}</div>
                </div>
              </div>`}
          ${post.preview_status === 'error' && (isReel || !hasPreview) && h`<div style=${{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '14px 16px 0', padding: '11px 13px', borderRadius: 10, background: 'rgba(180,83,9,.08)', border: '1px solid rgba(180,83,9,.25)' }}>
            <i class="ti ti-info-circle" style=${{ color: '#B45309', fontSize: 16, flexShrink: 0, marginTop: 1 }}></i>
            <div style=${{ flex: 1, fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.55, fontFamily: '"Newsreader",Georgia,serif', fontStyle: 'italic' }}>
              We're still working on the preview for this one — your team has been notified. ${post.drive_link ? h`In the meantime you can open the file directly on Drive.` : ''}
            </div>
          </div>`}
          <div class="cp-detail-body">
            <div class="cp-detail-meta">
              <span class="l"><i class=${'ti ' + typeIcon(post.type)}></i>${(post.type || 'post')}</span>
              <span>·</span>
              <span><i class="ti ti-calendar" style=${{ fontSize: 11, marginRight: 3 }}></i>${fmtShort(post.post_date)}<span class="cp-tz-tag">IST</span></span>
              ${Number(post.revision_round) > 0 && h`<span class="cp-rev-tag" title=${'Round ' + (Number(post.revision_round) + 1)}><i class="ti ti-refresh"></i>v${Number(post.revision_round) + 1}</span>`}
              ${Number(post.revision_round) > 0 && h`<button class="cp-rev-link" onClick=${() => setVerOpen(true)} title="See previous versions"><i class="ti ti-history" style=${{ fontSize: 12 }}></i>see what changed</button>`}
            </div>

            ${post.workflow_status === 'scheduled' && post.scheduled_publish_at && h`<div class="cp-sched-line"><i class="ti ti-clock"></i>Scheduled · ${fmtSchedAt(post.scheduled_publish_at)}</div>`}

            ${(post.drive_link || post.post_link) && h`<div class="cp-detail-block">
              <div class="cp-detail-links">
                ${post.drive_link && h`<a class="cp-link-btn" href=${post.drive_link} target="_blank" rel="noopener"><i class="ti ti-brand-google-drive"></i>Open on Drive</a>`}
                ${post.post_link && h`<a class="cp-link-btn" href=${post.post_link} target="_blank" rel="noopener"><i class="ti ti-external-link"></i>View live post ↗</a>`}
              </div>
            </div>`}

            ${caption && h`<div class="cp-detail-block">
              <div class="cp-detail-block-lbl-row">
                <span class="cp-detail-block-lbl">Caption</span>
                <button class=${'cp-copy-btn' + (copied === 'caption' ? ' done' : '')} onClick=${() => copyToClipboard('caption', caption)} aria-label="Copy caption">
                  ${copied === 'caption' ? h`<i class="ti ti-check"></i>Copied` : h`<i class="ti ti-copy"></i>Copy`}
                </button>
              </div>
              <div class="cp-detail-caption">${caption}</div>
            </div>`}

            ${tags && h`<div class="cp-detail-block">
              <div class="cp-detail-block-lbl-row">
                <span class="cp-detail-block-lbl">Hashtags</span>
                <button class=${'cp-copy-btn' + (copied === 'tags' ? ' done' : '')} onClick=${() => copyToClipboard('tags', tags)} aria-label="Copy hashtags">
                  ${copied === 'tags' ? h`<i class="ti ti-check"></i>Copied` : h`<i class="ti ti-copy"></i>Copy`}
                </button>
              </div>
              <div class="cp-detail-tags">${tags}</div>
            </div>`}

            ${remarks && h`<div class="cp-detail-block">
              <div class="cp-detail-block-lbl">Your last revision note</div>
              <div class="cp-detail-caption" style=${{ background: 'rgba(220,38,38,.06)', borderColor: 'rgba(220,38,38,.2)' }}>${remarks}</div>
            </div>`}

            ${isPending && !revOpen && h`<div class="cp-detail-acts">
              <button class="cp-btn pri" disabled=${busy} onClick=${() => onApprove(post)}><i class="ti ti-check"></i>Approve</button>
              <button class="cp-btn rev" disabled=${busy} onClick=${() => setRevOpen(true)}><i class="ti ti-message-circle"></i>Request changes</button>
            </div>`}
            ${isPending && revOpen && h`<${RevisionInline} post=${post} onSubmit=${async (p, t) => { await onRevision(p, t); setRevOpen(false); }} onCancel=${() => setRevOpen(false)} busy=${busy}/>`}

            <div class="cp-detail-block" style=${{ marginTop: 24 }}>
              <div class="cp-detail-block-lbl">Comments <span style=${{ color: 'var(--t3)', fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginLeft: 4 }}>· two-way with your team</span></div>
              <div class="cp-thread">
                ${comments.length === 0
                  ? h`<div class="cp-thread-empty">No comments yet. Send a note or drop a screenshot — it pings your team.</div>`
                  : comments.map(c => {
                      const atts = Array.isArray(c.attachments) ? c.attachments : [];
                      return h`<div key=${c.id} class=${'cp-bubble ' + (c.author_kind === 'client' ? 'mine' : 'theirs')}>
                        <div class="cp-bubble-author">${c.author}${c.author_kind === 'staff' && h`<span style=${{ fontSize: 9, color: 'var(--t3)', fontWeight: 400 }}>Team</span>`}</div>
                        ${c.body}
                        ${atts.length > 0 && h`<div class="cp-bubble-imgs">
                          ${atts.map((u, i) => h`<div key=${i} class="cp-bubble-img" onClick=${() => setLightbox(u)} role="button" aria-label="Open attachment">
                            <img src=${u} alt=${'Attachment ' + (i + 1)} loading="lazy"/>
                          </div>`)}
                        </div>`}
                        <div class="cp-bubble-meta">${new Date(c.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>`;
                    })}
                <div ref=${threadEndRef}></div>
              </div>
              ${pending.length > 0 && h`<div class="cp-attach-pending">
                ${pending.map(p => h`<div key=${p.id} class=${'cp-attach-chip' + (p.status === 'uploading' ? ' uploading' : '')}>
                  ${p.previewUrl ? h`<img src=${p.previewUrl} alt=""/>` : h`<i class="ti ti-photo" style=${{ fontSize: 18, color: 'var(--t3)' }}></i>`}
                  ${p.status === 'uploading' && h`<div class="spinner-overlay"><i class="ti ti-loader-2"></i></div>`}
                  ${p.status === 'error' && h`<div class="spinner-overlay" style=${{ background: 'rgba(220,38,38,.55)', animation: 'none' }} title=${p.err || 'Failed'}><i class="ti ti-alert-circle"></i></div>`}
                  <button class="x" onClick=${() => dropPending(p.id)} aria-label="Remove attachment">×</button>
                </div>`)}
              </div>`}
              <div class="cp-reply">
                <textarea placeholder=${pending.length ? 'Add a note (optional)…' : 'Write a comment or attach a screenshot…'} value=${draft} onInput=${e => setDraft(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (canSend) send(); } }}></textarea>
                <input ref=${fileInputRef} type="file" accept="image/*" multiple style=${{ display: 'none' }} onChange=${onFilesPicked}/>
                <button class="cp-attach-btn" onClick=${pickFiles} disabled=${sending || pending.length >= MAX_ATTACH_COUNT} title=${'Attach images (max ' + MAX_ATTACH_COUNT + ', 5 MB each)'} aria-label="Attach images">
                  <i class="ti ti-paperclip"></i>
                </button>
                <button onClick=${send} disabled=${!canSend} aria-label="Send comment">
                  ${sending ? h`<i class="ti ti-loader-2 spinner"></i>` : h`<i class="ti ti-send" style=${{ fontSize: 15 }}></i>`}
                </button>
              </div>
            </div>
          </div>
        </div>
        ${lightbox && h`<${CpLightbox} url=${lightbox} onClose=${() => setLightbox(null)}/>`}
        ${verOpen && h`<${VersionHistorySheet} post=${post} onClose=${() => setVerOpen(false)} onOpenImage=${(u) => setLightbox(u)}/>`}
      </div>`;
    }

    function PushBanner({ permission, onEnable, onDismiss }) {
      if (permission === 'granted' || permission === 'denied' || permission === 'dismissed') return null;
      // iOS Safari tab (not installed as a PWA): the Notification API doesn't
      // exist, so an Enable button would silently do nothing. Explain the
      // install step instead of rendering a dead button.
      if (permission === 'unsupported') {
        return h`<div class="cp-banner">
          <div class="ic"><i class="ti ti-bell-ringing"></i></div>
          <div class="cp-banner-body">
            <div class="cp-banner-t">Want a ping when posts need you?</div>
            <div class="cp-banner-s">Install the app first: tap <b>Share</b> → <b>Add to Home Screen</b>, then enable notifications here.</div>
            <div class="cp-banner-acts">
              <button class="cp-banner-btn sec" onClick=${onDismiss}>Got it</button>
            </div>
          </div>
        </div>`;
      }
      return h`<div class="cp-banner">
        <div class="ic"><i class="ti ti-bell-ringing"></i></div>
        <div class="cp-banner-body">
          <div class="cp-banner-t">Get pinged on your phone</div>
          <div class="cp-banner-s">Turn on notifications so you know the moment a new post needs your eye — no need to keep the app open.</div>
          <div class="cp-banner-acts">
            <button class="cp-banner-btn" onClick=${onEnable}><i class="ti ti-bell" style=${{ fontSize: 12, marginRight: 4 }}></i>Enable</button>
            <button class="cp-banner-btn sec" onClick=${onDismiss}>Not now</button>
          </div>
        </div>
      </div>`;
    }

    function InstallCard({ installEvent, isIos, isStandalone, onInstall }) {
      if (isStandalone) {
        return h`<div class="cp-acct-row" style=${{ background: 'rgba(34,197,94,.06)', borderColor: 'rgba(34,197,94,.25)' }}>
          <span class="lbl"><i class="ti ti-circle-check" style=${{ color: '#15803D' }}></i>Installed on this device</span>
        </div>`;
      }
      if (installEvent) {
        return h`<div class="cp-banner" style=${{ marginBottom: 12 }}>
          <div class="ic"><i class="ti ti-device-mobile-down"></i></div>
          <div class="cp-banner-body">
            <div class="cp-banner-t">Save to your home screen</div>
            <div class="cp-banner-s">Get a one-tap icon — opens like a real app, no browser bar.</div>
            <div class="cp-banner-acts">
              <button class="cp-banner-btn" onClick=${onInstall}><i class="ti ti-download" style=${{ fontSize: 12, marginRight: 4 }}></i>Add to home screen</button>
            </div>
          </div>
        </div>`;
      }
      if (isIos) {
        return h`<div class="cp-banner" style=${{ marginBottom: 12 }}>
          <div class="ic"><i class="ti ti-brand-apple"></i></div>
          <div class="cp-banner-body">
            <div class="cp-banner-t">Add to your home screen</div>
            <div class="cp-banner-s">Get a one-tap icon — opens like a real app.</div>
            <div class="cp-ios-steps">
              1. Tap the <b>Share</b> icon at the bottom of Safari<br/>
              2. Scroll down and tap <b>Add to Home Screen</b><br/>
              3. Tap <b>Add</b> in the top right
            </div>
          </div>
        </div>`;
      }
      return null;
    }

    // ─── Tabs ──────────────────────────────────────────────────────────────

    function HomeTab({ client, posts, user, onApprove, onRevision, onOpenDetail, onTabChange, busyId, pushBanner, insights }) {
      const pending = posts.filter(p => p.client_approval === 'pending' && p.workflow_status === 'sent_to_client');
      const firstPending = pending[0];

      // Stats for the current month — compare post_date as a local-date STRING
      // (post_date is date-only; new Date('YYYY-MM-DD') parses as UTC midnight,
      // which silently excluded last-day-of-month posts for IST users).
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthPosts = posts.filter(p => p.post_date && String(p.post_date).slice(0, 7) === monthKey);
      const posted = monthPosts.filter(p => p.workflow_status === 'posted').length;
      const totalMonth = monthPosts.length;
      const scheduled = monthPosts.filter(p => p.workflow_status === 'scheduled').length;

      // This week (Mon → Sun)
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dow = today.getDay();
      const monOffset = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(today); monday.setDate(today.getDate() + monOffset);
      const week = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday); d.setDate(monday.getDate() + i);
        const key = localDayKey(d);   // local components — toISOString() shifts IST a day back
        const postOnDay = posts.find(p => p.post_date && p.post_date.slice(0, 10) === key);
        const dotKey = postOnDay ? (
          postOnDay.workflow_status === 'posted' ? 'posted' :
          postOnDay.workflow_status === 'scheduled' ? 'scheduled' :
          postOnDay.client_approval === 'approved' ? 'approved' :
          postOnDay.client_approval === 'revision' ? 'revision' :
          postOnDay.workflow_status === 'sent_to_client' ? 'pending' : ''
        ) : '';
        return { d, key, post: postOnDay, dotKey, isToday: d.getTime() === today.getTime() };
      });

      // Latest 3 posts updated (proxy for team activity)
      const latest = [...posts]
        .filter(p => p.updated_at && p.updated_by)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 3);

      const greetingName = (client?.contact_name || client?.name || 'there').split(' ')[0];

      // Yesterday / Today / Tomorrow timeline strip (STEP 1, editorial-luxe)
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      const postsOn = (d) => posts.filter(p => p.post_date && p.post_date.slice(0, 10) === localDayKey(d));
      const fmtDayCard = (d) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      const stripStatus = (p) => {
        if (p.workflow_status === 'posted') return { key: 'posted', label: 'Posted' };
        if (p.client_approval === 'revision') return { key: 'revision', label: 'In revision' };
        if (p.workflow_status === 'scheduled') return { key: 'scheduled', label: 'Scheduled' };
        if (p.workflow_status === 'approved') return { key: 'approved', label: 'Approved' };
        if (p.workflow_status === 'sent_to_client' && p.client_approval === 'pending') return { key: 'review', label: 'For review' };
        return { key: 'posted', label: (p.workflow_status || 'queued').replace('_', ' ') };
      };
      const timeline = [
        { id: 'y', kicker: 'Yesterday', date: yesterday, items: postsOn(yesterday), empty: 'Nothing went live yesterday.' },
        { id: 't', kicker: 'Today', date: today, items: postsOn(today), now: true, empty: "We're prepping today's post — you'll see it here once it's ready for review." },
        { id: 'm', kicker: 'Tomorrow', date: tomorrow, items: postsOn(tomorrow), empty: 'Nothing queued yet. Your team is shaping the week.' },
      ];

      return h`<div class="cp-pad">
        ${pushBanner}
        <div class="cp-greet">Hi ${greetingName} 👋</div>
        <div class="cp-greet-sub">${pending.length ? `${pending.length} post${pending.length === 1 ? '' : 's'} need${pending.length === 1 ? 's' : ''} your eye today` : 'All caught up — nothing waiting on you.'}</div>

        <div class="cp-tl">
          <div class="cp-tl-rail">
            ${timeline.map(day => h`<div key=${day.id} class="cp-tl-day">
              <div class="cp-tl-head">
                <span class=${'cp-tl-when' + (day.now ? ' now' : '')}>${day.kicker}</span>
                <span class="cp-tl-date">${fmtDayCard(day.date)}</span>
              </div>
              ${day.items.length === 0
                ? h`<div class="cp-tl-empty">
                    <div class="cp-tl-mark">—</div>
                    <p>${day.empty}</p>
                  </div>`
                : (() => {
                    const post = day.items[0];
                    const s = stripStatus(post);
                    const color = brandColor(client);
                    const cap = post.caption || post.concept || post.title || '';
                    const tag = post.type ? post.type.charAt(0).toUpperCase() + post.type.slice(1) : 'Post';
                    const thumbUrl = thumbFor(post);   // content has no media_url — use the preview pipeline like ApprovalCard
                    const thumbBg = thumbUrl
                      ? `linear-gradient(160deg,rgba(0,0,0,0) 50%,rgba(0,0,0,.55) 100%),url("${(thumbUrl + '').replace(/"/g, '\\"')}") center/cover, ${color}`
                      : `linear-gradient(160deg,rgba(0,0,0,.05) 0%,rgba(0,0,0,.55) 100%), ${color}`;
                    const extras = day.items.slice(1);
                    return h`<div style=${{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <div class="cp-tl-card" onClick=${() => onOpenDetail(post)}>
                        <div class="cp-tl-thumb" style=${{ background: thumbBg }}>
                          <span class="cp-tl-type">${tag}</span>
                          ${cap && h`<span class="cp-tl-cap">${cap}</span>`}
                        </div>
                        <div class="cp-tl-foot">
                          <span class=${'cp-stat ' + s.key}><span class="d"></span>${s.label}</span>
                          <span class="cp-tl-arrow">→</span>
                        </div>
                      </div>
                      ${extras.length > 0 && h`<div class="cp-tl-more">
                        ${extras.map(ep => {
                          const ec = ep.caption || ep.concept || ep.title || 'Untitled';
                          const et = ep.type ? ep.type.charAt(0).toUpperCase() + ep.type.slice(1) : 'Post';
                          const eThumb = thumbFor(ep);
                          const sq = eThumb
                            ? { backgroundImage: `url("${(eThumb + '').replace(/"/g, '\\"')}")` }
                            : { background: brandColor(client) };
                          return h`<div key=${ep.id} class="cp-tl-mini" onClick=${() => onOpenDetail(ep)}>
                            <div class="cp-tl-mini-sq" style=${sq}></div>
                            <div class="cp-tl-mini-mid">
                              <span class="cp-tl-mini-type">${et}</span>
                              <span class="cp-tl-mini-cap">${ec}</span>
                            </div>
                            <span class="cp-tl-mini-arrow">→</span>
                          </div>`;
                        })}
                      </div>`}
                    </div>`;
                  })()
              }
            </div>`)}
          </div>
        </div>

        ${(() => {
          // Live KPI tiles from the insights pipeline. Graceful em-dash when
          // the brand has no connected account (or the RPC isn't applied yet).
          const kpi = insights ? insightsKpis(insights.platforms) : null;
          const asOf = kpi?.asOf ? 'as of ' + fmtDayMonth(kpi.asOf) : 'Not connected yet';
          const tile = (lbl, val, meta, metaCls) => h`<div class=${'cp-tile' + (val == null ? ' soon' : '')}>
            <div class="cp-tile-lbl">${lbl}</div>
            <div class="cp-tile-val">${val == null ? '—' : val}</div>
            <div class=${'cp-tile-meta' + (metaCls ? ' ' + metaCls : '')}>${meta}</div>
          </div>`;
          return h`<div class="cp-tiles">
            <div class="cp-tile">
              <div class="cp-tile-lbl">Posts this month</div>
              <div class="cp-tile-val">${posted}<span style=${{ fontSize: 14, color: 'var(--t3)', fontWeight: 500 }}> / ${totalMonth || '—'}</span></div>
              <div class="cp-tile-meta"><i class="ti ti-clock"></i>${scheduled} scheduled</div>
            </div>
            ${tile('Total reach', kpi && kpi.reach != null ? fmtCompact(kpi.reach) : null, asOf)}
            ${tile('Engagement', kpi && kpi.engagement != null ? (kpi.engagementIsRate ? kpi.engagement + '%' : fmtCompact(kpi.engagement)) : null, asOf)}
            ${tile('Followers', kpi && kpi.followers != null ? fmtCompact(kpi.followers) : null,
              kpi && kpi.followersDelta != null && kpi.followersDelta !== 0
                ? (kpi.followersDelta > 0 ? '+' : '') + fmtCompact(kpi.followersDelta) + ' this period'
                : asOf,
              kpi && kpi.followersDelta > 0 ? 'up' : '')}
          </div>`;
        })()}

        <div class="cp-section-head">
          <span class="cp-section-title">Awaiting your approval</span>
          <span class=${'cp-pill' + (pending.length === 0 ? ' zero' : '')}>${pending.length}</span>
        </div>
        ${firstPending
          ? h`<${ApprovalCard} post=${firstPending} client=${client} onApprove=${onApprove} onRevision=${onRevision} onOpenDetail=${onOpenDetail} busy=${busyId === firstPending.id}/>
              ${pending.length > 1 ? h`<div class="cp-dots">
                ${pending.slice(0, Math.min(pending.length, 5)).map((_, i) => h`<span key=${i} class=${i === 0 ? 'on' : ''}></span>`)}
              </div>
              <div style=${{ textAlign: 'center', marginBottom: 22 }}>
                <button class="cp-btn sec" style=${{ flex: 'none', padding: '8px 16px' }} onClick=${() => onTabChange('approve')}>See all ${pending.length} →</button>
              </div>` : h`<div style=${{ height: 22 }}></div>`}`
          : h`<div class="cp-empty" style=${{ marginBottom: 22 }}><i class="ti ti-checks"></i>Nothing pending right now.</div>`}

        <div class="cp-section-title" style=${{ marginBottom: 10 }}>This week</div>
        <div class="cp-week">
          ${week.map(w => h`<div key=${w.key} class=${'cp-day' + (w.isToday ? ' today' : '')}>
            <div class="cp-day-dow">${w.d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3)}</div>
            <span class=${'cp-day-dot' + (w.dotKey ? ' ' + w.dotKey : '')}></span>
            <div class="cp-day-num">${w.d.getDate()}</div>
          </div>`)}
        </div>

        ${latest.length > 0 && h`<div>
          <div class="cp-section-title" style=${{ marginBottom: 10 }}>Latest from your team</div>
          ${latest.map(p => {
            const who = p.updated_by || 'Team';
            const ini = initials(who);
            const palette = ['#1F3A93', '#722B85', '#0E7490', '#B45309', '#15803D'];
            const c = palette[Math.abs(who.length * 7) % palette.length];
            return h`<div key=${p.id} class="cp-act-row">
              <div class="cp-act-av" style=${{ background: c }}>${ini}</div>
              <div class="cp-act-text"><b>${who}</b> updated ${p.title || 'a post'}</div>
              <span class="cp-act-time">${timeAgo(p.updated_at)}</span>
            </div>`;
          })}
        </div>`}
      </div>`;
    }

    function ApproveTab({ client, posts, onApprove, onRevision, onOpenDetail, onBatchApprove, busyId, batchBusy }) {
      const pending = posts.filter(p => p.client_approval === 'pending' && p.workflow_status === 'sent_to_client');
      const decided = posts.filter(p => (p.client_approval === 'approved' || p.client_approval === 'revision') && p.workflow_status !== 'posted');
      // Multi-select state — survives only inside this tab. Cleared after a
      // successful batch or when the user cancels. Set<postId>.
      const [selected, setSelected] = useState(() => new Set());
      const pendingIds = useMemo(() => pending.map(p => p.id), [pending]);
      useEffect(() => {
        // Drop ids that are no longer pending (e.g., someone approved one
        // single-tap while the batch was being assembled, or status changed).
        setSelected(prev => {
          const next = new Set();
          for (const id of prev) if (pendingIds.includes(id)) next.add(id);
          return next.size === prev.size ? prev : next;
        });
      }, [pendingIds.join(',')]);
      const toggle = (post) => {
        setSelected(prev => {
          const next = new Set(prev);
          if (next.has(post.id)) next.delete(post.id); else next.add(post.id);
          return next;
        });
      };
      const clear = () => setSelected(new Set());
      const selectAll = () => setSelected(new Set(pendingIds));
      const allSelected = pending.length > 0 && selected.size === pending.length;
      const doBatch = async () => {
        const batchPosts = pending.filter(p => selected.has(p.id));
        if (!batchPosts.length) return;
        const ok = await onBatchApprove(batchPosts);
        if (ok) clear();
      };
      const hasSelection = selected.size > 0;
      return h`<div class="cp-pad">
        <div class="cp-section-head">
          <span class="cp-section-title">Waiting on you</span>
          <div style=${{ display: 'flex', alignItems: 'center', gap: 8 }}>
            ${pending.length > 1 && h`<button class="cp-rev-chip" style=${{ padding: '4px 10px', fontSize: 11 }} onClick=${allSelected ? clear : selectAll}>${allSelected ? 'Clear all' : 'Select all'}</button>`}
            <span class=${'cp-pill' + (pending.length === 0 ? ' zero' : '')}>${pending.length}</span>
          </div>
        </div>
        ${pending.length === 0
          ? h`<div class="cp-empty" style=${{ marginBottom: 22 }}><i class="ti ti-checks"></i>All caught up. Nothing pending.</div>`
          : h`<div class="cp-list">${pending.map(p => h`<${ApprovalCard} key=${p.id} post=${p} client=${client} onApprove=${onApprove} onRevision=${onRevision} onOpenDetail=${onOpenDetail} busy=${busyId === p.id || batchBusy} selectable=${true} selected=${selected.has(p.id)} onToggleSelect=${toggle}/>`)}</div>`}

        ${decided.length > 0 && h`<div>
          <div class="cp-section-head" style=${{ marginTop: 8 }}>
            <span class="cp-section-title">Recently decided</span>
            <span class="cp-pill zero">${decided.length}</span>
          </div>
          <div class="cp-list">${decided.map(p => h`<${ApprovalCard} key=${p.id} post=${p} client=${client} onApprove=${onApprove} onRevision=${onRevision} onOpenDetail=${onOpenDetail} busy=${false}/>`)}</div>
        </div>`}

        ${hasSelection && h`<div class="cp-batch-spacer"></div>
          <div class="cp-batch-bar">
            <div class="cp-batch-count"><em>${selected.size}</em> selected</div>
            <button class="cp-batch-cancel" onClick=${clear} disabled=${batchBusy}>Cancel</button>
            <button class="cp-batch-approve" onClick=${doBatch} disabled=${batchBusy}>
              ${batchBusy ? h`<i class="ti ti-loader-2 spinner"></i>Approving…` : h`<i class="ti ti-check"></i>Approve ${selected.size}`}
            </button>
          </div>`}
      </div>`;
    }

    // Bottom sheet listing every post on a tapped calendar day. Sits BELOW the
    // post detail sheet (z-index 240 < 250) so tapping a row slides the detail
    // over it — closing the detail drops you back on the day list.
    function CalendarDaySheet({ dateStr, dayPosts, client, onClose, onOpenDetail }) {
      useSheetBack(onClose);
      const label = (() => {
        try {
          const [y, m, d] = dateStr.split('-').map(Number);
          return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        } catch (_) { return dateStr; }
      })();
      return h`<div class="cp-notif-sheet cp-day-sheet" onClick=${onClose}>
        <div class="cp-notif-panel" onClick=${(e) => e.stopPropagation()}>
          <div class="cp-help-grip"></div>
          <div class="cp-notif-head">
            <div>
              <div class="cp-help-h">${label}</div>
              <div class="cp-help-sub">${dayPosts.length} post${dayPosts.length === 1 ? '' : 's'} this day</div>
            </div>
            <button class="cp-bell" aria-label="Close" onClick=${onClose}><i class="ti ti-x" style=${{ fontSize: 18 }}></i></button>
          </div>
          <div class="cp-notif-body">
            ${dayPosts.length === 0
              ? h`<div class="cp-notif-empty"><i class="ti ti-calendar-off"></i><p>Nothing on this day anymore.</p></div>`
              : dayPosts.map(p => {
                  const u = thumbFor(p);
                  return h`<div key=${p.id} class="cp-dayrow" onClick=${() => onOpenDetail(p)}>
                    <div class="cp-dayrow-thumb" style=${u ? { backgroundImage: `url("${(u + '').replace(/"/g, '\\"')}")` } : { background: brandColor(client) }}>${u ? '' : initials(p.title)}</div>
                    <div class="cp-dayrow-mid">
                      <div class="cp-dayrow-title">${p.title || 'Untitled post'}</div>
                      <div class="cp-dayrow-sub">${p.type || 'post'}</div>
                    </div>
                    <${StatusPill} post=${p}/>
                  </div>`;
                })}
          </div>
        </div>
      </div>`;
    }

    function CalendarTab({ client, posts, onOpenDetail }) {
      const now = new Date();
      const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
      // Day sheet for multi-post days — stores the dateStr; posts derive live
      // from props so realtime updates keep the list fresh.
      const [daySheet, setDaySheet] = useState(null);
      const monthStart = new Date(month.y, month.m, 1);
      const monthEnd = new Date(month.y, month.m + 1, 0);
      const firstDow = monthStart.getDay();
      const totalDays = monthEnd.getDate();
      const cells = [];
      for (let i = 0; i < firstDow; i++) cells.push({ blank: true, key: 'b' + i });
      for (let d = 1; d <= totalDays; d++) {
        const dateStr = `${month.y}-${String(month.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayPosts = posts.filter(p => p.post_date && p.post_date.slice(0, 10) === dateStr);
        cells.push({ blank: false, d, dateStr, dayPosts, key: dateStr });
      }
      while (cells.length % 7 !== 0) cells.push({ blank: true, key: 'e' + cells.length });

      const prevMonth = () => setMonth(m => ({ y: m.m === 0 ? m.y - 1 : m.y, m: m.m === 0 ? 11 : m.m - 1 }));
      const nextMonth = () => setMonth(m => ({ y: m.m === 11 ? m.y + 1 : m.y, m: m.m === 11 ? 0 : m.m + 1 }));
      const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const today = new Date(); today.setHours(0, 0, 0, 0);

      return h`<div class="cp-pad">
        <div class="cp-section-head">
          <button class="cp-btn sec" style=${{ flex: 'none', padding: '6px 10px' }} onClick=${prevMonth}><i class="ti ti-chevron-left"></i></button>
          <span class="cp-section-title">${monthLabel}</span>
          <button class="cp-btn sec" style=${{ flex: 'none', padding: '6px 10px' }} onClick=${nextMonth}><i class="ti ti-chevron-right"></i></button>
        </div>
        <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
          ${['S','M','T','W','T','F','S'].map((l, i) => h`<div key=${i} style=${{ textAlign: 'center', fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 500 }}>${l}</div>`)}
        </div>
        <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          ${cells.map(c => {
            if (c.blank) return h`<div key=${c.key} style=${{ aspectRatio: '1/1' }}></div>`;
            // Compare local-date STRINGS — new Date('YYYY-MM-DD') parses as UTC
            // midnight, so the 'today' outline never matched for IST users.
            const isToday = c.dateStr === localDayKey(today);
            const has = c.dayPosts.length > 0;
            // One post → straight to its detail. Several → day sheet listing them.
            const openDay = !has ? undefined
              : c.dayPosts.length === 1 ? () => onOpenDetail(c.dayPosts[0])
              : () => setDaySheet(c.dateStr);
            return h`<div key=${c.key} style=${{ aspectRatio: '1/1', background: 'var(--bg2)', border: '1px solid ' + (isToday ? 'var(--brand,#ff00ee)' : 'var(--bd)'), borderRadius: 8, padding: 4, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: has ? 'pointer' : 'default' }} onClick=${openDay}>
              <div style=${{ fontSize: 11, color: isToday ? 'var(--brand,#ff00ee)' : 'var(--t1)', fontWeight: 500 }}>${c.d}</div>
              <div style=${{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                ${c.dayPosts.slice(0, 3).map(p => {
                  const dotKey = p.workflow_status === 'posted' ? 'posted' :
                    p.workflow_status === 'scheduled' ? 'scheduled' :
                    p.client_approval === 'approved' ? 'approved' :
                    p.client_approval === 'revision' ? 'revision' : 'pending';
                  return h`<span key=${p.id} class=${'cp-day-dot ' + dotKey} style=${{ width: 5, height: 5, margin: 0 }}></span>`;
                })}
              </div>
            </div>`;
          })}
        </div>
        <div style=${{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 18, fontSize: 10.5, color: 'var(--t3)' }}>
          <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i class="cp-day-dot pending"></i>Awaiting you</span>
          <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i class="cp-day-dot approved"></i>Approved</span>
          <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i class="cp-day-dot scheduled"></i>Scheduled</span>
          <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i class="cp-day-dot posted"></i>Posted</span>
          <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i class="cp-day-dot revision"></i>Revision</span>
        </div>
        ${daySheet && h`<${CalendarDaySheet}
          dateStr=${daySheet}
          dayPosts=${posts.filter(p => p.post_date && p.post_date.slice(0, 10) === daySheet)}
          client=${client}
          onClose=${() => setDaySheet(null)}
          onOpenDetail=${onOpenDetail}/>`}
      </div>`;
    }

    // ── Insights ──

    // Inline area sparkline — pure SVG, sized by CSS (.cp-spark-svg), scales
    // via preserveAspectRatio=none. `points` = numeric array oldest→newest.
    function Sparkline({ points, color }) {
      const vals = (points || []).map(v => Number(v)).filter(v => Number.isFinite(v));
      if (vals.length < 2) return h`<div class="cp-spark-flat">Not enough data yet — check back in a few days.</div>`;
      const min = Math.min(...vals), max = Math.max(...vals);
      const span = (max - min) || 1;
      const W = 100, H = 36, P = 3;
      const pts = vals.map((v, i) => [
        (i / (vals.length - 1)) * W,
        P + (1 - (v - min) / span) * (H - 2 * P),
      ]);
      const line = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
      const area = `${line} L${W} ${H} L0 ${H} Z`;
      const c = color || 'var(--brand,#ff00ee)';
      return h`<svg class="cp-spark-svg" viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d=${area} fill=${c} opacity="0.10"/>
        <path d=${line} fill="none" stroke=${c} stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      </svg>`;
    }

    function fmtReportMonth(m) {
      // m = 'YYYY-MM-01' (date column) — parse pieces, never new Date(), so
      // negative-offset timezones can't shift it into the previous month.
      const s = (m || '') + '';
      const y = s.slice(0, 4), mo = parseInt(s.slice(5, 7), 10) - 1;
      return (MONTH_NAMES[mo] ? MONTH_NAMES[mo] + ' ' : '') + y;
    }

    const PLATFORM_META = {
      instagram: { label: 'Instagram', icon: 'ti-brand-instagram' },
      facebook: { label: 'Facebook', icon: 'ti-brand-facebook' },
    };

    // Insights tab — live account performance (followers / reach trends, month
    // KPIs, top posts) from insights_summary_for_self (migration 073), plus a
    // "Monthly reports" view listing reports_list_for_self with PDF links.
    // Everything fails soft: missing RPCs render the not-connected state.
    function InsightsTab({ client }) {
      const [view, setView] = useState('performance');   // 'performance' | 'reports'
      const now = new Date();
      const [monthOff, setMonthOff] = useState(0);       // 0 = current month, negative = past
      const mDate = new Date(now.getFullYear(), now.getMonth() + monthOff, 1);
      const monthArg = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}-01`;
      const monthLabel = mDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const [data, setData] = useState(undefined);       // undefined=loading · null=unavailable
      const [platform, setPlatform] = useState(null);    // null → primary
      useEffect(() => {
        let alive = true;
        setData(undefined);
        rpcCall('insights_summary_for_self', { p_month: monthArg })
          .then(raw => { if (alive) setData(normalizeInsights(raw)); })
          .catch(() => { if (alive) setData(null); });
        return () => { alive = false; };
      }, [monthArg]);

      // Reports list — fetched lazily the first time the view opens.
      const [reports, setReports] = useState(undefined); // undefined=not asked/loading · null=error
      useEffect(() => {
        if (view !== 'reports') return;
        let alive = true;
        setReports(prev => (prev === undefined || prev === null ? undefined : prev));
        rpcCall('reports_list_for_self')
          .then(rows => {
            if (!alive) return;
            const list = Array.isArray(rows) ? rows : (rows && Array.isArray(rows.reports) ? rows.reports : []);
            setReports(list);
          })
          .catch(() => { if (alive) setReports(null); });
        return () => { alive = false; };
      }, [view]);

      const plats = (data && data.platforms) || [];
      const sel = plats.find(p => p.platform === platform) || plats[0] || null;
      const kpi = sel ? insightsKpis([sel]) : null;
      const series = sel ? sel.series : [];
      const followersPts = series.filter(s => s && s.followers != null).map(s => s.followers);
      const reachPts = series.filter(s => s && s.reach != null).map(s => s.reach);
      const followersDelta = followersPts.length >= 2 ? Number(followersPts[followersPts.length - 1]) - Number(followersPts[0]) : null;
      const topPosts = (data && data.top_posts) || [];

      const perfBody = data === undefined
        ? h`<div class="cp-loading" style=${{ minHeight: 200 }}><i class="ti ti-loader-2 spinner"></i>Loading insights…</div>`
        : !data
        ? h`<div class="cp-soon">
            <i class="ti ti-plug-connected-x"></i>
            <h3>Not connected yet</h3>
            <p>Your agency hasn't connected your accounts yet. Once Instagram or Facebook is linked, reach, engagement and follower trends will appear here automatically.</p>
          </div>`
        : h`<div>
            ${plats.length > 1 && h`<div class="cp-plat-chips">
              ${plats.map(p => {
                const meta = PLATFORM_META[p.platform] || { label: p.platform, icon: 'ti-world' };
                const on = sel && sel.platform === p.platform;
                return h`<button key=${p.platform} class=${'cp-plat-chip' + (on ? ' on' : '')} onClick=${() => setPlatform(p.platform)}>
                  <i class=${'ti ' + meta.icon}></i>${meta.label}
                </button>`;
              })}
            </div>`}

            <div class="cp-spark-card">
              <div class="cp-spark-head">
                <div>
                  <div class="cp-spark-lbl">Followers</div>
                  <div class="cp-spark-val">${kpi && kpi.followers != null ? fmtCompact(kpi.followers) : '—'}</div>
                </div>
                ${followersDelta != null && followersDelta !== 0 && h`<span class=${'cp-spark-delta ' + (followersDelta > 0 ? 'up' : 'down')}>${(followersDelta > 0 ? '+' : '') + fmtCompact(followersDelta)} this month</span>`}
              </div>
              <${Sparkline} points=${followersPts}/>
            </div>
            <div class="cp-spark-card">
              <div class="cp-spark-head">
                <div>
                  <div class="cp-spark-lbl">Reach</div>
                  <div class="cp-spark-val">${kpi && kpi.reach != null ? fmtCompact(kpi.reach) : '—'}</div>
                </div>
                ${kpi && kpi.asOf && h`<span class="cp-spark-delta">as of ${fmtDayMonth(kpi.asOf)}</span>`}
              </div>
              <${Sparkline} points=${reachPts}/>
            </div>

            <div class="cp-tiles" style=${{ margin: '14px 0 18px' }}>
              <div class=${'cp-tile' + (kpi && kpi.engagement != null ? '' : ' soon')}>
                <div class="cp-tile-lbl">Engagement</div>
                <div class="cp-tile-val">${kpi && kpi.engagement != null ? (kpi.engagementIsRate ? kpi.engagement + '%' : fmtCompact(kpi.engagement)) : '—'}</div>
                <div class="cp-tile-meta">${kpi && kpi.asOf ? 'as of ' + fmtDayMonth(kpi.asOf) : 'No data yet'}</div>
              </div>
              <div class=${'cp-tile' + (kpi && kpi.followers != null ? '' : ' soon')}>
                <div class="cp-tile-lbl">Followers</div>
                <div class="cp-tile-val">${kpi && kpi.followers != null ? fmtCompact(kpi.followers) : '—'}</div>
                <div class=${'cp-tile-meta' + (followersDelta > 0 ? ' up' : '')}>${followersDelta != null && followersDelta !== 0 ? (followersDelta > 0 ? '+' : '') + fmtCompact(followersDelta) + ' this month' : (kpi && kpi.asOf ? 'as of ' + fmtDayMonth(kpi.asOf) : 'No data yet')}</div>
              </div>
            </div>

            <div class="cp-section-head" style=${{ marginTop: 4 }}>
              <span class="cp-section-title">Top posts</span>
            </div>
            ${topPosts.length === 0
              ? h`<div class="cp-empty"><i class="ti ti-chart-bar" style=${{ fontSize: 20, display: 'block', marginBottom: 6 }}></i>No post performance for this month yet.</div>`
              : topPosts.map(p => {
                  const previews = Array.isArray(p.preview_urls) ? p.preview_urls : [];
                  const u = previews[0] || null;
                  const perf = p.performance || {};
                  const bits = [];
                  if (perf.reach != null) bits.push(fmtCompact(perf.reach) + ' reach');
                  if (perf.likes != null) bits.push(fmtCompact(perf.likes) + ' likes');
                  if (perf.comments != null) bits.push(fmtCompact(perf.comments) + ' comments');
                  return h`<a key=${p.content_id || p.title} class="cp-top-post" href=${p.post_link || undefined} target=${p.post_link ? '_blank' : undefined} rel="noopener" style=${{ textDecoration: 'none', ...(p.post_link ? {} : { cursor: 'default' }) }}>
                    <div class="cp-top-thumb" style=${u ? { backgroundImage: `url("${(u + '').replace(/"/g, '\\"')}")` } : { background: brandColor(client) }}>${u ? '' : h`<i class=${'ti ' + typeIcon(p.type)}></i>`}</div>
                    <div class="cp-top-mid">
                      <div class="cp-top-title">${p.title || 'Untitled post'}</div>
                      <div class="cp-top-meta">${bits.length ? bits.join(' · ') : (p.post_date ? fmtDayMonth(p.post_date) : '')}</div>
                    </div>
                    ${p.post_link && h`<i class="ti ti-external-link" style=${{ color: 'var(--t3)', fontSize: 15, flexShrink: 0 }}></i>`}
                  </a>`;
                })}
          </div>`;

      const reportsBody = reports === undefined
        ? h`<div class="cp-loading" style=${{ minHeight: 200 }}><i class="ti ti-loader-2 spinner"></i>Loading reports…</div>`
        : reports === null
        ? h`<div class="cp-empty"><i class="ti ti-cloud-off" style=${{ fontSize: 20, display: 'block', marginBottom: 6 }}></i>Couldn't load reports. Check your connection and try again.</div>`
        : reports.length === 0
        ? h`<div class="cp-soon">
            <i class="ti ti-report-analytics"></i>
            <h3>No reports yet</h3>
            <p>Your monthly performance reports will appear here as soon as your agency publishes the first one.</p>
          </div>`
        : h`<div>${reports.map(r => h`<div key=${r.id || r.month} class="cp-rep-card">
            <div style=${{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div class="cp-rep-month">${fmtReportMonth(r.month)}</div>
                ${(r.sent_at || r.created_at) && h`<div class="cp-rep-sent">${r.sent_at ? 'Sent ' + fmtDayMonth(r.sent_at) : 'Prepared ' + fmtDayMonth(r.created_at)}</div>`}
              </div>
              ${r.pdf_url && h`<a class="cp-rep-open" href=${r.pdf_url} target="_blank" rel="noopener"><i class="ti ti-file-text"></i>Open PDF</a>`}
            </div>
            <div class="cp-rep-kpis">
              ${r.total_reach != null && h`<div class="cp-rep-kpi"><b>${fmtCompact(r.total_reach)}</b><span>Reach</span></div>`}
              ${r.engagement_rate != null && h`<div class="cp-rep-kpi"><b>${r.engagement_rate}%</b><span>Engagement</span></div>`}
              ${r.new_followers != null && h`<div class="cp-rep-kpi"><b>+${fmtCompact(r.new_followers)}</b><span>Followers</span></div>`}
              ${r.website_clicks != null && Number(r.website_clicks) > 0 && h`<div class="cp-rep-kpi"><b>${fmtCompact(r.website_clicks)}</b><span>Site clicks</span></div>`}
            </div>
          </div>`)}</div>`;

      return h`<div class="cp-pad">
        <div class="cp-ins-seg">
          <button class=${view === 'performance' ? 'on' : ''} onClick=${() => setView('performance')}>Performance</button>
          <button class=${view === 'reports' ? 'on' : ''} onClick=${() => setView('reports')}>Monthly reports</button>
        </div>
        ${view === 'performance' && h`<div class="cp-section-head" style=${{ marginTop: 0 }}>
          <button class="cp-btn sec" style=${{ flex: 'none', padding: '6px 10px' }} onClick=${() => setMonthOff(o => o - 1)}><i class="ti ti-chevron-left"></i></button>
          <span class="cp-section-title">${monthLabel}</span>
          <button class="cp-btn sec" style=${{ flex: 'none', padding: '6px 10px', opacity: monthOff >= 0 ? 0.35 : 1 }} disabled=${monthOff >= 0} onClick=${() => setMonthOff(o => Math.min(0, o + 1))}><i class="ti ti-chevron-right"></i></button>
        </div>`}
        ${view === 'performance' ? perfBody : reportsBody}
      </div>`;
    }

    // ── Payments ──
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    function fmtMoney(n, withDec = false) {
      const v = Number(n) || 0;
      const opts = { maximumFractionDigits: withDec ? 2 : 0, minimumFractionDigits: withDec ? 2 : 0 };
      return v.toLocaleString('en-IN', opts);
    }
    function fmtPeriod(inv) {
      if (inv.period_label) return inv.period_label;
      try {
        const d = new Date(inv.period_start);
        return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
      } catch (_) { return inv.period_start || '—'; }
    }
    function fmtDayMonth(s) {
      if (!s) return '';
      try {
        const d = new Date(s);
        const day = String(d.getDate()).padStart(2, '0');
        return `${day} ${MONTH_NAMES[d.getMonth()].slice(0,3)}`;
      } catch (_) { return s; }
    }
    function fmtFullDate(s) {
      if (!s) return '';
      try {
        const d = new Date(s);
        return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
      } catch (_) { return s; }
    }
    function loadRazorpaySDK() {
      return new Promise((resolve, reject) => {
        if (window.Razorpay) return resolve(window.Razorpay);
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = () => window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay SDK not exposed'));
        s.onerror = () => reject(new Error('Razorpay SDK failed to load'));
        document.head.appendChild(s);
      });
    }

    // Full-screen invoice viewer for the portal — uses the dashboard's InvoiceTemplate
    // (Zoho-style) so client + admin see the exact same document. Lazy-loads html2pdf
    // for the Download button.
    function InvoiceSheet({ invoice, onClose, onPay, paying, payAmount, showToast }) {
      useSheetBack(onClose);   // hook first — mounted only while an invoice is open
      if (!invoice) return null;
      const total = Number(invoice.amount) || 0;
      const paid = Number(invoice.amount_paid) || 0;
      const balance = Math.max(0, total - paid);
      const downloadPDF = async () => {
        try {
          if (!window.html2pdf) {
            await new Promise((res, rej) => {
              const s = document.createElement('script');
              s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
              s.onload = res; s.onerror = rej; document.head.appendChild(s);
            });
          }
          const el = document.querySelector('.inv-sheet-body .inv-doc');
          if (!el) { showToast?.('Invoice not rendered'); return; }
          await window.html2pdf().from(el).set({
            margin: 0,
            filename: 'Invoice-' + invoice.invoice_number + '.pdf',
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          }).save();
        } catch (e) {
          console.warn('[pdf] failed', e);
          showToast?.('Could not generate PDF');
        }
      };
      return h`<div class="inv-sheet-overlay" onClick=${e => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="inv-sheet">
          <div class="inv-sheet-head">
            <div class="l">
              <span class="num">${invoice.invoice_number}</span>
              <span class="meta">· ${(AMS.fmtMonthYear || fmtMonthYear2)(invoice.period_start)} · ${(invoice.status || '').toUpperCase()}</span>
            </div>
            <button class="close" onClick=${onClose} aria-label="Close"><i class="ti ti-x" style=${{fontSize:20}}></i></button>
          </div>
          <div class="inv-sheet-body">
            ${InvoiceTemplate
              ? h`<${InvoiceTemplate} invoice=${invoice}/>`
              : h`<div class="cp-pad"><div class="cp-empty"><i class="ti ti-alert-circle"></i>Invoice template not loaded. Refresh the page.</div></div>`}
          </div>
          <div class="inv-sheet-foot">
            <button class="btn-pdf" onClick=${downloadPDF}><i class="ti ti-download"></i>Download PDF</button>
            ${onPay && balance > 0 && h`<button class="btn-pay" onClick=${onPay} disabled=${paying}>
              ${paying ? 'Opening checkout…' : `Pay ₹${fmtINR2(payAmount || balance, false)} now`}
            </button>`}
          </div>
        </div>
      </div>`;
    }

    function PaymentsTab({ client, user, showToast, agencyConfig }) {
      const [invoices, setInvoices] = useState([]);
      const [loading, setLoading] = useState(true);
      const [err, setErr] = useState('');
      const [paying, setPaying] = useState(false);
      const [success, setSuccess] = useState(null); // { amount, period }
      // Partial-payment UI state. Off by default; the "Pay a partial amount"
      // link expands an inline input + dedicated CTA. The Edge Function clamps
      // to [100, balance] server-side so user-entered junk can't escape.
      const [partialMode, setPartialMode] = useState(false);
      const [partialAmount, setPartialAmount] = useState('');

      const load = useCallback(async () => {
        if (!client?.id) return;
        setErr('');
        try {
          // mark_overdue_invoices is now run by the daily cron (it was locked
          // away from anon in migration 017). The server-side overdue flag is
          // refreshed once a day server-side — that's accurate enough.
          const rows = await rpcCall('inv_list_for_self', { p_limit: 24 });
          setInvoices(rows || []);
        } catch (e) {
          console.warn('[payments] load failed', e);
          setErr('Could not load invoices. Pull to refresh.');
        } finally {
          setLoading(false);
        }
      }, [client?.id]);

      useEffect(() => { load(); }, [load]);

      // Refresh on tab visibility / window focus instead of postgres_changes —
      // after migration 017's REVOKE SELECT, realtime no longer delivers
      // invoice rows to anon. The Razorpay onSuccess handler also polls
      // inv_get explicitly for the post-payment status flip. Also listen for
      // the portal's pull-to-refresh event so dragging the screen down on
      // Payments re-fetches invoices.
      useEffect(() => {
        if (!client?.id) return;
        const onWake = () => { if (document.visibilityState === 'visible') load(); };
        const onRefresh = () => load();
        document.addEventListener('visibilitychange', onWake);
        window.addEventListener('focus', onWake);
        window.addEventListener('cp-refresh', onRefresh);
        return () => {
          document.removeEventListener('visibilitychange', onWake);
          window.removeEventListener('focus', onWake);
          window.removeEventListener('cp-refresh', onRefresh);
        };
      }, [client?.id, load]);

      // Pick the most urgent unpaid invoice for the hero card.
      // Hero card picks the most urgent open invoice. Partial counts as open too
      // (50% advance is "in progress, balance pending"), but ranks below overdue.
      const due = useMemo(() => {
        const open = invoices.filter(i => i.status === 'overdue' || i.status === 'due' || i.status === 'partial');
        if (!open.length) return null;
        const rank = (s) => s === 'overdue' ? 0 : s === 'due' ? 1 : 2; // partial last
        open.sort((a, b) => {
          const r = rank(a.status) - rank(b.status);
          if (r !== 0) return r;
          return (a.period_start || '').localeCompare(b.period_start || '');
        });
        return open[0];
      }, [invoices]);

      const history = useMemo(() => invoices.filter(i => i !== due), [invoices, due]);

      const daysOverdue = useMemo(() => {
        if (!due || due.status !== 'overdue' || !due.due_date) return 0;
        const diff = Math.floor((Date.now() - new Date(due.due_date).getTime()) / 86400000);
        return Math.max(0, diff);
      }, [due]);

      // Balance remaining on the hero invoice (handles partial = total - amount_paid).
      const heroBalance = useMemo(() => {
        if (!due) return 0;
        return Math.max(0, (Number(due.amount) || 0) - (Number(due.amount_paid) || 0));
      }, [due]);
      const heroPaid = Number(due?.amount_paid) || 0;
      const isPartial = due?.status === 'partial';

      // Tap-to-view: which invoice is showing in the full sheet. Initialized from hash
      // so deep-links like #/payments/invoice/<id> open straight to that invoice.
      const [viewing, setViewing] = useState(null);
      useEffect(() => {
        const r = cpParseHash();
        if (!r.invoiceId || !invoices.length) return;
        if (viewing && viewing.id === r.invoiceId) return;
        const match = invoices.find(i => String(i.id) === String(r.invoiceId));
        if (match) setViewing(match);
      }, [invoices]);
      // Sync viewing → hash so refreshing keeps the sheet open & sharing works.
      useEffect(() => {
        if (viewing) cpWriteHash({ tab: 'payments', invoiceId: viewing.id });
        else {
          const r = cpParseHash();
          if (r.invoiceId) cpWriteHash({ tab: 'payments' }); // close → strip the invoice segment
        }
      }, [viewing?.id]);

      const payWithRazorpay = useCallback(async (overrideAmount) => {
        if (!due) return;
        setPaying(true);
        try {
          // Create the Razorpay order server-side (the key secret never touches the browser).
          // overrideAmount: if provided, request a partial payment. Edge Function
          // clamps to [100, balance].
          const body = { invoice_id: due.id, invoice_number: due.invoice_number };
          if (Number.isFinite(overrideAmount) && overrideAmount > 0) body.partial_amount = overrideAmount;
          const { data, error } = await supabase.functions.invoke('razorpay-create-order', {
            body,
          });
          if (error) throw error;
          if (!data?.order_id || !data?.key_id) throw new Error(data?.message || 'Order creation failed');

          const Razorpay = await loadRazorpaySDK();
          // Edge Function returns the balance (= amount - amount_paid). Charge that.
          const chargeAmount = Number(data.amount) / 100; // Razorpay returns paise
          const rzp = new Razorpay({
            key: data.key_id,
            order_id: data.order_id,
            amount: Math.round(chargeAmount * 100),
            currency: due.currency || 'INR',
            name: 'Advance Media Solution',
            description: `Invoice ${due.invoice_number} · ${fmtPeriod(due)}`,
            prefill: {
              name: client?.name || user?.name || '',
              email: client?.contact_email || user?.email || '',
              contact: client?.contact_phone || '',
            },
            theme: { color: '#FF00EE' },
            handler: async (response) => {
              // Trigger flips amount_paid + status. The webhook does the same
              // server-side as the source of truth, but is idempotent on
              // razorpay_payment_id so we never get a duplicate row. The
              // client portal session may not have billing-write privileges
              // (role_level='client'), so this is best-effort — if it 403s,
              // the webhook will record the payment shortly after.
              try {
                await rpcCall('inv_payment_record', { p_data: {
                  invoice_id: due.id,
                  amount: chargeAmount,
                  paid_on: new Date().toISOString().slice(0, 10),
                  method: 'Razorpay',
                  reference: response.razorpay_payment_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  razorpay_order_id: data.order_id,
                } }, { silentAuth: true });
              } catch (_) { /* webhook will fix it */ }
              const wasPartial = chargeAmount + 0.5 < heroBalance; // tolerate rounding
              const remaining = Math.max(0, heroBalance - chargeAmount);
              setSuccess({ amount: chargeAmount, period: fmtPeriod(due), isPartial: wasPartial, remaining });
              try { insertNotif('role:admin,manager!' + (client?.name || 'A client'),
                wasPartial ? '💸 Part-payment received' : '💸 Payment received',
                `${client?.name || 'Client'} paid ₹${fmtMoney(chargeAmount)} for invoice ${due.invoice_number} (${fmtPeriod(due)}) via Razorpay.${wasPartial ? ` Balance ₹${fmtMoney(remaining)} remains.` : ''}`,
                'info', client?.name, null, 'invoice', due.id); } catch (_) {}
              // Poll for the webhook-driven status flip — the webhook may take
              // a couple of seconds. Up to 60 s, then give up and trust the
              // visibility-change reload.
              let tries = 0;
              const poll = setInterval(async () => {
                tries++;
                try {
                  const fresh = await rpcCall('inv_get', { p_id: due.id });
                  if (fresh && (fresh.status === 'paid' || fresh.status === 'partial')) {
                    setInvoices(invs => invs.map(i => i.id === due.id ? fresh : i));
                    clearInterval(poll);
                  }
                } catch (_) {}
                if (tries >= 20) clearInterval(poll);   // ~60s @ 3s
              }, 3000);
              load();
            },
            modal: {
              ondismiss: () => setPaying(false),
            },
          });
          rzp.on && rzp.on('payment.failed', (resp) => {
            console.warn('[razorpay] payment.failed', resp);
            showToast('Payment failed. Please try again or contact your account manager.');
            setPaying(false);
          });
          rzp.open();
        } catch (e) {
          console.warn('[razorpay] init failed', e);
          showToast(e?.message?.includes('not found') || e?.context?.status === 404
            ? 'Razorpay not configured yet — your account manager has been notified.'
            : 'Could not start checkout. Please try again.');
          setPaying(false);
        }
      }, [due, client, user, load, showToast]);

      const sendProof = () => {
        // Prefer the agency WhatsApp number from agency_settings.contact_phone
        // so the client lands in the AMS chat directly instead of WhatsApp's
        // contact picker. Strip non-digits — wa.me requires the bare E.164
        // form without '+', spaces or dashes.
        const text = encodeURIComponent(`Hi! I have paid invoice ${due?.invoice_number || ''} for ${due ? fmtPeriod(due) : ''}. Attaching proof.`);
        const raw = (agencyConfig?.contact_phone || '').toString().replace(/[^0-9]/g, '');
        const number = raw.length === 10 ? '91' + raw : raw; // assume India if local format
        const url = number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      };

      if (loading) return h`<div class="cp-loading"><i class="ti ti-loader-2 spinner"></i>Loading your invoices…</div>`;
      if (err) return h`<div class="cp-pad"><div class="cp-empty"><i class="ti ti-alert-circle"></i>${err}</div></div>`;

      const allPaidOrEmpty = !due;

      return h`<div style=${{ position: 'relative' }}>
        ${success && h`<div class="pay-success-overlay">
          <div class="pay-success-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
          </div>
          <div class="pay-success-eye">Received with thanks</div>
          <div class="pay-success-title">${success.isPartial ? h`<span>Part-payment <em>received</em></span>` : h`<span>Paid in <em>full</em></span>`}</div>
          <div class="pay-success-msg">${success.isPartial
            ? h`Thank you. We've recorded your part-payment and we'll send a fresh receipt with the running balance.`
            : h`Thank you for trusting us with another month of the work. Your receipt is on its way to your inbox.`}</div>
          <div class="pay-success-amt">₹${fmtMoney(success.amount)} · ${success.period}${success.isPartial && success.remaining > 0 ? ` · ₹${fmtMoney(success.remaining)} balance remains` : ''}</div>
          <button class="pay-success-close" onClick=${() => { setSuccess(null); setPartialMode(false); setPartialAmount(''); }}>Close</button>
        </div>`}

        ${allPaidOrEmpty
          ? (invoices.length
              ? h`<div>
                  <div class="pay-eye is-clear"><span class="d"></span>All clear · nothing due</div>
                  <div class="pay-hero">
                    <div class="pay-hero-r">
                      <span class="pay-hero-period">You are <em>paid up</em> through ${fmtPeriod(invoices[0])}</span>
                    </div>
                    <div class="pay-hero-amount"><span class="cur">₹</span>0</div>
                    <div class="pay-hero-meta">
                      <span class="due clear">Next invoice arrives <b>${client?.invoice_day ? 'on the ' + ordinalDay(client.invoice_day) : 'with your next month'}</b></span>
                    </div>
                  </div>
                </div>`
              : h`<div class="pay-empty">
                  <div class="pay-empty-mark">₹</div>
                  <p>No invoices yet. Your account manager will share the first one when this month's retainer kicks in.</p>
                </div>`)
          : h`<div>
              <div class=${'pay-eye ' + (isPartial ? '' : daysOverdue > 0 ? '' : 'is-due')}>
                <span class="d"></span>
                ${isPartial ? `Balance pending · advance received` :
                  daysOverdue > 0 ? `Due now · ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue` :
                  'Due now'}
              </div>

              <div class="pay-hero" onClick=${() => setViewing(due)} style=${{ cursor: 'pointer' }} title="Tap to view full invoice">
                <div class="pay-hero-r">
                  <span class="pay-hero-period">For the month of <em>${fmtPeriod(due)}</em></span>
                  <span class=${'pay-stat ' + due.status}><span class="d"></span>${due.status === 'overdue' ? 'Overdue' : due.status === 'partial' ? 'Partial' : 'Due'}</span>
                </div>
                <div class="pay-hero-amount">
                  <span class="cur">₹</span>${fmtMoney(heroBalance)}<span class="dec">.00</span>
                </div>
                <div class="pay-hero-meta">
                  ${isPartial
                    ? h`<span class="due">₹${fmtMoney(heroPaid)} advance received · ₹${fmtMoney(heroBalance)} balance</span>`
                    : h`<span class="due">Was due on <b>${fmtFullDate(due.due_date)}</b></span>`}
                  <span class="pay-hero-inv">Inv · ${due.invoice_number}</span>
                </div>
              </div>

              <div class="pay-cta">
                <button class="btn pri" onClick=${() => payWithRazorpay()} disabled=${paying || partialMode}>
                  ${paying ? 'Opening checkout…' : h`<span>${isPartial ? 'Pay balance' : 'Pay'} ₹${fmtMoney(heroBalance)} now</span><span class="arrow">→</span>`}
                </button>
                <button class="btn ghost" onClick=${(e) => { e.stopPropagation(); setViewing(due); }} title="View full invoice">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>
                  View
                </button>
              </div>
              ${!partialMode && heroBalance > 100 && h`<button class="pay-partial-toggle" onClick=${() => { setPartialMode(true); setPartialAmount(''); }} disabled=${paying}>or pay a partial amount</button>`}
              ${partialMode && (() => {
                const parsed = Number(partialAmount);
                const invalid = partialAmount && (!Number.isFinite(parsed) || parsed < 100 || parsed > heroBalance);
                const tooLow = partialAmount && Number.isFinite(parsed) && parsed < 100;
                const tooHigh = partialAmount && Number.isFinite(parsed) && parsed > heroBalance;
                const canSubmit = !paying && Number.isFinite(parsed) && parsed >= 100 && parsed <= heroBalance;
                return h`<div class="pay-partial-box">
                  <div class="pay-partial-row">
                    <span class="cur">₹</span>
                    <input class=${'pay-partial-input' + (invalid ? ' invalid' : '')} type="number" inputmode="numeric" min="100" max=${heroBalance} step="1"
                      placeholder=${'Min 100 · Max ' + fmtMoney(heroBalance)}
                      value=${partialAmount}
                      onInput=${e => setPartialAmount(e.target.value)}
                      onKeyDown=${e => { if (e.key === 'Enter' && canSubmit) payWithRazorpay(parsed); }}/>
                  </div>
                  <div class=${'pay-partial-hint' + (invalid ? ' err' : '')}>
                    ${tooLow ? 'Minimum ₹100.' : tooHigh ? `Max is the balance — ₹${fmtMoney(heroBalance)}.` : `Balance after this would be ₹${fmtMoney(Math.max(0, heroBalance - (Number.isFinite(parsed) ? parsed : 0)))}.`}
                  </div>
                  <div class="pay-partial-acts">
                    <button class="cancel" onClick=${() => { setPartialMode(false); setPartialAmount(''); }} disabled=${paying}>Cancel</button>
                    <button class="submit" onClick=${() => payWithRazorpay(parsed)} disabled=${!canSubmit}>
                      ${paying ? 'Opening…' : 'Pay ₹' + (partialAmount ? fmtMoney(parsed) : '—')}
                    </button>
                  </div>
                </div>`;
              })()}
              <div class="pay-methods">UPI · Cards · Net Banking · Wallets · EMI</div>
              <div class="pay-fine">
                Already paid via UPI or bank transfer? <a onClick=${sendProof}>Send proof on WhatsApp →</a> and your account manager will mark it within 24h.
              </div>
            </div>`}

        ${history.length > 0 && h`<div>
          <div class="pay-sec-head">
            <span class="pay-sec-title">Invoice history</span>
            <span class="pay-sec-meta">${history.length} month${history.length === 1 ? '' : 's'}</span>
          </div>
          <div class="pay-inv-list">
            ${history.map(inv => h`<div key=${inv.id} class="pay-inv" onClick=${() => setViewing(inv)} style=${{ cursor: 'pointer' }}>
              <span class="pay-inv-num">${inv.invoice_number}</span>
              <div class="pay-inv-mid">
                <div class="pay-inv-period">
                  ${fmtPeriod(inv)}
                  ${inv.notes && inv.notes.length < 32 && h`<span class="extra">${inv.notes}</span>`}
                </div>
                <div class="pay-inv-foot">
                  <span class=${'pay-stat ' + inv.status}>
                    <span class="d"></span>
                    ${inv.status === 'paid' && inv.paid_at ? `Paid · ${fmtDayMonth(inv.paid_at)}`
                      : inv.status === 'partial' ? `Partial · ₹${fmtMoney(Number(inv.amount_paid)||0)} paid`
                      : inv.status === 'waived' ? `Waived${inv.notes ? ' · ' + inv.notes.split('\n')[0].slice(0, 24) : ''}`
                      : inv.status === 'cancelled' ? 'Cancelled'
                      : inv.status === 'overdue' ? `Overdue · ${fmtDayMonth(inv.due_date)}`
                      : `Due · ${fmtDayMonth(inv.due_date)}`}
                  </span>
                </div>
              </div>
              <span class=${'pay-inv-amt' + (inv.status === 'waived' ? ' waived' : '')}>
                <span class="cur">₹</span>${fmtMoney(inv.amount)}
              </span>
            </div>`)}
          </div>
        </div>`}

        ${viewing && h`<${InvoiceSheet} invoice=${viewing} onClose=${() => setViewing(null)} onPay=${due && viewing.id === due.id ? payWithRazorpay : null} paying=${paying} payAmount=${heroBalance} showToast=${showToast}/>`}
      </div>`;
    }

    // ── Onboarding wizard ────────────────────────────────────────────
    // Shown in place of the normal portal whenever the brand still has work
    // to do on their onboarding journey:
    //   form_sent     → wizard collects answers, calls submit_onboarding
    //   form_filled   → "Thanks, your contract is on the way" waiting screen
    //   contract_sent → "Sign the contract" CTA (Phase 6 wires the link)
    //   contract_signed → near-final waiting screen (Phase 6 transitions to onboarded)
    //   onboarded     → wizard hides; normal portal renders
    //
    // The whole component takes over the viewport (cp-wiz position:fixed) so
    // the brand can't get distracted by tabs that wouldn't work yet anyway.
    // The sole escape hatch is the Sign out button in the wizard header.

    // Tiny markdown renderer — only the subset used in our seeded access
    // guides (bold, code, ordered + unordered lists, paragraphs). Resolves
    // {{agency_access_email}} placeholder inline. Returns an HTML string.
    function renderAccessGuide(md, agencyAccessEmail) {
      if (!md) return '';
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const inline = (s) => esc(s)
        .replace(/\{\{agency_access_email\}\}/g, agencyAccessEmail || 'us')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
      const lines = md.split(/\r?\n/);
      const out = [];
      let inList = null; // 'ol' | 'ul' | null
      const closeList = () => { if (inList) { out.push(`</${inList}>`); inList = null; } };
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) { closeList(); continue; }
        const ol = line.match(/^(\d+)\.\s+(.+)$/);
        const ul = line.match(/^[-*]\s+(.+)$/);
        if (ol) {
          if (inList !== 'ol') { closeList(); out.push('<ol>'); inList = 'ol'; }
          out.push('<li>' + inline(ol[2]) + '</li>');
        } else if (ul) {
          if (inList !== 'ul') { closeList(); out.push('<ul>'); inList = 'ul'; }
          out.push('<li>' + inline(ul[1]) + '</li>');
        } else {
          closeList();
          out.push('<p>' + inline(line) + '</p>');
        }
      }
      closeList();
      return out.join('');
    }

    function WizField({ def, value, onChange, agencyAccessEmail }) {
      const [guideOpen, setGuideOpen] = useState(false);
      const lbl = h`<div class="cp-wiz-lbl">${def.label}${def.required && h`<span class="req">*</span>`}</div>`;
      const help = def.help_text ? h`<div class="cp-wiz-help">${def.help_text}</div>` : null;
      let input;
      switch (def.field_type) {
        case 'long_text':
          input = h`<textarea class="cp-wiz-textarea" placeholder=${def.placeholder || ''} value=${value || ''} onInput=${e => onChange(e.target.value)}></textarea>`;
          break;
        case 'password': {
          // `__SKIP__` sentinel marks a field the client explicitly opted out
          // of ("I don't have this") — non-required password fields only. The
          // wizard's final submit filters these out so no credential row is
          // written, but we keep the marker in form_data so admin can see
          // they were intentionally skipped (not just forgotten).
          const isSkipped = value === '__SKIP__';
          input = h`<div>
            <input class="cp-wiz-input" type="password" placeholder=${isSkipped ? 'Marked as not applicable' : 'Type here'} value=${isSkipped ? '' : (value || '')} disabled=${isSkipped} onInput=${e => onChange(e.target.value)} autoComplete="off" style=${isSkipped ? { background: 'var(--bg2)', color: 'var(--t3)', fontStyle: 'italic' } : null}/>
            ${!def.required && h`<div style=${{ display: 'flex', justifyContent: 'flex-end', marginTop: 5 }}>
              ${isSkipped
                ? h`<button type="button" onClick=${() => onChange('')} style=${{ background: 'transparent', border: 'none', color: 'var(--t2)', fontSize: 11.5, cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit' }}><i class="ti ti-arrow-back-up" style=${{ marginRight: 4 }}></i>Wait, I do have this</button>`
                : h`<button type="button" onClick=${() => onChange('__SKIP__')} style=${{ background: 'transparent', border: 'none', color: 'var(--t3)', fontSize: 11.5, cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>I don't have this account</button>`}
            </div>`}
            ${def.access_guide && !isSkipped && h`<div class=${'cp-wiz-guide' + (guideOpen ? ' open' : '')}>
              <button type="button" class="cp-wiz-guide-tog" onClick=${() => setGuideOpen(o => !o)}>
                <span><i class="ti ti-shield-lock" style=${{ marginRight: 6 }}></i>Prefer not to share a password? Tap for the safer way.</span>
                <i class="ti ti-chevron-down"></i>
              </button>
              <div class="cp-wiz-guide-body" dangerouslySetInnerHTML=${{ __html: renderAccessGuide(def.access_guide, agencyAccessEmail) }}></div>
            </div>`}
          </div>`;
          break;
        }
        case 'drive_link':
          input = h`<input class="cp-wiz-input" type="url" inputMode="url" placeholder=${def.placeholder || 'https://drive.google.com/...'} value=${value || ''} onInput=${e => onChange(e.target.value)}/>`;
          break;
        case 'single_select': {
          const opts = Array.isArray(def.options) ? def.options : [];
          input = h`<div class="cp-wiz-chips">
            ${opts.map(opt => h`<button key=${opt} type="button" class=${'cp-wiz-chip' + (value === opt ? ' on' : '')} onClick=${() => onChange(value === opt ? '' : opt)}>${opt}</button>`)}
          </div>`;
          break;
        }
        case 'multi_select': {
          const opts = Array.isArray(def.options) ? def.options : [];
          const sel = Array.isArray(value) ? value : (value ? String(value).split(',').map(s => s.trim()).filter(Boolean) : []);
          const toggle = (opt) => onChange(sel.includes(opt) ? sel.filter(s => s !== opt) : [...sel, opt]);
          input = h`<div class="cp-wiz-chips">
            ${opts.map(opt => h`<button key=${opt} type="button" class=${'cp-wiz-chip' + (sel.includes(opt) ? ' on' : '')} onClick=${() => toggle(opt)}>${opt}</button>`)}
          </div>`;
          break;
        }
        case 'checkbox':
          input = h`<label class="cp-wiz-check">
            <input type="checkbox" checked=${value === true || value === 'true'} onChange=${e => onChange(e.target.checked)}/>
            <div class="cp-wiz-check-text">${def.label}${def.required && h`<span style=${{ color: 'var(--brand,#ff00ee)', marginLeft: 4 }}>*</span>`}</div>
          </label>`;
          // Checkboxes self-label; suppress the standalone label above.
          return h`<div class="cp-wiz-field">${def.help_text && h`<div class="cp-wiz-help">${def.help_text}</div>`}${input}</div>`;
        case 'color': {
          const hex = (value && /^#[0-9a-fA-F]{6}$/.test(value)) ? value : (def.placeholder || '#ff00ee');
          input = h`<div class="cp-wiz-color">
            <input type="color" value=${hex} onChange=${e => onChange(e.target.value)}/>
            <span class="cp-wiz-color-hex">${hex}</span>
          </div>`;
          break;
        }
        case 'text':
        default:
          input = h`<input class="cp-wiz-input" type="text" placeholder=${def.placeholder || ''} value=${value || ''} onInput=${e => onChange(e.target.value)}/>`;
      }
      return h`<div class="cp-wiz-field">${lbl}${help}${input}</div>`;
    }

    function OnboardingWizard({ user, client, submission, fieldDefs, template, agencyAccessEmail, onCompleted, onSignOut }) {
      // Initial step picks up where the client left off (auto-save sets current_step).
      // Cap at the lowest step that still has content — protects against schema changes.
      const [step, setStep] = useState(() => Math.max(1, Math.min(5, Number(submission.current_step) || 1)));
      // Initial form state from the saved submission. We also restore the
      // "I don't have this" skip sentinel for password fields by detecting
      // any `<field>_skipped: 'true'` marker the per-step save persisted.
      const [form, setForm] = useState(() => {
        const stored = submission.form_data || {};
        const initial = { ...stored };
        Object.keys(stored).forEach(k => {
          if (k.endsWith('_skipped') && stored[k] === 'true') {
            initial[k.replace(/_skipped$/, '')] = '__SKIP__';
          }
        });
        return initial;
      });
      const [saving, setSaving] = useState(false);
      const [savedAt, setSavedAt] = useState(null);
      const [submitting, setSubmitting] = useState(false);
      const [error, setError] = useState('');
      const [doneScreen, setDoneScreen] = useState(false);
      const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSavedAt(null); };

      // Debounced auto-save: ~2.5s after the last keystroke, fire saveStep
      // for the current step. Prevents data loss if the client types a long
      // answer then closes the tab — without this, only the per-step
      // transition fire saved the form.
      // We watch form + step; saveStep is intentionally NOT a dep (it
      // recreates every render and would loop). The latest version is
      // captured by ref-style closure since saveStep reads `form` directly.
      const debounceRef = useRef(null);
      useEffect(() => {
        // Skip the welcome step (no fields) and skip while submitting/saving.
        if (step === 1 || submitting) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          // Fire-and-forget; saveStep handles its own error state.
          saveStep(step);
        }, 2500);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
      }, [form, step, submitting]);

      const disabledKeys = useMemo(() => {
        const d = submission?.template_overrides?.disabled;
        return new Set(Array.isArray(d) ? d : []);
      }, [submission]);

      const fieldsByStep = useMemo(() => {
        const out = { 1: [], 2: [], 3: [], 4: [], 5: [] };
        (fieldDefs || []).forEach(f => {
          if (disabledKeys.has(f.key)) return;
          if (out[f.step]) out[f.step].push(f);
        });
        // Already ordered by step,sort_order from the query
        return out;
      }, [fieldDefs, disabledKeys]);

      const currentFields = fieldsByStep[step] || [];

      // Save the current step's fields. Best-effort — wraps in try so a
      // network blip mid-typing doesn't strand the user. On success, sets
      // savedAt so the foot shows "Saved ✓".
      const saveStep = async (stepNo) => {
        const patch = {};
        (fieldsByStep[stepNo] || []).forEach(f => {
          // Don't ship password values here — they go through submit_onboarding's
          // encrypted path. But DO persist the "I don't have this" skip marker
          // so it survives refresh — without this, the opt-out state resets.
          if (f.field_type === 'password') {
            if (form[f.key] === '__SKIP__') patch[f.key + '_skipped'] = 'true';
            return;
          }
          if (form[f.key] !== undefined && form[f.key] !== null && form[f.key] !== '') {
            patch[f.key] = Array.isArray(form[f.key]) ? form[f.key].join(',') : form[f.key];
          }
        });
        if (Object.keys(patch).length === 0) return; // nothing to save
        setSaving(true);
        try {
          await rpcCall('save_onboarding_step', {
            p_submission_id: submission.id,
            p_step: stepNo,
            p_form_patch: patch,
            p_ip: null,
            p_user_agent: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 200),
          });
          setSavedAt(Date.now());
        } catch (e) {
          console.warn('[wizard] save failed', e);
          // Non-fatal — UI lets user keep going.
        } finally {
          setSaving(false);
        }
      };

      const validateStep = (stepNo) => {
        for (const f of fieldsByStep[stepNo] || []) {
          if (!f.required) continue;
          const v = form[f.key];
          if (f.field_type === 'multi_select') {
            const sel = Array.isArray(v) ? v : (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);
            if (sel.length === 0) return `Please answer: ${f.label}`;
          } else if (f.field_type === 'checkbox') {
            if (v !== true && v !== 'true') return `Please tick: ${f.label}`;
          } else if (!v || (typeof v === 'string' && !v.trim())) {
            return `Please answer: ${f.label}`;
          }
        }
        return null;
      };

      const goNext = async () => {
        const err = validateStep(step);
        if (err) { setError(err); return; }
        setError('');
        await saveStep(step);
        if (step < 5) { setStep(s => s + 1); window.scrollTo({ top: 0 }); }
      };

      const goBack = () => { setError(''); if (step > 1) setStep(s => s - 1); window.scrollTo({ top: 0 }); };

      // Final submit: split into form_data (non-password) + credentials (password).
      // Server encrypts credentials, patches whitelisted client columns, and
      // transitions clients.onboarding_status to 'form_filled'.
      const finalSubmit = async () => {
        const err = validateStep(5);
        if (err) { setError(err); return; }
        setError('');
        // Build form_data (everything non-password, all steps).
        const formData = {};
        const credentials = [];
        (fieldDefs || []).forEach(f => {
          if (disabledKeys.has(f.key)) return;
          const v = form[f.key];
          if (f.field_type === 'password') {
            // Skip empty AND skip the explicit "I don't have this" sentinel.
            // Skipped fields still get tracked in form_data below so admin
            // sees they were intentionally opted out, not forgotten.
            if (v && String(v).trim() && v !== '__SKIP__') {
              credentials.push({
                field_key: f.key,
                label: f.label,
                value: String(v),
                access_guide: renderAccessGuide(f.access_guide || '', agencyAccessEmail),
              });
            } else if (v === '__SKIP__') {
              formData[f.key + '_skipped'] = 'true';
            }
            return;
          }
          if (v === undefined || v === null || v === '') return;
          formData[f.key] = Array.isArray(v) ? v.join(',') : (v === true ? 'true' : v);
        });
        // Consent fields surface under a separate jsonb on the server.
        const consent = {};
        (fieldsByStep[5] || []).forEach(f => {
          if (f.field_type === 'checkbox') consent[f.key] = form[f.key] === true || form[f.key] === 'true';
        });

        setSubmitting(true);
        try {
          await rpcCall('submit_onboarding', {
            p_submission_id: submission.id,
            p_form_data: formData,
            p_credentials: credentials,
            p_consent: consent,
            p_ip: null,
            p_user_agent: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 200),
          });
          // Notify the assigned team lead + admins/managers.
          try {
            const teamLead = submission.team_lead;
            const title = `🎉 ${client.name} finished onboarding`;
            const msg = `${client.name} just submitted the onboarding form. Their info is in Settings → Client.`;
            if (teamLead) insertNotif(teamLead, title, msg, 'approval', client.name, null, 'client', client.id);
            insertNotif('role:admin,manager', title, msg, 'approval', client.name, null, 'client', client.id);
          } catch (_) { /* non-fatal */ }
          // Fire the gracious "we've got your details" email to the client.
          // Non-fatal — wizard still completes if the function isn't deployed
          // yet (the team still gets their internal notif above).
          try {
            const token = (typeof localStorage !== 'undefined' && localStorage.getItem('ams_session_token')) || '';
            await supabase.functions.invoke('send-onboarding-submitted', {
              body: { submission_id: submission.id, session_token: token },
            });
          } catch (e) { console.warn('[wizard] confirmation email skipped', e?.message || e); }
          setDoneScreen(true);
          // Bubble up so the parent re-fetches the client (status now 'form_filled')
          setTimeout(() => { if (onCompleted) onCompleted(); }, 1200);
        } catch (e) {
          console.error('[wizard] submit failed', e);
          const msg = String(e?.message || e || '');
          if (msg.includes('vault.no_key')) setError('Onboarding is temporarily unavailable — please ask your account contact to enable the credential vault.');
          else setError('Could not submit. Please check your connection and try again.');
        } finally {
          setSubmitting(false);
        }
      };

      const brand = brandColor(client);
      const mark = initials(client?.name);

      // Step 1 is the welcome step — body is templated, not field-driven.
      // Anything else is field-driven.
      const stepNames = ['Welcome', 'Your brand', 'Business details', 'Account access', 'Preferences'];
      const stepLeads = [
        '',
        "We'll use this to make sure every post sounds like you, not a stock brand.",
        "Standard housekeeping — billing email, GSTIN, address. Goes nowhere except your invoices.",
        "Encrypted at rest the moment you tap Continue. Only your account lead can reveal these later, and we always prefer the share-access flow over passwords.",
        "Last few questions. Then you're done.",
      ];

      // Resolved engagement details for the welcome step
      const startStr = submission.start_date
        ? new Date(submission.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'TBD';

      const progress = doneScreen ? 100 : Math.round(((step - 1) / 5) * 100);

      return h`<div class="cp-wiz">
        <div class="cp-wiz-head">
          <div class="cp-wiz-head-l">
            <div class="cp-wiz-mark" style=${{ background: brand }}>${mark}</div>
            <div style=${{ minWidth: 0 }}>
              <div class="cp-wiz-head-name">${client?.name || 'Your brand'}</div>
              <div class="cp-wiz-head-sub">Onboarding</div>
            </div>
          </div>
          <button class="cp-wiz-signout" onClick=${onSignOut}>Sign out</button>
        </div>

        ${!doneScreen && h`<div class="cp-wiz-progress">
          <div class="cp-wiz-progress-lbl">
            <span><span class="cp-wiz-progress-step">Step ${step} of 5</span> · ${stepNames[step - 1]}</span>
            <span>${progress}%</span>
          </div>
          <div class="cp-wiz-progress-bar"><div class="cp-wiz-progress-fill" style=${{ width: progress + '%' }}></div></div>
        </div>`}

        <div class="cp-wiz-body">
          ${doneScreen ? h`<div class="cp-wiz-complete">
            <div class="cp-wiz-complete-mark"><i class="ti ti-circle-check-filled"></i></div>
            <div class="cp-wiz-complete-h">Thank you — we have what we need.</div>
            <div class="cp-wiz-complete-body">Your account lead, ${submission.team_lead || 'the team'}, just got a heads-up. We'll have your contract over within 24 hours, then your portal will unlock for posts and approvals.</div>
          </div>` : (step === 1 ? h`<div class="cp-wiz-welcome">
            <div class="cp-wiz-welcome-mark" style=${{ background: brand }}>${mark}</div>
            <div class="cp-wiz-welcome-h">A real privilege to be working with <em>${client?.name || 'you'}</em>.</div>
            ${template?.welcome_body && h`<div class="cp-wiz-welcome-body">${template.welcome_body}</div>`}
            <div class="cp-wiz-welcome-meta">
              <div class="cp-wiz-welcome-meta-row"><span>Your account lead</span><strong>${submission.team_lead || 'TBD'}</strong></div>
              <div class="cp-wiz-welcome-meta-row"><span>Start date</span><strong>${startStr}</strong></div>
              <div class="cp-wiz-welcome-meta-row"><span>Estimated time</span><strong>~10–12 minutes</strong></div>
              <div class="cp-wiz-welcome-meta-row"><span>Auto-saved</span><strong>Yes, every step</strong></div>
            </div>
            ${currentFields.map(f => h`<${WizField} key=${f.key} def=${f} value=${form[f.key]} onChange=${(v) => set(f.key, v)} agencyAccessEmail=${agencyAccessEmail}/>`)}
          </div>` : h`<div>
            <div class="cp-wiz-stepname">${stepNames[step - 1]}</div>
            ${stepLeads[step - 1] && h`<div class="cp-wiz-steplead">${stepLeads[step - 1]}</div>`}
            ${error && h`<div class="cp-wiz-error"><i class="ti ti-alert-circle"></i>${error}</div>`}
            ${currentFields.map(f => h`<${WizField} key=${f.key} def=${f} value=${form[f.key]} onChange=${(v) => set(f.key, v)} agencyAccessEmail=${agencyAccessEmail}/>`)}
            ${currentFields.length === 0 && h`<div class="cp-empty"><i class="ti ti-confetti"></i>No questions on this step. Just tap Continue.</div>`}
          </div>`)}
        </div>

        ${!doneScreen && h`<div class="cp-wiz-foot">
          ${step > 1 ? h`<button class="cp-wiz-btn cp-wiz-btn-sec" onClick=${goBack} disabled=${submitting || saving}><i class="ti ti-arrow-left"></i></button>` : h`<div class="cp-wiz-foot-l">${saving ? 'Saving…' : (savedAt ? h`<span class="cp-wiz-saved"><i class="ti ti-check"></i>Saved</span>` : 'Your answers are auto-saved.')}</div>`}
          ${step < 5
            ? h`<button class="cp-wiz-btn cp-wiz-btn-pri" onClick=${goNext} disabled=${saving || submitting}>${saving ? 'Saving…' : 'Continue'} <i class="ti ti-arrow-right"></i></button>`
            : h`<button class="cp-wiz-btn cp-wiz-btn-pri" onClick=${finalSubmit} disabled=${submitting}>${submitting ? h`<i class="ti ti-loader-2 spinner"></i> Submitting…` : h`<span>Submit <i class="ti ti-circle-check"></i></span>`}</button>`}
        </div>`}
      </div>`;
    }

    // Read-only waiting screen between form submit and contract sign.
    // Status is one of: 'form_filled' | 'contract_sent' | 'contract_signed'.
    function OnboardingWaiting({ client, status, onSignOut }) {
      // Load the most recent contract row so we can surface the signing link,
      // the sent/signed timestamps, and the signed-PDF download directly in
      // the waiting screen. Without this, clients whose Documenso email got
      // caught by a spam filter have no path forward — they'd email admin
      // who'd have to manually re-send.
      const [contract, setContract] = useState(null);
      const [loaded, setLoaded] = useState(false);
      useEffect(() => {
        if (!client?.id) return;
        db('contracts', `&client_id=eq.${client.id}&order=created_at.desc&limit=1`)
          .then(rows => setContract(rows?.[0] || null))
          .catch(() => {})
          .finally(() => setLoaded(true));
      }, [client?.id]);

      const brand = brandColor(client);
      const mark = initials(client?.name);
      const sentStr = contract?.sent_at
        ? new Date(contract.sent_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : null;
      const signedStr = contract?.signed_at
        ? new Date(contract.signed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : null;

      // Stage-specific headline + body. contract_sent gets an actionable
      // signing button if we have the URL; form_filled is more of a "stand by"
      // while admin prepares; contract_signed is a brief celebratory moment.
      let h_text, body, mark_icon;
      if (status === 'form_filled') {
        h_text = 'Almost there.';
        body = 'Thanks for the details. Your account lead is preparing your contract right now — it should land in your inbox within 24 hours. Once you sign, this portal unlocks for posts, approvals and invoices.';
        mark_icon = 'ti-clock-hour-9';
      } else if (status === 'contract_sent') {
        h_text = contract?.signing_url ? 'Your contract is ready to sign.' : 'Contract on its way.';
        body = contract?.signing_url
          ? `We sent a signing email${sentStr ? ' on ' + sentStr : ''}. If it hasn't arrived (check spam), you can sign right here using the button below — same document, same signature.`
          : 'Check the email we just sent for an e-sign link. Sign from anywhere — phone works too.';
        mark_icon = 'ti-file-signature';
      } else {
        h_text = "You're in.";
        body = `Contract signed${signedStr ? ' on ' + signedStr : ''} and on file. We're prepping your first content calendar — your portal will unlock here shortly.`;
        mark_icon = 'ti-circle-check-filled';
      }

      const openSigning = () => {
        if (contract?.signing_url) window.open(contract.signing_url, '_blank', 'noopener');
      };

      return h`<div class="cp-wiz">
        <div class="cp-wiz-head">
          <div class="cp-wiz-head-l">
            <div class="cp-wiz-mark" style=${{ background: brand }}>${mark}</div>
            <div style=${{ minWidth: 0 }}>
              <div class="cp-wiz-head-name">${client?.name || 'Your brand'}</div>
              <div class="cp-wiz-head-sub">Onboarding</div>
            </div>
          </div>
          <button class="cp-wiz-signout" onClick=${onSignOut}>Sign out</button>
        </div>
        <div class="cp-wiz-body">
          <div class="cp-wiz-complete">
            <div class="cp-wiz-complete-mark"><i class=${'ti ' + mark_icon}></i></div>
            <div class="cp-wiz-complete-h">${h_text}</div>
            <div class="cp-wiz-complete-body">${body}</div>

            ${status === 'contract_sent' && contract?.signing_url && h`<div style=${{ marginTop: 24 }}>
              <button class="cp-wiz-btn cp-wiz-btn-pri" style=${{ minWidth: 220, justifyContent: 'center' }} onClick=${openSigning}>
                <i class="ti ti-signature"></i> Sign contract now
              </button>
              <div style=${{ marginTop: 14, fontSize: 11.5, color: 'var(--t3)', fontFamily: 'inherit' }}>
                Opens our e-signing partner Documenso in a new tab. Takes ~60 seconds.
              </div>
            </div>`}

            ${status === 'contract_signed' && contract?.pdf_url && h`<div style=${{ marginTop: 24 }}>
              <a href=${contract.pdf_url} target="_blank" rel="noopener" style=${{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', border: '1px solid var(--bd2)', borderRadius: 10, color: 'var(--t1)', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
                <i class="ti ti-download"></i> Download your signed contract
              </a>
            </div>`}

            <div style=${{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--bd)', fontFamily: 'Newsreader,Georgia,serif', fontStyle: 'italic', fontSize: 13, color: 'var(--t3)', maxWidth: 320, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
              Stuck or unsure? Reply to any email we've sent you — we usually answer within a few hours, Mon–Sat.
            </div>
          </div>
        </div>
      </div>`;
    }

    function ordinalDay(n) {
      const d = Number(n);
      if (!Number.isFinite(d)) return '';
      const j = d % 10, k = d % 100;
      if (j === 1 && k !== 11) return d + 'st';
      if (j === 2 && k !== 12) return d + 'nd';
      if (j === 3 && k !== 13) return d + 'rd';
      return d + 'th';
    }

    // Editable row — collapses into an input + Save/Cancel when activated.
    // Stays read-only otherwise, with a pencil icon on the right that flips it
    // into edit mode. Calls onSave(value) → expects the parent to return the
    // updated client (or throw) so we can stop spinning + drop edit mode.
    function AcctEditableRow({ icon, label, fieldKey, value, placeholder, type, help, onSave, formatDisplay }) {
      const [editing, setEditing] = useState(false);
      const [draft, setDraft] = useState(value || '');
      const [saving, setSaving] = useState(false);
      const [err, setErr] = useState('');
      const inputRef = useRef(null);
      useEffect(() => { if (!editing) setDraft(value || ''); }, [value, editing]);
      useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);
      const begin = () => { setEditing(true); setDraft(value || ''); setErr(''); };
      const cancel = () => { setEditing(false); setDraft(value || ''); setErr(''); };
      const submit = async () => {
        const v = draft.trim();
        if (v === (value || '').trim()) { setEditing(false); return; }
        setSaving(true); setErr('');
        try {
          await onSave(v);
          setEditing(false);
        } catch (e) {
          console.warn('[acct] save failed', e);
          setErr(e?.message?.replace(/^.*?:\s*/, '') || 'Could not save. Try again.');
        } finally { setSaving(false); }
      };
      if (editing) {
        return h`<div class="cp-acct-row cp-acct-edit">
          <span class="lbl"><i class=${'ti ' + icon}></i>${label}</span>
          <input ref=${inputRef} type=${type || 'text'} value=${draft} placeholder=${placeholder || ''}
            onInput=${e => setDraft(e.target.value)}
            onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Escape') { cancel(); } }}/>
          ${err && h`<div style=${{ fontSize: 11.5, color: '#DC2626' }}>${err}</div>`}
          ${help && h`<div class="cp-acct-help">${help}</div>`}
          <div class="acts">
            <button onClick=${cancel} disabled=${saving}>Cancel</button>
            <button class="save" onClick=${submit} disabled=${saving}>${saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>`;
      }
      const display = (formatDisplay ? formatDisplay(value) : value) || h`<span style=${{ color: 'var(--t3)', fontStyle: 'italic' }}>Not set</span>`;
      return h`<div class="cp-acct-row">
        <span class="lbl"><i class=${'ti ' + icon}></i>${label}</span>
        <span class="val">${display}</span>
        <button class="edit-btn" aria-label=${'Edit ' + label.toLowerCase()} onClick=${begin}><i class="ti ti-pencil"></i></button>
      </div>`;
    }

    function NotifPrefsRow({ user, pushPermission }) {
      const [prefs, setPrefs] = useState({ approvals: true, payments: true, general: true });
      const [saving, setSaving] = useState(null); // key currently saving
      const [loaded, setLoaded] = useState(false);
      // Load the current sub's preferences once. Multi-device case: any row
      // matching this user.name shares the same prefs (we PATCH all rows on
      // change). If they differ, we display the most-recent row's values.
      useEffect(() => {
        if (!user?.name || pushPermission !== 'granted') return;
        let alive = true;
        db('push_subscriptions', `&user_name=eq.${encodeURIComponent(user.name)}&select=preferences,last_used_at&order=last_used_at.desc.nullslast&limit=1`)
          .then(rows => {
            if (!alive) return;
            const p = rows?.[0]?.preferences || {};
            setPrefs({
              approvals: p.approvals !== false,
              payments:  p.payments  !== false,
              general:   p.general   !== false,
            });
            setLoaded(true);
          })
          .catch(() => { if (alive) setLoaded(true); });
        return () => { alive = false; };
      }, [user?.name, pushPermission]);
      const toggle = async (key) => {
        if (saving) return;
        const next = { ...prefs, [key]: !prefs[key] };
        setPrefs(next);
        setSaving(key);
        try {
          // PATCH every device row this brand owns so the change propagates.
          // Multi-row update via the supabase-js client (the existing dbPatch
          // helper requires an id).
          const { error } = await supabase
            .from('push_subscriptions')
            .update({ preferences: next })
            .eq('user_name', user.name);
          if (error) throw error;
        } catch (e) {
          console.warn('[prefs] save failed', e);
          // Revert on failure.
          setPrefs(prefs);
        } finally { setSaving(null); }
      };
      if (pushPermission !== 'granted' || !loaded) return null;
      const ROWS = [
        { key: 'approvals', label: 'Posts to approve',  hint: 'New posts waiting for your eye' },
        { key: 'payments',  label: 'Invoices & receipts', hint: 'Issued, paid, reminders' },
        { key: 'general',   label: 'Comments & updates',  hint: 'Team replies and status changes' },
      ];
      return h`<div class="cp-prefs">
        <div class="cp-prefs-h">What you get pinged about</div>
        ${ROWS.map(r => h`<label key=${r.key} class="cp-prefs-row">
          <div class="cp-prefs-mid">
            <span class="cp-prefs-lbl">${r.label}</span>
            <span class="cp-prefs-hint">${r.hint}</span>
          </div>
          <span class=${'cp-switch' + (prefs[r.key] ? ' on' : '') + (saving === r.key ? ' busy' : '')}>
            <input type="checkbox" checked=${prefs[r.key]} disabled=${!!saving} onChange=${() => toggle(r.key)}/>
            <span class="cp-switch-track"><span class="cp-switch-knob"></span></span>
          </span>
        </label>`)}
      </div>`;
    }

    // Lists every portal member of this brand. Read-only — admin manages
    // invites from the dashboard. Helps a brand see "who else from my team
    // can see this portal" at a glance. Primary contact gets a chip.
    function BrandTeamBlock({ client, user }) {
      const [members, setMembers] = useState([]);
      const [loaded, setLoaded] = useState(false);
      useEffect(() => {
        if (!client?.id) return;
        let alive = true;
        db('team_members', `&client_id=eq.${client.id}&role_level=eq.client&deleted_at=is.null&order=is_primary_for_brand.desc.nullslast,created_at.asc`)
          .then(rows => { if (alive) { setMembers(rows || []); setLoaded(true); } })
          .catch(() => { if (alive) setLoaded(true); });
        return () => { alive = false; };
      }, [client?.id]);
      // Hide entirely if there's only one member (this user). The "you're solo"
      // case doesn't need a team block — surfacing it would just be filler.
      if (!loaded || members.length <= 1) return null;
      const palette = ['#1F3A93', '#722B85', '#0E7490', '#B45309', '#15803D', '#6D28D9'];
      const colorFor = (s) => {
        const t = (s || '?').toString();
        let hash = 0;
        for (let i = 0; i < t.length; i++) hash = (hash * 31 + t.charCodeAt(i)) | 0;
        return palette[Math.abs(hash) % palette.length];
      };
      return h`<div class="cp-brand-team">
        <div class="cp-prefs-h">Your brand team · ${members.length}</div>
        ${members.map(m => {
          const name = m.client_member_name || '(no name on file)';
          const isMe = user && m.id === user.id;
          return h`<div key=${m.id} class="cp-brand-team-row">
            <div class="cp-brand-team-av" style=${{ background: colorFor(m.email || name) }}>${initials(name)}</div>
            <div class="cp-brand-team-mid">
              <div class="cp-brand-team-name">${name}${isMe && h`<span class="cp-brand-team-you">You</span>`}</div>
              <div class="cp-brand-team-sub">${m.client_designation || (m.is_primary_for_brand ? 'Primary contact' : 'Brand member')}</div>
            </div>
            ${m.is_primary_for_brand && h`<span class="cp-brand-team-pri" title="Invoices and reports go here">Primary</span>`}
          </div>`;
        })}
        <div class="cp-brand-team-foot">
          Need to add a teammate? Message your account manager — they'll send an invite from their end.
        </div>
      </div>`;
    }

    function AccountTab({ user, client, onSignOut, installEvent, isIos, isStandalone, onInstall, pushPermission, onEnablePush, agencyConfig, onClientUpdated, onOpenPasswordChange }) {
      // Build a wa.me URL from the agency phone (strip non-digits, prepend 91
      // if it's a bare 10-digit Indian mobile). Falls back to mailto if no
      // number is on file in agency_settings.
      const phoneDigits = (agencyConfig?.contact_phone || '').toString().replace(/[^0-9]/g, '');
      const phoneNumber = phoneDigits.length === 10 ? '91' + phoneDigits : phoneDigits;
      const waHref = phoneNumber ? 'https://wa.me/' + phoneNumber : null;
      const emailHref = agencyConfig?.contact_email ? 'mailto:' + agencyConfig.contact_email : null;
      const teamLead = client?.onboarding_team_lead || null;
      // Save handler — shared by every editable row. Sends only the changed key
      // through the whitelisted RPC and propagates the returned client row up.
      const saveField = async (key, value) => {
        const fresh = await rpcCall('client_update_self', { p_patch: { [key]: value } });
        if (fresh && onClientUpdated) onClientUpdated(fresh);
      };
      const personalName = user?.client_member_name || '';
      const personalDesignation = user?.client_designation || '';
      return h`<div class="cp-acct">
        <div class="cp-acct-head">
          <div class="cp-acct-mark" style=${{ background: brandColor(client) }}>${initials(client?.name || user?.name)}</div>
          <div>
            <div class="cp-acct-name">${client?.name || user?.name || 'Your brand'}</div>
            <div class="cp-acct-email">${user?.email || ''}</div>
            ${personalName && h`<div style=${{ fontFamily: '"Newsreader",Georgia,serif', fontStyle: 'italic', fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>Signed in as ${personalName}${personalDesignation ? ' · ' + personalDesignation : ''}</div>`}
          </div>
        </div>
        <${BrandTeamBlock} client=${client} user=${user}/>
        <${InstallCard} installEvent=${installEvent} isIos=${isIos} isStandalone=${isStandalone} onInstall=${onInstall}/>

        ${(teamLead || waHref || emailHref) && h`<div class="cp-team">
          <div class="cp-team-h">Your team</div>
          ${teamLead && h`<div class="cp-team-card">
            <div class="cp-team-av" style=${{ background: 'var(--brand,#ff00ee)' }}>${initials(teamLead)}</div>
            <div class="cp-team-body">
              <div class="cp-team-name">${teamLead}</div>
              <div class="cp-team-role">Account lead</div>
            </div>
          </div>`}
          <div class="cp-team-contact">
            ${waHref && h`<a class="cp-team-btn wa" href=${waHref} target="_blank" rel="noopener"><i class="ti ti-brand-whatsapp"></i>WhatsApp</a>`}
            ${emailHref && h`<a class="cp-team-btn em" href=${emailHref}><i class="ti ti-mail"></i>Email</a>`}
          </div>
        </div>`}
        ${pushPermission === 'default' && h`<div class="cp-banner" style=${{ marginBottom: 12 }}>
          <div class="ic"><i class="ti ti-bell-ringing"></i></div>
          <div class="cp-banner-body">
            <div class="cp-banner-t">Phone notifications are off</div>
            <div class="cp-banner-s">Enable them to get a ping when a new post needs your eye.</div>
            <div class="cp-banner-acts">
              <button class="cp-banner-btn" onClick=${onEnablePush}>Enable notifications</button>
            </div>
          </div>
        </div>`}
        ${pushPermission === 'granted' && h`<div class="cp-acct-row" style=${{ background: 'rgba(34,197,94,.06)', borderColor: 'rgba(34,197,94,.25)' }}>
          <span class="lbl"><i class="ti ti-bell-check" style=${{ color: '#15803D' }}></i>Notifications on</span>
          <span class="val" style=${{ color: '#15803D' }}>Enabled</span>
        </div>
        <${NotifPrefsRow} user=${user} pushPermission=${pushPermission}/>`}
        ${pushPermission === 'denied' && h`<div class="cp-acct-row" style=${{ background: 'rgba(220,38,38,.06)', borderColor: 'rgba(220,38,38,.25)' }}>
          <span class="lbl"><i class="ti ti-bell-off" style=${{ color: '#DC2626' }}></i>Notifications blocked</span>
          <span class="val" style=${{ color: '#DC2626', fontSize: 11 }}>Turn on in browser settings</span>
        </div>`}
        <div class="cp-acct-row">
          <span class="lbl"><i class="ti ti-building"></i>Brand</span>
          <span class="val">${client?.name || '—'}</span>
        </div>
        <${AcctEditableRow} icon="ti-user" label="Contact name" fieldKey="contact_name"
          value=${client?.contact_name || ''}
          placeholder="e.g. Priya Sharma"
          onSave=${(v) => saveField('contact_name', v)}/>
        <${AcctEditableRow} icon="ti-mail" label="Email" fieldKey="contact_email"
          value=${client?.contact_email || ''}
          type="email"
          placeholder="you@brand.com"
          help="Invoices and reports go here."
          onSave=${(v) => saveField('contact_email', v)}/>
        <${AcctEditableRow} icon="ti-phone" label="Phone" fieldKey="contact_phone"
          value=${client?.contact_phone || ''}
          type="tel"
          placeholder="+91 98765 43210"
          onSave=${(v) => saveField('contact_phone', v)}/>
        <${AcctEditableRow} icon="ti-brand-instagram" label="Instagram" fieldKey="instagram_handle"
          value=${client?.instagram_handle || ''}
          placeholder="@yourbrand"
          formatDisplay=${(v) => v ? ('@' + (v + '').replace(/^@/, '')) : null}
          onSave=${(v) => saveField('instagram_handle', v)}/>
        <div class="cp-acct-row" style=${{ cursor: onOpenPasswordChange ? 'pointer' : 'default' }} onClick=${onOpenPasswordChange}>
          <span class="lbl"><i class="ti ti-lock"></i>Password</span>
          <span class="val" style=${{ color: 'var(--brand,#ff00ee)', fontWeight: 500 }}>${onOpenPasswordChange ? 'Change →' : '••••••••'}</span>
        </div>
        <div class="cp-acct-row">
          <span class="lbl"><i class="ti ti-shield-check"></i>Agency</span>
          <span class="val">${agencyConfig?.app_name || agencyConfig?.trade_name || agencyConfig?.legal_name || '—'}</span>
        </div>
        <div style=${{ fontSize: 11.5, color: 'var(--t3)', marginTop: 18, lineHeight: 1.55 }}>
          Changes here update your records with us. For anything we don't show — billing address, brand assets, scope — message your team.
        </div>
        <button class="cp-signout" onClick=${onSignOut}><i class="ti ti-logout" style=${{ marginRight: 6 }}></i>Sign out</button>
      </div>`;
    }

    function NotifSheet({ user, client, onClose, onNavigate, lastSeenId, onMarkSeen }) {
      useSheetBack(onClose);
      const [notifs, setNotifs] = useState([]);
      const [loading, setLoading] = useState(true);
      const [viaRpc, setViaRpc] = useState(false); // 075 RPC rows carry a per-recipient `read` flag

      // The portal user's `name` on team_members equals the brand name, so
      // anything addressed `recipient = client.name` lands here. We also pick
      // up 'all' broadcasts. Cap at 50 to keep the sheet light.
      // Post-075 the table is RPC-only: notif_list_for_self filters server-side
      // and returns a per-recipient read receipt; legacy db() path kept as
      // fallback for pre-075 DBs.
      useEffect(() => {
        if (!user?.name) return;
        let alive = true;
        const name = user.name;
        const enc = encodeURIComponent(name);
        // notification ids are uuids (not ordered) — feed the bell's seen-state
        // a created_at epoch instead so the numeric compare upstream works.
        const markSeen = (rows) => { if (rows && rows[0]) onMarkSeen(Date.parse(rows[0].created_at) || rows[0].id); };
        const fetchNotifs = async () => {
          try {
            const res = await rpcCall('notif_list_for_self', { p_limit: 50, p_unread_only: false }, { silentAuth: true });
            const rows = Array.isArray(res) ? res : (res?.rows || []);
            if (!alive) return;
            setViaRpc(true);
            setNotifs(rows);
            setLoading(false);
            markSeen(rows);
            // Persist read-state server-side (per-recipient receipts) so it
            // survives across devices — best-effort, opening the sheet = read.
            const unreadIds = rows.filter(n => n.read === false).map(n => n.id);
            if (unreadIds.length) rpcCall('notif_mark_read_for_self', { p_ids: unreadIds }, { silentAuth: true }).catch(() => {});
            return;
          } catch (_) { /* pre-075 DB — fall back to the direct table read */ }
          db('notifications', `&or=(recipient.eq.${enc},recipient.eq.all)&order=created_at.desc&limit=50&deleted_at=is.null`)
            .then(rows => {
              if (!alive) return;
              setNotifs(rows || []);
              setLoading(false);
              // Mark the top notif as seen so the bell dot clears next time.
              markSeen(rows);
            })
            .catch(() => { if (alive) setLoading(false); });
        };
        fetchNotifs();
        // No realtime here: postgres_changes on `notifications` is permanently
        // quiet post-075 (anon SELECT revoked + FORCE RLS) — the poll is the
        // delivery path while the sheet is open.
        const poll = setInterval(fetchNotifs, 60000);
        return () => { alive = false; clearInterval(poll); };
      }, [user?.name, client?.id]);

      const typeFor = (t) => ({
        approval: 'approval', revision: 'revision', alert: 'alert',
        status: 'status', success: 'approval', warning: 'alert',
      })[t] || 'info';
      const iconFor = (t) => ({
        approval: 'ti-circle-check', revision: 'ti-message-circle',
        alert: 'ti-alert-triangle', status: 'ti-progress',
        success: 'ti-circle-check', warning: 'ti-alert-triangle',
      })[t] || 'ti-bell';

      const handleRow = (n) => {
        // Route based on link_type so tapping an approval notif jumps to the
        // post, an invoice notif jumps to that invoice, etc.
        if (n.link_type === 'content' && n.link_id) {
          onNavigate({ tab: 'home', postId: Number(n.link_id) });
        } else if (n.link_type === 'invoice' && n.link_id) {
          onNavigate({ tab: 'payments', invoiceId: n.link_id });
        } else {
          onNavigate({ tab: 'home' });
        }
        onClose();
      };

      return h`<div class="cp-notif-sheet" onClick=${onClose}>
        <div class="cp-notif-panel" onClick=${(e) => e.stopPropagation()}>
          <div class="cp-help-grip"></div>
          <div class="cp-notif-head">
            <div>
              <div class="cp-help-h">Notifications</div>
              <div class="cp-help-sub">${notifs.length ? `${notifs.length} recent` : 'Everything sent to your brand'}</div>
            </div>
            <button class="cp-bell" aria-label="Close" onClick=${onClose}><i class="ti ti-x" style=${{ fontSize: 18 }}></i></button>
          </div>
          <div class="cp-notif-body">
            ${loading
              ? h`<div class="cp-loading" style=${{ height: 'auto', padding: '32px 16px' }}><i class="ti ti-loader-2 spinner"></i>Loading…</div>`
              : notifs.length === 0
                ? h`<div class="cp-notif-empty">
                    <i class="ti ti-bell-off"></i>
                    <p>Nothing here yet. New posts, payment reminders and team replies will show up here.</p>
                  </div>`
                : notifs.map(n => {
                    // RPC rows carry a real per-recipient read flag; the legacy path
                    // compares created_at epochs (ids are uuids — Number(id) is NaN).
                    const unread = viaRpc ? (n.read === false) : (lastSeenId == null || ((Date.parse(n.created_at) || 0) > Number(lastSeenId)));
                    const kind = typeFor(n.type);
                    return h`<div key=${n.id} class=${'cp-notif-row' + (unread ? ' unread' : '')} onClick=${() => handleRow(n)}>
                      <div class=${'cp-notif-ic ' + kind}><i class=${'ti ' + iconFor(n.type)}></i></div>
                      <div class="cp-notif-mid">
                        <div class="cp-notif-title">${n.title || 'Notification'}</div>
                        ${n.message && h`<div class="cp-notif-msg">${n.message}</div>`}
                        <div class="cp-notif-time">${timeAgo(n.created_at)}</div>
                      </div>
                      ${unread && h`<div class="cp-notif-dot"></div>`}
                    </div>`;
                  })}
          </div>
        </div>
      </div>`;
    }

    function PasswordChangeSheet({ user, onClose, showToast }) {
      useSheetBack(onClose);
      const [oldPwd, setOldPwd] = useState('');
      const [newPwd, setNewPwd] = useState('');
      const [confirm, setConfirm] = useState('');
      const [saving, setSaving] = useState(false);
      const [err, setErr] = useState('');
      const [show, setShow] = useState(false);

      const canSubmit = oldPwd && newPwd.length >= 8 && newPwd === confirm && !saving;

      const submit = async () => {
        setErr('');
        if (newPwd.length < 8) { setErr('New password must be at least 8 characters.'); return; }
        if (newPwd !== confirm) { setErr("New passwords don't match."); return; }
        if (oldPwd === newPwd) { setErr('New password must be different from your current one.'); return; }
        if (!hashPwd || !hashPwdPbkdf2) {
          setErr('Password helpers missing. Refresh the app and try again.');
          return;
        }
        setSaving(true);
        try {
          // Fetch the salt + algo for this account (password column itself is
          // not anon-readable per migration 008, but salt/algo are).
          const rows = await db('team_members', `&email=eq.${encodeURIComponent((user?.email || '').toLowerCase())}&select=password_algo,password_salt&limit=1`);
          const row = rows?.[0];
          if (!row) { setErr('Account not found. Sign out and back in.'); setSaving(false); return; }
          // Old hash → same algo+salt the row has on file.
          let oldHash;
          if (row.password_algo === 'pbkdf2' && row.password_salt) {
            oldHash = await hashPwdPbkdf2(oldPwd, row.password_salt);
          } else {
            // Legacy SHA-256 (unsalted) — supported by check but rare on portal accounts.
            const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(oldPwd));
            oldHash = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
          }
          // New hash → fresh salt, modern algo.
          const fresh = await hashPwd(newPwd);
          await rpcCall('client_change_password', {
            p_old_hash: oldHash,
            p_new_hash: fresh.hash,
            p_new_salt: fresh.salt,
            p_new_algo: fresh.algo,
          });
          showToast('Password updated ✓');
          onClose();
        } catch (e) {
          const msg = (e?.message || '').toString();
          if (msg.includes('auth.wrong_password')) setErr('Current password is incorrect.');
          else if (msg.includes('auth.first_login_pending')) setErr('First-login pending. Sign out and try again.');
          else if (msg.includes('weak_args')) setErr('That password is too weak.');
          else setErr('Could not save. Try again.');
          setSaving(false);
        }
      };

      return h`<div class="cp-notif-sheet" onClick=${onClose}>
        <div class="cp-notif-panel" onClick=${(e) => e.stopPropagation()} style=${{ maxHeight: 'auto' }}>
          <div class="cp-help-grip"></div>
          <div class="cp-notif-head">
            <div>
              <div class="cp-help-h">Change password</div>
              <div class="cp-help-sub">8+ characters. We hash everything client-side.</div>
            </div>
            <button class="cp-bell" aria-label="Close" onClick=${onClose}><i class="ti ti-x" style=${{ fontSize: 18 }}></i></button>
          </div>
          <div style=${{ padding: '18px 18px max(24px,env(safe-area-inset-bottom))' }}>
            <div class="cp-wiz-field">
              <div class="cp-wiz-lbl">Current password</div>
              <input class="cp-wiz-input" type=${show ? 'text' : 'password'} value=${oldPwd} onInput=${e => setOldPwd(e.target.value)} autocomplete="current-password" placeholder="•••••••"/>
            </div>
            <div class="cp-wiz-field">
              <div class="cp-wiz-lbl">New password</div>
              <input class="cp-wiz-input" type=${show ? 'text' : 'password'} value=${newPwd} onInput=${e => setNewPwd(e.target.value)} autocomplete="new-password" placeholder="At least 8 characters"/>
            </div>
            <div class="cp-wiz-field">
              <div class="cp-wiz-lbl">Confirm new password</div>
              <input class="cp-wiz-input" type=${show ? 'text' : 'password'} value=${confirm} onInput=${e => setConfirm(e.target.value)} autocomplete="new-password" placeholder="Re-type it"
                onKeyDown=${e => { if (e.key === 'Enter' && canSubmit) submit(); }}/>
            </div>
            <label style=${{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--t2)', margin: '4px 2px 16px', cursor: 'pointer' }}>
              <input type="checkbox" checked=${show} onChange=${e => setShow(e.target.checked)} style=${{ accentColor: 'var(--brand,#ff00ee)', width: 16, height: 16 }}/>
              Show passwords
            </label>
            ${err && h`<div class="cp-wiz-error" style=${{ marginBottom: 14 }}><i class="ti ti-alert-circle"></i>${err}</div>`}
            <div style=${{ display: 'flex', gap: 8 }}>
              <button class="cp-batch-cancel" onClick=${onClose} disabled=${saving} style=${{ flex: 1 }}>Cancel</button>
              <button class="cp-wiz-btn cp-wiz-btn-pri" onClick=${submit} disabled=${!canSubmit} style=${{ flex: 1.5, minHeight: 'auto' }}>
                ${saving ? h`<i class="ti ti-loader-2 spinner"></i>Saving…` : 'Update password'}
              </button>
            </div>
          </div>
        </div>
      </div>`;
    }

    function FAQSheet({ onClose, agencySupportEmail, agencyWhatsapp }) {
      useSheetBack(onClose);
      const [open, setOpen] = useState(0); // first item open by default
      const items = [
        { q: 'How do I approve a post?',
          a: 'On Home or the Approvals tab, tap a post. Hit <em>Approve</em> if it looks good, or <em>Request changes</em> to send a note to your team. Tap the post image to see the full caption, hashtags, and any other slides.' },
        { q: 'What if I tap Approve by mistake?',
          a: 'You’ll see an <em>Undo</em> button on the toast for a few seconds. Tap it and the post goes straight back to pending.' },
        { q: 'How do payments work?',
          a: 'Open the Payments tab and tap <em>Pay now</em>. We use Razorpay, so UPI, cards, net banking, wallets and EMI all work. Receipts arrive in your email. If you paid via UPI or bank transfer directly, use the <em>Send proof on WhatsApp</em> link — we’ll mark it within 24 hours.' },
        { q: 'What happens if I’m late on payment?',
          a: 'Nothing dramatic. The invoice rolls into <em>overdue</em>, you’ll see how many days late on the Payments hero, and your account manager may follow up. Work continues unless we’ve flagged a freeze.' },
        { q: 'Can I see what’s scheduled next?',
          a: 'The Calendar tab shows everything for the month — tap any day with a dot to open its post (days with more than one show a quick list to pick from). The Home tab also has a Yesterday/Today/Tomorrow strip up top.' },
        { q: 'How do I sign out?',
          a: 'Account tab → <em>Sign out</em> at the bottom. You can sign back in with the same email anytime.' },
        { q: 'Who can I talk to?',
          a: (() => {
            // White-label safe: only ever surface the agency's own contact
            // details from agencyConfig — neutral copy when none are set.
            const emailLink = agencySupportEmail ? `<a href="mailto:${agencySupportEmail}">${agencySupportEmail}</a>` : '';
            if (agencyWhatsapp) return `Message us on WhatsApp — <a href="https://wa.me/${(agencyWhatsapp + '').replace(/[^0-9]/g, '')}" target="_blank" rel="noopener">${agencyWhatsapp}</a>.${emailLink ? ` Or email ${emailLink}.` : ''} We answer Mon–Sat.`;
            if (emailLink) return `Email ${emailLink} or reply to any email we’ve sent. We answer Mon–Sat.`;
            return 'Reply to any email we’ve sent, or message your account manager directly. We answer Mon–Sat.';
          })() },
      ];
      return h`<div class="cp-help-sheet" onClick=${onClose}>
        <div class="cp-help-panel" onClick=${(e) => e.stopPropagation()}>
          <div class="cp-help-grip"></div>
          <div class="cp-help-head">
            <div>
              <div class="cp-help-h">How can we help?</div>
              <div class="cp-help-sub">A few of the most-asked questions.</div>
            </div>
            <button class="cp-bell" aria-label="Close" onClick=${onClose}><i class="ti ti-x" style=${{ fontSize: 18 }}></i></button>
          </div>
          <div class="cp-help-body">
            ${items.map((it, i) => h`<div key=${i} class=${'cp-faq' + (open === i ? ' open' : '')}>
              <button class="cp-faq-q" onClick=${() => setOpen(open === i ? -1 : i)}>
                <span>${it.q}</span>
                <i class="ti ti-chevron-down"></i>
              </button>
              <div class="cp-faq-a" dangerouslySetInnerHTML=${{ __html: it.a }}></div>
            </div>`)}
            <div class="cp-faq-foot">
              Still stuck? ${agencyWhatsapp
                ? h`<a href=${'https://wa.me/' + (agencyWhatsapp + '').replace(/[^0-9]/g, '')} target="_blank" rel="noopener">WhatsApp us →</a>`
                : agencySupportEmail
                ? h`<a href=${'mailto:' + agencySupportEmail}>Email us →</a>`
                : 'Message your account manager.'}
            </div>
          </div>
        </div>
      </div>`;
    }

    // ─── Main shell ────────────────────────────────────────────────────────

    function ClientPortal({ user, onSignOut }) {
      const [client, setClient] = useState(null);
      const [posts, setPosts] = useState([]);
      const [loading, setLoading] = useState(true);
      const [err, setErr] = useState('');
      const initialRoute = useMemo(() => cpParseHash(), []);
      const [tab, setTab] = useState(() => initialRoute.tab || 'home');
      const [detailPostId, setDetailPostId] = useState(() => initialRoute.postId);
      // Sync (tab, detailPostId) → hash
      useEffect(() => { cpWriteHash({ tab, postId: detailPostId }); }, [tab, detailPostId]);
      // Sync hash → state (back/forward, pasted URL)
      useEffect(() => {
        const on = (e) => {
          // A popstate the sheet-back stack already handled (closing a sheet /
          // swallowing its own synthetic pop) must not re-parse the hash —
          // the landed-on entry can carry a stale post id that would reopen
          // the sheet that just closed.
          if (e && cpSheetState.consumedEvent === e) return;
          const r = cpParseHash();
          const desiredTab = r.tab || 'home';
          setTab(prev => (prev === desiredTab ? prev : desiredTab));
          setDetailPostId(prev => (prev === r.postId ? prev : r.postId));
        };
        window.addEventListener('hashchange', on);
        window.addEventListener('popstate', on);
        return () => {
          window.removeEventListener('hashchange', on);
          window.removeEventListener('popstate', on);
        };
      }, []);
      const [busyId, setBusyId] = useState(null);
      const [toast, setToast] = useState(null);
      const [helpOpen, setHelpOpen] = useState(false);
      const [notifOpen, setNotifOpen] = useState(false);
      const [pwdSheetOpen, setPwdSheetOpen] = useState(false);
      // "Last seen" notification id — persists per brand so the bell dot only
      // lights up when something arrived since the user last opened the sheet.
      // Polled cheaply against the latest notifications row's id; no realtime
      // subscription up here (NotifSheet has its own when open).
      const [lastSeenNotifId, setLastSeenNotifId] = useState(() => {
        try { return Number(localStorage.getItem('cp_last_notif_seen') || 0) || 0; } catch (_) { return 0; }
      });
      const markNotifSeen = useCallback((id) => {
        if (!id) return;
        setLastSeenNotifId(prev => {
          const v = Math.max(Number(prev) || 0, Number(id) || 0);
          try { localStorage.setItem('cp_last_notif_seen', String(v)); } catch (_) {}
          return v;
        });
      }, []);
      const [latestNotifId, setLatestNotifId] = useState(0);
      // Pull-to-refresh: bumps reloadTick (re-fires client+posts load) AND
      // dispatches a cp-refresh window event that PaymentsTab listens for.
      // DOM-direct updates during touchmove for 60fps; React only re-renders
      // when refreshing state transitions for the spinner badge.
      const mainRef = useRef(null);
      const ptrIndRef = useRef(null);
      const ptr = useRef({ active: false, startY: 0, pullDist: 0, refreshing: false });
      const [ptrRefreshing, setPtrRefreshing] = useState(false);
      const setPtrUI = (dist) => {
        const el = ptrIndRef.current;
        if (!el) return;
        const refreshing = ptr.current.refreshing;
        el.style.height = (refreshing ? 48 : dist) + 'px';
        el.style.opacity = String(refreshing ? 1 : Math.min(1, dist / 60));
      };
      const onPtrStart = (e) => {
        if (ptr.current.refreshing) return;
        const main = mainRef.current;
        if (!main || main.scrollTop > 0) return;
        ptr.current.active = true;
        ptr.current.startY = e.touches[0].clientY;
        ptr.current.pullDist = 0;
      };
      const onPtrMove = (e) => {
        if (!ptr.current.active) return;
        const dy = e.touches[0].clientY - ptr.current.startY;
        if (dy <= 0) { ptr.current.pullDist = 0; setPtrUI(0); return; }
        ptr.current.pullDist = Math.min(dy * 0.45, 110); // rubber-band
        setPtrUI(ptr.current.pullDist);
      };
      const onPtrEnd = () => {
        if (!ptr.current.active) return;
        const d = ptr.current.pullDist;
        ptr.current.active = false;
        if (d >= 60) {
          ptr.current.refreshing = true;
          setPtrRefreshing(true);
          setPtrUI(0);
          setReloadTick(t => t + 1);
          try { window.dispatchEvent(new CustomEvent('cp-refresh')); } catch (_) {}
          // Hold the spinner ~700ms even if refetch is faster — tactile.
          setTimeout(() => {
            ptr.current.refreshing = false;
            setPtrRefreshing(false);
            setPtrUI(0);
          }, 700);
        } else {
          setPtrUI(0);
        }
      };
      // Agency settings (legal name, contact_email, contact_phone) — loaded
      // once after sign-in. Used by FAQ sheet, Payments WhatsApp proof flow,
      // and the "Your team" block on Account. Read-only for clients via the
      // shared agency_settings_get RPC.
      const [agencyConfig, setAgencyConfig] = useState(null);
      useEffect(() => {
        let alive = true;
        rpcCall('agency_settings_get').then(row => { if (alive && row) setAgencyConfig(row); }).catch(() => {});
        return () => { alive = false; };
      }, []);
      const [pushPermission, setPushPermission] = useState(() => {
        // Honor a saved dismissal for both the normal banner (permission still
        // 'default') and the iOS-Safari 'install first' explainer (unsupported).
        try {
          if (localStorage.getItem('cp_push_dismissed') === '1'
              && (typeof Notification === 'undefined' || Notification.permission === 'default')) return 'dismissed';
        } catch (_) {}
        if (typeof Notification === 'undefined') return 'unsupported';
        return Notification.permission || 'default';
      });
      const [installEvent, setInstallEvent] = useState(null);
      const [isStandalone, setIsStandalone] = useState(() => {
        try {
          return window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
        } catch (_) { return false; }
      });
      const isIos = useMemo(() => {
        if (typeof navigator === 'undefined') return false;
        const ua = navigator.userAgent || '';
        return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
      }, []);
      // showToast accepts either a string (1.8s, no action) or an object
      // { msg, actionLabel, onAction, duration } for action toasts (default 5.5s).
      // A unique `key` lets a later toast cancel an earlier dismiss timer.
      const showToast = useCallback((arg) => {
        const t = typeof arg === 'string'
          ? { msg: arg, duration: 1800, key: Date.now() + Math.random() }
          : { duration: arg.actionLabel ? 5500 : 1800, key: Date.now() + Math.random(), ...arg };
        setToast(t);
        setTimeout(() => setToast(cur => (cur && cur.key === t.key ? null : cur)), t.duration);
      }, []);

      // If the URL deep-links to a post id that isn't in the loaded list, clear it once we know.
      useEffect(() => {
        if (loading || !detailPostId) return;
        if (!posts.find(p => p.id === detailPostId)) {
          setDetailPostId(null);
          showToast('Post not available');
        }
      }, [loading, posts, detailPostId, showToast]);

      // Onboarding context (loaded lazily after the client lands).
      // ctx shape: { submission, template, fieldDefs } — null while normal
      // portal is in use (status === 'onboarded' or missing).
      const [onboardingCtx, setOnboardingCtx] = useState(null);
      const [reloadTick, setReloadTick] = useState(0);

      // Account insights (followers / reach / engagement) for the Home KPI
      // tiles — default last-30-days window. Fails soft: no RPC (migration 073
      // not applied) or no connected account → null → tiles show em-dashes.
      const [insights, setInsights] = useState(null);
      useEffect(() => {
        if (!user?.client_id) return;
        let alive = true;
        rpcCall('insights_summary_for_self')
          .then(raw => { if (alive) setInsights(normalizeInsights(raw)); })
          .catch(() => {});
        return () => { alive = false; };
      }, [user?.client_id, reloadTick]);

      // Load client + posts on mount
      useEffect(() => {
        let alive = true;
        async function load() {
          if (!user?.client_id) {
            setErr('This account is not linked to a brand. Ask your account contact to fix it.');
            setLoading(false);
            return;
          }
          try {
            const [cRows, pRows] = await Promise.all([
              db('clients', `&id=eq.${user.client_id}`),
              db('content', `&client_id=eq.${user.client_id}&workflow_status=in.(${CLIENT_STATUSES.join(',')})&order=post_date.asc`),
            ]);
            if (!alive) return;
            const cli = cRows[0] || null;
            setClient(cli);
            setPosts(pRows || []);

            // Onboarding fetch — only when status is set and not yet completed.
            // submission_id may not be set on very old client rows; skip in that case.
            const status = cli?.onboarding_status;
            if (cli?.onboarding_submission_id && status && status !== 'onboarded') {
              try {
                const subRows = await rpcCall('portal_get_onboarding_submission');
                const sub = subRows?.[0] || null;
                if (sub) {
                  const [tplRows, defRows] = await Promise.all([
                    db('onboarding_templates', `&id=eq.${sub.template_id}&limit=1`),
                    db('onboarding_field_defs', `&template_id=eq.${sub.template_id}&order=step,sort_order`),
                  ]);
                  if (alive) setOnboardingCtx({ submission: sub, template: tplRows?.[0] || null, fieldDefs: defRows || [] });
                }
              } catch (e) {
                console.warn('[client_portal] onboarding fetch failed', e);
                // Non-fatal — fall through to normal portal.
              }
            } else {
              setOnboardingCtx(null);
            }
            setLoading(false);
          } catch (e) {
            if (!alive) return;
            console.warn('[client_portal] load failed', e);
            setErr('Could not load your content. Check your connection and refresh.');
            setLoading(false);
          }
        }
        load();
        return () => { alive = false; };
      }, [user?.client_id, reloadTick]);

      // Keep latestNotifId (a created_at epoch — notification ids are uuids, so
      // Number(id) was always NaN) in sync so the header bell dot lights up for
      // new messages. Realtime on `notifications` went permanently quiet post-075
      // (anon SELECT revoked + FORCE RLS — no row images), so this POLLS the RPC,
      // and re-checks the moment the PWA returns to the foreground (mobile
      // browsers freeze timers while backgrounded).
      useEffect(() => {
        if (!user?.name) return;
        let alive = true;
        const enc = encodeURIComponent(user.name);
        const bump = (row) => { if (alive && row) setLatestNotifId(prev => Math.max(Number(prev) || 0, Date.parse(row.created_at) || 0)); };
        const check = async () => {
          try {
            const res = await rpcCall('notif_list_for_self', { p_limit: 1, p_unread_only: false }, { silentAuth: true });
            const rows = Array.isArray(res) ? res : (res?.rows || []);
            bump(rows[0]);
            return;
          } catch (_) { /* pre-075 DB — legacy direct table read */ }
          db('notifications', `&or=(recipient.eq.${enc},recipient.eq.all)&order=created_at.desc&limit=1&deleted_at=is.null&select=id,created_at`)
            .then(rows => bump(rows && rows[0]))
            .catch(() => {});
        };
        check();
        const poll = setInterval(check, 60000);
        const onVis = () => { if (document.visibilityState === 'visible') check(); };
        document.addEventListener('visibilitychange', onVis);
        return () => { alive = false; clearInterval(poll); document.removeEventListener('visibilitychange', onVis); };
      }, [user?.name, user?.client_id]);

      // Realtime: refresh when posts for this client change
      useEffect(() => {
        if (!user?.client_id) return;
        const ch = supabase
          .channel('cp-content-' + user.client_id)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'content', filter: 'client_id=eq.' + user.client_id }, (payload) => {
            const row = payload.new || payload.old;
            if (!row) return;
            if (payload.eventType === 'DELETE') {
              setPosts(ps => ps.filter(p => p.id !== row.id));
              return;
            }
            if (!CLIENT_STATUSES.includes(payload.new.workflow_status)) {
              // No longer visible to clients
              setPosts(ps => ps.filter(p => p.id !== payload.new.id));
              return;
            }
            setPosts(ps => {
              const idx = ps.findIndex(p => p.id === payload.new.id);
              if (idx === -1) return [...ps, payload.new].sort((a, b) => (a.post_date || '').localeCompare(b.post_date || ''));
              const copy = [...ps]; copy[idx] = payload.new; return copy;
            });
          })
          .subscribe();
        return () => { try { supabase.removeChannel(ch); } catch (_) {} };
      }, [user?.client_id]);

      // PWA install prompt event (Chrome / Android only — iOS uses manual instructions)
      useEffect(() => {
        const onBip = (e) => { e.preventDefault(); setInstallEvent(e); };
        const onInstalled = () => { setInstallEvent(null); setIsStandalone(true); };
        window.addEventListener('beforeinstallprompt', onBip);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
          window.removeEventListener('beforeinstallprompt', onBip);
          window.removeEventListener('appinstalled', onInstalled);
        };
      }, []);

      // If push permission was already granted previously, re-subscribe on load so this
      // device's row in push_subscriptions stays fresh (and gets the client's role).
      useEffect(() => {
        if (pushPermission !== 'granted') return;
        if (typeof subscribeToPush !== 'function') return;
        subscribeToPush(user).catch(() => {});
      }, [pushPermission, user?.id]);

      const onOpenDetail = useCallback((post) => { setDetailPostId(post.id); }, []);
      const closeDetail = useCallback(() => setDetailPostId(null), []);

      const enablePush = useCallback(async () => {
        if (typeof Notification === 'undefined') return;
        try {
          const p = await Notification.requestPermission();
          setPushPermission(p);
          if (p === 'granted' && typeof subscribeToPush === 'function') {
            await subscribeToPush(user);
            setToast('Notifications on ✓');
            setTimeout(() => setToast(t => (t === 'Notifications on ✓' ? null : t)), 1800);
          }
        } catch (e) {
          console.warn('[client_portal] push enable failed', e);
        }
      }, [user]);

      const dismissPush = useCallback(() => {
        try { localStorage.setItem('cp_push_dismissed', '1'); } catch (_) {}
        setPushPermission('dismissed');
      }, []);

      const doInstall = useCallback(async () => {
        if (!installEvent) return;
        try {
          installEvent.prompt();
          const choice = await installEvent.userChoice;
          if (choice && choice.outcome === 'accepted') setInstallEvent(null);
        } catch (e) { console.warn('[client_portal] install prompt failed', e); }
      }, [installEvent]);

      const sendComment = useCallback(async (post, body, attachments = []) => {
        try {
          await dbInsert('post_comments', [{
            post_id: post.id,
            author: client?.name || user?.name || 'Client',
            author_kind: 'client',
            body,
            attachments: attachments.length ? attachments : [],
          }]);
          // Notify assignee + admins so they see + can push back to the client.
          const title = post.title || 'a post';
          const preview = body.length > 140 ? body.slice(0, 140) + '…' : body;
          const actor = client?.name || user?.name || 'Client';
          const attachSuffix = attachments.length ? ` (+${attachments.length} image${attachments.length === 1 ? '' : 's'})` : '';
          if (post.assigned_to) {
            insertNotif(post.assigned_to, `💬 ${actor} commented`, `On "${title}"${attachSuffix}: ${preview || (attachments.length ? '[image]' : '')}`, 'info', client?.name || null, title, 'content', post.id);
          }
          insertNotif(`role:admin,manager`, `💬 ${actor} commented`, `On "${title}"${attachSuffix}: ${preview || (attachments.length ? '[image]' : '')}`, 'info', client?.name || null, title, 'content', post.id);
        } catch (e) {
          console.warn('[client_portal] comment failed', e);
          setToast('Could not send comment');
          setTimeout(() => setToast(null), 1800);
          throw e;
        }
      }, [client, user]);

      const onApprove = useCallback(async (post) => {
        setBusyId(post.id);
        // Snapshot the previous status so Undo can revert without re-fetching.
        const prevApproval = post.client_approval;
        const prevWorkflow = post.workflow_status;
        try {
          await rpcCall('content_client_review', { p_id: post.id, p_client_approval: 'approved', p_workflow_status: 'approved' });
          setPosts(ps => ps.map(p => p.id === post.id ? { ...p, client_approval: 'approved', workflow_status: 'approved' } : p));
          const actor = client?.name || user?.name || 'Client';
          const title = post.title || 'a post';
          // Fan out: assignee + admins/managers
          if (post.assigned_to) {
            insertNotif(post.assigned_to, `✅ Client approved "${title}"`, `${actor} approved "${title}". Ready to schedule.`, 'approval', client?.name || null, title, 'content', post.id);
          }
          insertNotif(`role:admin,manager`, `✅ ${actor} approved a post`, `${actor} approved "${title}".`, 'approval', client?.name || null, title, 'content', post.id);
          // Toast with Undo — reverts both columns + tells team it was undone.
          showToast({
            msg: 'Approved ✓',
            actionLabel: 'Undo',
            onAction: async () => {
              try {
                await rpcCall('content_client_review', { p_id: post.id, p_client_approval: prevApproval, p_workflow_status: prevWorkflow });
                setPosts(ps => ps.map(p => p.id === post.id ? { ...p, client_approval: prevApproval, workflow_status: prevWorkflow } : p));
                if (post.assigned_to) {
                  insertNotif(post.assigned_to, `↩️ Approval undone on "${title}"`, `${actor} undid an approval — still awaiting review.`, 'info', client?.name || null, title, 'content', post.id);
                }
                insertNotif(`role:admin,manager`, `↩️ ${actor} undid an approval`, `On "${title}".`, 'info', client?.name || null, title, 'content', post.id);
                showToast('Reverted to pending');
              } catch (e) {
                console.warn('[client_portal] undo approve failed', e);
                showToast('Could not undo. Try again.');
              }
            },
          });
        } catch (e) {
          console.warn('[client_portal] approve failed', e);
          showToast('Could not save. Try again.');
        } finally {
          setBusyId(null);
        }
      }, [client, user, showToast]);

      const onRevision = useCallback(async (post, text) => {
        if (!post || !text) return;
        setBusyId(post.id);
        try {
          await rpcCall('content_client_review', { p_id: post.id, p_client_approval: 'revision', p_workflow_status: 'revision', p_remarks: text });
          setPosts(ps => ps.map(p => p.id === post.id ? { ...p, client_approval: 'revision', workflow_status: 'revision', client_remarks: text } : p));
          const actor = client?.name || user?.name || 'Client';
          const title = post.title || 'a post';
          const preview = text.length > 140 ? text.slice(0, 140) + '…' : text;
          if (post.assigned_to) {
            insertNotif(post.assigned_to, `🔁 Revision requested on "${title}"`, `${actor}: "${preview}"`, 'revision', client?.name || null, title, 'content', post.id);
          }
          insertNotif(`role:admin,manager`, `🔁 ${actor} requested changes`, `On "${title}": "${preview}"`, 'revision', client?.name || null, title, 'content', post.id);
          showToast('Sent to your team ✓');
        } catch (e) {
          console.warn('[client_portal] revision failed', e);
          showToast('Could not send. Try again.');
        } finally {
          setBusyId(null);
        }
      }, [client, user, showToast]);

      // Batch approve N posts in parallel. Snapshots their previous state so
      // the toast Undo can revert the whole batch at once. Notifies team
      // per-post (so each assignee still gets their notification), plus one
      // summary notification to admin/manager. Returns true on success.
      const [batchBusy, setBatchBusy] = useState(false);
      const onBatchApprove = useCallback(async (batchPosts) => {
        if (!batchPosts?.length) return false;
        setBatchBusy(true);
        const actor = client?.name || user?.name || 'Client';
        // Snapshot previous state per post for Undo.
        const snapshots = batchPosts.map(p => ({ id: p.id, ca: p.client_approval, ws: p.workflow_status, title: p.title || 'a post', assigned_to: p.assigned_to }));
        try {
          const results = await Promise.allSettled(batchPosts.map(p =>
            rpcCall('content_client_review', { p_id: p.id, p_client_approval: 'approved', p_workflow_status: 'approved' })
          ));
          const okIds = new Set();
          results.forEach((r, i) => { if (r.status === 'fulfilled') okIds.add(batchPosts[i].id); });
          if (okIds.size === 0) {
            showToast('Could not approve. Try again.');
            return false;
          }
          setPosts(ps => ps.map(p => okIds.has(p.id) ? { ...p, client_approval: 'approved', workflow_status: 'approved' } : p));
          // Per-post fan-out to each assignee (keeps individual ownership clear).
          snapshots.filter(s => okIds.has(s.id) && s.assigned_to).forEach(s => {
            insertNotif(s.assigned_to, `✅ Client approved "${s.title}"`, `${actor} approved "${s.title}" (in a batch of ${okIds.size}). Ready to schedule.`, 'approval', client?.name || null, s.title, 'content', s.id);
          });
          // Single summary for admin/manager.
          insertNotif('role:admin,manager', `✅ ${actor} approved ${okIds.size} post${okIds.size === 1 ? '' : 's'}`, `Batch approval${snapshots.length !== okIds.size ? ` (${snapshots.length - okIds.size} failed, will retry)` : ''}.`, 'approval', client?.name || null, null, 'client', client?.id || null);
          showToast({
            msg: `Approved ${okIds.size} ✓`,
            actionLabel: 'Undo',
            duration: 6500,
            onAction: async () => {
              try {
                const undoResults = await Promise.allSettled(
                  snapshots.filter(s => okIds.has(s.id))
                    .map(s => rpcCall('content_client_review', { p_id: s.id, p_client_approval: s.ca, p_workflow_status: s.ws }))
                );
                const undoIds = new Set();
                undoResults.forEach((r, i) => { if (r.status === 'fulfilled') undoIds.add(snapshots[i].id); });
                setPosts(ps => ps.map(p => {
                  const s = snapshots.find(x => x.id === p.id);
                  return s && undoIds.has(p.id) ? { ...p, client_approval: s.ca, workflow_status: s.ws } : p;
                }));
                insertNotif('role:admin,manager', `↩️ ${actor} undid a batch approval`, `Reverted ${undoIds.size} post${undoIds.size === 1 ? '' : 's'} back to pending.`, 'info', client?.name || null, null, 'client', client?.id || null);
                showToast('Reverted to pending');
              } catch (e) {
                console.warn('[client_portal] batch undo failed', e);
                showToast('Could not undo. Try again.');
              }
            },
          });
          return true;
        } catch (e) {
          console.warn('[client_portal] batch approve failed', e);
          showToast('Could not approve. Try again.');
          return false;
        } finally {
          setBatchBusy(false);
        }
      }, [client, user, showToast]);

      const pendingCount = posts.filter(p => p.client_approval === 'pending' && p.workflow_status === 'sent_to_client').length;
      const brand = brandColor(client);
      const clientName = client?.name || 'Your brand';

      // ── Onboarding takeover ─────────────────────────────────────────
      // While the client is still in the onboarding pipeline (any status
      // other than 'onboarded'), the wizard or a waiting screen replaces
      // the normal portal entirely. Sign Out stays accessible via the
      // header so a brand can always escape if they need to.
      if (!loading && !err && client && client.onboarding_status && client.onboarding_status !== 'onboarded') {
        const sub = onboardingCtx?.submission;
        const subStatus = sub?.status || 'pending';
        // While the form itself is still open: render the wizard. Once the
        // client has submitted (subStatus='submitted') we show the read-only
        // "waiting" screen keyed on client.onboarding_status so it picks up
        // 'contract_sent' / 'contract_signed' once Phase 6 ships.
        if (sub && (subStatus === 'pending' || subStatus === 'in_progress')) {
          const agencyEmail = sub?.placeholders?.agency_access_email || agencyConfig?.contact_email || '';
          return h`<${OnboardingWizard}
            user=${user}
            client=${client}
            submission=${sub}
            fieldDefs=${onboardingCtx?.fieldDefs || []}
            template=${onboardingCtx?.template}
            agencyAccessEmail=${agencyEmail}
            onCompleted=${() => setReloadTick(t => t + 1)}
            onSignOut=${onSignOut}
          />`;
        }
        // Submitted or downstream — waiting screen.
        if (['form_filled', 'contract_sent', 'contract_signed'].includes(client.onboarding_status)) {
          return h`<${OnboardingWaiting} client=${client} status=${client.onboarding_status} onSignOut=${onSignOut}/>`;
        }
        // Else (e.g. form_sent but submission failed to load): fall through to normal portal.
      }

      const pushBanner = h`<${PushBanner} permission=${pushPermission} onEnable=${enablePush} onDismiss=${dismissPush}/>`;

      // Render. Account tab must always work (even mid-load or mid-error) so the user
      // can sign out and get unstuck. Other tabs gate on load + error.
      let body;
      if (tab === 'account') body = h`<${AccountTab} user=${user} client=${client} onSignOut=${onSignOut} installEvent=${installEvent} isIos=${isIos} isStandalone=${isStandalone} onInstall=${doInstall} pushPermission=${pushPermission} onEnablePush=${enablePush} agencyConfig=${agencyConfig} onClientUpdated=${(fresh) => setClient(fresh)} onOpenPasswordChange=${() => setPwdSheetOpen(true)}/>`;
      else if (loading) body = h`<div class="cp-loading"><i class="ti ti-loader-2 spinner"></i>Loading your content…</div>`;
      else if (err) body = h`<div class="cp-pad"><div class="cp-empty"><i class="ti ti-alert-circle"></i>${err}</div></div>`;
      else if (tab === 'home') body = h`<${HomeTab} client=${client} posts=${posts} user=${user} onApprove=${onApprove} onRevision=${onRevision} onOpenDetail=${onOpenDetail} onTabChange=${setTab} busyId=${busyId} pushBanner=${pushBanner} insights=${insights}/>`;
      else if (tab === 'approve') body = h`<${ApproveTab} client=${client} posts=${posts} onApprove=${onApprove} onRevision=${onRevision} onOpenDetail=${onOpenDetail} onBatchApprove=${onBatchApprove} busyId=${busyId} batchBusy=${batchBusy}/>`;
      else if (tab === 'calendar') body = h`<${CalendarTab} client=${client} posts=${posts} onOpenDetail=${onOpenDetail}/>`;
      else if (tab === 'insights') body = h`<${InsightsTab} client=${client}/>`;
      else if (tab === 'payments') body = h`<${PaymentsTab} client=${client} user=${user} showToast=${showToast} agencyConfig=${agencyConfig}/>`;

      return h`<div class="cp-root">
        <div class="cp-head">
          <div class="cp-head-l">
            <div class="cp-mark" style=${{ background: brand }}>${initials(clientName)}</div>
            <div style=${{ minWidth: 0 }}>
              <div class="cp-head-name">${clientName}</div>
              <div class="cp-head-sub">${agencyConfig?.app_name || agencyConfig?.trade_name || 'My Digital Sevak'}</div>
            </div>
          </div>
          <div class="cp-head-r">
            <button class="cp-bell" aria-label="Help & FAQ" onClick=${() => setHelpOpen(true)} title="Help & FAQ">
              <i class="ti ti-help-circle" style=${{ fontSize: 19 }}></i>
            </button>
            <button class="cp-bell" aria-label="Notifications" onClick=${() => setNotifOpen(true)} title="Notifications">
              <i class="ti ti-bell" style=${{ fontSize: 19 }}></i>
              ${latestNotifId > lastSeenNotifId && h`<span class="dot"></span>`}
            </button>
          </div>
        </div>
        <div class="cp-main" ref=${mainRef} onTouchStart=${onPtrStart} onTouchMove=${onPtrMove} onTouchEnd=${onPtrEnd} onTouchCancel=${onPtrEnd}>
          <div class=${'cp-ptr' + (ptrRefreshing ? ' refreshing' : '')} ref=${ptrIndRef}><i class="ti ti-loader-2"></i></div>
          ${body}
        </div>
        <div class="cp-nav">
          ${[
            ['home', 'ti-home', 'Home'],
            ['approve', 'ti-checkbox', 'Approve'],
            ['calendar', 'ti-calendar', 'Calendar'],
            ['insights', 'ti-chart-bar', 'Insights'],
            ['payments', 'ti-credit-card', 'Payments'],
            ['account', 'ti-user', 'Account'],
          ].map(([id, ic, lb]) => h`<button key=${id} class=${'cp-nav-btn' + (tab === id ? ' on' : '')} onClick=${() => setTab(id)}>
            <i class=${'ti ' + ic}></i><span>${lb}</span>
            ${id === 'approve' && pendingCount > 0 && h`<span class="cp-nav-badge">${pendingCount}</span>`}
          </button>`)}
        </div>
        ${(() => {
          const detailPost = detailPostId ? posts.find(p => p.id === detailPostId) : null;
          if (!detailPost) return null;
          return h`<${PostDetailSheet} post=${detailPost} client=${client} user=${user} onClose=${closeDetail} onApprove=${onApprove} onRevision=${onRevision} onSendComment=${sendComment} busy=${busyId === detailPost.id}/>`;
        })()}
        ${toast && h`<${Toast} toast=${toast} onAction=${() => { const fn = toast.onAction; setToast(null); if (fn) fn(); }}/>`}
        ${helpOpen && h`<${FAQSheet} onClose=${() => setHelpOpen(false)} agencySupportEmail=${agencyConfig?.contact_email} agencyWhatsapp=${agencyConfig?.contact_phone}/>`}
        ${notifOpen && h`<${NotifSheet} user=${user} client=${client} onClose=${() => setNotifOpen(false)} lastSeenId=${lastSeenNotifId} onMarkSeen=${markNotifSeen} onNavigate=${(r) => { if (r.tab) setTab(r.tab); if (r.postId) setDetailPostId(r.postId); if (r.invoiceId) { cpWriteHash({ tab: 'payments', invoiceId: r.invoiceId }); } }}/>`}
        ${pwdSheetOpen && h`<${PasswordChangeSheet} user=${user} onClose=${() => setPwdSheetOpen(false)} showToast=${showToast}/>`}
      </div>`;
    }

    return { ClientPortal };
  }

  // Run on first script execution
  injectStyles();
  window.AMS_PORTAL = { buildClientPortal: buildClientPortal };
})();

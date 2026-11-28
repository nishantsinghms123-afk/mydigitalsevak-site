/* ==========================================================================
 * posts.js — everything a post needs, inside the task window.
 *
 * window.AMS_POSTS.buildPosts(deps) → registers into window.AMS_EXT:
 *   postBox            postbox          the Post box under the brief (tasks.js PostBlock renders it):
 *                                       live Instagram / Facebook / YouTube view of the file with the
 *                                       caption edited inside it, the post's details, the next step
 *                                       (Send to client …) and publishing.
 *   taskPanelSections  post_refs        reference links, at the top of the task
 *                      post_due         the maker's deadline card, under the title (makers only)
 *                      post_client_chat "Client chat" tab beside Comments (post_comments, two-way)
 *
 * WHY (2026-11-26): the "Open full editor" button is gone. The old full editor (PostPanel) is no
 * longer reachable from a task; what it had that the task window lacked now lives here — the AI
 * caption, posting date/time, client approval, scope, version history, brand guide, the client's
 * comments and the send-to-client step. Sending to the client is done by the database (migration
 * 209: new round, version snapshot, client notified), so the status picker and this button behave
 * the same.
 *
 * The brief is the task's own Description (tasks.description ⇄ content.concept), so no Concept box.
 * Fields that fire notifications in PostPanel (status, assignee) stay with TaskPanel's own pickers.
 *
 * Designer first: a maker sees their deadline, what to change, their notes and their file before any
 * posting detail; posting is one line. Admins and managers get the next step and Publish beside the
 * preview. On a phone a maker's Upload button stays pinned to the bottom until they reach the file.
 *
 * Concurrency is guarded as PostPanel did: compare updated_at/updated_by before saving and refuse to
 * overwrite someone else. Fails open: no content_id, no deps, or a missing RPC → the section hides.
 * ==========================================================================*/
(function () {
  function buildPosts(deps) {
    const d = deps || {};
    const React = d.React, h = d.h;
    const useState = d.useState, useEffect = d.useEffect, useCallback = d.useCallback, useRef = d.useRef;
    const db = d.db, rpcCall = d.rpcCall, dbInsert = d.dbInsert, supabase = d.supabase;
    const PublishSection = d.PublishSection;
    const taskBus = d.taskBus;
    const POST_TYPES = d.POST_TYPES || [];
    const generatePostCaption = d.generatePostCaption, generatePostPreview = d.generatePostPreview;
    const insertNotif = d.insertNotif, notifyContent = d.notifyContent;
    const ensureScopeInstance = d.ensureScopeInstance, handleOosMarked = d.handleOosMarked;
    const BrandGuidelines = d.BrandGuidelines;
    const SB_URL = d.SB_URL, sbHeaders = d.sbHeaders;
    if (!React || !h || !db || !rpcCall) return {};
    const Fragment = React.Fragment;

    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key || item.type;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item);
    };
    const toastOf = (p) => (m) => { if (p && p.showToast) p.showToast(m); else if (window.showToast) window.showToast(m); };

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-posts-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-posts-styles';
      st.textContent = `
      .pf-grid{display:flex;flex-direction:column;gap:2px}
      .pf-row{display:grid;grid-template-columns:132px minmax(0,1fr);gap:10px;align-items:flex-start;padding:5px 0}
      .pf-k{display:flex;align-items:center;gap:7px;color:var(--cu-t2,#5c5c66);font-size:12.5px;padding-top:6px}
      .pf-k i{font-size:14px}
      .pf-v{min-width:0}
      .pf-in{width:100%;border:1px solid transparent;border-radius:var(--cu-radius,8px);background:transparent;
        color:var(--cu-t1,#1f1f23);font:inherit;font-size:13px;padding:5px 8px;resize:vertical}
      .pf-in:hover{background:var(--cu-bg2,#f6f6f7)}
      .pf-in:focus{outline:none;border-color:var(--cu-accent,#ff00ee);background:var(--cu-bg,#fff)}
      .pf-in::placeholder{color:var(--cu-t3,#8b8b93)}
      .pf-ta{min-height:34px;line-height:1.5}
      .pf-hint{font-size:11.5px;color:var(--cu-t3,#8b8b93);padding:2px 8px 0}
      .pf-warn{display:flex;align-items:flex-start;gap:8px;border:1px solid #f5c2c7;background:#fff5f5;color:#b42318;
        border-radius:var(--cu-radius,8px);padding:8px 10px;font-size:12.5px;margin-bottom:8px}
      .pf-x{border:none;background:transparent;color:var(--cu-t3,#8b8b93);cursor:pointer;padding:2px;line-height:1}
      .pf-x:hover{color:#b42318}
      .pf-refbar{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:8px 0 2px;padding:8px 10px;background:var(--cu-bg2,#f6f6f7);border-radius:var(--cu-radius,8px)}
      .pf-refbar .lbl{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--cu-t2,#5c5c66);margin-right:4px}
      .pf-refbar .lbl i{font-size:15px;color:var(--cu-accent-ink,#a8009c)}
      .pf-chip{display:inline-flex;align-items:center;gap:5px;height:26px;max-width:260px;padding:0 4px 0 9px;background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);border-radius:13px;font-size:12.5px}
      .pf-chip a,.pf-chip span{color:var(--cu-accent-ink,#a8009c);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pf-chip span{color:var(--cu-t1,#1f1f23)}
      .pf-chip a:hover{text-decoration:underline}
      @media(pointer:coarse),(max-width:760px){.pf-chip{height:36px}.pf-chip a{padding:9px 0}.pf-chip .pf-x{padding:8px}.pf-refadd{height:36px}}
      .pf-chip>i{font-size:14px;color:var(--cu-t3,#8b8b93)}
      .pf-chip .pf-x{opacity:.55}
      .pf-chip:hover .pf-x{opacity:1}
      .pf-refadd{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border:1px dashed var(--cu-bd,#e8e8eb);border-radius:13px;background:transparent;color:var(--cu-t2,#5c5c66);font:12.5px Inter,system-ui,sans-serif;cursor:pointer}
      .pf-refadd:hover{color:var(--cu-t1,#1f1f23);border-color:var(--cu-t3,#8b8b93)}
      .pf-refin{height:26px;min-width:240px;flex:1;max-width:420px;border:1px solid var(--cu-accent,#ff00ee);border-radius:13px;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:12.5px Inter,system-ui,sans-serif;padding:0 10px}
      .pf-refin:focus{outline:none}

      /* the Post box */
      .pbx{border:1px solid var(--cu-bd);border-radius:12px;background:var(--cu-bg);overflow:hidden}
      .pbx-hd{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 16px;border-bottom:1px solid var(--cu-bd);background:var(--cu-bg2)}
      .pbx-hd h2{margin:0;font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px}
      .pbx-hd h2 i{color:var(--cu-accent-ink);font-size:17px}
      .pbx-steps{list-style:none;margin:0 0 0 auto;padding:0;display:flex;align-items:center;gap:4px;font-size:12px;overflow-x:auto;max-width:100%}
      .pbx-steps li{display:flex;align-items:center;gap:4px;white-space:nowrap;color:var(--cu-t2)}
      .pbx-steps li.done{color:#1a7f4b}
      html.dark .pbx-steps li.done{color:#5ee08f}
      .pbx-steps li.now{height:24px;padding:0 10px;border-radius:12px;background:var(--cu-accent-ink);color:#fff;font-weight:600}
      .pbx-steps li.sep{width:14px;height:1px;background:var(--cu-bd2);flex-shrink:0}
      .pbx-body{display:flex;flex-wrap:wrap;gap:24px;padding:18px 16px}
      .pbx-l{flex:0 1 360px;min-width:0;display:flex;flex-direction:column;gap:10px}
      .pbx-r{flex:1 1 320px;min-width:0;display:flex;flex-direction:column;gap:16px}
      .pbx-pad{padding:14px 16px 0}
      .pbx-tabs{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
      .pbx-plat{display:flex;gap:2px;padding:3px;border-radius:18px;background:var(--cu-bg3)}
      .pbx-plat button,.pbx-view button{height:30px;padding:0 12px;border:none;border-radius:15px;background:transparent;color:var(--cu-t2);font:500 12.5px Inter,system-ui,sans-serif;cursor:pointer}
      .pbx-plat button[aria-selected=true]{background:var(--cu-t1);color:var(--cu-bg)}
      .pbx-view{display:flex;border:1px solid var(--cu-bd2);border-radius:8px;overflow:hidden}
      .pbx-view button{border-radius:0;padding:0 10px}
      .pbx-view button[aria-pressed=true]{background:var(--cu-t1);color:var(--cu-bg)}
      .pbx-frame{border:1px solid var(--cu-bd);border-radius:14px;overflow:hidden;background:var(--cu-bg);box-shadow:0 8px 24px rgba(20,20,30,.08)}
      .pbx-fh{display:flex;align-items:center;gap:10px;padding:10px 12px;min-width:0}
      .pbx-av{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;color:#fff;font-size:11px;font-weight:700;flex-shrink:0}
      .pbx-av.ig{box-shadow:0 0 0 2px var(--cu-bg),0 0 0 3.5px #c13584}
      .pbx-av.fb{border-radius:50%}
      .pbx-fn{flex:1;min-width:0;display:flex;flex-direction:column}
      .pbx-fn b{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pbx-fn span{font-size:11.5px;color:var(--cu-t2);display:flex;align-items:center;gap:4px}
      .pbx-media .cu-post-th{aspect-ratio:var(--pbx-ar,4/5);border-radius:0;width:100%;max-height:640px}
      .pbx-media .cu-post-th>i{font-size:34px}
      .pbx-icons{display:flex;align-items:center;gap:14px;padding:10px 12px 2px;color:var(--cu-t1);font-size:22px}
      .pbx-icons.fb{gap:0;justify-content:space-around;font-size:13px;color:var(--cu-t2);border-top:1px solid var(--cu-bd);margin:6px 12px 0;padding:6px 0}
      .pbx-icons.fb span{display:inline-flex;align-items:center;gap:6px}
      .pbx-icons.fb i{font-size:18px}
      .pbx-cap{padding:6px 12px 12px;display:flex;flex-direction:column;gap:6px}
      .pbx-cap label{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--cu-accent-ink)}
      .pbx-cap textarea{width:100%;min-height:120px;padding:7px 9px;border:1px dashed rgba(168,0,156,.38);border-radius:8px;background:var(--cu-bg);color:var(--cu-t1);font:13.5px/1.5 Inter,system-ui,sans-serif;resize:vertical}
      .pbx-cap textarea:focus{outline:none;border-style:solid;border-color:var(--cu-accent)}
      .pbx-capbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .pbx-count{margin-left:auto;font-size:11.5px;color:var(--cu-t2);font-variant-numeric:tabular-nums}
      .pbx-count.over{color:#b42318;font-weight:600}
      .pbx-hint{font-size:11.5px;line-height:1.45;color:var(--cu-t2)}
      .pbx-hint.bar{padding:2px 8px;border-left:2px solid rgba(168,0,156,.38)}
      .pbx-tools{display:flex;flex-direction:column;gap:8px}
      .pbx-links{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px}
      .pbx-link{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:0;border:none;background:none;color:var(--cu-accent-ink);font:inherit;cursor:pointer;text-decoration:none}
      .pbx-link:hover{text-decoration:underline}
      .pbx-dl{margin:0;display:grid;grid-template-columns:118px minmax(0,1fr);column-gap:12px;row-gap:4px;font-size:13px;align-items:center}
      .pbx-dl dt{color:var(--cu-t2);min-height:32px;display:flex;align-items:center}
      .pbx-dl dd{margin:0;min-height:32px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
      .pbx-sel,.pbx-date{height:30px;max-width:100%;border:1px solid var(--cu-bd);border-radius:6px;background:var(--cu-bg);color:var(--cu-t1);font:13px Inter,system-ui,sans-serif;padding:0 6px}
      .pbx-sel:hover,.pbx-date:hover{border-color:var(--cu-bd2)}
      .pbx-sel:focus,.pbx-date:focus{outline:none;border-color:var(--cu-accent)}
      .pbx-ok{color:#1a7f4b;font-weight:500}.pbx-warn{color:#b45309;font-weight:500}.pbx-bad{color:#b42318;font-weight:500}
      html.dark .pbx-ok{color:#5ee08f}html.dark .pbx-warn{color:#fbbf24}html.dark .pbx-bad{color:#ff8a80}
      .pbx-changes{padding:10px 12px;border-radius:8px;background:var(--cu-bg2);font-size:13.5px;line-height:1.5}
      .pbx-changes.open{background:#fff8f3;border:1px solid #f0d3bd}
      html.dark .pbx-changes.open{background:rgba(180,83,9,.14);border-color:rgba(251,191,36,.3)}
      .pbx-changes-k{font-size:12px;font-weight:600;color:var(--cu-t2);margin-bottom:2px}
      .pbx-changes.open .pbx-changes-k{color:#9a3f06}
      html.dark .pbx-changes.open .pbx-changes-k{color:#fbbf24}
      .pbx-step{border:1px solid rgba(168,0,156,.3);border-radius:10px;padding:14px;background:rgba(168,0,156,.04);display:flex;flex-direction:column;gap:10px}
      .pbx-step-k{font-size:11px;font-weight:700;letter-spacing:.06em;color:var(--cu-accent-ink)}
      .pbx-step-t{font-size:14px;font-weight:600}
      .pbx-row{display:flex;gap:8px;flex-wrap:wrap}
      .pbx-big{height:40px;padding:0 16px;font-size:13.5px}
      .pbx-locked{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;background:var(--cu-bg2);font-size:12.5px;color:var(--cu-t2)}
      .pbx-posting{padding:12px 14px;border-radius:10px;background:var(--cu-bg2);display:flex;flex-direction:column;gap:4px;font-size:13px;line-height:1.5;color:var(--cu-t2)}
      .pbx-posting b{color:var(--cu-t1);font-size:14px;display:flex;align-items:center;gap:8px}
      .pbx-notes{border-top:1px solid var(--cu-bd);padding:6px 16px 12px}
      .pbx-notes.first{border-top:none;padding-top:12px}
      .pbx-notes-btn{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 4px;margin-left:-4px;border:none;border-radius:6px;background:transparent;color:var(--cu-t2);font:500 13px Inter,system-ui,sans-serif;cursor:pointer;text-align:left}
      .pbx-notes-btn:hover{color:var(--cu-t1);background:var(--cu-bg3)}
      .pbx-modal{position:fixed;inset:0;z-index:1000;background:rgba(10,10,14,.45);display:flex;align-items:center;justify-content:center;padding:16px}
      .pbx-card{width:min(620px,100%);max-height:88vh;overflow:auto;background:var(--cu-bg);color:var(--cu-t1);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.25)}
      .pbx-card-hd{display:flex;align-items:center;gap:8px;padding:12px 14px 12px 18px;border-bottom:1px solid var(--cu-bd);position:sticky;top:0;background:var(--cu-bg)}
      .pbx-ver{padding:14px 18px;border-bottom:1px solid var(--cu-bd);display:flex;flex-direction:column;gap:8px;font-size:13px}
      .pbx-ver-imgs{display:flex;gap:6px;flex-wrap:wrap}
      .pbx-ver-imgs img{width:72px;height:90px;object-fit:cover;border-radius:6px;border:1px solid var(--cu-bd)}
      .pbx-due{display:flex;flex-direction:column;gap:8px;margin:2px 0 14px;padding:12px 14px;border-radius:12px;background:#fff8f3;border:1px solid #f0d3bd}
      html.dark .pbx-due{background:rgba(180,83,9,.12);border-color:rgba(251,191,36,.28)}
      .pbx-due-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px}
      .pbx-badge{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:6px;background:#b45309;color:#fff;font-size:11px;font-weight:700;letter-spacing:.03em}
      .pbx-badge.make{background:var(--cu-accent-ink)}
      .pbx-due-main{display:flex;align-items:center;gap:10px}
      .pbx-due-main>i{font-size:22px;color:#b45309}
      .pbx-due-main b{display:block;font-size:15px}
      .pbx-due-main small{display:block;font-size:12.5px;color:var(--cu-t2)}
      .pbx-left{margin-left:auto;font-size:12.5px;font-weight:600;color:#9a3f06;white-space:nowrap}
      .pbx-left.late{color:#b42318}
      html.dark .pbx-left{color:#fbbf24}
      .pbx-pin{display:none}
      .pcc{display:flex;flex-direction:column;gap:10px;font-size:13px}
      .pcc-note{font-size:12px;color:var(--cu-t2);line-height:1.45}
      .pcc-msg{padding:9px 11px;border-radius:10px;background:var(--cu-bg);border:1px solid var(--cu-bd);line-height:1.5}
      .pcc-msg.cl{background:rgba(255,0,238,.07);border-color:rgba(168,0,156,.2)}
      .pcc-hd{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--cu-t2);margin-bottom:3px;flex-wrap:wrap}
      .pcc-hd b{color:var(--cu-t1)}
      .pcc-msg.cl .pcc-hd b{color:var(--cu-accent-ink)}
      .pcc-tag{font-size:9.5px;font-weight:700;letter-spacing:.04em;padding:1px 6px;border-radius:8px;background:rgba(168,0,156,.12);color:var(--cu-accent-ink)}
      .pcc-body{white-space:pre-wrap;word-break:break-word}
      .pcc-att{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,80px));gap:5px;margin-top:6px}
      .pcc-att a{display:block;aspect-ratio:1/1;border-radius:6px;overflow:hidden;border:1px solid var(--cu-bd)}
      .pcc-att img{width:100%;height:100%;object-fit:cover;display:block}
      .pcc-box{display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--cu-bd);padding-top:10px}
      .pcc-box textarea{width:100%;min-height:64px;padding:8px 10px;border:1px solid var(--cu-bd2);border-radius:8px;background:var(--cu-bg);color:var(--cu-t1);font:13px/1.5 Inter,system-ui,sans-serif;resize:vertical}
      .pcc-box textarea:focus{outline:none;border-color:var(--cu-accent)}
      .pbx button:focus-visible,.pbx a:focus-visible,.pbx select:focus-visible,.pbx input:focus-visible,.pbx-pin button:focus-visible,.pcc button:focus-visible,.pbx-due button:focus-visible{outline:2px solid var(--cu-accent);outline-offset:2px}
      @media(max-width:760px){
        .pbx-hd{padding:10px 12px}
        .pbx-steps{margin:0;width:100%}
        .pbx-body{padding:14px 12px;gap:18px}
        .pbx-l,.pbx-r{flex:1 1 100%}
        .pbx-frame{margin:0 -12px;border-radius:0;border-left:none;border-right:none;box-shadow:none}
        .pbx-media .cu-post-th{max-height:none}
        .pbx-cap textarea{font-size:15px}
        .pbx-dl{grid-template-columns:108px minmax(0,1fr)}
        .pbx-sel,.pbx-date{height:38px}
        .pbx-notes{padding:6px 12px 12px}
        .pbx-pad{padding:12px 12px 0}
        .pbx-pin{display:block;position:fixed;left:0;right:0;bottom:0;z-index:950;padding:10px 16px calc(12px + env(safe-area-inset-bottom,0px));background:var(--cu-bg);border-top:1px solid var(--cu-bd);box-shadow:0 -8px 24px rgba(20,20,30,.1)}
        .pbx-pin button{width:100%;height:50px;font-size:15px}
        .pbx-pin small{display:block;text-align:center;font-size:11.5px;color:var(--cu-t2);margin-bottom:6px}
      }`;
      document.head.appendChild(st);
    }

    // ---- small helpers -----------------------------------------------------
    const ymd = (v) => (v ? String(v).slice(0, 10) : '');
    const asDay = (v) => { const s = ymd(v); return s ? new Date(s + 'T00:00:00') : null; };
    const dayFmt = (v, o) => { const x = asDay(v); return x && !isNaN(x) ? x.toLocaleDateString('en-IN', o || { weekday: 'short', day: 'numeric', month: 'short' }) : ''; };
    const timeFmt = (t) => {
      if (!t || !/^\d{1,2}:\d{2}/.test(String(t))) return '';
      const [H, M] = String(t).slice(0, 5).split(':').map(Number);
      const x = new Date(); x.setHours(H, M, 0, 0);
      return x.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).replace(/\s?(am|pm)$/i, (m) => ' ' + m.trim().toUpperCase());
    };
    const myUser = (u) => { if (u && (u.role_level || u.name)) return u; try { return JSON.parse(localStorage.getItem('ams_user') || 'null') || {}; } catch (_) { return {}; } };
    const isPriv = (u) => ['admin', 'manager'].includes(myUser(u).role_level);
    const typeLabel = (t) => { const x = POST_TYPES.find(p => p.key === t); return x ? x.label : (t ? t[0].toUpperCase() + t.slice(1) : 'Post'); };
    const initials = (s) => String(s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
    const STAGE_OF = { briefed: 'make', in_production: 'make', revision: 'make', in_review: 'review', review: 'review', sent_to_client: 'client', approved: 'publish', completed: 'publish', scheduled: 'publish', missed: 'publish', posted: 'live' };
    const STEPS = [
      { k: 'make', done: 'Made', now: 'Making' },
      { k: 'review', done: 'Checked', now: 'Team check' },
      { k: 'client', done: 'Client approved', now: 'With client' },
      { k: 'publish', done: 'Scheduled', now: 'Publish' },
      { k: 'live', done: 'Live', now: 'Live' },
    ];
    const stageOf = (st) => STAGE_OF[st] || 'make';
    const copy = async (text) => {
      try { await navigator.clipboard.writeText(text); return true; }
      catch (_) {
        try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; } catch (__) { return false; }
      }
    };

    // The brand's display bits (handle, colour, phone). A column list, never select=*.
    const clientCache = {};
    function useClient(id) {
      const [c, setC] = useState(id ? clientCache[id] || null : null);
      useEffect(() => {
        if (!id) { setC(null); return undefined; }
        if (clientCache[id]) { setC(clientCache[id]); return undefined; }
        let stop = false;
        const cols = 'id,name,instagram_handle,brand_color_primary,contact_phone';
        const req = SB_URL && sbHeaders
          ? fetch(SB_URL + '/rest/v1/clients?select=' + cols + '&id=eq.' + id, { headers: sbHeaders() }).then(r => (r.ok ? r.json() : []))
          : Promise.resolve([]);
        req.then(rows => { const r = rows && rows[0]; if (r) { clientCache[id] = r; if (!stop) setC(r); } }).catch(() => { });
        return () => { stop = true; };
      }, [id]);
      return c;
    }

    // ---- an inline field that saves on blur --------------------------------
    function Field({ value, onSave, placeholder, multiline, rows, disabled, type, id }) {
      const [v, setV] = useState(value == null ? '' : String(value));
      const [busy, setBusy] = useState(false);
      const last = useRef(value == null ? '' : String(value));
      useEffect(() => {
        const next = value == null ? '' : String(value);
        if (next !== last.current) { last.current = next; setV(next); }
      }, [value]);
      const commit = async () => {
        if (v === last.current || busy) return;
        const prev = last.current;
        last.current = v;
        setBusy(true);
        try { await onSave(v === '' ? null : v); }
        catch (e) { last.current = prev; setV(prev); }
        finally { setBusy(false); }
      };
      const common = {
        id, class: 'pf-in' + (multiline ? ' pf-ta' : ''), value: v, placeholder: placeholder || 'Empty',
        disabled: !!(disabled || busy),
        onInput: (e) => setV(e.target.value),
        onBlur: commit,
        onKeyDown: (e) => {
          if (e.key === 'Escape') { setV(last.current); e.target.blur(); }
          if (e.key === 'Enter' && !multiline) e.target.blur();
        },
      };
      return multiline
        ? h`<textarea ...${common} rows=${rows || 2}></textarea>`
        : h`<input ...${common} type=${type || 'text'}/>`;
    }

    // ---- reference links (newline-separated in content.reference_links) -----
    const refChip = (r) => {
      let host = '';
      try { host = new URL(r).hostname.replace(/^www\./, ''); } catch (e) { return { label: r, icon: 'ti-note', url: null }; }
      if (/(^|\.)instagram\.com$/.test(host)) return { label: /\/reel/.test(r) ? 'Instagram reel' : 'Instagram post', icon: 'ti-brand-instagram', url: r };
      if (/pinterest\.|pinimg\.com$|(^|\.)pin\.it$/.test(host)) return { label: 'Pinterest', icon: 'ti-brand-pinterest', url: r };
      if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return { label: 'YouTube', icon: 'ti-brand-youtube', url: r };
      if (/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(host)) return { label: 'Google Drive', icon: 'ti-brand-google-drive', url: r };
      return { label: host, icon: 'ti-link', url: r };
    };
    function RefLinks({ value, onSave, disabled }) {
      const refs = String(value || '').split('\n').map(s => s.trim()).filter(Boolean);
      const [adding, setAdding] = useState(false);
      const [draft, setDraft] = useState('');
      const add = async () => {
        const t = draft.trim();
        setDraft(''); setAdding(false);
        if (!t) return;
        await onSave(refs.concat(t).join('\n') || null);
      };
      const remove = async (i) => { const next = refs.slice(); next.splice(i, 1); await onSave(next.length ? next.join('\n') : null); };
      return h`<div class="pf-refbar">
        <span class="lbl"><i class="ti ti-bookmark" aria-hidden="true"></i>References</span>
        ${refs.map((r, i) => { const c = refChip(r); return h`<span class="pf-chip" key=${r + i} title=${r}>
          <i class=${'ti ' + c.icon} aria-hidden="true"></i>
          ${c.url ? h`<a href=${c.url} target="_blank" rel="noopener">${c.label}</a>` : h`<span>${c.label}</span>`}
          ${!disabled && h`<button type="button" class="pf-x" aria-label=${'Remove ' + c.label} title="Remove" onClick=${() => remove(i)}><i class="ti ti-x"></i></button>`}
        </span>`; })}
        ${adding
          ? h`<input class="pf-refin" autoFocus aria-label="Reference link" placeholder="Paste a link and press Enter" value=${draft}
                onInput=${e => setDraft(e.target.value)} onBlur=${add}
                onKeyDown=${e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setDraft(''); setAdding(false); } }}/>`
          : (!disabled && h`<button type="button" class="pf-refadd" onClick=${() => setAdding(true)}><i class="ti ti-plus" aria-hidden="true"></i>Add</button>`)}
      </div>`;
    }

    // ---- reads and saves one post, shared by the sections below -------------
    function usePostRow(props) {
      const task = props.task || (props.detail && props.detail.task) || {};
      const showToast = props.showToast;
      const currentUser = props.currentUser;
      const cid = task.content_id;

      const [row, setRow] = useState(null);      // null = loading, false = failed
      const [conflict, setConflict] = useState(null);
      const lockedAt = useRef(null);

      const load = useCallback(async () => {
        if (!cid) return;
        try {
          const rows = await db('content', `&id=eq.${cid}`);
          const r = rows && rows[0];
          if (r) { setRow(r); lockedAt.current = r.updated_at || null; }
          else setRow(false);
        } catch (e) { setRow(false); }
      }, [cid]);
      useEffect(() => { load(); }, [load]);
      // The task changed elsewhere (upload, status, publish): read the post again.
      const stamp = task.updated_at || null;
      const seen = useRef(stamp);
      useEffect(() => { if (stamp !== seen.current) { seen.current = stamp; load(); } }, [stamp, load]);

      // If someone else wrote after our last read, refuse rather than silently overwrite them.
      const stale = async () => {
        if (!lockedAt.current) return null;
        try {
          const rows = await db('content', `&id=eq.${cid}&select=updated_at,updated_by`);
          const cur = rows && rows[0];
          if (!cur || !cur.updated_at) return null;
          const them = new Date(cur.updated_at).getTime();
          const mine = new Date(lockedAt.current).getTime();
          if (them - mine > 1500 && cur.updated_by && cur.updated_by !== (currentUser && currentUser.name)) {
            return { by: cur.updated_by, at: cur.updated_at };
          }
        } catch (e) { /* a transient read failure must not block the save */ }
        return null;
      };

      const saveMany = async (patch, quiet) => {
        const clash = await stale();
        if (clash) { setConflict(clash); throw new Error('conflict'); }
        setRow(r => (r ? { ...r, ...patch } : r));
        try {
          const res = await rpcCall('content_update', { p_id: cid, p_patch: patch });
          const fresh = Array.isArray(res) ? res[0] : null;
          lockedAt.current = (fresh && fresh.updated_at) || new Date().toISOString();
          if (fresh) setRow(fresh);
          setConflict(null);
          if (showToast && !quiet) showToast('Saved');
          return fresh;
        } catch (e) {
          await load();                       // put the true server value back
          if (showToast) showToast('Could not save — ' + String((e && (e.message || e.code)) || 'unknown'));
          throw e;
        }
      };
      const save = (key, value, quiet) => saveMany({ [key]: value }, quiet);

      return { cid, row, save, saveMany, load, conflict, setConflict };
    }

    const conflictNote = (p) => p.conflict && h`<div class="pf-warn" role="alert">
      <i class="ti ti-alert-triangle" style=${{ fontSize: 15, marginTop: 1 }}></i>
      <div><strong>${p.conflict.by}</strong> edited this post after you opened it. Your change was not saved —
      <button type="button" class="pf-x" style=${{ color: 'inherit', textDecoration: 'underline' }}
        onClick=${() => { p.setConflict(null); p.load(); }}>reload the latest</button> and try again.</div>
    </div>`;

    // ---- references, at the top of the task ---------------------------------
    function PostRefsSection(props) {
      const p = usePostRow(props);
      if (!p.cid || !p.row) return null;
      return h`<div>
        ${conflictNote(p)}
        <${RefLinks} value=${p.row.reference_links} onSave=${v => p.save('reference_links', v)}/>
      </div>`;
    }

    // ---- notes for the team (the old full editor's brief fields) -------------
    const POST_EXTRAS = [
      { key: 'designer_notes', label: 'Designer', icon: 'ti-palette', placeholder: 'Layout, colours, design style…', multiline: true },
      { key: 'editor_notes', label: 'Editor', icon: 'ti-scissors', placeholder: 'Shots, pace, music, transitions…', multiline: true },
      { key: 'production_notes', label: 'Shoot', icon: 'ti-video', placeholder: 'Shoot / production notes', multiline: true },
      { key: 'content_pillar', label: 'Pillar', icon: 'ti-columns', placeholder: 'e.g. Awareness, Offer' },
      { key: 'post_link', label: 'Live post', icon: 'ti-external-link', placeholder: 'Live post URL', type: 'url' },
    ];
    function NotesForTeam({ row, save, defaultOpen, first }) {
      const filled = POST_EXTRAS.filter(x => String(row[x.key] == null ? '' : row[x.key]).trim() !== '');
      const [open, setOpen] = useState(!!defaultOpen);
      const label = 'Notes for the team' + (filled.length ? ' · ' + filled.map(x => x.label).join(' · ') : '');
      return h`<div class=${'pbx-notes' + (first ? ' first' : '')}>
        <button type="button" class="pbx-notes-btn" aria-expanded=${open} onClick=${() => setOpen(o => !o)}>
          <i class=${'ti ' + (open ? 'ti-chevron-up' : 'ti-chevron-down')} aria-hidden="true"></i>${label}</button>
        ${open ? h`<div class="pf-grid">
          ${POST_EXTRAS.map(x => h`<div class="pf-row" key=${x.key}>
            <label class="pf-k" for=${'pf-' + x.key + '-' + row.id}><i class=${'ti ' + x.icon} aria-hidden="true"></i>${x.label}</label>
            <div class="pf-v"><${Field} id=${'pf-' + x.key + '-' + row.id} value=${row[x.key]} multiline=${!!x.multiline} type=${x.type} placeholder=${x.placeholder} onSave=${v => save(x.key, v)}/></div>
          </div>`)}
        </div>` : null}
      </div>`;
    }

    // ---- the caption, edited inside the live view ----------------------------
    function CaptionEditor({ row, save, showToast, plat }) {
      const [v, setV] = useState(row.caption || '');
      const [ai, setAi] = useState(false);
      const focused = useRef(false);
      const last = useRef(row.caption || '');
      useEffect(() => {
        const next = row.caption || '';
        if (!focused.current && next !== last.current) { last.current = next; setV(next); }
      }, [row.caption]);
      const commit = async () => {
        focused.current = false;
        if (v === last.current) return;
        const prev = last.current; last.current = v;
        try { await save('caption', v === '' ? null : v); } catch (e) { last.current = prev; setV(prev); }
      };
      const rewrite = async () => {
        if (!generatePostCaption || ai) return;
        setAi(true);
        let res = null;
        try { res = await generatePostCaption(row.id); } catch (_) { }
        setAi(false);
        if (res && res.ok && res.caption) {
          last.current = res.caption; setV(res.caption);
          try { await save('caption', res.caption, true); } catch (_) { return; }
          const how = res.kind === 'text' ? 'Caption written from the brief (no file found)' : res.watched ? 'Caption written — the reel was watched in full' : 'Caption written — edit it if needed';
          if (showToast) showToast(res.warning || res.notes ? how + ' · ' + (res.warning || res.notes) : how);
        } else {
          const msg = { nothing_to_caption: 'add a file, a title or the brief first', drive_not_shared: 'share the Drive folder with the dashboard first', unauthorized: 'your session expired — sign in again' }[res && res.error] || (res && res.error) || 'try again';
          if (showToast) showToast('Caption failed — ' + msg);
        }
      };
      const n = v.length;
      const id = 'pbx-cap-' + row.id;
      return h`<div class="pbx-cap">
        <label for=${id}><i class="ti ti-pencil" aria-hidden="true"></i>Caption — edit it right here</label>
        <textarea id=${id} value=${v} disabled=${ai} placeholder="Write the caption… hashtags go at the end"
          onFocus=${() => { focused.current = true; }} onInput=${e => setV(e.target.value)} onBlur=${commit}></textarea>
        <div class="pbx-hint bar">${plat === 'youtube' ? 'The first line becomes the Short’s title.' : plat === 'facebook' ? 'Facebook shows about 3 lines before “See more”.' : 'Followers see the first 2 lines before “… more” — keep the hook there.'}</div>
        <div class="pbx-capbar">
          ${generatePostCaption ? h`<button type="button" class="cu-btn" style=${{ height: 30 }} onClick=${rewrite} disabled=${ai}
              title="Reads the file on Drive and the brand’s caption notes, then writes the caption">
            ${ai ? h`<i class="ti ti-loader-2 cu-spin" aria-hidden="true"></i>${row.type === 'reel' ? 'Watching the reel…' : 'Reading the file…'}` : h`<i class="ti ti-sparkles" style=${{ color: 'var(--cu-accent-ink)' }} aria-hidden="true"></i>${v ? 'Rewrite with AI' : 'Write with AI'}`}
          </button>` : null}
          <button type="button" class="cu-btn" style=${{ height: 30, padding: '0 9px' }} aria-label="Copy caption" title="Copy caption"
            onClick=${async () => { const ok = await copy(v); if (showToast) showToast(ok ? 'Caption copied' : 'Could not copy'); }}><i class="ti ti-copy" aria-hidden="true"></i></button>
          <span class=${'pbx-count' + (n > 2200 ? ' over' : '')}>${n.toLocaleString('en-IN') + ' / 2,200'}</span>
        </div>
      </div>`;
    }

    // ---- live view: the file as Instagram / Facebook / YouTube will show it ---
    function LiveView({ task, row, client, save, showToast, PostThumb, onVersions }) {
      const isVideo = row.type === 'reel';
      const plats = [['instagram', 'Instagram'], ['facebook', 'Facebook']].concat(isVideo ? [['youtube', 'YouTube']] : []);
      const [plat, setPlat] = useState('instagram');
      const [igView, setIgView] = useState('feed');
      const tall = row.type === 'story' || plat === 'youtube' || (plat === 'instagram' && isVideo && igView === 'reels');
      const name = (client && client.name) || task.client_name || 'Brand';
      const handle = client && client.instagram_handle ? String(client.instagram_handle).replace(/^@/, '').trim() : name.toLowerCase().replace(/[^a-z0-9._]+/g, '');
      const color = (client && client.brand_color_primary) || '#1d3b6e';
      const when = [dayFmt(row.post_date), timeFmt(row.posting_time)].filter(Boolean).join(' · ');
      const round = Number(row.revision_round) || 0;
      const layout = (parts) => h`<div class="pbx-l">
        <div class="pbx-tabs">
          <div class="pbx-plat" role="tablist" aria-label="Live view as">
            ${plats.map(([k, l]) => h`<button key=${k} type="button" role="tab" aria-selected=${plat === k} onClick=${() => setPlat(k)}>${l}</button>`)}
          </div>
          ${plat === 'instagram' && isVideo ? h`<div class="pbx-view" role="group" aria-label="Instagram view">
            <button type="button" aria-pressed=${igView === 'feed'} onClick=${() => setIgView('feed')}>Feed</button>
            <button type="button" aria-pressed=${igView === 'reels'} onClick=${() => setIgView('reels')}>Reels</button>
          </div>` : null}
        </div>
        <div class="pbx-frame" style=${{ '--pbx-ar': tall ? '9 / 16' : '4 / 5' }}>
          <div class="pbx-fh">
            <span class=${'pbx-av ' + (plat === 'instagram' ? 'ig' : 'fb')} style=${{ background: color }} aria-hidden="true">${initials(name)}</span>
            <div class="pbx-fn">
              <b>${plat === 'facebook' ? name : plat === 'youtube' ? '@' + handle : handle}</b>
              <span>${plat === 'facebook' ? h`<${Fragment}>${when || 'Not scheduled'} · <i class="ti ti-world" aria-hidden="true"></i><//>` : plat === 'youtube' ? 'Shorts' : (isVideo && igView === 'reels' ? 'Reels' : (round ? 'Round ' + (round + 1) : 'Live view'))}</span>
            </div>
            ${plat !== 'facebook' && when ? h`<span class="pbx-hint">${when}</span>` : null}
          </div>
          <div class="pbx-media">${parts.tile}</div>
          ${plat === 'instagram' ? h`<div class="pbx-icons" aria-hidden="true"><i class="ti ti-heart"></i><i class="ti ti-message-circle"></i><i class="ti ti-send"></i><span style=${{ flex: 1 }}></span><i class="ti ti-bookmark"></i></div>`
            : plat === 'facebook' ? h`<div class="pbx-icons fb" aria-hidden="true"><span><i class="ti ti-thumb-up"></i>Like</span><span><i class="ti ti-message-circle"></i>Comment</span><span><i class="ti ti-share-3"></i>Share</span></div>`
            : null}
          <${CaptionEditor} row=${row} save=${save} showToast=${showToast} plat=${plat}/>
        </div>
        ${parts.notes}
        ${parts.waiting}
        <div class="pbx-tools" id=${'pbx-tools-' + row.id}>${parts.tools}</div>
        <div class="pbx-links">
          ${parts.refresh ? h`<button type="button" class="pbx-link" onClick=${parts.refresh} title="Use this if the file on Drive was changed"><i class="ti ti-refresh" aria-hidden="true"></i>Refresh preview</button>` : null}
          ${parts.link ? h`<a class="pbx-link" href=${parts.link} target="_blank" rel="noopener"><i class="ti ti-brand-google-drive" aria-hidden="true"></i>Open in Drive</a>` : null}
          ${round > 0 ? h`<button type="button" class="pbx-link" onClick=${onVersions}><i class="ti ti-stack-2" aria-hidden="true"></i>Earlier rounds</button>` : null}
        </div>
        ${parts.viewer}
      </div>`;
      return h`<${PostThumb} key=${row.id} task=${task} layout=${layout}/>`;
    }

    // ---- earlier rounds (content_versions, written by migration 209) ---------
    function VersionsDialog({ cid, onClose }) {
      const [list, setList] = useState(null);
      useEffect(() => {
        db('content_versions', `&post_id=eq.${cid}&order=revision_round.desc&limit=20`).then(r => setList(Array.isArray(r) ? r : [])).catch(() => setList([]));
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
      }, [cid]);
      return h`<div class="pbx-modal" onClick=${e => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="pbx-card" role="dialog" aria-modal="true" aria-labelledby=${'pbv-' + cid}>
          <div class="pbx-card-hd"><h3 id=${'pbv-' + cid} style=${{ margin: 0, fontSize: 15, flex: 1 }}>Rounds sent to the client</h3>
            <button type="button" class="cu-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button></div>
          ${list === null ? h`<div class="pbx-ver">Loading…</div>` : !list.length ? h`<div class="pbx-ver">No rounds saved yet.</div>`
            : list.map(v => h`<div class="pbx-ver" key=${v.id}>
              <div style=${{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b>Round ${(Number(v.revision_round) || 0) + 1}</b>
                <span class="pbx-hint">${v.sent_at ? new Date(v.sent_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}${v.triggered_by ? ' · sent by ' + v.triggered_by : ''}</span>
              </div>
              ${v.client_remarks ? h`<div class="pbx-changes"><div class="pbx-changes-k">This round answered</div>“${v.client_remarks}”</div>` : null}
              ${Array.isArray(v.preview_urls) && v.preview_urls.length ? h`<div class="pbx-ver-imgs">${v.preview_urls.slice(0, 6).map((u, i) => h`<a key=${i} href=${u} target="_blank" rel="noopener"><img src=${u} alt=${'Round ' + ((Number(v.revision_round) || 0) + 1) + ' image ' + (i + 1)} loading="lazy"/></a>`)}</div>`
                : v.video_thumbnail_url ? h`<div class="pbx-ver-imgs"><img src=${v.video_thumbnail_url} alt="Reel cover"/></div>` : null}
              ${v.caption ? h`<div style=${{ whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--cu-t2)' }}>${v.caption}</div>` : null}
            </div>`)}
        </div>
      </div>`;
    }

    // ---- which monthly deliverable the post counts toward --------------------
    function ScopePicker({ row, saveMany, privileged, currentUser, clientName, showToast }) {
      const [items, setItems] = useState(null);
      useEffect(() => {
        if (!row.client_id || !ensureScopeInstance) { setItems([]); return undefined; }
        let stop = false;
        ensureScopeInstance(row.client_id).then(inst => { if (!stop) setItems(Array.isArray(inst && inst.line_items) ? inst.line_items : []); })
          .catch(() => { if (!stop) setItems([]); });
        return () => { stop = true; };
      }, [row.client_id]);
      if (items === null) return h`<span class="pbx-hint">Loading…</span>`;
      const cur = items.find(it => it.id === row.scope_line_item_id);
      const label = row.is_out_of_scope ? 'Not in the contract' : cur ? cur.name + (cur.quantity ? ' · ' + cur.quantity + ' ' + (cur.unit || '') + ' a month' : '') : 'Not linked';
      if (!privileged || !items.length) {
        return h`<span class=${row.is_out_of_scope ? 'pbx-warn' : ''}>${items.length ? label : 'No scope set up for this brand'}</span>`;
      }
      const onPick = async (v) => {
        const me = myUser(currentUser);
        try {
          if (v === '__oos') {
            const patch = { is_out_of_scope: true, scope_line_item_id: null, out_of_scope_by: me.name || null, out_of_scope_at: new Date().toISOString() };
            const fresh = await saveMany(patch, true);
            if (showToast) showToast('Marked as not in the contract');
            if (handleOosMarked) handleOosMarked({ ...row, ...patch, ...(fresh || {}) }, me, clientName);
          } else {
            await saveMany({ scope_line_item_id: v || null, is_out_of_scope: false, out_of_scope_by: null, out_of_scope_at: null }, true);
            if (showToast) showToast(v ? 'Linked to the deliverable' : 'Unlinked');
          }
        } catch (_) { }
      };
      return h`<select class="pbx-sel" aria-label="Counts toward" value=${row.is_out_of_scope ? '__oos' : (row.scope_line_item_id || '')} onChange=${e => onPick(e.target.value)}>
        <option value="">Not linked</option>
        ${items.map(it => h`<option key=${it.id} value=${it.id}>${it.name}${it.quantity ? ' (' + it.quantity + ' ' + (it.unit || '') + ')' : ''}</option>`)}
        <option value="__oos">Not in the contract (extra work)</option>
      </select>`;
    }

    // ---- the post's details --------------------------------------------------
    const APPROVAL = { pending: ['Waiting for the client', 'pbx-warn'], approved: ['Approved', 'pbx-ok'], revision: ['Asked for changes', 'pbx-bad'] };
    function Details({ task, row, save, saveMany, privileged, currentUser, client, showToast, compact }) {
      const [brand, setBrand] = useState(false);
      const clientName = (client && client.name) || task.client_name || '';
      const lead = row.task_given_date && row.post_date && ymd(row.task_given_date) < ymd(row.post_date)
        ? Math.round((asDay(row.post_date) - asDay(row.task_given_date)) / 864e5) : 0;
      const appr = APPROVAL[row.client_approval || 'pending'] || APPROVAL.pending;
      const setApproval = async (v) => {
        try { await save('client_approval', v, true); } catch (_) { return; }
        if (showToast) showToast('Client approval: ' + (APPROVAL[v] || APPROVAL.pending)[0]);
        if (notifyContent) {
          const actor = myUser(currentUser).name || 'Someone';
          const title = row.title || task.title || 'a post';
          const lbl = { pending: 'Pending', approved: 'Approved', revision: 'Revision requested' }[v] || v;
          notifyContent({ actor, assignee: row.assigned_to || row.planned_assignee, title: 'Client approval: ' + lbl, message: actor + ' set client approval to ' + lbl + ' on "' + title + '"', type: v === 'approved' ? 'approval' : v === 'revision' ? 'revision' : 'info', clientName, postTitle: title, postId: row.id, key: 'client_approval' });
        }
      };
      const whenText = [dayFmt(row.post_date), timeFmt(row.posting_time)].filter(Boolean).join(' · ') || 'Not set';
      return h`<${Fragment}>
        <dl class="pbx-dl">
          <dt>Type</dt>
          <dd>${privileged ? h`<select class="pbx-sel" aria-label="Post type" value=${row.type || ''} onChange=${e => save('type', e.target.value)}>
              ${POST_TYPES.map(t => h`<option key=${t.key} value=${t.key}>${t.label}</option>`)}
            </select>` : typeLabel(row.type)}</dd>
          <dt>Goes live</dt>
          <dd>${privileged ? h`<${Fragment}>
              <input class="pbx-date" type="date" aria-label="Posting date" value=${ymd(row.post_date)} onChange=${e => save('post_date', e.target.value || null)}/>
              <input class="pbx-date" type="time" aria-label="Posting time" value=${row.posting_time ? String(row.posting_time).slice(0, 5) : ''} onChange=${e => save('posting_time', e.target.value || null)}/>
            <//>` : whenText}</dd>
          ${row.task_given_date ? h`<${Fragment}><dt>Made on</dt><dd>${dayFmt(row.task_given_date)} · ready by 7 PM${lead ? h`<span class="pbx-hint">${'(' + lead + (lead === 1 ? ' day' : ' days') + ' before)'}</span>` : null}</dd><//>` : null}
          <dt>Client</dt>
          <dd>${privileged ? h`<select class="pbx-sel" aria-label="Client approval" value=${row.client_approval || 'pending'} onChange=${e => setApproval(e.target.value)}>
              <option value="pending">Waiting for the client</option><option value="approved">Approved</option><option value="revision">Asked for changes</option>
            </select>` : h`<span class=${appr[1]}>${appr[0]}</span>`}</dd>
          ${!compact ? h`<${Fragment}><dt>Counts toward</dt><dd><${ScopePicker} row=${row} saveMany=${saveMany} privileged=${privileged} currentUser=${currentUser} clientName=${clientName} showToast=${showToast}/></dd><//>` : null}
          ${BrandGuidelines && row.client_id ? h`<${Fragment}><dt>Brand guide</dt><dd><button type="button" class="pbx-link" onClick=${() => setBrand(true)}><i class="ti ti-book-2" aria-hidden="true"></i>${'Open ' + (clientName || 'the brand') + ' guide'}</button></dd><//>` : null}
          ${row.post_link ? h`<${Fragment}><dt>Live post</dt><dd><a class="pbx-link" href=${row.post_link} target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i>View post</a></dd><//>` : null}
        </dl>
        ${brand ? h`<${BrandGuidelines} clientId=${row.client_id} clientName=${clientName} onClose=${() => setBrand(false)}/>` : null}
      <//>`;
    }

    // ---- what the client asked for -------------------------------------------
    function ClientChanges({ row, forMaker }) {
      const txt = String(row.client_remarks || '').trim();
      if (!txt) return null;
      const open = row.client_approval === 'revision' || row.workflow_status === 'revision';
      const round = (Number(row.revision_round) || 0) + 1;
      const k = open ? (forMaker ? 'What to change — the client asked' : 'Client asked for changes on round ' + round) : 'Client’s last changes · done';
      return h`<div class=${'pbx-changes' + (open ? ' open' : '')} role=${open ? 'note' : null}>
        <div class="pbx-changes-k">${k}</div>“${txt}”</div>`;
    }

    // ---- Send on WhatsApp: the real file(s) + the no-login review link (migration 210) ------------
    // post_review_link makes the post's private link (https://approvals.mydigitalsevak.in/r/<token>); the
    // post-review Edge Function serves the review page and the files. Two taps: the first gets the
    // files from Drive, the second opens the share sheet (the browser only allows sharing straight
    // from a tap, and a reel can take longer than that to download).
    const REVIEW_FN = String(SB_URL || 'https://api.mydigitalsevak.in').replace(/\/+$/, '') + '/functions/v1/post-review/';
    // Clients see approvals.mydigitalsevak.in (Caddy on the VPS sends /r/* to post-review); old api.…/r/ links still work.
    const REVIEW_SHORT = 'https://approvals.mydigitalsevak.in/r/';
    const reviewTokens = {};
    async function reviewTokenFor(postId) {
      if (reviewTokens[postId]) return reviewTokens[postId];
      const r = await rpcCall('post_review_link', { p_post_id: postId });
      const tok = typeof r === 'string' ? r : (Array.isArray(r) ? r[0] : (r && (r.post_review_link || r.token)));
      if (!tok) throw new Error('no link');
      reviewTokens[postId] = String(tok);
      return reviewTokens[postId];
    }
    async function reviewLinkFor(postId) { return REVIEW_SHORT + await reviewTokenFor(postId); }
    const waPhone = (p) => { let d = String(p || '').replace(/[^\d]/g, ''); if (d.length === 11 && d[0] === '0') d = d.slice(1); if (d.length === 10) d = '91' + d; return d; };
    const mb = (n) => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB';
    // A reel goes to WhatsApp as its cover picture only, dimmed with a play button and "watch & approve
    // on the link" — so the client has to open the review page to watch it and answers there.
    async function reelPoster(blob) {
      const bmp = await createImageBitmap(blob);
      const w = bmp.width, hgt = bmp.height, m = Math.min(w, hgt);
      const c = document.createElement('canvas'); c.width = w; c.height = hgt;
      const x = c.getContext('2d');
      x.drawImage(bmp, 0, 0);
      x.fillStyle = 'rgba(0,0,0,.38)'; x.fillRect(0, 0, w, hgt);
      const r = m * 0.13, cx = w / 2, cy = hgt / 2 - m * 0.04;
      x.fillStyle = 'rgba(255,255,255,.94)'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#ff00ee'; x.beginPath();
      x.moveTo(cx - r * 0.32, cy - r * 0.45); x.lineTo(cx + r * 0.5, cy); x.lineTo(cx - r * 0.32, cy + r * 0.45); x.closePath(); x.fill();
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'top';
      x.font = '700 ' + Math.round(m * 0.06) + 'px -apple-system, "Segoe UI", Roboto, sans-serif';
      x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = m * 0.02;
      x.fillText('Tap the link to watch', cx, cy + r + m * 0.06);
      x.fillText('& approve', cx, cy + r + m * 0.135);
      return await new Promise(res => c.toBlob(b => res(b || blob), 'image/jpeg', 0.9));
    }

    function WhatsAppSend({ task, row, client, showToast, load, primary }) {
      const [phase, setPhase] = useState('idle'); // idle | prep | ready | sharing
      const [pct, setPct] = useState(0);
      const [pack, setPack] = useState(null);     // { files: File[], link, text }
      const toast = (m) => { if (showToast) showToast(m); };
      const clientName = (client && client.name) || task.client_name || 'the client';
      useEffect(() => { setPhase('idle'); setPack(null); }, [row.id, row.drive_link]);

      const prepare = async () => {
        if (phase === 'prep') return;
        setPhase('prep'); setPct(0);
        try {
          const tok = await reviewTokenFor(row.id);
          const list = await fetch(REVIEW_FN + tok + '?files=1').then(r => r.json());
          if (!list || !list.ok) throw new Error((list && list.error) || 'files');
          const metas = list.files || [];
          const isReel = row.type === 'reel';
          const total = isReel ? 0 : metas.reduce((s, f) => s + (Number(f.size) || 0), 0);
          let got = 0;
          const files = [];
          // File names carry the posting date (Drive automation) — the client gets neutral names.
          const base = String(clientName).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'post';
          const ext = (f) => { const m = String(f.name || '').match(/\.[a-z0-9]{2,5}$/i); return m ? m[0] : ''; };
          if (isReel && metas.length) {
            const res = await fetch(REVIEW_FN + tok + '?thumb=0&s=1280');
            const ct = res.headers.get('content-type') || '';
            if (res.ok && ct.startsWith('image/')) {
              const raw = await res.blob();
              let pic = raw;
              try { pic = await reelPoster(raw); } catch (_) { }
              files.push(new File([pic], base + ' reel preview.jpg', { type: pic.type || 'image/jpeg' }));
            }
          }
          for (const f of (isReel ? [] : metas)) {
            const res = await fetch(f.url);
            if (!res.ok || !res.body) throw new Error('Drive said ' + res.status);
            const reader = res.body.getReader();
            const parts = [];
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              parts.push(value); got += value.length;
              if (total) setPct(Math.min(99, Math.round(got * 100 / total)));
            }
            files.push(new File(parts, base + (metas.length > 1 ? ' ' + (files.length + 1) : '') + ext(f), { type: f.mime || 'application/octet-stream' }));
          }
          // Only the review link — no title, date or time: posting days move around.
          const text = 'Hi ' + clientName + ', a new ' + typeLabel(row.type).toLowerCase() + ' is ready for your review 👇\n\n'
            + (isReel ? 'Tap to watch it and approve or ask for changes (no login needed):\n' : 'Tap to approve or ask for changes (no login needed):\n') + list.link;
          setPack({ files, link: list.link, text, isReel });
          setPhase('ready');
          if (!metas.length) toast('No file found in the Drive link — sending the review link only');
          else if (isReel && !files.length) toast('No reel thumbnail from Drive yet — sending the review link only');
        } catch (e) {
          setPhase('idle');
          toast('Could not get the files — ' + String((e && e.message) || 'try again'));
        }
      };

      const markSent = async () => {
        const st = row.workflow_status;
        if (!(st === 'in_review' || st === 'review')) return;
        try {
          await rpcCall('content_update', { p_id: row.id, p_patch: { workflow_status: 'sent_to_client' } });
          if (generatePostPreview) generatePostPreview(row.id).then(() => load()).catch(() => { });
          if (taskBus && task.id) taskBus.emit('task:changed', { id: task.id });
          await load();
          toast('Marked as sent to ' + clientName + ' — their answer will show up here');
        } catch (e) { toast('Shared, but could not mark it sent — ' + String((e && (e.message || e.code)) || 'set the status by hand')); }
      };

      const fallback = () => {
        pack.files.forEach(f => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(f); a.download = f.name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        });
        const digits = waPhone(client && client.contact_phone);
        window.open((digits ? 'https://wa.me/' + digits : 'https://wa.me/') + '?text=' + encodeURIComponent(pack.text), '_blank', 'noopener,noreferrer');
        if (pack.files.length) toast(pack.files.length === 1 ? 'File downloaded — drag it into the WhatsApp chat' : pack.files.length + ' files downloaded — drag them into the WhatsApp chat');
      };

      const share = async () => {
        if (!pack || phase === 'sharing') return;
        const files = pack.files;
        const canFiles = files.length && navigator.canShare && (() => { try { return navigator.canShare({ files }); } catch (_) { return false; } })();
        if (canFiles) {
          setPhase('sharing');
          try { await navigator.share({ files, text: pack.text }); }
          catch (e) {
            setPhase('ready');
            if (e && e.name === 'AbortError') return;          // they closed the share sheet
            fallback(); await markSent(); return;
          }
          setPhase('ready');
          await markSent();
          return;
        }
        fallback();
        await markSent();
      };

      if (phase === 'prep') {
        return h`<div class="pbx-row"><button type="button" class=${'cu-btn' + (primary ? ' cu-btn-pri pbx-big' : '')} disabled>
          <i class="ti ti-loader-2 cu-spin" aria-hidden="true"></i>${'Getting the file from Drive… ' + (pct ? pct + '%' : '')}</button></div>`;
      }
      if (phase === 'ready' || phase === 'sharing') {
        const n = pack ? pack.files.length : 0;
        const size = pack ? pack.files.reduce((s, f) => s + f.size, 0) : 0;
        return h`<div class="pbx-row" style=${{ flexWrap: 'wrap' }}>
          <button type="button" class="cu-btn cu-btn-pri pbx-big" style=${{ background: '#25D366', borderColor: '#25D366' }} onClick=${share} disabled=${phase === 'sharing'}>
            <i class="ti ti-brand-whatsapp" aria-hidden="true"></i>Open WhatsApp</button>
          <span class="pbx-hint" style=${{ margin: 0 }}>${pack && pack.isReel ? (n ? 'Reel thumbnail + review link ready' : 'Review link ready') : n ? (n === 1 ? '1 file' : n + ' files') + ' ready · ' + mb(size) : 'Review link ready'}</span>
        </div>`;
      }
      return h`<div class="pbx-row"><button type="button" class=${'cu-btn' + (primary ? ' cu-btn-pri pbx-big' : '')} onClick=${prepare}>
        <i class="ti ti-brand-whatsapp" style=${primary ? null : { color: '#25D366' }} aria-hidden="true"></i>${primary ? 'Send on WhatsApp' : 'Send on WhatsApp again'}</button></div>`;
    }

    // ---- the next step for admins / managers -----------------------------------
    function NextStep({ task, row, client, showToast, load }) {
      const [busy, setBusy] = useState(false);
      const st = row.workflow_status;
      const clientName = (client && client.name) || task.client_name || 'the client';
      const maker = row.assigned_to || row.planned_assignee || '';
      const copyLink = async () => {
        try {
          const link = await reviewLinkFor(row.id);
          const ok = await copy(link);
          if (showToast) showToast(ok ? 'Review link copied — opens without a login' : link);
        } catch (e) { if (showToast) showToast('Could not make the link — ' + String((e && (e.message || e.code)) || 'try again')); }
      };
      if (st === 'in_review' || st === 'review') {
        const send = async () => {
          if (busy) return;
          setBusy(true);
          try {
            await rpcCall('content_update', { p_id: row.id, p_patch: { workflow_status: 'sent_to_client' } });
            if (generatePostPreview) generatePostPreview(row.id).then(() => load()).catch(() => { });
            if (taskBus && task.id) taskBus.emit('task:changed', { id: task.id });
            await load();
            if (showToast) showToast('Sent to ' + clientName + ' — they’ve been told on their phone');
          } catch (e) {
            if (showToast) showToast('Could not send — ' + String((e && (e.message || e.code)) || 'try again'));
          } finally { setBusy(false); }
        };
        return h`<div class="pbx-step">
          <div class="pbx-step-k">NEXT STEP</div>
          <div class="pbx-step-t">${maker ? maker + ' handed it in. Check it, then send it to the client.' : 'Check it, then send it to the client.'}</div>
          <${WhatsAppSend} task=${task} row=${row} client=${client} showToast=${showToast} load=${load} primary=${true}/>
          <div class="pbx-row"><button type="button" class="cu-btn" onClick=${send} disabled=${busy}>
            <i class=${'ti ' + (busy ? 'ti-loader-2 cu-spin' : 'ti-send')} aria-hidden="true"></i>${busy ? 'Sending…' : 'Send to portal only'}</button>
            <button type="button" class="cu-btn" onClick=${copyLink}><i class="ti ti-link" aria-hidden="true"></i>Copy review link</button></div>
          <div class="pbx-hint">WhatsApp sends the file (a reel goes as its thumbnail only, so they watch it on the link) plus a review link that opens without a login — no posting date is shared — the client taps Approve or Ask for changes and it’s saved here. Not right? Use “Send back for changes” under the preview.</div>
        </div>`;
      }
      if (st === 'sent_to_client') {
        return h`<div class="pbx-step">
          <div class="pbx-step-k">WITH THE CLIENT</div>
          <div class="pbx-step-t">Waiting for ${clientName} to approve round ${(Number(row.revision_round) || 0) + 1}.</div>
          <${WhatsAppSend} task=${task} row=${row} client=${client} showToast=${showToast} load=${load} primary=${false}/>
          <div class="pbx-row">
            <button type="button" class="cu-btn" onClick=${copyLink}><i class="ti ti-link" aria-hidden="true"></i>Copy review link</button>
          </div>
        </div>`;
      }
      return null;
    }

    // ---- publishing ----------------------------------------------------------
    function PublishArea({ task, row, currentUser, showToast, load }) {
      const stage = stageOf(row.workflow_status);
      if (!(stage === 'publish' || stage === 'live')) {
        return h`<div class="pbx-locked"><i class="ti ti-lock" aria-hidden="true"></i>Publishing opens once the client approves.</div>`;
      }
      if (typeof PublishSection !== 'function') return null;
      const onPublished = () => {
        load();
        if (!task.id || !taskBus) return;
        rpcCall('task_get', { p_id: task.id })
          .then(r => { const t = r && r.task; if (t && t.id) taskBus.emit('task:changed', { id: t.id, row: t }); })
          .catch(() => { });
      };
      return h`<${PublishSection} post=${row} fields=${row} currentUser=${myUser(currentUser)} showToast=${showToast} onPublished=${onPublished}/>`;
    }
    // A maker's view of posting: one line, nothing to do.
    function PostingLine({ row }) {
      const when = [dayFmt(row.post_date), timeFmt(row.posting_time)].filter(Boolean).join(', ');
      if (row.workflow_status === 'posted') {
        return h`<div class="pbx-posting"><b><i class="ti ti-circle-check pbx-ok" aria-hidden="true"></i>Posted</b>
          ${row.post_link ? h`<a class="pbx-link" href=${row.post_link} target="_blank" rel="noopener">View the live post</a>` : null}</div>`;
      }
      return h`<div class="pbx-posting"><b><i class="ti ti-lock" aria-hidden="true"></i>Posting</b>
        <span>${when ? 'Goes live ' + when + '. ' : ''}The manager posts it after the client approves — nothing for you to do here.</span></div>`;
    }

    // ---- phone: the maker's Upload button, pinned until they reach the file ----
    function MobilePin({ cid, label }) {
      const [show, setShow] = useState(false);
      useEffect(() => {
        let io = null, timer = null;
        const start = () => {
          const box = document.getElementById('pbx-tools-' + cid);
          if (!box || typeof IntersectionObserver !== 'function') { timer = setTimeout(start, 700); return; }
          io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top > 0 && !!box.querySelector('.du-btn')), { threshold: 0 });
          io.observe(box);
        };
        start();
        return () => { clearTimeout(timer); if (io) io.disconnect(); };
      }, [cid]);
      if (!show) return null;
      const go = () => { const b = document.querySelector('#pbx-tools-' + cid + ' .du-btn'); if (b) b.click(); };
      return h`<div class="pbx-pin"><small>Goes to your manager for review and leaves your To Do</small>
        <button type="button" class="cu-btn cu-btn-pri" onClick=${go}><i class="ti ti-cloud-upload" aria-hidden="true"></i>${label}</button></div>`;
    }

    // ---- the Post box ----------------------------------------------------------
    function PostBox(props) {
      const task = props.task || {};
      const p = usePostRow(props);
      const client = useClient(task.client_id);
      const [versions, setVersions] = useState(false);
      const toast = toastOf(props);
      if (!p.cid) return null;
      const row = p.row;
      if (row === null) return h`<div class="pbx"><div class="pbx-hd"><h2><i class="ti ti-photo" aria-hidden="true"></i>Post</h2></div><div class="pbx-body pbx-hint">Loading the post…</div></div>`;
      if (row === false) return h`<div class="pbx"><div class="pbx-hd"><h2><i class="ti ti-photo" aria-hidden="true"></i>Post</h2></div><div class="pbx-body pbx-hint">This post couldn’t be loaded.</div></div>`;
      const me = myUser(props.currentUser);
      const privileged = isPriv(me);
      const stage = stageOf(row.workflow_status);
      const si = STEPS.findIndex(s => s.k === stage);
      const steps = h`<ol class="pbx-steps" aria-label="Where this post is">
        ${STEPS.map((s, i) => h`<${Fragment} key=${s.k}>
          ${i ? h`<li class="sep" aria-hidden="true"></li>` : null}
          <li class=${i < si || (stage === 'live' && i === si) ? 'done' : i === si ? 'now' : ''} aria-current=${i === si ? 'step' : null}>
            ${i < si || (stage === 'live' && i === si) ? h`<i class="ti ti-check" aria-hidden="true"></i>` : null}
            ${i < si ? s.done : i === si ? (row.workflow_status === 'scheduled' ? 'Scheduled' : row.workflow_status === 'revision' ? 'Changes asked' : s.now) : s.now}
          </li>
        <//>`)}
      </ol>`;
      const live = h`<${LiveView} task=${task} row=${row} client=${client} save=${p.save} showToast=${toast} PostThumb=${props.PostThumb} onVersions=${() => setVersions(true)}/>`;
      const details = h`<${Details} task=${task} row=${row} save=${p.save} saveMany=${p.saveMany} privileged=${privileged} currentUser=${me} client=${client} showToast=${toast} compact=${!privileged}/>`;
      const hasNotes = POST_EXTRAS.some(x => x.key !== 'post_link' && String(row[x.key] == null ? '' : row[x.key]).trim() !== '');
      const makeLabel = row.workflow_status === 'revision' ? 'Upload the new version' : row.drive_link ? 'Replace file' : (row.type === 'carousel' ? 'Upload slides' : 'Upload final');

      return h`<section class="pbx" aria-labelledby=${'pbx-h-' + row.id}>
        <div class="pbx-hd"><h2 id=${'pbx-h-' + row.id}><i class="ti ti-photo" aria-hidden="true"></i>Post</h2>${steps}</div>
        ${p.conflict ? h`<div class="pbx-pad">${conflictNote(p)}</div>` : null}
        ${privileged
          ? h`<${Fragment}>
              <div class="pbx-body">
                ${live}
                <div class="pbx-r">
                  <${NextStep} task=${task} row=${row} client=${client} showToast=${toast} load=${p.load}/>
                  ${details}
                  <${ClientChanges} row=${row}/>
                  <${PublishArea} task=${task} row=${row} currentUser=${me} showToast=${toast} load=${p.load}/>
                </div>
              </div>
              <${NotesForTeam} row=${row} save=${p.save} defaultOpen=${false}/>
            <//>`
          : h`<${Fragment}>
              ${String(row.client_remarks || '').trim() ? h`<div class="pbx-pad"><${ClientChanges} row=${row} forMaker=${true}/></div>` : null}
              <${NotesForTeam} row=${row} save=${p.save} defaultOpen=${hasNotes} first=${true}/>
              <div class="pbx-body">
                ${live}
                <div class="pbx-r">
                  ${details}
                  <${PostingLine} row=${row}/>
                </div>
              </div>
              ${stage === 'make' ? h`<${MobilePin} cid=${row.id} label=${makeLabel}/>` : null}
            <//>`}
        ${versions ? h`<${VersionsDialog} cid=${row.id} onClose=${() => setVersions(false)}/>` : null}
      </section>`;
    }

    // ---- the maker's deadline card, under the title ----------------------------
    const MAKE_STATUSES = ['briefed', 'in_production', 'revision', 'todo', 'to_do', 'open', 'in_progress'];
    function MakerDue({ task }) {
      const [now, setNow] = useState(() => Date.now());
      useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
      const post = task.post || {};
      if (!MAKE_STATUSES.includes(task.status)) return null;
      let due = task.due_at ? new Date(task.due_at) : null;
      if ((!due || isNaN(due)) && post.task_given_date) { due = asDay(post.task_given_date); if (due) due.setHours(19, 0, 0, 0); }
      const revision = task.status === 'revision';
      const today = new Date(now); today.setHours(0, 0, 0, 0);
      let dueText = 'No deadline set', leftText = '', late = false;
      if (due && !isNaN(due)) {
        const dd = new Date(due); dd.setHours(0, 0, 0, 0);
        const days = Math.round((dd - today) / 864e5);
        const day = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days === -1 ? 'yesterday' : due.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
        const hasTime = task.due_has_time !== false;
        dueText = 'Ready by ' + day + (hasTime ? ', ' + due.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).replace(/\s?(am|pm)$/i, m => ' ' + m.trim().toUpperCase()) : '');
        const ms = due.getTime() - now;
        late = ms < 0;
        const hrs = Math.abs(ms) / 36e5;
        const span = hrs < 1 ? Math.max(1, Math.round(hrs * 60)) + ' min' : hrs < 48 ? Math.round(hrs) + ' h' : Math.round(hrs / 24) + ' days';
        leftText = late ? 'Late by ' + span : span + ' left';
      }
      const when = [dayFmt(post.post_date), timeFmt(post.posting_time)].filter(Boolean).join(', ');
      return h`<div class="pbx-due" role="note" aria-label="Your deadline">
        <div class="pbx-due-top">
          <span class=${'pbx-badge' + (revision ? '' : ' make')}>${revision ? 'CHANGES ASKED' : 'TO MAKE'}</span>
          ${task.created_by_name ? h`<span style=${{ color: 'var(--cu-t2)' }}>Assigned by ${task.created_by_name}</span>` : null}
        </div>
        <div class="pbx-due-main">
          <i class="ti ti-clock-hour-4" aria-hidden="true"></i>
          <div style=${{ minWidth: 0 }}><b>${dueText}</b><small>${typeLabel(post.type) + (when ? ' · goes live ' + when : '')}</small></div>
          ${leftText ? h`<span class=${'pbx-left' + (late ? ' late' : '')}>${leftText}</span>` : null}
        </div>
      </div>`;
    }

    // ---- Client chat: the two-way thread with the brand (post_comments) --------
    function ClientChat(props) {
      const task = props.task || {};
      const cid = task.content_id;
      const client = useClient(task.client_id);
      const clientName = (client && client.name) || task.client_name || 'the client';
      const toast = toastOf(props);
      const me = myUser(props.currentUser);
      const [list, setList] = useState(null);
      const [txt, setTxt] = useState('');
      const [busy, setBusy] = useState(false);
      const endRef = useRef(null);
      useEffect(() => {
        if (!cid) return undefined;
        let stop = false, ch = null;
        db('post_comments', `&post_id=eq.${cid}&order=created_at.asc`).then(r => { if (!stop) setList(Array.isArray(r) ? r : []); }).catch(() => { if (!stop) setList([]); });
        if (supabase && supabase.channel) {
          try {
            ch = supabase.channel('pcc-' + cid + '-' + Math.random().toString(36).slice(2, 7))
              .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_comments', filter: 'post_id=eq.' + cid },
                (pl) => setList(cs => { const a = cs || []; return pl && pl.new && !a.find(x => x.id === pl.new.id) ? a.concat(pl.new) : a; }))
              .subscribe();
          } catch (_) { ch = null; }
        }
        return () => { stop = true; try { if (ch) supabase.removeChannel(ch); } catch (_) { } };
      }, [cid]);
      useEffect(() => { if (endRef.current && endRef.current.scrollIntoView) endRef.current.scrollIntoView({ block: 'nearest' }); }, [list && list.length]);
      const send = async () => {
        const body = txt.trim();
        if (!body || busy || !dbInsert) return;
        setBusy(true);
        try {
          const rows = await dbInsert('post_comments', [{ post_id: cid, author: me.name || 'Team', author_kind: 'staff', body }]);
          const r = Array.isArray(rows) ? rows[0] : null;
          if (r) setList(cs => { const a = cs || []; return a.find(x => x.id === r.id) ? a : a.concat(r); });
          setTxt('');
          const title = task.title || 'a post';
          const preview = body.length > 140 ? body.slice(0, 140) + '…' : body;
          if (insertNotif && client && client.name) insertNotif(client.name, '💬 New comment from your team', 'On "' + title + '": ' + preview, 'info', client.name, title, 'content', cid);
        } catch (e) { toast('Could not send — try again'); }
        finally { setBusy(false); }
      };
      if (!cid) return null;
      const fmtAt = (v) => { try { return new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (_) { return ''; } };
      return h`<div class="pcc">
        <div class="pcc-note">Talks straight to ${clientName} — your reply goes to their phone. Team comments stay inside the office.</div>
        ${list === null ? h`<div class="pcc-note">Loading…</div>` : !list.length ? h`<div class="pcc-note" style=${{ fontStyle: 'italic' }}>No messages with the client yet.</div>` : null}
        ${(list || []).map(c => { const atts = Array.isArray(c.attachments) ? c.attachments : []; const cl = c.author_kind === 'client'; return h`<div key=${c.id} class=${'pcc-msg' + (cl ? ' cl' : '')}>
          <div class="pcc-hd"><b>${c.author || (cl ? clientName : 'Team')}</b>${cl ? h`<span class="pcc-tag">CLIENT</span>` : null}<span>${fmtAt(c.created_at)}</span></div>
          ${c.body ? h`<div class="pcc-body">${c.body}</div>` : null}
          ${atts.length ? h`<div class="pcc-att">${atts.map((u, i) => h`<a key=${i} href=${u} target="_blank" rel="noopener"><img src=${u} alt=${'Attachment ' + (i + 1)} loading="lazy"/></a>`)}</div>` : null}
        </div>`; })}
        <div ref=${endRef}></div>
        <div class="pcc-box">
          <label for=${'pcc-' + cid} style=${{ fontSize: 12, fontWeight: 600, color: 'var(--cu-t2)' }}>Reply to ${clientName}</label>
          <textarea id=${'pcc-' + cid} value=${txt} placeholder="Write a reply… (Ctrl+Enter to send)" onInput=${e => setTxt(e.target.value)}
            onKeyDown=${e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}></textarea>
          <div style=${{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" class="cu-btn cu-btn-pri" onClick=${send} disabled=${busy || !txt.trim()}>
              <i class=${'ti ' + (busy ? 'ti-loader-2 cu-spin' : 'ti-send')} aria-hidden="true"></i>Send to client</button>
          </div>
        </div>
      </div>`;
    }

    // ---- registrations (consumers read AMS_EXT at render time) -------------
    const isPost = (t) => !!(t && t.type === 'post' && t.content_id);
    // Publishing and the caption used to be two separate sections; they live in the Post box now.
    ['post_publish', 'post_fields'].forEach(id => { EXT.taskPanelSections = (EXT.taskPanelSections || []).filter(x => (x.id || x.key) !== id); });

    reg('postBox', { id: 'postbox', Component: PostBox });

    reg('taskPanelSections', {
      id: 'post_refs', title: 'References', icon: 'ti-bookmark', order: 5, placement: 'top',
      when: isPost,
      Component: (p) => h`<${PostRefsSection} ...${p}/>`,
    });

    reg('taskPanelSections', {
      id: 'post_due', title: 'Deadline', icon: 'ti-clock', order: 1, placement: 'head',
      when: (t) => isPost(t) && !isPriv(null),
      Component: MakerDue,
    });

    reg('taskPanelSections', {
      id: 'post_client_chat', title: 'Client chat', icon: 'ti-messages', order: 1, placement: 'side',
      when: isPost,
      Component: ClientChat,
    });

    return { PostBox, ClientChat };
  }

  window.AMS_POSTS = { buildPosts };
})();

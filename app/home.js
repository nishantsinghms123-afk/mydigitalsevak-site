/* ============================================================================
 * home.js — ClickUp-parity Home: customizable card dashboard, My Work pages,
 * Inbox, Replies and Assigned Comments.
 *
 *   window.AMS_HOME.buildHome(deps) →
 *     { HomeDashboard, MyWorkPage, InboxPage, RepliesPage,
 *       AssignedCommentsPage, CARD_LIBRARY }
 *
 * Spec: docs/clickup-parity-contract.md §6.3 (+ §1 design, §4 shapes, §5 RPCs).
 * Built from index.html's shared bridge (single React instance, hooks-safe —
 * same pattern as messages.js). All task data comes through tasks.js exports
 * (TaskAPI / useTasks / useTaskStore) injected in `deps`.
 * ==========================================================================*/
(function () {
  function buildHome(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo,
            rpcCall, db, Av, Skel, fmtRelative, isPrivilegedRole, NOTIF_ICONS,
            NotesPanel, PublishQueue, OnboardingInProgressCard, SEOReportsDueCard,
            TaskAPI, taskBus, useTaskStore, useTasks, PRIORITIES, TYPE_META,
            isOverdue, isDone, openTask, openCreateTask,
            Popover, Menu, StatusIcon, PriorityFlag, AssigneeStack, DueChip,
            ClientBadge, TypeIcon, MemberAvatar, EmptyState, SectionCard,
            DatePicker, TaskViews } = deps;

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-home-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-home-styles';
      st.textContent = `
      .ch-page{padding:24px;box-sizing:border-box;min-height:100%;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px}
      .ch-page *,.ch-modal *,.ch-pop *{box-sizing:border-box}
      .ch-page :focus-visible,.ch-modal :focus-visible,.ch-pop :focus-visible{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:1px}
      .ch-head{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:16px}
      .ch-greet{font:600 22px/1.25 Inter,system-ui,sans-serif;margin:0;color:var(--cu-t1,#1f1f23)}
      .ch-ptitle{font:600 18px/1.3 Inter,system-ui,sans-serif;margin:0;color:var(--cu-t1,#1f1f23);display:flex;align-items:center;gap:8px}
      .ch-date{font-size:13px;color:var(--cu-t3,#8e8e99);margin-top:3px}
      .ch-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .ch-muted{color:var(--cu-t3,#8e8e99);font-size:12px}
      .ch-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:var(--cu-radius-sm,6px);border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:600 13px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
      .ch-btn:hover{background:var(--cu-bg3,#efeff1)}
      .ch-btn:disabled{opacity:.5;cursor:not-allowed}
      .ch-btn.pri{background:var(--cu-accent,#ff00ee);border-color:var(--cu-accent,#ff00ee);color:#fff}
      .ch-btn.pri:hover{filter:brightness(.94)}
      .ch-btn.on{background:var(--cu-accent-fog,rgba(255,0,238,.08));border-color:var(--cu-accent,#ff00ee);color:var(--cu-accent-ink,#a8009c)}
      .ch-btn.sm{height:26px;padding:0 8px;font-size:12px}
      .ch-btn .ch-badge{background:var(--cu-accent,#ff00ee);color:#fff;border-radius:9px;font-size:10.5px;min-width:17px;height:17px;display:inline-flex;align-items:center;justify-content:center;padding:0 4px}
      .ch-ibtn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--cu-radius-sm,6px);border:0;background:transparent;color:var(--cu-t2,#5c5c66);cursor:pointer;flex-shrink:0;font-size:16px}
      .ch-ibtn:hover{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23)}
      .ch-link{background:none;border:0;padding:0;color:var(--cu-accent-ink,#a8009c);font:600 12px Inter,system-ui,sans-serif;cursor:pointer}
      .ch-link:hover{text-decoration:underline}
      .ch-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:start}
      .ch-cell{min-width:0;border-radius:var(--cu-radius,8px);position:relative}
      .ch-cell.w2{grid-column:span 2}.ch-cell.w3{grid-column:span 3}
      .ch-cell.edit{outline:1.5px dashed var(--cu-bd2,#d6d6db);outline-offset:3px}
      .ch-cell.dragging{opacity:.4}
      .ch-cell.dropt{outline:2px dashed var(--cu-accent,#ff00ee);outline-offset:3px}
      @media(max-width:1100px){.ch-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ch-cell.w3{grid-column:span 2}}
      @media(max-width:760px){.ch-grid{grid-template-columns:minmax(0,1fr)}.ch-cell.w2,.ch-cell.w3{grid-column:span 1}}
      .ch-card{background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);display:flex;flex-direction:column;min-width:0}
      .ch-card-hd{display:flex;align-items:center;gap:6px;padding:10px 10px 8px 14px;min-height:44px}
      .ch-card-t{font:600 15px/1.3 Inter,system-ui,sans-serif;color:var(--cu-t1,#1f1f23);display:flex;align-items:center;gap:8px;min-width:0;flex:1}
      .ch-card-t>span.nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ch-card-sub{font-size:12px;font-weight:500;color:var(--cu-t3,#8e8e99)}
      .ch-card-bd{padding:0 8px 10px;max-height:380px;overflow:auto;min-height:60px}
      .ch-card-bd.tall{max-height:none}
      .ch-handle{cursor:grab;color:var(--cu-t3,#8e8e99)}
      .ch-seg{display:inline-flex;border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius-sm,6px);overflow:hidden}
      .ch-seg button{border:0;background:var(--cu-bg,#fff);color:var(--cu-t2,#5c5c66);font:600 11px Inter,system-ui,sans-serif;width:24px;height:24px;cursor:pointer}
      .ch-seg button+button{border-left:1px solid var(--cu-bd,#e8e8eb)}
      .ch-seg button.on{background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c)}
      .ch-tabs{display:flex;gap:18px;border-bottom:1px solid var(--cu-bd,#e8e8eb);padding:0 6px;margin-bottom:6px;overflow-x:auto;scrollbar-width:none}
      .ch-tab{background:none;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;padding:8px 0;font:500 13px Inter,system-ui,sans-serif;color:var(--cu-t2,#5c5c66);cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
      .ch-tab:hover{color:var(--cu-t1,#1f1f23)}
      .ch-tab.on{color:var(--cu-t1,#1f1f23);font-weight:600;border-bottom-color:var(--cu-accent,#ff00ee)}
      .ch-tab .n{font-size:11px;font-weight:600;background:var(--cu-bg3,#efeff1);color:var(--cu-t2,#5c5c66);border-radius:9px;padding:1px 6px}
      .ch-tab.on .n{background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c)}
      .ch-grp{margin-top:2px}
      .ch-grp-hd{display:flex;align-items:center;gap:6px;width:100%;background:none;border:0;padding:6px;font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t2,#5c5c66);cursor:pointer;border-radius:var(--cu-radius-sm,6px);text-align:left}
      .ch-grp-hd:hover{background:var(--cu-bg2,#f7f7f8)}
      .ch-grp-hd .chev{transition:transform .15s;font-size:13px}
      .ch-grp-hd.closed .chev{transform:rotate(-90deg)}
      .ch-grp-hd .cnt{color:var(--cu-t3,#8e8e99);font-weight:500}
      .ch-row{display:flex;align-items:center;gap:8px;min-height:36px;padding:3px 8px;border-radius:var(--cu-radius-sm,6px);cursor:pointer;min-width:0}
      .ch-row:hover{background:var(--cu-bg3,#efeff1)}
      .ch-row-t{flex:1;min-width:0;font-size:13px;color:var(--cu-t1,#1f1f23);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ch-row-meta{display:flex;align-items:center;gap:8px;flex-shrink:0}
      .ch-row .ch-doneb{background:none;border:0;padding:0;cursor:pointer;display:inline-flex;border-radius:50%}
      .ch-row.done .ch-row-t{color:var(--cu-t3,#8e8e99);text-decoration:line-through}
      @media(max-width:520px){.ch-row-meta .ch-hide-sm{display:none}}
      .ch-add{display:flex;align-items:center;gap:8px;padding:0 8px;height:34px;border-radius:var(--cu-radius-sm,6px);color:var(--cu-t3,#8e8e99)}
      .ch-add input{flex:1;border:0;background:transparent;font:13px Inter,system-ui,sans-serif;color:var(--cu-t1,#1f1f23);outline:none;min-width:0}
      .ch-add:focus-within{background:var(--cu-bg2,#f7f7f8);box-shadow:inset 0 0 0 1px var(--cu-accent,#ff00ee)}
      .ch-input{width:100%;height:32px;border:1px solid var(--cu-bd2,#d6d6db);border-radius:var(--cu-radius-sm,6px);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);padding:0 10px;font:13px Inter,system-ui,sans-serif}
      .ch-input:focus{border-color:var(--cu-accent,#ff00ee);outline:none}
      .ch-label{display:block;font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3,#8e8e99);margin:10px 0 5px}
      .ch-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:26px 14px;color:var(--cu-t3,#8e8e99)}
      .ch-empty i{font-size:26px;opacity:.7}
      .ch-empty .t{font-size:13px;font-weight:600;color:var(--cu-t2,#5c5c66)}
      .ch-err{display:flex;align-items:center;gap:8px;padding:14px;font-size:12px;color:var(--cu-t2,#5c5c66)}
      .ch-err i{color:#e5484d;font-size:16px}
      .ch-sk{height:30px;border-radius:6px;margin:6px;background:linear-gradient(90deg,var(--cu-bg2,#f7f7f8),var(--cu-bg3,#efeff1),var(--cu-bg2,#f7f7f8));background-size:200% 100%;animation:chsk 1.2s infinite}
      @keyframes chsk{0%{background-position:200% 0}100%{background-position:-200% 0}}
      .ch-stat{display:flex;align-items:center;gap:10px;padding:8px;border-radius:var(--cu-radius-sm,6px)}
      .ch-stat .dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
      .ch-stat .lbl{flex:1;font-size:13px;color:var(--cu-t2,#5c5c66)}
      .ch-stat .val{font:600 18px Inter,system-ui,sans-serif;color:var(--cu-t1,#1f1f23);font-variant-numeric:tabular-nums}
      .ch-sec{font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3,#8e8e99);padding:10px 8px 4px}
      .ch-pill{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;border-radius:9px;padding:1px 7px;white-space:nowrap}
      .ch-bar{height:8px;background:var(--cu-bg3,#efeff1);border-radius:4px;overflow:hidden;display:flex}
      .ch-bar>span{display:block;height:100%}
      .ch-wl{display:grid;grid-template-columns:minmax(0,130px) minmax(0,1fr) auto;gap:10px;align-items:center;padding:6px 8px;border-radius:var(--cu-radius-sm,6px);cursor:pointer}
      .ch-wl:hover{background:var(--cu-bg3,#efeff1)}
      .ch-wl .nm{display:flex;align-items:center;gap:7px;min-width:0;font-size:13px}
      .ch-wl .nm span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ch-wl .num{font-size:12px;color:var(--cu-t2,#5c5c66);font-variant-numeric:tabular-nums;white-space:nowrap}
      .ch-ag{position:relative;padding:4px 4px 4px 0}
      .ch-ag-item{display:grid;grid-template-columns:62px 16px minmax(0,1fr);align-items:start;cursor:pointer;border-radius:var(--cu-radius-sm,6px)}
      .ch-ag-item:hover .ch-ag-body{background:var(--cu-bg3,#efeff1)}
      .ch-ag-time{font-size:11.5px;color:var(--cu-t3,#8e8e99);text-align:right;padding:9px 8px 0 0;font-variant-numeric:tabular-nums;white-space:nowrap}
      .ch-ag-rail{position:relative;align-self:stretch}
      .ch-ag-rail:before{content:'';position:absolute;left:7px;top:0;bottom:0;width:1px;background:var(--cu-bd,#e8e8eb)}
      .ch-ag-rail i{position:absolute;left:3px;top:12px;width:9px;height:9px;border-radius:50%;border:2px solid var(--cu-bg,#fff)}
      .ch-ag-body{padding:6px 8px;border-radius:var(--cu-radius-sm,6px);min-width:0}
      .ch-ag-body .t{font-size:13px;color:var(--cu-t1,#1f1f23);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px}
      .ch-ag-body .m{font-size:11.5px;color:var(--cu-t3,#8e8e99);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ch-donut{display:flex;align-items:center;gap:18px;padding:8px;flex-wrap:wrap;justify-content:center}
      .ch-legend{display:flex;flex-direction:column;gap:6px;min-width:140px;flex:1}
      .ch-legend div{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--cu-t2,#5c5c66)}
      .ch-legend b{margin-left:auto;color:var(--cu-t1,#1f1f23);font-weight:600;font-variant-numeric:tabular-nums}
      .ch-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
      .ch-two{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:12px;align-items:start}
      @media(max-width:1000px){.ch-two{grid-template-columns:minmax(0,1fr)}}
      .ch-pop{background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14));font:13px Inter,system-ui,sans-serif}
      .ch-pop-fb{position:absolute;z-index:300;top:100%;left:0;margin-top:4px;min-width:200px}
      .ch-mi{display:flex;align-items:center;gap:8px;width:100%;height:32px;padding:0 10px;border:0;background:none;color:var(--cu-t1,#1f1f23);font:13px Inter,system-ui,sans-serif;cursor:pointer;border-radius:var(--cu-radius-sm,6px);text-align:left}
      .ch-mi:hover{background:var(--cu-bg3,#efeff1)}
      .ch-mi.danger{color:#e5484d}
      .ch-mi:disabled{opacity:.45;cursor:not-allowed}
      .ch-chk{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:var(--cu-radius-sm,6px);cursor:pointer;font-size:13px}
      .ch-chk:hover{background:var(--cu-bg3,#efeff1)}
      .ch-chk input{accent-color:var(--cu-accent,#ff00ee);margin:0}
      .ch-modal-bg{position:fixed;inset:0;background:rgba(10,10,14,.45);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px}
      .ch-modal{background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);border-radius:var(--cu-radius,8px);box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14));width:min(880px,100%);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;font:13px Inter,system-ui,sans-serif}
      .ch-modal-hd{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--cu-bd,#e8e8eb)}
      .ch-lib{display:flex;min-height:0;flex:1}
      .ch-lib-nav{width:180px;flex-shrink:0;background:var(--cu-bg2,#f7f7f8);border-right:1px solid var(--cu-bd,#e8e8eb);padding:8px;overflow:auto}
      .ch-lib-nav .ch-mi.on{background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c);font-weight:600}
      .ch-lib-main{flex:1;overflow:auto;padding:14px}
      .ch-lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
      .ch-tile{border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);padding:12px;display:flex;flex-direction:column;gap:6px;background:var(--cu-bg,#fff)}
      .ch-tile:hover{border-color:var(--cu-bd2,#d6d6db)}
      .ch-tile .ic{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c);font-size:17px}
      .ch-tile .nm{font-weight:600;font-size:13.5px}
      .ch-tile .ds{font-size:12px;color:var(--cu-t2,#5c5c66);flex:1;line-height:1.4}
      @media(max-width:640px){.ch-lib{flex-direction:column}.ch-lib-nav{width:auto;display:flex;gap:4px;overflow-x:auto;border-right:0;border-bottom:1px solid var(--cu-bd,#e8e8eb)}.ch-lib-nav .ch-mi{width:auto;white-space:nowrap}}
      .ch-ib{border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);background:var(--cu-bg,#fff);overflow:hidden}
      .ch-ib-day{font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3,#8e8e99);padding:10px 16px 6px;background:var(--cu-bg2,#f7f7f8);border-bottom:1px solid var(--cu-bd,#e8e8eb)}
      .ch-ib-row{display:flex;gap:12px;align-items:flex-start;padding:10px 16px;border-bottom:1px solid var(--cu-bd,#e8e8eb);position:relative;cursor:pointer}
      .ch-ib-row:last-child{border-bottom:0}
      .ch-ib-row:hover{background:var(--cu-bg2,#f7f7f8)}
      .ch-ib-ic{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px}
      .ch-ib-main{flex:1;min-width:0}
      .ch-ib-t{font-size:13px;color:var(--cu-t1,#1f1f23);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ch-ib-row.unread .ch-ib-t{font-weight:600}
      .ch-ib-msg{font-size:12.5px;color:var(--cu-t2,#5c5c66);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
      .ch-ib-meta{font-size:11.5px;color:var(--cu-t3,#8e8e99);margin-top:3px}
      .ch-ib-side{display:flex;align-items:center;gap:8px;flex-shrink:0;font-size:11.5px;color:var(--cu-t3,#8e8e99);padding-top:2px}
      .ch-udot{width:8px;height:8px;border-radius:50%;background:var(--cu-accent,#ff00ee);flex-shrink:0}
      .ch-ib-acts{position:absolute;right:12px;top:8px;display:none;gap:2px;background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius-sm,6px);padding:2px;box-shadow:0 2px 6px rgba(15,15,20,.06)}
      .ch-ib-row:hover .ch-ib-acts,.ch-ib-row:focus-within .ch-ib-acts,.ch-ib-acts.pinned{display:flex}
      @media(hover:none),(max-width:520px){.ch-ib-acts{position:static;display:flex;border:0;box-shadow:none;background:transparent;align-self:center}.ch-ib-side .ch-ib-time{display:none}}
      .ch-illo{position:relative;width:96px;height:72px;margin-bottom:8px}
      .ch-illo span{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%}
      .ch-illo .a{width:60px;height:60px;left:18px;top:6px;background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent,#ff00ee);font-size:28px}
      .ch-illo .b{width:26px;height:26px;left:0;top:40px;background:rgba(48,164,108,.14);color:#30a46c;font-size:14px}
      .ch-illo .c{width:22px;height:22px;right:2px;top:0;background:rgba(245,166,35,.16);color:#f5a623;font-size:12px}
      .ch-chip{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border-radius:13px;border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t2,#5c5c66);font:500 12px Inter,system-ui,sans-serif;cursor:pointer}
      .ch-chip.on{border-color:var(--cu-accent,#ff00ee);background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c)}
      .ch-cm-body{font-size:13px;color:var(--cu-t1,#1f1f23);white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .ch-fav{display:flex;align-items:center;gap:8px;min-height:34px;padding:2px 6px 2px 8px;border-radius:var(--cu-radius-sm,6px);cursor:pointer}
      .ch-fav:hover{background:var(--cu-bg3,#efeff1)}
      .ch-fav .x{opacity:0}
      .ch-fav:hover .x,.ch-fav:focus-within .x{opacity:1}
      .ch-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
      .ch-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px;padding:2px 6px 8px}
      .ch-kpi{background:var(--cu-bg2,#f7f7f8);border-radius:6px;padding:8px 10px;min-width:0}
      .ch-kpi .v{font:600 17px Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ch-shorts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;padding:2px 6px 6px}
      .ch-short{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);background:var(--cu-bg,#fff);padding:10px;cursor:pointer;color:var(--cu-t1,#1f1f23);font:13px Inter,system-ui,sans-serif;min-width:0}
      .ch-short:hover{border-color:var(--cu-bd2,#d6d6db);background:var(--cu-bg2,#f7f7f8)}
      .ch-short .ic{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:15px;background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c)}
      .ch-short .nm{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
      .ch-short .ds{font-size:11.5px;color:var(--cu-t3,#8e8e99);line-height:1.35}
      .ch-lu{display:flex;align-items:center;gap:6px;min-height:38px;padding:3px 6px;border-radius:var(--cu-radius-sm,6px);cursor:pointer;min-width:0;position:relative}
      .ch-lu:hover,.ch-lu:focus-within{background:var(--cu-bg3,#efeff1)}
      .ch-lu.dragging{opacity:.4}
      .ch-lu.dropt{box-shadow:inset 0 2px 0 var(--cu-accent,#ff00ee)}
      .ch-lu .num{width:20px;height:20px;border-radius:50%;background:var(--cu-bg3,#efeff1);color:var(--cu-t2,#5c5c66);font:600 11px Inter,system-ui,sans-serif;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
      .ch-lu.first .num{background:var(--cu-accent,#ff00ee);color:#fff}
      .ch-lu .grip{cursor:grab;color:var(--cu-t3,#8e8e99);opacity:0;font-size:14px}
      .ch-lu:hover .grip,.ch-lu:focus-within .grip{opacity:1}
      .ch-lu .acts{display:none;gap:1px}
      .ch-lu:hover .acts,.ch-lu:focus-within .acts{display:inline-flex}
      @media(hover:none){.ch-lu .acts{display:inline-flex}.ch-lu .grip{opacity:1}}
      .ch-srch{max-height:260px;overflow:auto;margin-top:6px}
      .ch-kind{width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
      .ch-draft{display:flex;gap:12px;align-items:flex-start;padding:12px 16px;border-bottom:1px solid var(--cu-bd,#e8e8eb)}
      .ch-draft:last-child{border-bottom:0}
      .ch-draft .pv{font-size:12.5px;color:var(--cu-t2,#5c5c66);margin-top:3px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;word-break:break-word}
      @media(max-width:520px){.ch-draft{flex-wrap:wrap}.ch-draft .ch-tools{width:100%;justify-content:flex-end}}
      @media(max-width:420px){.ch-page{padding:16px}.ch-greet{font-size:19px}}
      .ch-att{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 18px;margin-bottom:16px;border-radius:var(--cu-radius,8px);background:linear-gradient(135deg,#A8009C 0%,#FF00EE 100%);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 10px 28px rgba(255,0,238,.30)}
      .ch-att i.lead{font-size:22px;flex-shrink:0}
      .ch-att .tx{flex:1;min-width:170px}
      .ch-att .tx b{display:block;font:600 15px Inter,system-ui,sans-serif}
      .ch-att .tx span{font-size:12.5px;opacity:.85}
      .ch-att .acts{display:flex;gap:8px;flex-wrap:wrap}
      .ch-att .acts button{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 13px;border-radius:var(--cu-radius-sm,6px);border:1px solid rgba(255,255,255,.55);background:rgba(255,255,255,.14);color:#fff;font:600 13px Inter,system-ui,sans-serif;cursor:pointer}
      .ch-att .acts button:hover{background:rgba(255,255,255,.26)}
      .ch-att .acts button:disabled{opacity:.6;cursor:not-allowed}
      .ch-att.done{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23);border:1px solid var(--cu-bd,#e8e8eb);box-shadow:none}
      .ch-att.done i.lead{color:var(--cu-accent,#ff00ee)}
      .ch-att.done .tx span{color:var(--cu-t3,#8e8e99);opacity:1}
      @media(prefers-reduced-motion:reduce){.ch-page *,.ch-modal *,.ch-pop *{transition:none!important;animation:none!important}}
      `;
      document.head.appendChild(st);
    }

    // ---- small utils -------------------------------------------------------
    const noop = () => {};
    const uid = () => 'c' + Math.random().toString(36).slice(2, 9);
    const arr = (x) => (Array.isArray(x) ? x : []);
    const errMsg = (e) => (e && (e.message || e.code)) || 'Something went wrong';
    const toast = (fn, msg) => { try { fn ? fn(msg) : console.info('[home]', msg); } catch (_) {} };
    const sod = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const eod = (d = new Date()) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
    const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    const fmtDate = (d, o) => new Date(d).toLocaleDateString('en-IN', o || { day: 'numeric', month: 'short' });
    const rel = (d) => (fmtRelative ? fmtRelative(d) : fmtDate(d));
    const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'; };
    const firstName = (u) => ((u && u.name) || '').split(' ')[0] || 'there';
    const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
    const lsGet = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (_) { return fb; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const isFinanceRole = (r) => r === 'admin' || r === 'accounts_head';
    const isPriv = (r) => (isPrivilegedRole ? isPrivilegedRole(r) : (r === 'admin' || r === 'manager'));
    const isOverdueRow = (r) => (isOverdue ? isOverdue(r) : !!(r && r.due_at && new Date(r.due_at) < new Date() && r.status_category !== 'done'));
    const isDoneRow = (r) => (isDone ? isDone(r) : r && r.status_category === 'done');
    const STATUS_CAT = { todo: { label: 'To do', color: '#87909e' }, active: { label: 'In progress', color: '#7b68ee' }, done: { label: 'Complete', color: '#30a46c' } };
    const LOAD_TONE = (ratio) => (ratio > 1 ? '#e5484d' : ratio >= 0.8 ? '#f5a623' : '#30a46c');
    const POST_ICON = { reel: 'ti-movie', carousel: 'ti-carousel-horizontal', creative: 'ti-photo', extra: 'ti-sparkles' };
    // Clients arrive from index.html as an array OR an id→client map — accept both.
    const clientLookup = (clients, id) => {
      if (!clients || id == null) return null;
      if (Array.isArray(clients)) return clients.find(c => String(c.id) === String(id)) || null;
      return clients[id] || null;
    };
    const clientList = (clients) => (Array.isArray(clients) ? clients : clients ? Object.values(clients) : []);
    // Stable JSON key so filter objects don't re-trigger fetches every render.
    const useStable = (obj) => { const k = JSON.stringify(obj); return useMemo(() => obj, [k]); };

    // TaskAPI wrapper with rpcCall fallbacks (tasks.js is written in parallel).
    const API = {
      homeSummary: () => (TaskAPI && TaskAPI.homeSummary ? TaskAPI.homeSummary() : rpcCall('home_summary', {})),
      homeLayoutSave: (cards) => (TaskAPI && TaskAPI.homeLayoutSave ? TaskAPI.homeLayoutSave(cards) : rpcCall('home_layout_save', { p_cards: cards })),
      inboxList: (tab, limit) => (TaskAPI && TaskAPI.inboxList ? TaskAPI.inboxList(tab, limit) : rpcCall('inbox_list', { p_tab: tab, p_limit: limit || 100 })),
      inboxSet: (ids, state, until) => (TaskAPI && TaskAPI.inboxSet ? TaskAPI.inboxSet(ids, state, until || null) : rpcCall('inbox_set', { p_ids: ids, p_state: state, p_snooze_until: until || null })),
      inboxCounts: () => (TaskAPI && TaskAPI.inboxCounts ? TaskAPI.inboxCounts() : rpcCall('inbox_counts', {})),
      repliesList: (unread) => (TaskAPI && TaskAPI.repliesList ? TaskAPI.repliesList(unread) : rpcCall('replies_list', { p_unread_only: unread, p_limit: 50 })),
      repliesMarkRead: (taskId) => (TaskAPI && TaskAPI.repliesMarkRead ? TaskAPI.repliesMarkRead(taskId) : rpcCall('replies_mark_read', { p_task_id: taskId })),
      commentsAssigned: (mode, incl) => (TaskAPI && TaskAPI.commentsAssigned ? TaskAPI.commentsAssigned(mode, incl) : rpcCall('comments_assigned', { p_mode: mode, p_include_resolved: !!incl })),
      commentUpdate: (id, patch) => (TaskAPI && TaskAPI.commentUpdate ? TaskAPI.commentUpdate(id, patch) : rpcCall('task_comment_update', { p_id: id, p_patch: patch })),
      favoriteToggle: (kind, ref, label, url) => (TaskAPI && TaskAPI.favoriteToggle ? TaskAPI.favoriteToggle(kind, ref, label, url) : rpcCall('favorite_toggle', { p_kind: kind, p_ref_id: ref, p_label: label, p_url: url || null })),
      update: (id, patch) => TaskAPI.update(id, patch),
      create: (data) => TaskAPI.create(data),
    };
    const goTask = (id, title) => {
      if (!id) return;
      if (title) { try { const m = (window.__amsTaskTitles = window.__amsTaskTitles || {}); m[id] = Object.assign({}, m[id], { title }); } catch (_) {} }
      if (openTask) openTask(id); else window.dispatchEvent(new CustomEvent('ams-open-task', { detail: { id } }));
    };

    // ---- v2: extension registry + fail-open RPC helpers (contract v2 §0.4, §2)
    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i.test(String((e && (e.code || '')) + ' ' + (e && (e.message || e.details || '') || '')));
    const isForbidden = (e) => !!e && (e.code === 'forbidden' || /forbidden/i.test(errMsg(e)));
    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => { const k = item.id || item.key || item.type; EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item); };
    const extList = (key) => arr(window.AMS_EXT && window.AMS_EXT[key]);
    const roleOk = (item, role) => { if (!item || typeof item.roles !== 'function') return true; try { return !!item.roles(role); } catch (_) { return false; } };
    Object.assign(API, {
      lineupGet: () => rpcCall('lineup_get', {}),
      lineupSet: (ids) => rpcCall('lineup_set', { p_task_ids: ids }),
      lineupAdd: (id) => rpcCall('lineup_add', { p_task_id: id }),
      lineupRemove: (id) => rpcCall('lineup_remove', { p_task_id: id }),
      remindersList: (incl) => rpcCall('reminders_list', { p_include_sent: !!incl }),
      reminderAdd: (taskId, at, note) => rpcCall('reminder_add', { p_task_id: taskId || null, p_remind_at: at, p_note: note || null }),
      reminderDelete: (id) => rpcCall('reminder_delete', { p_id: id }),
      attachmentsRecent: (n) => rpcCall('attachments_recent', { p_limit: n || 20 }),
    });
    const emitTask = (id) => { try { if (taskBus && taskBus.emit) taskBus.emit('task:changed', { id }); } catch (_) {} };
    const safeHttp = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : null);
    const stripHtml = (s) => String(s == null ? '' : s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    // Titles of rows we've seen (shared with shell.js recents via window.__amsTaskTitles).
    const rememberRows = (rows) => {
      try {
        const m = (window.__amsTaskTitles = window.__amsTaskTitles || {});
        arr(rows).forEach(r => { if (r && r.id && r.title) m[r.id] = { title: r.title, type: r.type, custom_id: r.custom_id, client_name: r.client_name }; });
        const ks = Object.keys(m); if (ks.length > 1200) ks.slice(0, ks.length - 900).forEach(k => { delete m[k]; });
      } catch (_) {}
    };

    // Generic RPC loader: { data, error, missing, loading, reload, setData }.
    // `missing` = function not deployed yet → callers render a quiet empty state.
    function useRpcData(fetcher, opts) {
      const o = opts || {};
      const enabled = o.enabled !== false;
      const [st, setSt] = useState({ data: null, error: null, missing: false, done: false });
      const ref = useRef(fetcher); ref.current = fetcher;
      const alive = useRef(true);
      useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
      const load = useCallback(async () => {
        if (!enabled) return;
        try { const d = await ref.current(); if (alive.current) setSt({ data: d, error: null, missing: false, done: true }); }
        catch (e) { if (alive.current) { const miss = isMissingRpc(e); setSt(s => ({ data: miss ? null : s.data, error: miss ? null : e, missing: miss, done: true })); } }
      }, [enabled, o.key]);
      useEffect(() => { load(); }, [load]);
      useVisiblePoll(() => { if (o.poll && enabled) load(); }, o.poll || 600000, [load]);
      useTickReload(load);
      const setData = useCallback((fn) => setSt(s => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
      return { data: st.data, error: st.error, missing: st.missing, loading: !st.done, reload: load, setData };
    }
    function NotYet({ icon = 'ti-plug-off', what }) {
      return h`<div class="ch-empty"><i class=${'ti ' + icon} aria-hidden="true"></i><div class="t">${what || 'This card'} isn't available yet</div><div style=${{ fontSize: 12 }}>It lights up after the next workspace update.</div></div>`;
    }

    // Poll helper: runs fn every ms while the tab is visible; refreshes on focus.
    function useVisiblePoll(fn, ms, depsArr) {
      const ref = useRef(fn); ref.current = fn;
      useEffect(() => {
        const tick = () => { if (document.visibilityState === 'visible') ref.current(); };
        const iv = setInterval(tick, ms);
        document.addEventListener('visibilitychange', tick);
        return () => { clearInterval(iv); document.removeEventListener('visibilitychange', tick); };
      }, depsArr || []);
    }

    // ---- atom fallbacks (used only if tasks.js didn't provide them) --------
    function FbPopover({ anchor, open, onClose, width, children }) {
      const ref = useRef(null);
      useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target))) onClose && onClose(); };
        const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
        document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
      }, [open, anchor]);
      if (!open) return null;
      const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : (anchor || { left: 20, bottom: 60 });
      const w = width || 240;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      return h`<div ref=${ref} class="ch-pop" style=${{ position: 'fixed', zIndex: 500, top: (r.bottom || 0) + 4, left, width: w, maxHeight: '70vh', overflow: 'auto', padding: 4 }}>${children}</div>`;
    }
    function FbMenu({ items }) {
      return h`<div role="menu">${arr(items).map((it, i) => it.divider
        ? h`<div key=${'d' + i} style=${{ height: 1, background: 'var(--cu-bd,#e8e8eb)', margin: '4px 0' }}></div>`
        : h`<button key=${it.key || i} role="menuitem" class=${'ch-mi' + (it.danger ? ' danger' : '')} disabled=${it.disabled} onClick=${() => it.onSelect && it.onSelect()}>
            ${it.icon && h`<i class=${'ti ' + it.icon}></i>`}<span>${it.label}</span></button>`)}</div>`;
    }
    const Pop = Popover || FbPopover;
    const MenuC = Menu || FbMenu;

    // Button that owns a popover. children: (close) => node
    function PopButton({ className, label, icon, title, width, children, ariaLabel, badge }) {
      const ref = useRef(null);
      const [open, setOpen] = useState(false);
      const close = useCallback(() => setOpen(false), []);
      return h`<${React.Fragment}>
        <button ref=${ref} class=${className || 'ch-btn'} title=${title || ''} aria-label=${ariaLabel || title || undefined}
          aria-haspopup="true" aria-expanded=${open ? 'true' : 'false'}
          onClick=${(e) => { e.stopPropagation(); setOpen(o => !o); }}>
          ${icon && h`<i class=${'ti ' + icon}></i>`}${label}${badge ? h`<span class="ch-badge">${badge}</span>` : null}
        </button>
        ${open && h`<${Pop} anchor=${ref.current} open=${open} onClose=${close} width=${width}>
          <div onClick=${(e) => e.stopPropagation()}>${children(close)}</div>
        <//>`}
      <//>`;
    }

    function Loading({ rows = 4 }) {
      return h`<div aria-busy="true" aria-label="Loading">${Array.from({ length: rows }).map((_, i) => h`<div key=${i} class="ch-sk" style=${{ opacity: 1 - i * 0.18 }}></div>`)}</div>`;
    }
    function CardError({ error, onRetry }) {
      return h`<div class="ch-err" role="alert"><i class="ti ti-alert-triangle"></i>
        <span style=${{ flex: 1 }}>Couldn't load — ${errMsg(error)}</span>
        ${onRetry && h`<button class="ch-btn sm" onClick=${onRetry}><i class="ti ti-refresh"></i>Retry</button>`}</div>`;
    }
    function Empty({ icon = 'ti-mood-smile', title, sub, action }) {
      if (EmptyState) return h`<${EmptyState} icon=${icon} title=${title} sub=${sub} action=${action}/>`;
      return h`<div class="ch-empty"><i class=${'ti ' + icon}></i><div class="t">${title}</div>${sub && h`<div style=${{ fontSize: 12 }}>${sub}</div>`}${action}</div>`;
    }

    // Per-card error boundary: one broken card never takes down Home.
    class CardBoundary extends React.Component {
      constructor(p) { super(p); this.state = { err: null }; }
      static getDerivedStateFromError(err) { return { err }; }
      componentDidCatch(err) { console.warn('[home] card crashed', this.props.name, err); }
      render() {
        if (this.state.err) {
          return h`<div class="ch-card"><div class="ch-card-hd"><div class="ch-card-t"><span class="nm">${this.props.name || 'Card'}</span></div>${this.props.right}</div>
            <${CardError} error=${this.state.err} onRetry=${() => this.setState({ err: null })}/></div>`;
        }
        return this.props.children;
      }
    }

    // ---- Card chrome ---------------------------------------------------------
    // ctl (dashboard only): { customize, w, onWidth(w), onRemove(), onMove(dir), dragHandle }
    function CardShell({ title, icon, count, onRefresh, ctl, right, children, tall, bodyStyle }) {
      const menuItems = (close) => {
        const items = [];
        if (onRefresh) items.push({ key: 'refresh', label: 'Refresh', icon: 'ti-refresh', onSelect: () => { close(); onRefresh(); } });
        if (ctl && ctl.onWidth) {
          items.push({ key: 'd1', divider: true });
          [1, 2, 3].forEach(w => items.push({ key: 'w' + w, label: 'Width: ' + w + ' column' + (w > 1 ? 's' : '') + (ctl.w === w ? '  ✓' : ''), icon: 'ti-columns-' + w, onSelect: () => { close(); ctl.onWidth(w); } }));
        }
        if (ctl && ctl.onRemove) {
          items.push({ key: 'd2', divider: true });
          items.push({ key: 'remove', label: 'Remove card', icon: 'ti-trash', danger: true, onSelect: () => { close(); ctl.onRemove(); } });
        }
        return items;
      };
      const hasMenu = onRefresh || (ctl && (ctl.onWidth || ctl.onRemove));
      const editing = ctl && ctl.customize;
      const titleNode = h`<span class="ch-card-t">
        ${editing && h`<i class="ti ti-grip-vertical ch-handle" aria-hidden="true" title="Drag to reorder"></i>`}
        ${icon && !editing && h`<i class=${'ti ' + icon} style=${{ color: 'var(--cu-t3,#8e8e99)', fontSize: 16 }} aria-hidden="true"></i>`}
        <span class="nm">${title}</span>
        ${count != null && h`<span class="ch-card-sub">${count}</span>`}
      </span>`;
      const rightNode = h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        ${right}
        ${editing && h`<${React.Fragment}>
          <button class="ch-ibtn" aria-label="Move card earlier" title="Move earlier" onClick=${() => ctl.onMove(-1)}><i class="ti ti-arrow-left"></i></button>
          <button class="ch-ibtn" aria-label="Move card later" title="Move later" onClick=${() => ctl.onMove(1)}><i class="ti ti-arrow-right"></i></button>
          <span class="ch-seg" role="group" aria-label="Card width">
            ${[1, 2, 3].map(w => h`<button key=${w} class=${ctl.w === w ? 'on' : ''} aria-pressed=${ctl.w === w ? 'true' : 'false'} aria-label=${w + ' column width'} onClick=${() => ctl.onWidth(w)}>${w}</button>`)}
          </span>
          <button class="ch-ibtn" aria-label="Remove card" title="Remove" onClick=${ctl.onRemove}><i class="ti ti-x"></i></button>
        <//>`}
        ${hasMenu && !editing && h`<${PopButton} className="ch-ibtn" icon="ti-dots" title="Card options" width=${200}>
          ${(close) => h`<${MenuC} items=${menuItems(close)}/>`}
        <//>`}
      </span>`;
      const body = h`<div class=${'ch-card-bd' + (tall ? ' tall' : '')} style=${bodyStyle}>${children}</div>`;
      // Header is always rendered by us (needs count + customize controls); SectionCard
      // is used when available so the chrome matches the rest of the ClickUp surfaces.
      // bodyStyle padding 0: our .ch-card-bd owns padding + the 380px scroll, so SectionCard's cu-card-b mustn't double it.
      if (SectionCard) return h`<${SectionCard} title=${titleNode} right=${rightNode} bodyStyle=${{ padding: 0 }}>${body}<//>`;
      return h`<section class="ch-card"><div class="ch-card-hd">${titleNode}${rightNode}</div>${body}</section>`;
    }

    // ---- task rows -----------------------------------------------------------
    // Returns a function that marks a row complete (first done status of its list).
    function useCompleteTask(showToast, onDone) {
      const store = useTaskStore ? useTaskStore() : {};
      return useCallback(async (row) => {
        try {
          const sts = arr(store.statusesFor ? store.statusesFor(row.list_id) : []);
          const done = sts.filter(s => s.category === 'done').sort((a, b) => (a.position || 0) - (b.position || 0))[0];
          const key = done ? done.key : (row.list_kind === 'content' ? 'approved' : 'done');
          if (onDone) onDone(row);
          await API.update(row.id, { status: key });
          toast(showToast, 'Marked ' + (done ? done.name : 'complete'));
        } catch (e) { toast(showToast, 'Could not update: ' + errMsg(e)); }
      }, [store.statusesFor, showToast, onDone]);
    }

    function TaskLine({ row, onComplete, showAssignees, showClient = true }) {
      const done = isDoneRow(row);
      const open = () => goTask(row.id);
      return h`<div class=${'ch-row' + (done ? ' done' : '')} role="button" tabIndex="0"
          onClick=${open} onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}>
        <button class="ch-doneb" disabled=${done || !onComplete} aria-label=${done ? 'Completed' : 'Mark complete: ' + row.title}
          title=${done ? row.status_name || 'Complete' : 'Mark complete'}
          onClick=${(e) => { e.stopPropagation(); if (!done && onComplete) onComplete(row); }}>
          ${StatusIcon ? h`<${StatusIcon} category=${row.status_category} color=${row.status_color} size=${16}/>`
            : h`<i class=${'ti ' + (done ? 'ti-circle-check-filled' : 'ti-circle')} style=${{ color: row.status_color || 'var(--cu-t3)', fontSize: 16 }}></i>`}
        </button>
        ${row.type && row.type !== 'task' && TypeIcon && h`<span class="ch-hide-sm" style=${{ display: 'inline-flex' }}><${TypeIcon} type=${row.type}/></span>`}
        <span class="ch-row-t" title=${row.title}>${row.title || 'Untitled'}</span>
        <span class="ch-row-meta">
          ${showClient && row.client_id && (ClientBadge ? h`<span class="ch-hide-sm"><${ClientBadge} clientId=${row.client_id}/></span>`
            : h`<span class="ch-hide-sm ch-muted">${row.client_name || ''}</span>`)}
          ${showAssignees && arr(row.assignees).length > 0 && AssigneeStack && h`<span class="ch-hide-sm"><${AssigneeStack} assignees=${row.assignees} max=${2} size=${20}/></span>`}
          ${row.due_at && (DueChip ? h`<${DueChip} row=${row}/>` : h`<span class="ch-muted" style=${{ color: isOverdueRow(row) ? '#e5484d' : undefined }}>${fmtDate(row.due_at)}</span>`)}
          ${row.priority && (PriorityFlag ? h`<${PriorityFlag} value=${row.priority}/>`
            : h`<i class="ti ti-flag-filled" style=${{ color: (PRIORITIES && PRIORITIES[row.priority] || {}).color }}></i>`)}
        </span>
      </div>`;
    }

    function TaskGroup({ id, label, rows, color, onComplete, defaultOpen = true, showAssignees, empty }) {
      const key = 'ams_home_grp_' + id;
      const [open, setOpen] = useState(() => { const v = lsGet(key, null); return v == null ? defaultOpen : v; });
      const toggle = () => setOpen(o => { lsSet(key, !o); return !o; });
      if (!rows.length && !empty) return null;
      return h`<div class="ch-grp">
        <button class=${'ch-grp-hd' + (open ? '' : ' closed')} aria-expanded=${open ? 'true' : 'false'} onClick=${toggle} style=${{ color: color || undefined }}>
          <i class="ti ti-chevron-down chev" aria-hidden="true"></i>${label}<span class="cnt">${rows.length}</span>
        </button>
        ${open && (rows.length ? rows.map(r => h`<${TaskLine} key=${r.id} row=${r} onComplete=${onComplete} showAssignees=${showAssignees}/>`)
          : h`<div class="ch-muted" style=${{ padding: '4px 30px 8px' }}>${empty}</div>`)}
      </div>`;
    }

    // Bucket open rows ClickUp-style: Today · Overdue · Next (7 days) · Later · Unscheduled
    function bucketRows(rows) {
      const now = new Date(), todayEnd = eod(now), weekEnd = eod(addDays(now, 7));
      const b = { today: [], overdue: [], next: [], later: [], none: [] };
      arr(rows).forEach(r => {
        if (!r.due_at) return b.none.push(r);
        const d = new Date(r.due_at);
        if (isOverdueRow(r)) b.overdue.push(r);
        else if (d <= todayEnd) b.today.push(r);
        else if (d <= weekEnd) b.next.push(r);
        else b.later.push(r);
      });
      const byDue = (a, c) => new Date(a.due_at) - new Date(c.due_at) || (a.priority || 9) - (c.priority || 9);
      b.today.sort(byDue); b.overdue.sort(byDue); b.next.sort(byDue); b.later.sort(byDue);
      b.none.sort((a, c) => (a.priority || 9) - (c.priority || 9));
      return b;
    }

    // ---- shared Home context: summary (one fetch for all cards), filters, tick
    const HomeCtx = React.createContext(null);
    const useHomeCtx = () => React.useContext(HomeCtx) || {};
    const useTasksBase = useTasks || (() => ({ rows: [], total: 0, loading: false, error: new Error('Task module not loaded'), reload: noop }));
    const useTasksSafe = (filter, opts) => { const q = useTasksBase(filter, opts); useEffect(() => { rememberRows(q.rows); }, [q.rows]); return q; };
    const useStoreSafe = useTaskStore || (() => ({}));

    function useSummarySource(enabled) {
      const [state, setState] = useState({ data: null, error: null, loading: !!enabled, at: null });
      const load = useCallback(async () => {
        if (!enabled) return;
        try {
          const d = await API.homeSummary();
          setState({ data: d || {}, error: null, loading: false, at: Date.now() });
        } catch (e) { setState(s => ({ ...s, error: e, loading: false, at: Date.now() })); }
      }, [enabled]);
      useEffect(() => { load(); }, [load]);
      useVisiblePoll(() => { if (enabled) load(); }, 60000, [enabled]);
      return { ...state, reload: load };
    }
    // Cards read the dashboard's shared summary; outside the dashboard they fetch their own.
    function useSummary() {
      const ctx = useHomeCtx();
      const own = useSummarySource(!ctx.summary);
      return ctx.summary || own;
    }
    // Merge dashboard filters into a tasks_query filter.
    function useFiltered(base, opts = {}) {
      const { filters } = useHomeCtx();
      const f = { ...base };
      if (filters) {
        if (arr(filters.clientIds).length && !f.client_ids) f.client_ids = filters.clientIds;
        if (!opts.noAssignee && arr(filters.assigneeIds).length && !f.assignee_ids) f.assignee_ids = filters.assigneeIds;
      }
      return useStable(f);
    }
    // Re-run reload when the dashboard's manual refresh tick changes.
    function useTickReload(reload) {
      const { tick } = useHomeCtx();
      const first = useRef(true);
      useEffect(() => { if (first.current) { first.current = false; return; } reload && reload(); }, [tick]);
    }

    const NOTIF_FALLBACK = {
      mention: { icon: 'ti-at', col: '#7b68ee' }, comment: { icon: 'ti-message-circle', col: '#4c8df6' },
      message: { icon: 'ti-message-2', col: '#c400bd' }, task: { icon: 'ti-clipboard-list', col: '#1d4ed8' },
      approval: { icon: 'ti-thumb-up', col: '#30a46c' }, revision: { icon: 'ti-refresh', col: '#e5484d' },
      alert: { icon: 'ti-alert-triangle', col: '#e5484d' }, status: { icon: 'ti-arrows-exchange', col: '#6d28d9' },
      info: { icon: 'ti-bell', col: '#87909e' },
    };
    const notifIcon = (type) => {
      const n = (NOTIF_ICONS && NOTIF_ICONS[type]) || NOTIF_FALLBACK[type] || (NOTIF_ICONS && NOTIF_ICONS.info) || NOTIF_FALLBACK.info;
      const col = /^#[0-9a-f]{6}$/i.test(n.col || '') ? n.col : '#87909e';
      return { icon: n.icon || 'ti-bell', col };
    };

    // ========================================================================
    // CARD: my_work — ClickUp "My Work" (To Do / Done / Delegated)
    // ========================================================================
    function MyWorkCard({ ctl, currentUser, showToast, title = 'My Work', tall }) {
      const store = useStoreSafe();
      const meId = (store.me && store.me.id) || (currentUser && currentUser.id);
      const [tab, setTab] = useState('todo');
      const todoF = useFiltered({ scope: 'my', limit: 500, order: 'due' }, { noAssignee: true });
      const doneF = useFiltered({ scope: 'my', status_categories: ['done'], order: 'updated', limit: 50 }, { noAssignee: true });
      const delF = useFiltered({ scope: 'delegated', limit: 300, order: 'due' });
      const todo = useTasksSafe(todoF, { enabled: tab === 'todo' });
      const done = useTasksSafe(doneF, { enabled: tab === 'done' });
      const del = useTasksSafe(delF, { enabled: tab === 'delegated' });
      const cur = tab === 'todo' ? todo : tab === 'done' ? done : del;
      useTickReload(cur.reload);

      const removeRow = useCallback((row) => { if (cur.setRows) cur.setRows(rs => arr(rs).filter(r => r.id !== row.id)); }, [cur.setRows]);
      const complete = useCompleteTask(showToast, removeRow);

      const [draft, setDraft] = useState('');
      const [adding, setAdding] = useState(false);
      const personal = arr(store.lists).find(l => l.system_key === 'personal' && (!l.owner_id || l.owner_id === meId));
      const addTask = async () => {
        const t = draft.trim(); if (!t || adding) return;
        const due = new Date(); due.setHours(23, 59, 0, 0);
        const data = { title: t, type: 'task', assignee_ids: meId ? [meId] : [], due_at: due.toISOString(), due_has_time: false };
        if (!personal || !TaskAPI) { if (openCreateTask) openCreateTask(data); setDraft(''); return; }
        setAdding(true);
        try { await API.create({ ...data, list_id: personal.id }); setDraft(''); todo.reload && todo.reload(); }
        catch (e) { toast(showToast, 'Could not add task: ' + errMsg(e)); }
        setAdding(false);
      };

      const b = useMemo(() => bucketRows(todo.rows), [todo.rows]);
      const weekAgo = addDays(new Date(), -7);
      const doneRows = useMemo(() => arr(done.rows).filter(r => new Date(r.completed_at || r.updated_at || 0) >= weekAgo), [done.rows]);
      const db_ = useMemo(() => bucketRows(del.rows), [del.rows]);
      const count = tab === 'todo' ? arr(todo.rows).length : tab === 'done' ? doneRows.length : arr(del.rows).length;

      const tabs = [['todo', 'To Do'], ['done', 'Done'], ['delegated', 'Delegated']];
      let body;
      if (cur.error && !arr(cur.rows).length) body = h`<${CardError} error=${cur.error} onRetry=${cur.reload}/>`;
      else if (cur.loading && !arr(cur.rows).length) body = h`<${Loading}/>`;
      else if (tab === 'todo') {
        body = arr(todo.rows).length === 0 ? h`<${Empty} icon="ti-coffee" title="Nothing on your plate" sub="Tasks assigned to you show up here."/>`
          : h`<div>
            <${TaskGroup} id="mw_today" label="Today" rows=${b.today} onComplete=${complete} empty="Nothing due today"/>
            <${TaskGroup} id="mw_overdue" label="Overdue" color="#e5484d" rows=${b.overdue} onComplete=${complete}/>
            <${TaskGroup} id="mw_next" label="Next" rows=${b.next} onComplete=${complete}/>
            <${TaskGroup} id="mw_later" label="Later" rows=${b.later} onComplete=${complete} defaultOpen=${false}/>
            <${TaskGroup} id="mw_none" label="Unscheduled" rows=${b.none} onComplete=${complete} defaultOpen=${false}/>
          </div>`;
      } else if (tab === 'done') {
        body = doneRows.length === 0 ? h`<${Empty} icon="ti-circle-check" title="No completed tasks this week"/>`
          : h`<div>${doneRows.map(r => h`<${TaskLine} key=${r.id} row=${r}/>`)}</div>`;
      } else {
        body = arr(del.rows).length === 0 ? h`<${Empty} icon="ti-send" title="Nothing delegated" sub="Tasks you created for others appear here."/>`
          : h`<div>
            <${TaskGroup} id="mwd_overdue" label="Overdue" color="#e5484d" rows=${db_.overdue} showAssignees=${true}/>
            <${TaskGroup} id="mwd_today" label="Today" rows=${db_.today} showAssignees=${true}/>
            <${TaskGroup} id="mwd_next" label="Next" rows=${db_.next} showAssignees=${true}/>
            <${TaskGroup} id="mwd_later" label="Later" rows=${db_.later} showAssignees=${true} defaultOpen=${false}/>
            <${TaskGroup} id="mwd_none" label="Unscheduled" rows=${db_.none} showAssignees=${true} defaultOpen=${false}/>
          </div>`;
      }

      return h`<${CardShell} title=${title} icon="ti-checkbox" count=${count} onRefresh=${cur.reload} ctl=${ctl} tall=${tall}>
        <div class="ch-tabs" role="tablist">
          ${tabs.map(([k, l]) => h`<button key=${k} role="tab" aria-selected=${tab === k ? 'true' : 'false'} class=${'ch-tab' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}>${l}</button>`)}
        </div>
        ${tab === 'todo' && h`<div class="ch-add">
          <i class=${'ti ' + (adding ? 'ti-loader-2' : 'ti-plus')} aria-hidden="true"></i>
          <input value=${draft} placeholder="Add task — assigned to me, due today" aria-label="Add a task for today"
            onInput=${(e) => setDraft(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') setDraft(''); }}/>
          ${draft.trim() && h`<button class="ch-btn pri sm" onClick=${addTask} disabled=${adding}>Save</button>`}
        </div>`}
        ${body}
      <//>`;
    }

    // ========================================================================
    // CARD: approvals
    // ========================================================================
    function ApprovalsCard({ ctl }) {
      const s = useSummary();
      const a = (s.data && s.data.approvals) || null;
      const stats = a ? [
        { k: 'sent', label: 'Waiting on client', val: a.sent || 0, color: '#8b5cf6' },
        { k: 'revision', label: 'In revision', val: a.revision || 0, color: '#e5484d' },
        { k: 'approved', label: 'Approved this week', val: a.approved_week || 0, color: '#30a46c' },
      ] : [];
      return h`<${CardShell} title="Approvals" icon="ti-thumb-up" count=${a ? (a.sent || 0) + ' waiting' : null} onRefresh=${s.reload} ctl=${ctl}>
        ${s.error && !a ? h`<${CardError} error=${s.error} onRetry=${s.reload}/>`
        : !a ? h`<${Loading} rows=${3}/>`
        : h`<div>
          ${stats.map(st => h`<div key=${st.k} class="ch-stat"><span class="dot" style=${{ background: st.color }}></span><span class="lbl">${st.label}</span><span class="val">${st.val}</span></div>`)}
          <div class="ch-sec">Longest waiting</div>
          ${arr(a.oldest).length === 0 ? h`<div class="ch-muted" style=${{ padding: '4px 8px 8px' }}>Nothing waiting on clients.</div>`
            : arr(a.oldest).map(o => h`<div key=${o.task_id} class="ch-row" role="button" tabIndex="0" onClick=${() => goTask(o.task_id)} onKeyDown=${(e) => { if (e.key === 'Enter') goTask(o.task_id); }}>
                <i class="ti ti-hourglass" style=${{ color: '#8b5cf6' }} aria-hidden="true"></i>
                <span class="ch-row-t">${o.title}<span class="ch-muted">${o.client_name ? ' · ' + o.client_name : ''}</span></span>
                <span class="ch-pill" style=${{ background: (o.days >= 3 ? '#e5484d' : '#8b5cf6') + '1f', color: o.days >= 3 ? '#e5484d' : '#8b5cf6' }}>${o.days}d</span>
              </div>`)}
        </div>`}
      <//>`;
    }

    // ========================================================================
    // CARD: agenda — today's timeline (tasks with a due time + posts)
    // ========================================================================
    // Agenda sources: built-ins (my timed tasks, scheduled posts, meetings,
    // approved leave) merged with AMS_EXT.agendaSources. Used by the Agenda card
    // (Home) and the Today page; exported as useAgendaItems.
    const ymd = (d) => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    const AG_KIND = {
      task: { icon: 'ti-circle-check', color: '#7b68ee', label: 'Task' },
      post: { icon: 'ti-photo', color: '#ff00ee', label: 'Post' },
      meeting: { icon: 'ti-users', color: '#4c8df6', label: 'Meeting' },
      leave: { icon: 'ti-beach', color: '#f5a623', label: 'Leave' },
      event: { icon: 'ti-calendar-event', color: '#30a46c', label: 'Event' },
    };
    function useAgendaItems(day, currentUser) {
      const priv = isPriv(currentUser && currentUser.role_level);
      const userName = (currentUser && currentUser.name) || '';
      const from = sod(day), to = eod(day);
      const fromISO = from.toISOString(), toISO = to.toISOString();
      const dayKey = ymd(from);
      const range = { due_from: fromISO, due_to: toISO, include_closed: true, limit: 200, order: 'due' };
      const mineF = useFiltered({ scope: 'my', ...range }, { noAssignee: true });
      const teamF = useFiltered({ scope: 'all', types: ['post', 'meeting'], ...range });
      const mine = useTasksSafe(mineF, {});
      const team = useTasksSafe(teamF, { enabled: priv });
      const [leave, setLeave] = useState([]);
      const [ext, setExt] = useState([]);
      const [extLoading, setExtLoading] = useState(false);
      const reqRef = useRef(0);
      const loadSide = useCallback(async () => {
        const my = ++reqRef.current;
        // Approved leave — legacy leave_requests table (same read EmployeeView uses).
        const leaveP = db
          ? Promise.resolve(db('leave_requests', '&status=eq.approved&from_date=lte.' + dayKey + '&to_date=gte.' + dayKey + '&order=from_date.asc&limit=100'))
              .then(rows => arr(rows).filter(l => priv || (userName && l.member_name === userName))).catch(() => [])
          : Promise.resolve([]);
        const sources = extList('agendaSources').filter(s => s && typeof s.fetch === 'function');
        if (sources.length) setExtLoading(true);
        const extP = Promise.all(sources.map(s => Promise.resolve().then(() => s.fetch(fromISO, toISO, currentUser))
          .then(items => arr(items).map(it => ({ ...it, _src: s.id || 'ext' }))).catch(() => [])));
        const [lv, ex] = await Promise.all([leaveP, extP]);
        if (my !== reqRef.current) return;
        setLeave(lv); setExt([].concat(...ex)); setExtLoading(false);
      }, [dayKey, priv, userName]);
      useEffect(() => { loadSide(); }, [loadSide]);
      useVisiblePoll(loadSide, 300000, [loadSide]);
      const reload = useCallback(() => { if (mine.reload) mine.reload(); if (priv && team.reload) team.reload(); loadSide(); }, [mine.reload, team.reload, priv, loadSide]);
      const items = useMemo(() => {
        const out = []; const seen = new Set();
        [...arr(mine.rows), ...(priv ? arr(team.rows) : [])].forEach(r => {
          if (!r || !r.id || seen.has(r.id)) return; seen.add(r.id);
          const kind = r.type === 'post' ? 'post' : r.type === 'meeting' ? 'meeting' : 'task';
          const isP = kind === 'post';
          out.push({ id: 't:' + r.id, title: r.title || 'Untitled', start: r.due_at, end: null, allDay: r.due_has_time === false, kind,
            color: r.status_color || AG_KIND[kind].color, icon: isP ? (POST_ICON[r.post && r.post.type] || 'ti-photo') : kind === 'meeting' ? 'ti-users' : null,
            meta: [r.client_name, r.status_name, isP && r.post && r.post.type].filter(Boolean).join(' · '), done: isDoneRow(r), type: r.type,
            onOpen: () => goTask(r.id, r.title) });
        });
        arr(leave).forEach(l => {
          const self = userName && l.member_name === userName;
          const multi = l.from_date && l.to_date && l.from_date !== l.to_date;
          out.push({ id: 'lv:' + l.id, title: (self ? 'You' : (l.member_name || 'Teammate')) + (l.leave_type === 'half' ? ' · half-day leave' : ' · on leave'),
            start: fromISO, end: null, allDay: true, kind: 'leave', color: AG_KIND.leave.color, icon: AG_KIND.leave.icon,
            meta: multi ? fmtDate(l.from_date) + ' – ' + fmtDate(l.to_date) : 'Approved leave', onOpen: null });
        });
        arr(ext).forEach((e, i) => {
          if (!e || !e.start) return;
          const s = new Date(e.start), en = e.end ? new Date(e.end) : s;
          if (isNaN(s.getTime()) || s > to || en < from) return;
          const kind = AG_KIND[e.kind] ? e.kind : 'event';
          const col = /^#[0-9a-f]{3,8}$/i.test(String(e.color || '')) ? e.color : AG_KIND[kind].color;
          const endTxt = !e.allDay && e.end && sameDay(e.end, s) && en > s ? 'until ' + fmtTime(en) : '';
          out.push({ id: 'x:' + e._src + ':' + (e.id != null ? e.id : i), title: e.title || 'Untitled event', start: e.start, end: e.end || null,
            allDay: !!e.allDay || !sameDay(s, from), kind, color: col, icon: e.icon || AG_KIND[kind].icon,
            meta: [e.meta || e.sub || AG_KIND[kind].label, endTxt].filter(Boolean).join(' · '), onOpen: typeof e.onOpen === 'function' ? e.onOpen : null });
        });
        const ad = (x) => (x.allDay ? 1 : 0);
        return out.sort((a, b) => (ad(b) - ad(a)) || (new Date(a.start) - new Date(b.start)));
      }, [mine.rows, team.rows, priv, leave, ext, fromISO, toISO, userName]);
      const loading = (mine.loading && !arr(mine.rows).length && !items.length) || (extLoading && !items.length);
      return { items, loading, error: mine.error && !items.length ? mine.error : null, reload };
    }

    function AgendaCard({ ctl, currentUser, tall }) {
      const [offset, setOffset] = useState(0);
      const todayKey = new Date().toDateString();
      const day = useMemo(() => addDays(sod(new Date()), offset), [offset, todayKey]);
      const ag = useAgendaItems(day, currentUser);
      useTickReload(ag.reload);
      const items = ag.items;
      const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : offset === -1 ? 'Yesterday' : fmtDate(day, { weekday: 'short', day: 'numeric', month: 'short' });
      const right = h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <button class="ch-ibtn" aria-label="Previous day" onClick=${() => setOffset(o => o - 1)}><i class="ti ti-chevron-left"></i></button>
        <button class="ch-btn sm" onClick=${() => setOffset(0)} aria-label="Jump to today">${label}</button>
        <button class="ch-ibtn" aria-label="Next day" onClick=${() => setOffset(o => o + 1)}><i class="ti ti-chevron-right"></i></button>
      </span>`;
      return h`<${CardShell} title="Agenda" icon="ti-calendar-time" count=${items.length || null} onRefresh=${ag.reload} ctl=${ctl} right=${right} tall=${tall}>
        ${ag.error ? h`<${CardError} error=${ag.error} onRetry=${ag.reload}/>`
        : ag.loading ? h`<${Loading} rows=${3}/>`
        : items.length === 0 ? h`<${Empty} icon="ti-calendar-smile" title="Nothing on the agenda" sub=${offset === 0 ? 'No tasks, posts, meetings or events today.' : 'Nothing scheduled on ' + label + '.'}/>`
        : h`<div class="ch-ag" role="list">${items.map(it => {
            const time = it.allDay ? 'All day' : fmtTime(it.start);
            const clickable = typeof it.onOpen === 'function';
            const open = () => { if (clickable) { try { it.onOpen(); } catch (e) { console.warn('[home] agenda open failed', e); } } };
            return h`<div key=${it.id} class="ch-ag-item" role=${clickable ? 'button' : 'listitem'} tabIndex=${clickable ? '0' : undefined}
                style=${clickable ? undefined : { cursor: 'default' }} onClick=${open} onKeyDown=${(e) => { if (e.key === 'Enter') open(); }}>
              <div class="ch-ag-time">${time}</div>
              <div class="ch-ag-rail"><i style=${{ background: it.color || '#87909e' }}></i></div>
              <div class="ch-ag-body">
                <div class="t">
                  ${it.icon ? h`<i class=${'ti ' + it.icon} style=${{ color: it.kind === 'leave' ? AG_KIND.leave.color : 'var(--cu-t3,#8e8e99)' }} aria-label=${(AG_KIND[it.kind] || AG_KIND.event).label}></i>`
                    : (it.type && it.type !== 'task' && TypeIcon ? h`<${TypeIcon} type=${it.type}/>` : null)}
                  <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--cu-t3,#8e8e99)' : undefined }}>${it.title}</span>
                </div>
                ${it.meta && h`<div class="m">${it.meta}</div>`}
              </div>
            </div>`;
          })}</div>`}
      <//>`;
    }

    // ========================================================================
    // CARD: inbox — latest unread primary notifications
    // ========================================================================
    function InboxCard({ ctl, onNavigate }) {
      const [st, setSt] = useState({ rows: null, error: null });
      const load = useCallback(async () => {
        try { const rows = await API.inboxList('primary', 40); setSt({ rows: arr(rows).filter(n => !n.read).slice(0, 6), error: null }); }
        catch (e) { setSt(s => ({ rows: s.rows, error: e })); }
      }, []);
      useEffect(() => { load(); }, [load]);
      useVisiblePoll(load, 60000);
      useTickReload(load);
      const go = (n) => onNavigate && onNavigate('inbox', n ? { notif: n, notifId: n.id } : undefined);
      const right = h`<button class="ch-link" onClick=${() => go()}>Open inbox</button>`;
      return h`<${CardShell} title="Inbox" icon="ti-inbox" count=${st.rows ? st.rows.length + ' unread' : null} onRefresh=${load} ctl=${ctl} right=${right}>
        ${st.error && !st.rows ? h`<${CardError} error=${st.error} onRetry=${load}/>`
        : !st.rows ? h`<${Loading} rows=${3}/>`
        : st.rows.length === 0 ? h`<${Empty} icon="ti-mail-opened" title="You're all caught up!"/>`
        : st.rows.map(n => { const ic = notifIcon(n.type); return h`<div key=${n.id} class="ch-row" role="button" tabIndex="0" onClick=${() => go(n)} onKeyDown=${(e) => { if (e.key === 'Enter') go(n); }} style=${{ alignItems: 'flex-start', paddingTop: 7, paddingBottom: 7 }}>
            <span class="ch-ib-ic" style=${{ width: 26, height: 26, fontSize: 14, background: ic.col + '1f', color: ic.col }}><i class=${'ti ' + ic.icon} aria-hidden="true"></i></span>
            <span style=${{ flex: 1, minWidth: 0 }}>
              <span class="ch-row-t" style=${{ display: 'block', fontWeight: 600 }}>${n.title}</span>
              <span class="ch-muted" style=${{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${n.message || n.client_name || ''}</span>
            </span>
            <span class="ch-muted" style=${{ flexShrink: 0 }}>${rel(n.created_at)}</span>
          </div>`; })}
      <//>`;
    }

    // ========================================================================
    // CARD: workload — open due this week vs capacity per member
    // ========================================================================
    function WorkloadCard({ ctl, onNavigate }) {
      const s = useSummary();
      const { filters } = useHomeCtx();
      const rows = useMemo(() => {
        let w = arr(s.data && s.data.workload);
        const ids = arr(filters && filters.assigneeIds);
        if (ids.length) w = w.filter(m => ids.includes(m.member_id));
        const maxDue = Math.max(1, ...w.map(m => m.due_week || 0));
        return w.map(m => {
          const cap = Number(m.capacity) || 0;
          const ratio = cap > 0 ? (m.due_week || 0) / cap : (m.due_week || 0) / maxDue * 0.7;
          return { ...m, cap, ratio };
        }).sort((a, b) => b.ratio - a.ratio || (b.open || 0) - (a.open || 0));
      }, [s.data, filters]);
      return h`<${CardShell} title="Workload" icon="ti-users" count=${s.data ? 'this week' : null} onRefresh=${s.reload} ctl=${ctl}>
        ${s.error && !s.data ? h`<${CardError} error=${s.error} onRetry=${s.reload}/>`
        : !s.data ? h`<${Loading}/>`
        : rows.length === 0 ? h`<${Empty} icon="ti-users" title="No team workload yet"/>`
        : h`<div>
          ${rows.map(m => { const tone = LOAD_TONE(m.ratio); const pct = Math.min(1, m.ratio) * 100;
            return h`<div key=${m.member_id} class="ch-wl" role="button" tabIndex="0"
                aria-label=${m.name + ': ' + (m.due_week || 0) + ' due this week' + (m.cap ? ' of capacity ' + m.cap : '') + ', ' + (m.overdue || 0) + ' overdue'}
                onClick=${() => onNavigate && onNavigate('team', { memberId: m.member_id })} onKeyDown=${(e) => { if (e.key === 'Enter') onNavigate && onNavigate('team', { memberId: m.member_id }); }}>
              <span class="nm">${Av ? h`<${Av} i=${m.initials} c=${m.color} s=${22} round=${true}/>` : null}<span>${m.name}</span></span>
              <span class="ch-bar"><span style=${{ width: pct + '%', background: tone }}></span></span>
              <span class="num">${m.due_week || 0}${m.cap ? ' / ' + m.cap : ''}${m.overdue ? h` <span style=${{ color: '#e5484d', fontWeight: 600 }}>· ${m.overdue} late</span>` : ''}</span>
            </div>`; })}
          <div class="ch-muted" style=${{ display: 'flex', gap: 12, padding: '8px 8px 0', flexWrap: 'wrap' }}>
            ${[['#30a46c', 'OK'], ['#f5a623', 'Near capacity'], ['#e5484d', 'Over']].map(([c, l]) => h`<span key=${l} style=${{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style=${{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }}></i>${l}</span>`)}
          </div>
        </div>`}
      <//>`;
    }

    // ========================================================================
    // CARD: client_health
    // ========================================================================
    function ClientHealthCard({ ctl, onNavigate }) {
      const s = useSummary();
      const { filters } = useHomeCtx();
      const rows = useMemo(() => {
        let c = arr(s.data && s.data.clients);
        const ids = arr(filters && filters.clientIds);
        if (ids.length) c = c.filter(x => ids.includes(x.client_id));
        return c.slice().sort((a, b) => (b.overdue || 0) - (a.overdue || 0) || (b.due_week || 0) - (a.due_week || 0) || (b.open || 0) - (a.open || 0));
      }, [s.data, filters]);
      const atRisk = rows.filter(r => r.overdue > 0).length;
      return h`<${CardShell} title="Client health" icon="ti-heart-rate-monitor" count=${s.data ? (atRisk ? atRisk + ' at risk' : rows.length) : null} onRefresh=${s.reload} ctl=${ctl}>
        ${s.error && !s.data ? h`<${CardError} error=${s.error} onRetry=${s.reload}/>`
        : !s.data ? h`<${Loading}/>`
        : rows.length === 0 ? h`<${Empty} icon="ti-building" title="No active clients"/>`
        : rows.map(c => { const tone = c.overdue > 0 ? '#e5484d' : (c.due_week || 0) > 5 ? '#f5a623' : '#30a46c';
            const go = () => onNavigate && onNavigate('client', { clientId: c.client_id });
            return h`<div key=${c.client_id} class="ch-row" role="button" tabIndex="0" onClick=${go} onKeyDown=${(e) => { if (e.key === 'Enter') go(); }}>
              <span class="dot" style=${{ width: 8, height: 8, borderRadius: '50%', background: tone, flexShrink: 0 }} aria-label=${c.overdue > 0 ? 'At risk' : 'Healthy'}></span>
              ${Av ? h`<${Av} i=${c.initials} c=${c.color} s=${22}/>` : null}
              <span class="ch-row-t">${c.name}</span>
              <span class="ch-row-meta">
                ${c.overdue > 0 && h`<span class="ch-pill" style=${{ background: '#e5484d1f', color: '#e5484d' }} title="Overdue">${c.overdue} overdue</span>`}
                <span class="ch-pill ch-hide-sm" style=${{ background: 'var(--cu-bg3,#efeff1)', color: 'var(--cu-t2,#5c5c66)' }} title="Due this week">${c.due_week || 0} this wk</span>
                <span class="ch-muted" title="Open tasks">${c.open || 0} open</span>
              </span>
            </div>`; })}
      <//>`;
    }

    // ========================================================================
    // CARD: pipeline — legacy onboarding / SEO reports / publish queue (admin+manager)
    // ========================================================================
    function PipelineCard({ ctl, currentUser, clients }) {
      const parts = [
        OnboardingInProgressCard && h`<${CardBoundary} key="onb" name="Onboarding"><${OnboardingInProgressCard} clients=${clients} user=${currentUser}/><//>`,
        SEOReportsDueCard && h`<${CardBoundary} key="seo" name="SEO reports"><${SEOReportsDueCard} clients=${clients}/><//>`,
        PublishQueue && h`<${CardBoundary} key="pq" name="Publish queue"><${PublishQueue} currentUser=${currentUser}/><//>`,
      ].filter(Boolean);
      return h`<${CardShell} title="Pipeline" icon="ti-route" ctl=${ctl} tall=${true}>
        ${parts.length === 0 ? h`<${Empty} icon="ti-route" title="Nothing in the pipeline"/>`
          : h`<div style=${{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 4px' }}>${parts}</div>`}
      <//>`;
    }

    // ========================================================================
    // CARD: money_due — outstanding / overdue invoices (admin + accounts_head)
    // Uses the EXISTING read RPC inv_list(p_client_id, p_limit, p_include_deleted)
    // (read-guarded to admin/manager/accounts_head since migration 084).
    // ========================================================================
    function MoneyDueCard({ ctl, clients, onNavigate }) {
      const store = useStoreSafe();
      const [st, setSt] = useState({ rows: null, error: null });
      const load = useCallback(async () => {
        try { const rows = await rpcCall('inv_list', { p_limit: 500 }); setSt({ rows: arr(rows), error: null }); }
        catch (e) { setSt(s => ({ rows: s.rows, error: e })); }
      }, []);
      useEffect(() => { load(); }, [load]);
      useTickReload(load);
      const clientName = (id) => {
        const c = clientLookup(clients, id) || (typeof store.clientById === 'function' ? store.clientById(id) : store.clientById && store.clientById[id]);
        return (c && c.name) || '';
      };
      const calc = useMemo(() => {
        const today = sod();
        let outstanding = 0, overdueSum = 0, overdueCount = 0; const open = [];
        arr(st.rows).forEach(i => {
          if (i.deleted_at || i.status === 'cancelled' || i.status === 'waived') return;
          if (!['due', 'overdue', 'partial'].includes(i.status)) return;
          const bal = (Number(i.amount) || 0) - (Number(i.amount_paid) || 0) - (Number(i.tds_amount) || 0);
          if (bal <= 0) return;
          outstanding += bal;
          const late = i.status === 'overdue' || (i.due_date && new Date(i.due_date) < today);
          if (late) { overdueSum += bal; overdueCount++; }
          open.push({ ...i, bal, late });
        });
        open.sort((a, b) => (b.late - a.late) || (new Date(a.due_date || 0) - new Date(b.due_date || 0)));
        return { outstanding, overdueSum, overdueCount, top: open.slice(0, 6), openCount: open.length };
      }, [st.rows]);
      const forbidden = st.error && (st.error.code === 'forbidden' || /forbidden/i.test(errMsg(st.error)));
      const openFinance = (opts) => openBilling(onNavigate, opts && opts.invoiceId ? { view: 'invoice', invoiceId: opts.invoiceId } : null);
      const right = h`<button class="ch-link" onClick=${() => openFinance()}>Open Finance</button>`;
      return h`<${CardShell} title="Money due" icon="ti-receipt-rupee" count=${st.rows ? calc.openCount + ' open' : null} onRefresh=${load} ctl=${ctl} right=${right}>
        ${forbidden || (st.error && !st.rows) ? h`<div class="ch-empty"><i class="ti ti-receipt"></i>
            <div class="t">${forbidden ? 'Finance data is restricted' : "Couldn't load invoices"}</div>
            <div style=${{ display: 'flex', gap: 6 }}>${!forbidden && h`<button class="ch-btn sm" onClick=${load}><i class="ti ti-refresh"></i>Retry</button>`}
            <button class="ch-btn pri sm" onClick=${() => openFinance()}>Open Finance</button></div></div>`
        : !st.rows ? h`<${Loading} rows=${3}/>`
        : h`<div>
          <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '2px 6px 8px' }}>
            <div style=${{ background: 'var(--cu-bg2,#f7f7f8)', borderRadius: 6, padding: '8px 10px' }}>
              <div class="ch-muted">Outstanding</div>
              <div style=${{ font: '600 18px Inter,system-ui,sans-serif', fontVariantNumeric: 'tabular-nums' }}>${inr(calc.outstanding)}</div>
            </div>
            <div style=${{ background: calc.overdueCount ? '#e5484d14' : 'var(--cu-bg2,#f7f7f8)', borderRadius: 6, padding: '8px 10px' }}>
              <div class="ch-muted">Overdue · ${calc.overdueCount}</div>
              <div style=${{ font: '600 18px Inter,system-ui,sans-serif', fontVariantNumeric: 'tabular-nums', color: calc.overdueCount ? '#e5484d' : undefined }}>${inr(calc.overdueSum)}</div>
            </div>
          </div>
          ${calc.top.length === 0 ? h`<${Empty} icon="ti-circle-check" title="Nothing due" sub="All invoices are settled."/>`
            : calc.top.map(i => h`<div key=${i.id} class="ch-row" role="button" tabIndex="0" onClick=${() => openFinance({ invoiceId: i.id })} onKeyDown=${(e) => { if (e.key === 'Enter') openFinance({ invoiceId: i.id }); }}>
                <span class="ch-row-t">${clientName(i.client_id) || i.invoice_number}<span class="ch-muted"> · ${i.invoice_number || ''}</span></span>
                <span class="ch-row-meta">
                  ${i.due_date && h`<span class="ch-muted ch-hide-sm" style=${{ color: i.late ? '#e5484d' : undefined }}>${i.late ? 'Overdue · ' : 'Due '}${fmtDate(i.due_date)}</span>`}
                  <span style=${{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${inr(i.bal)}</span>
                </span>
              </div>`)}
        </div>`}
      <//>`;
    }

    // ========================================================================
    // CARD family: filtered task lists
    // ========================================================================
    const endOfWeek = () => { const d = new Date(); const dow = d.getDay(); return eod(addDays(d, dow === 0 ? 0 : 7 - dow)); };
    const TASK_LIST_PRESETS = [
      { key: 'overdue', label: 'Overdue', build: () => ({ overdue: true, order: 'due' }) },
      { key: 'week', label: 'Due this week', build: () => ({ due_from: sod().toISOString(), due_to: endOfWeek().toISOString(), order: 'due' }) },
      { key: 'urgent', label: 'Urgent & high', build: () => ({ priorities: [1, 2], order: 'priority' }) },
      { key: 'unassigned', label: 'Unassigned', build: () => ({ unassigned: true, order: 'due' }) },
      { key: 'created', label: 'Created by me', build: () => ({ scope: 'delegated', order: 'created' }) },
      { key: 'client', label: 'Custom client', build: (cfg) => ({ client_ids: cfg.clientId ? [cfg.clientId] : [], order: 'due' }) },
    ];
    const resolveTaskListFilter = (cfg = {}) => {
      const p = TASK_LIST_PRESETS.find(x => x.key === cfg.preset);
      return { scope: 'all', limit: 200, ...(p ? p.build(cfg) : (cfg.filter || {})) };
    };

    const LIST_VARIANTS = {
      overdue_tasks: { title: 'Overdue tasks', icon: 'ti-alarm', empty: 'Nothing overdue — nice.', build: (scope) => ({ scope, overdue: true, order: 'due', limit: 150 }) },
      due_soon: { title: 'Due soon', icon: 'ti-calendar-due', empty: 'Nothing due in the next 14 days.', build: (scope) => ({ scope, due_from: sod().toISOString(), due_to: eod(addDays(new Date(), 14)).toISOString(), order: 'due', limit: 200 }) },
      priority_tasks: { title: 'Urgent & high priority', icon: 'ti-flag', empty: 'No urgent or high priority tasks.', build: (scope) => ({ scope, priorities: [1, 2], order: 'priority', limit: 150 }) },
      completed_week: { title: 'Completed this week', icon: 'ti-circle-check', empty: 'Nothing completed in the last 7 days.', build: (scope) => ({ scope, status_categories: ['done'], order: 'updated', limit: 150 }) },
    };

    function TaskListCard({ card, ctl, currentUser, showToast }) {
      const type = card.type;
      const priv = isPriv(currentUser && currentUser.role_level);
      const v = LIST_VARIANTS[type];
      const base = type === 'task_list' ? resolveTaskListFilter(card.config) : v.build(priv ? 'all' : 'my');
      const filter = useFiltered(base, { noAssignee: base.scope === 'my' });
      const q = useTasksSafe(filter, {});
      useTickReload(q.reload);
      const removeRow = useCallback((row) => { if (q.setRows) q.setRows(rs => arr(rs).filter(r => r.id !== row.id)); }, [q.setRows]);
      const complete = useCompleteTask(showToast, removeRow);
      const rows = useMemo(() => {
        let r = arr(q.rows);
        if (type === 'completed_week') { const wk = addDays(new Date(), -7); r = r.filter(x => new Date(x.completed_at || x.updated_at || 0) >= wk); }
        if (type === 'due_soon') r = r.filter(x => !isOverdueRow(x));
        return r;
      }, [q.rows, type]);
      const title = type === 'task_list' ? ((card.config && card.config.title) || 'Task list') : v.title;
      const icon = type === 'task_list' ? 'ti-list-details' : v.icon;
      const empty = type === 'task_list' ? 'No tasks match this list.' : v.empty;
      const showAssignees = base.scope !== 'my';
      return h`<${CardShell} title=${title} icon=${icon} count=${q.loading && !rows.length ? null : rows.length} onRefresh=${q.reload} ctl=${ctl}>
        ${q.error && !rows.length ? h`<${CardError} error=${q.error} onRetry=${q.reload}/>`
        : q.loading && !rows.length ? h`<${Loading}/>`
        : rows.length === 0 ? h`<${Empty} icon=${type === 'overdue_tasks' ? 'ti-mood-happy' : icon} title=${empty}/>`
        : rows.map(r => h`<${TaskLine} key=${r.id} row=${r} onComplete=${type === 'completed_week' ? null : complete} showAssignees=${showAssignees}/>`)}
      <//>`;
    }

    // ========================================================================
    // CARD: status_breakdown — donut chart
    // ========================================================================
    function StatusBreakdownCard({ ctl }) {
      const s = useSummary();
      const data = useMemo(() => ['todo', 'active', 'done'].map(cat => {
        const f = arr(s.data && s.data.status_breakdown).find(x => x.category === cat);
        return { cat, count: (f && Number(f.count)) || 0, ...STATUS_CAT[cat] };
      }), [s.data]);
      const total = data.reduce((a, d) => a + d.count, 0);
      const R = 46, C = 2 * Math.PI * R;
      let acc = 0;
      return h`<${CardShell} title="Status breakdown" icon="ti-chart-donut" count=${s.data ? total + ' tasks' : null} onRefresh=${s.reload} ctl=${ctl}>
        ${s.error && !s.data ? h`<${CardError} error=${s.error} onRetry=${s.reload}/>`
        : !s.data ? h`<${Loading} rows=${3}/>`
        : h`<div class="ch-donut">
          <svg width="132" height="132" viewBox="0 0 120 120" role="img" aria-label=${'Status breakdown: ' + data.map(d => d.label + ' ' + d.count).join(', ')}>
            <circle cx="60" cy="60" r=${R} fill="none" strokeWidth="14" style=${{ stroke: 'var(--cu-bg3,#efeff1)' }}/>
            ${total > 0 && data.map(d => {
              if (!d.count) return null;
              const len = (d.count / total) * C;
              const gap = data.filter(x => x.count).length > 1 ? Math.min(2, len / 3) : 0;
              const el = h`<circle key=${d.cat} cx="60" cy="60" r=${R} fill="none" strokeWidth="14" stroke=${d.color}
                strokeDasharray=${Math.max(0, len - gap) + ' ' + (C - Math.max(0, len - gap))} strokeDashoffset=${-acc} transform="rotate(-90 60 60)"/>`;
              acc += len; return el;
            })}
            <text x="60" y="57" textAnchor="middle" style=${{ fill: 'var(--cu-t1,#1f1f23)', font: '600 20px Inter,system-ui,sans-serif' }}>${total}</text>
            <text x="60" y="74" textAnchor="middle" style=${{ fill: 'var(--cu-t3,#8e8e99)', font: '500 10px Inter,system-ui,sans-serif' }}>tasks</text>
          </svg>
          <div class="ch-legend">
            ${data.map(d => h`<div key=${d.cat}><i style=${{ background: d.color }}></i>${d.label}<b>${d.count}</b><span class="ch-muted" style=${{ width: 34, textAlign: 'right' }}>${total ? Math.round(d.count / total * 100) : 0}%</span></div>`)}
          </div>
        </div>`}
      <//>`;
    }

    // ========================================================================
    // CARD: assignee_breakdown — horizontal bars (open, overdue highlighted)
    // ========================================================================
    function AssigneeBreakdownCard({ ctl, onNavigate }) {
      const s = useSummary();
      const { filters } = useHomeCtx();
      const rows = useMemo(() => {
        let w = arr(s.data && s.data.workload);
        const ids = arr(filters && filters.assigneeIds);
        if (ids.length) w = w.filter(m => ids.includes(m.member_id));
        return w.slice().sort((a, b) => (b.open || 0) - (a.open || 0));
      }, [s.data, filters]);
      const max = Math.max(1, ...rows.map(r => r.open || 0));
      return h`<${CardShell} title="Open tasks by assignee" icon="ti-chart-bar" count=${s.data ? rows.reduce((a, r) => a + (r.open || 0), 0) + ' open' : null} onRefresh=${s.reload} ctl=${ctl}>
        ${s.error && !s.data ? h`<${CardError} error=${s.error} onRetry=${s.reload}/>`
        : !s.data ? h`<${Loading}/>`
        : rows.length === 0 ? h`<${Empty} icon="ti-chart-bar" title="No open tasks"/>`
        : h`<div role="list">
          ${rows.map(m => { const open = m.open || 0, late = Math.min(open, m.overdue || 0);
            return h`<div key=${m.member_id} role="listitem" class="ch-wl" aria-label=${m.name + ': ' + open + ' open, ' + late + ' overdue'}
                onClick=${() => onNavigate && onNavigate('team', { memberId: m.member_id })}>
              <span class="nm">${Av ? h`<${Av} i=${m.initials} c=${m.color} s=${22} round=${true}/>` : null}<span>${m.name}</span></span>
              <span class="ch-bar" style=${{ height: 10 }}>
                <span style=${{ width: (late / max * 100) + '%', background: '#e5484d' }}></span>
                <span style=${{ width: ((open - late) / max * 100) + '%', background: '#7b68ee' }}></span>
              </span>
              <span class="num"><b style=${{ color: 'var(--cu-t1,#1f1f23)' }}>${open}</b>${late ? h` <span style=${{ color: '#e5484d' }}>(${late})</span>` : ''}</span>
            </div>`; })}
          <div class="ch-muted" style=${{ display: 'flex', gap: 12, padding: '8px 8px 0' }}>
            <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style=${{ width: 8, height: 8, borderRadius: 2, background: '#7b68ee', display: 'inline-block' }}></i>Open</span>
            <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style=${{ width: 8, height: 8, borderRadius: 2, background: '#e5484d', display: 'inline-block' }}></i>Overdue</span>
          </div>
        </div>`}
      <//>`;
    }

    // ========================================================================
    // CARD: notes (legacy NotesPanel)
    // ========================================================================
    function NotesCard({ ctl, currentUser }) {
      return h`<${CardShell} title="Notes" icon="ti-notes" ctl=${ctl} tall=${true}>
        ${NotesPanel ? h`<${CardBoundary} name="Notes"><${NotesPanel} user=${currentUser}/><//>` : h`<${Empty} icon="ti-notes" title="Notes unavailable"/>`}
      <//>`;
    }

    // ========================================================================
    // CARD: bookmarks — favorites (tasks / clients / lists / views / links)
    // ========================================================================
    const FAV_ICON = { task: 'ti-checkbox', client: 'ti-building', list: 'ti-list', view: 'ti-layout-kanban', url: 'ti-link' };
    function BookmarksCard({ ctl, onNavigate, showToast }) {
      const store = useStoreSafe();
      const favs = arr(store.favorites).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
      const [label, setLabel] = useState('');
      const [url, setUrl] = useState('');
      const [busy, setBusy] = useState(false);
      const open = (f) => {
        if (f.kind === 'task') return goTask(f.ref_id);
        if (f.kind === 'client') return onNavigate && onNavigate('client', { clientId: f.ref_id });
        if (f.kind === 'list') return onNavigate && onNavigate('list', { listId: f.ref_id });
        if (f.kind === 'view') return onNavigate && onNavigate('view', { viewId: f.ref_id });
        const u = f.url || f.ref_id; if (/^https?:\/\//i.test(u || '')) window.open(u, '_blank', 'noopener');
      };
      const remove = async (f) => {
        try { await API.favoriteToggle(f.kind, f.ref_id, f.label, f.url); store.reload && store.reload(); }
        catch (e) { toast(showToast, 'Could not remove: ' + errMsg(e)); }
      };
      const add = async (close) => {
        let u = url.trim(); if (!u) return;
        if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
        if (!/^https?:\/\//i.test(u)) { toast(showToast, 'Only http(s) links can be bookmarked'); return; }
        const l = label.trim() || u.replace(/^https?:\/\//i, '').replace(/\/$/, '');
        setBusy(true);
        try { await API.favoriteToggle('url', u, l, u); setLabel(''); setUrl(''); close(); store.reload && store.reload(); }
        catch (e) { toast(showToast, 'Could not add bookmark: ' + errMsg(e)); }
        setBusy(false);
      };
      const right = h`<${PopButton} className="ch-btn sm" icon="ti-plus" label="Add bookmark" width=${280}>
        ${(close) => h`<form style=${{ padding: 10 }} onSubmit=${(e) => { e.preventDefault(); add(close); }}>
          <label class="ch-label" style=${{ marginTop: 0 }} for="ch-bm-l">Label</label>
          <input id="ch-bm-l" class="ch-input" value=${label} onInput=${(e) => setLabel(e.target.value)} placeholder="e.g. Brand guidelines"/>
          <label class="ch-label" for="ch-bm-u">URL</label>
          <input id="ch-bm-u" class="ch-input" value=${url} onInput=${(e) => setUrl(e.target.value)} placeholder="https://" required/>
          <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
            <button type="button" class="ch-btn sm" onClick=${close}>Cancel</button>
            <button type="submit" class="ch-btn pri sm" disabled=${busy || !url.trim()}>Add</button>
          </div>
        </form>`}
      <//>`;
      return h`<${CardShell} title="Bookmarks" icon="ti-bookmark" count=${favs.length || null} ctl=${ctl} right=${right}>
        ${!store.ready && !favs.length ? h`<${Loading} rows=${3}/>`
        : favs.length === 0 ? h`<${Empty} icon="ti-bookmark" title="No bookmarks yet" sub="Star tasks, clients and lists, or add a link."/>`
        : favs.map(f => h`<div key=${f.id || f.kind + f.ref_id} class="ch-fav" role="button" tabIndex="0" onClick=${() => open(f)} onKeyDown=${(e) => { if (e.key === 'Enter') open(f); }}>
            <i class=${'ti ' + (FAV_ICON[f.kind] || 'ti-star')} style=${{ color: 'var(--cu-t3,#8e8e99)', fontSize: 15 }} aria-hidden="true"></i>
            <span class="ch-row-t">${f.label || f.url || f.ref_id}</span>
            ${f.kind === 'url' && h`<i class="ti ti-external-link ch-muted" aria-hidden="true"></i>`}
            <button class="ch-ibtn x" aria-label=${'Remove bookmark ' + (f.label || '')} onClick=${(e) => { e.stopPropagation(); remove(f); }}><i class="ti ti-x"></i></button>
          </div>`)}
      <//>`;
    }

    // ========================================================================
    // v2 CARDS
    // ========================================================================
    // Billing deep links: billing.js reads window.__amsBillingIntent on mount and
    // listens for `ams-billing-open` { view: 'invoice'|'gst'|'gst3b'|'tds'|'reports', invoiceId?, period? }.
    function openBilling(onNavigate, detail) {
      if (detail) { try { window.__amsBillingIntent = Object.assign({ at: Date.now() }, detail); } catch (_) {} }
      if (onNavigate) onNavigate('billing', detail && detail.invoiceId ? { invoiceId: detail.invoiceId } : undefined);
      if (detail) setTimeout(() => { try { window.dispatchEvent(new CustomEvent('ams-billing-open', { detail })); } catch (_) {} }, 80);
    }
    const PRIO_FB = { 1: { label: 'Urgent', color: '#e5484d' }, 2: { label: 'High', color: '#f5a623' }, 3: { label: 'Normal', color: '#4c8df6' }, 4: { label: 'Low', color: '#9aa0a6' } };
    const prioMeta = (p) => (PRIORITIES && PRIORITIES[p]) || PRIO_FB[p] || { label: 'No priority', color: '#c4c4cc' };
    const statusDot = (r, onComplete) => {
      const done = isDoneRow(r);
      return h`<button style=${{ background: 'none', border: 0, padding: 0, cursor: done || !onComplete ? 'default' : 'pointer', display: 'inline-flex', borderRadius: '50%' }}
          disabled=${done || !onComplete} aria-label=${done ? 'Completed' : 'Mark complete: ' + (r.title || '')} title=${done ? (r.status_name || 'Complete') : 'Mark complete'}
          onClick=${(e) => { e.stopPropagation(); if (!done && onComplete) onComplete(r); }}>
        ${StatusIcon ? h`<${StatusIcon} category=${r.status_category} color=${r.status_color} size=${16}/>`
          : h`<i class=${'ti ' + (done ? 'ti-circle-check-filled' : 'ti-circle')} style=${{ color: r.status_color || 'var(--cu-t3)', fontSize: 16 }}></i>`}
      </button>`;
    };

    // ---- revisions — my posts the client sent back ---------------------------
    function RevisionsCard({ ctl }) {
      const f = useFiltered({ scope: 'my', types: ['post'], statuses: ['revision'], order: 'updated', limit: 100 }, { noAssignee: true });
      const q = useTasksSafe(f, {});
      useTickReload(q.reload);
      const rows = useMemo(() => arr(q.rows).filter(r => !isDoneRow(r) && (!r.status || r.status === 'revision'))
        .map(r => ({ ...r, days: Math.max(0, Math.floor((Date.now() - new Date(r.updated_at || r.created_at || Date.now()).getTime()) / 86400000)) }))
        .sort((a, b) => b.days - a.days), [q.rows]);
      return h`<${CardShell} title="Revisions requested" icon="ti-refresh-alert" count=${q.loading && !rows.length ? null : rows.length} onRefresh=${q.reload} ctl=${ctl}>
        ${q.error && !rows.length ? h`<${CardError} error=${q.error} onRetry=${q.reload}/>`
        : q.loading && !rows.length ? h`<${Loading} rows=${3}/>`
        : rows.length === 0 ? h`<${Empty} icon="ti-mood-happy" title="No revisions waiting" sub="Posts clients send back for changes show up here."/>`
        : rows.map(r => h`<div key=${r.id} class="ch-row" role="button" tabIndex="0" onClick=${() => goTask(r.id, r.title)} onKeyDown=${(e) => { if (e.key === 'Enter') goTask(r.id, r.title); }}>
            <i class=${'ti ' + (POST_ICON[r.post && r.post.type] || 'ti-photo')} style=${{ color: '#e5484d', fontSize: 15, flexShrink: 0 }} aria-hidden="true"></i>
            <span class="ch-row-t" title=${r.title}>${r.title || 'Untitled post'}</span>
            <span class="ch-row-meta">
              ${r.client_id && (ClientBadge ? h`<span class="ch-hide-sm"><${ClientBadge} clientId=${r.client_id}/></span>` : h`<span class="ch-muted ch-hide-sm">${r.client_name || ''}</span>`)}
              ${r.due_at && DueChip && h`<span class="ch-hide-sm"><${DueChip} row=${r}/></span>`}
              <span class="ch-pill" title="Days since changes were requested" style=${{ background: (r.days >= 2 ? '#e5484d' : '#f5a623') + '1f', color: r.days >= 2 ? '#e5484d' : '#b7791f' }}>${r.days ? r.days + 'd' : 'Today'}</span>
            </span>
          </div>`)}
      <//>`;
    }

    // ---- SEO reports due (wraps seo.js SEOReportsDueCard) ---------------------
    function SeoReportsDueHomeCard({ ctl, clients, onNavigate }) {
      const right = h`<button class="ch-link" onClick=${() => onNavigate && onNavigate('seo')}>Open SEO</button>`;
      return h`<${CardShell} title="SEO reports due" icon="ti-trending-up" ctl=${ctl} right=${right} tall=${true}>
        ${SEOReportsDueCard
          ? h`<div style=${{ padding: '0 4px' }}><${CardBoundary} name="SEO reports due"><${SEOReportsDueCard} clients=${clientList(clients)}/><//></div>`
          : h`<${Empty} icon="ti-trending-up" title="SEO module isn't loaded" sub="Reload the page to see which reports are due."/>`}
      <//>`;
    }

    // ---- invoices this month (finance roles; existing inv_list read RPC) -----
    const invDate = (i) => i.issued_on || i.invoice_date || i.created_at || i.period_start;
    const invBal = (i) => (Number(i.amount) || 0) - (Number(i.amount_paid) || 0) - (Number(i.tds_amount) || 0);
    const INV_TONE = { paid: '#30a46c', partial: '#4c8df6', due: '#f5a623', overdue: '#e5484d', draft: '#87909e', waived: '#87909e' };
    function InvoicesMonthCard({ ctl, clients, onNavigate }) {
      const store = useStoreSafe();
      const [mOff, setMOff] = useState(0);
      const inv = useRpcData(() => rpcCall('inv_list', { p_limit: 1000 }), { poll: 300000 });
      const month = useMemo(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + mOff); return d; }, [mOff]);
      const clientName = (id) => { const c = clientLookup(clients, id) || (typeof store.clientById === 'function' ? store.clientById(id) : store.clientById && store.clientById[id]); return (c && c.name) || ''; };
      const calc = useMemo(() => {
        const start = month, end = new Date(month); end.setMonth(end.getMonth() + 1);
        const rows = arr(inv.data).filter(i => !i.deleted_at && i.status !== 'cancelled' && invDate(i))
          .filter(i => { const x = new Date(invDate(i)); return x >= start && x < end; });
        let billed = 0, received = 0, open = 0, credit = 0; const by = {};
        rows.forEach(i => {
          const amt = Math.abs(Number(i.amount) || 0);
          if (i.type === 'credit_note') { credit += amt; return; }
          billed += amt; received += Number(i.amount_paid) || 0;
          if (['due', 'overdue', 'partial'].includes(i.status)) open += Math.max(0, invBal(i));
          by[i.status || 'due'] = (by[i.status || 'due'] || 0) + 1;
        });
        rows.sort((a, b) => new Date(invDate(b)) - new Date(invDate(a)));
        return { rows, billed: billed - credit, credit, received, open, by, count: rows.filter(i => i.type !== 'credit_note').length };
      }, [inv.data, month]);
      const mLabel = month.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      const right = h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <button class="ch-ibtn" aria-label="Previous month" onClick=${() => setMOff(o => o - 1)}><i class="ti ti-chevron-left"></i></button>
        <button class="ch-btn sm" aria-label="Jump to this month" onClick=${() => setMOff(0)}>${mLabel}</button>
        <button class="ch-ibtn" aria-label="Next month" disabled=${mOff >= 0} onClick=${() => setMOff(o => Math.min(0, o + 1))}><i class="ti ti-chevron-right"></i></button>
      </span>`;
      const forbidden = isForbidden(inv.error);
      return h`<${CardShell} title="Invoices this month" icon="ti-file-invoice" count=${inv.data ? calc.count : null} onRefresh=${inv.reload} ctl=${ctl} right=${right}>
        ${inv.missing || forbidden || (inv.error && !inv.data) ? h`<div class="ch-empty"><i class="ti ti-file-invoice"></i>
            <div class="t">${forbidden ? 'Finance data is restricted' : inv.missing ? 'Invoices are unavailable' : "Couldn't load invoices"}</div>
            <div style=${{ display: 'flex', gap: 6 }}>${!forbidden && !inv.missing && h`<button class="ch-btn sm" onClick=${inv.reload}><i class="ti ti-refresh"></i>Retry</button>`}
            <button class="ch-btn pri sm" onClick=${() => openBilling(onNavigate, null)}>Open Finance</button></div></div>`
        : inv.loading ? h`<${Loading} rows=${3}/>`
        : h`<div>
          <div class="ch-kpis">
            <div class="ch-kpi"><div class="ch-muted">Billed</div><div class="v" title=${calc.credit ? 'After ' + inr(calc.credit) + ' credit notes' : ''}>${inr(calc.billed)}</div></div>
            <div class="ch-kpi"><div class="ch-muted">Received</div><div class="v" style=${{ color: '#30a46c' }}>${inr(calc.received)}</div></div>
            <div class="ch-kpi"><div class="ch-muted">Outstanding</div><div class="v" style=${{ color: calc.open ? '#e5484d' : undefined }}>${inr(calc.open)}</div></div>
          </div>
          ${Object.keys(calc.by).length > 0 && h`<div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 8px 6px' }}>
            ${Object.keys(calc.by).sort().map(k => { const c = INV_TONE[k] || '#87909e'; return h`<span key=${k} class="ch-pill" style=${{ background: c + '1f', color: c, textTransform: 'capitalize' }}>${calc.by[k]} ${k}</span>`; })}
          </div>`}
          ${calc.rows.length === 0 ? h`<${Empty} icon="ti-file-invoice" title=${'No invoices in ' + mLabel}/>`
            : calc.rows.slice(0, 8).map(i => { const c = INV_TONE[i.status] || '#87909e';
                return h`<div key=${i.id} class="ch-row" role="button" tabIndex="0" onClick=${() => openBilling(onNavigate, { view: 'invoice', invoiceId: i.id })} onKeyDown=${(e) => { if (e.key === 'Enter') openBilling(onNavigate, { view: 'invoice', invoiceId: i.id }); }}>
                  <span class="ch-row-t">${clientName(i.client_id) || i.invoice_number || 'Invoice'}<span class="ch-muted"> · ${i.invoice_number || ''}${i.type === 'credit_note' ? ' · credit note' : ''}</span></span>
                  <span class="ch-row-meta">
                    <span class="ch-muted ch-hide-sm">${fmtDate(invDate(i))}</span>
                    <span class="ch-pill ch-hide-sm" style=${{ background: c + '1f', color: c, textTransform: 'capitalize' }}>${i.status || 'due'}</span>
                    <span style=${{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${inr(Math.abs(Number(i.amount) || 0))}</span>
                  </span>
                </div>`; })}
        </div>`}
      <//>`;
    }

    // ---- GST / TDS exports shortcut (finance roles) ---------------------------
    // GSTR-1 is due on the 11th and GSTR-3B on the 20th of the month after the period.
    const nextFiling = (dom) => {
      const now = sod(new Date());
      const dueThis = new Date(now.getFullYear(), now.getMonth(), dom);
      const due = now <= dueThis ? dueThis : new Date(now.getFullYear(), now.getMonth() + 1, dom);
      const period = new Date(due.getFullYear(), due.getMonth() - 1, 1);
      const days = Math.round((due - now) / 86400000);
      return { due, period, days, periodKey: period.getFullYear() + '-' + String(period.getMonth() + 1).padStart(2, '0') };
    };
    function GstExportsCard({ ctl, onNavigate }) {
      const g1 = nextFiling(11), g3 = nextFiling(20);
      const per = (x) => x.period.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      const dueTxt = (x) => (x.days === 0 ? 'due today' : 'due ' + fmtDate(x.due) + ' · ' + x.days + 'd');
      const tone = (x) => (x.days <= 3 ? '#e5484d' : x.days <= 7 ? '#f5a623' : 'var(--cu-t3,#8e8e99)');
      const tiles = [
        { k: 'gst', icon: 'ti-file-spreadsheet', name: 'GSTR-1 export', ds: per(g1) + ' · ' + dueTxt(g1), col: tone(g1), detail: { view: 'gst', form: 'gstr1', period: g1.periodKey } },
        { k: 'gst3b', icon: 'ti-receipt-tax', name: 'GSTR-3B summary', ds: per(g3) + ' · ' + dueTxt(g3), col: tone(g3), detail: { view: 'gst', form: 'gstr3b', period: g3.periodKey } },
        { k: 'tds', icon: 'ti-receipt-refund', name: 'TDS report', ds: 'TDS deducted by clients', detail: { view: 'tds' } },
        { k: 'reports', icon: 'ti-chart-histogram', name: 'Aging & income', ds: 'Receivables and income reports', detail: { view: 'reports' } },
      ];
      return h`<${CardShell} title="GST & TDS exports" icon="ti-receipt-tax" ctl=${ctl}>
        <div class="ch-shorts">
          ${tiles.map(t => h`<button key=${t.k} type="button" class="ch-short" onClick=${() => openBilling(onNavigate, t.detail)}>
            <span class="ic"><i class=${'ti ' + t.icon} aria-hidden="true"></i></span>
            <span class="nm">${t.name}</span>
            <span class="ds" style=${t.col ? { color: t.col } : undefined}>${t.ds}</span>
          </button>`)}
        </div>
      <//>`;
    }

    // ---- brand guidelines shortcut (brands from my open tasks) ----------------
    function BrandGuidelinesCard({ ctl, currentUser, clients, onNavigate }) {
      const store = useStoreSafe();
      const role = currentUser && currentUser.role_level;
      const f = useFiltered({ scope: 'my', limit: 500, order: 'due' }, { noAssignee: true });
      const q = useTasksSafe(f, {});
      useTickReload(q.reload);
      const [showAll, setShowAll] = useState(false);
      const pool = arr(store.clients).length ? store.clients : clientList(clients);
      const mine = useMemo(() => {
        const m = {};
        arr(q.rows).forEach(r => {
          if (!r.client_id) return;
          if (!m[r.client_id]) {
            const c = pool.find(x => String(x.id) === String(r.client_id));
            m[r.client_id] = { id: r.client_id, name: (c && c.name) || r.client_name || 'Client', initials: (c && c.initials) || r.client_initials, color: (c && (c.color || c.brand_color_primary)) || r.client_color, open: 0 };
          }
          m[r.client_id].open++;
        });
        return Object.values(m).sort((a, b) => b.open - a.open || String(a.name).localeCompare(String(b.name)));
      }, [q.rows, pool]);
      const all = useMemo(() => pool.filter(c => (c.status || 'active') === 'active')
        .map(c => ({ id: c.id, name: c.name, initials: c.initials, color: c.color || c.brand_color_primary, open: (mine.find(x => String(x.id) === String(c.id)) || {}).open || 0 }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name))), [pool, mine]);
      const list = showAll || (!mine.length && isPriv(role)) ? all : mine;
      const openBrand = (id) => {
        if (role === 'editor' || role === 'designer' || role === 'freelancer') {
          try { window.dispatchEvent(new CustomEvent('ams-open-brand', { detail: { clientId: id, tab: 'brand' } })); } catch (_) {}
          if (onNavigate) onNavigate('client', { clientId: id, tab: 'brand' });
          return;
        }
        // Dashboard shell: the hash router opens the client and ClientDetail reads the sub-tab.
        try { window.location.hash = '#/clients/' + encodeURIComponent(id) + '/brand'; }
        catch (_) { if (onNavigate) onNavigate('client', { clientId: id, tab: 'brand' }); }
      };
      const right = isPriv(role) && mine.length > 0 ? h`<button class=${'ch-chip' + (showAll ? ' on' : '')} aria-pressed=${showAll ? 'true' : 'false'} onClick=${() => setShowAll(v => !v)}>All brands</button>` : null;
      return h`<${CardShell} title="Brand guidelines" icon="ti-palette" count=${list.length || null} onRefresh=${q.reload} ctl=${ctl} right=${right}>
        ${q.error && !list.length ? h`<${CardError} error=${q.error} onRetry=${q.reload}/>`
        : q.loading && !list.length ? h`<${Loading} rows=${3}/>`
        : list.length === 0 ? h`<${Empty} icon="ti-palette" title="No brands yet" sub="Brands you have open tasks for appear here."/>`
        : list.slice(0, 30).map(c => h`<div key=${c.id} class="ch-row" role="button" tabIndex="0" aria-label=${'Open brand guidelines for ' + c.name}
              onClick=${() => openBrand(c.id)} onKeyDown=${(e) => { if (e.key === 'Enter') openBrand(c.id); }}>
            ${Av ? h`<${Av} i=${c.initials || String(c.name || '?').slice(0, 2).toUpperCase()} c=${c.color || '#87909e'} s=${22}/>` : null}
            <span class="ch-row-t">${c.name}</span>
            <span class="ch-row-meta">
              ${c.open > 0 && h`<span class="ch-muted ch-hide-sm">${c.open} open</span>`}
              <span class="ch-link" aria-hidden="true">Brand profile <i class="ti ti-arrow-up-right"></i></span>
            </span>
          </div>`)}
      <//>`;
    }

    // ---- priority breakdown (home_summary.priority_breakdown) ------------------
    function PriorityBreakdownCard({ ctl }) {
      const s = useSummary();
      const raw = s.data && s.data.priority_breakdown;
      const data = useMemo(() => [1, 2, 3, 4, null].map(p => {
        const f = arr(raw).find(x => (x.priority == null ? null : Number(x.priority)) === p);
        const m = p == null ? { label: 'No priority', color: '#c4c4cc' } : prioMeta(p);
        return { p, count: (f && Number(f.count)) || 0, label: m.label, color: m.color };
      }), [raw]);
      const total = data.reduce((a, d) => a + d.count, 0);
      const max = Math.max(1, ...data.map(d => d.count));
      return h`<${CardShell} title="Priority breakdown" icon="ti-flag-3" count=${s.data && raw ? total + ' open' : null} onRefresh=${s.reload} ctl=${ctl}>
        ${s.error && !s.data ? h`<${CardError} error=${s.error} onRetry=${s.reload}/>`
        : !s.data ? h`<${Loading} rows=${3}/>`
        : !Array.isArray(raw) ? h`<${Empty} icon="ti-flag-3" title="No priority data yet"/>`
        : total === 0 ? h`<${Empty} icon="ti-flag-3" title="No open tasks"/>`
        : h`<div style=${{ padding: '2px 4px' }}>
          <div class="ch-bar" style=${{ height: 10, margin: '4px 4px 10px' }} role="img" aria-label=${data.map(d => d.label + ' ' + d.count).join(', ')}>
            ${data.filter(d => d.count).map(d => h`<span key=${String(d.p)} style=${{ width: (d.count / total * 100) + '%', background: d.color }}></span>`)}
          </div>
          ${data.map(d => h`<div key=${String(d.p)} class="ch-wl" style=${{ cursor: 'default' }}>
            <span class="nm"><i class=${'ti ' + (d.p == null ? 'ti-flag' : 'ti-flag-filled')} style=${{ color: d.color }} aria-hidden="true"></i><span>${d.label}</span></span>
            <span class="ch-bar"><span style=${{ width: (d.count / max * 100) + '%', background: d.color }}></span></span>
            <span class="num"><b style=${{ color: 'var(--cu-t1,#1f1f23)' }}>${d.count}</b> · ${Math.round(d.count / total * 100)}%</span>
          </div>`)}
        </div>`}
      <//>`;
    }

    // ---- recents (shared with the ⌘K palette: localStorage ams_recent_items) ---
    const K_RECENT = 'ams_recent_items';
    function RecentsCard({ ctl, onNavigate }) {
      const [items, setItems] = useState(() => arr(lsGet(K_RECENT, [])));
      useEffect(() => {
        const re = () => setItems(arr(lsGet(K_RECENT, [])));
        const onStorage = (e) => { if (!e.key || e.key === K_RECENT) re(); };
        window.addEventListener('ams-recents-changed', re); window.addEventListener('storage', onStorage); window.addEventListener('focus', re);
        return () => { window.removeEventListener('ams-recents-changed', re); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', re); };
      }, []);
      const titles = window.__amsTaskTitles || {};
      const rows = arr(items).map(r => (r && r.kind === 'task' && !r.label && titles[r.id]
        ? { ...r, label: titles[r.id].title, type: r.type || titles[r.id].type, meta: r.meta || titles[r.id].client_name } : r))
        .filter(r => r && r.id && r.label).slice(0, 12);
      const open = (r) => {
        if (r.kind === 'task') return goTask(r.id, r.label);
        if (!onNavigate) return;
        if (r.kind === 'client') onNavigate('client', { clientId: r.id });
        else if (r.kind === 'list') onNavigate('list', { listId: r.id });
        else if (r.kind === 'member') onNavigate('member', { memberId: r.id });
      };
      const clear = () => { lsSet(K_RECENT, []); setItems([]); try { window.dispatchEvent(new CustomEvent('ams-recents-changed')); } catch (_) {} };
      const icon = (r) => {
        if (r.kind === 'task') return TypeIcon ? h`<${TypeIcon} type=${r.type || 'task'}/>` : h`<i class="ti ti-circle-check"></i>`;
        if ((r.kind === 'client' || r.kind === 'member') && Av) return h`<${Av} i=${r.initials || String(r.label).slice(0, 2).toUpperCase()} c=${r.color || '#87909e'} s=${20} round=${r.kind === 'member'}/>`;
        return h`<i class=${'ti ' + (r.kind === 'list' ? 'ti-list' : 'ti-point')} style=${{ color: 'var(--cu-t3,#8e8e99)' }}></i>`;
      };
      const right = rows.length ? h`<button class="ch-link" onClick=${clear}>Clear</button>` : null;
      return h`<${CardShell} title="Recents" icon="ti-history" count=${rows.length || null} ctl=${ctl} right=${right}>
        ${rows.length === 0 ? h`<${Empty} icon="ti-history" title="Nothing recent yet" sub="Tasks, clients and lists you open show up here."/>`
        : rows.map(r => h`<div key=${r.kind + ':' + r.id} class="ch-row" role="button" tabIndex="0" onClick=${() => open(r)} onKeyDown=${(e) => { if (e.key === 'Enter') open(r); }}>
            <span style=${{ display: 'inline-flex', width: 20, justifyContent: 'center', flexShrink: 0 }}>${icon(r)}</span>
            <span class="ch-row-t">${r.label}${r.meta ? h`<span class="ch-muted"> · ${r.meta}</span>` : ''}</span>
            <span class="ch-row-meta">${r.custom_id && h`<span class="ch-muted ch-hide-sm">${r.custom_id}</span>`}${r.ts && h`<span class="ch-muted">${rel(r.ts)}</span>`}</span>
          </div>`)}
      <//>`;
    }

    // ---- resources (attachments_recent) ----------------------------------------
    const fileIcon = (mime, name) => {
      const m = String(mime || ''), n = String(name || '').toLowerCase();
      if (m.indexOf('image/') === 0) return ['ti-photo', '#8b5cf6'];
      if (m.indexOf('video/') === 0) return ['ti-movie', '#e5484d'];
      if (m.indexOf('pdf') >= 0 || /\.pdf$/.test(n)) return ['ti-file-type-pdf', '#e5484d'];
      if (/sheet|excel|csv/.test(m) || /\.(xlsx?|csv)$/.test(n)) return ['ti-file-spreadsheet', '#30a46c'];
      if (/word|document/.test(m) || /\.docx?$/.test(n)) return ['ti-file-text', '#4c8df6'];
      if (/zip|compressed/.test(m) || /\.(zip|rar|7z)$/.test(n)) return ['ti-file-zip', '#f5a623'];
      return ['ti-file', '#87909e'];
    };
    const fmtSize = (b) => { const n = Number(b) || 0; if (!n) return ''; if (n < 1024) return n + ' B'; if (n < 1048576) return Math.round(n / 1024) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; };
    function ResourcesCard({ ctl }) {
      const r = useRpcData(() => API.attachmentsRecent(20), { poll: 300000 });
      const rows = arr(r.data);
      return h`<${CardShell} title="Resources" icon="ti-paperclip" count=${rows.length || null} onRefresh=${r.reload} ctl=${ctl}>
        ${r.missing ? h`<${NotYet} icon="ti-paperclip" what="Resources"/>`
        : r.error && !rows.length ? h`<${CardError} error=${r.error} onRetry=${r.reload}/>`
        : r.loading ? h`<${Loading} rows=${3}/>`
        : rows.length === 0 ? h`<${Empty} icon="ti-paperclip" title="No files yet" sub="Files attached to tasks you can see show up here."/>`
        : rows.map(a => { const [ic, col] = fileIcon(a.mime, a.name); const url = safeHttp(a.url);
            const meta = [a.task_title, a.uploaded_by_name, fmtSize(a.size)].filter(Boolean).join(' · ');
            const openFile = () => { if (url) window.open(url, '_blank', 'noopener'); else if (a.task_id) goTask(a.task_id, a.task_title); };
            return h`<div key=${a.id} class="ch-row" role="button" tabIndex="0" onClick=${openFile} onKeyDown=${(e) => { if (e.key === 'Enter') openFile(); }} style=${{ alignItems: 'center' }}>
              <span class="ch-kind" style=${{ background: col + '1f', color: col }}><i class=${'ti ' + ic} aria-hidden="true"></i></span>
              <span style=${{ flex: 1, minWidth: 0 }}>
                <span class="ch-row-t" style=${{ display: 'block' }} title=${a.name}>${a.name || 'File'}</span>
                ${meta && h`<span class="ch-muted" style=${{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${meta}</span>`}
              </span>
              <span class="ch-row-meta">
                <span class="ch-muted ch-hide-sm">${a.created_at ? rel(a.created_at) : ''}</span>
                ${a.task_id && h`<button class="ch-ibtn" title="Open task" aria-label=${'Open task ' + (a.task_title || '')} onClick=${(e) => { e.stopPropagation(); goTask(a.task_id, a.task_title); }}><i class="ti ti-checkbox"></i></button>`}
              </span>
            </div>`; })}
      <//>`;
    }

    // ---- Up next / LineUp (lineup_get / lineup_set, drag to reorder) ------------
    function LineupAdder({ existingIds, onAdd, close }) {
      const [q, setQ] = useState('');
      const f = useStable({ scope: 'my', limit: 300, order: 'due' });
      const t = useTasksSafe(f, {});
      const s = q.trim().toLowerCase();
      const list = arr(t.rows).filter(r => !existingIds.includes(r.id) && !isDoneRow(r)
        && (!s || (r.title || '').toLowerCase().includes(s) || (r.client_name || '').toLowerCase().includes(s))).slice(0, 30);
      return h`<div style=${{ padding: 8 }}>
        <input class="ch-input" autoFocus=${true} placeholder="Search your open tasks" aria-label="Search your open tasks" value=${q}
          onInput=${(e) => setQ(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && list[0]) { onAdd(list[0]); close(); } }}/>
        <div class="ch-srch" role="listbox" aria-label="Tasks">
          ${t.loading && !arr(t.rows).length ? h`<${Loading} rows=${3}/>`
          : list.length === 0 ? h`<div class="ch-muted" style=${{ padding: '8px 6px' }}>${s ? 'No matching tasks' : 'All your open tasks are already in Up next'}</div>`
          : list.map(r => h`<button key=${r.id} role="option" aria-selected="false" class="ch-mi" style=${{ height: 'auto', minHeight: 32, padding: '4px 8px' }} onClick=${() => { onAdd(r); close(); }}>
              ${StatusIcon ? h`<${StatusIcon} category=${r.status_category} color=${r.status_color} size=${14}/>` : h`<i class="ti ti-circle"></i>`}
              <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${r.title}</span>
              ${r.client_name && h`<span class="ch-muted" style=${{ flexShrink: 0, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${r.client_name}</span>`}
            </button>`)}
        </div>
      </div>`;
    }
    function LineupCard({ ctl, showToast }) {
      const lu = useRpcData(() => API.lineupGet(), { poll: 120000 });
      const [order, setOrder] = useState(null);
      useEffect(() => { if (lu.data) setOrder(arr(lu.data)); }, [lu.data]);
      const reloadRef = useRef(lu.reload); reloadRef.current = lu.reload;
      useEffect(() => {
        if (!taskBus || !taskBus.on) return undefined;
        let t = null;
        const kick = () => { clearTimeout(t); t = setTimeout(() => reloadRef.current(), 1500); };
        const offs = [taskBus.on('task:changed', kick), taskBus.on('task:deleted', kick)];
        return () => { clearTimeout(t); offs.forEach(off => { if (typeof off === 'function') off(); }); };
      }, []);
      const rows = arr(order);
      const saveT = useRef(null), pending = useRef(null);
      useEffect(() => () => { clearTimeout(saveT.current); if (pending.current) API.lineupSet(pending.current).catch(noop); }, []);
      const persist = (next, prev) => {
        setOrder(next);
        pending.current = next.map(r => r.id);
        clearTimeout(saveT.current);
        saveT.current = setTimeout(() => {
          const ids = pending.current; pending.current = null;
          if (ids) API.lineupSet(ids).catch(e => { setOrder(prev); toast(showToast, 'Could not save order: ' + errMsg(e)); });
        }, 500);
      };
      const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= rows.length) return; const next = rows.slice(); [next[i], next[j]] = [next[j], next[i]]; persist(next, rows); };
      const remove = (row) => {
        const prev = rows; setOrder(rows.filter(r => r.id !== row.id));
        API.lineupRemove(row.id).then(() => emitTask(row.id)).catch(e => { setOrder(prev); toast(showToast, 'Could not remove: ' + errMsg(e)); });
      };
      const add = (row) => {
        if (rows.some(r => r.id === row.id)) return;
        const prev = rows; setOrder(rows.concat(row));
        API.lineupAdd(row.id).then(() => emitTask(row.id))
          .catch(e => { setOrder(prev); toast(showToast, isMissingRpc(e) ? "Up next isn't available yet" : 'Could not add: ' + errMsg(e)); });
      };
      const complete = useCompleteTask(showToast, (row) => setOrder(rs => arr(rs).filter(x => x.id !== row.id)));
      const dragId = useRef(null);
      const [drag, setDrag] = useState(null);
      const [over, setOver] = useState(null);
      const drop = (targetId) => {
        const from = dragId.current; dragId.current = null; setDrag(null); setOver(null);
        if (!from || from === targetId) return;
        const moved = rows.find(r => r.id === from); if (!moved) return;
        const next = rows.filter(r => r.id !== from); const idx = next.findIndex(r => r.id === targetId);
        next.splice(idx < 0 ? next.length : idx, 0, moved); persist(next, rows);
      };
      const right = !lu.missing ? h`<${PopButton} className="ch-btn sm" icon="ti-plus" label="Add" title="Add a task to Up next" width=${320}>
        ${(close) => h`<${LineupAdder} existingIds=${rows.map(r => r.id)} onAdd=${add} close=${close}/>`}
      <//>` : null;
      return h`<${CardShell} title="Up next" icon="ti-list-numbers" count=${rows.length || null} onRefresh=${lu.reload} ctl=${ctl} right=${right}>
        ${lu.missing ? h`<${NotYet} icon="ti-list-numbers" what="Up next"/>`
        : lu.error && !order ? h`<${CardError} error=${lu.error} onRetry=${lu.reload}/>`
        : !order ? h`<${Loading} rows=${3}/>`
        : rows.length === 0 ? h`<${Empty} icon="ti-list-numbers" title="Plan what's next" sub="Add the few tasks you'll do next and drag them into order."/>`
        : h`<div role="list" aria-label="Up next — Alt+Arrow keys reorder">
          ${rows.map((r, i) => h`<div key=${r.id} role="listitem" tabIndex="0" draggable="true" aria-label=${(i + 1) + '. ' + (r.title || 'Untitled')}
              class=${'ch-lu' + (i === 0 ? ' first' : '') + (drag === r.id ? ' dragging' : '') + (over === r.id && drag && drag !== r.id ? ' dropt' : '')}
              onDragStart=${(e) => { dragId.current = r.id; setDrag(r.id); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); } catch (_) {} }}
              onDragOver=${(e) => { e.preventDefault(); if (over !== r.id) setOver(r.id); }}
              onDragLeave=${() => setOver(o => (o === r.id ? null : o))}
              onDrop=${(e) => { e.preventDefault(); drop(r.id); }}
              onDragEnd=${() => { dragId.current = null; setDrag(null); setOver(null); }}
              onClick=${() => goTask(r.id, r.title)}
              onKeyDown=${(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter') goTask(r.id, r.title);
                else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
                else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
              }}>
            <i class="ti ti-grip-vertical grip" aria-hidden="true"></i>
            <span class="num" aria-hidden="true">${i + 1}</span>
            ${statusDot(r, complete)}
            <span class="ch-row-t" title=${r.title}>${r.title || 'Untitled'}</span>
            <span class="ch-row-meta">
              ${r.client_id && ClientBadge && h`<span class="ch-hide-sm"><${ClientBadge} clientId=${r.client_id}/></span>`}
              ${r.due_at && DueChip && h`<${DueChip} row=${r}/>`}
              ${r.priority && PriorityFlag && h`<span class="ch-hide-sm"><${PriorityFlag} value=${r.priority}/></span>`}
            </span>
            <span class="acts" onClick=${(e) => e.stopPropagation()}>
              <button class="ch-ibtn" style=${{ width: 24, height: 24, fontSize: 14 }} aria-label="Move up" disabled=${i === 0} onClick=${() => move(i, -1)}><i class="ti ti-arrow-up"></i></button>
              <button class="ch-ibtn" style=${{ width: 24, height: 24, fontSize: 14 }} aria-label="Move down" disabled=${i === rows.length - 1} onClick=${() => move(i, 1)}><i class="ti ti-arrow-down"></i></button>
              <button class="ch-ibtn" style=${{ width: 24, height: 24, fontSize: 14 }} aria-label=${'Remove from Up next: ' + (r.title || '')} onClick=${() => remove(r)}><i class="ti ti-x"></i></button>
            </span>
          </div>`)}
        </div>`}
      <//>`;
    }

    // ---- My reminders (reminders_list / reminder_add / reminder_delete) --------
    const reminderPresets = () => {
      const now = new Date();
      const hour = new Date(now.getTime() + 3600e3);
      const eve = new Date(now); eve.setHours(18, 0, 0, 0);
      const tom = sod(addDays(now, 1)); tom.setHours(9, 0, 0, 0);
      const dow = now.getDay(); const mon = sod(addDays(now, ((8 - dow) % 7) || 7)); mon.setHours(9, 0, 0, 0);
      return [{ k: 'h', l: 'In 1 hour', at: hour }, eve > new Date(now.getTime() + 15 * 60e3) && { k: 'e', l: 'This evening', at: eve }, { k: 't', l: 'Tomorrow 9am', at: tom }, { k: 'm', l: 'Monday 9am', at: mon }].filter(Boolean);
    };
    const toLocalInput = (d) => { const x = new Date(d); return ymd(x) + 'T' + String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
    function ReminderForm({ onSave, close }) {
      const presets = useMemo(reminderPresets, []);
      const [note, setNote] = useState('');
      const [at, setAt] = useState(() => toLocalInput(presets[0].at));
      const [busy, setBusy] = useState(false);
      const when = at ? new Date(at) : null;
      const valid = note.trim() && when && !isNaN(when.getTime()) && when > new Date();
      const submit = async (e) => { e.preventDefault(); if (!valid || busy) return; setBusy(true); const ok = await onSave(note.trim(), when.toISOString()); setBusy(false); if (ok) close(); };
      return h`<form style=${{ padding: 10 }} onSubmit=${submit}>
        <label class="ch-label" style=${{ marginTop: 0 }} for="ch-rm-note">Remind me to</label>
        <input id="ch-rm-note" class="ch-input" autoFocus=${true} maxLength="300" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="e.g. Follow up on the shoot plan"/>
        <div class="ch-label">When</div>
        <div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }} role="group" aria-label="Quick times">
          ${presets.map(p => { const on = at === toLocalInput(p.at); return h`<button type="button" key=${p.k} class=${'ch-chip' + (on ? ' on' : '')} aria-pressed=${on ? 'true' : 'false'} onClick=${() => setAt(toLocalInput(p.at))}>${p.l}</button>`; })}
        </div>
        <input type="datetime-local" class="ch-input" aria-label="Reminder date and time" value=${at} onInput=${(e) => setAt(e.target.value)}/>
        <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
          <button type="button" class="ch-btn sm" onClick=${close}>Cancel</button>
          <button type="submit" class="ch-btn pri sm" disabled=${!valid || busy}>${busy ? 'Saving…' : 'Set reminder'}</button>
        </div>
      </form>`;
    }
    function RemindersCard({ ctl, showToast }) {
      const [incl, setIncl] = useState(false);
      const r = useRpcData(() => API.remindersList(incl), { poll: 60000, key: incl ? 'all' : 'open' });
      const rows = useMemo(() => {
        const list = arr(r.data);
        const open = list.filter(x => !x.sent_at).sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at));
        const sent = list.filter(x => x.sent_at).sort((a, b) => new Date(b.remind_at) - new Date(a.remind_at));
        return open.concat(incl ? sent : []);
      }, [r.data, incl]);
      const del = async (x) => {
        const prev = r.data; r.setData(d => arr(d).filter(y => y.id !== x.id));
        try { await API.reminderDelete(x.id); } catch (e) { r.setData(prev); toast(showToast, 'Could not delete reminder: ' + errMsg(e)); }
      };
      const save = async (note, iso) => {
        try { const row = await API.reminderAdd(null, iso, note); r.setData(d => arr(d).concat(row ? { task_title: null, sent_at: null, ...row } : [])); if (!row) r.reload(); toast(showToast, 'Reminder set for ' + fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + fmtTime(iso)); return true; }
        catch (e) { toast(showToast, isMissingRpc(e) ? "Reminders aren't available yet" : 'Could not set reminder: ' + errMsg(e)); return false; }
      };
      const right = !r.missing ? h`<span style=${{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <button class=${'ch-chip' + (incl ? ' on' : '')} aria-pressed=${incl ? 'true' : 'false'} onClick=${() => setIncl(v => !v)}>Sent</button>
        <${PopButton} className="ch-btn sm" icon="ti-plus" label="New" title="New reminder" width=${300}>${(close) => h`<${ReminderForm} onSave=${save} close=${close}/>`}<//>
      </span>` : null;
      return h`<${CardShell} title="My reminders" icon="ti-bell" count=${rows.filter(x => !x.sent_at).length || null} onRefresh=${r.reload} ctl=${ctl} right=${right}>
        ${r.missing ? h`<${NotYet} icon="ti-bell" what="Reminders"/>`
        : r.error && !r.data ? h`<${CardError} error=${r.error} onRetry=${r.reload}/>`
        : r.loading ? h`<${Loading} rows=${3}/>`
        : rows.length === 0 ? h`<${Empty} icon="ti-bell" title="No reminders" sub="Set one here or from a task's Remind me."/>`
        : rows.map(x => { const due = new Date(x.remind_at); const late = !x.sent_at && due < new Date();
            const clickable = !!x.task_id;
            const open = () => { if (clickable) goTask(x.task_id, x.task_title); };
            return h`<div key=${x.id} class="ch-fav" role=${clickable ? 'button' : undefined} tabIndex=${clickable ? '0' : undefined} style=${{ cursor: clickable ? 'pointer' : 'default', opacity: x.sent_at ? 0.6 : 1 }}
                onClick=${open} onKeyDown=${(e) => { if (e.key === 'Enter') open(); }}>
              <i class=${'ti ' + (x.sent_at ? 'ti-bell-check' : late ? 'ti-bell-ringing' : 'ti-bell')} style=${{ color: late ? '#e5484d' : 'var(--cu-t3,#8e8e99)', fontSize: 15 }} aria-hidden="true"></i>
              <span style=${{ flex: 1, minWidth: 0 }}>
                <span class="ch-row-t" style=${{ display: 'block' }}>${x.note || x.task_title || 'Reminder'}</span>
                <span class="ch-muted" style=${{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: late ? '#e5484d' : undefined }}>
                  ${fmtDate(due, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + fmtTime(due)}${x.note && x.task_title ? ' · ' + x.task_title : ''}
                </span>
              </span>
              <button class="ch-ibtn x" aria-label=${'Delete reminder ' + (x.note || '')} onClick=${(e) => { e.stopPropagation(); del(x); }}><i class="ti ti-trash"></i></button>
            </div>`; })}
      <//>`;
    }

    // ========================================================================
    // CARD LIBRARY + role defaults
    // ========================================================================
    const anyRole = () => true;
    const privOnly = (r) => r === 'admin' || r === 'manager';
    const seoRoles = (r) => r === 'admin' || r === 'manager' || r === 'seo';
    const CARD_LIBRARY = [
      { type: 'my_work', name: 'My Work', icon: 'ti-checkbox', category: 'Work', w: 2, desc: 'Your tasks grouped Today, Overdue, Next and Unscheduled.', roles: anyRole, Component: MyWorkCard },
      { type: 'agenda', name: 'Agenda', icon: 'ti-calendar-time', category: 'Work', w: 1, desc: "Today's timeline of tasks and scheduled posts.", roles: anyRole, Component: AgendaCard },
      { type: 'inbox', name: 'Inbox', icon: 'ti-inbox', category: 'Work', w: 1, desc: 'Your latest unread notifications.', roles: anyRole, Component: InboxCard },
      { type: 'overdue_tasks', name: 'Overdue tasks', icon: 'ti-alarm', category: 'Work', w: 1, desc: 'Everything past its due date.', roles: anyRole, Component: TaskListCard },
      { type: 'due_soon', name: 'Due soon', icon: 'ti-calendar-due', category: 'Work', w: 1, desc: 'Tasks due in the next 14 days.', roles: anyRole, Component: TaskListCard },
      { type: 'priority_tasks', name: 'Urgent & high', icon: 'ti-flag', category: 'Work', w: 1, desc: 'Open tasks flagged urgent or high.', roles: anyRole, Component: TaskListCard },
      { type: 'completed_week', name: 'Completed this week', icon: 'ti-circle-check', category: 'Work', w: 1, desc: 'Tasks closed in the last 7 days.', roles: anyRole, Component: TaskListCard },
      { type: 'workload', name: 'Workload', icon: 'ti-users', category: 'Team', w: 1, desc: 'Due this week against each person’s capacity.', roles: anyRole, Component: WorkloadCard },
      { type: 'approvals', name: 'Approvals', icon: 'ti-thumb-up', category: 'Clients', w: 1, desc: 'Posts waiting on clients, in revision, approved.', roles: anyRole, Component: ApprovalsCard },
      { type: 'client_health', name: 'Client health', icon: 'ti-heart-rate-monitor', category: 'Clients', w: 1, desc: 'Open, overdue and due-this-week per client.', roles: anyRole, Component: ClientHealthCard },
      { type: 'pipeline', name: 'Pipeline', icon: 'ti-route', category: 'Clients', w: 2, desc: 'Onboarding, SEO reports due and the publish queue.', roles: privOnly, Component: PipelineCard },
      { type: 'money_due', name: 'Money due', icon: 'ti-receipt-rupee', category: 'Money', w: 1, desc: 'Outstanding and overdue invoices.', roles: isFinanceRole, Component: MoneyDueCard },
      { type: 'task_list', name: 'Task list', icon: 'ti-list-details', category: 'Tables', w: 2, desc: 'A saved, filtered list of tasks.', roles: anyRole, multi: true, Component: TaskListCard },
      { type: 'status_breakdown', name: 'Status breakdown', icon: 'ti-chart-donut', category: 'Charts', w: 1, desc: 'Donut of to do, in progress and complete.', roles: anyRole, Component: StatusBreakdownCard },
      { type: 'assignee_breakdown', name: 'Tasks by assignee', icon: 'ti-chart-bar', category: 'Charts', w: 1, desc: 'Open and overdue tasks per person.', roles: anyRole, Component: AssigneeBreakdownCard },
      { type: 'notes', name: 'Notes', icon: 'ti-notes', category: 'Utility', w: 1, desc: 'Your personal scratchpad notes.', roles: anyRole, Component: NotesCard },
      { type: 'bookmarks', name: 'Bookmarks', icon: 'ti-bookmark', category: 'Utility', w: 1, desc: 'Favorites and quick links.', roles: anyRole, Component: BookmarksCard },
      { type: 'lineup', name: 'Up next', icon: 'ti-list-numbers', category: 'Work', w: 1, desc: 'Your LineUp — the few tasks you do next, in drag-to-set order.', roles: anyRole, Component: LineupCard },
      { type: 'reminders', name: 'My reminders', icon: 'ti-bell', category: 'Work', w: 1, desc: 'Personal and task reminders, with quick add.', roles: anyRole, Component: RemindersCard },
      { type: 'revisions', name: 'Revisions requested', icon: 'ti-refresh-alert', category: 'Clients', w: 1, desc: 'Your posts where the client asked for changes.', roles: anyRole, Component: RevisionsCard },
      { type: 'brand_guidelines', name: 'Brand guidelines', icon: 'ti-palette', category: 'Clients', w: 1, desc: 'Jump to the brand profile of clients you work on.', roles: anyRole, Component: BrandGuidelinesCard },
      { type: 'seo_reports_due', name: 'SEO reports due', icon: 'ti-trending-up', category: 'Clients', w: 1, desc: 'Weekly and monthly SEO reports that need sending.', roles: seoRoles, Component: SeoReportsDueHomeCard },
      { type: 'invoices_month', name: 'Invoices this month', icon: 'ti-file-invoice', category: 'Money', w: 1, desc: 'Billed, received and outstanding for the month.', roles: isFinanceRole, Component: InvoicesMonthCard },
      { type: 'gst_exports', name: 'GST & TDS exports', icon: 'ti-receipt-tax', category: 'Money', w: 1, desc: 'Shortcuts to GSTR-1, GSTR-3B and TDS reports with due dates.', roles: isFinanceRole, Component: GstExportsCard },
      { type: 'priority_breakdown', name: 'Priority breakdown', icon: 'ti-flag-3', category: 'Charts', w: 1, desc: 'Open tasks by urgent, high, normal and low.', roles: anyRole, Component: PriorityBreakdownCard },
      { type: 'recents', name: 'Recents', icon: 'ti-history', category: 'Utility', w: 1, desc: 'Tasks, clients and lists you opened lately.', roles: anyRole, Component: RecentsCard },
      { type: 'resources', name: 'Resources', icon: 'ti-paperclip', category: 'Utility', w: 1, desc: 'Files recently attached to tasks.', roles: anyRole, Component: ResourcesCard },
    ];
    const BUILTIN_CATS = ['Work', 'Team', 'Clients', 'Money', 'Tables', 'Charts', 'Utility'];
    // Cards that read the shared home_summary (CardGrid fetches it once for them).
    const SUMMARY_TYPES = new Set(['approvals', 'workload', 'client_health', 'status_breakdown', 'assignee_breakdown', 'priority_breakdown']);
    // Built-ins + AMS_EXT.cards, resolved at render time (producers may register after home.js builds).
    function getLibrary() {
      const builtin = new Set(CARD_LIBRARY.map(c => c.type));
      const ext = extList('cards').filter(c => c && typeof c.type === 'string' && typeof c.Component === 'function' && !builtin.has(c.type))
        .map(c => ({ ...c, ext: true, name: c.name || c.type, icon: c.icon || 'ti-layout-grid', category: c.category || 'More', desc: c.desc || '', w: [1, 2, 3].includes(Number(c.w)) ? Number(c.w) : 1 }));
      const all = CARD_LIBRARY.concat(ext);
      const byType = {}; all.forEach(c => { byType[c.type] = c; });
      const cats = BUILTIN_CATS.concat([...new Set(ext.map(c => c.category))].filter(k => !BUILTIN_CATS.includes(k)));
      return { all, byType, cats };
    }

    // Role defaults (Gap Map §Home roles) — only used when the member has no saved layout.
    const ROLE_DEFAULTS = {
      admin: [['my_work', 2], ['approvals', 1], ['agenda', 1], ['inbox', 1], ['workload', 1], ['client_health', 1], ['pipeline', 2], ['money_due', 1]],
      manager: [['my_work', 2], ['approvals', 1], ['workload', 1], ['client_health', 1], ['seo_reports_due', 1], ['overdue_tasks', 1]],
      editor: [['my_work', 2], ['agenda', 1], ['inbox', 1], ['revisions', 1], ['brand_guidelines', 1]],
      accounts_head: [['money_due', 1], ['invoices_month', 1], ['gst_exports', 1], ['my_work', 2]],
      freelancer: [['my_work', 2], ['agenda', 1], ['inbox', 1], ['revisions', 1]],
    };
    ROLE_DEFAULTS.seo = ROLE_DEFAULTS.manager; ROLE_DEFAULTS.designer = ROLE_DEFAULTS.editor;
    const defaultLayout = (role) => (ROLE_DEFAULTS[role] || ROLE_DEFAULTS.editor).map(([type, w]) => ({ id: uid(), type, w, config: {} }));
    // Keeps unknown types (e.g. a dashboards.js card not registered yet) so a save never drops them.
    const cleanLayout = (cards) => {
      const { byType } = getLibrary();
      return arr(cards).filter(c => c && typeof c.type === 'string' && c.type).map(c => {
        const w = Number(c.w);
        return { id: c.id || uid(), type: c.type, w: [1, 2, 3].includes(w) ? w : ((byType[c.type] && byType[c.type].w) || 1), config: c.config && typeof c.config === 'object' ? c.config : {} };
      });
    };

    // ========================================================================
    // Filters popover (client + assignee multi-select)
    // ========================================================================
    function FiltersPanel({ filters, setFilters, clients, members, close }) {
      const [q, setQ] = useState('');
      const s = q.trim().toLowerCase();
      const toggle = (key, id) => setFilters(f => {
        const cur = arr(f[key]); const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
        return { ...f, [key]: next };
      });
      const cl = clientList(clients).filter(c => !s || (c.name || '').toLowerCase().includes(s));
      const mm = arr(members).filter(m => !s || (m.name || '').toLowerCase().includes(s));
      const Section = ({ label, items, k, avatar }) => h`<div>
        <div class="ch-sec" style=${{ display: 'flex', justifyContent: 'space-between' }}>${label}
          ${arr(filters[k]).length > 0 && h`<button class="ch-link" onClick=${() => setFilters(f => ({ ...f, [k]: [] }))}>Clear</button>`}</div>
        ${items.length === 0 ? h`<div class="ch-muted" style=${{ padding: '2px 8px 6px' }}>No matches</div>`
          : items.map(it => h`<label key=${it.id} class="ch-chk">
              <input type="checkbox" checked=${arr(filters[k]).includes(it.id)} onChange=${() => toggle(k, it.id)}/>
              ${Av && avatar ? h`<${Av} i=${it.initials} c=${it.color} s=${20} round=${k === 'assigneeIds'}/>` : null}
              <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${it.name}</span>
            </label>`)}
      </div>`;
      return h`<div style=${{ padding: 8 }}>
        <input class="ch-input" placeholder="Search clients or people" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Search filters"/>
        <div style=${{ maxHeight: 320, overflow: 'auto', marginTop: 4 }}>
          ${Section({ label: 'Clients', items: cl, k: 'clientIds', avatar: true })}
          ${Section({ label: 'Assignees', items: mm, k: 'assigneeIds', avatar: true })}
        </div>
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--cu-bd,#e8e8eb)', paddingTop: 8, marginTop: 4 }}>
          <span class="ch-muted">Applies to task cards</span>
          <span style=${{ display: 'flex', gap: 6 }}>
            <button class="ch-btn sm" onClick=${() => setFilters({ clientIds: [], assigneeIds: [] })}>Reset</button>
            <button class="ch-btn pri sm" onClick=${close}>Done</button>
          </span>
        </div>
      </div>`;
    }

    // ========================================================================
    // Add card modal
    // ========================================================================
    function AddCardModal({ role, layout, clients, onAdd, onClose }) {
      const store = useStoreSafe();
      const [cat, setCat] = useState('Work');
      const [cfgType, setCfgType] = useState(null);
      const [title, setTitle] = useState('');
      const [preset, setPreset] = useState('overdue');
      const [clientId, setClientId] = useState('');
      const boxRef = useRef(null);
      useEffect(() => {
        const prev = document.activeElement;
        if (boxRef.current) boxRef.current.focus();
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('keydown', onKey); if (prev && prev.focus) try { prev.focus(); } catch (_) {} };
      }, []);
      const lib = getLibrary();
      const allowed = lib.all.filter(c => roleOk(c, role));
      const cats = lib.cats.filter(k => allowed.some(c => c.category === k));
      const present = new Set(arr(layout).map(c => c.type));
      const tiles = allowed.filter(c => c.category === cat);
      const cl = arr(store.clients).length ? store.clients : clientList(clients);
      const submitList = () => {
        const p = TASK_LIST_PRESETS.find(x => x.key === preset);
        if (preset === 'client' && !clientId) return;
        const cfg = { title: title.trim() || (preset === 'client' ? ((cl.find(c => String(c.id) === String(clientId)) || {}).name || 'Client') + ' tasks' : p.label), preset, clientId: clientId || undefined };
        cfg.filter = resolveTaskListFilter(cfg);
        onAdd('task_list', cfg);
      };
      return h`<div class="ch-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="ch-modal" role="dialog" aria-modal="true" aria-labelledby="ch-add-title" tabIndex="-1" ref=${boxRef}>
          <div class="ch-modal-hd">
            <div id="ch-add-title" style=${{ font: '600 16px Inter,system-ui,sans-serif' }}>${cfgType ? 'New task list card' : 'Add card'}</div>
            <button class="ch-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          ${cfgType ? h`<form style=${{ padding: 16, overflow: 'auto' }} onSubmit=${(e) => { e.preventDefault(); submitList(); }}>
              <label class="ch-label" style=${{ marginTop: 0 }} for="ch-tl-title">Title</label>
              <input id="ch-tl-title" class="ch-input" value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="e.g. This week's shoots"/>
              <div class="ch-label">Show tasks</div>
              <div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="radiogroup" aria-label="Quick filter">
                ${TASK_LIST_PRESETS.map(p => h`<button type="button" key=${p.key} role="radio" aria-checked=${preset === p.key ? 'true' : 'false'} class=${'ch-chip' + (preset === p.key ? ' on' : '')} onClick=${() => setPreset(p.key)}>${p.label}</button>`)}
              </div>
              ${preset === 'client' && h`<div>
                <label class="ch-label" for="ch-tl-client">Client</label>
                <select id="ch-tl-client" class="ch-input" value=${clientId} onChange=${(e) => setClientId(e.target.value)} required>
                  <option value="">Choose a client…</option>
                  ${cl.map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
                </select>
              </div>`}
              <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                <button type="button" class="ch-btn" onClick=${() => setCfgType(null)}>Back</button>
                <button type="submit" class="ch-btn pri" disabled=${preset === 'client' && !clientId}>Add card</button>
              </div>
            </form>`
          : h`<div class="ch-lib">
              <nav class="ch-lib-nav" aria-label="Card categories">
                ${cats.map(k => h`<button key=${k} class=${'ch-mi' + (cat === k ? ' on' : '')} aria-current=${cat === k ? 'true' : undefined} onClick=${() => setCat(k)}>${k}</button>`)}
              </nav>
              <div class="ch-lib-main">
                <div class="ch-lib-grid">
                  ${tiles.map(c => { const added = !c.multi && present.has(c.type);
                    return h`<div key=${c.type} class="ch-tile">
                      <div class="ic"><i class=${'ti ' + c.icon} aria-hidden="true"></i></div>
                      <div class="nm">${c.name}</div>
                      <div class="ds">${c.desc}</div>
                      <div><button class=${'ch-btn sm' + (added ? '' : ' pri')} disabled=${added}
                        onClick=${() => (c.type === 'task_list' ? setCfgType('task_list') : onAdd(c.type, {}))}>${added ? 'Added' : 'Add'}</button></div>
                    </div>`; })}
                </div>
              </div>
            </div>`}
        </div>
      </div>`;
    }

    // ========================================================================
    // AttendanceBanner — mark the day, and start the clock (migration 108)
    // ========================================================================
    // Sits above the cards on Home so nobody has to go hunting in the Employee
    // tab. Tapping Present/Half day stamps check_in_at; check_out_at is stamped
    // on sign-out (index.html doLogout) or by the 21:00 IST cron. Sunday is a
    // weekly off, so the banner hides — same rule as ATT_OFF_DOW in index.html.
    // FAIL-OPEN: without migration 108 att_today 404s, `day` becomes false, and
    // the banner renders nothing — Home looks exactly as it did before.
    const ATT_CHOICES = [
      { k: 'present', lbl: 'Present', ic: 'ti-check' },
      { k: 'half_day', lbl: 'Half day', ic: 'ti-circle-half-2' },
      { k: 'absent', lbl: 'Absent', ic: 'ti-x' },
    ];
    const ATT_LABEL = { present: 'Present', half_day: 'Half day', absent: 'Absent', leave: 'On leave' };
    const attClock = (ts) => { try { return new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); } catch (_) { return ''; } };

    function AttendanceBanner({ showToast }) {
      const [day, setDay] = useState(null);   // null = loading · false = unavailable
      const [busy, setBusy] = useState('');
      useEffect(() => {
        if (!rpcCall) { setDay(false); return; }
        let alive = true;
        rpcCall('att_today', {}, { silentAuth: true })
          .then(d => { if (alive) setDay(d && typeof d === 'object' ? d : false); })
          .catch(() => { if (alive) setDay(false); });
        return () => { alive = false; };
      }, []);

      // Nothing to ask on a Sunday, for an admin, or before the first call lands.
      if (!day || day.off_day || day.exempt) return null;

      const mark = (status) => {
        setBusy(status);
        rpcCall('att_mark', { p_status: status }, { silentAuth: true })
          .then(r => {
            setDay(d => ({ ...d, marked: true, status: r.status, check_in_at: r.check_in_at, check_out_at: r.check_out_at }));
            toast(showToast, r.already ? 'Already marked today' : 'Marked ' + (ATT_LABEL[r.status] || r.status).toLowerCase() + ' ✓');
          })
          .catch(e => toast(showToast, 'Could not mark attendance: ' + errMsg(e)))
          .finally(() => setBusy(''));
      };

      if (day.marked) {
        const out = day.check_out_at
          ? 'checked out ' + attClock(day.check_out_at) + (day.auto_closed ? ' (auto)' : '')
          : day.check_in_at ? 'check-out is recorded when you sign out' : '';
        return h`<div class="ch-att done" role="status">
          <i class="ti ti-circle-check lead" aria-hidden="true"></i>
          <div class="tx">
            <b>${ATT_LABEL[day.status] || day.status} today</b>
            <span>${day.check_in_at ? 'Checked in ' + attClock(day.check_in_at) + (out ? ' · ' + out : '') : 'Marked for today'}</span>
          </div>
        </div>`;
      }

      return h`<div class="ch-att">
        <i class="ti ti-clock lead" aria-hidden="true"></i>
        <div class="tx">
          <b>Mark your attendance</b>
          <span>${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · your check-in time is recorded now</span>
        </div>
        <div class="acts">
          ${ATT_CHOICES.map(c => h`<button key=${c.k} type="button" disabled=${!!busy} onClick=${() => mark(c.k)}>
            <i class=${'ti ' + c.ic} aria-hidden="true"></i>${busy === c.k ? 'Saving…' : c.lbl}
          </button>`)}
        </div>
      </div>`;
    }

    // ========================================================================
    // HomeDashboard
    // ========================================================================
    function HomeDashboard({ currentUser, clients, onNavigate, showToast }) {
      const user = currentUser || {};
      const role = user.role_level;
      const store = useStoreSafe();
      const summary = useSummarySource(true);
      const [filters, setFiltersRaw] = useState(() => { const f = lsGet('ams_home_filters', null); return { clientIds: arr(f && f.clientIds), assigneeIds: arr(f && f.assigneeIds) }; });
      const setFilters = useCallback((fn) => setFiltersRaw(f => { const n = typeof fn === 'function' ? fn(f) : fn; lsSet('ams_home_filters', n); return n; }), []);
      const [tick, setTick] = useState(0);
      const [, setClock] = useState(0);
      useEffect(() => { const iv = setInterval(() => setClock(c => c + 1), 20000); return () => clearInterval(iv); }, []);

      // ---- layout load / save ----
      const [layout, setLayout] = useState(null);
      const [customize, setCustomize] = useState(false);
      const [showAdd, setShowAdd] = useState(false);
      const saveTimer = useRef(null);
      const latest = useRef(null);
      useEffect(() => {
        if (layout) return;
        const hasStore = !!useTaskStore;
        if (hasStore && !store.ready && !store.error) {
          const t = setTimeout(() => setLayout(l => l || defaultLayout(role)), 5000);
          return () => clearTimeout(t);
        }
        const saved = cleanLayout(store.homeLayout);
        setLayout(saved.length ? saved : defaultLayout(role));
      }, [store.ready, store.error, store.homeLayout, layout, role]);

      const flushSave = useCallback(() => {
        if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
        if (!latest.current) return;
        API.homeLayoutSave(latest.current).catch(e => toast(showToast, 'Could not save layout: ' + errMsg(e)));
        latest.current = null;
      }, [showToast]);
      useEffect(() => () => flushSave(), [flushSave]);
      const commit = useCallback((next) => {
        setLayout(next); latest.current = next;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(flushSave, 800);
      }, [flushSave]);

      const cards = arr(layout);
      const lib = getLibrary();
      const visibleCount = cards.filter(c => lib.byType[c.type] && roleOk(lib.byType[c.type], role)).length;
      const addCard = (type, config) => {
        const l = lib.byType[type];
        commit([...cards, { id: uid(), type, w: l ? l.w : 1, config: config || {} }]);
        setShowAdd(false);
        toast(showToast, ((config && config.title) || (l && l.name) || 'Card') + ' added');
      };

      const refreshAll = () => { summary.reload(); setTick(t => t + 1); };
      const ctxValue = useMemo(() => ({ summary, filters, tick }), [summary.data, summary.error, summary.loading, summary.at, filters, tick]);
      const filterCount = filters.clientIds.length + filters.assigneeIds.length;
      const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      return h`<${HomeCtx.Provider} value=${ctxValue}>
        <div class="ch-page">
          <header class="ch-head">
            <div>
              <h1 class="ch-greet">${greeting()}, ${firstName(user)}</h1>
              <div class="ch-date">${dateStr}</div>
            </div>
            <div class="ch-tools">
              <${PopButton} className=${'ch-btn' + (filterCount ? ' on' : '')} icon="ti-filter" label="Filters" badge=${filterCount || null} width=${300}>
                ${(close) => h`<${FiltersPanel} filters=${filters} setFilters=${setFilters} clients=${arr(store.clients).length ? store.clients : clients} members=${store.members} close=${close}/>`}
              <//>
              <button class="ch-link" style=${{ color: 'var(--cu-t3,#8e8e99)', fontWeight: 500 }} onClick=${refreshAll} title="Refresh now" aria-live="polite">
                <i class=${'ti ti-refresh'} aria-hidden="true"></i> Refreshed · ${summary.at ? rel(summary.at) : 'loading'}
              </button>
              <button class=${'ch-btn' + (customize ? ' on' : '')} aria-pressed=${customize ? 'true' : 'false'}
                onClick=${() => { if (customize) flushSave(); setCustomize(c => !c); }}>
                <i class=${'ti ' + (customize ? 'ti-check' : 'ti-layout-dashboard')} aria-hidden="true"></i>${customize ? 'Done' : 'Customize'}
              </button>
              <button class="ch-btn pri" onClick=${() => setShowAdd(true)}><i class="ti ti-plus" aria-hidden="true"></i>Add card</button>
            </div>
          </header>

          <${AttendanceBanner} showToast=${showToast}/>

          ${customize && h`<div class="ch-muted" style=${{ margin: '-6px 0 12px' }} role="status">Drag cards to reorder, set their width, or remove them. Changes save automatically.</div>`}

          ${!layout ? h`<div class="ch-grid">${[2, 1, 1, 1, 1, 1].map((w, i) => h`<div key=${i} class=${'ch-cell w' + w}><div class="ch-card" style=${{ padding: 10 }}><${Loading} rows=${4}/></div></div>`)}</div>`
          : visibleCount === 0 ? h`<div class="ch-card" style=${{ padding: 30 }}><${Empty} icon="ti-layout-dashboard" title="Your Home is empty"
              sub="Add cards to build a dashboard that fits how you work."
              action=${h`<div style=${{ display: 'flex', gap: 8, marginTop: 8 }}><button class="ch-btn" onClick=${() => commit(defaultLayout(role))}>Restore defaults</button><button class="ch-btn pri" onClick=${() => setShowAdd(true)}>Add card</button></div>`}/></div>`
          : h`<${CardGrid} cards=${cards} onChange=${commit} editable=${customize} currentUser=${user} clients=${clients} onNavigate=${onNavigate} showToast=${showToast}/>`}

          ${showAdd && h`<${AddCardModal} role=${role} layout=${cards} clients=${clients} onAdd=${addCard} onClose=${() => setShowAdd(false)}/>`}
        </div>
      <//>`;
    }

    // ========================================================================
    // MyWorkPage — today | assigned | delegated | personal
    // ========================================================================
    function DelegatedList({ showToast }) {
      const store = useStoreSafe();
      const filter = useStable({ scope: 'delegated', limit: 500, order: 'due' });
      const q = useTasksSafe(filter, {});
      const [search, setSearch] = useState('');
      const groups = useMemo(() => {
        const s = search.trim().toLowerCase();
        const map = {};
        arr(q.rows).filter(r => !s || (r.title || '').toLowerCase().includes(s) || (r.client_name || '').toLowerCase().includes(s)).forEach(r => {
          const as = arr(r.assignees);
          (as.length ? as : [{ id: '_none', name: 'Unassigned' }]).forEach(a => {
            if (!map[a.id]) map[a.id] = { member: a, rows: [] };
            map[a.id].rows.push(r);
          });
        });
        const byDue = (a, b) => (isOverdueRow(b) - isOverdueRow(a)) || (new Date(a.due_at || 8.64e15) - new Date(b.due_at || 8.64e15));
        return Object.values(map).map(g => ({ ...g, rows: g.rows.sort(byDue) }))
          .sort((a, b) => (a.member.id === '_none') - (b.member.id === '_none') || (a.member.name || '').localeCompare(b.member.name || ''));
      }, [q.rows, search]);
      const openCount = arr(q.rows).length;
      return h`<div class="ch-page">
        <header class="ch-head">
          <div><h1 class="ch-ptitle"><i class="ti ti-send" aria-hidden="true"></i>Delegated</h1>
            <div class="ch-date">Open tasks you created for other people · ${openCount}</div></div>
          <div class="ch-tools">
            <input class="ch-input" style=${{ width: 220 }} placeholder="Search tasks" aria-label="Search delegated tasks" value=${search} onInput=${(e) => setSearch(e.target.value)}/>
            <button class="ch-btn" onClick=${q.reload}><i class="ti ti-refresh" aria-hidden="true"></i>Refresh</button>
            ${openCreateTask && h`<button class="ch-btn pri" onClick=${() => openCreateTask({})}><i class="ti ti-plus" aria-hidden="true"></i>Task</button>`}
          </div>
        </header>
        <div class="ch-card" style=${{ padding: '6px 6px 10px' }}>
          ${q.error && !openCount ? h`<${CardError} error=${q.error} onRetry=${q.reload}/>`
          : q.loading && !openCount ? h`<${Loading} rows=${6}/>`
          : groups.length === 0 ? h`<${Empty} icon="ti-send" title=${search ? 'No matches' : 'Nothing delegated'} sub=${search ? '' : 'Tasks you create and assign to teammates show up here.'}/>`
          : groups.map(g => { const m = (store.memberById && (typeof store.memberById === 'function' ? store.memberById(g.member.id) : store.memberById[g.member.id])) || g.member;
              return h`<${TaskGroup} key=${g.member.id} id=${'dl_' + g.member.id} rows=${g.rows} showAssignees=${false}
                label=${h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, textTransform: 'none', letterSpacing: 0, fontSize: 13, color: 'var(--cu-t1,#1f1f23)' }}>
                  ${g.member.id === '_none' ? h`<i class="ti ti-user-question" aria-hidden="true"></i>` : (MemberAvatar ? h`<${MemberAvatar} member=${m} size=${20}/>` : Av ? h`<${Av} i=${m.initials} c=${m.color} s=${20} round=${true}/>` : null)}
                  ${g.member.name}</span>`}/>`; })}
        </div>
      </div>`;
    }

    function MyWorkPage({ currentUser, mode = 'today', showToast }) {
      const store = useStoreSafe();
      const meId = (store.me && store.me.id) || (currentUser && currentUser.id);
      const myScope = useMemo(() => ({ type: 'my', title: 'Assigned to me' }), []);
      const personal = arr(store.lists).find(l => l.system_key === 'personal' && (!l.owner_id || l.owner_id === meId));
      const personalScope = useMemo(() => (personal ? { type: 'list', listId: personal.id, title: 'Personal list' } : null), [personal && personal.id]);
      const noViews = h`<div class="ch-page"><${Empty} icon="ti-layout-list" title="Views are still loading" sub="The task views module isn't available yet."/></div>`;

      if (mode === 'assigned') return TaskViews ? h`<${TaskViews} scope=${myScope} currentUser=${currentUser} showToast=${showToast}/>` : noViews;
      if (mode === 'delegated') return h`<${DelegatedList} showToast=${showToast}/>`;
      if (mode === 'personal') {
        if (!personal && !store.ready && !store.error && useTaskStore) return h`<div class="ch-page"><${Loading} rows=${6}/></div>`;
        if (!personalScope) return h`<div class="ch-page"><${Empty} icon="ti-lock" title="No personal list yet"
          sub="Your private personal list is created automatically. Try again in a moment."
          action=${store.reload ? h`<button class="ch-btn" style=${{ marginTop: 8 }} onClick=${() => store.reload()}>Reload</button>` : null}/></div>`;
        return TaskViews ? h`<${TaskViews} scope=${personalScope} currentUser=${currentUser} showToast=${showToast}/>` : noViews;
      }
      // 'today' — ClickUp "Today & Overdue": My Work (wide) + Agenda
      return h`<div class="ch-page">
        <header class="ch-head">
          <div><h1 class="ch-ptitle"><i class="ti ti-calendar-exclamation" aria-hidden="true"></i>Today & Overdue</h1>
            <div class="ch-date">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
        </header>
        <div class="ch-two">
          <${CardBoundary} name="My Work"><${MyWorkCard} currentUser=${currentUser} showToast=${showToast} tall=${true}/><//>
          <${CardBoundary} name="Agenda"><${AgendaCard} currentUser=${currentUser} tall=${true}/><//>
        </div>
      </div>`;
    }

    // ========================================================================
    // InboxPage
    // ========================================================================
    const INBOX_TABS = [['primary', 'Primary'], ['other', 'Other'], ['later', 'Later'], ['cleared', 'Cleared']];
    const TYPE_LABEL = { mention: 'Mentions', comment: 'Comments', task: 'Tasks', approval: 'Approvals', revision: 'Revisions', message: 'Messages', alert: 'Alerts', status: 'Status changes', info: 'Info' };
    const typeLabel = (t) => TYPE_LABEL[t] || (t ? String(t).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Other');
    const snoozePresets = () => {
      const now = new Date();
      const hour = new Date(now.getTime() + 3600e3);
      const tom = sod(addDays(now, 1)); tom.setHours(9, 0, 0, 0);
      const dow = now.getDay(); const mon = sod(addDays(now, ((8 - dow) % 7) || 7)); mon.setHours(9, 0, 0, 0);
      return [
        { key: 'hour', label: 'In 1 hour', at: hour, hint: fmtTime(hour) },
        { key: 'tom', label: 'Tomorrow', at: tom, hint: fmtDate(tom, { weekday: 'short' }) + ', 9:00' },
        { key: 'mon', label: 'Next Monday', at: mon, hint: fmtDate(mon, { day: 'numeric', month: 'short' }) + ', 9:00' },
      ];
    };
    function SnoozeMenu({ onPick, close }) {
      const [custom, setCustom] = useState(false);
      const [val, setVal] = useState('');
      if (custom) {
        return h`<div style=${{ padding: 10 }}>
          <div class="ch-label" style=${{ marginTop: 0 }}>Snooze until</div>
          ${DatePicker ? h`<${DatePicker} value=${val || null} withTime=${true} label="Pick date & time" onChange=${(iso) => { if (iso) { onPick(new Date(iso)); close(); } }}/>`
            : h`<input type="datetime-local" class="ch-input" aria-label="Snooze until" value=${val} onInput=${(e) => setVal(e.target.value)}/>`}
          <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
            <button class="ch-btn sm" onClick=${() => setCustom(false)}>Back</button>
            ${!DatePicker && h`<button class="ch-btn pri sm" disabled=${!val || new Date(val) <= new Date()} onClick=${() => { onPick(new Date(val)); close(); }}>Snooze</button>`}
          </div>
        </div>`;
      }
      return h`<div role="menu" style=${{ padding: 4 }}>
        <div class="ch-sec" style=${{ paddingTop: 4 }}>Remind me</div>
        ${snoozePresets().map(p => h`<button key=${p.key} role="menuitem" class="ch-mi" onClick=${() => { onPick(p.at); close(); }}>
          <span style=${{ flex: 1 }}>${p.label}</span><span class="ch-muted">${p.hint}</span></button>`)}
        <div style=${{ height: 1, background: 'var(--cu-bd,#e8e8eb)', margin: '4px 0' }}></div>
        <button role="menuitem" class="ch-mi" onClick=${() => setCustom(true)}><i class="ti ti-calendar" aria-hidden="true"></i>Custom date…</button>
      </div>`;
    }

    function InboxIllustration() {
      return h`<div class="ch-illo" aria-hidden="true">
        <span class="a"><i class="ti ti-inbox"></i></span><span class="b"><i class="ti ti-check"></i></span><span class="c"><i class="ti ti-sparkles"></i></span>
      </div>`;
    }
    const INBOX_EMPTY = {
      primary: ["You're all caught up!", 'New mentions, comments and task updates will land here.'],
      other: ['Nothing else here', 'Lower-priority updates show up in Other.'],
      later: ['No snoozed notifications', 'Snooze something with Later and it will come back when you asked.'],
      cleared: ['Nothing cleared yet', 'Cleared notifications are kept here for a while.'],
    };
    const dayBucket = (d) => {
      const t = sod(), x = new Date(d);
      if (x >= t) return 'Today';
      if (x >= addDays(t, -1)) return 'Yesterday';
      if (x >= addDays(t, -7)) return 'This week';
      return 'Older';
    };

    function InboxPage({ currentUser, onOpenNotif, showToast }) {
      const [tab, setTab] = useState('primary');
      const [rows, setRows] = useState(null);
      const [error, setError] = useState(null);
      const [counts, setCounts] = useState({});
      const [typeF, setTypeF] = useState('all');
      const [clientF, setClientF] = useState('all');
      const reqId = useRef(0);
      const loadCounts = useCallback(() => { API.inboxCounts().then(c => setCounts(c || {})).catch(noop); }, []);
      const load = useCallback(async (t, quiet) => {
        const my = ++reqId.current;
        if (!quiet) { setRows(null); setError(null); }
        try { const r = await API.inboxList(t, 100); if (my === reqId.current) { setRows(arr(r)); setError(null); } }
        catch (e) { if (my === reqId.current) { setError(e); if (!quiet) setRows([]); } }
      }, []);
      useEffect(() => { load(tab); loadCounts(); setTypeF('all'); setClientF('all'); }, [tab]);
      useVisiblePoll(() => { load(tab, true); loadCounts(); }, 30000, [tab]);

      const move = (items, state, until) => {
        const ids = items.map(n => n.id); if (!ids.length) return;
        const snapshot = rows;
        setRows(rs => arr(rs).filter(n => !ids.includes(n.id)));
        API.inboxSet(ids, state, until ? until.toISOString() : null)
          .then(() => { loadCounts(); if (state === 'later') toast(showToast, 'Snoozed until ' + fmtDate(until, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + fmtTime(until)); else if (state === 'cleared') toast(showToast, ids.length > 1 ? ids.length + ' notifications cleared' : 'Cleared'); })
          .catch(e => { setRows(snapshot); toast(showToast, 'Could not update inbox: ' + errMsg(e)); });
      };
      const open = (n) => {
        setRows(rs => arr(rs).map(x => (x.id === n.id ? { ...x, read: true } : x)));
        if (onOpenNotif) onOpenNotif(n); else if (n.link_type === 'task' && n.link_id) goTask(n.link_id);
        setTimeout(loadCounts, 1500);
      };

      const types = useMemo(() => [...new Set(arr(rows).map(n => n.type).filter(Boolean))].sort(), [rows]);
      const clientNames = useMemo(() => [...new Set(arr(rows).map(n => n.client_name).filter(Boolean))].sort(), [rows]);
      const shown = useMemo(() => arr(rows).filter(n => (typeF === 'all' || n.type === typeF) && (clientF === 'all' || n.client_name === clientF)), [rows, typeF, clientF]);
      const grouped = useMemo(() => {
        const out = []; let cur = null;
        shown.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach(n => {
          const k = dayBucket(n.created_at); if (!cur || cur.k !== k) { cur = { k, items: [] }; out.push(cur); } cur.items.push(n);
        });
        return out;
      }, [shown]);
      const filterOn = typeF !== 'all' || clientF !== 'all';

      const filterBtn = h`<${PopButton} className=${'ch-btn' + (filterOn ? ' on' : '')} icon="ti-filter" label="Filter" width=${240}>
        ${(close) => h`<div style=${{ padding: 6 }}>
          <div class="ch-sec" style=${{ paddingTop: 2 }}>Type</div>
          ${['all', ...types].map(t => h`<label key=${t} class="ch-chk"><input type="radio" name="ch-ib-type" checked=${typeF === t} onChange=${() => setTypeF(t)}/>${t === 'all' ? 'All types' : typeLabel(t)}</label>`)}
          ${clientNames.length > 0 && h`<div>
            <div class="ch-sec">Client</div>
            <select class="ch-input" aria-label="Filter by client" value=${clientF} onChange=${(e) => setClientF(e.target.value)}>
              <option value="all">All clients</option>${clientNames.map(c => h`<option key=${c} value=${c}>${c}</option>`)}
            </select>
          </div>`}
          <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
            ${filterOn && h`<button class="ch-btn sm" onClick=${() => { setTypeF('all'); setClientF('all'); }}>Reset</button>`}
            <button class="ch-btn pri sm" onClick=${close}>Done</button>
          </div>
        </div>`}
      <//>`;

      return h`<div class="ch-page">
        <header class="ch-head" style=${{ marginBottom: 8 }}>
          <h1 class="ch-ptitle"><i class="ti ti-inbox" aria-hidden="true"></i>Inbox</h1>
          <div class="ch-tools">
            ${filterBtn}
            ${tab !== 'cleared' && h`<button class="ch-btn" disabled=${!shown.length} onClick=${() => move(shown, 'cleared')}><i class="ti ti-checks" aria-hidden="true"></i>Clear all</button>`}
          </div>
        </header>
        <div class="ch-tabs" role="tablist" aria-label="Inbox tabs">
          ${INBOX_TABS.map(([k, l]) => { const c = counts && counts[k];
            return h`<button key=${k} role="tab" aria-selected=${tab === k ? 'true' : 'false'} class=${'ch-tab' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}>
              ${l}${k !== 'cleared' && c > 0 ? h`<span class="n">${c > 99 ? '99+' : c}</span>` : null}</button>`; })}
        </div>
        ${error && rows && rows.length === 0 ? h`<div class="ch-ib"><${CardError} error=${error} onRetry=${() => load(tab)}/></div>`
        : rows === null ? h`<div class="ch-ib" style=${{ padding: 6 }}><${Loading} rows=${6}/></div>`
        : shown.length === 0 ? h`<div class="ch-ib"><div class="ch-empty" style=${{ padding: '48px 16px' }}>
            <${InboxIllustration}/>
            <div class="t" style=${{ fontSize: 15 }}>${filterOn ? 'No notifications match your filter' : INBOX_EMPTY[tab][0]}</div>
            <div style=${{ fontSize: 12.5, maxWidth: 320 }}>${filterOn ? '' : INBOX_EMPTY[tab][1]}</div>
          </div></div>`
        : h`<div class="ch-ib" role="list">
            ${grouped.map(g => h`<${React.Fragment} key=${g.k}>
              <div class="ch-ib-day">${g.k}</div>
              ${g.items.map(n => { const ic = notifIcon(n.type);
                const meta = [n.client_name, n.post_title].filter(Boolean).join(' · ');
                return h`<div key=${n.id} role="listitem" class=${'ch-ib-row' + (n.read ? '' : ' unread')} tabIndex="0"
                    aria-label=${(n.read ? '' : 'Unread: ') + n.title}
                    onClick=${() => open(n)} onKeyDown=${(e) => { if (e.target === e.currentTarget && e.key === 'Enter') open(n); }}>
                  <span class="ch-ib-ic" style=${{ background: ic.col + '1f', color: ic.col }}><i class=${'ti ' + ic.icon} aria-hidden="true"></i></span>
                  <div class="ch-ib-main">
                    <div class="ch-ib-t">${n.title}</div>
                    ${n.message && h`<div class="ch-ib-msg">${n.message}</div>`}
                    <div class="ch-ib-meta">${meta}${meta ? ' · ' : ''}${tab === 'later' && n.snooze_until ? 'Snoozed until ' + fmtDate(n.snooze_until, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + fmtTime(n.snooze_until) : typeLabel(n.type)}</div>
                  </div>
                  <div class="ch-ib-side">
                    <span class="ch-ib-time">${rel(n.created_at)}</span>
                    ${!n.read && h`<span class="ch-udot" aria-hidden="true"></span>`}
                  </div>
                  <div class="ch-ib-acts" onClick=${(e) => e.stopPropagation()} onKeyDown=${(e) => e.stopPropagation()}>
                    ${tab !== 'cleared' && h`<${PopButton} className="ch-ibtn" icon="ti-clock" title="Later" width=${250}>
                      ${(close) => h`<${SnoozeMenu} close=${close} onPick=${(at) => move([n], 'later', at)}/>`}
                    <//>`}
                    ${tab === 'cleared' || tab === 'later'
                      ? h`<button class="ch-ibtn" title="Move to inbox" aria-label="Move to inbox" onClick=${() => move([n], 'primary')}><i class="ti ti-arrow-back-up"></i></button>`
                      : null}
                    ${tab !== 'cleared' && h`<button class="ch-ibtn" title="Clear" aria-label="Clear notification" onClick=${() => move([n], 'cleared')}><i class="ti ti-check"></i></button>`}
                    <button class="ch-ibtn" title="Open" aria-label="Open" onClick=${() => open(n)}><i class="ti ti-arrow-up-right"></i></button>
                  </div>
                </div>`; })}
            <//>`)}
          </div>`}
      </div>`;
    }

    // ========================================================================
    // RepliesPage
    // ========================================================================
    function RepliesPage({ currentUser, showToast }) {
      const [tab, setTab] = useState('unread');
      const [rows, setRows] = useState(null);
      const [error, setError] = useState(null);
      const load = useCallback(async (t, quiet) => {
        if (!quiet) { setRows(null); setError(null); }
        try {
          const r = arr(await API.repliesList(t === 'unread'));
          setRows(t === 'unread' ? r : r.filter(x => !(x.unread_count > 0))); setError(null);
        } catch (e) { setError(e); if (!quiet) setRows([]); }
      }, []);
      useEffect(() => { load(tab); }, [tab]);
      useVisiblePoll(() => load(tab, true), 60000, [tab]);
      const open = (r) => {
        if (tab === 'unread') setRows(rs => arr(rs).filter(x => x.task_id !== r.task_id));
        API.repliesMarkRead(r.task_id).catch(noop);
        goTask(r.task_id);
      };
      return h`<div class="ch-page">
        <header class="ch-head" style=${{ marginBottom: 8 }}>
          <h1 class="ch-ptitle"><i class="ti ti-message-circle" aria-hidden="true"></i>Replies</h1>
          <div class="ch-tools"><button class="ch-btn" onClick=${() => load(tab)}><i class="ti ti-refresh" aria-hidden="true"></i>Refresh</button></div>
        </header>
        <div class="ch-tabs" role="tablist">
          ${[['unread', 'Unread'], ['read', 'Read']].map(([k, l]) => h`<button key=${k} role="tab" aria-selected=${tab === k ? 'true' : 'false'} class=${'ch-tab' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}>
            ${l}${k === 'unread' && tab === 'unread' && rows && rows.length > 0 ? h`<span class="n">${rows.length}</span>` : null}</button>`)}
        </div>
        ${error && rows && !rows.length ? h`<div class="ch-ib"><${CardError} error=${error} onRetry=${() => load(tab)}/></div>`
        : rows === null ? h`<div class="ch-ib" style=${{ padding: 6 }}><${Loading} rows=${5}/></div>`
        : rows.length === 0 ? h`<div class="ch-ib"><div class="ch-empty" style=${{ padding: '48px 16px' }}><${InboxIllustration}/>
            <div class="t" style=${{ fontSize: 15 }}>${tab === 'unread' ? "You're all caught up!" : 'No read threads'}</div>
            <div style=${{ fontSize: 12.5 }}>Replies on tasks you're part of show up here.</div></div></div>`
        : h`<div class="ch-ib" role="list">${rows.map(r => h`<div key=${r.task_id} role="listitem" class=${'ch-ib-row' + (r.unread_count > 0 ? ' unread' : '')} tabIndex="0"
              onClick=${() => open(r)} onKeyDown=${(e) => { if (e.key === 'Enter') open(r); }}>
            <span class="ch-ib-ic" style=${{ background: '#4c8df61f', color: '#4c8df6' }}><i class="ti ti-message-circle" aria-hidden="true"></i></span>
            <div class="ch-ib-main">
              <div class="ch-ib-t">${r.task_title || 'Untitled task'}${r.client_name ? h`<span class="ch-muted" style=${{ fontWeight: 400 }}> · ${r.client_name}</span>` : ''}</div>
              <div class="ch-ib-msg">${r.last_author_name ? h`<b style=${{ fontWeight: 600, color: 'var(--cu-t1,#1f1f23)' }}>${r.last_author_name}: </b>` : ''}${r.preview || ''}</div>
            </div>
            <div class="ch-ib-side">
              <span>${r.last_comment_at ? rel(r.last_comment_at) : ''}</span>
              ${r.unread_count > 0 && h`<span class="ch-pill" style=${{ background: 'var(--cu-accent,#ff00ee)', color: '#fff' }} aria-label=${r.unread_count + ' unread'}>${r.unread_count}</span>`}
            </div>
          </div>`)}</div>`}
      </div>`;
    }

    // ========================================================================
    // AssignedCommentsPage
    // ========================================================================
    function AssignedCommentsPage({ currentUser, showToast }) {
      const [mode, setMode] = useState('me');
      const [incl, setIncl] = useState(false);
      const [last90, setLast90] = useState(true);
      const [rows, setRows] = useState(null);
      const [error, setError] = useState(null);
      const load = useCallback(async (m, i, quiet) => {
        if (!quiet) { setRows(null); setError(null); }
        try { setRows(arr(await API.commentsAssigned(m, i))); setError(null); }
        catch (e) { setError(e); if (!quiet) setRows([]); }
      }, []);
      useEffect(() => { load(mode, incl); }, [mode, incl]);
      useVisiblePoll(() => load(mode, incl, true), 60000, [mode, incl]);
      const shown = useMemo(() => {
        const cut = addDays(new Date(), -90);
        return arr(rows).filter(c => !last90 || new Date(c.created_at) >= cut);
      }, [rows, last90]);
      const resolve = async (c) => {
        const snapshot = rows;
        setRows(rs => (incl ? arr(rs).map(x => (x.id === c.id ? { ...x, resolved_at: new Date().toISOString() } : x)) : arr(rs).filter(x => x.id !== c.id)));
        try { await API.commentUpdate(c.id, { resolved: true }); toast(showToast, 'Comment resolved'); }
        catch (e) { setRows(snapshot); toast(showToast, 'Could not resolve: ' + errMsg(e)); }
      };
      return h`<div class="ch-page">
        <header class="ch-head" style=${{ marginBottom: 8 }}>
          <h1 class="ch-ptitle"><i class="ti ti-message-check" aria-hidden="true"></i>Assigned comments</h1>
          <div class="ch-tools">
            <button class=${'ch-chip' + (incl ? ' on' : '')} aria-pressed=${incl ? 'true' : 'false'} onClick=${() => setIncl(v => !v)}><i class="ti ti-circle-check" aria-hidden="true"></i>Resolved</button>
            <button class=${'ch-chip' + (last90 ? ' on' : '')} aria-pressed=${last90 ? 'true' : 'false'} onClick=${() => setLast90(v => !v)}><i class="ti ti-calendar" aria-hidden="true"></i>Last 90 days</button>
          </div>
        </header>
        <div class="ch-tabs" role="tablist">
          ${[['me', 'Assigned to me'], ['delegated', 'Delegated by me']].map(([k, l]) => h`<button key=${k} role="tab" aria-selected=${mode === k ? 'true' : 'false'} class=${'ch-tab' + (mode === k ? ' on' : '')} onClick=${() => setMode(k)}>
            ${l}${mode === k && rows ? h`<span class="n">${shown.filter(c => !c.resolved_at).length}</span>` : null}</button>`)}
        </div>
        ${error && rows && !rows.length ? h`<div class="ch-ib"><${CardError} error=${error} onRetry=${() => load(mode, incl)}/></div>`
        : rows === null ? h`<div class="ch-ib" style=${{ padding: 6 }}><${Loading} rows=${5}/></div>`
        : shown.length === 0 ? h`<div class="ch-ib"><div class="ch-empty" style=${{ padding: '48px 16px' }}><${InboxIllustration}/>
            <div class="t" style=${{ fontSize: 15 }}>${mode === 'me' ? 'No comments assigned to you' : 'No comments delegated by you'}</div>
            <div style=${{ fontSize: 12.5 }}>Assign a comment from a task to turn it into an action item.</div></div></div>`
        : h`<div class="ch-ib" role="list">${shown.map(c => h`<div key=${c.id} role="listitem" class="ch-ib-row" tabIndex="0"
              onClick=${() => goTask(c.task_id)} onKeyDown=${(e) => { if (e.target === e.currentTarget && e.key === 'Enter') goTask(c.task_id); }}>
            ${Av ? h`<${Av} i=${c.author_initials} c=${c.author_color} s=${30} round=${true}/>` : null}
            <div class="ch-ib-main">
              <div class="ch-ib-meta" style=${{ marginTop: 0, marginBottom: 3 }}>
                <b style=${{ color: 'var(--cu-t1,#1f1f23)', fontWeight: 600 }}>${c.author_name || 'Someone'}</b>
                ${' on '}<span style=${{ color: 'var(--cu-t2,#5c5c66)' }}>${c.task_title || 'a task'}</span>${c.client_name ? ' · ' + c.client_name : ''}
              </div>
              <div class="ch-cm-body" style=${{ opacity: c.resolved_at ? 0.6 : 1 }}>${c.body}</div>
              <div class="ch-ib-meta">${c.assigned_to_name ? 'Assigned to ' + c.assigned_to_name + ' · ' : ''}${rel(c.created_at)}${c.resolved_at ? ' · Resolved' + (c.resolved_by_name ? ' by ' + c.resolved_by_name : '') : ''}</div>
            </div>
            <div class="ch-ib-side" onClick=${(e) => e.stopPropagation()}>
              ${c.resolved_at ? h`<span class="ch-pill" style=${{ background: '#30a46c1f', color: '#30a46c' }}><i class="ti ti-check" aria-hidden="true"></i>Resolved</span>`
                : h`<button class="ch-btn sm" onClick=${() => resolve(c)}><i class="ti ti-check" aria-hidden="true"></i>Resolve</button>`}
            </div>
          </div>`)}</div>`}
      </div>`;
    }

    // ========================================================================
    // CardGrid — the Home card grid, reusable by dashboards.js (F).
    // props: { cards:[{id,type,w,config}], onChange(nextCards)?, editable, currentUser,
    //          clients, onNavigate, showToast, filters?:{client_ids,assignee_ids}, tick? }
    // Without onChange the grid is read-only (no width/remove/reorder controls).
    // ========================================================================
    function CardGrid({ cards, onChange, editable, currentUser, clients, onNavigate, showToast, filters, tick: tickProp }) {
      const parent = React.useContext(HomeCtx);
      const user = currentUser || {};
      const role = user.role_level;
      const lib = getLibrary();
      const list = arr(cards);
      const visible = list.filter(c => c && lib.byType[c.type] && roleOk(lib.byType[c.type], role));
      const needOwnSummary = !parent && visible.some(c => SUMMARY_TYPES.has(c.type));
      const own = useSummarySource(needOwnSummary);
      const fKey = JSON.stringify(filters || null);
      const ctxValue = useMemo(() => {
        const nf = filters ? { clientIds: arr(filters.client_ids || filters.clientIds), assigneeIds: arr(filters.assignee_ids || filters.assigneeIds) } : null;
        if (parent) return nf ? { ...parent, filters: nf } : parent;
        return { summary: needOwnSummary ? own : null, filters: nf || { clientIds: [], assigneeIds: [] }, tick: tickProp || 0 };
      }, [parent, fKey, needOwnSummary, own.data, own.error, own.loading, own.at, tickProp]);
      const cardFilters = { client_ids: arr(ctxValue.filters && ctxValue.filters.clientIds), assignee_ids: arr(ctxValue.filters && ctxValue.filters.assigneeIds) };
      const canEdit = typeof onChange === 'function';
      const customize = !!editable && canEdit;
      const commit = (next) => { if (canEdit) onChange(next); };
      const setW = (id, w) => commit(list.map(c => (c.id === id ? { ...c, w } : c)));
      const removeCard = (id) => commit(list.filter(c => c.id !== id));
      const move = (id, dir) => {
        const vi = visible.findIndex(c => c.id === id); const target = visible[vi + dir];
        if (!target) return;
        const next = list.slice(); const a = next.findIndex(c => c.id === id), b = next.findIndex(c => c.id === target.id);
        [next[a], next[b]] = [next[b], next[a]]; commit(next);
      };
      const dragId = useRef(null);
      const [dragging, setDragging] = useState(null);
      const [overId, setOverId] = useState(null);
      const onDrop = (targetId) => {
        const from = dragId.current; dragId.current = null; setDragging(null); setOverId(null);
        if (!from || from === targetId) return;
        const next = list.filter(c => c.id !== from); const moved = list.find(c => c.id === from);
        if (!moved) return;
        const idx = next.findIndex(c => c.id === targetId);
        next.splice(idx < 0 ? next.length : idx, 0, moved); commit(next);
      };
      return h`<${HomeCtx.Provider} value=${ctxValue}>
        <div class="ch-grid">
          ${visible.map(card => {
            const l = lib.byType[card.type]; const C = l.Component;
            const ctl = canEdit
              ? { customize, w: card.w, onWidth: (w) => setW(card.id, w), onRemove: () => removeCard(card.id), onMove: (d) => move(card.id, d) }
              : { customize: false, w: card.w, onMove: noop };
            const cls = 'ch-cell w' + ([1, 2, 3].includes(card.w) ? card.w : 1) + (customize ? ' edit' : '') + (dragging === card.id ? ' dragging' : '') + (overId === card.id && dragging && dragging !== card.id ? ' dropt' : '');
            return h`<div key=${card.id} class=${cls} draggable=${customize ? 'true' : 'false'}
                onDragStart=${customize ? (e) => { dragId.current = card.id; setDragging(card.id); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.id); } catch (_) {} } : undefined}
                onDragOver=${customize ? (e) => { e.preventDefault(); if (overId !== card.id) setOverId(card.id); } : undefined}
                onDragLeave=${customize ? () => setOverId(o => (o === card.id ? null : o)) : undefined}
                onDrop=${customize ? (e) => { e.preventDefault(); onDrop(card.id); } : undefined}
                onDragEnd=${customize ? () => { dragId.current = null; setDragging(null); setOverId(null); } : undefined}>
              <${CardBoundary} name=${l.name} right=${customize ? h`<button class="ch-ibtn" aria-label="Remove card" onClick=${ctl.onRemove}><i class="ti ti-x"></i></button>` : null}>
                <${C} card=${card} ctl=${ctl} currentUser=${user} clients=${clients} onNavigate=${onNavigate} showToast=${showToast} filters=${cardFilters}/>
              <//>
            </div>`;
          })}
        </div>
      <//>`;
    }

    // ========================================================================
    // DraftsPage — unsent comment / chat drafts kept in localStorage (ams_draft_*)
    // Key grammar written by tasks.js (B) / messages.js (K):
    //   ams_draft_task_<taskId>[...], ams_draft_comment_<taskId>, ams_draft_msg_<conversationId>
    // Value: plain string, or JSON { text|body|html, title?, taskId?, conversationId?, updated_at?, attachments? }
    // ========================================================================
    const DRAFT_PREFIX = 'ams_draft_';
    const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    function readDrafts() {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || key.indexOf(DRAFT_PREFIX) !== 0) continue;
          const raw = localStorage.getItem(key);
          if (raw == null || raw === '') continue;
          let v = raw; try { v = JSON.parse(raw); } catch (_) {}
          const o = v && typeof v === 'object' ? v : { text: String(v) };
          const text = stripHtml(o.text || o.body || o.html || o.content || o.message || '');
          const atts = arr(o.attachments).length;
          if (!text && !atts) continue;
          const rest = key.slice(DRAFT_PREFIX.length);
          const declared = String(o.kind || '');
          let kind = /msg|message|chat|conversation|dm|channel/i.test(declared) ? 'message'
            : /task|comment|reply/i.test(declared) ? 'comment'
            : /^(msg|message|chat|conv|conversation|dm|channel)[_:-]/i.test(rest) ? 'message'
            : /^(task|comment|reply|cmt)[_:-]/i.test(rest) ? 'comment' : 'other';
          const idInKey = (rest.match(UUID_RE) || [])[0] || null;
          const taskId = o.taskId || o.task_id || (kind === 'comment' ? idInKey : null);
          const conversationId = o.conversationId || o.conversation_id || (kind === 'message' ? (idInKey || rest.replace(/^[a-z]+[_:-]/i, '')) : null);
          if (kind === 'other' && taskId) kind = 'comment';
          if (kind === 'other' && conversationId) kind = 'message';
          const ts = o.updated_at || o.updatedAt || o.savedAt || o.ts || o.at || null;
          const d = ts ? new Date(ts) : null;
          out.push({ key, kind, taskId, conversationId, title: o.title || o.task_title || o.conversation_name || o.label || null, text, attachments: atts, updated: d && !isNaN(d.getTime()) ? d : null });
        }
      } catch (_) {}
      return out.sort((a, b) => (b.updated ? b.updated.getTime() : 0) - (a.updated ? a.updated.getTime() : 0));
    }
    const DRAFT_KIND = { comment: { icon: 'ti-message-circle', col: '#4c8df6', label: 'Comment' }, message: { icon: 'ti-message-2', col: '#c400bd', label: 'Message' }, other: { icon: 'ti-pencil', col: '#87909e', label: 'Draft' } };

    function DraftsPage({ onNavigate, showToast }) {
      const [drafts, setDrafts] = useState(() => readDrafts());
      const [tab, setTab] = useState('all');
      const [confirmKey, setConfirmKey] = useState(null);
      const refresh = useCallback(() => setDrafts(readDrafts()), []);
      useEffect(() => {
        const onStorage = (e) => { if (!e.key || e.key.indexOf(DRAFT_PREFIX) === 0) refresh(); };
        window.addEventListener('storage', onStorage); window.addEventListener('focus', refresh); window.addEventListener('ams-drafts-changed', refresh);
        const iv = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 15000);
        return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', refresh); window.removeEventListener('ams-drafts-changed', refresh); clearInterval(iv); };
      }, [refresh]);
      useEffect(() => { if (!confirmKey) return undefined; const t = setTimeout(() => setConfirmKey(null), 4000); return () => clearTimeout(t); }, [confirmKey]);
      const titles = window.__amsTaskTitles || {};
      const counts = { all: drafts.length, comment: drafts.filter(d => d.kind === 'comment').length, message: drafts.filter(d => d.kind === 'message').length };
      const shown = drafts.filter(d => tab === 'all' || d.kind === tab);
      const discard = (d) => {
        if (confirmKey !== d.key) { setConfirmKey(d.key); return; }
        try { localStorage.removeItem(d.key); } catch (_) {}
        setConfirmKey(null); refresh();
        try { window.dispatchEvent(new CustomEvent('ams-drafts-changed', { detail: { key: d.key } })); } catch (_) {}
        toast(showToast, 'Draft discarded');
      };
      const copy = async (d) => {
        try { await navigator.clipboard.writeText(d.text); toast(showToast, 'Copied to clipboard'); }
        catch (_) { toast(showToast, 'Could not copy — select the text instead'); }
      };
      const canOpen = (d) => (d.kind === 'comment' && d.taskId) || (d.kind === 'message' && d.conversationId);
      const open = (d) => {
        if (d.kind === 'comment' && d.taskId) { goTask(d.taskId); return; }
        if (d.kind === 'message' && d.conversationId) {
          try { window.dispatchEvent(new CustomEvent('ams-open-chat', { detail: { conversationId: d.conversationId } })); } catch (_) {}
          if (onNavigate) onNavigate('chat', { conversationId: d.conversationId });
        }
      };
      const label = (d) => (d.kind === 'comment' ? (d.title || (d.taskId && titles[d.taskId] && titles[d.taskId].title) || 'Comment on a task')
        : d.kind === 'message' ? (d.title || 'Chat message') : (d.title || 'Draft'));
      const tabs = [['all', 'All'], ['comment', 'Comments'], ['message', 'Messages']];
      return h`<div class="ch-page">
        <header class="ch-head" style=${{ marginBottom: 8 }}>
          <div><h1 class="ch-ptitle"><i class="ti ti-pencil" aria-hidden="true"></i>Drafts</h1>
            <div class="ch-date">Unsent comments and messages saved on this device</div></div>
          <div class="ch-tools"><button class="ch-btn" onClick=${refresh}><i class="ti ti-refresh" aria-hidden="true"></i>Refresh</button></div>
        </header>
        <div class="ch-tabs" role="tablist" aria-label="Draft types">
          ${tabs.map(([k, l]) => h`<button key=${k} role="tab" aria-selected=${tab === k ? 'true' : 'false'} class=${'ch-tab' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}>
            ${l}${counts[k] > 0 ? h`<span class="n">${counts[k]}</span>` : null}</button>`)}
        </div>
        ${shown.length === 0 ? h`<div class="ch-ib"><div class="ch-empty" style=${{ padding: '48px 16px' }}>
            <div class="ch-illo" aria-hidden="true"><span class="a"><i class="ti ti-pencil"></i></span><span class="b"><i class="ti ti-check"></i></span><span class="c"><i class="ti ti-sparkles"></i></span></div>
            <div class="t" style=${{ fontSize: 15 }}>No drafts</div>
            <div style=${{ fontSize: 12.5, maxWidth: 340 }}>Comments and chat messages you start but don't send are kept here.</div>
          </div></div>`
        : h`<div class="ch-ib" role="list">
            ${shown.map(d => { const k = DRAFT_KIND[d.kind] || DRAFT_KIND.other; const confirming = confirmKey === d.key;
              return h`<div key=${d.key} class="ch-draft" role="listitem">
                <span class="ch-ib-ic" style=${{ background: k.col + '1f', color: k.col }}><i class=${'ti ' + k.icon} aria-hidden="true"></i></span>
                <div class="ch-ib-main">
                  <div class="ch-ib-t" style=${{ fontWeight: 600 }}>${label(d)}</div>
                  <div class="pv">${d.text || (d.attachments ? d.attachments + ' attachment' + (d.attachments > 1 ? 's' : '') : '')}</div>
                  <div class="ch-ib-meta">${k.label}${d.attachments && d.text ? ' · ' + d.attachments + ' attachment' + (d.attachments > 1 ? 's' : '') : ''}${d.updated ? ' · saved ' + rel(d.updated) : ''}</div>
                </div>
                <div class="ch-tools" style=${{ flexShrink: 0 }}>
                  ${canOpen(d) && h`<button class="ch-btn sm pri" onClick=${() => open(d)}><i class="ti ti-arrow-up-right" aria-hidden="true"></i>Open</button>`}
                  ${d.text && h`<button class="ch-btn sm" onClick=${() => copy(d)} aria-label="Copy draft text"><i class="ti ti-copy" aria-hidden="true"></i>Copy</button>`}
                  <button class=${'ch-btn sm' + (confirming ? ' on' : '')} style=${confirming ? { color: '#e5484d', borderColor: '#e5484d', background: '#e5484d14' } : undefined}
                    aria-label=${confirming ? 'Confirm discard' : 'Discard draft'} onClick=${() => discard(d)}>
                    <i class="ti ti-trash" aria-hidden="true"></i>${confirming ? 'Confirm' : 'Discard'}</button>
                </div>
              </div>`; })}
          </div>`}
      </div>`;
    }

    reg('pages', {
      id: 'drafts', label: 'Drafts', icon: 'ti-pencil', section: 'home', order: 45, apps: ['dashboard', 'tasks'],
      roles: (r) => r !== 'client',
      badge: () => { const n = readDrafts().length; return n > 0 ? n : null; },
      Component: DraftsPage,
    });

    return {
      HomeDashboard, MyWorkPage, InboxPage, RepliesPage, AssignedCommentsPage, DraftsPage,
      CARD_LIBRARY, CardShell, CardGrid, useAgendaItems, getCardLibrary: getLibrary, defaultLayout,
    };
  }

  window.AMS_HOME = { buildHome };
})();

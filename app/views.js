/* ============================================================================
 * views.js — ClickUp-parity task views (List / Board / Calendar / Table /
 * Gantt / Workload / Timeline / Activity / Team / Mind map / Embed, plus
 * AMS_EXT.views registry tabs) + saved views, toolbar, filter builder,
 * bulk bar, CSV export/import, keyboard navigation.
 *
 *   window.AMS_VIEWS.buildViews(deps) →
 *     { TaskViews, QuickAddRow, SharedView, openView, viewScope, sanitizeEmbed, parseCsv }
 *
 * Contract: docs/clickup-parity-contract.md §6.2 (shapes §4, filters §5,
 * tasks.js atoms §6.1) + docs/clickup-parity-v2-contract.md §4 "C".
 * All data comes from tasks.js via deps (useTasks, useTaskStore, TaskAPI,
 * pickers). v2 RPCs (task_links_for, task_activity_feed, tasks_import,
 * presence_list, org_task_settings_get, member_prefs_get) are fail-open.
 * Class prefix `cv-`; colours via --cu-* tokens.
 * ==========================================================================*/
(function () {
  function buildViews(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo,
            Skel, rpcCall,
            TaskAPI, taskBus, useTaskStore, useTasks, PRIORITIES, TYPE_META,
            isOverdue, isDone, fmtDue, fmtMinutes, openTask, openCreateTask,
            Popover, Menu, PickerList, StatusPicker, StatusIcon, PriorityFlag, PriorityPicker,
            AssigneeStack, AssigneePicker, DueChip, DatePicker, TagChips, TagPicker,
            ClientBadge, TypeIcon, MemberAvatar, EmptyState, copyText } = deps;
    const Fragment = React.Fragment;
    const rpc = (name, args) => (typeof rpcCall === 'function' ? rpcCall(name, args || {}) : Promise.reject(new Error('rpcCall unavailable')));
    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i.test(String((e && (e.code || '')) + ' ' + (e && (e.message || e.details || '') || '')));
    const EXT = () => (window.AMS_EXT || {});

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-views-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-views-styles';
      st.textContent = `
      .cv-root{--cv-ok:#30a46c;--cv-near:#f5a623;--cv-over:#e5484d;display:flex;flex-direction:column;min-height:0;min-width:0;height:100%;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font-family:Inter,system-ui,sans-serif;font-size:13px;position:relative}
      .cv-root *{box-sizing:border-box}
      .cv-root button{font-family:inherit}
      .cv-root :focus-visible{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:1px}
      .cv-tabs{display:flex;align-items:stretch;gap:2px;padding:0 12px;border-bottom:1px solid var(--cu-bd,#e8e8eb);overflow-x:auto;scrollbar-width:none;flex-shrink:0}
      .cv-tabs::-webkit-scrollbar{display:none}
      .cv-tab{display:flex;align-items:center;gap:6px;padding:10px 10px 9px;border:0;background:none;color:var(--cu-t2,#5c5c66);font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-1px}
      .cv-tab:hover{color:var(--cu-t1,#1f1f23)}
      .cv-tab.on{color:var(--cu-t1,#1f1f23);border-bottom-color:var(--cu-accent,#ff00ee);font-weight:600}
      .cv-tab i{font-size:15px}
      .cv-tab .cv-pin{font-size:11px;color:var(--cu-t3,#8e8e99)}
      .cv-tab-add{color:var(--cu-t3,#8e8e99)}
      .cv-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--cu-bd,#e8e8eb);flex-shrink:0}
      .cv-sp{flex:1 1 auto}
      .cv-btn{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 9px;border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t2,#5c5c66);border-radius:var(--cu-radius-sm,6px);font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap}
      .cv-btn:hover{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23)}
      .cv-btn.on{background:var(--cu-accent-fog,rgba(255,0,238,.08));border-color:var(--cu-accent,#ff00ee);color:var(--cu-accent-ink,#a8009c)}
      .cv-btn.ghost{border-color:transparent;background:transparent}
      .cv-btn.ghost:hover{background:var(--cu-bg3,#efeff1)}
      .cv-btn.icon{width:28px;padding:0;justify-content:center}
      .cv-btn i{font-size:15px}
      .cv-btn:disabled{opacity:.5;cursor:not-allowed}
      .cv-pri{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:0;background:var(--cu-accent,#ff00ee);color:#fff;border-radius:var(--cu-radius-sm,6px);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
      .cv-pri:hover{filter:brightness(.94)}
      .cv-split{display:inline-flex}
      .cv-split .cv-pri:first-child{border-radius:6px 0 0 6px}
      .cv-split .cv-pri:last-child{border-radius:0 6px 6px 0;padding:0 7px;border-left:1px solid rgba(255,255,255,.35)}
      .cv-save{height:24px;padding:0 9px;font-size:12px;border-radius:6px;border:1px solid var(--cu-accent,#ff00ee);background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c);font-weight:600;cursor:pointer}
      .cv-avchip{border:2px solid transparent;border-radius:50%;padding:0;background:none;cursor:pointer;display:inline-flex;margin-left:-4px;line-height:0}
      .cv-avchip.on{border-color:var(--cu-accent,#ff00ee)}
      .cv-me{height:26px;padding:0 8px;border-radius:13px;margin-left:4px}
      .cv-search{display:inline-flex;align-items:center;gap:4px;height:28px;border:1px solid var(--cu-bd,#e8e8eb);border-radius:6px;padding:0 6px;background:var(--cu-bg,#fff)}
      .cv-search input{border:0;outline:0;background:transparent;color:var(--cu-t1,#1f1f23);font-size:12.5px;width:150px}
      .cv-body{flex:1;min-height:0;min-width:0;overflow:auto;position:relative}
      .cv-pop{padding:6px;font-size:13px;color:var(--cu-t1,#1f1f23)}
      .cv-pop-h{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3,#8e8e99);padding:6px 8px 4px}
      .cv-mi{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:0 8px;border:0;background:none;border-radius:6px;color:var(--cu-t1,#1f1f23);font-size:13px;cursor:pointer;text-align:left}
      .cv-mi:hover,.cv-mi.on{background:var(--cu-bg3,#efeff1)}
      .cv-mi .cv-ck{margin-left:auto;color:var(--cu-accent,#ff00ee)}
      .cv-mi i{font-size:15px;color:var(--cu-t2,#5c5c66)}
      .cv-sel,.cv-in{height:28px;border:1px solid var(--cu-bd2,#d6d6db);border-radius:6px;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font-size:12.5px;padding:0 6px;min-width:0}
      .cv-in:focus,.cv-sel:focus{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:-1px}
      .cv-catalog{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:4px}
      .cv-cat{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--cu-bd,#e8e8eb);border-radius:8px;background:var(--cu-bg,#fff);cursor:pointer;text-align:left;color:var(--cu-t1,#1f1f23)}
      .cv-cat:hover{border-color:var(--cu-accent,#ff00ee);background:var(--cu-accent-fog,rgba(255,0,238,.08))}
      .cv-cat i{font-size:20px;color:var(--cu-accent-ink,#a8009c)}
      .cv-cat b{display:block;font-size:13px;font-weight:600}
      .cv-cat span{display:block;font-size:11.5px;color:var(--cu-t3,#8e8e99);margin-top:2px;line-height:1.35}
      .cv-chk{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--cu-t2,#5c5c66);padding:4px 8px;cursor:pointer}
      .cv-chk input{accent-color:var(--cu-accent,#ff00ee)}
      .cv-frow{display:grid;grid-template-columns:110px 110px minmax(0,1fr) 28px;gap:6px;align-items:center;padding:4px 6px}
      @media(max-width:560px){.cv-frow{grid-template-columns:1fr 1fr;}.cv-frow>*:nth-child(3){grid-column:1/2}}
      /* ---- list ---- */
      .cv-list{padding:6px 12px 90px;min-width:max-content}
      .cv-group{margin:10px 0 4px}
      .cv-ghd{display:flex;align-items:center;gap:6px;height:34px;position:sticky;left:0}
      .cv-caret{width:22px;height:22px;border:0;background:none;color:var(--cu-t3,#8e8e99);cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;transition:transform .15s}
      .cv-caret:hover{background:var(--cu-bg3,#efeff1)}
      .cv-caret.shut{transform:rotate(-90deg)}
      .cv-gpill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:5px;color:#fff;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
      .cv-gpill.plain{color:var(--cu-t1,#1f1f23);background:var(--cu-bg3,#efeff1)}
      .cv-gcount{color:var(--cu-t3,#8e8e99);font-size:12px;font-weight:500}
      .cv-colhd{display:grid;align-items:center;height:30px;position:sticky;top:0;z-index:3;background:var(--cu-bg,#fff);border-bottom:1px solid var(--cu-bd,#e8e8eb);font-size:11px;color:var(--cu-t3,#8e8e99);font-weight:500}
      .cv-colhd>div{padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cv-row{display:grid;align-items:center;min-height:36px;border-bottom:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff)}
      .cv-row:hover{background:var(--cu-bg2,#f7f7f8)}
      .cv-row.sel{background:var(--cu-accent-fog,rgba(255,0,238,.08))}
      .cv-row>.cv-cell{padding:0 8px;min-width:0;display:flex;align-items:center;height:100%;border-left:1px solid transparent}
      .cv-row:hover>.cv-cell+.cv-cell{border-left-color:var(--cu-bd,#e8e8eb)}
      .cv-cbx{width:16px;height:16px;accent-color:var(--cu-accent,#ff00ee);opacity:0;cursor:pointer;margin:0}
      .cv-row:hover .cv-cbx,.cv-cbx:checked,.cv-anysel .cv-cbx{opacity:1}
      .cv-name{gap:6px;min-width:0}
      .cv-title{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;color:var(--cu-t1,#1f1f23);font-size:13px;border:0;background:none;padding:0;text-align:left}
      .cv-title:hover{color:var(--cu-accent-ink,#a8009c);text-decoration:underline}
      .cv-wrap .cv-title{white-space:normal}
      .cv-meta{display:inline-flex;align-items:center;gap:3px;height:20px;padding:0 5px;border-radius:4px;color:var(--cu-t3,#8e8e99);font-size:11.5px;border:0;background:none;white-space:nowrap}
      button.cv-meta{cursor:pointer}
      button.cv-meta:hover{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23)}
      .cv-meta i{font-size:13px}
      .cv-loc{font-size:11px;color:var(--cu-t3,#8e8e99);white-space:nowrap}
      .cv-iconbtn{width:24px;height:24px;border:0;background:none;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--cu-t3,#8e8e99);flex-shrink:0;padding:0}
      .cv-iconbtn:hover{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23)}
      .cv-cellbtn{border:0;background:none;padding:2px 4px;border-radius:5px;cursor:pointer;color:var(--cu-t2,#5c5c66);font-size:12.5px;min-height:24px;display:inline-flex;align-items:center;gap:4px;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      .cv-cellbtn:hover{background:var(--cu-bg3,#efeff1)}
      .cv-empty-cell{color:var(--cu-t3,#8e8e99)}
      .cv-rename{flex:1;height:26px;border:1px solid var(--cu-accent,#ff00ee);border-radius:5px;padding:0 6px;font-size:13px;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);min-width:120px}
      .cv-addrow{display:flex;align-items:center;gap:6px;height:36px;padding-left:36px;border-bottom:1px solid var(--cu-bd,#e8e8eb)}
      .cv-addbtn{border:0;background:none;color:var(--cu-t3,#8e8e99);font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:4px 6px;border-radius:5px}
      .cv-addbtn:hover{color:var(--cu-t1,#1f1f23);background:var(--cu-bg3,#efeff1)}
      .cv-qa{flex:1;height:28px;border:1px solid var(--cu-accent,#ff00ee);border-radius:6px;padding:0 8px;font-size:13px;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);min-width:160px}
      .cv-sub{background:var(--cu-bg,#fff)}
      .cv-more{margin:6px 0 0 36px}
      .cv-bulk{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 24px);padding:6px 8px;background:var(--cu-rail,#121014);color:#fff;border-radius:10px;box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14))}
      .cv-bulk .cv-bb{height:30px;padding:0 10px;border:0;background:transparent;color:#ececef;border-radius:6px;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
      .cv-bulk .cv-bb:hover{background:rgba(255,255,255,.1)}
      .cv-bulk .cv-bb.danger{color:#ff8a8f}
      .cv-bulk .cv-n{font-weight:600;padding:0 8px;font-size:12.5px;white-space:nowrap}
      .cv-bulk .cv-slot{display:inline-flex;align-items:center;border-radius:6px;background:rgba(255,255,255,.06);padding:0 2px;color:#ececef}
      /* ---- board ---- */
      .cv-board{display:flex;gap:10px;padding:12px;align-items:flex-start;min-height:100%;width:max-content}
      .cv-bcol{width:272px;flex:0 0 272px;background:var(--cu-bg2,#f7f7f8);border-radius:8px;display:flex;flex-direction:column;max-height:calc(100vh - 210px);border:1px solid transparent}
      .cv-bcol.drop{border-color:var(--cu-accent,#ff00ee);background:var(--cu-accent-fog,rgba(255,0,238,.08))}
      .cv-bcol.shut{width:44px;flex-basis:44px;align-items:center;padding:8px 0;cursor:pointer}
      .cv-bcol.shut .cv-gpill{writing-mode:vertical-rl;height:auto;padding:8px 3px}
      .cv-bhd{display:flex;align-items:center;gap:6px;padding:8px 8px 6px}
      .cv-bcards{display:flex;flex-direction:column;gap:6px;padding:2px 8px 8px;overflow-y:auto;min-height:40px}
      .cv-card{background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);border-radius:8px;padding:9px 10px;cursor:grab;position:relative}
      .cv-card:hover{border-color:var(--cu-bd2,#d6d6db);box-shadow:0 1px 4px rgba(15,15,20,.06)}
      .cv-card.dragging{opacity:.45}
      .cv-card.dropbefore{box-shadow:0 -2px 0 var(--cu-accent,#ff00ee)}
      .cv-card-t{font-size:13px;font-weight:500;line-height:1.35;color:var(--cu-t1,#1f1f23);word-break:break-word;cursor:pointer;padding-right:22px}
      .cv-card-menu{position:absolute;top:6px;right:6px;opacity:0}
      .cv-card:hover .cv-card-menu,.cv-card-menu:focus-visible{opacity:1}
      .cv-card-thumb{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;margin:7px 0 2px;display:block;background:var(--cu-bg3,#efeff1);max-width:100%}
      .cv-card-ft{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}
      .cv-dropend{height:26px;border-radius:6px}
      .cv-dropend.on{box-shadow:inset 0 2px 0 var(--cu-accent,#ff00ee)}
      /* ---- calendar ---- */
      .cv-cal{display:flex;flex-direction:column;min-height:100%;min-width:680px}
      .cv-calbar{display:flex;align-items:center;gap:6px;padding:8px 12px;flex-wrap:wrap;position:sticky;left:0}
      .cv-caltitle{font-size:15px;font-weight:600;margin:0 6px}
      .cv-calwrap{display:flex;flex:1;min-height:0}
      .cv-month{flex:1;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-template-rows:28px repeat(6,minmax(96px,1fr));border-top:1px solid var(--cu-bd,#e8e8eb);border-left:1px solid var(--cu-bd,#e8e8eb)}
      .cv-dow{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3,#8e8e99);display:flex;align-items:center;padding:0 8px;border-right:1px solid var(--cu-bd,#e8e8eb);border-bottom:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg2,#f7f7f8)}
      .cv-day{border-right:1px solid var(--cu-bd,#e8e8eb);border-bottom:1px solid var(--cu-bd,#e8e8eb);padding:4px;min-width:0;display:flex;flex-direction:column;gap:3px;position:relative}
      .cv-day.out{background:var(--cu-bg2,#f7f7f8)}
      .cv-day.out .cv-dnum{color:var(--cu-t3,#8e8e99)}
      .cv-day.drop{background:var(--cu-accent-fog,rgba(255,0,238,.08))}
      .cv-dhd{display:flex;align-items:center;justify-content:space-between}
      .cv-dnum{font-size:12px;font-weight:500;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:var(--cu-t2,#5c5c66)}
      .cv-day.today .cv-dnum{background:var(--cu-accent,#ff00ee);color:#fff}
      .cv-dadd{opacity:0}
      .cv-day:hover .cv-dadd{opacity:1}
      .cv-chip{display:flex;align-items:center;gap:4px;height:22px;padding:0 6px;border-radius:4px;border:1px solid var(--cu-bd,#e8e8eb);border-left:3px solid var(--cv-c,#87909e);background:var(--cu-bg,#fff);font-size:12px;color:var(--cu-t1,#1f1f23);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;width:100%;text-align:left}
      .cv-chip:hover{background:var(--cu-bg3,#efeff1)}
      .cv-chip.done{color:var(--cu-t3,#8e8e99);text-decoration:line-through}
      .cv-chip .cv-ctime{color:var(--cu-t3,#8e8e99);font-size:11px;flex-shrink:0}
      .cv-chip span.cv-ct{overflow:hidden;text-overflow:ellipsis}
      .cv-week{flex:1;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-top:1px solid var(--cu-bd,#e8e8eb);border-left:1px solid var(--cu-bd,#e8e8eb)}
      .cv-wcol{border-right:1px solid var(--cu-bd,#e8e8eb);min-width:0;display:flex;flex-direction:column}
      .cv-wcol.drop{background:var(--cu-accent-fog,rgba(255,0,238,.08))}
      .cv-whd{padding:8px;border-bottom:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg2,#f7f7f8);display:flex;align-items:center;gap:6px;font-size:12px;color:var(--cu-t2,#5c5c66)}
      .cv-wcol.today .cv-whd b{color:var(--cu-accent-ink,#a8009c)}
      .cv-wallday{padding:4px;border-bottom:1px dashed var(--cu-bd,#e8e8eb);min-height:34px;display:flex;flex-direction:column;gap:3px}
      .cv-wtimed{padding:4px;display:flex;flex-direction:column;gap:3px;flex:1;min-height:240px}
      .cv-drawer{width:280px;flex:0 0 280px;border-left:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg2,#f7f7f8);display:flex;flex-direction:column;min-height:0}
      .cv-dtabs{display:flex;border-bottom:1px solid var(--cu-bd,#e8e8eb)}
      .cv-dtabs button{flex:1;height:36px;border:0;background:none;font-size:12.5px;color:var(--cu-t2,#5c5c66);cursor:pointer;border-bottom:2px solid transparent}
      .cv-dtabs button.on{color:var(--cu-t1,#1f1f23);border-bottom-color:var(--cu-accent,#ff00ee);font-weight:600}
      .cv-dlist{padding:8px;display:flex;flex-direction:column;gap:4px;overflow-y:auto}
      /* ---- table ---- */
      .cv-tblwrap{padding:0 0 80px}
      .cv-tbl{border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:12.5px}
      .cv-tbl th,.cv-tbl td{border-right:1px solid var(--cu-bd,#e8e8eb);border-bottom:1px solid var(--cu-bd,#e8e8eb);height:34px;padding:0 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:var(--cu-bg,#fff);text-align:left}
      .cv-tbl th{position:sticky;top:0;z-index:4;background:var(--cu-bg2,#f7f7f8);font-weight:500;color:var(--cu-t2,#5c5c66);font-size:11.5px}
      .cv-tbl .cv-rn{position:sticky;left:0;z-index:2;width:44px;text-align:right;color:var(--cu-t3,#8e8e99);background:var(--cu-bg2,#f7f7f8)}
      .cv-tbl .cv-fc{position:sticky;left:44px;z-index:2;box-shadow:1px 0 0 var(--cu-bd2,#d6d6db)}
      .cv-tbl th.cv-rn,.cv-tbl th.cv-fc{z-index:5}
      .cv-tbl tr:hover td{background:var(--cu-bg2,#f7f7f8)}
      .cv-tbl td.cv-edit{cursor:pointer}
      .cv-tbl td.cv-edit:hover{box-shadow:inset 0 0 0 1px var(--cu-accent,#ff00ee)}
      .cv-th{position:relative;display:flex;align-items:center;height:100%}
      .cv-rsz{position:absolute;top:0;right:-6px;width:10px;height:100%;cursor:col-resize;z-index:6}
      .cv-rsz:hover,.cv-rsz.on{background:linear-gradient(90deg,transparent 4px,var(--cu-accent,#ff00ee) 4px,var(--cu-accent,#ff00ee) 6px,transparent 6px)}
      /* ---- gantt ---- */
      .cv-gantt{position:relative;min-width:max-content}
      .cv-gbar-top{display:flex;align-items:center;gap:6px;padding:8px 12px;position:sticky;left:0;flex-wrap:wrap}
      .cv-grow{display:flex;height:34px}
      .cv-gname{position:sticky;left:0;z-index:3;width:260px;flex:0 0 260px;display:flex;align-items:center;gap:6px;padding:0 10px;background:var(--cu-bg,#fff);border-right:1px solid var(--cu-bd2,#d6d6db);border-bottom:1px solid var(--cu-bd,#e8e8eb);min-width:0}
      .cv-gname .cv-title{font-size:12.5px}
      .cv-gtrack{position:relative;border-bottom:1px solid var(--cu-bd,#e8e8eb)}
      .cv-ghead{position:sticky;top:0;z-index:5;display:flex;height:44px;background:var(--cu-bg2,#f7f7f8)}
      .cv-ghead .cv-gname{background:var(--cu-bg2,#f7f7f8);z-index:6;font-size:11px;color:var(--cu-t3,#8e8e99);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--cu-bd2,#d6d6db)}
      .cv-gscale{position:relative;border-bottom:1px solid var(--cu-bd2,#d6d6db)}
      .cv-gtick{position:absolute;bottom:0;height:22px;font-size:10.5px;color:var(--cu-t3,#8e8e99);border-left:1px solid var(--cu-bd,#e8e8eb);padding-left:3px;display:flex;align-items:center;white-space:nowrap;overflow:hidden}
      .cv-gtick.big{top:0;bottom:auto;height:22px;font-weight:600;color:var(--cu-t2,#5c5c66);font-size:11px;border-left-color:var(--cu-bd2,#d6d6db)}
      .cv-gwkend{position:absolute;top:0;bottom:0;background:var(--cu-bg2,#f7f7f8);pointer-events:none}
      .cv-gtoday{position:absolute;top:0;bottom:0;width:2px;background:#e5484d;z-index:2;pointer-events:none}
      .cv-bar{position:absolute;top:7px;height:20px;border-radius:5px;color:#fff;font-size:11px;display:flex;align-items:center;padding:0 8px;white-space:nowrap;overflow:hidden;cursor:grab;touch-action:none;z-index:1}
      .cv-bar.dragging{cursor:grabbing;opacity:.85}
      .cv-bar .cv-hdl{position:absolute;right:0;top:0;width:8px;height:100%;cursor:ew-resize;background:rgba(0,0,0,.18)}
      .cv-diamond{position:absolute;top:9px;width:16px;height:16px;transform:rotate(45deg);border-radius:3px;cursor:grab;touch-action:none;z-index:1}
      .cv-gsec{position:sticky;left:0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3,#8e8e99);padding:14px 10px 6px;font-weight:600}
      /* ---- workload ---- */
      .cv-wl{min-width:760px;padding:0 12px 40px}
      .cv-wlgrid{display:grid;grid-template-columns:220px repeat(7,minmax(70px,1fr)) 120px}
      .cv-wlgrid>div{border-bottom:1px solid var(--cu-bd,#e8e8eb);min-height:44px;display:flex;align-items:center;padding:0 8px;min-width:0}
      .cv-wlhd{font-size:11px;color:var(--cu-t3,#8e8e99);text-transform:uppercase;letter-spacing:.04em;position:sticky;top:0;background:var(--cu-bg,#fff);z-index:2;min-height:34px!important}
      .cv-wlhd.today{color:var(--cu-accent-ink,#a8009c);font-weight:600}
      .cv-wlmem{position:sticky;left:0;background:var(--cu-bg,#fff);z-index:1;gap:8px}
      .cv-wlcell{justify-content:center;border-left:1px solid var(--cu-bd,#e8e8eb)}
      .cv-wlcell button{width:100%;min-height:34px;border:0;border-radius:6px;background:transparent;cursor:pointer;color:var(--cu-t1,#1f1f23);font-size:12.5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}
      .cv-wlcell button:hover{background:var(--cu-bg3,#efeff1)}
      .cv-wlcell button.has{background:var(--cu-accent-fog,rgba(255,0,238,.08))}
      .cv-wlcell small{font-size:10.5px;color:var(--cu-t3,#8e8e99)}
      .cv-wltot{border-left:1px solid var(--cu-bd2,#d6d6db);flex-direction:column;align-items:stretch!important;justify-content:center;gap:4px}
      .cv-meter{height:5px;border-radius:3px;background:var(--cu-bg3,#efeff1);overflow:hidden}
      .cv-meter>i{display:block;height:100%;border-radius:3px}
      .cv-tone-ok{color:var(--cv-ok)} .cv-tone-near{color:var(--cv-near)} .cv-tone-over{color:var(--cv-over)}
      /* ---- side panel ---- */
      .cv-side-bg{position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.18)}
      .cv-side{position:fixed;top:0;right:0;bottom:0;width:min(360px,100vw);z-index:81;background:var(--cu-bg,#fff);border-left:1px solid var(--cu-bd,#e8e8eb);box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14));display:flex;flex-direction:column;color:var(--cu-t1,#1f1f23);font-size:13px}
      .cv-side-hd{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--cu-bd,#e8e8eb);font-size:15px;font-weight:600}
      .cv-side-bd{flex:1;overflow-y:auto;padding:10px 8px}
      .cv-tog{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:36px;padding:0 8px;border-radius:6px;cursor:pointer}
      .cv-tog:hover{background:var(--cu-bg2,#f7f7f8)}
      .cv-tog small{display:block;color:var(--cu-t3,#8e8e99);font-size:11.5px}
      .cv-switch{width:30px;height:18px;border-radius:9px;background:var(--cu-bd2,#d6d6db);position:relative;flex-shrink:0;border:0;padding:0;cursor:pointer}
      .cv-switch::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .15s}
      .cv-switch.on{background:var(--cu-accent,#ff00ee)}
      .cv-switch.on::after{left:14px}
      .cv-side-ft{padding:12px 16px;border-top:1px solid var(--cu-bd,#e8e8eb);display:flex;gap:8px;flex-wrap:wrap}
      .cv-danger{color:#e5484d!important}
      .cv-loading{padding:14px}
      /* ---- v2: shared bits ---- */
      .cv-root:focus{outline:none}
      .cv-row.kb,.cv-card.kb,.cv-grow.kb>.cv-gname,.cv-tbl tr.kb td{box-shadow:inset 2px 0 0 var(--cu-accent,#ff00ee)}
      .cv-card.kb{box-shadow:0 0 0 2px var(--cu-accent,#ff00ee)}
      .cv-badge{display:inline-flex;align-items:center;gap:3px;height:18px;padding:0 5px;border-radius:4px;font-size:10.5px;font-weight:600;white-space:nowrap;flex-shrink:0}
      .cv-badge i{font-size:12px}
      .cv-badge.crit{background:rgba(229,72,77,.12);color:#e5484d}
      .cv-badge.warn{background:rgba(245,166,35,.14);color:#c77c02}
      html.dark .cv-badge.warn{color:#f5a623}
      .cv-xbadge{display:inline-flex;align-items:center;flex-shrink:0}
      .cv-name.loc{flex-wrap:wrap;padding-top:4px;padding-bottom:4px;row-gap:0}
      .cv-locline{flex-basis:100%;padding-left:46px;font-size:11px;color:var(--cu-t3,#8e8e99);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:16px}
      .cv-card .cv-locline{padding-left:0;margin-top:3px}
      .cv-seg{display:inline-flex;gap:2px}
      .cv-printhead{display:none}
      .cv-modal-bg{position:fixed;inset:0;z-index:90;background:rgba(15,15,20,.32);display:flex;align-items:center;justify-content:center;padding:16px}
      .cv-modal{width:min(780px,100%);max-height:min(88vh,860px);display:flex;flex-direction:column;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14));font-family:Inter,system-ui,sans-serif;font-size:13px}
      .cv-modal *{box-sizing:border-box}
      .cv-modal-hd{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--cu-bd,#e8e8eb);font-size:15px;font-weight:600}
      .cv-modal-bd{flex:1;overflow:auto;padding:14px 16px}
      .cv-modal-ft{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--cu-bd,#e8e8eb);flex-wrap:wrap}
      .cv-drop{border:1.5px dashed var(--cu-bd2,#d6d6db);border-radius:8px;padding:28px 16px;text-align:center;color:var(--cu-t2,#5c5c66);cursor:pointer;background:var(--cu-bg2,#f7f7f8)}
      .cv-drop.on,.cv-drop:hover{border-color:var(--cu-accent,#ff00ee);background:var(--cu-accent-fog,rgba(255,0,238,.08))}
      .cv-maptbl{width:100%;border-collapse:collapse;font-size:12.5px}
      .cv-maptbl th,.cv-maptbl td{border-bottom:1px solid var(--cu-bd,#e8e8eb);padding:6px 8px;text-align:left;vertical-align:middle}
      .cv-maptbl th{font-size:11px;color:var(--cu-t3,#8e8e99);font-weight:500;text-transform:uppercase;letter-spacing:.04em}
      .cv-maptbl td.cv-sample{color:var(--cu-t2,#5c5c66);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cv-note{font-size:12px;color:var(--cu-t3,#8e8e99);line-height:1.45}
      .cv-err{font-size:12.5px;color:#e5484d;line-height:1.45}
      /* ---- v2: calendar day ---- */
      .cv-dayv{flex:1;display:flex;flex-direction:column;border-top:1px solid var(--cu-bd,#e8e8eb);min-width:0}
      .cv-dayv-all{display:flex;gap:6px;align-items:flex-start;padding:6px 8px 6px 64px;border-bottom:1px solid var(--cu-bd,#e8e8eb);min-height:38px;flex-wrap:wrap;position:relative;background:var(--cu-bg,#fff)}
      .cv-dayv-all.drop{background:var(--cu-accent-fog,rgba(255,0,238,.08))}
      .cv-dayv-all>.cv-lbl{position:absolute;left:8px;top:11px;font-size:10.5px;color:var(--cu-t3,#8e8e99);text-transform:uppercase;letter-spacing:.04em}
      .cv-dayv-all .cv-chip{width:auto;max-width:260px}
      .cv-hours{position:relative;margin-left:56px;border-left:1px solid var(--cu-bd,#e8e8eb)}
      .cv-hr{position:relative;border-bottom:1px solid var(--cu-bd,#e8e8eb)}
      .cv-hr:nth-child(odd){background:transparent}
      .cv-hr>span{position:absolute;left:-54px;top:-7px;width:46px;text-align:right;font-size:10.5px;color:var(--cu-t3,#8e8e99)}
      .cv-hr.off{background:var(--cu-bg2,#f7f7f8)}
      .cv-evt{position:absolute;border-radius:5px;padding:2px 6px;font-size:11.5px;overflow:hidden;cursor:pointer;border:1px solid var(--cu-bd,#e8e8eb);border-left:3px solid var(--cv-c,#87909e);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);text-align:left;display:flex;flex-direction:column;gap:1px;z-index:1;box-shadow:0 1px 2px rgba(15,15,20,.05)}
      .cv-evt:hover{background:var(--cu-bg3,#efeff1);z-index:2}
      .cv-evt.done{color:var(--cu-t3,#8e8e99);text-decoration:line-through}
      .cv-evt small{color:var(--cu-t3,#8e8e99);font-size:10.5px}
      .cv-dropline{position:absolute;left:0;right:0;height:0;border-top:2px solid var(--cu-accent,#ff00ee);z-index:3;pointer-events:none}
      .cv-dropline>b{position:absolute;left:4px;top:-18px;font-size:10.5px;color:var(--cu-accent-ink,#a8009c);background:var(--cu-bg,#fff);padding:0 4px;border-radius:3px}
      .cv-nowline{position:absolute;left:-4px;right:0;height:0;border-top:2px solid #e5484d;z-index:3;pointer-events:none}
      .cv-nowline::before{content:'';position:absolute;left:-4px;top:-5px;width:8px;height:8px;border-radius:50%;background:#e5484d}
      /* ---- v2: gantt / timeline ---- */
      .cv-bar.crit,.cv-diamond.crit{box-shadow:0 0 0 2px #e5484d}
      .cv-deps{position:absolute;top:0;pointer-events:none;z-index:2;overflow:visible}
      .cv-tl-lane{display:flex;border-bottom:1px solid var(--cu-bd,#e8e8eb)}
      .cv-tl-lane .cv-gname{border-bottom:0;align-items:flex-start;padding-top:8px}
      .cv-tl-track{position:relative}
      .cv-tl-track .cv-bar{height:22px}
      /* ---- v2: board wip ---- */
      .cv-bcol.wip-near .cv-bhd .cv-gcount{color:var(--cv-near);font-weight:600}
      .cv-bcol.wip-over{border-color:rgba(229,72,77,.45);background:rgba(229,72,77,.06)}
      .cv-bcol.wip-over .cv-bhd .cv-gcount{color:var(--cv-over);font-weight:600}
      /* ---- v2: workload ---- */
      .cv-wlgrid>.cv-wlcell{flex-direction:column;align-items:stretch;justify-content:flex-start;padding:4px;gap:3px;min-height:58px}
      .cv-wlgrid>.cv-wlcell.off{background:repeating-linear-gradient(135deg,transparent 0 6px,var(--cu-bg2,#f7f7f8) 6px 12px)}
      .cv-wlgrid>.cv-wlcell.drop{background:var(--cu-accent-fog,rgba(255,0,238,.08));box-shadow:inset 0 0 0 1px var(--cu-accent,#ff00ee)}
      .cv-wlgrid>.cv-wlcell.t-over>button.cv-wlsum{background:rgba(229,72,77,.12)}
      .cv-wlgrid>.cv-wlcell.t-near>button.cv-wlsum{background:rgba(245,166,35,.14)}
      .cv-wlgrid>.cv-wlcell.t-ok>button.cv-wlsum.has{background:rgba(48,164,108,.10)}
      .cv-wlcell button.cv-wlsum{min-height:24px;flex-direction:row;gap:5px}
      .cv-wlcell button.cv-meta{width:auto;min-height:20px;flex-direction:row}
      .cv-wlcell button.cv-wlchip{display:block;width:100%;min-height:0;height:20px;line-height:18px;padding:0 5px;border-radius:4px;border:1px solid var(--cu-bd,#e8e8eb);border-left:3px solid var(--cv-c,#87909e);background:var(--cu-bg,#fff);font-size:11px;color:var(--cu-t1,#1f1f23);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:grab;text-align:left}
      .cv-wlchip:hover{background:var(--cu-bg3,#efeff1)}
      /* ---- v2: activity ---- */
      .cv-act{max-width:860px;margin:0 auto;padding:8px 16px 60px}
      .cv-act-day{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3,#8e8e99);padding:16px 0 6px}
      .cv-act-it{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--cu-bd,#e8e8eb);align-items:flex-start}
      .cv-act-tx{flex:1;min-width:0;line-height:1.45;color:var(--cu-t2,#5c5c66)}
      .cv-act-tx b{color:var(--cu-t1,#1f1f23);font-weight:600}
      .cv-act-task{border:0;background:none;padding:0;color:var(--cu-t1,#1f1f23);font-weight:500;cursor:pointer;font-size:13px;text-align:left}
      .cv-act-task:hover{color:var(--cu-accent-ink,#a8009c);text-decoration:underline}
      .cv-act-q{display:block;margin-top:4px;padding:6px 10px;border-radius:6px;background:var(--cu-bg2,#f7f7f8);color:var(--cu-t1,#1f1f23);white-space:pre-wrap;word-break:break-word}
      .cv-spill{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:4px;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;vertical-align:1px}
      /* ---- v2: team ---- */
      .cv-team{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px;padding:12px 12px 60px}
      .cv-tcard{border:1px solid var(--cu-bd,#e8e8eb);border-radius:8px;background:var(--cu-bg,#fff);display:flex;flex-direction:column;min-width:0}
      .cv-tcard-hd{display:flex;align-items:center;gap:10px;padding:12px 12px 8px}
      .cv-online{position:relative;display:inline-flex}
      .cv-online>i{position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;border:2px solid var(--cu-bg,#fff);background:#b4b4bd}
      .cv-online>i.on{background:#30a46c}
      .cv-online>i.dnd{background:#e5484d}
      .cv-tstats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:0 12px 8px}
      .cv-tstat{border:1px solid var(--cu-bd,#e8e8eb);border-radius:6px;padding:6px 8px;background:var(--cu-bg,#fff);cursor:pointer;text-align:left;color:var(--cu-t2,#5c5c66);font-size:11px}
      .cv-tstat b{display:block;font-size:17px;color:var(--cu-t1,#1f1f23);font-weight:600}
      .cv-tstat.on{border-color:var(--cu-accent,#ff00ee);background:var(--cu-accent-fog,rgba(255,0,238,.08))}
      .cv-tlist{border-top:1px solid var(--cu-bd,#e8e8eb);padding:4px 6px 8px;display:flex;flex-direction:column;max-height:230px;overflow-y:auto}
      .cv-timer{display:flex;align-items:center;gap:6px;margin:0 12px 8px;padding:5px 8px;border-radius:6px;background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c);font-size:12px;cursor:pointer;border:0;text-align:left}
      /* ---- v2: embed ---- */
      .cv-embed{display:flex;flex-direction:column;height:100%;min-height:420px}
      .cv-embed-bar{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--cu-bd,#e8e8eb);flex-wrap:wrap}
      .cv-embed iframe{flex:1;width:100%;border:0;min-height:380px;background:var(--cu-bg2,#f7f7f8)}
      .cv-embed-form{max-width:560px;margin:40px auto;padding:0 16px;display:flex;flex-direction:column;gap:10px}
      .cv-prov{display:flex;flex-wrap:wrap;gap:6px}
      .cv-prov span{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:12px;background:var(--cu-bg2,#f7f7f8);color:var(--cu-t2,#5c5c66);font-size:11.5px}
      /* ---- v2: mind map ---- */
      .cv-mm{padding:24px 24px 80px;min-width:max-content;transform-origin:0 0}
      .cv-mm-branch{display:flex;align-items:center}
      .cv-mm-kids{display:flex;flex-direction:column;padding-left:26px;position:relative}
      .cv-mm-kids::before{content:'';position:absolute;left:0;top:50%;width:26px;border-top:1.5px solid var(--cu-bd2,#d6d6db)}
      .cv-mm-kid{position:relative;padding:4px 0 4px 20px}
      .cv-mm-kid::before{content:'';position:absolute;left:0;top:50%;width:20px;border-top:1.5px solid var(--cu-bd2,#d6d6db)}
      .cv-mm-kid::after{content:'';position:absolute;left:0;top:0;bottom:0;border-left:1.5px solid var(--cu-bd2,#d6d6db)}
      .cv-mm-kid:first-child::after{top:50%}
      .cv-mm-kid:last-child::after{bottom:50%}
      .cv-mm-kid:only-child::after{display:none}
      .cv-mm-node{display:flex;align-items:center;gap:6px;min-height:34px;max-width:300px;padding:5px 8px;border:1px solid var(--cu-bd,#e8e8eb);border-radius:8px;background:var(--cu-bg,#fff);box-shadow:0 1px 2px rgba(15,15,20,.04)}
      .cv-mm-node:hover{border-color:var(--cu-bd2,#d6d6db)}
      .cv-mm-node.root{background:var(--cu-accent,#ff00ee);border-color:var(--cu-accent,#ff00ee);color:#fff;font-weight:600;font-size:14px;padding:8px 14px}
      .cv-mm-node.root .cv-iconbtn{color:#fff}
      .cv-mm-node.grp{background:var(--cu-bg2,#f7f7f8)}
      .cv-mm-node .cv-title{white-space:nowrap}
      .cv-mm-add{display:flex;gap:4px;align-items:center}
      @media print{
        html.cv-printing body *{visibility:hidden!important}
        html.cv-printing .cv-print-target,html.cv-printing .cv-print-target *{visibility:visible!important}
        html.cv-printing .cv-print-target{position:absolute!important;left:0!important;top:0!important;width:auto!important;height:auto!important;overflow:visible!important;background:#fff!important;color:#000!important}
        html.cv-printing .cv-print-target .cv-body{overflow:visible!important}
        html.cv-printing .cv-print-target .cv-tabs,html.cv-printing .cv-print-target .cv-toolbar,html.cv-printing .cv-print-target .cv-noprint,html.cv-printing .cv-bulk{display:none!important}
        html.cv-printing .cv-print-target .cv-printhead{display:block!important;font:600 16px Inter,system-ui,sans-serif;padding:0 0 10px}
        html.cv-printing .cv-print-target .cv-gname,html.cv-printing .cv-print-target .cv-ghead,html.cv-printing .cv-print-target .cv-colhd,html.cv-printing .cv-print-target .cv-tbl th{position:static!important}
      }
      @media(max-width:640px){.cv-search input{width:100px}.cv-hide-sm{display:none}.cv-drawer{width:220px;flex-basis:220px}.cv-team{grid-template-columns:1fr}.cv-dayv-all{padding-left:8px}.cv-dayv-all>.cv-lbl{display:none}}
      @media(prefers-reduced-motion:reduce){.cv-root *,.cv-side *,.cv-bulk *,.cv-modal *{transition:none!important;animation:none!important}}
      `;
      document.head.appendChild(st);
    }

    // =========================================================================
    // Helpers — dates
    // =========================================================================
    const DAY = 86400000;
    const noop = () => {};
    // User preferences (member_prefs: week_start / date_format / time_format).
    // One signed-in user per page, so a module-level snapshot is safe; TaskViews
    // refreshes it on every render from the store (or a fail-open RPC fallback).
    const PREF = { weekStart: 1, dateFormat: 'DD MMM', timeFormat: '12h' };
    const applyPrefs = (p) => {
      const ws = p && p.week_start != null ? Number(p.week_start) : 1;
      PREF.weekStart = [0, 1, 6].includes(ws) ? ws : 1;
      PREF.dateFormat = (p && ['DD MMM', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].includes(p.date_format)) ? p.date_format : 'DD MMM';
      PREF.timeFormat = p && p.time_format === '24h' ? '24h' : '12h';
    };
    const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const startOfWeek = (d) => { const x = sod(d); return addDays(x, -((x.getDay() - PREF.weekStart + 7) % 7)); };
    const sameDay = (a, b) => sod(a).getTime() === sod(b).getTime();
    const allDayIso = (d) => { const x = new Date(d); x.setHours(23, 59, 0, 0); return x.toISOString(); };
    const dayDiff = (a, b) => Math.round((sod(b) - sod(a)) / DAY);
    const pad2 = (n) => String(n).padStart(2, '0');
    const fmtShort = (d) => {
      if (!d) return '';
      const x = new Date(d); if (isNaN(x)) return '';
      const dd = pad2(x.getDate()), mm = pad2(x.getMonth() + 1), yy = x.getFullYear();
      switch (PREF.dateFormat) {
        case 'DD/MM/YYYY': return dd + '/' + mm + '/' + yy;
        case 'MM/DD/YYYY': return mm + '/' + dd + '/' + yy;
        case 'YYYY-MM-DD': return yy + '-' + mm + '-' + dd;
        default: return x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      }
    };
    const fmtTime = (d) => PREF.timeFormat === '24h'
      ? (() => { const x = new Date(d); return pad2(x.getHours()) + ':' + pad2(x.getMinutes()); })()
      : new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    const fmtHour = (h24) => PREF.timeFormat === '24h' ? pad2(h24) + ':00' : ((h24 % 12) || 12) + (h24 < 12 ? ' am' : ' pm');
    const monthTitle = (d) => new Date(d).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const DOW_ALL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dowLabel = (d) => DOW_ALL[new Date(d).getDay()];
    const dowHeads = () => Array.from({ length: 7 }, (_, i) => DOW_ALL[(PREF.weekStart + i) % 7]);
    const isoStamp = (d, withTime) => { if (!d) return ''; const x = new Date(d); if (isNaN(x)) return ''; const s = x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate()); return withTime ? s + ' ' + pad2(x.getHours()) + ':' + pad2(x.getMinutes()) : s; };
    const relTime = (iso) => {
      const t = Date.parse(iso); if (isNaN(t)) return '';
      const s = Math.round((Date.now() - t) / 1000);
      if (s < 45) return 'just now';
      if (s < 3600) return Math.round(s / 60) + 'm ago';
      if (s < 86400) return Math.round(s / 3600) + 'h ago';
      if (s < 7 * 86400) return Math.round(s / 86400) + 'd ago';
      return fmtShort(iso);
    };
    // move a due date to another day, keeping its time of day (all-day keeps 23:59)
    const moveDueTo = (row, day) => {
      const t = new Date(day);
      if (row && row.due_at && row.due_has_time !== false) {
        const o = new Date(row.due_at);
        t.setHours(o.getHours(), o.getMinutes(), 0, 0);
        return { due_at: t.toISOString(), due_has_time: true };
      }
      return { due_at: allDayIso(t), due_has_time: false };
    };

    const lsGet = (k, fb) => { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (_) { return fb; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { } };
    const uid = () => Math.random().toString(36).slice(2, 9);
    const errMsg = (e) => (e && (e.message || e.code)) || 'Something went wrong';
    const cssEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&'));
    const copy = async (text) => {
      if (typeof copyText === 'function') { try { const ok = await copyText(text); if (ok !== false) return true; } catch (_) { } }
      try { await navigator.clipboard.writeText(text); return true; } catch (_) { return false; }
    };

    // =========================================================================
    // View types + default config
    // =========================================================================
    const VIEW_TYPES = [
      { key: 'list', label: 'List', icon: 'ti-list', desc: 'Grouped rows with inline editing' },
      { key: 'board', label: 'Board', icon: 'ti-layout-kanban', desc: 'Kanban columns, drag to change' },
      { key: 'calendar', label: 'Calendar', icon: 'ti-calendar', desc: 'Plan tasks by month, week or day' },
      { key: 'table', label: 'Table', icon: 'ti-table', desc: 'Spreadsheet grid of fields' },
      { key: 'gantt', label: 'Gantt', icon: 'ti-timeline', desc: 'Start → due bars with dependencies' },
      { key: 'workload', label: 'Workload', icon: 'ti-chart-bar', desc: 'Team capacity by day, drag to rebalance' },
      { key: 'timeline', label: 'Timeline', icon: 'ti-timeline-event', desc: 'Bars in lanes by person, client or list' },
      { key: 'activity', label: 'Activity', icon: 'ti-activity', desc: 'Live feed of changes in this space' },
      { key: 'team', label: 'Team', icon: 'ti-users-group', desc: 'What everyone is working on right now' },
      { key: 'mindmap', label: 'Mind map', icon: 'ti-binary-tree-2', desc: 'Tasks and subtasks as a tree' },
      { key: 'embed', label: 'Embed', icon: 'ti-world-www', desc: 'Docs, Sheets, Figma, YouTube, Miro, Loom…' },
    ];
    const VT = Object.fromEntries(VIEW_TYPES.map(v => [v.key, v]));
    const BUILTIN_TAB_KEYS = ['list', 'board', 'calendar', 'table', 'gantt', 'workload'];
    // registry views (docs/forms/dashboards/whiteboards…) — read at render time
    const extViews = () => (Array.isArray(EXT().views) ? EXT().views : [])
      .filter(v => v && v.key && !VT[v.key] && typeof v.Component === 'function');
    const viewMeta = (type) => VT[type] || extViews().find(v => v.key === type) || null;
    const ROW_VIEWS = ['list', 'board', 'calendar', 'table', 'gantt', 'workload', 'timeline', 'team', 'mindmap'];
    const DEFAULT_CONFIG = {
      group_by: 'status', group_dir: 'asc', sort: null, filters: {}, filter_rows: [],
      columns: ['assignee', 'due', 'priority'], show_closed: false, show_subtasks: 'collapsed',
      calendar_mode: 'month', gantt_zoom: 'week', col_widths: {}, show_empty: false,
      wrap_text: false, show_locations: false,
      wip: {}, workload_mode: 'tasks', timeline_lane: 'assignee', embed_url: '', mindmap_group: 'none',
    };
    const defaultConfigFor = (type) => {
      const c = { ...DEFAULT_CONFIG };
      if (type === 'table') { c.group_by = 'none'; c.columns = ['status', 'assignee', 'due', 'priority', 'client', 'list', 'estimate']; }
      if (type !== 'list' && type !== 'board' && type !== 'table') c.group_by = 'none';
      return c;
    };
    const normConfig = (type, cfg) => ({ ...defaultConfigFor(type), ...(cfg || {}) });

    // =========================================================================
    // Column catalog
    // =========================================================================
    const COLS = {
      assignee: { label: 'Assignee', w: 110, sort: 'assignee' },
      due: { label: 'Due date', w: 112, sort: 'due' },
      priority: { label: 'Priority', w: 96, sort: 'priority' },
      status: { label: 'Status', w: 136, sort: 'status' },
      comments: { label: 'Comments', w: 86, sort: 'comments' },
      client: { label: 'Client', w: 140, sort: 'client' },
      list: { label: 'List', w: 140, sort: 'list' },
      type: { label: 'Type', w: 112, sort: 'type' },
      created: { label: 'Date created', w: 108, sort: 'created' },
      updated: { label: 'Date updated', w: 108, sort: 'updated' },
      estimate: { label: 'Time estimate', w: 104, sort: 'estimate' },
      time: { label: 'Time tracked', w: 104, sort: 'time' },
      start: { label: 'Start date', w: 112, sort: 'start' },
      estimate_rollup: { label: 'Estimate (incl. subtasks)', w: 128, sort: 'estimate_rollup', feature: 'time_tracking' },
      time_rollup: { label: 'Tracked (incl. subtasks)', w: 128, sort: 'time_rollup', feature: 'time_tracking' },
    };
    COLS.time.feature = 'time_tracking';
    COLS.priority.feature = 'priorities';
    const colMeta = (key, fieldById) => {
      if (key.startsWith('cf:')) {
        const f = fieldById[key.slice(3)];
        return f ? { label: f.name, w: 130, field: f, sort: key } : null;
      }
      return COLS[key] || null;
    };

    // =========================================================================
    // Sorting
    // =========================================================================
    const nullLast = (a, b, cmp) => (a == null && b == null) ? 0 : a == null ? 1 : b == null ? -1 : cmp(a, b);
    const cmpNum = (a, b) => a - b;
    const cmpStr = (a, b) => String(a).localeCompare(String(b), 'en', { sensitivity: 'base' });
    function sortRows(rows, sort, statusPos) {
      if (!sort || !sort.field) return rows;
      const dir = sort.dir === 'desc' ? -1 : 1;
      const f = sort.field;
      const val = (r) => {
        switch (f) {
          case 'title': return r.title || '';
          case 'due': return r.due_at ? Date.parse(r.due_at) : null;
          case 'start': return r.start_at ? Date.parse(r.start_at) : null;
          case 'priority': return r.priority || null;
          case 'created': return r.created_at ? Date.parse(r.created_at) : null;
          case 'updated': return r.updated_at ? Date.parse(r.updated_at) : null;
          case 'status': return statusPos(r);
          case 'estimate': return r.estimate_minutes || null;
          case 'time': return r.time_spent_minutes || null;
          case 'estimate_rollup': return r.estimate_rollup_minutes != null ? (r.estimate_rollup_minutes || null) : (r.estimate_minutes || null);
          case 'time_rollup': return r.time_rollup_minutes != null ? (r.time_rollup_minutes || null) : (r.time_spent_minutes || null);
          case 'comments': return r.comment_count || 0;
          case 'client': return r.client_name || null;
          case 'list': return r.list_name || null;
          case 'type': return r.type || null;
          case 'assignee': return (r.assignees && r.assignees[0] && r.assignees[0].name) || null;
          case 'position': return r.position == null ? null : Number(r.position);
          default:
            if (f.startsWith('cf:')) { const v = (r.custom_fields || {})[f.slice(3)]; return v == null || v === '' ? null : v; }
            return null;
        }
      };
      return rows.slice().sort((a, b) => {
        const va = val(a), vb = val(b);
        return nullLast(va, vb, (x, y) => (typeof x === 'number' && typeof y === 'number' ? cmpNum(x, y) : cmpStr(x, y)) * dir);
      });
    }
    const byPosition = (rows) => rows.slice().sort((a, b) => nullLast(a.position == null ? null : Number(a.position), b.position == null ? null : Number(b.position), cmpNum)
      || String(a.created_at || '').localeCompare(String(b.created_at || '')));

    // =========================================================================
    // Grouping
    // =========================================================================
    const GROUP_OPTS = [
      { key: 'status', label: 'Status', icon: 'ti-progress' },
      { key: 'assignee', label: 'Assignee', icon: 'ti-user' },
      { key: 'priority', label: 'Priority', icon: 'ti-flag' },
      { key: 'due', label: 'Due date', icon: 'ti-calendar-due' },
      { key: 'client', label: 'Client', icon: 'ti-building' },
      { key: 'list', label: 'List', icon: 'ti-list-details' },
      { key: 'type', label: 'Task type', icon: 'ti-category' },
      { key: 'tag', label: 'Tags', icon: 'ti-tag' },
      { key: 'none', label: 'None', icon: 'ti-circle-off' },
    ];
    const DUE_BUCKETS = [
      { key: 'overdue', label: 'Overdue', color: '#e5484d' },
      { key: 'today', label: 'Today', color: '#ff00ee' },
      { key: 'tomorrow', label: 'Tomorrow', color: '#f5a623' },
      { key: 'week', label: 'This week', color: '#4c8df6' },
      { key: 'next', label: 'Next week', color: '#7b68ee' },
      { key: 'later', label: 'Later', color: '#87909e' },
      { key: 'none', label: 'No date', color: '#b4b4bd' },
    ];
    function dueBucketOf(row, now) {
      if (!row.due_at) return 'none';
      if (isOverdue(row)) return 'overdue';
      const today = sod(now), d = sod(row.due_at);
      const diff = Math.round((d - today) / DAY);
      if (diff < 0) return 'overdue'; // closed rows with a past due date
      if (diff === 0) return 'today';
      if (diff === 1) return 'tomorrow';
      const wk = startOfWeek(today);
      if (d < addDays(wk, 7)) return 'week';
      if (d < addDays(wk, 14)) return 'next';
      return 'later';
    }
    function dueBucketPreset(key, now) {
      const today = sod(now);
      if (key === 'today') return { due_at: allDayIso(today), due_has_time: false };
      if (key === 'tomorrow') return { due_at: allDayIso(addDays(today, 1)), due_has_time: false };
      if (key === 'week') return { due_at: allDayIso(addDays(startOfWeek(today), 6)), due_has_time: false };
      if (key === 'next') return { due_at: allDayIso(addDays(startOfWeek(today), 7)), due_has_time: false };
      return {};
    }
    const NO_PRI_COLOR = '#b4b4bd';
    const priMeta = (p) => (p && PRIORITIES && PRIORITIES[p]) || null;
    const typeMeta = (t) => (TYPE_META && TYPE_META[t]) || { label: t || 'Task', icon: 'ti-circle-check' };

    // ctx: { store, now, scope, cfg }
    // returns [{ key, label, color, solid, rows, preset, dragPatch, avatar }]
    function buildGroups(rows, groupBy, ctx) {
      const { store, now } = ctx;
      const map = new Map();
      const add = (key, row, mk) => {
        let g = map.get(key);
        if (!g) { g = { key, rows: [], ...mk() }; map.set(key, g); }
        if (row) g.rows.push(row);
      };
      const statusRank = (key, listId) => {
        const s = store.statusMeta ? store.statusMeta(listId, key) : null;
        const catRank = { todo: 0, active: 1, done: 2 };
        return s ? (catRank[s.category] || 0) * 1000 + (s.position || 0) : 99999;
      };
      if (groupBy === 'none') {
        return [{ key: 'all', label: 'All tasks', color: null, rows: rows.slice(), preset: {}, dragPatch: null }];
      }
      if (groupBy === 'status') {
        // seed empty statuses for a single-list scope (board always; list with show_empty)
        if (ctx.scopeListId && (ctx.seedEmpty)) {
          (store.statusesFor(ctx.scopeListId) || []).forEach(s => add(s.key, null, () => ({
            label: s.name, color: s.color, solid: true, category: s.category, rank: statusRank(s.key, ctx.scopeListId),
            preset: { status: s.key }, dragPatch: { status: s.key },
          })));
        }
        rows.forEach(r => add(r.status || 'unknown', r, () => ({
          label: r.status_name || r.status || 'Unknown', color: r.status_color || '#87909e', solid: true,
          category: r.status_category, rank: r.status ? statusRank(r.status, r.list_id) : 999999,
          preset: { status: r.status }, dragPatch: r.status ? { status: r.status } : null,
        })));
        return Array.from(map.values()).sort((a, b) => a.rank - b.rank);
      }
      if (groupBy === 'assignee') {
        rows.forEach(r => {
          const as = r.assignees || [];
          if (!as.length) add('__none', r, () => ({ label: 'Unassigned', color: null, preset: {}, dragPatch: { assignee_ids: [] }, rank: 1e9 }));
          as.forEach(a => add(a.id, r, () => {
            const m = (store.memberById && store.memberById[a.id]) || a;
            return { label: m.name || a.name, color: null, avatar: m, preset: { assignee_ids: [a.id] }, dragPatch: { assignee_ids: [a.id] }, rank: 0 };
          }));
        });
        return Array.from(map.values()).sort((a, b) => a.rank - b.rank || cmpStr(a.label, b.label));
      }
      if (groupBy === 'priority') {
        [1, 2, 3, 4].forEach(p => { if (ctx.seedEmpty) add('p' + p, null, () => ({ label: priMeta(p) ? priMeta(p).label : 'P' + p, color: priMeta(p) ? priMeta(p).color : NO_PRI_COLOR, solid: true, preset: { priority: p }, dragPatch: { priority: p }, rank: p })); });
        rows.forEach(r => {
          const p = r.priority || null;
          add(p ? 'p' + p : 'p0', r, () => p
            ? { label: priMeta(p) ? priMeta(p).label : 'P' + p, color: priMeta(p) ? priMeta(p).color : NO_PRI_COLOR, solid: true, preset: { priority: p }, dragPatch: { priority: p }, rank: p }
            : { label: 'No priority', color: NO_PRI_COLOR, solid: true, preset: {}, dragPatch: { priority: null }, rank: 9 });
        });
        return Array.from(map.values()).sort((a, b) => a.rank - b.rank);
      }
      if (groupBy === 'due') {
        rows.forEach(r => add(dueBucketOf(r, now), r, () => ({})));
        return DUE_BUCKETS.filter(b => map.has(b.key) || ctx.seedEmpty).map(b => ({
          key: b.key, label: b.label, color: b.color, solid: true, rows: (map.get(b.key) || { rows: [] }).rows,
          preset: dueBucketPreset(b.key, now), dragPatch: null,
        }));
      }
      if (groupBy === 'client') {
        rows.forEach(r => add(r.client_id || '__agency', r, () => r.client_id
          ? { label: r.client_name || 'Client', color: r.client_color || '#87909e', solid: true, preset: { client_id: r.client_id }, dragPatch: null, rank: 0 }
          : { label: 'Agency', color: '#5c5c66', solid: true, preset: {}, dragPatch: null, rank: -1 }));
        return Array.from(map.values()).sort((a, b) => a.rank - b.rank || cmpStr(a.label, b.label));
      }
      if (groupBy === 'list') {
        rows.forEach(r => add(r.list_id || '__none', r, () => {
          const l = (store.listById && store.listById[r.list_id]) || {};
          return { label: r.list_name || l.name || 'No list', color: l.color || null, preset: r.list_id ? { list_id: r.list_id } : {}, dragPatch: r.list_id ? { list_id: r.list_id } : null, sub: r.client_name || 'Agency' };
        }));
        return Array.from(map.values()).sort((a, b) => cmpStr(a.sub + a.label, b.sub + b.label));
      }
      if (groupBy === 'type') {
        rows.forEach(r => add(r.type || 'task', r, () => { const m = typeMeta(r.type); return { label: m.label, icon: m.icon, color: null, preset: { type: r.type || 'task' }, dragPatch: null }; }));
        return Array.from(map.values()).sort((a, b) => cmpStr(a.label, b.label));
      }
      if (groupBy === 'tag') {
        rows.forEach(r => {
          const ids = r.tag_ids || [];
          if (!ids.length) add('__none', r, () => ({ label: 'No tags', color: null, preset: {}, dragPatch: null, rank: 1 }));
          ids.forEach(id => add(id, r, () => { const t = (store.tagById && store.tagById[id]) || {}; return { label: t.name || 'Tag', color: t.color || '#87909e', solid: true, preset: { tag_ids: [id] }, dragPatch: null, rank: 0 }; }));
        });
        return Array.from(map.values()).sort((a, b) => a.rank - b.rank || cmpStr(a.label, b.label));
      }
      return [{ key: 'all', label: 'All tasks', rows: rows.slice(), preset: {}, dragPatch: null }];
    }

    // =========================================================================
    // Filters — base scope filter, filter-builder rows → server subset + client match
    // =========================================================================
    function baseFilterFor(scope) {
      const s = scope || { type: 'all' };
      if (s.type === 'my' || s.type === 'home') return { scope: 'my' };
      if (s.type === 'client' && s.clientId) return { client_ids: [s.clientId] };
      if (s.type === 'list' && s.listId) return { list_ids: [s.listId] };
      if (s.type === 'agency') return { agency_only: true };
      return {};
    }
    const FILTER_FIELDS = [
      { key: 'status', label: 'Status', ops: [['is', 'is'], ['is_not', 'is not']] },
      { key: 'assignee', label: 'Assignee', ops: [['is', 'is'], ['is_not', 'is not'], ['is_set', 'is set'], ['is_not_set', 'is not set']] },
      { key: 'priority', label: 'Priority', ops: [['is', 'is'], ['is_not', 'is not']] },
      { key: 'due', label: 'Due date', ops: [['overdue', 'is overdue'], ['today', 'is today'], ['this_week', 'is this week'], ['next_week', 'is next week'], ['no_date', 'has no date'], ['range', 'is between']] },
      { key: 'tags', label: 'Tags', ops: [['has_any', 'has any of'], ['has_none', 'has none of']] },
      { key: 'type', label: 'Task type', ops: [['is', 'is'], ['is_not', 'is not']] },
      { key: 'client', label: 'Client', ops: [['is', 'is'], ['is_not', 'is not']] },
      { key: 'list', label: 'List', ops: [['is', 'is'], ['is_not', 'is not']] },
      { key: 'created_by_me', label: 'Created by me', ops: [['is', 'yes']] },
    ];
    const FF = Object.fromEntries(FILTER_FIELDS.map(f => [f.key, f]));
    const needsValue = (fr) => !['is_set', 'is_not_set', 'overdue', 'today', 'this_week', 'next_week', 'no_date'].includes(fr.op) && fr.field !== 'created_by_me';
    const rowActive = (fr) => fr && fr.field && fr.op && (!needsValue(fr) || (fr.op === 'range' ? (fr.value && (fr.value.from || fr.value.to)) : (Array.isArray(fr.value) && fr.value.length)));
    const weekRange = (now, offset) => { const s = addDays(startOfWeek(now), 7 * offset); return [s, new Date(addDays(s, 7) - 1)]; };

    // compile positive filter rows into tasks_query keys (first row per field wins server-side)
    function compileServer(frows, now) {
      const out = {}; const seen = {};
      (frows || []).filter(rowActive).forEach(fr => {
        if (seen[fr.field]) return; seen[fr.field] = 1;
        const v = fr.value;
        switch (fr.field) {
          case 'status': if (fr.op === 'is') out.statuses = v; break;
          case 'assignee':
            if (fr.op === 'is') out.assignee_ids = v;
            if (fr.op === 'is_not_set') out.unassigned = true;
            break;
          case 'priority': if (fr.op === 'is') out.priorities = v.map(Number); break;
          case 'due':
            if (fr.op === 'overdue') out.overdue = true;
            else if (fr.op === 'no_date') out.no_due = true;
            else if (fr.op === 'today') { out.due_from = sod(now).toISOString(); out.due_to = new Date(+addDays(sod(now), 1) - 1).toISOString(); }
            else if (fr.op === 'this_week' || fr.op === 'next_week') { const [a, b] = weekRange(now, fr.op === 'next_week' ? 1 : 0); out.due_from = a.toISOString(); out.due_to = b.toISOString(); }
            else if (fr.op === 'range') { if (v.from) out.due_from = sod(v.from).toISOString(); if (v.to) out.due_to = new Date(+addDays(sod(v.to), 1) - 1).toISOString(); }
            break;
          case 'tags': if (fr.op === 'has_any') out.tag_ids = v; break;
          case 'type': if (fr.op === 'is') out.types = v; break;
          case 'client': if (fr.op === 'is') out.client_ids = v; break;
          case 'list': if (fr.op === 'is') out.list_ids = v; break;
          default: break;
        }
      });
      return out;
    }
    function matchRow(r, fr, meId, now) {
      if (!rowActive(fr)) return true;
      const v = fr.value;
      const inV = (x) => Array.isArray(v) && v.map(String).includes(String(x));
      switch (fr.field) {
        case 'status': return fr.op === 'is' ? inV(r.status) : !inV(r.status);
        case 'assignee': {
          const ids = (r.assignees || []).map(a => a.id);
          if (fr.op === 'is_set') return ids.length > 0;
          if (fr.op === 'is_not_set') return ids.length === 0;
          const hit = ids.some(inV);
          return fr.op === 'is' ? hit : !hit;
        }
        case 'priority': return fr.op === 'is' ? inV(r.priority || 0) : !inV(r.priority || 0);
        case 'due': {
          if (fr.op === 'overdue') return isOverdue(r);
          if (fr.op === 'no_date') return !r.due_at;
          if (!r.due_at) return false;
          const d = new Date(r.due_at);
          if (fr.op === 'today') return sameDay(d, now);
          if (fr.op === 'this_week' || fr.op === 'next_week') { const [a, b] = weekRange(now, fr.op === 'next_week' ? 1 : 0); return d >= a && d <= b; }
          if (fr.op === 'range') return (!v.from || d >= sod(v.from)) && (!v.to || d < addDays(sod(v.to), 1));
          return true;
        }
        case 'tags': { const hit = (r.tag_ids || []).some(inV); return fr.op === 'has_any' ? hit : !hit; }
        case 'type': return fr.op === 'is' ? inV(r.type) : !inV(r.type);
        case 'client': return fr.op === 'is' ? inV(r.client_id || '') : !inV(r.client_id || '');
        case 'list': return fr.op === 'is' ? inV(r.list_id) : !inV(r.list_id);
        case 'created_by_me': return r.created_by === meId;
        default: return true;
      }
    }
    // merge base (scope) + view filter: intersect arrays on shared keys, base wins otherwise
    function mergeFilters(base, extra) {
      const out = { ...extra, ...base };
      ['client_ids', 'list_ids', 'assignee_ids', 'statuses', 'types', 'tag_ids', 'priorities'].forEach(k => {
        if (base[k] && extra[k]) {
          const inter = base[k].filter(x => extra[k].map(String).includes(String(x)));
          out[k] = inter.length ? inter : base[k]; // empty intersection → client-side match yields nothing
        }
      });
      return out;
    }

    // =========================================================================
    // CSV — parse (RFC 4180-ish, delimiter sniffing) + serialise + download
    // =========================================================================
    function parseCsv(text) {
      let s = String(text || '');
      if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
      const head = s.slice(0, 4000).split(/\r?\n/, 1)[0] || '';
      const counts = { ',': 0, ';': 0, '\t': 0 };
      let inQ = false;
      for (const ch of head) { if (ch === '"') inQ = !inQ; else if (!inQ && counts[ch] !== undefined) counts[ch]++; }
      const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      const out = []; let row = [], field = '', q = false;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (q) {
          if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
          else field += c;
        } else if (c === '"' && field === '') q = true;
        else if (c === delim) { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
          if (c === '\r' && s[i + 1] === '\n') i++;
          row.push(field); field = ''; out.push(row); row = [];
        } else field += c;
      }
      if (field !== '' || row.length) { row.push(field); out.push(row); }
      return out.filter(r => r.some(v => String(v).trim() !== ''));
    }
    const csvCell = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // formula-injection guard
      return /[",;\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const toCsv = (rows) => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    function downloadText(name, text, mime) {
      try {
        const blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
        return true;
      } catch (e) { console.warn('[views] download failed', e); return false; }
    }
    const fileSafe = (s) => String(s || 'tasks').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'tasks';

    // parse a spreadsheet date cell → ISO (all-day = local 23:59). undefined = unparseable
    function parseDateCell(v) {
      const s = String(v == null ? '' : v).trim();
      if (!s) return null;
      let m, y, mo, d, hh = null, mi = null;
      if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/))) { y = +m[1]; mo = +m[2]; d = +m[3]; if (m[4] != null) { hh = +m[4]; mi = +m[5]; } }
      else if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?$/i))) {
        const a = +m[1], b = +m[2];
        if (PREF.dateFormat === 'MM/DD/YYYY') { if (b > 12 || a <= 12) { mo = a; d = b; } else { d = a; mo = b; } }
        else if (a > 12 || b <= 12) { d = a; mo = b; } else { mo = a; d = b; }
        y = +m[3]; if (y < 100) y += 2000;
        if (m[4] != null) { hh = +m[4]; mi = +m[5]; if (m[6]) { const pm = /pm/i.test(m[6]); if (hh === 12) hh = pm ? 12 : 0; else if (pm) hh += 12; } }
      } else {
        const t = Date.parse(s);
        if (isNaN(t)) return undefined;
        const x = new Date(t);
        return /\d{1,2}:\d{2}/.test(s) ? x.toISOString() : allDayIso(x);
      }
      if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return undefined;
      const x = new Date(y, mo - 1, d, hh == null ? 23 : hh, mi == null ? 59 : mi, 0, 0);
      return isNaN(x) ? undefined : x.toISOString();
    }

    // =========================================================================
    // Embed URL sanitiser — https only, no credentials / private hosts / self,
    // known providers rewritten to their embeddable URL, strict sandbox.
    // =========================================================================
    const SANDBOX_KNOWN = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation';
    const SANDBOX_ANY = 'allow-scripts allow-same-origin allow-forms allow-popups';
    const EMBED_PROVIDERS = [
      ['Google Docs', 'ti-file-text'], ['Google Sheets', 'ti-table'], ['Google Slides', 'ti-presentation'], ['Google Calendar', 'ti-calendar'],
      ['Google Maps', 'ti-map-pin'], ['YouTube', 'ti-brand-youtube'], ['Figma', 'ti-brand-figma'], ['Miro', 'ti-chalkboard'], ['Loom', 'ti-video'],
    ];
    function sanitizeEmbed(raw) {
      let s = String(raw || '').trim();
      const tag = s.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
      if (tag) s = tag[1].replace(/&amp;/g, '&');
      if (!s) return { ok: false, error: 'Paste a link to embed.' };
      if (!/^[a-z][a-z0-9+.\-]*:/i.test(s)) s = 'https://' + s;
      let u;
      try { u = new URL(s); } catch (_) { return { ok: false, error: 'That doesn’t look like a valid link.' }; }
      if (u.protocol !== 'https:') return { ok: false, error: 'Only secure https:// links can be embedded.' };
      if (u.username || u.password) return { ok: false, error: 'Links containing a username or password can’t be embedded.' };
      const host = u.hostname.toLowerCase().replace(/\.$/, '');
      if (host === String(location.hostname).toLowerCase()
        || /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/.test(host)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /\.(local|internal|localhost|lan)$/.test(host) || !host.includes('.')) {
        return { ok: false, error: 'This address can’t be embedded here.' };
      }
      const is = (d) => host === d || host.endsWith('.' + d);
      const path = u.pathname;
      const known = (label, icon, src, video) => ({ ok: true, src, original: u.toString(), host, provider: { label, icon },
        sandbox: SANDBOX_KNOWN, allow: video ? 'fullscreen; picture-in-picture; encrypted-media; clipboard-write' : 'fullscreen; clipboard-write', referrer: 'strict-origin-when-cross-origin' });
      if (is('youtube.com') || is('youtu.be') || is('youtube-nocookie.com')) {
        let id = u.searchParams.get('v');
        if (!id && is('youtu.be')) id = path.split('/')[1];
        if (!id) { const mm = path.match(/^\/(?:embed|shorts|live|v)\/([\w-]+)/); if (mm) id = mm[1]; }
        if (!id || !/^[\w-]{6,20}$/.test(id)) return { ok: false, error: 'Couldn’t find the video in that YouTube link.' };
        const t = parseInt(String(u.searchParams.get('t') || u.searchParams.get('start') || '').replace(/s$/, ''), 10);
        return known('YouTube', 'ti-brand-youtube', 'https://www.youtube-nocookie.com/embed/' + id + (t > 0 ? '?start=' + t : ''), true);
      }
      if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        const mm = path.match(/(\d{5,})/);
        if (!mm) return { ok: false, error: 'Couldn’t find the video in that Vimeo link.' };
        return known('Vimeo', 'ti-brand-vimeo', 'https://player.vimeo.com/video/' + mm[1], true);
      }
      if (host === 'docs.google.com') {
        let mm;
        if ((mm = path.match(/^\/document\/d\/([\w-]+)/))) return known('Google Docs', 'ti-file-text', 'https://docs.google.com/document/d/' + mm[1] + '/preview');
        if ((mm = path.match(/^\/spreadsheets\/d\/e\/([\w-]+)/))) return known('Google Sheets', 'ti-table', 'https://docs.google.com/spreadsheets/d/e/' + mm[1] + '/pubhtml?widget=true&headers=false');
        if ((mm = path.match(/^\/spreadsheets\/d\/([\w-]+)/))) return known('Google Sheets', 'ti-table', 'https://docs.google.com/spreadsheets/d/' + mm[1] + '/preview');
        if ((mm = path.match(/^\/presentation\/d\/e\/([\w-]+)/))) return known('Google Slides', 'ti-presentation', 'https://docs.google.com/presentation/d/e/' + mm[1] + '/embed');
        if ((mm = path.match(/^\/presentation\/d\/([\w-]+)/))) return known('Google Slides', 'ti-presentation', 'https://docs.google.com/presentation/d/' + mm[1] + '/embed');
        if ((mm = path.match(/^\/forms\/d\/(e\/)?([\w-]+)/))) return known('Google Forms', 'ti-forms', 'https://docs.google.com/forms/d/' + (mm[1] || '') + mm[2] + '/viewform?embedded=true');
        return known('Google Docs', 'ti-file-text', u.toString());
      }
      if (host === 'drive.google.com') {
        const mm = path.match(/^\/file\/d\/([\w-]+)/) || [null, u.searchParams.get('id')];
        if (mm[1]) return known('Google Drive', 'ti-brand-google-drive', 'https://drive.google.com/file/d/' + mm[1] + '/preview');
        return { ok: false, error: 'Open the file in Drive and paste its link (folders can’t be embedded).' };
      }
      if (host === 'calendar.google.com') {
        if (/^\/calendar\/(u\/\d+\/)?embed/.test(path)) return known('Google Calendar', 'ti-calendar', u.toString());
        return { ok: false, error: 'Use the “Embed code” link from Google Calendar → Settings → Integrate calendar.' };
      }
      if ((is('google.com') && /^\/maps/.test(path)) || host === 'maps.google.com') {
        if (/^\/maps\/embed/.test(path)) return known('Google Maps', 'ti-map-pin', u.toString());
        let q = u.searchParams.get('q');
        if (!q) { const place = path.match(/\/place\/([^/]+)/); if (place) q = decodeURIComponent(place[1].replace(/\+/g, ' ')); }
        if (!q) { const at = path.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/); if (at) q = at[1] + ',' + at[2]; }
        if (!q) return { ok: false, error: 'Couldn’t find a place in that Maps link.' };
        return known('Google Maps', 'ti-map-pin', 'https://maps.google.com/maps?output=embed&q=' + encodeURIComponent(q));
      }
      if (host === 'maps.app.goo.gl' || host === 'goo.gl') return { ok: false, error: 'Short Maps links can’t be embedded — open it and copy the full google.com/maps link.' };
      if (is('figma.com')) {
        if (/^\/embed/.test(path)) return known('Figma', 'ti-brand-figma', u.toString());
        if (/^\/(file|design|proto|board|slides|deck)\//.test(path)) return known('Figma', 'ti-brand-figma', 'https://www.figma.com/embed?embed_host=mydigitalsevak&url=' + encodeURIComponent(u.toString()));
      }
      if (is('miro.com')) {
        const mm = path.match(/^\/app\/(?:board|live-embed)\/([^/]+)/);
        if (mm) return known('Miro', 'ti-chalkboard', 'https://miro.com/app/live-embed/' + mm[1] + '/');
      }
      if (is('loom.com')) {
        const mm = path.match(/^\/(?:share|embed)\/([\w-]+)/);
        if (mm) return known('Loom', 'ti-video', 'https://www.loom.com/embed/' + mm[1], true);
      }
      return { ok: true, src: u.toString(), original: u.toString(), host, provider: { label: host, icon: 'ti-world' },
        sandbox: SANDBOX_ANY, allow: '', referrer: 'no-referrer', generic: true };
    }

    // =========================================================================
    // Row badges — built-in blocked/blocking + AMS_EXT.rowBadges
    // =========================================================================
    function RowBadges({ row, vc }) {
      const out = [];
      const deps = !vc || !vc.feat || vc.feat('dependencies');
      const bo = Number(row.blocked_by_open) || 0, bc = Number(row.blocking_count) || 0;
      if (deps && bo > 0) out.push(h`<span key="blocked" class="cv-badge crit" title=${'Blocked by ' + bo + ' open task' + (bo === 1 ? '' : 's')}><i class="ti ti-hand-stop"></i>Blocked</span>`);
      else if (deps && bc > 0 && !isDone(row)) out.push(h`<span key="blocking" class="cv-badge warn" title=${'Blocking ' + bc + ' task' + (bc === 1 ? '' : 's')}><i class="ti ti-alert-triangle"></i>${bc}</span>`);
      const ext = Array.isArray(EXT().rowBadges) ? EXT().rowBadges : [];
      ext.forEach((b, i) => {
        try {
          if (b && typeof b.when === 'function' && typeof b.render === 'function' && b.when(row)) {
            out.push(h`<span key=${'x:' + (b.id || i)} class="cv-xbadge">${b.render(row)}</span>`);
          }
        } catch (e) { console.warn('[views] rowBadge failed', b && b.id, e); }
      });
      return out.length ? h`<${Fragment}>${out}<//>` : null;
    }
    const locText = (row) => (row.client_name ? row.client_name : 'Agency') + (row.list_name ? ' › ' + row.list_name : '');

    // Error boundary for registry-provided view components
    class ExtBoundary extends React.Component {
      constructor(p) { super(p); this.state = { err: null }; }
      static getDerivedStateFromError(err) { return { err }; }
      componentDidCatch(e) { console.warn('[views] view component crashed', e); }
      render() {
        if (this.state.err) {
          return h`<div style=${{ padding: 32 }}><${EmptyState} icon="ti-alert-triangle" title="This view hit a problem" sub=${errMsg(this.state.err)}
            action=${h`<button type="button" class="cv-btn" onClick=${() => this.setState({ err: null })}>Try again</button>`}/></div>`;
        }
        return this.props.children;
      }
    }

    // =========================================================================
    // Small UI primitives
    // =========================================================================
    // anchor-state hook for Popover triggers
    function usePop() {
      const [anchor, setAnchor] = useState(null);
      return {
        anchor, open: !!anchor,
        toggle: (e) => { const el = e && e.currentTarget; setAnchor(a => a ? null : el); },
        openAt: (el) => setAnchor(el),
        close: () => setAnchor(null),
      };
    }
    function Pop({ pop, width, placement, children }) {
      if (!pop.open) return null;
      return h`<${Popover} anchor=${pop.anchor} open=${true} onClose=${pop.close} width=${width} placement=${placement || 'bottom-start'}>${children}<//>`;
    }
    function Switch({ on, onChange, label }) {
      return h`<button type="button" role="switch" aria-checked=${!!on} aria-label=${label} class=${'cv-switch' + (on ? ' on' : '')} onClick=${(e) => { e.stopPropagation(); onChange(!on); }}></button>`;
    }
    function Toggle({ label, sub, on, onChange, disabled }) {
      return h`<div class="cv-tog" onClick=${() => !disabled && onChange(!on)} style=${disabled ? { opacity: .5, pointerEvents: 'none' } : null}>
        <div>${label}${sub && h`<small>${sub}</small>`}</div>
        <${Switch} on=${on} onChange=${onChange} label=${label}/>
      </div>`;
    }
    // multi-select chooser: options [{ value, label, color, icon, avatar }]
    function MultiChooser({ options, value, onChange, placeholder, single }) {
      const pop = usePop();
      const [q, setQ] = useState('');
      const sel = (value || []).map(String);
      const shown = options.filter(o => !q || String(o.label).toLowerCase().includes(q.toLowerCase()));
      const summary = sel.length === 0 ? (placeholder || 'Select…')
        : sel.length === 1 ? ((options.find(o => String(o.value) === sel[0]) || {}).label || '1 selected')
        : sel.length + ' selected';
      const toggle = (v) => {
        const s = String(v);
        if (single) { onChange([v]); pop.close(); return; }
        onChange(sel.includes(s) ? (value || []).filter(x => String(x) !== s) : [...(value || []), v]);
      };
      return h`<${Fragment}>
        <button type="button" class="cv-sel" style=${{ textAlign: 'left', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', color: sel.length ? 'var(--cu-t1,#1f1f23)' : 'var(--cu-t3,#8e8e99)' }} onClick=${pop.toggle} aria-haspopup="listbox">${summary}</button>
        <${Pop} pop=${pop} width=${240}>
          <div class="cv-pop" role="listbox" aria-multiselectable=${!single}>
            ${options.length > 7 && h`<input class="cv-in" style=${{ width: '100%', marginBottom: 4 }} placeholder="Search…" value=${q} onChange=${e => setQ(e.target.value)} autoFocus/>`}
            <div style=${{ maxHeight: 260, overflowY: 'auto' }}>
              ${shown.length === 0 && h`<div class="cv-pop-h">No options</div>`}
              ${shown.map(o => h`<button type="button" key=${String(o.value)} class=${'cv-mi' + (sel.includes(String(o.value)) ? ' on' : '')} role="option" aria-selected=${sel.includes(String(o.value))} onClick=${() => toggle(o.value)}>
                ${o.avatar ? h`<${MemberAvatar} member=${o.avatar} size=${20}/>` : o.icon ? h`<i class=${'ti ' + o.icon} style=${o.color ? { color: o.color } : null}></i>` : o.color ? h`<span style=${{ width: 10, height: 10, borderRadius: 3, background: o.color, flexShrink: 0 }}></span>` : null}
                <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${o.label}</span>
                ${sel.includes(String(o.value)) && h`<i class="ti ti-check cv-ck"></i>`}
              </button>`)}
            </div>
          </div>
        <//>
      <//>`;
    }

    // =========================================================================
    // FilterBuilder — rows of [field][operator][value], AND logic
    // =========================================================================
    function filterOptions(field, store) {
      switch (field) {
        case 'status': {
          const seen = {}; const out = [];
          (store.statuses || []).forEach(s => { if (!seen[s.key]) { seen[s.key] = 1; out.push({ value: s.key, label: s.name, color: s.color }); } });
          return out;
        }
        case 'assignee': return (store.members || []).map(m => ({ value: m.id, label: m.name, avatar: m }));
        case 'priority': return [1, 2, 3, 4].map(p => ({ value: p, label: priMeta(p) ? priMeta(p).label : 'P' + p, icon: 'ti-flag-filled', color: priMeta(p) && priMeta(p).color })).concat([{ value: 0, label: 'No priority', icon: 'ti-flag' }]);
        case 'tags': return (store.tags || []).map(t => ({ value: t.id, label: t.name, color: t.color }));
        case 'type': return Object.keys(TYPE_META || {}).map(k => ({ value: k, label: TYPE_META[k].label, icon: TYPE_META[k].icon }));
        case 'client': return [{ value: '', label: 'Agency (no client)', icon: 'ti-building-community' }].concat((store.clients || []).map(c => ({ value: c.id, label: c.name, color: c.color })));
        case 'list': return (store.lists || []).filter(l => !l.archived).map(l => {
          const c = l.client_id && store.clientById ? store.clientById[l.client_id] : null;
          return { value: l.id, label: (c ? c.name : 'Agency') + ' › ' + l.name, icon: 'ti-list-details' };
        });
        default: return [];
      }
    }
    function FilterBuilder({ rows, onChange, store, onClose }) {
      const list = rows && rows.length ? rows : [];
      const set = (i, patch) => onChange(list.map((r, k) => k === i ? { ...r, ...patch } : r));
      const addRow = () => onChange([...list, { id: uid(), field: 'status', op: 'is', value: [] }]);
      return h`<div class="cv-pop" style=${{ padding: 8 }}>
        <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 6px 6px' }}>
          <b style=${{ fontSize: 13 }}>Filters</b>
          ${list.length > 0 && h`<button type="button" class="cv-btn ghost" onClick=${() => onChange([])}>Clear all</button>`}
        </div>
        ${list.length === 0 && h`<div style=${{ padding: '8px 6px 10px', color: 'var(--cu-t3,#8e8e99)', fontSize: 12.5 }}>No filters applied. Add one to narrow down tasks.</div>`}
        ${list.map((fr, i) => {
          const def = FF[fr.field] || FILTER_FIELDS[0];
          return h`<div class="cv-frow" key=${fr.id || i}>
            <select class="cv-sel" aria-label="Filter field" value=${fr.field} onChange=${e => { const f = FF[e.target.value]; set(i, { field: f.key, op: f.ops[0][0], value: f.key === 'due' ? {} : [] }); }}>
              ${FILTER_FIELDS.map(f => h`<option key=${f.key} value=${f.key}>${(i > 0 ? 'and ' : '') + f.label}</option>`)}
            </select>
            <select class="cv-sel" aria-label="Operator" value=${fr.op} onChange=${e => set(i, { op: e.target.value, value: fr.field === 'due' ? (fr.value && !Array.isArray(fr.value) ? fr.value : {}) : (Array.isArray(fr.value) ? fr.value : []) })}>
              ${def.ops.map(([k, l]) => h`<option key=${k} value=${k}>${l}</option>`)}
            </select>
            <div style=${{ minWidth: 0, display: 'flex', gap: 4 }}>
              ${!needsValue(fr) ? h`<span style=${{ color: 'var(--cu-t3,#8e8e99)', fontSize: 12 }}>—</span>`
              : fr.op === 'range' ? h`<${Fragment}>
                  <input type="date" class="cv-in" aria-label="From" style=${{ flex: 1, minWidth: 0 }} value=${(fr.value && fr.value.from) || ''} onChange=${e => set(i, { value: { ...(fr.value || {}), from: e.target.value } })}/>
                  <input type="date" class="cv-in" aria-label="To" style=${{ flex: 1, minWidth: 0 }} value=${(fr.value && fr.value.to) || ''} onChange=${e => set(i, { value: { ...(fr.value || {}), to: e.target.value } })}/>
                <//>`
              : h`<${MultiChooser} options=${filterOptions(fr.field, store)} value=${fr.value} onChange=${v => set(i, { value: v })}/>`}
            </div>
            <button type="button" class="cv-iconbtn" aria-label="Remove filter" onClick=${() => onChange(list.filter((_, k) => k !== i))}><i class="ti ti-x"></i></button>
          </div>`;
        })}
        <div style=${{ display: 'flex', justifyContent: 'space-between', padding: '6px 6px 2px' }}>
          <button type="button" class="cv-btn ghost" onClick=${addRow}><i class="ti ti-plus"></i> Add filter</button>
          ${onClose && h`<button type="button" class="cv-btn" onClick=${onClose}>Done</button>`}
        </div>
      </div>`;
    }

    // =========================================================================
    // QuickAddRow — inline "+ Add Task" (exported)
    // =========================================================================
    function QuickAddRow({ defaults, onCreated, onCancel, label, autoOpen, placeholder, style, showToast }) {
      const [open, setOpen] = useState(!!autoOpen);
      const [title, setTitle] = useState('');
      const [busy, setBusy] = useState(false);
      const inRef = useRef(null);
      useEffect(() => { if (open && inRef.current) inRef.current.focus(); }, [open]);
      const cancel = () => { setOpen(false); setTitle(''); if (onCancel) onCancel(); };
      const submit = async () => {
        const t = title.trim();
        if (!t || busy) return;
        setBusy(true);
        try {
          const row = await TaskAPI.create({ ...(defaults || {}), title: t });
          setTitle('');
          if (onCreated) onCreated(row);
        } catch (e) {
          if (showToast) showToast('Could not create task: ' + errMsg(e)); else console.warn('[views] create failed', e);
        }
        setBusy(false);
        if (inRef.current) inRef.current.focus();
      };
      if (!open) {
        return h`<div class="cv-addrow" style=${style}>
          <button type="button" class="cv-addbtn" onClick=${() => setOpen(true)}><i class="ti ti-plus"></i>${label || 'Add Task'}</button>
        </div>`;
      }
      return h`<div class="cv-addrow" style=${style}>
        <i class=${'ti ' + (busy ? 'ti-loader-2' : 'ti-circle-dashed')} style=${{ color: 'var(--cu-t3,#8e8e99)', fontSize: 16 }}></i>
        <input ref=${inRef} class="cv-qa" aria-label="Task name" placeholder=${placeholder || 'Task name — press Enter to save, Esc to cancel'}
          value=${title} onChange=${e => setTitle(e.target.value)}
          onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); } }}/>
        <button type="button" class="cv-pri" style=${{ height: 26, fontSize: 12 }} disabled=${busy || !title.trim()} onClick=${submit}>Save</button>
        <button type="button" class="cv-iconbtn" aria-label="Cancel" onClick=${cancel}><i class="ti ti-x"></i></button>
      </div>`;
    }

    // =========================================================================
    // Cell editors (shared by List + Table)
    // =========================================================================
    const parseMinutes = (s) => {
      const str = String(s || '').trim().toLowerCase();
      if (!str) return null;
      if (/^\d+(\.\d+)?$/.test(str)) return Math.round(parseFloat(str));
      let m = 0; let hit = false;
      const hm = str.match(/(\d+(?:\.\d+)?)\s*h/); if (hm) { m += parseFloat(hm[1]) * 60; hit = true; }
      const mm = str.match(/(\d+)\s*m/); if (mm) { m += parseInt(mm[1], 10); hit = true; }
      return hit ? Math.round(m) : null;
    };

    function StatusMenu({ row, vc, size }) {
      const pop = usePop();
      const statuses = (vc.store.statusesFor(row.list_id) || []);
      const cats = [['todo', 'Not started'], ['active', 'Active'], ['done', 'Closed']];
      return h`<${Fragment}>
        <button type="button" class="cv-iconbtn" style=${{ width: 20, height: 20 }} aria-label=${'Status: ' + (row.status_name || row.status)} title=${row.status_name || row.status} onClick=${(e) => { e.stopPropagation(); pop.toggle(e); }}>
          <${StatusIcon} category=${row.status_category} color=${row.status_color} size=${size || 15}/>
        </button>
        <${Pop} pop=${pop} width=${220}>
          <div class="cv-pop">
            ${cats.map(([c, l]) => {
              const ss = statuses.filter(s => s.category === c);
              if (!ss.length) return null;
              return h`<div key=${c}><div class="cv-pop-h">${l}</div>
                ${ss.map(s => h`<button type="button" key=${s.key} class=${'cv-mi' + (s.key === row.status ? ' on' : '')} onClick=${() => { pop.close(); if (s.key !== row.status) vc.update(row, { status: s.key }); }}>
                  <${StatusIcon} category=${s.category} color=${s.color} size=${14}/><span>${s.name}</span>
                  ${s.key === row.status && h`<i class="ti ti-check cv-ck"></i>`}
                </button>`)}</div>`;
            })}
            ${statuses.length === 0 && h`<div class="cv-pop-h">No statuses for this list</div>`}
          </div>
        <//>
      <//>`;
    }

    function DueCell({ row, vc, placeholder }) {
      // tasks.js DatePicker is its own trigger; onChange(iso|null, { hasTime })
      const onPick = (iso, meta) => {
        if (!iso) { vc.update(row, { due_at: null, due_has_time: false }); return; }
        const hasTime = !!(meta && meta.hasTime);
        vc.update(row, { due_at: hasTime ? iso : allDayIso(iso), due_has_time: hasTime });
      };
      return h`<${DatePicker} value=${row.due_at || null} onChange=${onPick} withTime=${true} hasTime=${row.due_has_time === true} label="Due date"
        done=${isDone(row)}
        anchorContent=${row.due_at ? h`<${DueChip} row=${row}/>` : h`<span class="cv-empty-cell">${placeholder == null ? h`<i class="ti ti-calendar"></i>` : placeholder}</span>`}/>`;
    }

    function EstimateCell({ row, vc }) {
      const [edit, setEdit] = useState(false);
      const [val, setVal] = useState('');
      const commit = () => {
        setEdit(false);
        const m = parseMinutes(val);
        if (m !== (row.estimate_minutes || null)) vc.update(row, { estimate_minutes: m });
      };
      if (edit) {
        return h`<input class="cv-in" style=${{ width: '100%' }} autoFocus aria-label="Time estimate" placeholder="e.g. 1h 30m" value=${val}
          onChange=${e => setVal(e.target.value)} onBlur=${commit}
          onKeyDown=${e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEdit(false); }}/>`;
      }
      return h`<button type="button" class="cv-cellbtn" aria-label="Time estimate" onClick=${(e) => { e.stopPropagation(); setVal(row.estimate_minutes ? fmtMinutes(row.estimate_minutes) : ''); setEdit(true); }}>
        ${row.estimate_minutes ? fmtMinutes(row.estimate_minutes) : h`<span class="cv-empty-cell"><i class="ti ti-hourglass"></i></span>`}
      </button>`;
    }

    function FieldCell({ row, field, vc }) {
      const v = (row.custom_fields || {})[field.id];
      const [edit, setEdit] = useState(false);
      const [val, setVal] = useState('');
      const pop = usePop();
      const save = (nv) => vc.update(row, { custom_fields: { ...(row.custom_fields || {}), [field.id]: nv } });
      const opts = Array.isArray(field.options) ? field.options : [];
      const t = field.type;
      if (t === 'checkbox') {
        return h`<input type="checkbox" class="cv-cbx" style=${{ opacity: 1 }} aria-label=${field.name} checked=${!!v} onChange=${e => save(e.target.checked)}/>`;
      }
      if (t === 'rating') {
        const n = Number(v) || 0;
        return h`<span style=${{ display: 'inline-flex' }}>${[1, 2, 3, 4, 5].map(i => h`<button type="button" key=${i} class="cv-iconbtn" style=${{ width: 18, height: 18, color: i <= n ? '#f5a623' : 'var(--cu-t3,#8e8e99)' }} aria-label=${'Rate ' + i} onClick=${() => save(i === n ? 0 : i)}><i class=${'ti ' + (i <= n ? 'ti-star-filled' : 'ti-star')} style=${{ fontSize: 13 }}></i></button>`)}</span>`;
      }
      if (t === 'dropdown' || t === 'labels') {
        const ids = t === 'labels' ? (Array.isArray(v) ? v : []) : (v ? [v] : []);
        return h`<div style=${{ width: '100%' }}><${MultiChooser} single=${t === 'dropdown'} placeholder="—"
          options=${opts.map(o => ({ value: o.id, label: o.label, color: o.color }))} value=${ids}
          onChange=${nv => save(t === 'dropdown' ? (nv[nv.length - 1] || null) : nv)}/></div>`;
      }
      if (t === 'date') {
        return h`<${DatePicker} value=${v || null} onChange=${(iso) => save(iso)} label=${field.name} endOfDay=${false}
          anchorContent=${v ? h`<span>${fmtShort(v)}</span>` : h`<span class="cv-empty-cell">—</span>`}/>`;
      }
      const numeric = t === 'number' || t === 'money';
      if (edit) {
        const commit = () => { setEdit(false); const nv = numeric ? (val === '' ? null : Number(val)) : (val || null); if (nv !== (v == null ? null : v)) save(nv); };
        return h`<input class="cv-in" style=${{ width: '100%' }} autoFocus aria-label=${field.name} type=${numeric ? 'number' : 'text'} value=${val}
          onChange=${e => setVal(e.target.value)} onBlur=${commit} onKeyDown=${e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEdit(false); }}/>`;
      }
      const shown = v == null || v === '' ? null
        : t === 'money' ? '₹' + Number(v).toLocaleString('en-IN') : String(v);
      return h`<span style=${{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, width: '100%' }}>
        <button type="button" class="cv-cellbtn" style=${{ flex: 1, justifyContent: 'flex-start' }} aria-label=${field.name} onClick=${(e) => { e.stopPropagation(); setVal(v == null ? '' : String(v)); setEdit(true); }}>
          ${shown == null ? h`<span class="cv-empty-cell">—</span>` : shown}
        </button>
        ${t === 'url' && v && h`<a href=${/^https?:/.test(v) ? v : 'https://' + v} target="_blank" rel="noopener" class="cv-iconbtn" aria-label="Open link"><i class="ti ti-external-link"></i></a>`}
      </span>`;
    }

    function Cell({ col, row, vc }) {
      if (col.startsWith('cf:')) {
        const f = vc.fieldById[col.slice(3)];
        return f ? h`<${FieldCell} row=${row} field=${f} vc=${vc}/>` : null;
      }
      switch (col) {
        case 'assignee': {
          const ids = (row.assignees || []).map(a => a.id);
          return h`<${AssigneePicker} value=${ids} multi=${true} onChange=${(nids) => vc.setAssignees(row, nids)}
            anchorContent=${ids.length ? h`<${AssigneeStack} assignees=${row.assignees} max=${3} size=${22}/>` : h`<span class="cv-empty-cell" aria-label="Add assignee"><i class="ti ti-user-plus" style=${{ fontSize: 16 }}></i></span>`}/>`;
        }
        case 'due': return h`<${DueCell} row=${row} vc=${vc}/>`;
        case 'priority': return h`<${PriorityPicker} value=${row.priority || null} onChange=${(p) => vc.update(row, { priority: p || null })}/>`;
        case 'status': return h`<${StatusPicker} row=${row} onChange=${(k) => k !== row.status && vc.update(row, { status: k })}/>`;
        case 'comments': return h`<button type="button" class="cv-meta" aria-label=${(row.comment_count || 0) + ' comments'} onClick=${() => openTask(row.id)}><i class="ti ti-message"></i>${row.comment_count || 0}</button>`;
        case 'client': return row.client_id ? h`<${ClientBadge} clientId=${row.client_id}/>` : h`<span class="cv-empty-cell">Agency</span>`;
        case 'list': return h`<span class="cv-loc" title=${row.list_name}>${row.list_name || '—'}</span>`;
        case 'type': { const m = typeMeta(row.type); return h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--cu-t2,#5c5c66)', fontSize: 12.5, whiteSpace: 'nowrap' }}><${TypeIcon} type=${row.type}/>${m.label}</span>`; }
        case 'created': return h`<span style=${{ color: 'var(--cu-t2,#5c5c66)', fontSize: 12.5 }}>${fmtShort(row.created_at)}</span>`;
        case 'updated': return h`<span style=${{ color: 'var(--cu-t2,#5c5c66)', fontSize: 12.5 }}>${fmtShort(row.updated_at)}</span>`;
        case 'estimate': return h`<${EstimateCell} row=${row} vc=${vc}/>`;
        case 'time': return h`<span style=${{ color: 'var(--cu-t2,#5c5c66)', fontSize: 12.5 }}>${row.time_spent_minutes ? fmtMinutes(row.time_spent_minutes) : '—'}</span>`;
        case 'start': return h`<${DatePicker} value=${row.start_at || null} label="Start date" endOfDay=${false}
          onChange=${(iso) => vc.update(row, { start_at: iso || null })}
          anchorContent=${row.start_at ? h`<span style=${{ color: 'var(--cu-t2,#5c5c66)', fontSize: 12.5 }}>${fmtShort(row.start_at)}</span>` : h`<span class="cv-empty-cell"><i class="ti ti-calendar-plus"></i></span>`}/>`;
        case 'estimate_rollup': case 'time_rollup': {
          const own = col === 'estimate_rollup' ? row.estimate_minutes : row.time_spent_minutes;
          const roll = col === 'estimate_rollup' ? row.estimate_rollup_minutes : row.time_rollup_minutes;
          const v = roll != null ? roll : own;
          const extra = roll != null && (roll || 0) > (own || 0);
          return h`<span style=${{ color: 'var(--cu-t2,#5c5c66)', fontSize: 12.5, whiteSpace: 'nowrap' }} title=${extra ? 'Own ' + (own ? fmtMinutes(own) : '0m') + ' + subtasks' : ''}>
            ${v ? fmtMinutes(v) : '—'}${extra ? h`<i class="ti ti-subtask" style=${{ fontSize: 11, marginLeft: 3, color: 'var(--cu-t3,#8e8e99)' }}></i>` : null}</span>`;
        }
        default: return null;
      }
    }

    // =========================================================================
    // Bulk action bar
    // =========================================================================
    function BulkFieldEditor({ fields, busy, onApply }) {
      const [fid, setFid] = useState(fields[0] ? fields[0].id : '');
      const f = fields.find(x => x.id === fid) || fields[0];
      const [val, setVal] = useState('');
      const [multi, setMulti] = useState([]);
      useEffect(() => { setVal(''); setMulti([]); }, [fid]);
      if (!f) return h`<div class="cv-pop"><div class="cv-pop-h">No custom fields here</div></div>`;
      const opts = Array.isArray(f.options) ? f.options : [];
      const t = f.type;
      const normalized = () => {
        if (t === 'labels') return multi.length ? multi : null;
        if (t === 'dropdown') return multi[0] || null;
        if (t === 'checkbox') return val === 'yes' ? true : val === 'no' ? false : null;
        if (t === 'rating') return val === '' ? null : Number(val);
        if (t === 'number' || t === 'money') return val === '' || isNaN(Number(val)) ? null : Number(val);
        if (t === 'date') return val ? new Date(val + 'T00:00:00').toISOString() : null;
        return String(val).trim() || null;
      };
      const ready = t === 'labels' || t === 'dropdown' ? multi.length > 0 : val !== '';
      let editor;
      if (t === 'dropdown' || t === 'labels') {
        editor = h`<${MultiChooser} single=${t === 'dropdown'} placeholder="Choose…" options=${opts.map(o => ({ value: o.id, label: o.label, color: o.color }))} value=${multi} onChange=${setMulti}/>`;
      } else if (t === 'checkbox') {
        editor = h`<select class="cv-sel" style=${{ width: '100%' }} aria-label=${f.name} value=${val} onChange=${e => setVal(e.target.value)}>
          <option value="">Choose…</option><option value="yes">Checked</option><option value="no">Unchecked</option></select>`;
      } else if (t === 'rating') {
        editor = h`<select class="cv-sel" style=${{ width: '100%' }} aria-label=${f.name} value=${val} onChange=${e => setVal(e.target.value)}>
          <option value="">Choose…</option>${[1, 2, 3, 4, 5].map(n => h`<option key=${n} value=${String(n)}>${'★'.repeat(n)}</option>`)}</select>`;
      } else {
        const type = t === 'number' || t === 'money' ? 'number' : t === 'date' ? 'date' : t === 'email' ? 'email' : t === 'url' ? 'url' : t === 'phone' ? 'tel' : 'text';
        editor = h`<input class="cv-in" style=${{ width: '100%' }} type=${type} aria-label=${f.name} value=${val} onChange=${e => setVal(e.target.value)}
          onKeyDown=${e => { if (e.key === 'Enter' && ready && !busy) onApply(f, normalized()); }}/>`;
      }
      return h`<div class="cv-pop" style=${{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div class="cv-pop-h" style=${{ padding: '2px 0' }}>Set a custom field on the selected tasks</div>
        <select class="cv-sel" aria-label="Field" value=${f.id} onChange=${e => setFid(e.target.value)}>
          ${fields.map(x => h`<option key=${x.id} value=${x.id}>${x.name}</option>`)}
        </select>
        ${editor}
        <div style=${{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button type="button" class="cv-btn" disabled=${busy} onClick=${() => onApply(f, null)}>Clear value</button>
          <button type="button" class="cv-pri" style=${{ height: 28 }} disabled=${busy || !ready} onClick=${() => onApply(f, normalized())}>Apply</button>
        </div>
      </div>`;
    }

    function BulkBar({ ids, vc, onClear }) {
      const [busy, setBusy] = useState(false);
      const stPop = usePop(), asPop = usePop(), prPop = usePop(), mvPop = usePop(), fdPop = usePop();
      const bulkFields = vc.feat('custom_fields') ? (vc.availableFields || []) : [];
      const [mq, setMq] = useState('');
      const selRows = vc.rows.filter(r => ids.includes(r.id));
      const first = selRows[0] || {};
      const sameList = selRows.every(r => r.list_id === first.list_id);
      const statuses = vc.store.statusesFor(first.list_id) || [];
      const bulk = async (patch, label) => {
        setBusy(true);
        try {
          const res = await TaskAPI.bulkUpdate(ids, patch);
          const failed = (res && res.failed && res.failed.length) || 0;
          vc.toast(failed ? `${label}: ${res.updated || 0} updated, ${failed} failed` : `${label}: ${(res && res.updated) || ids.length} task${ids.length === 1 ? '' : 's'}`);
          if (patch.delete) onClear();
        } catch (e) { vc.toast(errMsg(e)); }
        setBusy(false);
        vc.reload();
      };
      const lists = (vc.store.lists || []).filter(l => !l.archived && (!mq || l.name.toLowerCase().includes(mq.toLowerCase())));
      return h`<div class="cv-bulk" role="toolbar" aria-label="Bulk actions">
        <span class="cv-n">${ids.length} selected</span>
        <button type="button" class="cv-bb" disabled=${busy} onClick=${stPop.toggle}><i class="ti ti-progress"></i>Status</button>
        <${Pop} pop=${stPop} width=${220} placement="top-start">
          <div class="cv-pop">
            ${!sameList && h`<div class="cv-pop-h">Tasks span lists — showing ${first.list_name || 'first list'} statuses</div>`}
            ${statuses.map(s => h`<button type="button" key=${s.key} class="cv-mi" onClick=${() => { stPop.close(); bulk({ status: s.key }, 'Status set'); }}><${StatusIcon} category=${s.category} color=${s.color} size=${14}/>${s.name}</button>`)}
          </div>
        <//>
        <button type="button" class="cv-bb" disabled=${busy} onClick=${asPop.toggle}><i class="ti ti-user"></i>Assignees</button>
        <${Pop} pop=${asPop} width=${260} placement="top-start">
          <div class="cv-pop" style=${{ maxHeight: 320, overflowY: 'auto' }}>
            <div class="cv-pop-h">Add or remove</div>
            ${(vc.store.members || []).map(m => h`<div key=${m.id} class="cv-mi" style=${{ cursor: 'default' }}>
              <${MemberAvatar} member=${m} size=${20}/><span style=${{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>${m.name}</span>
              <button type="button" class="cv-iconbtn" aria-label=${'Add ' + m.name} onClick=${() => bulk({ assignee_ids_add: [m.id] }, 'Assigned ' + m.name)}><i class="ti ti-plus"></i></button>
              <button type="button" class="cv-iconbtn" aria-label=${'Remove ' + m.name} onClick=${() => bulk({ assignee_ids_remove: [m.id] }, 'Unassigned ' + m.name)}><i class="ti ti-minus"></i></button>
            </div>`)}
          </div>
        <//>
        <button type="button" class="cv-bb" disabled=${busy} onClick=${prPop.toggle}><i class="ti ti-flag"></i>Priority</button>
        <${Pop} pop=${prPop} width=${180} placement="top-start">
          <div class="cv-pop">
            ${[1, 2, 3, 4].map(p => h`<button type="button" key=${p} class="cv-mi" onClick=${() => { prPop.close(); bulk({ priority: p }, 'Priority set'); }}><${PriorityFlag} value=${p} showLabel=${true}/></button>`)}
            <button type="button" class="cv-mi" onClick=${() => { prPop.close(); bulk({ priority: null }, 'Priority cleared'); }}><${PriorityFlag} value=${null} showLabel=${true}/></button>
          </div>
        <//>
        ${bulkFields.length > 0 && h`<${Fragment}>
          <button type="button" class="cv-bb" disabled=${busy} onClick=${fdPop.toggle}><i class="ti ti-forms"></i><span class="cv-hide-sm">Fields</span></button>
          <${Pop} pop=${fdPop} width=${280} placement="top-start">
            <${BulkFieldEditor} fields=${bulkFields} busy=${busy}
              onApply=${(f, v) => { fdPop.close(); bulk({ custom_fields: { [f.id]: v } }, v == null ? f.name + ' cleared' : f.name + ' set'); }}/>
          <//>
        <//>`}
        <span class="cv-slot">
          <${DatePicker} value=${null} label="Due date" disabled=${busy}
            anchorContent=${h`<span class="cv-bb" style=${{ pointerEvents: 'none' }}><i class="ti ti-calendar"></i>Due date</span>`}
            onChange=${(iso) => bulk({ due_at: iso ? allDayIso(iso) : null },iso ? 'Due date set' : 'Due date cleared')}/>
        </span>
        <button type="button" class="cv-bb cv-hide-sm" disabled=${busy} onClick=${mvPop.toggle}><i class="ti ti-arrow-move-right"></i>Move</button>
        <${Pop} pop=${mvPop} width=${280} placement="top-start">
          <div class="cv-pop">
            <input class="cv-in" style=${{ width: '100%', marginBottom: 4 }} placeholder="Search lists…" value=${mq} onChange=${e => setMq(e.target.value)} autoFocus/>
            <div style=${{ maxHeight: 280, overflowY: 'auto' }}>
              ${lists.map(l => { const c = l.client_id && vc.store.clientById ? vc.store.clientById[l.client_id] : null; return h`<button type="button" key=${l.id} class="cv-mi" onClick=${() => { mvPop.close(); bulk({ list_id: l.id }, 'Moved to ' + l.name); }}>
                <i class="ti ti-list-details"></i><span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${(c ? c.name : 'Agency') + ' › ' + l.name}</span></button>`; })}
            </div>
          </div>
        <//>
        <button type="button" class="cv-bb danger" disabled=${busy} onClick=${() => { if (window.confirm(`Delete ${ids.length} task${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) bulk({ delete: true }, 'Deleted'); }}><i class="ti ti-trash"></i><span class="cv-hide-sm">Delete</span></button>
        <button type="button" class="cv-bb" aria-label="Clear selection" onClick=${onClear}><i class="ti ti-x"></i></button>
      </div>`;
    }

    // =========================================================================
    // LIST mode
    // =========================================================================
    const GROUP_CAP = 200;
    const gridTpl = (cols, vc) => '28px minmax(300px,1fr) ' + cols.map(c => ((vc.cfg.col_widths || {})[c] || (colMeta(c, vc.fieldById) || { w: 120 }).w) + 'px').join(' ') + ' 12px';

    function SubtaskRows({ parent, vc, depth, cols, tpl }) {
      const [rows, setRows] = useState(null);
      const load = useCallback(async () => {
        try {
          const res = await TaskAPI.query({ parent_id: parent.id, top_level: false, include_closed: true, order: 'position', limit: 500 });
          setRows((res && res.rows) || []);
        } catch (e) { setRows([]); vc.toast(errMsg(e)); }
      }, [parent.id]);
      useEffect(() => { load(); }, [load, parent.subtask_count, parent.subtask_done_count]);
      useEffect(() => {
        if (!taskBus || !taskBus.on) return;
        const offs = [
          taskBus.on('task:changed', (p) => { if (p && p.row && p.row.parent_id === parent.id) setRows(rs => (rs || []).map(r => r.id === p.row.id ? { ...r, ...p.row } : r)); else if (p && rows && rows.some(r => r.id === p.id)) load(); }),
          taskBus.on('task:created', (p) => { if (p && p.row && p.row.parent_id === parent.id) load(); }),
          taskBus.on('task:deleted', (p) => { if (p) setRows(rs => rs ? rs.filter(r => r.id !== p.id) : rs); }),
        ];
        return () => offs.forEach(off => typeof off === 'function' && off());
      }, [parent.id, load, rows]);
      if (rows === null) return h`<div class="cv-row" style=${{ gridTemplateColumns: tpl }}><div></div><div class="cv-cell" style=${{ paddingLeft: 28 + depth * 22 }}><span class="cv-loc">Loading subtasks…</span></div></div>`;
      const subVc = { ...vc, update: async (row, patch) => { setRows(rs => rs.map(r => r.id === row.id ? vc.optimistic(r, patch) : r)); await vc.update(row, patch); } };
      return h`<${Fragment}>
        ${rows.map(r => h`<${TaskRowItem} key=${r.id} row=${r} vc=${subVc} depth=${depth} cols=${cols} tpl=${tpl}/>`)}
        <${QuickAddRow} label="Add subtask" showToast=${vc.toast} style=${{ paddingLeft: 36 + depth * 22 }}
          defaults=${{ parent_id: parent.id, list_id: parent.list_id, client_id: parent.client_id || undefined }} onCreated=${() => load()}/>
      <//>`;
    }

    function TaskRowItem({ row, vc, depth = 0, cols, tpl }) {
      const [renaming, setRenaming] = useState(false);
      const [draft, setDraft] = useState(row.title);
      const [open, setOpen] = useState(false);
      const clickT = useRef(null);
      useEffect(() => () => clearTimeout(clickT.current), []);
      const selected = vc.selected.has(row.id);
      const nested = vc.childrenOf && vc.childrenOf[row.id];
      const expanded = vc.cfg.show_subtasks === 'expanded' ? !vc.collapsedSubs.has(row.id) : open;
      const hasSubs = (row.subtask_count || 0) > 0 || (nested && nested.length > 0);
      const toggleSubs = () => {
        if (vc.cfg.show_subtasks === 'expanded') vc.toggleCollapsedSub(row.id); else setOpen(o => !o);
      };
      const saveTitle = () => {
        setRenaming(false);
        const t = draft.trim();
        if (t && t !== row.title) vc.update(row, { title: t });
      };
      const onTitleClick = () => { clearTimeout(clickT.current); clickT.current = setTimeout(() => openTask(row.id), 230); };
      const onTitleDbl = () => { clearTimeout(clickT.current); setDraft(row.title); setRenaming(true); };
      const showClient = !vc.singleClient && row.client_id;
      return h`<${Fragment}>
        <div class=${'cv-row' + (selected ? ' sel' : '') + (vc.cursorId === row.id ? ' kb' : '')} data-row-id=${row.id} style=${{ gridTemplateColumns: tpl }} role="row" aria-selected=${selected}>
          <div class="cv-cell" style=${{ justifyContent: 'center', padding: 0 }}>
            <input type="checkbox" class="cv-cbx" aria-label=${'Select ' + row.title} checked=${selected} onChange=${() => vc.toggleSel(row.id)}/>
          </div>
          <div class=${'cv-cell cv-name' + (vc.cfg.show_locations ? ' loc' : '')} style=${{ paddingLeft: 4 + depth * 22 }}>
            ${hasSubs
              ? h`<button type="button" class=${'cv-caret' + (expanded ? '' : ' shut')} style=${{ width: 18, height: 18 }} aria-label=${expanded ? 'Collapse subtasks' : 'Expand subtasks'} aria-expanded=${expanded} onClick=${toggleSubs}><i class="ti ti-chevron-down" style=${{ fontSize: 13 }}></i></button>`
              : h`<span style=${{ width: 18, flexShrink: 0 }}></span>`}
            <${StatusMenu} row=${row} vc=${vc}/>
            ${row.type && row.type !== 'task' && h`<span title=${typeMeta(row.type).label} style=${{ display: 'inline-flex', color: 'var(--cu-t3,#8e8e99)' }}><${TypeIcon} type=${row.type}/></span>`}
            ${renaming
              ? h`<input class="cv-rename" autoFocus aria-label="Rename task" value=${draft} onChange=${e => setDraft(e.target.value)} onBlur=${saveTitle}
                  onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); saveTitle(); } if (e.key === 'Escape') { setRenaming(false); setDraft(row.title); } }}/>`
              : h`<button type="button" class="cv-title" title=${row.title} onClick=${onTitleClick} onDoubleClick=${onTitleDbl}
                  onKeyDown=${e => { if (e.key === 'F2') { e.preventDefault(); onTitleDbl(); } }}
                  style=${isDone(row) ? { color: 'var(--cu-t3,#8e8e99)' } : null}>${row.title || 'Untitled'}</button>`}
            ${(row.subtask_count || 0) > 0 && h`<button type="button" class="cv-meta" aria-label=${row.subtask_count + ' subtasks'} onClick=${toggleSubs}><i class="ti ti-subtask"></i>${row.subtask_count}</button>`}
            ${(row.checklist_total || 0) > 0 && h`<span class="cv-meta" title="Checklist" style=${row.checklist_done === row.checklist_total ? { color: 'var(--cv-ok)' } : null}><i class="ti ti-checkbox"></i>${row.checklist_done || 0}/${row.checklist_total}</span>`}
            ${(row.tag_ids || []).length > 0 && h`<span style=${{ display: 'inline-flex', minWidth: 0, overflow: 'hidden' }}><${TagChips} ids=${row.tag_ids}/></span>`}
            <${RowBadges} row=${row} vc=${vc}/>
            ${showClient && !vc.cfg.show_locations && h`<span style=${{ display: 'inline-flex', flexShrink: 0 }}><${ClientBadge} clientId=${row.client_id}/></span>`}
            ${vc.cfg.show_locations && h`<span class="cv-locline" title=${locText(row)}><i class="ti ti-folder" style=${{ fontSize: 11, marginRight: 3 }}></i>${locText(row)}</span>`}
          </div>
          ${cols.map(c => h`<div key=${c} class="cv-cell" role="gridcell"><${Cell} col=${c} row=${row} vc=${vc}/></div>`)}
          <div></div>
        </div>
        ${expanded && (nested
          ? nested.map(r => h`<${TaskRowItem} key=${r.id} row=${r} vc=${vc} depth=${depth + 1} cols=${cols} tpl=${tpl}/>`)
          : hasSubs && h`<${SubtaskRows} parent=${row} vc=${vc} depth=${depth + 1} cols=${cols} tpl=${tpl}/>`)}
      <//>`;
    }

    function ListGroupBlock({ g, vc, cols, tpl, collapsed, onToggle, groupBy }) {
      const [cap, setCap] = useState(GROUP_CAP);
      const [adding, setAdding] = useState(false);
      const menu = usePop();
      const shown = g.rows.slice(0, cap);
      const allSel = g.rows.length > 0 && g.rows.every(r => vc.selected.has(r.id));
      const sortBy = (key) => {
        const s = vc.cfg.sort;
        vc.setCfg({ sort: s && s.field === key ? (s.dir === 'asc' ? { field: key, dir: 'desc' } : null) : { field: key, dir: 'asc' } });
      };
      const sortIcon = (key) => vc.cfg.sort && vc.cfg.sort.field === key ? h`<i class=${'ti ' + (vc.cfg.sort.dir === 'desc' ? 'ti-arrow-down' : 'ti-arrow-up')} style=${{ fontSize: 11, marginLeft: 3 }}></i>` : null;
      const pill = g.avatar
        ? h`<span class="cv-gpill plain"><${MemberAvatar} member=${g.avatar} size=${16}/>${g.label}</span>`
        : g.solid && g.color ? h`<span class="cv-gpill" style=${{ background: g.color }}>${g.icon && h`<i class=${'ti ' + g.icon}></i>`}${g.label}</span>`
        : h`<span class="cv-gpill plain">${g.icon && h`<i class=${'ti ' + g.icon}></i>`}${g.label}</span>`;
      return h`<section class="cv-group" aria-label=${g.label}>
        ${groupBy !== 'none' && h`<div class="cv-ghd">
          <button type="button" class=${'cv-caret' + (collapsed ? ' shut' : '')} aria-expanded=${!collapsed} aria-label=${(collapsed ? 'Expand ' : 'Collapse ') + g.label} onClick=${onToggle}><i class="ti ti-chevron-down"></i></button>
          ${pill}
          <span class="cv-gcount">${g.rows.length}</span>
          <button type="button" class="cv-iconbtn" aria-label="Group options" onClick=${menu.toggle}><i class="ti ti-dots"></i></button>
          <${Pop} pop=${menu} width=${210}>
            <${Menu} items=${[
              { key: 'add', label: 'Add task', icon: 'ti-plus', onSelect: () => { menu.close(); if (collapsed) onToggle(); setAdding(true); } },
              { key: 'sel', label: allSel ? 'Deselect all' : 'Select all', icon: 'ti-checks', onSelect: () => { menu.close(); vc.selectMany(g.rows.map(r => r.id), !allSel); } },
              { key: 'div', divider: true },
              { key: 'collapse', label: 'Collapse all groups', icon: 'ti-fold', onSelect: () => { menu.close(); vc.collapseAll(true); } },
              { key: 'expand', label: 'Expand all groups', icon: 'ti-fold-down', onSelect: () => { menu.close(); vc.collapseAll(false); } },
            ]}/>
          <//>
        </div>`}
        ${!collapsed && h`<${Fragment}>
          <div class="cv-colhd" style=${{ gridTemplateColumns: tpl }} role="row">
            <div style=${{ display: 'flex', justifyContent: 'center', padding: 0 }}>
              ${g.rows.length > 0 && h`<input type="checkbox" class="cv-cbx" style=${allSel ? { opacity: 1 } : null} aria-label="Select all in group" checked=${allSel} onChange=${() => vc.selectMany(g.rows.map(r => r.id), !allSel)}/>`}
            </div>
            <div role="columnheader" style=${{ cursor: 'pointer' }} onClick=${() => sortBy('title')}>Name${sortIcon('title')}</div>
            ${cols.map(c => { const m = colMeta(c, vc.fieldById); return h`<div key=${c} role="columnheader" style=${{ cursor: 'pointer' }} onClick=${() => sortBy(m ? m.sort : c)}>${m ? m.label : c}${sortIcon(m ? m.sort : c)}</div>`; })}
            <div></div>
          </div>
          ${shown.map(r => h`<${TaskRowItem} key=${g.key + ':' + r.id} row=${r} vc=${vc} cols=${cols} tpl=${tpl}/>`)}
          ${g.rows.length > cap && h`<div class="cv-more"><button type="button" class="cv-btn" onClick=${() => setCap(c => c + GROUP_CAP)}>Show more (${g.rows.length - cap} hidden)</button></div>`}
          <${QuickAddRow} key=${adding ? 'open' : 'closed'} autoOpen=${adding} showToast=${vc.toast}
            defaults=${vc.presetFor(g)} onCancel=${() => setAdding(false)} onCreated=${(row) => vc.onCreated(row)}/>
        <//>`}
      </section>`;
    }

    function NewStatusRow({ listId, vc }) {
      const [open, setOpen] = useState(false);
      const [name, setName] = useState('');
      const save = async () => {
        const n = name.trim(); if (!n) { setOpen(false); return; }
        const existing = vc.store.statusesFor(listId) || [];
        try {
          await TaskAPI.statusUpsert({ list_id: listId, name: n, color: '#87909e', category: 'active', position: existing.length + 1 });
          vc.toast('Status added'); setName(''); setOpen(false);
        } catch (e) { vc.toast(e && e.code === 'forbidden' ? 'Only admins and managers can add statuses' : errMsg(e)); }
      };
      return h`<div class="cv-ghd" style=${{ marginTop: 14 }}>
        ${open
          ? h`<input class="cv-qa" style=${{ maxWidth: 260 }} autoFocus aria-label="New status name" placeholder="Status name" value=${name}
              onChange=${e => setName(e.target.value)} onBlur=${save} onKeyDown=${e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false); }}/>`
          : h`<button type="button" class="cv-addbtn" onClick=${() => setOpen(true)}><i class="ti ti-plus"></i>New status</button>`}
      </div>`;
    }

    function ListMode({ vc, groups }) {
      const [collapsed, setCollapsed] = useState(() => new Set());
      const cols = vc.columns;
      const tpl = gridTpl(cols, vc);
      const listVc = useMemo(() => ({
        ...vc,
        collapseAll: (on) => setCollapsed(on ? new Set(groups.map(g => g.key)) : new Set()),
      }), [vc, groups]);
      const scopeList = vc.scope.type === 'list' && vc.store.listById ? vc.store.listById[vc.scope.listId] : null;
      const total = groups.reduce((a, g) => a + g.rows.length, 0);
      if (total === 0 && !vc.cfg.show_empty) {
        return h`<div style=${{ padding: 32 }}>
          <${EmptyState} icon="ti-list-check" title="No tasks here yet" sub=${vc.hasFilters ? 'No tasks match the current filters.' : 'Add a task to get this list moving.'}
            action=${vc.hasFilters ? h`<button type="button" class="cv-btn" onClick=${vc.clearFilters}>Clear filters</button>` : h`<button type="button" class="cv-pri" onClick=${vc.createTask}><i class="ti ti-plus"></i>Add Task</button>`}/>
        </div>`;
      }
      return h`<div class=${'cv-list' + (vc.selected.size ? ' cv-anysel' : '') + (vc.cfg.wrap_text ? ' cv-wrap' : '')} role="grid" aria-label="Tasks">
        ${groups.map(g => h`<${ListGroupBlock} key=${g.key} g=${g} vc=${listVc} cols=${cols} tpl=${tpl} groupBy=${vc.cfg.group_by}
          collapsed=${collapsed.has(g.key)} onToggle=${() => setCollapsed(s => { const n = new Set(s); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })}/>`)}
        ${vc.cfg.group_by === 'status' && scopeList && scopeList.kind === 'general' && h`<${NewStatusRow} listId=${scopeList.id} vc=${vc}/>`}
      </div>`;
    }

    // =========================================================================
    // BOARD mode
    // =========================================================================
    const DRAG_MIME = 'application/x-ams-task';
    const numPos = (r) => (r && r.position != null && !isNaN(Number(r.position))) ? Number(r.position) : null;
    function positionBetween(list, index) {
      const before = list[index - 1], after = list[index];
      const pb = numPos(before), pa = numPos(after);
      if (before && after) {
        if (pb != null && pa != null) return (pb + pa) / 2;
        return (index + 0.5) * 1024;
      }
      if (before) return pb != null ? pb + 1024 : (index + 1) * 1024;
      if (after) return pa != null ? pa - 1024 : 0;
      return 1024;
    }

    function BoardCard({ row, vc, g, groups, dragging, dropBefore, onDragStart, onDragEnd, onDragOverCard }) {
      const menu = usePop();
      const movable = groups.filter(x => x.dragPatch && x.key !== g.key);
      const moveTo = (tg) => vc.moveToGroup(row, g, tg, null);
      const items = [
        { key: 'open', label: 'Open task', icon: 'ti-arrows-diagonal', onSelect: () => { menu.close(); openTask(row.id); } },
        movable.length && g.dragPatch ? { key: 'move', label: 'Move to', icon: 'ti-arrow-move-right', submenu: movable.map(tg => ({ key: tg.key, label: tg.label, onSelect: () => { menu.close(); moveTo(tg); } })) } : null,
        { key: 'sel', label: vc.selected.has(row.id) ? 'Deselect' : 'Select', icon: 'ti-checkbox', onSelect: () => { menu.close(); vc.toggleSel(row.id); } },
        { key: 'div', divider: true },
        { key: 'del', label: 'Delete', icon: 'ti-trash', danger: true, onSelect: async () => { menu.close(); if (!window.confirm('Delete this task?')) return; try { await TaskAPI.remove(row.id); vc.toast('Task deleted'); } catch (e) { vc.toast(errMsg(e)); } } },
      ].filter(Boolean);
      const thumb = row.post && row.post.thumb;
      const showClient = !vc.singleClient && row.client_id;
      return h`<div class=${'cv-card' + (dragging ? ' dragging' : '') + (dropBefore ? ' dropbefore' : '') + (vc.selected.has(row.id) ? ' sel' : '') + (vc.cursorId === row.id ? ' kb' : '')}
          draggable="true" tabIndex=${0} role="listitem" aria-label=${row.title} data-row-id=${row.id}
          style=${vc.selected.has(row.id) ? { borderColor: 'var(--cu-accent,#ff00ee)' } : null}
          onDragStart=${(e) => onDragStart(e, row)} onDragEnd=${onDragEnd} onDragOver=${(e) => onDragOverCard(e, row)}
          onKeyDown=${(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) openTask(row.id); }}>
        <div style=${{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, minHeight: 18 }}>
          <${StatusMenu} row=${row} vc=${vc} size=${13}/>
          ${showClient && h`<${ClientBadge} clientId=${row.client_id}/>`}
          ${row.type && row.type !== 'task' && h`<span style=${{ color: 'var(--cu-t3,#8e8e99)', display: 'inline-flex' }}><${TypeIcon} type=${row.type}/></span>`}
        </div>
        <div class="cv-card-t" onClick=${() => openTask(row.id)}>${row.title || 'Untitled'}</div>
        ${vc.cfg.show_locations && h`<div class="cv-locline" title=${locText(row)}>${locText(row)}</div>`}
        ${(Number(row.blocked_by_open) > 0 || Number(row.blocking_count) > 0 || (EXT().rowBadges || []).length > 0) && h`<div style=${{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}><${RowBadges} row=${row} vc=${vc}/></div>`}
        <div class="cv-card-menu">
          <button type="button" class="cv-iconbtn" aria-label="Task actions" onClick=${(e) => { e.stopPropagation(); menu.toggle(e); }}><i class="ti ti-dots"></i></button>
          <${Pop} pop=${menu} width=${200}><${Menu} items=${items}/><//>
        </div>
        ${thumb && h`<img class="cv-card-thumb" src=${thumb} alt="" loading="lazy" draggable="false"/>`}
        ${(row.tag_ids || []).length > 0 && h`<div style=${{ marginTop: 6 }}><${TagChips} ids=${row.tag_ids}/></div>`}
        <div class="cv-card-ft">
          ${(row.assignees || []).length > 0 && h`<${AssigneeStack} assignees=${row.assignees} max=${3} size=${20}/>`}
          ${row.due_at && h`<${DueChip} row=${row}/>`}
          ${row.priority && h`<${PriorityFlag} value=${row.priority}/>`}
          <span style=${{ flex: 1 }}></span>
          ${(row.subtask_count || 0) > 0 && h`<span class="cv-meta" title="Subtasks"><i class="ti ti-subtask"></i>${row.subtask_done_count || 0}/${row.subtask_count}</span>`}
          ${(row.checklist_total || 0) > 0 && h`<span class="cv-meta" title="Checklist"><i class="ti ti-checkbox"></i>${row.checklist_done || 0}/${row.checklist_total}</span>`}
          ${(row.comment_count || 0) > 0 && h`<span class="cv-meta" title="Comments"><i class="ti ti-message"></i>${row.comment_count}</span>`}
        </div>
      </div>`;
    }

    function WipEditor({ label, value, onSave, onClose }) {
      const [v, setV] = useState(value ? String(value) : '');
      const save = () => { const n = parseInt(v, 10); onSave(n > 0 ? n : null); onClose(); };
      return h`<div class="cv-pop" style=${{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div><b style=${{ fontSize: 13 }}>WIP limit</b><div class="cv-note">Soft cap for “${label}”. The column turns amber at the limit and red above it.</div></div>
        <input class="cv-in" type="number" min="0" step="1" autoFocus aria-label="WIP limit" placeholder="No limit" value=${v}
          onChange=${e => setV(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') save(); }}/>
        <div style=${{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          ${value ? h`<button type="button" class="cv-btn" onClick=${() => { onSave(null); onClose(); }}>Remove limit</button>` : null}
          <button type="button" class="cv-pri" style=${{ height: 28 }} onClick=${save}>Save</button>
        </div>
      </div>`;
    }

    function BoardMode({ vc, groups }) {
      const [drag, setDrag] = useState(null);          // { id, fromKey }
      const [over, setOver] = useState(null);          // { key, index }
      const [shut, setShut] = useState(() => new Set());
      const [adding, setAdding] = useState(null);
      const [caps, setCaps] = useState({});
      const [wipPop, setWipPop] = useState(null);      // { key, label, anchor }
      const wip = vc.cfg.wip || {};
      const wipOf = (g) => { const n = Number(wip[g.key]); return n > 0 ? n : null; };
      const setWip = (key, n) => { const next = { ...wip }; if (n) next[key] = n; else delete next[key]; vc.setCfg({ wip: next }); };
      const canReorder = !vc.cfg.sort;
      const total = groups.reduce((a, g) => a + g.rows.length, 0);

      const onDragStart = (e, row, g) => {
        try { e.dataTransfer.setData(DRAG_MIME, row.id); e.dataTransfer.setData('text/plain', row.id); e.dataTransfer.effectAllowed = 'move'; } catch (_) { }
        setDrag({ id: row.id, fromKey: g.key });
      };
      const onDragEnd = () => { setDrag(null); setOver(null); };
      const overCard = (e, g, row) => {
        if (!drag) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const list = g.rows;
        let idx = list.findIndex(r => r.id === row.id);
        if (e.clientY > rect.top + rect.height / 2) idx += 1;
        if (!over || over.key !== g.key || over.index !== idx) setOver({ key: g.key, index: idx });
      };
      const overCol = (e, g) => {
        if (!drag) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = (g.key === drag.fromKey || g.dragPatch) ? 'move' : 'none'; } catch (_) { }
        if (!over || over.key !== g.key) setOver({ key: g.key, index: g.rows.length });
      };
      const onDrop = (e, g) => {
        e.preventDefault();
        const id = drag ? drag.id : (e.dataTransfer && (e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')));
        const from = drag && groups.find(x => x.key === drag.fromKey);
        const idx = over && over.key === g.key ? over.index : g.rows.length;
        setDrag(null); setOver(null);
        const row = vc.rows.find(r => r.id === id);
        if (!row || !from) return;
        if (from.key !== g.key && !g.dragPatch) { vc.toast('Tasks can’t be moved into this group by dragging'); return; }
        vc.moveToGroup(row, from, g, canReorder ? idx : null);
        const lim = wipOf(g);
        if (lim && from.key !== g.key && g.rows.length + 1 > lim) vc.toast('“' + g.label + '” is over its WIP limit (' + (g.rows.length + 1) + ' / ' + lim + ')');
      };

      return h`<div class="cv-board" role="list" aria-label="Board">
        ${groups.map(g => {
          const isShut = shut.has(g.key);
          const toggle = () => setShut(s => { const n = new Set(s); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; });
          const pill = g.avatar
            ? h`<span class="cv-gpill plain"><${MemberAvatar} member=${g.avatar} size=${16}/>${g.label}</span>`
            : h`<span class=${'cv-gpill' + (g.color ? '' : ' plain')} style=${g.color ? { background: g.color } : null}>${g.label}</span>`;
          if (isShut) {
            return h`<div key=${g.key} class="cv-bcol shut" role="button" tabIndex=${0} aria-label=${'Expand ' + g.label} onClick=${toggle} onKeyDown=${e => e.key === 'Enter' && toggle()}>
              <span class="cv-gcount" style=${{ marginBottom: 6 }}>${g.rows.length}</span>${pill}
            </div>`;
          }
          const cap = caps[g.key] || GROUP_CAP;
          const isOver = over && over.key === g.key && drag && (g.key === drag.fromKey ? canReorder : !!g.dragPatch);
          const lim = wipOf(g);
          const wipCls = lim ? (g.rows.length > lim ? ' wip-over' : g.rows.length === lim ? ' wip-near' : '') : '';
          return h`<div key=${g.key} class=${'cv-bcol' + wipCls + (isOver && drag.fromKey !== g.key ? ' drop' : '')}
              onDragOver=${(e) => overCol(e, g)} onDrop=${(e) => onDrop(e, g)} onDragLeave=${(e) => { if (!e.currentTarget.contains(e.relatedTarget) && over && over.key === g.key) setOver(null); }}>
            <div class="cv-bhd">
              ${pill}<span class="cv-gcount" title=${lim ? 'WIP limit ' + lim : ''}>${g.rows.length}${lim ? ' / ' + lim : ''}</span><span style=${{ flex: 1 }}></span>
              <button type="button" class="cv-iconbtn" aria-label=${'WIP limit for ' + g.label} title="WIP limit" onClick=${(e) => setWipPop({ key: g.key, label: g.label, anchor: e.currentTarget })}><i class="ti ti-gauge"></i></button>
              <button type="button" class="cv-iconbtn" aria-label=${'Collapse ' + g.label} onClick=${toggle}><i class="ti ti-arrows-horizontal"></i></button>
              <button type="button" class="cv-iconbtn" aria-label=${'Add task to ' + g.label} onClick=${() => setAdding(g.key)}><i class="ti ti-plus"></i></button>
            </div>
            <div class="cv-bcards">
              ${adding === g.key && h`<${QuickAddRow} autoOpen=${true} showToast=${vc.toast} style=${{ padding: 0, border: 0, height: 'auto' }} defaults=${vc.presetFor(g)}
                onCancel=${() => setAdding(null)} onCreated=${(r) => vc.onCreated(r)}/>`}
              ${g.rows.slice(0, cap).map((r, i) => h`<${BoardCard} key=${r.id} row=${r} vc=${vc} g=${g} groups=${groups}
                dragging=${drag && drag.id === r.id} dropBefore=${isOver && over.index === i && !(drag && drag.id === r.id)}
                onDragStart=${(e, row) => onDragStart(e, row, g)} onDragEnd=${onDragEnd} onDragOverCard=${(e, row) => overCard(e, g, row)}/>`)}
              ${g.rows.length > cap && h`<button type="button" class="cv-btn" onClick=${() => setCaps(c => ({ ...c, [g.key]: cap + GROUP_CAP }))}>Show more (${g.rows.length - cap})</button>`}
              <div class=${'cv-dropend' + (isOver && over.index >= Math.min(g.rows.length, cap) ? ' on' : '')}></div>
              ${adding !== g.key && h`<button type="button" class="cv-addbtn" onClick=${() => setAdding(g.key)}><i class="ti ti-plus"></i>Add Task</button>`}
            </div>
          </div>`;
        })}
        ${wipPop && h`<${Popover} anchor=${wipPop.anchor} open=${true} onClose=${() => setWipPop(null)} width=${260}>
          <${WipEditor} label=${wipPop.label} value=${Number(wip[wipPop.key]) || null} onSave=${(n) => setWip(wipPop.key, n)} onClose=${() => setWipPop(null)}/>
        <//>`}
        ${total === 0 && groups.length === 0 && h`<div style=${{ padding: 32, width: 'min(520px,90vw)' }}>
          <${EmptyState} icon="ti-layout-kanban" title="Your board is empty" sub=${vc.hasFilters ? 'No tasks match the current filters.' : 'Create a task to see it here.'}
            action=${vc.hasFilters ? h`<button type="button" class="cv-btn" onClick=${vc.clearFilters}>Clear filters</button>` : h`<button type="button" class="cv-pri" onClick=${vc.createTask}><i class="ti ti-plus"></i>Add Task</button>`}/>
        </div>`}
      </div>`;
    }

    // =========================================================================
    // CALENDAR mode
    // =========================================================================
    const ymd = (d) => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };

    function CalChip({ row, onDragStart, onDragEnd, showTime }) {
      return h`<button type="button" class=${'cv-chip' + (isDone(row) ? ' done' : '')} style=${{ '--cv-c': row.status_color || '#87909e' }}
          draggable="true" title=${row.title + (row.status_name ? ' · ' + row.status_name : '')}
          onDragStart=${(e) => onDragStart(e, row)} onDragEnd=${onDragEnd} onClick=${() => openTask(row.id)}>
        ${showTime && row.due_has_time !== false && row.due_at && h`<span class="cv-ctime">${fmtTime(row.due_at)}</span>`}
        <span class="cv-ct">${row.title || 'Untitled'}</span>
      </button>`;
    }

    function MoreChips({ rows, day, chipProps }) {
      const pop = usePop();
      return h`<${Fragment}>
        <button type="button" class="cv-meta" style=${{ alignSelf: 'flex-start' }} onClick=${pop.toggle}>+${rows.length} more</button>
        <${Pop} pop=${pop} width=${240}>
          <div class="cv-pop">
            <div class="cv-pop-h">${new Date(day).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</div>
            <div style=${{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 300, overflowY: 'auto' }}>
              ${rows.map(r => h`<${CalChip} key=${r.id} row=${r} ...${chipProps} showTime=${true}/>`)}
            </div>
          </div>
        <//>
      <//>`;
    }

    // ---- Day mode: hour grid, timed tasks positioned by time, drag to a slot ----
    const HOUR_PX = 44;
    function layoutDayItems(items) {
      const sorted = items.slice().sort((a, b) => a.top - b.top || b.bottom - a.bottom);
      let cluster = [], clusterEnd = -1;
      const flush = () => { const n = cluster.reduce((m, it) => Math.max(m, it.col + 1), 1); cluster.forEach(it => { it.cols = n; }); cluster = []; };
      sorted.forEach(it => {
        if (cluster.length && it.top >= clusterEnd) { flush(); clusterEnd = -1; }
        const used = new Set(cluster.filter(c => c.bottom > it.top).map(c => c.col));
        let col = 0; while (used.has(col)) col++;
        it.col = col; cluster.push(it); clusterEnd = Math.max(clusterEnd, it.bottom);
      });
      if (cluster.length) flush();
      return sorted;
    }

    function DayView({ vc, day, list, chipProps, dragRef }) {
      const gridRef = useRef(null);
      const [dropMin, setDropMin] = useState(null);
      const [allOver, setAllOver] = useState(false);
      const [now, setNow] = useState(() => new Date());
      const dayKey = ymd(day);
      useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
      useEffect(() => {
        const el = gridRef.current; const host = el && el.closest('.cv-body');
        if (!el || !host) return;
        const hour = sameDay(day, new Date()) ? Math.max(0, new Date().getHours() - 2) : 8;
        host.scrollTop += el.getBoundingClientRect().top - host.getBoundingClientRect().top + hour * HOUR_PX - 8;
      }, [dayKey]);
      const workStart = 9, workEnd = 9 + (vc.workHours || 8);
      const spanStart = (r) => {
        if (!r.start_at || !r.due_at) return null;
        const s = new Date(r.start_at);
        return sameDay(s, day) && s < new Date(r.due_at) && sameDay(r.due_at, day) ? s : null;
      };
      const allDay = list.filter(r => r.due_has_time === false);
      const items = layoutDayItems(list.filter(r => r.due_has_time !== false).map(r => {
        const due = new Date(r.due_at);
        const dueMin = due.getHours() * 60 + due.getMinutes();
        let top = dueMin, bottom = dueMin + 30;
        const s = spanStart(r);
        if (s) { top = s.getHours() * 60 + s.getMinutes(); bottom = dueMin; }
        if (bottom - top < 30) bottom = top + 30;
        if (bottom > 24 * 60) { bottom = 24 * 60; top = Math.min(top, bottom - 30); }
        return { row: r, top, bottom };
      }));
      const minsAt = (e) => {
        const rect = gridRef.current.getBoundingClientRect();
        return Math.max(0, Math.min(24 * 60 - 15, Math.round((e.clientY - rect.top) / HOUR_PX * 60 / 15) * 15));
      };
      const idOf = (e) => dragRef.current || (e.dataTransfer && (e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')));
      const at = (mins) => { const t = sod(day); t.setMinutes(mins); return t; };
      const onDrop = (e) => {
        e.preventDefault();
        const mins = minsAt(e); setDropMin(null);
        const id = idOf(e); dragRef.current = null;
        const row = vc.rows.find(r => r.id === id);
        if (!row) return;
        const t = at(mins);
        const s = spanStart(row);
        if (s) {   // move the whole start→due block, keeping its duration
          const delta = t.getTime() - s.getTime();
          if (Math.abs(delta) < 60000) return;
          vc.update(row, { start_at: new Date(s.getTime() + delta).toISOString(), due_at: new Date(Date.parse(row.due_at) + delta).toISOString(), due_has_time: true });
          return;
        }
        if (row.due_has_time !== false && row.due_at && Math.abs(Date.parse(row.due_at) - t.getTime()) < 60000) return;
        const patch = { due_at: t.toISOString(), due_has_time: true };
        if (row.start_at) patch.keep_duration = true;
        vc.update(row, patch);
      };
      const onAllDrop = (e) => {
        e.preventDefault(); setAllOver(false);
        const id = idOf(e); dragRef.current = null;
        const row = vc.rows.find(r => r.id === id);
        if (!row || (row.due_has_time === false && row.due_at && sameDay(row.due_at, day))) return;
        vc.update(row, { due_at: allDayIso(day), due_has_time: false });
      };
      return h`<div class="cv-dayv" role="grid" aria-label=${day.toDateString()}>
        <div class=${'cv-dayv-all' + (allOver ? ' drop' : '')} aria-label="All-day tasks"
          onDragOver=${e => { e.preventDefault(); if (!allOver) setAllOver(true); }}
          onDragLeave=${e => { if (!e.currentTarget.contains(e.relatedTarget)) setAllOver(false); }} onDrop=${onAllDrop}>
          <span class="cv-lbl">All day</span>
          ${allDay.map(r => h`<${CalChip} key=${r.id} row=${r} ...${chipProps}/>`)}
          ${allDay.length === 0 && h`<span class="cv-loc" style=${{ lineHeight: '24px' }}>Drop a task here to make it all-day · double-click a slot to add a task</span>`}
        </div>
        <div class="cv-hours" ref=${gridRef} style=${{ height: 24 * HOUR_PX }}
          onDragOver=${e => { e.preventDefault(); const m = minsAt(e); if (m !== dropMin) setDropMin(m); }}
          onDragLeave=${e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropMin(null); }}
          onDrop=${onDrop}
          onDoubleClick=${e => { if (e.target.closest && e.target.closest('.cv-evt')) return; vc.createTask({ due_at: at(minsAt(e)).toISOString(), due_has_time: true }); }}>
          ${Array.from({ length: 24 }, (_, hh) => h`<div key=${hh} class=${'cv-hr' + (hh < workStart || hh >= workEnd ? ' off' : '')} style=${{ height: HOUR_PX }}>${hh > 0 ? h`<span>${fmtHour(hh)}</span>` : null}</div>`)}
          ${items.map(it => {
            const r = it.row; const w = 100 / (it.cols || 1); const hgt = (it.bottom - it.top) / 60 * HOUR_PX;
            const s = spanStart(r);
            return h`<button type="button" key=${r.id} class=${'cv-evt' + (isDone(r) ? ' done' : '')} draggable="true" data-row-id=${r.id}
                style=${{ '--cv-c': r.status_color || '#87909e', top: it.top / 60 * HOUR_PX, height: Math.max(20, hgt - 2), left: 'calc(' + (it.col * w) + '% + 4px)', width: 'calc(' + w + '% - 8px)' }}
                title=${r.title + ' · ' + (s ? fmtTime(s) + ' – ' : '') + fmtTime(r.due_at)}
                onDragStart=${e => chipProps.onDragStart(e, r)} onDragEnd=${chipProps.onDragEnd} onClick=${() => openTask(r.id)}>
              <span style=${{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${r.title || 'Untitled'}</span>
              ${hgt >= 34 ? h`<small>${(s ? fmtTime(s) + ' – ' : '') + fmtTime(r.due_at)}${r.client_name ? ' · ' + r.client_name : ''}</small>` : null}
            </button>`;
          })}
          ${dropMin != null && h`<div class="cv-dropline" style=${{ top: dropMin / 60 * HOUR_PX }}><b>${fmtTime(at(dropMin))}</b></div>`}
          ${sameDay(day, now) && h`<div class="cv-nowline" style=${{ top: (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_PX }}></div>`}
        </div>
      </div>`;
    }

    function CalendarMode({ vc, rows }) {
      const [cursor, setCursor] = useState(() => sod(new Date()));
      const mode = vc.cfg.calendar_mode === 'week' || vc.cfg.calendar_mode === 'day' ? vc.cfg.calendar_mode : 'month';
      const [drawer, setDrawer] = useState(false);
      const [dtab, setDtab] = useState('unscheduled');
      const [overDay, setOverDay] = useState(null);
      const dragRef = useRef(null);
      const today = sod(new Date());

      const byDay = useMemo(() => {
        const m = {};
        rows.forEach(r => { if (!r.due_at) return; const k = ymd(r.due_at); (m[k] = m[k] || []).push(r); });
        Object.values(m).forEach(list => list.sort((a, b) => (a.due_has_time === false ? 1 : 0) - (b.due_has_time === false ? 1 : 0) || Date.parse(a.due_at) - Date.parse(b.due_at)));
        return m;
      }, [rows]);
      const unscheduled = useMemo(() => rows.filter(r => !r.due_at && !isDone(r)), [rows]);
      const overdue = useMemo(() => rows.filter(r => isOverdue(r)), [rows]);

      const days = useMemo(() => {
        if (mode === 'day') return [sod(cursor)];
        if (mode === 'week') { const s = startOfWeek(cursor); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }
        const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const s = startOfWeek(first);
        return Array.from({ length: 42 }, (_, i) => addDays(s, i));
      }, [cursor, mode, PREF.weekStart]);

      const step = (n) => setCursor(c => mode === 'day' ? addDays(c, n) : mode === 'week' ? addDays(c, 7 * n) : new Date(c.getFullYear(), c.getMonth() + n, 1));
      const title = mode === 'month' ? monthTitle(cursor)
        : mode === 'day' ? cursor.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : (() => { const s = startOfWeek(cursor), e = addDays(s, 6); return s.getDate() + ' ' + s.toLocaleDateString('en-IN', { month: 'short' }) + ' – ' + e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); })();

      const chipProps = {
        onDragStart: (e, row) => { dragRef.current = row.id; try { e.dataTransfer.setData(DRAG_MIME, row.id); e.dataTransfer.setData('text/plain', row.id); e.dataTransfer.effectAllowed = 'move'; } catch (_) { } },
        onDragEnd: () => { dragRef.current = null; setOverDay(null); },
      };
      const dayDrop = (day) => ({
        onDragOver: (e) => { e.preventDefault(); const k = ymd(day); if (overDay !== k) setOverDay(k); },
        onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverDay(null); },
        onDrop: (e) => {
          e.preventDefault(); setOverDay(null);
          const id = dragRef.current || (e.dataTransfer && (e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')));
          dragRef.current = null;
          const row = vc.rows.find(r => r.id === id);
          if (!row) return;
          if (row.due_at && sameDay(row.due_at, day)) return;
          vc.update(row, moveDueTo(row, day));
        },
      });
      const addOn = (day) => vc.createTask({ due_at: allDayIso(day), due_has_time: false });

      return h`<div class="cv-cal">
        <div class="cv-calbar">
          <button type="button" class="cv-btn" onClick=${() => setCursor(sod(new Date()))}>Today</button>
          <button type="button" class="cv-btn icon" aria-label="Previous" onClick=${() => step(-1)}><i class="ti ti-chevron-left"></i></button>
          <button type="button" class="cv-btn icon" aria-label="Next" onClick=${() => step(1)}><i class="ti ti-chevron-right"></i></button>
          <span class="cv-caltitle" aria-live="polite">${title}</span>
          <span class="cv-sp"></span>
          <div style=${{ display: 'inline-flex', gap: 2 }} role="group" aria-label="Calendar range">
            <button type="button" class=${'cv-btn' + (mode === 'month' ? ' on' : '')} aria-pressed=${mode === 'month'} onClick=${() => vc.setCfg({ calendar_mode: 'month' })}>Month</button>
            <button type="button" class=${'cv-btn' + (mode === 'week' ? ' on' : '')} aria-pressed=${mode === 'week'} onClick=${() => vc.setCfg({ calendar_mode: 'week' })}>Week</button>
            <button type="button" class=${'cv-btn' + (mode === 'day' ? ' on' : '')} aria-pressed=${mode === 'day'} onClick=${() => vc.setCfg({ calendar_mode: 'day' })}>Day</button>
          </div>
          <button type="button" class=${'cv-btn' + (drawer ? ' on' : '')} aria-pressed=${drawer} onClick=${() => setDrawer(d => !d)}>
            <i class="ti ti-layout-sidebar-right"></i><span class="cv-hide-sm">Unscheduled</span> ${unscheduled.length + overdue.length > 0 ? '(' + (unscheduled.length + overdue.length) + ')' : ''}
          </button>
        </div>
        ${rows.length === 0 && h`<div style=${{ padding: '0 12px 8px' }}>
          <${EmptyState} icon="ti-calendar" title="Nothing scheduled" sub=${vc.hasFilters ? 'No tasks match the current filters.' : 'Tasks with due dates appear on the calendar.'}
            action=${vc.hasFilters ? h`<button type="button" class="cv-btn" onClick=${vc.clearFilters}>Clear filters</button>` : h`<button type="button" class="cv-pri" onClick=${() => vc.createTask()}><i class="ti ti-plus"></i>Add Task</button>`}/>
        </div>`}
        <div class="cv-calwrap">
          ${mode === 'month' ? h`<div class="cv-month" role="grid" aria-label=${title}>
              ${dowHeads().map(d => h`<div key=${d} class="cv-dow" role="columnheader">${d}</div>`)}
              ${days.map(day => {
                const k = ymd(day); const list = byDay[k] || [];
                const out = day.getMonth() !== cursor.getMonth();
                const extra = list.length > 3 ? list.slice(3) : [];
                return h`<div key=${k} role="gridcell" class=${'cv-day' + (out ? ' out' : '') + (sameDay(day, today) ? ' today' : '') + (overDay === k ? ' drop' : '')} ...${dayDrop(day)}>
                  <div class="cv-dhd">
                    <span class="cv-dnum">${day.getDate()}</span>
                    <button type="button" class="cv-iconbtn cv-dadd" style=${{ width: 20, height: 20 }} aria-label=${'Add task on ' + day.toDateString()} onClick=${() => addOn(day)}><i class="ti ti-plus" style=${{ fontSize: 13 }}></i></button>
                  </div>
                  ${list.slice(0, 3).map(r => h`<${CalChip} key=${r.id} row=${r} ...${chipProps}/>`)}
                  ${extra.length > 0 && h`<${MoreChips} rows=${extra} day=${day} chipProps=${chipProps}/>`}
                </div>`;
              })}
            </div>`
          : mode === 'day' ? h`<${DayView} vc=${vc} day=${days[0]} list=${byDay[ymd(days[0])] || []} chipProps=${chipProps} dragRef=${dragRef}/>`
          : h`<div class="cv-week" role="grid" aria-label=${title}>
              ${days.map((day, i) => {
                const k = ymd(day); const list = byDay[k] || [];
                const allDay = list.filter(r => r.due_has_time === false);
                const timed = list.filter(r => r.due_has_time !== false);
                return h`<div key=${k} class=${'cv-wcol' + (sameDay(day, today) ? ' today' : '') + (overDay === k ? ' drop' : '')} role="gridcell" ...${dayDrop(day)}>
                  <div class="cv-whd"><span>${dowLabel(day)}</span><b>${day.getDate()}</b><span class="cv-sp"></span>
                    <button type="button" class="cv-iconbtn" style=${{ width: 20, height: 20 }} aria-label=${'Add task on ' + day.toDateString()} onClick=${() => addOn(day)}><i class="ti ti-plus" style=${{ fontSize: 13 }}></i></button>
                  </div>
                  <div class="cv-wallday" aria-label="All day">${allDay.map(r => h`<${CalChip} key=${r.id} row=${r} ...${chipProps}/>`)}</div>
                  <div class="cv-wtimed">${timed.map(r => h`<${CalChip} key=${r.id} row=${r} ...${chipProps} showTime=${true}/>`)}</div>
                </div>`;
              })}
            </div>`}
          ${drawer && h`<aside class="cv-drawer" aria-label="Unscheduled and overdue tasks">
            <div class="cv-dtabs" role="tablist">
              <button type="button" role="tab" aria-selected=${dtab === 'unscheduled'} class=${dtab === 'unscheduled' ? 'on' : ''} onClick=${() => setDtab('unscheduled')}>Unscheduled (${unscheduled.length})</button>
              <button type="button" role="tab" aria-selected=${dtab === 'overdue'} class=${dtab === 'overdue' ? 'on' : ''} onClick=${() => setDtab('overdue')}>Overdue (${overdue.length})</button>
            </div>
            <div class="cv-dlist">
              <div class="cv-loc" style=${{ padding: '2px 2px 6px' }}>Drag a task onto a day to schedule it.</div>
              ${(dtab === 'unscheduled' ? unscheduled : overdue).slice(0, 300).map(r => h`<${CalChip} key=${r.id} row=${r} ...${chipProps} showTime=${dtab === 'overdue'}/>`)}
              ${(dtab === 'unscheduled' ? unscheduled : overdue).length === 0 && h`<div class="cv-loc" style=${{ padding: 12, textAlign: 'center' }}>${dtab === 'unscheduled' ? 'Everything has a date.' : 'Nothing overdue.'}</div>`}
            </div>
          </aside>`}
        </div>
      </div>`;
    }

    // =========================================================================
    // TABLE mode
    // =========================================================================
    function TableMode({ vc, rows }) {
      const [cap, setCap] = useState(GROUP_CAP);
      const [live, setLive] = useState(null);     // { key, w } while resizing
      const colPop = usePop();
      const cols = vc.columns;
      const widthOf = (key) => (live && live.key === key) ? live.w
        : ((vc.cfg.col_widths || {})[key] || (key === 'name' ? 320 : (colMeta(key, vc.fieldById) || { w: 120 }).w));
      const startResize = (e, key) => {
        e.preventDefault(); e.stopPropagation();
        const x0 = e.clientX, w0 = widthOf(key);
        let w = w0;
        const move = (ev) => { w = Math.max(60, Math.min(800, w0 + ev.clientX - x0)); setLive({ key, w }); };
        const up = () => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
          setLive(null);
          if (w !== w0) vc.setCfg({ col_widths: { ...(vc.cfg.col_widths || {}), [key]: Math.round(w) } });
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      };
      const resizer = (key, label) => h`<span class=${'cv-rsz' + (live && live.key === key ? ' on' : '')} role="separator" aria-orientation="vertical" aria-label=${'Resize ' + label}
        tabIndex=${0} onPointerDown=${(e) => startResize(e, key)}
        onKeyDown=${(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); vc.setCfg({ col_widths: { ...(vc.cfg.col_widths || {}), [key]: Math.max(60, widthOf(key) + (e.key === 'ArrowRight' ? 16 : -16)) } }); } }}></span>`;
      const sortBy = (key) => { const s = vc.cfg.sort; vc.setCfg({ sort: s && s.field === key ? (s.dir === 'asc' ? { field: key, dir: 'desc' } : null) : { field: key, dir: 'asc' } }); };
      const sortIcon = (key) => vc.cfg.sort && vc.cfg.sort.field === key ? h`<i class=${'ti ' + (vc.cfg.sort.dir === 'desc' ? 'ti-arrow-down' : 'ti-arrow-up')} style=${{ fontSize: 11, marginLeft: 3 }}></i>` : null;
      if (rows.length === 0) {
        return h`<div style=${{ padding: 32 }}><${EmptyState} icon="ti-table" title="No rows to show" sub=${vc.hasFilters ? 'No tasks match the current filters.' : 'Add a task to start the table.'}
          action=${vc.hasFilters ? h`<button type="button" class="cv-btn" onClick=${vc.clearFilters}>Clear filters</button>` : h`<button type="button" class="cv-pri" onClick=${() => vc.createTask()}><i class="ti ti-plus"></i>Add Task</button>`}/></div>`;
      }
      const totalW = 44 + widthOf('name') + cols.reduce((a, c) => a + widthOf(c), 0) + 44;
      return h`<div class="cv-tblwrap">
        <table class="cv-tbl" style=${{ width: totalW }} role="grid" aria-rowcount=${rows.length}>
          <colgroup>
            <col style=${{ width: 44 }}/><col style=${{ width: widthOf('name') }}/>
            ${cols.map(c => h`<col key=${c} style=${{ width: widthOf(c) }}/>`)}
            <col style=${{ width: 44 }}/>
          </colgroup>
          <thead><tr>
            <th class="cv-rn">#</th>
            <th class="cv-fc"><div class="cv-th"><span style=${{ cursor: 'pointer', flex: 1 }} onClick=${() => sortBy('title')}>Name${sortIcon('title')}</span>${resizer('name', 'Name')}</div></th>
            ${cols.map(c => { const m = colMeta(c, vc.fieldById) || { label: c, sort: c }; return h`<th key=${c}><div class="cv-th"><span style=${{ cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }} onClick=${() => sortBy(m.sort)}>${m.label}${sortIcon(m.sort)}</span>${resizer(c, m.label)}</div></th>`; })}
            <th style=${{ padding: 0, textAlign: 'center' }}>
              <button type="button" class="cv-iconbtn" aria-label="Add column" onClick=${colPop.toggle}><i class="ti ti-plus"></i></button>
              <${Pop} pop=${colPop} width=${260} placement="bottom-end"><${ColumnsChooser} vc=${vc}/><//>
            </th>
          </tr></thead>
          <tbody>
            ${rows.slice(0, cap).map((r, i) => {
              const sel = vc.selected.has(r.id);
              return h`<tr key=${r.id} aria-selected=${sel} data-row-id=${r.id} class=${vc.cursorId === r.id ? 'kb' : ''}>
                <td class="cv-rn" style=${sel ? { background: 'var(--cu-accent-fog,rgba(255,0,238,.08))' } : null}>
                  <button type="button" class="cv-cellbtn" style=${{ width: '100%', justifyContent: 'flex-end', color: sel ? 'var(--cu-accent-ink,#a8009c)' : 'inherit' }} aria-label=${(sel ? 'Deselect ' : 'Select ') + r.title} onClick=${() => vc.toggleSel(r.id)}>${sel ? h`<i class="ti ti-check"></i>` : i + 1}</button>
                </td>
                <td class="cv-fc">
                  <div style=${{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <${StatusMenu} row=${r} vc=${vc} size=${14}/>
                    <button type="button" class="cv-title" title=${r.title} onClick=${() => openTask(r.id)}>${r.title || 'Untitled'}</button>
                    ${(r.subtask_count || 0) > 0 && h`<span class="cv-meta"><i class="ti ti-subtask"></i>${r.subtask_count}</span>`}
                    <${RowBadges} row=${r} vc=${vc}/>
                    ${vc.cfg.show_locations && h`<span class="cv-loc" title=${locText(r)}>${locText(r)}</span>`}
                  </div>
                </td>
                ${cols.map(c => h`<td key=${c} class="cv-edit"><div style=${{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}><${Cell} col=${c} row=${r} vc=${vc}/></div></td>`)}
                <td></td>
              </tr>`;
            })}
          </tbody>
        </table>
        ${rows.length > cap && h`<div style=${{ padding: '10px 12px', position: 'sticky', left: 0 }}><button type="button" class="cv-btn" onClick=${() => setCap(c => c + GROUP_CAP)}>Show more (${rows.length - cap} hidden)</button></div>`}
        <div style=${{ position: 'sticky', left: 0, maxWidth: 520 }}>
          <${QuickAddRow} showToast=${vc.toast} defaults=${vc.presetFor(null)} onCreated=${(r) => vc.onCreated(r)} style=${{ paddingLeft: 12 }}/>
        </div>
      </div>`;
    }

    // =========================================================================
    // GANTT mode
    // =========================================================================
    const GANTT_PX = { day: 40, week: 16, month: 5 };
    const GANTT_NAME_W = 260;
    const shiftIso = (iso, n) => { if (!iso) return iso; const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString(); };

    // shared by Gantt + Timeline
    function computeRange(dated, zoom, today) {
      let min = today, max = today;
      dated.forEach(r => {
        const s = sod(r.start_at || r.due_at), e = sod(r.due_at || r.start_at);
        if (s < min) min = s; if (e > max) max = e;
      });
      const pad = zoom === 'day' ? 7 : zoom === 'week' ? 21 : 60;
      const start = startOfWeek(addDays(min, -pad));
      let end = addDays(max, pad * 2);
      const minDays = zoom === 'day' ? 42 : zoom === 'week' ? 120 : 400;
      if (dayDiff(start, end) < minDays) end = addDays(start, minDays);
      return { start, days: dayDiff(start, end) + 1 };
    }
    function computeTicks(range, zoom, px) {
      const big = [], small = [];
      for (let i = 0; i < range.days; i++) {
        const d = addDays(range.start, i);
        if (zoom === 'month') {
          if (d.getDate() === 1) small.push({ x: i * px, label: d.toLocaleDateString('en-IN', { month: 'short' }) });
          if (d.getDate() === 1 && d.getMonth() === 0) big.push({ x: i * px, label: String(d.getFullYear()) });
        } else {
          if (d.getDate() === 1 || i === 0) big.push({ x: i * px, label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) });
          if (zoom === 'day') small.push({ x: i * px, label: d.getDate() + ' ' + 'SMTWTFS'[d.getDay()], w: px });
          else if (d.getDay() === PREF.weekStart) small.push({ x: i * px, label: String(d.getDate()), w: 7 * px });
        }
      }
      if (zoom === 'month' && !big.length) big.push({ x: 0, label: String(range.start.getFullYear()) });
      return { big, small };
    }
    function computeWeekends(range, zoom, px) {
      if (zoom === 'month') return [];
      const out = [];
      for (let i = 0; i < range.days; i++) { const d = addDays(range.start, i); if (d.getDay() === 6) out.push(i * px); }
      return out;
    }
    // pointer drag for bars: move whole bar or drag the right handle (due)
    function useBarDrag(px, vc) {
      const [drag, setDrag] = useState(null);   // { id, kind, x0, dd, moved }
      const onBarDown = (e, row, kind) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.stopPropagation();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { }
        setDrag({ id: row.id, kind, x0: e.clientX, dd: 0, moved: false });
      };
      const onBarMove = (e) => {
        if (!drag) return;
        e.stopPropagation();
        const dx = e.clientX - drag.x0;
        const dd = Math.round(dx / px);
        if (dd !== drag.dd || (!drag.moved && Math.abs(dx) > 3)) setDrag(d => d && ({ ...d, dd, moved: d.moved || Math.abs(dx) > 3 }));
      };
      const onBarUp = (e, row) => {
        if (!drag) return;
        e.stopPropagation();
        const { dd, kind, moved } = drag;
        setDrag(null);
        if (!moved) { if (kind === 'move') openTask(row.id); return; }
        if (!dd) return;
        const patch = {};
        if (kind === 'end') {
          const nd = shiftIso(row.due_at || row.start_at, dd);
          if (row.start_at && Date.parse(nd) < Date.parse(row.start_at)) { vc.toast('Due date can’t be before the start date'); return; }
          patch.due_at = nd;
        } else {
          if (row.start_at) patch.start_at = shiftIso(row.start_at, dd);
          if (row.due_at) patch.due_at = shiftIso(row.due_at, dd);
        }
        const blocking = Number(row.blocking_count) || 0;
        if (patch.due_at && blocking > 0 && vc.feat('dependencies') && vc.feat('reschedule_dependencies')
          && window.confirm('Shift the ' + blocking + ' task' + (blocking === 1 ? '' : 's') + ' waiting on “' + (row.title || 'this task') + '” by the same amount?')) {
          patch.shift_dependents = true;
        }
        vc.update(row, patch);
      };
      const handlersFor = (r) => ({ onPointerMove: onBarMove, onPointerUp: (e) => onBarUp(e, r), onPointerCancel: () => setDrag(null) });
      const offsets = (r) => { const on = !!(drag && drag.id === r.id); const off = on ? drag.dd : 0; return { on, startOff: on && drag.kind === 'end' ? 0 : off, endOff: off }; };
      return { drag, onBarDown, handlersFor, offsets };
    }
    // fail-open dependency links for a set of task ids (task_links_for, 093)
    const linksState = { missing: false };
    function useTaskLinks(ids, enabled) {
      const [links, setLinks] = useState([]);
      const [tick, setTick] = useState(0);
      const key = enabled ? ids.slice(0, 500).join(',') : '';
      useEffect(() => {
        if (!enabled || !taskBus || !taskBus.on) return;
        let t = null;
        const bump = () => { clearTimeout(t); t = setTimeout(() => setTick(x => x + 1), 1200); };
        const offs = [taskBus.on('task:changed', bump), taskBus.on('task:deleted', bump)];
        return () => { clearTimeout(t); offs.forEach(off => typeof off === 'function' && off()); };
      }, [enabled]);
      useEffect(() => {
        if (!key || linksState.missing) { setLinks([]); return; }
        let alive = true;
        const t = setTimeout(() => {
          rpc('task_links_for', { p_task_ids: key.split(',') })
            .then(res => { if (alive) setLinks(Array.isArray(res) ? res : []); })
            .catch(e => { if (isMissingRpc(e)) linksState.missing = true; if (alive) setLinks([]); });
        }, 250);
        return () => { alive = false; clearTimeout(t); };
      }, [key, tick]);
      return links;
    }

    function GanttMode({ vc, rows }) {
      const zoom = GANTT_PX[vc.cfg.gantt_zoom] ? vc.cfg.gantt_zoom : 'week';
      const px = GANTT_PX[zoom];
      const rootRef = useRef(null);
      const bd = useBarDrag(px, vc);
      const [cap, setCap] = useState(GROUP_CAP);
      const today = sod(new Date());
      const markId = useRef('cvarr' + uid()).current;

      const dated = useMemo(() => rows.filter(r => r.start_at || r.due_at)
        .sort((a, b) => Date.parse(a.start_at || a.due_at) - Date.parse(b.start_at || b.due_at)), [rows]);
      const undated = useMemo(() => rows.filter(r => !r.start_at && !r.due_at), [rows]);

      const range = useMemo(() => computeRange(dated, zoom, today), [dated, zoom, PREF.weekStart]);
      const width = range.days * px;
      const xOf = (d) => dayDiff(range.start, d) * px;
      const shownDated = dated.slice(0, cap);
      const depsOn = vc.feat('dependencies');
      const links = useTaskLinks(shownDated.map(r => r.id), depsOn);

      const scrollHost = () => rootRef.current && rootRef.current.closest('.cv-body');
      const scrollToDate = (d) => { const host = scrollHost(); if (host) host.scrollLeft = Math.max(0, xOf(d) + GANTT_NAME_W - host.clientWidth / 2); };
      const didInit = useRef(false);
      useEffect(() => { if (!didInit.current) { didInit.current = true; setTimeout(() => scrollToDate(today), 0); } }, []);
      const autoFit = () => {
        const host = scrollHost();
        if (!dated.length || !host) { scrollToDate(today); return; }
        let min = null, max = null;
        dated.forEach(r => { const s = sod(r.start_at || r.due_at), e = sod(r.due_at || r.start_at); if (!min || s < min) min = s; if (!max || e > max) max = e; });
        const span = Math.max(1, dayDiff(min, max) + 1);
        const avail = host.clientWidth - GANTT_NAME_W - 40;
        const fit = avail / span;
        const z = fit >= GANTT_PX.day ? 'day' : fit >= GANTT_PX.week ? 'week' : 'month';
        vc.setCfg({ gantt_zoom: z });
        setTimeout(() => { const h2 = scrollHost(); if (h2 && rootRef.current) { const startX = dayDiff(range.start, min) * GANTT_PX[z]; h2.scrollLeft = Math.max(0, startX - 20); } }, 30);
      };

      // header ticks
      const ticks = useMemo(() => computeTicks(range, zoom, px), [range, zoom, px, PREF.weekStart]);
      const weekends = useMemo(() => computeWeekends(range, zoom, px), [range, zoom, px]);

      const barFor = (r) => {
        const { on, startOff, endOff } = bd.offsets(r);
        const color = r.status_color || '#87909e';
        const crit = depsOn && Number(r.blocked_by_open) > 0 ? ' crit' : '';
        const handlers = bd.handlersFor(r);
        if (r.start_at && r.due_at) {
          const s = addDays(sod(r.start_at), startOff), d = addDays(sod(r.due_at), endOff);
          const left = xOf(s), w = Math.max(px, (dayDiff(s, d) + 1) * px);
          return h`<div class=${'cv-bar' + (on ? ' dragging' : '') + crit} style=${{ left, width: w, background: color }}
              title=${r.title + ' · ' + fmtShort(r.start_at) + ' → ' + fmtShort(r.due_at) + (crit ? ' · blocked' : '')} role="button" tabIndex=${0} aria-label=${r.title}
              onPointerDown=${(e) => bd.onBarDown(e, r, 'move')} ...${handlers} onKeyDown=${(e) => e.key === 'Enter' && openTask(r.id)}>
            <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis' }}>${w > 60 ? r.title : ''}</span>
            <span class="cv-hdl" aria-label="Drag to change due date" onPointerDown=${(e) => bd.onBarDown(e, r, 'end')} ...${handlers}></span>
          </div>`;
        }
        const d = addDays(sod(r.due_at || r.start_at), endOff);
        if (!r.start_at) {
          return h`<div class=${'cv-diamond' + crit} style=${{ left: xOf(d) + px / 2 - 8, background: color }} title=${r.title + ' · due ' + fmtShort(r.due_at) + (crit ? ' · blocked' : '')}
            role="button" tabIndex=${0} aria-label=${r.title} onPointerDown=${(e) => bd.onBarDown(e, r, 'move')} ...${handlers} onKeyDown=${(e) => e.key === 'Enter' && openTask(r.id)}></div>`;
        }
        return h`<div class=${'cv-bar' + crit} style=${{ left: xOf(d), width: px, background: color }} title=${r.title} role="button" tabIndex=${0} aria-label=${r.title}
          onPointerDown=${(e) => bd.onBarDown(e, r, 'move')} ...${handlers}></div>`;
      };
      // static geometry (no drag offset) for dependency arrows
      const geom = (r) => {
        if (r.start_at && r.due_at) { const s = sod(r.start_at), d = sod(r.due_at); const left = xOf(s); return { left, right: left + Math.max(px, (dayDiff(s, d) + 1) * px) }; }
        const one = sod(r.due_at || r.start_at);
        if (!r.start_at) { const c = xOf(one) + px / 2; return { left: c - 10, right: c + 10 }; }
        const left = xOf(one); return { left, right: left + px };
      };
      const arrows = useMemo(() => {
        if (!depsOn || !links.length) return [];
        const idx = {}; shownDated.forEach((r, i) => { idx[r.id] = i; });
        const seen = new Set(); const out = [];
        links.forEach(l => {
          if (!l || l.kind !== 'blocks') return;
          const a = idx[l.task_id], b = idx[l.other_id];
          if (a == null || b == null || a === b) return;
          const k = l.task_id + '>' + l.other_id; if (seen.has(k)) return; seen.add(k);
          const ga = geom(shownDated[a]), gb = geom(shownDated[b]);
          const x1 = ga.right, y1 = a * 34 + 17, x2 = gb.left, y2 = b * 34 + 17;
          const d = x2 - x1 >= 16
            ? `M${x1} ${y1} H${x1 + 8} V${y2} H${x2 - 3}`
            : `M${x1} ${y1} H${x1 + 8} V${y1 + (y2 > y1 ? 17 : -17)} H${x2 - 12} V${y2} H${x2 - 3}`;
          const blocker = shownDated[a];
          const crit = x2 < x1 - 1 || (Number(shownDated[b].blocked_by_open) > 0 && !isDone(blocker) && isOverdue(blocker));
          out.push({ k, d, crit, label: (blocker.title || '') + ' blocks ' + (shownDated[b].title || '') });
        });
        return out;
      }, [links, shownDated, px, range, depsOn]);

      const exportGantt = () => {
        const byId = Object.fromEntries(rows.map(r => [r.id, r]));
        const blockers = {};
        links.forEach(l => { if (l && l.kind === 'blocks') (blockers[l.other_id] = blockers[l.other_id] || []).push(l.task_id); });
        const out = [['ID', 'Task', 'Status', 'Assignees', 'Client', 'List', 'Start date', 'Due date', 'Duration (days)', 'Blocked by']];
        dated.concat(undated).forEach(r => {
          const s = r.start_at || r.due_at, e = r.due_at || r.start_at;
          out.push([r.custom_id || '', r.title || '', r.status_name || r.status || '', (r.assignees || []).map(a => a.name).join(', '),
            r.client_name || 'Agency', r.list_name || '', isoStamp(r.start_at, false), isoStamp(r.due_at, !!r.due_at && r.due_has_time !== false),
            s && e ? dayDiff(s, e) + 1 : '', (blockers[r.id] || []).map(id => byId[id] ? (byId[id].custom_id || byId[id].title) : 'another task').join(', ')]);
        });
        if (downloadText(fileSafe(vc.title + ' gantt') + '.csv', toCsv(out))) vc.toast('Exported ' + (out.length - 1) + ' tasks');
      };

      const nameCell = (r) => h`<div class="cv-gname">
        <${StatusMenu} row=${r} vc=${vc} size=${14}/>
        <button type="button" class="cv-title" title=${r.title} onClick=${() => openTask(r.id)}>${r.title || 'Untitled'}</button>
        <${RowBadges} row=${r} vc=${vc}/>
      </div>`;
      const bodyH = shownDated.length * 34;

      return h`<div class="cv-gantt" ref=${rootRef} style=${{ width: GANTT_NAME_W + width }}>
        <div class="cv-gbar-top" style=${{ width: 'min(100%, 100vw)' }}>
          <div style=${{ display: 'inline-flex', gap: 2 }} role="group" aria-label="Zoom">
            ${['day', 'week', 'month'].map(z => h`<button type="button" key=${z} class=${'cv-btn' + (zoom === z ? ' on' : '')} aria-pressed=${zoom === z} onClick=${() => vc.setCfg({ gantt_zoom: z })}>${z[0].toUpperCase() + z.slice(1)}</button>`)}
          </div>
          <button type="button" class="cv-btn" onClick=${() => scrollToDate(today)}><i class="ti ti-target"></i>Today</button>
          <button type="button" class="cv-btn" onClick=${autoFit}><i class="ti ti-arrows-horizontal"></i>Auto fit</button>
          <span class="cv-sp"></span>
          ${depsOn && links.length > 0 && h`<span class="cv-loc cv-hide-sm"><span style=${{ color: '#e5484d' }}>━</span> blocked / conflicting dependency</span>`}
          <button type="button" class="cv-btn" onClick=${exportGantt} disabled=${!rows.length}><i class="ti ti-file-export"></i><span class="cv-hide-sm">Export CSV</span></button>
          <button type="button" class="cv-btn" onClick=${() => vc.printView()} disabled=${!rows.length}><i class="ti ti-printer"></i><span class="cv-hide-sm">Print</span></button>
        </div>
        ${rows.length === 0 ? h`<div style=${{ padding: 32, position: 'sticky', left: 0, maxWidth: 560 }}>
            <${EmptyState} icon="ti-timeline" title="No tasks on the timeline" sub=${vc.hasFilters ? 'No tasks match the current filters.' : 'Give tasks a start and due date to plan them here.'}
              action=${vc.hasFilters ? h`<button type="button" class="cv-btn" onClick=${vc.clearFilters}>Clear filters</button>` : h`<button type="button" class="cv-pri" onClick=${() => vc.createTask()}><i class="ti ti-plus"></i>Add Task</button>`}/>
          </div>`
        : h`<${Fragment}>
          <div class="cv-ghead">
            <div class="cv-gname">Task</div>
            <div class="cv-gscale" style=${{ width }}>
              ${ticks.big.map((t, i) => h`<div key=${'b' + i} class="cv-gtick big" style=${{ left: t.x, width: 260 }}>${t.label}</div>`)}
              ${ticks.small.map((t, i) => h`<div key=${'s' + i} class="cv-gtick" style=${{ left: t.x, width: t.w || 60 }}>${t.label}</div>`)}
            </div>
          </div>
          <div style=${{ position: 'relative' }}>
            <div aria-hidden="true" style=${{ position: 'absolute', left: GANTT_NAME_W, top: 0, width, height: bodyH, pointerEvents: 'none' }}>
              ${weekends.map((x, i) => h`<div key=${i} class="cv-gwkend" style=${{ left: x, width: 2 * px }}></div>`)}
              <div class="cv-gtoday" style=${{ left: xOf(today) + px / 2 - 1 }}></div>
            </div>
            ${arrows.length > 0 && h`<svg class="cv-deps" aria-hidden="true" width=${width} height=${bodyH} style=${{ left: GANTT_NAME_W, width, height: bodyH }}>
              <defs>
                <marker id=${markId + 'n'} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#8e8e99"/></marker>
                <marker id=${markId + 'c'} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#e5484d"/></marker>
              </defs>
              ${arrows.map(a => h`<path key=${a.k} d=${a.d} fill="none" stroke=${a.crit ? '#e5484d' : '#8e8e99'} strokeWidth=${a.crit ? 1.8 : 1.3} strokeLinejoin="round" markerEnd=${'url(#' + markId + (a.crit ? 'c' : 'n') + ')'}><title>${a.label}</title></path>`)}
            </svg>`}
            ${shownDated.map(r => h`<div key=${r.id} class=${'cv-grow' + (vc.cursorId === r.id ? ' kb' : '')} data-row-id=${r.id}>
              ${nameCell(r)}
              <div class="cv-gtrack" style=${{ width }}>${barFor(r)}</div>
            </div>`)}
          </div>
          ${dated.length > cap && h`<div style=${{ padding: 10, position: 'sticky', left: 0 }}><button type="button" class="cv-btn" onClick=${() => setCap(c => c + GROUP_CAP)}>Show more (${dated.length - cap})</button></div>`}
          ${undated.length > 0 && h`<${Fragment}>
            <div class="cv-gsec">No dates (${undated.length})</div>
            ${undated.slice(0, GROUP_CAP).map(r => h`<div key=${r.id} class=${'cv-grow' + (vc.cursorId === r.id ? ' kb' : '')} data-row-id=${r.id}>
              ${nameCell(r)}
              <div class="cv-gtrack" style=${{ width }}>
                <button type="button" class="cv-meta" style=${{ position: 'sticky', left: GANTT_NAME_W + 8, top: 7 }} onClick=${() => vc.update(r, { start_at: today.toISOString(), due_at: allDayIso(addDays(today, 2)), due_has_time: false })}>
                  <i class="ti ti-calendar-plus"></i>Schedule from today
                </button>
              </div>
            </div>`)}
          <//>`}
        <//>`}
      </div>`;
    }

    // =========================================================================
    // WORKLOAD mode
    // =========================================================================
    const loadTone = (count, cap) => {
      if (!cap) return null;
      const pct = count / cap;
      return pct > 1 ? 'over' : pct >= 0.8 ? 'near' : 'ok';
    };

    function WorkloadMode({ vc, rows }) {
      const [anchorDay, setAnchorDay] = useState(() => sod(new Date()));
      const weekStart = startOfWeek(anchorDay);
      const wsKey = ymd(weekStart);
      const setWeekStart = (fnOrDate) => setAnchorDay(a => sod(typeof fnOrDate === 'function' ? fnOrDate(startOfWeek(a)) : fnOrDate));
      const [cellPop, setCellPop] = useState(null);   // { anchor, key, di }
      const [over, setOver] = useState(null);         // 'memberId:di'
      const dragRef = useRef(null);                   // { id, from }
      const hours = vc.cfg.workload_mode === 'hours';
      const today = sod(new Date());
      const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [wsKey]);

      const grid = useMemo(() => {
        const g = {};   // memberId → { days:[{rows,mins}], total, mins, unest }
        const cell = (mid) => g[mid] || (g[mid] = { days: Array.from({ length: 7 }, () => ({ rows: [], mins: 0 })), total: 0, mins: 0, unest: 0 });
        rows.forEach(r => {
          if (!r.due_at || isDone(r)) return;
          const di = dayDiff(weekStart, r.due_at);
          if (di < 0 || di > 6) return;
          const ids = (r.assignees || []).map(a => a.id);
          (ids.length ? ids : ['__none']).forEach(mid => {
            const c = cell(mid);
            c.days[di].rows.push(r); c.days[di].mins += r.estimate_minutes || 0;
            c.total += 1; c.mins += r.estimate_minutes || 0;
            if (!r.estimate_minutes) c.unest += 1;
          });
        });
        return g;
      }, [rows, wsKey]);
      const dayCapMin = (d) => vc.isWorkDay(d) ? (vc.workHours || 8) * 60 : 0;
      const weekCapMin = days.reduce((a, d) => a + dayCapMin(d), 0);

      const onChipDragStart = (e, row, from) => {
        dragRef.current = { id: row.id, from };
        try { e.dataTransfer.setData(DRAG_MIME, row.id); e.dataTransfer.setData('text/plain', row.id); e.dataTransfer.effectAllowed = 'move'; } catch (_) { }
      };
      const onChipDragEnd = () => { dragRef.current = null; setOver(null); };
      const onCellDrop = async (e, mid, di) => {
        e.preventDefault();
        const drag = dragRef.current; dragRef.current = null; setOver(null); setCellPop(null);
        if (!drag) return;
        const row = rows.find(r => r.id === drag.id);
        if (!row) return;
        const day = days[di];
        const memberChange = drag.from !== mid;
        const dayChange = !(row.due_at && sameDay(row.due_at, day));
        if (!memberChange && !dayChange) return;
        if (memberChange) {
          const next = (row.assignees || []).map(a => a.id).filter(id => id !== drag.from);
          if (mid !== '__none' && !next.includes(mid)) next.push(mid);
          await vc.setAssignees(row, next);
        }
        if (dayChange) await vc.update(row, moveDueTo(row, day));
        const m = mid !== '__none' && vc.store.memberById ? vc.store.memberById[mid] : null;
        const parts = [];
        if (memberChange) parts.push(m ? 'Reassigned to ' + m.name : 'Unassigned');
        if (dayChange) parts.push((memberChange ? 'due ' : 'Moved to ') + fmtShort(day));
        vc.toast(parts.join(' · '));
      };

      const members = useMemo(() => {
        let ms = (vc.store.members || []).filter(m => m.role_level !== 'client');
        if (vc.quickAssignees && vc.quickAssignees.length) ms = ms.filter(m => vc.quickAssignees.includes(m.id));
        ms = ms.slice().sort((a, b) => ((grid[b.id] || {}).total || 0) - ((grid[a.id] || {}).total || 0) || cmpStr(a.name, b.name));
        if (grid.__none && grid.__none.total) ms.push({ id: '__none', name: 'Unassigned', initials: '?', color: '#b4b4bd', capacity: null });
        return ms;
      }, [vc.store.members, vc.quickAssignees, grid]);

      const e = addDays(weekStart, 6);
      const label = weekStart.getDate() + ' ' + weekStart.toLocaleDateString('en-IN', { month: 'short' }) + ' – ' + e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const popRows = cellPop ? ((grid[cellPop.key] || { days: [] }).days[cellPop.di] || { rows: [] }).rows : [];
      const chip = (r, mid) => h`<button type="button" key=${r.id} class="cv-wlchip" draggable="true" data-row-id=${r.id}
          style=${{ '--cv-c': r.status_color || '#87909e' }} title=${r.title + (r.estimate_minutes ? ' · ' + fmtMinutes(r.estimate_minutes) : ' · no estimate')}
          onDragStart=${(ev) => onChipDragStart(ev, r, mid)} onDragEnd=${onChipDragEnd} onClick=${() => openTask(r.id)}>${r.title || 'Untitled'}</button>`;

      if (!members.length) {
        return h`<div style=${{ padding: 32 }}><${EmptyState} icon="ti-chart-bar" title="No team members to show" sub="Workload lists members with tasks due this week."
          action=${h`<button type="button" class="cv-btn" onClick=${() => setWeekStart(startOfWeek(new Date()))}>Go to this week</button>`}/></div>`;
      }
      return h`<div class="cv-wl">
        <div class="cv-calbar" style=${{ padding: '8px 0' }}>
          <button type="button" class="cv-btn" onClick=${() => setWeekStart(startOfWeek(new Date()))}>This week</button>
          <button type="button" class="cv-btn icon" aria-label="Previous week" onClick=${() => setWeekStart(w => addDays(w, -7))}><i class="ti ti-chevron-left"></i></button>
          <button type="button" class="cv-btn icon" aria-label="Next week" onClick=${() => setWeekStart(w => addDays(w, 7))}><i class="ti ti-chevron-right"></i></button>
          <span class="cv-caltitle" aria-live="polite">${label}</span>
          <input type="date" class="cv-in" aria-label="Jump to week" value=${ymd(weekStart)} onChange=${ev => { if (ev.target.value) setWeekStart(startOfWeek(new Date(ev.target.value + 'T00:00:00'))); }}/>
          <div class="cv-seg" role="group" aria-label="Measure workload by">
            <button type="button" class=${'cv-btn' + (!hours ? ' on' : '')} aria-pressed=${!hours} onClick=${() => vc.setCfg({ workload_mode: 'tasks' })}><i class="ti ti-list-check"></i>Tasks</button>
            <button type="button" class=${'cv-btn' + (hours ? ' on' : '')} aria-pressed=${hours} onClick=${() => vc.setCfg({ workload_mode: 'hours' })}><i class="ti ti-clock-hour-4"></i>Hours</button>
          </div>
          <span class="cv-sp"></span>
          <span class="cv-loc cv-hide-sm">${hours ? 'Capacity ' + (vc.workHours || 8) + 'h per working day' : 'Capacity from each member’s weekly limit'} · drag a task to another person or day</span>
        </div>
        <div class="cv-wlgrid" role="grid" aria-label=${'Workload ' + label}>
          <div class="cv-wlhd cv-wlmem" role="columnheader">Member</div>
          ${days.map((d, i) => h`<div key=${i} role="columnheader" class=${'cv-wlhd' + (sameDay(d, today) ? ' today' : '')} style=${{ justifyContent: 'center' }}>${dowLabel(d)} ${d.getDate()}</div>`)}
          <div class="cv-wlhd" role="columnheader">Week total</div>
          ${members.map(m => {
            const g = grid[m.id] || { days: Array.from({ length: 7 }, () => ({ rows: [], mins: 0 })), total: 0, mins: 0, unest: 0 };
            const cap = hours ? weekCapMin : (Number(m.capacity) || 0);
            const used = hours ? g.mins : g.total;
            const tone = loadTone(used, cap);
            const pct = cap ? Math.min(100, Math.round(used / cap * 100)) : 0;
            return h`<${Fragment} key=${m.id}>
              <div class="cv-wlmem" role="rowheader">
                <${MemberAvatar} member=${m} size=${26}/>
                <div style=${{ minWidth: 0 }}>
                  <div style=${{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${m.name}</div>
                  <div class="cv-loc">${hours ? fmtMinutes(weekCapMin) + ' this week' : (Number(m.capacity) ? 'Capacity ' + m.capacity + '/wk' : 'No capacity set')}</div>
                </div>
              </div>
              ${g.days.map((c, di) => {
                const d = days[di];
                const capD = dayCapMin(d);
                const ctone = hours ? (capD ? loadTone(c.mins, capD) : (c.mins ? 'over' : null)) : null;
                const k = m.id + ':' + di;
                return h`<div key=${di} role="gridcell"
                    class=${'cv-wlcell' + (hours && !capD ? ' off' : '') + (ctone ? ' t-' + ctone : '') + (over === k ? ' drop' : '')}
                    onDragOver=${(ev) => { if (!dragRef.current) return; ev.preventDefault(); if (over !== k) setOver(k); }}
                    onDragLeave=${(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget) && over === k) setOver(null); }}
                    onDrop=${(ev) => onCellDrop(ev, m.id, di)}>
                  <button type="button" class=${'cv-wlsum' + (c.rows.length ? ' has' : '')} disabled=${!c.rows.length}
                    aria-label=${m.name + ', ' + dowLabel(d) + ': ' + c.rows.length + ' tasks' + (c.mins ? ', ' + fmtMinutes(c.mins) : '')}
                    onClick=${(ev) => setCellPop({ anchor: ev.currentTarget, key: m.id, di })}>
                    ${hours
                      ? (c.mins > 0 ? h`<b>${fmtMinutes(c.mins)}</b>` : c.rows.length ? h`<b>0h</b>` : h`<span class="cv-empty-cell">·</span>`)
                      : (c.rows.length ? h`<b>${c.rows.length}</b>` : h`<span class="cv-empty-cell">·</span>`)}
                    ${hours ? (capD ? h`<small>/ ${fmtMinutes(capD)}</small>` : null) : (c.mins > 0 ? h`<small>${fmtMinutes(c.mins)}</small>` : null)}
                  </button>
                  ${c.rows.slice(0, 3).map(r => chip(r, m.id))}
                  ${c.rows.length > 3 && h`<button type="button" class="cv-meta" onClick=${(ev) => setCellPop({ anchor: ev.currentTarget, key: m.id, di })}>+${c.rows.length - 3} more</button>`}
                </div>`;
              })}
              <div class="cv-wltot" role="gridcell">
                <div style=${{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 12.5 }}>
                  <b class=${tone ? 'cv-tone-' + tone : ''}>${hours ? (g.mins ? fmtMinutes(g.mins) : '0h') : g.total}${cap ? ' / ' + (hours ? fmtMinutes(cap) : cap) : ''}</b>
                  ${hours
                    ? (g.unest > 0 ? h`<span class="cv-loc" title="Tasks without a time estimate">${g.unest} no est.</span>` : null)
                    : (g.mins > 0 ? h`<span class="cv-loc">${fmtMinutes(g.mins)}</span>` : null)}
                </div>
                ${cap > 0 && h`<div class="cv-meter" role="meter" aria-valuemin=${0} aria-valuemax=${cap} aria-valuenow=${used}><i style=${{ width: pct + '%', background: 'var(--cv-' + (tone || 'ok') + ')' }}></i></div>`}
              </div>
            <//>`;
          })}
        </div>
        ${cellPop && h`<${Popover} anchor=${cellPop.anchor} open=${true} onClose=${() => setCellPop(null)} width=${280}>
          <div class="cv-pop">
            <div class="cv-pop-h">${dowLabel(days[cellPop.di])} ${days[cellPop.di].getDate()} · ${popRows.length} task${popRows.length === 1 ? '' : 's'}</div>
            <div style=${{ maxHeight: 300, overflowY: 'auto' }}>
              ${popRows.map(r => h`<button type="button" key=${r.id} class="cv-mi" draggable="true"
                onDragStart=${(ev) => onChipDragStart(ev, r, cellPop.key)} onDragEnd=${onChipDragEnd}
                onClick=${() => { setCellPop(null); openTask(r.id); }}>
                <${StatusIcon} category=${r.status_category} color=${r.status_color} size=${14}/>
                <span style=${{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${r.title}</span>
                ${r.estimate_minutes ? h`<span class="cv-loc">${fmtMinutes(r.estimate_minutes)}</span>` : null}
              </button>`)}
            </div>
          </div>
        <//>`}
      </div>`;
    }

    // =========================================================================
    // TIMELINE mode — start→due bars in lanes (people / clients / lists)
    // =========================================================================
    const TL_ROW = 30;
    function TimelineMode({ vc, rows }) {
      const zoom = GANTT_PX[vc.cfg.gantt_zoom] ? vc.cfg.gantt_zoom : 'week';
      const px = GANTT_PX[zoom];
      const laneBy = ['assignee', 'client', 'list'].includes(vc.cfg.timeline_lane) ? vc.cfg.timeline_lane : 'assignee';
      const rootRef = useRef(null);
      const bd = useBarDrag(px, vc);
      const today = sod(new Date());
      const dated = useMemo(() => rows.filter(r => r.start_at || r.due_at), [rows]);
      const undatedCount = rows.length - dated.length;
      const range = useMemo(() => computeRange(dated, zoom, today), [dated, zoom, PREF.weekStart]);
      const width = range.days * px;
      const xOf = (d) => dayDiff(range.start, d) * px;
      const ticks = useMemo(() => computeTicks(range, zoom, px), [range, zoom, px, PREF.weekStart]);
      const weekends = useMemo(() => computeWeekends(range, zoom, px), [range, zoom, px]);

      const didInit = useRef(false);
      useEffect(() => {
        if (didInit.current || !dated.length) return;
        didInit.current = true;
        setTimeout(() => {
          const host = rootRef.current && rootRef.current.closest('.cv-body');
          if (host) host.scrollLeft = Math.max(0, xOf(today) + GANTT_NAME_W - host.clientWidth / 2);
        }, 0);
      }, [dated.length]);

      const lanes = useMemo(() => {
        const map = new Map();
        const add = (key, mk, r) => { let l = map.get(key); if (!l) { l = { key, rows: [], ...mk() }; map.set(key, l); } l.rows.push(r); };
        dated.forEach(r => {
          if (laneBy === 'assignee') {
            const as = r.assignees || [];
            if (!as.length) add('__none', () => ({ label: 'Unassigned', rank: 2 }), r);
            as.forEach(a => add(a.id, () => {
              const m = (vc.store.memberById && vc.store.memberById[a.id]) || a;
              return { label: m.name || 'Member', avatar: m, rank: a.id === (vc.me && vc.me.id) ? 0 : 1 };
            }, r));
          } else if (laneBy === 'client') {
            add(r.client_id || '__agency', () => r.client_id
              ? { label: r.client_name || 'Client', color: r.client_color || '#87909e', rank: 1 }
              : { label: 'Agency', color: '#5c5c66', rank: 0 }, r);
          } else {
            add(r.list_id || '__none', () => ({ label: r.list_name || 'No list', sub: r.client_name || 'Agency', rank: 1 }), r);
          }
        });
        return Array.from(map.values()).sort((a, b) => a.rank - b.rank || cmpStr(a.label, b.label)).map(l => {
          const tracks = [];
          const placed = l.rows.slice()
            .sort((a, b) => Date.parse(a.start_at || a.due_at) - Date.parse(b.start_at || b.due_at))
            .map(r => {
              const s = dayDiff(range.start, r.start_at || r.due_at);
              const e2 = Math.max(s, dayDiff(range.start, r.due_at || r.start_at));
              let t = tracks.findIndex(end => end < s);
              if (t < 0) { t = tracks.length; tracks.push(e2); } else tracks[t] = e2;
              return { row: r, track: t };
            });
          return { ...l, placed, height: Math.max(1, tracks.length) * TL_ROW + 12 };
        });
      }, [dated, laneBy, range, vc.store.memberById]);

      const barAt = (r, track, laneKey) => {
        const { on, startOff, endOff } = bd.offsets(r);
        const both = !!(r.start_at && r.due_at);
        const s = addDays(sod(r.start_at || r.due_at), both ? startOff : endOff);
        const d = addDays(sod(r.due_at || r.start_at), endOff);
        const left = xOf(s), w = Math.max(px, (dayDiff(s, d) + 1) * px);
        const crit = vc.feat('dependencies') && Number(r.blocked_by_open) > 0 ? ' crit' : '';
        const handlers = bd.handlersFor(r);
        const label = r.title + ' · ' + (r.start_at ? fmtShort(r.start_at) + ' → ' : 'due ') + fmtShort(r.due_at || r.start_at);
        const style = { left, width: w, top: 6 + track * TL_ROW, background: r.status_color || '#87909e' };
        if (vc.cursorId === r.id) { style.outline = '2px solid var(--cu-accent,#ff00ee)'; style.outlineOffset = '1px'; }
        return h`<div key=${laneKey + ':' + r.id} data-row-id=${r.id} class=${'cv-bar' + (on ? ' dragging' : '') + crit} style=${style}
            title=${label} role="button" tabIndex=${0} aria-label=${label}
            onPointerDown=${(ev) => bd.onBarDown(ev, r, 'move')} ...${handlers} onKeyDown=${(ev) => ev.key === 'Enter' && openTask(r.id)}>
          <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis' }}>${w >= 48 ? r.title : ''}</span>
          ${both && h`<span class="cv-hdl" aria-label="Drag to change due date" onPointerDown=${(ev) => bd.onBarDown(ev, r, 'end')} ...${handlers}></span>`}
        </div>`;
      };

      const laneLabel = laneBy === 'assignee' ? 'Person' : laneBy === 'client' ? 'Client' : 'List';
      return h`<div class="cv-gantt" ref=${rootRef} style=${{ width: GANTT_NAME_W + width }}>
        <div class="cv-gbar-top" style=${{ width: 'min(100%, 100vw)' }}>
          <div class="cv-seg" role="group" aria-label="Group lanes by">
            ${[['assignee', 'People', 'ti-user'], ['client', 'Clients', 'ti-building'], ['list', 'Lists', 'ti-list-details']].map(([k, l, ic]) =>
              h`<button type="button" key=${k} class=${'cv-btn' + (laneBy === k ? ' on' : '')} aria-pressed=${laneBy === k} onClick=${() => vc.setCfg({ timeline_lane: k })}><i class=${'ti ' + ic}></i><span class="cv-hide-sm">${l}</span></button>`)}
          </div>
          <div class="cv-seg" role="group" aria-label="Zoom">
            ${['day', 'week', 'month'].map(z => h`<button type="button" key=${z} class=${'cv-btn' + (zoom === z ? ' on' : '')} aria-pressed=${zoom === z} onClick=${() => vc.setCfg({ gantt_zoom: z })}>${z[0].toUpperCase() + z.slice(1)}</button>`)}
          </div>
          <button type="button" class="cv-btn" onClick=${() => { const host = rootRef.current && rootRef.current.closest('.cv-body'); if (host) host.scrollLeft = Math.max(0, xOf(today) + GANTT_NAME_W - host.clientWidth / 2); }}><i class="ti ti-target"></i>Today</button>
          <span class="cv-sp"></span>
          ${undatedCount > 0 && h`<span class="cv-loc">${undatedCount} task${undatedCount === 1 ? '' : 's'} without dates hidden</span>`}
        </div>
        ${dated.length === 0
          ? h`<div style=${{ padding: 32, position: 'sticky', left: 0, maxWidth: 560 }}>
              <${EmptyState} icon="ti-timeline-event" title="Nothing on the timeline" sub=${vc.hasFilters ? 'No tasks match the current filters.' : 'Give tasks a start or due date to see them here.'}
                action=${vc.hasFilters ? h`<button type="button" class="cv-btn" onClick=${vc.clearFilters}>Clear filters</button>` : h`<button type="button" class="cv-pri" onClick=${() => vc.createTask()}><i class="ti ti-plus"></i>Add Task</button>`}/>
            </div>`
          : h`<${Fragment}>
            <div class="cv-ghead">
              <div class="cv-gname">${laneLabel}</div>
              <div class="cv-gscale" style=${{ width }}>
                ${ticks.big.map((t, i) => h`<div key=${'b' + i} class="cv-gtick big" style=${{ left: t.x, width: 260 }}>${t.label}</div>`)}
                ${ticks.small.map((t, i) => h`<div key=${'s' + i} class="cv-gtick" style=${{ left: t.x, width: t.w || 60 }}>${t.label}</div>`)}
              </div>
            </div>
            <div style=${{ position: 'relative' }}>
              <div aria-hidden="true" style=${{ position: 'absolute', left: GANTT_NAME_W, top: 0, bottom: 0, width, pointerEvents: 'none' }}>
                ${weekends.map((x, i) => h`<div key=${i} class="cv-gwkend" style=${{ left: x, width: 2 * px }}></div>`)}
                <div class="cv-gtoday" style=${{ left: xOf(today) + px / 2 - 1 }}></div>
              </div>
              ${lanes.map(l => h`<div key=${l.key} class="cv-tl-lane" style=${{ height: l.height }}>
                <div class="cv-gname" style=${{ height: l.height }}>
                  ${l.avatar
                    ? h`<${MemberAvatar} member=${l.avatar} size=${22}/>`
                    : h`<span style=${{ width: 10, height: 10, borderRadius: 3, marginTop: 5, flexShrink: 0, background: l.color || 'var(--cu-bd2,#d6d6db)' }}></span>`}
                  <div style=${{ minWidth: 0 }}>
                    <div style=${{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${l.label}</div>
                    <div class="cv-loc">${l.sub ? l.sub + ' · ' : ''}${l.rows.length} task${l.rows.length === 1 ? '' : 's'}</div>
                  </div>
                </div>
                <div class="cv-tl-track" style=${{ width, height: l.height }}>${l.placed.map(p => barAt(p.row, p.track, l.key))}</div>
              </div>`)}
            </div>
          <//>`}
      </div>`;
    }

    // =========================================================================
    // ACTIVITY mode — task_activity_feed (093), fail-open
    // =========================================================================
    const ACT_FILTERS = [
      { key: 'all', label: 'All', kinds: null },
      { key: 'status', label: 'Status', kinds: ['status'] },
      { key: 'comment', label: 'Comments', kinds: ['comment'] },
      { key: 'people', label: 'Assignees', kinds: ['assignee_add', 'assignee_remove'] },
      { key: 'dates', label: 'Dates', kinds: ['due', 'start'] },
      { key: 'created', label: 'Created', kinds: ['created', 'subtask', 'archived'] },
    ];
    const unq = (v) => {
      if (v == null) return '';
      if (typeof v === 'object') { try { return JSON.stringify(v); } catch (_) { return ''; } }
      const s = String(v);
      return /^".*"$/.test(s) ? s.slice(1, -1) : s;
    };
    function ActivityText({ it, store }) {
      const from = unq(it.from_val), to = unq(it.to_val);
      const stPill = (key) => {
        if (!key) return h`<b>none</b>`;
        const s = (store.statuses || []).find(x => x.key === key);
        const c = (s && s.color) || '#87909e';
        return h`<span class="cv-spill" style=${{ background: c + '1f', color: c }}>${(s && s.name) || String(key).replace(/_/g, ' ')}</span>`;
      };
      const person = (v) => { const m = store.memberById && store.memberById[v]; return h`<b>${m ? m.name : (v || 'someone')}</b>`; };
      const when = (v) => { const t = Date.parse(v); return isNaN(t) ? v : fmtShort(v); };
      switch (it.kind) {
        case 'created': return h`<span>created this task</span>`;
        case 'status': return h`<span>changed status from ${stPill(from)} to ${stPill(to)}</span>`;
        case 'priority': { const p = priMeta(Number(to)); return p ? h`<span>set priority to <b style=${{ color: p.color }}>${p.label}</b></span>` : h`<span>cleared the priority</span>`; }
        case 'assignee_add': return h`<span>assigned ${person(to)}</span>`;
        case 'assignee_remove': return h`<span>unassigned ${person(from || to)}</span>`;
        case 'due': return to ? h`<span>set the due date to <b>${when(to)}</b></span>` : h`<span>removed the due date</span>`;
        case 'start': return to ? h`<span>set the start date to <b>${when(to)}</b></span>` : h`<span>removed the start date</span>`;
        case 'title': return h`<span>renamed the task to <b>${to}</b></span>`;
        case 'description': return h`<span>updated the description</span>`;
        case 'estimate': return h`<span>set the estimate to <b>${to ? fmtMinutes(Number(to)) : 'none'}</b></span>`;
        case 'moved': return h`<span>moved the task${it.meta && it.meta.list_name ? ' to ' + it.meta.list_name : ''}</span>`;
        case 'tag': return h`<span>updated tags</span>`;
        case 'field': return h`<span>updated a custom field</span>`;
        case 'checklist': return h`<span>updated a checklist</span>`;
        case 'attachment': return h`<span>added an attachment${to ? ' ' + to : ''}</span>`;
        case 'subtask': return h`<span>added a subtask${to ? ': ' + to : ''}</span>`;
        case 'comment': return h`<span>commented${to ? h`<span class="cv-act-q">${to.length > 280 ? to.slice(0, 280) + '…' : to}</span>` : ''}</span>`;
        case 'archived': return h`<span>archived the task</span>`;
        case 'type': return h`<span>changed the type to <b>${typeMeta(to).label}</b></span>`;
        case 'watch': return h`<span>started watching</span>`;
        default: return h`<span>${String(it.kind || 'updated').replace(/_/g, ' ')}${to ? ' ' + to : ''}</span>`;
      }
    }
    const feedState = { missing: false };
    function ActivityMode({ vc }) {
      const [items, setItems] = useState(null);
      const [err, setErr] = useState(null);
      const [missing, setMissing] = useState(feedState.missing);
      const [limit, setLimit] = useState(100);
      const [fkey, setFkey] = useState('all');
      const [busy, setBusy] = useState(false);
      const sc = vc.scope, meId = vc.me && vc.me.id;
      const qIds = vc.quickAssignees || [];
      const qKey = qIds.join(',');
      const fjson = useMemo(() => {
        const f = { limit };
        if (sc.type === 'client' && sc.clientId) f.client_id = sc.clientId;
        if (sc.type === 'list' && sc.listId) f.list_id = sc.listId;
        if ((sc.type === 'my' || sc.type === 'home') && meId) f.member_id = meId;
        if (qIds.length === 1) f.member_id = qIds[0];
        return JSON.stringify(f);
      }, [sc.type, sc.clientId, sc.listId, meId, limit, qKey]);
      const load = useCallback(async () => {
        if (feedState.missing) { setMissing(true); return; }
        setBusy(true);
        try {
          const res = await rpc('task_activity_feed', { p_filter: JSON.parse(fjson) });
          setItems(Array.isArray(res) ? res : []); setErr(null);
        } catch (e) {
          if (isMissingRpc(e)) { feedState.missing = true; setMissing(true); }
          else setErr(errMsg(e));
        }
        setBusy(false);
      }, [fjson]);
      useEffect(() => { load(); }, [load]);
      useEffect(() => {
        if (missing) return;
        let t = null;
        const soon = () => { clearTimeout(t); t = setTimeout(load, 1500); };
        const offs = taskBus && taskBus.on ? [taskBus.on('task:changed', soon), taskBus.on('task:created', soon), taskBus.on('task:deleted', soon)] : [];
        const iv = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
        return () => { clearTimeout(t); clearInterval(iv); offs.forEach(off => typeof off === 'function' && off()); };
      }, [load, missing]);

      const shown = useMemo(() => {
        const f = ACT_FILTERS.find(x => x.key === fkey);
        let xs = items || [];
        if (f && f.kinds) xs = xs.filter(it => f.kinds.includes(it.kind));
        if (sc.type === 'agency') xs = xs.filter(it => !it.client_name);
        if (qIds.length > 1) {
          const names = qIds.map(id => (vc.store.memberById && vc.store.memberById[id] || {}).name).filter(Boolean);
          xs = xs.filter(it => names.includes(it.actor_name));
        }
        return xs;
      }, [items, fkey, sc.type, qKey, vc.store.memberById]);

      if (missing) {
        return h`<div style=${{ padding: 32 }}><${EmptyState} icon="ti-activity" title="Activity feed isn’t available yet"
          sub="It switches on once the workspace database update (migration 093) has been applied."/></div>`;
      }
      if (err && !items) {
        return h`<div style=${{ padding: 32 }}><${EmptyState} icon="ti-alert-triangle" title="Couldn’t load activity" sub=${err}
          action=${h`<button type="button" class="cv-btn" onClick=${load}>Try again</button>`}/></div>`;
      }
      if (!items) return h`<div class="cv-loading">${[0, 1, 2, 3, 4].map(i => h`<div key=${i} style=${{ marginBottom: 10 }}><${Skel} h=${44}/></div>`)}</div>`;
      const dayLabel = (iso) => {
        const d = sod(iso), t = sod(new Date()), diff = dayDiff(d, t);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: d.getFullYear() !== t.getFullYear() ? 'numeric' : undefined });
      };
      let lastDay = null;
      return h`<div class="cv-act">
        <div class="cv-seg" style=${{ flexWrap: 'wrap', padding: '10px 0 2px', gap: 4, display: 'flex', alignItems: 'center' }} role="group" aria-label="Activity type">
          ${ACT_FILTERS.map(f => h`<button type="button" key=${f.key} class=${'cv-btn' + (fkey === f.key ? ' on' : '')} aria-pressed=${fkey === f.key} onClick=${() => setFkey(f.key)}>${f.label}</button>`)}
          <span class="cv-sp"></span>
          <button type="button" class="cv-btn icon ghost" aria-label="Refresh activity" disabled=${busy} onClick=${load}><i class=${'ti ' + (busy ? 'ti-loader-2' : 'ti-refresh')}></i></button>
        </div>
        ${shown.length === 0 && h`<div style=${{ padding: 26 }}><${EmptyState} icon="ti-activity" title="Nothing here yet"
          sub=${fkey === 'all' ? 'Changes to tasks in this space will show up here.' : 'No activity of this type in the latest updates.'}/></div>`}
        ${shown.map(it => {
          const dl = dayLabel(it.created_at);
          const head = dl !== lastDay ? dl : null;
          lastDay = dl;
          const m = (vc.store.members || []).find(x => x.name === it.actor_name);
          return h`<${Fragment} key=${it.id}>
            ${head && h`<div class="cv-act-day">${head}</div>`}
            <div class="cv-act-it">
              <${MemberAvatar} member=${m || { name: it.actor_name || 'System', color: '#87909e' }} size=${26}/>
              <div class="cv-act-tx">
                <b>${it.actor_name || 'System'}</b> <${ActivityText} it=${it} store=${vc.store}/>
                <div style=${{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
                  <button type="button" class="cv-act-task" onClick=${() => it.task_id && openTask(it.task_id)}>${it.custom_id ? it.custom_id + ' · ' : ''}${it.task_title || 'Task'}</button>
                  ${it.client_name && h`<span class="cv-loc">${it.client_name}</span>`}
                </div>
              </div>
              <span class="cv-loc" style=${{ flexShrink: 0 }} title=${new Date(it.created_at).toLocaleString('en-IN')}>${relTime(it.created_at)}</span>
            </div>
          <//>`;
        })}
        ${items.length >= limit && limit < 500 && h`<div style=${{ textAlign: 'center', padding: 16 }}>
          <button type="button" class="cv-btn" disabled=${busy} onClick=${() => setLimit(l => Math.min(500, l + 100))}>Load more</button>
        </div>`}
      </div>`;
    }

    // =========================================================================
    // TEAM mode — member cards (in progress / overdue / done today / timer)
    // =========================================================================
    const presenceState = { missing: false, data: null };
    function usePresence() {
      const [data, setData] = useState(presenceState.data);
      useEffect(() => {
        if (presenceState.missing) return;
        let alive = true;
        const load = () => rpc('presence_list', {})
          .then(res => { presenceState.data = Array.isArray(res) ? res : []; if (alive) setData(presenceState.data); })
          .catch(e => { if (isMissingRpc(e)) presenceState.missing = true; });
        load();
        const iv = setInterval(() => { if (!presenceState.missing && document.visibilityState === 'visible') load(); }, 60000);
        return () => { alive = false; clearInterval(iv); };
      }, []);
      return useMemo(() => Object.fromEntries((data || []).map(p => [p.member_id, p])), [data]);
    }
    function TeamMode({ vc, rows }) {
      const presence = usePresence();
      const doneFilter = useMemo(() => ({
        ...baseFilterFor(vc.scope), status_categories: ['done'], include_closed: true, top_level: false, order: 'updated', limit: 400,
      }), [vc.scope.type, vc.scope.clientId, vc.scope.listId]);
      const done = useTasks(doneFilter, { pollMs: 120000 });
      const [tabs, setTabs] = useState({});
      const [, bump] = useState(0);
      useEffect(() => { const t = setInterval(() => bump(x => x + 1), 30000); return () => clearInterval(t); }, []);
      const today = sod(new Date());
      const meId = vc.me && vc.me.id;
      const timer = vc.store.runningTimer;
      const stats = useMemo(() => {
        const s = {};
        const get = (id) => s[id] || (s[id] = { active: [], overdue: [], today: [], done: [], open: 0, mins: 0 });
        rows.forEach(r => {
          if (isDone(r)) return;
          (r.assignees || []).forEach(a => {
            const x = get(a.id);
            x.open++; x.mins += r.estimate_minutes || 0;
            if (r.status_category === 'active') x.active.push(r);
            if (isOverdue(r)) x.overdue.push(r);
            else if (r.due_at && sameDay(r.due_at, today)) x.today.push(r);
          });
        });
        (done.rows || []).forEach(r => {
          if (!r.completed_at || !sameDay(r.completed_at, today)) return;
          (r.assignees || []).forEach(a => get(a.id).done.push(r));
        });
        return s;
      }, [rows, done.rows, ymd(today)]);

      let members = (vc.store.members || []).filter(m => m.role_level !== 'client');
      if (vc.quickAssignees && vc.quickAssignees.length) members = members.filter(m => vc.quickAssignees.includes(m.id));
      if (['client', 'list', 'agency'].includes(vc.scope.type)) { const busy = members.filter(m => stats[m.id]); if (busy.length) members = busy; }
      members = members.slice().sort((a, b) => ((stats[b.id] || {}).open || 0) - ((stats[a.id] || {}).open || 0) || cmpStr(a.name, b.name));

      if (!members.length) {
        return h`<div style=${{ padding: 32 }}><${EmptyState} icon="ti-users-group" title="Nobody to show here"
          sub=${vc.hasFilters ? 'No teammates match the current filters.' : 'Team shows each teammate’s live workload.'}/></div>`;
      }
      return h`<div class="cv-team">
        ${members.map(m => {
          const st = stats[m.id] || { active: [], overdue: [], today: [], done: [], open: 0, mins: 0 };
          const p = presence[m.id];
          const dnd = !!(p && p.dnd_until && Date.parse(p.dnd_until) > Date.now());
          const which = tabs[m.id] || (st.overdue.length ? 'overdue' : 'active');
          const list = which === 'done' ? st.done : which === 'overdue' ? st.overdue : st.active;
          const cap = Number(m.capacity) || 0;
          const mt = m.id === meId && timer ? timer : null;
          const status = (p && (p.status_emoji || p.status_text)) ? ((p.status_emoji || '') + ' ' + (p.status_text || '')).trim()
            : (m.presence && m.presence.text) ? ((m.presence.emoji || '') + ' ' + m.presence.text).trim()
            : String(m.role_level || '').replace(/_/g, ' ');
          const statBtn = (k, label, n, tone) => h`<button type="button" class=${'cv-tstat' + (which === k ? ' on' : '')} aria-pressed=${which === k}
            onClick=${() => setTabs(t => ({ ...t, [m.id]: k }))}><b class=${tone && n ? 'cv-tone-' + tone : ''}>${n}</b>${label}</button>`;
          return h`<article key=${m.id} class="cv-tcard" aria-label=${m.name}>
            <div class="cv-tcard-hd">
              <span class="cv-online">
                <${MemberAvatar} member=${m} size=${34}/>
                ${p ? h`<i class=${dnd ? 'dnd' : p.online ? 'on' : ''} title=${dnd ? 'Do not disturb' : p.online ? 'Online now' : 'Last active ' + relTime(p.last_active_at)}></i>` : null}
              </span>
              <div style=${{ minWidth: 0, flex: 1 }}>
                <div style=${{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${m.name}</div>
                <div class="cv-loc" style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${status || 'Team member'}</div>
              </div>
              <div style=${{ textAlign: 'right', flexShrink: 0 }}>
                <div style=${{ fontWeight: 600 }} class=${cap ? 'cv-tone-' + (loadTone(st.open, cap) || 'ok') : ''}>${st.open}${cap ? ' / ' + cap : ''}</div>
                <div class="cv-loc">open${st.today.length ? ' · ' + st.today.length + ' today' : ''}</div>
              </div>
            </div>
            ${mt && h`<button type="button" class="cv-timer" onClick=${() => mt.task_id && openTask(mt.task_id)}>
              <i class="ti ti-player-record-filled"></i>
              <span style=${{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${mt.task_title || 'Timer running'}</span>
              <b>${fmtMinutes(Math.max(1, Math.round((Date.now() - Date.parse(mt.started_at)) / 60000)))}</b>
            </button>`}
            <div class="cv-tstats">
              ${statBtn('active', 'In progress', st.active.length, null)}
              ${statBtn('overdue', 'Overdue', st.overdue.length, 'over')}
              ${statBtn('done', 'Done today', st.done.length, 'ok')}
            </div>
            <div class="cv-tlist">
              ${list.length === 0 && h`<div class="cv-loc" style=${{ padding: '10px 6px' }}>${which === 'done' ? 'Nothing completed yet today.' : which === 'overdue' ? 'Nothing overdue.' : 'Nothing in progress.'}</div>`}
              ${list.slice(0, 25).map(r => h`<button type="button" key=${r.id} class="cv-mi" onClick=${() => openTask(r.id)}>
                <${StatusIcon} category=${r.status_category} color=${r.status_color} size=${14}/>
                <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${r.title}</span>
                ${r.due_at && which !== 'done' ? h`<${DueChip} row=${r}/>` : null}
              </button>`)}
            </div>
          </article>`;
        })}
      </div>`;
    }

    // =========================================================================
    // EMBED mode — allow-listed, sandboxed iframe
    // =========================================================================
    function EmbedMode({ vc }) {
      const url = vc.cfg.embed_url || '';
      const info = useMemo(() => (url ? sanitizeEmbed(url) : null), [url]);
      const [editing, setEditing] = useState(!url);
      const [draft, setDraft] = useState(url);
      const [err, setErr] = useState(null);
      const [nonce, setNonce] = useState(0);
      useEffect(() => { setDraft(url); setEditing(!url); setErr(null); }, [url]);
      const submit = (ev) => {
        if (ev) ev.preventDefault();
        const r = sanitizeEmbed(draft);
        if (!r.ok) { setErr(r.error); return; }
        setErr(null); setEditing(false);
        vc.persistCfg({ embed_url: r.original });
      };
      if (editing || !info || !info.ok) {
        const shownErr = err || (!editing && info && !info.ok ? info.error : null);
        return h`<form class="cv-embed-form" onSubmit=${submit}>
          <div style=${{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i class="ti ti-world-www" style=${{ fontSize: 22, color: 'var(--cu-accent-ink,#a8009c)' }}></i>
            <b style=${{ fontSize: 15 }}>Embed a page in this view</b>
          </div>
          <div class="cv-note">Paste a link (or an iframe embed code). It opens in a sandboxed frame — only secure https links are allowed.</div>
          <input class="cv-in" style=${{ height: 34, fontSize: 13 }} autoFocus aria-label="Link to embed" placeholder="https://docs.google.com/…"
            value=${draft} onChange=${e => { setDraft(e.target.value); setErr(null); }}/>
          ${shownErr && h`<div class="cv-err" role="alert">${shownErr}</div>`}
          <div class="cv-prov">
            ${EMBED_PROVIDERS.map(([l, ic]) => h`<span key=${l}><i class=${'ti ' + ic}></i>${l}</span>`)}
            <span><i class="ti ti-world"></i>Any https page</span>
          </div>
          <div style=${{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            ${url && info && info.ok && h`<button type="button" class="cv-btn" onClick=${() => { setEditing(false); setDraft(url); setErr(null); }}>Cancel</button>`}
            <button type="submit" class="cv-pri" disabled=${!draft.trim()}>Embed page</button>
          </div>
        </form>`;
      }
      return h`<div class="cv-embed">
        <div class="cv-embed-bar cv-noprint">
          <i class=${'ti ' + info.provider.icon} style=${{ fontSize: 16, color: 'var(--cu-t2,#5c5c66)' }}></i>
          <b style=${{ fontSize: 13 }}>${info.provider.label}</b>
          <span class="cv-loc" style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }} title=${info.original}>${info.original}</span>
          <span class="cv-sp"></span>
          ${info.generic && h`<span class="cv-loc cv-hide-sm">Blank frame? The site may block embedding.</span>`}
          <button type="button" class="cv-btn icon" aria-label="Reload embed" onClick=${() => setNonce(n => n + 1)}><i class="ti ti-refresh"></i></button>
          <a class="cv-btn" href=${info.original} target="_blank" rel="noopener noreferrer"><i class="ti ti-external-link"></i><span class="cv-hide-sm">Open</span></a>
          <button type="button" class="cv-btn" onClick=${() => setEditing(true)}><i class="ti ti-link"></i><span class="cv-hide-sm">Change link</span></button>
        </div>
        <iframe key=${nonce} src=${info.src} title=${vc.title || 'Embedded page'} sandbox=${info.sandbox}
          allow=${info.allow || undefined} referrerPolicy=${info.referrer} loading="lazy" allowFullScreen=${true}></iframe>
      </div>`;
    }

    // =========================================================================
    // MIND MAP mode — task → subtask tree, collapsible, create children
    // =========================================================================
    function MmAdd({ vc, defaults, onDone }) {
      const [t, setT] = useState('');
      const [busy, setBusy] = useState(false);
      const save = async () => {
        const title = t.trim();
        if (!title) { onDone(false); return; }
        setBusy(true);
        try { await TaskAPI.create({ ...(defaults || {}), title }); setT(''); onDone(true); }
        catch (e) { vc.toast('Could not create task: ' + errMsg(e)); }
        setBusy(false);
      };
      return h`<div class="cv-mm-node cv-mm-add">
        <input class="cv-qa" style=${{ minWidth: 180, height: 26 }} autoFocus aria-label="New task name" placeholder="Task name, Enter to add"
          value=${t} disabled=${busy} onChange=${e => setT(e.target.value)}
          onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') onDone(false); }}
          onBlur=${() => { if (!t.trim() && !busy) onDone(false); }}/>
      </div>`;
    }
    function MmChildren({ parent, vc, depth, open, toggle, adding, setAdding }) {
      const [kids, setKids] = useState(null);
      const load = useCallback(async () => {
        try {
          const res = await TaskAPI.query({ parent_id: parent.id, top_level: false, include_closed: !!vc.cfg.show_closed, order: 'position', limit: 300 });
          setKids((res && res.rows) || []);
        } catch (e) { setKids([]); vc.toast(errMsg(e)); }
      }, [parent.id, vc.cfg.show_closed]);
      useEffect(() => { load(); }, [load, parent.subtask_count, parent.subtask_done_count]);
      useEffect(() => {
        if (!taskBus || !taskBus.on) return;
        const offs = [
          taskBus.on('task:created', p => { if (p && p.row && p.row.parent_id === parent.id) load(); }),
          taskBus.on('task:changed', p => { if (p && p.row && p.row.parent_id === parent.id) setKids(ks => (ks || []).map(k => k.id === p.row.id ? { ...k, ...p.row } : k)); }),
          taskBus.on('task:deleted', p => { if (p) setKids(ks => ks ? ks.filter(k => k.id !== p.id) : ks); }),
        ];
        return () => offs.forEach(off => typeof off === 'function' && off());
      }, [parent.id, load]);
      const isAdding = adding === parent.id;
      if (kids === null) return h`<div class="cv-mm-kids"><div class="cv-mm-kid"><span class="cv-loc">Loading…</span></div></div>`;
      if (!kids.length && !isAdding) return null;
      return h`<div class="cv-mm-kids">
        ${kids.map(k => h`<div key=${k.id} class="cv-mm-kid">
          <${MmTask} row=${k} vc=${vc} depth=${depth} open=${open} toggle=${toggle} adding=${adding} setAdding=${setAdding}/>
        </div>`)}
        ${isAdding && h`<div class="cv-mm-kid">
          <${MmAdd} vc=${vc} defaults=${{ parent_id: parent.id, list_id: parent.list_id, client_id: parent.client_id || undefined }}
            onDone=${(ok) => { if (ok) load(); else setAdding(null); }}/>
        </div>`}
      </div>`;
    }
    function MmTask({ row, vc, depth, open, toggle, adding, setAdding }) {
      const hasKids = (row.subtask_count || 0) > 0;
      const isOpen = open.has(row.id);
      const showKids = (isOpen && hasKids) || adding === row.id;
      return h`<div class="cv-mm-branch">
        <div class="cv-mm-node" data-row-id=${row.id} style=${vc.cursorId === row.id ? { boxShadow: '0 0 0 2px var(--cu-accent,#ff00ee)' } : null}>
          <${StatusMenu} row=${row} vc=${vc} size=${14}/>
          <button type="button" class="cv-title" title=${row.title} onClick=${() => openTask(row.id)}
            style=${isDone(row) ? { color: 'var(--cu-t3,#8e8e99)', textDecoration: 'line-through' } : null}>${row.title || 'Untitled'}</button>
          <${RowBadges} row=${row} vc=${vc}/>
          ${(row.assignees || []).length > 0 && h`<${AssigneeStack} assignees=${row.assignees} max=${2} size=${18}/>`}
          ${hasKids && h`<button type="button" class="cv-meta" aria-expanded=${isOpen}
            aria-label=${(isOpen ? 'Collapse ' : 'Expand ') + row.subtask_count + ' subtasks'} onClick=${() => toggle(row.id)}>
            <i class=${'ti ' + (isOpen ? 'ti-minus' : 'ti-plus')}></i>${row.subtask_done_count || 0}/${row.subtask_count}</button>`}
          ${depth < 6 && h`<button type="button" class="cv-iconbtn" title="Add subtask" aria-label=${'Add a subtask to ' + row.title}
            onClick=${() => { if (hasKids && !isOpen) toggle(row.id); setAdding(row.id); }}><i class="ti ti-plus"></i></button>`}
        </div>
        ${showKids && h`<${MmChildren} parent=${row} vc=${vc} depth=${depth + 1} open=${open} toggle=${toggle} adding=${adding} setAdding=${setAdding}/>`}
      </div>`;
    }
    function MindMapMode({ vc, rows }) {
      const [open, setOpen] = useState(() => new Set());
      const [adding, setAdding] = useState(null);
      const [cap, setCap] = useState(150);
      const [zoom, setZoom] = useState(1);
      const toggle = useCallback((id) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
      const gb = ['status', 'list', 'assignee', 'priority'].includes(vc.cfg.mindmap_group) ? vc.cfg.mindmap_group : 'none';
      const groups = useMemo(() => buildGroups(rows, gb, { store: vc.store, now: new Date(), seedEmpty: false }), [rows, gb, vc.store]);
      const title = (vc.scope && vc.scope.title) || 'Tasks';
      const kidsOf = (list, prefix) => list.slice(0, cap).map(r => h`<div key=${prefix + r.id} class="cv-mm-kid">
        <${MmTask} row=${r} vc=${vc} depth=${1} open=${open} toggle=${toggle} adding=${adding} setAdding=${setAdding}/>
      </div>`);
      return h`<${Fragment}>
        <div class="cv-calbar cv-noprint">
          <span class="cv-loc">Branch by</span>
          <select class="cv-sel" aria-label="Branch by" value=${gb} onChange=${e => vc.setCfg({ mindmap_group: e.target.value })}>
            ${[['none', 'Nothing'], ['status', 'Status'], ['list', 'List'], ['assignee', 'Assignee'], ['priority', 'Priority']].map(([k, l]) => h`<option key=${k} value=${k}>${l}</option>`)}
          </select>
          <button type="button" class="cv-btn" disabled=${!open.size} onClick=${() => setOpen(new Set())}><i class="ti ti-fold"></i><span class="cv-hide-sm">Collapse all</span></button>
          <button type="button" class="cv-btn" onClick=${() => setOpen(new Set(rows.filter(r => (r.subtask_count || 0) > 0).slice(0, 60).map(r => r.id)))}>
            <i class="ti ti-fold-down"></i><span class="cv-hide-sm">Expand tasks</span></button>
          <span class="cv-sp"></span>
          <div class="cv-seg" role="group" aria-label="Zoom">
            <button type="button" class="cv-btn icon" aria-label="Zoom out" onClick=${() => setZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}><i class="ti ti-zoom-out"></i></button>
            <button type="button" class="cv-btn" onClick=${() => setZoom(1)}>${Math.round(zoom * 100)}%</button>
            <button type="button" class="cv-btn icon" aria-label="Zoom in" onClick=${() => setZoom(z => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))}><i class="ti ti-zoom-in"></i></button>
          </div>
        </div>
        <div class="cv-mm" style=${zoom !== 1 ? { transform: 'scale(' + zoom + ')' } : null}>
          <div class="cv-mm-branch">
            <div class="cv-mm-node root">
              <span>${title}</span>
              <span style=${{ opacity: .85, fontWeight: 500, fontSize: 12 }}>${rows.length}</span>
              <button type="button" class="cv-iconbtn" title="Add task" aria-label="Add a task" onClick=${() => setAdding('__root')}><i class="ti ti-plus"></i></button>
            </div>
            ${(rows.length > 0 || adding === '__root') && h`<div class="cv-mm-kids">
              ${gb === 'none' ? kidsOf(rows, '') : groups.map(g => h`<div key=${'g:' + g.key} class="cv-mm-kid">
                <div class="cv-mm-branch">
                  <div class="cv-mm-node grp">
                    ${g.avatar ? h`<${MemberAvatar} member=${g.avatar} size=${18}/>` : g.color ? h`<span style=${{ width: 10, height: 10, borderRadius: 3, background: g.color }}></span>` : null}
                    <b style=${{ fontSize: 12.5 }}>${g.label}</b><span class="cv-gcount">${g.rows.length}</span>
                  </div>
                  <div class="cv-mm-kids">${kidsOf(g.rows, g.key + ':')}</div>
                </div>
              </div>`)}
              ${adding === '__root' && h`<div class="cv-mm-kid">
                <${MmAdd} vc=${vc} defaults=${vc.presetFor(null)} onDone=${(ok) => { if (!ok) setAdding(null); }}/>
              </div>`}
            </div>`}
          </div>
          ${rows.length > cap && h`<div style=${{ marginTop: 14 }}><button type="button" class="cv-btn" onClick=${() => setCap(c => c + 150)}>Show more (${rows.length - cap})</button></div>`}
        </div>
      <//>`;
    }

    // =========================================================================
    // Registry views (AMS_EXT.views) — doc / form / dashboard / whiteboard …
    // =========================================================================
    function ExtViewMode({ vc, type, rows, loading, currentUser, reload }) {
      const def = extViews().find(v => v.key === type);
      if (!def) {
        return h`<div style=${{ padding: 32 }}><${EmptyState} icon="ti-puzzle" title="This view isn’t available here"
          sub="The module that provides it hasn’t loaded on this page yet."/></div>`;
      }
      const C = def.Component;
      return h`<${ExtBoundary} key=${type}>
        <${C} rows=${rows} loading=${loading} scope=${vc.scope} config=${vc.cfg} setConfig=${vc.persistCfg} store=${vc.store}
          currentUser=${currentUser} showToast=${vc.toast} openTask=${openTask} reload=${reload}/>
      <//>`;
    }

    // =========================================================================
    // CSV text for a row/column + import modal (tasks_import, 093)
    // =========================================================================
    function cellText(col, r, fieldById) {
      if (col.startsWith('cf:')) {
        const f = fieldById[col.slice(3)];
        if (!f) return '';
        const v = (r.custom_fields || {})[f.id];
        if (v == null || v === '') return '';
        const opts = Array.isArray(f.options) ? f.options : [];
        const lab = (id) => (opts.find(o => o.id === id) || {}).label || id;
        if (f.type === 'dropdown') return lab(v);
        if (f.type === 'labels') return (Array.isArray(v) ? v : [v]).map(lab).join(', ');
        if (f.type === 'checkbox') return v ? 'Yes' : 'No';
        if (f.type === 'date') return isoStamp(v, false);
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
      }
      switch (col) {
        case 'assignee': return (r.assignees || []).map(a => a.name).filter(Boolean).join(', ');
        case 'due': return isoStamp(r.due_at, !!r.due_at && r.due_has_time !== false);
        case 'start': return isoStamp(r.start_at, false);
        case 'priority': { const p = priMeta(r.priority); return p ? p.label : ''; }
        case 'status': return r.status_name || r.status || '';
        case 'comments': return String(r.comment_count || 0);
        case 'client': return r.client_name || 'Agency';
        case 'list': return r.list_name || '';
        case 'type': return typeMeta(r.type).label;
        case 'created': return isoStamp(r.created_at, false);
        case 'updated': return isoStamp(r.updated_at, false);
        case 'estimate': return r.estimate_minutes ? fmtMinutes(r.estimate_minutes) : '';
        case 'time': return r.time_spent_minutes ? fmtMinutes(r.time_spent_minutes) : '';
        case 'estimate_rollup': { const v = r.estimate_rollup_minutes != null ? r.estimate_rollup_minutes : r.estimate_minutes; return v ? fmtMinutes(v) : ''; }
        case 'time_rollup': { const v = r.time_rollup_minutes != null ? r.time_rollup_minutes : r.time_spent_minutes; return v ? fmtMinutes(v) : ''; }
        default: return '';
      }
    }
    const IMPORT_TARGETS = [
      ['', 'Don’t import'], ['title', 'Task name'], ['description', 'Description'], ['status', 'Status'], ['priority', 'Priority'],
      ['due_at', 'Due date'], ['start_at', 'Start date'], ['assignees', 'Assignees'], ['tags', 'Tags'], ['estimate_minutes', 'Time estimate'],
    ];
    function guessTarget(header, fields) {
      const s = String(header || '').trim().toLowerCase();
      const f = (fields || []).find(x => String(x.name).trim().toLowerCase() === s);
      if (f) return 'cf:' + f.name;
      if (/^(task ?)?(name|title)$|^task$|^subject$|^summary$/.test(s)) return 'title';
      if (/desc|details|^notes?$|brief/.test(s)) return 'description';
      if (/^status|stage/.test(s)) return 'status';
      if (/priority/.test(s)) return 'priority';
      if (/due|deadline|end ?date/.test(s)) return 'due_at';
      if (/start/.test(s)) return 'start_at';
      if (/assign|owner|responsible/.test(s)) return 'assignees';
      if (/^tags?$|^labels?$/.test(s)) return 'tags';
      if (/estimate|duration|effort|hours/.test(s)) return 'estimate_minutes';
      return '';
    }
    const importState = { missing: false };
    function ImportModal({ vc, defaultListId, onClose }) {
      const [step, setStep] = useState('pick');          // pick | map | running | done
      const [fileName, setFileName] = useState('');
      const [table, setTable] = useState(null);          // { headers, rows, truncated }
      const [map, setMap] = useState([]);
      const [listId, setListId] = useState(defaultListId || '');
      const [err, setErr] = useState(importState.missing ? 'Importing needs the latest workspace database update (migration 093).' : null);
      const [over, setOver] = useState(false);
      const [progress, setProgress] = useState({ done: 0, total: 0 });
      const [result, setResult] = useState(null);
      const inRef = useRef(null);
      const fields = vc.feat('custom_fields') ? (vc.store.fieldsFor ? (vc.store.fieldsFor(listId) || []) : (vc.store.fields || [])) : [];
      const lists = useMemo(() => (vc.store.lists || [])
        .filter(l => !l.archived && (l.system_key !== 'personal' || l.owner_id === (vc.me && vc.me.id)))
        .map(l => {
          const c = l.client_id && vc.store.clientById ? vc.store.clientById[l.client_id] : null;
          return { id: l.id, label: (c ? c.name : 'Agency') + ' › ' + l.name };
        })
        .sort((a, b) => cmpStr(a.label, b.label)), [vc.store.lists, vc.store.clientById]);
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && step !== 'running') { e.stopPropagation(); onClose(); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
      }, [step, onClose]);

      const readFile = (file) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { setErr('That file is larger than 5 MB.'); return; }
        const fr = new FileReader();
        fr.onload = () => {
          const parsed = parseCsv(fr.result);
          if (parsed.length < 2) { setErr('The file needs a header row and at least one task row.'); return; }
          const headers = parsed[0].map((x, i) => String(x).trim() || 'Column ' + (i + 1));
          const body = parsed.slice(1, 2001).map(r => headers.map((_, i) => (r[i] == null ? '' : String(r[i]))));
          const used = {};
          setMap(headers.map(hd => {
            let t = guessTarget(hd, fields);
            if (t && t !== 'tags' && t !== 'assignees' && used[t]) t = '';
            if (t) used[t] = 1;
            return t;
          }));
          setTable({ headers, rows: body, truncated: parsed.length - 1 > 2000 });
          setFileName(file.name); setErr(null); setStep('map');
        };
        fr.onerror = () => setErr('Couldn’t read that file.');
        fr.readAsText(file);
      };

      const buildRows = () => {
        const out = [], problems = [];
        table.rows.forEach((cells, i) => {
          const r = {}, cf = {};
          map.forEach((t, ci) => {
            if (!t) return;
            const raw = String(cells[ci] == null ? '' : cells[ci]).trim();
            if (!raw) return;
            if (t === 'title') r.title = raw.slice(0, 500);
            else if (t === 'description') r.description = raw;
            else if (t === 'status') r.status = raw;
            else if (t === 'priority') r.priority = /^[1-4]$/.test(raw) ? Number(raw) : raw.toLowerCase();
            else if (t === 'due_at' || t === 'start_at') {
              const iso = parseDateCell(raw);
              if (iso === undefined) problems.push({ row: i + 2, error: 'Unrecognised date “' + raw + '” — imported without it' });
              else if (iso) r[t] = iso;
            } else if (t === 'assignees' || t === 'tags') {
              r[t] = (r[t] || []).concat(raw.split(/[,;|]/).map(s => s.trim()).filter(Boolean));
            } else if (t === 'estimate_minutes') {
              const hoursCol = /hour|hrs|\bh\b/i.test(table.headers[ci] || '');
              const m = hoursCol && /^\d+(\.\d+)?$/.test(raw) ? Math.round(parseFloat(raw) * 60) : parseMinutes(raw);
              if (m != null) r.estimate_minutes = m;
            } else if (t.startsWith('cf:')) cf[t.slice(3)] = raw;
          });
          if (Object.keys(cf).length) r.custom_fields = cf;
          if (!r.title) { problems.push({ row: i + 2, error: 'No task name — row skipped' }); return; }
          r.__line = i + 2;
          out.push(r);
        });
        return { out, problems };
      };

      const run = async () => {
        if (!listId) { setErr('Choose a list to import into.'); return; }
        const { out, problems } = buildRows();
        if (!out.length) { setErr('No rows have a task name. Map a column to “Task name”.'); return; }
        setErr(null); setStep('running'); setProgress({ done: 0, total: out.length });
        let created = 0;
        const errors = problems.slice();
        for (let i = 0; i < out.length; i += 200) {
          const chunk = out.slice(i, i + 200);
          const payload = chunk.map(r => { const c = { ...r }; delete c.__line; return c; });
          try {
            const res = await rpc('tasks_import', { p_list_id: listId, p_rows: payload });
            created += Number(res && res.created) || 0;
            ((res && res.errors) || []).forEach(e2 => {
              const idx = Number(e2.row);
              const src = chunk[idx - 1] || chunk[idx] || null;
              errors.push({ row: src ? src.__line : null, error: (e2 && e2.error) || 'Failed' });
            });
          } catch (e) {
            if (isMissingRpc(e)) {
              importState.missing = true;
              setStep('map');
              setErr('Importing needs the latest workspace database update (migration 093). Ask an admin to apply it, then try again.');
              return;
            }
            if (e && e.code === 'forbidden') { setStep('map'); setErr('You don’t have permission to add tasks to that list.'); return; }
            chunk.forEach(c => errors.push({ row: c.__line, error: errMsg(e) }));
          }
          setProgress({ done: Math.min(out.length, i + 200), total: out.length });
        }
        setResult({ created, errors });
        setStep('done');
        if (created) { if (vc.reload) vc.reload(); if (taskBus && taskBus.emit) taskBus.emit('meta:changed'); }
      };

      const sample = (ci) => {
        for (const r of (table ? table.rows : [])) { if (String(r[ci] || '').trim()) return r[ci]; }
        return '';
      };
      const targets = IMPORT_TARGETS.concat(fields.map(f => ['cf:' + f.name, f.name + ' (field)']));
      const mappedTitle = map.includes('title');
      const n = table ? table.rows.length : 0;
      return h`<div class="cv-modal-bg" onMouseDown=${e => { if (e.target === e.currentTarget && step !== 'running') onClose(); }}>
        <div class="cv-modal" role="dialog" aria-modal="true" aria-label="Import tasks from CSV">
          <div class="cv-modal-hd">
            <i class="ti ti-file-import"></i><span style=${{ flex: 1 }}>Import tasks from CSV</span>
            <button type="button" class="cv-iconbtn" aria-label="Close" disabled=${step === 'running'} onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="cv-modal-bd">
            ${step === 'pick' && h`<${Fragment}>
              <div class=${'cv-drop' + (over ? ' on' : '')} role="button" tabIndex=${0}
                onClick=${() => inRef.current && inRef.current.click()}
                onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inRef.current && inRef.current.click(); } }}
                onDragOver=${e => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
                onDrop=${e => { e.preventDefault(); setOver(false); readFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
                <i class="ti ti-file-spreadsheet" style=${{ fontSize: 30, color: 'var(--cu-accent-ink,#a8009c)' }}></i>
                <div style=${{ fontWeight: 600, marginTop: 6 }}>Drop a .csv file here, or click to choose one</div>
                <div class="cv-note" style=${{ marginTop: 4 }}>Exports from Excel, Google Sheets, ClickUp, Asana or Trello all work. Up to 2,000 rows at a time.</div>
              </div>
              <input ref=${inRef} type="file" accept=".csv,text/csv,.tsv,text/tab-separated-values" style=${{ display: 'none' }}
                onChange=${e => { readFile(e.target.files && e.target.files[0]); e.target.value = ''; }}/>
            <//>`}
            ${step === 'map' && table && h`<${Fragment}>
              <div style=${{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <span class="cv-note"><i class="ti ti-file"></i> ${fileName} · ${n} row${n === 1 ? '' : 's'}${table.truncated ? ' (first 2,000)' : ''}</span>
                <span class="cv-sp"></span>
                <label class="cv-loc" for="cv-imp-list">Import into</label>
                <select id="cv-imp-list" class="cv-sel" style=${{ maxWidth: 320 }} value=${listId} onChange=${e => setListId(e.target.value)}>
                  <option value="">Choose a list…</option>
                  ${lists.map(l => h`<option key=${l.id} value=${l.id}>${l.label}</option>`)}
                </select>
              </div>
              <div style=${{ overflowX: 'auto' }}>
                <table class="cv-maptbl">
                  <thead><tr><th>Column in file</th><th>Example</th><th>Import as</th></tr></thead>
                  <tbody>
                    ${table.headers.map((hd, ci) => h`<tr key=${ci}>
                      <td style=${{ fontWeight: 500 }}>${hd}</td>
                      <td class="cv-sample" title=${sample(ci)}>${sample(ci) || h`<span class="cv-empty-cell">empty</span>`}</td>
                      <td><select class="cv-sel" aria-label=${'Import ' + hd + ' as'} value=${map[ci] || ''}
                        onChange=${e => { const v = e.target.value; setMap(m => m.map((x, k) => k === ci ? v : x)); }}>
                        ${targets.map(([k, l]) => h`<option key=${k || 'none'} value=${k}>${l}</option>`)}
                      </select></td>
                    </tr>`)}
                  </tbody>
                </table>
              </div>
              <div class="cv-note" style=${{ marginTop: 10 }}>Statuses and priorities are matched by name, assignees by name or email, and tags are created when missing — separate several with commas. Dates such as 2026-09-30, ${PREF.dateFormat === 'MM/DD/YYYY' ? '09/30/2026' : '30/09/2026'} or 30 Sep 2026 are all understood.</div>
            <//>`}
            ${step === 'running' && h`<div style=${{ padding: '30px 0', textAlign: 'center' }}>
              <div style=${{ fontWeight: 600, marginBottom: 10 }}>Importing ${progress.done} of ${progress.total}…</div>
              <div class="cv-meter" style=${{ maxWidth: 360, margin: '0 auto', height: 8 }}>
                <i style=${{ width: (progress.total ? Math.round(progress.done / progress.total * 100) : 0) + '%', background: 'var(--cu-accent,#ff00ee)' }}></i>
              </div>
            </div>`}
            ${step === 'done' && result && h`<div>
              <div style=${{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0 12px' }}>
                <i class=${'ti ' + (result.created ? 'ti-circle-check' : 'ti-alert-circle')} style=${{ fontSize: 26, color: result.created ? '#30a46c' : '#e5484d' }}></i>
                <div>
                  <div style=${{ fontWeight: 600, fontSize: 14 }}>${result.created} task${result.created === 1 ? '' : 's'} imported</div>
                  <div class="cv-note">${result.errors.length ? result.errors.length + ' row' + (result.errors.length === 1 ? '' : 's') + ' need a look — skipped rows and warnings are listed below' : 'Every row imported cleanly.'}</div>
                </div>
              </div>
              ${result.errors.length > 0 && h`<table class="cv-maptbl">
                <thead><tr><th style=${{ width: 90 }}>CSV row</th><th>What happened</th></tr></thead>
                <tbody>${result.errors.slice(0, 200).map((e2, i) => h`<tr key=${i}><td>${e2.row || '—'}</td><td>${e2.error}</td></tr>`)}</tbody>
              </table>`}
            </div>`}
            ${err && h`<div class="cv-err" role="alert" style=${{ marginTop: 10 }}>${err}</div>`}
          </div>
          <div class="cv-modal-ft">
            ${step === 'map' && h`<button type="button" class="cv-btn" onClick=${() => { setStep('pick'); setTable(null); setErr(null); }}><i class="ti ti-arrow-left"></i>Choose another file</button>`}
            <span class="cv-sp"></span>
            ${step === 'pick' && h`<button type="button" class="cv-btn" onClick=${onClose}>Cancel</button>`}
            ${step === 'map' && h`<${Fragment}>
              ${!mappedTitle && h`<span class="cv-err">Map one column to “Task name”</span>`}
              <button type="button" class="cv-pri" disabled=${!mappedTitle || !listId} onClick=${run}>Import ${n} task${n === 1 ? '' : 's'}</button>
            <//>`}
            ${step === 'done' && h`<button type="button" class="cv-pri" onClick=${onClose}>Done</button>`}
          </div>
        </div>
      </div>`;
    }

    // =========================================================================
    // Keyboard pickers (E status · A assignee · D due)
    // =========================================================================
    function KeyPicker({ kp, vc, onClose }) {
      const { kind, row, anchor } = kp;
      const [ids, setIds] = useState(() => (row.assignees || []).map(a => a.id));
      if (kind === 'status') {
        const statuses = vc.store.statusesFor(row.list_id) || [];
        const items = [['todo', 'Not started'], ['active', 'Active'], ['done', 'Closed']].flatMap(([c, l]) =>
          statuses.filter(s => (s.category || 'todo') === c).map(s => ({
            key: s.key, label: s.name, group: l, selected: s.key === row.status,
            left: h`<${StatusIcon} category=${s.category} color=${s.color} size=${14}/>`,
          })));
        return h`<${Popover} anchor=${anchor} open=${true} onClose=${onClose} ariaLabel="Change status">
          <${PickerList} items=${items} placeholder="Search statuses…" onPick=${it => { onClose(); if (it.key !== row.status) vc.update(row, { status: it.key }); }}/>
        <//>`;
      }
      if (kind === 'assignee') {
        const meId = vc.me && vc.me.id;
        const items = (vc.store.members || []).filter(m => m.role_level !== 'client')
          .slice().sort((a, b) => (b.id === meId) - (a.id === meId) || cmpStr(a.name, b.name))
          .map(m => ({ key: m.id, label: m.id === meId ? 'Me (' + m.name + ')' : m.name, keywords: m.name, selected: ids.includes(m.id), left: h`<${MemberAvatar} member=${m} size=${22}/>` }));
        return h`<${Popover} anchor=${anchor} open=${true} onClose=${onClose} width=${260} ariaLabel="Assignees">
          <${PickerList} items=${items} placeholder="Search people…" emptyText="No teammates found"
            onPick=${it => { const next = ids.includes(it.key) ? ids.filter(x => x !== it.key) : [...ids, it.key]; setIds(next); vc.setAssignees(row, next); }}/>
        <//>`;
      }
      const today = sod(new Date());
      const picks = [['Today', today], ['Tomorrow', addDays(today, 1)], ['Next week', addDays(startOfWeek(today), 7)], ['In 2 weeks', addDays(today, 14)]];
      const setDue = (d) => { onClose(); vc.update(row, d ? moveDueTo(row, d) : { due_at: null, due_has_time: false }); };
      return h`<${Popover} anchor=${anchor} open=${true} onClose=${onClose} width=${230} ariaLabel="Due date">
        <div class="cv-pop">
          <div class="cv-pop-h">Due date</div>
          ${picks.map(([l, d], i) => h`<button type="button" key=${l} class="cv-mi" autoFocus=${i === 0} onClick=${() => setDue(d)}>
            <span style=${{ flex: 1 }}>${l}</span><span class="cv-loc">${fmtShort(d)}</span></button>`)}
          <div style=${{ padding: '4px 8px' }}>
            <input type="date" class="cv-in" style=${{ width: '100%' }} aria-label="Pick a date" defaultValue=${row.due_at ? ymd(row.due_at) : ''}
              onChange=${e => { if (e.target.value) setDue(new Date(e.target.value + 'T00:00:00')); }}/>
          </div>
          ${row.due_at && h`<button type="button" class="cv-mi cv-danger" onClick=${() => setDue(null)}><i class="ti ti-calendar-off"></i>Clear due date</button>`}
        </div>
      <//>`;
    }

    // =========================================================================
    // Toolbar pieces
    // =========================================================================
    function ColumnsChooser({ vc }) {
      const cols = vc.columns;
      const all = Object.keys(COLS).filter(k => !COLS[k].feature || vc.feat(COLS[k].feature))
        .concat(vc.feat('custom_fields') ? (vc.availableFields || []).map(f => 'cf:' + f.id) : []);
      const set = (next) => vc.setCfg({ columns: next });
      const toggle = (k) => set(cols.includes(k) ? cols.filter(c => c !== k) : [...cols, k]);
      const moveBy = (k, d) => {
        const i = cols.indexOf(k), j = i + d;
        if (i < 0 || j < 0 || j >= cols.length) return;
        const next = cols.slice(); next[i] = cols[j]; next[j] = k; set(next);
      };
      const shown = cols.filter(k => colMeta(k, vc.fieldById));
      const hidden = all.filter(k => !cols.includes(k) && colMeta(k, vc.fieldById));
      const rowFor = (k, on) => {
        const m = colMeta(k, vc.fieldById);
        return h`<div key=${k} class="cv-mi" style=${{ cursor: 'default' }}>
          <input type="checkbox" class="cv-cbx" style=${{ opacity: 1 }} id=${'cvcol-' + k} checked=${on} onChange=${() => toggle(k)}/>
          <label for=${'cvcol-' + k} style=${{ flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${m.label}${k.startsWith('cf:') ? h`<span class="cv-loc"> · field</span>` : null}</label>
          ${on && h`<${Fragment}>
            <button type="button" class="cv-iconbtn" aria-label=${'Move ' + m.label + ' up'} disabled=${cols.indexOf(k) === 0} onClick=${() => moveBy(k, -1)}><i class="ti ti-chevron-up"></i></button>
            <button type="button" class="cv-iconbtn" aria-label=${'Move ' + m.label + ' down'} disabled=${cols.indexOf(k) === cols.length - 1} onClick=${() => moveBy(k, 1)}><i class="ti ti-chevron-down"></i></button>
          <//>`}
        </div>`;
      };
      return h`<div class="cv-pop" style=${{ maxHeight: 420, overflowY: 'auto' }}>
        <div class="cv-pop-h">Shown</div>
        ${shown.length === 0 && h`<div class="cv-loc" style=${{ padding: '0 8px 6px' }}>Only the task name is shown.</div>`}
        ${shown.map(k => rowFor(k, true))}
        ${hidden.length > 0 && h`<div class="cv-pop-h" style=${{ marginTop: 6 }}>Hidden</div>`}
        ${hidden.map(k => rowFor(k, false))}
      </div>`;
    }

    const SORT_OPTS = [['', 'Default'], ['due', 'Due date'], ['start', 'Start date'], ['priority', 'Priority'], ['status', 'Status'], ['title', 'Task name'], ['created', 'Date created'], ['updated', 'Date updated'], ['estimate', 'Time estimate'], ['assignee', 'Assignee']];

    function GroupPopover({ vc, close }) {
      const cfg = vc.cfg;
      return h`<div class="cv-pop">
        <div class="cv-pop-h">Group by</div>
        ${GROUP_OPTS.map(o => h`<button type="button" key=${o.key} class=${'cv-mi' + (cfg.group_by === o.key ? ' on' : '')} onClick=${() => vc.setCfg({ group_by: o.key })}>
          <i class=${'ti ' + o.icon}></i>${o.label}${cfg.group_by === o.key && h`<i class="ti ti-check cv-ck"></i>`}
        </button>`)}
        ${cfg.group_by !== 'none' && h`<div style=${{ display: 'flex', gap: 4, padding: '6px 8px' }} role="group" aria-label="Group order">
          <button type="button" class=${'cv-btn' + (cfg.group_dir !== 'desc' ? ' on' : '')} onClick=${() => vc.setCfg({ group_dir: 'asc' })}><i class="ti ti-sort-ascending"></i>Ascending</button>
          <button type="button" class=${'cv-btn' + (cfg.group_dir === 'desc' ? ' on' : '')} onClick=${() => vc.setCfg({ group_dir: 'desc' })}><i class="ti ti-sort-descending"></i>Descending</button>
        </div>`}
        <div class="cv-pop-h" style=${{ borderTop: '1px solid var(--cu-bd,#e8e8eb)', marginTop: 4, paddingTop: 8 }}>Sort tasks by</div>
        <div style=${{ display: 'flex', gap: 4, padding: '2px 8px 6px' }}>
          <select class="cv-sel" style=${{ flex: 1 }} aria-label="Sort field" value=${(cfg.sort && cfg.sort.field) || ''} onChange=${e => vc.setCfg({ sort: e.target.value ? { field: e.target.value, dir: (cfg.sort && cfg.sort.dir) || 'asc' } : null })}>
            ${SORT_OPTS.map(([k, l]) => h`<option key=${k} value=${k}>${l}</option>`)}
          </select>
          ${cfg.sort && h`<button type="button" class="cv-btn icon" aria-label="Toggle sort direction" onClick=${() => vc.setCfg({ sort: { ...cfg.sort, dir: cfg.sort.dir === 'desc' ? 'asc' : 'desc' } })}><i class=${'ti ' + (cfg.sort.dir === 'desc' ? 'ti-sort-descending' : 'ti-sort-ascending')}></i></button>`}
        </div>
        ${close && h`<div style=${{ textAlign: 'right', padding: '0 8px 4px' }}><button type="button" class="cv-btn" onClick=${close}>Done</button></div>`}
      </div>`;
    }

    const SUBTASK_OPTS = [
      ['collapsed', 'Collapse all', 'Show subtask counts; expand per task', 'ti-fold'],
      ['expanded', 'Expand all', 'Nest subtasks under their parents', 'ti-fold-down'],
      ['separate', 'As separate tasks', 'List subtasks as their own rows', 'ti-list-tree'],
    ];
    function SubtasksPopover({ vc, close }) {
      return h`<div class="cv-pop">
        <div class="cv-pop-h">Show subtasks</div>
        ${SUBTASK_OPTS.map(([k, l, d, ic]) => h`<button type="button" key=${k} class=${'cv-mi' + (vc.cfg.show_subtasks === k ? ' on' : '')} style=${{ minHeight: 44 }} onClick=${() => { vc.setCfg({ show_subtasks: k }); close(); }}>
          <i class=${'ti ' + ic}></i><span><span style=${{ display: 'block' }}>${l}</span><span class="cv-loc">${d}</span></span>
          ${vc.cfg.show_subtasks === k && h`<i class="ti ti-check cv-ck"></i>`}
        </button>`)}
      </div>`;
    }

    const metaIcon = (m) => {
      const ic = m && m.icon ? String(m.icon) : '';
      return ic ? (/^ti-/.test(ic) ? ic : 'ti-' + ic) : 'ti-layout';
    };
    function AddViewPopover({ onCreate }) {
      const [priv, setPriv] = useState(false);
      const [pin, setPin] = useState(false);
      const ext = extViews();
      const card = (v) => h`<button type="button" key=${v.key} class="cv-cat" onClick=${() => onCreate(v.key, { is_private: priv, is_pinned: pin })}>
        <i class=${'ti ' + metaIcon(v)}></i><div><b>${v.label}</b><span>${v.desc || ''}</span></div>
      </button>`;
      return h`<div class="cv-pop" style=${{ padding: 8, maxHeight: '70vh', overflowY: 'auto' }}>
        <div class="cv-pop-h">Task views</div>
        <div class="cv-catalog">
          ${VIEW_TYPES.map(card)}
        </div>
        ${ext.length > 0 && h`<${Fragment}>
          <div class="cv-pop-h" style=${{ marginTop: 6 }}>Pages</div>
          <div class="cv-catalog">${ext.map(card)}</div>
        <//>`}
        <div style=${{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--cu-bd,#e8e8eb)', marginTop: 6, paddingTop: 4 }}>
          <label class="cv-chk"><input type="checkbox" checked=${priv} onChange=${e => setPriv(e.target.checked)}/>Private view</label>
          <label class="cv-chk"><input type="checkbox" checked=${pin} onChange=${e => setPin(e.target.checked)}/>Pin view</label>
        </div>
      </div>`;
    }

    function CustomizePanel({ vc, tab, meId, onClose, onRename, onFlag, onSaveNew, onDelete, onSave, dirty, onCopyLink, onPromoteLocal }) {
      const view = tab.view;
      const local = tab.local;
      const canName = !!view || !!local;
      const locked = !!(view && view.is_protected && view.owner_id && view.owner_id !== meId);
      const [name, setName] = useState(tab.name);
      const [newName, setNewName] = useState('');
      useEffect(() => { setName(tab.name); }, [tab.key, tab.name]);
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [onClose]);
      const flag = (k, label, sub) => h`<${Toggle} label=${label} sub=${sub} on=${!!(view && view[k])} disabled=${!view || locked} onChange=${(v) => onFlag(k, v)}/>`;
      return h`<${Fragment}>
        <div class="cv-side-bg" onClick=${onClose}></div>
        <aside class="cv-side" role="dialog" aria-modal="true" aria-label="Customize view">
          <div class="cv-side-hd"><i class=${'ti ' + (tab.icon || 'ti-layout')}></i><span style=${{ flex: 1 }}>Customize view</span>
            <button type="button" class="cv-iconbtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="cv-side-bd">
            <div class="cv-pop-h">View name</div>
            <div style=${{ display: 'flex', gap: 6, padding: '0 8px 10px' }}>
              <input class="cv-in" style=${{ flex: 1 }} aria-label="View name" value=${name} disabled=${!canName || locked} onChange=${e => setName(e.target.value)}
                onKeyDown=${e => { if (e.key === 'Enter' && name.trim()) onRename(name.trim()); }}/>
              <button type="button" class="cv-btn" disabled=${!canName || locked || !name.trim() || name.trim() === tab.name} onClick=${() => onRename(name.trim())}>Rename</button>
            </div>
            ${!canName && h`<div class="cv-loc" style=${{ padding: '0 8px 10px' }}>This is a built-in view. Save it as a new view to rename, pin or share it.</div>`}
            ${local && h`<div class="cv-note" style=${{ padding: '0 8px 10px' }}>
              <i class="ti ti-device-desktop"></i> Saved on this device only — the workspace can’t store this view type yet.
              ${onPromoteLocal && h`<button type="button" class="cv-btn" style=${{ marginTop: 6 }} onClick=${onPromoteLocal}><i class="ti ti-cloud-upload"></i>Try saving to the workspace</button>`}
            </div>`}
            ${onCopyLink && h`<${Fragment}>
              <div class="cv-pop-h">Share</div>
              <div style=${{ padding: '0 8px 10px' }}>
                <button type="button" class="cv-btn" onClick=${onCopyLink}><i class="ti ti-link"></i>Copy link to this view</button>
                <div class="cv-note" style=${{ marginTop: 4 }}>Anyone on the team who can see this space opens the same view.</div>
              </div>
            <//>`}
            <div class="cv-pop-h">Display</div>
            <${Toggle} label="Show empty groups" sub="Keep groups with no tasks visible" on=${!!vc.cfg.show_empty} onChange=${(v) => vc.setCfg({ show_empty: v })}/>
            <${Toggle} label="Wrap text" sub="Show full task names" on=${!!vc.cfg.wrap_text} onChange=${(v) => vc.setCfg({ wrap_text: v })}/>
            <${Toggle} label="Show task locations" sub="Client › List next to each task" on=${!!vc.cfg.show_locations} onChange=${(v) => vc.setCfg({ show_locations: v })}/>
            <${Toggle} label="Show closed tasks" on=${!!vc.cfg.show_closed} onChange=${(v) => vc.setCfg({ show_closed: v })}/>
            <div class="cv-pop-h" style=${{ marginTop: 8 }}>Sharing and permissions</div>
            ${flag('is_private', 'Private view', 'Only you can see this view')}
            ${flag('is_pinned', 'Pin view', 'Keep it at the front of the tab strip')}
            ${flag('is_default', 'Default view', 'Open this view first for everyone')}
            ${flag('is_protected', 'Protect view', 'Only the owner can change or delete it')}
            ${locked && h`<div class="cv-loc" style=${{ padding: '4px 8px' }}><i class="ti ti-lock"></i> This view is protected by its owner.</div>`}
            <div class="cv-pop-h" style=${{ marginTop: 8 }}>Save as new view</div>
            <div style=${{ display: 'flex', gap: 6, padding: '0 8px 10px' }}>
              <input class="cv-in" style=${{ flex: 1 }} aria-label="New view name" placeholder=${tab.name + ' copy'} value=${newName} onChange=${e => setNewName(e.target.value)}/>
              <button type="button" class="cv-btn" onClick=${() => { onSaveNew(newName.trim() || tab.name + ' copy'); setNewName(''); }}>Save as new</button>
            </div>
          </div>
          <div class="cv-side-ft">
            ${dirty && h`<button type="button" class="cv-pri" disabled=${locked} onClick=${onSave}>Save view</button>`}
            <span class="cv-sp"></span>
            ${(view || local) && h`<button type="button" class="cv-btn cv-danger" disabled=${locked} onClick=${onDelete}><i class="ti ti-trash"></i>Delete view</button>`}
          </div>
        </aside>
      <//>`;
    }

    function AddTaskSplit({ onTask, onPost, allowPost }) {
      const pop = usePop();
      return h`<span class="cv-split">
        <button type="button" class="cv-pri" onClick=${onTask}><i class="ti ti-plus"></i><span class="cv-hide-sm">Add Task</span></button>
        <button type="button" class="cv-pri" aria-label="More create options" aria-haspopup="menu" onClick=${pop.toggle}><i class="ti ti-chevron-down"></i></button>
        <${Pop} pop=${pop} width=${180} placement="bottom-end">
          <${Menu} items=${[
            { key: 'task', label: 'Task', icon: 'ti-circle-check', onSelect: () => { pop.close(); onTask(); } },
            { key: 'post', label: 'Post', icon: 'ti-photo', disabled: !allowPost, onSelect: () => { pop.close(); if (allowPost) onPost(); } },
          ]}/>
        <//>
      </span>`;
    }

    // =========================================================================
    // TaskViews — the whole surface
    // =========================================================================
    const SERVER_ORDERS = ['due', 'priority', 'created', 'updated', 'title', 'position'];
    const isEvent = (x) => !!(x && (x.nativeEvent || x.target || x.currentTarget));

    // ---- member / org preferences (093), fail-open -------------------------
    const prefCache = { org: undefined, me: undefined, busy: false, missing: false, subs: new Set() };
    function useViewPrefs(store) {
      // tasks.js (B) surfaces these from task_bootstrap as `orgSettings` / `prefs`;
      // the RPC fallback below only runs against an older tasks.js that has neither.
      const sOrg = store.orgSettings || store.org_settings || null;
      const sMe = store.prefs || store.me_prefs || store.mePrefs || null;
      const [, force] = useState(0);
      useEffect(() => {
        const fn = () => force(x => x + 1);
        prefCache.subs.add(fn);
        return () => prefCache.subs.delete(fn);
      }, []);
      useEffect(() => {
        if (!taskBus || !taskBus.on) return;
        return taskBus.on('meta:changed', () => {
          if (prefCache.missing || prefCache.busy) return;
          prefCache.org = undefined; prefCache.me = undefined;
        });
      }, []);
      useEffect(() => {
        if (!store.ready || prefCache.busy || prefCache.missing) return;
        const needOrg = !sOrg && prefCache.org === undefined;
        const needMe = !sMe && prefCache.me === undefined;
        if (!needOrg && !needMe) return;
        prefCache.busy = true;
        const get = (name, need) => need
          ? rpc(name, {}).catch(e => { if (isMissingRpc(e)) prefCache.missing = true; return null; })
          : Promise.resolve(undefined);
        Promise.all([get('org_task_settings_get', needOrg), get('member_prefs_get', needMe)]).then(([o, m]) => {
          if (needOrg) prefCache.org = o || null;
          if (needMe) prefCache.me = m || null;
          prefCache.busy = false;
          prefCache.subs.forEach(fn => { try { fn(); } catch (_) { } });
        });
      }, [store, sOrg, sMe]);
      return { org: sOrg || prefCache.org || null, me: sMe || prefCache.me || null };
    }

    // ---- shareable view links (#/view/<id>) --------------------------------
    function openView(id) {
      if (!id) return;
      window.__amsPendingView = String(id);
      window.__amsPendingViewId = String(id);
      try { window.dispatchEvent(new CustomEvent('ams-open-view', { detail: { id: String(id) } })); } catch (_) { }
    }
    function viewScope(view) {
      if (!view) return { type: 'all' };
      const t = view.scope_type || 'all';
      if (t === 'client') return { type: 'client', clientId: view.scope_id };
      if (t === 'list') return { type: 'list', listId: view.scope_id };
      return { type: t };
    }

    function TaskViews({ scope, currentUser, showToast, initialView, compact }) {
      const store = useTaskStore();
      const sc = scope || { type: 'all' };
      const scopeId = sc.type === 'client' ? (sc.clientId || null) : sc.type === 'list' ? (sc.listId || null) : null;
      const scopeKey = 'ams_view_' + sc.type + (scopeId ? '_' + scopeId : '');
      const toast = useCallback((m) => { if (showToast) showToast(m); else console.info('[views]', m); }, [showToast]);
      const me = store.me || currentUser || {};
      const meId = me.id;

      // ---- preferences (week start / date format) + org task settings ----
      const prefs = useViewPrefs(store);
      applyPrefs(prefs.me);
      const org = prefs.org;
      const feat = useCallback((k) => (typeof store.feature === 'function'
        ? store.feature(k)
        : !(org && org.features && org.features[k] === false)), [store.feature, org]);
      const workHours = Number(org && org.work_hours_per_day) || 8;
      const isWorkDay = useCallback((d) => {
        const x = new Date(d);
        const wd = org && Array.isArray(org.work_days) && org.work_days.length ? org.work_days.map(Number) : [1, 2, 3, 4, 5, 6];   // 093 default = Mon–Sat
        const iso = x.getDay() === 0 ? 7 : x.getDay();
        if (!(wd.includes(iso) || (x.getDay() === 0 && wd.includes(0)))) return false;
        const hol = org && Array.isArray(org.holidays) ? org.holidays : [];
        return !hol.some(hd => String(hd).slice(0, 10) === ymd(x));
      }, [org]);

      // ---- keyboard cursor + print ----
      const rootRef = useRef(null);
      const [cursorId, setCursorId] = useState(null);
      const [kp, setKp] = useState(null);
      const [importing, setImporting] = useState(false);
      const printView = useCallback(() => {
        const el = rootRef.current;
        if (!el) return;
        const html = document.documentElement;
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          html.classList.remove('cv-printing');
          el.classList.remove('cv-print-target');
          window.removeEventListener('afterprint', finish);
        };
        html.classList.add('cv-printing');
        el.classList.add('cv-print-target');
        window.addEventListener('afterprint', finish);
        setTimeout(() => {
          try { window.print(); } catch (e) { console.warn('[views] print failed', e); }
          if (!('onafterprint' in window)) setTimeout(finish, 800);
        }, 50);
      }, []);

      // ---- tabs: built-ins + saved views + local (unsaved) views ----
      const savedViews = useMemo(() => (store.views || [])
        .filter(v => v.scope_type === sc.type && String(v.scope_id || '') === String(scopeId || ''))
        .sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || (a.position || 0) - (b.position || 0)), [store.views, sc.type, scopeId]);
      const localKey = 'ams_localviews_' + sc.type + (scopeId ? '_' + scopeId : '');
      const [localViews, setLocalViews] = useState(() => lsGet(localKey, []) || []);
      useEffect(() => { setLocalViews(lsGet(localKey, []) || []); }, [localKey]);
      const saveLocal = useCallback((list) => { setLocalViews(list); lsSet(localKey, list); }, [localKey]);
      const extKey = extViews().map(v => v.key).join(',');
      const tabs = useMemo(() => [
        ...VIEW_TYPES.filter(t => BUILTIN_TAB_KEYS.includes(t.key))
          .map(t => ({ key: 'builtin:' + t.key, type: t.key, name: t.label, icon: t.icon, builtin: true, config: defaultConfigFor(t.key) })),
        ...savedViews.map(v => ({
          key: v.id, type: v.view_type || 'list', name: v.name, icon: metaIcon(viewMeta(v.view_type)),
          view: v, config: normConfig(v.view_type, v.config),
        })),
        ...(localViews || []).map(lv => ({
          key: lv.id, type: lv.view_type, name: lv.name, icon: metaIcon(viewMeta(lv.view_type)),
          local: lv, config: normConfig(lv.view_type, lv.config),
        })),
      ], [savedViews, localViews, extKey]);

      const keyFor = (v) => (v && BUILTIN_TAB_KEYS.includes(v) ? 'builtin:' + v : v);
      const [activeKey, setActiveKey] = useState(() => (initialView ? keyFor(initialView) : lsGet(scopeKey, null) || null));
      useEffect(() => { // scope change → restore that scope's remembered view
        setActiveKey(initialView ? keyFor(initialView) : lsGet(scopeKey, null));
      }, [scopeKey]);
      const defaultSaved = savedViews.find(v => v.is_default);
      const tab = tabs.find(t => t.key === activeKey)
        || (activeKey == null && defaultSaved ? tabs.find(t => t.key === defaultSaved.id) : null)
        || tabs[0];
      const selectTab = (key) => { setActiveKey(key); lsSet(scopeKey, key); setSelected(new Set()); setCursorId(null); };

      // shareable links: #/view/<id> → the shell sets __amsPendingView and fires ams-open-view
      useEffect(() => {
        const pick = (id) => {
          const key = String(id || '');
          if (!key || !tabs.some(t => t.key === key)) return false;
          selectTab(key);
          if (window.__amsPendingView === key) window.__amsPendingView = null;
          if (window.__amsPendingViewId === key) window.__amsPendingViewId = null;
          return true;
        };
        const onOpen = (e) => pick(e && e.detail && e.detail.id);
        if (window.__amsPendingView) pick(window.__amsPendingView);
        else if (window.__amsPendingViewId) pick(window.__amsPendingViewId);
        window.addEventListener('ams-open-view', onOpen);
        return () => window.removeEventListener('ams-open-view', onOpen);
      }, [tabs]);

      // ---- config drafts (builtin drafts persist locally) ----
      const draftKey = 'ams_viewcfg_' + sc.type + (scopeId ? '_' + scopeId : '') + '_' + tab.key;
      const [drafts, setDrafts] = useState({});
      const draft = drafts[tab.key] !== undefined ? drafts[tab.key] : (tab.builtin ? lsGet(draftKey, null) : null);
      const cfg = useMemo(() => ({ ...tab.config, ...(draft || {}) }), [tab.config, draft]);
      const dirty = !!draft && Object.keys(draft).some(k => JSON.stringify(draft[k]) !== JSON.stringify(tab.config[k]));
      const setCfg = useCallback((patch) => {
        if (tab.local) {
          saveLocal((lsGet(localKey, []) || []).map(lv => lv.id === tab.key ? { ...lv, config: { ...(lv.config || {}), ...patch } } : lv));
          return;
        }
        setDrafts(d => {
          const cur = d[tab.key] !== undefined ? d[tab.key] : (tab.builtin ? lsGet(draftKey, null) : null);
          const next = { ...(cur || {}), ...patch };
          if (tab.builtin) lsSet(draftKey, next);
          return { ...d, [tab.key]: next };
        });
      }, [tab.key, tab.builtin, tab.local, draftKey, saveLocal, localKey]);
      const clearDraft = (key, dk) => { setDrafts(d => ({ ...d, [key]: null })); if (dk) lsSet(dk, null); };
      // persist immediately (used by views that own their config, e.g. Embed + registry views)
      const persistCfg = useCallback(async (patch) => {
        setCfg(patch);
        if (tab.local || tab.builtin || !tab.view) return;
        try { await TaskAPI.viewUpsert({ ...tab.view, config: { ...cfg, ...patch } }); clearDraft(tab.key); }
        catch (e) { toast(e && e.code === 'forbidden' ? 'Kept for you — only the view’s owner can save changes' : 'Couldn’t save the view: ' + errMsg(e)); }
      }, [tab.key, tab.local, tab.builtin, tab.view, cfg, setCfg, toast]);

      // ---- quick filters / search / selection ----
      const [quick, setQuick] = useState([]);
      const [meOnly, setMeOnly] = useState(false);
      const [searchOpen, setSearchOpen] = useState(false);
      const [q, setQ] = useState('');
      const [qServer, setQServer] = useState('');
      useEffect(() => { const t = setTimeout(() => setQServer(q.trim()), 400); return () => clearTimeout(t); }, [q]);
      const [selected, setSelected] = useState(() => new Set());
      const [collapsedSubs, setCollapsedSubs] = useState(() => new Set());
      const [customizing, setCustomizing] = useState(false);
      const groupPop = usePop(), subPop = usePop(), colPop = usePop(), filtPop = usePop(), viewPop = usePop(), morePop = usePop();
      useEffect(() => { setSelected(new Set()); }, [scopeKey]);
      useEffect(() => {
        if (!selected.size) return;
        const onKey = (e) => {
          const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
          if (e.key === 'Escape') setSelected(new Set());
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [selected.size]);

      // ---- server filter ----
      const viewType = tab.type;
      const dayStamp = ymd(new Date());
      const quickIds = useMemo(() => Array.from(new Set([...quick, ...(meOnly && meId ? [meId] : [])])), [quick, meOnly, meId]);
      const filterJson = JSON.stringify((() => {
        const now = new Date();
        const base = baseFilterFor(sc);
        const extra = { ...(cfg.filters || {}), ...compileServer(cfg.filter_rows, now) };
        if (quickIds.length) extra.assignee_ids = extra.assignee_ids ? extra.assignee_ids.filter(id => quickIds.includes(id)).concat(quickIds.filter(id => !extra.assignee_ids.includes(id))) : quickIds;
        const f = mergeFilters(base, extra);
        f.include_closed = !!cfg.show_closed;
        f.top_level = viewType === 'mindmap' ? true : viewType === 'team' ? false : cfg.show_subtasks === 'collapsed';
        if (qServer) f.search = qServer;
        const so = cfg.sort && cfg.sort.field;
        f.order = so && SERVER_ORDERS.includes(so) ? so : (viewType === 'board' ? 'position' : (f.order || 'due'));
        f.limit = 1000;
        return f;
      })());
      const filter = useMemo(() => JSON.parse(filterJson), [filterJson, dayStamp]);
      const needsRows = ROW_VIEWS.includes(viewType) || !!extViews().find(v => v.key === viewType);
      const { rows: rawRows, total, loading, error, reload, setRows } = useTasks(filter, { enabled: !!store.ready && needsRows });

      // ---- client-side refinement ----
      const rows = useMemo(() => {
        const now = new Date();
        let rs = rawRows || [];
        const ql = q.trim().toLowerCase();
        if (ql) rs = rs.filter(r => (r.title || '').toLowerCase().includes(ql) || String(r.custom_id || '').toLowerCase().includes(ql));
        const frs = (cfg.filter_rows || []).filter(rowActive);
        if (frs.length) rs = rs.filter(r => frs.every(fr => matchRow(r, fr, meId, now)));
        if (quickIds.length) rs = rs.filter(r => (r.assignees || []).some(a => quickIds.includes(a.id)));
        return rs;
      }, [rawRows, q, cfg.filter_rows, quickIds, meId]);

      const statusPos = useCallback((r) => {
        const s = store.statusMeta ? store.statusMeta(r.list_id, r.status) : null;
        const cr = { todo: 0, active: 1, done: 2 };
        return s ? (cr[s.category] || 0) * 1000 + (s.position || 0) : 99999;
      }, [store.statusMeta]);

      const { topRows, childrenOf } = useMemo(() => {
        const sorted = cfg.sort ? sortRows(rows, cfg.sort, statusPos) : viewType === 'board' ? byPosition(rows) : rows;
        if (cfg.show_subtasks !== 'expanded') return { topRows: sorted, childrenOf: null };
        const ids = new Set(sorted.map(r => r.id));
        const kids = {};
        const top = [];
        sorted.forEach(r => { if (r.parent_id && ids.has(r.parent_id)) (kids[r.parent_id] = kids[r.parent_id] || []).push(r); else top.push(r); });
        return { topRows: top, childrenOf: kids };
      }, [rows, cfg.sort, cfg.show_subtasks, viewType, statusPos]);

      const groupBy = (viewType === 'list' || viewType === 'board') ? (cfg.group_by || 'status') : 'none';
      const groups = useMemo(() => {
        const gs = buildGroups(topRows, groupBy, { store, now: new Date(), scopeListId: sc.type === 'list' ? sc.listId : null, seedEmpty: !!cfg.show_empty || viewType === 'board' });
        return cfg.group_dir === 'desc' ? gs.slice().reverse() : gs;
      }, [topRows, groupBy, store.statuses, store.statusMeta, store.statusesFor, store.memberById, store.tagById, store.listById, store.members, store.tags, store.lists, sc.type, sc.listId, cfg.show_empty, cfg.group_dir, viewType, dayStamp]);

      // ---- create defaults per scope ----
      const findList = (clientId, key) => (store.listsForClient ? (store.listsForClient(clientId) || []) : (store.lists || []).filter(l => (l.client_id || null) === (clientId || null)))
        .find(l => !l.archived && (key ? l.system_key === key : l.kind === 'general'));
      const personalList = useMemo(() => (store.lists || []).find(l => l.system_key === 'personal' && l.owner_id === meId), [store.lists, meId]);
      const scopeDefaults = useMemo(() => {
        if (sc.type === 'list') { const l = store.listById && store.listById[sc.listId]; return { list_id: sc.listId, ...(l && l.client_id ? { client_id: l.client_id } : {}) }; }
        if (sc.type === 'client') { const l = findList(sc.clientId, 'tasks') || findList(sc.clientId); return { client_id: sc.clientId, ...(l ? { list_id: l.id } : {}) }; }
        if (sc.type === 'agency') { const l = findList(null, 'internal') || findList(null); return l ? { list_id: l.id } : {}; }
        if (sc.type === 'my') return { ...(meId ? { assignee_ids: [meId] } : {}), ...(personalList ? { list_id: personalList.id } : {}) };
        return personalList ? { list_id: personalList.id } : {};
      }, [sc.type, sc.listId, sc.clientId, store.lists, meId, personalList]);
      const presetFor = useCallback((g) => {
        const d = { ...scopeDefaults, ...((g && g.preset) || {}) };
        if (g && g.preset && g.preset.client_id && !(g.preset.list_id)) {
          const l = findList(g.preset.client_id, 'tasks') || findList(g.preset.client_id);
          if (l) d.list_id = l.id;
        }
        if (d.status && d.list_id) {
          const ok = (store.statusesFor(d.list_id) || []).some(s => s.key === d.status);
          if (!ok) delete d.status;
        }
        if (d.assignee_ids && scopeDefaults.assignee_ids && g && g.preset && g.preset.assignee_ids) d.assignee_ids = g.preset.assignee_ids;
        return d;
      }, [scopeDefaults, store.lists, store.statuses]);
      const createTask = useCallback((extra) => {
        openCreateTask({ ...scopeDefaults, ...(extra && !isEvent(extra) ? extra : {}) });
      }, [scopeDefaults]);

      // ---- mutations (optimistic) ----
      const optimistic = useCallback((r, patch) => {
        const o = { ...r, ...patch };
        if (patch.status) {
          const s = store.statusMeta ? store.statusMeta(r.list_id, patch.status) : null;
          if (s) Object.assign(o, { status_name: s.name, status_color: s.color, status_category: s.category });
        }
        if (patch.assignee_ids) {
          o.assignees = patch.assignee_ids.map(id => { const m = (store.memberById && store.memberById[id]) || { id }; return { id, name: m.name, initials: m.initials, color: m.color }; });
          delete o.assignee_ids;
        }
        if (patch.list_id) { const l = store.listById && store.listById[patch.list_id]; if (l) o.list_name = l.name; }
        delete o.keep_duration; delete o.shift_dependents;   // server-side patch flags, never row fields
        return o;
      }, [store.statusMeta, store.memberById, store.listById]);
      const patchLocal = useCallback((id, patch) => {
        if (typeof setRows === 'function') setRows(rs => (rs || []).map(r => r.id === id ? optimistic(r, patch) : r));
      }, [setRows, optimistic]);
      const update = useCallback(async (row, patch) => {
        patchLocal(row.id, patch);
        try { await TaskAPI.update(row.id, patch); }
        catch (e) { toast(e && e.code === 'forbidden' ? 'You don’t have permission to edit this task' : 'Update failed: ' + errMsg(e)); reload && reload(); }
      }, [patchLocal, toast, reload]);
      const setAssignees = useCallback(async (row, ids) => {
        patchLocal(row.id, { assignee_ids: ids });
        try { await TaskAPI.setAssignees(row.id, ids); }
        catch (e) { toast('Could not update assignees: ' + errMsg(e)); reload && reload(); }
      }, [patchLocal, toast, reload]);
      const moveToGroup = useCallback(async (row, from, to, idx) => {
        const patch = {};
        if (to.key !== from.key) {
          if (!to.dragPatch) { toast('Tasks can’t be moved into this group'); return; }
          Object.assign(patch, to.dragPatch);
          if (patch.status && !(store.statusesFor(row.list_id) || []).some(s => s.key === patch.status)) { toast('That status isn’t available in ' + (row.list_name || 'this task’s list')); return; }
        }
        if (idx != null) {
          const list = to.rows.filter(r => r.id !== row.id);
          let i = idx;
          if (to.key === from.key) {
            const old = to.rows.findIndex(r => r.id === row.id);
            if (old >= 0 && old < idx) i = idx - 1;
            if (old === i) return;
          }
          patch.position = positionBetween(list, Math.max(0, Math.min(i, list.length)));
        }
        if (!Object.keys(patch).length) return;
        const assignees = patch.assignee_ids; delete patch.assignee_ids;
        if (assignees) await setAssignees(row, assignees);
        if (Object.keys(patch).length) await update(row, patch);
      }, [update, setAssignees, toast, store.statusesFor]);

      // ---- selection ----
      const toggleSel = useCallback((id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
      const selectMany = useCallback((ids, on) => setSelected(s => { const n = new Set(s); ids.forEach(id => on ? n.add(id) : n.delete(id)); return n; }), []);
      const toggleCollapsedSub = useCallback((id) => setCollapsedSubs(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);

      // ---- views CRUD ----
      const upsertView = async (data, okMsg) => {
        try { const v = await TaskAPI.viewUpsert(data); if (okMsg) toast(okMsg); return v; }
        catch (e) { toast(e && e.code === 'forbidden' ? 'You can’t change this view' : 'Could not save view: ' + errMsg(e)); return null; }
      };
      const keepLocally = (e) => isMissingRpc(e) || /check|constraint|invalid|view_type|violates/i.test(errMsg(e));
      const createView = async (type, flags) => {
        viewPop.close();
        const meta = viewMeta(type) || { label: 'View' };
        const same = savedViews.filter(v => v.view_type === type).length + (localViews || []).filter(v => v.view_type === type).length;
        const name = meta.label + (same ? ' ' + (same + 1) : '');
        const data = { scope_type: sc.type, scope_id: scopeId, name, view_type: type, config: defaultConfigFor(type),
          is_private: !!flags.is_private, is_pinned: !!flags.is_pinned, is_default: false, is_protected: false, position: savedViews.length + 1 };
        try {
          const v = await TaskAPI.viewUpsert(data);
          toast('View created');
          if (v && v.id) selectTab(v.id);
        } catch (e) {
          if (e && e.code === 'forbidden') { toast('You can’t add views here'); return; }
          if (!keepLocally(e)) { toast('Could not save view: ' + errMsg(e)); return; }
          const lv = { id: 'local:' + uid(), view_type: type, name, config: defaultConfigFor(type) };
          saveLocal([...(localViews || []), lv]);
          selectTab(lv.id);
          toast('Added on this device — it becomes shareable once the workspace is updated');
        }
      };
      const promoteLocal = async () => {
        if (!tab.local) return;
        try {
          const v = await TaskAPI.viewUpsert({ scope_type: sc.type, scope_id: scopeId, name: tab.name, view_type: tab.type, config: cfg,
            is_private: false, is_pinned: false, is_default: false, is_protected: false, position: savedViews.length + 1 });
          saveLocal((lsGet(localKey, []) || []).filter(x => x.id !== tab.key));
          toast('View saved to the workspace');
          setCustomizing(false);
          if (v && v.id) selectTab(v.id);
        } catch (e) {
          toast(keepLocally(e) ? 'The workspace can’t store this view type yet — it stays on this device' : 'Couldn’t save: ' + errMsg(e));
        }
      };
      const copyViewLink = async () => {
        if (!tab.view) return;
        const url = location.origin + location.pathname + '#/view/' + tab.view.id;
        toast((await copy(url)) ? 'View link copied' : url);
      };
      const saveView = async () => {
        if (tab.builtin) {
          const v = await upsertView({ scope_type: sc.type, scope_id: scopeId, name: tab.name, view_type: tab.type, config: cfg,
            is_private: false, is_pinned: false, is_default: false, is_protected: false, position: savedViews.length + 1 }, 'View saved');
          if (v && v.id) { clearDraft(tab.key, draftKey); selectTab(v.id); }
          return;
        }
        const v = await upsertView({ ...tab.view, config: cfg }, 'View saved');
        if (v) clearDraft(tab.key);
      };
      const saveAsNew = async (name) => {
        const v = await upsertView({ scope_type: sc.type, scope_id: scopeId, name, view_type: tab.type, config: cfg,
          is_private: false, is_pinned: false, is_default: false, is_protected: false, position: savedViews.length + 1 }, 'View saved');
        if (v && v.id) { clearDraft(tab.key, tab.builtin ? draftKey : null); selectTab(v.id); setCustomizing(false); }
      };
      const renameView = (name) => {
        if (tab.local) { saveLocal((lsGet(localKey, []) || []).map(lv => lv.id === tab.key ? { ...lv, name } : lv)); toast('View renamed'); return; }
        return tab.view && upsertView({ ...tab.view, name }, 'View renamed');
      };
      const flagView = (k, val) => tab.view && upsertView({ ...tab.view, [k]: val });
      const backTab = () => (BUILTIN_TAB_KEYS.includes(tab.type) ? 'builtin:' + tab.type : 'builtin:list');
      const deleteView = async () => {
        if (!window.confirm('Delete the view “' + tab.name + '”?')) return;
        if (tab.local) {
          saveLocal((lsGet(localKey, []) || []).filter(x => x.id !== tab.key));
          toast('View deleted'); setCustomizing(false); selectTab(backTab());
          return;
        }
        if (!tab.view) return;
        try { await TaskAPI.viewDelete(tab.view.id); toast('View deleted'); setCustomizing(false); selectTab(backTab()); }
        catch (e) { toast('Could not delete view: ' + errMsg(e)); }
      };

      // ---- columns + fields ----
      const fieldById = useMemo(() => Object.fromEntries((store.fields || []).map(f => [f.id, f])), [store.fields]);
      const availableFields = useMemo(() => sc.type === 'list' && store.fieldsFor ? (store.fieldsFor(sc.listId) || []) : (store.fields || []).filter(f => !f.list_id), [store.fields, sc.type, sc.listId]);
      const singleClient = sc.type === 'client' || (sc.type === 'list' && !!(store.listById && store.listById[sc.listId] && store.listById[sc.listId].client_id)) || sc.type === 'agency';
      const columns = useMemo(() => (cfg.columns || []).filter(c => {
        const m = colMeta(c, fieldById);
        if (!m) return false;
        if (m.feature && !feat(m.feature)) return false;
        if (c.startsWith('cf:') && !feat('custom_fields')) return false;
        if (singleClient && c === 'client' && viewType === 'list') return false;
        return true;
      }), [cfg.columns, fieldById, singleClient, viewType, feat]);
      const viewTitle = (sc.title ? sc.title + ' · ' : '') + tab.name;
      const activeFilterCount = (cfg.filter_rows || []).filter(rowActive).length;
      const hasFilters = activeFilterCount > 0 || quickIds.length > 0 || !!q.trim();
      const clearFilters = useCallback(() => { setCfg({ filter_rows: [] }); setQuick([]); setMeOnly(false); setQ(''); }, [setCfg]);

      const vc = useMemo(() => ({
        store, me, scope: sc, cfg, setCfg, persistCfg, rows: rawRows || [], setRows, reload, toast, update, setAssignees, optimistic, moveToGroup,
        selected, toggleSel, selectMany, collapsedSubs, toggleCollapsedSub, childrenOf, singleClient, fieldById, availableFields, columns,
        presetFor, createTask, onCreated: noop, hasFilters, clearFilters, quickAssignees: quickIds,
        feat, org, workHours, isWorkDay, cursorId, printView, title: viewTitle,
      }), [store, me, sc.type, sc.clientId, sc.listId, sc.title, cfg, setCfg, persistCfg, rawRows, setRows, reload, toast, update, setAssignees, optimistic, moveToGroup,
        selected, toggleSel, selectMany, collapsedSubs, toggleCollapsedSub, childrenOf, singleClient, fieldById, availableFields, columns,
        presetFor, createTask, hasFilters, clearFilters, quickIds, feat, org, workHours, isWorkDay, cursorId, printView, viewTitle]);

      // ---- keyboard navigation (J/K move · Enter open · E/A/D edit · X select) ----
      const rowById = useMemo(() => Object.fromEntries((rawRows || []).map(r => [r.id, r])), [rawRows]);
      const navIds = useMemo(() => {
        const byStart = (a, b) => Date.parse(a.start_at || a.due_at) - Date.parse(b.start_at || b.due_at);
        if (viewType === 'list' || viewType === 'board') {
          const seen = new Set(), out = [];
          const push = (r) => {
            if (!seen.has(r.id)) { seen.add(r.id); out.push(r.id); }
            if (viewType === 'list' && cfg.show_subtasks === 'expanded' && childrenOf && childrenOf[r.id]) childrenOf[r.id].forEach(push);
          };
          groups.forEach(g => g.rows.forEach(push));
          return out;
        }
        if (viewType === 'gantt') return topRows.filter(r => r.start_at || r.due_at).sort(byStart).concat(topRows.filter(r => !r.start_at && !r.due_at)).map(r => r.id);
        if (viewType === 'timeline') return topRows.filter(r => r.start_at || r.due_at).sort(byStart).map(r => r.id);
        if (viewType === 'calendar') return topRows.filter(r => r.due_at).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at)).map(r => r.id);
        if (viewType === 'activity' || viewType === 'embed') return [];
        return topRows.map(r => r.id);
      }, [viewType, groups, topRows, childrenOf, cfg.show_subtasks]);

      const navLabel = (sc.title ? sc.title + ' · ' : '') + tab.name;
      const navRef = useRef(null);
      const publishNav = useCallback(() => {
        const o = { ids: navIds, label: navLabel };
        navRef.current = o;
        window.__amsTaskNav = o;
      }, [navIds, navLabel]);
      useEffect(() => { if (!compact && store.ready) publishNav(); }, [publishNav, compact, store.ready]);
      useEffect(() => () => {
        if (navRef.current && window.__amsTaskNav === navRef.current) window.__amsTaskNav = null;
      }, []);

      const rowEl = (id) => rootRef.current && rootRef.current.querySelector('[data-row-id="' + cssEsc(id) + '"]');
      const closeKp = () => { setKp(null); if (rootRef.current) { try { rootRef.current.focus({ preventScroll: true }); } catch (_) { } } };
      const onRootKey = (e) => {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
        const t = e.target;
        if (!t || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
        if (t.closest && t.closest('.cu-pop,.cv-side,.cv-modal,.cv-bulk')) return;
        if (kp || !navIds.length) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (!['j', 'k', 'Enter', 'e', 'a', 'd', 'x'].includes(k)) return;
        const cur = cursorId ? navIds.indexOf(cursorId) : -1;
        if (k === 'j' || k === 'k') {
          e.preventDefault(); e.stopPropagation();
          const next = cur < 0 ? 0 : k === 'j' ? Math.min(navIds.length - 1, cur + 1) : Math.max(0, cur - 1);
          setCursorId(navIds[next]);
          publishNav();
          requestAnimationFrame(() => { const el = rowEl(navIds[next]); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
          return;
        }
        if (cur < 0) return;
        const row = rowById[cursorId];
        if (!row) return;
        if (k === 'Enter') {
          if (t.tagName === 'BUTTON' || t.tagName === 'A') return;
          e.preventDefault(); e.stopPropagation();
          openTask(row.id);
          return;
        }
        e.preventDefault(); e.stopPropagation();
        if (k === 'x') { toggleSel(row.id); return; }
        const anchor = rowEl(row.id) || (rootRef.current && rootRef.current.querySelector('.cv-body')) || rootRef.current;
        setKp({ kind: k === 'e' ? 'status' : k === 'a' ? 'assignee' : 'due', row, anchor });
      };

      // ---- CSV export of the rows and columns currently on screen ----
      const EXPORT_FALLBACK = ['status', 'assignee', 'due', 'priority', 'client', 'list', 'estimate'];
      const exportCsv = () => {
        let cols = (viewType === 'list' || viewType === 'table') ? columns.slice() : EXPORT_FALLBACK.filter(c => !COLS[c].feature || feat(COLS[c].feature));
        if (['gantt', 'timeline', 'calendar'].includes(viewType) && !cols.includes('start')) cols = ['start'].concat(cols);
        const ordered = ['list', 'board', 'table', 'gantt'].includes(viewType) && navIds.length
          ? navIds.map(id => rowById[id]).filter(Boolean)
          : topRows;
        const tagsOn = feat('tags');
        const header = ['ID', 'Task name'].concat(cols.map(c => (colMeta(c, fieldById) || { label: c }).label))
          .concat(tagsOn ? ['Tags'] : []).concat(['Parent task']);
        const lines = [header];
        ordered.forEach(r => {
          lines.push([r.custom_id || '', r.title || '']
            .concat(cols.map(c => cellText(c, r, fieldById)))
            .concat(tagsOn ? [(r.tag_ids || []).map(id => ((store.tagById && store.tagById[id]) || {}).name).filter(Boolean).join(', ')] : [])
            .concat([r.parent_title || '']));
        });
        const name = fileSafe((sc.title || 'tasks') + ' ' + tab.name) + '-' + ymd(new Date()) + '.csv';
        if (downloadText(name, toCsv(lines))) toast('Exported ' + ordered.length + ' task' + (ordered.length === 1 ? '' : 's'));
      };

      // ---- avatar quick-filter candidates: top 6 by assigned count ----
      const topMembers = useMemo(() => {
        const cnt = {};
        (rawRows || []).forEach(r => (r.assignees || []).forEach(a => { cnt[a.id] = (cnt[a.id] || 0) + 1; }));
        return (store.members || []).filter(m => m.id !== meId && m.role_level !== 'client')
          .sort((a, b) => (cnt[b.id] || 0) - (cnt[a.id] || 0) || cmpStr(a.name, b.name)).slice(0, 6);
      }, [rawRows, store.members, meId]);

      // ---------------------------------------------------------------- render
      if (!store.ready) {
        if (store.error) return h`<div class="cv-root" style=${{ padding: 24 }}><${EmptyState} icon="ti-alert-triangle" title="Couldn’t load tasks" sub=${errMsg(store.error)} action=${h`<button type="button" class="cv-btn" onClick=${() => store.reload && store.reload()}>Retry</button>`}/></div>`;
        return h`<div class="cv-root"><div class="cv-loading">${[0, 1, 2, 3, 4].map(i => h`<div key=${i} style=${{ marginBottom: 10 }}><${Skel} h=${i ? 36 : 44}/></div>`)}</div></div>`;
      }

      const showGroup = viewType === 'list' || viewType === 'board';
      const showSub = ['list', 'board', 'table', 'gantt', 'timeline'].includes(viewType);
      const showCols = !compact && (viewType === 'list' || viewType === 'table');
      const showFilters = viewType !== 'embed' && viewType !== 'activity';
      const showPeople = viewType !== 'embed';
      const groupLabel = (GROUP_OPTS.find(o => o.key === groupBy) || GROUP_OPTS[0]).label;
      const allowPost = sc.type === 'client' || (sc.type === 'list' && singleClient);
      const subLabel = (SUBTASK_OPTS.find(o => o[0] === cfg.show_subtasks) || SUBTASK_OPTS[0])[1];
      const locked = !!(tab.view && tab.view.is_protected && tab.view.owner_id && tab.view.owner_id !== meId);
      const hasRows = !!(rawRows && rawRows.length);
      const firstLoad = loading && !hasRows;
      const isExt = !VT[viewType];

      let body;
      if (viewType === 'activity') body = h`<${ActivityMode} vc=${vc}/>`;
      else if (viewType === 'embed') body = h`<${EmbedMode} vc=${vc}/>`;
      else if (error && !hasRows) {
        body = h`<div style=${{ padding: 32 }}><${EmptyState} icon="ti-alert-triangle" title="Couldn’t load tasks" sub=${errMsg(error)} action=${h`<button type="button" class="cv-btn" onClick=${reload}>Try again</button>`}/></div>`;
      } else if (firstLoad) {
        body = h`<div class="cv-loading">${[0, 1, 2, 3, 4, 5].map(i => h`<div key=${i} style=${{ marginBottom: 8 }}><${Skel} h=${36}/></div>`)}</div>`;
      } else if (viewType === 'board') body = h`<${BoardMode} vc=${vc} groups=${groups}/>`;
      else if (viewType === 'calendar') body = h`<${CalendarMode} vc=${vc} rows=${topRows}/>`;
      else if (viewType === 'table') body = h`<${TableMode} vc=${vc} rows=${topRows}/>`;
      else if (viewType === 'gantt') body = h`<${GanttMode} vc=${vc} rows=${topRows}/>`;
      else if (viewType === 'workload') body = h`<${WorkloadMode} vc=${vc} rows=${rows}/>`;
      else if (viewType === 'timeline') body = h`<${TimelineMode} vc=${vc} rows=${topRows}/>`;
      else if (viewType === 'team') body = h`<${TeamMode} vc=${vc} rows=${rows}/>`;
      else if (viewType === 'mindmap') body = h`<${MindMapMode} vc=${vc} rows=${topRows}/>`;
      else if (isExt) body = h`<${ExtViewMode} vc=${vc} type=${viewType} rows=${topRows} loading=${loading} currentUser=${currentUser} reload=${reload}/>`;
      else body = h`<${ListMode} vc=${vc} groups=${groups}/>`;

      const moreItems = [
        needsRows ? { key: 'export', label: 'Export CSV', icon: 'ti-file-export', onSelect: () => { morePop.close(); exportCsv(); } } : null,
        needsRows ? { key: 'import', label: 'Import CSV…', icon: 'ti-file-import', onSelect: () => { morePop.close(); setImporting(true); } } : null,
        { key: 'print', label: 'Print view', icon: 'ti-printer', onSelect: () => { morePop.close(); printView(); } },
        tab.view ? { key: 'link', label: 'Copy view link', icon: 'ti-link', onSelect: () => { morePop.close(); copyViewLink(); } } : null,
        needsRows ? { key: 'div', divider: true } : null,
        needsRows ? { key: 'loc', label: cfg.show_locations ? 'Hide task locations' : 'Show task locations', icon: 'ti-folder', onSelect: () => { morePop.close(); setCfg({ show_locations: !cfg.show_locations }); } } : null,
      ].filter(Boolean);

      return h`<div class="cv-root" data-view=${viewType} ref=${rootRef} tabIndex=${-1} onKeyDown=${onRootKey} onFocus=${() => publishNav()}>
        <div class="cv-printhead">${viewTitle}${' · ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        ${!compact && h`<nav class="cv-tabs" role="tablist" aria-label="Views">
          ${tabs.map(t => h`<button type="button" key=${t.key} role="tab" aria-selected=${t.key === tab.key} class=${'cv-tab' + (t.key === tab.key ? ' on' : '')} onClick=${() => selectTab(t.key)}>
            <i class=${'ti ' + t.icon}></i>${t.name}
            ${t.view && t.view.is_pinned && h`<i class="ti ti-pin cv-pin" aria-label="Pinned"></i>`}
            ${t.view && t.view.is_private && h`<i class="ti ti-lock cv-pin" aria-label="Private"></i>`}
            ${t.local && h`<i class="ti ti-device-desktop cv-pin" title="Saved on this device only" aria-label="Saved on this device only"></i>`}
          </button>`)}
          <button type="button" class="cv-tab cv-tab-add" aria-haspopup="dialog" onClick=${viewPop.toggle}><i class="ti ti-plus"></i>View</button>
          <${Pop} pop=${viewPop} width=${440}><${AddViewPopover} onCreate=${createView}/><//>
        </nav>`}

        <div class="cv-toolbar" role="toolbar" aria-label="View options">
          ${compact && h`<div style=${{ display: 'inline-flex', gap: 2 }}>${VIEW_TYPES.slice(0, 3).map(t => h`<button type="button" key=${t.key} class=${'cv-btn icon' + (tab.key === 'builtin:' + t.key ? ' on' : '')} aria-label=${t.label} title=${t.label} onClick=${() => selectTab('builtin:' + t.key)}><i class=${'ti ' + t.icon}></i></button>`)}</div>`}
          ${showGroup && h`<${Fragment}>
            <button type="button" class="cv-btn" aria-haspopup="dialog" onClick=${groupPop.toggle}><i class="ti ti-stack-2"></i>Group: ${groupLabel}</button>
            <${Pop} pop=${groupPop} width=${250}><${GroupPopover} vc=${vc} close=${groupPop.close}/><//>
          <//>`}
          ${showSub && h`<${Fragment}>
            <button type="button" class="cv-btn cv-hide-sm" aria-haspopup="dialog" onClick=${subPop.toggle}><i class="ti ti-subtask"></i>Subtasks${cfg.show_subtasks !== 'collapsed' ? ': ' + subLabel : ''}</button>
            <${Pop} pop=${subPop} width=${260}><${SubtasksPopover} vc=${vc} close=${subPop.close}/><//>
          <//>`}
          ${showCols && h`<${Fragment}>
            <button type="button" class="cv-btn cv-hide-sm" aria-haspopup="dialog" onClick=${colPop.toggle}><i class="ti ti-columns-3"></i>Columns</button>
            <${Pop} pop=${colPop} width=${270}><${ColumnsChooser} vc=${vc}/><//>
          <//>`}
          ${showFilters && h`<${Fragment}>
            <button type="button" class=${'cv-btn' + (activeFilterCount ? ' on' : '')} aria-haspopup="dialog" onClick=${filtPop.toggle}><i class="ti ti-filter"></i>Filter${activeFilterCount ? ' · ' + activeFilterCount : ''}</button>
            <${Pop} pop=${filtPop} width=${Math.min(560, window.innerWidth - 24)}>
              <${FilterBuilder} rows=${cfg.filter_rows || []} store=${store} onChange=${(fr) => setCfg({ filter_rows: fr })} onClose=${filtPop.close}/>
            <//>
            <button type="button" class=${'cv-btn' + (cfg.show_closed ? ' on' : '')} aria-pressed=${!!cfg.show_closed} onClick=${() => setCfg({ show_closed: !cfg.show_closed })}><i class="ti ti-circle-check"></i>Closed</button>
          <//>`}
          ${!compact && showPeople && sc.type !== 'my' && h`<span style=${{ display: 'inline-flex', alignItems: 'center', paddingLeft: 8 }} role="group" aria-label="Filter by assignee">
            ${topMembers.map(m => h`<button type="button" key=${m.id} class=${'cv-avchip' + (quick.includes(m.id) ? ' on' : '')} title=${m.name} aria-label=${'Filter by ' + m.name} aria-pressed=${quick.includes(m.id)}
              onClick=${() => setQuick(qs => qs.includes(m.id) ? qs.filter(x => x !== m.id) : [...qs, m.id])}><${MemberAvatar} member=${m} size=${24}/></button>`)}
            ${meId && h`<button type="button" class=${'cv-btn cv-me' + (meOnly ? ' on' : '')} aria-pressed=${meOnly} onClick=${() => setMeOnly(v => !v)}><i class="ti ti-user"></i>Me</button>`}
          </span>`}
          <span class="cv-sp"></span>
          ${dirty && !locked && h`<button type="button" class="cv-save" onClick=${saveView}>Save view</button>`}
          ${total != null && rawRows && total > rawRows.length && h`<span class="cv-loc" title="Refine filters to see everything">${rawRows.length} of ${total}</span>`}
          ${searchOpen || q
            ? h`<span class="cv-search"><i class="ti ti-search" style=${{ color: 'var(--cu-t3,#8e8e99)' }}></i>
                <input autoFocus aria-label="Search tasks" placeholder="Search tasks…" value=${q} onChange=${e => setQ(e.target.value)}
                  onKeyDown=${e => { if (e.key === 'Escape') { setQ(''); setSearchOpen(false); } }} onBlur=${() => { if (!q) setSearchOpen(false); }}/>
                ${q && h`<button type="button" class="cv-iconbtn" style=${{ width: 20, height: 20 }} aria-label="Clear search" onClick=${() => { setQ(''); setSearchOpen(false); }}><i class="ti ti-x" style=${{ fontSize: 13 }}></i></button>`}
              </span>`
            : h`<button type="button" class="cv-btn icon ghost" aria-label="Search tasks" onClick=${() => setSearchOpen(true)}><i class="ti ti-search"></i></button>`}
          <button type="button" class="cv-btn icon ghost" aria-label="More view actions" aria-haspopup="menu" onClick=${morePop.toggle}><i class="ti ti-dots"></i></button>
          <${Pop} pop=${morePop} width=${240} placement="bottom-end">
            <${Menu} items=${moreItems}/>
            ${needsRows && h`<div class="cv-note" style=${{ borderTop: '1px solid var(--cu-bd,#e8e8eb)', padding: '8px 10px' }}>
              <i class="ti ti-keyboard"></i> J / K move · Enter open · E status · A assignee · D due · X select
            </div>`}
          <//>
          ${!compact && h`<button type="button" class="cv-btn icon ghost" aria-label="Customize view" onClick=${() => setCustomizing(true)}><i class="ti ti-settings"></i></button>`}
          ${viewType !== 'embed' && h`<${AddTaskSplit} allowPost=${allowPost} onTask=${() => createTask()} onPost=${() => createTask({ type: 'post' })}/>`}
        </div>

        <div class="cv-body">${body}</div>

        ${selected.size > 0 && h`<${BulkBar} ids=${Array.from(selected)} vc=${vc} onClear=${() => setSelected(new Set())}/>`}
        ${kp && h`<${KeyPicker} kp=${kp} vc=${vc} onClose=${closeKp}/>`}
        ${importing && h`<${ImportModal} vc=${vc} defaultListId=${scopeDefaults.list_id || ''} onClose=${() => setImporting(false)}/>`}
        ${customizing && h`<${CustomizePanel} vc=${vc} tab=${tab} meId=${meId} dirty=${dirty} onClose=${() => setCustomizing(false)}
          onRename=${renameView} onFlag=${flagView} onSaveNew=${saveAsNew} onDelete=${deleteView} onSave=${saveView}
          onCopyLink=${tab.view ? copyViewLink : null} onPromoteLocal=${tab.local ? promoteLocal : null}/>`}
      </div>`;
    }

    // =========================================================================
    // SharedView — renders the saved view behind a #/view/<id> link
    // =========================================================================
    function SharedView({ id, currentUser, showToast, compact }) {
      const store = useTaskStore();
      if (!store.ready) {
        return h`<div class="cv-root"><div class="cv-loading">${[0, 1, 2, 3].map(i => h`<div key=${i} style=${{ marginBottom: 10 }}><${Skel} h=${i ? 36 : 44}/></div>`)}</div></div>`;
      }
      const v = (store.views || []).find(x => String(x.id) === String(id));
      if (!v) {
        return h`<div class="cv-root" style=${{ padding: 32 }}><${EmptyState} icon="ti-eye-off" title="That view isn’t available"
          sub="It may have been deleted, or it’s a private view that belongs to someone else."/></div>`;
      }
      const sc = viewScope(v);
      const client = sc.clientId && store.clientById ? store.clientById[sc.clientId] : null;
      const list = sc.listId && store.listById ? store.listById[sc.listId] : null;
      const title = client ? client.name : list ? list.name
        : sc.type === 'my' || sc.type === 'home' ? 'My tasks' : sc.type === 'agency' ? 'Agency' : 'All tasks';
      return h`<${TaskViews} key=${v.id} scope=${{ ...sc, title }} currentUser=${currentUser} showToast=${showToast} initialView=${v.id} compact=${compact}/>`;
    }

    return { TaskViews, QuickAddRow, SharedView, openView, viewScope, sanitizeEmbed, parseCsv, VIEW_TYPES };
  }

  window.AMS_VIEWS = { buildViews };
})();

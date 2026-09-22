/* ============================================================================
 * tasks.js — ClickUp-parity task core (data layer + UI atoms + task view)
 *
 *   window.AMS_TASKS.buildTasks(deps) → { TaskAPI, taskBus, TaskStoreProvider,
 *     useTaskStore, useTasks, PRIORITIES, TYPE_META, isOverdue, isDone, fmtDue,
 *     fmtMinutes, openTask, openCreateTask, openPostEditor, Popover, Menu,
 *     StatusPill, StatusPicker, StatusIcon, PriorityFlag, PriorityPicker,
 *     AssigneeStack, AssigneePicker, DueChip, DatePicker, TagChips, TagPicker,
 *     ClientBadge, TypeIcon, MemberAvatar, InlineTitle, EmptyState, SectionCard,
 *     TaskPanel, CreateTaskModal, … }
 *
 * Contract: docs/clickup-parity-contract.md §6.1 (RPCs §5, shapes §4, enums §3,
 * design language §1). Built from index.html's shared bridge — single React
 * instance, hooks from deps, never import React here.
 * ==========================================================================*/
(function () {
  function buildTasks(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo,
            rpcCall, supabase, Av, Skel, fmtRelative } = deps;
    const useLayoutEffect = React.useLayoutEffect || useEffect;
    const Fragment = React.Fragment;

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-tasks-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-tasks-styles';
      st.textContent = `
      /* token fallbacks — zero specificity, so index.html's global tokens win */
      :where(:root){--cu-bg:#ffffff;--cu-bg2:#f7f7f8;--cu-bg3:#efeff1;--cu-bd:#e8e8eb;--cu-bd2:#d6d6db;--cu-t1:#1f1f23;--cu-t2:#5c5c66;--cu-t3:#8e8e99;--cu-accent:#ff00ee;--cu-accent-ink:#a8009c;--cu-accent-fog:rgba(255,0,238,.08);--cu-shadow:0 8px 28px rgba(15,15,20,.14),0 2px 6px rgba(15,15,20,.06);--cu-radius:8px;--cu-radius-sm:6px}
      :where(html.dark){--cu-bg:#1c1b1f;--cu-bg2:#161518;--cu-bg3:#26252a;--cu-bd:#2d2c31;--cu-bd2:#3b3a40;--cu-t1:#ececef;--cu-t2:#a9a8b1;--cu-t3:#75747d;--cu-accent:#ff66f5;--cu-accent-ink:#ff7df6;--cu-accent-fog:rgba(255,102,245,.12);--cu-shadow:0 10px 30px rgba(0,0,0,.55)}

      .cu-root,.cu-pop,.cu-modal{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--cu-t1)}
      .cu-root *,.cu-pop *,.cu-modal *{box-sizing:border-box}
      .cu-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:var(--cu-radius-sm);border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t1);font:600 13px/1 inherit;font-family:inherit;cursor:pointer;white-space:nowrap}
      .cu-btn:hover{background:var(--cu-bg3)}
      .cu-btn:disabled{opacity:.5;cursor:not-allowed}
      .cu-btn-pri{background:var(--cu-accent);border-color:var(--cu-accent);color:#fff}
      .cu-btn-pri:hover{background:#e600d6;border-color:#e600d6}
      .cu-btn-ghost{border-color:transparent;background:transparent;color:var(--cu-t2)}
      .cu-btn-ghost:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .cu-btn-danger{color:#e5484d}
      .cu-ibtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:var(--cu-radius-sm);border:none;background:transparent;color:var(--cu-t2);cursor:pointer;font-size:16px;flex-shrink:0;padding:0}
      .cu-ibtn:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .cu-ibtn.on{color:var(--cu-accent-ink)}
      .cu-root button:focus-visible,.cu-pop button:focus-visible,.cu-modal button:focus-visible,.cu-root input:focus-visible,.cu-modal input:focus-visible,.cu-modal textarea:focus-visible,.cu-pop input:focus-visible,.cu-trig:focus-visible{outline:2px solid var(--cu-accent);outline-offset:1px}
      .cu-trig{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:2px 6px;border-radius:var(--cu-radius-sm);border:1px solid transparent;background:transparent;color:var(--cu-t1);font:400 13px/1.2 inherit;font-family:inherit;cursor:pointer;text-align:left;max-width:100%}
      .cu-trig:hover{background:var(--cu-bg3)}
      .cu-trig.muted{color:var(--cu-t3)}
      .cu-input{width:100%;height:30px;padding:0 10px;border:1px solid var(--cu-bd2);border-radius:var(--cu-radius-sm);background:var(--cu-bg);color:var(--cu-t1);font:400 13px inherit;font-family:inherit}
      .cu-input:focus{outline:none;border-color:var(--cu-accent)}
      .cu-input::placeholder,.cu-ta::placeholder{color:var(--cu-t3)}
      .cu-ta{width:100%;border:1px solid transparent;border-radius:var(--cu-radius-sm);background:transparent;color:var(--cu-t1);font:400 14px/1.55 inherit;font-family:inherit;resize:none;padding:8px 10px;overflow:hidden}
      .cu-ta:hover{background:var(--cu-bg2)}
      .cu-ta:focus{outline:none;border-color:var(--cu-bd2);background:var(--cu-bg)}

      /* popover + menus + pickers */
      .cu-pop{position:fixed;z-index:1200;background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);box-shadow:var(--cu-shadow);max-height:min(440px,calc(100vh - 16px));overflow:auto;font-size:13px;animation:cu-fade .12s ease-out}
      @keyframes cu-fade{from{opacity:0}to{opacity:1}}
      .cu-menu{padding:4px;min-width:180px}
      .cu-mi{display:flex;align-items:center;gap:9px;width:100%;height:32px;padding:0 10px;border:none;border-radius:var(--cu-radius-sm);background:transparent;color:var(--cu-t1);font:400 13px inherit;font-family:inherit;cursor:pointer;text-align:left}
      .cu-mi:hover,.cu-mi.act{background:var(--cu-bg3)}
      .cu-mi:disabled{opacity:.45;cursor:not-allowed}
      .cu-mi.danger{color:#e5484d}
      .cu-mi i{font-size:15px;color:var(--cu-t2);width:16px;text-align:center}
      .cu-mi.danger i{color:#e5484d}
      .cu-mi .cu-mi-r{margin-left:auto;color:var(--cu-t3);font-size:12px}
      .cu-mdiv{height:1px;background:var(--cu-bd);margin:4px 2px}
      .cu-pk-search{position:sticky;top:0;background:var(--cu-bg);padding:6px;border-bottom:1px solid var(--cu-bd);z-index:1}
      .cu-pk-search input{width:100%;height:30px;border:1px solid var(--cu-bd2);border-radius:var(--cu-radius-sm);padding:0 9px;background:var(--cu-bg);color:var(--cu-t1);font:13px inherit;font-family:inherit}
      .cu-pk-search input:focus{outline:none;border-color:var(--cu-accent)}
      .cu-pk-list{padding:4px}
      .cu-pk-grp{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3);padding:8px 10px 4px}
      .cu-pk-empty{padding:12px;color:var(--cu-t3);font-size:12px;text-align:center}
      .cu-check{margin-left:auto;color:var(--cu-accent-ink);font-size:15px}

      /* pills, chips, avatars */
      .cu-pill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
      .cu-pill.md{height:26px;font-size:12px;padding:0 10px}
      .cu-chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 7px;border-radius:4px;background:var(--cu-bg3);color:var(--cu-t2);font-size:12px;white-space:nowrap}
      .cu-tag{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap}
      .cu-avs{display:inline-flex;align-items:center}
      .cu-avs>*{margin-left:-6px;box-shadow:0 0 0 2px var(--cu-bg);border-radius:50%}
      .cu-avs>*:first-child{margin-left:0}
      .cu-av-more{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--cu-bg3);color:var(--cu-t2);font-size:10px;font-weight:600}
      .cu-av-empty{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;border:1px dashed var(--cu-bd2);color:var(--cu-t3)}
      .cu-due{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--cu-t2);white-space:nowrap}
      .cu-due.overdue{color:#e5484d}.cu-due.today{color:#d97706}.cu-due.soon{color:var(--cu-t1)}
      .cu-cb{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--cu-t2);min-width:0}
      .cu-cb-sq{display:inline-flex;align-items:center;justify-content:center;border-radius:4px;color:#fff;font-weight:700;flex-shrink:0}
      .cu-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:36px 20px;color:var(--cu-t3)}
      .cu-empty i.cu-empty-ic{font-size:36px;opacity:.5}
      .cu-empty-t{font-size:14px;font-weight:600;color:var(--cu-t2)}
      .cu-empty-s{font-size:12px;max-width:320px}
      .cu-card{background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);display:flex;flex-direction:column;min-width:0}
      .cu-card-hd{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--cu-bd);min-height:44px}
      .cu-card-t{font-size:15px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cu-card-b{padding:10px 14px;min-width:0}
      .cu-ititle{display:block;width:100%;border:1px solid transparent;border-radius:var(--cu-radius-sm);background:transparent;color:inherit;font:inherit;resize:none;padding:2px 4px;margin:0 -4px;overflow:hidden;line-height:1.3}
      .cu-ititle:hover{background:var(--cu-bg2)}
      .cu-ititle:focus{outline:none;border-color:var(--cu-bd2);background:var(--cu-bg)}

      /* date picker */
      .cu-dp{display:flex;min-width:0}
      .cu-dp-quick{width:140px;border-right:1px solid var(--cu-bd);padding:6px;flex-shrink:0}
      .cu-dp-cal{padding:10px;width:252px}
      .cu-dp-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-weight:600;font-size:13px}
      .cu-dp-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
      .cu-dp-dow{font-size:10px;color:var(--cu-t3);font-weight:600;padding:4px 0}
      .cu-dp-day{height:30px;border:none;border-radius:50%;background:transparent;color:var(--cu-t1);font:12px inherit;font-family:inherit;cursor:pointer}
      .cu-dp-day:hover{background:var(--cu-bg3)}
      .cu-dp-day.out{color:var(--cu-t3)}
      .cu-dp-day.today{color:var(--cu-accent-ink);font-weight:700}
      .cu-dp-day.sel{background:var(--cu-accent);color:#fff;font-weight:600}
      .cu-dp-foot{display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--cu-bd);flex-wrap:wrap}
      @media(max-width:520px){.cu-dp{flex-direction:column}.cu-dp-quick{width:auto;border-right:none;border-bottom:1px solid var(--cu-bd);display:flex;flex-wrap:wrap;gap:2px}.cu-dp-quick .cu-mi{width:auto}.cu-dp-cal{width:100%}}
      /* task panel (modal) */
      .cu-modal-bg{position:fixed;inset:0;z-index:900;background:rgba(10,10,14,.45);display:flex;align-items:center;justify-content:center;padding:2vh 2vw;animation:cu-fade .15s ease-out}
      .cu-modal{background:var(--cu-bg);border-radius:12px;box-shadow:var(--cu-shadow);display:flex;flex-direction:column;overflow:hidden;position:relative}
      .cu-tp{width:min(1180px,96vw);height:90vh}
      .cu-tp-hd{display:flex;align-items:center;gap:6px;padding:8px 12px 8px 18px;border-bottom:1px solid var(--cu-bd);min-height:48px;flex-shrink:0}
      .cu-crumb{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--cu-t2);min-width:0;flex:1;overflow:hidden}
      .cu-crumb span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cu-crumb .sep{color:var(--cu-t3)}
      .cu-idchip{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--cu-t2);background:var(--cu-bg3);border:none;border-radius:4px;padding:5px 7px;cursor:pointer;white-space:nowrap}
      .cu-idchip:hover{color:var(--cu-t1)}
      .cu-tp-body{flex:1;display:grid;grid-template-columns:minmax(0,1fr) 380px;min-height:0}
      .cu-tp-left{overflow-y:auto;padding:22px 34px 60px;min-width:0;position:relative}
      .cu-tp-right{background:var(--cu-bg2);border-left:1px solid var(--cu-bd);display:flex;flex-direction:column;min-height:0;min-width:0}
      .cu-typechip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border-radius:var(--cu-radius-sm);border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t2);font:500 12px inherit;font-family:inherit;cursor:pointer}
      .cu-typechip:hover{background:var(--cu-bg3)}
      .cu-tp-title{font-size:24px;font-weight:600;margin:10px 0 16px;color:var(--cu-t1)}
      .cu-props{display:grid;grid-template-columns:160px minmax(0,1fr);row-gap:2px;column-gap:10px;align-items:center;margin-bottom:6px}
      .cu-pl{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--cu-t2);min-height:34px;white-space:nowrap;overflow:hidden}
      .cu-pl i{font-size:16px;color:var(--cu-t3);width:18px;text-align:center}
      .cu-pv{display:flex;align-items:center;gap:6px;min-height:34px;min-width:0;flex-wrap:wrap}
      .cu-collapse{margin:4px 0 18px}
      .cu-sec{margin-top:26px}
      .cu-sec-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px}
      .cu-sec-t{font-size:15px;font-weight:600}
      .cu-sec-sub{font-size:12px;color:var(--cu-t3)}
      .cu-prog{flex:1;max-width:160px;height:6px;background:var(--cu-bg3);border-radius:3px;overflow:hidden}
      .cu-prog>div{height:100%;background:#30a46c;border-radius:3px;transition:width .2s}
      .cu-rows{border:1px solid var(--cu-bd);border-radius:var(--cu-radius);overflow:hidden}
      .cu-srow{display:flex;align-items:center;gap:8px;min-height:36px;padding:0 10px;border-top:1px solid var(--cu-bd);font-size:13px}
      .cu-srow:first-child{border-top:none}
      .cu-srow:hover{background:var(--cu-bg2)}
      .cu-srow-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;background:none;border:none;color:inherit;font:inherit;text-align:left;padding:0}
      .cu-srow-t:hover{color:var(--cu-accent-ink)}
      .cu-srow.done .cu-srow-t{color:var(--cu-t3);text-decoration:line-through}
      .cu-addrow{display:flex;align-items:center;gap:8px;min-height:36px;padding:0 10px;color:var(--cu-t3);font-size:13px;border-top:1px solid var(--cu-bd)}
      .cu-addrow input{flex:1;border:none;background:transparent;color:var(--cu-t1);font:13px inherit;font-family:inherit;height:32px}
      .cu-addrow input:focus{outline:none}
      .cu-addbtn{display:inline-flex;align-items:center;gap:6px;border:none;background:transparent;color:var(--cu-t3);font:13px inherit;font-family:inherit;cursor:pointer;padding:6px 4px;border-radius:var(--cu-radius-sm)}
      .cu-addbtn:hover{color:var(--cu-t1);background:var(--cu-bg3)}
      .cu-hov{opacity:0;transition:opacity .1s}
      .cu-srow:hover .cu-hov,.cu-srow:focus-within .cu-hov,.cu-cmt:hover .cu-hov,.cu-cmt:focus-within .cu-hov,.cu-att:hover .cu-hov,.cu-att:focus-within .cu-hov{opacity:1}
      @media(hover:none){.cu-hov{opacity:1}}
      .cu-cbx{width:16px;height:16px;border-radius:4px;border:1.5px solid var(--cu-bd2);background:var(--cu-bg);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;padding:0;color:#fff}
      .cu-cbx.on{background:#30a46c;border-color:#30a46c}
      .cu-drop{border:1.5px dashed var(--cu-bd2);border-radius:var(--cu-radius);padding:18px;text-align:center;color:var(--cu-t3);font-size:13px;cursor:pointer;background:transparent;width:100%;font-family:inherit}
      .cu-drop:hover,.cu-drop.over{border-color:var(--cu-accent);color:var(--cu-accent-ink);background:var(--cu-accent-fog)}
      .cu-att-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:10px}
      .cu-att{border:1px solid var(--cu-bd);border-radius:var(--cu-radius);overflow:hidden;position:relative;background:var(--cu-bg)}
      .cu-att-th{height:96px;display:flex;align-items:center;justify-content:center;background:var(--cu-bg2);color:var(--cu-t3);font-size:30px;overflow:hidden}
      .cu-att-th img{width:100%;height:100%;object-fit:cover;display:block}
      .cu-att-meta{padding:6px 8px;font-size:12px;min-width:0}
      .cu-att-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--cu-t1)}
      .cu-att-del{position:absolute;top:6px;right:6px;background:var(--cu-bg);box-shadow:var(--cu-shadow)}
      .cu-post{border:1px solid var(--cu-bd);border-radius:var(--cu-radius);padding:14px;display:flex;gap:14px;background:var(--cu-bg2)}
      .cu-post-th{width:96px;height:120px;border-radius:var(--cu-radius-sm);object-fit:cover;background:var(--cu-bg3);flex-shrink:0}
      .cu-post-kv{display:grid;grid-template-columns:120px minmax(0,1fr);gap:6px 10px;font-size:13px;flex:1;min-width:0;align-content:start}
      .cu-post-kv .k{color:var(--cu-t3)}

      /* activity / comments */
      .cu-tabs{display:flex;gap:2px;padding:0 12px;border-bottom:1px solid var(--cu-bd);flex-shrink:0;min-height:44px;align-items:stretch}
      .cu-tab{border:none;background:transparent;color:var(--cu-t2);font:600 13px inherit;font-family:inherit;padding:0 10px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:inline-flex;align-items:center;gap:6px}
      .cu-tab:hover{color:var(--cu-t1)}
      .cu-tab.on{color:var(--cu-t1);border-bottom-color:var(--cu-accent)}
      .cu-tab .n{font-size:11px;color:var(--cu-t3);font-weight:500}
      .cu-feed{flex:1;overflow-y:auto;padding:14px 14px 10px;min-height:0;display:flex;flex-direction:column;gap:8px}
      .cu-act{font-size:12px;color:var(--cu-t3);line-height:1.45;padding:0 4px;display:flex;gap:6px}
      .cu-act b{color:var(--cu-t2);font-weight:600}
      .cu-act .when{margin-left:auto;white-space:nowrap;padding-left:6px}
      .cu-cmt{background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);padding:10px 12px;font-size:13px;position:relative}
      .cu-cmt.assigned{border-color:rgba(255,0,238,.35)}
      .cu-cmt-hd{display:flex;align-items:center;gap:8px;margin-bottom:4px;min-width:0}
      .cu-cmt-n{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cu-cmt-w{font-size:11px;color:var(--cu-t3);white-space:nowrap}
      .cu-cmt-acts{margin-left:auto;display:flex;gap:0}
      .cu-cmt-body{white-space:pre-wrap;word-break:break-word;line-height:1.5}
      .cu-mention{color:var(--cu-accent-ink);background:var(--cu-accent-fog);border-radius:3px;padding:0 2px;font-weight:600}
      .cu-assignbar{display:flex;align-items:center;gap:8px;margin-top:8px;padding:6px 8px;border-radius:var(--cu-radius-sm);background:var(--cu-accent-fog);font-size:12px;color:var(--cu-t2);flex-wrap:wrap}
      .cu-assignbar.resolved{background:rgba(48,164,108,.1)}
      .cu-reacts{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;align-items:center}
      .cu-react{display:inline-flex;align-items:center;gap:3px;height:22px;padding:0 6px;border-radius:11px;border:1px solid var(--cu-bd);background:var(--cu-bg);font-size:12px;cursor:pointer;color:var(--cu-t2);font-family:inherit}
      .cu-react.mine{border-color:var(--cu-accent);background:var(--cu-accent-fog);color:var(--cu-accent-ink)}
      .cu-thread{margin-top:8px;padding-left:12px;border-left:2px solid var(--cu-bd);display:flex;flex-direction:column;gap:6px}
      .cu-thread .cu-cmt{border:none;padding:4px 0;background:transparent}
      .cu-cmt-att{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
      .cu-cmt-att a{display:inline-flex;align-items:center;gap:5px;max-width:200px;font-size:12px;color:var(--cu-t1);text-decoration:none;background:var(--cu-bg2);border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);padding:4px 8px;overflow:hidden}
      .cu-cmt-att img{max-width:180px;max-height:120px;border-radius:var(--cu-radius-sm);display:block}
      .cu-composer{border-top:1px solid var(--cu-bd);padding:10px 12px;background:var(--cu-bg2);flex-shrink:0;position:relative}
      .cu-composer.inline{border:none;padding:6px 0 0;background:transparent}
      .cu-comp-box{border:1px solid var(--cu-bd2);border-radius:var(--cu-radius);background:var(--cu-bg)}
      .cu-comp-box:focus-within{border-color:var(--cu-accent)}
      .cu-comp-box textarea{width:100%;border:none;background:transparent;color:var(--cu-t1);font:13px/1.5 inherit;font-family:inherit;resize:none;padding:9px 11px 4px;min-height:40px;max-height:180px;display:block}
      .cu-comp-box textarea:focus{outline:none}
      .cu-comp-bar{display:flex;align-items:center;gap:2px;padding:4px 6px 6px;flex-wrap:wrap}
      .cu-at{position:absolute;left:12px;right:12px;bottom:calc(100% - 4px);background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);box-shadow:var(--cu-shadow);max-height:220px;overflow-y:auto;z-index:30;padding:4px}
      .cu-pend{display:flex;gap:6px;flex-wrap:wrap;padding:0 8px 4px}

      /* create modal */
      .cu-cm{width:min(720px,96vw);max-height:92vh}
      .cu-cm-hd{display:flex;align-items:center;gap:8px;padding:12px 14px 0 18px}
      .cu-cm-body{padding:8px 18px 12px;overflow-y:auto}
      .cu-cm-title{width:100%;border:none;background:transparent;color:var(--cu-t1);font:600 20px/1.3 inherit;font-family:inherit;padding:8px 0}
      .cu-cm-title:focus{outline:none}
      .cu-cm-desc{width:100%;border:none;background:transparent;color:var(--cu-t1);font:14px/1.5 inherit;font-family:inherit;resize:none;min-height:60px;padding:4px 0}
      .cu-cm-desc:focus{outline:none}
      .cu-cm-chips{display:flex;gap:6px;flex-wrap:wrap;padding:10px 0 4px}
      .cu-cm-chips .cu-trig{border-color:var(--cu-bd);height:30px}
      .cu-cm-foot{display:flex;align-items:center;gap:8px;padding:10px 18px;border-top:1px solid var(--cu-bd);flex-wrap:wrap}
      .cu-seg{display:inline-flex;border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);overflow:hidden}
      .cu-seg button{border:none;background:var(--cu-bg);color:var(--cu-t2);font:500 12px inherit;font-family:inherit;padding:0 10px;height:28px;cursor:pointer;border-left:1px solid var(--cu-bd)}
      .cu-seg button:first-child{border-left:none}
      .cu-seg button.on{background:var(--cu-accent-fog);color:var(--cu-accent-ink);font-weight:600}
      .cu-err{color:#e5484d;font-size:12px}
      .cu-spin{animation:cu-spin 1s linear infinite;display:inline-block}
      @keyframes cu-spin{to{transform:rotate(360deg)}}

      /* WhatsApp follow-ups + nudge (migration 089) */
      .cu-wa-chip{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 2px 0 8px;border-radius:12px;background:rgba(37,211,102,.12);color:#11803e;font-size:12px;font-weight:500;max-width:100%;min-width:0}
      html.dark .cu-wa-chip{background:rgba(37,211,102,.16);color:#5ee08f}
      .cu-wa-chip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .cu-wa-chip>i{font-size:13px;flex-shrink:0}
      .cu-wa-chip.off{background:var(--cu-bg3);color:var(--cu-t3)}
      .cu-wa-chip>.cu-wa-n{font-size:10.5px;opacity:.75;flex-shrink:0;overflow:visible}
      .cu-wa-x{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:none;border-radius:50%;background:transparent;color:inherit;cursor:pointer;padding:0;flex-shrink:0;opacity:.7}
      .cu-wa-x:hover{opacity:1;background:rgba(0,0,0,.08)}
      html.dark .cu-wa-x:hover{background:rgba(255,255,255,.1)}
      .cu-wa-x i{font-size:12px}
      .cu-wa-x:focus-visible,.cu-wa-sel:focus-visible,.cu-wa-btn:focus-visible{outline:2px solid var(--cu-accent);outline-offset:1px}
      .cu-trig.cu-wa-tog.on{border-color:rgba(37,211,102,.6);background:rgba(37,211,102,.1);color:#11803e}
      html.dark .cu-trig.cu-wa-tog.on{color:#5ee08f}
      .cu-wa-sel{height:30px;border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);background:var(--cu-bg);color:var(--cu-t1);font-size:13px;font-family:inherit;padding:0 6px;max-width:min(240px,100%);min-width:0}
      .cu-wa-preview{font-size:12px;line-height:1.45;white-space:pre-wrap;word-break:break-word;background:var(--cu-bg2);border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);padding:8px 10px;max-height:160px;overflow:auto;color:var(--cu-t1)}
      .cu-wa-btn{text-decoration:none}
      .cu-wa-hint{font-size:11.5px;color:var(--cu-t3);line-height:1.4}

      /* v2 — relationships, dialogs, drawers, recurrence, reminders, status timeline */
      .cu-blocked{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:12px;border:none;background:rgba(229,72,77,.12);color:#d23c41;font:600 12px/1 inherit;font-family:inherit;cursor:pointer;white-space:nowrap;flex-shrink:0}
      html.dark .cu-blocked{background:rgba(229,72,77,.18);color:#ff8589}
      .cu-blocked:hover{background:rgba(229,72,77,.22)}
      .cu-blocked:focus-visible{outline:2px solid var(--cu-accent);outline-offset:1px}
      .cu-nav{display:inline-flex;align-items:center;flex-shrink:0}
      .cu-nav-n{font-size:12px;color:var(--cu-t3);padding:0 2px;white-space:nowrap;font-variant-numeric:tabular-nums}
      .cu-rel-grp{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3);padding:7px 10px 5px;display:flex;align-items:center;gap:6px;border-top:1px solid var(--cu-bd);background:var(--cu-bg2)}
      .cu-rel-grp:first-child{border-top:none}
      .cu-rel-grp.warn{color:#d23c41}
      html.dark .cu-rel-grp.warn{color:#ff8589}
      .cu-cid{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--cu-t3);white-space:nowrap}
      .cu-roll{font-size:12px;color:var(--cu-t3);white-space:nowrap}
      .cu-rem{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 2px 0 8px;border-radius:12px;background:var(--cu-accent-fog);color:var(--cu-accent-ink);font-size:12px;font-weight:500;max-width:100%;min-width:0}
      .cu-rem>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .cu-rem>i{font-size:13px;flex-shrink:0}
      .cu-dlg-bg{position:fixed;inset:0;z-index:1100;background:rgba(10,10,14,.42);display:flex;align-items:center;justify-content:center;padding:16px;animation:cu-fade .12s ease-out}
      .cu-dlg{width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:18px 18px 14px;gap:10px}
      .cu-dlg-hd{display:flex;align-items:flex-start;gap:10px}
      .cu-dlg-ic{font-size:20px;color:var(--cu-accent-ink);margin-top:1px;flex-shrink:0}
      .cu-dlg-ic.danger{color:#e5484d}.cu-dlg-ic.warn{color:#d97706}
      .cu-dlg-t{font-size:15px;font-weight:600;line-height:1.35}
      .cu-dlg-b{font-size:13px;color:var(--cu-t2);line-height:1.5}
      .cu-dlg-ft{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:6px}
      .cu-btn-dz{background:#e5484d;border-color:#e5484d;color:#fff}
      .cu-btn-dz:hover{background:#d23c41;border-color:#d23c41}
      .cu-issues{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
      .cu-issues li{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--cu-t1);line-height:1.4}
      .cu-issues i{color:var(--cu-t3);font-size:15px;margin-top:1px;flex-shrink:0}
      .cu-drawer-bg{position:absolute;inset:0;z-index:40;background:rgba(10,10,14,.25);display:flex;justify-content:flex-end;animation:cu-fade .12s ease-out}
      .cu-drawer{width:min(480px,100%);height:100%;background:var(--cu-bg);border-left:1px solid var(--cu-bd);box-shadow:var(--cu-shadow);display:flex;flex-direction:column;min-height:0;outline:none}
      .cu-drawer-hd{display:flex;align-items:center;gap:8px;padding:8px 12px 8px 16px;border-bottom:1px solid var(--cu-bd);min-height:48px;flex-shrink:0}
      .cu-drawer-b{flex:1;overflow-y:auto;padding:12px}
      .cu-ver{display:block;width:100%;text-align:left;border:1px solid var(--cu-bd);border-radius:var(--cu-radius);background:var(--cu-bg);padding:9px 11px;margin-bottom:8px;cursor:pointer;font-family:inherit;color:var(--cu-t1)}
      .cu-ver:hover{background:var(--cu-bg2)}
      .cu-ver.on{border-color:var(--cu-accent);background:var(--cu-accent-fog)}
      .cu-ver:focus-visible{outline:2px solid var(--cu-accent);outline-offset:1px}
      .cu-ver-meta{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--cu-t3);margin-bottom:4px;flex-wrap:wrap}
      .cu-ver-meta b{color:var(--cu-t1);font-weight:600}
      .cu-ver-body{font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:var(--cu-t2)}
      .cu-ver-body.clip{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .cu-sth{padding:8px 14px 9px;border-bottom:1px solid var(--cu-bd);flex-shrink:0}
      .cu-sth-hd{display:flex;align-items:center;gap:6px;width:100%;border:none;background:transparent;padding:0;cursor:pointer;color:var(--cu-t2);font:600 12px inherit;font-family:inherit;text-align:left}
      .cu-sth-hd:focus-visible{outline:2px solid var(--cu-accent);outline-offset:2px}
      .cu-sth-bar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--cu-bg3);margin-top:6px;gap:1px}
      .cu-sth-bar>span{display:block;height:100%;min-width:2px}
      .cu-sth-list{margin-top:6px;display:flex;flex-direction:column}
      .cu-sth-row{display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0;color:var(--cu-t2)}
      .cu-sth-row .v{margin-left:auto;color:var(--cu-t1);font-variant-numeric:tabular-nums;white-space:nowrap}
      .cu-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;display:inline-block}
      .cu-form{padding:12px;display:flex;flex-direction:column;gap:10px;font-size:13px}
      .cu-form-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .cu-form-l{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3)}
      .cu-sel{height:30px;border:1px solid var(--cu-bd2);border-radius:var(--cu-radius-sm);background:var(--cu-bg);color:var(--cu-t1);font:13px inherit;font-family:inherit;padding:0 6px;max-width:100%}
      .cu-sel:focus{outline:none;border-color:var(--cu-accent)}
      .cu-wd{display:flex;gap:4px;flex-wrap:wrap}
      .cu-wd button{width:36px;height:28px;border-radius:var(--cu-radius-sm);border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t2);font:500 12px inherit;font-family:inherit;cursor:pointer;padding:0}
      .cu-wd button.on{background:var(--cu-accent);border-color:var(--cu-accent);color:#fff}
      .cu-wd button:focus-visible{outline:2px solid var(--cu-accent);outline-offset:1px}
      .cu-ext-err{font-size:12px;color:var(--cu-t3);padding:8px 10px;border:1px dashed var(--cu-bd2);border-radius:var(--cu-radius-sm)}
      .cu-ext-pane{flex:1;overflow-y:auto;padding:14px;min-height:0}
      .cu-feed[hidden]{display:none}
      .cu-ai{border:1px solid var(--cu-bd);border-radius:var(--cu-radius);margin-top:10px;overflow:hidden}
      .cu-ai-hd{display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--cu-bg2);font-size:12px;font-weight:600;color:var(--cu-t2)}
      .cu-ai-row{display:flex;align-items:center;gap:8px;padding:2px 10px;border-top:1px solid var(--cu-bd);min-height:36px}
      .cu-ai-row input.t{flex:1;min-width:0;border:none;background:transparent;color:var(--cu-t1);font:13px inherit;font-family:inherit;height:30px}
      .cu-ai-row input.t:focus{outline:none}
      .cu-ai-row.off input.t{color:var(--cu-t3);text-decoration:line-through}
      .cu-tpl-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 2px 0 9px;border-radius:13px;background:var(--cu-accent-fog);color:var(--cu-accent-ink);font-size:12px;font-weight:600;max-width:100%;min-width:0}
      .cu-tpl-chip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}

      @media(max-width:760px){
        .cu-modal-bg{padding:0}
        .cu-tp{width:100vw;height:100vh;height:100dvh;border-radius:0}
        .cu-tp-body{display:block;overflow-y:auto}
        .cu-tp-left{overflow:visible;padding:16px 16px 24px}
        .cu-tp-right{border-left:none;border-top:1px solid var(--cu-bd);min-height:70vh}
        .cu-feed{overflow:visible}
        .cu-props{grid-template-columns:118px minmax(0,1fr)}
        .cu-tp-title{font-size:20px}
        .cu-cm{width:100vw;max-height:100dvh;height:100dvh;border-radius:0}
        .cu-post{flex-direction:column}
        .cu-post-kv{grid-template-columns:100px minmax(0,1fr)}
      }
      @media(max-width:420px){.cu-props{grid-template-columns:96px minmax(0,1fr)}.cu-pl{font-size:12px}.cu-hide-xs{display:none!important}}
      @media(prefers-reduced-motion:reduce){.cu-pop,.cu-modal-bg,.cu-dlg-bg,.cu-drawer-bg{animation:none}.cu-prog>div{transition:none}.cu-spin{animation-duration:3s}.cu-hov{transition:none}}
      `;
      document.head.appendChild(st);
    }

    // =========================================================================
    // Constants + pure helpers
    // =========================================================================
    const PRIORITIES = {
      1: { label: 'Urgent', color: '#e5484d' },
      2: { label: 'High', color: '#f5a623' },
      3: { label: 'Normal', color: '#4c8df6' },
      4: { label: 'Low', color: '#9aa0a6' },
    };
    const TYPE_META = {
      task:       { label: 'Task',         icon: 'ti-circle-check' },
      post:       { label: 'Post',         icon: 'ti-photo' },
      direct:     { label: 'Direct task',  icon: 'ti-send' },
      milestone:  { label: 'Milestone',    icon: 'ti-diamond' },
      seo_report: { label: 'SEO report',   icon: 'ti-trending-up' },
      ad:         { label: 'Ad task',      icon: 'ti-target-arrow' },
      meeting:    { label: 'Meeting note', icon: 'ti-users' },
      request:    { label: 'Request',      icon: 'ti-inbox' },
    };
    const POST_TYPES = [
      { key: 'reel', label: 'Reel', icon: 'ti-movie' },
      { key: 'creative', label: 'Creative', icon: 'ti-photo' },
      { key: 'carousel', label: 'Carousel', icon: 'ti-layout-columns' },
      { key: 'extra', label: 'Extra', icon: 'ti-sparkles' },
    ];
    const CATEGORY_LABEL = { todo: 'Not started', active: 'Active', done: 'Closed' };
    const CATEGORY_ORDER = ['todo', 'active', 'done'];
    // Seed fallbacks (§3) — used only when bootstrap has no status rows yet.
    const DEFAULT_STATUSES = [
      ['content', 'briefed', 'Briefed', '#87909e', 'todo'], ['content', 'in_production', 'In Production', '#f5a623', 'active'],
      ['content', 'in_review', 'In Review', '#4c8df6', 'active'], ['content', 'sent_to_client', 'Sent to Client', '#8b5cf6', 'active'],
      ['content', 'revision', 'Revision', '#e5484d', 'active'], ['content', 'approved', 'Approved', '#30a46c', 'done'],
      ['content', 'scheduled', 'Scheduled', '#6366f1', 'done'], ['content', 'posted', 'Posted', '#0e7490', 'done'],
      ['content', 'missed', 'Missed', '#be123c', 'done'],
      ['general', 'todo', 'To Do', '#87909e', 'todo'], ['general', 'in_progress', 'In Progress', '#7b68ee', 'active'],
      ['general', 'review', 'Review', '#f5a623', 'active'], ['general', 'blocked', 'Blocked', '#e5484d', 'active'],
      ['general', 'done', 'Complete', '#30a46c', 'done'],
    ].map((r, i) => ({ id: 'default-' + r[0] + '-' + r[1], list_id: null, kind: r[0], key: r[1], name: r[2], color: r[3], category: r[4], position: i }));
    const TAG_COLORS = ['#e5484d', '#f5a623', '#30a46c', '#4c8df6', '#7b68ee', '#8b5cf6', '#0e7490', '#ff00ee', '#87909e', '#d97706'];
    const REACTIONS = ['👍', '✅', '🎉', '👀', '❤️'];

    const arr = (v) => (Array.isArray(v) ? v : []);
    const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
      : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2));
    const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const errMsg = (e) => {
      if (!e) return 'Something went wrong';
      if (e.code === 'forbidden') return "You don't have permission to do that";
      if (e.code === 'auth.expired' || e.message === 'auth.no_session') return 'Session expired — sign in again';
      return e.message || String(e);
    };
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const sameDay = (a, b) => a && b && new Date(a).toDateString() === new Date(b).toDateString();
    const fmtSize = (n) => { n = Number(n) || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return Math.round(n / 1024) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; };
    const isEditableTarget = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

    // ---- v2 fail-open helpers (contract v2 §0.4) ----------------------------
    // An RPC that doesn't exist yet (migration not applied) must hide the
    // feature quietly — never crash or toast-spam.
    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i.test(String((e && (e.code || '')) + ' ' + (e && (e.message || e.details || '') || '')));

    // org_task_settings.features — every key defaults to on (§3.1)
    const DEFAULT_FEATURES = {
      time_tracking: true, subtasks: true, checklists: true, multiple_assignees: true, custom_fields: true, tags: true,
      priorities: true, dependencies: true, incomplete_warning: true, reschedule_dependencies: true, recurring: true,
      templates: true, lineup: true, automations: true, docs: true, forms: true, whiteboards: true, goals: true,
      timesheets: true, clips: true,
    };
    // member_prefs defaults (§3.1)
    const DEFAULT_PREFS = {
      timezone: 'Asia/Kolkata', date_format: 'DD MMM', time_format: '12h', week_start: 1, high_contrast: false,
      reduce_motion: false, send_on_enter: false, link_previews: true, rail_pins: [], rail_hidden: [], home_filters: null,
    };
    // Latest store values, mirrored for the non-hook formatters below.
    const CUR = { prefs: DEFAULT_PREFS, features: DEFAULT_FEATURES };
    const pad2 = (n) => String(n).padStart(2, '0');

    // fmtDateUser(iso, { year, weekday }) — honours member_prefs.date_format
    function fmtDateUser(iso, opts) {
      if (!iso) return '';
      const d = iso instanceof Date ? iso : new Date(iso);
      if (isNaN(d)) return '';
      const o = opts || {};
      const dd = pad2(d.getDate()), mm = pad2(d.getMonth() + 1), yyyy = d.getFullYear();
      switch (CUR.prefs.date_format) {
        case 'DD/MM/YYYY': return dd + '/' + mm + '/' + yyyy;
        case 'MM/DD/YYYY': return mm + '/' + dd + '/' + yyyy;
        case 'YYYY-MM-DD': return yyyy + '-' + mm + '-' + dd;
        default: return d.toLocaleDateString('en-IN', { weekday: o.weekday ? 'short' : undefined, day: 'numeric', month: 'short', year: (o.year || yyyy !== new Date().getFullYear()) ? 'numeric' : undefined });
      }
    }
    // fmtTimeUser(iso) — honours member_prefs.time_format ('12h' | '24h')
    function fmtTimeUser(iso) {
      if (!iso) return '';
      const d = iso instanceof Date ? iso : new Date(iso);
      if (isNaN(d)) return '';
      if (CUR.prefs.time_format === '24h') return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
      return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    const fmtDateShort = (d) => fmtDateUser(d);
    const fmtTime = (d) => fmtTimeUser(d);
    const fmtDateTimeUser = (iso) => (iso ? fmtDateUser(iso, { year: true }) + ', ' + fmtTimeUser(iso) : '');
    const ymdLocal = (d) => { const x = d ? new Date(d) : new Date(); return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate()); };
    // "3d 4h" · "5h 10m" · "12m"
    const fmtSpanMs = (ms) => {
      const m = Math.max(0, Math.round((Number(ms) || 0) / 60000));
      if (m < 60) return m + 'm';
      const hh = Math.floor(m / 60), d = Math.floor(hh / 24);
      if (d) return d + 'd' + (hh % 24 ? ' ' + (hh % 24) + 'h' : '');
      return hh + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
    };

    // Extension registry (contract v2 §2) — read at render time.
    const extKey = (x) => x && (x.id || x.key || x.type);
    const extItems = (key) => { const ext = window.AMS_EXT || {}; return arr(ext[key]).filter(x => x && extKey(x)).slice().sort((a, b) => (a.order || 0) - (b.order || 0)); };
    const extWhen = (it, task) => { if (typeof it.when !== 'function') return true; try { return !!it.when(task); } catch (e) { console.warn('[tasks] extension when() failed', extKey(it), e); return false; } };
    const tiIcon = (ic) => (!ic ? 'ti-puzzle' : /^ti-/.test(ic) ? ic : 'ti-' + ic);

    function isDone(row) { return !!row && row.status_category === 'done'; }
    function isOverdue(row) { return !!row && !!row.due_at && !isDone(row) && new Date(row.due_at).getTime() < Date.now(); }

    // fmtDue(iso, hasTime?) → { text, tone }. hasTime defaults to "not local 23:59".
    function fmtDue(iso, hasTime) {
      if (!iso) return { text: '', tone: null };
      const d = new Date(iso);
      if (isNaN(d)) return { text: '', tone: null };
      if (hasTime === undefined) hasTime = !(d.getHours() === 23 && d.getMinutes() === 59);
      const today = startOfDay(new Date());
      const dayDiff = Math.round((startOfDay(d) - today) / 86400000);
      let text;
      if (dayDiff === 0) text = 'Today';
      else if (dayDiff === 1) text = 'Tomorrow';
      else if (dayDiff === -1) text = 'Yesterday';
      else if (dayDiff > 1 && dayDiff < 7) text = d.toLocaleDateString('en-IN', { weekday: 'short' });
      else text = fmtDateShort(d);
      if (hasTime) text += ', ' + fmtTime(d);
      const overdue = d.getTime() < Date.now();
      const tone = overdue ? 'overdue' : dayDiff === 0 ? 'today' : dayDiff <= 3 ? 'soon' : 'later';
      return { text, tone };
    }
    function fmtMinutes(n) {
      n = Math.round(Number(n) || 0);
      if (n <= 0) return '0m';
      const hh = Math.floor(n / 60), mm = n % 60;
      return (hh ? hh + 'h' : '') + (hh && mm ? ' ' : '') + (mm ? mm + 'm' : '');
    }
    // "2h 30m" · "1.5h" · "90" · "90m" · "1d" (8h) · "1:30" → minutes | null
    function parseMinutes(str) {
      const s = String(str || '').trim().toLowerCase();
      if (!s) return null;
      const colon = /^(\d+):(\d{1,2})$/.exec(s);
      if (colon) return +colon[1] * 60 + +colon[2];
      if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
      let total = 0, hit = false;
      s.replace(/(\d+(?:\.\d+)?)\s*(d|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/g, (_, num, unit) => {
        hit = true; const v = parseFloat(num);
        if (unit[0] === 'd') total += v * 480; else if (unit[0] === 'h') total += v * 60; else total += v;
        return '';
      });
      return hit ? Math.round(total) : null;
    }

    const dispatch = (name, detail) => { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) { } };
    const openTask = (id) => { if (id) dispatch('ams-open-task', { id }); };
    const openCreateTask = (initial) => dispatch('ams-create-task', { initial: initial || {} });
    const openPostEditor = (contentId) => { if (contentId) dispatch('ams-open-post', { contentId }); };
    const taskLink = (id) => location.origin + location.pathname + '#/task/' + id;
    const copyText = async (text) => {
      try { await navigator.clipboard.writeText(text); return true; }
      catch (_) {
        try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; } catch (__) { return false; }
      }
    };

    // =========================================================================
    // taskBus — tiny pub/sub. Events: task:changed {id,row?} · task:deleted {id}
    // · task:created {row} · meta:changed · (extras) timer:changed {entry} ·
    // inbox:changed · home:changed
    // =========================================================================
    const taskBus = (() => {
      const subs = {};
      return {
        on(evt, fn) { (subs[evt] = subs[evt] || new Set()).add(fn); return () => subs[evt] && subs[evt].delete(fn); },
        emit(evt, payload) { (subs[evt] ? Array.from(subs[evt]) : []).forEach(fn => { try { fn(payload); } catch (e) { console.warn('[tasks] bus handler', evt, e); } }); },
      };
    })();

    // =========================================================================
    // TaskAPI — one method per RPC (§5). Mutations emit on taskBus.
    // =========================================================================
    const call = (name, args) => rpcCall(name, args || {});
    const ATT_BUCKET = 'task-attachments';
    const changed = (id, row) => { taskBus.emit('task:changed', row ? { id: id || row.id, row } : { id }); };
    const meta = () => taskBus.emit('meta:changed');

    async function uploadFile(file) {
      const safeName = String(file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(-120) || 'file';
      const path = uuid() + '/' + safeName;
      const { error } = await supabase.storage.from(ATT_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw new Error(error.message || 'Upload failed');
      const { data } = supabase.storage.from(ATT_BUCKET).getPublicUrl(path);
      return { name: file.name || safeName, url: data && data.publicUrl, path, mime: file.type || '', size: file.size || 0 };
    }

    const TaskAPI = {
      bootstrap: () => call('task_bootstrap'),
      query: (filter) => call('tasks_query', { p_filter: filter || {} }),
      get: (id) => call('task_get', { p_id: id }),
      async create(data) { const row = await call('task_create', { p_data: data || {} }); taskBus.emit('task:created', { row }); if (row && row.parent_id) changed(row.parent_id); return row; },
      async update(id, patch) { const row = await call('task_update', { p_id: id, p_patch: patch || {} }); taskBus.emit('task:changed', Object.assign(row && row.id ? { id: id, row: row } : { id: id }, { patch: patch || {} })); return row; },
      async bulkUpdate(ids, patch) { const res = await call('task_bulk_update', { p_ids: ids, p_patch: patch || {} }); arr(ids).forEach(id => taskBus.emit('task:changed', { id: id, patch: patch || {} })); return res; },
      async setAssignees(id, ids) { const row = await call('task_set_assignees', { p_id: id, p_member_ids: arr(ids) }); changed(id, row && row.id ? row : null); return row; },
      async watch(id, on) { const res = await call('task_watch', { p_id: id, p_on: !!on }); changed(id); return res; },
      async remove(id) { const res = await call('task_delete', { p_id: id }); taskBus.emit('task:deleted', { id }); return res; },
      async duplicate(id) { const row = await call('task_duplicate', { p_id: id }); taskBus.emit('task:created', { row }); return row; },

      // checklists — trailing taskId args are optional (only used for bus payloads)
      async checklistAdd(taskId, name) { const r = await call('task_checklist_add', { p_task_id: taskId, p_name: name }); changed(taskId); return r; },
      async checklistUpdate(id, name, taskId) { const r = await call('task_checklist_update', { p_id: id, p_name: name }); changed(taskId || null); return r; },
      async checklistDelete(id, taskId) { const r = await call('task_checklist_delete', { p_id: id }); changed(taskId || null); return r; },
      async itemAdd(checklistId, text, taskId) { const r = await call('task_checklist_item_add', { p_checklist_id: checklistId, p_text: text }); changed(taskId || null); return r; },
      async itemUpdate(id, patch, taskId) { const r = await call('task_checklist_item_update', { p_id: id, p_patch: patch || {} }); changed(taskId || null); return r; },
      async itemDelete(id, taskId) { const r = await call('task_checklist_item_delete', { p_id: id }); changed(taskId || null); return r; },

      // comments
      async commentAdd(taskId, body, opts) {
        const o = opts || {};
        const r = await call('task_comment_add', { p_task_id: taskId, p_body: body || '', p_mentions: arr(o.mentions), p_parent_id: o.parentId || null, p_assigned_to: o.assignedTo || null, p_attachments: arr(o.attachments) });
        changed(taskId); return r;
      },
      async commentUpdate(id, patch) { const r = await call('task_comment_update', { p_id: id, p_patch: patch || {} }); changed(r && r.task_id || null); return r; },
      async commentDelete(id, taskId) { const r = await call('task_comment_delete', { p_id: id }); changed(taskId || null); return r; },
      async commentReact(id, emoji) { const r = await call('task_comment_react', { p_id: id, p_emoji: emoji }); return r; },
      commentsAssigned: (mode, includeResolved) => call('comments_assigned', { p_mode: mode || 'me', p_include_resolved: !!includeResolved }),
      repliesList: (unreadOnly, limit) => call('replies_list', { p_unread_only: unreadOnly !== false, p_limit: limit || 50 }),
      async repliesMarkRead(taskId) { const r = await call('replies_mark_read', { p_task_id: taskId }); taskBus.emit('inbox:changed'); return r; },

      // attachments
      uploadFile,
      async uploadAttachment(taskId, file) {
        const f = await uploadFile(file);
        const r = await call('task_attachment_add', { p_task_id: taskId, p_file: f });
        changed(taskId); return r;
      },
      async attachmentDelete(id, taskId) { const r = await call('task_attachment_delete', { p_id: id }); changed(taskId || null); return r; },

      // time tracking
      async timeStart(taskId) { const entry = await call('task_time_start', { p_task_id: taskId }); taskBus.emit('timer:changed', { entry: entry || null }); changed(taskId); return entry; },
      async timeStop() { const entry = await call('task_time_stop'); taskBus.emit('timer:changed', { entry: null, stopped: entry || null }); if (entry && entry.task_id) changed(entry.task_id); return entry; },
      async timeAdd(taskId, minutes, date, note) { const r = await call('task_time_add', { p_task_id: taskId, p_minutes: Math.round(Number(minutes) || 0), p_date: date || null, p_note: note || null }); changed(taskId); return r; },
      async timeDelete(id, taskId) { const r = await call('task_time_delete', { p_id: id }); changed(taskId || null); return r; },

      // metadata
      async listUpsert(d) { const r = await call('task_list_upsert', { p_data: d || {} }); meta(); return r; },
      async listDelete(id) { const r = await call('task_list_delete', { p_id: id }); meta(); return r; },
      async statusUpsert(d) { const r = await call('task_status_upsert', { p_data: d || {} }); meta(); return r; },
      async statusDelete(id, replaceKey) { const r = await call('task_status_delete', { p_id: id, p_replace_key: replaceKey || null }); meta(); return r; },
      async tagUpsert(d) { const r = await call('task_tag_upsert', { p_data: d || {} }); meta(); return r; },
      async tagDelete(id) { const r = await call('task_tag_delete', { p_id: id }); meta(); return r; },
      async fieldUpsert(d) { const r = await call('task_field_upsert', { p_data: d || {} }); meta(); return r; },
      async fieldDelete(id) { const r = await call('task_field_delete', { p_id: id }); meta(); return r; },
      async viewUpsert(d) { const r = await call('task_view_upsert', { p_data: d || {} }); meta(); return r; },
      async viewDelete(id) { const r = await call('task_view_delete', { p_id: id }); meta(); return r; },
      async homeLayoutSave(cards) { const r = await call('home_layout_save', { p_cards: arr(cards) }); taskBus.emit('home:changed', { cards }); return r; },
      async favoriteToggle(kind, refId, label, url) { const r = await call('favorite_toggle', { p_kind: kind, p_ref_id: String(refId), p_label: label || '', p_url: url || null }); meta(); return r; },
      async statusSet(text, emoji, dndUntil) { const r = await call('member_status_set', { p_text: text || null, p_emoji: emoji || null, p_dnd_until: dndUntil || null }); meta(); return r; },

      // WhatsApp delegation (migration 089)
      followupsList: (taskId) => call('task_followups_list', { p_task_id: taskId }),
      async followupAdd(taskId, data) { const r = await call('task_followup_add', { p_task_id: taskId, p_data: data || {} }); changed(taskId); return r; },
      async followupDelete(id, taskId) { const r = await call('task_followup_delete', { p_id: id }); changed(taskId || null); return r; },
      async whatsappNudge(taskId, note) { const r = await call('task_whatsapp_nudge', { p_task_id: taskId, p_note: note || null }); changed(taskId); return r; },
      waMySettings: () => call('wa_my_settings_get'),
      waTeamList: () => call('wa_team_list'),
      waConfigGet: () => call('wa_config_get'),
      waConfigSet: (data) => call('wa_config_set', { p_data: data || {} }),

      // ---- v2 (migration 093) — relationships -----------------------------
      async linkAdd(taskId, otherId, kind) {
        const r = await call('task_link_add', { p_task_id: taskId, p_other_id: otherId, p_kind: kind || 'relates' });
        changed(taskId); changed(otherId); taskBus.emit('links:changed', { ids: [taskId, otherId] }); return r;
      },
      async linkDelete(id, taskId, otherId) {
        const r = await call('task_link_delete', { p_id: id });
        if (taskId) changed(taskId); if (otherId) changed(otherId); taskBus.emit('links:changed', { ids: [taskId, otherId].filter(Boolean) }); return r;
      },
      linksFor: (ids) => call('task_links_for', { p_task_ids: arr(ids) }),
      closeCheck: (id) => call('task_close_check', { p_id: id }),
      // description history
      descriptionHistory: (taskId) => call('task_description_history', { p_task_id: taskId }),
      async descriptionRestore(versionId, taskId) { const row = await call('task_description_restore', { p_version_id: versionId }); changed((row && row.id) || taskId, row && row.id ? row : null); return row; },
      // reminders (caller's own)
      async reminderAdd(taskId, remindAt, note) { const r = await call('reminder_add', { p_task_id: taskId || null, p_remind_at: remindAt, p_note: note || null }); taskBus.emit('reminders:changed', { taskId: taskId || null, reminder: r }); return r; },
      remindersList: (includeSent) => call('reminders_list', { p_include_sent: !!includeSent }),
      async reminderDelete(id, taskId) { const r = await call('reminder_delete', { p_id: id }); taskBus.emit('reminders:changed', { taskId: taskId || null, deleted: id }); return r; },
      // Up next / LineUp
      lineupGet: () => call('lineup_get'),
      async lineupSet(ids) { const r = await call('lineup_set', { p_task_ids: arr(ids) }); taskBus.emit('lineup:changed', { ids: arr(ids) }); return r; },
      async lineupAdd(taskId) { const r = await call('lineup_add', { p_task_id: taskId }); taskBus.emit('lineup:changed', { taskId, in_lineup: r && typeof r.in_lineup === 'boolean' ? r.in_lineup : true }); return r; },
      async lineupRemove(taskId) { const r = await call('lineup_remove', { p_task_id: taskId }); taskBus.emit('lineup:changed', { taskId, in_lineup: r && typeof r.in_lineup === 'boolean' ? r.in_lineup : false }); return r; },
      // templates
      templateList: () => call('template_list'),
      templateGet: (id) => call('template_get', { p_id: id }),
      async templateSaveFromTask(taskId, name, description) { const r = await call('template_save_from_task', { p_task_id: taskId, p_name: name, p_description: description || null }); taskBus.emit('templates:changed'); return r; },
      async templateUpsert(d) { const r = await call('template_upsert', { p_data: d || {} }); taskBus.emit('templates:changed'); return r; },
      async templateDelete(id) { const r = await call('template_delete', { p_id: id }); taskBus.emit('templates:changed'); return r; },
      async templateApply(id, target) {
        const t = target || {};
        const r = await call('template_apply', { p_id: id, p_target: t });
        arr(r && r.created).forEach(row => taskBus.emit('task:created', { row }));
        if (t.task_id) changed(t.task_id);
        taskBus.emit('templates:changed');
        return r;
      },
      // org task settings + member prefs
      orgSettingsGet: () => call('org_task_settings_get'),
      async orgSettingsSet(patch) { const r = await call('org_task_settings_set', { p_patch: patch || {} }); taskBus.emit('settings:changed', { org_settings: r || null }); meta(); return r; },
      memberPrefsGet: () => call('member_prefs_get'),
      async memberPrefsSet(patch) { const r = await call('member_prefs_set', { p_patch: patch || {} }); taskBus.emit('prefs:changed', { prefs: r && typeof r === 'object' ? r : null, patch: patch || {} }); return r; },
      // trash / feeds / legacy / import / recurring
      trashList: (limit) => call('tasks_trash_list', { p_limit: limit || 100 }),
      async restore(id) { const row = await call('task_restore', { p_id: id }); taskBus.emit('task:created', { row }); return row; },
      activityFeed: (filter) => call('task_activity_feed', { p_filter: filter || {} }),
      attachmentsRecent: (limit) => call('attachments_recent', { p_limit: limit || 20 }),
      idForLegacy: (kind, id) => call('task_id_for_legacy', { p_kind: kind, p_id: id }),
      async importTasks(listId, rows) { const r = await call('tasks_import', { p_list_id: listId, p_rows: arr(rows) }); taskBus.emit('task:created', { row: null, imported: r && r.created }); return r; },
      recurringList: () => call('tasks_recurring_list'),

      // ---- v2 (migration 094) — notification prefs + presence -------------
      notifPrefsGet: () => call('notif_prefs_get'),
      async notifPrefsSet(prefs) { const r = await call('notif_prefs_set', { p_prefs: prefs || {} }); taskBus.emit('notifprefs:changed', { prefs: r }); return r; },
      presencePing: (visible) => call('presence_ping', { p_visible: visible !== false }),
      presenceList: () => call('presence_list'),

      // inbox / home / search
      inboxList: (tab, limit) => call('inbox_list', { p_tab: tab || 'primary', p_limit: limit || 100 }),
      async inboxSet(ids, state, snoozeUntil) { const r = await call('inbox_set', { p_ids: arr(ids), p_state: state, p_snooze_until: snoozeUntil || null }); taskBus.emit('inbox:changed'); return r; },
      inboxCounts: () => call('inbox_counts'),
      homeSummary: () => call('home_summary'),
      search: (q, limit) => call('global_search', { p_q: q || '', p_limit: limit || 8 }),
    };

    // =========================================================================
    // Store — task_bootstrap once, refetch on meta:changed + every 5 min
    // =========================================================================
    const StoreCtx = React.createContext(null);

    function buildStore(boot, extra) {
      const b = boot || {};
      const members = arr(b.members);
      const clients = arr(b.clients);
      const lists = arr(b.lists);
      const statusesRaw = arr(b.statuses).length ? arr(b.statuses) : DEFAULT_STATUSES;
      const statuses = statusesRaw.slice().sort((a, c) => (a.position || 0) - (c.position || 0));
      const tags = arr(b.tags);
      const fields = arr(b.fields);
      const views = arr(b.views);
      const favorites = arr(b.favorites);
      const idx = (xs) => { const m = {}; xs.forEach(x => { if (x && x.id != null) m[x.id] = x; }); return m; };
      const memberById = idx(members), clientById = idx(clients), listById = idx(lists), tagById = idx(tags);
      if (b.me && b.me.id && !memberById[b.me.id]) memberById[b.me.id] = b.me;

      const resolveList = (l) => (l && typeof l === 'object') ? l : (l ? listById[l] : null);
      const statusCache = {};
      const statusesFor = (listOrId) => {
        const list = resolveList(listOrId);
        const ck = list ? list.id : '__none__' + (typeof listOrId === 'string' ? '' : '');
        if (statusCache[ck]) return statusCache[ck];
        const kind = (list && list.kind) || 'general';
        let out = list ? statuses.filter(s => s.list_id === list.id) : [];
        if (!out.length) out = statuses.filter(s => !s.list_id && (s.kind || 'general') === kind);
        if (!out.length) out = DEFAULT_STATUSES.filter(s => s.kind === kind);
        return (statusCache[ck] = out);
      };
      const statusMeta = (listOrId, key) => {
        const own = statusesFor(listOrId).find(s => s.key === key);
        if (own) return own;
        const any = statuses.find(s => s.key === key) || DEFAULT_STATUSES.find(s => s.key === key);
        return any || { id: null, key, name: key ? String(key).replace(/_/g, ' ') : 'No status', color: '#87909e', category: 'todo' };
      };
      const listsForClient = (clientId) => lists
        .filter(l => !l.archived && (clientId ? l.client_id === clientId : !l.client_id))
        .sort((a, c) => (a.position || 0) - (c.position || 0) || String(a.name).localeCompare(String(c.name)));
      const fieldsFor = (listId) => fields
        .filter(f => !f.list_id || f.list_id === listId)
        .sort((a, c) => (a.position || 0) - (c.position || 0));
      const isFavorite = (kind, refId) => favorites.some(f => f.kind === kind && String(f.ref_id) === String(refId));

      // v2: org_settings + me_prefs ride along on task_bootstrap (093). Absent ⇒ defaults, v2 = false.
      const orgSettings = b.org_settings && typeof b.org_settings === 'object' ? b.org_settings : null;
      const features = { ...DEFAULT_FEATURES, ...((orgSettings && orgSettings.features && typeof orgSettings.features === 'object') ? orgSettings.features : {}) };
      const prefs = { ...DEFAULT_PREFS, ...((b.me_prefs && typeof b.me_prefs === 'object') ? b.me_prefs : {}) };
      const feature = (k) => features[k] !== false;
      const pref = (k) => prefs[k];

      return {
        ready: !!boot, error: null, me: b.me || null,
        members, memberById, clients, clientById, lists, listById, listsForClient,
        statuses, statusesFor, statusMeta, tags, tagById, fields, fieldsFor,
        views, favorites, isFavorite, homeLayout: b.home_layout || null,
        runningTimer: b.running_timer || null,
        v2: !!orgSettings, orgSettings: orgSettings || { task_prefix: 'T', work_days: [1, 2, 3, 4, 5], work_hours_per_day: 8, holidays: [], features },
        features, feature, prefs, pref,
        savePrefs: async () => null,
        ...(extra || {}),
      };
    }
    const EMPTY_STORE = buildStore(null, { reload: () => { } });

    function TaskStoreProvider({ currentUser, children }) {
      const [boot, setBoot] = useState(null);
      const [error, setError] = useState(null);
      const [timer, setTimer] = useState(undefined);   // undefined = use bootstrap value
      const [prefsOv, setPrefsOv] = useState(null);     // local prefs patch on top of bootstrap me_prefs
      const [orgOv, setOrgOv] = useState(null);         // org_settings pushed by orgSettingsSet
      const alive = useRef(true);
      const inflight = useRef(null);

      const reload = useCallback(async () => {
        if (inflight.current) return inflight.current;
        const p = (async () => {
          try {
            const data = await TaskAPI.bootstrap();
            if (!alive.current) return;
            setBoot(data || {}); setError(null); setTimer(undefined); setPrefsOv(null); setOrgOv(null);
          } catch (e) {
            if (alive.current) setError(errMsg(e));
          } finally { inflight.current = null; }
        })();
        inflight.current = p;
        return p;
      }, []);

      useEffect(() => {
        alive.current = true;
        if (!currentUser) return;
        reload();
        let t = null;
        const offMeta = taskBus.on('meta:changed', () => { clearTimeout(t); t = setTimeout(reload, 250); });
        const offTimer = taskBus.on('timer:changed', (p) => setTimer(p && p.entry ? p.entry : null));
        const offPrefs = taskBus.on('prefs:changed', (p) => { if (p && (p.prefs || p.patch)) setPrefsOv(cur => ({ ...(cur || {}), ...(p.prefs || p.patch) })); });
        const offOrg = taskBus.on('settings:changed', (p) => { if (p && p.org_settings && typeof p.org_settings === 'object') setOrgOv(p.org_settings); });
        const iv = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 5 * 60 * 1000);
        return () => { alive.current = false; clearTimeout(t); offMeta(); offTimer(); offPrefs(); offOrg(); clearInterval(iv); };
      }, [currentUser && currentUser.id, reload]);

      // Optimistic prefs write; fail-open when member_prefs_set doesn't exist yet.
      const savePrefs = useCallback(async (patch) => {
        if (!patch || typeof patch !== 'object') return null;
        setPrefsOv(cur => ({ ...(cur || {}), ...patch }));
        try { return await TaskAPI.memberPrefsSet(patch); }
        catch (e) { if (!isMissingRpc(e)) console.warn('[tasks] member_prefs_set', e); return null; }
      }, []);

      const value = useMemo(() => {
        const b = boot ? { ...boot } : null;
        if (b && orgOv) b.org_settings = { ...(b.org_settings || {}), ...orgOv };
        if (b && prefsOv) b.me_prefs = { ...((b.me_prefs && typeof b.me_prefs === 'object') ? b.me_prefs : {}), ...prefsOv };
        const s = buildStore(b, { reload, savePrefs });
        s.error = error;
        if (!boot && error) s.ready = false;
        if (timer !== undefined) s.runningTimer = timer;
        if (!s.me && currentUser) s.me = { id: currentUser.id, name: currentUser.name, initials: currentUser.initials, color: currentUser.color, role_level: currentUser.role_level };
        CUR.prefs = s.prefs; CUR.features = s.features;
        return s;
      }, [boot, error, timer, prefsOv, orgOv, reload, savePrefs, currentUser && currentUser.id]);

      return h`<${StoreCtx.Provider} value=${value}>${children}<//>`;
    }
    function useTaskStore() { return React.useContext(StoreCtx) || EMPTY_STORE; }

    // =========================================================================
    // useTasks(filter, { enabled, pollMs }) → { rows, total, loading, error, reload, setRows }
    // =========================================================================
    function useTasks(filter, opts) {
      const o = opts || {};
      const enabled = o.enabled !== false;
      const pollMs = o.pollMs === undefined ? 60000 : o.pollMs;
      const key = JSON.stringify(filter || {});
      const [rows, setRows] = useState([]);
      const [total, setTotal] = useState(0);
      const [loading, setLoading] = useState(enabled);
      const [error, setError] = useState(null);
      const seq = useRef(0);
      const timer = useRef(null);

      const fetchNow = useCallback(async () => {
        if (!enabled) return;
        const my = ++seq.current;
        try {
          const res = await TaskAPI.query(JSON.parse(key));
          if (my !== seq.current) return;
          const r = Array.isArray(res) ? res : arr(res && res.rows);
          setRows(r); setTotal(res && typeof res.total === 'number' ? res.total : r.length); setError(null);
        } catch (e) {
          if (my === seq.current) setError(errMsg(e));
        } finally {
          if (my === seq.current) setLoading(false);
        }
      }, [key, enabled]);
      const soon = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(fetchNow, 350); }, [fetchNow]);

      useEffect(() => {
        if (!enabled) { setLoading(false); return; }
        setLoading(true);
        fetchNow();
        return () => clearTimeout(timer.current);
      }, [fetchNow, enabled]);

      useEffect(() => {
        if (!enabled) return;
        const offC = taskBus.on('task:changed', (p) => {
          if (p && p.row && p.row.id) setRows(cur => cur.some(r => r.id === p.row.id) ? cur.map(r => r.id === p.row.id ? { ...r, ...p.row } : r) : cur);
          soon();
        });
        const offD = taskBus.on('task:deleted', (p) => {
          if (p && p.id) { setRows(cur => cur.filter(r => r.id !== p.id)); }
          soon();
        });
        const offN = taskBus.on('task:created', soon);
        let iv = null;
        if (pollMs) iv = setInterval(() => { if (document.visibilityState === 'visible') fetchNow(); }, pollMs);
        return () => { offC(); offD(); offN(); if (iv) clearInterval(iv); };
      }, [enabled, pollMs, soon, fetchNow]);

      return { rows, total, loading, error, reload: fetchNow, setRows };
    }

    // =========================================================================
    // Popover — position:fixed, rendered in place (no ReactDOM portal in deps)
    // =========================================================================
    const popStack = [];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

    function Popover({ anchor, open, onClose, placement = 'bottom-start', width, children, className, style, ariaLabel }) {
      const ref = useRef(null);
      const token = useRef(null);
      const [pos, setPos] = useState(null);
      const onCloseRef = useRef(onClose); onCloseRef.current = onClose;

      const place = useCallback(() => {
        const el = ref.current;
        if (!el || !anchor) return;
        const r = typeof anchor.getBoundingClientRect === 'function' ? anchor.getBoundingClientRect() : anchor;
        const vw = window.innerWidth, vh = window.innerHeight, m = 8, gap = 4;
        const pw = el.offsetWidth, ph = el.offsetHeight;
        const [side, align] = String(placement).split('-');
        let top, left;
        if (side === 'right' || side === 'left') {
          left = side === 'right' ? r.right + gap : r.left - pw - gap;
          if (side === 'right' && left + pw > vw - m) left = r.left - pw - gap;
          if (side === 'left' && left < m) left = r.right + gap;
          top = align === 'end' ? r.bottom - ph : r.top;
        } else {
          top = side === 'top' ? r.top - ph - gap : r.bottom + gap;
          if (side !== 'top' && top + ph > vh - m && r.top - ph - gap >= m) top = r.top - ph - gap;
          if (side === 'top' && top < m && r.bottom + gap + ph <= vh - m) top = r.bottom + gap;
          left = align === 'end' ? r.right - pw : align === 'center' ? r.left + (r.width - pw) / 2 : r.left;
        }
        top = clamp(top, m, Math.max(m, vh - ph - m));
        left = clamp(left, m, Math.max(m, vw - pw - m));
        setPos(p => (p && Math.abs(p.top - top) < 0.5 && Math.abs(p.left - left) < 0.5) ? p : { top, left });
      }, [anchor, placement]);

      useLayoutEffect(() => { if (open) place(); else setPos(null); }, [open, place]);

      useEffect(() => {
        if (!open) return;
        const tok = {}; token.current = tok; popStack.push(tok);
        const onDown = (e) => {
          const el = ref.current;
          if (!el) return;
          if (el.contains(e.target)) return;
          if (anchor && typeof anchor.contains === 'function' && anchor.contains(e.target)) return;
          // a nested popover that isn't a DOM child (shouldn't happen, but be safe)
          if (e.target.closest && e.target.closest('.cu-pop') && popStack[popStack.length - 1] !== tok) return;
          onCloseRef.current && onCloseRef.current();
        };
        const onKey = (e) => {
          if (e.key !== 'Escape') return;
          if (popStack[popStack.length - 1] !== tok) return;
          e.stopPropagation(); e.preventDefault();
          onCloseRef.current && onCloseRef.current();
          if (anchor && typeof anchor.focus === 'function') { try { anchor.focus(); } catch (_) { } }
        };
        const onMove = () => place();
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('touchstart', onDown, true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onMove);
        window.addEventListener('scroll', onMove, true);
        let ro = null;
        if (window.ResizeObserver && ref.current) { ro = new ResizeObserver(onMove); ro.observe(ref.current); }
        return () => {
          const i = popStack.indexOf(tok); if (i >= 0) popStack.splice(i, 1);
          document.removeEventListener('mousedown', onDown, true);
          document.removeEventListener('touchstart', onDown, true);
          window.removeEventListener('keydown', onKey, true);
          window.removeEventListener('resize', onMove);
          window.removeEventListener('scroll', onMove, true);
          if (ro) ro.disconnect();
        };
      }, [open, anchor, place]);

      if (!open) return null;
      const st = { top: pos ? pos.top : -9999, left: pos ? pos.left : -9999, visibility: pos ? 'visible' : 'hidden', ...(width ? { width } : {}), ...(style || {}) };
      return h`<div ref=${ref} class=${'cu-pop' + (className ? ' ' + className : '')} style=${st} role="dialog" aria-label=${ariaLabel || undefined}
        onClick=${e => e.stopPropagation()} onMouseDown=${e => e.stopPropagation()}>${children}</div>`;
    }
    const popoverOpen = () => popStack.length > 0;

    // Trigger + popover in one (internal convenience)
    function usePop() {
      const [open, setOpen] = useState(false);
      const [anchor, setAnchor] = useState(null);
      const ref = useCallback((el) => { if (el) setAnchor(el); }, []);
      return { open, setOpen, anchor, ref, toggle: () => setOpen(o => !o), close: () => setOpen(false) };
    }

    // =========================================================================
    // Menu — items:[{ key, label, icon, danger, disabled, onSelect, divider, submenu, right }]
    // =========================================================================
    function Menu({ items, onClose }) {
      const list = arr(items);
      const actionable = list.map((it, i) => (!it.divider && !it.disabled ? i : -1)).filter(i => i >= 0);
      const [act, setAct] = useState(-1);
      const [sub, setSub] = useState(null);   // { idx, el }
      const box = useRef(null);
      useEffect(() => { if (box.current) box.current.focus(); }, []);
      const select = (it, i, el) => {
        if (!it || it.disabled) return;
        if (it.submenu) { setSub(s => (s && s.idx === i) ? null : { idx: i, el }); return; }
        if (it.onSelect) it.onSelect();
        if (onClose) onClose();
      };
      const onKey = (e) => {
        if (!actionable.length) return;
        const pos = actionable.indexOf(act);
        if (e.key === 'ArrowDown') { e.preventDefault(); setAct(actionable[(pos + 1) % actionable.length]); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(actionable[(pos - 1 + actionable.length) % actionable.length]); }
        else if ((e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') && act >= 0) {
          e.preventDefault();
          const el = box.current && box.current.querySelector('[data-mi="' + act + '"]');
          select(list[act], act, el);
        }
      };
      return h`<div class="cu-menu" role="menu" tabIndex=${-1} ref=${box} onKeyDown=${onKey} style=${{ outline: 'none' }}>
        ${list.map((it, i) => it.divider
          ? h`<div key=${'d' + i} class="cu-mdiv" role="separator"></div>`
          : h`<${Fragment} key=${it.key || i}>
              <button type="button" role="menuitem" data-mi=${i} class=${'cu-mi' + (it.danger ? ' danger' : '') + (act === i || (sub && sub.idx === i) ? ' act' : '')}
                disabled=${!!it.disabled} onMouseEnter=${() => setAct(i)}
                onClick=${e => select(it, i, e.currentTarget)}>
                ${it.icon ? h`<i class=${'ti ' + it.icon}></i>` : null}
                <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${it.label}</span>
                ${it.right ? h`<span class="cu-mi-r">${it.right}</span>` : null}
                ${it.submenu ? h`<i class="ti ti-chevron-right" style=${{ marginLeft: 'auto' }}></i>` : null}
              </button>
              ${it.submenu && sub && sub.idx === i ? h`<${Popover} anchor=${sub.el} open=${true} placement="right-start" onClose=${() => setSub(null)}>
                ${typeof it.submenu === 'function' ? it.submenu(() => { setSub(null); onClose && onClose(); })
                  : h`<${Menu} items=${it.submenu} onClose=${() => { setSub(null); onClose && onClose(); }}/>`}
              <//>` : null}
            <//>`)}
      </div>`;
    }

    // =========================================================================
    // PickerList — searchable, grouped, keyboard (↑ ↓ Enter) list
    // items: [{ key, label, group?, left?, selected?, keywords? }]
    // =========================================================================
    function PickerList({ items, onPick, placeholder = 'Search…', searchable = true, emptyText = 'No matches', createLabel, onCreate, footer, minWidth = 220 }) {
      const [q, setQ] = useState('');
      const [act, setAct] = useState(0);
      const inRef = useRef(null);
      const boxRef = useRef(null);
      useEffect(() => { const el = searchable ? inRef.current : boxRef.current; if (el) setTimeout(() => { try { el.focus(); } catch (_) { } }, 0); }, []);
      const s = q.trim().toLowerCase();
      const filtered = arr(items).filter(it => !s || String(it.label || '').toLowerCase().includes(s) || String(it.keywords || '').toLowerCase().includes(s));
      const canCreate = !!(onCreate && s && !arr(items).some(it => String(it.label || '').toLowerCase() === s));
      const flat = canCreate ? [...filtered, { key: '__create__', label: (createLabel || 'Create') + ' "' + q.trim() + '"', create: true }] : filtered;
      const idx = Math.min(act, Math.max(0, flat.length - 1));
      useEffect(() => { setAct(0); }, [s]);
      useEffect(() => {
        const el = boxRef.current && boxRef.current.querySelector('[data-pk="' + idx + '"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      }, [idx]);
      const pick = (it) => { if (!it) return; if (it.create) onCreate(q.trim()); else onPick(it); };
      const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setAct(Math.min(idx + 1, flat.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(Math.max(idx - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); pick(flat[idx]); }
      };
      let lastGroup = null;
      return h`<div ref=${boxRef} tabIndex=${searchable ? undefined : -1} onKeyDown=${onKey} style=${{ minWidth, outline: 'none' }}>
        ${searchable ? h`<div class="cu-pk-search"><input ref=${inRef} value=${q} placeholder=${placeholder} aria-label=${placeholder}
            onInput=${e => setQ(e.target.value)}/></div>` : null}
        <div class="cu-pk-list" role="listbox">
          ${flat.length === 0 ? h`<div class="cu-pk-empty">${emptyText}</div>` : null}
          ${flat.map((it, i) => {
            const grp = it.group && it.group !== lastGroup ? it.group : null;
            if (it.group) lastGroup = it.group;
            return h`<${Fragment} key=${String(it.key) + ':' + i}>
              ${grp ? h`<div class="cu-pk-grp">${grp}</div>` : null}
              <button type="button" role="option" aria-selected=${!!it.selected} data-pk=${i}
                class=${'cu-mi' + (i === idx ? ' act' : '')} onMouseEnter=${() => setAct(i)} onClick=${() => pick(it)}>
                ${it.create ? h`<i class="ti ti-plus"></i>` : it.left || null}
                <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${it.label}</span>
                ${it.right ? h`<span class="cu-mi-r">${it.right}</span>` : null}
                ${it.selected ? h`<i class="ti ti-check cu-check"></i>` : null}
              </button>
            <//>`;
          })}
        </div>
        ${footer || null}
      </div>`;
    }

    // =========================================================================
    // Status atoms
    // =========================================================================
    function StatusIcon({ category, color, size = 16 }) {
      const c = color || '#87909e';
      const cat = category || 'todo';
      return h`<svg width=${size} height=${size} viewBox="0 0 16 16" aria-hidden="true" style=${{ flexShrink: 0, display: 'block' }}>
        ${cat === 'done'
          ? h`<${Fragment}><circle cx="8" cy="8" r="7" fill=${c}/><path d="M4.8 8.2l2.1 2.1 4.3-4.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><//>`
          : cat === 'active'
            ? h`<${Fragment}><circle cx="8" cy="8" r="6.2" fill="none" stroke=${c} strokeWidth="1.8"/><path d="M8 3.6A4.4 4.4 0 0 1 8 12.4Z" fill=${c}/><//>`
            : h`<circle cx="8" cy="8" r="6.2" fill="none" stroke=${c} strokeWidth="1.8" strokeDasharray="2.6 1.6"/>`}
      </svg>`;
    }

    function useStatusOf(row, listId, statusKey) {
      const store = useTaskStore();
      const lid = listId || (row && row.list_id);
      const key = statusKey !== undefined ? statusKey : (row && row.status);
      const m = store.statusMeta(lid, key);
      if (row && statusKey === undefined && row.status_name) {
        return { ...m, key, name: row.status_name, color: row.status_color || m.color, category: row.status_category || m.category };
      }
      return m;
    }

    function StatusPill({ row, listId, status, size = 'sm', solid }) {
      const m = useStatusOf(row, listId, status);
      const c = m.color || '#87909e';
      const st = solid ? { background: c, color: '#fff' } : { background: c + '1f', color: c };
      return h`<span class=${'cu-pill' + (size === 'md' ? ' md' : '')} style=${st} title=${m.name}>${m.name}</span>`;
    }

    function StatusPicker({ row, listId, value, onChange, solid, size = 'sm', disabled, iconOnly }) {
      const store = useTaskStore();
      const pop = usePop();
      const lid = listId || (row && row.list_id);
      const cur = value !== undefined ? value : (row && row.status);
      const m = useStatusOf(value !== undefined ? null : row, lid, value !== undefined ? value : undefined);
      const opts = store.statusesFor(lid);
      const items = CATEGORY_ORDER.flatMap(cat => opts.filter(s => (s.category || 'todo') === cat).map(s => ({
        key: s.key, label: s.name, group: CATEGORY_LABEL[cat], selected: s.key === cur,
        left: h`<${StatusIcon} category=${s.category} color=${s.color} size=${14}/>`,
      })));
      const c = m.color || '#87909e';
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} disabled=${disabled} aria-haspopup="listbox" aria-expanded=${pop.open}
          aria-label=${'Status: ' + m.name} onClick=${e => { e.stopPropagation(); pop.toggle(); }}
          class=${iconOnly ? 'cu-ibtn' : 'cu-pill' + (size === 'md' ? ' md' : '')}
          style=${iconOnly ? {} : { border: 'none', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', ...(solid ? { background: c, color: '#fff' } : { background: c + '1f', color: c }) }}>
          ${iconOnly ? h`<${StatusIcon} category=${m.category} color=${c}/>` : h`<${Fragment}>${m.name}${!disabled ? h`<i class="ti ti-chevron-down" style=${{ fontSize: 12 }}></i>` : null}<//>`}
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} ariaLabel="Change status">
          <${PickerList} items=${items} placeholder="Search statuses…" onPick=${it => { pop.close(); if (it.key !== cur && onChange) onChange(it.key); }}/>
        <//>
      <//>`;
    }

    // =========================================================================
    // Priority
    // =========================================================================
    function PriorityFlag({ value, showLabel, size = 14 }) {
      const p = PRIORITIES[value];
      return h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: p ? 'var(--cu-t1)' : 'var(--cu-t3)', whiteSpace: 'nowrap' }} title=${p ? p.label : 'No priority'}>
        <i class=${'ti ' + (p ? 'ti-flag-filled' : 'ti-flag')} style=${{ color: p ? p.color : 'var(--cu-t3)', fontSize: size }}></i>
        ${showLabel ? (p ? p.label : 'No priority') : null}
      </span>`;
    }
    function PriorityPicker({ value, onChange, showLabel = true, disabled }) {
      const pop = usePop();
      const items = [1, 2, 3, 4].map(v => ({ key: v, label: PRIORITIES[v].label, selected: value === v, left: h`<i class="ti ti-flag-filled" style=${{ color: PRIORITIES[v].color }}></i>` }))
        .concat([{ key: 0, label: 'Clear', left: h`<i class="ti ti-ban"></i>` }]);
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} class=${'cu-trig' + (PRIORITIES[value] ? '' : ' muted')} disabled=${disabled}
          aria-label=${'Priority: ' + (PRIORITIES[value] ? PRIORITIES[value].label : 'none')} onClick=${e => { e.stopPropagation(); pop.toggle(); }}>
          <${PriorityFlag} value=${value} showLabel=${showLabel}/>
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} ariaLabel="Set priority">
          <${PickerList} items=${items} searchable=${false} minWidth=${170} onPick=${it => { pop.close(); const v = it.key || null; if (v !== (value || null) && onChange) onChange(v); }}/>
        <//>
      <//>`;
    }

    // =========================================================================
    // Members
    // =========================================================================
    function MemberAvatar({ member, size = 24, title }) {
      const m = member || {};
      const initials = m.initials || String(m.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
      return h`<span title=${title || m.name || ''} style=${{ display: 'inline-flex', flexShrink: 0, borderRadius: '50%' }}>
        <${Av} i=${initials} c=${m.color} s=${size} round=${true}/>
      </span>`;
    }
    function AssigneeStack({ assignees, max = 3, size = 24 }) {
      const list = arr(assignees);
      if (!list.length) return h`<span class="cu-av-empty" style=${{ width: size, height: size }} title="Unassigned"><i class="ti ti-user-plus" style=${{ fontSize: Math.round(size * 0.55) }}></i></span>`;
      const shown = list.slice(0, max), more = list.length - shown.length;
      return h`<span class="cu-avs" title=${list.map(a => a.name).join(', ')}>
        ${shown.map(a => h`<${MemberAvatar} key=${a.id} member=${a} size=${size} title=${a.name}/>`)}
        ${more > 0 ? h`<span class="cu-av-more" style=${{ width: size, height: size }}>+${more}</span>` : null}
      </span>`;
    }
    function AssigneePicker({ value, onChange, multi = true, anchorContent, members, disabled, size = 24, label = 'Assignees' }) {
      const store = useTaskStore();
      const pop = usePop();
      const ids = arr(value);
      const pool = (members || store.members).filter(m => m && m.role_level !== 'client');
      const meId = store.me && store.me.id;
      const sorted = pool.slice().sort((a, b) => (b.id === meId) - (a.id === meId) || (ids.includes(b.id) - ids.includes(a.id)) || String(a.name).localeCompare(String(b.name)));
      const items = sorted.map(m => ({ key: m.id, label: m.id === meId ? 'Me (' + m.name + ')' : m.name, keywords: m.name + ' ' + (m.role_level || ''), selected: ids.includes(m.id), left: h`<${MemberAvatar} member=${m} size=${22}/>` }));
      const pick = (it) => {
        if (!onChange) return;
        if (multi) onChange(ids.includes(it.key) ? ids.filter(x => x !== it.key) : [...ids, it.key]);
        else { pop.close(); onChange(ids[0] === it.key ? [] : [it.key]); }
      };
      const chosen = ids.map(id => store.memberById[id]).filter(Boolean);
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} class="cu-trig" disabled=${disabled} aria-label=${label} aria-haspopup="listbox" aria-expanded=${pop.open}
          onClick=${e => { e.stopPropagation(); pop.toggle(); }}>
          ${anchorContent || h`<${AssigneeStack} assignees=${chosen} size=${size}/>`}
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} width=${260} ariaLabel=${label}>
          <${PickerList} items=${items} placeholder="Search people…" emptyText="No teammates found" onPick=${pick}
            footer=${ids.length ? h`<div style=${{ borderTop: '1px solid var(--cu-bd)', padding: 4 }}><button type="button" class="cu-mi" onClick=${() => { onChange && onChange([]); pop.close(); }}><i class="ti ti-user-x"></i>Clear${multi ? ' all' : ''}</button></div>` : null}/>
        <//>
      <//>`;
    }

    // =========================================================================
    // Dates
    // =========================================================================
    function DueChip({ row, iso, hasTime, showIcon = true }) {
      const v = iso !== undefined ? iso : (row && row.due_at);
      if (!v) return null;
      const ht = hasTime !== undefined ? hasTime : (row && row.due_has_time !== undefined && row.due_has_time !== null ? !!row.due_has_time : undefined);
      const f = fmtDue(v, ht);
      const tone = row && isDone(row) ? null : f.tone;
      return h`<span class=${'cu-due' + (tone ? ' ' + tone : '')} title=${new Date(v).toLocaleString('en-IN')}>
        ${showIcon ? h`<i class="ti ti-calendar-event" style=${{ fontSize: 13 }}></i>` : null}${f.text}
      </span>`;
    }

    const DOW_SUN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    function DatePickerBody({ value, hasTime, withTime, endOfDay, onApply, onClear, defaultTime }) {
      const store = useTaskStore();
      const ws = [0, 1, 6].includes(Number(store.prefs.week_start)) ? Number(store.prefs.week_start) : 1;   // 1 Mon · 0 Sun · 6 Sat
      const DOW = DOW_SUN.slice(ws).concat(DOW_SUN.slice(0, ws));
      const sel = value ? new Date(value) : null;
      const [view, setView] = useState(() => { const d = sel && !isNaN(sel) ? sel : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
      const [useTime, setUseTime] = useState(!!(withTime && hasTime && sel));
      const [time, setTime] = useState(() => sel && hasTime ? String(sel.getHours()).padStart(2, '0') + ':' + String(sel.getMinutes()).padStart(2, '0') : (defaultTime || '10:00'));
      const today = startOfDay(new Date());
      const apply = (day) => {
        const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
        if (withTime && useTime && /^\d{1,2}:\d{2}$/.test(time)) { const [hh, mm] = time.split(':'); d.setHours(+hh, +mm, 0, 0); }
        else if (endOfDay) d.setHours(23, 59, 0, 0);
        else d.setHours(0, 0, 0, 0);
        onApply(d.toISOString(), !!(withTime && useTime));
      };
      const dow = today.getDay();   // 0 Sun
      const quick = [
        { key: 'today', label: 'Today', d: today },
        { key: 'tomorrow', label: 'Tomorrow', d: addDays(today, 1) },
        { key: 'weekend', label: 'This weekend', d: addDays(today, dow === 6 ? 0 : dow === 0 ? 6 : 6 - dow) },
        { key: 'nextweek', label: 'Next week', d: addDays(today, ((8 - dow) % 7) || 7) },
        { key: '2w', label: '2 weeks', d: addDays(today, 14) },
        { key: '4w', label: '4 weeks', d: addDays(today, 28) },
      ];
      const first = new Date(view);
      const offset = (first.getDay() - ws + 7) % 7;
      const cells = Array.from({ length: 42 }, (_, i) => new Date(view.getFullYear(), view.getMonth(), 1 - offset + i));
      const onGridKey = (e) => {
        const map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (map[e.key] !== undefined && e.target && e.target.dataset && e.target.dataset.day) {
          e.preventDefault();
          const nd = addDays(new Date(+e.target.dataset.day), map[e.key]);
          if (nd.getMonth() !== view.getMonth()) setView(new Date(nd.getFullYear(), nd.getMonth(), 1));
          setTimeout(() => { const el = document.querySelector('.cu-dp-day[data-day="' + nd.getTime() + '"]'); if (el) el.focus(); }, 0);
        }
      };
      return h`<div class="cu-dp">
        <div class="cu-dp-quick">
          ${quick.map(q => h`<button key=${q.key} type="button" class="cu-mi" onClick=${() => apply(q.d)}>
            <span style=${{ flex: 1 }}>${q.label}</span><span class="cu-mi-r cu-hide-xs">${q.d.toLocaleDateString('en-IN', { weekday: 'short' })}</span></button>`)}
        </div>
        <div class="cu-dp-cal">
          <div class="cu-dp-hd">
            <button type="button" class="cu-ibtn" aria-label="Previous month" onClick=${() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}><i class="ti ti-chevron-left"></i></button>
            <span>${view.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
            <button type="button" class="cu-ibtn" aria-label="Next month" onClick=${() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}><i class="ti ti-chevron-right"></i></button>
          </div>
          <div class="cu-dp-grid" onKeyDown=${onGridKey}>
            ${DOW.map(d => h`<div key=${d} class="cu-dp-dow">${d}</div>`)}
            ${cells.map(c => h`<button key=${c.getTime()} type="button" data-day=${c.getTime()}
              class=${'cu-dp-day' + (c.getMonth() !== view.getMonth() ? ' out' : '') + (sameDay(c, today) ? ' today' : '') + (sel && sameDay(c, sel) ? ' sel' : '')}
              aria-label=${c.toDateString()} aria-pressed=${!!(sel && sameDay(c, sel))} onClick=${() => apply(c)}>${c.getDate()}</button>`)}
          </div>
          <div class="cu-dp-foot">
            ${withTime ? h`<${Fragment}>
              <label style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cu-t2)', cursor: 'pointer' }}>
                <input type="checkbox" checked=${useTime} onChange=${e => setUseTime(e.target.checked)}/>Time
              </label>
              ${useTime ? h`<input type="time" class="cu-input" style=${{ width: 110, height: 28 }} value=${time}
                onInput=${e => setTime(e.target.value)} onBlur=${() => { if (sel) apply(sel); }} aria-label="Time"/>` : null}
            <//>` : null}
            <span style=${{ flex: 1 }}></span>
            ${value ? h`<button type="button" class="cu-btn cu-btn-ghost" style=${{ height: 26 }} onClick=${onClear}>Clear</button>` : null}
          </div>
        </div>
      </div>`;
    }

    function DatePicker({ value, onChange, withTime = false, hasTime, label, placeholder, endOfDay = true, anchorContent, disabled, done }) {
      const pop = usePop();
      const ht = hasTime !== undefined ? hasTime : (value ? !(new Date(value).getHours() === 23 && new Date(value).getMinutes() === 59) : false);
      const f = value ? fmtDue(value, withTime ? ht : false) : null;
      const tone = f && !done && endOfDay ? f.tone : null;
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} disabled=${disabled} class=${'cu-trig' + (value ? '' : ' muted')}
          aria-label=${(label || 'Date') + (f ? ': ' + f.text : '')} onClick=${e => { e.stopPropagation(); pop.toggle(); }}>
          ${anchorContent || h`<span class=${'cu-due' + (tone && tone !== 'later' ? ' ' + tone : '')} style=${value ? {} : { color: 'var(--cu-t3)' }}>
            <i class="ti ti-calendar" style=${{ fontSize: 14 }}></i>${f ? f.text : (placeholder || label || 'Set date')}</span>`}
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} ariaLabel=${label || 'Pick date'}>
          <${DatePickerBody} value=${value} hasTime=${ht} withTime=${withTime} endOfDay=${endOfDay}
            onApply=${(iso, hasT) => { pop.close(); onChange && onChange(iso, { hasTime: hasT }); }}
            onClear=${() => { pop.close(); onChange && onChange(null, { hasTime: false }); }}/>
        <//>
      <//>`;
    }

    // =========================================================================
    // Tags, client, type
    // =========================================================================
    function TagChips({ ids, tags, max = 6 }) {
      const store = useTaskStore();
      const list = arr(ids).map(id => store.tagById[id] || arr(tags).find(t => t.id === id)).filter(Boolean);
      if (!list.length) return null;
      const shown = list.slice(0, max);
      return h`<span style=${{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
        ${shown.map(t => { const c = t.color || '#87909e'; return h`<span key=${t.id} class="cu-tag" style=${{ background: c + '24', color: c }}>${t.name}</span>`; })}
        ${list.length > max ? h`<span class="cu-tag" style=${{ background: 'var(--cu-bg3)', color: 'var(--cu-t2)' }}>+${list.length - max}</span>` : null}
      </span>`;
    }
    function TagPicker({ value, onChange, anchorContent, disabled, showToast }) {
      const store = useTaskStore();
      const pop = usePop();
      const [created, setCreated] = useState([]);
      const ids = arr(value);
      const all = store.tags.concat(created.filter(c => !store.tagById[c.id]));
      const items = all.slice().sort((a, b) => (ids.includes(b.id) - ids.includes(a.id)) || String(a.name).localeCompare(String(b.name)))
        .map(t => ({ key: t.id, label: t.name, selected: ids.includes(t.id), left: h`<span style=${{ width: 10, height: 10, borderRadius: 3, background: t.color || '#87909e', flexShrink: 0 }}></span>` }));
      const create = async (name) => {
        try {
          const t = await TaskAPI.tagUpsert({ name, color: TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)] });
          if (t && t.id) { setCreated(c => [...c, t]); onChange && onChange([...ids, t.id]); }
        } catch (e) { showToast ? showToast('Could not create tag: ' + errMsg(e)) : console.warn(e); }
      };
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} class=${'cu-trig' + (ids.length ? '' : ' muted')} disabled=${disabled} aria-label="Tags"
          onClick=${e => { e.stopPropagation(); pop.toggle(); }}>
          ${anchorContent || (ids.length ? h`<${TagChips} ids=${ids} tags=${created}/>` : h`<${Fragment}><i class="ti ti-tag" style=${{ fontSize: 14 }}></i>Add tags<//>`)}
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} width=${240} ariaLabel="Tags">
          <${PickerList} items=${items} placeholder="Search or create tag…" emptyText="Type to create a tag" createLabel="Create tag"
            onCreate=${create} onPick=${it => onChange && onChange(ids.includes(it.key) ? ids.filter(x => x !== it.key) : [...ids, it.key])}/>
        <//>
      <//>`;
    }
    function ClientBadge({ clientId, client, size = 18, showName = true }) {
      const store = useTaskStore();
      const c = client || store.clientById[clientId];
      if (!c) return clientId === null || clientId === undefined ? null : h`<span class="cu-cb">—</span>`;
      const initials = c.initials || String(c.name || '?').slice(0, 2).toUpperCase();
      return h`<span class="cu-cb" title=${c.name}>
        <span class="cu-cb-sq" style=${{ width: size, height: size, background: c.color || '#87909e', fontSize: Math.max(8, Math.round(size * 0.45)) }}>${initials}</span>
        ${showName ? h`<span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${c.name}</span>` : null}
      </span>`;
    }
    function TypeIcon({ type, size = 14, color }) {
      const t = TYPE_META[type] || TYPE_META.task;
      return h`<i class=${'ti ' + t.icon} title=${t.label} aria-hidden="true" style=${{ fontSize: size, color: color || 'var(--cu-t2)' }}></i>`;
    }
    function TypePicker({ value, onChange, exclude, disabled, className = 'cu-typechip' }) {
      const pop = usePop();
      const t = TYPE_META[value] || TYPE_META.task;
      const items = Object.keys(TYPE_META).filter(k => !arr(exclude).includes(k)).map(k => ({ key: k, label: TYPE_META[k].label, selected: k === value, left: h`<i class=${'ti ' + TYPE_META[k].icon}></i>` }));
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} class=${className} disabled=${disabled} aria-label=${'Task type: ' + t.label} onClick=${e => { e.stopPropagation(); pop.toggle(); }}>
          <i class=${'ti ' + t.icon}></i>${t.label}${!disabled ? h`<i class="ti ti-chevron-down" style=${{ fontSize: 12 }}></i>` : null}
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} ariaLabel="Task type">
          <${PickerList} items=${items} searchable=${false} minWidth=${190} onPick=${it => { pop.close(); if (it.key !== value && onChange) onChange(it.key); }}/>
        <//>
      <//>`;
    }
    // Lists grouped by Space: Agency first, then clients A–Z.
    function listPickerItems(store, selectedId, filterFn) {
      const out = [];
      const meId = store.me && store.me.id;
      const ok = (l) => !l.archived && (!l.is_private || !l.owner_id || l.owner_id === meId) && (!filterFn || filterFn(l));
      store.listsForClient(null).filter(ok).forEach(l => out.push({ key: l.id, label: l.name, group: 'Agency', selected: l.id === selectedId, keywords: 'agency', list: l, left: h`<i class=${'ti ' + (l.icon || (l.is_private ? 'ti-lock' : 'ti-list'))} style=${{ color: l.color || undefined }}></i>` }));
      store.clients.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(c => {
        store.listsForClient(c.id).filter(ok).forEach(l => out.push({ key: l.id, label: l.name, group: c.name, selected: l.id === selectedId, keywords: c.name, list: l, left: h`<i class=${'ti ' + (l.icon || (l.kind === 'content' ? 'ti-calendar-event' : 'ti-list'))} style=${{ color: l.color || c.color || undefined }}></i>` }));
      });
      return out;
    }
    function ListPicker({ value, onChange, filter, disabled, anchorContent }) {
      const store = useTaskStore();
      const pop = usePop();
      const l = store.listById[value];
      const c = l && l.client_id ? store.clientById[l.client_id] : null;
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} class=${'cu-trig' + (l ? '' : ' muted')} disabled=${disabled} aria-label="List" onClick=${e => { e.stopPropagation(); pop.toggle(); }}>
          ${anchorContent || h`<${Fragment}><i class="ti ti-list" style=${{ fontSize: 14 }}></i><span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${l ? (c ? c.name : 'Agency') + ' › ' + l.name : 'Choose list'}</span><//>`}
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} width=${300} ariaLabel="Choose list">
          <${PickerList} items=${listPickerItems(store, value, filter)} placeholder="Search spaces and lists…" emptyText=${store.ready ? 'No lists' : 'Loading…'}
            onPick=${it => { pop.close(); onChange && onChange(it.key, it.list); }}/>
        <//>
      <//>`;
    }

    // =========================================================================
    // Misc atoms
    // =========================================================================
    function InlineTitle({ value, onSave, placeholder = 'Task name', className, style, disabled, autoFocus }) {
      const [v, setV] = useState(value || '');
      const [focus, setFocus] = useState(false);
      const ref = useRef(null);
      useEffect(() => { if (!focus) setV(value || ''); }, [value, focus]);
      const grow = () => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } };
      useLayoutEffect(grow, [v]);
      useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, []);
      const commit = () => { const t = v.replace(/\s+/g, ' ').trim(); if (!t) { setV(value || ''); return; } if (t !== (value || '') && onSave) onSave(t); };
      return h`<textarea ref=${ref} rows=${1} class=${'cu-ititle' + (className ? ' ' + className : '')} style=${style} value=${v}
        placeholder=${placeholder} aria-label=${placeholder} disabled=${disabled}
        onFocus=${() => setFocus(true)} onBlur=${() => { setFocus(false); commit(); }}
        onInput=${e => setV(e.target.value.replace(/\n/g, ''))}
        onKeyDown=${e => {
          if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setV(value || ''); setTimeout(() => e.target.blur(), 0); }
        }}></textarea>`;
    }
    function EmptyState({ icon = 'ti-checklist', title, sub, action }) {
      return h`<div class="cu-empty">
        <i class=${'ti ' + icon + ' cu-empty-ic'}></i>
        ${title ? h`<div class="cu-empty-t">${title}</div>` : null}
        ${sub ? h`<div class="cu-empty-s">${sub}</div>` : null}
        ${action ? h`<div style=${{ marginTop: 8 }}>${action}</div>` : null}
      </div>`;
    }
    function SectionCard({ title, subtitle, right, children, bodyStyle, className }) {
      return h`<section class=${'cu-card cu-root' + (className ? ' ' + className : '')}>
        ${title || right ? h`<div class="cu-card-hd">
          <div style=${{ flex: 1, minWidth: 0 }}>
            <div class="cu-card-t">${title}</div>
            ${subtitle ? h`<div style=${{ fontSize: 12, color: 'var(--cu-t3)' }}>${subtitle}</div>` : null}
          </div>
          ${right || null}
        </div>` : null}
        <div class="cu-card-b" style=${bodyStyle}>${children}</div>
      </section>`;
    }

    // =========================================================================
    // TaskPanel parts — properties
    // =========================================================================
    function EstimateInput({ value, onSave, disabled }) {
      const [v, setV] = useState('');
      const [focus, setFocus] = useState(false);
      const shown = focus ? v : (value ? fmtMinutes(value) : '');
      return h`<input class="cu-input" style=${{ width: 150, height: 28, border: focus ? undefined : '1px solid transparent', background: focus ? undefined : 'transparent' }}
        value=${shown} placeholder="Add estimate (e.g. 2h 30m)" aria-label="Time estimate" disabled=${disabled}
        onFocus=${() => { setFocus(true); setV(value ? fmtMinutes(value) : ''); }}
        onInput=${e => setV(e.target.value)}
        onBlur=${() => {
          setFocus(false);
          const raw = v.trim();
          if (!raw) { if (value) onSave(null); return; }
          const n = parseMinutes(raw);
          if (n !== null && n !== value) onSave(n);
        }}
        onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.stopPropagation(); setV(value ? fmtMinutes(value) : ''); setTimeout(() => e.target.blur(), 0); } }}/>`;
    }

    const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60; return (hh ? hh + ':' : '') + String(mm).padStart(hh ? 2 : 1, '0') + ':' + String(ss).padStart(2, '0'); };
    function TimeTracker({ task, onChanged, showToast }) {
      const store = useTaskStore();
      const [local, setLocal] = useState(undefined);   // undefined → trust store
      const [busy, setBusy] = useState(false);
      const [now, setNow] = useState(Date.now());
      const pop = usePop();
      const [manual, setManual] = useState({ dur: '', date: '', note: '' });
      useEffect(() => { setLocal(undefined); }, [store.runningTimer && store.runningTimer.id]);
      const timer = local !== undefined ? local : store.runningTimer;
      const running = !!(timer && timer.task_id === task.id && !timer.ended_at);
      useEffect(() => { if (!running) return; const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, [running]);
      const elapsedMs = running && timer.started_at ? now - new Date(timer.started_at).getTime() : 0;
      const total = (Number(task.time_spent_minutes) || 0) + (running ? Math.floor(elapsedMs / 60000) : 0);
      const toggle = async () => {
        if (busy) return;
        setBusy(true);
        try {
          if (running) { await TaskAPI.timeStop(); setLocal(null); }
          else { const e = await TaskAPI.timeStart(task.id); setLocal(e || { task_id: task.id, started_at: new Date().toISOString() }); }
          onChanged && onChanged();
        } catch (e) { showToast && showToast('Timer: ' + errMsg(e)); }
        setBusy(false);
      };
      const addManual = async () => {
        const n = parseMinutes(manual.dur);
        if (!n) { showToast && showToast('Enter a duration like 1h 30m'); return; }
        try { await TaskAPI.timeAdd(task.id, n, manual.date || null, manual.note || null); pop.close(); setManual({ dur: '', date: '', note: '' }); onChanged && onChanged(); }
        catch (e) { showToast && showToast('Could not add time: ' + errMsg(e)); }
      };
      return h`<div style=${{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" class="cu-btn" onClick=${toggle} disabled=${busy} aria-pressed=${running}
          aria-label=${running ? 'Stop timer' : 'Start timer'}
          style=${{ height: 28, padding: '0 10px', ...(running ? { background: '#e5484d', borderColor: '#e5484d', color: '#fff' } : {}) }}>
          <i class=${'ti ' + (running ? 'ti-player-stop-filled' : 'ti-player-play-filled')} style=${{ fontSize: 13 }}></i>
          ${running ? fmtClock(elapsedMs) : 'Start'}
        </button>
        <span style=${{ fontSize: 13, color: total ? 'var(--cu-t1)' : 'var(--cu-t3)' }}>${total ? fmtMinutes(total) + ' tracked' : 'No time tracked'}</span>
        <button type="button" ref=${pop.ref} class="cu-ibtn" title="Add time manually" aria-label="Add time manually" onClick=${pop.toggle}><i class="ti ti-plus"></i></button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} width=${250} ariaLabel="Add time">
          <div style=${{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style=${{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--cu-t3)' }}>Add time entry</div>
            <input class="cu-input" placeholder="Duration e.g. 1h 30m" value=${manual.dur} aria-label="Duration" autoFocus
              onInput=${e => setManual(m => ({ ...m, dur: e.target.value }))} onKeyDown=${e => { if (e.key === 'Enter') addManual(); }}/>
            <input class="cu-input" type="date" value=${manual.date} aria-label="Date" onInput=${e => setManual(m => ({ ...m, date: e.target.value }))}/>
            <input class="cu-input" placeholder="Note (optional)" value=${manual.note} aria-label="Note" onInput=${e => setManual(m => ({ ...m, note: e.target.value }))}/>
            <button type="button" class="cu-btn cu-btn-pri" onClick=${addManual}>Add time</button>
          </div>
        <//>
      </div>`;
    }

    const isEmptyVal = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
    function FieldText({ value, onSave, type = 'text', placeholder, prefix }) {
      const [v, setV] = useState(value === null || value === undefined ? '' : String(value));
      const [focus, setFocus] = useState(false);
      useEffect(() => { if (!focus) setV(value === null || value === undefined ? '' : String(value)); }, [value, focus]);
      const commit = () => {
        setFocus(false);
        let out = v.trim();
        if (type === 'number') out = out === '' ? null : Number(out);
        if (out === '') out = null;
        if (type === 'number' && out !== null && isNaN(out)) return;
        if (out !== (value === undefined ? null : value)) onSave(out);
      };
      return h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 4, width: '100%', maxWidth: 320 }}>
        ${prefix ? h`<span style=${{ color: 'var(--cu-t3)', fontSize: 13 }}>${prefix}</span>` : null}
        <input class="cu-input" type=${type} value=${v} placeholder=${placeholder || 'Empty'} aria-label=${placeholder || 'Field value'}
          style=${{ height: 28, ...(focus ? {} : { borderColor: 'transparent', background: 'transparent' }) }}
          onFocus=${() => setFocus(true)} onInput=${e => setV(e.target.value)} onBlur=${commit}
          onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); }}/>
      </span>`;
    }
    function OptionPicker({ options, value, multi, onSave }) {
      const pop = usePop();
      const opts = arr(options);
      const ids = multi ? arr(value) : (value ? [value] : []);
      const chosen = ids.map(id => opts.find(o => o.id === id)).filter(Boolean);
      const items = opts.map(o => ({ key: o.id, label: o.label, selected: ids.includes(o.id), left: h`<span style=${{ width: 10, height: 10, borderRadius: 3, background: o.color || '#87909e' }}></span>` }));
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} class=${'cu-trig' + (chosen.length ? '' : ' muted')} onClick=${pop.toggle}>
          ${chosen.length ? chosen.map(o => h`<span key=${o.id} class="cu-tag" style=${{ background: (o.color || '#87909e') + '24', color: o.color || 'var(--cu-t2)' }}>${o.label}</span>`) : 'Select…'}
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} width=${220}>
          <${PickerList} items=${items} searchable=${opts.length > 6} emptyText="No options"
            onPick=${it => { if (multi) onSave(ids.includes(it.key) ? ids.filter(x => x !== it.key) : [...ids, it.key]); else { pop.close(); onSave(ids[0] === it.key ? null : it.key); } }}/>
        <//>
      <//>`;
    }
    function CustomFieldEditor({ field, value, onSave }) {
      const t = field.type;
      if (t === 'checkbox') return h`<button type="button" class=${'cu-cbx' + (value ? ' on' : '')} role="checkbox" aria-checked=${!!value} aria-label=${field.name} onClick=${() => onSave(!value)}>${value ? h`<i class="ti ti-check" style=${{ fontSize: 12 }}></i>` : null}</button>`;
      if (t === 'dropdown') return h`<${OptionPicker} options=${field.options} value=${value} onSave=${onSave}/>`;
      if (t === 'labels') return h`<${OptionPicker} options=${field.options} value=${value} multi=${true} onSave=${onSave}/>`;
      if (t === 'date') return h`<${DatePicker} value=${value || null} label=${field.name} endOfDay=${false} onChange=${iso => onSave(iso)}/>`;
      if (t === 'rating') {
        const n = Number(value) || 0;
        return h`<span style=${{ display: 'inline-flex', gap: 2 }} role="radiogroup" aria-label=${field.name}>
          ${[1, 2, 3, 4, 5].map(i => h`<button key=${i} type="button" class="cu-ibtn" style=${{ width: 24, height: 24, color: i <= n ? '#f5a623' : 'var(--cu-t3)' }}
            aria-label=${i + ' star' + (i > 1 ? 's' : '')} aria-checked=${i === n} role="radio" onClick=${() => onSave(i === n ? null : i)}>
            <i class=${'ti ' + (i <= n ? 'ti-star-filled' : 'ti-star')}></i></button>`)}
        </span>`;
      }
      if (t === 'number') return h`<${FieldText} type="number" value=${value} onSave=${onSave} placeholder=${field.name}/>`;
      if (t === 'money') return h`<${FieldText} type="number" prefix="₹" value=${value} onSave=${onSave} placeholder=${field.name}/>`;
      if (t === 'url') return h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 4, width: '100%' }}>
        <${FieldText} type="url" value=${value} onSave=${onSave} placeholder="https://"/>
        ${value ? h`<a class="cu-ibtn" href=${/^https?:\/\//i.test(value) ? value : 'https://' + value} target="_blank" rel="noopener" aria-label="Open link"><i class="ti ti-external-link"></i></a>` : null}
      </span>`;
      if (t === 'email') return h`<${FieldText} type="email" value=${value} onSave=${onSave} placeholder="name@example.com"/>`;
      if (t === 'phone') return h`<${FieldText} type="tel" value=${value} onSave=${onSave} placeholder="+91"/>`;
      return h`<${FieldText} value=${value} onSave=${onSave} placeholder=${field.name}/>`;
    }
    const FIELD_ICON = { text: 'ti-align-left', number: 'ti-hash', date: 'ti-calendar', dropdown: 'ti-select', labels: 'ti-tags', checkbox: 'ti-square-check', url: 'ti-link', money: 'ti-currency-rupee', email: 'ti-mail', phone: 'ti-phone', rating: 'ti-star' };

    function DescriptionEditor({ value, onSave, disabled }) {
      const [v, setV] = useState(value || '');
      const [saving, setSaving] = useState(false);
      const focus = useRef(false);
      const last = useRef(value || '');
      const t = useRef(null);
      const ref = useRef(null);
      useEffect(() => { if (!focus.current) { setV(value || ''); last.current = value || ''; } }, [value]);
      const grow = () => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = Math.max(64, el.scrollHeight + 2) + 'px'; } };
      useLayoutEffect(grow, [v]);
      const save = async (text) => {
        clearTimeout(t.current);
        if (text === last.current) return;
        last.current = text; setSaving(true);
        try { await onSave(text); } catch (_) { }
        setSaving(false);
      };
      useEffect(() => () => clearTimeout(t.current), []);
      return h`<div style=${{ position: 'relative', margin: '0 -10px' }}>
        <textarea ref=${ref} class="cu-ta" value=${v} placeholder="Add description" aria-label="Description" disabled=${disabled}
          onFocus=${() => { focus.current = true; }}
          onBlur=${() => { focus.current = false; save(v); }}
          onInput=${e => { const nv = e.target.value; setV(nv); clearTimeout(t.current); t.current = setTimeout(() => save(nv), 800); }}
          onKeyDown=${e => { if (e.key === 'Escape') { e.stopPropagation(); e.target.blur(); } }}></textarea>
        ${saving ? h`<span style=${{ position: 'absolute', right: 10, top: -18, fontSize: 11, color: 'var(--cu-t3)' }}>Saving…</span>` : null}
      </div>`;
    }

    function PostBlock({ task }) {
      const p = task.post || {};
      const pt = POST_TYPES.find(x => x.key === p.type);
      const approval = p.client_approval ? String(p.client_approval).replace(/_/g, ' ') : '—';
      const when = p.post_date ? new Date(p.post_date + (String(p.post_date).length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—';
      return h`<div class="cu-sec">
        <div class="cu-sec-hd"><i class="ti ti-photo" style=${{ color: 'var(--cu-accent-ink)' }}></i><span class="cu-sec-t">Post</span></div>
        <div class="cu-post">
          ${p.thumb ? h`<img class="cu-post-th" src=${p.thumb} alt="Post thumbnail" loading="lazy"/>` : h`<div class="cu-post-th" style=${{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cu-t3)', fontSize: 28 }}><i class=${'ti ' + (pt ? pt.icon : 'ti-photo')}></i></div>`}
          <div style=${{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div class="cu-post-kv">
              <span class="k">Sub-type</span><span>${pt ? pt.label : (p.type || '—')}</span>
              <span class="k">Workflow</span><span>${p.workflow_status ? h`<${StatusPill} listId=${task.list_id} status=${p.workflow_status}/>` : '—'}</span>
              <span class="k">Client approval</span><span style=${{ textTransform: 'capitalize' }}>${approval}</span>
              <span class="k">Post date</span><span>${when}${p.posting_time ? ' · ' + String(p.posting_time).slice(0, 5) : ''}</span>
              ${p.drive_link ? h`<${Fragment}><span class="k">Drive</span><a href=${p.drive_link} target="_blank" rel="noopener" style=${{ color: 'var(--cu-accent-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Open folder</a><//>` : null}
            </div>
            ${/* Escape hatch only. The everyday fields and publishing are inline
                  (posts.js registers "Publishing" + "Post details"); the full editor
                  still owns previews, version history and send-to-client. */''}
            <div><button type="button" class="cu-btn cu-btn-ghost" style=${{ height: 26, fontSize: 12.5 }}
              disabled=${!task.content_id} title="Previews, version history and the send-to-client flow"
              onClick=${() => openPostEditor(task.content_id)}>
              <i class="ti ti-external-link"></i>Advanced…</button></div>
          </div>
        </div>
      </div>`;
    }

    function SubtasksSection({ task, subtasks, setSubtasks, showToast }) {
      const store = useTaskStore();
      const [adding, setAdding] = useState(false);
      const [draft, setDraft] = useState('');
      const list = arr(subtasks);
      const done = list.filter(isDone).length;
      const toggle = async (s) => {
        const opts = store.statusesFor(s.list_id || task.list_id);
        const target = isDone(s) ? (opts.find(x => x.category === 'todo') || opts[0]) : (opts.find(x => x.category === 'done') || opts[opts.length - 1]);
        if (!target) return;
        const prev = s;
        setSubtasks(cur => cur.map(x => x.id === s.id ? { ...x, status: target.key, status_name: target.name, status_color: target.color, status_category: target.category } : x));
        try { const row = await TaskAPI.update(s.id, { status: target.key }); if (row && row.id) setSubtasks(cur => cur.map(x => x.id === s.id ? { ...x, ...row } : x)); }
        catch (e) { setSubtasks(cur => cur.map(x => x.id === s.id ? prev : x)); showToast && showToast('Could not update subtask: ' + errMsg(e)); }
      };
      const add = async () => {
        const title = draft.trim();
        if (!title) { setAdding(false); return; }
        setDraft('');
        const tmpId = 'tmp-' + uuid();
        const m = store.statusesFor(task.list_id)[0] || {};
        setSubtasks(cur => [...cur, { id: tmpId, title, status: m.key, status_name: m.name, status_color: m.color, status_category: m.category || 'todo', assignees: [], list_id: task.list_id, _pending: true }]);
        try {
          const row = await TaskAPI.create({ title, parent_id: task.id, list_id: task.list_id });
          setSubtasks(cur => cur.map(x => x.id === tmpId ? (row && row.id ? row : { ...x, _pending: false }) : x));
        } catch (e) { setSubtasks(cur => cur.filter(x => x.id !== tmpId)); showToast && showToast('Could not add subtask: ' + errMsg(e)); }
      };
      return h`<div class="cu-sec">
        <div class="cu-sec-hd">
          <span class="cu-sec-t">Subtasks</span>
          ${list.length ? h`<${Fragment}><span class="cu-sec-sub">${done}/${list.length}</span><div class="cu-prog" aria-hidden="true"><div style=${{ width: (done / list.length * 100) + '%' }}></div></div><//>` : null}
        </div>
        <div class="cu-rows">
          ${list.map(s => h`<div key=${s.id} class=${'cu-srow' + (isDone(s) ? ' done' : '')} style=${s._pending ? { opacity: .6 } : null}>
            <button type="button" class="cu-ibtn" style=${{ width: 22, height: 22 }} disabled=${s._pending}
              aria-label=${isDone(s) ? 'Mark subtask not done' : 'Mark subtask done'} onClick=${() => toggle(s)}>
              <${StatusIcon} category=${s.status_category} color=${s.status_color}/>
            </button>
            <button type="button" class="cu-srow-t" disabled=${s._pending} onClick=${() => openTask(s.id)} title=${s.title}>${s.title}</button>
            <span class="cu-hide-xs"><${StatusPill} row=${s}/></span>
            <${AssigneeStack} assignees=${s.assignees} size=${20} max=${2}/>
            <${DueChip} row=${s} showIcon=${false}/>
          </div>`)}
          ${adding
            ? h`<div class="cu-addrow" style=${list.length ? null : { borderTop: 'none' }}>
                <i class="ti ti-circle-dashed"></i>
                <input autoFocus value=${draft} placeholder="Subtask name — Enter to save" aria-label="New subtask name"
                  onInput=${e => setDraft(e.target.value)} onBlur=${add}
                  onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); add(); } if (e.key === 'Escape') { e.stopPropagation(); setDraft(''); setAdding(false); } }}/>
              </div>`
            : h`<div class="cu-addrow" style=${list.length ? null : { borderTop: 'none' }}>
                <button type="button" class="cu-addbtn" onClick=${() => setAdding(true)}><i class="ti ti-plus"></i>Add subtask</button>
              </div>`}
        </div>
      </div>`;
    }

    // =========================================================================
    // TaskPanel parts — checklists + attachments
    // =========================================================================
    function ChecklistItemText({ text, done, onSave }) {
      const [edit, setEdit] = useState(false);
      const [v, setV] = useState(text || '');
      useEffect(() => { if (!edit) setV(text || ''); }, [text, edit]);
      if (edit) {
        return h`<input class="cu-input" style=${{ height: 26, flex: 1 }} autoFocus value=${v} aria-label="Checklist item"
          onInput=${e => setV(e.target.value)}
          onBlur=${() => { setEdit(false); const t = v.trim(); if (t && t !== text) onSave(t); }}
          onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.stopPropagation(); setV(text || ''); setEdit(false); } }}/>`;
      }
      return h`<button type="button" class="cu-srow-t" style=${done ? { color: 'var(--cu-t3)', textDecoration: 'line-through' } : null}
        onClick=${() => setEdit(true)} title="Click to edit">${text}</button>`;
    }

    function ChecklistBlock({ task, cl, setChecklists, showToast }) {
      const store = useTaskStore();
      const [draft, setDraft] = useState('');
      const [adding, setAdding] = useState(false);
      const menu = usePop();
      const items = arr(cl.items).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
      const done = items.filter(i => i.done).length;
      const setCl = (fn) => setChecklists(cur => cur.map(c => c.id === cl.id ? fn(c) : c));
      const setItem = (itemId, patch) => setCl(c => ({ ...c, items: arr(c.items).map(i => i.id === itemId ? { ...i, ...patch } : i) }));

      const updItem = async (it, patch) => {
        const prev = { ...it };
        setItem(it.id, patch);
        try { const r = await TaskAPI.itemUpdate(it.id, patch, task.id); if (r && r.id) setItem(it.id, r); }
        catch (e) { setItem(it.id, prev); showToast && showToast('Checklist: ' + errMsg(e)); }
      };
      const move = async (idx, dir) => {
        const j = idx + dir;
        if (j < 0 || j >= items.length) return;
        const a = items[idx], b = items[j];
        const pa = a.position != null ? a.position : idx, pb = b.position != null ? b.position : j;
        const na = pa === pb ? pb + dir : pb, nb = pa;
        setCl(c => ({ ...c, items: arr(c.items).map(i => i.id === a.id ? { ...i, position: na } : i.id === b.id ? { ...i, position: nb } : i) }));
        try { await Promise.all([TaskAPI.itemUpdate(a.id, { position: na }, task.id), TaskAPI.itemUpdate(b.id, { position: nb }, task.id)]); }
        catch (e) { setCl(c => ({ ...c, items: arr(c.items).map(i => i.id === a.id ? { ...i, position: pa } : i.id === b.id ? { ...i, position: pb } : i) })); showToast && showToast('Could not reorder: ' + errMsg(e)); }
      };
      const delItem = async (it) => {
        const before = cl.items;
        setCl(c => ({ ...c, items: arr(c.items).filter(i => i.id !== it.id) }));
        try { await TaskAPI.itemDelete(it.id, task.id); }
        catch (e) { setCl(c => ({ ...c, items: before })); showToast && showToast('Could not delete item: ' + errMsg(e)); }
      };
      const addItem = async () => {
        const text = draft.trim();
        if (!text) { setAdding(false); return; }
        setDraft('');
        const tmp = { id: 'tmp-' + uuid(), text, done: false, assignee_id: null, position: (items.length ? (items[items.length - 1].position || items.length) + 1 : 0), _pending: true };
        setCl(c => ({ ...c, items: [...arr(c.items), tmp] }));
        try { const r = await TaskAPI.itemAdd(cl.id, text, task.id); setCl(c => ({ ...c, items: arr(c.items).map(i => i.id === tmp.id ? (r && r.id ? r : { ...i, _pending: false }) : i) })); }
        catch (e) { setCl(c => ({ ...c, items: arr(c.items).filter(i => i.id !== tmp.id) })); showToast && showToast('Could not add item: ' + errMsg(e)); }
      };
      const rename = async (name) => {
        const prev = cl.name;
        setCl(c => ({ ...c, name }));
        try { await TaskAPI.checklistUpdate(cl.id, name, task.id); }
        catch (e) { setCl(c => ({ ...c, name: prev })); showToast && showToast('Could not rename: ' + errMsg(e)); }
      };
      const remove = async () => {
        if (!confirm('Delete checklist "' + (cl.name || 'Checklist') + '"?')) return;
        let snapshot = null;
        setChecklists(cur => { snapshot = cur; return cur.filter(c => c.id !== cl.id); });
        try { await TaskAPI.checklistDelete(cl.id, task.id); }
        catch (e) { if (snapshot) setChecklists(snapshot); showToast && showToast('Could not delete checklist: ' + errMsg(e)); }
      };

      return h`<div style=${{ marginBottom: 14 }}>
        <div style=${{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style=${{ flex: '0 1 auto', minWidth: 80, fontWeight: 600, fontSize: 14 }}>
            <${InlineTitle} value=${cl.name || 'Checklist'} onSave=${rename} placeholder="Checklist name"/>
          </div>
          <span class="cu-sec-sub" style=${{ whiteSpace: 'nowrap' }}>${done}/${items.length}</span>
          <div class="cu-prog" aria-hidden="true"><div style=${{ width: (items.length ? done / items.length * 100 : 0) + '%' }}></div></div>
          <span style=${{ flex: 1 }}></span>
          <button type="button" ref=${menu.ref} class="cu-ibtn" aria-label="Checklist options" onClick=${menu.toggle}><i class="ti ti-dots"></i></button>
          <${Popover} anchor=${menu.anchor} open=${menu.open} onClose=${menu.close} placement="bottom-end">
            <${Menu} onClose=${menu.close} items=${[
              { key: 'all', label: 'Check all', icon: 'ti-checks', onSelect: () => items.filter(i => !i.done).forEach(i => updItem(i, { done: true })) },
              { key: 'none', label: 'Uncheck all', icon: 'ti-square', onSelect: () => items.filter(i => i.done).forEach(i => updItem(i, { done: false })) },
              { divider: true },
              { key: 'del', label: 'Delete checklist', icon: 'ti-trash', danger: true, onSelect: remove },
            ]}/>
          <//>
        </div>
        <div class="cu-rows">
          ${items.map((it, idx) => {
            const assignee = it.assignee_id ? store.memberById[it.assignee_id] : null;
            return h`<div key=${it.id} class="cu-srow" style=${it._pending ? { opacity: .6 } : null}>
              <button type="button" class=${'cu-cbx' + (it.done ? ' on' : '')} role="checkbox" aria-checked=${!!it.done} aria-label=${'Toggle ' + it.text}
                disabled=${it._pending} onClick=${() => updItem(it, { done: !it.done })}>${it.done ? h`<i class="ti ti-check" style=${{ fontSize: 12 }}></i>` : null}</button>
              <${ChecklistItemText} text=${it.text} done=${it.done} onSave=${t => updItem(it, { text: t })}/>
              <span class="cu-hov" style=${{ display: 'inline-flex' }}>
                <button type="button" class="cu-ibtn" style=${{ width: 22, height: 22 }} aria-label="Move up" disabled=${idx === 0 || it._pending} onClick=${() => move(idx, -1)}><i class="ti ti-arrow-up" style=${{ fontSize: 13 }}></i></button>
                <button type="button" class="cu-ibtn" style=${{ width: 22, height: 22 }} aria-label="Move down" disabled=${idx === items.length - 1 || it._pending} onClick=${() => move(idx, 1)}><i class="ti ti-arrow-down" style=${{ fontSize: 13 }}></i></button>
              </span>
              ${!it._pending ? h`<${AssigneePicker} multi=${false} value=${it.assignee_id ? [it.assignee_id] : []} label="Assign item"
                onChange=${ids => updItem(it, { assignee_id: ids[0] || null })}
                anchorContent=${assignee ? h`<${MemberAvatar} member=${assignee} size=${20}/>` : h`<span class="cu-hov cu-av-empty" style=${{ width: 20, height: 20 }}><i class="ti ti-user-plus" style=${{ fontSize: 11 }}></i></span>`}/>` : null}
              <button type="button" class="cu-ibtn cu-hov" style=${{ width: 22, height: 22 }} aria-label="Delete item" disabled=${it._pending} onClick=${() => delItem(it)}><i class="ti ti-trash" style=${{ fontSize: 13 }}></i></button>
            </div>`;
          })}
          <div class="cu-addrow" style=${items.length ? null : { borderTop: 'none' }}>
            ${adding
              ? h`<${Fragment}><i class="ti ti-square"></i><input autoFocus value=${draft} placeholder="Item name — Enter to add" aria-label="New checklist item"
                  onInput=${e => setDraft(e.target.value)} onBlur=${addItem}
                  onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } if (e.key === 'Escape') { e.stopPropagation(); setDraft(''); setAdding(false); } }}/><//>`
              : h`<button type="button" class="cu-addbtn" onClick=${() => setAdding(true)}><i class="ti ti-plus"></i>New item</button>`}
          </div>
        </div>
      </div>`;
    }

    function ChecklistsSection({ task, checklists, setChecklists, showToast }) {
      const [busy, setBusy] = useState(false);
      const list = arr(checklists).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
      const create = async () => {
        setBusy(true);
        try { const cl = await TaskAPI.checklistAdd(task.id, 'Checklist'); if (cl && cl.id) setChecklists(cur => [...cur, { items: [], ...cl }]); }
        catch (e) { showToast && showToast('Could not create checklist: ' + errMsg(e)); }
        setBusy(false);
      };
      return h`<div class="cu-sec">
        <div class="cu-sec-hd"><span class="cu-sec-t">Checklists</span></div>
        ${list.map(cl => h`<${ChecklistBlock} key=${cl.id} task=${task} cl=${cl} setChecklists=${setChecklists} showToast=${showToast}/>`)}
        <button type="button" class="cu-addbtn" disabled=${busy} onClick=${create}><i class=${'ti ' + (busy ? 'ti-loader-2 cu-spin' : 'ti-plus')}></i>Create checklist</button>
      </div>`;
    }

    function AttachmentsSection({ task, attachments, setAttachments, showToast }) {
      const [pending, setPending] = useState([]);
      const [over, setOver] = useState(false);
      const fileRef = useRef(null);
      const list = arr(attachments);
      const handleFiles = async (files) => {
        const fs = Array.from(files || []);
        for (const f of fs) {
          const tmp = { id: 'up-' + uuid(), name: f.name };
          setPending(p => [...p, tmp]);
          try {
            const att = await TaskAPI.uploadAttachment(task.id, f);
            setAttachments(cur => [...cur, att && att.id ? att : { id: tmp.id, name: f.name, mime: f.type, size: f.size, url: att && att.url }]);
          } catch (e) { showToast && showToast('Upload failed (' + f.name + '): ' + errMsg(e)); }
          setPending(p => p.filter(x => x.id !== tmp.id));
        }
      };
      const del = async (a) => {
        if (!confirm('Delete attachment "' + a.name + '"?')) return;
        setAttachments(cur => cur.filter(x => x.id !== a.id));
        try { await TaskAPI.attachmentDelete(a.id, task.id); }
        catch (e) { setAttachments(cur => [...cur, a]); showToast && showToast('Could not delete: ' + errMsg(e)); }
      };
      const icon = (m, n) => /pdf/.test(m || '') || /\.pdf$/i.test(n) ? 'ti-file-type-pdf' : /video/.test(m || '') ? 'ti-movie' : /sheet|excel|csv/.test(m || '') ? 'ti-file-spreadsheet' : /zip|compressed/.test(m || '') ? 'ti-file-zip' : 'ti-file';
      return h`<div class="cu-sec"
        onDragOver=${e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); setOver(true); } }}
        onDragLeave=${e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
        onDrop=${e => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); setOver(false); handleFiles(e.dataTransfer.files); } }}>
        <div class="cu-sec-hd"><span class="cu-sec-t">Attachments</span>${list.length ? h`<span class="cu-sec-sub">${list.length}</span>` : null}</div>
        ${list.length || pending.length ? h`<div class="cu-att-grid">
          ${list.map(a => {
            const img = /^image\//.test(a.mime || '') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(a.name || '');
            return h`<div key=${a.id} class="cu-att">
              <a href=${a.url} target="_blank" rel="noopener" style=${{ textDecoration: 'none', color: 'inherit', display: 'block' }} title=${a.name}>
                <div class="cu-att-th">${img && a.url ? h`<img src=${a.url} alt=${a.name} loading="lazy"/>` : h`<i class=${'ti ' + icon(a.mime, a.name || '')}></i>`}</div>
                <div class="cu-att-meta">
                  <div class="cu-att-name">${a.name}</div>
                  <div style=${{ color: 'var(--cu-t3)', fontSize: 11 }}>${[a.size ? fmtSize(a.size) : '', a.created_at ? fmtRelative(a.created_at) : ''].filter(Boolean).join(' · ')}</div>
                </div>
              </a>
              <button type="button" class="cu-ibtn cu-hov cu-att-del" aria-label=${'Delete ' + a.name} onClick=${() => del(a)}><i class="ti ti-trash" style=${{ fontSize: 14 }}></i></button>
            </div>`;
          })}
          ${pending.map(p => h`<div key=${p.id} class="cu-att" aria-busy="true">
            <div class="cu-att-th"><i class="ti ti-loader-2 cu-spin"></i></div>
            <div class="cu-att-meta"><div class="cu-att-name">${p.name}</div><div style=${{ color: 'var(--cu-t3)', fontSize: 11 }}>Uploading…</div></div>
          </div>`)}
        </div>` : null}
        <input ref=${fileRef} type="file" multiple style=${{ display: 'none' }} onChange=${e => { handleFiles(e.target.files); e.target.value = ''; }}/>
        <button type="button" class=${'cu-drop' + (over ? ' over' : '')} onClick=${() => fileRef.current && fileRef.current.click()}>
          <i class="ti ti-cloud-upload" style=${{ fontSize: 18, verticalAlign: 'middle', marginRight: 6 }}></i>Drop files here or <span style=${{ color: 'var(--cu-accent-ink)', fontWeight: 600 }}>browse</span>
        </button>
      </div>`;
    }

    // =========================================================================
    // TaskPanel parts — activity + comments
    // =========================================================================
    function renderMentions(body, members) {
      if (!body) return null;
      const names = arr(members).map(m => m && m.name).filter(Boolean);
      if (!names.length) return body;
      const re = new RegExp('(@(?:' + names.map(escRe).sort((a, b) => b.length - a.length).join('|') + '))', 'g');
      const set = new Set(names.map(n => '@' + n));
      return String(body).split(re).map((p, i) => set.has(p) ? h`<span key=${i} class="cu-mention">${p}</span>` : p);
    }

    function activityText(a, store, task) {
      const m = a.meta || {};
      const st = (k) => k ? store.statusMeta(task.list_id, k).name : 'none';
      const pr = (v) => (PRIORITIES[+v] || {}).label || 'none';
      const dt = (v) => v ? fmtDateShort(v) : 'none';
      const mem = (id) => (m.member_name || m.name || (store.memberById[id] || {}).name || 'someone');
      let bk = 0;
      const B = (x) => h`<b key=${'b' + (bk++)}>${x}</b>`;
      switch (a.kind) {
        case 'created': return ['created this task'];
        case 'status': return ['changed status from ', B(st(a.from_val)), ' to ', B(st(a.to_val))];
        case 'priority': return ['changed priority from ', B(pr(a.from_val)), ' to ', B(pr(a.to_val))];
        case 'assignee_add': return ['assigned ', B(mem(a.to_val))];
        case 'assignee_remove': return ['unassigned ', B(mem(a.from_val || a.to_val))];
        case 'due': return ['changed due date from ', B(dt(a.from_val)), ' to ', B(dt(a.to_val))];
        case 'start': return ['changed start date from ', B(dt(a.from_val)), ' to ', B(dt(a.to_val))];
        case 'title': return ['renamed to ', B(a.to_val || '')];
        case 'description': return ['updated the description'];
        case 'estimate': return ['set the time estimate to ', B(a.to_val ? fmtMinutes(a.to_val) : 'none')];
        case 'moved': return ['moved this to ', B(m.list_name || (store.listById[a.to_val] || {}).name || 'another list')];
        case 'tag': {
          const nm = m.tag_name || m.name || (store.tagById[a.to_val || a.from_val] || {}).name || 'a tag';
          return [(a.to_val || m.action === 'add') && m.action !== 'remove' ? 'added tag ' : 'removed tag ', B(nm)];
        }
        case 'field':
          if (!m.field_name && a.to_val === 'WhatsApp follow-up added') return ['added a WhatsApp follow-up'];
          if (!m.field_name && a.to_val === 'WhatsApp nudge sent') return ['sent a WhatsApp nudge'];
          return ['updated ', B(m.field_name || 'a custom field')];
        case 'checklist': return [m.text ? 'updated checklist item ' : 'updated a checklist', m.text ? B(m.text) : ''];
        case 'attachment': return ['attached ', B(a.to_val || m.name || 'a file')];
        case 'subtask': return ['added subtask ', B(a.to_val || m.title || '')];
        case 'archived': return [a.to_val === 'false' ? 'unarchived this task' : 'archived this task'];
        case 'type': return ['changed type from ', B((TYPE_META[a.from_val] || {}).label || a.from_val || '—'), ' to ', B((TYPE_META[a.to_val] || {}).label || a.to_val || '—')];
        case 'watch': return [a.to_val === 'false' ? 'stopped watching' : 'started watching'];
        default: return [String(a.kind || 'updated').replace(/_/g, ' ')];
      }
    }

    // Unsent comment drafts — localStorage `ams_draft_task_<taskId>` = JSON
    // { v:1, kind:'task_comment', task_id, title, body, updated_at } (Drafts page lists `ams_draft_*`).
    const DRAFT_PREFIX = 'ams_draft_task_';
    const readDraft = (taskId) => {
      let raw = null;
      try { raw = taskId ? localStorage.getItem(DRAFT_PREFIX + taskId) : null; } catch (_) { raw = null; }
      if (!raw) return '';
      try { const j = JSON.parse(raw); return j && typeof j === 'object' ? String(j.body || j.text || '') : String(j == null ? '' : j); }
      catch (_) { return raw; }
    };
    const writeDraft = (taskId, title, body) => {
      try {
        if (String(body || '').trim()) localStorage.setItem(DRAFT_PREFIX + taskId, JSON.stringify({ v: 1, kind: 'task_comment', task_id: taskId, title: title || '', body, updated_at: new Date().toISOString() }));
        else localStorage.removeItem(DRAFT_PREFIX + taskId);
      } catch (_) { }
    };

    function Composer({ onSend, placeholder = 'Write a comment… (@ to mention)', simple, initialBody = '', submitLabel = 'Comment', onCancel, autoFocus, inline, taskId, taskTitle, draft }) {
      const store = useTaskStore();
      const draftId = draft && taskId ? taskId : null;
      const [body, setBody] = useState(() => initialBody || (draftId ? readDraft(draftId) : ''));
      const bodyRef = useRef(body); bodyRef.current = body;
      const titleRef = useRef(taskTitle); titleRef.current = taskTitle;
      useEffect(() => {
        if (!draftId) return;
        const t = setTimeout(() => writeDraft(draftId, titleRef.current, body), 400);
        return () => clearTimeout(t);
      }, [body, draftId]);
      // flush on unmount so a quick close/tab switch doesn't lose the last keystrokes
      useEffect(() => () => { if (draftId) writeDraft(draftId, titleRef.current, bodyRef.current); }, [draftId]);
      const [at, setAt] = useState(null);           // { q, start, idx }
      const [assignTo, setAssignTo] = useState([]);
      const [atts, setAtts] = useState([]);
      const [uploading, setUploading] = useState(0);
      const [sending, setSending] = useState(false);
      const ta = useRef(null);
      const fileRef = useRef(null);
      const members = store.members.filter(m => m && m.role_level !== 'client');
      const grow = () => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(180, el.scrollHeight) + 'px'; } };
      useLayoutEffect(grow, [body]);
      useEffect(() => { if (autoFocus && ta.current) { ta.current.focus(); const n = ta.current.value.length; try { ta.current.setSelectionRange(n, n); } catch (_) { } } }, []);
      const matches = at ? members.filter(m => String(m.name).toLowerCase().includes(at.q.toLowerCase())).slice(0, 7) : [];
      const onInput = (e) => {
        const v = e.target.value; setBody(v);
        const caret = e.target.selectionStart || v.length;
        const mm = /(^|\s)@([^\s@]{0,30})$/.exec(v.slice(0, caret));
        setAt(mm ? { q: mm[2], start: caret - mm[2].length - 1, idx: 0 } : null);
      };
      const pick = (m) => {
        if (!at) return;
        const el = ta.current;
        const caret = el ? (el.selectionStart || body.length) : body.length;
        const insert = '@' + m.name + ' ';
        const next = body.slice(0, at.start) + insert + body.slice(caret);
        setBody(next); setAt(null);
        const pos = at.start + insert.length;
        setTimeout(() => { if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (_) { } } }, 0);
      };
      const send = async () => {
        const text = body.trim();
        if ((!text && !atts.length) || sending || uploading) return;
        const mentions = members.filter(m => text.includes('@' + m.name)).map(m => m.id);
        setSending(true);
        try {
          await onSend(text, { mentions, assignedTo: assignTo[0] || null, attachments: atts });
          bodyRef.current = '';
          setBody(''); setAssignTo([]); setAtts([]); setAt(null);
          if (draftId) writeDraft(draftId, titleRef.current, '');
        } catch (_) { /* caller toasts */ }
        setSending(false);
      };
      const onFiles = async (files) => {
        for (const f of Array.from(files || [])) {
          setUploading(n => n + 1);
          try { const up = await TaskAPI.uploadFile(f); setAtts(a => [...a, up]); }
          catch (e) { console.warn('[tasks] comment upload', e); }
          setUploading(n => n - 1);
        }
      };
      const sendOnEnter = !!store.prefs.send_on_enter;
      const tools = simple ? [] : extItems('composerTools').filter(t => typeof t.run === 'function');
      const insertText = (str) => {
        const s = String(str == null ? '' : str);
        if (!s) return;
        const el = ta.current;
        const cur = bodyRef.current || '';
        const focused = el && document.activeElement === el;
        const start = focused && typeof el.selectionStart === 'number' ? el.selectionStart : cur.length;
        const end = focused && typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
        const next = cur.slice(0, start) + s + cur.slice(end);
        bodyRef.current = next;
        setBody(next);
        const pos = start + s.length;
        setTimeout(() => { if (el) { try { el.focus(); el.setSelectionRange(pos, pos); } catch (_) { } } }, 0);
      };
      const addAttachment = (x) => {
        if (!x) return;
        if (typeof Blob !== 'undefined' && x instanceof Blob) { onFiles([x]); return; }
        if (x.url) setAtts(a => [...a, { name: x.name || String(x.url).split('/').pop() || 'file', url: x.url, path: x.path || null, mime: x.mime || x.type || '', size: Number(x.size) || 0 }]);
      };
      const runTool = async (tool) => {
        try { await tool.run({ insertText, addAttachment, context: { taskId: taskId || null } }); }
        catch (e) { console.warn('[tasks] composer tool failed', extKey(tool), e); }
      };
      const assignee = assignTo[0] ? store.memberById[assignTo[0]] : null;
      return h`<div class=${'cu-composer' + (inline ? ' inline' : '')}>
        ${at && matches.length ? h`<div class="cu-at" role="listbox" aria-label="Mention someone">
          ${matches.map((m, i) => h`<button key=${m.id} type="button" role="option" aria-selected=${i === at.idx} class=${'cu-mi' + (i === at.idx ? ' act' : '')}
            onMouseDown=${e => { e.preventDefault(); pick(m); }}><${MemberAvatar} member=${m} size=${20}/>${m.name}</button>`)}
        </div>` : null}
        <div class="cu-comp-box">
          <textarea ref=${ta} rows=${1} value=${body} placeholder=${placeholder} aria-label=${placeholder}
            onInput=${onInput}
            onKeyDown=${e => {
              if (at && matches.length) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setAt(a => ({ ...a, idx: (a.idx + 1) % matches.length })); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setAt(a => ({ ...a, idx: (a.idx - 1 + matches.length) % matches.length })); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[Math.min(at.idx, matches.length - 1)]); return; }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAt(null); return; }
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && (e.metaKey || e.ctrlKey || sendOnEnter)) { e.preventDefault(); send(); return; }
              if (e.key === 'Escape' && onCancel) { e.preventDefault(); e.stopPropagation(); onCancel(); }
            }}></textarea>
          ${atts.length || uploading ? h`<div class="cu-pend">
            ${atts.map((a, i) => h`<span key=${i} class="cu-chip"><i class="ti ti-paperclip"></i><span style=${{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>${a.name}</span>
              <button type="button" class="cu-ibtn" style=${{ width: 16, height: 16, fontSize: 12 }} aria-label=${'Remove ' + a.name} onClick=${() => setAtts(x => x.filter((_, j) => j !== i))}><i class="ti ti-x"></i></button></span>`)}
            ${uploading ? h`<span class="cu-chip"><i class="ti ti-loader-2 cu-spin"></i>Uploading…</span>` : null}
          </div>` : null}
          <div class="cu-comp-bar">
            ${!simple ? h`<${Fragment}>
              <button type="button" class="cu-ibtn" aria-label="Mention someone" title="Mention" onClick=${() => { const v = body + (body && !/\s$/.test(body) ? ' @' : '@'); setBody(v); setAt({ q: '', start: v.length - 1, idx: 0 }); if (ta.current) ta.current.focus(); }}><i class="ti ti-at"></i></button>
              <input ref=${fileRef} type="file" multiple style=${{ display: 'none' }} onChange=${e => { onFiles(e.target.files); e.target.value = ''; }}/>
              <button type="button" class="cu-ibtn" aria-label="Attach file" title="Attach" onClick=${() => fileRef.current && fileRef.current.click()}><i class="ti ti-paperclip"></i></button>
              <${AssigneePicker} multi=${false} value=${assignTo} onChange=${setAssignTo} label="Assign comment to"
                anchorContent=${assignee
                  ? h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--cu-accent-ink)' }}><i class="ti ti-user-check"></i>${assignee.name}</span>`
                  : h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--cu-t2)' }}><i class="ti ti-user-share"></i><span class="cu-hide-xs">Assign</span></span>`}/>
              ${tools.map(tool => h`<button key=${'tool:' + extKey(tool)} type="button" class="cu-ibtn" aria-label=${tool.title || String(extKey(tool))} title=${tool.title || ''}
                onClick=${() => runTool(tool)}><i class=${'ti ' + tiIcon(tool.icon)}></i></button>`)}
            <//>` : null}
            <span style=${{ flex: 1 }}></span>
            ${onCancel ? h`<button type="button" class="cu-btn cu-btn-ghost" style=${{ height: 26 }} onClick=${onCancel}>Cancel</button>` : null}
            <button type="button" class="cu-btn cu-btn-pri" style=${{ height: 26 }} disabled=${sending || uploading > 0 || (!body.trim() && !atts.length)} onClick=${send}
              title=${sendOnEnter ? 'Enter to send · Shift + Enter for a new line' : '⌘/Ctrl + Enter'}>
              ${sending ? h`<i class="ti ti-loader-2 cu-spin"></i>` : null}${submitLabel}
            </button>
          </div>
        </div>
      </div>`;
    }

    function useCommentActions(task, setComments, showToast) {
      const store = useTaskStore();
      const me = store.me || {};
      const replace = (id, next) => setComments(cur => cur.map(c => c.id === id ? { ...c, ...next } : c));
      const fail = (label, e) => { showToast && showToast(label + ': ' + errMsg(e)); };
      return {
        async add(body, opts, parentId) {
          const tmp = { id: 'tmp-' + uuid(), task_id: task.id, parent_id: parentId || null, author_id: me.id, author_name: me.name, author_initials: me.initials, author_color: me.color, body, mentions: opts.mentions, assigned_to: opts.assignedTo, assigned_to_name: opts.assignedTo ? (store.memberById[opts.assignedTo] || {}).name : null, reactions: {}, attachments: opts.attachments, created_at: new Date().toISOString(), _pending: true };
          setComments(cur => [...cur, tmp]);
          try {
            const c = await TaskAPI.commentAdd(task.id, body, { ...opts, parentId: parentId || null });
            setComments(cur => cur.map(x => x.id === tmp.id ? (c && c.id ? c : { ...x, _pending: false }) : x));
          } catch (e) { setComments(cur => cur.filter(x => x.id !== tmp.id)); fail('Could not post comment', e); throw e; }
        },
        async edit(c, body) {
          const prev = { body: c.body, edited_at: c.edited_at };
          replace(c.id, { body, edited_at: new Date().toISOString() });
          try { const r = await TaskAPI.commentUpdate(c.id, { body }); if (r && r.id) replace(c.id, r); }
          catch (e) { replace(c.id, prev); fail('Could not edit comment', e); throw e; }
        },
        async resolve(c, on = true) {
          const prev = { resolved_at: c.resolved_at, resolved_by_name: c.resolved_by_name };
          replace(c.id, on ? { resolved_at: new Date().toISOString(), resolved_by_name: me.name } : { resolved_at: null, resolved_by_name: null });
          try { const r = await TaskAPI.commentUpdate(c.id, { resolved: on }); if (r && r.id) replace(c.id, r); }
          catch (e) { replace(c.id, prev); fail('Could not resolve', e); }
        },
        async react(c, emoji) {
          const prev = c.reactions || {};
          const ids = arr(prev[emoji]);
          const nextIds = ids.includes(me.id) ? ids.filter(x => x !== me.id) : [...ids, me.id];
          const next = { ...prev, [emoji]: nextIds };
          if (!nextIds.length) delete next[emoji];
          replace(c.id, { reactions: next });
          try { const r = await TaskAPI.commentReact(c.id, emoji); if (r && r.id) replace(c.id, { reactions: r.reactions || {} }); }
          catch (e) { replace(c.id, { reactions: prev }); fail('Could not react', e); }
        },
        async remove(c) {
          if (!confirm('Delete this comment?')) return;
          let snap = null;
          setComments(cur => { snap = cur; return cur.filter(x => x.id !== c.id && x.parent_id !== c.id); });
          try { await TaskAPI.commentDelete(c.id, task.id); }
          catch (e) { if (snap) setComments(snap); fail('Could not delete comment', e); }
        },
      };
    }

    function CommentItem({ c, replies, actions, depth = 0 }) {
      const store = useTaskStore();
      const me = store.me || {};
      const [editing, setEditing] = useState(false);
      const [threadOpen, setThreadOpen] = useState(false);
      const [replying, setReplying] = useState(false);
      const reactPop = usePop();
      const morePop = usePop();
      const mine = c.author_id && c.author_id === me.id;
      const reacts = Object.entries(c.reactions || {}).filter(([, ids]) => arr(ids).length);
      const kids = arr(replies);
      const author = { id: c.author_id, name: c.author_name, initials: c.author_initials, color: c.author_color };
      return h`<div class=${'cu-cmt' + (c.assigned_to && !c.resolved_at ? ' assigned' : '')} style=${c._pending ? { opacity: .65 } : null}>
        <div class="cu-cmt-hd">
          <${MemberAvatar} member=${author} size=${depth ? 20 : 24}/>
          <span class="cu-cmt-n">${c.author_name || 'Someone'}</span>
          <span class="cu-cmt-w" title=${c.created_at ? new Date(c.created_at).toLocaleString('en-IN') : ''}>${c._pending ? 'Sending…' : fmtRelative(c.created_at)}${c.edited_at ? ' · edited' : ''}</span>
          ${!c._pending ? h`<span class="cu-cmt-acts cu-hov">
            <button type="button" ref=${reactPop.ref} class="cu-ibtn" style=${{ width: 24, height: 24 }} aria-label="Add reaction" onClick=${reactPop.toggle}><i class="ti ti-mood-plus" style=${{ fontSize: 14 }}></i></button>
            ${depth === 0 ? h`<button type="button" class="cu-ibtn" style=${{ width: 24, height: 24 }} aria-label="Reply" onClick=${() => { setThreadOpen(true); setReplying(true); }}><i class="ti ti-arrow-back-up" style=${{ fontSize: 14 }}></i></button>` : null}
            <button type="button" ref=${morePop.ref} class="cu-ibtn" style=${{ width: 24, height: 24 }} aria-label="More comment actions" onClick=${morePop.toggle}><i class="ti ti-dots" style=${{ fontSize: 14 }}></i></button>
          </span>` : null}
        </div>
        <${Popover} anchor=${reactPop.anchor} open=${reactPop.open} onClose=${reactPop.close} placement="bottom-end">
          <div style=${{ display: 'flex', gap: 2, padding: 4 }}>
            ${REACTIONS.map(em => h`<button key=${em} type="button" class="cu-ibtn" style=${{ fontSize: 18, width: 32, height: 32 }} aria-label=${'React ' + em} onClick=${() => { reactPop.close(); actions.react(c, em); }}>${em}</button>`)}
          </div>
        <//>
        <${Popover} anchor=${morePop.anchor} open=${morePop.open} onClose=${morePop.close} placement="bottom-end">
          <${Menu} onClose=${morePop.close} items=${[
            { key: 'copy', label: 'Copy text', icon: 'ti-copy', onSelect: () => copyText(c.body || '') },
            ...(c.assigned_to ? [{ key: 'res', label: c.resolved_at ? 'Reopen' : 'Resolve', icon: c.resolved_at ? 'ti-refresh' : 'ti-circle-check', onSelect: () => actions.resolve(c, !c.resolved_at) }] : []),
            ...(mine ? [{ divider: true }, { key: 'edit', label: 'Edit', icon: 'ti-pencil', onSelect: () => setEditing(true) }, { key: 'del', label: 'Delete', icon: 'ti-trash', danger: true, onSelect: () => actions.remove(c) }] : []),
          ]}/>
        <//>
        ${editing
          ? h`<${Composer} inline=${true} simple=${true} autoFocus=${true} initialBody=${c.body || ''} submitLabel="Save" onCancel=${() => setEditing(false)}
              onSend=${async (text) => { await actions.edit(c, text); setEditing(false); }}/>`
          : c.body ? h`<div class="cu-cmt-body">${renderMentions(c.body, store.members)}</div>` : null}
        ${arr(c.attachments).length ? h`<div class="cu-cmt-att">
          ${arr(c.attachments).map((a, i) => /^image\//.test(a.mime || '')
            ? h`<a key=${i} href=${a.url} target="_blank" rel="noopener" style=${{ padding: 0, border: 'none', background: 'none' }}><img src=${a.url} alt=${a.name} loading="lazy"/></a>`
            : h`<a key=${i} href=${a.url} target="_blank" rel="noopener"><i class="ti ti-paperclip"></i><span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${a.name}</span></a>`)}
        </div>` : null}
        ${c.assigned_to ? h`<div class=${'cu-assignbar' + (c.resolved_at ? ' resolved' : '')}>
          ${c.resolved_at
            ? h`<${Fragment}><i class="ti ti-circle-check-filled" style=${{ color: '#30a46c' }}></i><span>Resolved${c.resolved_by_name ? ' by ' + c.resolved_by_name : ''}</span><//>`
            : h`<${Fragment}><i class="ti ti-user-check" style=${{ color: 'var(--cu-accent-ink)' }}></i><span>Assigned to <b>${c.assigned_to === me.id ? 'you' : (c.assigned_to_name || (store.memberById[c.assigned_to] || {}).name || 'someone')}</b></span>
                <span style=${{ flex: 1 }}></span>
                <button type="button" class="cu-btn" style=${{ height: 24, fontSize: 12 }} disabled=${c._pending} onClick=${() => actions.resolve(c, true)}><i class="ti ti-check"></i>Resolve</button><//>`}
        </div>` : null}
        ${reacts.length ? h`<div class="cu-reacts">
          ${reacts.map(([em, ids]) => {
            const names = arr(ids).map(id => (store.memberById[id] || {}).name).filter(Boolean).join(', ');
            return h`<button key=${em} type="button" class=${'cu-react' + (arr(ids).includes(me.id) ? ' mine' : '')} title=${names} aria-label=${em + ' ' + arr(ids).length} onClick=${() => actions.react(c, em)}>${em}<span>${arr(ids).length}</span></button>`;
          })}
        </div>` : null}
        ${depth === 0 && (kids.length || replying) ? h`<div>
          ${kids.length && !threadOpen ? h`<button type="button" class="cu-addbtn" style=${{ marginTop: 4, color: 'var(--cu-accent-ink)', fontSize: 12 }} onClick=${() => setThreadOpen(true)}>
            <i class="ti ti-messages"></i>${kids.length} ${kids.length === 1 ? 'reply' : 'replies'}</button>` : null}
          ${threadOpen || replying ? h`<div class="cu-thread">
            ${kids.map(r => h`<${CommentItem} key=${r.id} c=${r} actions=${actions} depth=${1}/>`)}
            ${replying
              ? h`<${Composer} inline=${true} autoFocus=${true} placeholder="Reply… (@ to mention)" submitLabel="Reply" onCancel=${() => setReplying(false)}
                  onSend=${async (text, opts) => { await actions.add(text, opts, c.id); }}/>`
              : h`<button type="button" class="cu-addbtn" style=${{ fontSize: 12 }} onClick=${() => setReplying(true)}><i class="ti ti-arrow-back-up"></i>Reply</button>`}
          </div>` : null}
        </div>` : null}
      </div>`;
    }

    function FeedPane({ task, comments, setComments, activity, statusHistory, sideSections, extProps, showToast }) {
      const store = useTaskStore();
      const [tab, setTab] = useState('activity');
      const feedRef = useRef(null);
      const side = arr(sideSections);
      const activeExt = tab.indexOf('ext:') === 0 ? side.find(s => 'ext:' + extKey(s) === tab) || null : null;
      useEffect(() => { if (tab.indexOf('ext:') === 0 && !activeExt) setTab('activity'); }, [tab, !!activeExt]);
      const xp = extProps || {};
      const actions = useCommentActions(task, setComments, showToast);
      const all = arr(comments);
      const top = all.filter(c => !c.parent_id);
      const byParent = useMemo(() => { const m = {}; all.forEach(c => { if (c.parent_id) (m[c.parent_id] = m[c.parent_id] || []).push(c); }); Object.values(m).forEach(l => l.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))); return m; }, [comments]);
      const items = useMemo(() => {
        const cs = top.map(c => ({ k: 'c', at: c.created_at, c }));
        const as = tab === 'activity' ? arr(activity).filter(a => a.kind !== 'comment').map(a => ({ k: 'a', at: a.created_at, a })) : [];
        return cs.concat(as).sort((x, y) => new Date(x.at || 0) - new Date(y.at || 0));
      }, [comments, activity, tab]);
      const count = items.length;
      useEffect(() => { const el = feedRef.current; if (el) el.scrollTop = el.scrollHeight; }, [count, tab]);
      return h`<aside class="cu-tp-right" aria-label="Activity and comments">
        <div class="cu-tabs" role="tablist" style=${{ overflowX: 'auto' }}>
          <button type="button" role="tab" aria-selected=${tab === 'activity'} class=${'cu-tab' + (tab === 'activity' ? ' on' : '')} onClick=${() => setTab('activity')}>Activity</button>
          <button type="button" role="tab" aria-selected=${tab === 'comments'} class=${'cu-tab' + (tab === 'comments' ? ' on' : '')} onClick=${() => setTab('comments')}>Comments<span class="n">${all.length || ''}</span></button>
          ${side.map(s => { const k = 'ext:' + extKey(s); return h`<button key=${k} type="button" role="tab" aria-selected=${tab === k} class=${'cu-tab' + (tab === k ? ' on' : '')} style=${{ whiteSpace: 'nowrap' }} onClick=${() => setTab(k)}>
            ${s.icon ? h`<i class=${'ti ' + tiIcon(s.icon)} aria-hidden="true"></i>` : null}${s.title}</button>`; })}
        </div>
        ${activeExt ? h`<div class="cu-ext-pane" role="tabpanel" aria-label=${activeExt.title || 'Section'}>
          <${ExtBoundary} name=${extKey(activeExt)}>
            <${activeExt.Component} task=${task} detail=${xp.detail} reload=${xp.reload} showToast=${showToast} currentUser=${xp.currentUser}/>
          <//>
        </div>` : null}
        ${!activeExt && tab === 'activity' && arr(statusHistory).length ? h`<${StatusTimeline} history=${statusHistory} task=${task}/>` : null}
        <div class="cu-feed" ref=${feedRef} role="log" aria-live="polite" hidden=${!!activeExt}>
          ${!items.length ? h`<${EmptyState} icon=${tab === 'comments' ? 'ti-message-circle' : 'ti-history'} title=${tab === 'comments' ? 'No comments yet' : 'No activity yet'} sub="Start the conversation below — @mention teammates to loop them in."/>` : null}
          ${items.map(it => it.k === 'a'
            ? h`<div key=${'a' + it.a.id} class="cu-act">
                <span style=${{ minWidth: 0 }}><b>${it.a.actor_name || 'System'}</b> ${activityText(it.a, store, task)}</span>
                <span class="when" title=${it.a.created_at ? new Date(it.a.created_at).toLocaleString('en-IN') : ''}>${fmtRelative(it.a.created_at)}</span>
              </div>`
            : h`<${CommentItem} key=${'c' + it.c.id} c=${it.c} replies=${byParent[it.c.id]} actions=${actions}/>`)}
        </div>
        ${!activeExt ? h`<${Composer} taskId=${task.id} taskTitle=${task.title} draft=${true} onSend=${(text, opts) => actions.add(text, opts, null)}/>` : null}
      </aside>`;
    }

    // =========================================================================
    // WhatsApp — scheduled follow-ups + manual nudge (migration 089)
    // =========================================================================
    const WA_GREEN = '#25D366';
    const WA_ERRORS = {
      time_in_past: 'That time has already passed',
      task_has_no_due_date: 'Set a due date first',
      too_many_followups: 'Max 10 follow-ups per task',
      bad_interval: 'That reminder interval is too short',
      whatsapp_disabled: "WhatsApp isn't set up yet — an admin can turn it on in Settings → WhatsApp",
      not_found: 'Task not found',
    };
    function waErr(e, forbiddenMsg) {
      if (e && e.code === 'forbidden') return forbiddenMsg || 'Only the assignee, creator or a manager can set follow-ups';
      const m = String((e && e.message) || '');
      const k = Object.keys(WA_ERRORS).find(x => m.includes(x));
      if (k) return WA_ERRORS[k];
      if (/could not find the function|PGRST202/i.test(m)) return 'WhatsApp needs database migration 089';
      return errMsg(e);
    }
    const atLocal = (hh, mm, dayOffset) => { const d = new Date(); d.setDate(d.getDate() + (dayOffset || 0)); d.setHours(hh, mm, 0, 0); return d; };
    // build() is called at the moment of use so "In 1 hour" etc. are fresh.
    const FOLLOWUP_PRESETS = [
      { key: 'in1h', group: 'Once', label: 'In 1 hour', icon: 'ti-clock', build: () => ({ kind: 'at', at: new Date(Date.now() + 3600000).toISOString() }) },
      { key: 'today5', group: 'Once', label: 'Today 5 PM', icon: 'ti-sun', build: () => ({ kind: 'at', at: atLocal(17, 0).toISOString() }), hint: () => (atLocal(17, 0).getTime() <= Date.now() ? 'Past 5 PM' : null) },
      { key: 'tomorrow10', group: 'Once', label: 'Tomorrow 10 AM', icon: 'ti-sunrise', build: () => ({ kind: 'at', at: atLocal(10, 0, 1).toISOString() }) },
      { key: 'every2h', group: 'Repeat until done', label: 'Every 2 hours until done', icon: 'ti-repeat', build: () => ({ kind: 'every', every_minutes: 120 }) },
      { key: 'every4h', group: 'Repeat until done', label: 'Every 4 hours until done', icon: 'ti-repeat', build: () => ({ kind: 'every', every_minutes: 240 }) },
      { key: 'daily10', group: 'Repeat until done', label: 'Every day at 10 AM until done', icon: 'ti-calendar-repeat',
        build: () => { let d = atLocal(10, 0); if (d.getTime() <= Date.now()) d = atLocal(10, 0, 1); return { kind: 'every', every_minutes: 1440, start_at: d.toISOString() }; } },
      { key: 'before1h', group: 'Before due', label: '1 hour before due', icon: 'ti-alarm', needsDue: 60, build: () => ({ kind: 'before_due', before_minutes: 60 }) },
      { key: 'before1d', group: 'Before due', label: '1 day before due', icon: 'ti-alarm', needsDue: 1440, build: () => ({ kind: 'before_due', before_minutes: 1440 }) },
    ];
    // Why a preset can't be used right now (null = OK).
    function presetBlock(p, dueAt) {
      if (!p) return null;
      if (p.needsDue) {
        if (!dueAt) return 'Set a due date first';
        if (new Date(dueAt).getTime() - p.needsDue * 60000 <= Date.now()) return 'Due too soon';
      }
      return p.hint ? p.hint() : null;
    }
    const fmtSpan = (n) => (n % 1440 === 0 ? (n === 1440 ? '1 day' : n / 1440 + ' days') : n % 60 === 0 ? (n / 60) + 'h' : fmtMinutes(n));
    const fmtWhen = (iso) => { const d = new Date(iso); if (isNaN(d)) return ''; return sameDay(d, new Date()) ? fmtTime(d) : fmtDue(iso, true).text.replace(', ', ' '); };
    function followupLabel(f) {
      if (f.kind === 'every') {
        const n = Number(f.every_minutes) || 0;
        return (n === 1440 ? 'Every day' : 'Every ' + fmtSpan(n)) + ' until done' + (f.active && f.next_at ? ' · next ' + fmtWhen(f.next_at) : '');
      }
      if (f.kind === 'before_due') return fmtSpan(Number(f.before_minutes) || 0) + ' before due';
      const at = f.at || f.next_at;
      return at ? fmtDue(at, true).text.replace(', ', ' ') : 'Once';
    }
    function followupTitle(f) {
      const parts = [];
      if (!f.active) parts.push(f.sent_count ? 'Finished' : 'Paused (task is closed or the time has passed)');
      else if (f.next_at) parts.push('Next: ' + new Date(f.next_at).toLocaleString('en-IN'));
      parts.push(f.sent_count ? 'Sent ' + f.sent_count + '×' + (f.last_sent_at ? ' · last ' + new Date(f.last_sent_at).toLocaleString('en-IN') : '') : 'Not sent yet');
      return parts.join(' · ');
    }

    function FollowupPresetList({ dueAt, onPick, onCustom }) {
      let last = null;
      return h`<div class="cu-menu" style=${{ minWidth: 250 }} role="menu" aria-label="Add WhatsApp follow-up">
        ${FOLLOWUP_PRESETS.map(p => {
          const block = presetBlock(p, dueAt);
          const grp = p.group !== last ? p.group : null;
          last = p.group;
          return h`<${Fragment} key=${p.key}>
            ${grp ? h`<div class="cu-pk-grp">${grp}</div>` : null}
            <button type="button" role="menuitem" class="cu-mi" disabled=${!!block} title=${block || ''} onClick=${() => onPick(p)}>
              <i class=${'ti ' + p.icon}></i>
              <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${p.label}</span>
              ${block ? h`<span class="cu-mi-r">${block}</span>` : null}
            </button>
          <//>`;
        })}
        <div class="cu-mdiv" role="separator"></div>
        <button type="button" role="menuitem" class="cu-mi" onClick=${onCustom}><i class="ti ti-calendar-time"></i>Custom time…</button>
      </div>`;
    }

    // TaskPanel row: active schedules as chips, × to delete, "+ Add" presets.
    function WhatsAppFollowups({ task, showToast, onCount }) {
      const [items, setItems] = useState(null);
      const [busy, setBusy] = useState(false);
      const [custom, setCustom] = useState(false);
      const pop = usePop();
      const onCountRef = useRef(onCount); onCountRef.current = onCount;
      const toast = (m) => { if (showToast) showToast(m); };
      const load = useCallback(async () => {
        try { const r = await TaskAPI.followupsList(task.id); setItems(arr(r)); }
        catch (_) { setItems(cur => cur || []); }
      }, [task.id]);
      // the 089 trigger re-arms / pauses schedules when status or due date change
      useEffect(() => { load(); }, [load, task.due_at, task.status_category]);
      useEffect(() => { if (items && onCountRef.current) onCountRef.current(items.length); }, [items]);
      const close = () => { pop.close(); setCustom(false); };
      const add = async (data) => {
        close(); setBusy(true);
        try {
          const f = await TaskAPI.followupAdd(task.id, data);
          if (f && f.id) setItems(cur => [...arr(cur), f]); else load();
          toast('WhatsApp follow-up set');
        } catch (e) { toast(waErr(e)); }
        setBusy(false);
      };
      const remove = async (f) => {
        setItems(cur => arr(cur).filter(x => x.id !== f.id));
        try { await TaskAPI.followupDelete(f.id, task.id); }
        catch (e) { toast(waErr(e)); load(); }
      };
      const list = arr(items).slice().sort((a, b) => (Number(!!b.active) - Number(!!a.active)) || (new Date(a.next_at || a.created_at) - new Date(b.next_at || b.created_at)));
      return h`<div style=${{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
        ${items === null ? h`<span style=${{ fontSize: 12, color: 'var(--cu-t3)' }}>Loading…</span>` : null}
        ${list.map(f => h`<span key=${f.id} class=${'cu-wa-chip' + (f.active ? '' : ' off')} title=${followupTitle(f)}>
          <i class=${'ti ' + (f.kind === 'every' ? 'ti-repeat' : f.kind === 'before_due' ? 'ti-alarm' : 'ti-clock')} aria-hidden="true"></i>
          <span>${followupLabel(f)}</span>
          ${f.sent_count ? h`<span class="cu-wa-n">${f.sent_count}×</span>` : null}
          <button type="button" class="cu-wa-x" aria-label=${'Remove follow-up: ' + followupLabel(f)} onClick=${() => remove(f)}><i class="ti ti-x"></i></button>
        </span>`)}
        <button type="button" ref=${pop.ref} class="cu-addbtn" style=${{ padding: '4px 6px' }} disabled=${busy || items === null}
          aria-haspopup="menu" aria-expanded=${pop.open} onClick=${() => { setCustom(false); pop.toggle(); }}>
          <i class=${'ti ' + (busy ? 'ti-loader-2 cu-spin' : 'ti-plus')}></i>${list.length ? 'Add' : 'Add follow-up'}
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${close} ariaLabel="Add WhatsApp follow-up">
          ${custom
            ? h`<div>
                <div style=${{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--cu-bd)' }}>
                  <button type="button" class="cu-ibtn" aria-label="Back to presets" onClick=${() => setCustom(false)}><i class="ti ti-arrow-left"></i></button>
                  <div style=${{ minWidth: 0 }}>
                    <div style=${{ fontSize: 12, fontWeight: 600 }}>Send a WhatsApp reminder on…</div>
                    <div class="cu-wa-hint">Tick “Time” to pick the hour (default 10:00 AM)</div>
                  </div>
                </div>
                <${DatePickerBody} value=${null} hasTime=${false} withTime=${true} endOfDay=${false}
                  onApply=${(iso, hasT) => { const d = new Date(iso); if (!hasT) d.setHours(10, 0, 0, 0); add({ kind: 'at', at: d.toISOString() }); }}
                  onClear=${() => setCustom(false)}/>
              </div>`
            : h`<${FollowupPresetList} dueAt=${task.due_at} onPick=${p => add(p.build())} onCustom=${() => setCustom(true)}/>`}
        <//>
      </div>`;
    }

    // Header "…" → "Nudge on WhatsApp now"
    function WhatsAppNudge({ task, onDone, showToast }) {
      const store = useTaskStore();
      const me = store.me || {};
      const [note, setNote] = useState('');
      const [busy, setBusy] = useState(false);
      const [fallback, setFallback] = useState(null);   // { name, phone, text }
      const inRef = useRef(null);
      const toast = (m) => { if (showToast) showToast(m); };
      useEffect(() => { setTimeout(() => { try { if (inRef.current) inRef.current.focus(); } catch (_) { } }, 0); }, []);
      const others = arr(task.assignees).filter(a => a && a.id && a.id !== me.id);

      const reminderText = (name) => {
        const ht = task.due_has_time === undefined || task.due_has_time === null ? undefined : !!task.due_has_time;
        const due = task.due_at ? fmtDue(task.due_at, ht).text : '';
        return 'Hi ' + (name ? String(name).split(' ')[0] : 'there') + ', reminder: *' + (task.title || 'this task') + '* is still pending.'
          + (due ? ' Due: ' + due + '.' : '')
          + (note.trim() ? '\n' + note.trim() : '')
          + (me.name ? '\n— ' + me.name : '')
          + '\n' + taskLink(task.id);
      };
      const buildFallback = async () => {
        const first = others[0] || null;
        let phone = '';
        if (first && (me.role_level === 'admin' || me.role_level === 'manager')) {
          try {
            const row = arr(await TaskAPI.waTeamList()).find(t => t.member_id === first.id);
            phone = row && row.phone ? String(row.phone).replace(/\D/g, '') : '';
          } catch (_) { /* no phone → message only */ }
        }
        setFallback({ name: first ? first.name : '', phone, text: reminderText(first && first.name) });
      };
      const send = async () => {
        if (busy) return;
        setBusy(true);
        try {
          const r = await TaskAPI.whatsappNudge(task.id, note.trim() || null);
          const n = Number(r && r.queued) || 0;
          const skipped = arr(r && r.skipped);
          if (!n && !skipped.length) toast('No one else is assigned to this task');
          else if (!skipped.length) toast('Sent to ' + n + (n === 1 ? ' person' : ' people'));
          else toast('Sent to ' + n + ' · no WhatsApp number for ' + skipped.join(', '));
          setBusy(false);
          if (onDone) onDone();
          return;
        } catch (e) {
          if (String((e && e.message) || '').includes('whatsapp_disabled')) await buildFallback();
          else toast('Could not nudge: ' + waErr(e, "You don't have access to nudge on this task"));
        }
        setBusy(false);
      };

      if (fallback) {
        const href = 'https://wa.me/' + (fallback.phone || '') + '?text=' + encodeURIComponent(fallback.text);
        return h`<div style=${{ padding: 12, width: 310, maxWidth: 'calc(100vw - 16px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style=${{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.45 }}>
            <i class="ti ti-alert-triangle" style=${{ color: '#d97706', fontSize: 16, marginTop: 1, flexShrink: 0 }}></i>
            <span>${WA_ERRORS.whatsapp_disabled}</span>
          </div>
          <div style=${{ fontSize: 12, color: 'var(--cu-t2)' }}>${fallback.phone ? 'Send it from your own WhatsApp instead:' : 'You can copy this reminder and send it from your own WhatsApp:'}</div>
          <div class="cu-wa-preview">${fallback.text}</div>
          <div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <a class="cu-btn cu-btn-pri cu-wa-btn" href=${href} target="_blank" rel="noopener noreferrer" onClick=${() => setTimeout(() => onDone && onDone(), 60)}>
              <i class="ti ti-brand-whatsapp"></i>${fallback.phone ? 'Open chat with ' + String(fallback.name || '').split(' ')[0] : 'Open WhatsApp'}</a>
            <button type="button" class="cu-btn" onClick=${async () => { const ok = await copyText(fallback.text); toast(ok ? 'Reminder copied' : 'Copy failed'); }}><i class="ti ti-copy"></i>Copy</button>
          </div>
        </div>`;
      }
      return h`<div style=${{ padding: 12, width: 310, maxWidth: 'calc(100vw - 16px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style=${{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
          <i class="ti ti-brand-whatsapp" style=${{ color: WA_GREEN, fontSize: 16 }}></i>Nudge on WhatsApp now
        </div>
        <div style=${{ fontSize: 12, color: 'var(--cu-t2)', lineHeight: 1.4 }}>
          ${others.length ? 'Sends a reminder to ' + others.map(a => a.name).join(', ') + ' right away — quiet hours are skipped.' : 'No one else is assigned to this task yet.'}
        </div>
        <textarea ref=${inRef} class="cu-input" rows=${3} maxLength=${300} value=${note} placeholder="Add a note (optional)" aria-label="Note"
          style=${{ height: 'auto', padding: '6px 10px', resize: 'vertical', lineHeight: 1.45 }}
          onInput=${e => setNote(e.target.value)}
          onKeyDown=${e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}></textarea>
        <div class="cu-wa-hint">The note is saved in the message log; the WhatsApp message itself uses the approved reminder template.</div>
        <div style=${{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button type="button" class="cu-btn cu-btn-ghost" onClick=${() => onDone && onDone()}>Cancel</button>
          <button type="button" class="cu-btn cu-btn-pri" disabled=${busy || !others.length} onClick=${send} title="⌘/Ctrl + Enter">
            ${busy ? h`<i class="ti ti-loader-2 cu-spin"></i>` : h`<i class="ti ti-send"></i>`}Send
          </button>
        </div>
      </div>`;
    }

    // =========================================================================
    // v2 atoms — layers, ConfirmDialog, TaskSearchPicker, RecurrencePicker,
    // ReminderPicker, TemplatePicker, extension boundary, print view
    // =========================================================================
    // Push a layer on the popover stack so the task panel's Esc handler leaves it
    // alone; Esc closes only the top-most layer.
    function useLayer(open, onEsc) {
      const escRef = useRef(onEsc); escRef.current = onEsc;
      useEffect(() => {
        if (!open) return;
        const tok = {}; popStack.push(tok);
        const onKey = (e) => {
          if (e.key !== 'Escape' || popStack[popStack.length - 1] !== tok) return;
          e.preventDefault(); e.stopPropagation();
          if (escRef.current) escRef.current();
        };
        window.addEventListener('keydown', onKey, true);
        return () => { const i = popStack.indexOf(tok); if (i >= 0) popStack.splice(i, 1); window.removeEventListener('keydown', onKey, true); };
      }, [open]);
    }

    // ConfirmDialog({ open, title, body, children, icon, tone:'warn'|'danger', confirmLabel, cancelLabel,
    //   danger, busy, hideConfirm, confirmDisabled, actions:[{ key, label, icon, primary, disabled, onClick }], onConfirm, onCancel })
    function ConfirmDialog({ open = true, title, body, children, icon, tone, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, busy, hideConfirm, confirmDisabled, actions, onConfirm, onCancel }) {
      const boxRef = useRef(null);
      useLayer(open, () => { if (!busy && onCancel) onCancel(); });
      useEffect(() => {
        if (!open) return;
        const prev = document.activeElement;
        const t = setTimeout(() => {
          const box = boxRef.current;
          if (!box) return;
          const el = box.querySelector('[data-autofocus]') || box.querySelector('[data-primary]') || box.querySelector('.cu-dlg-ft button') || box;
          try { el.focus({ preventScroll: true }); } catch (_) { }
        }, 0);
        return () => { clearTimeout(t); if (prev && typeof prev.focus === 'function' && document.contains(prev)) { try { prev.focus({ preventScroll: true }); } catch (_) { } } };
      }, [open]);
      if (!open) return null;
      const onKey = (e) => {
        if (e.key === 'Tab' && boxRef.current) {
          const f = Array.from(boxRef.current.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])'));
          if (f.length) {
            const first = f[0], last = f[f.length - 1];
            if (e.shiftKey && (document.activeElement === first || document.activeElement === boxRef.current)) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
          }
        }
        e.stopPropagation();   // keep panel shortcuts (J/K) out of the dialog
      };
      const icCls = 'ti ' + tiIcon(icon) + ' cu-dlg-ic' + (tone ? ' ' + tone : danger ? ' danger' : '');
      return h`<div class="cu-dlg-bg cu-root" onMouseDown=${e => { if (e.target === e.currentTarget && !busy && onCancel) onCancel(); }} onKeyDown=${onKey}>
        <div class="cu-modal cu-dlg" ref=${boxRef} role="alertdialog" aria-modal="true" aria-label=${typeof title === 'string' ? title : 'Confirm'} tabIndex=${-1} style=${{ outline: 'none' }}>
          <div class="cu-dlg-hd">
            ${icon ? h`<i class=${icCls} aria-hidden="true"></i>` : null}
            <div style=${{ minWidth: 0, flex: 1 }}>
              <div class="cu-dlg-t">${title}</div>
              ${body ? h`<div class="cu-dlg-b" style=${{ marginTop: 4 }}>${body}</div>` : null}
            </div>
          </div>
          ${children || null}
          <div class="cu-dlg-ft">
            ${onCancel ? h`<button type="button" class="cu-btn cu-btn-ghost" disabled=${!!busy} onClick=${onCancel}>${cancelLabel}</button>` : null}
            ${arr(actions).map((a, i) => h`<button key=${a.key || i} type="button" class=${'cu-btn' + (a.primary ? ' cu-btn-pri' : '')} disabled=${!!(busy || a.disabled)} onClick=${a.onClick}>
              ${a.icon ? h`<i class=${'ti ' + tiIcon(a.icon)}></i>` : null}${a.label}</button>`)}
            ${!hideConfirm && onConfirm ? h`<button type="button" data-primary="1" class=${'cu-btn ' + (danger ? 'cu-btn-dz' : 'cu-btn-pri')} disabled=${!!(busy || confirmDisabled)} onClick=${onConfirm}>
              ${busy ? h`<i class="ti ti-loader-2 cu-spin"></i>` : null}${confirmLabel}</button>` : null}
          </div>
        </div>
      </div>`;
    }

    // ---- TaskSearchPicker ----------------------------------------------------
    function TaskSearchList({ onPick, exclude, placeholder = 'Search tasks by name or ID…', filter }) {
      const [q, setQ] = useState('');
      const [rows, setRows] = useState([]);
      const [loading, setLoading] = useState(true);
      const [act, setAct] = useState(0);
      const inRef = useRef(null);
      const boxRef = useRef(null);
      useEffect(() => { setTimeout(() => { try { if (inRef.current) inRef.current.focus(); } catch (_) { } }, 0); }, []);
      useEffect(() => {
        let alive = true;
        const s = q.trim();
        setLoading(true);
        const t = setTimeout(async () => {
          try {
            let out;
            if (s) { const r = await TaskAPI.search(s, 15); out = arr(r && r.tasks); }
            else { const r = await TaskAPI.query({ scope: 'my', order: 'updated', limit: 12 }); out = Array.isArray(r) ? r : arr(r && r.rows); }
            if (alive) { setRows(out); setAct(0); }
          } catch (_) { if (alive) setRows([]); }
          if (alive) setLoading(false);
        }, s ? 200 : 0);
        return () => { alive = false; clearTimeout(t); };
      }, [q]);
      const ex = arr(exclude);
      const list = arr(rows).filter(t => t && t.id && !ex.includes(t.id) && (!filter || filter(t)));
      const idx = Math.min(act, Math.max(0, list.length - 1));
      useEffect(() => { const el = boxRef.current && boxRef.current.querySelector('[data-ts="' + idx + '"]'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }, [idx]);
      const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setAct(Math.min(idx + 1, list.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setAct(Math.max(idx - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (list[idx]) onPick(list[idx]); }
      };
      return h`<div ref=${boxRef} onKeyDown=${onKey} style=${{ width: 340, maxWidth: 'calc(100vw - 16px)' }}>
        <div class="cu-pk-search"><input ref=${inRef} value=${q} placeholder=${placeholder} aria-label=${placeholder} onInput=${e => setQ(e.target.value)}/></div>
        <div class="cu-pk-list" role="listbox" aria-busy=${loading}>
          <div class="cu-pk-grp">${q.trim() ? 'Tasks' : 'Recently updated · assigned to you'}${loading ? h`<i class="ti ti-loader-2 cu-spin" style=${{ fontSize: 11, marginLeft: 6 }}></i>` : null}</div>
          ${!loading && !list.length ? h`<div class="cu-pk-empty">${q.trim() ? 'No matching tasks' : 'Type to search all tasks'}</div>` : null}
          ${list.map((t, i) => h`<button key=${t.id} type="button" role="option" aria-selected=${i === idx} data-ts=${i}
              class=${'cu-mi' + (i === idx ? ' act' : '')} style=${{ height: 'auto', minHeight: 36, padding: '4px 10px' }} onMouseEnter=${() => setAct(i)} onClick=${() => onPick(t)}>
              <${StatusIcon} category=${t.status_category || 'todo'} color=${t.status_color} size=${14}/>
              <span style=${{ flex: 1, minWidth: 0 }}>
                <span style=${{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${t.title}</span>
                <span style=${{ display: 'block', fontSize: 11, color: 'var(--cu-t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${[t.client_name || 'Agency', t.status_name].filter(Boolean).join(' · ')}</span>
              </span>
              ${t.custom_id ? h`<span class="cu-cid">${t.custom_id}</span>` : null}
            </button>`)}
        </div>
      </div>`;
    }
    // TaskSearchPicker({ onPick(task), exclude:[ids], placeholder, label, anchorContent, disabled, inline, filter(row)→bool })
    function TaskSearchPicker({ onPick, exclude, placeholder, label = 'Search tasks', anchorContent, disabled, inline, filter, placement = 'bottom-start', className }) {
      const pop = usePop();
      if (inline) return h`<${TaskSearchList} onPick=${onPick} exclude=${exclude} placeholder=${placeholder} filter=${filter}/>`;
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} class=${className || 'cu-addbtn'} disabled=${disabled} aria-haspopup="listbox" aria-expanded=${pop.open} aria-label=${label}
          onClick=${e => { e.stopPropagation(); pop.toggle(); }}>
          ${anchorContent || h`<${Fragment}><i class="ti ti-search"></i>${label}<//>`}
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} placement=${placement} ariaLabel=${label}>
          <${TaskSearchList} onPick=${t => { pop.close(); if (onPick) onPick(t); }} exclude=${exclude} placeholder=${placeholder} filter=${filter}/>
        <//>
      <//>`;
    }

    // ---- Recurrence (093 v2 shape; v1 servers honour { freq, interval } only) --
    const WEEKDAYS = [[1, 'Mo'], [2, 'Tu'], [3, 'We'], [4, 'Th'], [5, 'Fr'], [6, 'Sa'], [7, 'Su']];
    const WEEKDAY_NAME = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
    const isoDow = (d) => ((d.getDay() + 6) % 7) + 1;
    const FREQ_UNIT = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
    const FREQ_ONE = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
    function recurrenceLabel(r) {
      if (!r || !FREQ_UNIT[r.freq]) return '';
      const n = Math.max(1, parseInt(r.interval, 10) || 1);
      let s = n === 1 ? FREQ_ONE[r.freq] : 'Every ' + n + ' ' + FREQ_UNIT[r.freq] + 's';
      const wd = arr(r.byweekday).map(Number).filter(x => WEEKDAY_NAME[x]).sort((a, b) => a - b);
      if (r.freq === 'weekly' && wd.length) s += wd.join(',') === '1,2,3,4,5' ? ' on weekdays' : ' on ' + wd.map(x => WEEKDAY_NAME[x]).join(', ');
      if (r.freq === 'monthly' && r.bymonthday) s += ' on day ' + r.bymonthday;
      if (r.mode === 'on_schedule') s += ' · on schedule';
      if (r.until) s += ' · until ' + fmtDateUser(String(r.until).slice(0, 10) + 'T00:00:00');
      else if (r.count) s += ' · ' + r.count + '×';
      return s;
    }
    function cleanRecurrence(r, advanced) {
      if (!r || !FREQ_UNIT[r.freq]) return null;
      if (!advanced && r.freq === 'yearly') return null;
      const out = { freq: r.freq, interval: Math.max(1, Math.min(365, parseInt(r.interval, 10) || 1)) };
      if (!advanced) return out;
      if (r.freq === 'weekly') { const wd = Array.from(new Set(arr(r.byweekday).map(Number).filter(n => n >= 1 && n <= 7))).sort((a, b) => a - b); if (wd.length) out.byweekday = wd; }
      if (r.freq === 'monthly') { const md = parseInt(r.bymonthday, 10); if (md >= 1 && md <= 31) out.bymonthday = md; }
      out.mode = r.mode === 'on_schedule' ? 'on_schedule' : 'on_complete';
      if (out.mode === 'on_schedule') { const cb = parseInt(r.create_days_before, 10); if (cb > 0) out.create_days_before = Math.min(cb, 365); }
      if (r.until && /^\d{4}-\d{2}-\d{2}/.test(String(r.until))) out.until = String(r.until).slice(0, 10);
      else if (parseInt(r.count, 10) > 0) out.count = Math.min(parseInt(r.count, 10), 1000);
      if (r.skip_non_working) out.skip_non_working = true;
      return out;
    }
    function RecurrenceEditor({ value, advanced, dueAt, onSave, onCancel }) {
      const base = value && FREQ_UNIT[value.freq] ? value : { freq: 'weekly', interval: 1, mode: 'on_complete' };
      const [d, setD] = useState(() => ({ ...base, byweekday: arr(base.byweekday).map(Number), ends: base.until ? 'until' : base.count ? 'count' : 'never' }));
      const set = (patch) => setD(x => ({ ...x, ...patch }));
      const freqs = advanced ? ['daily', 'weekly', 'monthly', 'yearly'] : ['daily', 'weekly', 'monthly'];
      const n = Math.max(1, parseInt(d.interval, 10) || 1);
      const save = () => {
        const src = { ...d };
        if (d.ends !== 'until') delete src.until;
        if (d.ends !== 'count') delete src.count;
        if (d.ends === 'until' && !src.until) delete src.until;
        onSave(cleanRecurrence(src, advanced));
      };
      return h`<div class="cu-form" style=${{ width: 320, maxWidth: 'calc(100vw - 16px)' }}
        onKeyDown=${e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); save(); } }}>
        <div class="cu-form-row">
          <button type="button" class="cu-ibtn" aria-label="Back to presets" onClick=${onCancel}><i class="ti ti-arrow-left"></i></button>
          <span style=${{ fontWeight: 600, flex: 1 }}>Custom recurrence</span>
        </div>
        <div>
          <div class="cu-form-l">Repeat every</div>
          <div class="cu-form-row" style=${{ marginTop: 4 }}>
            <input class="cu-input" type="number" min="1" max="365" style=${{ width: 72 }} value=${d.interval} aria-label="Repeat interval" onInput=${e => set({ interval: e.target.value })}/>
            <select class="cu-sel" value=${d.freq} aria-label="Frequency" onChange=${e => set({ freq: e.target.value })}>
              ${freqs.map(f => h`<option key=${f} value=${f}>${FREQ_UNIT[f] + (n === 1 ? '' : 's')}</option>`)}
            </select>
          </div>
        </div>
        ${advanced && d.freq === 'weekly' ? h`<div>
          <div class="cu-form-l">On</div>
          <div class="cu-wd" style=${{ marginTop: 4 }} role="group" aria-label="Weekdays">
            ${WEEKDAYS.map(([k, lb]) => { const on = d.byweekday.includes(k); return h`<button key=${k} type="button" class=${on ? 'on' : ''} aria-pressed=${on} aria-label=${WEEKDAY_NAME[k]}
              onClick=${() => set({ byweekday: on ? d.byweekday.filter(x => x !== k) : [...d.byweekday, k] })}>${lb}</button>`; })}
          </div>
        </div>` : null}
        ${advanced && d.freq === 'monthly' ? h`<div class="cu-form-row">
          <span class="cu-form-l">On day</span>
          <input class="cu-input" type="number" min="1" max="31" style=${{ width: 72 }} value=${d.bymonthday || ''} placeholder=${dueAt ? String(new Date(dueAt).getDate()) : '—'} aria-label="Day of month" onInput=${e => set({ bymonthday: e.target.value })}/>
          <span style=${{ fontSize: 12, color: 'var(--cu-t3)' }}>Blank uses the due date</span>
        </div>` : null}
        ${advanced ? h`<${Fragment}>
          <div>
            <div class="cu-form-l">Create the next task</div>
            <div class="cu-seg" style=${{ marginTop: 4 }} role="radiogroup" aria-label="When to create the next task">
              <button type="button" role="radio" aria-checked=${d.mode !== 'on_schedule'} class=${d.mode !== 'on_schedule' ? 'on' : ''} onClick=${() => set({ mode: 'on_complete' })}>When completed</button>
              <button type="button" role="radio" aria-checked=${d.mode === 'on_schedule'} class=${d.mode === 'on_schedule' ? 'on' : ''} onClick=${() => set({ mode: 'on_schedule' })}>On schedule</button>
            </div>
            ${d.mode === 'on_schedule' ? h`<div class="cu-form-row" style=${{ marginTop: 6, fontSize: 12, color: 'var(--cu-t2)' }}>
              Create
              <input class="cu-input" type="number" min="0" max="365" style=${{ width: 64, height: 26 }} value=${d.create_days_before || 0} aria-label="Days before due" onInput=${e => set({ create_days_before: e.target.value })}/>
              days before the next due date
            </div>` : null}
          </div>
          <div>
            <div class="cu-form-l">Ends</div>
            <div class="cu-form-row" style=${{ marginTop: 4 }}>
              <select class="cu-sel" value=${d.ends} aria-label="Ends" onChange=${e => set({ ends: e.target.value })}>
                <option value="never">Never</option>
                <option value="until">On date</option>
                <option value="count">After</option>
              </select>
              ${d.ends === 'until' ? h`<input class="cu-input" type="date" style=${{ width: 160 }} value=${d.until || ''} aria-label="End date" onInput=${e => set({ until: e.target.value })}/>` : null}
              ${d.ends === 'count' ? h`<${Fragment}><input class="cu-input" type="number" min="1" style=${{ width: 72 }} value=${d.count || ''} aria-label="Number of occurrences" onInput=${e => set({ count: e.target.value })}/><span style=${{ fontSize: 12, color: 'var(--cu-t2)' }}>times</span><//>` : null}
            </div>
          </div>
          <label class="cu-form-row" style=${{ cursor: 'pointer', color: 'var(--cu-t2)' }}>
            <input type="checkbox" checked=${!!d.skip_non_working} onChange=${e => set({ skip_non_working: e.target.checked })}/>Skip non-working days and holidays
          </label>
        <//>` : null}
        <div class="cu-form-row" style=${{ justifyContent: 'flex-end', borderTop: '1px solid var(--cu-bd)', paddingTop: 10 }}>
          <button type="button" class="cu-btn cu-btn-ghost" onClick=${onCancel}>Cancel</button>
          <button type="button" class="cu-btn cu-btn-pri" onClick=${save}>Save</button>
        </div>
      </div>`;
    }
    // RecurrencePicker({ value, onChange(rec|null), dueAt, advanced (default: store.v2), disabled, anchorContent })
    function RecurrencePicker({ value, onChange, dueAt, disabled, advanced, anchorContent, label = 'Recurrence', className }) {
      const store = useTaskStore();
      const adv = advanced !== undefined ? !!advanced : store.v2;
      const pop = usePop();
      const [custom, setCustom] = useState(false);
      const has = !!(value && FREQ_UNIT[value.freq]);
      const ref = dueAt ? new Date(dueAt) : new Date();
      const dowName = ref.toLocaleDateString('en-IN', { weekday: 'long' });
      const withMode = (r) => (adv ? { mode: (value && value.mode) || 'on_complete', ...r } : r);
      const presets = [
        { key: 'daily', label: 'Daily', rec: { freq: 'daily', interval: 1 } },
        ...(adv ? [{ key: 'weekdays', label: 'Every weekday (Mon–Fri)', rec: { freq: 'weekly', interval: 1, byweekday: [1, 2, 3, 4, 5] } }] : []),
        { key: 'weekly', label: 'Weekly' + (adv ? ' on ' + dowName : ''), rec: adv ? { freq: 'weekly', interval: 1, byweekday: [isoDow(ref)] } : { freq: 'weekly', interval: 1 } },
        { key: 'biweekly', label: 'Every 2 weeks', rec: { freq: 'weekly', interval: 2 } },
        { key: 'monthly', label: 'Monthly' + (adv ? ' on day ' + ref.getDate() : ''), rec: adv ? { freq: 'monthly', interval: 1, bymonthday: ref.getDate() } : { freq: 'monthly', interval: 1 } },
        ...(adv ? [{ key: 'yearly', label: 'Yearly', rec: { freq: 'yearly', interval: 1 } }] : []),
      ];
      const cur = has ? JSON.stringify(cleanRecurrence(value, adv)) : null;
      const close = () => { pop.close(); setCustom(false); };
      const pick = (rec) => { close(); if (onChange) onChange(rec); };
      const items = presets.map(p => { const rec = cleanRecurrence(withMode(p.rec), adv); return { key: p.key, label: p.label, selected: !!cur && JSON.stringify(rec) === cur, left: h`<i class="ti ti-repeat"></i>`, rec }; })
        .concat([{ key: '__custom', label: 'Custom…', left: h`<i class="ti ti-adjustments-horizontal"></i>` }])
        .concat(has ? [{ key: '__clear', label: 'Remove recurrence', left: h`<i class="ti ti-repeat-off"></i>` }] : []);
      const text = has ? recurrenceLabel(value) : '';
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} class=${(className || 'cu-trig') + (has ? '' : ' muted')} disabled=${disabled} aria-label=${label + (text ? ': ' + text : '')} aria-haspopup="dialog" aria-expanded=${pop.open}
          onClick=${e => { e.stopPropagation(); setCustom(false); pop.toggle(); }}>
          ${anchorContent || h`<${Fragment}><i class="ti ti-repeat" style=${{ fontSize: 14 }}></i><span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${has ? text : 'Set recurrence'}</span><//>`}
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${close} ariaLabel=${label}>
          ${custom
            ? h`<${RecurrenceEditor} value=${value} advanced=${adv} dueAt=${dueAt} onCancel=${() => setCustom(false)} onSave=${rec => pick(rec)}/>`
            : h`<${PickerList} items=${items} searchable=${false} minWidth=${250}
                onPick=${it => { if (it.key === '__custom') setCustom(true); else if (it.key === '__clear') pick(null); else pick(it.rec); }}/>`}
        <//>
      <//>`;
    }

    // ---- Reminders (caller's own) ---------------------------------------------
    const REMINDER_PRESETS = [
      { key: '20m', label: 'In 20 minutes', icon: 'ti-clock', at: () => new Date(Date.now() + 20 * 60000) },
      { key: '1h', label: 'In 1 hour', icon: 'ti-clock', at: () => new Date(Date.now() + 3600000) },
      { key: '3h', label: 'In 3 hours', icon: 'ti-clock', at: () => new Date(Date.now() + 3 * 3600000) },
      { key: 'tom9', label: 'Tomorrow at 9 AM', icon: 'ti-sunrise', at: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
      { key: 'mon9', label: 'Next Monday at 9 AM', icon: 'ti-calendar-week', at: () => { const d = new Date(); d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); d.setHours(9, 0, 0, 0); return d; } },
      { key: 'due1h', label: '1 hour before due', icon: 'ti-alarm', due: 60 },
      { key: 'due1d', label: '1 day before due', icon: 'ti-alarm', due: 1440 },
    ];
    // ReminderPicker({ taskId, dueAt, onAdded(reminder), onPick({ remind_at, note }) — pick-only mode, no RPC —,
    //   anchorContent, label, showToast, className })
    function ReminderPicker({ taskId, dueAt, onAdded, onPick, anchorContent, label = 'Remind me', disabled, showToast, placement = 'bottom-start', className }) {
      const pop = usePop();
      const [custom, setCustom] = useState(false);
      const [note, setNote] = useState('');
      const [busy, setBusy] = useState(false);
      const toast = (m) => { if (showToast) showToast(m); };
      const close = () => { pop.close(); setCustom(false); setNote(''); };
      const commit = async (date) => {
        if (!date || isNaN(date)) return;
        if (date.getTime() <= Date.now() + 30000) { toast('That time has already passed'); return; }
        const iso = date.toISOString();
        const n = note.trim() || null;
        if (onPick) { close(); onPick({ remind_at: iso, note: n }); return; }
        setBusy(true);
        try {
          const r = await TaskAPI.reminderAdd(taskId || null, iso, n);
          close();
          toast('Reminder set for ' + fmtDue(iso, true).text);
          if (onAdded) onAdded(r && r.id ? { sent_at: null, ...r } : { id: 'tmp-' + uuid(), task_id: taskId || null, remind_at: iso, note: n, sent_at: null });
        } catch (e) { toast(isMissingRpc(e) ? 'Reminders need the latest database update' : 'Could not set reminder: ' + errMsg(e)); }
        setBusy(false);
      };
      const dueMs = dueAt ? new Date(dueAt).getTime() : null;
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} class=${className || 'cu-addbtn'} style=${className ? null : { padding: '4px 6px' }} disabled=${disabled || busy}
          aria-haspopup="dialog" aria-expanded=${pop.open} aria-label=${label} onClick=${e => { e.stopPropagation(); setCustom(false); pop.toggle(); }}>
          ${anchorContent || h`<${Fragment}><i class=${'ti ' + (busy ? 'ti-loader-2 cu-spin' : 'ti-bell-plus')}></i>${label}<//>`}
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${close} placement=${placement} ariaLabel=${label}>
          <div style=${{ width: custom ? 'auto' : 270, maxWidth: 'calc(100vw - 16px)' }}>
            <div class="cu-pk-search"><input value=${note} maxLength=${200} placeholder="Note (optional)" aria-label="Reminder note" onInput=${e => setNote(e.target.value)}/></div>
            ${custom
              ? h`<div>
                  <div style=${{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--cu-bd)' }}>
                    <button type="button" class="cu-ibtn" aria-label="Back to quick picks" onClick=${() => setCustom(false)}><i class="ti ti-arrow-left"></i></button>
                    <div style=${{ minWidth: 0 }}>
                      <div style=${{ fontSize: 12, fontWeight: 600 }}>Remind me on…</div>
                      <div class="cu-wa-hint">Tick “Time” to pick the hour (default 9:00 AM)</div>
                    </div>
                  </div>
                  <${DatePickerBody} value=${null} hasTime=${false} withTime=${true} endOfDay=${false} defaultTime="09:00"
                    onApply=${(iso, hasT) => { const d = new Date(iso); if (!hasT) d.setHours(9, 0, 0, 0); commit(d); }} onClear=${() => setCustom(false)}/>
                </div>`
              : h`<div class="cu-menu" role="menu" aria-label=${label}>
                  ${REMINDER_PRESETS.filter(p => !p.due || dueMs).map(p => {
                    const at = p.due ? new Date(dueMs - p.due * 60000) : p.at();
                    const past = at.getTime() <= Date.now() + 30000;
                    return h`<button key=${p.key} type="button" role="menuitem" class="cu-mi" disabled=${past || busy}
                      onClick=${() => commit(p.due ? new Date(dueMs - p.due * 60000) : p.at())}>
                      <i class=${'ti ' + p.icon}></i>
                      <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${p.label}</span>
                      <span class="cu-mi-r">${past ? 'Passed' : fmtDue(at.toISOString(), true).text}</span>
                    </button>`;
                  })}
                  <div class="cu-mdiv" role="separator"></div>
                  <button type="button" role="menuitem" class="cu-mi" disabled=${busy} onClick=${() => setCustom(true)}><i class="ti ti-calendar-time"></i>Custom…</button>
                </div>`}
          </div>
        <//>
      <//>`;
    }

    // ---- Templates -------------------------------------------------------------
    function TemplateList({ kind, onPick, emptyText }) {
      const [items, setItems] = useState(null);
      const [err, setErr] = useState(null);
      useEffect(() => {
        let alive = true;
        TaskAPI.templateList()
          .then(r => { if (alive) setItems(arr(r)); })
          .catch(e => { if (alive) { setItems([]); setErr(isMissingRpc(e) ? null : errMsg(e)); } });
        return () => { alive = false; };
      }, []);
      if (items === null) return h`<div class="cu-pk-empty" style=${{ minWidth: 260 }}><i class="ti ti-loader-2 cu-spin"></i> Loading templates…</div>`;
      const list = items.filter(t => t && t.id && (!kind || (t.kind || 'task') === kind))
        .sort((a, b) => (a.kind === 'list_kit') - (b.kind === 'list_kit') || (Number(b.use_count) || 0) - (Number(a.use_count) || 0) || String(a.name).localeCompare(String(b.name)));
      const pitems = list.map(t => ({
        key: t.id, label: t.name, tpl: t,
        group: t.kind === 'list_kit' ? 'List kits' : 'Task templates',
        keywords: (t.description || '') + ' ' + (t.created_by_name || ''),
        right: Number(t.item_count) ? t.item_count + (Number(t.item_count) === 1 ? ' item' : ' items') : null,
        left: h`<i class=${'ti ' + (t.kind === 'list_kit' ? 'ti-stack-2' : 'ti-template')}></i>`,
      }));
      return h`<${PickerList} items=${pitems} placeholder="Search templates…" minWidth=${280}
        emptyText=${err || emptyText || 'No templates yet — open a task and choose “Save as template”'}
        onPick=${it => onPick && onPick(it.tpl)}/>`;
    }
    // TemplatePicker({ onPick(templateSummary), kind:'task'|'list_kit'|undefined, anchorContent, label, disabled, inline, className })
    function TemplatePicker({ onPick, kind, anchorContent, label = 'Templates', disabled, inline, placement = 'bottom-start', className }) {
      const pop = usePop();
      if (inline) return h`<${TemplateList} kind=${kind} onPick=${onPick}/>`;
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} class=${className || 'cu-trig'} disabled=${disabled} aria-haspopup="listbox" aria-expanded=${pop.open} aria-label=${label}
          onClick=${e => { e.stopPropagation(); pop.toggle(); }}>
          ${anchorContent || h`<${Fragment}><i class="ti ti-template" style=${{ fontSize: 14 }}></i>${label}<//>`}
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} placement=${placement} ariaLabel=${label}>
          <${TemplateList} kind=${kind} onPick=${t => { pop.close(); if (onPick) onPick(t); }}/>
        <//>
      <//>`;
    }

    // ---- Extension boundary — a broken registry item must never take the panel down
    class ExtBoundary extends React.Component {
      constructor(props) { super(props); this.state = { err: null }; }
      static getDerivedStateFromError(err) { return { err }; }
      componentDidCatch(err) { console.warn('[tasks] extension crashed:', this.props.name, err); }
      render() {
        if (this.state.err) return this.props.fallback !== undefined ? this.props.fallback : h`<div class="cu-ext-err"><i class="ti ti-plug-connected-x"></i> This section couldn’t load.</div>`;
        return this.props.children || null;
      }
    }

    // ---- Print view — renders into a hidden iframe and opens the print dialog ----
    const LINK_LABEL = { waiting_on: 'Waiting on', blocks: 'Blocking', relates: 'Linked' };
    function printTask(task, parts, store) {
      const p = parts || {};
      // escape for the print document (no quote literals here: keeps the htm checker's tokenizer happy)
      const esc = (s) => String(s == null ? '' : s)
        .split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;')
        .split(String.fromCharCode(34)).join('&quot;').split(String.fromCharCode(39)).join('&#39;');
      const when = (iso, hasTime) => (iso ? fmtDateUser(iso, { year: true }) + (hasTime ? ', ' + fmtTimeUser(iso) : '') : '');
      const st = store.statusMeta(task.list_id, task.status);
      const rows = [];
      const kv = (k, v) => { if (v !== null && v !== undefined && v !== '') rows.push('<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>'); };
      kv('Status', task.status_name || st.name);
      kv('Assignees', arr(task.assignees).map(a => a.name).join(', '));
      kv('Start date', when(task.start_at, false));
      kv('Due date', when(task.due_at, task.due_has_time === undefined || task.due_has_time === null ? !(new Date(task.due_at).getHours() === 23 && new Date(task.due_at).getMinutes() === 59) : !!task.due_has_time));
      kv('Priority', PRIORITIES[task.priority] ? PRIORITIES[task.priority].label : '');
      kv('Time estimate', task.estimate_minutes ? fmtMinutes(task.estimate_minutes) : '');
      kv('Time tracked', task.time_spent_minutes ? fmtMinutes(task.time_spent_minutes) : '');
      kv('Tags', arr(task.tag_ids).map(id => (store.tagById[id] || {}).name).filter(Boolean).join(', '));
      kv('Recurrence', task.recurrence && task.recurrence.freq ? recurrenceLabel(task.recurrence) : '');
      arr(p.fields).forEach(f => {
        const v = (task.custom_fields || {})[f.id];
        if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return;
        let out;
        if (f.type === 'dropdown' || f.type === 'labels') out = (Array.isArray(v) ? v : [v]).map(id => (arr(f.options).find(o => o.id === id) || {}).label || '').filter(Boolean).join(', ');
        else if (f.type === 'checkbox') out = v ? 'Yes' : 'No';
        else if (f.type === 'date') out = fmtDateUser(v, { year: true });
        else if (f.type === 'money') out = '₹' + Number(v).toLocaleString('en-IN');
        else if (f.type === 'rating') out = '★'.repeat(Number(v) || 0);
        else out = String(v);
        kv(f.name, out);
      });
      const sec = (title, inner) => (inner ? '<h2>' + esc(title) + '</h2>' + inner : '');
      const subs = arr(p.subtasks).map(s => '<li class="' + (isDone(s) ? 'done' : '') + '">' + esc(s.title) + ' <span class="m">' + esc(s.status_name || '') + '</span></li>').join('');
      const cls = arr(p.checklists).map(cl => '<h3>' + esc(cl.name || 'Checklist') + '</h3><ul class="cl">'
        + arr(cl.items).slice().sort((a, b) => (a.position || 0) - (b.position || 0)).map(it => '<li>' + (it.done ? '☑' : '☐') + ' ' + esc(it.text) + '</li>').join('') + '</ul>').join('');
      const links = arr(p.links).map(l => '<li>' + esc(LINK_LABEL[l.kind] || 'Linked') + ': ' + esc((l.task && l.task.title) || '') + (l.task && l.task.status_name ? ' <span class="m">' + esc(l.task.status_name) + '</span>' : '') + '</li>').join('');
      const atts = arr(p.attachments).map(a => '<li>' + esc(a.name) + '</li>').join('');
      const all = arr(p.comments).filter(c => c && !c._pending);
      const byDate = (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0);
      const cmt = (c) => '<div class="c' + (c.parent_id ? ' r' : '') + '"><div class="m"><b>' + esc(c.author_name || 'Someone') + '</b> · ' + esc(when(c.created_at, true)) + '</div><div class="b">' + esc(c.body || '') + '</div></div>';
      const cmts = all.filter(c => !c.parent_id).sort(byDate).map(c => cmt(c) + all.filter(r => r.parent_id === c.id).sort(byDate).map(cmt).join('')).join('');
      const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc((task.custom_id ? task.custom_id + ' · ' : '') + (task.title || 'Task')) + '</title><style>'
        + 'body{font:13px/1.5 Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#1f1f23;margin:24px 30px}'
        + 'h1{font-size:22px;margin:4px 0 14px;line-height:1.3}h2{font-size:14px;margin:22px 0 8px;padding-bottom:4px;border-bottom:1px solid #e8e8eb}h3{font-size:13px;margin:12px 0 4px}'
        + '.crumb{color:#5c5c66;font-size:12px}table{border-collapse:collapse}th{text-align:left;color:#5c5c66;font-weight:500;padding:3px 18px 3px 0;vertical-align:top;white-space:nowrap}td{padding:3px 0}'
        + '.desc{white-space:pre-wrap}ul{margin:0;padding-left:18px}ul.cl{list-style:none;padding-left:0}li.done{color:#8e8e99;text-decoration:line-through}.m{color:#8e8e99;font-size:11px}'
        + '.c{margin:0 0 10px;page-break-inside:avoid}.c.r{margin-left:20px}.c .b{white-space:pre-wrap}.foot{margin-top:28px;color:#8e8e99;font-size:11px}@page{margin:14mm}'
        + '</style></head><body>'
        + '<div class="crumb">' + esc([p.space, task.list_name].filter(Boolean).join(' / ')) + (task.custom_id ? ' · ' + esc(task.custom_id) : '') + '</div>'
        + '<h1>' + esc(task.title || 'Untitled task') + '</h1>'
        + '<table>' + rows.join('') + '</table>'
        + sec('Description', task.description ? '<div class="desc">' + esc(task.description) + '</div>' : '')
        + sec('Subtasks', subs ? '<ul>' + subs + '</ul>' : '')
        + sec('Checklists', cls)
        + sec('Relationships', links ? '<ul>' + links + '</ul>' : '')
        + sec('Attachments', atts ? '<ul>' + atts + '</ul>' : '')
        + sec('Comments', cmts)
        + '<div class="foot">Printed ' + esc(when(new Date().toISOString(), true)) + ' · ' + esc(taskLink(task.id)) + '</div>'
        + '</body></html>';
      const ifr = document.createElement('iframe');
      ifr.setAttribute('aria-hidden', 'true');
      ifr.setAttribute('tabindex', '-1');
      Object.assign(ifr.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
      document.body.appendChild(ifr);
      let removed = false;
      const cleanup = () => { if (removed) return; removed = true; setTimeout(() => { try { ifr.remove(); } catch (_) { } }, 300); };
      const w = ifr.contentWindow;
      const doc = w.document;
      doc.open(); doc.write(html); doc.close();
      try { w.addEventListener('afterprint', cleanup); } catch (_) { }
      setTimeout(() => { try { w.focus(); w.print(); } catch (e) { console.warn('[tasks] print failed', e); cleanup(); } }, 250);
      setTimeout(cleanup, 10 * 60 * 1000);   // safety net for browsers that never fire afterprint
    }

    // ---- Relationships ---------------------------------------------------------
    const LINK_KINDS = [
      { key: 'waiting_on', label: 'Waiting on', add: 'Waiting on…', icon: 'ti-hourglass-high', deps: true },
      { key: 'blocks', label: 'Blocking', add: 'Blocking…', icon: 'ti-hand-stop', deps: true },
      { key: 'relates', label: 'Linked tasks', add: 'Link a task…', icon: 'ti-link', deps: false },
    ];
    const LINK_ERRORS = { self_link: 'A task can’t be linked to itself', cycle: 'That would create a circular dependency', duplicate: 'Those tasks are already linked', already_linked: 'Those tasks are already linked', not_found: 'Task not found' };
    function RelationshipsSection({ task, links, setLinks, canDeps, onChanged, showToast }) {
      const addMenu = usePop();
      const [busy, setBusy] = useState(false);
      const list = arr(links);
      const linkedIds = list.map(l => l.task && l.task.id).filter(Boolean);
      const toastErr = (label, e) => {
        const m = String((e && e.message) || '');
        const k = Object.keys(LINK_ERRORS).find(x => m.includes(x));
        if (showToast) showToast(k ? LINK_ERRORS[k] : label + ': ' + errMsg(e));
      };
      const add = async (kind, other) => {
        if (!other || !other.id) return;
        const tmp = { id: 'tmp-' + uuid(), kind, _pending: true, task: { id: other.id, custom_id: other.custom_id, title: other.title, status_name: other.status_name, status_color: other.status_color, status_category: other.status_category, due_at: other.due_at, client_name: other.client_name } };
        setLinks(cur => [...arr(cur), tmp]);
        setBusy(true);
        try {
          const r = await TaskAPI.linkAdd(task.id, other.id, kind);
          if (Array.isArray(r)) setLinks(r); else setLinks(cur => arr(cur).map(x => (x.id === tmp.id ? { ...x, _pending: false } : x)));
          if (onChanged) onChanged();
        } catch (e) { setLinks(cur => arr(cur).filter(x => x.id !== tmp.id)); toastErr('Could not add relationship', e); }
        setBusy(false);
      };
      const remove = async (l) => {
        setLinks(cur => arr(cur).filter(x => x.id !== l.id));
        try { await TaskAPI.linkDelete(l.id, task.id, l.task && l.task.id); if (onChanged) onChanged(); }
        catch (e) { setLinks(cur => [...arr(cur), l]); toastErr('Could not remove relationship', e); }
      };
      const groups = LINK_KINDS.map(k => ({ ...k, rows: list.filter(l => (l.kind || 'relates') === k.key) })).filter(g => g.rows.length);
      const menuItems = LINK_KINDS.filter(k => canDeps || !k.deps).map(k => ({
        key: k.key, label: k.add, icon: k.icon,
        submenu: (done) => h`<${TaskSearchPicker} inline=${true} exclude=${[task.id, ...linkedIds]} placeholder="Search tasks…" onPick=${t => { done(); add(k.key, t); }}/>`,
      }));
      return h`<div class="cu-sec" id=${'cu-rel-' + task.id}>
        <div class="cu-sec-hd">
          <span class="cu-sec-t">Relationships</span>
          ${list.length ? h`<span class="cu-sec-sub">${list.length}</span>` : null}
        </div>
        ${groups.length ? h`<div class="cu-rows" style=${{ marginBottom: 8 }}>
          ${groups.map(g => {
            const openCount = g.key === 'waiting_on' ? g.rows.filter(l => l.task && l.task.status_category !== 'done').length : 0;
            return h`<${Fragment} key=${g.key}>
              <div class=${'cu-rel-grp' + (openCount ? ' warn' : '')}><i class=${'ti ' + g.icon} aria-hidden="true"></i>${g.label}${openCount ? ' · ' + openCount + ' open' : ''}</div>
              ${g.rows.map(l => {
                const t = l.task || {};
                const closed = t.status_category === 'done';
                return h`<div key=${l.id} class=${'cu-srow' + (closed ? ' done' : '')} style=${l._pending ? { opacity: .6 } : null}>
                  <${StatusIcon} category=${t.status_category || 'todo'} color=${t.status_color}/>
                  ${t.custom_id ? h`<span class="cu-cid cu-hide-xs">${t.custom_id}</span>` : null}
                  <button type="button" class="cu-srow-t" disabled=${!!l._pending} onClick=${() => openTask(t.id)} title=${t.title || ''}>${t.title || 'Untitled task'}</button>
                  ${t.client_name ? h`<span class="cu-hide-xs" style=${{ fontSize: 12, color: 'var(--cu-t3)', whiteSpace: 'nowrap', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>${t.client_name}</span>` : null}
                  <${DueChip} iso=${t.due_at || null} showIcon=${false} row=${closed ? { status_category: 'done', due_at: t.due_at } : null}/>
                  <button type="button" class="cu-ibtn cu-hov" style=${{ width: 22, height: 22 }} disabled=${!!l._pending} aria-label=${'Remove relationship with ' + (t.title || 'task')} onClick=${() => remove(l)}><i class="ti ti-x" style=${{ fontSize: 13 }}></i></button>
                </div>`;
              })}
            <//>`;
          })}
        </div>` : null}
        <button type="button" ref=${addMenu.ref} class="cu-addbtn" disabled=${busy} aria-haspopup="menu" aria-expanded=${addMenu.open} onClick=${addMenu.toggle}>
          <i class=${'ti ' + (busy ? 'ti-loader-2 cu-spin' : 'ti-plus')}></i>Add relationship
        </button>
        <${Popover} anchor=${addMenu.anchor} open=${addMenu.open} onClose=${addMenu.close} ariaLabel="Add relationship">
          <${Menu} items=${menuItems} onClose=${addMenu.close}/>
        <//>
      </div>`;
    }

    // ---- Incomplete-warning helper (task_close_check → human list) --------------
    function closeIssues(chk) {
      if (!chk || typeof chk !== 'object') return [];
      const out = [];
      const n = (v) => Number(v) || 0;
      const pl = (c, one, many) => c + ' ' + (c === 1 ? one : many);
      if (n(chk.open_subtasks)) out.push({ icon: 'ti-subtask', text: pl(n(chk.open_subtasks), 'open subtask', 'open subtasks') });
      if (n(chk.open_checklist_items)) out.push({ icon: 'ti-checkbox', text: pl(n(chk.open_checklist_items), 'unchecked checklist item', 'unchecked checklist items') });
      if (n(chk.open_assigned_comments)) out.push({ icon: 'ti-message-circle', text: pl(n(chk.open_assigned_comments), 'unresolved assigned comment', 'unresolved assigned comments') });
      const w = arr(chk.waiting_on_open);
      if (w.length) out.push({ icon: 'ti-hourglass-high', text: 'Waiting on ' + w.map(x => (x && x.title) || 'a task').join(', ') });
      return out;
    }
    const fmtShift = (ms) => {
      const days = Math.round(Math.abs(ms) / 86400000);
      const span = days >= 1 ? days + (days === 1 ? ' day' : ' days') : fmtSpanMs(Math.abs(ms));
      return span + (ms > 0 ? ' later' : ' earlier');
    };

    // ---- Description history drawer ---------------------------------------------
    function DescriptionHistoryDrawer({ task, onClose, onRestored, showToast }) {
      const [items, setItems] = useState(null);
      const [err, setErr] = useState(null);
      const [sel, setSel] = useState(null);
      const [busy, setBusy] = useState(false);
      const boxRef = useRef(null);
      useLayer(true, onClose);
      useEffect(() => {
        let alive = true;
        const prev = document.activeElement;
        setTimeout(() => { try { if (boxRef.current) boxRef.current.focus({ preventScroll: true }); } catch (_) { } }, 0);
        TaskAPI.descriptionHistory(task.id)
          .then(r => { if (alive) setItems(arr(r)); })
          .catch(e => { if (alive) { setItems([]); setErr(isMissingRpc(e) ? null : errMsg(e)); } });
        return () => { alive = false; if (prev && typeof prev.focus === 'function' && document.contains(prev)) { try { prev.focus({ preventScroll: true }); } catch (_) { } } };
      }, [task.id]);
      const restore = async (v) => {
        if (busy) return;
        setBusy(true);
        try {
          await TaskAPI.descriptionRestore(v.id, task.id);
          if (showToast) showToast('Description restored');
          if (onRestored) onRestored();
          if (onClose) onClose();
        } catch (e) { if (showToast) showToast('Could not restore: ' + errMsg(e)); setBusy(false); }
      };
      return h`<div class="cu-drawer-bg" onMouseDown=${e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
        <aside class="cu-drawer" ref=${boxRef} tabIndex=${-1} role="dialog" aria-modal="true" aria-label="Description history" onKeyDown=${e => e.stopPropagation()}>
          <div class="cu-drawer-hd">
            <i class="ti ti-history" style=${{ color: 'var(--cu-t3)', fontSize: 17 }} aria-hidden="true"></i>
            <span style=${{ fontWeight: 600, fontSize: 14, flex: 1 }}>Description history</span>
            <button type="button" class="cu-ibtn" aria-label="Close history" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="cu-drawer-b">
            <div class="cu-ver on" style=${{ cursor: 'default' }}>
              <div class="cu-ver-meta"><b>Current version</b></div>
              <div class="cu-ver-body clip">${task.description || 'No description'}</div>
            </div>
            ${items === null ? [0, 1, 2].map(i => h`<div key=${i} style=${{ marginBottom: 8 }}><${Skel} h=${58}/></div>`) : null}
            ${items && !items.length ? h`<${EmptyState} icon=${err ? 'ti-cloud-off' : 'ti-history'} title=${err ? 'Couldn’t load history' : 'No earlier versions'}
              sub=${err || 'Each time the description changes, the previous text is kept here so you can restore it.'}/>` : null}
            ${arr(items).map(v => {
              const on = sel === v.id;
              return h`<div key=${v.id}>
                <button type="button" class=${'cu-ver' + (on ? ' on' : '')} aria-expanded=${on} onClick=${() => setSel(on ? null : v.id)}>
                  <div class="cu-ver-meta">
                    <b>${v.edited_by_name || 'Someone'}</b>
                    <span title=${v.created_at ? new Date(v.created_at).toLocaleString('en-IN') : ''}>${fmtDateTimeUser(v.created_at)}</span>
                    <span>${'· ' + fmtRelative(v.created_at)}</span>
                  </div>
                  <div class=${'cu-ver-body' + (on ? '' : ' clip')}>${v.body || 'Empty description'}</div>
                </button>
                ${on ? h`<div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 6, margin: '-2px 0 12px', flexWrap: 'wrap' }}>
                  <button type="button" class="cu-btn" onClick=${async () => { const ok = await copyText(v.body || ''); if (showToast) showToast(ok ? 'Copied' : 'Copy failed'); }}><i class="ti ti-copy"></i>Copy</button>
                  <button type="button" class="cu-btn cu-btn-pri" disabled=${busy} onClick=${() => restore(v)}>
                    ${busy ? h`<i class="ti ti-loader-2 cu-spin"></i>` : h`<i class="ti ti-restore"></i>`}Restore this version</button>
                </div>` : null}
              </div>`;
            })}
          </div>
        </aside>
      </div>`;
    }

    // ---- Status history mini-timeline (Activity tab) ------------------------------
    function StatusTimeline({ history, task }) {
      const store = useTaskStore();
      const [open, setOpen] = useState(false);
      const [now, setNow] = useState(Date.now());
      useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(iv); }, []);
      const segs = arr(history).filter(x => x && x.entered_at)
        .slice().sort((a, b) => new Date(a.entered_at) - new Date(b.entered_at))
        .map(x => {
          const m = store.statusMeta(task.list_id, x.status);
          const end = x.left_at ? new Date(x.left_at).getTime() : now;
          return { ...x, name: x.status_name || m.name, color: m.color || '#87909e', ms: Math.max(0, end - new Date(x.entered_at).getTime()) };
        });
      if (!segs.length) return null;
      const total = segs.reduce((s, x) => s + x.ms, 0) || 1;
      const agg = [];
      segs.forEach(s => {
        let a = agg.find(x => x.status === s.status);
        if (!a) { a = { status: s.status, name: s.name, color: s.color, ms: 0, visits: 0, current: false }; agg.push(a); }
        a.ms += s.ms; a.visits += 1; if (!s.left_at) a.current = true;
      });
      const live = segs.find(s => !s.left_at);
      return h`<div class="cu-sth">
        <button type="button" class="cu-sth-hd" aria-expanded=${open} onClick=${() => setOpen(o => !o)}>
          <i class="ti ti-chart-bar" aria-hidden="true"></i><span>Time in status</span>
          ${live ? h`<span style=${{ fontWeight: 500, color: 'var(--cu-t3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${'· ' + live.name + ' for ' + fmtSpanMs(live.ms)}</span>` : null}
          <i class=${'ti ' + (open ? 'ti-chevron-up' : 'ti-chevron-down')} style=${{ marginLeft: 'auto' }} aria-hidden="true"></i>
        </button>
        <div class="cu-sth-bar" role="img" aria-label=${agg.map(a => a.name + ' ' + fmtSpanMs(a.ms)).join(', ')}>
          ${segs.map((s, i) => h`<span key=${i} style=${{ width: (s.ms / total * 100) + '%', background: s.color }} title=${s.name + ' · ' + fmtSpanMs(s.ms)}></span>`)}
        </div>
        ${open ? h`<div class="cu-sth-list">
          ${agg.map(a => h`<div key=${a.status} class="cu-sth-row">
            <span class="cu-dot" style=${{ background: a.color }}></span>
            <span style=${{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${a.name + (a.visits > 1 ? ' (' + a.visits + '×)' : '') + (a.current ? ' · now' : '')}</span>
            <span class="v">${fmtSpanMs(a.ms)}</span>
          </div>`)}
        </div>` : null}
      </div>`;
    }

    // =========================================================================
    // TaskPanel — ClickUp task view
    // =========================================================================
    const COLLAPSE_KEY = 'ams_cu_collapse_empty';
    const KEEP_DURATION_KEY = 'ams_cu_keep_duration';
    const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { } };

    function useModalChrome(onClose, boxRef) {
      const closeRef = useRef(onClose); closeRef.current = onClose;
      useEffect(() => {
        const prevFocus = document.activeElement;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        setTimeout(() => { if (boxRef.current && !boxRef.current.contains(document.activeElement)) { try { boxRef.current.focus({ preventScroll: true }); } catch (_) { } } }, 0);
        const onKey = (e) => {
          if (e.key !== 'Escape' || e.defaultPrevented) return;
          if (popoverOpen()) return;
          const ae = document.activeElement;
          if (isEditableTarget(ae) && boxRef.current && boxRef.current.contains(ae)) { ae.blur(); return; }
          closeRef.current && closeRef.current();
        };
        window.addEventListener('keydown', onKey);
        return () => {
          window.removeEventListener('keydown', onKey);
          document.body.style.overflow = prevOverflow;
          if (prevFocus && typeof prevFocus.focus === 'function' && document.contains(prevFocus)) { try { prevFocus.focus({ preventScroll: true }); } catch (_) { } }
        };
      }, []);
    }

    function PanelSkeleton({ onClose }) {
      return h`<${Fragment}>
        <div class="cu-tp-hd"><div style=${{ flex: 1 }}><div style=${{ width: 220 }}><${Skel} h=${14}/></div></div>
          <button type="button" class="cu-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button></div>
        <div class="cu-tp-body">
          <div class="cu-tp-left" aria-busy="true">
            <div style=${{ width: 90, marginBottom: 14 }}><${Skel} h=${22}/></div>
            <div style=${{ width: '70%', marginBottom: 22 }}><${Skel} h=${30}/></div>
            ${[0, 1, 2, 3, 4, 5].map(i => h`<div key=${i} style=${{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, marginBottom: 10 }}><${Skel} h=${18}/><div style=${{ width: '45%' }}><${Skel} h=${18}/></div></div>`)}
            <div style=${{ marginTop: 26 }}><${Skel} h=${90}/></div>
          </div>
          <div class="cu-tp-right"><div style=${{ padding: 16 }}>${[0, 1, 2].map(i => h`<div key=${i} style=${{ marginBottom: 12 }}><${Skel} h=${52}/></div>`)}</div></div>
        </div>
      <//>`;
    }

    function TaskPanel({ taskId, onClose, showToast }) {
      const store = useTaskStore();
      const toast = useCallback((m) => { if (showToast) showToast(m); else console.warn('[tasks]', m); }, [showToast]);
      const boxRef = useRef(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(null);
      const [task, setTask] = useState(null);
      const [subtasks, setSubtasks] = useState([]);
      const [checklists, setChecklists] = useState([]);
      const [attachments, setAttachments] = useState([]);
      const [comments, setComments] = useState([]);
      const [activity, setActivity] = useState([]);
      const [fields, setFields] = useState(null);
      const [watching, setWatching] = useState(false);
      const [watchers, setWatchers] = useState([]);
      const [collapse, setCollapse] = useState(lsGet(COLLAPSE_KEY) === '1');
      const [favOn, setFavOn] = useState(null);
      const taskRef = useRef(null); taskRef.current = task;
      const moreMenu = usePop();
      const moveMenu = usePop();
      const nudgeMenu = usePop();
      const [waCount, setWaCount] = useState(null);
      // v2 (093) — each stays null until task_get returns the key (fail-open)
      const [detail, setDetail] = useState(null);
      const [links, setLinks] = useState(null);
      const [statusHistory, setStatusHistory] = useState(null);
      const [reminders, setReminders] = useState(null);
      const [inLineup, setInLineup] = useState(null);
      const [dialog, setDialog] = useState(null);          // { kind: 'close'|'shift'|'tplsave', … }
      const [dialogBusy, setDialogBusy] = useState(false);
      const [historyOpen, setHistoryOpen] = useState(false);
      const [keepDuration, setKeepDuration] = useState(lsGet(KEEP_DURATION_KEY) !== '0');
      const [moveMode, setMoveMode] = useState('list');     // 'list' | 'client'
      const tplMenu = usePop();
      useModalChrome(onClose, boxRef);

      const apply = (d) => {
        const dd = d || {};
        setTask(dd.task || null);
        setSubtasks(arr(dd.subtasks)); setChecklists(arr(dd.checklists)); setAttachments(arr(dd.attachments));
        setComments(arr(dd.comments)); setActivity(arr(dd.activity));
        setFields(Array.isArray(dd.fields) ? dd.fields : null);
        setWatching(!!dd.is_watching); setWatchers(arr(dd.watchers));
        setDetail(dd);
        setLinks(Array.isArray(dd.links) ? dd.links : null);
        setStatusHistory(Array.isArray(dd.status_history) ? dd.status_history : null);
        setReminders(Array.isArray(dd.reminders) ? dd.reminders : null);
        setInLineup(typeof dd.in_lineup === 'boolean' ? dd.in_lineup : null);
      };
      const load = useCallback(async (silent) => {
        if (!taskId) return;
        if (!silent) { setLoading(true); setError(null); }
        try {
          const d = await TaskAPI.get(taskId);
          if (!d || !d.task) throw new Error('Task not found');
          apply(d); setError(null);
          taskBus.emit('inbox:changed');
        } catch (e) { if (!silent) setError(e); else toast('Refresh failed: ' + errMsg(e)); }
        if (!silent) setLoading(false);
      }, [taskId]);

      useEffect(() => { setFavOn(null); load(false); }, [load]);
      useEffect(() => {
        const offC = taskBus.on('task:changed', (p) => { if (p && p.id === taskId && p.row && p.row.id) setTask(t => t ? { ...t, ...p.row, description: p.row.description !== undefined ? p.row.description : t.description } : t); });
        const offD = taskBus.on('task:deleted', (p) => { if (p && p.id === taskId) onClose && onClose(); });
        return () => { offC(); offD(); };
      }, [taskId, onClose]);

      // ---- mutations -------------------------------------------------------
      const patchTask = async (patch, optimistic, label) => {
        const prev = taskRef.current;
        if (!prev) return null;
        setTask(t => ({ ...t, ...(optimistic || patch) }));
        try {
          const row = await TaskAPI.update(prev.id, patch);
          if (row && row.id) setTask(t => ({ ...t, ...row, description: row.description !== undefined ? row.description : t.description }));
          return row;
        } catch (e) {
          setTask(prev);
          toast((label || 'Could not update task') + ': ' + errMsg(e));
          throw e;
        }
      };
      const reloadSilent = useCallback(() => load(true), [load]);
      const quiet = (p) => { p.catch(() => { }); };
      const feature = store.feature;
      const v2 = !!(store.v2 || Array.isArray(links));
      const role = (store.me && store.me.role_level) || '';
      const privileged = role === 'admin' || role === 'manager';
      const applyStatus = (key) => {
        const cur = taskRef.current;
        if (!cur) return;
        const m = store.statusMeta(cur.list_id, key);
        quiet(patchTask({ status: key }, { status: key, status_name: m.name, status_color: m.color, status_category: m.category, completed_at: m.category === 'done' ? new Date().toISOString() : null }, 'Could not change status'));
      };
      // Incomplete warning (093 task_close_check) before moving into a Closed status.
      const setStatus = async (key) => {
        const cur = taskRef.current;
        if (!cur) return;
        const m = store.statusMeta(cur.list_id, key);
        if (m.category === 'done' && !isDone(cur) && v2 && feature('incomplete_warning')) {
          let chk = null;
          try { chk = await TaskAPI.closeCheck(cur.id); }
          catch (e) { if (!isMissingRpc(e)) console.warn('[tasks] task_close_check', e); }
          const issues = closeIssues(chk);
          if (issues.length) { setDialog({ kind: 'close', key, statusName: m.name, issues }); return; }
        }
        applyStatus(key);
      };
      const toggleComplete = () => {
        const opts = store.statusesFor(task.list_id);
        const target = isDone(task) ? (opts.find(s => s.category === 'todo') || opts[0]) : (opts.find(s => s.category === 'done') || opts[opts.length - 1]);
        if (target) setStatus(target.key);
      };
      const setAssignees = async (ids) => {
        const prev = taskRef.current;
        const next = ids.map(id => store.memberById[id] || { id, name: '…', initials: '?' });
        setTask(t => ({ ...t, assignees: next }));
        try { const row = await TaskAPI.setAssignees(prev.id, ids); if (row && row.id) setTask(t => ({ ...t, ...row, description: t.description })); }
        catch (e) { setTask(prev); toast('Could not update assignees: ' + errMsg(e)); }
      };
      const setField = (fieldId, value) => {
        const cf = { ...(task.custom_fields || {}), [fieldId]: value };
        quiet(patchTask({ custom_fields: { [fieldId]: value } }, { custom_fields: cf }, 'Could not save field'));
      };
      const toggleWatch = async () => {
        const on = !watching;
        setWatching(on);
        try { const r = await TaskAPI.watch(task.id, on); if (r && typeof r.is_watching === 'boolean') setWatching(r.is_watching); }
        catch (e) { setWatching(!on); toast('Could not update watch: ' + errMsg(e)); }
      };
      const isFav = favOn !== null ? favOn : (task ? store.isFavorite('task', task.id) : false);
      const toggleFav = async () => {
        const next = !isFav; setFavOn(next);
        try { const r = await TaskAPI.favoriteToggle('task', task.id, task.title, taskLink(task.id)); if (r && typeof r.on === 'boolean') setFavOn(r.on); }
        catch (e) { setFavOn(!next); toast('Could not update favorites: ' + errMsg(e)); }
      };
      const duplicate = async () => {
        try { const row = await TaskAPI.duplicate(task.id); toast('Task duplicated'); if (row && row.id) openTask(row.id); }
        catch (e) { toast('Could not duplicate: ' + errMsg(e)); }
      };
      const archive = async () => {
        try { await TaskAPI.update(task.id, { archived: true }); toast('Task archived'); onClose && onClose(); }
        catch (e) { toast('Could not archive: ' + errMsg(e)); }
      };
      const del = async () => {
        if (!confirm('Delete "' + (task.title || 'this task') + '"? This cannot be undone.')) return;
        try { await TaskAPI.remove(task.id); toast('Task deleted'); onClose && onClose(); }
        catch (e) { toast('Could not delete: ' + errMsg(e)); }
      };
      const moveTo = (listId, list) => {
        if (!list || listId === task.list_id) return;
        const c = list.client_id ? store.clientById[list.client_id] : null;
        quiet(patchTask({ list_id: listId }, { list_id: listId, list_name: list.name, list_kind: list.kind, client_id: list.client_id || null, client_name: c ? c.name : null }, 'Could not move task'));
        if ((list.client_id || null) !== (task.client_id || null)) toast('Moved to ' + (c ? c.name : 'Agency') + ' › ' + list.name);
      };

      // Due date: keep duration + "shift dependents?" (093 flags only sent when v2).
      const setDue = (iso, o) => {
        const cur = taskRef.current;
        if (!cur) return;
        const hasTime = !!(o && o.hasTime);
        const patch = { due_at: iso, due_has_time: hasTime };
        const optimistic = { due_at: iso, due_has_time: hasTime };
        const delta = cur.due_at && iso ? new Date(iso).getTime() - new Date(cur.due_at).getTime() : 0;
        if (v2 && keepDuration && cur.start_at && delta) {
          patch.keep_duration = true;
          optimistic.start_at = new Date(new Date(cur.start_at).getTime() + delta).toISOString();
        }
        const blocking = Number(cur.blocking_count) || 0;
        if (v2 && delta && blocking > 0 && feature('dependencies') && feature('reschedule_dependencies')) {
          setDialog({ kind: 'shift', patch, optimistic, blocking, delta });
          return;
        }
        quiet(patchTask(patch, optimistic, 'Could not set due date'));
      };
      const runShift = (shift) => {
        const d = dialog;
        setDialog(null);
        if (!d) return;
        patchTask(shift ? { ...d.patch, shift_dependents: true } : d.patch, d.optimistic, 'Could not set due date')
          .then(() => {
            if (!shift) return;
            toast('Shifted ' + d.blocking + (d.blocking === 1 ? ' dependent task' : ' dependent tasks') + ' too');
            taskBus.emit('task:changed', { id: null });
            load(true);
          })
          .catch(() => { });
      };
      const toggleKeepDuration = () => {
        const n = !keepDuration;
        setKeepDuration(n); lsSet(KEEP_DURATION_KEY, n ? '1' : '0');
        toast(n ? 'Start date will move with the due date' : 'Start date stays put when the due date moves');
      };
      const setRecurrence = (rec) => {
        const cur = taskRef.current;
        const spawned = cur && cur.recurrence && cur.recurrence.spawned_next;
        const next = rec ? (spawned ? { ...rec, spawned_next: spawned } : rec) : null;
        quiet(patchTask({ recurrence: next }, { recurrence: next }, 'Could not set recurrence'));
      };
      const removeReminder = async (r) => {
        setReminders(cur => arr(cur).filter(x => x.id !== r.id));
        try { await TaskAPI.reminderDelete(r.id, task.id); }
        catch (e) { setReminders(cur => [...arr(cur), r]); toast('Could not remove reminder: ' + errMsg(e)); }
      };
      const toggleLineup = async () => {
        const on = !inLineup;
        setInLineup(on);
        try {
          const r = on ? await TaskAPI.lineupAdd(task.id) : await TaskAPI.lineupRemove(task.id);
          const v = r && typeof r.in_lineup === 'boolean' ? r.in_lineup : on;
          setInLineup(v); toast(v ? 'Added to Up next' : 'Removed from Up next');
        } catch (e) { setInLineup(!on); toast('Could not update Up next: ' + errMsg(e)); }
      };
      const saveTemplate = async () => {
        const d = dialog;
        if (!d) return;
        const name = String(d.name || '').trim();
        if (!name) { setDialog(x => (x ? { ...x, error: 'Give the template a name' } : x)); return; }
        setDialogBusy(true);
        try {
          await TaskAPI.templateSaveFromTask(task.id, name, String(d.description || '').trim() || null);
          setDialog(null); toast('Saved as template “' + name + '”');
        } catch (e) { setDialog(x => (x ? { ...x, error: errMsg(e) } : x)); }
        setDialogBusy(false);
      };
      const applyTemplate = async (tpl) => {
        tplMenu.close();
        if (!tpl || !tpl.id) return;
        try {
          const r = await TaskAPI.templateApply(tpl.id, { task_id: task.id, base_date: ymdLocal(task.start_at || task.due_at || undefined) });
          const n = arr(r && r.created).length;
          toast('Applied “' + tpl.name + '”' + (n ? ' — ' + n + (n === 1 ? ' item' : ' items') + ' added' : ''));
          load(true);
        } catch (e) { toast('Could not apply template: ' + errMsg(e)); }
      };
      const printView = () => {
        try {
          const cl = task.client_id ? store.clientById[task.client_id] : null;
          const defs = feature('custom_fields') ? (fields || store.fieldsFor(task.list_id)).filter(f => f && f.id) : [];
          printTask(task, { subtasks, checklists, attachments, comments, links, fields: defs, space: task.client_name || (cl && cl.name) || 'Agency' }, store);
        } catch (e) { toast('Could not open the print view: ' + errMsg(e)); }
      };
      const scrollToRelationships = () => {
        const el = document.getElementById('cu-rel-' + task.id);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };

      // Next / previous task — sibling order published by views.js on window.__amsTaskNav.
      const readNav = () => {
        const n = window.__amsTaskNav;
        const ids = n && Array.isArray(n.ids) ? n.ids : [];
        const i = ids.indexOf(taskId);
        return i >= 0 && ids.length > 1 ? { ids, i, label: (n && n.label) || '' } : null;
      };
      const goNav = (dir) => {
        const n = readNav();
        if (!n) return false;
        const id = n.ids[n.i + dir];
        if (!id) return false;
        openTask(id);
        return true;
      };
      const onPanelKey = (e) => {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
        if (isEditableTarget(e.target) || popoverOpen() || dialog || historyOpen) return;
        const k = e.key;
        const onBox = e.target === boxRef.current;
        if (k === 'j' || k === 'J' || (k === 'ArrowDown' && onBox)) { if (goNav(1)) e.preventDefault(); }
        else if (k === 'k' || k === 'K' || (k === 'ArrowUp' && onBox)) { if (goNav(-1)) e.preventDefault(); }
      };

      // ---- render states ---------------------------------------------------
      const shell = (inner) => h`<div class="cu-modal-bg" onMouseDown=${e => { if (e.target === e.currentTarget) onClose && onClose(); }}>
        <div class="cu-modal cu-tp" ref=${boxRef} role="dialog" aria-modal="true" aria-label=${task ? 'Task: ' + task.title : 'Task'} tabIndex=${-1} style=${{ outline: 'none' }} onKeyDown=${onPanelKey}>${inner}</div>
      </div>`;
      if (loading && !task) return shell(h`<${PanelSkeleton} onClose=${onClose}/>`);
      if (error && !task) {
        const forbidden = error && error.code === 'forbidden';
        return shell(h`<${Fragment}>
          <div class="cu-tp-hd"><div class="cu-crumb">Task</div><button type="button" class="cu-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button></div>
          <div style=${{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <${EmptyState} icon=${forbidden ? 'ti-lock' : 'ti-cloud-off'} title=${forbidden ? "You don't have access to this task" : "Couldn't load this task"}
              sub=${forbidden ? 'It may be private or in a space you are not part of.' : errMsg(error)}
              action=${!forbidden ? h`<button type="button" class="cu-btn" onClick=${() => load(false)}><i class="ti ti-refresh"></i>Retry</button>` : null}/>
          </div>
        <//>`);
      }
      if (!task) return null;

      const client = task.client_id ? store.clientById[task.client_id] : null;
      const space = task.client_name || (client && client.name) || 'Agency';
      const fieldDefs = feature('custom_fields') ? (fields || store.fieldsFor(task.list_id)).filter(f => f && f.id) : [];
      const cf = task.custom_fields || {};
      const done = isDone(task);
      const listObj = store.listById[task.list_id];
      const canDeps = feature('dependencies');
      const multiAssign = feature('multiple_assignees');
      const estRoll = Number(task.estimate_rollup_minutes) || 0;
      const timeRoll = Number(task.time_rollup_minutes) || 0;
      const timerHere = !!(store.runningTimer && store.runningTimer.task_id === task.id);
      const openReminders = arr(reminders).filter(r => r && !r.sent_at).sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at));
      const hasRecurrence = !!(task.recurrence && task.recurrence.freq);
      const extSections = extItems('taskPanelSections').filter(s => typeof s.Component === 'function' && extWhen(s, task));
      const extMain = extSections.filter(s => s.placement !== 'side');
      const extSide = extSections.filter(s => s.placement === 'side');
      const nav = readNav();

      const props = [
        { key: 'status', icon: 'ti-circle-dot', label: 'Status', empty: false, node: h`<${Fragment}>
            <${StatusPicker} row=${task} onChange=${setStatus} size="md" solid=${true}/>
            <button type="button" class="cu-btn" style=${{ height: 26, padding: '0 8px', ...(done ? { background: '#30a46c', borderColor: '#30a46c', color: '#fff' } : {}) }}
              aria-pressed=${done} aria-label=${done ? 'Mark as not complete' : 'Mark complete'} title=${done ? 'Reopen' : 'Mark complete'} onClick=${toggleComplete}>
              <i class="ti ti-check" style=${{ fontSize: 14 }}></i>
            </button><//>` },
        { key: 'assignees', icon: 'ti-users', label: 'Assignees', empty: !arr(task.assignees).length, node: h`<${AssigneePicker} value=${arr(task.assignees).map(a => a.id)} onChange=${setAssignees} multi=${multiAssign}
            anchorContent=${arr(task.assignees).length ? h`<${Fragment}><${AssigneeStack} assignees=${task.assignees} max=${5} size=${26}/>${task.assignees.length === 1 ? h`<span style=${{ fontSize: 13 }}>${task.assignees[0].name}</span>` : null}<//>` : h`<span style=${{ color: 'var(--cu-t3)', display: 'inline-flex', gap: 6, alignItems: 'center' }}><i class="ti ti-user-plus"></i>Empty</span>`}/>` },
        { key: 'dates', icon: 'ti-calendar', label: 'Dates', empty: !task.start_at && !task.due_at, node: h`<${Fragment}>
            <${DatePicker} value=${task.start_at} label="Start date" placeholder="Start" endOfDay=${false} withTime=${false}
              onChange=${iso => quiet(patchTask({ start_at: iso }, null, 'Could not set start date'))}/>
            <i class="ti ti-arrow-right" style=${{ color: 'var(--cu-t3)', fontSize: 13 }} aria-hidden="true"></i>
            <${DatePicker} value=${task.due_at} label="Due date" placeholder="Due" withTime=${true} done=${done}
              hasTime=${task.due_has_time === undefined || task.due_has_time === null ? undefined : !!task.due_has_time}
              onChange=${setDue}/>
            ${v2 && task.start_at && task.due_at ? h`<button type="button" class=${'cu-ibtn' + (keepDuration ? ' on' : '')} style=${{ width: 24, height: 24 }}
              aria-pressed=${keepDuration} aria-label="Keep duration when the due date moves"
              title=${keepDuration ? 'Keep duration is on — the start date moves with the due date' : 'Keep duration is off — the start date stays put'}
              onClick=${toggleKeepDuration}><i class=${'ti ' + (keepDuration ? 'ti-link' : 'ti-unlink')} style=${{ fontSize: 14 }}></i></button>` : null}<//>` },
        ...(feature('recurring') ? [{ key: 'recur', icon: 'ti-repeat', label: 'Recurring', empty: !hasRecurrence, node: h`<${RecurrencePicker} value=${hasRecurrence ? task.recurrence : null} dueAt=${task.due_at} advanced=${v2} onChange=${setRecurrence}/>` }] : []),
        ...(Array.isArray(reminders) ? [{ key: 'remind', icon: 'ti-bell', label: 'Remind me', empty: !openReminders.length, node: h`<div style=${{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
            ${openReminders.map(r => h`<span key=${r.id} class="cu-rem" title=${fmtDateTimeUser(r.remind_at) + (r.note ? ' — ' + r.note : '')}>
              <i class="ti ti-bell" aria-hidden="true"></i><span>${fmtDue(r.remind_at, true).text + (r.note ? ' · ' + r.note : '')}</span>
              <button type="button" class="cu-wa-x" aria-label=${'Remove reminder ' + fmtDue(r.remind_at, true).text} onClick=${() => removeReminder(r)}><i class="ti ti-x"></i></button>
            </span>`)}
            <${ReminderPicker} taskId=${task.id} dueAt=${task.due_at} showToast=${toast} label=${openReminders.length ? 'Add' : 'Remind me'}
              onAdded=${r => setReminders(cur => [...arr(cur), r])}/>
          </div>` }] : []),
        ...(feature('priorities') ? [{ key: 'priority', icon: 'ti-flag', label: 'Priority', empty: !task.priority, node: h`<${PriorityPicker} value=${task.priority} onChange=${v => quiet(patchTask({ priority: v }, null, 'Could not set priority'))}/>` }] : []),
        { key: 'estimate', icon: 'ti-hourglass', label: 'Time estimate', empty: !task.estimate_minutes && !estRoll, node: h`<${Fragment}>
            <${EstimateInput} value=${task.estimate_minutes} onSave=${n => quiet(patchTask({ estimate_minutes: n }, null, 'Could not set estimate'))}/>
            ${estRoll > (Number(task.estimate_minutes) || 0) ? h`<span class="cu-roll" title="This task plus all its subtasks">${fmtMinutes(estRoll) + ' incl. subtasks'}</span>` : null}<//>` },
        ...(feature('time_tracking') ? [{ key: 'track', icon: 'ti-clock-play', label: 'Track time', empty: !task.time_spent_minutes && !timeRoll && !timerHere, node: h`<${Fragment}>
            <${TimeTracker} task=${task} showToast=${toast} onChanged=${() => load(true)}/>
            ${timeRoll > (Number(task.time_spent_minutes) || 0) ? h`<span class="cu-roll" title="This task plus all its subtasks">${fmtMinutes(timeRoll) + ' incl. subtasks'}</span>` : null}<//>` }] : []),
        { key: 'wa', icon: 'ti-brand-whatsapp', iconColor: WA_GREEN, label: 'WhatsApp follow-up', empty: waCount === 0, node: h`<${WhatsAppFollowups} task=${task} showToast=${toast} onCount=${setWaCount}/>` },
        ...(feature('tags') ? [{ key: 'tags', icon: 'ti-tag', label: 'Tags', empty: !arr(task.tag_ids).length, node: h`<${TagPicker} value=${arr(task.tag_ids)} showToast=${toast} onChange=${ids => quiet(patchTask({ tag_ids: ids }, null, 'Could not update tags'))}/>` }] : []),
        ...fieldDefs.map(f => ({ key: 'f:' + f.id, icon: FIELD_ICON[f.type] || 'ti-forms', label: f.name, empty: isEmptyVal(cf[f.id]), node: h`<${CustomFieldEditor} field=${f} value=${cf[f.id]} onSave=${v => setField(f.id, v)}/>` })),
      ];
      const emptyCount = props.filter(p => p.empty && p.key !== 'status').length;
      const visibleProps = collapse ? props.filter(p => !p.empty || p.key === 'status') : props;

      const extMenu = extItems('taskMenuItems').filter(it => typeof it.run === 'function' && extWhen(it, task)).map(it => ({
        key: 'ext:' + extKey(it), label: it.label, icon: tiIcon(it.icon),
        onSelect: () => {
          try {
            const r = it.run(task, { showToast: toast, reload: reloadSilent, close: onClose });
            if (r && typeof r.catch === 'function') r.catch(e => toast(errMsg(e)));
          } catch (e) { toast(errMsg(e)); }
        },
      }));
      const moreItems = [
        { key: 'dup', label: 'Duplicate', icon: 'ti-copy', onSelect: duplicate },
        { key: 'type', label: 'Convert type', icon: 'ti-transform', disabled: task.type === 'post', submenu: Object.keys(TYPE_META).filter(k => k !== 'post').map(k => ({ key: k, label: TYPE_META[k].label, icon: TYPE_META[k].icon, right: k === task.type ? '✓' : null, disabled: k === task.type, onSelect: () => quiet(patchTask({ type: k }, null, 'Could not convert')) })) },
        { key: 'move', label: 'Move to list…', icon: 'ti-arrows-move', onSelect: () => { setMoveMode('list'); setTimeout(() => moveMenu.setOpen(true), 0); } },
        { key: 'moveclient', label: 'Move to another client…', icon: 'ti-switch-horizontal', onSelect: () => { setMoveMode('client'); setTimeout(() => moveMenu.setOpen(true), 0); } },
        { key: 'copyid', label: 'Copy task ID', icon: 'ti-hash', onSelect: async () => { await copyText(task.custom_id || task.id); toast('Task ID copied'); } },
        ...(inLineup !== null && feature('lineup') ? [{ key: 'lineup', label: inLineup ? 'Remove from Up next' : 'Add to Up next', icon: 'ti-list-numbers', disabled: done && !inLineup, onSelect: toggleLineup }] : []),
        ...(v2 && feature('templates') ? [
          { key: 'tplsave', label: 'Save as template…', icon: 'ti-template', onSelect: () => setDialog({ kind: 'tplsave', name: task.title || '', description: '', error: '' }) },
          { key: 'tplapply', label: 'Apply template…', icon: 'ti-file-import', onSelect: () => setTimeout(() => tplMenu.setOpen(true), 0) },
        ] : []),
        { key: 'print', label: 'Print', icon: 'ti-printer', onSelect: printView },
        { key: 'wanudge', label: 'Nudge on WhatsApp now', icon: 'ti-brand-whatsapp', disabled: done, onSelect: () => setTimeout(() => nudgeMenu.setOpen(true), 0) },
        ...(extMenu.length ? [{ divider: true }, ...extMenu] : []),
        { divider: true },
        { key: 'archive', label: 'Archive', icon: 'ti-archive', onSelect: archive },
        { key: 'del', label: 'Delete', icon: 'ti-trash', danger: true, onSelect: del },
      ];

      return shell(h`<${Fragment}>
        <header class="cu-tp-hd">
          <nav class="cu-crumb" aria-label="Breadcrumb">
            ${client ? h`<${ClientBadge} client=${client} size=${18} showName=${false}/>` : h`<i class="ti ti-building" style=${{ color: 'var(--cu-t3)' }}></i>`}
            <span>${space}</span><span class="sep">/</span>
            <span style=${{ color: 'var(--cu-t1)' }}>${task.list_name || (listObj && listObj.name) || 'List'}</span>
            ${task.is_private ? h`<i class="ti ti-lock" title="Private task" style=${{ color: 'var(--cu-t3)' }}></i>` : null}
            ${task.custom_id ? h`<button type="button" class="cu-idchip" title="Copy task ID" onClick=${async () => { await copyText(task.custom_id); toast('Copied ' + task.custom_id); }}>${task.custom_id}</button>` : null}
          </nav>
          ${canDeps && Number(task.blocked_by_open) > 0 ? h`<button type="button" class="cu-blocked"
            title=${'Waiting on ' + task.blocked_by_open + (Number(task.blocked_by_open) === 1 ? ' open task' : ' open tasks')} onClick=${scrollToRelationships}>
            <i class="ti ti-hand-stop" aria-hidden="true"></i>Blocked<span class="cu-hide-xs">${' · ' + task.blocked_by_open}</span></button>` : null}
          ${nav ? h`<div class="cu-nav" role="group" aria-label=${'Task ' + (nav.i + 1) + ' of ' + nav.ids.length + (nav.label ? ' in ' + nav.label : '')}>
            <button type="button" class="cu-ibtn" aria-label="Previous task" title="Previous task (K)" disabled=${nav.i === 0} onClick=${() => goNav(-1)}><i class="ti ti-chevron-up"></i></button>
            <span class="cu-nav-n cu-hide-xs" title=${nav.label || ''}>${(nav.i + 1) + ' / ' + nav.ids.length}</span>
            <button type="button" class="cu-ibtn" aria-label="Next task" title="Next task (J)" disabled=${nav.i === nav.ids.length - 1} onClick=${() => goNav(1)}><i class="ti ti-chevron-down"></i></button>
          </div>` : null}
          <button type="button" class=${'cu-btn cu-btn-ghost' + (watching ? ' on' : '')} style=${{ height: 28, padding: '0 8px', color: watching ? 'var(--cu-accent-ink)' : undefined }}
            aria-pressed=${watching} onClick=${toggleWatch} title=${watching ? 'Stop watching' : 'Watch this task'}>
            <i class=${'ti ' + (watching ? 'ti-eye-check' : 'ti-eye')}></i><span class="cu-hide-xs">${watching ? 'Watching' : 'Watch'}</span>${watchers.length ? h`<span style=${{ color: 'var(--cu-t3)', fontWeight: 500 }}>${watchers.length}</span>` : null}
          </button>
          <button type="button" class=${'cu-ibtn' + (isFav ? ' on' : '')} aria-pressed=${isFav} aria-label=${isFav ? 'Remove from favorites' : 'Add to favorites'} onClick=${toggleFav}>
            <i class=${'ti ' + (isFav ? 'ti-star-filled' : 'ti-star')} style=${isFav ? { color: '#f5a623' } : null}></i></button>
          <button type="button" class="cu-ibtn" aria-label="Copy link" title="Copy link" onClick=${async () => { await copyText(taskLink(task.id)); toast('Link copied'); }}><i class="ti ti-link"></i></button>
          <button type="button" ref=${moreMenu.ref} class="cu-ibtn" aria-label="More actions" aria-haspopup="menu" onClick=${moreMenu.toggle}><i class="ti ti-dots"></i></button>
          <${Popover} anchor=${moreMenu.anchor} open=${moreMenu.open} onClose=${moreMenu.close} placement="bottom-end">
            <${Menu} items=${moreItems} onClose=${moreMenu.close}/>
          <//>
          <${Popover} anchor=${moreMenu.anchor} open=${moveMenu.open} onClose=${moveMenu.close} placement="bottom-end" width=${300} ariaLabel="Move to list">
            <${PickerList} items=${listPickerItems(store, task.list_id, l => (task.type !== 'post' || l.kind === 'content') && (moveMode !== 'client' || (l.client_id || null) !== (task.client_id || null)))}
              placeholder=${moveMode === 'client' ? 'Move to another client…' : 'Move to list…'} emptyText=${moveMode === 'client' ? 'No lists in other spaces' : 'No lists'}
              onPick=${it => { moveMenu.close(); moveTo(it.key, it.list); }}/>
          <//>
          <${Popover} anchor=${moreMenu.anchor} open=${tplMenu.open} onClose=${tplMenu.close} placement="bottom-end" ariaLabel="Apply template">
            <${TemplatePicker} inline=${true} kind="task" onPick=${applyTemplate}/>
          <//>
          <${Popover} anchor=${moreMenu.anchor} open=${nudgeMenu.open} onClose=${nudgeMenu.close} placement="bottom-end" ariaLabel="Nudge on WhatsApp">
            <${WhatsAppNudge} task=${task} showToast=${toast} onDone=${nudgeMenu.close}/>
          <//>
          <button type="button" class="cu-ibtn" aria-label="Close task" title="Close (Esc)" onClick=${onClose}><i class="ti ti-x"></i></button>
        </header>

        <div class="cu-tp-body">
          <main class="cu-tp-left">
            <div style=${{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <${TypePicker} value=${task.type} disabled=${task.type === 'post'} exclude=${['post']} onChange=${k => quiet(patchTask({ type: k }, null, 'Could not convert'))}/>
              ${task.parent_id ? h`<button type="button" class="cu-typechip" onClick=${() => openTask(task.parent_id)} title="Open parent task">
                <i class="ti ti-subtask"></i><span style=${{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${task.parent_title || 'Parent task'}</span></button>` : null}
              ${task.created_by_name ? h`<span style=${{ fontSize: 12, color: 'var(--cu-t3)' }} class="cu-hide-xs">Created by ${task.created_by_name}${task.created_at ? ' · ' + fmtRelative(task.created_at) : ''}</span>` : null}
            </div>
            <div class="cu-tp-title">
              <${InlineTitle} value=${task.title} placeholder="Task name" onSave=${t => quiet(patchTask({ title: t }, null, 'Could not rename'))}/>
            </div>

            <div class="cu-props">
              ${visibleProps.map(p => h`<${Fragment} key=${p.key}>
                <div class="cu-pl"><i class=${'ti ' + p.icon} aria-hidden="true" style=${p.iconColor ? { color: p.iconColor } : null}></i><span style=${{ overflow: 'hidden', textOverflow: 'ellipsis' }}>${p.label}</span></div>
                <div class="cu-pv">${p.node}</div>
              <//>`)}
            </div>
            ${emptyCount ? h`<button type="button" class="cu-addbtn cu-collapse" aria-pressed=${collapse}
              onClick=${() => { const n = !collapse; setCollapse(n); lsSet(COLLAPSE_KEY, n ? '1' : '0'); }}>
              <i class=${'ti ' + (collapse ? 'ti-chevron-down' : 'ti-chevron-up')}></i>${collapse ? 'Show ' + emptyCount + ' empty field' + (emptyCount === 1 ? '' : 's') : 'Collapse empty fields'}
            </button>` : null}

            <div class="cu-sec" style=${{ marginTop: 10 }}>
              <div class="cu-sec-hd">
                <span class="cu-sec-t">Description</span>
                <span style=${{ flex: 1 }}></span>
                ${v2 ? h`<button type="button" class="cu-addbtn" style=${{ fontSize: 12, padding: '2px 6px' }} aria-haspopup="dialog" onClick=${() => setHistoryOpen(true)}>
                  <i class="ti ti-history"></i>History</button>` : null}
              </div>
              <${DescriptionEditor} value=${task.description} onSave=${text => patchTask({ description: text }, null, 'Could not save description')}/>
            </div>

            ${task.type === 'post' ? h`<${PostBlock} task=${task}/>` : null}
            ${!task.parent_id && feature('subtasks') ? h`<${SubtasksSection} task=${task} subtasks=${subtasks} setSubtasks=${setSubtasks} showToast=${toast}/>` : null}
            ${Array.isArray(links) ? h`<${RelationshipsSection} task=${task} links=${links} setLinks=${setLinks} canDeps=${canDeps} onChanged=${reloadSilent} showToast=${toast}/>` : null}
            ${feature('checklists') ? h`<${ChecklistsSection} task=${task} checklists=${checklists} setChecklists=${setChecklists} showToast=${toast}/>` : null}
            <${AttachmentsSection} task=${task} attachments=${attachments} setAttachments=${setAttachments} showToast=${toast}/>
            ${extMain.map(s => h`<section key=${'ext:' + extKey(s)} class="cu-sec">
              <div class="cu-sec-hd">
                ${s.icon ? h`<i class=${'ti ' + tiIcon(s.icon)} style=${{ color: 'var(--cu-t3)' }} aria-hidden="true"></i>` : null}
                <span class="cu-sec-t">${s.title}</span>
              </div>
              <${ExtBoundary} name=${extKey(s)}>
                <${s.Component} task=${task} detail=${detail} reload=${reloadSilent} showToast=${toast} currentUser=${store.me}/>
              <//>
            </section>`)}
          </main>
          <${FeedPane} task=${task} comments=${comments} setComments=${setComments} activity=${activity} statusHistory=${statusHistory}
            sideSections=${extSide} extProps=${{ detail, reload: reloadSilent, currentUser: store.me }} showToast=${toast}/>
        </div>
        ${historyOpen ? h`<${DescriptionHistoryDrawer} task=${task} showToast=${toast} onClose=${() => setHistoryOpen(false)} onRestored=${reloadSilent}/>` : null}
        ${dialog && dialog.kind === 'close' ? h`<${ConfirmDialog} icon="ti-alert-triangle" tone="warn"
          title=${privileged ? 'This task still has open work' : 'Finish the open work first'}
          body=${privileged ? 'You can close it anyway, or cancel and wrap these up first:' : 'These need to be done before the task can be closed. A manager can close it anyway.'}
          confirmLabel=${'Close anyway'} hideConfirm=${!privileged} cancelLabel=${privileged ? 'Cancel' : 'OK'}
          onCancel=${() => setDialog(null)} onConfirm=${() => { const k = dialog.key; setDialog(null); applyStatus(k); }}>
          <ul class="cu-issues">
            ${arr(dialog.issues).map((it, i) => h`<li key=${i}><i class=${'ti ' + it.icon} aria-hidden="true"></i><span>${it.text}</span></li>`)}
          </ul>
        <//>` : null}
        ${dialog && dialog.kind === 'shift' ? h`<${ConfirmDialog} icon="ti-calendar-event" title="Shift dependent tasks too?"
          body=${'This task is blocking ' + dialog.blocking + (dialog.blocking === 1 ? ' task' : ' tasks') + '. Move their dates ' + fmtShift(dialog.delta) + ' as well?'}
          onCancel=${() => setDialog(null)} actions=${[{ key: 'only', label: 'Only this task', onClick: () => runShift(false) }]}
          confirmLabel="Shift dependents" onConfirm=${() => runShift(true)}/>` : null}
        ${dialog && dialog.kind === 'tplsave' ? h`<${ConfirmDialog} icon="ti-template" title="Save as template"
          body="Saves this task’s description, subtasks and checklists so you can reuse them on any task."
          confirmLabel="Save template" busy=${dialogBusy} onCancel=${() => setDialog(null)} onConfirm=${saveTemplate}>
          <div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input class="cu-input" data-autofocus="1" value=${dialog.name} maxLength=${120} placeholder="Template name" aria-label="Template name"
              onInput=${e => { const v = e.target.value; setDialog(d => (d ? { ...d, name: v, error: '' } : d)); }}
              onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); saveTemplate(); } }}/>
            <textarea class="cu-input" rows=${3} value=${dialog.description} placeholder="Description (optional)" aria-label="Template description"
              style=${{ height: 'auto', padding: '6px 10px', resize: 'vertical', lineHeight: 1.45 }}
              onInput=${e => { const v = e.target.value; setDialog(d => (d ? { ...d, description: v } : d)); }}></textarea>
            ${dialog.error ? h`<span class="cu-err" role="alert">${dialog.error}</span>` : null}
          </div>
        <//>` : null}
      <//>`);
    }

    // =========================================================================
    // CreateTaskModal — ClickUp "Create task" dialog
    // =========================================================================
    function CreateTaskModal({ initial, onClose, onCreated, showToast }) {
      const init = initial || {};
      const store = useTaskStore();
      const boxRef = useRef(null);
      const titleRef = useRef(null);
      const [title, setTitle] = useState(init.title || '');
      const [desc, setDesc] = useState(init.description || '');
      const [listId, setListId] = useState(init.list_id || null);
      const [type, setType] = useState(init.type && TYPE_META[init.type] ? init.type : 'task');
      const [status, setStatus] = useState(init.status || null);
      const [assignees, setAssignees] = useState(arr(init.assignee_ids));
      const [due, setDue] = useState(init.due_at || null);
      const [dueHasTime, setDueHasTime] = useState(!!init.due_has_time);
      const [priority, setPriority] = useState(init.priority || null);
      const [tagIds, setTagIds] = useState(arr(init.tag_ids));
      const [postType, setPostType] = useState(init.post_type || null);
      const [waPreset, setWaPreset] = useState(init.priority === 1 ? 'every2h' : null);   // null = off
      const [waTouched, setWaTouched] = useState(false);
      const [recurrence, setRecurrence] = useState(init.recurrence && init.recurrence.freq ? init.recurrence : null);
      const [reminder, setReminder] = useState(null);        // { remind_at, note } — added after create
      const [template, setTemplate] = useState(null);        // template summary from template_list
      const [ai, setAi] = useState({ busy: false, items: null, error: '' });
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState('');
      const feature = store.feature;
      const v2 = store.v2;
      const isKit = !!(template && template.kind === 'list_kit');
      const toast = (m) => { if (showToast) showToast(m); };
      useModalChrome(onClose, boxRef);
      useEffect(() => { setTimeout(() => titleRef.current && titleRef.current.focus(), 0); }, []);

      // default list: initial.list_id → client's `tasks` list → Agency `internal`
      useEffect(() => {
        if (listId || !store.ready) return;
        let l = null;
        if (init.client_id) {
          const cl = store.listsForClient(init.client_id);
          l = (type === 'post' ? cl.find(x => x.kind === 'content' || x.system_key === 'content') : null)
            || cl.find(x => x.system_key === 'tasks') || cl.find(x => x.kind === 'general') || cl[0];
        }
        if (!l) { const ag = store.listsForClient(null); l = ag.find(x => x.system_key === 'internal') || ag.find(x => !x.is_private) || ag[0]; }
        if (l) setListId(l.id);
      }, [store.ready, store.lists]);

      const lst = store.listById[listId] || null;
      const clientId = lst ? (lst.client_id || null) : (init.client_id || null);
      const statusOpts = store.statusesFor(lst || listId);
      useEffect(() => {
        if (!statusOpts.length) return;
        if (!status || !statusOpts.some(s => s.key === status)) setStatus(statusOpts[0].key);
      }, [listId, statusOpts.length]);

      // posts live in a client's content list
      const contentListFor = (cid) => cid ? store.listsForClient(cid).find(x => x.kind === 'content' || x.system_key === 'content') : null;
      useEffect(() => {
        if (type !== 'post' || !lst || lst.kind === 'content') return;
        const cl = contentListFor(lst.client_id);
        if (cl) setListId(cl.id);
      }, [type, listId]);

      const postProblem = type === 'post'
        ? (!clientId ? 'Posts belong to a client — pick a client content calendar list.'
          : (!lst || lst.kind !== 'content') ? 'Pick the client’s content calendar list for posts.'
            : !postType ? 'Choose the post sub-type.' : '')
        : '';

      // ---- templates ---------------------------------------------------------
      const pickTemplate = async (tpl) => {
        if (!tpl || !tpl.id) return;
        setTemplate(tpl); setErr('');
        if (tpl.kind === 'list_kit') return;
        try {
          const full = await TaskAPI.templateGet(tpl.id);
          const pl = (full && full.payload) || {};
          const src = pl.task && typeof pl.task === 'object' ? pl.task : pl;
          setTitle(cur => (cur.trim() ? cur : String(src.title || (full && full.name) || tpl.name || '')));
          setDesc(cur => (cur.trim() ? cur : String(src.description || '')));
          setPriority(cur => cur || ([1, 2, 3, 4].includes(Number(src.priority)) ? Number(src.priority) : null));
          if (arr(src.tag_ids).length) setTagIds(cur => (cur.length ? cur : arr(src.tag_ids).filter(id => store.tagById[id])));
        } catch (_) { /* prefill is best-effort; the template still applies on create */ }
      };

      // ---- Split with AI (window.AMS_AI — workstream N) ------------------------
      const aiAvailable = !!(window.AMS_AI && window.AMS_AI.enabled && typeof window.AMS_AI.run === 'function')
        && type !== 'post' && feature('subtasks') && !init.parent_id && !isKit;
      const PRIORITY_WORDS = { urgent: 1, high: 2, normal: 3, medium: 3, low: 4 };
      const memberIdFor = (x) => {
        const pool = store.members.filter(m => m && m.role_level !== 'client');
        if (x.assignee_id && pool.some(m => m.id === x.assignee_id)) return x.assignee_id;
        const s = String(x.assignee_name || x.assignee || '').trim().toLowerCase();
        if (!s) return null;
        const m = pool.find(mm => String(mm.name).toLowerCase() === s) || pool.find(mm => String(mm.name).toLowerCase().split(/\s+/)[0] === s.split(/\s+/)[0]);
        return m ? m.id : null;
      };
      const normAi = (x) => {
        if (typeof x === 'string') return { title: x.trim(), include: true };
        const o = x || {};
        const pr = [1, 2, 3, 4].includes(Number(o.priority)) ? Number(o.priority) : (PRIORITY_WORDS[String(o.priority || '').toLowerCase()] || null);
        const est = Number(o.estimate_minutes) || (o.estimate ? parseMinutes(o.estimate) : null) || null;
        return { title: String(o.title || o.name || '').trim(), description: o.description ? String(o.description) : '', priority: pr, assignee_id: memberIdFor(o), estimate_minutes: est, include: true };
      };
      const splitWithAi = async () => {
        const engine = window.AMS_AI;
        if (!engine || !engine.enabled || typeof engine.run !== 'function') { toast('AI tools aren’t available right now'); return; }
        if (!title.trim() && !desc.trim()) { setErr('Describe the task first, then split it with AI.'); return; }
        setAi(a => ({ ...a, busy: true, error: '' }));
        try {
          const res = await engine.run('split_task', {
            title: title.trim(), description: desc.trim(), type, client_id: clientId, list_id: listId, due_at: due || null,
            members: store.members.filter(m => m && m.role_level !== 'client').map(m => ({ id: m.id, name: m.name, role: m.role_level })),
          });
          const raw = Array.isArray(res) ? res : arr(res && (res.subtasks || res.items || res.tasks));
          const items = raw.map(normAi).filter(x => x.title).slice(0, 30);
          setAi({ busy: false, items: items.length ? items : null, error: items.length ? '' : 'AI didn’t suggest any subtasks — add more detail and try again.' });
        } catch (e) { setAi(a => ({ ...a, busy: false, error: 'AI split failed: ' + errMsg(e) })); }
      };
      const setAiItem = (i, patch) => setAi(a => ({ ...a, items: arr(a.items).map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
      const aiPicked = arr(ai.items).filter(x => x.include && String(x.title || '').trim());

      const submit = async (openAfter) => {
        if (busy) return;
        const t = title.trim();
        // A list kit creates its whole set of tasks — the name field is an optional prefix.
        if (isKit) {
          if (!listId) { setErr('Choose a list.'); return; }
          setErr(''); setBusy(true);
          try {
            const r = await TaskAPI.templateApply(template.id, { list_id: listId, client_id: clientId, base_date: ymdLocal(due || undefined), assignee_ids: assignees, title_prefix: t || undefined, parent_id: init.parent_id || undefined });
            const created = arr(r && r.created);
            toast(created.length ? 'Created ' + created.length + (created.length === 1 ? ' task' : ' tasks') + ' from “' + template.name + '”' : 'Template applied');
            if (onCreated) onCreated(created[0] || null);
            onClose && onClose();
            if (openAfter && created[0] && created[0].id) setTimeout(() => openTask(created[0].id), 0);
          } catch (e) { setErr(errMsg(e)); setBusy(false); }
          return;
        }
        if (!t) { setErr('Give the task a name.'); titleRef.current && titleRef.current.focus(); return; }
        if (!listId) { setErr('Choose a list.'); return; }
        if (postProblem) { setErr(postProblem); return; }
        setErr(''); setBusy(true);
        const data = {
          title: t, description: desc.trim() || null, list_id: listId, client_id: clientId, type,
          status: status || null, priority: priority || null, due_at: due || null, due_has_time: !!(due && dueHasTime),
          assignee_ids: assignees, tag_ids: tagIds,
        };
        if (init.parent_id) data.parent_id = init.parent_id;
        if (init.start_at) data.start_at = init.start_at;
        if (type === 'post') data.post_type = postType;
        if (recurrence && type !== 'post' && feature('recurring')) data.recurrence = recurrence;
        try {
          const row = await TaskAPI.create(data);
          const rid = row && row.id;
          if (waPreset && rid) {
            const wp = FOLLOWUP_PRESETS.find(x => x.key === waPreset);
            const block = presetBlock(wp, row.due_at !== undefined ? row.due_at : due);
            if (wp && block) toast('Task created — WhatsApp follow-up skipped: ' + block);
            else if (wp) TaskAPI.followupAdd(rid, wp.build()).catch(e => toast('Task created, but the WhatsApp follow-up failed: ' + waErr(e)));
          }
          if (rid) {
            const follow = [];
            if (template) follow.push(TaskAPI.templateApply(template.id, { task_id: rid, base_date: ymdLocal(due || undefined) })
              .catch(e => toast('Task created, but the template couldn’t be applied: ' + errMsg(e))));
            if (reminder) follow.push(TaskAPI.reminderAdd(rid, reminder.remind_at, reminder.note)
              .catch(e => toast('Task created, but the reminder failed: ' + errMsg(e))));
            if (aiPicked.length) follow.push((async () => {
              let bad = 0;
              for (const x of aiPicked) {   // sequential keeps the suggested order
                try {
                  await TaskAPI.create({ title: x.title.trim(), parent_id: rid, list_id: listId, client_id: clientId, description: x.description || null, priority: x.priority || null, assignee_ids: x.assignee_id ? [x.assignee_id] : [], estimate_minutes: x.estimate_minutes || null });
                } catch (_) { bad++; }
              }
              if (bad) toast((aiPicked.length - bad) + ' of ' + aiPicked.length + ' subtasks created');
            })());
            if (follow.length) await Promise.all(follow);
          }
          toast(type === 'post' ? 'Post created' : aiPicked.length ? 'Task created with ' + aiPicked.length + (aiPicked.length === 1 ? ' subtask' : ' subtasks') : 'Task created');
          if (onCreated) onCreated(row);
          onClose && onClose();
          if (openAfter && rid) setTimeout(() => openTask(rid), 0);
        } catch (e) { setErr(errMsg(e)); setBusy(false); }
      };

      const assigneeMembers = assignees.map(id => store.memberById[id]).filter(Boolean);
      return h`<div class="cu-modal-bg" onMouseDown=${e => { if (e.target === e.currentTarget) onClose && onClose(); }}>
        <div class="cu-modal cu-cm" ref=${boxRef} role="dialog" aria-modal="true" aria-label="Create task" tabIndex=${-1} style=${{ outline: 'none' }}
          onKeyDown=${e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(false); } }}>
          <div class="cu-cm-hd">
            <${ListPicker} value=${listId} onChange=${(id) => { setListId(id); setErr(''); }}
              filter=${type === 'post' ? (l => l.kind === 'content') : null}/>
            ${v2 && feature('templates') && type !== 'post' ? (template
              ? h`<span class="cu-tpl-chip" title=${isKit ? 'Creates every task in this kit' : 'Adds the template’s subtasks and checklists to the new task'}>
                  <i class=${'ti ' + (isKit ? 'ti-stack-2' : 'ti-template')} aria-hidden="true"></i><span>${template.name}</span>
                  <button type="button" class="cu-wa-x" aria-label="Remove template" onClick=${() => setTemplate(null)}><i class="ti ti-x"></i></button>
                </span>`
              : h`<${TemplatePicker} onPick=${pickTemplate} className="cu-trig" label="From template"
                  anchorContent=${h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--cu-t2)' }}><i class="ti ti-template"></i><span class="cu-hide-xs">From template</span></span>`}/>`) : null}
            <span style=${{ flex: 1 }}></span>
            <button type="button" class="cu-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="cu-cm-body">
            <input ref=${titleRef} class="cu-cm-title" value=${title} placeholder=${isKit ? 'Name prefix (optional)' : type === 'post' ? 'Post name' : 'Task name'} aria-label=${isKit ? 'Name prefix' : 'Task name'}
              onInput=${e => { setTitle(e.target.value); if (err) setErr(''); }}
              onKeyDown=${e => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); submit(false); } }}/>
            <textarea class="cu-cm-desc" value=${desc} placeholder="Add description" aria-label="Description" rows=${3}
              onInput=${e => { setDesc(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(260, e.target.scrollHeight) + 'px'; }}></textarea>

            ${type === 'post' ? h`<div style=${{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0' }}>
              <span style=${{ fontSize: 12, color: 'var(--cu-t2)' }}>Post type</span>
              <div class="cu-seg" role="radiogroup" aria-label="Post sub-type">
                ${POST_TYPES.map(p => h`<button key=${p.key} type="button" role="radio" aria-checked=${postType === p.key} class=${postType === p.key ? 'on' : ''} onClick=${() => { setPostType(p.key); setErr(''); }}>
                  <i class=${'ti ' + p.icon} style=${{ marginRight: 4 }}></i>${p.label}</button>`)}
              </div>
            </div>` : null}

            <div class="cu-cm-chips">
              ${!isKit ? h`<${TypePicker} value=${type} className="cu-trig" onChange=${k => { setType(k); setErr(''); }}/>` : null}
              ${!isKit ? h`<${StatusPicker} listId=${listId} value=${status || (statusOpts[0] && statusOpts[0].key)} onChange=${setStatus} size="md"/>` : null}
              <${AssigneePicker} value=${assignees} onChange=${setAssignees} multi=${feature('multiple_assignees')}
                anchorContent=${assigneeMembers.length ? h`<${AssigneeStack} assignees=${assigneeMembers} size=${22}/>` : h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--cu-t2)' }}><i class="ti ti-user-plus"></i>Assignee</span>`}/>
              <${DatePicker} value=${due} label=${isKit ? 'Start from' : 'Due date'} placeholder=${isKit ? 'Start from' : 'Due date'} withTime=${!isKit} hasTime=${dueHasTime}
                onChange=${(iso, o) => { setDue(iso); setDueHasTime(!!(o && o.hasTime)); }}/>
              ${!isKit && feature('priorities') ? h`<${PriorityPicker} value=${priority} onChange=${v => { setPriority(v); if (!waTouched) setWaPreset(p => (v === 1 ? (p || 'every2h') : null)); }}/>` : null}
              ${!isKit && feature('tags') ? h`<${TagPicker} value=${tagIds} onChange=${setTagIds} showToast=${showToast}/>` : null}
              ${!isKit && feature('recurring') && type !== 'post' ? h`<${RecurrencePicker} value=${recurrence} dueAt=${due} advanced=${v2} onChange=${setRecurrence}/>` : null}
              ${!isKit && v2 ? (reminder
                ? h`<span class="cu-rem" style=${{ height: 30, borderRadius: 15 }} title=${fmtDateTimeUser(reminder.remind_at) + (reminder.note ? ' — ' + reminder.note : '')}>
                    <i class="ti ti-bell" aria-hidden="true"></i><span>${'Remind ' + fmtDue(reminder.remind_at, true).text}</span>
                    <button type="button" class="cu-wa-x" aria-label="Remove reminder" onClick=${() => setReminder(null)}><i class="ti ti-x"></i></button>
                  </span>`
                : h`<${ReminderPicker} className="cu-trig" dueAt=${due} showToast=${showToast} onPick=${setReminder} label="Remind me"
                    anchorContent=${h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--cu-t2)' }}><i class="ti ti-bell"></i>Remind me</span>`}/>`) : null}
              ${aiAvailable && !ai.items ? h`<button type="button" class="cu-trig" disabled=${ai.busy} onClick=${splitWithAi} title="Break this task into subtasks with AI">
                <i class=${'ti ' + (ai.busy ? 'ti-loader-2 cu-spin' : 'ti-sparkles')} style=${{ color: 'var(--cu-accent-ink)', fontSize: 15 }}></i>Split with AI
              </button>` : null}
              ${!isKit ? h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', minWidth: 0, flexWrap: 'wrap' }}>
                <button type="button" class=${'cu-trig cu-wa-tog' + (waPreset ? ' on' : '')} aria-pressed=${!!waPreset}
                  title="Remind the assignees on WhatsApp until it's done"
                  onClick=${() => { setWaTouched(true); setWaPreset(p => (p ? null : (priority === 1 ? 'every2h' : 'tomorrow10'))); }}>
                  <i class="ti ti-brand-whatsapp" style=${{ color: WA_GREEN, fontSize: 15 }}></i>WhatsApp follow-up
                </button>
                ${waPreset ? h`<select class="cu-wa-sel" aria-label="WhatsApp follow-up schedule" value=${waPreset}
                  onChange=${e => { setWaTouched(true); setWaPreset(e.target.value); }}>
                  ${FOLLOWUP_PRESETS.map(p => { const b = presetBlock(p, due); return h`<option key=${p.key} value=${p.key} disabled=${!!b && p.key !== waPreset}>${p.label + (b ? ' — ' + b : '')}</option>`; })}
                </select>` : null}
              </span>` : null}
            </div>
            ${clientId ? h`<div style=${{ fontSize: 12, color: 'var(--cu-t3)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>Space <${ClientBadge} clientId=${clientId}/></div>` : null}
            ${isKit ? h`<div class="cu-wa-hint" style=${{ marginTop: 8 }}>${'Creates every task in “' + template.name + '”' + (Number(template.item_count) ? ' (' + template.item_count + ' items)' : '') + ' in the chosen list, with dates counted from the start date (today if blank).'}</div>` : null}
            ${ai.items || ai.error ? h`<div class="cu-ai" aria-live="polite">
              <div class="cu-ai-hd">
                <i class="ti ti-sparkles" style=${{ color: 'var(--cu-accent-ink)' }} aria-hidden="true"></i>
                <span style=${{ flex: 1, minWidth: 0 }}>${ai.items ? 'Subtasks from AI · ' + aiPicked.length + ' of ' + ai.items.length + ' selected' : 'Split with AI'}</span>
                <button type="button" class="cu-btn cu-btn-ghost" style=${{ height: 24, fontSize: 12 }} onClick=${() => setAi({ busy: false, items: null, error: '' })}>Discard</button>
                <button type="button" class="cu-btn" style=${{ height: 24, fontSize: 12 }} disabled=${ai.busy || (!title.trim() && !desc.trim())} onClick=${splitWithAi}>
                  ${ai.busy ? h`<i class="ti ti-loader-2 cu-spin"></i>` : h`<i class="ti ti-refresh"></i>`}${ai.items ? 'Regenerate' : 'Try again'}
                </button>
              </div>
              ${ai.error ? h`<div class="cu-ai-row"><span class="cu-err" role="alert">${ai.error}</span></div>` : null}
              ${arr(ai.items).map((x, i) => {
                const m = x.assignee_id ? store.memberById[x.assignee_id] : null;
                return h`<div key=${i} class=${'cu-ai-row' + (x.include ? '' : ' off')}>
                  <button type="button" class=${'cu-cbx' + (x.include ? ' on' : '')} role="checkbox" aria-checked=${!!x.include} aria-label=${'Include ' + (x.title || 'subtask')}
                    onClick=${() => setAiItem(i, { include: !x.include })}>${x.include ? h`<i class="ti ti-check" style=${{ fontSize: 12 }}></i>` : null}</button>
                  <input class="t" value=${x.title} aria-label="Subtask name" onInput=${e => setAiItem(i, { title: e.target.value })}/>
                  ${x.priority ? h`<${PriorityFlag} value=${x.priority}/>` : null}
                  ${x.estimate_minutes ? h`<span class="cu-roll">${fmtMinutes(x.estimate_minutes)}</span>` : null}
                  ${m ? h`<${MemberAvatar} member=${m} size=${20}/>` : null}
                  <button type="button" class="cu-ibtn" style=${{ width: 22, height: 22 }} aria-label=${'Remove ' + (x.title || 'subtask')}
                    onClick=${() => setAi(a => ({ ...a, items: arr(a.items).filter((_, j) => j !== i) }))}><i class="ti ti-x" style=${{ fontSize: 13 }}></i></button>
                </div>`;
              })}
            </div>` : null}
          </div>
          <div class="cu-cm-foot">
            ${err || (postProblem && type === 'post' && postType) ? h`<span class="cu-err" role="alert">${err || postProblem}</span>` : h`<span style=${{ fontSize: 12, color: 'var(--cu-t3)' }} class="cu-hide-xs">⌘/Ctrl + Enter to create</span>`}
            <span style=${{ flex: 1 }}></span>
            <button type="button" class="cu-btn" disabled=${busy} onClick=${() => submit(true)}>Create & open</button>
            <button type="button" class="cu-btn cu-btn-pri" disabled=${busy || (!title.trim() && !isKit)} onClick=${() => submit(false)}>
              ${busy ? h`<i class="ti ti-loader-2 cu-spin"></i>` : null}${isKit ? 'Create from template' : type === 'post' ? 'Create post' : aiPicked.length ? 'Create with ' + aiPicked.length + ' subtasks' : 'Create task'}
            </button>
          </div>
        </div>
      </div>`;
    }

    return {
      // data
      TaskAPI, taskBus, TaskStoreProvider, useTaskStore, useTasks,
      // constants / helpers
      PRIORITIES, TYPE_META, POST_TYPES, isOverdue, isDone, fmtDue, fmtMinutes, parseMinutes,
      openTask, openCreateTask, openPostEditor, taskLink, copyText,
      // atoms
      Popover, Menu, PickerList, StatusPill, StatusPicker, StatusIcon, PriorityFlag, PriorityPicker,
      AssigneeStack, AssigneePicker, DueChip, DatePicker, TagChips, TagPicker, ClientBadge, TypeIcon,
      TypePicker, ListPicker, MemberAvatar, InlineTitle, EmptyState, SectionCard,
      // surfaces
      TaskPanel, CreateTaskModal,
      // WhatsApp (089)
      FOLLOWUP_PRESETS, WhatsAppFollowups, WhatsAppNudge, waErrorText: waErr,
      // v2 atoms (contract v2 §4 B)
      ConfirmDialog, RecurrencePicker, ReminderPicker, TemplatePicker, TaskSearchPicker,
      TaskSearchList, TemplateList, RecurrenceEditor, StatusTimeline, ExtBoundary, useLayer,
      // v2 helpers
      fmtDateUser, fmtTimeUser, fmtDateTimeUser, fmtSpanMs, ymdLocal, recurrenceLabel, cleanRecurrence,
      printTask, isMissingRpc, extItems, extKey, tiIcon,
      DEFAULT_FEATURES, DEFAULT_PREFS,
      featureOn: (k) => CUR.features[k] !== false,
      userPrefs: () => ({ ...CUR.prefs }),
    };
  }

  window.AMS_TASKS = { buildTasks };
})();

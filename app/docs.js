/* ============================================================================
 * docs.js — Docs & wiki (ClickUp parity v2, workstream G)
 *
 *   window.AMS_DOCS.buildDocs(deps) → { DocsPage, DocEditor, ClientDocTab,
 *     PublicDocPage, DocViewRenderer, RecentDocsCard, DocAPI, openDoc, … }
 *
 * Nested page tree (per client or agency), block editor with a `/` menu,
 * markdown shortcuts, inline formatting, mentions, live task lists, embeds,
 * images/files (bucket doc-files), tables, columns, TOC, toggles, callouts,
 * templates, sharing, version history + restore, meeting notes with action
 * items → tasks, autosave with version-number conflict detection.
 *
 * Server: migrations/097_docs.sql (doc_* RPCs). Contract: docs/clickup-parity-v2-contract.md §4 G.
 * Notes: docs/parity-v2/notes-G.md
 *
 * Security: block bodies are stored as JSON and rendered through htm / DOM
 * text nodes — never innerHTML. Every URL goes through safeUrl() (http/https/
 * mailto/tel only), links get rel="noopener noreferrer", embeds are limited to
 * a provider allow-list plus sandboxed https iframes.
 * ==========================================================================*/
(function () {
  function buildDocs(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo,
            rpcCall, supabase, Av, Skel, fmtRelative } = deps;
    const useLayoutEffect = React.useLayoutEffect || useEffect;
    const Fragment = React.Fragment;

    // ---- deps that other workstreams provide (all optional → fail open) -----
    const TaskAPI = deps.TaskAPI || null;
    const taskBus = deps.taskBus || null;
    const useTaskStore = deps.useTaskStore || (() => ({}));
    const Popover = deps.Popover;
    const Menu = deps.Menu;
    const PickerList = deps.PickerList;
    const MemberAvatar = deps.MemberAvatar;
    const CardShell = deps.CardShell;
    const openTask = deps.openTask || (() => {});
    const isMissingRpc = deps.isMissingRpc || ((e) =>
      /PGRST202|could not find the function|does not exist|404/i.test(String((e && (e.code || '')) + ' ' + (e && (e.message || e.details || '') || ''))));
    const fmtDateUser = deps.fmtDateUser || ((iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
    });

    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key || item.type;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item);
    };
    const extList = (key) => (window.AMS_EXT && window.AMS_EXT[key]) || [];

    const arr = (x) => Array.isArray(x) ? x : [];
    const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
                       : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4));
    const errMsg = (e) => {
      if (!e) return 'Something went wrong';
      if (e.code === 'forbidden') return 'You do not have access to do that';
      const m = String(e.message || e.details || e);
      if (/not_found/.test(m)) return 'That doc no longer exists';
      if (/doc_too_large/.test(m)) return 'This doc is too large to save — split it into subpages';
      if (/sys_doc/.test(m)) return 'This is a system doc and cannot be changed that way';
      if (/auth\.forbidden|forbidden/.test(m)) return 'You do not have access to do that';
      return m.replace(/^.*?:\s*/, '') || 'Something went wrong';
    };

    // =========================================================================
    // Styles
    // =========================================================================
    if (!document.getElementById('ams-docs-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-docs-styles';
      st.textContent = `
      .dx-root{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--cu-t1);font-size:14px}
      .dx-root *,.dx-pop *{box-sizing:border-box}
      .dx-wrap{display:flex;height:100%;min-height:0;background:var(--cu-bg)}
      .dx-side{width:252px;flex:0 0 252px;border-right:1px solid var(--cu-bd);background:var(--cu-bg2);display:flex;flex-direction:column;min-height:0}
      .dx-side-hd{padding:10px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid var(--cu-bd)}
      .dx-main{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;background:var(--cu-bg)}
      .dx-scroll{flex:1;overflow:auto;min-height:0}
      .dx-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:var(--cu-radius-sm,6px);border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t1);font:600 13px/1 inherit;font-family:inherit;cursor:pointer;white-space:nowrap}
      .dx-btn:hover{background:var(--cu-bg3)}
      .dx-btn:disabled{opacity:.5;cursor:not-allowed}
      .dx-btn-pri{background:var(--cu-accent);border-color:var(--cu-accent);color:#fff}
      .dx-btn-pri:hover{background:#e600d6;border-color:#e600d6}
      .dx-btn-sm{height:26px;padding:0 9px;font-size:12px}
      .dx-ibtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:var(--cu-t2);cursor:pointer;font-size:16px;flex-shrink:0;padding:0}
      .dx-ibtn:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .dx-ibtn.on{color:var(--cu-accent-ink)}
      .dx-input{width:100%;height:30px;padding:0 10px;border:1px solid var(--cu-bd2);border-radius:6px;background:var(--cu-bg);color:var(--cu-t1);font:400 13px inherit;font-family:inherit}
      .dx-input:focus{outline:none;border-color:var(--cu-accent)}
      .dx-root button:focus-visible,.dx-root input:focus-visible,.dx-root a:focus-visible,.dx-pop button:focus-visible,.dx-rt:focus-visible{outline:2px solid var(--cu-accent);outline-offset:1px}
      .dx-muted{color:var(--cu-t3)}
      .dx-search{position:relative}
      .dx-search i{position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--cu-t3);pointer-events:none}
      .dx-search input{padding-left:28px}

      /* ---- sidebar tree ---- */
      .dx-nav{padding:6px;display:flex;flex-direction:column;gap:1px}
      .dx-navi{display:flex;align-items:center;gap:8px;height:30px;padding:0 8px;border-radius:6px;border:none;background:transparent;color:var(--cu-t2);font:500 13px inherit;font-family:inherit;cursor:pointer;width:100%;text-align:left}
      .dx-navi:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .dx-navi.on{background:var(--cu-accent-fog);color:var(--cu-accent-ink);font-weight:600}
      .dx-navi i{font-size:15px;width:16px;text-align:center;flex-shrink:0}
      .dx-navi .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dx-navi .ct{font-size:11px;color:var(--cu-t3)}
      .dx-grp{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3);padding:12px 10px 4px;display:flex;align-items:center;gap:6px}
      .dx-grp .sp{flex:1}
      .dx-tree{padding:2px 6px 16px;display:flex;flex-direction:column;gap:1px}
      .dx-tr{display:flex;align-items:center;gap:2px;border-radius:6px;position:relative}
      .dx-tr:hover{background:var(--cu-bg3)}
      .dx-tr.on{background:var(--cu-accent-fog)}
      .dx-tr.on .dx-tr-t{color:var(--cu-accent-ink);font-weight:600}
      .dx-tr-c{width:18px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--cu-t3);cursor:pointer;font-size:13px;padding:0;flex-shrink:0}
      .dx-tr-b{flex:1;min-width:0;display:flex;align-items:center;gap:7px;height:28px;padding:0 4px;border:none;background:transparent;color:var(--cu-t1);font:400 13px inherit;font-family:inherit;cursor:pointer;text-align:left}
      .dx-tr-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dx-tr-ic{font-size:14px;width:16px;text-align:center;flex-shrink:0;color:var(--cu-t2)}
      .dx-tr-a{opacity:0;display:flex;gap:1px;padding-right:3px}
      .dx-tr:hover .dx-tr-a,.dx-tr:focus-within .dx-tr-a{opacity:1}
      .dx-tr-a .dx-ibtn{width:22px;height:22px;font-size:14px}
      .dx-tr.drop-in{box-shadow:inset 0 0 0 2px var(--cu-accent)}
      .dx-tr.drop-above{box-shadow:inset 0 2px 0 var(--cu-accent)}
      .dx-tr.drop-below{box-shadow:inset 0 -2px 0 var(--cu-accent)}

      /* ---- hub list ---- */
      .dx-hub{padding:20px 24px 60px;max-width:1180px}
      .dx-h1{font:600 21px/1.25 inherit;font-family:inherit;color:var(--cu-t1);margin:0}
      .dx-sub{font-size:12.5px;color:var(--cu-t3);margin-top:3px}
      .dx-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 10px}
      .dx-chips{display:flex;gap:6px;flex-wrap:wrap}
      .dx-chip{height:26px;padding:0 10px;border-radius:13px;border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t2);font:500 12px inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
      .dx-chip.on{background:var(--cu-accent-fog);border-color:var(--cu-accent);color:var(--cu-accent-ink)}
      .dx-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin-bottom:18px}
      .dx-card{border:1px solid var(--cu-bd);border-radius:var(--cu-radius,8px);background:var(--cu-bg);padding:12px;cursor:pointer;text-align:left;font-family:inherit;display:flex;flex-direction:column;gap:6px;min-height:92px}
      .dx-card:hover{border-color:var(--cu-bd2);background:var(--cu-bg2)}
      .dx-card-t{font:600 13.5px/1.35 inherit;font-family:inherit;color:var(--cu-t1);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .dx-card-s{font-size:11.5px;color:var(--cu-t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dx-tbl{width:100%;border-collapse:collapse;font-size:13px}
      .dx-tbl th{text-align:left;font:600 11px/1 inherit;font-family:inherit;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3);padding:8px 10px;border-bottom:1px solid var(--cu-bd);background:var(--cu-bg2);position:sticky;top:0;z-index:1}
      .dx-tbl td{padding:7px 10px;border-bottom:1px solid var(--cu-bd);vertical-align:middle}
      .dx-tbl tr:hover td{background:var(--cu-bg2)}
      .dx-tbl .nm{display:flex;align-items:center;gap:8px;min-width:0}
      .dx-tbl .nm button{border:none;background:transparent;padding:0;font:600 13px inherit;font-family:inherit;color:var(--cu-t1);cursor:pointer;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px}
      .dx-tbl .nm button:hover{color:var(--cu-accent-ink)}
      .dx-tag{display:inline-flex;align-items:center;height:19px;padding:0 7px;border-radius:10px;background:var(--cu-bg3);color:var(--cu-t2);font-size:11px;font-weight:600;white-space:nowrap}
      .dx-bulk{position:sticky;bottom:12px;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:var(--cu-t1);color:var(--cu-bg);box-shadow:var(--cu-shadow);margin-top:12px;flex-wrap:wrap}
      .dx-bulk button{height:26px;padding:0 10px;border-radius:6px;border:1px solid rgba(255,255,255,.28);background:transparent;color:inherit;font:600 12px inherit;font-family:inherit;cursor:pointer}
      .dx-bulk button:hover{background:rgba(255,255,255,.16)}

      /* ---- editor chrome ---- */
      .dx-top{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--cu-bd);background:var(--cu-bg);min-height:46px;flex-wrap:wrap}
      .dx-crumbs{display:flex;align-items:center;gap:4px;font-size:12.5px;color:var(--cu-t3);min-width:0;flex:1;overflow:hidden}
      .dx-crumbs button{border:none;background:transparent;color:var(--cu-t2);font:inherit;cursor:pointer;padding:2px 4px;border-radius:4px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dx-crumbs button:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .dx-save{font-size:11.5px;color:var(--cu-t3);display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
      .dx-page{max-width:820px;margin:0 auto;padding:26px 30px 240px}
      .dx-page.narrow{padding:16px 14px 180px}
      .dx-title{width:100%;border:none;background:transparent;color:var(--cu-t1);font:700 32px/1.25 inherit;font-family:inherit;padding:2px 0;outline:none;resize:none;overflow:hidden}
      .dx-title::placeholder{color:var(--cu-t3)}
      .dx-metabar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0 4px;padding:9px 12px;border:1px solid var(--cu-bd);border-radius:8px;background:var(--cu-bg2);font-size:12.5px}
      .dx-metabar .lb{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3)}
      .dx-banner{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;font-size:13px;margin:10px 0;flex-wrap:wrap}
      .dx-banner.warn{background:rgba(245,166,35,.12);color:#8a5a00;border:1px solid rgba(245,166,35,.4)}
      html.dark .dx-banner.warn{color:#f5c26b}
      .dx-banner.info{background:var(--cu-bg2);border:1px solid var(--cu-bd);color:var(--cu-t2)}

      /* ---- blocks ---- */
      .dx-blocks{display:flex;flex-direction:column;gap:1px;margin-top:8px}
      .dx-blk{position:relative;display:flex;align-items:flex-start;gap:3px;border-radius:5px}
      .dx-blk.dragover-top{box-shadow:inset 0 2px 0 var(--cu-accent)}
      .dx-blk.dragover-bottom{box-shadow:inset 0 -2px 0 var(--cu-accent)}
      .dx-gut{display:flex;align-items:center;gap:1px;flex:0 0 auto;width:44px;justify-content:flex-end;padding-top:4px;opacity:0;transition:opacity .12s}
      .dx-blk:hover>.dx-gut,.dx-blk:focus-within>.dx-gut{opacity:1}
      .dx-gut .dx-ibtn{width:22px;height:22px;font-size:15px;color:var(--cu-t3)}
      .dx-gut .dx-ibtn:hover{color:var(--cu-t1)}
      .dx-body{flex:1;min-width:0}
      .dx-rt{outline:none;white-space:pre-wrap;word-break:break-word;padding:3px 3px;border-radius:4px;min-height:1.55em;line-height:1.6}
      .dx-rt[data-ph]:empty:before,.dx-rt[data-ph][data-empty="1"]:before{content:attr(data-ph);color:var(--cu-t3);pointer-events:none}
      .dx-b-h1 .dx-rt{font:700 27px/1.3 inherit;font-family:inherit;padding-top:16px}
      .dx-b-h2 .dx-rt{font:700 21px/1.3 inherit;font-family:inherit;padding-top:12px}
      .dx-b-h3 .dx-rt{font:600 17px/1.35 inherit;font-family:inherit;padding-top:8px}
      .dx-b-h4 .dx-rt{font:600 15px/1.4 inherit;font-family:inherit;padding-top:6px}
      .dx-b-quote .dx-body{border-left:3px solid var(--cu-bd2);padding-left:12px;color:var(--cu-t2)}
      .dx-b-code .dx-body{background:var(--cu-bg2);border:1px solid var(--cu-bd);border-radius:8px;padding:8px 10px}
      .dx-b-code .dx-rt{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.6}
      .dx-li{display:flex;align-items:flex-start;gap:8px}
      .dx-li-m{flex:0 0 auto;min-width:18px;text-align:right;color:var(--cu-t2);font-size:14px;line-height:1.7;user-select:none}
      .dx-li-m.dot{font-size:17px;line-height:1.5}
      .dx-cb{width:16px;height:16px;margin-top:5px;flex-shrink:0;accent-color:var(--cu-accent);cursor:pointer}
      .dx-todo-done .dx-rt{color:var(--cu-t3);text-decoration:line-through}
      .dx-tog-h{display:flex;align-items:flex-start;gap:4px}
      .dx-tog-c{width:20px;height:26px;border:none;background:transparent;color:var(--cu-t2);cursor:pointer;font-size:13px;flex-shrink:0;padding:0}
      .dx-tog-kids{margin-left:22px;border-left:1px solid var(--cu-bd);padding-left:10px}
      .dx-callout{display:flex;gap:10px;padding:11px 13px;border-radius:8px;border:1px solid}
      .dx-callout .em{font-size:16px;line-height:1.4}
      .dx-co-info{background:rgba(76,141,246,.1);border-color:rgba(76,141,246,.35)}
      .dx-co-warn{background:rgba(245,166,35,.12);border-color:rgba(245,166,35,.4)}
      .dx-co-success{background:rgba(48,164,108,.12);border-color:rgba(48,164,108,.35)}
      .dx-co-danger{background:rgba(229,72,77,.1);border-color:rgba(229,72,77,.35)}
      .dx-co-brand{background:var(--cu-accent-fog);border-color:rgba(255,0,238,.32)}
      .dx-div{height:1px;background:var(--cu-bd);margin:10px 0}
      .dx-cols{display:flex;gap:16px;align-items:flex-start}
      .dx-col{flex:1;min-width:0}
      @media(max-width:640px){.dx-cols{flex-direction:column;gap:2px}}
      .dx-tw{overflow-x:auto;border:1px solid var(--cu-bd);border-radius:8px;margin:4px 0}
      .dx-table{border-collapse:collapse;width:100%;min-width:420px;font-size:13.5px}
      .dx-table td,.dx-table th{border:1px solid var(--cu-bd);padding:0;vertical-align:top;min-width:90px}
      .dx-table th{background:var(--cu-bg2)}
      .dx-table .dx-rt{padding:6px 8px}
      .dx-tbtn{height:22px;padding:0 8px;border-radius:5px;border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t2);font:600 11px inherit;font-family:inherit;cursor:pointer;margin:6px 6px 0 0}
      .dx-toc{border:1px solid var(--cu-bd);border-radius:8px;padding:10px 12px;background:var(--cu-bg2)}
      .dx-toc.sticky{position:sticky;top:8px;z-index:2}
      .dx-toc a{display:block;color:var(--cu-t2);text-decoration:none;font-size:13px;padding:3px 0;border-radius:4px}
      .dx-toc a:hover{color:var(--cu-accent-ink)}
      .dx-embed{border:1px solid var(--cu-bd);border-radius:8px;overflow:hidden;background:var(--cu-bg2)}
      .dx-embed iframe{display:block;width:100%;border:0;background:var(--cu-bg)}
      .dx-linkcard{display:flex;align-items:center;gap:10px;padding:11px 13px;border:1px solid var(--cu-bd);border-radius:8px;background:var(--cu-bg2);color:var(--cu-t1);text-decoration:none}
      .dx-linkcard:hover{border-color:var(--cu-bd2)}
      .dx-img{max-width:100%;border-radius:8px;display:block}
      .dx-file{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--cu-bd);border-radius:8px;background:var(--cu-bg2);text-decoration:none;color:var(--cu-t1)}
      .dx-cap{font-size:12px;color:var(--cu-t3);margin-top:4px;text-align:center}
      .dx-btnblk{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 16px;border-radius:7px;background:var(--cu-accent);color:#fff;font-weight:600;font-size:13.5px;text-decoration:none}
      .dx-tasks{border:1px solid var(--cu-bd);border-radius:8px;overflow:hidden}
      .dx-tasks-hd{display:flex;align-items:center;gap:8px;padding:8px 11px;background:var(--cu-bg2);border-bottom:1px solid var(--cu-bd);font-size:12px;font-weight:600;color:var(--cu-t2)}
      .dx-trow{display:flex;align-items:center;gap:9px;padding:7px 11px;border-bottom:1px solid var(--cu-bd);cursor:pointer;font-size:13px;background:transparent;border-left:none;border-right:none;border-top:none;width:100%;font-family:inherit;text-align:left;color:var(--cu-t1)}
      .dx-trow:last-child{border-bottom:none}
      .dx-trow:hover{background:var(--cu-bg2)}
      .dx-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
      .dx-mention{background:var(--cu-bg3);border-radius:4px;padding:0 4px;font-weight:600;color:var(--cu-accent-ink);cursor:pointer;white-space:nowrap}
      .dx-mention-task{color:#4c8df6}
      .dx-mention-doc{color:#30a46c}
      .dx-link{color:var(--cu-accent-ink);text-decoration:underline;text-underline-offset:2px}
      .dx-rt code,.dx-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:var(--cu-bg3);border-radius:4px;padding:1px 4px}
      .dx-c-gray{color:#6b7280}.dx-c-brown{color:#92400e}.dx-c-orange{color:#c2410c}.dx-c-yellow{color:#a16207}
      .dx-c-green{color:#15803d}.dx-c-blue{color:#1d4ed8}.dx-c-purple{color:#6d28d9}.dx-c-pink{color:#a8009c}.dx-c-red{color:#dc2626}
      html.dark .dx-c-gray{color:#9ca3af}html.dark .dx-c-brown{color:#d3a06a}html.dark .dx-c-orange{color:#fb923c}html.dark .dx-c-yellow{color:#fcd34d}
      html.dark .dx-c-green{color:#4ade80}html.dark .dx-c-blue{color:#93b4fb}html.dark .dx-c-purple{color:#c4b5fd}html.dark .dx-c-pink{color:#ff7df6}html.dark .dx-c-red{color:#fca5a5}
      .dx-bg-gray{background:rgba(107,114,128,.18)}.dx-bg-brown{background:rgba(146,64,14,.18)}.dx-bg-orange{background:rgba(194,65,12,.18)}
      .dx-bg-yellow{background:rgba(250,204,21,.32)}.dx-bg-green{background:rgba(21,128,61,.18)}.dx-bg-blue{background:rgba(29,78,216,.18)}
      .dx-bg-purple{background:rgba(109,40,217,.18)}.dx-bg-pink{background:rgba(255,0,238,.16)}.dx-bg-red{background:rgba(220,38,38,.18)}

      /* ---- floating UI ---- */
      .dx-pop{position:fixed;z-index:1300;background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius,8px);box-shadow:var(--cu-shadow);font-size:13px;overflow:hidden}
      .dx-mm{max-height:330px;overflow:auto;min-width:264px;padding:5px}
      .dx-mi{display:flex;align-items:center;gap:10px;width:100%;padding:7px 9px;border:none;border-radius:6px;background:transparent;color:var(--cu-t1);font:400 13px inherit;font-family:inherit;cursor:pointer;text-align:left}
      .dx-mi:hover,.dx-mi.act{background:var(--cu-bg3)}
      .dx-mi i{font-size:16px;color:var(--cu-t2);width:18px;text-align:center;flex-shrink:0}
      .dx-mi .sub{display:block;font-size:11.5px;color:var(--cu-t3);margin-top:1px}
      .dx-mgrp{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--cu-t3);padding:8px 9px 3px}
      .dx-fmt{display:flex;align-items:center;gap:1px;padding:4px}
      .dx-fmt button{width:30px;height:28px;border:none;border-radius:5px;background:transparent;color:var(--cu-t1);cursor:pointer;font-size:14px;font-family:inherit}
      .dx-fmt button:hover{background:var(--cu-bg3)}
      .dx-fmt button.on{background:var(--cu-accent-fog);color:var(--cu-accent-ink)}
      .dx-fmt .sep{width:1px;height:18px;background:var(--cu-bd);margin:0 3px}
      .dx-swatch{width:24px;height:24px;border-radius:5px;border:1px solid var(--cu-bd);cursor:pointer;font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;background:var(--cu-bg)}

      /* ---- modal ---- */
      .dx-modal-bg{position:fixed;inset:0;background:rgba(15,15,20,.45);z-index:1400;display:flex;align-items:center;justify-content:center;padding:16px}
      .dx-modal{background:var(--cu-bg);border-radius:12px;width:100%;max-width:560px;max-height:88vh;display:flex;flex-direction:column;box-shadow:var(--cu-shadow);overflow:hidden}
      .dx-modal.wide{max-width:760px}
      .dx-mh{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--cu-bd)}
      .dx-mh .t{flex:1;font:600 15px inherit;font-family:inherit}
      .dx-mb{padding:14px 16px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:12px}
      .dx-mf{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--cu-bd);background:var(--cu-bg2);flex-wrap:wrap}
      .dx-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3);margin-bottom:5px;display:block}
      .dx-ta{width:100%;border:1px solid var(--cu-bd2);border-radius:6px;background:var(--cu-bg);color:var(--cu-t1);font:400 13px/1.55 inherit;font-family:inherit;padding:8px 10px;resize:vertical}
      .dx-ta:focus{outline:none;border-color:var(--cu-accent)}
      .dx-row{display:flex;align-items:center;gap:9px;padding:7px 4px;border-bottom:1px solid var(--cu-bd)}
      .dx-row:last-child{border-bottom:none}
      .dx-empty{padding:40px 16px;text-align:center;color:var(--cu-t3)}
      .dx-empty i{font-size:30px;display:block;margin-bottom:8px;opacity:.6}
      .dx-spin{display:inline-block;animation:dx-rot 1s linear infinite}
      @keyframes dx-rot{to{transform:rotate(360deg)}}
      @media (prefers-reduced-motion: reduce){.dx-spin{animation:none}.dx-gut{transition:none}}
      @media(max-width:860px){
        .dx-side{position:absolute;z-index:20;height:100%;box-shadow:var(--cu-shadow)}
        .dx-side.hide{display:none}
        .dx-page{padding:18px 16px 200px}
        .dx-title{font-size:26px}
        .dx-hub{padding:16px 14px 60px}
        .dx-gut{opacity:1;width:26px}
      }
      @media print{.dx-side,.dx-top,.dx-gut,.dx-bulk{display:none!important}.dx-page{max-width:none;padding:0}}
      `;
      document.head.appendChild(st);
    }

    // =========================================================================
    // URL + embed safety
    // =========================================================================
    const SAFE_PROTO = ['http:', 'https:', 'mailto:', 'tel:'];
    function safeUrl(raw) {
      const s = String(raw || '').trim();
      if (!s) return null;
      if (/^#/.test(s)) return s.replace(/["'<>]/g, '');
      try {
        const u = new URL(/^[a-zA-Z][\w+.-]*:/.test(s) ? s : 'https://' + s);
        if (SAFE_PROTO.indexOf(u.protocol) < 0) return null;
        return u.href;
      } catch (_) { return null; }
    }
    const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; } };

    // Provider allow-list → iframe src. Anything else https renders in a sandboxed frame.
    function resolveEmbed(raw) {
      const url = safeUrl(raw);
      if (!url || !/^https:/.test(url)) return null;
      let u; try { u = new URL(url); } catch (_) { return null; }
      const host = u.hostname.replace(/^www\./, ''), path = u.pathname;
      const mk = (provider, src, ratio) => ({ provider, src, ratio: ratio || 0.5625, url });
      let m;
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        const id = u.searchParams.get('v') || (path.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/) || [])[1];
        if (id) return mk('YouTube', 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id));
      }
      if (host === 'youtu.be' && path.length > 1) return mk('YouTube', 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(path.slice(1)));
      if (host === 'vimeo.com' && (m = path.match(/^\/(\d+)/))) return mk('Vimeo', 'https://player.vimeo.com/video/' + m[1]);
      if (host === 'loom.com' && (m = path.match(/^\/(?:share|embed)\/([\w-]+)/))) return mk('Loom', 'https://www.loom.com/embed/' + m[1]);
      if (host === 'figma.com' && /^\/(file|design|proto|board)\//.test(path))
        return mk('Figma', 'https://www.figma.com/embed?embed_host=ams&url=' + encodeURIComponent(url), 0.62);
      if (host === 'miro.com' && (m = path.match(/^\/app\/board\/([\w=-]+)/)))
        return mk('Miro', 'https://miro.com/app/live-embed/' + m[1] + '/', 0.62);
      if (host === 'docs.google.com' && (m = path.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/)))
        return mk('Google ' + (m[1] === 'document' ? 'Docs' : m[1] === 'spreadsheets' ? 'Sheets' : 'Slides'),
                  'https://docs.google.com/' + m[1] + '/d/' + m[2] + (m[1] === 'presentation' ? '/embed' : '/preview'), 0.72);
      if (host === 'drive.google.com' && (m = path.match(/\/file\/d\/([\w-]+)/)))
        return mk('Google Drive', 'https://drive.google.com/file/d/' + m[1] + '/preview', 0.68);
      if (host === 'calendar.google.com' && /embed/.test(path)) return mk('Google Calendar', url, 0.75);
      if ((host === 'google.com' || host === 'maps.google.com') && /\/maps\/embed/.test(path)) return mk('Google Maps', url, 0.62);
      if (host === 'canva.com' && /\/design\//.test(path)) return mk('Canva', url.replace(/\?.*$/, '') + '?embed', 0.62);
      return mk('Link', url, 0.62);
    }
    const EMBED_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms';

    // =========================================================================
    // Rich text spans
    //   span = { t, m?: { b,i,u,s,code,link,color,bg } } | { mention: { kind,id,label } }
    // =========================================================================
    const MARKS = ['b', 'i', 'u', 's', 'code', 'link', 'color', 'bg'];
    const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
    const cleanMarks = (m) => {
      if (!m) return undefined;
      const o = {};
      MARKS.forEach(k => { if (m[k]) o[k] = m[k]; });
      return Object.keys(o).length ? o : undefined;
    };
    const sameMarks = (a, b) => { a = a || {}; b = b || {}; return MARKS.every(k => (a[k] || null) === (b[k] || null)); };
    const spanLen = (s) => s && s.mention ? String(s.mention.label || '').length : String((s && s.t) || '').length;
    const spansLen = (spans) => arr(spans).reduce((n, s) => n + spanLen(s), 0);
    const spansPlain = (spans) => arr(spans).map(s => s.mention ? String(s.mention.label || '') : String(s.t || '')).join('');
    function normSpans(spans) {
      const out = [];
      arr(spans).forEach(s => {
        if (s.mention) { if (s.mention.label) out.push({ mention: { kind: s.mention.kind, id: s.mention.id, label: String(s.mention.label) } }); return; }
        const t = String(s.t == null ? '' : s.t);
        if (!t) return;
        const m = cleanMarks(s.m);
        const prev = out[out.length - 1];
        if (prev && !prev.mention && sameMarks(prev.m, m)) prev.t += t;
        else out.push(m ? { t, m } : { t });
      });
      return out;
    }
    function spansSlice(spans, start, end) {
      const out = []; let pos = 0;
      arr(spans).forEach(s => {
        const len = spanLen(s), a = Math.max(start, pos), b = Math.min(end, pos + len);
        if (b > a) {
          if (s.mention) { if (a <= pos && b >= pos + len) out.push({ mention: Object.assign({}, s.mention) }); }
          else out.push({ t: String(s.t).slice(a - pos, b - pos), m: s.m ? Object.assign({}, s.m) : undefined });
        }
        pos += len;
      });
      return normSpans(out);
    }
    const spansConcat = (a, b) => normSpans(arr(a).concat(arr(b)));
    function spansMarkAt(spans, start, end, key) {
      let pos = 0, any = false, all = true, value = null;
      arr(spans).forEach(s => {
        const len = spanLen(s), a = Math.max(start, pos), b = Math.min(end, pos + len);
        if (b > a) { any = true; const v = (s.m || {})[key] || null; if (value === null) value = v; if (!v || v !== value) all = false; }
        pos += len;
      });
      return any && all ? (value || null) : null;
    }
    function spansToggleMark(spans, start, end, key, value) {
      if (end <= start) return arr(spans);
      const cur = spansMarkAt(spans, start, end, key);
      const next = (cur && (value === undefined || cur === value)) ? null : (value === undefined ? true : value);
      const out = []; let pos = 0;
      arr(spans).forEach(s => {
        const len = spanLen(s);
        const cuts = [pos, Math.max(pos, Math.min(pos + len, start)), Math.max(pos, Math.min(pos + len, end)), pos + len];
        for (let i = 0; i < 3; i++) {
          const a = cuts[i], b = cuts[i + 1];
          if (b <= a) continue;
          const inSel = a >= start && b <= end;
          if (s.mention) { out.push({ mention: Object.assign({}, s.mention) }); break; }
          const m = Object.assign({}, s.m || {});
          if (inSel) { if (next) m[key] = next; else delete m[key]; }
          out.push({ t: String(s.t).slice(a - pos, b - pos), m: cleanMarks(m) });
        }
        pos += len;
      });
      return normSpans(out);
    }
    const textSpans = (t) => t ? [{ t: String(t) }] : [];

    // ---- spans ⇄ DOM (no innerHTML anywhere) --------------------------------
    function spanToNode(sp) {
      if (sp.mention) {
        const el = document.createElement('span');
        el.className = 'dx-mention dx-mention-' + (sp.mention.kind || 'member');
        el.setAttribute('contenteditable', 'false');
        el.setAttribute('data-mkind', sp.mention.kind || 'member');
        el.setAttribute('data-mid', String(sp.mention.id || ''));
        el.textContent = String(sp.mention.label || '');
        return el;
      }
      let node = document.createTextNode(String(sp.t || ''));
      const m = sp.m || {};
      const wrap = (tag, cls, attrs) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (attrs) Object.keys(attrs).forEach(k => { if (attrs[k] != null) el.setAttribute(k, attrs[k]); });
        el.appendChild(node); node = el;
      };
      if (m.code) wrap('code', 'dx-code');
      if (m.b) wrap('strong');
      if (m.i) wrap('em');
      if (m.u) wrap('u');
      if (m.s) wrap('s');
      if (m.color || m.bg) {
        const cls = [m.color && COLORS.indexOf(m.color) >= 0 ? 'dx-c-' + m.color : '',
                     m.bg && COLORS.indexOf(m.bg) >= 0 ? 'dx-bg-' + m.bg : ''].filter(Boolean).join(' ');
        if (cls) wrap('span', cls);
      }
      if (m.link) {
        const href = safeUrl(m.link);
        if (href) wrap('a', 'dx-link', { href, target: '_blank', rel: 'noopener noreferrer' });
      }
      return node;
    }
    function renderSpansInto(el, spans) {
      while (el.firstChild) el.removeChild(el.firstChild);
      const list = normSpans(spans);
      list.forEach(sp => el.appendChild(spanToNode(sp)));
      el.setAttribute('data-empty', list.length ? '0' : '1');
    }
    function nodesToSpans(root) {
      const out = [];
      const walk = (node, marks) => {
        if (node.nodeType === 3) { out.push({ t: node.nodeValue, m: cleanMarks(marks) }); return; }
        if (node.nodeType !== 1) return;
        const tag = node.nodeName.toLowerCase();
        if (tag === 'br') { out.push({ t: '\n' }); return; }
        if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed') return;
        if (node.getAttribute && node.getAttribute('data-mkind')) {
          out.push({ mention: { kind: node.getAttribute('data-mkind'), id: node.getAttribute('data-mid'), label: node.textContent } });
          return;
        }
        const m = Object.assign({}, marks);
        if (tag === 'b' || tag === 'strong') m.b = true;
        if (tag === 'i' || tag === 'em') m.i = true;
        if (tag === 'u' || tag === 'ins') m.u = true;
        if (tag === 's' || tag === 'strike' || tag === 'del') m.s = true;
        if (tag === 'code' || tag === 'kbd' || tag === 'samp') m.code = true;
        if (tag === 'mark') m.bg = m.bg || 'yellow';
        if (tag === 'a') { const href = safeUrl(node.getAttribute('href')); if (href) m.link = href; }
        if (node.classList) {
          for (let i = 0; i < node.classList.length; i++) {
            const c = node.classList[i], mc = /^dx-c-(\w+)$/.exec(c), mb = /^dx-bg-(\w+)$/.exec(c);
            if (mc && COLORS.indexOf(mc[1]) >= 0) m.color = mc[1];
            if (mb && COLORS.indexOf(mb[1]) >= 0) m.bg = mb[1];
          }
        }
        const isBlock = /^(div|p|li|h[1-6]|blockquote|pre|tr|section|article)$/.test(tag);
        if (isBlock && out.length && !/\n$/.test(spansPlain(out))) out.push({ t: '\n' });
        for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i], m);
      };
      for (let i = 0; i < root.childNodes.length; i++) walk(root.childNodes[i], {});
      return normSpans(out);
    }

    // ---- caret helpers ------------------------------------------------------
    function caretOffset(el) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const r = sel.getRangeAt(0);
      if (!el.contains(r.startContainer)) return null;
      const pre = document.createRange();
      pre.selectNodeContents(el);
      pre.setEnd(r.startContainer, r.startOffset);
      return pre.toString().length;
    }
    function selectionRange(el) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const r = sel.getRangeAt(0);
      if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
      const pre = document.createRange();
      pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
      const start = pre.toString().length;
      pre.setEnd(r.endContainer, r.endOffset);
      return { start, end: pre.toString().length, collapsed: r.collapsed };
    }
    function setCaret(el, offset) {
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const total = (el.textContent || '').length;
      let target = Math.max(0, Math.min(offset == null ? total : offset, total));
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      let node = null, pos = 0, found = null, foundOff = 0;
      while ((node = walker.nextNode())) {
        const len = node.nodeValue.length;
        if (pos + len >= target) {
          const mention = node.parentElement && node.parentElement.closest ? node.parentElement.closest('[data-mkind]') : null;
          if (mention) {
            const r = document.createRange();
            r.setStartAfter(mention); r.collapse(true);
            sel.removeAllRanges(); sel.addRange(r);
            return;
          }
          found = node; foundOff = target - pos; break;
        }
        pos += len;
      }
      const r = document.createRange();
      if (found) { r.setStart(found, foundOff); r.collapse(true); }
      else { r.selectNodeContents(el); r.collapse(false); }
      sel.removeAllRanges(); sel.addRange(r);
    }
    function caretRect(el) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0).cloneRange();
        const rect = r.getBoundingClientRect();
        if (rect && (rect.top || rect.left)) return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width || 1, height: rect.height || 18 };
      }
      const b = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      return b ? { top: b.top, bottom: b.bottom, left: b.left, right: b.left + 1, width: 1, height: b.height } : { top: 100, bottom: 120, left: 100, right: 101, width: 1, height: 18 };
    }

    // =========================================================================
    // Blocks
    // =========================================================================
    const mkBlock = (type, text, props, children) => ({
      id: uid(), type: type || 'paragraph',
      text: normSpans(text || []),
      props: props || undefined,
      children: children || undefined
    });
    const TEXT_TYPES = ['paragraph', 'h1', 'h2', 'h3', 'h4', 'bullet', 'numbered', 'todo', 'toggle', 'quote', 'callout', 'code'];
    const isTextBlock = (b) => b && TEXT_TYPES.indexOf(b.type) >= 0;
    const LIST_TYPES = ['bullet', 'numbered', 'todo'];

    function mapBlocks(list, fn) {
      return arr(list).map(b => {
        const nb = fn(b);
        if (nb && nb.children) {
          const kids = mapBlocks(nb.children, fn);
          return kids === nb.children ? nb : Object.assign({}, nb, { children: kids });
        }
        return nb;
      });
    }
    const updateById = (list, id, fn) => mapBlocks(list, b => (b.id === id ? fn(b) : b));
    function findBlock(list, id) {
      for (const b of arr(list)) {
        if (b.id === id) return b;
        if (b.children) { const f = findBlock(b.children, id); if (f) return f; }
      }
      return null;
    }
    function removeById(list, id) {
      const out = [];
      arr(list).forEach(b => {
        if (b.id === id) return;
        out.push(b.children ? Object.assign({}, b, { children: removeById(b.children, id) }) : b);
      });
      return out;
    }
    function insertRelative(list, targetId, blocks, place) {
      const out = [];
      let done = false;
      arr(list).forEach(b => {
        const isTarget = b.id === targetId;
        if (isTarget && place === 'before') { out.push.apply(out, blocks); done = true; }
        const nb = b.children ? Object.assign({}, b, { children: insertRelative(b.children, targetId, blocks, place) }) : b;
        out.push(nb);
        if (isTarget && place !== 'before') { out.push.apply(out, blocks); done = true; }
      });
      return out;
    }
    function insertInside(list, parentId, blocks) {
      return mapBlocks(list, b => b.id === parentId
        ? Object.assign({}, b, { children: arr(b.children).concat(blocks) })
        : b);
    }
    // depth-first order of text blocks (for arrow navigation / merging)
    function flatBlocks(list, out) {
      out = out || [];
      arr(list).forEach(b => { out.push(b); if (b.children) flatBlocks(b.children, out); });
      return out;
    }
    const flatTextIds = (list) => flatBlocks(list).filter(isTextBlock).map(b => b.id);

    function moveBlock(list, dragId, targetId, place) {
      if (dragId === targetId) return list;
      const dragged = findBlock(list, dragId);
      if (!dragged) return list;
      if (findBlock(dragged.children || [], targetId)) return list;   // no dropping into own subtree
      const without = removeById(list, dragId);
      return insertRelative(without, targetId, [dragged], place);
    }

    const blockPlain = (b) => spansPlain(b && b.text);
    function blocksPlain(list) {
      return flatBlocks(list).map(b => {
        const t = blockPlain(b);
        if (b.type === 'table') {
          return arr(b.props && b.props.rows).map(r => arr(r).map(c => spansPlain(c)).join(' | ')).join('\n');
        }
        return t;
      }).filter(Boolean).join('\n');
    }

    // ---- markdown ⇄ blocks --------------------------------------------------
    function parseInlineMarkdown(text) {
      const out = [];
      const s = String(text || '');
      const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|~~(.+?)~~|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/;
      let rest = s, guard = 0;
      while (rest && guard++ < 400) {
        const m = re.exec(rest);
        if (!m) { out.push({ t: rest }); break; }
        if (m.index > 0) out.push({ t: rest.slice(0, m.index) });
        if (m[2] != null) out.push({ t: m[2], m: { b: true } });
        else if (m[4] != null) out.push({ t: m[4], m: { i: true } });
        else if (m[5] != null) out.push({ t: m[5], m: { s: true } });
        else if (m[6] != null) out.push({ t: m[6], m: { code: true } });
        else if (m[7] != null) { const href = safeUrl(m[8]); out.push(href ? { t: m[7], m: { link: href } } : { t: m[7] }); }
        rest = rest.slice(m.index + m[0].length);
      }
      return normSpans(out);
    }
    function parseMarkdownToBlocks(text) {
      const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
      const out = [];
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        let m;
        if (/^```/.test(line.trim())) {
          const lang = line.trim().slice(3).trim();
          const buf = [];
          i++;
          while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
          i++;
          out.push(mkBlock('code', textSpans(buf.join('\n')), lang ? { lang } : undefined));
          continue;
        }
        if (!line.trim()) { i++; continue; }
        if (/^\s*([-*_])\s*\1\s*\1[\s-*_]*$/.test(line)) { out.push(mkBlock('divider')); i++; continue; }
        if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { out.push(mkBlock('h' + m[1].length, parseInlineMarkdown(m[2]))); i++; continue; }
        if ((m = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line))) { out.push(mkBlock('todo', parseInlineMarkdown(m[2]), { checked: m[1].toLowerCase() === 'x' })); i++; continue; }
        if ((m = /^(\s*)[-*+]\s+(.*)$/.exec(line))) { out.push(mkBlock('bullet', parseInlineMarkdown(m[2]), m[1].length >= 2 ? { indent: Math.min(3, Math.floor(m[1].length / 2)) } : undefined)); i++; continue; }
        if ((m = /^(\s*)\d+[.)]\s+(.*)$/.exec(line))) { out.push(mkBlock('numbered', parseInlineMarkdown(m[2]), m[1].length >= 2 ? { indent: Math.min(3, Math.floor(m[1].length / 2)) } : undefined)); i++; continue; }
        if ((m = /^>\s?(.*)$/.exec(line))) { out.push(mkBlock('quote', parseInlineMarkdown(m[1]))); i++; continue; }
        if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line))) {
          const url = safeUrl(m[2]);
          if (url) { out.push(mkBlock('image', [], { url, caption: m[1] || '' })); i++; continue; }
        }
        if (/^\s*\|.*\|\s*$/.test(line)) {
          const rows = [];
          while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
            const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
            if (!/^[\s:|-]+$/.test(lines[i].replace(/\|/g, ''))) rows.push(cells.map(c => parseInlineMarkdown(c)));
            i++;
          }
          if (rows.length) { out.push(mkBlock('table', [], { rows, header: true })); continue; }
        }
        out.push(mkBlock('paragraph', parseInlineMarkdown(line)));
        i++;
      }
      return out.length ? out : [mkBlock('paragraph')];
    }
    function parseHtmlToBlocks(html) {
      let doc;
      try { doc = new DOMParser().parseFromString(String(html || ''), 'text/html'); } catch (_) { return null; }
      if (!doc || !doc.body) return null;
      const out = [];
      const pushText = (type, el, props) => {
        const spans = nodesToSpans(el);
        if (spansLen(spans) || type === 'divider') out.push(mkBlock(type, spans, props));
      };
      const walk = (el) => {
        for (let i = 0; i < el.children.length; i++) {
          const node = el.children[i], tag = node.nodeName.toLowerCase();
          if (/^h[1-4]$/.test(tag)) pushText(tag, node);
          else if (tag === 'p') pushText('paragraph', node);
          else if (tag === 'ul' || tag === 'ol') {
            const items = node.querySelectorAll(':scope > li');
            for (let j = 0; j < items.length; j++) pushText(tag === 'ul' ? 'bullet' : 'numbered', items[j]);
          } else if (tag === 'blockquote') pushText('quote', node);
          else if (tag === 'pre') out.push(mkBlock('code', textSpans(node.textContent || '')));
          else if (tag === 'hr') out.push(mkBlock('divider'));
          else if (tag === 'img') { const u = safeUrl(node.getAttribute('src')); if (u) out.push(mkBlock('image', [], { url: u, caption: node.getAttribute('alt') || '' })); }
          else if (tag === 'table') {
            const rows = [];
            const trs = node.querySelectorAll('tr');
            for (let j = 0; j < trs.length; j++) {
              const cells = trs[j].querySelectorAll('td,th'), row = [];
              for (let k = 0; k < cells.length; k++) row.push(nodesToSpans(cells[k]));
              if (row.length) rows.push(row);
            }
            if (rows.length) out.push(mkBlock('table', [], { rows, header: /th/i.test(trs[0] ? trs[0].innerHTML : '') }));
          } else if (tag === 'script' || tag === 'style' || tag === 'iframe') continue;
          else if (node.children.length) walk(node);
          else pushText('paragraph', node);
        }
      };
      walk(doc.body);
      return out.length ? out : null;
    }
    function blocksToMarkdown(list, depth) {
      depth = depth || 0;
      const lines = [];
      arr(list).forEach(b => {
        const t = blockPlain(b);
        const ind = '  '.repeat(((b.props && b.props.indent) || 0) + depth);
        switch (b.type) {
          case 'h1': lines.push('# ' + t); break;
          case 'h2': lines.push('## ' + t); break;
          case 'h3': lines.push('### ' + t); break;
          case 'h4': lines.push('#### ' + t); break;
          case 'bullet': lines.push(ind + '- ' + t); break;
          case 'numbered': lines.push(ind + '1. ' + t); break;
          case 'todo': lines.push(ind + '- [' + (b.props && b.props.checked ? 'x' : ' ') + '] ' + t); break;
          case 'quote': case 'callout': lines.push('> ' + t); break;
          case 'toggle': lines.push('**' + t + '**'); break;
          case 'divider': lines.push('---'); break;
          case 'code': lines.push('```' + ((b.props && b.props.lang) || '') + '\n' + t + '\n```'); break;
          case 'image': lines.push('![' + ((b.props && b.props.caption) || '') + '](' + ((b.props && b.props.url) || '') + ')'); break;
          case 'file': lines.push('[' + ((b.props && b.props.name) || 'File') + '](' + ((b.props && b.props.url) || '') + ')'); break;
          case 'button': lines.push('[' + ((b.props && b.props.label) || 'Open') + '](' + ((b.props && b.props.url) || '') + ')'); break;
          case 'embed': lines.push(((b.props && b.props.url) || '')); break;
          case 'table':
            arr(b.props && b.props.rows).forEach((r, ri) => {
              lines.push('| ' + arr(r).map(c => spansPlain(c)).join(' | ') + ' |');
              if (ri === 0 && b.props.header) lines.push('| ' + arr(r).map(() => '---').join(' | ') + ' |');
            });
            break;
          default: if (t) lines.push(t);
        }
        if (b.children && b.children.length) lines.push(blocksToMarkdown(b.children, depth + 1));
      });
      return lines.filter(x => x !== '').join('\n');
    }

    // ---- markdown shortcuts while typing ------------------------------------
    function matchBlockShortcut(plain) {
      let m;
      if ((m = /^(#{1,4})\s$/.exec(plain))) return { type: 'h' + m[1].length, cut: m[0].length };
      if (/^[-*]\s$/.test(plain)) return { type: 'bullet', cut: 2 };
      if (/^\d+[.)]\s$/.test(plain)) return { type: 'numbered', cut: plain.length };
      if (/^\[\]\s$/.test(plain)) return { type: 'todo', cut: 3 };
      if (/^\[\s\]\s$/.test(plain)) return { type: 'todo', cut: 4 };
      if (/^\[x\]\s$/i.test(plain)) return { type: 'todo', cut: 4, props: { checked: true } };
      if (/^>\s$/.test(plain)) return { type: 'quote', cut: 2 };
      if (/^\|\s$/.test(plain)) return { type: 'callout', cut: 2, props: { tone: 'info', emoji: '💡' } };
      if (/^```$/.test(plain)) return { type: 'code', cut: 3 };
      if (/^(---|\*\*\*)$/.test(plain)) return { type: 'divider', cut: plain.length };
      return null;
    }
    // inline markdown that completes at the caret → marked spans
    function applyInlineMarkdown(spans, caret) {
      const plain = spansPlain(spans);
      if (caret == null || caret < 2) return null;
      const before = plain.slice(0, caret);
      const pats = [
        { re: /(\*\*|__)([^\s*_][^*_\n]{0,200}?)\1$/, key: 'b', innerAt: 2, markLen: 2 },
        { re: /(?:^|[\s(])([*_])([^\s*_][^*_\n]{0,200}?)\1$/, key: 'i', innerAt: 2, markLen: 1 },
        { re: /~~([^\s~][^~\n]{0,200}?)~~$/, key: 's', innerAt: 1, markLen: 2 },
        { re: /`([^`\n]{1,200}?)`$/, key: 'code', innerAt: 1, markLen: 1 }
      ];
      for (const p of pats) {
        const m = p.re.exec(before);
        if (!m) continue;
        const inner = m[p.innerAt];
        const start = caret - inner.length - p.markLen * 2;
        if (start < 0) continue;
        const mid0 = spansSlice(spans, start + p.markLen, caret - p.markLen);
        if (spansPlain(mid0) !== inner) continue;
        const left = spansSlice(spans, 0, start);
        const mid = spansToggleMark(mid0, 0, inner.length, p.key, true);
        const right = spansSlice(spans, caret, spansLen(spans));
        return { spans: spansConcat(spansConcat(left, mid), right), caret: start + inner.length };
      }
      const link = /(?:^|\s)(https?:\/\/[^\s]{5,300})(\s)$/.exec(before);
      if (link) {
        const url = safeUrl(link[1]);
        if (url) {
          const start = caret - link[1].length - 1;
          const left = spansSlice(spans, 0, start);
          const mid = spansToggleMark(spansSlice(spans, start, start + link[1].length), 0, link[1].length, 'link', url);
          const right = spansSlice(spans, start + link[1].length, spansLen(spans));
          return { spans: spansConcat(spansConcat(left, mid), right), caret };
        }
      }
      return null;
    }

    // =========================================================================
    // API (fail-open: every call resolves to a safe empty value when 097 is missing)
    // =========================================================================
    let rpcMissing = false;
    async function call(name, args, opts) {
      try {
        const r = await rpcCall(name, args || {}, opts || {});
        return r;
      } catch (e) {
        if (isMissingRpc(e)) { rpcMissing = true; const err = new Error('docs.unavailable'); err.code = 'docs.unavailable'; throw err; }
        throw e;
      }
    }
    const DocAPI = {
      get available() { return !rpcMissing; },
      list: (filter) => call('doc_list', { p_filter: filter || {} }).then(arr),
      get: (id) => call('doc_get', { p_id: id }),
      create: (data) => call('doc_create', { p_data: data || {} }),
      save: (id, baseVersion, patch) => call('doc_save', { p_id: id, p_base_version: baseVersion, p_patch: patch || {} }),
      set: (id, patch) => call('doc_set', { p_id: id, p_patch: patch || {} }),
      move: (id, parentId, position) => call('doc_move', { p_id: id, p_parent_id: parentId || null, p_position: position == null ? null : position }),
      duplicate: (id, withChildren) => call('doc_duplicate', { p_id: id, p_with_children: withChildren !== false }),
      remove: (id) => call('doc_delete', { p_id: id }),
      undelete: (id) => call('doc_undelete', { p_id: id }),
      bulk: (ids, action) => call('doc_bulk', { p_ids: ids, p_action: action }),
      versions: (docId) => call('doc_versions_list', { p_doc_id: docId }).then(arr),
      version: (versionId) => call('doc_version_get', { p_version_id: versionId }),
      restore: (versionId) => call('doc_version_restore', { p_version_id: versionId }),
      shareSet: (id, sharing, shares) => call('doc_share_set', { p_id: id, p_sharing: sharing || null, p_shares: shares || [] }),
      publicLink: (id, on) => call('doc_public_link', { p_id: id, p_on: !!on }),
      publicGet: (token) => rpcCall('doc_public_get', { p_token: token }, { allowUnauth: true }),
      search: (q, limit) => call('doc_search', { p_q: q || '', p_limit: limit || 10 }).then(arr),
      ping: (id, editing) => call('doc_ping', { p_id: id, p_editing: !!editing }),
      clientDoc: (clientId, kind) => call('doc_client_get', { p_client_id: clientId || null, p_kind: kind || 'sop' }),
      async uploadFile(file) {
        if (!supabase || !supabase.storage) throw new Error('Uploads are not available here');
        const safeName = String(file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(-120) || 'file';
        const path = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : uid()) + '/' + safeName;
        const { error } = await supabase.storage.from('doc-files').upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (error) throw new Error(error.message || 'Upload failed');
        const { data } = supabase.storage.from('doc-files').getPublicUrl(path);
        return { name: file.name || safeName, url: data && data.publicUrl, path, mime: file.type || '', size: file.size || 0 };
      }
    };

    const docHash = (id) => '#/docs' + (id ? '/' + id : '');
    const openDoc = (id) => {
      try { window.dispatchEvent(new CustomEvent('ams-open-doc', { detail: { id } })); } catch (_) {}
      if (location.hash !== docHash(id)) location.hash = docHash(id);
    };

    // =========================================================================
    // Small UI primitives
    // =========================================================================
    function FloatPanel({ rect, width, onClose, children, align }) {
      const ref = useRef(null);
      const [pos, setPos] = useState(null);
      useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !rect) return;
        const vw = window.innerWidth, vh = window.innerHeight, m = 8, gap = 6;
        const pw = el.offsetWidth || width || 280, ph = el.offsetHeight || 260;
        let top = (rect.bottom || 0) + gap;
        if (top + ph > vh - m) top = Math.max(m, (rect.top || 0) - ph - gap);
        let left = align === 'end' ? (rect.right || 0) - pw : (rect.left || 0);
        left = Math.max(m, Math.min(left, vw - pw - m));
        setPos({ top, left });
      }, [rect && rect.top, rect && rect.left, rect && rect.bottom, width, align]);
      useEffect(() => {
        const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose && onClose(); };
        const onEsc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose && onClose(); } };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onEsc, true);
        return () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onEsc, true); };
      }, [onClose]);
      return h`<div ref=${ref} class="dx-pop dx-root" role="dialog"
        style=${Object.assign({ width: width || undefined, visibility: pos ? 'visible' : 'hidden' }, pos || { top: 0, left: 0 })}>
        ${children}
      </div>`;
    }

    function Modal({ title, icon, children, footer, onClose, wide }) {
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [onClose]);
      return h`<div class="dx-modal-bg dx-root" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
        <div class=${'dx-modal' + (wide ? ' wide' : '')} role="dialog" aria-label=${title || 'Dialog'}>
          <div class="dx-mh">
            ${icon ? h`<i class=${'ti ' + icon} style=${{ fontSize: 18, color: 'var(--cu-t2)' }}></i>` : null}
            <span class="t">${title}</span>
            <button class="dx-ibtn" onClick=${onClose} aria-label="Close"><i class="ti ti-x"></i></button>
          </div>
          <div class="dx-mb">${children}</div>
          ${footer ? h`<div class="dx-mf">${footer}</div>` : null}
        </div>
      </div>`;
    }

    function Confirm({ title, body, danger, confirmLabel, onConfirm, onClose }) {
      return h`<${Modal} title=${title} onClose=${onClose} footer=${h`<${Fragment}>
        <button class="dx-btn" onClick=${onClose}>Cancel</button>
        <button class=${'dx-btn ' + (danger ? '' : 'dx-btn-pri')} style=${danger ? { background: '#e5484d', borderColor: '#e5484d', color: '#fff' } : null}
          onClick=${() => { onConfirm(); onClose(); }}>${confirmLabel || 'Confirm'}</button>
      <//>`}>
        <div style=${{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--cu-t2)' }}>${body}</div>
      <//>`;
    }

    const DocEmpty = ({ icon, title, sub, action }) => h`<div class="dx-empty">
      <i class=${'ti ' + (icon || 'ti-file-text')}></i>
      <div style=${{ fontWeight: 600, color: 'var(--cu-t2)', fontSize: 14 }}>${title}</div>
      ${sub ? h`<div style=${{ fontSize: 12.5, marginTop: 4 }}>${sub}</div>` : null}
      ${action ? h`<div style=${{ marginTop: 12 }}>${action}</div>` : null}
    </div>`;

    // =========================================================================
    // Read-only span rendering (htm vnodes — never innerHTML)
    // =========================================================================
    function SpansView({ spans }) {
      const list = normSpans(spans);
      if (!list.length) return null;
      return list.map((sp, i) => {
        if (sp.mention) {
          const kind = sp.mention.kind || 'member';
          const go = () => { if (kind === 'task') openTask(sp.mention.id); else if (kind === 'doc') openDoc(sp.mention.id); };
          return h`<span key=${i} class=${'dx-mention dx-mention-' + kind} onClick=${kind === 'member' ? null : go}
            role=${kind === 'member' ? null : 'button'} tabIndex=${kind === 'member' ? null : 0}
            onKeyDown=${kind === 'member' ? null : ((e) => { if (e.key === 'Enter') go(); })}>${sp.mention.label}</span>`;
        }
        const m = sp.m || {};
        let node = sp.t;
        if (m.code) node = h`<code class="dx-code">${node}</code>`;
        if (m.b) node = h`<strong>${node}</strong>`;
        if (m.i) node = h`<em>${node}</em>`;
        if (m.u) node = h`<u>${node}</u>`;
        if (m.s) node = h`<s>${node}</s>`;
        if (m.color || m.bg) {
          const cls = [m.color && COLORS.indexOf(m.color) >= 0 ? 'dx-c-' + m.color : '',
                       m.bg && COLORS.indexOf(m.bg) >= 0 ? 'dx-bg-' + m.bg : ''].filter(Boolean).join(' ');
          if (cls) node = h`<span class=${cls}>${node}</span>`;
        }
        if (m.link) {
          const href = safeUrl(m.link);
          if (href) node = h`<a class="dx-link" href=${href} target="_blank" rel="noopener noreferrer">${node}</a>`;
        }
        return h`<${Fragment} key=${i}>${node}<//>`;
      });
    }

    // =========================================================================
    // RichText — one contentEditable per text block
    // =========================================================================
    function RichText({ value, rev, placeholder, className, style, onChange, onKeys, onInputMeta, onPasteBlocks, ariaLabel }) {
      const ref = useRef(null);
      const stamp = useRef('');
      const valueRef = useRef(value); valueRef.current = value;

      useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const key = String(rev || 0) + '|' + JSON.stringify(normSpans(value));
        if (key === stamp.current) return;
        const focused = document.activeElement === el;
        const sameRev = stamp.current && stamp.current.split('|')[0] === String(rev || 0);
        if (focused && sameRev) { stamp.current = key; el.setAttribute('data-empty', spansLen(value) ? '0' : '1'); return; }
        renderSpansInto(el, value);
        stamp.current = key;
      }, [rev, value]);

      const emit = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        let next = nodesToSpans(el);
        let caret = caretOffset(el);
        const md = applyInlineMarkdown(next, caret);
        if (md) { next = md.spans; renderSpansInto(el, next); setCaret(el, md.caret); caret = md.caret; }
        el.setAttribute('data-empty', spansLen(next) ? '0' : '1');
        stamp.current = String(rev || 0) + '|' + JSON.stringify(next);
        onChange && onChange(next);
        onInputMeta && onInputMeta({ el, spans: next, caret, plain: spansPlain(next) });
      }, [onChange, onInputMeta, rev]);

      const info = () => {
        const el = ref.current;
        const spans = el ? nodesToSpans(el) : [];
        return { el, spans, caret: el ? caretOffset(el) : null, sel: el ? selectionRange(el) : null, plain: spansPlain(spans) };
      };

      return h`<div ref=${ref} class=${'dx-rt ' + (className || '')} style=${style}
        contentEditable=${true} suppressContentEditableWarning=${true} spellCheck=${true}
        role="textbox" aria-multiline="true" aria-label=${ariaLabel || placeholder || 'Text'}
        data-ph=${placeholder || ''} data-empty="1"
        onInput=${emit}
        onBlur=${emit}
        onKeyDown=${(e) => onKeys && onKeys(e, info())}
        onPaste=${(e) => {
          const cd = e.clipboardData;
          if (!cd) return;
          const html = cd.getData('text/html'), text = cd.getData('text/plain');
          if (!html && !text) return;
          let blocks = null;
          if (html) blocks = parseHtmlToBlocks(html);
          if (!blocks && text && /\n/.test(text.trim())) blocks = parseMarkdownToBlocks(text);
          if (blocks && blocks.length > 1 && onPasteBlocks) { e.preventDefault(); onPasteBlocks(blocks, info()); return; }
          e.preventDefault();
          const spans = blocks && blocks.length === 1 ? blocks[0].text : parseInlineMarkdown(text || '');
          const cur = info();
          const sel = cur.sel || { start: cur.caret || 0, end: cur.caret || 0 };
          const merged = spansConcat(spansConcat(spansSlice(cur.spans, 0, sel.start), spans), spansSlice(cur.spans, sel.end, spansLen(cur.spans)));
          renderSpansInto(ref.current, merged);
          setCaret(ref.current, sel.start + spansLen(spans));
          stamp.current = String(rev || 0) + '|' + JSON.stringify(merged);
          onChange && onChange(merged);
        }}
        onDrop=${(e) => e.preventDefault()}
      ></div>`;
    }

    // =========================================================================
    // Slash menu
    // =========================================================================
    const SLASH_ITEMS = [
      { group: 'Basic', key: 'paragraph', label: 'Text', icon: 'ti-align-left', kw: 'text paragraph plain', block: 'paragraph' },
      { group: 'Basic', key: 'h1', label: 'Heading 1', icon: 'ti-h-1', kw: 'title heading h1', block: 'h1' },
      { group: 'Basic', key: 'h2', label: 'Heading 2', icon: 'ti-h-2', kw: 'heading h2 subtitle', block: 'h2' },
      { group: 'Basic', key: 'h3', label: 'Heading 3', icon: 'ti-h-3', kw: 'heading h3', block: 'h3' },
      { group: 'Basic', key: 'h4', label: 'Heading 4', icon: 'ti-h-4', kw: 'heading h4', block: 'h4' },
      { group: 'Lists', key: 'bullet', label: 'Bulleted list', icon: 'ti-list', kw: 'bullet unordered ul', block: 'bullet' },
      { group: 'Lists', key: 'numbered', label: 'Numbered list', icon: 'ti-list-numbers', kw: 'number ordered ol', block: 'numbered' },
      { group: 'Lists', key: 'todo', label: 'Checklist', icon: 'ti-checkbox', kw: 'todo task check box', block: 'todo', props: { checked: false } },
      { group: 'Lists', key: 'toggle', label: 'Toggle list', icon: 'ti-chevron-right', kw: 'toggle collapse accordion details', block: 'toggle', props: { open: true }, children: true },
      { group: 'Blocks', key: 'quote', label: 'Quote', icon: 'ti-quote', kw: 'quote blockquote', block: 'quote' },
      { group: 'Blocks', key: 'callout', label: 'Callout', icon: 'ti-info-circle', kw: 'callout banner note info warning', block: 'callout', props: { tone: 'info', emoji: '💡' } },
      { group: 'Blocks', key: 'code', label: 'Code', icon: 'ti-code', kw: 'code snippet pre', block: 'code' },
      { group: 'Blocks', key: 'divider', label: 'Divider', icon: 'ti-minus', kw: 'divider line hr separator', insert: () => mkBlock('divider') },
      { group: 'Blocks', key: 'columns2', label: '2 columns', icon: 'ti-columns-2', kw: 'columns split side by side', insert: () => mkColumns(2) },
      { group: 'Blocks', key: 'columns3', label: '3 columns', icon: 'ti-columns-3', kw: 'columns split three', insert: () => mkColumns(3) },
      { group: 'Blocks', key: 'table', label: 'Table', icon: 'ti-table', kw: 'table grid rows', insert: () => mkBlock('table', [], { header: true, rows: [[[], []], [[], []], [[], []]] }) },
      { group: 'Blocks', key: 'toc', label: 'Table of contents', icon: 'ti-list-details', kw: 'toc contents outline index', insert: () => mkBlock('toc', [], { sticky: false }) },
      { group: 'Media', key: 'image', label: 'Image', icon: 'ti-photo', kw: 'image picture photo upload', insert: () => mkBlock('image', [], { pick: true }) },
      { group: 'Media', key: 'file', label: 'File', icon: 'ti-paperclip', kw: 'file attachment pdf upload', insert: () => mkBlock('file', [], { pick: true }) },
      { group: 'Media', key: 'embed', label: 'Embed', icon: 'ti-brand-youtube', kw: 'embed youtube loom figma miro google drive vimeo iframe', insert: () => mkBlock('embed', [], {}) },
      { group: 'Media', key: 'button', label: 'Button', icon: 'ti-square-rounded-arrow-right', kw: 'button link cta', insert: () => mkBlock('button', [], { label: 'Open', url: '' }) },
      { group: 'Work', key: 'task_list', label: 'Task list (live)', icon: 'ti-checklist', kw: 'tasks live list query work', insert: (ctx) => mkBlock('task_list', [], { title: 'Tasks', filter: { scope: ctx && ctx.clientId ? 'all' : 'my', client_ids: ctx && ctx.clientId ? [ctx.clientId] : undefined, include_closed: false }, limit: 10 }) },
      { group: 'Work', key: 'mention', label: 'Mention person / task / doc', icon: 'ti-at', kw: 'mention at person task doc link', mention: true }
    ];
    function mkColumns(n) {
      const cols = [];
      for (let i = 0; i < n; i++) cols.push({ id: uid(), type: 'column', children: [mkBlock('paragraph')] });
      return { id: uid(), type: 'columns', props: { count: n }, children: cols };
    }

    function SlashMenu({ state, ctx, onClose, onPick }) {
      const q = String(state.query || '').toLowerCase().trim();
      const registry = extList('docBlocks').map(b => ({
        group: 'More', key: 'ext:' + b.type, label: b.label || b.type, icon: b.icon || 'ti-puzzle',
        kw: (b.label || '') + ' ' + b.type, insert: () => mkBlock(b.type, [], (b.defaultProps || {}))
      }));
      const all = SLASH_ITEMS.concat(registry);
      const items = q ? all.filter(it => (it.label + ' ' + (it.kw || '')).toLowerCase().indexOf(q) >= 0) : all;
      const [act, setAct] = useState(0);
      useEffect(() => { setAct(0); }, [q]);
      useEffect(() => {
        const onKey = (e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAct(a => Math.min(items.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(a => Math.max(0, a - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (items[act]) onPick(items[act]); }
          else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, [items, act, onPick, onClose]);
      let lastGroup = null;
      return h`<${FloatPanel} rect=${state.rect} width=${288} onClose=${onClose}>
        <div class="dx-mm">
          ${!items.length && h`<div style=${{ padding: '14px 10px', color: 'var(--cu-t3)', fontSize: 12.5 }}>No blocks match “${state.query}”</div>`}
          ${items.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return h`<${Fragment} key=${it.key}>
              ${head ? h`<div class="dx-mgrp">${head}</div>` : null}
              <button class=${'dx-mi' + (i === act ? ' act' : '')} onMouseEnter=${() => setAct(i)}
                onMouseDown=${(e) => { e.preventDefault(); onPick(it); }}>
                <i class=${'ti ' + it.icon}></i><span>${it.label}</span>
              </button>
            <//>`;
          })}
        </div>
      <//>`;
    }

    // =========================================================================
    // Mention menu (people / tasks / docs)
    // =========================================================================
    function MentionMenu({ state, onClose, onPick, members }) {
      const q = String(state.query || '').trim();
      const [res, setRes] = useState({ members: [], tasks: [], docs: [] });
      const [act, setAct] = useState(0);
      useEffect(() => {
        let alive = true;
        const local = arr(members).filter(m => !q || String(m.name || '').toLowerCase().indexOf(q.toLowerCase()) >= 0).slice(0, 5);
        setRes(r => Object.assign({}, r, { members: local }));
        if (!q) { setRes({ members: local, tasks: [], docs: [] }); return; }
        const t = setTimeout(async () => {
          const out = { members: local, tasks: [], docs: [] };
          try {
            if (TaskAPI && TaskAPI.search) {
              const r = await TaskAPI.search(q, 5);
              out.tasks = arr(r && r.tasks).slice(0, 5);
              if (!members || !members.length) out.members = arr(r && r.members).slice(0, 5);
            }
          } catch (_) {}
          try { out.docs = (await DocAPI.search(q, 5)).slice(0, 5); } catch (_) {}
          if (alive) setRes(out);
        }, 180);
        return () => { alive = false; clearTimeout(t); };
      }, [q, members]);

      const flat = [].concat(
        res.members.map(m => ({ kind: 'member', id: m.id, label: m.name, icon: 'ti-user', sub: m.role_level || 'Team' })),
        res.tasks.map(t => ({ kind: 'task', id: t.id, label: t.title, icon: 'ti-circle-check', sub: [t.custom_id, t.client_name].filter(Boolean).join(' · ') })),
        res.docs.map(d => ({ kind: 'doc', id: d.id, label: d.title || 'Untitled', icon: 'ti-file-text', sub: d.client_name || 'Agency' }))
      );
      useEffect(() => { setAct(0); }, [q]);
      useEffect(() => {
        const onKey = (e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAct(a => Math.min(flat.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(a => Math.max(0, a - 1)); }
          else if (e.key === 'Enter') { if (flat[act]) { e.preventDefault(); onPick(flat[act]); } }
          else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, [flat, act, onPick, onClose]);

      return h`<${FloatPanel} rect=${state.rect} width=${300} onClose=${onClose}>
        <div class="dx-mm">
          ${!flat.length && h`<div style=${{ padding: '12px 10px', color: 'var(--cu-t3)', fontSize: 12.5 }}>
            ${q ? 'Nothing found for “' + q + '”' : 'Type to mention a person, task or doc'}</div>`}
          ${flat.map((it, i) => h`<button key=${it.kind + it.id} class=${'dx-mi' + (i === act ? ' act' : '')}
            onMouseEnter=${() => setAct(i)} onMouseDown=${(e) => { e.preventDefault(); onPick(it); }}>
            <i class=${'ti ' + it.icon}></i>
            <span style=${{ minWidth: 0, flex: 1 }}>
              <span style=${{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${it.label}</span>
              ${it.sub ? h`<span class="sub">${it.sub}</span>` : null}
            </span>
          </button>`)}
        </div>
      <//>`;
    }

    // =========================================================================
    // Inline formatting toolbar
    // =========================================================================
    function InlineToolbar({ state, onMark, onLink, onClose }) {
      const [colorOpen, setColorOpen] = useState(false);
      const cur = state.marks || {};
      const btn = (key, icon, title, value) => h`<button class=${cur[key] ? 'on' : ''} title=${title} aria-label=${title}
        onMouseDown=${(e) => { e.preventDefault(); onMark(key, value); }}><i class=${'ti ' + icon}></i></button>`;
      return h`<${FloatPanel} rect=${state.rect} onClose=${onClose}>
        <div class="dx-fmt">
          ${btn('b', 'ti-bold', 'Bold (⌘B)')}
          ${btn('i', 'ti-italic', 'Italic (⌘I)')}
          ${btn('u', 'ti-underline', 'Underline (⌘U)')}
          ${btn('s', 'ti-strikethrough', 'Strikethrough (⌘⇧S)')}
          ${btn('code', 'ti-code', 'Inline code (⌘E)')}
          <span class="sep"></span>
          <button class=${cur.link ? 'on' : ''} title="Link (⌘K)" aria-label="Link"
            onMouseDown=${(e) => { e.preventDefault(); onLink(); }}><i class="ti ti-link"></i></button>
          <button class=${(cur.color || cur.bg) ? 'on' : ''} title="Colour & highlight" aria-label="Colour"
            onMouseDown=${(e) => { e.preventDefault(); setColorOpen(o => !o); }}><i class="ti ti-palette"></i></button>
        </div>
        ${colorOpen && h`<div style=${{ padding: 8, borderTop: '1px solid var(--cu-bd)', maxWidth: 250 }}>
          <div class="dx-lbl">Text colour</div>
          <div style=${{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 9 }}>
            <button class="dx-swatch" title="Default" onMouseDown=${(e) => { e.preventDefault(); onMark('color', null); }}>A</button>
            ${COLORS.map(c => h`<button key=${c} class=${'dx-swatch dx-c-' + c} title=${c}
              onMouseDown=${(e) => { e.preventDefault(); onMark('color', c); }}>A</button>`)}
          </div>
          <div class="dx-lbl">Highlight</div>
          <div style=${{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button class="dx-swatch" title="None" onMouseDown=${(e) => { e.preventDefault(); onMark('bg', null); }}>–</button>
            ${COLORS.map(c => h`<button key=${c} class=${'dx-swatch dx-bg-' + c} title=${c}
              onMouseDown=${(e) => { e.preventDefault(); onMark('bg', c); }}> </button>`)}
          </div>
        </div>`}
      <//>`;
    }

    function LinkDialog({ rect, initial, onApply, onClose }) {
      const [v, setV] = useState(initial || '');
      return h`<${FloatPanel} rect=${rect} width=${300} onClose=${onClose}>
        <div style=${{ padding: 9, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input class="dx-input" autoFocus placeholder="Paste a link…" value=${v}
            onInput=${(e) => setV(e.target.value)}
            onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); onApply(safeUrl(v)); } }}/>
          ${initial ? h`<button class="dx-ibtn" title="Remove link" onClick=${() => onApply(null)}><i class="ti ti-unlink"></i></button>` : null}
          <button class="dx-btn dx-btn-pri dx-btn-sm" onClick=${() => onApply(safeUrl(v))}>Apply</button>
        </div>
      <//>`;
    }

    // =========================================================================
    // Non-text blocks
    // =========================================================================
    function ImageBlock({ block, ctx }) {
      const p = block.props || {};
      const fileRef = useRef(null);
      const [busy, setBusy] = useState(false);
      useEffect(() => { if (p.pick && fileRef.current && !ctx.readOnly) { fileRef.current.click(); ctx.setProps(block.id, { pick: undefined }); } }, []);
      const pickFile = async (file) => {
        if (!file) return;
        setBusy(true);
        try {
          const up = await DocAPI.uploadFile(file);
          ctx.setProps(block.id, { url: up.url, name: up.name, path: up.path, mime: up.mime, size: up.size, pick: undefined });
        } catch (e) { ctx.showToast && ctx.showToast('Upload failed: ' + errMsg(e)); }
        setBusy(false);
      };
      const url = safeUrl(p.url);
      if (!url) {
        if (ctx.readOnly) return null;
        return h`<div class="dx-linkcard" style=${{ cursor: 'pointer' }} onClick=${() => fileRef.current && fileRef.current.click()}>
          <i class=${'ti ' + (busy ? 'ti-loader-2 dx-spin' : 'ti-photo')} style=${{ fontSize: 20, color: 'var(--cu-t3)' }}></i>
          <span style=${{ flex: 1, fontSize: 13, color: 'var(--cu-t2)' }}>${busy ? 'Uploading…' : 'Upload an image, or paste a URL'}</span>
          <input class="dx-input" style=${{ maxWidth: 220 }} placeholder="https://…" onClick=${(e) => e.stopPropagation()}
            onKeyDown=${(e) => { if (e.key === 'Enter') { const u = safeUrl(e.target.value); if (u) ctx.setProps(block.id, { url: u }); } }}/>
          <input ref=${fileRef} type="file" accept="image/*" style=${{ display: 'none' }}
            onChange=${(e) => pickFile(e.target.files && e.target.files[0])}/>
        </div>`;
      }
      return h`<figure style=${{ margin: '6px 0' }}>
        <img class="dx-img" src=${url} alt=${p.caption || p.name || 'Image'} loading="lazy"
          style=${{ maxWidth: p.width ? p.width + 'px' : '100%' }}/>
        ${ctx.readOnly
          ? (p.caption ? h`<figcaption class="dx-cap">${p.caption}</figcaption>` : null)
          : h`<input class="dx-input" style=${{ marginTop: 5, border: '1px solid transparent', textAlign: 'center', fontSize: 12 }}
              placeholder="Add a caption…" value=${p.caption || ''} onInput=${(e) => ctx.setProps(block.id, { caption: e.target.value })}/>`}
      </figure>`;
    }

    function FileBlock({ block, ctx }) {
      const p = block.props || {};
      const fileRef = useRef(null);
      const [busy, setBusy] = useState(false);
      useEffect(() => { if (p.pick && fileRef.current && !ctx.readOnly) { fileRef.current.click(); ctx.setProps(block.id, { pick: undefined }); } }, []);
      const url = safeUrl(p.url);
      const upload = async (file) => {
        if (!file) return;
        setBusy(true);
        try {
          const up = await DocAPI.uploadFile(file);
          ctx.setProps(block.id, { url: up.url, name: up.name, path: up.path, mime: up.mime, size: up.size, pick: undefined });
        } catch (e) { ctx.showToast && ctx.showToast('Upload failed: ' + errMsg(e)); }
        setBusy(false);
      };
      if (!url) {
        if (ctx.readOnly) return null;
        return h`<button class="dx-linkcard" style=${{ width: '100%', cursor: 'pointer', font: 'inherit' }} onClick=${() => fileRef.current && fileRef.current.click()}>
          <i class=${'ti ' + (busy ? 'ti-loader-2 dx-spin' : 'ti-paperclip')} style=${{ fontSize: 18 }}></i>
          <span style=${{ fontSize: 13, color: 'var(--cu-t2)' }}>${busy ? 'Uploading…' : 'Upload a file'}</span>
          <input ref=${fileRef} type="file" style=${{ display: 'none' }} onChange=${(e) => upload(e.target.files && e.target.files[0])}/>
        </button>`;
      }
      const kb = p.size ? (p.size > 1048576 ? (p.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(p.size / 1024)) + ' KB') : '';
      return h`<a class="dx-file" href=${url} target="_blank" rel="noopener noreferrer">
        <i class=${'ti ' + (/pdf/i.test(p.mime || p.name || '') ? 'ti-file-type-pdf' : /image/.test(p.mime || '') ? 'ti-photo' : /sheet|excel|csv/i.test(p.mime || p.name || '') ? 'ti-file-spreadsheet' : 'ti-file')}
           style=${{ fontSize: 19, color: 'var(--cu-t2)' }}></i>
        <span style=${{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${p.name || 'File'}</span>
        ${kb ? h`<span style=${{ fontSize: 11.5, color: 'var(--cu-t3)' }}>${kb}</span>` : null}
        <i class="ti ti-download" style=${{ color: 'var(--cu-t3)' }}></i>
      </a>`;
    }

    function EmbedBlock({ block, ctx }) {
      const p = block.props || {};
      const [draft, setDraft] = useState('');
      const info = p.url ? resolveEmbed(p.url) : null;
      if (!info) {
        if (ctx.readOnly) return null;
        return h`<div class="dx-linkcard">
          <i class="ti ti-world" style=${{ fontSize: 19, color: 'var(--cu-t3)' }}></i>
          <input class="dx-input" placeholder="Paste a YouTube, Loom, Figma, Miro, Google Docs or any https link…"
            value=${draft} onInput=${(e) => setDraft(e.target.value)}
            onKeyDown=${(e) => { if (e.key === 'Enter') { const u = safeUrl(draft); if (u) ctx.setProps(block.id, { url: u }); } }}/>
          <button class="dx-btn dx-btn-sm dx-btn-pri" onClick=${() => { const u = safeUrl(draft); if (u) ctx.setProps(block.id, { url: u }); }}>Embed</button>
        </div>`;
      }
      const ratio = Math.min(1.2, Math.max(0.3, p.ratio || info.ratio));
      return h`<div class="dx-embed">
        <div style=${{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 11.5, color: 'var(--cu-t3)', borderBottom: '1px solid var(--cu-bd)' }}>
          <i class="ti ti-player-play" style=${{ fontSize: 13 }}></i>
          <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${info.provider} · ${hostOf(info.url)}</span>
          <a href=${info.url} target="_blank" rel="noopener noreferrer" style=${{ color: 'var(--cu-t3)' }} title="Open in a new tab"><i class="ti ti-external-link"></i></a>
          ${!ctx.readOnly && h`<button class="dx-ibtn" style=${{ width: 20, height: 20, fontSize: 13 }} title="Change link"
            onClick=${() => ctx.setProps(block.id, { url: '' })}><i class="ti ti-pencil"></i></button>`}
        </div>
        <iframe src=${info.src} title=${info.provider + ' embed'} loading="lazy"
          sandbox=${EMBED_SANDBOX} referrerPolicy="no-referrer" allowFullScreen=${true}
          style=${{ height: Math.round(Math.min(680, Math.max(220, 760 * ratio))) + 'px' }}></iframe>
      </div>`;
    }

    function ButtonBlock({ block, ctx }) {
      const p = block.props || {};
      const url = safeUrl(p.url);
      if (ctx.readOnly) {
        return url ? h`<a class="dx-btnblk" href=${url} target="_blank" rel="noopener noreferrer">
          ${p.label || 'Open'}<i class="ti ti-arrow-up-right"></i></a>` : null;
      }
      return h`<div style=${{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        ${url ? h`<a class="dx-btnblk" href=${url} target="_blank" rel="noopener noreferrer">${p.label || 'Open'}<i class="ti ti-arrow-up-right"></i></a>` : null}
        <input class="dx-input" style=${{ maxWidth: 170 }} placeholder="Button label" value=${p.label || ''}
          onInput=${(e) => ctx.setProps(block.id, { label: e.target.value })}/>
        <input class="dx-input" style=${{ maxWidth: 260 }} placeholder="https://…" value=${p.url || ''}
          onInput=${(e) => ctx.setProps(block.id, { url: e.target.value })}/>
      </div>`;
    }

    function TocBlock({ block, ctx }) {
      const p = block.props || {};
      const heads = flatBlocks(ctx.rootBlocks || []).filter(b => /^h[1-4]$/.test(b.type) && spansLen(b.text));
      const jump = (id) => {
        const el = document.querySelector('[data-bid="' + id + '"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      return h`<nav class=${'dx-toc' + (p.sticky ? ' sticky' : '')} aria-label="Table of contents">
        <div style=${{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span class="dx-lbl" style=${{ margin: 0, flex: 1 }}>On this page</span>
          ${!ctx.readOnly && h`<label style=${{ fontSize: 11.5, color: 'var(--cu-t3)', display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked=${!!p.sticky} onChange=${(e) => ctx.setProps(block.id, { sticky: e.target.checked })}/>Sticky
          </label>`}
        </div>
        ${!heads.length && h`<div style=${{ fontSize: 12.5, color: 'var(--cu-t3)' }}>Add headings and they'll show up here.</div>`}
        ${heads.map(b => h`<a key=${b.id} href=${'#'} style=${{ paddingLeft: ((parseInt(b.type.slice(1), 10) - 1) * 12) + 'px' }}
          onClick=${(e) => { e.preventDefault(); jump(b.id); }}>${blockPlain(b)}</a>`)}
      </nav>`;
    }

    function TaskListBlock({ block, ctx }) {
      const p = block.props || {};
      const [rows, setRows] = useState(null);
      const [err, setErr] = useState(null);
      const [cfgRect, setCfgRect] = useState(null);
      const filterKey = JSON.stringify(p.filter || {}) + '|' + (p.limit || 10);
      const load = useCallback(async () => {
        if (!TaskAPI || !TaskAPI.query) { setErr('tasks'); return; }
        try {
          const r = await TaskAPI.query(Object.assign({ limit: Math.min(50, p.limit || 10), order: 'due' }, p.filter || {}));
          setRows(arr(r && r.rows)); setErr(null);
        } catch (e) { setErr(errMsg(e)); setRows([]); }
      }, [filterKey]);
      useEffect(() => { load(); }, [load]);
      useEffect(() => {
        if (!taskBus || !taskBus.on) return;
        let t = null;
        const off = taskBus.on('task:changed', () => { clearTimeout(t); t = setTimeout(load, 500); });
        return () => { clearTimeout(t); if (typeof off === 'function') off(); };
      }, [load]);

      const f = p.filter || {};
      const setFilter = (patch) => ctx.setProps(block.id, { filter: Object.assign({}, f, patch) });
      const clients = arr(ctx.clients);
      return h`<div class="dx-tasks">
        <div class="dx-tasks-hd">
          <i class="ti ti-checklist"></i>
          ${ctx.readOnly
            ? h`<span style=${{ flex: 1 }}>${p.title || 'Tasks'}</span>`
            : h`<input class="dx-input" style=${{ flex: 1, height: 24, border: '1px solid transparent', background: 'transparent', fontWeight: 600 }}
                value=${p.title || ''} placeholder="Task list title" onInput=${(e) => ctx.setProps(block.id, { title: e.target.value })}/>`}
          <span style=${{ fontWeight: 400, color: 'var(--cu-t3)' }}>${rows ? rows.length : ''}</span>
          <button class="dx-ibtn" style=${{ width: 22, height: 22, fontSize: 14 }} title="Refresh" onClick=${load}><i class="ti ti-refresh"></i></button>
          ${!ctx.readOnly && h`<button class="dx-ibtn" style=${{ width: 22, height: 22, fontSize: 14 }} title="Filter"
            onClick=${(e) => setCfgRect(e.currentTarget.getBoundingClientRect())}><i class="ti ti-filter"></i></button>`}
        </div>
        ${rows === null && h`<div style=${{ padding: 12 }}><${Skel}/></div>`}
        ${err === 'tasks' && h`<div style=${{ padding: 12, fontSize: 12.5, color: 'var(--cu-t3)' }}>Task data isn't available here.</div>`}
        ${rows && !rows.length && !err && h`<div style=${{ padding: 14, fontSize: 12.5, color: 'var(--cu-t3)' }}>No tasks match this filter.</div>`}
        ${arr(rows).map(r => h`<button key=${r.id} class="dx-trow" onClick=${() => openTask(r.id)}>
          <span class="dx-dot" style=${{ background: r.status_color || '#87909e' }}></span>
          <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          textDecoration: r.status_category === 'done' ? 'line-through' : 'none',
                          color: r.status_category === 'done' ? 'var(--cu-t3)' : 'inherit' }}>${r.title}</span>
          ${r.client_name ? h`<span style=${{ fontSize: 11.5, color: 'var(--cu-t3)' }}>${r.client_name}</span>` : null}
          ${r.due_at ? h`<span style=${{ fontSize: 11.5, color: 'var(--cu-t3)' }}>${fmtDateUser(r.due_at)}</span>` : null}
          ${arr(r.assignees).slice(0, 2).map(a => h`<${Av} key=${a.id} i=${a.initials} c=${a.color} s=${18} round=${true}/>`)}
        </button>`)}
        ${cfgRect && h`<${FloatPanel} rect=${cfgRect} width=${260} onClose=${() => setCfgRect(null)}>
          <div style=${{ padding: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div>
              <span class="dx-lbl">Scope</span>
              <select class="dx-input" value=${f.scope || 'all'} onChange=${(e) => setFilter({ scope: e.target.value })}>
                <option value="all">All tasks</option><option value="my">Assigned to me</option>
                <option value="delegated">Delegated by me</option><option value="watching">Watching</option>
              </select>
            </div>
            <div>
              <span class="dx-lbl">Client</span>
              <select class="dx-input" value=${(arr(f.client_ids)[0]) || ''}
                onChange=${(e) => setFilter({ client_ids: e.target.value ? [e.target.value] : undefined, agency_only: undefined })}>
                <option value="">Any client</option>
                ${clients.map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
              </select>
            </div>
            <div>
              <span class="dx-lbl">Status</span>
              <select class="dx-input" value=${f.include_closed ? 'all' : (arr(f.status_categories).join(',') || 'open')}
                onChange=${(e) => {
                  const v = e.target.value;
                  if (v === 'all') setFilter({ include_closed: true, status_categories: undefined, overdue: undefined });
                  else if (v === 'overdue') setFilter({ include_closed: false, status_categories: undefined, overdue: true });
                  else setFilter({ include_closed: false, status_categories: undefined, overdue: undefined });
                }}>
                <option value="open">Open only</option><option value="all">Include closed</option><option value="overdue">Overdue</option>
              </select>
            </div>
            <div>
              <span class="dx-lbl">Show up to</span>
              <select class="dx-input" value=${String(p.limit || 10)} onChange=${(e) => ctx.setProps(block.id, { limit: parseInt(e.target.value, 10) })}>
                ${[5, 10, 20, 30, 50].map(n => h`<option key=${n} value=${String(n)}>${n} tasks</option>`)}
              </select>
            </div>
          </div>
        <//>`}
      </div>`;
    }

    function TableBlock({ block, ctx }) {
      const p = block.props || {};
      const rows = arr(p.rows);
      const cols = rows.reduce((n, r) => Math.max(n, arr(r).length), 0) || 1;
      const setCell = (ri, ci, spans) => {
        const next = rows.map((r, i) => i === ri ? arr(r).map((c, j) => j === ci ? spans : c) : r);
        ctx.setProps(block.id, { rows: next });
      };
      const addRow = () => ctx.setProps(block.id, { rows: rows.concat([new Array(cols).fill(null).map(() => [])]) });
      const addCol = () => ctx.setProps(block.id, { rows: rows.map(r => arr(r).concat([[]])) });
      const delRow = () => { if (rows.length > 1) ctx.setProps(block.id, { rows: rows.slice(0, -1) }); };
      const delCol = () => { if (cols > 1) ctx.setProps(block.id, { rows: rows.map(r => arr(r).slice(0, -1)) }); };
      return h`<div>
        <div class="dx-tw">
          <table class="dx-table">
            <tbody>
              ${rows.map((r, ri) => h`<tr key=${ri}>
                ${new Array(cols).fill(null).map((_, ci) => {
                  const cell = arr(r)[ci] || [];
                  const Cell = (p.header && ri === 0) ? 'th' : 'td';
                  return h`<${Cell} key=${ci}>
                    ${ctx.readOnly
                      ? h`<div class="dx-rt" style=${{ fontWeight: (p.header && ri === 0) ? 600 : 400 }}><${SpansView} spans=${cell}/></div>`
                      : h`<${RichText} value=${cell} rev=${ctx.rev} placeholder=${ri === 0 && p.header ? 'Heading' : ''}
                          style=${{ fontWeight: (p.header && ri === 0) ? 600 : 400 }}
                          onChange=${(sp) => setCell(ri, ci, sp)}
                          onKeys=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (ri === rows.length - 1) addRow(); } }}/>`}
                  <//>`;
                })}
              </tr>`)}
            </tbody>
          </table>
        </div>
        ${!ctx.readOnly && h`<div>
          <button class="dx-tbtn" onClick=${addRow}><i class="ti ti-plus"></i> Row</button>
          <button class="dx-tbtn" onClick=${addCol}><i class="ti ti-plus"></i> Column</button>
          <button class="dx-tbtn" onClick=${delRow} disabled=${rows.length < 2}>− Row</button>
          <button class="dx-tbtn" onClick=${delCol} disabled=${cols < 2}>− Column</button>
          <label class="dx-tbtn" style=${{ display: 'inline-flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked=${!!p.header} onChange=${(e) => ctx.setProps(block.id, { header: e.target.checked })}/> Header row
          </label>
        </div>`}
      </div>`;
    }

    const CALLOUT_TONES = [
      { key: 'info', label: 'Info', emoji: '💡' }, { key: 'warn', label: 'Warning', emoji: '⚠️' },
      { key: 'success', label: 'Success', emoji: '✅' }, { key: 'danger', label: 'Danger', emoji: '🚨' },
      { key: 'brand', label: 'Brand', emoji: '✨' }
    ];

    // =========================================================================
    // Block shell + renderer
    // =========================================================================
    function BlockShell({ block, ctx, children, index, siblings }) {
      const [over, setOver] = useState(null);
      const [menuRect, setMenuRect] = useState(null);
      const [turnInto, setTurnInto] = useState(false);
      if (ctx.readOnly) {
        return h`<div class=${'dx-blk dx-b-' + block.type} data-bid=${block.id}>
          <div class="dx-body">${children}</div>
        </div>`;
      }
      const act = (fn) => { setMenuRect(null); setTurnInto(false); fn(); };
      return h`<div class=${'dx-blk dx-b-' + block.type + (over ? ' dragover-' + over : '')} data-bid=${block.id}
        onDragOver=${(e) => { if (!ctx.dragRef.current) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver(e.clientY < r.top + r.height / 2 ? 'top' : 'bottom'); }}
        onDragLeave=${() => setOver(null)}
        onDrop=${(e) => { e.preventDefault(); const id = ctx.dragRef.current; setOver(null); if (id) ctx.moveTo(id, block.id, over === 'top' ? 'before' : 'after'); ctx.dragRef.current = null; }}>
        <div class="dx-gut">
          <button class="dx-ibtn" title="Add block below" aria-label="Add block below"
            onClick=${() => { const nb = mkBlock('paragraph'); ctx.insertAfter(block.id, [nb]); ctx.setFocus({ id: nb.id, at: 0 }); }}><i class="ti ti-plus"></i></button>
          <button class="dx-ibtn" title="Drag to move · click for options" aria-label="Block options" draggable=${true}
            onDragStart=${(e) => { ctx.dragRef.current = block.id; try { e.dataTransfer.setData('text/plain', block.id); e.dataTransfer.effectAllowed = 'move'; } catch (_) {} }}
            onDragEnd=${() => { ctx.dragRef.current = null; }}
            onClick=${(e) => setMenuRect(e.currentTarget.getBoundingClientRect())}><i class="ti ti-grip-vertical"></i></button>
        </div>
        <div class="dx-body">${children}</div>
        ${menuRect && h`<${FloatPanel} rect=${menuRect} width=${234} onClose=${() => { setMenuRect(null); setTurnInto(false); }}>
          <div class="dx-mm">
            ${turnInto
              ? h`<${Fragment}>
                  <div class="dx-mgrp">Turn into</div>
                  ${SLASH_ITEMS.filter(it => it.block).map(it => h`<button key=${it.key} class="dx-mi"
                    onClick=${() => act(() => ctx.turnInto(block.id, it))}><i class=${'ti ' + it.icon}></i>${it.label}</button>`)}
                <//>`
              : h`<${Fragment}>
                  ${isTextBlock(block) ? h`<button class="dx-mi" onClick=${() => setTurnInto(true)}>
                    <i class="ti ti-refresh"></i>Turn into…<span style=${{ marginLeft: 'auto', color: 'var(--cu-t3)' }}>›</span></button>` : null}
                  <button class="dx-mi" onClick=${() => act(() => ctx.duplicateBlock(block.id))}><i class="ti ti-copy"></i>Duplicate</button>
                  <button class="dx-mi" onClick=${() => act(() => ctx.nudge(block.id, -1))} disabled=${index === 0}><i class="ti ti-arrow-up"></i>Move up</button>
                  <button class="dx-mi" onClick=${() => act(() => ctx.nudge(block.id, 1))} disabled=${index === siblings - 1}><i class="ti ti-arrow-down"></i>Move down</button>
                  <button class="dx-mi" onClick=${() => act(() => { try { navigator.clipboard.writeText(blocksToMarkdown([block])); ctx.showToast && ctx.showToast('Copied'); } catch (_) {} })}>
                    <i class="ti ti-clipboard"></i>Copy as text</button>
                  <button class="dx-mi" style=${{ color: '#e5484d' }} onClick=${() => act(() => ctx.remove(block.id))}><i class="ti ti-trash" style=${{ color: '#e5484d' }}></i>Delete</button>
                <//>`}
          </div>
        <//>`}
      </div>`;
    }

    function TextBody({ block, ctx, placeholder, className, style }) {
      if (ctx.readOnly) {
        return h`<div class=${'dx-rt ' + (className || '')} style=${style}><${SpansView} spans=${block.text}/></div>`;
      }
      return h`<${RichText} value=${block.text} rev=${ctx.rev} placeholder=${placeholder} className=${className} style=${style}
        onChange=${(sp) => ctx.setText(block.id, sp)}
        onKeys=${(e, info) => ctx.onKeys(block, e, info)}
        onInputMeta=${(meta) => ctx.onInputMeta(block, meta)}
        onPasteBlocks=${(blocks, info) => ctx.pasteBlocks(block, blocks, info)}/>`;
    }

    function BlockNode({ block, ctx, index, siblings, listIndex }) {
      const p = block.props || {};
      const indent = Math.max(0, Math.min(4, p.indent || 0));
      const pad = indent ? { marginLeft: indent * 22 + 'px' } : null;
      let body;
      switch (block.type) {
        case 'h1': case 'h2': case 'h3': case 'h4':
          body = h`<${TextBody} block=${block} ctx=${ctx} placeholder=${'Heading ' + block.type.slice(1)}/>`;
          break;
        case 'bullet':
          body = h`<div class="dx-li" style=${pad}><span class="dx-li-m dot">•</span>
            <div style=${{ flex: 1, minWidth: 0 }}><${TextBody} block=${block} ctx=${ctx} placeholder="List item"/></div></div>`;
          break;
        case 'numbered':
          body = h`<div class="dx-li" style=${pad}><span class="dx-li-m">${(listIndex || 1) + '.'}</span>
            <div style=${{ flex: 1, minWidth: 0 }}><${TextBody} block=${block} ctx=${ctx} placeholder="List item"/></div></div>`;
          break;
        case 'todo':
          body = h`<div class=${'dx-li' + (p.checked ? ' dx-todo-done' : '')} style=${pad}>
            <input type="checkbox" class="dx-cb" checked=${!!p.checked} disabled=${ctx.readOnly && !ctx.allowCheck}
              aria-label="Toggle item" onChange=${(e) => ctx.setProps(block.id, { checked: e.target.checked })}/>
            <div style=${{ flex: 1, minWidth: 0 }}>
              <${TextBody} block=${block} ctx=${ctx} placeholder="To-do"/>
              ${ctx.isMeeting && (p.task_id || p.assignee_name || p.due)
                ? h`<div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '2px 0 4px' }}>
                    ${p.task_id ? h`<button class="dx-chip" onClick=${() => openTask(p.task_id)}>
                      <i class="ti ti-circle-check"></i>${p.task_custom_id || 'Task created'}</button>` : null}
                    ${p.assignee_name ? h`<span class="dx-chip"><i class="ti ti-user"></i>${p.assignee_name}</span>` : null}
                    ${p.due ? h`<span class="dx-chip"><i class="ti ti-calendar"></i>${fmtDateUser(p.due)}</span>` : null}
                  </div>` : null}
            </div>
          </div>`;
          break;
        case 'toggle':
          body = h`<div>
            <div class="dx-tog-h">
              <button class="dx-tog-c" aria-expanded=${p.open !== false} aria-label="Toggle section"
                onClick=${() => ctx.setProps(block.id, { open: p.open === false })}>
                <i class=${'ti ' + (p.open === false ? 'ti-chevron-right' : 'ti-chevron-down')}></i></button>
              <div style=${{ flex: 1, minWidth: 0 }}><${TextBody} block=${block} ctx=${ctx} placeholder="Toggle title"/></div>
            </div>
            ${p.open !== false ? h`<div class="dx-tog-kids">
              <${BlockList} list=${arr(block.children)} ctx=${ctx} parentId=${block.id}/>
              ${!ctx.readOnly && h`<button class="dx-btn dx-btn-sm" style=${{ marginTop: 4 }}
                onClick=${() => { const nb = mkBlock('paragraph'); ctx.appendChild(block.id, nb); ctx.setFocus({ id: nb.id, at: 0 }); }}>
                <i class="ti ti-plus"></i>Add inside</button>`}
            </div>` : null}
          </div>`;
          break;
        case 'quote':
          body = h`<${TextBody} block=${block} ctx=${ctx} placeholder="Quote"/>`;
          break;
        case 'callout': {
          const tone = (CALLOUT_TONES.find(t => t.key === p.tone) || CALLOUT_TONES[0]);
          body = h`<div class=${'dx-callout dx-co-' + tone.key}>
            ${ctx.readOnly
              ? h`<span class="em">${p.emoji || tone.emoji}</span>`
              : h`<button class="em" style=${{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                  title="Change style" onClick=${() => {
                    const i = CALLOUT_TONES.findIndex(t => t.key === tone.key);
                    const next = CALLOUT_TONES[(i + 1) % CALLOUT_TONES.length];
                    ctx.setProps(block.id, { tone: next.key, emoji: next.emoji });
                  }}>${p.emoji || tone.emoji}</button>`}
            <div style=${{ flex: 1, minWidth: 0 }}><${TextBody} block=${block} ctx=${ctx} placeholder="Callout text"/></div>
          </div>`;
          break;
        }
        case 'code':
          body = h`<div>
            ${!ctx.readOnly && h`<input class="dx-input" style=${{ height: 22, width: 120, marginBottom: 4, fontSize: 11.5 }}
              placeholder="language" value=${p.lang || ''} onInput=${(e) => ctx.setProps(block.id, { lang: e.target.value })}/>`}
            <${TextBody} block=${block} ctx=${ctx} placeholder="Code"/>
          </div>`;
          break;
        case 'divider': body = h`<div class="dx-div" role="separator"></div>`; break;
        case 'columns':
          body = h`<div class="dx-cols">
            ${arr(block.children).map(col => h`<div key=${col.id} class="dx-col">
              <${BlockList} list=${arr(col.children)} ctx=${ctx} parentId=${col.id}/>
              ${!ctx.readOnly && h`<button class="dx-btn dx-btn-sm" style=${{ marginTop: 2, opacity: .75 }}
                onClick=${() => { const nb = mkBlock('paragraph'); ctx.appendChild(col.id, nb); ctx.setFocus({ id: nb.id, at: 0 }); }}>
                <i class="ti ti-plus"></i>Add</button>`}
            </div>`)}
          </div>`;
          break;
        case 'table': body = h`<${TableBlock} block=${block} ctx=${ctx}/>`; break;
        case 'toc': body = h`<${TocBlock} block=${block} ctx=${ctx}/>`; break;
        case 'image': body = h`<${ImageBlock} block=${block} ctx=${ctx}/>`; break;
        case 'file': body = h`<${FileBlock} block=${block} ctx=${ctx}/>`; break;
        case 'embed': body = h`<${EmbedBlock} block=${block} ctx=${ctx}/>`; break;
        case 'button': body = h`<${ButtonBlock} block=${block} ctx=${ctx}/>`; break;
        case 'task_list': body = h`<${TaskListBlock} block=${block} ctx=${ctx}/>`; break;
        default: {
          const ext = extList('docBlocks').find(b => b.type === block.type);
          if (ext && ext.Component) {
            body = h`<${ext.Component} block=${block} readOnly=${ctx.readOnly} doc=${ctx.docInfo} currentUser=${ctx.currentUser}
              showToast=${ctx.showToast} getDocText=${ctx.getDocText}
              updateBlock=${(patch) => ctx.setProps(block.id, patch)}
              replaceWith=${(blocks) => ctx.replaceBlock(block.id, blocks)}
              insertAfter=${(blocks) => ctx.insertAfter(block.id, blocks)}
              removeBlock=${() => ctx.remove(block.id)}/>`;
          } else if (isTextBlock(block) || !block.type || block.type === 'paragraph') {
            body = h`<${TextBody} block=${block} ctx=${ctx} placeholder=${ctx.readOnly ? '' : "Type '/' for blocks"}/>`;
          } else {
            body = h`<div class="dx-linkcard"><i class="ti ti-help-circle"></i>
              <span style=${{ fontSize: 12.5, color: 'var(--cu-t3)' }}>Unsupported block (${block.type})</span></div>`;
          }
        }
      }
      return h`<${BlockShell} block=${block} ctx=${ctx} index=${index} siblings=${siblings}>${body}<//>`;
    }

    function BlockList({ list, ctx, parentId }) {
      const blocks = arr(list);
      let num = 0, lastIndent = -1;
      return h`<div class="dx-blocks">
        ${blocks.map((b, i) => {
          if (b.type === 'numbered') {
            const ind = (b.props && b.props.indent) || 0;
            const prev = blocks[i - 1];
            if (!prev || prev.type !== 'numbered' || ((prev.props && prev.props.indent) || 0) !== ind || lastIndent !== ind) num = 1;
            else num++;
            lastIndent = ind;
          } else { num = 0; lastIndent = -1; }
          return h`<${BlockNode} key=${b.id} block=${b} ctx=${ctx} index=${i} siblings=${blocks.length} listIndex=${num}/>`;
        })}
        ${!ctx.readOnly && !parentId && h`<div style=${{ minHeight: 90, cursor: 'text' }} onClick=${() => {
          const last = blocks[blocks.length - 1];
          if (last && isTextBlock(last) && !spansLen(last.text)) { ctx.setFocus({ id: last.id, at: 0 }); return; }
          const nb = mkBlock('paragraph');
          ctx.appendRoot(nb);
          ctx.setFocus({ id: nb.id, at: 0 });
        }}></div>`}
      </div>`;
    }

    // =========================================================================
    // Editor helpers
    // =========================================================================
    function setSelectionRange(el, start, end) {
      if (!el) return;
      const sel = window.getSelection();
      if (!sel) return;
      const pick = (target) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        let node = null, pos = 0, last = null;
        while ((node = walker.nextNode())) {
          const len = node.nodeValue.length;
          last = node;
          if (pos + len >= target) return { node, off: Math.max(0, target - pos) };
          pos += len;
        }
        return last ? { node: last, off: last.nodeValue.length } : null;
      };
      const a = pick(start), b = pick(end);
      if (!a || !b) return;
      const r = document.createRange();
      try { r.setStart(a.node, a.off); r.setEnd(b.node, b.off); } catch (_) { return; }
      sel.removeAllRanges(); sel.addRange(r);
    }
    const cloneBlocks = (list) => arr(list).map(b => Object.assign({}, b, {
      id: uid(),
      props: b.props ? Object.assign({}, b.props) : undefined,
      children: b.children ? cloneBlocks(b.children) : undefined
    }));
    function listContaining(list, id) {
      if (arr(list).some(b => b.id === id)) return arr(list);
      for (const b of arr(list)) { if (b.children) { const r = listContaining(b.children, id); if (r) return r; } }
      return null;
    }
    const noop = () => {};
    const readCtx = (blocks, extra) => Object.assign({
      readOnly: true, rev: 0, rootBlocks: blocks, clients: [], dragRef: { current: null },
      setText: noop, setProps: noop, remove: noop, insertAfter: noop, replaceBlock: noop, appendChild: noop,
      appendRoot: noop, setFocus: noop, onKeys: noop, onInputMeta: noop, pasteBlocks: noop, turnInto: noop,
      duplicateBlock: noop, nudge: noop, moveTo: noop, getDocText: () => blocksPlain(blocks)
    }, extra || {});

    const downloadText = (name, text, mime) => {
      try {
        const blob = new Blob([text], { type: mime || 'text/markdown;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } catch (_) {}
    };
    const copyText = async (text) => {
      try { await navigator.clipboard.writeText(text); return true; }
      catch (_) {
        try {
          const ta = document.createElement('textarea');
          ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
          return true;
        } catch (__) { return false; }
      }
    };

    // =========================================================================
    // Modals
    // =========================================================================
    function HistoryModal({ docId, onClose, onRestored, showToast }) {
      const [list, setList] = useState(null);
      const [sel, setSel] = useState(null);
      const [preview, setPreview] = useState(null);
      const [busy, setBusy] = useState(false);
      useEffect(() => { DocAPI.versions(docId).then(setList).catch(() => setList([])); }, [docId]);
      const open = async (v) => {
        setSel(v); setPreview(null);
        try { setPreview(await DocAPI.version(v.id)); } catch (e) { showToast && showToast(errMsg(e)); }
      };
      const restore = async () => {
        if (!sel) return;
        setBusy(true);
        try { const d = await DocAPI.restore(sel.id); showToast && showToast('Version restored'); onRestored(d); onClose(); }
        catch (e) { showToast && showToast('Restore failed: ' + errMsg(e)); }
        setBusy(false);
      };
      return h`<${Modal} wide=${true} title="Version history" icon="ti-history" onClose=${onClose}
        footer=${h`<${Fragment}>
          <button class="dx-btn" onClick=${onClose}>Close</button>
          <button class="dx-btn dx-btn-pri" disabled=${!sel || busy || (sel && sel.is_current)} onClick=${restore}>
            ${busy ? h`<i class="ti ti-loader-2 dx-spin"></i>` : null}Restore this version</button>
        <//>`}>
        <div style=${{ display: 'flex', gap: 14, minHeight: 320, flexWrap: 'wrap' }}>
          <div style=${{ width: 236, flex: '0 0 236px', maxHeight: 420, overflow: 'auto', borderRight: '1px solid var(--cu-bd)', paddingRight: 8 }}>
            ${list === null && h`<${Skel}/>`}
            ${list && !list.length && h`<div style=${{ fontSize: 12.5, color: 'var(--cu-t3)', padding: 10 }}>No history yet.</div>`}
            ${arr(list).map(v => h`<button key=${v.id} class=${'dx-navi' + (sel && sel.id === v.id ? ' on' : '')}
              style=${{ height: 'auto', padding: '7px 8px', alignItems: 'flex-start' }} onClick=${() => open(v)}>
              <span style=${{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style=${{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>
                  v${v.version}${v.is_current ? ' · current' : ''}${v.reason === 'restore' ? ' · restored' : v.reason === 'backfill' ? ' · imported' : ''}
                </span>
                <span style=${{ display: 'block', fontSize: 11.5, color: 'var(--cu-t3)' }}>
                  ${v.created_by_name || 'System'} · ${fmtRelative(v.saved_at)}
                </span>
              </span>
            </button>`)}
          </div>
          <div style=${{ flex: 1, minWidth: 260, maxHeight: 420, overflow: 'auto' }}>
            ${!sel && h`<div style=${{ fontSize: 12.5, color: 'var(--cu-t3)', padding: 10 }}>Pick a version to preview it.</div>`}
            ${sel && !preview && h`<${Skel}/>`}
            ${preview && h`<div class="dx-root">
              <div style=${{ font: '700 18px/1.3 inherit', fontFamily: 'inherit', marginBottom: 8 }}>${preview.title || 'Untitled'}</div>
              <${BlockList} list=${arr(preview.blocks)} ctx=${readCtx(arr(preview.blocks))}/>
            </div>`}
          </div>
        </div>
      <//>`;
    }

    function ShareModal({ doc, members, onClose, onSaved, showToast }) {
      const [sharing, setSharing] = useState(doc.sharing || 'workspace');
      const [shares, setShares] = useState(arr(doc.shares).map(s => ({ member_id: s.member_id, access: s.access, name: s.name, initials: s.initials, color: s.color })));
      const [token, setToken] = useState(doc.public_token || null);
      const [q, setQ] = useState('');
      const [busy, setBusy] = useState(false);
      const has = (id) => shares.some(s => s.member_id === id);
      const pool = arr(members).filter(m => m.id !== doc.created_by && (m.role_level || '') !== 'client' && !has(m.id)
        && (!q || String(m.name || '').toLowerCase().indexOf(q.toLowerCase()) >= 0)).slice(0, 6);
      const save = async () => {
        setBusy(true);
        try {
          const r = await DocAPI.shareSet(doc.id, sharing, shares.map(s => ({ member_id: s.member_id, access: s.access })));
          showToast && showToast('Sharing updated');
          onSaved(r); onClose();
        } catch (e) { showToast && showToast('Could not update sharing: ' + errMsg(e)); }
        setBusy(false);
      };
      const toggleLink = async (on) => {
        try { const r = await DocAPI.publicLink(doc.id, on); setToken(r && r.public_token); }
        catch (e) { showToast && showToast(errMsg(e)); }
      };
      const publicUrl = token ? (location.origin + location.pathname + '?doc=' + token) : '';
      return h`<${Modal} title="Share doc" icon="ti-share" onClose=${onClose}
        footer=${h`<${Fragment}>
          <button class="dx-btn" onClick=${onClose}>Cancel</button>
          <button class="dx-btn dx-btn-pri" disabled=${busy} onClick=${save}>Save sharing</button>
        <//>`}>
        <div>
          <span class="dx-lbl">Who can see this doc</span>
          ${[['workspace', 'Everyone in the workspace', 'ti-building', 'All staff can read it; managers and admins can edit.'],
             ['people', 'Specific people', 'ti-users', 'Only you and the people you add below.'],
             ['private', 'Private to me', 'ti-lock', 'Only you (plus anyone you add below).']].map(([key, label, icon, sub]) =>
            h`<label key=${key} class="dx-row" style=${{ cursor: 'pointer', alignItems: 'flex-start' }}>
              <input type="radio" name="dx-sharing" checked=${sharing === key} onChange=${() => setSharing(key)} style=${{ marginTop: 3 }}/>
              <span style=${{ flex: 1 }}>
                <span style=${{ display: 'block', fontWeight: 600, fontSize: 13 }}><i class=${'ti ' + icon}></i> ${label}</span>
                <span style=${{ display: 'block', fontSize: 11.5, color: 'var(--cu-t3)' }}>${sub}</span>
              </span>
            </label>`)}
        </div>
        <div>
          <span class="dx-lbl">People with access</span>
          ${!shares.length && h`<div style=${{ fontSize: 12.5, color: 'var(--cu-t3)', padding: '2px 0 6px' }}>No one added yet.</div>`}
          ${shares.map(s => h`<div key=${s.member_id} class="dx-row">
            <${Av} i=${s.initials} c=${s.color} s=${24} round=${true}/>
            <span style=${{ flex: 1, fontSize: 13 }}>${s.name}</span>
            <select class="dx-input" style=${{ width: 92, height: 26 }} value=${s.access}
              onChange=${(e) => setShares(list => list.map(x => x.member_id === s.member_id ? Object.assign({}, x, { access: e.target.value }) : x))}>
              <option value="view">Can view</option><option value="edit">Can edit</option>
            </select>
            <button class="dx-ibtn" title="Remove" onClick=${() => setShares(list => list.filter(x => x.member_id !== s.member_id))}><i class="ti ti-x"></i></button>
          </div>`)}
          <div class="dx-search" style=${{ marginTop: 8 }}>
            <i class="ti ti-user-plus"></i>
            <input class="dx-input" placeholder="Add a teammate…" value=${q} onInput=${(e) => setQ(e.target.value)}/>
          </div>
          ${q && pool.map(m => h`<button key=${m.id} class="dx-mi" onClick=${() => {
            setShares(list => list.concat([{ member_id: m.id, access: 'view', name: m.name, initials: m.initials, color: m.color }]));
            setQ('');
          }}><${Av} i=${m.initials} c=${m.color} s=${20} round=${true}/>${m.name}</button>`)}
        </div>
        <div>
          <span class="dx-lbl">Read-only link</span>
          <label class="dx-row" style=${{ cursor: 'pointer' }}>
            <input type="checkbox" checked=${!!token} onChange=${(e) => toggleLink(e.target.checked)}/>
            <span style=${{ flex: 1, fontSize: 13 }}>Anyone with the link can read this doc${doc.client_id ? ' (handy for the client)' : ''}</span>
          </label>
          ${token && h`<div style=${{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input class="dx-input" readOnly value=${publicUrl} onFocus=${(e) => e.target.select()}/>
            <button class="dx-btn dx-btn-sm" onClick=${async () => { (await copyText(publicUrl)) && showToast && showToast('Link copied'); }}>Copy</button>
          </div>`}
        </div>
      <//>`;
    }

    function MoveModal({ doc, onClose, onMoved, showToast }) {
      const [q, setQ] = useState('');
      const [res, setRes] = useState([]);
      const [busy, setBusy] = useState(false);
      useEffect(() => {
        let alive = true;
        const t = setTimeout(async () => {
          try { const r = await DocAPI.search(q, 10); if (alive) setRes(r.filter(d => d.id !== doc.id)); } catch (_) {}
        }, 180);
        return () => { alive = false; clearTimeout(t); };
      }, [q, doc.id]);
      const move = async (parentId) => {
        setBusy(true);
        try { await DocAPI.move(doc.id, parentId, null); showToast && showToast('Moved'); onMoved(); onClose(); }
        catch (e) { showToast && showToast('Could not move: ' + errMsg(e)); }
        setBusy(false);
      };
      return h`<${Modal} title="Move doc" icon="ti-arrows-move" onClose=${onClose}>
        <button class="dx-mi" disabled=${busy} onClick=${() => move(null)}><i class="ti ti-home"></i>Top level</button>
        <div class="dx-search"><i class="ti ti-search"></i>
          <input class="dx-input" autoFocus placeholder="Search a doc to nest under…" value=${q} onInput=${(e) => setQ(e.target.value)}/>
        </div>
        <div style=${{ maxHeight: 280, overflow: 'auto' }}>
          ${res.map(d => h`<button key=${d.id} class="dx-mi" disabled=${busy} onClick=${() => move(d.id)}>
            <i class="ti ti-file-text"></i>
            <span style=${{ flex: 1, minWidth: 0 }}>
              <span style=${{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${d.title || 'Untitled'}</span>
              <span class="sub">${d.client_name || 'Agency'}</span>
            </span>
          </button>`)}
          ${!res.length && h`<div style=${{ fontSize: 12.5, color: 'var(--cu-t3)', padding: 10 }}>No docs found.</div>`}
        </div>
      <//>`;
    }

    function CreateTasksModal({ items, clientId, onClose, onCreated, showToast }) {
      const store = useTaskStore();
      const lists = (store.listsForClient ? store.listsForClient(clientId || null)
        : arr(store.lists).filter(l => (l.client_id || null) === (clientId || null))).filter(l => !l.archived);
      const preferred = lists.find(l => l.system_key === 'tasks') || lists.find(l => l.system_key === 'internal')
        || lists.find(l => l.kind !== 'content') || lists[0];
      const [listId, setListId] = useState(preferred ? preferred.id : '');
      const [rows, setRows] = useState(arr(items).map(it => Object.assign({ pick: true }, it)));
      const [busy, setBusy] = useState(false);
      const members = arr(store.members);
      const create = async () => {
        if (!TaskAPI || !TaskAPI.create) { showToast && showToast('Tasks are not available here'); return; }
        setBusy(true);
        const done = [];
        for (const r of rows.filter(x => x.pick && String(x.title || '').trim())) {
          try {
            const row = await TaskAPI.create({
              title: String(r.title).slice(0, 300), list_id: listId || undefined, client_id: clientId || undefined,
              assignee_ids: r.assignee_id ? [r.assignee_id] : [], due_at: r.due || undefined
            });
            done.push({ blockId: r.blockId, task_id: row && row.id, custom_id: row && row.custom_id, assignee_id: r.assignee_id, due: r.due });
          } catch (e) { showToast && showToast('Could not create “' + r.title + '”: ' + errMsg(e)); }
        }
        setBusy(false);
        if (done.length) { showToast && showToast(done.length + ' task' + (done.length > 1 ? 's' : '') + ' created'); onCreated(done); }
        onClose();
      };
      return h`<${Modal} wide=${true} title="Create tasks from action items" icon="ti-subtask" onClose=${onClose}
        footer=${h`<${Fragment}>
          <button class="dx-btn" onClick=${onClose}>Cancel</button>
          <button class="dx-btn dx-btn-pri" disabled=${busy || !rows.some(r => r.pick)} onClick=${create}>
            ${busy ? h`<i class="ti ti-loader-2 dx-spin"></i>` : null}Create ${rows.filter(r => r.pick).length} task(s)</button>
        <//>`}>
        <div>
          <span class="dx-lbl">Add to list</span>
          <select class="dx-input" value=${listId} onChange=${(e) => setListId(e.target.value)}>
            ${!lists.length && h`<option value="">No lists available</option>`}
            ${lists.map(l => h`<option key=${l.id} value=${l.id}>${l.name}</option>`)}
          </select>
        </div>
        <div>
          ${rows.map((r, i) => h`<div key=${r.blockId || i} class="dx-row" style=${{ alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <input type="checkbox" checked=${r.pick} onChange=${(e) => setRows(list => list.map((x, j) => j === i ? Object.assign({}, x, { pick: e.target.checked }) : x))}/>
            <input class="dx-input" style=${{ flex: 1, minWidth: 160 }} value=${r.title || ''}
              onInput=${(e) => setRows(list => list.map((x, j) => j === i ? Object.assign({}, x, { title: e.target.value }) : x))}/>
            <select class="dx-input" style=${{ width: 130 }} value=${r.assignee_id || ''}
              onChange=${(e) => setRows(list => list.map((x, j) => j === i ? Object.assign({}, x, { assignee_id: e.target.value || null }) : x))}>
              <option value="">Unassigned</option>
              ${members.map(m => h`<option key=${m.id} value=${m.id}>${m.name}</option>`)}
            </select>
            <input class="dx-input" type="date" style=${{ width: 140 }} value=${r.due ? String(r.due).slice(0, 10) : ''}
              onChange=${(e) => setRows(list => list.map((x, j) => j === i ? Object.assign({}, x, { due: e.target.value ? new Date(e.target.value + 'T18:30:00').toISOString() : null }) : x))}/>
          </div>`)}
          ${!rows.length && h`<div style=${{ fontSize: 12.5, color: 'var(--cu-t3)' }}>No open action items — add checklist items under the meeting notes first.</div>`}
        </div>
      <//>`;
    }

    // =========================================================================
    // DocEditor
    // =========================================================================
    function DocEditor({ docId, currentUser, showToast, clients, team, embedded, onOpenDoc, onDocChange }) {
      const store = useTaskStore();
      const members = arr(team && team.length ? team : store.members);
      const clientList = arr(clients && clients.length ? clients : store.clients);

      const [doc, setDoc] = useState(null);
      const [blocks, setBlocks] = useState([]);
      const [title, setTitle] = useState('');
      const [meta, setMeta] = useState({});
      const [rev, setRev] = useState(1);
      const [loading, setLoading] = useState(true);
      const [loadErr, setLoadErr] = useState(null);
      const [saveState, setSaveState] = useState('idle');
      const [savedAt, setSavedAt] = useState(null);
      const [conflict, setConflict] = useState(null);
      const [remoteAhead, setRemoteAhead] = useState(null);
      const [others, setOthers] = useState([]);
      const [slash, setSlash] = useState(null);
      const [mention, setMention] = useState(null);
      const [toolbar, setToolbar] = useState(null);
      const [linkAt, setLinkAt] = useState(null);
      const [focusAt, setFocusAt] = useState(null);
      const [pendingSel, setPendingSel] = useState(null);
      const [modal, setModal] = useState(null);
      const [menuRect, setMenuRect] = useState(null);
      const [aiBusy, setAiBusy] = useState(false);

      const rootRef = useRef(null), versionRef = useRef(1), dirtyRef = useRef(false), blocksRef = useRef([]),
            titleRef = useRef(''), metaRef = useRef({}), timerRef = useRef(null), dragRef = useRef(null),
            conflictRef = useRef(null), histRef = useRef({ stack: [], pos: -1 }), histTimer = useRef(null),
            slashRef = useRef(null), mentionRef = useRef(null), titleElRef = useRef(null);
      slashRef.current = slash; mentionRef.current = mention; conflictRef.current = conflict;

      const canEdit = !!(doc && doc.can_edit);
      const canManage = !!(doc && doc.can_manage);
      const isMeeting = !!(doc && doc.kind === 'meeting');

      const applyDoc = useCallback((d, opts) => {
        if (!d) return;
        setDoc(d);
        setTitle(d.title || ''); titleRef.current = d.title || '';
        const bl = arr(d.blocks).length ? arr(d.blocks) : [mkBlock('paragraph')];
        setBlocks(bl); blocksRef.current = bl;
        const mt = (d.meta && typeof d.meta === 'object' && !Array.isArray(d.meta)) ? d.meta : {};
        setMeta(mt); metaRef.current = mt;
        versionRef.current = d.version || 1;
        dirtyRef.current = false;
        setConflict(null); conflictRef.current = null; setRemoteAhead(null);
        setSaveState('idle'); setSavedAt(d.updated_at || null);
        setRev(r => r + 1);
        if (!opts || !opts.keepHistory) histRef.current = { stack: [{ blocks: bl, title: d.title || '' }], pos: 0 };
        onDocChange && onDocChange(d);
      }, [onDocChange]);

      const load = useCallback(async (opts) => {
        if (!docId) { setLoading(false); return; }
        if (!opts || !opts.silent) { setLoading(true); setLoadErr(null); }
        try { applyDoc(await DocAPI.get(docId), opts); }
        catch (e) { if (!opts || !opts.silent) setLoadErr(e && e.code === 'docs.unavailable' ? 'unavailable' : errMsg(e)); }
        finally { if (!opts || !opts.silent) setLoading(false); }
      }, [docId, applyDoc]);
      useEffect(() => { load(); }, [docId]);

      // ---- saving ----------------------------------------------------------
      const save = useCallback(async (opts) => {
        if (!docId || !dirtyRef.current) return;
        if (conflictRef.current && !(opts && opts.force)) return;
        clearTimeout(timerRef.current);
        setSaveState('saving');
        const patch = { title: titleRef.current, blocks: blocksRef.current, meta: metaRef.current };
        try {
          const r = await DocAPI.save(docId, versionRef.current, patch);
          if (r && r.ok) {
            versionRef.current = r.version; dirtyRef.current = false;
            setSaveState('saved'); setSavedAt(r.updated_at);
            setConflict(null); conflictRef.current = null; setRemoteAhead(null);
          } else if (r && r.conflict) {
            conflictRef.current = r; setConflict(r); setSaveState('error');
          } else setSaveState('idle');
        } catch (e) {
          setSaveState('error');
          if (e && e.code === 'docs.unavailable') setLoadErr('unavailable');
          else showToast && showToast('Could not save: ' + errMsg(e));
        }
      }, [docId, showToast]);

      const markDirty = useCallback(() => {
        dirtyRef.current = true;
        setSaveState('dirty');
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => save(), 1200);
      }, [save]);

      useEffect(() => () => { clearTimeout(timerRef.current); if (dirtyRef.current) save(); }, [save]);
      useEffect(() => {
        const onHide = () => { if (dirtyRef.current) save(); };
        const onVis = () => { if (document.visibilityState === 'hidden') onHide(); };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('beforeunload', onHide);
        return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('beforeunload', onHide); };
      }, [save]);

      // ---- presence + remote changes ---------------------------------------
      useEffect(() => {
        if (!docId || loadErr === 'unavailable') return;
        let alive = true;
        const tick = async () => {
          if (document.visibilityState !== 'visible') return;
          try {
            const r = await DocAPI.ping(docId, dirtyRef.current);
            if (!alive || !r) return;
            setOthers(arr(r.others));
            if (r.version !== versionRef.current) {
              if (!dirtyRef.current) load({ silent: true, keepHistory: true });
              else if (!conflictRef.current) setRemoteAhead(r.updated_by_name || 'Someone');
            }
          } catch (_) {}
        };
        const iv = setInterval(tick, 15000);
        tick();
        return () => { alive = false; clearInterval(iv); };
      }, [docId, loadErr, load]);

      // ---- history ---------------------------------------------------------
      const pushHistory = useCallback((bl, tt) => {
        clearTimeout(histTimer.current);
        histTimer.current = setTimeout(() => {
          const hs = histRef.current;
          const snap = { blocks: bl || blocksRef.current, title: tt == null ? titleRef.current : tt };
          hs.stack = hs.stack.slice(0, hs.pos + 1).concat([snap]).slice(-60);
          hs.pos = hs.stack.length - 1;
        }, 400);
      }, []);
      const applySnapshot = (snap) => {
        if (!snap) return;
        blocksRef.current = snap.blocks; setBlocks(snap.blocks);
        titleRef.current = snap.title; setTitle(snap.title);
        setRev(r => r + 1);
        dirtyRef.current = true; setSaveState('dirty');
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => save(), 1200);
      };
      const undo = () => { const hs = histRef.current; if (hs.pos <= 0) return; hs.pos--; applySnapshot(hs.stack[hs.pos]); };
      const redo = () => { const hs = histRef.current; if (hs.pos >= hs.stack.length - 1) return; hs.pos++; applySnapshot(hs.stack[hs.pos]); };

      // ---- block mutations -------------------------------------------------
      const commit = useCallback((next, opts) => {
        const list = arr(next).length ? next : [mkBlock('paragraph')];
        blocksRef.current = list; setBlocks(list);
        if (opts && opts.rev) setRev(r => r + 1);
        markDirty();
        pushHistory(list);
      }, [markDirty, pushHistory]);

      const setText = (id, spans) => commit(updateById(blocksRef.current, id, b => Object.assign({}, b, { text: spans })));
      const setProps = (id, patch) => commit(updateById(blocksRef.current, id, b =>
        Object.assign({}, b, { props: Object.assign({}, b.props || {}, patch) })));
      const insertAfterId = (id, list) => commit(insertRelative(blocksRef.current, id, list, 'after'), { rev: true });
      const replaceBlock = (id, list) => {
        const withNew = insertRelative(blocksRef.current, id, list, 'after');
        commit(removeById(withNew, id), { rev: true });
      };
      const appendChild = (parentId, block) => commit(insertInside(blocksRef.current, parentId, [block]), { rev: true });
      const appendRoot = (block) => commit(blocksRef.current.concat([block]), { rev: true });
      const removeBlock = (id) => {
        const ids = flatTextIds(blocksRef.current);
        const i = ids.indexOf(id);
        commit(removeById(blocksRef.current, id), { rev: true });
        if (i > 0) setFocusAt({ id: ids[i - 1], at: 'end' });
      };
      const turnInto = (id, item) => {
        commit(updateById(blocksRef.current, id, b => {
          const nb = Object.assign({}, b, {
            type: item.block,
            props: Object.assign({}, (b.props && b.props.indent) ? { indent: b.props.indent } : {}, item.props || {})
          });
          if (item.children && !arr(nb.children).length) nb.children = [mkBlock('paragraph')];
          if (!item.children && nb.children) delete nb.children;
          return nb;
        }), { rev: true });
        setFocusAt({ id, at: 'end' });
      };
      const duplicateBlock = (id) => {
        const b = findBlock(blocksRef.current, id);
        if (!b) return;
        commit(insertRelative(blocksRef.current, id, cloneBlocks([b]), 'after'), { rev: true });
      };
      const nudge = (id, dir) => {
        const list = listContaining(blocksRef.current, id);
        if (!list) return;
        const i = list.findIndex(b => b.id === id), j = i + dir;
        if (j < 0 || j >= list.length) return;
        commit(moveBlock(blocksRef.current, id, list[j].id, dir < 0 ? 'before' : 'after'), { rev: true });
      };
      const moveTo = (dragId, targetId, place) => commit(moveBlock(blocksRef.current, dragId, targetId, place), { rev: true });

      // ---- focus / selection restore ---------------------------------------
      useLayoutEffect(() => {
        if (!focusAt || !rootRef.current) return;
        const el = rootRef.current.querySelector('[data-bid="' + focusAt.id + '"] .dx-rt');
        if (el) setCaret(el, focusAt.at === 'end' ? (el.textContent || '').length : (focusAt.at || 0));
        setFocusAt(null);
      }, [focusAt, rev]);
      useLayoutEffect(() => {
        if (!pendingSel || !rootRef.current) return;
        const el = rootRef.current.querySelector('[data-bid="' + pendingSel.id + '"] .dx-rt');
        if (el) setSelectionRange(el, pendingSel.start, pendingSel.end);
        setPendingSel(null);
      }, [pendingSel, rev]);

      // ---- inline toolbar ---------------------------------------------------
      useEffect(() => {
        if (!canEdit) return;
        let raf = null;
        const onSel = () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount || sel.isCollapsed) { setToolbar(null); return; }
            const anchor = sel.anchorNode;
            const el = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
            const rt = el && el.closest ? el.closest('.dx-rt') : null;
            if (!rt || !rootRef.current || !rootRef.current.contains(rt)) { setToolbar(null); return; }
            const holder = rt.closest('[data-bid]');
            if (!holder) { setToolbar(null); return; }
            const bid = holder.getAttribute('data-bid');
            const b = findBlock(blocksRef.current, bid);
            if (!b || !isTextBlock(b)) { setToolbar(null); return; }
            const range = selectionRange(rt);
            if (!range || range.start === range.end) { setToolbar(null); return; }
            const spans = nodesToSpans(rt);
            const marks = {};
            MARKS.forEach(k => { marks[k] = spansMarkAt(spans, range.start, range.end, k); });
            const r = sel.getRangeAt(0).getBoundingClientRect();
            setToolbar({ id: bid, start: range.start, end: range.end, marks,
                         rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } });
          });
        };
        document.addEventListener('selectionchange', onSel);
        return () => { document.removeEventListener('selectionchange', onSel); cancelAnimationFrame(raf); };
      }, [canEdit]);

      const applyMark = (key, value) => {
        const t = toolbar;
        if (!t) return;
        const b = findBlock(blocksRef.current, t.id);
        if (!b) return;
        let next;
        if (value === null) {
          const cur = spansMarkAt(b.text, t.start, t.end, key);
          if (!cur) return;
          next = spansToggleMark(b.text, t.start, t.end, key, cur);
        } else next = spansToggleMark(b.text, t.start, t.end, key, value);
        commit(updateById(blocksRef.current, t.id, x => Object.assign({}, x, { text: next })), { rev: true });
        setPendingSel({ id: t.id, start: t.start, end: t.end });
      };

      // ---- keyboard ---------------------------------------------------------
      const onKeys = (block, e, info) => {
        if (e.defaultPrevented) return;
        const mod = e.metaKey || e.ctrlKey;
        const key = e.key;
        const spans = info.spans, len = spansLen(spans);
        const caret = info.caret == null ? len : info.caret;
        const sel = info.sel || { start: caret, end: caret, collapsed: true };
        const markSel = (mk) => {
          if (sel.start === sel.end) return;
          commit(updateById(blocksRef.current, block.id, x => Object.assign({}, x, { text: spansToggleMark(spans, sel.start, sel.end, mk) })), { rev: true });
          setPendingSel({ id: block.id, start: sel.start, end: sel.end });
        };
        if (mod && key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (mod && key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
        if (mod && e.shiftKey && key.toLowerCase() === 's') { e.preventDefault(); markSel('s'); return; }
        if (mod && !e.shiftKey && ['b', 'i', 'u', 'e'].indexOf(key.toLowerCase()) >= 0) {
          e.preventDefault();
          markSel(key.toLowerCase() === 'e' ? 'code' : key.toLowerCase());
          return;
        }
        if (mod && key.toLowerCase() === 'k') {
          e.preventDefault();
          if (sel.start !== sel.end) setLinkAt({ id: block.id, start: sel.start, end: sel.end, rect: caretRect(info.el), initial: spansMarkAt(spans, sel.start, sel.end, 'link') });
          return;
        }
        if (mod && key === 'Enter' && block.type === 'todo') { e.preventDefault(); setProps(block.id, { checked: !(block.props && block.props.checked) }); return; }
        if (key === 'Escape') { setSlash(null); setMention(null); setToolbar(null); return; }
        if (key === 'Enter' && !e.shiftKey && block.type !== 'code') {
          e.preventDefault();
          if (!len && LIST_TYPES.indexOf(block.type) >= 0) {
            const ind = (block.props && block.props.indent) || 0;
            if (ind > 0) setProps(block.id, { indent: ind - 1 });
            else turnInto(block.id, { block: 'paragraph' });
            return;
          }
          const left = spansSlice(spans, 0, sel.start), right = spansSlice(spans, sel.end, len);
          const contType = LIST_TYPES.indexOf(block.type) >= 0 ? block.type : 'paragraph';
          const props = {};
          if (block.props && block.props.indent) props.indent = block.props.indent;
          if (block.type === 'todo') props.checked = false;
          const nb = mkBlock(contType, right, Object.keys(props).length ? props : undefined);
          let next = updateById(blocksRef.current, block.id, b => Object.assign({}, b, { text: left }));
          if (block.type === 'toggle' && (block.props || {}).open !== false) {
            next = updateById(next, block.id, b => Object.assign({}, b, { children: [nb].concat(arr(b.children)) }));
          } else next = insertRelative(next, block.id, [nb], 'after');
          commit(next, { rev: true });
          setFocusAt({ id: nb.id, at: 0 });
          return;
        }
        if (key === 'Enter' && (e.shiftKey || block.type === 'code')) {
          e.preventDefault();
          const merged = spansConcat(spansConcat(spansSlice(spans, 0, sel.start), [{ t: '\n' }]), spansSlice(spans, sel.end, len));
          commit(updateById(blocksRef.current, block.id, b => Object.assign({}, b, { text: merged })), { rev: true });
          setFocusAt({ id: block.id, at: sel.start + 1 });
          return;
        }
        if (key === 'Backspace' && sel.collapsed && caret === 0) {
          const ind = (block.props && block.props.indent) || 0;
          if (ind > 0) { e.preventDefault(); setProps(block.id, { indent: ind - 1 }); return; }
          if (block.type !== 'paragraph') { e.preventDefault(); turnInto(block.id, { block: 'paragraph' }); return; }
          const ids = flatTextIds(blocksRef.current);
          const i = ids.indexOf(block.id);
          if (i > 0) {
            e.preventDefault();
            const prev = findBlock(blocksRef.current, ids[i - 1]);
            if (!prev) return;
            const at = spansLen(prev.text);
            let next = updateById(blocksRef.current, prev.id, b => Object.assign({}, b, { text: spansConcat(b.text, spans) }));
            next = removeById(next, block.id);
            commit(next, { rev: true });
            setFocusAt({ id: prev.id, at });
          }
          return;
        }
        if (key === 'Tab' && LIST_TYPES.concat(['toggle']).indexOf(block.type) >= 0) {
          e.preventDefault();
          const ind = (block.props && block.props.indent) || 0;
          setProps(block.id, { indent: Math.max(0, Math.min(4, ind + (e.shiftKey ? -1 : 1))) });
          return;
        }
        if ((key === 'ArrowUp' || key === 'ArrowDown') && sel.collapsed) {
          const ids = flatTextIds(blocksRef.current);
          const i = ids.indexOf(block.id);
          if (key === 'ArrowUp' && caret === 0 && i > 0) { e.preventDefault(); setFocusAt({ id: ids[i - 1], at: 'end' }); }
          if (key === 'ArrowDown' && caret >= len && i >= 0 && i < ids.length - 1) { e.preventDefault(); setFocusAt({ id: ids[i + 1], at: 0 }); }
        }
      };

      // ---- typing triggers (markdown shortcuts, / and @) --------------------
      const onInputMeta = (block, m) => {
        const plain = m.plain, caret = m.caret;
        const sc = matchBlockShortcut(plain);
        if (sc && isTextBlock(block)) {
          const rest = spansSlice(m.spans, sc.cut, spansLen(m.spans));
          setSlash(null);
          if (sc.type === 'divider') {
            const nb = mkBlock('paragraph', rest);
            let next = updateById(blocksRef.current, block.id, b => Object.assign({}, b, { type: 'divider', text: [] }));
            next = insertRelative(next, block.id, [nb], 'after');
            commit(next, { rev: true });
            setFocusAt({ id: nb.id, at: 0 });
          } else {
            commit(updateById(blocksRef.current, block.id, b => {
              const nb = Object.assign({}, b, { type: sc.type, text: rest, props: Object.assign({}, b.props || {}, sc.props || {}) });
              if (sc.type === 'toggle' && !arr(nb.children).length) nb.children = [mkBlock('paragraph')];
              return nb;
            }), { rev: true });
            setFocusAt({ id: block.id, at: 0 });
          }
          return;
        }
        const s = slashRef.current;
        if (s && s.blockId === block.id) {
          if (caret == null || caret <= s.start || plain.charAt(s.start) !== '/') setSlash(null);
          else setSlash(Object.assign({}, s, { query: plain.slice(s.start + 1, caret) }));
        } else if (caret != null && caret > 0 && plain.charAt(caret - 1) === '/' && (caret === 1 || /\s/.test(plain.charAt(caret - 2)))) {
          setSlash({ blockId: block.id, start: caret - 1, rect: caretRect(m.el), query: '' });
        }
        const mn = mentionRef.current;
        if (mn && mn.blockId === block.id) {
          if (caret == null || caret <= mn.start || plain.charAt(mn.start) !== '@') setMention(null);
          else setMention(Object.assign({}, mn, { query: plain.slice(mn.start + 1, caret) }));
        } else if (caret != null && caret > 0 && plain.charAt(caret - 1) === '@' && (caret === 1 || /\s/.test(plain.charAt(caret - 2)))) {
          setMention({ blockId: block.id, start: caret - 1, rect: caretRect(m.el), query: '' });
        }
      };

      const pasteBlocks = (block, list, info) => {
        const cur = info && info.spans ? info.spans : block.text;
        let next = insertRelative(blocksRef.current, block.id, list, 'after');
        if (!spansLen(cur)) next = removeById(next, block.id);
        commit(next, { rev: true });
        const last = list[list.length - 1];
        if (last && isTextBlock(last)) setFocusAt({ id: last.id, at: 'end' });
      };

      const pickSlash = (item) => {
        const s = slashRef.current;
        if (!s) return;
        const b = findBlock(blocksRef.current, s.blockId);
        setSlash(null);
        if (!b) return;
        const full = b.text;
        const upto = s.start + 1 + String(s.query || '').length;
        const cleaned = spansConcat(spansSlice(full, 0, s.start), spansSlice(full, upto, spansLen(full)));
        if (item.mention) {
          commit(updateById(blocksRef.current, b.id, x => Object.assign({}, x, { text: cleaned })), { rev: true });
          setFocusAt({ id: b.id, at: s.start });
          setTimeout(() => {
            const el = rootRef.current && rootRef.current.querySelector('[data-bid="' + b.id + '"] .dx-rt');
            setMention({ blockId: b.id, start: s.start, rect: el ? caretRect(el) : s.rect, query: '' });
          }, 40);
          return;
        }
        if (item.block) {
          commit(updateById(blocksRef.current, b.id, x => {
            const nb = Object.assign({}, x, { type: item.block, text: cleaned, props: Object.assign({}, x.props || {}, item.props || {}) });
            if (item.children && !arr(nb.children).length) nb.children = [mkBlock('paragraph')];
            return nb;
          }), { rev: true });
          setFocusAt({ id: b.id, at: s.start });
          return;
        }
        const nb = item.insert ? item.insert({ clientId: doc && doc.client_id }) : mkBlock('paragraph');
        const trailer = mkBlock('paragraph');
        let next = updateById(blocksRef.current, b.id, x => Object.assign({}, x, { text: cleaned }));
        next = insertRelative(next, b.id, [nb], 'after');
        next = insertRelative(next, nb.id, [trailer], 'after');
        if (!spansLen(cleaned)) next = removeById(next, b.id);
        commit(next, { rev: true });
        setFocusAt({ id: trailer.id, at: 0 });
      };

      const pickMention = (item) => {
        const mn = mentionRef.current;
        if (!mn) return;
        const b = findBlock(blocksRef.current, mn.blockId);
        setMention(null);
        if (!b) return;
        const full = b.text;
        const upto = mn.start + 1 + String(mn.query || '').length;
        const label = (item.kind === 'member' ? '@' : '') + String(item.label || '').slice(0, 90);
        const chip = [{ mention: { kind: item.kind, id: item.id, label } }];
        const next = spansConcat(spansConcat(spansSlice(full, 0, mn.start), chip),
                                 spansConcat([{ t: ' ' }], spansSlice(full, upto, spansLen(full))));
        commit(updateById(blocksRef.current, b.id, x => Object.assign({}, x, { text: next })), { rev: true });
        setFocusAt({ id: b.id, at: mn.start + label.length + 1 });
      };

      // ---- doc-level actions -------------------------------------------------
      const reloadDoc = () => load({ silent: false });
      const setDocAttr = async (patch) => {
        try { const lite = await DocAPI.set(docId, patch); setDoc(d => Object.assign({}, d, lite)); onDocChange && onDocChange(Object.assign({}, doc, lite)); }
        catch (e) { showToast && showToast(errMsg(e)); }
      };
      const doDuplicate = async () => {
        try { const d = await DocAPI.duplicate(docId, true); showToast && showToast('Duplicated'); onOpenDoc && onOpenDoc(d.id); }
        catch (e) { showToast && showToast(errMsg(e)); }
      };
      const doDelete = async () => {
        try { await DocAPI.remove(docId); showToast && showToast('Moved to trash'); onOpenDoc && onOpenDoc(null); }
        catch (e) { showToast && showToast(errMsg(e)); }
      };
      const saveAsTemplate = async () => {
        try {
          await DocAPI.create({ title: (titleRef.current || 'Untitled') + ' (template)', blocks: blocksRef.current, is_template: true, kind: 'doc' });
          showToast && showToast('Saved to templates');
        } catch (e) { showToast && showToast(errMsg(e)); }
      };

      // ---- meeting notes ------------------------------------------------------
      const actionItems = useMemo(() => flatBlocks(blocks)
        .filter(b => b.type === 'todo' && !(b.props && b.props.task_id) && !(b.props && b.props.checked) && spansLen(b.text))
        .map(b => ({ blockId: b.id, title: blockPlain(b), assignee_id: (b.props && b.props.assignee_id) || null, due: (b.props && b.props.due) || null })), [blocks]);

      const onTasksCreated = (done) => {
        let next = blocksRef.current;
        done.forEach(d => {
          if (!d.task_id) return;
          next = updateById(next, d.blockId, b => Object.assign({}, b, {
            props: Object.assign({}, b.props || {}, { task_id: d.task_id, task_custom_id: d.custom_id })
          }));
        });
        commit(next, { rev: true });
      };

      const aiExtract = async () => {
        const ai = window.AMS_AI;
        if (!ai || !ai.enabled) return;
        setAiBusy(true);
        try {
          const res = await ai.run('meeting_actions', {
            text: blocksPlain(blocksRef.current), title: titleRef.current,
            client_id: (doc && doc.client_id) || null,
            attendees: arr(metaRef.current.attendees).map(id => (members.find(m => m.id === id) || {}).name).filter(Boolean)
          });
          const items = Array.isArray(res) ? res : arr(res && (res.items || res.actions || res.action_items));
          if (!items.length) { showToast && showToast('AI found no action items'); setAiBusy(false); return; }
          const blocksNew = items.map(it => {
            const t = typeof it === 'string' ? it : (it.title || it.text || it.task || '');
            const who = typeof it === 'object' ? (it.assignee || it.assignee_name || it.owner) : null;
            const m = who ? members.find(x => String(x.name || '').toLowerCase() === String(who).toLowerCase()) : null;
            const props = { checked: false };
            if (m) { props.assignee_id = m.id; props.assignee_name = m.name; }
            else if (who) props.assignee_name = String(who);
            if (typeof it === 'object' && (it.due || it.due_at)) props.due = it.due || it.due_at;
            return mkBlock('todo', textSpans(String(t).slice(0, 300)), props);
          }).filter(b => spansLen(b.text));
          const head = mkBlock('h2', textSpans('Action items'));
          commit(blocksRef.current.concat([head]).concat(blocksNew), { rev: true });
          showToast && showToast(blocksNew.length + ' action items added');
        } catch (e) { showToast && showToast('AI extraction failed: ' + errMsg(e)); }
        setAiBusy(false);
      };

      // ---- render ------------------------------------------------------------
      const ctx = {
        readOnly: !canEdit, rev, rootBlocks: blocks, clients: clientList, currentUser, showToast,
        isMeeting, allowCheck: false,
        docInfo: doc ? { id: doc.id, title, client_id: doc.client_id, kind: doc.kind } : null,
        getDocText: () => blocksPlain(blocksRef.current),
        dragRef, setText, setProps, remove: removeBlock, insertAfter: insertAfterId, replaceBlock,
        appendChild, appendRoot, setFocus: setFocusAt, onKeys, onInputMeta, pasteBlocks,
        turnInto, duplicateBlock, nudge, moveTo
      };

      if (loading) return h`<div class="dx-root" style=${{ padding: 24 }}><${Skel}/><${Skel}/><${Skel}/></div>`;
      if (loadErr === 'unavailable') {
        return h`<div class="dx-root"><${DocEmpty} icon="ti-file-off" title="Docs aren't switched on yet"
          sub="Run migration 097_docs.sql in Supabase and this page comes to life."/></div>`;
      }
      if (loadErr) {
        return h`<div class="dx-root"><${DocEmpty} icon="ti-alert-triangle" title="Couldn't open this doc" sub=${loadErr}
          action=${h`<button class="dx-btn" onClick=${reloadDoc}>Try again</button>`}/></div>`;
      }
      if (!doc) return null;

      const saveLabel = saveState === 'saving' ? 'Saving…'
        : saveState === 'dirty' ? 'Unsaved changes'
        : saveState === 'error' ? 'Not saved'
        : savedAt ? 'Saved ' + fmtRelative(savedAt) : 'Saved';

      return h`<div class="dx-root dx-main" ref=${rootRef}>
        <div class="dx-top">
          ${!embedded && h`<div class="dx-crumbs">
            ${arr(doc.path).map(p => h`<${Fragment} key=${p.id}>
              <button onClick=${() => onOpenDoc && onOpenDoc(p.id)}>${p.icon ? p.icon + ' ' : ''}${p.title || 'Untitled'}</button>
              <span>/</span>
            <//>`)}
            <span style=${{ color: 'var(--cu-t2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ${doc.icon ? doc.icon + ' ' : ''}${title || 'Untitled'}
            </span>
          </div>`}
          ${embedded && h`<div class="dx-crumbs"><span style=${{ fontWeight: 600, color: 'var(--cu-t2)' }}>
            ${doc.icon ? doc.icon + ' ' : ''}${title || 'Untitled'}</span></div>`}
          <span class="dx-save" aria-live="polite">
            ${saveState === 'saving' ? h`<i class="ti ti-loader-2 dx-spin"></i>` : null}
            ${saveState === 'error' ? h`<i class="ti ti-alert-circle" style=${{ color: '#e5484d' }}></i>` : null}
            ${canEdit ? saveLabel : 'Read only'}
          </span>
          ${arr(others).slice(0, 3).map(o => h`<span key=${o.id} title=${o.name + (o.editing ? ' is editing' : ' is viewing')}>
            <${Av} i=${o.initials} c=${o.color} s=${22} round=${true}/></span>`)}
          <button class=${'dx-ibtn' + (doc.is_favorite ? ' on' : '')} title="Favourite" aria-label="Favourite"
            onClick=${async () => {
              if (!TaskAPI || !TaskAPI.favoriteToggle) return;
              try { const r = await TaskAPI.favoriteToggle('doc', doc.id, title || 'Doc', docHash(doc.id)); setDoc(d => Object.assign({}, d, { is_favorite: r && r.on })); }
              catch (e) { showToast && showToast(errMsg(e)); }
            }}><i class=${'ti ' + (doc.is_favorite ? 'ti-star-filled' : 'ti-star')}></i></button>
          ${canManage && h`<button class="dx-ibtn" title="Share" aria-label="Share" onClick=${() => setModal('share')}><i class="ti ti-share"></i></button>`}
          <button class="dx-ibtn" title="More" aria-label="More actions" onClick=${(e) => setMenuRect(e.currentTarget.getBoundingClientRect())}>
            <i class="ti ti-dots"></i></button>
        </div>

        <div class="dx-scroll">
          <div class=${'dx-page' + (embedded ? ' narrow' : '')}>
            ${conflict && h`<div class="dx-banner warn">
              <i class="ti ti-git-merge"></i>
              <span style=${{ flex: 1 }}>${(conflict.updated_by_name || 'Someone') + ' saved a newer version while you were editing.'}</span>
              <button class="dx-btn dx-btn-sm" onClick=${() => { applyDoc(conflict.doc || doc); }}>Load theirs</button>
              <button class="dx-btn dx-btn-sm" onClick=${() => {
                versionRef.current = conflict.version; conflictRef.current = null; setConflict(null);
                dirtyRef.current = true; save({ force: true });
              }}>Keep mine</button>
              <button class="dx-btn dx-btn-sm" onClick=${async () => {
                (await copyText(blocksToMarkdown(blocksRef.current))) && showToast && showToast('Your version copied as Markdown');
              }}>Copy mine</button>
            </div>`}
            ${!conflict && remoteAhead && h`<div class="dx-banner info">
              <i class="ti ti-info-circle"></i>
              <span style=${{ flex: 1 }}>${remoteAhead + ' has saved changes since you started editing. Your save will flag a conflict.'}</span>
              <button class="dx-btn dx-btn-sm" onClick=${() => save()}>Save now</button>
            </div>`}

            <div style=${{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              ${canEdit
                ? h`<button class="dx-ibtn" style=${{ fontSize: 26, width: 40, height: 44 }} title="Change icon"
                    onClick=${() => {
                      const icons = ['📄', '📘', '📝', '✨', '📊', '🎯', '🎬', '🧭', '🗂️', '💡', '🚀', '🧪'];
                      const cur = icons.indexOf(doc.icon || '📄');
                      setDocAttr({ icon: icons[(cur + 1) % icons.length] });
                    }}>${doc.icon || '📄'}</button>`
                : h`<span style=${{ fontSize: 26, lineHeight: '44px' }}>${doc.icon || '📄'}</span>`}
              ${canEdit
                ? h`<textarea ref=${titleElRef} class="dx-title" rows="1" placeholder="Untitled" value=${title}
                    onInput=${(e) => {
                      const v = e.target.value.replace(/\n/g, '');
                      setTitle(v); titleRef.current = v; markDirty();
                      e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onKeyDown=${(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const first = flatTextIds(blocksRef.current)[0];
                        if (first) setFocusAt({ id: first, at: 0 });
                      }
                    }}/>`
                : h`<h1 class="dx-title" style=${{ margin: 0 }}>${title || 'Untitled'}</h1>`}
            </div>

            ${arr(doc.tags).length > 0 && h`<div style=${{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
              ${arr(doc.tags).map(t => h`<span key=${t} class="dx-tag">#${t}</span>`)}
            </div>`}

            ${isMeeting && h`<div class="dx-metabar">
              <span class="lb">Meeting</span>
              <input class="dx-input" type="date" style=${{ width: 150 }} disabled=${!canEdit}
                value=${(meta.date || '').slice(0, 10)}
                onChange=${(e) => { const m = Object.assign({}, metaRef.current, { date: e.target.value }); metaRef.current = m; setMeta(m); markDirty(); }}/>
              <span class="lb">Attendees</span>
              <select class="dx-input" style=${{ width: 170 }} disabled=${!canEdit} value=""
                onChange=${(e) => {
                  if (!e.target.value) return;
                  const list = arr(metaRef.current.attendees);
                  if (list.indexOf(e.target.value) < 0) {
                    const m = Object.assign({}, metaRef.current, { attendees: list.concat([e.target.value]) });
                    metaRef.current = m; setMeta(m); markDirty();
                  }
                  e.target.value = '';
                }}>
                <option value="">Add someone…</option>
                ${members.map(m => h`<option key=${m.id} value=${m.id}>${m.name}</option>`)}
              </select>
              ${arr(meta.attendees).map(id => {
                const m = members.find(x => x.id === id);
                return m ? h`<span key=${id} class="dx-chip">
                  <${Av} i=${m.initials} c=${m.color} s=${16} round=${true}/>${m.name}
                  ${canEdit ? h`<button class="dx-ibtn" style=${{ width: 16, height: 16, fontSize: 12 }} aria-label=${'Remove ' + m.name}
                    onClick=${() => {
                      const mt = Object.assign({}, metaRef.current, { attendees: arr(metaRef.current.attendees).filter(x => x !== id) });
                      metaRef.current = mt; setMeta(mt); markDirty();
                    }}><i class="ti ti-x"></i></button>` : null}
                </span>` : null;
              })}
              <span style=${{ flex: 1 }}></span>
              ${window.AMS_AI && window.AMS_AI.enabled && canEdit && h`<button class="dx-btn dx-btn-sm" disabled=${aiBusy} onClick=${aiExtract}>
                ${aiBusy ? h`<i class="ti ti-loader-2 dx-spin"></i>` : h`<i class="ti ti-sparkles"></i>`}Extract action items</button>`}
              ${canEdit && h`<button class="dx-btn dx-btn-sm dx-btn-pri" disabled=${!actionItems.length} onClick=${() => setModal('tasks')}>
                <i class="ti ti-subtask"></i>Create tasks (${actionItems.length})</button>`}
            </div>`}

            <${BlockList} list=${blocks} ctx=${ctx}/>
          </div>
        </div>

        ${slash && canEdit && h`<${SlashMenu} state=${slash} ctx=${ctx} onClose=${() => setSlash(null)} onPick=${pickSlash}/>`}
        ${mention && canEdit && h`<${MentionMenu} state=${mention} members=${members} onClose=${() => setMention(null)} onPick=${pickMention}/>`}
        ${toolbar && canEdit && !slash && !mention && h`<${InlineToolbar} state=${toolbar}
          onMark=${applyMark}
          onLink=${() => setLinkAt({ id: toolbar.id, start: toolbar.start, end: toolbar.end, rect: toolbar.rect, initial: toolbar.marks.link })}
          onClose=${() => setToolbar(null)}/>`}
        ${linkAt && h`<${LinkDialog} rect=${linkAt.rect} initial=${linkAt.initial}
          onClose=${() => setLinkAt(null)}
          onApply=${(url) => {
            const b = findBlock(blocksRef.current, linkAt.id);
            if (b) {
              const cur = spansMarkAt(b.text, linkAt.start, linkAt.end, 'link');
              const next = url
                ? spansToggleMark(b.text, linkAt.start, linkAt.end, 'link', cur === url ? url : url)
                : (cur ? spansToggleMark(b.text, linkAt.start, linkAt.end, 'link', cur) : b.text);
              commit(updateById(blocksRef.current, b.id, x => Object.assign({}, x, { text: url && cur === url ? x.text : next })), { rev: true });
            }
            setLinkAt(null);
          }}/>`}

        ${menuRect && h`<${FloatPanel} rect=${menuRect} width=${238} align="end" onClose=${() => setMenuRect(null)}>
          <div class="dx-mm">
            <button class="dx-mi" onClick=${() => { setMenuRect(null); setModal('history'); }}><i class="ti ti-history"></i>Version history</button>
            ${canManage ? h`<button class="dx-mi" onClick=${() => { setMenuRect(null); setModal('share'); }}><i class="ti ti-share"></i>Share…</button>` : null}
            <button class="dx-mi" onClick=${() => { setMenuRect(null); doDuplicate(); }}><i class="ti ti-copy"></i>Duplicate</button>
            ${canEdit && !doc.sys_key ? h`<button class="dx-mi" onClick=${() => { setMenuRect(null); setModal('move'); }}><i class="ti ti-arrows-move"></i>Move to…</button>` : null}
            ${canEdit ? h`<button class="dx-mi" onClick=${() => { setMenuRect(null); setDocAttr({ is_wiki: !doc.is_wiki }); }}>
              <i class=${'ti ' + (doc.is_wiki ? 'ti-book-off' : 'ti-book')}></i>${doc.is_wiki ? 'Remove from wiki' : 'Mark as wiki'}</button>` : null}
            ${canEdit ? h`<button class="dx-mi" onClick=${() => {
              setMenuRect(null);
              const v = window.prompt('Tags (comma separated)', arr(doc.tags).join(', '));
              if (v != null) setDocAttr({ tags: v.split(',').map(x => x.trim()).filter(Boolean) });
            }}><i class="ti ti-tag"></i>Tags…</button>` : null}
            <button class="dx-mi" onClick=${async () => { setMenuRect(null); (await copyText(location.origin + location.pathname + docHash(doc.id))) && showToast && showToast('Link copied'); }}>
              <i class="ti ti-link"></i>Copy link</button>
            <button class="dx-mi" onClick=${() => { setMenuRect(null); downloadText((title || 'doc').replace(/[^\w.-]+/g, '-') + '.md', '# ' + (title || 'Untitled') + '\n\n' + blocksToMarkdown(blocksRef.current)); }}>
              <i class="ti ti-download"></i>Export Markdown</button>
            <button class="dx-mi" onClick=${() => { setMenuRect(null); setTimeout(() => window.print(), 60); }}><i class="ti ti-printer"></i>Print</button>
            ${canManage ? h`<button class="dx-mi" onClick=${() => { setMenuRect(null); saveAsTemplate(); }}><i class="ti ti-template"></i>Save as template</button>` : null}
            ${canManage && !doc.sys_key ? h`<button class="dx-mi" onClick=${() => { setMenuRect(null); setDocAttr({ archived: !doc.archived_at }); }}>
              <i class="ti ti-archive"></i>${doc.archived_at ? 'Unarchive' : 'Archive'}</button>` : null}
            ${canManage && !doc.sys_key ? h`<button class="dx-mi" style=${{ color: '#e5484d' }} onClick=${() => { setMenuRect(null); setModal('delete'); }}>
              <i class="ti ti-trash" style=${{ color: '#e5484d' }}></i>Delete</button>` : null}
          </div>
        <//>`}

        ${modal === 'history' && h`<${HistoryModal} docId=${docId} showToast=${showToast}
          onRestored=${(d) => applyDoc(d)} onClose=${() => setModal(null)}/>`}
        ${modal === 'share' && h`<${ShareModal} doc=${Object.assign({}, doc, { title })} members=${members} showToast=${showToast}
          onSaved=${(r) => setDoc(d => Object.assign({}, d, { sharing: r.sharing, shares: r.shares }))}
          onClose=${() => setModal(null)}/>`}
        ${modal === 'move' && h`<${MoveModal} doc=${doc} showToast=${showToast}
          onMoved=${() => load({ silent: true, keepHistory: true })} onClose=${() => setModal(null)}/>`}
        ${modal === 'tasks' && h`<${CreateTasksModal} items=${actionItems} clientId=${doc.client_id} showToast=${showToast}
          onCreated=${onTasksCreated} onClose=${() => setModal(null)}/>`}
        ${modal === 'delete' && h`<${Confirm} title="Delete this doc?" danger=${true} confirmLabel="Delete"
          body=${'“' + (title || 'Untitled') + '” and its subpages move to the trash for 30 days.'}
          onConfirm=${doDelete} onClose=${() => setModal(null)}/>`}
      </div>`;
    }

    // =========================================================================
    // Templates
    // =========================================================================
    const B = {
      p: (t) => mkBlock('paragraph', textSpans(t || '')),
      h1: (t) => mkBlock('h1', textSpans(t)),
      h2: (t) => mkBlock('h2', textSpans(t)),
      h3: (t) => mkBlock('h3', textSpans(t)),
      li: (t) => mkBlock('bullet', textSpans(t)),
      num: (t) => mkBlock('numbered', textSpans(t)),
      todo: (t) => mkBlock('todo', textSpans(t), { checked: false }),
      quote: (t) => mkBlock('quote', textSpans(t)),
      div: () => mkBlock('divider'),
      toc: () => mkBlock('toc', [], { sticky: false }),
      callout: (t, tone, emoji) => mkBlock('callout', textSpans(t), { tone: tone || 'info', emoji: emoji || '💡' }),
      table: (rows, header) => mkBlock('table', [], { header: header !== false, rows: rows.map(r => r.map(c => textSpans(c))) }),
      tasks: (title, filter) => mkBlock('task_list', [], { title: title, limit: 10, filter: Object.assign({ include_closed: false }, filter || {}) })
    };
    const TEMPLATES = [
      { key: 'blank', label: 'Blank page', icon: 'ti-file', desc: 'Start from nothing', build: () => ({ blocks: [mkBlock('paragraph')] }) },
      { key: 'client_brief', label: 'Client brief', icon: 'ti-briefcase', desc: 'Business, audience, goals, voice', build: (c) => ({
        title: (c.clientName ? c.clientName + ' — ' : '') + 'Client brief',
        blocks: [B.callout('Everything a new team member needs before touching this account.', 'brand', '📌'),
          B.h2('The business'), B.p(''), B.h2('Audience'), B.li('Who they are'), B.li('What they care about'),
          B.h2('Goals this quarter'), B.num(''), B.h2('Offers & pricing'), B.p(''),
          B.h2('Voice & tone'), B.li('Sounds like'), B.li('Never sounds like'),
          B.h2("Do / Don't"), B.table([['Do', "Don't"], ['', '']]), B.h2('Competitors'), B.li(''),
          B.h2('Links'), B.li('Drive folder'), B.li('Brand kit')] }) },
      { key: 'brand_sop', label: 'Brand SOP', icon: 'ti-book', desc: 'Approval, posting, comms, crisis', build: (c) => ({
        title: (c.clientName ? c.clientName + ' — ' : '') + 'Brand SOP', is_wiki: true,
        blocks: [B.callout('Internal guide for managing ' + (c.clientName || 'this brand') + '.', 'brand', '📘'),
          B.h2('Content approval process'), B.p(''), B.h2('Posting rules & schedule'), B.p(''),
          B.h2('Client communication'), B.p(''), B.h2('Content restrictions'), B.p(''),
          B.h2('Crisis management'), B.p(''), B.h2('Special instructions'), B.p('')] }) },
      { key: 'shoot_plan', label: 'Shoot plan', icon: 'ti-camera', desc: 'Call sheet, shot list, gear', build: (c) => ({
        title: (c.clientName ? c.clientName + ' — ' : '') + 'Shoot plan',
        blocks: [B.callout('Share this with the crew the day before.', 'warn', '🎬'),
          B.h2('Call sheet'), B.table([['Time', 'What', 'Who'], ['', '', '']]),
          B.h2('Shot list'), B.table([['#', 'Shot', 'Notes'], ['1', '', '']]),
          B.h2('Gear'), B.todo('Camera + lenses'), B.todo('Lights'), B.todo('Audio'), B.todo('Batteries & cards'),
          B.h2('Wardrobe / props'), B.li(''), B.h2('Post-production notes'), B.p('')] }) },
      { key: 'monthly_strategy', label: 'Monthly strategy', icon: 'ti-target-arrow', desc: 'Goals, pillars, calendar notes', build: (c) => ({
        title: (c.clientName ? c.clientName + ' — ' : '') + 'Monthly strategy',
        blocks: [B.h2('Goals'), B.li(''), B.h2('Content pillars'),
          B.table([['Pillar', 'Format', 'Cadence'], ['', '', '']]),
          B.h2('This month at a glance'), B.tasks('Posts in flight', c.clientId ? { client_ids: [c.clientId] } : { scope: 'my' }),
          B.h2('Campaigns'), B.li(''), B.h2('What we learned last month'), B.p('')] }) },
      { key: 'meeting_notes', label: 'Meeting notes', icon: 'ti-users', desc: 'Agenda, notes, action items → tasks', kind: 'meeting', build: (c) => ({
        title: (c.clientName ? c.clientName + ' — ' : '') + 'Meeting notes',
        meta: { date: new Date().toISOString().slice(0, 10), attendees: [] },
        blocks: [B.h2('Agenda'), B.li(''), B.h2('Notes'), B.p(''),
          B.h2('Decisions'), B.li(''), B.h2('Action items'), B.todo(''),
          B.callout('Tick nothing here — press “Create tasks” above and each open item becomes a real task.', 'info', '💡')] }) },
      { key: 'sop_manual', label: 'SOP manual', icon: 'ti-list-check', desc: 'Purpose, steps, escalation', build: () => ({
        title: 'SOP — ', is_wiki: true,
        blocks: [B.toc(), B.h2('Purpose'), B.p(''), B.h2('When to use this'), B.p(''),
          B.h2('Steps'), B.num(''), B.num(''), B.h2('Quality checks'), B.todo(''),
          B.h2('Escalation'), B.p(''), B.h2('Owner & last review'), B.p('')] }) },
      { key: 'team_onboarding', label: 'Team onboarding', icon: 'ti-user-plus', desc: 'First week, tools, who’s who', build: () => ({
        title: 'Team onboarding', is_wiki: true,
        blocks: [B.callout('Welcome aboard! Work top to bottom in your first week.', 'success', '🎉'),
          B.h2('First week checklist'), B.todo('Accounts & logins'), B.todo('Read the brand SOPs'),
          B.todo('Shadow a content review'), B.todo('First task assigned'),
          B.h2('Tools we use'), B.li('Dashboard — tasks, calendar, approvals'), B.li('Drive — creatives'), B.li('WhatsApp — day-to-day'),
          B.h2("Who's who"), B.table([['Name', 'Role', 'Ask them about'], ['', '', '']]),
          B.h2('How we work'), B.li('Deadlines are dates, not vibes'), B.li('Everything lives in the dashboard')] }) }
    ];

    // =========================================================================
    // New doc / import
    // =========================================================================
    function NewDocModal({ clients, defaultClientId, onClose, onCreate }) {
      const [tpl, setTpl] = useState('blank');
      const [title, setTitle] = useState('');
      const [clientId, setClientId] = useState(defaultClientId && defaultClientId !== 'agency' ? defaultClientId : '');
      const [busy, setBusy] = useState(false);
      const create = async () => {
        const t = TEMPLATES.find(x => x.key === tpl) || TEMPLATES[0];
        const client = arr(clients).find(c => c.id === clientId);
        const built = t.build({ clientName: client ? client.name : '', clientId: clientId || null }) || {};
        setBusy(true);
        await onCreate({
          title: (title || built.title || t.label).slice(0, 300),
          blocks: built.blocks || [mkBlock('paragraph')],
          meta: built.meta || {},
          kind: t.kind || 'doc',
          is_wiki: !!built.is_wiki,
          client_id: clientId || null
        });
        setBusy(false);
      };
      return h`<${Modal} wide=${true} title="New doc" icon="ti-file-plus" onClose=${onClose}
        footer=${h`<${Fragment}>
          <button class="dx-btn" onClick=${onClose}>Cancel</button>
          <button class="dx-btn dx-btn-pri" disabled=${busy} onClick=${create}>
            ${busy ? h`<i class="ti ti-loader-2 dx-spin"></i>` : null}Create doc</button>
        <//>`}>
        <div>
          <span class="dx-lbl">Start from</span>
          <div class="dx-cards">
            ${TEMPLATES.map(t => h`<button key=${t.key} class="dx-card" style=${tpl === t.key ? { borderColor: 'var(--cu-accent)', background: 'var(--cu-accent-fog)' } : null}
              onClick=${() => setTpl(t.key)}>
              <i class=${'ti ' + t.icon} style=${{ fontSize: 19, color: 'var(--cu-t2)' }}></i>
              <span class="dx-card-t">${t.label}</span>
              <span class="dx-card-s" style=${{ whiteSpace: 'normal' }}>${t.desc}</span>
            </button>`)}
          </div>
        </div>
        <div style=${{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style=${{ flex: 1, minWidth: 180 }}>
            <span class="dx-lbl">Title</span>
            <input class="dx-input" autoFocus placeholder="Leave blank to use the template name" value=${title}
              onInput=${(e) => setTitle(e.target.value)}
              onKeyDown=${(e) => { if (e.key === 'Enter') create(); }}/>
          </div>
          <div style=${{ width: 210 }}>
            <span class="dx-lbl">Space</span>
            <select class="dx-input" value=${clientId} onChange=${(e) => setClientId(e.target.value)}>
              <option value="">Agency (no client)</option>
              ${arr(clients).map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
            </select>
          </div>
        </div>
      <//>`;
    }

    function ImportModal({ clients, onClose, onImport }) {
      const [text, setText] = useState('');
      const [name, setName] = useState('');
      const [clientId, setClientId] = useState('');
      const [busy, setBusy] = useState(false);
      const readFile = (file) => {
        if (!file) return;
        const fr = new FileReader();
        fr.onload = () => { setText(String(fr.result || '')); if (!name) setName(String(file.name || '').replace(/\.(md|markdown|html?|txt)$/i, '')); };
        fr.readAsText(file);
      };
      const run = async () => {
        const raw = text.trim();
        if (!raw) return;
        const looksHtml = /^\s*</.test(raw) && /<\/?(p|div|h[1-6]|ul|ol|li|table|strong|em|br)\b/i.test(raw);
        let blocks = looksHtml ? parseHtmlToBlocks(raw) : null;
        if (!blocks) blocks = parseMarkdownToBlocks(raw);
        let title = name.trim();
        if (!title) {
          const firstH = blocks.find(b => /^h[1-4]$/.test(b.type));
          title = firstH ? blockPlain(firstH) : (blockPlain(blocks[0]) || 'Imported doc').slice(0, 80);
          if (firstH) blocks = blocks.filter(b => b !== firstH);
        }
        setBusy(true);
        await onImport({ title: title.slice(0, 300), blocks, client_id: clientId || null, kind: 'doc' });
        setBusy(false);
      };
      return h`<${Modal} title="Import a doc" icon="ti-file-import" onClose=${onClose}
        footer=${h`<${Fragment}>
          <button class="dx-btn" onClick=${onClose}>Cancel</button>
          <button class="dx-btn dx-btn-pri" disabled=${busy || !text.trim()} onClick=${run}>
            ${busy ? h`<i class="ti ti-loader-2 dx-spin"></i>` : null}Import</button>
        <//>`}>
        <div style=${{ fontSize: 12.5, color: 'var(--cu-t2)' }}>
          Paste Markdown or HTML — headings, lists, checklists, quotes, code, tables, links and images all come across.
        </div>
        <div style=${{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style=${{ flex: 1, minWidth: 160 }}>
            <span class="dx-lbl">Title (optional)</span>
            <input class="dx-input" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Taken from the first heading"/>
          </div>
          <div style=${{ width: 190 }}>
            <span class="dx-lbl">Space</span>
            <select class="dx-input" value=${clientId} onChange=${(e) => setClientId(e.target.value)}>
              <option value="">Agency (no client)</option>
              ${arr(clients).map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
            </select>
          </div>
        </div>
        <textarea class="dx-ta" rows="10" placeholder="# My doc&#10;&#10;- point one" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
        <label class="dx-btn" style=${{ alignSelf: 'flex-start', cursor: 'pointer' }}>
          <i class="ti ti-upload"></i>Choose a file
          <input type="file" accept=".md,.markdown,.html,.htm,.txt,text/plain,text/markdown,text/html" style=${{ display: 'none' }}
            onChange=${(e) => readFile(e.target.files && e.target.files[0])}/>
        </label>
      <//>`;
    }

    // =========================================================================
    // Page tree (sidebar)
    // =========================================================================
    const byPos = (a, b) => (a.position || 0) - (b.position || 0) || String(a.title || '').localeCompare(String(b.title || ''));
    function DocTree({ docs, activeId, onOpen, onCreateChild, onMove }) {
      const [open, setOpen] = useState({});
      const [drop, setDrop] = useState(null);
      const dragRef = useRef(null);
      const list = arr(docs);
      const byParent = {};
      list.forEach(d => { const k = d.parent_id || 'root'; (byParent[k] = byParent[k] || []).push(d); });
      const ids = {};
      list.forEach(d => { ids[d.id] = true; });
      const roots = list.filter(d => !d.parent_id || !ids[d.parent_id]);

      const placeFor = (e, el) => {
        const r = el.getBoundingClientRect();
        const y = e.clientY - r.top;
        if (y < r.height * 0.28) return 'before';
        if (y > r.height * 0.72) return 'after';
        return 'inside';
      };
      const render = (nodes, depth) => arr(nodes).slice().sort(byPos).map(d => {
        const kids = byParent[d.id] || [];
        const isOpen = open[d.id] === undefined ? depth < 1 : open[d.id];
        const dropCls = drop && drop.id === d.id ? (drop.place === 'inside' ? ' drop-in' : drop.place === 'before' ? ' drop-above' : ' drop-below') : '';
        return h`<${Fragment} key=${d.id}>
          <div class=${'dx-tr' + (activeId === d.id ? ' on' : '') + dropCls}
            draggable=${true}
            onDragStart=${(e) => { dragRef.current = d.id; try { e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; } catch (_) {} }}
            onDragEnd=${() => { dragRef.current = null; setDrop(null); }}
            onDragOver=${(e) => { if (!dragRef.current || dragRef.current === d.id) return; e.preventDefault(); setDrop({ id: d.id, place: placeFor(e, e.currentTarget) }); }}
            onDragLeave=${() => setDrop(dp => (dp && dp.id === d.id ? null : dp))}
            onDrop=${(e) => {
              e.preventDefault();
              const dragId = dragRef.current;
              const place = drop && drop.id === d.id ? drop.place : 'inside';
              dragRef.current = null; setDrop(null);
              if (dragId && dragId !== d.id) onMove(dragId, d, place);
            }}>
            ${depth > 0 ? h`<span style=${{ width: depth * 12, flexShrink: 0 }}></span>` : null}
            <button class="dx-tr-c" aria-label=${kids.length ? (isOpen ? 'Collapse' : 'Expand') : 'No subpages'}
              onClick=${() => setOpen(o => Object.assign({}, o, { [d.id]: !isOpen }))}>
              ${kids.length ? h`<i class=${'ti ' + (isOpen ? 'ti-chevron-down' : 'ti-chevron-right')}></i>` : h`<span style=${{ opacity: .35 }}>·</span>`}
            </button>
            <button class="dx-tr-b" onClick=${() => onOpen(d.id)} title=${d.title || 'Untitled'}>
              <span class="dx-tr-ic">${d.icon || '📄'}</span>
              <span class="dx-tr-t">${d.title || 'Untitled'}</span>
              ${d.is_wiki ? h`<i class="ti ti-book" style=${{ fontSize: 12, color: 'var(--cu-t3)' }} title="Wiki"></i>` : null}
            </button>
            <span class="dx-tr-a">
              <button class="dx-ibtn" title="Add subpage" aria-label="Add subpage" onClick=${() => onCreateChild(d)}><i class="ti ti-plus"></i></button>
            </span>
          </div>
          ${isOpen && kids.length ? render(kids, depth + 1) : null}
        <//>`;
      });
      if (!list.length) return h`<div style=${{ padding: '10px 12px', fontSize: 12.5, color: 'var(--cu-t3)' }}>No pages in this space yet.</div>`;
      return h`<div class="dx-tree">${render(roots, 0)}</div>`;
    }

    // =========================================================================
    // Hub (list of docs)
    // =========================================================================
    const TABS = [
      { key: 'all', label: 'All docs', icon: 'ti-files' },
      { key: 'my', label: 'My docs', icon: 'ti-user' },
      { key: 'shared', label: 'Shared with me', icon: 'ti-users' },
      { key: 'private', label: 'Private', icon: 'ti-lock' },
      { key: 'meeting', label: 'Meeting notes', icon: 'ti-calendar-event' },
      { key: 'wikis', label: 'Wikis', icon: 'ti-book' },
      { key: 'favorites', label: 'Favourites', icon: 'ti-star' },
      { key: 'templates', label: 'Templates', icon: 'ti-template' },
      { key: 'archived', label: 'Archived', icon: 'ti-archive' },
      { key: 'trash', label: 'Trash', icon: 'ti-trash' }
    ];
    function DocsHub({ tab, docs, recent, loading, clients, clientFilter, setClientFilter, search, setSearch,
                       tagFilter, setTagFilter, onOpen, onNew, onImport, onReload, showToast }) {
      const [sel, setSel] = useState({});
      const [busy, setBusy] = useState(false);
      const selIds = Object.keys(sel).filter(k => sel[k]);
      useEffect(() => { setSel({}); }, [tab, clientFilter, tagFilter]);
      const meta = TABS.find(t => t.key === tab) || TABS[0];
      const rows = arr(docs);
      const tags = {};
      rows.forEach(d => arr(d.tags).forEach(t => { tags[t] = (tags[t] || 0) + 1; }));
      const tagKeys = Object.keys(tags).sort((a, b) => tags[b] - tags[a]).slice(0, 12);
      const bulk = async (action) => {
        if (!selIds.length) return;
        setBusy(true);
        try {
          const r = await DocAPI.bulk(selIds, action);
          showToast && showToast((r && r.done ? r.done : 0) + ' doc(s) ' +
            (action === 'delete' ? 'moved to trash' : action === 'duplicate' ? 'duplicated' : action === 'undelete' ? 'restored' : action + 'd'));
          setSel({}); onReload();
        } catch (e) { showToast && showToast(errMsg(e)); }
        setBusy(false);
      };
      const spaceName = (d) => d.client_name || 'Agency';
      return h`<div class="dx-scroll"><div class="dx-hub dx-root">
        <div style=${{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style=${{ flex: 1, minWidth: 180 }}>
            <h1 class="dx-h1">${meta.label}</h1>
            <div class="dx-sub">${loading ? 'Loading…' : rows.length + (rows.length === 1 ? ' doc' : ' docs')}
              ${clientFilter && clientFilter !== 'agency' ? ' · ' + ((arr(clients).find(c => c.id === clientFilter) || {}).name || '') : ''}</div>
          </div>
          <div style=${{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button class="dx-btn" onClick=${onImport}><i class="ti ti-file-import"></i>Import</button>
            <button class="dx-btn dx-btn-pri" onClick=${() => onNew()}><i class="ti ti-plus"></i>New doc</button>
          </div>
        </div>
        <div class="dx-bar">
          <div class="dx-search" style=${{ flex: 1, minWidth: 190 }}>
            <i class="ti ti-search"></i>
            <input class="dx-input" placeholder="Search docs…" value=${search} onInput=${(e) => setSearch(e.target.value)}/>
          </div>
          <select class="dx-input" style=${{ width: 180 }} value=${clientFilter} onChange=${(e) => setClientFilter(e.target.value)}>
            <option value="">All spaces</option>
            <option value="agency">Agency only</option>
            ${arr(clients).map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
          </select>
          <button class="dx-ibtn" title="Refresh" aria-label="Refresh" onClick=${onReload}><i class="ti ti-refresh"></i></button>
        </div>
        ${tagKeys.length > 0 && h`<div class="dx-chips" style=${{ marginBottom: 12 }}>
          ${tagKeys.map(t => h`<button key=${t} class=${'dx-chip' + (tagFilter === t ? ' on' : '')}
            onClick=${() => setTagFilter(tagFilter === t ? '' : t)}>#${t}<span style=${{ opacity: .6 }}>${tags[t]}</span></button>`)}
        </div>`}
        ${tab === 'all' && arr(recent).length > 0 && !search && h`<div>
          <span class="dx-lbl">Jump back in</span>
          <div class="dx-cards">
            ${arr(recent).slice(0, 6).map(d => h`<button key=${d.id} class="dx-card" onClick=${() => onOpen(d.id)}>
              <span style=${{ fontSize: 17 }}>${d.icon || '📄'}</span>
              <span class="dx-card-t">${d.title || 'Untitled'}</span>
              <span class="dx-card-s">${spaceName(d)} · ${fmtRelative(d.updated_at)}</span>
            </button>`)}
          </div>
        </div>`}
        ${loading && h`<${Skel}/>`}
        ${!loading && !rows.length && h`<${DocEmpty} icon=${meta.icon}
          title=${search ? 'Nothing matches “' + search + '”' : 'No docs here yet'}
          sub=${tab === 'trash' ? 'Deleted docs stay here for 30 days.' : 'Create one — SOPs, briefs, meeting notes, anything the team keeps re-explaining.'}
          action=${tab === 'trash' ? null : h`<button class="dx-btn dx-btn-pri" onClick=${() => onNew()}><i class="ti ti-plus"></i>New doc</button>`}/>`}
        ${!loading && rows.length > 0 && h`<div style=${{ overflowX: 'auto' }}>
          <table class="dx-tbl">
            <thead><tr>
              <th style=${{ width: 28 }}><input type="checkbox" aria-label="Select all"
                checked=${selIds.length > 0 && selIds.length === rows.length}
                onChange=${(e) => { const on = e.target.checked; const next = {}; if (on) rows.forEach(d => { next[d.id] = true; }); setSel(next); }}/></th>
              <th>Name</th><th style=${{ width: 130 }}>Space</th><th style=${{ width: 150 }}>Tags</th>
              <th style=${{ width: 130 }}>Updated</th><th style=${{ width: 120 }}>Owner</th><th style=${{ width: 40 }}></th>
            </tr></thead>
            <tbody>
              ${rows.map(d => h`<tr key=${d.id}>
                <td><input type="checkbox" aria-label=${'Select ' + (d.title || 'doc')} checked=${!!sel[d.id]}
                  onChange=${(e) => setSel(s => Object.assign({}, s, { [d.id]: e.target.checked }))}/></td>
                <td><div class="nm">
                  <span style=${{ fontSize: 15 }}>${d.icon || '📄'}</span>
                  <button onClick=${() => onOpen(d.id)}>${d.title || 'Untitled'}</button>
                  ${d.is_wiki ? h`<i class="ti ti-book" style=${{ fontSize: 13, color: 'var(--cu-t3)' }} title="Wiki"></i>` : null}
                  ${d.sharing !== 'workspace' ? h`<i class="ti ti-lock" style=${{ fontSize: 13, color: 'var(--cu-t3)' }} title="Restricted"></i>` : null}
                  ${d.has_public_link ? h`<i class="ti ti-world" style=${{ fontSize: 13, color: 'var(--cu-t3)' }} title="Public link on"></i>` : null}
                  ${d.child_count ? h`<span class="dx-tag">${d.child_count} sub</span>` : null}
                </div></td>
                <td style=${{ fontSize: 12.5, color: 'var(--cu-t2)' }}>${spaceName(d)}</td>
                <td>${arr(d.tags).slice(0, 3).map(t => h`<span key=${t} class="dx-tag" style=${{ marginRight: 4 }}>#${t}</span>`)}</td>
                <td style=${{ fontSize: 12.5, color: 'var(--cu-t3)' }}>${fmtRelative(d.updated_at)}</td>
                <td style=${{ fontSize: 12.5, color: 'var(--cu-t3)' }}>${d.created_by_name || '—'}</td>
                <td>
                  ${tab === 'trash'
                    ? h`<button class="dx-ibtn" title="Restore" aria-label="Restore" onClick=${async () => {
                        try { await DocAPI.undelete(d.id); showToast && showToast('Restored'); onReload(); } catch (e) { showToast && showToast(errMsg(e)); }
                      }}><i class="ti ti-arrow-back-up"></i></button>`
                    : h`<button class="dx-ibtn" title="Open" aria-label="Open" onClick=${() => onOpen(d.id)}><i class="ti ti-chevron-right"></i></button>`}
                </td>
              </tr>`)}
            </tbody>
          </table>
        </div>`}
        ${selIds.length > 0 && h`<div class="dx-bulk">
          <span style=${{ fontWeight: 600, fontSize: 12.5 }}>${selIds.length} selected</span>
          ${tab === 'trash'
            ? h`<button disabled=${busy} onClick=${() => bulk('undelete')}>Restore</button>`
            : h`<${Fragment}>
                <button disabled=${busy} onClick=${() => bulk('duplicate')}>Duplicate</button>
                <button disabled=${busy} onClick=${() => bulk(tab === 'archived' ? 'unarchive' : 'archive')}>${tab === 'archived' ? 'Unarchive' : 'Archive'}</button>
                <button disabled=${busy} onClick=${() => bulk('delete')}>Delete</button>
              <//>`}
          <button onClick=${() => setSel({})}>Clear</button>
        </div>`}
      </div></div>`;
    }

    // =========================================================================
    // DocsPage — the registered `docs` page
    // =========================================================================
    function DocsPage({ currentUser, clients, team, onNavigate, showToast, params }) {
      const store = useTaskStore();
      const clientList = arr(clients && clients.length ? clients : store.clients);
      const first = arr(params)[0];
      const [docId, setDocId] = useState(first && first !== 'new' ? first : null);
      const [newOpen, setNewOpen] = useState(first === 'new');
      const [importOpen, setImportOpen] = useState(false);
      const [tab, setTab] = useState('all');
      const [clientFilter, setClientFilter] = useState('');
      const [search, setSearch] = useState('');
      const [dSearch, setDSearch] = useState('');
      const [tagFilter, setTagFilter] = useState('');
      const [rows, setRows] = useState(null);
      const [treeDocs, setTreeDocs] = useState([]);
      const [recent, setRecent] = useState([]);
      const [unavailable, setUnavailable] = useState(false);
      const [narrow, setNarrow] = useState(() => window.innerWidth <= 860);
      const [sideOpen, setSideOpen] = useState(false);

      useEffect(() => {
        const on = () => setNarrow(window.innerWidth <= 860);
        window.addEventListener('resize', on);
        return () => window.removeEventListener('resize', on);
      }, []);
      useEffect(() => { const t = setTimeout(() => setDSearch(search), 260); return () => clearTimeout(t); }, [search]);
      useEffect(() => {
        const p = arr(params)[0];
        if (p === 'new') setNewOpen(true);
        else setDocId(p || null);
      }, [arr(params).join('/')]);
      useEffect(() => {
        const onHash = () => {
          const m = /^#\/docs(?:\/([^/?]+))?/.exec(location.hash || '');
          if (!m) return;
          if (m[1] === 'new') setNewOpen(true);
          else setDocId(m[1] || null);
        };
        const onOpenEv = (e) => { const id = e && e.detail && e.detail.id; if (id) { setDocId(id); setSideOpen(false); } };
        window.addEventListener('hashchange', onHash);
        window.addEventListener('ams-open-doc', onOpenEv);
        return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('ams-open-doc', onOpenEv); };
      }, []);

      const go = useCallback((id) => {
        setDocId(id); setSideOpen(false);
        if (location.hash !== docHash(id)) location.hash = docHash(id);
      }, []);

      const spaceFilter = (f) => {
        if (clientFilter === 'agency') f.agency_only = true;
        else if (clientFilter) f.client_id = clientFilter;
        return f;
      };
      const loadList = useCallback(async () => {
        setRows(null);
        try {
          const f = spaceFilter({ tab, limit: 500 });
          if (dSearch.trim()) f.search = dSearch.trim();
          if (tagFilter) f.tag = tagFilter;
          setRows(await DocAPI.list(f));
        } catch (e) {
          if (e && e.code === 'docs.unavailable') setUnavailable(true);
          setRows([]);
        }
      }, [tab, clientFilter, dSearch, tagFilter]);
      const loadTree = useCallback(async () => {
        try { setTreeDocs(await DocAPI.list(spaceFilter({ tab: 'all', order: 'position', limit: 1000 }))); }
        catch (e) { if (e && e.code === 'docs.unavailable') setUnavailable(true); }
      }, [clientFilter]);
      const loadRecent = useCallback(async () => {
        try { setRecent(await DocAPI.list({ tab: 'recent', limit: 8 })); } catch (_) {}
      }, []);
      useEffect(() => { loadList(); }, [loadList]);
      useEffect(() => { loadTree(); loadRecent(); }, [loadTree, loadRecent]);

      const create = async (data) => {
        try {
          const d = await DocAPI.create(data);
          setNewOpen(false); setImportOpen(false);
          loadTree(); loadList();
          go(d.id);
        } catch (e) { showToast && showToast('Could not create the doc: ' + errMsg(e)); }
      };
      const moveInTree = async (dragId, target, place) => {
        try {
          if (place === 'inside') await DocAPI.move(dragId, target.id, null);
          else await DocAPI.move(dragId, target.parent_id || null, (target.position || 0) + (place === 'before' ? -0.5 : 0.5));
          loadTree();
        } catch (e) { showToast && showToast(errMsg(e)); }
      };

      if (unavailable) {
        return h`<div class="dx-root" style=${{ padding: 30 }}>
          <${DocEmpty} icon="ti-file-off" title="Docs aren't switched on yet"
            sub="Apply migration 097_docs.sql in Supabase, then refresh — the hub, page tree and editor light up automatically."/>
        </div>`;
      }

      return h`<div class="dx-wrap dx-root">
        <div class=${'dx-side' + (narrow && !sideOpen ? ' hide' : '')}>
          <div class="dx-side-hd">
            <button class="dx-btn dx-btn-pri" onClick=${() => setNewOpen(true)}><i class="ti ti-plus"></i>New doc</button>
            <div class="dx-search">
              <i class="ti ti-search"></i>
              <input class="dx-input" placeholder="Search docs…" value=${search}
                onInput=${(e) => { setSearch(e.target.value); setDocId(null); }}/>
            </div>
          </div>
          <div class="dx-scroll">
            <div class="dx-nav">
              ${TABS.map(t => h`<button key=${t.key} class=${'dx-navi' + (tab === t.key && !docId ? ' on' : '')}
                onClick=${() => { setTab(t.key); setDocId(null); setSideOpen(false); }}>
                <i class=${'ti ' + t.icon}></i><span class="nm">${t.label}</span>
              </button>`)}
            </div>
            <div class="dx-grp">
              <span class="sp">Pages</span>
              <select class="dx-input" style=${{ height: 22, width: 104, fontSize: 11 }} value=${clientFilter}
                onChange=${(e) => setClientFilter(e.target.value)} aria-label="Filter pages by space">
                <option value="">All</option>
                <option value="agency">Agency</option>
                ${clientList.map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
              </select>
            </div>
            <${DocTree} docs=${treeDocs} activeId=${docId} onOpen=${go} onMove=${moveInTree}
              onCreateChild=${(parent) => create({ title: 'Untitled', parent_id: parent.id, blocks: [mkBlock('paragraph')] })}/>
          </div>
        </div>

        <div class="dx-main">
          ${narrow && h`<div class="dx-top" style=${{ minHeight: 40 }}>
            <button class="dx-btn dx-btn-sm" onClick=${() => setSideOpen(o => !o)}>
              <i class=${'ti ' + (sideOpen ? 'ti-x' : 'ti-menu-2')}></i>${sideOpen ? 'Close' : 'Browse docs'}</button>
            ${docId && h`<button class="dx-btn dx-btn-sm" onClick=${() => go(null)}><i class="ti ti-arrow-left"></i>All docs</button>`}
          </div>`}
          ${docId
            ? h`<${DocEditor} key=${docId} docId=${docId} currentUser=${currentUser} showToast=${showToast}
                clients=${clientList} team=${team} onOpenDoc=${(id) => { go(id); loadTree(); loadList(); }}
                onDocChange=${() => { loadTree(); }}/>`
            : h`<${DocsHub} tab=${tab} docs=${rows} recent=${recent} loading=${rows === null} clients=${clientList}
                clientFilter=${clientFilter} setClientFilter=${setClientFilter}
                search=${search} setSearch=${setSearch} tagFilter=${tagFilter} setTagFilter=${setTagFilter}
                onOpen=${go} onNew=${() => setNewOpen(true)} onImport=${() => setImportOpen(true)}
                onReload=${() => { loadList(); loadTree(); loadRecent(); }} showToast=${showToast}/>`}
        </div>

        ${newOpen && h`<${NewDocModal} clients=${clientList} defaultClientId=${clientFilter}
          onClose=${() => { setNewOpen(false); if (arr(params)[0] === 'new') go(null); }} onCreate=${create}/>`}
        ${importOpen && h`<${ImportModal} clients=${clientList} onClose=${() => setImportOpen(false)} onImport=${create}/>`}
      </div>`;
    }

    // =========================================================================
    // Client SOP / Playbook tab (rendered by clients.js)
    // =========================================================================
    function ClientDocTab({ client, kind, currentUser, showToast }) {
      const k = kind === 'playbook' ? 'playbook' : 'sop';
      const [state, setState] = useState({ status: 'loading' });
      const load = useCallback(() => {
        setState({ status: 'loading' });
        DocAPI.clientDoc(k === 'playbook' ? null : (client && client.id), k)
          .then(d => setState({ status: 'ok', id: d.id }))
          .catch(e => setState({ status: e && e.code === 'docs.unavailable' ? 'unavailable' : 'error', msg: errMsg(e) }));
      }, [client && client.id, k]);
      useEffect(() => { let alive = true; if (alive) load(); return () => { alive = false; }; }, [load]);

      if (state.status === 'loading') return h`<div class="dx-root" style=${{ padding: 16 }}><${Skel}/><${Skel}/></div>`;
      if (state.status === 'unavailable') {
        return h`<div class="dx-root" style=${{ padding: 16 }}>
          <div class="dx-banner info">
            <i class="ti ti-info-circle"></i>
            <span>Docs aren't switched on yet — apply migration <strong>097_docs.sql</strong> and this tab becomes a full doc (version history, sharing, blocks). The fields below keep working in the meantime.</span>
          </div>
        </div>`;
      }
      if (state.status === 'error') {
        return h`<div class="dx-root" style=${{ padding: 16 }}>
          <${DocEmpty} icon="ti-alert-triangle" title="Couldn't open this doc" sub=${state.msg}
            action=${h`<button class="dx-btn" onClick=${load}>Try again</button>`}/>
        </div>`;
      }
      return h`<div class="dx-root" style=${{ display: 'flex', flexDirection: 'column', minHeight: 520 }}>
        ${k === 'playbook' && h`<div class="dx-banner info" style=${{ margin: '0 0 8px' }}>
          <i class="ti ti-sparkles"></i>
          <span>House style for every AI-generated calendar — this doc applies to <strong>all clients</strong> and is what the AI planner reads.</span>
        </div>`}
        <${DocEditor} key=${state.id} docId=${state.id} currentUser=${currentUser} showToast=${showToast} embedded=${true}
          onOpenDoc=${(id) => { if (id) openDoc(id); }}/>
      </div>`;
    }

    // =========================================================================
    // Public read-only page (?doc=<token>)
    // =========================================================================
    const stripLive = (list) => arr(list)
      .filter(b => b.type !== 'task_list')
      .map(b => b.children ? Object.assign({}, b, { children: stripLive(b.children) }) : b);

    function PublicDocPage({ token }) {
      const [doc, setDoc] = useState(undefined);
      useEffect(() => {
        let alive = true;
        DocAPI.publicGet(token).then(d => { if (alive) setDoc(d || null); }).catch(() => { if (alive) setDoc(null); });
        return () => { alive = false; };
      }, [token]);
      if (doc === undefined) return h`<div class="dx-root" style=${{ padding: 30, maxWidth: 780, margin: '0 auto' }}><${Skel}/><${Skel}/><${Skel}/></div>`;
      if (!doc) {
        return h`<div class="dx-root" style=${{ padding: 40 }}>
          <${DocEmpty} icon="ti-link-off" title="This link isn't active"
            sub="The doc may have been unshared, archived or deleted. Ask the person who sent it for a fresh link."/>
        </div>`;
      }
      const blocks = stripLive(arr(doc.blocks));
      return h`<div class="dx-root dx-scroll" style=${{ background: 'var(--cu-bg)', minHeight: '100vh' }}>
        <div class="dx-page">
          <div style=${{ fontSize: 12, color: 'var(--cu-t3)', marginBottom: 10 }}>
            ${[doc.org_name, doc.client_name].filter(Boolean).join(' · ')}${doc.updated_at ? ' · updated ' + fmtRelative(doc.updated_at) : ''}
          </div>
          <div style=${{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style=${{ fontSize: 26 }}>${doc.icon || '📄'}</span>
            <h1 class="dx-title" style=${{ margin: 0 }}>${doc.title || 'Untitled'}</h1>
          </div>
          <${BlockList} list=${blocks} ctx=${readCtx(blocks)}/>
        </div>
      </div>`;
    }

    // =========================================================================
    // views registry renderer — a doc pinned to a list / client view
    // =========================================================================
    function DocViewRenderer({ config, setConfig, scope, currentUser, showToast }) {
      const cfg = config || {};
      const [q, setQ] = useState('');
      const [res, setRes] = useState([]);
      const [busy, setBusy] = useState(false);
      useEffect(() => {
        if (cfg.doc_id) return;
        let alive = true;
        const t = setTimeout(async () => { try { const r = await DocAPI.search(q, 8); if (alive) setRes(r); } catch (_) {} }, 200);
        return () => { alive = false; clearTimeout(t); };
      }, [q, cfg.doc_id]);
      if (cfg.doc_id) {
        return h`<${DocEditor} key=${cfg.doc_id} docId=${cfg.doc_id} currentUser=${currentUser} showToast=${showToast} embedded=${true}
          onOpenDoc=${(id) => { if (id) openDoc(id); }}/>`;
      }
      const create = async () => {
        setBusy(true);
        try {
          const d = await DocAPI.create({ title: (scope && scope.title ? scope.title + ' — notes' : 'Notes'), client_id: (scope && scope.clientId) || null, blocks: [mkBlock('paragraph')] });
          setConfig && setConfig({ doc_id: d.id });
        } catch (e) { showToast && showToast(errMsg(e)); }
        setBusy(false);
      };
      return h`<div class="dx-root" style=${{ padding: 20, maxWidth: 560 }}>
        <${DocEmpty} icon="ti-file-text" title="Pin a doc to this view"
          sub="Keep the brief, the SOP or the running notes right next to the work."
          action=${h`<button class="dx-btn dx-btn-pri" disabled=${busy} onClick=${create}><i class="ti ti-plus"></i>Create a doc</button>`}/>
        <div class="dx-search" style=${{ marginTop: 10 }}>
          <i class="ti ti-search"></i>
          <input class="dx-input" placeholder="…or search an existing doc" value=${q} onInput=${(e) => setQ(e.target.value)}/>
        </div>
        ${res.map(d => h`<button key=${d.id} class="dx-mi" onClick=${() => setConfig && setConfig({ doc_id: d.id })}>
          <i class="ti ti-file-text"></i>
          <span style=${{ flex: 1, minWidth: 0 }}>
            <span style=${{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${d.title || 'Untitled'}</span>
            <span class="sub">${d.client_name || 'Agency'}</span>
          </span>
        </button>`)}
      </div>`;
    }

    // =========================================================================
    // Home / dashboard cards
    // =========================================================================
    const SimpleShell = ({ title, icon, children, right }) => h`<section class="dx-root" style=${{ border: '1px solid var(--cu-bd)', borderRadius: 8, background: 'var(--cu-bg)' }}>
      <div style=${{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--cu-bd)' }}>
        ${icon ? h`<i class=${'ti ' + icon} style=${{ color: 'var(--cu-t3)' }}></i>` : null}
        <span style=${{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>${title}</span>${right}
      </div>
      <div style=${{ padding: 8 }}>${children}</div>
    </section>`;

    function DocRows({ rows, empty }) {
      if (rows === null) return h`<${Skel}/>`;
      if (!arr(rows).length) return h`<div style=${{ padding: '14px 8px', fontSize: 12.5, color: 'var(--cu-t3)' }}>${empty}</div>`;
      return arr(rows).map(d => h`<button key=${d.id} class="dx-trow" onClick=${() => openDoc(d.id)}>
        <span style=${{ fontSize: 15 }}>${d.icon || '📄'}</span>
        <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${d.title || 'Untitled'}</span>
        <span style=${{ fontSize: 11.5, color: 'var(--cu-t3)', whiteSpace: 'nowrap' }}>${d.client_name || 'Agency'}</span>
      </button>`);
    }

    function RecentDocsCard({ card, ctl, showToast }) {
      const Shell = CardShell || SimpleShell;
      const [rows, setRows] = useState(null);
      const load = useCallback(() => {
        DocAPI.list({ tab: 'recent', limit: (card && card.config && card.config.limit) || 7 })
          .then(setRows).catch(() => setRows([]));
      }, [card && card.config && card.config.limit]);
      useEffect(() => { load(); }, [load]);
      return h`<${Shell} title="Recent docs" icon="ti-file-text" ctl=${ctl} onRefresh=${load} count=${rows ? rows.length : null}>
        <${DocRows} rows=${rows} empty="Docs you open show up here."/>
      <//>`;
    }

    function DocsCard({ card, ctl, showToast }) {
      const Shell = CardShell || SimpleShell;
      const [tab, setTab] = useState((card && card.config && card.config.tab) || 'favorites');
      const [rows, setRows] = useState(null);
      const load = useCallback(() => {
        setRows(null);
        DocAPI.list({ tab, limit: 7 }).then(setRows).catch(() => setRows([]));
      }, [tab]);
      useEffect(() => { load(); }, [load]);
      const right = h`<span style=${{ display: 'inline-flex', gap: 3 }}>
        ${[['favorites', 'Starred'], ['wikis', 'Wikis'], ['my', 'Mine']].map(([k, lb]) =>
          h`<button key=${k} class=${'dx-chip' + (tab === k ? ' on' : '')} style=${{ height: 22, fontSize: 11 }}
            onClick=${() => setTab(k)}>${lb}</button>`)}
      </span>`;
      return h`<${Shell} title="Docs" icon="ti-books" ctl=${ctl} onRefresh=${load} right=${right}>
        <${DocRows} rows=${rows} empty=${tab === 'favorites' ? 'Star a doc to pin it here.' : 'Nothing here yet.'}/>
      <//>`;
    }

    // =========================================================================
    // Registrations (§2 extension registry)
    // =========================================================================
    const staffRole = (r) => !!r && r !== 'client';

    reg('pages', {
      id: 'docs', label: 'Docs', icon: 'ti-file-text', section: 'rail', order: 55,
      apps: ['dashboard', 'tasks'], roles: staffRole, fullHeight: true, Component: DocsPage
    });
    reg('createItems', {
      key: 'doc', label: 'Doc', icon: 'ti-file-text', order: 30, roles: staffRole,
      run: () => { location.hash = '#/docs/new'; }
    });
    reg('paletteProviders', {
      id: 'docs', label: 'Docs', icon: 'ti-file-text', roles: staffRole,
      search: async (q) => {
        try {
          const r = await DocAPI.search(q, 8);
          return r.map(d => ({
            id: 'doc:' + d.id, label: d.title || 'Untitled', icon: 'ti-file-text',
            sub: [d.client_name || 'Agency', d.snippet].filter(Boolean).join(' · ').slice(0, 120),
            run: () => openDoc(d.id)
          }));
        } catch (_) { return []; }
      }
    });
    reg('views', { key: 'doc', label: 'Doc', icon: 'ti-file-text', desc: 'A doc pinned to this view', Component: DocViewRenderer });
    reg('cards', {
      type: 'recent_docs', name: 'Recent docs', icon: 'ti-file-text', category: 'Utility', w: 1,
      desc: 'Docs you opened recently', roles: staffRole, Component: RecentDocsCard
    });
    reg('cards', {
      type: 'docs', name: 'Docs', icon: 'ti-books', category: 'Utility', w: 1,
      desc: 'Starred docs, wikis and your own pages', roles: staffRole, Component: DocsCard
    });

    return {
      DocsPage, DocEditor, DocTree, DocsHub, ClientDocTab, PublicDocPage, DocViewRenderer,
      RecentDocsCard, DocsCard, BlockList, SpansView, DocAPI, openDoc, TEMPLATES,
      blocksToMarkdown, parseMarkdownToBlocks, parseHtmlToBlocks, readCtx, safeUrl, resolveEmbed
    };
  }
  window.AMS_DOCS = { buildDocs };
})();

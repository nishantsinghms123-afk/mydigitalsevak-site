/* ============================================================================
 * taskadmin.js — Settings sections for the unified task system (parity v2, WS M)
 *
 *   window.AMS_TASKADMIN.buildTaskAdmin(deps) → { StatusesSection, TagsSection,
 *     FieldsSection, TemplatesSection, WorkScheduleSection,
 *     NotificationPrefsSection, DeletedTasksSection, TemplateEditor }
 *
 * Registers every section into window.AMS_EXT.settingsSections (settings.js
 * renders them). Contract: docs/clickup-parity-v2-contract.md §2, §3, §4 "M".
 *
 * deps (standard v2 module deps): React, h, useState, useEffect, useRef,
 *   useCallback, useMemo, rpcCall, Skel, fmtRelative + tasks.js exports
 *   (TaskAPI, taskBus, useTaskStore, StatusIcon, TYPE_META, parseMinutes,
 *   openTask, MemberAvatar). Everything except React/h/hooks/rpcCall is
 *   optional — local fallbacks keep the module working.
 *
 * Fail-open: RPCs from migrations 093/094 may not exist yet — the affected
 * section shows an explanatory empty state instead of erroring.
 * ==========================================================================*/
(function () {
  function buildTaskAdmin(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo, rpcCall } = deps;
    const Fragment = React.Fragment;
    const Skel = deps.Skel || function SkelFallback(p) { return h`<div class="ta-skel" style=${{ height: (p && p.h) || 34 }}></div>`; };
    const fmtRelative = deps.fmtRelative || ((d) => { if (!d) return ''; const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const hh = Math.floor(m / 60); return hh < 24 ? hh + 'h ago' : Math.floor(hh / 24) + 'd ago'; });
    const TaskAPI = deps.TaskAPI || null;
    const taskBus = deps.taskBus || { on: () => () => { }, emit: () => { } };
    const useTaskStoreDep = deps.useTaskStore || null;
    const openTask = deps.openTask || ((id) => { if (id) try { window.dispatchEvent(new CustomEvent('ams-open-task', { detail: { id } })); } catch (_) { } });
    const TYPE_META = deps.TYPE_META || {
      task: { label: 'Task', icon: 'ti-circle-check' }, post: { label: 'Post', icon: 'ti-photo' },
      direct: { label: 'Direct task', icon: 'ti-send' }, milestone: { label: 'Milestone', icon: 'ti-diamond' },
      seo_report: { label: 'SEO report', icon: 'ti-trending-up' }, ad: { label: 'Ad task', icon: 'ti-target-arrow' },
      meeting: { label: 'Meeting note', icon: 'ti-users' }, request: { label: 'Request', icon: 'ti-inbox' },
    };
    const TYPE_ALL = Object.assign({}, TYPE_META, TYPE_META.lead ? {} : { lead: { label: 'Lead', icon: 'ti-user-dollar' } });

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-taskadmin-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-taskadmin-styles';
      st.textContent = `
      :where(:root){--cu-bg:#ffffff;--cu-bg2:#f7f7f8;--cu-bg3:#efeff1;--cu-bd:#e8e8eb;--cu-bd2:#d6d6db;--cu-t1:#1f1f23;--cu-t2:#5c5c66;--cu-t3:#8e8e99;--cu-accent:#ff00ee;--cu-accent-ink:#a8009c;--cu-accent-fog:rgba(255,0,238,.08);--cu-shadow:0 8px 28px rgba(15,15,20,.14),0 2px 6px rgba(15,15,20,.06);--cu-radius:8px;--cu-radius-sm:6px}
      :where(html.dark){--cu-bg:#1c1b1f;--cu-bg2:#161518;--cu-bg3:#26252a;--cu-bd:#2d2c31;--cu-bd2:#3b3a40;--cu-t1:#ececef;--cu-t2:#a9a8b1;--cu-t3:#75747d;--cu-accent:#ff66f5;--cu-accent-ink:#ff7df6;--cu-accent-fog:rgba(255,102,245,.12);--cu-shadow:0 10px 30px rgba(0,0,0,.55)}
      .ta-root,.ta-modal{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--cu-t1);font-size:13px}
      .ta-root{max-width:980px;min-width:0}
      .ta-root *,.ta-modal *{box-sizing:border-box}
      .ta-hd{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;flex-wrap:wrap}
      .ta-hd-tt{flex:1;min-width:220px}
      .ta-hd-t{display:flex;align-items:center;gap:8px;font-size:20px;font-weight:600;color:var(--cu-t1)}
      .ta-hd-t i{font-size:21px;color:var(--cu-accent-ink)}
      .ta-hd-s{font-size:13px;color:var(--cu-t2);margin-top:4px;line-height:1.5;max-width:680px}
      .ta-card{background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);margin-bottom:14px;min-width:0}
      .ta-card-hd{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--cu-bd);flex-wrap:wrap;min-height:46px}
      .ta-card-t{font-size:14px;font-weight:600;flex:1;min-width:140px}
      .ta-card-s{font-size:12px;color:var(--cu-t3);font-weight:400;margin-top:1px}
      .ta-card-b{padding:12px 14px;min-width:0}
      .ta-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:var(--cu-radius-sm);border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t1);font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;white-space:nowrap}
      .ta-btn:hover{background:var(--cu-bg3)}
      .ta-btn:disabled{opacity:.5;cursor:not-allowed}
      .ta-btn.pri{background:var(--cu-accent);border-color:var(--cu-accent);color:#fff}
      .ta-btn.pri:hover{background:#e600d6;border-color:#e600d6}
      html.dark .ta-btn.pri{color:#1b0019}
      .ta-btn.danger{background:#e5484d;border-color:#e5484d;color:#fff}
      .ta-btn.danger:hover{background:#cf3a3f}
      .ta-btn.ghost{border-color:transparent;background:transparent;color:var(--cu-t2)}
      .ta-btn.ghost:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .ta-btn.sm{height:26px;padding:0 9px;font-size:12px}
      .ta-ibtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:var(--cu-radius-sm);border:none;background:transparent;color:var(--cu-t2);cursor:pointer;font-size:15px;flex-shrink:0;padding:0}
      .ta-ibtn:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .ta-ibtn:disabled{opacity:.35;cursor:not-allowed;background:transparent}
      .ta-ibtn.danger:hover{color:#e5484d}
      .ta-root button:focus-visible,.ta-root input:focus-visible,.ta-root select:focus-visible,.ta-root textarea:focus-visible,.ta-modal button:focus-visible,.ta-modal input:focus-visible,.ta-modal select:focus-visible,.ta-modal textarea:focus-visible{outline:2px solid var(--cu-accent);outline-offset:1px}
      .ta-in{width:100%;height:30px;padding:0 9px;border:1px solid var(--cu-bd2);border-radius:var(--cu-radius-sm);background:var(--cu-bg);color:var(--cu-t1);font-size:13px;font-family:inherit;min-width:0}
      .ta-in:focus{outline:none;border-color:var(--cu-accent)}
      .ta-in:disabled{background:var(--cu-bg2);color:var(--cu-t2);cursor:not-allowed}
      .ta-in::placeholder,.ta-ta::placeholder{color:var(--cu-t3)}
      .ta-in.bad{border-color:#e5484d}
      .ta-in.sm{height:28px;font-size:12.5px;padding:0 7px}
      .ta-in.bare{border-color:transparent;background:transparent}
      .ta-in.bare:hover{background:var(--cu-bg2)}
      .ta-in.bare:focus{border-color:var(--cu-accent);background:var(--cu-bg)}
      .ta-in.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
      .ta-ta{width:100%;min-height:64px;padding:7px 9px;border:1px solid var(--cu-bd2);border-radius:var(--cu-radius-sm);background:var(--cu-bg);color:var(--cu-t1);font:13px/1.5 inherit;font-family:inherit;resize:vertical}
      .ta-ta:focus{outline:none;border-color:var(--cu-accent)}
      .ta-f{display:flex;flex-direction:column;gap:5px;min-width:0}
      .ta-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3)}
      .ta-hint{font-size:12px;color:var(--cu-t3);line-height:1.45}
      .ta-err{font-size:12px;color:#e5484d;line-height:1.4}
      .ta-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .ta-sp{flex:1}
      .ta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px}
      .ta-note{font-size:12.5px;line-height:1.5;padding:9px 12px;border-radius:var(--cu-radius-sm);background:var(--cu-bg2);border:1px solid var(--cu-bd);color:var(--cu-t2);margin-bottom:12px;display:flex;gap:8px;align-items:flex-start}
      .ta-note i{font-size:15px;margin-top:1px;flex-shrink:0}
      .ta-note.warn{background:rgba(245,166,35,.1);border-color:rgba(245,166,35,.35);color:var(--cu-t1)}
      .ta-note.bad{background:rgba(229,72,77,.08);border-color:rgba(229,72,77,.3);color:var(--cu-t1)}
      .ta-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:34px 18px;color:var(--cu-t3)}
      .ta-empty>i{font-size:34px;opacity:.5}
      .ta-empty-t{font-size:14px;font-weight:600;color:var(--cu-t2)}
      .ta-empty-s{font-size:12.5px;max-width:420px;line-height:1.5}
      .ta-skel{border-radius:6px;background:linear-gradient(90deg,var(--cu-bg2),var(--cu-bg3),var(--cu-bg2));background-size:200% 100%;animation:ta-sh 1.2s infinite}
      @keyframes ta-sh{to{background-position:-200% 0}}
      .ta-sw{width:36px;height:20px;border-radius:10px;border:none;background:var(--cu-bd2);position:relative;cursor:pointer;flex-shrink:0;padding:0;transition:background .15s}
      .ta-sw.on{background:var(--cu-accent)}
      .ta-sw:disabled{opacity:.5;cursor:not-allowed}
      .ta-sw-k{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
      .ta-sw.on .ta-sw-k{transform:translateX(16px)}
      .ta-cbx{width:18px;height:18px;border-radius:4px;border:1.5px solid var(--cu-bd2);background:var(--cu-bg);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;color:#fff;flex-shrink:0}
      .ta-cbx.on{background:var(--cu-accent);border-color:var(--cu-accent)}
      .ta-cbx:disabled{opacity:.45;cursor:not-allowed}
      .ta-cbx i{font-size:12px}
      .ta-seg{display:inline-flex;border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);overflow:hidden;flex-shrink:0}
      .ta-seg button{border:none;background:var(--cu-bg);color:var(--cu-t2);font:500 12px inherit;font-family:inherit;padding:0 10px;height:28px;cursor:pointer;border-left:1px solid var(--cu-bd);white-space:nowrap}
      .ta-seg button:first-child{border-left:none}
      .ta-seg button.on{background:var(--cu-accent-fog);color:var(--cu-accent-ink);font-weight:600}
      .ta-pill{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap}
      .ta-chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:11px;background:var(--cu-bg3);color:var(--cu-t2);font-size:12px;white-space:nowrap}
      .ta-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--cu-t3)}
      .ta-ellip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .ta-spin{animation:ta-spin 1s linear infinite;display:inline-block}
      @keyframes ta-spin{to{transform:rotate(360deg)}}
      /* list rows */
      .ta-rows{border:1px solid var(--cu-bd);border-radius:var(--cu-radius);overflow:hidden;background:var(--cu-bg)}
      .ta-li{display:flex;align-items:center;gap:8px;min-height:40px;padding:4px 8px 4px 10px;border-top:1px solid var(--cu-bd);min-width:0}
      .ta-li:first-child{border-top:none}
      .ta-li:hover{background:var(--cu-bg2)}
      .ta-li.drag-over{box-shadow:inset 0 2px 0 var(--cu-accent)}
      .ta-li.dragging{opacity:.4}
      .ta-grip{color:var(--cu-t3);cursor:grab;font-size:14px;flex-shrink:0}
      .ta-grp{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3);margin:14px 0 6px}
      .ta-grp:first-child{margin-top:0}
      .ta-add{display:flex;align-items:center;gap:8px;min-height:38px;padding:0 10px;border-top:1px solid var(--cu-bd);color:var(--cu-t3)}
      .ta-add input{flex:1;border:none;background:transparent;color:var(--cu-t1);font:13px inherit;font-family:inherit;height:32px;min-width:0}
      .ta-add input:focus{outline:none}
      .ta-swatch{width:18px;height:18px;border-radius:5px;border:1px solid rgba(0,0,0,.08);cursor:pointer;padding:0;flex-shrink:0}
      .ta-cp{position:relative;display:inline-flex}
      .ta-cp-pop{position:absolute;top:calc(100% + 4px);left:0;z-index:50;background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);box-shadow:var(--cu-shadow);padding:8px;width:188px}
      .ta-cp-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:8px}
      .ta-cp-grid button{width:24px;height:24px;border-radius:6px;border:2px solid transparent;cursor:pointer;padding:0}
      .ta-cp-grid button.on{border-color:var(--cu-t1)}
      /* table */
      .ta-tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
      .ta-tbl{width:100%;border-collapse:collapse;font-size:13px}
      .ta-tbl th{text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3);padding:8px;border-bottom:1px solid var(--cu-bd);background:var(--cu-bg2);white-space:nowrap}
      .ta-tbl td{padding:6px 8px;border-bottom:1px solid var(--cu-bd);vertical-align:middle}
      .ta-tbl tr:last-child td{border-bottom:none}
      .ta-tbl tbody tr:hover td{background:var(--cu-bg2)}
      .ta-tbl .c{text-align:center}
      /* modal */
      .ta-modal-bg{position:fixed;inset:0;z-index:1100;background:rgba(10,10,14,.45);display:flex;align-items:center;justify-content:center;padding:3vh 3vw;animation:ta-fade .12s ease-out}
      @keyframes ta-fade{from{opacity:0}to{opacity:1}}
      .ta-modal{background:var(--cu-bg);border-radius:12px;box-shadow:var(--cu-shadow);display:flex;flex-direction:column;max-height:92vh;width:min(520px,96vw);overflow:hidden}
      .ta-modal.lg{width:min(920px,96vw);height:88vh}
      .ta-modal-hd{display:flex;align-items:center;gap:8px;padding:12px 12px 12px 18px;border-bottom:1px solid var(--cu-bd);flex-shrink:0}
      .ta-modal-t{font-size:15px;font-weight:600;flex:1;min-width:0}
      .ta-modal-b{padding:14px 18px;overflow-y:auto;flex:1;min-height:0}
      .ta-modal-f{display:flex;align-items:center;gap:8px;padding:10px 18px;border-top:1px solid var(--cu-bd);flex-wrap:wrap;flex-shrink:0}
      /* template tree */
      .ta-node{border:1px solid var(--cu-bd);border-radius:var(--cu-radius);background:var(--cu-bg);margin-top:8px}
      .ta-node .ta-node{margin-left:18px;border-style:dashed}
      .ta-node-hd{display:flex;align-items:center;gap:6px;padding:6px 6px 6px 8px;flex-wrap:wrap}
      .ta-node-b{padding:4px 10px 10px 34px;display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--cu-bd)}
      .ta-props{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      .ta-tree-pv{font-size:13px;line-height:1.5}
      .ta-tree-pv ul{list-style:none;margin:0;padding-left:18px;border-left:1px solid var(--cu-bd)}
      .ta-tree-pv>ul{padding-left:0;border-left:none}
      .ta-tree-pv li{margin:4px 0}
      .ta-pv-meta{font-size:11.5px;color:var(--cu-t3);margin-left:6px}
      /* matrix */
      .ta-mx th.c,.ta-mx td.c{width:84px}
      .ta-mx td:first-child{min-width:220px}
      .ta-feat{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 20px}
      .ta-srow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--cu-bd)}
      .ta-srow-t{font-size:13px;font-weight:500;color:var(--cu-t1)}
      .ta-srow-s{font-size:12px;color:var(--cu-t3);margin-top:1px;line-height:1.4}
      .ta-days{display:flex;gap:4px;flex-wrap:wrap}
      .ta-day{height:30px;min-width:44px;padding:0 8px;border-radius:var(--cu-radius-sm);border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t2);font:600 12px inherit;font-family:inherit;cursor:pointer}
      .ta-day.on{background:var(--cu-accent-fog);border-color:var(--cu-accent);color:var(--cu-accent-ink)}
      .ta-day:disabled{cursor:not-allowed;opacity:.7}
      @media(max-width:700px){
        .ta-grid,.ta-feat{grid-template-columns:minmax(0,1fr)}
        .ta-props{grid-template-columns:repeat(2,minmax(0,1fr))}
        .ta-modal-bg{padding:0}
        .ta-modal,.ta-modal.lg{width:100vw;max-height:100dvh;height:100dvh;border-radius:0}
        .ta-node-b{padding-left:10px}
        .ta-node .ta-node{margin-left:8px}
        .ta-hide-sm{display:none!important}
      }
      @media(prefers-reduced-motion:reduce){.ta-sw,.ta-sw-k{transition:none}.ta-spin{animation-duration:3s}.ta-skel{animation:none}.ta-modal-bg{animation:none}}
      `;
      document.head.appendChild(st);
    }

    // =========================================================================
    // helpers
    // =========================================================================
    const arr = (v) => (Array.isArray(v) ? v : []);
    const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2));
    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i.test(String((e && (e.code || '')) + ' ' + (e && (e.message || e.details || '') || '')));
    const role = (u) => (u && u.role_level) || '';
    const isManagerRole = (r) => r === 'admin' || r === 'manager';
    const isStaffRole = (r) => !!r && r !== 'client';
    const HEX_RE = /^#[0-9a-f]{6}$/i;
    const COLORS = ['#87909e', '#7b68ee', '#4c8df6', '#0e7490', '#30a46c', '#84cc16', '#f5a623', '#d97706', '#e5484d', '#be123c', '#8b5cf6', '#ff00ee'];
    const CATEGORY_LABEL = { todo: 'Not started', active: 'Active', done: 'Closed' };
    const CATEGORY_ORDER = ['todo', 'active', 'done'];
    const FIELD_TYPES = [
      { key: 'text', label: 'Text', icon: 'ti-align-left' }, { key: 'number', label: 'Number', icon: 'ti-hash' },
      { key: 'money', label: 'Money (₹)', icon: 'ti-currency-rupee' }, { key: 'date', label: 'Date', icon: 'ti-calendar' },
      { key: 'dropdown', label: 'Dropdown', icon: 'ti-select' }, { key: 'labels', label: 'Labels', icon: 'ti-tags' },
      { key: 'checkbox', label: 'Checkbox', icon: 'ti-square-check' }, { key: 'url', label: 'Website', icon: 'ti-link' },
      { key: 'email', label: 'Email', icon: 'ti-mail' }, { key: 'phone', label: 'Phone', icon: 'ti-phone' },
      { key: 'rating', label: 'Rating', icon: 'ti-star' },
    ];
    const FIELD_BY_KEY = FIELD_TYPES.reduce((m, t) => (m[t.key] = t, m), {});
    const DEFAULT_GENERAL = [
      ['todo', 'To Do', '#87909e', 'todo'], ['in_progress', 'In Progress', '#7b68ee', 'active'],
      ['review', 'Review', '#f5a623', 'active'], ['blocked', 'Blocked', '#e5484d', 'active'], ['done', 'Complete', '#30a46c', 'done'],
    ].map((r, i) => ({ id: 'default-general-' + r[0], list_id: null, kind: 'general', key: r[0], name: r[1], color: r[2], category: r[3], position: i }));

    const ERR = {
      bad_name: 'Give it a name first',
      bad_list: 'That list no longer exists',
      bad_category: 'Pick a valid category',
      bad_replacement: 'Pick another status to move tasks into',
      content_statuses_fixed: 'Content calendar statuses are fixed',
      not_found: 'That item no longer exists — refresh and try again',
    };
    function errText(e) {
      if (!e) return 'Something went wrong';
      if (e.code === 'forbidden') return "You don't have permission to do that";
      if (e.code === 'auth.expired' || e.message === 'auth.no_session') return 'Session expired — sign in again';
      const m = String(e.message || e);
      if (/duplicate key|unique/i.test(m)) return 'That name is already taken';
      const k = Object.keys(ERR).find(x => m.includes(x));
      return k ? ERR[k] : m;
    }
    const reg = (key, item) => {
      const EXT = (window.AMS_EXT = window.AMS_EXT || {});
      const k = item.id || item.key || item.type;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item);
    };
    const fmtDate = (d) => { const x = new Date(d); return isNaN(x) ? String(d || '') : x.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
    const fmtStamp = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
    const toInt = (v, dflt) => { if (v === '' || v === null || v === undefined) return dflt; const n = parseInt(v, 10); return isNaN(n) ? dflt : n; };
    const parseMinutes = deps.parseMinutes || function (str) {
      const s = String(str || '').trim().toLowerCase();
      if (!s) return null;
      const colon = /^(\d+):(\d{1,2})$/.exec(s); if (colon) return +colon[1] * 60 + +colon[2];
      if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
      let total = 0, hit = false;
      s.replace(/(\d+(?:\.\d+)?)\s*(d|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/g, (_, num, unit) => { hit = true; const v = parseFloat(num); total += unit[0] === 'd' ? v * 480 : unit[0] === 'h' ? v * 60 : v; return ''; });
      return hit ? Math.round(total) : null;
    };
    const fmtMinutes = deps.fmtMinutes || ((n) => { n = Math.round(Number(n) || 0); if (n <= 0) return ''; const hh = Math.floor(n / 60), mm = n % 60; return (hh ? hh + 'h' : '') + (hh && mm ? ' ' : '') + (mm ? mm + 'm' : ''); });
    const openSettingsSection = (id) => { try { window.dispatchEvent(new CustomEvent('ams-open-settings-section', { detail: { id } })); } catch (_) { } };

    // meta RPCs — prefer TaskAPI (emits meta:changed), fall back to raw rpc + bus
    const metaRpc = async (method, rpcName, args, apiArgs) => {
      if (TaskAPI && typeof TaskAPI[method] === 'function') return TaskAPI[method].apply(TaskAPI, apiArgs);
      const r = await rpcCall(rpcName, args);
      taskBus.emit('meta:changed');
      return r;
    };
    const api = {
      statusUpsert: (d) => metaRpc('statusUpsert', 'task_status_upsert', { p_data: d }, [d]),
      statusDelete: (id, key) => metaRpc('statusDelete', 'task_status_delete', { p_id: id, p_replace_key: key }, [id, key]),
      tagUpsert: (d) => metaRpc('tagUpsert', 'task_tag_upsert', { p_data: d }, [d]),
      tagDelete: (id) => metaRpc('tagDelete', 'task_tag_delete', { p_id: id }, [id]),
      fieldUpsert: (d) => metaRpc('fieldUpsert', 'task_field_upsert', { p_data: d }, [d]),
      fieldDelete: (id) => metaRpc('fieldDelete', 'task_field_delete', { p_id: id }, [id]),
    };

    // useAsync(fn) → { data, error, missing, loading, reload, setData }
    function useAsync(fn, depsArr) {
      const [state, setState] = useState({ data: null, error: null, missing: false, loading: true });
      const alive = useRef(true);
      useEffect(() => () => { alive.current = false; }, []);
      const reload = useCallback(async () => {
        setState(s => ({ ...s, loading: true }));
        try {
          const data = await fn();
          if (alive.current) setState({ data, error: null, missing: false, loading: false });
          return data;
        } catch (e) {
          if (alive.current) setState(s => ({ data: s.data, error: e, missing: isMissingRpc(e), loading: false }));
          return null;
        }
      }, depsArr || []);
      useEffect(() => { reload(); }, [reload]);
      const setData = useCallback((upd) => setState(s => ({ ...s, data: typeof upd === 'function' ? upd(s.data) : upd })), []);
      return { ...state, reload, setData };
    }

    // useMeta — the task store when mounted inside TaskStoreProvider, else a local bootstrap.
    function useMeta() {
      const store = useTaskStoreDep ? useTaskStoreDep() : null;
      const storeReady = !!(store && store.ready);
      const [local, setLocal] = useState(null);
      const [localErr, setLocalErr] = useState(null);
      const [useLocal, setUseLocal] = useState(false);
      useEffect(() => {
        if (storeReady) return;
        const t = setTimeout(() => setUseLocal(true), store ? 1500 : 0);
        return () => clearTimeout(t);
      }, [storeReady]);
      const loadLocal = useCallback(async () => {
        try { setLocal(await rpcCall('task_bootstrap') || {}); setLocalErr(null); } catch (e) { setLocalErr(e); }
      }, []);
      useEffect(() => {
        if (storeReady || !useLocal) return;
        loadLocal();
        let t = null;
        const off = taskBus.on('meta:changed', () => { clearTimeout(t); t = setTimeout(loadLocal, 250); });
        return () => { clearTimeout(t); off && off(); };
      }, [storeReady, useLocal, loadLocal]);
      return useMemo(() => {
        if (storeReady) return { ready: true, error: null, statuses: arr(store.statuses), tags: arr(store.tags), fields: arr(store.fields), lists: arr(store.lists), clients: arr(store.clients), members: arr(store.members), me: store.me, reload: store.reload || (() => { }) };
        const b = local || {};
        return {
          ready: !!local, error: localErr || (store && store.error) || null,
          statuses: arr(b.statuses).length ? arr(b.statuses) : (local ? DEFAULT_GENERAL : []),
          tags: arr(b.tags), fields: arr(b.fields), lists: arr(b.lists), clients: arr(b.clients), members: arr(b.members), me: b.me || null,
          reload: loadLocal,
        };
      }, [storeReady, store, local, localErr, loadLocal]);
    }

    // =========================================================================
    // atoms
    // =========================================================================
    function Toggle({ on, onChange, disabled, label }) {
      return h`<button type="button" role="switch" aria-checked=${!!on} aria-label=${label} disabled=${disabled}
        class=${'ta-sw' + (on ? ' on' : '')} onClick=${() => { if (!disabled && onChange) onChange(!on); }}><span class="ta-sw-k"></span></button>`;
    }
    function Check({ on, onChange, disabled, label }) {
      return h`<button type="button" role="checkbox" aria-checked=${!!on} aria-label=${label} disabled=${disabled}
        class=${'ta-cbx' + (on ? ' on' : '')} onClick=${() => { if (!disabled && onChange) onChange(!on); }}>${on ? h`<i class="ti ti-check"></i>` : null}</button>`;
    }
    function Spin() { return h`<i class="ti ti-loader-2 ta-spin" aria-hidden="true"></i>`; }
    function Head({ icon, title, sub, right }) {
      return h`<div class="ta-hd">
        <div class="ta-hd-tt"><div class="ta-hd-t"><i class=${'ti ' + icon} aria-hidden="true"></i>${title}</div>${sub ? h`<div class="ta-hd-s">${sub}</div>` : null}</div>
        ${right || null}
      </div>`;
    }
    function Card({ title, sub, right, children, bodyStyle }) {
      return h`<section class="ta-card">
        ${title ? h`<div class="ta-card-hd"><div class="ta-card-t">${title}${sub ? h`<div class="ta-card-s">${sub}</div>` : null}</div>${right || null}</div>` : null}
        <div class="ta-card-b" style=${bodyStyle || null}>${children}</div>
      </section>`;
    }
    function Note({ tone, icon, children }) {
      return h`<div class=${'ta-note' + (tone ? ' ' + tone : '')} role=${tone === 'bad' ? 'alert' : 'note'}><i class=${'ti ' + (icon || (tone === 'bad' ? 'ti-alert-circle' : tone === 'warn' ? 'ti-alert-triangle' : 'ti-info-circle'))} aria-hidden="true"></i><div>${children}</div></div>`;
    }
    function Empty({ icon = 'ti-inbox', title, sub, action }) {
      return h`<div class="ta-empty"><i class=${'ti ' + icon} aria-hidden="true"></i><div class="ta-empty-t">${title}</div>${sub ? h`<div class="ta-empty-s">${sub}</div>` : null}${action || null}</div>`;
    }
    function Loading({ rows = 3 }) {
      return h`<div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-busy="true">${Array.from({ length: rows }, (_, i) => h`<${Skel} key=${i} h=${34}/>`)}</div>`;
    }
    function NeedsMigration({ what, mig }) {
      return h`<${Card}><${Empty} icon="ti-database-cog" title=${what + ' is almost ready'}
        sub=${'This needs database update ' + mig + '. Ask an admin to apply it in Supabase — nothing else to do here until then.'}/><//>`;
    }
    function LoadError({ error, onRetry }) {
      return h`<${Note} tone="bad">${errText(error)} ${onRetry ? h`<button type="button" class="ta-btn sm" style=${{ marginLeft: 8 }} onClick=${onRetry}><i class="ti ti-refresh"></i>Retry</button>` : null}<//>`;
    }

    function Modal({ title, onClose, children, footer, large, busy, labelledBy }) {
      const box = useRef(null);
      const closeRef = useRef(onClose); closeRef.current = onClose;
      useEffect(() => {
        const prev = document.activeElement;
        const onKey = (e) => {
          if (e.key === 'Escape' && !busy) { e.stopPropagation(); closeRef.current && closeRef.current(); }
          if (e.key === 'Tab' && box.current) {
            const f = box.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]');
            if (!f.length) return;
            const first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
          }
        };
        window.addEventListener('keydown', onKey, true);
        setTimeout(() => { const el = box.current && (box.current.querySelector('[data-autofocus]') || box.current.querySelector('input,select,textarea,button.pri')); if (el) try { el.focus(); } catch (_) { } }, 0);
        return () => { window.removeEventListener('keydown', onKey, true); if (prev && prev.focus) try { prev.focus(); } catch (_) { } };
      }, [busy]);
      const node = h`<div class="ta-modal-bg" onMouseDown=${e => { if (e.target === e.currentTarget && !busy) onClose && onClose(); }}>
        <div ref=${box} class=${'ta-modal' + (large ? ' lg' : '')} role="dialog" aria-modal="true" aria-label=${title}>
          <div class="ta-modal-hd">
            <div class="ta-modal-t ta-ellip">${title}</div>
            <button type="button" class="ta-ibtn" aria-label="Close" disabled=${busy} onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="ta-modal-b">${children}</div>
          ${footer ? h`<div class="ta-modal-f">${footer}</div>` : null}
        </div>
      </div>`;
      const RD = deps.ReactDOM || window.ReactDOM;
      return RD && RD.createPortal ? RD.createPortal(node, document.body) : node;
    }

    // ConfirmDialog — onConfirm may be async; throwing keeps the dialog open.
    function ConfirmDialog({ title, body, confirmLabel = 'Confirm', danger, onConfirm, onClose, disabled, children }) {
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState('');
      const go = async () => {
        setBusy(true); setErr('');
        try { await onConfirm(); onClose(); }
        catch (e) { setErr(errText(e)); setBusy(false); }
      };
      return h`<${Modal} title=${title} onClose=${onClose} busy=${busy} footer=${h`<${Fragment}>
          ${err ? h`<span class="ta-err" style=${{ flex: '1 1 100%' }}>${err}</span>` : null}
          <span class="ta-sp"></span>
          <button type="button" class="ta-btn" disabled=${busy} onClick=${onClose}>Cancel</button>
          <button type="button" class=${'ta-btn ' + (danger ? 'danger' : 'pri')} disabled=${busy || disabled} onClick=${go}>${busy ? h`<${Spin}/>` : null}${confirmLabel}</button>
        <//>`}>
        ${body ? h`<div style=${{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--cu-t2)' }}>${body}</div>` : null}
        ${children || null}
      <//>`;
    }

    function ColorPicker({ value, onChange, disabled, label = 'Colour' }) {
      const [open, setOpen] = useState(false);
      const [hex, setHex] = useState(value || '');
      const wrap = useRef(null);
      useEffect(() => { setHex(value || ''); }, [value, open]);
      useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
        document.addEventListener('mousedown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        return () => { document.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey, true); };
      }, [open]);
      const pick = (c) => { setOpen(false); if (c && c.toLowerCase() !== String(value || '').toLowerCase()) onChange(c); };
      return h`<span class="ta-cp" ref=${wrap}>
        <button type="button" class="ta-swatch" style=${{ background: value || '#87909e' }} aria-label=${label + ': ' + (value || 'none')} aria-expanded=${open}
          disabled=${disabled} onClick=${() => setOpen(o => !o)}></button>
        ${open ? h`<div class="ta-cp-pop" role="dialog" aria-label=${label}>
          <div class="ta-cp-grid">${COLORS.map(c => h`<button key=${c} type="button" class=${String(value || '').toLowerCase() === c ? 'on' : ''} style=${{ background: c }} aria-label=${c} onClick=${() => pick(c)}></button>`)}</div>
          <div class="ta-row" style=${{ gap: 6, flexWrap: 'nowrap' }}>
            <input class=${'ta-in sm mono' + (hex && !HEX_RE.test(hex) ? ' bad' : '')} value=${hex} placeholder="#ff00ee" aria-label="Hex colour"
              onInput=${e => setHex(e.target.value.trim())} onKeyDown=${e => { if (e.key === 'Enter' && HEX_RE.test(hex)) pick(hex.toLowerCase()); }}/>
            <button type="button" class="ta-btn sm" disabled=${!HEX_RE.test(hex)} onClick=${() => pick(hex.toLowerCase())}>Set</button>
          </div>
        </div>` : null}
      </span>`;
    }

    // Inline text that commits on blur / Enter; Esc reverts. validate(v) → error string | ''.
    function InlineText({ value, onSave, validate, placeholder, label, disabled, maxLength = 60, className }) {
      const [v, setV] = useState(value || '');
      const [err, setErr] = useState('');
      const focused = useRef(false);
      useEffect(() => { if (!focused.current) setV(value || ''); }, [value]);
      const commit = () => {
        focused.current = false;
        const nv = v.trim();
        if (nv === (value || '')) { setErr(''); setV(value || ''); return; }
        const e = validate ? validate(nv) : (nv ? '' : 'Required');
        if (e) { setErr(e); setV(value || ''); setTimeout(() => setErr(''), 3500); return; }
        setErr('');
        onSave(nv);
      };
      return h`<span style=${{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <input class=${'ta-in sm bare ' + (className || '') + (err ? ' bad' : '')} value=${v} placeholder=${placeholder} aria-label=${label} disabled=${disabled} maxLength=${maxLength}
          aria-invalid=${!!err} onFocus=${() => { focused.current = true; }} onInput=${e => setV(e.target.value)} onBlur=${commit}
          onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.stopPropagation(); setV(value || ''); focused.current = false; setTimeout(() => e.target.blur(), 0); } }}/>
        ${err ? h`<span class="ta-err" role="alert">${err}</span>` : null}
      </span>`;
    }

    // Grouped list picker options (Space › List)
    function listOptions(meta, filterFn) {
      const clientName = {};
      meta.clients.forEach(c => { clientName[c.id] = c.name; });
      const groups = {};
      meta.lists.filter(l => !l.archived && (!filterFn || filterFn(l))).forEach(l => {
        const g = l.client_id ? (clientName[l.client_id] || 'Client') : 'Agency';
        (groups[g] = groups[g] || []).push(l);
      });
      const names = Object.keys(groups).sort((a, b) => (a === 'Agency' ? -1 : b === 'Agency' ? 1 : a.localeCompare(b)));
      return names.map(g => ({ group: g, lists: groups[g].sort((a, b) => (a.position || 0) - (b.position || 0) || String(a.name).localeCompare(String(b.name))) }));
    }
    const listLabel = (meta, id) => {
      const l = meta.lists.find(x => x.id === id);
      if (!l) return 'Unknown list';
      const c = l.client_id && meta.clients.find(x => x.id === l.client_id);
      return (c ? c.name : 'Agency') + ' › ' + l.name;
    };
    function StatusDot({ s, size = 14 }) {
      if (deps.StatusIcon) return h`<${deps.StatusIcon} category=${s.category} color=${s.color} size=${size}/>`;
      return h`<span style=${{ width: size - 4, height: size - 4, borderRadius: '50%', background: s.color || '#87909e', display: 'inline-block', flexShrink: 0 }}></span>`;
    }

    // =========================================================================
    // Statuses — workspace default + per-list workflows (content read-only)
    // =========================================================================
    const LOCK_MSG = 'Editing the workspace default needs database update 093 — customise individual lists for now.';
    function StatusesSection({ user, showToast }) {
      const meta = useMeta();
      const canEdit = isManagerRole(role(user));
      const [scope, setScope] = useState('default');
      const [busy, setBusy] = useState(false);
      const [defaultLocked, setDefaultLocked] = useState(false);
      const [confirmDel, setConfirmDel] = useState(null);   // { row, replace }
      const [dragId, setDragId] = useState(null);
      const [overId, setOverId] = useState(null);
      const [adds, setAdds] = useState({});                  // category → draft name
      const toast = (m) => showToast && showToast(m);

      const listObj = scope !== 'default' && scope !== 'content' ? meta.lists.find(l => l.id === scope) : null;
      useEffect(() => { if (meta.ready && scope !== 'default' && scope !== 'content' && !listObj) setScope('default'); }, [meta.ready, listObj, scope]);
      const byPos = (a, b) => (a.position || 0) - (b.position || 0);
      const defaults = useMemo(() => {
        const d = meta.statuses.filter(s => !s.list_id && (s.kind || 'general') === 'general').sort(byPos);
        return d.length ? d : DEFAULT_GENERAL;
      }, [meta.statuses]);
      const own = useMemo(() => (listObj ? meta.statuses.filter(s => s.list_id === listObj.id).sort(byPos) : []), [meta.statuses, listObj]);
      const inherited = !!listObj && own.length === 0;
      const readOnly = !canEdit || scope === 'content' || (scope === 'default' && defaultLocked);
      const rows = scope === 'content'
        ? meta.statuses.filter(s => !s.list_id && s.kind === 'content').sort(byPos)
        : scope === 'default' ? defaults : (inherited ? defaults : own);
      const groups = CATEGORY_ORDER.map(cat => ({ cat, rows: rows.filter(r => r.category === cat) }));
      const opts = useMemo(() => listOptions(meta, l => l.kind !== 'content'), [meta.lists, meta.clients]);

      const lockIfDefault = (e) => {
        const m = String((e && e.message) || '');
        if (scope === 'default' && (e && e.code === 'forbidden' || /bad_list|forbidden/.test(m))) { setDefaultLocked(true); toast(LOCK_MSG); return true; }
        return false;
      };
      const run = async (fn) => {
        if (busy) return;
        setBusy(true);
        try { await fn(); await meta.reload(); }
        catch (e) { if (!lockIfDefault(e)) toast(errText(e)); }
        setBusy(false);
      };
      // An inherited list has no rows of its own: copy the defaults first (v1 RPCs seed on first
      // upsert), then drop the temporary status. Returns the list's own rows.
      const materialize = async () => {
        const temp = await api.statusUpsert({ list_id: listObj.id, name: 'Customise placeholder', color: '#87909e', category: 'todo' });
        const boot = await rpcCall('task_bootstrap');
        const mine = arr(boot && boot.statuses).filter(s => s.list_id === listObj.id && s.id !== temp.id);
        const repl = mine.find(s => s.category === 'todo') || mine[0];
        if (repl) await api.statusDelete(temp.id, repl.key);
        return mine;
      };
      const resolve = async (row) => {
        if (scope === 'default' && String(row.id || '').startsWith('default-')) { const e = new Error('bad_list'); throw e; }
        if (!inherited) return row;
        const mine = await materialize();
        const hit = mine.find(s => s.key === row.key);
        if (!hit) throw new Error('not_found');
        return hit;
      };
      const validateName = (name, exceptId) => {
        if (!name) return 'Status needs a name';
        if (name.length > 40) return 'Keep it under 40 characters';
        if (rows.some(r => r.id !== exceptId && String(r.name).toLowerCase() === name.toLowerCase())) return 'A status with that name already exists';
        return '';
      };
      const lastOf = (row) => (row.category === 'todo' || row.category === 'done') && rows.filter(r => r.category === row.category).length === 1;
      const patch = (row, p) => run(async () => { const t = await resolve(row); await api.statusUpsert({ id: t.id, ...p }); });
      const posBefore = (cat, targetRow, movingId) => {
        const g = rows.filter(r => r.category === cat && r.id !== movingId);
        const i = targetRow ? g.findIndex(r => r.id === targetRow.id) : g.length;
        const prev = g[i - 1], next = g[i];
        if (prev && next) return ((prev.position || 0) + (next.position || 0)) / 2;
        if (prev) return (prev.position || 0) + 1;
        if (next) return (next.position || 0) - 1;
        return rows.reduce((m, r) => Math.max(m, r.position || 0), 0) + 1;
      };
      const move = (row, dir) => {
        const g = rows.filter(r => r.category === row.category);
        const i = g.findIndex(r => r.id === row.id);
        const j = i + dir;
        if (j < 0 || j >= g.length) return;
        const target = dir < 0 ? g[j] : g[j + 1] || null;
        patch(row, { position: posBefore(row.category, target, row.id) });
      };
      const dropOn = (target, cat) => {
        const row = rows.find(r => r.id === dragId);
        setDragId(null); setOverId(null);
        if (!row || (target && target.id === row.id)) return;
        const toCat = target ? target.category : cat;
        if (toCat !== row.category && lastOf(row)) { toast('A workflow needs at least one Not started and one Closed status'); return; }
        const p = { position: posBefore(toCat, target, row.id) };
        if (toCat !== row.category) p.category = toCat;
        patch(row, p);
      };
      const add = (cat) => {
        const name = String(adds[cat] || '').trim();
        const e = validateName(name);
        if (e) { toast(e); return; }
        if (scope === 'default' && defaults[0] && String(defaults[0].id).startsWith('default-')) { setDefaultLocked(true); toast(LOCK_MSG); return; }
        run(async () => {
          await api.statusUpsert({ list_id: scope === 'default' ? null : listObj.id, kind: 'general', name, category: cat, color: COLORS[(rows.length + 1) % COLORS.length] });
          setAdds(a => ({ ...a, [cat]: '' }));
          toast('Status "' + name + '" added');
        });
      };
      const askDelete = (row) => {
        if (lastOf(row)) { toast('A workflow needs at least one Not started and one Closed status'); return; }
        const repl = rows.find(r => r.id !== row.id && r.category === row.category) || rows.find(r => r.id !== row.id);
        setConfirmDel({ row, replace: repl ? repl.key : '' });
      };
      const doDelete = async () => {
        const { row, replace } = confirmDel;
        try {
          const t = await resolve(row);
          await api.statusDelete(t.id, replace);
          await meta.reload();
          toast('Status "' + row.name + '" deleted');
        } catch (e) { if (lockIfDefault(e)) return; throw e; }
      };

      const rowView = (r, i, g) => h`<div key=${r.id} class=${'ta-li' + (dragId === r.id ? ' dragging' : '') + (overId === r.id ? ' drag-over' : '')}
          draggable=${!readOnly && !busy} onDragStart=${e => { setDragId(r.id); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); } catch (_) { } }}
          onDragEnd=${() => { setDragId(null); setOverId(null); }}
          onDragOver=${e => { if (dragId) { e.preventDefault(); if (overId !== r.id) setOverId(r.id); } }}
          onDrop=${e => { e.preventDefault(); dropOn(r); }}>
        ${readOnly ? null : h`<i class="ti ti-grip-vertical ta-grip" aria-hidden="true"></i>`}
        <${StatusDot} s=${r}/>
        <${ColorPicker} value=${r.color} disabled=${readOnly || busy} label=${'Colour for ' + r.name} onChange=${c => patch(r, { color: c })}/>
        ${readOnly
          ? h`<span class="ta-ellip" style=${{ flex: 1, fontWeight: 500, padding: '0 7px' }}>${r.name}</span>`
          : h`<${InlineText} value=${r.name} label=${'Status name ' + r.name} disabled=${busy} maxLength=${40}
              validate=${v => validateName(v, r.id)} onSave=${v => patch(r, { name: v })}/>`}
        <span class="ta-mono ta-hide-sm" title="Status key (used by automations and imports)">${r.key}</span>
        ${readOnly ? h`<span class="ta-chip">${CATEGORY_LABEL[r.category]}</span>` : h`<${Fragment}>
          <select class="ta-in sm" style=${{ width: 118 }} value=${r.category} disabled=${busy} aria-label=${'Category for ' + r.name}
            onChange=${e => { const c = e.target.value; if (lastOf(r)) { toast('A workflow needs at least one Not started and one Closed status'); e.target.value = r.category; return; } patch(r, { category: c, position: posBefore(c, null, r.id) }); }}>
            ${CATEGORY_ORDER.map(c => h`<option key=${c} value=${c}>${CATEGORY_LABEL[c]}</option>`)}
          </select>
          <button type="button" class="ta-ibtn" aria-label=${'Move ' + r.name + ' up'} disabled=${busy || i === 0} onClick=${() => move(r, -1)}><i class="ti ti-arrow-up"></i></button>
          <button type="button" class="ta-ibtn" aria-label=${'Move ' + r.name + ' down'} disabled=${busy || i === g.length - 1} onClick=${() => move(r, 1)}><i class="ti ti-arrow-down"></i></button>
          <button type="button" class="ta-ibtn danger" aria-label=${'Delete ' + r.name} disabled=${busy} onClick=${() => askDelete(r)}><i class="ti ti-trash"></i></button>
        <//>`}
      </div>`;

      return h`<div class="ta-root">
        <${Head} icon="ti-circle-dot" title="Statuses"
          sub="The steps a task moves through. Every list uses the workspace default unless you give it its own workflow. Not started, Active and Closed decide what counts as open, in progress and done everywhere (views, overdue, reports)."
          right=${busy ? h`<span class="ta-hint" role="status"><${Spin}/> Saving…</span>` : null}/>
        ${!canEdit ? h`<${Note}>Only admins and managers can change workflows. You can still browse them here.<//>` : null}
        ${meta.error && !meta.ready ? h`<${LoadError} error=${meta.error} onRetry=${meta.reload}/>` : null}
        ${!meta.ready ? (meta.error ? null : h`<${Card}><${Loading} rows=${5}/><//>`) : h`<${Card}>
          <div class="ta-row" style=${{ marginBottom: 12 }}>
            <label class="ta-f" style=${{ flex: '1 1 280px', maxWidth: 420 }}>
              <span class="ta-lbl">Workflow</span>
              <select class="ta-in" value=${scope} onChange=${e => setScope(e.target.value)}>
                <optgroup label="Workspace">
                  <option value="default">Default workflow (all lists)</option>
                  <option value="content">Content calendar (fixed)</option>
                </optgroup>
                ${opts.map(g => h`<optgroup key=${g.group} label=${g.group}>
                  ${g.lists.map(l => h`<option key=${l.id} value=${l.id}>${l.name}${meta.statuses.some(s => s.list_id === l.id) ? ' · custom' : ''}</option>`)}
                </optgroup>`)}
              </select>
            </label>
          </div>
          ${scope === 'content' ? h`<${Note} icon="ti-lock">Content calendar statuses drive client approvals, publishing and reports, so they can't be changed.<//>` : null}
          ${scope === 'default' ? (defaultLocked ? h`<${Note} tone="warn">${LOCK_MSG}<//>` : h`<${Note}>Used by every list that doesn't have its own workflow. Renaming a status here renames it on all of those lists.<//>`) : null}
          ${inherited ? h`<${Note}>${listLabel(meta, listObj.id)} uses the workspace default. Any change below gives this list its own workflow — other lists aren't affected.<//>` : null}
          ${listObj && !inherited ? h`<${Note} icon="ti-adjustments">${listLabel(meta, listObj.id)} has a custom workflow (${own.length} statuses).<//>` : null}
          ${groups.map(g => h`<div key=${g.cat}>
            <div class="ta-grp"><span>${CATEGORY_LABEL[g.cat]}</span><span style=${{ fontWeight: 500 }}>${g.rows.length}</span></div>
            <div class="ta-rows" onDragOver=${e => { if (dragId && !g.rows.length) e.preventDefault(); }} onDrop=${e => { if (!g.rows.length) { e.preventDefault(); dropOn(null, g.cat); } }}>
              ${g.rows.length ? g.rows.map((r, i) => rowView(r, i, g.rows)) : h`<div class="ta-li" style=${{ color: 'var(--cu-t3)' }}>No ${CATEGORY_LABEL[g.cat].toLowerCase()} statuses</div>`}
              ${readOnly ? null : h`<div class="ta-add">
                <i class="ti ti-plus" aria-hidden="true"></i>
                <input value=${adds[g.cat] || ''} placeholder=${'Add ' + CATEGORY_LABEL[g.cat].toLowerCase() + ' status'} aria-label=${'Add ' + CATEGORY_LABEL[g.cat] + ' status'} maxLength=${40} disabled=${busy}
                  onInput=${e => { const v = e.target.value; setAdds(a => ({ ...a, [g.cat]: v })); }} onKeyDown=${e => { if (e.key === 'Enter') add(g.cat); }}/>
                ${String(adds[g.cat] || '').trim() ? h`<button type="button" class="ta-btn sm pri" disabled=${busy} onClick=${() => add(g.cat)}>Add</button>` : null}
              </div>`}
            </div>
          </div>`)}
          ${readOnly ? null : h`<div class="ta-hint" style=${{ marginTop: 10 }}>Drag rows (or use the arrows) to reorder; drop onto another group to change its category. Deleting a status moves its tasks to the status you choose.</div>`}
        <//>`}
        ${confirmDel ? h`<${ConfirmDialog} title=${'Delete "' + confirmDel.row.name + '"?'} danger=${true} confirmLabel="Delete status"
            disabled=${!confirmDel.replace} onClose=${() => setConfirmDel(null)} onConfirm=${doDelete}
            body=${'Tasks currently in "' + confirmDel.row.name + '" will move to the status you pick. This can\'t be undone.'}>
          <label class="ta-f" style=${{ marginTop: 12 }}>
            <span class="ta-lbl">Move its tasks to</span>
            <select class="ta-in" value=${confirmDel.replace} data-autofocus=${true} onChange=${e => { const v = e.target.value; setConfirmDel(c => ({ ...c, replace: v })); }}>
              ${rows.filter(r => r.id !== confirmDel.row.id).map(r => h`<option key=${r.id} value=${r.key}>${r.name} (${CATEGORY_LABEL[r.category]})</option>`)}
            </select>
          </label>
        <//>` : null}
      </div>`;
    }

    // =========================================================================
    // Tags — Tag Manager (rename, recolour, merge, delete, usage)
    // =========================================================================
    async function tagUsage(tagId, limit) {
      const res = await rpcCall('tasks_query', { p_filter: { tag_ids: [tagId], include_closed: true, top_level: false, limit: limit || 1 } });
      return { total: Number(res && res.total) || arr(res && res.rows).length, rows: arr(res && res.rows) };
    }
    function TagsSection({ user, showToast }) {
      const meta = useMeta();
      const canEdit = isManagerRole(role(user));
      const toast = (m) => showToast && showToast(m);
      const [counts, setCounts] = useState({});
      const [q, setQ] = useState('');
      const [sort, setSort] = useState('name');
      const [draft, setDraft] = useState({ name: '', color: COLORS[1] });
      const [busy, setBusy] = useState('');
      const [merge, setMerge] = useState(null);      // { tag, target }
      const [del, setDel] = useState(null);          // tag
      const [progress, setProgress] = useState('');
      const tags = meta.tags;
      const idsKey = tags.map(t => t.id).join(',');

      const loadCounts = useCallback(async (force) => {
        const todo = tags.filter(t => force || counts[t.id] === undefined).map(t => t.id);
        if (!todo.length) return;
        let i = 0;
        const worker = async () => {
          while (i < todo.length) {
            const id = todo[i++];
            try { const u = await tagUsage(id); setCounts(c => ({ ...c, [id]: u.total })); }
            catch (_) { setCounts(c => ({ ...c, [id]: null })); }
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
      }, [idsKey]);
      useEffect(() => { if (meta.ready) loadCounts(false); }, [meta.ready, loadCounts]);

      const nameTaken = (name, exceptId) => tags.some(t => t.id !== exceptId && String(t.name).toLowerCase() === name.toLowerCase());
      const validate = (name, exceptId) => !name ? 'Tag needs a name' : name.length > 40 ? 'Keep it under 40 characters' : nameTaken(name, exceptId) ? 'That tag already exists — merge instead' : '';
      const run = async (key, fn) => {
        setBusy(key);
        try { await fn(); await meta.reload(); } catch (e) { toast(errText(e)); }
        setBusy('');
      };
      const create = () => {
        const name = draft.name.trim();
        const e = validate(name);
        if (e) { toast(e); return; }
        run('create', async () => {
          const t = await api.tagUpsert({ name, color: draft.color });
          setDraft({ name: '', color: COLORS[(tags.length + 2) % COLORS.length] });
          if (t && t.id) setCounts(c => ({ ...c, [t.id]: 0 }));
          toast('Tag "' + name + '" created');
        });
      };
      const doMerge = async () => {
        const src = merge.tag, dst = tags.find(t => t.id === merge.target);
        if (!dst) throw new Error('Pick a tag to merge into');
        let serverSide = false;
        try { await rpcCall('task_tag_merge', { p_source_id: src.id, p_target_id: dst.id }); serverSide = true; }
        catch (e) { if (!isMissingRpc(e)) throw e; }
        if (!serverSide) {
          const { rows } = await tagUsage(src.id, 2000);
          for (let n = 0; n < rows.length; n++) {
            const r = rows[n];
            setProgress('Updating task ' + (n + 1) + ' of ' + rows.length + '…');
            const next = Array.from(new Set(arr(r.tag_ids).filter(x => x !== src.id).concat(dst.id)));
            await rpcCall('task_update', { p_id: r.id, p_patch: { tag_ids: next } });
            taskBus.emit('task:changed', { id: r.id });
          }
          await api.tagDelete(src.id);
        } else taskBus.emit('meta:changed');
        setProgress('');
        setCounts(c => { const o = { ...c }; delete o[src.id]; delete o[dst.id]; return o; });
        await meta.reload();
        toast('Merged "' + src.name + '" into "' + dst.name + '"');
      };
      const doDelete = async () => {
        await api.tagDelete(del.id);
        await meta.reload();
        toast('Tag "' + del.name + '" deleted');
      };

      const s = q.trim().toLowerCase();
      const shown = tags.filter(t => !s || String(t.name).toLowerCase().includes(s))
        .sort((a, b) => sort === 'usage' ? ((counts[b.id] || 0) - (counts[a.id] || 0) || String(a.name).localeCompare(String(b.name))) : String(a.name).localeCompare(String(b.name)));
      const unused = tags.filter(t => counts[t.id] === 0).length;

      return h`<div class="ta-root">
        <${Head} icon="ti-tags" title="Tags"
          sub="Workspace-wide labels for tasks. Rename or recolour a tag and every task using it updates. Merge duplicates so filters and reports stay clean."/>
        ${!canEdit ? h`<${Note}>Only admins and managers can rename, merge or delete tags. Anyone can still create tags from a task.<//>` : null}
        ${meta.error && !meta.ready ? h`<${LoadError} error=${meta.error} onRetry=${meta.reload}/>` : null}
        ${!meta.ready ? (meta.error ? null : h`<${Card}><${Loading} rows=${5}/><//>`) : h`<${Card}
          title=${tags.length + ' tag' + (tags.length === 1 ? '' : 's')} sub=${unused ? unused + ' not used on any task you can see' : null}
          right=${h`<div class="ta-row" style=${{ gap: 6 }}>
            <input class="ta-in sm" style=${{ width: 180 }} type="search" placeholder="Search tags" aria-label="Search tags" value=${q} onInput=${e => setQ(e.target.value)}/>
            <div class="ta-seg" role="group" aria-label="Sort tags">
              <button type="button" class=${sort === 'name' ? 'on' : ''} aria-pressed=${sort === 'name'} onClick=${() => setSort('name')}>A–Z</button>
              <button type="button" class=${sort === 'usage' ? 'on' : ''} aria-pressed=${sort === 'usage'} onClick=${() => setSort('usage')}>Most used</button>
            </div>
            <button type="button" class="ta-ibtn" aria-label="Recount usage" title="Recount usage" onClick=${() => loadCounts(true)}><i class="ti ti-refresh"></i></button>
          </div>`}>
          <div class="ta-rows">
            ${canEdit ? h`<div class="ta-add" style=${{ borderTop: 'none', borderBottom: '1px solid var(--cu-bd)' }}>
              <${ColorPicker} value=${draft.color} label="New tag colour" onChange=${c => setDraft(d => ({ ...d, color: c }))}/>
              <input value=${draft.name} placeholder="New tag name" aria-label="New tag name" maxLength=${40} disabled=${busy === 'create'}
                onInput=${e => { const v = e.target.value; setDraft(d => ({ ...d, name: v })); }} onKeyDown=${e => { if (e.key === 'Enter') create(); }}/>
              <button type="button" class="ta-btn sm pri" disabled=${!draft.name.trim() || busy === 'create'} onClick=${create}>${busy === 'create' ? h`<${Spin}/>` : h`<i class="ti ti-plus"></i>`}Create</button>
            </div>` : null}
            ${!tags.length ? h`<${Empty} icon="ti-tag" title="No tags yet" sub="Create one above, or add tags from any task — they show up here."/>`
              : !shown.length ? h`<div class="ta-li" style=${{ color: 'var(--cu-t3)' }}>No tags match "${q}"</div>`
              : shown.map(t => h`<div key=${t.id} class="ta-li">
                <${ColorPicker} value=${t.color} disabled=${!canEdit || !!busy} label=${'Colour for ' + t.name} onChange=${c => run('c' + t.id, () => api.tagUpsert({ id: t.id, color: c }))}/>
                ${canEdit
                  ? h`<${InlineText} value=${t.name} label=${'Tag name ' + t.name} maxLength=${40} disabled=${!!busy} validate=${v => validate(v, t.id)}
                      onSave=${v => run('n' + t.id, async () => { await api.tagUpsert({ id: t.id, name: v }); toast('Renamed to "' + v + '"'); })}/>`
                  : h`<span class="ta-ellip" style=${{ flex: 1, padding: '0 7px' }}>${t.name}</span>`}
                <span class="ta-chip" style=${{ background: (t.color || '#87909e') + '24', color: t.color || 'var(--cu-t2)', fontWeight: 600 }}>${t.name}</span>
                <span class="ta-hint" style=${{ width: 78, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                  title="Tasks using this tag (that you can see)">${counts[t.id] === undefined ? '…' : counts[t.id] === null ? '—' : counts[t.id] + ' task' + (counts[t.id] === 1 ? '' : 's')}</span>
                ${canEdit ? h`<${Fragment}>
                  <button type="button" class="ta-ibtn" aria-label=${'Merge ' + t.name + ' into another tag'} title="Merge into…" disabled=${!!busy || tags.length < 2}
                    onClick=${() => setMerge({ tag: t, target: (tags.find(x => x.id !== t.id) || {}).id || '' })}><i class="ti ti-arrow-merge"></i></button>
                  <button type="button" class="ta-ibtn danger" aria-label=${'Delete ' + t.name} title="Delete" disabled=${!!busy} onClick=${() => setDel(t)}><i class="ti ti-trash"></i></button>
                <//>` : null}
              </div>`)}
          </div>
        <//>`}
        ${merge ? h`<${ConfirmDialog} title=${'Merge "' + merge.tag.name + '"'} confirmLabel=${progress ? 'Merging…' : 'Merge tags'} disabled=${!merge.target}
            onClose=${() => { if (!progress) setMerge(null); }} onConfirm=${doMerge}
            body=${'Every task tagged "' + merge.tag.name + '"' + (counts[merge.tag.id] ? ' (' + counts[merge.tag.id] + ')' : '') + ' gets the tag you pick instead, then "' + merge.tag.name + '" is deleted.'}>
          <label class="ta-f" style=${{ marginTop: 12 }}>
            <span class="ta-lbl">Merge into</span>
            <select class="ta-in" value=${merge.target} data-autofocus=${true} onChange=${e => { const v = e.target.value; setMerge(m => ({ ...m, target: v })); }}>
              ${tags.filter(x => x.id !== merge.tag.id).sort((a, b) => String(a.name).localeCompare(String(b.name))).map(x => h`<option key=${x.id} value=${x.id}>${x.name}</option>`)}
            </select>
          </label>
          ${progress ? h`<div class="ta-hint" role="status" style=${{ marginTop: 10 }}><${Spin}/> ${progress}</div>` : null}
        <//>` : null}
        ${del ? h`<${ConfirmDialog} title=${'Delete "' + del.name + '"?'} danger=${true} confirmLabel="Delete tag" onClose=${() => setDel(null)} onConfirm=${doDelete}
            body=${(counts[del.id] ? 'It will be removed from ' + counts[del.id] + ' task' + (counts[del.id] === 1 ? '' : 's') + '. ' : '') + "This can't be undone."}/>` : null}
      </div>`;
    }

    // =========================================================================
    // Custom fields — Field Manager (all 11 types, options editor, scope)
    // =========================================================================
    function OptionsEditor({ options, onChange, disabled }) {
      const opts = arr(options);
      const set = (i, patch) => onChange(opts.map((o, n) => n === i ? { ...o, ...patch } : o));
      const move = (i, dir) => {
        const j = i + dir; if (j < 0 || j >= opts.length) return;
        const next = opts.slice(); const [x] = next.splice(i, 1); next.splice(j, 0, x); onChange(next);
      };
      return h`<div>
        <div class="ta-rows">
          ${opts.length ? opts.map((o, i) => h`<div key=${o.id || i} class="ta-li">
            <${ColorPicker} value=${o.color} disabled=${disabled} label=${'Colour for option ' + (o.label || i + 1)} onChange=${c => set(i, { color: c })}/>
            <input class="ta-in sm" style=${{ flex: 1 }} value=${o.label || ''} placeholder=${'Option ' + (i + 1)} aria-label=${'Option ' + (i + 1) + ' label'} maxLength=${60}
              disabled=${disabled} onInput=${e => set(i, { label: e.target.value })}/>
            <button type="button" class="ta-ibtn" aria-label="Move option up" disabled=${disabled || i === 0} onClick=${() => move(i, -1)}><i class="ti ti-arrow-up"></i></button>
            <button type="button" class="ta-ibtn" aria-label="Move option down" disabled=${disabled || i === opts.length - 1} onClick=${() => move(i, 1)}><i class="ti ti-arrow-down"></i></button>
            <button type="button" class="ta-ibtn danger" aria-label=${'Remove option ' + (o.label || i + 1)} disabled=${disabled} onClick=${() => onChange(opts.filter((_, n) => n !== i))}><i class="ti ti-trash"></i></button>
          </div>`) : h`<div class="ta-li" style=${{ color: 'var(--cu-t3)' }}>No options yet — add at least one</div>`}
          <div class="ta-add">
            <i class="ti ti-plus" aria-hidden="true"></i>
            <button type="button" class="ta-btn sm" disabled=${disabled} onClick=${() => onChange(opts.concat({ id: uid(), label: '', color: COLORS[opts.length % COLORS.length] }))}>Add option</button>
          </div>
        </div>
        <div class="ta-hint" style=${{ marginTop: 6 }}>Removing an option leaves tasks that used it empty — rename it instead when you can.</div>
      </div>`;
    }

    function FieldEditor({ field, meta, onClose, onSaved, showToast }) {
      const editing = !!(field && field.id);
      const [name, setName] = useState((field && field.name) || '');
      const [type, setType] = useState((field && field.type) || 'text');
      const [listId, setListId] = useState((field && field.list_id) || '');
      const [options, setOptions] = useState(arr(field && field.options).map(o => ({ id: o.id || uid(), label: o.label || '', color: o.color || '#87909e' })));
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState('');
      const needsOptions = type === 'dropdown' || type === 'labels';
      const opts = useMemo(() => listOptions(meta), [meta.lists, meta.clients]);

      const save = async () => {
        const nm = name.trim();
        if (!nm) { setErr('Give the field a name'); return; }
        if (nm.length > 60) { setErr('Keep the name under 60 characters'); return; }
        const clash = meta.fields.some(f => f.id !== (field && field.id) && String(f.name).toLowerCase() === nm.toLowerCase() && (f.list_id || '') === (listId || ''));
        if (clash) { setErr('A field with that name already exists in this scope'); return; }
        const clean = options.map(o => ({ ...o, label: String(o.label || '').trim() })).filter(o => o.label);
        if (needsOptions && !clean.length) { setErr('Add at least one option'); return; }
        if (needsOptions && new Set(clean.map(o => o.label.toLowerCase())).size !== clean.length) { setErr('Option names must be different'); return; }
        setBusy(true); setErr('');
        try {
          await api.fieldUpsert(editing
            ? { id: field.id, name: nm, options: needsOptions ? clean : [] }
            : { name: nm, type, list_id: listId || null, options: needsOptions ? clean : [] });
          showToast(editing ? 'Field updated ✓' : 'Field "' + nm + '" created');
          await onSaved();
          onClose();
        } catch (e) { setErr(errText(e)); setBusy(false); }
      };

      return h`<${Modal} title=${editing ? 'Edit field' : 'New custom field'} onClose=${onClose} busy=${busy}
        footer=${h`<${Fragment}>
          ${err ? h`<span class="ta-err" style=${{ flex: '1 1 100%' }} role="alert">${err}</span>` : null}
          <span class="ta-sp"></span>
          <button type="button" class="ta-btn" disabled=${busy} onClick=${onClose}>Cancel</button>
          <button type="button" class="ta-btn pri" disabled=${busy || !name.trim()} onClick=${save}>${busy ? h`<${Spin}/>` : null}${editing ? 'Save field' : 'Create field'}</button>
        <//>`}>
        <label class="ta-f" style=${{ marginBottom: 14 }}>
          <span class="ta-lbl">Field name</span>
          <input class="ta-in" value=${name} data-autofocus=${true} maxLength=${60} placeholder="e.g. Ad budget" aria-label="Field name"
            onInput=${e => setName(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') save(); }}/>
        </label>
        <div class="ta-f" style=${{ marginBottom: 14 }}>
          <span class="ta-lbl">Type${editing ? ' (fixed)' : ''}</span>
          <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(122px,1fr))', gap: 6 }} role="radiogroup" aria-label="Field type">
            ${FIELD_TYPES.map(t => h`<button key=${t.key} type="button" role="radio" aria-checked=${type === t.key} disabled=${editing}
              class=${'ta-btn' + (type === t.key ? ' pri' : '')} style=${{ justifyContent: 'flex-start', opacity: editing && type !== t.key ? .4 : 1 }}
              onClick=${() => setType(t.key)}><i class=${'ti ' + t.icon}></i>${t.label}</button>`)}
          </div>
          ${editing ? h`<span class="ta-hint">The type can't change once tasks hold values. Create a new field instead.</span>` : null}
        </div>
        <label class="ta-f" style=${{ marginBottom: 14 }}>
          <span class="ta-lbl">Shows on${editing ? ' (fixed)' : ''}</span>
          <select class="ta-in" value=${listId} disabled=${editing} aria-label="Field scope" onChange=${e => setListId(e.target.value)}>
            <option value="">Every task in the workspace</option>
            ${opts.map(g => h`<optgroup key=${g.group} label=${g.group}>${g.lists.map(l => h`<option key=${l.id} value=${l.id}>${l.name} only</option>`)}</optgroup>`)}
          </select>
        </label>
        ${needsOptions ? h`<div class="ta-f">
          <span class="ta-lbl">${type === 'labels' ? 'Labels (a task can hold several)' : 'Options (a task holds one)'}</span>
          <${OptionsEditor} options=${options} onChange=${setOptions} disabled=${busy}/>
        </div>` : null}
      <//>`;
    }

    function FieldsSection({ user, showToast }) {
      const meta = useMeta();
      const canEdit = isManagerRole(role(user)) || role(user) === 'seo';
      const canDelete = isManagerRole(role(user));
      const toast = (m) => showToast && showToast(m);
      const [scope, setScope] = useState('all');
      const [edit, setEdit] = useState(null);     // field | {} for new
      const [del, setDel] = useState(null);
      const [busy, setBusy] = useState(false);

      const fields = meta.fields.slice().sort((a, b) => (a.position || 0) - (b.position || 0));
      const shown = fields.filter(f => scope === 'all' || (scope === 'workspace' ? !f.list_id : f.list_id === scope));
      const opts = useMemo(() => listOptions(meta), [meta.lists, meta.clients]);
      const move = async (f, dir) => {
        const sib = fields.filter(x => (x.list_id || '') === (f.list_id || ''));
        const i = sib.findIndex(x => x.id === f.id), j = i + dir;
        if (j < 0 || j >= sib.length) return;
        const prev = dir < 0 ? sib[j - 1] : sib[j], next = dir < 0 ? sib[j] : sib[j + 1];
        const pos = prev && next ? ((prev.position || 0) + (next.position || 0)) / 2 : prev ? (prev.position || 0) + 1 : (next.position || 0) - 1;
        setBusy(true);
        try { await api.fieldUpsert({ id: f.id, position: pos }); await meta.reload(); } catch (e) { toast(errText(e)); }
        setBusy(false);
      };
      const doDelete = async () => { await api.fieldDelete(del.id); await meta.reload(); toast('Field "' + del.name + '" deleted'); };

      return h`<div class="ta-root">
        <${Head} icon="ti-forms" title="Custom fields"
          sub="Extra columns on tasks — budgets, links, ratings, anything your workflow needs. Workspace fields show on every task; list fields only on that list. They appear in the task panel and as columns in List and Table views."
          right=${canEdit ? h`<button type="button" class="ta-btn pri" onClick=${() => setEdit({})}><i class="ti ti-plus"></i>New field</button>` : null}/>
        ${!canEdit ? h`<${Note}>Only admins, managers and SEO can add fields.<//>` : null}
        ${meta.error && !meta.ready ? h`<${LoadError} error=${meta.error} onRetry=${meta.reload}/>` : null}
        ${!meta.ready ? (meta.error ? null : h`<${Card}><${Loading} rows=${4}/><//>`) : h`<${Card}
          title=${fields.length + ' field' + (fields.length === 1 ? '' : 's')}
          right=${h`<select class="ta-in sm" style=${{ width: 210 }} value=${scope} aria-label="Filter by scope" onChange=${e => setScope(e.target.value)}>
            <option value="all">All fields</option>
            <option value="workspace">Workspace-wide</option>
            ${opts.map(g => h`<optgroup key=${g.group} label=${g.group}>${g.lists.map(l => h`<option key=${l.id} value=${l.id}>${l.name}</option>`)}</optgroup>`)}
          </select>`}>
          ${!fields.length ? h`<${Empty} icon="ti-forms" title="No custom fields yet"
              sub="Add one to track things tasks don't capture out of the box — ad spend, a campaign link, a client rating."
              action=${canEdit ? h`<button type="button" class="ta-btn pri" style=${{ marginTop: 10 }} onClick=${() => setEdit({})}><i class="ti ti-plus"></i>New field</button>` : null}/>`
            : !shown.length ? h`<${Empty} icon="ti-filter" title="No fields in this scope" sub="Pick another scope, or create a field here."/>`
            : h`<div class="ta-tbl-wrap"><table class="ta-tbl">
              <thead><tr><th>Field</th><th>Type</th><th>Shows on</th><th class="ta-hide-sm">Options</th><th></th></tr></thead>
              <tbody>${shown.map((f, i) => h`<tr key=${f.id}>
                <td><div class="ta-row" style=${{ gap: 7, flexWrap: 'nowrap' }}>
                  <i class=${'ti ' + ((FIELD_BY_KEY[f.type] || {}).icon || 'ti-square')} style=${{ color: 'var(--cu-t3)', fontSize: 15 }}></i>
                  <span class="ta-ellip" style=${{ fontWeight: 500, maxWidth: 220 }}>${f.name}</span>
                </div></td>
                <td><span class="ta-chip">${(FIELD_BY_KEY[f.type] || {}).label || f.type}</span></td>
                <td class="ta-ellip" style=${{ maxWidth: 220, color: 'var(--cu-t2)' }}>${f.list_id ? listLabel(meta, f.list_id) : 'Every task'}</td>
                <td class="ta-hide-sm" style=${{ color: 'var(--cu-t3)' }}>${arr(f.options).length ? arr(f.options).length + ' option' + (arr(f.options).length === 1 ? '' : 's') : '—'}</td>
                <td style=${{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button type="button" class="ta-ibtn" aria-label=${'Move ' + f.name + ' up'} disabled=${busy || i === 0} onClick=${() => move(f, -1)}><i class="ti ti-arrow-up"></i></button>
                  <button type="button" class="ta-ibtn" aria-label=${'Move ' + f.name + ' down'} disabled=${busy || i === shown.length - 1} onClick=${() => move(f, 1)}><i class="ti ti-arrow-down"></i></button>
                  ${canEdit ? h`<button type="button" class="ta-ibtn" aria-label=${'Edit ' + f.name} onClick=${() => setEdit(f)}><i class="ti ti-pencil"></i></button>` : null}
                  ${canDelete ? h`<button type="button" class="ta-ibtn danger" aria-label=${'Delete ' + f.name} onClick=${() => setDel(f)}><i class="ti ti-trash"></i></button>` : null}
                </td>
              </tr>`)}</tbody>
            </table></div>`}
        <//>`}
        ${edit ? h`<${FieldEditor} field=${edit.id ? edit : null} meta=${meta} showToast=${toast} onClose=${() => setEdit(null)} onSaved=${meta.reload}/>` : null}
        ${del ? h`<${ConfirmDialog} title=${'Delete "' + del.name + '"?'} danger=${true} confirmLabel="Delete field" onClose=${() => setDel(null)} onConfirm=${doDelete}
            body=${"The field and its value are removed from every task. This can't be undone."}/>` : null}
      </div>`;
    }

    // =========================================================================
    // Task templates — Template Center (093 payload: { task: node } / { tasks: [node] })
    // =========================================================================
    const TPL_TYPES = Object.keys(TYPE_ALL).filter(k => k !== 'post' && k !== 'direct' && k !== 'milestone');
    function nodeIn(raw) {
      const o = (raw && typeof raw === 'object') ? raw : {};
      const { title, description, type, priority, estimate_minutes, due_offset_days, due_time, start_offset_days, checklists, subtasks, ...rest } = o;
      return {
        _k: uid(),
        title: title || '', description: description || '', type: type || 'task',
        priority: priority === 0 || priority ? Number(priority) : null,
        estimate_minutes: estimate_minutes === 0 || estimate_minutes ? Number(estimate_minutes) : null,
        due_offset_days: due_offset_days === 0 || due_offset_days ? Number(due_offset_days) : null,
        due_time: due_time || '',
        start_offset_days: start_offset_days === 0 || start_offset_days ? Number(start_offset_days) : null,
        checklists: arr(checklists).map(c => ({ _k: uid(), name: (c && c.name) || 'Checklist', items: arr(c && c.items).map(it => ({ _k: uid(), text: typeof it === 'string' ? it : ((it && it.text) || '') })) })),
        subtasks: arr(subtasks).map(nodeIn),
        rest,
      };
    }
    function nodeOut(n) {
      const o = { ...(n.rest || {}), title: n.title.trim(), type: n.type || 'task' };
      if (n.description && n.description.trim()) o.description = n.description.trim(); else delete o.description;
      if (n.priority) o.priority = Number(n.priority); else delete o.priority;
      if (n.estimate_minutes) o.estimate_minutes = Number(n.estimate_minutes); else delete o.estimate_minutes;
      if (n.due_offset_days !== null && n.due_offset_days !== undefined && n.due_offset_days !== '') o.due_offset_days = Number(n.due_offset_days); else delete o.due_offset_days;
      if (o.due_offset_days !== undefined && n.due_time) o.due_time = n.due_time; else delete o.due_time;
      if (n.start_offset_days !== null && n.start_offset_days !== undefined && n.start_offset_days !== '') o.start_offset_days = Number(n.start_offset_days); else delete o.start_offset_days;
      o.checklists = n.checklists.filter(c => c.items.some(i => i.text.trim()) || String(c.name || '').trim())
        .map(c => ({ name: String(c.name || 'Checklist').trim(), items: c.items.filter(i => i.text.trim()).map(i => ({ text: i.text.trim() })) }));
      if (!o.checklists.length) delete o.checklists;
      o.subtasks = n.subtasks.map(nodeOut);
      if (!o.subtasks.length) delete o.subtasks;
      return o;
    }
    const countNodes = (n) => 1 + n.subtasks.reduce((s, c) => s + countNodes(c), 0);
    function validateNodes(nodes, path, errs) {
      nodes.forEach((n, i) => {
        const where = (path ? path + ' › ' : '') + (n.title.trim() || 'Task ' + (i + 1));
        if (!n.title.trim()) errs.push(where + ': needs a title');
        [['due_offset_days', 'Due offset'], ['start_offset_days', 'Start offset']].forEach(([k, lbl]) => {
          const v = n[k];
          if (v !== null && v !== undefined && v !== '' && (isNaN(Number(v)) || Number(v) < -365 || Number(v) > 365)) errs.push(where + ': ' + lbl + ' must be between -365 and 365 days');
        });
        if (n.due_time && !/^\d{2}:\d{2}$/.test(n.due_time)) errs.push(where + ': due time must look like 14:30');
        validateNodes(n.subtasks, where, errs);
      });
      return errs;
    }

    function NodeEditor({ node, onChange, onRemove, onMove, depth, canAddChild, index, total }) {
      const [open, setOpen] = useState(depth === 0 && !node.title);
      const set = (patch) => onChange({ ...node, ...patch });
      const setChild = (k, child) => set({ subtasks: node.subtasks.map(c => c._k === k ? child : c) });
      const est = fmtMinutes(node.estimate_minutes) || '';
      return h`<div class="ta-node">
        <div class="ta-node-hd">
          <button type="button" class="ta-ibtn" aria-label=${open ? 'Collapse' : 'Expand'} aria-expanded=${open} onClick=${() => setOpen(o => !o)}>
            <i class=${'ti ' + (open ? 'ti-chevron-down' : 'ti-chevron-right')}></i></button>
          <i class=${'ti ' + ((TYPE_ALL[node.type] || {}).icon || 'ti-circle-check')} style=${{ color: 'var(--cu-t3)' }} aria-hidden="true"></i>
          <input class="ta-in sm bare" style=${{ flex: 1, fontWeight: 500 }} value=${node.title} maxLength=${160}
            placeholder=${depth ? 'Subtask name' : 'Task name'} aria-label=${depth ? 'Subtask name' : 'Task name'}
            onInput=${e => set({ title: e.target.value })}/>
          ${node.due_offset_days !== null && node.due_offset_days !== undefined && node.due_offset_days !== '' ? h`<span class="ta-chip" title="Due date offset from the start date you pick when applying"><i class="ti ti-calendar"></i>${(Number(node.due_offset_days) >= 0 ? '+' : '') + node.due_offset_days}d${node.due_time ? ' ' + node.due_time : ''}</span>` : null}
          ${node.subtasks.length ? h`<span class="ta-chip"><i class="ti ti-subtask"></i>${node.subtasks.length}</span>` : null}
          <button type="button" class="ta-ibtn" aria-label="Move up" disabled=${index === 0} onClick=${() => onMove(-1)}><i class="ti ti-arrow-up"></i></button>
          <button type="button" class="ta-ibtn" aria-label="Move down" disabled=${index === total - 1} onClick=${() => onMove(1)}><i class="ti ti-arrow-down"></i></button>
          ${onRemove ? h`<button type="button" class="ta-ibtn danger" aria-label=${'Remove ' + (node.title || 'task')} onClick=${onRemove}><i class="ti ti-trash"></i></button>` : null}
        </div>
        ${open ? h`<div class="ta-node-b">
          <div class="ta-props">
            <label class="ta-f"><span class="ta-lbl">Type</span>
              <select class="ta-in sm" value=${node.type} aria-label="Task type" onChange=${e => set({ type: e.target.value })}>
                ${TPL_TYPES.map(k => h`<option key=${k} value=${k}>${(TYPE_ALL[k] || {}).label || k}</option>`)}
              </select></label>
            <label class="ta-f"><span class="ta-lbl">Priority</span>
              <select class="ta-in sm" value=${node.priority == null ? '' : String(node.priority)} aria-label="Priority" onChange=${e => set({ priority: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">None</option><option value="1">Urgent</option><option value="2">High</option><option value="3">Normal</option><option value="4">Low</option>
              </select></label>
            <label class="ta-f"><span class="ta-lbl">Due (days)</span>
              <input class="ta-in sm" type="number" min="-365" max="365" value=${node.due_offset_days == null ? '' : node.due_offset_days} placeholder="e.g. 3" aria-label="Due offset in days"
                onInput=${e => set({ due_offset_days: e.target.value === '' ? null : toInt(e.target.value, null) })}/></label>
            <label class="ta-f"><span class="ta-lbl">Due time</span>
              <input class="ta-in sm" type="time" value=${node.due_time || ''} aria-label="Due time" disabled=${node.due_offset_days == null}
                onInput=${e => set({ due_time: e.target.value })}/></label>
            <label class="ta-f"><span class="ta-lbl">Start (days)</span>
              <input class="ta-in sm" type="number" min="-365" max="365" value=${node.start_offset_days == null ? '' : node.start_offset_days} placeholder="e.g. 0" aria-label="Start offset in days"
                onInput=${e => set({ start_offset_days: e.target.value === '' ? null : toInt(e.target.value, null) })}/></label>
            <label class="ta-f"><span class="ta-lbl">Estimate</span>
              <input class="ta-in sm" defaultValue=${est} placeholder="2h 30m" aria-label="Time estimate"
                onBlur=${e => set({ estimate_minutes: parseMinutes(e.target.value) })}/></label>
          </div>
          <label class="ta-f"><span class="ta-lbl">Description</span>
            <textarea class="ta-ta" style=${{ minHeight: 54 }} value=${node.description} placeholder="What needs doing (optional)" aria-label="Description"
              onInput=${e => set({ description: e.target.value })}></textarea></label>
          <div class="ta-f">
            <span class="ta-lbl">Checklists</span>
            ${node.checklists.map((c, ci) => h`<div key=${c._k} class="ta-rows" style=${{ marginBottom: 6 }}>
              <div class="ta-li">
                <i class="ti ti-list-check" style=${{ color: 'var(--cu-t3)' }} aria-hidden="true"></i>
                <input class="ta-in sm bare" style=${{ flex: 1, fontWeight: 500 }} value=${c.name} maxLength=${60} aria-label="Checklist name"
                  onInput=${e => { const v = e.target.value; set({ checklists: node.checklists.map((x, i) => i === ci ? { ...x, name: v } : x) }); }}/>
                <button type="button" class="ta-ibtn danger" aria-label=${'Remove checklist ' + c.name} onClick=${() => set({ checklists: node.checklists.filter((_, i) => i !== ci) })}><i class="ti ti-trash"></i></button>
              </div>
              ${c.items.map((it, ii) => h`<div key=${it._k} class="ta-li">
                <span style=${{ width: 14 }}></span>
                <i class="ti ti-square" style=${{ color: 'var(--cu-t3)', fontSize: 14 }} aria-hidden="true"></i>
                <input class="ta-in sm bare" style=${{ flex: 1 }} value=${it.text} maxLength=${160} placeholder="Checklist item" aria-label="Checklist item"
                  onInput=${e => { const v = e.target.value; set({ checklists: node.checklists.map((x, i) => i === ci ? { ...x, items: x.items.map((y, j) => j === ii ? { ...y, text: v } : y) } : x) }); }}/>
                <button type="button" class="ta-ibtn danger" aria-label="Remove item" onClick=${() => set({ checklists: node.checklists.map((x, i) => i === ci ? { ...x, items: x.items.filter((_, j) => j !== ii) } : x) })}><i class="ti ti-x"></i></button>
              </div>`)}
              <div class="ta-add"><i class="ti ti-plus" aria-hidden="true"></i>
                <button type="button" class="ta-btn sm" onClick=${() => set({ checklists: node.checklists.map((x, i) => i === ci ? { ...x, items: x.items.concat({ _k: uid(), text: '' }) } : x) })}>Add item</button></div>
            </div>`)}
            <div><button type="button" class="ta-btn sm" onClick=${() => set({ checklists: node.checklists.concat({ _k: uid(), name: 'Checklist', items: [{ _k: uid(), text: '' }] }) })}><i class="ti ti-plus"></i>Add checklist</button></div>
          </div>
          ${node.subtasks.length ? h`<div>${node.subtasks.map((c, i) => h`<${NodeEditor} key=${c._k} node=${c} depth=${depth + 1} index=${i} total=${node.subtasks.length}
            canAddChild=${depth + 1 < 3} onChange=${nc => setChild(c._k, nc)} onRemove=${() => set({ subtasks: node.subtasks.filter(x => x._k !== c._k) })}
            onMove=${dir => { const next = node.subtasks.slice(); const j = i + dir; if (j < 0 || j >= next.length) return; const [x] = next.splice(i, 1); next.splice(j, 0, x); set({ subtasks: next }); }}/>`)}</div>` : null}
          ${canAddChild ? h`<div><button type="button" class="ta-btn sm" onClick=${() => { setOpen(true); set({ subtasks: node.subtasks.concat(nodeIn({ title: '' })) }); }}><i class="ti ti-subtask"></i>Add subtask</button></div>` : null}
        </div>` : null}
      </div>`;
    }

    function TreePreview({ nodes }) {
      const li = (n, i) => h`<li key=${n._k || i}>
        <i class=${'ti ' + ((TYPE_ALL[n.type] || {}).icon || 'ti-circle-check')} style=${{ color: 'var(--cu-t3)', fontSize: 14, marginRight: 6 }} aria-hidden="true"></i>
        <b style=${{ fontWeight: 500 }}>${n.title || 'Untitled'}</b>
        <span class="ta-pv-meta">${[
          n.due_offset_days != null && n.due_offset_days !== '' ? 'due ' + (Number(n.due_offset_days) >= 0 ? 'day +' + n.due_offset_days : n.due_offset_days + 'd') + (n.due_time ? ' at ' + n.due_time : '') : '',
          n.priority ? ['', 'Urgent', 'High', 'Normal', 'Low'][n.priority] : '',
          n.estimate_minutes ? fmtMinutes(n.estimate_minutes) : '',
          n.checklists && n.checklists.length ? n.checklists.length + ' checklist' + (n.checklists.length === 1 ? '' : 's') : '',
        ].filter(Boolean).join(' · ')}</span>
        ${arr(n.subtasks).length ? h`<ul>${n.subtasks.map(li)}</ul>` : null}
      </li>`;
      return h`<div class="ta-tree-pv"><ul>${nodes.map(li)}</ul></div>`;
    }

    function TemplateEditor({ template, onClose, onSaved, showToast }) {
      const editing = !!(template && template.id);
      const [loading, setLoading] = useState(editing);
      const [loadErr, setLoadErr] = useState(null);
      const [name, setName] = useState((template && template.name) || '');
      const [description, setDescription] = useState((template && template.description) || '');
      const [kind, setKind] = useState((template && template.kind) || 'task');
      const [nodes, setNodes] = useState([nodeIn({ title: '' })]);
      const [extra, setExtra] = useState({});
      const [tab, setTab] = useState('edit');
      const [busy, setBusy] = useState(false);
      const [errs, setErrs] = useState([]);

      useEffect(() => {
        if (!editing) return;
        let alive = true;
        (async () => {
          try {
            const full = await rpcCall('template_get', { p_id: template.id });
            if (!alive) return;
            const p = (full && full.payload) || {};
            const { task, tasks, ...rest } = p;
            setExtra(rest);
            setKind((full && full.kind) || 'task');
            setName((full && full.name) || '');
            setDescription((full && full.description) || '');
            const list = Array.isArray(tasks) ? tasks : task ? [task] : [];
            setNodes(list.length ? list.map(nodeIn) : [nodeIn({ title: '' })]);
          } catch (e) { if (alive) setLoadErr(e); }
          if (alive) setLoading(false);
        })();
        return () => { alive = false; };
      }, [editing, template && template.id]);

      const save = async () => {
        const nm = name.trim();
        const problems = [];
        if (!nm) problems.push('The template needs a name');
        validateNodes(nodes, '', problems);
        if (problems.length) { setErrs(problems); setTab('edit'); return; }
        setErrs([]); setBusy(true);
        try {
          const out = nodes.map(nodeOut);
          const payload = kind === 'task' ? { ...extra, task: out[0] } : { ...extra, tasks: out };
          await rpcCall('template_upsert', { p_data: { id: editing ? template.id : undefined, name: nm, description: description.trim() || null, kind, payload } });
          showToast(editing ? 'Template saved ✓' : 'Template "' + nm + '" created');
          await onSaved();
          onClose();
        } catch (e) { setErrs([errText(e)]); setBusy(false); }
      };
      const total = nodes.reduce((s, n) => s + countNodes(n), 0);

      return h`<${Modal} large=${true} title=${editing ? 'Edit template' : 'New template'} onClose=${onClose} busy=${busy}
        footer=${h`<${Fragment}>
          <span class="ta-hint">${total} task${total === 1 ? '' : 's'} in this template</span>
          <span class="ta-sp"></span>
          <button type="button" class="ta-btn" disabled=${busy} onClick=${onClose}>Cancel</button>
          <button type="button" class="ta-btn pri" disabled=${busy || loading} onClick=${save}>${busy ? h`<${Spin}/>` : null}${editing ? 'Save template' : 'Create template'}</button>
        <//>`}>
        ${loadErr ? h`<${LoadError} error=${loadErr}/>` : null}
        ${loading ? h`<${Loading} rows=${5}/>` : h`<${Fragment}>
          ${errs.length ? h`<${Note} tone="bad">${errs.length === 1 ? errs[0] : h`<ul style=${{ margin: 0, paddingLeft: 18 }}>${errs.map((e, i) => h`<li key=${i}>${e}</li>`)}</ul>`}<//>` : null}
          <div class="ta-grid" style=${{ marginBottom: 12 }}>
            <label class="ta-f"><span class="ta-lbl">Template name</span>
              <input class="ta-in" value=${name} data-autofocus=${true} maxLength=${80} placeholder="e.g. New client onboarding" aria-label="Template name" onInput=${e => setName(e.target.value)}/></label>
            <label class="ta-f"><span class="ta-lbl">Kind</span>
              <select class="ta-in" value=${kind} aria-label="Template kind" onChange=${e => { const k = e.target.value; setKind(k); if (k === 'task' && nodes.length > 1) setNodes(nodes.slice(0, 1)); }}>
                <option value="task">One task (with subtasks)</option>
                <option value="list_kit">List kit (several tasks)</option>
              </select>
              <span class="ta-hint">${kind === 'task' ? 'Applying it creates one task — or merges its subtasks and checklists into an existing task.' : 'Applying it creates every task below in the list you pick.'}</span></label>
          </div>
          <label class="ta-f" style=${{ marginBottom: 12 }}><span class="ta-lbl">Description (optional)</span>
            <input class="ta-in" value=${description} maxLength=${200} placeholder="When should the team use this?" aria-label="Template description" onInput=${e => setDescription(e.target.value)}/></label>
          <div class="ta-row" style=${{ marginBottom: 6 }}>
            <div class="ta-seg" role="group" aria-label="Editor mode">
              <button type="button" class=${tab === 'edit' ? 'on' : ''} aria-pressed=${tab === 'edit'} onClick=${() => setTab('edit')}>Edit</button>
              <button type="button" class=${tab === 'preview' ? 'on' : ''} aria-pressed=${tab === 'preview'} onClick=${() => setTab('preview')}>Preview</button>
            </div>
            <span class="ta-sp"></span>
            <span class="ta-hint">Day offsets are counted from the start date chosen when the template is applied.</span>
          </div>
          ${tab === 'preview' ? h`<${TreePreview} nodes=${nodes}/>` : h`<div>
            ${nodes.map((n, i) => h`<${NodeEditor} key=${n._k} node=${n} depth=${0} index=${i} total=${nodes.length} canAddChild=${true}
              onChange=${nn => setNodes(nodes.map(x => x._k === n._k ? nn : x))}
              onRemove=${nodes.length > 1 ? () => setNodes(nodes.filter(x => x._k !== n._k)) : null}
              onMove=${dir => { const next = nodes.slice(); const j = i + dir; if (j < 0 || j >= next.length) return; const [x] = next.splice(i, 1); next.splice(j, 0, x); setNodes(next); }}/>`)}
            ${kind === 'list_kit' ? h`<button type="button" class="ta-btn" style=${{ marginTop: 10 }} onClick=${() => setNodes(nodes.concat(nodeIn({ title: '' })))}><i class="ti ti-plus"></i>Add task</button>` : null}
          </div>`}
        <//>`}
      <//>`;
    }

    function TemplateApply({ template, meta, onClose, onApplied, showToast }) {
      const [listId, setListId] = useState('');
      const [base, setBase] = useState(() => new Date().toISOString().slice(0, 10));
      const [prefix, setPrefix] = useState('');
      const [assignees, setAssignees] = useState([]);
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState('');
      const opts = useMemo(() => listOptions(meta, l => l.kind !== 'content'), [meta.lists, meta.clients]);
      useEffect(() => { if (!listId && opts.length && opts[0].lists.length) setListId(opts[0].lists[0].id); }, [opts]);
      const go = async () => {
        if (!listId) { setErr('Pick a list first'); return; }
        setBusy(true); setErr('');
        try {
          const list = meta.lists.find(l => l.id === listId) || {};
          const res = await rpcCall('template_apply', { p_id: template.id, p_target: { list_id: listId, client_id: list.client_id || null, base_date: base, assignee_ids: assignees, title_prefix: prefix.trim() || null } });
          const created = arr(res && res.created);
          created.forEach(row => taskBus.emit('task:created', { row }));
          showToast(created.length ? 'Created ' + created.length + ' task' + (created.length === 1 ? '' : 's') + ' ✓' : 'Nothing to create');
          onApplied && onApplied();
          onClose();
          if (created.length === 1) openTask(created[0].id);
        } catch (e) { setErr(errText(e)); setBusy(false); }
      };
      return h`<${Modal} title=${'Apply "' + template.name + '"'} onClose=${onClose} busy=${busy}
        footer=${h`<${Fragment}>
          ${err ? h`<span class="ta-err" style=${{ flex: '1 1 100%' }} role="alert">${err}</span>` : null}
          <span class="ta-sp"></span>
          <button type="button" class="ta-btn" disabled=${busy} onClick=${onClose}>Cancel</button>
          <button type="button" class="ta-btn pri" disabled=${busy || !listId} onClick=${go}>${busy ? h`<${Spin}/>` : h`<i class="ti ti-wand"></i>`}Create tasks</button>
        <//>`}>
        <div class="ta-grid">
          <label class="ta-f"><span class="ta-lbl">Create in</span>
            <select class="ta-in" value=${listId} data-autofocus=${true} aria-label="Target list" onChange=${e => setListId(e.target.value)}>
              ${opts.map(g => h`<optgroup key=${g.group} label=${g.group}>${g.lists.map(l => h`<option key=${l.id} value=${l.id}>${l.name}</option>`)}</optgroup>`)}
            </select></label>
          <label class="ta-f"><span class="ta-lbl">Day 0 (dates are counted from here)</span>
            <input class="ta-in" type="date" value=${base} aria-label="Base date" onInput=${e => setBase(e.target.value)}/></label>
        </div>
        <label class="ta-f" style=${{ marginTop: 12 }}><span class="ta-lbl">Add before every task name (optional)</span>
          <input class="ta-in" value=${prefix} maxLength=${40} placeholder="e.g. [Acme] " aria-label="Title prefix" onInput=${e => setPrefix(e.target.value)}/></label>
        <div class="ta-f" style=${{ marginTop: 12 }}>
          <span class="ta-lbl">Assign to (optional — replaces the template's own assignees)</span>
          <div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
            ${meta.members.filter(m => m.role_level !== 'client').map(m => {
              const on = assignees.includes(m.id);
              return h`<button key=${m.id} type="button" class=${'ta-btn sm' + (on ? ' pri' : '')} aria-pressed=${on}
                onClick=${() => setAssignees(a => on ? a.filter(x => x !== m.id) : a.concat(m.id))}>${on ? h`<i class="ti ti-check"></i>` : null}${m.name}</button>`;
            })}
          </div>
        </div>
      <//>`;
    }

    function TemplatesSection({ user, showToast }) {
      const meta = useMeta();
      const canEdit = isManagerRole(role(user));
      const toast = (m) => showToast && showToast(m);
      const [q, setQ] = useState('');
      const [kind, setKind] = useState('all');
      const [edit, setEdit] = useState(null);
      const [apply, setApply] = useState(null);
      const [preview, setPreview] = useState(null);
      const [del, setDel] = useState(null);
      const list = useAsync(() => rpcCall('template_list'), []);
      const rows = arr(list.data);

      const openPreview = async (t) => {
        setPreview({ t, nodes: null, error: null });
        try {
          const full = await rpcCall('template_get', { p_id: t.id });
          const p = (full && full.payload) || {};
          const nodes = Array.isArray(p.tasks) ? p.tasks : p.task ? [p.task] : [];
          setPreview({ t, nodes: nodes.map(nodeIn), error: null });
        } catch (e) { setPreview({ t, nodes: null, error: e }); }
      };
      const duplicate = async (t) => {
        try {
          const full = await rpcCall('template_get', { p_id: t.id });
          await rpcCall('template_upsert', { p_data: { name: (full.name || t.name) + ' (copy)', description: full.description || null, kind: full.kind || 'task', payload: full.payload || {} } });
          await list.reload();
          toast('Template duplicated ✓');
        } catch (e) { toast(errText(e)); }
      };
      const doDelete = async () => { await rpcCall('template_delete', { p_id: del.id }); await list.reload(); toast('Template deleted'); };

      const s = q.trim().toLowerCase();
      const shown = rows.filter(t => (kind === 'all' || t.kind === kind) && (!s || String(t.name).toLowerCase().includes(s) || String(t.description || '').toLowerCase().includes(s)));

      if (list.missing) return h`<div class="ta-root">
        <${Head} icon="ti-template" title="Task templates" sub="Reusable task structures — onboarding kits, shoot plans, monthly routines."/>
        <${NeedsMigration} what="The Template Center" mig="093"/>
      </div>`;

      return h`<div class="ta-root">
        <${Head} icon="ti-template" title="Task templates"
          sub="Save a piece of work once — its subtasks, checklists and day offsets — then recreate it in any list in two clicks. Anyone can also save a task as a template from the task menu."
          right=${canEdit ? h`<button type="button" class="ta-btn pri" onClick=${() => setEdit({})}><i class="ti ti-plus"></i>New template</button>` : null}/>
        ${!canEdit ? h`<${Note}>Only admins and managers can create or edit templates — you can still apply them.<//>` : null}
        ${list.error && !list.missing ? h`<${LoadError} error=${list.error} onRetry=${list.reload}/>` : null}
        <${Card} title=${rows.length + ' template' + (rows.length === 1 ? '' : 's')}
          right=${h`<div class="ta-row" style=${{ gap: 6 }}>
            <input class="ta-in sm" style=${{ width: 180 }} type="search" placeholder="Search templates" aria-label="Search templates" value=${q} onInput=${e => setQ(e.target.value)}/>
            <div class="ta-seg" role="group" aria-label="Filter by kind">
              <button type="button" class=${kind === 'all' ? 'on' : ''} aria-pressed=${kind === 'all'} onClick=${() => setKind('all')}>All</button>
              <button type="button" class=${kind === 'task' ? 'on' : ''} aria-pressed=${kind === 'task'} onClick=${() => setKind('task')}>Task</button>
              <button type="button" class=${kind === 'list_kit' ? 'on' : ''} aria-pressed=${kind === 'list_kit'} onClick=${() => setKind('list_kit')}>List kit</button>
            </div>
            <button type="button" class="ta-ibtn" aria-label="Refresh templates" onClick=${list.reload}><i class="ti ti-refresh"></i></button>
          </div>`}>
          ${list.loading && !rows.length ? h`<${Loading} rows=${4}/>`
            : !rows.length ? h`<${Empty} icon="ti-template" title="No templates yet"
                sub="Build one here, or open any task → menu → Save as template. Great for client onboarding, monthly reporting or a shoot checklist."
                action=${canEdit ? h`<button type="button" class="ta-btn pri" style=${{ marginTop: 10 }} onClick=${() => setEdit({})}><i class="ti ti-plus"></i>New template</button>` : null}/>`
            : !shown.length ? h`<${Empty} icon="ti-search" title="No matches" sub=${'Nothing matches "' + q + '".'}/>`
            : h`<div class="ta-rows">${shown.map(t => h`<div key=${t.id} class="ta-li" style=${{ minHeight: 48 }}>
              <i class=${'ti ' + (t.kind === 'list_kit' ? 'ti-checklist' : 'ti-file-text')} style=${{ color: 'var(--cu-t3)', fontSize: 16 }} aria-hidden="true"></i>
              <div style=${{ flex: 1, minWidth: 0 }}>
                <div class="ta-ellip" style=${{ fontWeight: 500 }}>${t.name}</div>
                <div class="ta-hint ta-ellip">${[t.description, (t.item_count || 0) + ' task' + (t.item_count === 1 ? '' : 's'), t.use_count ? 'used ' + t.use_count + '×' : 'never used', t.created_by_name ? 'by ' + t.created_by_name : '', t.updated_at ? fmtRelative(t.updated_at) : ''].filter(Boolean).join(' · ')}</div>
              </div>
              <button type="button" class="ta-btn sm" onClick=${() => openPreview(t)}><i class="ti ti-eye"></i><span class="ta-hide-sm">Preview</span></button>
              <button type="button" class="ta-btn sm pri" onClick=${() => setApply(t)}><i class="ti ti-wand"></i>Apply</button>
              ${canEdit ? h`<${Fragment}>
                <button type="button" class="ta-ibtn" aria-label=${'Edit ' + t.name} onClick=${() => setEdit(t)}><i class="ti ti-pencil"></i></button>
                <button type="button" class="ta-ibtn" aria-label=${'Duplicate ' + t.name} onClick=${() => duplicate(t)}><i class="ti ti-copy"></i></button>
                <button type="button" class="ta-ibtn danger" aria-label=${'Delete ' + t.name} onClick=${() => setDel(t)}><i class="ti ti-trash"></i></button>
              <//>` : null}
            </div>`)}</div>`}
        <//>
        ${edit ? h`<${TemplateEditor} template=${edit.id ? edit : null} showToast=${toast} onClose=${() => setEdit(null)} onSaved=${list.reload}/>` : null}
        ${apply ? h`<${TemplateApply} template=${apply} meta=${meta} showToast=${toast} onClose=${() => setApply(null)} onApplied=${list.reload}/>` : null}
        ${preview ? h`<${Modal} title=${'Preview — ' + preview.t.name} onClose=${() => setPreview(null)}
            footer=${h`<${Fragment}><span class="ta-sp"></span><button type="button" class="ta-btn" onClick=${() => setPreview(null)}>Close</button>
              <button type="button" class="ta-btn pri" onClick=${() => { const t = preview.t; setPreview(null); setApply(t); }}><i class="ti ti-wand"></i>Apply</button><//>`}>
          ${preview.error ? h`<${LoadError} error=${preview.error}/>` : !preview.nodes ? h`<${Loading} rows=${3}/>` : h`<${TreePreview} nodes=${preview.nodes}/>`}
        <//>` : null}
        ${del ? h`<${ConfirmDialog} title=${'Delete "' + del.name + '"?'} danger=${true} confirmLabel="Delete template" onClose=${() => setDel(null)} onConfirm=${doDelete}
            body=${'Tasks already created from it are not affected.'}/>` : null}
      </div>`;
    }

    Object.assign(ERR, {
      bad_prefix: 'Task ID prefix must be 1–6 letters or numbers',
      bad_work_days: 'Pick valid working days',
      bad_holidays: 'One of the holiday dates is invalid',
      bad_hours: 'Hours per day must be between 0 and 24',
      bad_kind: 'Pick a template kind',
      bad_event: 'Unknown notification type — refresh and try again',
      bad_channel: 'Unknown channel — refresh and try again',
      bad_prefs: "Those settings didn't look right — refresh and try again",
      prefs_too_large: 'Too many preferences stored — remove a few and try again',
    });

    // =========================================================================
    // Work schedule & ClickApps — org_task_settings_get / _set (admin writes)
    // =========================================================================
    const WORK_DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
    const FEATURE_GROUPS = [
      { title: 'Task features', keys: [
        ['subtasks', 'Subtasks', 'Break a task into smaller tasks'],
        ['checklists', 'Checklists', 'Tick-box lists inside a task'],
        ['multiple_assignees', 'Multiple assignees', 'More than one person on a task'],
        ['priorities', 'Priorities', 'Urgent / High / Normal / Low flags'],
        ['tags', 'Tags', 'Workspace labels for filtering'],
        ['custom_fields', 'Custom fields', 'Your own columns on tasks'],
        ['time_tracking', 'Time tracking', 'Timers and manual time entries'],
        ['dependencies', 'Dependencies', 'Blocking / waiting-on links between tasks'],
        ['incomplete_warning', 'Incomplete warning', 'Warn before closing a task with open subtasks'],
        ['reschedule_dependencies', 'Reschedule dependents', 'Offer to shift blocked tasks when a due date moves'],
        ['recurring', 'Recurring tasks', 'Tasks that come back on a schedule'],
        ['templates', 'Templates', 'Save and apply task templates'],
        ['lineup', 'Up next', 'A personal ordered queue of tasks'],
      ] },
      { title: 'Workspace apps', keys: [
        ['automations', 'Automations', 'Rules that act when something changes'],
        ['docs', 'Docs & wiki', 'Documents, SOPs and meeting notes'],
        ['forms', 'Forms', 'Public intake forms that create tasks'],
        ['whiteboards', 'Whiteboards', 'Infinite canvas for planning'],
        ['goals', 'Goals', 'Targets with progress tracking'],
        ['timesheets', 'Timesheets', 'Weekly time submission and approvals'],
        ['clips', 'Clips', 'Screen and voice recordings'],
      ] },
    ];
    function WorkScheduleSection({ user, showToast }) {
      const isAdmin = role(user) === 'admin';
      const toast = (m) => showToast && showToast(m);
      const load = useAsync(() => rpcCall('org_task_settings_get'), []);
      const [form, setForm] = useState(null);
      const [saving, setSaving] = useState(false);
      const [err, setErr] = useState('');
      const [holiday, setHoliday] = useState('');
      const fill = useCallback((d) => {
        const x = d || {};
        setForm({
          task_prefix: x.task_prefix || 'T',
          work_days: arr(x.work_days).length ? arr(x.work_days).map(Number) : [1, 2, 3, 4, 5, 6],
          work_hours_per_day: Number(x.work_hours_per_day) || 8,
          holidays: arr(x.holidays).map(String).sort(),
          features: { ...(x.features || {}) },
        });
      }, []);
      useEffect(() => { if (load.data) fill(load.data); }, [load.data, fill]);

      if (load.missing) return h`<div class="ta-root">
        <${Head} icon="ti-calendar-cog" title="Work schedule & ClickApps" sub="Working days, hours and which task features are switched on."/>
        <${NeedsMigration} what="Work schedule & ClickApps" mig="093"/>
      </div>`;

      const dirty = !!form && !!load.data && JSON.stringify(form) !== JSON.stringify({
        task_prefix: load.data.task_prefix || 'T',
        work_days: arr(load.data.work_days).length ? arr(load.data.work_days).map(Number) : [1, 2, 3, 4, 5, 6],
        work_hours_per_day: Number(load.data.work_hours_per_day) || 8,
        holidays: arr(load.data.holidays).map(String).sort(),
        features: { ...(load.data.features || {}) },
      });
      const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
      const setFeature = (k, v) => setForm(f => ({ ...f, features: { ...f.features, [k]: v } }));
      const addHoliday = () => {
        if (!holiday) return;
        setForm(f => ({ ...f, holidays: Array.from(new Set(f.holidays.concat(holiday))).sort() }));
        setHoliday('');
      };
      const save = async () => {
        const prefix = String(form.task_prefix || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{1,6}$/.test(prefix)) { setErr(ERR.bad_prefix); return; }
        if (!form.work_days.length) { setErr('Pick at least one working day'); return; }
        const hrs = Number(form.work_hours_per_day);
        if (!(hrs > 0 && hrs <= 24)) { setErr(ERR.bad_hours); return; }
        setSaving(true); setErr('');
        try {
          const res = await rpcCall('org_task_settings_set', { p_patch: { task_prefix: prefix, work_days: form.work_days.slice().sort(), work_hours_per_day: hrs, holidays: form.holidays, features: form.features } });
          load.setData(res); fill(res);
          taskBus.emit('meta:changed');
          toast('Workspace settings saved ✓');
        } catch (e) { setErr(errText(e)); }
        setSaving(false);
      };

      return h`<div class="ta-root">
        <${Head} icon="ti-calendar-cog" title="Work schedule & ClickApps"
          sub="How the workspace counts working time — used by workload capacity, recurring tasks that skip non-working days, and Gantt planning — plus which task features your team sees."/>
        ${!isAdmin ? h`<${Note}>Only an admin can change these. Everything below is read-only for you.<//>` : null}
        ${load.error && !load.data ? h`<${LoadError} error=${load.error} onRetry=${load.reload}/>` : null}
        ${!form ? (load.error ? null : h`<${Card}><${Loading} rows=${5}/><//>`) : h`<${Fragment}>
          ${err ? h`<${Note} tone="bad">${err}<//>` : null}
          <${Card} title="Schedule">
            <div class="ta-grid">
              <label class="ta-f"><span class="ta-lbl">Task ID prefix</span>
                <input class="ta-in mono" style=${{ maxWidth: 140 }} value=${form.task_prefix} maxLength=${6} disabled=${!isAdmin} aria-label="Task ID prefix"
                  onInput=${e => set('task_prefix', e.target.value.toUpperCase())}/>
                <span class="ta-hint">Tasks are numbered ${(form.task_prefix || 'T') + '-1042'}. Changing it renumbers labels everywhere, not the tasks themselves.</span></label>
              <label class="ta-f"><span class="ta-lbl">Hours in a working day</span>
                <input class="ta-in" style=${{ maxWidth: 140 }} type="number" min="0.5" max="24" step="0.5" value=${form.work_hours_per_day} disabled=${!isAdmin} aria-label="Work hours per day"
                  onInput=${e => set('work_hours_per_day', e.target.value === '' ? '' : Number(e.target.value))}/>
                <span class="ta-hint">Capacity in the Workload view and hour estimates use this.</span></label>
            </div>
            <div class="ta-f" style=${{ marginTop: 14 }}>
              <span class="ta-lbl">Working days</span>
              <div class="ta-days" role="group" aria-label="Working days">
                ${WORK_DAYS.map(([n, lbl]) => { const on = form.work_days.includes(n); return h`<button key=${n} type="button" class=${'ta-day' + (on ? ' on' : '')} aria-pressed=${on} disabled=${!isAdmin}
                  onClick=${() => set('work_days', on ? form.work_days.filter(x => x !== n) : form.work_days.concat(n))}>${lbl}</button>`; })}
              </div>
              <span class="ta-hint">Recurring tasks set to skip non-working days move to the next working day.</span>
            </div>
            <div class="ta-f" style=${{ marginTop: 14 }}>
              <span class="ta-lbl">Holidays</span>
              ${isAdmin ? h`<div class="ta-row" style=${{ gap: 6 }}>
                <input class="ta-in" style=${{ width: 180 }} type="date" value=${holiday} aria-label="Holiday date" onInput=${e => setHoliday(e.target.value)}/>
                <button type="button" class="ta-btn sm" disabled=${!holiday} onClick=${addHoliday}><i class="ti ti-plus"></i>Add holiday</button>
              </div>` : null}
              ${form.holidays.length ? h`<div class="ta-row" style=${{ gap: 6, marginTop: 8 }}>
                ${form.holidays.map(d => h`<span key=${d} class="ta-chip">${fmtDate(d)}
                  ${isAdmin ? h`<button type="button" class="ta-ibtn" style=${{ width: 18, height: 18, fontSize: 12 }} aria-label=${'Remove ' + fmtDate(d)}
                    onClick=${() => set('holidays', form.holidays.filter(x => x !== d))}><i class="ti ti-x"></i></button>` : null}
                </span>`)}
              </div>` : h`<span class="ta-hint">No holidays added yet.</span>`}
            </div>
          <//>
          <${Card} title="ClickApps" sub="Switch off what your team doesn't use — those controls disappear from tasks and menus.">
            ${FEATURE_GROUPS.map(g => h`<div key=${g.title}>
              <div class="ta-grp">${g.title}</div>
              <div class="ta-feat">
                ${g.keys.map(([k, label, desc]) => h`<div key=${k} class="ta-srow">
                  <div style=${{ minWidth: 0 }}><div class="ta-srow-t">${label}</div><div class="ta-srow-s">${desc}</div></div>
                  <${Toggle} on=${form.features[k] !== false} label=${label} disabled=${!isAdmin} onChange=${v => setFeature(k, v)}/>
                </div>`)}
              </div>
            </div>`)}
          <//>
          ${isAdmin ? h`<div class="ta-row" style=${{ marginBottom: 20 }}>
            <button type="button" class="ta-btn pri" disabled=${saving || !dirty} onClick=${save}>${saving ? h`<${Spin}/>` : h`<i class="ti ti-check"></i>`}Save changes</button>
            <button type="button" class="ta-btn ghost" disabled=${saving || !dirty} onClick=${() => { fill(load.data); setErr(''); }}>Reset</button>
            ${dirty ? h`<span class="ta-hint">Unsaved changes</span>` : null}
          </div>` : null}
        <//>`}
      </div>`;
    }

    // =========================================================================
    // Notification preferences — notif_prefs_get / _set (every staff member)
    // =========================================================================
    const NOTIF_EVENTS = [
      ['assigned', 'Assigned to me', 'A task or post is assigned to you'],
      ['mentioned', '@mentions', 'Someone mentions you in a comment or chat'],
      ['comment', 'Comments', 'New comments on tasks you are on or watching'],
      ['status', 'Status changes', 'A task you are on or watching moves to another status'],
      ['due_soon', 'Due soon', 'Upcoming due dates — this also drives the WhatsApp reminder before a task is due'],
      ['overdue', 'Overdue', 'A task of yours has passed its due date'],
      ['reminder', 'My reminders', 'Reminders you set on a task'],
      ['approval', 'Client approvals', 'A brand approves a post or asks for changes'],
      ['message', 'Chat messages', 'Direct messages and group chat'],
      ['completed', 'Completed', 'A task you delegated is finished'],
    ];
    const CHANNELS = [['inbox', 'Inbox', 'ti-inbox'], ['push', 'Push', 'ti-bell'], ['whatsapp', 'WhatsApp', 'ti-brand-whatsapp'], ['email', 'Email', 'ti-mail']];
    function NotificationPrefsSection({ user, showToast }) {
      const meta = useMeta();
      const toast = (m) => showToast && showToast(m);
      const load = useAsync(() => rpcCall('notif_prefs_get'), []);
      const [prefs, setPrefs] = useState(null);
      const [state, setState] = useState('');          // '' | 'saving' | 'saved' | 'error'
      const timer = useRef(null);
      const [dnd, setDnd] = useState(undefined);       // undefined = use store value
      const [dndBusy, setDndBusy] = useState(false);
      useEffect(() => { if (load.data) setPrefs(load.data); }, [load.data]);
      useEffect(() => () => clearTimeout(timer.current), []);

      const push = (next) => {
        setPrefs(next);
        setState('saving');
        clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
          try {
            const res = await rpcCall('notif_prefs_set', { p_prefs: { events: next.events, smart_push: next.smart_push !== false } });
            setPrefs(res); load.setData(res); setState('saved');
            setTimeout(() => setState(s => (s === 'saved' ? '' : s)), 2000);
          } catch (e) { setState('error'); toast(errText(e)); if (load.data) setPrefs(load.data); }
        }, 600);
      };
      const cell = (ev, ch) => !!(prefs && prefs.events && prefs.events[ev] && prefs.events[ev][ch]);
      const toggleCell = (ev, ch, v) => push({ ...prefs, events: { ...prefs.events, [ev]: { ...(prefs.events[ev] || {}), [ch]: v } } });
      const toggleColumn = (ch) => {
        const allOn = NOTIF_EVENTS.every(([ev]) => cell(ev, ch));
        const events = { ...prefs.events };
        NOTIF_EVENTS.forEach(([ev]) => { events[ev] = { ...(events[ev] || {}), [ch]: !allOn }; });
        push({ ...prefs, events });
      };
      const dndUntil = dnd !== undefined ? dnd : (meta.me && meta.me.presence && meta.me.presence.dnd_until) || null;
      const setDndFor = async (iso) => {
        setDndBusy(true);
        try {
          const p = (meta.me && meta.me.presence) || {};
          if (TaskAPI && TaskAPI.statusSet) await TaskAPI.statusSet(p.text || null, p.emoji || null, iso);
          else await rpcCall('member_status_set', { p_text: p.text || null, p_emoji: p.emoji || null, p_dnd_until: iso });
          setDnd(iso);
          toast(iso ? 'Do not disturb on until ' + fmtStamp(iso) : 'Do not disturb off');
          meta.reload();
        } catch (e) { toast(errText(e)); }
        setDndBusy(false);
      };
      const inHours = (n) => new Date(Date.now() + n * 3600000).toISOString();
      const tomorrow9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString(); };

      if (load.missing) return h`<div class="ta-root">
        <${Head} icon="ti-bell-cog" title="Notification preferences" sub="Choose what reaches you, and where."/>
        <${NeedsMigration} what="Per-channel notification preferences" mig="094"/>
      </div>`;

      return h`<div class="ta-root">
        <${Head} icon="ti-bell-cog" title="Notification preferences"
          sub="Your own settings — nobody else is affected. Inbox is the bell inside the app, Push reaches this device, WhatsApp uses the number on your WhatsApp settings page, Email goes to your login address."
          right=${state ? h`<span class="ta-hint" role="status">${state === 'saving' ? h`<${Fragment}><${Spin}/> Saving…<//>` : state === 'saved' ? '✓ Saved' : 'Not saved'}</span>` : null}/>
        ${load.error && !prefs ? h`<${LoadError} error=${load.error} onRetry=${load.reload}/>` : null}
        ${!prefs ? (load.error ? null : h`<${Card}><${Loading} rows=${5}/><//>`) : h`<${Fragment}>
          <${Card} title="What you get, and where">
            <div class="ta-tbl-wrap"><table class="ta-tbl ta-mx">
              <thead><tr><th>Notify me about</th>
                ${CHANNELS.map(([ch, lbl, icon]) => h`<th key=${ch} class="c">
                  <button type="button" class="ta-btn ghost sm" style=${{ margin: '0 auto' }} title=${'Turn ' + lbl + ' on or off for everything'}
                    onClick=${() => toggleColumn(ch)}><i class=${'ti ' + icon}></i>${lbl}</button></th>`)}
              </tr></thead>
              <tbody>${NOTIF_EVENTS.map(([ev, label, desc]) => h`<tr key=${ev}>
                <td><div class="ta-srow-t">${label}</div><div class="ta-srow-s">${desc}</div></td>
                ${CHANNELS.map(([ch, lbl]) => h`<td key=${ch} class="c">
                  <${Check} on=${cell(ev, ch)} label=${label + ' — ' + lbl} onChange=${v => toggleCell(ev, ch, v)}/>
                </td>`)}
              </tr>`)}</tbody>
            </table></div>
            <div class="ta-srow" style=${{ marginTop: 6 }}>
              <div><div class="ta-srow-t">Skip push when I'm already here</div>
                <div class="ta-srow-s">No phone buzz for something you just saw on screen — the inbox still gets it.</div></div>
              <${Toggle} on=${prefs.smart_push !== false} label="Smart push" onChange=${v => push({ ...prefs, smart_push: v })}/>
            </div>
            <div class="ta-hint" style=${{ marginTop: 10 }}>
              WhatsApp also needs your number saved and reminders switched on —
              <button type="button" class="ta-btn ghost sm" onClick=${() => openSettingsSection('whatsapp')}><i class="ti ti-brand-whatsapp"></i>Open WhatsApp settings</button>
              Quiet hours set there stop WhatsApp messages overnight.
            </div>
          <//>
          <${Card} title="Do not disturb" sub="Pauses push and WhatsApp. Anything you miss waits in your inbox.">
            <div class="ta-row">
              ${dndUntil && new Date(dndUntil).getTime() > Date.now()
                ? h`<span class="ta-chip" style=${{ background: 'var(--cu-accent-fog)', color: 'var(--cu-accent-ink)' }}><i class="ti ti-moon"></i>On until ${fmtStamp(dndUntil)}</span>`
                : h`<span class="ta-hint">Currently off — notifications come through as normal.</span>`}
              <span class="ta-sp"></span>
              <button type="button" class="ta-btn sm" disabled=${dndBusy} onClick=${() => setDndFor(inHours(1))}>1 hour</button>
              <button type="button" class="ta-btn sm" disabled=${dndBusy} onClick=${() => setDndFor(inHours(4))}>4 hours</button>
              <button type="button" class="ta-btn sm" disabled=${dndBusy} onClick=${() => setDndFor(tomorrow9())}>Until 9 AM tomorrow</button>
              ${dndUntil && new Date(dndUntil).getTime() > Date.now() ? h`<button type="button" class="ta-btn sm" disabled=${dndBusy} onClick=${() => setDndFor(null)}>Turn off</button>` : null}
            </div>
          <//>
        <//>`}
      </div>`;
    }

    // =========================================================================
    // Deleted tasks — tasks_trash_list / task_restore (admin + manager)
    // =========================================================================
    function DeletedTasksSection({ user, showToast }) {
      const canRestore = isManagerRole(role(user));
      const toast = (m) => showToast && showToast(m);
      const load = useAsync(() => rpcCall('tasks_trash_list', { p_limit: 200 }), []);
      const [q, setQ] = useState('');
      const [sel, setSel] = useState([]);
      const [busy, setBusy] = useState('');
      const [restored, setRestored] = useState([]);
      const rows = arr(load.data).filter(r => !restored.some(x => x.id === r.id));

      const restore = async (row) => {
        setBusy(row.id);
        try {
          const back = await rpcCall('task_restore', { p_id: row.id });
          if (back) taskBus.emit('task:created', { row: back });
          setRestored(rs => rs.concat({ id: row.id, title: row.title }));
          setSel(s => s.filter(x => x !== row.id));
          toast('"' + row.title + '" restored ✓');
        } catch (e) { toast(errText(e)); }
        setBusy('');
      };
      const restoreSelected = async () => {
        const picked = rows.filter(r => sel.includes(r.id));
        setBusy('bulk');
        let ok = 0;
        for (const row of picked) {
          try { const back = await rpcCall('task_restore', { p_id: row.id }); if (back) taskBus.emit('task:created', { row: back }); setRestored(rs => rs.concat({ id: row.id, title: row.title })); ok++; }
          catch (e) { toast(errText(e)); break; }
        }
        setSel([]); setBusy('');
        if (ok) toast('Restored ' + ok + ' task' + (ok === 1 ? '' : 's') + ' ✓');
      };

      const s = q.trim().toLowerCase();
      const shown = rows.filter(r => !s || String(r.title || '').toLowerCase().includes(s) || String(r.custom_id || '').toLowerCase().includes(s) || String(r.client_name || '').toLowerCase().includes(s));

      if (load.missing) return h`<div class="ta-root">
        <${Head} icon="ti-trash-x" title="Deleted tasks" sub="Restore something removed by mistake."/>
        <${NeedsMigration} what="The task trash" mig="093"/>
      </div>`;
      if (!canRestore) return h`<div class="ta-root">
        <${Head} icon="ti-trash-x" title="Deleted tasks" sub="Restore something removed by mistake."/>
        <${Card}><${Empty} icon="ti-lock" title="Admins and managers only" sub="Ask one of them to restore a deleted task for you."/><//>
      </div>`;

      return h`<div class="ta-root">
        <${Head} icon="ti-trash-x" title="Deleted tasks"
          sub="Everything deleted in the last 60 days. Restoring brings the task back where it was, with its subtasks, comments and time — and puts posts back on the content calendar."
          right=${h`<button type="button" class="ta-btn" onClick=${load.reload}><i class="ti ti-refresh"></i>Refresh</button>`}/>
        ${load.error && !load.data ? h`<${LoadError} error=${load.error} onRetry=${load.reload}/>` : null}
        ${restored.length ? h`<${Note} icon="ti-check">Restored ${restored.length} task${restored.length === 1 ? '' : 's'} in this session
          ${restored.slice(-3).map(r => h`<button key=${r.id} type="button" class="ta-btn ghost sm" onClick=${() => openTask(r.id)}><i class="ti ti-external-link"></i>${r.title}</button>`)}<//>` : null}
        <${Card} title=${rows.length + ' deleted task' + (rows.length === 1 ? '' : 's')}
          right=${h`<div class="ta-row" style=${{ gap: 6 }}>
            ${sel.length ? h`<button type="button" class="ta-btn sm pri" disabled=${!!busy} onClick=${restoreSelected}>${busy === 'bulk' ? h`<${Spin}/>` : h`<i class="ti ti-arrow-back-up"></i>`}Restore ${sel.length}</button>` : null}
            <input class="ta-in sm" style=${{ width: 180 }} type="search" placeholder="Search deleted" aria-label="Search deleted tasks" value=${q} onInput=${e => setQ(e.target.value)}/>
          </div>`}>
          ${load.loading && !load.data ? h`<${Loading} rows=${4}/>`
            : !rows.length ? h`<${Empty} icon="ti-trash" title="Nothing in the trash" sub="Deleted tasks stay here for 60 days, then they're gone for good."/>`
            : !shown.length ? h`<${Empty} icon="ti-search" title="No matches" sub=${'Nothing matches "' + q + '".'}/>`
            : h`<div class="ta-rows">${shown.map(r => h`<div key=${r.id} class="ta-li">
              <${Check} on=${sel.includes(r.id)} label=${'Select ' + r.title} onChange=${v => setSel(x => v ? x.concat(r.id) : x.filter(y => y !== r.id))}/>
              <i class=${'ti ' + ((TYPE_ALL[r.type] || {}).icon || 'ti-circle-check')} style=${{ color: 'var(--cu-t3)', fontSize: 15 }} aria-hidden="true"></i>
              <div style=${{ flex: 1, minWidth: 0 }}>
                <div class="ta-ellip" style=${{ fontWeight: 500 }}>${r.title}</div>
                <div class="ta-hint ta-ellip">${[r.custom_id, r.client_name || 'Agency', 'deleted ' + fmtRelative(r.deleted_at), r.deleted_by_name ? 'by ' + r.deleted_by_name : ''].filter(Boolean).join(' · ')}</div>
              </div>
              <button type="button" class="ta-btn sm" disabled=${!!busy} onClick=${() => restore(r)}>${busy === r.id ? h`<${Spin}/>` : h`<i class="ti ti-arrow-back-up"></i>`}Restore</button>
            </div>`)}</div>`}
        <//>
      </div>`;
    }

    // =========================================================================
    // Registration — window.AMS_EXT.settingsSections (settings.js renders these)
    // =========================================================================
    const SECTIONS = [
      { id: 'notif-prefs', label: 'Notifications', icon: 'ti-bell-cog', order: 12, group: 'personal', roles: isStaffRole, Component: NotificationPrefsSection },
      { id: 'task-statuses', label: 'Statuses', icon: 'ti-circle-dot', order: 20, group: 'workspace', roles: isManagerRole, Component: StatusesSection },
      { id: 'task-tags', label: 'Tags', icon: 'ti-tags', order: 22, group: 'workspace', roles: isManagerRole, Component: TagsSection },
      { id: 'task-fields', label: 'Custom fields', icon: 'ti-forms', order: 24, group: 'workspace', roles: (r) => isManagerRole(r) || r === 'seo', Component: FieldsSection },
      { id: 'task-templates', label: 'Task templates', icon: 'ti-template', order: 26, group: 'workspace', roles: isManagerRole, Component: TemplatesSection },
      { id: 'work-schedule', label: 'Work schedule & apps', icon: 'ti-calendar-cog', order: 28, group: 'workspace', roles: isManagerRole, Component: WorkScheduleSection },
      { id: 'task-trash', label: 'Deleted tasks', icon: 'ti-trash-x', order: 30, group: 'workspace', roles: isManagerRole, Component: DeletedTasksSection },
    ];
    SECTIONS.forEach(s => reg('settingsSections', s));

    return {
      StatusesSection, TagsSection, FieldsSection, TemplatesSection, WorkScheduleSection,
      NotificationPrefsSection, DeletedTasksSection, TemplateEditor, TemplateApply, FieldEditor,
      SECTIONS,
    };
  }

  window.AMS_TASKADMIN = { buildTaskAdmin };
})();

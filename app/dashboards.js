/* ============================================================================
 * dashboards.js — Dashboards hub + analytics cards (ClickUp parity v2, WS F)
 *
 *   window.AMS_DASHBOARDS.buildDashboards(deps) →
 *     { DashboardsPage, DashboardCanvas, DashboardViewRenderer, DashAPI,
 *       CARDS, LineChart, Bars, Donut, Battery, useMetric }
 *
 * Dashboards: hub page (All / My / Shared / Private / Favorites), templates,
 * sharing (workspace / roles+people / private), per-dashboard filters
 * (client · assignee · date range), auto-refresh, TV mode, print, and a
 * `views` renderer so a saved view can be a dashboard.
 *
 * Analytics cards register into `AMS_EXT.cards`, so they work on Home and on
 * dashboards alike. Charts are hand-rolled SVG — theme-aware, keyboard and
 * screen-reader accessible (every chart has a summary + "Show data" table),
 * and readable down to 400px.
 *
 * Server: migrations/096_dashboards_goals_teams.sql.
 * Contract: docs/clickup-parity-v2-contract.md §4 F. Notes: docs/parity-v2/notes-F.md
 * Fail-open: before 096 is applied every RPC 404s — cards show a quiet
 * "not available yet" state and the hub explains itself; nothing throws.
 * ==========================================================================*/
(function () {
  function buildDashboards(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo, rpcCall } = deps;
    const Fragment = React.Fragment;
    const useLayoutEffect = React.useLayoutEffect || useEffect;

    // ---- optional deps (every one of them fails open) ----------------------
    const Av = deps.Av;
    const CardShell = deps.CardShell;
    const CardGrid = deps.CardGrid;
    const getCardLibrary = deps.getCardLibrary;
    const HOME_CARDS = deps.CARD_LIBRARY;
    // Every card this shell can render: home.js's library when it exposes one, else
    // home's built-ins (CARD_LIBRARY dep) merged with AMS_EXT.cards, else just ours.
    const libraryAll = () => {
      if (getCardLibrary) { try { const l = getCardLibrary(); if (l && Array.isArray(l.all)) return l.all; } catch (_) {} }
      const builtin = Array.isArray(HOME_CARDS) ? HOME_CARDS : [];
      const seen = new Set(builtin.map(c => c && c.type));
      const ext = (Array.isArray(window.AMS_EXT && window.AMS_EXT.cards) ? window.AMS_EXT.cards : [])
        .filter(c => c && typeof c.type === 'string' && typeof c.Component === 'function' && !seen.has(c.type))
        .map(c => ({ ...c, name: c.name || c.type, icon: c.icon || 'ti-layout-grid', category: c.category || 'More', desc: c.desc || '', w: [1, 2, 3].includes(Number(c.w)) ? Number(c.w) : 1 }));
      const all = builtin.concat(ext);
      return all.length ? all : CARDS;
    };
    const Popover = deps.Popover;
    const Menu = deps.Menu;
    const PickerList = deps.PickerList;
    const MemberAvatar = deps.MemberAvatar;
    const ClientBadge = deps.ClientBadge;
    const EmptyState = deps.EmptyState;
    const ConfirmDialog = deps.ConfirmDialog;
    const useTaskStore = deps.useTaskStore || (() => ({}));
    const openTask = deps.openTask || ((id) => window.dispatchEvent(new CustomEvent('ams-open-task', { detail: { id } })));
    const fmtMinutes = deps.fmtMinutes || ((n) => (n >= 60 ? Math.floor(n / 60) + 'h ' + (n % 60 ? (n % 60) + 'm' : '') : (n || 0) + 'm'));
    const fmtRelative = deps.fmtRelative || ((d) => new Date(d).toLocaleDateString('en-IN'));
    const isPrivilegedRole = deps.isPrivilegedRole || ((r) => r === 'admin' || r === 'manager');
    const isMissingRpc = deps.isMissingRpc || ((e) =>
      /PGRST202|could not find the function|does not exist|404/i.test(String((e && (e.code || '')) + ' ' + (e && (e.message || e.details || '') || ''))));

    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key || item.type;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item);
    };

    // =======================================================================
    // Styles
    // =======================================================================
    if (!document.getElementById('ams-dashboards-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-dashboards-styles';
      st.textContent = `
      :root{--cd-s1:#2a78d6;--cd-s2:#eb6834;--cd-s3:#1baf7a;--cd-s4:#eda100;--cd-s5:#e87ba4;--cd-s6:#008300;--cd-s7:#4a3aa7;--cd-s8:#e34948;
            --cd-grid:#e8e8eb;--cd-axis:#d6d6db;--cd-ink:#8e8e99}
      html.dark{--cd-s1:#3987e5;--cd-s2:#d95926;--cd-s3:#199e70;--cd-s4:#c98500;--cd-s5:#d55181;--cd-s6:#008300;--cd-s7:#9085e9;--cd-s8:#e66767;
            --cd-grid:#2d2c31;--cd-axis:#3b3a40;--cd-ink:#75747d}
      .cd-page{display:flex;flex-direction:column;min-height:0;flex:1;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px}
      .cd-page *,.cd-modal *{box-sizing:border-box}
      .cd-page :focus-visible,.cd-modal :focus-visible{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:1px}
      .cd-body{display:flex;min-height:0;flex:1}
      .cd-side{width:248px;flex-shrink:0;border-right:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg2,#f7f7f8);display:flex;flex-direction:column;min-height:0}
      .cd-side-hd{display:flex;align-items:center;gap:8px;padding:12px 12px 8px;font:600 15px Inter,system-ui,sans-serif}
      .cd-side-list{overflow:auto;padding:0 8px 10px;flex:1}
      .cd-main{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}
      .cd-scroll{overflow:auto;padding:16px 20px 28px;flex:1}
      @media(max-width:820px){.cd-side{display:none}.cd-side.open{display:flex;position:absolute;inset:0 auto 0 0;z-index:30;box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14))}.cd-scroll{padding:14px 12px 24px}}
      .cd-tab{display:flex;align-items:center;gap:7px;width:100%;height:30px;padding:0 9px;border:0;border-radius:var(--cu-radius-sm,6px);background:none;color:var(--cu-t2,#5c5c66);font:500 13px Inter,system-ui,sans-serif;cursor:pointer;text-align:left}
      .cd-tab:hover{background:var(--cu-bg3,#efeff1)}
      .cd-tab.on{background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c);font-weight:600}
      .cd-tab .n{margin-left:auto;font-size:11px;color:var(--cu-t3,#8e8e99)}
      .cd-item{display:flex;align-items:center;gap:8px;width:100%;min-height:34px;padding:4px 8px;border:0;border-radius:var(--cu-radius-sm,6px);background:none;color:var(--cu-t1,#1f1f23);font:13px Inter,system-ui,sans-serif;cursor:pointer;text-align:left}
      .cd-item:hover{background:var(--cu-bg3,#efeff1)}
      .cd-item.on{background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c);font-weight:600}
      .cd-item .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cd-item .star{opacity:0;color:var(--cu-t3,#8e8e99);background:none;border:0;cursor:pointer;padding:0;font-size:14px}
      .cd-item:hover .star,.cd-item .star.on{opacity:1}
      .cd-item .star.on{color:#f5a623}
      .cd-sec{font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3,#8e8e99);padding:12px 9px 4px}
      .cd-hd{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 20px 10px;border-bottom:1px solid var(--cu-bd,#e8e8eb)}
      @media(max-width:820px){.cd-hd{padding:10px 12px}}
      .cd-title{font:600 18px Inter,system-ui,sans-serif;display:flex;align-items:center;gap:8px;min-width:0}
      .cd-title .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cd-title input{font:600 18px Inter,system-ui,sans-serif;border:1px solid var(--cu-bd2,#d6d6db);border-radius:6px;background:var(--cu-bg,#fff);color:inherit;padding:2px 8px;max-width:min(420px,60vw)}
      .cd-tools{display:flex;gap:6px;align-items:center;margin-left:auto;flex-wrap:wrap}
      .cd-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:var(--cu-radius-sm,6px);border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:600 13px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
      .cd-btn:hover{background:var(--cu-bg3,#efeff1)}
      .cd-btn:disabled{opacity:.5;cursor:not-allowed}
      .cd-btn.pri{background:var(--cu-accent,#ff00ee);border-color:var(--cu-accent,#ff00ee);color:#fff}
      .cd-btn.pri:hover{filter:brightness(.94)}
      .cd-btn.on{background:var(--cu-accent-fog,rgba(255,0,238,.08));border-color:var(--cu-accent,#ff00ee);color:var(--cu-accent-ink,#a8009c)}
      .cd-btn.sm{height:26px;padding:0 8px;font-size:12px}
      .cd-ibtn{width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--cu-radius-sm,6px);border:1px solid transparent;background:transparent;color:var(--cu-t2,#5c5c66);cursor:pointer;font-size:16px}
      .cd-ibtn:hover{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23)}
      .cd-chip{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border-radius:13px;border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t2,#5c5c66);font:500 12px Inter,system-ui,sans-serif;cursor:pointer}
      .cd-chip.on{border-color:var(--cu-accent,#ff00ee);background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c)}
      .cd-muted{color:var(--cu-t3,#8e8e99);font-size:12px}
      .cd-input,.cd-sel{width:100%;height:32px;border:1px solid var(--cu-bd2,#d6d6db);border-radius:var(--cu-radius-sm,6px);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);padding:0 9px;font:13px Inter,system-ui,sans-serif}
      .cd-input:focus,.cd-sel:focus{border-color:var(--cu-accent,#ff00ee);outline:none}
      .cd-lab{display:block;font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3,#8e8e99);margin:10px 0 5px}
      .cd-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:start}
      .cd-cell{min-width:0}
      .cd-cell.w2{grid-column:span 2}.cd-cell.w3{grid-column:span 3}
      @media(max-width:1100px){.cd-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cd-cell.w3{grid-column:span 2}}
      @media(max-width:760px){.cd-grid{grid-template-columns:minmax(0,1fr)}.cd-cell.w2,.cd-cell.w3{grid-column:span 1}}
      .cd-card{background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);display:flex;flex-direction:column;min-width:0}
      .cd-card-hd{display:flex;align-items:center;gap:6px;padding:10px 10px 8px 14px;min-height:44px;font:600 15px Inter,system-ui,sans-serif}
      .cd-card-bd{padding:0 10px 12px}
      .cd-chart{position:relative;width:100%}
      .cd-chart svg{display:block;width:100%;overflow:visible}
      .cd-tip{position:absolute;z-index:6;pointer-events:none;background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);border-radius:6px;box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14));padding:7px 9px;font-size:12px;min-width:104px;max-width:220px}
      .cd-tip .t{font-weight:600;margin-bottom:3px;color:var(--cu-t1,#1f1f23)}
      .cd-tip .r{display:flex;align-items:center;gap:6px;color:var(--cu-t2,#5c5c66);white-space:nowrap}
      .cd-tip .r b{margin-left:auto;color:var(--cu-t1,#1f1f23);font-variant-numeric:tabular-nums}
      .cd-swatch{width:9px;height:9px;border-radius:2px;flex-shrink:0;display:inline-block}
      .cd-legend{display:flex;flex-wrap:wrap;gap:10px 14px;padding:8px 2px 2px}
      .cd-legend button{display:inline-flex;align-items:center;gap:6px;border:0;background:none;padding:0;cursor:pointer;font:500 12px Inter,system-ui,sans-serif;color:var(--cu-t2,#5c5c66)}
      .cd-legend button.off{opacity:.42;text-decoration:line-through}
      .cd-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
      .cd-tbl th,.cd-tbl td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--cu-bd,#e8e8eb);white-space:nowrap}
      .cd-tbl th{font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3,#8e8e99)}
      .cd-tbl td.num,.cd-tbl th.num{text-align:right;font-variant-numeric:tabular-nums}
      .cd-tblwrap{overflow-x:auto}
      .cd-row{display:flex;align-items:center;gap:8px;min-height:34px;padding:3px 6px;border-radius:var(--cu-radius-sm,6px);min-width:0}
      .cd-row.link{cursor:pointer}
      .cd-row.link:hover{background:var(--cu-bg3,#efeff1)}
      .cd-row .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cd-bat{height:12px;border-radius:6px;background:var(--cu-bg3,#efeff1);overflow:hidden;display:flex;gap:2px;min-width:60px}
      .cd-bat span{display:block;height:100%}
      .cd-big{font:600 26px Inter,system-ui,sans-serif;color:var(--cu-t1,#1f1f23);line-height:1.15}
      .cd-stat{display:flex;flex-direction:column;gap:2px;padding:8px 10px;background:var(--cu-bg2,#f7f7f8);border-radius:var(--cu-radius-sm,6px);min-width:0}
      .cd-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px;padding:2px 0 10px}
      .cd-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:26px 14px;color:var(--cu-t3,#8e8e99)}
      .cd-empty i{font-size:26px;opacity:.7}
      .cd-empty .t{font-size:13px;font-weight:600;color:var(--cu-t2,#5c5c66)}
      .cd-sk{height:26px;border-radius:6px;margin:6px;background:linear-gradient(90deg,var(--cu-bg2,#f7f7f8),var(--cu-bg3,#efeff1),var(--cu-bg2,#f7f7f8));background-size:200% 100%;animation:cdsk 1.2s infinite}
      @keyframes cdsk{0%{background-position:200% 0}100%{background-position:-200% 0}}
      .cd-modal-bg{position:fixed;inset:0;background:rgba(10,10,14,.45);z-index:420;display:flex;align-items:center;justify-content:center;padding:16px}
      .cd-modal{background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);border-radius:var(--cu-radius,8px);box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14));width:min(760px,100%);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;font:13px Inter,system-ui,sans-serif}
      .cd-modal-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid var(--cu-bd,#e8e8eb);font:600 16px Inter,system-ui,sans-serif}
      .cd-modal-bd{padding:14px 16px;overflow:auto}
      .cd-modal-ft{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--cu-bd,#e8e8eb)}
      .cd-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
      .cd-tile{border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);padding:12px;display:flex;flex-direction:column;gap:6px;background:var(--cu-bg,#fff);text-align:left;cursor:pointer;color:inherit;font:inherit}
      .cd-tile:hover{border-color:var(--cu-accent,#ff00ee)}
      .cd-tile .ic{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c);font-size:16px}
      .cd-tile .nm{font-weight:600;font-size:13.5px}
      .cd-tile .ds{font-size:12px;color:var(--cu-t2,#5c5c66);line-height:1.4}
      .cd-chk{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:var(--cu-radius-sm,6px);cursor:pointer;font-size:13px}
      .cd-chk:hover{background:var(--cu-bg3,#efeff1)}
      .cd-chk input{accent-color:var(--cu-accent,#ff00ee);margin:0}
      .cd-tv{position:fixed;inset:0;z-index:500;background:var(--cu-bg,#fff);display:flex;flex-direction:column;overflow:auto;padding:22px}
      .cd-tv .cd-grid{gap:16px}
      .cd-tv .cd-card-hd{font-size:17px}
      .cd-tv-exit{position:fixed;top:12px;right:12px;z-index:501}
      @media print{
        body.cd-printing>*{display:none!important}
        body.cd-printing .cd-print-root{display:block!important;position:absolute;inset:0;width:100%;padding:0;background:#fff;color:#000}
        body.cd-printing .cd-print-root .cd-side,body.cd-printing .cd-print-root .cd-tools,body.cd-printing .cd-print-root .cd-hide-print{display:none!important}
        body.cd-printing .cd-print-root .cd-scroll{overflow:visible;padding:0}
        body.cd-printing .cd-print-root .cd-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        body.cd-printing .cd-print-root .cd-card{break-inside:avoid;border-color:#bbb}
      }
      @media(prefers-reduced-motion:reduce){.cd-page *,.cd-modal *{transition:none!important;animation:none!important}}
      `;
      document.head.appendChild(st);
    }

    // =======================================================================
    // Small utils
    // =======================================================================
    const arr = (x) => (Array.isArray(x) ? x : []);
    const uid = () => 'c' + Math.random().toString(36).slice(2, 9);
    const noop = () => {};
    const errMsg = (e) => {
      if (!e) return 'Something went wrong';
      if (e.code === 'forbidden' || /forbidden/i.test(String(e.message || ''))) return 'You do not have access to that';
      if (/not_found/.test(String(e.message || ''))) return 'That dashboard no longer exists';
      return String(e.message || e.code || e);
    };
    const toast = (fn, msg) => { try { fn ? fn(msg) : console.info('[dashboards]', msg); } catch (_) {} };
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    const nfmt = (n) => {
      const v = Number(n) || 0;
      if (Math.abs(v) >= 1e7) return (v / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
      if (Math.abs(v) >= 1e5) return (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
      if (Math.abs(v) >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
      return String(Math.round(v * 100) / 100);
    };
    const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
    const hours = (n) => (n == null ? '—' : Number(n) >= 48 ? (Number(n) / 24).toFixed(1) + 'd' : Number(n).toFixed(1) + 'h');
    const dayLabel = (iso, bucket) => {
      const d = new Date(iso + 'T00:00:00');
      if (isNaN(d)) return iso;
      if (bucket === 'month') return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };
    const lsGet = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (_) { return fb; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const clientList = (clients) => (Array.isArray(clients) ? clients : clients ? Object.values(clients) : []);
    const SERIES = ['var(--cd-s1)', 'var(--cd-s2)', 'var(--cd-s3)', 'var(--cd-s4)', 'var(--cd-s5)', 'var(--cd-s6)', 'var(--cd-s7)', 'var(--cd-s8)'];
    const RANGES = [['7d', 'Last 7 days'], ['14d', 'Last 14 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'],
      ['this_week', 'This week'], ['last_week', 'Last week'], ['this_month', 'This month'], ['last_month', 'Last month'],
      ['ytd', 'Year to date'], ['12m', 'Last 12 months']];
    const rangeLabel = (k) => (RANGES.find(r => r[0] === k) || [null, 'Last 30 days'])[1];

    // =======================================================================
    // API
    // =======================================================================
    const call = (name, args) => rpcCall(name, args || {});
    const DashAPI = {
      list: () => call('dashboard_list'),
      get: (id) => call('dashboard_get', { p_id: id }),
      upsert: (data) => call('dashboard_upsert', { p_data: data }),
      remove: (id) => call('dashboard_delete', { p_id: id }),
      duplicate: (id) => call('dashboard_duplicate', { p_id: id }),
      favorite: (id, label) => call('favorite_toggle', { p_kind: 'dashboard', p_ref_id: id, p_label: label || 'Dashboard', p_url: null }),
      metric: (name, filter, config) => call(name, config === undefined ? { p_filter: filter || {} } : { p_filter: filter || {}, p_config: config || {} }),
    };

    // =======================================================================
    // Dashboard context — per-card config + the dashboard's own filters/tick.
    // Shared with goals.js / teams.js cards through window.__amsDashCtx.
    // =======================================================================
    const DashCtx = window.__amsDashCtx || (window.__amsDashCtx = React.createContext(null));
    const useDashCtx = () => React.useContext(DashCtx) || null;

    // Merge CardGrid's filters with the dashboard's own (range, extra scopes).
    function useCardFilter(props, extra) {
      const ctx = useDashCtx();
      const f = {};
      const pf = props && props.filters;
      if (pf && arr(pf.client_ids).length) f.client_ids = arr(pf.client_ids);
      if (pf && arr(pf.assignee_ids).length) f.assignee_ids = arr(pf.assignee_ids);
      const df = ctx && ctx.filters;
      if (df) {
        if (!f.client_ids && arr(df.client_ids).length) f.client_ids = arr(df.client_ids);
        if (!f.assignee_ids && arr(df.assignee_ids).length) f.assignee_ids = arr(df.assignee_ids);
        if (df.range) f.range = df.range;
        if (df.date_from) f.date_from = df.date_from;
        if (df.date_to) f.date_to = df.date_to;
        if (arr(df.list_ids).length) f.list_ids = arr(df.list_ids);
        if (arr(df.team_ids).length) f.team_ids = arr(df.team_ids);
        if (df.agency_only) f.agency_only = true;
      }
      Object.assign(f, extra || {});
      const key = JSON.stringify(f);
      return useMemo(() => f, [key]);
    }

    // Card config: dashboards persist it in the card row; on Home we keep it per browser.
    function useCardConfig(card) {
      const ctx = useDashCtx();
      const id = (card && card.id) || 'anon';
      const base = (card && card.config) || {};
      const [local, setLocal] = useState(() => (ctx && ctx.setCardConfig ? null : lsGet('ams_card_cfg_' + id, null)));
      const config = ctx && ctx.setCardConfig ? base : { ...base, ...(local || {}) };
      const setConfig = useCallback((patch) => {
        if (ctx && ctx.setCardConfig) { ctx.setCardConfig(id, patch); return; }
        setLocal(prev => { const next = { ...(prev || {}), ...patch }; lsSet('ams_card_cfg_' + id, next); return next; });
      }, [ctx, id]);
      return [config, setConfig];
    }

    // Data hook — one metric RPC, refreshed on the dashboard's tick.
    function useMetric(rpc, filter, config, enabled) {
      const ctx = useDashCtx();
      const tick = (ctx && ctx.tick) || 0;
      const [st, setSt] = useState({ data: null, error: null, loading: enabled !== false, missing: false });
      const cfgKey = JSON.stringify(config || null);
      const reqRef = useRef(0);
      const load = useCallback(async () => {
        if (enabled === false) { setSt({ data: null, error: null, loading: false, missing: false }); return; }
        const id = ++reqRef.current;
        setSt(s => ({ ...s, loading: true }));
        try {
          const d = await DashAPI.metric(rpc, filter, config);
          if (id === reqRef.current) setSt({ data: d, error: null, loading: false, missing: false });
        } catch (e) {
          if (id !== reqRef.current) return;
          if (isMissingRpc(e)) setSt({ data: null, error: null, loading: false, missing: true });
          else setSt({ data: null, error: e, loading: false, missing: false });
        }
      }, [rpc, JSON.stringify(filter || null), cfgKey, enabled]);
      useEffect(() => { load(); }, [load]);
      useEffect(() => { if (tick) load(); }, [tick]);
      return { ...st, reload: load };
    }

    // =======================================================================
    // Chart primitives (hand-rolled SVG, theme-aware, accessible)
    // =======================================================================
    function useWidth(ref, fallback) {
      const [w, setW] = useState(fallback || 520);
      useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const read = () => { const n = el.clientWidth; if (n > 0) setW(n); };
        read();
        if (!window.ResizeObserver) { window.addEventListener('resize', read); return () => window.removeEventListener('resize', read); }
        const ro = new ResizeObserver(read); ro.observe(el);
        return () => ro.disconnect();
      }, [ref]);
      return w;
    }
    const niceMax = (v) => {
      if (!(v > 0)) return 1;
      const mag = Math.pow(10, Math.floor(Math.log10(v)));
      const n = v / mag;
      return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    };

    function Loading({ rows = 4 }) {
      return h`<div aria-busy="true" aria-label="Loading">${Array.from({ length: rows }).map((_, i) => h`<div key=${i} class="cd-sk" style=${{ opacity: 1 - i * 0.18 }}></div>`)}</div>`;
    }
    function Empty({ icon = 'ti-chart-line', title, sub, action }) {
      if (EmptyState) return h`<${EmptyState} icon=${icon} title=${title} sub=${sub} action=${action}/>`;
      return h`<div class="cd-empty"><i class=${'ti ' + icon}></i><div class="t">${title}</div>${sub && h`<div style=${{ fontSize: 12 }}>${sub}</div>`}${action}</div>`;
    }
    function NotReady({ what }) {
      return h`<div class="cd-empty"><i class="ti ti-database-off"></i>
        <div class="t">${what || 'Not available yet'}</div>
        <div style=${{ fontSize: 12, maxWidth: 260 }}>This report needs the dashboards migration (096) to be applied.</div></div>`;
    }
    function ErrBox({ error, onRetry }) {
      return h`<div class="cd-empty" role="alert"><i class="ti ti-alert-triangle" style=${{ color: '#e5484d' }}></i>
        <div class="t">Couldn’t load</div><div style=${{ fontSize: 12 }}>${errMsg(error)}</div>
        ${onRetry && h`<button class="cd-btn sm" onClick=${onRetry}><i class="ti ti-refresh"></i>Retry</button>`}</div>`;
    }

    // Wraps a chart with a legend + a "Show data" table (the accessibility channel).
    function ChartFrame({ summary, legend, table, children, hidden, onToggle }) {
      const [showTable, setShowTable] = useState(false);
      return h`<div>
        <div class="cd-chart">${children}</div>
        ${legend && arr(legend).length > 1 && h`<div class="cd-legend">
          ${arr(legend).map(l => h`<button key=${l.key} type="button" class=${hidden && hidden[l.key] ? 'off' : ''}
              aria-pressed=${hidden && hidden[l.key] ? 'false' : 'true'} title=${'Toggle ' + l.label}
              onClick=${() => onToggle && onToggle(l.key)}>
              <span class="cd-swatch" style=${{ background: l.color }}></span>${l.label}</button>`)}
        </div>`}
        ${table && h`<div class="cd-hide-print">
          <button class="cd-btn sm" style=${{ marginTop: 6 }} aria-expanded=${showTable ? 'true' : 'false'} onClick=${() => setShowTable(v => !v)}>
            <i class=${'ti ' + (showTable ? 'ti-chevron-up' : 'ti-table')}></i>${showTable ? 'Hide data' : 'Show data'}
          </button>
          ${showTable && h`<div class="cd-tblwrap">${table}</div>`}
        </div>`}
        <span class="cd-sr" style=${{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>${summary}</span>
      </div>`;
    }

    // Multi-series line chart with crosshair + tooltip.
    function LineChart({ labels, series, height = 190, bucket, valueFmt }) {
      const wrapRef = useRef(null);
      const W = useWidth(wrapRef);
      const [hidden, setHidden] = useState({});
      const [hi, setHi] = useState(null);
      const fmtV = valueFmt || nfmt;
      const ls = arr(labels);
      const ss = arr(series).filter(s => s && !hidden[s.key]);
      const padL = 40, padR = 14, padT = 10, padB = 22;
      const innerW = Math.max(40, W - padL - padR);
      const innerH = Math.max(40, height - padT - padB);
      const max = niceMax(Math.max(1, ...ss.flatMap(s => arr(s.values).map(Number))));
      const x = (i) => padL + (ls.length <= 1 ? innerW / 2 : (i / (ls.length - 1)) * innerW);
      const y = (v) => padT + innerH - (clamp(Number(v) || 0, 0, max) / max) * innerH;
      const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => max * f);
      const step = Math.max(1, Math.ceil(ls.length / Math.max(2, Math.floor(innerW / 64))));
      const onMove = (e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const rel = e.clientX - box.left - padL;
        const i = ls.length <= 1 ? 0 : Math.round((rel / innerW) * (ls.length - 1));
        setHi(clamp(i, 0, ls.length - 1));
      };
      const summary = arr(series).map(s => s.label + ': ' + arr(s.values).slice(-1).map(fmtV).join('') + ' latest').join('; ');
      const table = h`<table class="cd-tbl"><thead><tr><th>Date</th>${arr(series).map(s => h`<th key=${s.key} class="num">${s.label}</th>`)}</tr></thead>
        <tbody>${ls.map((lb, i) => h`<tr key=${lb}><td>${dayLabel(lb, bucket)}</td>${arr(series).map(s => h`<td key=${s.key} class="num">${fmtV(arr(s.values)[i])}</td>`)}</tr>`)}</tbody></table>`;
      return h`<${ChartFrame} summary=${summary} table=${table} hidden=${hidden}
          legend=${arr(series).map(s => ({ key: s.key, label: s.label, color: s.color }))}
          onToggle=${(k) => setHidden(m => ({ ...m, [k]: !m[k] }))}>
        <div ref=${wrapRef} style=${{ position: 'relative' }}>
          <svg height=${height} viewBox=${'0 0 ' + W + ' ' + height} role="img" aria-label=${'Line chart. ' + summary}
            onMouseMove=${onMove} onMouseLeave=${() => setHi(null)}>
            ${ticks.map((t, i) => h`<g key=${i}>
              <line x1=${padL} x2=${W - padR} y1=${y(t)} y2=${y(t)} stroke="var(--cd-grid)" strokeWidth="1"/>
              <text x=${padL - 6} y=${y(t) + 4} textAnchor="end" style=${{ fill: 'var(--cd-ink)', font: '10px Inter,system-ui,sans-serif' }}>${nfmt(t)}</text>
            </g>`)}
            ${ls.map((lb, i) => (i % step === 0 || i === ls.length - 1) && h`<text key=${lb} x=${x(i)} y=${height - 6} textAnchor="middle"
              style=${{ fill: 'var(--cd-ink)', font: '10px Inter,system-ui,sans-serif' }}>${dayLabel(lb, bucket)}</text>`)}
            ${hi != null && ls.length > 0 && h`<line x1=${x(hi)} x2=${x(hi)} y1=${padT} y2=${padT + innerH} stroke="var(--cd-axis)" strokeWidth="1"/>`}
            ${ss.map(s => h`<path key=${s.key} fill="none" stroke=${s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
              d=${arr(s.values).map((v, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(v)).join(' ')}/>`)}
            ${ss.map(s => { const i = ls.length - 1; const v = arr(s.values)[i];
              return v == null ? null : h`<circle key=${'e' + s.key} cx=${x(i)} cy=${y(v)} r="4" fill=${s.color} stroke="var(--cu-bg,#fff)" strokeWidth="2"/>`; })}
            ${hi != null && ss.map(s => h`<circle key=${'h' + s.key} cx=${x(hi)} cy=${y(arr(s.values)[hi])} r="4" fill=${s.color} stroke="var(--cu-bg,#fff)" strokeWidth="2"/>`)}
          </svg>
          ${hi != null && ls[hi] && h`<div class="cd-tip" style=${{ left: clamp(x(hi) + 10, 0, Math.max(0, W - 150)), top: 6 }}>
            <div class="t">${dayLabel(ls[hi], bucket)}</div>
            ${ss.map(s => h`<div class="r" key=${s.key}><span class="cd-swatch" style=${{ background: s.color }}></span>${s.label}<b>${fmtV(arr(s.values)[hi])}</b></div>`)}
          </div>`}
        </div>
      <//>`;
    }

    // Bars — horizontal (default) or columns. rows: [{ key, label, value, color, sub, onClick }]
    function Bars({ rows, height, columns, valueFmt, max: maxIn, emptyText }) {
      const wrapRef = useRef(null);
      const W = useWidth(wrapRef);
      const [hi, setHi] = useState(null);
      const fmtV = valueFmt || nfmt;
      const rs = arr(rows);
      if (!rs.length) return h`<${Empty} icon="ti-chart-bar" title=${emptyText || 'Nothing to chart yet'}/>`;
      const max = niceMax(maxIn || Math.max(1, ...rs.map(r => Number(r.value) || 0)));
      const summary = rs.map(r => r.label + ': ' + fmtV(r.value)).join('; ');
      const table = h`<table class="cd-tbl"><thead><tr><th>Name</th><th class="num">Value</th></tr></thead>
        <tbody>${rs.map(r => h`<tr key=${r.key}><td>${r.label}</td><td class="num">${fmtV(r.value)}</td></tr>`)}</tbody></table>`;
      if (columns) {
        const padB = 30, padT = 12, H = height || 180;
        const innerH = H - padT - padB;
        const bw = Math.min(24, Math.max(6, (W / Math.max(rs.length, 1)) * 0.6));
        const gap = rs.length > 1 ? (W - rs.length * bw) / (rs.length + 1) : 0;
        const bx = (i) => gap + i * (bw + gap);
        return h`<${ChartFrame} summary=${summary} table=${table}>
          <div ref=${wrapRef} style=${{ position: 'relative' }}>
            <svg height=${H} viewBox=${'0 0 ' + W + ' ' + H} role="img" aria-label=${'Bar chart. ' + summary}>
              <line x1="0" x2=${W} y1=${padT + innerH} y2=${padT + innerH} stroke="var(--cd-axis)" strokeWidth="1"/>
              ${rs.map((r, i) => { const hgt = Math.max(2, ((Number(r.value) || 0) / max) * innerH);
                return h`<g key=${r.key} onMouseEnter=${() => setHi(i)} onMouseLeave=${() => setHi(null)}
                    onClick=${r.onClick || undefined} style=${{ cursor: r.onClick ? 'pointer' : 'default' }}>
                  <rect x=${bx(i)} y=${padT + innerH - hgt} width=${bw} height=${hgt} rx="4" fill=${r.color || SERIES[i % SERIES.length]}/>
                  <rect x=${bx(i)} y=${padT + innerH - Math.min(hgt, 4)} width=${bw} height=${Math.min(hgt, 4)} fill=${r.color || SERIES[i % SERIES.length]}/>
                  <text x=${bx(i) + bw / 2} y=${H - 16} textAnchor="middle" style=${{ fill: 'var(--cd-ink)', font: '10px Inter,system-ui,sans-serif' }}>
                    ${String(r.label).length > 9 ? String(r.label).slice(0, 8) + '…' : r.label}</text>
                  <text x=${bx(i) + bw / 2} y=${H - 4} textAnchor="middle" style=${{ fill: 'var(--cu-t2,#5c5c66)', font: '600 10px Inter,system-ui,sans-serif' }}>${fmtV(r.value)}</text>
                </g>`; })}
            </svg>
            ${hi != null && rs[hi] && h`<div class="cd-tip" style=${{ left: clamp(bx(hi) - 40, 0, Math.max(0, W - 150)), top: 0 }}>
              <div class="t">${rs[hi].label}</div><div class="r"><span class="cd-swatch" style=${{ background: rs[hi].color || SERIES[hi % SERIES.length] }}></span>
              ${rs[hi].sub || 'Value'}<b>${fmtV(rs[hi].value)}</b></div></div>`}
          </div>
        <//>`;
      }
      return h`<${ChartFrame} summary=${summary} table=${table}>
        <div ref=${wrapRef}>
          ${rs.map((r, i) => h`<div key=${r.key} class=${'cd-row' + (r.onClick ? ' link' : '')} role=${r.onClick ? 'button' : undefined}
              tabIndex=${r.onClick ? '0' : undefined} onClick=${r.onClick || undefined}
              onKeyDown=${r.onClick ? (e) => { if (e.key === 'Enter') r.onClick(); } : undefined}
              aria-label=${r.label + ': ' + fmtV(r.value)}>
            <span class="nm" style=${{ maxWidth: 130, flex: '0 0 auto' }} title=${r.label}>${r.left || null}${r.label}</span>
            <span style=${{ flex: 1, minWidth: 40, display: 'flex', alignItems: 'center' }}>
              <span style=${{ display: 'block', height: 12, width: Math.max(1.5, ((Number(r.value) || 0) / max) * 100) + '%',
                background: r.color || SERIES[i % SERIES.length], borderRadius: '2px 4px 4px 2px' }}></span>
            </span>
            <span style=${{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, minWidth: 42, textAlign: 'right' }}>${fmtV(r.value)}</span>
          </div>`)}
        </div>
      <//>`;
    }

    // Donut / pie
    function Donut({ rows, size = 132, valueFmt }) {
      const fmtV = valueFmt || nfmt;
      const rs = arr(rows).filter(r => Number(r.value) > 0);
      const total = rs.reduce((a, r) => a + Number(r.value), 0);
      if (!total) return h`<${Empty} icon="ti-chart-donut" title="Nothing to chart yet"/>`;
      const R = 46, C = 2 * Math.PI * R;
      let acc = 0;
      const summary = rs.map(r => r.label + ' ' + fmtV(r.value)).join(', ');
      const table = h`<table class="cd-tbl"><thead><tr><th>Name</th><th class="num">Value</th><th class="num">Share</th></tr></thead>
        <tbody>${rs.map(r => h`<tr key=${r.key}><td>${r.label}</td><td class="num">${fmtV(r.value)}</td><td class="num">${Math.round(Number(r.value) / total * 100)}%</td></tr>`)}</tbody></table>`;
      return h`<${ChartFrame} summary=${summary} table=${table}>
        <div style=${{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center', padding: '6px 0' }}>
          <svg width=${size} height=${size} viewBox="0 0 120 120" role="img" aria-label=${'Donut chart. ' + summary}>
            <circle cx="60" cy="60" r=${R} fill="none" strokeWidth="14" style=${{ stroke: 'var(--cu-bg3,#efeff1)' }}/>
            ${rs.map((r, i) => { const len = (Number(r.value) / total) * C;
              const gap = rs.length > 1 ? Math.min(2, len / 3) : 0;
              const el = h`<circle key=${r.key} cx="60" cy="60" r=${R} fill="none" strokeWidth="14" stroke=${r.color || SERIES[i % SERIES.length]}
                strokeDasharray=${Math.max(0, len - gap) + ' ' + (C - Math.max(0, len - gap))} strokeDashoffset=${-acc} transform="rotate(-90 60 60)"/>`;
              acc += len; return el; })}
            <text x="60" y="58" textAnchor="middle" style=${{ fill: 'var(--cu-t1,#1f1f23)', font: '600 19px Inter,system-ui,sans-serif' }}>${nfmt(total)}</text>
            <text x="60" y="74" textAnchor="middle" style=${{ fill: 'var(--cu-t3,#8e8e99)', font: '500 10px Inter,system-ui,sans-serif' }}>total</text>
          </svg>
          <div style=${{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 130, flex: 1 }}>
            ${rs.slice(0, 8).map((r, i) => h`<div key=${r.key} style=${{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--cu-t2,#5c5c66)' }}>
              <span class="cd-swatch" style=${{ background: r.color || SERIES[i % SERIES.length] }}></span>
              <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${r.label}</span>
              <b style=${{ marginLeft: 'auto', color: 'var(--cu-t1,#1f1f23)', fontVariantNumeric: 'tabular-nums' }}>${fmtV(r.value)}</b>
            </div>`)}
          </div>
        </div>
      <//>`;
    }

    // Battery — stacked segments in one bar (ClickUp's "battery" chart)
    function Battery({ segments, total, label }) {
      const segs = arr(segments).filter(s => Number(s.value) > 0);
      const sum = total || segs.reduce((a, s) => a + Number(s.value), 0) || 1;
      return h`<span class="cd-bat" role="img" aria-label=${(label ? label + ': ' : '') + segs.map(s => s.label + ' ' + s.value).join(', ')}>
        ${segs.map(s => h`<span key=${s.key} style=${{ width: (Number(s.value) / sum * 100) + '%', background: s.color }} title=${s.label + ': ' + s.value}></span>`)}
      </span>`;
    }

    // =======================================================================
    // Card chrome helper — CardShell when home.js is loaded, else a local one.
    // =======================================================================
    function Shell({ title, icon, count, onRefresh, ctl, right, children, tall }) {
      if (CardShell) return h`<${CardShell} title=${title} icon=${icon} count=${count} onRefresh=${onRefresh} ctl=${ctl} right=${right} tall=${tall}>${children}<//>`;
      return h`<section class="cd-card">
        <div class="cd-card-hd">${icon && h`<i class=${'ti ' + icon} style=${{ color: 'var(--cu-t3,#8e8e99)', fontSize: 16 }}></i>`}
          <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>${title}</span>
          ${count != null && h`<span class="cd-muted">${count}</span>`}${right}
          ${onRefresh && h`<button class="cd-ibtn" aria-label="Refresh" onClick=${onRefresh}><i class="ti ti-refresh"></i></button>`}
        </div>
        <div class="cd-card-bd">${children}</div>
      </section>`;
    }
    // A small settings popover for configurable cards.
    function CardSettings({ children, title = 'Card settings' }) {
      const ref = useRef(null);
      const [open, setOpen] = useState(false);
      const close = useCallback(() => setOpen(false), []);
      const Pop = Popover;
      return h`<${Fragment}>
        <button ref=${ref} class="cd-ibtn" aria-label=${title} title=${title} aria-haspopup="dialog" aria-expanded=${open ? 'true' : 'false'}
          onClick=${(e) => { e.stopPropagation(); setOpen(o => !o); }}><i class="ti ti-adjustments"></i></button>
        ${open && Pop && h`<${Pop} anchor=${ref.current} open=${open} onClose=${close} width=${280} ariaLabel=${title}>
          <div style=${{ padding: 10 }}>${children(close)}</div>
        <//>`}
        ${open && !Pop && h`<div class="cd-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) close(); }}>
          <div class="cd-modal" style=${{ width: 'min(420px,100%)' }}>
            <div class="cd-modal-hd">${title}<button class="cd-ibtn" aria-label="Close" onClick=${close}><i class="ti ti-x"></i></button></div>
            <div class="cd-modal-bd">${children(close)}</div>
          </div>
        </div>`}
      <//>`;
    }
    const Body = ({ q, children, empty }) => (q.missing ? h`<${NotReady}/>`
      : q.error ? h`<${ErrBox} error=${q.error} onRetry=${q.reload}/>`
      : q.loading && !q.data ? h`<${Loading}/>`
      : !q.data ? h`<${Empty} title=${empty || 'Nothing to show'}/>` : children);

    // =======================================================================
    // Cards
    // =======================================================================
    function StatusOverTimeCard(props) {
      const filter = useCardFilter(props);
      const q = useMetric('dash_status_over_time', filter);
      const d = q.data || {};
      return h`<${Shell} title="Status over time" icon="ti-chart-line" count=${d.bucket ? 'by ' + d.bucket : null} onRefresh=${q.reload} ctl=${props.ctl}>
        <${Body} q=${q}>
          ${d.labels && arr(d.labels).length
            ? h`<${Fragment}>
                <${LineChart} labels=${d.labels} bucket=${d.bucket} series=${arr(d.series)}/>
                ${d.source === 'basic' && h`<div class="cd-muted" style=${{ marginTop: 4 }}>Open vs completed. Per-status history starts once migration 093 is applied.</div>`}
              <//>`
            : h`<${Empty} icon="ti-chart-line" title="No tasks in this window"/>`}
        <//>
      <//>`;
    }

    function PriorityOverTimeCard(props) {
      const filter = useCardFilter(props);
      const q = useMetric('dash_priority_over_time', filter);
      const d = q.data || {};
      return h`<${Shell} title="Priority over time" icon="ti-flag-3" onRefresh=${q.reload} ctl=${props.ctl}>
        <${Body} q=${q}>
          ${d.labels && arr(d.labels).length ? h`<${LineChart} labels=${d.labels} bucket=${d.bucket} series=${arr(d.series)}/>`
            : h`<${Empty} icon="ti-flag-3" title="No open tasks in this window"/>`}
        <//>
      <//>`;
    }

    function TimeInStatusCard(props) {
      const filter = useCardFilter(props);
      const q = useMetric('dash_time_in_status', filter);
      const d = q.data || {};
      const [byClient, setByClient] = useState(false);
      const rows = arr(d.statuses).map(s => ({ key: s.status, label: s.name, value: Number(s.avg_minutes) || 0, color: s.color, sub: 'Average' }));
      const clients = arr(d.clients);
      return h`<${Shell} title="Time in status" icon="ti-hourglass-high" onRefresh=${q.reload} ctl=${props.ctl}
          count=${d.available && rows.length ? 'avg per status' : null}
          right=${d.available && clients.length ? h`<button class="cd-btn sm" onClick=${() => setByClient(v => !v)}>${byClient ? 'All clients' : 'By client'}</button>` : null}>
        <${Body} q=${q}>
          ${!d.available ? h`<div class="cd-empty"><i class="ti ti-history-toggle"></i><div class="t">Status history isn’t recorded yet</div>
              <div style=${{ fontSize: 12, maxWidth: 280 }}>Once migration 093 is applied, every status change is timestamped and this card shows the average time tasks spend in each status.</div></div>`
          : !rows.length ? h`<${Empty} icon="ti-hourglass-high" title="No status changes in this window"/>`
          : byClient
            ? h`<div class="cd-tblwrap"><table class="cd-tbl">
                <thead><tr><th>Client</th>${arr(d.statuses).map(s => h`<th key=${s.status} class="num">${s.name}</th>`)}</tr></thead>
                <tbody>${clients.map(c => h`<tr key=${c.client_id || 'agency'}><td>${c.name}</td>
                  ${arr(d.statuses).map(s => h`<td key=${s.status} class="num">${(c.statuses || {})[s.status] != null ? fmtMinutes(Number((c.statuses || {})[s.status])) : '—'}</td>`)}</tr>`)}</tbody>
              </table></div>`
            : h`<${Bars} rows=${rows} valueFmt=${(v) => fmtMinutes(Number(v) || 0)}/>`}
        <//>
      <//>`;
    }

    function CycleLeadCard(props) {
      const filter = useCardFilter(props);
      const q = useMetric('dash_cycle_lead', filter);
      const d = q.data || {};
      const lead = d.lead || {}, cyc = d.cycle || {};
      const trend = arr(d.trend);
      const series = [
        { key: 'lead', label: 'Lead time', color: 'var(--cd-s1)', values: trend.map(t => Number(t.lead_avg_hours) || 0) },
        { key: 'cycle', label: 'Cycle time', color: 'var(--cd-s3)', values: trend.map(t => Number(t.cycle_avg_hours) || 0) },
      ];
      return h`<${Shell} title="Cycle & lead time" icon="ti-timeline-event" count=${lead.count ? lead.count + ' completed' : null} onRefresh=${q.reload} ctl=${props.ctl}>
        <${Body} q=${q}>
          ${!lead.count ? h`<${Empty} icon="ti-timeline-event" title="Nothing completed in this window"/>`
          : h`<${Fragment}>
            <div class="cd-stats">
              <div class="cd-stat"><span class="cd-muted">Lead time (avg)</span><span class="cd-big">${hours(lead.avg_hours)}</span><span class="cd-muted">median ${hours(lead.median_hours)}</span></div>
              <div class="cd-stat"><span class="cd-muted">Cycle time (avg)</span><span class="cd-big">${hours(cyc.avg_hours)}</span><span class="cd-muted">${cyc.count ? 'median ' + hours(cyc.median_hours) : 'no in-progress history'}</span></div>
              <div class="cd-stat"><span class="cd-muted">Slowest 15%</span><span class="cd-big">${hours(lead.p85_hours)}</span><span class="cd-muted">lead time</span></div>
            </div>
            ${trend.length > 1 && h`<${LineChart} labels=${trend.map(t => t.label)} bucket=${d.bucket} series=${series} valueFmt=${(v) => hours(v)}/>`}
            <div class="cd-muted">Lead = created → completed. Cycle = first “in progress” → completed.</div>
          <//>`}
        <//>
      <//>`;
    }

    function CompletedReportCard(props) {
      const filter = useCardFilter(props);
      const q = useMetric('dash_completed', filter);
      const d = q.data || {};
      const [mode, setMode] = useState('trend');
      const people = arr(d.by_assignee).map((a, i) => ({ key: a.member_id, label: a.name, value: Number(a.count) || 0, color: SERIES[i % SERIES.length] }));
      const onTime = Number(d.on_time) || 0, late = Number(d.late) || 0;
      const pct = onTime + late > 0 ? Math.round((onTime / (onTime + late)) * 100) : null;
      return h`<${Shell} title="Completed" icon="ti-circle-check" count=${d.total != null ? d.total + ' done' : null} onRefresh=${q.reload} ctl=${props.ctl}
          right=${h`<button class="cd-btn sm" onClick=${() => setMode(m => (m === 'trend' ? 'people' : 'trend'))}>${mode === 'trend' ? 'By person' : 'Trend'}</button>`}>
        <${Body} q=${q}>
          ${!d.total ? h`<${Empty} icon="ti-circle-check" title="Nothing completed in this window"/>`
          : h`<${Fragment}>
            <div class="cd-stats">
              <div class="cd-stat"><span class="cd-muted">Completed</span><span class="cd-big">${d.total}</span></div>
              <div class="cd-stat"><span class="cd-muted">On time</span><span class="cd-big" style=${{ color: '#0ca30c' }}>${pct == null ? '—' : pct + '%'}</span><span class="cd-muted">${onTime} of ${onTime + late} with a due date</span></div>
              <div class="cd-stat"><span class="cd-muted">Unassigned</span><span class="cd-big">${d.unassigned || 0}</span></div>
            </div>
            ${mode === 'trend'
              ? h`<${Bars} columns=${true} rows=${arr(d.labels).map((lb, i) => ({ key: lb, label: dayLabel(lb, d.bucket), value: Number(arr(d.values)[i]) || 0, color: 'var(--cd-s3)' }))}/>`
              : h`<${Bars} rows=${people} emptyText="No assignees on completed tasks"/>`}
          <//>`}
        <//>
      <//>`;
    }

    function WhosBehindCard(props) {
      const filter = useCardFilter(props);
      const q = useMetric('dash_behind', filter);
      const rows = arr(q.data).filter(r => (r.overdue || 0) + (r.overdue_old || 0) + (r.due_soon || 0) > 0);
      return h`<${Shell} title="Who’s behind" icon="ti-alert-hexagon" count=${q.data ? rows.length + ' people' : null} onRefresh=${q.reload} ctl=${props.ctl}>
        <${Body} q=${q}>
          ${!rows.length ? h`<${Empty} icon="ti-mood-happy" title="Nobody is behind" sub="No overdue work in this scope."/>`
          : h`<div>${rows.map(r => h`<div key=${r.member_id} class="cd-row" aria-label=${r.name + ': ' + r.overdue + ' overdue, ' + r.due_soon + ' due soon'}>
              ${MemberAvatar ? h`<${MemberAvatar} member=${r} size=${22}/>` : Av ? h`<${Av} i=${r.initials} c=${r.color} s=${22} round=${true}/>` : null}
              <span class="nm">${r.name}</span>
              ${r.overdue > 0 && h`<span class="cd-chip" style=${{ borderColor: 'transparent', background: '#d03b3b1f', color: '#d03b3b', cursor: 'default' }}>${r.overdue} overdue</span>`}
              ${r.overdue_old > 0 && h`<span class="cd-muted" title="Due more than 30 days ago">+${r.overdue_old} stale</span>`}
              ${r.due_soon > 0 && h`<span class="cd-muted">${r.due_soon} due soon</span>`}
              ${r.on_time_pct != null && h`<span class="cd-muted" title="On-time completion in this window">${r.on_time_pct}% on time</span>`}
            </div>`)}</div>`}
        <//>
      <//>`;
    }

    function UnassignedCard(props) {
      const filter = useCardFilter(props);
      const q = useMetric('dash_unassigned', filter);
      const d = q.data || {};
      return h`<${Shell} title="Unassigned" icon="ti-user-question" count=${d.count != null ? d.count + ' tasks' : null} onRefresh=${q.reload} ctl=${props.ctl}>
        <${Body} q=${q}>
          ${!d.count ? h`<${Empty} icon="ti-user-check" title="Everything is assigned"/>`
          : h`<${Fragment}>
            <div class="cd-stats">
              <div class="cd-stat"><span class="cd-muted">Unassigned</span><span class="cd-big">${d.count}</span></div>
              <div class="cd-stat"><span class="cd-muted">Overdue</span><span class="cd-big" style=${{ color: d.overdue ? '#d03b3b' : undefined }}>${d.overdue || 0}</span></div>
              <div class="cd-stat"><span class="cd-muted">Due this week</span><span class="cd-big">${d.due_week || 0}</span></div>
            </div>
            ${arr(d.by_client).length > 0 && h`<${Bars} rows=${arr(d.by_client).map((c, i) => ({ key: c.client_id || 'agency', label: c.name, value: Number(c.count) || 0, color: SERIES[i % SERIES.length] }))}/>`}
            ${arr(d.sample).length > 0 && h`<div style=${{ marginTop: 8 }}>
              <div class="cd-muted" style=${{ padding: '4px 6px' }}>Oldest first</div>
              ${arr(d.sample).map(t => h`<div key=${t.id} class="cd-row link" role="button" tabIndex="0"
                  onClick=${() => openTask(t.id)} onKeyDown=${(e) => { if (e.key === 'Enter') openTask(t.id); }}>
                <i class="ti ti-circle-dashed" style=${{ color: t.status_color || 'var(--cu-t3)' }}></i>
                <span class="nm">${t.title}</span>
                <span class="cd-muted">${t.client_name || 'Agency'}</span>
              </div>`)}
            </div>`}
          <//>`}
        <//>
      <//>`;
    }

    function ByAssigneeCard(props) {
      const filter = useCardFilter(props);
      const q = useMetric('dash_by_assignee', filter);
      const d = q.data || {};
      const members = arr(d.members);
      const maxTotal = Math.max(1, ...members.map(m => (m.todo || 0) + (m.active || 0) + (m.done || 0)));
      return h`<${Shell} title="Tasks by assignee" icon="ti-battery-3" count=${members.length ? members.length + ' people' : null} onRefresh=${q.reload} ctl=${props.ctl}>
        <${Body} q=${q}>
          ${!members.length ? h`<${Empty} icon="ti-users" title="No assigned work here"/>`
          : h`<${Fragment}>
            ${members.map(m => { const total = (m.todo || 0) + (m.active || 0) + (m.done || 0);
              return h`<div key=${m.member_id} class="cd-row" aria-label=${m.name + ': ' + m.todo + ' to do, ' + m.active + ' in progress, ' + m.done + ' done'}>
                ${MemberAvatar ? h`<${MemberAvatar} member=${m} size=${22}/>` : null}
                <span class="nm" style=${{ maxWidth: 120, flex: '0 0 auto' }}>${m.name}</span>
                <span style=${{ flex: 1, minWidth: 60, display: 'block', width: (total / maxTotal * 100) + '%' }}>
                  <${Battery} label=${m.name} total=${total} segments=${[
                    { key: 'todo', label: 'To do', value: m.todo, color: '#87909e' },
                    { key: 'active', label: 'In progress', value: m.active, color: 'var(--cd-s1)' },
                    { key: 'done', label: 'Done', value: m.done, color: 'var(--cd-s3)' }]}/>
                </span>
                <span class="cd-muted" style=${{ minWidth: 68, textAlign: 'right' }}>
                  ${total}${m.overdue ? h` · <span style=${{ color: '#d03b3b' }}>${m.overdue} late</span>` : ''}
                </span>
              </div>`; })}
            <div class="cd-legend">
              <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cu-t2,#5c5c66)' }}><span class="cd-swatch" style=${{ background: '#87909e' }}></span>To do</span>
              <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cu-t2,#5c5c66)' }}><span class="cd-swatch" style=${{ background: 'var(--cd-s1)' }}></span>In progress</span>
              <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cu-t2,#5c5c66)' }}><span class="cd-swatch" style=${{ background: 'var(--cd-s3)' }}></span>Completed in range</span>
            </div>
            ${d.unassigned_open > 0 && h`<div class="cd-muted">${d.unassigned_open} open task${d.unassigned_open > 1 ? 's' : ''} with nobody assigned.</div>`}
          <//>`}
        <//>
      <//>`;
    }

    const GROUPS = [['status', 'Status'], ['status_category', 'Status category'], ['priority', 'Priority'], ['assignee', 'Assignee'],
      ['client', 'Client'], ['list', 'List'], ['type', 'Task type'], ['tag', 'Tag'],
      ['created_week', 'Created (week)'], ['completed_week', 'Completed (week)'], ['due_month', 'Due (month)']];
    const METRICS = [['count', 'Number of tasks'], ['estimate', 'Sum of estimate'], ['time', 'Sum of tracked time']];
    const SHAPES = [['bar', 'Bar'], ['column', 'Column'], ['pie', 'Pie'], ['battery', 'Battery']];

    function CustomChartCard(props) {
      const [cfg, setCfg] = useCardConfig(props.card);
      const store = useTaskStore();
      const fields = arr(store.fields).filter(f => ['dropdown', 'labels', 'checkbox', 'rating'].includes(f.type));
      const group = cfg.group_by || 'status';
      const metric = cfg.metric || 'count';
      const shape = cfg.shape || 'bar';
      const scope = cfg.scope || 'open';
      const filter = useCardFilter(props);
      const q = useMetric('dash_custom_chart', filter, { group_by: group, metric, scope });
      const d = q.data || {};
      const rows = arr(d.rows).map((r, i) => ({ key: r.key, label: r.label, value: Number(r.value) || 0, color: r.color || SERIES[i % SERIES.length], sub: METRICS.find(m => m[0] === metric)[1] }));
      const fmtV = metric === 'count' ? nfmt : (v) => fmtMinutes(Number(v) || 0);
      const title = cfg.title || ((METRICS.find(m => m[0] === metric) || [])[1] + ' by ' + ((GROUPS.find(g => g[0] === group) || [])[1] || d.field_name || 'field').toLowerCase());
      const settings = (close) => h`<div>
        <label class="cd-lab" style=${{ marginTop: 0 }} for=${'cc-t-' + props.card.id}>Title</label>
        <input id=${'cc-t-' + props.card.id} class="cd-input" value=${cfg.title || ''} placeholder=${title} onInput=${(e) => setCfg({ title: e.target.value })}/>
        <label class="cd-lab" for=${'cc-g-' + props.card.id}>Group by</label>
        <select id=${'cc-g-' + props.card.id} class="cd-sel" value=${group} onChange=${(e) => setCfg({ group_by: e.target.value })}>
          ${GROUPS.map(g => h`<option key=${g[0]} value=${g[0]}>${g[1]}</option>`)}
          ${fields.map(f => h`<option key=${f.id} value=${'field:' + f.id}>${f.name} (field)</option>`)}
        </select>
        <label class="cd-lab" for=${'cc-m-' + props.card.id}>Measure</label>
        <select id=${'cc-m-' + props.card.id} class="cd-sel" value=${metric} onChange=${(e) => setCfg({ metric: e.target.value })}>
          ${METRICS.map(m => h`<option key=${m[0]} value=${m[0]}>${m[1]}</option>`)}
        </select>
        <label class="cd-lab" for=${'cc-s-' + props.card.id}>Tasks</label>
        <select id=${'cc-s-' + props.card.id} class="cd-sel" value=${scope} onChange=${(e) => setCfg({ scope: e.target.value })}>
          <option value="open">Open only</option><option value="closed">Completed only</option><option value="all">All</option>
        </select>
        <label class="cd-lab">Chart</label>
        <div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          ${SHAPES.map(s => h`<button key=${s[0]} class=${'cd-chip' + (shape === s[0] ? ' on' : '')} onClick=${() => setCfg({ shape: s[0] })}>${s[1]}</button>`)}
        </div>
        <div style=${{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button class="cd-btn pri sm" onClick=${close}>Done</button></div>
      </div>`;
      return h`<${Shell} title=${title} icon="ti-chart-histogram" onRefresh=${q.reload} ctl=${props.ctl}
          right=${h`<${CardSettings} title="Chart settings">${settings}<//>`}>
        <${Body} q=${q}>
          ${!rows.length ? h`<${Empty} icon="ti-chart-histogram" title="No tasks match this chart"/>`
          : shape === 'pie' ? h`<${Donut} rows=${rows} valueFmt=${fmtV}/>`
          : shape === 'column' ? h`<${Bars} columns=${true} rows=${rows} valueFmt=${fmtV}/>`
          : shape === 'battery' ? h`<div style=${{ padding: '10px 4px' }}>
              <${Battery} label=${title} segments=${rows.map(r => ({ key: r.key, label: r.label, value: r.value, color: r.color }))}/>
              <div class="cd-legend">${rows.slice(0, 8).map(r => h`<span key=${r.key} style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cu-t2,#5c5c66)' }}>
                <span class="cd-swatch" style=${{ background: r.color }}></span>${r.label} <b style=${{ fontWeight: 600 }}>${fmtV(r.value)}</b></span>`)}</div>
            </div>`
          : h`<${Bars} rows=${rows} valueFmt=${fmtV}/>`}
        <//>
      <//>`;
    }

    function CalculationCard(props) {
      const [cfg, setCfg] = useCardConfig(props.card);
      const store = useTaskStore();
      const fields = arr(store.fields).filter(f => ['number', 'money', 'rating'].includes(f.type));
      const src = cfg.field || 'estimate';
      const op = cfg.op || 'sum';
      const scope = cfg.scope || 'all';
      const filter = useCardFilter(props);
      const q = useMetric('dash_calculation', filter, { field: src, op, scope });
      const d = q.data || {};
      const isMin = d.unit === 'minutes';
      const isMoney = d.unit === 'INR';
      const shown = d.value == null ? '—' : isMin ? fmtMinutes(Math.round(Number(d.value))) : isMoney ? inr(d.value) : nfmt(d.value);
      const title = cfg.title || ((op === 'count' ? 'Count of ' : op.charAt(0).toUpperCase() + op.slice(1) + ' of ') + (d.field_name || 'value'));
      const settings = (close) => h`<div>
        <label class="cd-lab" style=${{ marginTop: 0 }} for=${'ca-t-' + props.card.id}>Title</label>
        <input id=${'ca-t-' + props.card.id} class="cd-input" value=${cfg.title || ''} placeholder=${title} onInput=${(e) => setCfg({ title: e.target.value })}/>
        <label class="cd-lab" for=${'ca-f-' + props.card.id}>Field</label>
        <select id=${'ca-f-' + props.card.id} class="cd-sel" value=${src} onChange=${(e) => setCfg({ field: e.target.value })}>
          <option value="estimate">Time estimate</option><option value="time">Time tracked</option>
          ${fields.map(f => h`<option key=${f.id} value=${f.id}>${f.name}</option>`)}
        </select>
        <label class="cd-lab" for=${'ca-o-' + props.card.id}>Calculation</label>
        <select id=${'ca-o-' + props.card.id} class="cd-sel" value=${op} onChange=${(e) => setCfg({ op: e.target.value })}>
          <option value="sum">Sum</option><option value="avg">Average</option><option value="min">Minimum</option>
          <option value="max">Maximum</option><option value="count">Count of values</option>
        </select>
        <label class="cd-lab" for=${'ca-s-' + props.card.id}>Tasks</label>
        <select id=${'ca-s-' + props.card.id} class="cd-sel" value=${scope} onChange=${(e) => setCfg({ scope: e.target.value })}>
          <option value="all">All</option><option value="open">Open only</option><option value="closed">Completed only</option>
        </select>
        <div style=${{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button class="cd-btn pri sm" onClick=${close}>Done</button></div>
      </div>`;
      return h`<${Shell} title=${title} icon="ti-math-function" onRefresh=${q.reload} ctl=${props.ctl}
          right=${h`<${CardSettings} title="Calculation settings">${settings}<//>`}>
        <${Body} q=${q}>
          <div style=${{ padding: '14px 6px 10px' }}>
            <div class="cd-big" style=${{ fontSize: 34 }}>${shown}</div>
            <div class="cd-muted" style=${{ marginTop: 4 }}>${d.count || 0} of ${d.tasks || 0} tasks have a value</div>
          </div>
        <//>
      <//>`;
    }

    function PortfolioCard(props) {
      const [cfg, setCfg] = useCardConfig(props.card);
      const group = cfg.group || 'client';
      const filter = useCardFilter(props);
      const q = useMetric('dash_portfolio', filter, { group });
      const rows = arr(q.data).slice().sort((a, b) => (Number(a.pct) || 0) - (Number(b.pct) || 0));
      return h`<${Shell} title="Portfolio" icon="ti-layout-list" count=${rows.length ? rows.length + (group === 'client' ? ' clients' : ' lists') : null} onRefresh=${q.reload} ctl=${props.ctl}
          right=${h`<button class="cd-btn sm" onClick=${() => setCfg({ group: group === 'client' ? 'list' : 'client' })}>${group === 'client' ? 'By list' : 'By client'}</button>`}>
        <${Body} q=${q}>
          ${!rows.length ? h`<${Empty} icon="ti-layout-list" title="No tasks in this scope"/>`
          : h`<div>${rows.map(r => h`<div key=${r.id} class="cd-row" aria-label=${r.name + ': ' + r.pct + '% complete, ' + r.total + ' tasks'}>
              <span class="nm" style=${{ maxWidth: 140, flex: '0 0 auto' }} title=${r.client_name && r.client_name !== r.name ? r.client_name + ' · ' + r.name : r.name}>${r.name}</span>
              <span style=${{ flex: 1, minWidth: 60 }}>
                <${Battery} label=${r.name} total=${r.total} segments=${[
                  { key: 'done', label: 'Done', value: r.done, color: 'var(--cd-s3)' },
                  { key: 'active', label: 'In progress', value: r.active, color: 'var(--cd-s1)' },
                  { key: 'todo', label: 'To do', value: r.todo, color: '#87909e' }]}/>
              </span>
              <span style=${{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, minWidth: 40, textAlign: 'right' }}>${r.pct}%</span>
              ${r.overdue > 0 && h`<span class="cd-muted" style=${{ color: '#d03b3b', minWidth: 54, textAlign: 'right' }}>${r.overdue} late</span>`}
            </div>`)}</div>`}
        <//>
      <//>`;
    }

    const safeEmbed = (url) => {
      const u = String(url || '').trim();
      if (!/^https:\/\//i.test(u)) return null;
      try { const p = new URL(u); if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(p.hostname)) return null; return p.href; }
      catch (_) { return null; }
    };
    function EmbedCard(props) {
      const [cfg, setCfg] = useCardConfig(props.card);
      const url = safeEmbed(cfg.url);
      const [draft, setDraft] = useState(cfg.url || '');
      const settings = (close) => h`<div>
        <label class="cd-lab" style=${{ marginTop: 0 }} for=${'em-t-' + props.card.id}>Title</label>
        <input id=${'em-t-' + props.card.id} class="cd-input" value=${cfg.title || ''} placeholder="Embed" onInput=${(e) => setCfg({ title: e.target.value })}/>
        <label class="cd-lab" for=${'em-u-' + props.card.id}>URL (https)</label>
        <input id=${'em-u-' + props.card.id} class="cd-input" value=${draft} placeholder="https://docs.google.com/…" onInput=${(e) => setDraft(e.target.value)}/>
        <label class="cd-lab" for=${'em-h-' + props.card.id}>Height</label>
        <input id=${'em-h-' + props.card.id} class="cd-input" type="number" min="160" max="900" value=${cfg.height || 320} onInput=${(e) => setCfg({ height: clamp(parseInt(e.target.value, 10) || 320, 160, 900) })}/>
        <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
          <button class="cd-btn sm" onClick=${close}>Cancel</button>
          <button class="cd-btn pri sm" onClick=${() => { setCfg({ url: draft.trim() }); close(); }}>Save</button>
        </div>
      </div>`;
      return h`<${Shell} title=${cfg.title || 'Embed'} icon="ti-world-www" ctl=${props.ctl}
          right=${h`<${CardSettings} title="Embed settings">${settings}<//>`}>
        ${url
          ? h`<iframe src=${url} title=${cfg.title || 'Embedded page'} loading="lazy" referrerpolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              style=${{ width: '100%', height: (cfg.height || 320) + 'px', border: '1px solid var(--cu-bd,#e8e8eb)', borderRadius: 6, background: 'var(--cu-bg2,#f7f7f8)' }}></iframe>`
          : h`<div class="cd-empty"><i class="ti ti-world-www"></i><div class="t">No page embedded</div>
              <div style=${{ fontSize: 12 }}>Add an https URL in the card settings.</div></div>`}
      <//>`;
    }

    // ---- card registry -----------------------------------------------------
    const anyRole = (r) => r !== 'client';
    const CARDS = [
      { type: 'status_over_time', name: 'Status over time', icon: 'ti-chart-line', category: 'Analytics', w: 2, desc: 'How open and completed work moved over the period.', roles: anyRole, Component: StatusOverTimeCard },
      { type: 'priority_over_time', name: 'Priority over time', icon: 'ti-flag-3', category: 'Analytics', w: 2, desc: 'Open tasks per priority, day by day.', roles: anyRole, Component: PriorityOverTimeCard },
      { type: 'time_in_status', name: 'Time in status', icon: 'ti-hourglass-high', category: 'Analytics', w: 1, desc: 'Average time tasks sit in each status, overall or per client.', roles: anyRole, Component: TimeInStatusCard },
      { type: 'cycle_lead_time', name: 'Cycle & lead time', icon: 'ti-timeline-event', category: 'Analytics', w: 2, desc: 'How long work takes from brief to done.', roles: anyRole, Component: CycleLeadCard },
      { type: 'completed_report', name: 'Completed report', icon: 'ti-circle-check', category: 'Analytics', w: 2, desc: 'Completed tasks with on-time rate, by day or person.', roles: anyRole, Component: CompletedReportCard },
      { type: 'whos_behind', name: 'Who’s behind', icon: 'ti-alert-hexagon', category: 'Analytics', w: 1, desc: 'People carrying overdue work right now.', roles: anyRole, Component: WhosBehindCard },
      { type: 'unassigned_count', name: 'Unassigned', icon: 'ti-user-question', category: 'Analytics', w: 1, desc: 'Open tasks with nobody assigned.', roles: anyRole, Component: UnassignedCard },
      { type: 'tasks_by_assignee', name: 'Tasks by assignee (battery)', icon: 'ti-battery-3', category: 'Analytics', w: 2, desc: 'To do / in progress / done per person.', roles: anyRole, Component: ByAssigneeCard },
      { type: 'custom_chart', name: 'Custom chart', icon: 'ti-chart-histogram', category: 'Analytics', w: 1, multi: true, desc: 'Pick a field and a measure — bar, column, pie or battery.', roles: anyRole, Component: CustomChartCard },
      { type: 'calculation', name: 'Calculation', icon: 'ti-math-function', category: 'Analytics', w: 1, multi: true, desc: 'Sum or average of a number field, estimate or tracked time.', roles: anyRole, Component: CalculationCard },
      { type: 'portfolio', name: 'Portfolio', icon: 'ti-layout-list', category: 'Analytics', w: 2, multi: true, desc: 'Progress per client or list.', roles: anyRole, Component: PortfolioCard },
      { type: 'embed_card', name: 'Embed', icon: 'ti-world-www', category: 'Analytics', w: 1, multi: true, desc: 'Any https page inside a card.', roles: anyRole, Component: EmbedCard },
    ];
    CARDS.forEach(c => reg('cards', c));

    // =======================================================================
    // Templates
    // =======================================================================
    const card = (type, w, config) => ({ id: uid(), type, w, config: config || {} });
    const TEMPLATES = [
      { key: 'blank', name: 'Blank', icon: 'ti-square-plus', desc: 'Start empty and add the cards you want.', cards: () => [] },
      { key: 'simple', name: 'Simple', icon: 'ti-layout-dashboard', desc: 'Status, completion and what’s unassigned.',
        cards: () => [card('status_over_time', 2), card('unassigned_count', 1), card('custom_chart', 1, { group_by: 'status', shape: 'pie', scope: 'open' }), card('completed_report', 2)] },
      { key: 'team_center', name: 'Team Center', icon: 'ti-users-group', desc: 'Workload, who’s behind and what shipped.',
        cards: () => [card('tasks_by_assignee', 2), card('whos_behind', 1), card('completed_report', 2), card('priority_over_time', 1)] },
      { key: 'time_tracking', name: 'Time Tracking', icon: 'ti-clock-hour-4', desc: 'Estimates against tracked time.',
        cards: () => [card('calculation', 1, { field: 'time', op: 'sum', title: 'Time tracked' }), card('calculation', 1, { field: 'estimate', op: 'sum', title: 'Time estimated' }),
          card('custom_chart', 1, { group_by: 'assignee', metric: 'time', scope: 'all', title: 'Tracked time by person' }),
          card('custom_chart', 2, { group_by: 'client', metric: 'time', scope: 'all', title: 'Tracked time by client' }), card('cycle_lead_time', 2)] },
      { key: 'project', name: 'Project Management', icon: 'ti-checklist', desc: 'Portfolio progress, flow and bottlenecks.',
        cards: () => [card('portfolio', 2, { group: 'list' }), card('time_in_status', 1), card('status_over_time', 2), card('cycle_lead_time', 2), card('unassigned_count', 1)] },
      { key: 'client_report', name: 'Client report', icon: 'ti-presentation', desc: 'What a brand got this period — print-ready.',
        cards: () => [card('completed_report', 2), card('portfolio', 1, { group: 'list' }),
          card('custom_chart', 1, { group_by: 'type', metric: 'count', scope: 'closed', title: 'Delivered by type' }),
          card('status_over_time', 2), card('time_in_status', 1)] },
    ];

    // =======================================================================
    // Canvas (grid + filters) — used by the hub, TV mode and the view renderer
    // =======================================================================
    function FiltersPopover({ filters, setFilters, clients, members, close }) {
      const [q, setQ] = useState('');
      const s = q.trim().toLowerCase();
      const toggle = (key, id) => setFilters(f => {
        const cur = arr(f[key]); return { ...f, [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
      });
      const cl = clientList(clients).filter(c => !s || String(c.name || '').toLowerCase().includes(s));
      const mm = arr(members).filter(m => !s || String(m.name || '').toLowerCase().includes(s));
      return h`<div style=${{ padding: 8, minWidth: 260 }}>
        <label class="cd-lab" style=${{ marginTop: 0 }} for="cd-f-range">Date range</label>
        <select id="cd-f-range" class="cd-sel" value=${filters.range || '30d'} onChange=${(e) => setFilters(f => ({ ...f, range: e.target.value, date_from: null, date_to: null }))}>
          ${RANGES.map(r => h`<option key=${r[0]} value=${r[0]}>${r[1]}</option>`)}
        </select>
        <input class="cd-input" style=${{ marginTop: 10 }} placeholder="Search clients or people" aria-label="Search clients or people"
          value=${q} onInput=${(e) => setQ(e.target.value)}/>
        <div style=${{ maxHeight: 260, overflow: 'auto', marginTop: 6 }}>
          <div class="cd-sec" style=${{ padding: '6px 4px 2px' }}>Clients</div>
          ${cl.length === 0 ? h`<div class="cd-muted" style=${{ padding: '2px 6px' }}>No matches</div>`
            : cl.map(c => h`<label key=${c.id} class="cd-chk">
                <input type="checkbox" checked=${arr(filters.client_ids).includes(c.id)} onChange=${() => toggle('client_ids', c.id)}/>
                <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${c.name}</span></label>`)}
          <div class="cd-sec" style=${{ padding: '8px 4px 2px' }}>Assignees</div>
          ${mm.length === 0 ? h`<div class="cd-muted" style=${{ padding: '2px 6px' }}>No matches</div>`
            : mm.map(m => h`<label key=${m.id} class="cd-chk">
                <input type="checkbox" checked=${arr(filters.assignee_ids).includes(m.id)} onChange=${() => toggle('assignee_ids', m.id)}/>
                <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${m.name}</span></label>`)}
        </div>
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--cu-bd,#e8e8eb)', paddingTop: 8, marginTop: 6 }}>
          <button class="cd-btn sm" onClick=${() => setFilters({ range: '30d', client_ids: [], assignee_ids: [] })}>Reset</button>
          <button class="cd-btn pri sm" onClick=${close}>Done</button>
        </div>
      </div>`;
    }

    function AddCardModal({ onAdd, onClose, role }) {
      const lib = useMemo(() => libraryAll(), []);
      const allowed = arr(lib).filter(c => !c.roles || c.roles(role));
      const cats = [...new Set(allowed.map(c => c.category || 'More'))];
      const [cat, setCat] = useState(cats.includes('Analytics') ? 'Analytics' : cats[0]);
      const boxRef = useRef(null);
      useEffect(() => {
        if (boxRef.current) boxRef.current.focus();
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, []);
      return h`<div class="cd-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="cd-modal" role="dialog" aria-modal="true" aria-label="Add card" tabIndex="-1" ref=${boxRef}>
          <div class="cd-modal-hd">Add card<button class="cd-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button></div>
          <div class="cd-modal-bd">
            <div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }} role="tablist" aria-label="Card categories">
              ${cats.map(k => h`<button key=${k} role="tab" aria-selected=${cat === k ? 'true' : 'false'} class=${'cd-chip' + (cat === k ? ' on' : '')} onClick=${() => setCat(k)}>${k}</button>`)}
            </div>
            <div class="cd-tiles">
              ${allowed.filter(c => (c.category || 'More') === cat).map(c => h`<button key=${c.type} class="cd-tile" onClick=${() => onAdd(c)}>
                <span class="ic"><i class=${'ti ' + (c.icon || 'ti-layout-grid')}></i></span>
                <span class="nm">${c.name}</span>
                <span class="ds">${c.desc || ''}</span>
              </button>`)}
            </div>
          </div>
        </div>
      </div>`;
    }

    function ShareDialog({ dash, onSave, onClose, team, currentUser }) {
      const [vis, setVis] = useState(dash.visibility || 'workspace');
      const [roles, setRoles] = useState(arr(dash.shared_roles));
      const [people, setPeople] = useState(arr(dash.shared_member_ids));
      const [busy, setBusy] = useState(false);
      const ROLE_OPTS = [['admin', 'Admins'], ['manager', 'Managers'], ['accounts_head', 'Accounts'], ['seo', 'SEO'], ['editor', 'Editors'], ['designer', 'Designers'], ['freelancer', 'Freelancers']];
      const members = arr(team).filter(m => m && m.role_level !== 'client' && m.id !== dash.owner_id);
      const save = async () => {
        setBusy(true);
        try { await onSave({ visibility: vis, shared_roles: roles, shared_member_ids: people }); onClose(); }
        finally { setBusy(false); }
      };
      return h`<div class="cd-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="cd-modal" role="dialog" aria-modal="true" aria-label="Share dashboard" style=${{ width: 'min(520px,100%)' }}>
          <div class="cd-modal-hd">Share “${dash.name}”<button class="cd-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button></div>
          <div class="cd-modal-bd">
            <div role="radiogroup" aria-label="Who can see this dashboard">
              ${[['workspace', 'Everyone in the workspace', 'ti-building'], ['custom', 'Only chosen roles and people', 'ti-users'], ['private', 'Private to me', 'ti-lock']].map(o =>
                h`<label key=${o[0]} class="cd-chk" style=${{ padding: '8px 8px' }}>
                  <input type="radio" name="cd-vis" checked=${vis === o[0]} onChange=${() => setVis(o[0])}/>
                  <i class=${'ti ' + o[2]} style=${{ color: 'var(--cu-t3,#8e8e99)' }}></i>${o[1]}</label>`)}
            </div>
            ${vis === 'custom' && h`<div>
              <div class="cd-lab">Roles</div>
              <div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                ${ROLE_OPTS.map(r => h`<button key=${r[0]} class=${'cd-chip' + (roles.includes(r[0]) ? ' on' : '')}
                  aria-pressed=${roles.includes(r[0]) ? 'true' : 'false'}
                  onClick=${() => setRoles(x => (x.includes(r[0]) ? x.filter(y => y !== r[0]) : [...x, r[0]]))}>${r[1]}</button>`)}
              </div>
              <div class="cd-lab">People</div>
              <div style=${{ maxHeight: 200, overflow: 'auto' }}>
                ${members.length === 0 ? h`<div class="cd-muted">No other teammates yet.</div>`
                  : members.map(m => h`<label key=${m.id} class="cd-chk">
                    <input type="checkbox" checked=${people.includes(m.id)} onChange=${() => setPeople(x => (x.includes(m.id) ? x.filter(y => y !== m.id) : [...x, m.id]))}/>
                    ${MemberAvatar ? h`<${MemberAvatar} member=${m} size=${20}/>` : null}${m.name}</label>`)}
              </div>
            </div>`}
            <div class="cd-muted" style=${{ marginTop: 10 }}>The owner can always see and edit. Admins and managers can edit any shared dashboard.</div>
          </div>
          <div class="cd-modal-ft">
            <button class="cd-btn" onClick=${onClose}>Cancel</button>
            <button class="cd-btn pri" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Save sharing'}</button>
          </div>
        </div>
      </div>`;
    }

    // The grid itself (CardGrid from home.js when present, else a local grid).
    function DashboardCanvas({ cards, onChange, editable, filters, tick, currentUser, clients, onNavigate, showToast }) {
      const setCardConfig = useCallback((cardId, patch) => {
        if (typeof onChange !== 'function') return;
        onChange(arr(cards).map(c => (c.id === cardId ? { ...c, config: { ...(c.config || {}), ...patch } } : c)));
      }, [cards, onChange]);
      const ctxValue = useMemo(() => ({ filters: filters || {}, tick: tick || 0, setCardConfig: onChange ? setCardConfig : null }),
        [JSON.stringify(filters || null), tick, setCardConfig, onChange]);
      const gridFilters = { client_ids: arr(filters && filters.client_ids), assignee_ids: arr(filters && filters.assignee_ids) };
      const inner = CardGrid
        ? h`<${CardGrid} cards=${cards} onChange=${onChange} editable=${editable} currentUser=${currentUser} clients=${clients}
            onNavigate=${onNavigate} showToast=${showToast} filters=${gridFilters} tick=${tick}/>`
        : h`<${LocalGrid} cards=${cards} onChange=${onChange} editable=${editable} currentUser=${currentUser} clients=${clients}
            onNavigate=${onNavigate} showToast=${showToast} filters=${gridFilters}/>`;
      return h`<${DashCtx.Provider} value=${ctxValue}>${inner}<//>`;
    }

    // Fallback grid (home.js not loaded) — same card contract, fewer frills.
    function LocalGrid({ cards, onChange, editable, currentUser, clients, onNavigate, showToast, filters }) {
      const role = currentUser && currentUser.role_level;
      const byType = {};
      const lib = libraryAll();
      arr(lib).forEach(c => { byType[c.type] = c; });
      const list = arr(cards).filter(c => c && byType[c.type] && (!byType[c.type].roles || byType[c.type].roles(role)));
      if (!list.length) return h`<${Empty} icon="ti-layout-dashboard" title="No cards yet" sub="Add a card to start building this dashboard."/>`;
      const setW = (id, w) => onChange && onChange(arr(cards).map(c => (c.id === id ? { ...c, w } : c)));
      const remove = (id) => onChange && onChange(arr(cards).filter(c => c.id !== id));
      return h`<div class="cd-grid">
        ${list.map(c => { const def = byType[c.type]; const C = def.Component;
          const ctl = { customize: !!editable, w: c.w, onWidth: (w) => setW(c.id, w), onRemove: () => remove(c.id), onMove: noop };
          return h`<div key=${c.id} class=${'cd-cell w' + ([1, 2, 3].includes(c.w) ? c.w : 1)}>
            <${C} card=${c} ctl=${ctl} currentUser=${currentUser} clients=${clients} onNavigate=${onNavigate} showToast=${showToast} filters=${filters}/>
          </div>`; })}
      </div>`;
    }

    // =======================================================================
    // Dashboards hub page
    // =======================================================================
    const REFRESH_OPTS = [[0, 'Off'], [60, 'Every minute'], [300, 'Every 5 minutes'], [900, 'Every 15 minutes'], [1800, 'Every 30 minutes']];

    function DashboardsPage({ currentUser, clients, team, onNavigate, showToast, params }) {
      const store = useTaskStore();
      const role = currentUser && currentUser.role_level;
      const [list, setList] = useState(null);
      const [listErr, setListErr] = useState(null);
      const [missing, setMissing] = useState(false);
      const [tab, setTab] = useState('all');
      const [openId, setOpenId] = useState((params && params[0]) || null);
      const [dash, setDash] = useState(null);
      const [dashErr, setDashErr] = useState(null);
      const [loadingDash, setLoadingDash] = useState(false);
      const [customize, setCustomize] = useState(false);
      const [showAdd, setShowAdd] = useState(false);
      const [showShare, setShowShare] = useState(false);
      const [confirmDel, setConfirmDel] = useState(false);
      const [showTemplates, setShowTemplates] = useState(false);
      const [tv, setTv] = useState(false);
      const [tick, setTick] = useState(0);
      const [sideOpen, setSideOpen] = useState(false);
      const [renaming, setRenaming] = useState(false);
      const saveTimer = useRef(null);
      const pending = useRef(null);
      const rootRef = useRef(null);
      const members = arr(store.members).length ? arr(store.members) : arr(team);

      // ---- load the list -----------------------------------------------------
      const loadList = useCallback(async () => {
        try { const rows = await DashAPI.list(); setList(arr(rows)); setListErr(null); setMissing(false); }
        catch (e) { if (isMissingRpc(e)) { setMissing(true); setList([]); } else { setListErr(e); setList([]); } }
      }, []);
      useEffect(() => { loadList(); }, [loadList]);

      // ---- open one ----------------------------------------------------------
      const openDash = useCallback(async (id, { push = true } = {}) => {
        setOpenId(id); setCustomize(false); setDashErr(null);
        if (!id) { setDash(null); if (push) { try { if (location.hash !== '#/dashboards') location.hash = '#/dashboards'; } catch (_) {} } return; }
        setLoadingDash(true);
        try {
          const d = await DashAPI.get(id);
          setDash(d); setDashErr(null);
          if (push) { try { const want = '#/dashboards/' + id; if (location.hash !== want) location.hash = want; } catch (_) {} }
        } catch (e) { setDash(null); setDashErr(e); }
        setLoadingDash(false);
      }, []);
      useEffect(() => {
        const p = (params && params[0]) || null;
        if (p && p !== (dash && dash.id)) openDash(p, { push: false });
        if (!p && dash) { setDash(null); setOpenId(null); }
      }, [(params && params[0]) || '']);

      // ---- save (debounced) --------------------------------------------------
      const flush = useCallback(async () => {
        if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
        const payload = pending.current; pending.current = null;
        if (!payload) return;
        try { const d = await DashAPI.upsert(payload); setDash(cur => (cur && cur.id === d.id ? { ...cur, ...d } : cur)); loadList(); }
        catch (e) { toast(showToast, 'Couldn’t save the dashboard: ' + errMsg(e)); }
      }, [loadList, showToast]);
      useEffect(() => () => { if (pending.current) flush(); }, [flush]);
      const patch = useCallback((p, { now = false } = {}) => {
        setDash(cur => (cur ? { ...cur, ...p } : cur));
        const id = dash && dash.id; if (!id) return;
        pending.current = { ...(pending.current || {}), ...p, id };
        if (saveTimer.current) clearTimeout(saveTimer.current);
        if (now) flush(); else saveTimer.current = setTimeout(flush, 700);
      }, [dash && dash.id, flush]);

      // ---- auto refresh ------------------------------------------------------
      useEffect(() => {
        const secs = (dash && dash.refresh_seconds) || 0;
        if (!secs) return undefined;
        const iv = setInterval(() => { if (document.visibilityState === 'visible') setTick(t => t + 1); }, secs * 1000);
        return () => clearInterval(iv);
      }, [dash && dash.refresh_seconds, dash && dash.id]);

      // ---- create ------------------------------------------------------------
      const create = async (tpl, name) => {
        try {
          const d = await DashAPI.upsert({
            name: name || (tpl.key === 'blank' ? 'New dashboard' : tpl.name),
            template: tpl.key, cards: tpl.cards(), filters: { range: '30d' }, visibility: 'workspace',
          });
          setShowTemplates(false);
          await loadList();
          setDash(d); setOpenId(d.id); setCustomize(tpl.key === 'blank');
          try { location.hash = '#/dashboards/' + d.id; } catch (_) {}
          toast(showToast, 'Dashboard created');
        } catch (e) { toast(showToast, isMissingRpc(e) ? 'Dashboards need migration 096' : 'Couldn’t create: ' + errMsg(e)); }
      };

      const duplicate = async () => {
        if (!dash) return;
        try { const d = await DashAPI.duplicate(dash.id); await loadList(); setDash(d); setOpenId(d.id); try { location.hash = '#/dashboards/' + d.id; } catch (_) {} toast(showToast, 'Duplicated as a private copy'); }
        catch (e) { toast(showToast, 'Couldn’t duplicate: ' + errMsg(e)); }
      };
      const remove = async () => {
        if (!dash) return;
        try { await DashAPI.remove(dash.id); setConfirmDel(false); setDash(null); setOpenId(null); try { location.hash = '#/dashboards'; } catch (_) {} loadList(); toast(showToast, 'Dashboard deleted'); }
        catch (e) { setConfirmDel(false); toast(showToast, 'Couldn’t delete: ' + errMsg(e)); }
      };
      const toggleFav = async (d) => {
        try {
          const r = await DashAPI.favorite(d.id, d.name);
          setList(rows => arr(rows).map(x => (x.id === d.id ? { ...x, is_favorite: !!(r && r.on) } : x)));
          if (dash && dash.id === d.id) setDash(cur => ({ ...cur, is_favorite: !!(r && r.on) }));
        } catch (e) { toast(showToast, 'Couldn’t update favorites: ' + errMsg(e)); }
      };

      // ---- print -------------------------------------------------------------
      const print = () => {
        const root = rootRef.current;
        if (!root) { window.print(); return; }
        root.classList.add('cd-print-root');
        document.body.classList.add('cd-printing');
        const done = () => { document.body.classList.remove('cd-printing'); root.classList.remove('cd-print-root'); window.removeEventListener('afterprint', done); };
        window.addEventListener('afterprint', done);
        setTimeout(() => { window.print(); setTimeout(done, 1500); }, 60);
      };

      // ---- TV mode -----------------------------------------------------------
      const enterTv = () => {
        setTv(true); setCustomize(false);
        const el = rootRef.current;
        if (el && el.requestFullscreen) { try { el.requestFullscreen(); } catch (_) {} }
      };
      const exitTv = useCallback(() => {
        setTv(false);
        if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (_) {} }
      }, []);
      useEffect(() => {
        if (!tv) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') exitTv(); };
        const onFs = () => { if (!document.fullscreenElement) setTv(false); };
        window.addEventListener('keydown', onKey);
        document.addEventListener('fullscreenchange', onFs);
        return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFs); };
      }, [tv, exitTv]);

      // ---- lists -------------------------------------------------------------
      const meId = (store.me && store.me.id) || (currentUser && currentUser.id);
      const rows = arr(list);
      const shown = useMemo(() => {
        const f = tab === 'my' ? rows.filter(d => d.is_owner)
          : tab === 'shared' ? rows.filter(d => !d.is_owner)
          : tab === 'private' ? rows.filter(d => d.visibility === 'private')
          : tab === 'fav' ? rows.filter(d => d.is_favorite)
          : rows;
        return f.slice().sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
      }, [rows, tab, meId]);
      const counts = {
        all: rows.length, my: rows.filter(d => d.is_owner).length, shared: rows.filter(d => !d.is_owner).length,
        private: rows.filter(d => d.visibility === 'private').length, fav: rows.filter(d => d.is_favorite).length,
      };
      const TABS = [['all', 'All dashboards', 'ti-layout-dashboard'], ['my', 'My dashboards', 'ti-user'],
        ['shared', 'Shared with me', 'ti-users'], ['private', 'Private', 'ti-lock'], ['fav', 'Favorites', 'ti-star']];

      const filters = (dash && dash.filters) || {};
      const setFilters = (fn) => {
        const next = typeof fn === 'function' ? fn(filters) : fn;
        patch({ filters: next });
      };
      const filterCount = arr(filters.client_ids).length + arr(filters.assignee_ids).length;
      const canEdit = !!(dash && dash.can_edit);

      const side = h`<aside class=${'cd-side' + (sideOpen ? ' open' : '')}>
        <div class="cd-side-hd"><i class="ti ti-layout-dashboard"></i>Dashboards
          <button class="cd-ibtn" style=${{ marginLeft: 'auto' }} aria-label="New dashboard" title="New dashboard" onClick=${() => setShowTemplates(true)}><i class="ti ti-plus"></i></button>
        </div>
        <div class="cd-side-list">
          ${TABS.map(t => h`<button key=${t[0]} class=${'cd-tab' + (tab === t[0] ? ' on' : '')} onClick=${() => { setTab(t[0]); setSideOpen(false); }}>
            <i class=${'ti ' + t[2]}></i>${t[1]}<span class="n">${counts[t[0]] || 0}</span></button>`)}
          <div class="cd-sec">${(TABS.find(t => t[0] === tab) || [])[1]}</div>
          ${list === null ? h`<${Loading} rows=${4}/>`
            : shown.length === 0 ? h`<div class="cd-muted" style=${{ padding: '6px 9px' }}>${missing ? 'Not available yet.' : 'Nothing here yet.'}</div>`
            : shown.map(d => h`<div key=${d.id} class=${'cd-item' + (openId === d.id ? ' on' : '')}>
                <i class=${'ti ' + (d.icon || 'ti-layout-dashboard')} style=${{ color: d.color || 'var(--cu-t3,#8e8e99)' }}></i>
                <button class="nm" style=${{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
                  onClick=${() => { openDash(d.id); setSideOpen(false); }}>${d.name}</button>
                ${d.visibility === 'private' && h`<i class="ti ti-lock cd-muted" title="Private"></i>`}
                <button class=${'star' + (d.is_favorite ? ' on' : '')} aria-label=${(d.is_favorite ? 'Remove from' : 'Add to') + ' favorites'}
                  onClick=${(e) => { e.stopPropagation(); toggleFav(d); }}><i class=${'ti ' + (d.is_favorite ? 'ti-star-filled' : 'ti-star')}></i></button>
              </div>`)}
        </div>
      </aside>`;

      const toolbar = dash && h`<div class="cd-tools">
        ${Popover ? h`<${PopBtn} className=${'cd-btn' + (filterCount ? ' on' : '')} icon="ti-filter" label=${rangeLabel(filters.range || '30d')} badge=${filterCount || null} width=${300}>
            ${(close) => h`<${FiltersPopover} filters=${filters} setFilters=${setFilters} clients=${arr(store.clients).length ? store.clients : clients} members=${members} close=${close}/>`}
          <//>`
          : h`<select class="cd-sel" style=${{ width: 150 }} aria-label="Date range" value=${filters.range || '30d'} onChange=${(e) => setFilters(f => ({ ...f, range: e.target.value }))}>
              ${RANGES.map(r => h`<option key=${r[0]} value=${r[0]}>${r[1]}</option>`)}</select>`}
        <button class="cd-btn" onClick=${() => setTick(t => t + 1)} title="Refresh now"><i class="ti ti-refresh"></i><span class="cd-hide-sm">Refresh</span></button>
        ${canEdit && h`<${PopBtn} className="cd-btn" icon="ti-clock-play" label=${((REFRESH_OPTS.find(o => o[0] === (dash.refresh_seconds || 0)) || [])[1]) || 'Off'} width=${220}>
          ${(close) => h`<div style=${{ padding: 4 }}>
            <div class="cd-sec" style=${{ padding: '4px 8px' }}>Auto refresh</div>
            ${REFRESH_OPTS.map(o => h`<button key=${o[0]} class="cd-item" onClick=${() => { patch({ refresh_seconds: o[0] }, { now: true }); close(); }}>
              <span class="nm">${o[1]}</span>${(dash.refresh_seconds || 0) === o[0] && h`<i class="ti ti-check"></i>`}</button>`)}
          </div>`}
        <//>`}
        ${canEdit && h`<button class=${'cd-btn' + (customize ? ' on' : '')} aria-pressed=${customize ? 'true' : 'false'}
          onClick=${() => { if (customize) flush(); setCustomize(c => !c); }}>
          <i class=${'ti ' + (customize ? 'ti-check' : 'ti-layout-grid-add')}></i>${customize ? 'Done' : 'Customize'}</button>`}
        ${canEdit && h`<button class="cd-btn pri" onClick=${() => setShowAdd(true)}><i class="ti ti-plus"></i>Add card</button>`}
        <${PopBtn} className="cd-ibtn" icon="ti-dots-vertical" title="Dashboard menu" width=${240}>
          ${(close) => h`<div style=${{ padding: 4 }}>
            <button class="cd-item" onClick=${() => { close(); toggleFav(dash); }}>
              <i class=${'ti ' + (dash.is_favorite ? 'ti-star-filled' : 'ti-star')}></i><span class="nm">${dash.is_favorite ? 'Remove from favorites' : 'Add to favorites'}</span></button>
            <button class="cd-item" onClick=${() => { close(); enterTv(); }}><i class="ti ti-device-tv"></i><span class="nm">TV mode</span></button>
            <button class="cd-item" onClick=${() => { close(); print(); }}><i class="ti ti-printer"></i><span class="nm">Print</span></button>
            <button class="cd-item" onClick=${() => { close(); duplicate(); }}><i class="ti ti-copy"></i><span class="nm">Duplicate</span></button>
            ${dash.can_share && h`<button class="cd-item" onClick=${() => { close(); setShowShare(true); }}><i class="ti ti-share"></i><span class="nm">Share…</span></button>`}
            ${canEdit && h`<button class="cd-item" onClick=${() => { close(); setRenaming(true); }}><i class="ti ti-pencil"></i><span class="nm">Rename</span></button>`}
            ${(dash.is_owner || isPrivilegedRole(role)) && h`<button class="cd-item" style=${{ color: '#d03b3b' }} onClick=${() => { close(); setConfirmDel(true); }}>
              <i class="ti ti-trash"></i><span class="nm">Delete</span></button>`}
          </div>`}
        <//>
      </div>`;

      const canvas = dash && h`<${DashboardCanvas} cards=${arr(dash.cards)} onChange=${canEdit ? ((cards) => patch({ cards })) : null}
        editable=${customize} filters=${filters} tick=${tick} currentUser=${currentUser} clients=${clients}
        onNavigate=${onNavigate} showToast=${showToast}/>`;

      return h`<div class="cd-page" ref=${rootRef}>
        <div class="cd-hd">
          <button class="cd-ibtn cd-hide-print" style=${{ display: 'none' }} id="cd-side-toggle" aria-label="Dashboard list" onClick=${() => setSideOpen(v => !v)}><i class="ti ti-menu-2"></i></button>
          <div class="cd-title">
            ${dash ? h`${renaming && canEdit
                ? h`<input autoFocus value=${dash.name} aria-label="Dashboard name"
                    onInput=${(e) => setDash(cur => ({ ...cur, name: e.target.value }))}
                    onBlur=${(e) => { setRenaming(false); patch({ name: e.target.value.trim() || dash.name }, { now: true }); }}
                    onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setRenaming(false); openDash(dash.id, { push: false }); } }}/>`
                : h`<${Fragment}>
                    <button class="cd-ibtn" aria-label="Back to all dashboards" title="All dashboards" onClick=${() => openDash(null)}><i class="ti ti-chevron-left"></i></button>
                    <i class=${'ti ' + (dash.icon || 'ti-layout-dashboard')} style=${{ color: dash.color || 'var(--cu-accent-ink,#a8009c)' }}></i>
                    <span class="nm" onDoubleClick=${() => canEdit && setRenaming(true)}>${dash.name}</span>
                    ${dash.visibility === 'private' && h`<i class="ti ti-lock cd-muted" title="Private"></i>`}
                    ${!dash.is_owner && dash.owner && h`<span class="cd-muted">· ${dash.owner.name}</span>`}
                  <//>`}`
              : h`<${Fragment}><i class="ti ti-layout-dashboard"></i><span class="nm">Dashboards</span><//>`}
          </div>
          ${dash ? toolbar : h`<div class="cd-tools">
            <button class="cd-btn" onClick=${loadList}><i class="ti ti-refresh"></i>Refresh</button>
            <button class="cd-btn pri" onClick=${() => setShowTemplates(true)}><i class="ti ti-plus"></i>New dashboard</button>
          </div>`}
        </div>

        <div class="cd-body">
          ${side}
          <div class="cd-main">
            <div class="cd-scroll">
              ${missing && !dash ? h`<div class="cd-empty" style=${{ padding: '60px 16px' }}>
                  <i class="ti ti-database-off"></i><div class="t" style=${{ fontSize: 15 }}>Dashboards aren’t switched on yet</div>
                  <div style=${{ fontSize: 12.5, maxWidth: 360 }}>Apply migration 096 (dashboards, goals and teams) in Supabase and reload — your analytics cards will start working straight away.</div>
                </div>`
              : listErr && !dash ? h`<${ErrBox} error=${listErr} onRetry=${loadList}/>`
              : loadingDash ? h`<${Loading} rows=${6}/>`
              : dashErr ? h`<${ErrBox} error=${dashErr} onRetry=${() => openDash(openId, { push: false })}/>`
              : dash ? canvas
              : h`<${Fragment}>
                  ${shown.length === 0
                    ? h`<div class="cd-empty" style=${{ padding: '46px 16px' }}>
                        <i class="ti ti-layout-dashboard"></i>
                        <div class="t" style=${{ fontSize: 15 }}>No dashboards yet</div>
                        <div style=${{ fontSize: 12.5, maxWidth: 340 }}>Build a live view of the work — status over time, who’s behind, time in status, completion rates and custom charts.</div>
                        <button class="cd-btn pri" style=${{ marginTop: 8 }} onClick=${() => setShowTemplates(true)}><i class="ti ti-plus"></i>New dashboard</button>
                      </div>`
                    : h`<div class="cd-tiles">
                        ${shown.map(d => h`<button key=${d.id} class="cd-tile" onClick=${() => openDash(d.id)}>
                          <span class="ic"><i class=${'ti ' + (d.icon || 'ti-layout-dashboard')}></i></span>
                          <span class="nm">${d.name}${d.is_favorite ? h` <i class="ti ti-star-filled" style=${{ color: '#f5a623', fontSize: 12 }}></i>` : ''}</span>
                          <span class="ds">${d.description || (d.card_count || 0) + ' card' + ((d.card_count || 0) === 1 ? '' : 's')}</span>
                          <span class="cd-muted">${d.is_owner ? 'You' : (d.owner && d.owner.name) || 'Shared'} · ${d.updated_at ? fmtRelative(d.updated_at) : ''}</span>
                        </button>`)}
                      </div>`}
                <//>`}
            </div>
          </div>
        </div>

        ${showTemplates && h`<div class="cd-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) setShowTemplates(false); }}>
          <div class="cd-modal" role="dialog" aria-modal="true" aria-label="New dashboard">
            <div class="cd-modal-hd">New dashboard<button class="cd-ibtn" aria-label="Close" onClick=${() => setShowTemplates(false)}><i class="ti ti-x"></i></button></div>
            <div class="cd-modal-bd">
              <div class="cd-tiles">
                ${TEMPLATES.map(t => h`<button key=${t.key} class="cd-tile" onClick=${() => create(t)}>
                  <span class="ic"><i class=${'ti ' + t.icon}></i></span>
                  <span class="nm">${t.name}</span><span class="ds">${t.desc}</span>
                </button>`)}
              </div>
            </div>
          </div>
        </div>`}

        ${showAdd && dash && h`<${AddCardModal} role=${role} onClose=${() => setShowAdd(false)} onAdd=${(c) => {
          const cards = arr(dash.cards);
          if (!c.multi && cards.some(x => x.type === c.type)) { toast(showToast, c.name + ' is already on this dashboard'); return; }
          patch({ cards: [...cards, { id: uid(), type: c.type, w: c.w || 1, config: {} }] }, { now: true });
          setShowAdd(false); toast(showToast, c.name + ' added');
        }}/>`}

        ${showShare && dash && h`<${ShareDialog} dash=${dash} team=${members} currentUser=${currentUser} onClose=${() => setShowShare(false)}
          onSave=${async (p) => { await DashAPI.upsert({ id: dash.id, ...p }).then(d => { setDash(d); loadList(); toast(showToast, 'Sharing updated'); })
            .catch(e => toast(showToast, 'Couldn’t update sharing: ' + errMsg(e))); }}/>`}

        ${confirmDel && dash && (ConfirmDialog
          ? h`<${ConfirmDialog} open=${true} title=${'Delete “' + dash.name + '”?'} body="The dashboard is removed for everyone it was shared with. This can’t be undone."
              confirmLabel="Delete" danger=${true} onConfirm=${remove} onCancel=${() => setConfirmDel(false)}/>`
          : h`<div class="cd-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) setConfirmDel(false); }}>
              <div class="cd-modal" style=${{ width: 'min(420px,100%)' }} role="dialog" aria-modal="true">
                <div class="cd-modal-hd">Delete “${dash.name}”?</div>
                <div class="cd-modal-bd">The dashboard is removed for everyone it was shared with. This can’t be undone.</div>
                <div class="cd-modal-ft"><button class="cd-btn" onClick=${() => setConfirmDel(false)}>Cancel</button>
                  <button class="cd-btn pri" style=${{ background: '#d03b3b', borderColor: '#d03b3b' }} onClick=${remove}>Delete</button></div>
              </div>
            </div>`)}

        ${tv && dash && h`<div class="cd-tv">
          <div style=${{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <i class=${'ti ' + (dash.icon || 'ti-layout-dashboard')} style=${{ fontSize: 22, color: dash.color || 'var(--cu-accent,#ff00ee)' }}></i>
            <span style=${{ font: '600 22px Inter,system-ui,sans-serif' }}>${dash.name}</span>
            <span class="cd-muted" style=${{ marginLeft: 'auto' }}>${rangeLabel(filters.range || '30d')} · updated ${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
            <button class="cd-btn" onClick=${exitTv}><i class="ti ti-x"></i>Exit</button>
          </div>
          <${DashboardCanvas} cards=${arr(dash.cards)} onChange=${null} editable=${false} filters=${filters} tick=${tick}
            currentUser=${currentUser} clients=${clients} onNavigate=${onNavigate} showToast=${showToast}/>
        </div>`}
      </div>`;
    }

    // Small popover button used by the toolbar (kept local so it works without shell.js).
    function PopBtn({ className, label, icon, title, width, badge, children }) {
      const ref = useRef(null);
      const [open, setOpen] = useState(false);
      const close = useCallback(() => setOpen(false), []);
      return h`<${Fragment}>
        <button ref=${ref} class=${className || 'cd-btn'} title=${title || ''} aria-label=${title || label || undefined}
          aria-haspopup="true" aria-expanded=${open ? 'true' : 'false'} onClick=${(e) => { e.stopPropagation(); setOpen(o => !o); }}>
          ${icon && h`<i class=${'ti ' + icon}></i>`}${label}${badge ? h`<span class="cd-chip on" style=${{ height: 18, padding: '0 6px' }}>${badge}</span>` : null}
        </button>
        ${open && Popover && h`<${Popover} anchor=${ref.current} open=${open} onClose=${close} width=${width}>
          <div onClick=${(e) => e.stopPropagation()}>${children(close)}</div>
        <//>`}
        ${open && !Popover && h`<div class="cd-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) close(); }}>
          <div class="cd-modal" style=${{ width: 'min(420px,100%)' }}>${children(close)}</div>
        </div>`}
      <//>`;
    }

    // =======================================================================
    // views.js renderer — a saved view whose type is `dashboard`
    // =======================================================================
    function DashboardViewRenderer({ config, setConfig, scope, currentUser, showToast }) {
      const cfg = config || {};
      const [list, setList] = useState(null);
      const [dash, setDash] = useState(null);
      const [err, setErr] = useState(null);
      const [missing, setMissing] = useState(false);
      const [tick, setTick] = useState(0);
      const id = cfg.dashboard_id || null;
      useEffect(() => {
        let alive = true;
        if (id) {
          DashAPI.get(id).then(d => { if (alive) { setDash(d); setErr(null); } })
            .catch(e => { if (!alive) return; if (isMissingRpc(e)) setMissing(true); else setErr(e); });
        } else {
          DashAPI.list().then(rows => { if (alive) setList(arr(rows)); })
            .catch(e => { if (!alive) return; if (isMissingRpc(e)) setMissing(true); else setErr(e); });
        }
        return () => { alive = false; };
      }, [id, tick]);
      const scopeFilters = useMemo(() => {
        const f = { ...((dash && dash.filters) || {}) };
        if (scope && scope.clientId) f.client_ids = [scope.clientId];
        if (scope && scope.listId) f.list_ids = [scope.listId];
        return f;
      }, [dash && dash.id, JSON.stringify((dash && dash.filters) || null), scope && scope.clientId, scope && scope.listId]);

      if (missing) return h`<div style=${{ padding: 24 }}><${NotReady} what="Dashboards aren’t switched on yet"/></div>`;
      if (err) return h`<div style=${{ padding: 24 }}><${ErrBox} error=${err} onRetry=${() => setTick(t => t + 1)}/></div>`;
      if (!id) {
        return h`<div style=${{ padding: 24 }}>
          <div class="cd-title" style=${{ marginBottom: 10 }}><i class="ti ti-layout-dashboard"></i>Pick a dashboard</div>
          <div class="cd-muted" style=${{ marginBottom: 12 }}>This view shows a dashboard, filtered to ${scope && scope.title ? scope.title : 'this space'}.</div>
          ${list === null ? h`<${Loading} rows=${4}/>`
            : list.length === 0 ? h`<${Empty} icon="ti-layout-dashboard" title="No dashboards yet" sub="Create one from the Dashboards page first."/>`
            : h`<div class="cd-tiles">${list.map(d => h`<button key=${d.id} class="cd-tile" onClick=${() => setConfig && setConfig({ dashboard_id: d.id })}>
                <span class="ic"><i class=${'ti ' + (d.icon || 'ti-layout-dashboard')}></i></span>
                <span class="nm">${d.name}</span><span class="ds">${(d.card_count || 0) + ' cards'}</span></button>`)}</div>`}
        </div>`;
      }
      if (!dash) return h`<div style=${{ padding: 24 }}><${Loading} rows=${5}/></div>`;
      return h`<div style=${{ padding: '16px 18px 26px' }}>
        <div style=${{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <i class=${'ti ' + (dash.icon || 'ti-layout-dashboard')} style=${{ color: dash.color || 'var(--cu-accent-ink,#a8009c)' }}></i>
          <span style=${{ font: '600 15px Inter,system-ui,sans-serif' }}>${dash.name}</span>
          <span class="cd-muted">${rangeLabel(scopeFilters.range || '30d')}</span>
          <span style=${{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
            <button class="cd-btn sm" onClick=${() => setTick(t => t + 1)}><i class="ti ti-refresh"></i>Refresh</button>
            ${setConfig && h`<button class="cd-btn sm" onClick=${() => { setDash(null); setConfig({ dashboard_id: null }); }}><i class="ti ti-exchange"></i>Change</button>`}
          </span>
        </div>
        <${DashboardCanvas} cards=${arr(dash.cards)} onChange=${null} editable=${false} filters=${scopeFilters} tick=${tick}
          currentUser=${currentUser} clients=${null} onNavigate=${null} showToast=${showToast}/>
      </div>`;
    }

    // =======================================================================
    // Registrations
    // =======================================================================
    reg('pages', {
      id: 'dashboards', label: 'Dashboards', icon: 'ti-layout-dashboard', section: 'more', order: 60,
      apps: ['dashboard', 'tasks'], fullHeight: true,
      roles: (r) => r && r !== 'client',
      Component: DashboardsPage,
    });

    reg('views', {
      key: 'dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard',
      desc: 'Charts and reports for this space', Component: DashboardViewRenderer,
    });

    reg('createItems', {
      key: 'dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard', order: 72,
      roles: (r) => r && r !== 'client',
      run: ({ onNavigate }) => { try { location.hash = '#/dashboards'; } catch (_) {} if (onNavigate) onNavigate('dashboards'); },
    });

    // ⌘K provider — cached list, filtered locally.
    let palCache = { at: 0, rows: [] };
    reg('paletteProviders', {
      id: 'dashboards', label: 'Dashboards', icon: 'ti-layout-dashboard',
      roles: (r) => r && r !== 'client',
      search: async (q) => {
        const now = Date.now();
        if (now - palCache.at > 120000) {
          try { palCache = { at: now, rows: arr(await DashAPI.list()) }; }
          catch (_) { palCache = { at: now, rows: [] }; }
        }
        const s = String(q || '').trim().toLowerCase();
        return palCache.rows
          .filter(d => !s || String(d.name || '').toLowerCase().includes(s))
          .slice(0, 20)
          .map(d => ({
            id: d.id, label: d.name, icon: d.icon || 'ti-layout-dashboard',
            sub: (d.is_owner ? 'My dashboard' : (d.owner && d.owner.name) || 'Shared') + ' · ' + ((d.card_count || 0) + ' cards'),
            run: () => { try { location.hash = '#/dashboards/' + d.id; } catch (_) {} },
          }));
      },
    });

    return {
      DashboardsPage, DashboardCanvas, DashboardViewRenderer, DashAPI, CARDS, TEMPLATES,
      LineChart, Bars, Donut, Battery, ChartFrame, useMetric, useCardFilter, useCardConfig, DashCtx, SERIES,
    };
  }

  window.AMS_DASHBOARDS = { buildDashboards };
})();

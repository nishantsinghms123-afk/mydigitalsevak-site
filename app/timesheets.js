/* ============================================================================
 * timesheets.js — ClickUp-parity v2, workstream I: time.
 *
 *   window.AMS_TIMESHEETS.buildTimesheets(deps) →
 *     { TimesheetsPage, WeekGrid, CARD_TYPES }
 *
 * Registers into window.AMS_EXT:
 *   pages  → { id:'timesheets' }  (rail, every staff role, route #/timesheets/<tab>)
 *   cards  → time_report · timesheet_status · billable_month · time_estimate_tracked
 *
 * Server: migration 099_time_billing.sql (timesheet_week_get/save/submit/withdraw,
 * timesheet_review, timesheets_list, time_entries_list/add/update/delete,
 * time_report, time_estimate_vs_tracked, time_rates_*, time_billable_summary).
 * Everything fails open: when an RPC is missing the surface shows an empty state
 * instead of crashing, so the frontend can ship before the migration is applied.
 *
 * Spec: docs/clickup-parity-v2-contract.md §4 "I — time" (+ v1 §0–§1 conventions).
 * ==========================================================================*/
(function () {
  function buildTimesheets(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo,
            rpcCall, Av, Skel, fmtRelative, isPrivilegedRole,
            TaskAPI, taskBus, useTaskStore, openTask,
            MemberAvatar, ClientBadge, EmptyState, SectionCard, CardShell,
            fmtMinutes: fmtMinutesDep, parseMinutes: parseMinutesDep } = deps;
    const Fragment = React.Fragment;

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-ts-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-ts-styles';
      st.textContent = `
      :where(:root){--cu-bg:#ffffff;--cu-bg2:#f7f7f8;--cu-bg3:#efeff1;--cu-bd:#e8e8eb;--cu-bd2:#d6d6db;--cu-t1:#1f1f23;--cu-t2:#5c5c66;--cu-t3:#8e8e99;--cu-accent:#ff00ee;--cu-accent-ink:#a8009c;--cu-accent-fog:rgba(255,0,238,.08);--cu-shadow:0 8px 28px rgba(15,15,20,.14),0 2px 6px rgba(15,15,20,.06);--cu-radius:8px;--cu-radius-sm:6px}
      :where(html.dark){--cu-bg:#1c1b1f;--cu-bg2:#161518;--cu-bg3:#26252a;--cu-bd:#2d2c31;--cu-bd2:#3b3a40;--cu-t1:#ececef;--cu-t2:#a9a8b1;--cu-t3:#75747d;--cu-accent:#ff66f5;--cu-accent-ink:#ff7df6;--cu-accent-fog:rgba(255,102,245,.12);--cu-shadow:0 10px 30px rgba(0,0,0,.55)}
      .ts-page{padding:24px;box-sizing:border-box;min-height:100%;background:var(--cu-bg);color:var(--cu-t1);font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px}
      .ts-page *,.ts-modal *,.ts-pop *{box-sizing:border-box}
      .ts-page :focus-visible,.ts-modal :focus-visible{outline:2px solid var(--cu-accent);outline-offset:1px}
      .ts-head{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:14px}
      .ts-title{font:600 18px/1.3 Inter,system-ui,sans-serif;margin:0;display:flex;align-items:center;gap:8px}
      .ts-sub{font-size:12.5px;color:var(--cu-t3);margin-top:3px}
      .ts-tabs{display:flex;gap:18px;border-bottom:1px solid var(--cu-bd);margin-bottom:14px;overflow-x:auto;scrollbar-width:none}
      .ts-tab{background:none;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;padding:8px 0;font:500 13px Inter,system-ui,sans-serif;color:var(--cu-t2);cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
      .ts-tab:hover{color:var(--cu-t1)}
      .ts-tab.on{color:var(--cu-t1);font-weight:600;border-bottom-color:var(--cu-accent)}
      .ts-tab .n{font-size:11px;font-weight:600;background:var(--cu-bg3);color:var(--cu-t2);border-radius:9px;padding:1px 6px}
      .ts-tab.on .n{background:var(--cu-accent-fog);color:var(--cu-accent-ink)}
      .ts-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:var(--cu-radius-sm);border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t1);font:600 13px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
      .ts-btn:hover:not(:disabled){background:var(--cu-bg3)}
      .ts-btn:disabled{opacity:.5;cursor:not-allowed}
      .ts-btn.pri{background:var(--cu-accent);border-color:var(--cu-accent);color:#fff}
      .ts-btn.pri:hover:not(:disabled){filter:brightness(.94)}
      .ts-btn.sm{height:26px;padding:0 9px;font-size:12px}
      .ts-btn.danger{color:#e5484d;border-color:rgba(229,72,77,.35)}
      .ts-ibtn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--cu-radius-sm);border:0;background:transparent;color:var(--cu-t2);cursor:pointer;font-size:15px;flex-shrink:0}
      .ts-ibtn:hover:not(:disabled){background:var(--cu-bg3);color:var(--cu-t1)}
      .ts-ibtn:disabled{opacity:.35;cursor:not-allowed}
      .ts-link{background:none;border:0;padding:0;color:var(--cu-accent-ink);font:600 12px Inter,system-ui,sans-serif;cursor:pointer}
      .ts-link:hover{text-decoration:underline}
      .ts-input,.ts-select{height:30px;border:1px solid var(--cu-bd2);border-radius:var(--cu-radius-sm);background:var(--cu-bg);color:var(--cu-t1);padding:0 9px;font:13px Inter,system-ui,sans-serif;max-width:100%}
      .ts-input:focus,.ts-select:focus{border-color:var(--cu-accent);outline:none}
      .ts-lbl{display:block;font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3);margin:0 0 5px}
      .ts-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
      .ts-muted{color:var(--cu-t3);font-size:12px}
      .ts-card{background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius)}
      .ts-scroll{overflow-x:auto;border:1px solid var(--cu-bd);border-radius:var(--cu-radius);background:var(--cu-bg)}
      table.ts-tbl{width:100%;border-collapse:collapse;font-size:13px}
      table.ts-tbl th{position:sticky;top:0;background:var(--cu-bg2);color:var(--cu-t3);font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;text-align:left;padding:9px 10px;white-space:nowrap;z-index:2}
      table.ts-tbl td{padding:7px 10px;border-top:1px solid var(--cu-bd);vertical-align:middle}
      table.ts-tbl td.num,table.ts-tbl th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      table.ts-tbl tr.clickable{cursor:pointer}
      table.ts-tbl tr.clickable:hover td{background:var(--cu-bg3)}
      .ts-grid-wrap{overflow-x:auto;border:1px solid var(--cu-bd);border-radius:var(--cu-radius);background:var(--cu-bg)}
      table.ts-grid{border-collapse:separate;border-spacing:0;min-width:720px;width:100%;font-size:13px}
      table.ts-grid th{background:var(--cu-bg2);color:var(--cu-t3);font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;padding:8px 10px;text-align:center;white-space:nowrap;border-bottom:1px solid var(--cu-bd)}
      table.ts-grid th.task,table.ts-grid td.task{text-align:left;position:sticky;left:0;background:var(--cu-bg);z-index:1;min-width:230px;max-width:320px}
      table.ts-grid th.task{background:var(--cu-bg2);z-index:3}
      table.ts-grid th.off{color:var(--cu-t3);opacity:.75}
      table.ts-grid td{padding:4px 6px;border-bottom:1px solid var(--cu-bd);text-align:center}
      table.ts-grid tr:last-child td{border-bottom:0}
      table.ts-grid td.off{background:var(--cu-bg2)}
      .ts-cell{width:66px;height:30px;text-align:center;border:1px solid transparent;border-radius:var(--cu-radius-sm);background:transparent;color:var(--cu-t1);font:13px Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums}
      .ts-cell:hover:not(:disabled){border-color:var(--cu-bd2)}
      .ts-cell:focus{border-color:var(--cu-accent);background:var(--cu-bg);outline:none}
      .ts-cell:disabled{color:var(--cu-t2);cursor:default}
      .ts-cell.bad{border-color:#e5484d}
      .ts-cell.has{font-weight:600}
      .ts-rowname{display:flex;align-items:center;gap:8px;min-width:0}
      .ts-rowname .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
      .ts-rowname .nm:hover{color:var(--cu-accent-ink)}
      .ts-rowmeta{font-size:11px;color:var(--cu-t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ts-tot td{border-top:1px solid var(--cu-bd2);font-weight:600;background:var(--cu-bg2)}
      .ts-cap{font-size:10.5px;font-weight:500;color:var(--cu-t3);display:block}
      .ts-cap.over{color:#e5484d}
      .ts-cap.full{color:#30a46c}
      .ts-pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;border-radius:9px;padding:2px 8px;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
      .ts-banner{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:var(--cu-radius);font-size:12.5px;margin-bottom:12px;border:1px solid var(--cu-bd)}
      .ts-banner i{font-size:16px;flex-shrink:0;margin-top:1px}
      .ts-banner .bd{flex:1;min-width:0}
      .ts-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:34px 14px;color:var(--cu-t3)}
      .ts-empty i{font-size:28px;opacity:.7}
      .ts-empty .t{font-size:13.5px;font-weight:600;color:var(--cu-t2)}
      .ts-pickwrap{position:relative}
      .ts-picklist{position:absolute;z-index:40;top:calc(100% + 4px);left:0;width:min(420px,88vw);max-height:280px;overflow:auto;background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);box-shadow:var(--cu-shadow);padding:4px}
      .ts-pickitem{display:flex;flex-direction:column;gap:1px;width:100%;text-align:left;background:none;border:0;padding:6px 8px;border-radius:var(--cu-radius-sm);cursor:pointer;color:var(--cu-t1)}
      .ts-pickitem:hover,.ts-pickitem.on{background:var(--cu-bg3)}
      .ts-pickitem .s{font-size:11px;color:var(--cu-t3)}
      .ts-modal{position:fixed;inset:0;z-index:2000;background:rgba(15,15,20,.45);display:flex;align-items:center;justify-content:center;padding:16px}
      .ts-modal-box{background:var(--cu-bg);color:var(--cu-t1);border-radius:var(--cu-radius);box-shadow:var(--cu-shadow);width:min(720px,96vw);max-height:92vh;display:flex;flex-direction:column;font-family:Inter,system-ui,sans-serif;font-size:13px}
      .ts-modal-hd{display:flex;align-items:flex-start;gap:10px;padding:14px 16px;border-bottom:1px solid var(--cu-bd)}
      .ts-modal-hd .t{font:600 15px Inter,system-ui,sans-serif;flex:1}
      .ts-modal-bd{padding:14px 16px;overflow:auto}
      .ts-modal-ft{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--cu-bd);flex-wrap:wrap}
      .ts-bar{height:8px;background:var(--cu-bg3);border-radius:4px;overflow:hidden;display:flex;min-width:60px}
      .ts-bar>span{display:block;height:100%}
      .ts-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
      .ts-stat{border:1px solid var(--cu-bd);border-radius:var(--cu-radius);padding:10px 12px;background:var(--cu-bg)}
      .ts-stat .k{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3);font-weight:600}
      .ts-stat .v{font:600 20px Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums;margin-top:4px}
      .ts-sk{height:30px;border-radius:6px;margin:6px;background:linear-gradient(90deg,var(--cu-bg2),var(--cu-bg3),var(--cu-bg2));background-size:200% 100%;animation:tssk 1.2s infinite}
      @keyframes tssk{0%{background-position:200% 0}100%{background-position:-200% 0}}
      @media (prefers-reduced-motion: reduce){.ts-sk{animation:none}}
      @media(max-width:560px){.ts-page{padding:14px}.ts-stats{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}}
      `;
      document.head.appendChild(st);
    }

    // =======================================================================
    // helpers
    // =======================================================================
    const arr = (x) => Array.isArray(x) ? x : [];
    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i.test(
      String((e && (e.code || '')) + ' ' + ((e && (e.message || e.details)) || '')));
    const raw = (e) => String((e && (e.code || '')) + ' ' + ((e && (e.message || e.details)) || ''));
    const ERRS = [
      [/time\.invoiced/, "That time is already on an invoice — release it from the invoice first."],
      [/time\.approved/, "Approved time can't be changed. Ask a manager to reopen the week."],
      [/time\.submitted|timesheet\.locked/, 'This week is submitted — withdraw it (or ask for changes) to edit.'],
      [/time\.running/, "That timer is still running — stop it first."],
      [/time\.day_over_24h/, "A day can't hold more than 24 hours."],
      [/time\.bad_minutes/, 'Enter between 1 minute and 24 hours.'],
      [/timesheet\.bad_date/, 'That date is outside this week.'],
      [/timesheet\.empty/, 'Log some time before submitting.'],
      [/timesheet\.note_required/, 'Add a note so they know what to change.'],
      [/timesheet\.self_review/, 'Someone else has to review your own timesheet.'],
      [/timesheet\.bad_state/, 'That timesheet has already moved on — refresh.'],
      [/time\.already_invoiced/, 'Some of that time is already on another invoice.'],
      [/time\.client_mismatch/, "That time belongs to a different client."],
      [/time\.not_billable/, 'That time is marked non-billable.'],
      [/time\.rate_exists/, 'A rate for that combination already exists.'],
      [/time\.bad_rate/, 'Enter a valid hourly rate.'],
      [/auth\.forbidden|forbidden/, "You don't have access to that."],
      [/auth\.expired/, 'Your session expired — sign in again.'],
      [/not_found/, "That's gone — refresh and try again."],
    ];
    const errText = (e) => {
      const s = raw(e);
      for (const [re, msg] of ERRS) if (re.test(s)) return msg;
      return (e && e.message) || 'Something went wrong';
    };
    const toast = (showToast, msg) => { if (showToast) showToast(msg); else console.log('[timesheets]', msg); };

    const pad2 = (n) => String(n).padStart(2, '0');
    const isoOf = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    const parseISO = (s) => new Date(String(s || '').slice(0, 10) + 'T00:00:00');
    const todayISO = () => isoOf(new Date());
    const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); };
    const addMonths = (iso, n) => { const d = parseISO(iso); d.setMonth(d.getMonth() + n); return isoOf(d); };
    const weekStartOf = (iso) => { const d = parseISO(iso); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return isoOf(d); };
    const monthStart = (iso) => String(iso).slice(0, 7) + '-01';
    const monthEnd = (iso) => { const d = parseISO(monthStart(iso)); d.setMonth(d.getMonth() + 1); d.setDate(0); return isoOf(d); };
    const isoDow = (iso) => { const d = parseISO(iso).getDay(); return d === 0 ? 7 : d; };
    const fmtD = (iso, o) => parseISO(iso).toLocaleDateString('en-IN', o || { day: 'numeric', month: 'short' });
    const fmtWeek = (ws) => fmtD(ws) + ' – ' + fmtD(addDays(ws, 6), { day: 'numeric', month: 'short', year: 'numeric' });
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const fmtMin = fmtMinutesDep || ((n) => {
      n = Math.round(Number(n) || 0);
      if (n <= 0) return '0m';
      const hh = Math.floor(n / 60), mm = n % 60;
      return (hh ? hh + 'h' : '') + (hh && mm ? ' ' : '') + (mm ? mm + 'm' : '');
    });
    const parseMin = parseMinutesDep || ((str) => {
      const s = String(str || '').trim().toLowerCase();
      if (!s) return null;
      const colon = /^(\d+):(\d{1,2})$/.exec(s);
      if (colon) return +colon[1] * 60 + +colon[2];
      if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * (parseFloat(s) < 25 && /\./.test(s) ? 60 : 1));
      let total = 0, hit = false;
      s.replace(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/g, (_, num, unit) => {
        hit = true; total += /^h/.test(unit) ? parseFloat(num) * 60 : parseFloat(num); return '';
      });
      return hit ? Math.round(total) : null;
    });
    // Grid cells are hours-first: "2" = 2h, "90m" = 90 minutes, "1:30" / "1.5" = 90.
    const parseCell = (str) => {
      const s = String(str || '').trim().toLowerCase();
      if (!s) return 0;
      if (/^\d+(\.\d+)?$/.test(s)) { const v = parseFloat(s); return v > 24 ? Math.round(v) : Math.round(v * 60); }
      return parseMin(s);
    };
    const hrsOf = (m) => Math.round((Number(m) || 0) / 60 * 100) / 100;
    const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

    const isMgr = (r) => r === 'admin' || r === 'manager';
    const isFin = (r) => r === 'admin' || r === 'manager' || r === 'accounts_head';
    const canTrack = (r) => !!r && r !== 'client' && r !== 'accounts_head';

    const STATUS_META = {
      draft: { label: 'Draft', color: '#8e8e99', bg: 'rgba(142,142,153,.14)', icon: 'ti-pencil' },
      submitted: { label: 'Submitted', color: '#f5a623', bg: 'rgba(245,166,35,.14)', icon: 'ti-send' },
      approved: { label: 'Approved', color: '#30a46c', bg: 'rgba(48,164,108,.14)', icon: 'ti-circle-check' },
      rejected: { label: 'Changes asked', color: '#e5484d', bg: 'rgba(229,72,77,.14)', icon: 'ti-arrow-back-up' },
      missing: { label: 'Not started', color: '#8e8e99', bg: 'rgba(142,142,153,.10)', icon: 'ti-minus' },
    };
    const StatusPill = ({ status }) => {
      const m = STATUS_META[status] || STATUS_META.draft;
      return h`<span class="ts-pill" style=${{ color: m.color, background: m.bg }}><i class=${'ti ' + m.icon} style=${{ fontSize: 12 }}></i>${m.label}</span>`;
    };

    const csv = (rows) => rows.map(r => r.map(c => {
      const s = c == null ? '' : String(c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\r\n');
    const download = (name, text) => {
      try {
        const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
      } catch (e) { console.warn('[timesheets] download failed', e); }
    };

    // Pending-approval badge for the rail (polled; silent when the RPC is absent).
    const pend = { count: null, timer: null, dead: false };
    const pendPoll = () => {
      if (pend.timer || pend.dead) return;
      const run = () => {
        if (document.visibilityState !== 'visible') return;
        rpcCall('timesheets_pending_count', {}).then(n => { pend.count = Number(n) || 0; })
          .catch(e => { if (isMissingRpc(e)) { pend.dead = true; clearInterval(pend.timer); pend.timer = null; } });
      };
      run();
      pend.timer = setInterval(run, 120000);
    };

    const goTab = (tab) => { try { location.hash = '#/timesheets' + (tab && tab !== 'my' ? '/' + tab : ''); } catch (_) { } };

    // =======================================================================
    // small shared UI
    // =======================================================================
    function Loading({ rows = 4 }) {
      if (Skel) return h`<${Skel} rows=${rows}/>`;
      return h`<div>${Array.from({ length: rows }).map((_, i) => h`<div key=${i} class="ts-sk"></div>`)}</div>`;
    }
    function Empty({ icon = 'ti-clock', title, sub, action }) {
      if (EmptyState) return h`<${EmptyState} icon=${icon} title=${title} sub=${sub} action=${action}/>`;
      return h`<div class="ts-empty"><i class=${'ti ' + icon}></i><div class="t">${title}</div>
        ${sub && h`<div style=${{ fontSize: 12 }}>${sub}</div>`}${action}</div>`;
    }
    function OffState({ onRetry }) {
      return h`<${Empty} icon="ti-clock-off" title="Time tracking isn't switched on yet"
        sub="Ask an admin to apply the timesheets update, then reload."
        action=${onRetry && h`<button class="ts-btn sm" onClick=${onRetry}><i class="ti ti-refresh"></i>Try again<//>`}/>`;
    }
    function Modal({ title, sub, onClose, children, footer, wide }) {
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [onClose]);
      return h`<div class="ts-modal" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="ts-modal-box" style=${wide ? { width: 'min(980px,96vw)' } : null} role="dialog" aria-modal="true" aria-label=${title}>
          <div class="ts-modal-hd">
            <div class="t">${title}${sub && h`<div class="ts-sub">${sub}</div>`}</div>
            <button class="ts-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="ts-modal-bd">${children}</div>
          ${footer && h`<div class="ts-modal-ft">${footer}</div>`}
        </div>
      </div>`;
    }

    // Task picker — global search, falls back to my open tasks when the box is empty.
    function TaskPicker({ onPick, placeholder = 'Search a task…', autoFocus, width }) {
      const [q, setQ] = useState('');
      const [rows, setRows] = useState([]);
      const [open, setOpen] = useState(false);
      const [busy, setBusy] = useState(false);
      const [idx, setIdx] = useState(0);
      const box = useRef(null);
      useEffect(() => {
        const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
      }, []);
      useEffect(() => {
        let dead = false;
        const run = async () => {
          setBusy(true);
          try {
            let out = [];
            if (q.trim().length >= 2) {
              const res = TaskAPI ? await TaskAPI.search(q.trim(), 12) : await rpcCall('global_search', { p_q: q.trim(), p_limit: 12 });
              out = arr(res && res.tasks);
            } else if (TaskAPI) {
              const res = await TaskAPI.query({ scope: 'my', include_closed: false, order: 'updated', limit: 15 });
              out = arr(res && res.rows);
            }
            if (!dead) { setRows(out); setIdx(0); }
          } catch (e) { if (!dead) setRows([]); }
          finally { if (!dead) setBusy(false); }
        };
        const t = setTimeout(run, q.trim() ? 220 : 0);
        return () => { dead = true; clearTimeout(t); };
      }, [q]);
      const pick = (r) => { if (!r) return; setQ(''); setOpen(false); onPick(r); };
      return h`<div class="ts-pickwrap" ref=${box} style=${{ width: width || 260 }}>
        <input class="ts-input" style=${{ width: '100%' }} value=${q} placeholder=${placeholder} autoFocus=${!!autoFocus}
          onFocus=${() => setOpen(true)} onInput=${(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown=${(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, rows.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(rows[idx]); }
          else if (e.key === 'Escape') setOpen(false);
        }}/>
        ${open && h`<div class="ts-picklist">
          ${busy && !rows.length ? h`<div class="ts-muted" style=${{ padding: 8 }}>Searching…</div>`
          : !rows.length ? h`<div class="ts-muted" style=${{ padding: 8 }}>${q.trim().length >= 2 ? 'No tasks match.' : 'Type to search tasks.'}</div>`
            : rows.map((r, i) => h`<button key=${r.id} type="button" class=${'ts-pickitem' + (i === idx ? ' on' : '')}
                onMouseEnter=${() => setIdx(i)} onClick=${() => pick(r)}>
                <span>${r.title || 'Untitled'}</span>
                <span class="s">${[r.custom_id, r.client_name, r.status_name].filter(Boolean).join(' · ')}</span>
              </button>`)}
        </div>`}
      </div>`;
    }

    // Running timer pill — reads the shared store, stops/starts through TaskAPI.
    function RunningTimer({ showToast, currentUser }) {
      const store = useTaskStore ? useTaskStore() : {};
      const [now, setNow] = useState(Date.now());
      const [busy, setBusy] = useState(false);
      const [picking, setPicking] = useState(false);
      const timer = store && store.runningTimer;
      useEffect(() => {
        if (!timer) return;
        const iv = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(iv);
      }, [timer && timer.id]);
      if (!TaskAPI || !canTrack(currentUser && currentUser.role_level)) return null;
      const mins = timer ? Math.max(0, Math.round((now - new Date(timer.started_at).getTime()) / 60000)) : 0;
      const stop = async () => {
        setBusy(true);
        try { await TaskAPI.timeStop(); toast(showToast, 'Timer stopped'); }
        catch (e) { toast(showToast, errText(e)); }
        finally { setBusy(false); }
      };
      const start = async (row) => {
        setPicking(false); setBusy(true);
        try { await TaskAPI.timeStart(row.id); toast(showToast, 'Timer started'); }
        catch (e) { toast(showToast, errText(e)); }
        finally { setBusy(false); }
      };
      if (timer) {
        return h`<div style=${{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 6px 4px 10px', borderRadius: 999, background: 'var(--cu-accent-fog)', border: '1px solid var(--cu-accent)' }}>
          <i class="ti ti-player-record-filled" style=${{ color: 'var(--cu-accent-ink)', fontSize: 14 }}></i>
          <button class="ts-link" title="Open task" onClick=${() => openTask && openTask(timer.task_id)}>${timer.task_title || 'Tracking'}</button>
          <span style=${{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>${fmtMin(mins)}</span>
          <button class="ts-btn sm" disabled=${busy} onClick=${stop}><i class="ti ti-player-stop"></i>Stop</button>
        </div>`;
      }
      return h`<div style=${{ position: 'relative' }}>
        ${picking ? h`<${TaskPicker} autoFocus=${true} placeholder="Start timer on…" onPick=${start}/>`
          : h`<button class="ts-btn sm" disabled=${busy} onClick=${() => setPicking(true)}><i class="ti ti-player-play"></i>Start timer<//>`}
      </div>`;
    }

    // =======================================================================
    // Week grid — "My timesheet" and the manager's review view
    // =======================================================================
    function WeekGrid({ currentUser, showToast, memberId, weekStart, setWeekStart, mode = 'mine', onReviewed, compact }) {
      const [data, setData] = useState(null);
      const [st, setSt] = useState({ loading: true, err: null, off: false });
      const [text, setText] = useState({});          // cellKey → what's being typed
      const [pendingCells, setPendingCells] = useState({});  // cellKey → minutes
      const [extra, setExtra] = useState([]);        // rows added this session
      const [saving, setSaving] = useState(false);
      const [savedAt, setSavedAt] = useState(null);
      const [adding, setAdding] = useState(false);
      const [submitOpen, setSubmitOpen] = useState(false);
      const [note, setNote] = useState('');
      const [reviewNote, setReviewNote] = useState('');
      const [rejecting, setRejecting] = useState(false);
      const [busy, setBusy] = useState(false);
      const saveTimer = useRef(null);
      const gridRef = useRef(null);
      const mine = mode !== 'review';

      const load = useCallback(async (keepPending) => {
        setSt(s => ({ ...s, loading: !data, err: null }));
        try {
          const d = await rpcCall('timesheet_week_get', { p_week_start: weekStart, p_member_id: memberId || null });
          setData(d || null);
          try {
            const f = d && d.settings && d.settings.features;
            if (f && (f.timesheets === false || f.time_tracking === false)) window.__amsTimesheetsOff = true;
            else window.__amsTimesheetsOff = false;
          } catch (_) { }
          if (!keepPending) { setPendingCells({}); setText({}); }
          setExtra([]);
          setSt({ loading: false, err: null, off: false });
        } catch (e) {
          if (isMissingRpc(e)) { window.__amsTimesheetsOff = true; setSt({ loading: false, err: null, off: true }); }
          else setSt({ loading: false, err: e, off: false });
        }
      }, [weekStart, memberId]);
      useEffect(() => { load(); }, [load]);
      useEffect(() => {
        if (!taskBus || !mine) return;
        return taskBus.on('timer:changed', () => { load(true); });
      }, [taskBus, load, mine]);

      const rows = useMemo(() => {
        const base = arr(data && data.rows);
        const seen = new Set(base.map(r => r.task_id));
        return base.concat(extra.filter(e => !seen.has(e.task_id)).map(e => ({
          task_id: e.task_id, task_title: e.title || e.task_title, custom_id: e.custom_id,
          client_id: e.client_id, client_name: e.client_name, days: [0, 0, 0, 0, 0, 0, 0],
          fixed_days: [0, 0, 0, 0, 0, 0, 0], total: 0, billable: true, approved: false, invoiced: false, isNew: true,
        })));
      }, [data, extra]);

      const settings = (data && data.settings) || {};
      const perDay = Math.round((Number(settings.hours_per_day) || 8) * 60);
      const workDays = arr(settings.work_days).length ? arr(settings.work_days).map(Number) : [1, 2, 3, 4, 5];
      const holidays = arr(settings.holidays).map(x => String(x).slice(0, 10));
      const dayISO = (i) => addDays(weekStart, i);
      const isWorkDay = (i) => workDays.indexOf(isoDow(dayISO(i))) >= 0 && holidays.indexOf(dayISO(i)) < 0;
      const capacityFor = (i) => isWorkDay(i) ? perDay : 0;
      const editable = mine && !!(data && data.can_edit);

      const key = (taskId, i) => taskId + '|' + i;
      const cellMinutes = (row, i) => {
        const k = key(row.task_id, i);
        return pendingCells[k] != null ? pendingCells[k] : (arr(row.days)[i] || 0);
      };
      const rowTotal = (row) => [0, 1, 2, 3, 4, 5, 6].reduce((s, i) => s + cellMinutes(row, i), 0);
      const dayTotal = (i) => rows.reduce((s, r) => s + cellMinutes(r, i), 0);
      const weekTotal = rows.reduce((s, r) => s + rowTotal(r), 0);

      const doSave = useCallback(async (cellsOverride, orderOverride) => {
        const cells = cellsOverride || Object.entries(pendingCells).map(([k, minutes]) => {
          const [taskId, i] = k.split('|');
          return { task_id: taskId, date: dayISO(Number(i)), minutes };
        });
        const order = orderOverride;
        if (!cells.length && !order) return;
        setSaving(true);
        try {
          const args = { p_week_start: weekStart, p_cells: cells };
          if (order) args.p_task_ids = order;
          const d = await rpcCall('timesheet_week_save', args);
          setData(d || null);
          setPendingCells({}); setText({}); setExtra([]);
          setSavedAt(Date.now());
          if (arr(d && d.adjusted).length) {
            toast(showToast, 'Some cells already hold tracked time — kept the tracked minimum.');
          }
        } catch (e) {
          toast(showToast, errText(e));
          load(false);
        } finally { setSaving(false); }
      }, [pendingCells, weekStart, showToast, load]);

      const schedule = useCallback(() => {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => doSave(), 800);
      }, [doSave]);
      useEffect(() => () => clearTimeout(saveTimer.current), []);

      const commit = (row, i, value) => {
        const k = key(row.task_id, i);
        const mins = parseCell(value);
        if (mins == null) { toast(showToast, 'Try 1.5, 90m or 1:30'); setText(t => ({ ...t, [k]: undefined })); return; }
        setText(t => { const n = { ...t }; delete n[k]; return n; });
        if (mins === (arr(row.days)[i] || 0) && pendingCells[k] == null) return;
        setPendingCells(p => ({ ...p, [k]: mins }));
        schedule();
      };

      const focusCell = (r, c) => {
        try {
          const el = gridRef.current && gridRef.current.querySelector('input[data-r="' + r + '"][data-c="' + c + '"]');
          if (el) { el.focus(); el.select(); }
        } catch (_) { }
      };

      const addRow = (task) => {
        setAdding(false);
        if (rows.some(r => r.task_id === task.id)) { toast(showToast, 'Already on this week'); return; }
        const next = rows.map(r => r.task_id).concat(task.id);
        setExtra(x => x.concat([{ task_id: task.id, title: task.title, custom_id: task.custom_id, client_id: task.client_id, client_name: task.client_name }]));
        clearTimeout(saveTimer.current);
        doSave([], next);
      };
      const removeRow = (row) => {
        const fixed = arr(row.fixed_days);
        const cells = [0, 1, 2, 3, 4, 5, 6].filter(i => cellMinutes(row, i) !== (fixed[i] || 0))
          .map(i => ({ task_id: row.task_id, date: dayISO(i), minutes: fixed[i] || 0 }));
        const order = rows.map(r => r.task_id).filter(id => id !== row.task_id);
        clearTimeout(saveTimer.current);
        if (fixed.some(m => m > 0)) toast(showToast, 'Tracked time stays on the row — only typed hours were cleared.');
        doSave(cells, order);
      };
      const toggleBillable = (row) => {
        const next = !row.billable;
        const cells = [0, 1, 2, 3, 4, 5, 6].filter(i => cellMinutes(row, i) > 0)
          .map(i => ({ task_id: row.task_id, date: dayISO(i), minutes: cellMinutes(row, i), billable: next }));
        if (!cells.length) { toast(showToast, 'Log some time on this row first.'); return; }
        clearTimeout(saveTimer.current);
        doSave(cells);
      };
      const copyLastWeek = async () => {
        setBusy(true);
        try {
          const prev = await rpcCall('timesheet_week_get', { p_week_start: addDays(weekStart, -7), p_member_id: null });
          const ids = arr(prev && prev.rows).map(r => r.task_id);
          if (!ids.length) { toast(showToast, 'Last week was empty.'); return; }
          const merged = rows.map(r => r.task_id).concat(ids.filter(id => !rows.some(r => r.task_id === id)));
          await doSave([], merged);
          toast(showToast, 'Copied last week’s rows');
        } catch (e) { toast(showToast, errText(e)); }
        finally { setBusy(false); }
      };

      const submit = async () => {
        setBusy(true);
        try {
          clearTimeout(saveTimer.current);
          await doSave();
          const d = await rpcCall('timesheet_submit', { p_week_start: weekStart, p_note: note || null });
          setData(d || null); setSubmitOpen(false); setNote('');
          toast(showToast, 'Timesheet submitted');
        } catch (e) { toast(showToast, errText(e)); }
        finally { setBusy(false); }
      };
      const withdraw = async () => {
        setBusy(true);
        try { const d = await rpcCall('timesheet_withdraw', { p_week_start: weekStart }); setData(d || null); toast(showToast, 'Withdrawn — you can edit again'); }
        catch (e) { toast(showToast, errText(e)); }
        finally { setBusy(false); }
      };
      const review = async (action) => {
        if (action === 'reject' && !reviewNote.trim()) { setRejecting(true); toast(showToast, 'Add a note so they know what to change.'); return; }
        setBusy(true);
        try {
          await rpcCall('timesheet_review', { p_id: data.timesheet_id, p_action: action, p_note: reviewNote.trim() || null });
          toast(showToast, action === 'approve' ? 'Approved' : action === 'reject' ? 'Sent back' : 'Reopened');
          setRejecting(false); setReviewNote('');
          await load(false);
          if (onReviewed) onReviewed();
        } catch (e) { toast(showToast, errText(e)); }
        finally { setBusy(false); }
      };

      if (st.off) return h`<${OffState} onRetry=${() => load(false)}/>`;
      if (st.loading && !data) return h`<${Loading} rows=${6}/>`;
      if (st.err && !data) return h`<${Empty} icon="ti-alert-triangle" title="Couldn't load this week" sub=${errText(st.err)}
        action=${h`<button class="ts-btn sm" onClick=${() => load(false)}><i class="ti ti-refresh"></i>Retry<//>`}/>`;
      if (!data) return null;

      const status = data.status || 'draft';
      const meta = STATUS_META[status] || STATUS_META.draft;
      const banner = status === 'submitted' ? { icon: 'ti-send', color: meta.color, text: 'Submitted' + (data.submitted_at && fmtRelative ? ' ' + fmtRelative(data.submitted_at) : '') + ' — waiting for review.' }
        : status === 'approved' ? { icon: 'ti-circle-check', color: meta.color, text: 'Approved' + (data.reviewed_by_name ? ' by ' + data.reviewed_by_name : '') + '. Locked.' }
          : status === 'rejected' ? { icon: 'ti-arrow-back-up', color: meta.color, text: (data.reviewed_by_name || 'A manager') + ' asked for changes' + (data.review_note ? ': ' + data.review_note : '') }
            : null;

      return h`<div>
        <div class="ts-tools" style=${{ justifyContent: 'space-between' }}>
          <div style=${{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            ${setWeekStart && h`<${Fragment}>
              <button class="ts-ibtn" aria-label="Previous week" onClick=${() => setWeekStart(addDays(weekStart, -7))}><i class="ti ti-chevron-left"></i></button>
              <button class="ts-btn sm" onClick=${() => setWeekStart(weekStartOf(todayISO()))}>This week</button>
              <button class="ts-ibtn" aria-label="Next week" onClick=${() => setWeekStart(addDays(weekStart, 7))}><i class="ti ti-chevron-right"></i></button>
            <//>`}
            <strong style=${{ fontSize: 13.5 }}>${fmtWeek(weekStart)}</strong>
            <${StatusPill} status=${status}/>
            ${!mine && data.member && h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              ${MemberAvatar ? h`<${MemberAvatar} member=${data.member} size=${20}/>` : null}<span>${data.member.name}</span>
            </span>`}
          </div>
          <div style=${{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span class="ts-muted" aria-live="polite">${saving ? 'Saving…' : savedAt ? 'Saved' : ''}</span>
            ${editable && h`<button class="ts-btn sm" disabled=${busy} onClick=${copyLastWeek}><i class="ti ti-copy"></i>Copy last week<//>`}
            ${editable && h`<button class="ts-btn pri sm" disabled=${busy || weekTotal <= 0} onClick=${() => setSubmitOpen(true)}><i class="ti ti-send"></i>Submit week<//>`}
            ${mine && status === 'submitted' && h`<button class="ts-btn sm" disabled=${busy} onClick=${withdraw}><i class="ti ti-arrow-back-up"></i>Withdraw<//>`}
            ${!mine && data.can_review && status === 'submitted' && h`<${Fragment}>
              <button class="ts-btn sm" disabled=${busy} onClick=${() => setRejecting(r => !r)}><i class="ti ti-message-circle"></i>Request changes</button>
              <button class="ts-btn pri sm" disabled=${busy} onClick=${() => review('approve')}><i class="ti ti-check"></i>Approve</button>
            <//>`}
            ${!mine && data.can_review && (status === 'approved' || status === 'rejected') && h`<button class="ts-btn sm" disabled=${busy} onClick=${() => review('reopen')}><i class="ti ti-lock-open"></i>Reopen<//>`}
          </div>
        </div>

        ${banner && h`<div class="ts-banner" style=${{ borderColor: banner.color + '55', background: (STATUS_META[status] || {}).bg }}>
          <i class=${'ti ' + banner.icon} style=${{ color: banner.color }}></i>
          <div class="bd">${banner.text}${data.note && status === 'submitted' ? h`<div class="ts-muted">Your note: ${data.note}</div>` : null}</div>
        </div>`}

        ${rejecting && h`<div class="ts-banner" style=${{ flexDirection: 'column', gap: 8 }}>
          <div style=${{ width: '100%' }}>
            <label class="ts-lbl" for="ts-review-note">What should change?</label>
            <textarea id="ts-review-note" class="ts-input" style=${{ width: '100%', height: 64, padding: 8 }} value=${reviewNote}
              onInput=${(e) => setReviewNote(e.target.value)} placeholder="e.g. Split Friday between the shoot and the edit"></textarea>
          </div>
          <div style=${{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
            <button class="ts-btn sm" onClick=${() => { setRejecting(false); setReviewNote(''); }}>Cancel</button>
            <button class="ts-btn sm danger" disabled=${busy || !reviewNote.trim()} onClick=${() => review('reject')}>Send back</button>
          </div>
        </div>`}

        <div class="ts-grid-wrap" ref=${gridRef}>
          <table class="ts-grid">
            <thead><tr>
              <th class="task">Task</th>
              ${[0, 1, 2, 3, 4, 5, 6].map(i => h`<th key=${i} class=${isWorkDay(i) ? '' : 'off'}>
                ${DAY_NAMES[i]}<br/><span style=${{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>${fmtD(dayISO(i))}</span>
              </th>`)}
              <th class="num">Total</th>
              <th style=${{ width: 40 }}></th>
            </tr></thead>
            <tbody>
              ${rows.length === 0 && h`<tr><td class="task" colSpan="10" style=${{ textAlign: 'center', padding: 0 }}>
                <${Empty} icon="ti-clock-plus" title=${editable ? 'No rows yet' : 'No time logged this week'}
                  sub=${editable ? 'Add a task below, or start a timer from any task.' : null}/>
              </td></tr>`}
              ${rows.map((row, r) => {
        const fixed = arr(row.fixed_days);
        return h`<tr key=${row.task_id}>
                <td class="task">
                  <div class="ts-rowname">
                    <button class="ts-ibtn" title=${row.billable ? 'Billable — click to mark non-billable' : 'Non-billable — click to mark billable'}
                      aria-label=${row.billable ? 'Billable' : 'Non-billable'} disabled=${!editable}
                      onClick=${() => editable && toggleBillable(row)}>
                      <i class=${'ti ' + (row.billable ? 'ti-currency-rupee' : 'ti-currency-rupee-off')}
                        style=${{ color: row.billable ? '#30a46c' : 'var(--cu-t3)', fontSize: 15 }}></i>
                    </button>
                    <div style=${{ minWidth: 0, flex: 1 }}>
                      <div class="nm" role="button" tabIndex="0" title=${row.task_title}
                        onClick=${() => openTask && openTask(row.task_id)}
                        onKeyDown=${(e) => { if (e.key === 'Enter') openTask && openTask(row.task_id); }}>${row.task_title || 'Untitled'}</div>
                      <div class="ts-rowmeta">${[row.custom_id, row.client_name || 'Agency'].filter(Boolean).join(' · ')}
                        ${row.invoiced ? ' · invoiced' : row.approved ? ' · approved' : ''}</div>
                    </div>
                  </div>
                </td>
                ${[0, 1, 2, 3, 4, 5, 6].map(i => {
          const k = key(row.task_id, i);
          const mins = cellMinutes(row, i);
          const val = text[k] != null ? text[k] : (mins ? fmtMin(mins) : '');
          const locked = !editable || (fixed[i] || 0) > 0 && row.invoiced;
          return h`<td key=${i} class=${isWorkDay(i) ? '' : 'off'}>
                    <input class=${'ts-cell' + (mins ? ' has' : '')} data-r=${r} data-c=${i} inputMode="decimal"
                      aria-label=${(row.task_title || 'Task') + ' ' + DAY_NAMES[i]} value=${val} disabled=${locked}
                      title=${(fixed[i] || 0) > 0 ? fmtMin(fixed[i]) + ' already tracked on this day' : 'Hours — 1.5, 90m or 1:30'}
                      onInput=${(e) => setText(t => ({ ...t, [k]: e.target.value }))}
                      onFocus=${(e) => { setText(t => ({ ...t, [k]: mins ? String(hrsOf(mins)) : '' })); setTimeout(() => e.target.select(), 0); }}
                      onBlur=${(e) => commit(row, i, e.target.value)}
                      onKeyDown=${(e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); focusCell(r + 1, i); }
              else if (e.key === 'ArrowDown') { e.preventDefault(); e.target.blur(); focusCell(r + 1, i); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); e.target.blur(); focusCell(r - 1, i); }
              else if (e.key === 'Escape') { setText(t => { const n = { ...t }; delete n[k]; return n; }); e.target.blur(); }
            }}/>
                  </td>`;
        })}
                <td class="num">${rowTotal(row) ? fmtMin(rowTotal(row)) : '—'}</td>
                <td>
                  ${editable && h`<button class="ts-ibtn" aria-label="Remove row" title="Remove row" onClick=${() => removeRow(row)}><i class="ti ti-x"></i></button>`}
                </td>
              </tr>`;
      })}
            </tbody>
            <tfoot>
              <tr class="ts-tot">
                <td class="task">${editable ? (adding
        ? h`<${TaskPicker} autoFocus=${true} width=${240} placeholder="Add a task…" onPick=${addRow}/>`
        : h`<button class="ts-btn sm" onClick=${() => setAdding(true)}><i class="ti ti-plus"></i>Add row<//>`) : 'Total'}</td>
                ${[0, 1, 2, 3, 4, 5, 6].map(i => {
        const t = dayTotal(i), cap = capacityFor(i);
        const cls = !cap ? '' : t > cap ? 'over' : t >= cap ? 'full' : '';
        return h`<td key=${i} class=${isWorkDay(i) ? '' : 'off'}>
                    ${t ? fmtMin(t) : '—'}
                    ${cap > 0 && h`<span class=${'ts-cap ' + cls}>of ${Math.round(cap / 60)}h</span>`}
                  </td>`;
      })}
                <td class="num">${fmtMin(weekTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="ts-muted" style=${{ marginTop: 8 }}>
          ${fmtMin(weekTotal)} logged${data.billable_total != null ? ' · ' + fmtMin(data.billable_total) + ' billable' : ''}
          ${perDay ? ' · target ' + Math.round(perDay * workDays.length / 60) + 'h/week' : ''}
          ${editable ? ' · type hours (1.5), minutes (90m) or 1:30' : ''}
        </div>

        ${submitOpen && h`<${Modal} title="Submit this week" sub=${fmtWeek(weekStart) + ' · ' + fmtMin(weekTotal)}
          onClose=${() => setSubmitOpen(false)}
          footer=${h`<${Fragment}>
            <button class="ts-btn" onClick=${() => setSubmitOpen(false)}>Cancel</button>
            <button class="ts-btn pri" disabled=${busy} onClick=${submit}>${busy ? 'Submitting…' : 'Submit for approval'}</button>
          <//>`}>
          <label class="ts-lbl" for="ts-submit-note">Note for your reviewer (optional)</label>
          <textarea id="ts-submit-note" class="ts-input" style=${{ width: '100%', height: 80, padding: 8 }} value=${note}
            onInput=${(e) => setNote(e.target.value)} placeholder="e.g. Thursday's shoot ran long"></textarea>
          <div class="ts-muted" style=${{ marginTop: 8 }}>Once submitted the week is locked until it's approved or sent back.</div>
        <//>`}
      </div>`;
    }

    // =======================================================================
    // Tab: My timesheet
    // =======================================================================
    function MyTimesheetTab({ currentUser, showToast }) {
      const [ws, setWs] = useState(() => weekStartOf(todayISO()));
      return h`<div>
        <${WeekGrid} currentUser=${currentUser} showToast=${showToast} memberId=${null}
          weekStart=${ws} setWeekStart=${setWs} mode="mine"/>
      </div>`;
    }

    // =======================================================================
    // Tab: All timesheets (+ review modal)
    // =======================================================================
    function useTimesheets(filter) {
      const [state, setState] = useState({ rows: null, err: null, off: false, loading: true });
      const load = useCallback(async () => {
        setState(s => ({ ...s, loading: true }));
        try {
          const rows = await rpcCall('timesheets_list', { p_filter: filter });
          setState({ rows: arr(rows), err: null, off: false, loading: false });
        } catch (e) {
          if (isMissingRpc(e)) setState({ rows: [], err: null, off: true, loading: false });
          else setState({ rows: null, err: e, off: false, loading: false });
        }
      }, [JSON.stringify(filter)]);
      useEffect(() => { load(); }, [load]);
      return { ...state, reload: load };
    }

    function ReviewModal({ row, currentUser, showToast, onClose, onChanged }) {
      return h`<${Modal} wide=${true} title=${row.member_name + ' · ' + fmtWeek(row.week_start)}
        sub=${fmtMin(row.total_minutes) + ' logged · ' + fmtMin(row.billable_minutes) + ' billable'}
        onClose=${onClose}>
        <${WeekGrid} currentUser=${currentUser} showToast=${showToast} memberId=${row.member_id}
          weekStart=${row.week_start} setWeekStart=${null} mode="review"
          onReviewed=${() => { if (onChanged) onChanged(); }}/>
      <//>`;
    }

    function AllTimesheetsTab({ currentUser, showToast, team }) {
      const store = useTaskStore ? useTaskStore() : {};
      const members = arr(store.members).length ? arr(store.members) : arr(team);
      const [weeks, setWeeks] = useState(8);
      const [status, setStatus] = useState('all');
      const [member, setMember] = useState('all');
      const [missing, setMissing] = useState(true);
      const [open, setOpen] = useState(null);
      const to = weekStartOf(todayISO());
      const filter = useMemo(() => {
        const f = { from: addDays(to, -7 * (weeks - 1)), to, include_missing: missing };
        if (status !== 'all') f.statuses = [status];
        if (member !== 'all') f.member_ids = [member];
        return f;
      }, [weeks, status, member, missing, to]);
      const q = useTimesheets(filter);
      const rows = arr(q.rows);
      const exportCsv = () => {
        download('Timesheets_' + filter.from + '_to_' + filter.to + '.csv', csv([
          ['Member', 'Week starting', 'Status', 'Hours', 'Billable hours', 'Submitted', 'Reviewed by', 'Note'],
          ...rows.map(r => [r.member_name, r.week_start, (STATUS_META[r.status] || {}).label || r.status,
          hrsOf(r.total_minutes), hrsOf(r.billable_minutes), r.submitted_at ? String(r.submitted_at).slice(0, 10) : '',
          r.reviewed_by_name || '', r.review_note || r.note || '']),
        ]));
      };
      if (q.off) return h`<${OffState} onRetry=${q.reload}/>`;
      return h`<div>
        <div class="ts-tools">
          <select class="ts-select" aria-label="Weeks" value=${weeks} onChange=${(e) => setWeeks(Number(e.target.value))}>
            ${[4, 8, 12, 26].map(w => h`<option key=${w} value=${w}>Last ${w} weeks</option>`)}
          </select>
          <select class="ts-select" aria-label="Status" value=${status} onChange=${(e) => setStatus(e.target.value)}>
            <option value="all">Any status</option>
            ${['submitted', 'approved', 'rejected', 'draft', 'missing'].map(s => h`<option key=${s} value=${s}>${STATUS_META[s].label}</option>`)}
          </select>
          <select class="ts-select" aria-label="Member" value=${member} onChange=${(e) => setMember(e.target.value)}>
            <option value="all">Everyone</option>
            ${members.filter(m => m.role_level !== 'client').map(m => h`<option key=${m.id} value=${m.id}>${m.name}</option>`)}
          </select>
          <label style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <input type="checkbox" checked=${missing} onChange=${(e) => setMissing(e.target.checked)} style=${{ accentColor: '#ff00ee' }}/>
            Show missing weeks
          </label>
          <div style=${{ flex: 1 }}></div>
          <button class="ts-btn sm" onClick=${q.reload}><i class="ti ti-refresh"></i>Refresh</button>
          <button class="ts-btn sm" disabled=${!rows.length} onClick=${exportCsv}><i class="ti ti-download"></i>CSV</button>
        </div>
        ${q.loading && !q.rows ? h`<${Loading} rows=${6}/>`
          : q.err ? h`<${Empty} icon="ti-alert-triangle" title="Couldn't load timesheets" sub=${errText(q.err)}
              action=${h`<button class="ts-btn sm" onClick=${q.reload}>Retry<//>`}/>`
            : !rows.length ? h`<${Empty} icon="ti-calendar-off" title="Nothing here" sub="Try a wider range or another status."/>`
              : h`<div class="ts-scroll">
                <table class="ts-tbl">
                  <thead><tr>
                    <th>Member</th><th>Week</th><th class="num">Hours</th><th class="num">Billable</th>
                    <th>Status</th><th>Submitted</th><th>Reviewed by</th>
                  </tr></thead>
                  <tbody>
                    ${rows.map(r => h`<tr key=${r.member_id + r.week_start} class="clickable" tabIndex="0"
                      onClick=${() => setOpen(r)} onKeyDown=${(e) => { if (e.key === 'Enter') setOpen(r); }}>
                      <td><span style=${{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        ${MemberAvatar ? h`<${MemberAvatar} member=${{ id: r.member_id, name: r.member_name, initials: r.member_initials, color: r.member_color }} size=${22}/>` : null}
                        ${r.member_name}</span></td>
                      <td>${fmtWeek(r.week_start)}</td>
                      <td class="num">${fmtMin(r.total_minutes)}</td>
                      <td class="num">${fmtMin(r.billable_minutes)}</td>
                      <td><${StatusPill} status=${r.status}/></td>
                      <td class="ts-muted">${r.submitted_at ? (fmtRelative ? fmtRelative(r.submitted_at) : String(r.submitted_at).slice(0, 10)) : '—'}</td>
                      <td class="ts-muted">${r.reviewed_by_name || '—'}</td>
                    </tr>`)}
                  </tbody>
                </table>
              </div>`}
        ${open && h`<${ReviewModal} row=${open} currentUser=${currentUser} showToast=${showToast}
          onClose=${() => setOpen(null)} onChanged=${() => { q.reload(); }}/>`}
      </div>`;
    }

    // =======================================================================
    // Tab: Approvals
    // =======================================================================
    function ApprovalsTab({ currentUser, showToast }) {
      const to = weekStartOf(todayISO());
      const filter = useMemo(() => ({ from: addDays(to, -7 * 11), to, statuses: ['submitted'] }), [to]);
      const q = useTimesheets(filter);
      const [busy, setBusy] = useState(null);
      const [open, setOpen] = useState(null);
      const [reject, setReject] = useState(null);
      const [note, setNote] = useState('');
      const rows = arr(q.rows);
      const act = async (row, action, text) => {
        setBusy(row.id);
        try {
          await rpcCall('timesheet_review', { p_id: row.id, p_action: action, p_note: text || null });
          toast(showToast, action === 'approve' ? 'Approved ' + row.member_name + "'s week" : 'Sent back to ' + row.member_name);
          setReject(null); setNote('');
          q.reload();
          pend.count = Math.max(0, (pend.count || 1) - 1);
        } catch (e) { toast(showToast, errText(e)); }
        finally { setBusy(null); }
      };
      if (q.off) return h`<${OffState} onRetry=${q.reload}/>`;
      if (q.loading && !q.rows) return h`<${Loading} rows=${4}/>`;
      if (!rows.length) return h`<${Empty} icon="ti-checks" title="Nothing waiting" sub="Submitted timesheets land here for approval."/>`;
      return h`<div>
        <div class="ts-muted" style=${{ marginBottom: 10 }}>${rows.length} timesheet${rows.length === 1 ? '' : 's'} waiting</div>
        ${rows.map(r => h`<div key=${r.id} class="ts-card" style=${{ padding: 12, marginBottom: 10, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style=${{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 200, flex: 1 }}>
            ${MemberAvatar ? h`<${MemberAvatar} member=${{ id: r.member_id, name: r.member_name, initials: r.member_initials, color: r.member_color }} size=${28}/>` : null}
            <div style=${{ minWidth: 0 }}>
              <div style=${{ fontWeight: 600 }}>${r.member_name}</div>
              <div class="ts-muted">${fmtWeek(r.week_start)} · ${fmtMin(r.total_minutes)} (${fmtMin(r.billable_minutes)} billable)
                ${r.submitted_at && fmtRelative ? ' · submitted ' + fmtRelative(r.submitted_at) : ''}</div>
              ${r.note && h`<div class="ts-muted" style=${{ marginTop: 3 }}><i class="ti ti-message-circle" style=${{ fontSize: 12 }}></i> ${r.note}</div>`}
            </div>
          </div>
          <div style=${{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button class="ts-btn sm" onClick=${() => setOpen(r)}><i class="ti ti-table"></i>Review week</button>
            <button class="ts-btn sm" disabled=${busy === r.id} onClick=${() => { setReject(r); setNote(''); }}><i class="ti ti-arrow-back-up"></i>Changes</button>
            <button class="ts-btn pri sm" disabled=${busy === r.id} onClick=${() => act(r, 'approve')}><i class="ti ti-check"></i>Approve</button>
          </div>
        </div>`)}
        ${open && h`<${ReviewModal} row=${open} currentUser=${currentUser} showToast=${showToast}
          onClose=${() => setOpen(null)} onChanged=${q.reload}/>`}
        ${reject && h`<${Modal} title=${'Send back to ' + reject.member_name} sub=${fmtWeek(reject.week_start)}
          onClose=${() => setReject(null)}
          footer=${h`<${Fragment}>
            <button class="ts-btn" onClick=${() => setReject(null)}>Cancel</button>
            <button class="ts-btn pri" disabled=${!note.trim() || busy === reject.id} onClick=${() => act(reject, 'reject', note.trim())}>Send back</button>
          <//>`}>
          <label class="ts-lbl" for="ts-reject-note">What needs changing?</label>
          <textarea id="ts-reject-note" class="ts-input" style=${{ width: '100%', height: 90, padding: 8 }} value=${note}
            autoFocus=${true} onInput=${(e) => setNote(e.target.value)} placeholder="e.g. Move Wednesday's 3h to the Kora shoot"></textarea>
        <//>`}
      </div>`;
    }

    // =======================================================================
    // Tab: Time report (+ entries + log time)
    // =======================================================================
    const RANGES = [
      { key: 'this_week', label: 'This week', build: () => ({ from: weekStartOf(todayISO()), to: todayISO() }) },
      { key: 'last_week', label: 'Last week', build: () => ({ from: addDays(weekStartOf(todayISO()), -7), to: addDays(weekStartOf(todayISO()), -1) }) },
      { key: 'this_month', label: 'This month', build: () => ({ from: monthStart(todayISO()), to: todayISO() }) },
      { key: 'last_month', label: 'Last month', build: () => ({ from: monthStart(addMonths(todayISO(), -1)), to: monthEnd(addMonths(todayISO(), -1)) }) },
      { key: 'custom', label: 'Custom…', build: null },
    ];

    function LogTimeModal({ onClose, onSaved, showToast }) {
      const [task, setTask] = useState(null);
      const [date, setDate] = useState(todayISO());
      const [dur, setDur] = useState('');
      const [note, setNote] = useState('');
      const [billable, setBillable] = useState(true);
      const [busy, setBusy] = useState(false);
      const save = async () => {
        const mins = parseMin(dur);
        if (!task) { toast(showToast, 'Pick a task'); return; }
        if (!mins) { toast(showToast, 'Enter a duration like 1h 30m'); return; }
        setBusy(true);
        try {
          await rpcCall('time_entry_add', { p_data: { task_id: task.id, date, minutes: mins, note: note || null, billable } });
          toast(showToast, 'Time logged');
          onSaved();
        } catch (e) { toast(showToast, errText(e)); }
        finally { setBusy(false); }
      };
      return h`<${Modal} title="Log time" onClose=${onClose}
        footer=${h`<${Fragment}>
          <button class="ts-btn" onClick=${onClose}>Cancel</button>
          <button class="ts-btn pri" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Log time'}</button>
        <//>`}>
        <div style=${{ display: 'grid', gap: 12 }}>
          <div>
            <span class="ts-lbl">Task</span>
            ${task ? h`<div style=${{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>${task.title}</strong><span class="ts-muted">${[task.custom_id, task.client_name].filter(Boolean).join(' · ')}</span>
                <button class="ts-link" onClick=${() => setTask(null)}>change</button>
              </div>`
          : h`<${TaskPicker} autoFocus=${true} width=${'100%'} onPick=${(r) => setTask(r)}/>`}
          </div>
          <div style=${{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div><span class="ts-lbl">Date</span><input class="ts-input" type="date" value=${date} onInput=${(e) => setDate(e.target.value)}/></div>
            <div><span class="ts-lbl">Duration</span><input class="ts-input" style=${{ width: 120 }} value=${dur} placeholder="1h 30m"
              onInput=${(e) => setDur(e.target.value)}/></div>
            <div><span class="ts-lbl">Billable</span>
              <label style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30 }}>
                <input type="checkbox" checked=${billable} onChange=${(e) => setBillable(e.target.checked)} style=${{ accentColor: '#ff00ee' }}/>
                Billable to the client
              </label>
            </div>
          </div>
          <div><span class="ts-lbl">Note</span><input class="ts-input" style=${{ width: '100%' }} value=${note}
            onInput=${(e) => setNote(e.target.value)} placeholder="What did you work on?"/></div>
        </div>
      <//>`;
    }

    function EntryEditor({ entry, onClose, onSaved, showToast }) {
      const [dur, setDur] = useState(fmtMin(entry.minutes));
      const [date, setDate] = useState(String(entry.date).slice(0, 10));
      const [note, setNote] = useState(entry.note || '');
      const [billable, setBillable] = useState(!!entry.billable);
      const [busy, setBusy] = useState(false);
      const save = async () => {
        const mins = parseMin(dur);
        if (!mins) { toast(showToast, 'Enter a duration like 1h 30m'); return; }
        setBusy(true);
        try {
          await rpcCall('time_entry_update', { p_id: entry.id, p_patch: { minutes: mins, date, note, billable } });
          toast(showToast, 'Updated'); onSaved();
        } catch (e) { toast(showToast, errText(e)); }
        finally { setBusy(false); }
      };
      const del = async () => {
        setBusy(true);
        try { await rpcCall('time_entry_delete', { p_id: entry.id }); toast(showToast, 'Deleted'); onSaved(); }
        catch (e) { toast(showToast, errText(e)); }
        finally { setBusy(false); }
      };
      return h`<${Modal} title="Edit time entry" sub=${entry.task_title} onClose=${onClose}
        footer=${h`<${Fragment}>
          <button class="ts-btn danger" disabled=${busy} onClick=${del}><i class="ti ti-trash"></i>Delete</button>
          <div style=${{ flex: 1 }}></div>
          <button class="ts-btn" onClick=${onClose}>Cancel</button>
          <button class="ts-btn pri" disabled=${busy} onClick=${save}>Save</button>
        <//>`}>
        <div style=${{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div><span class="ts-lbl">Date</span><input class="ts-input" type="date" value=${date} onInput=${(e) => setDate(e.target.value)}/></div>
          <div><span class="ts-lbl">Duration</span><input class="ts-input" style=${{ width: 120 }} value=${dur} onInput=${(e) => setDur(e.target.value)}/></div>
          <div><span class="ts-lbl">Billable</span>
            <label style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30 }}>
              <input type="checkbox" checked=${billable} onChange=${(e) => setBillable(e.target.checked)} style=${{ accentColor: '#ff00ee' }}/>Billable
            </label>
          </div>
        </div>
        <div style=${{ marginTop: 12 }}><span class="ts-lbl">Note</span>
          <input class="ts-input" style=${{ width: '100%' }} value=${note} onInput=${(e) => setNote(e.target.value)}/></div>
      <//>`;
    }

    function TimeReportTab({ currentUser, showToast, clients }) {
      const store = useTaskStore ? useTaskStore() : {};
      const role = currentUser && currentUser.role_level;
      const fin = isFin(role);
      const members = arr(store.members);
      const clientList = arr(clients).length ? arr(clients) : arr(store.clients);
      const [rangeKey, setRangeKey] = useState('this_month');
      const [custom, setCustom] = useState({ from: monthStart(todayISO()), to: todayISO() });
      const [group, setGroup] = useState('member');
      const [billable, setBillable] = useState('all');
      const [member, setMember] = useState('all');
      const [client, setClient] = useState('all');
      const [view, setView] = useState('summary');
      const [report, setReport] = useState({ data: null, err: null, off: false, loading: true });
      const [entries, setEntries] = useState({ data: null, err: null, loading: false });
      const [editing, setEditing] = useState(null);
      const [logging, setLogging] = useState(false);

      const range = useMemo(() => {
        const r = RANGES.find(x => x.key === rangeKey);
        return r && r.build ? r.build() : { from: custom.from, to: custom.to };
      }, [rangeKey, custom]);
      const filter = useMemo(() => {
        const f = { from: range.from, to: range.to, group_by: group };
        if (billable !== 'all') f.billable = billable === 'yes';
        if (member !== 'all') f.member_ids = [member];
        if (client !== 'all') f.client_ids = [client];
        return f;
      }, [range, group, billable, member, client]);

      const load = useCallback(async () => {
        setReport(r => ({ ...r, loading: true }));
        try { const d = await rpcCall('time_report', { p_filter: filter }); setReport({ data: d, err: null, off: false, loading: false }); }
        catch (e) {
          if (isMissingRpc(e)) setReport({ data: null, err: null, off: true, loading: false });
          else setReport({ data: null, err: e, off: false, loading: false });
        }
      }, [JSON.stringify(filter)]);
      const loadEntries = useCallback(async () => {
        setEntries(s => ({ ...s, loading: true }));
        try {
          const f = { from: filter.from, to: filter.to, limit: 2000 };
          if (filter.billable != null) f.billable = filter.billable;
          if (filter.member_ids) f.member_ids = filter.member_ids;
          if (filter.client_ids) f.client_ids = filter.client_ids;
          const d = await rpcCall('time_entries_list', { p_filter: f });
          setEntries({ data: d, err: null, loading: false });
        } catch (e) { setEntries({ data: null, err: e, loading: false }); }
      }, [JSON.stringify(filter)]);
      useEffect(() => { load(); }, [load]);
      useEffect(() => { if (view === 'entries') loadEntries(); }, [view, loadEntries]);

      const data = report.data;
      const groups = arr(data && data.groups);
      const total = (data && data.total) || {};
      const max = groups.reduce((m, g) => Math.max(m, g.minutes || 0), 0) || 1;

      const exportSummary = () => download('Time_' + group + '_' + range.from + '_' + range.to + '.csv', csv([
        [group === 'member' ? 'Member' : group === 'client' ? 'Client' : group === 'task' ? 'Task' : 'Day',
        'Hours', 'Billable hours', 'Non-billable hours', 'Approved hours', 'Invoiced hours'].concat(fin ? ['Amount (INR)', 'Uninvoiced (INR)'] : []),
        ...groups.map(g => [g.label, hrsOf(g.minutes), hrsOf(g.billable_minutes), hrsOf(g.nonbillable_minutes),
        hrsOf(g.approved_minutes), hrsOf(g.invoiced_minutes)].concat(fin ? [g.amount || 0, g.uninvoiced_amount || 0] : [])),
        ['Total', hrsOf(total.minutes), hrsOf(total.billable_minutes), hrsOf(total.nonbillable_minutes),
        hrsOf(total.approved_minutes), hrsOf(total.invoiced_minutes)].concat(fin ? [total.amount || 0, total.uninvoiced_amount || 0] : []),
      ]));
      const exportEntries = async () => {
        if (!entries.data) await loadEntries();
        const rows = arr((entries.data || {}).rows);
        if (!rows.length) { toast(showToast, 'Nothing to export'); return; }
        download('Time_entries_' + range.from + '_' + range.to + '.csv', csv([
          ['Date', 'Member', 'Client', 'Task', 'ID', 'Note', 'Hours', 'Minutes', 'Billable', 'Approved', 'Invoiced', 'Invoice'],
          ...rows.map(r => [String(r.date).slice(0, 10), r.member_name, r.client_name || 'Agency', r.task_title, r.custom_id,
          r.note || '', hrsOf(r.minutes), r.minutes, r.billable ? 'yes' : 'no', r.approved ? 'yes' : 'no',
          r.invoice_id ? 'yes' : 'no', r.invoice_number || '']),
        ]));
      };

      if (report.off) return h`<${OffState} onRetry=${load}/>`;
      return h`<div>
        <div class="ts-tools">
          <select class="ts-select" aria-label="Period" value=${rangeKey} onChange=${(e) => setRangeKey(e.target.value)}>
            ${RANGES.map(r => h`<option key=${r.key} value=${r.key}>${r.label}</option>`)}
          </select>
          ${rangeKey === 'custom' && h`<${Fragment}>
            <input class="ts-input" type="date" aria-label="From" value=${custom.from} onInput=${(e) => setCustom(c => ({ ...c, from: e.target.value }))}/>
            <input class="ts-input" type="date" aria-label="To" value=${custom.to} onInput=${(e) => setCustom(c => ({ ...c, to: e.target.value }))}/>
          <//>`}
          <select class="ts-select" aria-label="Group by" value=${group} onChange=${(e) => setGroup(e.target.value)}>
            <option value="member">By member</option><option value="client">By client</option>
            <option value="task">By task</option><option value="day">By day</option>
          </select>
          <select class="ts-select" aria-label="Billable" value=${billable} onChange=${(e) => setBillable(e.target.value)}>
            <option value="all">All time</option><option value="yes">Billable only</option><option value="no">Non-billable</option>
          </select>
          ${fin && members.length > 0 && h`<select class="ts-select" aria-label="Member" value=${member} onChange=${(e) => setMember(e.target.value)}>
            <option value="all">Everyone</option>
            ${members.filter(m => m.role_level !== 'client').map(m => h`<option key=${m.id} value=${m.id}>${m.name}</option>`)}
          </select>`}
          ${clientList.length > 0 && h`<select class="ts-select" aria-label="Client" value=${client} onChange=${(e) => setClient(e.target.value)}>
            <option value="all">All clients</option>
            ${clientList.map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
          </select>`}
          <div style=${{ flex: 1 }}></div>
          ${canTrack(role) && h`<button class="ts-btn sm" onClick=${() => setLogging(true)}><i class="ti ti-plus"></i>Log time<//>`}
          <button class="ts-btn sm" onClick=${() => { load(); if (view === 'entries') loadEntries(); }}><i class="ti ti-refresh"></i>Refresh</button>
          <button class="ts-btn sm" onClick=${view === 'entries' ? exportEntries : exportSummary}><i class="ti ti-download"></i>CSV</button>
        </div>

        <div class="ts-stats">
          <div class="ts-stat"><div class="k">Tracked</div><div class="v">${fmtMin(total.minutes || 0)}</div>
            <div class="ts-muted">${fmtD(range.from)} – ${fmtD(range.to)}</div></div>
          <div class="ts-stat"><div class="k">Billable</div><div class="v" style=${{ color: '#30a46c' }}>${fmtMin(total.billable_minutes || 0)}</div>
            <div class="ts-muted">${total.minutes ? Math.round((total.billable_minutes || 0) / total.minutes * 100) : 0}% of tracked</div></div>
          <div class="ts-stat"><div class="k">Non-billable</div><div class="v">${fmtMin(total.nonbillable_minutes || 0)}</div>
            <div class="ts-muted">${fmtMin(total.approved_minutes || 0)} approved</div></div>
          ${fin && h`<div class="ts-stat"><div class="k">Billable value</div>
            <div class="v" style=${{ color: 'var(--cu-accent-ink)' }}>${inr(total.amount || 0)}</div>
            <div class="ts-muted">${inr(total.uninvoiced_amount || 0)} not invoiced yet${total.missing_rate_minutes ? ' · ' + fmtMin(total.missing_rate_minutes) + ' has no rate' : ''}</div></div>`}
        </div>

        <div class="ts-tabs" style=${{ marginBottom: 10 }}>
          ${[['summary', 'Summary'], ['entries', 'Entries']].map(([k, l]) => h`<button key=${k} class=${'ts-tab' + (view === k ? ' on' : '')}
            onClick=${() => setView(k)}>${l}</button>`)}
        </div>

        ${view === 'summary' ? (
          report.loading && !data ? h`<${Loading} rows=${5}/>`
            : report.err ? h`<${Empty} icon="ti-alert-triangle" title="Couldn't load the report" sub=${errText(report.err)}
                action=${h`<button class="ts-btn sm" onClick=${load}>Retry<//>`}/>`
              : !groups.length ? h`<${Empty} icon="ti-clock-off" title="No time in this period" sub="Try a wider range."/>`
                : h`<div class="ts-scroll">
                  <table class="ts-tbl">
                    <thead><tr>
                      <th>${group === 'member' ? 'Member' : group === 'client' ? 'Client' : group === 'task' ? 'Task' : 'Day'}</th>
                      <th style=${{ width: '26%' }}>Split</th>
                      <th class="num">Billable</th><th class="num">Non-billable</th><th class="num">Total</th>
                      ${fin && h`<th class="num">Value</th>`}
                    </tr></thead>
                    <tbody>
                      ${groups.map(g => h`<tr key=${g.key}>
                        <td><div style=${{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          ${g.color && h`<span style=${{ width: 8, height: 8, borderRadius: 4, background: g.color, flexShrink: 0 }}></span>`}
                          <div style=${{ minWidth: 0 }}>
                            <div style=${{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${g.label}</div>
                            ${g.sub && h`<div class="ts-muted">${g.sub}</div>`}
                          </div></div></td>
                        <td><div class="ts-bar" title=${fmtMin(g.billable_minutes) + ' billable · ' + fmtMin(g.nonbillable_minutes) + ' non-billable'}>
                          <span style=${{ width: (g.minutes / max * (g.billable_minutes / (g.minutes || 1)) * 100) + '%', background: '#30a46c' }}></span>
                          <span style=${{ width: (g.minutes / max * (g.nonbillable_minutes / (g.minutes || 1)) * 100) + '%', background: 'var(--cu-bd2)' }}></span>
                        </div></td>
                        <td class="num">${fmtMin(g.billable_minutes)}</td>
                        <td class="num">${fmtMin(g.nonbillable_minutes)}</td>
                        <td class="num"><strong>${fmtMin(g.minutes)}</strong></td>
                        ${fin && h`<td class="num">${g.amount != null ? inr(g.amount) : '—'}</td>`}
                      </tr>`)}
                    </tbody>
                  </table>
                </div>`
        ) : (
          entries.loading && !entries.data ? h`<${Loading} rows=${6}/>`
            : entries.err ? h`<${Empty} icon="ti-alert-triangle" title="Couldn't load entries" sub=${errText(entries.err)}
                action=${h`<button class="ts-btn sm" onClick=${loadEntries}>Retry<//>`}/>`
              : !arr((entries.data || {}).rows).length ? h`<${Empty} icon="ti-clock-off" title="No entries" sub="Nothing tracked in this period."/>`
                : h`<div class="ts-scroll">
                  <table class="ts-tbl">
                    <thead><tr><th>Date</th><th>Member</th><th>Task</th><th>Note</th><th class="num">Time</th><th>Flags</th><th></th></tr></thead>
                    <tbody>
                      ${arr(entries.data.rows).map(r => h`<tr key=${r.id}>
                        <td class="ts-muted">${fmtD(String(r.date).slice(0, 10), { day: 'numeric', month: 'short' })}</td>
                        <td>${r.member_name}</td>
                        <td><button class="ts-link" style=${{ fontWeight: 500, textAlign: 'left' }} onClick=${() => openTask && openTask(r.task_id)}>
                          ${r.task_title}</button><div class="ts-muted">${[r.custom_id, r.client_name || 'Agency'].filter(Boolean).join(' · ')}</div></td>
                        <td class="ts-muted" style=${{ maxWidth: 220 }}>${r.note || '—'}</td>
                        <td class="num">${fmtMin(r.minutes)}</td>
                        <td>
                          <span class="ts-pill" style=${{ color: r.billable ? '#30a46c' : 'var(--cu-t3)', background: r.billable ? 'rgba(48,164,108,.12)' : 'var(--cu-bg3)' }}>
                            ${r.billable ? 'Billable' : 'Internal'}</span>
                          ${r.invoice_id ? h`<span class="ts-pill" style=${{ marginLeft: 4, color: 'var(--cu-accent-ink)', background: 'var(--cu-accent-fog)' }}
                            title=${r.invoice_number ? 'On invoice ' + r.invoice_number : 'Invoiced'}>Invoiced</span>`
              : r.approved ? h`<span class="ts-pill" style=${{ marginLeft: 4, color: '#30a46c', background: 'rgba(48,164,108,.12)' }}>Approved</span>` : null}
                        </td>
                        <td style=${{ textAlign: 'right' }}>
                          <button class="ts-ibtn" aria-label="Edit entry" disabled=${!!r.lock} title=${r.lock ? errText({ message: 'time.' + r.lock }) : 'Edit'}
                            onClick=${() => setEditing(r)}><i class="ti ti-pencil"></i></button>
                        </td>
                      </tr>`)}
                    </tbody>
                  </table>
                </div>`
        )}
        ${editing && h`<${EntryEditor} entry=${editing} showToast=${showToast} onClose=${() => setEditing(null)}
          onSaved=${() => { setEditing(null); loadEntries(); load(); }}/>`}
        ${logging && h`<${LogTimeModal} showToast=${showToast} onClose=${() => setLogging(false)}
          onSaved=${() => { setLogging(false); loadEntries(); load(); }}/>`}
      </div>`;
    }

    // =======================================================================
    // Tab: Rates (finance)
    // =======================================================================
    function RatesTab({ currentUser, showToast, clients }) {
      const store = useTaskStore ? useTaskStore() : {};
      const members = arr(store.members).filter(m => m.role_level !== 'client');
      const clientList = arr(clients).length ? arr(clients) : arr(store.clients);
      const canEdit = isMgr(currentUser && currentUser.role_level);
      const [state, setState] = useState({ rows: null, err: null, off: false, loading: true });
      const [form, setForm] = useState(null);
      const [busy, setBusy] = useState(false);
      const load = useCallback(async () => {
        setState(s => ({ ...s, loading: true }));
        try { const rows = await rpcCall('time_rates_list', {}); setState({ rows: arr(rows), err: null, off: false, loading: false }); }
        catch (e) {
          if (isMissingRpc(e)) setState({ rows: [], err: null, off: true, loading: false });
          else setState({ rows: null, err: e, off: false, loading: false });
        }
      }, []);
      useEffect(() => { load(); }, [load]);
      const save = async () => {
        setBusy(true);
        try {
          await rpcCall('time_rate_upsert', {
            p_data: {
              id: form.id || null, client_id: form.client_id || null, member_id: form.member_id || null,
              hourly_rate: Number(form.hourly_rate), currency: 'INR',
            }
          });
          toast(showToast, 'Rate saved'); setForm(null); load();
        } catch (e) { toast(showToast, errText(e)); }
        finally { setBusy(false); }
      };
      const del = async (row) => {
        if (!window.confirm('Delete this rate? Time already invoiced keeps the amount it was billed at.')) return;
        try { await rpcCall('time_rate_delete', { p_id: row.id }); toast(showToast, 'Rate deleted'); load(); }
        catch (e) { toast(showToast, errText(e)); }
      };
      if (state.off) return h`<${OffState} onRetry=${load}/>`;
      const rows = arr(state.rows);
      return h`<div>
        <div class="ts-banner" style=${{ background: 'var(--cu-bg2)' }}>
          <i class="ti ti-info-circle" style=${{ color: 'var(--cu-t3)' }}></i>
          <div class="bd">Billable time is priced at the most specific rate that fits: <strong>this person on this client</strong>,
            then the client's default, then that person's rate everywhere, then the agency default.</div>
        </div>
        <div class="ts-tools">
          ${canEdit && h`<button class="ts-btn pri sm" onClick=${() => setForm({ client_id: '', member_id: '', hourly_rate: '' })}><i class="ti ti-plus"></i>Add rate<//>`}
          <button class="ts-btn sm" onClick=${load}><i class="ti ti-refresh"></i>Refresh</button>
          ${!canEdit && h`<span class="ts-muted">Read-only — finance writes need an admin or manager.</span>`}
        </div>
        ${state.loading && !state.rows ? h`<${Loading} rows=${4}/>`
          : state.err ? h`<${Empty} icon="ti-alert-triangle" title="Couldn't load rates" sub=${errText(state.err)}
              action=${h`<button class="ts-btn sm" onClick=${load}>Retry<//>`}/>`
            : !rows.length ? h`<${Empty} icon="ti-currency-rupee" title="No rates yet"
                sub="Add an agency default so tracked time can turn into invoice lines."/>`
              : h`<div class="ts-scroll">
                <table class="ts-tbl">
                  <thead><tr><th>Client</th><th>Person</th><th class="num">Hourly rate</th><th>Updated</th><th></th></tr></thead>
                  <tbody>
                    ${rows.map(r => h`<tr key=${r.id}>
                      <td>${r.client_name || h`<span class="ts-muted">All clients</span>`}</td>
                      <td>${r.member_name || h`<span class="ts-muted">Everyone</span>`}</td>
                      <td class="num">${inr(r.hourly_rate)}</td>
                      <td class="ts-muted">${r.updated_at && fmtRelative ? fmtRelative(r.updated_at) : ''}</td>
                      <td style=${{ textAlign: 'right' }}>
                        ${canEdit && h`<${Fragment}>
                          <button class="ts-ibtn" aria-label="Edit rate" onClick=${() => setForm({ ...r, client_id: r.client_id || '', member_id: r.member_id || '' })}><i class="ti ti-pencil"></i></button>
                          <button class="ts-ibtn" aria-label="Delete rate" onClick=${() => del(r)}><i class="ti ti-trash"></i></button>
                        <//>`}
                      </td>
                    </tr>`)}
                  </tbody>
                </table>
              </div>`}
        ${form && h`<${Modal} title=${form.id ? 'Edit rate' : 'Add rate'} onClose=${() => setForm(null)}
          footer=${h`<${Fragment}>
            <button class="ts-btn" onClick=${() => setForm(null)}>Cancel</button>
            <button class="ts-btn pri" disabled=${busy || !(Number(form.hourly_rate) >= 0)} onClick=${save}>Save rate</button>
          <//>`}>
          <div style=${{ display: 'grid', gap: 12 }}>
            <div><span class="ts-lbl">Client</span>
              <select class="ts-select" style=${{ width: '100%' }} value=${form.client_id} onChange=${(e) => setForm(f => ({ ...f, client_id: e.target.value }))}>
                <option value="">All clients (default)</option>
                ${clientList.map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
              </select></div>
            <div><span class="ts-lbl">Person</span>
              <select class="ts-select" style=${{ width: '100%' }} value=${form.member_id} onChange=${(e) => setForm(f => ({ ...f, member_id: e.target.value }))}>
                <option value="">Everyone</option>
                ${members.map(m => h`<option key=${m.id} value=${m.id}>${m.name}</option>`)}
              </select></div>
            <div><span class="ts-lbl">Hourly rate (₹)</span>
              <input class="ts-input" type="number" min="0" step="50" style=${{ width: 160 }} value=${form.hourly_rate}
                onInput=${(e) => setForm(f => ({ ...f, hourly_rate: e.target.value }))}/></div>
          </div>
        <//>`}
      </div>`;
    }

    // =======================================================================
    // Page
    // =======================================================================
    const TABS = [
      { key: 'my', label: 'My timesheet', icon: 'ti-table', show: (r) => canTrack(r) },
      { key: 'all', label: 'All timesheets', icon: 'ti-users', show: (r) => isFin(r) },
      { key: 'approvals', label: 'Approvals', icon: 'ti-checks', show: (r) => isMgr(r) },
      { key: 'report', label: 'Time report', icon: 'ti-chart-bar', show: () => true },
      { key: 'rates', label: 'Rates', icon: 'ti-currency-rupee', show: (r) => isFin(r) },
    ];

    function TimesheetsPage({ currentUser, clients, team, onNavigate, showToast, params }) {
      const role = currentUser && currentUser.role_level;
      const tabs = TABS.filter(t => t.show(role));
      const wanted = arr(params)[0];
      const [tab, setTab] = useState(() => (tabs.some(t => t.key === wanted) ? wanted : (tabs[0] && tabs[0].key)));
      useEffect(() => { if (wanted && tabs.some(t => t.key === wanted) && wanted !== tab) setTab(wanted); }, [wanted]);
      const [pendCount, setPendCount] = useState(pend.count);
      useEffect(() => {
        if (!isMgr(role)) return;
        pendPoll();
        const iv = setInterval(() => setPendCount(pend.count), 5000);
        setPendCount(pend.count);
        return () => clearInterval(iv);
      }, [role]);
      const go = (k) => { setTab(k); goTab(k); };
      if (!tabs.length) return h`<div class="ts-page"><${Empty} icon="ti-lock" title="Timesheets aren't available for your role"/></div>`;
      return h`<div class="ts-page">
        <div class="ts-head">
          <div>
            <h1 class="ts-title"><i class="ti ti-clock-hour-4" style=${{ color: 'var(--cu-t3)' }}></i>Timesheets</h1>
            <div class="ts-sub">Track hours against tasks, get the week approved, and turn billable time into invoices.</div>
          </div>
          <${RunningTimer} showToast=${showToast} currentUser=${currentUser}/>
        </div>
        <div class="ts-tabs" role="tablist">
          ${tabs.map(t => h`<button key=${t.key} class=${'ts-tab' + (tab === t.key ? ' on' : '')} role="tab"
            aria-selected=${tab === t.key ? 'true' : 'false'} onClick=${() => go(t.key)}>
            <i class=${'ti ' + t.icon} style=${{ fontSize: 14 }}></i>${t.label}
            ${t.key === 'approvals' && pendCount ? h`<span class="n">${pendCount}</span>` : null}
          </button>`)}
        </div>
        ${tab === 'my' && h`<${MyTimesheetTab} currentUser=${currentUser} showToast=${showToast}/>`}
        ${tab === 'all' && h`<${AllTimesheetsTab} currentUser=${currentUser} showToast=${showToast} team=${team}/>`}
        ${tab === 'approvals' && h`<${ApprovalsTab} currentUser=${currentUser} showToast=${showToast}/>`}
        ${tab === 'report' && h`<${TimeReportTab} currentUser=${currentUser} showToast=${showToast} clients=${clients}/>`}
        ${tab === 'rates' && h`<${RatesTab} currentUser=${currentUser} showToast=${showToast} clients=${clients}/>`}
      </div>`;
    }

    // =======================================================================
    // Cards
    // =======================================================================
    function Shell({ title, icon, count, right, ctl, onRefresh, children }) {
      if (CardShell) return h`<${CardShell} title=${title} icon=${icon} count=${count} right=${right} ctl=${ctl} onRefresh=${onRefresh}>${children}<//>`;
      if (SectionCard) return h`<${SectionCard} title=${title} right=${right}>${children}<//>`;
      return h`<section class="ts-card" style=${{ padding: 12 }}>
        <div style=${{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <i class=${'ti ' + icon} style=${{ color: 'var(--cu-t3)' }}></i>
          <strong style=${{ flex: 1 }}>${title}</strong>${right}
        </div>${children}</section>`;
    }
    function useRpc(name, args, deps) {
      const [state, setState] = useState({ data: null, err: null, off: false, loading: true });
      const load = useCallback(async () => {
        setState(s => ({ ...s, loading: true }));
        try { const d = await rpcCall(name, args); setState({ data: d, err: null, off: false, loading: false }); }
        catch (e) {
          if (isMissingRpc(e)) setState({ data: null, err: null, off: true, loading: false });
          else setState({ data: null, err: e, off: false, loading: false });
        }
      }, deps || []);
      useEffect(() => { load(); }, [load]);
      return { ...state, reload: load };
    }
    const cardOff = (title) => h`<${Empty} icon="ti-clock-off" title=${title || 'Time tracking is off'} sub="Nothing to show yet."/>`;

    function TimeReportCard({ ctl, currentUser, showToast }) {
      const role = currentUser && currentUser.role_level;
      const fin = isFin(role);
      const [span, setSpan] = useState('week');
      const range = span === 'week' ? { from: weekStartOf(todayISO()), to: todayISO() } : { from: monthStart(todayISO()), to: todayISO() };
      const q = useRpc('time_report', { p_filter: { ...range, group_by: fin ? 'member' : 'client' } }, [span, fin]);
      const groups = arr(q.data && q.data.groups).slice(0, 8);
      const total = (q.data && q.data.total) || {};
      const max = groups.reduce((m, g) => Math.max(m, g.minutes || 0), 0) || 1;
      const right = h`<${Fragment}>
        <button class=${'ts-btn sm'} style=${{ marginRight: 4 }} onClick=${() => setSpan(s => s === 'week' ? 'month' : 'week')}>${span === 'week' ? 'Week' : 'Month'}</button>
        <button class="ts-link" onClick=${() => goTab('report')}>Open</button>
      <//>`;
      return h`<${Shell} title="Time report" icon="ti-chart-bar" ctl=${ctl} onRefresh=${q.reload}
        count=${q.data ? fmtMin(total.minutes || 0) : null} right=${right}>
        ${q.off ? cardOff() : q.loading && !q.data ? h`<${Loading} rows=${3}/>`
          : !groups.length ? h`<${Empty} icon="ti-clock-off" title="No time tracked yet" sub=${span === 'week' ? 'Nothing this week.' : 'Nothing this month.'}/>`
            : h`<div style=${{ padding: '2px 6px 6px' }}>
              ${groups.map(g => h`<div key=${g.key} style=${{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 70px', gap: 8, alignItems: 'center', padding: '5px 2px' }}>
                <div style=${{ minWidth: 0 }}>
                  <div style=${{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${g.label}</div>
                  <div class="ts-bar" style=${{ marginTop: 4 }}>
                    <span style=${{ width: (g.minutes / max * 100) + '%', background: g.color || 'var(--cu-accent)' }}></span>
                  </div>
                </div>
                <div class="num" style=${{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>
                  ${fmtMin(g.minutes)}${fin && g.amount != null ? h`<div class="ts-muted">${inr(g.amount)}</div>` : null}
                </div>
              </div>`)}
            </div>`}
      <//>`;
    }

    function TimesheetStatusCard({ ctl, currentUser, showToast }) {
      const role = currentUser && currentUser.role_level;
      const mgr = isFin(role);
      const ws = weekStartOf(todayISO());
      const list = useRpc('timesheets_list', { p_filter: { from: addDays(ws, -7), to: ws, include_missing: true } }, [ws, mgr]);
      const mine = useRpc('timesheet_week_get', { p_week_start: ws, p_member_id: null }, [ws, mgr]);
      if (!mgr) {
        const d = mine.data;
        const perDay = Math.round((Number(d && d.settings && d.settings.hours_per_day) || 8) * 60);
        const days = arr(d && d.settings && d.settings.work_days).length ? arr(d.settings.work_days).length : 5;
        const target = perDay * days;
        const pct = target ? Math.min(100, Math.round(((d && d.total) || 0) / target * 100)) : 0;
        return h`<${Shell} title="My timesheet" icon="ti-clock-check" ctl=${ctl} onRefresh=${mine.reload}
          right=${h`<button class="ts-link" onClick=${() => goTab('my')}>Open</button>`}>
          ${mine.off ? cardOff() : mine.loading && !d ? h`<${Loading} rows=${2}/>`
            : h`<div style=${{ padding: '4px 8px 8px' }}>
              <div style=${{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style=${{ font: '600 20px Inter,sans-serif', fontVariantNumeric: 'tabular-nums' }}>${fmtMin((d && d.total) || 0)}</span>
                <span class="ts-muted">of ${Math.round(target / 60)}h this week</span>
                <span style=${{ flex: 1 }}></span><${StatusPill} status=${(d && d.status) || 'draft'}/>
              </div>
              <div class="ts-bar"><span style=${{ width: pct + '%', background: pct >= 100 ? '#30a46c' : 'var(--cu-accent)' }}></span></div>
              <div class="ts-muted" style=${{ marginTop: 8 }}>
                ${(d && d.status) === 'rejected' ? 'Changes were requested — open your timesheet.'
                : (d && d.status) === 'submitted' ? 'Submitted, waiting for review.'
                  : (d && d.status) === 'approved' ? 'Approved for this week.'
                    : 'Fill the week and submit it by Friday.'}
              </div>
            </div>`}
        <//>`;
      }
      const rows = arr(list.data);
      const thisWeek = rows.filter(r => r.week_start === ws);
      const counts = thisWeek.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
      const waiting = rows.filter(r => r.status === 'submitted');
      return h`<${Shell} title="Timesheet status" icon="ti-clock-check" ctl=${ctl} onRefresh=${list.reload}
        count=${waiting.length ? waiting.length + ' waiting' : null}
        right=${h`<button class="ts-link" onClick=${() => goTab(isMgr(role) ? 'approvals' : 'all')}>Open</button>`}>
        ${list.off ? cardOff() : list.loading && !list.data ? h`<${Loading} rows=${3}/>`
          : !thisWeek.length ? h`<${Empty} icon="ti-users" title="No timesheets this week"/>`
            : h`<div style=${{ padding: '2px 8px 8px' }}>
              <div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                ${['submitted', 'approved', 'rejected', 'draft', 'missing'].filter(s => counts[s]).map(s =>
              h`<span key=${s} class="ts-pill" style=${{ color: STATUS_META[s].color, background: STATUS_META[s].bg }}>${counts[s]} ${STATUS_META[s].label}</span>`)}
              </div>
              ${waiting.slice(0, 5).map(r => h`<div key=${r.id || r.member_id} style=${{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                ${MemberAvatar ? h`<${MemberAvatar} member=${{ id: r.member_id, name: r.member_name, initials: r.member_initials, color: r.member_color }} size=${20}/>` : null}
                <span style=${{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12.5 }}>${r.member_name}</span>
                <span class="ts-muted">${fmtMin(r.total_minutes)}</span>
              </div>`)}
              ${!waiting.length && h`<div class="ts-muted">Nothing waiting for approval.</div>`}
            </div>`}
      <//>`;
    }

    function BillableMonthCard({ ctl, currentUser, showToast, onNavigate }) {
      const role = currentUser && currentUser.role_level;
      const range = { from: monthStart(todayISO()), to: todayISO() };
      const q = useRpc('time_report', { p_filter: { ...range, group_by: 'client', billable: true } }, [range.from, range.to]);
      const groups = arr(q.data && q.data.groups).filter(g => g.key !== 'agency').slice(0, 6);
      const total = (q.data && q.data.total) || {};
      const bill = (g) => {
        try {
          window.dispatchEvent(new CustomEvent('ams-billing-new-invoice', { detail: { clientId: g.key, withTime: true } }));
          window.__amsBillingIntent = { type: 'new-invoice', clientId: g.key, withTime: true };
        } catch (_) { }
        if (onNavigate) onNavigate('billing', { clientId: g.key });
      };
      return h`<${Shell} title="Billable this month" icon="ti-cash" ctl=${ctl} onRefresh=${q.reload}
        count=${q.data ? fmtMin(total.billable_minutes || 0) : null}
        right=${h`<button class="ts-link" onClick=${() => goTab('report')}>Report</button>`}>
        ${q.off ? cardOff() : q.loading && !q.data ? h`<${Loading} rows=${3}/>`
          : !groups.length ? h`<${Empty} icon="ti-cash-off" title="No billable time yet" sub="Tracked client time shows up here."/>`
            : h`<div style=${{ padding: '2px 8px 8px' }}>
              <div style=${{ display: 'flex', gap: 14, marginBottom: 8 }}>
                <div><div class="ts-muted">Value</div><div style=${{ font: '600 18px Inter,sans-serif' }}>${inr(total.amount || 0)}</div></div>
                <div><div class="ts-muted">Not invoiced</div><div style=${{ font: '600 18px Inter,sans-serif', color: 'var(--cu-accent-ink)' }}>${inr(total.uninvoiced_amount || 0)}</div></div>
              </div>
              ${groups.map(g => h`<div key=${g.key} style=${{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style=${{ width: 8, height: 8, borderRadius: 4, background: g.color || 'var(--cu-t3)', flexShrink: 0 }}></span>
                <span style=${{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12.5 }}>${g.label}</span>
                <span class="ts-muted">${fmtMin(g.billable_minutes)}</span>
                <strong style=${{ fontVariantNumeric: 'tabular-nums', fontSize: 12.5 }}>${inr(g.uninvoiced_amount != null ? g.uninvoiced_amount : g.amount)}</strong>
                ${isMgr(role) && (g.uninvoiced_amount || 0) > 0 && h`<button class="ts-btn sm" title="Create an invoice with this time" onClick=${() => bill(g)}>Bill</button>`}
              </div>`)}
              ${total.missing_rate_minutes ? h`<div class="ts-muted" style=${{ marginTop: 6 }}>
                ${fmtMin(total.missing_rate_minutes)} has no hourly rate — <button class="ts-link" onClick=${() => goTab('rates')}>set rates</button></div>` : null}
            </div>`}
      <//>`;
    }

    function EstimateTrackedCard({ ctl, currentUser, showToast }) {
      const role = currentUser && currentUser.role_level;
      const scope = isFin(role) || isPrivilegedRole && isPrivilegedRole(role) ? 'all' : 'my';
      const q = useRpc('time_estimate_vs_tracked', { p_filter: { scope, limit: 40 } }, [scope]);
      const rows = arr(q.data && q.data.rows).filter(r => r.estimate_minutes > 0).slice(0, 7);
      const total = (q.data && q.data.total) || {};
      return h`<${Shell} title="Estimated vs tracked" icon="ti-progress" ctl=${ctl} onRefresh=${q.reload}
        count=${q.data ? (total.over_count || 0) + ' over' : null}>
        ${q.off ? cardOff() : q.loading && !q.data ? h`<${Loading} rows=${3}/>`
          : !rows.length ? h`<${Empty} icon="ti-progress-check" title="No estimates yet" sub="Add a time estimate to a task to track it here."/>`
            : h`<div style=${{ padding: '2px 8px 8px' }}>
              ${rows.map(r => {
          const pct = Math.min(100, Math.round((r.tracked_minutes / (r.estimate_minutes || 1)) * 100));
          const over = r.tracked_minutes > r.estimate_minutes;
          return h`<div key=${r.task_id} style=${{ padding: '5px 0' }}>
                  <div style=${{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button class="ts-link" style=${{ flex: 1, minWidth: 0, textAlign: 'left', color: 'var(--cu-t1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      onClick=${() => openTask && openTask(r.task_id)}>${r.title}</button>
                    <span class="ts-muted" style=${{ color: over ? '#e5484d' : undefined }}>${fmtMin(r.tracked_minutes)} / ${fmtMin(r.estimate_minutes)}</span>
                  </div>
                  <div class="ts-bar" style=${{ marginTop: 4 }}><span style=${{ width: pct + '%', background: over ? '#e5484d' : '#30a46c' }}></span></div>
                </div>`;
        })}
              <div class="ts-muted" style=${{ marginTop: 8 }}>
                ${fmtMin(total.tracked_minutes || 0)} tracked against ${fmtMin(total.estimate_minutes || 0)} estimated
                ${total.unestimated_count ? ' · ' + total.unestimated_count + ' task' + (total.unestimated_count === 1 ? '' : 's') + ' with no estimate' : ''}
              </div>
            </div>`}
      <//>`;
    }

    // =======================================================================
    // Registry
    // =======================================================================
    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key || item.type;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item);
    };

    reg('pages', {
      id: 'timesheets', label: 'Timesheets', icon: 'ti-clock-hour-4', section: 'rail', order: 55,
      apps: ['dashboard', 'tasks'],
      roles: (role) => !!role && role !== 'client' && window.__amsTimesheetsOff !== true,
      badge: () => { if (isMgr((window.__amsCurrentRole) || '')) pendPoll(); return pend.count || null; },
      Component: TimesheetsPage,
    });

    const CARD_TYPES = [
      { type: 'time_report', name: 'Time report', icon: 'ti-chart-bar', category: 'Work', w: 1, desc: 'Hours tracked this week or month, by person or client.', roles: (r) => canTrack(r) || isFin(r), Component: TimeReportCard },
      { type: 'timesheet_status', name: 'Timesheet status', icon: 'ti-clock-check', category: 'Team', w: 1, desc: 'Where this week\'s timesheets stand — or how your own is doing.', roles: (r) => !!r && r !== 'client', Component: TimesheetStatusCard },
      { type: 'billable_month', name: 'Billable this month', icon: 'ti-cash', category: 'Money', w: 1, desc: 'Billable hours and value per client, and what hasn\'t been invoiced.', roles: (r) => isFin(r), Component: BillableMonthCard },
      { type: 'time_estimate_tracked', name: 'Estimated vs tracked', icon: 'ti-progress', category: 'Work', w: 1, desc: 'Tasks running over their time estimate.', roles: (r) => !!r && r !== 'client', Component: EstimateTrackedCard },
    ];
    CARD_TYPES.forEach(c => reg('cards', c));

    return { TimesheetsPage, WeekGrid, RunningTimer, CARD_TYPES };
  }

  window.AMS_TIMESHEETS = { buildTimesheets };
})();

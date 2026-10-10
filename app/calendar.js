/* ============================================================================
 * calendar.js — Google Calendar (two-way), Planner, Google Drive
 * ClickUp parity v2 · workstream J · migration 100_google_calendar.sql
 *
 *   window.AMS_CALENDAR.buildCalendar(deps) →
 *     { PlannerPage, CalendarSettingsSection, DriveAttachSection, gcal }
 *
 * What this module gives the app:
 *   • Settings → Google Calendar: connect (GIS authorization-code flow, the code
 *     goes to the google-calendar Edge Function which holds the client secret),
 *     pick which calendars to show, push assigned tasks on/off (+ which types),
 *     enable Google Drive, sync now, disconnect.
 *   • Planner page (#/planner): day/week time grid with Google events + my timed
 *     tasks, an Unscheduled/Overdue tray, drag to schedule, drag/resize to change
 *     time and duration, and "Plan my day" which fills the free gaps.
 *   • AMS_EXT.agendaSources 'gcal' → Google events in the Home agenda card.
 *   • AMS_EXT.composerTools + taskPanelSections 'gdrive' → attach files with the
 *     Google Picker; AMS_EXT.paletteProviders 'drive' → Drive search in ⌘K.
 *
 * Fail-open everywhere: no migration 100 (RPC missing), no GOOGLE_CLIENT_SECRET,
 * no connection or no Drive scope ⇒ the surfaces hide themselves and nothing
 * throws. The Planner itself still works without Google (tasks only).
 * ==========================================================================*/
(function () {
  function buildCalendar(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo,
            rpcCall, SB_URL, SB_KEY, TaskAPI, taskBus, useTasks, openTask, openCreateTask,
            GOOGLE_LOGIN_CLIENT_ID } = deps;
    const PRIORITIES = deps.PRIORITIES || { 1: { label: 'Urgent', color: '#e5484d' }, 2: { label: 'High', color: '#f5a623' },
                                            3: { label: 'Normal', color: '#4c8df6' }, 4: { label: 'Low', color: '#9aa0a6' } };
    const TYPE_META = deps.TYPE_META || {};
    const isDone = deps.isDone || ((r) => !!r && r.status_category === 'done');

    // ---- extension registry (de-duped by id) -------------------------------
    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key || item.type;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item);
    };
    const unreg = (key, id) => { EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== id); };
    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i.test(
      String((e && (e.code || '')) + ' ' + (e && (e.message || e.details || '') || '')));

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-calendar-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-calendar-styles';
      st.textContent = `
      :where(:root){--cu-bg:#ffffff;--cu-bg2:#f7f7f8;--cu-bg3:#efeff1;--cu-bd:#e8e8eb;--cu-bd2:#d6d6db;--cu-t1:#1f1f23;--cu-t2:#5c5c66;--cu-t3:#8e8e99;--cu-accent:#ff00ee;--cu-accent-ink:#a8009c;--cu-accent-fog:rgba(255,0,238,.08);--cu-radius:8px;--cu-radius-sm:6px;--cu-shadow:0 8px 28px rgba(15,15,20,.14),0 2px 6px rgba(15,15,20,.06)}
      :where(html.dark){--cu-bg:#1c1b1f;--cu-bg2:#161518;--cu-bg3:#26252a;--cu-bd:#2d2c31;--cu-bd2:#3b3a40;--cu-t1:#ececef;--cu-t2:#a9a8b1;--cu-t3:#75747d;--cu-accent:#ff66f5;--cu-accent-ink:#ff7df6;--cu-accent-fog:rgba(255,102,245,.12);--cu-shadow:0 10px 30px rgba(0,0,0,.55)}
      .gc-root{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--cu-t1);min-width:0}
      .gc-root *{box-sizing:border-box}
      .gc-root button:focus-visible,.gc-root input:focus-visible,.gc-root select:focus-visible,.gc-root [tabindex]:focus-visible{outline:2px solid var(--cu-accent);outline-offset:1px}
      .gc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:var(--cu-radius-sm);border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t1);font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;white-space:nowrap;text-decoration:none}
      .gc-btn:hover{background:var(--cu-bg3)}
      .gc-btn:disabled{opacity:.5;cursor:not-allowed}
      .gc-btn.pri{background:var(--cu-accent);border-color:var(--cu-accent);color:#fff}
      .gc-btn.pri:hover{background:#e600d6;border-color:#e600d6}
      html.dark .gc-btn.pri{color:#1b0019}
      .gc-btn.ghost{border-color:transparent;background:transparent;color:var(--cu-t2)}
      .gc-btn.ghost:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .gc-btn.sm{height:26px;padding:0 9px;font-size:12px}
      .gc-btn.danger{color:#e5484d;border-color:rgba(229,72,77,.4)}
      .gc-ico{width:30px;height:30px;padding:0;border-radius:var(--cu-radius-sm);border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
      .gc-ico:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .gc-card{background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);margin-bottom:16px}
      .gc-card-hd{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--cu-bd);flex-wrap:wrap}
      .gc-card-t{font-size:15px;font-weight:600;flex:1;min-width:140px}
      .gc-card-s{font-size:12px;color:var(--cu-t3);margin-top:1px;line-height:1.4;font-weight:400}
      .gc-card-b{padding:14px 16px}
      .gc-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .gc-srow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--cu-bd)}
      .gc-srow:first-child{border-top:none}
      .gc-srow-t{font-size:13.5px;font-weight:500}
      .gc-srow-s{font-size:12px;color:var(--cu-t3);margin-top:2px;line-height:1.45}
      .gc-hint{font-size:12px;color:var(--cu-t3);line-height:1.5}
      .gc-note{font-size:12.5px;line-height:1.5;padding:9px 12px;border-radius:var(--cu-radius-sm);background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.35);margin-bottom:12px}
      .gc-note.err{background:rgba(229,72,77,.1);border-color:rgba(229,72,77,.35)}
      .gc-dot{width:8px;height:8px;border-radius:50%;background:var(--cu-t3);flex-shrink:0}
      .gc-dot.on{background:#30a46c;box-shadow:0 0 0 3px rgba(48,164,108,.22)}
      .gc-dot.warn{background:#f5a623}
      .gc-sw{width:36px;height:20px;border-radius:10px;border:none;background:var(--cu-bd2);position:relative;cursor:pointer;flex-shrink:0;padding:0;transition:background .15s}
      .gc-sw.on{background:var(--cu-accent)}
      .gc-sw:disabled{opacity:.5;cursor:not-allowed}
      .gc-sw-k{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
      .gc-sw.on .gc-sw-k{transform:translateX(16px)}
      .gc-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:13px;border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t2);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
      .gc-chip.on{border-color:var(--cu-accent);background:var(--cu-accent-fog);color:var(--cu-accent-ink)}
      .gc-cal{display:flex;align-items:center;gap:9px;padding:7px 0;font-size:13px;cursor:pointer}
      .gc-swatch{width:11px;height:11px;border-radius:3px;flex-shrink:0}
      .gc-in{height:30px;padding:0 9px;border:1px solid var(--cu-bd2);border-radius:var(--cu-radius-sm);background:var(--cu-bg);color:var(--cu-t1);font-size:13px;font-family:inherit;min-width:0}
      .gc-in:focus{outline:none;border-color:var(--cu-accent)}
      .gc-modal-bg{position:fixed;inset:0;background:rgba(10,10,14,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:18px}
      .gc-modal{background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);box-shadow:var(--cu-shadow);width:100%;max-width:520px;max-height:86vh;display:flex;flex-direction:column;overflow:hidden}
      .gc-modal-hd{padding:14px 16px;border-bottom:1px solid var(--cu-bd);font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px}
      .gc-modal-b{padding:14px 16px;overflow:auto;min-height:0}
      .gc-modal-ft{padding:12px 16px;border-top:1px solid var(--cu-bd);display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
      /* ---- Planner ---- */
      .gc-pl{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--cu-bg)}
      .gc-pl-bar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--cu-bd);flex-wrap:wrap;background:var(--cu-bg)}
      .gc-pl-title{font-size:16px;font-weight:600;min-width:120px}
      .gc-seg{display:inline-flex;border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);overflow:hidden}
      .gc-seg button{height:28px;padding:0 11px;border:none;background:var(--cu-bg);color:var(--cu-t2);font-size:12.5px;font-weight:600;font-family:inherit;cursor:pointer}
      .gc-seg button.on{background:var(--cu-accent-fog);color:var(--cu-accent-ink)}
      .gc-sp{flex:1;min-width:8px}
      .gc-pl-body{flex:1;display:flex;min-height:0}
      .gc-tray{width:264px;flex:0 0 264px;border-right:1px solid var(--cu-bd);background:var(--cu-bg2);display:flex;flex-direction:column;min-height:0}
      .gc-tray-tabs{display:flex;gap:4px;padding:10px 10px 6px}
      .gc-tray-tabs button{flex:1;height:28px;border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t2);border-radius:var(--cu-radius-sm);font-size:12.5px;font-weight:600;font-family:inherit;cursor:pointer}
      .gc-tray-tabs button.on{background:var(--cu-accent-fog);border-color:var(--cu-accent);color:var(--cu-accent-ink)}
      .gc-tray-list{flex:1;overflow-y:auto;padding:4px 10px 14px;min-height:0}
      .gc-titem{display:flex;gap:8px;align-items:flex-start;padding:8px 9px;margin-bottom:6px;border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);background:var(--cu-bg);cursor:grab;font-size:13px;line-height:1.35}
      .gc-titem:hover{border-color:var(--cu-bd2)}
      .gc-titem:active{cursor:grabbing}
      .gc-titem-t{font-weight:500;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
      .gc-titem-m{font-size:11.5px;color:var(--cu-t3);margin-top:3px;display:flex;gap:6px;flex-wrap:wrap}
      .gc-main{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
      .gc-hd-row{display:flex;border-bottom:1px solid var(--cu-bd);background:var(--cu-bg)}
      .gc-gutter{width:56px;flex:0 0 56px;border-right:1px solid var(--cu-bd)}
      .gc-hd-day{flex:1;min-width:0;padding:6px 4px;text-align:center;border-left:1px solid var(--cu-bd)}
      .gc-hd-day:first-child{border-left:none}
      .gc-hd-dow{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3)}
      .gc-hd-num{font-size:15px;font-weight:600}
      .gc-hd-day.today .gc-hd-num{color:var(--cu-accent-ink)}
      .gc-allday{display:flex;border-bottom:1px solid var(--cu-bd);min-height:34px;background:var(--cu-bg)}
      .gc-allday-lbl{width:56px;flex:0 0 56px;border-right:1px solid var(--cu-bd);font-size:10.5px;color:var(--cu-t3);padding:6px 6px;text-align:right;text-transform:uppercase;letter-spacing:.03em}
      .gc-allday-col{flex:1;min-width:0;border-left:1px solid var(--cu-bd);padding:4px;display:flex;flex-direction:column;gap:3px}
      .gc-allday-col:first-of-type{border-left:none}
      .gc-allday-col.drop{background:var(--cu-accent-fog)}
      .gc-adchip{font-size:11.5px;padding:2px 7px;border-radius:4px;border-left:3px solid var(--cu-t3);background:var(--cu-bg3);color:var(--cu-t1);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;border-top:none;border-right:none;border-bottom:none;font-family:inherit;width:100%}
      .gc-adchip.done{opacity:.55;text-decoration:line-through}
      .gc-scroll{flex:1;overflow:auto;min-height:0;position:relative}
      .gc-grid{display:flex;min-height:100%;position:relative}
      .gc-hours{width:56px;flex:0 0 56px;border-right:1px solid var(--cu-bd);position:relative}
      .gc-hour{position:absolute;right:6px;font-size:10.5px;color:var(--cu-t3);transform:translateY(-6px)}
      .gc-cols{flex:1;display:flex;min-width:0;position:relative}
      .gc-col{flex:1;min-width:0;position:relative;border-left:1px solid var(--cu-bd)}
      .gc-col:first-child{border-left:none}
      .gc-col.weekend{background:var(--cu-bg2)}
      .gc-blk{position:absolute;border-radius:5px;padding:2px 6px;font-size:11.5px;line-height:1.3;overflow:hidden;cursor:pointer;border-left:3px solid var(--cu-t3);background:var(--cu-bg3);color:var(--cu-t1);text-align:left;font-family:inherit;border-top:none;border-right:none;border-bottom:none;touch-action:none}
      .gc-blk .gc-blk-t{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .gc-blk .gc-blk-s{font-size:10.5px;color:var(--cu-t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .gc-blk.task{cursor:grab}
      .gc-blk.task:active{cursor:grabbing}
      .gc-blk.done{opacity:.55}
      .gc-blk.done .gc-blk-t{text-decoration:line-through}
      .gc-blk.declined{opacity:.5;border-style:dashed}
      .gc-blk.ghost{opacity:.75;outline:2px dashed var(--cu-accent);z-index:40;pointer-events:none}
      .gc-blk.dragging{opacity:.3}
      .gc-rsz{position:absolute;left:0;right:0;bottom:0;height:8px;cursor:ns-resize}
      .gc-now{position:absolute;left:0;right:0;height:0;border-top:2px solid var(--cu-accent);z-index:30;pointer-events:none}
      .gc-now::before{content:'';position:absolute;left:-4px;top:-4px;width:7px;height:7px;border-radius:50%;background:var(--cu-accent)}
      .gc-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:28px 16px;color:var(--cu-t3);font-size:13px;text-align:center}
      .gc-skel{height:12px;border-radius:4px;background:var(--cu-bg3);animation:gc-pulse 1.4s ease-in-out infinite}
      @keyframes gc-pulse{0%,100%{opacity:.55}50%{opacity:1}}
      .gc-plan-row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--cu-bd);font-size:13px}
      .gc-plan-row:first-child{border-top:none}
      .gc-plan-time{font-size:12px;font-weight:600;color:var(--cu-accent-ink);white-space:nowrap;min-width:104px;font-variant-numeric:tabular-nums}
      .gc-plan-time.no{color:var(--cu-t3);font-weight:400}
      /* Google Picker must sit above the task panel / modals */
      .picker-dialog-bg{z-index:19000 !important}
      .picker-dialog{z-index:20000 !important}
      @media (max-width:860px){
        .gc-tray{position:absolute;z-index:60;top:0;bottom:0;left:0;box-shadow:var(--cu-shadow)}
        .gc-tray.hide{display:none}
        .gc-pl-body{position:relative}
      }
      @media (max-width:520px){
        .gc-pl-bar{padding:8px 10px;gap:6px}
        .gc-pl-title{font-size:14px;min-width:90px;order:-1;width:100%}
        .gc-tray{width:min(86vw,264px);flex-basis:min(86vw,264px)}
      }
      @media (prefers-reduced-motion:reduce){.gc-sw,.gc-sw-k,.gc-skel{transition:none;animation:none}}
      `;
      document.head.appendChild(st);
    }

    // =======================================================================
    // Small helpers
    // =======================================================================
    const DAYMS = 86400000, HOUR_PX = 48, SNAP = 15, MIN_BLOCK = 15;
    const LEGACY = new Set(['post', 'direct', 'milestone']);   // start_at means something else there
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const startOfWeek = (d) => addDays(startOfDay(d), -(((new Date(d).getDay()) + 6) % 7));   // Monday
    const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const ymd = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    const parseYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
    const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();
    const snapMin = (m) => Math.round(m / SNAP) * SNAP;
    const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    const fmtHour = (hr) => new Date(2020, 0, 1, hr).toLocaleTimeString('en-IN', { hour: 'numeric' }).replace(' ', '');
    const fmtDate = (d, o) => new Date(d).toLocaleDateString('en-IN', o || { day: 'numeric', month: 'short' });
    const fmtDur = (min) => (min >= 60 ? Math.floor(min / 60) + 'h' + (min % 60 ? ' ' + (min % 60) + 'm' : '') : min + 'm');
    const hhmm = (min) => pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
    const parseHhmm = (s, dflt) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? clamp(+m[1], 0, 23) * 60 + clamp(+m[2], 0, 59) : dflt; };
    function ago(iso) {
      if (!iso) return 'never';
      const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    }
    const err = (code, message) => Object.assign(new Error(message || code), { code });
    function errText(e) {
      const c = (e && e.code) || '';
      if (c === 'cancelled') return e.message || 'Google sign-in was cancelled.';
      if (c === 'not_configured') return 'Google Calendar is not set up yet — an admin has to add the Google client secret.';
      if (c === 'fn_missing') return 'The Google Calendar service is not deployed yet.';
      if (c === 'not_installed') return 'Google Calendar needs migration 100 to be applied first.';
      if (c === 'reauth_required') return 'Google access expired — reconnect in Settings → Google Calendar.';
      if (c === 'drive_not_connected') return e.message || 'Connect Google Drive first.';
      if (c === 'network') return 'Network error — check your connection and try again.';
      if (c === 'forbidden') return 'You are not allowed to change that task.';
      return (e && e.message) || 'Something went wrong.';
    }
    const sessionToken = () => {
      if (typeof deps.getSessionToken === 'function') { try { return deps.getSessionToken() || ''; } catch (_) { /* fall through */ } }
      try { return localStorage.getItem('ams_session_token') || ''; } catch (_) { return ''; }
    };

    const MIME_ICON = [
      [/folder/, 'ti-folder'], [/spreadsheet|excel|csv/, 'ti-table'], [/presentation|powerpoint/, 'ti-presentation'],
      [/document|msword|\btext\b/, 'ti-file-text'], [/pdf/, 'ti-file-type-pdf'], [/image/, 'ti-photo'],
      [/video/, 'ti-movie'], [/audio/, 'ti-music'], [/zip|compressed/, 'ti-file-zip'], [/form/, 'ti-forms'],
    ];
    const mimeIcon = (m) => { const f = MIME_ICON.find(([re]) => re.test(String(m || ''))); return f ? f[1] : 'ti-file'; };
    const mimeLabel = (m) => {
      const s = String(m || '');
      if (/folder/.test(s)) return 'Folder';
      if (/spreadsheet/.test(s)) return 'Sheet';
      if (/presentation/.test(s)) return 'Slides';
      if (/\.document/.test(s)) return 'Doc';
      if (/pdf/.test(s)) return 'PDF';
      if (/image/.test(s)) return 'Image';
      if (/video/.test(s)) return 'Video';
      return s.split('/').pop() || 'File';
    };

    // =======================================================================
    // Edge Function client + shared connection status store
    // =======================================================================
    async function edge(action, payload) {
      const token = sessionToken();
      if (!token) throw err('auth.no_session', 'Please sign in again.');
      let res;
      try {
        res = await fetch(SB_URL + '/functions/v1/google-calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SB_KEY, apikey: SB_KEY, 'x-ams-session': token },
          body: JSON.stringify(Object.assign({ action }, payload || {})),
        });
      } catch (_) { throw err('network'); }
      let data = {};
      try { data = await res.json(); } catch (_) { data = {}; }
      if (res.status === 404 && !data.error) throw err('fn_missing');
      if (!res.ok || data.error) throw Object.assign(new Error(data.message || data.error || ('HTTP ' + res.status)), { code: data.error || ('http_' + res.status) });
      return data;
    }

    const store = { status: null, at: 0, inflight: null, config: undefined, pickerKey: undefined, subs: new Set() };
    const emit = () => { store.subs.forEach(fn => { try { fn(store.status); } catch (_) { /* ignore */ } }); syncRegistrations(); };
    const setStatus = (s) => { store.status = s || null; store.at = Date.now(); emit(); };

    function refreshStatus(force) {
      if (store.inflight) return store.inflight;
      if (!force && store.status && Date.now() - store.at < 60000) return Promise.resolve(store.status);
      if (!sessionToken()) return Promise.resolve(store.status);
      store.inflight = (async () => {
        try {
          const s = await rpcCall('gcal_status', {}, { silentAuth: true });
          setStatus(s || { available: true, connected: false });
        } catch (e) {
          if (isMissingRpc(e)) setStatus({ available: false, connected: false });
          else if (!store.status) setStatus({ available: true, connected: false, unknown: true });
        } finally { store.inflight = null; }
        return store.status;
      })();
      return store.inflight;
    }
    const available = () => !!(store.status && store.status.available !== false);
    const connected = () => !!(store.status && store.status.connected);
    const driveReady = () => !!(connected() && store.status.has_drive);

    function useGcalStatus() {
      const [s, setS] = useState(store.status);
      useEffect(() => {
        store.subs.add(setS);
        refreshStatus(false);
        return () => { store.subs.delete(setS); };
      }, []);
      return [s, () => refreshStatus(true)];
    }

    async function loadConfig() {
      if (store.config !== undefined) return store.config;
      try { store.config = await edge('config'); }
      catch (e) { store.config = { configured: false, reason: (e && e.code) || 'error' }; }
      return store.config;
    }
    async function pickerKey() {
      if (store.pickerKey !== undefined) return store.pickerKey;
      try {
        const s = await rpcCall('agency_settings_get', {}, { silentAuth: true });
        store.pickerKey = (s && s.sheets_api_key) || '';
      } catch (_) {
        try { store.pickerKey = localStorage.getItem('ams_sheets_api_key') || ''; } catch (__) { store.pickerKey = ''; }
      }
      if (!store.pickerKey) { try { store.pickerKey = localStorage.getItem('ams_sheets_api_key') || ''; } catch (_) { /* ignore */ } }
      syncRegistrations();
      return store.pickerKey;
    }

    // =======================================================================
    // Google Identity Services — authorization-code flow (popup, postmessage)
    // =======================================================================
    const CAL_SCOPES = ['openid', 'email',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.app.created'];
    const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly'];

    function requestCode(scopes, loginHint) {
      return new Promise((resolve, reject) => {
        if (!GOOGLE_LOGIN_CLIENT_ID) return reject(err('not_configured'));
        const oauth2 = window.google && window.google.accounts && window.google.accounts.oauth2;
        if (!oauth2 || !oauth2.initCodeClient) return reject(err('gis_missing', 'Google services are still loading — try again in a moment.'));
        let settled = false;
        try {
          const client = oauth2.initCodeClient({
            client_id: GOOGLE_LOGIN_CLIENT_ID,
            scope: scopes.join(' '),
            ux_mode: 'popup',
            redirect_uri: 'postmessage',
            include_granted_scopes: true,
            login_hint: loginHint || undefined,
            callback: (resp) => {
              if (settled) return; settled = true;
              if (!resp || resp.error || !resp.code) return reject(err('cancelled', (resp && resp.error_description) || 'Google sign-in was cancelled.'));
              resolve(resp.code);
            },
            error_callback: (e) => {
              if (settled) return; settled = true;
              reject(err('cancelled', e && e.type === 'popup_failed_to_open'
                ? 'Allow pop-ups for this site, then try connecting again.' : 'Google sign-in was cancelled.'));
            },
          });
          client.requestCode();
        } catch (e) { if (!settled) { settled = true; reject(err('gis_error', e.message)); } }
      });
    }

    async function connectGoogle(intent, email) {
      const scopes = intent === 'drive' ? DRIVE_SCOPES
        : (intent === 'all' ? CAL_SCOPES.concat(DRIVE_SCOPES) : CAL_SCOPES);
      const code = await requestCode(scopes, email);
      const out = await edge('exchange', { code, intent: intent || 'calendar' });
      await refreshStatus(true);
      return out;
    }
    async function syncNow(opts) {
      const out = await edge('sync', opts || {});
      await refreshStatus(true);
      return out;
    }
    async function disconnectGoogle(removeCalendar) {
      const out = await edge('disconnect', { remove_calendar: !!removeCalendar });
      await refreshStatus(true);
      return out;
    }
    async function fetchEvents(from, to) {
      if (!connected()) return [];
      try {
        const rows = await rpcCall('gcal_events_list', { p_from: new Date(from).toISOString(), p_to: new Date(to).toISOString() }, { silentAuth: true });
        return Array.isArray(rows) ? rows : [];
      } catch (e) { return []; }
    }

    // Quiet background sync after the signed-in member edits tasks, so their own
    // calendar keeps up without waiting for the 5-minute cron.
    let autoTimer = null, lastAuto = 0;
    if (taskBus && typeof taskBus.on === 'function') {
      const nudge = () => {
        if (!connected() || !store.status.push_enabled) return;
        if (document.visibilityState === 'hidden') return;
        clearTimeout(autoTimer);
        autoTimer = setTimeout(() => {
          if (Date.now() - lastAuto < 60000) return;
          lastAuto = Date.now();
          edge('sync', {}).then(() => refreshStatus(true)).catch(() => { /* cron will catch up */ });
        }, 25000);
      };
      taskBus.on('task:changed', nudge);
      taskBus.on('task:created', nudge);
    }

    // =======================================================================
    // Google Picker (Drive)
    // =======================================================================
    let pickerLoad = null;
    function loadPicker() {
      if (window.google && window.google.picker) return Promise.resolve();
      if (pickerLoad) return pickerLoad;
      pickerLoad = new Promise((resolve, reject) => {
        const go = () => window.gapi.load('picker', { callback: resolve, onerror: () => { pickerLoad = null; reject(err('picker_failed', 'Could not load the Google Picker.')); } });
        if (window.gapi && window.gapi.load) return go();
        const s = document.createElement('script');
        s.src = 'https://apis.google.com/js/api.js';
        s.async = true; s.defer = true;
        s.onload = go;
        s.onerror = () => { pickerLoad = null; reject(err('picker_failed', 'Could not load the Google Picker.')); };
        document.head.appendChild(s);
      });
      return pickerLoad;
    }

    // Resolves to [{ id, name, url, mime, icon, size }] ([] when cancelled).
    async function openDrivePicker(opts) {
      const o = opts || {};
      const key = await pickerKey();
      if (!key) throw err('no_api_key', 'Add a Google API key in Settings → Integrations to use the Drive picker.');
      const [tok] = await Promise.all([edge('picker_token'), loadPicker()]);
      const P = window.google.picker;
      return new Promise((resolve) => {
        const mine = new P.DocsView(P.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true);
        const shared = new P.DocsView(P.ViewId.DOCS).setIncludeFolders(true).setEnableDrives(true);
        let b = new P.PickerBuilder()
          .addView(mine).addView(shared).addView(P.ViewId.RECENTLY_PICKED)
          .setOAuthToken(tok.access_token)
          .setDeveloperKey(key)
          .setAppId(String(GOOGLE_LOGIN_CLIENT_ID || '').split('-')[0])
          .setOrigin(window.location.protocol + '//' + window.location.host)
          .setTitle(o.title || 'Attach from Google Drive')
          .setCallback((data) => {
            const act = data[P.Response.ACTION];
            if (act === P.Action.PICKED) {
              resolve((data[P.Response.DOCUMENTS] || []).map((d) => ({
                id: d[P.Document.ID], name: d[P.Document.NAME] || 'Drive file',
                url: d[P.Document.URL], mime: d[P.Document.MIME_TYPE] || '',
                icon: d[P.Document.ICON_URL] || '', size: d.sizeBytes ? Number(d.sizeBytes) : null,
              })));
            } else if (act === P.Action.CANCEL) resolve([]);
          });
        if (o.multi !== false) b = b.enableFeature(P.Feature.MULTISELECT_ENABLED);
        b = b.enableFeature(P.Feature.SUPPORT_DRIVES);
        b.build().setVisible(true);
      });
    }

    async function attachDriveToTask(taskId, docs) {
      let n = 0;
      for (const d of docs) {
        if (!d || !/^https:\/\//.test(String(d.url || ''))) continue;
        await rpcCall('task_attachment_add', {
          p_task_id: taskId,
          p_file: { name: d.name, url: d.url, mime: d.mime || 'application/vnd.google-apps.file', size: d.size || null, path: null },
        });
        n++;
      }
      if (n && taskBus) taskBus.emit('task:changed', { id: taskId });
      return n;
    }

    // =======================================================================
    // Shared bits of UI
    // =======================================================================
    function Toggle({ on, onChange, disabled, label }) {
      return h`<button type="button" class=${'gc-sw' + (on ? ' on' : '')} disabled=${disabled}
        role="switch" aria-checked=${!!on} aria-label=${label || 'Toggle'}
        onClick=${() => !disabled && onChange(!on)}><span class="gc-sw-k"></span></button>`;
    }

    function Modal({ title, icon, children, footer, onClose, width }) {
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [onClose]);
      return h`<div class="gc-modal-bg gc-root" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="gc-modal" style=${width ? { maxWidth: width } : null} role="dialog" aria-modal="true" aria-label=${title}>
          <div class="gc-modal-hd">${icon ? h`<i class=${'ti ' + icon}></i>` : null}<span>${title}</span>
            <span class="gc-sp"></span>
            <button type="button" class="gc-btn ghost sm" onClick=${onClose} aria-label="Close"><i class="ti ti-x"></i></button>
          </div>
          <div class="gc-modal-b">${children}</div>
          ${footer ? h`<div class="gc-modal-ft">${footer}</div>` : null}
        </div>
      </div>`;
    }

    function PriorityDot({ value }) {
      const p = PRIORITIES[value];
      if (!p) return null;
      return h`<span title=${p.label} style=${{ display: 'inline-flex', alignItems: 'center', gap: 3, color: p.color, fontSize: 11 }}>
        <i class="ti ti-flag-filled"></i></span>`;
    }

    // =======================================================================
    // Settings → Google Calendar
    // =======================================================================
    const TYPE_KEYS = ['task', 'post', 'direct', 'milestone', 'seo_report', 'ad', 'meeting', 'request'];
    const typeLabel = (k) => (TYPE_META[k] && TYPE_META[k].label) || k.replace(/_/g, ' ');

    function CalendarSettingsSection({ user, showToast }) {
      const toast = showToast || (() => { });
      const [status, refresh] = useGcalStatus();
      const [config, setConfig] = useState(store.config);
      const [busy, setBusy] = useState('');
      const [confirmOff, setConfirmOff] = useState(false);
      const [removeCal, setRemoveCal] = useState(false);
      const [key, setKey] = useState(store.pickerKey);

      useEffect(() => { loadConfig().then(setConfig); pickerKey().then(setKey); }, []);

      const save = async (patch) => {
        setBusy('save');
        try { setStatus(await rpcCall('gcal_settings_set', { p_patch: patch })); }
        catch (e) { toast(errText(e)); }
        finally { setBusy(''); }
      };
      const doConnect = async (intent) => {
        setBusy('connect');
        try {
          const out = await connectGoogle(intent, user && user.email);
          toast(intent === 'drive' ? 'Google Drive connected ✓' : 'Google Calendar connected ✓');
          if (out && out.sync && out.sync.error) toast('Connected, but the first sync failed — try "Sync now".');
        } catch (e) { if ((e && e.code) !== 'cancelled') toast(errText(e)); }
        finally { setBusy(''); }
      };
      const doSync = async () => {
        setBusy('sync');
        try { await syncNow({ refresh_calendars: true }); toast('Calendar synced ✓'); }
        catch (e) { toast(errText(e)); }
        finally { setBusy(''); }
      };
      const doDisconnect = async () => {
        setBusy('off');
        try { await disconnectGoogle(removeCal); setConfirmOff(false); toast('Google disconnected'); }
        catch (e) { toast(errText(e)); }
        finally { setBusy(''); }
      };

      if (!status) {
        return h`<div class="gc-root"><div class="gc-card"><div class="gc-card-b">
          <div class="gc-skel" style=${{ width: '40%', marginBottom: 10 }}></div>
          <div class="gc-skel" style=${{ width: '70%' }}></div>
        </div></div></div>`;
      }
      if (status.available === false) {
        return h`<div class="gc-root"><div class="gc-card"><div class="gc-card-b">
          <div class="gc-hint">Google Calendar becomes available once migration 100 is applied to the database.</div>
        </div></div></div>`;
      }

      const isAdmin = !!user && (user.role_level === 'admin');
      const notConfigured = config && config.configured === false;
      const cals = status.calendars || [];
      const selected = status.selected_calendar_ids || [];
      const pushTypes = status.push_types || [];

      return h`<div class="gc-root">
        <div class="gc-card">
          <div class="gc-card-hd">
            <i class="ti ti-calendar-event" style=${{ fontSize: 18, color: '#4285F4' }}></i>
            <div class="gc-card-t">Google Calendar
              <div class="gc-card-s">See your Google meetings next to your tasks, and put the tasks you are assigned onto a "My Digital Sevak" calendar. Moving an event in Google reschedules the task.</div>
            </div>
          </div>
          <div class="gc-card-b">
            ${status.connected ? h`<${React.Fragment}>
              ${status.status === 'error' ? h`<div class="gc-note err">
                <b>Google access needs renewing.</b> ${status.last_error === 'reauth_required'
                  ? ' Reconnect to continue syncing.' : ' Last error: ' + (status.last_error || 'unknown')}
              </div>` : null}
              <div class="gc-row" style=${{ marginBottom: 12 }}>
                <span class=${'gc-dot' + (status.status === 'error' ? ' warn' : ' on')}></span>
                <div style=${{ minWidth: 0 }}>
                  <div style=${{ fontSize: 13.5, fontWeight: 600 }}>${status.google_email || 'Connected'}</div>
                  <div class="gc-hint">Last synced ${ago(status.last_sync_at)}${status.queue && status.queue.pending ? ' · ' + status.queue.pending + ' change(s) waiting' : ''}${status.linked ? ' · ' + status.linked + ' tasks on your calendar' : ''}</div>
                </div>
                <span class="gc-sp"></span>
                <button type="button" class="gc-btn" disabled=${!!busy} onClick=${doSync}>
                  <i class=${'ti ' + (busy === 'sync' ? 'ti-loader-2' : 'ti-refresh')}></i> Sync now</button>
                ${status.status === 'error' ? h`<button type="button" class="gc-btn pri" disabled=${!!busy} onClick=${() => doConnect('calendar')}>Reconnect</button>` : null}
                <button type="button" class="gc-btn danger" disabled=${!!busy} onClick=${() => setConfirmOff(true)}>Disconnect</button>
              </div>
              ${status.push_calendar_is_primary ? h`<div class="gc-note">Tasks are going to your <b>primary</b> calendar because Google did not allow a separate one. Reconnect after an admin adds the <code>calendar.app.created</code> scope to get a dedicated "My Digital Sevak" calendar.</div>` : null}
            <//>` : h`<${React.Fragment}>
              <div class="gc-hint" style=${{ marginBottom: 12 }}>
                <div>• Your Google events appear in Planner and on your Home agenda.</div>
                <div>• Tasks assigned to you (with a due date) show up on a dedicated "My Digital Sevak" calendar.</div>
                <div>• Drag an event in Google Calendar and the task's due date follows.</div>
              </div>
              ${notConfigured ? h`<div class="gc-note">${isAdmin
                ? 'Finish the setup first: add the GOOGLE_CLIENT_SECRET secret to the google-calendar Edge Function (see docs/parity-v2/notes-J.md).'
                : 'Your admin still has to finish the Google setup for this workspace.'}</div>` : null}
              <button type="button" class="gc-btn pri" disabled=${!!busy || notConfigured} onClick=${() => doConnect('calendar')}>
                <i class=${'ti ' + (busy === 'connect' ? 'ti-loader-2' : 'ti-brand-google')}></i> Connect Google Calendar</button>
            <//>`}
          </div>
        </div>

        ${status.connected && cals.length ? h`<div class="gc-card">
          <div class="gc-card-hd"><i class="ti ti-eye"></i><div class="gc-card-t">Calendars to show
            <div class="gc-card-s">Only the calendars you tick are pulled into Planner and your agenda.</div></div>
            <button type="button" class="gc-btn sm" disabled=${!!busy} onClick=${doSync}>Refresh list</button>
          </div>
          <div class="gc-card-b">
            ${cals.map(c => h`<label class="gc-cal" key=${c.id}>
              <input type="checkbox" checked=${selected.indexOf(c.id) >= 0} disabled=${!!busy}
                onChange=${(e) => {
                  const next = e.target.checked ? selected.concat([c.id]) : selected.filter(x => x !== c.id);
                  save({ selected_calendar_ids: next });
                }}/>
              <span class="gc-swatch" style=${{ background: c.color || '#4c8df6' }}></span>
              <span style=${{ flex: 1, minWidth: 0 }}>${c.summary || c.id}${c.primary ? h`<span class="gc-hint"> · main</span>` : null}</span>
            </label>`)}
          </div>
        </div>` : null}

        ${status.connected ? h`<div class="gc-card">
          <div class="gc-card-hd"><i class="ti ti-arrow-right-bar-to"></i><div class="gc-card-t">Your tasks on Google Calendar
            <div class="gc-card-s">Only tasks assigned to you, and only the ones with a due date.</div></div>
          </div>
          <div class="gc-card-b">
            <div class="gc-srow">
              <div><div class="gc-srow-t">Put my tasks on Google Calendar</div>
                <div class="gc-srow-s">Timed due dates become time blocks; all-day dues become all-day events.</div></div>
              <${Toggle} on=${status.push_enabled} disabled=${!!busy} label="Push tasks"
                onChange=${(v) => save({ push_enabled: v })}/>
            </div>
            <div class="gc-srow">
              <div><div class="gc-srow-t">Keep completed tasks on the calendar</div>
                <div class="gc-srow-s">They stay with a tick in the title instead of disappearing.</div></div>
              <${Toggle} on=${status.push_done} disabled=${!!busy || !status.push_enabled} label="Keep completed"
                onChange=${(v) => save({ push_done: v })}/>
            </div>
            <div style=${{ paddingTop: 12 }}>
              <div class="gc-srow-t" style=${{ marginBottom: 8 }}>Which kinds of work</div>
              <div class="gc-row">
                ${TYPE_KEYS.map(k => h`<button type="button" key=${k} class=${'gc-chip' + (pushTypes.indexOf(k) >= 0 ? ' on' : '')}
                  disabled=${!!busy || !status.push_enabled}
                  onClick=${() => save({ push_types: pushTypes.indexOf(k) >= 0 ? pushTypes.filter(x => x !== k) : pushTypes.concat([k]) })}>
                  ${TYPE_META[k] ? h`<i class=${'ti ' + TYPE_META[k].icon}></i>` : null}${typeLabel(k)}
                </button>`)}
              </div>
            </div>
          </div>
        </div>` : null}

        ${status.connected ? h`<div class="gc-card">
          <div class="gc-card-hd"><i class="ti ti-brand-google-drive" style=${{ fontSize: 18, color: '#0F9D58' }}></i>
            <div class="gc-card-t">Google Drive
              <div class="gc-card-s">Attach Drive files to tasks and chats, and search Drive from the command palette.</div></div>
          </div>
          <div class="gc-card-b">
            ${status.has_drive ? h`<${React.Fragment}>
              <div class="gc-row"><span class="gc-dot on"></span>
                <div><div class="gc-srow-t">Drive connected</div>
                  <div class="gc-srow-s">${status.can_search_drive ? 'File search and the attach picker are on.' : 'The attach picker is on. Reconnect with Drive search permission to search Drive from the palette.'}</div>
                </div>
                <span class="gc-sp"></span>
                ${!status.can_search_drive ? h`<button type="button" class="gc-btn" disabled=${!!busy} onClick=${() => doConnect('drive')}>Add Drive search</button>` : null}
              </div>
              ${!key ? h`<div class="gc-note" style=${{ marginTop: 12, marginBottom: 0 }}>The Drive <b>picker</b> also needs a Google API key. ${isAdmin ? 'Add one in Settings → Integrations (the same key SEO uses for Sheets).' : 'Ask an admin to add the Google API key in Settings → Integrations.'}</div>` : null}
            <//>` : h`<div class="gc-row">
              <button type="button" class="gc-btn" disabled=${!!busy} onClick=${() => doConnect('drive')}>
                <i class="ti ti-brand-google-drive"></i> Enable Google Drive</button>
              <span class="gc-hint">Asks Google for permission to open files you pick and to search file names.</span>
            </div>`}
          </div>
        </div>` : null}

        ${confirmOff ? h`<${Modal} title="Disconnect Google?" icon="ti-plug-connected-x" onClose=${() => setConfirmOff(false)}
          footer=${h`<${React.Fragment}>
            <button type="button" class="gc-btn" onClick=${() => setConfirmOff(false)}>Cancel</button>
            <button type="button" class="gc-btn danger" disabled=${busy === 'off'} onClick=${doDisconnect}>Disconnect</button>
          <//>`}>
          <div class="gc-hint" style=${{ marginBottom: 12 }}>
            Your tasks stay exactly as they are. We stop syncing, delete the stored Google tokens and remove the pulled events from this workspace.
          </div>
          ${!status.push_calendar_is_primary ? h`<label class="gc-cal">
            <input type="checkbox" checked=${removeCal} onChange=${(e) => setRemoveCal(e.target.checked)}/>
            <span>Also delete the "My Digital Sevak" calendar from my Google account</span>
          </label>` : null}
        <//>` : null}
      </div>`;
    }

    // =======================================================================
    // Drive attach — task panel section + composer tool
    // =======================================================================
    function DriveAttachSection({ task, detail, reload, showToast }) {
      const toast = showToast || (() => { });
      const [busy, setBusy] = useState(false);
      const files = ((detail && detail.attachments) || []).filter(a => /(?:drive|docs)\.google\.com/.test(String(a.url || '')));
      const pick = async () => {
        setBusy(true);
        try {
          const docs = await openDrivePicker({});
          if (!docs.length) return;
          const n = await attachDriveToTask(task.id, docs);
          if (reload) reload();
          toast(n === 1 ? 'Attached from Drive ✓' : 'Attached ' + n + ' Drive files ✓');
        } catch (e) { toast(errText(e)); }
        finally { setBusy(false); }
      };
      return h`<div class="gc-root">
        <div class="gc-row">
          <button type="button" class="gc-btn" disabled=${busy} onClick=${pick}>
            <i class=${'ti ' + (busy ? 'ti-loader-2' : 'ti-brand-google-drive')}></i> Attach from Drive</button>
          <span class="gc-hint">${files.length ? files.length + ' Drive file(s) attached' : 'Docs, Sheets, folders — the link opens in Drive.'}</span>
        </div>
        ${files.length ? h`<div style=${{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          ${files.map(a => h`<a key=${a.id} href=${a.url} target="_blank" rel="noopener"
            style=${{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--cu-t1)', textDecoration: 'none' }}>
            <i class=${'ti ' + mimeIcon(a.mime)} style=${{ color: 'var(--cu-t3)' }}></i>
            <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${a.name}</span>
          </a>`)}
        </div>` : null}
      </div>`;
    }

    // =======================================================================
    // Planner
    // =======================================================================
    function taskSpan(r) {
      const due = new Date(r.due_at).getTime();
      let s = null;
      if (!LEGACY.has(r.type) && r.start_at) {
        const st = new Date(r.start_at).getTime();
        if (st < due && due - st <= DAYMS) s = st;
      }
      if (s == null) s = due - clamp(Number(r.estimate_minutes) || 30, MIN_BLOCK, 480) * 60000;
      return { s, e: due };
    }
    const taskDur = (r) => Math.max(MIN_BLOCK, Math.round((taskSpan(r).e - taskSpan(r).s) / 60000));

    // Greedy side-by-side layout for overlapping items in one day column.
    function layoutDay(items) {
      const sorted = items.slice().sort((a, b) => a.s - b.s || b.e - a.e);
      const out = [];
      let cluster = [], clusterEnd = -Infinity;
      const flush = () => {
        const colEnds = [];
        cluster.forEach(it => {
          let c = colEnds.findIndex(end => end <= it.s);
          if (c < 0) { c = colEnds.length; colEnds.push(it.e); } else colEnds[c] = it.e;
          it.col = c;
        });
        cluster.forEach(it => { it.cols = colEnds.length; out.push(it); });
        cluster = [];
      };
      sorted.forEach(it => {
        if (cluster.length && it.s >= clusterEnd) { flush(); clusterEnd = -Infinity; }
        cluster.push(it);
        clusterEnd = Math.max(clusterEnd, it.e);
      });
      if (cluster.length) flush();
      return out;
    }

    function planSlots({ day, busy, candidates, workStart, workEnd }) {
      const base = startOfDay(day).getTime();
      const now = new Date();
      let cursor = workStart;
      if (sameDay(day, now)) cursor = Math.max(cursor, Math.ceil((minutesOf(now) + 5) / SNAP) * SNAP);
      let free = cursor < workEnd ? [[cursor, workEnd]] : [];
      busy.map(b => [Math.floor((b.s - base) / 60000), Math.ceil((b.e - base) / 60000)])
        .filter(b => b[1] > b[0])
        .sort((a, b) => a[0] - b[0])
        .forEach(([bs, be]) => {
          const next = [];
          free.forEach(([fs, fe]) => {
            if (be <= fs || bs >= fe) { next.push([fs, fe]); return; }
            if (bs > fs) next.push([fs, bs]);
            if (be < fe) next.push([be, fe]);
          });
          free = next;
        });
      const plan = [], leftover = [];
      candidates.forEach(c => {
        const dur = clamp(Number(c.row.estimate_minutes) || 30, MIN_BLOCK, 240);
        const i = free.findIndex(([fs, fe]) => fe - fs >= dur);
        if (i < 0) { leftover.push(c); return; }
        const [fs, fe] = free[i];
        plan.push(Object.assign({}, c, { dur, start: new Date(base + fs * 60000), end: new Date(base + (fs + dur) * 60000) }));
        free.splice(i, 1);
        if (fs + dur < fe) free.splice(i, 0, [fs + dur, fe]);
      });
      return { plan, leftover };
    }

    function TrayItem({ row, onDragStart, onDragEnd, onSchedule, showDue }) {
      const meta = TYPE_META[row.type];
      return h`<div class="gc-titem" draggable="true" onDragStart=${onDragStart} onDragEnd=${onDragEnd}
        role="button" tabIndex=${0} aria-label=${'Task: ' + row.title}
        onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); openTask(row.id); } }}>
        <i class=${'ti ' + ((meta && meta.icon) || 'ti-circle-check')} style=${{ fontSize: 14, color: 'var(--cu-t3)', marginTop: 1 }}></i>
        <div style=${{ flex: 1, minWidth: 0 }} onClick=${() => openTask(row.id)}>
          <div class="gc-titem-t">${row.title}</div>
          <div class="gc-titem-m">
            <${PriorityDot} value=${row.priority}/>
            ${row.client_name ? h`<span>${row.client_name}</span>` : null}
            ${showDue && row.due_at ? h`<span style=${{ color: '#e5484d' }}>${fmtDate(row.due_at)}</span>` : null}
            ${row.estimate_minutes ? h`<span>${fmtDur(row.estimate_minutes)}</span>` : null}
          </div>
        </div>
        ${onSchedule ? h`<button type="button" class="gc-ico" style=${{ width: 24, height: 24 }} title="Schedule in the next free slot"
          onClick=${(e) => { e.stopPropagation(); onSchedule(row); }}><i class="ti ti-calendar-plus" style=${{ fontSize: 13 }}></i></button>` : null}
      </div>`;
    }

    function PlanDayModal({ day, busy, candidates, onClose, onApply }) {
      const [hours, setHours] = useState(() => {
        try { return JSON.parse(localStorage.getItem('ams_planner_hours') || '') || { start: '10:00', end: '19:00' }; }
        catch (_) { return { start: '10:00', end: '19:00' }; }
      });
      const [checked, setChecked] = useState(() => {
        const m = {};
        candidates.forEach(c => { m[c.row.id] = c.reason !== 'unscheduled' || (c.row.priority || 5) <= 2; });
        return m;
      });
      const [saving, setSaving] = useState(false);
      const workStart = parseHhmm(hours.start, 600), workEnd = parseHhmm(hours.end, 1140);
      const picked = candidates.filter(c => checked[c.row.id]);
      const { plan, leftover } = useMemo(
        () => planSlots({ day, busy, candidates: picked, workStart, workEnd }),
        [day, busy, JSON.stringify(picked.map(c => c.row.id)), workStart, workEnd]);
      const planById = {};
      plan.forEach(p => { planById[p.row.id] = p; });
      const setHrs = (patch) => {
        const next = Object.assign({}, hours, patch);
        setHours(next);
        try { localStorage.setItem('ams_planner_hours', JSON.stringify(next)); } catch (_) { /* ignore */ }
      };
      const reasonText = { overdue: 'Overdue', today: 'Due today', unscheduled: 'No due date' };

      return h`<${Modal} title="Plan my day" icon="ti-wand" width="600px" onClose=${onClose}
        footer=${h`<${React.Fragment}>
          <span class="gc-hint" style=${{ marginRight: 'auto' }}>${plan.length} task(s) will be scheduled${leftover.length ? ', ' + leftover.length + ' will not fit' : ''}</span>
          <button type="button" class="gc-btn" onClick=${onClose}>Cancel</button>
          <button type="button" class="gc-btn pri" disabled=${!plan.length || saving}
            onClick=${async () => { setSaving(true); await onApply(plan); setSaving(false); }}>
            ${saving ? h`<i class="ti ti-loader-2"></i>` : null}Schedule ${plan.length} task(s)</button>
        <//>`}>
        <div class="gc-row" style=${{ marginBottom: 12 }}>
          <span class="gc-hint">Working hours on ${fmtDate(day, { weekday: 'short', day: 'numeric', month: 'short' })}:</span>
          <input class="gc-in" type="time" value=${hours.start} onChange=${(e) => setHrs({ start: e.target.value })} aria-label="Day starts"/>
          <span class="gc-hint">to</span>
          <input class="gc-in" type="time" value=${hours.end} onChange=${(e) => setHrs({ end: e.target.value })} aria-label="Day ends"/>
        </div>
        <div class="gc-hint" style=${{ marginBottom: 10 }}>Free gaps between your meetings and already-timed tasks get filled, highest priority first. Nothing is moved until you press Schedule.</div>
        ${!candidates.length ? h`<div class="gc-empty"><i class="ti ti-confetti" style=${{ fontSize: 22 }}></i>
          <div>Nothing waiting to be scheduled. Enjoy the day.</div></div>` : null}
        ${candidates.map(c => {
          const p = planById[c.row.id];
          return h`<label class="gc-plan-row" key=${c.row.id}>
            <input type="checkbox" checked=${!!checked[c.row.id]} style=${{ marginTop: 3 }}
              onChange=${(e) => setChecked(Object.assign({}, checked, { [c.row.id]: e.target.checked }))}/>
            <span class=${'gc-plan-time' + (p ? '' : ' no')}>${p ? fmtTime(p.start) + ' – ' + fmtTime(p.end) : (checked[c.row.id] ? 'No room' : '—')}</span>
            <span style=${{ flex: 1, minWidth: 0 }}>
              <div style=${{ fontWeight: 500 }}>${c.row.title}</div>
              <div class="gc-titem-m"><${PriorityDot} value=${c.row.priority}/>
                <span>${reasonText[c.reason]}${c.reason === 'overdue' && c.row.due_at ? ' · ' + fmtDate(c.row.due_at) : ''}</span>
                ${c.row.client_name ? h`<span>${c.row.client_name}</span>` : null}
                <span>${fmtDur(clamp(Number(c.row.estimate_minutes) || 30, MIN_BLOCK, 240))}</span>
              </div>
            </span>
          </label>`;
        })}
      <//>`;
    }

    function PlannerPage({ currentUser, showToast, params, onNavigate }) {
      const toast = showToast || (() => { });
      const [status] = useGcalStatus();
      const [mode, setMode] = useState(() => {
        const p = (params && params[0]) || '';
        if (p === 'day' || p === 'week') return p;
        try { return localStorage.getItem('ams_planner_mode') === 'week' ? 'week' : 'day'; } catch (_) { return 'day'; }
      });
      const [anchor, setAnchor] = useState(() => parseYmd((params && params[1]) || '') || startOfDay(new Date()));
      const [trayTab, setTrayTab] = useState('unscheduled');
      const [trayOpen, setTrayOpen] = useState(true);
      const [q, setQ] = useState('');
      const [events, setEvents] = useState([]);
      const [evLoading, setEvLoading] = useState(false);
      const [over, setOver] = useState({});          // optimistic patches by task id
      const [drag, setDrag] = useState(null);        // { id, dayIdx, startMin, dur }
      const [dropGhost, setDropGhost] = useState(null);
      const [planOpen, setPlanOpen] = useState(false);
      const [evCard, setEvCard] = useState(null);
      const [nowTs, setNowTs] = useState(Date.now());
      const scrollRef = useRef(null), colsRef = useRef(null), scrolled = useRef(false), dragRow = useRef(null);

      useEffect(() => { try { localStorage.setItem('ams_planner_mode', mode); } catch (_) { /* ignore */ } }, [mode]);
      useEffect(() => { const iv = setInterval(() => setNowTs(Date.now()), 60000); return () => clearInterval(iv); }, []);

      const days = useMemo(() => (mode === 'week'
        ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))
        : [startOfDay(anchor)]), [mode, anchor.getTime()]);
      const rangeFrom = days[0], rangeTo = addDays(days[days.length - 1], 1);

      const inRange = useTasks({
        scope: 'my', due_from: rangeFrom.toISOString(), due_to: rangeTo.toISOString(),
        include_closed: true, top_level: false, limit: 500, order: 'due',
      }, { pollMs: 120000 });
      const unscheduled = useTasks({ scope: 'my', no_due: true, top_level: false, limit: 200, order: 'priority' }, { pollMs: 300000 });
      const overdue = useTasks({ scope: 'my', overdue: true, top_level: false, limit: 200, order: 'due' }, { pollMs: 300000 });

      const apply = useCallback((rows) => (rows || []).map(r => (over[r.id] ? Object.assign({}, r, over[r.id]) : r)), [over]);
      const rangeRows = apply(inRange.rows);

      const loadEvents = useCallback(async () => {
        if (!connected()) { setEvents([]); return; }
        setEvLoading(true);
        try { setEvents(await fetchEvents(rangeFrom, rangeTo)); }
        finally { setEvLoading(false); }
      }, [rangeFrom.getTime(), rangeTo.getTime(), status && status.connected, status && status.last_pull_at]);
      useEffect(() => { loadEvents(); }, [loadEvents]);
      useEffect(() => {
        const iv = setInterval(() => { if (document.visibilityState === 'visible') loadEvents(); }, 5 * 60 * 1000);
        return () => clearInterval(iv);
      }, [loadEvents]);

      useEffect(() => {
        const el = scrollRef.current;
        if (el && !scrolled.current) {
          scrolled.current = true;
          const h0 = sameDay(days[0], new Date()) ? Math.max(0, new Date().getHours() - 1) : 8;
          el.scrollTop = h0 * HOUR_PX;
        }
      }, [days]);

      // ---- writing back ----------------------------------------------------
      const scheduleTask = useCallback(async (row, start, durMin, opts) => {
        const o = opts || {};
        const legacy = LEGACY.has(row.type);
        let patch;
        if (o.allDay) {
          const d = new Date(start); d.setHours(23, 59, 0, 0);
          patch = { due_at: d.toISOString(), due_has_time: false };
          if (!legacy && row.start_at && new Date(row.start_at).getTime() > d.getTime()) patch.start_at = null;
        } else {
          const s = new Date(start), e = new Date(s.getTime() + Math.max(MIN_BLOCK, durMin) * 60000);
          patch = { due_at: e.toISOString(), due_has_time: true };
          if (!legacy) patch.start_at = s.toISOString();
        }
        setOver(prev => Object.assign({}, prev, { [row.id]: patch }));
        try {
          await TaskAPI.update(row.id, patch);
        } catch (e) {
          toast(errText(e));
        } finally {
          setOver(prev => { const n = Object.assign({}, prev); delete n[row.id]; return n; });
        }
      }, [toast]);

      const applyPlan = useCallback(async (plan) => {
        let ok = 0;
        for (const p of plan) {
          try { await scheduleTask(p.row, p.start, p.dur); ok++; } catch (_) { /* toast already shown */ }
        }
        setPlanOpen(false);
        toast(ok ? 'Scheduled ' + ok + ' task(s) ✓' : 'Nothing was scheduled');
        inRange.reload(); unscheduled.reload(); overdue.reload();
      }, [scheduleTask, toast, inRange, unscheduled, overdue]);

      // ---- grid data -------------------------------------------------------
      const timedEvents = events.filter(e => !e.all_day && e.start && e.end);
      const allDayEvents = events.filter(e => e.all_day);
      const timedTasks = rangeRows.filter(r => r.due_has_time && r.due_at);
      const allDayTasks = rangeRows.filter(r => !r.due_has_time && r.due_at);

      const dayData = days.map((day, dayIdx) => {
        const ds = day.getTime(), de = ds + DAYMS;
        const items = [];
        timedEvents.forEach(ev => {
          const s = new Date(ev.start).getTime(), e = new Date(ev.end).getTime();
          if (e <= ds || s >= de) return;
          items.push({ key: 'e' + ev.id, kind: 'event', ev, s: Math.max(s, ds), e: Math.min(e, de) });
        });
        timedTasks.forEach(r => {
          const sp = taskSpan(r);
          if (sp.e <= ds || sp.s >= de) return;
          items.push({
            key: 't' + r.id, kind: 'task', row: r, id: r.id,
            s: Math.max(sp.s, ds), e: Math.min(sp.e, de),
            fullDur: Math.max(MIN_BLOCK, Math.round((sp.e - sp.s) / 60000)),
            editable: !isDone(r),
          });
        });
        const laid = layoutDay(items).map(it => Object.assign(it, {
          dayIdx,
          startMin: Math.round((it.s - ds) / 60000),
          dur: Math.max(MIN_BLOCK, Math.round((it.e - it.s) / 60000)),
        }));
        const key = ymd(day);
        return {
          day, dayIdx, items: laid,
          allDay: allDayEvents.filter(ev => String(ev.start_date || '') <= key && key < String(ev.end_date || ''))
            .map(ev => ({ kind: 'event', ev }))
            .concat(allDayTasks.filter(r => sameDay(new Date(r.due_at), day)).map(r => ({ kind: 'task', row: r }))),
        };
      });

      // ---- drag & drop from the tray / all-day row -------------------------
      const colMinutes = (clientY, colEl) => {
        const rect = colEl.getBoundingClientRect();
        return clamp(snapMin((clientY - rect.top) / HOUR_PX * 60), 0, 24 * 60 - MIN_BLOCK);
      };
      const onColDragOver = (e, dayIdx) => {
        if (!dragRow.current) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropGhost({ dayIdx, startMin: colMinutes(e.clientY, e.currentTarget), dur: taskDur(dragRow.current), allDay: false });
      };
      const onColDrop = (e, dayIdx) => {
        const row = dragRow.current;
        if (!row) return;
        e.preventDefault();
        const min = colMinutes(e.clientY, e.currentTarget);
        dragRow.current = null; setDropGhost(null);
        const start = new Date(days[dayIdx].getTime() + min * 60000);
        scheduleTask(row, start, taskDur(row));
      };
      const onAllDayDrop = (e, dayIdx) => {
        const row = dragRow.current;
        if (!row) return;
        e.preventDefault();
        dragRow.current = null; setDropGhost(null);
        scheduleTask(row, days[dayIdx], 0, { allDay: true });
      };

      // ---- pointer drag / resize for blocks --------------------------------
      const beginBlockDrag = (e, item, kind) => {
        if (e.button !== 0 || !item.editable) return;
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX, startY = e.clientY;
        const st = { moved: false, dayIdx: item.dayIdx, startMin: item.startMin, dur: item.fullDur };
        const onMove = (ev) => {
          const dy = ev.clientY - startY, dx = ev.clientX - startX;
          if (!st.moved && Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
          st.moved = true;
          const dMin = snapMin(dy / HOUR_PX * 60);
          if (kind === 'resize') {
            st.dur = clamp(item.fullDur + dMin, MIN_BLOCK, 12 * 60);
            st.startMin = item.startMin;
            st.dayIdx = item.dayIdx;
          } else {
            st.startMin = clamp(item.startMin + dMin, 0, 24 * 60 - MIN_BLOCK);
            st.dur = item.fullDur;
            const colsEl = colsRef.current;
            if (colsEl && days.length > 1) {
              const r = colsEl.getBoundingClientRect();
              st.dayIdx = clamp(Math.floor((ev.clientX - r.left) / (r.width / days.length)), 0, days.length - 1);
            }
          }
          setDrag({ id: item.id, dayIdx: st.dayIdx, startMin: st.startMin, dur: st.dur });
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          setDrag(null);
          if (!st.moved) { if (kind === 'move') openTask(item.id); return; }
          scheduleTask(item.row, new Date(days[st.dayIdx].getTime() + st.startMin * 60000), st.dur);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      };

      const onBlockKey = (e, item) => {
        if (item.kind !== 'task') {
          if (e.key === 'Enter' && item.ev && item.ev.html_link) window.open(item.ev.html_link, '_blank', 'noopener');
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(item.id); return; }
        if (!e.altKey || !item.editable) return;
        const step = e.shiftKey ? 60 : SNAP;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const delta = (e.key === 'ArrowDown' ? step : -step);
          if (e.ctrlKey || e.metaKey) scheduleTask(item.row, new Date(days[item.dayIdx].getTime() + item.startMin * 60000), clamp(item.fullDur + delta, MIN_BLOCK, 12 * 60));
          else scheduleTask(item.row, new Date(days[item.dayIdx].getTime() + clamp(item.startMin + delta, 0, 24 * 60 - MIN_BLOCK) * 60000), item.fullDur);
        } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault();
          const d = addDays(days[item.dayIdx], e.key === 'ArrowRight' ? 1 : -1);
          scheduleTask(item.row, new Date(d.getTime() + item.startMin * 60000), item.fullDur);
        }
      };

      // ---- tray ------------------------------------------------------------
      const filt = (rows) => {
        const s = q.trim().toLowerCase();
        return apply(rows).filter(r => !isDone(r) && (!s || String(r.title || '').toLowerCase().indexOf(s) >= 0));
      };
      const trayRows = trayTab === 'unscheduled' ? filt(unscheduled.rows) : filt(overdue.rows);
      const trayLoading = trayTab === 'unscheduled' ? unscheduled.loading : overdue.loading;

      const candidates = useMemo(() => {
        const seen = {}, out = [];
        const push = (rows, reason) => (rows || []).forEach(r => {
          if (seen[r.id] || isDone(r)) return;
          seen[r.id] = 1; out.push({ row: r, reason });
        });
        push(apply(overdue.rows), 'overdue');
        push(rangeRows.filter(r => !r.due_has_time && r.due_at && sameDay(new Date(r.due_at), days[0])), 'today');
        push(apply(unscheduled.rows), 'unscheduled');
        const rank = { overdue: 0, today: 1, unscheduled: 2 };
        return out.sort((a, b) => (a.row.priority || 5) - (b.row.priority || 5)
          || rank[a.reason] - rank[b.reason]
          || String(a.row.due_at || '').localeCompare(String(b.row.due_at || '')));
      }, [overdue.rows, unscheduled.rows, inRange.rows, over, days]);

      const planBusy = useMemo(() => {
        const ds = days[0].getTime(), de = ds + DAYMS;
        const out = [];
        timedEvents.forEach(ev => {
          if (ev.transparency === 'transparent' || ev.response_status === 'declined') return;
          const s = new Date(ev.start).getTime(), e = new Date(ev.end).getTime();
          if (e > ds && s < de) out.push({ s: Math.max(s, ds), e: Math.min(e, de) });
        });
        timedTasks.forEach(r => {
          if (isDone(r)) return;
          const sp = taskSpan(r);
          if (sp.e > ds && sp.s < de) out.push({ s: Math.max(sp.s, ds), e: Math.min(sp.e, de) });
        });
        return out;
      }, [events, inRange.rows, over, days]);

      const scheduleNextFree = (row) => {
        const { plan } = planSlots({
          day: days[0], busy: planBusy, candidates: [{ row, reason: 'manual' }],
          workStart: 0, workEnd: 24 * 60,
        });
        if (!plan.length) { toast('No free slot left today'); return; }
        scheduleTask(row, plan[0].start, plan[0].dur);
      };

      // ---- header ----------------------------------------------------------
      const title = mode === 'week'
        ? fmtDate(days[0]) + ' – ' + fmtDate(days[6], { day: 'numeric', month: 'short', year: 'numeric' })
        : fmtDate(days[0], { weekday: 'long', day: 'numeric', month: 'long' });
      const shift = (n) => setAnchor(addDays(anchor, mode === 'week' ? 7 * n : n));

      const googleChip = (() => {
        if (!status || status.available === false) return null;
        if (!status.connected) {
          if (store.config && store.config.configured === false) return null;
          return h`<button type="button" class="gc-btn ghost" onClick=${async () => {
            try { await connectGoogle('calendar', currentUser && currentUser.email); toast('Google Calendar connected ✓'); loadEvents(); }
            catch (e) { if ((e && e.code) !== 'cancelled') toast(errText(e)); }
          }}><i class="ti ti-brand-google"></i> Connect Google Calendar</button>`;
        }
        if (status.status === 'error') {
          return h`<button type="button" class="gc-btn ghost" style=${{ color: '#f5a623' }} onClick=${async () => {
            try { await connectGoogle('calendar', currentUser && currentUser.email); loadEvents(); } catch (_) { /* ignore */ }
          }}><i class="ti ti-alert-triangle"></i> Reconnect Google</button>`;
        }
        return h`<button type="button" class="gc-btn ghost" title=${'Last synced ' + ago(status.last_sync_at)} onClick=${async () => {
          try { await syncNow({}); await loadEvents(); toast('Synced ✓'); } catch (e) { toast(errText(e)); }
        }}><i class=${'ti ' + (evLoading ? 'ti-loader-2' : 'ti-refresh')}></i> ${ago(status.last_sync_at)}</button>`;
      })();

      // ---- block renderer --------------------------------------------------
      const renderBlock = (it, dayIdx) => {
        const dragging = drag && it.kind === 'task' && drag.id === it.id;
        const startMin = it.startMin, dur = it.dur;
        const color = it.kind === 'event'
          ? (it.ev.color || '#4c8df6')
          : ((PRIORITIES[it.row.priority] && PRIORITIES[it.row.priority].color) || it.row.status_color || '#7b68ee');
        const cls = 'gc-blk ' + it.kind
          + (it.kind === 'task' && isDone(it.row) ? ' done' : '')
          + (it.kind === 'event' && it.ev.response_status === 'declined' ? ' declined' : '')
          + (dragging ? ' dragging' : '');
        const label = it.kind === 'event' ? it.ev.title : it.row.title;
        return h`<div key=${it.key} class=${cls} role="button" tabIndex=${0}
          aria-label=${label + ', ' + fmtTime(it.s) + ' to ' + fmtTime(it.e)}
          style=${{
            top: (startMin / 60) * HOUR_PX, height: Math.max((dur / 60) * HOUR_PX, 18),
            left: 'calc(' + (it.col / it.cols) * 100 + '% + 2px)',
            width: 'calc(' + (100 / it.cols) + '% - 5px)',
            borderLeftColor: color, background: it.kind === 'event' ? color + '22' : 'var(--cu-bg3)',
          }}
          onPointerDown=${it.kind === 'task' ? (e) => beginBlockDrag(e, it, 'move') : null}
          onClick=${it.kind === 'event' ? (e) => setEvCard({ ev: it.ev, x: e.clientX, y: e.clientY }) : null}
          onKeyDown=${(e) => onBlockKey(e, it)}>
          <div class="gc-blk-t">${it.kind === 'task' && isDone(it.row) ? '✓ ' : ''}${label}</div>
          ${dur >= 40 ? h`<div class="gc-blk-s">${fmtTime(it.s)}${it.kind === 'event' && it.ev.location ? ' · ' + it.ev.location : ''}${it.kind === 'task' && it.row.client_name ? ' · ' + it.row.client_name : ''}</div>` : null}
          ${it.kind === 'task' && it.editable && !LEGACY.has(it.row.type)
            ? h`<div class="gc-rsz" onPointerDown=${(e) => beginBlockDrag(e, it, 'resize')}></div>` : null}
        </div>`;
      };

      const ghostFor = (dayIdx) => {
        const g = (drag && { dayIdx: drag.dayIdx, startMin: drag.startMin, dur: drag.dur, label: 'Move' })
          || (dropGhost && !dropGhost.allDay && { dayIdx: dropGhost.dayIdx, startMin: dropGhost.startMin, dur: dropGhost.dur, label: 'Schedule' });
        if (!g || g.dayIdx !== dayIdx) return null;
        const base = days[dayIdx].getTime();
        return h`<div class="gc-blk ghost" style=${{
          top: (g.startMin / 60) * HOUR_PX, height: Math.max((g.dur / 60) * HOUR_PX, 18),
          left: 2, width: 'calc(100% - 5px)', borderLeftColor: 'var(--cu-accent)', background: 'var(--cu-accent-fog)',
        }}>
          <div class="gc-blk-t">${fmtTime(new Date(base + g.startMin * 60000))} – ${fmtTime(new Date(base + (g.startMin + g.dur) * 60000))}</div>
        </div>`;
      };

      return h`<div class="gc-pl gc-root">
        <div class="gc-pl-bar">
          <button type="button" class="gc-btn" onClick=${() => setAnchor(startOfDay(new Date()))}>Today</button>
          <button type="button" class="gc-ico" aria-label="Previous" onClick=${() => shift(-1)}><i class="ti ti-chevron-left"></i></button>
          <button type="button" class="gc-ico" aria-label="Next" onClick=${() => shift(1)}><i class="ti ti-chevron-right"></i></button>
          <div class="gc-pl-title">${title}</div>
          <div class="gc-seg">
            <button type="button" class=${mode === 'day' ? 'on' : ''} onClick=${() => setMode('day')}>Day</button>
            <button type="button" class=${mode === 'week' ? 'on' : ''} onClick=${() => setMode('week')}>Week</button>
          </div>
          <span class="gc-sp"></span>
          ${googleChip}
          <button type="button" class="gc-btn ghost" onClick=${() => setTrayOpen(!trayOpen)} aria-label="Toggle the task tray">
            <i class="ti ti-layout-sidebar"></i></button>
          <button type="button" class="gc-btn pri" onClick=${() => setPlanOpen(true)}><i class="ti ti-wand"></i> Plan my day</button>
        </div>

        <div class="gc-pl-body">
          <div class=${'gc-tray' + (trayOpen ? '' : ' hide')}>
            <div class="gc-tray-tabs">
              <button type="button" class=${trayTab === 'unscheduled' ? 'on' : ''} onClick=${() => setTrayTab('unscheduled')}>
                Unscheduled ${unscheduled.rows.length ? '(' + unscheduled.rows.length + ')' : ''}</button>
              <button type="button" class=${trayTab === 'overdue' ? 'on' : ''} onClick=${() => setTrayTab('overdue')}>
                Overdue ${overdue.rows.length ? '(' + overdue.rows.length + ')' : ''}</button>
            </div>
            <div style=${{ padding: '0 10px 8px' }}>
              <input class="gc-in" style=${{ width: '100%' }} placeholder="Search my tasks" value=${q}
                onInput=${(e) => setQ(e.target.value)} aria-label="Search my tasks"/>
            </div>
            <div class="gc-tray-list">
              ${trayLoading && !trayRows.length ? [0, 1, 2].map(i => h`<div key=${i} class="gc-skel" style=${{ height: 44, marginBottom: 6 }}></div>`) : null}
              ${!trayLoading && !trayRows.length ? h`<div class="gc-empty">
                <i class=${'ti ' + (trayTab === 'overdue' ? 'ti-checkbox' : 'ti-inbox')} style=${{ fontSize: 22 }}></i>
                <div>${trayTab === 'overdue' ? 'Nothing overdue. ' : 'Everything has a date. '}Drag tasks here from any list to plan them.</div>
              </div>` : null}
              ${trayRows.map(r => h`<${TrayItem} key=${r.id} row=${r} showDue=${trayTab === 'overdue'}
                onSchedule=${scheduleNextFree}
                onDragStart=${(e) => { dragRow.current = r; try { e.dataTransfer.setData('text/plain', 'ams-task:' + r.id); e.dataTransfer.effectAllowed = 'move'; } catch (_) { /* ignore */ } }}
                onDragEnd=${() => { dragRow.current = null; setDropGhost(null); }}/>`)}
            </div>
          </div>

          <div class="gc-main">
            <div class="gc-hd-row">
              <div class="gc-gutter"></div>
              ${dayData.map(d => h`<div key=${'h' + d.dayIdx} class=${'gc-hd-day' + (sameDay(d.day, new Date()) ? ' today' : '')}>
                <div class="gc-hd-dow">${d.day.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                <div class="gc-hd-num">${d.day.getDate()}</div>
              </div>`)}
            </div>
            <div class="gc-allday">
              <div class="gc-allday-lbl">All day</div>
              ${dayData.map(d => h`<div key=${'a' + d.dayIdx}
                class=${'gc-allday-col' + (dropGhost && dropGhost.allDay && dropGhost.dayIdx === d.dayIdx ? ' drop' : '')}
                onDragOver=${(e) => { if (!dragRow.current) return; e.preventDefault(); setDropGhost({ dayIdx: d.dayIdx, allDay: true }); }}
                onDragLeave=${() => setDropGhost(null)}
                onDrop=${(e) => onAllDayDrop(e, d.dayIdx)}>
                ${d.allDay.map((a, i) => a.kind === 'event'
                  ? h`<button type="button" key=${'ae' + a.ev.id} class="gc-adchip"
                      style=${{ borderLeftColor: a.ev.color || '#4c8df6', background: (a.ev.color || '#4c8df6') + '22' }}
                      onClick=${(e) => setEvCard({ ev: a.ev, x: e.clientX, y: e.clientY })}>${a.ev.title}</button>`
                  : h`<div key=${'at' + a.row.id} draggable="true"
                      class=${'gc-adchip' + (isDone(a.row) ? ' done' : '')}
                      style=${{ borderLeftColor: (PRIORITIES[a.row.priority] && PRIORITIES[a.row.priority].color) || '#7b68ee', cursor: 'grab' }}
                      role="button" tabIndex=${0}
                      onDragStart=${(e) => { dragRow.current = a.row; try { e.dataTransfer.setData('text/plain', 'ams-task:' + a.row.id); } catch (_) { /* ignore */ } }}
                      onDragEnd=${() => { dragRow.current = null; setDropGhost(null); }}
                      onClick=${() => openTask(a.row.id)}
                      onKeyDown=${(e) => { if (e.key === 'Enter') openTask(a.row.id); }}>${a.row.title}</div>`)}
              </div>`)}
            </div>

            <div class="gc-scroll" ref=${scrollRef}>
              <div class="gc-grid" style=${{ height: 24 * HOUR_PX }}>
                <div class="gc-hours">
                  ${Array.from({ length: 24 }, (_, i) => h`<div key=${i} class="gc-hour" style=${{ top: i * HOUR_PX }}>${i ? fmtHour(i) : ''}</div>`)}
                </div>
                <div class="gc-cols" ref=${colsRef}>
                  ${dayData.map(d => {
                    const isToday = sameDay(d.day, new Date());
                    const weekend = d.day.getDay() === 0 || d.day.getDay() === 6;
                    return h`<div key=${'c' + d.dayIdx} class=${'gc-col' + (weekend ? ' weekend' : '')}
                      style=${{ backgroundImage: 'repeating-linear-gradient(var(--cu-bd) 0 1px, transparent 1px ' + HOUR_PX + 'px)' }}
                      onDragOver=${(e) => onColDragOver(e, d.dayIdx)}
                      onDragLeave=${(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropGhost(null); }}
                      onDrop=${(e) => onColDrop(e, d.dayIdx)}>
                      ${d.items.map(it => renderBlock(it, d.dayIdx))}
                      ${ghostFor(d.dayIdx)}
                      ${isToday ? h`<div class="gc-now" style=${{ top: (minutesOf(new Date(nowTs)) / 60) * HOUR_PX }}></div>` : null}
                    </div>`;
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        ${planOpen ? h`<${PlanDayModal} day=${days[0]} busy=${planBusy} candidates=${candidates}
          onClose=${() => setPlanOpen(false)} onApply=${applyPlan}/>` : null}

        ${evCard ? h`<div class="gc-modal-bg" style=${{ background: 'transparent' }} onMouseDown=${() => setEvCard(null)}>
          <div class="gc-modal" style=${{ maxWidth: 380, position: 'fixed', left: clamp(evCard.x - 180, 10, Math.max(10, window.innerWidth - 390)), top: clamp(evCard.y + 12, 10, Math.max(10, window.innerHeight - 260)) }}
            onMouseDown=${(e) => e.stopPropagation()}>
            <div class="gc-modal-hd"><i class="ti ti-calendar-event"></i><span style=${{ flex: 1, minWidth: 0 }}>${evCard.ev.title}</span>
              <button type="button" class="gc-btn ghost sm" onClick=${() => setEvCard(null)} aria-label="Close"><i class="ti ti-x"></i></button>
            </div>
            <div class="gc-modal-b">
              <div class="gc-hint" style=${{ marginBottom: 8 }}>
                ${evCard.ev.all_day ? 'All day' : fmtTime(evCard.ev.start) + ' – ' + fmtTime(evCard.ev.end)}
                ${evCard.ev.calendar_name ? ' · ' + evCard.ev.calendar_name : ''}
                ${evCard.ev.location ? h`<div>${evCard.ev.location}</div>` : null}
              </div>
              <div class="gc-row">
                ${evCard.ev.meet_link ? h`<a class="gc-btn pri" href=${evCard.ev.meet_link} target="_blank" rel="noopener"><i class="ti ti-video"></i> Join</a>` : null}
                ${evCard.ev.html_link ? h`<a class="gc-btn" href=${evCard.ev.html_link} target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Open in Google</a>` : null}
                <button type="button" class="gc-btn" onClick=${() => {
                  setEvCard(null);
                  openCreateTask({ title: evCard.ev.title, due_at: evCard.ev.end, due_has_time: !evCard.ev.all_day });
                }}><i class="ti ti-plus"></i> Create task</button>
              </div>
            </div>
          </div>
        </div>` : null}
      </div>`;
    }

    // =======================================================================
    // Registry — pages / settings / agenda / attach / palette
    // =======================================================================
    const staffRole = (r) => !!r && r !== 'client';

    reg('pages', {
      id: 'planner', label: 'Planner', icon: 'ti-calendar-time', section: 'home', order: 25,
      apps: ['dashboard', 'tasks'],
      roles: staffRole,
      Component: PlannerPage,
    });

    reg('settingsSections', {
      id: 'calendar', label: 'Google Calendar', icon: 'ti-calendar-event', order: 62,
      roles: (r) => {
        if (!staffRole(r)) return false;
        if (!store.status && !store.inflight) refreshStatus(false);
        return available();
      },
      Component: CalendarSettingsSection,
    });

    reg('agendaSources', {
      id: 'gcal',
      async fetch(fromISO, toISO) {
        if (!store.status) await refreshStatus(false);
        if (!connected()) return [];
        const rows = await fetchEvents(fromISO, toISO);
        return rows
          .filter(e => e.response_status !== 'declined')
          .map(e => ({
            id: 'gcal:' + e.id, title: e.title, start: e.start, end: e.end, allDay: !!e.all_day,
            kind: 'event', color: e.color || '#4c8df6', icon: 'ti-brand-google',
            meta: e.calendar_name || 'Google Calendar',
            onOpen: e.html_link ? () => window.open(e.html_link, '_blank', 'noopener') : undefined,
          }));
      },
    });

    reg('taskPanelSections', {
      id: 'gdrive', title: 'Google Drive', icon: 'ti-brand-google-drive', order: 65, placement: 'main',
      when: () => driveReady(),
      Component: DriveAttachSection,
    });

    reg('paletteProviders', {
      id: 'drive', label: 'Drive', icon: 'ti-brand-google-drive',
      roles: (r) => staffRole(r) && !!(store.status && store.status.can_search_drive),
      async search(q) {
        if (!q || q.trim().length < 2 || !connected()) return [];
        try {
          const out = await edge('drive_search', { q: q.trim() });
          return (out.files || []).map(f => ({
            id: 'drive:' + f.id, label: f.name,
            sub: [mimeLabel(f.mime), f.owner, f.modified_at ? fmtDate(f.modified_at) : null].filter(Boolean).join(' · '),
            icon: mimeIcon(f.mime),
            run: () => window.open(f.url, '_blank', 'noopener'),
          }));
        } catch (_) { return []; }
      },
    });

    // The composer tool only exists while Drive is actually usable (spec: hidden
    // when not connected), so it is registered/removed as the status changes.
    function syncRegistrations() {
      if (driveReady() && store.pickerKey) {
        reg('composerTools', {
          id: 'gdrive', icon: 'ti-brand-google-drive', title: 'Attach from Google Drive',
          async run({ addAttachment, insertText, context }) {
            const docs = await openDrivePicker({});
            if (!docs.length) return;
            if (typeof addAttachment === 'function') {
              docs.forEach(d => addAttachment({ name: d.name, url: d.url, mime: d.mime, size: d.size, source: 'google_drive', icon: d.icon }));
            } else if (typeof insertText === 'function') {
              insertText(docs.map(d => d.name + ' ' + d.url).join('\n'));
            }
            if (context && context.taskId && typeof addAttachment !== 'function') await attachDriveToTask(context.taskId, docs);
          },
        });
      } else {
        unreg('composerTools', 'gdrive');
      }
    }
    if (driveReady()) pickerKey();
    syncRegistrations();
    refreshStatus(false);

    return {
      PlannerPage, CalendarSettingsSection, DriveAttachSection,
      gcal: {
        status: () => store.status,
        refresh: refreshStatus,
        connect: connectGoogle,
        disconnect: disconnectGoogle,
        sync: syncNow,
        events: fetchEvents,
        openDrivePicker,
        attachDriveToTask,
      },
    };
  }

  window.AMS_CALENDAR = { buildCalendar };
})();

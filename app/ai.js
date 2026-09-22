/* ============================================================================
 * ai.js — AI tools (workstream N of ClickUp parity v2). NOT the chat assistant.
 *
 *   window.AMS_AITOOLS.buildAi(deps) →
 *     { AI, runAi, aiErrorText, AiFieldSection, AiToolHost, AiWriteBlock,
 *       AiUsageSettings, openAiTool, AI_BLOCK_TYPES }
 *
 * buildAi also sets the runtime helper other modules use:
 *   window.AMS_AI = { enabled, status, run(action, payload), check(), onChange(fn),
 *                     errorText(err), meter, model }
 * `enabled` is true ONLY after the ai-tools Edge Function answers healthy
 * (key configured server-side + AI switched on for the org). Consumers check
 * `window.AMS_AI && window.AMS_AI.enabled` at click time; `run()` re-checks
 * health itself and throws a coded error otherwise, so callers can always try.
 *
 * No API key ever lives in the browser: every call posts { action, session_token }
 * to /functions/v1/ai-tools, which gathers grounded context server-side through
 * tenant-scoped RPCs (migration 103) and meters usage against the org's cap.
 *
 * Registers into window.AMS_EXT (docs/clickup-parity-v2-contract.md §2):
 *   taskPanelSections  ai_summary · ai_progress   (stored task_ai_fields, refreshable)
 *   taskMenuItems      ai_split · ai_triage · ai_meeting
 *   cards              ai_standup · ai_exec_summary · ai_client_weekly
 *   docBlocks          ai_write
 *   settingsSections   ai_usage
 *
 * Fails open everywhere: with the function undeployed / migration not applied /
 * AI switched off, sections and cards hide or show a plain explanation.
 * ==========================================================================*/
(function () {
  function buildAi(deps) {
    const d = deps || {};
    const React = d.React, h = d.h;
    const useState = d.useState, useEffect = d.useEffect, useRef = d.useRef;
    const useCallback = d.useCallback, useMemo = d.useMemo;
    if (!React || !h || !useState) { console.warn('[ai] missing React bridge — AI tools disabled'); return {}; }
    const rpcCall = d.rpcCall, SB_URL = d.SB_URL || '', SB_KEY = d.SB_KEY || '';
    const CardShell = d.CardShell, TaskAPI = d.TaskAPI, useTaskStore = d.useTaskStore;
    const fmtRelative = d.fmtRelative, createRoot = d.createRoot;

    // Any key an older build stored in the browser is a security bug — purge it.
    try { localStorage.removeItem('ams_ai_key'); } catch (_) { /* private mode */ }

    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key || item.type;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item);
    };
    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i
      .test(String((e && (e.code || '')) + ' ' + (e && (e.message || e.details || '') || '')));

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-ai-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-ai-styles';
      st.textContent = `
      .ai-wrap{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px;color:var(--cu-t1,#1f1f23)}
      .ai-wrap *,.ai-modal *{box-sizing:border-box}
      .ai-wrap :focus-visible,.ai-modal :focus-visible{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:1px}
      .ai-sec{border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);background:var(--cu-bg,#fff);padding:10px 12px;display:flex;flex-direction:column;gap:8px}
      .ai-hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .ai-hd .ai-t{font:600 13px Inter,system-ui,sans-serif}
      .ai-grow{flex:1 1 auto;min-width:8px}
      .ai-chip{display:inline-flex;align-items:center;gap:4px;height:19px;padding:0 7px;border-radius:9px;font:700 10px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c)}
      .ai-pill{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 8px;border-radius:10px;font:600 11px Inter,system-ui,sans-serif}
      .ai-meta{font-size:11px;color:var(--cu-t3,#8e8e99)}
      .ai-body{font-size:13px;line-height:1.55;color:var(--cu-t1,#1f1f23);white-space:pre-wrap;word-break:break-word}
      .ai-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:var(--cu-radius-sm,6px);border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:600 12px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
      .ai-btn:hover:not(:disabled){background:var(--cu-bg3,#efeff1)}
      .ai-btn:disabled{opacity:.5;cursor:not-allowed}
      .ai-btn.pri{background:var(--cu-accent,#ff00ee);border-color:var(--cu-accent,#ff00ee);color:#fff}
      .ai-btn.pri:hover:not(:disabled){filter:brightness(.94)}
      .ai-btn.lg{height:30px;padding:0 12px;font-size:13px}
      .ai-ibtn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--cu-radius-sm,6px);border:0;background:transparent;color:var(--cu-t2,#5c5c66);cursor:pointer;font-size:15px}
      .ai-ibtn:hover{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23)}
      .ai-in,.ai-ta,.ai-sel{width:100%;border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius-sm,6px);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:400 13px Inter,system-ui,sans-serif;padding:6px 8px}
      .ai-sel{height:28px;padding:0 6px;font-size:12px;width:auto;max-width:180px;cursor:pointer}
      .ai-ta{min-height:76px;resize:vertical;line-height:1.5}
      .ai-in:focus,.ai-ta:focus,.ai-sel:focus{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:-1px;border-color:transparent}
      .ai-lbl{font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3,#8e8e99);margin-bottom:4px}
      .ai-ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px}
      .ai-ul li{display:flex;gap:7px;align-items:flex-start;font-size:12.5px;line-height:1.5;color:var(--cu-t1,#1f1f23)}
      .ai-ul li:before{content:'';flex:0 0 5px;width:5px;height:5px;border-radius:50%;background:var(--cu-bd2,#d6d6db);margin-top:7px}
      .ai-err{display:flex;gap:7px;align-items:flex-start;font-size:12px;line-height:1.5;color:#b42318;background:rgba(229,72,77,.08);border:1px solid rgba(229,72,77,.25);border-radius:var(--cu-radius-sm,6px);padding:7px 9px}
      .ai-note{font-size:12px;color:var(--cu-t3,#8e8e99);line-height:1.5}
      .ai-sk{height:10px;border-radius:5px;background:var(--cu-bg3,#efeff1);animation:ai-pulse 1.2s ease-in-out infinite}
      @keyframes ai-pulse{0%,100%{opacity:1}50%{opacity:.45}}
      @media (prefers-reduced-motion:reduce){.ai-sk{animation:none}.ai-spin{animation:none}}
      .ai-spin{animation:ai-rot .9s linear infinite;display:inline-block}
      @keyframes ai-rot{to{transform:rotate(360deg)}}
      .ai-ov{position:fixed;inset:0;z-index:10050;background:rgba(15,15,20,.45);display:flex;align-items:center;justify-content:center;padding:16px}
      .ai-modal{width:min(660px,96vw);max-height:88vh;display:flex;flex-direction:column;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14));font-family:Inter,system-ui,sans-serif;font-size:13px}
      .ai-modal-hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--cu-bd,#e8e8eb)}
      .ai-modal-hd .t{font:600 15px Inter,system-ui,sans-serif}
      .ai-modal-bd{padding:14px;overflow:auto;display:flex;flex-direction:column;gap:12px}
      .ai-modal-ft{display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:10px 14px;border-top:1px solid var(--cu-bd,#e8e8eb);flex-wrap:wrap}
      .ai-row{display:flex;gap:9px;align-items:flex-start;border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius-sm,6px);padding:8px 10px;background:var(--cu-bg,#fff)}
      .ai-row.off{opacity:.5}
      .ai-row .ai-in{font-size:12.5px}
      .ai-tagrow{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:5px}
      .ai-tag{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:10px;background:var(--cu-bg3,#efeff1);color:var(--cu-t2,#5c5c66);font:600 11px Inter,system-ui,sans-serif}
      .ai-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px}
      .ai-metric{border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius-sm,6px);padding:7px 9px;background:var(--cu-bg2,#f7f7f8)}
      .ai-metric .v{font:600 17px Inter,system-ui,sans-serif}
      .ai-metric .l{font-size:11px;color:var(--cu-t3,#8e8e99);margin-top:1px}
      .ai-bar{height:8px;border-radius:4px;background:var(--cu-bg3,#efeff1);overflow:hidden}
      .ai-bar i{display:block;height:100%;background:var(--cu-accent,#ff00ee);border-radius:4px}
      .ai-bar.warn i{background:#f5a623}.ai-bar.over i{background:#e5484d}
      .ai-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
      .ai-tbl th{text-align:left;font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3,#8e8e99);padding:6px 8px;border-bottom:1px solid var(--cu-bd,#e8e8eb);white-space:nowrap}
      .ai-tbl td{padding:6px 8px;border-bottom:1px solid var(--cu-bd,#e8e8eb);white-space:nowrap}
      .ai-tbl td.num,.ai-tbl th.num{text-align:right}
      .ai-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
      .ai-card{border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--cu-bg,#fff)}
      .ai-months{display:flex;gap:6px;align-items:flex-end;height:64px}
      .ai-months div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;min-width:0}
      .ai-months i{display:block;width:100%;background:var(--cu-accent-fog,rgba(255,0,238,.12));border:1px solid var(--cu-accent,#ff00ee);border-radius:3px 3px 0 0;min-height:2px}
      .ai-months span{font-size:10px;color:var(--cu-t3,#8e8e99);white-space:nowrap}
      .ai-sw{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px}
      .ai-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
      @media(max-width:520px){.ai-modal{width:100%;max-height:94vh}.ai-sel{max-width:130px}}
      `;
      document.head.appendChild(st);
    }

    // =====================================================================
    // Runtime helper — window.AMS_AI
    // =====================================================================
    const SESSION_KEY = 'ams_session_token';
    const getToken = () => { try { return localStorage.getItem(SESSION_KEY) || ''; } catch (_) { return ''; } };

    const ERR_TEXT = {
      'ai.cap_reached': 'This workspace has used its AI allowance for the month. An admin can raise it in Settings → AI usage.',
      'ai.rate_limited': "You've reached today's AI limit for your account. It resets after midnight.",
      'ai.disabled': 'AI tools are switched off for this workspace.',
      'ai.not_configured': 'AI tools are not set up yet — the server is missing its AI key.',
      'ai.not_migrated': 'AI tools are not set up yet — the database update is still pending.',
      'ai.not_deployed': 'AI tools are not deployed yet.',
      'ai.unavailable': 'AI tools are unavailable right now.',
      'ai.refused': 'The AI declined this request. Try rephrasing it.',
      'ai.bad_output': "The AI's answer could not be read. Please try again.",
      'ai.truncated': 'The answer got too long. Try a shorter or more specific request.',
      'ai.busy': 'The AI service is busy. Try again in a minute.',
      'ai.timeout': 'The AI took too long to respond. Try again.',
      'ai.input_too_long': 'That text is too long for AI. Shorten it and try again.',
      'ai.nothing_to_do': 'There is nothing to work with yet — add some text first.',
      'ai.bad_input': 'Something required is missing from this request.',
      'ai.bad_action': 'That AI action is not available.',
      'ai.crash': 'Something went wrong on the AI server. Please try again.',
      forbidden: "You don't have access to that.",
      not_found: "That item could not be found, or isn't visible to you.",
      db_error: 'The workspace database refused that request.',
      'auth.invalid_session': 'Your session expired — please sign in again.',
      'auth.no_session': 'Please sign in again.',
      network: 'Network error — check your connection and try again.',
    };
    function errorText(e) {
      const code = e && (e.code || e.message);
      return ERR_TEXT[code] || (e && e.detail) || (e && e.message) || 'The AI request failed. Please try again.';
    }
    function mkErr(code, status, detail) {
      const e = new Error(code || 'ai.unavailable');
      e.code = code || 'ai.unavailable'; e.status = status || 0;
      if (detail) e.detail = detail;
      return e;
    }

    const subs = new Set();
    const AI = { __ams: true, enabled: false, status: 'idle', reason: null, meter: null, model: null };
    const emit = () => subs.forEach(fn => { try { fn(AI); } catch (err) { console.warn('[ai] listener', err); } });
    const setState = (patch) => { Object.assign(AI, patch); emit(); };

    async function callFn(action, payload, opts) {
      const token = getToken();
      if (!token) throw mkErr('auth.no_session', 401);
      let res;
      try {
        res = await fetch(SB_URL + '/functions/v1/ai-tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SB_KEY, apikey: SB_KEY },
          body: JSON.stringify(Object.assign({}, payload || {}, { action, session_token: token })),
          signal: opts && opts.signal,
        });
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        throw mkErr('network', 0, e && e.message);
      }
      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }
      if (!res.ok || !data || data.ok === false) {
        const code = (data && data.error) || (res.status === 404 ? 'ai.not_deployed' : 'http_' + res.status);
        if (code === 'ai.disabled' || code === 'ai.not_configured' || code === 'ai.not_migrated' || code === 'ai.not_deployed') {
          setState({ enabled: false, status: 'off', reason: code });
        }
        throw mkErr(code, res.status, data && data.detail);
      }
      return data;
    }

    let checkP = null, lastTok = null, lastAt = 0;
    function check(force) {
      const tok = getToken();
      if (!tok) {
        checkP = null; lastTok = null;
        if (AI.status !== 'idle') setState({ enabled: false, status: 'idle', reason: 'auth.no_session' });
        return Promise.resolve(false);
      }
      if (checkP && !force) return checkP;
      if (checkP && AI.status === 'checking') return checkP;
      lastTok = tok;
      setState({ status: 'checking' });
      checkP = callFn('health', {}).then((r) => {
        setState({
          enabled: !!r.healthy, status: r.healthy ? 'ready' : 'off',
          reason: r.healthy ? null : (r.configured === false ? 'ai.not_configured' : 'ai.disabled'),
          meter: r.meter || null, model: r.model || null,
        });
        return AI.enabled;
      }).catch((e) => {
        setState({ enabled: false, status: 'error', reason: (e && e.code) || 'ai.unavailable' });
        return false;
      }).then((v) => { lastAt = Date.now(); checkP = null; return v; });
      return checkP;
    }

    async function run(action, payload, opts) {
      if (!AI.enabled) {
        await check(AI.status !== 'checking');
        if (!AI.enabled) throw mkErr(AI.reason || 'ai.unavailable', 503);
      }
      const data = await callFn(action, payload || {}, opts);
      const u = data && data.usage;
      if (u && AI.meter) {
        const used = (AI.meter.used_tokens || 0) + (u.input_tokens || 0) + (u.output_tokens || 0);
        setState({ meter: Object.assign({}, AI.meter, {
          used_tokens: used,
          remaining_tokens: Math.max((AI.meter.monthly_token_cap || 0) - used, 0),
          requests_this_month: (AI.meter.requests_this_month || 0) + 1,
          my_requests_today: (AI.meter.my_requests_today || 0) + 1,
        }) });
      }
      return (data && data.result) || {};
    }

    AI.run = run;
    AI.check = check;
    AI.onChange = (fn) => { subs.add(fn); return () => subs.delete(fn); };
    AI.errorText = errorText;
    window.AMS_AI = AI;

    // one poller per page: picks up login/logout, re-checks health periodically
    if (window.__amsAiTimer) { try { clearInterval(window.__amsAiTimer); } catch (_) { /* noop */ } }
    window.__amsAiTimer = setInterval(() => {
      const tok = getToken();
      if (!tok) {
        if (AI.status !== 'idle') setState({ enabled: false, status: 'idle', reason: 'auth.no_session' });
        return;
      }
      if (tok !== lastTok) { check(true); return; }
      if (AI.status === 'checking') return;
      const age = Date.now() - lastAt;
      if (AI.status === 'error' ? age > 60000 : age > 600000) check(true);
    }, 20000);
    if (getToken()) check(true);

    // =====================================================================
    // Small shared helpers + atoms
    // =====================================================================
    function useAiStatus() {
      const [snap, setSnap] = useState(() => ({ enabled: AI.enabled, status: AI.status, reason: AI.reason, meter: AI.meter }));
      useEffect(() => AI.onChange((s) => setSnap({ enabled: s.enabled, status: s.status, reason: s.reason, meter: s.meter })), []);
      return snap;
    }

    const PRIO = { 1: { label: 'Urgent', color: '#e5484d' }, 2: { label: 'High', color: '#f5a623' },
                   3: { label: 'Normal', color: '#4c8df6' }, 4: { label: 'Low', color: '#9aa0a6' } };
    const PROGRESS_META = {
      on_track: { label: 'On track', color: '#30a46c' }, at_risk: { label: 'At risk', color: '#f5a623' },
      off_track: { label: 'Off track', color: '#e5484d' }, done: { label: 'Done', color: '#4c8df6' },
    };
    const ACTION_LABELS = {
      split_task: 'Split task', summarize_task: 'Task summary', progress_update: 'Progress update',
      standup: 'Standup', executive_summary: 'Executive summary', client_weekly_update: 'Client weekly update',
      write_doc: 'AI write', build_form: 'Form builder', triage_request: 'Request triage', meeting_actions: 'Meeting actions',
    };

    const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const fmtDay = (ymd) => {
      if (!ymd) return '';
      const dt = new Date(ymd + 'T12:00:00');
      return isNaN(dt) ? String(ymd) : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };
    // all-day due date → 23:59 IST, matching the task model
    const dueIso = (ymd) => {
      if (!ymd) return null;
      const dt = new Date(ymd + 'T23:59:00+05:30');
      return isNaN(dt) ? null : dt.toISOString();
    };
    const ago = (iso) => {
      if (!iso) return '';
      if (typeof fmtRelative === 'function') { try { return fmtRelative(iso); } catch (_) { /* fall through */ } }
      const diff = (Date.now() - new Date(iso).getTime()) / 1000;
      if (isNaN(diff)) return '';
      if (diff < 90) return 'just now';
      if (diff < 3600) return Math.round(diff / 60) + 'm ago';
      if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
      return Math.round(diff / 86400) + 'd ago';
    };
    const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-IN');
    const fmtTok = (n) => {
      const v = Number(n) || 0;
      if (v >= 1000000) return (v / 1000000).toFixed(v >= 10000000 ? 0 : 1) + 'M';
      if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'K';
      return String(v);
    };
    const copy = async (text, showToast) => {
      try { await navigator.clipboard.writeText(text); showToast && showToast('Copied'); }
      catch (_) { showToast && showToast('Could not copy'); }
    };
    const cacheGet = (k) => {
      try {
        const v = JSON.parse(localStorage.getItem(k) || 'null');
        return v && v.at && (Date.now() - v.at) < 864e5 ? v.data : null;
      } catch (_) { return null; }
    };
    const cacheSet = (k, data) => { try { localStorage.setItem(k, JSON.stringify({ at: Date.now(), data })); } catch (_) { /* full/private */ } };

    function Spinner() { return h`<i class="ti ti-loader-2 ai-spin" aria-hidden="true"></i>`; }
    function Lines({ n }) {
      return h`<div style=${{ display: 'flex', flexDirection: 'column', gap: 7 }} aria-hidden="true">
        ${Array.from({ length: n || 3 }).map((_, i) => h`<div key=${i} class="ai-sk" style=${{ width: (i % 3 === 2 ? 62 : i % 2 ? 88 : 96) + '%' }}></div>`)}
      </div>`;
    }
    function AiErr({ error, onRetry }) {
      if (!error) return null;
      return h`<div class="ai-err" role="alert">
        <i class="ti ti-alert-circle" style=${{ marginTop: 1 }} aria-hidden="true"></i>
        <span style=${{ flex: 1 }}>${errorText(error)}</span>
        ${onRetry && h`<button class="ai-btn" style=${{ height: 24, padding: '0 8px' }} onClick=${onRetry}>Retry</button>`}
      </div>`;
    }
    function Bullets({ items, title }) {
      if (!items || !items.length) return null;
      return h`<div>
        ${title && h`<div class="ai-lbl">${title}</div>`}
        <ul class="ai-ul">${items.map((t, i) => h`<li key=${i}>${t}</li>`)}</ul>
      </div>`;
    }
    // CardShell comes from home.js; keep cards usable if it isn't injected.
    function FallbackShell({ title, icon, count, onRefresh, right, children }) {
      return h`<div class="ai-card ai-wrap">
        <div class="ai-hd">
          ${icon && h`<i class=${'ti ' + icon} aria-hidden="true" style=${{ color: 'var(--cu-t3,#8e8e99)' }}></i>`}
          <span class="ai-t">${title}</span>
          ${count != null && h`<span class="ai-meta">${count}</span>`}
          <span class="ai-grow"></span>
          ${right}
          ${onRefresh && h`<button class="ai-ibtn" title="Refresh" aria-label="Refresh" onClick=${onRefresh}><i class="ti ti-refresh"></i></button>`}
        </div>
        ${children}
      </div>`;
    }
    const Shell = CardShell || FallbackShell;

    function AiOffNote({ status }) {
      const reason = (status && status.reason) || 'ai.unavailable';
      if (status && status.status === 'checking') return h`<div class="ai-note">Checking AI availability…</div>`;
      return h`<div class="ai-note">${ERR_TEXT[reason] || ERR_TEXT['ai.unavailable']}</div>`;
    }

    function Modal({ title, icon, onClose, children, footer, busy }) {
      const ref = useRef(null);
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose && onClose(); } };
        document.addEventListener('keydown', onKey, true);
        const el = ref.current && ref.current.querySelector('button,textarea,input');
        if (el) { try { el.focus(); } catch (_) { /* noop */ } }
        return () => document.removeEventListener('keydown', onKey, true);
      }, [onClose]);
      return h`<div class="ai-ov" onMouseDown=${(e) => { if (e.target === e.currentTarget && !busy) onClose && onClose(); }}>
        <div class="ai-modal" ref=${ref} role="dialog" aria-modal="true" aria-label=${title}>
          <div class="ai-modal-hd">
            <span class="ai-chip"><i class=${'ti ' + (icon || 'ti-sparkles')} aria-hidden="true"></i> AI</span>
            <span class="t">${title}</span>
            <span class="ai-grow"></span>
            <button class="ai-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="ai-modal-bd">${children}</div>
          ${footer && h`<div class="ai-modal-ft">${footer}</div>`}
        </div>
      </div>`;
    }

    // =====================================================================
    // Stored AI fields (task_ai_fields) — tiny shared cache
    // =====================================================================
    const fieldCache = new Map();   // taskId → { summary?, progress?, __missing? }
    const fieldSubs = new Map();    // taskId → Set(fn)
    const fieldInflight = new Map();
    function notifyFields(taskId) {
      const set = fieldSubs.get(taskId);
      if (set) set.forEach(fn => { try { fn(fieldCache.get(taskId)); } catch (_) { /* noop */ } });
    }
    function subscribeFields(taskId, fn) {
      if (!fieldSubs.has(taskId)) fieldSubs.set(taskId, new Set());
      fieldSubs.get(taskId).add(fn);
      return () => { const s = fieldSubs.get(taskId); if (s) s.delete(fn); };
    }
    function loadFields(taskId, force) {
      if (!taskId || typeof rpcCall !== 'function') return Promise.resolve(null);
      if (!force && fieldCache.has(taskId)) return Promise.resolve(fieldCache.get(taskId));
      if (fieldInflight.has(taskId)) return fieldInflight.get(taskId);
      const p = rpcCall('task_ai_fields_get', { p_task_id: taskId })
        .then((r) => { const v = r || {}; fieldCache.set(taskId, v); notifyFields(taskId); return v; })
        .catch((e) => {
          // migration not applied / no access → hide the feature, never toast-spam
          const v = isMissingRpc(e) ? { __missing: true } : {};
          fieldCache.set(taskId, v); notifyFields(taskId); return v;
        })
        .then((v) => { fieldInflight.delete(taskId); return v; });
      fieldInflight.set(taskId, p);
      return p;
    }
    function setField(taskId, kind, field) {
      const cur = Object.assign({}, fieldCache.get(taskId) || {});
      delete cur.__missing;
      cur[kind] = field;
      fieldCache.set(taskId, cur);
      notifyFields(taskId);
    }

    // ---- taskPanelSections: AI summary / AI progress ------------------------
    function AiFieldSection(props) {
      const kind = props.kind;
      const task = props.task || (props.detail && props.detail.task) || {};
      const showToast = props.showToast;
      const status = useAiStatus();
      const id = task && task.id;
      const [fields, setFields] = useState(() => (id ? fieldCache.get(id) : null) || null);
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState(null);

      useEffect(() => {
        if (!id) return undefined;
        let alive = true;
        const off = subscribeFields(id, (f) => { if (alive) setFields(f); });
        loadFields(id).then((f) => { if (alive) setFields(f); });
        return () => { alive = false; off(); };
      }, [id]);

      const field = fields && !fields.__missing ? fields[kind] : null;
      const meta = (field && field.meta) || {};
      const stale = !!(field && task.updated_at && new Date(task.updated_at) > new Date(field.generated_at));

      const generate = useCallback(async () => {
        if (!id) return;
        setBusy(true); setErr(null);
        try {
          const r = await run(kind === 'summary' ? 'summarize_task' : 'progress_update', { task_id: id });
          if (r && r.field) setField(id, kind, r.field);
          else await loadFields(id, true);
          showToast && showToast(kind === 'summary' ? 'AI summary updated' : 'AI progress update ready');
        } catch (e) { setErr(e); }
        finally { setBusy(false); }
      }, [id, kind, showToast]);

      if (!id) return null;
      if (fields && fields.__missing) return null;              // migration 103 not applied
      if (!field && !busy && !err && !status.enabled) return null; // nothing stored and AI unavailable

      const title = kind === 'summary' ? 'AI summary' : 'AI progress update';
      const prog = kind === 'progress' && meta.status ? PROGRESS_META[meta.status] : null;

      return h`<div class="ai-sec ai-wrap">
        <div class="ai-hd">
          <span class="ai-chip"><i class="ti ti-sparkles" aria-hidden="true"></i> AI</span>
          <span class="ai-t">${title}</span>
          ${prog && h`<span class="ai-pill" style=${{ background: prog.color + '1f', color: prog.color }}>${prog.label}</span>`}
          <span class="ai-grow"></span>
          ${field && h`<span class="ai-meta">${ago(field.generated_at)}${field.generated_by_name ? ' · ' + field.generated_by_name : ''}</span>`}
          <button class="ai-btn" onClick=${generate} disabled=${busy || !status.enabled}
            title=${status.enabled ? '' : errorText({ code: status.reason })}>
            ${busy ? h`<${Spinner}/>` : h`<i class=${'ti ' + (field ? 'ti-refresh' : 'ti-sparkles')} aria-hidden="true"></i>`}
            ${busy ? 'Working…' : field ? 'Refresh' : 'Generate'}
          </button>
        </div>
        ${busy && !field && h`<${Lines} n=${3}/>`}
        ${field && h`<div class="ai-body">${field.value}</div>`}
        ${field && kind === 'summary' && h`<${Bullets} items=${meta.key_points} title="Key points"/>`}
        ${field && kind === 'summary' && h`<${Bullets} items=${meta.open_questions} title="Open questions"/>`}
        ${field && kind === 'progress' && h`<div class="ai-grid2">
          <${Bullets} items=${meta.done} title="Done"/>
          <${Bullets} items=${meta.next} title="Next"/>
        </div>`}
        ${field && kind === 'progress' && h`<${Bullets} items=${meta.risks} title="Risks"/>`}
        ${stale && h`<div class="ai-note"><i class="ti ti-info-circle" aria-hidden="true"></i> The task changed after this was written — refresh for an up-to-date version.</div>`}
        ${!field && !busy && h`<div class="ai-note">${kind === 'summary'
          ? 'Summarise the description, comments and activity for anyone joining this task.'
          : 'Draft a status update from what has happened on this task.'}</div>`}
        <${AiErr} error=${err} onRetry=${generate}/>
        ${field && h`<div><button class="ai-btn" onClick=${() => copy(field.value, showToast)}><i class="ti ti-copy" aria-hidden="true"></i> Copy</button></div>`}
      </div>`;
    }

    // =====================================================================
    // Task tools: split · triage · meeting actions
    // =====================================================================
    function ToolModal({ kind, task, onClose, showToast, reload }) {
      const [notes, setNotes] = useState('');
      const [data, setData] = useState(null);
      const [sel, setSel] = useState(() => new Set());
      const [apply, setApply] = useState({ list: true, assignees: true, priority: true, due: true, type: false });
      const [busy, setBusy] = useState(false);
      const [saving, setSaving] = useState(false);
      const [err, setErr] = useState(null);
      const ranRef = useRef(false);

      const items = data ? (kind === 'split' ? data.tasks : data.actions) || [] : [];

      const generate = useCallback(async (extra) => {
        setBusy(true); setErr(null);
        try {
          let r;
          if (kind === 'split') r = await run('split_task', { task_id: task.id, text: extra || '' });
          else if (kind === 'triage') r = await run('triage_request', { task_id: task.id });
          else r = await run('meeting_actions', { task_id: task.id, notes: extra || '' });
          setData(r);
          const list = kind === 'split' ? (r.tasks || []) : kind === 'meeting' ? (r.actions || []) : [];
          setSel(new Set(list.map((_, i) => i)));
        } catch (e) { setErr(e); setData(null); }
        finally { setBusy(false); }
      }, [kind, task && task.id]);

      useEffect(() => { if (!ranRef.current) { ranRef.current = true; generate(''); } }, [generate]);

      const toggle = (i) => setSel((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
      const patchItem = (i, patch) => setData((prev) => {
        if (!prev) return prev;
        const key = kind === 'split' ? 'tasks' : 'actions';
        const next = (prev[key] || []).map((x, j) => (j === i ? Object.assign({}, x, patch) : x));
        return Object.assign({}, prev, { [key]: next });
      });

      const createSubtasks = async () => {
        if (!TaskAPI || typeof TaskAPI.create !== 'function') { showToast && showToast('Task API unavailable'); return; }
        const chosen = items.filter((_, i) => sel.has(i));
        if (!chosen.length) { showToast && showToast('Pick at least one'); return; }
        setSaving(true);
        let made = 0;
        try {
          for (const it of chosen) {
            await TaskAPI.create({
              title: it.title, description: it.description || null,
              parent_id: task.id, list_id: task.list_id, client_id: task.client_id || null,
              assignee_ids: it.assignee_id ? [it.assignee_id] : [],
              priority: it.priority || null,
              due_at: dueIso(it.due_date), due_has_time: false,
              estimate_minutes: it.estimate_minutes || null,
            });
            made++;
          }
          showToast && showToast(made + (made === 1 ? ' subtask created' : ' subtasks created'));
          reload && reload();
          onClose && onClose();
        } catch (e) {
          setErr(mkErr('db_error', 0, (e && e.message) || ''));
          if (made) { reload && reload(); }
        } finally { setSaving(false); }
      };

      const applyTriage = async () => {
        if (!TaskAPI || typeof TaskAPI.update !== 'function') { showToast && showToast('Task API unavailable'); return; }
        const patch = {};
        if (apply.list && data.list_id) patch.list_id = data.list_id;
        if (apply.priority && data.priority) patch.priority = data.priority;
        if (apply.due && data.due_date) { patch.due_at = dueIso(data.due_date); patch.due_has_time = false; }
        if (apply.type && data.type && data.type !== task.type) patch.type = data.type;
        if (apply.assignees && data.assignee_ids && data.assignee_ids.length) patch.assignee_ids = data.assignee_ids;
        if (!Object.keys(patch).length) { showToast && showToast('Nothing selected'); return; }
        setSaving(true);
        try {
          await TaskAPI.update(task.id, patch);
          showToast && showToast('Triage applied');
          reload && reload();
          onClose && onClose();
        } catch (e) { setErr(mkErr('db_error', 0, (e && e.message) || '')); }
        finally { setSaving(false); }
      };

      const title = kind === 'split' ? 'Split into subtasks' : kind === 'triage' ? 'Triage this request' : 'Meeting action items';
      const chosenCount = sel.size;

      const footer = kind === 'triage'
        ? h`<button class="ai-btn" onClick=${() => generate('')} disabled=${busy || saving}><i class="ti ti-refresh" aria-hidden="true"></i> Regenerate</button>
           <button class="ai-btn" onClick=${onClose} disabled=${saving}>Cancel</button>
           <button class="ai-btn pri lg" onClick=${applyTriage} disabled=${busy || saving || !data}>
             ${saving ? h`<${Spinner}/>` : h`<i class="ti ti-check" aria-hidden="true"></i>`} Apply
           </button>`
        : h`<button class="ai-btn" onClick=${() => generate(notes)} disabled=${busy || saving}><i class="ti ti-refresh" aria-hidden="true"></i> Regenerate</button>
           <button class="ai-btn" onClick=${onClose} disabled=${saving}>Cancel</button>
           <button class="ai-btn pri lg" onClick=${createSubtasks} disabled=${busy || saving || !chosenCount}>
             ${saving ? h`<${Spinner}/>` : h`<i class="ti ti-plus" aria-hidden="true"></i>`}
             ${'Create ' + chosenCount + (chosenCount === 1 ? ' subtask' : ' subtasks')}
           </button>`;

      return h`<${Modal} title=${title} onClose=${onClose} footer=${footer} busy=${saving}>
        <div class="ai-note">${task && task.title}</div>
        ${kind !== 'triage' && h`<div>
          <div class="ai-lbl">${kind === 'split' ? 'Extra detail (optional)' : 'Meeting notes (leave blank to use the task description)'}</div>
          <textarea class="ai-ta" value=${notes} onInput=${(e) => setNotes(e.target.value)}
            placeholder=${kind === 'split' ? 'Paste anything else that should be split up…' : 'Paste the notes from the meeting…'}></textarea>
          <div style=${{ marginTop: 6 }}>
            <button class="ai-btn" onClick=${() => generate(notes)} disabled=${busy}>
              ${busy ? h`<${Spinner}/>` : h`<i class="ti ti-sparkles" aria-hidden="true"></i>`} ${busy ? 'Working…' : 'Generate'}
            </button>
          </div>
        </div>`}
        <${AiErr} error=${err} onRetry=${() => generate(notes)}/>
        ${busy && h`<${Lines} n=${4}/>`}
        ${!busy && data && kind === 'meeting' && data.summary && h`<div><div class="ai-lbl">Summary</div><div class="ai-body">${data.summary}</div></div>`}
        ${!busy && data && kind === 'meeting' && h`<${Bullets} items=${data.decisions} title="Decisions"/>`}
        ${!busy && data && kind === 'triage' && h`<div style=${{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          ${data.reason && h`<div class="ai-body">${data.reason}</div>`}
          <div class="ai-note">Confidence: ${data.confidence || 'low'}</div>
          <label class="ai-sw"><input type="checkbox" checked=${apply.list} disabled=${!data.list_id}
            onChange=${(e) => setApply(Object.assign({}, apply, { list: e.target.checked }))}/>
            <span>Move to <b>${data.list_name || '—'}</b></span></label>
          <label class="ai-sw"><input type="checkbox" checked=${apply.assignees} disabled=${!(data.assignees || []).length}
            onChange=${(e) => setApply(Object.assign({}, apply, { assignees: e.target.checked }))}/>
            <span>Assign to <b>${(data.assignees || []).map(a => a.name).join(', ') || '—'}</b></span></label>
          <label class="ai-sw"><input type="checkbox" checked=${apply.priority} disabled=${!data.priority}
            onChange=${(e) => setApply(Object.assign({}, apply, { priority: e.target.checked }))}/>
            <span>Priority <b>${data.priority ? PRIO[data.priority].label : '—'}</b></span></label>
          <label class="ai-sw"><input type="checkbox" checked=${apply.due} disabled=${!data.due_date}
            onChange=${(e) => setApply(Object.assign({}, apply, { due: e.target.checked }))}/>
            <span>Due <b>${data.due_date ? fmtDay(data.due_date) : '—'}</b></span></label>
          ${data.type && data.type !== (task && task.type) && h`<label class="ai-sw"><input type="checkbox" checked=${apply.type}
            onChange=${(e) => setApply(Object.assign({}, apply, { type: e.target.checked }))}/>
            <span>Change type to <b>${data.type}</b></span></label>`}
        </div>`}
        ${!busy && data && kind !== 'triage' && h`<div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div class="ai-lbl">${items.length + (items.length === 1 ? ' task' : ' tasks') + ' · edit before creating'}</div>
          ${items.map((it, i) => h`<div key=${i} class=${'ai-row' + (sel.has(i) ? '' : ' off')}>
            <input type="checkbox" checked=${sel.has(i)} onChange=${() => toggle(i)} aria-label=${'Include ' + it.title} style=${{ marginTop: 6 }}/>
            <div style=${{ flex: 1, minWidth: 0 }}>
              <input class="ai-in" value=${it.title} onInput=${(e) => patchItem(i, { title: e.target.value })}/>
              ${it.description && h`<div class="ai-note" style=${{ marginTop: 4 }}>${it.description}</div>`}
              <div class="ai-tagrow">
                ${it.assignee_name && h`<span class="ai-tag"><i class="ti ti-user" aria-hidden="true"></i>${it.assignee_name}</span>`}
                ${it.due_date && h`<span class="ai-tag"><i class="ti ti-calendar" aria-hidden="true"></i>${fmtDay(it.due_date)}</span>`}
                ${it.priority && h`<span class="ai-tag" style=${{ color: PRIO[it.priority].color }}><i class="ti ti-flag-filled" aria-hidden="true"></i>${PRIO[it.priority].label}</span>`}
                ${it.estimate_minutes && h`<span class="ai-tag"><i class="ti ti-clock" aria-hidden="true"></i>${it.estimate_minutes}m</span>`}
              </div>
            </div>
          </div>`)}
          ${!items.length && h`<div class="ai-note">Nothing to create — try adding more detail above.</div>`}
        </div>`}
      <//>`;
    }

    // Mount a tool modal. Uses its own React root when index.html injects
    // createRoot; otherwise AiToolHost (inside the task panel) renders it.
    function openAiTool(kind, task, opts) {
      const o = opts || {};
      if (typeof createRoot === 'function') {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const root = createRoot(el);
        const close = () => {
          try { root.unmount(); } catch (_) { /* noop */ }
          try { el.remove(); } catch (_) { /* noop */ }
        };
        root.render(h`<${ToolModal} kind=${kind} task=${task} onClose=${close} showToast=${o.showToast} reload=${o.reload}/>`);
        return true;
      }
      try {
        window.dispatchEvent(new CustomEvent('ams-ai-tool', { detail: { kind, task, showToast: o.showToast, reload: o.reload } }));
        return true;
      } catch (_) { return false; }
    }

    // Host for the no-createRoot fallback; rendered by the AI summary section
    // and exported so the integrator can mount it once globally instead.
    function AiToolHost() {
      const [req, setReq] = useState(null);
      useEffect(() => {
        const onEvt = (e) => setReq((e && e.detail) || null);
        window.addEventListener('ams-ai-tool', onEvt);
        return () => window.removeEventListener('ams-ai-tool', onEvt);
      }, []);
      if (!req) return null;
      return h`<${ToolModal} kind=${req.kind} task=${req.task} showToast=${req.showToast} reload=${req.reload}
        onClose=${() => setReq(null)}/>`;
    }

    // =====================================================================
    // Cards
    // =====================================================================
    function useCardConfig(card, ctl) {
      const key = 'ams_ai_cardcfg_' + ((card && card.id) || (card && card.type) || 'ai');
      const [cfg, setCfg] = useState(() => {
        const base = (card && card.config) || {};
        try { return Object.assign({}, base, JSON.parse(localStorage.getItem(key) || '{}')); }
        catch (_) { return base; }
      });
      const update = useCallback((patch) => {
        setCfg((prev) => {
          const next = Object.assign({}, prev, patch);
          try { localStorage.setItem(key, JSON.stringify(next)); } catch (_) { /* noop */ }
          if (ctl && typeof ctl.onConfig === 'function') { try { ctl.onConfig(next); } catch (_) { /* noop */ } }
          return next;
        });
      }, [key, ctl]);
      return [cfg, update];
    }

    function useStore() {
      const store = typeof useTaskStore === 'function' ? useTaskStore() : null;
      return store || {};
    }

    function GenerateBar({ busy, onRun, label, disabled, status }) {
      return h`<div style=${{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button class="ai-btn pri" onClick=${onRun} disabled=${busy || disabled || !status.enabled}>
          ${busy ? h`<${Spinner}/>` : h`<i class="ti ti-sparkles" aria-hidden="true"></i>`} ${busy ? 'Working…' : label}
        </button>
        ${!status.enabled && h`<${AiOffNote} status=${status}/>`}
      </div>`;
    }

    function StandupCard({ card, ctl, currentUser, showToast }) {
      const status = useAiStatus();
      const store = useStore();
      const [cfg, setCfg] = useCardConfig(card, ctl);
      const role = (currentUser && currentUser.role_level) || '';
      const canPick = role === 'admin' || role === 'manager';
      const members = (store.members || []).filter(m => m && m.id);
      const memberId = canPick ? (cfg.member_id || '') : '';
      const cacheKey = 'ams_ai_standup_' + (memberId || 'me') + '_' + todayKey();
      const [res, setRes] = useState(() => cacheGet(cacheKey));
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState(null);
      useEffect(() => { setRes(cacheGet(cacheKey)); setErr(null); }, [cacheKey]);

      const go = useCallback(async () => {
        setBusy(true); setErr(null);
        try {
          const r = await run('standup', memberId ? { member_id: memberId } : {});
          setRes(r); cacheSet(cacheKey, r);
        } catch (e) { setErr(e); }
        finally { setBusy(false); }
      }, [memberId, cacheKey]);

      const right = canPick && members.length
        ? h`<select class="ai-sel" aria-label="Standup for" value=${memberId} onChange=${(e) => setCfg({ member_id: e.target.value })}>
            <option value="">Me</option>
            ${members.map(m => h`<option key=${m.id} value=${m.id}>${m.name}</option>`)}
          </select>`
        : null;

      return h`<${Shell} title="AI standup" icon="ti-sparkles" ctl=${ctl} right=${right}
          count=${res ? 'today' : null} onRefresh=${status.enabled ? go : null}>
        <div class="ai-wrap" style=${{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          ${!res && !busy && h`<div class="ai-note">Build today's standup from what you finished, what's due and what's blocked.</div>`}
          ${(!res || !busy) && h`<${GenerateBar} busy=${busy} onRun=${go} status=${status} label=${res ? 'Regenerate' : 'Generate standup'}/>`}
          ${busy && h`<${Lines} n=${4}/>`}
          <${AiErr} error=${err} onRetry=${go}/>
          ${res && h`<div style=${{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            ${res.member_name && h`<div class="ai-meta">${res.member_name} · ${res.date || todayKey()}</div>`}
            <${Bullets} items=${res.yesterday} title="Yesterday"/>
            <${Bullets} items=${res.today} title="Today"/>
            <${Bullets} items=${res.blockers && res.blockers.length ? res.blockers : ['None']} title="Blockers"/>
            <div><button class="ai-btn" onClick=${() => copy(res.text || '', showToast)}><i class="ti ti-copy" aria-hidden="true"></i> Copy</button></div>
          </div>`}
        </div>
      <//>`;
    }

    function ExecSummaryCard({ card, ctl, currentUser, showToast }) {
      const status = useAiStatus();
      const store = useStore();
      const [cfg, setCfg] = useCardConfig(card, ctl);
      const clients = store.clients || [];
      const clientId = cfg.client_id || '';
      const days = Number(cfg.days || 7);
      const cacheKey = 'ams_ai_exec_' + (clientId || 'all') + '_' + days + '_' + todayKey();
      const [res, setRes] = useState(() => cacheGet(cacheKey));
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState(null);
      useEffect(() => { setRes(cacheGet(cacheKey)); setErr(null); }, [cacheKey]);

      const go = useCallback(async () => {
        setBusy(true); setErr(null);
        try {
          const to = todayKey();
          const from = new Date(new Date(to + 'T12:00:00').getTime() - (days - 1) * 864e5).toLocaleDateString('en-CA');
          const r = await run('executive_summary', { client_id: clientId || null, from, to });
          setRes(r); cacheSet(cacheKey, r);
        } catch (e) { setErr(e); }
        finally { setBusy(false); }
      }, [clientId, days, cacheKey]);

      const right = h`<${React.Fragment}>
        <select class="ai-sel" aria-label="Scope" value=${clientId} onChange=${(e) => setCfg({ client_id: e.target.value })}>
          <option value="">Whole workspace</option>
          ${clients.map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
        </select>
        <select class="ai-sel" aria-label="Period" value=${String(days)} onChange=${(e) => setCfg({ days: Number(e.target.value) })}>
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </select>
      <//>`;

      return h`<${Shell} title="Executive summary" icon="ti-sparkles" ctl=${ctl} right=${right}
          count=${res ? days + 'd' : null} onRefresh=${status.enabled ? go : null} tall=${true}>
        <div class="ai-wrap" style=${{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          ${!res && !busy && h`<div class="ai-note">A leadership-ready read on delivery, risks and what to do next — numbers come straight from the workspace.</div>`}
          ${!busy && h`<${GenerateBar} busy=${busy} onRun=${go} status=${status} label=${res ? 'Regenerate' : 'Generate summary'}/>`}
          ${busy && h`<${Lines} n=${5}/>`}
          <${AiErr} error=${err} onRetry=${go}/>
          ${res && h`<div style=${{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            ${res.metrics && h`<div class="ai-metrics">
              ${res.metrics.map(m => h`<div key=${m.key} class="ai-metric"><div class="v">${fmtNum(m.value)}</div><div class="l">${m.label}</div></div>`)}
            </div>`}
            ${res.headline && h`<div style=${{ font: '600 14px Inter,system-ui,sans-serif' }}>${res.headline}</div>`}
            ${res.summary && h`<div class="ai-body">${res.summary}</div>`}
            <${Bullets} items=${res.wins} title="Wins"/>
            <${Bullets} items=${res.risks} title="Risks"/>
            <${Bullets} items=${res.recommendations} title="Recommended next"/>
            <div><button class="ai-btn" onClick=${() => copy([res.headline, res.summary,
              (res.wins || []).map(x => '• ' + x).join('\n'), (res.risks || []).map(x => '• ' + x).join('\n')]
              .filter(Boolean).join('\n\n'), showToast)}><i class="ti ti-copy" aria-hidden="true"></i> Copy</button></div>
          </div>`}
        </div>
      <//>`;
    }

    function ClientWeeklyCard({ card, ctl, currentUser, showToast }) {
      const status = useAiStatus();
      const store = useStore();
      const [cfg, setCfg] = useCardConfig(card, ctl);
      const clients = store.clients || [];
      const clientId = cfg.client_id || '';
      const cacheKey = 'ams_ai_weekly_' + (clientId || 'none') + '_' + todayKey();
      const [res, setRes] = useState(() => cacheGet(cacheKey));
      const [draft, setDraft] = useState('');
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState(null);
      useEffect(() => {
        const c = cacheGet(cacheKey);
        setRes(c); setDraft((c && c.body) || ''); setErr(null);
      }, [cacheKey]);

      const go = useCallback(async () => {
        if (!clientId) { showToast && showToast('Pick a client first'); return; }
        setBusy(true); setErr(null);
        try {
          const r = await run('client_weekly_update', { client_id: clientId });
          setRes(r); setDraft(r.body || ''); cacheSet(cacheKey, r);
        } catch (e) { setErr(e); }
        finally { setBusy(false); }
      }, [clientId, cacheKey, showToast]);

      const right = h`<select class="ai-sel" aria-label="Client" value=${clientId} onChange=${(e) => setCfg({ client_id: e.target.value })}>
        <option value="">Pick a client…</option>
        ${clients.map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
      </select>`;

      return h`<${Shell} title="Client weekly update" icon="ti-sparkles" ctl=${ctl} right=${right}
          count=${res ? 'draft' : null} onRefresh=${status.enabled && clientId ? go : null} tall=${true}>
        <div class="ai-wrap" style=${{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          ${!res && !busy && h`<div class="ai-note">Drafts a client-facing recap of the last 7 days. Always review before sending — nothing is sent automatically.</div>`}
          ${!busy && h`<${GenerateBar} busy=${busy} onRun=${go} status=${status} disabled=${!clientId} label=${res ? 'Regenerate draft' : 'Draft update'}/>`}
          ${busy && h`<${Lines} n=${5}/>`}
          <${AiErr} error=${err} onRetry=${go}/>
          ${res && h`<div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div class="ai-lbl">Subject</div>
              <input class="ai-in" value=${res.subject || ''} onInput=${(e) => setRes(Object.assign({}, res, { subject: e.target.value }))}/>
            </div>
            <div>
              <div class="ai-lbl">Draft</div>
              <textarea class="ai-ta" style=${{ minHeight: 190 }} value=${draft} onInput=${(e) => setDraft(e.target.value)}></textarea>
            </div>
            <div style=${{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button class="ai-btn" onClick=${() => copy(draft, showToast)}><i class="ti ti-copy" aria-hidden="true"></i> Copy body</button>
              <button class="ai-btn" onClick=${() => copy((res.subject || '') + '\n\n' + draft, showToast)}><i class="ti ti-mail" aria-hidden="true"></i> Copy with subject</button>
            </div>
          </div>`}
        </div>
      <//>`;
    }

    // =====================================================================
    // docBlocks: ai_write
    // =====================================================================
    const AI_BLOCK_TYPES = ['h1', 'h2', 'h3', 'text', 'bulleted', 'numbered', 'checklist', 'quote', 'callout', 'code', 'divider'];
    const PRESETS = [
      { label: 'Client brief', prompt: 'Write a client brief covering goals, audience, deliverables, timeline and approvals.' },
      { label: 'Brand SOP', prompt: 'Write a standard operating procedure for producing this brand\'s monthly content, step by step.' },
      { label: 'Meeting agenda', prompt: 'Write an agenda for the next client review meeting with time boxes.' },
      { label: 'Shoot plan', prompt: 'Write a shoot plan: shot list, props, locations, crew and timings.' },
    ];

    function BlockPreview({ blocks }) {
      if (!blocks || !blocks.length) return null;
      return h`<div style=${{ display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--cu-bd,#e8e8eb)', borderRadius: 6, padding: 10, maxHeight: 320, overflow: 'auto' }}>
        ${blocks.map((b, i) => {
          if (b.type === 'divider') return h`<hr key=${i} style=${{ border: 0, borderTop: '1px solid var(--cu-bd,#e8e8eb)', margin: '4px 0' }}/>`;
          const f = b.type === 'h1' ? '600 17px' : b.type === 'h2' ? '600 15px' : b.type === 'h3' ? '600 13.5px' : '400 13px';
          const pre = b.type === 'bulleted' ? '• ' : b.type === 'numbered' ? '– ' : b.type === 'checklist' ? '☐ ' : '';
          const style = { font: f + ' Inter,system-ui,sans-serif', lineHeight: 1.55, whiteSpace: 'pre-wrap' };
          if (b.type === 'quote') { style.borderLeft = '3px solid var(--cu-bd2,#d6d6db)'; style.paddingLeft = '8px'; style.color = 'var(--cu-t2,#5c5c66)'; }
          if (b.type === 'callout') { style.background = 'var(--cu-bg2,#f7f7f8)'; style.padding = '7px 9px'; style.borderRadius = '6px'; }
          if (b.type === 'code') { style.font = '400 12px ui-monospace,SFMono-Regular,Menlo,monospace'; style.background = 'var(--cu-bg2,#f7f7f8)'; style.padding = '7px 9px'; style.borderRadius = '6px'; }
          return h`<div key=${i} style=${style}>${pre + (b.text || '')}</div>`;
        })}
      </div>`;
    }

    function AiWriteBlock(props) {
      const status = useAiStatus();
      const block = props.block || {};
      const data = block.data || {};
      const [prompt, setPrompt] = useState(data.prompt || '');
      const [result, setResult] = useState(data.result || null);
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState(null);
      const clientId = props.clientId || (props.doc && (props.doc.client_id || props.doc.clientId)) || null;
      const taskId = props.taskId || (props.doc && props.doc.task_id) || null;

      const go = useCallback(async (p) => {
        const text = (p || prompt || '').trim();
        if (!text) return;
        setBusy(true); setErr(null);
        try {
          const r = await run('write_doc', { prompt: text, client_id: clientId, task_id: taskId });
          setResult(r);
          if (typeof props.onChange === 'function') props.onChange({ data: { prompt: text, result: r } });
        } catch (e) { setErr(e); }
        finally { setBusy(false); }
      }, [prompt, clientId, taskId, props.onChange]);

      const insert = () => {
        if (!result || !result.blocks || !result.blocks.length) return;
        if (typeof props.onReplace === 'function') props.onReplace(result.blocks, result.title);
        else if (typeof props.onInsert === 'function') props.onInsert(result.blocks, result.title);
        else if (typeof props.onChange === 'function') props.onChange({ data: { prompt, result, inserted: true } });
        props.showToast && props.showToast('Inserted');
      };

      if (props.readOnly) {
        return h`<div class="ai-wrap"><${BlockPreview} blocks=${result && result.blocks}/></div>`;
      }

      return h`<div class="ai-sec ai-wrap">
        <div class="ai-hd">
          <span class="ai-chip"><i class="ti ti-sparkles" aria-hidden="true"></i> AI</span>
          <span class="ai-t">Write with AI</span>
          <span class="ai-grow"></span>
          ${typeof props.onRemove === 'function' && h`<button class="ai-ibtn" aria-label="Remove block" onClick=${props.onRemove}><i class="ti ti-x"></i></button>`}
        </div>
        <textarea class="ai-ta" value=${prompt} onInput=${(e) => setPrompt(e.target.value)}
          placeholder="Describe what to write — e.g. 'A one-page brand SOP for monthly reels'"
          onKeyDown=${(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') go(); }}></textarea>
        <div class="ai-tagrow">
          ${PRESETS.map(p => h`<button key=${p.label} class="ai-btn" style=${{ height: 24, fontSize: 11.5 }}
            onClick=${() => { setPrompt(p.prompt); go(p.prompt); }} disabled=${busy || !status.enabled}>${p.label}</button>`)}
        </div>
        <div style=${{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button class="ai-btn pri" onClick=${() => go()} disabled=${busy || !prompt.trim() || !status.enabled}>
            ${busy ? h`<${Spinner}/>` : h`<i class="ti ti-sparkles" aria-hidden="true"></i>`} ${busy ? 'Writing…' : result ? 'Rewrite' : 'Write'}
          </button>
          ${result && h`<button class="ai-btn" onClick=${insert}><i class="ti ti-file-plus" aria-hidden="true"></i> Insert into doc</button>`}
          ${result && h`<button class="ai-btn" onClick=${() => copy((result.blocks || []).map(b => b.text).filter(Boolean).join('\n\n'), props.showToast)}><i class="ti ti-copy" aria-hidden="true"></i> Copy</button>`}
          ${!status.enabled && h`<${AiOffNote} status=${status}/>`}
        </div>
        <${AiErr} error=${err} onRetry=${() => go()}/>
        ${busy && h`<${Lines} n=${5}/>`}
        ${!busy && result && result.title && h`<div style=${{ font: '600 14px Inter,system-ui,sans-serif' }}>${result.title}</div>`}
        ${!busy && h`<${BlockPreview} blocks=${result && result.blocks}/>`}
      </div>`;
    }

    // =====================================================================
    // settingsSections: AI usage
    // =====================================================================
    function AiUsageSettings({ user, showToast }) {
      const status = useAiStatus();
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [missing, setMissing] = useState(false);
      const [err, setErr] = useState(null);
      const [form, setForm] = useState(null);
      const [saving, setSaving] = useState(false);
      const isAdmin = user && user.role_level === 'admin';

      const load = useCallback(async () => {
        if (typeof rpcCall !== 'function') { setLoading(false); return; }
        setLoading(true); setErr(null);
        try {
          const r = await rpcCall('ai_usage_summary', { p_months: 6 });
          setData(r || null);
          const m = (r && r.meter) || {};
          setForm({
            enabled: m.enabled !== false,
            monthly_token_cap: m.monthly_token_cap != null ? String(m.monthly_token_cap) : '',
            member_daily_requests: m.member_daily_requests != null ? String(m.member_daily_requests) : '',
          });
          setMissing(false);
        } catch (e) {
          if (isMissingRpc(e)) setMissing(true); else setErr(e);
        } finally { setLoading(false); }
      }, []);
      useEffect(() => { load(); AI.check(true); }, [load]);

      const save = async () => {
        if (!form) return;
        setSaving(true); setErr(null);
        try {
          await rpcCall('ai_settings_set', { p_patch: {
            enabled: !!form.enabled,
            monthly_token_cap: Number(form.monthly_token_cap) || 0,
            member_daily_requests: Number(form.member_daily_requests) || 0,
          } });
          showToast && showToast('AI settings saved');
          await load();
          AI.check(true);
        } catch (e) { setErr(e); }
        finally { setSaving(false); }
      };

      if (missing) {
        return h`<div class="ai-wrap"><div class="ai-card">
          <div class="ai-hd"><span class="ai-chip"><i class="ti ti-sparkles" aria-hidden="true"></i> AI</span><span class="ai-t">AI usage</span></div>
          <div class="ai-note">AI tools aren't set up on this workspace yet. Once the database update (migration 103) is applied and the ai-tools function is deployed, usage and limits appear here.</div>
        </div></div>`;
      }

      const meter = (data && data.meter) || status.meter || {};
      const used = Number(meter.used_tokens || 0), cap = Number(meter.monthly_token_cap || 0);
      const pct = cap > 0 ? Math.min(Math.round((used / cap) * 100), 100) : 0;
      const barClass = 'ai-bar' + (pct >= 100 ? ' over' : pct >= 80 ? ' warn' : '');
      const months = (data && data.months) || [];
      const peak = months.reduce((mx, m) => Math.max(mx, Number(m.tokens || 0)), 0) || 1;
      const dot = status.status === 'ready' ? '#30a46c' : status.status === 'checking' ? '#f5a623' : '#e5484d';

      return h`<div class="ai-wrap" style=${{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 880 }}>
        <div class="ai-card">
          <div class="ai-hd">
            <span class="ai-chip"><i class="ti ti-sparkles" aria-hidden="true"></i> AI</span>
            <span class="ai-t">Status</span>
            <span class="ai-grow"></span>
            <button class="ai-ibtn" aria-label="Refresh" title="Refresh" onClick=${() => { load(); AI.check(true); }}><i class="ti ti-refresh"></i></button>
          </div>
          <div style=${{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style=${{ width: 9, height: 9, borderRadius: '50%', background: dot, display: 'inline-block' }} aria-hidden="true"></span>
            <span>${status.status === 'ready' ? 'AI tools are working' : status.status === 'checking' ? 'Checking…' : errorText({ code: status.reason })}</span>
            ${AI.model && h`<span class="ai-meta">· model ${AI.model}</span>`}
          </div>
          <div class="ai-note">Requests run on the server (ai-tools Edge Function). No AI key is ever stored in the browser, and every call is logged below.</div>
        </div>

        <div class="ai-card">
          <div class="ai-hd"><span class="ai-t">This month</span><span class="ai-grow"></span>
            <span class="ai-meta">since ${meter.month_start || '—'}</span></div>
          ${loading && !data ? h`<${Lines} n=${3}/>` : h`<${React.Fragment}>
            <div class=${barClass}><i style=${{ width: pct + '%' }}></i></div>
            <div class="ai-meta">${fmtTok(used)} of ${fmtTok(cap)} tokens used (${pct}%)${meter.cap_reached ? ' · cap reached' : ''}</div>
            <div class="ai-metrics">
              <div class="ai-metric"><div class="v">${fmtNum(meter.requests_this_month || 0)}</div><div class="l">Requests</div></div>
              <div class="ai-metric"><div class="v">${fmtTok(meter.remaining_tokens || 0)}</div><div class="l">Tokens left</div></div>
              <div class="ai-metric"><div class="v">${fmtNum(meter.my_requests_today || 0)}</div><div class="l">Your requests today</div></div>
              <div class="ai-metric"><div class="v">${fmtNum(meter.member_daily_requests || 0)}</div><div class="l">Daily limit / person</div></div>
            </div>
            ${months.length > 0 && h`<div>
              <div class="ai-lbl">Last ${months.length} months</div>
              <div class="ai-months">
                ${months.map(m => h`<div key=${m.month} title=${fmtNum(m.tokens) + ' tokens · ' + fmtNum(m.requests) + ' requests'}>
                  <i style=${{ height: Math.max(2, Math.round((Number(m.tokens || 0) / peak) * 46)) + 'px' }}></i>
                  <span>${String(m.month).slice(5)}</span>
                </div>`)}
              </div>
            </div>`}
          <//>`}
        </div>

        ${isAdmin && form && h`<div class="ai-card">
          <div class="ai-hd"><span class="ai-t">Limits</span></div>
          <label class="ai-sw">
            <input type="checkbox" checked=${!!form.enabled} onChange=${(e) => setForm(Object.assign({}, form, { enabled: e.target.checked }))}/>
            <span>AI tools are available in this workspace</span>
          </label>
          <div class="ai-grid2">
            <div>
              <div class="ai-lbl">Monthly token cap</div>
              <input class="ai-in" type="number" min="0" step="100000" value=${form.monthly_token_cap}
                onInput=${(e) => setForm(Object.assign({}, form, { monthly_token_cap: e.target.value }))}/>
              <div class="ai-note" style=${{ marginTop: 4 }}>Input and output tokens combined. AI stops for everyone once this is reached.</div>
            </div>
            <div>
              <div class="ai-lbl">Requests per person per day</div>
              <input class="ai-in" type="number" min="0" step="10" value=${form.member_daily_requests}
                onInput=${(e) => setForm(Object.assign({}, form, { member_daily_requests: e.target.value }))}/>
              <div class="ai-note" style=${{ marginTop: 4 }}>Guard against runaway loops. Resets at midnight IST.</div>
            </div>
          </div>
          <div><button class="ai-btn pri" onClick=${save} disabled=${saving}>${saving ? h`<${Spinner}/>` : h`<i class="ti ti-check" aria-hidden="true"></i>`} Save</button></div>
        </div>`}
        ${!isAdmin && h`<div class="ai-note">Only an admin can change the AI limits.</div>`}

        <${AiErr} error=${err} onRetry=${load}/>

        ${data && (data.by_action || []).length > 0 && h`<div class="ai-card">
          <div class="ai-hd"><span class="ai-t">By tool (this month)</span></div>
          <div class="ai-scroll"><table class="ai-tbl">
            <thead><tr><th>Tool</th><th class="num">Requests</th><th class="num">Input</th><th class="num">Output</th><th class="num">Failed</th></tr></thead>
            <tbody>${data.by_action.map(r => h`<tr key=${r.action}>
              <td>${ACTION_LABELS[r.action] || r.action}</td>
              <td class="num">${fmtNum(r.requests)}</td>
              <td class="num">${fmtTok(r.input_tokens)}</td>
              <td class="num">${fmtTok(r.output_tokens)}</td>
              <td class="num">${fmtNum(r.failed)}</td>
            </tr>`)}</tbody>
          </table></div>
        </div>`}

        ${data && (data.by_member || []).length > 0 && h`<div class="ai-card">
          <div class="ai-hd"><span class="ai-t">By person (this month)</span></div>
          <div class="ai-scroll"><table class="ai-tbl">
            <thead><tr><th>Person</th><th class="num">Requests</th><th class="num">Tokens</th></tr></thead>
            <tbody>${data.by_member.map((r, i) => h`<tr key=${r.member_id || i}>
              <td>${r.name}</td><td class="num">${fmtNum(r.requests)}</td><td class="num">${fmtTok(r.tokens)}</td>
            </tr>`)}</tbody>
          </table></div>
        </div>`}

        ${data && (data.recent || []).length > 0 && h`<div class="ai-card">
          <div class="ai-hd"><span class="ai-t">Recent activity</span></div>
          <div class="ai-scroll"><table class="ai-tbl">
            <thead><tr><th>When</th><th>Tool</th><th>Person</th><th>Status</th><th class="num">Tokens</th></tr></thead>
            <tbody>${data.recent.map(r => h`<tr key=${r.id}>
              <td>${ago(r.created_at)}</td>
              <td>${ACTION_LABELS[r.action] || r.action}</td>
              <td>${r.member_name || '—'}</td>
              <td>${r.status === 'ok' ? 'ok' : (r.error || r.status)}</td>
              <td class="num">${fmtTok((r.input_tokens || 0) + (r.output_tokens || 0))}</td>
            </tr>`)}</tbody>
          </table></div>
        </div>`}
      </div>`;
    }

    // =====================================================================
    // Registrations (consumers read AMS_EXT at render time)
    // =====================================================================
    const aiOn = () => !!(window.AMS_AI && window.AMS_AI.enabled);

    reg('taskPanelSections', {
      id: 'ai_summary', title: 'AI summary', icon: 'ti-sparkles', order: 34, placement: 'main', bare: true,
      when: (t) => !!(t && t.id),
      Component: (p) => h`<${React.Fragment}>
        <${AiFieldSection} ...${p} kind="summary"/>
        ${typeof createRoot !== 'function' && h`<${AiToolHost}/>`}
      <//>`,
    });
    reg('taskPanelSections', {
      id: 'ai_progress', title: 'AI progress update', icon: 'ti-chart-line', order: 35, placement: 'main', bare: true,
      when: (t) => !!(t && t.id),
      Component: (p) => h`<${AiFieldSection} ...${p} kind="progress"/>`,
    });

    reg('taskMenuItems', {
      key: 'ai_split', label: 'Split into subtasks with AI', icon: 'ti-sparkles', order: 42,
      when: (t) => aiOn() && !!(t && t.id),
      run: (task, ctx) => { ctx && ctx.close && ctx.close(); openAiTool('split', task, ctx); },
    });
    reg('taskMenuItems', {
      key: 'ai_triage', label: 'Triage with AI', icon: 'ti-wand', order: 43,
      when: (t) => aiOn() && !!(t && t.id) && t.type === 'request',
      run: (task, ctx) => { ctx && ctx.close && ctx.close(); openAiTool('triage', task, ctx); },
    });
    reg('taskMenuItems', {
      key: 'ai_meeting', label: 'Extract action items with AI', icon: 'ti-list-check', order: 44,
      when: (t) => aiOn() && !!(t && t.id) && t.type === 'meeting',
      run: (task, ctx) => { ctx && ctx.close && ctx.close(); openAiTool('meeting', task, ctx); },
    });

    reg('cards', {
      type: 'ai_standup', name: 'AI standup', icon: 'ti-sparkles', category: 'AI', w: 1,
      desc: "Your standup for today — finished, planned and blocked — written from the workspace.",
      roles: (r) => r !== 'client', Component: StandupCard,
    });
    reg('cards', {
      type: 'ai_exec_summary', name: 'Executive summary', icon: 'ti-sparkles', category: 'AI', w: 2, multi: true,
      desc: 'Leadership read on delivery, risks and next actions for a client or the whole workspace.',
      roles: (r) => r === 'admin' || r === 'manager', Component: ExecSummaryCard,
    });
    reg('cards', {
      type: 'ai_client_weekly', name: 'Client weekly update', icon: 'ti-sparkles', category: 'AI', w: 2, multi: true,
      desc: 'Drafts a client-facing weekly recap you can review, edit and send.',
      roles: (r) => r === 'admin' || r === 'manager', Component: ClientWeeklyCard,
    });

    reg('docBlocks', { type: 'ai_write', label: 'AI write', icon: 'ti-sparkles', Component: AiWriteBlock });

    reg('settingsSections', {
      id: 'ai_usage', label: 'AI usage', icon: 'ti-sparkles', order: 78,
      roles: (r) => r === 'admin' || r === 'manager', Component: AiUsageSettings,
    });

    return {
      AI, runAi: run, checkAi: check, aiErrorText: errorText,
      AiFieldSection, AiToolHost, AiWriteBlock, AiUsageSettings,
      StandupCard, ExecSummaryCard, ClientWeeklyCard,
      openAiTool, AI_BLOCK_TYPES, AI_ACTION_LABELS: ACTION_LABELS,
    };
  }

  window.AMS_AITOOLS = { buildAi: buildAi };
})();

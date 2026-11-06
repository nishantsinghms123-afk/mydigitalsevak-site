/* ============================================================================
 * goals.js — Goals & targets (ClickUp parity v2, workstream F)
 *
 *   window.AMS_GOALS.buildGoals(deps) →
 *     { GoalsPage, GoalDetail, GoalsProgressCard, GoalAPI, goalStatusMeta }
 *
 * Folders → goals → targets. Four target kinds: number, currency (₹),
 * true/false and task-based (percentage of matching tasks done). Manual
 * targets keep an update history; task targets roll up live from tasks_query's
 * data model via the server. Goals can be linked to a client, owned by several
 * people, kept private, archived, and favorited.
 *
 * Server: migrations/096_dashboards_goals_teams.sql.
 * Contract: docs/clickup-parity-v2-contract.md §4 F. Notes: docs/parity-v2/notes-F.md
 * Fail-open: without 096 every RPC 404s — the page explains itself and the
 * progress card hides quietly. Nothing throws.
 * ==========================================================================*/
(function () {
  function buildGoals(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo, rpcCall } = deps;
    const Fragment = React.Fragment;

    const Av = deps.Av;
    const CardShell = deps.CardShell;
    const Popover = deps.Popover;
    const MemberAvatar = deps.MemberAvatar;
    const EmptyState = deps.EmptyState;
    const ConfirmDialog = deps.ConfirmDialog;
    const AssigneePicker = deps.AssigneePicker;
    const useTaskStore = deps.useTaskStore || (() => ({}));
    const fmtRelative = deps.fmtRelative || ((d) => new Date(d).toLocaleDateString('en-IN'));
    const fmtDateUser = deps.fmtDateUser || ((iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''));
    const isPrivilegedRole = deps.isPrivilegedRole || ((r) => r === 'admin' || r === 'manager');
    const isMissingRpc = deps.isMissingRpc || ((e) =>
      /PGRST202|could not find the function|does not exist|404/i.test(String((e && (e.code || '')) + ' ' + (e && (e.message || e.details || '') || ''))));

    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key || item.type;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item);
    };
    const DashCtx = window.__amsDashCtx || (window.__amsDashCtx = React.createContext(null));

    // =======================================================================
    // Styles
    // =======================================================================
    if (!document.getElementById('ams-goals-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-goals-styles';
      st.textContent = `
      .cg-page{display:flex;flex-direction:column;min-height:0;flex:1;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px}
      .cg-page *,.cg-modal *{box-sizing:border-box}
      .cg-page :focus-visible,.cg-modal :focus-visible{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:1px}
      .cg-hd{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 20px 10px}
      .cg-title{font:600 18px Inter,system-ui,sans-serif;display:flex;align-items:center;gap:8px;min-width:0}
      .cg-tools{display:flex;gap:6px;align-items:center;margin-left:auto;flex-wrap:wrap}
      .cg-body{display:flex;min-height:0;flex:1}
      .cg-side{width:230px;flex-shrink:0;border-right:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg2,#f7f7f8);overflow:auto;padding:10px 8px}
      .cg-main{flex:1;min-width:0;overflow:auto;padding:12px 20px 30px}
      @media(max-width:820px){.cg-side{display:none}.cg-main{padding:12px}.cg-hd{padding:12px}}
      .cg-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:var(--cu-radius-sm,6px);border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:600 13px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
      .cg-btn:hover{background:var(--cu-bg3,#efeff1)}
      .cg-btn:disabled{opacity:.5;cursor:not-allowed}
      .cg-btn.pri{background:var(--cu-accent,#ff00ee);border-color:var(--cu-accent,#ff00ee);color:#fff}
      .cg-btn.pri:hover{filter:brightness(.94)}
      .cg-btn.sm{height:26px;padding:0 8px;font-size:12px}
      .cg-ibtn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--cu-radius-sm,6px);border:0;background:transparent;color:var(--cu-t2,#5c5c66);cursor:pointer;font-size:15px}
      .cg-ibtn:hover{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23)}
      .cg-chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:12px;border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t2,#5c5c66);font:500 12px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
      .cg-chip.on{border-color:var(--cu-accent,#ff00ee);background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c)}
      .cg-fold{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:4px 8px;border:0;border-radius:var(--cu-radius-sm,6px);background:none;color:var(--cu-t1,#1f1f23);font:13px Inter,system-ui,sans-serif;cursor:pointer;text-align:left}
      .cg-fold:hover{background:var(--cu-bg3,#efeff1)}
      .cg-fold.on{background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c);font-weight:600}
      .cg-fold .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cg-fold .n{font-size:11px;color:var(--cu-t3,#8e8e99)}
      .cg-sec{font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3,#8e8e99);padding:12px 8px 4px}
      .cg-card{background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);padding:12px 14px;margin-bottom:10px}
      .cg-goal{display:flex;gap:12px;align-items:flex-start;cursor:pointer}
      .cg-goal:hover{border-color:var(--cu-bd2,#d6d6db)}
      .cg-goal .nm{font:600 14px Inter,system-ui,sans-serif;display:flex;align-items:center;gap:6px;min-width:0}
      .cg-goal .nm span.t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cg-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:var(--cu-t3,#8e8e99);margin-top:4px}
      .cg-bar{height:8px;border-radius:4px;background:var(--cu-bg3,#efeff1);overflow:hidden;margin-top:8px}
      .cg-bar>span{display:block;height:100%;border-radius:4px}
      .cg-pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;border-radius:9px;padding:1px 7px;white-space:nowrap}
      .cg-tgt{display:flex;gap:10px;align-items:center;padding:8px 6px;border-top:1px solid var(--cu-bd,#e8e8eb)}
      .cg-tgt .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
      .cg-tgt .val{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
      .cg-input,.cg-sel,.cg-ta{width:100%;height:32px;border:1px solid var(--cu-bd2,#d6d6db);border-radius:var(--cu-radius-sm,6px);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);padding:0 9px;font:13px Inter,system-ui,sans-serif}
      .cg-ta{height:auto;min-height:64px;padding:8px 9px;resize:vertical}
      .cg-input:focus,.cg-sel:focus,.cg-ta:focus{border-color:var(--cu-accent,#ff00ee);outline:none}
      .cg-lab{display:block;font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3,#8e8e99);margin:12px 0 5px}
      .cg-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media(max-width:520px){.cg-row2{grid-template-columns:1fr}}
      .cg-modal-bg{position:fixed;inset:0;background:rgba(10,10,14,.45);z-index:430;display:flex;align-items:center;justify-content:center;padding:16px}
      .cg-modal{background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);border-radius:var(--cu-radius,8px);box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14));width:min(620px,100%);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;font:13px Inter,system-ui,sans-serif}
      .cg-modal-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid var(--cu-bd,#e8e8eb);font:600 16px Inter,system-ui,sans-serif}
      .cg-modal-bd{padding:12px 16px;overflow:auto}
      .cg-modal-ft{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--cu-bd,#e8e8eb)}
      .cg-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:30px 14px;color:var(--cu-t3,#8e8e99)}
      .cg-empty i{font-size:26px;opacity:.7}
      .cg-empty .t{font-size:13.5px;font-weight:600;color:var(--cu-t2,#5c5c66)}
      .cg-sk{height:28px;border-radius:6px;margin:6px;background:linear-gradient(90deg,var(--cu-bg2,#f7f7f8),var(--cu-bg3,#efeff1),var(--cu-bg2,#f7f7f8));background-size:200% 100%;animation:cgsk 1.2s infinite}
      @keyframes cgsk{0%{background-position:200% 0}100%{background-position:-200% 0}}
      .cg-upd{display:flex;gap:10px;align-items:flex-start;padding:8px 4px;border-bottom:1px solid var(--cu-bd,#e8e8eb);font-size:12.5px}
      .cg-upd:last-child{border-bottom:0}
      @media(prefers-reduced-motion:reduce){.cg-page *,.cg-modal *{transition:none!important;animation:none!important}}
      `;
      document.head.appendChild(st);
    }

    // =======================================================================
    // Utils + API
    // =======================================================================
    const arr = (x) => (Array.isArray(x) ? x : []);
    const errMsg = (e) => {
      if (!e) return 'Something went wrong';
      const m = String(e.message || e.code || e);
      if (/forbidden/i.test(m)) return 'You do not have access to do that';
      if (/not_found/.test(m)) return 'That goal no longer exists';
      if (/target_is_automatic/.test(m)) return 'Task targets update themselves';
      if (/bad_name/.test(m)) return 'Give it a name first';
      if (/bad_folder/.test(m)) return 'That folder isn’t available';
      return m;
    };
    const toast = (fn, msg) => { try { fn ? fn(msg) : console.info('[goals]', msg); } catch (_) {} };
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    const pct = (p) => Math.round(clamp(Number(p) || 0, 0, 1) * 100);
    const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
    const numFmt = (n) => (Number(n) || 0).toLocaleString('en-IN');
    const clientList = (clients) => (Array.isArray(clients) ? clients : clients ? Object.values(clients) : []);

    const GoalAPI = {
      overview: (incl) => rpcCall('goals_overview', { p_include_archived: !!incl }),
      get: (id) => rpcCall('goal_get', { p_id: id }),
      upsert: (data) => rpcCall('goal_upsert', { p_data: data }),
      remove: (id) => rpcCall('goal_delete', { p_id: id }),
      folderUpsert: (data) => rpcCall('goal_folder_upsert', { p_data: data }),
      folderDelete: (id) => rpcCall('goal_folder_delete', { p_id: id }),
      targetUpsert: (data) => rpcCall('goal_target_upsert', { p_data: data }),
      targetDelete: (id) => rpcCall('goal_target_delete', { p_id: id }),
      log: (targetId, value, note) => rpcCall('goal_target_log', { p_target_id: targetId, p_value: value, p_note: note || null }),
      progress: (ids, limit) => rpcCall('goals_progress', { p_ids: ids || null, p_limit: limit || 12 }),
      favorite: (id, label) => rpcCall('favorite_toggle', { p_kind: 'goal', p_ref_id: id, p_label: label || 'Goal', p_url: null }),
    };

    const STATUS_META = {
      done: { label: 'Achieved', color: '#0ca30c', icon: 'ti-circle-check' },
      on_track: { label: 'On track', color: '#0ca30c', icon: 'ti-trending-up' },
      at_risk: { label: 'At risk', color: '#fab219', icon: 'ti-alert-triangle' },
      off_track: { label: 'Off track', color: '#d03b3b', icon: 'ti-trending-down' },
      no_target_date: { label: 'No due date', color: '#8e8e99', icon: 'ti-calendar-off' },
    };
    const goalStatusMeta = (s) => STATUS_META[s] || STATUS_META.no_target_date;
    const targetValueText = (t) => {
      const cur = Number(t.current_value) || 0, tgt = Number(t.target_value) || 0;
      if (t.kind === 'tasks') return (t.done_tasks || 0) + ' / ' + (t.total_tasks || 0) + ' tasks';
      if (t.kind === 'boolean') return cur >= 1 ? 'Done' : 'Not yet';
      if (t.kind === 'currency') return inr(cur) + ' / ' + inr(tgt);
      return numFmt(cur) + ' / ' + numFmt(tgt) + (t.unit ? ' ' + t.unit : '');
    };

    function Loading({ rows = 4 }) {
      return h`<div aria-busy="true" aria-label="Loading">${Array.from({ length: rows }).map((_, i) => h`<div key=${i} class="cg-sk" style=${{ opacity: 1 - i * 0.18 }}></div>`)}</div>`;
    }
    function Empty({ icon = 'ti-target', title, sub, action }) {
      if (EmptyState) return h`<${EmptyState} icon=${icon} title=${title} sub=${sub} action=${action}/>`;
      return h`<div class="cg-empty"><i class=${'ti ' + icon}></i><div class="t">${title}</div>${sub && h`<div style=${{ fontSize: 12 }}>${sub}</div>`}${action}</div>`;
    }

    // Progress ring
    function Ring({ value, size = 44, stroke = 5, color }) {
      const p = clamp(Number(value) || 0, 0, 1);
      const r = (size - stroke) / 2, c = 2 * Math.PI * r;
      return h`<svg width=${size} height=${size} viewBox=${'0 0 ' + size + ' ' + size} role="img" aria-label=${pct(p) + '% complete'} style=${{ flexShrink: 0 }}>
        <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" strokeWidth=${stroke} style=${{ stroke: 'var(--cu-bg3,#efeff1)' }}/>
        <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" strokeWidth=${stroke} stroke=${color || 'var(--cu-accent,#ff00ee)'}
          strokeLinecap="round" strokeDasharray=${(c * p) + ' ' + (c * (1 - p) + 0.001)} transform=${'rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')'}/>
        <text x="50%" y="50%" dy="3.5" textAnchor="middle" style=${{ fill: 'var(--cu-t1,#1f1f23)', font: '600 ' + Math.round(size / 3.6) + 'px Inter,system-ui,sans-serif' }}>${pct(p)}</text>
      </svg>`;
    }

    // =======================================================================
    // Target editor / logger
    // =======================================================================
    const KINDS = [['number', 'Number', 'ti-hash'], ['currency', 'Currency (₹)', 'ti-currency-rupee'],
      ['boolean', 'True / false', 'ti-toggle-left'], ['tasks', 'Task completion', 'ti-checkbox']];

    function TargetDialog({ goal, target, onClose, onSaved, showToast }) {
      const store = useTaskStore();
      const t = target || {};
      const [d, setD] = useState(() => ({
        name: t.name || '', kind: t.kind || 'number', unit: t.unit || '',
        start_value: t.start_value != null ? String(t.start_value) : '0',
        target_value: t.target_value != null && t.kind !== 'tasks' ? String(t.target_value) : '',
        current_value: t.current_value != null ? String(t.current_value) : '',
        owner_id: t.owner_id || '',
        task_filter: (t.task_filter && typeof t.task_filter === 'object') ? t.task_filter : {},
      }));
      const [busy, setBusy] = useState(false);
      const set = (p) => setD(x => ({ ...x, ...p }));
      const lists = arr(store.lists).filter(l => !l.archived);
      const clients = arr(store.clients);
      const tags = arr(store.tags);
      const tf = d.task_filter || {};
      const setTf = (p) => set({ task_filter: { ...tf, ...p } });
      const toggleIn = (key, id) => { const cur = arr(tf[key]); setTf({ [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] }); };
      const save = async () => {
        const name = d.name.trim();
        if (!name) { toast(showToast, 'Give the target a name'); return; }
        if (d.kind === 'tasks' && !arr(tf.list_ids).length && !arr(tf.client_ids).length && !arr(tf.tag_ids).length) {
          toast(showToast, 'Pick at least one list, client or tag for a task target'); return;
        }
        setBusy(true);
        try {
          const payload = {
            id: t.id || undefined, goal_id: goal.id, name, kind: d.kind,
            unit: d.kind === 'number' ? d.unit.trim() : null,
            owner_id: d.owner_id || null,
            task_filter: d.kind === 'tasks' ? tf : {},
          };
          if (d.kind === 'number' || d.kind === 'currency') {
            payload.start_value = Number(d.start_value) || 0;
            payload.target_value = Number(d.target_value) || 0;
            if (!t.id) payload.current_value = d.current_value === '' ? (Number(d.start_value) || 0) : Number(d.current_value);
          }
          const g = await GoalAPI.targetUpsert(payload);
          onSaved(g); onClose();
          toast(showToast, t.id ? 'Target updated' : 'Target added');
        } catch (e) { toast(showToast, errMsg(e)); }
        setBusy(false);
      };
      return h`<div class="cg-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="cg-modal" role="dialog" aria-modal="true" aria-label=${t.id ? 'Edit target' : 'Add target'}>
          <div class="cg-modal-hd">${t.id ? 'Edit target' : 'Add target'}<button class="cg-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button></div>
          <div class="cg-modal-bd">
            <label class="cg-lab" style=${{ marginTop: 0 }} for="cg-t-name">Name</label>
            <input id="cg-t-name" class="cg-input" value=${d.name} placeholder="e.g. Instagram followers" onInput=${(e) => set({ name: e.target.value })}/>
            <div class="cg-lab">Type</div>
            <div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="radiogroup" aria-label="Target type">
              ${KINDS.map(k => h`<button key=${k[0]} type="button" role="radio" aria-checked=${d.kind === k[0] ? 'true' : 'false'}
                class=${'cg-chip' + (d.kind === k[0] ? ' on' : '')} onClick=${() => set({ kind: k[0] })}><i class=${'ti ' + k[2]}></i>${k[1]}</button>`)}
            </div>
            ${(d.kind === 'number' || d.kind === 'currency') && h`<div>
              <div class="cg-row2">
                <div><label class="cg-lab" for="cg-t-start">Starting value</label>
                  <input id="cg-t-start" class="cg-input" type="number" value=${d.start_value} onInput=${(e) => set({ start_value: e.target.value })}/></div>
                <div><label class="cg-lab" for="cg-t-target">Target value</label>
                  <input id="cg-t-target" class="cg-input" type="number" value=${d.target_value} onInput=${(e) => set({ target_value: e.target.value })}/></div>
              </div>
              <div class="cg-row2">
                ${!t.id && h`<div><label class="cg-lab" for="cg-t-cur">Current value</label>
                  <input id="cg-t-cur" class="cg-input" type="number" value=${d.current_value} placeholder=${d.start_value} onInput=${(e) => set({ current_value: e.target.value })}/></div>`}
                ${d.kind === 'number' && h`<div><label class="cg-lab" for="cg-t-unit">Unit (optional)</label>
                  <input id="cg-t-unit" class="cg-input" value=${d.unit} placeholder="followers, leads…" onInput=${(e) => set({ unit: e.target.value })}/></div>`}
              </div>
            </div>`}
            ${d.kind === 'boolean' && h`<div class="cg-empty" style=${{ padding: '14px', textAlign: 'left', alignItems: 'flex-start' }}>
              <div style=${{ fontSize: 12.5 }}>A true/false target counts as 100% once someone marks it done.</div></div>`}
            ${d.kind === 'tasks' && h`<div>
              <div class="cg-lab">Count tasks in</div>
              <div class="cg-sec" style=${{ padding: '4px 0 2px' }}>Lists</div>
              <div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflow: 'auto' }}>
                ${lists.length === 0 ? h`<span class="cg-empty" style=${{ padding: 4 }}>No lists yet</span>`
                  : lists.map(l => h`<button key=${l.id} type="button" class=${'cg-chip' + (arr(tf.list_ids).includes(l.id) ? ' on' : '')}
                      aria-pressed=${arr(tf.list_ids).includes(l.id) ? 'true' : 'false'} onClick=${() => toggleIn('list_ids', l.id)}>${l.name}</button>`)}
              </div>
              <div class="cg-sec" style=${{ padding: '8px 0 2px' }}>Clients</div>
              <div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflow: 'auto' }}>
                ${clients.map(c => h`<button key=${c.id} type="button" class=${'cg-chip' + (arr(tf.client_ids).includes(c.id) ? ' on' : '')}
                  aria-pressed=${arr(tf.client_ids).includes(c.id) ? 'true' : 'false'} onClick=${() => toggleIn('client_ids', c.id)}>${c.name}</button>`)}
              </div>
              ${tags.length > 0 && h`<div>
                <div class="cg-sec" style=${{ padding: '8px 0 2px' }}>Tags</div>
                <div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 100, overflow: 'auto' }}>
                  ${tags.map(g => h`<button key=${g.id} type="button" class=${'cg-chip' + (arr(tf.tag_ids).includes(g.id) ? ' on' : '')}
                    aria-pressed=${arr(tf.tag_ids).includes(g.id) ? 'true' : 'false'} onClick=${() => toggleIn('tag_ids', g.id)}>${g.name}</button>`)}
                </div>
              </div>`}
              <label class="cg-chip" style=${{ marginTop: 10, cursor: 'pointer', height: 28 }}>
                <input type="checkbox" checked=${!!tf.top_level} onChange=${(e) => setTf({ top_level: e.target.checked })}/>
                Ignore subtasks
              </label>
            </div>`}
          </div>
          <div class="cg-modal-ft">
            <button class="cg-btn" onClick=${onClose}>Cancel</button>
            <button class="cg-btn pri" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : (t.id ? 'Save target' : 'Add target')}</button>
          </div>
        </div>
      </div>`;
    }

    function LogDialog({ target, onClose, onSaved, showToast }) {
      const [value, setValue] = useState(target.kind === 'boolean' ? (Number(target.current_value) >= 1 ? '1' : '0') : String(target.current_value != null ? target.current_value : ''));
      const [note, setNote] = useState('');
      const [busy, setBusy] = useState(false);
      const save = async () => {
        setBusy(true);
        try {
          const g = await GoalAPI.log(target.id, value === '' ? null : Number(value), note.trim() || null);
          onSaved(g); onClose(); toast(showToast, 'Progress updated');
        } catch (e) { toast(showToast, errMsg(e)); }
        setBusy(false);
      };
      return h`<div class="cg-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="cg-modal" style=${{ width: 'min(460px,100%)' }} role="dialog" aria-modal="true" aria-label="Update progress">
          <div class="cg-modal-hd">Update “${target.name}”<button class="cg-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button></div>
          <div class="cg-modal-bd">
            ${target.kind === 'boolean'
              ? h`<div role="radiogroup" aria-label="Status">
                  <label class="cg-chip" style=${{ marginRight: 8, height: 30 }}><input type="radio" name="cg-bool" checked=${value === '1'} onChange=${() => setValue('1')}/>Done</label>
                  <label class="cg-chip" style=${{ height: 30 }}><input type="radio" name="cg-bool" checked=${value !== '1'} onChange=${() => setValue('0')}/>Not yet</label>
                </div>`
              : h`<div>
                  <label class="cg-lab" style=${{ marginTop: 0 }} for="cg-log-v">New value${target.unit ? ' (' + target.unit + ')' : ''}</label>
                  <input id="cg-log-v" class="cg-input" type="number" autoFocus value=${value} onInput=${(e) => setValue(e.target.value)}/>
                  <div class="cg-meta">Target: ${target.kind === 'currency' ? inr(target.target_value) : numFmt(target.target_value)}</div>
                </div>`}
            <label class="cg-lab" for="cg-log-n">Note (optional)</label>
            <textarea id="cg-log-n" class="cg-ta" value=${note} placeholder="What moved?" onInput=${(e) => setNote(e.target.value)}></textarea>
          </div>
          <div class="cg-modal-ft">
            <button class="cg-btn" onClick=${onClose}>Cancel</button>
            <button class="cg-btn pri" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Save update'}</button>
          </div>
        </div>
      </div>`;
    }

    function GoalDialog({ goal, folders, clients, team, onClose, onSaved, showToast }) {
      const store = useTaskStore();
      const g = goal || {};
      const members = arr(store.members).length ? arr(store.members) : arr(team);
      const [d, setD] = useState(() => ({
        name: g.name || '', description: g.description || '', color: g.color || '#7b68ee',
        folder_id: g.folder_id || '', client_id: g.client_id || '',
        start_date: g.start_date || '', due_date: g.due_date || '',
        owner_ids: arr(g.owner_ids), is_private: !!g.is_private,
      }));
      const [busy, setBusy] = useState(false);
      const set = (p) => setD(x => ({ ...x, ...p }));
      const save = async () => {
        const name = d.name.trim();
        if (!name) { toast(showToast, 'Give the goal a name'); return; }
        setBusy(true);
        try {
          const saved = await GoalAPI.upsert({
            id: g.id || undefined, name, description: d.description.trim() || null, color: d.color,
            folder_id: d.folder_id || null, client_id: d.client_id || null,
            start_date: d.start_date || null, due_date: d.due_date || null,
            owner_ids: d.owner_ids, is_private: d.is_private,
          });
          onSaved(saved); onClose(); toast(showToast, g.id ? 'Goal saved' : 'Goal created');
        } catch (e) { toast(showToast, errMsg(e)); }
        setBusy(false);
      };
      const COLORS = ['#7b68ee', '#ff00ee', '#2a78d6', '#1baf7a', '#eda100', '#eb6834', '#e34948', '#4a3aa7'];
      return h`<div class="cg-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="cg-modal" role="dialog" aria-modal="true" aria-label=${g.id ? 'Edit goal' : 'New goal'}>
          <div class="cg-modal-hd">${g.id ? 'Edit goal' : 'New goal'}<button class="cg-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button></div>
          <div class="cg-modal-bd">
            <label class="cg-lab" style=${{ marginTop: 0 }} for="cg-g-name">Name</label>
            <input id="cg-g-name" class="cg-input" autoFocus value=${d.name} placeholder="e.g. Grow Kora Foods to 50k followers" onInput=${(e) => set({ name: e.target.value })}/>
            <label class="cg-lab" for="cg-g-desc">Description</label>
            <textarea id="cg-g-desc" class="cg-ta" value=${d.description} placeholder="Why this matters, how we’ll get there…" onInput=${(e) => set({ description: e.target.value })}></textarea>
            <div class="cg-row2">
              <div><label class="cg-lab" for="cg-g-folder">Folder</label>
                <select id="cg-g-folder" class="cg-sel" value=${d.folder_id} onChange=${(e) => set({ folder_id: e.target.value })}>
                  <option value="">No folder</option>
                  ${arr(folders).map(f => h`<option key=${f.id} value=${f.id}>${f.name}</option>`)}
                </select></div>
              <div><label class="cg-lab" for="cg-g-client">Client</label>
                <select id="cg-g-client" class="cg-sel" value=${d.client_id} onChange=${(e) => set({ client_id: e.target.value })}>
                  <option value="">Agency-wide</option>
                  ${clientList(clients).map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
                </select></div>
            </div>
            <div class="cg-row2">
              <div><label class="cg-lab" for="cg-g-start">Start date</label>
                <input id="cg-g-start" class="cg-input" type="date" value=${d.start_date || ''} onInput=${(e) => set({ start_date: e.target.value })}/></div>
              <div><label class="cg-lab" for="cg-g-due">Target date</label>
                <input id="cg-g-due" class="cg-input" type="date" value=${d.due_date || ''} onInput=${(e) => set({ due_date: e.target.value })}/></div>
            </div>
            <div class="cg-lab">Owners</div>
            ${AssigneePicker
              ? h`<${AssigneePicker} value=${d.owner_ids} onChange=${(ids) => set({ owner_ids: ids })} multi=${true} label="Goal owners"/>`
              : h`<div style=${{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 130, overflow: 'auto' }}>
                  ${members.map(m => h`<button key=${m.id} type="button" class=${'cg-chip' + (d.owner_ids.includes(m.id) ? ' on' : '')}
                    aria-pressed=${d.owner_ids.includes(m.id) ? 'true' : 'false'}
                    onClick=${() => set({ owner_ids: d.owner_ids.includes(m.id) ? d.owner_ids.filter(x => x !== m.id) : [...d.owner_ids, m.id] })}>${m.name}</button>`)}
                </div>`}
            <div class="cg-lab">Colour</div>
            <div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="radiogroup" aria-label="Goal colour">
              ${COLORS.map(c => h`<button key=${c} type="button" role="radio" aria-checked=${d.color === c ? 'true' : 'false'} aria-label=${'Colour ' + c}
                onClick=${() => set({ color: c })} style=${{ width: 24, height: 24, borderRadius: 6, background: c, border: d.color === c ? '2px solid var(--cu-t1,#1f1f23)' : '1px solid var(--cu-bd,#e8e8eb)', cursor: 'pointer' }}></button>`)}
            </div>
            <label class="cg-chip" style=${{ marginTop: 14, height: 30, cursor: 'pointer' }}>
              <input type="checkbox" checked=${d.is_private} onChange=${(e) => set({ is_private: e.target.checked })}/>
              <i class="ti ti-lock"></i>Private — only me and the owners
            </label>
          </div>
          <div class="cg-modal-ft">
            <button class="cg-btn" onClick=${onClose}>Cancel</button>
            <button class="cg-btn pri" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : (g.id ? 'Save goal' : 'Create goal')}</button>
          </div>
        </div>
      </div>`;
    }

    // =======================================================================
    // Goal detail
    // =======================================================================
    function GoalDetail({ goal, onChange, onClose, onEdit, onDelete, showToast }) {
      const [targetDlg, setTargetDlg] = useState(null);   // { target? }
      const [logDlg, setLogDlg] = useState(null);
      const [confirm, setConfirm] = useState(null);
      const g = goal;
      const meta = goalStatusMeta(g.status);
      const removeTarget = async (t) => {
        try { const next = await GoalAPI.targetDelete(t.id); onChange(next); setConfirm(null); toast(showToast, 'Target removed'); }
        catch (e) { setConfirm(null); toast(showToast, errMsg(e)); }
      };
      return h`<div>
        <div class="cg-card">
          <div style=${{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <${Ring} value=${g.progress} size=${58} stroke=${6} color=${g.color}/>
            <div style=${{ flex: 1, minWidth: 0 }}>
              <div style=${{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style=${{ font: '600 17px Inter,system-ui,sans-serif' }}>${g.name}</span>
                <span class="cg-pill" style=${{ background: meta.color + '1f', color: meta.color }}><i class=${'ti ' + meta.icon}></i>${meta.label}</span>
                ${g.is_private && h`<span class="cg-pill" style=${{ background: 'var(--cu-bg3,#efeff1)', color: 'var(--cu-t2,#5c5c66)' }}><i class="ti ti-lock"></i>Private</span>`}
                ${g.archived && h`<span class="cg-pill" style=${{ background: 'var(--cu-bg3,#efeff1)', color: 'var(--cu-t2,#5c5c66)' }}>Archived</span>`}
              </div>
              ${g.description && h`<div style=${{ marginTop: 6, color: 'var(--cu-t2,#5c5c66)', whiteSpace: 'pre-wrap' }}>${g.description}</div>`}
              <div class="cg-meta">
                ${g.client_name && h`<span><i class="ti ti-building"></i> ${g.client_name}</span>`}
                ${g.folder_name && h`<span><i class="ti ti-folder"></i> ${g.folder_name}</span>`}
                ${g.due_date && h`<span><i class="ti ti-calendar-event"></i> ${fmtDateUser(g.due_date)}</span>`}
                ${arr(g.owners).length > 0 && h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  ${arr(g.owners).map(o => (MemberAvatar ? h`<${MemberAvatar} key=${o.id} member=${o} size=${18}/>` : h`<span key=${o.id}>${o.name}</span>`))}
                </span>`}
              </div>
            </div>
            <div style=${{ display: 'flex', gap: 4, flexShrink: 0 }}>
              ${g.can_edit && h`<button class="cg-ibtn" aria-label="Edit goal" title="Edit goal" onClick=${onEdit}><i class="ti ti-pencil"></i></button>`}
              ${g.can_delete && h`<button class="cg-ibtn" aria-label="Delete goal" title="Delete goal" onClick=${onDelete}><i class="ti ti-trash"></i></button>`}
              ${onClose && h`<button class="cg-ibtn" aria-label="Close goal" onClick=${onClose}><i class="ti ti-x"></i></button>`}
            </div>
          </div>
          <div class="cg-bar"><span style=${{ width: pct(g.progress) + '%', background: g.color || 'var(--cu-accent,#ff00ee)' }}></span></div>
        </div>

        <div class="cg-card">
          <div style=${{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style=${{ font: '600 14px Inter,system-ui,sans-serif' }}>Targets</span>
            <span class="cg-meta" style=${{ margin: 0 }}>${arr(g.targets).length}</span>
            ${g.can_edit && h`<button class="cg-btn sm" style=${{ marginLeft: 'auto' }} onClick=${() => setTargetDlg({})}><i class="ti ti-plus"></i>Add target</button>`}
          </div>
          ${arr(g.targets).length === 0
            ? h`<${Empty} icon="ti-target" title="No targets yet" sub="Add a number, an amount, a yes/no milestone, or a set of tasks to track."/>`
            : arr(g.targets).map(t => h`<div key=${t.id} class="cg-tgt">
                <${Ring} value=${t.progress} size=${34} stroke=${4} color=${g.color}/>
                <span class="nm">
                  ${t.name}
                  <div class="cg-meta" style=${{ marginTop: 2 }}>
                    <span>${targetValueText(t)}</span>
                    ${t.owner && h`<span>· ${t.owner.name}</span>`}
                    ${t.kind === 'tasks' && h`<span>· updates automatically</span>`}
                  </div>
                </span>
                ${t.kind !== 'tasks' && (g.can_edit || (t.owner && t.owner.id)) && h`<button class="cg-btn sm" onClick=${() => setLogDlg(t)}><i class="ti ti-pencil-plus"></i>Update</button>`}
                ${g.can_edit && h`<button class="cg-ibtn" aria-label=${'Edit ' + t.name} onClick=${() => setTargetDlg({ target: t })}><i class="ti ti-settings"></i></button>`}
                ${g.can_edit && h`<button class="cg-ibtn" aria-label=${'Delete ' + t.name} onClick=${() => setConfirm(t)}><i class="ti ti-trash"></i></button>`}
              </div>`)}
        </div>

        <div class="cg-card">
          <div style=${{ font: '600 14px Inter,system-ui,sans-serif', marginBottom: 6 }}>Update history</div>
          ${arr(g.updates).length === 0
            ? h`<div class="cg-meta">No manual updates yet.</div>`
            : arr(g.updates).map(u => h`<div key=${u.id} class="cg-upd">
                <i class="ti ti-arrow-up-right" style=${{ color: 'var(--cu-t3,#8e8e99)', marginTop: 2 }}></i>
                <div style=${{ flex: 1, minWidth: 0 }}>
                  <div><b>${u.member_name || 'Someone'}</b> set <b>${u.target_name}</b> to
                    <b>${u.kind === 'currency' ? inr(u.to_value) : u.kind === 'boolean' ? (Number(u.to_value) >= 1 ? 'Done' : 'Not yet') : numFmt(u.to_value) + (u.unit ? ' ' + u.unit : '')}</b>
                    ${u.from_value != null && h`<span class="cg-meta" style=${{ display: 'inline' }}> (from ${u.kind === 'currency' ? inr(u.from_value) : numFmt(u.from_value)})</span>`}
                  </div>
                  ${u.note && h`<div style=${{ color: 'var(--cu-t2,#5c5c66)', marginTop: 2, whiteSpace: 'pre-wrap' }}>${u.note}</div>`}
                </div>
                <span class="cg-meta" style=${{ margin: 0, flexShrink: 0 }}>${fmtRelative(u.created_at)}</span>
              </div>`)}
        </div>

        ${targetDlg && h`<${TargetDialog} goal=${g} target=${targetDlg.target} showToast=${showToast}
          onClose=${() => setTargetDlg(null)} onSaved=${onChange}/>`}
        ${logDlg && h`<${LogDialog} target=${logDlg} showToast=${showToast} onClose=${() => setLogDlg(null)} onSaved=${onChange}/>`}
        ${confirm && (ConfirmDialog
          ? h`<${ConfirmDialog} open=${true} title=${'Delete “' + confirm.name + '”?'} body="The target and its update history are removed."
              confirmLabel="Delete" danger=${true} onConfirm=${() => removeTarget(confirm)} onCancel=${() => setConfirm(null)}/>`
          : h`<div class="cg-modal-bg"><div class="cg-modal" style=${{ width: 'min(400px,100%)' }}>
              <div class="cg-modal-hd">Delete “${confirm.name}”?</div>
              <div class="cg-modal-bd">The target and its update history are removed.</div>
              <div class="cg-modal-ft"><button class="cg-btn" onClick=${() => setConfirm(null)}>Cancel</button>
                <button class="cg-btn pri" style=${{ background: '#d03b3b', borderColor: '#d03b3b' }} onClick=${() => removeTarget(confirm)}>Delete</button></div>
            </div></div>`)}
      </div>`;
    }

    // =======================================================================
    // Goals page
    // =======================================================================
    function GoalsPage({ currentUser, clients, team, onNavigate, showToast, params }) {
      const store = useTaskStore();
      const role = currentUser && currentUser.role_level;
      const [data, setData] = useState(null);
      const [err, setErr] = useState(null);
      const [missing, setMissing] = useState(false);
      const [folder, setFolder] = useState('all');
      const [showArchived, setShowArchived] = useState(false);
      const [q, setQ] = useState('');
      const [openId, setOpenId] = useState((params && params[0]) || null);
      const [detail, setDetail] = useState(null);
      const [detailErr, setDetailErr] = useState(null);
      const [goalDlg, setGoalDlg] = useState(null);       // { goal? }
      const [folderDlg, setFolderDlg] = useState(null);   // { folder? }
      const [confirm, setConfirm] = useState(null);

      const load = useCallback(async (incl) => {
        try { const d = await GoalAPI.overview(incl); setData(d || { goals: [], folders: [] }); setErr(null); setMissing(false); }
        catch (e) { if (isMissingRpc(e)) { setMissing(true); setData({ goals: [], folders: [] }); } else { setErr(e); setData({ goals: [], folders: [] }); } }
      }, []);
      useEffect(() => { load(showArchived); }, [load, showArchived]);

      const openGoal = useCallback(async (id, { push = true } = {}) => {
        setOpenId(id); setDetailErr(null);
        if (!id) { setDetail(null); if (push) { try { if (location.hash !== '#/goals') location.hash = '#/goals'; } catch (_) {} } return; }
        try {
          const g = await GoalAPI.get(id);
          setDetail(g);
          if (push) { try { const want = '#/goals/' + id; if (location.hash !== want) location.hash = want; } catch (_) {} }
        } catch (e) { setDetail(null); setDetailErr(e); }
      }, []);
      useEffect(() => {
        const p = (params && params[0]) || null;
        if (p && p !== (detail && detail.id)) openGoal(p, { push: false });
        if (!p && detail) { setDetail(null); setOpenId(null); }
      }, [(params && params[0]) || '']);

      const goals = arr(data && data.goals);
      const folders = arr(data && data.folders);
      const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return goals.filter(g => (folder === 'all' || (folder === 'none' ? !g.folder_id : g.folder_id === folder))
            && (!s || String(g.name || '').toLowerCase().includes(s) || String(g.client_name || '').toLowerCase().includes(s)))
          .sort((a, b) => (a.archived - b.archived) || (Number(a.progress) - Number(b.progress)) || String(a.name).localeCompare(String(b.name)));
      }, [goals, folder, q]);

      const afterChange = (g) => {
        setDetail(g);
        setData(d => ({ ...(d || {}), goals: arr(d && d.goals).map(x => (x.id === g.id ? { ...x, ...g } : x)) }));
        load(showArchived);
      };
      const createdGoal = (g) => { load(showArchived); setDetail(g); setOpenId(g.id); try { location.hash = '#/goals/' + g.id; } catch (_) {} };
      const removeGoal = async (g) => {
        try { await GoalAPI.remove(g.id); setConfirm(null); setDetail(null); setOpenId(null); try { location.hash = '#/goals'; } catch (_) {} load(showArchived); toast(showToast, 'Goal deleted'); }
        catch (e) { setConfirm(null); toast(showToast, errMsg(e)); }
      };
      const archive = async (g, on) => {
        try { const saved = await GoalAPI.upsert({ id: g.id, archived: on }); afterChange(saved); toast(showToast, on ? 'Goal archived' : 'Goal restored'); }
        catch (e) { toast(showToast, errMsg(e)); }
      };
      const saveFolder = async (payload) => {
        try { await GoalAPI.folderUpsert(payload); setFolderDlg(null); load(showArchived); toast(showToast, 'Folder saved'); }
        catch (e) { toast(showToast, errMsg(e)); }
      };
      const deleteFolder = async (f) => {
        try { await GoalAPI.folderDelete(f.id); setConfirm(null); if (folder === f.id) setFolder('all'); load(showArchived); toast(showToast, 'Folder deleted — its goals were kept'); }
        catch (e) { setConfirm(null); toast(showToast, errMsg(e)); }
      };

      const header = h`<div class="cg-hd">
        <div class="cg-title">
          ${detail ? h`<button class="cg-ibtn" aria-label="All goals" onClick=${() => openGoal(null)}><i class="ti ti-chevron-left"></i></button>` : null}
          <i class="ti ti-target-arrow" style=${{ color: 'var(--cu-accent-ink,#a8009c)' }}></i>
          <span>${detail ? 'Goal' : 'Goals'}</span>
        </div>
        <div class="cg-tools">
          ${!detail && h`<input class="cg-input" style=${{ width: 190 }} placeholder="Search goals" aria-label="Search goals" value=${q} onInput=${(e) => setQ(e.target.value)}/>`}
          ${!detail && h`<button class=${'cg-chip' + (showArchived ? ' on' : '')} aria-pressed=${showArchived ? 'true' : 'false'} onClick=${() => setShowArchived(v => !v)}>
            <i class="ti ti-archive"></i>Archived</button>`}
          <button class="cg-btn" onClick=${() => load(showArchived)}><i class="ti ti-refresh"></i>Refresh</button>
          <button class="cg-btn pri" onClick=${() => setGoalDlg({})}><i class="ti ti-plus"></i>New goal</button>
        </div>
      </div>`;

      const side = h`<aside class="cg-side">
        <button class=${'cg-fold' + (folder === 'all' ? ' on' : '')} onClick=${() => setFolder('all')}>
          <i class="ti ti-target-arrow"></i><span class="nm">All goals</span><span class="n">${goals.filter(g => !g.archived).length}</span></button>
        <button class=${'cg-fold' + (folder === 'none' ? ' on' : '')} onClick=${() => setFolder('none')}>
          <i class="ti ti-inbox"></i><span class="nm">No folder</span><span class="n">${goals.filter(g => !g.folder_id && !g.archived).length}</span></button>
        <div class="cg-sec" style=${{ display: 'flex', alignItems: 'center' }}>Folders
          <button class="cg-ibtn" style=${{ marginLeft: 'auto' }} aria-label="New folder" title="New folder" onClick=${() => setFolderDlg({})}><i class="ti ti-folder-plus"></i></button>
        </div>
        ${folders.length === 0 ? h`<div class="cg-meta" style=${{ padding: '2px 8px' }}>No folders yet</div>`
          : folders.map(f => h`<div key=${f.id} style=${{ display: 'flex', alignItems: 'center' }}>
              <button class=${'cg-fold' + (folder === f.id ? ' on' : '')} onClick=${() => setFolder(f.id)}>
                <i class="ti ti-folder" style=${{ color: f.color }}></i>
                <span class="nm">${f.name}${f.is_private ? ' 🔒' : ''}</span>
                <span class="n">${f.goal_count || 0}${f.progress != null ? ' · ' + pct(f.progress) + '%' : ''}</span>
              </button>
              ${f.can_edit && h`<button class="cg-ibtn" aria-label=${'Folder options for ' + f.name} onClick=${() => setFolderDlg({ folder: f })}><i class="ti ti-dots"></i></button>`}
            </div>`)}
      </aside>`;

      const goalRow = (g) => h`<div key=${g.id} class="cg-card cg-goal" role="button" tabIndex="0"
          onClick=${() => openGoal(g.id)} onKeyDown=${(e) => { if (e.key === 'Enter') openGoal(g.id); }}>
        <${Ring} value=${g.progress} color=${g.color}/>
        <div style=${{ flex: 1, minWidth: 0 }}>
          <div class="nm">
            <span class="t">${g.name}</span>
            ${g.is_private && h`<i class="ti ti-lock" style=${{ fontSize: 13, color: 'var(--cu-t3,#8e8e99)' }} title="Private"></i>`}
            ${g.archived && h`<span class="cg-pill" style=${{ background: 'var(--cu-bg3,#efeff1)', color: 'var(--cu-t2,#5c5c66)' }}>Archived</span>`}
          </div>
          <div class="cg-meta">
            ${(() => { const m = goalStatusMeta(g.status);
              return h`<span class="cg-pill" style=${{ background: m.color + '1f', color: m.color }}><i class=${'ti ' + m.icon}></i>${m.label}</span>`; })()}
            ${g.client_name && h`<span>${g.client_name}</span>`}
            ${g.folder_name && h`<span>· ${g.folder_name}</span>`}
            <span>· ${g.target_count || 0} target${(g.target_count || 0) === 1 ? '' : 's'}</span>
            ${g.due_date && h`<span>· due ${fmtDateUser(g.due_date)}</span>`}
            ${arr(g.owners).slice(0, 3).map(o => (MemberAvatar ? h`<${MemberAvatar} key=${o.id} member=${o} size=${18}/>` : h`<span key=${o.id}>· ${o.name}</span>`))}
          </div>
          <div class="cg-bar"><span style=${{ width: pct(g.progress) + '%', background: g.color || 'var(--cu-accent,#ff00ee)' }}></span></div>
        </div>
        <div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }} onClick=${(e) => e.stopPropagation()}>
          <span style=${{ font: '600 15px Inter,system-ui,sans-serif', fontVariantNumeric: 'tabular-nums' }}>${pct(g.progress)}%</span>
          ${g.can_edit && h`<button class="cg-btn sm" onClick=${() => archive(g, !g.archived)}>
            <i class=${'ti ' + (g.archived ? 'ti-archive-off' : 'ti-archive')}></i>${g.archived ? 'Restore' : 'Archive'}</button>`}
        </div>
      </div>`;

      return h`<div class="cg-page">
        ${header}
        <div class="cg-body">
          ${!detail && side}
          <div class="cg-main">
            ${missing ? h`<div class="cg-empty" style=${{ padding: '56px 16px' }}>
                <i class="ti ti-database-off"></i><div class="t" style=${{ fontSize: 15 }}>Goals aren’t switched on yet</div>
                <div style=${{ fontSize: 12.5, maxWidth: 360 }}>Apply migration 096 (dashboards, goals and teams) in Supabase and reload — folders, targets and rollups start working immediately.</div>
              </div>`
            : err ? h`<div class="cg-empty" role="alert"><i class="ti ti-alert-triangle" style=${{ color: '#d03b3b' }}></i>
                <div class="t">Couldn’t load goals</div><div style=${{ fontSize: 12 }}>${errMsg(err)}</div>
                <button class="cg-btn sm" onClick=${() => load(showArchived)}>Retry</button></div>`
            : detailErr ? h`<div class="cg-empty" role="alert"><i class="ti ti-alert-triangle" style=${{ color: '#d03b3b' }}></i>
                <div class="t">Couldn’t open that goal</div><div style=${{ fontSize: 12 }}>${errMsg(detailErr)}</div>
                <button class="cg-btn sm" onClick=${() => openGoal(null)}>Back to goals</button></div>`
            : openId && !detail ? h`<${Loading} rows=${6}/>`
            : detail ? h`<${GoalDetail} goal=${detail} showToast=${showToast} onChange=${afterChange}
                onClose=${() => openGoal(null)} onEdit=${() => setGoalDlg({ goal: detail })} onDelete=${() => setConfirm({ kind: 'goal', item: detail })}/>`
            : data === null ? h`<${Loading} rows=${5}/>`
            : shown.length === 0 ? h`<div class="cg-empty" style=${{ padding: '46px 16px' }}>
                <i class="ti ti-target-arrow"></i><div class="t" style=${{ fontSize: 15 }}>${q ? 'No goals match' : 'No goals yet'}</div>
                <div style=${{ fontSize: 12.5, maxWidth: 340 }}>Track the outcomes behind the work — followers, revenue, launches, or a share of tasks completed.</div>
                <button class="cg-btn pri" style=${{ marginTop: 8 }} onClick=${() => setGoalDlg({})}><i class="ti ti-plus"></i>New goal</button>
              </div>`
            : shown.map(goalRow)}
          </div>
        </div>

        ${goalDlg && h`<${GoalDialog} goal=${goalDlg.goal} folders=${folders} clients=${arr(store.clients).length ? store.clients : clients}
          team=${team} showToast=${showToast} onClose=${() => setGoalDlg(null)}
          onSaved=${(g) => (goalDlg.goal ? afterChange(g) : createdGoal(g))}/>`}

        ${folderDlg && h`<${FolderDialog} folder=${folderDlg.folder} onClose=${() => setFolderDlg(null)} onSave=${saveFolder}
          onDelete=${(f) => setConfirm({ kind: 'folder', item: f })} canDelete=${!!(folderDlg.folder && folderDlg.folder.can_edit)}/>`}

        ${confirm && (ConfirmDialog
          ? h`<${ConfirmDialog} open=${true}
              title=${confirm.kind === 'goal' ? 'Delete “' + confirm.item.name + '”?' : 'Delete folder “' + confirm.item.name + '”?'}
              body=${confirm.kind === 'goal' ? 'The goal, its targets and its update history are removed for everyone.' : 'The goals inside it are kept and moved out of the folder.'}
              confirmLabel="Delete" danger=${true}
              onConfirm=${() => (confirm.kind === 'goal' ? removeGoal(confirm.item) : deleteFolder(confirm.item))}
              onCancel=${() => setConfirm(null)}/>`
          : h`<div class="cg-modal-bg"><div class="cg-modal" style=${{ width: 'min(420px,100%)' }}>
              <div class="cg-modal-hd">Delete “${confirm.item.name}”?</div>
              <div class="cg-modal-bd">${confirm.kind === 'goal' ? 'The goal, its targets and its update history are removed.' : 'The goals inside it are kept.'}</div>
              <div class="cg-modal-ft"><button class="cg-btn" onClick=${() => setConfirm(null)}>Cancel</button>
                <button class="cg-btn pri" style=${{ background: '#d03b3b', borderColor: '#d03b3b' }}
                  onClick=${() => (confirm.kind === 'goal' ? removeGoal(confirm.item) : deleteFolder(confirm.item))}>Delete</button></div>
            </div></div>`)}
      </div>`;
    }

    function FolderDialog({ folder, onClose, onSave, onDelete, canDelete }) {
      const f = folder || {};
      const [name, setName] = useState(f.name || '');
      const [color, setColor] = useState(f.color || '#7b68ee');
      const [priv, setPriv] = useState(!!f.is_private);
      const COLORS = ['#7b68ee', '#ff00ee', '#2a78d6', '#1baf7a', '#eda100', '#eb6834', '#e34948'];
      return h`<div class="cg-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="cg-modal" style=${{ width: 'min(440px,100%)' }} role="dialog" aria-modal="true" aria-label=${f.id ? 'Edit folder' : 'New folder'}>
          <div class="cg-modal-hd">${f.id ? 'Edit folder' : 'New folder'}<button class="cg-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button></div>
          <div class="cg-modal-bd">
            <label class="cg-lab" style=${{ marginTop: 0 }} for="cg-f-name">Name</label>
            <input id="cg-f-name" class="cg-input" autoFocus value=${name} placeholder="e.g. Q4 growth" onInput=${(e) => setName(e.target.value)}/>
            <div class="cg-lab">Colour</div>
            <div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="radiogroup" aria-label="Folder colour">
              ${COLORS.map(c => h`<button key=${c} type="button" role="radio" aria-checked=${color === c ? 'true' : 'false'} aria-label=${'Colour ' + c}
                onClick=${() => setColor(c)} style=${{ width: 24, height: 24, borderRadius: 6, background: c, border: color === c ? '2px solid var(--cu-t1,#1f1f23)' : '1px solid var(--cu-bd,#e8e8eb)', cursor: 'pointer' }}></button>`)}
            </div>
            <label class="cg-chip" style=${{ marginTop: 14, height: 30, cursor: 'pointer' }}>
              <input type="checkbox" checked=${priv} onChange=${(e) => setPriv(e.target.checked)}/><i class="ti ti-lock"></i>Private folder
            </label>
          </div>
          <div class="cg-modal-ft">
            ${f.id && canDelete && h`<button class="cg-btn" style=${{ marginRight: 'auto', color: '#d03b3b' }} onClick=${() => onDelete(f)}><i class="ti ti-trash"></i>Delete</button>`}
            <button class="cg-btn" onClick=${onClose}>Cancel</button>
            <button class="cg-btn pri" disabled=${!name.trim()} onClick=${() => onSave({ id: f.id || undefined, name: name.trim(), color, is_private: priv })}>Save</button>
          </div>
        </div>
      </div>`;
    }

    // =======================================================================
    // Goals progress card (Home + dashboards)
    // =======================================================================
    function GoalsProgressCard({ ctl, card, onNavigate, showToast }) {
      const ctxV = React.useContext(DashCtx);
      const tick = (ctxV && ctxV.tick) || 0;
      const [rows, setRows] = useState(null);
      const [missing, setMissing] = useState(false);
      const [err, setErr] = useState(null);
      const load = useCallback(async () => {
        try { setRows(arr(await GoalAPI.progress(null, 10))); setErr(null); setMissing(false); }
        catch (e) { if (isMissingRpc(e)) { setMissing(true); setRows([]); } else { setErr(e); setRows([]); } }
      }, []);
      useEffect(() => { load(); }, [load]);
      useEffect(() => { if (tick) load(); }, [tick]);
      const open = (g) => { try { location.hash = '#/goals/' + g.id; } catch (_) {} if (onNavigate) onNavigate('goals', { params: [g.id] }); };
      const avg = rows && rows.length ? rows.reduce((a, g) => a + (Number(g.progress) || 0), 0) / rows.length : 0;
      const body = missing
        ? h`<div class="cg-empty"><i class="ti ti-database-off"></i><div class="t">Goals aren’t switched on yet</div>
            <div style=${{ fontSize: 12 }}>Apply migration 096 to start tracking targets.</div></div>`
        : err ? h`<div class="cg-empty" role="alert"><i class="ti ti-alert-triangle" style=${{ color: '#d03b3b' }}></i>
            <div class="t">Couldn’t load goals</div><button class="cg-btn sm" onClick=${load}>Retry</button></div>`
        : rows === null ? h`<${Loading} rows=${3}/>`
        : rows.length === 0 ? h`<${Empty} icon="ti-target-arrow" title="No goals yet" sub="Set a target and track it here."
            action=${h`<button class="cg-btn sm" style=${{ marginTop: 6 }} onClick=${() => { try { location.hash = '#/goals'; } catch (_) {} if (onNavigate) onNavigate('goals'); }}>Open Goals</button>`}/>`
        : h`<div>${rows.map(g => { const m = goalStatusMeta(g.status);
            return h`<div key=${g.id} class="cg-tgt" style=${{ borderTop: 0, cursor: 'pointer' }} role="button" tabIndex="0"
                onClick=${() => open(g)} onKeyDown=${(e) => { if (e.key === 'Enter') open(g); }}>
              <${Ring} value=${g.progress} size=${32} stroke=${4} color=${g.color}/>
              <span class="nm">${g.name}
                <div class="cg-meta" style=${{ marginTop: 2 }}>
                  <span class="cg-pill" style=${{ background: m.color + '1f', color: m.color }}>${m.label}</span>
                  ${g.client_name && h`<span>${g.client_name}</span>`}
                  ${g.due_date && h`<span>· ${fmtDateUser(g.due_date)}</span>`}
                </div>
              </span>
              <span class="val">${pct(g.progress)}%</span>
            </div>`; })}</div>`;
      const title = (card && card.config && card.config.title) || 'Goals progress';
      if (CardShell) return h`<${CardShell} title=${title} icon="ti-target-arrow" count=${rows && rows.length ? pct(avg) + '% avg' : null} onRefresh=${load} ctl=${ctl}>${body}<//>`;
      return h`<section class="cg-card"><div style=${{ font: '600 15px Inter,system-ui,sans-serif', marginBottom: 6 }}>${title}</div>${body}</section>`;
    }

    // =======================================================================
    // Registrations
    // =======================================================================
    reg('pages', {
      id: 'goals', label: 'Goals', icon: 'ti-target-arrow', section: 'more', order: 62,
      apps: ['dashboard', 'tasks'], fullHeight: true,
      roles: (r) => r && r !== 'client',
      Component: GoalsPage,
    });

    reg('cards', {
      type: 'goals_progress', name: 'Goals progress', icon: 'ti-target-arrow', category: 'Analytics', w: 1,
      desc: 'Every goal you can see, with its rollup and status.', roles: (r) => r !== 'client',
      Component: GoalsProgressCard,
    });

    reg('createItems', {
      key: 'goal', label: 'Goal', icon: 'ti-target-arrow', order: 74,
      roles: (r) => r && r !== 'client',
      run: ({ onNavigate }) => { try { location.hash = '#/goals'; } catch (_) {} if (onNavigate) onNavigate('goals'); },
    });

    let palCache = { at: 0, rows: [] };
    reg('paletteProviders', {
      id: 'goals', label: 'Goals', icon: 'ti-target-arrow',
      roles: (r) => r && r !== 'client',
      search: async (q) => {
        const now = Date.now();
        if (now - palCache.at > 120000) {
          try { const d = await GoalAPI.overview(false); palCache = { at: now, rows: arr(d && d.goals) }; }
          catch (_) { palCache = { at: now, rows: [] }; }
        }
        const s = String(q || '').trim().toLowerCase();
        return palCache.rows
          .filter(g => !s || String(g.name || '').toLowerCase().includes(s) || String(g.client_name || '').toLowerCase().includes(s))
          .slice(0, 20)
          .map(g => ({
            id: g.id, label: g.name, icon: 'ti-target-arrow',
            sub: pct(g.progress) + '% · ' + goalStatusMeta(g.status).label + (g.client_name ? ' · ' + g.client_name : ''),
            run: () => { try { location.hash = '#/goals/' + g.id; } catch (_) {} },
          }));
      },
    });

    return { GoalsPage, GoalDetail, GoalsProgressCard, GoalAPI, goalStatusMeta, Ring };
  }

  window.AMS_GOALS = { buildGoals };
})();

/* ============================================================================
 * teams.js — Teams hub: teams, people, org chart, team analytics (parity v2, F)
 *
 *   window.AMS_TEAMS.buildTeams(deps) →
 *     { TeamsPage, TeamAPI, TeamTasksCard, TaskTeamsSection, OrgChart }
 *
 * Teams (name, colour, lead, parent, members) · All people (role, capacity,
 * job title, manager, teams, live workload) · Org chart (reports-to, falling
 * back to the lead of the person's first team) · Team analytics (open,
 * overdue, completed trend, per member) · assign a task to a team, so team
 * members see it in "My work" through the `team_tasks` RPC.
 *
 * Server: migrations/096_dashboards_goals_teams.sql.
 * Contract: docs/clickup-parity-v2-contract.md §4 F. Notes: docs/parity-v2/notes-F.md
 * Fail-open: without 096 every RPC 404s — the page explains itself, the task
 * panel section hides, and the card stays quiet. Nothing throws.
 * ==========================================================================*/
(function () {
  function buildTeams(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo, rpcCall } = deps;
    const Fragment = React.Fragment;

    const Av = deps.Av;
    const CardShell = deps.CardShell;
    const Popover = deps.Popover;
    const MemberAvatar = deps.MemberAvatar;
    const EmptyState = deps.EmptyState;
    const ConfirmDialog = deps.ConfirmDialog;
    const useTaskStore = deps.useTaskStore || (() => ({}));
    const openTask = deps.openTask || ((id) => window.dispatchEvent(new CustomEvent('ams-open-task', { detail: { id } })));
    const fmtMinutes = deps.fmtMinutes || ((n) => (n >= 60 ? Math.floor(n / 60) + 'h' : (n || 0) + 'm'));
    const fmtDateUser = deps.fmtDateUser || ((iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''));
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
    if (!document.getElementById('ams-teams-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-teams-styles';
      st.textContent = `
      .ct-page{display:flex;flex-direction:column;min-height:0;flex:1;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px}
      .ct-page *,.ct-modal *{box-sizing:border-box}
      .ct-page :focus-visible,.ct-modal :focus-visible{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:1px}
      .ct-hd{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 20px 0}
      .ct-title{font:600 18px Inter,system-ui,sans-serif;display:flex;align-items:center;gap:8px}
      .ct-tools{display:flex;gap:6px;align-items:center;margin-left:auto;flex-wrap:wrap}
      .ct-tabs{display:flex;gap:18px;border-bottom:1px solid var(--cu-bd,#e8e8eb);padding:0 20px;margin-top:10px;overflow-x:auto;scrollbar-width:none}
      .ct-tab{background:none;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;padding:9px 0;font:500 13px Inter,system-ui,sans-serif;color:var(--cu-t2,#5c5c66);cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
      .ct-tab:hover{color:var(--cu-t1,#1f1f23)}
      .ct-tab.on{color:var(--cu-t1,#1f1f23);font-weight:600;border-bottom-color:var(--cu-accent,#ff00ee)}
      .ct-main{flex:1;min-height:0;overflow:auto;padding:16px 20px 30px}
      @media(max-width:820px){.ct-hd{padding:12px 12px 0}.ct-tabs{padding:0 12px}.ct-main{padding:12px}}
      .ct-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:var(--cu-radius-sm,6px);border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:600 13px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
      .ct-btn:hover{background:var(--cu-bg3,#efeff1)}
      .ct-btn:disabled{opacity:.5;cursor:not-allowed}
      .ct-btn.pri{background:var(--cu-accent,#ff00ee);border-color:var(--cu-accent,#ff00ee);color:#fff}
      .ct-btn.pri:hover{filter:brightness(.94)}
      .ct-btn.sm{height:26px;padding:0 8px;font-size:12px}
      .ct-ibtn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--cu-radius-sm,6px);border:0;background:transparent;color:var(--cu-t2,#5c5c66);cursor:pointer;font-size:15px}
      .ct-ibtn:hover{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23)}
      .ct-chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:12px;border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t2,#5c5c66);font:500 12px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
      .ct-chip.on{border-color:var(--cu-accent,#ff00ee);background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c)}
      .ct-chip.static{cursor:default}
      .ct-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
      .ct-card{background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px);padding:12px 14px;min-width:0}
      .ct-card .hd{display:flex;align-items:center;gap:8px;min-width:0}
      .ct-card .hd .nm{font:600 14px Inter,system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .ct-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0}
      .ct-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:var(--cu-t3,#8e8e99);margin-top:6px}
      .ct-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:10px}
      .ct-stat{background:var(--cu-bg2,#f7f7f8);border-radius:var(--cu-radius-sm,6px);padding:6px 8px;min-width:0}
      .ct-stat .v{font:600 16px Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums}
      .ct-stat .l{font-size:11px;color:var(--cu-t3,#8e8e99);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ct-avs{display:flex;align-items:center;gap:-6px}
      .ct-tblwrap{overflow-x:auto;border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius,8px)}
      .ct-tbl{width:100%;border-collapse:collapse;font-size:13px;min-width:640px}
      .ct-tbl th,.ct-tbl td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--cu-bd,#e8e8eb);white-space:nowrap}
      .ct-tbl th{font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3,#8e8e99);background:var(--cu-bg2,#f7f7f8);position:sticky;top:0;z-index:1}
      .ct-tbl tr:last-child td{border-bottom:0}
      .ct-tbl td.num,.ct-tbl th.num{text-align:right;font-variant-numeric:tabular-nums}
      .ct-tbl tbody tr:hover{background:var(--cu-bg2,#f7f7f8)}
      .ct-person{display:flex;align-items:center;gap:8px;min-width:0}
      .ct-org{display:flex;flex-direction:column;gap:6px}
      .ct-node{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius-sm,6px);background:var(--cu-bg,#fff);min-width:0}
      .ct-kids{margin-left:18px;padding-left:12px;border-left:1px solid var(--cu-bd,#e8e8eb);display:flex;flex-direction:column;gap:6px;margin-top:6px}
      .ct-bar{height:8px;border-radius:4px;background:var(--cu-bg3,#efeff1);overflow:hidden;min-width:60px;flex:1}
      .ct-bar>span{display:block;height:100%}
      .ct-spark{display:flex;align-items:flex-end;gap:2px;height:34px}
      .ct-spark span{flex:1;background:var(--cu-accent-fog,rgba(255,0,238,.28));border-radius:2px 2px 0 0;min-height:2px}
      .ct-input,.ct-sel,.ct-ta{width:100%;height:32px;border:1px solid var(--cu-bd2,#d6d6db);border-radius:var(--cu-radius-sm,6px);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);padding:0 9px;font:13px Inter,system-ui,sans-serif}
      .ct-ta{height:auto;min-height:56px;padding:8px 9px;resize:vertical}
      .ct-input:focus,.ct-sel:focus,.ct-ta:focus{border-color:var(--cu-accent,#ff00ee);outline:none}
      .ct-lab{display:block;font:600 11px Inter,system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3,#8e8e99);margin:12px 0 5px}
      .ct-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media(max-width:520px){.ct-row2{grid-template-columns:1fr}.ct-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .ct-modal-bg{position:fixed;inset:0;background:rgba(10,10,14,.45);z-index:430;display:flex;align-items:center;justify-content:center;padding:16px}
      .ct-modal{background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);border-radius:var(--cu-radius,8px);box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14));width:min(560px,100%);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;font:13px Inter,system-ui,sans-serif}
      .ct-modal-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid var(--cu-bd,#e8e8eb);font:600 16px Inter,system-ui,sans-serif}
      .ct-modal-bd{padding:12px 16px;overflow:auto}
      .ct-modal-ft{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--cu-bd,#e8e8eb)}
      .ct-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:30px 14px;color:var(--cu-t3,#8e8e99)}
      .ct-empty i{font-size:26px;opacity:.7}
      .ct-empty .t{font-size:13.5px;font-weight:600;color:var(--cu-t2,#5c5c66)}
      .ct-sk{height:28px;border-radius:6px;margin:6px;background:linear-gradient(90deg,var(--cu-bg2,#f7f7f8),var(--cu-bg3,#efeff1),var(--cu-bg2,#f7f7f8));background-size:200% 100%;animation:ctsk 1.2s infinite}
      @keyframes ctsk{0%{background-position:200% 0}100%{background-position:-200% 0}}
      .ct-pick{max-height:220px;overflow:auto;border:1px solid var(--cu-bd,#e8e8eb);border-radius:var(--cu-radius-sm,6px);padding:4px}
      .ct-pick label{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:var(--cu-radius-sm,6px);cursor:pointer}
      .ct-pick label:hover{background:var(--cu-bg3,#efeff1)}
      .ct-pick input{accent-color:var(--cu-accent,#ff00ee)}
      @media(prefers-reduced-motion:reduce){.ct-page *,.ct-modal *{transition:none!important;animation:none!important}}
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
      if (/not_found/.test(m)) return 'That team no longer exists';
      if (/bad_parent/.test(m)) return 'A team can’t sit inside itself';
      if (/bad_manager/.test(m)) return 'That would create a reporting loop';
      if (/bad_lead/.test(m)) return 'Pick a teammate from this workspace';
      if (/bad_name/.test(m)) return 'Give the team a name first';
      if (/bad_hours/.test(m)) return 'Weekly hours must be between 0 and 168';
      return m;
    };
    const toast = (fn, msg) => { try { fn ? fn(msg) : console.info('[teams]', msg); } catch (_) {} };
    const COLORS = ['#7b68ee', '#ff00ee', '#2a78d6', '#1baf7a', '#eda100', '#eb6834', '#e34948', '#4a3aa7'];

    const TeamAPI = {
      list: () => rpcCall('teams_list', {}),
      upsert: (data) => rpcCall('team_upsert', { p_data: data }),
      remove: (id) => rpcCall('team_delete', { p_id: id }),
      setMembers: (teamId, ids) => rpcCall('team_set_members', { p_team_id: teamId, p_member_ids: ids }),
      people: () => rpcCall('people_list', {}),
      profileSet: (memberId, patch) => rpcCall('member_profile_set', { p_member_id: memberId, p_patch: patch }),
      analytics: (teamId, days) => rpcCall('team_analytics', { p_team_id: teamId || null, p_days: days || 7 }),
      taskTeamSet: (taskId, teamIds) => rpcCall('task_team_set', { p_task_id: taskId, p_team_ids: teamIds }),
      taskTeamsFor: (taskIds) => rpcCall('task_teams_for', { p_task_ids: taskIds }),
      teamTasks: (filter) => rpcCall('team_tasks', { p_filter: filter || {} }),
    };

    function Loading({ rows = 4 }) {
      return h`<div aria-busy="true" aria-label="Loading">${Array.from({ length: rows }).map((_, i) => h`<div key=${i} class="ct-sk" style=${{ opacity: 1 - i * 0.18 }}></div>`)}</div>`;
    }
    function Empty({ icon = 'ti-users-group', title, sub, action }) {
      if (EmptyState) return h`<${EmptyState} icon=${icon} title=${title} sub=${sub} action=${action}/>`;
      return h`<div class="ct-empty"><i class=${'ti ' + icon}></i><div class="t">${title}</div>${sub && h`<div style=${{ fontSize: 12 }}>${sub}</div>`}${action}</div>`;
    }
    function NotReady({ what }) {
      return h`<div class="ct-empty" style=${{ padding: '56px 16px' }}>
        <i class="ti ti-database-off"></i><div class="t" style=${{ fontSize: 15 }}>${what || 'Teams aren’t switched on yet'}</div>
        <div style=${{ fontSize: 12.5, maxWidth: 360 }}>Apply migration 096 (dashboards, goals and teams) in Supabase and reload.</div>
      </div>`;
    }
    function ErrBox({ error, onRetry }) {
      return h`<div class="ct-empty" role="alert"><i class="ti ti-alert-triangle" style=${{ color: '#d03b3b' }}></i>
        <div class="t">Couldn’t load</div><div style=${{ fontSize: 12 }}>${errMsg(error)}</div>
        ${onRetry && h`<button class="ct-btn sm" onClick=${onRetry}>Retry</button>`}</div>`;
    }
    const Face = ({ m, size = 22 }) => (MemberAvatar ? h`<${MemberAvatar} member=${m} size=${size}/>`
      : Av ? h`<${Av} i=${m.initials || String(m.name || '?').slice(0, 2).toUpperCase()} c=${m.color} s=${size} round=${true}/>` : null);

    // =======================================================================
    // Team dialog
    // =======================================================================
    function TeamDialog({ team, teams, members, onClose, onSaved, showToast }) {
      const t = team || {};
      const [d, setD] = useState(() => ({
        name: t.name || '', description: t.description || '', color: t.color || '#7b68ee',
        lead_id: t.lead_id || '', parent_id: t.parent_id || '',
        member_ids: arr(t.members).map(m => m.id),
      }));
      const [busy, setBusy] = useState(false);
      const [q, setQ] = useState('');
      const set = (p) => setD(x => ({ ...x, ...p }));
      const pool = arr(members).filter(m => m && m.role_level !== 'client');
      const s = q.trim().toLowerCase();
      const shown = pool.filter(m => !s || String(m.name || '').toLowerCase().includes(s));
      const save = async () => {
        const name = d.name.trim();
        if (!name) { toast(showToast, 'Give the team a name'); return; }
        setBusy(true);
        try {
          const saved = await TeamAPI.upsert({
            id: t.id || undefined, name, description: d.description.trim() || null, color: d.color,
            lead_id: d.lead_id || null, parent_id: d.parent_id || null, member_ids: d.member_ids,
          });
          onSaved(saved); onClose(); toast(showToast, t.id ? 'Team updated' : 'Team created');
        } catch (e) { toast(showToast, errMsg(e)); }
        setBusy(false);
      };
      return h`<div class="ct-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="ct-modal" role="dialog" aria-modal="true" aria-label=${t.id ? 'Edit team' : 'New team'}>
          <div class="ct-modal-hd">${t.id ? 'Edit team' : 'New team'}<button class="ct-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button></div>
          <div class="ct-modal-bd">
            <label class="ct-lab" style=${{ marginTop: 0 }} for="ct-t-name">Name</label>
            <input id="ct-t-name" class="ct-input" autoFocus value=${d.name} placeholder="e.g. Creative" onInput=${(e) => set({ name: e.target.value })}/>
            <label class="ct-lab" for="ct-t-desc">Description</label>
            <textarea id="ct-t-desc" class="ct-ta" value=${d.description} placeholder="What this team owns" onInput=${(e) => set({ description: e.target.value })}></textarea>
            <div class="ct-row2">
              <div><label class="ct-lab" for="ct-t-lead">Team lead</label>
                <select id="ct-t-lead" class="ct-sel" value=${d.lead_id} onChange=${(e) => set({ lead_id: e.target.value })}>
                  <option value="">No lead</option>
                  ${pool.map(m => h`<option key=${m.id} value=${m.id}>${m.name}</option>`)}
                </select></div>
              <div><label class="ct-lab" for="ct-t-parent">Sits inside</label>
                <select id="ct-t-parent" class="ct-sel" value=${d.parent_id} onChange=${(e) => set({ parent_id: e.target.value })}>
                  <option value="">Top level</option>
                  ${arr(teams).filter(x => x.id !== t.id).map(x => h`<option key=${x.id} value=${x.id}>${x.name}</option>`)}
                </select></div>
            </div>
            <div class="ct-lab">Colour</div>
            <div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="radiogroup" aria-label="Team colour">
              ${COLORS.map(c => h`<button key=${c} type="button" role="radio" aria-checked=${d.color === c ? 'true' : 'false'} aria-label=${'Colour ' + c}
                onClick=${() => set({ color: c })} style=${{ width: 24, height: 24, borderRadius: 6, background: c, border: d.color === c ? '2px solid var(--cu-t1,#1f1f23)' : '1px solid var(--cu-bd,#e8e8eb)', cursor: 'pointer' }}></button>`)}
            </div>
            <label class="ct-lab" for="ct-t-search">Members (${d.member_ids.length})</label>
            <input id="ct-t-search" class="ct-input" style=${{ marginBottom: 6 }} placeholder="Search people" value=${q} onInput=${(e) => setQ(e.target.value)}/>
            <div class="ct-pick">
              ${shown.length === 0 ? h`<div class="ct-empty" style=${{ padding: 10 }}>No matches</div>`
                : shown.map(m => h`<label key=${m.id}>
                    <input type="checkbox" checked=${d.member_ids.includes(m.id)}
                      onChange=${() => set({ member_ids: d.member_ids.includes(m.id) ? d.member_ids.filter(x => x !== m.id) : [...d.member_ids, m.id] })}/>
                    <${Face} m=${m} size=${20}/>
                    <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${m.name}</span>
                    <span style=${{ fontSize: 11, color: 'var(--cu-t3,#8e8e99)' }}>${m.role_level}</span>
                  </label>`)}
            </div>
            <div class="ct-meta">The lead is always a member.</div>
          </div>
          <div class="ct-modal-ft">
            <button class="ct-btn" onClick=${onClose}>Cancel</button>
            <button class="ct-btn pri" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : (t.id ? 'Save team' : 'Create team')}</button>
          </div>
        </div>
      </div>`;
    }

    function PersonDialog({ person, people, canManage, onClose, onSaved, showToast }) {
      const p = person || {};
      const [d, setD] = useState({
        job_title: p.job_title || '', reports_to: p.reports_to || '',
        weekly_hours: p.weekly_hours != null ? String(p.weekly_hours) : '',
      });
      const [busy, setBusy] = useState(false);
      const save = async () => {
        setBusy(true);
        try {
          const patch = { job_title: d.job_title.trim() };
          if (canManage) {
            patch.reports_to = d.reports_to || null;
            patch.weekly_hours = d.weekly_hours === '' ? null : Number(d.weekly_hours);
          }
          const saved = await TeamAPI.profileSet(p.id, patch);
          onSaved(saved); onClose(); toast(showToast, 'Profile updated');
        } catch (e) { toast(showToast, errMsg(e)); }
        setBusy(false);
      };
      return h`<div class="ct-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="ct-modal" style=${{ width: 'min(460px,100%)' }} role="dialog" aria-modal="true" aria-label=${'Edit ' + (p.name || 'person')}>
          <div class="ct-modal-hd">
            <span style=${{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><${Face} m=${p} size=${24}/>${p.name}</span>
            <button class="ct-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="ct-modal-bd">
            <label class="ct-lab" style=${{ marginTop: 0 }} for="ct-p-title">Job title</label>
            <input id="ct-p-title" class="ct-input" autoFocus value=${d.job_title} placeholder="e.g. Senior video editor" onInput=${(e) => setD(x => ({ ...x, job_title: e.target.value }))}/>
            ${canManage && h`<div>
              <label class="ct-lab" for="ct-p-mgr">Reports to</label>
              <select id="ct-p-mgr" class="ct-sel" value=${d.reports_to} onChange=${(e) => setD(x => ({ ...x, reports_to: e.target.value }))}>
                <option value="">Nobody / use team lead</option>
                ${arr(people).filter(x => x.id !== p.id).map(x => h`<option key=${x.id} value=${x.id}>${x.name}</option>`)}
              </select>
              <label class="ct-lab" for="ct-p-hours">Weekly hours</label>
              <input id="ct-p-hours" class="ct-input" type="number" min="0" max="168" value=${d.weekly_hours} placeholder="40"
                onInput=${(e) => setD(x => ({ ...x, weekly_hours: e.target.value }))}/>
              <div class="ct-meta">Capacity in posts per week is set in Team settings; weekly hours is used by time reports.</div>
            </div>`}
          </div>
          <div class="ct-modal-ft">
            <button class="ct-btn" onClick=${onClose}>Cancel</button>
            <button class="ct-btn pri" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>`;
    }

    // =======================================================================
    // Org chart
    // =======================================================================
    function OrgChart({ people, onOpen }) {
      const byId = {}; arr(people).forEach(p => { byId[p.id] = p; });
      const kids = {}; const roots = [];
      arr(people).forEach(p => {
        const mgr = p.manager_id && byId[p.manager_id] && p.manager_id !== p.id ? p.manager_id : null;
        if (mgr) { (kids[mgr] = kids[mgr] || []).push(p); } else roots.push(p);
      });
      // guard against cycles the server already prevents, but be safe in the UI too
      const seen = new Set();
      const node = (p, depth) => {
        if (seen.has(p.id) || depth > 8) return null;
        seen.add(p.id);
        const children = (kids[p.id] || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return h`<div key=${p.id}>
          <div class="ct-node" role=${onOpen ? 'button' : undefined} tabIndex=${onOpen ? '0' : undefined}
              onClick=${onOpen ? () => onOpen(p) : undefined} onKeyDown=${onOpen ? (e) => { if (e.key === 'Enter') onOpen(p); } : undefined}
              style=${{ cursor: onOpen ? 'pointer' : 'default' }}>
            <${Face} m=${p} size=${24}/>
            <span style=${{ minWidth: 0, flex: 1 }}>
              <span style=${{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${p.name}</span>
              <span style=${{ fontSize: 11.5, color: 'var(--cu-t3,#8e8e99)' }}>${p.job_title || p.role_level}</span>
            </span>
            ${arr(p.teams).slice(0, 2).map(t => h`<span key=${t.id} class="ct-chip static" style=${{ borderColor: 'transparent', background: (t.color || '#7b68ee') + '1f', color: t.color || '#7b68ee' }}>${t.name}</span>`)}
            <span style=${{ fontSize: 11.5, color: 'var(--cu-t3,#8e8e99)', whiteSpace: 'nowrap' }}>${p.open || 0} open${p.overdue ? ' · ' + p.overdue + ' late' : ''}</span>
          </div>
          ${children.length > 0 && h`<div class="ct-kids">${children.map(c => node(c, depth + 1))}</div>`}
        </div>`;
      };
      if (!arr(people).length) return h`<${Empty} icon="ti-sitemap" title="Nobody to chart yet"/>`;
      const sortedRoots = roots.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return h`<div class="ct-org">${sortedRoots.map(p => node(p, 0))}
        <div class="ct-meta">Built from “reports to”, falling back to the lead of each person’s first team.</div>
      </div>`;
    }

    // =======================================================================
    // Teams page
    // =======================================================================
    function TeamsPage({ currentUser, clients, team, onNavigate, showToast, params }) {
      const store = useTaskStore();
      const role = currentUser && currentUser.role_level;
      const canManage = isPrivilegedRole(role);
      const [tab, setTab] = useState((params && params[0] === 'people') ? 'people' : (params && params[0] === 'org') ? 'org' : (params && params[0] === 'analytics') ? 'analytics' : 'teams');
      const [teams, setTeams] = useState(null);
      const [people, setPeople] = useState(null);
      const [analytics, setAnalytics] = useState(null);
      const [days, setDays] = useState(7);
      const [missing, setMissing] = useState(false);
      const [err, setErr] = useState(null);
      const [teamDlg, setTeamDlg] = useState(null);
      const [personDlg, setPersonDlg] = useState(null);
      const [confirm, setConfirm] = useState(null);
      const [q, setQ] = useState('');
      const members = arr(store.members).length ? arr(store.members) : arr(team);

      const loadTeams = useCallback(async () => {
        try { setTeams(arr(await TeamAPI.list())); setErr(null); setMissing(false); }
        catch (e) { if (isMissingRpc(e)) { setMissing(true); setTeams([]); } else { setErr(e); setTeams([]); } }
      }, []);
      const loadPeople = useCallback(async () => {
        try { setPeople(arr(await TeamAPI.people())); setMissing(false); }
        catch (e) { if (isMissingRpc(e)) { setMissing(true); setPeople([]); } else { setErr(e); setPeople([]); } }
      }, []);
      const loadAnalytics = useCallback(async (d) => {
        try { setAnalytics(arr(await TeamAPI.analytics(null, d))); setMissing(false); }
        catch (e) { if (isMissingRpc(e)) { setMissing(true); setAnalytics([]); } else { setErr(e); setAnalytics([]); } }
      }, []);
      useEffect(() => { loadTeams(); }, [loadTeams]);
      useEffect(() => { if ((tab === 'people' || tab === 'org') && people === null) loadPeople(); }, [tab, people, loadPeople]);
      useEffect(() => { if (tab === 'analytics') loadAnalytics(days); }, [tab, days, loadAnalytics]);
      useEffect(() => {
        const p = (params && params[0]) || '';
        if (['teams', 'people', 'org', 'analytics'].includes(p) && p !== tab) setTab(p);
      }, [(params && params[0]) || '']);
      const goTab = (t) => { setTab(t); try { location.hash = '#/teams/' + t; } catch (_) {} };

      const removeTeam = async (t) => {
        try { await TeamAPI.remove(t.id); setConfirm(null); loadTeams(); loadPeople(); toast(showToast, 'Team deleted'); }
        catch (e) { setConfirm(null); toast(showToast, errMsg(e)); }
      };
      const afterTeam = () => { loadTeams(); setPeople(null); if (tab === 'analytics') loadAnalytics(days); };

      const teamsShown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return arr(teams).filter(t => !s || String(t.name || '').toLowerCase().includes(s));
      }, [teams, q]);
      const peopleShown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return arr(people).filter(p => !s || String(p.name || '').toLowerCase().includes(s) || String(p.job_title || '').toLowerCase().includes(s));
      }, [people, q]);

      const teamCard = (t) => h`<div key=${t.id} class="ct-card">
        <div class="hd">
          <span class="ct-dot" style=${{ background: t.color || '#7b68ee' }}></span>
          <span class="nm">${t.name}</span>
          ${t.is_member && h`<span class="ct-chip static" style=${{ height: 20, fontSize: 11 }}>You’re in</span>`}
          <span style=${{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
            ${t.can_manage && h`<button class="ct-ibtn" aria-label=${'Edit ' + t.name} title="Edit team" onClick=${() => setTeamDlg({ team: t })}><i class="ti ti-pencil"></i></button>`}
            ${canManage && h`<button class="ct-ibtn" aria-label=${'Delete ' + t.name} title="Delete team" onClick=${() => setConfirm(t)}><i class="ti ti-trash"></i></button>`}
          </span>
        </div>
        ${t.description && h`<div style=${{ color: 'var(--cu-t2,#5c5c66)', marginTop: 6 }}>${t.description}</div>`}
        <div class="ct-meta">
          ${t.lead && h`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><${Face} m=${t.lead} size=${18}/>${t.lead.name} · lead</span>`}
          ${t.parent_id && h`<span>· inside ${(arr(teams).find(x => x.id === t.parent_id) || {}).name || 'a team'}</span>`}
        </div>
        <div style=${{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          ${arr(t.members).slice(0, 8).map(m => h`<${Face} key=${m.id} m=${m} size=${22}/>`)}
          ${arr(t.members).length > 8 && h`<span class="ct-meta" style=${{ margin: 0 }}>+${arr(t.members).length - 8}</span>`}
          ${arr(t.members).length === 0 && h`<span class="ct-meta" style=${{ margin: 0 }}>No members yet</span>`}
        </div>
        <div class="ct-stats">
          <div class="ct-stat"><div class="v">${(t.stats && t.stats.open) || 0}</div><div class="l">Open</div></div>
          <div class="ct-stat"><div class="v" style=${{ color: (t.stats && t.stats.overdue) ? '#d03b3b' : undefined }}>${(t.stats && t.stats.overdue) || 0}</div><div class="l">Overdue</div></div>
          <div class="ct-stat"><div class="v">${(t.stats && t.stats.done_week) || 0}</div><div class="l">Done 7d</div></div>
          <div class="ct-stat"><div class="v">${(t.stats && t.stats.team_tasks_open) || 0}</div><div class="l">Team tasks</div></div>
        </div>
      </div>`;

      const analyticsCard = (a) => {
        const maxTrend = Math.max(1, ...arr(a.trend).map(x => Number(x.count) || 0));
        const maxMember = Math.max(1, ...arr(a.by_member).map(m => Number(m.open) || 0));
        return h`<div key=${a.team_id} class="ct-card">
          <div class="hd"><span class="ct-dot" style=${{ background: a.color || '#7b68ee' }}></span><span class="nm">${a.name}</span>
            <span class="ct-meta" style=${{ margin: 0, marginLeft: 'auto' }}>last ${a.days} days</span></div>
          <div class="ct-stats">
            <div class="ct-stat"><div class="v">${a.open || 0}</div><div class="l">Open</div></div>
            <div class="ct-stat"><div class="v">${a.active || 0}</div><div class="l">In progress</div></div>
            <div class="ct-stat"><div class="v" style=${{ color: a.overdue ? '#d03b3b' : undefined }}>${a.overdue || 0}</div><div class="l">Overdue</div></div>
            <div class="ct-stat"><div class="v" style=${{ color: '#0ca30c' }}>${a.done || 0}</div><div class="l">Completed</div></div>
          </div>
          <div class="ct-lab">Completed per day</div>
          <div class="ct-spark" role="img" aria-label=${'Completed per day: ' + arr(a.trend).map(x => x.count).join(', ')}>
            ${arr(a.trend).map(x => h`<span key=${x.day} title=${fmtDateUser(x.day) + ': ' + x.count} style=${{ height: Math.max(2, ((Number(x.count) || 0) / maxTrend) * 34) + 'px' }}></span>`)}
          </div>
          <div class="ct-lab">By member</div>
          ${arr(a.by_member).length === 0 ? h`<div class="ct-meta">No members yet.</div>`
            : arr(a.by_member).map(m => h`<div key=${m.member_id} style=${{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                <${Face} m=${m} size=${20}/>
                <span style=${{ width: 110, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${m.name}</span>
                <span class="ct-bar"><span style=${{ width: ((Number(m.open) || 0) / maxMember * 100) + '%', background: a.color || '#7b68ee' }}></span></span>
                <span class="ct-meta" style=${{ margin: 0, whiteSpace: 'nowrap' }}>${m.open || 0} open${m.overdue ? ' · ' + m.overdue + ' late' : ''} · ${m.done || 0} done</span>
              </div>`)}
          ${a.unassigned > 0 && h`<div class="ct-meta">${a.unassigned} team task${a.unassigned > 1 ? 's have' : ' has'} nobody assigned.</div>`}
        </div>`;
      };

      const body = missing ? h`<${NotReady}/>`
        : err ? h`<${ErrBox} error=${err} onRetry=${() => { setErr(null); loadTeams(); loadPeople(); }}/>`
        : tab === 'teams'
          ? (teams === null ? h`<${Loading} rows=${5}/>`
            : teamsShown.length === 0
              ? h`<${Empty} icon="ti-users-group" title=${q ? 'No teams match' : 'No teams yet'}
                  sub="Group people by craft or pod, then assign tasks to the whole team."
                  action=${canManage ? h`<button class="ct-btn pri" style=${{ marginTop: 8 }} onClick=${() => setTeamDlg({})}><i class="ti ti-plus"></i>New team</button>` : null}/>`
              : h`<div class="ct-grid">${teamsShown.map(teamCard)}</div>`)
        : tab === 'people'
          ? (people === null ? h`<${Loading} rows=${6}/>`
            : peopleShown.length === 0 ? h`<${Empty} icon="ti-users" title="Nobody matches"/>`
            : h`<div class="ct-tblwrap"><table class="ct-tbl">
                <thead><tr><th>Person</th><th>Role</th><th>Teams</th><th class="num">Capacity</th><th class="num">Open</th><th class="num">Overdue</th><th class="num">Done 7d</th><th></th></tr></thead>
                <tbody>
                  ${peopleShown.map(p => h`<tr key=${p.id}>
                    <td><span class="ct-person"><${Face} m=${p} size=${24}/>
                      <span style=${{ minWidth: 0 }}>
                        <span style=${{ fontWeight: 600, display: 'block' }}>${p.name}</span>
                        ${p.job_title && h`<span style=${{ fontSize: 11.5, color: 'var(--cu-t3,#8e8e99)' }}>${p.job_title}</span>`}
                      </span></span></td>
                    <td><span class="ct-chip static">${p.role_level}</span></td>
                    <td>${arr(p.teams).length === 0 ? h`<span class="ct-meta" style=${{ margin: 0 }}>—</span>`
                      : arr(p.teams).map(t => h`<span key=${t.id} class="ct-chip static" style=${{ marginRight: 4, borderColor: 'transparent', background: (t.color || '#7b68ee') + '1f', color: t.color || '#7b68ee' }}>
                          ${t.name}${t.is_lead ? ' ★' : ''}</span>`)}</td>
                    <td class="num">${p.capacity != null ? p.capacity + '/wk' : p.weekly_hours != null ? p.weekly_hours + 'h' : '—'}</td>
                    <td class="num">${p.open || 0}</td>
                    <td class="num" style=${{ color: p.overdue ? '#d03b3b' : undefined }}>${p.overdue || 0}</td>
                    <td class="num">${p.done_week || 0}</td>
                    <td class="num">${(canManage || p.id === (currentUser && currentUser.id)) && h`<button class="ct-ibtn" aria-label=${'Edit ' + p.name} onClick=${() => setPersonDlg(p)}><i class="ti ti-pencil"></i></button>`}</td>
                  </tr>`)}
                </tbody>
              </table></div>`)
        : tab === 'org'
          ? (people === null ? h`<${Loading} rows=${6}/>` : h`<${OrgChart} people=${peopleShown} onOpen=${(p) => (canManage || p.id === (currentUser && currentUser.id)) && setPersonDlg(p)}/>`)
        : (analytics === null ? h`<${Loading} rows=${5}/>`
          : analytics.length === 0 ? h`<${Empty} icon="ti-chart-bar" title="No teams to report on yet"/>`
          : h`<div class="ct-grid">${analytics.map(analyticsCard)}</div>`);

      return h`<div class="ct-page">
        <div class="ct-hd">
          <div class="ct-title"><i class="ti ti-users-group" style=${{ color: 'var(--cu-accent-ink,#a8009c)' }}></i>Teams</div>
          <div class="ct-tools">
            ${(tab === 'teams' || tab === 'people' || tab === 'org') && h`<input class="ct-input" style=${{ width: 190 }} placeholder=${tab === 'teams' ? 'Search teams' : 'Search people'}
              aria-label="Search" value=${q} onInput=${(e) => setQ(e.target.value)}/>`}
            ${tab === 'analytics' && h`<select class="ct-sel" style=${{ width: 130 }} aria-label="Period" value=${days} onChange=${(e) => setDays(Number(e.target.value))}>
              <option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option></select>`}
            <button class="ct-btn" onClick=${() => { loadTeams(); setPeople(null); if (tab === 'analytics') loadAnalytics(days); }}><i class="ti ti-refresh"></i>Refresh</button>
            ${canManage && h`<button class="ct-btn pri" onClick=${() => setTeamDlg({})}><i class="ti ti-plus"></i>New team</button>`}
          </div>
        </div>
        <div class="ct-tabs" role="tablist" aria-label="Teams views">
          ${[['teams', 'Teams', 'ti-users-group'], ['people', 'All people', 'ti-users'], ['org', 'Org chart', 'ti-sitemap'], ['analytics', 'Analytics', 'ti-chart-bar']].map(t =>
            h`<button key=${t[0]} role="tab" aria-selected=${tab === t[0] ? 'true' : 'false'} class=${'ct-tab' + (tab === t[0] ? ' on' : '')}
              onClick=${() => goTab(t[0])}><i class=${'ti ' + t[2]}></i>${t[1]}</button>`)}
        </div>
        <div class="ct-main">${body}</div>

        ${teamDlg && h`<${TeamDialog} team=${teamDlg.team} teams=${arr(teams)} members=${members} showToast=${showToast}
          onClose=${() => setTeamDlg(null)} onSaved=${afterTeam}/>`}
        ${personDlg && h`<${PersonDialog} person=${personDlg} people=${arr(people)} canManage=${canManage} showToast=${showToast}
          onClose=${() => setPersonDlg(null)} onSaved=${() => { setPeople(null); loadPeople(); }}/>`}
        ${confirm && (ConfirmDialog
          ? h`<${ConfirmDialog} open=${true} title=${'Delete “' + confirm.name + '”?'}
              body="Members keep their tasks; only the team and its task assignments go away."
              confirmLabel="Delete" danger=${true} onConfirm=${() => removeTeam(confirm)} onCancel=${() => setConfirm(null)}/>`
          : h`<div class="ct-modal-bg"><div class="ct-modal" style=${{ width: 'min(420px,100%)' }}>
              <div class="ct-modal-hd">Delete “${confirm.name}”?</div>
              <div class="ct-modal-bd">Members keep their tasks; only the team and its task assignments go away.</div>
              <div class="ct-modal-ft"><button class="ct-btn" onClick=${() => setConfirm(null)}>Cancel</button>
                <button class="ct-btn pri" style=${{ background: '#d03b3b', borderColor: '#d03b3b' }} onClick=${() => removeTeam(confirm)}>Delete</button></div>
            </div></div>`)}
      </div>`;
    }

    // =======================================================================
    // Task panel section — assign this task to teams
    // =======================================================================
    function TaskTeamsSection({ task, showToast }) {
      const [teams, setTeams] = useState(null);
      const [mine, setMine] = useState([]);
      const [missing, setMissing] = useState(false);
      const [busy, setBusy] = useState(false);
      const ref = useRef(null);
      const [open, setOpen] = useState(false);
      const load = useCallback(async () => {
        try {
          const [all, links] = await Promise.all([TeamAPI.list(), TeamAPI.taskTeamsFor([task.id])]);
          setTeams(arr(all)); setMine(arr(links).map(l => l.team_id)); setMissing(false);
        } catch (e) { if (isMissingRpc(e)) setMissing(true); setTeams([]); }
      }, [task.id]);
      useEffect(() => { load(); }, [load]);
      const setTeamsFor = async (ids) => {
        setBusy(true);
        const prev = mine;
        setMine(ids);
        try { await TeamAPI.taskTeamSet(task.id, ids); toast(showToast, 'Teams updated'); }
        catch (e) { setMine(prev); toast(showToast, errMsg(e)); }
        setBusy(false);
      };
      if (missing) return null;
      const chosen = arr(teams).filter(t => mine.includes(t.id));
      const picker = h`<div style=${{ padding: 6, minWidth: 220 }}>
        <div class="ct-lab" style=${{ margin: '2px 0 6px' }}>Assign to teams</div>
        <div class="ct-pick" style=${{ border: 0, maxHeight: 240 }}>
          ${arr(teams).length === 0 ? h`<div class="ct-empty" style=${{ padding: 10 }}>No teams yet</div>`
            : arr(teams).map(t => h`<label key=${t.id}>
                <input type="checkbox" checked=${mine.includes(t.id)} disabled=${busy}
                  onChange=${() => setTeamsFor(mine.includes(t.id) ? mine.filter(x => x !== t.id) : [...mine, t.id])}/>
                <span class="ct-dot" style=${{ background: t.color || '#7b68ee' }}></span>
                <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${t.name}</span>
                <span style=${{ fontSize: 11, color: 'var(--cu-t3,#8e8e99)' }}>${arr(t.members).length}</span>
              </label>`)}
        </div>
      </div>`;
      return h`<div style=${{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        ${chosen.length === 0 ? h`<span style=${{ fontSize: 12.5, color: 'var(--cu-t3,#8e8e99)' }}>No team assigned</span>`
          : chosen.map(t => h`<span key=${t.id} class="ct-chip static" style=${{ borderColor: 'transparent', background: (t.color || '#7b68ee') + '1f', color: t.color || '#7b68ee' }}>
              <i class="ti ti-users-group"></i>${t.name}</span>`)}
        <button ref=${ref} class="ct-btn sm" aria-haspopup="true" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(o => !o)}>
          <i class="ti ti-plus"></i>Teams</button>
        ${open && Popover && h`<${Popover} anchor=${ref.current} open=${open} onClose=${() => setOpen(false)} width=${260}>${picker}<//>`}
        ${open && !Popover && h`<div class="ct-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div class="ct-modal" style=${{ width: 'min(380px,100%)' }}>${picker}
            <div class="ct-modal-ft"><button class="ct-btn" onClick=${() => setOpen(false)}>Done</button></div></div>
        </div>`}
      </div>`;
    }

    // =======================================================================
    // "My team’s work" card
    // =======================================================================
    function TeamTasksCard({ ctl, card, showToast }) {
      const ctxV = React.useContext(DashCtx);
      const tick = (ctxV && ctxV.tick) || 0;
      const [data, setData] = useState(null);
      const [missing, setMissing] = useState(false);
      const [err, setErr] = useState(null);
      const cfg = (card && card.config) || {};
      const load = useCallback(async () => {
        try { setData(await TeamAPI.teamTasks({ include_closed: false, limit: 50, exclude_assigned_to_me: !!cfg.exclude_mine })); setErr(null); setMissing(false); }
        catch (e) { if (isMissingRpc(e)) { setMissing(true); setData(null); } else { setErr(e); setData(null); } }
      }, [cfg.exclude_mine]);
      useEffect(() => { load(); }, [load]);
      useEffect(() => { if (tick) load(); }, [tick]);
      const rows = arr(data && data.rows);
      const body = missing ? h`<div class="ct-empty"><i class="ti ti-database-off"></i><div class="t">Teams aren’t switched on yet</div></div>`
        : err ? h`<${ErrBox} error=${err} onRetry=${load}/>`
        : data === null ? h`<${Loading} rows=${3}/>`
        : rows.length === 0 ? h`<${Empty} icon="ti-users-group" title="Nothing assigned to your teams" sub="Tasks assigned to a team you’re in show up here."/>`
        : h`<div>${rows.slice(0, 12).map(r => h`<div key=${r.id} style=${{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 34, padding: '3px 6px', borderRadius: 6, cursor: 'pointer' }}
              role="button" tabIndex="0" onClick=${() => openTask(r.id)} onKeyDown=${(e) => { if (e.key === 'Enter') openTask(r.id); }}>
            <span class="ct-dot" style=${{ background: r.status_color || '#87909e', borderRadius: '50%' }}></span>
            <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${r.title}</span>
            ${r.client_name && h`<span style=${{ fontSize: 11.5, color: 'var(--cu-t3,#8e8e99)' }}>${r.client_name}</span>`}
            ${r.due_at && h`<span style=${{ fontSize: 11.5, color: new Date(r.due_at) < new Date() && r.status_category !== 'done' ? '#d03b3b' : 'var(--cu-t3,#8e8e99)' }}>${fmtDateUser(r.due_at)}</span>`}
          </div>`)}</div>`;
      const title = cfg.title || 'My team’s work';
      if (CardShell) return h`<${CardShell} title=${title} icon="ti-users-group" count=${data ? (data.total || 0) + ' open' : null} onRefresh=${load} ctl=${ctl}>${body}<//>`;
      return h`<section class="ct-card"><div style=${{ font: '600 15px Inter,system-ui,sans-serif', marginBottom: 6 }}>${title}</div>${body}</section>`;
    }

    // =======================================================================
    // Registrations
    // =======================================================================
    reg('pages', {
      id: 'teams', label: 'Teams', icon: 'ti-users-group', section: 'more', order: 64,
      apps: ['dashboard', 'tasks'], fullHeight: true,
      roles: (r) => r && r !== 'client',
      Component: TeamsPage,
    });

    reg('cards', {
      type: 'team_tasks', name: 'My team’s work', icon: 'ti-users-group', category: 'Team', w: 1,
      desc: 'Open tasks assigned to a team you belong to.', roles: (r) => r !== 'client',
      Component: TeamTasksCard,
    });

    reg('taskPanelSections', {
      id: 'teams', title: 'Teams', icon: 'ti-users-group', order: 45, placement: 'main',
      when: (t) => !!t && !t.is_private,
      Component: TaskTeamsSection,
    });

    let palCache = { at: 0, rows: [] };
    reg('paletteProviders', {
      id: 'teams', label: 'Teams', icon: 'ti-users-group',
      roles: (r) => r && r !== 'client',
      search: async (q) => {
        const now = Date.now();
        if (now - palCache.at > 120000) {
          try { palCache = { at: now, rows: arr(await TeamAPI.list()) }; }
          catch (_) { palCache = { at: now, rows: [] }; }
        }
        const s = String(q || '').trim().toLowerCase();
        return palCache.rows
          .filter(t => !s || String(t.name || '').toLowerCase().includes(s))
          .slice(0, 20)
          .map(t => ({
            id: t.id, label: t.name, icon: 'ti-users-group',
            sub: arr(t.members).length + ' people' + (t.lead ? ' · led by ' + t.lead.name : '') + ((t.stats && t.stats.open) ? ' · ' + t.stats.open + ' open' : ''),
            run: () => { try { location.hash = '#/teams/teams'; } catch (_) {} },
          }));
      },
    });

    return { TeamsPage, TeamAPI, TeamTasksCard, TaskTeamsSection, OrgChart };
  }

  window.AMS_TEAMS = { buildTeams };
})();

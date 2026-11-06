/* ============================================================================
 * automations.js — Automations (ClickUp-parity v2, workstream E)
 *
 *   window.AMS_AUTOMATIONS = { buildAutomations(deps) } → { AutomationsPage, … }
 *
 * Rules are trigger → conditions → actions, scoped to the workspace, a client
 * or a list, and they run in Postgres (migration 095). This module is the
 * cockpit for them:
 *
 *   Browse     20 agency templates by category + one-click quick automations
 *              per client
 *   Manage     every rule: toggle, edit in a real builder, duplicate, run on a
 *              task, delete; filters by trigger / scope / state
 *   Activity   the run log (success / partial / failed / rate-limited /
 *              recursion-blocked) with per-action results
 *   Webhooks   inbound keys (shown once, stored hashed) + inbound events +
 *              the outbound queue (webhook / Slack / email)
 *   Recurring  workstream A's recurring tasks (tasks_recurring_list, fail-open)
 *   Usage      runs per day, top rules, actions used, delivery + limits
 *
 * Registers into window.AMS_EXT: `pages` (id 'automations', admin/manager),
 * `taskMenuItems` ("Automations for this list") and `settingsSections`.
 *
 * Fail-open: every RPC degrades to an explanatory empty state when migration
 * 095 is not applied yet. Built from index.html's shared bridge — single React
 * instance, hooks from deps, never import React here.
 * ==========================================================================*/
(function () {
  function buildAutomations(deps) {
    const {
      React, h, useState, useEffect, useRef, useCallback, useMemo,
      rpcCall, Av, Skel, fmtRelative,
      // tasks.js exports (all optional — the module degrades without them)
      Popover, PickerList, Menu, EmptyState, SectionCard, ConfirmDialog, TaskSearchPicker,
      openTask, useTaskStore, TaskAPI, PRIORITIES, TYPE_META, fmtDateUser,
    } = deps;
    const Fragment = React.Fragment;

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-automations-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-automations-styles';
      st.textContent = `
      :where(:root){--cu-bg:#ffffff;--cu-bg2:#f7f7f8;--cu-bg3:#efeff1;--cu-bd:#e8e8eb;--cu-bd2:#d6d6db;--cu-t1:#1f1f23;--cu-t2:#5c5c66;--cu-t3:#8e8e99;--cu-accent:#ff00ee;--cu-accent-ink:#a8009c;--cu-accent-fog:rgba(255,0,238,.08);--cu-shadow:0 8px 28px rgba(15,15,20,.14),0 2px 6px rgba(15,15,20,.06);--cu-radius:8px;--cu-radius-sm:6px}
      :where(html.dark){--cu-bg:#1c1b1f;--cu-bg2:#161518;--cu-bg3:#26252a;--cu-bd:#2d2c31;--cu-bd2:#3b3a40;--cu-t1:#ececef;--cu-t2:#a9a8b1;--cu-t3:#75747d;--cu-accent:#ff66f5;--cu-accent-ink:#ff7df6;--cu-accent-fog:rgba(255,102,245,.12);--cu-shadow:0 10px 30px rgba(0,0,0,.55)}
      .ca-root{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--cu-t1);min-width:0}
      .ca-root *,.ca-modal *{box-sizing:border-box}
      .ca-hd{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px}
      .ca-h1{display:flex;align-items:center;gap:8px;font-size:20px;font-weight:600}
      .ca-h1 i{font-size:22px;color:var(--cu-accent)}
      .ca-sub{font-size:13px;color:var(--cu-t2);margin-top:3px;line-height:1.5;max-width:680px}
      .ca-sp{flex:1}
      .ca-tabs{display:flex;gap:2px;border-bottom:1px solid var(--cu-bd);margin-bottom:16px;overflow-x:auto;scrollbar-width:none}
      .ca-tabs::-webkit-scrollbar{display:none}
      .ca-tab{border:none;background:transparent;color:var(--cu-t2);font:600 13px inherit;font-family:inherit;padding:9px 12px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
      .ca-tab:hover{color:var(--cu-t1)}
      .ca-tab.on{color:var(--cu-t1);border-bottom-color:var(--cu-accent)}
      .ca-tab .n{font-size:11px;color:var(--cu-t3);font-weight:500}
      .ca-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:var(--cu-radius-sm);border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t1);font:600 13px inherit;font-family:inherit;cursor:pointer;white-space:nowrap;text-decoration:none}
      .ca-btn:hover{background:var(--cu-bg3)}
      .ca-btn:disabled{opacity:.5;cursor:not-allowed}
      .ca-btn.pri{background:var(--cu-accent);border-color:var(--cu-accent);color:#fff}
      .ca-btn.pri:hover{background:#e600d6;border-color:#e600d6}
      html.dark .ca-btn.pri{color:#1b0019}
      .ca-btn.sm{height:26px;padding:0 9px;font-size:12px}
      .ca-btn.ghost{border-color:transparent;background:transparent;color:var(--cu-t2)}
      .ca-btn.ghost:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .ca-btn.danger{color:#e5484d}
      .ca-ibtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:var(--cu-radius-sm);border:none;background:transparent;color:var(--cu-t2);cursor:pointer;font-size:16px;flex-shrink:0;padding:0}
      .ca-ibtn:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .ca-root button:focus-visible,.ca-root input:focus-visible,.ca-root select:focus-visible,.ca-root textarea:focus-visible,.ca-root a:focus-visible,.ca-modal button:focus-visible,.ca-modal input:focus-visible,.ca-modal select:focus-visible,.ca-modal textarea:focus-visible{outline:2px solid var(--cu-accent);outline-offset:1px}
      .ca-in{width:100%;height:32px;padding:0 10px;border:1px solid var(--cu-bd2);border-radius:var(--cu-radius-sm);background:var(--cu-bg);color:var(--cu-t1);font:13px inherit;font-family:inherit;min-width:0}
      .ca-in:focus{outline:none;border-color:var(--cu-accent)}
      .ca-in::placeholder{color:var(--cu-t3)}
      .ca-in.sm{height:28px;font-size:12.5px}
      .ca-in.num{width:88px}
      textarea.ca-in{height:auto;min-height:72px;padding:8px 10px;line-height:1.5;resize:vertical}
      select.ca-in{cursor:pointer}
      .ca-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3)}
      .ca-field{display:flex;flex-direction:column;gap:5px;min-width:0}
      .ca-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 14px}
      .ca-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
      .ca-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
      .ca-hint{font-size:11.5px;color:var(--cu-t3);line-height:1.45}
      .ca-card{background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);min-width:0}
      .ca-card+.ca-card{margin-top:14px}
      .ca-card-hd{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--cu-bd);flex-wrap:wrap}
      .ca-card-t{font-size:15px;font-weight:600;flex:1;min-width:120px}
      .ca-card-b{padding:12px 14px;min-width:0}
      .ca-pill{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;background:var(--cu-bg3);color:var(--cu-t2)}
      .ca-pill.ok{background:rgba(48,164,108,.14);color:#1a7f4b}
      .ca-pill.warn{background:rgba(245,166,35,.16);color:#a86800}
      .ca-pill.bad{background:rgba(229,72,77,.14);color:#c2333a}
      .ca-pill.info{background:var(--cu-accent-fog);color:var(--cu-accent-ink)}
      html.dark .ca-pill.ok{color:#5ee08f}html.dark .ca-pill.warn{color:#f5c76a}html.dark .ca-pill.bad{color:#ff8b8f}
      .ca-chip{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:3px 9px;border-radius:var(--cu-radius-sm);border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t1);font:13px inherit;font-family:inherit;cursor:pointer;max-width:100%;text-align:left}
      .ca-chip:hover{background:var(--cu-bg3)}
      .ca-chip.muted{color:var(--cu-t3)}
      .ca-chip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .ca-sw{width:36px;height:20px;border-radius:10px;border:none;background:var(--cu-bd2);position:relative;cursor:pointer;flex-shrink:0;padding:0;transition:background .15s}
      .ca-sw.on{background:var(--cu-accent)}
      .ca-sw:disabled{opacity:.5;cursor:not-allowed}
      .ca-sw-k{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
      .ca-sw.on .ca-sw-k{transform:translateX(16px)}
      .ca-rule{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-top:1px solid var(--cu-bd);min-width:0}
      .ca-rule:first-child{border-top:none}
      .ca-rule:hover{background:var(--cu-bg2)}
      .ca-rule-b{flex:1;min-width:0}
      .ca-rule-t{font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .ca-rule-t button{background:none;border:none;padding:0;font:inherit;color:inherit;cursor:pointer;text-align:left;max-width:100%;overflow:hidden;text-overflow:ellipsis}
      .ca-rule-t button:hover{color:var(--cu-accent-ink)}
      .ca-flow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;color:var(--cu-t2);margin-top:5px}
      .ca-flow i.sep{font-size:13px;color:var(--cu-t3)}
      .ca-flow .seg{display:inline-flex;align-items:center;gap:5px;background:var(--cu-bg3);border-radius:4px;padding:2px 7px;max-width:100%}
      .ca-flow .seg i{font-size:13px;color:var(--cu-t3)}
      .ca-meta{font-size:11.5px;color:var(--cu-t3);margin-top:5px;display:flex;gap:10px;flex-wrap:wrap}
      .ca-tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
      .ca-tpl{border:1px solid var(--cu-bd);border-radius:var(--cu-radius);padding:13px 14px;display:flex;flex-direction:column;gap:8px;background:var(--cu-bg);min-width:0}
      .ca-tpl:hover{border-color:var(--cu-bd2);box-shadow:var(--cu-shadow)}
      .ca-tpl-t{font-size:14px;font-weight:600;display:flex;align-items:flex-start;gap:8px;line-height:1.35}
      .ca-tpl-t i{font-size:18px;color:var(--cu-accent-ink);flex-shrink:0;margin-top:1px}
      .ca-tpl-d{font-size:12.5px;color:var(--cu-t2);line-height:1.5;flex:1}
      .ca-tpl-f{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .ca-tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
      .ca-tbl{width:100%;border-collapse:collapse;font-size:13px}
      .ca-tbl.wide{min-width:720px}
      .ca-tbl th{text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3);padding:8px;border-bottom:1px solid var(--cu-bd);background:var(--cu-bg2);white-space:nowrap;position:sticky;top:0;z-index:1}
      .ca-tbl td{padding:8px;border-bottom:1px solid var(--cu-bd);vertical-align:top;color:var(--cu-t1)}
      .ca-tbl tbody tr:hover td{background:var(--cu-bg2)}
      .ca-tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      .ca-link{background:none;border:none;padding:0;font:inherit;color:var(--cu-t1);cursor:pointer;text-align:left;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ca-link:hover{color:var(--cu-accent-ink);text-decoration:underline}
      .ca-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:var(--cu-bg3);border-radius:4px;padding:2px 6px;word-break:break-all}
      .ca-pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.55;background:var(--cu-bg2);border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);padding:9px 11px;white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;color:var(--cu-t1)}
      .ca-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
      .ca-stat{border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);padding:10px 12px;background:var(--cu-bg2);min-width:0}
      .ca-stat-n{font-size:21px;font-weight:600;font-variant-numeric:tabular-nums}
      .ca-stat-l{font-size:11px;color:var(--cu-t3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ca-bars{display:flex;align-items:flex-end;gap:3px;height:120px;padding-top:8px}
      .ca-bar{flex:1;min-width:3px;display:flex;flex-direction:column;justify-content:flex-end;gap:1px;height:100%}
      .ca-bar i{display:block;border-radius:2px 2px 0 0;background:var(--cu-accent);min-height:0}
      .ca-bar i.f{background:#e5484d;border-radius:0}
      .ca-bar i.o{background:var(--cu-bd2);border-radius:0}
      .ca-modal-bg{position:fixed;inset:0;z-index:950;background:rgba(10,10,14,.45);display:flex;align-items:center;justify-content:center;padding:2vh 2vw}
      .ca-modal{background:var(--cu-bg);border-radius:12px;box-shadow:var(--cu-shadow);display:flex;flex-direction:column;overflow:hidden;width:min(860px,96vw);max-height:94vh;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--cu-t1)}
      .ca-modal.narrow{width:min(560px,96vw)}
      .ca-modal-hd{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--cu-bd);flex-shrink:0}
      .ca-modal-t{font-size:16px;font-weight:600;flex:1;min-width:0}
      .ca-modal-b{padding:16px;overflow-y:auto;min-height:0}
      .ca-modal-f{display:flex;align-items:center;gap:8px;padding:11px 16px;border-top:1px solid var(--cu-bd);flex-wrap:wrap;flex-shrink:0}
      .ca-sec{border:1px solid var(--cu-bd);border-radius:var(--cu-radius);margin-bottom:14px}
      .ca-sec-hd{display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--cu-bg2);border-bottom:1px solid var(--cu-bd);border-radius:var(--cu-radius) var(--cu-radius) 0 0;flex-wrap:wrap}
      .ca-sec-n{width:20px;height:20px;border-radius:50%;background:var(--cu-accent);color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
      .ca-sec-t{font-size:13px;font-weight:600;flex:1;min-width:0}
      .ca-sec-b{padding:12px}
      .ca-item{border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);padding:10px 12px;background:var(--cu-bg);margin-bottom:10px}
      .ca-item-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
      .ca-item-t{font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px}
      .ca-item-t i{color:var(--cu-t3)}
      .ca-people{display:flex;gap:8px;flex-wrap:wrap}
      .ca-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:7px;padding:44px 20px;color:var(--cu-t3)}
      .ca-empty i.big{font-size:38px;opacity:.5}
      .ca-empty-t{font-size:14px;font-weight:600;color:var(--cu-t2)}
      .ca-empty-s{font-size:12.5px;max-width:400px;line-height:1.5}
      .ca-spin{animation:ca-spin 1s linear infinite;display:inline-block}
      @keyframes ca-spin{to{transform:rotate(360deg)}}
      .ca-note{font-size:12.5px;line-height:1.5;padding:9px 12px;border-radius:var(--cu-radius-sm);background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.35);color:var(--cu-t1)}
      .ca-note.good{background:rgba(48,164,108,.1);border-color:rgba(48,164,108,.35)}
      .ca-note.brand{background:var(--cu-accent-fog);border-color:rgba(255,0,238,.3)}
      @media(max-width:760px){
        .ca-grid,.ca-grid.three{grid-template-columns:minmax(0,1fr)}
        .ca-modal{width:100vw;max-height:100dvh;height:100dvh;border-radius:0}
        .ca-modal-bg{padding:0}
        .ca-rule{flex-wrap:wrap}
      }
      @media(prefers-reduced-motion:reduce){.ca-sw,.ca-sw-k{transition:none}.ca-spin{animation-duration:3s}}
      `;
      document.head.appendChild(st);
    }

    // =========================================================================
    // helpers
    // =========================================================================
    const arr = (v) => (Array.isArray(v) ? v : []);
    const cls = (...x) => x.filter(Boolean).join(' ');
    const uniq = (a) => Array.from(new Set(a));
    const missingRpc = typeof deps.isMissingRpc === 'function'
      ? deps.isMissingRpc
      : (e) => /PGRST202|could not find the function|does not exist|schema cache|404/i.test(String((e && (e.code || '')) + ' ' + ((e && (e.message || e.details)) || '')));

    const ERR = {
      rule_name_required: 'Give the rule a name',
      actions_required: 'Add at least one action',
      too_many_actions: 'A rule can run at most 20 actions',
      too_many_conditions: 'A rule can have at most 20 conditions',
      too_many_rules: 'This workspace already has 500 rules',
      too_many_keys: 'You already have 25 active webhook keys — revoke one first',
      bad_trigger: 'Pick a trigger',
      bad_trigger_hours: 'Hours must be between 1 and 720',
      bad_schedule: 'Check the schedule (frequency and a HH:MM time)',
      bad_scope: 'Pick a valid workspace, client or list',
      bad_action: 'One of the actions is not supported',
      bad_condition: 'One of the conditions is not supported',
      status_required: 'Choose the status to set',
      tags_required: 'Choose at least one tag',
      title_required: 'The new task needs a title',
      comment_required: 'Write the comment text',
      subject_required: 'Email needs a subject',
      emails_required: 'Add at least one email address',
      bad_email_to: 'Choose who the email goes to',
      bad_field: 'Pick a custom field',
      bad_list: 'Pick a list (content calendars are not allowed here)',
      bad_url: 'Use a public https:// URL',
      bad_slack_url: 'Slack URLs look like https://hooks.slack.com/services/…',
      name_required: 'Give the key a name',
      not_found: 'That item no longer exists',
      task_required: 'Pick a task to run this rule on',
    };
    function errText(e) {
      if (!e) return 'Something went wrong';
      if (e.code === 'forbidden') return "You don't have permission to do that";
      if (e.code === 'auth.expired' || e.message === 'auth.no_session') return 'Session expired — sign in again';
      if (missingRpc(e)) return 'Automations need database migration 095 — ask an admin to apply it';
      const m = String((e && (e.message || e.details)) || e);
      const needs = /action_needs_task:(\w+)/.exec(m);
      if (needs) return 'This trigger has no task, so "' + (ACTION_BY[needs[1]] ? ACTION_BY[needs[1]].label : needs[1]) + '" needs a "Create task" action before it';
      const people = /people_required:(\w+)/.exec(m);
      if (people) return 'Choose who to ' + (people[1] === 'watch' ? 'add as watcher' : 'assign');
      const status = /status_not_in_list:(\S+)/.exec(m);
      if (status) return 'That list has no status "' + status[1] + '"';
      const key = Object.keys(ERR).find((k) => m.includes(k));
      return key ? ERR[key] : m;
    }

    const fmtWhen = (iso) => {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return '—';
      if (typeof fmtRelative === 'function' && Date.now() - d.getTime() < 6 * 86400000) return fmtRelative(iso);
      if (typeof fmtDateUser === 'function') return fmtDateUser(iso);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };
    const fmtStamp = (iso) => {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return '—';
      const today = d.toDateString() === new Date().toDateString();
      return (today ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ')
        + d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    };
    const copy = (text, showToast, what) => {
      const done = () => showToast && showToast((what || 'Copied') + ' copied');
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, () => {}); return; }
      } catch (_) { /* fall through */ }
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done();
      } catch (_) { /* ignore */ }
    };

    // =========================================================================
    // catalogs (labels for the server-side enums in migration 095)
    // =========================================================================
    const ROLE_OPTS = [
      { key: 'admin', label: 'Admins' }, { key: 'manager', label: 'Managers' },
      { key: 'seo', label: 'SEO' }, { key: 'editor', label: 'Editors' },
      { key: 'designer', label: 'Designers' }, { key: 'accounts_head', label: 'Accounts' },
    ];
    const SPECIAL_OPTS = [
      { key: 'assignees', label: 'Task assignees' }, { key: 'watchers', label: 'Task watchers' },
      { key: 'creator', label: 'Task creator' }, { key: 'previous_assignee', label: 'Previous assignee' },
      { key: 'trigger_actor', label: 'Person who triggered it' }, { key: 'trigger_member', label: 'Person added/removed' },
      { key: 'rule_owner', label: 'Rule owner' },
    ];
    const PRIO_OPTS = [1, 2, 3, 4].map((v) => ({
      key: String(v), label: (PRIORITIES && PRIORITIES[v] ? PRIORITIES[v].label : 'P' + v),
      color: PRIORITIES && PRIORITIES[v] ? PRIORITIES[v].color : '#9aa0a6',
    }));
    const TYPE_OPTS = Object.keys(TYPE_META || {}).map((k) => ({ key: k, label: TYPE_META[k].label, icon: TYPE_META[k].icon }));
    const CATEGORY_OPTS = [
      { key: 'todo', label: 'Not started' }, { key: 'active', label: 'Active' }, { key: 'done', label: 'Closed' },
    ];
    const WEEKDAYS = [
      { key: 1, label: 'Mon' }, { key: 2, label: 'Tue' }, { key: 3, label: 'Wed' }, { key: 4, label: 'Thu' },
      { key: 5, label: 'Fri' }, { key: 6, label: 'Sat' }, { key: 7, label: 'Sun' },
    ];

    const TRIGGERS = [
      { key: 'task_created', label: 'Task created', icon: 'ti-plus', group: 'Tasks', desc: 'A task (or post) is created anywhere in scope.' },
      { key: 'status_changed', label: 'Status changes', icon: 'ti-progress', group: 'Tasks', desc: 'Status moves — optionally only from/to the statuses you pick.' },
      { key: 'assignee_added', label: 'Assignee added', icon: 'ti-user-plus', group: 'Tasks' },
      { key: 'assignee_removed', label: 'Assignee removed', icon: 'ti-user-minus', group: 'Tasks' },
      { key: 'priority_changed', label: 'Priority changes', icon: 'ti-flag', group: 'Tasks' },
      { key: 'due_changed', label: 'Due date changes', icon: 'ti-calendar-event', group: 'Tasks' },
      { key: 'tag_added', label: 'Tag added', icon: 'ti-tag', group: 'Tasks' },
      { key: 'field_changed', label: 'Custom field changes', icon: 'ti-list-details', group: 'Tasks' },
      { key: 'comment_added', label: 'Comment added', icon: 'ti-message', group: 'Tasks' },
      { key: 'subtasks_done', label: 'All subtasks done', icon: 'ti-subtask', group: 'Tasks' },
      { key: 'checklist_done', label: 'Checklist complete', icon: 'ti-list-check', group: 'Tasks' },
      { key: 'due_in', label: 'Due in X hours', icon: 'ti-alarm', group: 'Time', desc: 'Checked every minute; fires once per task per due date.' },
      { key: 'overdue', label: 'Task is overdue', icon: 'ti-clock-exclamation', group: 'Time', desc: 'Fires once per task per due date, ignoring very old tasks.' },
      { key: 'schedule', label: 'On a schedule', icon: 'ti-calendar-repeat', group: 'Time', taskless: true, desc: 'Daily, weekly or monthly at a time you choose (IST).' },
      { key: 'client_approval', label: 'Client approves / requests changes', icon: 'ti-thumb-up', group: 'Clients', desc: 'From the client portal, on a post.' },
      { key: 'invoice_paid', label: 'Invoice paid', icon: 'ti-receipt-2', group: 'Clients', taskless: true },
      { key: 'form_submitted', label: 'Form submitted', icon: 'ti-forms', group: 'Intake' },
      { key: 'webhook_received', label: 'Webhook received', icon: 'ti-webhook', group: 'Intake', taskless: true, desc: 'From Zapier, Make, your website — see the Webhooks tab.' },
    ];
    const TRIGGER_BY = {};
    TRIGGERS.forEach((t) => { TRIGGER_BY[t.key] = t; });

    const ACTIONS = [
      { key: 'set_status', label: 'Change status', icon: 'ti-progress-check', group: 'Task', needsTask: true },
      { key: 'set_priority', label: 'Set priority', icon: 'ti-flag', group: 'Task', needsTask: true },
      { key: 'assign', label: 'Assign / unassign', icon: 'ti-user-plus', group: 'Task', needsTask: true },
      { key: 'watch', label: 'Add or remove watchers', icon: 'ti-eye', group: 'Task', needsTask: true },
      { key: 'tag', label: 'Add or remove tags', icon: 'ti-tag', group: 'Task', needsTask: true },
      { key: 'set_due', label: 'Set due date', icon: 'ti-calendar-plus', group: 'Task', needsTask: true },
      { key: 'set_field', label: 'Set a custom field', icon: 'ti-list-details', group: 'Task', needsTask: true },
      { key: 'move_list', label: 'Move to another list', icon: 'ti-arrow-move-right', group: 'Task', needsTask: true },
      { key: 'archive', label: 'Archive the task', icon: 'ti-archive', group: 'Task', needsTask: true },
      { key: 'create_subtask', label: 'Create a subtask', icon: 'ti-subtask', group: 'Create', needsTask: true },
      { key: 'create_task', label: 'Create a task', icon: 'ti-plus', group: 'Create' },
      { key: 'apply_template', label: 'Apply a task template', icon: 'ti-template', group: 'Create', needsTask: true },
      { key: 'comment', label: 'Post a comment', icon: 'ti-message-plus', group: 'People', needsTask: true },
      { key: 'notify', label: 'Notify people (inbox)', icon: 'ti-bell', group: 'People' },
      { key: 'whatsapp', label: 'Send a WhatsApp nudge', icon: 'ti-brand-whatsapp', group: 'People', needsTask: true },
      { key: 'email', label: 'Send an email', icon: 'ti-mail', group: 'People' },
      { key: 'webhook', label: 'Call a webhook', icon: 'ti-webhook', group: 'Integrations' },
      { key: 'slack', label: 'Post to Slack', icon: 'ti-brand-slack', group: 'Integrations' },
      { key: 'start_next_milestone', label: 'Start next project milestone', icon: 'ti-diamond', group: 'Integrations' },
    ];
    const ACTION_BY = {};
    ACTIONS.forEach((a) => { ACTION_BY[a.key] = a; });

    const COND_FIELDS = [
      { key: 'type', label: 'Task type', ops: ['in', 'not_in'], kind: 'type' },
      { key: 'post_type', label: 'Post type (reel/creative…)', ops: ['in', 'not_in'], kind: 'post_type' },
      { key: 'client', label: 'Client', ops: ['in', 'not_in'], kind: 'client' },
      { key: 'list', label: 'List', ops: ['in', 'not_in'], kind: 'list' },
      { key: 'status', label: 'Status', ops: ['in', 'not_in'], kind: 'status' },
      { key: 'status_category', label: 'Status category', ops: ['in', 'not_in'], kind: 'category' },
      { key: 'priority', label: 'Priority', ops: ['in', 'not_in'], kind: 'priority' },
      { key: 'tags', label: 'Tags', ops: ['has_any', 'has_all', 'has_none', 'is_empty', 'is_not_empty'], kind: 'tag' },
      { key: 'assignee', label: 'Assignee', ops: ['has_any', 'has_none', 'is_empty', 'is_not_empty'], kind: 'member' },
      { key: 'creator', label: 'Created by', ops: ['in', 'not_in'], kind: 'member' },
      { key: 'title', label: 'Title', ops: ['contains', 'not_contains', 'starts_with', 'eq'], kind: 'text' },
      { key: 'due', label: 'Due date', ops: ['is_empty', 'is_not_empty', 'overdue', 'within_hours'], kind: 'due' },
      { key: 'custom_field', label: 'Custom field', ops: ['eq', 'neq', 'contains', 'not_contains', 'gt', 'lt', 'is_empty', 'is_not_empty'], kind: 'field' },
    ];
    const COND_BY = {};
    COND_FIELDS.forEach((c) => { COND_BY[c.key] = c; });
    const OP_LABEL = {
      in: 'is any of', not_in: 'is none of', has_any: 'has any of', has_all: 'has all of', has_none: 'has none of',
      is_empty: 'is empty', is_not_empty: 'is not empty', contains: 'contains', not_contains: "doesn't contain",
      starts_with: 'starts with', eq: 'is', neq: 'is not', gt: 'is more than', lt: 'is less than',
      overdue: 'is overdue', within_hours: 'is within (hours)',
    };
    const VALUELESS_OPS = ['is_empty', 'is_not_empty', 'overdue'];

    const VARS = [
      'task.title', 'task.url', 'task.status', 'task.priority', 'task.due', 'task.custom_id', 'task.assignees',
      'task.creator', 'task.description', 'client.name', 'list.name', 'trigger.actor', 'trigger.from', 'trigger.to',
      'trigger.comment', 'trigger.remarks', 'rule.name', 'today', 'app.url', 'payload.title',
    ];

    // =========================================================================
    // API
    // =========================================================================
    const API = {
      meta: () => rpcCall('automation_meta', {}, { silentAuth: true }),
      list: (filter) => rpcCall('automations_list', { p_filter: filter || {} }),
      get: (id) => rpcCall('automation_get', { p_id: id }),
      upsert: (data) => rpcCall('automation_upsert', { p_data: data }),
      toggle: (id, on) => rpcCall('automation_toggle', { p_id: id, p_enabled: !!on }),
      remove: (id) => rpcCall('automation_delete', { p_id: id }),
      duplicate: (id) => rpcCall('automation_duplicate', { p_id: id }),
      test: (data, taskId) => rpcCall('automation_test', { p_data: data, p_task_id: taskId }),
      runNow: (id, taskId, force) => rpcCall('automation_run_now', { p_id: id, p_task_id: taskId || null, p_force: !!force }),
      runs: (filter) => rpcCall('automation_runs_list', { p_filter: filter || {} }),
      templates: () => rpcCall('automation_templates', {}),
      fromTemplate: (key, overrides) => rpcCall('automation_create_from_template', { p_key: key, p_overrides: overrides || {} }),
      quickList: (clientId) => rpcCall('automation_quick_list', { p_client_id: clientId }),
      quickSet: (clientId, key, on) => rpcCall('automation_quick_set', { p_client_id: clientId, p_key: key, p_on: !!on }),
      outbox: (limit) => rpcCall('automation_outbox_list', { p_limit: limit || 100 }),
      usage: (days) => rpcCall('automation_usage', { p_days: days || 30 }),
      keys: () => rpcCall('automation_webhook_keys_list', {}),
      keyCreate: (data) => rpcCall('automation_webhook_key_create', { p_data: data }),
      keyRevoke: (id) => rpcCall('automation_webhook_key_revoke', { p_id: id }),
      webhookEvents: (limit) => rpcCall('automation_webhook_events_list', { p_limit: limit || 100 }),
      recurring: () => rpcCall('tasks_recurring_list', {}),
    };

    // Role cache so the task menu item can gate itself outside React.
    let ROLE = null;
    let rolePending = false;
    function ensureRole() {
      if (ROLE || rolePending) return;
      let token = null;
      try { token = localStorage.getItem('ams_session_token'); } catch (_) { token = null; }
      if (!token) return;
      rolePending = true;
      API.meta().then((m) => { ROLE = (m && m.me && m.me.role_level) || null; }, () => {}).then(() => { rolePending = false; });
    }
    const canManage = (role) => role === 'admin' || role === 'manager';

    // =========================================================================
    // lookups — uses the task store when it is mounted, else one bootstrap call
    // =========================================================================
    let bootCache = null;
    function useLookups() {
      const store = typeof useTaskStore === 'function' ? useTaskStore() : null;
      const ready = !!(store && store.ready);
      const [boot, setBoot] = useState(bootCache);
      useEffect(() => {
        if (ready || bootCache || !TaskAPI || typeof TaskAPI.bootstrap !== 'function') return undefined;
        let alive = true;
        TaskAPI.bootstrap().then((b) => { bootCache = b; if (alive) setBoot(b); }, () => {});
        return () => { alive = false; };
      }, [ready]);
      return useMemo(() => {
        const src = ready ? store : (boot || {});
        const members = arr(src.members).filter((m) => m && m.role_level !== 'client');
        const clients = arr(src.clients);
        const lists = arr(src.lists);
        const tags = arr(src.tags);
        const fields = arr(src.fields);
        const statuses = arr(src.statuses);
        const byId = (rows) => { const o = {}; rows.forEach((r) => { o[r.id] = r; }); return o; };
        const statusSeen = {};
        const statusOpts = [];
        statuses.forEach((s) => {
          if (!s || statusSeen[s.key]) return;
          statusSeen[s.key] = s;
          statusOpts.push({ key: s.key, label: s.name, color: s.color, group: s.kind === 'content' ? 'Content calendar' : 'General lists' });
        });
        return {
          members, clients, lists, tags, fields, statuses, statusOpts,
          memberById: byId(members), clientById: byId(clients), listById: byId(lists),
          tagById: byId(tags), fieldById: byId(fields), statusByKey: statusSeen,
          loaded: ready || !!boot,
        };
      }, [ready, store, boot]);
    }

    // =========================================================================
    // atoms
    // =========================================================================
    function Switch({ on, onChange, disabled, label }) {
      return h`<button type="button" class=${cls('ca-sw', on && 'on')} role="switch" aria-checked=${!!on}
        aria-label=${label || (on ? 'Turn off' : 'Turn on')} disabled=${disabled}
        onClick=${(e) => { e.stopPropagation(); onChange && onChange(!on); }}><span class="ca-sw-k"></span></button>`;
    }

    function Empty({ icon = 'ti-bolt', title, sub, action }) {
      if (typeof EmptyState === 'function') return h`<${EmptyState} icon=${icon} title=${title} sub=${sub} action=${action}/>`;
      return h`<div class="ca-empty">
        <i class=${'ti ' + icon + ' big'}></i>
        ${title ? h`<div class="ca-empty-t">${title}</div>` : null}
        ${sub ? h`<div class="ca-empty-s">${sub}</div>` : null}
        ${action || null}
      </div>`;
    }

    function usePop() {
      const [open, setOpen] = useState(false);
      const [anchor, setAnchor] = useState(null);
      const ref = useCallback((el) => { if (el) setAnchor(el); }, []);
      return { open, setOpen, anchor, ref, toggle: () => setOpen((o) => !o), close: () => setOpen(false) };
    }

    // One picker used for every id/enum field, so the builder stays consistent
    // whether or not tasks.js's store-backed pickers are available.
    function Pick({ items, value, onChange, multi = true, placeholder = 'Any', label, width = 280, disabled, allowEmptyLabel }) {
      const pop = usePop();
      const vals = multi ? arr(value).map(String) : (value === null || value === undefined || value === '' ? [] : [String(value)]);
      const chosen = items.filter((it) => vals.includes(String(it.key)));
      const text = chosen.length
        ? chosen.slice(0, 3).map((c) => c.label).join(', ') + (chosen.length > 3 ? ' +' + (chosen.length - 3) : '')
        : (allowEmptyLabel || placeholder);
      const pickItems = items.map((it) => ({
        key: String(it.key), label: it.label, group: it.group, keywords: it.keywords || it.label,
        selected: vals.includes(String(it.key)),
        left: it.color
          ? h`<span style=${{ width: 10, height: 10, borderRadius: 3, background: it.color, flexShrink: 0 }}></span>`
          : (it.icon ? h`<i class=${'ti ' + it.icon}></i>` : null),
      }));
      const pick = (it) => {
        if (!onChange) return;
        if (!multi) { pop.close(); onChange(it.key); return; }
        const next = vals.includes(String(it.key)) ? vals.filter((x) => x !== String(it.key)) : vals.concat(String(it.key));
        onChange(next);
      };
      if (typeof Popover !== 'function' || typeof PickerList !== 'function') {
        // Plain-select fallback (tasks.js atoms not injected)
        return h`<select class="ca-in" disabled=${disabled} value=${vals[0] || ''} aria-label=${label || placeholder}
          onChange=${(e) => onChange && onChange(multi ? (e.target.value ? [e.target.value] : []) : e.target.value)}>
          <option value="">${placeholder}</option>
          ${items.map((it) => h`<option key=${it.key} value=${String(it.key)}>${it.label}</option>`)}
        </select>`;
      }
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} class=${cls('ca-chip', !chosen.length && 'muted')} disabled=${disabled}
          aria-haspopup="listbox" aria-expanded=${pop.open} aria-label=${label || placeholder}
          onClick=${(e) => { e.stopPropagation(); pop.toggle(); }}>
          <span>${text}</span><i class="ti ti-chevron-down" style=${{ fontSize: 12, flexShrink: 0, color: 'var(--cu-t3)' }}></i>
        </button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} width=${width} ariaLabel=${label || placeholder}>
          <${PickerList} items=${pickItems} placeholder="Search…" searchable=${items.length > 7}
            emptyText="Nothing to choose" onPick=${pick}
            footer=${multi && chosen.length ? h`<div style=${{ borderTop: '1px solid var(--cu-bd)', padding: 4 }}>
              <button type="button" class="ca-btn ghost sm" style=${{ width: '100%' }}
                onClick=${() => { onChange && onChange([]); pop.close(); }}>Clear</button></div>` : null}/>
        <//>
      <//>`;
    }

    // Text input with a "insert variable" menu (renders {{task.title}} etc).
    function VarText({ value, onChange, placeholder, multiline, rows = 3, label, disabled }) {
      const pop = usePop();
      const ref = useRef(null);
      const insert = (v) => {
        const el = ref.current;
        const token = '{{' + v + '}}';
        if (el && typeof el.selectionStart === 'number') {
          const s = el.selectionStart, e = el.selectionEnd, cur = String(value || '');
          const next = cur.slice(0, s) + token + cur.slice(e);
          onChange(next);
          setTimeout(() => { try { el.focus(); el.setSelectionRange(s + token.length, s + token.length); } catch (_) { /* ignore */ } }, 0);
        } else {
          onChange(String(value || '') + token);
        }
        pop.close();
      };
      const items = VARS.map((v) => ({ key: v, label: '{{' + v + '}}' }));
      return h`<div class="ca-field">
        ${label ? h`<span class="ca-lbl">${label}</span>` : null}
        <div class="ca-row" style=${{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          ${multiline
            ? h`<textarea ref=${ref} class="ca-in" rows=${rows} value=${value || ''} placeholder=${placeholder} disabled=${disabled}
                 onInput=${(e) => onChange(e.target.value)}></textarea>`
            : h`<input ref=${ref} class="ca-in" value=${value || ''} placeholder=${placeholder} disabled=${disabled}
                 onInput=${(e) => onChange(e.target.value)}/>`}
          ${typeof Popover === 'function' && typeof PickerList === 'function' ? h`<${Fragment}>
            <button type="button" ref=${pop.ref} class="ca-ibtn" title="Insert a value from the task" aria-label="Insert a variable"
              onClick=${(e) => { e.stopPropagation(); pop.toggle(); }}><i class="ti ti-braces"></i></button>
            <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} width=${240} ariaLabel="Insert a variable">
              <${PickerList} items=${items} placeholder="Search values…" onPick=${(it) => insert(it.key)}/>
            <//>
          <//>` : null}
        </div>
      </div>`;
    }

    function PeopleField({ value, onChange, lk, label = 'Who', hint }) {
      const v = value && typeof value === 'object' ? value : {};
      const set = (patch) => onChange(Object.assign({}, v, patch));
      return h`<div class="ca-field">
        <span class="ca-lbl">${label}</span>
        <div class="ca-people">
          <${Pick} items=${lk.members.map((m) => ({ key: m.id, label: m.name }))} value=${arr(v.members)}
            onChange=${(x) => set({ members: x })} placeholder="Pick people" label="People"/>
          <${Pick} items=${ROLE_OPTS} value=${arr(v.roles)} onChange=${(x) => set({ roles: x })} placeholder="By role" label="Roles"/>
          <${Pick} items=${SPECIAL_OPTS} value=${arr(v.special)} onChange=${(x) => set({ special: x })} placeholder="On the task" label="Related to the task"/>
        </div>
        ${hint ? h`<div class="ca-hint">${hint}</div>` : null}
      </div>`;
    }

    function Modal({ title, icon, onClose, children, footer, narrow }) {
      const boxRef = useRef(null);
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose && onClose(); } };
        window.addEventListener('keydown', onKey, true);
        const el = boxRef.current && boxRef.current.querySelector('input,textarea,select,button');
        if (el) setTimeout(() => { try { el.focus(); } catch (_) { /* ignore */ } }, 30);
        return () => window.removeEventListener('keydown', onKey, true);
      }, [onClose]);
      return h`<div class="ca-modal-bg" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
        <div class=${cls('ca-modal', narrow && 'narrow')} role="dialog" aria-modal="true" aria-label=${title} ref=${boxRef}>
          <div class="ca-modal-hd">
            ${icon ? h`<i class=${'ti ' + icon} style=${{ fontSize: 18, color: 'var(--cu-accent-ink)' }}></i>` : null}
            <div class="ca-modal-t">${title}</div>
            <button type="button" class="ca-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="ca-modal-b">${children}</div>
          ${footer ? h`<div class="ca-modal-f">${footer}</div>` : null}
        </div>
      </div>`;
    }

    function Confirm({ open, title, body, confirmLabel, danger, onConfirm, onClose }) {
      if (!open) return null;
      if (typeof ConfirmDialog === 'function') {
        return h`<${ConfirmDialog} open=${true} title=${title} body=${body} message=${body}
          confirmLabel=${confirmLabel} danger=${danger} onConfirm=${onConfirm} onCancel=${onClose} onClose=${onClose}/>`;
      }
      return h`<${Modal} title=${title} narrow=${true} onClose=${onClose}
        footer=${h`<${Fragment}><span class="ca-sp"></span>
          <button type="button" class="ca-btn" onClick=${onClose}>Cancel</button>
          <button type="button" class=${cls('ca-btn', danger ? 'danger' : 'pri')} onClick=${onConfirm}>${confirmLabel || 'Confirm'}</button><//>`}>
        <div style=${{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--cu-t2)' }}>${body}</div>
      <//>`;
    }

    const StatusPill = ({ status }) => {
      const map = {
        success: ['ok', 'Success'], partial: ['warn', 'Partial'], failed: ['bad', 'Failed'],
        rate_limited: ['warn', 'Rate limited'], recursion_blocked: ['info', 'Loop stopped'],
        queued: ['info', 'Queued'], sending: ['info', 'Sending'], sent: ['ok', 'Sent'],
        skipped: ['', 'Skipped'], accepted: ['ok', 'Accepted'], task_failed: ['bad', 'Task failed'],
      };
      const m = map[status] || ['', status || '—'];
      return h`<span class=${cls('ca-pill', m[0])}>${m[1]}</span>`;
    };

    // =========================================================================
    // summaries (Manage rows + template cards)
    // =========================================================================
    function triggerSummary(rule, lk) {
      const t = TRIGGER_BY[rule.trigger_type];
      const c = rule.trigger_config || {};
      let extra = '';
      const names = (keys, dict, prop) => arr(keys).map((k) => (dict[k] ? dict[k][prop] : k)).join(', ');
      if (rule.trigger_type === 'status_changed') {
        const from = arr(c.from).length ? 'from ' + names(c.from, lk.statusByKey, 'name') : '';
        const to = arr(c.to).length ? 'to ' + names(c.to, lk.statusByKey, 'name') : '';
        const cat = c.to_category ? 'to ' + (CATEGORY_OPTS.find((x) => x.key === c.to_category) || {}).label : '';
        extra = [from, to, cat].filter(Boolean).join(' ');
      } else if (rule.trigger_type === 'task_created' && arr(c.types).length) {
        extra = arr(c.types).map((x) => (TYPE_META && TYPE_META[x] ? TYPE_META[x].label : x)).join(', ');
      } else if (rule.trigger_type === 'due_in') {
        extra = (c.hours || 24) + 'h before due';
      } else if (rule.trigger_type === 'overdue') {
        extra = c.after_hours ? c.after_hours + 'h after due' : 'as soon as it passes';
      } else if (rule.trigger_type === 'schedule') {
        const days = arr(c.weekdays).map((d) => (WEEKDAYS.find((w) => w.key === Number(d)) || {}).label).filter(Boolean).join(', ');
        extra = [c.freq || 'daily', days, c.time || '09:00'].filter(Boolean).join(' · ');
      } else if (rule.trigger_type === 'client_approval') {
        extra = c.decision === 'revision' ? 'changes requested' : c.decision === 'approved' ? 'approved' : 'any decision';
      } else if (rule.trigger_type === 'priority_changed' && arr(c.to).length) {
        extra = 'to ' + arr(c.to).map((p) => (PRIORITIES && PRIORITIES[p] ? PRIORITIES[p].label : p)).join(', ');
      } else if (rule.trigger_type === 'tag_added' && arr(c.tag_ids).length) {
        extra = names(c.tag_ids, lk.tagById, 'name');
      } else if (rule.trigger_type === 'comment_added' && c.contains) {
        extra = 'containing “' + c.contains + '”';
      }
      return { label: t ? t.label : rule.trigger_type, icon: t ? t.icon : 'ti-bolt', extra };
    }

    function actionSummary(a, lk) {
      const def = ACTION_BY[a.type] || { label: a.type, icon: 'ti-bolt' };
      const c = a.config || {};
      let extra = '';
      if (a.type === 'set_status') extra = (lk.statusByKey[c.status] ? lk.statusByKey[c.status].name : c.status) || c.category || '';
      else if (a.type === 'set_priority') extra = PRIORITIES && PRIORITIES[c.priority] ? PRIORITIES[c.priority].label : 'clear';
      else if (a.type === 'assign') extra = (c.mode || 'add').replace(/_/g, ' ');
      else if (a.type === 'set_due') extra = c.from === 'clear' ? 'clear' : '+' + (c.days || 0) + 'd';
      else if (a.type === 'move_list') extra = lk.listById[c.list_id] ? lk.listById[c.list_id].name : '';
      else if (a.type === 'email') extra = c.to === 'client' ? 'to the client' : c.to === 'custom' ? 'to a custom address' : 'to the team';
      else if (a.type === 'create_task' || a.type === 'create_subtask') extra = String(c.title || '').slice(0, 30);
      else if (a.type === 'tag') extra = (c.mode || 'add') + ' ' + arr(c.tag_ids).length;
      return { label: def.label, icon: def.icon, extra };
    }

    function scopeLabel(rule, lk) {
      if (rule.scope_name) return rule.scope_name;
      if (rule.scope_type === 'client') return (lk.clientById[rule.scope_id] || {}).name || 'Client';
      if (rule.scope_type === 'list') return (lk.listById[rule.scope_id] || {}).name || 'List';
      return 'Workspace';
    }

    // =========================================================================
    // Rule builder
    // =========================================================================
    const BLANK = {
      name: '', description: '', enabled: true, scope_type: 'workspace', scope_id: null,
      trigger_type: 'status_changed', trigger_config: {}, conditions: [], condition_match: 'all',
      actions: [], rate_limit_per_hour: 100,
    };

    function defaultActionConfig(type) {
      switch (type) {
        case 'set_priority': return { priority: 2 };
        case 'assign': return { mode: 'add', people: { special: ['assignees'] } };
        case 'watch': return { mode: 'add', people: {} };
        case 'tag': return { mode: 'add', tag_ids: [] };
        case 'set_due': return { from: 'now', days: 2 };
        case 'create_task': return { title: '', due_days: 1 };
        case 'create_subtask': return { title: '' };
        case 'comment': return { body: '', mention: {} };
        case 'notify': return { people: { special: ['assignees'] }, title: '', message: '{{task.title}}' };
        case 'whatsapp': return { people: { special: ['assignees'] }, note: '' };
        case 'email': return { to: 'people', people: { special: ['assignees'] }, subject: '', body: '' };
        case 'webhook': return { url: '' };
        case 'slack': return { webhook_url: '', text: '⚡ {{rule.name}} — {{task.title}}' };
        default: return {};
      }
    }

    function TriggerConfig({ value, config, onChange, lk, keys }) {
      const set = (patch) => onChange(Object.assign({}, config || {}, patch));
      const c = config || {};
      const row = (label, node, hint) => h`<div class="ca-field">
        <span class="ca-lbl">${label}</span>${node}${hint ? h`<div class="ca-hint">${hint}</div>` : null}</div>`;
      if (value === 'status_changed') {
        return h`<div class="ca-grid three">
          ${row('From (optional)', h`<${Pick} items=${lk.statusOpts} value=${arr(c.from)} onChange=${(x) => set({ from: x })} placeholder="Any status"/>`)}
          ${row('To', h`<${Pick} items=${lk.statusOpts} value=${arr(c.to)} onChange=${(x) => set({ to: x })} placeholder="Any status"/>`)}
          ${row('Or any status in', h`<${Pick} items=${CATEGORY_OPTS} value=${c.to_category || ''} multi=${false}
            onChange=${(x) => set({ to_category: x || null })} placeholder="Any category"/>`, 'Use this for “anything that closes”.')}
        </div>`;
      }
      if (value === 'task_created') {
        return row('Only these types', h`<${Pick} items=${TYPE_OPTS} value=${arr(c.types)} onChange=${(x) => set({ types: x })} placeholder="Any type"/>`);
      }
      if (value === 'assignee_added' || value === 'assignee_removed') {
        return row('Only these people', h`<${Pick} items=${lk.members.map((m) => ({ key: m.id, label: m.name }))}
          value=${arr(c.member_ids)} onChange=${(x) => set({ member_ids: x })} placeholder="Anyone"/>`);
      }
      if (value === 'priority_changed') {
        return row('Changed to', h`<${Pick} items=${PRIO_OPTS} value=${arr(c.to)} onChange=${(x) => set({ to: x })} placeholder="Any priority"/>`);
      }
      if (value === 'tag_added') {
        return row('Only these tags', h`<${Pick} items=${lk.tags.map((t) => ({ key: t.id, label: t.name, color: t.color }))}
          value=${arr(c.tag_ids)} onChange=${(x) => set({ tag_ids: x })} placeholder="Any tag"/>`);
      }
      if (value === 'field_changed') {
        return h`<div class="ca-grid">
          ${row('Field', h`<${Pick} items=${lk.fields.map((f) => ({ key: f.id, label: f.name }))} value=${c.field_id || ''} multi=${false}
            onChange=${(x) => set({ field_id: x || null })} placeholder="Any field"/>`)}
          ${row('Only when it becomes', h`<input class="ca-in" value=${c.value || ''} placeholder="Any value"
            onInput=${(e) => set({ value: e.target.value })}/>`, 'For dropdowns use the option id.')}
        </div>`;
      }
      if (value === 'comment_added') {
        return row('Only comments containing', h`<input class="ca-in" value=${c.contains || ''} placeholder="Any comment"
          onInput=${(e) => set({ contains: e.target.value })}/>`);
      }
      if (value === 'client_approval') {
        return row('Decision', h`<${Pick} multi=${false} value=${c.decision || 'any'} onChange=${(x) => set({ decision: x })}
          items=${[{ key: 'any', label: 'Approved or changes requested' }, { key: 'approved', label: 'Approved' }, { key: 'revision', label: 'Changes requested' }]}/>`);
      }
      if (value === 'due_in') {
        return row('Hours before the due date', h`<input class="ca-in num" type="number" min="1" max="720" value=${c.hours || 24}
          onInput=${(e) => set({ hours: Number(e.target.value) || 24 })}/>`, 'Checked every minute; each task fires once per due date.');
      }
      if (value === 'overdue') {
        return h`<div class="ca-grid">
          ${row('Hours after the due date', h`<input class="ca-in num" type="number" min="0" max="720" value=${c.after_hours || 0}
            onInput=${(e) => set({ after_hours: Number(e.target.value) || 0 })}/>`)}
          ${row('Ignore tasks older than (days)', h`<input class="ca-in num" type="number" min="1" max="30" value=${c.max_age_days || 3}
            onInput=${(e) => set({ max_age_days: Number(e.target.value) || 3 })}/>`, 'Keeps old briefed posts from flooding the queue.')}
        </div>`;
      }
      if (value === 'schedule') {
        const days = arr(c.weekdays).map(Number);
        return h`<div class="ca-grid three">
          ${row('How often', h`<${Pick} multi=${false} value=${c.freq || 'daily'} onChange=${(x) => set({ freq: x })}
            items=${[{ key: 'daily', label: 'Every day' }, { key: 'weekly', label: 'Every week' }, { key: 'monthly', label: 'Every month' }]}/>`)}
          ${row('Time (IST)', h`<input class="ca-in num" type="time" value=${c.time || '09:00'} onInput=${(e) => set({ time: e.target.value })}/>`)}
          ${(c.freq || 'daily') === 'monthly'
            ? row('Day of month', h`<input class="ca-in num" type="number" min="1" max="31" value=${c.monthday || 1}
                onInput=${(e) => set({ monthday: Number(e.target.value) || 1 })}/>`)
            : row('On days', h`<div class="ca-row">${WEEKDAYS.map((w) => h`<button key=${w.key} type="button"
                class=${cls('ca-btn', 'sm', days.includes(w.key) && 'pri')}
                onClick=${() => set({ weekdays: days.includes(w.key) ? days.filter((d) => d !== w.key) : days.concat(w.key) })}>${w.label}</button>`)}</div>`,
                (c.freq || 'daily') === 'weekly' ? 'Pick at least one day.' : 'Leave empty for every day.')}
        </div>`;
      }
      if (value === 'webhook_received') {
        return row('Only from these keys', h`<${Pick} items=${arr(keys).filter((k) => !k.revoked_at).map((k) => ({ key: k.id, label: k.name }))}
          value=${arr(c.key_ids)} onChange=${(x) => set({ key_ids: x })} placeholder="Any key"/>`,
          'Create keys in the Webhooks tab.');
      }
      if (value === 'form_submitted') {
        return h`<div class="ca-hint">Runs for every form submission that creates a task. Use conditions below to narrow it down.</div>`;
      }
      return h`<div class="ca-hint">${(TRIGGER_BY[value] && TRIGGER_BY[value].desc) || 'No extra settings for this trigger.'}</div>`;
    }

    function ConditionRow({ cond, onChange, onRemove, lk }) {
      const def = COND_BY[cond.field] || COND_FIELDS[0];
      const op = cond.op || def.ops[0];
      const setField = (field) => {
        const d = COND_BY[field] || COND_FIELDS[0];
        onChange({ field, op: d.ops[0], value: d.kind === 'text' ? '' : [] });
      };
      const valueNode = () => {
        if (VALUELESS_OPS.includes(op)) return null;
        const v = cond.value;
        const multi = ['in', 'not_in', 'has_any', 'has_all', 'has_none'].includes(op);
        const commonProps = { value: multi ? arr(v) : (v == null ? '' : String(v)), multi };
        switch (def.kind) {
          case 'type': return h`<${Pick} ...${commonProps} items=${TYPE_OPTS} onChange=${(x) => onChange({ value: x })} placeholder="Pick types"/>`;
          case 'post_type': return h`<${Pick} ...${commonProps} items=${[{ key: 'reel', label: 'Reel' }, { key: 'creative', label: 'Creative' }, { key: 'carousel', label: 'Carousel' }, { key: 'extra', label: 'Extra' }]}
            onChange=${(x) => onChange({ value: x })} placeholder="Pick post types"/>`;
          case 'client': return h`<${Pick} ...${commonProps} items=${lk.clients.map((c) => ({ key: c.id, label: c.name }))} onChange=${(x) => onChange({ value: x })} placeholder="Pick clients"/>`;
          case 'list': return h`<${Pick} ...${commonProps} items=${lk.lists.map((l) => ({ key: l.id, label: l.name, group: l.client_id ? (lk.clientById[l.client_id] || {}).name : 'Agency' }))} onChange=${(x) => onChange({ value: x })} placeholder="Pick lists"/>`;
          case 'status': return h`<${Pick} ...${commonProps} items=${lk.statusOpts} onChange=${(x) => onChange({ value: x })} placeholder="Pick statuses"/>`;
          case 'category': return h`<${Pick} ...${commonProps} items=${CATEGORY_OPTS} onChange=${(x) => onChange({ value: x })} placeholder="Pick categories"/>`;
          case 'priority': return h`<${Pick} ...${commonProps} items=${PRIO_OPTS} onChange=${(x) => onChange({ value: x })} placeholder="Pick priorities"/>`;
          case 'tag': return h`<${Pick} ...${commonProps} items=${lk.tags.map((t) => ({ key: t.id, label: t.name, color: t.color }))} onChange=${(x) => onChange({ value: x })} placeholder="Pick tags"/>`;
          case 'member': return h`<${Pick} ...${commonProps} items=${lk.members.map((m) => ({ key: m.id, label: m.name }))} onChange=${(x) => onChange({ value: x })} placeholder="Pick people"/>`;
          case 'due': return h`<input class="ca-in num" type="number" min="1" value=${cond.value || 24} onInput=${(e) => onChange({ value: Number(e.target.value) || 24 })}/>`;
          case 'field': return h`<input class="ca-in" value=${cond.value == null ? '' : String(cond.value)} placeholder="Value"
            onInput=${(e) => onChange({ value: e.target.value })}/>`;
          default: return h`<input class="ca-in" value=${cond.value == null ? '' : String(cond.value)} placeholder="Text"
            onInput=${(e) => onChange({ value: e.target.value })}/>`;
        }
      };
      return h`<div class="ca-row" style=${{ marginBottom: 8, alignItems: 'flex-start' }}>
        <${Pick} multi=${false} value=${cond.field} onChange=${setField} width=${240}
          items=${COND_FIELDS.map((c) => ({ key: c.key, label: c.label }))} label="Condition field"/>
        ${def.kind === 'field' ? h`<${Pick} multi=${false} value=${cond.field_id || ''} onChange=${(x) => onChange({ field_id: x })}
          items=${lk.fields.map((f) => ({ key: f.id, label: f.name }))} placeholder="Which field" label="Custom field"/>` : null}
        <${Pick} multi=${false} value=${op} onChange=${(x) => onChange({ op: x })} width=${200}
          items=${def.ops.map((o) => ({ key: o, label: OP_LABEL[o] || o }))} label="Comparison"/>
        <div style=${{ flex: 1, minWidth: 140 }}>${valueNode()}</div>
        <button type="button" class="ca-ibtn" aria-label="Remove condition" onClick=${onRemove}><i class="ti ti-trash"></i></button>
      </div>`;
    }

    function ActionEditor({ action, onChange, onRemove, onMove, index, total, lk, meta }) {
      const def = ACTION_BY[action.type] || { label: action.type, icon: 'ti-bolt' };
      const c = action.config || {};
      const set = (patch) => onChange({ type: action.type, config: Object.assign({}, c, patch) });
      const field = (label, node, hint) => h`<div class="ca-field">
        <span class="ca-lbl">${label}</span>${node}${hint ? h`<div class="ca-hint">${hint}</div>` : null}</div>`;
      let body = null;
      switch (action.type) {
        case 'set_status':
          body = h`<div class="ca-grid">
            ${field('Status', h`<${Pick} multi=${false} value=${c.status || ''} items=${lk.statusOpts}
              onChange=${(x) => set({ status: x })} placeholder="Pick a status"/>`,
              'If a list does not have that status, the fallback category below is used.')}
            ${field('Fallback', h`<${Pick} multi=${false} value=${c.category || ''} items=${CATEGORY_OPTS}
              onChange=${(x) => set({ category: x || null })} placeholder="None"/>`)}
          </div>`;
          break;
        case 'set_priority':
          body = field('Priority', h`<${Pick} multi=${false} value=${c.priority == null ? '' : String(c.priority)}
            items=${PRIO_OPTS.concat([{ key: '', label: 'Clear priority' }])}
            onChange=${(x) => set({ priority: x === '' ? null : Number(x) })} placeholder="Pick priority"/>`);
          break;
        case 'assign':
        case 'watch':
          body = h`<${Fragment}>
            ${field('How', h`<${Pick} multi=${false} value=${c.mode || 'add'} onChange=${(x) => set({ mode: x })}
              items=${action.type === 'assign'
                ? [{ key: 'add', label: 'Add' }, { key: 'add_if_empty', label: 'Add only if unassigned' }, { key: 'replace', label: 'Replace everyone' }, { key: 'remove', label: 'Remove' }]
                : [{ key: 'add', label: 'Add watchers' }, { key: 'remove', label: 'Remove watchers' }]}/>`)}
            <${PeopleField} value=${c.people} onChange=${(x) => set({ people: x })} lk=${lk}/>
          <//>`;
          break;
        case 'tag':
          body = h`<div class="ca-grid">
            ${field('How', h`<${Pick} multi=${false} value=${c.mode || 'add'} onChange=${(x) => set({ mode: x })}
              items=${[{ key: 'add', label: 'Add tags' }, { key: 'remove', label: 'Remove tags' }]}/>`)}
            ${field('Tags', h`<${Pick} items=${lk.tags.map((t) => ({ key: t.id, label: t.name, color: t.color }))}
              value=${arr(c.tag_ids)} onChange=${(x) => set({ tag_ids: x })} placeholder="Pick tags"/>`)}
          </div>`;
          break;
        case 'set_due':
          body = h`<div class="ca-grid three">
            ${field('Counting from', h`<${Pick} multi=${false} value=${c.from || 'now'} onChange=${(x) => set({ from: x })}
              items=${[{ key: 'now', label: 'When it runs' }, { key: 'trigger', label: 'When it was triggered' }, { key: 'due', label: 'The current due date' }, { key: 'clear', label: 'Clear the due date' }]}/>`)}
            ${(c.from || 'now') !== 'clear' ? field('Plus days', h`<input class="ca-in num" type="number" value=${c.days == null ? 0 : c.days}
              onInput=${(e) => set({ days: Number(e.target.value) || 0 })}/>`) : null}
            ${(c.from || 'now') !== 'clear' ? field('At time (IST)', h`<input class="ca-in num" type="time" value=${c.time || ''}
              onInput=${(e) => set({ time: e.target.value || null })}/>`, 'Empty = all-day') : null}
          </div>`;
          break;
        case 'set_field':
          body = h`<div class="ca-grid">
            ${field('Field', h`<${Pick} multi=${false} value=${c.field_id || ''} items=${lk.fields.map((f) => ({ key: f.id, label: f.name }))}
              onChange=${(x) => set({ field_id: x })} placeholder="Pick a field"/>`)}
            ${field('Value', h`<input class="ca-in" value=${c.value == null ? '' : String(c.value)} placeholder="Value"
              onInput=${(e) => set({ value: e.target.value })}/>`, 'For dropdown / label fields use the option id.')}
          </div>`;
          break;
        case 'move_list':
          body = field('Move to', h`<${Pick} multi=${false} value=${c.list_id || ''} onChange=${(x) => set({ list_id: x })}
            items=${lk.lists.filter((l) => l.kind !== 'content').map((l) => ({ key: l.id, label: l.name, group: l.client_id ? (lk.clientById[l.client_id] || {}).name : 'Agency' }))}
            placeholder="Pick a list"/>`, 'Posts stay in their content calendar and cannot be moved.');
          break;
        case 'create_task':
        case 'create_subtask':
          body = h`<${Fragment}>
            <${VarText} label="Title" value=${c.title} onChange=${(x) => set({ title: x })} placeholder="New task title"/>
            <${VarText} label="Description" value=${c.description} onChange=${(x) => set({ description: x })} multiline=${true} placeholder="Optional"/>
            <div class="ca-grid three">
              ${action.type === 'create_task' ? field('In list', h`<${Pick} multi=${false} value=${c.list_id || ''} onChange=${(x) => set({ list_id: x })}
                items=${lk.lists.filter((l) => l.kind !== 'content').map((l) => ({ key: l.id, label: l.name, group: l.client_id ? (lk.clientById[l.client_id] || {}).name : 'Agency' }))}
                placeholder="The client's Tasks list"/>`, "Empty = the trigger client's Tasks list, or Agency → Internal.") : null}
              ${field('Due in days', h`<input class="ca-in num" type="number" min="0" value=${c.due_days == null ? '' : c.due_days}
                onInput=${(e) => set({ due_days: e.target.value === '' ? null : Number(e.target.value) })} placeholder="—"/>`)}
              ${field('Priority', h`<${Pick} multi=${false} value=${c.priority == null ? '' : String(c.priority)}
                items=${PRIO_OPTS.concat([{ key: '', label: 'None' }])} onChange=${(x) => set({ priority: x === '' ? null : Number(x) })} placeholder="None"/>`)}
            </div>
            <${PeopleField} value=${c.assignees} onChange=${(x) => set({ assignees: x })} lk=${lk} label="Assign to"/>
          <//>`;
          break;
        case 'apply_template':
          body = h`<${Fragment}>
            ${field('Template id', h`<input class="ca-in" value=${c.template_id || ''} placeholder="Task template id"
              onInput=${(e) => set({ template_id: e.target.value })}/>`, 'Copy the id from Settings → Task templates.')}
            ${meta && meta.features && meta.features.template_apply === false
              ? h`<div class="ca-note" style=${{ marginTop: 8 }}>Templates can be applied by hand today; running them from an automation needs the task-template helper from migration 093. The rest of this rule still runs.</div>`
              : null}
          <//>`;
          break;
        case 'comment':
          body = h`<${Fragment}>
            <${VarText} label="Comment" value=${c.body} onChange=${(x) => set({ body: x })} multiline=${true}
              placeholder="What should the comment say?"/>
            <${PeopleField} value=${c.mention} onChange=${(x) => set({ mention: x })} lk=${lk} label="Mention"
              hint="Mentioned people are @-tagged at the start of the comment and get an inbox notification."/>
          <//>`;
          break;
        case 'notify':
          body = h`<${Fragment}>
            <${PeopleField} value=${c.people} onChange=${(x) => set({ people: x })} lk=${lk} label="Notify"/>
            <${VarText} label="Title" value=${c.title} onChange=${(x) => set({ title: x })} placeholder="⚡ {{task.title}}"/>
            <${VarText} label="Message" value=${c.message} onChange=${(x) => set({ message: x })} multiline=${true} rows=${2}
              placeholder="{{client.name}} · due {{task.due}}"/>
          <//>`;
          break;
        case 'whatsapp':
          body = h`<${Fragment}>
            <${PeopleField} value=${c.people} onChange=${(x) => set({ people: x })} lk=${lk} label="WhatsApp"/>
            <${VarText} label="Note (added to the reminder)" value=${c.note} onChange=${(x) => set({ note: x })} placeholder="This task is overdue"/>
            ${meta && meta.features && meta.features.whatsapp === false
              ? h`<div class="ca-note" style=${{ marginTop: 8 }}>WhatsApp is switched off for this workspace — turn it on in Settings → WhatsApp, otherwise this action is skipped.</div>` : null}
          <//>`;
          break;
        case 'email':
          body = h`<${Fragment}>
            ${field('Send to', h`<${Pick} multi=${false} value=${c.to || 'people'} onChange=${(x) => set({ to: x })}
              items=${[{ key: 'people', label: 'People on the team' }, { key: 'client', label: "The client's contact" }, { key: 'custom', label: 'Specific addresses' }, { key: 'both', label: 'Team and client' }]}/>`)}
            ${(c.to || 'people') === 'people' || c.to === 'both'
              ? h`<${PeopleField} value=${c.people} onChange=${(x) => set({ people: x })} lk=${lk} label="Team recipients"/>` : null}
            ${(c.to === 'custom' || c.emails)
              ? field('Addresses', h`<input class="ca-in" value=${c.emails || ''} placeholder="a@brand.com, b@brand.com"
                  onInput=${(e) => set({ emails: e.target.value })}/>`, 'Comma separated, up to 20.') : null}
            <${VarText} label="Subject" value=${c.subject} onChange=${(x) => set({ subject: x })} placeholder="A new post is ready for you"/>
            <${VarText} label="Body" value=${c.body} onChange=${(x) => set({ body: x })} multiline=${true} rows=${5}
              placeholder=${'Hello {{client.name}} team,\n\n…'}/>
            ${field('Include a link to the task', h`<${Switch} on=${c.include_link !== false && c.to !== 'client'}
              onChange=${(x) => set({ include_link: x })} label="Include task link"/>`,
              'Client emails normally link to the portal instead.')}
          <//>`;
          break;
        case 'webhook':
          body = h`<${Fragment}>
            ${field('POST to', h`<input class="ca-in" value=${c.url || ''} placeholder="https://hooks.zapier.com/…"
              onInput=${(e) => set({ url: e.target.value })}/>`, 'https only. The task, trigger and payload are sent as JSON.')}
            ${field('Extra headers (JSON)', h`<textarea class="ca-in" rows=${2} value=${c.headers ? JSON.stringify(c.headers) : ''}
              placeholder=${'{"X-Token":"…"}'}
              onInput=${(e) => { try { set({ headers: e.target.value ? JSON.parse(e.target.value) : null }); } catch (_) { /* keep typing */ } }}></textarea>`,
              'Optional. Authorization and cookies are stripped.')}
          <//>`;
          break;
        case 'slack':
          body = h`<${Fragment}>
            ${field('Incoming webhook URL', h`<input class="ca-in" value=${c.webhook_url || ''} placeholder="https://hooks.slack.com/services/…"
              onInput=${(e) => set({ webhook_url: e.target.value })}/>`, 'Slack → Apps → Incoming Webhooks → Add to channel.')}
            <${VarText} label="Message" value=${c.text} onChange=${(x) => set({ text: x })} multiline=${true} rows=${2}/>
          <//>`;
          break;
        case 'start_next_milestone':
          body = h`<div class="ca-hint">Moves the client's first pending project milestone to In progress. Great after an invoice is paid.</div>`;
          break;
        case 'archive':
          body = h`<div class="ca-hint">Archives the task. It stays searchable but leaves the active views.</div>`;
          break;
        default:
          body = null;
      }
      return h`<div class="ca-item">
        <div class="ca-item-hd">
          <span class="ca-item-t"><i class=${'ti ' + def.icon}></i>${def.label}</span>
          <span class="ca-sp"></span>
          <button type="button" class="ca-ibtn" aria-label="Move up" disabled=${index === 0} onClick=${() => onMove(-1)}><i class="ti ti-chevron-up"></i></button>
          <button type="button" class="ca-ibtn" aria-label="Move down" disabled=${index === total - 1} onClick=${() => onMove(1)}><i class="ti ti-chevron-down"></i></button>
          <button type="button" class="ca-ibtn" aria-label="Remove action" onClick=${onRemove}><i class="ti ti-trash"></i></button>
        </div>
        ${body}
      </div>`;
    }

    function RuleBuilder({ initial, meta, keys, lk, onClose, onSaved, showToast }) {
      const [rule, setRule] = useState(() => Object.assign({}, BLANK, initial || {}));
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState(null);
      const [testTask, setTestTask] = useState(null);
      const [testResult, setTestResult] = useState(null);
      const [addOpen, setAddOpen] = useState(false);
      const addPop = usePop();
      const set = (patch) => setRule((r) => Object.assign({}, r, patch));
      const trig = TRIGGER_BY[rule.trigger_type] || {};
      const taskless = !!trig.taskless;

      const payload = () => ({
        id: rule.id || null,
        name: rule.name, description: rule.description, enabled: rule.enabled,
        scope_type: rule.scope_type, scope_id: rule.scope_type === 'workspace' ? null : rule.scope_id,
        trigger_type: rule.trigger_type, trigger_config: rule.trigger_config || {},
        conditions: arr(rule.conditions), condition_match: rule.condition_match || 'all',
        actions: arr(rule.actions), rate_limit_per_hour: rule.rate_limit_per_hour || 100,
        template_key: rule.template_key || null,
      });

      const save = async () => {
        setBusy(true); setErr(null);
        try {
          const saved = await API.upsert(payload());
          showToast && showToast(rule.id ? 'Automation updated' : 'Automation created');
          onSaved && onSaved(saved);
          onClose();
        } catch (e) {
          setErr(errText(e));
        } finally {
          setBusy(false);
        }
      };

      const runTest = async (taskId) => {
        setTestResult(null);
        try {
          const r = await API.test(payload(), taskId);
          setTestResult(r);
        } catch (e) {
          setErr(errText(e));
        }
      };

      const addAction = (type) => {
        set({ actions: arr(rule.actions).concat([{ type, config: defaultActionConfig(type) }]) });
        addPop.close(); setAddOpen(false);
      };
      const setAction = (i, next) => set({ actions: arr(rule.actions).map((a, j) => (j === i ? next : a)) });
      const moveAction = (i, d) => {
        const list = arr(rule.actions).slice();
        const j = i + d;
        if (j < 0 || j >= list.length) return;
        const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
        set({ actions: list });
      };

      const actionItems = ACTIONS.filter((a) => !(taskless && a.needsTask) || arr(rule.actions).some((x) => x.type === 'create_task'))
        .map((a) => ({ key: a.key, label: a.label, group: a.group, icon: a.icon }));

      const scopeItems = rule.scope_type === 'client'
        ? lk.clients.map((c) => ({ key: c.id, label: c.name }))
        : lk.lists.map((l) => ({ key: l.id, label: l.name, group: l.client_id ? (lk.clientById[l.client_id] || {}).name : 'Agency' }));

      return h`<${Modal} title=${rule.id ? 'Edit automation' : 'New automation'} icon="ti-bolt" onClose=${onClose}
        footer=${h`<${Fragment}>
          <label class="ca-row" style=${{ gap: 6, fontSize: 12.5, color: 'var(--cu-t2)' }}>
            <${Switch} on=${rule.enabled} onChange=${(x) => set({ enabled: x })} label="Enabled"/> Enabled
          </label>
          <label class="ca-row" style=${{ gap: 6, fontSize: 12.5, color: 'var(--cu-t2)' }}>
            Max runs/hour
            <input class="ca-in num sm" type="number" min="1" max="1000" value=${rule.rate_limit_per_hour || 100}
              onInput=${(e) => set({ rate_limit_per_hour: Number(e.target.value) || 100 })}/>
          </label>
          <span class="ca-sp"></span>
          ${err ? h`<span style=${{ color: '#e5484d', fontSize: 12.5 }}>${err}</span>` : null}
          <button type="button" class="ca-btn" onClick=${onClose}>Cancel</button>
          <button type="button" class="ca-btn pri" disabled=${busy || !rule.name.trim() || !arr(rule.actions).length} onClick=${save}>
            ${busy ? h`<i class="ti ti-loader-2 ca-spin"></i>` : null}${rule.id ? 'Save changes' : 'Create automation'}
          </button>
        <//>`}>

        <div class="ca-grid" style=${{ marginBottom: 14 }}>
          <div class="ca-field">
            <span class="ca-lbl">Name</span>
            <input class="ca-in" value=${rule.name} placeholder="Client approves → move to Scheduled"
              onInput=${(e) => set({ name: e.target.value })}/>
          </div>
          <div class="ca-field">
            <span class="ca-lbl">Applies to</span>
            <div class="ca-row">
              <${Pick} multi=${false} value=${rule.scope_type} width=${220}
                items=${[{ key: 'workspace', label: 'Whole workspace' }, { key: 'client', label: 'One client' }, { key: 'list', label: 'One list' }]}
                onChange=${(x) => set({ scope_type: x, scope_id: null })}/>
              ${rule.scope_type !== 'workspace'
                ? h`<${Pick} multi=${false} value=${rule.scope_id || ''} items=${scopeItems} onChange=${(x) => set({ scope_id: x })}
                    placeholder=${rule.scope_type === 'client' ? 'Pick a client' : 'Pick a list'}/>`
                : null}
            </div>
          </div>
        </div>

        <div class="ca-sec">
          <div class="ca-sec-hd"><span class="ca-sec-n">1</span><span class="ca-sec-t">When this happens</span></div>
          <div class="ca-sec-b">
            <div class="ca-row" style=${{ marginBottom: 10 }}>
              <${Pick} multi=${false} value=${rule.trigger_type} width=${320}
                items=${TRIGGERS.map((t) => ({ key: t.key, label: t.label, group: t.group, icon: t.icon }))}
                onChange=${(x) => set({ trigger_type: x, trigger_config: {} })} label="Trigger"/>
              ${taskless ? h`<span class="ca-pill info">No task yet</span>` : null}
            </div>
            <${TriggerConfig} value=${rule.trigger_type} config=${rule.trigger_config} lk=${lk} keys=${keys}
              onChange=${(x) => set({ trigger_config: x })}/>
            ${taskless ? h`<div class="ca-hint" style=${{ marginTop: 8 }}>
              This trigger has no task of its own — add a “Create a task” action first if you want to change task fields.</div>` : null}
          </div>
        </div>

        <div class="ca-sec">
          <div class="ca-sec-hd">
            <span class="ca-sec-n">2</span><span class="ca-sec-t">Only when</span>
            ${arr(rule.conditions).length > 1 ? h`<${Pick} multi=${false} value=${rule.condition_match || 'all'} width=${180}
              items=${[{ key: 'all', label: 'All conditions match' }, { key: 'any', label: 'Any condition matches' }]}
              onChange=${(x) => set({ condition_match: x })}/>` : null}
          </div>
          <div class="ca-sec-b">
            ${arr(rule.conditions).length === 0
              ? h`<div class="ca-hint" style=${{ marginBottom: 8 }}>No conditions — the rule runs every time the trigger fires.</div>`
              : arr(rule.conditions).map((c, i) => h`<${ConditionRow} key=${i} cond=${c} lk=${lk}
                  onChange=${(patch) => set({ conditions: arr(rule.conditions).map((x, j) => (j === i ? Object.assign({}, x, patch) : x)) })}
                  onRemove=${() => set({ conditions: arr(rule.conditions).filter((x, j) => j !== i) })}/>`)}
            <button type="button" class="ca-btn sm" onClick=${() => set({ conditions: arr(rule.conditions).concat([{ field: 'type', op: 'in', value: [] }]) })}>
              <i class="ti ti-plus"></i>Add condition</button>
          </div>
        </div>

        <div class="ca-sec">
          <div class="ca-sec-hd"><span class="ca-sec-n">3</span><span class="ca-sec-t">Do this</span>
            <span class="ca-hint">Actions run in order, as ${meta && meta.me ? meta.me.name : 'the rule owner'}</span></div>
          <div class="ca-sec-b">
            ${arr(rule.actions).map((a, i) => h`<${ActionEditor} key=${i} action=${a} index=${i} total=${arr(rule.actions).length}
              lk=${lk} meta=${meta} onChange=${(next) => setAction(i, next)} onMove=${(d) => moveAction(i, d)}
              onRemove=${() => set({ actions: arr(rule.actions).filter((x, j) => j !== i) })}/>`)}
            ${typeof Popover === 'function' && typeof PickerList === 'function'
              ? h`<${Fragment}>
                  <button type="button" ref=${addPop.ref} class="ca-btn sm" onClick=${(e) => { e.stopPropagation(); addPop.toggle(); }}>
                    <i class="ti ti-plus"></i>Add action</button>
                  <${Popover} anchor=${addPop.anchor} open=${addPop.open} onClose=${addPop.close} width=${300} ariaLabel="Add an action">
                    <${PickerList} items=${actionItems} placeholder="Search actions…" onPick=${(it) => addAction(it.key)}/>
                  <//>
                <//>`
              : h`<select class="ca-in" value="" onChange=${(e) => e.target.value && addAction(e.target.value)}>
                  <option value="">Add action…</option>
                  ${actionItems.map((a) => h`<option key=${a.key} value=${a.key}>${a.label}</option>`)}
                </select>`}
          </div>
        </div>

        ${typeof TaskSearchPicker === 'function' ? h`<div class="ca-sec">
          <div class="ca-sec-hd"><span class="ca-sec-n">4</span><span class="ca-sec-t">Try it on a task (nothing is changed)</span></div>
          <div class="ca-sec-b">
            <div class="ca-row">
              <${TaskSearchPicker} value=${testTask} onChange=${(t) => { setTestTask(t); runTest(t && (t.id || t)); }}
                placeholder="Search a task…" label="Test task"/>
            </div>
            ${testResult ? h`<div style=${{ marginTop: 10 }}>
              <div class="ca-row" style=${{ marginBottom: 6 }}>
                <span class=${cls('ca-pill', testResult.conditions_match && testResult.scope_match ? 'ok' : 'warn')}>
                  ${testResult.conditions_match && testResult.scope_match ? 'This rule would run' : 'This rule would be skipped'}
                </span>
                ${!testResult.scope_match ? h`<span class="ca-hint">The task is outside the scope you picked.</span>` : null}
              </div>
              ${arr(testResult.conditions).map((c, i) => h`<div key=${i} class="ca-row" style=${{ fontSize: 12.5, color: 'var(--cu-t2)' }}>
                <i class=${'ti ' + (c.match ? 'ti-check' : 'ti-x')} style=${{ color: c.match ? '#30a46c' : '#e5484d' }}></i>
                ${(COND_BY[c.field] || {}).label || c.field} ${OP_LABEL[c.op] || c.op}
              </div>`)}
            </div>` : null}
          </div>
        </div>` : null}
      <//>`;
    }

    // =========================================================================
    // Browse (templates + quick automations)
    // =========================================================================
    const CATEGORY_LABEL = {
      content: 'Content & approvals', clients: 'Client communication', deadlines: 'Deadlines & reminders',
      team: 'Team & assignment', billing: 'Billing & projects', integrations: 'Integrations',
    };

    function QuickAutomations({ clients, showToast }) {
      const [clientId, setClientId] = useState(() => (arr(clients)[0] || {}).id || null);
      const [rows, setRows] = useState(null);
      const [busy, setBusy] = useState(null);
      const [missing, setMissing] = useState(false);
      const load = useCallback(async (id) => {
        if (!id) { setRows([]); return; }
        try { setRows(await API.quickList(id)); } catch (e) {
          if (missingRpc(e)) setMissing(true);
          setRows([]);
        }
      }, []);
      useEffect(() => { load(clientId); }, [clientId, load]);
      const toggle = async (key, on) => {
        setBusy(key);
        try {
          await API.quickSet(clientId, key, on);
          setRows((rs) => arr(rs).map((r) => (r.key === key ? Object.assign({}, r, { on }) : r)));
          showToast && showToast(on ? 'Automation switched on' : 'Automation switched off');
        } catch (e) {
          showToast && showToast(errText(e));
        } finally {
          setBusy(null);
        }
      };
      if (missing) return null;
      return h`<div class="ca-card">
        <div class="ca-card-hd">
          <i class="ti ti-wand" style=${{ color: 'var(--cu-accent-ink)' }}></i>
          <div class="ca-card-t">Quick automations for one client</div>
          <${Pick} multi=${false} value=${clientId || ''} width=${260}
            items=${arr(clients).map((c) => ({ key: c.id, label: c.name }))}
            onChange=${(x) => setClientId(x)} placeholder="Pick a client"/>
        </div>
        <div class="ca-card-b">
          ${rows === null ? h`<div class="ca-hint">Loading…</div>`
            : !arr(rows).length ? h`<div class="ca-hint">Pick a client to see the one-click automations.</div>`
            : arr(rows).map((r) => h`<div key=${r.key} class="ca-row" style=${{ padding: '9px 0', borderTop: '1px solid var(--cu-bd)', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <i class=${'ti ' + (r.icon || 'ti-bolt')} style=${{ fontSize: 17, color: 'var(--cu-t3)', marginTop: 2 }}></i>
                <div style=${{ flex: 1, minWidth: 0 }}>
                  <div style=${{ fontSize: 13.5, fontWeight: 600 }}>${r.name}</div>
                  <div class="ca-hint">${r.description}</div>
                  ${r.last_run_at ? h`<div class="ca-hint">Last run ${fmtWhen(r.last_run_at)} · ${r.last_status || '—'}</div>` : null}
                </div>
                <${Switch} on=${r.on} disabled=${busy === r.key} onChange=${(x) => toggle(r.key, x)} label=${r.name}/>
              </div>`)}
        </div>
      </div>`;
    }

    function BrowseTab({ templates, clients, onUse, onQuickAdd, showToast }) {
      const [q, setQ] = useState('');
      const [cat, setCat] = useState('');
      const list = arr(templates).filter((t) => {
        if (cat && t.category !== cat) return false;
        if (!q.trim()) return true;
        const s = q.trim().toLowerCase();
        return (t.name + ' ' + t.description + ' ' + t.category).toLowerCase().includes(s);
      });
      const cats = uniq(arr(templates).map((t) => t.category));
      const groups = {};
      list.forEach((t) => { (groups[t.category] = groups[t.category] || []).push(t); });
      return h`<${Fragment}>
        <div class="ca-row" style=${{ marginBottom: 14 }}>
          <input class="ca-in" style=${{ maxWidth: 280 }} value=${q} placeholder="Search templates…"
            aria-label="Search templates" onInput=${(e) => setQ(e.target.value)}/>
          <${Pick} multi=${false} value=${cat} width=${220} placeholder="All categories"
            items=${[{ key: '', label: 'All categories' }].concat(cats.map((c) => ({ key: c, label: CATEGORY_LABEL[c] || c })))}
            onChange=${(x) => setCat(x)}/>
          <span class="ca-sp"></span>
          <span class="ca-hint">${arr(templates).length} ready-made automations</span>
        </div>
        ${!arr(templates).length
          ? h`<${Empty} icon="ti-template" title="No templates yet" sub="Templates arrive with migration 095."/>`
          : Object.keys(groups).map((c) => h`<div key=${c} style=${{ marginBottom: 20 }}>
              <div class="ca-lbl" style=${{ marginBottom: 8 }}>${CATEGORY_LABEL[c] || c}</div>
              <div class="ca-tpl-grid">
                ${groups[c].map((t) => h`<div key=${t.key} class="ca-tpl">
                  <div class="ca-tpl-t"><i class=${'ti ' + (t.icon || 'ti-bolt')}></i><span>${t.name}</span></div>
                  <div class="ca-tpl-d">${t.description}</div>
                  <div class="ca-tpl-f">
                    ${t.installed ? h`<span class="ca-pill ok">In use${t.installed > 1 ? ' ×' + t.installed : ''}</span>` : null}
                    ${arr(t.needs).length ? h`<span class="ca-pill warn">Needs setup</span>` : null}
                    <span class="ca-sp"></span>
                    ${!arr(t.needs).length ? h`<button type="button" class="ca-btn sm" onClick=${() => onQuickAdd(t)}>Add</button>` : null}
                    <button type="button" class="ca-btn sm pri" onClick=${() => onUse(t)}>
                      ${arr(t.needs).length ? 'Set up' : 'Customise'}</button>
                  </div>
                </div>`)}
              </div>
            </div>`)}
        <${QuickAutomations} clients=${clients} showToast=${showToast}/>
      <//>`;
    }

    // =========================================================================
    // Manage
    // =========================================================================
    function RuleRow({ rule, lk, onEdit, onToggle, onDuplicate, onDelete, onRunNow, onActivity }) {
      const pop = usePop();
      const t = triggerSummary(rule, lk);
      const acts = arr(rule.actions);
      const menuItems = [
        { key: 'edit', label: 'Edit', icon: 'ti-edit', onSelect: onEdit },
        { key: 'dup', label: 'Duplicate', icon: 'ti-copy', onSelect: onDuplicate },
        { key: 'run', label: 'Run on a task…', icon: 'ti-player-play', onSelect: onRunNow },
        { key: 'act', label: 'View activity', icon: 'ti-history', onSelect: onActivity },
        { key: 'd1', divider: true },
        { key: 'del', label: 'Delete', icon: 'ti-trash', danger: true, onSelect: onDelete },
      ];
      return h`<div class="ca-rule">
        <div style=${{ paddingTop: 2 }}><${Switch} on=${rule.enabled} onChange=${onToggle} label=${'Enable ' + rule.name}/></div>
        <div class="ca-rule-b">
          <div class="ca-rule-t">
            <button type="button" onClick=${onEdit}>${rule.name}</button>
            <span class="ca-pill">${scopeLabel(rule, lk)}</span>
            ${rule.owner_active === false ? h`<span class="ca-pill bad">Owner inactive</span>` : null}
            ${rule.last_status === 'failed' ? h`<span class="ca-pill bad">Last run failed</span>`
              : rule.last_status === 'rate_limited' ? h`<span class="ca-pill warn">Rate limited</span>` : null}
          </div>
          <div class="ca-flow">
            <span class="seg"><i class=${'ti ' + t.icon}></i>${t.label}${t.extra ? ' · ' + t.extra : ''}</span>
            <i class="ti ti-arrow-right sep"></i>
            ${acts.slice(0, 3).map((a, i) => {
              const s = actionSummary(a, lk);
              return h`<span key=${i} class="seg"><i class=${'ti ' + s.icon}></i>${s.label}${s.extra ? ' · ' + s.extra : ''}</span>`;
            })}
            ${acts.length > 3 ? h`<span class="seg">+${acts.length - 3} more</span>` : null}
          </div>
          <div class="ca-meta">
            <span>${rule.runs_24h || 0} runs in 24h</span>
            ${rule.failures_24h ? h`<span style=${{ color: '#e5484d' }}>${rule.failures_24h} failed</span>` : null}
            <span>Runs as ${rule.owner_name || '—'}</span>
            ${rule.last_run_at ? h`<span>Last ${fmtWhen(rule.last_run_at)}</span>` : null}
            ${rule.next_run_at ? h`<span>Next ${fmtStamp(rule.next_run_at)}</span>` : null}
          </div>
        </div>
        ${typeof Popover === 'function' && typeof Menu === 'function' ? h`<${Fragment}>
          <button type="button" ref=${pop.ref} class="ca-ibtn" aria-label=${'Actions for ' + rule.name}
            onClick=${(e) => { e.stopPropagation(); pop.toggle(); }}><i class="ti ti-dots-vertical"></i></button>
          <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} placement="bottom-end" ariaLabel="Rule actions">
            <${Menu} items=${menuItems} onClose=${pop.close}/>
          <//>
        <//>` : h`<button type="button" class="ca-btn sm" onClick=${onEdit}>Edit</button>`}
      </div>`;
    }

    function ManageTab({ rules, lk, filter, setFilter, onEdit, onToggle, onDuplicate, onDelete, onRunNow, onActivity, onNew }) {
      return h`<${Fragment}>
        <div class="ca-row" style=${{ marginBottom: 12 }}>
          <input class="ca-in" style=${{ maxWidth: 240 }} value=${filter.search || ''} placeholder="Search rules…"
            aria-label="Search rules" onInput=${(e) => setFilter(Object.assign({}, filter, { search: e.target.value }))}/>
          <${Pick} multi=${false} value=${filter.trigger_type || ''} width=${260} placeholder="Any trigger"
            items=${[{ key: '', label: 'Any trigger' }].concat(TRIGGERS.map((t) => ({ key: t.key, label: t.label, group: t.group })))}
            onChange=${(x) => setFilter(Object.assign({}, filter, { trigger_type: x || null }))}/>
          <${Pick} multi=${false} value=${filter.client_id || ''} width=${240} placeholder="Any client"
            items=${[{ key: '', label: 'Any client' }].concat(lk.clients.map((c) => ({ key: c.id, label: c.name })))}
            onChange=${(x) => setFilter(Object.assign({}, filter, { client_id: x || null }))}/>
          <${Pick} multi=${false} value=${filter.enabled === undefined || filter.enabled === null ? '' : String(filter.enabled)} width=${180}
            items=${[{ key: '', label: 'On and off' }, { key: 'true', label: 'On only' }, { key: 'false', label: 'Off only' }]}
            onChange=${(x) => setFilter(Object.assign({}, filter, { enabled: x === '' ? null : x === 'true' }))}/>
          <span class="ca-sp"></span>
          <button type="button" class="ca-btn pri" onClick=${onNew}><i class="ti ti-plus"></i>New automation</button>
        </div>
        <div class="ca-card">
          ${!arr(rules).length
            ? h`<${Empty} icon="ti-bolt" title="No automations yet"
                sub="Start from a template in Browse, or build one from scratch — a trigger, optional conditions, and the actions to run."
                action=${h`<button type="button" class="ca-btn pri" onClick=${onNew}>New automation</button>`}/>`
            : arr(rules).map((r) => h`<${RuleRow} key=${r.id} rule=${r} lk=${lk}
                onEdit=${() => onEdit(r)} onToggle=${(on) => onToggle(r, on)} onDuplicate=${() => onDuplicate(r)}
                onDelete=${() => onDelete(r)} onRunNow=${() => onRunNow(r)} onActivity=${() => onActivity(r)}/>`)}
        </div>
      <//>`;
    }

    // =========================================================================
    // Activity
    // =========================================================================
    function RunRow({ run }) {
      const [open, setOpen] = useState(false);
      const results = arr(run.results);
      return h`<${Fragment}>
        <tr>
          <td style=${{ whiteSpace: 'nowrap' }}>${fmtStamp(run.created_at)}</td>
          <td><${StatusPill} status=${run.status}/></td>
          <td>${run.rule_name || '—'}</td>
          <td>
            ${run.task_id
              ? h`<button type="button" class="ca-link" onClick=${() => typeof openTask === 'function' && openTask(run.task_id)}>
                  ${run.task_custom_id ? run.task_custom_id + ' · ' : ''}${run.task_title || 'Open task'}</button>`
              : h`<span style=${{ color: 'var(--cu-t3)' }}>—</span>`}
            ${run.client_name ? h`<div class="ca-hint">${run.client_name}</div>` : null}
          </td>
          <td class="num">${run.actions_ok || 0}${run.actions_failed ? ' / ' + run.actions_failed + ' failed' : ''}</td>
          <td class="num">${run.duration_ms == null ? '—' : run.duration_ms + 'ms'}</td>
          <td style=${{ width: 34 }}>
            ${results.length || run.error ? h`<button type="button" class="ca-ibtn" aria-label="Details" aria-expanded=${open}
              onClick=${() => setOpen((o) => !o)}><i class=${'ti ' + (open ? 'ti-chevron-up' : 'ti-chevron-down')}></i></button>` : null}
          </td>
        </tr>
        ${open ? h`<tr><td colSpan=${7} style=${{ background: 'var(--cu-bg2)' }}>
          ${run.error ? h`<div class="ca-note" style=${{ marginBottom: 8 }}>${run.error}</div>` : null}
          ${results.map((r, i) => h`<div key=${i} class="ca-row" style=${{ fontSize: 12.5, padding: '3px 0' }}>
            <i class=${'ti ' + (r.ok ? 'ti-check' : 'ti-x')} style=${{ color: r.ok ? '#30a46c' : '#e5484d' }}></i>
            <b>${(ACTION_BY[r.type] || {}).label || r.type}</b>
            <span style=${{ color: 'var(--cu-t2)' }}>${r.summary || r.error || ''}</span>
          </div>`)}
        </td></tr>` : null}
      <//>`;
    }

    function ActivityTab({ runs, filter, setFilter, rules, loading, onRefresh }) {
      return h`<${Fragment}>
        <div class="ca-row" style=${{ marginBottom: 12 }}>
          <${Pick} multi=${false} value=${filter.rule_id || ''} width=${260} placeholder="Any rule"
            items=${[{ key: '', label: 'Any rule' }].concat(arr(rules).map((r) => ({ key: r.id, label: r.name })))}
            onChange=${(x) => setFilter(Object.assign({}, filter, { rule_id: x || null }))}/>
          <${Pick} multi=${false} value=${filter.status || ''} width=${200} placeholder="Any result"
            items=${[{ key: '', label: 'Any result' }, { key: 'success', label: 'Success' }, { key: 'partial', label: 'Partial' },
                     { key: 'failed', label: 'Failed' }, { key: 'rate_limited', label: 'Rate limited' },
                     { key: 'recursion_blocked', label: 'Loop stopped' }]}
            onChange=${(x) => setFilter(Object.assign({}, filter, { status: x || null }))}/>
          <span class="ca-sp"></span>
          <button type="button" class="ca-btn sm" onClick=${onRefresh}>
            ${loading ? h`<i class="ti ti-loader-2 ca-spin"></i>` : h`<i class="ti ti-refresh"></i>`}Refresh</button>
        </div>
        <div class="ca-card">
          ${!arr(runs).length
            ? h`<${Empty} icon="ti-history" title="Nothing has run yet"
                sub="Every automation run lands here — what fired, on which task, and what each action did."/>`
            : h`<div class="ca-tbl-wrap"><table class="ca-tbl wide">
                <thead><tr><th>When</th><th>Result</th><th>Rule</th><th>Task</th><th class="num">Actions</th><th class="num">Took</th><th></th></tr></thead>
                <tbody>${arr(runs).map((r) => h`<${RunRow} key=${r.id} run=${r}/>`)}</tbody>
              </table></div>`}
        </div>
      <//>`;
    }

    // =========================================================================
    // Webhooks
    // =========================================================================
    function NewKeyModal({ lk, onClose, onCreated, showToast }) {
      const [name, setName] = useState('');
      const [listId, setListId] = useState('');
      const [busy, setBusy] = useState(false);
      const [created, setCreated] = useState(null);
      const [err, setErr] = useState(null);
      const create = async () => {
        setBusy(true); setErr(null);
        try {
          const k = await API.keyCreate({ name, list_id: listId || null });
          setCreated(k);
          onCreated && onCreated();
        } catch (e) {
          setErr(errText(e));
        } finally {
          setBusy(false);
        }
      };
      if (created) {
        const curl = 'curl -X POST "' + created.url + '" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"title":"New lead from the website","description":"…"}\'';
        return h`<${Modal} title="Webhook key created" icon="ti-key" narrow=${true} onClose=${onClose}
          footer=${h`<${Fragment}><span class="ca-sp"></span>
            <button type="button" class="ca-btn pri" onClick=${onClose}>Done</button><//>`}>
          <div class="ca-note brand" style=${{ marginBottom: 12 }}>
            Copy this URL now — the key is stored hashed and cannot be shown again.
          </div>
          <div class="ca-field" style=${{ marginBottom: 12 }}>
            <span class="ca-lbl">Webhook URL</span>
            <div class="ca-pre">${created.url}</div>
            <div class="ca-row">
              <button type="button" class="ca-btn sm" onClick=${() => copy(created.url, showToast, 'Webhook URL')}>
                <i class="ti ti-copy"></i>Copy URL</button>
              <button type="button" class="ca-btn sm" onClick=${() => copy(created.key, showToast, 'Key')}>
                <i class="ti ti-key"></i>Copy key only</button>
            </div>
          </div>
          <div class="ca-field">
            <span class="ca-lbl">Try it</span>
            <div class="ca-pre">${curl}</div>
            <button type="button" class="ca-btn sm" onClick=${() => copy(curl, showToast, 'Example')}><i class="ti ti-copy"></i>Copy example</button>
          </div>
        <//>`;
      }
      return h`<${Modal} title="New webhook key" icon="ti-key" narrow=${true} onClose=${onClose}
        footer=${h`<${Fragment}>
          ${err ? h`<span style=${{ color: '#e5484d', fontSize: 12.5 }}>${err}</span>` : null}
          <span class="ca-sp"></span>
          <button type="button" class="ca-btn" onClick=${onClose}>Cancel</button>
          <button type="button" class="ca-btn pri" disabled=${busy || !name.trim()} onClick=${create}>
            ${busy ? h`<i class="ti ti-loader-2 ca-spin"></i>` : null}Create key</button>
        <//>`}>
        <div class="ca-field" style=${{ marginBottom: 12 }}>
          <span class="ca-lbl">Name</span>
          <input class="ca-in" value=${name} placeholder="Website contact form" onInput=${(e) => setName(e.target.value)}/>
        </div>
        <div class="ca-field">
          <span class="ca-lbl">Create a task in (optional)</span>
          <${Pick} multi=${false} value=${listId} placeholder="Don't create tasks — just fire rules"
            items=${[{ key: '', label: "Don't create tasks — just fire rules" }].concat(
              lk.lists.filter((l) => l.kind !== 'content').map((l) => ({ key: l.id, label: l.name, group: l.client_id ? (lk.clientById[l.client_id] || {}).name : 'Agency' })))}
            onChange=${(x) => setListId(x)}/>
          <div class="ca-hint">Recognised keys: title / name / subject, description / body / message, due_at, priority, tags[]. Everything else is available to rules as {{payload.…}}.</div>
        </div>
      <//>`;
    }

    function WebhooksTab({ keys, events, outbox, lk, onRefresh, showToast, meta }) {
      const [newOpen, setNewOpen] = useState(false);
      const [revoke, setRevoke] = useState(null);
      const doRevoke = async () => {
        try {
          await API.keyRevoke(revoke.id);
          showToast && showToast('Key revoked');
          onRefresh();
        } catch (e) {
          showToast && showToast(errText(e));
        } finally {
          setRevoke(null);
        }
      };
      return h`<${Fragment}>
        <div class="ca-card">
          <div class="ca-card-hd">
            <i class="ti ti-key" style=${{ color: 'var(--cu-accent-ink)' }}></i>
            <div class="ca-card-t">Inbound keys</div>
            <button type="button" class="ca-btn sm pri" onClick=${() => setNewOpen(true)}><i class="ti ti-plus"></i>New key</button>
          </div>
          <div class="ca-card-b">
            <div class="ca-hint" style=${{ marginBottom: 10 }}>
              Give one of these URLs to Zapier, Make, your website or a CRM. Each call can create a task and always fires
              “Webhook received” rules. Keys are stored hashed and can be revoked any time.
            </div>
            ${!arr(keys).length
              ? h`<${Empty} icon="ti-webhook" title="No keys yet" sub="Create a key to let an outside system send work into AMS."/>`
              : h`<div class="ca-tbl-wrap"><table class="ca-tbl wide">
                  <thead><tr><th>Name</th><th>Key</th><th>Creates task in</th><th class="num">Calls</th><th>Last used</th><th></th></tr></thead>
                  <tbody>${arr(keys).map((k) => h`<tr key=${k.id}>
                    <td>${k.name}${k.revoked_at ? h`<span class="ca-pill bad" style=${{ marginLeft: 6 }}>Revoked</span>` : null}</td>
                    <td><span class="ca-mono">${k.prefix}…</span></td>
                    <td>${k.list_name ? (k.client_name ? k.client_name + ' › ' : '') + k.list_name : h`<span style=${{ color: 'var(--cu-t3)' }}>Rules only</span>`}</td>
                    <td class="num">${k.use_count || 0}</td>
                    <td>${fmtWhen(k.last_used_at)}</td>
                    <td style=${{ textAlign: 'right' }}>
                      ${!k.revoked_at ? h`<button type="button" class="ca-btn sm danger" onClick=${() => setRevoke(k)}>Revoke</button>` : null}
                    </td>
                  </tr>`)}</tbody>
                </table></div>`}
          </div>
        </div>

        <div class="ca-card">
          <div class="ca-card-hd"><i class="ti ti-arrow-down-circle" style=${{ color: 'var(--cu-t2)' }}></i>
            <div class="ca-card-t">Recent inbound calls</div></div>
          <div class="ca-card-b">
            ${!arr(events).length
              ? h`<div class="ca-hint">Nothing received yet.</div>`
              : h`<div class="ca-tbl-wrap"><table class="ca-tbl wide">
                  <thead><tr><th>When</th><th>Result</th><th>Key</th><th>Task</th><th>Payload</th></tr></thead>
                  <tbody>${arr(events).map((e) => h`<tr key=${e.id}>
                    <td style=${{ whiteSpace: 'nowrap' }}>${fmtStamp(e.created_at)}</td>
                    <td><${StatusPill} status=${e.status}/></td>
                    <td>${e.key_name || '—'}</td>
                    <td>${e.task_id
                      ? h`<button type="button" class="ca-link" onClick=${() => typeof openTask === 'function' && openTask(e.task_id)}>${e.task_title || 'Open'}</button>`
                      : '—'}</td>
                    <td><span class="ca-hint">${e.error || JSON.stringify(e.payload || {}).slice(0, 90)}</span></td>
                  </tr>`)}</tbody>
                </table></div>`}
          </div>
        </div>

        <div class="ca-card">
          <div class="ca-card-hd"><i class="ti ti-arrow-up-circle" style=${{ color: 'var(--cu-t2)' }}></i>
            <div class="ca-card-t">Outbound queue</div>
            <span class="ca-hint">Webhooks, Slack posts and emails your rules send</span></div>
          <div class="ca-card-b">
            ${!arr(outbox).length
              ? h`<div class="ca-hint">Nothing sent yet.</div>`
              : h`<div class="ca-tbl-wrap"><table class="ca-tbl wide">
                  <thead><tr><th>When</th><th>Kind</th><th>Status</th><th>To</th><th>Subject</th><th>Rule</th></tr></thead>
                  <tbody>${arr(outbox).map((o) => h`<tr key=${o.id}>
                    <td style=${{ whiteSpace: 'nowrap' }}>${fmtStamp(o.created_at)}</td>
                    <td><span class="ca-pill">${o.kind}</span></td>
                    <td><${StatusPill} status=${o.status}/>${o.attempts > 1 ? h`<span class="ca-hint"> ${o.attempts} tries</span>` : null}</td>
                    <td><span class="ca-hint">${o.target}</span></td>
                    <td>${o.subject || '—'}${o.error ? h`<div class="ca-hint" style=${{ color: '#e5484d' }}>${o.error}</div>` : null}</td>
                    <td>${o.rule_name || '—'}</td>
                  </tr>`)}</tbody>
                </table></div>`}
          </div>
        </div>

        ${newOpen ? h`<${NewKeyModal} lk=${lk} showToast=${showToast} onClose=${() => setNewOpen(false)} onCreated=${onRefresh}/>` : null}
        <${Confirm} open=${!!revoke} title="Revoke this key?" danger=${true} confirmLabel="Revoke"
          body=${revoke ? 'Calls using “' + revoke.name + '” will stop working immediately. This cannot be undone.' : ''}
          onConfirm=${doRevoke} onClose=${() => setRevoke(null)}/>
      <//>`;
    }

    // =========================================================================
    // Recurring (workstream A) + Usage
    // =========================================================================
    function recurrenceText(rec) {
      if (!rec || typeof rec !== 'object') return 'Repeats';
      const every = Number(rec.interval || 1);
      const freq = rec.freq || 'weekly';
      const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[freq] || freq;
      let s = every > 1 ? 'Every ' + every + ' ' + unit + 's' : 'Every ' + unit;
      if (arr(rec.byweekday).length) {
        s += ' on ' + arr(rec.byweekday).map((d) => (WEEKDAYS.find((w) => w.key === Number(d)) || {}).label).filter(Boolean).join(', ');
      }
      if (rec.mode === 'on_schedule') s += ' · on schedule';
      else s += ' · when completed';
      if (rec.until) s += ' · until ' + rec.until;
      if (rec.count) s += ' · ' + rec.count + ' times';
      return s;
    }

    function RecurringTab({ rows, missing }) {
      if (missing) {
        return h`<${Empty} icon="ti-repeat" title="Recurring tasks need migration 093"
          sub="Once the task-recurrence update is applied, every repeating task shows up here alongside your automations."/>`;
      }
      if (!arr(rows).length) {
        return h`<${Empty} icon="ti-repeat" title="No recurring tasks"
          sub="Set a task to repeat from its panel (Recurrence) and it will appear here."/>`;
      }
      return h`<div class="ca-card">
        <div class="ca-card-hd"><i class="ti ti-repeat" style=${{ color: 'var(--cu-accent-ink)' }}></i>
          <div class="ca-card-t">Recurring tasks</div><span class="ca-hint">${arr(rows).length} repeating</span></div>
        <div class="ca-tbl-wrap"><table class="ca-tbl wide">
          <thead><tr><th>Task</th><th>Client</th><th>Repeats</th><th>Next due</th><th>Assignees</th></tr></thead>
          <tbody>${arr(rows).map((t) => h`<tr key=${t.id}>
            <td><button type="button" class="ca-link" onClick=${() => typeof openTask === 'function' && openTask(t.id)}>
              ${t.custom_id ? t.custom_id + ' · ' : ''}${t.title}</button></td>
            <td>${t.client_name || 'Agency'}</td>
            <td><span class="ca-hint">${recurrenceText(t.recurrence)}</span></td>
            <td>${t.due_at ? fmtWhen(t.due_at) : '—'}</td>
            <td>${arr(t.assignees).map((a) => a.name).join(', ') || '—'}</td>
          </tr>`)}</tbody>
        </table></div>
      </div>`;
    }

    function UsageTab({ usage, days, setDays }) {
      if (!usage) return h`<div class="ca-hint">Loading…</div>`;
      const totals = usage.totals || {};
      const byDay = arr(usage.by_day);
      const max = Math.max(1, ...byDay.map((d) => (d.success || 0) + (d.failed || 0) + (d.other || 0)));
      const byAction = usage.by_action || {};
      const actionRows = Object.keys(byAction).sort((a, b) => byAction[b] - byAction[a]);
      const ob = usage.outbox || {};
      const limits = usage.limits || {};
      return h`<${Fragment}>
        <div class="ca-row" style=${{ marginBottom: 12 }}>
          <${Pick} multi=${false} value=${String(days)} width=${180}
            items=${[{ key: '7', label: 'Last 7 days' }, { key: '30', label: 'Last 30 days' }, { key: '90', label: 'Last 90 days' }]}
            onChange=${(x) => setDays(Number(x))}/>
          <span class="ca-sp"></span>
          <span class="ca-hint">${(usage.rules || {}).enabled || 0} of ${(usage.rules || {}).total || 0} rules are on</span>
        </div>
        <div class="ca-stats" style=${{ marginBottom: 14 }}>
          <div class="ca-stat"><div class="ca-stat-n">${totals.runs || 0}</div><div class="ca-stat-l">Runs</div></div>
          <div class="ca-stat"><div class="ca-stat-n">${totals.success || 0}</div><div class="ca-stat-l">Successful</div></div>
          <div class="ca-stat"><div class="ca-stat-n" style=${{ color: (totals.failed || totals.partial) ? '#e5484d' : undefined }}>
            ${(totals.failed || 0) + (totals.partial || 0)}</div><div class="ca-stat-l">Failed / partial</div></div>
          <div class="ca-stat"><div class="ca-stat-n">${totals.rate_limited || 0}</div><div class="ca-stat-l">Rate limited</div></div>
          <div class="ca-stat"><div class="ca-stat-n">${totals.recursion_blocked || 0}</div><div class="ca-stat-l">Loops stopped</div></div>
          <div class="ca-stat"><div class="ca-stat-n">${usage.webhooks_in || 0}</div><div class="ca-stat-l">Webhooks in</div></div>
        </div>

        <div class="ca-card">
          <div class="ca-card-hd"><div class="ca-card-t">Runs per day</div>
            <span class="ca-hint">${totals.last_hour || 0} in the last hour · workspace cap ${limits.org_runs_per_hour || 2000}/hour</span></div>
          <div class="ca-card-b">
            <div class="ca-bars" role="img" aria-label="Automation runs per day">
              ${byDay.map((d) => {
                const tot = (d.success || 0) + (d.failed || 0) + (d.other || 0);
                const px = (n) => Math.round((n / max) * 108);
                return h`<div key=${d.day} class="ca-bar" title=${d.day + ': ' + tot + ' runs'}>
                  ${d.other ? h`<i class="o" style=${{ height: px(d.other) + 'px' }}></i>` : null}
                  ${d.failed ? h`<i class="f" style=${{ height: px(d.failed) + 'px' }}></i>` : null}
                  <i style=${{ height: px(d.success || 0) + 'px' }}></i>
                </div>`;
              })}
            </div>
          </div>
        </div>

        <div class="ca-card">
          <div class="ca-card-hd"><div class="ca-card-t">Busiest rules</div></div>
          <div class="ca-card-b">
            ${!arr(usage.top_rules).length ? h`<div class="ca-hint">No runs in this period.</div>`
              : arr(usage.top_rules).map((r) => h`<div key=${r.rule_id || r.name} class="ca-row" style=${{ padding: '6px 0' }}>
                  <span style=${{ flex: 1, minWidth: 0, fontSize: 13 }}>${r.name || 'Deleted rule'}</span>
                  ${r.failed ? h`<span class="ca-pill bad">${r.failed} failed</span>` : null}
                  <span class="ca-mono">${r.runs}</span>
                </div>`)}
          </div>
        </div>

        <div class="ca-card">
          <div class="ca-card-hd"><div class="ca-card-t">Deliveries</div></div>
          <div class="ca-card-b">
            <div class="ca-stats">
              <div class="ca-stat"><div class="ca-stat-n">${ob.email || 0}</div><div class="ca-stat-l">Emails sent</div></div>
              <div class="ca-stat"><div class="ca-stat-n">${ob.webhook || 0}</div><div class="ca-stat-l">Webhooks sent</div></div>
              <div class="ca-stat"><div class="ca-stat-n">${ob.slack || 0}</div><div class="ca-stat-l">Slack posts</div></div>
              <div class="ca-stat"><div class="ca-stat-n">${ob.queued || 0}</div><div class="ca-stat-l">Waiting</div></div>
              <div class="ca-stat"><div class="ca-stat-n" style=${{ color: ob.failed ? '#e5484d' : undefined }}>${ob.failed || 0}</div>
                <div class="ca-stat-l">Delivery failed</div></div>
            </div>
            ${actionRows.length ? h`<div style=${{ marginTop: 14 }}>
              <div class="ca-lbl" style=${{ marginBottom: 6 }}>Actions used</div>
              <div class="ca-row">${actionRows.map((k) => h`<span key=${k} class="ca-pill">
                ${(ACTION_BY[k] || {}).label || k} · ${byAction[k]}</span>`)}</div>
            </div>` : null}
          </div>
        </div>
      <//>`;
    }

    // =========================================================================
    // Run-on-task dialog
    // =========================================================================
    function RunNowModal({ rule, onClose, showToast }) {
      const [task, setTask] = useState(null);
      const [busy, setBusy] = useState(false);
      const [result, setResult] = useState(null);
      const [err, setErr] = useState(null);
      const taskless = (TRIGGER_BY[rule.trigger_type] || {}).taskless;
      const run = async () => {
        setBusy(true); setErr(null);
        try {
          const r = await API.runNow(rule.id, task && (task.id || task), true);
          setResult(r);
          showToast && showToast(r && r.ok ? 'Automation ran' : 'Nothing to do');
        } catch (e) {
          setErr(errText(e));
        } finally {
          setBusy(false);
        }
      };
      return h`<${Modal} title=${'Run “' + rule.name + '” now'} icon="ti-player-play" narrow=${true} onClose=${onClose}
        footer=${h`<${Fragment}>
          ${err ? h`<span style=${{ color: '#e5484d', fontSize: 12.5 }}>${err}</span>` : null}
          <span class="ca-sp"></span>
          <button type="button" class="ca-btn" onClick=${onClose}>Close</button>
          <button type="button" class="ca-btn pri" disabled=${busy || (!taskless && !task)} onClick=${run}>
            ${busy ? h`<i class="ti ti-loader-2 ca-spin"></i>` : null}Run actions</button>
        <//>`}>
        <div class="ca-note" style=${{ marginBottom: 12 }}>This really runs the actions — statuses change, people are notified, messages go out.</div>
        ${taskless
          ? h`<div class="ca-hint">This rule has no task of its own, so it runs exactly as the schedule would.</div>`
          : typeof TaskSearchPicker === 'function'
            ? h`<${TaskSearchPicker} value=${task} onChange=${setTask} placeholder="Search a task…" label="Run on"/>`
            : h`<input class="ca-in" placeholder="Task id" onInput=${(e) => setTask(e.target.value.trim())}/>`}
        ${result ? h`<div class="ca-pre" style=${{ marginTop: 12 }}>
          ${arr(result.run && result.run.results).map((r) => (r.ok ? '✓ ' : '✗ ') + ((ACTION_BY[r.type] || {}).label || r.type) + ' — ' + (r.summary || r.error || '')).join('\n') || 'No actions ran.'}
        </div>` : null}
      <//>`;
    }

    // =========================================================================
    // Page
    // =========================================================================
    const TABS = [
      { key: 'browse', label: 'Browse', icon: 'ti-template' },
      { key: 'manage', label: 'Manage', icon: 'ti-adjustments' },
      { key: 'activity', label: 'Activity', icon: 'ti-history' },
      { key: 'webhooks', label: 'Webhooks', icon: 'ti-webhook' },
      { key: 'recurring', label: 'Recurring', icon: 'ti-repeat' },
      { key: 'usage', label: 'Usage', icon: 'ti-chart-bar' },
    ];

    function AutomationsPage({ currentUser, clients, team, onNavigate, showToast, params, app }) {
      const role = (currentUser && currentUser.role_level) || null;
      if (role) ROLE = role;
      const lk = useLookups();
      const p = arr(params);
      const initialTab = TABS.some((t) => t.key === p[0]) ? p[0] : 'manage';
      const [tab, setTab] = useState(initialTab);
      const [meta, setMeta] = useState(null);
      const [missing, setMissing] = useState(false);
      const [rules, setRules] = useState([]);
      const [templates, setTemplates] = useState([]);
      const [runs, setRuns] = useState([]);
      const [keys, setKeys] = useState([]);
      const [events, setEvents] = useState([]);
      const [outbox, setOutbox] = useState([]);
      const [usage, setUsage] = useState(null);
      const [usageDays, setUsageDays] = useState(30);
      const [recurring, setRecurring] = useState([]);
      const [recurringMissing, setRecurringMissing] = useState(false);
      const [loading, setLoading] = useState(true);
      const [filter, setFilter] = useState(() => {
        if (p[0] === 'list' && p[1]) return { list_id: p[1] };
        if (p[0] === 'client' && p[1]) return { client_id: p[1] };
        return {};
      });
      const [runFilter, setRunFilter] = useState({ limit: 150 });
      const [builder, setBuilder] = useState(null);
      const [confirmDel, setConfirmDel] = useState(null);
      const [runNow, setRunNow] = useState(null);

      useEffect(() => { if (p[0] === 'list' || p[0] === 'client') setTab('manage'); }, [p[0], p[1]]);

      const loadRules = useCallback(async () => {
        try {
          setRules(await API.list(filter));
        } catch (e) {
          if (missingRpc(e)) setMissing(true);
          else showToast && showToast(errText(e));
        }
      }, [JSON.stringify(filter)]);

      // first load
      useEffect(() => {
        let alive = true;
        (async () => {
          setLoading(true);
          try {
            const m = await API.meta();
            if (!alive) return;
            setMeta(m);
            ROLE = (m && m.me && m.me.role_level) || ROLE;
          } catch (e) {
            if (!alive) return;
            if (missingRpc(e)) { setMissing(true); setLoading(false); return; }
          }
          try { if (alive) setTemplates(await API.templates()); } catch (_) { /* fail open */ }
          if (alive) await loadRules();
          if (alive) setLoading(false);
        })();
        return () => { alive = false; };
      }, []);

      useEffect(() => { if (!missing) loadRules(); }, [loadRules, missing]);

      // per-tab data
      useEffect(() => {
        if (missing) return undefined;
        let alive = true;
        (async () => {
          try {
            if (tab === 'activity') setRuns(await API.runs(runFilter));
            else if (tab === 'webhooks') {
              const [k, e, o] = await Promise.all([
                API.keys().catch(() => []), API.webhookEvents(80).catch(() => []), API.outbox(80).catch(() => []),
              ]);
              if (!alive) return;
              setKeys(k); setEvents(e); setOutbox(o);
            } else if (tab === 'usage') setUsage(await API.usage(usageDays));
            else if (tab === 'recurring') {
              try { setRecurring(await API.recurring()); }
              catch (e) { if (missingRpc(e)) setRecurringMissing(true); }
            }
          } catch (e) {
            if (!alive) return;
            if (missingRpc(e)) setMissing(true);
          }
        })();
        return () => { alive = false; };
      }, [tab, missing, JSON.stringify(runFilter), usageDays]);

      const refreshWebhooks = useCallback(async () => {
        try {
          const [k, e, o] = await Promise.all([
            API.keys().catch(() => []), API.webhookEvents(80).catch(() => []), API.outbox(80).catch(() => []),
          ]);
          setKeys(k); setEvents(e); setOutbox(o);
        } catch (_) { /* fail open */ }
      }, []);

      const onToggle = async (rule, on) => {
        setRules((rs) => rs.map((r) => (r.id === rule.id ? Object.assign({}, r, { enabled: on }) : r)));
        try {
          await API.toggle(rule.id, on);
        } catch (e) {
          setRules((rs) => rs.map((r) => (r.id === rule.id ? Object.assign({}, r, { enabled: !on }) : r)));
          showToast && showToast(errText(e));
        }
      };
      const onDuplicate = async (rule) => {
        try {
          const copyRule = await API.duplicate(rule.id);
          showToast && showToast('Duplicated — the copy is off until you switch it on');
          await loadRules();
          setBuilder(copyRule);
        } catch (e) { showToast && showToast(errText(e)); }
      };
      const onDelete = async () => {
        const rule = confirmDel;
        setConfirmDel(null);
        try {
          await API.remove(rule.id);
          showToast && showToast('Automation deleted');
          loadRules();
        } catch (e) { showToast && showToast(errText(e)); }
      };
      const useTemplate = (tpl) => setBuilder({
        name: tpl.name, description: tpl.description, enabled: true,
        scope_type: 'workspace', scope_id: null,
        trigger_type: tpl.trigger_type, trigger_config: tpl.trigger_config || {},
        conditions: arr(tpl.conditions), condition_match: 'all',
        actions: arr(tpl.actions), rate_limit_per_hour: 100, template_key: tpl.key,
      });
      const quickAddTemplate = async (tpl) => {
        try {
          await API.fromTemplate(tpl.key, {});
          showToast && showToast('“' + tpl.name + '” is on');
          setTemplates((ts) => ts.map((t) => (t.key === tpl.key ? Object.assign({}, t, { installed: (t.installed || 0) + 1 }) : t)));
          loadRules();
          setTab('manage');
        } catch (e) { showToast && showToast(errText(e)); }
      };

      if (!canManage(role) && role) {
        return h`<div class="ca-root">
          <${Empty} icon="ti-lock" title="Automations are for admins and managers"
            sub="Ask an admin if you need a rule set up for your work."/>
        </div>`;
      }

      if (missing) {
        return h`<div class="ca-root">
          <div class="ca-hd"><div>
            <div class="ca-h1"><i class="ti ti-bolt"></i>Automations</div>
            <div class="ca-sub">Rules that do the repetitive work for you — move statuses, assign people, remind the team,
              email clients, post to Slack and call webhooks.</div>
          </div></div>
          <${Empty} icon="ti-database-off" title="Automations need database migration 095"
            sub="Ask an admin to apply migrations/095_automations.sql in Supabase, then reload this page."/>
        </div>`;
      }

      const counts = { manage: arr(rules).length, browse: arr(templates).length };
      return h`<div class="ca-root">
        <div class="ca-hd">
          <div style=${{ flex: 1, minWidth: 220 }}>
            <div class="ca-h1"><i class="ti ti-bolt"></i>Automations</div>
            <div class="ca-sub">When something happens, do something about it — automatically. Rules run on the server,
              so they work even when nobody has the dashboard open.</div>
          </div>
          <button type="button" class="ca-btn pri" onClick=${() => setBuilder({})}><i class="ti ti-plus"></i>New automation</button>
        </div>

        <div class="ca-tabs" role="tablist">
          ${TABS.map((t) => h`<button key=${t.key} type="button" role="tab" aria-selected=${tab === t.key}
            class=${cls('ca-tab', tab === t.key && 'on')} onClick=${() => setTab(t.key)}>
            <i class=${'ti ' + t.icon}></i>${t.label}
            ${counts[t.key] ? h`<span class="n">${counts[t.key]}</span>` : null}
          </button>`)}
        </div>

        ${loading && tab === 'manage' && !arr(rules).length
          ? (typeof Skel === 'function' ? h`<${Skel} h=${140}/>` : h`<div class="ca-hint">Loading…</div>`)
          : tab === 'browse' ? h`<${BrowseTab} templates=${templates} clients=${arr(clients).length ? clients : lk.clients}
              onUse=${useTemplate} onQuickAdd=${quickAddTemplate} showToast=${showToast}/>`
          : tab === 'manage' ? h`<${ManageTab} rules=${rules} lk=${lk} filter=${filter} setFilter=${setFilter}
              onNew=${() => setBuilder({})} onEdit=${(r) => setBuilder(r)} onToggle=${onToggle} onDuplicate=${onDuplicate}
              onDelete=${(r) => setConfirmDel(r)} onRunNow=${(r) => setRunNow(r)}
              onActivity=${(r) => { setRunFilter({ rule_id: r.id, limit: 150 }); setTab('activity'); }}/>`
          : tab === 'activity' ? h`<${ActivityTab} runs=${runs} rules=${rules} filter=${runFilter} setFilter=${setRunFilter}
              loading=${loading} onRefresh=${async () => { try { setRuns(await API.runs(runFilter)); } catch (_) { /* fail open */ } }}/>`
          : tab === 'webhooks' ? h`<${WebhooksTab} keys=${keys} events=${events} outbox=${outbox} lk=${lk} meta=${meta}
              onRefresh=${refreshWebhooks} showToast=${showToast}/>`
          : tab === 'recurring' ? h`<${RecurringTab} rows=${recurring} missing=${recurringMissing}/>`
          : h`<${UsageTab} usage=${usage} days=${usageDays} setDays=${setUsageDays}/>`}

        ${builder ? h`<${RuleBuilder} initial=${builder} meta=${meta} keys=${keys} lk=${lk} showToast=${showToast}
          onClose=${() => setBuilder(null)} onSaved=${() => { loadRules(); setTab('manage'); }}/>` : null}
        ${runNow ? h`<${RunNowModal} rule=${runNow} showToast=${showToast} onClose=${() => { setRunNow(null); loadRules(); }}/>` : null}
        <${Confirm} open=${!!confirmDel} title="Delete this automation?" danger=${true} confirmLabel="Delete"
          body=${confirmDel ? '“' + confirmDel.name + '” will stop running. Its history stays in Activity.' : ''}
          onConfirm=${onDelete} onClose=${() => setConfirmDel(null)}/>
      </div>`;
    }

    // Compact settings entry — status + a way in, without duplicating the page.
    function AutomationsSettingsSection({ user, showToast, clients }) {
      const [stats, setStats] = useState(null);
      const [missing, setMissing] = useState(false);
      useEffect(() => {
        let alive = true;
        API.usage(7).then((u) => { if (alive) setStats(u); }, (e) => { if (alive && missingRpc(e)) setMissing(true); });
        return () => { alive = false; };
      }, []);
      const open = () => { try { location.hash = '#/automations'; } catch (_) { /* ignore */ } };
      if (missing) {
        return h`<div class="ca-root"><${Empty} icon="ti-database-off" title="Automations need migration 095"
          sub="Apply migrations/095_automations.sql, then reload."/></div>`;
      }
      return h`<div class="ca-root">
        <div class="ca-hd"><div>
          <div class="ca-h1"><i class="ti ti-bolt"></i>Automations</div>
          <div class="ca-sub">Rules that run on the server: status changes, reminders, client emails, Slack posts and webhooks.</div>
        </div></div>
        <div class="ca-stats" style=${{ marginBottom: 14 }}>
          <div class="ca-stat"><div class="ca-stat-n">${(stats && stats.rules && stats.rules.enabled) || 0}</div><div class="ca-stat-l">Rules on</div></div>
          <div class="ca-stat"><div class="ca-stat-n">${(stats && stats.totals && stats.totals.runs) || 0}</div><div class="ca-stat-l">Runs this week</div></div>
          <div class="ca-stat"><div class="ca-stat-n">${(stats && stats.outbox && stats.outbox.sent) || 0}</div><div class="ca-stat-l">Messages sent</div></div>
        </div>
        <button type="button" class="ca-btn pri" onClick=${open}><i class="ti ti-external-link"></i>Open Automations</button>
        <${QuickAutomations} clients=${clients} showToast=${showToast}/>
      </div>`;
    }

    // =========================================================================
    // registration
    // =========================================================================
    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key || item.type;
      EXT[key] = (EXT[key] || []).filter((x) => (x.id || x.key || x.type) !== k).concat(item);
    };

    reg('pages', {
      id: 'automations', label: 'Automations', icon: 'ti-bolt', section: 'more', order: 40,
      apps: ['dashboard'], roles: (role) => canManage(role), Component: AutomationsPage,
    });

    reg('taskMenuItems', {
      key: 'automations-for-list', label: 'Automations for this list', icon: 'ti-bolt', order: 80,
      when: (task) => !!(task && task.list_id) && canManage(ROLE),
      run: (task, ctx) => {
        try { location.hash = '#/automations/list/' + task.list_id; } catch (_) { /* ignore */ }
        if (ctx && ctx.close) ctx.close();
      },
    });

    reg('settingsSections', {
      id: 'automations', label: 'Automations', icon: 'ti-bolt', order: 62,
      roles: (role) => canManage(role), Component: AutomationsSettingsSection,
    });

    // Warm the role cache so the task-menu item can gate itself before the page opens.
    setTimeout(ensureRole, 2500);

    return { AutomationsPage, AutomationsSettingsSection, API, TRIGGERS, ACTIONS };
  }

  window.AMS_AUTOMATIONS = { buildAutomations };
})();

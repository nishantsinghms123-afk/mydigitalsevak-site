/* ============================================================================
 * forms.js — Forms → tasks (ClickUp parity v2, workstream H, migration 098)
 *
 *   window.AMS_FORMS.buildForms(deps) → {
 *     PublicFormPage,   // …/app/?form=<slug> — standalone, no login, mobile-first
 *     FormsPage,        // staff hub + builder (registered as AMS_EXT page 'forms')
 *     FormRenderer,     // the form itself (shared by the public page and Preview)
 *     FormsAPI, FORM_TEMPLATES, FormViewTab
 *   }
 *
 * Every unit of work stays a task: a submission creates a `request` task through
 * form_public_submit (server side), mapped to the form's target list/client with
 * the configured defaults. This module never writes tasks directly.
 *
 * Fail-open: before migration 098 is applied every RPC 404s — the hub then shows
 * a "needs migration" empty state and the public page a friendly "not available".
 * ==========================================================================*/
(function () {
  function buildForms(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo, rpcCall, supabase } = deps;
    const Fragment = React.Fragment;

    // ---- optional deps (other workstreams) — all degrade gracefully ---------
    const TaskAPI = deps.TaskAPI || null;
    const taskBus = deps.taskBus || null;
    const useTaskStore = deps.useTaskStore || (() => ({}));
    const Popover = deps.Popover;
    const Menu = deps.Menu;
    const PickerList = deps.PickerList;
    const EmptyState = deps.EmptyState;
    const ConfirmDialog = deps.ConfirmDialog;
    const AssigneePicker = deps.AssigneePicker;
    const TagPicker = deps.TagPicker;
    const ListPicker = deps.ListPicker;
    const PriorityPicker = deps.PriorityPicker;
    const MemberAvatar = deps.MemberAvatar;
    const openTask = deps.openTask || ((id) => { try { window.dispatchEvent(new CustomEvent('ams-open-task', { detail: { id } })); } catch (_) { } });
    const isMissingRpc = deps.isMissingRpc ||
      ((e) => /PGRST202|could not find the function|does not exist|schema cache|404/i.test(String((e && (e.code || '')) + ' ' + (e && (e.message || e.details || '') || ''))));
    const fmtDateUser = deps.fmtDateUser || ((iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''));
    const fmtRelative = deps.fmtRelative || ((iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''));

    const arr = (x) => (Array.isArray(x) ? x : []);
    const EXT = () => (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key || item.type;
      const e = EXT();
      e[key] = (e[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item);
    };

    // =========================================================================
    // Styles — one <style>, `fm-` prefix. In-app surfaces map the --fm-* tokens
    // onto the global --cu-* ones; the public page defines its own (it renders
    // outside the dashboard, in either theme, with the org's accent colour).
    // =========================================================================
    if (!document.getElementById('ams-forms-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-forms-styles';
      st.textContent = `
      .fm-app{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;background:var(--cu-bg);color:var(--cu-t1);
        font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;font-size:13px}
      .fm-app *,.fm-pub *{box-sizing:border-box}
      .fm-hd{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid var(--cu-bd);flex-wrap:wrap}
      .fm-h1{font-size:18px;font-weight:600;letter-spacing:-.01em;margin:0;color:var(--cu-t1)}
      .fm-sub{font-size:12px;color:var(--cu-t3)}
      .fm-body{flex:1;min-height:0;overflow:auto}
      .fm-wrap{padding:16px 18px 40px;max-width:1180px}
      .fm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:6px;
        border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t1);font:600 13px/1 inherit;cursor:pointer;white-space:nowrap}
      .fm-btn:hover:not(:disabled){background:var(--cu-bg3)}
      .fm-btn:disabled{opacity:.5;cursor:not-allowed}
      .fm-btn-pri{background:var(--cu-accent);border-color:var(--cu-accent);color:#fff}
      .fm-btn-pri:hover:not(:disabled){filter:brightness(.94)}
      .fm-btn-ghost{border-color:transparent;background:transparent;color:var(--cu-t2)}
      .fm-btn-ghost:hover:not(:disabled){background:var(--cu-bg3);color:var(--cu-t1)}
      .fm-btn-danger{color:#e5484d}
      .fm-ibtn{width:28px;height:28px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--cu-t2);
        display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
      .fm-ibtn:hover:not(:disabled){background:var(--cu-bg3);color:var(--cu-t1)}
      .fm-ibtn.on{color:var(--cu-accent)}
      .fm-input,.fm-select,.fm-textarea{width:100%;border:1px solid var(--cu-bd2);border-radius:6px;background:var(--cu-bg);
        color:var(--cu-t1);font:400 13px/1.45 inherit;padding:7px 9px}
      .fm-textarea{resize:vertical;min-height:64px}
      .fm-input:focus,.fm-select:focus,.fm-textarea:focus{outline:2px solid var(--cu-accent);outline-offset:1px;border-color:transparent}
      .fm-lbl2{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3);margin:0 0 5px}
      .fm-hint{font-size:11.5px;color:var(--cu-t3);margin-top:4px;line-height:1.45}
      .fm-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .fm-tabs{display:flex;gap:2px;border-bottom:1px solid var(--cu-bd);padding:0 18px;overflow-x:auto;scrollbar-width:none}
      .fm-tabs::-webkit-scrollbar{display:none}
      .fm-tab{appearance:none;background:none;border:none;border-bottom:2px solid transparent;color:var(--cu-t2);
        font:600 13px/1 inherit;padding:10px 12px;cursor:pointer;white-space:nowrap;display:inline-flex;gap:6px;align-items:center}
      .fm-tab.on{color:var(--cu-t1);border-bottom-color:var(--cu-accent)}
      .fm-tab:hover{color:var(--cu-t1)}
      .fm-cnt{font-size:11px;font-weight:600;background:var(--cu-bg3);color:var(--cu-t2);border-radius:9px;padding:1px 6px}
      .fm-card{border:1px solid var(--cu-bd);border-radius:8px;background:var(--cu-bg);margin-bottom:14px}
      .fm-card-hd{padding:11px 14px;border-bottom:1px solid var(--cu-bd);font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:8px}
      .fm-card-b{padding:14px}
      .fm-pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;border-radius:20px;padding:2px 8px;white-space:nowrap}
      .fm-pill.ok{background:rgba(48,164,108,.14);color:#2b8f60}
      .fm-pill.off{background:var(--cu-bg3);color:var(--cu-t2)}
      .fm-pill.warn{background:rgba(245,166,35,.16);color:#a9720b}
      .fm-pill.bad{background:rgba(229,72,77,.14);color:#e5484d}
      .fm-tbl{width:100%;border-collapse:collapse;font-size:13px}
      .fm-tbl th{text-align:left;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--cu-t3);
        padding:8px 10px;border-bottom:1px solid var(--cu-bd);white-space:nowrap;background:var(--cu-bg2);position:sticky;top:0;z-index:1}
      .fm-tbl td{padding:9px 10px;border-bottom:1px solid var(--cu-bd);vertical-align:middle;color:var(--cu-t1)}
      .fm-tbl tr:hover td{background:var(--cu-bg3)}
      .fm-tbl .num{text-align:right;font-variant-numeric:tabular-nums}
      .fm-scroll-x{overflow-x:auto}
      .fm-name{display:flex;align-items:center;gap:9px;min-width:0}
      .fm-mark{width:28px;height:28px;border-radius:7px;background:var(--cu-accent-fog);color:var(--cu-accent-ink);
        display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px}
      .fm-trunc{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .fm-modal-bg{position:fixed;inset:0;background:rgba(15,15,20,.45);z-index:1200;display:flex;align-items:center;
        justify-content:center;padding:20px}
      .fm-modal{background:var(--cu-bg);border-radius:10px;box-shadow:var(--cu-shadow);width:100%;max-width:640px;max-height:88vh;
        display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--cu-bd)}
      .fm-modal-hd{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--cu-bd);font-weight:600;font-size:14px}
      .fm-modal-b{padding:16px;overflow:auto}
      .fm-modal-ft{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--cu-bd)}
      .fm-tplgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
      .fm-tpl{border:1px solid var(--cu-bd);border-radius:8px;padding:12px;text-align:left;background:var(--cu-bg);cursor:pointer;
        display:flex;flex-direction:column;gap:5px;color:var(--cu-t1);font:inherit}
      .fm-tpl:hover{border-color:var(--cu-accent);background:var(--cu-accent-fog)}
      .fm-tpl-t{font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:7px}
      .fm-tpl-s{font-size:11.5px;color:var(--cu-t3);line-height:1.45}
      /* builder */
      .fm-build{display:grid;grid-template-columns:186px minmax(0,1fr) 320px;gap:14px;padding:14px 18px 60px;align-items:start}
      .fm-pal{position:sticky;top:0;display:flex;flex-direction:column;gap:3px}
      .fm-pal-b{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:6px;border:1px solid transparent;
        background:transparent;color:var(--cu-t2);font:500 12.5px/1 inherit;cursor:pointer;text-align:left;width:100%}
      .fm-pal-b:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .fm-canvas{border:1px solid var(--cu-bd);border-radius:8px;background:var(--cu-bg);padding:14px;min-height:320px}
      .fm-block{border:1px solid var(--cu-bd);border-radius:7px;padding:10px 12px;margin-bottom:8px;background:var(--cu-bg);cursor:pointer;position:relative}
      .fm-block:hover{border-color:var(--cu-bd2)}
      .fm-block.sel{border-color:var(--cu-accent);box-shadow:0 0 0 2px var(--cu-accent-fog)}
      .fm-block.drag{opacity:.4}
      .fm-block-top{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--cu-t1)}
      .fm-block-tools{display:flex;gap:2px;margin-left:auto;opacity:0}
      .fm-block:hover .fm-block-tools,.fm-block.sel .fm-block-tools{opacity:1}
      .fm-badge{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;border-radius:5px;padding:2px 6px;
        background:var(--cu-bg3);color:var(--cu-t2);margin-right:5px}
      .fm-badge.map{background:var(--cu-accent-fog);color:var(--cu-accent-ink)}
      .fm-insp{border:1px solid var(--cu-bd);border-radius:8px;background:var(--cu-bg2);padding:13px;position:sticky;top:0;max-height:calc(100vh - 150px);overflow:auto}
      .fm-fld{margin-bottom:12px}
      .fm-optline{display:flex;align-items:center;gap:6px;margin-bottom:6px}
      .fm-drawer-bg{position:fixed;inset:0;background:rgba(15,15,20,.35);z-index:1150;display:flex;justify-content:flex-end}
      .fm-drawer{width:440px;max-width:100%;background:var(--cu-bg);height:100%;display:flex;flex-direction:column;box-shadow:var(--cu-shadow)}
      .fm-kv{display:grid;grid-template-columns:130px minmax(0,1fr);gap:6px 12px;font-size:13px}
      .fm-kv dt{color:var(--cu-t3);font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;font-weight:600;padding-top:2px}
      .fm-kv dd{margin:0;color:var(--cu-t1);word-break:break-word;white-space:pre-wrap}
      .fm-skel{height:38px;border-radius:6px;background:linear-gradient(90deg,var(--cu-bg3),var(--cu-bg2),var(--cu-bg3));
        background-size:200% 100%;animation:fm-sh 1.2s linear infinite;margin-bottom:8px}
      @keyframes fm-sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
      @media(max-width:1100px){.fm-build{grid-template-columns:minmax(0,1fr) 300px}
        .fm-pal{grid-column:1/-1;flex-direction:row;flex-wrap:wrap;position:static}
        .fm-pal-b{width:auto;border:1px solid var(--cu-bd)}}
      @media(max-width:820px){.fm-build{grid-template-columns:minmax(0,1fr)}
        .fm-insp{position:static;max-height:none}}
      @media(max-width:640px){.fm-wrap{padding:12px 12px 40px}.fm-hd{padding:10px 12px}.fm-tabs{padding:0 12px}.fm-build{padding:12px}}

      /* ---- the form itself (public page + preview) ------------------------ */
      .fm-surface{--fm-bg:var(--cu-bg);--fm-bg2:var(--cu-bg2);--fm-bd:var(--cu-bd);--fm-bd2:var(--cu-bd2);
        --fm-t1:var(--cu-t1);--fm-t2:var(--cu-t2);--fm-t3:var(--cu-t3);--fm-accent:var(--cu-accent);--fm-ink:#fff}
      .fm-pub{position:fixed;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;z-index:1;
        --fm-bg:#ffffff;--fm-bg2:#f5f5f7;--fm-bd:#e6e6ea;--fm-bd2:#d4d4da;--fm-t1:#18181b;--fm-t2:#55555f;--fm-t3:#87878f;
        --fm-accent:#ff00ee;--fm-ink:#fff;background:var(--fm-bg2);color:var(--fm-t1);
        font-family:Inter,-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;font-size:14px;line-height:1.5}
      .fm-pub.dark{--fm-bg:#1c1b1f;--fm-bg2:#131216;--fm-bd:#2d2c31;--fm-bd2:#3b3a40;--fm-t1:#ececef;--fm-t2:#a9a8b1;--fm-t3:#75747d}
      .fm-pub.embed{background:transparent}
      .fm-pub-in{max-width:680px;margin:0 auto;padding:26px 18px 60px}
      .fm-pub.embed .fm-pub-in{padding:12px}
      .fm-sheet{background:var(--fm-bg);border:1px solid var(--fm-bd);border-radius:14px;overflow:hidden}
      .fm-sheet-hd{padding:22px 24px 18px;border-bottom:1px solid var(--fm-bd);background:linear-gradient(180deg,var(--fm-accent-fog,rgba(255,0,238,.07)),transparent)}
      .fm-logo{height:34px;max-width:190px;object-fit:contain;display:block;margin-bottom:14px}
      .fm-logo-mark{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;
        font-weight:700;font-size:16px;margin-bottom:14px;background:var(--fm-accent);color:var(--fm-ink)}
      .fm-title{font-size:21px;font-weight:600;letter-spacing:-.01em;margin:0;color:var(--fm-t1);line-height:1.3}
      .fm-desc{margin:8px 0 0;color:var(--fm-t2);font-size:14px;white-space:pre-wrap}
      .fm-r{padding:22px 24px 26px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
      .fm-f{grid-column:1/-1;min-width:0}
      .fm-f.half{grid-column:span 1}
      .fm-lbl{display:block;font-size:13.5px;font-weight:600;color:var(--fm-t1);margin-bottom:6px}
      .fm-req{color:#e5484d;margin-left:3px}
      .fm-help{font-size:12.5px;color:var(--fm-t3);margin:-2px 0 7px;line-height:1.45}
      .fm-in{width:100%;border:1px solid var(--fm-bd2);border-radius:9px;background:var(--fm-bg);color:var(--fm-t1);
        font:400 15px/1.45 inherit;padding:11px 12px;min-height:44px}
      textarea.fm-in{min-height:110px;resize:vertical}
      .fm-in::placeholder{color:var(--fm-t3)}
      .fm-in:focus{outline:2px solid var(--fm-accent);outline-offset:1px;border-color:transparent}
      .fm-f.err .fm-in,.fm-f.err .fm-opt{border-color:#e5484d}
      .fm-ferr{display:flex;align-items:center;gap:5px;color:#e5484d;font-size:12.5px;margin-top:6px}
      .fm-opts{display:flex;flex-direction:column;gap:8px}
      .fm-opt{display:flex;align-items:center;gap:10px;border:1px solid var(--fm-bd2);border-radius:9px;padding:11px 12px;
        background:var(--fm-bg);color:var(--fm-t1);font:400 14.5px/1.3 inherit;cursor:pointer;text-align:left;width:100%;min-height:44px}
      .fm-opt:hover{border-color:var(--fm-accent)}
      .fm-opt.on{border-color:var(--fm-accent);background:var(--fm-accent-fog,rgba(255,0,238,.08));font-weight:600}
      .fm-tick{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--fm-bd2);flex-shrink:0;display:flex;
        align-items:center;justify-content:center;font-size:11px;color:var(--fm-ink)}
      .fm-tick.sq{border-radius:5px}
      .fm-opt.on .fm-tick{background:var(--fm-accent);border-color:var(--fm-accent)}
      .fm-stars{display:flex;gap:4px}
      .fm-star{width:42px;height:42px;border-radius:9px;border:1px solid var(--fm-bd2);background:var(--fm-bg);cursor:pointer;
        font-size:19px;display:flex;align-items:center;justify-content:center;color:var(--fm-t3)}
      .fm-star.on{color:#f5a623;border-color:#f5a623}
      .fm-drop{border:1.5px dashed var(--fm-bd2);border-radius:10px;padding:18px;text-align:center;color:var(--fm-t2);
        cursor:pointer;background:var(--fm-bg)}
      .fm-drop.over{border-color:var(--fm-accent);background:var(--fm-accent-fog,rgba(255,0,238,.06))}
      .fm-file{display:flex;align-items:center;gap:9px;border:1px solid var(--fm-bd);border-radius:9px;padding:9px 11px;margin-top:8px;font-size:13px}
      .fm-hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
      .fm-sub{grid-column:1/-1;display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:4px}
      .fm-subbtn{border:none;border-radius:10px;background:var(--fm-accent);color:var(--fm-ink);font:600 15px/1 inherit;
        padding:0 22px;height:46px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;min-width:150px;justify-content:center}
      .fm-subbtn:disabled{opacity:.6;cursor:not-allowed}
      .fm-note{grid-column:1/-1;border-radius:9px;padding:11px 13px;font-size:13px;background:var(--fm-bg2);color:var(--fm-t2)}
      .fm-note.bad{background:rgba(229,72,77,.12);color:#c93a3f}
      .fm-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;font-size:12px;color:var(--fm-t3)}
      .fm-foot a{color:var(--fm-t2)}
      .fm-done{padding:44px 26px;text-align:center}
      .fm-done-ic{width:56px;height:56px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;
        background:var(--fm-accent);color:var(--fm-ink);font-size:26px}
      .fm-sp{display:inline-block;animation:fm-spin .8s linear infinite}
      @keyframes fm-spin{to{transform:rotate(360deg)}}
      @media(max-width:600px){.fm-r{grid-template-columns:minmax(0,1fr);gap:16px;padding:18px 16px 22px}
        .fm-f.half{grid-column:1/-1}.fm-sheet{border-radius:12px}.fm-sheet-hd{padding:18px 16px 14px}
        .fm-pub-in{padding:14px 10px 40px}.fm-subbtn{width:100%}}
      @media(prefers-reduced-motion:reduce){.fm-skel,.fm-sp{animation:none}.fm-tpl,.fm-opt,.fm-btn{transition:none}}
      `;
      document.head.appendChild(st);
    }

    // =========================================================================
    // Field catalogue + task mapping targets
    // =========================================================================
    const FIELD_TYPES = [
      { type: 'short_text', label: 'Short text', icon: 'ti-align-left' },
      { type: 'long_text', label: 'Long text', icon: 'ti-align-justified' },
      { type: 'email', label: 'Email', icon: 'ti-mail' },
      { type: 'phone', label: 'Phone', icon: 'ti-phone' },
      { type: 'number', label: 'Number', icon: 'ti-hash' },
      { type: 'date', label: 'Date', icon: 'ti-calendar' },
      { type: 'dropdown', label: 'Dropdown', icon: 'ti-select' },
      { type: 'multi_select', label: 'Multi-select', icon: 'ti-checkbox' },
      { type: 'checkbox', label: 'Checkbox', icon: 'ti-square-check' },
      { type: 'rating', label: 'Rating', icon: 'ti-star' },
      { type: 'file', label: 'File upload', icon: 'ti-paperclip' },
      { type: 'url', label: 'Link', icon: 'ti-link' },
      { type: 'heading', label: 'Section heading', icon: 'ti-heading' },
    ];
    const TYPE_META = Object.fromEntries(FIELD_TYPES.map(t => [t.type, t]));
    const OPTION_TYPES = ['dropdown', 'multi_select'];
    const ALL_INPUT = FIELD_TYPES.map(t => t.type).filter(t => t !== 'heading');

    // to = server-side mapping key; types = field types it may be used with; unique = only one field may use it
    const MAP_TARGETS = [
      { to: 'title', label: 'Task name', icon: 'ti-file-text', unique: true, types: ['short_text', 'email', 'dropdown', 'url', 'phone', 'number', 'date'] },
      { to: 'description', label: 'Task description', icon: 'ti-align-left', unique: true, types: ['long_text', 'short_text'] },
      { to: 'due', label: 'Due date', icon: 'ti-calendar-event', unique: true, types: ['date'] },
      { to: 'priority', label: 'Priority', icon: 'ti-flag', unique: true, types: ['dropdown', 'multi_select', 'number', 'rating', 'short_text'] },
      { to: 'assignee', label: 'Assignee', icon: 'ti-user', unique: false, types: ['dropdown', 'multi_select', 'short_text', 'email'] },
      { to: 'tags', label: 'Tags', icon: 'ti-tag', unique: false, types: ['dropdown', 'multi_select', 'short_text'] },
      { to: 'client', label: 'Client (space)', icon: 'ti-building', unique: true, types: ['dropdown'] },
      { to: 'custom_field', label: 'Custom field…', icon: 'ti-list-details', unique: false, types: ALL_INPUT.filter(t => t !== 'file') },
    ];
    const mapLabel = (m) => (MAP_TARGETS.find(x => x.to === (m && m.to)) || {}).label || '';

    const COND_OPS = [
      { op: 'eq', label: 'is' }, { op: 'neq', label: 'is not' }, { op: 'contains', label: 'contains' },
      { op: 'filled', label: 'is answered' }, { op: 'empty', label: 'is empty' },
      { op: 'gt', label: 'is more than' }, { op: 'lt', label: 'is less than' },
    ];
    const NO_VALUE_OPS = ['filled', 'empty'];

    const ERR_TEXT = {
      required: 'This field is required', invalid: 'Please check this answer',
      invalid_email: 'Enter a valid email address', invalid_phone: 'Enter a valid phone number',
      invalid_url: 'Enter a valid link, e.g. https://example.com', invalid_number: 'Enter a number',
      invalid_date: 'Enter a valid date', invalid_option: 'Choose one of the options',
      out_of_range: 'Choose a value in range', too_long: 'That answer is too long',
      too_small: 'Too small', too_large: 'Too large', too_many: 'Too many selected',
      too_many_files: 'Too many files', invalid_file: 'That file could not be attached — try uploading again',
      file_too_large: 'That file is too large',
    };
    const errTextFor = (f, code) => {
      if (code === 'too_small' && f && f.min != null) return 'Enter ' + f.min + ' or more';
      if (code === 'too_large' && f && f.max != null) return 'Enter ' + f.max + ' or less';
      if (code === 'too_many_files') return 'Attach at most ' + ((f && f.max_files) || 5) + ' files';
      if (code === 'file_too_large') return 'Each file must be under ' + ((f && f.max_mb) || 10) + ' MB';
      return ERR_TEXT[code] || ERR_TEXT.invalid;
    };

    // =========================================================================
    // Small helpers
    // =========================================================================
    const uuid = () => {
      try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) { }
      const b = new Uint8Array(16);
      try { crypto.getRandomValues(b); } catch (_) { for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      const s = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
      return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20);
    };
    const rand = (n) => Math.random().toString(36).slice(2, 2 + n);
    const slugId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || ('o_' + rand(5));
    const filled = (v) => !(v === null || v === undefined || v === false || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const ls = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
    const lset = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { } };
    // Theme preference as it was BEFORE index.html's App effect normalises it (child effects run first).
    const THEME_AT_BOOT = ls('ams_theme');

    function newFieldKey(type, existing) {
      const base = (type === 'long_text' ? 'text' : type).split('_')[0].slice(0, 8);
      let k;
      do { k = base + '_' + rand(4); } while (existing.includes(k));
      return k;
    }
    const optsOf = (list) => arr(list).map(o => (typeof o === 'string' ? { id: slugId(o), label: o } : { ...o, id: o.id || slugId(o.label) }));

    // Conditional visibility — mirrors _form_cond_ok / _form_validate in 098.
    function condOk(val, op, want) {
      want = want === null || want === undefined ? '' : String(want);
      if (op === 'filled') return filled(val);
      if (op === 'empty') return !filled(val);
      if (Array.isArray(val)) {
        const hit = val.some(x => String(x).toLowerCase() === want.toLowerCase());
        if (op === 'eq' || op === 'contains') return hit;
        if (op === 'neq') return !hit;
        return false;
      }
      const t = val === null || val === undefined ? '' : String(val).toLowerCase();
      if (op === 'eq') return filled(val) && t === want.toLowerCase();
      if (op === 'neq') return t !== want.toLowerCase();
      if (op === 'contains') return want !== '' && t.indexOf(want.toLowerCase()) >= 0;
      if (op === 'gt' || op === 'lt') {
        const a = Number(val), b = Number(want);
        if (val === '' || isNaN(a) || isNaN(b)) return false;
        return op === 'gt' ? a > b : a < b;
      }
      return true;
    }
    function hiddenKeys(fields, values) {
      const hidden = new Set();
      arr(fields).forEach(f => {
        const conds = arr(f.show_if);
        if (!conds.length) return;
        const ok = conds.every(c => condOk(hidden.has(c.field) ? null : values[c.field], c.op || 'eq', c.value));
        if (!ok) hidden.add(f.key);
      });
      return hidden;
    }

    // Client-side validation — same codes as the server, so messages match either way.
    function validateAll(fields, values, hidden) {
      const out = {};
      arr(fields).forEach(f => {
        if (f.type === 'heading' || hidden.has(f.key)) return;
        const v = values[f.key];
        if (!filled(v)) { if (f.required) out[f.key] = 'required'; return; }
        const s = typeof v === 'string' ? v.trim() : v;
        switch (f.type) {
          case 'short_text': if (String(s).length > 500) out[f.key] = 'too_long'; break;
          case 'long_text': if (String(s).length > 10000) out[f.key] = 'too_long'; break;
          case 'email': if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s))) out[f.key] = 'invalid_email'; break;
          case 'phone': if (!/^[0-9+()\s.-]{7,25}$/.test(String(s)) || String(s).replace(/[^0-9]/g, '').length < 7) out[f.key] = 'invalid_phone'; break;
          case 'url': {
            let u = String(s);
            if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/\S*)?$/i.test(u)) u = 'https://' + u;
            if (!/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(u)) out[f.key] = 'invalid_url';
            break;
          }
          case 'number': {
            const n = Number(s);
            if (isNaN(n)) out[f.key] = 'invalid_number';
            else if (f.min != null && n < Number(f.min)) out[f.key] = 'too_small';
            else if (f.max != null && n > Number(f.max)) out[f.key] = 'too_large';
            break;
          }
          case 'rating': {
            const n = Number(s), max = Number(f.max) || 5;
            if (!n || n < 1 || n > max || n !== Math.round(n)) out[f.key] = 'out_of_range';
            break;
          }
          case 'date': if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) out[f.key] = 'invalid_date'; break;
          case 'dropdown': if (!arr(f.options).some(o => o.id === s)) out[f.key] = 'invalid_option'; break;
          case 'multi_select': {
            const ids = arr(s);
            if (ids.some(x => !arr(f.options).some(o => o.id === x))) out[f.key] = 'invalid_option';
            else if (f.max != null && ids.length > Number(f.max)) out[f.key] = 'too_many';
            break;
          }
          case 'file': {
            const items = arr(s);
            if (items.length > (Number(f.max_files) || 5)) out[f.key] = 'too_many_files';
            else if (items.some(x => !x || !x.url || !x.path)) out[f.key] = 'invalid_file';
            break;
          }
          default: break;
        }
      });
      return out;
    }

    // Answer → readable text (mirrors _form_display, used by the responses table + CSV)
    function displayValue(f, v) {
      if (v === undefined || v === null || v === '') return f && f.type === 'checkbox' && v === false ? 'No' : '';
      switch (f.type) {
        case 'dropdown': return (arr(f.options).find(o => o.id === v) || {}).label || String(v);
        case 'multi_select': return arr(v).map(id => (arr(f.options).find(o => o.id === id) || {}).label || id).join(', ');
        case 'checkbox': return v === true || v === 'true' ? 'Yes' : 'No';
        case 'rating': return v + '/' + (Number(f.max) || 5);
        case 'file': return arr(v).map(x => x && x.name).filter(Boolean).join(', ');
        case 'date': { const d = new Date(v + 'T00:00:00'); return isNaN(d) ? String(v) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
        default: return String(v);
      }
    }

    const FILE_ACCEPT = {
      images: 'image/*',
      documents: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,application/pdf',
      media: 'image/*,video/*,audio/*',
      any: undefined,
    };
    const fmtBytes = (n) => {
      const b = Number(n) || 0;
      if (b < 1024) return b + ' B';
      if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
      return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
    };
    const fmtStamp = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d)) return '';
      return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });
    };

    // Storage: bucket `form-uploads`, path "<form id>/<uuid>/<file name>" (the anon
    // INSERT policy in 098 accepts exactly that shape for an open form with a file field).
    async function uploadFormFile(formId, file) {
      const safe = String(file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(-120) || 'file';
      const path = formId + '/' + uuid() + '/' + safe;
      const { error } = await supabase.storage.from('form-uploads').upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw new Error(error.message || 'Upload failed');
      const { data } = supabase.storage.from('form-uploads').getPublicUrl(path);
      return { name: String(file.name || safe).slice(0, 200), path, url: data && data.publicUrl, size: file.size || 0, mime: file.type || '' };
    }

    const appBase = () => {
      try { return location.origin + location.pathname.replace(/index\.html?$/i, ''); } catch (_) { return '/'; }
    };
    const publicUrl = (slug) => appBase() + '?form=' + encodeURIComponent(slug || '');
    const embedCode = (slug) => '<iframe src="' + publicUrl(slug) + '&embed=1" title="Form" ' +
      'style="width:100%;min-height:760px;border:0" loading="lazy"></iframe>';

    const copyText = async (txt) => {
      try { await navigator.clipboard.writeText(txt); return true; } catch (_) { }
      try {
        const ta = document.createElement('textarea');
        ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        return true;
      } catch (_) { return false; }
    };

    function errText(e) {
      if (!e) return 'Something went wrong';
      if (isMissingRpc(e)) return 'Forms need database migration 098 — ask an admin to apply it';
      const m = String((e && (e.message || e.details)) || e).toLowerCase();
      if (m.indexOf('forbidden') >= 0) return 'You do not have permission to do that';
      if (m.indexOf('slug_taken') >= 0) return 'That link is already used by another form';
      if (m.indexOf('bad_slug') >= 0) return 'Links use lowercase letters, numbers and dashes (4–64 characters)';
      if (m.indexOf('bad_list') >= 0) return 'Pick a regular task list (not a content calendar or a personal list)';
      if (m.indexOf('bad_client') >= 0) return 'That client is not available';
      if (m.indexOf('bad_owner') >= 0) return 'That person cannot own a form';
      if (m.indexOf('bad_name') >= 0) return 'Give the form a name';
      if (m.indexOf('not_found') >= 0) return 'That form no longer exists';
      if (m.indexOf('settings_too_large') >= 0) return 'These settings are too large to save';
      return (e && e.message) || 'Something went wrong';
    }

    // =========================================================================
    // API
    // =========================================================================
    const formsBus = { fire: () => { try { window.dispatchEvent(new CustomEvent('ams-forms-changed')); } catch (_) { } } };
    const FormsAPI = {
      list: () => rpcCall('forms_list'),
      get: (id) => rpcCall('form_get', { p_id: id }),
      async upsert(data) { const r = await rpcCall('form_upsert', { p_data: data || {} }); formsBus.fire(); return r; },
      async remove(id) { const r = await rpcCall('form_delete', { p_id: id }); formsBus.fire(); return r; },
      async duplicate(id) { const r = await rpcCall('form_duplicate', { p_id: id }); formsBus.fire(); return r; },
      submissions: (formId, filter) => rpcCall('form_submissions_list', { p_form_id: formId, p_filter: filter || {} }),
      deleteSubmission: (id) => rpcCall('form_submission_delete', { p_id: id }),
      createTaskFor: (id) => rpcCall('form_submission_create_task', { p_id: id }),
      publicGet: async (slug) => {
        const { data, error } = await supabase.rpc('form_public_get', { p_slug: slug });
        if (error) throw error;
        return data;
      },
      publicSubmit: async (slug, payload, meta) => {
        const { data, error } = await supabase.rpc('form_public_submit', { p_slug: slug, p_data: payload, p_meta: meta || {} });
        if (error) throw error;
        return data;
      },
    };

    // =========================================================================
    // FormRenderer — the form itself. Used by the public page and by Preview.
    // Pure: no store, no session, no dashboard chrome.
    // =========================================================================
    function FieldInput({ f, value, onChange, error, formId, preview, onBusy, onToast }) {
      const id = 'fmf-' + f.key;
      const common = {
        id, class: 'fm-in', value: value === undefined || value === null ? '' : value,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': (f.help ? id + '-h ' : '') + (error ? id + '-e' : '') || undefined,
        placeholder: f.placeholder || undefined,
      };
      const set = (v) => onChange(v);

      if (f.type === 'long_text') {
        return h`<textarea ...${common} rows=${5} maxLength=${10000} onInput=${e => set(e.target.value)}></textarea>`;
      }
      if (f.type === 'short_text' || f.type === 'email' || f.type === 'phone' || f.type === 'url' || f.type === 'number' || f.type === 'date') {
        const t = f.type === 'short_text' ? 'text' : f.type === 'phone' ? 'tel' : f.type;
        const extra = {};
        if (f.type === 'number') { if (f.min != null) extra.min = f.min; if (f.max != null) extra.max = f.max; extra.inputMode = 'decimal'; }
        if (f.type === 'email') { extra.autoComplete = 'email'; extra.inputMode = 'email'; }
        if (f.type === 'phone') { extra.autoComplete = 'tel'; extra.inputMode = 'tel'; }
        if (f.type === 'url') { extra.inputMode = 'url'; }
        if (f.type === 'short_text') extra.maxLength = 500;
        return h`<input ...${common} ...${extra} type=${t} onInput=${e => set(e.target.value)}/>`;
      }
      if (f.type === 'dropdown') {
        const opts = arr(f.options);
        if (opts.length > 6) {
          return h`<select ...${common} class="fm-in" onChange=${e => set(e.target.value || null)}>
            <option value="">${f.placeholder || 'Choose…'}</option>
            ${opts.map(o => h`<option key=${o.id} value=${o.id}>${o.label}</option>`)}
          </select>`;
        }
        return h`<div class="fm-opts" role="radiogroup" aria-labelledby=${id + '-l'}>
          ${opts.map(o => h`<button key=${o.id} type="button" role="radio" aria-checked=${value === o.id}
            class=${'fm-opt' + (value === o.id ? ' on' : '')}
            onClick=${() => set(value === o.id && !f.required ? null : o.id)}>
            <span class="fm-tick">${value === o.id ? h`<i class="ti ti-check"></i>` : null}</span>
            <span class="fm-trunc" style=${{ whiteSpace: 'normal' }}>${o.label}</span>
          </button>`)}
        </div>`;
      }
      if (f.type === 'multi_select') {
        const ids = arr(value);
        return h`<div class="fm-opts" role="group" aria-labelledby=${id + '-l'}>
          ${arr(f.options).map(o => {
            const on = ids.indexOf(o.id) >= 0;
            return h`<button key=${o.id} type="button" aria-pressed=${on} class=${'fm-opt' + (on ? ' on' : '')}
              onClick=${() => set(on ? ids.filter(x => x !== o.id) : ids.concat([o.id]))}>
              <span class="fm-tick sq">${on ? h`<i class="ti ti-check"></i>` : null}</span>
              <span class="fm-trunc" style=${{ whiteSpace: 'normal' }}>${o.label}</span>
            </button>`;
          })}
        </div>`;
      }
      if (f.type === 'checkbox') {
        return h`<button type="button" role="checkbox" aria-checked=${value === true} id=${id}
          class=${'fm-opt' + (value === true ? ' on' : '')} onClick=${() => set(value === true ? false : true)}>
          <span class="fm-tick sq">${value === true ? h`<i class="ti ti-check"></i>` : null}</span>
          <span style=${{ whiteSpace: 'normal' }}>${f.placeholder || 'Yes'}</span>
        </button>`;
      }
      if (f.type === 'rating') {
        const max = Math.min(Math.max(Number(f.max) || 5, 2), 10);
        const n = Number(value) || 0;
        return h`<div class="fm-stars" role="radiogroup" aria-labelledby=${id + '-l'}>
          ${Array.from({ length: max }, (_, i) => i + 1).map(i => h`<button key=${i} type="button" role="radio"
            aria-checked=${i === n} aria-label=${i + (i === 1 ? ' star' : ' stars')}
            class=${'fm-star' + (i <= n ? ' on' : '')} onClick=${() => set(i === n ? null : i)}>
            <i class=${'ti ' + (i <= n ? 'ti-star-filled' : 'ti-star')}></i>
          </button>`)}
        </div>`;
      }
      if (f.type === 'file') {
        return h`<${FileField} f=${f} value=${value} onChange=${set} formId=${formId} preview=${preview}
          onBusy=${onBusy} onToast=${onToast} id=${id}/>`;
      }
      return null;
    }

    function FileField({ f, value, onChange, formId, preview, onBusy, onToast, id }) {
      const items = arr(value);
      const [pending, setPending] = useState([]);
      const [over, setOver] = useState(false);
      const inRef = useRef(null);
      const maxFiles = Number(f.max_files) || 5;
      const maxMb = Number(f.max_mb) || 10;

      useEffect(() => { if (onBusy) onBusy(f.key, pending.length > 0); }, [pending.length]);

      const add = async (fileList) => {
        const files = Array.from(fileList || []);
        for (const file of files) {
          if (items.length + pending.length >= maxFiles) { onToast && onToast('You can attach at most ' + maxFiles + ' files'); break; }
          if (file.size > maxMb * 1048576) { onToast && onToast('"' + file.name + '" is larger than ' + maxMb + ' MB'); continue; }
          const tmp = { id: uuid(), name: file.name, size: file.size };
          setPending(p => p.concat([tmp]));
          try {
            const meta = preview
              ? { name: file.name, path: 'preview/' + tmp.id + '/' + file.name, url: 'about:blank', size: file.size, mime: file.type || '' }
              : await uploadFormFile(formId, file);
            onChange(arr(value).concat([meta]));
          } catch (e) {
            onToast && onToast('Could not upload "' + file.name + '" — ' + ((e && e.message) || 'try again'));
          } finally {
            setPending(p => p.filter(x => x.id !== tmp.id));
          }
        }
        if (inRef.current) inRef.current.value = '';
      };

      return h`<div>
        <div class=${'fm-drop' + (over ? ' over' : '')} role="button" tabIndex=${0} id=${id}
          onClick=${() => inRef.current && inRef.current.click()}
          onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inRef.current && inRef.current.click(); } }}
          onDragOver=${e => { e.preventDefault(); setOver(true); }}
          onDragLeave=${() => setOver(false)}
          onDrop=${e => { e.preventDefault(); setOver(false); add(e.dataTransfer && e.dataTransfer.files); }}>
          <i class="ti ti-cloud-upload" style=${{ fontSize: 20, display: 'block', marginBottom: 6 }}></i>
          <div style=${{ fontSize: 13.5, fontWeight: 600 }}>Choose files or drop them here</div>
          <div style=${{ fontSize: 12, marginTop: 3, opacity: .8 }}>Up to ${maxFiles} ${maxFiles === 1 ? 'file' : 'files'}, ${maxMb} MB each</div>
        </div>
        <input ref=${inRef} type="file" multiple=${maxFiles > 1} accept=${FILE_ACCEPT[f.accept || 'any']}
          style=${{ display: 'none' }} onChange=${e => add(e.target.files)}/>
        ${items.map((it, i) => h`<div class="fm-file" key=${it.path || i}>
          <i class="ti ti-file"></i>
          <span class="fm-trunc" style=${{ flex: 1 }}>${it.name}</span>
          <span style=${{ color: 'var(--fm-t3)', fontSize: 12 }}>${fmtBytes(it.size)}</span>
          <button type="button" class="fm-ibtn" aria-label=${'Remove ' + it.name}
            onClick=${() => onChange(items.filter((_, j) => j !== i))}><i class="ti ti-x"></i></button>
        </div>`)}
        ${pending.map(p => h`<div class="fm-file" key=${p.id}>
          <i class="ti ti-loader-2 fm-sp"></i>
          <span class="fm-trunc" style=${{ flex: 1 }}>${p.name}</span>
          <span style=${{ color: 'var(--fm-t3)', fontSize: 12 }}>Uploading…</span>
        </div>`)}
      </div>`;
    }

    function FormRenderer({ form, preview, onSubmit, submitting, serverErrors, notice, noticeTone, onToast }) {
      const fields = arr(form && form.fields);
      const [values, setValues] = useState({});
      const [errors, setErrors] = useState({});
      const [busy, setBusy] = useState({});
      const hpRef = useRef(null);

      useEffect(() => { if (serverErrors && Object.keys(serverErrors).length) setErrors(serverErrors); }, [serverErrors]);
      useEffect(() => {
        if (!serverErrors) return;
        const first = fields.find(f => serverErrors[f.key]);
        if (first) { const el = document.getElementById('fmf-' + first.key); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' }); }
      }, [serverErrors]);

      const hidden = useMemo(() => hiddenKeys(fields, values), [fields, values]);
      const uploading = Object.keys(busy).some(k => busy[k]);
      const set = (k, v) => {
        setValues(p => { const n = { ...p, [k]: v }; return n; });
        setErrors(e => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });
      };
      const onBusy = useCallback((k, on) => setBusy(p => (p[k] === on ? p : { ...p, [k]: on })), []);

      const submit = (e) => {
        e.preventDefault();
        if (submitting || uploading) return;
        const errs = validateAll(fields, values, hidden);
        setErrors(errs);
        const firstBad = fields.find(f => errs[f.key]);
        if (firstBad) {
          const el = document.getElementById('fmf-' + firstBad.key);
          if (el) { if (el.scrollIntoView) el.scrollIntoView({ block: 'center' }); if (el.focus) { try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); } } }
          return;
        }
        const payload = {};
        fields.forEach(f => {
          if (f.type === 'heading' || hidden.has(f.key)) return;
          const v = values[f.key];
          if (filled(v) || (f.type === 'checkbox' && v === false)) payload[f.key] = typeof v === 'string' ? v.trim() : v;
        });
        onSubmit(payload, { hp: hpRef.current ? hpRef.current.value : '' });
      };

      return h`<form class="fm-r" noValidate onSubmit=${submit}>
        ${fields.map(f => {
          if (hidden.has(f.key)) return null;
          if (f.type === 'heading') {
            return h`<div class="fm-f" key=${f.key} style=${{ marginTop: 6 }}>
              <div style=${{ fontSize: 15.5, fontWeight: 600, color: 'var(--fm-t1)' }}>${f.label}</div>
              ${f.help ? h`<div class="fm-help" style=${{ margin: '5px 0 0' }}>${f.help}</div>` : null}
              <div style=${{ height: 1, background: 'var(--fm-bd)', marginTop: 10 }}></div>
            </div>`;
          }
          const err = errors[f.key];
          return h`<div class=${'fm-f' + (f.width === 'half' ? ' half' : '') + (err ? ' err' : '')} key=${f.key}>
            <label class="fm-lbl" id=${'fmf-' + f.key + '-l'} for=${'fmf-' + f.key}>
              ${f.label}${f.required ? h`<span class="fm-req" aria-hidden="true">*</span>` : null}
            </label>
            ${f.help ? h`<div class="fm-help" id=${'fmf-' + f.key + '-h'}>${f.help}</div>` : null}
            <${FieldInput} f=${f} value=${values[f.key]} onChange=${v => set(f.key, v)} error=${err}
              formId=${form.id} preview=${preview} onBusy=${onBusy} onToast=${onToast}/>
            ${err ? h`<div class="fm-ferr" id=${'fmf-' + f.key + '-e'} role="alert">
              <i class="ti ti-alert-circle" style=${{ fontSize: 14 }}></i>${errTextFor(f, err)}
            </div>` : null}
          </div>`;
        })}

        <div class="fm-hp" aria-hidden="true">
          <label>Website<input ref=${hpRef} type="text" name="website" tabIndex=${-1} autoComplete="off"/></label>
        </div>

        ${notice ? h`<div class=${'fm-note' + (noticeTone === 'bad' ? ' bad' : '')} role="status">${notice}</div>` : null}

        <div class="fm-sub">
          <button type="submit" class="fm-subbtn" disabled=${!!submitting || uploading}>
            ${submitting ? h`<i class="ti ti-loader-2 fm-sp"></i>` : null}
            ${submitting ? 'Sending…' : uploading ? 'Uploading…' : (form.submit_label || 'Submit')}
          </button>
          ${fields.some(f => f.required && !hidden.has(f.key))
            ? h`<span style=${{ fontSize: 12, color: 'var(--fm-t3)' }}>${'* required'}</span>` : null}
        </div>
      </form>`;
    }

    // =========================================================================
    // PublicFormPage — …/app/?form=<slug>. Standalone: no session, no shell.
    // =========================================================================
    const readableInk = (hex) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
      if (!m) return '#fff';
      const n = parseInt(m[1], 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.45 ? '#1b1b1f' : '#ffffff';
    };
    const hexA = (hex, a) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
      if (!m) return 'rgba(255,0,238,' + a + ')';
      const n = parseInt(m[1], 16);
      return 'rgba(' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',') + ',' + a + ')';
    };

    function PublicShell({ dark, setDark, embed, branding, children, footerNote }) {
      const b = branding || {};
      const accent = b.color || '#ff00ee';
      const vars = { '--fm-accent': accent, '--fm-ink': readableInk(accent), '--fm-accent-fog': hexA(accent, dark ? 0.16 : 0.09) };
      return h`<div class=${'fm-pub' + (dark ? ' dark' : '') + (embed ? ' embed' : '')} style=${vars}>
        <div class="fm-pub-in">
          ${children}
          ${embed ? null : h`<div class="fm-foot">
            <span>${b.hide_powered_by ? (footerNote || '') : 'Powered by ' + (b.app_name || 'My Digital Sevak')}</span>
            <button type="button" class="fm-ibtn" aria-label=${dark ? 'Switch to light theme' : 'Switch to dark theme'}
              style=${{ color: 'var(--fm-t3)' }} onClick=${() => setDark(!dark)}>
              <i class=${'ti ' + (dark ? 'ti-sun' : 'ti-moon')}></i>
            </button>
          </div>`}
        </div>
      </div>`;
    }

    function PublicFormPage({ slug: slugProp }) {
      const q = useMemo(() => { try { return new URLSearchParams(location.search); } catch (_) { return new URLSearchParams(''); } }, []);
      const slug = slugProp || q.get('form') || '';
      const embed = q.get('embed') === '1';
      const [state, setState] = useState({ loading: true });
      const [done, setDone] = useState(null);
      const [submitting, setSubmitting] = useState(false);
      const [serverErrors, setServerErrors] = useState(null);
      const [notice, setNotice] = useState('');
      const [noticeTone, setNoticeTone] = useState('');
      const [nonce, setNonce] = useState(0);
      const openedAt = useRef(Date.now());
      const [dark, setDark] = useState(() => {
        const own = ls('ams_form_theme');
        if (own) return own === 'dark';
        if (THEME_AT_BOOT === 'dark') return true;
        if (THEME_AT_BOOT === 'light') return false;
        try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) { return false; }
      });
      const setDarkPersist = (v) => { setDark(v); lset('ams_form_theme', v ? 'dark' : 'light'); };

      const load = useCallback(async () => {
        setState(s => ({ ...s, loading: true }));
        try {
          const res = await FormsAPI.publicGet(slug);
          openedAt.current = Date.now();
          if (!res || res.ok !== true) setState({ loading: false, error: (res && res.error) || 'not_found', form: (res && res.form) || null });
          else setState({ loading: false, form: res.form });
        } catch (e) {
          setState({ loading: false, error: isMissingRpc(e) ? 'unavailable' : 'network' });
        }
      }, [slug]);

      useEffect(() => { load(); }, [load]);
      useEffect(() => {
        const f = state.form;
        if (!f || !f.name) return;
        const prev = document.title;
        document.title = f.name;
        return () => { document.title = prev; };
      }, [state.form && state.form.name]);

      const submit = async (payload, extra) => {
        const form = state.form;
        setSubmitting(true); setServerErrors(null); setNotice(''); setNoticeTone('');
        try {
          // Humans normally take a few seconds; wait out the form's minimum so a
          // genuinely quick fill is never scored as spam by the server's time check.
          const minMs = ((Number(form.min_seconds) || 3) + 0.4) * 1000;
          const wait = openedAt.current + minMs - Date.now();
          if (wait > 0) await sleep(wait);
          let meta = {
            token: form.token, hp: extra && extra.hp,
            ua: String(navigator.userAgent || '').slice(0, 300),
            referrer: String(document.referrer || '').slice(0, 500),
            embed: embed ? 'true' : undefined,
          };
          const utm = {};
          ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(k => { const v = q.get(k); if (v) utm[k] = String(v).slice(0, 100); });
          if (Object.keys(utm).length) meta.utm = utm;

          let res = await FormsAPI.publicSubmit(slug, payload, meta);
          if (res && res.ok !== true && res.error === 'expired') {
            // The page sat open too long (or the form was re-saved) — refresh the token and retry once.
            const again = await FormsAPI.publicGet(slug);
            if (again && again.ok === true) {
              openedAt.current = Date.now();
              setState({ loading: false, form: again.form });
              await sleep(((Number(again.form.min_seconds) || 3) + 0.4) * 1000);
              res = await FormsAPI.publicSubmit(slug, payload, { ...meta, token: again.form.token });
            }
          }
          if (!res || res.ok !== true) {
            const code = (res && res.error) || 'network';
            if (code === 'validation') { setServerErrors(res.field_errors || {}); setNotice('Please check the highlighted answers.'); setNoticeTone('bad'); }
            else if (code === 'rate_limited') { setNotice('Too many submissions from your network just now. Please try again in a few minutes.'); setNoticeTone('bad'); }
            else if (code === 'closed' || code === 'limit_reached' || code === 'not_found' || code === 'login_required') { setState({ loading: false, error: code, form: state.form }); }
            else { setNotice('We could not send that — please try again.'); setNoticeTone('bad'); }
            return;
          }
          const conf = res.confirmation || {};
          setDone({ ...conf, reference: res.reference });
          if (conf.mode === 'redirect' && conf.redirect_url) {
            setTimeout(() => {
              try { (window.top || window).location.href = conf.redirect_url; }
              catch (_) { window.location.href = conf.redirect_url; }
            }, 1200);
          }
        } catch (e) {
          setNotice(isMissingRpc(e) ? 'This form is not available yet.' : 'We could not send that — please check your connection and try again.');
          setNoticeTone('bad');
        } finally { setSubmitting(false); }
      };

      const branding = (state.form && state.form.branding) || {};
      const shell = (children, note) => h`<${PublicShell} dark=${dark} setDark=${setDarkPersist} embed=${embed}
        branding=${branding} footerNote=${note}>${children}<//>`;

      if (state.loading) {
        return shell(h`<div class="fm-sheet"><div class="fm-sheet-hd">
          <div class="fm-skel" style=${{ width: 160, height: 26 }}></div>
          <div class="fm-skel" style=${{ width: '70%', height: 14 }}></div>
        </div><div style=${{ padding: 24 }}>
          ${[1, 2, 3].map(i => h`<div key=${i} class="fm-skel" style=${{ height: 54 }}></div>`)}
        </div></div>`);
      }

      if (state.error) {
        const e = state.error;
        const title = e === 'closed' ? 'This form is closed'
          : e === 'limit_reached' ? 'This form is full'
            : e === 'login_required' ? 'Team members only'
              : e === 'unavailable' ? 'Not available yet'
                : e === 'network' ? 'Could not load the form'
                  : 'Form not found';
        const body = e === 'closed' ? ((state.form && state.form.closed_message) || 'It is not accepting new responses right now.')
          : e === 'limit_reached' ? 'It has reached the maximum number of responses.'
            : e === 'login_required' ? 'Sign in to your workspace in another tab, then reload this page.'
              : e === 'unavailable' ? 'This form has not been set up yet. Please check back shortly.'
                : e === 'network' ? 'Please check your connection and try again.'
                  : 'The link may be wrong, or the form may have been deleted.';
        return shell(h`<div class="fm-sheet"><div class="fm-done">
          <div class="fm-done-ic" style=${{ background: 'var(--fm-bg2)', color: 'var(--fm-t2)' }}>
            <i class=${'ti ' + (e === 'login_required' ? 'ti-lock' : 'ti-info-circle')}></i>
          </div>
          <h1 class="fm-title">${title}</h1>
          <p class="fm-desc" style=${{ marginTop: 8 }}>${body}</p>
          <div style=${{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            ${e === 'login_required' ? h`<a class="fm-subbtn" style=${{ textDecoration: 'none' }} href=${appBase()} target="_blank" rel="noopener">Open sign-in</a>` : null}
            <button type="button" class="fm-subbtn" style=${e === 'login_required' ? { background: 'var(--fm-bg2)', color: 'var(--fm-t1)' } : null}
              onClick=${load}>Reload</button>
          </div>
        </div></div>`);
      }

      const form = state.form || {};
      if (done) {
        const redirecting = done.mode === 'redirect' && done.redirect_url;
        return shell(h`<div class="fm-sheet"><div class="fm-done">
          <div class="fm-done-ic"><i class=${'ti ' + (redirecting ? 'ti-arrow-right' : 'ti-check')}></i></div>
          <h1 class="fm-title">${done.title || (redirecting ? 'Taking you there…' : 'Thanks — we have got it')}</h1>
          <p class="fm-desc" style=${{ marginTop: 8 }}>
            ${done.message || (redirecting ? 'One moment.' : 'Your request has reached the team. We will be in touch shortly.')}
          </p>
          ${done.reference ? h`<p style=${{ marginTop: 14, fontSize: 12.5, color: 'var(--fm-t3)' }}>
            Reference ${done.reference}</p>` : null}
          ${redirecting ? h`<p style=${{ marginTop: 14, fontSize: 12.5 }}>
            <a href=${done.redirect_url} style=${{ color: 'var(--fm-t2)' }}>Continue</a></p>` : null}
          ${!redirecting && done.allow_another !== false ? h`<div style=${{ marginTop: 20 }}>
            <button type="button" class="fm-subbtn" style=${{ background: 'var(--fm-bg2)', color: 'var(--fm-t1)' }}
              onClick=${async () => { setDone(null); setNonce(n => n + 1); await load(); }}>Submit another response</button>
          </div>` : null}
        </div></div>`);
      }

      return shell(h`<div class="fm-sheet">
        <div class="fm-sheet-hd">
          ${branding.logo_url
            ? h`<img class="fm-logo" src=${branding.logo_url} alt=${branding.app_name || ''}/>`
            : h`<div class="fm-logo-mark">${String(branding.app_name || 'A').slice(0, 1).toUpperCase()}</div>`}
          <h1 class="fm-title">${form.name}</h1>
          ${form.description ? h`<p class="fm-desc">${form.description}</p>` : null}
          ${form.me ? h`<p style=${{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--fm-t3)' }}>
            <i class="ti ti-user" style=${{ marginRight: 4 }}></i>Submitting as ${form.me.name}</p>` : null}
        </div>
        <${FormRenderer} key=${nonce} form=${form} onSubmit=${submit} submitting=${submitting}
          serverErrors=${serverErrors} notice=${notice} noticeTone=${noticeTone}
          onToast=${(m) => { setNotice(m); setNoticeTone('bad'); }}/>
      </div>`);
    }

    // =========================================================================
    // Templates (§4 H) — Content request · Ad brief · Website change request ·
    // Feedback · Leave request (internal), plus a blank starter.
    // =========================================================================
    const FORM_TEMPLATES = [
      {
        key: 'blank', name: 'Blank form', icon: 'ti-file-plus', desc: 'Start from scratch with name, email and a message.',
        fields: [
          { key: 'name', type: 'short_text', label: 'Your name', required: true, width: 'half', map: { to: 'title' } },
          { key: 'email', type: 'email', label: 'Email', required: true, width: 'half' },
          { key: 'message', type: 'long_text', label: 'How can we help?', required: true, map: { to: 'description' } },
        ],
        settings: { title_template: '{{form}}: {{name}}' },
      },
      {
        key: 'content_request', name: 'Content request', icon: 'ti-photo', desc: 'Brands ask for a reel, post or carousel — lands as a request task on the client.',
        fields: [
          { key: 'name', type: 'short_text', label: 'Your name', required: true, width: 'half' },
          { key: 'email', type: 'email', label: 'Email', required: true, width: 'half' },
          { key: 'brand', type: 'short_text', label: 'Brand / company', required: true },
          { key: 'content_type', type: 'dropdown', label: 'What do you need?', required: true, options: optsOf(['Reel', 'Static post', 'Carousel', 'Story', 'Blog article', 'Something else']) },
          { key: 'platforms', type: 'multi_select', label: 'Where will it run?', options: optsOf(['Instagram', 'Facebook', 'LinkedIn', 'YouTube', 'X (Twitter)']), map: { to: 'tags' } },
          { key: 'reel_length', type: 'dropdown', label: 'Reel length', options: optsOf(['15 seconds', '30 seconds', '60 seconds', '90 seconds']), show_if: [{ field: 'content_type', op: 'eq', value: 'reel' }] },
          { key: 'brief', type: 'long_text', label: 'Brief', required: true, help: 'What should it say or show? Include the key message, any offer, and the call to action.', map: { to: 'description' } },
          { key: 'reference', type: 'url', label: 'Reference link', placeholder: 'https://' },
          { key: 'assets', type: 'file', label: 'Logos, photos or footage', max_files: 5, max_mb: 25, accept: 'any' },
          { key: 'needed_by', type: 'date', label: 'Needed by', width: 'half', map: { to: 'due' } },
          {
            key: 'urgency', type: 'dropdown', label: 'Priority', width: 'half', map: { to: 'priority' },
            options: [{ id: 'urgent', label: 'Urgent', priority: 1 }, { id: 'high', label: 'High', priority: 2 }, { id: 'normal', label: 'Normal', priority: 3 }, { id: 'low', label: 'Low', priority: 4 }],
          },
        ],
        settings: {
          title_template: '{{content_type}} for {{brand}}', defaults: { due_days: 3 },
          confirmation: { mode: 'message', title: 'Request received', message: 'Thanks! Our team will review this and come back to you within one working day.' },
        },
      },
      {
        key: 'ad_brief', name: 'Ad brief', icon: 'ti-target-arrow', desc: 'Objective, budget, audience and creatives for a new campaign.',
        fields: [
          { key: 'name', type: 'short_text', label: 'Your name', required: true, width: 'half' },
          { key: 'email', type: 'email', label: 'Email', required: true, width: 'half' },
          { key: 'brand', type: 'short_text', label: 'Brand / company', required: true },
          { key: 'objective', type: 'dropdown', label: 'Campaign objective', required: true, options: optsOf(['Brand awareness', 'Website traffic', 'Leads', 'Sales / conversions', 'App installs', 'Video views']) },
          { key: 'platforms', type: 'multi_select', label: 'Platforms', options: optsOf(['Meta (Facebook & Instagram)', 'Google Search', 'YouTube', 'LinkedIn']), map: { to: 'tags' } },
          { key: 'budget', type: 'number', label: 'Monthly ad budget (₹)', min: 0, width: 'half' },
          { key: 'launch_date', type: 'date', label: 'Planned launch', width: 'half', map: { to: 'due' } },
          { key: 'audience', type: 'long_text', label: 'Target audience', help: 'Age, cities, interests, the kind of customer you want.' },
          { key: 'offer', type: 'long_text', label: 'Offer and key message', required: true, map: { to: 'description' } },
          { key: 'landing_page', type: 'url', label: 'Landing page', placeholder: 'https://' },
          { key: 'has_creatives', type: 'dropdown', label: 'Do you have creatives ready?', options: optsOf(['Yes', 'No — please create them']) },
          { key: 'creatives', type: 'file', label: 'Upload creatives', max_files: 8, max_mb: 25, accept: 'media', show_if: [{ field: 'has_creatives', op: 'eq', value: 'yes' }] },
        ],
        settings: { title_template: 'Ad brief: {{brand}} — {{objective}}', defaults: { priority: 2, due_days: 5 }, confirmation: { mode: 'message', message: 'Thanks — your brief is with the ads team.' } },
      },
      {
        key: 'website_change', name: 'Website change request', icon: 'ti-world-code', desc: 'Copy, image, bug or design changes on a live site.',
        fields: [
          { key: 'name', type: 'short_text', label: 'Your name', required: true, width: 'half' },
          { key: 'email', type: 'email', label: 'Email', required: true, width: 'half' },
          { key: 'page_url', type: 'url', label: 'Page link', required: true, placeholder: 'https://' },
          { key: 'change_type', type: 'dropdown', label: 'What kind of change?', required: true, map: { to: 'tags' }, options: optsOf(['Update text or content', 'Replace images', 'Add a new page', 'Fix something broken', 'Design change', 'SEO update']) },
          { key: 'details', type: 'long_text', label: 'What should change?', required: true, map: { to: 'description' } },
          { key: 'steps', type: 'long_text', label: 'Steps to reproduce the problem', show_if: [{ field: 'change_type', op: 'eq', value: 'fix_something_broken' }] },
          { key: 'screenshots', type: 'file', label: 'Screenshots', accept: 'images', max_files: 5, max_mb: 10 },
          {
            key: 'urgency', type: 'dropdown', label: 'How urgent?', width: 'half', map: { to: 'priority' },
            options: [{ id: 'site_down', label: 'Site is down', priority: 1 }, { id: 'soon', label: 'Needed soon', priority: 2 }, { id: 'normal', label: 'Normal', priority: 3 }, { id: 'whenever', label: 'Whenever', priority: 4 }],
          },
          { key: 'deadline', type: 'date', label: 'Needed by', width: 'half', map: { to: 'due' } },
        ],
        settings: { title_template: 'Website: {{change_type}}', defaults: { due_days: 3 }, confirmation: { mode: 'message', message: 'Thanks — the change is queued for the web team.' } },
      },
      {
        key: 'feedback', name: 'Feedback', icon: 'ti-message-star', desc: 'A short rating and comments from a client.',
        fields: [
          { key: 'rating', type: 'rating', label: 'How happy are you with our work?', required: true, max: 5, map: { to: 'priority' } },
          { key: 'went_well', type: 'long_text', label: 'What went well?' },
          { key: 'improve', type: 'long_text', label: 'What could we do better?', map: { to: 'description' } },
          { key: 'recommend', type: 'dropdown', label: 'Would you recommend us?', options: optsOf(['Yes', 'Maybe', 'No']) },
          { key: 'contact_ok', type: 'checkbox', label: 'You can contact me about this feedback', placeholder: 'Yes, get in touch' },
          { key: 'name', type: 'short_text', label: 'Your name', width: 'half', show_if: [{ field: 'contact_ok', op: 'filled', value: '' }] },
          { key: 'email', type: 'email', label: 'Email', width: 'half', show_if: [{ field: 'contact_ok', op: 'filled', value: '' }] },
        ],
        settings: { title_template: 'Feedback ({{rating}})', defaults: { priority: 3 }, confirmation: { mode: 'message', title: 'Thank you', message: 'We read every response — thank you for taking the time.' } },
      },
      {
        key: 'leave_request', name: 'Leave request', icon: 'ti-beach', desc: 'Internal: team members request leave. Signed-in staff only.', audience: 'internal',
        fields: [
          { key: 'leave_type', type: 'dropdown', label: 'Type of leave', required: true, map: { to: 'tags' }, options: optsOf(['Casual leave', 'Sick leave', 'Earned leave', 'Unpaid leave', 'Work from home']) },
          { key: 'from_date', type: 'date', label: 'From', required: true, width: 'half' },
          { key: 'to_date', type: 'date', label: 'To', required: true, width: 'half', map: { to: 'due' } },
          { key: 'half_day', type: 'checkbox', label: 'Half day', placeholder: 'Yes, half day only' },
          { key: 'reason', type: 'long_text', label: 'Reason', required: true, map: { to: 'description' } },
          { key: 'handover', type: 'long_text', label: 'Handover notes', help: 'What is in flight, and what needs watching while you are away.' },
          { key: 'cover', type: 'short_text', label: 'Who will cover your work?' },
        ],
        settings: {
          title_template: 'Leave: {{submitter}} · {{leave_type}} · {{from_date}}', defaults: { priority: 3 },
          confirmation: { mode: 'message', title: 'Sent', message: 'Your leave request has gone to the team leads.' },
        },
      },
    ];

    // Normalise anything the AI (or a template) produced into our field shape.
    const TYPE_ALIASES = {
      text: 'short_text', string: 'short_text', name: 'short_text', textarea: 'long_text', paragraph: 'long_text',
      longtext: 'long_text', select: 'dropdown', choice: 'dropdown', radio: 'dropdown', multiselect: 'multi_select',
      multi: 'multi_select', checkboxes: 'multi_select', boolean: 'checkbox', bool: 'checkbox', toggle: 'checkbox',
      upload: 'file', attachment: 'file', link: 'url', website: 'url', section: 'heading', header: 'heading',
      title: 'heading', stars: 'rating', tel: 'phone', mobile: 'phone', datetime: 'date',
    };
    function normalizeFields(raw) {
      const used = [];
      return arr(raw).map(f => {
        if (!f || typeof f !== 'object') return null;
        let type = String(f.type || 'short_text').toLowerCase().replace(/[\s-]+/g, '_');
        type = TYPE_META[type] ? type : (TYPE_ALIASES[type] || 'short_text');
        let key = String(f.key || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, '').slice(0, 40);
        if (!key || used.indexOf(key) >= 0) key = newFieldKey(type, used);
        used.push(key);
        const out = {
          key, type, label: String(f.label || f.name || TYPE_META[type].label).slice(0, 300),
          required: !!f.required,
        };
        if (f.help) out.help = String(f.help).slice(0, 1000);
        if (f.placeholder) out.placeholder = String(f.placeholder).slice(0, 200);
        if (f.width === 'half') out.width = 'half';
        if (OPTION_TYPES.indexOf(type) >= 0) out.options = optsOf(f.options && f.options.length ? f.options : ['Option 1', 'Option 2']);
        if (type === 'number' || type === 'rating' || type === 'multi_select') {
          if (f.min != null && !isNaN(Number(f.min))) out.min = Number(f.min);
          if (f.max != null && !isNaN(Number(f.max))) out.max = Number(f.max);
        }
        if (type === 'file') {
          out.max_files = Math.min(Math.max(Number(f.max_files) || 5, 1), 10);
          out.max_mb = Math.min(Math.max(Number(f.max_mb) || 10, 1), 25);
          out.accept = FILE_ACCEPT[f.accept] !== undefined ? f.accept : 'any';
        }
        if (arr(f.show_if).length) {
          out.show_if = arr(f.show_if).slice(0, 5)
            .filter(c => c && c.field && used.indexOf(String(c.field)) >= 0 && c.field !== key)
            .map(c => ({ field: String(c.field), op: COND_OPS.some(o => o.op === c.op) ? c.op : 'eq', value: String(c.value == null ? '' : c.value).slice(0, 200) }));
          if (!out.show_if.length) delete out.show_if;
        }
        if (f.map && f.map.to && MAP_TARGETS.some(m => m.to === f.map.to && m.types.indexOf(type) >= 0)) {
          out.map = f.map.to === 'custom_field' ? (f.map.field_id ? { to: 'custom_field', field_id: f.map.field_id } : null) : { to: f.map.to };
          if (!out.map) delete out.map;
        }
        return out;
      }).filter(Boolean);
    }
    const templateFields = (tpl) => normalizeFields(tpl.fields);

    // =========================================================================
    // Staff UI plumbing
    // =========================================================================
    function usePop() {
      const [open, setOpen] = useState(false);
      const [anchor, setAnchor] = useState(null);
      const ref = useCallback((el) => { if (el) setAnchor(el); }, []);
      return { open, setOpen, anchor, ref, toggle: () => setOpen(o => !o), close: () => setOpen(false) };
    }

    function RowMenu({ items, icon = 'ti-dots', label = 'More actions', className = 'fm-ibtn' }) {
      const pop = usePop();
      const list = arr(items).filter(Boolean);
      if (!Popover || !Menu || !list.length) return null;
      return h`<${Fragment}>
        <button type="button" ref=${pop.ref} class=${className} aria-label=${label} aria-haspopup="menu"
          onClick=${e => { e.stopPropagation(); pop.toggle(); }}><i class=${'ti ' + icon}></i></button>
        <${Popover} anchor=${pop.anchor} open=${pop.open} onClose=${pop.close} placement="bottom-end" ariaLabel=${label}>
          <${Menu} items=${list} onClose=${pop.close}/>
        <//>
      <//>`;
    }

    // Confirm helper — uses B's ConfirmDialog when present, window.confirm otherwise.
    function useAsk() {
      const [req, setReq] = useState(null);
      const ask = useCallback((opts) => new Promise((resolve) => {
        if (!ConfirmDialog) { resolve(window.confirm((opts && opts.title) || 'Are you sure?')); return; }
        setReq({ ...opts, resolve });
      }), []);
      const node = req && ConfirmDialog
        ? h`<${ConfirmDialog} open=${true} title=${req.title} body=${req.body} icon=${req.icon}
            tone=${req.danger ? 'danger' : req.tone} danger=${req.danger} confirmLabel=${req.confirmLabel || 'Confirm'}
            onConfirm=${() => { req.resolve(true); setReq(null); }} onCancel=${() => { req.resolve(false); setReq(null); }}/>`
        : null;
      return [ask, node];
    }

    const StatusPillFor = ({ f }) => {
      if (f.closed_reason === 'limit_reached') return h`<span class="fm-pill warn"><i class="ti ti-circle-check"></i>Limit reached</span>`;
      if (!f.accepting) return h`<span class="fm-pill off"><i class="ti ti-lock"></i>Closed</span>`;
      return h`<span class="fm-pill ok"><i class="ti ti-circle-dot"></i>Open</span>`;
    };

    function MissingMigration({ what = 'Forms' }) {
      const sub = 'This needs database migration 098. Ask an admin to apply it, then reload.';
      return EmptyState
        ? h`<${EmptyState} icon="ti-forms" title=${what + ' are not set up yet'} sub=${sub}/>`
        : h`<div style=${{ padding: 40, textAlign: 'center', color: 'var(--cu-t3)' }}>${what} are not set up yet. ${sub}</div>`;
    }

    // =========================================================================
    // Template / AI modals
    // =========================================================================
    function Modal({ title, icon, onClose, children, footer, width }) {
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose && onClose(); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
      }, [onClose]);
      return h`<div class="fm-modal-bg" onMouseDown=${e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
        <div class="fm-modal" style=${width ? { maxWidth: width } : null} role="dialog" aria-modal="true" aria-label=${title}>
          <div class="fm-modal-hd">
            ${icon ? h`<i class=${'ti ' + icon}></i>` : null}<span style=${{ flex: 1 }}>${title}</span>
            <button type="button" class="fm-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="fm-modal-b">${children}</div>
          ${footer ? h`<div class="fm-modal-ft">${footer}</div>` : null}
        </div>
      </div>`;
    }

    const aiEnabled = () => !!(window.AMS_AI && window.AMS_AI.enabled && typeof window.AMS_AI.run === 'function');

    function AiFormModal({ onClose, onBuilt, showToast }) {
      const [prompt, setPrompt] = useState('');
      const [busy, setBusy] = useState(false);
      const run = async () => {
        if (!prompt.trim() || busy) return;
        setBusy(true);
        try {
          const res = await window.AMS_AI.run('build_form', { prompt: prompt.trim(), field_types: FIELD_TYPES.map(t => t.type) });
          const out = (res && (res.form || res.result || res)) || {};
          const fields = normalizeFields(out.fields || out.questions || []);
          if (!fields.length) throw new Error('The assistant did not return any fields');
          onBuilt({ name: out.name || out.title || '', description: out.description || '', fields });
        } catch (e) {
          showToast && showToast('AI form builder: ' + ((e && e.message) || 'could not build that'));
        } finally { setBusy(false); }
      };
      return h`<${Modal} title="Build a form with AI" icon="ti-sparkles" onClose=${onClose}
        footer=${h`<${Fragment}>
          <span style=${{ flex: 1, fontSize: 11.5, color: 'var(--cu-t3)' }}>Fields are added to this form — you can edit everything afterwards.</span>
          <button type="button" class="fm-btn" onClick=${onClose}>Cancel</button>
          <button type="button" class="fm-btn fm-btn-pri" disabled=${busy || !prompt.trim()} onClick=${run}>
            ${busy ? h`<i class="ti ti-loader-2 fm-sp"></i>` : h`<i class="ti ti-sparkles"></i>`}${busy ? 'Building…' : 'Build fields'}
          </button>
        <//>`}>
        <label class="fm-lbl2" for="fm-ai-prompt">Describe the form you need</label>
        <textarea id="fm-ai-prompt" class="fm-textarea" rows=${5} autoFocus value=${prompt}
          placeholder="e.g. An intake form for new podcast clients: contact details, episode topic, guest names, preferred recording dates, and any brand files to upload."
          onInput=${e => setPrompt(e.target.value)}></textarea>
      <//>`;
    }

    function TemplateModal({ onClose, onPick, showToast, busy }) {
      const [ai, setAi] = useState(false);
      if (ai) return h`<${AiFormModal} showToast=${showToast} onClose=${() => setAi(false)}
        onBuilt=${(d) => { setAi(false); onPick({ key: 'ai', name: d.name || 'AI form', description: d.description, fields: d.fields, settings: {} }); }}/>`;
      return h`<${Modal} title="New form" icon="ti-forms" onClose=${onClose} width=${760}>
        <div class="fm-tplgrid">
          ${FORM_TEMPLATES.map(t => h`<button key=${t.key} type="button" class="fm-tpl" disabled=${busy}
            onClick=${() => onPick(t)}>
            <span class="fm-tpl-t"><i class=${'ti ' + t.icon}></i>${t.name}</span>
            <span class="fm-tpl-s">${t.desc}</span>
            <span class="fm-tpl-s" style=${{ marginTop: 'auto', opacity: .8 }}>
              ${arr(t.fields).filter(f => f.type !== 'heading').length} fields${t.audience === 'internal' ? ' · team only' : ''}
            </span>
          </button>`)}
          ${aiEnabled() ? h`<button type="button" class="fm-tpl" disabled=${busy} onClick=${() => setAi(true)}>
            <span class="fm-tpl-t"><i class="ti ti-sparkles"></i>Build with AI</span>
            <span class="fm-tpl-s">Describe what you need and let AI draft the fields.</span>
          </button>` : null}
        </div>
      <//>`;
    }

    function PreviewModal({ form, onClose }) {
      const [mobile, setMobile] = useState(false);
      const [sent, setSent] = useState(false);
      return h`<${Modal} title="Preview" icon="ti-eye" onClose=${onClose} width=${mobile ? 430 : 760}
        footer=${h`<${Fragment}>
          <span style=${{ flex: 1, fontSize: 11.5, color: 'var(--cu-t3)' }}>Nothing is saved from a preview.</span>
          <button type="button" class=${'fm-btn' + (mobile ? '' : ' fm-btn-pri')} onClick=${() => setMobile(false)}>Desktop</button>
          <button type="button" class=${'fm-btn' + (mobile ? ' fm-btn-pri' : '')} onClick=${() => setMobile(true)}>Mobile</button>
        <//>`}>
        <div class="fm-surface">
          ${sent
            ? h`<div style=${{ textAlign: 'center', padding: '30px 10px' }}>
                <i class="ti ti-circle-check" style=${{ fontSize: 32, color: 'var(--cu-accent)' }}></i>
                <div style=${{ fontWeight: 600, marginTop: 10 }}>That is what people will see after submitting.</div>
                <button type="button" class="fm-btn" style=${{ marginTop: 14 }} onClick=${() => setSent(false)}>Preview again</button>
              </div>`
            : h`<${FormRenderer} form=${form} preview=${true} onSubmit=${() => setSent(true)}/>`}
        </div>
      <//>`;
    }

    // =========================================================================
    // Hub
    // =========================================================================
    function FormsHub({ currentUser, showToast, onOpen, startNew, onNewHandled }) {
      const store = useTaskStore();
      const [rows, setRows] = useState(null);
      const [err, setErr] = useState(null);
      const [tab, setTab] = useState('all');
      const [q, setQ] = useState('');
      const [tpl, setTpl] = useState(!!startNew);
      const [busy, setBusy] = useState(false);
      const [ask, askNode] = useAsk();

      const load = useCallback(async () => {
        try { const r = await FormsAPI.list(); setRows(arr(r)); setErr(null); }
        catch (e) { setErr(e); setRows([]); }
      }, []);
      useEffect(() => { load(); }, [load]);
      useEffect(() => {
        const f = () => load();
        window.addEventListener('ams-forms-changed', f);
        return () => window.removeEventListener('ams-forms-changed', f);
      }, [load]);
      useEffect(() => { if (startNew) { setTpl(true); onNewHandled && onNewHandled(); } }, [startNew]);

      const isFav = (f) => (store.isFavorite ? (store.isFavorite('form', f.id) || store.isFavorite('url', 'form:' + f.id)) : false);
      const toggleFav = async (f) => {
        if (!TaskAPI || !TaskAPI.favoriteToggle) return;
        try { await TaskAPI.favoriteToggle('form', f.id, f.name, '#/forms/' + f.id); }
        catch (_) {
          try { await TaskAPI.favoriteToggle('url', 'form:' + f.id, f.name, '#/forms/' + f.id); }
          catch (e2) { showToast && showToast(errText(e2)); }
        }
      };

      const create = async (t) => {
        setBusy(true);
        try {
          const res = await FormsAPI.upsert({
            name: t.name === 'Blank form' ? 'Untitled form' : t.name,
            description: t.description || null, audience: t.audience || 'public',
            fields: t.key === 'ai' ? t.fields : templateFields(t),
            settings: t.settings || {}, template_key: t.key,
          });
          setTpl(false);
          if (res && res.id) onOpen(res.id);
        } catch (e) { showToast && showToast(errText(e)); }
        finally { setBusy(false); }
      };

      const act = async (fn, okMsg) => {
        try { const r = await fn(); if (okMsg) showToast && showToast(okMsg); await load(); return r; }
        catch (e) { showToast && showToast(errText(e)); }
      };

      const list = arr(rows).filter(f => {
        if (tab === 'mine' && f.owner_id !== (store.me && store.me.id) && f.created_by !== (store.me && store.me.id)) return false;
        if (tab === 'fav' && !isFav(f)) return false;
        const s = q.trim().toLowerCase();
        if (s && (f.name || '').toLowerCase().indexOf(s) < 0 && (f.slug || '').toLowerCase().indexOf(s) < 0) return false;
        return true;
      });
      const canCreate = !!currentUser && ['admin', 'manager', 'seo', 'editor', 'designer', 'accounts_head'].indexOf(currentUser.role_level) >= 0;

      const rowMenu = (f) => [
        { key: 'open', label: 'Open builder', icon: 'ti-pencil', onSelect: () => onOpen(f.id) },
        { key: 'resp', label: 'Responses (' + (f.submission_count || 0) + ')', icon: 'ti-inbox', onSelect: () => onOpen(f.id, 'responses') },
        { key: 'copy', label: 'Copy public link', icon: 'ti-link', onSelect: async () => { await copyText(publicUrl(f.slug)); showToast && showToast('Link copied'); } },
        { key: 'view', label: 'Open form', icon: 'ti-external-link', onSelect: () => window.open(publicUrl(f.slug), '_blank', 'noopener') },
        { divider: true, key: 'd1' },
        f.can_manage ? { key: 'dup', label: 'Duplicate', icon: 'ti-copy', onSelect: () => act(() => FormsAPI.duplicate(f.id), 'Form duplicated') } : null,
        f.can_manage ? {
          key: 'toggle', label: f.is_open ? 'Close form' : 'Reopen form', icon: f.is_open ? 'ti-lock' : 'ti-lock-open',
          onSelect: () => act(() => FormsAPI.upsert({ id: f.id, is_open: !f.is_open }), f.is_open ? 'Form closed' : 'Form reopened')
        } : null,
        f.can_manage ? {
          key: 'del', label: 'Delete', icon: 'ti-trash', danger: true, onSelect: async () => {
            const ok = await ask({ title: 'Delete "' + f.name + '"?', body: 'The public link stops working straight away. Responses already collected stay on their tasks.', danger: true, confirmLabel: 'Delete form' });
            if (ok) act(() => FormsAPI.remove(f.id), 'Form deleted');
          }
        } : null,
      ].filter(Boolean);

      return h`<div class="fm-app">
        <div class="fm-hd">
          <div style=${{ flex: 1, minWidth: 160 }}>
            <h1 class="fm-h1">Forms</h1>
            <div class="fm-sub">Collect requests from anyone — each response becomes a task.</div>
          </div>
          <div class="fm-row">
            <input class="fm-input" style=${{ width: 210, height: 30 }} value=${q} placeholder="Search forms…"
              aria-label="Search forms" onInput=${e => setQ(e.target.value)}/>
            <button type="button" class="fm-btn" onClick=${load} aria-label="Refresh"><i class="ti ti-refresh"></i></button>
            ${canCreate ? h`<button type="button" class="fm-btn fm-btn-pri" onClick=${() => setTpl(true)}>
              <i class="ti ti-plus"></i>New form</button>` : null}
          </div>
        </div>
        <div class="fm-tabs">
          ${[['all', 'All forms'], ['mine', 'My forms'], ['fav', 'Favorites']].map(([k, lbl]) => h`
            <button key=${k} type="button" class=${'fm-tab' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}>
              ${lbl}${k === 'all' && rows ? h`<span class="fm-cnt">${rows.length}</span>` : null}
            </button>`)}
        </div>
        <div class="fm-body"><div class="fm-wrap">
          ${rows === null ? h`<div>${[1, 2, 3].map(i => h`<div key=${i} class="fm-skel"></div>`)}</div>`
            : err && isMissingRpc(err) ? h`<${MissingMigration}/>`
              : err ? h`<div class="fm-note bad" style=${{ padding: 14 }}>${errText(err)}</div>`
                : !list.length ? h`<div style=${{ padding: '30px 0' }}>
                    ${EmptyState ? h`<${EmptyState} icon="ti-forms"
                      title=${q ? 'No forms match that search' : tab === 'fav' ? 'No favorite forms yet' : 'No forms yet'}
                      sub=${q ? '' : 'Create a request form and share the link — every response lands as a task.'}
                      action=${canCreate && !q ? h`<button type="button" class="fm-btn fm-btn-pri" onClick=${() => setTpl(true)}>
                        <i class="ti ti-plus"></i>New form</button>` : null}/>` : 'No forms yet'}
                  </div>`
                  : h`<div class="fm-scroll-x"><table class="fm-tbl">
                      <thead><tr>
                        <th style=${{ width: 34 }}></th><th>Form</th><th>Status</th><th>Goes to</th>
                        <th class="num">Responses</th><th>Last response</th><th>Owner</th><th style=${{ width: 34 }}></th>
                      </tr></thead>
                      <tbody>
                        ${list.map(f => h`<tr key=${f.id} style=${{ cursor: 'pointer' }} onClick=${() => onOpen(f.id)}>
                          <td onClick=${e => { e.stopPropagation(); toggleFav(f); }}>
                            <button type="button" class=${'fm-ibtn' + (isFav(f) ? ' on' : '')} aria-label=${isFav(f) ? 'Remove from favorites' : 'Add to favorites'}>
                              <i class=${'ti ' + (isFav(f) ? 'ti-star-filled' : 'ti-star')}></i>
                            </button>
                          </td>
                          <td>
                            <div class="fm-name">
                              <span class="fm-mark"><i class=${'ti ' + (f.audience === 'internal' ? 'ti-lock' : 'ti-forms')}></i></span>
                              <div style=${{ minWidth: 0 }}>
                                <div class="fm-trunc" style=${{ fontWeight: 600 }}>${f.name}</div>
                                <div class="fm-trunc" style=${{ fontSize: 11.5, color: 'var(--cu-t3)' }}>
                                  ${f.audience === 'internal' ? 'Team only · ' : ''}${f.field_count} fields · /?form=${f.slug}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td><${StatusPillFor} f=${f}/></td>
                          <td class="fm-trunc" style=${{ maxWidth: 190, color: 'var(--cu-t2)' }}>
                            ${f.client_name || (f.list_name ? 'Agency' : 'Agency › Internal')}${f.list_name ? ' › ' + f.list_name : ''}
                          </td>
                          <td class="num">${f.submission_count || 0}</td>
                          <td style=${{ color: 'var(--cu-t2)', whiteSpace: 'nowrap' }}>${f.last_submission_at ? fmtRelative(f.last_submission_at) : '—'}</td>
                          <td class="fm-trunc" style=${{ maxWidth: 130, color: 'var(--cu-t2)' }}>${f.owner_name || '—'}</td>
                          <td onClick=${e => e.stopPropagation()}><${RowMenu} items=${rowMenu(f)}/></td>
                        </tr>`)}
                      </tbody>
                    </table></div>`}
        </div></div>
        ${tpl ? h`<${TemplateModal} busy=${busy} showToast=${showToast} onClose=${() => setTpl(false)} onPick=${create}/>` : null}
        ${askNode}
      </div>`;
    }

    // =========================================================================
    // Builder
    // =========================================================================
    const BUILDER_TABS = [['build', 'Build', 'ti-forms'], ['settings', 'Settings', 'ti-settings'], ['responses', 'Responses', 'ti-inbox'], ['share', 'Share', 'ti-share']];
    const payloadOf = (d) => ({
      name: d.name, description: d.description || null, audience: d.audience, is_open: !!d.is_open,
      fields: d.fields, settings: d.settings, list_id: d.list_id || null, client_id: d.client_id || null,
    });
    const fieldSignature = (fields) => arr(fields).map(f => f.key + ':' + f.type + ':' + arr(f.options).map(o => o.id).join('|')).join(',');

    function FormBuilder({ formId, currentUser, showToast, tab, onTab, onBack, embedded }) {
      const store = useTaskStore();
      const [meta, setMeta] = useState(null);
      const [draft, setDraft] = useState(null);
      const [err, setErr] = useState(null);
      const [saveState, setSaveState] = useState('saved');
      const [sel, setSel] = useState(null);
      const [preview, setPreview] = useState(false);
      const [ai, setAi] = useState(false);
      const [ask, askNode] = useAsk();
      const verRef = useRef(0);
      const savedRef = useRef('');
      const draftRef = useRef(null);
      draftRef.current = draft;
      const canManage = !meta || meta.can_manage !== false;

      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const res = await FormsAPI.get(formId);
            if (!alive) return;
            const d = {
              id: res.id, name: res.name, description: res.description, audience: res.audience, is_open: res.is_open,
              fields: arr(res.fields), settings: (res.settings && typeof res.settings === 'object') ? res.settings : {},
              list_id: res.list_id, client_id: res.client_id,
            };
            savedRef.current = JSON.stringify(payloadOf(d));
            setDraft(d); setMeta(res); setErr(null);
          } catch (e) { if (alive) setErr(e); }
        })();
        return () => { alive = false; };
      }, [formId]);

      const save = useCallback(async (d) => {
        const body = payloadOf(d);
        const json = JSON.stringify(body);
        const v = verRef.current;
        setSaveState('saving');
        try {
          const res = await FormsAPI.upsert({ id: d.id, ...body });
          savedRef.current = json;
          setMeta(res);
          // adopt the server's copy only when it renamed keys / option ids (never mid-typing text)
          if (verRef.current === v && fieldSignature(res.fields) !== fieldSignature(d.fields)) {
            setDraft(cur => ({ ...cur, fields: arr(res.fields) }));
          }
          setSaveState('saved');
        } catch (e) {
          setSaveState('error');
          showToast && showToast(errText(e));
        }
      }, [showToast]);

      // autosave (debounced) + flush on unmount
      useEffect(() => {
        if (!draft || !canManage) return;
        const json = JSON.stringify(payloadOf(draft));
        if (json === savedRef.current) return;
        setSaveState('dirty');
        const t = setTimeout(() => save(draft), 900);
        return () => clearTimeout(t);
      }, [draft, canManage, save]);
      useEffect(() => () => {
        const d = draftRef.current;
        if (d && canManage && JSON.stringify(payloadOf(d)) !== savedRef.current) save(d);
      }, []);
      useEffect(() => {
        const onKey = (e) => {
          if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 's') {
            e.preventDefault();
            const d = draftRef.current;
            if (d && canManage) save(d);
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [canManage, save]);

      const update = useCallback((patch) => {
        verRef.current++;
        setDraft(d => (d ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) } : d));
      }, []);
      const setSetting = useCallback((path, value) => {
        verRef.current++;
        setDraft(d => {
          if (!d) return d;
          const s = { ...(d.settings || {}) };
          const parts = arr(path.split('.'));
          if (parts.length === 1) {
            if (value === null || value === undefined || value === '') delete s[parts[0]]; else s[parts[0]] = value;
          } else {
            const sub = { ...(s[parts[0]] || {}) };
            if (value === null || value === undefined || value === '') delete sub[parts[1]]; else sub[parts[1]] = value;
            s[parts[0]] = sub;
          }
          return { ...d, settings: s };
        });
      }, []);

      const setFields = (fn) => update(d => ({ fields: fn(arr(d.fields)) }));
      const addField = (type) => {
        const key = newFieldKey(type, arr(draft.fields).map(f => f.key));
        const f = { key, type, label: TYPE_META[type].label, required: false };
        if (OPTION_TYPES.indexOf(type) >= 0) f.options = optsOf(['Option 1', 'Option 2']);
        if (type === 'file') { f.max_files = 5; f.max_mb = 10; f.accept = 'any'; }
        if (type === 'rating') f.max = 5;
        setFields(list => {
          const at = sel ? list.findIndex(x => x.key === sel) : -1;
          const next = list.slice();
          next.splice(at >= 0 ? at + 1 : list.length, 0, f);
          return next;
        });
        setSel(key);
      };
      const patchField = (key, patch) => setFields(list => list.map(f => (f.key === key ? { ...f, ...patch } : f)));
      const removeField = (key) => { setFields(list => list.filter(f => f.key !== key)); if (sel === key) setSel(null); };
      const dupField = (key) => setFields(list => {
        const i = list.findIndex(f => f.key === key);
        if (i < 0) return list;
        const copy = { ...list[i], key: newFieldKey(list[i].type, list.map(f => f.key)), label: list[i].label + ' (copy)' };
        const next = list.slice(); next.splice(i + 1, 0, copy); return next;
      });
      const moveField = (from, to) => setFields(list => {
        if (to < 0 || to >= list.length || from === to) return list;
        const next = list.slice(); const [x] = next.splice(from, 1); next.splice(to, 0, x); return next;
      });
      // one field at a time may own a "unique" mapping target (task name, due date…)
      const setFieldMap = (key, map) => setFields(list => list.map(f => {
        if (f.key === key) { const n = { ...f }; if (map) n.map = map; else delete n.map; return n; }
        if (map && MAP_TARGETS.some(m => m.to === map.to && m.unique) && f.map && f.map.to === map.to) {
          const n = { ...f }; delete n.map; return n;
        }
        return f;
      }));

      if (err) return h`<div class="fm-app"><div class="fm-wrap">
        ${isMissingRpc(err) ? h`<${MissingMigration}/>` : h`<div class="fm-note bad" style=${{ padding: 14 }}>${errText(err)}</div>`}
        ${onBack ? h`<button type="button" class="fm-btn" style=${{ marginTop: 12 }} onClick=${onBack}>Back to forms</button>` : null}
      </div></div>`;
      if (!draft) return h`<div class="fm-app"><div class="fm-wrap">${[1, 2, 3].map(i => h`<div key=${i} class="fm-skel"></div>`)}</div></div>`;

      const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved changes'
        : saveState === 'error' ? 'Not saved' : 'All changes saved';
      const tabNow = tab || 'build';
      const previewForm = {
        id: draft.id, name: draft.name, description: draft.description, fields: draft.fields,
        submit_label: (draft.settings && draft.settings.submit_label) || 'Submit', min_seconds: 0,
      };

      return h`<div class="fm-app">
        <div class="fm-hd">
          ${onBack ? h`<button type="button" class="fm-btn fm-btn-ghost" onClick=${onBack}>
            <i class="ti ti-chevron-left"></i>Forms</button>` : null}
          <div style=${{ flex: 1, minWidth: 180 }}>
            <input class="fm-input" style=${{ fontSize: 16, fontWeight: 600, border: '1px solid transparent', background: 'transparent', padding: '4px 6px' }}
              value=${draft.name || ''} disabled=${!canManage} aria-label="Form name" maxLength=${120}
              onInput=${e => update({ name: e.target.value })}
              onBlur=${e => { if (!e.target.value.trim()) update({ name: 'Untitled form' }); }}/>
            <div class="fm-sub" style=${{ padding: '0 6px' }}>
              ${canManage ? saveLabel : 'View only — ask the owner or an admin for edit access'}
              ${meta && meta.slug ? ' · /?form=' + meta.slug : ''}
            </div>
          </div>
          <div class="fm-row">
            ${meta ? h`<${StatusPillFor} f=${meta}/>` : null}
            ${canManage ? h`<label class="fm-row" style=${{ gap: 6, fontSize: 12.5, color: 'var(--cu-t2)', cursor: 'pointer' }}>
              <input type="checkbox" checked=${!!draft.is_open} onChange=${e => update({ is_open: e.target.checked })}/>Accepting
            </label>` : null}
            <button type="button" class="fm-btn" onClick=${() => setPreview(true)}><i class="ti ti-eye"></i>Preview</button>
            <button type="button" class="fm-btn" onClick=${async () => { await copyText(publicUrl(meta && meta.slug)); showToast && showToast('Link copied'); }}>
              <i class="ti ti-link"></i>Copy link</button>
            ${canManage && aiEnabled() ? h`<button type="button" class="fm-btn" onClick=${() => setAi(true)}>
              <i class="ti ti-sparkles"></i>AI</button>` : null}
            <${RowMenu} className="fm-btn" icon="ti-dots" items=${[
              { key: 'open', label: 'Open public form', icon: 'ti-external-link', onSelect: () => window.open(publicUrl(meta && meta.slug), '_blank', 'noopener') },
              canManage ? { key: 'dup', label: 'Duplicate form', icon: 'ti-copy', onSelect: async () => { const r = await FormsAPI.duplicate(draft.id).catch(e => { showToast && showToast(errText(e)); }); if (r && r.id) { showToast && showToast('Duplicated'); location.hash = '#/forms/' + r.id; } } } : null,
              canManage ? {
                key: 'del', label: 'Delete form', icon: 'ti-trash', danger: true, onSelect: async () => {
                  const ok = await ask({ title: 'Delete "' + draft.name + '"?', body: 'The public link stops working straight away.', danger: true, confirmLabel: 'Delete form' });
                  if (!ok) return;
                  try { await FormsAPI.remove(draft.id); showToast && showToast('Form deleted'); onBack ? onBack() : (location.hash = '#/forms'); }
                  catch (e) { showToast && showToast(errText(e)); }
                }
              } : null,
            ].filter(Boolean)}/>
          </div>
        </div>

        <div class="fm-tabs">
          ${BUILDER_TABS.map(([k, lbl, ic]) => h`<button key=${k} type="button" class=${'fm-tab' + (tabNow === k ? ' on' : '')}
            onClick=${() => onTab && onTab(k)}>
            <i class=${'ti ' + ic}></i>${lbl}
            ${k === 'responses' && meta && meta.submission_count ? h`<span class="fm-cnt">${meta.submission_count}</span>` : null}
          </button>`)}
        </div>

        <div class="fm-body">
          ${tabNow === 'build' ? h`<${BuildTab} draft=${draft} sel=${sel} setSel=${setSel} canManage=${canManage}
              addField=${addField} patchField=${patchField} removeField=${removeField} dupField=${dupField}
              moveField=${moveField} setFieldMap=${setFieldMap} update=${update} store=${store} showToast=${showToast}/>`
            : tabNow === 'settings' ? h`<${SettingsTab} draft=${draft} meta=${meta} update=${update} setSetting=${setSetting}
              canManage=${canManage} store=${store} showToast=${showToast} setMeta=${setMeta}/>`
              : tabNow === 'responses' ? h`<${ResponsesTab} form=${draft} meta=${meta} showToast=${showToast} canManage=${canManage}/>`
                : h`<${ShareTab} draft=${draft} meta=${meta} showToast=${showToast} canManage=${canManage} setMeta=${setMeta}/>`}
        </div>

        ${preview ? h`<${PreviewModal} form=${previewForm} onClose=${() => setPreview(false)}/>` : null}
        ${ai ? h`<${AiFormModal} showToast=${showToast} onClose=${() => setAi(false)} onBuilt=${(d) => {
          setAi(false);
          const existing = arr(draft.fields).map(f => f.key);
          const add = normalizeFields(d.fields).map(f => (existing.indexOf(f.key) >= 0 ? { ...f, key: newFieldKey(f.type, existing.concat([f.key])) } : f));
          update(cur => ({ fields: arr(cur.fields).concat(add), name: (cur.name === 'Untitled form' && d.name) ? d.name : cur.name }));
          showToast && showToast('Added ' + add.length + ' fields');
        }}/>` : null}
        ${askNode}
      </div>`;
    }

    // ---- Build tab ---------------------------------------------------------
    function BuildTab({ draft, sel, setSel, canManage, addField, patchField, removeField, dupField, moveField, setFieldMap, update, store, showToast }) {
      const fields = arr(draft.fields);
      const dragFrom = useRef(null);
      const selField = fields.find(f => f.key === sel) || null;

      return h`<div class="fm-build">
        <div class="fm-pal">
          <div class="fm-lbl2" style=${{ margin: '2px 0 4px' }}>Add field</div>
          ${FIELD_TYPES.map(t => h`<button key=${t.type} type="button" class="fm-pal-b" disabled=${!canManage}
            onClick=${() => addField(t.type)}><i class=${'ti ' + t.icon}></i>${t.label}</button>`)}
        </div>

        <div class="fm-canvas">
          <input class="fm-input" style=${{ border: '1px solid transparent', background: 'transparent', fontSize: 14, padding: '4px 6px' }}
            value=${draft.description || ''} disabled=${!canManage} maxLength=${4000}
            placeholder="Add a short description shown under the form title (optional)"
            aria-label="Form description" onInput=${e => update({ description: e.target.value })}/>
          <div style=${{ height: 1, background: 'var(--cu-bd)', margin: '10px 0 12px' }}></div>

          ${!fields.length ? h`<div style=${{ padding: '24px 10px', textAlign: 'center', color: 'var(--cu-t3)', fontSize: 13 }}>
            No fields yet — add one from the list on the left.</div>` : null}

          ${fields.map((f, i) => h`<div key=${f.key} class=${'fm-block' + (sel === f.key ? ' sel' : '')}
            draggable=${canManage} tabIndex=${0} role="button" aria-pressed=${sel === f.key}
            onClick=${() => setSel(f.key)}
            onKeyDown=${e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(f.key); }
              if (canManage && e.altKey && e.key === 'ArrowUp') { e.preventDefault(); moveField(i, i - 1); }
              if (canManage && e.altKey && e.key === 'ArrowDown') { e.preventDefault(); moveField(i, i + 1); }
            }}
            onDragStart=${() => { dragFrom.current = i; }}
            onDragOver=${e => { if (dragFrom.current !== null) e.preventDefault(); }}
            onDrop=${e => { e.preventDefault(); if (dragFrom.current !== null) { moveField(dragFrom.current, i); dragFrom.current = null; } }}>
            <div class="fm-block-top">
              <i class=${'ti ' + TYPE_META[f.type].icon} style=${{ color: 'var(--cu-t3)' }}></i>
              <span class="fm-trunc">${f.label}</span>
              ${f.required ? h`<span class="fm-req">*</span>` : null}
              <div class="fm-block-tools">
                <button type="button" class="fm-ibtn" aria-label="Move up" disabled=${!canManage || i === 0}
                  onClick=${e => { e.stopPropagation(); moveField(i, i - 1); }}><i class="ti ti-chevron-up"></i></button>
                <button type="button" class="fm-ibtn" aria-label="Move down" disabled=${!canManage || i === fields.length - 1}
                  onClick=${e => { e.stopPropagation(); moveField(i, i + 1); }}><i class="ti ti-chevron-down"></i></button>
                <button type="button" class="fm-ibtn" aria-label="Duplicate field" disabled=${!canManage}
                  onClick=${e => { e.stopPropagation(); dupField(f.key); }}><i class="ti ti-copy"></i></button>
                <button type="button" class="fm-ibtn" aria-label="Delete field" disabled=${!canManage}
                  onClick=${e => { e.stopPropagation(); removeField(f.key); }}><i class="ti ti-trash"></i></button>
              </div>
            </div>
            <div style=${{ marginTop: 6, fontSize: 12, color: 'var(--cu-t3)' }}>
              <span class="fm-badge">${TYPE_META[f.type].label}</span>
              ${f.map ? h`<span class="fm-badge map"><i class="ti ti-arrow-right"></i>${mapLabel(f.map)}</span>` : null}
              ${arr(f.show_if).length ? h`<span class="fm-badge"><i class="ti ti-git-branch"></i>Conditional</span>` : null}
              ${OPTION_TYPES.indexOf(f.type) >= 0 ? h`<span class="fm-badge">${arr(f.options).length} options</span>` : null}
              ${f.help ? h`<span class="fm-trunc" style=${{ display: 'block', marginTop: 4 }}>${f.help}</span>` : null}
            </div>
          </div>`)}
        </div>

        <div class="fm-insp">
          ${selField
            ? h`<${Inspector} f=${selField} fields=${fields} draft=${draft} canManage=${canManage}
                patchField=${patchField} setFieldMap=${setFieldMap} store=${store} showToast=${showToast}/>`
            : h`<div>
                <div class="fm-lbl2">Form</div>
                <div class="fm-fld">
                  <label class="fm-lbl2" for="fm-submit-label">Submit button label</label>
                  <input id="fm-submit-label" class="fm-input" maxLength=${40} disabled=${!canManage}
                    value=${(draft.settings && draft.settings.submit_label) || ''} placeholder="Submit"
                    onInput=${e => update(d => ({ settings: { ...(d.settings || {}), submit_label: e.target.value || undefined } }))}/>
                </div>
                <div class="fm-hint">Select a field on the left to edit its label, options, conditions and how it maps onto the task.</div>
              </div>`}
        </div>
      </div>`;
    }

    function Inspector({ f, fields, draft, canManage, patchField, setFieldMap, store, showToast }) {
      const idx = fields.findIndex(x => x.key === f.key);
      const before = fields.slice(0, Math.max(idx, 0)).filter(x => x.type !== 'heading' && x.type !== 'file');
      const customFields = arr(store.fields).filter(cf => !cf.list_id || cf.list_id === draft.list_id);
      const targets = MAP_TARGETS.filter(m => m.types.indexOf(f.type) >= 0);
      const isOpt = OPTION_TYPES.indexOf(f.type) >= 0;
      const optExtra = f.map && ['priority', 'assignee', 'client'].indexOf(f.map.to) >= 0 ? f.map.to : null;

      const setOpt = (i, patch) => patchField(f.key, { options: arr(f.options).map((o, j) => (j === i ? { ...o, ...patch } : o)) });
      const addOpt = () => patchField(f.key, { options: arr(f.options).concat([{ id: 'o_' + rand(6), label: 'Option ' + (arr(f.options).length + 1) }]) });
      const delOpt = (i) => patchField(f.key, { options: arr(f.options).filter((_, j) => j !== i) });
      const moveOpt = (i, d) => patchField(f.key, {
        options: (() => { const n = arr(f.options).slice(); const t = i + d; if (t < 0 || t >= n.length) return n; const [x] = n.splice(i, 1); n.splice(t, 0, x); return n; })(),
      });
      const setCond = (i, patch) => patchField(f.key, { show_if: arr(f.show_if).map((c, j) => (j === i ? { ...c, ...patch } : c)) });

      return h`<div>
        <div class="fm-row" style=${{ marginBottom: 10 }}>
          <i class=${'ti ' + TYPE_META[f.type].icon}></i>
          <strong style=${{ fontSize: 13 }}>${TYPE_META[f.type].label}</strong>
        </div>

        <div class="fm-fld">
          <label class="fm-lbl2" for=${'insp-label-' + f.key}>Label</label>
          <input id=${'insp-label-' + f.key} class="fm-input" value=${f.label || ''} disabled=${!canManage} maxLength=${300}
            onInput=${e => patchField(f.key, { label: e.target.value })}/>
        </div>
        <div class="fm-fld">
          <label class="fm-lbl2" for=${'insp-help-' + f.key}>Help text</label>
          <textarea id=${'insp-help-' + f.key} class="fm-textarea" rows=${2} disabled=${!canManage} maxLength=${1000}
            value=${f.help || ''} onInput=${e => patchField(f.key, { help: e.target.value || undefined })}></textarea>
        </div>
        ${['short_text', 'long_text', 'email', 'phone', 'url', 'number', 'checkbox', 'dropdown'].indexOf(f.type) >= 0 ? h`<div class="fm-fld">
          <label class="fm-lbl2" for=${'insp-ph-' + f.key}>${f.type === 'checkbox' ? 'Checkbox text' : 'Placeholder'}</label>
          <input id=${'insp-ph-' + f.key} class="fm-input" value=${f.placeholder || ''} disabled=${!canManage} maxLength=${200}
            onInput=${e => patchField(f.key, { placeholder: e.target.value || undefined })}/>
        </div>` : null}

        ${f.type !== 'heading' ? h`<div class="fm-row" style=${{ marginBottom: 10, gap: 14 }}>
          <label class="fm-row" style=${{ gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked=${!!f.required} disabled=${!canManage}
              onChange=${e => patchField(f.key, { required: e.target.checked })}/>Required
          </label>
          <label class="fm-row" style=${{ gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked=${f.width === 'half'} disabled=${!canManage}
              onChange=${e => patchField(f.key, { width: e.target.checked ? 'half' : undefined })}/>Half width
          </label>
        </div>` : null}

        ${isOpt ? h`<div class="fm-fld">
          <div class="fm-lbl2">Options</div>
          ${arr(f.options).map((o, i) => h`<div key=${o.id} class="fm-optline">
            <input class="fm-input" style=${{ flex: 1 }} value=${o.label} disabled=${!canManage} maxLength=${200}
              aria-label=${'Option ' + (i + 1)} onInput=${e => setOpt(i, { label: e.target.value })}/>
            ${optExtra === 'priority' ? h`<select class="fm-select" style=${{ width: 96 }} disabled=${!canManage}
              aria-label="Priority for this option" value=${o.priority || ''} onChange=${e => setOpt(i, { priority: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Priority…</option><option value="1">Urgent</option><option value="2">High</option>
              <option value="3">Normal</option><option value="4">Low</option>
            </select>` : null}
            ${optExtra === 'assignee' ? h`<select class="fm-select" style=${{ width: 130 }} disabled=${!canManage}
              aria-label="Assignee for this option" value=${o.member_id || ''} onChange=${e => setOpt(i, { member_id: e.target.value || undefined })}>
              <option value="">Assign to…</option>
              ${arr(store.members).map(m => h`<option key=${m.id} value=${m.id}>${m.name}</option>`)}
            </select>` : null}
            ${optExtra === 'client' ? h`<select class="fm-select" style=${{ width: 130 }} disabled=${!canManage}
              aria-label="Client for this option" value=${o.client_id || ''} onChange=${e => setOpt(i, { client_id: e.target.value || undefined })}>
              <option value="">Client…</option>
              ${arr(store.clients).map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
            </select>` : null}
            <button type="button" class="fm-ibtn" aria-label="Move option up" disabled=${!canManage || i === 0} onClick=${() => moveOpt(i, -1)}><i class="ti ti-chevron-up"></i></button>
            <button type="button" class="fm-ibtn" aria-label="Move option down" disabled=${!canManage || i === arr(f.options).length - 1} onClick=${() => moveOpt(i, 1)}><i class="ti ti-chevron-down"></i></button>
            <button type="button" class="fm-ibtn" aria-label="Remove option" disabled=${!canManage} onClick=${() => delOpt(i)}><i class="ti ti-x"></i></button>
          </div>`)}
          <button type="button" class="fm-btn" style=${{ height: 26 }} disabled=${!canManage} onClick=${addOpt}>
            <i class="ti ti-plus"></i>Add option</button>
        </div>` : null}

        ${f.type === 'number' || f.type === 'multi_select' || f.type === 'rating' ? h`<div class="fm-row" style=${{ marginBottom: 12 }}>
          ${f.type === 'number' ? h`<div style=${{ flex: 1 }}>
            <label class="fm-lbl2" for=${'insp-min-' + f.key}>Minimum</label>
            <input id=${'insp-min-' + f.key} type="number" class="fm-input" value=${f.min == null ? '' : f.min} disabled=${!canManage}
              onInput=${e => patchField(f.key, { min: e.target.value === '' ? undefined : Number(e.target.value) })}/>
          </div>` : null}
          <div style=${{ flex: 1 }}>
            <label class="fm-lbl2" for=${'insp-max-' + f.key}>
              ${f.type === 'rating' ? 'Stars' : f.type === 'multi_select' ? 'Max choices' : 'Maximum'}</label>
            <input id=${'insp-max-' + f.key} type="number" class="fm-input" value=${f.max == null ? '' : f.max} disabled=${!canManage}
              onInput=${e => patchField(f.key, { max: e.target.value === '' ? undefined : Number(e.target.value) })}/>
          </div>
        </div>` : null}

        ${f.type === 'file' ? h`<div class="fm-fld">
          <div class="fm-row">
            <div style=${{ flex: 1 }}>
              <label class="fm-lbl2" for=${'insp-mf-' + f.key}>Max files</label>
              <input id=${'insp-mf-' + f.key} type="number" min=${1} max=${10} class="fm-input" disabled=${!canManage}
                value=${f.max_files || 5} onInput=${e => patchField(f.key, { max_files: Math.min(Math.max(Number(e.target.value) || 1, 1), 10) })}/>
            </div>
            <div style=${{ flex: 1 }}>
              <label class="fm-lbl2" for=${'insp-mb-' + f.key}>Max MB each</label>
              <input id=${'insp-mb-' + f.key} type="number" min=${1} max=${25} class="fm-input" disabled=${!canManage}
                value=${f.max_mb || 10} onInput=${e => patchField(f.key, { max_mb: Math.min(Math.max(Number(e.target.value) || 1, 1), 25) })}/>
            </div>
          </div>
          <label class="fm-lbl2" style=${{ marginTop: 8 }} for=${'insp-ac-' + f.key}>Accepted files</label>
          <select id=${'insp-ac-' + f.key} class="fm-select" value=${f.accept || 'any'} disabled=${!canManage}
            onChange=${e => patchField(f.key, { accept: e.target.value })}>
            <option value="any">Any file</option><option value="images">Images</option>
            <option value="documents">Documents</option><option value="media">Images, video and audio</option>
          </select>
          <div class="fm-hint">Uploads go to the private form-uploads bucket and attach to the task.</div>
        </div>` : null}

        ${f.type !== 'heading' && targets.length ? h`<div class="fm-fld">
          <label class="fm-lbl2" for=${'insp-map-' + f.key}>Put this answer on the task</label>
          <select id=${'insp-map-' + f.key} class="fm-select" disabled=${!canManage} value=${(f.map && f.map.to) || ''}
            onChange=${e => {
              const to = e.target.value;
              if (!to) { setFieldMap(f.key, null); return; }
              if (to === 'custom_field') { setFieldMap(f.key, { to, field_id: (customFields[0] || {}).id }); return; }
              setFieldMap(f.key, { to });
            }}>
            <option value="">Answer only (shown in the description)</option>
            ${targets.map(t => h`<option key=${t.to} value=${t.to}>${t.label}</option>`)}
          </select>
          ${f.map && f.map.to === 'custom_field' ? h`<select class="fm-select" style=${{ marginTop: 6 }} disabled=${!canManage}
            aria-label="Custom field" value=${f.map.field_id || ''} onChange=${e => setFieldMap(f.key, { to: 'custom_field', field_id: e.target.value })}>
            ${!customFields.length ? h`<option value="">No custom fields yet</option>` : null}
            ${customFields.map(cf => h`<option key=${cf.id} value=${cf.id}>${cf.name} (${cf.type})</option>`)}
          </select>` : null}
          ${optExtra ? h`<div class="fm-hint">Set the ${optExtra === 'priority' ? 'priority' : optExtra === 'assignee' ? 'person' : 'client'} each option should use, above.</div>` : null}
          ${f.map && f.map.to === 'tags' ? h`<div class="fm-hint">Chosen labels become task tags — new tags are created automatically.</div>` : null}
        </div>` : null}

        <div class="fm-fld">
          <div class="fm-row" style=${{ justifyContent: 'space-between' }}>
            <span class="fm-lbl2" style=${{ margin: 0 }}>Show only when…</span>
            <button type="button" class="fm-ibtn" aria-label="Add condition" disabled=${!canManage || !before.length || arr(f.show_if).length >= 5}
              onClick=${() => patchField(f.key, { show_if: arr(f.show_if).concat([{ field: before[0].key, op: 'eq', value: '' }]) })}>
              <i class="ti ti-plus"></i></button>
          </div>
          ${!before.length ? h`<div class="fm-hint">Add a field above this one to use it as a condition.</div>` : null}
          ${arr(f.show_if).map((c, i) => {
            const src = fields.find(x => x.key === c.field);
            const srcOpts = src && OPTION_TYPES.indexOf(src.type) >= 0 ? arr(src.options) : null;
            return h`<div key=${i} style=${{ border: '1px solid var(--cu-bd)', borderRadius: 6, padding: 7, marginTop: 6 }}>
              <div class="fm-row">
                <select class="fm-select" style=${{ flex: 1 }} value=${c.field} disabled=${!canManage} aria-label="Condition field"
                  onChange=${e => setCond(i, { field: e.target.value, value: '' })}>
                  ${before.map(b => h`<option key=${b.key} value=${b.key}>${b.label}</option>`)}
                </select>
                <button type="button" class="fm-ibtn" aria-label="Remove condition" disabled=${!canManage}
                  onClick=${() => patchField(f.key, { show_if: arr(f.show_if).filter((_, j) => j !== i).length ? arr(f.show_if).filter((_, j) => j !== i) : undefined })}>
                  <i class="ti ti-x"></i></button>
              </div>
              <div class="fm-row" style=${{ marginTop: 6 }}>
                <select class="fm-select" style=${{ width: 120 }} value=${c.op || 'eq'} disabled=${!canManage} aria-label="Condition"
                  onChange=${e => setCond(i, { op: e.target.value })}>
                  ${COND_OPS.map(o => h`<option key=${o.op} value=${o.op}>${o.label}</option>`)}
                </select>
                ${NO_VALUE_OPS.indexOf(c.op) >= 0 ? null
                  : srcOpts ? h`<select class="fm-select" style=${{ flex: 1 }} value=${c.value || ''} disabled=${!canManage} aria-label="Value"
                      onChange=${e => setCond(i, { value: e.target.value })}>
                      <option value="">Choose…</option>
                      ${srcOpts.map(o => h`<option key=${o.id} value=${o.id}>${o.label}</option>`)}
                    </select>`
                    : src && src.type === 'checkbox' ? h`<select class="fm-select" style=${{ flex: 1 }} value=${c.value || 'true'} disabled=${!canManage} aria-label="Value"
                        onChange=${e => setCond(i, { value: e.target.value })}>
                        <option value="true">is ticked</option><option value="false">is not ticked</option>
                      </select>`
                      : h`<input class="fm-input" style=${{ flex: 1 }} value=${c.value || ''} disabled=${!canManage} aria-label="Value"
                          onInput=${e => setCond(i, { value: e.target.value })}/>`}
              </div>
            </div>`;
          })}
        </div>
      </div>`;
    }

    // ---- Settings tab ------------------------------------------------------
    function SettingsTab({ draft, meta, update, setSetting, canManage, store, showToast, setMeta }) {
      const s = draft.settings || {};
      const d = s.defaults || {};
      const conf = s.confirmation || {};
      const lim = s.limits || {};
      const spam = s.spam || {};
      const brand = s.branding || {};
      const [slug, setSlug] = useState((meta && meta.slug) || '');
      const [slugBusy, setSlugBusy] = useState(false);
      useEffect(() => { setSlug((meta && meta.slug) || ''); }, [meta && meta.slug]);

      const card = (title, icon, children, sub) => h`<div class="fm-card">
        <div class="fm-card-hd"><i class=${'ti ' + icon}></i><span style=${{ flex: 1 }}>${title}</span></div>
        <div class="fm-card-b">
          ${sub ? h`<div class="fm-hint" style=${{ marginTop: 0, marginBottom: 12 }}>${sub}</div>` : null}
          ${children}
        </div>
      </div>`;

      const listName = (() => {
        const l = store.listById && store.listById[draft.list_id];
        if (!l) return draft.client_id && store.clientById && store.clientById[draft.client_id]
          ? store.clientById[draft.client_id].name + ' › Tasks'
          : 'Agency › Internal';
        const c = l.client_id && store.clientById ? store.clientById[l.client_id] : null;
        return (c ? c.name : 'Agency') + ' › ' + l.name;
      })();

      const saveSlug = async () => {
        setSlugBusy(true);
        try { const res = await FormsAPI.upsert({ id: draft.id, slug: slug.trim().toLowerCase() }); setMeta(res); showToast && showToast('Link updated'); }
        catch (e) { showToast && showToast(errText(e)); setSlug((meta && meta.slug) || ''); }
        finally { setSlugBusy(false); }
      };

      return h`<div class="fm-wrap" style=${{ maxWidth: 820 }}>
        ${card('Where responses go', 'ti-arrow-right-circle', h`<div>
          <label class="fm-lbl2">Create tasks in</label>
          ${ListPicker
            ? h`<div class="fm-row">
                <${ListPicker} value=${draft.list_id} disabled=${!canManage}
                  filter=${(l) => l.kind === 'general' && l.system_key !== 'personal' && !l.archived}
                  onChange=${(id, l) => update({ list_id: id || null, client_id: (l && l.client_id) || null })}/>
                ${draft.list_id ? h`<button type="button" class="fm-btn fm-btn-ghost" disabled=${!canManage}
                  onClick=${() => update({ list_id: null })}>Clear</button>` : null}
              </div>`
            : h`<select class="fm-select" disabled=${!canManage} value=${draft.list_id || ''}
                onChange=${e => { const l = (store.listById || {})[e.target.value]; update({ list_id: e.target.value || null, client_id: (l && l.client_id) || null }); }}>
                <option value="">Agency › Internal (default)</option>
                ${arr(store.lists).filter(l => l.kind === 'general' && l.system_key !== 'personal' && !l.archived)
                  .map(l => h`<option key=${l.id} value=${l.id}>${(l.client_id && store.clientById[l.client_id] ? store.clientById[l.client_id].name : 'Agency') + ' › ' + l.name}</option>`)}
              </select>`}
          <div class="fm-hint">Tasks land in <strong>${listName}</strong> as a Request. A field mapped to “Client (space)” can override this per response.</div>

          <div style=${{ height: 14 }}></div>
          <div class="fm-row" style=${{ gap: 18, alignItems: 'flex-start' }}>
            <div>
              <label class="fm-lbl2">Assign to</label>
              ${AssigneePicker
                ? h`<${AssigneePicker} value=${arr(d.assignee_ids)} disabled=${!canManage}
                    onChange=${ids => setSetting('defaults.assignee_ids', ids)}/>`
                : h`<span class="fm-hint">Assignee picker unavailable</span>`}
            </div>
            <div>
              <label class="fm-lbl2">Priority</label>
              ${PriorityPicker
                ? h`<${PriorityPicker} value=${d.priority || null} disabled=${!canManage}
                    onChange=${v => setSetting('defaults.priority', v || null)}/>`
                : null}
            </div>
            <div>
              <label class="fm-lbl2" for="fm-due-days">Due in (days)</label>
              <input id="fm-due-days" type="number" min=${0} max=${365} class="fm-input" style=${{ width: 92 }} disabled=${!canManage}
                value=${d.due_days == null ? '' : d.due_days} placeholder="—"
                onInput=${e => setSetting('defaults.due_days', e.target.value === '' ? null : String(Math.max(0, Math.min(365, Number(e.target.value) || 0))))}/>
            </div>
            <div>
              <label class="fm-lbl2">Tags</label>
              ${TagPicker
                ? h`<${TagPicker} value=${arr(d.tag_ids)} disabled=${!canManage} showToast=${showToast}
                    onChange=${ids => setSetting('defaults.tag_ids', ids)}/>`
                : null}
            </div>
          </div>
          <div class="fm-hint">A date field mapped to “Due date” wins over the days-from-now default.</div>

          <div style=${{ height: 14 }}></div>
          <label class="fm-lbl2" for="fm-title-tpl">Task name</label>
          <input id="fm-title-tpl" class="fm-input" disabled=${!canManage} value=${s.title_template || ''}
            placeholder="{{form}}: {{first}}" onInput=${e => setSetting('title_template', e.target.value)}/>
          <div class="fm-hint">
            Tokens: ${'{{form}}'} · ${'{{submitter}}'} · ${'{{date}}'} · ${'{{first}}'} · any field key —
            ${arr(draft.fields).filter(f => f.type !== 'heading').slice(0, 8).map(f => h`<button key=${f.key} type="button"
              class="fm-badge" style=${{ cursor: 'pointer', border: 'none' }} disabled=${!canManage}
              onClick=${() => setSetting('title_template', (s.title_template || '') + '{{' + f.key + '}}')}>${'{{' + f.key + '}}'}</button>`)}
          </div>
        </div>`)}

        ${card('After someone submits', 'ti-checkbox', h`<div>
          <div class="fm-row" style=${{ gap: 14, marginBottom: 10 }}>
            ${[['message', 'Show a message'], ['redirect', 'Redirect to a link']].map(([k, lbl]) => h`
              <label key=${k} class="fm-row" style=${{ gap: 6, cursor: 'pointer' }}>
                <input type="radio" name="fm-conf" checked=${(conf.mode || 'message') === k} disabled=${!canManage}
                  onChange=${() => setSetting('confirmation.mode', k)}/>${lbl}
              </label>`)}
          </div>
          ${(conf.mode || 'message') === 'message' ? h`<div>
            <label class="fm-lbl2" for="fm-conf-title">Heading</label>
            <input id="fm-conf-title" class="fm-input" maxLength=${120} disabled=${!canManage} value=${conf.title || ''}
              placeholder="Thanks — we have got it" onInput=${e => setSetting('confirmation.title', e.target.value)}/>
            <label class="fm-lbl2" style=${{ marginTop: 10 }} for="fm-conf-msg">Message</label>
            <textarea id="fm-conf-msg" class="fm-textarea" rows=${3} maxLength=${2000} disabled=${!canManage} value=${conf.message || ''}
              placeholder="Your request has reached the team. We will be in touch shortly."
              onInput=${e => setSetting('confirmation.message', e.target.value)}></textarea>
            <label class="fm-row" style=${{ gap: 6, marginTop: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked=${conf.allow_another !== 'false' && conf.allow_another !== false} disabled=${!canManage}
                onChange=${e => setSetting('confirmation.allow_another', e.target.checked ? 'true' : 'false')}/>
              Offer “Submit another response”
            </label>
          </div>` : h`<div>
            <label class="fm-lbl2" for="fm-conf-url">Redirect to</label>
            <input id="fm-conf-url" class="fm-input" type="url" disabled=${!canManage} value=${conf.redirect_url || ''}
              placeholder="https://your-site.com/thank-you" onInput=${e => setSetting('confirmation.redirect_url', e.target.value)}/>
            <div class="fm-hint">Must start with https:// — anything else is ignored and the message is shown instead.</div>
          </div>`}
        </div>`)}

        ${card('Notify', 'ti-bell', h`<div>
          <label class="fm-lbl2">Tell these people about every response</label>
          ${AssigneePicker
            ? h`<${AssigneePicker} value=${arr(s.notify_ids)} disabled=${!canManage} label="Notify"
                onChange=${ids => setSetting('notify_ids', ids)}/>`
            : null}
          <div class="fm-hint">Assignees are always notified — this is for anyone else who should see it in their Inbox.</div>
        </div>`)}

        ${card('Access', 'ti-lock', h`<div>
          <label class="fm-lbl2" for="fm-audience">Who can fill this in</label>
          <select id="fm-audience" class="fm-select" disabled=${!canManage} value=${draft.audience}
            onChange=${e => update({ audience: e.target.value })}>
            <option value="public">Anyone with the link</option>
            <option value="internal">Team members only (must be signed in)</option>
          </select>
          <div class="fm-row" style=${{ marginTop: 12, gap: 18, alignItems: 'flex-start' }}>
            <div>
              <label class="fm-lbl2" for="fm-max-sub">Stop after N responses</label>
              <input id="fm-max-sub" type="number" min=${0} class="fm-input" style=${{ width: 120 }} disabled=${!canManage}
                value=${lim.max_submissions == null ? '' : lim.max_submissions} placeholder="No limit"
                onInput=${e => setSetting('limits.max_submissions', e.target.value === '' ? null : String(Math.max(0, Number(e.target.value) || 0)))}/>
            </div>
            <div>
              <label class="fm-lbl2" for="fm-close-at">Close on</label>
              <input id="fm-close-at" type="date" class="fm-input" style=${{ width: 170 }} disabled=${!canManage}
                value=${lim.close_at ? String(lim.close_at).slice(0, 10) : ''}
                onInput=${e => setSetting('limits.close_at', e.target.value ? new Date(e.target.value + 'T23:59:00+05:30').toISOString() : null)}/>
            </div>
          </div>
          <label class="fm-lbl2" style=${{ marginTop: 12 }} for="fm-closed-msg">Message when closed</label>
          <textarea id="fm-closed-msg" class="fm-textarea" rows=${2} maxLength=${1000} disabled=${!canManage}
            value=${s.closed_message || ''} placeholder="This form is not accepting responses right now."
            onInput=${e => setSetting('closed_message', e.target.value)}></textarea>
        </div>`)}

        ${card('Spam protection', 'ti-shield-check', h`<div class="fm-row" style=${{ gap: 18, alignItems: 'flex-start' }}>
          <div>
            <label class="fm-lbl2" for="fm-min-sec">Minimum fill time (seconds)</label>
            <input id="fm-min-sec" type="number" min=${0} max=${120} class="fm-input" style=${{ width: 110 }} disabled=${!canManage}
              value=${spam.min_seconds == null ? '' : spam.min_seconds} placeholder="3"
              onInput=${e => setSetting('spam.min_seconds', e.target.value === '' ? null : String(Math.max(0, Math.min(120, Number(e.target.value) || 0))))}/>
          </div>
          <div>
            <label class="fm-lbl2" for="fm-per-ip">Max per visitor / 10 min</label>
            <input id="fm-per-ip" type="number" min=${1} max=${100} class="fm-input" style=${{ width: 110 }} disabled=${!canManage}
              value=${spam.per_ip_10min == null ? '' : spam.per_ip_10min} placeholder="5"
              onInput=${e => setSetting('spam.per_ip_10min', e.target.value === '' ? null : String(Math.max(1, Math.min(100, Number(e.target.value) || 1))))}/>
          </div>
          <div>
            <label class="fm-lbl2" for="fm-per-min">Max per minute (all visitors)</label>
            <input id="fm-per-min" type="number" min=${1} max=${999} class="fm-input" style=${{ width: 130 }} disabled=${!canManage}
              value=${spam.per_minute == null ? '' : spam.per_minute} placeholder="30"
              onInput=${e => setSetting('spam.per_minute', e.target.value === '' ? null : String(Math.max(1, Math.min(999, Number(e.target.value) || 1))))}/>
          </div>
        </div>`, 'A hidden honeypot field is always on. Submissions that trip these checks are kept as “Spam” — you can turn a genuine one into a task from the Responses tab.')}

        ${card('Branding', 'ti-palette', h`<div>
          <label class="fm-row" style=${{ gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked=${brand.show_logo !== 'false' && brand.show_logo !== false} disabled=${!canManage}
              onChange=${e => setSetting('branding.show_logo', e.target.checked ? 'true' : 'false')}/>
            Show the organisation logo
          </label>
          <div class="fm-row" style=${{ marginTop: 12 }}>
            <div>
              <label class="fm-lbl2" for="fm-accent">Accent colour</label>
              <input id="fm-accent" type="color" class="fm-input" style=${{ width: 70, padding: 2, height: 32 }} disabled=${!canManage}
                value=${brand.color || '#ff00ee'} onInput=${e => setSetting('branding.color', e.target.value)}/>
            </div>
            ${brand.color ? h`<button type="button" class="fm-btn fm-btn-ghost" disabled=${!canManage}
              onClick=${() => setSetting('branding.color', null)}>Use organisation colour</button>` : null}
            <label class="fm-row" style=${{ gap: 6, marginLeft: 'auto', cursor: 'pointer' }}>
              <input type="checkbox" checked=${brand.hide_powered_by === 'true' || brand.hide_powered_by === true} disabled=${!canManage}
                onChange=${e => setSetting('branding.hide_powered_by', e.target.checked ? 'true' : 'false')}/>
              Hide “Powered by”
            </label>
          </div>
          <div class="fm-hint">The logo and default colour come from Settings → Agency (per workspace).</div>
        </div>`)}

        ${card('Link', 'ti-link', h`<div>
          <label class="fm-lbl2" for="fm-slug">Public link</label>
          <div class="fm-row">
            <span style=${{ fontSize: 12.5, color: 'var(--cu-t3)' }}>${appBase()}?form=</span>
            <input id="fm-slug" class="fm-input" style=${{ flex: 1, minWidth: 140 }} value=${slug} disabled=${!canManage}
              onInput=${e => setSlug(e.target.value)}/>
            <button type="button" class="fm-btn" disabled=${!canManage || slugBusy || !slug.trim() || slug === (meta && meta.slug)}
              onClick=${saveSlug}>${slugBusy ? 'Saving…' : 'Save link'}</button>
          </div>
          <div class="fm-hint">Lowercase letters, numbers and dashes. Changing it breaks any link already shared.</div>
        </div>`)}

        ${card('Owner', 'ti-user-cog', h`<div>
          <label class="fm-lbl2">Tasks are created by</label>
          ${AssigneePicker
            ? h`<${AssigneePicker} value=${meta && meta.owner_id ? [meta.owner_id] : []} multi=${false} disabled=${!canManage} label="Form owner"
                onChange=${async (ids) => {
                  try { const res = await FormsAPI.upsert({ id: draft.id, owner_id: ids[0] || null }); setMeta(res); }
                  catch (e) { showToast && showToast(errText(e)); }
                }}/>`
            : null}
          <div class="fm-hint">The owner is the “system actor” behind every task this form creates, and can always edit the form.</div>
        </div>`)}
      </div>`;
    }

    // ---- Responses tab -----------------------------------------------------
    const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const toCsv = (rows) => rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    function downloadCsv(name, text) {
      try {
        const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
        return true;
      } catch (_) { return false; }
    }

    function ResponsesTab({ form, meta, showToast, canManage }) {
      const [status, setStatus] = useState('ok');
      const [q, setQ] = useState('');
      const [data, setData] = useState(null);
      const [err, setErr] = useState(null);
      const [limit, setLimit] = useState(100);
      const [open, setOpen] = useState(null);
      const [busy, setBusy] = useState(false);
      const [ask, askNode] = useAsk();

      const load = useCallback(async () => {
        try { const r = await FormsAPI.submissions(form.id, { status, search: q.trim() || undefined, limit }); setData(r); setErr(null); }
        catch (e) { setErr(e); setData(null); }
      }, [form.id, status, q, limit]);
      useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load]);

      const fields = arr((data && data.fields) || form.fields).filter(f => f.type !== 'heading');
      const cols = fields.slice(0, 6);
      const rows = arr(data && data.rows);
      const counts = (data && data.counts) || {};

      const exportCsv = async () => {
        setBusy(true);
        try {
          let all = [], offset = 0;
          for (let i = 0; i < 10; i++) {
            const page = await FormsAPI.submissions(form.id, { status, search: q.trim() || undefined, limit: 500, offset });
            all = all.concat(arr(page.rows));
            if (all.length >= (page.total || 0) || !arr(page.rows).length) break;
            offset += 500;
          }
          const head = ['Submitted', 'Status', 'Task', 'Task title', 'Task status', 'Submitted by', 'Email']
            .concat(fields.map(f => f.label));
          const body = all.map(r => [
            fmtStamp(r.created_at), r.status, (r.task && r.task.custom_id) || '', (r.task && r.task.title) || '',
            (r.task && r.task.status_name) || '', r.submitter_name || '', r.submitter_email || '',
          ].concat(fields.map(f => displayValue(f, (r.data || {})[f.key]))));
          const ok = downloadCsv((form.name || 'form').replace(/[^\w.-]+/g, '_').slice(0, 60) + '-responses.csv', toCsv([head].concat(body)));
          showToast && showToast(ok ? 'Exported ' + all.length + ' responses' : 'Could not create the CSV file');
        } catch (e) { showToast && showToast(errText(e)); }
        finally { setBusy(false); }
      };

      const makeTask = async (row) => {
        try { await FormsAPI.createTaskFor(row.id); showToast && showToast('Task created'); setOpen(null); load(); }
        catch (e) { showToast && showToast(errText(e)); }
      };
      const del = async (row) => {
        const ok = await ask({ title: 'Delete this response?', body: 'The response is removed from this list. Any task it created stays.', danger: true, confirmLabel: 'Delete' });
        if (!ok) return;
        try { await FormsAPI.deleteSubmission(row.id); setOpen(null); load(); }
        catch (e) { showToast && showToast(errText(e)); }
      };

      if (err) return h`<div class="fm-wrap">${isMissingRpc(err) ? h`<${MissingMigration} what="Responses"/>`
        : h`<div class="fm-note bad" style=${{ padding: 14 }}>${errText(err)}</div>`}</div>`;

      return h`<div class="fm-wrap">
        <div class="fm-row" style=${{ marginBottom: 12 }}>
          ${[['ok', 'Responses', counts.ok], ['spam', 'Spam', counts.spam], ['error', 'Errors', counts.error], ['all', 'All', null]].map(([k, lbl, n]) => h`
            <button key=${k} type="button" class=${'fm-btn' + (status === k ? ' fm-btn-pri' : '')} onClick=${() => setStatus(k)}>
              ${lbl}${n ? ' (' + n + ')' : ''}
            </button>`)}
          <span style=${{ flex: 1 }}></span>
          <input class="fm-input" style=${{ width: 190, height: 30 }} value=${q} placeholder="Search answers…"
            aria-label="Search responses" onInput=${e => setQ(e.target.value)}/>
          <button type="button" class="fm-btn" onClick=${load} aria-label="Refresh"><i class="ti ti-refresh"></i></button>
          <button type="button" class="fm-btn" disabled=${busy || !rows.length} onClick=${exportCsv}>
            <i class="ti ti-download"></i>${busy ? 'Exporting…' : 'CSV'}</button>
        </div>

        ${data === null ? h`<div>${[1, 2, 3].map(i => h`<div key=${i} class="fm-skel"></div>`)}</div>`
          : !rows.length ? h`<div style=${{ padding: '26px 0' }}>
              ${EmptyState ? h`<${EmptyState} icon="ti-inbox"
                title=${status === 'spam' ? 'No spam' : status === 'error' ? 'No failures' : 'No responses yet'}
                sub=${status === 'ok' ? 'Share the public link — every response shows up here and as a task.' : ''}/>` : 'Nothing here'}
            </div>`
            : h`<${Fragment}>
              <div class="fm-scroll-x"><table class="fm-tbl">
                <thead><tr>
                  <th>Submitted</th><th>Task</th><th>From</th>
                  ${cols.map(f => h`<th key=${f.key}>${f.label}</th>`)}
                  <th style=${{ width: 34 }}></th>
                </tr></thead>
                <tbody>
                  ${rows.map(r => h`<tr key=${r.id} style=${{ cursor: 'pointer' }} onClick=${() => setOpen(r)}>
                    <td style=${{ whiteSpace: 'nowrap' }}>
                      ${fmtStamp(r.created_at)}
                      ${r.status !== 'ok' ? h`<span class=${'fm-pill ' + (r.status === 'spam' ? 'warn' : 'bad')} style=${{ marginLeft: 6 }}>${r.status}</span>` : null}
                    </td>
                    <td onClick=${e => { if (r.task) { e.stopPropagation(); openTask(r.task.id); } }}>
                      ${r.task ? h`<span class="fm-row" style=${{ gap: 6 }}>
                        <span style=${{ fontVariantNumeric: 'tabular-nums', color: 'var(--cu-t3)' }}>${r.task.custom_id}</span>
                        <span class="fm-pill" style=${{ background: (r.task.status_color || '#87909e') + '24', color: r.task.status_color || 'var(--cu-t2)' }}>
                          ${r.task.status_name}</span>
                      </span>` : h`<span style=${{ color: 'var(--cu-t3)' }}>—</span>`}
                    </td>
                    <td class="fm-trunc" style=${{ maxWidth: 160 }}>${r.submitter_name || r.submitter_email || 'Anonymous'}</td>
                    ${cols.map(f => h`<td key=${f.key} class="fm-trunc" style=${{ maxWidth: 190 }}>${displayValue(f, (r.data || {})[f.key])}</td>`)}
                    <td onClick=${e => e.stopPropagation()}>
                      <${RowMenu} items=${[
                        r.task ? { key: 'open', label: 'Open task', icon: 'ti-external-link', onSelect: () => openTask(r.task.id) } : null,
                        !r.task && canManage ? { key: 'mk', label: 'Create task', icon: 'ti-plus', onSelect: () => makeTask(r) } : null,
                        { key: 'view', label: 'View response', icon: 'ti-eye', onSelect: () => setOpen(r) },
                        canManage ? { key: 'del', label: 'Delete response', icon: 'ti-trash', danger: true, onSelect: () => del(r) } : null,
                      ].filter(Boolean)}/>
                    </td>
                  </tr>`)}
                </tbody>
              </table></div>
              ${data && data.total > rows.length ? h`<div style=${{ textAlign: 'center', marginTop: 12 }}>
                <button type="button" class="fm-btn" onClick=${() => setLimit(l => l + 100)}>
                  Load more (${rows.length} of ${data.total})</button>
              </div>` : null}
            <//>`}

        ${open ? h`<div class="fm-drawer-bg" onMouseDown=${e => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div class="fm-drawer" role="dialog" aria-label="Response">
            <div class="fm-modal-hd">
              <span style=${{ flex: 1 }}>Response · ${fmtStamp(open.created_at)}</span>
              <button type="button" class="fm-ibtn" aria-label="Close" onClick=${() => setOpen(null)}><i class="ti ti-x"></i></button>
            </div>
            <div class="fm-modal-b" style=${{ flex: 1 }}>
              ${open.status !== 'ok' ? h`<div class=${'fm-note' + (open.status === 'error' ? ' bad' : '')} style=${{ marginBottom: 12 }}>
                ${open.status === 'spam'
                  ? 'Flagged as spam (' + ((open.meta && open.meta.spam_reason) || 'automated') + '). No task was created.'
                  : 'The task could not be created: ' + (open.error || 'unknown error')}
              </div>` : null}
              <dl class="fm-kv">
                ${fields.map(f => h`<${Fragment} key=${f.key}>
                  <dt>${f.label}</dt>
                  <dd>${f.type === 'file'
                    ? arr((open.data || {})[f.key]).map((x, i) => h`<div key=${i}>
                        <a href=${x.url} target="_blank" rel="noopener">${x.name}</a> <span style=${{ color: 'var(--cu-t3)' }}>${fmtBytes(x.size)}</span>
                      </div>`)
                    : (displayValue(f, (open.data || {})[f.key]) || '—')}</dd>
                <//>`)}
                ${open.submitter_email ? h`<${Fragment}><dt>Email</dt><dd>${open.submitter_email}</dd><//>` : null}
                ${open.meta && open.meta.referrer ? h`<${Fragment}><dt>Came from</dt><dd>${open.meta.referrer}</dd><//>` : null}
                ${open.meta && open.meta.utm ? h`<${Fragment}><dt>UTM</dt><dd>${JSON.stringify(open.meta.utm)}</dd><//>` : null}
              </dl>
            </div>
            <div class="fm-modal-ft">
              ${open.task ? h`<button type="button" class="fm-btn fm-btn-pri" onClick=${() => openTask(open.task.id)}>
                <i class="ti ti-external-link"></i>Open task</button>`
                : canManage ? h`<button type="button" class="fm-btn fm-btn-pri" onClick=${() => makeTask(open)}>
                  <i class="ti ti-plus"></i>Create task</button>` : null}
              <span style=${{ flex: 1 }}></span>
              ${canManage ? h`<button type="button" class="fm-btn fm-btn-danger" onClick=${() => del(open)}>Delete</button>` : null}
            </div>
          </div>
        </div>` : null}
        ${askNode}
      </div>`;
    }

    // ---- Share tab ---------------------------------------------------------
    function ShareTab({ draft, meta, showToast, canManage }) {
      const url = publicUrl(meta && meta.slug);
      const code = embedCode(meta && meta.slug);
      const copyRow = (label, value, hint) => h`<div style=${{ marginBottom: 16 }}>
        <label class="fm-lbl2">${label}</label>
        <div class="fm-row">
          <input class="fm-input" readOnly value=${value} style=${{ flex: 1, minWidth: 160 }} onFocus=${e => e.target.select()}/>
          <button type="button" class="fm-btn" onClick=${async () => { await copyText(value); showToast && showToast('Copied'); }}>
            <i class="ti ti-copy"></i>Copy</button>
        </div>
        ${hint ? h`<div class="fm-hint">${hint}</div>` : null}
      </div>`;

      return h`<div class="fm-wrap" style=${{ maxWidth: 760 }}>
        <div class="fm-card"><div class="fm-card-b">
          <div class="fm-row" style=${{ marginBottom: 14 }}>
            ${meta ? h`<${StatusPillFor} f=${meta}/>` : null}
            <span class="fm-sub">
              ${draft.audience === 'internal'
                ? 'Only signed-in team members can open this link.'
                : 'Anyone with this link can fill it in — no login needed.'}
            </span>
            <span style=${{ flex: 1 }}></span>
            <button type="button" class="fm-btn" onClick=${() => window.open(url, '_blank', 'noopener')}>
              <i class="ti ti-external-link"></i>Open form</button>
          </div>
          ${copyRow('Public link', url, 'Share it by email or WhatsApp, or put it behind a “Request content” button on the site.')}
          ${copyRow('Embed on a website', code, 'Paste this into any page — the form renders inside the iframe, in light or dark.')}
          ${!(meta && meta.accepting) ? h`<div class="fm-note bad">
            This form is not accepting responses right now, so the link shows a closed message.</div>` : null}
        </div></div>
      </div>`;
    }

    // =========================================================================
    // Page (AMS_EXT 'pages') + view renderer + registrations
    // =========================================================================
    function FormsPage({ currentUser, showToast, params, app }) {
      const store = useTaskStore();
      const p = arr(params);
      const id = p[0] && p[0] !== 'new' ? p[0] : null;
      const tab = p[1] || 'build';
      const [startNew, setStartNew] = useState(p[0] === 'new');
      useEffect(() => { setStartNew(p[0] === 'new'); }, [p[0]]);

      const go = (path) => { try { location.hash = '#/forms' + (path ? '/' + path : ''); } catch (_) { } };
      if (store && store.featureOn && store.featureOn('forms') === false) {
        return h`<div class="fm-app"><div class="fm-wrap">
          ${EmptyState ? h`<${EmptyState} icon="ti-forms" title="Forms are turned off"
            sub="An admin can switch them back on in Settings → Work schedule & ClickApps."/>` : 'Forms are turned off'}
        </div></div>`;
      }
      if (id) {
        return h`<${FormBuilder} formId=${id} currentUser=${currentUser} showToast=${showToast} tab=${tab}
          onTab=${(t) => go(id + (t === 'build' ? '' : '/' + t))} onBack=${() => go('')}/>`;
      }
      return h`<${FormsHub} currentUser=${currentUser} showToast=${showToast} startNew=${startNew}
        onNewHandled=${() => { if (p[0] === 'new') go(''); }} onOpen=${(fid, t) => go(fid + (t ? '/' + t : ''))}/>`;
    }

    // views registry: a "Form" tab inside any list/client view
    function FormViewTab({ scope, config, setConfig, currentUser, showToast }) {
      const [rows, setRows] = useState(null);
      const [err, setErr] = useState(null);
      const [tpl, setTpl] = useState(false);
      const [busy, setBusy] = useState(false);
      const cfg = config || {};
      const load = useCallback(async () => {
        try { setRows(arr(await FormsAPI.list())); setErr(null); } catch (e) { setErr(e); setRows([]); }
      }, []);
      useEffect(() => { load(); }, [load]);

      const inScope = arr(rows).filter(f => (scope && scope.listId ? f.list_id === scope.listId
        : scope && scope.clientId ? f.client_id === scope.clientId : !f.client_id));

      if (cfg.form_id) {
        return h`<div style=${{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <${FormBuilder} formId=${cfg.form_id} currentUser=${currentUser} showToast=${showToast}
            tab=${cfg.form_tab || 'build'} onTab=${(t) => setConfig && setConfig({ form_tab: t })}
            onBack=${() => setConfig && setConfig({ form_id: null })} embedded=${true}/>
        </div>`;
      }

      const create = async (t) => {
        setBusy(true);
        try {
          const res = await FormsAPI.upsert({
            name: t.name === 'Blank form' ? 'Untitled form' : t.name, description: t.description || null,
            audience: t.audience || 'public', fields: t.key === 'ai' ? t.fields : templateFields(t),
            settings: t.settings || {}, template_key: t.key,
            list_id: (scope && scope.listId) || null, client_id: (scope && scope.clientId) || null,
          });
          setTpl(false);
          if (res && res.id && setConfig) setConfig({ form_id: res.id });
          load();
        } catch (e) { showToast && showToast(errText(e)); }
        finally { setBusy(false); }
      };

      return h`<div class="fm-app"><div class="fm-wrap">
        ${err && isMissingRpc(err) ? h`<${MissingMigration}/>`
          : h`<${Fragment}>
            <div class="fm-row" style=${{ marginBottom: 12 }}>
              <strong style=${{ flex: 1 }}>Forms for this ${scope && scope.listId ? 'list' : scope && scope.clientId ? 'client' : 'space'}</strong>
              <button type="button" class="fm-btn fm-btn-pri" onClick=${() => setTpl(true)}><i class="ti ti-plus"></i>New form</button>
            </div>
            ${rows === null ? h`<div class="fm-skel"></div>`
              : !inScope.length ? h`<div class="fm-hint">No form points here yet. Create one and every response becomes a task in this list.</div>`
                : inScope.map(f => h`<div key=${f.id} class="fm-card"><div class="fm-card-b">
                    <div class="fm-row">
                      <span class="fm-mark"><i class="ti ti-forms"></i></span>
                      <div style=${{ flex: 1, minWidth: 0 }}>
                        <div style=${{ fontWeight: 600 }}>${f.name}</div>
                        <div class="fm-sub">${f.submission_count || 0} responses · ${f.field_count} fields</div>
                      </div>
                      <${StatusPillFor} f=${f}/>
                      <button type="button" class="fm-btn" onClick=${() => setConfig && setConfig({ form_id: f.id })}>Open</button>
                      <button type="button" class="fm-btn" onClick=${async () => { await copyText(publicUrl(f.slug)); showToast && showToast('Link copied'); }}>
                        <i class="ti ti-link"></i></button>
                    </div>
                  </div></div>`)}
          <//>`}
        ${tpl ? h`<${TemplateModal} busy=${busy} showToast=${showToast} onClose=${() => setTpl(false)} onPick=${create}/>` : null}
      </div></div>`;
    }

    const staffRole = (r) => !!r && r !== 'client' && r !== 'freelancer';
    reg('pages', {
      id: 'forms', label: 'Forms', icon: 'ti-forms', section: 'more', order: 60,
      apps: ['dashboard', 'tasks'], roles: staffRole, fullHeight: true, Component: FormsPage,
    });
    reg('createItems', {
      key: 'form', label: 'Form', icon: 'ti-forms', order: 35, roles: staffRole,
      run: () => { location.hash = '#/forms/new'; },
    });
    reg('views', { key: 'form', label: 'Form', icon: 'ti-forms', desc: 'Collect requests into this list', Component: FormViewTab });

    let palCache = { at: 0, rows: [] };
    reg('paletteProviders', {
      id: 'forms', label: 'Forms', icon: 'ti-forms', roles: staffRole,
      search: async (q) => {
        try {
          if (Date.now() - palCache.at > 60000) palCache = { at: Date.now(), rows: arr(await FormsAPI.list()) };
          const s = String(q || '').trim().toLowerCase();
          return palCache.rows
            .filter(f => !s || (f.name || '').toLowerCase().indexOf(s) >= 0 || (f.slug || '').toLowerCase().indexOf(s) >= 0)
            .slice(0, 8)
            .map(f => ({
              id: 'form:' + f.id, label: f.name, icon: 'ti-forms',
              sub: [(f.accepting ? 'Open' : 'Closed'), (f.submission_count || 0) + ' responses', f.client_name || 'Agency'].join(' · '),
              run: () => { location.hash = '#/forms/' + f.id; },
            }));
        } catch (_) { return []; }
      },
    });

    return {
      PublicFormPage, FormsPage, FormBuilder, FormRenderer, FormViewTab,
      FormsAPI, FORM_TEMPLATES, normalizeFields,
    };
  }

  window.AMS_FORMS = { buildForms };
})();

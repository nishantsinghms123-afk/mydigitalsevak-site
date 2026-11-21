/* ============================================================================
 * leads.js — sales pipeline for website leads (ClickUp parity v2, §4 O)
 *
 *   window.AMS_LEADS.buildLeads(deps) → { LeadsPage, LeadsAPI, NewLeadModal }
 *
 * Registers into window.AMS_EXT (contract v2 §2):
 *   pages            'leads'  (admin/manager, route #/leads · #/leads/new)
 *   createItems      'lead'
 *   paletteProviders 'leads'
 *   taskMenuItems    'lead-convert'  ("Convert to client" inside TaskPanel)
 *
 * Every lead is a task: type 'lead' in the Agency "Leads" list with list-specific
 * statuses New → Contacted → Proposal sent → Negotiation → Won / Lost and custom
 * fields (company, email, phone, source, deal value, next follow-up). Migration 104
 * syncs the global `leads` table (062/077) both ways for the platform org; tenant
 * orgs get the same pipeline, tasks-only.
 *
 * Fail-open: without migration 104 the page falls back to the legacy read-only
 * `leads_list` table so captured leads are never hidden.
 * ==========================================================================*/
(function () {
  function buildLeads(deps) {
    const {
      React, h, useState, useEffect, useRef, useCallback, useMemo,
      rpcCall, Skel, fmtRelative,
      useTaskStore, useTasks, TaskAPI, openTask,
      StatusPicker, AssigneePicker, AssigneeStack, DatePicker, DueChip, EmptyState,
      Popover, Menu, MemberAvatar,
    } = deps;
    const Fragment = React.Fragment;

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-leads-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-leads-styles';
      st.textContent = `
      .ld,.ld *{box-sizing:border-box}
      .ld{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--cu-t1,#1f1f23);display:flex;flex-direction:column;flex:1;min-height:0;background:var(--cu-bg,#fff)}
      .ld-wrap{padding:16px 20px 32px;max-width:1500px;width:100%;margin:0 auto;display:flex;flex-direction:column;flex:1;min-height:0}
      .ld-h1{font-size:22px;font-weight:600;margin:0}
      .ld-sub{font-size:12.5px;color:var(--cu-t3,#8e8e99);margin-top:2px}
      .ld-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 11px;border-radius:6px;border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:600 13px/1 inherit;font-family:inherit;cursor:pointer;white-space:nowrap}
      .ld-btn:hover{background:var(--cu-bg3,#efeff1)}
      .ld-btn:disabled{opacity:.5;cursor:not-allowed}
      .ld-btn.pri{background:var(--cu-accent,#ff00ee);border-color:var(--cu-accent,#ff00ee);color:#fff}
      .ld-btn.ghost{border-color:transparent;background:transparent;color:var(--cu-t2,#5c5c66)}
      .ld-ibtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:var(--cu-t2,#5c5c66);cursor:pointer;font-size:15px;padding:0;flex-shrink:0;text-decoration:none}
      .ld-ibtn:hover{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23)}
      .ld button:focus-visible,.ld input:focus-visible,.ld select:focus-visible,.ld textarea:focus-visible,.ld a:focus-visible{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:1px}
      .ld-in{height:30px;padding:0 10px;border:1px solid var(--cu-bd2,#d6d6db);border-radius:6px;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:13px inherit;font-family:inherit;width:100%}
      .ld-in:focus{outline:none;border-color:var(--cu-accent,#ff00ee)}
      .ld-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}
      .ld-stat{border:1px solid var(--cu-bd,#e8e8eb);border-radius:10px;padding:10px 12px;background:var(--cu-bg,#fff);min-width:0}
      .ld-stat-l{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3,#8e8e99)}
      .ld-stat-v{font-size:20px;font-weight:600;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ld-stat-s{font-size:11.5px;color:var(--cu-t3,#8e8e99);margin-top:1px}
      .ld-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .ld-tabs{display:inline-flex;gap:2px;background:var(--cu-bg2,#f7f7f8);border-radius:8px;padding:3px}
      .ld-tab{border:none;background:transparent;color:var(--cu-t2,#5c5c66);font:600 12.5px inherit;font-family:inherit;padding:0 12px;height:28px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
      .ld-tab.on{background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);box-shadow:0 1px 2px rgba(0,0,0,.08)}
      .ld-board{display:flex;gap:12px;overflow-x:auto;flex:1;min-height:0;padding-bottom:8px;align-items:flex-start}
      .ld-col{flex:0 0 272px;width:272px;background:var(--cu-bg2,#f7f7f8);border-radius:10px;display:flex;flex-direction:column;max-height:100%;min-height:120px}
      .ld-col.over{outline:2px dashed var(--cu-accent,#ff00ee);outline-offset:-2px}
      .ld-col-hd{display:flex;align-items:center;gap:7px;padding:9px 11px;border-bottom:1px solid var(--cu-bd,#e8e8eb);position:sticky;top:0;background:inherit;border-radius:10px 10px 0 0;z-index:1}
      .ld-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
      .ld-col-t{font-size:12.5px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ld-col-n{font-size:11px;color:var(--cu-t3,#8e8e99);background:var(--cu-bg3,#efeff1);border-radius:9px;padding:1px 7px;font-weight:600}
      .ld-col-v{font-size:11px;color:var(--cu-t3,#8e8e99);padding:5px 11px 0}
      .ld-col-b{padding:8px;display:flex;flex-direction:column;gap:8px;overflow-y:auto;min-height:40px}
      .ld-card{background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);border-radius:8px;padding:9px 10px;cursor:pointer;display:flex;flex-direction:column;gap:6px;text-align:left;font-family:inherit;color:inherit;width:100%}
      .ld-card:hover{border-color:var(--cu-bd2,#d6d6db);box-shadow:0 2px 8px rgba(15,15,20,.06)}
      .ld-card.drag{opacity:.45}
      .ld-card-t{font-size:13px;font-weight:600;line-height:1.35;word-break:break-word}
      .ld-card-r{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
      .ld-chip{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:10px;background:var(--cu-bg3,#efeff1);color:var(--cu-t2,#5c5c66);font-size:11px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ld-chip.val{background:rgba(48,164,108,.12);color:#1a7f4b;font-weight:600}
      .ld-table-wrap{overflow:auto;border:1px solid var(--cu-bd,#e8e8eb);border-radius:10px;flex:1;min-height:0}
      .ld-table{width:100%;border-collapse:collapse;font-size:13px;min-width:1040px}
      .ld-table th{position:sticky;top:0;background:var(--cu-bg2,#f7f7f8);z-index:1;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3,#8e8e99);padding:8px 10px;border-bottom:1px solid var(--cu-bd,#e8e8eb);white-space:nowrap;cursor:pointer}
      .ld-table td{padding:5px 10px;border-bottom:1px solid var(--cu-bd,#e8e8eb);vertical-align:middle}
      .ld-table tr:hover td{background:var(--cu-bg2,#f7f7f8)}
      .ld-link{color:var(--cu-t1,#1f1f23);text-decoration:none;font-weight:600;cursor:pointer;background:none;border:none;padding:0;font:inherit;text-align:left}
      .ld-link:hover{color:var(--cu-accent-ink,#a8009c)}
      .ld-banner{display:flex;gap:9px;align-items:flex-start;padding:10px 12px;border-radius:8px;background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.3);font-size:12.5px;line-height:1.5;margin-bottom:12px}
      .ld-modal-bg{position:fixed;inset:0;z-index:1200;background:rgba(10,10,14,.45);display:flex;align-items:center;justify-content:center;padding:16px}
      .ld-modal{background:var(--cu-bg,#fff);border-radius:12px;box-shadow:var(--cu-shadow,0 10px 30px rgba(0,0,0,.3));width:min(560px,100%);max-height:calc(100dvh - 32px);display:flex;flex-direction:column;overflow:hidden}
      .ld-modal-hd{display:flex;align-items:center;gap:8px;padding:13px 16px;border-bottom:1px solid var(--cu-bd,#e8e8eb);font-size:15px;font-weight:600}
      .ld-modal-b{padding:16px;overflow:auto}
      .ld-modal-f{display:flex;gap:8px;align-items:center;padding:12px 16px;border-top:1px solid var(--cu-bd,#e8e8eb)}
      .ld-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3,#8e8e99);margin-bottom:4px;display:block}
      .ld-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      @media(max-width:640px){.ld-wrap{padding:12px}.ld-grid2{grid-template-columns:1fr}.ld-col{flex-basis:84vw;width:84vw}}
      `;
      document.head.appendChild(st);
    }

    // ---- helpers -------------------------------------------------------------
    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => { const k = item.id || item.key || item.type; EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item); };
    const arr = (v) => (Array.isArray(v) ? v : []);
    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i.test(String((e && (e.code || '')) + ' ' + ((e && (e.message || e.details)) || '')));
    const errText = (e) => (!e ? 'Something went wrong'
      : e.code === 'forbidden' ? "You don't have permission to do that"
      : e.code === 'auth.expired' || e.message === 'auth.no_session' ? 'Session expired — sign in again'
      : (e.message || String(e)));
    const inr = (n) => {
      const v = Number(n);
      if (!isFinite(v) || !v) return '₹0';
      try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v); }
      catch (_) { return '₹' + Math.round(v).toLocaleString('en-IN'); }
    };
    const inrShort = (n) => {
      const v = Number(n) || 0;
      if (Math.abs(v) >= 10000000) return '₹' + (v / 10000000).toFixed(v % 10000000 ? 1 : 0) + ' Cr';
      if (Math.abs(v) >= 100000) return '₹' + (v / 100000).toFixed(v % 100000 ? 1 : 0) + ' L';
      if (Math.abs(v) >= 1000) return '₹' + (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k';
      return inr(v);
    };
    const waLink = (phone) => {
      const d = String(phone || '').replace(/\D+/g, '');
      if (d.length < 10) return null;
      return 'https://wa.me/' + (d.length === 10 ? '91' + d : d);
    };
    const SOURCES = ['Website', 'Instagram', 'Referral', 'WhatsApp', 'Cold outreach', 'Walk-in', 'Event', 'Google'];

    const LeadsAPI = {
      bootstrap: () => rpcCall('leads_bootstrap'),
      create: (data) => rpcCall('lead_create', { p_data: data || {} }),
      convert: (taskId, clientId) => rpcCall('lead_convert', { p_task_id: taskId, p_client_id: clientId || null }),
      resync: () => rpcCall('leads_resync'),
      legacyList: (status, limit) => rpcCall('leads_list', { p_status: status || null, p_limit: limit || 200 }),
    };

    // Convert → open AddClientModal prefilled (index.html listens for ams-add-client),
    // then mark the lead Won. Fails open if the pipeline RPC isn't there yet.
    async function convertToClient(row, get, showToast) {
      const name = get(row, 'company') || row.title;
      const prefill = {
        name: name,
        contact_name: row.title && row.title !== name ? row.title : '',
        contact_email: get(row, 'email') || '',
        contact_phone: get(row, 'phone') || '',
        brand_brief: row.description || '',
      };
      try { window.dispatchEvent(new CustomEvent('ams-add-client', { detail: { prefill } })); } catch (_) { }
      try {
        await LeadsAPI.convert(row.id, null);
        showToast && showToast('Marked Won — finish adding the client in the dialog');
      } catch (e) {
        if (!isMissingRpc(e)) showToast && showToast(errText(e));
      }
    }

    // =========================================================================
    // New lead
    // =========================================================================
    function NewLeadModal({ pipeline, onClose, onCreated, showToast }) {
      const [f, setF] = useState({ name: '', company: '', email: '', phone: '', source: 'Website', value: '', next_follow_up: null, notes: '', assignees: [] });
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState('');
      const set = (k, v) => setF(x => ({ ...x, [k]: v }));
      const submit = async () => {
        if (!f.name.trim() && !f.company.trim() && !f.email.trim()) { setErr('Add a name, company or email.'); return; }
        if (f.email.trim() && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(f.email.trim())) { setErr('That email doesn’t look right.'); return; }
        setBusy(true); setErr('');
        try {
          const row = await LeadsAPI.create({
            name: f.name.trim() || null, company: f.company.trim() || null, email: f.email.trim() || null,
            phone: f.phone.trim() || null, source: f.source || null,
            value: f.value === '' ? null : Number(f.value), next_follow_up: f.next_follow_up || null,
            notes: f.notes.trim() || null, assignee_ids: f.assignees,
          });
          if (row && row.existing) showToast && showToast('That email is already in the pipeline — opening it');
          else showToast && showToast('Lead added');
          onCreated(row);
        } catch (e) {
          setErr(isMissingRpc(e) ? 'The leads pipeline needs migration 104 applied in Supabase.' : errText(e));
          setBusy(false);
        }
      };
      return h`<div class="ld-modal-bg" onMouseDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="ld ld-modal" role="dialog" aria-modal="true" aria-label="New lead"
          onKeyDown=${e => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}>
          <div class="ld-modal-hd"><i class="ti ti-target" style=${{ color: 'var(--cu-accent-ink,#a8009c)' }}></i>New lead
            <span style=${{ flex: 1 }}></span>
            <button type="button" class="ld-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="ld-modal-b">
            <div class="ld-grid2">
              <div><label class="ld-lbl" for="ld-n">Contact name</label>
                <input id="ld-n" class="ld-in" autoFocus value=${f.name} placeholder="Priya Sharma" onInput=${e => set('name', e.target.value)}/></div>
              <div><label class="ld-lbl" for="ld-c">Company</label>
                <input id="ld-c" class="ld-in" value=${f.company} placeholder="Kora Foods" onInput=${e => set('company', e.target.value)}/></div>
              <div><label class="ld-lbl" for="ld-e">Email</label>
                <input id="ld-e" class="ld-in" type="email" value=${f.email} placeholder="priya@kora.in" onInput=${e => set('email', e.target.value)}/></div>
              <div><label class="ld-lbl" for="ld-p">Phone</label>
                <input id="ld-p" class="ld-in" type="tel" value=${f.phone} placeholder="+91 98200 00000" onInput=${e => set('phone', e.target.value)}/></div>
              <div><label class="ld-lbl" for="ld-s">Source</label>
                <input id="ld-s" class="ld-in" list="ld-sources" value=${f.source} onInput=${e => set('source', e.target.value)}/>
                <datalist id="ld-sources">${SOURCES.map(s => h`<option key=${s} value=${s}></option>`)}</datalist></div>
              <div><label class="ld-lbl" for="ld-v">Deal value (₹)</label>
                <input id="ld-v" class="ld-in" type="number" min="0" step="1000" value=${f.value} placeholder="50000" onInput=${e => set('value', e.target.value)}/></div>
            </div>
            <div style=${{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              <div><span class="ld-lbl">Next follow-up</span>
                <${DatePicker} value=${f.next_follow_up} withTime=${false} label="Next follow-up" onChange=${iso => set('next_follow_up', iso)}/></div>
              <div><span class="ld-lbl">Owner</span>
                <${AssigneePicker} value=${f.assignees} onChange=${ids => set('assignees', ids)}/></div>
            </div>
            <label class="ld-lbl" style=${{ marginTop: 12 }} for="ld-notes">Notes</label>
            <textarea id="ld-notes" class="ld-in" style=${{ height: 70, padding: '8px 10px' }} value=${f.notes}
              placeholder="What do they want? Budget, timeline…" onInput=${e => set('notes', e.target.value)}></textarea>
            ${pipeline && pipeline.syncs_website_leads ? h`<div style=${{ fontSize: 11.5, color: 'var(--cu-t3,#8e8e99)', marginTop: 10, lineHeight: 1.5 }}>
              Leads with an email are saved to the website lead list too, so marketing stays in sync.
            </div>` : null}
            ${err ? h`<div style=${{ color: '#e5484d', fontSize: 12.5, marginTop: 10 }} role="alert">${err}</div>` : null}
          </div>
          <div class="ld-modal-f">
            <span style=${{ flex: 1 }}></span>
            <button type="button" class="ld-btn ghost" onClick=${onClose}>Cancel</button>
            <button type="button" class="ld-btn pri" disabled=${busy} onClick=${submit}>${busy ? h`<i class="ti ti-loader-2"></i>` : null}Add lead</button>
          </div>
        </div>
      </div>`;
    }

    // =========================================================================
    // Legacy fallback (migration 104 not applied)
    // =========================================================================
    function LegacyLeads({ showToast }) {
      const [rows, setRows] = useState(null);
      const [err, setErr] = useState(null);
      useEffect(() => { (async () => { try { setRows(arr(await LeadsAPI.legacyList(null, 300))); } catch (e) { setErr(e); setRows([]); } })(); }, []);
      if (err) {
        return h`<${EmptyState} icon="ti-database-off" title="Leads aren’t available"
          sub=${isMissingRpc(err) ? 'Apply migrations 077 and 104 in Supabase to use the pipeline.' : errText(err)}/>`;
      }
      return h`<${Fragment}>
        <div class="ld-banner">
          <i class="ti ti-info-circle" style=${{ color: '#b45309', fontSize: 16, flexShrink: 0 }}></i>
          <div><strong>Pipeline not set up yet.</strong> Showing captured website leads read-only.
            An admin can apply migration 104 to get the drag-and-drop pipeline, follow-ups and “Convert to client”.</div>
        </div>
        ${rows === null ? h`<${Skel} h=${220}/>`
          : !rows.length ? h`<${EmptyState} icon="ti-target" title="No leads captured yet" sub="Leads from the website land here automatically."/>`
            : h`<div class="ld-table-wrap"><table class="ld-table">
              <thead><tr><th>Email</th><th>Status</th><th>Source</th><th>Captured</th></tr></thead>
              <tbody>${rows.map(r => h`<tr key=${r.id}>
                <td>${r.email}</td><td style=${{ textTransform: 'capitalize' }}>${r.status}</td>
                <td>${r.source || '—'}</td>
                <td style=${{ color: 'var(--cu-t3,#8e8e99)' }}>${fmtRelative ? fmtRelative(r.created_at) : new Date(r.created_at).toLocaleDateString('en-IN')}</td>
              </tr>`)}</tbody>
            </table></div>`}
      <//>`;
    }

    // =========================================================================
    // Cards + board + table
    // =========================================================================
    function LeadCard({ row, get, onMenu, draggable, onDragStart, onDragEnd, dragging }) {
      const value = Number(get(row, 'value')) || 0;
      const company = get(row, 'company');
      const email = get(row, 'email');
      const phone = get(row, 'phone');
      const source = get(row, 'source');
      const wa = waLink(phone);
      return h`<div class=${'ld-card' + (dragging ? ' drag' : '')} draggable=${!!draggable}
        onDragStart=${onDragStart} onDragEnd=${onDragEnd}
        onClick=${() => openTask(row.id)} role="button" tabIndex=${0}
        onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTask(row.id); } }}
        aria-label=${'Lead: ' + row.title}>
        <div style=${{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <div class="ld-card-t" style=${{ flex: 1, minWidth: 0 }}>${row.title}</div>
          <button type="button" class="ld-ibtn" style=${{ width: 22, height: 22, fontSize: 13 }} aria-label="Lead actions"
            onClick=${e => { e.stopPropagation(); onMenu(e.currentTarget, row); }}><i class="ti ti-dots"></i></button>
        </div>
        ${company ? h`<div style=${{ fontSize: 12, color: 'var(--cu-t2,#5c5c66)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <i class="ti ti-building" style=${{ fontSize: 12, marginRight: 4 }}></i>${company}</div>` : null}
        <div class="ld-card-r">
          ${value ? h`<span class="ld-chip val">${inrShort(value)}</span>` : null}
          ${source ? h`<span class="ld-chip"><i class="ti ti-flag" style=${{ fontSize: 11 }}></i>${source}</span>` : null}
          ${row.due_at ? h`<${DueChip} row=${row}/>` : null}
        </div>
        <div class="ld-card-r" style=${{ marginTop: 2 }}>
          ${arr(row.assignees).length ? h`<${AssigneeStack} assignees=${row.assignees} size=${20}/>` : null}
          <span style=${{ flex: 1 }}></span>
          ${email ? h`<a class="ld-ibtn" href=${'mailto:' + email} title=${email} aria-label=${'Email ' + email}
            onClick=${e => e.stopPropagation()}><i class="ti ti-mail"></i></a>` : null}
          ${wa ? h`<a class="ld-ibtn" href=${wa} target="_blank" rel="noopener noreferrer" title="WhatsApp" aria-label="WhatsApp"
            onClick=${e => e.stopPropagation()}><i class="ti ti-brand-whatsapp"></i></a>` : null}
          ${phone ? h`<a class="ld-ibtn" href=${'tel:' + String(phone).replace(/\s+/g, '')} title=${phone} aria-label=${'Call ' + phone}
            onClick=${e => e.stopPropagation()}><i class="ti ti-phone"></i></a>` : null}
        </div>
      </div>`;
    }

    function PipelineBoard({ statuses, rows, get, onMove, onMenu }) {
      const [dragId, setDragId] = useState(null);
      const [overCol, setOverCol] = useState(null);
      return h`<div class="ld-board">
        ${statuses.map(s => {
          const list = rows.filter(r => r.status === s.key);
          const total = list.reduce((a, r) => a + (Number(get(r, 'value')) || 0), 0);
          return h`<section key=${s.key} class=${'ld-col' + (overCol === s.key ? ' over' : '')}
            onDragOver=${e => { e.preventDefault(); setOverCol(s.key); }}
            onDragLeave=${() => setOverCol(c => (c === s.key ? null : c))}
            onDrop=${e => { e.preventDefault(); setOverCol(null); const id = dragId || e.dataTransfer.getData('text/plain'); setDragId(null); if (id) onMove(id, s.key); }}
            aria-label=${s.name + ': ' + list.length + ' leads'}>
            <header class="ld-col-hd">
              <span class="ld-dot" style=${{ background: s.color || '#87909e' }}></span>
              <span class="ld-col-t">${s.name}</span>
              <span class="ld-col-n">${list.length}</span>
            </header>
            ${total ? h`<div class="ld-col-v">${inrShort(total)} in this stage</div>` : null}
            <div class="ld-col-b">
              ${list.map(r => h`<${LeadCard} key=${r.id} row=${r} get=${get} onMenu=${onMenu} draggable=${true}
                dragging=${dragId === r.id}
                onDragStart=${e => { setDragId(r.id); try { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; } catch (_) { } }}
                onDragEnd=${() => setDragId(null)}/>`)}
              ${!list.length ? h`<div style=${{ fontSize: 12, color: 'var(--cu-t3,#8e8e99)', padding: '10px 4px', textAlign: 'center' }}>Drop a lead here</div>` : null}
            </div>
          </section>`;
        })}
      </div>`;
    }

    function LeadsTable({ rows, get, fields, onPatch, onMenu }) {
      const [sort, setSort] = useState({ key: 'created', dir: 'desc' });
      const val = (r, k) => {
        if (k === 'name') return String(r.title || '').toLowerCase();
        if (k === 'status') return String(r.status_name || '').toLowerCase();
        if (k === 'value') return Number(get(r, 'value')) || 0;
        if (k === 'next') return r.due_at ? new Date(r.due_at).getTime() : Infinity;
        if (k === 'created') return new Date(r.created_at).getTime();
        return String(get(r, k) || '').toLowerCase();
      };
      const sorted = useMemo(() => rows.slice().sort((a, b) => {
        const x = val(a, sort.key), y = val(b, sort.key);
        const c = x < y ? -1 : x > y ? 1 : 0;
        return sort.dir === 'asc' ? c : -c;
      }), [rows, sort]);
      const th = (key, label) => h`<th key=${key} onClick=${() => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))}
        aria-sort=${sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        ${label}${sort.key === key ? h`<i class=${'ti ' + (sort.dir === 'asc' ? 'ti-chevron-up' : 'ti-chevron-down')} style=${{ fontSize: 12, marginLeft: 3 }}></i>` : null}
      </th>`;
      return h`<div class="ld-table-wrap"><table class="ld-table">
        <thead><tr>
          ${th('name', 'Lead')}${th('status', 'Stage')}${th('company', 'Company')}${th('email', 'Email')}
          ${th('phone', 'Phone')}${th('source', 'Source')}${th('value', 'Value')}${th('next', 'Next follow-up')}
          <th>Owner</th>${th('created', 'Added')}<th></th>
        </tr></thead>
        <tbody>
          ${sorted.map(r => h`<tr key=${r.id}>
            <td><button type="button" class="ld-link" onClick=${() => openTask(r.id)}>${r.title}</button></td>
            <td><${StatusPicker} row=${r} onChange=${k => onPatch(r.id, { status: k })}/></td>
            <td><${CellText} value=${get(r, 'company')} onSave=${v => onPatch(r.id, { custom_fields: { [fields.company]: v } })} placeholder="—"/></td>
            <td><${CellText} value=${get(r, 'email')} type="email" onSave=${v => onPatch(r.id, { custom_fields: { [fields.email]: v } })} placeholder="—"/></td>
            <td><${CellText} value=${get(r, 'phone')} type="tel" onSave=${v => onPatch(r.id, { custom_fields: { [fields.phone]: v } })} placeholder="—"/></td>
            <td><${CellText} value=${get(r, 'source')} onSave=${v => onPatch(r.id, { custom_fields: { [fields.source]: v } })} placeholder="—"/></td>
            <td><${CellText} value=${get(r, 'value')} type="number" fmt=${inr} onSave=${v => onPatch(r.id, { custom_fields: { [fields.value]: v === null ? null : Number(v) } })} placeholder="—"/></td>
            <td><${DatePicker} value=${r.due_at || null} withTime=${false} label="Next follow-up" done=${r.status_category === 'done'}
              onChange=${iso => onPatch(r.id, { due_at: iso, custom_fields: { [fields.next_follow_up]: iso } })}/></td>
            <td><${AssigneePicker} value=${arr(r.assignees).map(a => a.id)} onChange=${ids => onPatch(r.id, { assignee_ids: ids })}/></td>
            <td style=${{ color: 'var(--cu-t3,#8e8e99)', whiteSpace: 'nowrap' }}>${fmtRelative ? fmtRelative(r.created_at) : new Date(r.created_at).toLocaleDateString('en-IN')}</td>
            <td><button type="button" class="ld-ibtn" aria-label="Lead actions" onClick=${e => onMenu(e.currentTarget, r)}><i class="ti ti-dots"></i></button></td>
          </tr>`)}
        </tbody>
      </table></div>`;
    }

    function CellText({ value, onSave, type = 'text', placeholder, fmt }) {
      const [editing, setEditing] = useState(false);
      const [v, setV] = useState('');
      if (!editing) {
        const shown = value == null || value === '' ? (placeholder || '—') : (fmt ? fmt(value) : String(value));
        return h`<button type="button" class="ld-link" style=${{ fontWeight: 400, color: value == null || value === '' ? 'var(--cu-t3,#8e8e99)' : undefined, width: '100%' }}
          onClick=${() => { setV(value == null ? '' : String(value)); setEditing(true); }}>${shown}</button>`;
      }
      const commit = () => {
        setEditing(false);
        const t = v.trim();
        const out = t === '' ? null : (type === 'number' ? Number(t) : t);
        if (String(out == null ? '' : out) !== String(value == null ? '' : value)) onSave(out);
      };
      return h`<input class="ld-in" autoFocus type=${type} value=${v} style=${{ height: 26 }}
        onInput=${e => setV(e.target.value)} onBlur=${commit}
        onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } if (e.key === 'Escape') { setEditing(false); } }}/>`;
    }

    // =========================================================================
    // Page
    // =========================================================================
    function LeadsPage({ currentUser, showToast, params }) {
      const store = useTaskStore();
      const p = arr(params);
      const [pipeline, setPipeline] = useState(null);
      const [boot, setBoot] = useState('loading');     // loading | ready | legacy | error
      const [bootErr, setBootErr] = useState(null);
      const [tab, setTab] = useState('board');
      const [q, setQ] = useState('');
      const [owner, setOwner] = useState([]);
      const [source, setSource] = useState('');
      const [showClosed, setShowClosed] = useState(true);
      const [showNew, setShowNew] = useState(p[0] === 'new');
      const [menu, setMenu] = useState(null);
      const [syncing, setSyncing] = useState(false);
      useEffect(() => { setShowNew(p[0] === 'new'); }, [p[0]]);

      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const b = await LeadsAPI.bootstrap();
            if (!alive) return;
            if (b && b.lead_type && b.list_id) { setPipeline(b); setBoot('ready'); }
            else { setBoot('legacy'); }
          } catch (e) {
            if (!alive) return;
            setBootErr(e);
            setBoot(isMissingRpc(e) ? 'legacy' : 'error');
          }
        })();
        return () => { alive = false; };
      }, []);

      const filter = useMemo(() => (pipeline ? {
        list_ids: [pipeline.list_id], include_closed: true, top_level: true, limit: 1000, order: 'created',
      } : null), [pipeline]);
      const { rows, loading, reload } = useTasks(filter || {}, { enabled: !!filter, pollMs: 120000 });

      const fields = (pipeline && pipeline.fields) || {};
      const get = useCallback((row, key) => {
        const fid = fields[key];
        if (!fid) return null;
        const v = (row.custom_fields || {})[fid];
        return v === undefined ? null : v;
      }, [fields]);

      const statuses = arr(pipeline && pipeline.statuses);
      const sources = useMemo(() => {
        const set = new Set();
        arr(rows).forEach(r => { const s = get(r, 'source'); if (s) set.add(String(s)); });
        return Array.from(set).sort();
      }, [rows, get]);

      const visible = useMemo(() => {
        const s = q.trim().toLowerCase();
        return arr(rows).filter(r => {
          if (!showClosed && r.status_category === 'done') return false;
          if (owner.length && !arr(r.assignees).some(a => owner.includes(a.id))) return false;
          if (source && String(get(r, 'source') || '') !== source) return false;
          if (!s) return true;
          return [r.title, get(r, 'company'), get(r, 'email'), get(r, 'phone')].some(x => String(x || '').toLowerCase().includes(s));
        });
      }, [rows, q, owner, source, showClosed, get]);

      const stats = useMemo(() => {
        const open = visible.filter(r => r.status_category !== 'done');
        const openValue = open.reduce((a, r) => a + (Number(get(r, 'value')) || 0), 0);
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const weekAgo = Date.now() - 7 * 86400000;
        const won = visible.filter(r => r.status === 'won');
        const lost = visible.filter(r => r.status === 'lost');
        const wonMonth = won.filter(r => r.completed_at && new Date(r.completed_at).getTime() >= monthStart);
        const decided = won.length + lost.length;
        return {
          openCount: open.length, openValue,
          wonMonth: wonMonth.length, wonMonthValue: wonMonth.reduce((a, r) => a + (Number(get(r, 'value')) || 0), 0),
          winRate: decided ? Math.round((won.length / decided) * 100) : null,
          fresh: visible.filter(r => new Date(r.created_at).getTime() >= weekAgo).length,
          overdue: open.filter(r => r.due_at && new Date(r.due_at).getTime() < Date.now()).length,
        };
      }, [visible, get]);

      const patch = useCallback(async (id, p2) => {
        try { await TaskAPI.update(id, p2); }
        catch (e) { showToast && showToast(errText(e)); reload(); }
      }, [reload, showToast]);

      const move = useCallback((id, statusKey) => {
        const row = arr(rows).find(r => r.id === id);
        if (!row || row.status === statusKey) return;
        patch(id, { status: statusKey });
      }, [rows, patch]);

      const resync = async () => {
        setSyncing(true);
        try { const r = await LeadsAPI.resync(); showToast && showToast('Synced ' + ((r && r.synced) || 0) + ' website leads'); reload(); }
        catch (e) { showToast && showToast(errText(e)); }
        finally { setSyncing(false); }
      };

      if (boot === 'loading') return h`<div class="ld"><div class="ld-wrap"><${Skel} h=${260}/></div></div>`;
      if (boot === 'error') {
        return h`<div class="ld"><div class="ld-wrap">
          <${EmptyState} icon="ti-alert-triangle" title="Couldn’t open the pipeline" sub=${errText(bootErr)}/>
        </div></div>`;
      }

      const header = h`<div style=${{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style=${{ flex: 1, minWidth: 180 }}>
          <h1 class="ld-h1">Leads</h1>
          <div class="ld-sub">Every enquiry from the website, Instagram and referrals — through to Won.</div>
        </div>
        ${boot === 'ready' ? h`<${Fragment}>
          ${pipeline.syncs_website_leads && pipeline.unlinked_website_leads ? h`<button type="button" class="ld-btn" disabled=${syncing} onClick=${resync}>
            ${syncing ? h`<i class="ti ti-loader-2"></i>` : h`<i class="ti ti-refresh"></i>`}Sync ${pipeline.unlinked_website_leads} from website</button>` : null}
          <button type="button" class="ld-btn pri" onClick=${() => setShowNew(true)}><i class="ti ti-plus"></i>New lead</button>
        <//>` : null}
      </div>`;

      if (boot === 'legacy') {
        return h`<div class="ld"><div class="ld-wrap">${header}<div style=${{ marginTop: 14 }}><${LegacyLeads} showToast=${showToast}/></div></div></div>`;
      }

      return h`<div class="ld"><div class="ld-wrap">
        ${header}
        <div class="ld-stats">
          <div class="ld-stat"><div class="ld-stat-l">Open pipeline</div>
            <div class="ld-stat-v">${inrShort(stats.openValue)}</div>
            <div class="ld-stat-s">${stats.openCount} open lead${stats.openCount === 1 ? '' : 's'}</div></div>
          <div class="ld-stat"><div class="ld-stat-l">Won this month</div>
            <div class="ld-stat-v">${inrShort(stats.wonMonthValue)}</div>
            <div class="ld-stat-s">${stats.wonMonth} deal${stats.wonMonth === 1 ? '' : 's'}</div></div>
          <div class="ld-stat"><div class="ld-stat-l">Win rate</div>
            <div class="ld-stat-v">${stats.winRate == null ? '—' : stats.winRate + '%'}</div>
            <div class="ld-stat-s">of decided leads</div></div>
          <div class="ld-stat"><div class="ld-stat-l">New this week</div>
            <div class="ld-stat-v">${stats.fresh}</div>
            <div class="ld-stat-s">${stats.overdue ? stats.overdue + ' follow-up' + (stats.overdue === 1 ? '' : 's') + ' overdue' : 'follow-ups on track'}</div></div>
        </div>

        <div class="ld-bar">
          <div class="ld-tabs" role="tablist">
            <button type="button" role="tab" aria-selected=${tab === 'board'} class=${'ld-tab' + (tab === 'board' ? ' on' : '')} onClick=${() => setTab('board')}>
              <i class="ti ti-layout-columns"></i>Pipeline</button>
            <button type="button" role="tab" aria-selected=${tab === 'table'} class=${'ld-tab' + (tab === 'table' ? ' on' : '')} onClick=${() => setTab('table')}>
              <i class="ti ti-table"></i>Table</button>
          </div>
          <div style=${{ position: 'relative', flex: '1 1 180px', maxWidth: 280 }}>
            <input class="ld-in" style=${{ paddingLeft: 30 }} value=${q} placeholder="Search leads…" aria-label="Search leads" onInput=${e => setQ(e.target.value)}/>
            <i class="ti ti-search" style=${{ position: 'absolute', left: 9, top: 8, color: 'var(--cu-t3,#8e8e99)', fontSize: 14 }}></i>
          </div>
          <${AssigneePicker} value=${owner} onChange=${setOwner} label="Filter by owner"
            anchorContent=${owner.length ? null : h`<${Fragment}><i class="ti ti-user" style=${{ fontSize: 14 }}></i>Owner<//>`}/>
          ${sources.length ? h`<select class="ld-in" style=${{ width: 'auto', minWidth: 120 }} value=${source} onChange=${e => setSource(e.target.value)} aria-label="Filter by source">
            <option value="">All sources</option>
            ${sources.map(s => h`<option key=${s} value=${s}>${s}</option>`)}
          </select>` : null}
          <label style=${{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--cu-t2,#5c5c66)' }}>
            <input type="checkbox" checked=${showClosed} onChange=${e => setShowClosed(e.target.checked)}/>Show Won / Lost
          </label>
          <span style=${{ flex: 1 }}></span>
          <button type="button" class="ld-btn ghost" title="Open in the task views" onClick=${() => { location.hash = '#/list/' + pipeline.list_id; }}>
            <i class="ti ti-external-link"></i>List view</button>
        </div>

        ${loading && !arr(rows).length ? h`<${Skel} h=${260}/>`
          : !arr(rows).length ? h`<${EmptyState} icon="ti-target" title="No leads yet"
              sub=${pipeline.syncs_website_leads ? 'Enquiries from the website land here automatically — or add one by hand.' : 'Add your first lead to start the pipeline.'}
              action=${h`<button type="button" class="ld-btn pri" onClick=${() => setShowNew(true)}><i class="ti ti-plus"></i>New lead</button>`}/>`
            : !visible.length ? h`<${EmptyState} icon="ti-filter-off" title="No leads match" sub="Try a different search or filter."/>`
              : tab === 'board'
                ? h`<${PipelineBoard} statuses=${statuses} rows=${visible} get=${get} onMove=${move}
                    onMenu=${(el, row) => setMenu({ el, row })}/>`
                : h`<${LeadsTable} rows=${visible} get=${get} fields=${fields} onPatch=${patch}
                    onMenu=${(el, row) => setMenu({ el, row })}/>`}

        <${Popover} anchor=${menu && menu.el} open=${!!menu} onClose=${() => setMenu(null)} placement="bottom-end">
          ${menu ? h`<${Menu} onClose=${() => setMenu(null)} items=${[
            { key: 'open', label: 'Open lead', icon: 'ti-arrow-up-right', onSelect: () => openTask(menu.row.id) },
            { key: 'convert', label: 'Convert to client', icon: 'ti-building-plus',
              onSelect: () => convertToClient(menu.row, get, showToast) },
            { divider: true, key: 'd1' },
            ...statuses.filter(s => s.key !== menu.row.status).slice(0, 6).map(s => ({
              key: 'st-' + s.key, label: 'Move to ' + s.name, icon: 'ti-arrow-right',
              onSelect: () => patch(menu.row.id, { status: s.key }),
            })),
            { divider: true, key: 'd2' },
            { key: 'del', label: 'Delete lead', icon: 'ti-trash', danger: true,
              onSelect: async () => {
                if (!window.confirm('Delete "' + menu.row.title + '"? The website lead record stays.')) return;
                try { await TaskAPI.remove(menu.row.id); showToast && showToast('Lead deleted'); reload(); }
                catch (e) { showToast && showToast(errText(e)); }
              } },
          ]}/>` : null}
        <//>

        ${showNew ? h`<${NewLeadModal} pipeline=${pipeline} showToast=${showToast}
          onClose=${() => { setShowNew(false); if (p[0] === 'new') location.hash = '#/leads'; }}
          onCreated=${(row) => { setShowNew(false); if (p[0] === 'new') location.hash = '#/leads'; reload(); if (row && row.id) openTask(row.id); }}/>` : null}
      </div></div>`;
    }

    // ---- registrations --------------------------------------------------------
    const salesRole = (r) => r === 'admin' || r === 'manager';
    reg('pages', {
      id: 'leads', label: 'Leads', icon: 'ti-target', section: 'more', order: 64,
      apps: ['dashboard'], roles: salesRole, fullHeight: true, Component: LeadsPage,
    });
    reg('createItems', {
      key: 'lead', label: 'Lead', icon: 'ti-target', order: 76, roles: salesRole,
      run: ({ onNavigate }) => { try { location.hash = '#/leads/new'; } catch (_) { } if (onNavigate) onNavigate('leads'); },
    });
    reg('taskMenuItems', {
      key: 'lead-convert', label: 'Convert to client', icon: 'ti-building-plus', order: 45,
      when: (t) => !!t && t.type === 'lead',
      run: async (task, ctx) => {
        const c = ctx || {};
        let fields = {};
        try { const b = await LeadsAPI.bootstrap(); fields = (b && b.fields) || {}; } catch (_) { }
        const get = (row, key) => { const fid = fields[key]; return fid ? ((row.custom_fields || {})[fid] || null) : null; };
        await convertToClient(task, get, c.showToast);
        if (c.reload) c.reload();
        if (c.close) c.close();
      },
    });
    let palCache = { at: 0, rows: [] };
    reg('paletteProviders', {
      id: 'leads', label: 'Leads', icon: 'ti-target', roles: salesRole,
      search: async (q) => {
        try {
          if (Date.now() - palCache.at > 60000) {
            const b = await LeadsAPI.bootstrap();
            if (!b || !b.list_id) return [];
            const res = await TaskAPI.query({ list_ids: [b.list_id], include_closed: true, top_level: true, limit: 200, order: 'created' });
            palCache = { at: Date.now(), rows: arr(res && res.rows) };
          }
          const s = String(q || '').trim().toLowerCase();
          return palCache.rows
            .filter(r => !s || String(r.title || '').toLowerCase().includes(s))
            .slice(0, 8)
            .map(r => ({
              id: 'lead:' + r.id, label: r.title, icon: 'ti-target',
              sub: [r.status_name, r.custom_id].filter(Boolean).join(' · '),
              run: () => openTask(r.id),
            }));
        } catch (_) { return []; }
      },
    });

    return { LeadsPage, LeadsAPI, NewLeadModal };
  }

  window.AMS_LEADS = { buildLeads };
})();

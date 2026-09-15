/* ============================================================================
 * whatsapp.js — Settings → WhatsApp (migration 089_whatsapp_delegation)
 *
 *   window.AMS_WHATSAPP.buildWhatsApp(deps) → { WhatsAppSettingsSection }
 *
 * deps: { React, h, useState, useEffect, useRef, useCallback, useMemo, rpcCall, Av, Skel }
 *
 * Sections (role-gated; the RPCs enforce the same rules server-side):
 *   • My WhatsApp     — every staff role  (wa_my_settings_get / _set, wa_test_send)
 *   • Team numbers    — admin + manager   (wa_team_list / wa_team_set / wa_test_send)
 *   • Setup           — admin edits, manager read-only (wa_config_get / wa_config_set)
 *   • Message log     — admin + manager   (wa_outbox_list)
 * ==========================================================================*/
(function () {
  function buildWhatsApp(deps) {
    const { React, h, useState, useEffect, useCallback, rpcCall, Av, Skel } = deps;
    const Fragment = React.Fragment;

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-whatsapp-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-whatsapp-styles';
      st.textContent = `
      :where(:root){--cu-bg:#ffffff;--cu-bg2:#f7f7f8;--cu-bg3:#efeff1;--cu-bd:#e8e8eb;--cu-bd2:#d6d6db;--cu-t1:#1f1f23;--cu-t2:#5c5c66;--cu-t3:#8e8e99;--cu-accent:#ff00ee;--cu-accent-ink:#a8009c;--cu-accent-fog:rgba(255,0,238,.08);--cu-radius:8px;--cu-radius-sm:6px}
      :where(html.dark){--cu-bg:#1c1b1f;--cu-bg2:#161518;--cu-bg3:#26252a;--cu-bd:#2d2c31;--cu-bd2:#3b3a40;--cu-t1:#ececef;--cu-t2:#a9a8b1;--cu-t3:#75747d;--cu-accent:#ff66f5;--cu-accent-ink:#ff7df6;--cu-accent-fog:rgba(255,102,245,.12)}
      .wa-root{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--cu-t1);max-width:940px;min-width:0}
      .wa-root *{box-sizing:border-box}
      .wa-page-hd{margin-bottom:18px}
      .wa-page-t{display:flex;align-items:center;gap:8px;font-size:20px;font-weight:600;color:var(--cu-t1)}
      .wa-page-t i{font-size:22px;color:#25D366}
      .wa-page-s{font-size:13px;color:var(--cu-t2);margin-top:4px;line-height:1.5;max-width:660px}
      .wa-card{background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);margin-bottom:16px;min-width:0}
      .wa-card-hd{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--cu-bd);flex-wrap:wrap}
      .wa-card-ic{font-size:18px;color:#25D366;flex-shrink:0}
      .wa-card-tt{flex:1;min-width:160px}
      .wa-card-t{font-size:15px;font-weight:600;color:var(--cu-t1)}
      .wa-card-s{font-size:12px;color:var(--cu-t3);margin-top:1px;line-height:1.4}
      .wa-card-b{padding:14px 16px;min-width:0}
      .wa-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px}
      .wa-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
      .wa-f{display:flex;flex-direction:column;gap:5px;min-width:0}
      .wa-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3)}
      .wa-in{width:100%;height:32px;padding:0 10px;border:1px solid var(--cu-bd2);border-radius:var(--cu-radius-sm);background:var(--cu-bg);color:var(--cu-t1);font-size:13px;font-family:inherit;min-width:0}
      .wa-in:focus{outline:none;border-color:var(--cu-accent)}
      .wa-in:disabled{background:var(--cu-bg2);color:var(--cu-t2);cursor:not-allowed}
      .wa-in::placeholder{color:var(--cu-t3)}
      .wa-in.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
      .wa-in.sm{height:28px;padding:0 8px;font-size:12.5px}
      .wa-in.time{width:108px;flex-shrink:0}
      .wa-hint{font-size:12px;color:var(--cu-t3);line-height:1.45}
      .wa-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .wa-sp{flex:1}
      .wa-srow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--cu-bd)}
      .wa-srow:first-child{border-top:none}
      .wa-srow-t{font-size:13.5px;font-weight:500;color:var(--cu-t1)}
      .wa-srow-s{font-size:12px;color:var(--cu-t3);margin-top:2px;line-height:1.4}
      .wa-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:var(--cu-radius-sm);border:1px solid var(--cu-bd);background:var(--cu-bg);color:var(--cu-t1);font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;white-space:nowrap;text-decoration:none}
      .wa-btn:hover{background:var(--cu-bg3)}
      .wa-btn:disabled{opacity:.5;cursor:not-allowed}
      .wa-btn.pri{background:var(--cu-accent);border-color:var(--cu-accent);color:#fff}
      .wa-btn.pri:hover{background:#e600d6;border-color:#e600d6}
      html.dark .wa-btn.pri{color:#1b0019}
      .wa-btn.sm{height:26px;padding:0 9px;font-size:12px}
      .wa-btn.ghost{border-color:transparent;background:transparent;color:var(--cu-t2)}
      .wa-btn.ghost:hover{background:var(--cu-bg3);color:var(--cu-t1)}
      .wa-root button:focus-visible,.wa-root input:focus-visible,.wa-root select:focus-visible,.wa-root a:focus-visible{outline:2px solid var(--cu-accent);outline-offset:1px}
      .wa-status{display:flex;align-items:center;gap:8px;font-size:13px;padding:9px 12px;border-radius:var(--cu-radius-sm);background:var(--cu-bg2);border:1px solid var(--cu-bd);margin-bottom:14px;flex-wrap:wrap;color:var(--cu-t2);line-height:1.4}
      .wa-status b{color:var(--cu-t1);font-weight:600}
      .wa-dot{width:8px;height:8px;border-radius:50%;background:var(--cu-t3);flex-shrink:0}
      .wa-dot.on{background:#25D366;box-shadow:0 0 0 3px rgba(37,211,102,.22)}
      .wa-dot.warn{background:#f5a623}
      .wa-note{font-size:12.5px;line-height:1.5;padding:9px 12px;border-radius:var(--cu-radius-sm);background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.35);color:var(--cu-t1);margin-bottom:12px}
      .wa-sw{width:36px;height:20px;border-radius:10px;border:none;background:var(--cu-bd2);position:relative;cursor:pointer;flex-shrink:0;padding:0;transition:background .15s}
      .wa-sw.on{background:#25D366}
      .wa-sw:disabled{opacity:.5;cursor:not-allowed}
      .wa-sw-k{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
      .wa-sw.on .wa-sw-k{transform:translateX(16px)}
      .wa-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .wa-stat{border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);padding:9px 12px;background:var(--cu-bg2);min-width:0}
      .wa-stat-n{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--cu-t1)}
      .wa-stat-l{font-size:11px;color:var(--cu-t3);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .wa-sub{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3);margin:18px 0 8px}
      .wa-tbl-wrap{overflow-x:auto;margin:0 -16px;padding:0 16px;-webkit-overflow-scrolling:touch}
      .wa-tbl{width:100%;border-collapse:collapse;font-size:13px}
      .wa-tbl.team{min-width:700px}
      .wa-tbl.log{min-width:680px}
      .wa-tbl th{text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3);padding:8px;border-bottom:1px solid var(--cu-bd);background:var(--cu-bg2);white-space:nowrap}
      .wa-tbl td{padding:6px 8px;border-bottom:1px solid var(--cu-bd);vertical-align:middle;color:var(--cu-t1)}
      .wa-tbl tr:last-child td{border-bottom:none}
      .wa-tbl tbody tr:hover td{background:var(--cu-bg2)}
      .wa-pill{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap}
      .wa-member{display:flex;align-items:center;gap:8px;min-width:0}
      .wa-ellip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .wa-link{background:none;border:none;padding:0;font:inherit;color:var(--cu-t1);cursor:pointer;text-align:left;max-width:240px}
      .wa-link:hover{color:var(--cu-accent-ink);text-decoration:underline}
      .wa-how{border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);margin-top:16px;overflow:hidden}
      .wa-how-btn{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:none;background:var(--cu-bg2);color:var(--cu-t1);font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;text-align:left}
      .wa-how-btn:hover{background:var(--cu-bg3)}
      .wa-steps{margin:0;padding:8px 14px 14px 32px;font-size:13px;line-height:1.55;color:var(--cu-t2)}
      .wa-steps>li{margin:8px 0;padding-left:2px}
      .wa-steps b{color:var(--cu-t1);font-weight:600}
      .wa-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:var(--cu-bg3);color:var(--cu-t1);padding:1px 5px;border-radius:4px;word-break:break-all}
      .wa-tpl{border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);background:var(--cu-bg2);padding:10px 12px;margin:8px 0;min-width:0}
      .wa-tpl-hd{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}
      .wa-tpl-body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;color:var(--cu-t1);background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:4px;padding:8px 10px}
      .wa-tpl ul{margin:6px 0 0;padding-left:18px;font-size:12.5px}
      .wa-spin{animation:wa-spin 1s linear infinite;display:inline-block}
      @keyframes wa-spin{to{transform:rotate(360deg)}}
      .wa-empty{padding:18px;text-align:center;color:var(--cu-t3);font-size:13px}
      @media(max-width:640px){
        .wa-grid,.wa-grid.three{grid-template-columns:minmax(0,1fr)}
        .wa-card-b{padding:12px}
        .wa-card-hd{padding:10px 12px}
        .wa-tbl-wrap{margin:0 -12px;padding:0 12px}
        .wa-stat-n{font-size:17px}
        .wa-steps{padding-left:26px;padding-right:10px}
      }
      @media(prefers-reduced-motion:reduce){.wa-sw,.wa-sw-k{transition:none}.wa-spin{animation-duration:3s}}
      `;
      document.head.appendChild(st);
    }

    // =========================================================================
    // helpers
    // =========================================================================
    const WA_GREEN = '#25D366';
    const arr = (v) => (Array.isArray(v) ? v : []);
    const ERR = {
      bad_phone: "That doesn't look like a phone number — try +91 98765 43210",
      whatsapp_disabled: "WhatsApp is switched off for this workspace — an admin can enable it under Setup",
      no_whatsapp_number: 'No WhatsApp number saved (or reminders are turned off) for that person',
      phone_number_id_required: 'Add the Phone number ID before turning WhatsApp on',
      bad_member: 'That team member no longer exists',
    };
    const isMissingRpc = (e) => /could not find the function|PGRST202|schema cache/i.test(String((e && (e.message || e.code)) || ''));
    function errText(e) {
      if (!e) return 'Something went wrong';
      if (e.code === 'forbidden') return "You don't have permission to do that";
      if (e.code === 'auth.expired' || e.message === 'auth.no_session') return 'Session expired — sign in again';
      if (isMissingRpc(e)) return 'WhatsApp needs database migration 089 — ask an admin to apply it';
      const m = String(e.message || e);
      const k = Object.keys(ERR).find(x => m.includes(x));
      return k ? ERR[k] : m;
    }
    const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
    const fmtStamp = (iso) => {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return '—';
      const today = new Date().toDateString() === d.toDateString();
      const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
      return today ? time : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + time;
    };
    async function copyText(text) {
      try { await navigator.clipboard.writeText(text); return true; }
      catch (_) {
        try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true; } catch (__) { return false; }
      }
    }
    const openTask = (id) => { if (!id) return; try { window.dispatchEvent(new CustomEvent('ams-open-task', { detail: { id } })); } catch (_) { } };

    const STATUS_COLOR = { queued: '#87909e', sending: '#f5a623', sent: '#4c8df6', delivered: '#30a46c', read: '#0e9f8e', failed: '#e5484d', skipped: '#8e8e99' };
    const KIND_META = {
      assigned: { label: 'Assigned', color: '#7b68ee' },
      followup: { label: 'Follow-up', color: '#d97706' },
      completed: { label: 'Completed', color: '#30a46c' },
      nudge: { label: 'Nudge', color: '#8b5cf6' },
      test: { label: 'Test', color: '#87909e' },
    };
    const PRIORITY_RULES = [
      { v: 1, label: 'Urgent only' },
      { v: 2, label: 'Urgent + High' },
      { v: 3, label: 'Up to Normal' },
      { v: 5, label: 'Every task' },
    ];

    // Meta WhatsApp Manager templates (strings — htm entity gotcha).
    const TPL_URL = 'https://mydigitalsevak.in/app/?lt=task&li={{1}}';
    const TEMPLATES = [
      { key: 'tpl_assigned', name: 'task_assigned',
        body: 'Hi {{1}}, {{2}} assigned you a task: *{{3}}*. Due: {{4}}. Priority: {{5}}.',
        buttons: ['Quick reply — "Mark as done"', 'Visit website — "Open task" · Dynamic URL ' + TPL_URL] },
      { key: 'tpl_followup', name: 'task_followup',
        body: 'Hi {{1}}, reminder: *{{2}}* is still pending. Due: {{3}}. Assigned by {{4}}.',
        buttons: ['Quick reply — "Mark as done"', 'Visit website — "Open task" · Dynamic URL ' + TPL_URL] },
      { key: 'tpl_completed', name: 'task_completed',
        body: 'Hi {{1}}, {{2}} has completed *{{3}}*. ✅',
        buttons: ['Visit website — "Open task" · Dynamic URL ' + TPL_URL] },
    ];

    // AiSensy (migration 090) — API Campaign templates. No buttons: "Mark as done" is a one-tap link in {{6}}/{{5}}.
    const AISENSY_TEMPLATES = [
      { key: 'aisensy_campaign_assigned', name: 'ams_task_assigned',
        body: 'Hi {{1}}, {{2}} has assigned you a new task on My Digital Sevak.\n\nTask: *{{3}}*\nDue: {{4}}\nPriority: {{5}}\n\nWhen you finish, tap this link to mark it done: {{6}}\n\nThank you!' },
      { key: 'aisensy_campaign_followup', name: 'ams_task_followup',
        body: 'Hi {{1}}, this is a reminder that your task *{{2}}* is still pending.\n\nDue: {{3}}\nAssigned by: {{4}}\n\nIf it is finished, tap this link to mark it done: {{5}}\n\nThank you!' },
      { key: 'aisensy_campaign_completed', name: 'ams_task_completed',
        body: 'Hi {{1}}, good news: {{2}} has completed the task *{{3}}* on My Digital Sevak.\n\nYou can review it here: {{4}}\n\nThank you!' },
    ];

    // =========================================================================
    // atoms
    // =========================================================================
    function Toggle({ on, onChange, disabled, label }) {
      return h`<button type="button" role="switch" aria-checked=${!!on} aria-label=${label} disabled=${disabled}
        class=${'wa-sw' + (on ? ' on' : '')} onClick=${() => { if (!disabled && onChange) onChange(!on); }}><span class="wa-sw-k"></span></button>`;
    }
    function Card({ icon = 'ti-brand-whatsapp', title, sub, right, children }) {
      return h`<section class="wa-card">
        <div class="wa-card-hd">
          <i class=${'ti ' + icon + ' wa-card-ic'} aria-hidden="true"></i>
          <div class="wa-card-tt"><div class="wa-card-t">${title}</div>${sub ? h`<div class="wa-card-s">${sub}</div>` : null}</div>
          ${right || null}
        </div>
        <div class="wa-card-b">${children}</div>
      </section>`;
    }
    function Loading({ rows = 2 }) {
      return h`<div style=${{ display: 'flex', flexDirection: 'column', gap: 8 }}>${Array.from({ length: rows }, (_, i) => h`<${Skel} key=${i} h=${34}/>`)}</div>`;
    }
    function Pill({ label, color, title }) {
      const c = color || '#87909e';
      return h`<span class="wa-pill" style=${{ background: c + '1f', color: c }} title=${title || undefined}>${label}</span>`;
    }
    function Spin() { return h`<i class="ti ti-loader-2 wa-spin" aria-hidden="true"></i>`; }

    // =========================================================================
    // My WhatsApp (everyone)
    // =========================================================================
    function MyWhatsAppCard({ showToast }) {
      const [data, setData] = useState(null);
      const [err, setErr] = useState(null);
      const [form, setForm] = useState({ phone: '', opted_in: true, quiet_start: '', quiet_end: '' });
      const [saving, setSaving] = useState(false);
      const [testing, setTesting] = useState(false);
      const fill = (d) => {
        const x = d || {};
        setData(x);
        setForm({ phone: x.phone || '', opted_in: x.opted_in !== false, quiet_start: hhmm(x.quiet_start), quiet_end: hhmm(x.quiet_end) });
      };
      useEffect(() => { (async () => { try { fill(await rpcCall('wa_my_settings_get')); } catch (e) { setErr(e); } })(); }, []);
      const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
      const dirty = !!data && (form.phone.trim() !== (data.phone || '') || form.opted_in !== (data.opted_in !== false)
        || form.quiet_start !== hhmm(data.quiet_start) || form.quiet_end !== hhmm(data.quiet_end));
      const save = async () => {
        if (!!form.quiet_start !== !!form.quiet_end) { showToast('Set both quiet-hours times, or clear both'); return; }
        setSaving(true);
        try {
          fill(await rpcCall('wa_my_settings_set', { p_data: { phone: form.phone.trim(), opted_in: form.opted_in, quiet_start: form.quiet_start || '', quiet_end: form.quiet_end || '' } }));
          showToast('WhatsApp settings saved ✓');
        } catch (e) { showToast(errText(e)); }
        setSaving(false);
      };
      const test = async () => {
        setTesting(true);
        try { await rpcCall('wa_test_send', {}); showToast('Test message queued — check WhatsApp in a minute'); }
        catch (e) { showToast(errText(e)); }
        setTesting(false);
      };

      return h`<${Card} icon="ti-device-mobile-message" title="My WhatsApp" sub="Where your task reminders arrive">
        ${err ? h`<div class="wa-note">${errText(err)}</div>` : !data ? h`<${Loading}/>` : h`<${Fragment}>
          <div class="wa-status" role="status">
            <span class=${'wa-dot' + (data.org_enabled ? ' on' : '')}></span>
            ${data.org_enabled
              ? h`<span><b>WhatsApp reminders are ON for your workspace</b>${data.business_number ? ' · messages come from ' + data.business_number : ''}</span>`
              : h`<span><b>WhatsApp reminders are not set up yet</b> for your workspace — you can still save your number now.</span>`}
          </div>
          <div class="wa-grid">
            <label class="wa-f">
              <span class="wa-lbl">WhatsApp number</span>
              <input class="wa-in" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" value=${form.phone}
                onInput=${e => set('phone', e.target.value)} onKeyDown=${e => { if (e.key === 'Enter' && dirty) save(); }}/>
              <span class="wa-hint">10-digit Indian numbers get +91 automatically.</span>
            </label>
            <div class="wa-f">
              <span class="wa-lbl">Quiet hours (IST)</span>
              <div class="wa-row" style=${{ gap: 6, flexWrap: 'nowrap' }}>
                <input class="wa-in time" type="time" aria-label="Quiet hours start" value=${form.quiet_start} onInput=${e => set('quiet_start', e.target.value)}/>
                <span style=${{ color: 'var(--cu-t3)' }}>to</span>
                <input class="wa-in time" type="time" aria-label="Quiet hours end" value=${form.quiet_end} onInput=${e => set('quiet_end', e.target.value)}/>
                ${form.quiet_start || form.quiet_end ? h`<button type="button" class="wa-btn ghost sm" onClick=${() => setForm(f => ({ ...f, quiet_start: '', quiet_end: '' }))}>Clear</button>` : null}
              </div>
              <span class="wa-hint">No messages during these hours, except manual nudges. e.g. 21:00 to 08:00.</span>
            </div>
          </div>
          <div class="wa-srow" style=${{ marginTop: 12 }}>
            <div>
              <div class="wa-srow-t">Send me task reminders on WhatsApp</div>
              <div class="wa-srow-s">Assignments, scheduled follow-ups and completed-task updates.</div>
            </div>
            <${Toggle} on=${form.opted_in} label="Send me task reminders on WhatsApp" onChange=${v => set('opted_in', v)}/>
          </div>
          <div class="wa-row" style=${{ marginTop: 12 }}>
            <button type="button" class="wa-btn pri" disabled=${saving || !dirty} onClick=${save}>${saving ? h`<${Spin}/>` : h`<i class="ti ti-check"></i>`}Save</button>
            ${data.org_enabled && data.phone ? h`<button type="button" class="wa-btn" disabled=${testing || dirty} onClick=${test} title=${dirty ? 'Save first' : 'Sends the hello_world template to your number'}>
              ${testing ? h`<${Spin}/>` : h`<i class="ti ti-send"></i>`}Send me a test</button>` : null}
          </div>
        <//>`}
      <//>`;
    }

    // =========================================================================
    // Team numbers (admin / manager)
    // =========================================================================
    function TeamRow({ m, orgEnabled, onSaved, showToast }) {
      const [phone, setPhone] = useState(m.phone || '');
      const [qs, setQs] = useState(hhmm(m.quiet_start));
      const [qe, setQe] = useState(hhmm(m.quiet_end));
      const [opted, setOpted] = useState(m.opted_in !== false);
      const [busy, setBusy] = useState('');
      useEffect(() => { setPhone(m.phone || ''); setQs(hhmm(m.quiet_start)); setQe(hhmm(m.quiet_end)); setOpted(m.opted_in !== false); }, [m.phone, m.quiet_start, m.quiet_end, m.opted_in]);

      const save = async (patch, revert) => {
        setBusy('save');
        try { await rpcCall('wa_team_set', { p_member_id: m.member_id, p_data: patch }); await onSaved(); }
        catch (e) { showToast(errText(e)); if (revert) revert(); }
        setBusy('');
      };
      const commitPhone = () => {
        const v = phone.trim();
        if (v === (m.phone || '')) return;
        save({ phone: v }, () => setPhone(m.phone || ''));
      };
      const commitQuiet = (nqs, nqe) => {
        if (nqs === hhmm(m.quiet_start) && nqe === hhmm(m.quiet_end)) return;
        if (!!nqs !== !!nqe) return;          // wait for the other half
        save({ quiet_start: nqs || '', quiet_end: nqe || '' }, () => { setQs(hhmm(m.quiet_start)); setQe(hhmm(m.quiet_end)); });
      };
      const test = async () => {
        setBusy('test');
        try { await rpcCall('wa_test_send', { p_member_id: m.member_id }); showToast('Test queued for ' + m.name); }
        catch (e) { showToast(errText(e)); }
        setBusy('');
      };
      const half = !!qs !== !!qe;
      return h`<tr>
        <td>
          <div class="wa-member">
            <${Av} i=${m.initials || String(m.name || '?').slice(0, 2).toUpperCase()} c=${m.color || '#FF00EE'} s=${26} round=${true}/>
            <div style=${{ minWidth: 0 }}>
              <div class="wa-ellip" style=${{ fontWeight: 500, maxWidth: 170 }}>${m.name}</div>
              <div style=${{ fontSize: 11, color: 'var(--cu-t3)', textTransform: 'capitalize' }}>${String(m.role_level || '').replace(/_/g, ' ')}</div>
            </div>
          </div>
        </td>
        <td style=${{ width: 190 }}>
          <input class="wa-in sm" type="tel" inputMode="tel" placeholder="+91…" aria-label=${'WhatsApp number for ' + m.name} value=${phone}
            onInput=${e => setPhone(e.target.value)} onBlur=${commitPhone} onKeyDown=${e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setPhone(m.phone || ''); } }}/>
        </td>
        <td style=${{ width: 90 }}>
          <${Toggle} on=${opted} label=${'Reminders for ' + m.name} disabled=${busy === 'save'}
            onChange=${v => { setOpted(v); save({ opted_in: v }, () => setOpted(!v)); }}/>
        </td>
        <td style=${{ width: 230 }}>
          <div class="wa-row" style=${{ gap: 4, flexWrap: 'nowrap' }} title=${half ? 'Set both times, or clear both' : 'Quiet hours (IST)'}>
            <input class="wa-in sm time" type="time" aria-label=${'Quiet hours start for ' + m.name} value=${qs} style=${half && !qs ? { borderColor: '#f5a623' } : null}
              onInput=${e => setQs(e.target.value)} onBlur=${() => commitQuiet(qs, qe)}/>
            <span style=${{ color: 'var(--cu-t3)', fontSize: 12 }}>–</span>
            <input class="wa-in sm time" type="time" aria-label=${'Quiet hours end for ' + m.name} value=${qe} style=${half && !qe ? { borderColor: '#f5a623' } : null}
              onInput=${e => setQe(e.target.value)} onBlur=${() => commitQuiet(qs, qe)}/>
          </div>
        </td>
        <td style=${{ width: 110, textAlign: 'right', whiteSpace: 'nowrap' }}>
          ${busy === 'save' ? h`<span style=${{ color: 'var(--cu-t3)', fontSize: 12, marginRight: 6 }}><${Spin}/></span>` : null}
          <button type="button" class="wa-btn sm" disabled=${!!busy || !m.phone || !orgEnabled}
            title=${!orgEnabled ? 'Turn WhatsApp on in Setup first' : !m.phone ? 'Add a number first' : 'Send the hello_world test template'} onClick=${test}>
            ${busy === 'test' ? h`<${Spin}/>` : h`<i class="ti ti-send"></i>`}Send test</button>
        </td>
      </tr>`;
    }

    function TeamCard({ orgEnabled, showToast }) {
      const [rows, setRows] = useState(null);
      const [err, setErr] = useState(null);
      const load = useCallback(async () => {
        try { setRows(arr(await rpcCall('wa_team_list'))); setErr(null); }
        catch (e) { setErr(e); setRows(r => r || []); }
      }, []);
      useEffect(() => { load(); }, [load]);
      const withPhone = arr(rows).filter(r => r.phone).length;
      return h`<${Card} icon="ti-users" title="Team numbers"
        sub=${rows ? withPhone + ' of ' + rows.length + ' teammates have a WhatsApp number' : 'Set numbers on behalf of your team'}
        right=${h`<button type="button" class="wa-btn ghost sm" onClick=${load} aria-label="Refresh team numbers"><i class="ti ti-refresh"></i></button>`}>
        ${err ? h`<div class="wa-note">${errText(err)}</div>` : null}
        ${!rows ? h`<${Loading} rows=${3}/>` : !rows.length ? h`<div class="wa-empty">No staff members found.</div>` : h`<div class="wa-tbl-wrap">
          <table class="wa-tbl team">
            <thead><tr><th>Member</th><th>WhatsApp number</th><th>Reminders</th><th>Quiet hours (IST)</th><th></th></tr></thead>
            <tbody>${rows.map(m => h`<${TeamRow} key=${m.member_id} m=${m} orgEnabled=${!!orgEnabled} onSaved=${load} showToast=${showToast}/>`)}</tbody>
          </table>
        </div>`}
        <div class="wa-hint" style=${{ marginTop: 10 }}>Changes save when you leave a field. People can also set their own number under My WhatsApp.</div>
      <//>`;
    }

    // =========================================================================
    // Setup (admin edits; manager read-only)
    // =========================================================================
    function HowToConnect({ webhookUrl, showToast, provider }) {
      const [open, setOpen] = useState(false);
      const copy = async (text, label) => { const ok = await copyText(text); showToast(ok ? label + ' copied' : 'Copy failed'); };
      const secret = (name) => h`<span class="wa-code">${name}</span>`;
      if (provider === 'aisensy') {
        return h`<div class="wa-how">
          <button type="button" class="wa-how-btn" aria-expanded=${open} onClick=${() => setOpen(o => !o)}>
            <i class=${'ti ' + (open ? 'ti-chevron-down' : 'ti-chevron-right')}></i>
            <i class="ti ti-list-check" style=${{ color: WA_GREEN }}></i>How to connect AiSensy (one-time)
          </button>
          ${open ? h`<ol class="wa-steps">
            <li>In <b>AiSensy → Manage → Template Message → Create Template</b>, create these three templates — <b>Category: Utility</b>, <b>Language: English</b>, <b>Type: Text</b>, no buttons — and wait for approval:
              ${AISENSY_TEMPLATES.map(t => h`<div key=${t.name} class="wa-tpl">
                <div class="wa-tpl-hd">
                  <span class="wa-code" style=${{ fontWeight: 600 }}>${t.name}</span>
                  <span class="wa-sp"></span>
                  <button type="button" class="wa-btn ghost sm" onClick=${() => copy(t.body, 'Template body')}><i class="ti ti-copy"></i>Copy body</button>
                </div>
                <div class="wa-tpl-body">${t.body}</div>
              </div>`)}
            </li>
            <li>In <b>AiSensy → Campaigns → Launch → API Campaign</b>, create one API campaign per template with the <b>same name</b> as the template (e.g. ${secret('ams_task_assigned')}) and set it <b>Live</b>.</li>
            <li>In <b>AiSensy → Developer → API Campaign Key</b>, copy the key (Regenerate if you don't have it).</li>
            <li>In <b>Supabase → Edge Functions → Secrets</b>, add ${secret('AISENSY_API_KEY')} with that key.</li>
            <li>Turn on <b>Enabled</b> above and Save, add your number under My WhatsApp, then press <b>Send me a test</b>. The test uses the follow-up campaign.</li>
          </ol>` : null}
        </div>`;
      }
      return h`<div class="wa-how">
        <button type="button" class="wa-how-btn" aria-expanded=${open} onClick=${() => setOpen(o => !o)}>
          <i class=${'ti ' + (open ? 'ti-chevron-down' : 'ti-chevron-right')}></i>
          <i class="ti ti-list-check" style=${{ color: WA_GREEN }}></i>How to connect WhatsApp (one-time)
        </button>
        ${open ? h`<ol class="wa-steps">
          <li>In <b>Meta for Developers</b>, open your app → <b>Add product</b> → <b>WhatsApp</b>. Link it to your WhatsApp Business Account.</li>
          <li><b>Register a dedicated number</b> (one that isn't already on the WhatsApp app) under WhatsApp → API Setup, and verify it by SMS or call.</li>
          <li>Copy the <b>Phone number ID</b> from WhatsApp → API Setup and paste it above. Put the number itself in <b>Business number</b> so the team can see it.</li>
          <li>In <b>Business Settings → Users → System users</b>, create a system user, give it the app (full control) and your WhatsApp account, then <b>Generate token</b> with no expiry and the permissions ${secret('whatsapp_business_messaging')} + ${secret('whatsapp_business_management')}.</li>
          <li>In <b>Supabase → Edge Functions → Secrets</b>, add:
            <div style=${{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span>${secret('WHATSAPP_TOKEN')} — the permanent system-user token</span>
              <span>${secret('WHATSAPP_VERIFY_TOKEN')} — any long random string you make up</span>
              <span>${secret('WHATSAPP_APP_SECRET')} — Meta app → App settings → Basic → App secret</span>
            </div>
          </li>
          <li>In <b>WhatsApp Manager → Message templates</b>, create these three templates — <b>Category: Utility</b>, <b>Language: English</b> — and wait for approval:
            ${TEMPLATES.map(t => h`<div key=${t.name} class="wa-tpl">
              <div class="wa-tpl-hd">
                <span class="wa-code" style=${{ fontWeight: 600 }}>${t.name}</span>
                <span class="wa-sp"></span>
                <button type="button" class="wa-btn ghost sm" onClick=${() => copy(t.body, 'Template body')}><i class="ti ti-copy"></i>Copy body</button>
              </div>
              <div class="wa-lbl" style=${{ marginBottom: 4 }}>Body</div>
              <div class="wa-tpl-body">${t.body}</div>
              <div class="wa-lbl" style=${{ marginTop: 8 }}>Buttons</div>
              <ul>${t.buttons.map((b, i) => h`<li key=${i} style=${{ wordBreak: 'break-word' }}>${b}</li>`)}</ul>
            </div>`)}
            <div class="wa-hint">For the "Open task" button choose <b>Visit website → Dynamic</b>, URL ${h`<span class="wa-code">${TPL_URL}</span>`}. If you name the templates differently, enter the names above. If Meta only offers English (US), set Template language to ${h`<span class="wa-code">${'en_US'}</span>`}.</div>
          </li>
          <li>In your app → <b>WhatsApp → Configuration</b>, set <b>Callback URL</b> to the webhook URL above${webhookUrl ? h` (<button type="button" class="wa-link" style=${{ color: 'var(--cu-accent-ink)' }} onClick=${() => copy(webhookUrl, 'Webhook URL')}>copy</button>)` : null}, <b>Verify token</b> to your ${secret('WHATSAPP_VERIFY_TOKEN')}, click Verify and save, then <b>subscribe</b> to the ${secret('messages')} field.</li>
          <li>Turn on <b>Enabled</b> above and Save, then press <b>Send test</b> next to your name in Team numbers. You should get a "hello world" message within a minute.</li>
        </ol>` : null}
      </div>`;
    }

    function SetupCard({ canEdit, showToast, onConfig }) {
      const [cfg, setCfg] = useState(null);
      const [form, setForm] = useState(null);
      const [err, setErr] = useState(null);
      const [saving, setSaving] = useState(false);
      const fill = (c) => {
        const x = c || {};
        setCfg(x);
        setForm({
          enabled: !!x.enabled, provider: x.provider || 'meta', phone_number_id: x.phone_number_id || '', business_number: x.business_number || '',
          aisensy_campaign_assigned: x.aisensy_campaign_assigned || 'ams_task_assigned',
          aisensy_campaign_followup: x.aisensy_campaign_followup || 'ams_task_followup',
          aisensy_campaign_completed: x.aisensy_campaign_completed || 'ams_task_completed',
          lang: x.lang || 'en', tpl_assigned: x.tpl_assigned || 'task_assigned', tpl_followup: x.tpl_followup || 'task_followup',
          tpl_completed: x.tpl_completed || 'task_completed', notify_min_priority: Number(x.notify_min_priority) || 2,
          notify_direct: x.notify_direct !== false, notify_posts: !!x.notify_posts, notify_completed: x.notify_completed !== false,
          app_url: x.app_url || '',
        });
        if (onConfig) onConfig(x);
      };
      const load = useCallback(async () => {
        try { fill(await rpcCall('wa_config_get')); setErr(null); }
        catch (e) { setErr(e); }
      }, []);
      useEffect(() => { load(); }, [load]);
      const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
      const save = async () => {
        if (form.enabled && form.provider !== 'aisensy' && !form.phone_number_id.trim()) { showToast(ERR.phone_number_id_required); return; }
        setSaving(true);
        try {
          fill(await rpcCall('wa_config_set', { p_data: { ...form, notify_min_priority: Number(form.notify_min_priority) } }));
          showToast('WhatsApp setup saved ✓');
        } catch (e) { showToast(errText(e)); }
        setSaving(false);
      };
      const copyHook = async () => { const ok = await copyText(cfg.webhook_url || ''); showToast(ok ? 'Webhook URL copied' : 'Copy failed'); };
      const ro = !canEdit;
      const stats = (cfg && cfg.stats) || {};
      const prioOpts = PRIORITY_RULES.concat(form && ![1, 2, 3, 5].includes(Number(form.notify_min_priority)) ? [{ v: Number(form.notify_min_priority), label: 'Up to Low' }] : []);

      const field = (k, label, opts) => {
        const o = opts || {};
        return h`<label class="wa-f">
          <span class="wa-lbl">${label}</span>
          <input class=${'wa-in' + (o.mono ? ' mono' : '')} value=${form[k]} placeholder=${o.placeholder || ''} disabled=${ro} inputMode=${o.inputMode || undefined}
            onInput=${e => set(k, e.target.value)}/>
          ${o.hint ? h`<span class="wa-hint">${o.hint}</span>` : null}
        </label>`;
      };
      const sw = (k, title, sub) => h`<div class="wa-srow">
        <div><div class="wa-srow-t">${title}</div>${sub ? h`<div class="wa-srow-s">${sub}</div>` : null}</div>
        <${Toggle} on=${form[k]} label=${title} disabled=${ro} onChange=${v => set(k, v)}/>
      </div>`;

      return h`<${Card} icon="ti-settings" title="Setup" sub=${canEdit ? 'Connect the WhatsApp Business Platform and decide what gets sent' : 'Only an admin can change these settings'}
        right=${cfg ? h`<span class="wa-row" style=${{ gap: 6, fontSize: 12, color: 'var(--cu-t2)' }}><span class=${'wa-dot' + (cfg.enabled ? ' on' : '')}></span>${cfg.enabled ? 'Enabled' : 'Off'}</span>` : null}>
        ${err ? h`<div class="wa-note">${errText(err)}</div>` : !form ? h`<${Loading} rows=${4}/>` : h`<${Fragment}>
          <div class="wa-stats">
            <div class="wa-stat"><div class="wa-stat-n">${stats.queued || 0}</div><div class="wa-stat-l">Queued</div></div>
            <div class="wa-stat"><div class="wa-stat-n" style=${{ color: stats.sent_24h ? '#30a46c' : undefined }}>${stats.sent_24h || 0}</div><div class="wa-stat-l">Sent · 24h</div></div>
            <div class="wa-stat"><div class="wa-stat-n" style=${{ color: stats.failed_24h ? '#e5484d' : undefined }}>${stats.failed_24h || 0}</div><div class="wa-stat-l">Failed · 24h</div></div>
          </div>

          <div class="wa-srow" style=${{ borderTop: 'none', paddingTop: 0 }}>
            <div>
              <div class="wa-srow-t">Enabled</div>
              <div class="wa-srow-s">${form.provider === 'aisensy' ? 'Nothing is sent to anyone until this is on (and the AISENSY_API_KEY secret is set).' : 'Nothing is sent to anyone until this is on (and the WHATSAPP_TOKEN secret is set).'}</div>
            </div>
            <${Toggle} on=${form.enabled} label="WhatsApp enabled" disabled=${ro} onChange=${v => set('enabled', v)}/>
          </div>

          <div class="wa-sub">Provider</div>
          <div class="wa-srow" style=${{ borderTop: 'none', flexWrap: 'wrap' }}>
            <div style=${{ minWidth: 0, flex: '1 1 220px' }}>
              <div class="wa-srow-t">Send WhatsApp through</div>
              <div class="wa-srow-s">${form.provider === 'aisensy' ? 'AiSensy API campaigns. Assignees mark tasks done with a one-tap link in the message.' : 'Meta WhatsApp Cloud API directly, with Mark as done / Open task buttons.'}</div>
            </div>
            <select class="wa-in" style=${{ width: 190 }} disabled=${ro} value=${form.provider} aria-label="WhatsApp provider" onChange=${e => set('provider', e.target.value)}>
              <option value="aisensy">AiSensy</option>
              <option value="meta">Meta Cloud API (direct)</option>
            </select>
          </div>
          ${form.provider === 'aisensy' ? h`<${Fragment}>
            <div class="wa-sub">AiSensy API campaign names</div>
            <div class="wa-grid three">
              ${field('aisensy_campaign_assigned', 'Assigned', { mono: true, placeholder: 'ams_task_assigned' })}
              ${field('aisensy_campaign_followup', 'Follow-up / nudge', { mono: true, placeholder: 'ams_task_followup' })}
              ${field('aisensy_campaign_completed', 'Completed', { mono: true, placeholder: 'ams_task_completed' })}
            </div>
            <div class="wa-hint" style=${{ marginTop: 5 }}>Each name must match a <b>Live</b> API campaign in AiSensy. The API key lives in the ${h`<span class="wa-code">${'AISENSY_API_KEY'}</span>`} Supabase secret.</div>
          <//>` : null}

          ${form.provider !== 'aisensy' ? h`<${Fragment}>
          <div class="wa-sub">Connection</div>
          <div class="wa-grid">
            ${field('phone_number_id', 'Phone number ID', { mono: true, placeholder: 'e.g. 109876543210987', inputMode: 'numeric', hint: 'Meta app → WhatsApp → API Setup' })}
            ${field('business_number', 'Business number', { placeholder: '+91 98xxx xxxxx', hint: 'Display only — shown to your team' })}
            ${field('lang', 'Template language', { mono: true, placeholder: 'en', hint: 'Must match the approved templates, e.g. en or en_US' })}
            ${field('app_url', 'App link base', { mono: true, placeholder: 'https://mydigitalsevak.in/app/' })}
          </div>

          <div class="wa-sub">Template names</div>
          <div class="wa-grid three">
            ${field('tpl_assigned', 'Assigned', { mono: true, placeholder: 'task_assigned' })}
            ${field('tpl_followup', 'Follow-up / nudge', { mono: true, placeholder: 'task_followup' })}
            ${field('tpl_completed', 'Completed', { mono: true, placeholder: 'task_completed' })}
          </div>
          <//>` : null}

          <div class="wa-sub">Rules</div>
          <div class="wa-srow" style=${{ borderTop: 'none', flexWrap: 'wrap' }}>
            <div style=${{ minWidth: 0, flex: '1 1 220px' }}>
              <div class="wa-srow-t">Message assignees for priority up to</div>
              <div class="wa-srow-s">Tasks at or above this priority send an assignment message. Any task with a follow-up always does.</div>
            </div>
            <select class="wa-in" style=${{ width: 170 }} disabled=${ro} value=${String(form.notify_min_priority)} aria-label="Message assignees for priority up to"
              onChange=${e => set('notify_min_priority', Number(e.target.value))}>
              ${prioOpts.map(p => h`<option key=${p.v} value=${String(p.v)}>${p.label}</option>`)}
            </select>
          </div>
          ${sw('notify_direct', 'Direct tasks always', 'Tasks sent with "Direct task" message the assignee regardless of priority.')}
          ${sw('notify_posts', 'Content posts too', 'Also message editors/designers about content-calendar posts (within the priority rule).')}
          ${sw('notify_completed', "Tell the delegator when it's done", 'The person who created the task gets a WhatsApp when it is completed.')}

          ${form.provider !== 'aisensy' ? h`<${Fragment}>
          <div class="wa-sub">Webhook</div>
          <div class="wa-row" style=${{ flexWrap: 'nowrap' }}>
            <input class="wa-in mono" readOnly=${true} value=${cfg.webhook_url || ''} aria-label="Webhook URL" onFocus=${e => e.target.select()}/>
            <button type="button" class="wa-btn" onClick=${copyHook} disabled=${!cfg.webhook_url}><i class="ti ti-copy"></i><span>Copy</span></button>
          </div>
          <div class="wa-hint" style=${{ marginTop: 5 }}>Paste into Meta app → WhatsApp → Configuration → Callback URL, and subscribe to the ${h`<span class="wa-code">${'messages'}</span>`} field.</div>
          <//>` : null}

          ${canEdit ? h`<div class="wa-row" style=${{ marginTop: 16 }}>
            <button type="button" class="wa-btn pri" disabled=${saving} onClick=${save}>${saving ? h`<${Spin}/>` : h`<i class="ti ti-check"></i>`}Save setup</button>
            <button type="button" class="wa-btn ghost" disabled=${saving} onClick=${() => fill(cfg)}>Reset</button>
          </div>` : null}

          <${HowToConnect} webhookUrl=${cfg.webhook_url} showToast=${showToast} provider=${form.provider}/>
        <//>`}
      <//>`;
    }

    // =========================================================================
    // Message log (admin / manager)
    // =========================================================================
    function LogCard({ showToast }) {
      const [rows, setRows] = useState(null);
      const [loading, setLoading] = useState(false);
      const [err, setErr] = useState(null);
      const load = useCallback(async (manual) => {
        setLoading(true);
        try { setRows(arr(await rpcCall('wa_outbox_list', { p_limit: 50 }))); setErr(null); }
        catch (e) { setErr(e); setRows(r => r || []); if (manual) showToast(errText(e)); }
        setLoading(false);
      }, []);
      useEffect(() => { load(false); }, [load]);
      return h`<${Card} icon="ti-history" title="Message log" sub="Last 50 WhatsApp messages for this workspace"
        right=${h`<button type="button" class="wa-btn sm" disabled=${loading} onClick=${() => load(true)}>${loading ? h`<${Spin}/>` : h`<i class="ti ti-refresh"></i>`}Refresh</button>`}>
        ${err ? h`<div class="wa-note">${errText(err)}</div>` : null}
        ${!rows ? h`<${Loading} rows=${3}/>` : !rows.length ? h`<div class="wa-empty"><i class="ti ti-message-off" style=${{ fontSize: 26, display: 'block', marginBottom: 6, opacity: .5 }}></i>No messages yet.</div>` : h`<div class="wa-tbl-wrap">
          <table class="wa-tbl log">
            <thead><tr><th>Time</th><th>Kind</th><th>To</th><th>Task</th><th>Status</th></tr></thead>
            <tbody>${rows.map(r => {
              const k = KIND_META[r.kind] || { label: r.kind, color: '#87909e' };
              const when = r.sent_at || r.created_at;
              const scheduledLater = r.status === 'queued' && r.scheduled_at && new Date(r.scheduled_at).getTime() > Date.now() + 60000;
              const stTitle = [r.error ? 'Error: ' + r.error : '', scheduledLater ? 'Scheduled for ' + fmtStamp(r.scheduled_at) + ' (quiet hours)' : '', r.attempts > 1 ? r.attempts + ' attempts' : ''].filter(Boolean).join(' · ');
              return h`<tr key=${r.id}>
                <td style=${{ whiteSpace: 'nowrap', color: 'var(--cu-t2)' }} title=${when ? new Date(when).toLocaleString('en-IN') : ''}>${fmtStamp(when)}</td>
                <td><${Pill} label=${k.label} color=${k.color}/></td>
                <td>
                  <div class="wa-ellip" style=${{ maxWidth: 160 }}>${r.member_name || '—'}</div>
                  <div style=${{ fontSize: 11, color: 'var(--cu-t3)' }}>${r.to_phone || ''}</div>
                </td>
                <td title=${r.preview || ''}>
                  ${r.task_id
                    ? h`<button type="button" class="wa-link wa-ellip" onClick=${() => openTask(r.task_id)}>${r.task_title || 'Open task'}</button>`
                    : h`<span style=${{ color: 'var(--cu-t3)' }}>${r.kind === 'test' ? 'Test message' : '—'}</span>`}
                </td>
                <td style=${{ whiteSpace: 'nowrap' }}>
                  <${Pill} label=${r.status} color=${STATUS_COLOR[r.status]} title=${stTitle}/>
                  ${r.error || scheduledLater ? h`<i class=${'ti ' + (r.error ? 'ti-alert-circle' : 'ti-moon')} title=${stTitle} style=${{ marginLeft: 4, color: r.error ? '#e5484d' : 'var(--cu-t3)', fontSize: 14, verticalAlign: 'middle' }}></i>` : null}
                </td>
              </tr>`;
            })}</tbody>
          </table>
        </div>`}
      <//>`;
    }

    // =========================================================================
    // Section
    // =========================================================================
    function WhatsAppSettingsSection({ user, showToast }) {
      const role = (user && user.role_level) || '';
      const isAdmin = role === 'admin';
      const isManager = role === 'manager';
      const toast = useCallback((m) => { if (showToast) showToast(m); else console.warn('[whatsapp]', m); }, [showToast]);
      const [orgEnabled, setOrgEnabled] = useState(null);
      return h`<div class="wa-root">
        <div class="wa-page-hd">
          <div class="wa-page-t"><i class="ti ti-brand-whatsapp" aria-hidden="true"></i>WhatsApp</div>
          <div class="wa-page-s">Delegated tasks reach people on WhatsApp: a message when they're assigned, follow-ups until the task is done, a one-tap "Mark as done", and a note to whoever delegated it once it's finished.</div>
        </div>
        <${MyWhatsAppCard} showToast=${toast}/>
        ${isAdmin || isManager ? h`<${Fragment}>
          <${TeamCard} orgEnabled=${orgEnabled} showToast=${toast}/>
          <${SetupCard} canEdit=${isAdmin} showToast=${toast} onConfig=${c => setOrgEnabled(!!(c && c.enabled))}/>
          <${LogCard} showToast=${toast}/>
        <//>` : null}
      </div>`;
    }

    return { WhatsAppSettingsSection };
  }

  window.AMS_WHATSAPP = { buildWhatsApp };
})();

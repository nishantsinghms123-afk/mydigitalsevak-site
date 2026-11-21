/* ==========================================================================
 * posts.js — the post's own fields, inline in TaskPanel.
 *
 * window.AMS_POSTS.buildPosts(deps) → registers into window.AMS_EXT:
 *   taskPanelSections  post_refs     (reference links, at the top of the task)
 *                      post_publish  (auto-publishing: Schedule / Post now)
 *                      post_fields   (caption and hashtags; other fields show once
 *                                     filled, the empty ones wait under Advanced)
 *
 * The brief is the task's own Description: tasks.description and content.concept are
 * synced, so there is no second Concept box here.
 *
 * WHY: a post used to be half-editable in TaskPanel and half in the legacy
 * PostPanel slide-over, reachable only via "Open full post editor". ClickUp has
 * no "post" concept at all — that button was our own migration scaffolding.
 * These two sections move the everyday work inline; the button stays only as a
 * rarely-used escape hatch for previews, version history and the send-to-client
 * transition, which remain PostPanel-only.
 *
 * DELIBERATELY NOT HERE (each would create a second source of truth or a
 * duplicate notification path — see index.html PostPanel save()):
 *   workflow_status / client_approval / assigned_to  — TaskPanel already owns
 *     status and assignees natively, and all three fire notifyContent() fan-out
 *     from PostPanel. Editing them in two places is the exact bug we just fixed.
 *   drive_link — notification-bearing on change; shown read-only by tasks.js.
 *   previews / version history / revision rounds / production_done — PostPanel.
 *
 * Every field here is notification-free, so a plain content_update is the whole
 * write. Concurrency is guarded the same way PostPanel does it: compare
 * updated_at/updated_by before saving and refuse to clobber someone else.
 *
 * Fails open: no content_id, no deps, or a missing RPC → the section hides.
 * ==========================================================================*/
(function () {
  function buildPosts(deps) {
    const d = deps || {};
    const React = d.React, h = d.h;
    const useState = d.useState, useEffect = d.useEffect, useCallback = d.useCallback, useRef = d.useRef;
    const db = d.db, rpcCall = d.rpcCall;
    const PublishSection = d.PublishSection;
    const POST_TYPES = d.POST_TYPES || [];
    if (!React || !h || !db || !rpcCall) return {};

    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key || item.type;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item);
    };

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-posts-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-posts-styles';
      st.textContent = `
      .pf-grid{display:flex;flex-direction:column;gap:2px}
      .pf-row{display:grid;grid-template-columns:132px minmax(0,1fr);gap:10px;align-items:flex-start;padding:5px 0}
      .pf-k{display:flex;align-items:center;gap:7px;color:var(--cu-t3,#8b8b93);font-size:12.5px;padding-top:6px}
      .pf-k i{font-size:14px}
      .pf-v{min-width:0}
      .pf-in{width:100%;border:1px solid transparent;border-radius:var(--cu-radius,8px);background:transparent;
        color:var(--cu-t1,#1f1f23);font:inherit;font-size:13px;padding:5px 8px;resize:vertical}
      .pf-in:hover{background:var(--cu-bg2,#f6f6f7)}
      .pf-in:focus{outline:none;border-color:var(--cu-accent,#ff00ee);background:var(--cu-bg,#fff)}
      .pf-in::placeholder{color:var(--cu-t3,#8b8b93)}
      .pf-ta{min-height:34px;line-height:1.5}
      .pf-hint{font-size:11.5px;color:var(--cu-t3,#8b8b93);padding:2px 8px 0}
      .pf-warn{display:flex;align-items:flex-start;gap:8px;border:1px solid #f5c2c7;background:#fff5f5;color:#b42318;
        border-radius:var(--cu-radius,8px);padding:8px 10px;font-size:12.5px;margin-bottom:8px}
      .pf-refs{display:flex;flex-direction:column;gap:4px}
      .pf-ref{display:flex;align-items:center;gap:6px;font-size:12.5px}
      .pf-ref a{color:var(--cu-accent-ink,#a8009c);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pf-x{border:none;background:transparent;color:var(--cu-t3,#8b8b93);cursor:pointer;padding:2px;line-height:1}
      .pf-x:hover{color:#b42318}
      .pf-oos{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;user-select:none}
      .pf-refbar{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:8px 0 2px;padding:8px 10px;background:var(--cu-bg2,#f6f6f7);border-radius:var(--cu-radius,8px)}
      .pf-refbar .lbl{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--cu-t2,#5c5c66);margin-right:4px}
      .pf-refbar .lbl i{font-size:15px;color:var(--cu-accent-ink,#a8009c)}
      .pf-chip{display:inline-flex;align-items:center;gap:5px;height:26px;max-width:260px;padding:0 4px 0 9px;background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);border-radius:13px;font-size:12.5px}
      .pf-chip a,.pf-chip span{color:var(--cu-accent-ink,#a8009c);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pf-chip span{color:var(--cu-t1,#1f1f23)}
      .pf-chip a:hover{text-decoration:underline}
      @media(pointer:coarse),(max-width:760px){.pf-chip{height:32px}.pf-chip a{padding:7px 0}.pf-chip .pf-x{padding:6px}.pf-refadd{height:32px}}
      .pf-chip>i{font-size:14px;color:var(--cu-t3,#8b8b93)}
      .pf-chip .pf-x{opacity:.55}
      .pf-chip:hover .pf-x{opacity:1}
      .pf-refadd{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border:1px dashed var(--cu-bd,#e8e8eb);border-radius:13px;background:transparent;color:var(--cu-t2,#5c5c66);font:12.5px Inter,system-ui,sans-serif;cursor:pointer}
      .pf-refadd:hover{color:var(--cu-t1,#1f1f23);border-color:var(--cu-t3,#8b8b93)}
      .pf-refin{height:26px;min-width:240px;flex:1;max-width:420px;border:1px solid var(--cu-accent,#ff00ee);border-radius:13px;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:12.5px Inter,system-ui,sans-serif;padding:0 10px}
      .pf-refin:focus{outline:none}
      .pf-adv{display:inline-flex;align-items:center;gap:6px;border:none;background:transparent;color:var(--cu-t2,#5c5c66);font:13px Inter,system-ui,sans-serif;cursor:pointer;padding:6px 0;margin-top:2px}
      .pf-adv:hover{color:var(--cu-t1,#1f1f23)}`;
      document.head.appendChild(st);
    }

    // ---- an inline field that saves on blur --------------------------------
    // Mirrors PostPanel's behaviour: '' is stored as null, save only when the
    // value actually changed, and never fight the user mid-typing.
    function Field({ value, onSave, placeholder, multiline, rows, disabled, type }) {
      const [v, setV] = useState(value == null ? '' : String(value));
      const [busy, setBusy] = useState(false);
      const last = useRef(value == null ? '' : String(value));
      // Adopt external changes (another save, a reload) unless we're mid-edit.
      useEffect(() => {
        const next = value == null ? '' : String(value);
        if (next !== last.current) { last.current = next; setV(next); }
      }, [value]);

      const commit = async () => {
        if (v === last.current || busy) return;
        const prev = last.current;
        last.current = v;
        setBusy(true);
        try { await onSave(v === '' ? null : v); }
        catch (e) { last.current = prev; setV(prev); }
        finally { setBusy(false); }
      };

      const common = {
        class: 'pf-in' + (multiline ? ' pf-ta' : ''), value: v, placeholder: placeholder || 'Empty',
        disabled: !!(disabled || busy),
        onInput: (e) => setV(e.target.value),
        onBlur: commit,
        onKeyDown: (e) => {
          if (e.key === 'Escape') { setV(last.current); e.target.blur(); }
          if (e.key === 'Enter' && !multiline) e.target.blur();
        },
      };
      return multiline
        ? h`<textarea ...${common} rows=${rows || 2}></textarea>`
        : h`<input ...${common} type=${type || 'text'}/>`;
    }

    // ---- reference links (newline-separated in content.reference_links) -----
    // Long links are hard to read at a glance, so each shows as a short named chip.
    const refChip = (r) => {
      let host = '';
      try { host = new URL(r).hostname.replace(/^www\./, ''); } catch (e) { return { label: r, icon: 'ti-note', url: null }; }
      if (/(^|\.)instagram\.com$/.test(host)) return { label: /\/reel/.test(r) ? 'Instagram reel' : 'Instagram post', icon: 'ti-brand-instagram', url: r };
      if (/pinterest\.|pinimg\.com$|(^|\.)pin\.it$/.test(host)) return { label: 'Pinterest', icon: 'ti-brand-pinterest', url: r };
      if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return { label: 'YouTube', icon: 'ti-brand-youtube', url: r };
      if (/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(host)) return { label: 'Google Drive', icon: 'ti-brand-google-drive', url: r };
      return { label: host, icon: 'ti-link', url: r };
    };
    function RefLinks({ value, onSave, disabled }) {
      const refs = String(value || '').split('\n').map(s => s.trim()).filter(Boolean);
      const [adding, setAdding] = useState(false);
      const [draft, setDraft] = useState('');
      const add = async () => {
        const t = draft.trim();
        setDraft(''); setAdding(false);
        if (!t) return;
        await onSave(refs.concat(t).join('\n') || null);
      };
      const remove = async (i) => { const next = refs.slice(); next.splice(i, 1); await onSave(next.length ? next.join('\n') : null); };
      return h`<div class="pf-refbar">
        <span class="lbl"><i class="ti ti-bookmark" aria-hidden="true"></i>References</span>
        ${refs.map((r, i) => { const c = refChip(r); return h`<span class="pf-chip" key=${r + i} title=${r}>
          <i class=${'ti ' + c.icon} aria-hidden="true"></i>
          ${c.url ? h`<a href=${c.url} target="_blank" rel="noopener">${c.label}</a>` : h`<span>${c.label}</span>`}
          ${!disabled && h`<button type="button" class="pf-x" aria-label=${'Remove ' + c.label} title="Remove" onClick=${() => remove(i)}><i class="ti ti-x"></i></button>`}
        </span>`; })}
        ${adding
          ? h`<input class="pf-refin" autoFocus aria-label="Reference link" placeholder="Paste a link and press Enter" value=${draft}
                onInput=${e => setDraft(e.target.value)} onBlur=${add}
                onKeyDown=${e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setDraft(''); setAdding(false); } }}/>`
          : (!disabled && h`<button type="button" class="pf-refadd" onClick=${() => setAdding(true)}><i class="ti ti-plus" aria-hidden="true"></i>Add</button>`)}
      </div>`;
    }

    // ---- reads and saves one post, shared by the sections below -------------
    function usePostRow(props) {
      const task = props.task || (props.detail && props.detail.task) || {};
      const showToast = props.showToast;
      const currentUser = props.currentUser;
      const cid = task.content_id;

      const [row, setRow] = useState(null);      // null = loading, false = failed
      const [conflict, setConflict] = useState(null);
      const lockedAt = useRef(null);

      const load = useCallback(async () => {
        if (!cid) return;
        try {
          const rows = await db('content', `&id=eq.${cid}`);
          const r = rows && rows[0];
          if (r) { setRow(r); lockedAt.current = r.updated_at || null; }
          else setRow(false);
        } catch (e) { setRow(false); }
      }, [cid]);
      useEffect(() => { load(); }, [load]);

      // Same optimistic lock PostPanel uses: if someone else wrote after our last
      // read, refuse rather than silently overwrite them.
      const stale = async () => {
        if (!lockedAt.current) return null;
        try {
          const rows = await db('content', `&id=eq.${cid}&select=updated_at,updated_by`);
          const cur = rows && rows[0];
          if (!cur || !cur.updated_at) return null;
          const them = new Date(cur.updated_at).getTime();
          const mine = new Date(lockedAt.current).getTime();
          if (them - mine > 1500 && cur.updated_by && cur.updated_by !== (currentUser && currentUser.name)) {
            return { by: cur.updated_by, at: cur.updated_at };
          }
        } catch (e) { /* a transient read failure must not block the save */ }
        return null;
      };

      const save = async (key, value) => {
        const clash = await stale();
        if (clash) { setConflict(clash); throw new Error('conflict'); }
        setRow(r => (r ? { ...r, [key]: value } : r));
        try {
          const res = await rpcCall('content_update', { p_id: cid, p_patch: { [key]: value } });
          const fresh = Array.isArray(res) ? res[0] : null;
          lockedAt.current = (fresh && fresh.updated_at) || new Date().toISOString();
          if (fresh) setRow(fresh);
          setConflict(null);
          if (showToast) showToast('Saved');
        } catch (e) {
          await load();                       // put the true server value back
          if (showToast) showToast('Could not save — ' + String((e && (e.message || e.code)) || 'unknown'));
          throw e;
        }
      };

      return { cid, row, save, load, conflict, setConflict };
    }

    const conflictNote = (p) => p.conflict && h`<div class="pf-warn">
      <i class="ti ti-alert-triangle" style=${{ fontSize: 15, marginTop: 1 }}></i>
      <div><strong>${p.conflict.by}</strong> edited this post after you opened it. Your change was not saved —
      <button type="button" class="pf-x" style=${{ color: 'inherit', textDecoration: 'underline' }}
        onClick=${() => { p.setConflict(null); p.load(); }}>reload the latest</button> and try again.</div>
    </div>`;

    // ---- references, at the top of the task ---------------------------------
    function PostRefsSection(props) {
      const p = usePostRow(props);
      if (!p.cid || !p.row) return null;
      return h`<div>
        ${conflictNote(p)}
        <${RefLinks} value=${p.row.reference_links} onSave=${v => p.save('reference_links', v)}/>
      </div>`;
    }

    // ---- caption, hashtags, and everything else under Advanced --------------
    // Filled-in fields always show: only an empty box waits behind Advanced, so no note gets hidden.
    const POST_EXTRAS = [
      { key: 'content_pillar', label: 'Pillar', icon: 'ti-columns', placeholder: 'e.g. Awareness, Offer' },
      { key: 'designer_notes', label: 'Designer', icon: 'ti-palette', placeholder: 'Notes for the designer', multiline: true },
      { key: 'editor_notes', label: 'Editor', icon: 'ti-scissors', placeholder: 'Notes for the editor', multiline: true },
      { key: 'production_notes', label: 'Production', icon: 'ti-video', placeholder: 'Production notes', multiline: true },
      { key: 'post_link', label: 'Post link', icon: 'ti-external-link', placeholder: 'Live post URL', type: 'url' },
    ];
    function PostFieldsSection(props) {
      const p = usePostRow(props);
      const [advanced, setAdvanced] = useState(false);
      if (!p.cid) return null;
      const row = p.row;
      if (row === null) return h`<div class="pf-hint">Loading post details…</div>`;
      if (row === false) return h`<div class="pf-hint">Post details unavailable.</div>`;

      const f = (key, node) => h`<div class="pf-row" key=${key.key || undefined}><div class="pf-k">${node}</div><div class="pf-v">${key}</div></div>`;
      const extra = (x) => h`<div class="pf-row" key=${x.key}>
        <div class="pf-k"><i class=${'ti ' + x.icon}></i>${x.label}</div>
        <div class="pf-v"><${Field} value=${row[x.key]} multiline=${!!x.multiline} type=${x.type} placeholder=${x.placeholder} onSave=${v => p.save(x.key, v)}/></div>
      </div>`;
      const filled = POST_EXTRAS.filter(x => String(row[x.key] == null ? '' : row[x.key]).trim() !== '');
      const empty = POST_EXTRAS.filter(x => !filled.includes(x));

      return h`<div class="pf-grid">
        ${conflictNote(p)}
        ${f(h`<${Field} value=${row.caption} multiline=${true} rows=${3} placeholder="Write the caption…"
              onSave=${v => p.save('caption', v)}/>`, h`<${React.Fragment}><i class="ti ti-quote"></i>Caption<//>`)}
        ${f(h`<${Field} value=${row.hashtags} multiline=${true} rows=${2} placeholder="#hashtags"
              onSave=${v => p.save('hashtags', v)}/>`, h`<${React.Fragment}><i class="ti ti-hash"></i>Hashtags<//>`)}
        ${filled.map(extra)}
        ${empty.length ? h`<button type="button" class="pf-adv" aria-expanded=${advanced} onClick=${() => setAdvanced(a => !a)}>
          <i class=${'ti ' + (advanced ? 'ti-chevron-up' : 'ti-chevron-down')} aria-hidden="true"></i>Advanced</button>` : null}
        ${advanced ? empty.map(extra) : null}
      </div>`;
    }

    // ---- registrations (consumers read AMS_EXT at render time) -------------
    const isPost = (t) => !!(t && t.type === 'post' && t.content_id);

    // Auto-publishing. PublishSection already exists in social.js and only needs
    // client_id / id / type from the content row, plus client_approval to decide
    // whether Schedule is offered — all of which task.post carries (093:427).
    if (typeof PublishSection === 'function') {
      reg('taskPanelSections', {
        id: 'post_publish', title: 'Publishing', icon: 'ti-send', order: 22, placement: 'main', compact: true,
        when: isPost,
        filled: (t) => ['scheduled', 'posted'].includes(t && t.post && t.post.workflow_status),
        Component: (p) => {
          const task = p.task || (p.detail && p.detail.task) || {};
          const post = task.post || {};
          const shim = { id: task.content_id, client_id: task.client_id, type: post.type, performance: post.performance || null };
          const fields = { client_approval: post.client_approval, performance: post.performance || null };
          return h`<${PublishSection} post=${shim} fields=${fields} currentUser=${p.currentUser} showToast=${p.showToast}/>`;
        },
      });
    }

    reg('taskPanelSections', {
      id: 'post_refs', title: 'References', icon: 'ti-bookmark', order: 5, placement: 'top',
      when: isPost,
      Component: (p) => h`<${PostRefsSection} ...${p}/>`,
    });

    reg('taskPanelSections', {
      id: 'post_fields', title: 'Caption and hashtags', icon: 'ti-file-text', order: 23, placement: 'main',
      when: isPost,
      Component: (p) => h`<${PostFieldsSection} ...${p}/>`,
    });

    return { PostFieldsSection };
  }

  window.AMS_POSTS = { buildPosts };
})();

/* ==========================================================================
 * posts.js — the post's own fields, inline in TaskPanel.
 *
 * window.AMS_POSTS.buildPosts(deps) → registers into window.AMS_EXT:
 *   taskPanelSections  post_publish  (auto-publishing: Schedule / Post now)
 *                      post_fields   (caption, hashtags, concept, notes, links)
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
      .pf-oos{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;user-select:none}`;
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
      return h`<div class="pf-refs">
        ${refs.map((r, i) => h`<div class="pf-ref" key=${r + i}>
          <i class="ti ti-link" style=${{ fontSize: 13, color: 'var(--cu-t3,#8b8b93)' }}></i>
          ${/^https?:\/\//i.test(r)
            ? h`<a href=${r} target="_blank" rel="noopener">${r}</a>`
            : h`<span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${r}</span>`}
          ${!disabled && h`<button type="button" class="pf-x" title="Remove" onClick=${() => remove(i)}><i class="ti ti-x"></i></button>`}
        </div>`)}
        ${adding
          ? h`<input class="pf-in" autoFocus placeholder="Paste a link and press Enter" value=${draft}
                onInput=${e => setDraft(e.target.value)} onBlur=${add}
                onKeyDown=${e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { setDraft(''); setAdding(false); } }}/>`
          : (!disabled && h`<button type="button" class="cu-btn cu-btn-ghost" style=${{ alignSelf: 'flex-start', height: 26 }}
                onClick=${() => setAdding(true)}><i class="ti ti-plus"></i>Add reference</button>`)}
      </div>`;
    }

    // ---- the post's own fields ---------------------------------------------
    function PostFieldsSection(props) {
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

      if (!cid) return null;
      if (row === null) return h`<div class="pf-hint">Loading post details…</div>`;
      if (row === false) return h`<div class="pf-hint">Post details unavailable.</div>`;

      const pt = POST_TYPES.find(x => x.key === row.type);
      const f = (key, node) => h`<div class="pf-row"><div class="pf-k">${node}</div><div class="pf-v">${key}</div></div>`;

      return h`<div class="pf-grid">
        ${conflict && h`<div class="pf-warn">
          <i class="ti ti-alert-triangle" style=${{ fontSize: 15, marginTop: 1 }}></i>
          <div><strong>${conflict.by}</strong> edited this post after you opened it. Your change was not saved —
          <button type="button" class="pf-x" style=${{ color: 'inherit', textDecoration: 'underline' }}
            onClick=${() => { setConflict(null); load(); }}>reload the latest</button> and try again.</div>
        </div>`}

        ${f(h`<${Field} value=${row.caption} multiline=${true} rows=${3} placeholder="Write the caption…"
              onSave=${v => save('caption', v)}/>`, h`<${React.Fragment}><i class="ti ti-quote"></i>Caption<//>`)}

        ${f(h`<${Field} value=${row.hashtags} multiline=${true} rows=${2} placeholder="#hashtags"
              onSave=${v => save('hashtags', v)}/>`, h`<${React.Fragment}><i class="ti ti-hash"></i>Hashtags<//>`)}

        ${f(h`<${Field} value=${row.concept} multiline=${true} rows=${2} placeholder="The idea behind this post"
              onSave=${v => save('concept', v)}/>`, h`<${React.Fragment}><i class="ti ti-bulb"></i>Concept<//>`)}

        ${f(h`<${Field} value=${row.content_pillar} placeholder="e.g. Awareness, Offer"
              onSave=${v => save('content_pillar', v)}/>`, h`<${React.Fragment}><i class="ti ti-columns"></i>Pillar<//>`)}

        ${f(h`<${Field} value=${row.designer_notes} multiline=${true} placeholder="Notes for the designer"
              onSave=${v => save('designer_notes', v)}/>`, h`<${React.Fragment}><i class="ti ti-palette"></i>Designer<//>`)}

        ${f(h`<${Field} value=${row.editor_notes} multiline=${true} placeholder="Notes for the editor"
              onSave=${v => save('editor_notes', v)}/>`, h`<${React.Fragment}><i class="ti ti-scissors"></i>Editor<//>`)}

        ${f(h`<${Field} value=${row.production_notes} multiline=${true} placeholder="Production notes"
              onSave=${v => save('production_notes', v)}/>`, h`<${React.Fragment}><i class="ti ti-video"></i>Production<//>`)}

        ${f(h`<${Field} value=${row.post_link} type="url" placeholder="Live post URL"
              onSave=${v => save('post_link', v)}/>`, h`<${React.Fragment}><i class="ti ti-external-link"></i>Post link<//>`)}

        ${f(h`<${RefLinks} value=${row.reference_links} onSave=${v => save('reference_links', v)}/>`,
            h`<${React.Fragment}><i class="ti ti-bookmark"></i>References${(() => {
              const n = String(row.reference_links || '').split('\n').filter(s => s.trim()).length;
              return n ? ' · ' + n : '';
            })()}<//>`)}

        ${pt && h`<div class="pf-hint" style=${{ paddingTop: 6 }}>Sub-type: ${pt.label}</div>`}
      </div>`;
    }

    // ---- registrations (consumers read AMS_EXT at render time) -------------
    const isPost = (t) => !!(t && t.type === 'post' && t.content_id);

    // Auto-publishing. PublishSection already exists in social.js and only needs
    // client_id / id / type from the content row, plus client_approval to decide
    // whether Schedule is offered — all of which task.post carries (093:427).
    if (typeof PublishSection === 'function') {
      reg('taskPanelSections', {
        id: 'post_publish', title: 'Publishing', icon: 'ti-send', order: 22, placement: 'main',
        when: isPost,
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
      id: 'post_fields', title: 'Post details', icon: 'ti-file-text', order: 23, placement: 'main',
      when: isPost,
      Component: (p) => h`<${PostFieldsSection} ...${p}/>`,
    });

    return { PostFieldsSection };
  }

  window.AMS_POSTS = { buildPosts };
})();

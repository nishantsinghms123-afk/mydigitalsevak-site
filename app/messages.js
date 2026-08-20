/* ============================================================================
 * messages.js — internal team messaging (staff-to-staff chat)
 *
 * DMs + ad-hoc group threads. Three-pane layout: conversation list · thread ·
 * info panel. Registered on window and built from index.html's shared bridge
 * (single React instance, hooks-safe — same pattern as notifications.js /
 * employee.js).
 *
 *   window.AMS_MESSAGES.buildMessages(deps) → { MessagesApp, useChatUnread }
 *
 * Delivery model (see migrations/080_team_messaging.sql header):
 *   • Open thread → INSTANT via a Supabase Broadcast channel keyed on the
 *     conversation UUID (only members ever learn that UUID, so no leak).
 *   • Sidebar unread / new conversations → a visible-tab poll (source of truth).
 *   • Push + bell when the app is closed → msg_send inserts notifications rows
 *     server-side (079 trigger → send-push). No new edge function.
 *
 * All reads/writes go through session-gated SECURITY DEFINER RPCs (msg_*).
 * ==========================================================================*/
(function () {
  function buildMessages(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo,
            rpcCall, db, supabase, Av, Skel, fmtRelative } = deps;

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-msg-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-msg-styles';
      st.textContent = `
      .msg-wrap{display:flex;flex:1;height:100%;min-height:0;background:var(--bg1)}
      .msg-list{width:340px;flex:0 0 340px;border-right:1px solid var(--bd2);display:flex;flex-direction:column;min-height:0;background:var(--surface)}
      .msg-thread{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0}
      .msg-info{width:290px;flex:0 0 290px;border-left:1px solid var(--bd2);background:var(--surface);overflow-y:auto}
      .msg-conv{display:flex;gap:11px;align-items:center;padding:11px 14px;cursor:pointer;border-bottom:1px solid var(--bd1);position:relative}
      .msg-conv:hover{background:var(--bg2)}
      .msg-conv.on{background:rgba(255,0,238,.07);box-shadow:inset 3px 0 0 #ff00ee}
      .msg-conv-name{font-size:14px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .msg-conv-prev{font-size:12.5px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
      .msg-unread{background:#ff00ee;color:#fff;font-size:11px;font-weight:700;min-width:19px;height:19px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 5px;flex-shrink:0}
      .msg-scroll{flex:1;overflow-y:auto;min-height:0}
      .msg-feed{flex:1;overflow-y:auto;min-height:0;padding:18px 22px;display:flex;flex-direction:column;gap:3px}
      .msg-row{display:flex;gap:10px;max-width:74%}
      .msg-row.me{align-self:flex-end;flex-direction:row-reverse}
      .msg-bubble{padding:9px 13px;border-radius:15px;font-size:13.5px;line-height:1.5;color:var(--t1);background:var(--bg2);word-break:break-word;white-space:pre-wrap}
      .msg-row.me .msg-bubble{background:linear-gradient(135deg,#ff2bf1,#c400bd);color:#fff}
      .msg-meta{font-size:10.5px;color:var(--t3);margin:2px 4px 0}
      .msg-day{align-self:center;font-size:11px;color:var(--t3);background:var(--bg2);border-radius:20px;padding:3px 12px;margin:10px 0}
      .msg-composer{border-top:1px solid var(--bd2);padding:12px 18px;background:var(--surface)}
      .msg-inbox-hd{padding:16px 16px 10px;display:flex;align-items:center;justify-content:space-between}
      .msg-search{margin:0 14px 10px;position:relative}
      .msg-search input{width:100%;box-sizing:border-box;padding:9px 12px 9px 34px;border:1px solid var(--bd2);border-radius:10px;background:var(--bg2);font-size:13px;color:var(--t1)}
      .msg-mention{color:#c400bd;font-weight:600}
      .msg-atwrap{position:absolute;bottom:56px;left:18px;right:18px;max-height:180px;overflow-y:auto;background:var(--surface);border:1px solid var(--bd2);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.16);z-index:20}
      .msg-atrow{display:flex;gap:9px;align-items:center;padding:8px 12px;cursor:pointer;font-size:13px}
      .msg-atrow:hover,.msg-atrow.on{background:rgba(255,0,238,.08)}
      .msg-ibtn{width:38px;height:38px;border-radius:10px;border:1px solid var(--bd2);background:var(--bg2);color:var(--t2);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
      .msg-ibtn:hover{color:#ff00ee;border-color:rgba(255,0,238,.4)}
      .msg-send{width:44px;height:44px;border-radius:12px;border:none;background:linear-gradient(135deg,#ff2bf1,#c400bd);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
      .msg-send:disabled{opacity:.45;cursor:not-allowed}
      .msg-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--t3);gap:10px;text-align:center;padding:40px}
      .msg-att{display:flex;gap:8px;align-items:center;background:var(--bg2);border:1px solid var(--bd2);border-radius:10px;padding:7px 11px;font-size:12.5px;color:var(--t1);max-width:230px}
      .msg-att img{max-width:220px;max-height:200px;border-radius:10px;display:block;cursor:pointer}
      .msg-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px}
      .msg-modal{background:var(--surface);border-radius:16px;width:100%;max-width:440px;max-height:82vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.3)}
      .msg-pick{display:flex;gap:11px;align-items:center;padding:10px 16px;cursor:pointer;font-size:14px}
      .msg-pick:hover{background:var(--bg2)}
      @media(max-width:900px){.msg-info{display:none}.msg-list{width:100%;flex-basis:100%}.msg-thread.hide-mobile{display:none}.msg-list.hide-mobile{display:none}.msg-thread{width:100%}}
      /* clear the fixed bottom-nav (shows ≤960px) so the composer / last chats aren't hidden behind it */
      @media(max-width:960px){.msg-wrap{box-sizing:border-box;padding-bottom:calc(60px + env(safe-area-inset-bottom, 0px))}}
      `;
      document.head.appendChild(st);
    }

    const BUCKET = 'chat-attachments';
    const uuid = () => (crypto && crypto.randomUUID ? crypto.randomUUID()
                        : String(Date.now()) + Math.round(performance.now()));
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const dayKey = (d) => new Date(d).toDateString();
    const fmtDay = (d) => {
      const dt = new Date(d), td = new Date();
      const y = new Date(td); y.setDate(td.getDate() - 1);
      if (dt.toDateString() === td.toDateString()) return 'Today';
      if (dt.toDateString() === y.toDateString()) return 'Yesterday';
      return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: dt.getFullYear() !== td.getFullYear() ? 'numeric' : undefined });
    };
    const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

    const otherMembers = (conv, meId) => (conv.members || []).filter(m => m.id !== meId);
    const convTitle = (conv, meId) => {
      if (conv.type === 'group') return conv.title || 'Group';
      const o = otherMembers(conv, meId)[0];
      return o ? o.name : 'Direct message';
    };

    // Render a message body, highlighting @mentions of known members.
    function renderBody(body, members) {
      if (!body) return null;
      if (!members || !members.length) return body;
      const names = members.map(m => m.name);
      const mentionSet = new Set(names.map(n => '@' + n));
      const re = new RegExp('(@(?:' + names.map(esc).sort((a, b) => b.length - a.length).join('|') + '))', 'g');
      const parts = body.split(re);   // capture group → mentions land as their own array items
      return parts.map((p, i) => mentionSet.has(p)
        ? h`<span key=${i} class="msg-mention">${p}</span>` : p);
    }

    // ---- Avatar for a conversation (DM = other person, group = stacked/icon) --
    function ConvAvatar({ conv, meId, size = 42 }) {
      if (conv.type === 'group') {
        return h`<div style=${{ width: size, height: size, borderRadius: '50%', background: 'rgba(255,0,238,.12)', color: '#c400bd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i class="ti ti-users" style=${{ fontSize: size * 0.42 }}></i></div>`;
      }
      const o = otherMembers(conv, meId)[0] || {};
      return h`<${Av} i=${o.initials} c=${o.color} s=${size}/>`;
    }

    // =========================================================================
    // useChatUnread — total unread for the sidebar nav badge (Chat closed).
    // =========================================================================
    function useChatUnread(currentUser) {
      const [total, setTotal] = useState(0);
      useEffect(() => {
        if (!currentUser) return;
        let alive = true;
        const refresh = async () => {
          try {
            const rows = await rpcCall('msg_conversations_list', {}, { silentAuth: true });
            if (!alive) return;
            const n = (Array.isArray(rows) ? rows : []).reduce((a, c) => a + (c.unread_count || 0), 0);
            setTotal(n);
          } catch (_) {/* fail quiet */ }
        };
        refresh();
        const poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 25000);
        const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('ams-chat-refresh', refresh);
        return () => { alive = false; clearInterval(poll); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('ams-chat-refresh', refresh); };
      }, [currentUser && currentUser.id]);
      return total;
    }

    // =========================================================================
    // useTeamChat — total unread + per-DM-member unread map, from ONE poll.
    // Drives the sidebar team rail (avatar badges) + the Chat nav badge.
    // =========================================================================
    function useTeamChat(currentUser) {
      const [state, setState] = useState({ total: 0, dmUnread: {} });
      useEffect(() => {
        if (!currentUser) return;
        let alive = true;
        const meId = currentUser.id;
        const refresh = async () => {
          try {
            const rows = await rpcCall('msg_conversations_list', {}, { silentAuth: true });
            if (!alive) return;
            const list = Array.isArray(rows) ? rows : [];
            let total = 0; const dm = {};
            list.forEach(c => {
              total += c.unread_count || 0;
              if (c.type === 'dm') {
                const other = (c.members || []).find(m => m.id !== meId);
                if (other) dm[other.id] = (dm[other.id] || 0) + (c.unread_count || 0);
              }
            });
            setState({ total, dmUnread: dm });
          } catch (_) {/* fail quiet */ }
        };
        refresh();
        const poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 25000);
        const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('ams-chat-refresh', refresh);
        return () => { alive = false; clearInterval(poll); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('ams-chat-refresh', refresh); };
      }, [currentUser && currentUser.id]);
      return state;
    }

    // =========================================================================
    // MessagesApp — the full chat surface
    // =========================================================================
    function MessagesApp({ currentUser }) {
      const meId = currentUser.id;
      const [convs, setConvs] = useState(null);      // null=loading
      const [selId, setSelId] = useState(null);
      const [msgs, setMsgs] = useState(null);
      const [staff, setStaff] = useState([]);
      const [q, setQ] = useState('');
      const [draft, setDraft] = useState('');
      const [sending, setSending] = useState(false);
      const [uploading, setUploading] = useState(false);
      const [showNew, setShowNew] = useState(false);
      const [showInfo, setShowInfo] = useState(false);
      const [at, setAt] = useState(null);            // mention picker state {q, idx}
      const feedRef = useRef(null);
      const fileRef = useRef(null);
      const taRef = useRef(null);
      const chanRef = useRef(null);

      const selConv = useMemo(() => (convs || []).find(c => c.id === selId) || null, [convs, selId]);

      // ---- load conversation list (+ poll) ----
      const loadConvs = useCallback(async (opts = {}) => {
        try {
          const rows = await rpcCall('msg_conversations_list', {}, { silentAuth: true });
          setConvs(Array.isArray(rows) ? rows : []);
        } catch (e) { if (opts.first) setConvs([]); }
      }, []);
      useEffect(() => {
        loadConvs({ first: true });
        const poll = setInterval(() => { if (document.visibilityState === 'visible') loadConvs(); }, 15000);
        // Deep-link from a bell notification (link_type='message', link_id=conv id)
        if (window.__amsPendingConv) { setSelId(window.__amsPendingConv); window.__amsPendingConv = null; }
        const onOpen = (e) => { const id = (e && e.detail) || window.__amsPendingConv; if (id) { setSelId(id); window.__amsPendingConv = null; } };
        window.addEventListener('ams-open-conv', onOpen);
        // Open (or start) a DM straight from the sidebar team rail — detail = member id
        const onOpenDm = async (e) => {
          const mid = (e && e.detail) || window.__amsPendingDm; window.__amsPendingDm = null;
          if (!mid) return;
          try { const res = await rpcCall('msg_start_dm', { p_other_member_id: mid }); await loadConvs(); if (res && res.id) setSelId(res.id); }
          catch (err) { alert('Could not open chat: ' + (err && err.message || 'error')); }
        };
        window.addEventListener('ams-open-dm', onOpenDm);
        if (window.__amsPendingDm) onOpenDm();
        return () => { clearInterval(poll); window.removeEventListener('ams-open-conv', onOpen); window.removeEventListener('ams-open-dm', onOpenDm); };
      }, [loadConvs]);

      // Staff directory for New chat / group members. team_members allows anon
      // reads (RLS unforced — auth bootstrap); same query loadStaffNames uses.
      const ensureStaff = useCallback(async () => {
        if (staff.length) return staff;
        try {
          const rows = await db('team_members', '&status=neq.revoked&role_level=neq.client&order=name.asc');
          if (Array.isArray(rows)) {
            const clean = rows.map(r => ({ id: r.id, name: r.name, initials: r.initials, color: r.color, role_level: r.role_level }));
            setStaff(clean); return clean;
          }
        } catch (_) { }
        // Fallback: derive from existing conversation members
        const seen = {}; const acc = [];
        (convs || []).forEach(c => (c.members || []).forEach(m => { if (m.id !== meId && !seen[m.id]) { seen[m.id] = 1; acc.push(m); } }));
        setStaff(acc); return acc;
      }, [staff, convs, meId]);

      // ---- open a conversation: load thread, mark read, subscribe realtime ----
      useEffect(() => {
        if (!selId) { setMsgs(null); return; }
        let alive = true;
        setMsgs(null);
        (async () => {
          try {
            const rows = await rpcCall('msg_thread', { p_conversation_id: selId, p_limit: 60 }, { silentAuth: true });
            if (alive) setMsgs(Array.isArray(rows) ? rows : []);
          } catch (e) { if (alive) setMsgs([]); }
          try { await rpcCall('msg_mark_read', { p_conversation_id: selId }); } catch (_) { }
          // clear local unread + tell the nav badge
          setConvs(cs => (cs || []).map(c => c.id === selId ? { ...c, unread_count: 0 } : c));
          window.dispatchEvent(new Event('ams-chat-refresh'));
        })();

        // realtime: broadcast channel keyed on the (private) conversation UUID
        const ch = supabase.channel('ams:conv:' + selId, { config: { broadcast: { self: false } } });
        ch.on('broadcast', { event: 'msg' }, (payload) => {
          const m = payload && payload.payload && payload.payload.message;
          if (!m || m.conversation_id !== selId) return;
          setMsgs(cur => {
            const arr = cur || [];
            if (arr.some(x => x.id === m.id)) return arr;
            return [...arr, m];
          });
          // keep sidebar preview fresh
          loadConvs();
          rpcCall('msg_mark_read', { p_conversation_id: selId }).catch(() => { });
        });
        ch.subscribe();
        chanRef.current = ch;
        return () => { alive = false; try { supabase.removeChannel(ch); } catch (_) { } chanRef.current = null; };
      }, [selId, loadConvs]);

      // autoscroll on new messages
      useEffect(() => {
        if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
      }, [msgs && msgs.length, selId]);

      // ---- send ----
      const doSend = useCallback(async (attachments = []) => {
        const body = draft.trim();
        if ((!body && !attachments.length) || sending) return;
        setSending(true);
        const mentions = selConv && selConv.type === 'group'
          ? (selConv.members || []).filter(m => m.id !== meId && new RegExp('@' + esc(m.name) + '\\b').test(body)).map(m => m.id)
          : [];
        const type = attachments.length ? (attachments.every(a => a.kind === 'image') ? 'image' : 'file') : 'text';
        try {
          const res = await rpcCall('msg_send', {
            p_conversation_id: selId, p_body: body || null, p_type: type,
            p_mentions: mentions, p_attachments: attachments
          });
          const m = res && res.message;
          if (m) {
            setMsgs(cur => [...(cur || []), m]);
            setDraft(''); setAt(null);
            // broadcast to other open threads
            if (chanRef.current) { try { chanRef.current.send({ type: 'broadcast', event: 'msg', payload: { message: m } }); } catch (_) { } }
            loadConvs();
          }
        } catch (e) { alert('Could not send: ' + (e && e.message || 'error')); }
        setSending(false);
      }, [draft, sending, selId, selConv, meId, loadConvs]);

      // ---- attach files ----
      const onPickFiles = useCallback(async (files) => {
        if (!files || !files.length || !selId) return;
        setUploading(true);
        const out = [];
        for (const f of files) {
          try {
            const path = selId + '/' + uuid() + '-' + f.name.replace(/[^\w.\-]+/g, '_');
            const { error } = await supabase.storage.from(BUCKET).upload(path, f, { cacheControl: '31536000', upsert: false, contentType: f.type || undefined });
            if (error) { console.warn('[chat] upload failed', error); continue; }
            const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
            out.push({ path, url: pub.publicUrl, name: f.name, mime: f.type || '', size: f.size, kind: /^image\//.test(f.type) ? 'image' : 'file' });
          } catch (e) { console.warn('[chat] upload error', e); }
        }
        setUploading(false);
        if (out.length) doSend(out);
      }, [selId, doSend]);

      // ---- @mention picker driving ----
      const onDraft = (v) => {
        setDraft(v);
        if (selConv && selConv.type === 'group') {
          const m = /(^|\s)@(\w*)$/.exec(v);
          if (m) { setAt({ q: m[2].toLowerCase(), idx: 0 }); return; }
        }
        setAt(null);
      };
      const mentionList = useMemo(() => {
        if (!at || !selConv) return [];
        return otherMembers(selConv, meId).filter(m => m.name.toLowerCase().includes(at.q)).slice(0, 6);
      }, [at, selConv, meId]);
      const pickMention = (m) => {
        setDraft(d => d.replace(/(^|\s)@(\w*)$/, (s, pre) => pre + '@' + m.name + ' '));
        setAt(null);
        if (taRef.current) taRef.current.focus();
      };

      // ---- start a DM / create a group ----
      const startDm = async (member) => {
        try {
          const res = await rpcCall('msg_start_dm', { p_other_member_id: member.id });
          setShowNew(false);
          await loadConvs();
          if (res && res.id) setSelId(res.id);
        } catch (e) { alert('Could not start chat: ' + (e && e.message || 'error')); }
      };
      const createGroup = async (title, memberIds) => {
        try {
          const res = await rpcCall('msg_create_group', { p_title: title, p_member_ids: memberIds });
          setShowNew(false);
          await loadConvs();
          if (res && res.id) setSelId(res.id);
        } catch (e) { alert('Could not create group: ' + (e && e.message || 'error')); }
      };

      const filtered = useMemo(() => {
        const list = convs || [];
        if (!q.trim()) return list;
        const s = q.toLowerCase();
        return list.filter(c => convTitle(c, meId).toLowerCase().includes(s)
          || (c.last_message_preview || '').toLowerCase().includes(s)
          || (c.members || []).some(m => m.name.toLowerCase().includes(s)));
      }, [convs, q, meId]);

      // ---------------------------------------------------------------- render
      return h`<div class="msg-wrap">
        ${/* LEFT: conversation list */''}
        <div class=${'msg-list' + (selId ? ' hide-mobile' : '')}>
          <div class="msg-inbox-hd">
            <div style=${{ fontSize: 19, fontWeight: 700, color: 'var(--t1)' }}>Chat</div>
            <button class="msg-ibtn" title="New chat" onClick=${async () => { await ensureStaff(); setShowNew(true); }}><i class="ti ti-plus"></i></button>
          </div>
          <div class="msg-search">
            <i class="ti ti-search" style=${{ position: 'absolute', left: 11, top: 10, color: 'var(--t3)', fontSize: 15 }}></i>
            <input placeholder="Search chats and people" value=${q} onInput=${e => setQ(e.target.value)}/>
          </div>
          <div class="msg-scroll">
            ${convs === null ? h`<div style=${{ padding: 16 }}>${[0, 1, 2, 3].map(i => h`<div key=${i} style=${{ marginBottom: 12 }}><${Skel} h=${44}/></div>`)}</div>`
          : filtered.length === 0 ? h`<div style=${{ padding: '30px 20px', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>${q ? 'No matches.' : 'No conversations yet. Tap + to start one.'}</div>`
            : filtered.map(c => h`<div key=${c.id} class=${'msg-conv' + (c.id === selId ? ' on' : '')} onClick=${() => { setSelId(c.id); setShowInfo(false); }}>
                <${ConvAvatar} conv=${c} meId=${meId} size=${42}/>
                <div style=${{ flex: 1, minWidth: 0 }}>
                  <div style=${{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div class="msg-conv-name">${convTitle(c, meId)}</div>
                    <div style=${{ fontSize: 11, color: 'var(--t3)', flexShrink: 0 }}>${c.last_message_at ? fmtRelative(c.last_message_at) : ''}</div>
                  </div>
                  <div style=${{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div class="msg-conv-prev">${c.last_message_preview || (c.type === 'group' ? 'Group created' : 'Say hi 👋')}</div>
                    ${c.unread_count > 0 && h`<span class="msg-unread">${c.unread_count > 99 ? '99+' : c.unread_count}</span>`}
                  </div>
                </div>
              </div>`)}
          </div>
        </div>

        ${/* CENTER: thread */''}
        <div class=${'msg-thread' + (selId ? '' : ' hide-mobile')}>
          ${!selConv ? h`<div class="msg-empty">
              <i class="ti ti-message-2" style=${{ fontSize: 46, opacity: .4 }}></i>
              <div style=${{ fontSize: 15, fontWeight: 600, color: 'var(--t2)' }}>Your messages</div>
              <div style=${{ fontSize: 13 }}>Pick a conversation or start a new one.</div>
            </div>`
          : h`<${React.Fragment}>
            <div style=${{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--bd2)', background: 'var(--surface)' }}>
              <button class="msg-ibtn" style=${{ display: window.matchMedia('(max-width:900px)').matches ? 'flex' : 'none', width: 32, height: 32 }} onClick=${() => setSelId(null)}><i class="ti ti-arrow-left"></i></button>
              <${ConvAvatar} conv=${selConv} meId=${meId} size=${38}/>
              <div style=${{ flex: 1, minWidth: 0 }}>
                <div style=${{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>${convTitle(selConv, meId)}</div>
                <div style=${{ fontSize: 11.5, color: 'var(--t3)' }}>${selConv.type === 'group' ? (selConv.members || []).length + ' members' : (otherMembers(selConv, meId)[0] || {}).role_level || ''}</div>
              </div>
              <button class="msg-ibtn" title="Conversation info" onClick=${() => setShowInfo(s => !s)}><i class="ti ti-info-circle"></i></button>
            </div>

            <div class="msg-feed" ref=${feedRef}>
              ${msgs === null ? h`<div style=${{ margin: 'auto', color: 'var(--t3)' }}><i class="ti ti-loader-2 spinner"></i></div>`
              : msgs.length === 0 ? h`<div class="msg-empty"><i class="ti ti-messages" style=${{ fontSize: 38, opacity: .4 }}></i><div style=${{ fontSize: 13 }}>No messages yet — say hello.</div></div>`
                : msgs.map((m, i) => {
                  const mine = m.sender_id === meId;
                  const prev = msgs[i - 1];
                  const showDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                  const showHead = selConv.type === 'group' && !mine && (!prev || prev.sender_id !== m.sender_id || showDay);
                  return h`<${React.Fragment} key=${m.id}>
                    ${showDay && h`<div class="msg-day">${fmtDay(m.created_at)}</div>`}
                    <div class=${'msg-row' + (mine ? ' me' : '')} style=${{ marginTop: showHead ? 8 : 2 }}>
                      ${!mine && selConv.type === 'group' && h`<${Av} i=${m.sender_initials} c=${m.sender_color} s=${28}/>`}
                      <div>
                        ${showHead && h`<div style=${{ fontSize: 11.5, fontWeight: 600, color: 'var(--t2)', margin: '0 4px 3px' }}>${m.sender_name}</div>`}
                        ${m.deleted_at ? h`<div class="msg-bubble" style=${{ fontStyle: 'italic', opacity: .6 }}>Message deleted</div>`
                        : h`<div>
                            ${(m.attachments || []).map((a, k) => h`<div key=${k} style=${{ marginBottom: 4 }}>
                              ${a.kind === 'image'
                                ? h`<img src=${a.url} alt=${a.name} class="msg-att" style=${{ padding: 0, border: 'none' }} onClick=${() => window.open(a.url, '_blank')}/>`
                                : h`<a href=${a.url} target="_blank" class="msg-att" style=${{ textDecoration: 'none' }}><i class="ti ti-paperclip" style=${{ color: '#c400bd' }}></i><span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${a.name}</span></a>`}
                            </div>`)}
                            ${m.body && h`<div class="msg-bubble">${renderBody(m.body, selConv.members)}</div>`}
                          </div>`}
                        <div class="msg-meta" style=${{ textAlign: mine ? 'right' : 'left' }}>${fmtTime(m.created_at)}${m.edited_at ? ' · edited' : ''}</div>
                      </div>
                    </div>
                  <//>`;
                })}
            </div>

            <div class="msg-composer" style=${{ position: 'relative' }}>
              ${at && mentionList.length > 0 && h`<div class="msg-atwrap">
                ${mentionList.map((m, i) => h`<div key=${m.id} class=${'msg-atrow' + (i === at.idx ? ' on' : '')} onMouseDown=${e => { e.preventDefault(); pickMention(m); }}>
                  <${Av} i=${m.initials} c=${m.color} s=${26}/><span>${m.name}</span>
                </div>`)}
              </div>`}
              <div style=${{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <input ref=${fileRef} type="file" multiple style=${{ display: 'none' }} onChange=${e => { onPickFiles(Array.from(e.target.files || [])); e.target.value = ''; }}/>
                <button class="msg-ibtn" title="Attach" disabled=${uploading} onClick=${() => fileRef.current && fileRef.current.click()}><i class=${'ti ' + (uploading ? 'ti-loader-2 spinner' : 'ti-paperclip')}></i></button>
                <textarea ref=${taRef} rows=${1} value=${draft}
                  placeholder=${'Type your message…'}
                  onInput=${e => { onDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                  onKeyDown=${e => {
                    if (at && mentionList.length) {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setAt(a => ({ ...a, idx: Math.min(a.idx + 1, mentionList.length - 1) })); return; }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setAt(a => ({ ...a, idx: Math.max(a.idx - 1, 0) })); return; }
                      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionList[at.idx]); return; }
                      if (e.key === 'Escape') { setAt(null); return; }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
                  }}
                  style=${{ flex: 1, resize: 'none', border: '1px solid var(--bd2)', borderRadius: 12, padding: '11px 14px', fontSize: 14, fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--t1)', maxHeight: 120, lineHeight: 1.4 }}/>
                <button class="msg-send" disabled=${sending || (!draft.trim())} onClick=${() => doSend()}>
                  <i class=${'ti ' + (sending ? 'ti-loader-2 spinner' : 'ti-send')}></i>
                </button>
              </div>
            </div>
          <//>`}
        </div>

        ${/* RIGHT: info panel */''}
        ${selConv && showInfo && h`<${InfoPanel} conv=${selConv} meId=${meId} staff=${staff} ensureStaff=${ensureStaff}
            onChanged=${loadConvs} onClose=${() => setShowInfo(false)}
            onLeft=${() => { setShowInfo(false); setSelId(null); loadConvs(); }}/>`}

        ${showNew && h`<${NewChatModal} staff=${staff} meId=${meId} onDm=${startDm} onGroup=${createGroup} onClose=${() => setShowNew(false)}/>`}
      </div>`;
    }

    // =========================================================================
    // InfoPanel — members, add/remove (creator), rename, mute, leave
    // =========================================================================
    function InfoPanel({ conv, meId, staff, ensureStaff, onChanged, onClose, onLeft }) {
      const [busy, setBusy] = useState(false);
      const [adding, setAdding] = useState(false);
      const [editTitle, setEditTitle] = useState(false);
      const [title, setTitle] = useState(conv.title || '');
      const isCreator = conv.is_creator;
      const isGroup = conv.type === 'group';

      const call = async (name, args, msg) => {
        setBusy(true);
        try { await rpcCall(name, args); await onChanged(); }
        catch (e) { alert((msg || 'Action failed') + ': ' + (e && e.message || 'error')); }
        setBusy(false);
      };
      const memberIds = (conv.members || []).map(m => m.id);
      const addable = (staff || []).filter(m => m.id !== meId && !memberIds.includes(m.id));

      return h`<div class="msg-info">
        <div style=${{ padding: '16px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style=${{ fontSize: 14, fontWeight: 700 }}>${isGroup ? 'Group info' : 'Contact'}</div>
          <button class="msg-ibtn" style=${{ width: 30, height: 30 }} onClick=${onClose}><i class="ti ti-x"></i></button>
        </div>
        <div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 16px 16px', gap: 8 }}>
          <${ConvAvatar} conv=${conv} meId=${meId} size=${72}/>
          ${isGroup && editTitle
            ? h`<div style=${{ display: 'flex', gap: 6, width: '100%' }}>
                <input value=${title} onInput=${e => setTitle(e.target.value)} style=${{ flex: 1, padding: '7px 10px', border: '1px solid var(--bd2)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--t1)', fontSize: 14 }}/>
                <button class="msg-ibtn" style=${{ width: 34, height: 34 }} onClick=${async () => { await call('msg_rename', { p_conversation_id: conv.id, p_title: title }, 'Rename failed'); setEditTitle(false); }}><i class="ti ti-check"></i></button>
              </div>`
            : h`<div style=${{ fontSize: 17, fontWeight: 700, textAlign: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
                ${convTitle(conv, meId)}
                ${isGroup && isCreator && h`<i class="ti ti-pencil" style=${{ fontSize: 14, color: 'var(--t3)', cursor: 'pointer' }} onClick=${() => setEditTitle(true)}></i>`}
              </div>`}
        </div>

        <div style=${{ padding: '0 16px 8px', fontSize: 11.5, fontWeight: 700, color: 'var(--t3)', letterSpacing: '.04em', display: 'flex', justifyContent: 'space-between' }}>
          <span>MEMBERS · ${(conv.members || []).length}</span>
          ${isGroup && isCreator && h`<span style=${{ color: '#c400bd', cursor: 'pointer' }} onClick=${async () => { await ensureStaff(); setAdding(a => !a); }}>${adding ? 'Done' : '+ Add'}</span>`}
        </div>
        ${adding && addable.length > 0 && h`<div style=${{ maxHeight: 160, overflowY: 'auto', margin: '0 8px 8px', border: '1px solid var(--bd2)', borderRadius: 10 }}>
          ${addable.map(m => h`<div key=${m.id} class="msg-pick" style=${{ padding: '8px 12px', fontSize: 13 }} onClick=${() => call('msg_add_members', { p_conversation_id: conv.id, p_member_ids: [m.id] }, 'Add failed')}>
            <${Av} i=${m.initials} c=${m.color} s=${28}/><span>${m.name}</span><i class="ti ti-plus" style=${{ marginLeft: 'auto', color: '#c400bd' }}></i>
          </div>`)}
        </div>`}
        ${(conv.members || []).map(m => h`<div key=${m.id} style=${{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px' }}>
          <${Av} i=${m.initials} c=${m.color} s=${34}/>
          <div style=${{ flex: 1, minWidth: 0 }}>
            <div style=${{ fontSize: 13.5, fontWeight: 600 }}>${m.name}${m.id === meId ? ' (you)' : ''}${m.id === conv.created_by ? '' : ''}</div>
            <div style=${{ fontSize: 11, color: 'var(--t3)' }}>${m.id === conv.created_by ? 'Creator' : (m.role_level || '')}</div>
          </div>
          ${isGroup && isCreator && m.id !== meId && m.id !== conv.created_by && h`<button class="msg-ibtn" style=${{ width: 28, height: 28, borderColor: 'transparent' }} title="Remove" disabled=${busy} onClick=${() => call('msg_remove_member', { p_conversation_id: conv.id, p_member_id: m.id }, 'Remove failed')}><i class="ti ti-user-minus" style=${{ fontSize: 14, color: '#DC2626' }}></i></button>`}
        </div>`)}

        ${isGroup && !isCreator && h`<div style=${{ padding: 16 }}>
          <button class="btn-sec" style=${{ width: '100%', color: '#DC2626', borderColor: '#FEE2E2' }} disabled=${busy}
            onClick=${async () => { if (confirm('Leave this group?')) { setBusy(true); try { await rpcCall('msg_leave', { p_conversation_id: conv.id }); onLeft(); } catch (e) { alert('Could not leave: ' + (e && e.message)); setBusy(false); } } }}>
            <i class="ti ti-logout"></i> Leave group</button>
        </div>`}
      </div>`;
    }

    // =========================================================================
    // NewChatModal — pick a person (DM) or build a group
    // =========================================================================
    function NewChatModal({ staff, meId, onDm, onGroup, onClose }) {
      const [mode, setMode] = useState('dm');   // 'dm' | 'group'
      const [q, setQ] = useState('');
      const [sel, setSel] = useState({});        // group selections
      const [title, setTitle] = useState('');
      const people = (staff || []).filter(m => m.id !== meId
        && (!q.trim() || m.name.toLowerCase().includes(q.toLowerCase())));
      const selIds = Object.keys(sel).filter(k => sel[k]);

      return h`<div class="msg-modal-bg" onClick=${onClose}>
        <div class="msg-modal" onClick=${e => e.stopPropagation()}>
          <div style=${{ padding: '16px 18px', borderBottom: '1px solid var(--bd2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style=${{ fontSize: 16, fontWeight: 700 }}>New ${mode === 'group' ? 'group' : 'chat'}</div>
            <div style=${{ display: 'flex', gap: 6 }}>
              <button class="btn-sec" style=${{ padding: '5px 11px', fontSize: 12, ...(mode === 'dm' ? { borderColor: '#ff00ee', color: '#c400bd' } : {}) }} onClick=${() => setMode('dm')}>Direct</button>
              <button class="btn-sec" style=${{ padding: '5px 11px', fontSize: 12, ...(mode === 'group' ? { borderColor: '#ff00ee', color: '#c400bd' } : {}) }} onClick=${() => setMode('group')}>Group</button>
            </div>
          </div>
          ${mode === 'group' && h`<div style=${{ padding: '12px 18px 0' }}>
            <input placeholder="Group name" value=${title} onInput=${e => setTitle(e.target.value)} style=${{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--bd2)', borderRadius: 10, background: 'var(--bg2)', color: 'var(--t1)', fontSize: 14 }}/>
          </div>`}
          <div style=${{ padding: '12px 18px 0' }}>
            <input placeholder="Search people" value=${q} onInput=${e => setQ(e.target.value)} style=${{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid var(--bd2)', borderRadius: 10, background: 'var(--bg2)', color: 'var(--t1)', fontSize: 13 }}/>
          </div>
          <div style=${{ overflowY: 'auto', padding: '8px 0', flex: 1 }}>
            ${people.length === 0 ? h`<div style=${{ padding: 20, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No teammates found.</div>`
            : people.map(m => h`<div key=${m.id} class="msg-pick" onClick=${() => mode === 'dm' ? onDm(m) : setSel(s => ({ ...s, [m.id]: !s[m.id] }))}>
                <${Av} i=${m.initials} c=${m.color} s=${34}/>
                <div style=${{ flex: 1 }}><div style=${{ fontWeight: 600, fontSize: 14 }}>${m.name}</div><div style=${{ fontSize: 11.5, color: 'var(--t3)' }}>${m.role_level || ''}</div></div>
                ${mode === 'group' && h`<div style=${{ width: 20, height: 20, borderRadius: 6, border: '2px solid ' + (sel[m.id] ? '#ff00ee' : 'var(--bd2)'), background: sel[m.id] ? '#ff00ee' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>${sel[m.id] && h`<i class="ti ti-check" style=${{ fontSize: 13, color: '#fff' }}></i>`}</div>`}
              </div>`)}
          </div>
          ${mode === 'group' && h`<div style=${{ padding: 14, borderTop: '1px solid var(--bd2)' }}>
            <button class="btn-pri" style=${{ width: '100%' }} disabled=${!title.trim() || selIds.length === 0}
              onClick=${() => onGroup(title.trim(), selIds)}>Create group${selIds.length ? ' · ' + selIds.length : ''}</button>
          </div>`}
        </div>
      </div>`;
    }

    return { MessagesApp, useChatUnread, useTeamChat };
  }

  window.AMS_MESSAGES = { buildMessages };
})();

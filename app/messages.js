/* ============================================================================
 * messages.js — internal team chat (staff-to-staff)
 *
 * v1 (080): DMs + ad-hoc groups.
 * v2 (101): channels (one per client, auto-created + kept in sync server-side;
 *           public agency channels like #general), a channel browser with
 *           join/leave, threads with a thread pane and reply counts, emoji
 *           reactions, create-task-from-message with a backlink chip, presence
 *           dots, pinned announcement posts, per-conversation drafts, edit /
 *           delete own, @mentions, composerTools, link previews, per-channel
 *           unread and message search.
 *
 *   window.AMS_MESSAGES.buildMessages(deps) → { MessagesApp, useChatUnread, useTeamChat }
 *
 * Optional deps (fail soft when the integrator doesn't pass them):
 *   openTask(id)       — else a window `ams-open-task` CustomEvent is dispatched.
 *   CreateTaskModal    — tasks.js dialog, rendered here so create-from-message is
 *                        prefilled; without it we fall back to the server-side
 *                        `msg_task_create` quick dialog.
 *   LinkPreview({url}) — workstream O's card; without it we render our own using
 *                        the `link-preview` edge function (silent when absent).
 *
 * Delivery model (see migrations/080 + 101 headers):
 *   • Open conversation → INSTANT via a Supabase Broadcast channel keyed on the
 *     conversation UUID (only members ever learn that UUID, so no leak).
 *     Events: `msg` (new top-level), `reply` (thread reply + updated root),
 *     `msg_update` (edit / delete / reaction / pin / task link).
 *   • Sidebar unread / new conversations → a visible-tab poll (source of truth).
 *   • Push + bell when the app is closed → msg_send inserts notifications rows
 *     server-side (079 trigger → send-push). No new edge function.
 *
 * EVERYTHING degrades to v1 behaviour when migration 101 isn't applied yet:
 * `caps.v2` is probed once and v2-only affordances stay hidden until it's true.
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

      /* ---- v2: channel list ---- */
      .msg-sec{display:flex;align-items:center;gap:6px;padding:11px 14px 5px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--t3);cursor:pointer;user-select:none;background:none;border:none;width:100%;box-sizing:border-box}
      .msg-sec .chev{transition:transform .15s}
      .msg-sec.closed .chev{transform:rotate(-90deg)}
      .msg-sec-add{margin-left:auto;color:var(--t3);border:none;background:none;cursor:pointer;display:flex;padding:2px;border-radius:5px}
      .msg-sec-add:hover{color:#ff00ee;background:var(--bg2)}
      .msg-chan{display:flex;align-items:center;gap:9px;padding:6px 14px;cursor:pointer;font-size:13.5px;color:var(--t2);border:none;background:none;width:100%;box-sizing:border-box;text-align:left}
      .msg-chan:hover{background:var(--bg2)}
      .msg-chan.on{background:rgba(255,0,238,.07);box-shadow:inset 3px 0 0 #ff00ee;color:var(--t1)}
      .msg-chan.unread{color:var(--t1);font-weight:700}
      .msg-chan .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .msg-chan-av{border-radius:9px;background:rgba(255,0,238,.12);color:#c400bd;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      .msg-mentb{background:#ff00ee;color:#fff;font-size:10.5px;font-weight:700;border-radius:9px;padding:1px 6px;flex-shrink:0}

      /* ---- v2: presence ---- */
      .msg-dotw{position:relative;display:inline-flex;flex-shrink:0}
      .msg-dot{position:absolute;right:-1px;bottom:-1px;border-radius:50%;border:2px solid var(--surface);background:#9aa0a6}
      .msg-dot.on{background:#30a46c}
      .msg-dot.dnd{background:#e5484d}

      /* ---- v2: message affordances ---- */
      .msg-row{position:relative}
      .msg-acts{position:absolute;top:-13px;right:0;display:none;gap:2px;background:var(--surface);border:1px solid var(--bd2);border-radius:9px;padding:2px;box-shadow:0 4px 14px rgba(0,0,0,.14);z-index:6}
      .msg-row.me .msg-acts{right:auto;left:0}
      .msg-row:hover .msg-acts,.msg-row.act .msg-acts{display:flex}
      .msg-act{width:26px;height:26px;border:none;background:none;color:var(--t2);border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px}
      .msg-act:hover{background:var(--bg2);color:#ff00ee}
      .msg-rx{display:flex;flex-wrap:wrap;gap:4px;margin:3px 2px 0}
      .msg-rxc{border:1px solid var(--bd2);background:var(--bg2);border-radius:20px;padding:1px 8px;font-size:12px;cursor:pointer;color:var(--t1)}
      .msg-rxc.on{border-color:#ff00ee;background:rgba(255,0,238,.12);color:#c400bd}
      .msg-emoji{position:absolute;z-index:40;top:16px;right:0;background:var(--surface);border:1px solid var(--bd2);border-radius:12px;padding:8px;display:grid;grid-template-columns:repeat(8,30px);gap:2px;box-shadow:0 10px 30px rgba(0,0,0,.2)}
      .msg-row.me .msg-emoji{right:auto;left:0}
      .msg-emoji button{width:30px;height:30px;border:none;background:none;font-size:17px;cursor:pointer;border-radius:7px}
      .msg-emoji button:hover{background:var(--bg2)}
      .msg-thsum{display:inline-flex;align-items:center;gap:6px;margin:4px 2px 0;background:none;border:none;padding:2px 5px;border-radius:7px;cursor:pointer;color:#c400bd;font-size:12.5px;font-weight:600}
      .msg-thsum:hover{background:rgba(255,0,238,.08)}
      .msg-thsum-t{color:var(--t3);font-weight:500}
      .msg-taskchip{display:inline-flex;align-items:center;gap:6px;margin:4px 2px 0;padding:4px 9px;border:1px solid var(--bd2);border-radius:9px;background:var(--bg2);font-size:12px;color:var(--t1);cursor:pointer;max-width:100%}
      .msg-taskchip:hover{border-color:rgba(255,0,238,.5)}
      .msg-taskchip:disabled{cursor:default;opacity:.7}
      .msg-tc-id{color:var(--t3);font-weight:600;flex-shrink:0}
      .msg-tc-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .msg-tc-s{border-radius:5px;padding:1px 6px;font-size:10.5px;font-weight:700;text-transform:uppercase;flex-shrink:0}
      .msg-post{align-self:stretch;max-width:100%;border:1px solid var(--bd2);border-left:3px solid #ff00ee;border-radius:12px;background:var(--surface);padding:13px 15px;margin:8px 0;position:relative}
      .msg-post-tag{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#c400bd}
      .msg-post-t{margin:4px 0 6px;font-size:15px;font-weight:700;color:var(--t1)}
      .msg-link{color:#c400bd;text-decoration:underline;word-break:break-word}
      .msg-row.me .msg-bubble .msg-link{color:#fff}
      .msg-lp{display:flex;gap:10px;margin:5px 2px 0;border:1px solid var(--bd2);border-radius:10px;overflow:hidden;background:var(--bg2);text-decoration:none;max-width:330px}
      .msg-lp img{width:74px;height:74px;object-fit:cover;flex-shrink:0}
      .msg-lp-b{padding:8px 10px;min-width:0}
      .msg-lp-t{font-size:13px;font-weight:600;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .msg-lp-d{font-size:11.5px;color:var(--t2);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
      .msg-lp-s{font-size:10.5px;color:var(--t3);margin-top:3px}
      .msg-flash{animation:msgflash 2.1s ease-out;border-radius:12px}
      @keyframes msgflash{0%,55%{background:rgba(255,0,238,.16)}100%{background:transparent}}

      /* ---- v2: thread pane, banners, pins, search ---- */
      .msg-tpane{width:368px;flex:0 0 368px;border-left:1px solid var(--bd2);background:var(--surface);display:flex;flex-direction:column;min-height:0}
      .msg-tpane-hd{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--bd2);flex-shrink:0}
      .msg-tpane-div{display:flex;align-items:center;gap:9px;padding:6px 18px;font-size:11.5px;color:var(--t3);font-weight:600}
      .msg-tpane-div:before,.msg-tpane-div:after{content:"";flex:1;height:1px;background:var(--bd1)}
      .msg-banner{padding:11px 16px;border-top:1px solid var(--bd2);background:var(--bg2);display:flex;align-items:center;gap:10px;font-size:13px;color:var(--t2);flex-wrap:wrap}
      .msg-chip{display:inline-flex;align-items:center;gap:6px;background:var(--bg2);border:1px solid var(--bd2);border-radius:8px;padding:4px 8px;font-size:12px;color:var(--t1);max-width:210px}
      .msg-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .msg-chip button{border:none;background:none;color:var(--t3);cursor:pointer;display:flex;padding:0}
      .msg-pins{position:absolute;top:54px;right:14px;width:330px;max-height:340px;overflow-y:auto;background:var(--surface);border:1px solid var(--bd2);border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.2);z-index:45}
      .msg-pinrow{padding:10px 13px;border-bottom:1px solid var(--bd1);font-size:12.5px;color:var(--t1);display:flex;gap:8px;align-items:flex-start}
      .msg-tabs{display:flex;gap:6px;padding:0 14px 9px;flex-wrap:wrap}
      .msg-tab{padding:5px 11px;border-radius:8px;border:1px solid var(--bd2);background:var(--bg2);font-size:12px;color:var(--t2);cursor:pointer}
      .msg-tab.on{border-color:#ff00ee;color:#c400bd;background:rgba(255,0,238,.08)}
      .msg-srow{padding:10px 14px;border-bottom:1px solid var(--bd1);cursor:pointer}
      .msg-srow:hover{background:var(--bg2)}
      .msg-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:84px;background:#1f1f23;color:#fff;padding:9px 16px;border-radius:20px;font-size:13px;z-index:400;box-shadow:0 10px 30px rgba(0,0,0,.28)}
      .msg-browse-row{display:flex;gap:11px;align-items:center;padding:11px 16px;border-bottom:1px solid var(--bd1)}
      .msg-ghost{border:1px solid var(--bd2);background:var(--bg2);color:var(--t1);border-radius:8px;padding:5px 12px;font-size:12.5px;font-weight:600;cursor:pointer;flex-shrink:0}
      .msg-ghost:hover{border-color:rgba(255,0,238,.5);color:#c400bd}

      @media(max-width:900px){.msg-info{display:none}.msg-list{width:100%;flex-basis:100%}.msg-thread.hide-mobile{display:none}.msg-list.hide-mobile{display:none}.msg-thread{width:100%}
        .msg-info.msg-pane-on{display:flex;flex-direction:column;width:100%;flex-basis:100%;border-left:none}
        .msg-tpane{width:100%;flex-basis:100%;border-left:none}
        .msg-pane-hide{display:none!important}
        .msg-pins{right:8px;left:8px;width:auto}}
      /* clear the fixed bottom-nav (shows ≤960px) so the composer / last chats aren't hidden behind it */
      @media(max-width:960px){.msg-wrap{box-sizing:border-box;padding-bottom:calc(60px + env(safe-area-inset-bottom, 0px))}}
      @media(prefers-reduced-motion:reduce){.msg-flash{animation:none}.msg-sec .chev{transition:none}}
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
      if (!conv) return '';
      if (conv.type === 'channel') return conv.title || conv.slug || 'Channel';
      if (conv.type === 'group') return conv.title || 'Group';
      const o = otherMembers(conv, meId)[0];
      return o ? o.name : 'Direct message';
    };
    // "#design" / "Kora Foods" / a person's name — used in notifications + task descriptions.
    const convLabel = (conv, meId) => (conv && conv.type === 'channel' ? '#' + convTitle(conv, meId) : convTitle(conv, meId));

    // =========================================================================
    // v2 capability probing — the frontend ships BEFORE migration 101 is applied,
    // so every v2-only affordance stays hidden until we know the RPCs exist.
    // =========================================================================
    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i
      .test(String(((e && e.code) || '') + ' ' + ((e && (e.message || e.details)) || '')));
    const caps = { v2: null, presence: true, preview: true };   // null = not probed yet

    const ERR_TEXT = {
      'archived': 'This channel is archived.',
      'auth.forbidden': 'You don’t have access to do that.',
      'forbidden': 'You don’t have access to do that.',
      'empty_message': 'Write something first.',
      'bad_title': 'Give it a name first.',
      'bad_type': 'That kind of message isn’t allowed here.',
      'bad_post': 'Announcements only work in channels.',
      'bad_parent': 'That thread is no longer available.',
      'bad_task': 'That task isn’t available.',
      'bad_client': 'That client isn’t available.',
      'bad_conversation': 'That conversation is no longer available.',
      'channel_exists': 'A channel with that name already exists.',
      'cannot_leave_general': 'Everyone stays in #general.',
      'cannot_remove_general': 'Everyone stays in #general.',
      'cannot_remove_creator': 'The creator can’t be removed.',
      'creator_cannot_leave': 'Delete the group instead of leaving it.',
      'general_is_public': '#general is always public.',
      'cannot_archive_general': '#general can’t be archived.',
      'already_linked': 'This message is already linked to a task.',
      'too_many_reactions': 'Too many different reactions on this message.',
      'not_found': 'That message is no longer available.'
    };
    const errText = (e) => {
      const raw = String((e && (e.code || e.message)) || '');
      for (const k of Object.keys(ERR_TEXT)) if (raw.indexOf(k) >= 0) return ERR_TEXT[k];
      if (isMissingRpc(e)) return 'That needs the latest update — try again after the next deploy.';
      return (e && e.message) || 'Something went wrong';
    };

    // ---- per-conversation drafts (home.js Drafts page reads ams_draft_msg_<id>) ----
    const draftKey = (id) => 'ams_draft_msg_' + id;
    const readDraft = (id) => { try { return (id && localStorage.getItem(draftKey(id))) || ''; } catch (_) { return ''; } };
    const writeDraft = (id, v) => {
      try {
        if (!id) return;
        if (v && v.trim()) localStorage.setItem(draftKey(id), v);
        else localStorage.removeItem(draftKey(id));
      } catch (_) { }
    };

    // ---- presence (094 presence_list) — shared poll, fails open when absent ----
    const presence = { map: {}, subs: new Set(), timer: null, last: 0 };
    async function presenceRefresh() {
      if (caps.presence === false) return;
      try {
        const rows = await rpcCall('presence_list', {}, { silentAuth: true });
        const m = {};
        (Array.isArray(rows) ? rows : []).forEach(r => { if (r && r.member_id) m[r.member_id] = r; });
        presence.map = m; presence.last = Date.now();
      } catch (e) {
        if (isMissingRpc(e)) caps.presence = false;
        return;
      }
      presence.subs.forEach(fn => { try { fn(); } catch (_) { } });
    }
    function usePresence() {
      const [, bump] = useState(0);
      useEffect(() => {
        const fn = () => bump(n => n + 1);
        presence.subs.add(fn);
        if (Date.now() - presence.last > 30000) presenceRefresh();
        if (!presence.timer) {
          presence.timer = setInterval(() => {
            if (document.visibilityState === 'visible') presenceRefresh();
          }, 60000);
        }
        return () => {
          presence.subs.delete(fn);
          if (!presence.subs.size && presence.timer) { clearInterval(presence.timer); presence.timer = null; }
        };
      }, []);
      return presence.map;
    }
    // Avatar with an online dot. Renders a plain avatar when presence is unavailable.
    function PresenceAv({ member, map, size = 36 }) {
      const m = member || {};
      const p = (map || {})[m.id];
      const dnd = p && p.dnd_until && new Date(p.dnd_until) > new Date();
      const av = h`<${Av} i=${m.initials} c=${m.color} s=${size}/>`;
      if (caps.presence === false || !p) return av;
      const d = Math.max(8, Math.round(size * 0.28));
      return h`<span class="msg-dotw">${av}
        <i class=${'msg-dot' + (dnd ? ' dnd' : p.online ? ' on' : '')} style=${{ width: d, height: d }}
           title=${dnd ? 'Do not disturb' : p.online ? 'Online' : (p.last_active_at ? 'Last active ' + fmtRelative(p.last_active_at) : 'Offline')}></i></span>`;
    }

    // ---- link previews (workstream O's `link-preview` fn; silent when missing) ----
    const previewCache = new Map();
    function fetchPreview(url) {
      if (caps.preview === false) return Promise.resolve(null);
      if (previewCache.has(url)) return previewCache.get(url);
      let token = ''; try { token = localStorage.getItem('ams_session_token') || ''; } catch (_) { }
      const p = Promise.resolve()
        .then(() => supabase.functions.invoke('link-preview', {
          body: { url, session: token },
          headers: token ? { 'x-ams-session': token } : {}
        }))
        .then(res => {
          if (res && res.error) throw res.error;
          const d = (res && res.data) || null;
          if (!d || d.error) return null;
          return {
            url: d.url || url,
            title: d.title || d.og_title || null,
            description: d.description || d.og_description || null,
            image: d.image || d.og_image || d.thumbnail_url || null,
            site: d.site_name || d.site || d.provider_name || null
          };
        })
        .catch(e => {
          const s = String((e && (e.message || e.name || e.status)) || '');
          if (/404|not ?found|failed to (fetch|send)|networkerror/i.test(s)) caps.preview = false;
          return null;
        });
      previewCache.set(url, p);
      return p;
    }
    const LinkPreview = deps.LinkPreview || function LinkPreviewCard({ url }) {
      const [d, setD] = useState(null);
      useEffect(() => {
        let alive = true;
        fetchPreview(url).then(v => { if (alive) setD(v); });
        return () => { alive = false; };
      }, [url]);
      if (!d || (!d.title && !d.description && !d.image)) return null;
      return h`<a class="msg-lp" href=${url} target="_blank" rel="noopener noreferrer">
        ${d.image && h`<img src=${d.image} alt="" loading="lazy"/>`}
        <div class="msg-lp-b">
          ${d.title && h`<div class="msg-lp-t">${d.title}</div>`}
          ${d.description && h`<div class="msg-lp-d">${d.description}</div>`}
          ${d.site && h`<div class="msg-lp-s">${d.site}</div>`}
        </div>
      </a>`;
    };

    // ---- misc ----
    const extItems = (key) => { const E = window.AMS_EXT || {}; return Array.isArray(E[key]) ? E[key] : []; };
    const openTaskById = (id) => {
      if (!id) return;
      if (deps.openTask) deps.openTask(id);
      else { try { window.dispatchEvent(new CustomEvent('ams-open-task', { detail: { id } })); } catch (_) { } }
    };
    const CreateTaskModal = deps.CreateTaskModal || null;
    const EMOJI_QUICK = ['👍', '❤️', '😂', '🎉', '✅', '👀'];
    const EMOJI_ALL = ['👍', '👎', '❤️', '🔥', '🎉', '✅', '❌', '👀',
      '😂', '😍', '😅', '😭', '😮', '🤔', '🙏', '👏',
      '💪', '🚀', '⚡', '⭐', '💡', '📌', '⏰', '🆗',
      '🥳', '🤝', '💯', '☕', '🙌', '😎', '🫡', '🧠'];
    const URL_RE = /(https?:\/\/[^\s<>"'`]+)/g;
    const firstUrl = (body) => {
      if (!body) return null;
      const m = String(body).match(URL_RE);
      return m && m.length ? m[0].replace(/[.,;:!?)\]]+$/, '') : null;
    };

    // Render a message body: linkify URLs and highlight @mentions of known members.
    function renderBody(body, members) {
      if (!body) return null;
      const names = (members || []).map(m => m.name).filter(Boolean);
      const out = [];
      String(body).split(URL_RE).forEach((chunk, ci) => {
        if (ci % 2 === 1) { out.push({ t: 'url', v: chunk }); return; }
        if (!chunk) return;
        if (!names.length) { out.push({ t: 'text', v: chunk }); return; }
        const re = new RegExp('(@(?:channel|everyone|here|' +
          names.map(esc).sort((a, b) => b.length - a.length).join('|') + '))', 'gi');
        chunk.split(re).forEach(p => {
          if (!p) return;
          out.push({ t: p.charAt(0) === '@' ? 'mention' : 'text', v: p });
        });
      });
      return out.map((p, i) => p.t === 'url'
        ? h`<a key=${i} class="msg-link" href=${p.v} target="_blank" rel="noopener noreferrer">${p.v}</a>`
        : p.t === 'mention' ? h`<span key=${i} class="msg-mention">${p.v}</span>` : p.v);
    }

    // ---- Avatar for a conversation (DM = other person, group/channel = icon) --
    function ConvAvatar({ conv, meId, size = 42, presenceMap }) {
      if (conv.type === 'channel') {
        if (conv.client_id) {
          return h`<${Av} i=${conv.client_initials || String(conv.title || '#').slice(0, 2).toUpperCase()}
                      c=${conv.client_color || '#8b5cf6'} s=${size}/>`;
        }
        return h`<div class="msg-chan-av" style=${{ width: size, height: size }}>
          <i class=${'ti ' + (conv.is_private ? 'ti-lock' : 'ti-hash')} style=${{ fontSize: size * 0.46 }}></i></div>`;
      }
      if (conv.type === 'group') {
        return h`<div style=${{ width: size, height: size, borderRadius: '50%', background: 'rgba(255,0,238,.12)', color: '#c400bd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i class="ti ti-users" style=${{ fontSize: size * 0.42 }}></i></div>`;
      }
      const o = otherMembers(conv, meId)[0] || {};
      return h`<${PresenceAv} member=${o} map=${presenceMap} size=${size}/>`;
    }

    // =========================================================================
    // Badge maths. Channels are Slack-like: only @mentions raise the nav badge,
    // otherwise an auto-joined client channel per brand would swamp it. Muted
    // conversations behave the same. DMs and groups keep counting every message
    // exactly as they did in v1 (a pre-101 server has no unread_mentions → 0).
    // =========================================================================
    const badgeFor = (c) => {
      if (!c) return 0;
      if (c.type === 'channel' || c.muted) return c.unread_mentions || 0;
      return c.unread_count || 0;
    };
    const totalUnread = (list) => (list || []).reduce((a, c) => a + badgeFor(c), 0);

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
            setTotal(totalUnread(Array.isArray(rows) ? rows : []));
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
            const dm = {};
            list.forEach(c => {
              if (c.type === 'dm') {
                const other = (c.members || []).find(m => m.id !== meId);
                if (other) dm[other.id] = (dm[other.id] || 0) + (c.unread_count || 0);
              }
            });
            setState({ total: totalUnread(list), dmUnread: dm });
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
    function MessagesApp({ currentUser, showToast }) {
      const meId = currentUser.id;
      const [convs, setConvs] = useState(null);      // null=loading
      const [selId, setSelId] = useState(null);
      const [preview, setPreview] = useState(null);  // readable channel you haven't joined
      const [msgs, setMsgs] = useState(null);
      const [hasMore, setHasMore] = useState(false);
      const [older, setOlder] = useState(false);
      const [staff, setStaff] = useState([]);
      const [q, setQ] = useState('');
      const [searching, setSearching] = useState(false);
      const [sq, setSq] = useState('');
      const [sres, setSres] = useState(null);
      const [showNew, setShowNew] = useState(null);  // 'dm' | 'group' | 'channel'
      const [showBrowse, setShowBrowse] = useState(false);
      const [showInfo, setShowInfo] = useState(false);
      const [thread, setThread] = useState(null);    // { rootId, parent, replies, loading }
      const [pinsOpen, setPinsOpen] = useState(false);
      const [pins, setPins] = useState(null);
      const [editing, setEditing] = useState(null);  // message id being edited
      const [act, setAct] = useState(null);          // touch: row with its action bar open
      const [taskFor, setTaskFor] = useState(null);  // fallback create-task dialog
      const [createInit, setCreateInit] = useState(null);   // tasks.js CreateTaskModal
      const [highlight, setHighlight] = useState(null);
      const [toast, setToast] = useState('');
      const [v2, setV2] = useState(caps.v2 !== false);
      const [secOpen, setSecOpen] = useState(() => {
        try { return JSON.parse(localStorage.getItem('ams_chat_sections') || '{}'); } catch (_) { return {}; }
      });
      const feedRef = useRef(null);
      const chanRef = useRef(null);
      const scrollWant = useRef('bottom');
      const pendingTask = useRef(null);
      const pendingThread = useRef(null);
      const presenceMap = usePresence();

      const say = useCallback((m) => {
        if (showToast) showToast(m);
        else { setToast(m); setTimeout(() => setToast(t => (t === m ? '' : t)), 2600); }
      }, [showToast]);
      const fail = useCallback((e, fallbackMsg) => say(errText(e) || fallbackMsg || 'Something went wrong'), [say]);

      const selConv = useMemo(() => (convs || []).find(c => c.id === selId)
        || (preview && preview.id === selId ? preview : null), [convs, selId, preview]);
      const isMember = !!(selConv && selConv.is_member !== false);
      const archived = !!(selConv && selConv.archived_at);
      const canManage = !!(selConv && selConv.can_manage);

      // ---- load conversation list (+ poll) ----
      const loadConvs = useCallback(async (opts = {}) => {
        try {
          const rows = await rpcCall('msg_conversations_list', {}, { silentAuth: true });
          const list = Array.isArray(rows) ? rows : [];
          setConvs(list);
          if (list.length && caps.v2 === null) { caps.v2 = ('can_manage' in list[0]); setV2(caps.v2); }
          return list;
        } catch (e) { if (opts.first) setConvs([]); return []; }
      }, []);

      // One cheap probe decides whether the whole v2 surface is available.
      useEffect(() => {
        if (caps.v2 !== null) { setV2(caps.v2); return; }
        let alive = true;
        rpcCall('msg_channels_browse', { p_q: null }, { silentAuth: true })
          .then(() => { caps.v2 = true; if (alive) setV2(true); })
          .catch(e => { if (isMissingRpc(e)) { caps.v2 = false; if (alive) setV2(false); } });
        return () => { alive = false; };
      }, []);

      useEffect(() => {
        loadConvs({ first: true });
        const poll = setInterval(() => { if (document.visibilityState === 'visible') loadConvs(); }, 15000);
        // Deep-link from a bell notification (link_type='message', link_id=conv id)
        if (window.__amsPendingConv) { setSelId(window.__amsPendingConv); window.__amsPendingConv = null; }
        const onOpen = (e) => {
          const id = (e && e.detail && (e.detail.id || e.detail)) || window.__amsPendingConv;
          if (id) { setSelId(String(id)); window.__amsPendingConv = null; }
        };
        window.addEventListener('ams-open-conv', onOpen);
        // Open (or start) a DM straight from the sidebar team rail — detail = member id
        const onOpenDm = async (e) => {
          const mid = (e && e.detail && (e.detail.id || e.detail)) || window.__amsPendingDm; window.__amsPendingDm = null;
          if (!mid) return;
          try { const res = await rpcCall('msg_start_dm', { p_other_member_id: mid }); await loadConvs(); if (res && res.id) setSelId(res.id); }
          catch (err) { fail(err, 'Could not open that chat'); }
        };
        window.addEventListener('ams-open-dm', onOpenDm);
        if (window.__amsPendingDm) onOpenDm();
        // Open a client's channel from anywhere — detail = { clientId } (v2 only)
        const onOpenClientChannel = async (e) => {
          const cid = e && e.detail && (e.detail.clientId || e.detail.client_id || e.detail);
          if (!cid) return;
          try { const res = await rpcCall('msg_client_channel', { p_client_id: cid }); await loadConvs(); if (res && res.id) setSelId(res.id); }
          catch (err) { fail(err, 'No channel for that client yet'); }
        };
        window.addEventListener('ams-open-client-channel', onOpenClientChannel);
        return () => {
          clearInterval(poll);
          window.removeEventListener('ams-open-conv', onOpen);
          window.removeEventListener('ams-open-dm', onOpenDm);
          window.removeEventListener('ams-open-client-channel', onOpenClientChannel);
        };
      }, [loadConvs, fail]);

      // A channel reached from search or a deep link isn't in the sidebar list.
      useEffect(() => {
        if (!selId || !convs) return;
        if (convs.some(c => c.id === selId)) { if (preview) setPreview(null); return; }
        if (preview && preview.id === selId) return;
        let alive = true;
        rpcCall('msg_conversation_get', { p_conversation_id: selId }, { silentAuth: true })
          .then(c => { if (alive && c && c.id) setPreview(c); })
          .catch(() => { });
        return () => { alive = false; };
      }, [selId, convs, preview]);

      useEffect(() => {
        try { localStorage.setItem('ams_chat_sections', JSON.stringify(secOpen)); } catch (_) { }
      }, [secOpen]);

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

      // ---- open a conversation: load the feed, mark read, subscribe realtime ----
      useEffect(() => {
        if (!selId) { setMsgs(null); setThread(null); setShowInfo(false); setPinsOpen(false); return; }
        let alive = true;
        setMsgs(null); setThread(null); setPinsOpen(false); setPins(null); setEditing(null); setAct(null);
        scrollWant.current = 'bottom';
        (async () => {
          ensureStaff();
          try {
            const rows = await rpcCall('msg_thread', { p_conversation_id: selId, p_limit: 60 }, { silentAuth: true });
            if (!alive) return;
            const list = Array.isArray(rows) ? rows : [];
            setMsgs(list); setHasMore(list.length >= 60);
          } catch (e) { if (alive) { setMsgs([]); setHasMore(false); } }
          try { await rpcCall('msg_mark_read', { p_conversation_id: selId }); } catch (_) { }
          // clear local unread + tell the nav badge
          setConvs(cs => (cs || []).map(c => c.id === selId ? { ...c, unread_count: 0, unread_mentions: 0 } : c));
          window.dispatchEvent(new Event('ams-chat-refresh'));
        })();

        // realtime: broadcast channel keyed on the (private) conversation UUID
        const ch = supabase.channel('ams:conv:' + selId, { config: { broadcast: { self: false } } });
        const nearBottom = () => {
          const el = feedRef.current;
          return !el || (el.scrollHeight - el.scrollTop - el.clientHeight) < 140;
        };
        ch.on('broadcast', { event: 'msg' }, (payload) => {
          const m = payload && payload.payload && payload.payload.message;
          if (!m || m.conversation_id !== selId) return;
          if (nearBottom()) scrollWant.current = 'bottom';
          setMsgs(cur => {
            const arr = cur || [];
            if (arr.some(x => x.id === m.id)) return arr;
            return [...arr, m];
          });
          // keep sidebar preview fresh
          loadConvs();
          rpcCall('msg_mark_read', { p_conversation_id: selId }).catch(() => { });
        });
        // a thread reply: refresh the root's counter, append when that thread is open
        ch.on('broadcast', { event: 'reply' }, (payload) => {
          const p = (payload && payload.payload) || {};
          if (!p.message) return;
          if (p.parent) setMsgs(cur => (cur || []).map(x => x.id === p.parent.id ? { ...x, ...p.parent } : x));
          setThread(t => (t && t.rootId === p.message.parent_id && !(t.replies || []).some(r => r.id === p.message.id))
            ? { ...t, replies: [...(t.replies || []), p.message] } : t);
        });
        // edit / delete / reaction / pin / task link
        ch.on('broadcast', { event: 'msg_update' }, (payload) => {
          const m = payload && payload.payload && payload.payload.message;
          if (!m || !m.id) return;
          setMsgs(cur => (cur || []).map(x => x.id === m.id ? { ...x, ...m } : x));
          setThread(t => t ? {
            ...t,
            parent: t.parent && t.parent.id === m.id ? { ...t.parent, ...m } : t.parent,
            replies: (t.replies || []).map(r => r.id === m.id ? { ...r, ...m } : r)
          } : t);
        });
        ch.subscribe();
        chanRef.current = ch;
        return () => { alive = false; try { supabase.removeChannel(ch); } catch (_) { } chanRef.current = null; };
      }, [selId, loadConvs]);

      const bc = useCallback((event, payload) => {
        if (!chanRef.current) return;
        try { chanRef.current.send({ type: 'broadcast', event, payload }); } catch (_) { }
      }, []);

      // Scroll: stick to the bottom for new messages, hold position when paging back.
      React.useLayoutEffect(() => {
        const el = feedRef.current;
        const want = scrollWant.current;
        if (!el || !want) return;
        if (want === 'bottom') el.scrollTop = el.scrollHeight;
        else if (want.prev != null) el.scrollTop = el.scrollHeight - want.prev;
        scrollWant.current = null;
      }, [msgs, selId]);

      // Flash a message opened from search once it's on screen.
      useEffect(() => {
        if (!highlight || !msgs) return;
        const el = document.getElementById('msg-' + highlight);
        if (!el) return;
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { el.scrollIntoView(); }
        el.classList.add('msg-flash');
        const t = setTimeout(() => { el.classList.remove('msg-flash'); setHighlight(null); }, 2200);
        return () => clearTimeout(t);
      }, [msgs, highlight]);

      // A search hit inside a thread opens that thread once its root has loaded.
      useEffect(() => {
        const p = pendingThread.current;
        if (!p || !msgs) return;
        const root = msgs.find(m => m.id === p.rootId);
        if (!root) return;
        pendingThread.current = null;
        openThread(root);
        if (p.highlight) setHighlight(p.highlight);
      }, [msgs]);

      const loadOlder = useCallback(async () => {
        if (!selId || !msgs || !msgs.length || older) return;
        setOlder(true);
        try {
          const rows = await rpcCall('msg_thread',
            { p_conversation_id: selId, p_before: msgs[0].created_at, p_limit: 60 }, { silentAuth: true });
          const list = Array.isArray(rows) ? rows : [];
          const el = feedRef.current;
          scrollWant.current = el ? { prev: el.scrollHeight - el.scrollTop } : null;
          setMsgs(cur => [...list, ...(cur || [])]);
          setHasMore(list.length >= 60);
        } catch (e) { fail(e, 'Could not load older messages'); }
        setOlder(false);
      }, [selId, msgs, older, fail]);

      // Patch one message everywhere it's rendered, and tell the other tabs.
      const applyMessage = useCallback((m, broadcast = true) => {
        if (!m || !m.id) return;
        setMsgs(cur => (cur || []).map(x => x.id === m.id ? { ...x, ...m } : x));
        setThread(t => t ? {
          ...t,
          parent: t.parent && t.parent.id === m.id ? { ...t.parent, ...m } : t.parent,
          replies: (t.replies || []).map(r => r.id === m.id ? { ...r, ...m } : r)
        } : t);
        if (broadcast) bc('msg_update', { message: m });
      }, [bc]);

      // Everyone who can be @mentioned here: members, plus all staff in a public channel.
      const mentionPool = useMemo(() => {
        const seen = {}; const out = [];
        ((selConv && selConv.members) || []).forEach(m => { if (m && !seen[m.id]) { seen[m.id] = 1; out.push(m); } });
        if (selConv && selConv.type === 'channel' && !selConv.is_private) {
          (staff || []).forEach(m => { if (m && !seen[m.id]) { seen[m.id] = 1; out.push(m); } });
        }
        return out;
      }, [selConv, staff]);

      const uploadFiles = useCallback(async (files) => {
        const out = [];
        for (const f of (files || [])) {
          try {
            const path = (selId || 'chat') + '/' + uuid() + '-' + f.name.replace(/[^\w.\-]+/g, '_');
            const { error } = await supabase.storage.from(BUCKET).upload(path, f, { cacheControl: '31536000', upsert: false, contentType: f.type || undefined });
            if (error) { console.warn('[chat] upload failed', error); say('Could not upload ' + f.name); continue; }
            const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
            out.push({ path, url: pub.publicUrl, name: f.name, mime: f.type || '', size: f.size, kind: /^image\//.test(f.type) ? 'image' : 'file' });
          } catch (e) { console.warn('[chat] upload error', e); say('Could not upload ' + f.name); }
        }
        return out;
      }, [selId, say]);

      // ---- send (top-level, thread reply or announcement post) ----
      const doSend = useCallback(async ({ body, attachments = [], parentId = null, title = null, type = null }) => {
        if (!selId) return false;
        const txt = (body || '').trim();
        if (!txt && !attachments.length && !title) return false;
        const mentions = mentionPool
          .filter(m => m.id !== meId && new RegExp('@' + esc(m.name) + '(?![\\w])', 'i').test(txt))
          .map(m => m.id);
        const args = {
          p_conversation_id: selId, p_body: txt || null,
          p_type: type || (attachments.length ? (attachments.every(a => a.kind === 'image') ? 'image' : 'file') : 'text'),
          p_mentions: mentions, p_attachments: attachments
        };
        // only send v2 params when used, so a pre-101 server still accepts the call
        if (parentId) args.p_parent_id = parentId;
        if (title) args.p_title = title;
        try {
          const res = await rpcCall('msg_send', args);
          const m = res && res.message;
          if (m) {
            if (m.parent_id) {
              const parent = res.parent;
              if (parent) setMsgs(cur => (cur || []).map(x => x.id === parent.id ? { ...x, ...parent } : x));
              setThread(t => (t && t.rootId === m.parent_id)
                ? { ...t, parent: parent || t.parent, replies: [...(t.replies || []), m] } : t);
              bc('reply', { message: m, parent: parent || null });
            } else {
              scrollWant.current = 'bottom';
              setMsgs(cur => [...(cur || []), m]);
              bc('msg', { message: m });
            }
            loadConvs();
          }
          return true;
        } catch (e) { fail(e, 'Could not send'); return false; }
      }, [selId, mentionPool, meId, bc, loadConvs, fail]);

      // ---- per-message actions ----
      const onReact = useCallback(async (m, emoji) => {
        try {
          const res = await rpcCall('msg_react', { p_message_id: m.id, p_emoji: emoji });
          applyMessage({ id: m.id, reactions: (res && res.reactions) || {} });
        } catch (e) { fail(e, 'Could not react'); }
      }, [applyMessage, fail]);

      const onPin = useCallback(async (m, on) => {
        try {
          const res = await rpcCall('msg_pin', { p_message_id: m.id, p_on: !!on });
          if (res && res.message) applyMessage(res.message);
          setPins(null);
          say(on ? 'Pinned' : 'Unpinned');
        } catch (e) { fail(e, 'Could not pin'); }
      }, [applyMessage, say, fail]);

      const onSaveEdit = useCallback(async (m, body, title) => {
        try {
          const args = { p_message_id: m.id, p_body: body };
          if (title != null) args.p_title = title;
          const res = await rpcCall('msg_edit', args);
          applyMessage((res && res.message) || { id: m.id, body, edited_at: new Date().toISOString() });
          setEditing(null);
          loadConvs();
        } catch (e) { fail(e, 'Could not save that edit'); }
      }, [applyMessage, loadConvs, fail]);

      const onDelete = useCallback(async (m) => {
        if (!confirm('Delete this message?')) return;
        try {
          const res = await rpcCall('msg_delete', { p_message_id: m.id });
          applyMessage({
            id: m.id, deleted_at: new Date().toISOString(), body: null, title: null,
            attachments: [], reactions: {}, pinned_at: null
          });
          if (m.parent_id && res && res.reply_count != null) applyMessage({ id: m.parent_id, reply_count: res.reply_count });
          if (thread && thread.rootId === m.id) setThread(null);
          loadConvs();
        } catch (e) { fail(e, 'Could not delete that message'); }
      }, [applyMessage, loadConvs, thread, fail]);

      const openThread = useCallback(async (root) => {
        setShowInfo(false); setPinsOpen(false);
        setThread({ rootId: root.id, parent: root, replies: [], loading: true });
        try {
          const res = await rpcCall('msg_replies', { p_parent_id: root.id }, { silentAuth: true });
          setThread(t => (t && t.rootId === root.id)
            ? { rootId: root.id, parent: (res && res.parent) || root, replies: (res && res.replies) || [], loading: false } : t);
        } catch (e) {
          if (isMissingRpc(e)) { setThread(null); say('Threads arrive with the next update'); }
          else setThread(t => (t && t.rootId === root.id) ? { ...t, loading: false } : t);
        }
      }, [say]);

      // ---- create a task from a message (prefilled dialog + backlink chip) ----
      const onCreateTask = useCallback((m) => {
        const title = String(m.title || m.body || 'Task from chat').replace(/\s+/g, ' ').trim().slice(0, 120);
        const description = (m.body || '') + '\n\n— From chat (' + convLabel(selConv, meId) + ', ' + (m.sender_name || 'someone') + ')';
        if (CreateTaskModal) {
          pendingTask.current = m.id;
          setCreateInit({ title, description, client_id: (selConv && selConv.client_id) || undefined });
        } else setTaskFor(m);
      }, [selConv, meId]);

      const linkCreatedTask = useCallback(async (row) => {
        const mid = pendingTask.current; pendingTask.current = null;
        setCreateInit(null);
        if (!mid || !row || !row.id) return;
        try {
          const res = await rpcCall('msg_link_task', { p_message_id: mid, p_task_id: row.id });
          if (res && res.message) applyMessage(res.message);
          say('Linked ' + (row.custom_id || 'the task'));
        } catch (e) { fail(e, 'Task created, but linking it failed'); }
      }, [applyMessage, say, fail]);

      const onQuickTask = useCallback(async (fields) => {
        const m = taskFor;
        if (!m) return;
        const res = await rpcCall('msg_task_create', { p_message_id: m.id, p_data: fields });
        if (res && res.message) applyMessage(res.message);
        setTaskFor(null);
        const t = res && res.task;
        say('Created ' + ((t && t.custom_id) || 'the task'));
        if (t && t.id) openTaskById(t.id);
      }, [taskFor, applyMessage, say]);

      // ---- message search ----
      useEffect(() => {
        if (!searching) return;
        const term = sq.trim();
        if (term.length < 2) { setSres(null); return; }
        let alive = true;
        const t = setTimeout(async () => {
          try {
            const rows = await rpcCall('msg_search', { p_q: term }, { silentAuth: true });
            if (alive) setSres(Array.isArray(rows) ? rows : []);
          } catch (e) {
            if (alive) setSres([]);
            if (isMissingRpc(e)) { caps.v2 = false; setV2(false); }
          }
        }, 250);
        return () => { alive = false; clearTimeout(t); };
      }, [sq, searching]);

      // ---- start a DM / create a group / create a channel ----
      const startDm = async (member) => {
        try {
          const res = await rpcCall('msg_start_dm', { p_other_member_id: member.id });
          setShowNew(null);
          await loadConvs();
          if (res && res.id) setSelId(res.id);
        } catch (e) { fail(e, 'Could not start that chat'); }
      };
      const createGroup = async (title, memberIds) => {
        try {
          const res = await rpcCall('msg_create_group', { p_title: title, p_member_ids: memberIds });
          setShowNew(null);
          await loadConvs();
          if (res && res.id) setSelId(res.id);
        } catch (e) { fail(e, 'Could not create that group'); }
      };
      const createChannel = async (title, description, isPrivate, memberIds) => {
        try {
          const res = await rpcCall('msg_create_channel', {
            p_title: title, p_description: description || null,
            p_is_private: !!isPrivate, p_member_ids: memberIds || []
          });
          setShowNew(null);
          await loadConvs();
          if (res && res.id) { setSelId(res.id); say('Channel created'); }
        } catch (e) { fail(e, 'Could not create that channel'); }
      };

      const onJoin = useCallback(async (id) => {
        try {
          await rpcCall('msg_join', { p_conversation_id: id });
          setPreview(null);
          await loadConvs();
          setSelId(id);
          say('Joined');
        } catch (e) { fail(e, 'Could not join'); }
      }, [loadConvs, say, fail]);

      const onLeave = useCallback(async (id) => {
        try {
          await rpcCall('msg_leave', { p_conversation_id: id });
          setShowInfo(false); setSelId(null);
          await loadConvs();
          say('Left');
        } catch (e) { fail(e, 'Could not leave'); }
      }, [loadConvs, say, fail]);

      const loadPins = useCallback(async (id) => {
        try {
          const rows = await rpcCall('msg_pins', { p_conversation_id: id }, { silentAuth: true });
          setPins(Array.isArray(rows) ? rows : []);
        } catch (e) { setPins([]); }
      }, []);

      const filtered = useMemo(() => {
        const list = convs || [];
        if (!q.trim()) return list;
        const s = q.toLowerCase();
        return list.filter(c => convTitle(c, meId).toLowerCase().includes(s)
          || (c.slug || '').toLowerCase().includes(s)
          || (c.last_message_preview || '').toLowerCase().includes(s)
          || (c.members || []).some(m => m.name.toLowerCase().includes(s)));
      }, [convs, q, meId]);
      const channels = useMemo(() => filtered.filter(c => c.type === 'channel'), [filtered]);
      const dms = useMemo(() => filtered.filter(c => c.type !== 'channel'), [filtered]);
      const secIsOpen = (k) => secOpen[k] !== false;
      const toggleSec = (k) => setSecOpen(s => ({ ...s, [k]: s[k] === false }));

      // ---------------------------------------------------------------- render
      const openConv = (id) => { setSelId(id); setShowInfo(false); setThread(null); setSearching(false); };
      const mobilePane = thread ? 'thread' : showInfo ? 'info' : selId ? 'conv' : 'list';
      const hideOnMobile = (pane) => (mobilePane === pane ? '' : ' msg-pane-hide');
      const headTitle = convTitle(selConv || {}, meId);
      const dmOther = selConv && selConv.type === 'dm' ? (otherMembers(selConv, meId)[0] || {}) : null;
      const dmPres = dmOther ? (presenceMap || {})[dmOther.id] : null;
      const subtitle = !selConv ? ''
        : selConv.type === 'channel'
          ? (selConv.description || ((selConv.member_count || (selConv.members || []).length) + ' members'))
          : selConv.type === 'group' ? ((selConv.members || []).length + ' members')
            : dmPres ? (dmPres.online ? 'Active now'
              : dmPres.last_active_at ? 'Last active ' + fmtRelative(dmPres.last_active_at) : (dmOther.role_level || ''))
              : ((dmOther && dmOther.role_level) || '');

      const convRow = (c) => h`<div key=${c.id} role="button" tabIndex=${0}
          class=${'msg-conv' + (c.id === selId ? ' on' : '')}
          onClick=${() => openConv(c.id)}
          onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); openConv(c.id); } }}>
          <${ConvAvatar} conv=${c} meId=${meId} size=${42} presenceMap=${presenceMap}/>
          <div style=${{ flex: 1, minWidth: 0 }}>
            <div style=${{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div class="msg-conv-name">${convTitle(c, meId)}</div>
              <div style=${{ fontSize: 11, color: 'var(--t3)', flexShrink: 0 }}>${c.last_message_at ? fmtRelative(c.last_message_at) : ''}</div>
            </div>
            <div style=${{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <div class="msg-conv-prev">${c.last_message_preview || (c.type === 'group' ? 'Group created' : 'Say hi 👋')}</div>
              ${c.muted && h`<i class="ti ti-bell-off" style=${{ fontSize: 13, color: 'var(--t3)' }}></i>`}
              ${(c.unread_count || 0) > 0 && !c.muted && h`<span class="msg-unread">${c.unread_count > 99 ? '99+' : c.unread_count}</span>`}
            </div>
          </div>
        </div>`;

      const chanRow = (c) => {
        const mentions = c.unread_mentions || 0;
        const unread = (c.unread_count || 0) > 0 && !c.muted;
        return h`<div key=${c.id} role="button" tabIndex=${0}
          class=${'msg-chan' + (c.id === selId ? ' on' : '') + (unread ? ' unread' : '')}
          onClick=${() => openConv(c.id)}
          onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); openConv(c.id); } }}>
          <${ConvAvatar} conv=${c} meId=${meId} size=${24} presenceMap=${presenceMap}/>
          <span class="nm">${convTitle(c, meId)}</span>
          ${c.muted && h`<i class="ti ti-bell-off" style=${{ fontSize: 13, color: 'var(--t3)' }}></i>`}
          ${mentions > 0 && h`<span class="msg-mentb">@${mentions}</span>`}
        </div>`;
      };

      const section = (key, label, rows, addTitle, onAdd) => h`<${React.Fragment} key=${key}>
        <button class=${'msg-sec' + (secIsOpen(key) ? '' : ' closed')} onClick=${() => toggleSec(key)}
          aria-expanded=${secIsOpen(key)}>
          <i class="ti ti-chevron-down chev" style=${{ fontSize: 13 }}></i>
          <span>${label}</span>
          ${onAdd && h`<span class="msg-sec-add" role="button" tabIndex=${0} title=${addTitle} aria-label=${addTitle}
            onClick=${e => { e.stopPropagation(); onAdd(); }}
            onKeyDown=${e => { if (e.key === 'Enter') { e.stopPropagation(); onAdd(); } }}><i class="ti ti-plus"></i></span>`}
        </button>
        ${secIsOpen(key) && (rows.length
          ? rows
          : h`<div style=${{ padding: '4px 16px 10px', fontSize: 12.5, color: 'var(--t3)' }}>Nothing here yet.</div>`)}
      <//>`;

      return h`<div class="msg-wrap">
        ${/* LEFT: conversation list */''}
        <div class=${'msg-list' + hideOnMobile('list')}>
          <div class="msg-inbox-hd">
            <div style=${{ fontSize: 19, fontWeight: 700, color: 'var(--t1)' }}>Chat</div>
            <div style=${{ display: 'flex', gap: 6 }}>
              ${v2 && h`<button class="msg-ibtn" title="Search messages" aria-label="Search messages"
                onClick=${() => { setSearching(s => !s); setSq(''); setSres(null); }}><i class="ti ti-search"></i></button>`}
              ${v2 && h`<button class="msg-ibtn" title="Browse channels" aria-label="Browse channels"
                onClick=${async () => { await ensureStaff(); setShowBrowse(true); }}><i class="ti ti-hash"></i></button>`}
              <button class="msg-ibtn" title="New chat" aria-label="New chat"
                onClick=${async () => { await ensureStaff(); setShowNew('dm'); }}><i class="ti ti-plus"></i></button>
            </div>
          </div>

          ${searching
            ? h`<${React.Fragment}>
                <div class="msg-search">
                  <i class="ti ti-search" style=${{ position: 'absolute', left: 11, top: 10, color: 'var(--t3)', fontSize: 15 }}></i>
                  <input autoFocus placeholder="Search all messages" value=${sq}
                    onInput=${e => setSq(e.target.value)}
                    onKeyDown=${e => { if (e.key === 'Escape') { setSearching(false); setSq(''); setSres(null); } }}/>
                </div>
                <div class="msg-scroll">
                  ${sq.trim().length < 2
                    ? h`<div style=${{ padding: '26px 20px', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>Type at least two letters.</div>`
                    : sres === null
                      ? h`<div style=${{ padding: 16 }}><${Skel} h=${52}/></div>`
                      : sres.length === 0
                        ? h`<div style=${{ padding: '26px 20px', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No messages found.</div>`
                        : sres.map(r => h`<div key=${r.id} class="msg-srow" role="button" tabIndex=${0}
                            onClick=${() => {
                              setSearching(false); setSq(''); setSres(null);
                              if (r.parent_id) pendingThread.current = { rootId: r.parent_id, highlight: r.id };
                              else setHighlight(r.id);
                              openConv(r.conversation_id);
                            }}>
                            <div style=${{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <div style=${{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)' }}>
                                ${r.conversation_type === 'channel' ? '#' : ''}${r.conversation_title}</div>
                              <div style=${{ fontSize: 11, color: 'var(--t3)' }}>${fmtRelative(r.created_at)}</div>
                            </div>
                            <div style=${{ fontSize: 12.5, color: 'var(--t2)', marginTop: 3 }}>
                              <span style=${{ fontWeight: 600 }}>${r.sender_name}: </span>
                              ${String(r.title ? r.title + ' — ' : '').concat(String(r.body || '')).slice(0, 140)}
                            </div>
                            ${r.parent_id && h`<div style=${{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>in a thread</div>`}
                          </div>`)}
                </div>
              <//>`
            : h`<${React.Fragment}>
                <div class="msg-search">
                  <i class="ti ti-search" style=${{ position: 'absolute', left: 11, top: 10, color: 'var(--t3)', fontSize: 15 }}></i>
                  <input placeholder="Search chats and people" value=${q} onInput=${e => setQ(e.target.value)}/>
                </div>
                <div class="msg-scroll">
                  ${convs === null
                    ? h`<div style=${{ padding: 16 }}>${[0, 1, 2, 3].map(i => h`<div key=${i} style=${{ marginBottom: 12 }}><${Skel} h=${44}/></div>`)}</div>`
                    : filtered.length === 0
                      ? h`<div style=${{ padding: '30px 20px', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>${q ? 'No matches.' : 'No conversations yet. Tap + to start one.'}</div>`
                      : q.trim()
                        ? filtered.map(c => (c.type === 'channel' ? chanRow(c) : convRow(c)))
                        : h`<${React.Fragment}>
                            ${v2 && section('channels', 'Channels', channels.map(chanRow), 'Browse channels',
                              async () => { await ensureStaff(); setShowBrowse(true); })}
                            ${section('dms', 'Direct messages', dms.map(convRow), 'New message',
                              async () => { await ensureStaff(); setShowNew('dm'); })}
                          <//>`}
                </div>
              <//>`}
        </div>

        ${/* CENTER: the conversation */''}
        <div class=${'msg-thread' + hideOnMobile('conv')} style=${{ position: 'relative' }}>
          ${!selConv ? h`<div class="msg-empty">
              <i class="ti ti-message-2" style=${{ fontSize: 46, opacity: .4 }}></i>
              <div style=${{ fontSize: 15, fontWeight: 600, color: 'var(--t2)' }}>Your messages</div>
              <div style=${{ fontSize: 13 }}>Pick a conversation or start a new one.</div>
            </div>`
          : h`<${React.Fragment}>
            <div style=${{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--bd2)', background: 'var(--surface)' }}>
              <button class="msg-ibtn" style=${{ display: window.matchMedia('(max-width:900px)').matches ? 'flex' : 'none', width: 32, height: 32 }}
                aria-label="Back" onClick=${() => setSelId(null)}><i class="ti ti-arrow-left"></i></button>
              <${ConvAvatar} conv=${selConv} meId=${meId} size=${38} presenceMap=${presenceMap}/>
              <div style=${{ flex: 1, minWidth: 0 }}>
                <div style=${{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ${selConv.type === 'channel' ? '#' + headTitle : headTitle}
                  ${selConv.is_private && h`<i class="ti ti-lock" style=${{ fontSize: 13, color: 'var(--t3)' }} title="Private channel"></i>`}
                  ${archived && h`<span style=${{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t3)' }}>Archived</span>`}
                </div>
                <div style=${{ fontSize: 11.5, color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${subtitle}</div>
              </div>
              ${v2 && (selConv.pinned_count || 0) > 0 && h`<button class="msg-ibtn" title="Pinned messages" aria-label="Pinned messages"
                onClick=${() => { setPinsOpen(o => { if (!o && pins === null) loadPins(selConv.id); return !o; }); }}>
                <i class="ti ti-pin"></i></button>`}
              <button class="msg-ibtn" title="Conversation info" aria-label="Conversation info"
                onClick=${() => setShowInfo(s => !s)}><i class="ti ti-info-circle"></i></button>
            </div>

            ${pinsOpen && h`<${PinsPanel} pins=${pins} conv=${selConv} v2=${v2}
              onClose=${() => setPinsOpen(false)}
              onOpen=${(id) => { setPinsOpen(false); setHighlight(id); }}
              onUnpin=${(m) => onPin(m, false)}/>`}

            <div class="msg-feed" ref=${feedRef}>
              ${msgs === null ? h`<div style=${{ margin: 'auto', color: 'var(--t3)' }}><i class="ti ti-loader-2 spinner"></i></div>`
              : msgs.length === 0 ? h`<div class="msg-empty"><i class="ti ti-messages" style=${{ fontSize: 38, opacity: .4 }}></i><div style=${{ fontSize: 13 }}>No messages yet — say hello.</div></div>`
                : h`<${React.Fragment}>
                  ${hasMore && h`<button class="msg-ghost" style=${{ alignSelf: 'center', marginBottom: 8 }}
                    disabled=${older} onClick=${loadOlder}>${older ? 'Loading…' : 'Load earlier messages'}</button>`}
                  ${msgs.map((m, i) => {
                    const prev = msgs[i - 1];
                    const showDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                    const showHead = selConv.type !== 'dm' && m.sender_id !== meId
                      && (!prev || prev.sender_id !== m.sender_id || showDay);
                    return h`<${React.Fragment} key=${m.id}>
                      ${showDay && h`<div class="msg-day">${fmtDay(m.created_at)}</div>`}
                      <${MessageItem} m=${m} conv=${selConv} meId=${meId} v2=${v2} showHead=${showHead}
                        editing=${editing === m.id} act=${act} setAct=${setAct}
                        onStartEdit=${() => setEditing(m.id)} onCancelEdit=${() => setEditing(null)}
                        onSaveEdit=${onSaveEdit} onDelete=${onDelete} onReact=${onReact} onPin=${onPin}
                        onThread=${openThread} onTask=${onCreateTask} onOpenTask=${openTaskById}/>
                    <//>`;
                  })}
                <//>`}
            </div>

            ${!isMember
              ? h`<div class="msg-banner">
                  <i class="ti ti-eye" style=${{ fontSize: 17 }}></i>
                  <span style=${{ flex: 1 }}>You're previewing ${'#' + headTitle}.</span>
                  <button class="btn-pri" style=${{ padding: '6px 14px' }} onClick=${() => onJoin(selConv.id)}>Join channel</button>
                </div>`
              : archived
                ? h`<div class="msg-banner"><i class="ti ti-archive"></i><span>This channel is archived — no new messages.</span></div>`
                : h`<${Composer} key=${'c-' + selConv.id} conv=${selConv} meId=${meId} members=${mentionPool}
                    draftId=${selConv.id} parentId=${null}
                    placeholder=${'Message ' + (selConv.type === 'channel' ? '#' + headTitle : headTitle) + '…'}
                    canAnnounce=${v2 && selConv.type === 'channel' && canManage}
                    onSend=${doSend} onUpload=${uploadFiles} say=${say}
                    onEditLast=${() => {
                      const mine = (msgs || []).filter(m => m.sender_id === meId && !m.deleted_at);
                      if (mine.length) setEditing(mine[mine.length - 1].id);
                    }}/>`}
          <//>`}
        </div>

        ${/* RIGHT: thread pane / info panel */''}
        ${thread && selConv && h`<${ThreadPane} conv=${selConv} thread=${thread} meId=${meId} v2=${v2}
            mobileHidden=${mobilePane !== 'thread'} members=${mentionPool}
            editing=${editing} setEditing=${setEditing} act=${act} setAct=${setAct}
            onSaveEdit=${onSaveEdit} onDelete=${onDelete} onReact=${onReact} onPin=${onPin}
            onTask=${onCreateTask} onOpenTask=${openTaskById}
            onSend=${doSend} onUpload=${uploadFiles} say=${say}
            onClose=${() => setThread(null)}/>`}

        ${selConv && showInfo && !thread && h`<${InfoPanel} conv=${selConv} meId=${meId} staff=${staff}
            ensureStaff=${ensureStaff} presenceMap=${presenceMap} v2=${v2}
            mobileOn=${mobilePane === 'info'}
            onChanged=${loadConvs} onClose=${() => setShowInfo(false)} onLeave=${onLeave}
            say=${say} fail=${fail}/>`}

        ${showNew && h`<${NewChatModal} mode=${showNew} v2=${v2} staff=${staff} meId=${meId}
            onDm=${startDm} onGroup=${createGroup} onChannel=${createChannel} onClose=${() => setShowNew(null)}/>`}

        ${showBrowse && h`<${ChannelBrowser} meId=${meId} selId=${selId}
            onOpen=${(id) => { setShowBrowse(false); openConv(id); }}
            onJoin=${async (id) => { await onJoin(id); setShowBrowse(false); }}
            onLeave=${onLeave}
            onCreate=${async () => { await ensureStaff(); setShowBrowse(false); setShowNew('channel'); }}
            onClose=${() => setShowBrowse(false)} fail=${fail}/>`}

        ${taskFor && h`<${QuickTaskModal} message=${taskFor} conv=${selConv} meId=${meId}
            onCreate=${onQuickTask} onClose=${() => setTaskFor(null)} fail=${fail}/>`}

        ${createInit && CreateTaskModal && h`<${CreateTaskModal} initial=${createInit}
            onClose=${() => { pendingTask.current = null; setCreateInit(null); }}
            onCreated=${linkCreatedTask} showToast=${say}/>`}

        ${toast && h`<div class="msg-toast" role="status">${toast}</div>`}
      </div>`;
    }

    // =========================================================================
    // InfoPanel — members, add/remove, rename, description, mute, leave, archive
    // =========================================================================
    function InfoPanel({ conv, meId, staff, ensureStaff, presenceMap, v2, mobileOn, onChanged, onClose, onLeave, say, fail }) {
      const [busy, setBusy] = useState(false);
      const [adding, setAdding] = useState(false);
      const [editTitle, setEditTitle] = useState(false);
      const [title, setTitle] = useState(conv.title || '');
      const [editDesc, setEditDesc] = useState(false);
      const [desc, setDesc] = useState(conv.description || '');
      const [muted, setMuted] = useState(!!conv.muted);
      const isCreator = conv.is_creator;
      const isGroup = conv.type === 'group';
      const isChannel = conv.type === 'channel';
      const canManage = isChannel ? !!conv.can_manage : isCreator;
      const isGeneral = conv.system_key === 'general';
      const isMember = conv.is_member !== false;
      // public channels let any member invite; private ones and groups need a manager
      const canAdd = isChannel ? (canManage || (!conv.is_private && isMember)) : isCreator;

      const call = async (name, args, msg) => {
        setBusy(true);
        try { await rpcCall(name, args); await onChanged(); }
        catch (e) { fail(e, msg || 'That didn’t work'); }
        setBusy(false);
      };
      const memberIds = (conv.members || []).map(m => m.id);
      const addable = (staff || []).filter(m => m.id !== meId && !memberIds.includes(m.id));
      const heading = isChannel ? 'Channel info' : isGroup ? 'Group info' : 'Contact';

      const saveTitle = async () => {
        const t = title.trim();
        if (!t) return;
        if (isChannel) await call('msg_channel_update', { p_conversation_id: conv.id, p_patch: { title: t } }, 'Rename failed');
        else await call('msg_rename', { p_conversation_id: conv.id, p_title: t }, 'Rename failed');
        setEditTitle(false);
      };

      return h`<div class=${'msg-info' + (mobileOn ? ' msg-pane-on' : '')}>
        <div style=${{ padding: '16px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style=${{ fontSize: 14, fontWeight: 700 }}>${heading}</div>
          <button class="msg-ibtn" style=${{ width: 30, height: 30 }} aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
        </div>
        <div style=${{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 16px 16px', gap: 8 }}>
          <${ConvAvatar} conv=${conv} meId=${meId} size=${72} presenceMap=${presenceMap}/>
          ${(isGroup || isChannel) && editTitle
            ? h`<div style=${{ display: 'flex', gap: 6, width: '100%' }}>
                <input value=${title} onInput=${e => setTitle(e.target.value)} aria-label="Name"
                  onKeyDown=${e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditTitle(false); }}
                  style=${{ flex: 1, padding: '7px 10px', border: '1px solid var(--bd2)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--t1)', fontSize: 14 }}/>
                <button class="msg-ibtn" style=${{ width: 34, height: 34 }} aria-label="Save" onClick=${saveTitle}><i class="ti ti-check"></i></button>
              </div>`
            : h`<div style=${{ fontSize: 17, fontWeight: 700, textAlign: 'center', display: 'flex', alignItems: 'center', gap: 6 }}>
                ${isChannel ? '#' + convTitle(conv, meId) : convTitle(conv, meId)}
                ${(isGroup || isChannel) && canManage && !isGeneral && h`<i class="ti ti-pencil" role="button" tabIndex=${0}
                  style=${{ fontSize: 14, color: 'var(--t3)', cursor: 'pointer' }}
                  onClick=${() => { setTitle(conv.title || ''); setEditTitle(true); }}></i>`}
              </div>`}
          ${isChannel && h`<div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', fontSize: 11, color: 'var(--t3)' }}>
            <span>${conv.is_private ? 'Private channel' : 'Public channel'}</span>
            ${conv.client_name && h`<span>· ${conv.client_name}</span>`}
            ${conv.archived_at && h`<span>· Archived</span>`}
          </div>`}
        </div>

        ${isChannel && h`<div style=${{ padding: '0 16px 14px' }}>
          ${editDesc
            ? h`<div style=${{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea rows=${3} value=${desc} onInput=${e => setDesc(e.target.value)} aria-label="Description"
                  style=${{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: '1px solid var(--bd2)', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--t1)' }}/>
                <div style=${{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button class="msg-ghost" onClick=${() => { setDesc(conv.description || ''); setEditDesc(false); }}>Cancel</button>
                  <button class="msg-ghost" style=${{ borderColor: '#ff00ee', color: '#c400bd' }}
                    onClick=${async () => { await call('msg_channel_update', { p_conversation_id: conv.id, p_patch: { description: desc } }, 'Could not save'); setEditDesc(false); }}>Save</button>
                </div>
              </div>`
            : h`<div style=${{ fontSize: 13, color: conv.description ? 'var(--t2)' : 'var(--t3)', lineHeight: 1.5 }}>
                ${conv.description || 'No description yet.'}
                ${canManage && h`<i class="ti ti-pencil" role="button" tabIndex=${0} title="Edit description"
                  style=${{ fontSize: 13, color: 'var(--t3)', cursor: 'pointer', marginLeft: 6 }}
                  onClick=${() => { setDesc(conv.description || ''); setEditDesc(true); }}></i>`}
              </div>`}
        </div>`}

        ${v2 && isMember && h`<div style=${{ padding: '0 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <i class=${'ti ' + (muted ? 'ti-bell-off' : 'ti-bell')} style=${{ color: 'var(--t3)' }}></i>
          <span style=${{ flex: 1, fontSize: 13, color: 'var(--t2)' }}>Mute notifications</span>
          <button class="msg-ghost" disabled=${busy} onClick=${async () => {
            const next = !muted;
            setMuted(next);
            try { await rpcCall('msg_set_mute', { p_conversation_id: conv.id, p_muted: next }); await onChanged(); }
            catch (e) { setMuted(!next); fail(e, 'Could not change that'); }
          }}>${muted ? 'Unmute' : 'Mute'}</button>
        </div>`}

        <div style=${{ padding: '0 16px 8px', fontSize: 11.5, fontWeight: 700, color: 'var(--t3)', letterSpacing: '.04em', display: 'flex', justifyContent: 'space-between' }}>
          <span>MEMBERS · ${conv.member_count || (conv.members || []).length}</span>
          ${canAdd && !conv.archived_at && h`<span role="button" tabIndex=${0} style=${{ color: '#c400bd', cursor: 'pointer' }}
            onClick=${async () => { await ensureStaff(); setAdding(a => !a); }}>${adding ? 'Done' : '+ Add'}</span>`}
        </div>
        ${adding && addable.length > 0 && h`<div style=${{ maxHeight: 160, overflowY: 'auto', margin: '0 8px 8px', border: '1px solid var(--bd2)', borderRadius: 10 }}>
          ${addable.map(m => h`<div key=${m.id} class="msg-pick" style=${{ padding: '8px 12px', fontSize: 13 }} role="button" tabIndex=${0}
            onClick=${() => call('msg_add_members', { p_conversation_id: conv.id, p_member_ids: [m.id] }, 'Could not add them')}>
            <${Av} i=${m.initials} c=${m.color} s=${28}/><span>${m.name}</span><i class="ti ti-plus" style=${{ marginLeft: 'auto', color: '#c400bd' }}></i>
          </div>`)}
        </div>`}
        ${(conv.members || []).map(m => h`<div key=${m.id} style=${{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px' }}>
          <${PresenceAv} member=${m} map=${presenceMap} size=${34}/>
          <div style=${{ flex: 1, minWidth: 0 }}>
            <div style=${{ fontSize: 13.5, fontWeight: 600 }}>${m.name}${m.id === meId ? ' (you)' : ''}</div>
            <div style=${{ fontSize: 11, color: 'var(--t3)' }}>${m.id === conv.created_by ? 'Creator' : (m.role_level || '')}</div>
          </div>
          ${canManage && !isGeneral && m.id !== meId && m.id !== conv.created_by && h`<button class="msg-ibtn"
            style=${{ width: 28, height: 28, borderColor: 'transparent' }} title="Remove" aria-label=${'Remove ' + m.name} disabled=${busy}
            onClick=${() => call('msg_remove_member', { p_conversation_id: conv.id, p_member_id: m.id }, 'Could not remove them')}>
            <i class="ti ti-user-minus" style=${{ fontSize: 14, color: '#DC2626' }}></i></button>`}
        </div>`)}

        <div style=${{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          ${isChannel && canManage && !isGeneral && h`<button class="btn-sec" style=${{ width: '100%' }} disabled=${busy}
            onClick=${() => call('msg_channel_update', { p_conversation_id: conv.id, p_patch: { archived: !conv.archived_at } },
              'Could not change that')}>
            <i class=${'ti ' + (conv.archived_at ? 'ti-archive-off' : 'ti-archive')}></i> ${conv.archived_at ? 'Unarchive channel' : 'Archive channel'}</button>`}
          ${isChannel && isMember && !isGeneral && h`<button class="btn-sec" style=${{ width: '100%', color: '#DC2626', borderColor: '#FEE2E2' }} disabled=${busy}
            onClick=${() => { if (confirm('Leave this channel?')) onLeave(conv.id); }}>
            <i class="ti ti-logout"></i> Leave channel</button>`}
          ${isGroup && !isCreator && h`<button class="btn-sec" style=${{ width: '100%', color: '#DC2626', borderColor: '#FEE2E2' }} disabled=${busy}
            onClick=${() => { if (confirm('Leave this group?')) onLeave(conv.id); }}>
            <i class="ti ti-logout"></i> Leave group</button>`}
        </div>
      </div>`;
    }

    // =========================================================================
    // MessageItem — one message: bubble or announcement card, with actions,
    // reactions, thread summary, task backlink chip and link preview.
    // =========================================================================
    function MessageItem({ m, conv, meId, v2, showHead, inThread, editing, act, setAct,
                           onStartEdit, onCancelEdit, onSaveEdit, onDelete, onReact, onPin,
                           onThread, onTask, onOpenTask }) {
      const [pick, setPick] = useState(false);
      const [body, setBody] = useState(m.body || '');
      const [title, setTitle] = useState(m.title || '');
      useEffect(() => { setBody(m.body || ''); setTitle(m.title || ''); }, [m.id, editing]);

      const mine = m.sender_id === meId;
      const isChannel = conv.type === 'channel';
      const gone = !!m.deleted_at;
      const canPin = v2 && !gone && (!isChannel || !!conv.can_manage);
      const canDelete = !gone && (mine || (v2 && isChannel && !!conv.can_manage));
      const members = conv.members || [];
      const url = firstUrl(m.body);
      const rx = m.reactions || {};
      const rxKeys = Object.keys(rx);
      const toggleAct = () => setAct(a => (a === m.id ? null : m.id));

      const actions = !gone && h`<div class="msg-acts" onClick=${e => e.stopPropagation()}>
        ${v2 && h`<button class="msg-act" title="React" aria-label="React" onClick=${() => setPick(p => !p)}><i class="ti ti-mood-smile"></i></button>`}
        ${v2 && !inThread && h`<button class="msg-act" title="Reply in thread" aria-label="Reply in thread"
          onClick=${() => onThread(m)}><i class="ti ti-message-circle"></i></button>`}
        ${v2 && h`<button class="msg-act" title="Create task" aria-label="Create task from this message"
          onClick=${() => onTask(m)}><i class="ti ti-subtask"></i></button>`}
        ${canPin && h`<button class="msg-act" title=${m.pinned_at ? 'Unpin' : 'Pin'} aria-label=${m.pinned_at ? 'Unpin' : 'Pin'}
          onClick=${() => onPin(m, !m.pinned_at)}><i class=${'ti ' + (m.pinned_at ? 'ti-pinned-off' : 'ti-pin')}></i></button>`}
        ${mine && h`<button class="msg-act" title="Edit" aria-label="Edit" onClick=${() => onStartEdit(m)}><i class="ti ti-pencil"></i></button>`}
        ${canDelete && h`<button class="msg-act" title="Delete" aria-label="Delete" onClick=${() => onDelete(m)}><i class="ti ti-trash"></i></button>`}
        ${pick && h`<div class="msg-emoji">
          ${EMOJI_ALL.map(e2 => h`<button key=${e2} title=${e2} onClick=${() => { setPick(false); onReact(m, e2); }}>${e2}</button>`)}
        </div>`}
      </div>`;

      const editor = h`<div style=${{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }} onClick=${e => e.stopPropagation()}>
        ${m.type === 'post' && h`<input value=${title} onInput=${e => setTitle(e.target.value)} aria-label="Announcement title"
          style=${{ border: '1px solid var(--bd2)', borderRadius: 8, padding: '7px 10px', fontSize: 14, fontWeight: 600, background: 'var(--bg2)', color: 'var(--t1)' }}/>`}
        <textarea rows=${2} value=${body} autoFocus aria-label="Edit message"
          onInput=${e => setBody(e.target.value)}
          onKeyDown=${e => {
            if (e.key === 'Escape') { e.preventDefault(); onCancelEdit(); }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSaveEdit(m, body, m.type === 'post' ? title : null); }
          }}
          style=${{ resize: 'vertical', border: '1px solid var(--bd2)', borderRadius: 10, padding: '9px 12px', fontSize: 13.5, fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--t1)' }}/>
        <div style=${{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button class="msg-ghost" onClick=${onCancelEdit}>Cancel</button>
          <button class="msg-ghost" style=${{ borderColor: '#ff00ee', color: '#c400bd' }}
            onClick=${() => onSaveEdit(m, body, m.type === 'post' ? title : null)}>Save</button>
        </div>
      </div>`;

      const extras = h`<${React.Fragment}>
        ${rxKeys.length > 0 && h`<div class="msg-rx" onClick=${e => e.stopPropagation()}>
          ${rxKeys.map(k => {
            const ids = rx[k] || [];
            return h`<button key=${k} class=${'msg-rxc' + (ids.indexOf(meId) >= 0 ? ' on' : '')}
              onClick=${() => onReact(m, k)} title=${ids.length + (ids.length === 1 ? ' person' : ' people')}>${k} ${ids.length}</button>`;
          })}
        </div>`}
        ${v2 && !inThread && (m.reply_count || 0) > 0 && h`<button class="msg-thsum" onClick=${e => { e.stopPropagation(); onThread(m); }}>
          ${(m.reply_members || []).map(r => h`<${Av} key=${r.id} i=${r.initials} c=${r.color} s=${18}/>`)}
          <span>${m.reply_count} ${m.reply_count === 1 ? 'reply' : 'replies'}</span>
          ${m.last_reply_at && h`<span class="msg-thsum-t">${fmtRelative(m.last_reply_at)}</span>`}
        </button>`}
        ${m.task && h`<button class="msg-taskchip" disabled=${!!m.task.private}
          onClick=${e => { e.stopPropagation(); if (!m.task.private) onOpenTask(m.task.id); }}>
          <i class="ti ti-subtask" style=${{ color: '#c400bd' }}></i>
          ${m.task.private
            ? h`<span>Linked task (private)</span>`
            : h`<${React.Fragment}>
                <span class="msg-tc-id">${m.task.custom_id}</span>
                <span class="msg-tc-t">${m.task.title}</span>
                ${m.task.status_name && h`<span class="msg-tc-s"
                  style=${{ background: (m.task.status_color || '#87909e') + '22', color: m.task.status_color || '#87909e' }}>${m.task.status_name}</span>`}
              <//>`}
        </button>`}
        ${url && !gone && h`<${LinkPreview} url=${url}/>`}
      <//>`;

      if (m.type === 'post' && !gone) {
        return h`<div class=${'msg-post' + (act === m.id ? ' act' : '')} id=${'msg-' + m.id} onClick=${toggleAct}>
          ${actions}
          <div class="msg-post-tag">
            <i class="ti ti-speakerphone"></i> Announcement${m.pinned_at ? ' · Pinned' : ''}
          </div>
          ${editing ? editor : h`<${React.Fragment}>
            <div class="msg-post-t">${m.title}</div>
            <div style=${{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>${renderBody(m.body, members)}</div>
          <//>`}
          <div class="msg-meta" style=${{ margin: '8px 0 0' }}>${m.sender_name} · ${fmtTime(m.created_at)}${m.edited_at ? ' · edited' : ''}</div>
          ${extras}
        </div>`;
      }

      return h`<div class=${'msg-row' + (mine ? ' me' : '') + (act === m.id ? ' act' : '')} id=${'msg-' + m.id}
        style=${{ marginTop: showHead ? 8 : 2 }} onClick=${toggleAct}>
        ${!mine && conv.type !== 'dm' && h`<${Av} i=${m.sender_initials} c=${m.sender_color} s=${28}/>`}
        <div style=${{ minWidth: 0 }}>
          ${showHead && h`<div style=${{ fontSize: 11.5, fontWeight: 600, color: 'var(--t2)', margin: '0 4px 3px' }}>${m.sender_name}</div>`}
          ${gone ? h`<div class="msg-bubble" style=${{ fontStyle: 'italic', opacity: .6 }}>Message deleted</div>`
            : editing ? editor
              : h`<div>
                  ${(m.attachments || []).map((a, k) => h`<div key=${k} style=${{ marginBottom: 4 }}>
                    ${a.kind === 'image'
                      ? h`<img src=${a.url} alt=${a.name} class="msg-att" style=${{ padding: 0, border: 'none' }}
                          onClick=${e => { e.stopPropagation(); window.open(a.url, '_blank'); }}/>`
                      : h`<a href=${a.url} target="_blank" rel="noopener noreferrer" class="msg-att" style=${{ textDecoration: 'none' }}
                          onClick=${e => e.stopPropagation()}><i class="ti ti-paperclip" style=${{ color: '#c400bd' }}></i>
                          <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${a.name}</span></a>`}
                  </div>`)}
                  ${m.body && h`<div class="msg-bubble">${renderBody(m.body, members)}</div>`}
                </div>`}
          <div class="msg-meta" style=${{ textAlign: mine ? 'right' : 'left' }}>
            ${fmtTime(m.created_at)}${m.edited_at ? ' · edited' : ''}${m.pinned_at ? ' · pinned' : ''}
          </div>
          ${extras}
        </div>
        ${actions}
      </div>`;
    }

    // =========================================================================
    // Composer — draft-persisting input with mentions, attachments,
    // composerTools and (for channel managers) announcement posts.
    // =========================================================================
    function Composer({ conv, meId, members, draftId, parentId, placeholder, canAnnounce, onSend, onUpload, onEditLast, say }) {
      const [text, setText] = useState(() => readDraft(draftId));
      const [at, setAt] = useState(null);           // { q, idx }
      const [pending, setPending] = useState([]);
      const [busy, setBusy] = useState(false);
      const [uploading, setUploading] = useState(false);
      const [announce, setAnnounce] = useState(false);
      const [title, setTitle] = useState('');
      const taRef = useRef(null);
      const fileRef = useRef(null);

      useEffect(() => { writeDraft(draftId, text); }, [text, draftId]);

      const pool = (members || []).filter(m => m.id !== meId);
      const mentionList = useMemo(() => {
        if (!at) return [];
        const base = pool.filter(m => m.name.toLowerCase().includes(at.q));
        const extra = (conv.type !== 'dm' && 'channel'.indexOf(at.q) === 0) ? [{ id: '@channel', name: 'channel', everyone: true }] : [];
        return extra.concat(base).slice(0, 6);
      }, [at, pool, conv.type]);

      const onText = (v) => {
        setText(v);
        const m = /(^|\s)@([\w.]*)$/.exec(v);
        setAt(m ? { q: m[2].toLowerCase(), idx: 0 } : null);
      };
      const pickMention = (m) => {
        setText(d => d.replace(/(^|\s)@([\w.]*)$/, (s, pre) => pre + '@' + m.name + ' '));
        setAt(null);
        if (taRef.current) taRef.current.focus();
      };

      const addFiles = async (files) => {
        if (!files || !files.length) return;
        setUploading(true);
        const out = await onUpload(files);
        setUploading(false);
        if (out.length) setPending(p => [...p, ...out]);
      };

      const tools = extItems('composerTools');
      const toolCtx = {
        insertText: (s) => setText(t => (t ? t.replace(/\s*$/, '') + ' ' : '') + String(s || '')),
        addAttachment: async (fileOrMeta) => {
          if (!fileOrMeta) return;
          const isFile = (typeof File !== 'undefined' && fileOrMeta instanceof File)
            || (typeof Blob !== 'undefined' && fileOrMeta instanceof Blob);
          if (isFile) { await addFiles([fileOrMeta]); return; }
          const a = fileOrMeta;
          if (!a.url) return;
          setPending(p => [...p, {
            url: a.url, name: a.name || 'Attachment', mime: a.mime || '', size: a.size || 0,
            path: a.path || null, kind: a.kind || (/^image\//.test(a.mime || '') ? 'image' : 'file')
          }]);
        },
        context: { conversationId: conv && conv.id, parentId: parentId || null }
      };

      const canSend = !busy && !uploading && (!!text.trim() || pending.length > 0 || (announce && !!title.trim()));
      const send = async () => {
        if (!canSend) return;
        setBusy(true);
        const ok = await onSend({
          body: text, attachments: pending, parentId: parentId || null,
          title: announce ? title.trim() : null, type: announce ? 'post' : null
        });
        setBusy(false);
        if (ok) {
          setText(''); setPending([]); setTitle(''); setAnnounce(false); setAt(null);
          writeDraft(draftId, '');
          if (taRef.current) taRef.current.style.height = 'auto';
        }
      };

      return h`<div class="msg-composer" style=${{ position: 'relative' }}>
        ${at && mentionList.length > 0 && h`<div class="msg-atwrap">
          ${mentionList.map((m, i) => h`<div key=${m.id} class=${'msg-atrow' + (i === at.idx ? ' on' : '')}
            onMouseDown=${e => { e.preventDefault(); pickMention(m); }}>
            ${m.everyone
              ? h`<i class="ti ti-users" style=${{ width: 26, textAlign: 'center', color: '#c400bd' }}></i>`
              : h`<${Av} i=${m.initials} c=${m.color} s=${26}/>`}
            <span>@${m.name}</span>
            ${m.everyone && h`<span style=${{ marginLeft: 'auto', fontSize: 11, color: 'var(--t3)' }}>Notify everyone</span>`}
          </div>`)}
        </div>`}

        ${announce && h`<input value=${title} onInput=${e => setTitle(e.target.value)} placeholder="Announcement title"
          aria-label="Announcement title"
          style=${{ width: '100%', boxSizing: 'border-box', marginBottom: 8, padding: '9px 12px', border: '1px solid var(--bd2)', borderRadius: 10, background: 'var(--bg2)', color: 'var(--t1)', fontSize: 14, fontWeight: 600 }}/>`}

        ${pending.length > 0 && h`<div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          ${pending.map((a, i) => h`<span key=${i} class="msg-chip">
            <i class=${'ti ' + (a.kind === 'image' ? 'ti-photo' : 'ti-paperclip')} style=${{ color: '#c400bd' }}></i>
            <span>${a.name}</span>
            <button aria-label=${'Remove ' + a.name} onClick=${() => setPending(p => p.filter((_, k) => k !== i))}><i class="ti ti-x"></i></button>
          </span>`)}
        </div>`}

        <div style=${{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <input ref=${fileRef} type="file" multiple style=${{ display: 'none' }}
            onChange=${e => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }}/>
          <button class="msg-ibtn" title="Attach" aria-label="Attach a file" disabled=${uploading}
            onClick=${() => fileRef.current && fileRef.current.click()}>
            <i class=${'ti ' + (uploading ? 'ti-loader-2 spinner' : 'ti-paperclip')}></i></button>
          ${canAnnounce && h`<button class="msg-ibtn" title="Announcement" aria-label="Write an announcement"
            style=${announce ? { borderColor: '#ff00ee', color: '#c400bd' } : {}}
            onClick=${() => setAnnounce(a => !a)}><i class="ti ti-speakerphone"></i></button>`}
          ${tools.map(t => h`<button key=${t.id} class="msg-ibtn" title=${t.title || t.id} aria-label=${t.title || t.id}
            onClick=${() => { try { t.run(toolCtx); } catch (e) { say && say('That tool failed'); } }}>
            <i class=${'ti ' + (t.icon || 'ti-plus')}></i></button>`)}
          <textarea ref=${taRef} rows=${1} value=${text} placeholder=${placeholder || 'Type your message…'}
            aria-label="Message"
            onInput=${e => { onText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
            onKeyDown=${e => {
              if (at && mentionList.length) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setAt(a => ({ ...a, idx: Math.min(a.idx + 1, mentionList.length - 1) })); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setAt(a => ({ ...a, idx: Math.max(a.idx - 1, 0) })); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionList[at.idx]); return; }
                if (e.key === 'Escape') { setAt(null); return; }
              }
              if (e.key === 'ArrowUp' && !text && onEditLast) { e.preventDefault(); onEditLast(); return; }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            style=${{ flex: 1, resize: 'none', border: '1px solid var(--bd2)', borderRadius: 12, padding: '11px 14px', fontSize: 14, fontFamily: 'inherit', background: 'var(--bg2)', color: 'var(--t1)', maxHeight: 120, lineHeight: 1.4 }}/>
          <button class="msg-send" disabled=${!canSend} aria-label="Send" onClick=${send}>
            <i class=${'ti ' + (busy ? 'ti-loader-2 spinner' : 'ti-send')}></i>
          </button>
        </div>
      </div>`;
    }

    // =========================================================================
    // ThreadPane — a message and its replies, with its own draft + composer
    // =========================================================================
    function ThreadPane({ conv, thread, meId, v2, members, mobileHidden, editing, setEditing, act, setAct,
                          onSaveEdit, onDelete, onReact, onPin, onTask, onOpenTask, onSend, onUpload, say, onClose }) {
      const replies = thread.replies || [];
      const item = (m, inHead) => h`<${MessageItem} m=${m} conv=${conv} meId=${meId} v2=${v2} inThread=${true}
        showHead=${inHead} editing=${editing === m.id} act=${act} setAct=${setAct}
        onStartEdit=${() => setEditing(m.id)} onCancelEdit=${() => setEditing(null)}
        onSaveEdit=${onSaveEdit} onDelete=${onDelete} onReact=${onReact} onPin=${onPin}
        onThread=${() => { }} onTask=${onTask} onOpenTask=${onOpenTask}/>`;

      return h`<div class=${'msg-tpane' + (mobileHidden ? ' msg-pane-hide' : '')}>
        <div class="msg-tpane-hd">
          <div style=${{ flex: 1, minWidth: 0 }}>
            <div style=${{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>Thread</div>
            <div style=${{ fontSize: 11.5, color: 'var(--t3)' }}>
              ${conv.type === 'channel' ? '#' + convTitle(conv, meId) : convTitle(conv, meId)}</div>
          </div>
          <button class="msg-ibtn" style=${{ width: 32, height: 32 }} aria-label="Close thread" onClick=${onClose}>
            <i class="ti ti-x"></i></button>
        </div>
        <div class="msg-feed" style=${{ padding: '14px 16px' }}>
          ${thread.parent && item(thread.parent, conv.type !== 'dm' && thread.parent.sender_id !== meId)}
          <div class="msg-tpane-div">${thread.loading ? 'Loading…' : replies.length
            ? replies.length + (replies.length === 1 ? ' reply' : ' replies') : 'No replies yet'}</div>
          ${replies.map((r, i) => {
            const prev = replies[i - 1];
            const showHead = conv.type !== 'dm' && r.sender_id !== meId && (!prev || prev.sender_id !== r.sender_id);
            return h`<${React.Fragment} key=${r.id}>${item(r, showHead)}<//>`;
          })}
        </div>
        <${Composer} key=${'t-' + thread.rootId} conv=${conv} meId=${meId} members=${members}
          draftId=${thread.rootId} parentId=${thread.rootId} placeholder="Reply…"
          canAnnounce=${false} onSend=${onSend} onUpload=${onUpload} say=${say}/>
      </div>`;
    }

    // =========================================================================
    // PinsPanel — pinned messages for the open conversation
    // =========================================================================
    function PinsPanel({ pins, conv, v2, onClose, onOpen, onUnpin }) {
      const canUnpin = v2 && (conv.type !== 'channel' || !!conv.can_manage);
      return h`<div class="msg-pins">
        <div style=${{ display: 'flex', alignItems: 'center', padding: '11px 13px', borderBottom: '1px solid var(--bd2)' }}>
          <div style=${{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>Pinned</div>
          <button class="msg-ibtn" style=${{ width: 26, height: 26 }} aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
        </div>
        ${pins === null
          ? h`<div style=${{ padding: 14 }}><${Skel} h=${40}/></div>`
          : pins.length === 0
            ? h`<div style=${{ padding: '18px 14px', textAlign: 'center', color: 'var(--t3)', fontSize: 12.5 }}>Nothing pinned yet.</div>`
            : pins.map(m => h`<div key=${m.id} class="msg-pinrow">
                <div style=${{ flex: 1, minWidth: 0, cursor: 'pointer' }} role="button" tabIndex=${0} onClick=${() => onOpen(m.id)}>
                  <div style=${{ fontWeight: 600, marginBottom: 2 }}>${m.title || m.sender_name}</div>
                  <div style=${{ color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${m.body || '📎 Attachment'}</div>
                  <div style=${{ color: 'var(--t3)', fontSize: 11, marginTop: 2 }}>${fmtRelative(m.created_at)}</div>
                </div>
                ${canUnpin && h`<button class="msg-act" title="Unpin" aria-label="Unpin" onClick=${() => onUnpin(m)}>
                  <i class="ti ti-pinned-off"></i></button>`}
              </div>`)}
      </div>`;
    }

    // =========================================================================
    // ChannelBrowser — every channel you can see: join, open or leave
    // =========================================================================
    function ChannelBrowser({ meId, selId, onOpen, onJoin, onLeave, onCreate, onClose, fail }) {
      const [rows, setRows] = useState(null);
      const [q, setQ] = useState('');
      const [tab, setTab] = useState('all');   // all | client | agency | mine
      const [busyId, setBusyId] = useState(null);

      const load = useCallback(async () => {
        try {
          const res = await rpcCall('msg_channels_browse', { p_q: null }, { silentAuth: true });
          setRows(Array.isArray(res) ? res : []);
        } catch (e) { setRows([]); fail(e, 'Could not load channels'); }
      }, [fail]);
      useEffect(() => { load(); }, [load]);

      const shown = (rows || []).filter(c => {
        if (tab === 'client' && !c.client_id) return false;
        if (tab === 'agency' && c.client_id) return false;
        if (tab === 'mine' && !c.is_member) return false;
        const s = q.trim().toLowerCase();
        if (!s) return true;
        return String(c.title || '').toLowerCase().includes(s)
          || String(c.slug || '').toLowerCase().includes(s)
          || String(c.description || '').toLowerCase().includes(s);
      });

      return h`<div class="msg-modal-bg" onClick=${onClose}>
        <div class="msg-modal" style=${{ maxWidth: 520 }} onClick=${e => e.stopPropagation()}>
          <div style=${{ padding: '16px 18px', borderBottom: '1px solid var(--bd2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style=${{ fontSize: 16, fontWeight: 700 }}>Channels</div>
            <div style=${{ display: 'flex', gap: 6 }}>
              <button class="msg-ghost" onClick=${onCreate}><i class="ti ti-plus"></i> New channel</button>
              <button class="msg-ibtn" style=${{ width: 32, height: 32 }} aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
            </div>
          </div>
          <div style=${{ padding: '12px 18px 10px' }}>
            <input placeholder="Search channels" value=${q} onInput=${e => setQ(e.target.value)} aria-label="Search channels"
              style=${{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid var(--bd2)', borderRadius: 10, background: 'var(--bg2)', color: 'var(--t1)', fontSize: 13 }}/>
          </div>
          <div class="msg-tabs">
            ${[['all', 'All'], ['client', 'Client'], ['agency', 'Agency'], ['mine', 'Joined']].map(([k, lb]) =>
              h`<button key=${k} class=${'msg-tab' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}>${lb}</button>`)}
          </div>
          <div style=${{ overflowY: 'auto', flex: 1 }}>
            ${rows === null
              ? h`<div style=${{ padding: 16 }}><${Skel} h=${54}/></div>`
              : shown.length === 0
                ? h`<div style=${{ padding: '26px 20px', textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No channels here.</div>`
                : shown.map(c => h`<div key=${c.id} class="msg-browse-row">
                    <${ConvAvatar} conv=${c} meId=${meId} size=${34}/>
                    <div style=${{ flex: 1, minWidth: 0 }}>
                      <div style=${{ fontSize: 13.5, fontWeight: 600, color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        ${'#' + (c.title || c.slug)}
                        ${c.is_private && h`<i class="ti ti-lock" style=${{ fontSize: 12, color: 'var(--t3)' }}></i>`}
                        ${c.archived_at && h`<span style=${{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700 }}>Archived</span>`}
                      </div>
                      <div style=${{ fontSize: 11.5, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ${(c.member_count || 0) + ' members'}${c.description ? ' · ' + c.description : ''}
                      </div>
                    </div>
                    ${c.is_member
                      ? h`<${React.Fragment}>
                          <button class="msg-ghost" onClick=${() => onOpen(c.id)}>Open</button>
                          ${c.system_key !== 'general' && h`<button class="msg-ghost" disabled=${busyId === c.id}
                            onClick=${async () => { setBusyId(c.id); await onLeave(c.id); setBusyId(null); load(); }}>Leave</button>`}
                        <//>`
                      : h`<button class="msg-ghost" style=${{ borderColor: '#ff00ee', color: '#c400bd' }} disabled=${busyId === c.id || !!c.archived_at}
                          onClick=${async () => { setBusyId(c.id); await onJoin(c.id); setBusyId(null); }}>Join</button>`}
                  </div>`)}
          </div>
        </div>
      </div>`;
    }

    // =========================================================================
    // QuickTaskModal — server-side create-task fallback (no tasks.js dialog)
    // =========================================================================
    function QuickTaskModal({ message, conv, meId, onCreate, onClose, fail }) {
      const [title, setTitle] = useState(() =>
        String(message.title || message.body || 'Task from chat').replace(/\s+/g, ' ').trim().slice(0, 120));
      const [desc, setDesc] = useState(() => (message.body || '')
        + '\n\n— From chat (' + convLabel(conv, meId) + ', ' + (message.sender_name || 'someone') + ')');
      const [linkClient, setLinkClient] = useState(true);
      const [busy, setBusy] = useState(false);

      const submit = async () => {
        if (!title.trim() || busy) return;
        setBusy(true);
        const fields = { title: title.trim(), description: desc };
        if (conv && conv.client_id && linkClient) fields.client_id = conv.client_id;
        try { await onCreate(fields); }
        catch (e) { fail(e, 'Could not create the task'); setBusy(false); }
      };

      return h`<div class="msg-modal-bg" onClick=${onClose}>
        <div class="msg-modal" onClick=${e => e.stopPropagation()}>
          <div style=${{ padding: '16px 18px', borderBottom: '1px solid var(--bd2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style=${{ fontSize: 16, fontWeight: 700 }}>New task from message</div>
            <button class="msg-ibtn" style=${{ width: 32, height: 32 }} aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div style=${{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
            <input value=${title} autoFocus onInput=${e => setTitle(e.target.value)} placeholder="Task name" aria-label="Task name"
              onKeyDown=${e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
              style=${{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--bd2)', borderRadius: 10, background: 'var(--bg2)', color: 'var(--t1)', fontSize: 14, fontWeight: 600 }}/>
            <textarea rows=${5} value=${desc} onInput=${e => setDesc(e.target.value)} aria-label="Description"
              style=${{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '10px 12px', border: '1px solid var(--bd2)', borderRadius: 10, background: 'var(--bg2)', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit' }}/>
            ${conv && conv.client_id && h`<label style=${{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
              <input type="checkbox" checked=${linkClient} onChange=${e => setLinkClient(e.target.checked)}/>
              Put it in ${conv.client_name || 'this client'}'s tasks
            </label>`}
          </div>
          <div style=${{ padding: 14, borderTop: '1px solid var(--bd2)' }}>
            <button class="btn-pri" style=${{ width: '100%' }} disabled=${!title.trim() || busy} onClick=${submit}>
              ${busy ? 'Creating…' : 'Create task'}</button>
          </div>
        </div>
      </div>`;
    }

    // =========================================================================
    // NewChatModal — pick a person (DM), build a group, or create a channel
    // =========================================================================
    function NewChatModal({ mode: mode0, v2, staff, meId, onDm, onGroup, onChannel, onClose }) {
      const [mode, setMode] = useState(mode0 === 'channel' && !v2 ? 'dm' : (mode0 || 'dm'));
      const [q, setQ] = useState('');
      const [sel, setSel] = useState({});        // group / channel selections
      const [title, setTitle] = useState('');
      const [desc, setDesc] = useState('');
      const [priv, setPriv] = useState(false);
      const people = (staff || []).filter(m => m.id !== meId
        && (!q.trim() || m.name.toLowerCase().includes(q.toLowerCase())));
      const selIds = Object.keys(sel).filter(k => sel[k]);
      const isChannel = mode === 'channel';
      const isGroup = mode === 'group';
      const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

      return h`<div class="msg-modal-bg" onClick=${onClose}>
        <div class="msg-modal" onClick=${e => e.stopPropagation()}>
          <div style=${{ padding: '16px 18px', borderBottom: '1px solid var(--bd2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style=${{ fontSize: 16, fontWeight: 700 }}>New ${isChannel ? 'channel' : isGroup ? 'group' : 'chat'}</div>
            <div style=${{ display: 'flex', gap: 6 }}>
              <button class="btn-sec" style=${{ padding: '5px 11px', fontSize: 12, ...(mode === 'dm' ? { borderColor: '#ff00ee', color: '#c400bd' } : {}) }} onClick=${() => setMode('dm')}>Direct</button>
              <button class="btn-sec" style=${{ padding: '5px 11px', fontSize: 12, ...(isGroup ? { borderColor: '#ff00ee', color: '#c400bd' } : {}) }} onClick=${() => setMode('group')}>Group</button>
              ${v2 && h`<button class="btn-sec" style=${{ padding: '5px 11px', fontSize: 12, ...(isChannel ? { borderColor: '#ff00ee', color: '#c400bd' } : {}) }} onClick=${() => setMode('channel')}>Channel</button>`}
            </div>
          </div>

          ${(isGroup || isChannel) && h`<div style=${{ padding: '12px 18px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder=${isChannel ? 'Channel name' : 'Group name'} value=${title} autoFocus
              aria-label=${isChannel ? 'Channel name' : 'Group name'} onInput=${e => setTitle(e.target.value)}
              style=${{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--bd2)', borderRadius: 10, background: 'var(--bg2)', color: 'var(--t1)', fontSize: 14 }}/>
            ${isChannel && h`<${React.Fragment}>
              ${slug && h`<div style=${{ fontSize: 11.5, color: 'var(--t3)' }}>${'#' + slug}</div>`}
              <input placeholder="What's it for? (optional)" value=${desc} aria-label="Description"
                onInput=${e => setDesc(e.target.value)}
                style=${{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid var(--bd2)', borderRadius: 10, background: 'var(--bg2)', color: 'var(--t1)', fontSize: 13 }}/>
              <label style=${{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
                <input type="checkbox" checked=${priv} onChange=${e => setPriv(e.target.checked)}/>
                Private — invite only
              </label>
            <//>`}
          </div>`}

          <div style=${{ padding: '12px 18px 0' }}>
            <input placeholder="Search people" value=${q} onInput=${e => setQ(e.target.value)} aria-label="Search people"
              style=${{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid var(--bd2)', borderRadius: 10, background: 'var(--bg2)', color: 'var(--t1)', fontSize: 13 }}/>
          </div>
          <div style=${{ overflowY: 'auto', padding: '8px 0', flex: 1 }}>
            ${people.length === 0 ? h`<div style=${{ padding: 20, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>No teammates found.</div>`
            : people.map(m => h`<div key=${m.id} class="msg-pick" role="button" tabIndex=${0}
                onClick=${() => mode === 'dm' ? onDm(m) : setSel(s => ({ ...s, [m.id]: !s[m.id] }))}>
                <${Av} i=${m.initials} c=${m.color} s=${34}/>
                <div style=${{ flex: 1 }}><div style=${{ fontWeight: 600, fontSize: 14 }}>${m.name}</div><div style=${{ fontSize: 11.5, color: 'var(--t3)' }}>${m.role_level || ''}</div></div>
                ${mode !== 'dm' && h`<div style=${{ width: 20, height: 20, borderRadius: 6, border: '2px solid ' + (sel[m.id] ? '#ff00ee' : 'var(--bd2)'), background: sel[m.id] ? '#ff00ee' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>${sel[m.id] && h`<i class="ti ti-check" style=${{ fontSize: 13, color: '#fff' }}></i>`}</div>`}
              </div>`)}
          </div>
          ${isGroup && h`<div style=${{ padding: 14, borderTop: '1px solid var(--bd2)' }}>
            <button class="btn-pri" style=${{ width: '100%' }} disabled=${!title.trim() || selIds.length === 0}
              onClick=${() => onGroup(title.trim(), selIds)}>Create group${selIds.length ? ' · ' + selIds.length : ''}</button>
          </div>`}
          ${isChannel && h`<div style=${{ padding: 14, borderTop: '1px solid var(--bd2)' }}>
            <button class="btn-pri" style=${{ width: '100%' }} disabled=${!title.trim()}
              onClick=${() => onChannel(title.trim(), desc.trim(), priv, selIds)}>Create channel${selIds.length ? ' · ' + selIds.length : ''}</button>
          </div>`}
        </div>
      </div>`;
    }

    return { MessagesApp, useChatUnread, useTeamChat };
  }

  window.AMS_MESSAGES = { buildMessages };
})();

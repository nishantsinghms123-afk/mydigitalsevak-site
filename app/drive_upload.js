/* ==========================================================================
 * drive_upload.js — "Upload final" on a post (migration 195, Edge Function drive-upload).
 *
 * window.AMS_DRIVE_UPLOAD.buildDriveUpload(deps) → registers into window.AMS_EXT:
 *   postMediaTools    upload   the button under the post's preview in TaskPanel (tasks.js PostThumb)
 *   settingsSections  drive_upload  connect the Google account that owns the brand folders (admin)
 *
 * The editor never names a file: the server names it from the post (brand + POSTING date) and files it the
 * team's way: a graphic straight in the brand folder, a reel in Reels, a carousel in Carousel/<DD.MM.YY>/
 * with numbered slides. The bytes go from the browser straight to Google (resumable session URLs from the
 * function's `prepare`); `finish` links the post, moves it to In Review and builds the preview.
 *
 * Fails closed and quiet: no migration / not connected → editors see nothing new; an admin sees a hint.
 * ==========================================================================*/
(function () {
  function buildDriveUpload(deps) {
    const d = deps || {};
    const React = d.React, h = d.h;
    const useState = d.useState, useEffect = d.useEffect, useRef = d.useRef, useCallback = d.useCallback;
    const rpcCall = d.rpcCall, SB_URL = d.SB_URL, SB_KEY = d.SB_KEY;
    const getSessionToken = d.getSessionToken || (() => localStorage.getItem('ams_session_token') || '');
    const CLIENT_ID = d.GOOGLE_LOGIN_CLIENT_ID;
    const taskBus = d.taskBus;
    if (!React || !h || !rpcCall || !SB_URL) return {};

    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key) !== k).concat(item);
    };
    const toast = (m) => { if (window.showToast) window.showToast(m); };

    // ---- styles --------------------------------------------------------------
    if (!document.getElementById('ams-drive-upload-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-drive-upload-styles';
      st.textContent = `
      .du-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:0 12px;border:1px solid var(--cu-bd,#e3e3e8);border-radius:6px;background:var(--cu-bg,#fff);color:var(--cu-t1,#1a1a1f);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
      .du-btn:hover{background:var(--cu-bg3,#f2f2f5)}
      .du-btn:focus-visible{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:2px}
      .du-btn[disabled]{opacity:.55;cursor:default}
      .du-btn.pri{background:var(--cu-accent,#ff00ee);border-color:var(--cu-accent,#ff00ee);color:#fff}
      .du-btn.pri:hover{background:#A8009C;border-color:#A8009C}
      .du-btn.danger{color:#b42318}
      .du-btn.wide{width:100%}
      .du-drop{display:flex;flex-direction:column;gap:6px;min-width:0}
      .du-drop.over .du-btn{border-style:dashed;border-color:var(--cu-accent,#ff00ee);background:rgba(255,0,238,.12)}
      .du-bar{height:6px;border-radius:3px;background:var(--cu-bg3,#ececf0);overflow:hidden}
      .du-bar i{display:block;height:100%;background:var(--cu-accent,#ff00ee);transition:width .2s}
      .du-note{font-size:11.5px;line-height:1.4;color:var(--cu-t3,#8b8b93);overflow-wrap:anywhere}
      .du-note.err{color:#b42318}
      .du-note.ok{color:#067647}
      html.dark .du-note.err{color:#ff8a80}
      html.dark .du-note.ok{color:#75e0a7}
      .du-modal{position:fixed;inset:0;z-index:2147483000;background:rgba(10,10,14,.45);display:flex;align-items:center;justify-content:center;padding:16px}
      .du-card{width:min(640px,100%);max-height:90vh;overflow:auto;background:var(--cu-bg,#fff);color:var(--cu-t1,#1a1a1f);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.25);padding:18px}
      .du-card h3{margin:0 0 4px;font-size:16px}
      .du-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;margin:14px 0}
      .du-slide{position:relative;border:1px solid var(--cu-bd,#e3e3e8);border-radius:8px;overflow:hidden;background:var(--cu-bg3,#f2f2f5)}
      .du-slide img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover}
      .du-slide .n{position:absolute;top:6px;left:6px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:rgba(0,0,0,.65);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}
      .du-slide .ctl{display:flex;justify-content:space-between;padding:4px}
      .du-slide .ctl button{width:30px;height:28px;border:none;border-radius:6px;background:transparent;color:var(--cu-t2,#55555e);cursor:pointer}
      .du-slide .ctl button:hover{background:var(--cu-bg,#fff);color:var(--cu-t1,#1a1a1f)}
      .du-slide .ctl button[disabled]{opacity:.3;cursor:default}
      .du-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
      .du-set{display:flex;flex-direction:column;gap:14px;max-width:760px}
      .du-box{border:1px solid var(--cu-bd,#e3e3e8);border-radius:10px;padding:16px;background:var(--cu-bg,#fff)}
      .du-box h4{margin:0 0 6px;font-size:14px;display:flex;align-items:center;gap:8px}
      .du-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .du-dot{width:9px;height:9px;border-radius:50%;background:#98a2b3;flex-shrink:0}
      .du-dot.on{background:#12b76a}.du-dot.warn{background:#f79009}
      .du-list{margin:10px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
      .du-list li{display:flex;gap:8px;align-items:flex-start;font-size:13px}
      .du-list i{margin-top:2px}
      .du-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
      `;
      document.head.appendChild(st);
    }

    // ---- server --------------------------------------------------------------
    async function edge(action, body) {
      const res = await fetch(SB_URL + '/functions/v1/drive-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SB_KEY, apikey: SB_KEY, 'x-ams-session': getSessionToken() || '' },
        body: JSON.stringify(Object.assign({ action }, body || {})),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.ok === false) throw new Error(out.error || ('The upload service answered ' + res.status + '.'));
      return out;
    }

    // One status for the whole page: the panel and Settings both read it.
    const store = { status: null, inflight: null, subs: new Set() };
    function loadStatus(force) {
      if (store.inflight) return store.inflight;
      if (store.status && !force) return Promise.resolve(store.status);
      // silentAuth: never pop the "signed out" prompt from here. Only a missing migration is remembered;
      // any other failure (not signed in yet, a role without content access, offline) is asked again later.
      store.inflight = rpcCall('drive_upload_status', {}, { silentAuth: true })
        .then(s => s || { connected: false })
        .catch(e => ({ connected: false, transient: true,
          missing: /PGRST202|could not find the function|forbidden/i.test(String((e && (e.message || e.code)) || e)) }))
        .then(s => {
          store.status = s.transient && !s.missing ? null : s;
          store.inflight = null; store.subs.forEach(fn => fn(s)); return s;
        });
      return store.inflight;
    }
    function useStatus() {
      const [s, setS] = useState(store.status);
      useEffect(() => { store.subs.add(setS); loadStatus(false); return () => { store.subs.delete(setS); }; }, []);
      return [s, () => loadStatus(true)];
    }

    // PUT one file to its Google session URL, reporting bytes sent.
    function putFile(url, file, onBytes, signal) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        if (file.type) xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onBytes(e.loaded); };
        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 201) {
            try { resolve(JSON.parse(xhr.responseText)); } catch (_) { reject(new Error('Google did not confirm the upload.')); }
          } else reject(new Error('Google stopped the upload (' + xhr.status + ').'));
        };
        xhr.onerror = () => reject(new Error('The connection dropped during the upload.'));
        xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled.'), { cancelled: true }));
        if (signal) signal.onabort = () => xhr.abort();
        xhr.send(file);
      });
    }

    const MAX_SLIDES = 20;                          // Instagram's carousel limit (was 10)
    const natural = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    const mb = (n) => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + ' GB' : Math.max(0.1, n / 1024 ** 2).toFixed(1) + ' MB';
    const ACCEPT = { reel: 'video/*,.mp4,.mov', carousel: 'image/jpeg,image/png,image/webp', creative: 'image/jpeg,image/png,image/webp' };

    // ---- carousel order --------------------------------------------------------
    function SlideOrder({ files, onCancel, onGo }) {
      const [list, setList] = useState(files);
      const [urls, setUrls] = useState([]);
      useEffect(() => {
        const u = list.map(f => URL.createObjectURL(f));
        setUrls(u);
        return () => u.forEach(x => URL.revokeObjectURL(x));
      }, [list]);
      useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, []);
      const move = (i, by) => {
        const j = i + by;
        if (j < 0 || j >= list.length) return;
        const next = list.slice(); const t = next[i]; next[i] = next[j]; next[j] = t; setList(next);
      };
      const drop = (i) => setList(list.filter((_, k) => k !== i));
      const tooMany = list.length > MAX_SLIDES, tooFew = list.length < 2;
      return h`<div class="du-modal" role="dialog" aria-modal="true" aria-labelledby="du-order-t" onClick=${(e) => { if (e.target === e.currentTarget) onCancel(); }}>
        <div class="du-card">
          <h3 id="du-order-t">Slide order</h3>
          <div class="du-note">Slide 1 is the cover. Use the arrows to change the order. The files are renamed 1, 2, 3 … in this order.</div>
          <div class="du-grid">
            ${list.map((f, i) => h`<div class="du-slide" key=${f.name + f.size + f.lastModified}>
              ${urls[i] ? h`<img src=${urls[i]} alt=${'Slide ' + (i + 1) + ': ' + f.name}/>` : null}
              <span class="n">${i + 1}</span>
              <div class="ctl">
                <button type="button" aria-label=${'Move slide ' + (i + 1) + ' earlier'} disabled=${i === 0} onClick=${() => move(i, -1)}><i class="ti ti-arrow-left"></i></button>
                <button type="button" aria-label=${'Remove slide ' + (i + 1)} onClick=${() => drop(i)}><i class="ti ti-x"></i></button>
                <button type="button" aria-label=${'Move slide ' + (i + 1) + ' later'} disabled=${i === list.length - 1} onClick=${() => move(i, 1)}><i class="ti ti-arrow-right"></i></button>
              </div>
            </div>`)}
          </div>
          ${tooMany ? h`<div class="du-note err" role="alert">Instagram allows ${MAX_SLIDES} slides. Remove ${list.length - MAX_SLIDES}.</div>` : null}
          ${tooFew ? h`<div class="du-note err" role="alert">A carousel needs at least 2 slides.</div>` : null}
          <div class="du-row" style=${{ marginTop: 12 }}>
            <button type="button" class="du-btn" onClick=${onCancel}>Cancel</button>
            <button type="button" class="du-btn pri" disabled=${tooMany || tooFew} onClick=${() => onGo(list)}>
              <i class="ti ti-cloud-upload"></i>Upload ${list.length} slides</button>
          </div>
        </div>
      </div>`;
    }

    // ---- the button on a post ---------------------------------------------------
    function UploadFinal({ task, row, link, onUploaded }) {
      const [status] = useStatus();
      const [phase, setPhase] = useState('idle');     // idle | order | preparing | uploading | finishing
      const [pct, setPct] = useState(0);
      const [msg, setMsg] = useState(null);            // { kind: 'err'|'ok', text }
      const [pending, setPending] = useState(null);    // carousel files waiting for their order
      const [over, setOver] = useState(false);
      const input = useRef(null);
      const ctl = useRef(null);
      const contentId = task && task.content_id;
      const type = (row && row.type) || (task && task.post && task.post.type) || 'creative';
      const busy = phase === 'preparing' || phase === 'uploading' || phase === 'finishing';

      // Leaving mid-upload loses it: ask first.
      useEffect(() => {
        if (!busy) return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
      }, [busy]);

      const upload = useCallback(async (files) => {
        setMsg(null); setPct(0); setPhase('preparing');
        const total = files.reduce((n, f) => n + f.size, 0) || 1;
        const sent = files.map(() => 0);
        let prep = null; const ids = [];
        ctl.current = { cancelled: false, xhr: {} };
        try {
          prep = await edge('prepare', { content_id: contentId, files: files.map(f => ({ name: f.name, size: f.size, type: f.type })) });
          setPhase('uploading');
          for (let i = 0; i < files.length; i++) {
            if (ctl.current.cancelled) throw Object.assign(new Error('Upload cancelled.'), { cancelled: true });
            const sig = {};
            ctl.current.xhr = sig;
            const res = await putFile(prep.uploads[i].url, files[i], (b) => {
              sent[i] = b; setPct(Math.min(99, Math.round(sent.reduce((a, x) => a + x, 0) * 100 / total)));
            }, sig);
            sent[i] = files[i].size;
            ids.push(res.id);
          }
          setPhase('finishing'); setPct(100);
          const out = await edge('finish', { content_id: contentId, file_ids: ids, folder_id: prep.folder_id });
          const where = prep.path + (prep.folder_id ? '' : ' / ' + out.name);
          setMsg({ kind: 'ok', text: 'Saved as ' + where + (out.moved_to_review ? '. Moved to In Review.' : '.') });
          toast(out.moved_to_review ? 'Uploaded to Drive · moved to In Review' : 'Uploaded to Drive');
          if (taskBus && task && task.id) taskBus.emit('task:changed', { id: task.id });
          if (onUploaded) await onUploaded(out);
        } catch (e) {
          if (prep && (ids.length || prep.folder_id)) edge('abort', { content_id: contentId, file_ids: ids, folder_id: prep.folder_id }).catch(() => { });
          setMsg({ kind: 'err', text: e && e.cancelled ? 'Upload cancelled. Nothing was saved.' : ((e && e.message) || 'The upload failed.') + ' Nothing was linked. Try again.' });
        } finally {
          setPhase('idle'); ctl.current = null;
        }
      }, [contentId, task && task.id, onUploaded]);

      const take = (list) => {
        const files = Array.from(list || []).filter(f => f && f.size >= 0);
        if (!files.length || busy) return;
        if (type === 'carousel') {
          if (files.length < 2) { setMsg({ kind: 'err', text: 'Pick all the slides together (2 to ' + MAX_SLIDES + ' images).' }); return; }
          setPending(files.slice().sort(natural)); setPhase('order'); return;
        }
        if (files.length > 1) { setMsg({ kind: 'err', text: type === 'reel' ? 'A reel takes one video.' : 'This post takes one image. For several slides, change the post type to Carousel.' }); return; }
        upload(files);
      };
      const cancel = () => {
        if (!ctl.current) return;
        ctl.current.cancelled = true;
        if (ctl.current.xhr && ctl.current.xhr.onabort) ctl.current.xhr.onabort();
      };

      if (!contentId || !status || status.missing) return null;
      if (!status.connected) {
        return status.can_connect
          ? h`<div class="du-note">Upload from here: connect Google Drive in Settings → Drive uploads.</div>`
          : null;
      }

      const label = type === 'carousel' ? (link ? 'Replace slides' : 'Upload slides') : (link ? 'Replace file' : 'Upload final');
      return h`<div class=${'du-drop' + (over ? ' over' : '')}
          onDragOver=${(e) => { if (busy) return; e.preventDefault(); setOver(true); }}
          onDragLeave=${() => setOver(false)}
          onDrop=${(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer && e.dataTransfer.files); }}>
        <input ref=${input} type="file" class="du-sr" tabIndex="-1" aria-hidden="true"
          accept=${ACCEPT[type] || 'image/jpeg,image/png,image/webp,video/*'} multiple=${type === 'carousel'}
          onChange=${(e) => { take(e.target.files); e.target.value = ''; }}/>
        ${busy ? h`<${React.Fragment}>
            <div class="du-bar" role="progressbar" aria-label="Upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct}><i style=${{ width: pct + '%' }}></i></div>
            <div class="du-note" role="status">${phase === 'preparing' ? 'Getting the Drive folder ready…' : phase === 'finishing' ? 'Linking and making the preview…' : 'Uploading… ' + pct + '%'}</div>
            ${phase === 'uploading' ? h`<button type="button" class="du-btn wide" onClick=${cancel}>Cancel</button>` : null}
          <//>`
          : h`<button type="button" class=${'du-btn wide' + (link ? '' : ' pri')} onClick=${() => input.current && input.current.click()}
              title="The file is named and filed in the brand’s Drive folder automatically">
              <i class="ti ti-cloud-upload"></i>${label}</button>`}
        ${!busy && !msg && !link ? h`<div class="du-note">${type === 'carousel' ? 'Pick all slides at once, or drop them here.' : 'Or drop the file here.'} It is named and filed in Drive for you.</div>` : null}
        ${msg ? h`<div class=${'du-note ' + msg.kind} role=${msg.kind === 'err' ? 'alert' : 'status'}>${msg.text}</div>` : null}
        ${phase === 'order' && pending ? h`<${SlideOrder} files=${pending}
            onCancel=${() => { setPending(null); setPhase('idle'); }}
            onGo=${(list) => { setPending(null); upload(list); }}/>` : null}
      </div>`;
    }

    // ---- Settings → Drive uploads ------------------------------------------------
    const DRIVE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive'];
    function googleCode() {
      return new Promise((resolve, reject) => {
        const oauth2 = window.google && window.google.accounts && window.google.accounts.oauth2;
        if (!CLIENT_ID || !oauth2 || !oauth2.initCodeClient) return reject(new Error('Google sign-in is still loading. Try again in a moment.'));
        let done = false;
        const client = oauth2.initCodeClient({
          client_id: CLIENT_ID, scope: DRIVE_SCOPES.join(' '), ux_mode: 'popup', redirect_uri: 'postmessage',
          include_granted_scopes: false,
          callback: (r) => { if (done) return; done = true; (r && r.code) ? resolve(r.code) : reject(new Error((r && r.error_description) || 'Google sign-in was cancelled.')); },
          error_callback: (e) => { if (done) return; done = true; reject(new Error(e && e.type === 'popup_failed_to_open' ? 'Allow pop-ups for this site, then try again.' : 'Google sign-in was cancelled.')); },
        });
        client.requestCode();
      });
    }

    function DriveUploadSettings({ showToast }) {
      const say = showToast || toast;
      const [status, refresh] = useStatus();
      const [busy, setBusy] = useState('');
      const [check, setCheck] = useState(null);
      const [err, setErr] = useState('');

      const runCheck = async () => {
        setBusy('check'); setErr('');
        try { const r = await edge('check', {}); setCheck(r.brands || []); }
        catch (e) { setErr(e.message || String(e)); }
        finally { setBusy(''); }
      };
      const connect = async () => {
        setBusy('connect'); setErr('');
        try {
          const code = await googleCode();
          const r = await edge('connect', { code });
          setCheck(r.brands || null);
          say('Drive connected as ' + (r.email || '…'));
          await refresh();
        } catch (e) { setErr(e.message || String(e)); }
        finally { setBusy(''); }
      };
      const disconnect = async () => {
        if (!window.confirm('Disconnect Google Drive? The Upload button disappears from posts until it is connected again. Files already in Drive stay.')) return;
        setBusy('off');
        try { await rpcCall('drive_upload_disconnect', {}); setCheck(null); await refresh(); say('Drive disconnected'); }
        catch (e) { setErr(e.message || String(e)); }
        finally { setBusy(''); }
      };

      if (!status) return h`<div class="du-set"><div class="du-box"><div class="du-note">Loading…</div></div></div>`;
      if (status.missing) return h`<div class="du-set"><div class="du-box"><div class="du-note">Drive uploads become available once migration 195 is applied.</div></div></div>`;
      const admin = !!status.can_connect;
      const expired = status.last_error === 'reauth_required';
      const bad = (check || []).filter(b => !b.ok);

      return h`<div class="du-set">
        <div class="du-box">
          <h4><i class="ti ti-brand-google-drive" style=${{ color: '#1a73e8' }}></i>Upload finals from the dashboard</h4>
          <div class="du-note" style=${{ marginBottom: 12 }}>
            Editors open a post and tap <b>Upload final</b>. The file is named with the brand and the <b>posting date</b>, saved in the brand's Drive folder (graphics in the folder, reels in Reels, carousels in Carousel / date), linked to the post, and the post moves to In Review. Nobody types a file name.
          </div>
          ${status.connected ? h`<div class="du-line">
              <span class=${'du-dot ' + (expired || status.last_error ? 'warn' : 'on')}></span>
              <div style=${{ flex: 1, minWidth: 200 }}>
                <div style=${{ fontWeight: 600, fontSize: 13.5 }}>Saving as ${status.email || 'the connected account'}</div>
                <div class="du-note">${expired ? 'The sign-in has expired. Reconnect to keep uploads working.'
                  : status.last_error ? 'Last problem: ' + status.last_error
                  : 'Connected by ' + (status.connected_by || '—') + (status.last_used_at ? ' · last upload ' + new Date(status.last_used_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '')}</div>
              </div>
              <button type="button" class="du-btn" disabled=${!!busy} onClick=${runCheck}><i class=${'ti ' + (busy === 'check' ? 'ti-loader-2' : 'ti-folder-check')}></i>Check brand folders</button>
              ${admin ? h`<${React.Fragment}><button type="button" class=${'du-btn' + (expired ? ' pri' : '')} disabled=${!!busy} onClick=${connect}>${expired ? 'Reconnect' : 'Change account'}</button>
                <button type="button" class="du-btn danger" disabled=${!!busy} onClick=${disconnect}>Disconnect</button><//>` : null}
            </div>`
            : admin ? h`<${React.Fragment}>
              <div class="du-note" style=${{ marginBottom: 10 }}>Sign in once with the Google account that <b>owns</b> the brand folders, and tick the Drive box on Google's screen. If Google warns that the app isn't verified, choose Advanced → Continue: it is our own app.</div>
              <button type="button" class="du-btn pri" disabled=${!!busy} onClick=${connect}>
                <i class=${'ti ' + (busy === 'connect' ? 'ti-loader-2' : 'ti-brand-google')}></i>${busy === 'connect' ? 'Waiting for Google…' : 'Connect Google Drive'}</button>
            <//>`
            : h`<div class="du-note">Not switched on yet. An admin connects it here.</div>`}
          ${err ? h`<div class="du-note err" role="alert" style=${{ marginTop: 10 }}>${err}</div>` : null}
        </div>
        ${check ? h`<div class="du-box">
          <h4><i class="ti ti-folders"></i>Brand folders ${bad.length ? h`<span class="du-note err">· ${bad.length} need attention</span>` : h`<span class="du-note ok">· all ready</span>`}</h4>
          <ul class="du-list">
            ${check.map(b => h`<li key=${b.name}>
              <i class=${'ti ' + (b.ok ? 'ti-circle-check' : 'ti-alert-triangle')} style=${{ color: b.ok ? '#12b76a' : '#f79009' }}></i>
              <div><b>${b.name}</b>${b.ok ? h`<span class="du-note"> · ${b.folder}</span>` : h`<div class="du-note err">${b.problem}</div>`}</div>
            </li>`)}
          </ul>
        </div>` : null}
      </div>`;
    }

    reg('postMediaTools', { id: 'upload', order: 10, Component: UploadFinal });
    reg('settingsSections', {
      id: 'drive_upload', label: 'Drive uploads', icon: 'ti-cloud-upload', order: 63,
      roles: (r) => r === 'admin' || r === 'manager', Component: DriveUploadSettings,
    });

    return { UploadFinal, DriveUploadSettings, SlideOrder };
  }

  window.AMS_DRIVE_UPLOAD = { buildDriveUpload };
})();

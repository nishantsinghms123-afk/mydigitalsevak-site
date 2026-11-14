/* ============================================================================
 * clips.js — Clips (screen / voice recording), talk-to-text and link previews
 *
 *   window.AMS_CLIPS.buildClips(deps) → { recordClip, startDictation, ClipsHost,
 *     ClipPlayer, isClipAttachment, LinkPreview, LinkPreviewList, extractUrls,
 *     detectProvider, fetchLinkPreview }
 *
 * Registers (window.AMS_EXT, contract v2 §2):
 *   composerTools  "Record clip" (id clip) · "Dictate" (id dictate)
 *
 * Recording = getDisplayMedia (+ getUserMedia mic, mixed through WebAudio) →
 * MediaRecorder (pause / resume / stop, 5-minute cap) → preview → upload to the
 * public storage bucket `clips` (UUID paths, migration 104) → attachment meta
 *   { name, url, path, mime, size, kind:'clip', duration_ms, width, height, bucket:'clips' }
 * handed to the composer's addAttachment().
 *
 * Overlays (recorder, dictation) render through ClipsHost. index.html may either
 * mount <ClipsHost/> once, or pass `createRoot` (react-dom/client) in deps — the
 * module then mounts its own host on first use. Same React instance either way.
 *
 * Link previews call the `link-preview` Edge Function (session token, JWT off).
 * Everything fails open: no function / bucket / browser API ⇒ plain link or a
 * friendly unsupported state, never a crash.
 * ==========================================================================*/
(function () {
  function buildClips(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo, supabase, SB_URL, SB_KEY } = deps;
    const Fragment = React.Fragment;
    const createRoot = deps.createRoot || null;

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-clips-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-clips-styles';
      st.textContent = `
      .ck-root,.ck-root *{box-sizing:border-box}
      .ck-root{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--cu-t1,#1f1f23)}
      .ck-bg{position:fixed;inset:0;z-index:1300;background:rgba(10,10,14,.5);display:flex;align-items:center;justify-content:center;padding:16px;animation:ck-fade .15s ease-out}
      @keyframes ck-fade{from{opacity:0}to{opacity:1}}
      .ck-modal{width:min(620px,100%);max-height:calc(100dvh - 32px);overflow:auto;background:var(--cu-bg,#fff);border-radius:12px;box-shadow:var(--cu-shadow,0 10px 30px rgba(0,0,0,.25));display:flex;flex-direction:column}
      .ck-hd{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--cu-bd,#e8e8eb)}
      .ck-hd h2{font-size:15px;font-weight:600;margin:0;flex:1;min-width:0}
      .ck-body{padding:16px}
      .ck-foot{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--cu-bd,#e8e8eb);flex-wrap:wrap}
      .ck-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:6px;border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:600 13px/1 inherit;font-family:inherit;cursor:pointer;white-space:nowrap}
      .ck-btn:hover{background:var(--cu-bg3,#efeff1)}
      .ck-btn:disabled{opacity:.5;cursor:not-allowed}
      .ck-btn.pri{background:var(--cu-accent,#ff00ee);border-color:var(--cu-accent,#ff00ee);color:#fff}
      .ck-btn.pri:hover{filter:brightness(.94)}
      .ck-btn.rec{background:#e5484d;border-color:#e5484d;color:#fff}
      .ck-btn.ghost{border-color:transparent;background:transparent;color:var(--cu-t2,#5c5c66)}
      .ck-ibtn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;border:none;background:transparent;color:var(--cu-t2,#5c5c66);cursor:pointer;font-size:17px;padding:0;flex-shrink:0}
      .ck-ibtn:hover{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23)}
      .ck-root button:focus-visible,.ck-root input:focus-visible,.ck-root textarea:focus-visible,.ck-root a:focus-visible{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:1px}
      .ck-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .ck-mode{border:1px solid var(--cu-bd,#e8e8eb);border-radius:10px;background:var(--cu-bg,#fff);padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;font:500 13px inherit;font-family:inherit;color:var(--cu-t1,#1f1f23);text-align:center}
      .ck-mode i{font-size:24px;color:var(--cu-t2,#5c5c66)}
      .ck-mode small{font-size:11px;color:var(--cu-t3,#8e8e99);font-weight:400}
      .ck-mode.on{border-color:var(--cu-accent,#ff00ee);background:var(--cu-accent-fog,rgba(255,0,238,.08))}
      .ck-mode.on i{color:var(--cu-accent-ink,#a8009c)}
      .ck-mode:disabled{opacity:.45;cursor:not-allowed}
      .ck-note{font-size:12px;color:var(--cu-t3,#8e8e99);line-height:1.5;margin-top:10px}
      .ck-err{font-size:12.5px;color:#e5484d;line-height:1.45;margin-top:10px}
      .ck-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .ck-input{width:100%;height:32px;padding:0 10px;border:1px solid var(--cu-bd2,#d6d6db);border-radius:6px;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:13px inherit;font-family:inherit}
      .ck-input:focus{outline:none;border-color:var(--cu-accent,#ff00ee)}
      .ck-bar{position:fixed;left:16px;bottom:16px;z-index:1300;display:flex;align-items:center;gap:6px;padding:6px 8px 6px 12px;border-radius:22px;background:#121014;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35);font:600 13px Inter,system-ui,sans-serif}
      .ck-bar .ck-ibtn{color:#e9e7ee}
      .ck-bar .ck-ibtn:hover{background:rgba(255,255,255,.12);color:#fff}
      .ck-dot{width:10px;height:10px;border-radius:50%;background:#e5484d;animation:ck-pulse 1.2s ease-in-out infinite;flex-shrink:0}
      .ck-dot.paused{animation:none;background:#f5a623}
      @keyframes ck-pulse{50%{opacity:.35}}
      .ck-clock{font-variant-numeric:tabular-nums;min-width:74px}
      .ck-lvl{width:36px;height:6px;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden}
      .ck-lvl>div{height:100%;background:#30a46c;transition:width .08s linear}
      /* player */
      .ck-player{position:relative;border:1px solid var(--cu-bd,#e8e8eb);border-radius:10px;overflow:hidden;background:#0d0c10;max-width:100%}
      .ck-player video{display:block;width:100%;max-height:min(420px,60vh);background:#000}
      .ck-player.audio{background:var(--cu-bg2,#f7f7f8)}
      .ck-ctrl{display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--cu-bg,#fff);border-top:1px solid var(--cu-bd,#e8e8eb);min-width:0}
      .ck-player.audio .ck-ctrl{border-top:none;background:transparent}
      .ck-time{font-size:11.5px;color:var(--cu-t2,#5c5c66);font-variant-numeric:tabular-nums;white-space:nowrap}
      .ck-seek{flex:1;min-width:40px;accent-color:var(--cu-accent,#ff00ee);height:18px}
      .ck-speed{font:600 11px inherit;font-family:inherit;color:var(--cu-t2,#5c5c66);background:var(--cu-bg3,#efeff1);border:none;border-radius:4px;height:22px;padding:0 6px;cursor:pointer}
      .ck-tr{border-top:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff)}
      .ck-tr summary{list-style:none;cursor:pointer;padding:6px 10px;font-size:12px;color:var(--cu-t2,#5c5c66);display:flex;align-items:center;gap:6px}
      .ck-tr summary::-webkit-details-marker{display:none}
      .ck-tr p{margin:0;padding:0 10px 10px;font-size:12px;color:var(--cu-t3,#8e8e99)}
      .ck-name{font-size:12px;color:var(--cu-t2,#5c5c66);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
      .ck-big-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-60%);width:56px;height:56px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:26px;display:flex;align-items:center;justify-content:center;cursor:pointer}
      /* dictation */
      .ck-dict{position:fixed;right:16px;bottom:16px;z-index:1300;width:min(380px,calc(100vw - 32px));background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);border-radius:12px;box-shadow:var(--cu-shadow,0 10px 30px rgba(0,0,0,.25));display:flex;flex-direction:column;animation:ck-fade .15s ease-out}
      .ck-mic{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:26px;background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23);flex-shrink:0}
      .ck-mic.on{background:#e5484d;color:#fff;box-shadow:0 0 0 6px rgba(229,72,77,.18)}
      .ck-seg{display:inline-flex;border:1px solid var(--cu-bd,#e8e8eb);border-radius:6px;overflow:hidden}
      .ck-seg button{border:none;background:var(--cu-bg,#fff);color:var(--cu-t2,#5c5c66);font:500 12px inherit;font-family:inherit;padding:0 10px;height:28px;cursor:pointer}
      .ck-seg button+button{border-left:1px solid var(--cu-bd,#e8e8eb)}
      .ck-seg button.on{background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c);font-weight:600}
      .ck-ta{width:100%;min-height:96px;max-height:220px;resize:vertical;border:1px solid var(--cu-bd2,#d6d6db);border-radius:8px;padding:8px 10px;font:14px/1.5 inherit;font-family:inherit;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23)}
      .ck-ta:focus{outline:none;border-color:var(--cu-accent,#ff00ee)}
      .ck-interim{color:var(--cu-t3,#8e8e99);font-style:italic;font-size:13px;min-height:18px;margin-top:6px}
      /* link preview */
      .ck-lp{display:flex;gap:0;border:1px solid var(--cu-bd,#e8e8eb);border-left:3px solid var(--ck-lp-c,var(--cu-bd2,#d6d6db));border-radius:8px;background:var(--cu-bg,#fff);overflow:hidden;max-width:520px;min-width:0;text-decoration:none;color:inherit}
      .ck-lp:hover{background:var(--cu-bg2,#f7f7f8)}
      .ck-lp-main{flex:1;min-width:0;padding:8px 10px;display:flex;flex-direction:column;gap:3px}
      .ck-lp-site{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--cu-t3,#8e8e99);min-width:0}
      .ck-lp-site span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ck-lp-site img{width:14px;height:14px;border-radius:3px}
      .ck-lp-t{font-size:13px;font-weight:600;color:var(--cu-t1,#1f1f23);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
      .ck-lp-d{font-size:12px;color:var(--cu-t2,#5c5c66);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
      .ck-lp-img{width:112px;flex-shrink:0;background:var(--cu-bg3,#efeff1);position:relative}
      .ck-lp-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      .ck-lp.compact .ck-lp-img{width:72px}
      .ck-lp-acts{display:flex;gap:6px;margin-top:4px;flex-wrap:wrap}
      .ck-lp-chip{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:11px;border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);font:600 11px inherit;font-family:inherit;color:var(--cu-t2,#5c5c66);cursor:pointer}
      .ck-lp-chip:hover{color:var(--cu-accent-ink,#a8009c);border-color:var(--cu-accent,#ff00ee)}
      .ck-embed{position:relative;width:100%;max-width:560px;aspect-ratio:16/9;border-radius:8px;overflow:hidden;border:1px solid var(--cu-bd,#e8e8eb);background:#000;margin-top:6px}
      .ck-embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
      .ck-skel{height:10px;border-radius:4px;background:var(--cu-bg3,#efeff1);animation:ck-pulse 1.4s ease-in-out infinite}
      @media(max-width:520px){.ck-modes{grid-template-columns:1fr}.ck-mode{flex-direction:row;justify-content:flex-start;padding:10px 12px}.ck-lp-img{width:72px}.ck-bar{left:8px;right:8px;bottom:8px;justify-content:space-between}}
      @media(prefers-reduced-motion:reduce){.ck-bg,.ck-dict{animation:none}.ck-dot,.ck-skel{animation:none}.ck-lvl>div{transition:none}}
      `;
      document.head.appendChild(st);
    }

    // ---- registry + helpers --------------------------------------------------
    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => { const k = item.id || item.key || item.type; EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item); };

    const CLIP_BUCKET = 'clips';
    const MAX_MS = 5 * 60 * 1000;
    const MAX_BYTES = 250 * 1024 * 1024;
    const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
      : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2));
    const fmtClock = (ms) => { const s = Math.max(0, Math.floor((ms || 0) / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const fmtSize = (n) => { n = Number(n) || 0; if (n < 1024) return n + ' B'; if (n < 1048576) return Math.round(n / 1024) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; };
    const getToken = () => { try { return localStorage.getItem('ams_session_token') || ''; } catch (_) { return ''; } };
    const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { } };
    const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };

    const media = navigator.mediaDevices || null;
    const canScreen = () => !!(media && media.getDisplayMedia && window.MediaRecorder);
    const canVoice = () => !!(media && media.getUserMedia && window.MediaRecorder);
    const pickMime = (kind) => {
      const list = kind === 'audio'
        ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
        : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
      if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
      return list.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; } }) || '';
    };
    const extFor = (mime) => /mp4/.test(mime) ? (/^audio/.test(mime) ? 'm4a' : 'mp4') : /ogg/.test(mime) ? 'ogg' : 'webm';
    const mediaErrorText = (e, what) => {
      const n = e && (e.name || '');
      if (n === 'NotAllowedError' || n === 'SecurityError') return what === 'mic' ? 'Microphone access was blocked. Allow it from the address bar and try again.' : 'Screen sharing was cancelled or blocked.';
      if (n === 'NotFoundError' || n === 'OverconstrainedError') return what === 'mic' ? 'No microphone was found.' : 'No screen source is available.';
      if (n === 'NotReadableError') return 'The device is busy in another app. Close it and try again.';
      return (e && e.message) || 'Could not start recording.';
    };

    // ---- overlay host -----------------------------------------------------------
    const overlays = { list: [], subs: new Set(), hosts: 0, autoRoot: null };
    const notify = () => overlays.subs.forEach(fn => { try { fn(overlays.list.slice()); } catch (_) { } });
    function openOverlay(render) {
      const id = uuid();
      overlays.list = overlays.list.concat({ id, render });
      ensureHost(); notify();
      return () => { overlays.list = overlays.list.filter(o => o.id !== id); notify(); };
    }
    function ClipsHost() {
      const [list, setList] = useState(overlays.list.slice());
      useEffect(() => {
        overlays.hosts++; overlays.subs.add(setList); setList(overlays.list.slice());
        return () => { overlays.hosts--; overlays.subs.delete(setList); };
      }, []);
      return h`<${Fragment}>${list.map(o => h`<${Fragment} key=${o.id}>${o.render()}<//>`)}<//>`;
    }
    function ensureHost() {
      if (overlays.hosts > 0 || overlays.autoRoot) return true;
      if (!createRoot) { console.warn('[clips] no ClipsHost mounted and no createRoot in deps — overlay cannot render'); return false; }
      const el = document.createElement('div');
      el.id = 'ams-clips-host';
      document.body.appendChild(el);
      overlays.autoRoot = createRoot(el);
      overlays.autoRoot.render(h`<${ClipsHost}/>`);
      return true;
    }

    // =========================================================================
    // ClipPlayer — video / audio clip with compact controls + transcript slot
    // =========================================================================
    function isClipAttachment(att) {
      if (!att) return false;
      if (att.kind === 'clip') return true;
      const mime = String(att.mime || '');
      return (/^video\//.test(mime) || /^audio\//.test(mime)) && /\/clips\//.test(String(att.url || ''));
    }

    function ClipPlayer({ url, mime, name, duration_ms, size, compact, showTranscript = true }) {
      const ref = useRef(null);
      const isAudio = /^audio\//.test(String(mime || '')) || /\.(m4a|ogg|mp3)$/i.test(String(url || ''));
      const [playing, setPlaying] = useState(false);
      const [cur, setCur] = useState(0);
      const [dur, setDur] = useState(duration_ms ? duration_ms / 1000 : 0);
      const [rate, setRate] = useState(1);
      const [muted, setMuted] = useState(false);
      const [failed, setFailed] = useState(false);
      const fixing = useRef(false);

      useEffect(() => { setFailed(false); setCur(0); setPlaying(false); }, [url]);

      const onMeta = () => {
        const el = ref.current; if (!el) return;
        if (!isFinite(el.duration) || isNaN(el.duration)) {
          // MediaRecorder webm has no duration header — seek far to force the browser to compute it
          fixing.current = true;
          try { el.currentTime = 1e101; } catch (_) { fixing.current = false; }
        } else setDur(el.duration);
      };
      const onTime = () => {
        const el = ref.current; if (!el) return;
        if (fixing.current) {
          fixing.current = false;
          if (isFinite(el.duration)) setDur(el.duration);
          try { el.currentTime = 0; } catch (_) { }
          return;
        }
        setCur(el.currentTime || 0);
        if (isFinite(el.duration) && el.duration && Math.abs(el.duration - dur) > 0.5) setDur(el.duration);
      };
      const toggle = () => {
        const el = ref.current; if (!el) return;
        if (el.paused) { const p = el.play(); if (p && p.catch) p.catch(() => setFailed(true)); } else el.pause();
      };
      const seek = (t) => { const el = ref.current; if (!el) return; const max = dur || el.duration || 0; try { el.currentTime = Math.max(0, Math.min(t, max || t)); } catch (_) { } };
      const cycleRate = () => { const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : rate === 2 ? 0.75 : 1; setRate(next); if (ref.current) ref.current.playbackRate = next; };
      const fullscreen = () => { const el = ref.current; if (!el) return; const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitEnterFullscreen; if (fn) try { fn.call(el); } catch (_) { } };
      const onKey = (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) return;
        if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); seek(cur + 5); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(cur - 5); }
      };

      if (!url) return null;
      if (failed) {
        return h`<div class="ck-root ck-player audio" style=${{ padding: 10 }}>
          <div class="ck-row" style=${{ fontSize: 12.5, color: 'var(--cu-t2)' }}>
            <i class="ti ti-alert-triangle" style=${{ color: '#f5a623' }}></i>
            <span style=${{ flex: 1, minWidth: 0 }}>This clip can't play in this browser.</span>
            <a class="ck-btn" href=${url} target="_blank" rel="noopener noreferrer"><i class="ti ti-download"></i>Download</a>
          </div>
        </div>`;
      }
      const mediaProps = { ref, src: url, preload: 'metadata', onLoadedMetadata: onMeta, onTimeUpdate: onTime, onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onEnded: () => setPlaying(false), onError: () => setFailed(true), muted, playsInline: true };
      return h`<div class=${'ck-root ck-player' + (isAudio ? ' audio' : '')} tabIndex=${0} onKeyDown=${onKey}
          aria-label=${(isAudio ? 'Voice clip' : 'Screen clip') + (name ? ': ' + name : '')} style=${compact ? { maxWidth: 360 } : null}>
        ${isAudio ? h`<audio ...${mediaProps}></audio>` : h`<${Fragment}>
          <video ...${mediaProps} onClick=${toggle}></video>
          ${!playing && cur < 0.05 ? h`<button type="button" class="ck-big-play" aria-label="Play clip" onClick=${toggle}><i class="ti ti-player-play-filled"></i></button>` : null}
        <//>`}
        <div class="ck-ctrl">
          <button type="button" class="ck-ibtn" aria-label=${playing ? 'Pause' : 'Play'} onClick=${toggle}>
            <i class=${'ti ' + (playing ? 'ti-player-pause-filled' : 'ti-player-play-filled')}></i>
          </button>
          ${isAudio ? h`<i class="ti ti-microphone" style=${{ color: 'var(--cu-t3)', fontSize: 14 }} aria-hidden="true"></i>` : null}
          <span class="ck-time">${fmtClock(cur * 1000)} / ${dur ? fmtClock(dur * 1000) : '–:––'}</span>
          <input type="range" class="ck-seek" min="0" max=${Math.max(dur, 0.1)} step="0.1" value=${Math.min(cur, dur || cur)}
            aria-label="Seek" onInput=${e => seek(parseFloat(e.target.value))}/>
          <button type="button" class="ck-speed" aria-label=${'Playback speed ' + rate + 'x'} onClick=${cycleRate}>${rate}x</button>
          <button type="button" class="ck-ibtn" aria-label=${muted ? 'Unmute' : 'Mute'} onClick=${() => setMuted(m => !m)}>
            <i class=${'ti ' + (muted ? 'ti-volume-off' : 'ti-volume')}></i>
          </button>
          ${!isAudio ? h`<button type="button" class="ck-ibtn" aria-label="Full screen" onClick=${fullscreen}><i class="ti ti-maximize"></i></button>` : null}
          <a class="ck-ibtn" href=${url} target="_blank" rel="noopener noreferrer" aria-label="Open or download clip"><i class="ti ti-download"></i></a>
        </div>
        ${showTranscript && !compact ? h`<details class="ck-tr">
          <summary><i class="ti ti-file-text"></i>Transcript${name ? h`<span class="ck-name" style=${{ marginLeft: 'auto' }}>${name}${size ? ' · ' + fmtSize(size) : ''}</span>` : null}</summary>
          <p>Transcripts aren't generated for clips yet. Use Dictate in the composer to add spoken notes as text.</p>
        </details>` : null}
      </div>`;
    }

    // =========================================================================
    // Recorder
    // =========================================================================
    function ClipRecorder({ onDone, initialMode }) {
      const screenOk = canScreen();
      const voiceOk = canVoice();
      const [mode, setMode] = useState(() => initialMode === 'voice' || !screenOk ? 'voice' : (lsGet('ams_clip_mode', 'screen_mic') === 'screen' ? 'screen' : 'screen_mic'));
      const [phase, setPhase] = useState('setup');   // setup | starting | recording | preview | uploading
      const [paused, setPaused] = useState(false);
      const [elapsed, setElapsed] = useState(0);
      const [level, setLevel] = useState(0);
      const [error, setError] = useState('');
      const [note, setNote] = useState('');
      const [blob, setBlob] = useState(null);
      const [blobUrl, setBlobUrl] = useState('');
      const [title, setTitle] = useState('');
      const [dims, setDims] = useState({ w: 0, h: 0 });
      const st = useRef({ rec: null, streams: [], ctx: null, chunks: [], acc: 0, segStart: 0, timer: null, raf: null, mime: '', capped: false, cancelled: false });
      const primary = useRef(null);

      useEffect(() => { if (primary.current) try { primary.current.focus(); } catch (_) { } }, [phase]);

      const cleanup = useCallback(() => {
        const s = st.current;
        clearInterval(s.timer); s.timer = null;
        if (s.raf) cancelAnimationFrame(s.raf); s.raf = null;
        s.streams.forEach(ms => { try { ms.getTracks().forEach(t => t.stop()); } catch (_) { } });
        s.streams = [];
        if (s.ctx) { try { s.ctx.close(); } catch (_) { } s.ctx = null; }
      }, []);
      useEffect(() => () => { st.current.cancelled = true; try { if (st.current.rec && st.current.rec.state !== 'inactive') st.current.rec.stop(); } catch (_) { } cleanup(); }, [cleanup]);
      useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

      const now = () => performance.now();
      const elapsedNow = () => { const s = st.current; return s.acc + (s.segStart ? now() - s.segStart : 0); };

      const stop = useCallback(() => {
        const s = st.current;
        if (s.segStart) { s.acc += now() - s.segStart; s.segStart = 0; }
        try { if (s.rec && s.rec.state !== 'inactive') s.rec.stop(); } catch (_) { }
      }, []);

      const start = async () => {
        setError(''); setNote('');
        const s = st.current;
        const wantScreen = mode !== 'voice';
        const wantMic = mode !== 'screen';
        setPhase('starting');
        let display = null, mic = null;
        try {
          if (wantScreen) {
            display = await media.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true });
            s.streams.push(display);
          }
          if (wantMic) {
            try {
              mic = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
              s.streams.push(mic);
            } catch (e) {
              if (!wantScreen) throw Object.assign(e, { _what: 'mic' });
              setNote(mediaErrorText(e, 'mic') + ' Recording the screen without your voice.');
            }
          }
        } catch (e) {
          cleanup(); setPhase('setup');
          if (e && e.name === 'NotAllowedError' && wantScreen && !e._what) setError('Screen sharing was cancelled.');
          else setError(mediaErrorText(e, e && e._what));
          return;
        }

        // mix system audio + mic into one track (MediaRecorder records a single audio track reliably)
        const videoTracks = display ? display.getVideoTracks() : [];
        const audioSources = [display, mic].filter(ms => ms && ms.getAudioTracks().length);
        let audioTracks = [];
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC && audioSources.length) {
            const ctx = new AC(); s.ctx = ctx;
            const dest = ctx.createMediaStreamDestination();
            audioSources.forEach(ms => ctx.createMediaStreamSource(new MediaStream(ms.getAudioTracks())).connect(dest));
            audioTracks = dest.stream.getAudioTracks();
            if (mic) {
              const an = ctx.createAnalyser(); an.fftSize = 512;
              ctx.createMediaStreamSource(new MediaStream(mic.getAudioTracks())).connect(an);
              const buf = new Uint8Array(an.frequencyBinCount);
              const tick = () => { an.getByteTimeDomainData(buf); let peak = 0; for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128)); setLevel(Math.min(1, peak / 64)); s.raf = requestAnimationFrame(tick); };
              if (!reducedMotion()) s.raf = requestAnimationFrame(tick);
            }
          }
        } catch (_) { audioTracks = []; }
        if (!audioTracks.length) audioTracks = audioSources.flatMap(ms => ms.getAudioTracks()).slice(0, 1);

        const stream = new MediaStream([...videoTracks, ...audioTracks]);
        const mime = pickMime(wantScreen ? 'video' : 'audio');
        let rec;
        try {
          rec = new MediaRecorder(stream, Object.assign(mime ? { mimeType: mime } : {}, wantScreen ? { videoBitsPerSecond: 2500000, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 }));
        } catch (e) {
          cleanup(); setPhase('setup'); setError('This browser cannot record this kind of clip.'); return;
        }
        if (videoTracks[0]) {
          const set = videoTracks[0].getSettings ? videoTracks[0].getSettings() : {};
          setDims({ w: set.width || 0, h: set.height || 0 });
          videoTracks[0].addEventListener('ended', () => stop());   // browser "Stop sharing"
        }
        s.chunks = []; s.acc = 0; s.segStart = now(); s.mime = rec.mimeType || mime || (wantScreen ? 'video/webm' : 'audio/webm'); s.capped = false; s.rec = rec;
        rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) s.chunks.push(ev.data); };
        rec.onerror = (ev) => { setError('Recording stopped unexpectedly: ' + ((ev && ev.error && ev.error.message) || 'unknown error')); stop(); };
        rec.onstop = () => {
          const total = s.acc;
          cleanup();
          if (s.cancelled) return;
          const b = new Blob(s.chunks, { type: s.mime.split(';')[0] });
          s.chunks = [];
          if (!b.size) { setPhase('setup'); setError('Nothing was recorded. Try again.'); return; }
          setElapsed(total);
          setBlob(b);
          setBlobUrl(URL.createObjectURL(b));
          setTitle((wantScreen ? 'Screen clip' : 'Voice clip') + ' — ' + new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }));
          if (s.capped) setNote('Clips are limited to 5 minutes — recording stopped automatically.');
          setPhase('preview');
        };
        try { rec.start(1000); } catch (e) { cleanup(); setPhase('setup'); setError('Could not start the recorder.'); return; }
        lsSet('ams_clip_mode', mode);
        setPaused(false); setElapsed(0); setPhase('recording');
        s.timer = setInterval(() => {
          const ms = elapsedNow();
          setElapsed(ms);
          if (ms >= MAX_MS && s.rec && s.rec.state !== 'inactive') { s.capped = true; stop(); }
        }, 250);
      };

      const pause = () => {
        const s = st.current; if (!s.rec) return;
        try {
          if (s.rec.state === 'recording') { s.rec.pause(); s.acc += now() - s.segStart; s.segStart = 0; setPaused(true); }
          else if (s.rec.state === 'paused') { s.rec.resume(); s.segStart = now(); setPaused(false); }
        } catch (_) { }
      };
      const cancelRecording = () => {
        const s = st.current; s.cancelled = true;
        try { if (s.rec && s.rec.state !== 'inactive') s.rec.stop(); } catch (_) { }
        cleanup(); onDone(null);
      };
      const retake = () => {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        setBlob(null); setBlobUrl(''); setElapsed(0); setNote(''); setError(''); st.current.cancelled = false; setPhase('setup');
      };
      const upload = async () => {
        if (!blob) return;
        if (blob.size > MAX_BYTES) { setError('This clip is larger than 250 MB. Record a shorter clip.'); return; }
        setPhase('uploading'); setError('');
        const type = blob.type || st.current.mime.split(';')[0];
        const base = (title || 'clip').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'clip';
        const path = uuid() + '/' + base + '.' + extFor(type);
        try {
          const { error: upErr } = await supabase.storage.from(CLIP_BUCKET).upload(path, blob, { contentType: type, upsert: false, cacheControl: '3600' });
          if (upErr) throw upErr;
          const { data } = supabase.storage.from(CLIP_BUCKET).getPublicUrl(path);
          if (!data || !data.publicUrl) throw new Error('No public URL');
          onDone({ name: (title || 'Clip') + '.' + extFor(type), url: data.publicUrl, path, mime: type, size: blob.size, kind: 'clip', duration_ms: Math.round(elapsed), width: dims.w || null, height: dims.h || null, bucket: CLIP_BUCKET });
        } catch (e) {
          const msg = String((e && (e.message || e.error)) || e || '');
          setPhase('preview');
          setError(/bucket not found|not found/i.test(msg) ? 'Clip storage is not set up yet (bucket "clips"). Ask an admin to apply migration 104.'
            : /payload too large|exceeded|size/i.test(msg) ? 'This clip is too large to upload.'
            : 'Upload failed: ' + (msg || 'network error') + '. Try again.');
        }
      };

      const onKey = (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        if (phase === 'recording') return;       // use the bar's cancel
        if (phase !== 'uploading') onDone(null);
      };

      // ---- recording bar (keeps the screen clear while capturing) ----
      if (phase === 'recording') {
        const left = MAX_MS - elapsed;
        return h`<div class="ck-root ck-bar" role="toolbar" aria-label="Recording controls">
          <span class=${'ck-dot' + (paused ? ' paused' : '')} aria-hidden="true"></span>
          <span class="ck-clock" aria-live="off">${fmtClock(elapsed)}<span style=${{ opacity: .55, fontWeight: 500 }}> / 5:00</span></span>
          ${st.current.ctx && mode !== 'screen' ? h`<span class="ck-lvl" aria-hidden="true"><div style=${{ width: Math.round(level * 100) + '%' }}></div></span>` : null}
          ${left <= 30000 ? h`<span style=${{ fontSize: 11, color: '#f5a623' }}>${Math.ceil(left / 1000)}s left</span>` : null}
          <button type="button" class="ck-ibtn" aria-label=${paused ? 'Resume recording' : 'Pause recording'} onClick=${pause}>
            <i class=${'ti ' + (paused ? 'ti-player-record' : 'ti-player-pause')}></i></button>
          <button type="button" class="ck-ibtn" aria-label="Stop and preview" onClick=${stop} ref=${primary}><i class="ti ti-player-stop-filled" style=${{ color: '#ff6b6f' }}></i></button>
          <button type="button" class="ck-ibtn" aria-label="Cancel recording" onClick=${cancelRecording}><i class="ti ti-trash"></i></button>
        </div>`;
      }

      const modes = [
        { key: 'screen_mic', icon: 'ti-device-desktop', label: 'Screen + mic', sub: 'Walk through with your voice', ok: screenOk },
        { key: 'screen', icon: 'ti-screen-share', label: 'Screen only', sub: 'No microphone', ok: screenOk },
        { key: 'voice', icon: 'ti-microphone', label: 'Voice only', sub: 'Audio note', ok: voiceOk },
      ];
      return h`<div class="ck-root ck-bg" onMouseDown=${e => { if (e.target === e.currentTarget && phase === 'setup') onDone(null); }} onKeyDown=${onKey}>
        <div class="ck-modal" role="dialog" aria-modal="true" aria-labelledby="ck-rec-title">
          <div class="ck-hd">
            <i class="ti ti-video" style=${{ fontSize: 18, color: 'var(--cu-accent-ink)' }} aria-hidden="true"></i>
            <h2 id="ck-rec-title">${phase === 'preview' || phase === 'uploading' ? 'Review clip' : 'Record a clip'}</h2>
            <button type="button" class="ck-ibtn" aria-label="Close" disabled=${phase === 'uploading'} onClick=${() => onDone(null)}><i class="ti ti-x"></i></button>
          </div>
          <div class="ck-body">
            ${phase === 'setup' || phase === 'starting' ? h`<${Fragment}>
              ${!voiceOk ? h`<div class="ck-err" style=${{ marginTop: 0 }}>Recording isn't supported in this browser. Use the latest Chrome, Edge or Firefox on a computer.</div>` : h`<${Fragment}>
                <div class="ck-modes" role="radiogroup" aria-label="What to record">
                  ${modes.map(m => h`<button key=${m.key} type="button" role="radio" aria-checked=${mode === m.key} disabled=${!m.ok}
                    class=${'ck-mode' + (mode === m.key ? ' on' : '')} onClick=${() => setMode(m.key)}>
                    <i class=${'ti ' + m.icon} aria-hidden="true"></i><span>${m.label}<br/><small>${m.ok ? m.sub : 'Not supported here'}</small></span>
                  </button>`)}
                </div>
                ${!screenOk ? h`<div class="ck-note">Screen recording needs a desktop browser — voice clips still work on this device.</div>` : null}
                <div class="ck-note">Up to 5 minutes. You can pause, preview and re-record before anything is uploaded.</div>
              <//>`}
            <//>` : null}
            ${(phase === 'preview' || phase === 'uploading') && blobUrl ? h`<${Fragment}>
              <${ClipPlayer} url=${blobUrl} mime=${blob && blob.type} duration_ms=${elapsed} showTranscript=${false}/>
              <div style=${{ marginTop: 12 }}>
                <label class="ck-note" for="ck-clip-title" style=${{ display: 'block', margin: '0 0 4px' }}>Title</label>
                <input id="ck-clip-title" class="ck-input" value=${title} maxLength=${80} disabled=${phase === 'uploading'} onInput=${e => setTitle(e.target.value)}/>
              </div>
              <div class="ck-note">${fmtClock(elapsed)} · ${fmtSize(blob && blob.size)}</div>
            <//>` : null}
            ${note ? h`<div class="ck-note" role="status">${note}</div>` : null}
            ${error ? h`<div class="ck-err" role="alert">${error}</div>` : null}
          </div>
          <div class="ck-foot">
            ${phase === 'setup' || phase === 'starting' ? h`<${Fragment}>
              <span style=${{ flex: 1 }}></span>
              <button type="button" class="ck-btn ghost" onClick=${() => onDone(null)}>Cancel</button>
              <button type="button" class="ck-btn rec" ref=${primary} disabled=${phase === 'starting' || !voiceOk} onClick=${start}>
                ${phase === 'starting' ? h`<i class="ti ti-loader-2"></i>` : h`<i class="ti ti-player-record-filled"></i>`}Start recording
              </button>
            <//>` : h`<${Fragment}>
              <button type="button" class="ck-btn ghost" disabled=${phase === 'uploading'} onClick=${() => onDone(null)}>Discard</button>
              <span style=${{ flex: 1 }}></span>
              <button type="button" class="ck-btn" disabled=${phase === 'uploading'} onClick=${retake}><i class="ti ti-refresh"></i>Record again</button>
              <button type="button" class="ck-btn pri" ref=${primary} disabled=${phase === 'uploading'} onClick=${upload}>
                ${phase === 'uploading' ? h`<${Fragment}><i class="ti ti-loader-2"></i>Uploading…<//>` : h`<${Fragment}><i class="ti ti-paperclip"></i>Attach clip<//>`}
              </button>
            <//>`}
          </div>
        </div>
      </div>`;
    }

    let recorderOpen = false;
    function recordClip(opts) {
      const o = opts || {};
      if (recorderOpen) return Promise.resolve(null);
      return new Promise((resolve) => {
        recorderOpen = true;
        let close = null;
        const done = (meta) => { recorderOpen = false; if (close) close(); resolve(meta || null); };
        close = openOverlay(() => h`<${ClipRecorder} initialMode=${o.mode} onDone=${done}/>`);
        if (!overlays.hosts && !overlays.autoRoot) done(null);
      });
    }

    // =========================================================================
    // Dictation (Web Speech API)
    // =========================================================================
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    const LANGS = [{ key: 'en-IN', label: 'English' }, { key: 'hi-IN', label: 'हिन्दी' }];

    function Dictation({ onInsert, onClose }) {
      const [lang, setLang] = useState(() => LANGS.some(l => l.key === lsGet('ams_dictation_lang', '')) ? lsGet('ams_dictation_lang', 'en-IN') : 'en-IN');
      const [listening, setListening] = useState(false);
      const [text, setText] = useState('');
      const [interim, setInterim] = useState('');
      const [error, setError] = useState('');
      const r = useRef({ rec: null, want: false, restarts: 0 });
      const taRef = useRef(null);

      const stopRec = useCallback(() => {
        const s = r.current; s.want = false;
        if (s.rec) { try { s.rec.onend = null; s.rec.stop(); } catch (_) { } s.rec = null; }
        setListening(false); setInterim('');
      }, []);
      useEffect(() => () => { const s = r.current; s.want = false; if (s.rec) try { s.rec.onend = null; s.rec.abort(); } catch (_) { } }, []);

      const startRec = useCallback((lng) => {
        if (!SR) return;
        const s = r.current;
        if (s.rec) { try { s.rec.onend = null; s.rec.abort(); } catch (_) { } s.rec = null; }
        setError('');
        let rec;
        try { rec = new SR(); } catch (_) { setError('Dictation could not start in this browser.'); return; }
        rec.lang = lng; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
        rec.onresult = (e) => {
          let fin = '', mid = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i]; const t = res[0] ? res[0].transcript : '';
            if (res.isFinal) fin += t; else mid += t;
          }
          if (fin) setText(prev => { const add = fin.trim(); if (!add) return prev; return prev ? (prev.replace(/\s+$/, '') + (/[\s\n]$/.test(prev) ? '' : ' ') + add) : add.charAt(0).toUpperCase() + add.slice(1); });
          setInterim(mid);
          s.restarts = 0;
        };
        rec.onerror = (e) => {
          const code = e && e.error;
          if (code === 'not-allowed' || code === 'service-not-allowed') { s.want = false; setError('Microphone access is blocked. Allow it from the address bar, then press the mic again.'); }
          else if (code === 'network') { s.want = false; setError('Dictation needs an internet connection.'); }
          else if (code === 'audio-capture') { s.want = false; setError('No microphone was found.'); }
          else if (code === 'language-not-supported') { s.want = false; setError('This language isn\'t supported by your browser\'s speech service.'); }
          // 'no-speech' / 'aborted' → onend restarts while the user still wants it
        };
        rec.onend = () => {
          if (s.want && s.rec === rec && s.restarts < 20) { s.restarts++; try { rec.start(); return; } catch (_) { } }
          if (s.rec === rec) { s.rec = null; s.want = false; setListening(false); setInterim(''); }
        };
        s.rec = rec; s.want = true;
        try { rec.start(); setListening(true); } catch (_) { s.want = false; setListening(false); setError('Dictation could not start. Try again.'); }
      }, []);

      const toggle = () => { if (listening) stopRec(); else startRec(lang); };
      const switchLang = (k) => { setLang(k); lsSet('ams_dictation_lang', k); if (listening) startRec(k); };
      const insert = () => { const t = (text + (interim ? ' ' + interim : '')).trim(); stopRec(); if (t) onInsert && onInsert(t); onClose(); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); stopRec(); onClose(); }
        else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); insert(); }
      };

      return h`<div class="ck-root ck-dict" role="dialog" aria-label="Dictate" onKeyDown=${onKey}>
        <div class="ck-hd" style=${{ padding: '10px 12px' }}>
          <i class="ti ti-microphone" style=${{ fontSize: 17, color: 'var(--cu-accent-ink)' }} aria-hidden="true"></i>
          <h2>Dictate</h2>
          ${SR ? h`<div class="ck-seg" role="radiogroup" aria-label="Language">
            ${LANGS.map(l => h`<button key=${l.key} type="button" role="radio" aria-checked=${lang === l.key} class=${lang === l.key ? 'on' : ''} onClick=${() => switchLang(l.key)}>${l.label}</button>`)}
          </div>` : null}
          <button type="button" class="ck-ibtn" aria-label="Close dictation" onClick=${() => { stopRec(); onClose(); }}><i class="ti ti-x"></i></button>
        </div>
        ${!SR ? h`<div class="ck-body">
          <div style=${{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <i class="ti ti-microphone-off" style=${{ fontSize: 24, color: 'var(--cu-t3)' }} aria-hidden="true"></i>
            <div style=${{ fontSize: 13, lineHeight: 1.5, color: 'var(--cu-t2)' }}>
              Talk-to-text isn't available in this browser. It works in Chrome, Edge and Safari (desktop and Android).
              <div class="ck-note" style=${{ marginTop: 6 }}>On a phone you can also use the microphone key on your keyboard.</div>
            </div>
          </div>
        </div>` : h`<div class="ck-body" style=${{ paddingTop: 12 }}>
          <div style=${{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="button" class=${'ck-mic' + (listening ? ' on' : '')} aria-pressed=${listening}
              aria-label=${listening ? 'Stop listening' : 'Start listening'} onClick=${toggle} autoFocus>
              <i class=${'ti ' + (listening ? 'ti-player-stop-filled' : 'ti-microphone')}></i>
            </button>
            <div style=${{ fontSize: 12.5, color: 'var(--cu-t2)', lineHeight: 1.45 }} aria-live="polite">
              ${listening ? 'Listening… speak naturally. Say "full stop" or pause between sentences.' : text ? 'Paused. Edit the text, then insert it.' : 'Press the mic and start speaking.'}
            </div>
          </div>
          <textarea ref=${taRef} class="ck-ta" style=${{ marginTop: 12 }} value=${text} placeholder="Your words appear here…"
            aria-label="Dictated text" onInput=${e => setText(e.target.value)}></textarea>
          <div class="ck-interim" aria-hidden="true">${interim}</div>
          ${error ? h`<div class="ck-err" role="alert" style=${{ marginTop: 4 }}>${error}</div>` : null}
        </div>`}
        <div class="ck-foot" style=${{ padding: '10px 12px' }}>
          ${SR && text ? h`<button type="button" class="ck-btn ghost" onClick=${() => { setText(''); setInterim(''); }}>Clear</button>` : null}
          <span style=${{ flex: 1 }}></span>
          <button type="button" class="ck-btn" onClick=${() => { stopRec(); onClose(); }}>${SR ? 'Cancel' : 'Close'}</button>
          ${SR ? h`<button type="button" class="ck-btn pri" disabled=${!(text.trim() || interim.trim())} onClick=${insert}><i class="ti ti-text-plus"></i>Insert</button>` : null}
        </div>
      </div>`;
    }

    let dictationClose = null;
    function startDictation(opts) {
      const o = opts || {};
      if (dictationClose) dictationClose();
      const close = openOverlay(() => h`<${Dictation} onInsert=${o.onInsert || o.insertText} onClose=${() => { close(); if (dictationClose === close) dictationClose = null; }}/>`);
      dictationClose = close;
      return close;
    }

    // =========================================================================
    // Link previews
    // =========================================================================
    const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]}]/gi;
    function extractUrls(text, max) {
      const out = [];
      String(text || '').replace(URL_RE, (m) => { if (!out.includes(m)) out.push(m); return m; });
      return typeof max === 'number' ? out.slice(0, max) : out;
    }
    const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x : null; } catch (_) { return null; } };

    // Known providers → icon, brand colour, and a client-built embed URL (never HTML from the network).
    function detectProvider(raw) {
      const u = safeUrl(raw); if (!u) return null;
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      const path = u.pathname;
      let m;
      if (host === 'youtu.be' || host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
        let id = null;
        if (host === 'youtu.be') id = path.slice(1).split('/')[0];
        else if (u.searchParams.get('v')) id = u.searchParams.get('v');
        else if ((m = /^\/(?:shorts|embed|live)\/([\w-]{6,})/.exec(path))) id = m[1];
        const ok = id && /^[\w-]{6,20}$/.test(id);
        return { key: 'youtube', label: 'YouTube', icon: 'ti-brand-youtube', color: '#ff0033', embed: ok ? 'https://www.youtube-nocookie.com/embed/' + id : null };
      }
      if (host.endsWith('vimeo.com')) {
        m = /\/(\d{5,})/.exec(path);
        return { key: 'vimeo', label: 'Vimeo', icon: 'ti-brand-vimeo', color: '#1ab7ea', embed: m ? 'https://player.vimeo.com/video/' + m[1] : null };
      }
      if (host.endsWith('loom.com')) {
        m = /^\/(?:share|embed)\/([0-9a-f]{16,})/i.exec(path);
        return { key: 'loom', label: 'Loom', icon: 'ti-video', color: '#625df5', embed: m ? 'https://www.loom.com/embed/' + m[1] : null };
      }
      if (host.endsWith('figma.com')) {
        const ok = /^\/(file|design|proto|board|slides)\//.test(path);
        return { key: 'figma', label: 'Figma', icon: 'ti-brand-figma', color: '#a259ff', embed: ok ? 'https://www.figma.com/embed?embed_host=mydigitalsevak&url=' + encodeURIComponent(u.href) : null };
      }
      if (host.endsWith('miro.com')) {
        m = /^\/app\/board\/([^/]+)/.exec(path);
        return { key: 'miro', label: 'Miro', icon: 'ti-layout-board', color: '#ffd02f', embed: m ? 'https://miro.com/app/live-embed/' + m[1] + '/' : null };
      }
      if (host === 'docs.google.com') {
        if (/^\/document\//.test(path)) return { key: 'gdoc', label: 'Google Docs', icon: 'ti-file-text', color: '#4285f4' };
        if (/^\/spreadsheets\//.test(path)) return { key: 'gsheet', label: 'Google Sheets', icon: 'ti-table', color: '#0f9d58' };
        if (/^\/presentation\//.test(path)) return { key: 'gslides', label: 'Google Slides', icon: 'ti-presentation', color: '#f4b400' };
        if (/^\/forms\//.test(path)) return { key: 'gform', label: 'Google Forms', icon: 'ti-forms', color: '#7248b9' };
        return { key: 'gdocs', label: 'Google Docs', icon: 'ti-file-text', color: '#4285f4' };
      }
      if (host === 'drive.google.com') return { key: 'gdrive', label: 'Google Drive', icon: 'ti-brand-google-drive', color: '#1fa463' };
      if (host.endsWith('instagram.com')) return { key: 'instagram', label: 'Instagram', icon: 'ti-brand-instagram', color: '#e1306c' };
      if (host.endsWith('canva.com')) return { key: 'canva', label: 'Canva', icon: 'ti-palette', color: '#00c4cc' };
      if (host.endsWith('linkedin.com')) return { key: 'linkedin', label: 'LinkedIn', icon: 'ti-brand-linkedin', color: '#0a66c2' };
      return { key: 'web', label: host, icon: 'ti-world', color: null };
    }

    const previewCache = new Map();           // url → Promise<data|null>
    let previewFnMissing = false;
    async function fetchLinkPreview(url) {
      const u = safeUrl(url);
      if (!u || u.protocol !== 'https:' || previewFnMissing || !SB_URL) return null;
      const key = u.href;
      if (previewCache.has(key)) return previewCache.get(key);
      const p = (async () => {
        const token = getToken();
        if (!token) return null;
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), 9000) : null;
        try {
          const res = await fetch(SB_URL + '/functions/v1/link-preview', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, SB_KEY ? { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } : {}),
            body: JSON.stringify({ url: key, session_token: token }),
            signal: ctl ? ctl.signal : undefined,
          });
          if (res.status === 404) { const body = await res.json().catch(() => null); if (!body || body.ok === undefined) previewFnMissing = true; return null; }
          const body = await res.json().catch(() => null);
          if (!res.ok || !body || !body.ok || !body.data) { if (res.status === 429 || res.status >= 500) previewCache.delete(key); return null; }
          return body.data;
        } catch (_) {
          previewCache.delete(key);
          return null;
        } finally { if (timer) clearTimeout(timer); }
      })();
      previewCache.set(key, p);
      if (previewCache.size > 300) previewCache.delete(previewCache.keys().next().value);
      return p;
    }

    function LinkPreview({ url, compact, allowEmbed = true }) {
      const prov = useMemo(() => detectProvider(url), [url]);
      const enabled = !(window.AMS_PREFS && window.AMS_PREFS.link_previews === false);
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(enabled);
      const [embed, setEmbed] = useState(false);
      const [imgOk, setImgOk] = useState(true);
      useEffect(() => {
        let alive = true;
        setData(null); setEmbed(false); setImgOk(true);
        if (!enabled || !prov) { setLoading(false); return; }
        setLoading(true);
        fetchLinkPreview(url).then(d => { if (alive) { setData(d); setLoading(false); } });
        return () => { alive = false; };
      }, [url, enabled]);
      if (!prov) return null;
      const u = safeUrl(url);
      if (!enabled) {
        return h`<a class="ck-root" href=${u.href} target="_blank" rel="noopener noreferrer" style=${{ fontSize: 13, color: 'var(--cu-accent-ink)', wordBreak: 'break-all' }}>${u.href}</a>`;
      }
      const d = data || {};
      const title = d.title || (prov.key === 'web' ? u.hostname.replace(/^www\./, '') : prov.label);
      const desc = d.description || (data ? '' : decodeURIComponent(u.pathname + u.search).slice(0, 120));
      const img = imgOk && typeof d.image === 'string' && /^https:\/\//.test(d.image) ? d.image : null;
      const fav = typeof d.favicon === 'string' && /^https:\/\//.test(d.favicon) ? d.favicon : null;
      const site = d.site_name || prov.label;
      const embedUrl = allowEmbed && prov.embed ? prov.embed : null;
      return h`<div class="ck-root" style=${{ maxWidth: 560, minWidth: 0 }}>
        <a class=${'ck-lp' + (compact ? ' compact' : '')} href=${u.href} target="_blank" rel="noopener noreferrer"
           style=${prov.color ? { '--ck-lp-c': prov.color } : null} aria-label=${'Open link: ' + title}>
          <div class="ck-lp-main">
            <div class="ck-lp-site">
              ${fav ? h`<img src=${fav} alt="" loading="lazy" referrerPolicy="no-referrer" onError=${e => { e.target.style.display = 'none'; }}/>`
                : h`<i class=${'ti ' + prov.icon} style=${{ fontSize: 14, color: prov.color || 'var(--cu-t3)' }} aria-hidden="true"></i>`}
              <span>${site}</span>
            </div>
            ${loading ? h`<${Fragment}><div class="ck-skel" style=${{ width: '70%', marginTop: 3 }}></div><div class="ck-skel" style=${{ width: '45%', marginTop: 5 }}></div><//>`
              : h`<${Fragment}>
                <div class="ck-lp-t">${title}</div>
                ${desc && !compact ? h`<div class="ck-lp-d">${desc}</div>` : null}
                ${embedUrl ? h`<div class="ck-lp-acts">
                  <button type="button" class="ck-lp-chip" aria-expanded=${embed}
                    onClick=${e => { e.preventDefault(); e.stopPropagation(); setEmbed(v => !v); }}>
                    <i class=${'ti ' + (embed ? 'ti-x' : (prov.key === 'figma' || prov.key === 'miro' ? 'ti-eye' : 'ti-player-play'))}></i>${embed ? 'Close preview' : (prov.key === 'figma' || prov.key === 'miro' ? 'Preview' : 'Play here')}
                  </button>
                </div>` : null}
              <//>`}
          </div>
          ${img && !compact ? h`<div class="ck-lp-img"><img src=${img} alt="" loading="lazy" referrerPolicy="no-referrer" onError=${() => setImgOk(false)}/></div>` : null}
        </a>
        ${embed && embedUrl ? h`<div class="ck-embed">
          <iframe src=${embedUrl} title=${title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write" allowFullScreen></iframe>
        </div>` : null}
      </div>`;
    }

    function LinkPreviewList({ text, max = 3, compact }) {
      const urls = useMemo(() => extractUrls(text, max), [text, max]);
      if (!urls.length) return null;
      return h`<div class="ck-root" style=${{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, minWidth: 0 }}>
        ${urls.map(u => h`<${LinkPreview} key=${u} url=${u} compact=${compact}/>`)}
      </div>`;
    }

    // ---- registrations ------------------------------------------------------------
    reg('composerTools', {
      id: 'clip', icon: 'ti-video', title: 'Record clip',
      async run({ addAttachment }) {
        const meta = await recordClip({});
        if (meta && addAttachment) addAttachment(meta);
      },
    });
    reg('composerTools', {
      id: 'dictate', icon: 'ti-microphone', title: 'Dictate (talk to text)',
      run({ insertText }) { startDictation({ onInsert: insertText }); },
    });

    return {
      recordClip, startDictation, ClipsHost, ClipPlayer, isClipAttachment,
      LinkPreview, LinkPreviewList, extractUrls, detectProvider, fetchLinkPreview,
    };
  }

  window.AMS_CLIPS = { buildClips };
})();

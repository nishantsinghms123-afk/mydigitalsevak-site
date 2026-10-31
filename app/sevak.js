/* ============================================================================
 * sevak.js — Sevak, the dashboard assistant for everyone in the office.
 *
 *   window.AMS_SEVAK.buildSevak(deps) → { SevakDock, SevakSettings }
 *
 * <SevakDock user=…/> is mounted by index.html in both staff shells (DashboardApp and
 * TasksApp). It is a floating button (Ctrl/⌘+J) that opens a chat panel. The person
 * types or speaks; Sevak answers and WORKS the dashboard for them.
 *
 * How it runs (migration 151 + supabase/functions/sevak):
 *   - This file owns the conversation loop. Each turn posts the whole chat to the
 *     `sevak` Edge Function, which adds Sevak's instructions + tool definitions and
 *     streams one Claude turn back (SSE). The API key never reaches the browser.
 *   - Claude's tool calls run HERE: navigate, read_screen, point_at, click, type_text,
 *     find_actions (searches sevak-actions.json, built by tools/sevak_catalog.py),
 *     run_action (rpcCall — the person's own session, so every role / visibility /
 *     tenant rule applies), open_task, db_read (admin/manager), read_attachment,
 *     load_calendar (sevak_calendar_load), write_caption (generate-post-caption: watches
 *     the reel / reads the graphics and writes caption + hashtags; Sevak saves them).
 *   - "Ask only for big changes": high-risk actions (delete, money, sending to clients,
 *     publishing, roles/access, bulk, calendar loads, unknown actions) and risky clicks
 *     show an Allow / Cancel card; everything else just runs and shows a step chip.
 *   - The API history is append-only (thinking / compaction / fallback blocks are sent
 *     back exactly as received). It is saved per member in localStorage when it fits.
 *
 * Registers Settings → Sevak (switch, limits, office notes, usage) in AMS_EXT.settingsSections.
 * ==========================================================================*/
(function () {
  function buildSevak(deps) {
    const d = deps || {};
    const React = d.React, h = d.h;
    const useState = d.useState, useEffect = d.useEffect, useRef = d.useRef, useCallback = d.useCallback;
    if (!React || !h || !useState) { console.warn('[sevak] missing React bridge'); return {}; }
    const rpcCall = d.rpcCall, SB_URL = d.SB_URL || '', SB_KEY = d.SB_KEY || '';
    const getSessionToken = d.getSessionToken || (() => { try { return localStorage.getItem('ams_session_token'); } catch (_) { return null; } });
    const openTask = d.openTask || ((id) => window.dispatchEvent(new CustomEvent('ams-open-task', { detail: { id } })));
    const taskBus = d.taskBus || null;
    const generatePostCaption = d.generatePostCaption || null;

    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => { EXT[key] = (EXT[key] || []).filter(x => x.id !== item.id).concat(item); };
    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i
      .test(String((e && (e.code || '')) + ' ' + (e && (e.message || e.details || '') || '')));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const PRIV = (r) => r === 'admin' || r === 'manager';

    // ---- styles -------------------------------------------------------------
    if (!document.getElementById('ams-sevak-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-sevak-styles';
      st.textContent = `
      .sv-root{--sv-bg:var(--cu-bg,#fff);--sv-bg2:var(--cu-bg2,#f7f7f8);--sv-bg3:var(--cu-bg3,#efeff1);--sv-bd:var(--cu-bd,#e8e8eb);
        --sv-t1:var(--cu-t1,#1f1f23);--sv-t2:var(--cu-t2,#5c5c66);--sv-t3:var(--cu-t3,#8e8e99);--sv-brand:#ff00ee;--sv-brand-ink:#a8009c;
        --sv-fog:rgba(255,0,238,.12);font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--sv-t1)}
      html.dark .sv-root{--sv-bg:var(--cu-bg,#1c1b1f);--sv-bg2:var(--cu-bg2,#161518);--sv-bg3:var(--cu-bg3,#26252a);--sv-bd:var(--cu-bd,#2d2c31);
        --sv-t1:var(--cu-t1,#ececef);--sv-t2:var(--cu-t2,#a9a8b1);--sv-t3:var(--cu-t3,#75747d);--sv-brand-ink:#ff7df6}
      .sv-root *{box-sizing:border-box}
      .sv-root :focus-visible{outline:2px solid var(--sv-brand);outline-offset:2px}
      .sv-fab{position:fixed;right:20px;bottom:20px;z-index:950;width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;
        background:linear-gradient(135deg,#ff00ee,#a8009c);color:#fff;box-shadow:0 8px 24px rgba(168,0,156,.35);display:flex;align-items:center;justify-content:center;
        font:700 22px/1 'Noto Sans Devanagari',Inter,system-ui,sans-serif;transition:transform .15s ease}
      .sv-fab:hover{transform:scale(1.06)}
      .sv-fab-busy::after{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid transparent;border-top-color:#ff00ee;animation:sv-spin 1s linear infinite}
      @media (max-width:760px){.sv-fab{bottom:calc(env(safe-area-inset-bottom,0px) + 76px);right:14px;width:48px;height:48px}}
      .sv-panel{position:fixed;right:20px;bottom:84px;z-index:951;width:410px;max-width:calc(100vw - 24px);height:min(680px,calc(100vh - 110px));
        background:var(--sv-bg);border:1px solid var(--sv-bd);border-radius:16px;box-shadow:0 18px 48px rgba(15,15,20,.22);display:flex;flex-direction:column;overflow:hidden}
      .sv-panel.sv-wide{width:560px}
      @media (max-width:760px){.sv-panel,.sv-panel.sv-wide{inset:0;width:auto;max-width:none;height:auto;border-radius:0;bottom:0;right:0}}
      .sv-hd{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--sv-bd)}
      .sv-logo{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#ff00ee,#a8009c);color:#fff;display:flex;align-items:center;justify-content:center;
        font:700 15px/1 'Noto Sans Devanagari',Inter,sans-serif;flex-shrink:0}
      .sv-ttl{font-weight:650;font-size:14.5px}
      .sv-sub{font-size:11.5px;color:var(--sv-t3)}
      .sv-grow{flex:1}
      .sv-ibtn{width:30px;height:30px;border-radius:8px;border:none;background:transparent;color:var(--sv-t2);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:17px}
      .sv-ibtn:hover{background:var(--sv-bg3);color:var(--sv-t1)}
      .sv-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:var(--sv-bg2)}
      .sv-msg{max-width:92%;font-size:13.5px;line-height:1.5;word-wrap:break-word;overflow-wrap:anywhere}
      .sv-msg.u{align-self:flex-end;background:var(--sv-brand);color:#fff;padding:8px 12px;border-radius:14px 14px 4px 14px;white-space:pre-wrap}
      .sv-msg.a{align-self:flex-start;background:var(--sv-bg);border:1px solid var(--sv-bd);padding:9px 12px;border-radius:14px 14px 14px 4px}
      .sv-msg.a p{margin:0 0 6px}.sv-msg.a p:last-child{margin-bottom:0}
      .sv-msg.a ul,.sv-msg.a ol{margin:2px 0 6px;padding-left:20px}.sv-msg.a li{margin:1px 0}
      .sv-msg.a code{background:var(--sv-bg3);padding:1px 5px;border-radius:4px;font-size:12px}
      .sv-msg.a a{color:var(--sv-brand-ink);text-decoration:underline;cursor:pointer}
      .sv-msg.a h4{margin:4px 0;font-size:13.5px}
      .sv-files{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
      .sv-file{font-size:11.5px;background:rgba(255,255,255,.22);padding:2px 7px;border-radius:6px}
      .sv-step{align-self:flex-start;display:flex;align-items:center;gap:7px;font-size:12px;color:var(--sv-t2);padding:3px 9px;border-radius:20px;background:var(--sv-bg);border:1px solid var(--sv-bd);max-width:92%}
      .sv-step .ti{font-size:14px}
      .sv-step.err{color:#c4320a;border-color:rgba(196,50,10,.3)}
      .sv-step.ok .ti{color:#30a46c}
      .sv-step span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .sv-spin{animation:sv-spin 1s linear infinite;display:inline-block}
      @keyframes sv-spin{to{transform:rotate(360deg)}}
      .sv-card{align-self:stretch;background:var(--sv-bg);border:1.5px solid var(--sv-brand);border-radius:12px;padding:11px 12px;display:flex;flex-direction:column;gap:8px}
      .sv-card.done{border-color:var(--sv-bd);opacity:.85}
      .sv-card-t{font-weight:600;font-size:13px;display:flex;gap:6px;align-items:center}
      .sv-card-s{font-size:13px;line-height:1.45}
      .sv-card-d{font-size:12px;color:var(--sv-t2);background:var(--sv-bg2);border-radius:8px;padding:7px 9px;max-height:180px;overflow:auto;white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace}
      .sv-card-list{font-size:12.5px;color:var(--sv-t2);margin:0;padding-left:18px;max-height:200px;overflow:auto}
      .sv-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .sv-btn{border:1px solid var(--sv-bd);background:var(--sv-bg);color:var(--sv-t1);border-radius:8px;padding:6px 12px;font:500 12.5px Inter,system-ui,sans-serif;cursor:pointer}
      .sv-btn:hover{background:var(--sv-bg3)}
      .sv-btn.pri{background:var(--sv-brand);border-color:var(--sv-brand);color:#fff}
      .sv-btn.pri:hover{filter:brightness(.95)}
      .sv-btn:disabled{opacity:.5;cursor:default}
      .sv-ft{border-top:1px solid var(--sv-bd);padding:10px 12px;display:flex;flex-direction:column;gap:7px;background:var(--sv-bg)}
      .sv-in{display:flex;align-items:flex-end;gap:6px;border:1px solid var(--sv-bd);border-radius:12px;padding:6px 6px 6px 10px;background:var(--sv-bg)}
      .sv-in:focus-within{border-color:var(--sv-t3)}
      .sv-ta{flex:1;border:none;outline:none;resize:none;background:transparent;color:var(--sv-t1);font:13.5px/1.45 Inter,system-ui,sans-serif;max-height:140px;min-height:22px;padding:3px 0}
      .sv-send{width:32px;height:32px;border-radius:9px;border:none;background:var(--sv-brand);color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}
      .sv-send:disabled{opacity:.4;cursor:default}
      .sv-send.stop{background:var(--sv-t1)}
      .sv-chips{display:flex;flex-wrap:wrap;gap:6px}
      .sv-chip{border:1px solid var(--sv-bd);background:var(--sv-bg);border-radius:16px;padding:5px 11px;font-size:12.5px;cursor:pointer;color:var(--sv-t1)}
      .sv-chip:hover{border-color:var(--sv-brand);color:var(--sv-brand-ink)}
      .sv-att{display:inline-flex;align-items:center;gap:5px;font-size:12px;background:var(--sv-bg3);padding:3px 8px;border-radius:8px}
      .sv-hello{padding:6px 2px;display:flex;flex-direction:column;gap:10px}
      .sv-hello b{font-size:16px}
      .sv-hint{font-size:11px;color:var(--sv-t3);text-align:center}
      .sv-drop{position:absolute;inset:0;background:rgba(255,0,238,.08);border:2px dashed var(--sv-brand);border-radius:16px;display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--sv-brand-ink);z-index:2;pointer-events:none}
      .sv-cursor::after{content:'▍';animation:sv-blink 1s steps(1) infinite;color:var(--sv-brand)}
      @keyframes sv-blink{50%{opacity:0}}
      .sv-ring{position:fixed;z-index:949;pointer-events:none;border:3px solid #ff00ee;border-radius:10px;box-shadow:0 0 0 4px rgba(255,0,238,.18),0 0 24px rgba(255,0,238,.45);
        animation:sv-pulse 1.1s ease-in-out infinite;transition:all .2s ease}
      @keyframes sv-pulse{50%{box-shadow:0 0 0 9px rgba(255,0,238,.08),0 0 30px rgba(255,0,238,.55)}}
      .sv-tip{position:fixed;z-index:949;pointer-events:none;background:#1f1f23;color:#fff;font:500 12.5px/1.4 Inter,system-ui,sans-serif;padding:7px 10px;border-radius:8px;max-width:260px;box-shadow:0 6px 18px rgba(0,0,0,.25)}
      .sv-set{display:flex;flex-direction:column;gap:12px;max-width:880px;font-size:13px}
      .sv-set .sv-box{border:1px solid var(--cu-bd,var(--bd,#e8e8eb));border-radius:10px;padding:14px;background:var(--cu-bg,var(--surface,#fff));display:flex;flex-direction:column;gap:10px}
      .sv-set .sv-lbl{font-weight:600;font-size:13.5px}
      .sv-set .sv-note{font-size:12px;color:var(--cu-t3,var(--t3,#8e8e99));line-height:1.45}
      .sv-set textarea,.sv-set input[type=number]{border:1px solid var(--cu-bd,var(--bd,#e8e8eb));border-radius:8px;padding:8px 10px;font:13px/1.5 Inter,system-ui,sans-serif;background:var(--cu-bg,#fff);color:inherit;width:100%}
      .sv-set textarea{min-height:170px;resize:vertical}
      .sv-bar{height:8px;border-radius:6px;background:var(--cu-bg3,#efeff1);overflow:hidden}.sv-bar i{display:block;height:100%;background:#ff00ee}
      .sv-tbl{width:100%;border-collapse:collapse;font-size:12.5px}.sv-tbl td{padding:5px 4px;border-top:1px solid var(--cu-bd,#e8e8eb)}
      `;
      document.head.appendChild(st);
    }

    // ---- errors -------------------------------------------------------------
    const ERR = {
      'ai.disabled': 'Sevak is switched off for this workspace. An admin can turn it on in Settings → Sevak.',
      'ai.rate_limited': 'You’ve used today’s Sevak messages. They reset at midnight.',
      'ai.cap_reached': 'This month’s Sevak allowance is used up. An admin can raise it in Settings → Sevak.',
      'ai.not_configured': 'Sevak isn’t connected to its AI service yet (server key missing).',
      'ai.busy': 'Sevak is busy right now. Try again in a minute.',
      'ai.timeout': 'That took too long. Try again, maybe in smaller steps.',
      'sevak.not_installed': 'Sevak isn’t installed on the server yet (database update 151 / sevak function).',
      'sevak.too_long': 'This chat has become too long. Start a new chat.',
      'auth.invalid_session': 'Your session has expired. Please sign in again.',
      'auth.forbidden': 'Your role can’t use that.',
      network: 'Couldn’t reach the server. Check your internet and try again.',
    };
    const errText = (code, detail) => ERR[code] || ('Something went wrong' + (code ? ` (${code}${detail ? ': ' + String(detail).slice(0, 120) : ''})` : '') + '. Try again.');

    // ---- the action catalog (sevak-actions.json) -----------------------------
    let catalogP = null;
    const loadCatalog = () => {
      if (!catalogP) {
        catalogP = fetch('./sevak-actions.json?v=' + encodeURIComponent(d.APP_VERSION || '1')).then(r => (r.ok ? r.json() : { actions: [] }))
          .then(j => (Array.isArray(j) ? j : (j && j.actions) || []))
          .catch(() => { catalogP = null; return []; });
      }
      return catalogP;
    };
    const SYN = {
      post: 'content', posts: 'content', reel: 'content', creative: 'content', calendar: 'content',
      invoice: 'invoice billing', bill: 'invoice billing', payment: 'payment billing', paid: 'payment',
      leave: 'leave attendance', attendance: 'attendance', staff: 'member team', employee: 'member team',
      people: 'member team', assign: 'assignee assign', reschedule: 'due date update', move: 'update date',
      due: 'due', comment: 'comment', note: 'comment note', brand: 'client', brands: 'client', customer: 'client',
      overdue: 'tasks query due', search: 'search query list', find: 'search query list', show: 'list query get',
    };
    const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_ ]+/g, ' ').split(/[\s_]+/).filter(w => w.length > 1);
    async function findActions(query, area) {
      const list = await loadCatalog();
      if (!list.length) return { error: 'The action list isn’t available. Use read_screen / click instead.' };
      const q = words(query); const extra = [];
      q.forEach(w => { if (SYN[w]) extra.push(...SYN[w].split(' ')); });
      const terms = Array.from(new Set(q.concat(extra)));
      const scored = [];
      for (const a of list) {
        if (a.portal_only || a.no_session) continue;
        if (area && a.area && a.area !== area) continue;
        const nm = words(a.name), ds = String(a.desc || '').toLowerCase();
        let s = 0;
        for (const t of terms) {
          if (nm.includes(t)) s += 6; else if (a.name.includes(t)) s += 3;
          if (ds.includes(t)) s += 1.5;
          if (a.area === t) s += 2;
        }
        if (a.frontend) s += 0.5;
        if (s > 0) scored.push([s, a]);
      }
      scored.sort((x, y) => y[0] - x[0]);
      return {
        matches: scored.slice(0, 12).map(([, a]) => ({
          name: a.name, does: a.desc, kind: a.kind, risk: a.risk, area: a.area,
          args: (a.args || []).map(x => x.name + ':' + x.type + (x.default != null ? ' (optional)' : '')).join(', '),
          keys: a.keys || undefined,
        })),
        tip: scored.length ? undefined : 'Nothing matched. Try other words, or browse with an area filter.',
      };
    }

    // ---- attachments ------------------------------------------------------------
    const ATT = new Map();   // id → { id, name, kind: image|pdf|sheet|text, sheets?: {name: rows[][]}, text? }
    let attSeq = 0;
    let xlsxP = null;
    const loadXlsx = () => {
      if (window.XLSX) return Promise.resolve(window.XLSX);
      if (!xlsxP) xlsxP = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = () => res(window.XLSX); s.onerror = () => { xlsxP = null; rej(new Error('Couldn’t load the Excel reader')); };
        document.head.appendChild(s);
      });
      return xlsxP;
    };
    function parseCsv(text) {
      const delim = (text.split('\n')[0] || '').split('\t').length > (text.split('\n')[0] || '').split(',').length ? '\t' : ',';
      const rows = []; let row = [], cur = '', q = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
          if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
          else cur += c;
        } else if (c === '"') q = true;
        else if (c === delim) { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
        else cur += c;
      }
      if (cur !== '' || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row); }
      return rows.filter(r => r.some(x => String(x).trim() !== ''));
    }
    const readAs = (file, how) => new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error);
      if (how === 'text') fr.readAsText(file); else if (how === 'buf') fr.readAsArrayBuffer(file); else fr.readAsDataURL(file);
    });
    async function shrinkImage(file) {
      const url = await readAs(file, 'url');
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const max = 1568, sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85).split(',')[1];
    }
    const sheetPreview = (rows, n) => {
      const out = rows.slice(0, n + 1).map(r => r.map(x => String(x == null ? '' : x).replace(/\s+/g, ' ').slice(0, 160)).join(' | '));
      return out.join('\n');
    };
    // → { att, blocks } — blocks go into the user message
    async function ingestFile(file) {
      const id = 'f' + (++attSeq) + Date.now().toString(36).slice(-3);
      const name = file.name || 'file';
      const lower = name.toLowerCase(), type = file.type || '';
      if (type.startsWith('image/')) {
        const data = await shrinkImage(file);
        const att = { id, name, kind: 'image' }; ATT.set(id, att);
        return { att, blocks: [{ type: 'text', text: `<attachment id="${id}" name="${name}" kind="image"/>` },
                               { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }] };
      }
      if (type === 'application/pdf' || lower.endsWith('.pdf')) {
        if (file.size > 20 * 1024 * 1024) throw new Error(name + ' is bigger than 20 MB');
        const data = String(await readAs(file, 'url')).split(',')[1];
        const att = { id, name, kind: 'pdf' }; ATT.set(id, att);
        return { att, blocks: [{ type: 'text', text: `<attachment id="${id}" name="${name}" kind="pdf"/>` },
                               { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }] };
      }
      let sheets = null;
      if (/\.(xlsx|xlsm|xls|ods)$/.test(lower)) {
        const X = await loadXlsx();
        const wb = X.read(await readAs(file, 'buf'), { type: 'array', cellDates: true });
        sheets = {};
        wb.SheetNames.forEach(sn => {
          sheets[sn] = X.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: '' })
            .filter(r => r.some(x => String(x).trim() !== ''));
        });
      } else if (/\.(csv|tsv)$/.test(lower) || type === 'text/csv') {
        sheets = { Sheet1: parseCsv(await readAs(file, 'text')) };
      }
      if (sheets) {
        const att = { id, name, kind: 'sheet', sheets }; ATT.set(id, att);
        const parts = Object.keys(sheets).map(sn => {
          const rows = sheets[sn]; const n = Math.max(rows.length - 1, 0);
          const small = JSON.stringify(rows).length < 24000;
          return `<sheet name="${sn}" rows="${n}"${small ? '' : ' preview="first 25 rows — use read_attachment for the rest"'}>\n` +
            sheetPreview(rows, small ? rows.length : 25) + '\n</sheet>';
        });
        return { att, blocks: [{ type: 'text', text: `<attachment id="${id}" name="${name}" kind="sheet">\n${parts.join('\n')}\n</attachment>` }] };
      }
      const text = String(await readAs(file, 'text'));
      const att = { id, name, kind: 'text', text }; ATT.set(id, att);
      const small = text.length < 40000;
      return { att, blocks: [{ type: 'text', text: `<attachment id="${id}" name="${name}" kind="text"${small ? '' : ` chars="${text.length}" preview="first 40000 chars — use read_attachment for the rest"`}>\n${text.slice(0, 40000)}\n</attachment>` }] };
    }

    // ---- screen helpers -----------------------------------------------------------
    const inSevak = (el) => !!(el && el.closest && el.closest('[data-sevak]'));
    const visible = (el) => {
      if (!el || inSevak(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const labelOf = (el) => norm(el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || el.getAttribute('placeholder') || '');
    const CLICKABLE = 'button,a[href],[role=button],[role=tab],[role=menuitem],[role=option],[role=link],[role=checkbox],[role=switch],summary,label,select,input[type=checkbox],input[type=radio],[onclick],.btn-pri,.btn-sec,[tabindex]';
    function fieldLabel(el) {
      let t = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
      if (!t && el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) t = l.innerText; }
      if (!t) { const l = el.closest('label'); if (l) t = l.innerText; }
      if (!t) {
        const prev = el.previousElementSibling || (el.parentElement && el.parentElement.previousElementSibling);
        if (prev && prev.innerText && prev.innerText.length < 60) t = prev.innerText;
      }
      return norm(t || el.getAttribute('name') || '');
    }
    function findEl(target, mode) {
      const want = norm(target).toLowerCase();
      if (!want) return { el: null, all: [] };
      let pool;
      if (mode === 'field') pool = Array.from(document.querySelectorAll('input:not([type=hidden]),textarea,select,[contenteditable=true]')).filter(visible);
      else pool = Array.from(document.querySelectorAll(CLICKABLE)).filter(visible);
      const scoreOf = (el) => {
        const lb = (mode === 'field' ? fieldLabel(el) : labelOf(el)).toLowerCase();
        if (!lb) return 0;
        if (lb === want) return 100;
        if (lb.startsWith(want)) return 70 - Math.min(lb.length - want.length, 40) / 2;
        if (lb.includes(want)) return 50 - Math.min(lb.length - want.length, 40) / 2;
        const ws = want.split(' '); const hit = ws.filter(w => lb.includes(w)).length;
        return hit === ws.length ? 30 : hit / ws.length >= 0.6 ? 12 : 0;
      };
      let all = pool.map(el => [scoreOf(el), el]).filter(x => x[0] > 0);
      if (!all.length && mode !== 'field') {
        // any visible leaf element whose own text matches (cards, rows, menu entries)
        const walker = Array.from(document.querySelectorAll('#root *')).filter(el => el.children.length <= 2 && visible(el));
        all = walker.map(el => [norm(el.innerText).toLowerCase() === want ? 60 : norm(el.innerText).toLowerCase().includes(want) && el.innerText.length < want.length + 40 ? 25 : 0, el]).filter(x => x[0] > 0);
      }
      all.sort((a, b) => b[0] - a[0]);
      // drop ancestors of better matches (the innermost button wins)
      const els = []; for (const [, el] of all) { if (!els.some(e => e.contains(el) || el.contains(e))) els.push(el); }
      return { el: els[0] || null, all: els };
    }
    const nearby = () => Array.from(new Set(Array.from(document.querySelectorAll('button,a[href],[role=tab],[role=button]')).filter(visible).map(labelOf).filter(t => t && t.length < 40))).slice(0, 40);

    let ringEls = [];
    function clearRing() { ringEls.forEach(e => e.remove()); ringEls = []; }
    function ring(el, tip) {
      clearRing();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const place = () => {
        const r = el.getBoundingClientRect();
        const ringEl = document.createElement('div'); ringEl.className = 'sv-ring';
        Object.assign(ringEl.style, { left: (r.left - 6) + 'px', top: (r.top - 6) + 'px', width: (r.width + 12) + 'px', height: (r.height + 12) + 'px' });
        document.body.appendChild(ringEl); ringEls.push(ringEl);
        if (tip) {
          const t = document.createElement('div'); t.className = 'sv-tip'; t.textContent = tip;
          const below = r.bottom + 70 < window.innerHeight;
          Object.assign(t.style, { left: Math.max(8, Math.min(r.left, window.innerWidth - 270)) + 'px', top: (below ? r.bottom + 12 : Math.max(8, r.top - 52)) + 'px' });
          document.body.appendChild(t); ringEls.push(t);
        }
      };
      setTimeout(place, 350);
      const off = () => { clearRing(); document.removeEventListener('pointerdown', off, true); };
      setTimeout(() => document.addEventListener('pointerdown', off, true), 400);
      setTimeout(off, 9000);
    }

    function readScreen() {
      const root = document.getElementById('root') || document.body;
      const dialogs = Array.from(document.querySelectorAll('[role=dialog],[aria-modal=true]')).filter(visible)
        .map(dg => norm(dg.innerText).slice(0, 2500));
      const heads = Array.from(root.querySelectorAll('h1,h2,h3')).filter(visible).map(e => norm(e.innerText)).filter(Boolean).slice(0, 15);
      // innerText skips display:none, so hide Sevak's own panel for the read (no repaint happens in between)
      const mine = Array.from(document.querySelectorAll('[data-sevak]'));
      const prev = mine.map(e => e.style.display);
      mine.forEach(e => { e.style.display = 'none'; });
      let text = '';
      try { text = norm(root.innerText); } finally { mine.forEach((e, k) => { e.style.display = prev[k]; }); }
      const buttons = nearby();
      const fields = Array.from(document.querySelectorAll('input:not([type=hidden]),textarea,select')).filter(visible).slice(0, 30)
        .map(el => ({ field: fieldLabel(el) || el.type, value: el.type === 'password' ? '••••' : String(el.value || '').slice(0, 80) }));
      return {
        route: location.hash || '#/', title: document.title, headings: heads,
        open_dialogs: dialogs.length ? dialogs : undefined,
        text: text.length > 7000 ? text.slice(0, 7000) + ' …(more on the page)' : text,
        buttons, fields,
      };
    }
    function pageNote() {
      const heads = Array.from(document.querySelectorAll('#root h1,#root h2')).filter(visible).map(e => norm(e.innerText)).filter(Boolean).slice(0, 3);
      const dlg = Array.from(document.querySelectorAll('[role=dialog],[aria-modal=true]')).filter(visible).length;
      return `<page route="${location.hash || '#/'}"${heads.length ? ` headings="${heads.join(' / ').replace(/"/g, "'")}"` : ''}${dlg ? ' dialog_open="yes"' : ''}/>`;
    }

    // ---- risk -------------------------------------------------------------------
    const RISKY_NAME = /delete|purge|remove|revoke|trash|archive|send|email|whatsapp|publish|invoice|payment|refund|credit_note|expense|razorpay|subscription|payout|role|permission|password|api_key|2fa|totp|bulk|import|tenant|org_|team_member|tm_|calendar_ready|portal/i;
    // Post edits only need a yes when they reach the client or publishing; rescheduling,
    // captions, notes and internal statuses go straight through.
    const CLIENT_FACING_STATUS = /^(sent_to_client|approved|scheduled|posted)$/;
    const riskOf = (entry, nm, args) => {
      if (nm === 'content_update') {
        const p = (args && args.p_patch) || {};
        return ('client_approval' in p) || ('scheduled_publish_at' in p) || CLIENT_FACING_STATUS.test(String(p.workflow_status || '')) ? 'high' : 'low';
      }
      return entry ? entry.risk : 'high';
    };
    const RISKY_CLICK = /\b(delete|remove|trash|purge|archive|revoke|send|publish|pay|approve all|cancel (invoice|subscription)|refund|sign out|log ?out|calendar ready|record payment|mark paid)\b/i;

    // ---- the browser side of a tool call ---------------------------------------
    // ctx: { user, askApproval(card) → Promise<bool>, setStep(patch) }
    const trimResult = (v) => {
      let s; try { s = JSON.stringify(v === undefined ? null : v); } catch (_) { s = String(v); }
      if (s.length > 24000) {
        const n = Array.isArray(v) ? ` (${v.length} items)` : '';
        s = s.slice(0, 24000) + ` …[cut off${n} — ask for fewer rows or add filters]`;
      }
      return s;
    };
    const rpcErr = (e) => {
      const m = String((e && (e.message || e.details || e.hint)) || e || 'error');
      if (e && (e.code === 'forbidden' || /forbidden/i.test(m))) return 'forbidden: this person\'s role is not allowed to do that';
      return (e && e.code ? e.code + ': ' : '') + m.slice(0, 600);
    };
    function postsFromSheet(att, spec) {
      const sheetName = spec.sheet && att.sheets[spec.sheet] ? spec.sheet : Object.keys(att.sheets)[0];
      const rows = att.sheets[sheetName] || [];
      if (rows.length < 2) throw new Error('The sheet has no rows.');
      const head = rows[0].map(x => norm(x).toLowerCase());
      const col = {};
      Object.entries(spec.columns || {}).forEach(([field, header]) => {
        const i = head.indexOf(norm(header).toLowerCase());
        if (i < 0) throw new Error(`Column "${header}" isn’t in the sheet. Columns: ${rows[0].join(', ')}`);
        col[field] = i;
      });
      if (col.post_date == null || col.title == null) throw new Error('The column map needs at least post_date and title.');
      const tmap = Object.fromEntries(Object.entries(spec.type_map || {}).map(([k, v]) => [norm(k).toLowerCase(), v]));
      const toType = (v) => {
        const s = norm(v).toLowerCase();
        if (tmap[s]) return tmap[s];
        if (/reel|video/.test(s)) return 'reel';
        if (/carou/.test(s)) return 'carousel';
        if (/static|graphic|creative|post|image|design/.test(s)) return 'creative';
        if (/story|extra/.test(s)) return 'extra';
        return s;
      };
      const toDate = (v) => {
        const s = norm(v); if (!s) return '';
        let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
        if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s);           // Indian order: DD/MM/YYYY
        if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
        m = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(s);
        if (m && spec.year && spec.month) return `${spec.year}-${String(spec.month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        const t = Date.parse(s + (spec.year && !/\d{4}/.test(s) ? ' ' + spec.year : ''));
        if (!isNaN(t)) { const dt = new Date(t); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; }
        return s;
      };
      const posts = [];
      rows.slice(1).forEach(r => {
        const get = (f) => (col[f] == null ? '' : norm(r[col[f]]));
        const title = get('title'); const date = toDate(get('post_date'));
        if (!title && !date) return;
        if (/^skip$/i.test(title)) return;
        const p = { post_date: date, type: toType(col.type != null ? r[col.type] : ''), title };
        ['concept', 'heading', 'sub_heading', 'caption', 'hashtags', 'content_pillar', 'posting_time', 'designer_notes', 'editor_notes', 'production_notes', 'maker', 'production_date']
          .forEach(f => { const v = col[f] == null ? '' : String(r[col[f]] == null ? '' : r[col[f]]).trim(); if (v) p[f] = f === 'production_date' ? toDate(v) : v; });
        if (col.reference_links != null) { const v = String(r[col.reference_links] || '').trim(); if (v) p.reference_links = v.split(/[\s,]+/).filter(Boolean); }
        if (!p.maker && spec.makers && spec.makers[p.type]) p.maker = spec.makers[p.type];
        posts.push(p);
      });
      return posts;
    }
    function emitTaskChange(name, args, res) {
      if (!taskBus || typeof taskBus.emit !== 'function') return;
      try {
        const id = args && (args.p_id || args.p_task_id);
        if (/^task_create/.test(name) && res && res.id) taskBus.emit('task:created', { row: res });
        else if (id) taskBus.emit('task:changed', { id });
        else taskBus.emit('meta:changed');
      } catch (_) { /* best effort */ }
    }

    async function execTool(name, input, ctx) {
      const i = input || {};
      switch (name) {
        case 'find_actions': {
          ctx.setStep({ label: `Looking up how to “${String(i.query || '').slice(0, 50)}”`, icon: 'ti-search' });
          return await findActions(i.query, i.area);
        }
        case 'run_action': {
          const nm = String(i.name || '').trim();
          if (!/^[a-z][a-z0-9_]*$/.test(nm)) return { error: 'bad action name' };
          const list = await loadCatalog();
          const entry = list.find(a => a.name === nm);
          if (entry && (entry.portal_only || entry.no_session)) return { error: 'That action can’t be run from Sevak.' };
          const args = Object.assign({}, i.args || {}); delete args.p_session;
          const summary = norm(i.summary) || nm.replace(/_/g, ' ');
          const read = entry && entry.kind === 'read';
          const big = !entry || riskOf(entry, nm, args) === 'high' || (!read && nm !== 'content_update' && RISKY_NAME.test(nm)) || i.needs_confirmation === true;
          ctx.setStep({ label: summary, icon: read ? 'ti-database-search' : 'ti-bolt' });
          if (big) {
            const ok = await ctx.askApproval({ title: entry ? 'Sevak wants to make this change' : 'Sevak wants to run an action it doesn’t know well',
              summary, details: nm + '\n' + JSON.stringify(args, null, 2) });
            if (!ok) return { declined: true, note: 'The person said no. Don’t retry unless they ask.' };
          }
          try {
            const res = await rpcCall(nm, args);
            if (!read) emitTaskChange(nm, args, res);
            return { ok: true, result: res === undefined ? null : res };
          } catch (e) {
            if (isMissingRpc(e)) return { error: `No server action named ${nm} with those arguments. Check find_actions for the exact name and argument names.` };
            return { error: rpcErr(e) };
          }
        }
        case 'navigate': {
          let to = String(i.to || '').trim().replace(/^#?\/?/, '');
          ctx.setStep({ label: 'Opening ' + (to || 'Home'), icon: 'ti-arrow-right' });
          if (/^task\/[\w-]+$/.test(to)) { openTask(to.split('/')[1]); await sleep(500); return { ok: true, opened: 'task panel' }; }
          location.hash = '#/' + to;
          await sleep(900);
          const heads = Array.from(document.querySelectorAll('#root h1,#root h2')).filter(visible).map(e => norm(e.innerText)).filter(Boolean).slice(0, 3);
          return { ok: true, now_at: location.hash, headings: heads, note: location.hash.replace(/^#\/?/, '') !== to ? 'The dashboard redirected — this page may not exist for this role.' : undefined };
        }
        case 'open_task': {
          ctx.setStep({ label: 'Opening the task', icon: 'ti-layout-sidebar-right' });
          if (!i.task_id) return { error: 'task_id missing' };
          openTask(String(i.task_id)); await sleep(500);
          return { ok: true };
        }
        case 'read_screen': {
          ctx.setStep({ label: 'Reading your screen', icon: 'ti-eye' });
          return readScreen();
        }
        case 'point_at': {
          ctx.setStep({ label: `Pointing at “${String(i.target || '').slice(0, 40)}”`, icon: 'ti-pointer' });
          const { el } = findEl(i.target, 'any'); const f = el ? null : findEl(i.target, 'field');
          const tgt = el || (f && f.el);
          if (!tgt) return { found: false, visible_buttons: nearby() };
          ctx.minimize && ctx.minimize();
          ring(tgt, i.tip ? String(i.tip).slice(0, 160) : '');
          return { found: true, label: labelOf(tgt).slice(0, 80) };
        }
        case 'click': {
          const { all } = findEl(i.target, 'click');
          const el = all[Math.max(0, (Number(i.nth) || 1) - 1)];
          if (!el) return { clicked: false, visible_buttons: nearby() };
          const lb = labelOf(el).slice(0, 80);
          ctx.setStep({ label: `Clicking “${lb}”`, icon: 'ti-click' });
          if (RISKY_CLICK.test(lb)) {
            const ok = await ctx.askApproval({ title: 'Sevak wants to press a button', summary: `Press “${lb}” on this page.` });
            if (!ok) return { declined: true };
          }
          const before = location.hash;
          el.scrollIntoView({ block: 'center' });
          el.click();
          await sleep(700);
          const dlg = Array.from(document.querySelectorAll('[role=dialog],[aria-modal=true]')).filter(visible).map(x => norm(x.innerText).slice(0, 300));
          return { clicked: true, label: lb, now_at: location.hash !== before ? location.hash : undefined, dialogs: dlg.length ? dlg : undefined };
        }
        case 'type_text': {
          const { el } = findEl(i.field, 'field');
          if (!el) return { typed: false, fields: Array.from(document.querySelectorAll('input:not([type=hidden]),textarea')).filter(visible).map(fieldLabel).filter(Boolean).slice(0, 25) };
          ctx.setStep({ label: `Typing into “${fieldLabel(el).slice(0, 40)}”`, icon: 'ti-keyboard' });
          const text = String(i.text == null ? '' : i.text);
          el.focus();
          if (el.isContentEditable) { document.execCommand('selectAll', false); document.execCommand('insertText', false, text); }
          else if (el.tagName === 'SELECT') {
            const opt = Array.from(el.options).find(o => norm(o.text).toLowerCase() === norm(text).toLowerCase() || o.value === text);
            if (!opt) return { typed: false, options: Array.from(el.options).map(o => o.text).slice(0, 40) };
            el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
            el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (i.submit) {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            if (el.form && typeof el.form.requestSubmit === 'function') el.form.requestSubmit();
          }
          await sleep(300);
          return { typed: true };
        }
        case 'db_read': {
          if (!PRIV(ctx.user && ctx.user.role_level)) return { error: 'forbidden: only admins and managers can read tables directly. Use find_actions.' };
          const table = String(i.table || '');
          if (!/^[a-z_][a-z0-9_]*$/.test(table)) return { error: 'bad table name' };
          let q = String(i.query || '').replace(/^\?/, '');
          if (!/(^|&)limit=/.test(q)) q += (q ? '&' : '') + 'limit=200';
          ctx.setStep({ label: 'Checking ' + table.replace(/_/g, ' '), icon: 'ti-database-search' });
          const hd = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
          const tok = getSessionToken(); if (tok) hd['x-ams-session'] = tok;
          try {
            const r = await fetch(`${SB_URL}/rest/v1/${table}?${q}`, { headers: hd });
            const body = await r.text();
            if (!r.ok) return { error: `HTTP ${r.status}: ${body.slice(0, 300)}` };
            const rows = JSON.parse(body || '[]');
            return { rows: rows.length, data: rows };
          } catch (e) { return { error: String(e && e.message || e) }; }
        }
        case 'read_attachment': {
          const att = ATT.get(String(i.attachment_id || ''));
          if (!att) return { error: 'That file is no longer loaded (the page was reloaded). Ask the person to attach it again.' };
          ctx.setStep({ label: 'Reading ' + att.name, icon: 'ti-file-text' });
          if (att.kind === 'sheet') {
            const sn = i.sheet && att.sheets[i.sheet] ? i.sheet : Object.keys(att.sheets)[0];
            const rows = att.sheets[sn]; const total = rows.length - 1;
            const a = Math.max(1, Number(i.start_row) || 1), b = Math.min(total, Number(i.end_row) || a + 99);
            return { sheet: sn, sheets: Object.keys(att.sheets), total_rows: total, header: rows[0], rows: rows.slice(a, b + 1), from: a, to: b };
          }
          if (att.kind === 'text') {
            const a = Math.max(0, Number(i.start_row) || 0);
            return { total_chars: att.text.length, text: att.text.slice(a, a + 40000) };
          }
          return { note: 'This file was given to you directly in the message (image / PDF).' };
        }
        case 'load_calendar': {
          let posts = Array.isArray(i.posts) ? i.posts : null;
          if (!posts && i.from_attachment) {
            const att = ATT.get(String(i.from_attachment.attachment_id || ''));
            if (!att || att.kind !== 'sheet') return { error: 'That sheet isn’t loaded. Ask the person to attach it again.' };
            try { posts = postsFromSheet(att, i.from_attachment); } catch (e) { return { error: String(e.message || e) }; }
          }
          if (!posts || !posts.length) return { error: 'No posts to load.' };
          if (!i.client_id) return { error: 'client_id missing' };
          const bad = posts.filter(p => !/^\d{4}-\d{2}-\d{2}$/.test(String(p.post_date || '')) || !['reel', 'creative', 'carousel', 'extra'].includes(p.type) || !norm(p.title));
          if (bad.length) return { error: `${bad.length} row(s) have no valid date, type or title`, examples: bad.slice(0, 5) };
          const byType = posts.reduce((m, p) => (m[p.type] = (m[p.type] || 0) + 1, m), {});
          const makers = posts.reduce((m, p) => { if (p.maker) m[p.maker] = (m[p.maker] || 0) + 1; return m; }, {});
          const dates = posts.map(p => p.post_date).sort();
          const subs = posts.reduce((n, p) => n + (Array.isArray(p.subtasks) ? p.subtasks.length : 0), 0);
          ctx.setStep({ label: norm(i.summary) || `Loading ${posts.length} posts`, icon: 'ti-calendar-plus' });
          const ok = await ctx.askApproval({
            title: 'Load this content calendar?', summary: norm(i.summary) || `${posts.length} posts`,
            facts: [
              `${posts.length} posts · ${Object.entries(byType).map(([t, n]) => n + ' ' + t + (n === 1 ? '' : 's')).join(', ')}`,
              `${fmtDay(dates[0])} → ${fmtDay(dates[dates.length - 1])}`,
              Object.keys(makers).length ? 'Made by: ' + Object.entries(makers).map(([m, n]) => `${m} (${n})`).join(', ') : 'No makers set (posts stay unassigned)',
              subs ? `${subs} production subtasks` : null,
              'Posts start as “briefed”. Nothing is sent to the client.',
            ].filter(Boolean),
            list: posts.slice().sort((a, b) => a.post_date.localeCompare(b.post_date)).map(p => `${fmtDay(p.post_date)} · ${p.type} · ${p.title}`),
            allowLabel: 'Load calendar',
          });
          if (!ok) return { declined: true };
          try {
            const res = await rpcCall('sevak_calendar_load', { p_client_id: i.client_id, p_posts: posts, p_options: i.options || {} });
            emitTaskChange('calendar', null, null);
            const out = Object.assign({}, res);
            if (Array.isArray(out.posts) && out.posts.length > 40) out.posts = out.posts.slice(0, 40).concat([{ more: out.posts.length - 40 }]);
            return { ok: true, result: out };
          } catch (e) {
            if (isMissingRpc(e)) return { error: 'The calendar loader isn’t installed (database update 151).' };
            return { error: rpcErr(e) };
          }
        }
        case 'write_caption': {
          // Same engine as the "Generate with AI" button: reels are watched in full (Gemini),
          // images are read, Claude writes. Nothing is saved here — Sevak saves with content_update.
          if (!i.post_id) return { error: 'post_id missing' };
          if (!generatePostCaption) return { error: 'The caption writer isn’t available on this page. Reload the dashboard.' };
          ctx.setStep({ label: 'Watching the creative and writing the caption', icon: 'ti-sparkles' });
          const res = await generatePostCaption(String(i.post_id), i.brief ? String(i.brief).slice(0, 1000) : '');
          if (!res || res.ok === false) {
            const err = String((res && res.error) || 'failed');
            if (err === 'drive_not_shared' || /drive_(get|list|media)_(403|404)/.test(err)) {
              return { error: 'drive_not_shared: the dashboard can’t open this Drive file. Ask the person to share the folder with ams-drive-preview@ams-dashboard-496318.iam.gserviceaccount.com as Viewer, then try again.' };
            }
            return { error: err };
          }
          return res;
        }
        default:
          return { error: 'unknown tool ' + name };
      }
    }
    const fmtDay = (iso) => {
      const dt = new Date(String(iso) + 'T00:00:00');
      if (isNaN(dt)) return String(iso || '');
      return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    };

    // ---- streaming call to the sevak function ------------------------------------
    async function callSevak(messages, step, { onText, onTool, signal }) {
      const token = getSessionToken();
      if (!token) { const e = new Error('auth'); e.code = 'auth.invalid_session'; throw e; }
      let res;
      try {
        res = await fetch(SB_URL + '/functions/v1/sevak', {
          method: 'POST', signal,
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SB_KEY, apikey: SB_KEY },
          body: JSON.stringify({ session_token: token, messages, step: !!step }),
        });
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        const er = new Error('network'); er.code = 'network'; throw er;
      }
      const ctype = res.headers.get('content-type') || '';
      if (!res.ok || !ctype.includes('text/event-stream')) {
        let j = null; try { j = await res.json(); } catch (_) { /* not json */ }
        const er = new Error((j && j.error) || ('http_' + res.status));
        er.code = (j && j.error) || (res.status === 404 ? 'sevak.not_installed' : 'http_' + res.status); er.detail = j && j.detail;
        throw er;
      }
      const reader = res.body.getReader(); const dec = new TextDecoder();
      let buf = '', done = null, fail = null;
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
          let ev = 'message', data = '';
          chunk.split('\n').forEach(line => {
            if (line.startsWith('event:')) ev = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          });
          if (!data) continue;
          let obj; try { obj = JSON.parse(data); } catch (_) { continue; }
          if (ev === 'text') onText && onText(obj.t || '');
          else if (ev === 'tool') onTool && onTool(obj.name);
          else if (ev === 'done') done = obj;
          else if (ev === 'error') fail = obj;
        }
      }
      if (fail) { const er = new Error(fail.error); er.code = fail.error; er.detail = fail.detail; throw er; }
      if (!done) { const er = new Error('cut'); er.code = 'ai.upstream_error'; er.detail = 'stream ended early'; throw er; }
      return done;
    }

    // ---- tiny markdown → React (no innerHTML) --------------------------------------
    function inline(text, key) {
      const out = []; let rest = String(text); let n = 0;
      const rx = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/;
      while (rest) {
        const m = rx.exec(rest);
        if (!m) { out.push(rest); break; }
        if (m.index) out.push(rest.slice(0, m.index));
        const t = m[0];
        if (t.startsWith('**')) out.push(h`<strong key=${key + '-' + n++}>${t.slice(2, -2)}</strong>`);
        else if (t.startsWith('`')) out.push(h`<code key=${key + '-' + n++}>${t.slice(1, -1)}</code>`);
        else if (t.startsWith('[')) {
          const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t);
          const href = lm[2];
          if (/^#\//.test(href)) out.push(h`<a key=${key + '-' + n++} onClick=${(e) => { e.preventDefault(); location.hash = href; }}>${lm[1]}</a>`);
          else if (/^https?:\/\//i.test(href)) out.push(h`<a key=${key + '-' + n++} href=${href} target="_blank" rel="noopener noreferrer">${lm[1]}</a>`);
          else out.push(lm[1]);
        } else out.push(h`<em key=${key + '-' + n++}>${t.slice(1, -1)}</em>`);
        rest = rest.slice(m.index + t.length);
      }
      return out;
    }
    function Markdown({ text }) {
      const lines = String(text || '').replace(/\r/g, '').split('\n');
      const blocks = []; let list = null; let para = [];
      const flushPara = () => { if (para.length) { blocks.push({ t: 'p', lines: para }); para = []; } };
      const flushList = () => { if (list) { blocks.push(list); list = null; } };
      lines.forEach(ln => {
        const b = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(ln);
        const hd = /^#{1,4}\s+(.*)$/.exec(ln);
        if (b) { flushPara(); const ordered = !!b[1]; if (!list || list.ordered !== ordered) { flushList(); list = { t: 'list', ordered, items: [] }; } list.items.push(b[2]); }
        else if (hd) { flushPara(); flushList(); blocks.push({ t: 'h', text: hd[1] }); }
        else if (!ln.trim()) { flushPara(); flushList(); }
        else { flushList(); para.push(ln); }
      });
      flushPara(); flushList();
      return h`<${React.Fragment}>${blocks.map((b, i) => b.t === 'p'
        ? h`<p key=${i}>${b.lines.map((l, j) => h`<${React.Fragment} key=${j}>${j ? h`<br/>` : null}${inline(l, i + '-' + j)}<//>`)}</p>`
        : b.t === 'h' ? h`<h4 key=${i}>${inline(b.text, 'h' + i)}</h4>`
        : b.ordered ? h`<ol key=${i}>${b.items.map((it, j) => h`<li key=${j}>${inline(it, i + '-' + j)}</li>`)}</ol>`
        : h`<ul key=${i}>${b.items.map((it, j) => h`<li key=${j}>${inline(it, i + '-' + j)}</li>`)}</ul>`)}<//>`;
    }

    // ---- persistence ----------------------------------------------------------------
    const storeKey = (u) => 'ams_sevak_chat_' + (u && u.id || 'me');
    const loadChat = (u) => {
      try { const j = JSON.parse(localStorage.getItem(storeKey(u)) || 'null'); if (j && Array.isArray(j.api) && Array.isArray(j.view)) return j; } catch (_) { /* none */ }
      return { api: [], view: [] };
    };
    const saveChat = (u, chat) => {
      try {
        const s = JSON.stringify({ api: chat.api, view: chat.view.filter(v => v.kind !== 'approval' || v.state !== 'pending') });
        if (s.length < 3500000) localStorage.setItem(storeKey(u), s); else localStorage.removeItem(storeKey(u));
      } catch (_) { try { localStorage.removeItem(storeKey(u)); } catch (__) { /* private mode */ } }
    };

    const SUGGEST = {
      admin: ['What’s overdue across the team today?', 'Load a content calendar for a client', 'Who is on leave today?', 'Which invoices are unpaid?'],
      manager: ['What’s overdue across the team today?', 'Load a content calendar for a client', 'Posts going live tomorrow', 'Who is on leave today?'],
      accounts_head: ['Which invoices are unpaid?', 'This month’s GST summary', 'Payments received this week'],
      seo: ['My SEO tasks this week', 'Which SEO reports are due?', 'Show me where to add keywords'],
      editor: ['What are my tasks today?', 'Mark my current task as done', 'Where do I upload my edited video?'],
      designer: ['What are my tasks today?', 'Mark my current task as done', 'Where do I upload my design?'],
    };

    // =============================================================================
    function SevakDock({ user }) {
      const [open, setOpen] = useState(false);
      const [wide, setWide] = useState(false);
      const [chat, setChat] = useState(() => loadChat(user));
      const [live, setLive] = useState('');          // streaming assistant text
      const [busy, setBusy] = useState(false);
      const [input, setInput] = useState('');
      const [files, setFiles] = useState([]);        // { att, blocks } pending for the next message
      const [fileBusy, setFileBusy] = useState(false);
      const [drag, setDrag] = useState(false);
      const [listening, setListening] = useState(false);
      const chatRef = useRef(chat);
      const abortRef = useRef(null);
      const approvals = useRef(new Map());
      const bodyRef = useRef(null), taRef = useRef(null), fileRef = useRef(null), recRef = useRef(null);
      const first = String((user && user.name) || '').split(' ')[0] || 'there';

      useEffect(() => { const c = loadChat(user); chatRef.current = c; setChat(c); }, [user && user.id]);
      useEffect(() => { if (!busy) saveChat(user, chat); }, [chat, busy]);
      useEffect(() => {
        const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight;
      }, [chat, live, open]);
      useEffect(() => {
        const onKey = (e) => {
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'j' || e.key === 'J')) { e.preventDefault(); setOpen(o => !o); }
        };
        const onOpen = (e) => { setOpen(true); const t = e && e.detail && e.detail.text; if (t) setInput(String(t)); };
        window.addEventListener('keydown', onKey); window.addEventListener('ams-sevak-open', onOpen);
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('ams-sevak-open', onOpen); };
      }, []);
      useEffect(() => { if (open) { setTimeout(() => taRef.current && taRef.current.focus(), 60); loadCatalog(); } }, [open]);

      // chatRef is the source of truth (the loop reads it right after writing); state mirrors it.
      const update = (fn) => { const c = chatRef.current; const n = fn({ api: c.api.slice(), view: c.view.slice() }); chatRef.current = n; setChat(n); };
      const pushView = (item) => { const id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); update(c => (c.view.push(Object.assign({ id }, item)), c)); return id; };
      const patchView = (id, patch) => update(c => (c.view = c.view.map(v => (v.id === id ? Object.assign({}, v, patch) : v)), c));

      const askApproval = (card) => new Promise(resolve => {
        const id = pushView(Object.assign({ kind: 'approval', state: 'pending' }, card));
        approvals.current.set(id, resolve);
        setOpen(true);
      });
      const answer = (id, ok) => {
        const r = approvals.current.get(id); if (!r) return;
        approvals.current.delete(id); patchView(id, { state: ok ? 'allowed' : 'declined' }); r(ok);
      };

      // one user message → as many model turns as the tools need
      async function run(userContent) {
        const ac = new AbortController(); abortRef.current = ac;
        setBusy(true);
        update(c => (c.api.push({ role: 'user', content: userContent }), c));
        let step = false;
        try {
          for (let turn = 0; turn < 40; turn++) {
            let text = ''; setLive('');
            const done = await callSevak(chatRef.current.api, step, {
              signal: ac.signal,
              onText: (t) => { text += t; setLive(text); },
              onTool: () => {},
            });
            const msg = done.message;
            update(c => (c.api.push(msg), c));
            const said = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
            setLive('');
            if (said) pushView({ kind: 'a', text: said });
            const uses = (msg.content || []).filter(b => b.type === 'tool_use');
            if (done.stop_reason === 'refusal') { pushView({ kind: 'err', text: 'Sevak can’t help with that one.' }); break; }
            if (!uses.length) {
              if (done.stop_reason === 'max_tokens') pushView({ kind: 'err', text: 'That answer was too long and got cut off. Ask for a shorter version.' });
              break;
            }
            // run every tool call, then return all results in ONE user message
            const results = [];
            for (const u of uses) {
              if (ac.signal.aborted) { results.push({ type: 'tool_result', tool_use_id: u.id, content: 'Stopped by the person.', is_error: true }); continue; }
              if (done.stop_reason === 'max_tokens') { results.push({ type: 'tool_result', tool_use_id: u.id, content: 'Your output was cut off before this call was complete. Split the work into smaller calls.', is_error: true }); continue; }
              const sid = pushView({ kind: 'step', label: u.name.replace(/_/g, ' '), icon: 'ti-loader-2', state: 'run' });
              let out;
              try {
                out = await execTool(u.name, u.input, {
                  user, askApproval,
                  setStep: (p) => patchView(sid, p),
                  minimize: () => { if (window.innerWidth < 760) setOpen(false); },
                });
              } catch (e) { out = { error: String((e && e.message) || e) }; }
              const failed = !!(out && (out.error || out.declined));
              patchView(sid, { state: out && out.declined ? 'declined' : failed ? 'err' : 'ok', err: out && out.error ? String(out.error).slice(0, 200) : undefined });
              results.push({ type: 'tool_result', tool_use_id: u.id, content: trimResult(out), is_error: !!(out && out.error) || undefined });
            }
            update(c => (c.api.push({ role: 'user', content: results }), c));
            if (ac.signal.aborted) { pushView({ kind: 'note', text: 'Stopped.' }); break; }
            step = true;
          }
        } catch (e) {
          setLive('');
          if (e && e.name === 'AbortError') {
            pushView({ kind: 'note', text: 'Stopped.' });
          } else {
            pushView({ kind: 'err', text: errText(e && e.code, e && e.detail) });
          }
          // A typed message that never got an answer is dropped so a retry doesn't send it
          // twice. Tool results stay: they answer the assistant's tool calls before them.
          update(c => {
            const last = c.api[c.api.length - 1];
            if (last && last.role === 'user' && !(last.content || []).some(b => b.type === 'tool_result')) c.api.pop();
            return c;
          });
        } finally {
          approvals.current.forEach((r) => r(false)); approvals.current.clear();
          abortRef.current = null; setBusy(false); setLive('');
        }
      }

      const send = (textArg) => {
        const text = String(textArg != null ? textArg : input).trim();
        if (busy || fileBusy || (!text && !files.length)) return;
        const content = [{ type: 'text', text: pageNote() }];
        files.forEach(f => content.push(...f.blocks));
        content.push({ type: 'text', text: text || '(see attachment)' });
        pushView({ kind: 'u', text: text, files: files.map(f => f.att.name) });
        setInput(''); setFiles([]);
        if (taRef.current) taRef.current.style.height = '';
        run(content);
      };
      const stop = () => { if (abortRef.current) abortRef.current.abort(); approvals.current.forEach(r => r(false)); approvals.current.clear(); };
      const newChat = () => { if (busy) return; const empty = { api: [], view: [] }; chatRef.current = empty; setChat(empty); saveChat(user, empty); };

      const addFiles = async (list) => {
        const arr = Array.from(list || []); if (!arr.length) return;
        setFileBusy(true);
        for (const f of arr.slice(0, 5)) {
          try { const r = await ingestFile(f); setFiles(x => x.concat(r)); }
          catch (e) { pushView({ kind: 'err', text: `Couldn’t read ${f.name}: ${e.message || e}` }); }
        }
        setFileBusy(false);
      };
      const onPaste = (e) => {
        const items = Array.from((e.clipboardData && e.clipboardData.files) || []);
        if (items.length) { e.preventDefault(); addFiles(items); }
      };
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const toggleMic = () => {
        if (!SR) return;
        if (listening && recRef.current) { recRef.current.stop(); return; }
        const rec = new SR(); recRef.current = rec;
        rec.lang = 'en-IN'; rec.interimResults = true; rec.continuous = false;
        const base = input ? input.trim() + ' ' : '';
        rec.onresult = (ev) => { let t = ''; for (let k = 0; k < ev.results.length; k++) t += ev.results[k][0].transcript; setInput(base + t); };
        rec.onend = () => setListening(false); rec.onerror = () => setListening(false);
        setListening(true); rec.start();
      };

      const role = (user && user.role_level) || '';
      const sugg = SUGGEST[role] || SUGGEST.manager;

      const renderItem = (v) => {
        if (v.kind === 'u') return h`<div key=${v.id} class="sv-msg u">${v.text}${v.files && v.files.length ? h`<div class="sv-files">${v.files.map((f, i) => h`<span key=${i} class="sv-file"><i class="ti ti-paperclip"></i> ${f}</span>`)}</div>` : null}</div>`;
        if (v.kind === 'a') return h`<div key=${v.id} class="sv-msg a"><${Markdown} text=${v.text}/></div>`;
        if (v.kind === 'step') {
          const ic = v.state === 'run' ? 'ti-loader-2 sv-spin' : v.state === 'ok' ? 'ti-check' : v.state === 'declined' ? 'ti-hand-stop' : 'ti-alert-triangle';
          return h`<div key=${v.id} class=${'sv-step' + (v.state === 'err' ? ' err' : v.state === 'ok' ? ' ok' : '')} title=${v.err || v.label}>
            <i class=${'ti ' + ic} aria-hidden="true"></i><span>${v.label}${v.state === 'declined' ? ' — cancelled' : ''}</span></div>`;
        }
        if (v.kind === 'approval') {
          const pending = v.state === 'pending';
          return h`<div key=${v.id} class=${'sv-card' + (pending ? '' : ' done')} role="group" aria-label=${v.title}>
            <div class="sv-card-t"><i class="ti ti-shield-check" style=${{ color: 'var(--sv-brand)' }}></i>${v.title}</div>
            <div class="sv-card-s">${v.summary}</div>
            ${v.facts && h`<ul class="sv-card-list" style=${{ color: 'var(--sv-t1)' }}>${v.facts.map((f, i) => h`<li key=${i}>${f}</li>`)}</ul>`}
            ${v.list && h`<details><summary style=${{ cursor: 'pointer', fontSize: 12.5, color: 'var(--sv-t2)' }}>See all ${v.list.length}</summary><ul class="sv-card-list">${v.list.map((f, i) => h`<li key=${i}>${f}</li>`)}</ul></details>`}
            ${v.details && h`<details><summary style=${{ cursor: 'pointer', fontSize: 12.5, color: 'var(--sv-t2)' }}>Details</summary><div class="sv-card-d">${v.details}</div></details>`}
            ${pending ? h`<div class="sv-row">
                <button class="sv-btn pri" onClick=${() => answer(v.id, true)}>${v.allowLabel || 'Allow'}</button>
                <button class="sv-btn" onClick=${() => answer(v.id, false)}>Cancel</button></div>`
              : h`<div style=${{ fontSize: 12, color: 'var(--sv-t3)' }}>${v.state === 'allowed' ? '✓ You allowed this' : '✕ Cancelled'}</div>`}
          </div>`;
        }
        if (v.kind === 'err') return h`<div key=${v.id} class="sv-step err" style=${{ whiteSpace: 'normal' }}><i class="ti ti-alert-circle"></i><span style=${{ whiteSpace: 'normal' }}>${v.text}</span></div>`;
        return h`<div key=${v.id} class="sv-hint">${v.text}</div>`;
      };

      return h`<div class="sv-root" data-sevak="1">
        ${!open && h`<button class=${'sv-fab' + (busy ? ' sv-fab-busy' : '')} onClick=${() => setOpen(true)} aria-label="Open Sevak (Ctrl+J)" title="Ask Sevak (Ctrl+J)">स</button>`}
        ${open && h`<div class=${'sv-panel' + (wide ? ' sv-wide' : '')} role="dialog" aria-label="Sevak"
            onDragOver=${(e) => { e.preventDefault(); setDrag(true); }} onDragLeave=${(e) => { if (e.currentTarget === e.target) setDrag(false); }}
            onDrop=${(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer && e.dataTransfer.files); }}>
          ${drag && h`<div class="sv-drop">Drop files for Sevak</div>`}
          <div class="sv-hd">
            <div class="sv-logo" aria-hidden="true">स</div>
            <div><div class="sv-ttl">Sevak</div><div class="sv-sub">${busy ? 'Working…' : 'Your dashboard helper'}</div></div>
            <span class="sv-grow"></span>
            <button class="sv-ibtn" title="New chat" aria-label="New chat" disabled=${busy} onClick=${newChat}><i class="ti ti-message-plus"></i></button>
            <button class="sv-ibtn" title=${wide ? 'Narrow' : 'Wider'} aria-label="Toggle width" onClick=${() => setWide(w => !w)}><i class=${'ti ' + (wide ? 'ti-arrows-diagonal-minimize-2' : 'ti-arrows-diagonal')}></i></button>
            <button class="sv-ibtn" title="Close (Esc)" aria-label="Close Sevak" onClick=${() => setOpen(false)}><i class="ti ti-x"></i></button>
          </div>
          <div class="sv-body" ref=${bodyRef} onKeyDown=${(e) => { if (e.key === 'Escape') setOpen(false); }}>
            ${!chat.view.length && h`<div class="sv-hello">
              <b>Namaste ${first}! 🙏</b>
              <div style=${{ fontSize: 13.5, color: 'var(--sv-t2)', lineHeight: 1.5 }}>I’m Sevak. Ask me anything about the dashboard, or tell me what to do: “move Refresh’s Diwali reel to Thursday”, “what’s overdue?”, “show me where to upload a file”. You can also drop a calendar sheet or a photo here.</div>
              <div class="sv-chips">${sugg.map(s => h`<button key=${s} class="sv-chip" onClick=${() => send(s)}>${s}</button>`)}</div>
            </div>`}
            ${chat.view.map(renderItem)}
            ${live && h`<div class="sv-msg a sv-cursor"><${Markdown} text=${live}/></div>`}
            ${busy && !live && !chat.view.some(v => (v.kind === 'step' && v.state === 'run') || (v.kind === 'approval' && v.state === 'pending')) && h`<div class="sv-step"><i class="ti ti-loader-2 sv-spin"></i><span>Thinking…</span></div>`}
          </div>
          <div class="sv-ft">
            ${(files.length > 0 || fileBusy) && h`<div class="sv-row">
              ${files.map((f, i) => h`<span key=${f.att.id} class="sv-att"><i class="ti ti-paperclip"></i>${f.att.name}
                <button class="sv-ibtn" style=${{ width: 18, height: 18, fontSize: 12 }} aria-label=${'Remove ' + f.att.name} onClick=${() => setFiles(x => x.filter((_, j) => j !== i))}><i class="ti ti-x"></i></button></span>`)}
              ${fileBusy && h`<span class="sv-att"><i class="ti ti-loader-2 sv-spin"></i>Reading…</span>`}
            </div>`}
            <div class="sv-in">
              <textarea ref=${taRef} class="sv-ta" rows="1" placeholder=${listening ? 'Listening…' : 'Ask Sevak or tell it what to do…'} value=${input}
                onInput=${(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'; }}
                onPaste=${onPaste}
                onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } if (e.key === 'Escape') setOpen(false); }}/>
              <button class="sv-ibtn" title="Attach a file (sheet, PDF, photo)" aria-label="Attach a file" onClick=${() => fileRef.current && fileRef.current.click()}><i class="ti ti-paperclip"></i></button>
              ${SR && h`<button class="sv-ibtn" title=${listening ? 'Stop listening' : 'Speak'} aria-label="Speak" onClick=${toggleMic} style=${listening ? { color: 'var(--sv-brand)' } : null}><i class=${'ti ' + (listening ? 'ti-player-stop-filled' : 'ti-microphone')}></i></button>`}
              ${busy
                ? h`<button class="sv-send stop" title="Stop" aria-label="Stop" onClick=${stop}><i class="ti ti-player-stop-filled"></i></button>`
                : h`<button class="sv-send" title="Send" aria-label="Send" disabled=${fileBusy || (!input.trim() && !files.length)} onClick=${() => send()}><i class="ti ti-arrow-up"></i></button>`}
              <input ref=${fileRef} type="file" multiple hidden accept=".csv,.tsv,.xlsx,.xls,.xlsm,.ods,.pdf,.txt,.md,image/*"
                onChange=${(e) => { addFiles(e.target.files); e.target.value = ''; }}/>
            </div>
            <div class="sv-hint">Sevak works with your access. It asks before big changes. Ctrl+J to open or close.</div>
          </div>
        </div>`}
      </div>`;
    }

    // ---- Settings → Sevak -----------------------------------------------------------
    function SevakSettings({ user, showToast }) {
      const isAdmin = user && user.role_level === 'admin';
      const [data, setData] = useState(null);
      const [ctx, setCtx] = useState(null);
      const [form, setForm] = useState(null);
      const [notes, setNotes] = useState('');
      const [missing, setMissing] = useState(false);
      const [err, setErr] = useState(null);
      const [saving, setSaving] = useState(false);

      const load = useCallback(async () => {
        setErr(null);
        try {
          const [c, u] = await Promise.all([rpcCall('sevak_context', {}), rpcCall('ai_usage_summary', { p_months: 3 })]);
          setCtx(c); setNotes((c && c.notes) || ''); setData(u);
          const m = (u && u.meter) || {};
          setForm({ enabled: m.enabled !== false, monthly_token_cap: String(m.monthly_token_cap || ''), member_daily_requests: String(m.member_daily_requests || '') });
        } catch (e) { if (isMissingRpc(e)) setMissing(true); else setErr(e); }
      }, []);
      useEffect(() => { load(); }, [load]);

      const save = async () => {
        setSaving(true); setErr(null);
        try {
          await rpcCall('ai_settings_set', { p_patch: { enabled: !!form.enabled, monthly_token_cap: Number(form.monthly_token_cap) || 0,
                                                        member_daily_requests: Number(form.member_daily_requests) || 0 } });
          await rpcCall('sevak_notes_set', { p_notes: notes });
          showToast && showToast('Sevak settings saved');
          await load();
        } catch (e) { setErr(e); } finally { setSaving(false); }
      };

      if (missing) return h`<div class="sv-set"><div class="sv-box"><div class="sv-lbl">Sevak</div>
        <div class="sv-note">Sevak isn’t installed yet. Apply database update 151 and deploy the <code>sevak</code> function, then come back here.</div></div></div>`;
      if (!data || !form) return h`<div class="sv-set"><div class="sv-box">${err ? h`<div style=${{ color: '#c4320a' }}>${String(err.message || err)}</div>` : 'Loading…'}</div></div>`;
      const m = data.meter || {};
      const used = Number(m.used_tokens || 0), cap = Number(m.monthly_token_cap || 0);
      const pct = cap > 0 ? Math.min(100, Math.round(used / cap * 100)) : 0;
      return h`<div class="sv-set">
        <div class="sv-box">
          <div class="sv-row"><span class="sv-lbl">Sevak for the office</span><span class="sv-grow" style=${{ flex: 1 }}></span>
            <button class="sv-btn" onClick=${() => window.dispatchEvent(new CustomEvent('ams-sevak-open'))}>Open Sevak</button></div>
          <div class="sv-note">Everyone on staff gets Sevak (the स button, or Ctrl+J). It works with each person’s own access, and asks before deleting, money, sending to clients, publishing, access changes and bulk loads.</div>
          <label class="sv-row"><input type="checkbox" checked=${form.enabled} disabled=${!isAdmin} onChange=${(e) => setForm(Object.assign({}, form, { enabled: e.target.checked }))}/> Sevak is on</label>
          <div class="sv-row" style=${{ alignItems: 'flex-start' }}>
            <label style=${{ flex: 1, minWidth: 200 }}><div class="sv-note">Monthly allowance (tokens)</div>
              <input type="number" min="0" value=${form.monthly_token_cap} disabled=${!isAdmin} onInput=${(e) => setForm(Object.assign({}, form, { monthly_token_cap: e.target.value }))}/></label>
            <label style=${{ flex: 1, minWidth: 200 }}><div class="sv-note">Messages per person per day</div>
              <input type="number" min="0" value=${form.member_daily_requests} disabled=${!isAdmin} onInput=${(e) => setForm(Object.assign({}, form, { member_daily_requests: e.target.value }))}/></label>
          </div>
          <div><div class="sv-note">This month: ${used.toLocaleString('en-IN')} of ${cap.toLocaleString('en-IN')} tokens (${pct}%)</div><div class="sv-bar"><i style=${{ width: pct + '%' }}></i></div></div>
        </div>
        <div class="sv-box">
          <div class="sv-lbl">Things Sevak should know about our office</div>
          <div class="sv-note">House rules in plain words. Sevak follows these for everyone, for example who makes reels, how many days before posting production happens, or what never to send to clients.</div>
          <textarea value=${notes} disabled=${!isAdmin} onInput=${(e) => setNotes(e.target.value)} placeholder="e.g. Reels are made by Samar. Creatives by Shubham…"></textarea>
        </div>
        ${Array.isArray(data.by_member) && data.by_member.length > 0 && h`<div class="sv-box"><div class="sv-lbl">Who used it this month</div>
          <table class="sv-tbl"><tbody>${data.by_member.map(r => h`<tr key=${r.member_id || r.name}><td>${r.name}</td><td style=${{ textAlign: 'right' }}>${r.requests} calls</td><td style=${{ textAlign: 'right' }}>${Number(r.tokens || 0).toLocaleString('en-IN')} tokens</td></tr>`)}</tbody></table></div>`}
        ${err && h`<div style=${{ color: '#c4320a' }}>${String(err.message || err)}</div>`}
        ${isAdmin && h`<div><button class="sv-btn pri" disabled=${saving} onClick=${save}>${saving ? 'Saving…' : 'Save'}</button></div>`}
      </div>`;
    }

    reg('settingsSections', { id: 'sevak', label: 'Sevak', icon: 'ti-message-chatbot', order: 78,
      roles: (r) => r === 'admin' || r === 'manager', Component: SevakSettings });

    return { SevakDock, SevakSettings };
  }
  window.AMS_SEVAK = { buildSevak };
})();

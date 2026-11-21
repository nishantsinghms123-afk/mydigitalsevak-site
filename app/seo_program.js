// seo_program.js — SEO programme portal (migration 181 + Edge Function seo-sheet-sync).
//
// window.AMS_SEO_PROGRAM.get(deps) -> { SeoPortalView, SeoProgramPanel } (built once, cached).
//   SeoPortalView   what the school sees in the client portal (client_portal.js, tab "seo").
//                   Staff open the same view read-only from the panel ("Preview as school").
//   SeoProgramPanel the staff side, on top of a client's SEO tab (seo.js ClientSEOTab): connect the
//                   master sheet, sync, settings, weekly reports (check → send), school actions.
// The team keeps working in the client's master Google Sheet; everything here is read from it.
(function () {
  const SA_EMAIL = 'ams-drive-preview@ams-dashboard-496318.iam.gserviceaccount.com';
  const BRAND = '#ff00ee';

  function injectStyles() {
    if (document.getElementById('sp-styles')) return;
    const css = `
.sp-root{--bg:#FFFFFF;--bg2:#F5F5F0;--bd:rgba(60,60,55,.10);--bd2:rgba(60,60,55,.22);--t1:#1A1A1A;--t2:#5E5C58;--t3:#8E8C87;--ok:#15803D;--okbg:#DCFCE7;--warn:#B45309;--warnbg:#FEF3C7;--bad:#B91C1C;--badbg:#FEE2E2;--info:#1D4ED8;--infobg:#DBEAFE;--br:#ff00ee;--brbg:rgba(255,0,238,.10);color:var(--t1);font-family:'Satoshi','Inter',-apple-system,BlinkMacSystemFont,sans-serif}
html.dark .sp-root{--bg:#0F0F0E;--bg2:#1A1A19;--bd:rgba(255,255,255,.10);--bd2:rgba(255,255,255,.20);--t1:#EDEDEC;--t2:#B5B3AD;--t3:#7F7D77;--okbg:rgba(21,128,61,.18);--warnbg:rgba(180,83,9,.18);--badbg:rgba(185,28,28,.18);--infobg:rgba(29,78,216,.18);--brbg:rgba(255,0,238,.14)}
.sp-pad{padding:16px 16px 40px;max-width:760px;margin:0 auto}
.sp-serif{font-family:'Fraunces',Georgia,serif}
.sp-seg{display:flex;gap:6px;overflow-x:auto;padding:2px 0 12px;margin:0 -16px 4px;padding-left:16px;padding-right:16px;scrollbar-width:none;position:sticky;top:0;background:var(--bg);z-index:2}
.sp-seg::-webkit-scrollbar{display:none}
.sp-seg button{flex:none;border:1px solid var(--bd);background:var(--bg);color:var(--t2);font:inherit;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.sp-seg button.on{background:var(--t1);color:var(--bg);border-color:var(--t1)}
.sp-seg .sp-dot{min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:var(--br);color:#fff;font-size:10px;display:inline-flex;align-items:center;justify-content:center}
.sp-hero{border:1px solid var(--bd);border-radius:18px;padding:18px;display:flex;gap:16px;align-items:center;background:linear-gradient(135deg,var(--brbg),transparent 60%),var(--bg)}
.sp-hero-t{font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--br);font-weight:700}
.sp-hero-h{font-size:21px;line-height:1.2;margin-top:4px}
.sp-hero-s{font-size:12.5px;color:var(--t2);margin-top:5px;line-height:1.45}
.sp-months{display:flex;gap:4px;margin-top:12px}
.sp-month{flex:1;min-width:0}
.sp-month-bar{height:6px;border-radius:6px;background:var(--bg2);overflow:hidden;border:1px solid var(--bd)}
.sp-month-bar i{display:block;height:100%;background:var(--br);border-radius:6px}
.sp-month-l{font-size:10px;color:var(--t3);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-month.now .sp-month-l{color:var(--t1);font-weight:600}
.sp-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}
@media(min-width:620px){.sp-tiles.four{grid-template-columns:repeat(4,1fr)}}
.sp-tile{background:var(--bg2);border:1px solid var(--bd);border-radius:14px;padding:12px 13px;min-height:86px;display:flex;flex-direction:column;justify-content:space-between;text-align:left;font:inherit;color:inherit;cursor:pointer}
.sp-tile-l{font-size:10.5px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.sp-tile-v{font-size:24px;font-weight:600;line-height:1;margin-top:8px}
.sp-tile-v small{font-size:13px;color:var(--t3);font-weight:500}
.sp-tile-s{font-size:11px;color:var(--t3);margin-top:6px}
.sp-tile-s.up{color:var(--ok)}
.sp-bar{height:5px;border-radius:5px;background:var(--bd);overflow:hidden;margin-top:7px}
.sp-bar i{display:block;height:100%;background:var(--br);border-radius:5px}
.sp-bar.ok i{background:var(--ok)}
.sp-h{display:flex;align-items:center;justify-content:space-between;margin:22px 0 10px;gap:8px}
.sp-h h3{margin:0;font-size:15px;font-weight:600}
.sp-h span{font-size:11.5px;color:var(--t3)}
.sp-card{border:1px solid var(--bd);border-radius:14px;background:var(--bg);overflow:hidden}
.sp-row{display:flex;gap:11px;padding:11px 13px;border-top:1px solid var(--bd);align-items:flex-start}
.sp-row:first-child{border-top:none}
.sp-row-ic{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;background:var(--bg2);color:var(--t2)}
.sp-row-ic.done,.sp-row-ic.live{background:var(--okbg);color:var(--ok)}
.sp-row-ic.approval{background:var(--brbg);color:var(--br)}
.sp-row-ic.waiting{background:var(--warnbg);color:var(--warn)}
.sp-row-ic.rank{background:var(--infobg);color:var(--info)}
.sp-row-ic.progress{background:var(--warnbg);color:var(--warn)}
.sp-row-m{flex:1;min-width:0}
.sp-row-t{font-size:13.5px;line-height:1.35;word-break:break-word}
.sp-row-t a{color:inherit}
.sp-row-s{font-size:11.5px;color:var(--t3);margin-top:3px;line-height:1.4;white-space:pre-wrap;word-break:break-word}
.sp-row-r{flex-shrink:0;text-align:right;font-size:11.5px;color:var(--t3)}
.sp-day{font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin:16px 2px 7px}
.sp-pill{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--bg2);color:var(--t2);white-space:nowrap}
.sp-pill.ok{background:var(--okbg);color:var(--ok)}
.sp-pill.warn{background:var(--warnbg);color:var(--warn)}
.sp-pill.bad{background:var(--badbg);color:var(--bad)}
.sp-pill.br{background:var(--brbg);color:var(--br)}
.sp-pill.info{background:var(--infobg);color:var(--info)}
.sp-ws{display:grid;grid-template-columns:1fr auto;gap:3px 10px;padding:10px 13px;border-top:1px solid var(--bd);font-size:13px;align-items:center}
.sp-ws:first-child{border-top:none}
.sp-ws .sp-bar{grid-column:1 / -1;margin-top:2px}
.sp-ws-n{color:var(--t3);font-size:12px}
.sp-kw{display:grid;grid-template-columns:1fr 64px 46px;gap:8px;align-items:center;padding:11px 13px;border-top:1px solid var(--bd)}
.sp-kw:first-child{border-top:none}
.sp-kw-k{font-size:13.5px;line-height:1.3}
.sp-kw-s{font-size:11px;color:var(--t3);margin-top:3px}
.sp-kw-r{font-size:21px;font-weight:600;text-align:right;line-height:1}
.sp-kw-r small{display:block;font-size:10.5px;font-weight:600;margin-top:4px}
.sp-up{color:var(--ok)}.sp-dn{color:var(--bad)}
.sp-empty{padding:26px 18px;text-align:center;color:var(--t3);font-size:13px;background:var(--bg2);border-radius:14px;border:1px dashed var(--bd2);line-height:1.5}
.sp-empty i{display:block;font-size:28px;margin-bottom:8px}
.sp-btn{border:none;border-radius:10px;padding:9px 13px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.sp-btn:disabled{opacity:.5;cursor:default}
.sp-btn.pri{background:var(--ok);color:#fff}
.sp-btn.br{background:var(--br);color:#fff}
.sp-btn.sec{background:transparent;color:var(--t1);border:1px solid var(--bd2)}
.sp-btn.ghost{background:transparent;color:var(--t2);padding:6px 8px}
.sp-acts{display:flex;gap:7px;margin-top:9px;flex-wrap:wrap}
.sp-ta{width:100%;box-sizing:border-box;border:1px solid var(--bd2);border-radius:10px;padding:9px 11px;font:inherit;font-size:13px;background:var(--bg);color:var(--t1);resize:vertical;min-height:64px;margin-top:8px}
.sp-in{width:100%;box-sizing:border-box;border:1px solid var(--bd2);border-radius:10px;padding:9px 11px;font:inherit;font-size:13px;background:var(--bg);color:var(--t1)}
.sp-acc{border:1px solid var(--bd);border-radius:14px;margin-bottom:10px;overflow:hidden}
.sp-acc-h{display:flex;align-items:center;gap:11px;padding:13px;cursor:pointer;background:var(--bg);border:none;width:100%;font:inherit;color:inherit;text-align:left}
.sp-acc-h .sp-row-m{min-width:0}
.sp-acc-b{border-top:1px solid var(--bd)}
.sp-grid{width:100%;border-collapse:collapse;font-size:12.5px}
.sp-grid th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--t3);font-weight:600;text-align:center;padding:8px 4px;border-bottom:1px solid var(--bd)}
.sp-grid th:first-child,.sp-grid td:first-child{text-align:left;padding-left:13px}
.sp-grid td{padding:9px 4px;border-bottom:1px solid var(--bd);text-align:center;vertical-align:middle}
.sp-yes,.sp-no,.sp-na{display:inline-block;width:18px;height:18px;border-radius:50%;line-height:18px;font-size:11px;font-weight:700}
.sp-yes{background:var(--ok);color:#fff}.sp-no{background:var(--bg2);color:var(--t3);border:1px solid var(--bd2)}.sp-na{color:var(--t3)}
.sp-note{font-size:12px;color:var(--t2);background:var(--bg2);border-radius:12px;padding:11px 13px;line-height:1.5;margin-top:10px}
.sp-sheet{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:400;display:flex;align-items:flex-end;justify-content:center}
.sp-sheet-p{background:var(--bg);width:100%;max-width:720px;max-height:92vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden}
@media(min-width:760px){.sp-sheet{align-items:center}.sp-sheet-p{border-radius:18px}}
.sp-sheet-h{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--bd);gap:10px}
.sp-sheet-h b{font-size:14px}
.sp-sheet-b{overflow:auto;flex:1}
.sp-frame{width:100%;height:72vh;border:0;background:#f5f5f0}
.sp-live{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.sp-live div{background:var(--bg2);border:1px solid var(--bd);border-radius:12px;padding:10px 11px}
.sp-live b{display:block;font-size:19px;margin-top:5px}
.sp-live span{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.sp-live em{display:block;font-style:normal;font-size:10.5px;color:var(--t3);margin-top:3px}
.sp-staff{border:1px solid var(--bd);border-radius:14px;padding:16px;margin-bottom:16px}
.sp-staff .sp-row-s{white-space:normal}
.sp-kv{display:grid;grid-template-columns:150px 1fr;gap:8px 12px;font-size:12.5px;align-items:center;margin-top:12px}
.sp-kv label{color:var(--t3)}
.sp-overlay{position:fixed;inset:0;z-index:500;background:var(--bg,#fff);overflow:auto}
`;
    const el = document.createElement('style');
    el.id = 'sp-styles';
    el.textContent = css;
    document.head.appendChild(el);
    if (!document.getElementById('cp-fonts-1')) {
      [['cp-fonts-1', 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&display=swap'],
       ['cp-fonts-2', 'https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap']].forEach(([id, href]) => {
        const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
      });
    }
  }

  let built = null;
  function get(deps) {
    if (built) return built;
    injectStyles();
    const { h, useState, useEffect, useMemo, useCallback, rpcCall } = deps;

    // ── small helpers ────────────────────────────────────────────────────────────────────────────
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const norm = (s) => String(s || '').trim().toLowerCase();
    const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const fmtD = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${d} ${MON[m - 1]}`; };
    const fmtDay = (iso) => {
      const t = todayIST(); if (iso === t) return 'Today';
      const y = new Date(Date.parse(t + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10); if (iso === y) return 'Yesterday';
      const d = new Date(iso + 'T00:00:00Z'); return `${DOW[d.getUTCDay()]} ${fmtD(iso)}`;
    };
    const ago = (ts) => {
      if (!ts) return '';
      const s = Math.max(0, (Date.now() - Date.parse(ts)) / 1000);
      if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago';
      if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' days ago';
    };
    const isUrl = (s) => /^https?:\/\//i.test(String(s || ''));
    const siteUrl = (site, path) => isUrl(path) ? path : (site && String(path || '').startsWith('/') ? site.replace(/\/+$/, '') + path : '');
    const pctOf = (a, b) => b ? Math.min(100, Math.round(a / b * 100)) : 0;
    const AREA_IC = { roadmap: 'ti-checkbox', fixes: 'ti-tool', pages: 'ti-file-text', blogs: 'ti-article', reopt: 'ti-refresh',
      keywords: 'ti-trending-up', backlinks: 'ti-link', geo: 'ti-sparkles', gbp: 'ti-map-pin', press: 'ti-speakerphone',
      access: 'ti-key', inputs: 'ti-paperclip', updates: 'ti-message-circle', report: 'ti-report' };
    const statusTone = (s) => {
      const n = norm(s);
      if (['done', 'live', 'published', 'received', 'verified', 'approved', 'distributed', 'sent', 'topic approved'].includes(n)) return 'ok';
      if (['sent for approval', 'sent for review', 'topic proposed'].includes(n)) return 'br';
      if (['waiting on client', 'pending', 'requested', 'partially received'].includes(n)) return 'warn';
      if (['in progress', 'drafting', 'writing', 'in review', 'submitted', 'pending approval'].includes(n)) return 'info';
      if (['rejected', 'not available'].includes(n)) return 'bad';
      return '';
    };
    const Pill = ({ s, label }) => s || label ? h`<span class=${'sp-pill ' + statusTone(s)}>${label || s}</span>` : null;

    function Ring({ pct, size = 86 }) {
      const r = (size - 10) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, Number(pct) || 0));
      return h`<svg width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} style=${{ flexShrink: 0 }}>
        <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--bd2)" stroke-width="7"/>
        <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${BRAND} stroke-width="7" stroke-linecap="round"
          stroke-dasharray=${c} stroke-dashoffset=${c * (1 - v / 100)} transform=${`rotate(-90 ${size / 2} ${size / 2})`}/>
        <text x="50%" y="48%" text-anchor="middle" dominant-baseline="middle" style=${{ font: "600 20px Fraunces,Georgia,serif", fill: 'var(--t1)' }}>${Math.round(v)}%</text>
        <text x="50%" y="68%" text-anchor="middle" style=${{ font: '600 8.5px Satoshi,Inter,sans-serif', fill: 'var(--t3)', letterSpacing: '.06em' }}>DONE</text>
      </svg>`;
    }

    // Rank sparkline: lower rank = higher on the chart.
    function Spark({ ranks, w = 64, hgt = 22 }) {
      const pts = (ranks || []).map((v, i) => [i, v]).filter(([, v]) => typeof v === 'number');
      if (pts.length < 2) return null;
      const n = ranks.length - 1 || 1, max = Math.max(...pts.map(p => p[1]), 10), min = Math.min(...pts.map(p => p[1]), 1);
      const y = (v) => 2 + (hgt - 4) * ((v - min) / ((max - min) || 1));
      const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${(i / n * (w - 4) + 2).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      return h`<svg width=${w} height=${hgt} style=${{ display: 'block', marginTop: 4 }}><path d=${d} fill="none" stroke=${BRAND} stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    }

    function Sheet({ title, onClose, children, right }) {
      useEffect(() => {
        const k = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
      }, [onClose]);
      return h`<div class="sp-sheet sp-root" onClick=${onClose}>
        <div class="sp-sheet-p" onClick=${(e) => e.stopPropagation()}>
          <div class="sp-sheet-h"><b>${title}</b><div style=${{ display: 'flex', gap: 6, alignItems: 'center' }}>${right}<button class="sp-btn ghost" onClick=${onClose} aria-label="Close"><i class="ti ti-x" style=${{ fontSize: 18 }}></i></button></div></div>
          <div class="sp-sheet-b">${children}</div>
        </div>
      </div>`;
    }

    // ── What the school owes us (approvals, information, access) ─────────────────────────────────
    function todoList(d, actions) {
      if (!d) return [];
      const pending = new Map();
      (actions || []).forEach(a => { if (a.status !== 'failed') pending.set(`${a.tab}|${norm(a.row_key)}`, a); });
      const out = [];
      (d.blogs || []).forEach(b => {
        const s = norm(b.status);
        if (s === 'topic proposed' || s === 'sent for review') out.push({ tab: 'blogs', row: b.row, key: b.title, kind: 'approval',
          label: s === 'topic proposed' ? 'Blog topic to approve' : 'Blog to review', title: b.title,
          sub: [b.keyword && `Keyword: ${b.keyword}`, b.planned && `Planned ${fmtD(b.planned)}`].filter(Boolean).join(' · '),
          link: isUrl(b.draft_link) ? b.draft_link : '' });
      });
      (d.pages || []).forEach(p => { if (norm(p.status) === 'sent for approval') out.push({ tab: 'pages', row: p.row, key: p.page, kind: 'approval',
        label: 'Page to approve', title: `${p.page} page`, sub: p.what, link: isUrl(p.draft_link) ? p.draft_link : '' }); });
      (d.press || []).forEach(p => { if (norm(p.status) === 'sent for approval') out.push({ tab: 'press', row: p.row, key: p.theme, kind: 'approval',
        label: 'Press release to approve', title: p.theme, sub: p.inputs ? `Needs from you: ${p.inputs}` : '', link: isUrl(p.report_link) ? p.report_link : '' }); });
      const t = todayIST();
      (d.inputs || []).forEach(i => { if (!['received', 'not applicable'].includes(norm(i.status))) out.push({ tab: 'inputs', row: i.row, key: i.item, kind: 'input',
        label: 'Information we need', title: i.item, sub: [i.used_for && `For ${i.used_for}`, i.format].filter(Boolean).join(' · '),
        due: i.needed_by, late: i.needed_by && i.needed_by < t, status: i.status, priority: i.priority }); });
      (d.access || []).forEach(a => { if (!['received', 'verified', 'not applicable', 'not available'].includes(norm(a.status))) out.push({ tab: 'access', row: a.row, key: a.name, kind: 'access',
        label: 'Access we need', title: a.name, sub: a.how || a.why, link: isUrl(a.where) ? a.where : '', status: a.status, priority: a.priority }); });
      out.forEach(o => { o.pending = pending.get(`${o.tab}|${norm(o.key)}`) || null; });
      return out;
    }

    // ── Portal view ─────────────────────────────────────────────────────────────────────────────
    function SeoPortalView({ payload, onAction, readOnly, clientName, initialSection, onSection }) {
      const [sec, setSecRaw] = useState(initialSection || 'today');
      const setSec = (s) => { setSecRaw(s); if (onSection) onSection(s); try { document.querySelector('.cp-main')?.scrollTo?.({ top: 0 }); } catch (_) { } };
      const d = payload?.data;
      const todos = useMemo(() => todoList(d, payload?.actions), [d, payload?.actions]);
      const openTodos = todos.filter(t => !t.pending).length;
      if (!d) return h`<div class="sp-root sp-pad"><div class="sp-empty"><i class="ti ti-chart-line"></i>Your SEO dashboard is being set up. It will show here as soon as the first update is in.</div></div>`;
      const SECS = [['today', 'Today', 'ti-sun'], ['rank', 'Rankings', 'ti-trending-up'], ['work', 'Work done', 'ti-checklist'],
        ['ai', 'AI search', 'ti-sparkles'], ['todo', 'Your to-dos', 'ti-hand-click'], ['reports', 'Reports', 'ti-report']];
      return h`<div class="sp-root sp-pad">
        <div class="sp-seg">${SECS.map(([id, lb, ic]) => h`<button key=${id} class=${sec === id ? 'on' : ''} onClick=${() => setSec(id)}>
          <i class=${'ti ' + ic}></i>${lb}${id === 'todo' && openTodos > 0 && h`<span class="sp-dot">${openTodos}</span>`}</button>`)}</div>
        ${sec === 'today' && h`<${Today} p=${payload} d=${d} todos=${todos} go=${setSec} clientName=${clientName}/>`}
        ${sec === 'rank' && h`<${Rankings} p=${payload} d=${d}/>`}
        ${sec === 'work' && h`<${Work} d=${d}/>`}
        ${sec === 'ai' && h`<${AiSearch} d=${d}/>`}
        ${sec === 'todo' && h`<${Todos} todos=${todos} onAction=${onAction} readOnly=${readOnly}/>`}
        ${sec === 'reports' && h`<${Reports} p=${payload} d=${d}/>`}
        <div style=${{ textAlign: 'center', fontSize: 11, color: 'var(--t3)', marginTop: 26 }}>Updated ${ago(payload.synced_at)} · from the programme tracker your team keeps</div>
      </div>`;
    }

    function Today({ p, d, todos, go, clientName }) {
      const ph = d.phase || {}; const s = d.stats || {}; const site = d.project?.website;
      const months = d.project?.months || [];
      const t = todayIST();
      const kpiT = (re) => (d.kpis?.rows || []).find(r => re.test(r.metric || ''));
      const top10T = kpiT(/top 10/i);
      const open = todos.filter(x => !x.pending);
      const late = open.filter(x => x.late).length;
      const events = p.events || [];
      const byDay = [];
      events.slice(0, 40).forEach(e => { const last = byDay[byDay.length - 1]; if (last && last.day === e.day) last.items.push(e); else byDay.push({ day: e.day, items: [e] }); });
      const live = p.live;
      const delta = (a, b) => (a == null || b == null || !b) ? null : Math.round((a - b) / b * 100);
      return h`<div>
        <div class="sp-hero">
          <${Ring} pct=${d.overall_pct}/>
          <div style=${{ minWidth: 0, flex: 1 }}>
            <div class="sp-hero-t">${ph.month_label || 'SEO programme'}</div>
            <div class="sp-hero-h sp-serif">${ph.started ? `Day ${ph.day} of ${ph.days_total}` : (ph.day < 1 ? `Starts ${fmtD(d.project?.start)}` : 'Programme complete')}</div>
            <div class="sp-hero-s">${d.project?.subtitle?.split('·')[0] || 'Search, AI and Google Maps visibility'}</div>
            ${months.length > 0 && h`<div class="sp-months">${months.map((m, i) => {
              const total = Math.max(1, (Date.parse(m.to) - Date.parse(m.from)) / 864e5 + 1);
              const doneDays = t < m.from ? 0 : t > m.to ? total : (Date.parse(t) - Date.parse(m.from)) / 864e5 + 1;
              return h`<div key=${i} class=${'sp-month' + (t >= m.from && t <= m.to ? ' now' : '')}>
                <div class="sp-month-bar"><i style=${{ width: pctOf(doneDays, total) + '%' }}></i></div>
                <div class="sp-month-l">${m.label.replace(/^Month\s*/i, 'M')}</div></div>`;
            })}</div>`}
          </div>
        </div>

        ${open.length > 0 && h`<button class="sp-card" onClick=${() => go('todo')} style=${{ display: 'flex', gap: 11, alignItems: 'center', padding: '12px 13px', marginTop: 12, width: '100%', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer', borderColor: 'rgba(255,0,238,.35)', background: 'var(--brbg)' }}>
          <div class="sp-row-ic approval"><i class="ti ti-hand-click"></i></div>
          <div class="sp-row-m"><div class="sp-row-t"><b>${open.length} thing${open.length === 1 ? '' : 's'} waiting on you</b></div>
            <div class="sp-row-s">${late ? `${late} past the date we needed ${late === 1 ? 'it' : 'them'} · ` : ''}Approvals and information that keep the work moving</div></div>
          <i class="ti ti-chevron-right" style=${{ color: 'var(--t3)' }}></i>
        </button>`}

        <div class="sp-tiles">
          <button class="sp-tile" onClick=${() => go('rank')}>
            <div class="sp-tile-l">Google top 10</div>
            <div class="sp-tile-v">${s.ranked ? s.top10 : '—'}<small> / ${s.keywords || 0}</small></div>
            <div class="sp-tile-s">${s.ranked ? (top10T?.d90t ? `Target ${top10T.d90t} by day 90` : `${s.top3} in the top 3`) : 'First check this week'}</div>
          </button>
          <button class="sp-tile" onClick=${() => go('work')}>
            <div class="sp-tile-l">Backlinks live</div>
            <div class="sp-tile-v">${s.backlinks_live || 0}<small>${s.backlinks_target ? ' / ' + s.backlinks_target : ''}</small></div>
            <div class="sp-bar"><i style=${{ width: pctOf(s.backlinks_live, s.backlinks_target) + '%' }}></i></div>
          </button>
          <button class="sp-tile" onClick=${() => go('work')}>
            <div class="sp-tile-l">Blogs published</div>
            <div class="sp-tile-v">${s.blogs_published || 0}<small> / ${s.blogs_total || 0}</small></div>
            <div class="sp-bar"><i style=${{ width: pctOf(s.blogs_published, s.blogs_total) + '%' }}></i></div>
          </button>
          <button class="sp-tile" onClick=${() => go('work')}>
            <div class="sp-tile-l">Website fixes</div>
            <div class="sp-tile-v">${s.fixes_done || 0}<small> / ${s.fixes_total || 0}</small></div>
            <div class="sp-bar ok"><i style=${{ width: pctOf(s.fixes_done, s.fixes_total) + '%' }}></i></div>
          </button>
        </div>

        ${live && (live.gsc || live.ga4) && h`<div>
          <div class="sp-h"><h3>Live from Google</h3><span>last 28 days</span></div>
          <div class="sp-live">
            ${live.gsc && h`<div><span>Clicks from Google</span><b>${live.gsc.cur.clicks}</b><em>${delta(live.gsc.cur.clicks, live.gsc.prev.clicks) !== null ? `${delta(live.gsc.cur.clicks, live.gsc.prev.clicks) >= 0 ? '+' : ''}${delta(live.gsc.cur.clicks, live.gsc.prev.clicks)}% vs before` : ''}</em></div>`}
            ${live.gsc && h`<div><span>Times shown</span><b>${live.gsc.cur.impressions}</b><em>${delta(live.gsc.cur.impressions, live.gsc.prev.impressions) !== null ? `${delta(live.gsc.cur.impressions, live.gsc.prev.impressions) >= 0 ? '+' : ''}${delta(live.gsc.cur.impressions, live.gsc.prev.impressions)}% vs before` : ''}</em></div>`}
            ${live.ga4 && h`<div><span>Visitors from Google</span><b>${live.ga4.cur.organic}</b><em>${live.ga4.cur.organic_events ? `${live.ga4.cur.organic_events} enquiries` : (delta(live.ga4.cur.organic, live.ga4.prev.organic) !== null ? `${delta(live.ga4.cur.organic, live.ga4.prev.organic) >= 0 ? '+' : ''}${delta(live.ga4.cur.organic, live.ga4.prev.organic)}% vs before` : '')}</em></div>`}
            ${live.gsc && !live.ga4 && h`<div><span>Average position</span><b>${live.gsc.cur.position ? live.gsc.cur.position.toFixed(1) : '—'}</b><em>all searches</em></div>`}
          </div>
        </div>`}

        <div class="sp-h"><h3>Latest updates</h3><span>${events.length ? '' : 'as work moves'}</span></div>
        ${byDay.length === 0 ? h`<div class="sp-empty"><i class="ti ti-bolt"></i>Every task, page, blog, backlink and ranking change will show here the day it happens.</div>`
          : byDay.map(g => h`<div key=${g.day}>
              <div class="sp-day">${fmtDay(g.day)}</div>
              <div class="sp-card">${g.items.map(e => h`<div class="sp-row" key=${e.id}>
                <div class=${'sp-row-ic ' + e.kind}><i class=${'ti ' + (AREA_IC[e.area] || 'ti-point')}></i></div>
                <div class="sp-row-m"><div class="sp-row-t">${e.link ? h`<a href=${e.link} target="_blank" rel="noopener">${e.title} <i class="ti ti-external-link" style=${{ fontSize: 12, color: 'var(--t3)' }}></i></a>` : e.title}</div>
                  ${e.detail && h`<div class="sp-row-s">${e.detail.length > 260 ? e.detail.slice(0, 260) + '…' : e.detail}</div>`}</div>
              </div>`)}</div>
            </div>`)}

        <div class="sp-h"><h3>Progress by area</h3><span>${(d.workstreams || []).length} areas</span></div>
        <div class="sp-card">${(d.workstreams || []).map(w => h`<div class="sp-ws" key=${w.name}>
          <div>${w.name}</div><div class="sp-ws-n">${w.done}/${w.total}${w.waiting && /school/i.test(w.name) ? '' : ''}</div>
          <div class="sp-bar ok"><i style=${{ width: pctOf(w.done, w.total) + '%' }}></i></div>
        </div>`)}</div>

        ${(d.deliverables || []).length > 0 && h`<div>
          <div class="sp-h"><h3>What each month delivers</h3></div>
          <div class="sp-card">${d.deliverables.map((m, i) => h`<div class="sp-row" key=${i}>
            <div class="sp-row-ic"><i class="ti ti-flag"></i></div>
            <div class="sp-row-m"><div class="sp-row-t"><b>${m.month}</b></div><div class="sp-row-s">${m.text}</div></div>
            <div class="sp-row-r"><${Pill} s=${m.status}/></div></div>`)}</div>
        </div>`}

        ${(d.updates || []).length > 0 && h`<div>
          <div class="sp-h"><h3>Calls & notes</h3></div>
          <div class="sp-card">${[...d.updates].reverse().slice(0, 6).map((u, i) => h`<div class="sp-row" key=${i}>
            <div class="sp-row-ic"><i class="ti ti-message-circle"></i></div>
            <div class="sp-row-m"><div class="sp-row-t">${u.summary}</div>
              ${u.actions && h`<div class="sp-row-s">Next: ${u.actions}${u.owner ? ` (${u.owner}${u.due ? ', by ' + fmtD(u.due) : ''})` : ''}</div>`}</div>
            <div class="sp-row-r">${fmtD(u.date)}<div style=${{ marginTop: 4 }}><${Pill} s=${u.status}/></div></div></div>`)}</div>
        </div>`}
        ${site && h`<div class="sp-note">Website: <a href=${site} target="_blank" rel="noopener" style=${{ color: 'inherit' }}>${site.replace(/^https?:\/\//, '')}</a>${d.project?.poc ? ` · Your contact for approvals: ${d.project.poc}` : ''}</div>`}
      </div>`;
    }

    function Rankings({ p, d }) {
      const k = d.keywords || { rows: [], weeks: [] };
      const lw = k.last_week ?? -1;
      const counted = k.rows.filter(r => r.counted), maps = k.rows.filter(r => !r.counted);
      const s = d.stats || {};
      const kpi = (re) => (d.kpis?.rows || []).find(r => re.test(r.metric || ''));
      const t10 = kpi(/top 10/i), t3 = kpi(/top 3/i);
      const gsc = p.live?.gsc?.tracked || {};
      const Row = (r) => {
        const now = lw >= 0 ? r.ranks[lw] : null;
        const before = lw > 0 ? [...r.ranks.slice(0, lw)].reverse().find(v => typeof v === 'number') : undefined;
        const base = r.baseline;
        const dlt = typeof now === 'number' && typeof base === 'number' ? base - now : null;
        const wk = typeof now === 'number' && typeof before === 'number' ? before - now : null;
        return h`<div class="sp-kw" key=${r.keyword}>
          <div><div class="sp-kw-k">${r.keyword}</div>
            <div class="sp-kw-s">Target ${r.target || '—'}${r.target_page ? ' · ' + r.target_page : ''}${gsc[r.keyword] ? ` · Search Console avg ${gsc[r.keyword]}` : ''}</div></div>
          <div>${h`<${Spark} ranks=${r.ranks}/>`}</div>
          <div class="sp-kw-r">${typeof now === 'number' ? now : (now ? h`<span style=${{ fontSize: 13 }}>${now}</span>` : h`<span style=${{ color: 'var(--t3)', fontSize: 15 }}>—</span>`)}
            ${wk ? h`<small class=${wk > 0 ? 'sp-up' : 'sp-dn'}>${wk > 0 ? '▲' : '▼'} ${Math.abs(wk)}</small>` : (dlt ? h`<small class=${dlt > 0 ? 'sp-up' : 'sp-dn'}>${dlt > 0 ? '+' : ''}${dlt} total</small>` : null)}</div>
        </div>`;
      };
      return h`<div>
        <div class="sp-tiles" style=${{ marginTop: 4 }}>
          <div class="sp-tile"><div class="sp-tile-l">In top 10</div><div class="sp-tile-v">${s.ranked ? s.top10 : '—'}<small> / ${s.keywords}</small></div>
            <div class="sp-tile-s">${t10 ? `Targets ${t10.d30t || '–'} · ${t10.d60t || '–'} · ${t10.d90t || '–'} (day 30·60·90)` : ''}</div></div>
          <div class="sp-tile"><div class="sp-tile-l">In top 3</div><div class="sp-tile-v">${s.ranked ? s.top3 : '—'}<small> / ${s.keywords}</small></div>
            <div class="sp-tile-s">${t3 ? `Targets ${t3.d30t || '–'} · ${t3.d60t || '–'} · ${t3.d90t || '–'}` : ''}</div></div>
        </div>
        ${lw < 0 && h`<div class="sp-empty" style=${{ marginBottom: 14 }}><i class="ti ti-search"></i>The first Google check (the baseline) is being done now. From then on, positions update every week${k.weeks[0]?.date ? ` (week 1: ${fmtD(k.weeks[0].date)})` : ''}.</div>`}
        <div class="sp-h"><h3>Your ${counted.length} target keywords</h3><span>${lw >= 0 ? `Google position · ${k.weeks[lw]?.label || ''}` : 'Google position'}</span></div>
        <div class="sp-card">${counted.map(Row)}</div>
        ${maps.length > 0 && h`<div><div class="sp-h"><h3>Your name & "near me" searches</h3><span>tracked for context</span></div>
          <div class="sp-card">${maps.map(Row)}</div></div>`}
        ${p.live?.gsc?.queries?.length > 0 && h`<div><div class="sp-h"><h3>What people actually searched</h3><span>Search Console, 28 days</span></div>
          <div class="sp-card">${p.live.gsc.queries.slice(0, 10).map(q => h`<div class="sp-row" key=${q.q}>
            <div class="sp-row-m"><div class="sp-row-t">${q.q}</div><div class="sp-row-s">${q.impressions} times shown · ${q.clicks} clicks</div></div>
            <div class="sp-row-r" style=${{ fontSize: 15, color: 'var(--t1)', fontWeight: 600 }}>${q.position}</div></div>`)}</div></div>`}
        <div class="sp-note">Lower is better: 1 is the first result on Google. Rankings move week to week as Google re-checks the site; the trend over the 3 months is what matters.</div>
      </div>`;
    }

    function Acc({ ic, title, sub, right, children, open: o0 }) {
      const [open, setOpen] = useState(!!o0);
      return h`<div class="sp-acc">
        <button class="sp-acc-h" onClick=${() => setOpen(!open)}>
          <div class="sp-row-ic"><i class=${'ti ' + ic}></i></div>
          <div class="sp-row-m"><div class="sp-row-t"><b>${title}</b></div>${sub && h`<div class="sp-row-s">${sub}</div>`}</div>
          ${right}<i class=${'ti ti-chevron-' + (open ? 'up' : 'down')} style=${{ color: 'var(--t3)' }}></i>
        </button>
        ${open && h`<div class="sp-acc-b">${children}</div>`}
      </div>`;
    }
    const Frac = ({ a, b }) => h`<span class="sp-pill ${a && a >= b ? 'ok' : ''}">${a || 0}/${b || 0}</span>`;

    function Work({ d }) {
      const s = d.stats || {}; const site = d.project?.website;
      const STAGES = ['Not Started', 'Drafting', 'Sent for Approval', 'Approved', 'Live'];
      const bl = d.backlinks || { summary: [], items: [] };
      const liveLinks = bl.items.filter(b => norm(b.status) === 'live');
      const fixesBy = {};
      (d.fixes || []).forEach(f => { (fixesBy[f.category || 'Other'] = fixesBy[f.category || 'Other'] || []).push(f); });
      return h`<div>
        <${Acc} ic="ti-file-text" title="Admission & programme pages" sub=${`${s.pages_live} live · each page goes Drafting → Your approval → Live`} right=${h`<${Frac} a=${s.pages_live} b=${s.pages_total}/>`} open=${true}>
          ${(d.pages || []).map(p => h`<div class="sp-row" key=${p.page}>
            <div class="sp-row-m"><div class="sp-row-t">${norm(p.status) === 'live' && siteUrl(site, p.url) ? h`<a href=${siteUrl(site, p.url)} target="_blank" rel="noopener">${p.page}</a>` : p.page}</div>
              <div class="sp-row-s">${p.url} · ${p.type}${p.month ? ' · ' + p.month : ''}</div>
              <div style=${{ display: 'flex', gap: 3, marginTop: 7 }}>${STAGES.slice(1).map((st, i) => h`<div key=${st} title=${st} style=${{ flex: 1, height: 4, borderRadius: 4, background: STAGES.indexOf(p.status) > i ? (norm(p.status) === 'live' ? 'var(--ok)' : BRAND) : 'var(--bd2)' }}></div>`)}</div></div>
            <div class="sp-row-r"><${Pill} s=${p.status}/></div></div>`)}
        <//>
        <${Acc} ic="ti-article" title="New blogs" sub=${`${s.blogs_published} of ${s.blogs_total} published · 6 a month`} right=${h`<${Frac} a=${s.blogs_published} b=${s.blogs_total}/>`}>
          ${(d.blogs || []).map(b => h`<div class="sp-row" key=${b.n + b.title}>
            <div class="sp-row-m"><div class="sp-row-t">${norm(b.status) === 'published' && (b.live_url) ? h`<a href=${siteUrl(site, b.live_url) || b.live_url} target="_blank" rel="noopener">${b.title}</a>` : b.title}</div>
              <div class="sp-row-s">${[b.month, b.planned && `planned ${fmtD(b.planned)}`, b.published_on && `published ${fmtD(b.published_on)}`, b.keyword].filter(Boolean).join(' · ')}</div></div>
            <div class="sp-row-r"><${Pill} s=${b.status}/></div></div>`)}
        <//>
        <${Acc} ic="ti-tool" title="Website fixes" sub=${`${s.fixes_done} of ${s.fixes_total} problems from our audit fixed`} right=${h`<${Frac} a=${s.fixes_done} b=${s.fixes_total}/>`}>
          ${Object.entries(fixesBy).map(([cat, list]) => h`<div key=${cat}>
            <div class="sp-day" style=${{ margin: '12px 13px 6px' }}>${cat} · ${list.filter(f => norm(f.status) === 'done').length}/${list.length}</div>
            ${list.map(f => h`<div class="sp-row" key=${f.n}>
              <div class="sp-row-m"><div class="sp-row-t">${f.url}</div><div class="sp-row-s">${f.issue}${f.fixed_on ? ` · fixed ${fmtD(f.fixed_on)}` : ''}</div></div>
              <div class="sp-row-r"><${Pill} s=${f.status}/></div></div>`)}
          </div>`)}
        <//>
        <${Acc} ic="ti-refresh" title="Older blogs improved" sub=${`${s.reopt_done} of ${s.reopt_total} existing posts re-optimised (links, FAQ, author, local context)`} right=${h`<${Frac} a=${s.reopt_done} b=${s.reopt_total}/>`}>
          ${(d.reopt || []).map(r => h`<div class="sp-row" key=${r.url}>
            <div class="sp-row-m"><div class="sp-row-t" style=${{ fontSize: 12.5 }}>${r.url}</div><div class="sp-row-s">${r.checks_done}/${r.checks_total} checks</div></div>
            <div class="sp-row-r"><${Pill} s=${r.status}/></div></div>`)}
        <//>
        <${Acc} ic="ti-link" title="Backlinks" sub=${`${s.backlinks_live} live${s.backlinks_pending ? ` · ${s.backlinks_pending} submitted` : ''} · 120 a month`} right=${h`<${Frac} a=${s.backlinks_live} b=${s.backlinks_target}/>`}>
          ${bl.summary.filter(c => !/total/i.test(c.category)).map(c => h`<div class="sp-ws" key=${c.category}>
            <div>${c.category}</div><div class="sp-ws-n">${c.total_live}/${c.total_target}</div>
            <div class="sp-bar"><i style=${{ width: pctOf(c.total_live, c.total_target) + '%' }}></i></div></div>`)}
          ${liveLinks.length > 0 && h`<div class="sp-day" style=${{ margin: '14px 13px 6px' }}>Latest live links</div>`}
          ${liveLinks.slice(-25).reverse().map((b, i) => h`<div class="sp-row" key=${i}>
            <div class="sp-row-m"><div class="sp-row-t">${isUrl(b.link) ? h`<a href=${b.link} target="_blank" rel="noopener">${b.website}</a>` : b.website}</div>
              <div class="sp-row-s">${[b.cat, b.da && `DA ${b.da}`, b.keyword, b.date && fmtD(b.date)].filter(Boolean).join(' · ')}</div></div></div>`)}
        <//>
        <${Acc} ic="ti-map-pin" title="Google Maps profile" sub=${`${s.gbp_done} of ${s.gbp_total} done · where most admission searches turn into calls`} right=${h`<${Frac} a=${s.gbp_done} b=${s.gbp_total}/>`}>
          ${(d.gbp?.items || []).map(g => h`<div class="sp-row" key=${g.n}>
            <div class="sp-row-m"><div class="sp-row-t">${g.item}</div><div class="sp-row-s">${g.what}</div></div>
            <div class="sp-row-r"><${Pill} s=${g.status}/></div></div>`)}
          ${(d.gbp?.metrics || []).some(m => m.baseline || m.m1) && h`<table class="sp-grid"><thead><tr><th>Monthly</th><th>Start</th><th>M1</th><th>M2</th><th>M3</th></tr></thead>
            <tbody>${d.gbp.metrics.map(m => h`<tr key=${m.metric}><td>${m.metric}</td><td>${m.baseline || '—'}</td><td>${m.m1 || '—'}</td><td>${m.m2 || '—'}</td><td>${m.m3 || '—'}</td></tr>`)}</tbody></table>`}
        <//>
        <${Acc} ic="ti-speakerphone" title="Press releases" sub=${`${s.press_out} of ${s.press_total} out · 200+ outlets each`} right=${h`<${Frac} a=${s.press_out} b=${s.press_total}/>`}>
          ${(d.press || []).map(pr => h`<div class="sp-row" key=${pr.n}>
            <div class="sp-row-m"><div class="sp-row-t">${pr.theme}</div><div class="sp-row-s">${[pr.month, pr.planned && `planned ${fmtD(pr.planned)}`, pr.outlets && `${pr.outlets} outlets`].filter(Boolean).join(' · ')}</div>
              ${isUrl(pr.report_link) && h`<div class="sp-row-s"><a href=${pr.report_link} target="_blank" rel="noopener" style=${{ color: 'inherit' }}>See where it was published</a></div>`}</div>
            <div class="sp-row-r"><${Pill} s=${pr.status}/></div></div>`)}
        <//>
        <${Acc} ic="ti-list-check" title="Full 90-day plan" sub=${`${s.roadmap_done} of ${s.roadmap_total} tasks done`} right=${h`<${Frac} a=${s.roadmap_done} b=${s.roadmap_total}/>`}>
          ${(d.roadmap || []).map(t => h`<div class="sp-row" key=${t.id || t.task}>
            <div class="sp-row-m"><div class="sp-row-t" style=${{ fontSize: 13 }}>${t.task}</div>
              <div class="sp-row-s">${[t.workstream, t.due && `due ${fmtD(t.due)}`, t.owner].filter(Boolean).join(' · ')}</div></div>
            <div class="sp-row-r"><${Pill} s=${t.status}/></div></div>`)}
        <//>
      </div>`;
    }

    function AiSearch({ d }) {
      const g = d.geo || { rounds: [], engines: [], questions: [], round_scores: [], schema: [] };
      const lastIdx = (() => { let i = -1; (g.round_scores || []).forEach((r, k) => { if (r.tested > 0) i = k; }); return i; })();
      const [ri, setRi] = useState(lastIdx < 0 ? 0 : lastIdx);
      const cell = (v) => /^yes$/i.test(v) ? h`<span class="sp-yes">✓</span>` : /^no$/i.test(v) ? h`<span class="sp-no">·</span>` : h`<span class="sp-na">–</span>`;
      const short = { 'Google AI Overview': 'Google AI', ChatGPT: 'ChatGPT', Perplexity: 'Perplexity', Gemini: 'Gemini' };
      return h`<div>
        <div class="sp-note" style=${{ marginTop: 0, background: 'var(--brbg)', color: 'var(--t1)' }}>
          More parents now ask ChatGPT, Gemini or Google's AI answer <i>"which is the best school in Rudrapur?"</i> instead of scrolling results. Every round we ask the same ${g.questions.length} questions in all ${g.engines.length || 4} and record whether your school is named.
        </div>
        <div class="sp-tiles">${(g.round_scores || []).map((r, i) => h`<button key=${i} class="sp-tile" onClick=${() => setRi(i)} style=${{ borderColor: i === ri ? BRAND : 'var(--bd)' }}>
          <div class="sp-tile-l">${r.round.replace(/\s*re-test/i, '')}</div>
          <div class="sp-tile-v">${r.tested ? r.visible : '—'}<small> / ${r.of}</small></div>
          <div class="sp-tile-s">${r.tested ? `${r.mentions} mentions` : 'not tested yet'}</div></button>`)}</div>
        <div class="sp-h"><h3>${g.rounds[ri] || 'Questions'}</h3><span>✓ = your school named</span></div>
        <div class="sp-card" style=${{ overflowX: 'auto' }}>
          <table class="sp-grid"><thead><tr><th>Question parents ask</th>${g.engines.map(e => h`<th key=${e}>${short[e] || e}</th>`)}</tr></thead>
          <tbody>${g.questions.map(q => h`<tr key=${q.n}><td style=${{ fontSize: 12.5, lineHeight: 1.35 }}>${q.q}</td>${(q.results[ri]?.engines || []).map((v, k) => h`<td key=${k}>${cell(v)}</td>`)}</tr>`)}</tbody></table>
        </div>
        <div class="sp-h"><h3>Answer-ready pages</h3><span>${d.stats?.faq_live || 0} with FAQ answers live</span></div>
        <div class="sp-card" style=${{ overflowX: 'auto' }}>
          <table class="sp-grid"><thead><tr><th>Page</th><th>FAQ</th><th>How-to</th><th>Voice</th><th>Author</th><th></th></tr></thead>
          <tbody>${(g.schema || []).map(s => h`<tr key=${s.n}><td style=${{ fontSize: 12.5 }}>${s.page}</td>
            ${['faq', 'howto', 'speakable', 'person'].map(k => h`<td key=${k}>${norm(s[k]) === 'live' ? h`<span class="sp-yes">✓</span>` : norm(s[k]) === 'planned' ? h`<span class="sp-no">·</span>` : h`<span class="sp-na">–</span>`}</td>`)}
            <td><${Pill} s=${s.status}/></td></tr>`)}</tbody></table>
        </div>
        <div class="sp-note">FAQ, how-to and author markup is hidden code on each page that tells Google and AI tools exactly who you are and what you offer. · = planned, ✓ = live.</div>
      </div>`;
    }

    function Todos({ todos, onAction, readOnly }) {
      const [open, setOpen] = useState(null);     // key of the row with the changes / note box open
      const [note, setNote] = useState('');
      const [busy, setBusy] = useState(null);
      const act = async (t, kind) => {
        if (readOnly || !onAction) return;
        if (kind === 'changes' && !note.trim()) return;
        setBusy(t.tab + t.key + kind);
        try { await onAction(kind, t.tab, t.row, t.key, (kind === 'changes' || open === t.tab + t.key) ? note.trim() : ''); setOpen(null); setNote(''); }
        finally { setBusy(null); }
      };
      const groups = [['input', 'Information we need from the school', 'We write and structure everything; the facts have to come from you.'],
        ['access', 'Access we need', 'Add projects@advancemediasolution.com as a user. Never send passwords here or on WhatsApp.'],
        ['approval', 'To approve', 'Read and approve, or tell us what to change. We need approvals within 3 working days to stay on schedule.']];
      const topics = todos.filter(t => t.tab === 'blogs' && !t.pending && /topic/i.test(t.label));
      const approveAll = async () => {
        if (readOnly || !onAction || !topics.length) return;
        if (!confirm(`Approve all ${topics.length} blog topics? You can still ask for changes on any blog when its draft comes for review.`)) return;
        setBusy('all');
        try { for (const t of topics) await onAction('approve', t.tab, t.row, t.key, ''); } finally { setBusy(null); }
      };
      if (!todos.length) return h`<div class="sp-empty"><i class="ti ti-circle-check" style=${{ color: 'var(--ok)' }}></i>Nothing is waiting on you right now. Thank you!</div>`;
      return h`<div>${groups.map(([kind, title, hint]) => {
        const list = todos.filter(t => t.kind === kind).sort((a, b) => (b.late ? 1 : 0) - (a.late ? 1 : 0) || String(a.due || '9').localeCompare(String(b.due || '9')));
        if (!list.length) return null;
        return h`<div key=${kind}>
          <div class="sp-h"><h3>${title}</h3><span>${list.filter(t => !t.pending).length} open</span></div>
          <div class="sp-row-s" style=${{ margin: '-4px 2px 10px' }}>${hint}</div>
          ${kind === 'approval' && !readOnly && topics.length > 1 && h`<button class="sp-btn pri" style=${{ marginBottom: 10 }} disabled=${!!busy} onClick=${approveAll}><i class="ti ti-checks"></i>${busy === 'all' ? 'Approving…' : `Approve all ${topics.length} blog topics`}</button>`}
          <div class="sp-card">${list.map(t => {
            const k = t.tab + t.key; const isOpen = open === k;
            return h`<div class="sp-row" key=${k}>
              <div class=${'sp-row-ic ' + (t.pending ? 'done' : kind === 'approval' ? 'approval' : 'waiting')}><i class=${'ti ' + (t.pending ? 'ti-check' : AREA_IC[t.tab] || 'ti-point')}></i></div>
              <div class="sp-row-m">
                <div class="sp-row-s" style=${{ marginTop: 0, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 10, fontWeight: 700 }}>${t.label}${t.priority && /critical/i.test(t.priority) ? ' · important' : ''}</div>
                <div class="sp-row-t" style=${{ marginTop: 2 }}>${t.title}</div>
                ${t.sub && h`<div class="sp-row-s">${t.sub}</div>`}
                ${t.due && h`<div class="sp-row-s" style=${{ color: t.late ? 'var(--bad)' : 'var(--t3)', fontWeight: t.late ? 600 : 400 }}>${t.late ? 'Was needed by' : 'Needed by'} ${fmtD(t.due)}${t.status && norm(t.status) !== 'pending' ? ' · ' + t.status : ''}</div>`}
                ${t.link && h`<div class="sp-row-s"><a href=${t.link} target="_blank" rel="noopener" style=${{ color: 'var(--br)', fontWeight: 600 }}>${kind === 'access' ? 'Open' : 'Read the draft'} <i class="ti ti-external-link"></i></a></div>`}
                ${t.pending ? h`<div class="sp-row-s" style=${{ color: 'var(--ok)', fontWeight: 600 }}>${t.pending.kind === 'changes' ? 'Changes sent to the team' : t.pending.kind === 'approve' ? 'Approved' : 'Marked done'} · ${t.pending.status === 'applied' ? 'the team has it' : 'sending to the team…'}</div>`
                  : readOnly ? null : h`<div>
                  ${isOpen && h`<textarea class="sp-ta" placeholder=${kind === 'approval' ? 'What should we change?' : kind === 'input' ? 'Optional: paste a Drive link or add a note' : 'Optional note for the team'} value=${note} onInput=${(e) => setNote(e.target.value)}></textarea>`}
                  <div class="sp-acts">
                    ${kind === 'approval' && !isOpen && h`<button class="sp-btn pri" disabled=${!!busy} onClick=${() => act(t, 'approve')}><i class="ti ti-check"></i>Approve</button>`}
                    ${kind === 'approval' && (isOpen
                      ? h`<button class="sp-btn br" disabled=${!!busy || !note.trim()} onClick=${() => act(t, 'changes')}>Send changes</button>`
                      : h`<button class="sp-btn sec" onClick=${() => { setOpen(k); setNote(''); }}>Ask for changes</button>`)}
                    ${kind === 'input' && h`<button class="sp-btn pri" disabled=${!!busy} onClick=${() => act(t, 'sent')}><i class="ti ti-send"></i>We've sent this</button>`}
                    ${kind === 'access' && h`<button class="sp-btn pri" disabled=${!!busy} onClick=${() => act(t, 'given')}><i class="ti ti-key"></i>Access given</button>`}
                    ${kind !== 'approval' && !isOpen && h`<button class="sp-btn ghost" onClick=${() => { setOpen(k); setNote(''); }}>Add a note</button>`}
                    ${isOpen && h`<button class="sp-btn ghost" onClick=${() => setOpen(null)}>Cancel</button>`}
                  </div></div>`}
              </div>
            </div>`;
          })}</div>
        </div>`;
      })}</div>`;
    }

    function Reports({ p, d }) {
      const [view, setView] = useState(null);
      const [html, setHtml] = useState('');
      useEffect(() => {
        if (!view) return;
        setHtml('');
        rpcCall('seo_report_get', { p_id: view.id }).then(r => setHtml(r?.html || '')).catch(() => setHtml('<p style="font-family:sans-serif;padding:20px">Could not open the report.</p>'));
      }, [view && view.id]);
      const reports = p.reports || [];
      const sched = d.kpis?.schedule || [];
      const t = todayIST();
      const upcoming = sched.filter(s => norm(s.status) !== 'sent' && s.due && s.due >= t).slice(0, 4);
      return h`<div>
        <div class="sp-h"><h3>Weekly reports</h3><span>every Wednesday</span></div>
        ${reports.length === 0 ? h`<div class="sp-empty"><i class="ti ti-report"></i>Your first weekly report arrives on Wednesday. It also goes to your email.</div>`
          : h`<div class="sp-card">${reports.map(r => h`<button key=${r.id} class="sp-row" onClick=${() => setView(r)} style=${{ width: '100%', background: 'none', border: 'none', borderTop: '1px solid var(--bd)', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
              <div class="sp-row-ic rank"><i class="ti ti-report"></i></div>
              <div class="sp-row-m"><div class="sp-row-t"><b>Week ${r.week_no}</b> · ${fmtD(r.week_start)} – ${fmtD(r.week_end)}</div>
                <div class="sp-row-s">${(r.data?.done || []).length} things done${r.data?.stats?.ranked ? ` · ${r.data.stats.top10}/${r.data.stats.keywords} keywords in top 10` : ''}${r.note ? ' · ' + r.note.slice(0, 60) : ''}</div></div>
              <i class="ti ti-chevron-right" style=${{ color: 'var(--t3)' }}></i></button>`)}</div>`}
        ${upcoming.length > 0 && h`<div><div class="sp-h"><h3>Coming up</h3></div>
          <div class="sp-card">${upcoming.map((s, i) => h`<div class="sp-row" key=${i}>
            <div class="sp-row-ic"><i class="ti ti-calendar"></i></div>
            <div class="sp-row-m"><div class="sp-row-t">${s.report}</div></div><div class="sp-row-r">${fmtD(s.due)}</div></div>`)}</div></div>`}
        <div class="sp-note">${d.project?.reporting || 'Weekly keyword update · monthly report on real Google Analytics and Search Console data · 90-day review'}</div>
        ${view && h`<${Sheet} title=${`Week ${view.week_no} report`} onClose=${() => setView(null)}>
          ${html ? h`<iframe class="sp-frame" srcdoc=${html} sandbox="allow-popups allow-popups-to-escape-sandbox" title="Weekly report"></iframe>` : h`<div style=${{ padding: 30, textAlign: 'center', color: 'var(--t3)' }}>Opening…</div>`}
        <//>`}
      </div>`;
    }

    // ── Live Google data: read Search Console + GA4 with the agency's own Google login (migration 182) ──
    const LIVE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/webmasters.readonly', 'https://www.googleapis.com/auth/analytics.readonly'];
    async function callSync(body) {
      const cfg = window.AMS_PUBLIC_CFG || {};
      const res = await fetch((cfg.sbUrl || '') + '/functions/v1/seo-sheet-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.sbKey, apikey: cfg.sbKey,
          'x-ams-session': localStorage.getItem('ams_session_token') || '' },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.ok === false) throw new Error(out.error || ('HTTP ' + res.status));
      return out;
    }
    function googleCode(hint) {
      return new Promise((resolve, reject) => {
        const cfg = window.AMS_PUBLIC_CFG || {};
        const oauth2 = window.google && window.google.accounts && window.google.accounts.oauth2;
        if (!cfg.googleClientId || !oauth2 || !oauth2.initCodeClient) return reject(new Error('Google sign-in is still loading. Try again in a moment.'));
        let done = false;
        const client = oauth2.initCodeClient({
          client_id: cfg.googleClientId, scope: LIVE_SCOPES.join(' '), ux_mode: 'popup', redirect_uri: 'postmessage',
          include_granted_scopes: false, login_hint: hint || undefined,
          callback: (r) => { if (done) return; done = true; (r && r.code) ? resolve(r.code) : reject(new Error((r && r.error_description) || 'Google sign-in was cancelled.')); },
          error_callback: (e) => { if (done) return; done = true; reject(new Error(e && e.type === 'popup_failed_to_open' ? 'Allow pop-ups for this site, then try again.' : 'Google sign-in was cancelled.')); },
        });
        client.requestCode();
      });
    }

    function GoogleLink({ p, onSaved, toast }) {
      const [st, setSt] = useState(null);
      const [props, setProps] = useState(null);
      const [busy, setBusy] = useState('');
      const [gsc, setGsc] = useState(p.gsc_site || '');
      const [ga4, setGa4] = useState(p.ga4_property || '');
      const loadStatus = useCallback(() => rpcCall('seo_google_status', {}).then(setSt).catch(() => setSt({ connected: false, missing: true })), []);
      const loadProps = useCallback(() => callSync({ mode: 'google_props' }).then(setProps).catch(e => setProps({ error: e.message })), []);
      useEffect(() => { loadStatus(); }, [loadStatus]);
      useEffect(() => { if (st && st.connected) loadProps(); }, [st && st.connected, st && st.email]);
      const connect = async () => {
        setBusy('connect');
        try {
          const code = await googleCode('projects@advancemediasolution.com');
          const r = await callSync({ mode: 'google_exchange', code });
          toast('Google connected as ' + (r.email || '…') + ' ✓');
          await loadStatus();
        } catch (e) { toast(e.message || String(e)); }
        finally { setBusy(''); }
      };
      const disconnect = async () => {
        if (!confirm('Disconnect Google? Live Search Console / Analytics numbers stop updating for every SEO client.')) return;
        await rpcCall('seo_google_disconnect', {}).catch(() => {}); setProps(null); loadStatus();
      };
      const save = async () => {
        setBusy('save');
        try {
          await rpcCall('seo_program_save', { p_client_id: p.client_id, p_patch: { gsc_site: gsc, ga4_property: ga4 } });
          await rpcCall('seo_live_refresh', { p_client_id: p.client_id });
          toast('Saved. Fetching live numbers…'); onSaved && onSaved();
        } catch (e) { toast('Save failed: ' + (e.message || e)); }
        finally { setBusy(''); }
      };
      if (!st) return null;
      if (st.missing) return null;
      const changed = gsc !== (p.gsc_site || '') || ga4 !== (p.ga4_property || '');
      return h`<div class="sp-note" style=${{ background: 'var(--bg2)' }}>
        <div style=${{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <i class="ti ti-brand-google" style=${{ fontSize: 18 }}></i>
          <div style=${{ flex: 1, minWidth: 220 }}>
            <b style=${{ color: 'var(--t1)' }}>Live Google data</b>
            <div class="sp-row-s" style=${{ marginTop: 2 }}>${st.connected
              ? `Reading Search Console and Analytics as ${st.email}${st.last_error ? ' · ' + st.last_error : ''}`
              : 'Sign in once with the Google account the school gave access to (projects@advancemediasolution.com). Any access level that can see the reports is enough; nobody needs to add users.'}</div>
          </div>
          ${st.connected
            ? h`<button class="sp-btn ghost" onClick=${disconnect}>Disconnect</button><button class="sp-btn sec" disabled=${!!busy} onClick=${connect}>Change account</button>`
            : h`<button class="sp-btn br" disabled=${!!busy} onClick=${connect}><i class="ti ti-brand-google"></i>${busy === 'connect' ? 'Waiting for Google…' : 'Connect Google'}</button>`}
        </div>
        ${st.connected && h`<div class="sp-kv" style=${{ gridTemplateColumns: '140px 1fr' }}>
          <label>Search Console</label>
          ${props && props.gsc && props.gsc.length
            ? h`<select class="sp-in" value=${gsc} onChange=${(e) => setGsc(e.target.value)}><option value="">— not set —</option>${props.gsc.map(x => h`<option key=${x.site} value=${x.site}>${x.site.replace(/^sc-domain:/, '')} (${x.level.replace('site', '').toLowerCase()})</option>`)}</select>`
            : h`<div class="sp-row-s">${!props ? 'Loading…' : props.gsc_error || props.error || `${st.email} has no Search Console property yet. Once the school adds it (or projects@ creates and verifies it), it shows here.`}</div>`}
          <label>Google Analytics 4</label>
          ${props && props.ga4 && props.ga4.length
            ? h`<select class="sp-in" value=${ga4} onChange=${(e) => setGa4(e.target.value)}><option value="">— not set —</option>${props.ga4.map(x => h`<option key=${x.id} value=${x.id}>${x.name} · ${x.account} (${x.id})</option>`)}</select>`
            : h`<div class="sp-row-s">${!props ? 'Loading…' : props.ga4_error || props.error || `${st.email} can't see any GA4 property yet.`}</div>`}
          <span></span><div><button class="sp-btn br" disabled=${!!busy || !changed} onClick=${save}>${busy === 'save' ? 'Saving…' : 'Use these for ' + (p.data?.project?.website ? p.data.project.website.replace(/^https?:\/\//, '') : 'this client')}</button>
            ${p.live?.fetched_at && h`<span class="sp-row-s" style=${{ marginLeft: 8 }}>Last fetched ${ago(p.live.fetched_at)}${p.live.via ? ' as ' + p.live.via : ''}</span>`}</div>
        </div>`}
      </div>`;
    }

    // ── Staff panel ─────────────────────────────────────────────────────────────────────────────
    function SeoProgramPanel({ c, showToast }) {
      const [p, setP] = useState(undefined);
      const [url, setUrl] = useState('');
      const [busy, setBusy] = useState('');
      const [preview, setPreview] = useState(false);
      const [report, setReport] = useState(null);
      const [reportHtml, setReportHtml] = useState('');
      const [note, setNote] = useState('');
      const [settings, setSettings] = useState(false);
      const [form, setForm] = useState({});
      const toast = (m) => showToast && showToast(m);
      const load = useCallback(() => rpcCall('seo_program_get', { p_client_id: c.id }).then(r => { setP(r || null); return r; }).catch(e => { setP(null); console.warn('[seo-program]', e); }), [c.id]);
      useEffect(() => { load(); }, [load]);
      // while a sync is pending, poll
      useEffect(() => {
        if (!p) return;
        const waiting = (p.sync_requested_at && (!p.checked_at || p.sync_requested_at > p.checked_at)) || (p.actions || []).some(a => a.status === 'queued' || a.status === 'applying');
        if (!waiting) return;
        const t = setTimeout(load, 6000); return () => clearTimeout(t);
      }, [p, load]);
      useEffect(() => {
        if (!report) return; setReportHtml(''); setNote(report.note || '');
        rpcCall('seo_report_get', { p_id: report.id }).then(r => setReportHtml(r?.html || '')).catch(() => setReportHtml(''));
      }, [report && report.id]);

      const save = async (patch) => {
        setBusy('save');
        try { const r = await rpcCall('seo_program_save', { p_client_id: c.id, p_patch: patch }); setP(r); toast('Saved ✓'); return r; }
        catch (e) { toast(String(e?.message || e).replace(/^.*?:\s*/, '')); }
        finally { setBusy(''); }
      };
      const syncNow = async () => {
        setBusy('sync');
        try { await rpcCall('seo_program_sync_now', { p_client_id: c.id }); toast('Reading the sheet…'); setTimeout(load, 5000); }
        catch (e) { toast('Could not start: ' + (e?.message || e)); } finally { setBusy(''); }
      };
      const draftNow = async () => {
        setBusy('draft');
        try { await rpcCall('seo_report_draft_now', { p_client_id: c.id }); toast('Building this week’s report…'); setTimeout(load, 6000); setTimeout(load, 14000); }
        catch (e) { toast('Could not start: ' + (e?.message || e)); } finally { setBusy(''); }
      };
      const send = async () => {
        if (!report) return;
        if (!confirm(`Send the week ${report.week_no} report to ${c.name}? It goes by email and shows in their portal.`)) return;
        setBusy('send');
        try { const r = await rpcCall('seo_report_send', { p_id: report.id, p_note: note }); toast(`Sent ✓ ${r?.to ? 'to ' + r.to : ''}`); setReport(null); load(); }
        catch (e) { toast('Send failed: ' + (e?.message || e)); } finally { setBusy(''); }
      };
      const saveNote = async () => {
        if (!report) return;
        try { await rpcCall('seo_report_note', { p_id: report.id, p_note: note }); const r = await rpcCall('seo_report_get', { p_id: report.id }); setReportHtml(r?.html || ''); toast('Note saved'); }
        catch (e) { toast('Save failed'); }
      };
      const skip = async () => {
        if (!report || !confirm('Skip this week’s report? The school won’t get one.')) return;
        await rpcCall('seo_report_skip', { p_id: report.id }).catch(() => {}); setReport(null); load();
      };
      const copySa = () => { try { navigator.clipboard.writeText(SA_EMAIL); toast('Copied'); } catch (_) { } };

      if (p === undefined) return h`<div class="sp-root sp-staff" style=${{ color: 'var(--t3)', fontSize: 13 }}>Loading SEO programme…</div>`;
      if (p === null) return h`<div class="sp-root sp-staff">
        <div style=${{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div class="sp-row-ic approval" style=${{ width: 38, height: 38 }}><i class="ti ti-device-mobile" style=${{ fontSize: 20 }}></i></div>
          <div style=${{ flex: 1, minWidth: 0 }}>
            <div style=${{ fontWeight: 600, fontSize: 14.5 }}>SEO client portal</div>
            <div class="sp-row-s" style=${{ fontSize: 12.5 }}>Connect ${c.name}'s master tracker sheet. The school then sees live progress, rankings, backlinks, AI visibility and its to-dos in the portal, gets a daily update, and a weekly report you check and send.</div>
            <div class="sp-row-s" style=${{ fontSize: 12.5, marginTop: 8 }}>1. Share the sheet with <b style=${{ color: 'var(--t1)' }}>${SA_EMAIL}</b> as <b style=${{ color: 'var(--t1)' }}>Editor</b> <button class="sp-btn ghost" onClick=${copySa} style=${{ padding: '0 4px' }}><i class="ti ti-copy"></i></button><br/>2. Paste the sheet link:</div>
            <div style=${{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input class="sp-in" placeholder="https://docs.google.com/spreadsheets/d/…" value=${url} onInput=${(e) => setUrl(e.target.value)}/>
              <button class="sp-btn br" disabled=${!url.trim() || busy} onClick=${() => save({ sheet_url: url.trim() })}>${busy ? 'Connecting…' : 'Connect'}</button>
            </div>
          </div>
        </div>
      </div>`;

      const d = p.data; const s = d?.stats || {};
      const pendingSync = p.sync_requested_at && (!p.checked_at || p.sync_requested_at > p.checked_at);
      const drafts = (p.reports || []).filter(r => r.status === 'draft');
      const failed = (p.actions || []).filter(a => a.status === 'failed');
      const portalPayload = { data: d, live: p.live, events: p.events, reports: (p.reports || []).filter(r => r.status === 'sent'), actions: p.actions, synced_at: p.synced_at };
      return h`<div class="sp-root sp-staff">
        <div style=${{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div class="sp-row-ic approval" style=${{ width: 38, height: 38 }}><i class="ti ti-device-mobile" style=${{ fontSize: 20 }}></i></div>
          <div style=${{ flex: 1, minWidth: 200 }}>
            <div style=${{ fontWeight: 600, fontSize: 14.5 }}>SEO client portal ${!p.enabled && h`<span class="sp-pill bad">off</span>`}</div>
            <div class="sp-row-s" style=${{ marginTop: 2 }}>${pendingSync ? 'Reading the sheet…' : p.synced_at ? `Sheet read ${ago(p.synced_at)}` : 'Not read yet'} · <a href=${p.sheet_url} target="_blank" rel="noopener" style=${{ color: 'inherit' }}>open sheet</a>
              ${d && ` · ${d.overall_pct ?? 0}% done · ${d.phase?.month_label || ''}${d.phase?.started ? `, day ${d.phase.day}` : ''}`}</div>
          </div>
          <div style=${{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button class="sp-btn sec" disabled=${!!busy || pendingSync} onClick=${syncNow}><i class=${'ti ti-refresh' + (pendingSync ? ' spinner' : '')}></i>Sync now</button>
            <button class="sp-btn sec" disabled=${!d} onClick=${() => setPreview(true)}><i class="ti ti-eye"></i>Preview as school</button>
            <button class="sp-btn ghost" onClick=${() => { setForm({ seo_only: p.seo_only, auto_send: p.auto_send, report_to: p.report_to || '', sheet_url: p.sheet_url, enabled: p.enabled }); setSettings(!settings); }}><i class="ti ti-settings"></i></button>
          </div>
        </div>
        ${p.sync_error && h`<div class="sp-note" style=${{ background: 'var(--badbg)', color: 'var(--bad)' }}><b>Sheet not read:</b> ${p.sync_error}</div>`}
        ${p.live_error && h`<div class="sp-note" style=${{ background: 'var(--warnbg)', color: 'var(--warn)' }}>${p.live_error}</div>`}
        ${failed.length > 0 && h`<div class="sp-note" style=${{ background: 'var(--warnbg)', color: 'var(--warn)' }}>${failed.length} school action${failed.length === 1 ? '' : 's'} could not be written to the sheet: ${failed[0].error}</div>`}
        ${p.portal_logins === 0 && h`<div class="sp-note">Nobody from ${c.name} can open the portal yet. Add a portal login under Overview → Brand members.</div>`}
        <${GoogleLink} p=${p} onSaved=${() => setTimeout(load, 8000)} toast=${toast}/>

        ${settings && h`<div class="sp-kv">
          <label>Master sheet</label><input class="sp-in" value=${form.sheet_url} onInput=${(e) => setForm({ ...form, sheet_url: e.target.value })}/>
          <label>Portal opens on SEO</label><label style=${{ color: 'var(--t1)' }}><input type="checkbox" checked=${form.seo_only} onChange=${(e) => setForm({ ...form, seo_only: e.target.checked })}/> SEO-only client (hide the social media tabs)</label>
          <label>Weekly report</label><label style=${{ color: 'var(--t1)' }}><input type="checkbox" checked=${form.auto_send} onChange=${(e) => setForm({ ...form, auto_send: e.target.checked })}/> Send automatically Wednesday 10:00 (otherwise a manager checks and sends)</label>
          <label>Also email reports to</label><input class="sp-in" placeholder="principal@school.com, admin@school.com" value=${form.report_to} onInput=${(e) => setForm({ ...form, report_to: e.target.value })}/>

          <label>Portal</label><label style=${{ color: 'var(--t1)' }}><input type="checkbox" checked=${form.enabled} onChange=${(e) => setForm({ ...form, enabled: e.target.checked })}/> On</label>
          <span></span><div><button class="sp-btn br" disabled=${busy === 'save'} onClick=${async () => { const r = await save(form); if (r) setSettings(false); }}>Save</button>
</div>
        </div>`}

        ${d && h`<div class="sp-tiles four" style=${{ marginBottom: 4 }}>
          <div class="sp-tile"><div class="sp-tile-l">Top 10</div><div class="sp-tile-v">${s.ranked ? s.top10 : '—'}<small> / ${s.keywords}</small></div></div>
          <div class="sp-tile"><div class="sp-tile-l">Backlinks live</div><div class="sp-tile-v">${s.backlinks_live}<small> / ${s.backlinks_target || '—'}</small></div></div>
          <div class="sp-tile"><div class="sp-tile-l">Waiting on school</div><div class="sp-tile-v">${todoList(d, p.actions).filter(t => !t.pending).length}</div></div>
          <div class="sp-tile"><div class="sp-tile-l">Changes this week</div><div class="sp-tile-v">${(p.events || []).filter(e => Date.now() - Date.parse(e.at) < 7 * 864e5).length}</div></div>
        </div>`}

        <div class="sp-h" style=${{ marginTop: 14 }}><h3>Weekly reports</h3>
          <button class="sp-btn sec" disabled=${!d || !!busy} onClick=${draftNow}><i class="ti ti-file-plus"></i>Draft this week now</button></div>
        ${(p.reports || []).length === 0 ? h`<div class="sp-row-s">The first draft is built Tuesday night (or click "Draft this week now"). ${p.auto_send ? 'It sends itself Wednesday 10:00.' : 'You check it, add a line if you like, and send.'}</div>`
          : h`<div class="sp-card">${p.reports.slice(0, 8).map(r => h`<div class="sp-row" key=${r.id}>
              <div class=${'sp-row-ic ' + (r.status === 'sent' ? 'done' : r.status === 'draft' ? 'approval' : '')}><i class="ti ti-report"></i></div>
              <div class="sp-row-m"><div class="sp-row-t"><b>Week ${r.week_no}</b> · ${fmtD(r.week_start)} – ${fmtD(r.week_end)}</div>
                <div class="sp-row-s">${r.status === 'sent' ? `Sent ${ago(r.sent_at)} by ${r.sent_by || '—'}${r.sent_to ? ' to ' + r.sent_to : ''}` : r.status === 'draft' ? 'Draft — check and send' : 'Skipped'}</div></div>
              <button class="sp-btn ${r.status === 'draft' ? 'br' : 'sec'}" onClick=${() => setReport(r)}>${r.status === 'draft' ? 'Check & send' : 'View'}</button>
            </div>`)}</div>`}

        ${(p.actions || []).length > 0 && h`<div><div class="sp-h"><h3>What the school did in the portal</h3></div>
          <div class="sp-card">${p.actions.filter(a => a.kind !== 'report_sent').slice(0, 8).map(a => h`<div class="sp-row" key=${a.id}>
            <div class="sp-row-m"><div class="sp-row-t">${{ approve: 'Approved', changes: 'Asked for changes', sent: 'Sent', given: 'Gave access' }[a.kind] || a.kind}: ${a.row_key}</div>
              <div class="sp-row-s">${a.by_name || ''} · ${ago(a.created_at)}${a.note ? ` · “${a.note}”` : ''}${a.error ? ' · ' + a.error : ''}</div></div>
            <div class="sp-row-r"><span class=${'sp-pill ' + (a.status === 'applied' ? 'ok' : a.status === 'failed' ? 'bad' : 'warn')}>${a.status === 'applied' ? 'in sheet' : a.status}</span></div></div>`)}</div></div>`}

        ${preview && h`<div class="sp-overlay">
          <div style=${{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#1a1a1a', color: '#fff', fontSize: 13 }}>
            <span><i class="ti ti-eye"></i> What ${c.name} sees (read-only)</span>
            <button class="sp-btn" style=${{ background: '#fff', color: '#1a1a1a' }} onClick=${() => setPreview(false)}>Close</button></div>
          <div style=${{ maxWidth: 480, margin: '0 auto', borderLeft: '1px solid #eee', borderRight: '1px solid #eee', minHeight: '100vh', background: 'var(--bg,#fff)' }} class="sp-root">
            <${SeoPortalView} payload=${portalPayload} readOnly=${true} clientName=${c.name}/></div>
        </div>`}

        ${report && h`<${Sheet} title=${`Week ${report.week_no} report · ${c.name}`} onClose=${() => setReport(null)}
            right=${report.status === 'draft' ? h`<button class="sp-btn ghost" onClick=${skip}>Skip</button>` : null}>
          ${report.status !== 'skipped' && h`<div style=${{ padding: '12px 16px', borderBottom: '1px solid var(--bd)' }}>
            <div class="sp-row-s" style=${{ marginTop: 0 }}>Your line on top (optional) — e.g. what you want the Director to notice this week</div>
            <textarea class="sp-ta" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="This week the admissions page went live…"></textarea>
            <div class="sp-acts"><button class="sp-btn sec" onClick=${saveNote}>Save note & refresh preview</button>
              <button class="sp-btn br" disabled=${busy === 'send'} onClick=${send}><i class="ti ti-send"></i>${report.status === 'sent' ? 'Send again' : 'Send to school'}</button></div>
          </div>`}
          ${reportHtml ? h`<iframe class="sp-frame" srcdoc=${reportHtml} sandbox="allow-popups allow-popups-to-escape-sandbox" title="Report preview"></iframe>` : h`<div style=${{ padding: 30, textAlign: 'center', color: 'var(--t3)' }}>Loading…</div>`}
        <//>`}
      </div>`;
    }

    built = { SeoPortalView, SeoProgramPanel, todoList };
    return built;
  }

  window.AMS_SEO_PROGRAM = { get };
})();

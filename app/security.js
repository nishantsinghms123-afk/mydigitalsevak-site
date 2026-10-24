/* ============================================================================
 * security.js — Roles & permissions, two-step verification, API keys (parity v2, WS L)
 *
 *   window.AMS_SECURITY.buildSecurity(deps) → { SecuritySection, RolesSection,
 *     ApiKeysSection, SECTIONS, usePerms, can }
 *   window.AMS_PERMS  — permission helper for every other module: AMS_PERMS.can('manage_docs')
 *   window.AMS_QR     — tiny QR encoder, available as soon as this file loads
 *                       (index.html's login screen uses it for the 2FA setup step)
 *
 * Backed by migration 102. Everything is fail-open: before the migration is applied
 * `my_permissions` is missing, so AMS_PERMS falls back to the role presets and each
 * settings section shows a "needs migration" note instead of erroring.
 *
 * Sections registered into window.AMS_EXT.settingsSections (settings.js renders them):
 *   security  — my two-step verification + (admin) workspace security policy
 *   roles     — role/permission matrix + per-member assignment
 *   api-keys  — personal API keys + REST/MCP docs
 * ==========================================================================*/
(function () {

  // ===========================================================================
  // QR encoder — byte mode, ECC level M, versions 1–15. Enough for any
  // otpauth:// URI (~200 chars). Kept at file scope (no deps) so the login
  // screen can render a QR before feature modules are built.
  // ===========================================================================
  const QR = (function () {
    const ECC_CW = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24];      // per block, level M
    const ECC_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10];                // level M
    const ALIGN = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
      [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70]];

    function rawDataModules(v) {
      let n = (16 * v + 128) * v + 64;
      if (v >= 2) { const a = Math.floor(v / 7) + 2; n -= (25 * a - 10) * a - 55; if (v >= 7) n -= 36; }
      return n;
    }
    const totalCodewords = (v) => Math.floor(rawDataModules(v) / 8);
    const dataCodewords = (v) => totalCodewords(v) - ECC_CW[v] * ECC_BLOCKS[v];

    function gfMul(a, b) {
      let z = 0;
      for (let i = 7; i >= 0; i--) { z = ((z << 1) ^ ((z >>> 7) * 0x11D)) & 0xFF; z ^= ((b >>> i) & 1) * a; }
      return z;
    }
    function rsGenerator(deg) {
      const g = new Uint8Array(deg); g[deg - 1] = 1;
      let root = 1;
      for (let i = 0; i < deg; i++) {
        for (let j = 0; j < deg; j++) {
          g[j] = gfMul(g[j], root);
          if (j + 1 < deg) g[j] ^= g[j + 1];
        }
        root = gfMul(root, 0x02);
      }
      return g;
    }
    function rsRemainder(data, gen) {
      const res = new Uint8Array(gen.length);
      for (const b of data) {
        const factor = b ^ res[0];
        res.copyWithin(0, 1); res[res.length - 1] = 0;
        for (let i = 0; i < gen.length; i++) res[i] ^= gfMul(gen[i], factor);
      }
      return res;
    }

    function matrix(text) {
      const bytes = new TextEncoder().encode(String(text == null ? '' : text));
      let ver = -1;
      for (let v = 1; v <= 15; v++) {
        if (bytes.length * 8 + 4 + (v < 10 ? 8 : 16) <= dataCodewords(v) * 8) { ver = v; break; }
      }
      if (ver < 0) return null;                      // too long — caller falls back to text

      // ---- bit stream -------------------------------------------------------
      const bits = [];
      const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
      push(0b0100, 4);
      push(bytes.length, ver < 10 ? 8 : 16);
      for (const b of bytes) push(b, 8);
      const capacity = dataCodewords(ver) * 8;
      push(0, Math.min(4, capacity - bits.length));
      push(0, (8 - bits.length % 8) % 8);
      for (let pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) push(pad, 8);
      const dataCw = new Uint8Array(bits.length / 8);
      bits.forEach((bit, i) => { dataCw[i >>> 3] |= bit << (7 - (i & 7)); });

      // ---- error correction + interleave -----------------------------------
      const numBlocks = ECC_BLOCKS[ver], eccLen = ECC_CW[ver], total = totalCodewords(ver);
      const shortLen = Math.floor(total / numBlocks) - eccLen;
      const numShort = numBlocks - total % numBlocks;
      const gen = rsGenerator(eccLen);
      const blocks = [];
      for (let i = 0, k = 0; i < numBlocks; i++) {
        const len = shortLen + (i < numShort ? 0 : 1);
        const dat = dataCw.slice(k, k + len); k += len;
        blocks.push({ dat, ecc: rsRemainder(dat, gen) });
      }
      const codewords = [];
      for (let i = 0; i < shortLen + 1; i++)
        blocks.forEach((b, j) => { if (i < b.dat.length) codewords.push(b.dat[i]); });
      for (let i = 0; i < eccLen; i++) blocks.forEach(b => codewords.push(b.ecc[i]));

      // ---- module grid ------------------------------------------------------
      const size = ver * 4 + 17;
      const mods = Array.from({ length: size }, () => new Array(size).fill(false));
      const fn = Array.from({ length: size }, () => new Array(size).fill(false));
      const setFn = (x, y, dark) => { if (x >= 0 && x < size && y >= 0 && y < size) { mods[y][x] = dark; fn[y][x] = true; } };
      const finder = (x, y) => {
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          setFn(x + dx, y + dy, d !== 2 && d !== 4);
        }
      };
      for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
      finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
      const al = ALIGN[ver];
      for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
          setFn(al[j] + dx, al[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
      // reserve format areas (values written later)
      for (let i = 0; i < 9; i++) { setFn(i, 8, false); setFn(8, i, false); }
      for (let i = 0; i < 8; i++) { setFn(size - 1 - i, 8, false); setFn(8, size - 1 - i, false); }
      setFn(8, size - 8, true);                       // dark module
      if (ver >= 7) {
        let rem = ver;
        for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
        const vbits = (ver << 12) | rem;
        for (let i = 0; i < 18; i++) {
          const bit = ((vbits >>> i) & 1) === 1, a = size - 11 + i % 3, b = Math.floor(i / 3);
          setFn(a, b, bit); setFn(b, a, bit);
        }
      }

      // ---- data placement ---------------------------------------------------
      let idx = 0;
      for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) {
          for (let j = 0; j < 2; j++) {
            const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
            if (!fn[y][x] && idx < codewords.length * 8) {
              mods[y][x] = ((codewords[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0;
              idx++;
            }
          }
        }
      }

      // ---- masking (pick the lowest penalty) --------------------------------
      const maskFn = [
        (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
        (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
        (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0,
      ];
      const applyMask = (m) => {
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
          if (!fn[y][x] && maskFn[m](x, y)) mods[y][x] = !mods[y][x];
      };
      const drawFormat = (m) => {
        const data = (0 << 3) | m;                    // 0 = ECC level M
        let rem = data;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const b = ((data << 10) | rem) ^ 0x5412;
        const bit = (i) => ((b >>> i) & 1) === 1;
        for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
        setFn(8, 7, bit(6)); setFn(8, 8, bit(7)); setFn(7, 8, bit(8));
        for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
        for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
        for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
        setFn(8, size - 8, true);
      };
      const penalty = () => {
        let p = 0;
        const runs = (get) => {
          for (let a = 0; a < size; a++) {
            let run = 1, prev = get(a, 0);
            for (let b = 1; b < size; b++) {
              const cur = get(a, b);
              if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; }
              else { prev = cur; run = 1; }
            }
          }
        };
        runs((a, b) => mods[a][b]); runs((a, b) => mods[b][a]);
        for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
          const c = mods[y][x];
          if (c === mods[y][x + 1] && c === mods[y + 1][x] && c === mods[y + 1][x + 1]) p += 3;
        }
        const pat = [true, false, true, true, true, false, true];
        const hasPat = (get, a, b) => {
          for (let i = 0; i < 7; i++) if (get(a, b + i) !== pat[i]) return false;
          const before = [], after = [];
          for (let i = 1; i <= 4; i++) { before.push(b - i >= 0 ? get(a, b - i) : false); after.push(b + 6 + i < size ? get(a, b + 6 + i) : false); }
          return before.every(v => !v) || after.every(v => !v);
        };
        for (let a = 0; a < size; a++) for (let b = 0; b + 7 <= size; b++) {
          if (hasPat((i, j) => mods[i][j], a, b)) p += 40;
          if (hasPat((i, j) => mods[j][i], a, b)) p += 40;
        }
        let dark = 0;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mods[y][x]) dark++;
        p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
        return p;
      };
      let best = 0, bestPenalty = Infinity;
      for (let m = 0; m < 8; m++) {
        applyMask(m); drawFormat(m);
        const p = penalty();
        if (p < bestPenalty) { bestPenalty = p; best = m; }
        applyMask(m);
      }
      applyMask(best); drawFormat(best);
      return mods;
    }

    // SVG string with a 4-module quiet zone. `dark`/`light` are CSS colours.
    function svg(text, opts) {
      const o = opts || {};
      const m = matrix(text);
      if (!m) return '';
      const q = 4, n = m.length + q * 2;
      let d = '';
      for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++)
        if (m[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" width="' + (o.size || 190) +
        '" height="' + (o.size || 190) + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
        '<rect width="' + n + '" height="' + n + '" fill="' + (o.light || '#ffffff') + '"/>' +
        '<path d="' + d + '" fill="' + (o.dark || '#000000') + '"/></svg>';
    }
    return { matrix, svg };
  })();
  window.AMS_QR = window.AMS_QR || QR;

  // ===========================================================================
  // Permission helper (window.AMS_PERMS) — mirrors migration 102's presets so it
  // works before the migration is applied and before my_permissions resolves.
  // ===========================================================================
  const PERM_KEYS = ['manage_statuses', 'manage_tags', 'manage_fields', 'manage_templates', 'manage_automations',
    'manage_docs', 'manage_forms', 'approve_timesheets', 'view_finance', 'invite_members',
    'delete_tasks', 'manage_dashboards', 'export_data', 'use_api'];

  const PERM_META = {
    manage_statuses: ['Manage statuses', 'workspace'], manage_tags: ['Manage tags', 'workspace'],
    manage_fields: ['Manage custom fields', 'workspace'], manage_templates: ['Manage task templates', 'workspace'],
    manage_automations: ['Manage automations', 'workspace'], manage_docs: ['Manage docs & wikis', 'content'],
    manage_forms: ['Manage forms', 'content'], manage_dashboards: ['Manage dashboards', 'content'],
    approve_timesheets: ['Approve timesheets', 'people'], invite_members: ['Invite people', 'people'],
    delete_tasks: ['Delete other people’s tasks', 'people'], view_finance: ['See finance', 'money'],
    export_data: ['Export data (CSV/PDF)', 'money'], use_api: ['Create API keys', 'workspace'],
  };
  const PERM_GROUPS = [['workspace', 'Workspace setup'], ['content', 'Content & reporting'], ['people', 'People & tasks'], ['money', 'Money & exports']];

  function presetPermissions(role) {
    const out = {};
    PERM_KEYS.forEach(k => {
      out[k] = role === 'admin' ? true
        : role === 'manager' ? (k !== 'view_finance' && k !== 'invite_members')
          : role === 'accounts_head' ? (k === 'view_finance' || k === 'export_data')
            : role === 'seo' ? (k === 'manage_docs' || k === 'manage_dashboards' || k === 'export_data')
              : false;
    });
    return out;
  }
  const ROLE_LABEL = {
    admin: 'Admin', manager: 'Manager', accounts_head: 'Accounts Head', seo: 'SEO Expert',
    editor: 'Editor', designer: 'Designer', freelancer: 'Freelancer', client: 'Client',
  };
  const STAFF_ROLES = ['admin', 'manager', 'accounts_head', 'seo', 'editor', 'designer', 'freelancer'];

  function storedRole() {
    try { const u = JSON.parse(localStorage.getItem('ams_user') || 'null'); return (u && u.role_level) || null; } catch (_) { return null; }
  }

  const PERMS = (window.AMS_PERMS = window.AMS_PERMS || {});
  const subs = new Set();
  const notify = () => {
    subs.forEach(f => { try { f(PERMS); } catch (_) { } });
    try { window.dispatchEvent(new CustomEvent('ams-perms-changed')); } catch (_) { }
  };
  Object.assign(PERMS, {
    ready: PERMS.ready || false,
    loading: false,
    role_level: PERMS.role_level || storedRole(),
    custom_role: PERMS.custom_role || null,
    permissions: PERMS.permissions || presetPermissions(storedRole()),
    keys: PERM_KEYS,
    idle_minutes: PERMS.idle_minutes || 0,
    mfa: PERMS.mfa || { enabled: false, required: false },
    can(p) { return !!(PERMS.permissions && PERMS.permissions[p]); },
    presetFor: presetPermissions,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  });

  // ===========================================================================
  // Module factory
  // ===========================================================================
  function buildSecurity(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo, rpcCall } = deps;
    const Fragment = React.Fragment;
    const supabase = deps.supabase || null;
    const SB_URL = deps.SB_URL || '';
    const Skel = deps.Skel || function SkelFallback(p) { return h`<div class="sx-skel" style=${{ height: (p && p.h) || 32 }}></div>`; };

    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i.test(
      String((e && (e.code || '')) + ' ' + ((e && (e.message || e.details)) || '')));
    const ERRS = {
      'auth.forbidden': 'You don’t have permission to do that',
      forbidden: 'You don’t have permission to do that',
      'auth.expired': 'Session expired — sign in again',
      'auth.no_session': 'Session expired — sign in again',
      last_admin: 'This is the only admin left — make someone else an admin first',
      role_in_use: 'Members still use this role — move them to another role first',
      name_taken: 'A role with that name already exists',
      bad_base_role: 'Pick a base role for this custom role',
      bad_name: 'Give it a short name',
      bad_scopes: 'Choose at least one permission for the key',
      bad_idle_minutes: 'Choose 5 minutes or more (or Off)',
      api_key_limit: 'This workspace already has 50 active keys',
      'mfa.already_enabled': 'Two-step verification is already on',
      'mfa.required_by_policy': 'Your workspace requires two-step verification, so it can’t be turned off',
      'mfa.use_disable': 'Use “Turn off” on your own account',
      not_found: 'That item no longer exists',
    };
    function errText(e) {
      if (!e) return 'Something went wrong';
      if (isMissingRpc(e)) return 'This needs database migration 102 — ask an admin to apply it';
      const m = String((e.code && ERRS[e.code]) || e.message || e);
      const key = Object.keys(ERRS).find(k => m.includes(k));
      return key ? ERRS[key] : m;
    }
    const codeText = (code, extra) => ({
      mfa_invalid: 'That code isn’t right.' + (extra && extra.attempts_left != null ? ' ' + extra.attempts_left + ' attempt' + (extra.attempts_left === 1 ? '' : 's') + ' left.' : ''),
      mfa_expired: 'That sign-in request expired. Start again.',
      mfa_locked: 'Too many wrong codes. Try again in ' + ((extra && extra.retry_after_minutes) || 15) + ' minutes.',
      mfa_too_many_attempts: 'Too many wrong codes — sign in again to get a fresh request.',
      mfa_no_pending: 'Start the setup again.',
      mfa_setup_not_started: 'Scan the QR code first.',
      mfa_not_enabled: 'Two-step verification isn’t on for your account.',
      mfa_not_setup: 'Nothing to set up here.',
    }[code] || 'Something went wrong');

    const fmtStamp = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return isNaN(d) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    };
    const fmtDay = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const copy = async (text, showToast, label) => {
      try { await navigator.clipboard.writeText(text); showToast && showToast((label || 'Copied') + ' ✓'); }
      catch (_) {
        try {
          const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
          showToast && showToast((label || 'Copied') + ' ✓');
        } catch (__) { showToast && showToast('Copy failed — select the text manually'); }
      }
    };
    const download = (name, text) => {
      try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      } catch (_) { }
    };

    const reg = (key, item) => {
      const EXT = (window.AMS_EXT = window.AMS_EXT || {});
      const k = item.id || item.key || item.type;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item);
    };

    // ---- permission loading ------------------------------------------------
    async function loadPerms() {
      if (PERMS.loading) return PERMS;
      PERMS.loading = true;
      try {
        const r = await rpcCall('my_permissions', {}, { silentAuth: true });
        if (r && r.permissions) {
          PERMS.permissions = Object.assign(presetPermissions(r.role_level), r.permissions);
          PERMS.role_level = r.role_level || PERMS.role_level;
          PERMS.custom_role = r.custom_role || null;
          PERMS.idle_minutes = r.idle_minutes || 0;
          PERMS.mfa = r.mfa || PERMS.mfa;
        }
      } catch (e) {
        // pre-102 database or no session: keep the role presets (fail-open)
        PERMS.permissions = presetPermissions(PERMS.role_level || storedRole());
      }
      PERMS.ready = true; PERMS.loading = false; notify();
      return PERMS;
    }
    PERMS.reload = () => { PERMS.loading = false; return loadPerms(); };
    try { if (localStorage.getItem('ams_session_token')) loadPerms(); } catch (_) { }

    function usePerms() {
      const [, force] = useState(0);
      useEffect(() => {
        const off = PERMS.subscribe(() => force(x => x + 1));
        if (!PERMS.ready) loadPerms();
        return off;
      }, []);
      return PERMS;
    }

    // ---- shared async helper ----------------------------------------------
    function useAsync(fn, watch) {
      const [state, setState] = useState({ loading: true, data: null, error: null, missing: false });
      const alive = useRef(true);
      const run = useCallback(async () => {
        setState(s => ({ ...s, loading: true }));
        try {
          const data = await fn();
          if (alive.current) setState({ loading: false, data, error: null, missing: false });
        } catch (e) {
          if (alive.current) setState({ loading: false, data: null, error: e, missing: isMissingRpc(e) });
        }
      }, watch || []);
      useEffect(() => { alive.current = true; run(); return () => { alive.current = false; }; }, [run]);
      return {
        ...state, reload: run,
        setData: (d) => setState(s => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })),
      };
    }

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-security-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-security-styles';
      st.textContent = `
      :where(:root){--cu-bg:#ffffff;--cu-bg2:#f7f7f8;--cu-bg3:#efeff1;--cu-bd:#e8e8eb;--cu-bd2:#d6d6db;--cu-t1:#1f1f23;--cu-t2:#5c5c66;--cu-t3:#8e8e99;--cu-accent:#ff00ee;--cu-accent-ink:#a8009c;--cu-accent-fog:rgba(255,0,238,.08);--cu-radius:8px;--cu-radius-sm:6px}
      :where(html.dark){--cu-bg:#1c1b1f;--cu-bg2:#161518;--cu-bg3:#26252a;--cu-bd:#2d2c31;--cu-bd2:#3b3a40;--cu-t1:#ececef;--cu-t2:#a9a8b1;--cu-t3:#75747d;--cu-accent:#ff66f5;--cu-accent-ink:#ff7df6;--cu-accent-fog:rgba(255,102,245,.12)}
      .sx-root{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--cu-t1);max-width:940px;min-width:0}
      .sx-root *{box-sizing:border-box}
      .sx-hd{margin-bottom:18px}
      .sx-hd-t{display:flex;align-items:center;gap:8px;font-size:20px;font-weight:600}
      .sx-hd-t i{font-size:22px;color:var(--cu-accent)}
      .sx-hd-s{font-size:13px;color:var(--cu-t2);margin-top:4px;line-height:1.5;max-width:680px}
      .sx-card{background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);margin-bottom:16px;min-width:0}
      .sx-card-hd{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--cu-bd);flex-wrap:wrap}
      .sx-card-tt{flex:1;min-width:150px}
      .sx-card-t{font-size:15px;font-weight:600}
      .sx-card-s{font-size:12px;color:var(--cu-t3);margin-top:2px;line-height:1.45}
      .sx-card-b{padding:14px 16px;min-width:0}
      .sx-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .sx-sp{flex:1}
      .sx-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:var(--cu-radius-sm);border:1px solid var(--cu-bd2);background:var(--cu-bg);color:var(--cu-t1);font:600 13px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
      .sx-btn:hover{background:var(--cu-bg3)}
      .sx-btn:disabled{opacity:.5;cursor:not-allowed}
      .sx-btn.pri{background:var(--cu-accent);border-color:var(--cu-accent);color:#fff}
      .sx-btn.pri:hover{filter:brightness(1.06)}
      .sx-btn.danger{color:#dc2626;border-color:#f3c4c4}
      .sx-btn.danger:hover{background:rgba(220,38,38,.08)}
      .sx-btn.sm{height:26px;padding:0 9px;font-size:12px}
      .sx-in{width:100%;height:32px;padding:0 10px;border:1px solid var(--cu-bd2);border-radius:var(--cu-radius-sm);background:var(--cu-bg);color:var(--cu-t1);font:13px Inter,system-ui,sans-serif;min-width:0}
      .sx-in:focus{outline:none;border-color:var(--cu-accent)}
      .sx-in.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
      .sx-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3);display:block;margin-bottom:5px}
      .sx-f{margin-bottom:12px;min-width:0}
      .sx-hint{font-size:12px;color:var(--cu-t3);line-height:1.5}
      .sx-note{font-size:12.5px;color:var(--cu-t2);line-height:1.5;background:var(--cu-bg2);border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);padding:10px 12px}
      .sx-pill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;font-size:11.5px;font-weight:600}
      .sx-pill.on{background:rgba(22,163,74,.12);color:#15803d}
      .sx-pill.off{background:var(--cu-bg3);color:var(--cu-t2)}
      .sx-pill.warn{background:rgba(245,166,35,.16);color:#b45309}
      .sx-tblwrap{overflow-x:auto;border:1px solid var(--cu-bd);border-radius:var(--cu-radius)}
      .sx-tbl{width:100%;border-collapse:collapse;font-size:13px;min-width:520px}
      .sx-tbl th{position:sticky;top:0;background:var(--cu-bg2);text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3);padding:8px 10px;border-bottom:1px solid var(--cu-bd);white-space:nowrap}
      .sx-tbl td{padding:8px 10px;border-bottom:1px solid var(--cu-bd);vertical-align:middle}
      .sx-tbl tr:last-child td{border-bottom:none}
      .sx-tbl tbody tr:hover{background:var(--cu-bg2)}
      .sx-tbl td.c,.sx-tbl th.c{text-align:center}
      .sx-grp td{background:var(--cu-bg2);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3)}
      .sx-chk{width:16px;height:16px;accent-color:var(--cu-accent);cursor:pointer}
      .sx-chk:disabled{cursor:not-allowed;opacity:.55}
      .sx-dot{font-size:15px;line-height:1}
      .sx-qr{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}
      .sx-qr-box{background:#fff;padding:10px;border:1px solid var(--cu-bd);border-radius:var(--cu-radius);line-height:0}
      .sx-key{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;letter-spacing:.08em;background:var(--cu-bg3);border-radius:var(--cu-radius-sm);padding:7px 10px;word-break:break-all;user-select:all}
      .sx-code{width:170px;height:40px;text-align:center;font:600 19px/40px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.32em;text-indent:.32em;border:1px solid var(--cu-bd2);border-radius:var(--cu-radius-sm);background:var(--cu-bg);color:var(--cu-t1)}
      .sx-code:focus{outline:none;border-color:var(--cu-accent)}
      .sx-codes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;background:var(--cu-bg2);border:1px solid var(--cu-bd);border-radius:var(--cu-radius);padding:12px 14px}
      .sx-err{font-size:12.5px;color:#dc2626;line-height:1.5}
      .sx-ok{font-size:12.5px;color:#15803d;line-height:1.5}
      .sx-modal-bd{position:fixed;inset:0;background:rgba(15,15,20,.42);display:flex;align-items:center;justify-content:center;padding:16px;z-index:1200}
      .sx-modal{background:var(--cu-bg);border:1px solid var(--cu-bd);border-radius:12px;box-shadow:0 18px 48px rgba(15,15,20,.24);width:min(560px,100%);max-height:90vh;overflow:auto}
      .sx-modal-hd{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--cu-bd)}
      .sx-modal-hd b{font-size:15px;font-weight:600;flex:1}
      .sx-modal-b{padding:16px}
      .sx-modal-ft{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--cu-bd);flex-wrap:wrap}
      .sx-x{background:transparent;border:none;color:var(--cu-t3);font-size:17px;cursor:pointer;padding:2px 4px;line-height:1}
      .sx-skel{background:var(--cu-bg3);border-radius:6px;animation:sx-pulse 1.4s ease-in-out infinite}
      @keyframes sx-pulse{0%,100%{opacity:.6}50%{opacity:1}}
      .sx-scopes{display:flex;flex-direction:column;gap:8px}
      .sx-scope{display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.45}
      .sx-pre{background:var(--cu-bg2);border:1px solid var(--cu-bd);border-radius:var(--cu-radius-sm);padding:11px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.6;overflow-x:auto;white-space:pre;color:var(--cu-t1)}
      .sx-role-nm{display:flex;align-items:center;gap:7px;font-weight:600;font-size:13px}
      .sx-sub{font-size:11.5px;color:var(--cu-t3);font-weight:400}
      @media(max-width:620px){.sx-codes{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){.sx-skel{animation:none}}
      `;
      document.head.appendChild(st);
    }

    // ---- small shared components ------------------------------------------
    function Head({ icon, title, sub }) {
      return h`<div class="sx-hd">
        <div class="sx-hd-t"><i class=${'ti ' + icon}></i>${title}</div>
        ${sub && h`<div class="sx-hd-s">${sub}</div>`}
      </div>`;
    }
    function Card({ title, sub, right, children }) {
      return h`<div class="sx-card">
        ${(title || right) && h`<div class="sx-card-hd">
          <div class="sx-card-tt">
            <div class="sx-card-t">${title}</div>
            ${sub && h`<div class="sx-card-s">${sub}</div>`}
          </div>
          ${right}
        </div>`}
        <div class="sx-card-b">${children}</div>
      </div>`;
    }
    function NeedsMigration({ what }) {
      return h`<div class="sx-card"><div class="sx-card-b">
        <div class="sx-note"><strong>${what}</strong> becomes available once database migration
        ${' '}<code>102_roles_security_api.sql</code> has been applied in Supabase. Nothing else is affected — the rest of
        the app works exactly as before.</div>
      </div></div>`;
    }
    function Modal({ title, icon, onClose, footer, children, wide }) {
      useEffect(() => {
        const f = (e) => { if (e.key === 'Escape') onClose && onClose(); };
        window.addEventListener('keydown', f);
        return () => window.removeEventListener('keydown', f);
      }, [onClose]);
      return h`<div class="sx-modal-bd" onClick=${(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
        <div class="sx-modal sx-root" style=${wide ? { width: 'min(760px,100%)' } : null} role="dialog" aria-modal="true">
          <div class="sx-modal-hd">
            ${icon && h`<i class=${'ti ' + icon} style=${{ fontSize: 18, color: 'var(--cu-accent)' }}></i>`}
            <b>${title}</b>
            <button class="sx-x" onClick=${onClose} aria-label="Close"><i class="ti ti-x"></i></button>
          </div>
          <div class="sx-modal-b">${children}</div>
          ${footer && h`<div class="sx-modal-ft">${footer}</div>`}
        </div>
      </div>`;
    }
    function CodeInput({ value, onChange, onSubmit, autoFocus, disabled, recovery }) {
      const ref = useRef(null);
      useEffect(() => { if (autoFocus && ref.current) try { ref.current.focus(); } catch (_) { } }, [autoFocus]);
      if (recovery) {
        return h`<input ref=${ref} class="sx-in mono" placeholder="abcde-fghij" value=${value} disabled=${disabled}
          autoComplete="one-time-code" style=${{ maxWidth: 220 }}
          onInput=${e => onChange(e.target.value)}
          onKeyDown=${e => { if (e.key === 'Enter') onSubmit && onSubmit(); }}/>`;
      }
      return h`<input ref=${ref} class="sx-code" inputMode="numeric" pattern="[0-9]*" maxLength=${6}
        placeholder="000000" value=${value} disabled=${disabled} autoComplete="one-time-code"
        onInput=${e => {
          const v = String(e.target.value || '').replace(/[^0-9]/g, '').slice(0, 6);
          onChange(v);
          if (v.length === 6 && onSubmit) setTimeout(() => onSubmit(v), 0);
        }}
        onKeyDown=${e => { if (e.key === 'Enter') onSubmit && onSubmit(); }}/>`;
    }
    function QrBlock({ uri, secret }) {
      const svg = useMemo(() => { try { return QR.svg(uri, { size: 186 }); } catch (_) { return ''; } }, [uri]);
      return h`<div class="sx-qr">
        ${svg
          ? h`<div class="sx-qr-box" dangerouslySetInnerHTML=${{ __html: svg }}></div>`
          : h`<div class="sx-note" style=${{ maxWidth: 220 }}>Couldn’t draw the QR code — type the key below into your app instead.</div>`}
        <div style=${{ flex: 1, minWidth: 220 }}>
          <div class="sx-hint" style=${{ marginBottom: 8 }}>
            Open Google Authenticator, Microsoft Authenticator, Authy or your password manager, choose
            <strong> Scan QR code</strong>, then type the 6-digit code it shows.
          </div>
          <div class="sx-lbl">Or enter this key manually</div>
          <div class="sx-key">${(secret || '').replace(/(.{4})/g, '$1 ').trim()}</div>
        </div>
      </div>`;
    }
    function RecoveryCodes({ codes, onDone, showToast }) {
      const text = (codes || []).join('\n');
      return h`<div>
        <div class="sx-note" style=${{ marginBottom: 12 }}>
          Save these <strong>recovery codes</strong> somewhere safe. Each one signs you in once if you lose your phone.
          They are shown only now — we store them hashed and cannot show them again.
        </div>
        <div class="sx-codes">${(codes || []).map(c => h`<span key=${c}>${c}</span>`)}</div>
        <div class="sx-row" style=${{ marginTop: 12 }}>
          <button class="sx-btn" onClick=${() => copy(text, showToast, 'Recovery codes copied')}><i class="ti ti-copy"></i>Copy</button>
          <button class="sx-btn" onClick=${() => download('my-digital-sevak-recovery-codes.txt', text + '\n')}><i class="ti ti-download"></i>Download</button>
          <div class="sx-sp"></div>
          ${onDone && h`<button class="sx-btn pri" onClick=${onDone}>I’ve saved them</button>`}
        </div>
      </div>`;
    }

    // =========================================================================
    // Section 1 — Security (personal 2FA + workspace policy)
    // =========================================================================
    function MfaCard({ showToast }) {
      const st = useAsync(() => rpcCall('mfa_status'), []);
      const [stage, setStage] = useState('idle');      // idle | enroll | codes | disable
      const [enroll, setEnroll] = useState(null);      // { secret, otpauth_uri }
      const [code, setCode] = useState('');
      const [recovery, setRecovery] = useState(false);
      const [codes, setCodes] = useState(null);
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState('');
      const data = st.data || {};

      const start = async () => {
        setBusy(true); setErr('');
        try {
          const r = await rpcCall('mfa_enroll_start');
          setEnroll(r); setCode(''); setStage('enroll');
        } catch (e) { showToast && showToast(errText(e)); }
        setBusy(false);
      };
      const confirm = async (typed) => {
        const c = typed || code;
        if (!c || busy) return;
        setBusy(true); setErr('');
        try {
          const r = await rpcCall('mfa_enroll_confirm', { p_code: c });
          if (r && r.ok) { setCodes(r.recovery_codes || []); setStage('codes'); setCode(''); st.reload(); PERMS.reload(); }
          else { setErr(codeText(r && r.error, r)); setCode(''); }
        } catch (e) { setErr(errText(e)); }
        setBusy(false);
      };
      const disable = async (typed) => {
        const c = typed || code;
        if (!c || busy) return;
        setBusy(true); setErr('');
        try {
          const r = await rpcCall('mfa_disable', { p_code: c });
          if (r && r.ok) { showToast && showToast('Two-step verification turned off'); setStage('idle'); setCode(''); st.reload(); PERMS.reload(); }
          else { setErr(codeText(r && r.error, r)); setCode(''); }
        } catch (e) { setErr(errText(e)); }
        setBusy(false);
      };
      const regen = async (typed) => {
        const c = typed || code;
        if (!c || busy) return;
        setBusy(true); setErr('');
        try {
          const r = await rpcCall('mfa_recovery_regenerate', { p_code: c });
          if (r && r.ok) { setCodes(r.recovery_codes || []); setStage('codes'); setCode(''); st.reload(); }
          else { setErr(codeText(r && r.error, r)); setCode(''); }
        } catch (e) { setErr(errText(e)); }
        setBusy(false);
      };

      if (st.missing) return h`<${NeedsMigration} what="Two-step verification"/>`;
      if (st.loading && !st.data) return h`<div class="sx-card"><div class="sx-card-b"><${Skel} h=${72}/></div></div>`;

      const statusPill = data.enabled
        ? h`<span class="sx-pill on"><i class="ti ti-shield-check"></i>On</span>`
        : data.required
          ? h`<span class="sx-pill warn"><i class="ti ti-alert-triangle"></i>Required</span>`
          : h`<span class="sx-pill off">Off</span>`;

      return h`<${Card} title="Two-step verification" right=${statusPill}
        sub=${data.enabled
          ? 'Your account asks for a 6-digit code from your authenticator app at sign-in.'
          : 'Add a 6-digit code from an authenticator app on top of your password.'}>
        ${stage === 'codes' && codes
          ? h`<${RecoveryCodes} codes=${codes} showToast=${showToast} onDone=${() => { setCodes(null); setStage('idle'); }}/>`
          : stage === 'enroll'
            ? h`<div>
                <${QrBlock} uri=${(enroll && enroll.otpauth_uri) || ''} secret=${(enroll && enroll.secret) || ''}/>
                <div style=${{ marginTop: 14 }}>
                  <label class="sx-lbl" for="sx-enroll-code">Code from your app</label>
                  <div class="sx-row">
                    <${CodeInput} value=${code} onChange=${setCode} onSubmit=${confirm} autoFocus=${true} disabled=${busy}/>
                    <button class="sx-btn pri" onClick=${() => confirm()} disabled=${busy || code.length < 6}>
                      ${busy ? h`<i class="ti ti-loader-2 spinner"></i>` : h`<i class="ti ti-check"></i>`}Turn on
                    </button>
                    <button class="sx-btn" onClick=${() => { setStage('idle'); setErr(''); setCode(''); }} disabled=${busy}>Cancel</button>
                  </div>
                  ${err && h`<div class="sx-err" style=${{ marginTop: 8 }}>${err}</div>`}
                </div>
              </div>`
            : stage === 'disable'
              ? h`<div>
                  <div class="sx-note" style=${{ marginBottom: 12 }}>Enter a current code (or a recovery code) to turn two-step verification off.</div>
                  <div class="sx-row">
                    <${CodeInput} value=${code} onChange=${setCode} onSubmit=${disable} autoFocus=${true} disabled=${busy} recovery=${recovery}/>
                    <button class="sx-btn danger" onClick=${() => disable()} disabled=${busy || !code}>Turn off</button>
                    <button class="sx-btn" onClick=${() => { setStage('idle'); setErr(''); setCode(''); }} disabled=${busy}>Cancel</button>
                  </div>
                  <button class="sx-btn sm" style=${{ marginTop: 10 }} onClick=${() => { setRecovery(!recovery); setCode(''); }}>
                    ${recovery ? 'Use a 6-digit code' : 'Use a recovery code'}
                  </button>
                  ${err && h`<div class="sx-err" style=${{ marginTop: 8 }}>${err}</div>`}
                </div>`
              : data.enabled
                ? h`<div>
                    <div class="sx-hint" style=${{ marginBottom: 12 }}>
                      Turned on ${fmtStamp(data.enabled_at)}. You have
                      ${' '}<strong>${data.recovery_remaining || 0}</strong> recovery code${data.recovery_remaining === 1 ? '' : 's'} left.
                      ${data.required ? ' Your workspace requires two-step verification for your role.' : ''}
                    </div>
                    <div class="sx-row">
                      <button class="sx-btn" onClick=${() => { setStage('regen'); setCode(''); setErr(''); }}><i class="ti ti-refresh"></i>New recovery codes</button>
                      ${!data.required && h`<button class="sx-btn danger" onClick=${() => { setStage('disable'); setCode(''); setErr(''); setRecovery(false); }}>Turn off</button>`}
                    </div>
                  </div>`
                : h`<div>
                    <div class="sx-hint" style=${{ marginBottom: 12 }}>
                      ${data.required
                    ? 'Your workspace requires two-step verification for your role — you’ll be asked to set it up at your next sign-in. You can do it now instead.'
                    : 'Recommended for admins and anyone who can see money or client logins.'}
                    </div>
                    <button class="sx-btn pri" onClick=${start} disabled=${busy}>
                      ${busy ? h`<i class="ti ti-loader-2 spinner"></i>` : h`<i class="ti ti-shield-lock"></i>`}Set up
                    </button>
                  </div>`}
        ${stage === 'regen' && h`<div style=${{ marginTop: 14, borderTop: '1px solid var(--cu-bd)', paddingTop: 14 }}>
          <div class="sx-hint" style=${{ marginBottom: 10 }}>Enter a current 6-digit code to replace your recovery codes. The old ones stop working.</div>
          <div class="sx-row">
            <${CodeInput} value=${code} onChange=${setCode} onSubmit=${regen} autoFocus=${true} disabled=${busy}/>
            <button class="sx-btn pri" onClick=${() => regen()} disabled=${busy || code.length < 6}>Generate</button>
            <button class="sx-btn" onClick=${() => { setStage('idle'); setErr(''); setCode(''); }} disabled=${busy}>Cancel</button>
          </div>
          ${err && h`<div class="sx-err" style=${{ marginTop: 8 }}>${err}</div>`}
        </div>`}
      <//>`;
    }

    const IDLE_CHOICES = [[0, 'Off'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours'], [480, '8 hours']];

    function PolicyCard({ user, showToast }) {
      const load = useAsync(() => rpcCall('security_settings_get'), []);
      const [saving, setSaving] = useState(false);
      const d = load.data || {};
      const canEdit = !!d.can_edit;

      const save = async (patch) => {
        setSaving(true);
        try {
          const r = await rpcCall('security_settings_set', { p_patch: patch });
          load.setData(r); showToast && showToast('Security policy saved ✓'); PERMS.reload();
        } catch (e) { showToast && showToast(errText(e)); load.reload(); }
        setSaving(false);
      };
      const resetMfa = async (m) => {
        if (!window.confirm('Remove two-step verification for ' + m.name + '? They will set it up again at their next sign-in if your policy requires it.')) return;
        try { await rpcCall('mfa_admin_reset', { p_member_id: m.id }); showToast && showToast('Two-step verification reset for ' + m.name); load.reload(); }
        catch (e) { showToast && showToast(errText(e)); }
      };

      if (load.missing) return null;                     // the MFA card already explains the migration
      if (load.error && !load.data) return null;         // manager/admin only — silently hide otherwise
      if (load.loading && !load.data) return h`<div class="sx-card"><div class="sx-card-b"><${Skel} h=${90}/></div></div>`;

      const required = d.mfa_required_roles || [];
      const members = d.members || [];

      return h`<${Fragment}>
        <${Card} title="Workspace security" sub="Applies to everyone in this workspace.">
          <div class="sx-f">
            <label class="sx-lbl" for="sx-idle">Sign people out after inactivity</label>
            <select id="sx-idle" class="sx-in" style=${{ maxWidth: 240 }} value=${String(d.idle_minutes || 0)}
              disabled=${!canEdit || saving} onChange=${e => save({ idle_minutes: parseInt(e.target.value, 10) })}>
              ${IDLE_CHOICES.map(([v, lb]) => h`<option key=${v} value=${String(v)}>${lb}</option>`)}
            </select>
            <div class="sx-hint" style=${{ marginTop: 6 }}>
              A warning appears a minute before. Moving the mouse or typing keeps the session alive. Off means the normal
              30-day sign-in applies.
            </div>
          </div>
          <div class="sx-f" style=${{ marginBottom: 0 }}>
            <span class="sx-lbl">Require two-step verification for</span>
            <div class="sx-row" style=${{ gap: 14 }}>
              ${(d.staff_roles || STAFF_ROLES.map(r => ({ key: r, name: ROLE_LABEL[r] }))).map(r => h`
                <label key=${r.key} class="sx-scope" style=${{ alignItems: 'center' }}>
                  <input type="checkbox" class="sx-chk" checked=${required.indexOf(r.key) >= 0} disabled=${!canEdit || saving}
                    onChange=${e => save({
                      mfa_required_roles: e.target.checked
                        ? required.concat([r.key])
                        : required.filter(x => x !== r.key),
                    })}/>
                  <span>${r.name}</span>
                </label>`)}
            </div>
            <div class="sx-hint" style=${{ marginTop: 8 }}>
              People in these roles are walked through setup the next time they sign in — nobody is locked out.
            </div>
          </div>
        <//>
        <${Card} title="Who has two-step verification" sub="Reset it for anyone who lost their phone.">
          <div class="sx-tblwrap">
            <table class="sx-tbl">
              <thead><tr><th>Person</th><th>Role</th><th>Two-step</th><th>Last sign-in</th><th></th></tr></thead>
              <tbody>
                ${members.map(m => h`<tr key=${m.id}>
                  <td><div class="sx-role-nm">${m.name}</div><div class="sx-sub">${m.email || ''}</div></td>
                  <td>${ROLE_LABEL[m.role_level] || m.role_level}</td>
                  <td>${m.mfa_enabled
                    ? h`<span class="sx-pill on"><i class="ti ti-shield-check"></i>On</span>`
                    : h`<span class="sx-pill off">Off</span>`}</td>
                  <td class="sx-sub">${fmtDay(m.last_login_at) || '—'}</td>
                  <td style=${{ textAlign: 'right' }}>
                    ${m.mfa_enabled && canEdit && m.id !== user.id
                    ? h`<button class="sx-btn sm" onClick=${() => resetMfa(m)}>Reset</button>` : null}
                  </td>
                </tr>`)}
                ${!members.length && h`<tr><td colSpan=${5} class="sx-sub">No staff accounts yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        <//>
      <//>`;
    }

    function SecuritySection({ user, showToast }) {
      const isAdminish = user && (user.role_level === 'admin' || user.role_level === 'manager');
      return h`<div class="sx-root">
        <${Head} icon="ti-shield-lock" title="Security"
          sub="Two-step verification for your own account, plus the sign-in rules for the whole workspace."/>
        <${MfaCard} showToast=${showToast}/>
        ${isAdminish && h`<${PolicyCard} user=${user} showToast=${showToast}/>`}
      </div>`;
    }

    // =========================================================================
    // Section 2 — Roles & permissions
    // =========================================================================
    function RoleEditor({ role, onClose, onSaved, showToast }) {
      const [name, setName] = useState((role && role.name) || '');
      const [base, setBase] = useState((role && role.base_role) || 'editor');
      const [perms, setPerms] = useState(() => Object.assign(presetPermissions((role && role.base_role) || 'editor'), (role && role.permissions) || {}));
      const [busy, setBusy] = useState(false);
      const isNew = !(role && role.id);
      const hasMembers = !!(role && role.member_count);

      const changeBase = (b) => {
        setBase(b);
        setPerms(p => Object.assign(presetPermissions(b), isNew ? {} : {}));
      };
      const save = async () => {
        if (!name.trim()) { showToast && showToast('Give the role a name'); return; }
        setBusy(true);
        try {
          const r = await rpcCall('role_upsert', { p_data: { id: role && role.id, name: name.trim(), base_role: base, permissions: perms } });
          showToast && showToast(isNew ? 'Role created ✓' : 'Role saved ✓');
          onSaved && onSaved(r);
        } catch (e) { showToast && showToast(errText(e)); }
        setBusy(false);
      };

      return h`<${Modal} title=${isNew ? 'New role' : 'Edit role'} icon="ti-user-shield" onClose=${onClose}
        footer=${h`<${Fragment}>
          <button class="sx-btn" onClick=${onClose} disabled=${busy}>Cancel</button>
          <button class="sx-btn pri" onClick=${save} disabled=${busy}>${busy ? h`<i class="ti ti-loader-2 spinner"></i>` : null}${isNew ? 'Create role' : 'Save role'}</button>
        <//>`}>
        <div class="sx-f">
          <label class="sx-lbl" for="sx-role-name">Role name</label>
          <input id="sx-role-name" class="sx-in" value=${name} placeholder="e.g. Senior Designer" maxLength=${60}
            onInput=${e => setName(e.target.value)}/>
        </div>
        <div class="sx-f">
          <label class="sx-lbl" for="sx-role-base">Based on</label>
          <select id="sx-role-base" class="sx-in" value=${base} disabled=${hasMembers} onChange=${e => changeBase(e.target.value)}>
            ${STAFF_ROLES.filter(r => r !== 'admin').map(r => h`<option key=${r} value=${r}>${ROLE_LABEL[r]}</option>`)}
          </select>
          <div class="sx-hint" style=${{ marginTop: 6 }}>
            The base role decides what the app lets them reach (menus, clients, money). The switches below fine-tune the
            extras on top. ${hasMembers ? 'People already use this role, so the base can’t change — move them first.' : ''}
          </div>
        </div>
        <div class="sx-tblwrap" style=${{ marginTop: 4 }}>
          <table class="sx-tbl" style=${{ minWidth: 0 }}>
            <tbody>
              ${PERM_GROUPS.map(([g, label]) => h`<${Fragment} key=${g}>
                <tr class="sx-grp"><td colSpan=${2}>${label}</td></tr>
                ${PERM_KEYS.filter(k => PERM_META[k][1] === g).map(k => h`<tr key=${k}>
                  <td>${PERM_META[k][0]}</td>
                  <td class="c" style=${{ width: 60 }}>
                    <input type="checkbox" class="sx-chk" checked=${!!perms[k]}
                      onChange=${e => setPerms(p => ({ ...p, [k]: e.target.checked }))}
                      aria-label=${PERM_META[k][0]}/>
                  </td>
                </tr>`)}
              <//>`)}
            </tbody>
          </table>
        </div>
      <//>`;
    }

    function RolesSection({ user, showToast }) {
      const load = useAsync(() => rpcCall('roles_list'), []);
      const [editing, setEditing] = useState(null);
      const [busyId, setBusyId] = useState(null);
      const d = load.data || {};
      const canEdit = !!d.can_edit;
      const roles = d.roles || [];
      const members = d.members || [];

      const remove = async (r) => {
        if (!window.confirm('Delete the role “' + r.name + '”? Anyone using it keeps their base role (' + (ROLE_LABEL[r.base_role] || r.base_role) + ').')) return;
        setBusyId(r.id);
        try { await rpcCall('role_delete', { p_id: r.id }); showToast && showToast('Role deleted'); load.reload(); }
        catch (e) { showToast && showToast(errText(e)); }
        setBusyId(null);
      };
      const assign = async (m, value) => {
        setBusyId(m.id);
        try {
          const custom = value.indexOf('role:') === 0 ? value.slice(5) : null;
          await rpcCall('role_assign', { p_member_id: m.id, p_role_id: custom, p_base_role: custom ? null : value });
          showToast && showToast(m.name + ' updated ✓');
          load.reload();
          if (m.id === user.id) PERMS.reload();
        } catch (e) { showToast && showToast(errText(e)); load.reload(); }
        setBusyId(null);
      };

      if (load.missing) return h`<div class="sx-root">
        <${Head} icon="ti-user-shield" title="Roles & permissions" sub="Custom roles on top of the built-in ones."/>
        <${NeedsMigration} what="Custom roles and the permission matrix"/>
      </div>`;
      if (load.loading && !load.data) return h`<div class="sx-root"><${Skel} h=${220}/></div>`;
      if (load.error) return h`<div class="sx-root">
        <${Head} icon="ti-user-shield" title="Roles & permissions"/>
        <div class="sx-card"><div class="sx-card-b sx-hint">${errText(load.error)}</div></div>
      </div>`;

      const presets = d.presets || STAFF_ROLES.map(r => ({ key: r, name: ROLE_LABEL[r], base_role: r, permissions: presetPermissions(r) }));
      const columns = presets.map(p => ({ key: 'preset:' + p.key, name: p.name, sub: 'Built-in', permissions: p.permissions }))
        .concat(roles.map(r => ({ key: 'role:' + r.id, name: r.name, sub: 'Based on ' + (ROLE_LABEL[r.base_role] || r.base_role), permissions: r.permissions, role: r })));

      return h`<div class="sx-root">
        <${Head} icon="ti-user-shield" title="Roles & permissions"
          sub="Built-in roles decide what the app shows. Custom roles reuse one of them and switch the extras on or off — handy for “designer who can also manage tags”."/>

        <${Card} title="Permission matrix" sub="Built-in roles can’t be edited; custom roles can."
          right=${canEdit && h`<button class="sx-btn pri" onClick=${() => setEditing({})}><i class="ti ti-plus"></i>New role</button>`}>
          <div class="sx-tblwrap">
            <table class="sx-tbl">
              <thead>
                <tr>
                  <th style=${{ minWidth: 190 }}>Permission</th>
                  ${columns.map(c => h`<th key=${c.key} class="c">
                    <div>${c.name}</div><div class="sx-sub" style=${{ fontWeight: 400 }}>${c.sub}</div>
                  </th>`)}
                </tr>
              </thead>
              <tbody>
                ${PERM_GROUPS.map(([g, label]) => h`<${Fragment} key=${g}>
                  <tr class="sx-grp"><td colSpan=${columns.length + 1}>${label}</td></tr>
                  ${PERM_KEYS.filter(k => PERM_META[k][1] === g).map(k => h`<tr key=${k}>
                    <td>${PERM_META[k][0]}</td>
                    ${columns.map(c => h`<td key=${c.key} class="c">
                      ${c.permissions && c.permissions[k]
                      ? h`<i class="ti ti-check sx-dot" style=${{ color: '#16a34a' }} title="Allowed"></i>`
                      : h`<span class="sx-dot" style=${{ color: 'var(--cu-t3)' }}>·</span>`}
                    </td>`)}
                  </tr>`)}
                <//>`)}
                ${canEdit && roles.length ? h`<tr>
                  <td></td>
                  ${columns.map(c => h`<td key=${c.key} class="c">
                    ${c.role ? h`<div class="sx-row" style=${{ justifyContent: 'center', gap: 6 }}>
                      <button class="sx-btn sm" onClick=${() => setEditing(c.role)}>Edit</button>
                      <button class="sx-btn sm danger" disabled=${busyId === c.role.id} onClick=${() => remove(c.role)}>Delete</button>
                    </div>` : null}
                  </td>`)}
                </tr>` : null}
              </tbody>
            </table>
          </div>
          ${!roles.length && h`<div class="sx-hint" style=${{ marginTop: 10 }}>
            No custom roles yet — everyone uses a built-in role.
          </div>`}
        <//>

        <${Card} title="Who has which role" sub=${canEdit ? 'Changing a role takes effect the next time that person loads the app.' : 'Only an admin can change roles.'}>
          <div class="sx-tblwrap">
            <table class="sx-tbl">
              <thead><tr><th>Person</th><th>Role</th><th>Two-step</th></tr></thead>
              <tbody>
                ${members.map(m => {
        const value = m.custom_role_id ? 'role:' + m.custom_role_id : m.role_level;
        return h`<tr key=${m.id}>
                    <td><div class="sx-role-nm">${m.name}</div><div class="sx-sub">${m.email || ''}</div></td>
                    <td>
                      ${canEdit
            ? h`<select class="sx-in" style=${{ maxWidth: 240, height: 28 }} value=${value} disabled=${busyId === m.id}
                            onChange=${e => assign(m, e.target.value)}>
                            <optgroup label="Built-in">
                              ${STAFF_ROLES.map(r => h`<option key=${r} value=${r}>${ROLE_LABEL[r]}</option>`)}
                            </optgroup>
                            ${roles.length ? h`<optgroup label="Custom">
                              ${roles.map(r => h`<option key=${r.id} value=${'role:' + r.id}>${r.name}</option>`)}
                            </optgroup>` : null}
                          </select>`
            : h`<span>${m.custom_role_id
              ? (roles.find(r => r.id === m.custom_role_id) || {}).name || ROLE_LABEL[m.role_level]
              : (ROLE_LABEL[m.role_level] || m.role_level)}</span>`}
                    </td>
                    <td>${m.mfa_enabled ? h`<span class="sx-pill on"><i class="ti ti-shield-check"></i>On</span>` : h`<span class="sx-pill off">Off</span>`}</td>
                  </tr>`;
      })}
              </tbody>
            </table>
          </div>
        <//>

        ${editing && h`<${RoleEditor} role=${editing.id ? editing : null} showToast=${showToast}
          onClose=${() => setEditing(null)} onSaved=${() => { setEditing(null); load.reload(); PERMS.reload(); }}/>`}
      </div>`;
    }

    // =========================================================================
    // Section 3 — API keys + docs
    // =========================================================================
    const SCOPE_META = {
      'tasks:read': ['Read tasks', 'List and open tasks, lists and comments'],
      'tasks:write': ['Create & update tasks', 'Create tasks, change them, add comments'],
      'clients:read': ['Read clients', 'List the brands in this workspace'],
      'members:read': ['Read people', 'List team members (names and roles)'],
    };
    const API_BASE = (SB_URL || '') + '/functions/v1/public-api';

    function ApiKeyCreate({ onClose, onCreated, showToast, scopesAvailable }) {
      const [name, setName] = useState('');
      const [scopes, setScopes] = useState(['tasks:read']);
      const [expiry, setExpiry] = useState('');
      const [busy, setBusy] = useState(false);
      const toggle = (s) => setScopes(v => v.indexOf(s) >= 0 ? v.filter(x => x !== s) : v.concat([s]));
      const create = async () => {
        if (!name.trim()) { showToast && showToast('Name the key so you know what it’s for'); return; }
        setBusy(true);
        try {
          const r = await rpcCall('api_key_create', {
            p_name: name.trim(), p_scopes: scopes,
            p_expires_days: expiry ? parseInt(expiry, 10) : null,
          });
          onCreated && onCreated(r);
        } catch (e) { showToast && showToast(errText(e)); }
        setBusy(false);
      };
      return h`<${Modal} title="New API key" icon="ti-key" onClose=${onClose}
        footer=${h`<${Fragment}>
          <button class="sx-btn" onClick=${onClose} disabled=${busy}>Cancel</button>
          <button class="sx-btn pri" onClick=${create} disabled=${busy || !scopes.length}>${busy ? h`<i class="ti ti-loader-2 spinner"></i>` : null}Create key</button>
        <//>`}>
        <div class="sx-f">
          <label class="sx-lbl" for="sx-key-name">What is it for?</label>
          <input id="sx-key-name" class="sx-in" value=${name} maxLength=${60} placeholder="e.g. Zapier, Claude, reporting script"
            onInput=${e => setName(e.target.value)}/>
        </div>
        <div class="sx-f">
          <span class="sx-lbl">What may it do?</span>
          <div class="sx-scopes">
            ${(scopesAvailable || Object.keys(SCOPE_META)).map(s => h`<label key=${s} class="sx-scope">
              <input type="checkbox" class="sx-chk" checked=${scopes.indexOf(s) >= 0} onChange=${() => toggle(s)}/>
              <span><strong>${(SCOPE_META[s] || [s])[0]}</strong><br/><span class="sx-sub">${(SCOPE_META[s] || ['', ''])[1]}</span></span>
            </label>`)}
          </div>
        </div>
        <div class="sx-f" style=${{ marginBottom: 0 }}>
          <label class="sx-lbl" for="sx-key-exp">Expires</label>
          <select id="sx-key-exp" class="sx-in" style=${{ maxWidth: 220 }} value=${expiry} onChange=${e => setExpiry(e.target.value)}>
            <option value="">Never</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In a year</option>
          </select>
          <div class="sx-hint" style=${{ marginTop: 6 }}>
            The key works as you — it can only reach what your role can reach, and stops working if your access changes.
          </div>
        </div>
      <//>`;
    }

    function ApiDocs({ sample }) {
      const key = sample || 'ams_your_key_here';
      const curl = 'curl -s "' + API_BASE + '/tasks?limit=5" \\\n  -H "Authorization: Bearer ' + key + '"';
      const post = 'curl -s -X POST "' + API_BASE + '/tasks" \\\n  -H "Authorization: Bearer ' + key + '" \\\n'
        + '  -H "Content-Type: application/json" \\\n  -d \'{"title":"Shoot the Diwali reel","client_id":"<client uuid>","priority":2}\'';
      const mcp = JSON.stringify({
        mcpServers: { 'my-digital-sevak': { url: API_BASE + '/mcp', headers: { Authorization: 'Bearer ' + key } } },
      }, null, 2);
      return h`<${Card} title="Using the API" sub="Same permissions as the person who owns the key.">
        <div class="sx-lbl">Base URL</div>
        <div class="sx-key" style=${{ marginBottom: 14 }}>${API_BASE}</div>
        <div class="sx-lbl">List tasks</div>
        <div class="sx-pre" style=${{ marginBottom: 14 }}>${curl}</div>
        <div class="sx-lbl">Create a task</div>
        <div class="sx-pre" style=${{ marginBottom: 14 }}>${post}</div>
        <div class="sx-lbl">Endpoints</div>
        <div class="sx-hint" style=${{ marginBottom: 14 }}>
          ${'GET /me'} · ${'GET /tasks'} · ${'GET /tasks/{id}'} · ${'POST /tasks'} · ${'PATCH /tasks/{id}'} ·
          ${' POST /tasks/{id}/comments'} · ${'GET /lists'} · ${'GET /clients'} · ${'GET /members'}. 120 requests a minute per key.
        </div>
        <div class="sx-lbl">Connect an AI assistant (MCP)</div>
        <div class="sx-hint" style=${{ marginBottom: 8 }}>
          Claude and other MCP clients can read and update tasks directly. Add this to the client’s config:
        </div>
        <div class="sx-pre">${mcp}</div>
      <//>`;
    }

    function ApiKeysSection({ user, showToast }) {
      const perms = usePerms();
      const load = useAsync(() => rpcCall('api_keys_list'), []);
      const [creating, setCreating] = useState(false);
      const [fresh, setFresh] = useState(null);
      const d = load.data || {};
      const keys = d.keys || [];

      const revoke = async (k) => {
        if (!window.confirm('Revoke “' + k.name + '”? Anything using this key stops working immediately.')) return;
        try { await rpcCall('api_key_revoke', { p_id: k.id }); showToast && showToast('Key revoked'); load.reload(); }
        catch (e) { showToast && showToast(errText(e)); }
      };

      if (load.missing) return h`<div class="sx-root">
        <${Head} icon="ti-key" title="API keys" sub="Let other tools read and update your tasks."/>
        <${NeedsMigration} what="API keys and the public API"/>
      </div>`;
      if (load.error && !load.data) return h`<div class="sx-root">
        <${Head} icon="ti-key" title="API keys"/>
        <div class="sx-card"><div class="sx-card-b sx-hint">
          ${perms.ready && !perms.can('use_api')
          ? 'Your role can’t create API keys. Ask an admin if you need one.'
          : errText(load.error)}
        </div></div>
      </div>`;
      if (load.loading && !load.data) return h`<div class="sx-root"><${Skel} h=${180}/></div>`;

      return h`<div class="sx-root">
        <${Head} icon="ti-key" title="API keys"
          sub="Give another tool — a script, Zapier, or an AI assistant — permission to work with your tasks. A key acts as you and can be revoked any time."/>

        ${fresh && h`<${Card} title="Copy your new key now" sub="This is the only time it is shown.">
          <div class="sx-key" style=${{ marginBottom: 10 }}>${fresh.key}</div>
          <div class="sx-row">
            <button class="sx-btn pri" onClick=${() => copy(fresh.key, showToast, 'API key copied')}><i class="ti ti-copy"></i>Copy key</button>
            <button class="sx-btn" onClick=${() => setFresh(null)}>Done</button>
          </div>
        <//>`}

        <${Card} title="Your keys" right=${h`<button class="sx-btn pri" onClick=${() => setCreating(true)}><i class="ti ti-plus"></i>New key</button>`}>
          ${keys.length
          ? h`<div class="sx-tblwrap">
              <table class="sx-tbl">
                <thead><tr><th>Name</th><th>Key</th><th>Can do</th><th>Last used</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  ${keys.map(k => h`<tr key=${k.id}>
                    <td><div class="sx-role-nm">${k.name}</div>
                      ${d.can_manage_all && k.member_name ? h`<div class="sx-sub">${k.member_name}</div>` : null}</td>
                    <td class="sx-sub" style=${{ fontFamily: 'ui-monospace,Menlo,monospace' }}>${k.prefix}…</td>
                    <td class="sx-sub">${(k.scopes || []).map(s => (SCOPE_META[s] || [s])[0]).join(', ')}</td>
                    <td class="sx-sub">${k.last_used_at ? fmtStamp(k.last_used_at) : 'Never'}</td>
                    <td>${k.state === 'active'
              ? h`<span class="sx-pill on">Active</span>`
              : h`<span class="sx-pill off">${k.state === 'expired' ? 'Expired' : 'Revoked'}</span>`}</td>
                    <td style=${{ textAlign: 'right' }}>
                      ${k.state === 'active' ? h`<button class="sx-btn sm danger" onClick=${() => revoke(k)}>Revoke</button>` : null}
                    </td>
                  </tr>`)}
                </tbody>
              </table>
            </div>`
          : h`<div class="sx-hint">No keys yet. Create one to connect a script, Zapier or an AI assistant.</div>`}
        <//>

        <${ApiDocs} sample=${fresh && fresh.key}/>

        ${creating && h`<${ApiKeyCreate} showToast=${showToast} scopesAvailable=${d.scopes}
          onClose=${() => setCreating(false)}
          onCreated=${(r) => { setCreating(false); setFresh(r); load.reload(); showToast && showToast('API key created ✓'); }}/>`}
      </div>`;
    }

    // =========================================================================
    // Registration
    // =========================================================================
    const isStaff = (r) => !!r && r !== 'client';
    const isAdminOrManager = (r) => r === 'admin' || r === 'manager';
    const SECTIONS = [
      { id: 'security', label: 'Security', icon: 'ti-shield-lock', order: 14, group: 'personal', roles: isStaff, Component: SecuritySection },
      { id: 'roles', label: 'Roles & permissions', icon: 'ti-user-shield', order: 34, group: 'workspace', roles: isAdminOrManager, Component: RolesSection },
      { id: 'api-keys', label: 'API keys', icon: 'ti-key', order: 36, group: 'workspace', roles: isStaff, Component: ApiKeysSection },
    ];
    SECTIONS.forEach(s => reg('settingsSections', s));

    return {
      SecuritySection, RolesSection, ApiKeysSection, SECTIONS,
      usePerms, can: (p) => PERMS.can(p), PERM_KEYS, presetPermissions, QR,
    };
  }

  window.AMS_SECURITY = { buildSecurity };
})();

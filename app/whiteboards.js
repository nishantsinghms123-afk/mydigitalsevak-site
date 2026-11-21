/* ============================================================================
 * whiteboards.js — infinite-canvas whiteboards (ClickUp parity v2, §4 O)
 *
 *   window.AMS_WHITEBOARDS.buildWhiteboards(deps) →
 *     { WhiteboardsPage, WhiteboardEditor, WhiteboardViewRenderer, WhiteboardAPI }
 *
 * Registers into window.AMS_EXT (contract v2 §2):
 *   pages          'whiteboards'  (hub + editor, route #/whiteboards/<id>)
 *   views          'whiteboard'   (a board pinned to any list/client view)
 *   createItems    'whiteboard'
 *   paletteProviders 'whiteboards'
 * Favorites ride on user_favorites kind 'whiteboard' (migration 093/104).
 *
 * Server: migration 104 (whiteboards · whiteboard_versions · whiteboard_task_links,
 * storage bucket `whiteboard-files`). Optimistic concurrency: every save carries the
 * base version; a conflict returns the newer scene and we 3-way merge per element
 * instead of clobbering. Fails open everywhere — no migration ⇒ friendly empty state.
 *
 * Scene JSON (stored in whiteboards.scene):
 *   { v:1, bg:'dots'|'grid'|'plain', elements:[ Element ] }
 *   Element = { id, type, x, y, w, h, locked?, … }
 *     sticky { text, color }          text  { text, size, color, bold }
 *     shape  { shape, fill, stroke, sw, text }
 *     pen    { pts:[[x,y]…], stroke, sw }   image { src, natW, natH }
 *     frame  { title, fill }          task  { taskId, snap:{…} }
 *     conn   { from:{id?,x,y}, to:{id?,x,y}, stroke, sw, dash, arrowEnd }
 * ==========================================================================*/
(function () {
  function buildWhiteboards(deps) {
    const {
      React, h, useState, useEffect, useRef, useCallback, useMemo,
      rpcCall, supabase, Av, Skel, fmtRelative,
      useTaskStore, TaskAPI, taskBus, openTask, Popover, Menu, PickerList,
      EmptyState, ListPicker, AssigneePicker, DatePicker, MemberAvatar, ClientBadge, InlineTitle,
    } = deps;
    const Fragment = React.Fragment;
    const useLayoutEffect = React.useLayoutEffect || useEffect;

    // ---- one-time styles ---------------------------------------------------
    if (!document.getElementById('ams-wb-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-wb-styles';
      st.textContent = `
      .wb,.wb *{box-sizing:border-box}
      .wb{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--cu-t1,#1f1f23);display:flex;flex-direction:column;flex:1;min-height:0;background:var(--cu-bg,#fff)}
      .wb-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 11px;border-radius:6px;border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:600 13px/1 inherit;font-family:inherit;cursor:pointer;white-space:nowrap}
      .wb-btn:hover{background:var(--cu-bg3,#efeff1)}
      .wb-btn:disabled{opacity:.5;cursor:not-allowed}
      .wb-btn.pri{background:var(--cu-accent,#ff00ee);border-color:var(--cu-accent,#ff00ee);color:#fff}
      .wb-btn.ghost{border-color:transparent;background:transparent;color:var(--cu-t2,#5c5c66)}
      .wb-ibtn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;border:none;background:transparent;color:var(--cu-t2,#5c5c66);cursor:pointer;font-size:16px;padding:0;flex-shrink:0}
      .wb-ibtn:hover{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23)}
      .wb-ibtn.on{background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-accent-ink,#a8009c)}
      .wb button:focus-visible,.wb input:focus-visible,.wb textarea:focus-visible,.wb a:focus-visible{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:1px}
      .wb-in{height:30px;padding:0 10px;border:1px solid var(--cu-bd2,#d6d6db);border-radius:6px;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);font:13px inherit;font-family:inherit;width:100%}
      .wb-in:focus{outline:none;border-color:var(--cu-accent,#ff00ee)}
      /* hub */
      .wb-hub{padding:18px 22px 40px;max-width:1280px;width:100%;margin:0 auto}
      .wb-h1{font-size:22px;font-weight:600;margin:0}
      .wb-sub{font-size:12.5px;color:var(--cu-t3,#8e8e99);margin-top:2px}
      .wb-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0}
      .wb-tabs{display:inline-flex;gap:2px;background:var(--cu-bg2,#f7f7f8);border-radius:8px;padding:3px}
      .wb-tab{border:none;background:transparent;color:var(--cu-t2,#5c5c66);font:600 12.5px inherit;font-family:inherit;padding:0 12px;height:28px;border-radius:6px;cursor:pointer}
      .wb-tab.on{background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);box-shadow:0 1px 2px rgba(0,0,0,.08)}
      .wb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:14px}
      .wb-card{border:1px solid var(--cu-bd,#e8e8eb);border-radius:10px;overflow:hidden;background:var(--cu-bg,#fff);display:flex;flex-direction:column;cursor:pointer;position:relative;text-align:left;padding:0;font-family:inherit;color:inherit}
      .wb-card:hover{border-color:var(--cu-bd2,#d6d6db);box-shadow:0 4px 14px rgba(15,15,20,.07)}
      .wb-thumb{height:124px;background:var(--cu-bg2,#f7f7f8);display:flex;align-items:center;justify-content:center;color:var(--cu-t3,#8e8e99);font-size:26px;overflow:hidden}
      .wb-thumb img{width:100%;height:100%;object-fit:cover;display:block}
      .wb-card-b{padding:9px 11px;display:flex;flex-direction:column;gap:3px;min-width:0}
      .wb-card-t{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .wb-meta{font-size:11.5px;color:var(--cu-t3,#8e8e99);display:flex;align-items:center;gap:6px;min-width:0}
      .wb-star{position:absolute;top:7px;right:7px;background:rgba(255,255,255,.92);border-radius:6px}
      html.dark .wb-star{background:rgba(30,29,34,.92)}
      /* editor */
      .wb-ed{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;background:var(--cu-bg2,#f7f7f8)}
      .wb-top{display:flex;align-items:center;gap:6px;padding:7px 10px;border-bottom:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg,#fff);flex-wrap:wrap;min-height:46px}
      .wb-title{font-size:15px;font-weight:600;min-width:90px;max-width:min(38vw,380px)}
      .wb-status{font-size:11.5px;color:var(--cu-t3,#8e8e99);display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
      .wb-canvas-wrap{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none}
      .wb-svg{position:absolute;inset:0;width:100%;height:100%;display:block;background:var(--cu-bg,#fff);cursor:default}
      .wb-svg.pan{cursor:grab}.wb-svg.panning{cursor:grabbing}.wb-svg.draw{cursor:crosshair}
      .wb-tools{position:absolute;left:10px;top:50%;transform:translateY(-50%);z-index:5;display:flex;flex-direction:column;gap:2px;padding:4px;border-radius:12px;background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14))}
      .wb-tool{width:34px;height:34px;border-radius:8px;border:none;background:transparent;color:var(--cu-t2,#5c5c66);cursor:pointer;font-size:17px;display:flex;align-items:center;justify-content:center;padding:0}
      .wb-tool:hover{background:var(--cu-bg3,#efeff1);color:var(--cu-t1,#1f1f23)}
      .wb-tool.on{background:var(--cu-accent,#ff00ee);color:#fff}
      .wb-zoom{position:absolute;left:10px;bottom:10px;z-index:5;display:flex;align-items:center;gap:1px;padding:3px;border-radius:10px;background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14))}
      .wb-zoom span{font:600 12px inherit;font-family:inherit;color:var(--cu-t2,#5c5c66);min-width:44px;text-align:center}
      .wb-ctx{position:absolute;z-index:6;display:flex;align-items:center;gap:2px;padding:4px;border-radius:10px;background:var(--cu-bg,#fff);border:1px solid var(--cu-bd,#e8e8eb);box-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14));flex-wrap:wrap;max-width:min(92vw,520px)}
      .wb-sw{width:22px;height:22px;border-radius:50%;border:1.5px solid rgba(0,0,0,.14);cursor:pointer;padding:0;flex-shrink:0}
      .wb-sw.on{box-shadow:0 0 0 2px var(--cu-accent,#ff00ee)}
      .wb-edit-ta{position:absolute;z-index:7;border:none;outline:2px solid var(--cu-accent,#ff00ee);border-radius:4px;resize:none;overflow:hidden;background:transparent;font-family:Inter,system-ui,sans-serif;padding:8px;margin:0}
      .wb-empty-hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;color:var(--cu-t3,#8e8e99);font-size:13px;pointer-events:none;line-height:1.7}
      .wb-empty-hint kbd{font:600 11px ui-monospace,Menlo,monospace;background:var(--cu-bg3,#efeff1);border-radius:4px;padding:2px 5px}
      .wb-modal-bg{position:fixed;inset:0;z-index:1200;background:rgba(10,10,14,.45);display:flex;align-items:center;justify-content:center;padding:16px}
      .wb-modal{background:var(--cu-bg,#fff);border-radius:12px;box-shadow:var(--cu-shadow,0 10px 30px rgba(0,0,0,.3));width:min(560px,100%);max-height:calc(100dvh - 32px);display:flex;flex-direction:column;overflow:hidden}
      .wb-modal-hd{display:flex;align-items:center;gap:8px;padding:13px 16px;border-bottom:1px solid var(--cu-bd,#e8e8eb);font-size:15px;font-weight:600}
      .wb-modal-b{padding:16px;overflow:auto}
      .wb-modal-f{display:flex;gap:8px;align-items:center;padding:12px 16px;border-top:1px solid var(--cu-bd,#e8e8eb)}
      .wb-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cu-t3,#8e8e99);margin-bottom:4px;display:block}
      .wb-tpl{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
      .wb-tpl button{border:1px solid var(--cu-bd,#e8e8eb);border-radius:10px;background:var(--cu-bg,#fff);padding:12px 10px;cursor:pointer;font:500 13px inherit;font-family:inherit;color:var(--cu-t1,#1f1f23);display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
      .wb-tpl button:hover{border-color:var(--cu-accent,#ff00ee);background:var(--cu-accent-fog,rgba(255,0,238,.06))}
      .wb-tpl i{font-size:22px;color:var(--cu-t2,#5c5c66)}
      .wb-tpl small{font-size:11px;color:var(--cu-t3,#8e8e99);font-weight:400}
      .wb-vrow{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;font-size:13px}
      .wb-vrow:hover{background:var(--cu-bg2,#f7f7f8)}
      @media(max-width:760px){.wb-hub{padding:14px}.wb-tools{left:6px;padding:3px}.wb-tool{width:30px;height:30px;font-size:15px}.wb-title{max-width:44vw}}
      @media(prefers-reduced-motion:reduce){.wb-card{transition:none}}
      `;
      document.head.appendChild(st);
    }

    // ---- registry + small helpers -------------------------------------------
    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => { const k = item.id || item.key || item.type; EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item); };
    const arr = (v) => (Array.isArray(v) ? v : []);
    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i.test(String((e && (e.code || '')) + ' ' + ((e && (e.message || e.details)) || '')));
    const errText = (e) => (!e ? 'Something went wrong'
      : e.code === 'forbidden' ? "You don't have permission to do that"
      : e.code === 'auth.expired' || e.message === 'auth.no_session' ? 'Session expired — sign in again'
      : (e.message || String(e)));
    const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : 'e' + Math.random().toString(36).slice(2, 10));
    const clamp = (v, a, b) => Math.max(a, Math.min(v, b));
    const BUCKET = 'whiteboard-files';
    const STICKY_COLORS = ['#fde68a', '#fca5a5', '#a7f3d0', '#bfdbfe', '#ddd6fe', '#fbcfe8', '#fed7aa', '#e5e7eb'];
    const STROKE_COLORS = ['#1f1f23', '#e5484d', '#f5a623', '#30a46c', '#4c8df6', '#8b5cf6', '#ff00ee'];
    const SHAPE_FILLS = ['#ffffff', '#fde68a', '#bfdbfe', '#a7f3d0', '#fca5a5', '#ddd6fe', 'none'];
    const DEF = { sticky: { w: 180, h: 180 }, text: { w: 260, h: 44 }, shape: { w: 190, h: 120 }, frame: { w: 680, h: 440 }, task: { w: 252, h: 106 } };
    const emptyScene = () => ({ v: 1, bg: 'dots', elements: [] });

    // ---- geometry ------------------------------------------------------------
    const elBox = (el, byId) => {
      if (el.type === 'conn') {
        const [a, b] = connPts(el, byId || {});
        return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x) || 1, h: Math.abs(b.y - a.y) || 1 };
      }
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    };
    const centerOf = (el) => ({ x: el.x + el.w / 2, y: el.y + el.h / 2 });
    function anchorPoint(el, toward) {
      const c = centerOf(el);
      const dx = toward.x - c.x, dy = toward.y - c.y;
      if (!dx && !dy) return c;
      const hw = Math.max(el.w / 2, 1), hh = Math.max(el.h / 2, 1);
      const shape = el.type === 'shape' ? el.shape : 'rect';
      if (shape === 'ellipse') {
        const k = 1 / Math.sqrt((dx * dx) / (hw * hw) + (dy * dy) / (hh * hh));
        return { x: c.x + dx * k, y: c.y + dy * k };
      }
      if (shape === 'diamond') {
        const k = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
        return { x: c.x + dx * k, y: c.y + dy * k };
      }
      const k = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
      return { x: c.x + dx * k, y: c.y + dy * k };
    }
    function connPts(el, byId) {
      const fromEl = el.from && el.from.id ? byId[el.from.id] : null;
      const toEl = el.to && el.to.id ? byId[el.to.id] : null;
      const fallbackA = { x: (el.from && el.from.x) || 0, y: (el.from && el.from.y) || 0 };
      const fallbackB = { x: (el.to && el.to.x) || 0, y: (el.to && el.to.y) || 0 };
      const ca = fromEl ? centerOf(fromEl) : fallbackA;
      const cb = toEl ? centerOf(toEl) : fallbackB;
      return [fromEl ? anchorPoint(fromEl, cb) : fallbackA, toEl ? anchorPoint(toEl, ca) : fallbackB];
    }
    const hitEl = (el, p, byId) => {
      if (el.type === 'conn') {
        const [a, b] = connPts(el, byId);
        const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
        if (!L2) return false;
        const t = clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2, 0, 1);
        const d = Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
        return d <= 8;
      }
      return p.x >= el.x && p.x <= el.x + el.w && p.y >= el.y && p.y <= el.y + el.h;
    };
    const boxOfAll = (els, byId) => {
      if (!els.length) return null;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      els.forEach(el => { const b = elBox(el, byId); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); });
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    };

    // ---- text wrapping (shared by the SVG view and the PNG exporter) ---------
    let measCtx = null;
    const fontStr = (size, bold) => (bold ? '600 ' : '400 ') + size + 'px Inter, system-ui, -apple-system, sans-serif';
    function wrapText(text, size, bold, maxW) {
      const raw = String(text == null ? '' : text);
      if (!raw) return [];
      if (!measCtx) { try { measCtx = document.createElement('canvas').getContext('2d'); } catch (_) { measCtx = null; } }
      if (!measCtx) return raw.split('\n');
      measCtx.font = fontStr(size, bold);
      const out = [];
      raw.split('\n').forEach(para => {
        if (!para) { out.push(''); return; }
        let line = '';
        para.split(/(\s+)/).forEach(chunk => {
          if (!chunk) return;
          const next = line + chunk;
          if (measCtx.measureText(next).width <= maxW || !line.trim()) {
            if (measCtx.measureText(next).width > maxW && !line.trim()) {
              // single very long word — hard break
              let buf = '';
              for (const ch of next) {
                if (measCtx.measureText(buf + ch).width > maxW && buf) { out.push(buf); buf = ch; } else buf += ch;
              }
              line = buf;
            } else line = next;
          } else { out.push(line.replace(/\s+$/, '')); line = chunk.replace(/^\s+/, ''); }
        });
        out.push(line.replace(/\s+$/, ''));
      });
      return out.slice(0, 80);
    }

    // =========================================================================
    // API
    // =========================================================================
    const WhiteboardAPI = {
      list: (filter) => rpcCall('whiteboard_list', { p_filter: filter || {} }),
      get: (id) => rpcCall('whiteboard_get', { p_id: id }),
      head: (id) => rpcCall('whiteboard_head', { p_id: id }),
      create: (data) => rpcCall('whiteboard_create', { p_data: data || {} }),
      save: (id, scene, baseVersion, thumb, checkpoint) => rpcCall('whiteboard_save', { p_id: id, p_scene: scene, p_base_version: baseVersion, p_thumb: thumb || null, p_checkpoint: !!checkpoint }),
      update: (id, patch) => rpcCall('whiteboard_update', { p_id: id, p_patch: patch || {} }),
      remove: (id) => rpcCall('whiteboard_delete', { p_id: id }),
      duplicate: (id) => rpcCall('whiteboard_duplicate', { p_id: id }),
      versions: (id) => rpcCall('whiteboard_versions', { p_id: id }),
      versionGet: (vid) => rpcCall('whiteboard_version_get', { p_version_id: vid }),
      versionRestore: (vid) => rpcCall('whiteboard_version_restore', { p_version_id: vid }),
      stickyToTask: (id, elementId, data) => rpcCall('whiteboard_sticky_to_task', { p_id: id, p_element_id: elementId, p_data: data || {} }),
      taskCards: (ids) => rpcCall('whiteboard_task_cards', { p_task_ids: arr(ids) }),
      forTask: (taskId) => rpcCall('whiteboards_for_task', { p_task_id: taskId }),
      async uploadImage(file) {
        const safe = String(file.name || 'image').replace(/[^\w.\-]+/g, '_').slice(-80) || 'image';
        const path = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + '/' + safe;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (error) throw new Error(error.message || 'Upload failed');
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return { url: data && data.publicUrl, path };
      },
    };

    // ---- 3-way merge (base → mine vs theirs), element-wise -------------------
    function mergeScenes(base, mine, theirs) {
      const bi = {}, mi = {}, ti = {};
      arr(base && base.elements).forEach(e => { bi[e.id] = e; });
      arr(mine && mine.elements).forEach(e => { mi[e.id] = e; });
      arr(theirs && theirs.elements).forEach(e => { ti[e.id] = e; });
      const same = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
      const ids = [];
      arr(theirs && theirs.elements).forEach(e => ids.push(e.id));
      arr(mine && mine.elements).forEach(e => { if (!ids.includes(e.id)) ids.push(e.id); });
      const out = [];
      ids.forEach(id => {
        const b = bi[id], m = mi[id], t = ti[id];
        const iChanged = !same(b, m);
        if (iChanged) { if (m) out.push(m); return; }     // my edit (or my delete) wins
        if (t) out.push(t);                                // untouched by me → take theirs
      });
      return { v: 1, bg: (mine && mine.bg) || (theirs && theirs.bg) || 'dots', elements: out };
    }

    // ---- templates ------------------------------------------------------------
    const TEMPLATES = [
      { key: 'blank', label: 'Blank board', icon: 'ti-square', sub: 'Start empty', build: () => [] },
      {
        key: 'brainstorm', label: 'Brainstorm', icon: 'ti-bulb', sub: '3 columns of stickies',
        build: () => {
          const els = [];
          ['Ideas', 'Keep', 'Park'].forEach((title, i) => {
            els.push({ id: uid(), type: 'frame', x: 40 + i * 420, y: 40, w: 380, h: 520, title, fill: 'none' });
            for (let j = 0; j < 2; j++) els.push({ id: uid(), type: 'sticky', x: 80 + i * 420, y: 110 + j * 200, w: 180, h: 180, text: '', color: STICKY_COLORS[i] });
          });
          return els;
        },
      },
      {
        key: 'content', label: 'Content wall', icon: 'ti-calendar', sub: 'A frame per week',
        build: () => ['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((t, i) => ({ id: uid(), type: 'frame', x: 40 + i * 340, y: 40, w: 300, h: 560, title: t, fill: 'none' })),
      },
      {
        key: 'flow', label: 'Campaign flow', icon: 'ti-sitemap', sub: 'Shapes + connectors',
        build: () => {
          const a = { id: uid(), type: 'shape', shape: 'ellipse', x: 60, y: 200, w: 180, h: 100, fill: '#bfdbfe', stroke: '#1f1f23', sw: 2, text: 'Audience' };
          const b = { id: uid(), type: 'shape', shape: 'rect', x: 330, y: 200, w: 190, h: 100, fill: '#ffffff', stroke: '#1f1f23', sw: 2, text: 'Creative' };
          const c = { id: uid(), type: 'shape', shape: 'diamond', x: 610, y: 190, w: 190, h: 120, fill: '#fde68a', stroke: '#1f1f23', sw: 2, text: 'Approved?' };
          return [a, b, c,
            { id: uid(), type: 'conn', x: 0, y: 0, w: 1, h: 1, from: { id: a.id }, to: { id: b.id }, stroke: '#1f1f23', sw: 2, arrowEnd: true },
            { id: uid(), type: 'conn', x: 0, y: 0, w: 1, h: 1, from: { id: b.id }, to: { id: c.id }, stroke: '#1f1f23', sw: 2, arrowEnd: true }];
        },
      },
      {
        key: 'retro', label: 'Retro', icon: 'ti-refresh', sub: 'Went well / Didn’t / Next',
        build: () => ['Went well', 'Didn’t work', 'Try next'].map((t, i) => ({ id: uid(), type: 'frame', x: 40 + i * 400, y: 40, w: 360, h: 520, title: t, fill: 'none' })),
      },
    ];

    // =========================================================================
    // Canvas renderer (PNG export) — mirrors the SVG below
    // =========================================================================
    function roundRect(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y); ctx.closePath();
    }
    function drawWrapped(ctx, text, size, bold, color, x, y, maxW, align, maxH) {
      const lines = wrapText(text, size, bold, maxW);
      if (!lines.length) return;
      ctx.font = fontStr(size, bold); ctx.fillStyle = color; ctx.textBaseline = 'top';
      ctx.textAlign = align === 'center' ? 'center' : 'left';
      const lh = size * 1.35;
      const max = maxH ? Math.floor(maxH / lh) : lines.length;
      lines.slice(0, max).forEach((ln, i) => ctx.fillText(ln, align === 'center' ? x + maxW / 2 : x, y + i * lh));
    }
    function drawArrow(ctx, a, b, color, sw) {
      ctx.strokeStyle = color; ctx.lineWidth = sw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const ang = Math.atan2(b.y - a.y, b.x - a.x), L = 10 + sw * 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - L * Math.cos(ang - Math.PI / 7), b.y - L * Math.sin(ang - Math.PI / 7));
      ctx.lineTo(b.x - L * Math.cos(ang + Math.PI / 7), b.y - L * Math.sin(ang + Math.PI / 7));
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }
    async function exportPng(elements, filename, cards) {
      const els = arr(elements);
      const byId = {}; els.forEach(e => { byId[e.id] = e; });
      const box = boxOfAll(els, byId);
      if (!box) throw new Error('Nothing to export');
      const pad = 48;
      const scale = clamp(Math.min(2, 8192 / (box.w + pad * 2), 8192 / (box.h + pad * 2)), 0.2, 2);
      const cv = document.createElement('canvas');
      cv.width = Math.max(2, Math.round((box.w + pad * 2) * scale));
      cv.height = Math.max(2, Math.round((box.h + pad * 2) * scale));
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.scale(scale, scale); ctx.translate(-box.x + pad, -box.y + pad);

      const images = await Promise.all(els.filter(e => e.type === 'image' && e.src).map(e => new Promise(res => {
        const im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = () => res({ id: e.id, im }); im.onerror = () => res(null);
        im.src = e.src;
      })));
      const imgMap = {}; images.forEach(r => { if (r) imgMap[r.id] = r.im; });

      const order = els.slice().sort((a, b) => (a.type === 'frame' ? 0 : 1) - (b.type === 'frame' ? 0 : 1));
      order.forEach(el => {
        if (el.type === 'frame') {
          ctx.fillStyle = el.fill && el.fill !== 'none' ? el.fill : 'rgba(0,0,0,.02)';
          ctx.fillRect(el.x, el.y, el.w, el.h);
          ctx.strokeStyle = '#c9c9cf'; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.strokeRect(el.x, el.y, el.w, el.h);
          drawWrapped(ctx, el.title || 'Frame', 13, true, '#5c5c66', el.x, el.y - 20, el.w, 'left');
        } else if (el.type === 'sticky') {
          ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.12)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
          ctx.fillStyle = el.color || STICKY_COLORS[0]; roundRect(ctx, el.x, el.y, el.w, el.h, 6); ctx.fill(); ctx.restore();
          drawWrapped(ctx, el.text, 14, false, '#1f1f23', el.x + 12, el.y + 12, el.w - 24, 'left', el.h - 20);
        } else if (el.type === 'text') {
          drawWrapped(ctx, el.text, el.size || 18, !!el.bold, el.color || '#1f1f23', el.x, el.y, el.w, 'left', el.h + 400);
        } else if (el.type === 'shape') {
          ctx.lineWidth = el.sw || 2; ctx.strokeStyle = el.stroke || '#1f1f23';
          const fill = el.fill && el.fill !== 'none' ? el.fill : null;
          ctx.beginPath();
          if (el.shape === 'ellipse') ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
          else if (el.shape === 'diamond') {
            ctx.moveTo(el.x + el.w / 2, el.y); ctx.lineTo(el.x + el.w, el.y + el.h / 2);
            ctx.lineTo(el.x + el.w / 2, el.y + el.h); ctx.lineTo(el.x, el.y + el.h / 2); ctx.closePath();
          } else roundRect(ctx, el.x, el.y, el.w, el.h, 6);
          if (fill) { ctx.fillStyle = fill; ctx.fill(); }
          ctx.stroke();
          if (el.text) drawWrapped(ctx, el.text, 14, false, '#1f1f23', el.x + 10, el.y + Math.max(8, el.h / 2 - 14), el.w - 20, 'center', el.h - 12);
        } else if (el.type === 'pen') {
          const pts = arr(el.pts);
          if (pts.length > 1) {
            ctx.strokeStyle = el.stroke || '#1f1f23'; ctx.lineWidth = el.sw || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(el.x + pts[0][0], el.y + pts[0][1]);
            pts.slice(1).forEach(p => ctx.lineTo(el.x + p[0], el.y + p[1]));
            ctx.stroke();
          }
        } else if (el.type === 'image') {
          const im = imgMap[el.id];
          if (im) ctx.drawImage(im, el.x, el.y, el.w, el.h);
          else { ctx.fillStyle = '#efeff1'; ctx.fillRect(el.x, el.y, el.w, el.h); }
        } else if (el.type === 'task') {
          const snap = (cards && cards[el.taskId]) || el.snap || {};
          ctx.fillStyle = '#ffffff'; roundRect(ctx, el.x, el.y, el.w, el.h, 8); ctx.fill();
          ctx.strokeStyle = '#e8e8eb'; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = snap.status_color || '#87909e'; roundRect(ctx, el.x, el.y, 4, el.h, 2); ctx.fill();
          drawWrapped(ctx, snap.title || 'Task', 13, true, '#1f1f23', el.x + 14, el.y + 12, el.w - 24, 'left', 40);
          drawWrapped(ctx, [snap.custom_id, snap.status_name].filter(Boolean).join(' · '), 11, false, '#8e8e99', el.x + 14, el.y + el.h - 24, el.w - 24, 'left');
        }
      });
      els.filter(e => e.type === 'conn').forEach(el => {
        const [a, b] = connPts(el, byId);
        drawArrow(ctx, a, b, el.stroke || '#1f1f23', el.sw || 2);
      });

      const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Export failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = (filename || 'whiteboard').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    async function makeThumb(elements, cards) {
      try {
        const els = arr(elements);
        const byId = {}; els.forEach(e => { byId[e.id] = e; });
        const box = boxOfAll(els, byId);
        if (!box) return null;
        const W = 360, H = 200;
        const scale = Math.min(W / (box.w + 40), H / (box.h + 40), 1);
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
        ctx.scale(scale, scale);
        ctx.translate(-box.x + (W / scale - box.w) / 2, -box.y + (H / scale - box.h) / 2);
        els.forEach(el => {
          if (el.type === 'conn') { const [a, b] = connPts(el, byId); ctx.strokeStyle = el.stroke || '#8e8e99'; ctx.lineWidth = (el.sw || 2); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); return; }
          const fill = el.type === 'sticky' ? (el.color || STICKY_COLORS[0])
            : el.type === 'frame' ? 'rgba(0,0,0,.04)'
            : el.type === 'task' ? '#eef2ff'
            : el.type === 'image' ? '#dbeafe'
            : el.type === 'pen' ? 'none' : (el.fill && el.fill !== 'none' ? el.fill : '#ffffff');
          if (el.type === 'pen') {
            const pts = arr(el.pts);
            if (pts.length > 1) { ctx.strokeStyle = el.stroke || '#1f1f23'; ctx.lineWidth = el.sw || 3; ctx.beginPath(); ctx.moveTo(el.x + pts[0][0], el.y + pts[0][1]); pts.slice(1).forEach(p => ctx.lineTo(el.x + p[0], el.y + p[1])); ctx.stroke(); }
            return;
          }
          ctx.fillStyle = fill; ctx.fillRect(el.x, el.y, el.w, el.h);
          if (el.type !== 'sticky') { ctx.strokeStyle = '#d6d6db'; ctx.lineWidth = 1; ctx.strokeRect(el.x, el.y, el.w, el.h); }
        });
        const data = cv.toDataURL('image/webp', 0.6);
        const out = data.length > 110000 ? cv.toDataURL('image/jpeg', 0.5) : data;
        return out.length <= 110000 && /^data:image\/(png|jpeg|webp);base64,/.test(out) ? out : null;
      } catch (_) { return null; }
    }

    // =========================================================================
    // Editor
    // =========================================================================
    const TOOLS = [
      { key: 'select', icon: 'ti-pointer', label: 'Select', hint: 'V' },
      { key: 'hand', icon: 'ti-hand-stop', label: 'Pan', hint: 'H' },
      { key: 'sticky', icon: 'ti-note', label: 'Sticky note', hint: 'S' },
      { key: 'text', icon: 'ti-typography', label: 'Text', hint: 'T' },
      { key: 'rect', icon: 'ti-square', label: 'Rectangle', hint: 'R' },
      { key: 'ellipse', icon: 'ti-circle', label: 'Ellipse', hint: 'O' },
      { key: 'diamond', icon: 'ti-diamond', label: 'Diamond', hint: 'D' },
      { key: 'conn', icon: 'ti-arrow-narrow-right', label: 'Connector', hint: 'C' },
      { key: 'pen', icon: 'ti-pencil', label: 'Pen', hint: 'P' },
      { key: 'frame', icon: 'ti-frame', label: 'Frame', hint: 'F' },
    ];

    function WhiteboardEditor({ boardId, onBack, currentUser, showToast, embedded }) {
      const store = useTaskStore();
      const [board, setBoard] = useState(null);
      const [loadErr, setLoadErr] = useState(null);
      const [scene, setScene] = useState(emptyScene);
      const [sel, setSel] = useState([]);              // element ids
      const [tool, setTool] = useState('select');
      const [view, setView] = useState({ tx: 40, ty: 40, z: 1 });
      const [editing, setEditing] = useState(null);     // element id being text-edited
      const [status, setStatus] = useState('saved');    // saved | saving | dirty | error | merged
      const [cards, setCards] = useState({});           // taskId → TaskRow
      const [menuAnchor, setMenuAnchor] = useState(null);
      const [verOpen, setVerOpen] = useState(false);
      const [toTask, setToTask] = useState(null);       // element pending sticky→task
      const [addTask, setAddTask] = useState(null);     // anchor for the task picker
      const [busy, setBusy] = useState(false);
      const [marquee, setMarquee] = useState(null);

      const wrapRef = useRef(null);
      const svgRef = useRef(null);
      const fileRef = useRef(null);
      const drag = useRef(null);
      const hist = useRef({ past: [], future: [] });
      const saved = useRef({ scene: emptyScene(), version: 0, at: 0 });
      const dirty = useRef(false);
      const saveTimer = useRef(null);
      const clip = useRef([]);
      const viewRef = useRef(view); viewRef.current = view;
      const sceneRef = useRef(scene); sceneRef.current = scene;
      const selRef = useRef(sel); selRef.current = sel;
      const toolRef = useRef(tool); toolRef.current = tool;
      const canEdit = !!(board && board.can_edit);

      const byId = useMemo(() => { const m = {}; arr(scene.elements).forEach(e => { m[e.id] = e; }); return m; }, [scene]);
      const els = arr(scene.elements);

      // ---- load ---------------------------------------------------------------
      const load = useCallback(async (id) => {
        setLoadErr(null);
        try {
          const b = await WhiteboardAPI.get(id);
          const sc = b && b.scene && Array.isArray(b.scene.elements) ? b.scene : emptyScene();
          setBoard(b); setScene(sc);
          saved.current = { scene: sc, version: b.version, at: Date.now() };
          dirty.current = false; setStatus('saved');
          hist.current = { past: [], future: [] };
        } catch (e) { setLoadErr(e); }
      }, []);
      useEffect(() => { if (boardId) load(boardId); }, [boardId, load]);

      // fit once after first load
      const fitted = useRef(null);
      useLayoutEffect(() => {
        if (!board || fitted.current === board.id) return;
        fitted.current = board.id;
        setTimeout(() => fitView(), 30);
      }, [board]);

      // ---- task cards ---------------------------------------------------------
      const cardIds = useMemo(() => els.filter(e => e.type === 'task' && e.taskId).map(e => e.taskId), [scene]);
      const refreshCards = useCallback(async () => {
        if (!cardIds.length) { setCards({}); return; }
        try {
          const rows = arr(await WhiteboardAPI.taskCards(cardIds));
          const m = {}; rows.forEach(r => { m[r.id] = r; });
          setCards(m);
        } catch (_) { /* fail open — snapshots still render */ }
      }, [cardIds.join(',')]);
      useEffect(() => { refreshCards(); }, [refreshCards]);
      useEffect(() => {
        if (!taskBus) return;
        const off = taskBus.on('task:changed', () => refreshCards());
        const iv = setInterval(() => { if (document.visibilityState === 'visible') refreshCards(); }, 30000);
        return () => { off(); clearInterval(iv); };
      }, [refreshCards]);

      // ---- history + mutation --------------------------------------------------
      const commit = useCallback((nextEls, opts) => {
        const o = opts || {};
        setScene(cur => {
          const next = { ...cur, elements: typeof nextEls === 'function' ? nextEls(arr(cur.elements)) : nextEls };
          if (!o.noHistory) { hist.current.past.push(cur); if (hist.current.past.length > 100) hist.current.past.shift(); hist.current.future = []; }
          return next;
        });
        dirty.current = true; setStatus('dirty');
      }, []);
      const undo = useCallback(() => {
        const prev = hist.current.past.pop();
        if (!prev) return;
        setScene(cur => { hist.current.future.push(cur); return prev; });
        dirty.current = true; setStatus('dirty');
      }, []);
      const redo = useCallback(() => {
        const nxt = hist.current.future.pop();
        if (!nxt) return;
        setScene(cur => { hist.current.past.push(cur); return nxt; });
        dirty.current = true; setStatus('dirty');
      }, []);

      // ---- save (debounced) + conflict merge ------------------------------------
      const doSave = useCallback(async (opts) => {
        const o = opts || {};
        if (!board || !canEdit) return;
        const mine = sceneRef.current;
        if (!o.force && !dirty.current) return;
        setStatus('saving');
        let thumb = null;
        if (Date.now() - (saved.current.thumbAt || 0) > 60000) { thumb = await makeThumb(arr(mine.elements), cards); }
        try {
          let res = await WhiteboardAPI.save(board.id, mine, saved.current.version, thumb, !!o.checkpoint);
          if (res && res.conflict) {
            const merged = mergeScenes(saved.current.scene, mine, res.scene);
            setScene(merged);
            sceneRef.current = merged;
            res = await WhiteboardAPI.save(board.id, merged, res.version, null, false);
            if (res && res.conflict) { setStatus('error'); showToast && showToast('Someone else is editing — reopen the board to get the latest.'); return; }
            saved.current = { scene: merged, version: res.version, at: Date.now(), thumbAt: thumb ? Date.now() : saved.current.thumbAt };
            dirty.current = false; setStatus('merged');
            showToast && showToast('Merged changes from another editor');
            return;
          }
          saved.current = { scene: mine, version: res.version, at: Date.now(), thumbAt: thumb ? Date.now() : saved.current.thumbAt };
          dirty.current = false; setStatus('saved');
          setBoard(b => (b ? { ...b, version: res.version, updated_at: res.updated_at } : b));
        } catch (e) {
          setStatus('error');
          if (isMissingRpc(e)) return;
          showToast && showToast('Could not save: ' + errText(e));
        }
      }, [board, canEdit, cards, showToast]);

      useEffect(() => {
        if (!dirty.current || !canEdit) return;
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => doSave(), 1200);
        return () => clearTimeout(saveTimer.current);
      }, [scene, canEdit, doSave]);

      // flush on unmount + warn on close
      useEffect(() => {
        const beforeUnload = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', beforeUnload);
        return () => {
          window.removeEventListener('beforeunload', beforeUnload);
          clearTimeout(saveTimer.current);
          if (dirty.current) doSave({ force: true });
        };
      }, [doSave]);

      // poll for other people's saves while idle
      useEffect(() => {
        if (!board) return;
        const iv = setInterval(async () => {
          if (dirty.current || document.visibilityState !== 'visible') return;
          try {
            const head = await WhiteboardAPI.head(board.id);
            if (head && head.version > saved.current.version) {
              const fresh = await WhiteboardAPI.get(board.id);
              const sc = fresh && fresh.scene && Array.isArray(fresh.scene.elements) ? fresh.scene : emptyScene();
              setBoard(fresh); setScene(sc);
              saved.current = { scene: sc, version: fresh.version, at: Date.now() };
              setStatus('saved');
            }
          } catch (_) { }
        }, 15000);
        return () => clearInterval(iv);
      }, [board && board.id]);

      // ---- view helpers ---------------------------------------------------------
      const rectOf = () => (svgRef.current ? svgRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600 });
      const toWorld = (cx, cy) => { const r = rectOf(); const v = viewRef.current; return { x: (cx - r.left - v.tx) / v.z, y: (cy - r.top - v.ty) / v.z }; };
      const zoomAt = (factor, cx, cy) => {
        setView(v => {
          const z = clamp(v.z * factor, 0.1, 4);
          const r = rectOf();
          const px = (cx == null ? r.width / 2 : cx - r.left), py = (cy == null ? r.height / 2 : cy - r.top);
          return { z, tx: px - ((px - v.tx) / v.z) * z, ty: py - ((py - v.ty) / v.z) * z };
        });
      };
      const fitView = useCallback(() => {
        const list = arr(sceneRef.current.elements);
        const r = rectOf();
        const b = boxOfAll(list, (() => { const m = {}; list.forEach(e => { m[e.id] = e; }); return m; })());
        if (!b) { setView({ tx: r.width / 2 - 200, ty: r.height / 2 - 150, z: 1 }); return; }
        const z = clamp(Math.min((r.width - 100) / Math.max(b.w, 1), (r.height - 100) / Math.max(b.h, 1)), 0.1, 1.6);
        setView({ z, tx: (r.width - b.w * z) / 2 - b.x * z, ty: (r.height - b.h * z) / 2 - b.y * z });
      }, []);

      // ---- element factories -----------------------------------------------------
      const makeEl = (type, p, size) => {
        const base = { id: uid(), x: p.x, y: p.y, w: (size && size.w) || 10, h: (size && size.h) || 10 };
        if (type === 'sticky') return { ...base, type: 'sticky', w: (size && size.w) || DEF.sticky.w, h: (size && size.h) || DEF.sticky.h, text: '', color: STICKY_COLORS[0] };
        if (type === 'text') return { ...base, type: 'text', w: (size && size.w) || DEF.text.w, h: (size && size.h) || DEF.text.h, text: '', size: 18, color: '#1f1f23', bold: false };
        if (type === 'frame') return { ...base, type: 'frame', w: (size && size.w) || DEF.frame.w, h: (size && size.h) || DEF.frame.h, title: 'Frame', fill: 'none' };
        if (type === 'rect' || type === 'ellipse' || type === 'diamond') {
          return { ...base, type: 'shape', shape: type, w: (size && size.w) || DEF.shape.w, h: (size && size.h) || DEF.shape.h, fill: '#ffffff', stroke: '#1f1f23', sw: 2, text: '' };
        }
        return { ...base, type };
      };
      const addAt = (type, p, size, opts) => {
        const el = makeEl(type, p, size);
        commit(list => list.concat(el));
        setSel([el.id]);
        if ((opts && opts.edit) !== false && (type === 'sticky' || type === 'text')) setTimeout(() => setEditing(el.id), 10);
        setTool('select');
        return el;
      };
      const centerPoint = () => { const r = rectOf(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };

      // ---- pointer handling -------------------------------------------------------
      const pointers = useRef(new Map());
      const pinch = useRef(null);

      const onPointerDown = (e) => {
        if (!svgRef.current) return;
        const isTouch = e.pointerType === 'touch';
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
          const [a, b] = Array.from(pointers.current.values());
          pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view: viewRef.current };
          drag.current = null;
          return;
        }
        try { svgRef.current.setPointerCapture(e.pointerId); } catch (_) { }
        const p = toWorld(e.clientX, e.clientY);
        const t = toolRef.current;
        const panning = t === 'hand' || e.button === 1 || (e.button === 0 && e.altKey) || (isTouch && t === 'hand');
        if (panning) { drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, view: viewRef.current }; return; }
        if (e.button !== 0) return;

        if (!canEdit) {
          drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, view: viewRef.current };
          return;
        }
        if (t === 'pen') {
          drag.current = { mode: 'pen', pts: [[0, 0]], origin: p, stroke: STROKE_COLORS[0], sw: 3 };
          commit(list => list.concat({ id: 'draft', type: 'pen', x: p.x, y: p.y, w: 1, h: 1, pts: [[0, 0]], stroke: STROKE_COLORS[0], sw: 3 }), { noHistory: true });
          return;
        }
        if (t === 'conn') {
          const target = [...els].reverse().find(el => el.type !== 'conn' && hitEl(el, p, byId));
          drag.current = { mode: 'conn', from: target ? { id: target.id } : { x: p.x, y: p.y }, to: { x: p.x, y: p.y } };
          return;
        }
        if (t !== 'select') { drag.current = { mode: 'create', type: t, origin: p, cur: p }; return; }

        // select tool
        const handle = e.target && e.target.dataset && e.target.dataset.handle;
        if (handle) {
          const box = boxOfAll(selRef.current.map(id => byId[id]).filter(Boolean), byId);
          drag.current = { mode: 'resize', handle, box, start: p, startEls: selRef.current.map(id => byId[id]).filter(Boolean).map(el => ({ ...el })) };
          return;
        }
        const endpoint = e.target && e.target.dataset && e.target.dataset.endpoint;
        if (endpoint) {
          const el = byId[e.target.dataset.elid];
          if (el) { drag.current = { mode: 'connEnd', id: el.id, end: endpoint, p }; return; }
        }
        const hit = [...els].reverse().find(el => hitEl(el, p, byId) && !el.locked);
        if (!hit) {
          if (!e.shiftKey) setSel([]);
          drag.current = { mode: 'marquee', origin: p, cur: p, add: e.shiftKey ? selRef.current.slice() : [] };
          setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
          return;
        }
        let nextSel = selRef.current;
        if (e.shiftKey) nextSel = selRef.current.includes(hit.id) ? selRef.current.filter(i => i !== hit.id) : selRef.current.concat(hit.id);
        else if (!selRef.current.includes(hit.id)) nextSel = [hit.id];
        setSel(nextSel);
        const moving = nextSel.map(id => byId[id]).filter(Boolean);
        // a frame drags whatever sits inside it
        const extra = [];
        moving.filter(el => el.type === 'frame').forEach(f => {
          els.forEach(el => {
            if (el.id === f.id || nextSel.includes(el.id) || el.type === 'conn') return;
            const c = centerOf(el);
            if (c.x >= f.x && c.x <= f.x + f.w && c.y >= f.y && c.y <= f.y + f.h) extra.push(el);
          });
        });
        drag.current = { mode: 'move', start: p, startEls: moving.concat(extra).map(el => ({ ...el })), moved: false };
      };

      const applyDrag = (e) => {
        const d = drag.current;
        if (!d) return;
        if (d.mode === 'pan') {
          setView({ ...d.view, tx: d.view.tx + (e.clientX - d.sx), ty: d.view.ty + (e.clientY - d.sy) });
          return;
        }
        const p = toWorld(e.clientX, e.clientY);
        if (d.mode === 'marquee') {
          d.cur = p;
          setMarquee({ x: Math.min(d.origin.x, p.x), y: Math.min(d.origin.y, p.y), w: Math.abs(p.x - d.origin.x), h: Math.abs(p.y - d.origin.y) });
          return;
        }
        if (d.mode === 'create') { d.cur = p; setMarquee({ x: Math.min(d.origin.x, p.x), y: Math.min(d.origin.y, p.y), w: Math.abs(p.x - d.origin.x), h: Math.abs(p.y - d.origin.y) }); return; }
        if (d.mode === 'conn') { d.to = { x: p.x, y: p.y }; setScene(s => ({ ...s })); return; }
        if (d.mode === 'pen') {
          const last = d.pts[d.pts.length - 1];
          const nx = p.x - d.origin.x, ny = p.y - d.origin.y;
          if (Math.hypot(nx - last[0], ny - last[1]) < 1.5 / viewRef.current.z) return;
          d.pts.push([nx, ny]);
          setScene(s => ({ ...s, elements: arr(s.elements).map(el => el.id === 'draft' ? { ...el, pts: d.pts.slice() } : el) }));
          return;
        }
        if (d.mode === 'move') {
          const dx = p.x - d.start.x, dy = p.y - d.start.y;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) d.moved = true;
          const map = {}; d.startEls.forEach(el => { map[el.id] = el; });
          setScene(s => ({ ...s, elements: arr(s.elements).map(el => map[el.id] ? { ...el, x: map[el.id].x + dx, y: map[el.id].y + dy } : el) }));
          return;
        }
        if (d.mode === 'resize') {
          const dx = p.x - d.start.x, dy = p.y - d.start.y;
          const b = d.box;
          if (!b) return;
          const right = /e/.test(d.handle), left = /w/.test(d.handle), bottom = /s/.test(d.handle), top = /n/.test(d.handle);
          let nw = b.w + (right ? dx : 0) - (left ? dx : 0);
          let nh = b.h + (bottom ? dy : 0) - (top ? dy : 0);
          nw = Math.max(20, nw); nh = Math.max(20, nh);
          const sx = nw / Math.max(b.w, 1), sy = nh / Math.max(b.h, 1);
          const ox = left ? b.x + b.w - nw : b.x, oy = top ? b.y + b.h - nh : b.y;
          const map = {}; d.startEls.forEach(el => { map[el.id] = el; });
          setScene(s => ({
            ...s,
            elements: arr(s.elements).map(el => {
              const st0 = map[el.id];
              if (!st0 || el.type === 'conn') return el;
              const nx = ox + (st0.x - b.x) * sx, ny = oy + (st0.y - b.y) * sy;
              const next = { ...el, x: nx, y: ny, w: Math.max(12, st0.w * sx), h: Math.max(12, st0.h * sy) };
              if (el.type === 'pen' && Array.isArray(st0.pts)) next.pts = st0.pts.map(pt => [pt[0] * sx, pt[1] * sy]);
              return next;
            }),
          }));
          return;
        }
        if (d.mode === 'connEnd') {
          const target = [...els].reverse().find(el => el.type !== 'conn' && hitEl(el, p, byId));
          setScene(s => ({
            ...s,
            elements: arr(s.elements).map(el => el.id !== d.id ? el
              : { ...el, [d.end]: target ? { id: target.id } : { x: p.x, y: p.y } }),
          }));
        }
      };
      const onPointerMove = (e) => {
        if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current && pointers.current.size === 2) {
          const [a, b] = Array.from(pointers.current.values());
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const f = d / (pinch.current.d || d);
          const r = rectOf();
          const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
          const v0 = pinch.current.view;
          const z = clamp(v0.z * f, 0.1, 4);
          setView({ z, tx: cx - ((cx - v0.tx) / v0.z) * z, ty: cy - ((cy - v0.ty) / v0.z) * z });
          return;
        }
        if (!drag.current) return;
        applyDrag(e);
      };
      const onPointerUp = (e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        const d = drag.current;
        drag.current = null;
        setMarquee(null);
        try { svgRef.current.releasePointerCapture(e.pointerId); } catch (_) { }
        if (!d) return;
        if (d.mode === 'marquee') {
          const m = { x: Math.min(d.origin.x, d.cur.x), y: Math.min(d.origin.y, d.cur.y), w: Math.abs(d.cur.x - d.origin.x), h: Math.abs(d.cur.y - d.origin.y) };
          if (m.w < 3 && m.h < 3) return;
          const inside = els.filter(el => {
            const b = elBox(el, byId);
            return b.x >= m.x && b.y >= m.y && b.x + b.w <= m.x + m.w && b.y + b.h <= m.y + m.h;
          }).map(el => el.id);
          setSel(Array.from(new Set(d.add.concat(inside))));
          return;
        }
        if (d.mode === 'create') {
          const w = Math.abs(d.cur.x - d.origin.x), hh = Math.abs(d.cur.y - d.origin.y);
          const p = { x: Math.min(d.origin.x, d.cur.x), y: Math.min(d.origin.y, d.cur.y) };
          const dragged = w > 12 && hh > 12;
          addAt(d.type, dragged ? p : d.origin, dragged ? { w, h: hh } : null);
          return;
        }
        if (d.mode === 'pen') {
          const pts = d.pts;
          setScene(s => ({ ...s, elements: arr(s.elements).filter(el => el.id !== 'draft') }));
          if (pts.length > 1) {
            const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
            const minX = Math.min(...xs), minY = Math.min(...ys);
            const el = {
              id: uid(), type: 'pen', x: d.origin.x + minX, y: d.origin.y + minY,
              w: Math.max(Math.max(...xs) - minX, 2), h: Math.max(Math.max(...ys) - minY, 2),
              pts: pts.map(p => [p[0] - minX, p[1] - minY]), stroke: d.stroke, sw: d.sw,
            };
            commit(list => list.filter(x => x.id !== 'draft').concat(el));
          }
          return;
        }
        if (d.mode === 'conn') {
          const target = [...els].reverse().find(el => el.type !== 'conn' && hitEl(el, d.to, byId));
          const from = d.from, to = target ? { id: target.id } : { x: d.to.x, y: d.to.y };
          const sameNode = from.id && to.id && from.id === to.id;
          const tiny = !from.id && !to.id && Math.hypot(d.to.x - from.x, d.to.y - from.y) < 12;
          if (!sameNode && !tiny) {
            const el = { id: uid(), type: 'conn', x: 0, y: 0, w: 1, h: 1, from, to, stroke: '#1f1f23', sw: 2, arrowEnd: true };
            commit(list => list.concat(el));
            setSel([el.id]);
          }
          setTool('select');
          return;
        }
        if (d.mode === 'move' && !d.moved) return;
        if (d.mode === 'move' || d.mode === 'resize' || d.mode === 'connEnd') {
          // the live scene already holds the result — push the pre-drag state into history
          const before = { ...sceneRef.current, elements: arr(sceneRef.current.elements).map(el => { const s0 = (d.startEls || []).find(x => x.id === el.id); return s0 ? s0 : el; }) };
          hist.current.past.push(before);
          if (hist.current.past.length > 100) hist.current.past.shift();
          hist.current.future = [];
          dirty.current = true; setStatus('dirty');
        }
      };
      const onWheel = (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) { zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); return; }
        setView(v => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }));
      };
      const onDoubleClick = (e) => {
        const p = toWorld(e.clientX, e.clientY);
        const hit = [...els].reverse().find(el => hitEl(el, p, byId));
        if (!hit) { if (canEdit) addAt('text', p); return; }
        if (hit.type === 'task') { if (hit.taskId) openTask(hit.taskId); return; }
        if (!canEdit || hit.locked) return;
        if (hit.type === 'sticky' || hit.type === 'text' || hit.type === 'shape' || hit.type === 'frame') setEditing(hit.id);
      };

      // ---- element ops -------------------------------------------------------------
      const patchEls = (ids, patch) => commit(list => list.map(el => ids.includes(el.id) ? { ...el, ...(typeof patch === 'function' ? patch(el) : patch) } : el));
      const removeSel = () => {
        if (!sel.length || !canEdit) return;
        commit(list => list.filter(el => !sel.includes(el.id) && !(el.type === 'conn' && ((el.from && sel.includes(el.from.id)) || (el.to && sel.includes(el.to.id))))));
        setSel([]);
      };
      const duplicateSel = () => {
        if (!sel.length || !canEdit) return;
        const copies = sel.map(id => byId[id]).filter(Boolean).map(el => ({ ...el, id: uid(), x: el.x + 24, y: el.y + 24, from: undefined, to: undefined }))
          .filter(el => el.type !== 'conn');
        if (!copies.length) return;
        commit(list => list.concat(copies));
        setSel(copies.map(c => c.id));
      };
      const zOrder = (dir) => {
        if (!sel.length || !canEdit) return;
        commit(list => {
          const picked = list.filter(el => sel.includes(el.id));
          const rest = list.filter(el => !sel.includes(el.id));
          return dir === 'front' ? rest.concat(picked) : picked.concat(rest);
        });
      };
      const nudge = (dx, dy) => { if (sel.length && canEdit) patchEls(sel, el => ({ x: el.x + dx, y: el.y + dy })); };

      // ---- images ------------------------------------------------------------------
      const insertImageFile = useCallback(async (file, at) => {
        if (!canEdit || !file || !/^image\//.test(file.type || '')) return;
        if (file.size > 15 * 1024 * 1024) { showToast && showToast('Images must be under 15 MB'); return; }
        setBusy(true);
        try {
          const { url } = await WhiteboardAPI.uploadImage(file);
          const dims = await new Promise(res => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 320, h: 240 }); im.src = url; });
          const scale = Math.min(1, 480 / Math.max(dims.w, dims.h));
          const p = at || centerPoint();
          const el = { id: uid(), type: 'image', x: p.x, y: p.y, w: Math.round(dims.w * scale), h: Math.round(dims.h * scale), src: url, natW: dims.w, natH: dims.h };
          commit(list => list.concat(el));
          setSel([el.id]);
        } catch (e) {
          showToast && showToast(/bucket/i.test(String(e && e.message)) ? 'Image storage isn’t set up yet (bucket "whiteboard-files").' : 'Upload failed: ' + errText(e));
        } finally { setBusy(false); }
      }, [canEdit, commit, showToast]);

      const onDrop = (e) => {
        e.preventDefault();
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) insertImageFile(f, toWorld(e.clientX, e.clientY));
      };
      useEffect(() => {
        const onPaste = (e) => {
          if (!canEdit || editing) return;
          const items = arr(e.clipboardData && e.clipboardData.items);
          const img = items.find(i => i.type && /^image\//.test(i.type));
          if (img) { const f = img.getAsFile(); if (f) { e.preventDefault(); insertImageFile(f, centerPoint()); } return; }
          if (clip.current.length) {
            e.preventDefault();
            const copies = clip.current.map(el => ({ ...el, id: uid(), x: el.x + 30, y: el.y + 30 })).filter(el => el.type !== 'conn');
            commit(list => list.concat(copies));
            setSel(copies.map(c => c.id));
          }
        };
        const host = wrapRef.current;
        if (host) host.addEventListener('paste', onPaste);
        return () => { if (host) host.removeEventListener('paste', onPaste); };
      }, [canEdit, editing, insertImageFile, commit]);

      // ---- keyboard -------------------------------------------------------------------
      useEffect(() => {
        const onKey = (e) => {
          const tag = e.target && e.target.tagName;
          if (editing || tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
          if (!wrapRef.current || !wrapRef.current.contains(document.activeElement) && document.activeElement !== document.body) return;
          const meta = e.metaKey || e.ctrlKey;
          if (meta && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
          if (meta && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
          if (meta && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
          if (meta && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel(els.map(el => el.id)); return; }
          if (meta && e.key.toLowerCase() === 'c') { clip.current = sel.map(id => byId[id]).filter(Boolean); return; }
          if (meta && e.key === ']') { e.preventDefault(); zOrder('front'); return; }
          if (meta && e.key === '[') { e.preventDefault(); zOrder('back'); return; }
          if (meta) return;
          if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSel(); return; }
          if (e.key === 'Escape') { setSel([]); setTool('select'); return; }
          if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(e.shiftKey ? -10 : -1, 0); return; }
          if (e.key === 'ArrowRight') { e.preventDefault(); nudge(e.shiftKey ? 10 : 1, 0); return; }
          if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, e.shiftKey ? -10 : -1); return; }
          if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, e.shiftKey ? 10 : 1); return; }
          if (e.key === '+' || e.key === '=') { zoomAt(1.15); return; }
          if (e.key === '-' || e.key === '_') { zoomAt(1 / 1.15); return; }
          if (e.shiftKey && e.key === '0') { setView(v => ({ ...v, z: 1 })); return; }
          if (e.shiftKey && e.key === '1') { fitView(); return; }
          const map = { v: 'select', h: 'hand', s: 'sticky', t: 'text', r: 'rect', o: 'ellipse', d: 'diamond', c: 'conn', p: 'pen', f: 'frame' };
          const tk = map[e.key.toLowerCase()];
          if (tk && canEdit) setTool(tk);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [els, sel, byId, editing, canEdit, undo, redo, fitView]);

      // ---- sticky → task ----------------------------------------------------------------
      const convertSticky = async (el, form) => {
        setBusy(true);
        try {
          const row = await WhiteboardAPI.stickyToTask(board.id, el.id, {
            title: form.title, description: form.description || null,
            list_id: form.listId || null, assignee_ids: form.assignees || [], due_at: form.due || null,
            backlink_url: location.origin + location.pathname + '#/whiteboards/' + board.id,
          });
          commit(list => list.map(x => x.id !== el.id ? x
            : { id: x.id, type: 'task', x: x.x, y: x.y, w: DEF.task.w, h: DEF.task.h, taskId: row.id, snap: { title: row.title, status_name: row.status_name, status_color: row.status_color, custom_id: row.custom_id } }));
          setCards(c => ({ ...c, [row.id]: row }));
          setToTask(null);
          showToast && showToast('Task created from sticky');
          doSave({ force: true });
        } catch (e) { showToast && showToast(isMissingRpc(e) ? 'Apply migration 104 to use whiteboards.' : errText(e)); }
        finally { setBusy(false); }
      };
      const attachTaskCard = (row) => {
        const p = centerPoint();
        const el = { id: uid(), type: 'task', x: p.x - DEF.task.w / 2, y: p.y - DEF.task.h / 2, w: DEF.task.w, h: DEF.task.h, taskId: row.id, snap: { title: row.title, status_name: row.status_name, status_color: row.status_color, custom_id: row.custom_id } };
        commit(list => list.concat(el));
        setCards(c => ({ ...c, [row.id]: row }));
        setSel([el.id]); setAddTask(null);
      };

      // ---- render helpers ------------------------------------------------------------------
      const selBox = sel.length ? boxOfAll(sel.map(id => byId[id]).filter(Boolean), byId) : null;
      const screenOf = (wx, wy) => ({ x: wx * view.z + view.tx, y: wy * view.z + view.ty });

      const renderEl = (el) => {
        const selected = sel.includes(el.id);
        const common = { key: el.id, style: { cursor: canEdit && tool === 'select' ? 'move' : 'default' } };
        if (el.type === 'frame') {
          return h`<g ...${common}>
            <rect x=${el.x} y=${el.y} width=${el.w} height=${el.h} rx=${8}
              fill=${el.fill && el.fill !== 'none' ? el.fill : 'rgba(127,127,140,.05)'} stroke=${selected ? 'var(--cu-accent,#ff00ee)' : '#c9c9cf'} strokeWidth=${1.5} strokeDasharray=${selected ? '' : '6 4'}/>
            <text x=${el.x} y=${el.y - 7} fontSize=${13} fontWeight=${600} fill="var(--cu-t2,#5c5c66)">${el.title || 'Frame'}</text>
          </g>`;
        }
        if (el.type === 'sticky') {
          const lines = wrapText(el.text, 14, false, el.w - 24);
          return h`<g ...${common}>
            <rect x=${el.x} y=${el.y} width=${el.w} height=${el.h} rx=${6} fill=${el.color || STICKY_COLORS[0]}
              stroke=${selected ? 'var(--cu-accent,#ff00ee)' : 'rgba(0,0,0,.08)'} strokeWidth=${selected ? 2 : 1}/>
            <text x=${el.x + 12} y=${el.y + 24} fontSize=${14} fill="#1f1f23" style=${{ pointerEvents: 'none', userSelect: 'none' }}>
              ${lines.slice(0, Math.floor((el.h - 16) / 19)).map((ln, i) => h`<tspan key=${i} x=${el.x + 12} dy=${i ? 19 : 0}>${ln}</tspan>`)}
            </text>
            ${!el.text && !selected ? h`<text x=${el.x + 12} y=${el.y + 26} fontSize=${13} fill="rgba(31,31,35,.35)" style=${{ pointerEvents: 'none' }}>Double-click to type</text>` : null}
          </g>`;
        }
        if (el.type === 'text') {
          const lines = wrapText(el.text || '', el.size || 18, !!el.bold, el.w);
          return h`<g ...${common}>
            ${selected ? h`<rect x=${el.x - 4} y=${el.y - 4} width=${el.w + 8} height=${el.h + 8} rx=${4} fill="none" stroke="var(--cu-accent,#ff00ee)" strokeWidth=${1.5}/>` : null}
            <text x=${el.x} y=${el.y + (el.size || 18)} fontSize=${el.size || 18} fontWeight=${el.bold ? 600 : 400} fill=${el.color || '#1f1f23'} style=${{ userSelect: 'none' }}>
              ${(lines.length ? lines : ['Text']).map((ln, i) => h`<tspan key=${i} x=${el.x} dy=${i ? (el.size || 18) * 1.35 : 0} opacity=${el.text ? 1 : .35}>${ln}</tspan>`)}
            </text>
          </g>`;
        }
        if (el.type === 'shape') {
          const stroke = selected ? 'var(--cu-accent,#ff00ee)' : (el.stroke || '#1f1f23');
          const fill = el.fill && el.fill !== 'none' ? el.fill : 'transparent';
          const lines = wrapText(el.text || '', 14, false, el.w - 20);
          const shapeNode = el.shape === 'ellipse'
            ? h`<ellipse cx=${el.x + el.w / 2} cy=${el.y + el.h / 2} rx=${el.w / 2} ry=${el.h / 2} fill=${fill} stroke=${stroke} strokeWidth=${el.sw || 2}/>`
            : el.shape === 'diamond'
              ? h`<polygon points=${`${el.x + el.w / 2},${el.y} ${el.x + el.w},${el.y + el.h / 2} ${el.x + el.w / 2},${el.y + el.h} ${el.x},${el.y + el.h / 2}`} fill=${fill} stroke=${stroke} strokeWidth=${el.sw || 2}/>`
              : h`<rect x=${el.x} y=${el.y} width=${el.w} height=${el.h} rx=${6} fill=${fill} stroke=${stroke} strokeWidth=${el.sw || 2}/>`;
          return h`<g ...${common}>
            ${shapeNode}
            ${el.text ? h`<text x=${el.x + el.w / 2} y=${el.y + el.h / 2 - ((lines.length - 1) * 9)} fontSize=${14} fill="#1f1f23" textAnchor="middle" style=${{ pointerEvents: 'none', userSelect: 'none' }}>
              ${lines.map((ln, i) => h`<tspan key=${i} x=${el.x + el.w / 2} dy=${i ? 18 : 0}>${ln}</tspan>`)}
            </text>` : null}
          </g>`;
        }
        if (el.type === 'pen') {
          const pts = arr(el.pts);
          if (pts.length < 2) return null;
          const d = pts.map((p, i) => (i ? 'L' : 'M') + (el.x + p[0]).toFixed(1) + ' ' + (el.y + p[1]).toFixed(1)).join(' ');
          return h`<g ...${common}>
            <path d=${d} fill="none" stroke=${el.stroke || '#1f1f23'} strokeWidth=${el.sw || 3} strokeLinecap="round" strokeLinejoin="round"/>
            ${selected ? h`<rect x=${el.x - 3} y=${el.y - 3} width=${el.w + 6} height=${el.h + 6} fill="none" stroke="var(--cu-accent,#ff00ee)" strokeWidth=${1.5} strokeDasharray="4 3"/>` : null}
          </g>`;
        }
        if (el.type === 'image') {
          return h`<g ...${common}>
            <image href=${el.src} x=${el.x} y=${el.y} width=${el.w} height=${el.h} preserveAspectRatio="xMidYMid slice"/>
            ${selected ? h`<rect x=${el.x} y=${el.y} width=${el.w} height=${el.h} fill="none" stroke="var(--cu-accent,#ff00ee)" strokeWidth=${2}/>` : null}
          </g>`;
        }
        if (el.type === 'task') {
          const row = cards[el.taskId] || el.snap || {};
          const color = row.status_color || '#87909e';
          const titleLines = wrapText(row.title || 'Task', 13, true, el.w - 26).slice(0, 2);
          return h`<g ...${common}>
            <rect x=${el.x} y=${el.y} width=${el.w} height=${el.h} rx=${8} fill="var(--cu-bg,#fff)" stroke=${sel.includes(el.id) ? 'var(--cu-accent,#ff00ee)' : 'var(--cu-bd,#e8e8eb)'} strokeWidth=${sel.includes(el.id) ? 2 : 1}/>
            <rect x=${el.x} y=${el.y} width=${4} height=${el.h} rx=${2} fill=${color}/>
            <text x=${el.x + 14} y=${el.y + 24} fontSize=${13} fontWeight=${600} fill="var(--cu-t1,#1f1f23)" style=${{ userSelect: 'none' }}>
              ${titleLines.map((ln, i) => h`<tspan key=${i} x=${el.x + 14} dy=${i ? 17 : 0}>${ln}</tspan>`)}
            </text>
            <text x=${el.x + 14} y=${el.y + el.h - 14} fontSize=${11} fill="var(--cu-t3,#8e8e99)" style=${{ userSelect: 'none' }}>
              ${[row.custom_id, row.status_name].filter(Boolean).join(' · ')}
            </text>
            ${!cards[el.taskId] && el.taskId ? h`<text x=${el.x + el.w - 12} y=${el.y + el.h - 14} fontSize=${10} fill="var(--cu-t3,#8e8e99)" textAnchor="end">no access</text>` : null}
          </g>`;
        }
        if (el.type === 'conn') {
          const [a, b] = connPts(el, byId);
          const stroke = sel.includes(el.id) ? 'var(--cu-accent,#ff00ee)' : (el.stroke || '#1f1f23');
          return h`<g key=${el.id}>
            <line x1=${a.x} y1=${a.y} x2=${b.x} y2=${b.y} stroke=${stroke} strokeWidth=${el.sw || 2}
              strokeDasharray=${el.dash ? '7 5' : ''} markerEnd=${el.arrowEnd === false ? '' : 'url(#wb-arrow)'} strokeLinecap="round"/>
            <line x1=${a.x} y1=${a.y} x2=${b.x} y2=${b.y} stroke="transparent" strokeWidth=${14}/>
            ${sel.includes(el.id) && canEdit ? h`<${Fragment}>
              <circle data-endpoint="from" data-elid=${el.id} cx=${a.x} cy=${a.y} r=${5 / view.z + 2} fill="#fff" stroke="var(--cu-accent,#ff00ee)" strokeWidth=${2} style=${{ cursor: 'crosshair' }}/>
              <circle data-endpoint="to" data-elid=${el.id} cx=${b.x} cy=${b.y} r=${5 / view.z + 2} fill="#fff" stroke="var(--cu-accent,#ff00ee)" strokeWidth=${2} style=${{ cursor: 'crosshair' }}/>
            <//>` : null}
          </g>`;
        }
        return null;
      };

      // text edit overlay position
      const editEl = editing ? byId[editing] : null;
      const editPos = editEl ? screenOf(editEl.x, editEl.y) : null;

      if (loadErr) {
        return h`<div class="wb"><div class="wb-hub">
          <${EmptyState} icon=${isMissingRpc(loadErr) ? 'ti-database-off' : 'ti-alert-triangle'}
            title=${isMissingRpc(loadErr) ? 'Whiteboards aren’t set up yet' : 'Couldn’t open this board'}
            sub=${isMissingRpc(loadErr) ? 'An admin needs to apply migration 104 in Supabase.' : errText(loadErr)}
            action=${onBack ? h`<button type="button" class="wb-btn" onClick=${onBack}>Back to boards</button>` : null}/>
        </div></div>`;
      }
      if (!board) return h`<div class="wb"><div class="wb-hub"><${Skel} h=${260}/></div></div>`;

      const statusLabel = { saved: 'All changes saved', saving: 'Saving…', dirty: 'Unsaved changes', merged: 'Merged & saved', error: 'Not saved' }[status];
      const statusIcon = { saved: 'ti-cloud-check', saving: 'ti-loader-2', dirty: 'ti-cloud-up', merged: 'ti-git-merge', error: 'ti-cloud-x' }[status];

      return h`<div class="wb" ref=${wrapRef} tabIndex=${-1}>
        <div class="wb-top">
          ${onBack ? h`<button type="button" class="wb-ibtn" aria-label="Back to whiteboards" onClick=${onBack}><i class="ti ti-arrow-left"></i></button>` : null}
          <i class="ti ti-chalkboard" style=${{ color: 'var(--cu-accent-ink,#a8009c)', fontSize: 17 }} aria-hidden="true"></i>
          <div class="wb-title">
            ${canEdit ? h`<${InlineTitle} value=${board.title} placeholder="Board name"
                onSave=${async (t) => { setBoard(b => ({ ...b, title: t })); try { await WhiteboardAPI.update(board.id, { title: t }); } catch (e) { showToast && showToast(errText(e)); } }}/>`
              : h`<span>${board.title}</span>`}
          </div>
          ${board.client_id ? h`<${ClientBadge} clientId=${board.client_id} size=${16}/>` : h`<span class="wb-status"><i class="ti ti-building"></i>Agency</span>`}
          ${board.is_private ? h`<span class="wb-status" title="Only you can see this board"><i class="ti ti-lock"></i>Private</span>` : null}
          <span style=${{ flex: 1 }}></span>
          <span class="wb-status" role="status" aria-live="polite">
            <i class=${'ti ' + statusIcon} style=${status === 'error' ? { color: '#e5484d' } : null}></i>
            <span class="wb-hide-sm">${statusLabel}</span>
          </span>
          ${canEdit ? h`<${Fragment}>
            <button type="button" class="wb-ibtn" aria-label="Undo (⌘Z)" title="Undo" disabled=${!hist.current.past.length} onClick=${undo}><i class="ti ti-arrow-back-up"></i></button>
            <button type="button" class="wb-ibtn" aria-label="Redo (⌘⇧Z)" title="Redo" disabled=${!hist.current.future.length} onClick=${redo}><i class="ti ti-arrow-forward-up"></i></button>
          <//>` : null}
          <button type="button" class="wb-ibtn" aria-label="Add task card" title="Add task card"
            onClick=${e => setAddTask(addTask ? null : e.currentTarget)} disabled=${!canEdit}><i class="ti ti-square-plus"></i></button>
          <button type="button" class="wb-ibtn" aria-label=${board.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick=${async () => {
              try { const r = await TaskAPI.favoriteToggle('whiteboard', board.id, board.title, location.origin + location.pathname + '#/whiteboards/' + board.id); setBoard(b => ({ ...b, is_favorite: !!(r && r.on) })); }
              catch (e) { showToast && showToast(errText(e)); }
            }}>
            <i class=${'ti ' + (board.is_favorite ? 'ti-star-filled' : 'ti-star')} style=${board.is_favorite ? { color: '#f5a623' } : null}></i>
          </button>
          <button type="button" class="wb-ibtn" aria-label="Board menu" aria-haspopup="menu"
            onClick=${e => setMenuAnchor(menuAnchor ? null : e.currentTarget)}><i class="ti ti-dots-vertical"></i></button>
        </div>

        <div class="wb-ed">
          <div class="wb-canvas-wrap" onDrop=${onDrop} onDragOver=${e => e.preventDefault()}>
            <svg ref=${svgRef} class=${'wb-svg' + (tool === 'hand' ? ' pan' : '') + (drag.current && drag.current.mode === 'pan' ? ' panning' : '') + (['sticky', 'text', 'rect', 'ellipse', 'diamond', 'pen', 'conn', 'frame'].includes(tool) ? ' draw' : '')}
              onPointerDown=${onPointerDown} onPointerMove=${onPointerMove} onPointerUp=${onPointerUp} onPointerCancel=${onPointerUp}
              onWheel=${onWheel} onDoubleClick=${onDoubleClick} role="application" aria-label=${'Whiteboard canvas: ' + board.title}>
              <defs>
                <marker id="wb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/>
                </marker>
                <pattern id="wb-dots" width=${24 * view.z} height=${24 * view.z} patternUnits="userSpaceOnUse" x=${view.tx} y=${view.ty}>
                  <circle cx=${1.2} cy=${1.2} r=${1.2} fill="rgba(127,127,140,.28)"/>
                </pattern>
                <pattern id="wb-grid" width=${24 * view.z} height=${24 * view.z} patternUnits="userSpaceOnUse" x=${view.tx} y=${view.ty}>
                  <path d=${'M ' + (24 * view.z) + ' 0 L 0 0 0 ' + (24 * view.z)} fill="none" stroke="rgba(127,127,140,.16)" strokeWidth="1"/>
                </pattern>
              </defs>
              ${scene.bg !== 'plain' ? h`<rect x="0" y="0" width="100%" height="100%" fill=${scene.bg === 'grid' ? 'url(#wb-grid)' : 'url(#wb-dots)'}/>` : null}
              <g transform=${'translate(' + view.tx + ',' + view.ty + ') scale(' + view.z + ')'}>
                ${els.filter(e => e.type === 'frame').map(renderEl)}
                ${els.filter(e => e.type !== 'frame' && e.type !== 'conn').map(renderEl)}
                ${els.filter(e => e.type === 'conn').map(renderEl)}
                ${drag.current && drag.current.mode === 'conn' ? (() => {
                  const d = drag.current;
                  const a = d.from.id && byId[d.from.id] ? anchorPoint(byId[d.from.id], d.to) : { x: d.from.x, y: d.from.y };
                  return h`<line x1=${a.x} y1=${a.y} x2=${d.to.x} y2=${d.to.y} stroke="var(--cu-accent,#ff00ee)" strokeWidth=${2} strokeDasharray="5 4" markerEnd="url(#wb-arrow)"/>`;
                })() : null}
                ${marquee && drag.current && (drag.current.mode === 'marquee' || drag.current.mode === 'create') ? h`<rect x=${marquee.x} y=${marquee.y} width=${marquee.w} height=${marquee.h}
                  fill="rgba(255,0,238,.07)" stroke="var(--cu-accent,#ff00ee)" strokeWidth=${1 / view.z} strokeDasharray=${4 / view.z + ' ' + 3 / view.z}/>` : null}
                ${selBox && canEdit && !editing ? h`<g>
                  <rect x=${selBox.x - 2} y=${selBox.y - 2} width=${selBox.w + 4} height=${selBox.h + 4} fill="none"
                    stroke="var(--cu-accent,#ff00ee)" strokeWidth=${1.5 / view.z} strokeDasharray=${sel.length > 1 ? (5 / view.z + ' ' + 4 / view.z) : ''}/>
                  ${sel.length === 1 && byId[sel[0]] && byId[sel[0]].type === 'conn' ? null
                    : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(hd => {
                      const hx = selBox.x + (/w$/.test(hd) ? 0 : /e$/.test(hd) ? selBox.w : selBox.w / 2);
                      const hy = selBox.y + (/^n/.test(hd) ? 0 : /^s/.test(hd) ? selBox.h : selBox.h / 2);
                      const s = 8 / view.z;
                      return h`<rect key=${hd} data-handle=${hd} x=${hx - s / 2} y=${hy - s / 2} width=${s} height=${s} rx=${1.5 / view.z}
                        fill="#fff" stroke="var(--cu-accent,#ff00ee)" strokeWidth=${1.5 / view.z}
                        style=${{ cursor: (/^(n|s)$/.test(hd) ? 'ns-resize' : /^(e|w)$/.test(hd) ? 'ew-resize' : /(nw|se)/.test(hd) ? 'nwse-resize' : 'nesw-resize') }}/>`;
                    })}
                <//>` : null}
              </g>
            </svg>

            ${!els.length && !editing ? h`<div class="wb-empty-hint">
              ${canEdit ? h`<${Fragment}>Pick a tool on the left, or double-click anywhere to add text.<br/>
                <kbd>S</kbd> sticky · <kbd>T</kbd> text · <kbd>R</kbd> shape · <kbd>C</kbd> connector · <kbd>P</kbd> pen<//>`
                : 'This board is empty.'}
            </div>` : null}

            ${canEdit ? h`<div class="wb-tools" role="toolbar" aria-label="Whiteboard tools">
              ${TOOLS.map(t => h`<button key=${t.key} type="button" class=${'wb-tool' + (tool === t.key ? ' on' : '')}
                title=${t.label + ' (' + t.hint + ')'} aria-label=${t.label} aria-pressed=${tool === t.key}
                onClick=${() => setTool(t.key)}><i class=${'ti ' + t.icon}></i></button>`)}
              <button type="button" class="wb-tool" title="Insert image (I)" aria-label="Insert image" onClick=${() => fileRef.current && fileRef.current.click()}>
                <i class="ti ti-photo"></i></button>
            </div>` : null}

            <div class="wb-zoom">
              <button type="button" class="wb-ibtn" aria-label="Zoom out" onClick=${() => zoomAt(1 / 1.2)}><i class="ti ti-minus"></i></button>
              <span>${Math.round(view.z * 100)}%</span>
              <button type="button" class="wb-ibtn" aria-label="Zoom in" onClick=${() => zoomAt(1.2)}><i class="ti ti-plus"></i></button>
              <button type="button" class="wb-ibtn" aria-label="Fit to screen" title="Fit (⇧1)" onClick=${fitView}><i class="ti ti-maximize"></i></button>
            </div>

            ${selBox && canEdit && !editing ? (() => {
              const p = screenOf(selBox.x, selBox.y);
              const one = sel.length === 1 ? byId[sel[0]] : null;
              const top = Math.max(8, p.y - 48);
              return h`<div class="wb-ctx" style=${{ left: Math.max(8, p.x) + 'px', top: top + 'px' }} role="toolbar" aria-label="Selection">
                ${one && one.type === 'sticky' ? STICKY_COLORS.map(c => h`<button key=${c} type="button" class=${'wb-sw' + (one.color === c ? ' on' : '')}
                  style=${{ background: c }} aria-label=${'Colour ' + c} onClick=${() => patchEls(sel, { color: c })}></button>`) : null}
                ${one && one.type === 'shape' ? h`<${Fragment}>
                  ${SHAPE_FILLS.map(c => h`<button key=${c} type="button" class=${'wb-sw' + (one.fill === c ? ' on' : '')}
                    style=${{ background: c === 'none' ? 'transparent' : c, backgroundImage: c === 'none' ? 'linear-gradient(45deg,transparent 45%,#e5484d 45%,#e5484d 55%,transparent 55%)' : 'none' }}
                    aria-label=${'Fill ' + c} onClick=${() => patchEls(sel, { fill: c })}></button>`)}
                  <span style=${{ width: 1, height: 20, background: 'var(--cu-bd,#e8e8eb)', margin: '0 2px' }}></span>
                <//>` : null}
                ${one && (one.type === 'pen' || one.type === 'conn' || one.type === 'text') ? STROKE_COLORS.map(c => h`<button key=${c} type="button"
                  class=${'wb-sw' + ((one.stroke || one.color) === c ? ' on' : '')} style=${{ background: c }} aria-label=${'Colour ' + c}
                  onClick=${() => patchEls(sel, one.type === 'text' ? { color: c } : { stroke: c })}></button>`) : null}
                ${one && one.type === 'text' ? h`<button type="button" class="wb-ibtn" aria-label="Bold" aria-pressed=${!!one.bold}
                  onClick=${() => patchEls(sel, { bold: !one.bold })}><i class="ti ti-bold"></i></button>` : null}
                ${one && one.type === 'conn' ? h`<button type="button" class="wb-ibtn" aria-label="Dashed line" aria-pressed=${!!one.dash}
                  onClick=${() => patchEls(sel, { dash: !one.dash })}><i class="ti ti-line-dashed"></i></button>` : null}
                ${one && (one.type === 'sticky' || one.type === 'text' || one.type === 'shape' || one.type === 'frame') ? h`<button type="button" class="wb-ibtn"
                  aria-label="Edit text" onClick=${() => setEditing(one.id)}><i class="ti ti-cursor-text"></i></button>` : null}
                ${one && one.type === 'sticky' ? h`<button type="button" class="wb-ibtn" aria-label="Turn into a task" title="Turn into a task"
                  onClick=${() => setToTask(one)}><i class="ti ti-circle-check"></i></button>` : null}
                ${one && one.type === 'task' && one.taskId ? h`<button type="button" class="wb-ibtn" aria-label="Open task"
                  onClick=${() => openTask(one.taskId)}><i class="ti ti-arrow-up-right"></i></button>` : null}
                <button type="button" class="wb-ibtn" aria-label="Bring to front" onClick=${() => zOrder('front')}><i class="ti ti-stack-forward"></i></button>
                <button type="button" class="wb-ibtn" aria-label="Send to back" onClick=${() => zOrder('back')}><i class="ti ti-stack-back"></i></button>
                <button type="button" class="wb-ibtn" aria-label="Duplicate" onClick=${duplicateSel}><i class="ti ti-copy"></i></button>
                <button type="button" class="wb-ibtn" aria-label="Delete" style=${{ color: '#e5484d' }} onClick=${removeSel}><i class="ti ti-trash"></i></button>
              </div>`;
            })() : null}

            ${editEl && editPos ? h`<textarea class="wb-edit-ta" autoFocus
              style=${{
                left: editPos.x + 'px', top: editPos.y + 'px',
                width: Math.max(60, editEl.w * view.z) + 'px', height: Math.max(36, editEl.h * view.z) + 'px',
                fontSize: ((editEl.type === 'text' ? (editEl.size || 18) : 14) * view.z) + 'px',
                fontWeight: editEl.bold ? 600 : 400, lineHeight: 1.35,
                color: editEl.type === 'text' ? (editEl.color || '#1f1f23') : '#1f1f23',
                background: editEl.type === 'sticky' ? (editEl.color || STICKY_COLORS[0]) : 'var(--cu-bg,#fff)',
                textAlign: editEl.type === 'shape' ? 'center' : 'left',
              }}
              defaultValue=${editEl.type === 'frame' ? (editEl.title || '') : (editEl.text || '')}
              aria-label="Edit element text"
              onBlur=${e => { const v = e.target.value; patchEls([editEl.id], editEl.type === 'frame' ? { title: v } : { text: v }); setEditing(null); }}
              onKeyDown=${e => {
                if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.target.blur(); }
                if (e.key === 'Enter' && editEl.type === 'frame') { e.preventDefault(); e.target.blur(); }
              }}></textarea>` : null}

            ${busy ? h`<div style=${{ position: 'absolute', right: 12, top: 12, background: 'var(--cu-bg,#fff)', border: '1px solid var(--cu-bd,#e8e8eb)', borderRadius: 8, padding: '6px 10px', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
              <i class="ti ti-loader-2"></i>Working…</div>` : null}
          </div>
        </div>

        <input ref=${fileRef} type="file" accept="image/*" style=${{ display: 'none' }}
          onChange=${e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) insertImageFile(f); }}/>

        <${Popover} anchor=${menuAnchor} open=${!!menuAnchor} onClose=${() => setMenuAnchor(null)} placement="bottom-end">
          <${Menu} onClose=${() => setMenuAnchor(null)} items=${[
            { key: 'png', label: 'Export as PNG', icon: 'ti-download', onSelect: async () => { try { await exportPng(els, board.title, cards); } catch (e) { showToast && showToast(errText(e)); } } },
            { key: 'save', label: 'Save a checkpoint', icon: 'ti-bookmark', disabled: !canEdit, onSelect: () => doSave({ force: true, checkpoint: true }) },
            { key: 'hist', label: 'Version history', icon: 'ti-history', onSelect: () => setVerOpen(true) },
            { divider: true, key: 'd1' },
            { key: 'bg', label: 'Background: ' + (scene.bg === 'grid' ? 'Grid' : scene.bg === 'plain' ? 'Plain' : 'Dots'), icon: 'ti-grid-dots', disabled: !canEdit,
              onSelect: () => { setScene(s => ({ ...s, bg: s.bg === 'dots' ? 'grid' : s.bg === 'grid' ? 'plain' : 'dots' })); dirty.current = true; setStatus('dirty'); } },
            { key: 'priv', label: board.is_private ? 'Make visible to the team' : 'Make private', icon: board.is_private ? 'ti-lock-open' : 'ti-lock',
              disabled: board.created_by !== (store.me && store.me.id),
              onSelect: async () => { try { const b = await WhiteboardAPI.update(board.id, { is_private: !board.is_private }); setBoard(x => ({ ...x, ...b })); } catch (e) { showToast && showToast(errText(e)); } } },
            { key: 'dup', label: 'Duplicate board', icon: 'ti-copy', onSelect: async () => { try { const b = await WhiteboardAPI.duplicate(board.id); showToast && showToast('Board duplicated'); location.hash = '#/whiteboards/' + b.id; } catch (e) { showToast && showToast(errText(e)); } } },
            { key: 'arch', label: board.archived_at ? 'Unarchive' : 'Archive', icon: 'ti-archive', disabled: !canEdit,
              onSelect: async () => { try { const b = await WhiteboardAPI.update(board.id, { archived: !board.archived_at }); setBoard(x => ({ ...x, ...b })); showToast && showToast(b.archived_at ? 'Board archived' : 'Board restored'); } catch (e) { showToast && showToast(errText(e)); } } },
            { divider: true, key: 'd2' },
            { key: 'del', label: 'Delete board', icon: 'ti-trash', danger: true, disabled: !board.can_delete,
              onSelect: async () => {
                if (!window.confirm('Delete "' + board.title + '"? This cannot be undone.')) return;
                try { await WhiteboardAPI.remove(board.id); showToast && showToast('Board deleted'); dirty.current = false; if (onBack) onBack(); else location.hash = '#/whiteboards'; }
                catch (e) { showToast && showToast(errText(e)); }
              } },
          ]}/>
        <//>

        <${Popover} anchor=${addTask} open=${!!addTask} onClose=${() => setAddTask(null)} width=${320} placement="bottom-end">
          <${TaskSearchPicker} onPick=${attachTaskCard}/>
        <//>

        ${toTask ? h`<${StickyToTaskModal} el=${toTask} board=${board} busy=${busy}
          onClose=${() => setToTask(null)} onCreate=${(form) => convertSticky(toTask, form)}/>` : null}
        ${verOpen ? h`<${VersionsModal} board=${board} onClose=${() => setVerOpen(false)} showToast=${showToast}
          onRestored=${(res) => { setScene(res.scene); saved.current = { scene: res.scene, version: res.version, at: Date.now() }; dirty.current = false; setStatus('saved'); setBoard(b => ({ ...b, version: res.version })); setVerOpen(false); }}/>` : null}
      </div>`;
    }

    // ---- task search picker (for embedded task cards) --------------------------
    function TaskSearchPicker({ onPick }) {
      const [q, setQ] = useState('');
      const [rows, setRows] = useState([]);
      const [loading, setLoading] = useState(false);
      useEffect(() => {
        let alive = true;
        const t = setTimeout(async () => {
          if (!q.trim()) { setRows([]); return; }
          setLoading(true);
          try { const res = await TaskAPI.search(q.trim(), 8); if (alive) setRows(arr(res && res.tasks)); }
          catch (_) { if (alive) setRows([]); }
          finally { if (alive) setLoading(false); }
        }, 200);
        return () => { alive = false; clearTimeout(t); };
      }, [q]);
      return h`<div style=${{ padding: 6 }}>
        <input class="wb-in" autoFocus value=${q} placeholder="Search tasks…" aria-label="Search tasks"
          onInput=${e => setQ(e.target.value)}/>
        <div style=${{ marginTop: 6, maxHeight: 280, overflow: 'auto' }}>
          ${loading ? h`<div class="wb-vrow">Searching…</div>`
            : !rows.length ? h`<div class="wb-vrow" style=${{ color: 'var(--cu-t3,#8e8e99)' }}>${q ? 'No tasks found' : 'Type to find a task'}</div>`
              : rows.map(r => h`<button key=${r.id} type="button" class="wb-vrow" style=${{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                  onClick=${() => onPick(r)}>
                  <span style=${{ width: 8, height: 8, borderRadius: '50%', background: r.status_color || '#87909e', flexShrink: 0 }}></span>
                  <span style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${r.title}</span>
                  <span style=${{ fontSize: 11, color: 'var(--cu-t3,#8e8e99)' }}>${r.custom_id || ''}</span>
                </button>`)}
        </div>
      </div>`;
    }

    // ---- sticky → task modal ------------------------------------------------------
    function StickyToTaskModal({ el, board, busy, onClose, onCreate }) {
      const store = useTaskStore();
      const text = String(el.text || '').trim();
      const firstLine = text.split('\n')[0] || 'New task';
      const [title, setTitle] = useState(firstLine.slice(0, 200));
      const [desc, setDesc] = useState(text.split('\n').slice(1).join('\n'));
      const [listId, setListId] = useState(() => {
        const lists = store.listsForClient ? store.listsForClient(board.client_id || null) : [];
        const pick = arr(lists).find(l => l.system_key === 'tasks') || arr(lists).find(l => l.system_key === 'internal') || arr(lists)[0];
        return pick ? pick.id : null;
      });
      const [assignees, setAssignees] = useState([]);
      const [due, setDue] = useState(null);
      return h`<div class="wb-modal-bg" onMouseDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="wb wb-modal" role="dialog" aria-modal="true" aria-label="Turn sticky into a task"
          onKeyDown=${e => { if (e.key === 'Escape') onClose(); }}>
          <div class="wb-modal-hd"><i class="ti ti-circle-check" style=${{ color: 'var(--cu-accent-ink,#a8009c)' }}></i>Turn sticky into a task
            <span style=${{ flex: 1 }}></span>
            <button type="button" class="wb-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="wb-modal-b">
            <label class="wb-lbl" for="wb-t2t-title">Task name</label>
            <input id="wb-t2t-title" class="wb-in" autoFocus value=${title} onInput=${e => setTitle(e.target.value)}/>
            <label class="wb-lbl" style=${{ marginTop: 12 }} for="wb-t2t-desc">Description</label>
            <textarea id="wb-t2t-desc" class="wb-in" style=${{ height: 74, padding: '8px 10px' }} value=${desc} onInput=${e => setDesc(e.target.value)}></textarea>
            <div style=${{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
              <div><span class="wb-lbl">List</span><${ListPicker} value=${listId} onChange=${(id) => setListId(id)}/></div>
              <div><span class="wb-lbl">Assignees</span><${AssigneePicker} value=${assignees} onChange=${setAssignees}/></div>
              <div><span class="wb-lbl">Due</span><${DatePicker} value=${due} withTime=${false} label="Due date" onChange=${(iso) => setDue(iso)}/></div>
            </div>
            <div style=${{ fontSize: 12, color: 'var(--cu-t3,#8e8e99)', marginTop: 12, lineHeight: 1.5 }}>
              The sticky becomes a live task card on the board, and the task description links back here.
            </div>
          </div>
          <div class="wb-modal-f">
            <span style=${{ flex: 1 }}></span>
            <button type="button" class="wb-btn ghost" onClick=${onClose}>Cancel</button>
            <button type="button" class="wb-btn pri" disabled=${busy || !title.trim()}
              onClick=${() => onCreate({ title: title.trim(), description: desc.trim(), listId, assignees, due })}>
              ${busy ? h`<i class="ti ti-loader-2"></i>` : null}Create task
            </button>
          </div>
        </div>
      </div>`;
    }

    // ---- versions modal -------------------------------------------------------------
    function VersionsModal({ board, onClose, onRestored, showToast }) {
      const [rows, setRows] = useState(null);
      const [busy, setBusy] = useState(false);
      useEffect(() => { (async () => { try { setRows(arr(await WhiteboardAPI.versions(board.id))); } catch (_) { setRows([]); } })(); }, [board.id]);
      const restore = async (v) => {
        if (!window.confirm('Restore this version? The current board is saved to history first.')) return;
        setBusy(true);
        try { const res = await WhiteboardAPI.versionRestore(v.id); onRestored(res); showToast && showToast('Version restored'); }
        catch (e) { showToast && showToast(errText(e)); }
        finally { setBusy(false); }
      };
      return h`<div class="wb-modal-bg" onMouseDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="wb wb-modal" role="dialog" aria-modal="true" aria-label="Version history" onKeyDown=${e => { if (e.key === 'Escape') onClose(); }}>
          <div class="wb-modal-hd"><i class="ti ti-history"></i>Version history
            <span style=${{ flex: 1 }}></span>
            <button type="button" class="wb-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="wb-modal-b">
            ${rows === null ? h`<${Skel} h=${120}/>`
              : !rows.length ? h`<div style=${{ fontSize: 13, color: 'var(--cu-t3,#8e8e99)' }}>No snapshots yet. One is kept each time the board changes after a 10-minute gap, plus every checkpoint you save.</div>`
                : rows.map(v => h`<div key=${v.id} class="wb-vrow">
                    <i class="ti ti-clock" style=${{ color: 'var(--cu-t3,#8e8e99)' }}></i>
                    <div style=${{ flex: 1, minWidth: 0 }}>
                      <div style=${{ fontWeight: 600 }}>v${v.version} · ${v.element_count} item${v.element_count === 1 ? '' : 's'}</div>
                      <div style=${{ fontSize: 11.5, color: 'var(--cu-t3,#8e8e99)' }}>${v.saved_by_name || 'Someone'} · ${fmtRelative ? fmtRelative(v.created_at) : new Date(v.created_at).toLocaleString('en-IN')}</div>
                    </div>
                    <button type="button" class="wb-btn" disabled=${busy} onClick=${() => restore(v)}>Restore</button>
                  </div>`)}
          </div>
        </div>
      </div>`;
    }

    // =========================================================================
    // Hub
    // =========================================================================
    function NewBoardModal({ clients, defaultClientId, onClose, onCreated, showToast }) {
      const [title, setTitle] = useState('Untitled board');
      const [clientId, setClientId] = useState(defaultClientId || '');
      const [priv, setPriv] = useState(false);
      const [tpl, setTpl] = useState('blank');
      const [busy, setBusy] = useState(false);
      const create = async () => {
        setBusy(true);
        try {
          const t = TEMPLATES.find(x => x.key === tpl) || TEMPLATES[0];
          const b = await WhiteboardAPI.create({ title: title.trim() || 'Untitled board', client_id: clientId || null, is_private: priv, scene: { v: 1, bg: 'dots', elements: t.build() } });
          onCreated(b);
        } catch (e) { showToast && showToast(isMissingRpc(e) ? 'Apply migration 104 to use whiteboards.' : errText(e)); setBusy(false); }
      };
      return h`<div class="wb-modal-bg" onMouseDown=${e => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="wb wb-modal" role="dialog" aria-modal="true" aria-label="New whiteboard" onKeyDown=${e => { if (e.key === 'Escape') onClose(); }}>
          <div class="wb-modal-hd"><i class="ti ti-chalkboard"></i>New whiteboard
            <span style=${{ flex: 1 }}></span>
            <button type="button" class="wb-ibtn" aria-label="Close" onClick=${onClose}><i class="ti ti-x"></i></button>
          </div>
          <div class="wb-modal-b">
            <label class="wb-lbl" for="wb-new-title">Name</label>
            <input id="wb-new-title" class="wb-in" autoFocus value=${title} onInput=${e => setTitle(e.target.value)}/>
            <div style=${{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
              <div style=${{ flex: '1 1 200px' }}>
                <label class="wb-lbl" for="wb-new-client">Space</label>
                <select id="wb-new-client" class="wb-in" value=${clientId} onChange=${e => setClientId(e.target.value)}>
                  <option value="">Agency</option>
                  ${arr(clients).map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
                </select>
              </div>
              <label style=${{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, alignSelf: 'flex-end', height: 30 }}>
                <input type="checkbox" checked=${priv} onChange=${e => setPriv(e.target.checked)}/>Private (only me)
              </label>
            </div>
            <span class="wb-lbl" style=${{ marginTop: 14 }}>Start from</span>
            <div class="wb-tpl">
              ${TEMPLATES.map(t => h`<button key=${t.key} type="button" onClick=${() => setTpl(t.key)}
                style=${tpl === t.key ? { borderColor: 'var(--cu-accent,#ff00ee)', background: 'var(--cu-accent-fog,rgba(255,0,238,.06))' } : null}>
                <i class=${'ti ' + t.icon}></i><span>${t.label}<br/><small>${t.sub}</small></span>
              </button>`)}
            </div>
          </div>
          <div class="wb-modal-f">
            <span style=${{ flex: 1 }}></span>
            <button type="button" class="wb-btn ghost" onClick=${onClose}>Cancel</button>
            <button type="button" class="wb-btn pri" disabled=${busy} onClick=${create}>${busy ? h`<i class="ti ti-loader-2"></i>` : null}Create board</button>
          </div>
        </div>
      </div>`;
    }

    function WhiteboardsHub({ currentUser, clients, showToast, onOpen, startNew, onNewHandled }) {
      const [tab, setTab] = useState('all');
      const [clientId, setClientId] = useState('');
      const [q, setQ] = useState('');
      const [rows, setRows] = useState(null);
      const [err, setErr] = useState(null);
      const [showNew, setShowNew] = useState(!!startNew);
      const [menu, setMenu] = useState(null);
      useEffect(() => { if (startNew) setShowNew(true); }, [startNew]);

      const load = useCallback(async () => {
        try {
          const filter = { limit: 300 };
          if (tab === 'mine') filter.mine = true;
          if (tab === 'fav') filter.favorites = true;
          if (tab === 'archived') filter.archived = true;
          if (clientId === '__agency') filter.agency_only = true; else if (clientId) filter.client_id = clientId;
          if (q.trim()) filter.search = q.trim();
          setRows(arr(await WhiteboardAPI.list(filter)));
          setErr(null);
        } catch (e) { setErr(e); setRows([]); }
      }, [tab, clientId, q]);
      useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

      const act = async (fn, msg) => { try { await fn(); if (msg) showToast && showToast(msg); load(); } catch (e) { showToast && showToast(errText(e)); } };

      if (err && isMissingRpc(err)) {
        return h`<div class="wb"><div class="wb-hub">
          <${EmptyState} icon="ti-database-off" title="Whiteboards aren’t set up yet"
            sub="An admin needs to apply migration 104 (whiteboards + storage bucket) in Supabase."/>
        </div></div>`;
      }
      return h`<div class="wb"><div class="wb-hub">
        <div style=${{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style=${{ flex: 1, minWidth: 180 }}>
            <h1 class="wb-h1">Whiteboards</h1>
            <div class="wb-sub">Brainstorms, flows and campaign maps — per client or for the agency.</div>
          </div>
          <button type="button" class="wb-btn pri" onClick=${() => setShowNew(true)}><i class="ti ti-plus"></i>New board</button>
        </div>
        <div class="wb-bar">
          <div class="wb-tabs" role="tablist">
            ${[['all', 'All'], ['mine', 'My boards'], ['fav', 'Favorites'], ['archived', 'Archived']].map(([k, l]) =>
              h`<button key=${k} type="button" role="tab" aria-selected=${tab === k} class=${'wb-tab' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}>${l}</button>`)}
          </div>
          <select class="wb-in" style=${{ width: 'auto', minWidth: 140 }} value=${clientId} onChange=${e => setClientId(e.target.value)} aria-label="Filter by space">
            <option value="">All spaces</option>
            <option value="__agency">Agency only</option>
            ${arr(clients).map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
          </select>
          <div style=${{ position: 'relative', flex: '1 1 180px', maxWidth: 280 }}>
            <input class="wb-in" style=${{ paddingLeft: 30 }} value=${q} placeholder="Search boards…" aria-label="Search boards" onInput=${e => setQ(e.target.value)}/>
            <i class="ti ti-search" style=${{ position: 'absolute', left: 9, top: 8, color: 'var(--cu-t3,#8e8e99)', fontSize: 14 }}></i>
          </div>
        </div>

        ${rows === null ? h`<div class="wb-grid">${[0, 1, 2, 3].map(i => h`<${Skel} key=${i} h=${180}/>`)}</div>`
          : !rows.length ? h`<${EmptyState} icon="ti-chalkboard" title=${q || clientId || tab !== 'all' ? 'No boards match' : 'No whiteboards yet'}
              sub=${q || clientId || tab !== 'all' ? 'Try a different filter.' : 'Create one for a brainstorm, a campaign flow or a content wall.'}
              action=${h`<button type="button" class="wb-btn pri" onClick=${() => setShowNew(true)}><i class="ti ti-plus"></i>New board</button>`}/>`
            : h`<div class="wb-grid">
              ${rows.map(b => h`<div key=${b.id} style=${{ position: 'relative' }}>
                <button type="button" class="wb-card" onClick=${() => onOpen(b.id)} aria-label=${'Open ' + b.title}>
                  <div class="wb-thumb">
                    ${b.thumb ? h`<img src=${b.thumb} alt="" loading="lazy"/>` : h`<i class="ti ti-chalkboard"></i>`}
                  </div>
                  <div class="wb-card-b">
                    <div class="wb-card-t">${b.title}</div>
                    <div class="wb-meta">
                      ${b.is_private ? h`<i class="ti ti-lock" title="Private"></i>` : null}
                      <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${b.client_name || 'Agency'}</span>
                      <span>·</span><span>${b.element_count || 0} items</span>
                    </div>
                    <div class="wb-meta">Updated ${fmtRelative ? fmtRelative(b.updated_at) : new Date(b.updated_at).toLocaleDateString('en-IN')}${b.updated_by_name ? ' · ' + b.updated_by_name : ''}</div>
                  </div>
                </button>
                <button type="button" class="wb-ibtn wb-star" aria-label=${b.is_favorite ? 'Unfavorite' : 'Favorite'}
                  onClick=${() => act(() => TaskAPI.favoriteToggle('whiteboard', b.id, b.title, location.origin + location.pathname + '#/whiteboards/' + b.id))}>
                  <i class=${'ti ' + (b.is_favorite ? 'ti-star-filled' : 'ti-star')} style=${b.is_favorite ? { color: '#f5a623' } : null}></i>
                </button>
                <button type="button" class="wb-ibtn" style=${{ position: 'absolute', top: 7, right: 40, background: 'rgba(255,255,255,.92)', borderRadius: 6 }}
                  aria-label="Board menu" onClick=${e => setMenu({ el: e.currentTarget, b })}><i class="ti ti-dots"></i></button>
              </div>`)}
            </div>`}

        <${Popover} anchor=${menu && menu.el} open=${!!menu} onClose=${() => setMenu(null)} placement="bottom-end">
          ${menu ? h`<${Menu} onClose=${() => setMenu(null)} items=${[
            { key: 'open', label: 'Open', icon: 'ti-arrow-up-right', onSelect: () => onOpen(menu.b.id) },
            { key: 'dup', label: 'Duplicate', icon: 'ti-copy', onSelect: () => act(() => WhiteboardAPI.duplicate(menu.b.id), 'Board duplicated') },
            { key: 'arch', label: menu.b.archived_at ? 'Unarchive' : 'Archive', icon: 'ti-archive',
              onSelect: () => act(() => WhiteboardAPI.update(menu.b.id, { archived: !menu.b.archived_at }), menu.b.archived_at ? 'Board restored' : 'Board archived') },
            { divider: true, key: 'd' },
            { key: 'del', label: 'Delete', icon: 'ti-trash', danger: true, disabled: !menu.b.can_delete,
              onSelect: () => { if (window.confirm('Delete "' + menu.b.title + '"?')) act(() => WhiteboardAPI.remove(menu.b.id), 'Board deleted'); } },
          ]}/>` : null}
        <//>

        ${showNew ? h`<${NewBoardModal} clients=${clients} defaultClientId=${clientId && clientId !== '__agency' ? clientId : ''} showToast=${showToast}
          onClose=${() => { setShowNew(false); onNewHandled && onNewHandled(); }}
          onCreated=${(b) => { setShowNew(false); onNewHandled && onNewHandled(); onOpen(b.id); }}/>` : null}
      </div></div>`;
    }

    // =========================================================================
    // Page + view renderer + registrations
    // =========================================================================
    function WhiteboardsPage({ currentUser, clients, showToast, params }) {
      const store = useTaskStore();
      const p = arr(params);
      const id = p[0] && p[0] !== 'new' ? p[0] : null;
      const [startNew, setStartNew] = useState(p[0] === 'new');
      useEffect(() => { setStartNew(p[0] === 'new'); }, [p[0]]);
      const go = (path) => { try { location.hash = '#/whiteboards' + (path ? '/' + path : ''); } catch (_) { } };
      if (store && store.featureOn && store.featureOn('whiteboards') === false) {
        return h`<div class="wb"><div class="wb-hub">
          <${EmptyState} icon="ti-chalkboard-off" title="Whiteboards are turned off"
            sub="An admin can switch them back on in Settings → Work schedule & ClickApps."/>
        </div></div>`;
      }
      if (id) return h`<${WhiteboardEditor} boardId=${id} currentUser=${currentUser} showToast=${showToast} onBack=${() => go('')}/>`;
      return h`<${WhiteboardsHub} currentUser=${currentUser} clients=${clients} showToast=${showToast}
        startNew=${startNew} onNewHandled=${() => { if (p[0] === 'new') go(''); }} onOpen=${(bid) => go(bid)}/>`;
    }

    // views registry: a board pinned inside any list/client view
    function WhiteboardViewRenderer({ scope, config, setConfig, currentUser, showToast }) {
      const cfg = config || {};
      const [rows, setRows] = useState(null);
      const [err, setErr] = useState(null);
      const [busy, setBusy] = useState(false);
      const clientId = (scope && scope.clientId) || null;
      const load = useCallback(async () => {
        try {
          const f = { limit: 100 };
          if (clientId) f.client_id = clientId; else f.agency_only = true;
          setRows(arr(await WhiteboardAPI.list(f))); setErr(null);
        } catch (e) { setErr(e); setRows([]); }
      }, [clientId]);
      useEffect(() => { if (!cfg.board_id) load(); }, [load, cfg.board_id]);

      if (cfg.board_id) {
        return h`<${WhiteboardEditor} boardId=${cfg.board_id} currentUser=${currentUser} showToast=${showToast} embedded=${true}
          onBack=${() => setConfig && setConfig({ board_id: null })}/>`;
      }
      if (err && isMissingRpc(err)) {
        return h`<div class="wb"><div class="wb-hub"><${EmptyState} icon="ti-database-off" title="Whiteboards aren’t set up yet"
          sub="An admin needs to apply migration 104 in Supabase."/></div></div>`;
      }
      const create = async () => {
        setBusy(true);
        try {
          const b = await WhiteboardAPI.create({ title: (scope && scope.title ? scope.title + ' board' : 'Untitled board'), client_id: clientId });
          setConfig && setConfig({ board_id: b.id });
        } catch (e) { showToast && showToast(errText(e)); }
        finally { setBusy(false); }
      };
      return h`<div class="wb"><div class="wb-hub">
        <div style=${{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <strong style=${{ flex: 1 }}>Pick a board for this view</strong>
          <button type="button" class="wb-btn pri" disabled=${busy} onClick=${create}><i class="ti ti-plus"></i>New board</button>
        </div>
        ${rows === null ? h`<${Skel} h=${140}/>`
          : !rows.length ? h`<div style=${{ fontSize: 13, color: 'var(--cu-t3,#8e8e99)' }}>No boards in this space yet — create one and it stays pinned to this view.</div>`
            : h`<div class="wb-grid">
              ${rows.map(b => h`<button key=${b.id} type="button" class="wb-card" onClick=${() => setConfig && setConfig({ board_id: b.id })}>
                <div class="wb-thumb">${b.thumb ? h`<img src=${b.thumb} alt="" loading="lazy"/>` : h`<i class="ti ti-chalkboard"></i>`}</div>
                <div class="wb-card-b"><div class="wb-card-t">${b.title}</div>
                  <div class="wb-meta">${b.element_count || 0} items · ${fmtRelative ? fmtRelative(b.updated_at) : ''}</div></div>
              </button>`)}
            </div>`}
      </div></div>`;
    }

    const staffRole = (r) => !!r && r !== 'client';
    reg('pages', {
      id: 'whiteboards', label: 'Whiteboards', icon: 'ti-chalkboard', section: 'more', order: 66,
      apps: ['dashboard', 'tasks'], roles: staffRole, fullHeight: true, Component: WhiteboardsPage,
    });
    reg('views', {
      key: 'whiteboard', label: 'Whiteboard', icon: 'ti-chalkboard',
      desc: 'A board pinned to this view', Component: WhiteboardViewRenderer,
    });
    reg('createItems', {
      key: 'whiteboard', label: 'Whiteboard', icon: 'ti-chalkboard', order: 74, roles: staffRole,
      run: ({ onNavigate }) => { try { location.hash = '#/whiteboards/new'; } catch (_) { } if (onNavigate) onNavigate('whiteboards'); },
    });
    let palCache = { at: 0, rows: [] };
    reg('paletteProviders', {
      id: 'whiteboards', label: 'Whiteboards', icon: 'ti-chalkboard', roles: staffRole,
      search: async (q) => {
        try {
          if (Date.now() - palCache.at > 60000) palCache = { at: Date.now(), rows: arr(await WhiteboardAPI.list({ limit: 60 })) };
          const s = String(q || '').trim().toLowerCase();
          return palCache.rows
            .filter(b => !s || String(b.title || '').toLowerCase().includes(s))
            .slice(0, 8)
            .map(b => ({
              id: 'wb:' + b.id, label: b.title, icon: 'ti-chalkboard',
              sub: [(b.client_name || 'Agency'), (b.element_count || 0) + ' items'].join(' · '),
              run: () => { location.hash = '#/whiteboards/' + b.id; },
            }));
        } catch (_) { return []; }
      },
    });

    return { WhiteboardsPage, WhiteboardEditor, WhiteboardViewRenderer, WhiteboardAPI };
  }

  window.AMS_WHITEBOARDS = { buildWhiteboards };
})();

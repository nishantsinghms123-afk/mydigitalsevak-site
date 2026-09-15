/* ============================================================================
 * shell.js — ClickUp-parity app chrome (icon rail, context sidebar, top bar,
 * create menu, ⌘K command palette, profile menu, keyboard shortcuts, theme).
 *
 *   window.AMS_SHELL.buildShell(deps) → {
 *     IconRail, SideNav, SideNavItem, SideNavGroup, SpacesTree, TopBar,
 *     CreateMenu, CreateButton, CommandPalette, ProfileMenu, ShortcutsModal,
 *     useGlobalShortcuts, useThemeMode
 *   }
 *
 * Contract: docs/clickup-parity-contract.md §6.4 (design language §1, shapes §4,
 * RPCs §5, tasks.js atoms §6.1). Built from index.html's shared bridge (single
 * React instance, hooks-safe — same pattern as messages.js / client_portal.js).
 *
 * deps: React, h, useState, useEffect, useRef, useCallback, useMemo, rpcCall,
 *       Av, APP_VERSION, (ThemeToggle — optional, unused) + tasks.js exports:
 *       TaskAPI, taskBus, useTaskStore, openTask, openCreateTask, Popover, Menu,
 *       MemberAvatar, ClientBadge, TypeIcon, EmptyState.
 * Every tasks.js atom is optional at runtime — local fallbacks keep the shell
 * rendering if tasks.js failed to load.
 * ==========================================================================*/
(function () {
  function buildShell(deps) {
    const { React, h, useState, useEffect, useRef, useCallback, useMemo,
            Av, APP_VERSION, TaskAPI, useTaskStore, openTask, openCreateTask,
            Popover, MemberAvatar, TypeIcon } = deps;

    // ---- one-time styles ---------------------------------------------------
    // Private --cs-* aliases resolve the global --cu-* tokens with light/dark
    // fallbacks, so the shell renders correctly even before tokens ship.
    if (!document.getElementById('ams-shell-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-shell-styles';
      st.textContent = `
      :root{--cs-bg:var(--cu-bg,#ffffff);--cs-bg2:var(--cu-bg2,#f7f7f8);--cs-bg3:var(--cu-bg3,#efeff1);--cs-bd:var(--cu-bd,#e8e8eb);--cs-bd2:var(--cu-bd2,#d6d6db);
        --cs-t1:var(--cu-t1,#1f1f23);--cs-t2:var(--cu-t2,#5c5c66);--cs-t3:var(--cu-t3,#8e8e99);--cs-accent:var(--cu-accent,#ff00ee);--cs-accent-ink:var(--cu-accent-ink,#a8009c);
        --cs-fog:var(--cu-accent-fog,rgba(255,0,238,.08));--cs-rail:var(--cu-rail,#121014);--cs-shadow:var(--cu-shadow,0 8px 28px rgba(15,15,20,.14),0 2px 6px rgba(15,15,20,.06));
        --cs-radius:var(--cu-radius,8px);--cs-radius-sm:var(--cu-radius-sm,6px)}
      html.dark{--cs-bg:var(--cu-bg,#1c1b1f);--cs-bg2:var(--cu-bg2,#161518);--cs-bg3:var(--cu-bg3,#26252a);--cs-bd:var(--cu-bd,#2d2c31);--cs-bd2:var(--cu-bd2,#3b3a40);
        --cs-t1:var(--cu-t1,#ececef);--cs-t2:var(--cu-t2,#a9a8b1);--cs-t3:var(--cu-t3,#75747d);--cs-accent:var(--cu-accent,#ff66f5);--cs-accent-ink:var(--cu-accent-ink,#ff7df6);
        --cs-fog:var(--cu-accent-fog,rgba(255,102,245,.12));--cs-rail:var(--cu-rail,#0b0a0d);--cs-shadow:var(--cu-shadow,0 10px 30px rgba(0,0,0,.55))}
      [class^="cs-"],[class*=" cs-"]{font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;box-sizing:border-box}
      [class^="cs-"]:focus-visible,[class*=" cs-"]:focus-visible{outline:2px solid var(--cs-accent);outline-offset:1px}
      .cs-ibtn{width:26px;height:26px;border-radius:var(--cs-radius-sm);border:0;background:transparent;color:var(--cs-t2);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;padding:0;flex-shrink:0}
      .cs-ibtn:hover{background:var(--cs-bg3);color:var(--cs-t1)}
      .cs-kbd{font:600 11px/1 Inter,system-ui,sans-serif;min-width:18px;height:20px;padding:0 5px;border-radius:4px;border:1px solid var(--cs-bd2);border-bottom-width:2px;background:var(--cs-bg);color:var(--cs-t2);display:inline-flex;align-items:center;justify-content:center;white-space:nowrap}

      /* ── Icon rail ── */
      .cs-rail{width:64px;flex:0 0 64px;height:100%;background:var(--cs-rail);display:flex;flex-direction:column;align-items:center;padding:10px 0 10px;gap:2px;overflow-y:auto;overflow-x:hidden;scrollbar-width:none}
      .cs-rail::-webkit-scrollbar{display:none}
      .cs-rail-mark{width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,#FF66F5 0%,#A8009C 100%);color:#fff;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center;border:0;cursor:pointer;margin:2px 0 12px;flex-shrink:0;padding:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.3)}
      .cs-rail-it{width:52px;height:52px;min-height:52px;border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:rgba(255,255,255,.6);background:transparent;border:0;cursor:pointer;position:relative;padding:0;transition:background .12s,color .12s}
      .cs-rail-it i{font-size:20px;line-height:1}
      .cs-rail-it .lb{font-size:10px;font-weight:500;line-height:1.1;max-width:50px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cs-rail-it:hover{color:#fff;background:rgba(255,255,255,.08)}
      .cs-rail-it.on{color:#fff;background:rgba(255,0,238,.28)}
      .cs-rail-badge{position:absolute;top:4px;right:5px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#ff00ee;color:#fff;font-size:9.5px;font-weight:700;line-height:12px;display:flex;align-items:center;justify-content:center;border:2px solid var(--cs-rail);font-variant-numeric:tabular-nums}
      .cs-rail-dot{position:absolute;top:9px;right:13px;width:8px;height:8px;border-radius:50%;background:#ff00ee;border:2px solid var(--cs-rail)}
      .cs-rail-sp{flex:1;min-height:8px}
      .cs-rail-av{width:52px;height:48px;display:flex;align-items:center;justify-content:center;border:0;background:transparent;padding:0;border-radius:10px;cursor:pointer;margin-top:4px;flex-shrink:0}
      .cs-rail-av:hover{background:rgba(255,255,255,.08)}
      @media(max-width:960px){.cs-rail{display:none}}

      /* ── Side nav ── */
      .cs-sn{width:248px;flex:0 0 auto;height:100%;background:var(--cs-bg2);border-right:1px solid var(--cs-bd);display:flex;flex-direction:column;min-height:0;color:var(--cs-t1)}
      .cs-sn-hd{height:48px;flex:0 0 48px;display:flex;align-items:center;gap:2px;padding:0 8px 0 16px}
      .cs-sn-title{font-size:15px;font-weight:600;color:var(--cs-t1);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cs-sn-body{flex:1;overflow-y:auto;min-height:0;padding:2px 8px 16px}
      .cs-sng{margin-top:10px}
      .cs-sng:first-child{margin-top:2px}
      .cs-sng-hd{display:flex;align-items:center;gap:4px;height:26px;padding:0 2px 0 6px;border-radius:var(--cs-radius-sm);color:var(--cs-t3);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;user-select:none;background:transparent;border:0;width:100%;text-align:left}
      .cs-sng-hd.clk{cursor:pointer}
      .cs-sng-hd.clk:hover{background:var(--cs-bg3);color:var(--cs-t2)}
      .cs-sng-hd .lbt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cs-sng-hd .chev{font-size:12px;transition:transform .15s}
      .cs-sng-hd .chev.shut{transform:rotate(-90deg)}
      .cs-sng-act{opacity:0;width:22px;height:22px;font-size:14px}
      .cs-sng-hd:hover .cs-sng-act,.cs-sng-hd:focus-within .cs-sng-act{opacity:1}
      .cs-sni{display:flex;align-items:center;gap:8px;height:30px;padding:0 4px 0 calc(8px + var(--cs-ind,0) * 12px);border-radius:var(--cs-radius-sm);color:var(--cs-t2);font-size:13px;cursor:pointer;position:relative;user-select:none;margin:1px 0}
      .cs-sni:hover{background:var(--cs-bg3);color:var(--cs-t1)}
      .cs-sni.on{background:var(--cs-fog);color:var(--cs-t1);font-weight:500}
      .cs-sni.on>.ic{color:var(--cs-accent-ink)}
      .cs-sni.muted>.lb{color:var(--cs-t3)}
      .cs-sni>.ic{font-size:14px;width:16px;text-align:center;flex-shrink:0;line-height:1}
      .cs-sni>.av{flex-shrink:0;display:flex;align-items:center}
      .cs-sni>.lb{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cs-sni>.ct{font-size:12px;color:var(--cs-t3);font-variant-numeric:tabular-nums;padding:0 4px;flex-shrink:0}
      .cs-sni>.rt{display:none;align-items:center;gap:1px;flex-shrink:0}
      .cs-sni:hover>.rt,.cs-sni:focus-within>.rt{display:flex}
      .cs-sni.has-rt:hover>.ct,.cs-sni.has-rt:focus-within>.ct{display:none}
      .cs-sni>.rt .cs-ibtn{width:22px;height:22px;font-size:14px}
      .cs-sni>.rt .cs-ibtn:hover{background:var(--cs-bd)}
      .cs-sni-chev{width:16px;height:16px;margin-left:-4px;border:0;background:transparent;color:var(--cs-t3);display:inline-flex;align-items:center;justify-content:center;border-radius:4px;cursor:pointer;padding:0;flex-shrink:0;font-size:12px}
      .cs-sni-chev:hover{background:var(--cs-bd);color:var(--cs-t1)}
      .cs-sni-chev i{transition:transform .15s}
      .cs-sni-chev.shut i{transform:rotate(-90deg)}
      @media(hover:none){.cs-sni>.rt{display:flex}.cs-sni.has-rt>.ct{display:none}.cs-sng-act{opacity:1}}
      .cs-sp-filter{position:relative;margin:4px 0 4px}
      .cs-sp-filter i{position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:13px;color:var(--cs-t3)}
      .cs-sp-filter input{width:100%;height:28px;border:1px solid var(--cs-bd);border-radius:var(--cs-radius-sm);background:var(--cs-bg);color:var(--cs-t1);font-size:12.5px;padding:0 8px 0 26px;outline:none}
      .cs-sp-filter input:focus{border-color:var(--cs-accent)}
      .cs-sp-empty{font-size:12px;color:var(--cs-t3);padding:6px 10px 6px calc(8px + var(--cs-ind,0) * 12px + 24px)}

      /* ── Top bar ── */
      .cs-top{height:48px;flex:0 0 48px;display:flex;align-items:center;gap:12px;padding:0 12px 0 16px;background:var(--cs-bg);border-bottom:1px solid var(--cs-bd);color:var(--cs-t1)}
      .cs-top-l{flex:1 1 0;min-width:0;display:flex;align-items:center;gap:4px}
      .cs-top-c{flex:0 1 auto;display:flex;justify-content:center;min-width:0}
      .cs-top-r{flex:1 1 0;min-width:0;display:flex;justify-content:flex-end;align-items:center;gap:6px}
      .cs-top-menu{display:none;margin-right:4px;width:32px;height:32px;font-size:18px}
      .cs-crumbs{display:flex;align-items:center;min-width:0;gap:2px;overflow:hidden}
      .cs-crumb{font-size:13px;color:var(--cs-t2);background:none;border:0;padding:3px 6px;border-radius:5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;min-width:0;font-family:inherit}
      .cs-crumb:hover{background:var(--cs-bg3);color:var(--cs-t1)}
      .cs-crumb.last{color:var(--cs-t1);font-weight:600;cursor:default;flex-shrink:1}
      .cs-crumb.last:hover{background:none}
      .cs-crumb-sep{font-size:12px;color:var(--cs-t3);flex-shrink:0}
      .cs-search{min-width:260px;height:32px;border-radius:8px;background:var(--cs-bg3);border:1px solid transparent;color:var(--cs-t3);display:flex;align-items:center;gap:8px;padding:0 6px 0 10px;font-size:13px;cursor:pointer;font-family:inherit}
      .cs-search:hover{border-color:var(--cs-bd2);color:var(--cs-t2)}
      .cs-search>i{font-size:15px}
      .cs-search>.tx{flex:1;text-align:left}
      @media(max-width:960px){.cs-top-menu{display:inline-flex}}
      @media(max-width:760px){.cs-search{min-width:0;width:32px;padding:0;justify-content:center}.cs-search>.tx,.cs-search>.cs-kbd{display:none}.cs-top{gap:6px;padding:0 8px}.cs-crumb{max-width:130px}}

      /* ── Menus / popover content ── */
      .cs-pop{position:fixed;z-index:1100;background:var(--cs-bg);border:1px solid var(--cs-bd);border-radius:var(--cs-radius);box-shadow:var(--cs-shadow);color:var(--cs-t1);max-height:calc(100vh - 16px);overflow-y:auto;animation:csPop .12s ease-out}
      .cs-menu{padding:6px;color:var(--cs-t1)}
      .cs-mi{display:flex;align-items:center;gap:10px;width:100%;height:32px;padding:0 10px;border:0;background:transparent;border-radius:var(--cs-radius-sm);font-size:13px;color:var(--cs-t1);cursor:pointer;text-align:left;font-family:inherit}
      .cs-mi:hover,.cs-mi:focus-visible{background:var(--cs-bg3)}
      .cs-mi:focus-visible{outline:none}
      .cs-mi>i{font-size:16px;color:var(--cs-t2);width:18px;text-align:center;flex-shrink:0}
      .cs-mi>.ml{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cs-mi>.hint{margin-left:auto;font-size:11px;color:var(--cs-t3);white-space:nowrap}
      .cs-mi>.soon{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cs-t3);background:var(--cs-bg3);border-radius:4px;padding:2px 5px}
      .cs-mi[disabled]{opacity:.55;cursor:default}
      .cs-mi[disabled]:hover{background:transparent}
      .cs-mi.danger,.cs-mi.danger>i{color:#e5484d}
      .cs-mi.sub{padding-left:38px;height:30px}
      .cs-mi.sel>.ml{font-weight:600}
      .cs-msec{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cs-t3);padding:8px 10px 4px}
      .cs-mdiv{height:1px;background:var(--cs-bd);margin:6px -6px}
      .cs-cm-in{position:relative;padding:2px 0 4px}
      .cs-cm-in>i{position:absolute;left:10px;top:50%;transform:translateY(-55%);font-size:15px;color:var(--cs-accent)}
      .cs-in{width:100%;height:34px;border:1px solid var(--cs-bd2);border-radius:var(--cs-radius-sm);padding:0 10px;font-size:13px;background:var(--cs-bg);color:var(--cs-t1);outline:none;font-family:inherit}
      .cs-in::placeholder{color:var(--cs-t3)}
      .cs-in:focus{border-color:var(--cs-accent);box-shadow:0 0 0 3px rgba(255,0,238,.12)}
      .cs-cm-in .cs-in{padding-left:32px}

      /* ── Command palette + modals ── */
      .cs-back{position:fixed;inset:0;z-index:1200;background:rgba(15,15,20,.42);display:flex;justify-content:center;align-items:flex-start;padding:12vh 16px 16px;animation:csFade .12s ease-out}
      html.dark .cs-back{background:rgba(0,0,0,.6)}
      .cs-pal{width:640px;max-width:100%;max-height:min(580px,78vh);background:var(--cs-bg);border:1px solid var(--cs-bd);border-radius:12px;box-shadow:var(--cs-shadow);display:flex;flex-direction:column;overflow:hidden;color:var(--cs-t1);animation:csPop .14s ease-out}
      .cs-pal-in{display:flex;align-items:center;gap:10px;padding:0 16px;height:52px;flex:0 0 52px;border-bottom:1px solid var(--cs-bd)}
      .cs-pal-in>i{font-size:18px;color:var(--cs-t3)}
      .cs-pal-in input{flex:1;min-width:0;border:0;outline:none;background:transparent;font-size:15px;color:var(--cs-t1);font-family:inherit;height:100%}
      .cs-pal-in input::placeholder{color:var(--cs-t3)}
      .cs-spin{animation:csSpin .8s linear infinite;color:var(--cs-t3);font-size:16px}
      .cs-chips{display:flex;gap:6px;padding:8px 14px;border-bottom:1px solid var(--cs-bd);overflow-x:auto;flex-shrink:0;scrollbar-width:none}
      .cs-chip{height:26px;padding:0 11px;border-radius:13px;border:1px solid var(--cs-bd);background:var(--cs-bg);color:var(--cs-t2);font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;font-family:inherit;display:inline-flex;align-items:center;gap:5px}
      .cs-chip:hover{border-color:var(--cs-bd2);color:var(--cs-t1)}
      .cs-chip.on{background:var(--cs-fog);border-color:var(--cs-accent);color:var(--cs-accent-ink)}
      .cs-pal-list{flex:1;overflow-y:auto;padding:4px 6px 8px;min-height:60px}
      .cs-pal-sec{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cs-t3);padding:10px 10px 4px}
      .cs-pr{display:flex;align-items:center;gap:10px;min-height:38px;padding:4px 10px;border-radius:var(--cs-radius-sm);cursor:pointer}
      .cs-pr.on{background:var(--cs-bg3)}
      .cs-pr>.ico{width:22px;height:22px;display:flex;align-items:center;justify-content:center;color:var(--cs-t2);font-size:16px;flex-shrink:0}
      .cs-pr>.bd{flex:1;min-width:0;display:flex;align-items:center;gap:10px}
      .cs-pr .pt{font-size:13px;color:var(--cs-t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto}
      .cs-pr .meta{font-size:12px;color:var(--cs-t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px;min-width:0;flex:0 1 auto}
      .cs-pr .cid{font-size:11px;color:var(--cs-t3);font-variant-numeric:tabular-nums;flex-shrink:0}
      .cs-pr>.ent{font-size:13px;color:var(--cs-t3);margin-left:auto;visibility:hidden;flex-shrink:0;padding-left:6px}
      .cs-pr.on>.ent{visibility:visible}
      .cs-pr>.hint{font-size:11px;color:var(--cs-t3);flex-shrink:0}
      .cs-pill{font-size:10.5px;font-weight:600;text-transform:uppercase;padding:1px 6px;border-radius:4px;letter-spacing:.02em;white-space:nowrap;flex-shrink:0}
      .cs-mark{background:rgba(255,0,238,.16);color:inherit;border-radius:2px;padding:0 1px;font-weight:600}
      html.dark .cs-mark{background:rgba(255,102,245,.24)}
      .cs-pal-empty{padding:28px 16px;text-align:center;color:var(--cs-t3);font-size:13px}
      .cs-pal-empty i{display:block;font-size:26px;margin-bottom:6px}
      .cs-pal-ft{height:34px;flex:0 0 34px;border-top:1px solid var(--cs-bd);background:var(--cs-bg2);display:flex;align-items:center;gap:14px;padding:0 14px;font-size:11.5px;color:var(--cs-t3);white-space:nowrap;overflow:hidden}
      @media(max-width:640px){.cs-back{padding:0}.cs-pal{max-height:none;height:100%;border-radius:0;width:100%;border:0}.cs-pal-ft{display:none}}

      /* ── Profile menu ── */
      .cs-pm{padding:6px;color:var(--cs-t1)}
      .cs-pm-hd{display:flex;gap:10px;padding:8px 8px 10px;align-items:center}
      .cs-pm-nm{font-size:14px;font-weight:600;color:var(--cs-t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cs-pm-role{font-size:12px;color:var(--cs-t2)}
      .cs-pm-pres{font-size:12px;color:var(--cs-t3);display:flex;align-items:center;gap:5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cs-pm-dot{width:8px;height:8px;border-radius:50%;background:#30a46c;flex-shrink:0}
      .cs-pm-dot.dnd{background:#e5484d}
      .cs-pm-ed{padding:8px 8px 10px;background:var(--cs-bg2);border-radius:var(--cs-radius-sm);margin:2px 0 4px}
      .cs-emos{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap}
      .cs-emo{width:30px;height:30px;border-radius:var(--cs-radius-sm);border:1px solid transparent;background:var(--cs-bg);font-size:16px;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center}
      .cs-emo:hover{background:var(--cs-bg3)}
      .cs-emo.on{border-color:var(--cs-accent);background:var(--cs-fog)}
      .cs-lbl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cs-t3);margin:8px 0 5px}
      .cs-opts{display:flex;gap:4px;flex-wrap:wrap}
      .cs-opt{height:24px;padding:0 8px;border-radius:12px;border:1px solid var(--cs-bd);background:var(--cs-bg);color:var(--cs-t2);font-size:11.5px;cursor:pointer;font-family:inherit}
      .cs-opt:hover{border-color:var(--cs-bd2);color:var(--cs-t1)}
      .cs-opt.on{border-color:var(--cs-accent);color:var(--cs-accent-ink);background:var(--cs-fog)}
      .cs-row{display:flex;gap:6px;justify-content:flex-end;margin-top:10px}
      .cs-btn{height:28px;padding:0 12px;border-radius:var(--cs-radius-sm);font-size:12.5px;font-weight:600;cursor:pointer;border:1px solid var(--cs-bd);background:var(--cs-bg);color:var(--cs-t1);font-family:inherit}
      .cs-btn:hover{background:var(--cs-bg3)}
      .cs-btn.pri{background:var(--cs-accent);border-color:var(--cs-accent);color:#fff}
      .cs-btn.pri:hover{filter:brightness(.95)}
      .cs-btn[disabled]{opacity:.55;cursor:default}
      .cs-err{font-size:12px;color:#e5484d;margin-top:6px}
      .cs-seg{display:flex;background:var(--cs-bg3);border-radius:var(--cs-radius-sm);padding:2px;gap:2px;margin:2px 0 4px}
      .cs-seg button{flex:1;height:26px;border:0;border-radius:5px;background:transparent;color:var(--cs-t2);font-size:12px;font-weight:500;cursor:pointer;display:flex;gap:5px;justify-content:center;align-items:center;font-family:inherit}
      .cs-seg button:hover{color:var(--cs-t1)}
      .cs-seg button.on{background:var(--cs-bg);color:var(--cs-t1);box-shadow:0 1px 2px rgba(0,0,0,.12)}
      .cs-pm-ver{font-size:11px;color:var(--cs-t3);padding:6px 10px 2px;letter-spacing:.03em}

      /* ── Shortcuts modal ── */
      .cs-sc{width:720px;max-width:100%;max-height:80vh;background:var(--cs-bg);border:1px solid var(--cs-bd);border-radius:12px;box-shadow:var(--cs-shadow);display:flex;flex-direction:column;overflow:hidden;color:var(--cs-t1);animation:csPop .14s ease-out}
      .cs-sc-hd{display:flex;align-items:center;height:52px;padding:0 12px 0 20px;border-bottom:1px solid var(--cs-bd);flex-shrink:0}
      .cs-sc-hd h2{font-size:15px;font-weight:600;margin:0;flex:1}
      .cs-sc-bd{overflow-y:auto;padding:8px 20px 20px;display:grid;grid-template-columns:1fr 1fr;gap:0 32px}
      .cs-sc-grp h3{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--cs-t3);margin:16px 0 6px}
      .cs-sc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:32px;border-bottom:1px solid var(--cs-bd);font-size:13px;color:var(--cs-t2)}
      .cs-sc-keys{display:flex;gap:4px;align-items:center;flex-shrink:0;font-size:11px;color:var(--cs-t3)}
      @media(max-width:640px){.cs-sc-bd{grid-template-columns:1fr}.cs-back.cs-back-sc{padding:16px}}

      @keyframes csFade{from{opacity:0}to{opacity:1}}
      @keyframes csPop{from{opacity:0;transform:translateY(-4px) scale(.985)}to{opacity:1;transform:none}}
      @keyframes csSpin{to{transform:rotate(360deg)}}
      @media (prefers-reduced-motion: reduce){[class^="cs-"],[class*=" cs-"]{animation:none!important;transition:none!important}.cs-spin{animation:none!important}}
      `;
      document.head.appendChild(st);
    }

    // ---- small helpers -----------------------------------------------------
    const IS_MAC = /Mac|iPhone|iPad|iPod/i.test((navigator.platform || '') + ' ' + (navigator.userAgent || ''));
    const MOD = IS_MAC ? '⌘' : 'Ctrl';
    const ALT = IS_MAC ? '⌥' : 'Alt+';
    const K_RECENT = 'ams_recent_items';
    const K_SPACES = 'ams_spaces_open';
    const K_STATUS_EXP = 'ams_status_expiry';
    const K_STATUS_DND = 'ams_status_dnd';

    const lsGet = (k, fb) => { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } };
    const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const initialsOf = (name) => String(name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' });
    const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', accounts_head: 'Accounts head', seo: 'SEO', editor: 'Editor', designer: 'Designer', client: 'Client' };
    const roleLabel = (r) => ROLE_LABEL[r] || (r ? String(r).replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : '');
    const isFuture = (iso) => !!iso && new Date(iso).getTime() > Date.now();
    const fmtClock = (iso) => {
      const d = new Date(iso), n = new Date();
      const t = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
      if (d.toDateString() === n.toDateString()) return t;
      const tm = new Date(n); tm.setDate(n.getDate() + 1);
      if (d.toDateString() === tm.toDateString()) return 'tomorrow ' + t;
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + t;
    };
    const tokTail = () => { try { return (localStorage.getItem('ams_session_token') || '').slice(-12); } catch (e) { return ''; } };

    // useTaskStore is a context hook; never let a missing provider crash chrome.
    const useStoreSafe = typeof useTaskStore === 'function'
      ? function () { try { return useTaskStore() || null; } catch (e) { return null; } }
      : function () { return null; };

    // Remember the element focused before a dialog opened; restore it on close.
    function useFocusReturn(open, focusRef) {
      useEffect(() => {
        if (!open) return;
        const prev = document.activeElement;
        const t = setTimeout(() => { try { focusRef.current && focusRef.current.focus(); } catch (e) {} }, 0);
        return () => {
          clearTimeout(t);
          if (prev && typeof prev.focus === 'function' && document.contains(prev)) { try { prev.focus({ preventScroll: true }); } catch (e) {} }
        };
      }, [open]);
    }
    // Trap-lite: keep Tab inside the dialog container.
    function trapTab(e, container) {
      if (e.key !== 'Tab' || !container) return;
      const els = Array.from(container.querySelectorAll('input,button:not([disabled]),textarea,select,[tabindex]:not([tabindex="-1"])')).filter(el => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
    // Arrow-key roving focus inside a menu container.
    function menuArrows(e, container) {
      if (!container || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      const els = Array.from(container.querySelectorAll('input.cs-in,.cs-mi:not([disabled])'));
      if (!els.length) return;
      e.preventDefault();
      const i = els.indexOf(document.activeElement);
      const n = e.key === 'ArrowDown' ? (i + 1) % els.length : (i <= 0 ? els.length - 1 : i - 1);
      els[n].focus();
    }

    // Highlight the first case-insensitive match of q in text (strings only — no entities).
    function hl(text, q) {
      const s = String(text == null ? '' : text);
      const needle = String(q || '').trim();
      if (!needle) return s;
      const i = s.toLowerCase().indexOf(needle.toLowerCase());
      if (i < 0) return s;
      return [s.slice(0, i), h`<mark key="m" class="cs-mark">${s.slice(i, i + needle.length)}</mark>`, s.slice(i + needle.length)];
    }

    function PersonAvatar({ member, size = 20 }) {
      if (!member) return null;
      if (MemberAvatar) return h`<${MemberAvatar} member=${member} size=${size}/>`;
      return h`<${Av} i=${member.initials || initialsOf(member.name)} c=${member.color || '#7b68ee'} s=${size} round=${true}/>`;
    }
    function SpaceAvatar({ client, size = 20 }) {
      if (!client) return null;
      const ini = (client.initials || initialsOf(client.name)).slice(0, size < 24 ? 1 : 2);
      return h`<${Av} i=${ini} c=${client.color || client.brand_color_primary || '#8e8e99'} s=${size}/>`;
    }
    function TaskTypeIcon({ type }) {
      if (TypeIcon) return h`<${TypeIcon} type=${type || 'task'}/>`;
      const ic = { post: 'ti-photo', direct: 'ti-send', milestone: 'ti-diamond', seo_report: 'ti-trending-up', ad: 'ti-target-arrow', meeting: 'ti-users', request: 'ti-inbox' }[type] || 'ti-circle-check';
      return h`<i class=${'ti ' + ic}></i>`;
    }

    // Local popover fallback (used only if tasks.js Popover is unavailable).
    function LocalPopover({ anchor, open, onClose, placement = 'bottom-start', width = 260, children }) {
      const ref = useRef(null);
      const [pos, setPos] = useState(null);
      useEffect(() => {
        if (!open) { setPos(null); return; }
        const place = () => {
          const r = anchor ? (anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor) : { left: 16, right: 16, top: 16, bottom: 16 };
          const el = ref.current; const ht = el ? el.offsetHeight : 320;
          const vw = window.innerWidth, vh = window.innerHeight;
          let left = String(placement).endsWith('end') ? r.right - width : r.left;
          left = Math.max(8, Math.min(left, vw - width - 8));
          let top = r.bottom + 4;
          if (top + ht > vh - 8 && r.top - ht - 4 > 8) top = r.top - ht - 4;
          setPos({ left, top: Math.max(8, top) });
        };
        place();
        const raf = requestAnimationFrame(place);
        const onDown = (e) => {
          if (ref.current && ref.current.contains(e.target)) return;
          if (anchor && anchor.contains && anchor.contains(e.target)) return;
          onClose && onClose();
        };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose && onClose(); } };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', place);
        return () => { cancelAnimationFrame(raf); document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', place); };
      }, [open, anchor]);
      if (!open) return null;
      const node = h`<div ref=${ref} class="cs-pop" style=${{ width, left: pos ? pos.left : -9999, top: pos ? pos.top : -9999 }}>${children}</div>`;
      const RD = window.ReactDOM;
      return RD && RD.createPortal ? RD.createPortal(node, document.body) : node;
    }
    const Pop = Popover || LocalPopover;

    // =========================================================================
    // IconRail
    // =========================================================================
    function RailBadge({ badge }) {
      if (badge == null || badge === false || badge === 0) return null;
      if (badge === true || badge === 'dot') return h`<span class="cs-rail-dot" aria-hidden="true"></span>`;
      const n = Number(badge);
      if (!isFinite(n)) return h`<span class="cs-rail-badge">${String(badge)}</span>`;
      if (n <= 0) return null;
      return h`<span class="cs-rail-badge">${n > 99 ? '99+' : n}</span>`;
    }
    function RailItem({ it, active, onSelect }) {
      const on = active === it.id;
      const aria = it.label + (typeof it.badge === 'number' && it.badge > 0 ? ` (${it.badge})` : '');
      return h`<button type="button" class=${'cs-rail-it' + (on ? ' on' : '')} title=${it.label} aria-label=${aria} aria-current=${on ? 'page' : undefined}
          onClick=${(e) => { if (it.onClick) it.onClick(e); else onSelect && onSelect(it.id, e); }}>
        <i class=${'ti ' + (it.icon || 'ti-point')}></i>
        <span class="lb">${it.label}</span>
        <${RailBadge} badge=${it.badge}/>
      </button>`;
    }
    function IconRail({ items = [], active, onSelect, bottom = [], brandMark, brandLabel, onBrand, avatar, onAvatar, avatarLabel, className }) {
      const markIsNode = brandMark != null && typeof brandMark === 'object';
      const markText = markIsNode ? brandMark : String(brandMark || 'M').trim().slice(0, 1).toUpperCase();
      return h`<nav class=${'cs-rail' + (className ? ' ' + className : '')} aria-label="Primary">
        <button type="button" class="cs-rail-mark" title=${brandLabel || (typeof brandMark === 'string' ? brandMark : 'Workspace')} aria-label=${brandLabel || 'Workspace'} onClick=${(e) => onBrand && onBrand(e)}>${markText}</button>
        ${items.map(it => h`<${RailItem} key=${it.id} it=${it} active=${active} onSelect=${onSelect}/>`)}
        <div class="cs-rail-sp"></div>
        ${bottom.map(it => h`<${RailItem} key=${it.id} it=${it} active=${active} onSelect=${onSelect}/>`)}
        ${avatar && h`<button type="button" class="cs-rail-av" title=${avatarLabel || 'Profile'} aria-label=${avatarLabel || 'Profile'} aria-haspopup="dialog" onClick=${(e) => onAvatar && onAvatar(e)}>${avatar}</button>`}
      </nav>`;
    }

    // =========================================================================
    // SideNav / SideNavGroup / SideNavItem
    // =========================================================================
    function renderActions(actions) {
      if (!actions) return null;
      if (!Array.isArray(actions)) return actions;
      return actions.map((a, i) => (a && a.icon && !a.$$typeof)
        ? h`<button key=${a.key || a.icon || i} type="button" class="cs-ibtn" title=${a.label} aria-label=${a.label} onClick=${a.onClick}><i class=${'ti ' + a.icon}></i></button>`
        : a);
    }
    function SideNav({ title, actions, children, className, ariaLabel }) {
      return h`<aside class=${'cs-sn' + (className ? ' ' + className : '')} aria-label=${ariaLabel || title || 'Sidebar'}>
        ${(title || actions) && h`<div class="cs-sn-hd">
          <div class="cs-sn-title">${title}</div>
          ${renderActions(actions)}
        </div>`}
        <div class="cs-sn-body">${children}</div>
      </aside>`;
    }

    function SideNavGroup({ label, collapsible = true, defaultOpen = true, storageKey, action, children, className }) {
      const [open, setOpen] = useState(() => {
        if (!collapsible) return true;
        if (storageKey) { const v = lsGet(storageKey, null); if (typeof v === 'boolean') return v; }
        return defaultOpen;
      });
      const toggle = () => {
        if (!collapsible) return;
        setOpen(o => { const n = !o; if (storageKey) lsSet(storageKey, n); return n; });
      };
      let act = null;
      if (action) {
        act = (action.icon || action.onClick) && !action.$$typeof
          ? h`<button type="button" class="cs-ibtn cs-sng-act" title=${action.label || 'Add'} aria-label=${action.label || 'Add'} onClick=${(e) => { e.stopPropagation(); action.onClick && action.onClick(e); }}><i class=${'ti ' + (action.icon || 'ti-plus')}></i></button>`
          : h`<span onClick=${(e) => e.stopPropagation()}>${action}</span>`;
      }
      return h`<div class=${'cs-sng' + (className ? ' ' + className : '')}>
        <div class=${'cs-sng-hd' + (collapsible ? ' clk' : '')} role=${collapsible ? 'button' : undefined} tabIndex=${collapsible ? 0 : undefined}
             aria-expanded=${collapsible ? open : undefined} onClick=${toggle}
             onKeyDown=${(e) => { if (collapsible && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); toggle(); } }}>
          <span class="lbt">${label}</span>
          ${act}
          ${collapsible && h`<i class=${'ti ti-chevron-down chev' + (open ? '' : ' shut')} aria-hidden="true"></i>`}
        </div>
        ${open && h`<div role="group" aria-label=${typeof label === 'string' ? label : undefined}>${children}</div>`}
      </div>`;
    }

    function SideNavItem({ icon, label, count, active, onClick, indent = 0, right, avatar, muted, expanded, onToggle, title, className, iconColor }) {
      const ind = Math.max(0, Math.min(2, indent | 0));
      const hasToggle = typeof onToggle === 'function';
      const onKey = (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick && onClick(e); }
        else if (hasToggle && e.key === 'ArrowRight' && !expanded) { e.preventDefault(); onToggle(e); }
        else if (hasToggle && e.key === 'ArrowLeft' && expanded) { e.preventDefault(); onToggle(e); }
      };
      const showCount = count != null && count !== '' && count !== false;
      return h`<div class=${'cs-sni' + (active ? ' on' : '') + (muted ? ' muted' : '') + (right ? ' has-rt' : '') + (className ? ' ' + className : '')}
          style=${{ '--cs-ind': ind }} role="button" tabIndex="0" title=${title || (typeof label === 'string' ? label : undefined)}
          aria-current=${active ? 'page' : undefined} aria-expanded=${hasToggle ? !!expanded : undefined}
          onClick=${onClick} onKeyDown=${onKey}>
        ${hasToggle && h`<button type="button" tabIndex="-1" class=${'cs-sni-chev' + (expanded ? '' : ' shut')} aria-label=${expanded ? 'Collapse' : 'Expand'}
            onClick=${(e) => { e.stopPropagation(); onToggle(e); }}><i class="ti ti-chevron-down"></i></button>`}
        ${avatar ? h`<span class="av">${avatar}</span>` : icon ? h`<i class=${'ti ' + icon + ' ic'} style=${iconColor ? { color: iconColor } : undefined} aria-hidden="true"></i>` : null}
        <span class="lb">${label}</span>
        ${showCount && h`<span class="ct">${count}</span>`}
        ${right && h`<span class="rt" onClick=${(e) => e.stopPropagation()} onKeyDown=${(e) => e.stopPropagation()}>${right}</span>`}
      </div>`;
    }

    // =========================================================================
    // SpacesTree
    // =========================================================================
    const SYS_ORDER = { content: 0, tasks: 1, milestones: 2, direct: 0, internal: 1 };
    function sortLists(arr) {
      return arr.slice().sort((a, b) => {
        const as = a.system_key && a.system_key in SYS_ORDER, bs = b.system_key && b.system_key in SYS_ORDER;
        if (as && !bs) return -1;
        if (bs && !as) return 1;
        if (as && bs) return SYS_ORDER[a.system_key] - SYS_ORDER[b.system_key];
        return ((a.position ?? 0) - (b.position ?? 0)) || byName(a, b);
      });
    }
    const listIcon = (l) => (l.kind === 'content' || l.system_key === 'content') ? 'ti-calendar' : 'ti-list-check';
    const FAV_ICON = { task: 'ti-circle-check', client: 'ti-building', list: 'ti-list-check', view: 'ti-layout-kanban', url: 'ti-link' };

    function SpacesTree({ clients: clientsProp, lists: listsProp, activeClientId, activeListId, onOpenClient, onOpenList, onAddList,
                          onOpenAgency, onOpenFavorite, favorites, counts, agencyLabel = 'Agency', showAgency = true }) {
      const store = useStoreSafe();
      const clients = clientsProp || (store && store.clients) || [];
      const lists = listsProp || (store && store.lists) || [];
      const [openIds, setOpenIds] = useState(() => { const v = lsGet(K_SPACES, []); return Array.isArray(v) ? v : []; });
      const [filter, setFilter] = useState('');

      const toggle = useCallback((id) => {
        setOpenIds(prev => {
          const next = prev.includes(id) ? prev.filter(x => x !== id) : prev.concat(id);
          lsSet(K_SPACES, next);
          return next;
        });
      }, []);

      const listsByClient = useMemo(() => {
        const m = {};
        lists.forEach(l => {
          if (!l || l.archived || l.system_key === 'personal') return;
          const k = l.client_id || 'agency';
          (m[k] = m[k] || []).push(l);
        });
        Object.keys(m).forEach(k => { m[k] = sortLists(m[k]); });
        return m;
      }, [lists]);

      const activeList = activeListId ? lists.find(l => l.id === activeListId) : null;
      const autoOpen = activeList ? (activeList.client_id || 'agency') : null;
      const isOpen = (id) => openIds.includes(id) || autoOpen === id;

      const sorted = useMemo(() => {
        const act = clients.filter(c => (c.status || 'active') === 'active').sort(byName);
        const ina = clients.filter(c => (c.status || 'active') !== 'active').sort(byName);
        return act.concat(ina);
      }, [clients]);
      const fq = filter.trim().toLowerCase();
      const shown = fq ? sorted.filter(c => String(c.name || '').toLowerCase().includes(fq)) : sorted;

      const countFor = (l) => {
        if (counts && counts[l.id] != null) return counts[l.id] || null;
        return l.open_count != null ? (l.open_count || null) : null;
      };
      const addBtn = (clientId, name) => onAddList && h`<button type="button" class="cs-ibtn" title=${'Add list to ' + name} aria-label=${'Add list to ' + name}
          onClick=${(e) => { e.stopPropagation(); onAddList(clientId); }}><i class="ti ti-plus"></i></button>`;
      const renderLists = (key) => {
        const ls = listsByClient[key] || [];
        if (!ls.length) return h`<div class="cs-sp-empty" style=${{ '--cs-ind': 1 }}>No lists</div>`;
        return ls.map(l => h`<${SideNavItem} key=${l.id} indent=${1} icon=${listIcon(l)} iconColor=${l.color || undefined} label=${l.name}
            count=${countFor(l)} active=${activeListId === l.id} onClick=${() => onOpenList && onOpenList(l)}/>`);
      };

      // Favorites (optional)
      const favs = Array.isArray(favorites) ? favorites.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)) : [];
      const openFav = (f) => {
        if (onOpenFavorite) return onOpenFavorite(f);
        if (f.kind === 'task') return openTask && openTask(f.ref_id);
        if (f.kind === 'client') { const c = clients.find(x => x.id === f.ref_id); return c && onOpenClient && onOpenClient(c); }
        if (f.kind === 'list') { const l = lists.find(x => x.id === f.ref_id); return l && onOpenList && onOpenList(l); }
        if (f.url) window.open(f.url, '_blank', 'noopener');
      };

      return h`<div>
        ${favs.length > 0 && h`<${SideNavGroup} label="Favorites" storageKey="ams_sng_favorites">
          ${favs.map(f => {
            const c = f.kind === 'client' ? clients.find(x => x.id === f.ref_id) : null;
            return h`<${SideNavItem} key=${f.id} label=${f.label || 'Untitled'} icon=${FAV_ICON[f.kind] || 'ti-star'}
                avatar=${c ? h`<${SpaceAvatar} client=${c} size=${18}/>` : null}
                active=${(f.kind === 'list' && f.ref_id === activeListId) || (f.kind === 'client' && f.ref_id === activeClientId && !activeListId)}
                onClick=${() => openFav(f)}/>`;
          })}
        <//>`}
        <${SideNavGroup} label="Spaces" storageKey="ams_sng_spaces">
          ${sorted.length > 8 && h`<div class="cs-sp-filter">
            <i class="ti ti-search"></i>
            <input type="search" value=${filter} placeholder="Filter spaces…" aria-label="Filter spaces" onChange=${(e) => setFilter(e.target.value)}
              onKeyDown=${(e) => { if (e.key === 'Escape' && filter) { e.stopPropagation(); setFilter(''); } }}/>
          </div>`}
          ${showAgency && !fq && h`<${React.Fragment}>
            <${SideNavItem} icon="ti-building" label=${agencyLabel}
              expanded=${isOpen('agency')} onToggle=${() => toggle('agency')}
              active=${activeClientId === 'agency' && !activeListId}
              onClick=${() => { if (onOpenAgency) onOpenAgency(); else toggle('agency'); }}
              right=${addBtn(null, agencyLabel)}/>
            ${isOpen('agency') && renderLists('agency')}
          <//>`}
          ${shown.map(c => h`<${React.Fragment} key=${c.id}>
            <${SideNavItem} label=${c.name} muted=${(c.status || 'active') !== 'active'}
              avatar=${h`<${SpaceAvatar} client=${c} size=${18}/>`}
              expanded=${isOpen(c.id)} onToggle=${() => toggle(c.id)}
              active=${activeClientId === c.id && !activeListId}
              onClick=${() => onOpenClient && onOpenClient(c)}
              right=${addBtn(c.id, c.name)}/>
            ${isOpen(c.id) && renderLists(c.id)}
          <//>`)}
          ${fq && shown.length === 0 && h`<div class="cs-sp-empty" style=${{ '--cs-ind': 0, paddingLeft: 10 }}>No spaces match</div>`}
        <//>
      </div>`;
    }

    // =========================================================================
    // TopBar
    // =========================================================================
    function TopBar({ crumbs = [], right, onMenu, onSearch, className, center }) {
      return h`<header class=${'cs-top' + (className ? ' ' + className : '')}>
        <div class="cs-top-l">
          ${onMenu && h`<button type="button" class="cs-ibtn cs-top-menu" aria-label="Open menu" onClick=${onMenu}><i class="ti ti-menu-2"></i></button>`}
          <nav class="cs-crumbs" aria-label="Breadcrumb">
            ${crumbs.filter(Boolean).map((c, i, arr) => {
              const last = i === arr.length - 1;
              return h`<${React.Fragment} key=${i}>
                ${i > 0 && h`<i class="ti ti-chevron-right cs-crumb-sep" aria-hidden="true"></i>`}
                ${last || !c.onClick
                  ? h`<span class=${'cs-crumb' + (last ? ' last' : '')} aria-current=${last ? 'page' : undefined} title=${c.label}>${c.label}</span>`
                  : h`<button type="button" class="cs-crumb" title=${c.label} onClick=${c.onClick}>${c.label}</button>`}
              <//>`;
            })}
          </nav>
        </div>
        <div class="cs-top-c">
          ${center || h`<button type="button" class="cs-search" aria-label="Search" aria-keyshortcuts="Meta+K Control+K" onClick=${() => onSearch && onSearch()}>
            <i class="ti ti-search"></i><span class="tx">Search</span><span class="cs-kbd">${MOD + (IS_MAC ? '' : '+') + 'K'}</span>
          </button>`}
        </div>
        <div class="cs-top-r">${right}</div>
      </header>`;
    }

    // =========================================================================
    // CreateMenu
    // =========================================================================
    function CreateMenu({ anchor, open, onClose, currentUser, onAction, placement = 'bottom-start' }) {
      const [val, setVal] = useState('');
      const inRef = useRef(null);
      const boxRef = useRef(null);
      const role = currentUser && currentUser.role_level;
      const isAdmin = role === 'admin';
      const canInvoice = role === 'admin'; // canEditFinance in index.html
      useEffect(() => {
        if (!open) return;
        setVal('');
        const t = setTimeout(() => { try { inRef.current && inRef.current.focus(); } catch (e) {} }, 0);
        return () => clearTimeout(t);
      }, [open]);

      const pick = (key) => {
        onClose && onClose();
        if (key === 'task') { openCreateTask && openCreateTask({}); return; }
        onAction && onAction(key);
      };
      const submit = () => {
        const v = val.trim();
        if (!v) return;
        onClose && onClose();
        openCreateTask && openCreateTask({ title: v });
      };
      const items = [
        { key: 'task', icon: 'ti-circle-check', label: 'Task', hint: ALT + 'T' },
        { key: 'post', icon: 'ti-photo', label: 'Post' },
        isAdmin && { key: 'direct', icon: 'ti-send', label: 'Direct task' },
        isAdmin && { key: 'client', icon: 'ti-building-plus', label: 'Client' },
        canInvoice && { key: 'invoice', icon: 'ti-file-invoice', label: 'Invoice' },
        { key: 'note', icon: 'ti-note', label: 'Note' },
        { key: 'doc', icon: 'ti-file-text', label: 'Doc', soon: true },
      ].filter(Boolean);
      const item = (it) => h`<button key=${it.key} type="button" role="menuitem" class="cs-mi" disabled=${it.soon} onClick=${() => !it.soon && pick(it.key)}>
          <i class=${'ti ' + it.icon}></i><span class="ml">${it.label}</span>
          ${it.soon ? h`<span class="soon">Soon</span>` : it.hint && h`<span class="hint">${it.hint}</span>`}
        </button>`;

      return h`<${Pop} anchor=${anchor} open=${open} onClose=${onClose} width=${300} placement=${placement}>
        <div ref=${boxRef} class="cs-menu" role="menu" aria-label="Create" onKeyDown=${(e) => menuArrows(e, boxRef.current)}>
          <div class="cs-cm-in">
            <i class="ti ti-sparkles"></i>
            <input ref=${inRef} class="cs-in" value=${val} placeholder="Describe anything to create…" aria-label="Describe a task to create"
              onChange=${(e) => setVal(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}/>
          </div>
          <div class="cs-msec">Create</div>
          ${items.map(item)}
          <div class="cs-mdiv"></div>
          <div class="cs-msec">Import</div>
          ${item({ key: 'import', icon: 'ti-file-import', label: 'Import CSV' })}
        </div>
      <//>`;
    }
    // Convenience: "+ Create" button that owns its CreateMenu.
    function CreateButton({ currentUser, onAction, label = 'Create', className }) {
      const [anchor, setAnchor] = useState(null);
      return h`<${React.Fragment}>
        <button type="button" class=${'cs-btn pri' + (className ? ' ' + className : '')} aria-haspopup="menu" aria-expanded=${!!anchor}
          style=${{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30 }}
          onClick=${(e) => { const t = e.currentTarget; setAnchor(a => a ? null : t); }}>
          <i class="ti ti-plus" style=${{ fontSize: 14 }}></i>${label}
        </button>
        <${CreateMenu} anchor=${anchor} open=${!!anchor} onClose=${() => setAnchor(null)} currentUser=${currentUser} onAction=${onAction}/>
      <//>`;
    }

    // =========================================================================
    // CommandPalette
    // =========================================================================
    const CHIPS = [{ id: 'all', label: 'All' }, { id: 'task', label: 'Tasks' }, { id: 'client', label: 'Clients' }, { id: 'member', label: 'People' }, { id: 'list', label: 'Lists' }];
    const SEC_LABEL = { task: 'Tasks', client: 'Clients', member: 'People', list: 'Lists' };

    function pushRecent(it) {
      if (!it || !it.kind || it.kind === 'command' || !it.id) return;
      const entry = { kind: it.kind, id: it.id, label: it.label, meta: it.metaText || '', type: it.type || null, color: it.color || null, initials: it.initials || null, custom_id: it.custom_id || null, ts: Date.now() };
      const cur = lsGet(K_RECENT, []);
      const next = [entry].concat((Array.isArray(cur) ? cur : []).filter(r => !(r.kind === entry.kind && r.id === entry.id))).slice(0, 12);
      lsSet(K_RECENT, next);
    }
    const matchScore = (name, q) => {
      const s = String(name || '').toLowerCase(); const i = s.indexOf(q);
      if (i < 0) return -1;
      return i === 0 ? 0 : (s[i - 1] === ' ' ? 1 : 2);
    };
    const localMatch = (arr, q, n) => arr
      .map(x => [x, matchScore(x.name, q)]).filter(p => p[1] >= 0)
      .sort((a, b) => a[1] - b[1] || byName(a[0], b[0])).slice(0, n).map(p => p[0]);

    function CommandPalette({ open, onClose, currentUser, onNavigate, commands = [] }) {
      const store = useStoreSafe();
      const [q, setQ] = useState('');
      const [chip, setChip] = useState('all');
      const [hi, setHi] = useState(0);
      const [remote, setRemote] = useState(null);
      const [loading, setLoading] = useState(false);
      const [recent, setRecent] = useState([]);
      const inRef = useRef(null), dlgRef = useRef(null), listRef = useRef(null), reqRef = useRef(0);

      useFocusReturn(open, inRef);
      useEffect(() => {
        if (!open) { reqRef.current++; return; }
        setQ(''); setChip('all'); setHi(0); setRemote(null); setLoading(false);
        const r = lsGet(K_RECENT, []); setRecent(Array.isArray(r) ? r : []);
      }, [open]);

      const qq = q.trim();
      const isCmd = q.trimStart().startsWith('/');

      // Debounced server search with request-id guard.
      useEffect(() => {
        if (!open) return;
        if (!qq || isCmd || !TaskAPI || !TaskAPI.search) { reqRef.current++; setLoading(false); return; }
        const id = ++reqRef.current;
        setLoading(true);
        const t = setTimeout(async () => {
          try {
            const r = await TaskAPI.search(qq);
            if (id === reqRef.current) setRemote({ q: qq, data: r || {} });
          } catch (e) {
            if (id === reqRef.current) setRemote({ q: qq, data: {}, error: (e && e.message) || 'Search failed' });
          } finally {
            if (id === reqRef.current) setLoading(false);
          }
        }, 180);
        return () => clearTimeout(t);
      }, [qq, isCmd, open]);

      useEffect(() => { setHi(0); }, [q, chip]);

      const clientById = useCallback((id) => {
        if (!id) return null;
        if (store && store.clientById) return typeof store.clientById === 'function' ? store.clientById(id) : store.clientById[id];
        return ((store && store.clients) || []).find(c => c.id === id) || null;
      }, [store]);

      const sections = useMemo(() => {
        const cmdItem = (c) => ({ key: 'cmd:' + c.id, kind: 'command', id: c.id, label: c.label, icon: c.icon || 'ti-bolt', hint: c.hint, run: c.run });
        if (isCmd) {
          const f = q.trimStart().slice(1).trim().toLowerCase();
          const items = commands.filter(c => !f || String(c.label || '').toLowerCase().includes(f)).map(cmdItem);
          return [{ id: 'commands', label: 'Commands', items, hlq: f }];
        }
        const out = [];
        const want = (k) => chip === 'all' || chip === k;
        if (!qq) {
          const rec = recent.filter(r => want(r.kind)).slice(0, 12).map(r => ({
            key: r.kind + ':' + r.id, kind: r.kind, id: r.id, label: r.label, metaText: r.meta, type: r.type, color: r.color, initials: r.initials, custom_id: r.custom_id,
          }));
          if (rec.length) out.push({ id: 'recent', label: 'Recent', items: rec });
          if (chip === 'all' && commands.length) out.push({ id: 'suggested', label: 'Suggested commands', items: commands.slice(0, 6).map(cmdItem) });
          return out;
        }
        const ql = qq.toLowerCase();
        const r = remote && remote.q === qq ? remote.data : null;
        const merge = (serverArr, localArr, n) => {
          const seen = new Set(); const res = [];
          (serverArr || []).concat(localArr || []).forEach(x => { if (x && x.id && !seen.has(x.id)) { seen.add(x.id); res.push(x); } });
          return res.slice(0, n);
        };
        const lim = chip === 'all' ? 6 : 20;
        if (want('task')) {
          const tasks = ((r && r.tasks) || []).slice(0, lim).map(t => ({
            key: 'task:' + t.id, kind: 'task', id: t.id, label: t.title, type: t.type, custom_id: t.custom_id,
            clientName: t.client_name, statusName: t.status_name, statusColor: t.status_color, metaText: t.client_name || '',
          }));
          if (tasks.length) out.push({ id: 'task', label: SEC_LABEL.task, items: tasks });
        }
        if (want('client')) {
          const local = localMatch((store && store.clients) || [], ql, lim);
          const cl = merge(r && r.clients, local, lim).map(c => ({
            key: 'client:' + c.id, kind: 'client', id: c.id, label: c.name, color: c.color || c.brand_color_primary, initials: c.initials,
            metaText: (c.status && c.status !== 'active') ? String(c.status).replace(/_/g, ' ') : 'Space',
          }));
          if (cl.length) out.push({ id: 'client', label: SEC_LABEL.client, items: cl });
        }
        if (want('member')) {
          const local = localMatch((store && store.members) || [], ql, lim);
          const mm = merge(r && r.members, local, lim).map(m => ({
            key: 'member:' + m.id, kind: 'member', id: m.id, label: m.name, color: m.color, initials: m.initials, member: m, metaText: roleLabel(m.role_level),
          }));
          if (mm.length) out.push({ id: 'member', label: SEC_LABEL.member, items: mm });
        }
        if (want('list')) {
          const local = localMatch(((store && store.lists) || []).filter(l => !l.archived), ql, lim).map(l => {
            const c = clientById(l.client_id);
            return { id: l.id, name: l.name, client_name: c ? c.name : (l.client_id ? '' : 'Agency'), kind: l.kind, system_key: l.system_key };
          });
          const ls = merge(r && r.lists, local, lim).map(l => ({
            key: 'list:' + l.id, kind: 'list', id: l.id, label: l.name, listKind: l.kind || l.system_key, metaText: l.client_name || 'Agency',
          }));
          if (ls.length) out.push({ id: 'list', label: SEC_LABEL.list, items: ls });
        }
        if (chip === 'all') {
          const cm = commands.filter(c => String(c.label || '').toLowerCase().includes(ql)).slice(0, 3).map(cmdItem);
          if (cm.length) out.push({ id: 'commands', label: 'Commands', items: cm });
        }
        return out;
      }, [q, qq, isCmd, chip, remote, recent, commands, store, clientById]);

      const flat = useMemo(() => {
        const arr = []; sections.forEach(s => s.items.forEach(it => arr.push(it)));
        return arr;
      }, [sections]);

      useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.querySelector('[data-idx="' + hi + '"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      }, [hi]);

      const pick = (it) => {
        if (!it) return;
        pushRecent(it);
        onClose && onClose();
        setTimeout(() => {
          try {
            if (it.kind === 'command') it.run && it.run();
            else if (it.kind === 'task') openTask && openTask(it.id);
            else if (it.kind === 'client') onNavigate && onNavigate('client', { clientId: it.id });
            else if (it.kind === 'member') onNavigate && onNavigate('member', { memberId: it.id });
            else if (it.kind === 'list') onNavigate && onNavigate('list', { listId: it.id });
          } catch (e) { console.error('[shell] palette action failed', e); }
        }, 0);
      };

      const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => flat.length ? (i + 1) % flat.length : 0); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => flat.length ? (i - 1 + flat.length) % flat.length : 0); }
        else if (e.key === 'Enter') { e.preventDefault(); pick(flat[hi]); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose && onClose(); }
        else if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); onClose && onClose(); }
      };

      if (!open) return null;

      const renderIcon = (it) => {
        if (it.kind === 'task') return h`<${TaskTypeIcon} type=${it.type}/>`;
        if (it.kind === 'client') return h`<${SpaceAvatar} client=${{ name: it.label, color: it.color, initials: it.initials }} size=${20}/>`;
        if (it.kind === 'member') return h`<${PersonAvatar} member=${it.member || { name: it.label, color: it.color, initials: it.initials }} size=${20}/>`;
        if (it.kind === 'list') return h`<i class=${'ti ' + (it.listKind === 'content' ? 'ti-calendar' : 'ti-list')}></i>`;
        return h`<i class=${'ti ' + (it.icon || 'ti-bolt')}></i>`;
      };
      let idx = -1;
      const hlq = isCmd ? q.trimStart().slice(1).trim() : qq;
      const remoteErr = remote && remote.q === qq && remote.error;

      return h`<div class="cs-back" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
        <div ref=${dlgRef} class="cs-pal" role="dialog" aria-modal="true" aria-label="Command palette" data-cu-modal="palette"
             onKeyDown=${(e) => trapTab(e, dlgRef.current)}>
          <div class="cs-pal-in">
            <i class="ti ti-search" aria-hidden="true"></i>
            <input ref=${inRef} value=${q} placeholder="Search, run a command, or ask a question…" aria-label="Search"
              role="combobox" aria-expanded="true" aria-controls="cs-pal-results" aria-autocomplete="list"
              aria-activedescendant=${flat[hi] ? 'cs-pr-' + hi : undefined}
              autoComplete="off" spellCheck="false" onChange=${(e) => setQ(e.target.value)} onKeyDown=${onKey}/>
            ${loading && h`<i class="ti ti-loader-2 cs-spin" aria-label="Searching"></i>`}
            <span class="cs-kbd" aria-hidden="true">esc</span>
          </div>
          ${!isCmd && h`<div class="cs-chips" role="tablist" aria-label="Filter results">
            ${CHIPS.map(c => h`<button key=${c.id} type="button" role="tab" aria-selected=${chip === c.id} class=${'cs-chip' + (chip === c.id ? ' on' : '')}
                onClick=${() => { setChip(c.id); try { inRef.current && inRef.current.focus(); } catch (e) {} }}>${c.label}</button>`)}
          </div>`}
          <div ref=${listRef} class="cs-pal-list" id="cs-pal-results" role="listbox" aria-label="Results">
            ${sections.map(s => h`<div key=${s.id} role="presentation">
              <div class="cs-pal-sec" role="presentation">${s.label}</div>
              ${s.items.map(it => {
                idx++;
                const i = idx, on = i === hi;
                return h`<div key=${it.key} id=${'cs-pr-' + i} data-idx=${i} role="option" aria-selected=${on} class=${'cs-pr' + (on ? ' on' : '')}
                    onMouseMove=${() => { if (hi !== i) setHi(i); }} onMouseDown=${(e) => e.preventDefault()} onClick=${() => pick(it)}>
                  <span class="ico">${renderIcon(it)}</span>
                  <span class="bd">
                    <span class="pt">${hl(it.label, s.hlq != null ? s.hlq : hlq)}</span>
                    ${it.kind === 'task' && it.custom_id && h`<span class="cid">${it.custom_id}</span>`}
                    ${it.kind === 'task'
                      ? h`<span class="meta">${it.clientName && h`<span>${it.clientName}</span>`}${it.clientName && it.statusName && h`<span aria-hidden="true">·</span>`}${it.statusName && h`<span class="cs-pill" style=${{ background: (it.statusColor || '#87909e') + '1f', color: it.statusColor || '#87909e' }}>${it.statusName}</span>`}</span>`
                      : it.metaText && h`<span class="meta">${it.metaText}</span>`}
                  </span>
                  ${it.kind === 'command' && it.hint && h`<span class="hint">${it.hint}</span>`}
                  <span class="ent" aria-hidden="true">↵</span>
                </div>`;
              })}
            </div>`)}
            ${flat.length === 0 && h`<div class="cs-pal-empty">
              ${isCmd
                ? h`<span><i class="ti ti-bolt"></i>No matching commands</span>`
                : qq
                  ? (loading ? h`<span>Searching…</span>` : h`<span><i class="ti ti-search-off"></i>${remoteErr ? remoteErr : 'No results for “' + qq + '”'}</span>`)
                  : h`<span><i class="ti ti-sparkles"></i>Search tasks, clients, people and lists — or type ${'/'} for commands</span>`}
            </div>`}
          </div>
          <div class="cs-pal-ft" aria-hidden="true">
            <span>↑↓ to navigate</span><span>·</span><span>↵ to open</span><span>·</span><span>esc to close</span><span>·</span><span>/ for commands</span>
          </div>
        </div>
      </div>`;
    }

    // =========================================================================
    // Status clear-after watcher (client-side expiry; started once per page)
    // =========================================================================
    function startStatusExpiryWatcher() {
      if (window.__amsShellStatusWatch || !TaskAPI || !TaskAPI.statusSet) return;
      window.__amsShellStatusWatch = true;
      const tick = () => {
        const rec = lsGet(K_STATUS_EXP, null);
        if (!rec || !rec.until) return;
        if (new Date(rec.until).getTime() > Date.now()) return;
        lsSet(K_STATUS_EXP, null);
        if (!tokTail() || rec.tok !== tokTail()) return; // different / no session — drop silently
        const dnd = lsGet(K_STATUS_DND, null);
        Promise.resolve(TaskAPI.statusSet(null, null, isFuture(dnd) ? dnd : null)).catch(() => {});
      };
      setInterval(tick, 30000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
      setTimeout(tick, 4000);
    }
    startStatusExpiryWatcher();

    // =========================================================================
    // ProfileMenu
    // =========================================================================
    const EMOJIS = ['🟢', '📅', '🎬', '🤒', '🌴', '🍽️'];
    const CLEAR_AFTER = [{ k: '30m', l: '30 min' }, { k: '1h', l: '1 hour' }, { k: '4h', l: '4 hours' }, { k: 'today', l: 'Today' }, { k: 'never', l: 'Never' }];
    const clearUntil = (k) => {
      const n = Date.now();
      if (k === '30m') return new Date(n + 30 * 60e3).toISOString();
      if (k === '1h') return new Date(n + 60 * 60e3).toISOString();
      if (k === '4h') return new Date(n + 240 * 60e3).toISOString();
      if (k === 'today') { const d = new Date(); d.setHours(23, 59, 59, 0); return d.toISOString(); }
      return null;
    };

    function ProfileMenu({ anchor, open, onClose, currentUser, theme, setTheme, onSignOut, onOpenSettings, onShortcuts, placement = 'top-start' }) {
      const store = useStoreSafe();
      const me = (store && store.me) || currentUser || {};
      const [presence, setPresence] = useState(me.presence || null);
      const [editing, setEditing] = useState(false);
      const [dndOpen, setDndOpen] = useState(false);
      const [emoji, setEmoji] = useState('');
      const [text, setText] = useState('');
      const [clearK, setClearK] = useState('never');
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState('');
      const [, forceTick] = useState(0);
      const boxRef = useRef(null);
      const textRef = useRef(null);

      useEffect(() => { setPresence(me.presence || null); }, [me.presence && JSON.stringify(me.presence)]);
      useEffect(() => { if (!open) { setEditing(false); setDndOpen(false); setErr(''); } else forceTick(x => x + 1); }, [open]);
      useEffect(() => { if (editing) setTimeout(() => { try { textRef.current && textRef.current.focus(); } catch (e) {} }, 0); }, [editing]);

      // A locally expired status should not linger in the header.
      const exp = lsGet(K_STATUS_EXP, null);
      const expired = exp && exp.until && !isFuture(exp.until);
      const pText = expired ? '' : ((presence && presence.text) || '');
      const pEmoji = expired ? '' : ((presence && presence.emoji) || '');
      const dndUntil = presence && isFuture(presence.dnd_until) ? presence.dnd_until : null;

      const startEdit = () => {
        setEmoji(pEmoji); setText(pText);
        const e2 = lsGet(K_STATUS_EXP, null);
        setClearK(e2 && e2.k && isFuture(e2.until) ? e2.k : 'never');
        setErr(''); setEditing(true); setDndOpen(false);
      };
      const call = async (t, em, dnd) => {
        if (!TaskAPI || !TaskAPI.statusSet) throw new Error('Status is unavailable — reload the page.');
        await TaskAPI.statusSet(t || null, em || null, dnd || null);
        setPresence({ text: t || null, emoji: em || null, dnd_until: dnd || null });
        lsSet(K_STATUS_DND, dnd || null);
        try { store && typeof store.reload === 'function' && store.reload(); } catch (e) {}
      };
      const saveStatus = async (clear) => {
        setBusy(true); setErr('');
        try {
          const t = clear ? '' : text.trim(), em = clear ? '' : emoji;
          await call(t, em, dndUntil);
          const until = (!clear && (t || em)) ? clearUntil(clearK) : null;
          lsSet(K_STATUS_EXP, until ? { until, k: clearK, tok: tokTail() } : null);
          setEditing(false);
        } catch (e) { setErr((e && e.message) || 'Could not update status'); }
        finally { setBusy(false); }
      };
      const setDnd = async (k) => {
        let iso = null;
        if (k === '1h') iso = new Date(Date.now() + 3600e3).toISOString();
        else if (k === 'tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); iso = d.toISOString(); }
        setBusy(true); setErr('');
        try { await call(pText, pEmoji, iso); setDndOpen(false); }
        catch (e) { setErr((e && e.message) || 'Could not update Do not disturb'); }
        finally { setBusy(false); }
      };

      const act = (fn) => () => { onClose && onClose(); fn && setTimeout(fn, 0); };
      const mode = theme === 'dark' || theme === 'auto' ? theme : 'light';
      const name = me.name || (currentUser && currentUser.name) || 'You';
      const avatarMember = { name, initials: me.initials || (currentUser && currentUser.initials) || initialsOf(name), color: me.color || (currentUser && currentUser.color) || '#22C55E' };

      return h`<${Pop} anchor=${anchor} open=${open} onClose=${onClose} width=${280} placement=${placement}>
        <div ref=${boxRef} class="cs-pm" role="menu" aria-label="Profile" onKeyDown=${(e) => { if (!editing) menuArrows(e, boxRef.current); }}>
          <div class="cs-pm-hd">
            <${PersonAvatar} member=${avatarMember} size=${40}/>
            <div style=${{ minWidth: 0, flex: 1 }}>
              <div class="cs-pm-nm">${name}</div>
              <div class="cs-pm-role">${roleLabel(me.role_level || (currentUser && currentUser.role_level))}</div>
              <div class="cs-pm-pres">
                ${dndUntil
                  ? h`<${React.Fragment}><span class="cs-pm-dot dnd"></span><span>${'Do not disturb until ' + fmtClock(dndUntil)}</span><//>`
                  : (pText || pEmoji)
                    ? h`<span>${(pEmoji ? pEmoji + ' ' : '') + pText}</span>`
                    : h`<${React.Fragment}><span class="cs-pm-dot"></span><span>Online</span><//>`}
              </div>
            </div>
          </div>

          ${!editing && h`<button type="button" role="menuitem" class="cs-mi" onClick=${startEdit}>
            <i class=${'ti ' + (pEmoji ? 'ti-mood-edit' : 'ti-mood-smile')}></i><span class="ml">${(pText || pEmoji) ? 'Edit status' : 'Set status'}</span>
          </button>`}
          ${editing && h`<div class="cs-pm-ed" onKeyDown=${(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}>
            <div class="cs-emos" role="group" aria-label="Status emoji">
              ${EMOJIS.map(em => h`<button key=${em} type="button" class=${'cs-emo' + (emoji === em ? ' on' : '')} aria-pressed=${emoji === em} aria-label=${'Emoji ' + em}
                  onClick=${() => setEmoji(emoji === em ? '' : em)}>${em}</button>`)}
            </div>
            <input ref=${textRef} class="cs-in" value=${text} maxLength="100" placeholder="What’s your status?" aria-label="Status text"
              onChange=${(e) => setText(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); saveStatus(false); } }}/>
            <div class="cs-lbl">Clear after</div>
            <div class="cs-opts" role="radiogroup" aria-label="Clear after">
              ${CLEAR_AFTER.map(o => h`<button key=${o.k} type="button" role="radio" aria-checked=${clearK === o.k} class=${'cs-opt' + (clearK === o.k ? ' on' : '')} onClick=${() => setClearK(o.k)}>${o.l}</button>`)}
            </div>
            ${err && h`<div class="cs-err">${err}</div>`}
            <div class="cs-row">
              ${(pText || pEmoji) && h`<button type="button" class="cs-btn" disabled=${busy} onClick=${() => saveStatus(true)} style=${{ marginRight: 'auto' }}>Clear</button>`}
              <button type="button" class="cs-btn" disabled=${busy} onClick=${() => setEditing(false)}>Cancel</button>
              <button type="button" class="cs-btn pri" disabled=${busy || (!text.trim() && !emoji)} onClick=${() => saveStatus(false)}>${busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>`}

          <button type="button" role="menuitem" class="cs-mi" aria-expanded=${dndOpen} onClick=${() => { setDndOpen(o => !o); setEditing(false); }}>
            <i class=${'ti ' + (dndUntil ? 'ti-bell-off' : 'ti-bell-z')}></i><span class="ml">Do not disturb</span>
            <span class="hint">${dndUntil ? 'On' : ''}</span>
            <i class=${'ti ti-chevron-' + (dndOpen ? 'down' : 'right')} style=${{ fontSize: 13, width: 'auto', marginLeft: dndUntil ? 4 : 'auto' }}></i>
          </button>
          ${dndOpen && h`<div role="group" aria-label="Do not disturb">
            <button type="button" role="menuitem" class="cs-mi sub" disabled=${busy} onClick=${() => setDnd('1h')}><span class="ml">1 hour</span></button>
            <button type="button" role="menuitem" class="cs-mi sub" disabled=${busy} onClick=${() => setDnd('tomorrow')}><span class="ml">Until tomorrow</span><span class="hint">9:00 am</span></button>
            <button type="button" role="menuitem" class=${'cs-mi sub' + (!dndUntil ? ' sel' : '')} disabled=${busy} onClick=${() => setDnd('off')}><span class="ml">Off</span></button>
          </div>`}
          ${!editing && err && h`<div class="cs-err" style=${{ padding: '0 10px' }}>${err}</div>`}

          <div class="cs-mdiv"></div>
          <div class="cs-msec">Theme</div>
          <div style=${{ padding: '0 6px' }}>
            <div class="cs-seg" role="radiogroup" aria-label="Theme">
              ${[{ k: 'light', l: 'Light', i: 'ti-sun' }, { k: 'dark', l: 'Dark', i: 'ti-moon' }, { k: 'auto', l: 'Auto', i: 'ti-device-desktop' }].map(o =>
                h`<button key=${o.k} type="button" role="radio" aria-checked=${mode === o.k} class=${mode === o.k ? 'on' : ''} onClick=${() => setTheme && setTheme(o.k)}>
                  <i class=${'ti ' + o.i} style=${{ fontSize: 13 }}></i>${o.l}</button>`)}
            </div>
          </div>
          <div class="cs-mdiv"></div>
          <button type="button" role="menuitem" class="cs-mi" onClick=${act(onShortcuts)}><i class="ti ti-keyboard"></i><span class="ml">Keyboard shortcuts</span><span class="hint">?</span></button>
          <button type="button" role="menuitem" class="cs-mi" onClick=${act(onOpenSettings)}><i class="ti ti-settings"></i><span class="ml">Settings</span></button>
          <div class="cs-mdiv"></div>
          <button type="button" role="menuitem" class="cs-mi danger" onClick=${act(onSignOut)}><i class="ti ti-logout"></i><span class="ml">Sign out</span></button>
          <div class="cs-pm-ver">v${APP_VERSION}</div>
        </div>
      <//>`;
    }

    // =========================================================================
    // useThemeMode — applies html.dark for 'light' | 'dark' | 'auto'
    // =========================================================================
    function useThemeMode(theme, setTheme) {
      const mq = (typeof window !== 'undefined' && window.matchMedia) ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      const mode = theme === 'dark' || theme === 'auto' ? theme : 'light';
      const [sysDark, setSysDark] = useState(() => !!(mq && mq.matches));
      useEffect(() => {
        if (mode !== 'auto' || !mq) return;
        const fn = (e) => setSysDark(!!e.matches);
        setSysDark(mq.matches);
        if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn);
        return () => { if (mq.removeEventListener) mq.removeEventListener('change', fn); else if (mq.removeListener) mq.removeListener(fn); };
      }, [mode]);
      const effective = mode === 'auto' ? (sysDark ? 'dark' : 'light') : mode;
      // No deps on purpose: re-assert after every commit so another effect that
      // toggles html.dark from the raw theme can't leave the class stale. Idempotent.
      useEffect(() => {
        const el = document.documentElement;
        const want = effective === 'dark';
        if (el.classList.contains('dark') !== want) el.classList.toggle('dark', want);
        try { if (localStorage.getItem('ams_theme') !== mode) localStorage.setItem('ams_theme', mode); } catch (e) {}
      });
      useEffect(() => { if (theme && theme !== mode && typeof setTheme === 'function') setTheme(mode); }, [theme]);
      return effective;
    }

    // =========================================================================
    // ShortcutsModal
    // =========================================================================
    const SHORTCUT_GROUPS = [
      { title: 'General', rows: [
        { keys: [MOD, 'K'], label: 'Open command palette' },
        { keys: ['/'], label: 'Search' },
        { keys: ['C'], label: 'Create task' },
        { keys: [ALT.replace('+', ''), 'T'], label: 'Create task (anywhere)' },
        { keys: ['?'], label: 'Keyboard shortcuts' },
        { keys: ['Esc'], label: 'Close dialog or panel' },
      ] },
      { title: 'Go to', rows: [
        { keys: ['G', 'H'], label: 'Home', then: true },
        { keys: ['G', 'I'], label: 'Inbox', then: true },
        { keys: ['G', 'M'], label: 'My tasks', then: true },
        { keys: ['G', 'C'], label: 'Clients', then: true },
        { keys: ['G', 'T'], label: 'Team', then: true },
      ] },
      { title: 'Command palette', rows: [
        { keys: ['↑', '↓'], label: 'Move selection' },
        { keys: ['↵'], label: 'Open selected' },
        { keys: ['/'], label: 'Show commands' },
      ] },
      { title: 'Tasks', rows: [
        { keys: [MOD, '↵'], label: 'Submit task / send comment' },
        { keys: ['Esc'], label: 'Close task' },
      ] },
    ];
    function ShortcutsModal({ open, onClose }) {
      const closeRef = useRef(null), dlgRef = useRef(null);
      useFocusReturn(open, closeRef);
      if (!open) return null;
      return h`<div class="cs-back cs-back-sc" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
        <div ref=${dlgRef} class="cs-sc" role="dialog" aria-modal="true" aria-labelledby="cs-sc-title" data-cu-modal="shortcuts"
             onKeyDown=${(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose && onClose(); } else trapTab(e, dlgRef.current); }}>
          <div class="cs-sc-hd">
            <h2 id="cs-sc-title">Keyboard shortcuts</h2>
            <button ref=${closeRef} type="button" class="cs-ibtn" aria-label="Close" onClick=${onClose} style=${{ width: 30, height: 30, fontSize: 18 }}><i class="ti ti-x"></i></button>
          </div>
          <div class="cs-sc-bd">
            ${SHORTCUT_GROUPS.map(g => h`<div key=${g.title} class="cs-sc-grp">
              <h3>${g.title}</h3>
              ${g.rows.map((r, i) => h`<div key=${i} class="cs-sc-row">
                <span>${r.label}</span>
                <span class="cs-sc-keys">${r.keys.map((k, j) => h`<${React.Fragment} key=${j}>
                  ${j > 0 && r.then && h`<span>then</span>`}
                  <kbd class="cs-kbd">${k}</kbd>
                <//>`)}</span>
              </div>`)}
            </div>`)}
          </div>
        </div>
      </div>`;
    }

    // =========================================================================
    // useGlobalShortcuts
    // =========================================================================
    const isTypingTarget = (el) => {
      if (!el || el === document.body) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      const role = el.getAttribute && el.getAttribute('role');
      return role === 'textbox' || role === 'combobox';
    };
    const modalIsOpen = () => !!document.querySelector('[data-cu-modal],[aria-modal="true"]');
    const G_MAP = { h: 'home', i: 'inbox', m: 'my-tasks', c: 'clients', t: 'team' };

    function useGlobalShortcuts(opts) {
      const ref = useRef(opts);
      ref.current = opts || {};
      useEffect(() => {
        let gAt = 0;
        const onKey = (e) => {
          const o = ref.current || {};
          if (o.enabled === false || e.defaultPrevented || e.isComposing) return;
          const key = String(e.key || '');
          const lower = key.toLowerCase();
          const mod = e.metaKey || e.ctrlKey;

          // ⌘/Ctrl+K works from inputs too, but not over another modal (the palette closes itself).
          if (mod && !e.altKey && !e.shiftKey && lower === 'k') {
            if (modalIsOpen()) return;
            e.preventDefault(); gAt = 0;
            o.onPalette && o.onPalette();
            return;
          }
          if (modalIsOpen() || isTypingTarget(e.target)) { gAt = 0; return; }

          // ⌥T / Alt+T → create task (use code: macOS ⌥T yields "†")
          if (e.altKey && !mod && !e.shiftKey && e.code === 'KeyT') {
            e.preventDefault(); gAt = 0;
            o.onCreate && o.onCreate();
            return;
          }
          if (mod || e.altKey || e.repeat) return;

          const now = Date.now();
          if (gAt && now - gAt <= 1000) {
            gAt = 0;
            const id = !e.shiftKey && G_MAP[lower];
            if (id) { e.preventDefault(); o.onNav && o.onNav(id); }
            return;
          }
          gAt = 0;
          if (key === 'g' && !e.shiftKey) { gAt = now; return; }
          if (key === '?') { e.preventDefault(); o.onShortcuts && o.onShortcuts(); return; }
          if (key === '/') { e.preventDefault(); o.onPalette && o.onPalette(); return; }
          if (key === 'c' && !e.shiftKey) { e.preventDefault(); o.onCreate && o.onCreate(); return; }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, []);
    }

    return {
      IconRail, SideNav, SideNavItem, SideNavGroup, SpacesTree, TopBar,
      CreateMenu, CreateButton, CommandPalette, ProfileMenu, ShortcutsModal,
      useGlobalShortcuts, useThemeMode,
    };
  }

  window.AMS_SHELL = { buildShell };
})();

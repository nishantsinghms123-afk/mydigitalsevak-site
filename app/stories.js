/*
 * stories.js — Stories page: plan and schedule Instagram + Facebook stories per brand (migration 205).
 *
 * window.AMS_STORIES.buildStories(deps) → registers the 'stories' page into window.AMS_EXT.pages.
 *
 * A story is a content row with type 'story' (no task, no client approval). On this page the team picks a
 * brand and a week, adds a story to a day, sets its time and uploads the photo or video. The upload goes
 * through drive-upload (filed in <brand>/Stories in Drive), which schedules it at once on every active
 * Instagram and Facebook account of the brand (story_schedule). publish-scheduled-posts → meta-publish
 * posts it at its time. Instagram keeps a story's numbers for 24 h; story-insights saves them hourly.
 *
 * Not possible through Meta's API (so not here): link / poll / question / mention stickers, music,
 * location tags and adding to Highlights. Those stories are posted from the Instagram app.
 */
(function () {
  'use strict';

  function buildStories(deps) {
    const d = deps || {};
    const React = d.React, h = d.h, useState = d.useState, useEffect = d.useEffect, useCallback = d.useCallback, useMemo = d.useMemo;
    const rpcCall = d.rpcCall, db = d.db;
    if (!React || !h || !rpcCall) return {};

    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key) !== k).concat(item);
    };

    // ---- styles ---------------------------------------------------------------------------------------
    if (!document.getElementById('ams-stories-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-stories-styles';
      st.textContent = `
      .st-page{padding:20px 24px 40px;max-width:1500px;margin:0 auto;color:var(--cu-t1,#1a1a1f)}
      .st-page.in-brand{padding:16px 0 32px;max-width:none}
      .st-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin-bottom:6px}
      .st-head h1{font-size:20px;font-weight:600;margin:0 8px 0 0}
      .st-sel{min-height:34px;border:1px solid var(--cu-bd,#e3e3e8);border-radius:8px;padding:0 10px;background:var(--cu-bg,#fff);color:inherit;font-size:14px;max-width:320px}
      .st-week{display:inline-flex;align-items:center;gap:4px}
      .st-week b{font-weight:600;font-size:14px;min-width:150px;text-align:center}
      .st-ib{display:inline-flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;border:1px solid var(--cu-bd,#e3e3e8);border-radius:8px;background:var(--cu-bg,#fff);color:inherit;cursor:pointer;font-size:13px;padding:0 10px;gap:6px}
      .st-ib:hover{background:var(--cu-bg3,#f2f2f5)}
      .st-ib:focus-visible{outline:2px solid #ff00ee;outline-offset:2px}
      .st-ib.danger{color:#b42318}
      .st-ib[disabled]{opacity:.55;cursor:default}
      .st-sub{font-size:12.5px;color:var(--cu-t3,#77777f);line-height:1.5;margin:4px 0 14px;max-width:900px}
      .st-acc{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}
      .st-pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;border-radius:99px;padding:3px 10px;background:var(--cu-bg3,#f2f2f5)}
      .st-pill.warn{background:#fff4e5;color:#93370d}
      html.dark .st-pill.warn{background:rgba(247,144,9,.15);color:#fdb022}
      .st-grid{display:grid;grid-template-columns:repeat(7,minmax(168px,1fr));gap:10px;overflow-x:auto;padding-bottom:6px}
      .st-day{border:1px solid var(--cu-bd,#e8e8eb);border-radius:10px;background:var(--cu-bg2,#fafafb);display:flex;flex-direction:column;min-height:220px}
      .st-day.today{border-color:#ff00ee;box-shadow:0 0 0 1px rgba(255,0,238,.25)}
      .st-dh{display:flex;justify-content:space-between;align-items:baseline;padding:9px 10px 6px;font-size:13px}
      .st-dh b{font-weight:600}
      .st-dh span{font-size:11.5px;color:var(--cu-t3,#77777f)}
      .st-list{display:flex;flex-direction:column;gap:8px;padding:0 8px 8px;flex:1}
      .st-card{border:1px solid var(--cu-bd,#e3e3e8);border-radius:9px;background:var(--cu-bg,#fff);padding:8px;display:flex;flex-direction:column;gap:7px}
      .st-row{display:flex;align-items:center;gap:6px}
      .st-th{width:46px;height:82px;border-radius:6px;background:var(--cu-bg3,#ececf0) center/cover no-repeat;flex:none;display:flex;align-items:center;justify-content:center;color:var(--cu-t3,#8b8b93);font-size:18px;overflow:hidden}
      .st-meta{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}
      .st-time{border:1px solid var(--cu-bd,#e3e3e8);border-radius:6px;padding:2px 6px;font-size:13px;background:var(--cu-bg,#fff);color:inherit;width:100%;max-width:112px}
      .st-chip{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:500;border-radius:99px;padding:2px 8px;width:max-content;max-width:100%}
      .st-chip.need{background:#f2f2f5;color:#55555e}
      .st-chip.sched{background:#e0ecff;color:#1d4ed8}
      .st-chip.busy{background:#fef3c7;color:#b45309}
      .st-chip.done{background:#dcfce7;color:#067647}
      .st-chip.fail{background:#fee2e2;color:#b42318}
      html.dark .st-chip.need{background:#2a2a30;color:#c4c4cc}
      .st-note{font-size:12px;color:var(--cu-t2,#55555e);line-height:1.4;overflow-wrap:anywhere}
      .st-err{font-size:11.5px;color:#b42318;line-height:1.4;overflow-wrap:anywhere}
      .st-links{display:flex;gap:8px;font-size:12px}
      .st-links a{color:#A8009C}
      .st-add{margin:0 8px 8px;border:1px dashed var(--cu-bd,#d8d8de);border-radius:8px;background:transparent;color:var(--cu-t2,#55555e);min-height:34px;cursor:pointer;font-size:13px}
      .st-add:hover{border-color:#ff00ee;color:#A8009C;background:rgba(255,0,238,.06)}
      .st-empty{font-size:12px;color:var(--cu-t3,#8b8b93);padding:4px 2px}
      .st-foot{display:flex;gap:6px;justify-content:flex-end}
      `;
      document.head.appendChild(st);
    }

    // ---- helpers ----------------------------------------------------------------------------------------
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const monday = (dt) => { const x = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return x; };
    const addDays = (dt, n) => { const x = new Date(dt); x.setDate(x.getDate() + n); return x; };
    const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fmtDay = (dt) => `${dt.getDate()} ${MON[dt.getMonth()]}`;
    const fmt12 = (t) => { if (!t) return ''; const [H, M] = String(t).split(':').map(Number); const am = H < 12; return `${((H + 11) % 12) + 1}:${pad(M || 0)} ${am ? 'AM' : 'PM'}`; };
    const kfmt = (n) => n == null ? '' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
    const toast = (m) => { if (window.showToast) window.showToast(m); };
    const errText = (e) => {
      const m = String((e && (e.message || e.code)) || e || '');
      if (/story\.bad_time/.test(m)) return 'That time is not valid.';
      if (/story\.already_posted/.test(m)) return 'This story has already gone out.';
      if (/story\.not_found/.test(m)) return 'This story was deleted.';
      if (/auth\./.test(m)) return 'You can’t change stories with this login.';
      return m || 'Something went wrong. Try again.';
    };
    const nextTime = (list) => {
      const last = list.map(s => s.posting_time).filter(Boolean).sort().pop();
      if (!last) return '10:00';
      const [H, M] = last.split(':').map(Number);
      return `${pad(Math.min(H + 2, 21))}:${pad(M || 0)}`;
    };
    const uploader = () => ((window.AMS_EXT && window.AMS_EXT.postMediaTools) || []).find(x => x && x.id === 'upload');

    function storyState(s) {
      const jobs = s.jobs || [];
      if (!s.drive_link) return { key: 'need', label: 'Needs the file', icon: 'ti-upload' };
      if (jobs.some(j => j.status === 'failed')) return { key: 'fail', label: 'Failed', icon: 'ti-alert-triangle' };
      if (jobs.some(j => j.status === 'publishing')) return { key: 'busy', label: 'Posting…', icon: 'ti-loader-2' };
      if (jobs.length && jobs.every(j => j.status === 'published')) return { key: 'done', label: 'Posted', icon: 'ti-check' };
      if (jobs.some(j => j.status === 'pending')) return { key: 'sched', label: 'Scheduled ' + fmt12(s.posting_time), icon: 'ti-clock' };
      return { key: 'need', label: 'Not scheduled: no account', icon: 'ti-plug-x' };
    }

    // ---- one story ------------------------------------------------------------------------------------------
    function StoryCard({ s, onChanged }) {
      const [time, setTime] = useState(s.posting_time || '10:00');
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState('');
      const [sure, setSure] = useState(false);
      useEffect(() => { setTime(s.posting_time || '10:00'); }, [s.posting_time]);
      const st = storyState(s);
      const posted = st.key === 'done';
      const thumb = Array.isArray(s.preview_urls) && s.preview_urls[0];
      const isVideo = !!s.video_url;
      const Up = uploader();

      const saveTime = async () => {
        if (!time || time === s.posting_time) return;
        setBusy(true); setErr('');
        try { await rpcCall('story_update', { p_id: s.id, p_date: s.post_date, p_time: time, p_note: null }); toast('Time changed'); onChanged(); }
        catch (e) { setErr(errText(e)); setTime(s.posting_time || '10:00'); }
        finally { setBusy(false); }
      };
      const del = async () => {
        if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
        setBusy(true); setErr('');
        try { await rpcCall('story_delete', { p_id: s.id }); toast(posted ? 'Removed from the plan (it stays on Instagram)' : 'Story deleted'); onChanged(); }
        catch (e) { setErr(errText(e)); setBusy(false); }
      };
      const retry = async () => {
        setBusy(true); setErr('');
        try { for (const j of (s.jobs || []).filter(x => x.status === 'failed')) await rpcCall('publish_job_retry', { p_job_id: j.id }); toast('Trying again in a minute'); onChanged(); }
        catch (e) { setErr(errText(e)); }
        finally { setBusy(false); }
      };
      const failed = (s.jobs || []).filter(j => j.status === 'failed');
      const links = (s.jobs || []).filter(j => j.permalink);

      return h`<div class="st-card">
        <div class="st-row" style=${{ alignItems: 'flex-start' }}>
          <div class="st-th" style=${thumb ? { backgroundImage: `url('${thumb}')` } : null} aria-hidden="true">
            ${thumb ? (isVideo ? h`<i class="ti ti-player-play-filled" style=${{ color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.5)' }}></i>` : null) : h`<i class="ti ti-photo"></i>`}
          </div>
          <div class="st-meta">
            ${posted ? h`<b style=${{ fontSize: 13 }}>${fmt12(s.posting_time)}</b>`
              : h`<input type="time" class="st-time" aria-label="Story time" value=${time} disabled=${busy}
                  onInput=${(e) => setTime(e.target.value)} onBlur=${saveTime}
                  onKeyDown=${(e) => { if (e.key === 'Enter') e.target.blur(); }}/>`}
            <span class=${'st-chip ' + st.key}><i class=${'ti ' + st.icon}></i>${st.label}</span>
            ${s.reach != null ? h`<span class="st-note">Reach ${kfmt(s.reach)}</span>` : null}
          </div>
        </div>
        ${s.note ? h`<div class="st-note">${s.note}</div>` : null}
        ${failed.map(j => h`<div class="st-err" key=${j.id}>${j.platform === 'instagram' ? 'Instagram' : 'Facebook'}: ${String(j.error || 'failed').replace(/^\{.*"message":"?|"?\}$/g, '').slice(0, 180)}</div>`)}
        ${links.length ? h`<div class="st-links">${links.map(j => h`<a key=${j.id} href=${j.permalink} target="_blank" rel="noopener">${j.platform === 'instagram' ? 'Instagram' : 'Facebook'}</a>`)}</div>` : null}
        ${!posted && Up && Up.Component ? h`<${Up.Component} task=${{ content_id: s.id }} row=${{ type: 'story' }} link=${s.drive_link || null}
            onUploaded=${(out) => {
              const sc = out && out.scheduled;
              if (sc && sc.ok && Number(sc.accounts) > 0) toast('Scheduled on Instagram and Facebook');
              else if (sc && sc.ok) toast('Uploaded. Connect Instagram for this brand to schedule it.');
              else if (sc && sc.error) toast('Uploaded, but not scheduled: ' + errText(sc.error));
              onChanged();
            }}/>` : null}
        ${err ? h`<div class="st-err" role="alert">${err}</div>` : null}
        <div class="st-foot">
          ${failed.length ? h`<button type="button" class="st-ib" disabled=${busy} onClick=${retry}><i class="ti ti-refresh"></i>Try again</button>` : null}
          <button type="button" class=${'st-ib' + (sure ? ' danger' : '')} disabled=${busy} onClick=${del}
            aria-label="Delete story" title=${posted ? 'Remove from the plan (it stays on Instagram)' : 'Delete story'}>
            <i class="ti ti-trash"></i>${sure ? 'Delete?' : ''}</button>
        </div>
      </div>`;
    }

    // ---- the page ---------------------------------------------------------------------------------------------
    const LAST = 'ams_stories_client';
    function StoriesPage({ params, client }) {
      const p0 = Array.isArray(params) ? params[0] : params;
      const fixed = client && client.id ? client.id : '';
      const [clients, setClients] = useState([]);
      const [clientId, setClientId] = useState(() => fixed || (p0 && /^[0-9a-f-]{36}$/i.test(p0) ? p0 : (localStorage.getItem(LAST) || '')));
      const [week, setWeek] = useState(() => monday(new Date()));
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(false);
      const [err, setErr] = useState('');
      const [adding, setAdding] = useState('');

      useEffect(() => { if (fixed) setClientId(fixed); }, [fixed]);
      useEffect(() => {
        if (fixed) return;
        let on = true;
        const q = db ? db('clients', '&status=eq.active&deleted_at=is.null&select=id,name&order=name.asc') : Promise.resolve([]);
        q.then(r => { if (!on) return; const list = Array.isArray(r) ? r : []; setClients(list);
          setClientId(c => (c && list.some(x => x.id === c)) ? c : (list[0] && list[0].id) || ''); })
          .catch(() => { if (on) setErr('Could not load the brands.'); });
        return () => { on = false; };
      }, []);

      const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
      const from = iso(days[0]), to = iso(days[6]);

      const load = useCallback(async (quiet) => {
        if (!clientId) return;
        if (quiet !== true) { setLoading(true); setErr(''); }
        try { const r = await rpcCall('story_list', { p_client_id: clientId, p_from: from, p_to: to }); setData(r || { stories: [], accounts: [] }); }
        catch (e) { setErr(errText(e)); }
        finally { setLoading(false); }
      }, [clientId, from, to]);
      useEffect(() => { load(); }, [load]);
      if (window.amsUseLive) window.amsUseLive(['content', 'publish_jobs', 'social_accounts'], () => load(true),
        { match: x => (x.cids || []).includes(clientId) || (x.pids || []).some(id => ((data && data.stories) || []).some(st => st.id === id)) }); // live (212)
      useEffect(() => { if (clientId && !fixed) localStorage.setItem(LAST, clientId); }, [clientId, fixed]);
      // Refresh while something is about to go out or is going out.
      useEffect(() => {
        const live = (data && data.stories || []).some(s => (s.jobs || []).some(j => j.status === 'pending' || j.status === 'publishing'));
        if (!live) return;
        const t = setInterval(load, 60000);
        return () => clearInterval(t);
      }, [data, load]);

      const addStory = async (day, list) => {
        const key = iso(day);
        setAdding(key); setErr('');
        try { await rpcCall('story_create', { p_client_id: clientId, p_date: key, p_time: nextTime(list), p_note: null }); await load(); }
        catch (e) { setErr(errText(e)); }
        finally { setAdding(''); }
      };

      const stories = (data && data.stories) || [];
      const accounts = (data && data.accounts) || [];
      const live = accounts.filter(a => a.status === 'active');
      const today = iso(new Date());
      const total = stories.length, postedN = stories.filter(s => storyState(s).key === 'done').length;

      return h`<div class=${'st-page' + (fixed ? ' in-brand' : '')}>
        <div class="st-head">
          ${fixed ? null : h`<h1>Stories</h1>
          <select class="st-sel" aria-label="Brand" value=${clientId} onChange=${(e) => setClientId(e.target.value)}>
            ${clients.map(c => h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
          </select>`}
          <span class="st-week">
            <button type="button" class="st-ib" aria-label="Previous week" onClick=${() => setWeek(w => addDays(w, -7))}><i class="ti ti-chevron-left"></i></button>
            <b>${fmtDay(days[0])} – ${fmtDay(days[6])}</b>
            <button type="button" class="st-ib" aria-label="Next week" onClick=${() => setWeek(w => addDays(w, 7))}><i class="ti ti-chevron-right"></i></button>
            <button type="button" class="st-ib" onClick=${() => setWeek(monday(new Date()))}>This week</button>
          </span>
          <span class="st-note" style=${{ marginLeft: 'auto' }}>${loading ? 'Loading…' : `${total} stor${total === 1 ? 'y' : 'ies'} this week${postedN ? ` · ${postedN} posted` : ''}`}</span>
        </div>
        <p class="st-sub">Stories go out on their own at their time, on the brand's Instagram and Facebook Page, with no client approval.
          Upload a vertical photo or a video of up to 60 seconds, with any text already on it. Links, polls, questions, mentions and music
          can't be added from here: post those stories from the Instagram app.</p>
        <div class="st-acc">
          ${live.length ? live.map(a => h`<span class="st-pill" key=${a.platform + a.name}><i class=${'ti ti-brand-' + (a.platform === 'instagram' ? 'instagram' : 'facebook')}></i>${a.name}</span>`)
            : h`<span class="st-pill warn"><i class="ti ti-plug-x"></i>No Instagram or Facebook connected for this brand. Connect it in Settings → Connected accounts, or stories won't go out.</span>`}
          ${accounts.filter(a => a.status === 'expired').map(a => h`<span class="st-pill warn" key=${'x' + a.platform}><i class="ti ti-alert-triangle"></i>${a.name}: reconnect</span>`)}
        </div>
        ${err ? h`<div class="st-err" role="alert" style=${{ marginBottom: 10 }}>${err}</div>` : null}
        <div class="st-grid">
          ${days.map((day, i) => {
            const key = iso(day);
            const list = stories.filter(s => s.post_date === key);
            return h`<section class=${'st-day' + (key === today ? ' today' : '')} key=${key} aria-label=${DOW[i] + ' ' + fmtDay(day)}>
              <div class="st-dh"><b>${DOW[i]} ${fmtDay(day)}</b><span>${list.length ? list.length : ''}</span></div>
              <div class="st-list">
                ${list.length ? list.map(s => h`<${StoryCard} key=${s.id} s=${s} onChanged=${load}/>`) : h`<div class="st-empty">No stories</div>`}
              </div>
              <button type="button" class="st-add" disabled=${!clientId || adding === key || key < today}
                onClick=${() => addStory(day, list)}>${adding === key ? 'Adding…' : '+ Add story'}</button>
            </section>`;
          })}
        </div>
      </div>`;
    }

    const contentTeam = (r) => r === 'admin' || r === 'manager' || r === 'editor' || r === 'designer';
    // In the dashboard, Stories is a tab inside each brand (next to Content Calendar: clients.js reads
    // window.AMS_STORIES.StoriesTab). The team app has no brand pages, so editors and designers keep a
    // Stories page there with a brand picker.
    function StoriesTab({ client }) { return h`<${StoriesPage} client=${client} params=${[]}/>`; }
    window.AMS_STORIES.StoriesTab = StoriesTab;
    reg('pages', { id: 'stories', label: 'Stories', icon: 'ti-circle-dashed', section: 'rail', order: 30,
      apps: ['tasks'], roles: contentTeam, Component: StoriesPage });

    return { StoriesPage, StoryCard, StoriesTab };
  }

  window.AMS_STORIES = { buildStories };
})();

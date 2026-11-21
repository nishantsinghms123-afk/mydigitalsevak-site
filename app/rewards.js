/* ============================================================================
 * rewards.js — Team rewards: the monthly scorecard (migration 196)
 *
 *   window.AMS_REWARDS.buildRewards(deps) → { RewardsPage, RewardsHomeBanner, RewardsAPI }
 *
 * Every staff member gets a scorecard for last month on the release day (the 10th): a 0-100 score,
 * a tier, where the points came from and one thing to work on, plus the team's Star of the Month.
 * They see only their own card. Admins (#/rewards → Review team) see everyone's live numbers, add
 * 1-5 stars, client compliments and a note, pick the star and release; Settings holds trial mode,
 * the release day, tiers (₹) and the weights. The server does all the maths (_rewards_compute) and
 * releases by itself on the release day if nobody has.
 *
 * Registers: AMS_EXT.pages 'rewards', AMS_EXT.homeBanners 'rewards' (home.js renders it above the
 * cards), AMS_EXT.cards 'my_scorecard'. Fail-open: without migration 196 the page explains itself
 * and the banner/card stay hidden.
 * ==========================================================================*/
(function () {
  function buildRewards(deps) {
    const { React, h, useState, useEffect, useCallback, useMemo, rpcCall } = deps;
    const Av = deps.Av || (({ i, c, s = 32 }) => h`<span style=${{ width: s, height: s, borderRadius: '50%', background: c || '#888', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(s * 0.36), fontWeight: 700 }}>${i}</span>`);
    const CardShell = deps.CardShell;

    const EXT = (window.AMS_EXT = window.AMS_EXT || {});
    const reg = (key, item) => {
      const k = item.id || item.key || item.type;
      EXT[key] = (EXT[key] || []).filter(x => (x.id || x.key || x.type) !== k).concat(item);
    };
    const arr = (x) => (Array.isArray(x) ? x : []);
    const isMissingRpc = (e) => /PGRST202|could not find the function|does not exist|404/i.test(String((e && (e.code || '')) + ' ' + ((e && (e.message || e.details)) || '')));
    const errText = (e) => {
      const m = String((e && (e.message || e.details)) || e || '');
      if (/rewards\.released/.test(m)) return 'This month is released. Reopen it to change anything.';
      if (/auth\.forbidden/.test(m)) return 'Only admins can do this.';
      if (isMissingRpc(e)) return 'Rewards are not switched on for this workspace yet.';
      return m.replace(/^.*?:\s*/, '') || 'Something went wrong';
    };

    // ---------------------------------------------------------------- styles
    if (!document.getElementById('ams-rewards-styles')) {
      const st = document.createElement('style');
      st.id = 'ams-rewards-styles';
      st.textContent = `
      .rw-page{max-width:1080px;margin:0 auto;padding:18px 20px 40px;color:var(--cu-t1,#1f1f23);font:13px Inter,system-ui,-apple-system,'Segoe UI',sans-serif}
      .rw-page *{box-sizing:border-box}
      .rw-page :focus-visible{outline:2px solid var(--cu-accent,#ff00ee);outline-offset:1px}
      .rw-hd{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
      .rw-title{font:700 20px Inter,system-ui,sans-serif;display:flex;align-items:center;gap:8px;margin:0}
      .rw-tabs{display:flex;gap:4px;margin-left:auto;background:var(--cu-bg2,#f7f7f8);border:1px solid var(--cu-bd,#e8e8eb);border-radius:8px;padding:3px}
      .rw-tab{border:0;background:transparent;color:var(--cu-t2,#55555e);font:600 12.5px Inter,system-ui,sans-serif;padding:6px 12px;border-radius:6px;cursor:pointer}
      .rw-tab.on{background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);box-shadow:0 1px 2px rgba(0,0,0,.08)}
      .rw-box{border:1px solid var(--cu-bd,#e8e8eb);border-radius:12px;background:var(--cu-bg,#fff);padding:16px}
      .rw-muted{color:var(--cu-t3,#8e8e99)}
      .rw-sub{color:var(--cu-t2,#55555e)}
      .rw-trial{display:flex;gap:10px;align-items:flex-start;border:1px dashed var(--cu-accent,#ff00ee);background:var(--cu-accent-fog,rgba(255,0,238,.08));color:var(--cu-t1,#1f1f23);border-radius:10px;padding:10px 12px;margin-bottom:14px}
      .rw-trial i{color:var(--cu-accent,#ff00ee);font-size:18px;margin-top:1px}
      .rw-star{position:relative;overflow:hidden;border-radius:14px;padding:16px 18px;color:#fff;background:linear-gradient(120deg,#A8009C 0%,#ff00ee 55%,#FF66F5 100%);display:flex;align-items:center;gap:14px;margin-bottom:14px}
      .rw-star .lbl{font:700 11px Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;opacity:.9}
      .rw-star .nm{font:700 20px Inter,system-ui,sans-serif;margin-top:2px}
      .rw-star .nt{font-size:13px;opacity:.95;margin-top:3px}
      .rw-star .big{position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:54px;opacity:.25;pointer-events:none}
      .rw-card-top{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
      .rw-ring{flex-shrink:0}
      .rw-ring text{font-family:Inter,system-ui,sans-serif}
      .rw-tier{display:inline-flex;align-items:center;gap:6px;font:700 14px Inter,system-ui,sans-serif;padding:4px 10px;border-radius:999px;border:1px solid var(--cu-bd,#e8e8eb);background:var(--cu-bg2,#f7f7f8)}
      .rw-parts{display:grid;gap:12px;margin-top:16px}
      .rw-part{display:grid;grid-template-columns:28px 1fr auto;gap:4px 10px;align-items:center}
      .rw-part i.ic{font-size:18px;color:var(--cu-t2,#55555e);grid-row:span 2}
      .rw-part .nm{font-weight:600}
      .rw-part .val{font-weight:700;text-align:right}
      .rw-part .ex{grid-column:2 / 4;color:var(--cu-t2,#55555e);font-size:12.5px;display:flex;justify-content:space-between;gap:8px}
      .rw-bar{grid-column:2 / 4;height:7px;border-radius:99px;background:var(--cu-bg3,#efeff1);overflow:hidden}
      .rw-bar>span{display:block;height:100%;border-radius:99px;background:var(--cu-accent,#ff00ee)}
      .rw-part.off{opacity:.55}
      .rw-tip{margin-top:16px;border-radius:10px;padding:10px 12px;background:var(--cu-bg2,#f7f7f8);border:1px solid var(--cu-bd,#e8e8eb);display:flex;gap:10px}
      .rw-tip i{font-size:18px;color:var(--cu-accent,#ff00ee)}
      .rw-hist{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      .rw-hist span{border:1px solid var(--cu-bd,#e8e8eb);border-radius:8px;padding:6px 10px;background:var(--cu-bg,#fff)}
      .rw-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
      @media(max-width:860px){.rw-grid{grid-template-columns:1fr}.rw-page{padding:12px}.rw-tabs{margin-left:0}}
      .rw-people{display:grid;gap:10px}
      .rw-person{border:1px solid var(--cu-bd,#e8e8eb);border-radius:12px;background:var(--cu-bg,#fff)}
      .rw-person.out{opacity:.6}
      .rw-prow{display:flex;align-items:center;gap:12px;padding:12px 14px;flex-wrap:wrap}
      .rw-pname{font-weight:700;font-size:14px}
      .rw-chips{display:flex;gap:6px;flex-wrap:wrap}
      .rw-chip{font-size:11.5px;border-radius:999px;padding:2px 8px;background:var(--cu-bg2,#f7f7f8);border:1px solid var(--cu-bd,#e8e8eb);color:var(--cu-t2,#55555e);white-space:nowrap}
      .rw-chip b{color:var(--cu-t1,#1f1f23)}
      .rw-score{margin-left:auto;display:flex;align-items:center;gap:10px}
      .rw-score .n{font:800 22px Inter,system-ui,sans-serif;min-width:40px;text-align:right}
      .rw-pbody{border-top:1px solid var(--cu-bd,#e8e8eb);padding:12px 14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
      .rw-field{display:flex;flex-direction:column;gap:5px}
      .rw-field>label,.rw-field>.lb{font-size:11.5px;font-weight:600;color:var(--cu-t2,#55555e)}
      .rw-in{width:100%;min-height:32px;border:1px solid var(--cu-bd2,#d6d6db);border-radius:6px;background:var(--cu-bg,#fff);color:var(--cu-t1,#1f1f23);padding:6px 10px;font:13px Inter,system-ui,sans-serif}
      textarea.rw-in{min-height:58px;resize:vertical}
      .rw-stars{display:flex;gap:2px}
      .rw-stars button{border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:var(--cu-bd2,#d6d6db);padding:0 1px}
      .rw-stars button.on{color:#f5a524}
      .rw-stars button:disabled{cursor:default}
      .rw-step{display:inline-flex;align-items:center;border:1px solid var(--cu-bd2,#d6d6db);border-radius:6px;overflow:hidden}
      .rw-step button{border:0;background:var(--cu-bg2,#f7f7f8);color:var(--cu-t1,#1f1f23);width:30px;height:30px;cursor:pointer;font-size:15px}
      .rw-step span{min-width:30px;text-align:center;font-weight:700}
      .rw-check{display:flex;align-items:center;gap:7px;font-size:12.5px;cursor:pointer}
      .rw-pill{font:600 11.5px Inter,system-ui,sans-serif;border-radius:999px;padding:3px 9px}
      .rw-pill.draft{background:var(--cu-bg3,#efeff1);color:var(--cu-t2,#55555e)}
      .rw-pill.rel{background:rgba(48,164,108,.15);color:#30a46c}
      .rw-side{display:grid;gap:12px;position:sticky;top:10px}
      .rw-tbl{width:100%;border-collapse:collapse}
      .rw-tbl th,.rw-tbl td{padding:6px 6px;border-bottom:1px solid var(--cu-bd,#e8e8eb);text-align:left}
      .rw-tbl th{font-size:11.5px;color:var(--cu-t2,#55555e);font-weight:600}
      .rw-tbl input{width:100%}
      .rw-banner{display:flex;align-items:center;gap:12px;border-radius:12px;padding:10px 14px;margin:0 0 14px;color:#fff;background:linear-gradient(120deg,#A8009C 0%,#ff00ee 60%,#FF66F5 100%);flex-wrap:wrap}
      .rw-banner .t{font-weight:700}
      .rw-banner .s{font-size:12.5px;opacity:.95}
      .rw-banner button{border:0;cursor:pointer;font:600 12.5px Inter,system-ui,sans-serif;border-radius:7px}
      .rw-banner .go{background:#fff;color:#A8009C;padding:7px 12px;margin-left:auto}
      .rw-banner .x{background:transparent;color:#fff;font-size:16px;opacity:.85;padding:4px 6px}
      `;
      document.head.appendChild(st);
    }

    // ---------------------------------------------------------------- data
    const RewardsAPI = {
      mine: () => rpcCall('rewards_mine', {}),
      review: (month) => rpcCall('rewards_review', { p_month: month || null }),
      save: (month, member, patch) => rpcCall('rewards_save_person', { p_month: month, p_member: member, p_patch: patch }),
      saveSettings: (s) => rpcCall('rewards_settings_save', { p_settings: s }),
      release: (month, star, note) => rpcCall('rewards_release', { p_month: month, p_star: star || null, p_star_note: note || null }),
      reopen: (month) => rpcCall('rewards_reopen', { p_month: month }),
    };
    // rewards_mine is shared by the banner, the card and the page: one call per 5 minutes.
    let mineCache = { at: 0, p: null };
    const loadMine = (force) => {
      if (!force && mineCache.p && Date.now() - mineCache.at < 300000) return mineCache.p;
      mineCache = { at: Date.now(), p: RewardsAPI.mine().catch((e) => { mineCache.at = 0; throw e; }) };
      return mineCache.p;
    };

    const monthLabel = (m) => {
      if (!m) return '';
      const [y, mo] = String(m).split('-').map(Number);
      return new Date(y, (mo || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    };
    const monthShort = (m) => { const [y, mo] = String(m || '').split('-').map(Number); return y ? new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'long' }) : ''; };
    const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    // The month the next release is about: last month up to the release day, this month after it.
    const reviewMonth = (releaseDay) => { const d = new Date(); if (d.getDate() > (releaseDay || 10)) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); return prevMonth(); };
    const lastMonths = (n) => { const out = []; const d = new Date(); d.setDate(1); for (let i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); } return out; };
    const ordinal = (n) => n + (([11, 12, 13].includes(n % 100)) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
    const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
    const dayMonth = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }); };
    const TIER_ICON = { gold: '🥇', silver: '🥈', bronze: '🥉' };
    const TRACKS = [['maker', 'Maker (editor / designer)'], ['lead', 'Lead (whole-team numbers)'], ['support', 'Support']];
    const PART_KEYS = ['on_time', 'volume', 'first_time', 'discipline', 'rating'];
    const PART_META = {
      on_time: { label: 'On time', icon: 'ti-clock-check',
        ex: (m, lead) => lead ? `${m.team_on_time} of ${m.team_due} team pieces in by their due day` : `${m.on_time} of ${m.due} pieces handed in by their due day` },
      volume: { label: 'Work finished', icon: 'ti-stack-2',
        ex: (m) => `${m.done} of ${m.due} pieces due this month finished` },
      first_time: { label: 'Right first time', icon: 'ti-circle-check',
        ex: (m, lead) => lead ? `${m.team_posts_done - m.team_sent_back} of ${m.team_posts_done} team posts needed no changes` : `${m.posts_done - m.sent_back} of ${m.posts_done} posts needed no changes` },
      discipline: { label: 'Attendance', icon: 'ti-calendar-check',
        ex: (m) => `${Number(m.present_days)} of ${m.expected_days} working days checked in` },
      rating: { label: 'Manager’s rating', icon: 'ti-star',
        ex: (m, lead, card) => card.rating ? `${card.rating} of 5 stars` : 'Not rated' },
    };

    // ---------------------------------------------------------------- pieces
    function ScoreRing({ score, size = 112 }) {
      const r = size / 2 - 8, c = 2 * Math.PI * r, v = score == null ? 0 : Math.max(0, Math.min(100, Number(score)));
      return h`<svg class="rw-ring" width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} role="img" aria-label=${score == null ? 'No score' : `Score ${score} out of 100`}>
        <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--cu-bg3,#efeff1)" stroke-width="9"/>
        <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--cu-accent,#ff00ee)" stroke-width="9" stroke-linecap="round"
          stroke-dasharray=${`${(c * v) / 100} ${c}`} transform=${`rotate(-90 ${size / 2} ${size / 2})`}/>
        <text x="50%" y="48%" text-anchor="middle" dominant-baseline="middle" fill="var(--cu-t1,#1f1f23)" font-size=${size * 0.3} font-weight="800">${score == null ? '–' : Math.round(v)}</text>
        <text x="50%" y="70%" text-anchor="middle" fill="var(--cu-t3,#8e8e99)" font-size=${size * 0.1}>out of 100</text>
      </svg>`;
    }
    function TierBadge({ tier, trial, showAmount }) {
      if (!tier) return h`<span class="rw-tier rw-muted">No tier this month</span>`;
      return h`<span class="rw-tier">${TIER_ICON[tier.key] || '🏅'} ${tier.label}
        ${showAmount && tier.amount ? h`<span class="rw-muted" style=${{ fontWeight: 600 }}>· ${trial ? 'would be ' : ''}${inr(tier.amount)}</span>` : null}</span>`;
    }
    function shares(card) {
      const w = card.weights || {}, p = card.parts || {};
      const active = PART_KEYS.filter(k => p[k] != null && Number(w[k] || 0) > 0);
      const tot = active.reduce((s, k) => s + Number(w[k]), 0);
      const out = {}; active.forEach(k => { out[k] = Math.round((Number(w[k]) / tot) * 100); });
      return out;
    }

    // The scorecard itself — the same for the person and the admin's preview.
    function Scorecard({ card, trial, month, showAmount }) {
      const m = card.metrics || {}, lead = card.track === 'lead', sh = shares(card), w = card.weights || {};
      const bonus = Number(card.compliments || 0);
      return h`<div class="rw-box">
        <div class="rw-card-top">
          <${ScoreRing} score=${card.score}/>
          <div style=${{ display: 'grid', gap: 8, minWidth: 0 }}>
            <div class="rw-muted" style=${{ fontWeight: 600 }}>${monthLabel(month)} scorecard</div>
            <div><${TierBadge} tier=${card.tier} trial=${trial} showAmount=${showAmount}/></div>
            ${bonus > 0 && h`<div class="rw-sub"><i class="ti ti-heart-handshake" aria-hidden="true"></i> ${bonus} client compliment${bonus > 1 ? 's' : ''}${card.compliment_note ? ': ' + card.compliment_note : ''} (bonus points)</div>`}
          </div>
        </div>
        <div class="rw-parts">
          ${PART_KEYS.filter(k => Number(w[k] || 0) > 0).map(k => {
            const v = card.parts ? card.parts[k] : null, meta = PART_META[k];
            return h`<div key=${k} class=${'rw-part' + (v == null ? ' off' : '')}>
              <i class=${'ti ic ' + meta.icon} aria-hidden="true"></i>
              <span class="nm">${meta.label}</span>
              <span class="val">${v == null ? '–' : v + '%'}</span>
              <div class="rw-bar" aria-hidden="true"><span style=${{ width: (v || 0) + '%' }}></span></div>
              <div class="ex"><span>${v == null ? (k === 'rating' ? 'Not rated this month' : k === 'discipline' ? 'Not counted for you' : 'Nothing to count this month') : meta.ex(m, lead, card)}</span>
                <span class="rw-muted">${sh[k] != null ? `counts ${sh[k]}%` : ''}</span></div>
            </div>`;
          })}
        </div>
        ${card.note && h`<div class="rw-tip"><i class="ti ti-message-circle-2" aria-hidden="true"></i><div><b>From your manager</b><div class="rw-sub">${card.note}</div></div></div>`}
        ${card.tip && h`<div class="rw-tip"><i class="ti ti-bulb" aria-hidden="true"></i><div><b>One thing to work on</b><div class="rw-sub">${card.tip}</div></div></div>`}
      </div>`;
    }
    function StarBanner({ star, month }) {
      if (!star) return null;
      return h`<div class="rw-star">
        <${Av} i=${star.initials} c=${star.color} s=${52} round=${true}/>
        <div style=${{ minWidth: 0 }}>
          <div class="lbl">⭐ Star of the Month · ${monthLabel(month)}</div>
          <div class="nm">${star.name}${star.is_me ? ' — that’s you! 🎉' : ''}</div>
          ${star.note && h`<div class="nt">${star.note}</div>`}
        </div>
        <span class="big" aria-hidden="true">🏆</span>
      </div>`;
    }
    const TrialNote = ({ admin, until, max }) => h`<div class="rw-trial"><i class="ti ti-flask" aria-hidden="true"></i><div>
      <b>${until ? `Trial until ${dayMonth(until)}.` : 'Trial month.'}</b> ${admin
        ? `Scorecards released up to then are practice and nothing is paid.${until ? ' After that the scores are real and staff see their amount' + (max ? ` (at most ${inr(max)})` : '') + '.' : ' Turn trial off in Settings when you’re happy with the scoring.'}`
        : `This is practice: nothing is paid for this scorecard. It’s here so you can see how the scoring works.${until ? ' Real rewards' + (max ? `, up to ${inr(max)},` : '') + ' start after ' + dayMonth(until) + '.' : ''}`}</div></div>`;

    // Plain-words summary of the programme: the What's new box and the empty scorecard both use it.
    function ProgramFacts({ program }) {
      const pr = program || {};
      const tiers = arr(pr.tiers).filter(t => Number(t.amount) > 0);
      return h`<ul style=${{ margin: '6px 0 0', padding: '0 0 0 18px', lineHeight: 1.6 }}>
        ${pr.trial && pr.trial_until ? h`<li>Practice first: the scorecard on ${dayMonth(pr.trial_until)} (for ${monthShort(String(pr.trial_until).slice(0, 7).replace(/^(\d{4})-(\d{2})$/, (_, y, m) => m === '01' ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0')))}) is a trial, so nothing is paid for it.</li>` : null}
        ${tiers.length > 0 && h`<li>${pr.trial && pr.trial_until ? 'After that, a' : 'A'} score of ${tiers[tiers.length - 1].min} or more earns a bonus:
          ${tiers.map((t, i) => h`<span key=${t.key || i}>${i ? ' · ' : ' '}${TIER_ICON[t.key] || '🏅'} ${t.label} ${t.min}+ = ${inr(t.amount)}</span>`)}${pr.max_payout ? ` (${inr(pr.max_payout)} at most).` : '.'}</li>`}
        <li>Scorecards come out on the ${ordinal(pr.release_day || 10)} of every month, under Rewards in the menu.</li>
        <li>Move a post to In Review the day you finish it: that is when it counts as handed in.</li>
      </ul>`;
    }

    // ---------------------------------------------------------------- My scorecard
    function MyRewards() {
      const [d, setD] = useState(null);
      const [err, setErr] = useState(null);
      useEffect(() => { let on = true; loadMine(true).then(x => { if (on) setD(x || {}); }).catch(e => { if (on) setErr(e); }); return () => { on = false; }; }, []);
      if (err) return h`<div class="rw-box rw-sub">${errText(err)}</div>`;
      if (!d) return h`<div class="rw-box rw-muted">Loading your scorecard…</div>`;
      if (!d.month) return h`<div class="rw-box" style=${{ display: 'grid', gap: 8 }}>
        <div style=${{ fontSize: 30 }}>🏆</div>
        <b style=${{ fontSize: 15 }}>Your first scorecard is on its way</b>
        <div class="rw-sub">On the ${ordinal((d.program && d.program.release_day) || 10)} of every month you’ll see a score for the month before. It counts work handed in by its due day,
          work finished, posts approved with no changes, attendance, and a rating from your manager. Only you see your card.</div>
        ${d.program && d.program.enabled && h`<div class="rw-sub"><${ProgramFacts} program=${d.program}/></div>`}
      </div>`;
      return h`<div>
        ${d.trial && h`<${TrialNote} until=${d.program && d.program.trial_until} max=${d.program && d.program.max_payout}/>`}
        <${StarBanner} star=${d.star} month=${d.month}/>
        ${d.card ? h`<${Scorecard} card=${d.card} trial=${d.trial} month=${d.month} showAmount=${!d.trial}/>`
          : h`<div class="rw-box rw-sub">You don’t have a scorecard for ${monthLabel(d.month)}.</div>`}
        ${arr(d.history).length > 1 && h`<div class="rw-box" style=${{ marginTop: 14 }}>
          <b>Your past months</b>
          <div class="rw-hist">${arr(d.history).map(x => h`<span key=${x.month}>${monthShort(x.month)} · <b>${x.score == null ? '–' : Math.round(x.score)}</b>${x.tier ? ' · ' + x.tier : ''}</span>`)}</div>
        </div>`}
      </div>`;
    }

    // ---------------------------------------------------------------- Review (admin)
    function Stars({ value, onChange, disabled }) {
      return h`<div class="rw-stars" role="radiogroup" aria-label="Rating">
        ${[1, 2, 3, 4, 5].map(n => h`<button key=${n} type="button" disabled=${disabled} class=${(value || 0) >= n ? 'on' : ''}
          role="radio" aria-checked=${value === n ? 'true' : 'false'} aria-label=${n + ' star' + (n > 1 ? 's' : '')}
          onClick=${() => onChange(value === n ? null : n)}>★</button>`)}
      </div>`;
    }
    function PersonRow({ p, month, locked, trial, onSave }) {
      const [open, setOpen] = useState(false);
      const [note, setNote] = useState(p.note || '');
      const [cnote, setCnote] = useState(p.compliment_note || '');
      useEffect(() => { setNote(p.note || ''); setCnote(p.compliment_note || ''); }, [p.note, p.compliment_note]);
      const parts = p.parts || {};
      const chip = (k, lbl) => h`<span class="rw-chip">${lbl} <b>${parts[k] == null ? '–' : parts[k] + '%'}</b></span>`;
      return h`<div class=${'rw-person' + (p.included ? '' : ' out')}>
        <div class="rw-prow">
          <${Av} i=${p.initials} c=${p.color} s=${34} round=${true}/>
          <div style=${{ minWidth: 0 }}>
            <div class="rw-pname">${p.name}</div>
            <div class="rw-muted" style=${{ fontSize: 12 }}>${(TRACKS.find(t => t[0] === p.track) || [, p.track])[1]}${p.included ? '' : ' · not in rewards'}</div>
          </div>
          <div class="rw-chips">${chip('on_time', 'On time')}${chip('volume', 'Finished')}${chip('first_time', 'First time')}${chip('discipline', 'Attendance')}</div>
          <div class="rw-score">
            <${Stars} value=${p.rating} disabled=${locked || !p.included} onChange=${(v) => onSave(p, { rating: v })}/>
            <span class="n">${p.score == null ? '–' : Math.round(p.score)}</span>
            <span title=${p.tier ? p.tier.label : 'No tier'} style=${{ fontSize: 20, minWidth: 22 }}>${p.tier ? (TIER_ICON[p.tier.key] || '🏅') : ''}</span>
            <button class="ch-btn sm" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(o => !o)}>
              <i class=${'ti ' + (open ? 'ti-chevron-up' : 'ti-adjustments-horizontal')} aria-hidden="true"></i>${open ? 'Close' : 'Details'}</button>
          </div>
        </div>
        ${open && h`<div class="rw-pbody">
          <div style=${{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <label class="rw-check"><input type="checkbox" checked=${!!p.included} disabled=${locked} onChange=${(e) => onSave(p, { included: e.target.checked })}/> In the rewards</label>
            <label class="rw-check"><input type="checkbox" checked=${!!p.attendance} disabled=${locked} onChange=${(e) => onSave(p, { attendance: e.target.checked })}/> Attendance counts (off for part-timers)</label>
            <div class="rw-field"><label for=${'rw-tr-' + p.member_id}>Scored as</label>
              <select id=${'rw-tr-' + p.member_id} class="rw-in" value=${p.track} disabled=${locked} onChange=${(e) => onSave(p, { track: e.target.value })}>
                ${TRACKS.map(([k, l]) => h`<option key=${k} value=${k}>${l}</option>`)}
              </select></div>
            <div class="rw-field"><span class="lb">Client compliments (+${3} points each, up to 3)</span>
              <div style=${{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span class="rw-step">
                  <button type="button" aria-label="One less" disabled=${locked} onClick=${() => onSave(p, { compliments: Math.max(0, (p.compliments || 0) - 1) })}>−</button>
                  <span aria-live="polite">${p.compliments || 0}</span>
                  <button type="button" aria-label="One more" disabled=${locked} onClick=${() => onSave(p, { compliments: (p.compliments || 0) + 1 })}>+</button>
                </span>
              </div>
              <input class="rw-in" placeholder="Which brand said what (optional)" value=${cnote} disabled=${locked}
                onInput=${(e) => setCnote(e.target.value)} onBlur=${() => { if (cnote !== (p.compliment_note || '')) onSave(p, { compliment_note: cnote }); }}/>
            </div>
            <div class="rw-field"><label for=${'rw-nt-' + p.member_id}>Note to ${p.name.split(' ')[0]} (shown on their card)</label>
              <textarea id=${'rw-nt-' + p.member_id} class="rw-in" placeholder="Praise, or what to improve. Optional." value=${note} disabled=${locked}
                onInput=${(e) => setNote(e.target.value)} onBlur=${() => { if (note !== (p.note || '')) onSave(p, { note }); }}></textarea></div>
          </div>
          <${Scorecard} card=${p} trial=${trial} month=${month} showAmount=${true}/>
        </div>`}
      </div>`;
    }

    function ReviewTeam({ showToast, initialMonth }) {
      const [month, setMonth] = useState(initialMonth || reviewMonth(10));
      const [d, setD] = useState(null);
      const [err, setErr] = useState(null);
      const [busy, setBusy] = useState(false);
      const [star, setStar] = useState('');
      const [starNote, setStarNote] = useState('');
      const [confirm, setConfirm] = useState(false);
      const toast = (m) => { if (showToast) showToast(m); };
      const load = useCallback(async () => {
        setErr(null);
        try { const x = await RewardsAPI.review(month); setD(x); setStar(x.star_member_id || x.suggested_star || ''); setStarNote(x.star_note || ''); }
        catch (e) { setErr(e); }
      }, [month]);
      useEffect(() => { setD(null); setConfirm(false); load(); }, [load]);
      const save = async (p, patch) => {
        try { await RewardsAPI.save(month, p.member_id, patch); await load(); }
        catch (e) { toast(errText(e)); }
      };
      if (err) return h`<div class="rw-box rw-sub">${errText(err)}</div>`;
      if (!d) return h`<div class="rw-box rw-muted">Working out the scores…</div>`;
      const released = d.status === 'released';
      const s = d.settings || {};
      const people = arr(d.people).slice().sort((a, b) => (b.included - a.included) || ((b.score ?? -1) - (a.score ?? -1)) || a.name.localeCompare(b.name));
      const inc = people.filter(p => p.included);
      const unrated = inc.filter(p => p.score != null && !p.rating).length;
      const release = async () => {
        setBusy(true);
        try { await RewardsAPI.release(month, star || null, starNote); mineCache.at = 0; toast(`${monthShort(month)} scorecards released`); setConfirm(false); await load(); }
        catch (e) { toast(errText(e)); } finally { setBusy(false); }
      };
      const reopen = async () => {
        setBusy(true);
        try { await RewardsAPI.reopen(month); mineCache.at = 0; toast('Reopened. Staff won’t see it until you release again.'); await load(); }
        catch (e) { toast(errText(e)); } finally { setBusy(false); }
      };
      const tiers = arr(s.config && s.config.tiers);
      const payout = inc.reduce((t, p) => t + Number((p.tier && p.tier.amount) || 0), 0);
      return h`<div>
        ${s.trial && h`<${TrialNote} admin=${true} until=${s.trial_until} max=${s.config && s.config.max_payout}/>`}
        <div class="rw-grid">
          <div>
            <div class="rw-hd" style=${{ marginBottom: 10 }}>
              <select class="rw-in" style=${{ width: 'auto' }} value=${month} onChange=${(e) => setMonth(e.target.value)} aria-label="Month">
                ${lastMonths(12).map(m => h`<option key=${m} value=${m}>${monthLabel(m)}</option>`)}
              </select>
              <span class=${'rw-pill ' + (released ? 'rel' : 'draft')}>${released ? 'Released' : d.status === 'reopened' ? 'Reopened' : 'Not released yet'}</span>
              <span class="rw-muted">${released && d.released_at ? 'on ' + new Date(d.released_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + (d.released_by ? ' by ' + d.released_by : '') : ''}</span>
            </div>
            <div class="rw-people">
              ${people.map(p => h`<${PersonRow} key=${p.member_id} p=${p} month=${month} locked=${released} trial=${s.trial} onSave=${save}/>`)}
            </div>
          </div>
          <div class="rw-side">
            <div class="rw-box" style=${{ display: 'grid', gap: 10 }}>
              <b style=${{ fontSize: 14 }}>⭐ Star of the Month</b>
              <select class="rw-in" value=${star} disabled=${released} onChange=${(e) => setStar(e.target.value)} aria-label="Star of the Month">
                <option value="">No star this month</option>
                ${inc.map(p => h`<option key=${p.member_id} value=${p.member_id}>${p.name}${p.score != null ? ' · ' + Math.round(p.score) : ''}${p.member_id === d.suggested_star ? ' (top score)' : ''}</option>`)}
              </select>
              <textarea class="rw-in" placeholder="Why they earned it (everyone sees this)" value=${starNote} disabled=${released} onInput=${(e) => setStarNote(e.target.value)}></textarea>
              ${released ? h`<button class="ch-btn" disabled=${busy} onClick=${reopen}><i class="ti ti-lock-open" aria-hidden="true"></i>Reopen to change</button>`
                : confirm ? h`<div style=${{ display: 'grid', gap: 8 }}>
                    <div class="rw-sub">Send ${inc.length} scorecards for ${monthLabel(month)}? Everyone gets a notification.${unrated ? ` ${unrated} ${unrated > 1 ? 'people have' : 'person has'} no stars yet.` : ''}</div>
                    <div style=${{ display: 'flex', gap: 8 }}>
                      <button class="ch-btn pri" disabled=${busy} onClick=${release}>${busy ? 'Releasing…' : 'Yes, release'}</button>
                      <button class="ch-btn" onClick=${() => setConfirm(false)}>Cancel</button></div></div>`
                : h`<button class="ch-btn pri" onClick=${() => setConfirm(true)}><i class="ti ti-send" aria-hidden="true"></i>Release ${monthShort(month)} scorecards</button>`}
              ${!released && h`<div class="rw-muted" style=${{ fontSize: 12 }}>${s.enabled ? `If nobody releases it, it goes out by itself on the ${ordinal(s.release_day || 10)}.` : 'Automatic release is off (Settings).'}${unrated ? ` ${unrated} without stars: their score is worked out without the rating.` : ''}</div>`}
            </div>
            <div class="rw-box" style=${{ display: 'grid', gap: 6 }}>
              <b>Tiers</b>
              ${tiers.map(t => h`<div key=${t.key} style=${{ display: 'flex', justifyContent: 'space-between' }}><span>${TIER_ICON[t.key] || '🏅'} ${t.label} · ${t.min}+</span><span class="rw-muted">${inr(t.amount)} · ${inc.filter(p => p.tier && p.tier.key === t.key).length} people</span></div>`)}
              <div style=${{ borderTop: '1px solid var(--cu-bd,#e8e8eb)', paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                <b>${s.trial ? 'Would pay' : 'To pay'}</b><b>${inr(payout)}</b></div>
            </div>
            <div class="rw-box rw-sub" style=${{ fontSize: 12, display: 'grid', gap: 4 }}>
              <b style=${{ color: 'var(--cu-t1,#1f1f23)' }}>How the score works</b>
              <span>On time: handed in (In Review or later) by the end of the due day.</span>
              <span>Finished: share of the month’s due work that got done.</span>
              <span>Right first time: posts never sent back to Revision.</span>
              <span>Attendance: check-ins on working days (Sundays, office holidays and planned leave don’t count).</span>
              <span>Leads are scored on the whole team’s on-time and first-time numbers.</span>
              <span>A part with nothing to count is left out and the rest are re-weighted.</span>
            </div>
          </div>
        </div>
      </div>`;
    }

    // ---------------------------------------------------------------- Settings (admin)
    function RewardsSettings({ showToast }) {
      const [d, setD] = useState(null);
      const [err, setErr] = useState(null);
      const [busy, setBusy] = useState(false);
      useEffect(() => {
        RewardsAPI.review(prevMonth()).then(x => {
          const s = x.settings || {}, c = s.config || {};
          setD({ enabled: !!s.enabled, trial: s.trial !== false, trial_until: s.trial_until || '', max_payout: c.max_payout ?? '', release_day: s.release_day || 10,
            tiers: arr(c.tiers).map(t => ({ ...t })), weights: JSON.parse(JSON.stringify(c.weights || {})),
            compliment_points: c.compliment_points ?? 3, compliment_cap: c.compliment_cap ?? 3 });
        }).catch(setErr);
      }, []);
      if (err) return h`<div class="rw-box rw-sub">${errText(err)}</div>`;
      if (!d) return h`<div class="rw-box rw-muted">Loading…</div>`;
      const set = (k, v) => setD(x => ({ ...x, [k]: v }));
      const setTier = (i, k, v) => setD(x => ({ ...x, tiers: x.tiers.map((t, j) => j === i ? { ...t, [k]: v } : t) }));
      const setW = (tr, k, v) => setD(x => ({ ...x, weights: { ...x.weights, [tr]: { ...x.weights[tr], [k]: v } } }));
      const save = async () => {
        setBusy(true);
        try {
          await RewardsAPI.saveSettings({ enabled: d.enabled, trial: d.trial, trial_until: d.trial ? (d.trial_until || '') : '', release_day: Number(d.release_day) || 10,
            config: { tiers: d.tiers.map(t => ({ key: t.key, label: String(t.label || '').trim() || t.key, min: Number(t.min) || 0, amount: Number(t.amount) || 0 })),
              weights: Object.fromEntries(Object.entries(d.weights).map(([tr, w]) => [tr, Object.fromEntries(PART_KEYS.map(k => [k, Math.max(0, Number(w[k]) || 0)]))])),
              compliment_points: Number(d.compliment_points) || 0, compliment_cap: Number(d.compliment_cap) || 0,
              max_payout: d.max_payout === '' ? null : Math.max(0, Number(d.max_payout) || 0) } });
          if (showToast) showToast('Rewards settings saved');
        } catch (e) { if (showToast) showToast(errText(e)); } finally { setBusy(false); }
      };
      const num = (v, on, label, w = 70) => h`<input class="rw-in" type="number" min="0" style=${{ width: w }} value=${v} aria-label=${label} onInput=${(e) => on(e.target.value)}/>`;
      return h`<div style=${{ display: 'grid', gap: 14, maxWidth: 760 }}>
        <div class="rw-box" style=${{ display: 'grid', gap: 10 }}>
          <label class="rw-check"><input type="checkbox" checked=${d.trial} onChange=${(e) => set('trial', e.target.checked)}/>
            <span><b>Trial mode</b>: scores go out as practice, staff never see a ₹ amount</span></label>
          ${d.trial && h`<div class="rw-sub" style=${{ paddingLeft: 24 }}>Trial ends after <input class="rw-in" type="date" style=${{ width: 'auto', display: 'inline-block' }} value=${d.trial_until}
            aria-label="Trial ends after" onInput=${(e) => set('trial_until', e.target.value)}/> <span class="rw-muted">(leave empty to keep the trial until you switch it off)</span></div>`}
          <label class="rw-check"><input type="checkbox" checked=${d.enabled} onChange=${(e) => set('enabled', e.target.checked)}/>
            <span><b>Release by itself</b> on the ${num(d.release_day, (v) => set('release_day', v), 'Release day', 64)} of each month if nobody has (admins get a reminder 5 days before)</span></label>
          <div class="rw-sub">Most anyone can get in a month: ₹ ${num(d.max_payout, (v) => set('max_payout', v), 'Most anyone can get', 100)} <span class="rw-muted">(tier amounts above this are cut to it)</span></div>
          <div class="rw-sub">Client compliments: ${num(d.compliment_points, (v) => set('compliment_points', v), 'Points per compliment', 64)} points each, counted up to ${num(d.compliment_cap, (v) => set('compliment_cap', v), 'Most compliments counted', 64)} per month.</div>
        </div>
        <div class="rw-box">
          <b>Tiers</b>
          <table class="rw-tbl" style=${{ marginTop: 6 }}><thead><tr><th>Name</th><th>From score</th><th>Amount (₹)</th></tr></thead><tbody>
            ${d.tiers.map((t, i) => h`<tr key=${t.key}>
              <td><input class="rw-in" value=${t.label} aria-label="Tier name" onInput=${(e) => setTier(i, 'label', e.target.value)}/></td>
              <td>${num(t.min, (v) => setTier(i, 'min', v), 'From score', 90)}</td>
              <td>${num(t.amount, (v) => setTier(i, 'amount', v), 'Amount', 110)}</td></tr>`)}
          </tbody></table>
        </div>
        <div class="rw-box">
          <b>Weights</b> <span class="rw-muted">(relative: they don’t need to add up to 100)</span>
          <div style=${{ overflowX: 'auto' }}><table class="rw-tbl" style=${{ marginTop: 6 }}><thead><tr><th>Scored as</th>${PART_KEYS.map(k => h`<th key=${k}>${PART_META[k].label}</th>`)}</tr></thead><tbody>
            ${TRACKS.map(([tr, lbl]) => h`<tr key=${tr}><td style=${{ whiteSpace: 'nowrap' }}>${lbl}</td>
              ${PART_KEYS.map(k => h`<td key=${k}>${num((d.weights[tr] || {})[k] ?? 0, (v) => setW(tr, k, v), lbl + ' ' + PART_META[k].label, 64)}</td>`)}</tr>`)}
          </tbody></table></div>
        </div>
        <div><button class="ch-btn pri" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Save settings'}</button></div>
      </div>`;
    }

    // ---------------------------------------------------------------- page
    function RewardsPage({ currentUser, showToast, params }) {
      const admin = currentUser && currentUser.role_level === 'admin';
      const [tab, setTab] = useState(admin ? 'review' : 'mine');
      const p0 = arr(params)[0];
      const initialMonth = /^\d{4}-\d{2}$/.test(String(p0 || '')) ? p0 : null;
      const tabs = admin ? [['review', 'Review team'], ['mine', 'My scorecard'], ['settings', 'Settings']] : [];
      return h`<div class="rw-page">
        <div class="rw-hd">
          <h1 class="rw-title"><i class="ti ti-trophy" style=${{ color: 'var(--cu-accent,#ff00ee)' }} aria-hidden="true"></i>Rewards</h1>
          ${tabs.length > 0 && h`<div class="rw-tabs" role="tablist">${tabs.map(([k, l]) => h`<button key=${k} role="tab" aria-selected=${tab === k ? 'true' : 'false'} class=${'rw-tab' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}>${l}</button>`)}</div>`}
        </div>
        ${tab === 'review' ? h`<${ReviewTeam} showToast=${showToast} initialMonth=${initialMonth}/>`
          : tab === 'settings' ? h`<${RewardsSettings} showToast=${showToast}/>`
          : h`<${MyRewards}/>`}
      </div>`;
    }

    // ---------------------------------------------------------------- Home banner + card
    const go = (onNavigate) => { try { location.hash = '#/rewards'; } catch (_) {} if (onNavigate) onNavigate('rewards'); };
    function RewardsHomeBanner({ onNavigate }) {
      const [d, setD] = useState(null);
      const [, force] = useState(0);
      useEffect(() => { let on = true; loadMine().then(x => { if (on) setD(x || {}); }).catch(() => {}); return () => { on = false; }; }, []);
      if (!d || !d.month || !d.released_at) return null;
      if (Date.now() - new Date(d.released_at).getTime() > 21 * 86400000) return null;   // three weeks after release
      const key = 'ams_rw_seen_' + d.month;
      try { if (localStorage.getItem(key)) return null; } catch (_) {}
      const c = d.card, st = d.star;
      return h`<div class="rw-banner" role="status">
        <span style=${{ fontSize: 24 }} aria-hidden="true">🏆</span>
        <div style=${{ minWidth: 0 }}>
          <div class="t">${st ? `Star of the Month: ${st.name}${st.is_me ? ' — that’s you!' : ''}` : `${monthShort(d.month)} scorecards are out`}</div>
          <div class="s">${c && c.score != null ? `Your ${monthShort(d.month)} score: ${Math.round(c.score)}${c.tier ? ' · ' + c.tier.label : ''}` : 'See how the month went.'}${d.trial ? ' · Trial month' : ''}</div>
        </div>
        <button class="go" onClick=${() => go(onNavigate)}>See my scorecard</button>
        <button class="x" aria-label="Hide until next month" title="Hide until next month" onClick=${() => { try { localStorage.setItem(key, '1'); } catch (_) {} force(n => n + 1); }}>✕</button>
      </div>`;
    }
    function ScorecardCard({ ctl, onNavigate }) {
      const [d, setD] = useState(null);
      useEffect(() => { let on = true; loadMine().then(x => { if (on) setD(x || {}); }).catch(() => { if (on) setD({}); }); return () => { on = false; }; }, []);
      const c = d && d.card;
      const body = !d ? h`<div class="rw-muted" style=${{ padding: 10 }}>Loading…</div>`
        : !d.month ? h`<div class="rw-muted" style=${{ padding: 10 }}>Your first scorecard arrives on the 10th.</div>`
        : h`<div style=${{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px', cursor: 'pointer' }} onClick=${() => go(onNavigate)}>
            <${ScoreRing} score=${c ? c.score : null} size=${76}/>
            <div style=${{ display: 'grid', gap: 4 }}>
              <b>${monthLabel(d.month)}</b>
              ${c && c.tier ? h`<span>${TIER_ICON[c.tier.key] || '🏅'} ${c.tier.label}</span>` : h`<span class="rw-muted">No tier</span>`}
              ${d.star && h`<span class="rw-muted" style=${{ fontSize: 12 }}>⭐ Star: ${d.star.name}</span>`}
            </div></div>`;
      if (CardShell) return h`<${CardShell} title="My scorecard" icon="ti-trophy" ctl=${ctl}>${body}<//>`;
      return h`<section class="rw-box">${body}</section>`;
    }

    // Shown inside the dashboard's What's new box (index.html) for a release that names 'rewards'.
    function RewardsWhatsNew() {
      const [d, setD] = useState(null);
      useEffect(() => { let on = true; loadMine().then(x => { if (on) setD(x || {}); }).catch(() => {}); return () => { on = false; }; }, []);
      const pr = d && d.program;
      if (!pr || !pr.enabled) return null;
      return h`<div style=${{ marginTop: 10, border: '1px solid var(--cu-bd,#e8e8eb)', borderRadius: 10, padding: '10px 12px', background: 'var(--cu-accent-fog,rgba(255,0,238,.08))', fontSize: 13.5 }}>
        <b>🏆 How it works for our team</b>
        <${ProgramFacts} program=${pr}/>
      </div>`;
    }

    // ---------------------------------------------------------------- registrations
    const staff = (r) => !!r && r !== 'client';
    reg('pages', { id: 'rewards', label: 'Rewards', icon: 'ti-trophy', section: 'more', order: 63, apps: ['dashboard', 'tasks'], roles: staff, Component: RewardsPage });
    reg('homeBanners', { id: 'rewards', roles: staff, Component: RewardsHomeBanner });
    reg('whatsNewExtras', { id: 'rewards', Component: RewardsWhatsNew });
    reg('cards', { type: 'my_scorecard', name: 'My scorecard', icon: 'ti-trophy', category: 'Team', w: 1, desc: 'Your latest monthly score, tier and the Star of the Month.', roles: staff, Component: ScorecardCard });

    return { RewardsPage, RewardsHomeBanner, RewardsAPI };
  }

  window.AMS_REWARDS = { buildRewards };
})();

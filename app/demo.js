// demo.js — "Book a demo" popup, shared by the app (/app/) and the marketing
// site (loaded there as /app/demo.js — same origin). Plain DOM, no React, no
// dependencies, so it works on any page.
//
//   window.AMS_DEMO.open({ source: 'pricing' })   → opens the form
//   <button data-book-demo="hero">Book a demo</button>  → auto-wired on click
//
// Submits to the anon-callable `request_demo` RPC (migration 111), which files
// the request into the platform Leads pipeline (Leads page → task with phone,
// company, preferred slot) and notifies platform admins in-app. Styles are
// scoped under .amsd-* and theme-independent (white card) so it reads the same
// on the dark marketing site and the light/dark app. Plain script; bump ?v=.
(function(){
  if (window.AMS_DEMO) return;
  var SB_URL = 'https://api.mydigitalsevak.in';
  var SB_KEY = 'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3OTA3NzQyMzksICJleHAiOiAyMTA2MTM0MjM5fQ.0s6f1ivh7h99Ual7umCIpWYrDDkTGpo5hH9iHsYZS0g';
  var FALLBACK_EMAIL = 'nishant@advancemediasolution.com';

  var CSS = ''
    + '.amsd-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(10,8,14,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;animation:amsdFade .18s ease-out}'
    + '@keyframes amsdFade{from{opacity:0}to{opacity:1}}@keyframes amsdUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}'
    + '.amsd-card{position:relative;width:100%;max-width:460px;max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:#1b1320;border-radius:20px;padding:26px 24px 22px;box-shadow:0 30px 80px rgba(0,0,0,.35);font:14px/1.45 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;animation:amsdUp .22s ease-out;text-align:left}'
    + '.amsd-card *{box-sizing:border-box}'
    + '.amsd-x{position:absolute;right:12px;top:12px;width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:#6b6272;font-size:20px;line-height:1;cursor:pointer}'
    + '.amsd-x:hover{background:rgba(255,0,238,.1);color:#A8009C}'
    + '.amsd-tag{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#A8009C;background:rgba(255,0,238,.1);padding:4px 9px;border-radius:99px;margin-bottom:10px}'
    + '.amsd-h{font-size:21px;font-weight:700;margin:0 0 6px;color:#1b1320;letter-spacing:-.01em}'
    + '.amsd-sub{margin:0 0 18px;color:#5d5463;font-size:13.5px}'
    + '.amsd-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}'
    + '.amsd-f{display:block;margin-bottom:11px}'
    + '.amsd-l{display:block;font-size:12px;font-weight:600;color:#3d3442;margin-bottom:5px}'
    + '.amsd-i{width:100%;padding:10px 12px;border:1px solid #ddd3e0;border-radius:11px;font:inherit;font-size:14px;color:#1b1320;background:#fff;outline:none;transition:border-color .12s,box-shadow .12s}'
    + '.amsd-i:focus{border-color:#ff00ee;box-shadow:0 0 0 3px rgba(255,0,238,.14)}'
    + 'textarea.amsd-i{min-height:64px;resize:vertical}'
    + '.amsd-btn{width:100%;margin-top:6px;padding:12px 16px;border:none;border-radius:12px;background:linear-gradient(135deg,#ff00ee,#A8009C);color:#fff;font:inherit;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 8px 22px rgba(255,0,238,.28)}'
    + '.amsd-btn:disabled{opacity:.65;cursor:default}'
    + '.amsd-err{margin:8px 0 0;color:#c81e1e;font-size:12.5px}'
    + '.amsd-fine{margin:12px 0 0;font-size:11.5px;color:#8a8190;text-align:center}'
    + '.amsd-ok{text-align:center;padding:18px 4px 6px}'
    + '.amsd-ok-ic{width:54px;height:54px;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;background:rgba(21,160,90,.12);color:#15a05a;font-size:28px}'
    + '@media (max-width:560px){.amsd-ov{align-items:flex-end;padding:0}.amsd-card{max-width:none;border-radius:20px 20px 0 0;max-height:92vh;padding:24px 18px 20px}.amsd-row{grid-template-columns:1fr}}';

  function injectCss(){
    if (document.getElementById('amsd-css')) return;
    var s = document.createElement('style'); s.id = 'amsd-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function el(tag, attrs, html){
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function normPhone(v){
    var d = String(v || '').replace(/[^\d+]/g, '');
    if (/^\+\d{8,15}$/.test(d)) return d;
    d = d.replace(/\D/g, '');
    if (d.length === 10) return '+91' + d;
    if (d.length === 12 && d.indexOf('91') === 0) return '+' + d;
    return null;
  }

  var open_ = null;
  function open(opts){
    opts = opts || {};
    if (open_) return;
    injectCss();
    var prevFocus = document.activeElement;
    var ov = el('div', { 'class': 'amsd-ov', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'amsd-h' });
    var card = el('div', { 'class': 'amsd-card' });
    card.innerHTML = ''
      + '<button type="button" class="amsd-x" aria-label="Close">&times;</button>'
      + '<span class="amsd-tag">Free 20-min demo</span>'
      + '<h2 class="amsd-h" id="amsd-h">See My Digital Sevak on your agency</h2>'
      + '<p class="amsd-sub">We’ll walk you through client approvals, auto-publishing, GST invoicing and the client app — using your own workflow. We’ll WhatsApp you to confirm a time.</p>'
      + '<form novalidate>'
      +   '<div class="amsd-row">'
      +     '<label class="amsd-f"><span class="amsd-l">Your name *</span><input class="amsd-i" name="name" autocomplete="name" required></label>'
      +     '<label class="amsd-f"><span class="amsd-l">Agency name</span><input class="amsd-i" name="agency" autocomplete="organization"></label>'
      +   '</div>'
      +   '<div class="amsd-row">'
      +     '<label class="amsd-f"><span class="amsd-l">WhatsApp number *</span><input class="amsd-i" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="98765 43210" required></label>'
      +     '<label class="amsd-f"><span class="amsd-l">Email *</span><input class="amsd-i" name="email" type="email" autocomplete="email" required></label>'
      +   '</div>'
      +   '<div class="amsd-row">'
      +     '<label class="amsd-f"><span class="amsd-l">Team size</span><select class="amsd-i" name="team"><option value="">Choose…</option><option>Just me</option><option>2–5</option><option>6–15</option><option>16–50</option><option>50+</option></select></label>'
      +     '<label class="amsd-f"><span class="amsd-l">Best time to call</span><select class="amsd-i" name="when"><option value="">Any time</option><option>Morning (10am–1pm)</option><option>Afternoon (1pm–5pm)</option><option>Evening (5pm–8pm)</option></select></label>'
      +   '</div>'
      +   '<label class="amsd-f"><span class="amsd-l">What would you like to fix? (optional)</span><textarea class="amsd-i" name="note" placeholder="e.g. clients take days to approve posts, invoicing is manual…"></textarea></label>'
      +   '<div class="amsd-err" role="alert" hidden></div>'
      +   '<button type="submit" class="amsd-btn">Book my demo</button>'
      +   '<p class="amsd-fine">No spam. We only use this to schedule your demo.</p>'
      + '</form>';
    ov.appendChild(card);
    document.body.appendChild(ov);
    var prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';

    var form = card.querySelector('form'), errBox = card.querySelector('.amsd-err'), btn = card.querySelector('.amsd-btn');
    function close(){
      if (!open_) return;
      document.removeEventListener('keydown', onKey, true);
      ov.remove(); document.body.style.overflow = prevOverflow; open_ = null;
      try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch(_){}
    }
    function onKey(e){ if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    open_ = close;
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('mousedown', function(e){ if (e.target === ov) close(); });
    card.querySelector('.amsd-x').addEventListener('click', close);
    setTimeout(function(){ var f = form.querySelector('[name=name]'); f && f.focus(); }, 30);

    function fail(msg){ errBox.innerHTML = msg; errBox.hidden = false; }
    form.addEventListener('submit', function(e){
      e.preventDefault(); errBox.hidden = true;
      var v = function(n){ return (form.elements[n].value || '').trim(); };
      var name = v('name'), email = v('email').toLowerCase(), phone = normPhone(v('phone'));
      if (!name) return fail('Please add your name.');
      if (!phone) return fail('Please add a valid WhatsApp number.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please add a valid email.');
      btn.disabled = true; btn.textContent = 'Booking…';
      fetch(SB_URL + '/rest/v1/rpc/request_demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
        body: JSON.stringify({
          p_email: email, p_name: name, p_phone: phone, p_agency: v('agency') || null,
          p_team_size: v('team') || null, p_when: v('when') || null, p_note: v('note') || null,
          p_source: 'demo:' + (opts.source || 'site'),
          p_page: (location.pathname || '') + (location.hash || '')
        })
      }).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ return { ok: r.ok && d && d.ok !== false, d: d }; }); })
        .then(function(res){
          if (!res.ok) throw new Error((res.d && res.d.error) || 'failed');
          card.innerHTML = '<button type="button" class="amsd-x" aria-label="Close">&times;</button>'
            + '<div class="amsd-ok"><div class="amsd-ok-ic">✓</div>'
            + '<h2 class="amsd-h">Demo requested</h2>'
            + '<p class="amsd-sub" style="margin:0 0 16px">Thanks, ' + esc(name.split(' ')[0]) + '! We’ll WhatsApp you on <b>' + esc(phone) + '</b> shortly to confirm a time.</p>'
            + '<button type="button" class="amsd-btn">Done</button></div>';
          card.querySelector('.amsd-x').addEventListener('click', close);
          card.querySelector('.amsd-btn').addEventListener('click', close);
          try { window.dispatchEvent(new CustomEvent('ams-demo-booked', { detail: { source: opts.source || 'site' } })); } catch(_){}
        })
        .catch(function(err){
          btn.disabled = false; btn.textContent = 'Book my demo';
          fail(String(err && err.message) === 'rate_limited'
            ? 'Too many requests — please try again in a few minutes.'
            : 'Couldn’t book that right now. Please try again, or email <a href="mailto:' + FALLBACK_EMAIL + '?subject=Demo%20request">' + FALLBACK_EMAIL + '</a>.');
        });
    });
  }

  // Auto-wire any element with data-book-demo (value = source label).
  document.addEventListener('click', function(e){
    var t = e.target && e.target.closest && e.target.closest('[data-book-demo]');
    if (!t) return;
    e.preventDefault();
    open({ source: t.getAttribute('data-book-demo') || 'site' });
  });

  window.AMS_DEMO = { open: open, close: function(){ open_ && open_(); } };
})();

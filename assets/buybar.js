/* Sitewide floating "Buy" bar (like instantstudio.in's sticky buy pill).
   One script on every page: <script src="/assets/buybar.js?v=1" defer></script>
   Shows after a little scroll, hides while the #pricing section is on screen.
   Prices: launch offer, 50% off (Starter 999 · Growth 1,499 · Agency 2,499). */
(function () {
  if (window.__mdsBuyBar) return; window.__mdsBuyBar = 1;
  var d = document;
  var onHome = location.pathname === '/' || location.pathname === '/index.html';
  var href = onHome ? '#pricing' : '/#pricing';

  var css = '' +
    '.mds-buy{position:fixed;left:50%;bottom:16px;z-index:60;display:flex;align-items:center;gap:16px;width:max-content;max-width:calc(100% - 32px);' +
    'padding:7px 7px 7px 22px;border-radius:100px;background:rgba(14,12,18,.92);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);' +
    'border:1px solid rgba(255,255,255,.14);box-shadow:0 20px 60px rgba(0,0,0,.55),0 0 0 1px rgba(255,0,238,.18);color:#fff;' +
    'font-family:Satoshi,Inter,system-ui,-apple-system,sans-serif;transform:translate(-50%,160%);transition:transform .45s cubic-bezier(.2,.8,.2,1)}' +
    '.mds-buy.show{transform:translate(-50%,0)}' +
    '.mds-buy .t{white-space:nowrap;font-size:14.5px;color:rgba(255,255,255,.72)}' +
    '.mds-buy .t b{color:#fff;font-weight:700}' +
    '.mds-buy .t s{color:rgba(255,255,255,.45);margin:0 4px 0 2px}' +
    '.mds-buy .t .p{color:#fff;font-weight:700;font-size:17px}' +
    '.mds-buy .off{font-size:11px;font-weight:800;letter-spacing:.06em;color:#0B0008;background:linear-gradient(180deg,#FF66F5,#ff00ee);padding:3px 9px;border-radius:100px;margin-left:8px;vertical-align:2px}' +
    '.mds-buy a.go{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;text-decoration:none;color:#fff;font-weight:700;font-size:15px;' +
    'padding:11px 22px;border-radius:100px;background:linear-gradient(180deg,#FF66F5,#ff00ee 55%,#A8009C);box-shadow:0 8px 26px rgba(255,0,238,.45),inset 0 1px 0 rgba(255,255,255,.45);transition:transform .2s}' +
    '.mds-buy a.go:hover{transform:translateY(-1px)}' +
    '@media (max-width:700px){.mds-buy{left:12px;right:12px;bottom:12px;width:auto;max-width:none;justify-content:space-between;padding:6px 6px 6px 16px;transform:translateY(170%)}' +
    '.mds-buy.show{transform:none}.mds-buy .wm{display:none}.mds-buy .t{font-size:13.5px}.mds-buy a.go{padding:10px 18px}}' +
    '@media (prefers-reduced-motion:reduce){.mds-buy{transition:none}}' +
    '@media print{.mds-buy{display:none}}';
  var st = d.createElement('style'); st.textContent = css; d.head.appendChild(st);

  var bar = d.createElement('div');
  bar.className = 'mds-buy'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Buy My Digital Sevak');
  bar.innerHTML =
    '<span class="t"><b class="wm">My Digital Sevak · </b><s>₹1,999</s><span class="p">from ₹999/mo</span><span class="off">50% OFF</span></span>' +
    '<a class="go" href="' + href + '">Buy now ›</a>';
  d.body.appendChild(bar);

  var pricing = d.getElementById('pricing');
  var tick = false;
  function update() {
    tick = false;
    var y = window.scrollY || d.documentElement.scrollTop;
    var nearPricing = false;
    if (pricing) { var r = pricing.getBoundingClientRect(); nearPricing = r.top < innerHeight * 0.85 && r.bottom > innerHeight * 0.15; }
    var openMenu = d.querySelector('.mobile-menu.open');
    bar.classList.toggle('show', y > 260 && !nearPricing && !openMenu);
  }
  function onScroll() { if (!tick) { tick = true; requestAnimationFrame(update); } }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();
})();

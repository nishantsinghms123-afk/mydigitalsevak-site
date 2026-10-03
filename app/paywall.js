// paywall.js — SaaS legacy trial banner, upfront-payment gate, plan picker, Razorpay
// subscription checkout, in-app cancel, the Billing settings panel, and the
// post-login contact-number gate (migration 087) for tenants who signed up
// before a phone was mandatory.
// window.AMS_PAYWALL.buildPaywall(deps) ->
//   { TrialBanner, PaymentDueSidebar, PaywallScreen, BillingSettings, ContactPhoneGate, needsPaywall, needsContactPhone }.
// Styled with the app's .saas-* kit (Fraunces + magenta glass) so it matches the
// house style. Paid-only since migration 111: first month charged at checkout,
// 7-day money-back guarantee (refunds handled manually in Razorpay).
(function(){
  function buildPaywall(deps){
    const { React, h, useState, useEffect, supabase, SB_URL, SB_KEY, rpcCall, getSessionToken, normPhone } = deps;

    // Plan keys come from the catalog itself (plan_catalog table via
    // org_billing_get → billing.catalog, migration 058) so plans created in the
    // Tenants → Plans & pricing editor render everywhere. Sorted by sort_order,
    // then price. The constant is only the last-resort fallback ordering.
    const PLAN_FALLBACK = ['starter','growth','agency'];
    const planKeys = (catalog)=>{
      const keys = Object.keys(catalog||{});
      if(!keys.length) return PLAN_FALLBACK;
      return keys.sort((a,b)=>{
        const pa=catalog[a]||{}, pb=catalog[b]||{};
        const sa=pa.sort_order==null?999:Number(pa.sort_order), sb=pb.sort_order==null?999:Number(pb.sort_order);
        if(sa!==sb) return sa-sb;
        return (Number(pa.price_paise)||0)-(Number(pb.price_paise)||0) || a.localeCompare(b);
      });
    };
    const defaultPlan = (catalog, preferred)=>{
      const keys=planKeys(catalog);
      if(preferred && (catalog&&catalog[preferred] || keys.includes(preferred))) return preferred;
      if(catalog&&catalog.growth) return 'growth';
      return keys[Math.floor((keys.length-1)/2)]||'growth'; // middle plan
    };
    const fmtPaise = (p)=>'₹'+Math.round((p||0)/100).toLocaleString('en-IN');
    const daysLeft = (iso)=>{ if(!iso) return 0; return Math.max(0, Math.ceil((new Date(iso).getTime()-Date.now())/86400000)); };
    const fmtDate = (iso)=>iso?new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'';

    function needsPaywall(billing){
      if(!billing || billing.is_platform) return false;
      const s=billing.status;
      if(s==='past_due'||s==='suspended'||s==='cancelled') return true;
      if(s==='trialing' && !billing.razorpay_subscription_id) return true;
      // Migration 110: the trial/paid period ran out (+3-day grace) and no charge
      // arrived. Server-computed; absent on older DBs ⇒ fail-open.
      if(billing.payment_overdue===true) return true;
      return false;
    }

    function loadRazorpaySDK(){
      return new Promise((resolve,reject)=>{
        if(window.Razorpay) return resolve(window.Razorpay);
        const s=document.createElement('script');
        s.src='https://checkout.razorpay.com/v1/checkout.js';
        s.onload=()=>window.Razorpay?resolve(window.Razorpay):reject(new Error('Razorpay SDK not exposed'));
        s.onerror=()=>reject(new Error('Razorpay SDK failed to load'));
        document.head.appendChild(s);
      });
    }

    async function startSubscription({ plan, user, onStatus }){
      onStatus && onStatus('Preparing checkout…');
      const Razorpay = await loadRazorpaySDK();
      const res = await fetch(`${SB_URL}/functions/v1/razorpay-create-subscription`,{
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${SB_KEY}`, apikey:SB_KEY },
        body:JSON.stringify({ session_token:getSessionToken(), plan }),
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok || !data.subscription_id) throw new Error(data.message || data.error || 'Could not start checkout.');
      return new Promise((resolve)=>{
        const rzp=new Razorpay({
          key:data.key_id, subscription_id:data.subscription_id,
          name:data.org_name||'My Digital Sevak',
          description:`${plan.charAt(0).toUpperCase()+plan.slice(1)} plan · 7-day money-back guarantee`,
          prefill:{ name:user?.name||'', email:user?.email||'' },
          theme:{ color:'#FF00EE' },
          handler:async()=>{
            onStatus && onStatus('Activating…');
            try{ await rpcCall('org_attach_subscription',{ p_subscription_id:data.subscription_id, p_plan:plan }); }catch(_){}
            resolve(true);
          },
          modal:{ ondismiss:()=>resolve(false) },
        });
        rzp.on && rzp.on('payment.failed',()=>resolve(false));
        rzp.open();
      });
    }

    function PlanCards({ catalog, value, onChange }){
      const keys=planKeys(catalog);
      const popular=keys.includes('growth')?'growth':keys[Math.floor((keys.length-1)/2)];
      return h`<div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:14}}>
        ${keys.map(id=>{
          const p=catalog&&catalog[id]; if(!p) return null;
          return h`<button type="button" key=${id} onClick=${()=>onChange(id)} class=${'saas-plan'+(value===id?' sel':'')}>
            ${id===popular&&keys.length>1?h`<span class="saas-tag">POPULAR</span>`:''}
            <div class="saas-plan-name">${p.label}</div>
            <div class="saas-plan-price">${fmtPaise(p.price_paise)}<small>/mo</small></div>
            <ul class="saas-feat">${(p.features||[]).map(f=>h`<li><i class="ti ti-check"></i>${f}</li>`)}</ul>
          </button>`;
        })}
      </div>`;
    }

    function PaywallScreen({ user, billing, onActivated, onSignOut }){
      const [plan,setPlan]=useState(()=>defaultPlan(billing&&billing.catalog, billing&&billing.plan));
      const [busy,setBusy]=useState(false);
      const [status,setStatus]=useState('');
      const [err,setErr]=useState('');
      const catalog=(billing&&billing.catalog)||{};
      const reactivate=['past_due','suspended','cancelled'].includes(billing&&billing.status) || !!(billing&&billing.payment_overdue);

      const go=async()=>{
        setBusy(true); setErr(''); setStatus('');
        try{
          const ok=await startSubscription({ plan, user, onStatus:setStatus });
          if(ok){ onActivated && onActivated(); } else { setBusy(false); setStatus(''); }
        }catch(e){ setErr(e.message||'Checkout failed.'); setBusy(false); setStatus(''); }
      };

      return h`<div class="saas-paywall">
        <div class="saas-shell">
          <div style=${{display:'flex',alignItems:'center',gap:11,marginBottom:20}}>
            <span class="saas-mark">M</span>
            <span style=${{fontWeight:600,color:'var(--t1)'}}>My Digital Sevak</span>
          </div>
          <h1 class="saas-h1">${reactivate?'Reactivate your subscription':'Choose your plan'}</h1>
          <p class="saas-sub" style=${{margin:'0 0 24px',maxWidth:560}}>
            ${reactivate
              ? (billing&&billing.payment_overdue
                  ? `We haven’t received your payment${billing.payment_due_at?` due ${fmtDate(billing.payment_due_at)}`:''}, so the workspace is locked. Pay now to restore full access — your data is safe.`
                  : 'Your subscription is inactive, so the workspace is locked. Pick a plan to restore full access.')
              : 'Pay monthly by card or UPI and cancel anytime. Not the right fit? Cancel within 7 days of your first payment for a full refund.'}
          </p>
          <${PlanCards} catalog=${catalog} value=${plan} onChange=${setPlan}/>
          ${err&&h`<div style=${{marginTop:16,color:'var(--red)',fontSize:13,display:'flex',gap:6,alignItems:'center'}}><i class="ti ti-alert-circle"></i>${err}</div>`}
          <div style=${{display:'flex',gap:14,alignItems:'center',marginTop:24,flexWrap:'wrap'}}>
            <button class="saas-btn" onClick=${go} disabled=${busy}>
              ${busy?[h`<i class="ti ti-loader-2 spinner"></i>`,status||'Working…']:[reactivate?'Subscribe & unlock':'Subscribe & start',h`<i class="ti ti-arrow-right"></i>`]}
            </button>
            ${!reactivate&&window.AMS_DEMO&&h`<button onClick=${()=>window.AMS_DEMO.open({source:'app-paywall'})} class="saas-btn-ghost" style=${{fontSize:13}}><i class="ti ti-calendar-event"></i> Book a free demo first</button>`}
            <button onClick=${onSignOut} style=${{background:'transparent',border:'none',color:'var(--t3)',cursor:'pointer',font:'inherit',fontSize:13}}>Sign out</button>
          </div>
          <p style=${{color:'var(--t3)',fontSize:11.5,marginTop:20,display:'flex',alignItems:'center',gap:6}}><i class="ti ti-shield-check" style=${{fontSize:13}}></i>Secured by Razorpay · 7-day money-back guarantee · Change or cancel anytime from Settings.</p>
        </div>
      </div>`;
    }

    function TrialBanner({ billing, onManage }){
      const todayKey=()=>{try{return new Date().toISOString().slice(0,10);}catch(_){return '';}};
      const [dismissed,setDismissed]=useState(()=>{try{return localStorage.getItem('ams_trial_banner_dismissed')===todayKey();}catch(_){return false;}});
      if(!billing || billing.is_platform) return null;
      if(billing.status!=='trialing') return null;
      // Paid-only since 111: only a legacy org with trial time left sees this.
      if(!billing.trial_ends_at || new Date(billing.trial_ends_at).getTime()<=Date.now()) return null;
      if(dismissed) return null;
      const d=daysLeft(billing.trial_ends_at);
      const hasCard=!!billing.razorpay_subscription_id;
      const close=()=>{try{localStorage.setItem('ams_trial_banner_dismissed',todayKey());}catch(_){}setDismissed(true);};
      return h`<div class="saas-trial">
        <span><i class="ti ti-clock-hour-4" style=${{verticalAlign:'-2px',marginRight:6,color:'var(--brand)'}}></i>
          <b>${d} day${d===1?'':'s'}</b> left in your free trial${hasCard?` — first charge on ${new Date(billing.trial_ends_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}`:''}.</span>
        <button class="saas-btn" style=${{padding:'5px 14px',fontSize:12.5}} onClick=${onManage}>Manage plan</button>
        <button class="saas-x" onClick=${close} aria-label="Dismiss for today" title="Hide for today"><i class="ti ti-x"></i></button>
      </div>`;
    }

    // ── Payment-due reminder sidebar (migration 110) ─────────────────────────
    // Admin-only slide-in panel on the right. Shows from 3 days before the
    // payment due date (trial end / renewal) until the workspace locks.
    // "Remind me tomorrow" hides it for the rest of the day (per org, per
    // browser); it comes back every day until the payment lands.
    const paymentReminder=(billing)=>{
      if(!billing || billing.is_platform || billing.billing_exempt) return null;
      if(!['active','trialing'].includes(billing.status) || billing.payment_overdue) return null;
      if(!billing.payment_due_at) return null;
      const due=new Date(billing.payment_due_at).getTime(); if(!due) return null;
      const now=Date.now();
      if(now < due - 3*86400000) return null;
      // A trial that still has time left is covered by TrialBanner.
      if(billing.status==='trialing' && now < due) return null;
      const cat=billing.catalog||{}; const p=cat[billing.plan]||{};
      return { overdue: now>=due, due: billing.payment_due_at, lock: billing.payment_lock_at,
               plan: p.label||billing.plan, amount: p.price_paise!=null?fmtPaise(p.price_paise):'' };
    };

    function PaymentDueSidebar({ billing, user, onPay }){
      const today=(()=>{try{return new Date().toLocaleDateString('en-CA');}catch(_){return '';}})();
      const key='ams_paydue_hidden_'+((billing&&billing.org_id)||'');
      const [hidden,setHidden]=useState(()=>{try{return localStorage.getItem(key)===today;}catch(_){return false;}});
      if(!user || user.role_level!=='admin' || hidden) return null;
      const r=paymentReminder(billing); if(!r) return null;
      const close=()=>{try{localStorage.setItem(key,today);}catch(_){}setHidden(true);};
      const lockDays=r.lock?Math.max(0,Math.ceil((new Date(r.lock).getTime()-Date.now())/86400000)):null;
      const dueDays=daysLeft(r.due);
      return h`<aside class="saas-paydue" role="complementary" aria-label="Payment reminder">
        <button class="saas-paydue-x" onClick=${close} aria-label="Hide until tomorrow" title="Hide until tomorrow"><i class="ti ti-x"></i></button>
        <div class=${'saas-paydue-ic'+(r.overdue?' bad':'')}><i class=${'ti '+(r.overdue?'ti-alert-triangle':'ti-calendar-due')}></i></div>
        <div class="saas-paydue-t">${r.overdue?'Payment due':`Renewal in ${dueDays} day${dueDays===1?'':'s'}`}</div>
        <p class="saas-paydue-p">${r.overdue
          ? h`We haven’t received your <b>${r.amount}</b> payment for the <b>${r.plan}</b> plan, due <b>${fmtDate(r.due)}</b>.`
          : h`<b>${r.amount}</b> for the <b>${r.plan}</b> plan will be charged to your saved card/UPI on <b>${fmtDate(r.due)}</b>. Keep enough balance so the charge goes through.`}</p>
        ${r.overdue&&lockDays!=null&&h`<div class="saas-paydue-lock"><i class="ti ti-lock"></i>
          ${lockDays<=0?'Your workspace locks today.':`Your workspace locks in ${lockDays} day${lockDays===1?'':'s'} (${fmtDate(r.lock)}).`}</div>`}
        <button class="saas-btn" style=${{width:'100%',justifyContent:'center',marginTop:14}} onClick=${()=>{onPay&&onPay();}}>
          ${r.overdue?'Pay now':'Review billing'} <i class="ti ti-arrow-right"></i></button>
        <button class="saas-paydue-later" onClick=${close}>Remind me tomorrow</button>
      </aside>`;
    }

    function BillingSettings({ user }){
      const [billing,setBilling]=useState(null);
      const [loading,setLoading]=useState(true);
      const [busy,setBusy]=useState(false);
      const [err,setErr]=useState('');
      const [picking,setPicking]=useState(false);
      const [plan,setPlan]=useState('growth');
      const [cancelling,setCancelling]=useState(false);
      const [notice,setNotice]=useState('');

      const load=async()=>{
        setLoading(true);
        try{ const b=await rpcCall('org_billing_get'); setBilling(b); setPlan(defaultPlan(b&&b.catalog, b&&b.plan)); }
        catch(e){ setErr('Could not load billing.'); }
        setLoading(false);
      };
      useEffect(()=>{ load(); },[]);

      const cancel=async()=>{
        if(!window.confirm('Cancel your subscription? You keep full access until the end of the current paid period, then the workspace locks until you resubscribe.\n\nWithin 7 days of your first payment? Email nishant@advancemediasolution.com after cancelling for a full refund.')) return;
        setCancelling(true); setErr(''); setNotice('');
        try{
          const res=await fetch(`${SB_URL}/functions/v1/razorpay-cancel-subscription`,{
            method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${SB_KEY}`, apikey:SB_KEY },
            body:JSON.stringify({ session_token:getSessionToken() }),
          });
          const data=await res.json().catch(()=>({}));
          if(!res.ok) throw new Error(data.message||data.error||'Cancel failed.');
          setNotice(data.access_until?`Subscription cancelled. Access continues until ${fmtDate(data.access_until)}.`:'Subscription cancelled. Access continues until the end of your paid period.');
          await load();
        }catch(e){ setErr(e.message||'Cancel failed.'); }
        setCancelling(false);
      };

      const change=async()=>{
        if(plan===billing.plan){ setPicking(false); return; }
        setBusy(true); setErr(''); setNotice('');
        try{
          const res=await fetch(`${SB_URL}/functions/v1/razorpay-update-subscription`,{
            method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${SB_KEY}`, apikey:SB_KEY },
            body:JSON.stringify({ session_token:getSessionToken(), plan }),
          });
          const data=await res.json().catch(()=>({}));
          if(res.ok){
            const lbl=(cat[plan]&&cat[plan].label)||plan;
            if(data.mode==='upgrade') setNotice(`Upgraded to ${lbl}. A prorated charge was applied to your saved payment method.`);
            else if(data.mode==='downgrade'){
              const when=(data.effective_at&&data.effective_at!=='cycle_end')?` (${fmtDate(data.effective_at)})`:'';
              setNotice(`Downgrade to ${lbl} scheduled for the end of your current billing period${when}. You keep your current plan until then.`);
            } else setNotice('Plan updated.');
            setPicking(false); await load();
          } else if(data.error==='no_subscription'){
            const ok=await startSubscription({ plan, user }); if(ok){ setPicking(false); await load(); }
          } else throw new Error(data.message||data.error||'Plan change failed.');
        }catch(e){ setErr(e.message||'Plan change failed.'); }
        setBusy(false);
      };

      const payNow=async()=>{
        setBusy(true); setErr(''); setNotice('');
        try{
          const ok=await startSubscription({ plan:billing.plan, user });
          if(ok){ setNotice('Payment method saved — your payment is being processed. This page updates in a few minutes.'); await load(); }
        }catch(e){ setErr(e.message||'Checkout failed.'); }
        setBusy(false);
      };

      if(loading) return h`<div style=${{padding:'40px 24px',color:'var(--t3)'}}><i class="ti ti-loader-2 spinner"></i> Loading billing…</div>`;
      if(!billing) return h`<div style=${{padding:'40px 24px',color:'var(--red)'}}>${err||'No billing info.'}</div>`;
      if(billing.is_platform){
        return h`<div style=${{padding:'28px 24px',maxWidth:680}}>
          <h2 class="saas-h2">Billing</h2>
          <p class="saas-sub">This is the platform-owner workspace — it isn’t billed. Manage customer agencies from the <strong style=${{color:'var(--t1)'}}>Tenants</strong> tab.</p>
        </div>`;
      }

      const cat=billing.catalog||{};
      const cur=cat[billing.plan]||{};
      const lim=billing.limits||{}; const use=billing.usage||{};
      const statusColor={active:'var(--green)',trialing:'var(--amber)',past_due:'var(--red)',suspended:'var(--red)',cancelled:'var(--t3)'}[billing.status]||'var(--t3)';
      const showLimit=(v)=>v<0?'∞':v;

      return h`<div style=${{padding:'28px 24px',maxWidth:820}}>
        <h2 class="saas-h2">Subscription & billing</h2>
        <div style=${{display:'flex',gap:14,flexWrap:'wrap',marginBottom:22}}>
          <div class="saas-stat">
            <div class="saas-stat-lbl">Current plan</div>
            <div class="saas-stat-val">${cur.label||billing.plan}</div>
            <div style=${{marginTop:8,fontSize:13,color:'var(--t2)',display:'flex',alignItems:'center',gap:6}}><span class="saas-dot" style=${{background:statusColor}}></span>${billing.status==='trialing'?(daysLeft(billing.trial_ends_at)>0?`trial · ${daysLeft(billing.trial_ends_at)} days left`:'payment pending'):billing.status==='past_due'?'payment overdue':billing.status}</div>
          </div>
          <div class="saas-stat">
            <div class="saas-stat-lbl">Usage</div>
            <div style=${{fontSize:14,color:'var(--t1)',marginTop:8}}>Clients <strong>${use.clients||0}</strong> <span style=${{color:'var(--t3)'}}>/ ${showLimit(lim.clients)}</span></div>
            <div style=${{fontSize:14,color:'var(--t1)',marginTop:5}}>Team seats <strong>${use.seats||0}</strong> <span style=${{color:'var(--t3)'}}>/ ${showLimit(lim.seats)}</span></div>
          </div>
          ${billing.current_period_end?h`<div class="saas-stat">
            <div class="saas-stat-lbl">Renews</div>
            <div class="saas-stat-val" style=${{fontSize:18}}>${fmtDate(billing.current_period_end)}</div>
          </div>`:''}
        </div>
        ${err&&h`<div style=${{color:'var(--red)',fontSize:13,marginBottom:12}}><i class="ti ti-alert-circle"></i> ${err}</div>`}
        ${notice&&h`<div style=${{color:'var(--green)',fontSize:13,marginBottom:12}}><i class="ti ti-check"></i> ${notice}</div>`}
        ${(()=>{ const r=paymentReminder(billing); if(!r||!r.overdue) return null;
          return h`<div class="saas-card" style=${{padding:16,marginBottom:18,borderColor:'rgba(220,38,38,.35)'}}>
            <div style=${{fontWeight:600,color:'var(--t1)',marginBottom:4}}><i class="ti ti-alert-triangle" style=${{color:'var(--red)',marginRight:6}}></i>Payment due since ${fmtDate(r.due)}</div>
            <div style=${{fontSize:13,color:'var(--t2)',marginBottom:12}}>We couldn’t collect your ${r.amount} payment. Pay now with card or UPI to keep your workspace unlocked${r.lock?` (locks ${fmtDate(r.lock)})`:''}.</div>
            <button class="saas-btn" onClick=${payNow} disabled=${busy}>${busy?'Working…':'Pay now'}</button>
          </div>`; })()}
        ${!picking
          ? h`<button class="saas-btn" onClick=${()=>setPicking(true)}>Change plan</button>`
          : h`<div>
              <${PlanCards} catalog=${cat} value=${plan} onChange=${setPlan}/>
              <div style=${{display:'flex',gap:10,marginTop:16}}>
                <button class="saas-btn" onClick=${change} disabled=${busy}>${busy?'Working…':'Confirm change'}</button>
                <button class="saas-btn-ghost" onClick=${()=>setPicking(false)}>Cancel</button>
              </div>
            </div>`}
        ${billing.razorpay_subscription_id && billing.status!=='cancelled' && h`<div style=${{marginTop:24,paddingTop:18,borderTop:'1px solid var(--bd)'}}>
          <button class="saas-btn-ghost saas-btn-danger" onClick=${cancel} disabled=${cancelling}>${cancelling?'Cancelling…':'Cancel subscription'}</button>
          <span style=${{color:'var(--t3)',fontSize:12,marginLeft:12}}>Access continues until the end of your current paid period. New accounts: full refund if you cancel within 7 days of your first payment.</span>
        </div>`}
      </div>`;
    }


    // ── Contact-number gate (migration 087) ─────────────────────────────────
    // Tenants who signed up before 086 have no orgs.contact_phone, so there is
    // no way to reach them. One blocking screen after login collects it.
    //
    // FAIL-OPEN by design: only gate when org_billing_get actually returned the
    // contact_phone key. On a DB without migration 087 the key is absent and the
    // app behaves exactly as before — never lock anyone out over a missing RPC
    // field. The platform org is exempt (that's us, not a customer), and only
    // the admin is asked: it's the account owner's number, and a designer or
    // manager can't answer for the agency.
    function needsContactPhone(billing, user){
      if(!billing || billing.is_platform) return false;
      if(!user || user.role_level !== 'admin') return false;
      if(!Object.prototype.hasOwnProperty.call(billing, 'contact_phone')) return false;
      return !String(billing.contact_phone || '').trim();
    }

    function ContactPhoneGate({ billing, onSaved, onSignOut }){
      const [phone,setPhone]=useState('');
      const [busy,setBusy]=useState(false);
      const [err,setErr]=useState('');
      const clean=normPhone?normPhone(phone):phone.trim();

      const save=async()=>{
        if(!clean){ setErr('Enter a valid contact number.'); return; }
        setBusy(true); setErr('');
        try{
          await rpcCall('org_contact_phone_set',{ p_phone: clean });
          onSaved && onSaved();
        }catch(e){
          const c=String(e.message||e.code||'');
          setErr(c.includes('invalid_phone')?'That doesn’t look like a valid number.'
                :c.includes('forbidden')?'Only the account admin can set this.'
                :'Could not save right now. Please try again.');
          setBusy(false);
        }
      };

      return h`<div class="saas-paywall">
        <div class="saas-shell" style=${{maxWidth:520}}>
          <div style=${{display:'flex',alignItems:'center',gap:11,marginBottom:20}}>
            <span class="saas-mark">M</span>
            <span style=${{fontWeight:600,color:'var(--t1)'}}>My Digital Sevak</span>
          </div>
          <h1 class="saas-h1">One quick thing${billing&&billing.name?`, ${billing.name}`:''}</h1>
          <p class="saas-sub" style=${{margin:'0 0 22px'}}>
            Add a contact number for your account. We use it to help you set up your
            workspace and to reach you about anything urgent — billing, downtime, or
            your renewal. WhatsApp works best.
          </p>
          <label class="saas-field-lbl" for="cg-phone">Contact number</label>
          <input id="cg-phone" class="saas-input" type="tel" inputMode="tel" autoFocus
            placeholder="+91 98765 43210" value=${phone}
            onInput=${e=>{setPhone(e.target.value); if(err) setErr('');}}
            onKeyDown=${e=>e.key==='Enter'&&save()}/>
          <p style=${{fontSize:11.5,color:'var(--t3)',margin:'7px 0 0',lineHeight:1.5}}>
            ${phone.trim()&&!clean
              ? h`<span style=${{color:'var(--red)'}}><i class="ti ti-alert-circle"></i> That doesn’t look like a valid number.</span>`
              : 'Indian numbers can be entered without the country code.'}
          </p>
          ${err&&h`<div style=${{marginTop:14,color:'var(--red)',fontSize:13,display:'flex',gap:6,alignItems:'center'}}><i class="ti ti-alert-circle"></i>${err}</div>`}
          <div style=${{display:'flex',gap:14,alignItems:'center',marginTop:22,flexWrap:'wrap'}}>
            <button class="saas-btn" onClick=${save} disabled=${busy||!clean}>
              ${busy?[h`<i class="ti ti-loader-2 spinner"></i>`,' Saving…']:['Save & continue ',h`<i class="ti ti-arrow-right"></i>`]}
            </button>
            <button onClick=${onSignOut} style=${{background:'transparent',border:'none',color:'var(--t3)',cursor:'pointer',font:'inherit',fontSize:13}}>Sign out</button>
          </div>
          <p style=${{color:'var(--t3)',fontSize:11.5,marginTop:20,display:'flex',alignItems:'center',gap:6}}>
            <i class="ti ti-lock" style=${{fontSize:13}}></i>Only visible to My Digital Sevak — never shown to your clients.
          </p>
        </div>
      </div>`;
    }

    return { TrialBanner, PaymentDueSidebar, PaywallScreen, BillingSettings, ContactPhoneGate, needsPaywall, needsContactPhone };
  }
  window.AMS_PAYWALL = { buildPaywall };
})();

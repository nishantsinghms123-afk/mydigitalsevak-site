// signup.js — self-serve SaaS signup + email-verify landing.
// window.AMS_SIGNUP.buildSignup(deps) -> { SignupPage, VerifyPage }.
// Uses the same .auth-* glass shell + Fraunces vibe as the login screen, plus the
// .saas-* kit, so it feels native and premium. Plain script; bump ?v= on change.
(function(){
  function buildSignup(deps){
    const { React, h, useState, useEffect, supabase, SB_URL, SB_KEY, APP_VERSION,
            googleSignIn, googleLoginEnabled, GoogleG, setSessionToken } = deps;

    const brandBadge = h`<div class="auth-brand"><span class="auth-brand-mark">M</span>My Digital Sevak</div>`;

    // Premium showcase panel — mirrors the login quote panel (aurora + grain +
    // Fraunces headline with staggered word reveal) so signup/verify match login.
    function Showcase({ headline, sub, bullets }){
      const words=headline.split(' ');
      return h`<div class="auth-quote-side" aria-hidden="true">
        <div class="auth-aurora"></div>
        <div class="auth-grain"></div>
        <div class="auth-quote-wrap">
          <div class="auth-quote-head">
            <span class="live"><span class="pulse"></span>My Digital Sevak</span>
            <span>EARLY ACCESS</span>
          </div>
          <div class="auth-quote-body">
            <p class="auth-quote"><span class="qm">“</span>${words.map((w,i)=>h`<span class="w" style=${{'--i':i}}>${w}</span>`)}<span class="qm" style=${{marginLeft:'-.05em'}}>”</span></p>
            ${sub&&h`<p class="sc-extra" style=${{marginTop:18,fontSize:14,lineHeight:1.6,color:'var(--t2)',maxWidth:380,position:'relative',zIndex:1}}>${sub}</p>`}
            ${bullets&&h`<ul class="sc-extra" style=${{listStyle:'none',padding:0,margin:'22px 0 0',display:'grid',gap:11,position:'relative',zIndex:1}}>
              ${bullets.map(b=>h`<li style=${{display:'flex',gap:9,alignItems:'flex-start',fontSize:14,color:'var(--t1)'}}><i class="ti ti-sparkles" style=${{color:'var(--brand)',marginTop:2}}></i><span>${b}</span></li>`)}
            </ul>`}
          </div>
        </div>
      </div>`;
    }

    function SignupPage({ onBackToLogin, onGoogleLogin }){
      const [org,setOrg]=useState('');
      const [name,setName]=useState('');
      const [email,setEmail]=useState('');
      const [loading,setLoading]=useState(false);
      const [gLoading,setGLoading]=useState(false);
      const [err,setErr]=useState('');
      const [done,setDone]=useState(false);

      // Google sign-up activates instantly (Google already verified the email),
      // so it skips the email-verification round-trip entirely. Needs the agency
      // name so we can create the org. Existing emails are just logged in.
      const googleSignup=async()=>{
        const o=org.trim();
        if(!o){ setErr('Enter your agency name first, then continue with Google.'); return; }
        setGLoading(true); setErr('');
        try{
          const res=await googleSignIn('signup',o);
          if(res.session_token&&setSessionToken)setSessionToken(res.session_token);
          onGoogleLogin&&onGoogleLogin(res);
        }catch(e){ setErr(e.message||'Google sign-up failed. Try again.'); setGLoading(false); }
      };
      // The plan is chosen at the paywall (where the card/UPI mandate is set up),
      // so signup just seeds a sensible default — read from the live catalog
      // (plans_get, migration 058) so a renamed/removed plan key never breaks
      // signup. signup_create_tenant still falls back to 'starter' server-side.
      const [plan,setPlan]=useState('growth');
      useEffect(()=>{
        let alive=true;
        (async()=>{
          try{
            const { data, error } = await supabase.rpc('plans_get');
            if(!alive||error||!Array.isArray(data)||!data.length) return;
            const def=data.find(p=>p.key==='growth')||data[Math.floor((data.length-1)/2)];
            if(def&&def.key) setPlan(def.key);
          }catch(_){}
        })();
        return ()=>{ alive=false; };
      },[]);

      const submit=async()=>{
        const o=org.trim(), e=email.trim().toLowerCase();
        if(!o){ setErr('Enter your agency name.'); return; }
        if(!e || e.indexOf('@')<1){ setErr('Enter a valid work email.'); return; }
        setLoading(true); setErr('');
        try{
          const res=await fetch(`${SB_URL}/functions/v1/tenant-signup`,{
            method:'POST',
            headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${SB_KEY}`, apikey:SB_KEY },
            body:JSON.stringify({ org_name:o, admin_name:name.trim(), admin_email:e, plan }),
          });
          const data=await res.json().catch(()=>({}));
          if(!res.ok){
            setErr(data.message || (data.error==='email_taken'?'That email is already registered — try signing in.':'Could not create your account. Try again.'));
            setLoading(false); return;
          }
          setDone(true);
        }catch(_){ setErr('Network error. Please try again.'); }
        setLoading(false);
      };

      const showcase=h`<${Showcase}
        headline="Run your agency. Delight every client."
        sub="The all-in-one workspace built by an agency, for agencies — clients, content, SEO, reports and billing in one calm place."
        bullets=${['A mobile portal where clients approve & pay','Live invoicing with GST handled for you','7-day free trial — cancel anytime']}/>`;

      if(done){
        return h`<div class="auth-stage"><div class="auth-shell">
          <div class="auth-form-side">
            <div class="auth-foot-top">${brandBadge}</div>
            <div class="auth-form-inner" style=${{textAlign:'center'}}>
              <div class="saas-mark" style=${{margin:'0 auto 16px',width:48,height:48,fontSize:24,borderRadius:14}}>✓</div>
              <h1 class="auth-h1">Check your email</h1>
              <p class="auth-sub">We sent a verification link to <strong style=${{color:'var(--t1)'}}>${email.trim().toLowerCase()}</strong>. Click it to activate your 7-day trial and set your password.</p>
              <button class="auth-submit" onClick=${onBackToLogin}><i class="ti ti-arrow-left"></i> Back to sign in</button>
              <div class="auth-foot" style=${{justifyContent:'center'}}><span>Didn’t get it? Check your spam folder — the link stays valid for 3 days.</span></div>
            </div>
          </div>
          ${showcase}
        </div></div>`;
      }

      return h`<div class="auth-stage"><div class="auth-shell">
        <div class="auth-form-side" style=${{overflowY:'auto'}}>
          <div class="auth-foot-top">${brandBadge}</div>
          <div class="auth-form-inner">
            <h1 class="auth-h1">Start your free trial</h1>
            <p class="auth-sub">7 days free. No charge until your trial ends.</p>
            <div class="auth-field">
              <label class="auth-label" for="su-org">Agency name</label>
              <input id="su-org" class="auth-input" placeholder="BrandBoost Media" value=${org} onInput=${e=>setOrg(e.target.value)} onKeyDown=${e=>e.key==='Enter'&&submit()}/>
            </div>
            <div class="auth-field">
              <label class="auth-label" for="su-name">Your name</label>
              <input id="su-name" class="auth-input" placeholder="Priya Sharma" value=${name} onInput=${e=>setName(e.target.value)} onKeyDown=${e=>e.key==='Enter'&&submit()}/>
            </div>
            <div class="auth-field">
              <label class="auth-label" for="su-email">Work email</label>
              <input id="su-email" class="auth-input" placeholder="you@agency.com" value=${email} onInput=${e=>setEmail(e.target.value)} onKeyDown=${e=>e.key==='Enter'&&submit()} autoComplete="email"/>
            </div>
            ${err&&h`<div class="auth-error"><i class="ti ti-alert-circle"></i>${err}</div>`}
            <button class="auth-submit" onClick=${submit} disabled=${loading||!org.trim()||!email.trim()}>
              ${loading?[h`<i class="ti ti-loader-2 spinner"></i>`,' Creating your workspace…']:['Create my workspace ',h`<i class="ti ti-arrow-right"></i>`]}
            </button>
            ${googleLoginEnabled&&googleLoginEnabled()&&[
              h`<div class="auth-divider">or</div>`,
              h`<button type="button" class="auth-google" onClick=${googleSignup} disabled=${gLoading} style=${{cursor:gLoading?'wait':'pointer'}}>
                ${gLoading?h`<i class="ti ti-loader-2 spinner"></i>`:h`<${GoogleG}/>`} ${gLoading?'Setting up…':'Sign up with Google'}
              </button>`,
              h`<p style=${{fontSize:11.5,color:'var(--t3)',textAlign:'center',margin:'8px 0 0',lineHeight:1.5}}>Uses your Google email — activates instantly, no password to set.</p>`,
            ]}
            <p style=${{fontSize:11.5,color:'var(--t3)',textAlign:'center',margin:'12px 0 0',lineHeight:1.5}}>By creating a workspace you agree to our ${''}
              <a href="/terms.html" target="_blank" rel="noopener" style=${{color:'var(--brand)'}}>Terms</a> ${'&'} <a href="/privacy.html" target="_blank" rel="noopener" style=${{color:'var(--brand)'}}>Privacy Policy</a>.</p>
            <div class="saas-signlink">Already have an account?<button type="button" onClick=${onBackToLogin}>Sign in</button></div>
          </div>
        </div>
        ${showcase}
      </div></div>`;
    }

    // Landing for the email-verification link (/app/#verify=<token>).
    function VerifyPage({ token, onVerified, onBackToLogin }){
      const [state,setState]=useState('checking');
      const [email,setEmail]=useState('');
      const [msg,setMsg]=useState('');

      useEffect(()=>{
        let alive=true;
        (async()=>{
          try{
            const { data, error } = await supabase.rpc('verify_tenant_email',{ p_token:token });
            if(!alive) return;
            if(error || !data || data.error){
              setState('error');
              setMsg(data?.error==='expired'?'This link has expired. Please sign up again.':'This verification link is invalid.');
              return;
            }
            setEmail(data.email||''); setState('ok');
          }catch(_){ if(alive){ setState('error'); setMsg('Could not verify right now. Try the link again.'); } }
        })();
        return ()=>{ alive=false; };
      },[token]);

      const showcase=h`<${Showcase}
        headline="Your workspace is almost ready."
        sub="One last step and your agency goes live — set a password and you’re in."/>`;

      return h`<div class="auth-stage"><div class="auth-shell">
        <div class="auth-form-side">
          <div class="auth-foot-top">${brandBadge}</div>
          <div class="auth-form-inner" style=${{textAlign:'center'}}>
            ${state==='checking'&&h`<div><i class="ti ti-loader-2 spinner" style=${{fontSize:30,color:'var(--brand)'}}></i><p class="auth-sub" style=${{marginTop:16}}>Verifying your email…</p></div>`}
            ${state==='ok'&&h`<div>
              <div class="saas-mark" style=${{margin:'0 auto 16px',width:48,height:48,fontSize:24,borderRadius:14}}>✓</div>
              <h1 class="auth-h1">Email verified</h1>
              <p class="auth-sub">Set your password to sign in${email?h` as <strong style=${{color:'var(--t1)'}}>${email}</strong>`:''}.</p>
              <button class="auth-submit" onClick=${()=>onVerified(email)}>Set password & continue <i class="ti ti-arrow-right"></i></button>
            </div>`}
            ${state==='error'&&h`<div>
              <div class="saas-mark" style=${{margin:'0 auto 16px',width:48,height:48,fontSize:24,borderRadius:14,background:'linear-gradient(135deg,#F87171,#B91C1C)'}}>!</div>
              <h1 class="auth-h1">Verification failed</h1>
              <p class="auth-sub">${msg}</p>
              <button class="auth-submit" onClick=${onBackToLogin}><i class="ti ti-arrow-left"></i> Back to sign in</button>
            </div>`}
          </div>
        </div>
        ${showcase}
      </div></div>`;
    }

    return { SignupPage, VerifyPage };
  }
  window.AMS_SIGNUP = { buildSignup };
})();

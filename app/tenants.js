// tenants.js — platform-owner console for managing customer agencies (tenants).
// Only reachable by an admin of the platform org (#1); every RPC re-checks that
// server-side via _require_platform_owner. window.AMS_TENANTS.buildTenants(deps)
// -> { TenantsApp }. Styled with the app's .saas-* kit. Plain script; bump ?v=.
(function(){
  function buildTenants(deps){
    const { React, h, useState, useEffect, rpcCall, supabase } = deps;

    // Plan list comes from the live catalog (plans_get, migration 058 — anon,
    // active plans sorted by sort_order/price) so plans created in the editor
    // below show up in the provision dropdown too. Constant = fallback only.
    const PLAN_FALLBACK=[{key:'starter',label:'Starter'},{key:'growth',label:'Growth'},{key:'agency',label:'Agency'}];
    let _planCache=null;
    async function fetchPlans(){
      if(_planCache)return _planCache;
      try{
        const { data, error } = await supabase.rpc('plans_get');
        if(!error&&Array.isArray(data)&&data.length){_planCache=data;return data;}
      }catch(_){}
      return PLAN_FALLBACK;
    }
    const STATUS_COLOR={active:'var(--green)',trialing:'var(--amber)',past_due:'var(--red)',suspended:'var(--red)',cancelled:'var(--t3)'};
    const fmtDate=(iso)=>iso?new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}):'—';

    function Badge({status,byOperator}){
      const c=STATUS_COLOR[status]||'var(--t3)';
      // suspended_by_operator (migration 076): suspension was applied from this
      // console, not by a billing failure — show it distinctly so the operator
      // knows webhooks won't silently re-activate it.
      if(status==='suspended'&&byOperator){
        return h`<span class="saas-pill" style=${{color:c,borderColor:'rgba(220,38,38,.35)',background:'rgba(220,38,38,.08)',fontWeight:600}} title="Suspended by the platform operator — stays locked until you reactivate it here">
          <i class="ti ti-hand-stop" style=${{fontSize:12,marginRight:4}}></i>suspended · operator</span>`;
      }
      return h`<span class="saas-pill" style=${{color:c,borderColor:'transparent',background:'transparent',padding:0,fontWeight:600}}>
        <span class="saas-dot" style=${{background:c}}></span>${status}</span>`;
    }

    function ProvisionForm({ onDone }){
      const [open,setOpen]=useState(false);
      const [org,setOrg]=useState(''); const [email,setEmail]=useState(''); const [name,setName]=useState('');
      const [plans,setPlans]=useState(PLAN_FALLBACK);
      const [plan,setPlan]=useState('starter');
      const [busy,setBusy]=useState(false); const [msg,setMsg]=useState(''); const [err,setErr]=useState('');
      useEffect(()=>{ let alive=true; fetchPlans().then(rows=>{ if(!alive)return; setPlans(rows); if(rows.length&&!rows.some(p=>p.key===plan))setPlan(rows[0].key); }); return()=>{alive=false;}; },[]);

      const submit=async()=>{
        if(!org.trim()||!email.trim()){ setErr('Agency name and admin email are required.'); return; }
        setBusy(true); setErr(''); setMsg('');
        try{
          await rpcCall('platform_provision_tenant',{ p_org_name:org.trim(), p_admin_email:email.trim().toLowerCase(), p_admin_name:name.trim(), p_plan:plan });
          setMsg(`Created ${org.trim()}. The admin signs in at /app with ${email.trim().toLowerCase()} (blank password → set password).`);
          setOrg(''); setEmail(''); setName(''); onDone && onDone();
        }catch(e){
          const m=String(e.message||e.code||'');
          setErr(m.includes('email_taken')?'That email already exists in the workspace.':m.includes('forbidden')?'Not permitted.':'Could not provision tenant.');
        }
        setBusy(false);
      };

      if(!open) return h`<button class="saas-btn" onClick=${()=>setOpen(true)}><i class="ti ti-plus"></i> Provision tenant</button>`;
      return h`<div class="saas-card" style=${{padding:18,maxWidth:560,width:'100%'}}>
        <div style=${{fontWeight:600,marginBottom:12,color:'var(--t1)'}}>Provision a new tenant</div>
        <div style=${{display:'grid',gap:10}}>
          <input class="saas-input" placeholder="Agency name" value=${org} onInput=${e=>setOrg(e.target.value)}/>
          <input class="saas-input" placeholder="Admin email" value=${email} onInput=${e=>setEmail(e.target.value)}/>
          <input class="saas-input" placeholder="Admin name (optional)" value=${name} onInput=${e=>setName(e.target.value)}/>
          <select class="saas-input" value=${plan} onChange=${e=>setPlan(e.target.value)}>
            ${plans.map(p=>h`<option key=${p.key} value=${p.key}>${p.label||p.key[0].toUpperCase()+p.key.slice(1)}${p.price_paise!=null?` — ₹${Math.round(p.price_paise/100).toLocaleString('en-IN')}/mo`:''}</option>`)}
          </select>
        </div>
        ${err&&h`<div style=${{color:'var(--red)',fontSize:13,marginTop:10}}><i class="ti ti-alert-circle"></i> ${err}</div>`}
        ${msg&&h`<div style=${{color:'var(--green)',fontSize:13,marginTop:10}}><i class="ti ti-check"></i> ${msg}</div>`}
        <div style=${{display:'flex',gap:10,marginTop:14}}>
          <button class="saas-btn" onClick=${submit} disabled=${busy}>${busy?'Creating…':'Create tenant'}</button>
          <button class="saas-btn-ghost" onClick=${()=>{setOpen(false);setErr('');setMsg('');}}>Close</button>
        </div>
      </div>`;
    }

    function PlanEditorCard({ plan, onSaved }){
      const [d,setD]=useState({
        label:plan.label||'', price:String(Math.round((plan.price_paise||0)/100)),
        max_clients:String(plan.max_clients==null?-1:plan.max_clients), max_seats:String(plan.max_seats==null?-1:plan.max_seats),
        features:(plan.features||[]).join('\n'), razorpay_plan_id:plan.razorpay_plan_id||'',
        active:plan.active!==false,
      });
      const [busy,setBusy]=useState(false); const [msg,setMsg]=useState(''); const [err,setErr]=useState('');
      const set=(k,v)=>setD(s=>({...s,[k]:v}));
      const save=async()=>{
        setBusy(true); setErr(''); setMsg('');
        try{
          await rpcCall('plans_upsert',{ p_key:plan.key, p_patch:{
            label:d.label.trim(), price_paise:Math.round((parseFloat(d.price)||0)*100),
            max_clients:parseInt(d.max_clients,10), max_seats:parseInt(d.max_seats,10),
            features:d.features.split('\n').map(s=>s.trim()).filter(Boolean),
            razorpay_plan_id:d.razorpay_plan_id.trim(), active:!!d.active,
          }});
          setMsg('Saved ✓'); _planCache=null; onSaved&&onSaved();
        }catch(e){ setErr(String(e.message||e.code||'')||'Save failed.'); }
        setBusy(false);
      };
      const lbl={};
      return h`<div class="saas-card" style=${{padding:18}}>
        <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div class="saas-plan-name" style=${{fontSize:17,textTransform:'capitalize'}}>${plan.key}</div>
          <label style=${{fontSize:12,display:'flex',alignItems:'center',gap:6,color:'var(--t2)'}}><input type="checkbox" checked=${d.active} onChange=${e=>set('active',e.target.checked)} style=${{accentColor:'var(--brand)'}}/> Active</label>
        </div>
        <div style=${{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <div><label class="saas-field-lbl">Label</label><input class="saas-input" value=${d.label} onInput=${e=>set('label',e.target.value)}/></div>
          <div><label class="saas-field-lbl">Price ₹/mo (display)</label><input class="saas-input" value=${d.price} onInput=${e=>set('price',e.target.value)}/></div>
          <div><label class="saas-field-lbl">Max clients (-1 = ∞)</label><input class="saas-input" value=${d.max_clients} onInput=${e=>set('max_clients',e.target.value)}/></div>
          <div><label class="saas-field-lbl">Max seats (-1 = ∞)</label><input class="saas-input" value=${d.max_seats} onInput=${e=>set('max_seats',e.target.value)}/></div>
        </div>
        <div style=${{marginTop:10}}><label class="saas-field-lbl">Features (one per line)</label><textarea class="saas-input" style=${{minHeight:74,resize:'vertical'}} value=${d.features} onInput=${e=>set('features',e.target.value)}></textarea></div>
        <div style=${{marginTop:10}}><label class="saas-field-lbl">Razorpay Plan ID <span style=${{color:'var(--amber)'}}>· what customers are actually charged</span></label><input class="saas-input" style=${{fontFamily:'ui-monospace,monospace',fontSize:12.5}} placeholder="plan_xxxxxxxx" value=${d.razorpay_plan_id} onInput=${e=>set('razorpay_plan_id',e.target.value)}/></div>
        ${err&&h`<div style=${{color:'var(--red)',fontSize:12,marginTop:8}}>${err}</div>`}
        ${msg&&h`<div style=${{color:'var(--green)',fontSize:12,marginTop:8}}>${msg}</div>`}
        <button class="saas-btn" style=${{marginTop:13,padding:'8px 18px'}} onClick=${save} disabled=${busy}>${busy?'Saving…':'Save'}</button>
      </div>`;
    }

    function PlansEditor(){
      const [open,setOpen]=useState(false);
      const [plans,setPlans]=useState(null);
      const load=async()=>{
        try{ const rows=await rpcCall('plans_list_admin'); setPlans(Array.isArray(rows)?rows:[]); return; }catch(_){}
        try{ const { data } = await supabase.rpc('plans_get'); setPlans(Array.isArray(data)?data:[]); }catch(_){ setPlans([]); }
      };
      useEffect(()=>{ if(open && plans===null) load(); },[open]);
      return h`<div style=${{marginTop:30}}>
        <button class="saas-btn-ghost" onClick=${()=>setOpen(o=>!o)}>
          <i class=${'ti '+(open?'ti-chevron-down':'ti-chevron-right')}></i> Plans & pricing
        </button>
        ${open && h`<div style=${{marginTop:16}}>
          <p class="saas-sub" style=${{marginBottom:14,maxWidth:700,fontSize:13}}>
            Edit what customers see at signup and in their Subscription tab. <strong style=${{color:'var(--t1)'}}>The price field is for display</strong> — to change what they’re actually billed, create a new <em>monthly</em> plan in Razorpay and paste its Plan ID here (Razorpay plans are immutable). Existing subscribers keep their price until they change plans.
          </p>
          ${plans===null?h`<div style=${{color:'var(--t3)'}}><i class="ti ti-loader-2 spinner"></i> Loading plans…</div>`
            :h`<div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:14}}>
              ${plans.map(p=>h`<${PlanEditorCard} key=${p.key} plan=${p} onSaved=${load}/>`)}
            </div>`}
        </div>`}
      </div>`;
    }

    function TenantsApp(){
      const [orgs,setOrgs]=useState(null);
      const [err,setErr]=useState('');
      const [busyId,setBusyId]=useState('');
      const [q,setQ]=useState('');

      const load=async()=>{
        try{ const rows=await rpcCall('platform_orgs_list'); setOrgs(rows||[]); }
        catch(e){ setErr(String(e.code||e.message||'').includes('forbidden')?'You are not a platform owner.':'Could not load tenants.'); }
      };
      useEffect(()=>{ load(); },[]);

      const setStatus=async(o,status)=>{
        setBusyId(o.id);
        try{ await rpcCall('platform_set_org_status',{ p_org_id:o.id, p_status:status }); await load(); }
        catch(_){ setErr('Could not update status.'); }
        setBusyId('');
      };

      if(err) return h`<div style=${{padding:32,color:'var(--red)'}}><i class="ti ti-lock"></i> ${err}</div>`;
      if(orgs===null) return h`<div style=${{padding:32,color:'var(--t3)'}}><i class="ti ti-loader-2 spinner"></i> Loading tenants…</div>`;

      const customers=orgs.filter(o=>o.id!=='00000000-0000-0000-0000-000000000001');
      const needle=q.trim().toLowerCase();
      const visible=needle
        ?customers.filter(o=>[o.name,o.slug,o.admin_email,o.plan,o.status].some(v=>String(v||'').toLowerCase().includes(needle)))
        :customers;

      return h`<div style=${{padding:'26px 28px'}}>
        <div style=${{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:16,marginBottom:20,flexWrap:'wrap'}}>
          <div>
            <h1 class="saas-h1">Tenants</h1>
            <div class="saas-sub">${customers.length} customer ${customers.length===1?'agency':'agencies'} on My Digital Sevak</div>
          </div>
          <${ProvisionForm} onDone=${load}/>
        </div>
        ${customers.length>0&&h`<div style=${{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
          <div style=${{position:'relative',flex:'1 1 260px',maxWidth:360}}>
            <i class="ti ti-search" style=${{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'var(--t3)',pointerEvents:'none'}}></i>
            <input class="saas-input" style=${{width:'100%',paddingLeft:32}} placeholder="Search agency, email, plan, status…" value=${q} onInput=${e=>setQ(e.target.value)}/>
          </div>
          ${needle&&h`<span style=${{fontSize:12,color:'var(--t3)'}}>${visible.length} of ${customers.length} match</span>`}
        </div>`}
        <div class="saas-wrap" style=${{overflowX:'auto'}}>
          <table class="saas-table">
            <thead><tr>
              <th>Agency</th><th>Plan</th><th>Status</th><th>Clients</th><th>Seats</th><th>Trial ends</th><th>Admin</th><th>Joined</th><th></th>
            </tr></thead>
            <tbody>
              ${customers.length===0 && h`<tr><td colSpan=9 style=${{textAlign:'center',color:'var(--t3)',padding:'30px'}}>No customer agencies yet. Provision one or share your signup link.</td></tr>`}
              ${customers.length>0 && visible.length===0 && h`<tr><td colSpan=9 style=${{textAlign:'center',color:'var(--t3)',padding:'30px'}}>No agencies match “${q.trim()}”.</td></tr>`}
              ${visible.map(o=>{
                const suspended=['suspended','cancelled'].includes(o.status);
                const byOperator=!!o.suspended_by_operator; // migration 076; absent on older DBs
                return h`<tr key=${o.id} style=${byOperator?{background:'rgba(220,38,38,.03)'}:undefined}>
                  <td><div style=${{fontWeight:600,color:'var(--t1)'}}>${o.name}</div><div style=${{color:'var(--t3)',fontSize:11}}>${o.slug||''}${o.email_verified?'':' · unverified'}</div></td>
                  <td style=${{textTransform:'capitalize'}}>${o.plan}</td>
                  <td><${Badge} status=${o.status} byOperator=${byOperator}/></td>
                  <td>${o.clients}</td>
                  <td>${o.seats}</td>
                  <td>${fmtDate(o.trial_ends_at)}</td>
                  <td style=${{color:'var(--t2)'}}>${o.admin_email||'—'}</td>
                  <td>${fmtDate(o.created_at)}</td>
                  <td style=${{whiteSpace:'nowrap',textAlign:'right'}}>
                    ${suspended
                      ? h`<button class="saas-pill" style=${{cursor:'pointer',color:'var(--green)',borderColor:'rgba(21,128,61,.4)'}} disabled=${busyId===o.id} onClick=${()=>setStatus(o,'active')}>${byOperator?'Unsuspend':'Reactivate'}</button>`
                      : h`<button class="saas-pill" style=${{cursor:'pointer',color:'var(--red)',borderColor:'rgba(220,38,38,.4)'}} disabled=${busyId===o.id} onClick=${()=>setStatus(o,'suspended')}>Suspend</button>`}
                  </td>
                </tr>`;
              })}
            </tbody>
          </table>
        </div>
        <${PlansEditor}/>
      </div>`;
    }

    return { TenantsApp };
  }
  window.AMS_TENANTS = { buildTenants };
})();

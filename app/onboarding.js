// onboarding.js — client onboarding feature: 5 main components (Phase 3.3 split).
// The onboarding sub-panels + PDF/contract helpers stay in index.html (several are shared
// with client-creation / report PDF code) and are injected. window.AMS_ONBOARDING.buildOnboarding(deps)
// -> { OnboardingInProgressCard, OnboardingTemplatesSection, OnboardingSubmissionPane, SendOnboardingModal, SendContractModal }.
(function(){
  function buildOnboarding(deps){
    const {React,h,useState,useEffect,useRef,useCallback,useMemo,db,rpcCall,isPrivilegedRole,writeHash,t,ensureClientLogin,useTeamNames,getAgencyForPdf,generateContractHTML,generateOnboardingKitHTML,generateAndUploadContractPdf,generateAndUploadOnboardingKit,sendOnboardingContractFn,sendOnboardingEmail,OBPill,OB_STAGE_LBL,OBTemplatesSubNav,ScopePackagesPanel,ContractTemplatesPanel,WelcomeKitTemplatesPanel,FormTemplatesPanel} = deps;

    // Drive preview service account — every client folder must be shared with
    // this address (Viewer) or post previews silently break. See CLAUDE.md.
    const DRIVE_SA='ams-drive-preview@ams-dashboard-496318.iam.gserviceaccount.com';

    // ── OnboardingInProgressCard ──
function OnboardingInProgressCard({clients,user}){
  if(!isPrivilegedRole(user?.role_level))return null;
  const active=Object.values(clients||{}).filter(c=>c.onboarding_status&&!['not_started','onboarded'].includes(c.onboarding_status)&&(c.status||'active')!=='inactive');
  if(active.length===0)return null;
  const open=(c)=>writeHash({tab:'clients',clientId:c.id,clientTab:'overview'});
  // Count by stage so admin sees the pipeline shape at a glance.
  const byStage={};active.forEach(c=>{byStage[c.onboarding_status]=(byStage[c.onboarding_status]||0)+1;});
  return h`<div style=${{background:'linear-gradient(135deg,rgba(29,78,216,.06),rgba(29,78,216,.02))',border:'1px solid rgba(29,78,216,.18)',borderRadius:'var(--r)',padding:'14px 16px',marginBottom:16}}>
    <div style=${{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
      <i class="ti ti-route" style=${{fontSize:18,color:'#1D4ED8'}}></i>
      <div style=${{flex:1}}>
        <div style=${{fontSize:13.5,fontWeight:600,color:'var(--t1)'}}>Onboarding in progress · ${active.length}</div>
        <div style=${{fontSize:11.5,color:'var(--t2)',marginTop:1}}>${Object.entries(byStage).map(([s,n])=>`${n} ${OB_STAGE_LBL[s].toLowerCase()}`).join(' · ')}</div>
      </div>
    </div>
    <div style=${{display:'flex',gap:6,flexWrap:'wrap'}}>
      ${active.map(c=>h`<button key=${c.id} onClick=${()=>open(c)} style=${{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 10px',background:'var(--surface)',border:'1px solid var(--bd)',borderRadius:999,fontSize:12,color:'var(--t1)',cursor:'pointer'}}>
        <span style=${{width:7,height:7,borderRadius:'50%',background:c.brand_color_primary||'#1D4ED8'}}></span>
        ${c.name}
        <${OBPill} status=${c.onboarding_status}/>
      </button>`)}
    </div>
  </div>`;
}

    // ── OnboardingTemplatesSection ──
function OnboardingTemplatesSection({showToast}){
  const[tab,setTab]=useState('forms');
  return h`<div>
    <div style=${{fontSize:20,fontWeight:500,color:'var(--t1)',marginBottom:8}}>Onboarding</div>
    <div style=${{fontSize:13,color:'var(--t2)',marginBottom:20,maxWidth:640,lineHeight:1.55}}>Create separate onboarding flows, contracts and scope packages per service type — e.g. one set for social media, another for SEO, another for web development. The Send Onboarding modal lets admin pick which to use per client.</div>
    <${OBTemplatesSubNav} tab=${tab} setTab=${setTab}/>
    ${tab==='forms'&&h`<${FormTemplatesPanel} showToast=${showToast}/>`}
    ${tab==='contracts'&&h`<${ContractTemplatesPanel} showToast=${showToast}/>`}
    ${tab==='scope'&&h`<${ScopePackagesPanel} showToast=${showToast}/>`}
    ${tab==='kit'&&h`<${WelcomeKitTemplatesPanel} showToast=${showToast}/>`}
  </div>`;
}

    // ── OnboardingSubmissionPane ──
function OnboardingSubmissionPane({c,currentUser}){
  const isPriv=isPrivilegedRole(currentUser?.role_level);
  const[sub,setSub]=useState(null);
  const[fieldDefs,setFieldDefs]=useState([]);
  const[creds,setCreds]=useState([]);
  const[contract,setContract]=useState(null);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState('');
  const[revealed,setRevealed]=useState({});  // {field_key: 'plaintext' or 'loading' or 'error'}

  useEffect(()=>{
    if(!c.onboarding_submission_id){setLoading(false);return;}
    (async()=>{
      try{
        const[s,latest]=await Promise.all([
          rpcCall('get_onboarding_submission',{p_submission_id:c.onboarding_submission_id}),
          db('contracts',`&client_id=eq.${c.id}&order=created_at.desc&limit=1`),
        ]);
        const sub=s?.[0]||null;
        setSub(sub);setContract(latest?.[0]||null);
        if(sub){
          const defs=await db('onboarding_field_defs',`&template_id=eq.${sub.template_id}&order=step,sort_order`);
          setFieldDefs(defs||[]);
        }
        // list_credentials is admin/manager gated server-side; safe to try.
        if(isPriv){
          try{const credList=await rpcCall('list_credentials',{p_client_id:c.id});setCreds(Array.isArray(credList)?credList:[]);}
          catch(e){console.warn('[OBSub] list_credentials',e);}
        }
      }catch(e){console.error('[OBSub] load',e);setErr('Failed to load submission.');}
      finally{setLoading(false);}
    })();
  },[c.id,c.onboarding_submission_id,isPriv]);

  const reveal=async(field_key)=>{
    setRevealed(r=>({...r,[field_key]:'loading'}));
    try{
      const data=await rpcCall('read_credential',{p_client_id:c.id,p_field_key:field_key});
      if(data?.found){
        setRevealed(r=>({...r,[field_key]:String(data.value||'')}));
      }else{
        setRevealed(r=>({...r,[field_key]:'error'}));
      }
    }catch(e){
      console.warn('[OBSub] reveal failed',e);
      setRevealed(r=>({...r,[field_key]:'error'}));
    }
  };
  const hide=(field_key)=>setRevealed(r=>{const next={...r};delete next[field_key];return next;});
  const copy=async(field_key,value)=>{
    try{await navigator.clipboard.writeText(value);}catch(_){/* clipboard may be blocked */}
  };

  if(!c.onboarding_submission_id)return null;
  if(loading)return h`<div class="ce-section"><div class="ce-section-lbl"><i class="ti ti-clipboard-check" style=${{fontSize:13,color:'#ff00ee'}}></i>Onboarding submission</div><div style=${{padding:'14px 0',color:'var(--t3)',fontSize:12}}><i class="ti ti-loader-2 spinner"></i> Loading submission…</div></div>`;
  if(err)return h`<div class="ce-section"><div class="ce-section-lbl"><i class="ti ti-alert-circle"></i>Onboarding submission</div><div style=${{padding:'10px 0',color:'#DC2626',fontSize:12}}>${err}</div></div>`;
  if(!sub)return null;

  const formData=sub.form_data||{};
  // Non-password fields with values, grouped by step.
  const filledDefs=(fieldDefs||[]).filter(f=>f.field_type!=='password'&&formData[f.key]!==undefined&&formData[f.key]!=='');
  const byStep={};filledDefs.forEach(f=>{(byStep[f.step]=byStep[f.step]||[]).push(f);});
  const submittedStr=sub.submitted_at?new Date(sub.submitted_at).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}):'Not yet submitted';

  return h`<div class="ce-section">
    <div class="ce-section-lbl"><i class="ti ti-clipboard-check" style=${{fontSize:13,color:'#ff00ee'}}></i>Onboarding submission<span class="ce-section-meta">${submittedStr}</span></div>
    ${sub.status!=='submitted'&&h`<div style=${{background:'#FEF3C7',color:'#92400E',padding:'9px 12px',borderRadius:7,fontSize:12,marginBottom:12,display:'flex',alignItems:'center',gap:8}}><i class="ti ti-clock-hour-4"></i>Client hasn't submitted yet — only partial data available.</div>`}

    <div style=${{background:'var(--bg)',borderRadius:8,padding:'12px 14px',marginBottom:12}}>
      <div style=${{fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--t3)',fontWeight:600,marginBottom:8}}>Answers</div>
      ${Object.keys(byStep).length===0?h`<div style=${{fontSize:12,color:'var(--t3)'}}>No answers yet.</div>`:
      [1,2,3,4,5].map(stepNo=>byStep[stepNo]&&h`<div key=${stepNo} style=${{marginBottom:10}}>
        <div style=${{fontSize:10.5,textTransform:'uppercase',letterSpacing:'.1em',color:'var(--t3)',fontWeight:600,marginBottom:4}}>Step ${stepNo}</div>
        ${byStep[stepNo].map(f=>h`<div key=${f.key} style=${{display:'flex',gap:10,padding:'5px 0',borderTop:'1px solid var(--bd)',fontSize:12.5,alignItems:'flex-start'}}>
          <div style=${{flex:'0 0 38%',color:'var(--t2)'}}>${f.label}</div>
          <div style=${{flex:1,color:'var(--t1)',whiteSpace:'pre-wrap'}}>${String(formData[f.key]||'')}</div>
        </div>`)}
      </div>`)}
    </div>

    ${isPriv&&creds.length>0&&h`<div style=${{background:'var(--bg)',borderRadius:8,padding:'12px 14px',marginBottom:12,border:'1px solid rgba(255,0,238,.12)'}}>
      <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <div style=${{fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'#ff00ee',fontWeight:600,display:'flex',alignItems:'center',gap:6}}><i class="ti ti-shield-lock" style=${{fontSize:14}}></i>Encrypted credentials · ${creds.length}</div>
        <div style=${{fontSize:10,color:'var(--t3)'}}>Reveal logs to audit</div>
      </div>
      ${creds.map(cr=>{
        const v=revealed[cr.field_key];
        const isLoading=v==='loading';const isError=v==='error';const isShown=v&&v!=='loading'&&v!=='error';
        return h`<div key=${cr.field_key} style=${{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderTop:'1px solid var(--bd)',fontSize:12.5}}>
          <div style=${{flex:'0 0 38%',color:'var(--t2)'}}>${cr.label||cr.field_key}</div>
          <div style=${{flex:1,fontFamily:isShown?'monospace':'inherit',color:isShown?'var(--t1)':'var(--t3)',wordBreak:'break-all'}}>${isShown?v:isError?h`<span style=${{color:'#DC2626'}}>Could not decrypt</span>`:'••••••••'}</div>
          <div style=${{display:'flex',gap:4}}>
            ${isShown?h`<button onClick=${()=>copy(cr.field_key,v)} title="Copy" style=${{background:'transparent',border:'1px solid var(--bd)',borderRadius:6,padding:'4px 8px',fontSize:11,cursor:'pointer',color:'var(--t2)'}}><i class="ti ti-copy"></i></button>
              <button onClick=${()=>hide(cr.field_key)} title="Hide" style=${{background:'transparent',border:'1px solid var(--bd)',borderRadius:6,padding:'4px 8px',fontSize:11,cursor:'pointer',color:'var(--t2)'}}><i class="ti ti-eye-off"></i></button>`
            :h`<button onClick=${()=>reveal(cr.field_key)} disabled=${isLoading} style=${{background:'transparent',border:'1px solid rgba(255,0,238,.4)',borderRadius:6,padding:'4px 10px',fontSize:11,cursor:'pointer',color:'#ff00ee',fontWeight:500}}>${isLoading?h`<i class="ti ti-loader-2 spinner"></i>`:h`<span><i class="ti ti-eye"></i> Reveal</span>`}</button>`}
          </div>
        </div>`;
      })}
    </div>`}

    ${contract&&h`<div style=${{background:'var(--bg)',borderRadius:8,padding:'12px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:10,fontSize:12.5}}>
      <i class="ti ti-file-signature" style=${{fontSize:18,color:contract.status==='signed'?'#15803D':'#B45309'}}></i>
      <div style=${{flex:1}}>
        <div style=${{color:'var(--t1)',fontWeight:500}}>Contract · ${contract.status}</div>
        <div style=${{color:'var(--t3)',fontSize:11,marginTop:1}}>${contract.signed_at?'Signed '+new Date(contract.signed_at).toLocaleString('en-IN',{day:'numeric',month:'short'}):contract.sent_at?'Sent '+new Date(contract.sent_at).toLocaleString('en-IN',{day:'numeric',month:'short'}):''}</div>
      </div>
      ${contract.pdf_url&&h`<a href=${contract.pdf_url} target="_blank" style=${{background:'transparent',border:'1px solid var(--bd)',borderRadius:6,padding:'5px 10px',fontSize:11,color:'var(--t1)',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:5}}><i class="ti ti-download"></i> PDF</a>`}
      ${contract.signing_url&&contract.status==='sent'&&h`<a href=${contract.signing_url} target="_blank" style=${{background:'transparent',border:'1px solid var(--bd)',borderRadius:6,padding:'5px 10px',fontSize:11,color:'var(--t1)',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:5}}><i class="ti ti-external-link"></i> Signing link</a>`}
    </div>`}

    ${c.onboarding_drive_folder_url&&h`<div style=${{fontSize:12,color:'var(--t2)',padding:'6px 0'}}><i class="ti ti-brand-google-drive" style=${{marginRight:6}}></i>Brand-assets folder: <a href=${c.onboarding_drive_folder_url} target="_blank" style=${{color:'var(--blue)',textDecoration:'none'}}>${c.onboarding_drive_folder_url}</a></div>`}
  </div>`;
}

    // ── SendOnboardingModal ──
function SendOnboardingModal({c,currentUser,onClose,onSent,showToast}){
  const[step,setStep]=useState(1);
  const[saving,setSaving]=useState(false);
  const[loading,setLoading]=useState(true);
  const[templates,setTemplates]=useState([]);
  const[contractTemplates,setContractTemplates]=useState([]);
  const[scopePackages,setScopePackages]=useState([]);
  const[kitTemplates,setKitTemplates]=useState([]);
  const[fieldDefs,setFieldDefs]=useState([]);
  const[disabledFields,setDisabledFields]=useState(()=>new Set());
  const[recipient,setRecipient]=useState(null);
  const teamNames=useTeamNames();
  const[form,setForm]=useState({
    templateId:'',
    contractTemplateId:'',
    scopePackageId:'',
    welcomeKitTemplateId:'',
    scopeName:'',
    scopeMonthlyFee:'',
    scopeTenureMonths:'',
    scopePaymentTerms:'',
    scopeDeliverables:'',
    teamLead:currentUser?.name||'',
    startDate:new Date(Date.now()+86400000).toISOString().slice(0,10),
    driveFolderUrl:'',
    introNote:'',
    subject:'',
  });
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const[agency,setAgency]=useState(null);   // org's agency_settings — white-labels the contract/kit placeholders

  // Load all templates + scope packages + figure out recipient once.
  useEffect(()=>{
    (async()=>{
      try{
        const[t,ct,sp,kt,login,ag]=await Promise.all([
          db('onboarding_templates','&is_active=eq.true&order=is_default.desc,name'),
          db('contract_templates','&is_active=eq.true&order=is_default.desc,name'),
          db('scope_packages','&is_active=eq.true&order=is_default.desc,sort_order'),
          // Welcome Kit templates — gracefully degrade if migration 028 not run
          db('welcome_kit_templates','&is_active=eq.true&order=is_default.desc,name').catch(()=>[]),
          // For recipient fallback if contact_email is missing.
          db('team_members',`&client_id=eq.${c.id}&role_level=eq.client&select=email&limit=1`),
          // Agency identity for {{agency_name}}/{{agency_access_email}} — per-org, never hardcoded.
          getAgencyForPdf().catch(()=>({})),
        ]);
        setAgency(ag||{});
        setTemplates(t||[]);setContractTemplates(ct||[]);setScopePackages(sp||[]);setKitTemplates(kt||[]);
        const defT=(t||[]).find(x=>x.is_default)||t?.[0];
        const defCt=(ct||[]).find(x=>x.is_default)||ct?.[0];
        const defSp=(sp||[]).find(x=>x.is_default)||sp?.[0];
        const defKt=(kt||[]).find(x=>x.is_default)||kt?.[0];
        setForm(f=>({
          ...f,
          templateId:defT?.id||'',
          contractTemplateId:defCt?.id||'',
          scopePackageId:defSp?.id||'',
          welcomeKitTemplateId:defKt?.id||'',
        }));
        setRecipient((c.contact_email||login?.[0]?.email||'').trim()||null);
      }catch(e){console.error('[SendOnboarding] load failed',e);showToast('Failed to load templates');}
      finally{setLoading(false);}
    })();
  },[c.id]);

  // Reload field defs when template changes.
  useEffect(()=>{
    if(!form.templateId)return;
    db('onboarding_field_defs',`&template_id=eq.${form.templateId}&order=step,sort_order`)
      .then(rows=>{setFieldDefs(rows||[]);setDisabledFields(new Set());})
      .catch(e=>console.warn('[SendOnboarding] fieldDefs',e));
  },[form.templateId]);

  const pickedScope=scopePackages.find(s=>s.id===form.scopePackageId);
  const pickedContract=contractTemplates.find(c=>c.id===form.contractTemplateId);
  const pickedKitTemplate=kitTemplates.find(k=>k.id===form.welcomeKitTemplateId)||null;

  // When the base scope package changes, prefill the override fields with
  // that package's values — the dropdown acts as "load template", and admin
  // can then freely customize the name / fee / tenure / deliverables for
  // this specific client.
  useEffect(()=>{
    if(!pickedScope)return;
    setForm(f=>({
      ...f,
      scopeName:pickedScope.name||'',
      scopeMonthlyFee:pickedScope.monthly_fee!=null?String(pickedScope.monthly_fee):'',
      scopeTenureMonths:pickedScope.default_tenure_months!=null?String(pickedScope.default_tenure_months):'6',
      scopePaymentTerms:pickedScope.default_payment_terms||'monthly',
      scopeDeliverables:Array.isArray(pickedScope.deliverables)?pickedScope.deliverables.join('\n'):'',
    }));
  },[pickedScope?.id]);

  // Build a scope object that reflects the live overrides — used for the
  // Welcome Kit PDF + engagement summary. Falls back to pickedScope fields.
  const customScope=useMemo(()=>{
    if(!pickedScope)return null;
    return{
      ...pickedScope,
      name:form.scopeName||pickedScope.name,
      monthly_fee:form.scopeMonthlyFee!==''?Number(form.scopeMonthlyFee)||0:pickedScope.monthly_fee,
      default_tenure_months:form.scopeTenureMonths!==''?Number(form.scopeTenureMonths)||0:pickedScope.default_tenure_months,
      default_payment_terms:form.scopePaymentTerms||pickedScope.default_payment_terms,
      deliverables:(form.scopeDeliverables||'').split('\n').map(s=>s.trim()).filter(Boolean),
    };
  },[pickedScope,form.scopeName,form.scopeMonthlyFee,form.scopeTenureMonths,form.scopePaymentTerms,form.scopeDeliverables]);

  // Resolve {{placeholders}} for the contract preview + submission snapshot.
  // Agency identity comes from agency_settings (per-org white-label) with
  // neutral fallbacks — never a hardcoded founder name/email.
  const placeholders=useMemo(()=>{
    const startStr=form.startDate?new Date(form.startDate).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}):'TBD';
    const deliv=(customScope?.deliverables||[]).map(d=>`- ${d}`).join('\n');
    const fee=Number(customScope?.monthly_fee)||0;
    const ord=(n)=>{const v=n%100;return(v>=11&&v<=13)?'th':n%10===1?'st':n%10===2?'nd':n%10===3?'rd':'th';};
    const invDay=c.invoice_day||1;
    return{
      client_name:c.name||'',
      agency_name:((agency&&(agency.trade_name||agency.legal_name))||'').trim()||'the Agency',
      agency_access_email:((agency&&agency.contact_email)||'').trim()||'(agency email — set it in Settings → Agency & invoicing)',
      team_lead:form.teamLead||'TBD',
      start_date:startStr,
      monthly_fee:fee?fee.toLocaleString('en-IN'):'',
      scope:customScope?.name||'',
      deliverables:deliv,
      payment_terms:customScope?.default_payment_terms||'monthly',
      tenure_months:String(customScope?.default_tenure_months||6),
      gst_treatment:customScope?.gst_treatment||'',
      invoice_day:String(invDay)+ord(invDay),
    };
  },[form,customScope,c,agency]);

  const contractResolved=useMemo(()=>{
    let body=pickedContract?.body||'';
    Object.entries(placeholders).forEach(([k,v])=>{body=body.split(`{{${k}}}`).join(v||'');});
    return body;
  },[pickedContract,placeholders]);

  // Step 1 / 2 inline validation (Send button enables only when valid).
  const canSend=!!recipient&&!!form.templateId&&!!form.contractTemplateId&&!!form.scopePackageId&&!!form.teamLead&&!!form.startDate;

  // Inline iframe preview — more reliable than window.open + Blob URL, which
  // gets flaky on repeat clicks (Chrome's user-gesture window expires after
  // the first await, leaving the popup as about:blank). Renders the same
  // HTML that html2pdf converts to the PDF that ships to the client.
  const[preview,setPreview]=useState(null); // {title,html} | null
  const _runPreview=async(buildHtml,title)=>{
    try{
      setPreview({title,html:'',loading:true});
      const html=await buildHtml();
      setPreview({title,html,loading:false});
    }catch(e){
      console.error('[preview]',e);
      setPreview({title,html:`<div style="font-family:system-ui;padding:40px;color:#c00">Preview failed: ${(e?.message||String(e)).replace(/</g,'&lt;')}</div>`,loading:false});
    }
  };
  const previewKit=()=>{
    if(!customScope&&!pickedScope){showToast('Pick a scope package first.');return;}
    return _runPreview(async()=>{
      const agency=await getAgencyForPdf();
      return generateOnboardingKitHTML({client:c,scope:customScope||pickedScope,teamLead:form.teamLead,startDate:form.startDate,intro:form.introNote,agency,template:pickedKitTemplate});
    },`Welcome Kit · ${c.name}`);
  };
  const previewContract=()=>{
    if(!contractResolved){showToast('Pick a contract template first.');return;}
    return _runPreview(async()=>{
      const agency=await getAgencyForPdf();
      return generateContractHTML({client:c,contractMarkdown:contractResolved,agency});
    },`Retainer contract · ${c.name}`);
  };

  // If the kickoff email fails we do NOT close/celebrate: the submission is
  // kept (never superseded by a retry) and the admin gets a "Retry email"
  // button that re-sends to the SAME submission.
  const[emailFail,setEmailFail]=useState(null); // {submissionId,kitUrl,msg,updated} | null
  const updatedClient=(submissionId)=>({...c,onboarding_status:'form_sent',onboarding_team_lead:form.teamLead,onboarding_submission_id:submissionId,onboarding_template_id:form.templateId,onboarding_contract_template_id:form.contractTemplateId,onboarding_scope_package_id:form.scopePackageId,onboarding_drive_folder_url:form.driveFolderUrl||c.onboarding_drive_folder_url});
  // Closing after a failed email still syncs the client row (the RPC already
  // flipped status server-side) so the UI doesn't lie about the pill.
  const doClose=()=>{ if(emailFail&&onSent)onSent(emailFail.updated); onClose(); };

  const send=async()=>{
    if(!canSend){showToast('Please complete every required field.');return;}
    setSaving(true);
    try{
      // 1. Spawn submission + flip status. RPC returns the submission row.
      //    Pass the chosen Welcome Kit template (migration 076); fall back to
      //    the legacy signature if that migration isn't applied yet.
      const excluded=Array.from(disabledFields);
      const baseArgs={
        p_client_id:c.id,
        p_template_id:form.templateId,
        p_contract_template_id:form.contractTemplateId,
        p_scope_package_id:form.scopePackageId,
        p_team_lead:form.teamLead,
        p_start_date:form.startDate,
        p_drive_folder_url:form.driveFolderUrl||null,
        p_template_overrides:{disabled:excluded},
        p_placeholders:placeholders,
      };
      let sub;
      try{
        sub=await rpcCall('create_onboarding_submission',{...baseArgs,p_welcome_kit_template_id:form.welcomeKitTemplateId||null});
      }catch(e){
        const m=String(e?.message||'')+' '+String(e?.code||'');
        if(/PGRST202|schema cache|could not find/i.test(m)){
          console.warn('[SendOnboarding] p_welcome_kit_template_id not supported yet — retrying without (apply migration 076)');
          sub=await rpcCall('create_onboarding_submission',baseArgs);
        }else throw e;
      }
      const submissionId=sub?.id;
      if(!submissionId)throw new Error('submission_create_failed');

      // 2. Make sure the client has a portal login. Admin never sees the
      //    team_members table for clients — it's stitched together here on
      //    Send Onboarding so the client can sign in the moment they click
      //    the link in their email. Idempotent.
      try{await ensureClientLogin(c);}
      catch(e){console.warn('[SendOnboarding] ensureClientLogin failed (non-fatal):',e?.message);}

      // 3. Welcome Kit PDF — best-effort (email still ships if this fails).
      showToast('Building Welcome Kit PDF…');
      const{url:kitUrl,error:kitErr}=await generateAndUploadOnboardingKit({
        submissionId,client:c,scope:customScope||pickedScope,
        teamLead:form.teamLead,startDate:form.startDate,intro:form.introNote,
        template:pickedKitTemplate,
      });
      if(kitErr)console.warn('[SendOnboarding] kit PDF failed (non-fatal):',kitErr);

      // 4. Send the email.
      const{ok,to,error,detail}=await sendOnboardingEmail({
        clientId:c.id,submissionId,kitPdfUrl:kitUrl,
        subject:form.subject,introNote:form.introNote,
      });
      if(!ok){
        // Keep the modal open with an explicit error + Retry — the client got
        // NOTHING, so don't celebrate or quietly close.
        const msg=detail||error||'unknown error';
        setEmailFail({submissionId,kitUrl,msg,updated:updatedClient(submissionId)});
        showToast(`Email failed — nothing reached the client. Use Retry email.`);
        return;
      }
      showToast(`Onboarding sent to ${to}`);

      // 5. Optimistic client update so the header pill flips immediately.
      if(onSent)onSent(updatedClient(submissionId));
      onClose();
    }catch(e){
      console.error('[SendOnboarding] send failed',e);
      showToast(`Send failed: ${e?.message||e}`);
    }finally{
      setSaving(false);
    }
  };

  // Re-send the kickoff email to the SAME submission — never re-creates (and
  // so never supersedes) the submission the client may already be filling.
  const retryEmail=async()=>{
    if(!emailFail)return;
    setSaving(true);
    try{
      const{ok,to,error,detail}=await sendOnboardingEmail({
        clientId:c.id,submissionId:emailFail.submissionId,kitPdfUrl:emailFail.kitUrl,
        subject:form.subject,introNote:form.introNote,
      });
      if(!ok){
        setEmailFail(f=>({...f,msg:detail||error||'unknown error'}));
        showToast('Email failed again — check the address / Resend status.');
        return;
      }
      showToast(`Onboarding sent to ${to}`);
      if(onSent)onSent(emailFail.updated);
      setEmailFail(null);
      onClose();
    }catch(e){
      setEmailFail(f=>({...f,msg:String(e?.message||e)}));
      showToast('Email failed again.');
    }finally{
      setSaving(false);
    }
  };

  const steps=['Form','Contract','Send'];
  // Group fieldDefs by step for the toggle UI.
  const fieldsByStep=useMemo(()=>{const out={};(fieldDefs||[]).forEach(f=>{(out[f.step]=out[f.step]||[]).push(f);});return out;},[fieldDefs]);
  const toggleField=(k)=>setDisabledFields(s=>{const next=new Set(s);if(next.has(k))next.delete(k);else next.add(k);return next;});
  const enabledCount=(fieldDefs||[]).filter(f=>!disabledFields.has(f.key)).length;

  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget&&!saving)doClose()}}>
    <div class="modal-box" style=${{width:680}}>
      <div class="modal-head">
        <div>
          <div style=${{fontSize:16,fontWeight:600,display:'flex',alignItems:'center',gap:8}}><i class="ti ti-send" style=${{fontSize:18,color:c.brand_color_primary||'#ff00ee'}}></i>Send onboarding · ${c.name}</div>
          <div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>Step ${step} of 3 — ${steps[step-1]} · current status: <${OBPill} status=${c.onboarding_status||'not_started'}/></div>
        </div>
        <button class="icon-btn" onClick=${doClose} disabled=${saving}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        <div class="step-bar">${steps.map((s,i)=>h`<div key=${i} class=${'step'+(step===i+1?' on':step>i+1?' done':'')}>${step>i+1?h`<i class="ti ti-check"></i> `:''} ${s}</div>`)}</div>
        ${loading&&h`<div style=${{padding:'40px 0',textAlign:'center',color:'var(--t3)'}}><i class="ti ti-loader-2 spinner"></i> Loading templates…</div>`}
        ${!loading&&step===1&&h`<div>
          <div class="fi-group">
            <div class="fi-lbl">Onboarding form template</div>
            <select class="fi fi-select" value=${form.templateId} onChange=${e=>set('templateId',e.target.value)}>
              ${templates.map(t=>h`<option key=${t.id} value=${t.id}>${t.name}${t.is_default?' (default)':''}</option>`)}
            </select>
          </div>
          <div style=${{background:'var(--bg)',borderRadius:'var(--r)',padding:14,marginBottom:14}}>
            <div style=${{fontSize:12,color:'var(--t2)',marginBottom:10,display:'flex',justifyContent:'space-between'}}>
              <span>Customize which fields the client sees. Toggle off any that don't apply.</span>
              <span style=${{color:'var(--t3)'}}>${enabledCount} of ${fieldDefs.length} active</span>
            </div>
            ${[1,2,3,4,5].map(stepNo=>fieldsByStep[stepNo]&&h`<div key=${stepNo} style=${{marginBottom:10}}>
              <div style=${{fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--t3)',fontWeight:600,marginBottom:6}}>Step ${stepNo}</div>
              ${fieldsByStep[stepNo].map(f=>{const on=!disabledFields.has(f.key);return h`<label key=${f.key} style=${{display:'flex',alignItems:'flex-start',gap:10,padding:'6px 8px',borderRadius:6,cursor:'pointer',background:on?'transparent':'rgba(220,38,38,.06)'}}>
                <input type="checkbox" checked=${on} onChange=${()=>toggleField(f.key)} style=${{marginTop:3}}/>
                <div style=${{flex:1}}>
                  <div style=${{fontSize:13,color:on?'var(--t1)':'var(--t3)',textDecoration:on?'none':'line-through'}}>${f.label}${f.required&&on?h` <span style=${{color:'#DC2626',fontSize:11}}>*</span>`:''}</div>
                  ${f.help_text&&h`<div style=${{fontSize:11,color:'var(--t3)',marginTop:1}}>${f.help_text}</div>`}
                </div>
                <span style=${{fontSize:10,padding:'2px 6px',background:'var(--bg)',color:'var(--t3)',borderRadius:4,textTransform:'uppercase',letterSpacing:'.06em'}}>${f.field_type.replace('_',' ')}</span>
              </label>`;})}
            </div>`)}
          </div>
        </div>`}
        ${!loading&&step===2&&h`<div>
          <div class="fi-grid fi-group">
            <div>
              <div class="fi-lbl">Contract template</div>
              <select class="fi fi-select" value=${form.contractTemplateId} onChange=${e=>set('contractTemplateId',e.target.value)}>
                ${contractTemplates.map(t=>h`<option key=${t.id} value=${t.id}>${t.name}${t.is_default?' (default)':''}</option>`)}
              </select>
            </div>
            <div>
              <div class="fi-lbl">Scope package (template)</div>
              <select class="fi fi-select" value=${form.scopePackageId} onChange=${e=>set('scopePackageId',e.target.value)}>
                ${scopePackages.map(s=>h`<option key=${s.id} value=${s.id}>${s.name}${s.monthly_fee!=null?` — ₹${Number(s.monthly_fee).toLocaleString('en-IN')}/mo`:''}</option>`)}
              </select>
            </div>
          </div>
          ${kitTemplates.length>0&&h`<div class="fi-group">
            <div class="fi-lbl">Welcome Kit template</div>
            <select class="fi fi-select" value=${form.welcomeKitTemplateId} onChange=${e=>set('welcomeKitTemplateId',e.target.value)}>
              ${kitTemplates.map(k=>h`<option key=${k.id} value=${k.id}>${k.name}${k.is_default?' (default)':''}</option>`)}
            </select>
            <div style=${{fontSize:11,color:'var(--t3)',marginTop:4}}>Edit the copy in <strong>Settings → Onboarding → Welcome Kit</strong>.</div>
          </div>`}
          ${pickedScope&&h`<div style=${{background:'var(--bg)',borderRadius:'var(--r)',padding:'14px 14px 6px',marginBottom:14,border:'1px solid var(--bd)'}}>
            <div style=${{fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--t3)',fontWeight:600,marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              <span>Engagement (customize per client)</span>
              <div style=${{display:'flex',gap:6}}>
                <button class="btn-sec" style=${{padding:'3px 10px',fontSize:11}} onClick=${previewKit} title="Open the Welcome Kit PDF in a new tab to verify before sending"><i class="ti ti-eye" style=${{fontSize:11}}></i> Preview Welcome Kit</button>
                <button class="btn-sec" style=${{padding:'3px 10px',fontSize:11}} onClick=${()=>{
                  setForm(f=>({
                    ...f,
                    scopeName:pickedScope.name||'',
                    scopeMonthlyFee:pickedScope.monthly_fee!=null?String(pickedScope.monthly_fee):'',
                    scopeTenureMonths:pickedScope.default_tenure_months!=null?String(pickedScope.default_tenure_months):'6',
                    scopePaymentTerms:pickedScope.default_payment_terms||'monthly',
                    scopeDeliverables:Array.isArray(pickedScope.deliverables)?pickedScope.deliverables.join('\n'):'',
                  }));
                }} title="Reset to template defaults"><i class="ti ti-refresh" style=${{fontSize:11}}></i> Reset</button>
              </div>
            </div>
            <div class="fi-grid fi-group">
              <div>
                <div class="fi-lbl">Package name</div>
                <input class="fi" type="text" value=${form.scopeName} onInput=${e=>set('scopeName',e.target.value)} placeholder="e.g. Growth+"/>
              </div>
              <div>
                <div class="fi-lbl">Monthly fee (₹)</div>
                <input class="fi" type="number" min="0" step="100" value=${form.scopeMonthlyFee} onInput=${e=>set('scopeMonthlyFee',e.target.value)} placeholder="35000"/>
              </div>
            </div>
            <div class="fi-grid fi-group">
              <div>
                <div class="fi-lbl">Tenure (months)</div>
                <input class="fi" type="number" min="1" step="1" value=${form.scopeTenureMonths} onInput=${e=>set('scopeTenureMonths',e.target.value)} placeholder="6"/>
              </div>
              <div>
                <div class="fi-lbl">Payment terms</div>
                <select class="fi fi-select" value=${form.scopePaymentTerms} onChange=${e=>set('scopePaymentTerms',e.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="half_yearly">Half-yearly</option>
                  <option value="yearly">Yearly</option>
                  <option value="upfront">Upfront</option>
                </select>
              </div>
            </div>
            <div class="fi-group">
              <div class="fi-lbl">Deliverables (one per line)</div>
              <textarea class="fi" rows="5" value=${form.scopeDeliverables} onInput=${e=>set('scopeDeliverables',e.target.value)} placeholder="16 social posts/month\n4 reels/month\n2 platforms\nMonthly report + 1 review call" style=${{fontFamily:'inherit',resize:'vertical'}}></textarea>
              <div style=${{fontSize:11,color:'var(--t3)',marginTop:4}}>These flow into the contract and the Welcome Kit PDF as a bulleted list.</div>
            </div>
          </div>`}
          <div class="fi-grid fi-group">
            <div>
              <div class="fi-lbl">Account lead *</div>
              <select class="fi fi-select" value=${form.teamLead} onChange=${e=>set('teamLead',e.target.value)}>
                <option value="">Pick team lead…</option>
                ${teamNames.map(n=>h`<option key=${n} value=${n}>${n}</option>`)}
              </select>
            </div>
            <div>
              <div class="fi-lbl">Start date *</div>
              <input class="fi" type="date" value=${form.startDate} onChange=${e=>set('startDate',e.target.value)}/>
            </div>
          </div>
          <div class="fi-group">
            <div class="fi-lbl">Shared Drive folder (optional)</div>
            <input class="fi" type="url" placeholder="https://drive.google.com/drive/folders/…" value=${form.driveFolderUrl} onInput=${e=>set('driveFolderUrl',e.target.value)}/>
            <div style=${{fontSize:11,color:'var(--t3)',marginTop:4}}>The client uses this to drop their logo + brand guide.</div>
            <div style=${{marginTop:8,padding:'10px 12px',background:'rgba(255,0,238,.05)',border:'1px solid rgba(255,0,238,.25)',borderRadius:8}}>
              <div style=${{fontSize:11.5,fontWeight:600,color:'#A8009C',marginBottom:6,display:'flex',alignItems:'center',gap:6}}><i class="ti ti-checklist" style=${{fontSize:13}}></i>Before sending — or every post preview breaks:</div>
              <div style=${{fontSize:11.5,color:'var(--t2)',lineHeight:1.6}}>
                <div style=${{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                  <span>1. Share the folder (Viewer) with</span>
                  <code style=${{fontSize:10.5,background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:5,padding:'2px 6px',wordBreak:'break-all'}}>${DRIVE_SA}</code>
                  <button type="button" class="btn-sec" style=${{padding:'2px 8px',fontSize:10.5}} onClick=${async()=>{try{await navigator.clipboard.writeText(DRIVE_SA);showToast('Service-account email copied ✓');}catch(_){showToast('Copy failed — select it manually');}}} title="Copy the service-account email"><i class="ti ti-copy" style=${{fontSize:11}}></i> Copy</button>
                </div>
                <div style=${{marginTop:3}}>2. <strong>Reels</strong> additionally need the folder (or each reel file) set to <strong>"Anyone with the link"</strong> — the service account alone can't stream video previews.</div>
              </div>
            </div>
          </div>
          <div class="fi-group">
            <div class="fi-lbl">Personal note (optional)</div>
            <textarea class="fi" rows="3" placeholder="A line or two that goes above the engagement block — e.g. context from the sales call." value=${form.introNote} onInput=${e=>set('introNote',e.target.value)}></textarea>
          </div>
          <div class="fi-group">
            <div class="fi-lbl">Subject line (optional)</div>
            <input class="fi" type="text" placeholder=${'Welcome aboard, '+c.name+' — let’s get started.'} value=${form.subject} onInput=${e=>set('subject',e.target.value)}/>
          </div>
        </div>`}
        ${!loading&&step===3&&h`<div>
          <div style=${{background:'var(--bg)',borderRadius:'var(--r)',padding:14,marginBottom:14}}>
            <div style=${{fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--t3)',fontWeight:600,marginBottom:6}}>Email preview</div>
            <div style=${{fontSize:13,marginBottom:4}}><span style=${{color:'var(--t3)'}}>To:</span> ${recipient||h`<span style=${{color:'#DC2626'}}>No email on file — add a contact email or create a portal login first.</span>`}</div>
            <div style=${{fontSize:13,marginBottom:4}}><span style=${{color:'var(--t3)'}}>Subject:</span> ${form.subject||`Welcome aboard, ${c.name} — let's get started.`}</div>
            <div style=${{fontSize:13}}><span style=${{color:'var(--t3)'}}>From:</span> ${'AMS <noreply@mydigitalsevak.in>'}</div>
          </div>
          <div style=${{background:'var(--bg)',borderRadius:'var(--r)',padding:14,marginBottom:14}}>
            <div style=${{fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--t3)',fontWeight:600,marginBottom:6}}>Engagement summary</div>
            <div style=${{fontSize:13,lineHeight:1.6,color:'var(--t1)'}}>
              <div>· Package: <strong>${customScope?.name||'—'}</strong> at ₹${(Number(customScope?.monthly_fee)||0).toLocaleString('en-IN')}/mo for ${customScope?.default_tenure_months||6} months · ${(customScope?.default_payment_terms||'monthly').replace('_',' ')}</div>
              ${customScope?.deliverables?.length>0&&h`<div style=${{marginTop:6,paddingLeft:14,fontSize:12,color:'var(--t2)'}}>${customScope.deliverables.map(d=>h`<div key=${d}>· ${d}</div>`)}</div>`}
              <div>· Start date: <strong>${form.startDate||'—'}</strong></div>
              <div>· Account lead: <strong>${form.teamLead||'—'}</strong></div>
              <div>· Onboarding form: <strong>${enabledCount} questions across 5 steps</strong></div>
              <div>· Welcome Kit PDF: auto-generated and attached to the email</div>
            </div>
          </div>
          <div style=${{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
            <button class="btn-sec" style=${{padding:'7px 14px',fontSize:12.5}} onClick=${previewKit}><i class="ti ti-eye"></i> Preview Welcome Kit PDF</button>
            <button class="btn-sec" style=${{padding:'7px 14px',fontSize:12.5}} onClick=${previewContract}><i class="ti ti-file-text"></i> Preview Contract PDF</button>
          </div>
          <details style=${{background:'var(--bg)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14}}>
            <summary style=${{cursor:'pointer',fontSize:12,fontWeight:600,color:'var(--t2)',letterSpacing:'.04em',textTransform:'uppercase'}}>Contract markdown (resolved)</summary>
            <pre style=${{whiteSpace:'pre-wrap',fontFamily:'Georgia,serif',fontSize:12.5,lineHeight:1.55,color:'var(--t2)',marginTop:10,maxHeight:320,overflowY:'auto'}}>${contractResolved}</pre>
          </details>
          ${!recipient&&h`<div class="err" style=${{marginBottom:12}}><i class="ti ti-alert-circle"></i>No recipient — add <code>contact_email</code> to the client row or create a client portal login before sending.</div>`}
          ${emailFail&&h`<div class="err" style=${{marginBottom:12}}>
            <i class="ti ti-mail-x"></i>
            <div>
              <div style=${{fontWeight:600}}>The kickoff email failed — the client received nothing.</div>
              <div style=${{fontSize:12,marginTop:3}}>${emailFail.msg}</div>
              <div style=${{fontSize:12,marginTop:3}}>The submission is saved. Use <strong>Retry email</strong> below — it re-sends to the same submission without resetting anything.</div>
            </div>
          </div>`}
        </div>`}
      </div>
      <div class="modal-foot">
        ${step===1&&h`<button class="btn-sec" onClick=${doClose} disabled=${saving}>Cancel</button><button class="btn-pri" onClick=${()=>setStep(2)} disabled=${loading||!form.templateId}>Next <i class="ti ti-arrow-right"></i></button>`}
        ${step===2&&h`<button class="btn-sec" onClick=${()=>setStep(1)} disabled=${saving}><i class="ti ti-arrow-left"></i> Back</button><button class="btn-pri" onClick=${()=>setStep(3)} disabled=${!form.contractTemplateId||!form.scopePackageId||!form.teamLead||!form.startDate}>Next <i class="ti ti-arrow-right"></i></button>`}
        ${step===3&&!emailFail&&h`<button class="btn-sec" onClick=${()=>setStep(2)} disabled=${saving}><i class="ti ti-arrow-left"></i> Back</button><button class="btn-pri" onClick=${send} disabled=${!canSend||saving}>${saving?h`<i class="ti ti-loader-2 spinner"></i> Sending…`:h`<i class="ti ti-send"></i> Send onboarding`}</button>`}
        ${step===3&&emailFail&&h`<button class="btn-sec" onClick=${doClose} disabled=${saving}>Close</button><button class="btn-pri" onClick=${retryEmail} disabled=${saving}>${saving?h`<i class="ti ti-loader-2 spinner"></i> Retrying…`:h`<i class="ti ti-mail-forward"></i> Retry email`}</button>`}
      </div>
    </div>
    ${preview&&h`<div style=${{position:'fixed',inset:0,background:'rgba(20,20,18,.55)',backdropFilter:'blur(6px)',WebkitBackdropFilter:'blur(6px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick=${e=>{if(e.target===e.currentTarget)setPreview(null);}}>
      <div style=${{background:'#fff',borderRadius:12,width:'min(900px,95vw)',height:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 12px 48px rgba(0,0,0,.35)',overflow:'hidden'}}>
        <div style=${{padding:'12px 16px',borderBottom:'1px solid #e8e8e5',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,background:'#fafaf8'}}>
          <div style=${{display:'flex',alignItems:'center',gap:10,minWidth:0}}>
            <i class="ti ti-eye" style=${{color:'#787774',fontSize:16}}></i>
            <div style=${{fontSize:13.5,fontWeight:600,color:'#1a1a1a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>${preview.title} — preview</div>
          </div>
          <button class="icon-btn" onClick=${()=>setPreview(null)} title="Close preview"><i class="ti ti-x"></i></button>
        </div>
        <div style=${{flex:1,overflow:'hidden',background:'#e8e2d6'}}>
          ${preview.loading?h`<div style=${{padding:60,textAlign:'center',color:'#787774',fontSize:13}}><i class="ti ti-loader-2 spinner"></i> Generating preview…</div>`
            :h`<iframe srcDoc=${preview.html} style=${{width:'100%',height:'100%',border:0,background:'#fff'}} title=${preview.title}></iframe>`}
        </div>
      </div>
    </div>`}
  </div>`;
}

    // ── SendContractModal ──
function SendContractModal({c,currentUser,onClose,onSent,showToast}){
  const[loading,setLoading]=useState(true);
  const[sending,setSending]=useState(false);
  const[sub,setSub]=useState(null);
  const[template,setTemplate]=useState(null);
  const[scope,setScope]=useState(null);
  const[recipient,setRecipient]=useState(null);
  const[error,setError]=useState('');
  const[agency,setAgency]=useState(null);

  useEffect(()=>{
    (async()=>{
      try{
        if(!c.onboarding_submission_id||!c.onboarding_contract_template_id){
          setError('No submission or contract template linked to this client. Re-run "Send onboarding" first.');
          setLoading(false);return;
        }
        const[s,t,login,ag]=await Promise.all([
          rpcCall('get_onboarding_submission',{p_submission_id:c.onboarding_submission_id}),
          db('contract_templates',`&id=eq.${c.onboarding_contract_template_id}&limit=1`),
          db('team_members',`&client_id=eq.${c.id}&role_level=eq.client&select=email&limit=1`),
          getAgencyForPdf().catch(()=>({})),
        ]);
        setSub(s?.[0]||null);setTemplate(t?.[0]||null);setAgency(ag||{});
        setRecipient((c.contact_email||login?.[0]?.email||'').trim()||null);
        if(s?.[0]?.scope_package_id){
          const sp=await db('scope_packages',`&id=eq.${s[0].scope_package_id}&limit=1`);
          setScope(sp?.[0]||null);
        }
      }catch(e){console.error('[SendContract] load',e);setError('Failed to load contract details.');}
      finally{setLoading(false);}
    })();
  },[c.id]);

  // Resolve {{placeholders}} against the contract body so admin sees what
  // Documenso will actually fill in.
  const resolved=useMemo(()=>{
    if(!template?.body||!sub)return'';
    const startStr=sub.start_date?new Date(sub.start_date).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}):'TBD';
    const ph={
      client_name:c.name||'',
      agency_name:((agency&&(agency.trade_name||agency.legal_name))||'').trim()||'the Agency',
      team_lead:sub.team_lead||'TBD',
      start_date:startStr,
      scope:scope?.name||'',
      monthly_fee:scope?.monthly_fee!=null?Number(scope.monthly_fee).toLocaleString('en-IN'):'',
      deliverables:Array.isArray(scope?.deliverables)?scope.deliverables.map(d=>'- '+d).join('\n'):'',
      payment_terms:scope?.default_payment_terms||'monthly',
      tenure_months:String(scope?.default_tenure_months||6),
      gst_treatment:scope?.gst_treatment||'',
      invoice_day:String(c.invoice_day||1),
      ...(sub.placeholders||{}),
    };
    let body=template.body;
    Object.entries(ph).forEach(([k,v])=>{body=body.split(`{{${k}}}`).join(v||'');});
    return body;
  },[template,sub,scope,c,agency]);

  // v2 one-shot flow: no Documenso template required. The contract body
  // (resolved) is rendered to PDF client-side and uploaded to Storage; the
  // Edge Fn downloads + uploads to Documenso as a one-time document.
  const canSend=!loading&&!!recipient&&!!sub&&!!template&&!!resolved;

  const send=async()=>{
    if(!canSend){showToast('Cannot send yet — see the warnings.');return;}
    setSending(true);setError('');
    try{
      // 1. Render the resolved contract to PDF + upload to Storage.
      showToast('Building contract PDF…');
      const{url:pdfUrl,error:pdfErr}=await generateAndUploadContractPdf({
        submissionId:sub.id,client:c,contractMarkdown:resolved,
      });
      if(pdfErr||!pdfUrl){
        setError(`Could not build contract PDF: ${pdfErr||'unknown'}`);
        return;
      }
      // 2. Hand off to Documenso via Edge Fn.
      const{ok,documentId,signingUrl,to,error:err,detail}=await sendOnboardingContractFn({
        submissionId:sub.id,contractTemplateId:template.id,pdfUrl,bodySnapshot:resolved,
      });
      if(!ok){
        const msg=detail||err||'unknown error';
        setError(`Documenso rejected the contract: ${msg}`);
        return;
      }
      const updated={...c,onboarding_status:'contract_sent'};
      if(onSent)onSent(updated);
      showToast(`Contract sent to ${to} via Documenso ✓`);
      onClose();
    }catch(e){
      console.error('[SendContract] send failed',e);
      setError(`Send failed: ${e?.message||e}`);
    }finally{
      setSending(false);
    }
  };

  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget&&!sending)onClose()}}>
    <div class="modal-box" style=${{width:680}}>
      <div class="modal-head">
        <div>
          <div style=${{fontSize:16,fontWeight:600,display:'flex',alignItems:'center',gap:8}}><i class="ti ti-file-signature" style=${{fontSize:18,color:c.brand_color_primary||'#ff00ee'}}></i>Send retainer contract · ${c.name}</div>
          <div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>Via Documenso · current status: <${OBPill} status=${c.onboarding_status||'not_started'}/></div>
        </div>
        <button class="icon-btn" onClick=${onClose} disabled=${sending}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        ${loading&&h`<div style=${{padding:'40px 0',textAlign:'center',color:'var(--t3)'}}><i class="ti ti-loader-2 spinner"></i> Loading contract…</div>`}
        ${!loading&&error&&h`<div class="err" style=${{marginBottom:14}}><i class="ti ti-alert-circle"></i>${error}</div>`}
        ${!loading&&h`<div style=${{background:'var(--bg)',borderRadius:'var(--r)',padding:14,marginBottom:14}}>
          <div style=${{fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--t3)',fontWeight:600,marginBottom:6}}>What happens</div>
          <div style=${{fontSize:13,color:'var(--t1)',lineHeight:1.55}}>
            <div>· A branded PDF is generated from the contract body below (with all values filled in) and uploaded to Documenso as a one-time document.</div>
            <div>· The client receives a signing email <strong>from Documenso</strong> with the filled-in contract — they tap once to sign. Reply-to still routes to you.</div>
            <div>· The moment they sign, this client's portal auto-unlocks to the normal posts/approvals/payments view.</div>
          </div>
        </div>`}
        ${!loading&&h`<div style=${{background:'var(--bg)',borderRadius:'var(--r)',padding:14,marginBottom:14}}>
          <div style=${{fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--t3)',fontWeight:600,marginBottom:6}}>Recipient</div>
          <div style=${{fontSize:14,fontFamily:'monospace',color:'var(--t1)'}}>${recipient||h`<span style=${{color:'#DC2626'}}>No email on file — add a contact email or create a portal login first.</span>`}</div>
        </div>`}
        ${!loading&&(scope||sub?.placeholders)&&h`<div style=${{background:'var(--bg)',borderRadius:'var(--r)',padding:14,marginBottom:14}}>
          <div style=${{fontSize:11,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--t3)',fontWeight:600,marginBottom:6}}>Engagement (will prefill the contract)</div>
          <div style=${{fontSize:13,color:'var(--t1)',lineHeight:1.55}}>
            <div>· Package: <strong>${sub?.placeholders?.scope||scope?.name||'—'}</strong> · ₹${sub?.placeholders?.monthly_fee||Number(scope?.monthly_fee||0).toLocaleString('en-IN')}/mo · ${sub?.placeholders?.tenure_months||scope?.default_tenure_months||6}-month term</div>
            <div>· Start date: <strong>${sub?.start_date||'—'}</strong></div>
            <div>· Account lead: <strong>${sub?.team_lead||'—'}</strong></div>
          </div>
        </div>`}
        ${!loading&&resolved&&h`<details style=${{background:'var(--bg)',borderRadius:'var(--r)',padding:'10px 14px',marginBottom:14}}>
          <summary style=${{cursor:'pointer',fontSize:12,fontWeight:600,color:'var(--t2)',letterSpacing:'.04em',textTransform:'uppercase'}}>Contract preview (resolved)</summary>
          <pre style=${{whiteSpace:'pre-wrap',fontFamily:'Georgia,serif',fontSize:12.5,lineHeight:1.55,color:'var(--t2)',marginTop:10,maxHeight:320,overflowY:'auto'}}>${resolved}</pre>
        </details>`}
      </div>
      <div class="modal-foot">
        <button class="btn-sec" onClick=${onClose} disabled=${sending}>Cancel</button>
        <button class="btn-pri" onClick=${send} disabled=${!canSend||sending}>${sending?h`<i class="ti ti-loader-2 spinner"></i> Handing off to Documenso…`:h`<i class="ti ti-file-signature"></i> Send for signature`}</button>
      </div>
    </div>
  </div>`;
}


    return { OnboardingInProgressCard, OnboardingTemplatesSection, OnboardingSubmissionPane, SendOnboardingModal, SendContractModal };
  }
  window.AMS_ONBOARDING = { buildOnboarding };
})();

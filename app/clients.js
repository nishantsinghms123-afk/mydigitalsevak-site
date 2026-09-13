// clients.js — Clients feature: ClientDetail hub + brand/scope/SOP/overview tabs, client list,
// add-client, playbook (Phase 3.10 split). Billing tabs, content calendar, and the cross-module
// tabs (Reports/SEO/Onboarding) stay in their own files / index.html and are injected.
// window.AMS_CLIENTS.buildClients(deps) -> { OverviewTab,BrandTab,ScopeLineEditor,ScopeTab,SOPTab,ClientDetail,AddClientModal,CCard,ScopeReportModal,ContentPlaybookCard,ContentPlaybookModal,ClientsView }.
(function(){
  function buildClients(deps){
    const {React,h,useState,useEffect,useRef,useCallback,useMemo,AD_PLATFORMS,Av,BillingTab,BrandMembersSection,CLIENT_SUBTABS,CPill,ContentCalendar,ENum,ESelect,EText,INDUSTRIES,MONTHS,OBPill,OBStageTracker,OOSBadge,PAY_DOT,ProjectTab,SB_KEY,SB_URL,SCOPE_CATEGORIES,SCOPE_UNITS,SERVICES,Skel,TC,Toast,_loadFail,computeScopeUsage,currentScopePeriod,db,dbDelete,dbInsert,dbPatch,deleteBrandAssetFile,ensureScopeInstance,fmt,fmtRelative,fmtS,isPrivilegedRole,logActivity,parseHash,rpcCall,scopePeriodLabel,scopeUuid,syncClientLoginEmail,t,todayISO,uploadBrandAsset,useHashRoute,useTeamNames,writeHash,ReportsTab,ClientSEOTab,OnboardingSubmissionPane,SendOnboardingModal,SendContractModal} = deps;

    // ── OverviewTab ──
function OverviewTab({c,onUpdate,showToast,currentUser}){
  const teamNames=useTeamNames();
  const save=async(key,value)=>{const clean=value===''?null:(typeof value==='string'?value.trim():value);try{const res=await rpcCall('client_update',{p_client_id:c.id,p_patch:{[key]:clean}});if(res&&!Array.isArray(res)&&Array.isArray(res.skipped)&&res.skipped.length){showToast(`Not saved — "${res.skipped.join(', ')}" isn't a column in this workspace's DB`);onUpdate({...c});return;}onUpdate({...c,[key]:clean});showToast('Saved');if(key==='contact_email'&&clean)syncClientLoginEmail(c.id,clean);}catch(e){showToast('Save failed');}};
  // Brand name is special: it must never be blanked (rendered everywhere as
  // c.name.slice(…)), and the avatar initials should follow a rename when they
  // were auto-derived rather than hand-set.
  const autoIni=(n)=>{const w=(n||'').trim().split(/\s+/).filter(Boolean);return w.length>=2?(w[0][0]+w[w.length-1][0]).toUpperCase():(n||'').slice(0,2).toUpperCase();};
  const saveName=async(v)=>{const nv=(v||'').trim();if(!nv){showToast('Brand name can’t be empty');onUpdate({...c});return;}if(nv===(c.name||''))return;const patch={name:nv};if(!c.initials||c.initials===autoIni(c.name))patch.initials=autoIni(nv);try{await rpcCall('client_update',{p_client_id:c.id,p_patch:patch});onUpdate({...c,...patch});showToast('Saved');}catch(e){showToast('Save failed');}};
  const total=(c.monthly_reels||0)+(c.monthly_creatives||0)+(c.monthly_carousels||0)+(c.monthly_extra||0);
  const services=(c.services||'').split(',').map(s=>s.trim()).filter(Boolean);
  const platforms=(c.ad_platforms||'').split(',').map(s=>s.trim()).filter(Boolean);
  return h`<div class="client-edit">
    <${OnboardingSubmissionPane} c=${c} currentUser=${currentUser}/>
    <${BrandMembersSection} c=${c} showToast=${showToast} currentUser=${currentUser}/>
    <div class="ce-section-lbl"><i class="ti ti-building-store" style=${{fontSize:13,color:'#A8009C'}}></i>Brand</div>
    <div class="attr-list">
      <div class="attr-row"><div class="attr-lbl"><i class="ti ti-signature"></i>Brand name</div><div class="attr-val"><${EText} value=${c.name} onSave=${saveName} placeholder="Brand name"/></div></div>
    </div>
    <div class="ce-section-lbl"><i class="ti ti-id" style=${{fontSize:13,color:'#1D4ED8'}}></i>Contact details</div>
    <div class="attr-list">
      <div class="attr-row"><div class="attr-lbl"><i class="ti ti-user"></i>Contact person</div><div class="attr-val"><${EText} value=${c.contact_name} onSave=${v=>save('contact_name',v)} placeholder="e.g. Priya Sharma (Marketing Head)"/></div></div>
      <div class="attr-row"><div class="attr-lbl"><i class="ti ti-phone"></i>Phone</div><div class="attr-val"><${EText} value=${c.contact_phone} onSave=${v=>save('contact_phone',v)} placeholder="+91 98765 43210"/></div></div>
      <div class="attr-row"><div class="attr-lbl"><i class="ti ti-mail"></i>Email</div><div class="attr-val"><${EText} value=${c.contact_email} onSave=${v=>save('contact_email',v)} placeholder="hello@clientbrand.com"/></div></div>
      <div class="attr-row"><div class="attr-lbl"><i class="ti ti-world-www"></i>Website</div><div class="attr-val"><${EText} value=${c.website} onSave=${v=>save('website',v)} placeholder="https://www.clientbrand.com" url=${!!c.website}/></div></div>
      <div class="attr-row"><div class="attr-lbl"><i class="ti ti-brand-instagram"></i>Instagram</div><div class="attr-val"><${EText} value=${c.instagram_handle} onSave=${v=>save('instagram_handle',v)} placeholder="@handle"/></div></div>
    </div>

    <div class="ce-section">
      <div class="ce-section-lbl"><i class="ti ti-stack-2" style=${{fontSize:13,color:'#6D28D9'}}></i>Monthly deliverables<span class="ce-section-meta">${total} posts total</span></div>
      <div class="attr-list">
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-movie" style=${{color:'#6D28D9'}}></i>Reels</div><div class="attr-val"><${ENum} value=${c.monthly_reels} onSave=${v=>save('monthly_reels',v)}/></div></div>
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-photo" style=${{color:'#1D4ED8'}}></i>Creatives</div><div class="attr-val"><${ENum} value=${c.monthly_creatives} onSave=${v=>save('monthly_creatives',v)}/></div></div>
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-layout-grid" style=${{color:'#0E7490'}}></i>Carousels</div><div class="attr-val"><${ENum} value=${c.monthly_carousels} onSave=${v=>save('monthly_carousels',v)}/></div></div>
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-asterisk" style=${{color:'#B45309'}}></i>Extra</div><div class="attr-val"><${ENum} value=${c.monthly_extra} onSave=${v=>save('monthly_extra',v)}/></div></div>
      </div>
    </div>

    <div class="ce-section">
      <div class="ce-section-lbl"><i class="ti ti-bulb" style=${{fontSize:13,color:'#B45309'}}></i>Brand brief</div>
      <div class="attr-list">
        <div class="attr-row attr-row-wide"><div class="attr-lbl"><i class="ti ti-file-text"></i>Brief</div><div class="attr-val"><${EText} value=${c.brand_brief} onSave=${v=>save('brand_brief',v)} placeholder="Describe the brand — who they are, target audience, tone, what makes them unique..." multiline/></div></div>
        <div class="attr-row attr-row-wide"><div class="attr-lbl"><i class="ti ti-pin"></i>Content pillars</div><div class="attr-val"><${EText} value=${c.content_pillars_list} onSave=${v=>save('content_pillars_list',v)} placeholder="Brand Storytelling, Product Showcase..."/></div></div>
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-calendar-week"></i>Posting days</div><div class="attr-val"><${EText} value=${c.posting_days} onSave=${v=>save('posting_days',v)} placeholder="Mon, Tue, Wed, Thu, Fri, Sat"/></div></div>
        <div class="attr-row attr-row-wide"><div class="attr-lbl"><i class="ti ti-sparkles" style=${{color:'#A8009C'}}></i>AI caption prompt</div><div class="attr-val"><${EText} value=${c.caption_prompt} onSave=${v=>save('caption_prompt',v)} placeholder="How AI should caption this brand — voice, length, emoji, CTA style, do's & don'ts. Used by 'Generate with AI' on each post. Leave blank to use the agency default." multiline/></div></div>
      </div>
    </div>

    <div class="ce-section">
      <div class="ce-section-lbl"><i class="ti ti-search" style=${{fontSize:13,color:'#15803D'}}></i>SEO</div>
      <div class="attr-list">
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-table"></i>Sheet URL</div><div class="attr-val"><${EText} value=${c.seo_sheet_url||''} onSave=${v=>save('seo_sheet_url',v?v.trim():null)} placeholder="Paste Google Sheet URL here…" url=${!!c.seo_sheet_url}/></div></div>
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-target"></i>Monthly target</div><div class="attr-val"><${EText} value=${c.seo_monthly_target?String(c.seo_monthly_target):''} onSave=${v=>save('seo_monthly_target',parseInt(v)||0)} placeholder="e.g. 600 backlinks"/></div></div>
      </div>
      ${c.seo_sheet_url?h`<div class="ce-hint ok"><i class="ti ti-check"></i>Sheet linked — visible in SEO dashboard</div>`:h`<div class="ce-hint">Paste the Google Sheet URL above to connect this client's SEO data</div>`}
    </div>

    <div class="ce-section">
      <div class="ce-section-lbl"><i class="ti ti-ad" style=${{fontSize:13,color:'#DC2626'}}></i>Ads tracking</div>
      <div class="attr-list">
        <div class="attr-row attr-row-wide"><div class="attr-lbl"><i class="ti ti-stack"></i>Active ad platforms</div>
          <div class="attr-val"><div class="chip-row">${Object.entries(AD_PLATFORMS).filter(([k])=>k!=='other').map(([k,v])=>{const on=platforms.includes(k);return h`<button key=${k} class=${'fb'+(on?' on':'')} style=${{fontSize:12,padding:'4px 10px',display:'inline-flex',alignItems:'center',gap:4}} onClick=${()=>{const next=on?platforms.filter(s=>s!==k):[...platforms,k];save('ad_platforms',next.join(','));}}>${on?h`<i class="ti ti-check" style=${{fontSize:13}}></i>`:h`<i class=${'ti '+v.ic} style=${{fontSize:13}}></i>`}${v.lbl}</button>`;})}</div></div>
        </div>
        ${platforms.length>0&&h`<div class="attr-row"><div class="attr-lbl"><i class="ti ti-coin"></i>Monthly ad budget (₹)</div><div class="attr-val"><${EText} value=${c.monthly_ad_budget?String(c.monthly_ad_budget):''} onSave=${v=>save('monthly_ad_budget',v===''||v===null?null:parseFloat(v))} placeholder="e.g. 10000 (across all platforms)"/></div></div>`}
      </div>
      ${platforms.length===0&&h`<div class="ce-hint">Tick at least one platform to track ads for this client.</div>`}
    </div>

    <div class="ce-section">
      <div class="ce-section-lbl"><i class="ti ti-info-circle" style=${{fontSize:13,color:'#0E7490'}}></i>Client info</div>
      <div class="attr-list">
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-circle-dot"></i>Status</div><div class="attr-val"><${ESelect} value=${c.status||'active'} options=${[{value:'active',label:'Active'},{value:'onboarding',label:'Onboarding'},{value:'inactive',label:'Inactive'}]} onSave=${v=>save('status',v)}/></div></div>
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-building"></i>Industry</div><div class="attr-val"><${EText} value=${c.industry} onSave=${v=>save('industry',v)} placeholder="e.g. Fashion"/></div></div>
        <div class="attr-row attr-row-wide"><div class="attr-lbl"><i class="ti ti-tools"></i>Services</div>
          <div class="attr-val"><div class="chip-row">${SERVICES.map(sv=>{const on=services.includes(sv);return h`<button key=${sv} class=${'fb'+(on?' on':'')} style=${{fontSize:11,padding:'3px 8px'}} onClick=${()=>{const next=on?services.filter(s=>s!==sv):[...services,sv];save('services',next.join(','));}}>${sv}</button>`;})}</div></div>
        </div>
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-list-details"></i>Type</div><div class="attr-val"><${ESelect} value=${c.retainer_type||'retainer'} options=${[{value:'retainer',label:'Monthly retainer'},{value:'project',label:'Project-based'}]} onSave=${v=>save('retainer_type',v)}/></div></div>
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-user-circle"></i>Manager</div><div class="attr-val"><${ESelect} value=${c.manager||''} options=${[{value:'',label:'— Not assigned —'},...teamNames.map(n=>({value:n,label:n}))]} onSave=${v=>save('manager',v)}/></div></div>
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-calendar-plus"></i>Added</div><div class="attr-val"><span class="attr-readonly">${fmt(c.created_at)}</span></div></div>
      </div>
    </div>
  </div>`;
}

    // ── BrandTab ──
function BrandTab({c,onUpdate,showToast,currentUser}){
  const save=async(key,value)=>{try{const res=await rpcCall('client_update',{p_client_id:c.id,p_patch:{[key]:value||null}});if(res&&!Array.isArray(res)&&Array.isArray(res.skipped)&&res.skipped.length){showToast(`Not saved — "${res.skipped.join(', ')}" isn't a column in this workspace's DB`);onUpdate({...c});return;}onUpdate({...c,[key]:value||null});showToast('Saved');}catch(e){showToast('Save failed');}};
  const pri=c.brand_color_primary||'#1A1A1A';
  const sec=c.brand_color_secondary||'#787774';
  const acc=c.brand_color_accent||'#4F46E5';

  const[assets,setAssets]=useState([]);
  const[loading,setLoading]=useState(true);
  const[uploadingType,setUploadingType]=useState(null);
  const[colorPickerOpen,setColorPickerOpen]=useState(false);
  const[colorDraft,setColorDraft]=useState({value:'#FF00EE',name:''});
  const[fontDraft,setFontDraft]=useState({value:'',tag:'heading'});
  const[fontFormOpen,setFontFormOpen]=useState(false);

  useEffect(()=>{
    setLoading(true);
    db('brand_assets',`&client_id=eq.${c.id}&order=sort_order.asc,created_at.asc`)
      .then(r=>setAssets(r||[]))
      .catch(e=>{console.warn('[brand-assets] load failed',e);setAssets([]);})
      .finally(()=>setLoading(false));
  },[c.id]);

  const byType=(t)=>assets.filter(a=>a.type===t);

  const addAssetRecord=async(record)=>{
    try{
      const rows=await dbInsert('brand_assets',[{client_id:c.id,created_by:currentUser?.name||null,...record}]);
      const row=Array.isArray(rows)?rows[0]:rows;
      setAssets(a=>[...a,row]);
      return row;
    }catch(e){showToast('Save failed: '+(e.message||'unknown'));throw e;}
  };

  const removeAsset=async(asset)=>{
    if(!confirm(`Delete "${asset.name||asset.value||'this asset'}"?`))return;
    try{
      await dbDelete('brand_assets',asset.id,{hard:true});
      if(asset.file_path)deleteBrandAssetFile(asset.file_path);
      setAssets(a=>a.filter(x=>x.id!==asset.id));
      showToast('Deleted');
    }catch(e){showToast('Delete failed');}
  };

  const renameAsset=async(asset,name)=>{
    try{
      await dbPatch('brand_assets',asset.id,{name:name||null});
      setAssets(a=>a.map(x=>x.id===asset.id?{...x,name}:x));
    }catch(e){showToast('Rename failed');}
  };

  const handleFileUpload=async(type,file,extras={})=>{
    if(!file)return;
    if(file.size>10*1024*1024){showToast('File too large (max 10 MB)');return;}
    setUploadingType(type);
    try{
      const{url,file_path}=await uploadBrandAsset(c.id,type,file);
      await addAssetRecord({type,name:extras.name||file.name.replace(/\.[^.]+$/,''),url,file_path,tags:extras.tags||[],value:null});
      // First logo uploaded also seeds the legacy logo_url for backward compatibility.
      if(type==='logo'&&!c.logo_url)save('logo_url',url);
      showToast('Uploaded ✓');
    }catch(e){showToast('Upload failed: '+(e.message||'check bucket policy'));}
    finally{setUploadingType(null);}
  };

  const addColor=async()=>{
    if(!/^#[0-9a-fA-F]{6}$/.test(colorDraft.value)){showToast('Invalid hex');return;}
    await addAssetRecord({type:'color',value:colorDraft.value.toUpperCase(),name:colorDraft.name||null,tags:[]});
    setColorDraft({value:'#FF00EE',name:''});setColorPickerOpen(false);
  };

  const addFont=async()=>{
    if(!fontDraft.value.trim()){showToast('Enter a font family name');return;}
    await addAssetRecord({type:'font',value:fontDraft.value.trim(),name:fontDraft.value.trim(),tags:[fontDraft.tag]});
    setFontDraft({value:'',tag:'heading'});setFontFormOpen(false);
  };

  const copyHex=(hex)=>{navigator.clipboard?.writeText(hex);showToast(hex+' copied');};

  // ── Section: Hero ──
  const heroBg=pri;
  const heroLogo=byType('logo').find(a=>(a.tags||[]).includes('light'))||byType('logo').find(a=>!(a.tags||[]).includes('dark'))||byType('logo')[0];
  const logoSrc=heroLogo?.url||c.logo_url;
  const heroText=(()=>{const r=parseInt(heroBg.slice(1,3),16),g=parseInt(heroBg.slice(3,5),16),b=parseInt(heroBg.slice(5,7),16);return(r*299+g*587+b*114)/1000>140?'#0a0a0a':'#fff';})();

  return h`<div class="client-edit">
    <div style=${{background:heroBg,borderRadius:'var(--rl)',padding:'32px 28px',display:'flex',alignItems:'center',gap:24,marginBottom:24,flexWrap:'wrap'}}>
      <div style=${{flex:1,minWidth:200}}>
        <div style=${{fontSize:11,fontWeight:600,letterSpacing:'.08em',textTransform:'uppercase',color:heroText,opacity:.65,marginBottom:6}}>Brand Profile</div>
        <div style=${{fontSize:28,fontWeight:600,color:heroText,fontFamily:"'Fraunces','Inter',serif",letterSpacing:'-.01em'}}>${c.name}</div>
        <div style=${{fontSize:13,color:heroText,opacity:.7,marginTop:6}}>${byType('logo').length} logo${byType('logo').length===1?'':'s'} · ${byType('color').length+3} color${byType('color').length+3===1?'':'s'} · ${byType('font').length+(c.brand_font?1:0)} font${byType('font').length+(c.brand_font?1:0)===1?'':'s'} · ${byType('image').length} image${byType('image').length===1?'':'s'}</div>
      </div>
      ${logoSrc&&h`<div style=${{background:heroText==='#fff'?'rgba(255,255,255,.96)':'rgba(255,255,255,.85)',borderRadius:14,padding:'18px 24px',display:'flex',alignItems:'center',justifyContent:'center',maxWidth:240,maxHeight:120}}>
        <img src=${logoSrc} alt="Logo" style=${{maxWidth:'100%',maxHeight:80,objectFit:'contain'}} onError=${e=>{e.target.parentElement.style.display='none'}}/>
      </div>`}
    </div>

    <!-- ── Logos ── -->
    <div class="ce-section" style=${{marginTop:0,paddingTop:0,borderTop:'none'}}>
      <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,gap:10,flexWrap:'wrap'}}>
        <div class="ce-section-lbl" style=${{margin:0}}><i class="ti ti-photo" style=${{fontSize:13,color:'#1D4ED8'}}></i>Logos</div>
        <label class="btn-sec" style=${{padding:'6px 12px',fontSize:12,cursor:'pointer',opacity:uploadingType==='logo'?.6:1}}>
          ${uploadingType==='logo'?h`<i class="ti ti-loader-2 spinner"></i>`:h`<i class="ti ti-upload"></i>`} Upload logo
          <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" style=${{display:'none'}} onChange=${e=>{const f=e.target.files[0];e.target.value='';handleFileUpload('logo',f);}}/>
        </label>
      </div>
      ${byType('logo').length===0?h`<div style=${{padding:24,background:'var(--bg)',borderRadius:'var(--r)',textAlign:'center',color:'var(--t3)',fontSize:13,border:'1px dashed var(--bd)'}}>
        <i class="ti ti-photo-plus" style=${{fontSize:24,display:'block',marginBottom:6,opacity:.5}}></i>
        Upload PNG, SVG, JPG or WebP. Tag variants light/dark/symbol for the hero card to pick the right one.
      </div>`:h`<div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12}}>
        ${byType('logo').map(a=>{
          const isDark=(a.tags||[]).includes('dark');
          const tileBg=isDark?'#1A1A1A':'#fff';
          return h`<div key=${a.id} style=${{border:'1px solid var(--bd)',borderRadius:'var(--rl)',overflow:'hidden',background:'var(--surface)'}}>
            <div style=${{height:120,background:tileBg,display:'flex',alignItems:'center',justifyContent:'center',padding:14,borderBottom:'1px solid var(--bd)'}}>
              <img src=${a.url} alt=${a.name||''} style=${{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}} onError=${e=>{e.target.style.display='none'}}/>
            </div>
            <div style=${{padding:'8px 10px',display:'flex',alignItems:'center',gap:6}}>
              <input value=${a.name||''} placeholder="Name" onBlur=${e=>{if(e.target.value!==(a.name||''))renameAsset(a,e.target.value.trim());}} style=${{flex:1,border:'none',background:'transparent',fontSize:12,color:'var(--t1)',outline:'none',minWidth:0}}/>
              <button class="icon-btn" title=${isDark?'Mark as light variant':'Mark as dark variant'} onClick=${async()=>{const tags=isDark?(a.tags||[]).filter(t=>t!=='dark'):[...(a.tags||[]).filter(t=>t!=='light'),'dark'];await dbPatch('brand_assets',a.id,{tags});setAssets(arr=>arr.map(x=>x.id===a.id?{...x,tags}:x));}} style=${{width:24,height:24}}><i class=${'ti '+(isDark?'ti-sun':'ti-moon')} style=${{fontSize:12,color:'var(--t3)'}}></i></button>
              <a href=${a.url} target="_blank" rel="noopener" class="icon-btn" title="Open" style=${{width:24,height:24,display:'inline-flex',alignItems:'center',justifyContent:'center'}}><i class="ti ti-external-link" style=${{fontSize:12,color:'var(--t3)'}}></i></a>
              <button class="icon-btn" title="Delete" onClick=${()=>removeAsset(a)} style=${{width:24,height:24}}><i class="ti ti-trash" style=${{fontSize:12,color:'var(--red)'}}></i></button>
            </div>
          </div>`;
        })}
      </div>`}
    </div>

    <!-- ── Colors ── -->
    <div class="ce-section">
      <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,gap:10,flexWrap:'wrap'}}>
        <div class="ce-section-lbl" style=${{margin:0}}><i class="ti ti-palette" style=${{fontSize:13,color:'#FF00EE'}}></i>Colors</div>
        <button class="btn-sec" style=${{padding:'6px 12px',fontSize:12}} onClick=${()=>setColorPickerOpen(o=>!o)}><i class=${colorPickerOpen?'ti ti-x':'ti ti-plus'}></i>${colorPickerOpen?' Cancel':' Add color'}</button>
      </div>
      ${colorPickerOpen&&h`<div style=${{display:'flex',gap:10,marginBottom:14,padding:12,background:'var(--bg)',borderRadius:'var(--r)',alignItems:'center',flexWrap:'wrap'}}>
        <input type="color" value=${colorDraft.value} onChange=${e=>setColorDraft(d=>({...d,value:e.target.value}))} style=${{width:44,height:36,border:'1px solid var(--bd)',borderRadius:6,padding:0,cursor:'pointer'}}/>
        <input class="fi" type="text" value=${colorDraft.value} onInput=${e=>setColorDraft(d=>({...d,value:e.target.value}))} placeholder="#FF00EE" style=${{width:110,fontFamily:'ui-monospace,monospace',fontSize:13}}/>
        <input class="fi" type="text" value=${colorDraft.name} onInput=${e=>setColorDraft(d=>({...d,name:e.target.value}))} placeholder="Name (e.g. Brand pink)" style=${{flex:1,minWidth:180}}/>
        <button class="btn-pri" style=${{padding:'7px 14px',fontSize:13}} onClick=${addColor}>Add</button>
      </div>`}

      <div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:10}}>
        ${[{key:'brand_color_primary',hex:pri,label:'Primary'},{key:'brand_color_secondary',hex:sec,label:'Secondary'}].map(s=>h`<div key=${s.key} style=${{border:'1px solid var(--bd)',borderRadius:'var(--rl)',overflow:'hidden',background:'var(--surface)',position:'relative'}}>
          <div style=${{height:84,background:s.hex,cursor:'pointer',position:'relative'}} onClick=${()=>copyHex(s.hex)} title="Click to copy">
            <input type="color" value=${s.hex} onChange=${e=>save(s.key,e.target.value)} title="Edit" style=${{position:'absolute',top:6,right:6,width:24,height:24,padding:0,border:'1px solid rgba(255,255,255,.5)',borderRadius:5,cursor:'pointer',background:'transparent'}}/>
          </div>
          <div style=${{padding:'8px 10px'}}>
            <div style=${{fontSize:12,fontWeight:600,color:'var(--t1)'}}>${s.label}</div>
            <div style=${{fontSize:11,color:'var(--t3)',fontFamily:'ui-monospace,monospace',marginTop:2}}>${s.hex.toUpperCase()}</div>
          </div>
        </div>`)}
        ${byType('color').map(a=>h`<div key=${a.id} style=${{border:'1px solid var(--bd)',borderRadius:'var(--rl)',overflow:'hidden',background:'var(--surface)',position:'relative'}}>
          <div style=${{height:84,background:a.value,cursor:'pointer'}} onClick=${()=>copyHex(a.value)} title="Click to copy"></div>
          <div style=${{padding:'8px 10px',display:'flex',alignItems:'center',gap:4}}>
            <div style=${{flex:1,minWidth:0}}>
              <input value=${a.name||''} placeholder="Name" onBlur=${e=>{if(e.target.value!==(a.name||''))renameAsset(a,e.target.value.trim());}} style=${{border:'none',background:'transparent',fontSize:12,fontWeight:600,color:'var(--t1)',outline:'none',width:'100%',padding:0}}/>
              <div style=${{fontSize:11,color:'var(--t3)',fontFamily:'ui-monospace,monospace',marginTop:2}}>${a.value}</div>
            </div>
            <button class="icon-btn" title="Delete" onClick=${()=>removeAsset(a)} style=${{width:22,height:22,flexShrink:0}}><i class="ti ti-trash" style=${{fontSize:11,color:'var(--red)'}}></i></button>
          </div>
        </div>`)}
      </div>
    </div>

    <!-- ── Fonts ── -->
    <div class="ce-section">
      <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,gap:10,flexWrap:'wrap'}}>
        <div class="ce-section-lbl" style=${{margin:0}}><i class="ti ti-typography" style=${{fontSize:13,color:'#0E7490'}}></i>Fonts</div>
        <button class="btn-sec" style=${{padding:'6px 12px',fontSize:12}} onClick=${()=>setFontFormOpen(o=>!o)}><i class=${fontFormOpen?'ti ti-x':'ti ti-plus'}></i>${fontFormOpen?' Cancel':' Add font'}</button>
      </div>
      ${fontFormOpen&&h`<div style=${{display:'flex',gap:10,marginBottom:14,padding:12,background:'var(--bg)',borderRadius:'var(--r)',alignItems:'center',flexWrap:'wrap'}}>
        <input class="fi" type="text" value=${fontDraft.value} onInput=${e=>setFontDraft(d=>({...d,value:e.target.value}))} placeholder="Font family — e.g. Inter, Playfair Display" style=${{flex:1,minWidth:200}}/>
        <select class="fi fi-select" value=${fontDraft.tag} onChange=${e=>setFontDraft(d=>({...d,tag:e.target.value}))} style=${{width:140}}>
          <option value="heading">Heading</option>
          <option value="body">Body</option>
          <option value="display">Display</option>
          <option value="mono">Monospace</option>
        </select>
        <button class="btn-pri" style=${{padding:'7px 14px',fontSize:13}} onClick=${addFont}>Add</button>
      </div>`}
      <div style=${{display:'flex',flexDirection:'column',gap:8}}>
        ${c.brand_font&&h`<div style=${{border:'1px solid var(--bd)',borderRadius:'var(--rl)',padding:'14px 16px',background:'var(--surface)',display:'flex',alignItems:'center',gap:14}}>
          <div style=${{flex:1,minWidth:0}}>
            <div style=${{fontSize:11,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>Primary (legacy field)</div>
            <div style=${{fontFamily:c.brand_font,fontSize:22,color:'var(--t1)',fontWeight:500,lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${c.brand_font}</div>
            <div style=${{fontSize:12,color:'var(--t3)',marginTop:4,fontFamily:c.brand_font}}>The quick brown fox jumps over the lazy dog 0123456789</div>
          </div>
          <button class="icon-btn" onClick=${()=>save('brand_font','')} title="Clear" style=${{width:28,height:28}}><i class="ti ti-trash" style=${{fontSize:12,color:'var(--red)'}}></i></button>
        </div>`}
        ${byType('font').map(a=>h`<div key=${a.id} style=${{border:'1px solid var(--bd)',borderRadius:'var(--rl)',padding:'14px 16px',background:'var(--surface)',display:'flex',alignItems:'center',gap:14}}>
          <div style=${{flex:1,minWidth:0}}>
            <div style=${{fontSize:11,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>${(a.tags&&a.tags[0])||'Font'}</div>
            <div style=${{fontFamily:a.value,fontSize:22,color:'var(--t1)',fontWeight:500,lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${a.value}</div>
            <div style=${{fontSize:12,color:'var(--t3)',marginTop:4,fontFamily:a.value}}>The quick brown fox jumps over the lazy dog 0123456789</div>
          </div>
          <button class="icon-btn" onClick=${()=>removeAsset(a)} title="Delete" style=${{width:28,height:28}}><i class="ti ti-trash" style=${{fontSize:12,color:'var(--red)'}}></i></button>
        </div>`)}
        ${!c.brand_font&&byType('font').length===0&&h`<div style=${{padding:24,background:'var(--bg)',borderRadius:'var(--r)',textAlign:'center',color:'var(--t3)',fontSize:13,border:'1px dashed var(--bd)'}}>No fonts yet. Add Google Fonts or system font family names; previews use whichever the browser can render.</div>`}
      </div>
    </div>

    <!-- ── Imagery ── -->
    <div class="ce-section">
      <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,gap:10,flexWrap:'wrap'}}>
        <div class="ce-section-lbl" style=${{margin:0}}><i class="ti ti-photo-scan" style=${{fontSize:13,color:'#7C3AED'}}></i>Brand imagery</div>
        <label class="btn-sec" style=${{padding:'6px 12px',fontSize:12,cursor:'pointer',opacity:uploadingType==='image'?.6:1}}>
          ${uploadingType==='image'?h`<i class="ti ti-loader-2 spinner"></i>`:h`<i class="ti ti-upload"></i>`} Upload image
          <input type="file" accept="image/*" style=${{display:'none'}} onChange=${e=>{const f=e.target.files[0];e.target.value='';handleFileUpload('image',f);}}/>
        </label>
      </div>
      ${byType('image').length===0?h`<div style=${{padding:24,background:'var(--bg)',borderRadius:'var(--r)',textAlign:'center',color:'var(--t3)',fontSize:13,border:'1px dashed var(--bd)'}}>
        <i class="ti ti-photo-plus" style=${{fontSize:24,display:'block',marginBottom:6,opacity:.5}}></i>
        Approved brand photography, lifestyle shots, product images — anything the team should reach for.
      </div>`:h`<div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10}}>
        ${byType('image').map(a=>h`<div key=${a.id} style=${{position:'relative',border:'1px solid var(--bd)',borderRadius:'var(--rl)',overflow:'hidden',background:'var(--bg)',aspectRatio:'1/1'}}>
          <img src=${a.url} alt=${a.name||''} style=${{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
          <div style=${{position:'absolute',inset:'auto 0 0 0',padding:'6px 8px',background:'linear-gradient(transparent,rgba(0,0,0,.65))',display:'flex',gap:4,alignItems:'flex-end'}}>
            <div style=${{flex:1,color:'#fff',fontSize:11,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textShadow:'0 1px 2px rgba(0,0,0,.5)'}}>${a.name||''}</div>
            <a href=${a.url} target="_blank" rel="noopener" class="icon-btn" title="Open" style=${{width:22,height:22,background:'rgba(255,255,255,.15)',color:'#fff'}}><i class="ti ti-external-link" style=${{fontSize:11}}></i></a>
            <button class="icon-btn" onClick=${()=>removeAsset(a)} title="Delete" style=${{width:22,height:22,background:'rgba(255,255,255,.15)',color:'#fff'}}><i class="ti ti-trash" style=${{fontSize:11}}></i></button>
          </div>
        </div>`)}
      </div>`}
    </div>

    <!-- ── Guidelines ── -->
    <div class="ce-section">
      <div class="ce-section-lbl"><i class="ti ti-book-2" style=${{fontSize:13,color:'#0E7490'}}></i>Brand guidelines</div>
      <div class="attr-list">
        <div class="attr-row"><div class="attr-lbl"><i class="ti ti-typography"></i>Primary font</div><div class="attr-val"><${EText} value=${c.brand_font} onSave=${v=>save('brand_font',v)} placeholder="e.g. Playfair Display headings, Inter body"/></div></div>
        <div class="attr-row attr-row-wide"><div class="attr-lbl"><i class="ti ti-microphone"></i>Tone of voice</div><div class="attr-val"><${EText} value=${c.brand_voice} onSave=${v=>save('brand_voice',v)} placeholder="Describe how the brand speaks — formal/casual, humorous/serious, aspirational/friendly..." multiline/></div></div>
        <div class="attr-row attr-row-wide"><div class="attr-lbl"><i class="ti ti-users"></i>Target audience</div><div class="attr-val"><${EText} value=${c.target_audience} onSave=${v=>save('target_audience',v)} placeholder="Age group, location, interests, income, lifestyle..." multiline/></div></div>
        <div class="attr-row attr-row-wide"><div class="attr-lbl" style=${{color:'var(--green)'}}><i class="ti ti-check"></i>Do's</div><div class="attr-val"><${EText} value=${c.brand_dos} onSave=${v=>save('brand_dos',v)} placeholder="Things to always do..." multiline/></div></div>
        <div class="attr-row attr-row-wide"><div class="attr-lbl" style=${{color:'var(--red)'}}><i class="ti ti-x"></i>Don'ts</div><div class="attr-val"><${EText} value=${c.brand_donts} onSave=${v=>save('brand_donts',v)} placeholder="Things to never do..." multiline/></div></div>
      </div>
    </div>
    ${loading&&h`<div style=${{fontSize:11,color:'var(--t3)',marginTop:10,textAlign:'center'}}>Loading assets…</div>`}
  </div>`;
}

    // ── ScopeLineEditor ──
function ScopeLineEditor({draft,setDraft,readOnly}){
  const add=()=>setDraft(d=>[...d,{id:scopeUuid(),name:'',quantity:1,unit:'posts',category:'Social Media'}]);
  const update=(i,k,v)=>setDraft(d=>d.map((it,j)=>j===i?{...it,[k]:v}:it));
  const remove=(i)=>setDraft(d=>d.filter((_,j)=>j!==i));
  return h`<div>
    ${draft.length===0&&h`<div style=${{padding:'14px',fontSize:13,color:'var(--t3)',textAlign:'center',background:'var(--bg)',borderRadius:'var(--r)',marginBottom:10}}>No deliverables added yet. Click "Add line item" to start.</div>`}
    ${draft.map((it,i)=>h`<div key=${it.id||i} class="scope-li-row">
      <input class="fi" type="text" placeholder="e.g. Instagram Reels" value=${it.name||''} onInput=${e=>update(i,'name',e.target.value)} disabled=${readOnly}/>
      <input class="fi" type="number" min="0" max="999" value=${it.quantity||0} onInput=${e=>update(i,'quantity',parseInt(e.target.value)||0)} disabled=${readOnly} style=${{textAlign:'center'}}/>
      <select class="fi fi-select" value=${it.unit||'posts'} onChange=${e=>update(i,'unit',e.target.value)} disabled=${readOnly}>${SCOPE_UNITS.map(u=>h`<option key=${u} value=${u}>${u}</option>`)}</select>
      <select class="fi fi-select" value=${it.category||'Social Media'} onChange=${e=>update(i,'category',e.target.value)} disabled=${readOnly}>${SCOPE_CATEGORIES.map(ca=>h`<option key=${ca} value=${ca}>${ca}</option>`)}</select>
      ${readOnly?h`<span></span>`:h`<button class="icon-btn" onClick=${()=>remove(i)} title="Remove"><i class="ti ti-trash" style=${{color:'var(--red)'}}></i></button>`}
    </div>`)}
    ${!readOnly&&h`<button class="btn-sec" onClick=${add} style=${{marginTop:10,padding:'7px 14px',fontSize:13}}><i class="ti ti-plus"></i>Add line item</button>`}
  </div>`;
}

    // ── ScopeTab ──
function ScopeTab({c,currentUser,showToast}){
  const isAdmin=currentUser?.role_level==='admin';
  const cur=currentScopePeriod();
  const[{month,year},setPeriod]=useState(()=>currentScopePeriod());
  const isCurrentMonth=month===cur.month&&year===cur.year;
  const isFutureMonth=(year>cur.year)||(year===cur.year&&month>cur.month);
  const shiftPeriod=(delta)=>setPeriod(p=>{const d=new Date(p.year,p.month-1+delta,1);return{month:d.getMonth()+1,year:d.getFullYear()};});
  const[template,setTemplate]=useState(null);
  const[instance,setInstance]=useState(null);
  const[posts,setPosts]=useState([]);
  const[loading,setLoading]=useState(true);
  const[editing,setEditing]=useState(false);
  const[draft,setDraft]=useState([]);
  const[saving,setSaving]=useState(false);

  const reload=useCallback(async()=>{
    if(!c?.id)return;
    setLoading(true);
    try{
      const[tplRows,inst]=await Promise.all([
        db('client_scope_templates',`&client_id=eq.${c.id}`).catch(()=>[]),
        // Only lazily clone an instance for the live month — browsing past/future
        // months should read what actually existed, not fabricate history from the
        // current template.
        isCurrentMonth
          ? ensureScopeInstance(c.id,month,year)
          : db('monthly_scope_instances',`&client_id=eq.${c.id}&month=eq.${month}&year=eq.${year}`).then(r=>r?.[0]||null).catch(()=>null),
      ]);
      setTemplate(tplRows[0]||null);
      setInstance(inst);
      const start=`${year}-${String(month).padStart(2,'0')}-01`;
      const last=new Date(year,month,0);
      const end=`${year}-${String(month).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
      const ps=await db('content',`&client_id=eq.${c.id}&post_date=gte.${start}&post_date=lte.${end}`).catch(()=>[]);
      setPosts(ps);
    }catch(e){console.warn('[scope-tab] load failed',e);}
    finally{setLoading(false);}
  },[c?.id,month,year]);

  useEffect(()=>{reload();},[reload]);

  const startEdit=()=>{
    const items=Array.isArray(template?.line_items)?template.line_items.map(it=>({...it})):[];
    setDraft(items);setEditing(true);
  };
  const cancelEdit=()=>{setEditing(false);setDraft([]);};

  const seedFromDeliverables=()=>{
    const seed=[];
    if(c.monthly_reels)seed.push({id:scopeUuid(),name:'Instagram Reels',quantity:c.monthly_reels,unit:'reels',category:'Social Media'});
    if(c.monthly_creatives)seed.push({id:scopeUuid(),name:'Instagram Creatives',quantity:c.monthly_creatives,unit:'posts',category:'Social Media'});
    if(c.monthly_carousels)seed.push({id:scopeUuid(),name:'Carousels',quantity:c.monthly_carousels,unit:'posts',category:'Social Media'});
    if(c.monthly_extra)seed.push({id:scopeUuid(),name:'Extra content',quantity:c.monthly_extra,unit:'posts',category:'Content'});
    setDraft(seed);setEditing(true);
  };

  const persist=async(applyToCurrent)=>{
    const cleanItems=draft.filter(d=>d.name&&d.name.trim()).map(d=>({
      id:d.id||scopeUuid(),
      name:d.name.trim(),
      quantity:parseInt(d.quantity)||0,
      unit:d.unit||'posts',
      category:d.category||'Other',
    }));
    setSaving(true);
    // Upsert helper — handles the "row already exists for this client" case
    // (migration 002 puts unique constraints on both tables) without needing
    // to know whether we have a stale template/instance in React state. Also
    // raises the actual HTTP body on failure so toasts surface the real cause.
    const upsert=async(table,conflictCols,payload)=>{
      const res=await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${conflictCols}`,{
        method:'POST',
        headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json','Prefer':'return=representation,resolution=merge-duplicates'},
        body:JSON.stringify([payload]),
      });
      if(!res.ok){
        const body=await res.text().catch(()=>'');
        throw new Error(`${table} ${res.status}: ${body||res.statusText}`);
      }
      const rows=await res.json();
      return rows[0]||null;
    };
    try{
      const tpl=await upsert('client_scope_templates','client_id',{
        client_id:c.id,line_items:cleanItems,
        updated_by:currentUser?.name||null,updated_at:new Date().toISOString(),
      });
      setTemplate(tpl);
      if(applyToCurrent){
        const inst=await upsert('monthly_scope_instances','client_id,month,year',{
          client_id:c.id,month,year,line_items:cleanItems,
        });
        setInstance(inst);
      }
      showToast(applyToCurrent?'Scope saved & applied ✓':'Template saved ✓');
      setEditing(false);
    }catch(e){console.error('[scope-persist]',e);showToast('Save failed — '+(e?.message||'unknown error'));}
    finally{setSaving(false);}
  };

  if(loading)return h`<div style=${{display:'flex',flexDirection:'column',gap:10}}>${[...Array(3)].map((_,i)=>h`<${Skel} key=${i} h=${68}/>`)}</div>`;

  const tplItems=Array.isArray(template?.line_items)?template.line_items:[];
  const usage=computeScopeUsage(instance,posts);
  const overItems=usage.items.filter(it=>it.tone==='over');
  const reachedItems=usage.items.filter(it=>it.completed>=it.quantity&&it.quantity>0);
  const oosPosts=posts.filter(p=>p.is_out_of_scope);

  return h`<div>
    <div style=${{padding:'16px 20px',background:'linear-gradient(135deg,#7C2D12,#B45309)',borderRadius:'var(--rl)',marginBottom:20,color:'#fff'}}>
      <div style=${{fontSize:18,fontWeight:600,marginBottom:4}}><i class="ti ti-file-text" style=${{marginRight:8}}></i>Monthly Scope</div>
      <div style=${{fontSize:13,opacity:.85}}>Contracted deliverables for ${c.name} · Anything not linked here will be flagged as out-of-scope work</div>
    </div>

    <div class="ce-section">
      <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,gap:10,flexWrap:'wrap'}}>
        <div>
          <div style=${{fontSize:15,fontWeight:600,color:'var(--t1)'}}>Contract template</div>
          <div style=${{fontSize:12,color:'var(--t3)',marginTop:3}}>${tplItems.length} deliverable${tplItems.length===1?'':'s'}${template?.updated_by?' · last edited by '+template.updated_by:''}${template?.updated_at?' · '+fmtRelative(template.updated_at):''}</div>
        </div>
        ${isAdmin&&!editing&&h`<div style=${{display:'flex',gap:8}}>
          ${tplItems.length===0&&((c.monthly_reels||0)+(c.monthly_creatives||0)+(c.monthly_carousels||0)+(c.monthly_extra||0)>0)&&h`<button class="btn-sec" style=${{padding:'8px 14px',fontSize:13}} onClick=${seedFromDeliverables}><i class="ti ti-wand"></i>Seed from deliverables</button>`}
          <button class="btn-pri" style=${{padding:'8px 14px',fontSize:13}} onClick=${startEdit}><i class=${tplItems.length===0?'ti ti-plus':'ti ti-pencil'}></i>${tplItems.length===0?'Set up scope':'Edit scope'}</button>
        </div>`}
      </div>

      ${editing?h`<div>
        <${ScopeLineEditor} draft=${draft} setDraft=${setDraft} readOnly=${false}/>
        <div style=${{display:'flex',gap:8,marginTop:14,flexWrap:'wrap',justifyContent:'flex-end'}}>
          <button class="btn-sec" onClick=${cancelEdit} disabled=${saving}>Cancel</button>
          <button class="btn-sec" onClick=${()=>persist(false)} disabled=${saving} title="Updates the template for future months only"><i class="ti ti-bookmark"></i>Save (next month onwards)</button>
          <button class="btn-pri" onClick=${()=>persist(true)} disabled=${saving} title="Updates the template AND replaces this month's instance">${saving?h`<i class="ti ti-loader-2 spinner"></i> Saving`:h`<span style=${{display:'inline-flex',alignItems:'center',gap:6}}><i class="ti ti-check"></i>Save & apply to this month</span>`}</button>
        </div>
      </div>`:tplItems.length===0?h`<div class="empty" style=${{padding:'24px 16px'}}><i class="ti ti-file-text"></i><div class="empty-t" style=${{fontSize:14}}>No scope set yet</div><div class="empty-s" style=${{fontSize:12}}>${isAdmin?'Set up the contracted deliverables to start tracking in vs out-of-scope work.':'Ask your workspace admin to define the monthly scope for this client.'}</div></div>`:h`<div>${tplItems.map(it=>h`<div key=${it.id} class="scope-li-row"><div><div style=${{fontWeight:500,color:'var(--t1)'}}>${it.name}</div><div style=${{fontSize:11,color:'var(--t3)',marginTop:1}}>${it.category}</div></div><div class="scope-row-num">${it.quantity}</div><div style=${{fontSize:12,color:'var(--t2)'}}>${it.unit}</div><div></div><div></div></div>`)}</div>`}
    </div>

    <div class="ce-section">
      <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,gap:10,flexWrap:'wrap'}}>
        <div>
          <div style=${{fontSize:15,fontWeight:600,color:'var(--t1)'}}>Scope usage</div>
          <div style=${{fontSize:12,color:'var(--t3)',marginTop:3}}>Live count of in-scope tasks marked production done · counts by post date</div>
        </div>
        <div style=${{display:'flex',alignItems:'center',gap:6}}>
          <button class="icon-btn" onClick=${()=>shiftPeriod(-1)} title="Previous month"><i class="ti ti-chevron-left"></i></button>
          <div style=${{fontSize:13,fontWeight:600,color:'var(--t1)',minWidth:96,textAlign:'center'}}>${scopePeriodLabel(month,year)}</div>
          <button class="icon-btn" onClick=${()=>shiftPeriod(1)} disabled=${isCurrentMonth||isFutureMonth} title="Next month"><i class="ti ti-chevron-right"></i></button>
          ${!isCurrentMonth&&h`<button class="btn-sec" style=${{padding:'5px 10px',fontSize:12,marginLeft:4}} onClick=${()=>setPeriod(currentScopePeriod())}>This month</button>`}
        </div>
      </div>
      ${overItems.length>0&&h`<div class="scope-quota-banner" style=${{background:'#FEE2E2',borderColor:'#FCA5A5',color:'#B91C1C'}}><i class="ti ti-alert-octagon"></i>${overItems.length} deliverable${overItems.length>1?'s':''} over quota — review out-of-scope work below</div>`}
      ${reachedItems.length>0&&overItems.length===0&&h`<div class="scope-quota-banner"><i class="ti ti-alert-triangle"></i>${reachedItems.map(it=>it.name).join(', ')} quota reached — new tasks of this type will be out of scope</div>`}
      ${usage.items.length===0?h`<div class="empty" style=${{padding:'18px 16px'}}><i class="ti ti-progress"></i><div class="empty-t" style=${{fontSize:13}}>No scope tracked for ${scopePeriodLabel(month,year)}</div><div class="empty-s" style=${{fontSize:12}}>${!isCurrentMonth?'This month had no scope instance. Scope is only auto-created for the live month.':tplItems.length>0?'Save the template with "Save & apply to this month" above.':'Set up the scope template first.'}</div></div>`:h`<div>
        <div class="scope-row-h"><div>Deliverable</div><div style=${{textAlign:'center'}}>Contracted</div><div style=${{textAlign:'center'}}>Done</div><div style=${{textAlign:'center'}}>Remaining</div><div>Status</div></div>
        ${usage.items.map(it=>h`<div key=${it.id} class="scope-row">
          <div><div style=${{fontWeight:500,color:'var(--t1)'}}>${it.name}</div><div style=${{fontSize:11,color:'var(--t3)',marginTop:1}}>${it.category} · ${it.unit}</div></div>
          <div class="scope-row-num">${it.quantity}</div>
          <div class="scope-row-num" style=${{color:it.tone==='over'?'#DC2626':it.tone==='warn'?'#B45309':'var(--green)'}}>${it.completed}</div>
          <div class="scope-row-num">${it.remaining}</div>
          <div><div class="scope-bar"><div class=${'scope-bar-fill '+it.tone} style=${{width:Math.min(it.pct,100)+'%'}}></div></div><div style=${{fontSize:10,color:'var(--t3)',marginTop:3,textAlign:'right'}}>${it.pct}%${it.tone==='over'?' · over by '+(it.completed-it.quantity):''}</div></div>
        </div>`)}
      </div>`}
    </div>

    <div class="ce-section">
      <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,gap:10}}>
        <div>
          <div style=${{fontSize:15,fontWeight:600,color:'var(--t1)'}}>Out-of-scope work · ${scopePeriodLabel(month,year)}</div>
          <div style=${{fontSize:12,color:'var(--t3)',marginTop:3}}>${oosPosts.length} task${oosPosts.length===1?'':'s'} not in contract</div>
        </div>
      </div>
      ${oosPosts.length===0?h`<div style=${{padding:'14px',fontSize:13,color:'var(--t3)',textAlign:'center',background:'var(--bg)',borderRadius:'var(--r)'}}>No out-of-scope tasks recorded this month ✓</div>`:h`<div>
        ${oosPosts.map(p=>h`<div key=${p.id} style=${{display:'grid',gridTemplateColumns:'1fr 110px 120px auto',gap:10,alignItems:'center',padding:'10px 12px',borderBottom:'1px solid var(--bd)'}}>
          <div><div style=${{fontWeight:500,color:'var(--t1)',fontSize:13}}>${p.title}</div><div style=${{fontSize:11,color:'var(--t3)',marginTop:2}}>${TC[p.type]?.label||p.type}${p.assigned_to?' · '+p.assigned_to:''}</div></div>
          <div style=${{fontSize:11.5,color:'var(--t2)'}}>Marked ${fmtS(p.out_of_scope_at||p.post_date)}</div>
          <div style=${{fontSize:11.5,color:'var(--t2)'}}>By ${p.out_of_scope_by||'—'}</div>
          <${OOSBadge}/>
        </div>`)}
      </div>`}
    </div>
  </div>`;
}

    // ── SOPTab ──
function SOPTab({c,onUpdate,showToast}){
  const save=async(key,value)=>{try{const res=await rpcCall('client_update',{p_client_id:c.id,p_patch:{[key]:value||null}});if(res&&!Array.isArray(res)&&Array.isArray(res.skipped)&&res.skipped.length){showToast(`Not saved — "${res.skipped.join(', ')}" isn't a column in this workspace's DB`);onUpdate({...c});return;}onUpdate({...c,[key]:value||null});showToast('Saved');}catch(e){showToast('Save failed');}};
  const sections=[
    {key:'sop_approval_process',icon:'ti-checkbox',color:'#15803D',bg:'#DCFCE7',title:'Content approval process',placeholder:'Who approves? Which channel? Turnaround time? Default if no response?'},
    {key:'sop_posting_rules',icon:'ti-clock',color:'#1D4ED8',bg:'#DBEAFE',title:'Posting rules & schedule',placeholder:'Posting times? Days to avoid? Festival post requirements?'},
    {key:'sop_communication',icon:'ti-message-circle',color:'#6D28D9',bg:'#EDE9FE',title:'Client communication',placeholder:'Primary contact? Preferred channel? Meeting schedule? Report sharing method?'},
    {key:'sop_restrictions',icon:'ti-ban',color:'#DC2626',bg:'#FEE2E2',title:'Content restrictions',placeholder:'Topics to avoid? Competitor rules? Legal restrictions? Banned words?'},
    {key:'sop_crisis',icon:'ti-alert-triangle',color:'#B45309',bg:'#FEF3C7',title:'Crisis management',placeholder:'What counts as a crisis? Who gets notified? Response procedure?'},
    {key:'sop_notes',icon:'ti-notes',color:'#787774',bg:'#F3F4F6',title:'Special instructions',placeholder:'Client personality? Lessons learned? Seasonal campaigns? Anything else the team should know?'},
  ];
  return h`<div class="client-edit">
    <div style=${{padding:'16px 20px',background:'linear-gradient(135deg,#1A1A1A,#374151)',borderRadius:'var(--rl)',marginBottom:20,color:'#fff'}}>
      <div style=${{fontSize:18,fontWeight:600,marginBottom:4}}>Standard operating procedures</div>
      <div style=${{fontSize:14,opacity:.75}}>Internal guide for managing ${c.name}</div>
    </div>
    ${sections.map(s=>h`<div key=${s.key} class="sop-block">
      <div class="sop-hd"><div class="sop-icon" style=${{background:s.bg}}><i class=${'ti '+s.icon} style=${{color:s.color,fontSize:16}}></i></div><div class="sop-title">${s.title}</div></div>
      <div class="attr-val sop-val"><${EText} value=${c[s.key]} onSave=${v=>save(s.key,v)} placeholder=${s.placeholder} multiline/></div>
    </div>`)}
  </div>`;
}

    // ── ClientDetail ──
function ClientDetail({c,onBack,onClientUpdate,onClientDelete,currentUser,clients,onSwitch}){
  const[tab,setTab]=useState(()=>{
    const r=parseHash();
    if(r.tab==='clients'&&String(r.clientId)===String(c.id)&&CLIENT_SUBTABS.includes(r.clientTab))return r.clientTab;
    return'overview';
  });
  const[client,setClient]=useState(c);useEffect(()=>{setClient(c);},[c]);
  // When switching clients, reset to overview unless the new client's URL pins a sub-tab
  useEffect(()=>{
    const r=parseHash();
    const pinned=(r.tab==='clients'&&String(r.clientId)===String(c.id)&&CLIENT_SUBTABS.includes(r.clientTab))?r.clientTab:'overview';
    if(pinned!==tab)setTab(pinned);
  },[c.id]);
  // Sync tab → hash
  useEffect(()=>{writeHash({tab:'clients',clientId:c.id,clientTab:tab});},[tab,c.id]);
  // Sync hash → tab (back/forward within client)
  const route=useHashRoute();
  useEffect(()=>{
    if(route.tab==='clients'&&String(route.clientId)===String(c.id)){
      const desired=CLIENT_SUBTABS.includes(route.clientTab)?route.clientTab:'overview';
      if(desired!==tab)setTab(desired);
    }
  },[route.tab,route.clientId,route.clientTab,c.id]);
  const[toast,setToast]=useState(null);const tk=useRef(0);const showToast=(msg)=>{tk.current++;setToast({msg,k:tk.current});};
  const updateClient=(u)=>{setClient(u);if(onClientUpdate)onClientUpdate(u);};
  const isAdmin=currentUser?.role_level==='admin';
  const canSendOnboarding=isPrivilegedRole(currentUser?.role_level);
  const[showOnboardingModal,setShowOnboardingModal]=useState(false);
  const[showContractModal,setShowContractModal]=useState(false);
  const handleDelete=()=>{if(onClientDelete)onClientDelete(client);};
  // ── Option C: header client switcher (preserves current sub-tab across switch) ──
  const[showSwitcher,setShowSwitcher]=useState(false);
  const[switchQ,setSwitchQ]=useState('');
  const switchList=(clients||[]).slice().sort((a,b)=>a.name.localeCompare(b.name))
    .filter(x=>x.name.toLowerCase().includes(switchQ.trim().toLowerCase()));
  const switchTo=(oc)=>{
    if(oc.id!==client.id){writeHash({tab:'clients',clientId:oc.id,clientTab:tab});onSwitch&&onSwitch(oc);}
    setShowSwitcher(false);setSwitchQ('');
  };
  const isProject=client.retainer_type==='project';
  const TABS=[['overview','Overview'],['brand','Brand Profile'],...(isAdmin?[['billing','Billing']]:[]),...(isProject&&ProjectTab?[['project','Project']]:[]),['scope','Scope'],['sop','Brand SOP'],['reports','Reports'],['seo','SEO'],['calendar','Content Calendar']];
  return h`<div>
    <div style=${{display:'flex',alignItems:'center',gap:14,paddingBottom:24,borderBottom:'1px solid var(--bd)',marginBottom:4}}>
      <button class="bb" onClick=${onBack}><i class="ti ti-arrow-left"></i></button>
      <${Av} i=${client.initials||(client.name.slice(0,2).toUpperCase())} c=${client.brand_color_primary||client.color} s=${50}/>
      <div style=${{flex:1,minWidth:0}}>
        <div class="cli-switch">
          <div class="cli-switch-name" style=${{fontFamily:"'Fraunces','Inter',serif",fontSize:28,fontWeight:500,color:'var(--t1)',letterSpacing:'-.01em',lineHeight:1.15,fontVariationSettings:'"opsz" 96'}}>${client.name}</div>
          ${(clients||[]).length>1&&h`<button class=${'cli-switch-btn'+(showSwitcher?' on':'')} onClick=${()=>setShowSwitcher(s=>!s)} title="Switch client" aria-label="Switch client"><i class="ti ti-selector"></i></button>`}
          ${showSwitcher&&h`<div class="cli-switch-backdrop" onClick=${()=>{setShowSwitcher(false);setSwitchQ('');}}></div>`}
          ${showSwitcher&&h`<div class="cli-switch-menu">
            <div class="cli-switch-search-wrap"><i class="ti ti-search"></i><input class="cli-switch-search" placeholder="Switch to client…" value=${switchQ} onInput=${e=>setSwitchQ(e.target.value)} autoFocus/></div>
            <div class="cli-switch-list">
              ${switchList.length===0&&h`<div class="cli-switch-empty">No clients found</div>`}
              ${switchList.map(oc=>h`<div key=${oc.id} class=${'cli-switch-item'+(oc.id===client.id?' on':'')} onClick=${()=>switchTo(oc)}>
                <${Av} i=${oc.initials||oc.name.slice(0,2).toUpperCase()} c=${oc.brand_color_primary||oc.color||'#999'} s=${24} round=${true}/>
                <span class="cli-switch-item-nm">${oc.name}</span>
                ${oc.id===client.id&&h`<i class="ti ti-check"></i>`}
              </div>`)}
            </div>
          </div>`}
        </div>
        <div style=${{fontSize:15,color:'var(--t2)',marginTop:3}}>
          ${client.industry}${client.instagram_handle&&h`<span> · <a href=${'https://instagram.com/'+client.instagram_handle.replace('@','')} target="_blank" style=${{color:'var(--blue)',textDecoration:'none'}}>${client.instagram_handle}</a></span>`}
        </div>
      </div>
      <div style=${{display:'flex',alignItems:'center',gap:8}}>
        ${(client.brand_color_primary||client.brand_color_secondary)&&h`<div style=${{display:'flex',gap:5}}>${[client.brand_color_primary,client.brand_color_secondary,client.brand_color_accent].filter(Boolean).map((col,i)=>h`<div key=${i} style=${{width:20,height:20,borderRadius:'50%',background:col,border:'2px solid var(--surface)',boxShadow:'0 1px 3px rgba(0,0,0,.15)'}}></div>`)}</div>`}
        <${CPill} status=${client.status}/>
        ${canSendOnboarding&&!['form_filled','contract_sent','contract_signed','onboarded'].includes(client.onboarding_status)&&h`<button onClick=${()=>setShowOnboardingModal(true)} title=${client.onboarding_status==='not_started'||!client.onboarding_status?'Send onboarding form':'Resend onboarding form'} style=${{background:'transparent',border:'1px solid var(--bd)',borderRadius:8,padding:'7px 12px',fontSize:12,color:'var(--t1)',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6}}><i class="ti ti-send" style=${{fontSize:13,color:client.brand_color_primary||'#ff00ee'}}></i>${client.onboarding_status==='not_started'||!client.onboarding_status?'Send onboarding':'Resend onboarding'}</button>`}
        ${canSendOnboarding&&['form_filled','contract_sent'].includes(client.onboarding_status)&&h`<button onClick=${()=>setShowContractModal(true)} title=${client.onboarding_status==='form_filled'?'Send retainer contract for e-signature':'Resend contract — fires a fresh Documenso instance'} style=${{background:'transparent',border:'1px solid var(--bd)',borderRadius:8,padding:'7px 12px',fontSize:12,color:'var(--t1)',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6}}><i class="ti ti-file-signature" style=${{fontSize:13,color:client.brand_color_primary||'#ff00ee'}}></i>${client.onboarding_status==='form_filled'?'Send contract':'Resend contract'}</button>`}
        ${canSendOnboarding&&h`<${OBPill} status=${client.onboarding_status||'not_started'}/>`}
        ${isAdmin&&onClientDelete&&h`<button onClick=${handleDelete} title="Move to Trash" style=${{background:'transparent',border:'1px solid rgba(220,38,38,.3)',borderRadius:8,padding:'7px 12px',fontSize:12,color:'#DC2626',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6}}><i class="ti ti-trash" style=${{fontSize:13}}></i>Delete</button>`}
      </div>
    </div>
    ${canSendOnboarding&&client.onboarding_status&&client.onboarding_status!=='not_started'&&h`<${OBStageTracker} status=${client.onboarding_status} brand=${client.brand_color_primary||'#ff00ee'}/>`}
    <div class="dtabs">${TABS.map(([id,lb])=>h`<div key=${id} class=${'dtab'+(tab===id?' on':'')} onClick=${()=>setTab(id)}>${lb}</div>`)}</div>
    ${tab==='overview'&&h`<${OverviewTab} c=${client} onUpdate=${updateClient} showToast=${showToast} currentUser=${currentUser}/>`}
    ${tab==='brand'&&h`<${BrandTab} c=${client} onUpdate=${updateClient} showToast=${showToast} currentUser=${currentUser}/>`}
    ${tab==='billing'&&h`<${BillingTab} c=${client} onUpdate=${updateClient} showToast=${showToast} isAdmin=${isAdmin}/>`}
    ${tab==='project'&&ProjectTab&&h`<${ProjectTab} c=${client} onUpdate=${updateClient} showToast=${showToast} currentUser=${currentUser}/>`}
    ${tab==='scope'&&h`<${ScopeTab} c=${client} currentUser=${currentUser} showToast=${showToast}/>`}
    ${tab==='sop'&&h`<${SOPTab} c=${client} onUpdate=${updateClient} showToast=${showToast}/>`}
    ${tab==='reports'&&h`<${ReportsTab} client=${client} showToast=${showToast}/>`}
    ${tab==='seo'&&h`<${ClientSEOTab} c=${client} onUpdate=${updateClient} showToast=${showToast}/>`}
    ${tab==='calendar'&&h`<${ContentCalendar} client=${client} currentUser=${currentUser}/>`}
    ${showOnboardingModal&&h`<${SendOnboardingModal} c=${client} currentUser=${currentUser} onClose=${()=>setShowOnboardingModal(false)} onSent=${updateClient} showToast=${showToast}/>`}
    ${showContractModal&&h`<${SendContractModal} c=${client} currentUser=${currentUser} onClose=${()=>setShowContractModal(false)} onSent=${updateClient} showToast=${showToast}/>`}
    ${toast&&h`<${Toast} key=${toast.k} msg=${toast.msg}/>`}
  </div>`;
}

    // ── AddClientModal ──
function AddClientModal({onClose,onAdd,showToast}){
  const[step,setStep]=useState(1);const[saving,setSaving]=useState(false);
  const[form,setForm]=useState({status:'active',retainer_type:'retainer',payment_status:'active',payment_terms:'monthly',invoice_day:1,brand_color_primary:'#1A1A1A',brand_color_secondary:'#787774',monthly_reels:0,monthly_creatives:0,monthly_carousels:0,monthly_extra:0,posting_days:'Mon,Tue,Wed,Thu,Fri,Sat'});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const teamNames=useTeamNames();
  const autoIni=(name)=>{if(!name)return'';const words=name.trim().split(' ');return words.length>=2?words[0][0].toUpperCase()+words[words.length-1][0].toUpperCase():name.slice(0,2).toUpperCase();};
  const submit=async()=>{if(!form.name?.trim()){showToast('Name required');return;}setSaving(true);try{const payload={...form,initials:form.initials||autoIni(form.name),color:form.brand_color_primary||'#1A1A1A'};if(payload.retainer_type==='project'&&!payload.project_status)payload.project_status='lead';const rows=await rpcCall('client_create',{p_data:payload});onAdd(rows[0]);showToast(`${form.name} added ✓`);onClose();}catch(e){console.error('Add client failed',e);const m=String(e.message||e.code||'');showToast(m.includes('plan.limit_clients')?'⚠️ Client limit reached for your plan. Upgrade from the Subscription tab to add more clients.':`Failed: ${e.message||e}`);}finally{setSaving(false);}};
  const steps=['Basics','Contact','Brand','Billing'];
  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose()}}>
    <div class="modal-box">
      <div class="modal-head"><div><div style=${{fontSize:16,fontWeight:600}}>Add new client</div><div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>Step ${step} of 4 — ${steps[step-1]}</div></div><button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button></div>
      <div class="modal-body">
        <div class="step-bar">${steps.map((s,i)=>h`<div key=${i} class=${'step'+(step===i+1?' on':step>i+1?' done':'')}>${step>i+1?h`<i class="ti ti-check"></i> `:''} ${s}</div>`)}</div>
        ${step===1&&h`<div>
          <div class="fi-group"><div class="fi-lbl">Brand name *</div><input class="fi" type="text" placeholder="e.g. Blu Walker, Krishna Tea..." value=${form.name||''} onInput=${e=>{set('name',e.target.value);if(!form.initials)set('initials',autoIni(e.target.value));}}/></div>
          <div class="fi-grid fi-group"><div><div class="fi-lbl">Industry</div><select class="fi fi-select" value=${form.industry||''} onChange=${e=>set('industry',e.target.value)}><option value="">Select...</option>${INDUSTRIES.map(i=>h`<option key=${i} value=${i}>${i}</option>`)}</select></div><div><div class="fi-lbl">Initials</div><input class="fi" type="text" maxLength="2" placeholder="BW" value=${form.initials||''} onInput=${e=>set('initials',e.target.value.toUpperCase())} style=${{textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600}}/></div></div>
          <div class="fi-grid fi-group"><div><div class="fi-lbl">Status</div><select class="fi fi-select" value=${form.status} onChange=${e=>set('status',e.target.value)}><option value="active">Active</option><option value="onboarding">Onboarding</option><option value="inactive">Inactive</option></select></div><div><div class="fi-lbl">Type</div><select class="fi fi-select" value=${form.retainer_type} onChange=${e=>set('retainer_type',e.target.value)}><option value="retainer">Monthly retainer</option><option value="project">Project-based</option></select></div></div>
          <div class="fi-group"><div class="fi-lbl">Account manager</div><select class="fi fi-select" value=${form.manager||''} onChange=${e=>set('manager',e.target.value)}><option value="">Assign manager...</option>${teamNames.map(n=>h`<option key=${n} value=${n}>${n}</option>`)}</select></div>
          <div class="fi-group"><div class="fi-lbl">Services</div><div style=${{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>${SERVICES.map(sv=>{const on=(form.services||'').split(',').map(s=>s.trim()).filter(Boolean).includes(sv);return h`<button key=${sv} type="button" class=${'fb'+(on?' on':'')} style=${{fontSize:12}} onClick=${()=>{const cur=(form.services||'').split(',').map(s=>s.trim()).filter(Boolean);set('services',on?cur.filter(s=>s!==sv).join(','):[...cur,sv].join(','));}}>${sv}</button>`;})}</div></div>
        </div>`}
        ${step===2&&h`<div>
          <div class="fi-group"><div class="fi-lbl">Contact person</div><input class="fi" type="text" placeholder="e.g. Priya Sharma — Marketing Head" value=${form.contact_name||''} onInput=${e=>set('contact_name',e.target.value)}/></div>
          <div class="fi-grid fi-group"><div><div class="fi-lbl">Phone</div><input class="fi" type="tel" placeholder="+91 98765 43210" value=${form.contact_phone||''} onInput=${e=>set('contact_phone',e.target.value)}/></div><div><div class="fi-lbl">Email</div><input class="fi" placeholder="hello@brand.com" value=${form.contact_email||''} onInput=${e=>set('contact_email',e.target.value)}/></div></div>
          <div class="fi-grid fi-group"><div><div class="fi-lbl">Website</div><input class="fi" type="url" placeholder="https://www.brand.com" value=${form.website||''} onInput=${e=>set('website',e.target.value)}/></div><div><div class="fi-lbl">Instagram</div><input class="fi" type="text" placeholder="@brandhandle" value=${form.instagram_handle||''} onInput=${e=>set('instagram_handle',e.target.value)}/></div></div>
        </div>`}
        ${step===3&&h`<div>
          <div class="fi-group"><div class="fi-lbl">Brand colours</div><div class="fi-grid"><div><div class="fi-lbl">Primary</div><div style=${{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'var(--bg)',borderRadius:'var(--r)'}}><input type="color" value=${form.brand_color_primary} onChange=${e=>set('brand_color_primary',e.target.value)} style=${{width:36,height:36,border:'none',borderRadius:8,cursor:'pointer',padding:0}}/><span style=${{fontFamily:'monospace',fontSize:13,color:'var(--t2)'}}>${form.brand_color_primary}</span></div></div><div><div class="fi-lbl">Secondary</div><div style=${{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'var(--bg)',borderRadius:'var(--r)'}}><input type="color" value=${form.brand_color_secondary} onChange=${e=>set('brand_color_secondary',e.target.value)} style=${{width:36,height:36,border:'none',borderRadius:8,cursor:'pointer',padding:0}}/><span style=${{fontFamily:'monospace',fontSize:13,color:'var(--t2)'}}>${form.brand_color_secondary}</span></div></div></div></div>
          <div class="fi-group"><div class="fi-lbl">Brand brief</div><textarea class="fi" rows="3" placeholder="Quick description for now — fill in more detail from the client profile later..." value=${form.brand_brief||''} onInput=${e=>set('brand_brief',e.target.value)}></textarea></div>
          <div class="fi-group"><div class="fi-lbl">Monthly deliverables</div><div class="deliv-grid"><div class="deliv-card"><div class="fi-lbl" style=${{textAlign:'center',marginBottom:6}}>Reels</div><input class="fi" type="number" min="0" max="99" value=${form.monthly_reels} onChange=${e=>set('monthly_reels',parseInt(e.target.value)||0)} style=${{textAlign:'center'}}/></div><div class="deliv-card"><div class="fi-lbl" style=${{textAlign:'center',marginBottom:6}}>Creatives</div><input class="fi" type="number" min="0" max="99" value=${form.monthly_creatives} onChange=${e=>set('monthly_creatives',parseInt(e.target.value)||0)} style=${{textAlign:'center'}}/></div><div class="deliv-card"><div class="fi-lbl" style=${{textAlign:'center',marginBottom:6}}>Carousels</div><input class="fi" type="number" min="0" max="99" value=${form.monthly_carousels} onChange=${e=>set('monthly_carousels',parseInt(e.target.value)||0)} style=${{textAlign:'center'}}/></div><div class="deliv-card"><div class="fi-lbl" style=${{textAlign:'center',marginBottom:6}}>Extra</div><input class="fi" type="number" min="0" max="99" value=${form.monthly_extra} onChange=${e=>set('monthly_extra',parseInt(e.target.value)||0)} style=${{textAlign:'center'}}/></div></div></div>
          <div class="fi-group"><div class="fi-lbl">Posting days</div><input class="fi" type="text" placeholder="Mon, Tue, Wed, Thu, Fri, Sat" value=${form.posting_days||''} onInput=${e=>set('posting_days',e.target.value)}/></div>
        </div>`}
        ${step===4&&h`<div>
          ${form.retainer_type==='project'&&h`<div class="fi-group" style=${{padding:'12px 14px',background:'rgba(255,0,238,.05)',border:'1px solid rgba(255,0,238,.25)',borderRadius:10,marginBottom:14}}>
            <div class="fi-lbl" style=${{color:'#A8009C'}}><i class="ti ti-rocket" style=${{fontSize:13,marginRight:5}}></i>Project details</div>
            <div class="fi-grid fi-group"><div><div class="fi-lbl">Deadline</div><input class="fi" type="date" value=${form.project_deadline||''} onChange=${e=>set('project_deadline',e.target.value)}/></div><div><div class="fi-lbl">Budget (₹)</div><input class="fi" type="number" min="0" placeholder="e.g. 25000" value=${form.project_budget||''} onChange=${e=>set('project_budget',e.target.value?Number(e.target.value):'')}/></div></div>
            <div class="fi-grid"><div><div class="fi-lbl">Advance %</div><input class="fi" type="number" min="0" max="100" value=${form.project_advance_pct??50} onChange=${e=>set('project_advance_pct',e.target.value?Number(e.target.value):50)}/></div><div><div class="fi-lbl">Start date</div><input class="fi" type="date" value=${form.project_start_date||''} onChange=${e=>set('project_start_date',e.target.value)}/></div></div>
            <div style=${{fontSize:11.5,color:'var(--t3)',marginTop:8}}>The full timeline &amp; payment gates live in the client's <strong>Project</strong> tab after creation.</div>
          </div>`}
          <div class="fi-group"><div class="fi-lbl">Payment status</div><select class="fi fi-select" value=${form.payment_status} onChange=${e=>set('payment_status',e.target.value)}><option value="active">Active</option><option value="pending">Pending — first payment</option><option value="paused">Paused</option></select></div>
          <div class="fi-grid fi-group"><div><div class="fi-lbl">Contract start</div><input class="fi" type="date" value=${form.contract_start||''} onChange=${e=>set('contract_start',e.target.value)}/></div><div><div class="fi-lbl">Contract end</div><input class="fi" type="date" value=${form.contract_end||''} onChange=${e=>set('contract_end',e.target.value)}/></div></div>
          <div class="fi-group"><div class="fi-lbl">Billing notes</div><textarea class="fi" rows="3" placeholder="Invoice email, GST, payment terms..." value=${form.billing_notes||''} onInput=${e=>set('billing_notes',e.target.value)}></textarea></div>
        </div>`}
      </div>
      <div class="modal-foot">
        <button class="btn-sec" onClick=${step===1?onClose:()=>setStep(s=>s-1)}>${step===1?'Cancel':'← Back'}</button>
        ${step<4&&h`<button class="btn-pri" onClick=${()=>setStep(s=>s+1)} disabled=${step===1&&!form.name?.trim()}>Next: ${steps[step]} →</button>`}
        ${step===4&&h`<button class="btn-pri" onClick=${submit} disabled=${saving}>${saving?h`<i class="ti ti-loader-2 spinner"></i> Creating...`:'Create client'}</button>`}
      </div>
    </div>
  </div>`;
}

    // ── CCard ──
function CCard({c,onClick,openTasks=0,nextPost,oosCount=0}){
  const total=(c.monthly_reels||0)+(c.monthly_creatives||0)+(c.monthly_carousels||0)+(c.monthly_extra||0);
  const col=c.brand_color_primary||c.color||'#4F46E5';
  const ps=c.payment_status||'active';const p=PAY_DOT[ps]||PAY_DOT.active;
  // Show onboarding pill when active (form_sent / contract_sent / etc.) so
  // admin sees pipeline state at a glance. For fresh clients created in the
  // last 14 days but never onboarded, show a soft "Send onboarding →" prompt
  // so they don't slip through the cracks. Older "not_started" clients are
  // assumed legacy and stay quiet.
  const showOBPill=c.onboarding_status&&!['not_started','onboarded'].includes(c.onboarding_status);
  const isFreshNotOnboarded=(!c.onboarding_status||c.onboarding_status==='not_started')&&c.created_at&&((Date.now()-new Date(c.created_at).getTime())<14*86400000);
  return h`<div class="card" onClick=${()=>onClick(c)}>
    <div class="ct">
      <div class="ci">
        <${Av} i=${c.initials||(c.name.slice(0,2).toUpperCase())} c=${col} s=${44}/>
        <div style=${{display:'flex',flexDirection:'column',gap:3}}>
          <div style=${{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}><div class="cn">${c.name}</div>${oosCount>0&&h`<span class="oos-pill" title=${oosCount+' out-of-scope task'+(oosCount>1?'s':'')+' this month'}><i class="ti ti-alert-octagon" style=${{fontSize:10}}></i>${oosCount} OOS</span>`}</div>
          <div class="cind">${c.industry||'—'}</div>
        </div>
      </div>
      <div style=${{display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
        ${showOBPill&&h`<${OBPill} status=${c.onboarding_status}/>`}
        ${isFreshNotOnboarded&&h`<span class="pill" style=${{background:'rgba(255,0,238,.08)',color:'#ff00ee',fontSize:10,fontWeight:600,letterSpacing:'.02em',border:'1px dashed rgba(255,0,238,.35)'}} title="This client was created recently but hasn't been onboarded yet — open them to send the onboarding wizard."><i class="ti ti-send" style=${{fontSize:10,marginRight:3}}></i>Send onboarding</span>`}
        <${CPill} status=${c.status}/>
      </div>
    </div>
    <div class="cstats">
      <div class="cstat"><i class="ti ti-clipboard-list"></i><span><strong>${openTasks}</strong> open</span></div>
      ${nextPost?h`<div class="cstat"><i class="ti ti-calendar-event"></i><span>Next <strong>${fmtS(nextPost)}</strong></span></div>`:h`<div class="cstat"><i class="ti ti-calendar-off" style=${{color:'var(--t3)'}}></i><span style=${{color:'var(--t3)'}}>No upcoming</span></div>`}
      <div class="cstat" title=${'Payment · '+p.lbl}><span class="cdot" style=${{background:p.col}}></span><span>${p.lbl}</span></div>
    </div>
    <div class="cf"><span>${c.manager||'—'}</span><span>${total>0?total+' posts/mo':c.retainer_type}</span></div>
  </div>`;
}

    // ── ScopeReportModal ──
function ScopeReportModal({clients,onClose}){
  const cur=currentScopePeriod();
  const[month,setMonth]=useState(cur.month);
  const[year,setYear]=useState(cur.year);
  const[rows,setRows]=useState([]); // [{client, inScope, oos, flagged, notes, instanceId}]
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const start=`${year}-${String(month).padStart(2,'0')}-01`;
  const last=new Date(year,month,0).getDate();
  const end=`${year}-${String(month).padStart(2,'0')}-${String(last).padStart(2,'0')}`;

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      db('content',`&post_date=gte.${start}&post_date=lte.${end}&select=id,client_id,is_out_of_scope,scope_line_item_id`).catch(()=>[]),
      db('monthly_scope_instances',`&month=eq.${month}&year=eq.${year}`).catch(()=>[]),
    ]).then(([posts,instances])=>{
      const byClient={};
      (posts||[]).forEach(p=>{
        if(!p.client_id)return;
        if(!byClient[p.client_id])byClient[p.client_id]={inScope:0,oos:0};
        if(p.is_out_of_scope)byClient[p.client_id].oos++;
        else if(p.scope_line_item_id)byClient[p.client_id].inScope++;
      });
      const instById={};(instances||[]).forEach(i=>{instById[i.client_id]=i;});
      const out=clients.map(c=>({
        client:c,
        inScope:byClient[c.id]?.inScope||0,
        oos:byClient[c.id]?.oos||0,
        flagged:!!instById[c.id]?.billing_flagged,
        notes:instById[c.id]?.billing_notes||'',
        instanceId:instById[c.id]?.id||null,
      }));
      setRows(out);
    }).finally(()=>setLoading(false));
  },[month,year,clients.length]);

  const setFlag=async(row,flag)=>{
    setSaving(true);
    setRows(rs=>rs.map(r=>r.client.id===row.client.id?{...r,flagged:flag}:r));
    try{
      if(row.instanceId){
        await dbPatch('monthly_scope_instances',row.instanceId,{billing_flagged:flag});
      }else{
        const ins=await dbInsert('monthly_scope_instances',[{client_id:row.client.id,month,year,line_items:[],billing_flagged:flag}]);
        setRows(rs=>rs.map(r=>r.client.id===row.client.id?{...r,instanceId:ins[0]?.id}:r));
      }
    }catch(e){console.warn('[scope-report] flag failed',e);}
    finally{setSaving(false);}
  };
  const setNotes=async(row,notes)=>{
    setRows(rs=>rs.map(r=>r.client.id===row.client.id?{...r,notes}:r));
    try{
      if(row.instanceId)await dbPatch('monthly_scope_instances',row.instanceId,{billing_notes:notes});
      else{const ins=await dbInsert('monthly_scope_instances',[{client_id:row.client.id,month,year,line_items:[],billing_notes:notes}]);setRows(rs=>rs.map(r=>r.client.id===row.client.id?{...r,instanceId:ins[0]?.id}:r));}
    }catch(e){console.warn('[scope-report] notes failed',e);}
  };

  const exportCSV=()=>{
    const esc=(s)=>{const v=String(s??'');return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
    const header=['Client','In-scope tasks','Out-of-scope tasks','Flagged for billing','Notes'];
    const lines=[header.join(',')];
    rows.forEach(r=>lines.push([r.client.name,r.inScope,r.oos,r.flagged?'yes':'no',r.notes].map(esc).join(',')));
    const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`scope-report-${year}-${String(month).padStart(2,'0')}.csv`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  };
  const printPDF=()=>{
    const periodLabel=scopePeriodLabel(month,year);
    const rowsHtml=rows.map(r=>`<tr><td>${r.client.name}</td><td style="text-align:center">${r.inScope}</td><td style="text-align:center;${r.oos>0?'color:#B45309;font-weight:600':''}">${r.oos}</td><td style="text-align:center">${r.flagged?'⚑ Flagged':'—'}</td><td style="font-size:11px;color:#787774">${(r.notes||'').replace(/</g,'&lt;')}</td></tr>`).join('');
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Scope Report — ${periodLabel}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#1A1A1A}h1{font-size:20px;margin:0 0 4px}p.sub{color:#787774;margin:0 0 22px;font-size:13px}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;background:#F7F6F3;padding:10px 12px;font-weight:600;color:#1A1A1A;font-size:11px;text-transform:uppercase;letter-spacing:.04em}td{padding:10px 12px;border-top:1px solid #E8E8E5}@media print{@page{size:A4 landscape;margin:14mm}}</style></head><body><h1>Scope Report — ${periodLabel}</h1><p class="sub">Advance Media Solution · Generated ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</p><table><thead><tr><th>Client</th><th style="text-align:center">In-scope</th><th style="text-align:center">Out of scope</th><th style="text-align:center">Billing flag</th><th>Notes</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>window.onload=()=>window.print();<\/script></body></html>`;
    const win=window.open('','_blank');win.document.write(html);win.document.close();
  };

  const totalOos=rows.reduce((a,r)=>a+r.oos,0);
  const flaggedCount=rows.filter(r=>r.flagged).length;
  const years=[year-1,year,year+1];

  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose()}}>
    <div class="modal-box" style=${{maxWidth:980}}>
      <div class="modal-head">
        <div>
          <div style=${{fontSize:16,fontWeight:600,display:'flex',alignItems:'center',gap:8}}><i class="ti ti-file-analytics" style=${{color:'#B45309',fontSize:18}}></i>Scope Report</div>
          <div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>${scopePeriodLabel(month,year)} · ${rows.length} clients · ${totalOos} OOS task${totalOos===1?'':'s'} · ${flaggedCount} flagged</div>
        </div>
        <button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        <div style=${{display:'flex',gap:8,alignItems:'center',marginBottom:14,flexWrap:'wrap'}}>
          <select class="fi fi-select" value=${month} onChange=${e=>setMonth(parseInt(e.target.value))} style=${{minWidth:140,fontSize:13}}>${MONTHS.map((m,i)=>h`<option key=${i} value=${i+1}>${m}</option>`)}</select>
          <select class="fi fi-select" value=${year} onChange=${e=>setYear(parseInt(e.target.value))} style=${{minWidth:90,fontSize:13}}>${years.map(y=>h`<option key=${y} value=${y}>${y}</option>`)}</select>
          <div style=${{flex:1}}></div>
          <button class="btn-sec" onClick=${exportCSV} style=${{padding:'8px 14px',fontSize:13}}><i class="ti ti-file-spreadsheet"></i>Export CSV</button>
          <button class="btn-sec" onClick=${printPDF} style=${{padding:'8px 14px',fontSize:13}}><i class="ti ti-printer"></i>Print / PDF</button>
        </div>
        ${loading?h`<div style=${{display:'flex',flexDirection:'column',gap:8}}>${[...Array(5)].map((_,i)=>h`<${Skel} key=${i} h=${44}/>`)}</div>`:h`<div class="ltbl-wrap"><table class="ltbl">
          <thead><tr><th>Client</th><th style=${{textAlign:'center',width:90}}>In-scope</th><th style=${{textAlign:'center',width:110}}>Out of scope</th><th style=${{textAlign:'center',width:110}}>Bill flag</th><th>Notes</th></tr></thead>
          <tbody>
            ${rows.map(r=>h`<tr key=${r.client.id} style=${{background:r.flagged?'rgba(251,191,36,.08)':r.oos>0?'rgba(245,158,11,.05)':''}}>
              <td><div style=${{display:'flex',alignItems:'center',gap:8}}><${Av} i=${r.client.initials||r.client.name.slice(0,2)} c=${r.client.brand_color_primary||r.client.color||'#FF00EE'} s=${28}/><span style=${{fontWeight:500}}>${r.client.name}</span></div></td>
              <td style=${{textAlign:'center'}}>${r.inScope}</td>
              <td style=${{textAlign:'center'}}>${r.oos>0?h`<span class="oos-pill">${r.oos}</span>`:h`<span style=${{color:'var(--t3)'}}>0</span>`}</td>
              <td style=${{textAlign:'center'}}><label style=${{display:'inline-flex',alignItems:'center',gap:6,cursor:'pointer'}}><input type="checkbox" checked=${r.flagged} disabled=${saving} onChange=${e=>setFlag(r,e.target.checked)}/>${r.flagged?h`<span style=${{fontSize:11,color:'#B45309',fontWeight:600}}>Flagged</span>`:''}</label></td>
              <td><input class="fi" type="text" placeholder="Add billing note…" value=${r.notes} onBlur=${e=>setNotes(r,e.target.value)} onChange=${e=>setRows(rs=>rs.map(x=>x.client.id===r.client.id?{...x,notes:e.target.value}:x))} style=${{fontSize:12,padding:'5px 8px'}}/></td>
            </tr>`)}
          </tbody>
        </table></div>`}
      </div>
      <div class="modal-foot"><button class="btn-sec" onClick=${onClose}>Close</button></div>
    </div>
  </div>`;
}

    // ── ContentPlaybookCard ──
function ContentPlaybookCard({playbook,canEdit,onEdit}){
  const isSet=!!(playbook&&playbook.trim());
  const preview=isSet?playbook.trim().replace(/\s+/g,' ').slice(0,118):'';
  return h`<div onClick=${canEdit?onEdit:null} style=${{display:'flex',alignItems:'center',gap:14,padding:'13px 16px',marginBottom:18,borderRadius:'var(--r)',cursor:canEdit?'pointer':'default',background:'linear-gradient(90deg,rgba(255,0,238,.07),rgba(255,0,238,.015))',border:'1px solid rgba(255,0,238,.26)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.5),0 4px 16px rgba(255,0,238,.07)'}}>
    <div style=${{width:38,height:38,borderRadius:10,flexShrink:0,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#FF00EE,#A8009C)',boxShadow:'0 4px 12px rgba(255,0,238,.35)'}}><i class="ti ti-sparkles" style=${{fontSize:19,color:'#fff'}}></i></div>
    <div style=${{flex:1,minWidth:0}}>
      <div style=${{display:'flex',alignItems:'center',gap:8}}>
        <span style=${{fontSize:14,fontWeight:600,color:'var(--t1)'}}>AMS Content Playbook</span>
        <span style=${{fontSize:9.5,fontWeight:700,letterSpacing:.4,textTransform:'uppercase',padding:'2px 7px',borderRadius:20,background:isSet?'rgba(15,128,61,.12)':'rgba(180,83,9,.12)',color:isSet?'#15803D':'#B45309'}}>${isSet?'Active':'Not set'}</span>
      </div>
      <div style=${{fontSize:12,color:'var(--t2)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${isSet?preview+'…':'The house style applied to every AI-generated calendar — voice, hooks, hashtags, cadence. Applies to all clients.'}</div>
    </div>
    ${canEdit&&h`<button class="btn-sec" style=${{flexShrink:0,padding:'7px 14px',height:34,fontSize:13}} onClick=${e=>{e.stopPropagation();onEdit();}}><i class="ti ti-pencil"></i>${isSet?'Edit':'Set up'}</button>`}
  </div>`;
}

    // ── ContentPlaybookModal ──
function ContentPlaybookModal({initial,captionInitial,onClose,onSaved,showToast}){
  const[text,setText]=useState(initial||'');const[capText,setCapText]=useState(captionInitial||'');const[saving,setSaving]=useState(false);
  const save=async()=>{setSaving(true);try{
    await rpcCall('agency_settings_update',{p_patch:{content_playbook:text.trim()||null,caption_prompt_default:capText.trim()||null}});
    logActivity({action:'update',table_name:'agency_settings',record_id:'1',record_label:'Content playbook',changes:{content_playbook:'(updated)',caption_prompt_default:'(updated)'}});
    onSaved(text.trim(),capText.trim());showToast('House style saved ✓');onClose();
  }catch(e){showToast('Save failed: '+(e?.message||'unknown'));}finally{setSaving(false);}};
  const ph='e.g.\nVOICE: warm, confident, never salesy. 2–4 short lines per caption, one emoji max.\nHOOKS: open with a question or a bold claim — never "Check out our…".\nHASHTAGS: 6–8, mix of brand + niche + 1–2 broad. lowercase.\nCADENCE: ≥1 reel/week; rotate pillars across Mon/Wed/Fri.\nDO: India-aware references, festivals, regional moments.\nDON\'T: generic stock phrasing, hashtag stuffing, ALL CAPS.\n\nEXAMPLE POST (reel):\nTitle: …\nHook: …\nCaption: …';
  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose()}}>
    <div class="modal-box" style=${{maxWidth:680}}>
      <div class="modal-head">
        <div><div style=${{fontSize:16,fontWeight:600,display:'flex',alignItems:'center',gap:8}}><i class="ti ti-sparkles" style=${{fontSize:18,color:'#FF00EE',filter:'drop-shadow(0 0 6px rgba(255,0,238,.45))'}}></i>AMS Content Playbook</div><div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>House style for every AI-generated calendar · applies to all clients</div></div>
        <button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        <div style=${{fontSize:12,color:'var(--t2)',lineHeight:1.6,marginBottom:12,padding:'10px 12px',background:'rgba(255,0,238,.06)',border:'1px solid rgba(255,0,238,.2)',borderRadius:'var(--r)'}}><i class="ti ti-info-circle" style=${{color:'#A8009C'}}></i> Describe <strong>how AMS builds a month</strong> — caption voice & length, hook style, emoji/hashtag rules, pillar rotation & cadence, note format, hard do's & don'ts. Paste a worked example or two of real posts. Each brand's own voice still comes from its brand brief.</div>
        <textarea class="fi" rows="14" style=${{resize:'vertical',lineHeight:1.6,fontFamily:'inherit'}} placeholder=${ph} value=${text} onInput=${e=>setText(e.target.value)}></textarea>
        <div style=${{fontSize:11,color:'var(--t3)',marginTop:6}}>${text.length} characters · takes effect on the next generation</div>

        <div style=${{height:1,background:'var(--bd)',margin:'18px 0 14px'}}></div>
        <div style=${{fontSize:13,fontWeight:600,color:'var(--t1)',display:'flex',alignItems:'center',gap:7,marginBottom:6}}><i class="ti ti-sparkles" style=${{fontSize:15,color:'#A8009C'}}></i>Default caption prompt</div>
        <div style=${{fontSize:12,color:'var(--t2)',lineHeight:1.55,marginBottom:10}}>Used by the per-post <strong>"Generate with AI"</strong> button when a client has no caption prompt of its own. AI reads the post's creative and writes the caption following these rules. A client's own prompt (Brand tab) always wins.</div>
        <textarea class="fi" rows="6" style=${{resize:'vertical',lineHeight:1.6,fontFamily:'inherit'}} placeholder=${'e.g.\n2–4 short lines, warm and confident. One emoji max.\nOpen with a hook tied to what\'s in the image.\nEnd with a soft CTA (no "DM us now!").\nNever generic stock phrasing or ALL CAPS.'} value=${capText} onInput=${e=>setCapText(e.target.value)}></textarea>
        <div style=${{fontSize:11,color:'var(--t3)',marginTop:6}}>${capText.length} characters</div>
      </div>
      <div class="modal-foot">
        <button class="btn-sec" onClick=${onClose}>Cancel</button>
        <button class="btn-pri" onClick=${save} disabled=${saving}>${saving?h`<i class="ti ti-loader-2 spinner"></i> Saving...`:h`<i class="ti ti-check"></i> Save house style`}</button>
      </div>
    </div>
  </div>`;
}

    // ── ClientsView ──
function ClientsView({clients,loading,onClient,onAddClient,currentUser,showToast}){
  const[f,setF]=useState('all');const[svc,setSvc]=useState('all');const[search,setSearch]=useState('');
  const[postStats,setPostStats]=useState({});
  const[oosByClient,setOosByClient]=useState({});
  const[showReport,setShowReport]=useState(false);
  const[playbook,setPlaybook]=useState(undefined);const[capDefault,setCapDefault]=useState('');const[showPlaybook,setShowPlaybook]=useState(false);
  const isAdmin=currentUser?.role_level==='admin';
  const canEditPlaybook=currentUser?.role_level==='admin'||currentUser?.role_level==='manager';
  useEffect(()=>{rpcCall('agency_settings_get').then(r=>{setPlaybook(r?.content_playbook||'');setCapDefault(r?.caption_prompt_default||'');}).catch(()=>setPlaybook(''));},[]);
  useEffect(()=>{
    const today=todayISO();const future=new Date();future.setDate(future.getDate()+90);
    const fstr=`${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')}`;
    db('content',`&post_date=gte.${today}&post_date=lte.${fstr}&workflow_status=neq.posted&order=post_date.asc`).then(posts=>{
      const stats={};
      posts.forEach(p=>{if(!p.client_id)return;if(!stats[p.client_id])stats[p.client_id]={open:0,next:null};stats[p.client_id].open++;if(!stats[p.client_id].next)stats[p.client_id].next=p.post_date;});
      setPostStats(stats);
    }).catch(_loadFail('client-post-stats'));
  },[]);
  useEffect(()=>{
    const{month,year}=currentScopePeriod();
    const start=`${year}-${String(month).padStart(2,'0')}-01`;
    const last=new Date(year,month,0);
    const end=`${year}-${String(month).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
    db('content',`&is_out_of_scope=eq.true&post_date=gte.${start}&post_date=lte.${end}&select=client_id`).then(rows=>{
      const counts={};(rows||[]).forEach(r=>{if(r.client_id)counts[r.client_id]=(counts[r.client_id]||0)+1;});
      setOosByClient(counts);
    }).catch(()=>setOosByClient({}));
  },[]);
  const act=clients.filter(c=>c.status==='active');const inact=clients.filter(c=>c.status!=='active');
  const base=f==='active'?act:f==='inactive'?inact:clients;
  const bySvc=svc==='all'?base:base.filter(c=>(c.services||'').split(',').map(s=>s.trim()).includes(svc));
  const shown=search?bySvc.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())||(c.industry||'').toLowerCase().includes(search.toLowerCase())):bySvc;
  return h`<div>
    <div style=${{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:6,flexWrap:'wrap',gap:12}}>
      <div><div class="greeting" style=${{fontSize:26,marginBottom:4}}>Clients</div><div class="gsub" style=${{marginBottom:0}}>${clients.length} brands · ${act.length} active</div></div>
      <div style=${{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        ${isAdmin&&h`<button class="btn-sec" onClick=${()=>setShowReport(true)} style=${{whiteSpace:'nowrap',padding:'8px 14px',height:38,fontSize:13}}><i class="ti ti-file-analytics" style=${{color:'#B45309'}}></i>Scope Report</button>`}
        <select class="fi fi-select" value=${svc} onChange=${e=>setSvc(e.target.value)} style=${{height:38,paddingRight:28,minWidth:160,fontSize:13}}>
          <option value="all">All services</option>
          ${SERVICES.map(sv=>h`<option key=${sv} value=${sv}>${sv}</option>`)}
        </select>
        <button class="add-client-btn" onClick=${onAddClient} style=${{whiteSpace:'nowrap'}}><i class="ti ti-plus"></i>Add client</button>
      </div>
    </div>
    <div style=${{display:'flex',gap:8,margin:'14px 0 4px'}}>
      <div style=${{position:'relative',flex:1}}>
        <i class="ti ti-search" style=${{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'var(--t3)',pointerEvents:'none'}}></i>
        <input class="fi" placeholder="Search clients by name or industry…" value=${search} onInput=${e=>setSearch(e.target.value)} style=${{paddingLeft:32}}/>
      </div>
      ${search&&h`<button class="btn-sec" style=${{padding:'0 12px',height:38}} onClick=${()=>setSearch('')}><i class="ti ti-x" style=${{fontSize:13}}></i></button>`}
    </div>
    <div class="filters" style=${{marginTop:8}}>${[['all',`All — ${clients.length}`],['active',`Active — ${act.length}`],['inactive',`Inactive — ${inact.length}`]].map(([id,lb])=>h`<button key=${id} class=${'fb'+(f===id?' on':'')} onClick=${()=>setF(id)}>${lb}</button>`)}</div>
    ${playbook!==undefined&&h`<div style=${{marginTop:16}}><${ContentPlaybookCard} playbook=${playbook} canEdit=${canEditPlaybook} onEdit=${()=>setShowPlaybook(true)}/></div>`}
    ${loading?h`<div class="cg2">${[...Array(8)].map((_,i)=>h`<${Skel} key=${i}/>`)}</div>`
    :shown.length===0?h`<div class="empty"><i class="ti ti-search-off"></i><div class="empty-t">No clients found</div><div class="empty-s">Try a different search or filter</div></div>`
    :h`<div class="cg2">${shown.map(c=>h`<${CCard} key=${c.id} c=${c} onClick=${onClient} openTasks=${postStats[c.id]?.open||0} nextPost=${postStats[c.id]?.next} oosCount=${oosByClient[c.id]||0}/>`)} </div>`}
    ${showReport&&h`<${ScopeReportModal} clients=${clients} onClose=${()=>setShowReport(false)}/>`}
    ${showPlaybook&&h`<${ContentPlaybookModal} initial=${playbook||''} captionInitial=${capDefault||''} onClose=${()=>setShowPlaybook(false)} onSaved=${(pb,cap)=>{setPlaybook(pb);setCapDefault(cap);}} showToast=${showToast}/>`}
  </div>`;
}


    return { OverviewTab,BrandTab,ScopeLineEditor,ScopeTab,SOPTab,ClientDetail,AddClientModal,CCard,ScopeReportModal,ContentPlaybookCard,ContentPlaybookModal,ClientsView };
  }
  window.AMS_CLIENTS = { buildClients };
})();

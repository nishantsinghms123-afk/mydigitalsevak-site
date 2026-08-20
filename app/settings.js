// settings.js — SettingsPage (account, team management, agency, appearance, integrations,
// trash, audit, backup, danger zone), extracted from index.html (Phase 3.9 split). Sub-views
// (TrashView/AuditView/AgencySettingsSection/etc.) stay in index.html and are injected.
// window.AMS_SETTINGS.buildSettings(deps) -> { SettingsPage }.
(function(){
  function buildSettings(deps){
    const {React,h,useState,useEffect,useRef,useCallback,useMemo,supabase,db,rpcCall,t,Av,Skel,Toast,NAVS,ROLES,ROLE_BADGE,AgencySettingsSection,AuditView,BackupHealthView,IntegrationsSection,ConnectedAccountsSection,TrashView,hashPwd,hashPwdLegacy,hashPwdPbkdf2,verifyPwd,isEditorRole,loginLockClear,sortTeam,OnboardingTemplatesSection} = deps;

    // ── SheetsApiKeySection ──
// Org-level Google Sheets API key (agency_settings.sheets_api_key) used by the
// SEO dashboard. Replaces the old per-browser localStorage pattern — one admin
// sets it once per tenant. Falls back to localStorage editing if the migration
// adding the column hasn't been applied yet, and always mirrors the value into
// localStorage ('ams_sheets_api_key') so existing readers keep working.
function SheetsApiKeySection({user,showToast}){
  const LS_KEY='ams_sheets_api_key';
  // agency_settings_update is admin/manager-gated — other roles save per-browser only.
  const canOrgWrite=user?.role_level==='admin'||user?.role_level==='manager';
  const[val,setVal]=useState('');
  const[orgMode,setOrgMode]=useState(false); // true once agency_settings.sheets_api_key exists
  const[loaded,setLoaded]=useState(false);
  const[saving,setSaving]=useState(false);
  useEffect(()=>{
    (async()=>{
      try{
        const row=await rpcCall('agency_settings_get');
        if(row&&Object.prototype.hasOwnProperty.call(row,'sheets_api_key')){
          setOrgMode(true);
          setVal(row.sheets_api_key||'');
        }else{
          setVal(localStorage.getItem(LS_KEY)||'');
        }
      }catch(_){ try{setVal(localStorage.getItem(LS_KEY)||'');}catch(__){} }
      finally{ setLoaded(true); }
    })();
  },[]);
  const save=async()=>{
    const v=val.trim();
    setSaving(true);
    try{
      if(orgMode&&canOrgWrite){
        await rpcCall('agency_settings_update',{p_patch:{sheets_api_key:v}});
      }
      try{localStorage.setItem(LS_KEY,v);}catch(_){/* private mode */}
      showToast(orgMode&&canOrgWrite?'Sheets API key saved for the whole workspace ✓':'Sheets API key saved in this browser ✓');
    }catch(e){ showToast('Failed to save: '+String(e?.message||e?.code||'unknown')); }
    finally{ setSaving(false); }
  };
  return h`<div class="settings-section">
    <div class="settings-section-title"><i class="ti ti-table" style=${{fontSize:16}}></i>Google Sheets API key</div>
    <div style=${{fontSize:13,color:'var(--t2)',marginBottom:12,lineHeight:1.5}}>Used by the SEO dashboard to read the per-client backlink sheets. ${orgMode?(canOrgWrite?'Saved once for the whole workspace — every staff member and device uses it automatically.':'Set workspace-wide by an admin/manager — saving here stores it in this browser only.'):h`<span style=${{color:'var(--amber)'}}>Workspace-level storage needs the latest migration — until then this saves to this browser only.</span>`}</div>
    <div style=${{display:'flex',gap:8,flexWrap:'wrap'}}>
      <input class="fi" type="text" style=${{flex:'1 1 280px',fontFamily:'monospace',fontSize:12.5}} placeholder="AIza…" value=${val} onInput=${e=>setVal(e.target.value)} disabled=${!loaded}/>
      <button class="btn-pri" onClick=${save} disabled=${saving||!loaded}>${saving?h`<i class="ti ti-loader-2 spinner"></i> Saving…`:h`<i class="ti ti-check"></i> Save`}</button>
    </div>
    <div style=${{fontSize:11.5,color:'var(--t3)',marginTop:8,lineHeight:1.5}}>Get one in Google Cloud Console → APIs & Services → Credentials → Create credentials → API key (enable the Google Sheets API for the project). Leave blank and Save to clear it.</div>
  </div>`;
}

    // ── SettingsPage ──
function SettingsPage({user,theme,setTheme,onSignOut,team,setTeam,loading,clients=[]}){
  const[sec,setSec]=useState('account');const[toast,setToast]=useState(null);const tk=useRef(0);const showToast=(msg)=>{tk.current++;setToast({msg,k:tk.current});};
  // Add member form
  const[inviteName,setInviteName]=useState('');const[inviteEmail,setInviteEmail]=useState('');const[invitePassword,setInvitePassword]=useState('');const[inviteRole,setInviteRole]=useState('editor');const[inviting,setInviting]=useState(false);
  // Change own password
  const[curPwd,setCurPwd]=useState('');const[newPwd,setNewPwd]=useState('');const[confirmPwd,setConfirmPwd]=useState('');const[changingPwd,setChangingPwd]=useState(false);
  // Reset member password
  const[resetMember,setResetMember]=useState(null);const[resetPwd,setResetPwd]=useState('');const[resetting,setResetting]=useState(false);
  // Edit member details (name + email)
  const[editMember,setEditMember]=useState(null);const[editName,setEditName]=useState('');const[editEmail,setEditEmail]=useState('');const[editSaving,setEditSaving]=useState(false);

  const addMember=async()=>{
    if(!inviteName.trim()||!inviteEmail.trim()||!invitePassword.trim())return;
    if(invitePassword.length<6){showToast('Password must be at least 6 characters');return;}
    setInviting(true);
    try{
      const existing=team.find(m=>m.email===inviteEmail.trim().toLowerCase());
      const{hash,salt,algo}=await hashPwd(invitePassword);
      const nm=inviteName.trim();const ini=nm.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      // tm_save_staff (migration 038) decides insert-vs-reactivate server-side by email.
      const saved=await rpcCall('tm_save_staff',{p_data:{name:nm,email:inviteEmail.trim().toLowerCase(),password:hash,password_salt:salt,password_algo:algo,role_level:inviteRole,initials:ini,color:'#FF00EE',role:ROLES[inviteRole]}});
      if(existing){
        setTeam(ts=>ts.map(t=>t.id===saved.id?saved:t));
        showToast(`${inviteName} updated ✓`);
      } else {
        setTeam(ts=>[...ts,saved]);
        showToast(`${nm} added ✓ — share their password with them`);
      }
      setInviteName('');setInviteEmail('');setInvitePassword('');
    }catch(e){const m=String(e.message||e.code||'');showToast(m.includes('plan.limit_seats')?'⚠️ Team seat limit reached for your plan. Upgrade from the Subscription tab to add more members.':'Failed: '+e.message);}finally{setInviting(false);}
  };

  const changePassword=async()=>{
    if(newPwd.length<6){showToast('Password must be at least 6 characters');return;}
    if(newPwd!==confirmPwd){showToast('Passwords do not match');return;}
    setChangingPwd(true);
    try{
      // Re-fetch current row for up-to-date algo/salt. The password column itself is no
      // longer readable by anon after migration 008 — verification goes through the RPC.
      const rows=await db('team_members',`&id=eq.${user.id}`);
      const me=rows[0];
      if(me){
        // Compute the current password hash with the row's existing algo/salt.
        const curAlgo=me.password_algo||'sha256';
        const curHash=(curAlgo==='pbkdf2'&&me.password_salt)
          ? await hashPwdPbkdf2(curPwd,me.password_salt)
          : await hashPwdLegacy(curPwd);
        let verified=false;let rpcOk=false;
        try{
          const rpc=await supabase.rpc('check_password_hash',{p_email:me.email,p_hash:curHash});
          if(!rpc.error){verified=!!rpc.data;rpcOk=true;}
        }catch(_){}
        if(!rpcOk){
          // Pre-migration fallback: stored hash is still readable.
          if(me.password){verified=await verifyPwd(me,curPwd);}
          else{verified=false;}
        }
        if(!verified){showToast('Current password is incorrect');setChangingPwd(false);return;}
      }
      const{hash,salt,algo}=await hashPwd(newPwd);
      await rpcCall('tm_change_own_password',{p_hash:hash,p_salt:salt,p_algo:algo});
      const updated={...user,password_salt:salt,password_algo:algo};localStorage.setItem('ams_user',JSON.stringify(updated));
      showToast('Password changed ✓');setCurPwd('');setNewPwd('');setConfirmPwd('');
    }catch(e){console.warn('[changePassword] failed',e);showToast('Failed');}finally{setChangingPwd(false);}
  };

  const doResetPwd=async()=>{
    if(!resetPwd.trim()||resetPwd.length<6){showToast('Password must be at least 6 characters');return;}
    setResetting(true);
    try{
      const{hash,salt,algo}=await hashPwd(resetPwd);
      await rpcCall('tm_admin_reset_password',{p_member_id:resetMember.id,p_hash:hash,p_salt:salt,p_algo:algo});
      // Clear any local lockout for this email
      if(resetMember.email)loginLockClear(resetMember.email);
      showToast(`Password reset for ${resetMember.name} ✓ — share it with them`);
      setResetMember(null);setResetPwd('');
    }catch(e){showToast('Failed');}finally{setResetting(false);}
  };

  const updateMemberRole=async(member,role_level)=>{
    await rpcCall('tm_set_role',{p_member_id:member.id,p_role_level:role_level});
    setTeam(ts=>ts.map(t=>t.id===member.id?{...t,role_level}:t));showToast('Role updated');
  };
  const updateMemberCapacity=async(member,raw)=>{
    const v=raw===''||raw==null?null:Math.max(0,Math.min(99,parseInt(raw)||0));
    try{
      await rpcCall('tm_update_member',{p_member_id:member.id,p_data:{capacity:v}});
      setTeam(ts=>ts.map(t=>t.id===member.id?{...t,capacity:v}:t));
      showToast(v==null?'Capacity cleared':`Capacity → ${v} posts/wk`);
    }catch(e){showToast('Failed to save capacity');}
  };
  const startEditMember=(m)=>{setEditMember(m);setEditName(m.name||'');setEditEmail(m.email||'');setResetMember(null);};
  const cancelEditMember=()=>{setEditMember(null);setEditName('');setEditEmail('');};
  const saveEditMember=async()=>{
    if(!editName.trim()||!editEmail.trim()){showToast('Name and email are required');return;}
    const emailLc=editEmail.trim().toLowerCase();
    const clash=team.find(t=>t.id!==editMember.id&&(t.email||'').toLowerCase()===emailLc);
    if(clash){showToast(`Email already used by ${clash.name}`);return;}
    setEditSaving(true);
    try{
      const nm=editName.trim();
      const ini=nm.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      await rpcCall('tm_update_member',{p_member_id:editMember.id,p_data:{name:nm,email:emailLc,initials:ini}});
      setTeam(ts=>ts.map(t=>t.id===editMember.id?{...t,name:nm,email:emailLc,initials:ini}:t));
      showToast(`${nm} updated ✓`);
      cancelEditMember();
    }catch(e){showToast('Failed: '+e.message);}finally{setEditSaving(false);}
  };
  const removeMember=async(member)=>{
    if(!confirm(`Remove ${member.name} from workspace? They will lose access immediately.`))return;
    try{
      await rpcCall('tm_revoke_member',{p_member_id:member.id});
      setTeam(ts=>ts.filter(t=>t.id!==member.id));
      showToast(`${member.name} removed ✓`);
    }catch(e){showToast('Failed to remove');}
  };

  const isAdmin=user.role_level==='admin';
  const NAVS=isAdmin
    ?[['account','ti-user','My account'],['team','ti-users','Team members'],['onboarding','ti-clipboard-check','Onboarding'],['social','ti-brand-instagram','Connected accounts'],['agency','ti-building-bank','Agency & invoicing'],['appearance','ti-palette','Appearance'],['integrations','ti-plug','Integrations'],['trash','ti-trash','Trash'],['audit','ti-history','Activity log'],['backup','ti-database-export','Backup & health'],['danger','ti-alert-triangle','Danger zone']]
    :[['account','ti-user','My account'],['appearance','ti-palette','Appearance'],['integrations','ti-plug','Integrations'],['danger','ti-alert-triangle','Danger zone']];

  return h`<div class="scroll" style=${{padding:0}}>
    <div class="settings-layout" style=${{height:'calc(100vh - 56px)'}}>
      <div class="settings-sidebar">
        <div style=${{fontSize:11,fontWeight:600,color:'var(--t2)',padding:'4px 12px 12px',textTransform:'uppercase',letterSpacing:'.05em'}}>Settings</div>
        ${NAVS.map(([id,ic,lb])=>h`<div key=${id} class=${'settings-nav'+(sec===id?' on':'')} onClick=${()=>setSec(id)}>
          <i class=${'ti '+ic} style=${{fontSize:16}}></i>${lb}
        </div>`)}
      </div>
      <div class="settings-content">

        ${sec==='account'&&h`<div>
          <div style=${{fontSize:20,fontWeight:500,color:'var(--t1)',marginBottom:20}}>My account</div>
          <div class="settings-section">
            <div style=${{display:'flex',alignItems:'center',gap:16,marginBottom:20}}>
              <${Av} i=${user.initials||user.name.slice(0,2)} c=${user.color||'#22C55E'} s=${56}/>
              <div>
                <div style=${{fontSize:18,fontWeight:500,color:'var(--t1)'}}>${user.name}</div>
                <div style=${{fontSize:13,color:'var(--t2)',marginTop:3}}>${user.email}</div>
                <span class=${'role-badge '+(ROLE_BADGE[user.role_level]||'rb-editor')} style=${{marginTop:6,display:'inline-flex'}}>${ROLES[user.role_level]||user.role_level}</span>
              </div>
            </div>
            <div style=${{borderTop:'1px solid var(--bd)',paddingTop:16}}>
              <div class="fi-lbl">Your permissions</div>
              <div style=${{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
                ${user.role_level==='admin'&&h`<div style=${{fontSize:13,color:'var(--t2)'}}>✅ Full access — all clients, billing, settings, reports</div>`}
                ${user.role_level==='manager'&&h`<div style=${{fontSize:13,color:'var(--t2)'}}>✅ All clients, content, reports — billing is hidden</div>`}
                ${user.role_level==='accounts_head'&&h`<div style=${{fontSize:13,color:'var(--t2)'}}>✅ Finance — every invoice, payment, credit note, ageing and P&L</div><div style=${{fontSize:13,color:'var(--t2)'}}>✅ Exports — GSTR-1 CSV, TDS register, all-invoice PDF for filing</div><div style=${{fontSize:13,color:'var(--t2)'}}>👁️ Read-only — creating, editing and recording payments stays with an admin</div>`}
                ${isEditorRole(user.role_level)&&h`<div style=${{fontSize:13,color:'var(--t2)'}}>✅ My assigned tasks — post details, mark done</div><div style=${{fontSize:13,color:'var(--t2)'}}>✅ Calendar — full content calendar for your brands (past & upcoming), open any post</div><div style=${{fontSize:13,color:'var(--t2)'}}>✅ Brand guidelines (read-only) — colours, fonts, voice, brief</div>`}
              </div>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-title"><i class="ti ti-lock" style=${{fontSize:16}}></i>Change password</div>
            <div class="fi-group"><div class="fi-lbl">Current password</div><input class="fi" type="password" placeholder="Enter current password" value=${curPwd} onInput=${e=>setCurPwd(e.target.value)}/></div>
            <div class="fi-grid fi-group">
              <div><div class="fi-lbl">New password</div><input class="fi" type="password" placeholder="Min 6 characters" value=${newPwd} onInput=${e=>setNewPwd(e.target.value)}/></div>
              <div><div class="fi-lbl">Confirm new password</div><input class="fi" type="password" placeholder="Type again" value=${confirmPwd} onInput=${e=>setConfirmPwd(e.target.value)}/></div>
            </div>
            <button class="btn-pri" onClick=${changePassword} disabled=${changingPwd||!newPwd||!confirmPwd}>${changingPwd?h`<i class="ti ti-loader-2 spinner"></i>`:h`<i class="ti ti-lock"></i>`} Change password</button>
          </div>
          <div class="settings-section">
            <div class="settings-section-title"><i class="ti ti-logout" style=${{fontSize:16}}></i>Session</div>
            <div style=${{fontSize:14,color:'var(--t2)',marginBottom:12}}>Signed in as ${user.email}. Your session is stored in this browser.</div>
            <button class="btn-sec" onClick=${onSignOut}>Sign out</button>
          </div>
        </div>`}

        ${sec==='team'&&isAdmin&&h`<div>
          <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
            <div style=${{fontSize:20,fontWeight:500,color:'var(--t1)'}}>Team members</div>
            <span style=${{fontSize:13,color:'var(--t3)'}}>${team.length} members</span>
          </div>
          <div class="settings-section">
            <div class="settings-section-title"><i class="ti ti-user-plus" style=${{fontSize:16}}></i>Add team member</div>
            <div style=${{fontSize:13,color:'var(--t2)',marginBottom:14,lineHeight:1.5}}>Set their name, email and password here. Share the password with them — they type email + password on the login screen to get in. No link needed.</div>
            <div class="fi-grid fi-group">
              <div><div class="fi-lbl">Full name</div><input class="fi" type="text" placeholder="Aruj Kumar" value=${inviteName} onInput=${e=>setInviteName(e.target.value)}/></div>
              <div><div class="fi-lbl">Email address</div><input class="fi" placeholder="aruj@email.com" value=${inviteEmail} onInput=${e=>setInviteEmail(e.target.value)}/></div>
            </div>
            <div class="fi-grid fi-group">
              <div><div class="fi-lbl">Password</div><input class="fi" type="text" placeholder="e.g. ams2024" value=${invitePassword} onInput=${e=>setInvitePassword(e.target.value)}/></div>
              <div><div class="fi-lbl">Role</div><select class="fi fi-select" value=${inviteRole} onChange=${e=>setInviteRole(e.target.value)}>
                <option value="manager">Manager — all clients, no billing</option>
                <option value="accounts_head">Accounts head — finance, read-only</option>
                <option value="seo">SEO expert — SEO dashboard & tasks</option>
                <option value="designer">Designer — assigned tasks only</option>
                <option value="editor">Editor — assigned tasks only</option>
              </select></div>
            </div>
            <button class="btn-pri" onClick=${addMember} disabled=${inviting||!inviteName.trim()||!inviteEmail.trim()||!invitePassword.trim()}>${inviting?h`<i class="ti ti-loader-2 spinner"></i> Adding...`:h`<i class="ti ti-user-plus"></i>Add member`}</button>
          </div>
          ${resetMember&&h`<div class="settings-section" style=${{border:'1px solid var(--amber)',background:'var(--amber-bg)'}}>
            <div class="settings-section-title" style=${{color:'var(--amber)'}}><i class="ti ti-key" style=${{fontSize:16}}></i>Reset password — ${resetMember.name}</div>
            <div class="fi-grid fi-group">
              <div><div class="fi-lbl">New password</div><input class="fi" type="text" placeholder="e.g. ams2024" value=${resetPwd} onInput=${e=>setResetPwd(e.target.value)}/></div>
            </div>
            <div style=${{display:'flex',gap:8}}>
              <button class="btn-pri" onClick=${doResetPwd} disabled=${resetting}>${resetting?'Saving...':'Save & share with '+resetMember.name.split(' ')[0]}</button>
              <button class="btn-sec" onClick=${()=>{setResetMember(null);setResetPwd('');}}>Cancel</button>
            </div>
          </div>`}
          ${editMember&&h`<div class="settings-section" style=${{border:'1px solid var(--blue)'}}>
            <div class="settings-section-title" style=${{color:'var(--blue)'}}><i class="ti ti-edit" style=${{fontSize:16}}></i>Edit member — ${editMember.name}</div>
            <div class="fi-grid fi-group">
              <div><div class="fi-lbl">Full name</div><input class="fi" type="text" placeholder="Full name" value=${editName} onInput=${e=>setEditName(e.target.value)}/></div>
              <div><div class="fi-lbl">Email address</div><input class="fi" placeholder="name@email.com" value=${editEmail} onInput=${e=>setEditEmail(e.target.value)}/></div>
            </div>
            <div style=${{display:'flex',gap:8}}>
              <button class="btn-pri" onClick=${saveEditMember} disabled=${editSaving||!editName.trim()||!editEmail.trim()}>${editSaving?h`<i class="ti ti-loader-2 spinner"></i> Saving...`:h`<i class="ti ti-check"></i>Save changes`}</button>
              <button class="btn-sec" onClick=${cancelEditMember}>Cancel</button>
            </div>
          </div>`}
          <div class="settings-section">
            <div class="settings-section-title"><i class="ti ti-users" style=${{fontSize:16}}></i>Workspace members</div>
            ${loading?h`<div style=${{display:'flex',flexDirection:'column',gap:6}}>${[...Array(3)].map((_,i)=>h`<${Skel} key=${i} h=${52}/>`)} </div>`
            :h`<div>${sortTeam(team.filter(m=>m.role_level!=='client')).map(m=>h`<div key=${m.id} class="team-row">
              <${Av} i=${m.initials||m.name.slice(0,2)} c=${m.color||'#FF00EE'} s=${36}/>
              <div style=${{flex:1,minWidth:0}}>
                <div style=${{fontSize:14,fontWeight:500,color:'var(--t1)'}}>${m.name}</div>
                <div style=${{fontSize:12,color:'var(--t3)',display:'flex',alignItems:'center',gap:6}}>${m.email||h`<span style=${{fontStyle:'italic'}}>No email</span>`}${m.password?h`<span style=${{color:'var(--green)',fontSize:10}}>● Password set</span>`:h`<span style=${{color:'var(--amber)',fontSize:10}}>● No password</span>`}</div>
              </div>
              <div title="Posts per week this member can handle" style=${{display:'flex',alignItems:'center',gap:4,background:'var(--bg2)',border:'1px solid var(--bd)',borderRadius:6,padding:'2px 6px'}}>
                <i class="ti ti-gauge" style=${{fontSize:13,color:'var(--t3)'}}></i>
                <input type="number" min="0" max="99" placeholder="—" value=${m.capacity??''} onBlur=${e=>{if((e.target.value===''?null:parseInt(e.target.value))!==(m.capacity??null))updateMemberCapacity(m,e.target.value);}} onKeyDown=${e=>{if(e.key==='Enter')e.target.blur();}} style=${{width:38,border:'none',background:'transparent',fontSize:12,color:'var(--t1)',padding:'4px 0',textAlign:'center',outline:'none'}}/>
                <span style=${{fontSize:10,color:'var(--t3)',whiteSpace:'nowrap'}}>/wk</span>
              </div>
              <select class="fi fi-select" style=${{width:130,fontSize:12,padding:'4px 28px 4px 8px'}} value=${m.role_level||'editor'} onChange=${e=>updateMemberRole(m,e.target.value)}>
                <option value="admin">Admin</option><option value="manager">Manager</option><option value="accounts_head">Accounts head</option><option value="seo">SEO expert</option><option value="designer">Designer</option><option value="editor">Editor</option>
              </select>
              <button class="icon-btn" onClick=${()=>startEditMember(m)} title="Edit name & email" style=${{color:'var(--blue)'}}><i class="ti ti-edit" style=${{fontSize:13}}></i></button>
              <button class="icon-btn" onClick=${()=>{setResetMember(m);setResetPwd('');setEditMember(null);setSec('team');}} title="Reset password" style=${{color:'var(--amber)'}}><i class="ti ti-key" style=${{fontSize:13}}></i></button>
              ${m.role_level!=='admin'&&h`<button class="icon-btn" onClick=${()=>removeMember(m)} title="Remove access" style=${{color:'var(--red)'}}><i class="ti ti-user-minus" style=${{fontSize:13}}></i></button>`}
            </div>`)} </div>`}
          </div>
          <div class="settings-section">
            <div class="settings-section-title"><i class="ti ti-info-circle" style=${{fontSize:16}}></i>How login works</div>
            <div style=${{display:'flex',flexDirection:'column',gap:8,fontSize:13,color:'var(--t2)'}}>
              <div>✅ <strong style=${{color:'var(--t1)'}}>Staff</strong>: you set their password here → share it with them → they log in at <strong style=${{color:'var(--t1)'}}>mydigitalsevak.in</strong> (use the 🔑 icon to reset).</div>
              <div>✉️ <strong style=${{color:'var(--t1)'}}>Clients</strong>: the portal login is created automatically the moment you click <strong style=${{color:'var(--t1)'}}>Send onboarding</strong> on a client. The brand sets their own password on first sign-in — you never see it.</div>
            </div>
          </div>
        </div>`}

        ${sec==='appearance'&&h`<div>
          <div style=${{fontSize:20,fontWeight:500,color:'var(--t1)',marginBottom:20}}>Appearance</div>
          <div class="settings-section">
            <div class="settings-section-title"><i class="ti ti-palette" style=${{fontSize:16}}></i>Theme</div>
            <div class="toggle-wrap">
              <div>
                <div style=${{fontSize:14,fontWeight:500,color:'var(--t1)'}}>${theme==='dark'?'Dark mode':'Light mode'}</div>
                <div style=${{fontSize:13,color:'var(--t3)',marginTop:2}}>${theme==='dark'?'Easy on the eyes at night':'Clean and bright for daytime work'}</div>
              </div>
              <button class="toggle" style=${{background:theme==='dark'?'#1A1A1A':'#D0D0CC'}} onClick=${()=>setTheme(theme==='dark'?'light':'dark')}>
                <div class="toggle-knob" style=${{left:theme==='dark'?'23px':'3px'}}></div>
              </button>
            </div>
          </div>
        </div>`}

        ${sec==='integrations'&&h`<div>
          <${IntegrationsSection} user=${user} showToast=${showToast}/>
          <${SheetsApiKeySection} user=${user} showToast=${showToast}/>
        </div>`}

        ${sec==='social'&&isAdmin&&(ConnectedAccountsSection?h`<${ConnectedAccountsSection} clients=${clients} showToast=${showToast}/>`:h`<div style=${{fontSize:14,color:'var(--t3)'}}>Auto-publishing module not loaded.</div>`)}

        ${sec==='onboarding'&&isAdmin&&h`<${OnboardingTemplatesSection} showToast=${showToast}/>`}

        ${sec==='agency'&&isAdmin&&h`<${AgencySettingsSection} showToast=${showToast}/>`}

        ${sec==='trash'&&isAdmin&&h`<${TrashView} showToast=${showToast}/>`}
        ${sec==='audit'&&isAdmin&&h`<${AuditView}/>`}
        ${sec==='backup'&&isAdmin&&h`<${BackupHealthView} showToast=${showToast}/>`}

        ${sec==='danger'&&h`<div>
          <div style=${{fontSize:20,fontWeight:500,color:'var(--t1)',marginBottom:20}}>Danger zone</div>
          ${user.role_level==='admin'?h`<div class="settings-section">
            <div class="settings-section-title" style=${{color:'var(--red)'}}><i class="ti ti-alert-triangle" style=${{fontSize:16}}></i>Admin account</div>
            <div style=${{fontSize:14,color:'var(--t2)',marginBottom:16}}>As workspace admin, you cannot delete your account or leave. Transfer admin role first if needed.</div>
            <button class="danger-btn" onClick=${onSignOut}>Sign out</button>
          </div>`
          :h`<div>
            <div class="settings-section">
              <div class="settings-section-title" style=${{color:'var(--red)'}}><i class="ti ti-logout" style=${{fontSize:16}}></i>Sign out</div>
              <div style=${{fontSize:14,color:'var(--t2)',marginBottom:16}}>Signs you out of this browser. Ask your workspace admin if you need a password reset.</div>
              <button class="danger-btn" onClick=${onSignOut}>Sign out</button>
            </div>
          </div>`}
        </div>`}
      </div>
    </div>
    ${toast&&h`<${Toast} key=${toast.k} msg=${toast.msg}/>`}
  </div>`;
}

    return { SettingsPage };
  }
  window.AMS_SETTINGS = { buildSettings };
})();

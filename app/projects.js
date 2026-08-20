// projects.js — "Project mode" clients (website builds & other fixed-scope,
// fixed-duration engagements). Provides:
//   • ProjectTab        — the per-client build tracker inside ClientDetail
//                         (setup, payment gates, 15-day milestone timeline,
//                          handoff + maintenance upsell). Injected into
//                          clients.js via buildClients deps.
//   • ActiveProjectsCard — Home strip showing every live project + day-counter,
//                          so a short build never slips out of view.
// window.AMS_PROJECTS.buildProjects(deps) -> { ProjectTab, ActiveProjectsCard }.
(function(){
  function buildProjects(deps){
    const {React,h,useState,useEffect,useCallback,rpcCall,db} = deps;
    const BRAND='#ff00ee';

    // ── helpers ──────────────────────────────────────────────────────────
    const inr=(n)=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
    const fmtDate=(d)=>{if(!d)return'—';const x=new Date(d+'T00:00:00');return x.toLocaleDateString('en-IN',{day:'numeric',month:'short'});};
    const daysBetween=(a,b)=>Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);
    const todayStr=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};

    const PSTATUS={
      lead:            {lbl:'Lead',             col:'#787774', bg:'rgba(120,119,116,.12)'},
      awaiting_advance:{lbl:'Awaiting advance', col:'#B45309', bg:'rgba(245,158,11,.14)'},
      in_progress:     {lbl:'In progress',      col:'#1D4ED8', bg:'rgba(37,99,235,.12)'},
      in_review:       {lbl:'In review',        col:'#7C3AED', bg:'rgba(124,58,237,.12)'},
      awaiting_balance:{lbl:'Awaiting balance', col:'#B45309', bg:'rgba(245,158,11,.14)'},
      launched:        {lbl:'Launched',         col:'#059669', bg:'rgba(16,185,129,.14)'},
      completed:       {lbl:'Completed',        col:'#059669', bg:'rgba(16,185,129,.14)'},
      on_hold:         {lbl:'On hold',          col:'#DC2626', bg:'rgba(220,38,38,.12)'}
    };
    const MSTATUS={
      pending:    {lbl:'Pending',     col:'#9CA3AF', dot:'#D1D5DB'},
      in_progress:{lbl:'In progress', col:'#1D4ED8', dot:'#3B82F6'},
      done:       {lbl:'Done',        col:'#059669', dot:'#10B981'},
      blocked:    {lbl:'Blocked',     col:'#DC2626', dot:'#EF4444'}
    };
    const NEXT_MSTATUS={pending:'in_progress',in_progress:'done',done:'pending',blocked:'in_progress'};

    // Day-counter: "Day 4 of 15" / "2 days left" / "Overdue 3d"
    function projectCountdown(c){
      const start=c.project_start_date, end=c.project_deadline;
      if(!end) return null;
      const today=todayStr();
      const left=daysBetween(today,end);
      const total=start?Math.max(1,daysBetween(start,end)):(c.project_duration_days||15);
      const elapsed=start?Math.max(0,daysBetween(start,today)):null;
      if(left<0) return {txt:`Overdue ${Math.abs(left)}d`, col:'#DC2626', urgent:true};
      if(left===0) return {txt:'Due today', col:'#B45309', urgent:true};
      const dayTxt=elapsed!=null?`Day ${Math.min(elapsed+1,total)} of ${total}`:`${left}d left`;
      return {txt:dayTxt, sub:`${left}d left`, col:left<=3?'#B45309':'var(--t2)', urgent:left<=3};
    }

    // ── StatusPill ─────────────────────────────────────────────────────────
    function PPill({status}){
      const s=PSTATUS[status]||PSTATUS.lead;
      return h`<span style=${{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:20,fontSize:11.5,fontWeight:600,color:s.col,background:s.bg,letterSpacing:'.01em'}}>${s.lbl}</span>`;
    }

    // ── ProjectTab ─────────────────────────────────────────────────────────
    function ProjectTab({c,onUpdate,showToast,currentUser}){
      const[client,setClient]=useState(c);
      useEffect(()=>{setClient(c);},[c.id]);
      const[ms,setMs]=useState([]);
      const[loadingMs,setLoadingMs]=useState(true);
      const[invs,setInvs]=useState([]);
      const isAdmin=currentUser?.role_level==='admin';

      const reloadMs=useCallback(async()=>{
        try{const rows=await db('project_milestones',`&client_id=eq.${c.id}&order=seq.asc`);setMs(rows||[]);}
        catch(e){setMs([]);}finally{setLoadingMs(false);}
      },[c.id]);
      const reloadInvs=useCallback(async()=>{
        try{const rows=await db('invoices',`&client_id=eq.${c.id}&project_phase=not.is.null&deleted_at=is.null&select=id,invoice_number,amount,amount_paid,tds_amount,status,project_phase`);setInvs(rows||[]);}
        catch(e){setInvs([]);}
      },[c.id]);
      useEffect(()=>{reloadMs();reloadInvs();},[reloadMs,reloadInvs]);

      const save=async(patch)=>{
        try{
          const next={...client,...patch};setClient(next);
          await rpcCall('client_update',{p_client_id:c.id,p_patch:patch});
          if(onUpdate)onUpdate(next);showToast&&showToast('Saved');
        }catch(e){showToast&&showToast('Save failed');setClient(client);}
      };

      // Payment plan
      const budget=Number(client.project_budget)||0;
      const advPct=Number(client.project_advance_pct)||50;
      const advAmt=Math.round(budget*advPct/100);
      const balAmt=budget-advAmt;
      const phaseInv=(p)=>invs.find(i=>i.project_phase===p);
      const phasePaid=(p)=>{const i=phaseInv(p);if(!i)return false;return (Number(i.amount_paid)||0)>=(Number(i.amount)-Number(i.tds_amount||0)-1);};
      const advPaid=phasePaid('advance'), balPaid=phasePaid('balance');

      const cd=projectCountdown(client);
      const status=client.project_status||'lead';

      // ── milestone actions ──
      const cycleStatus=async(m)=>{
        const ns=NEXT_MSTATUS[m.status]||'in_progress';
        setMs(list=>list.map(x=>x.id===m.id?{...x,status:ns}:x));
        try{await rpcCall('project_milestone_upsert',{p_data:{id:m.id,status:ns}});}
        catch(e){showToast&&showToast('Failed');reloadMs();}
      };
      const editField=async(m,key,val)=>{
        setMs(list=>list.map(x=>x.id===m.id?{...x,[key]:val}:x));
        try{await rpcCall('project_milestone_upsert',{p_data:{id:m.id,[key]:val}});}
        catch(e){showToast&&showToast('Failed');reloadMs();}
      };
      const addMs=async()=>{
        try{await rpcCall('project_milestone_upsert',{p_data:{client_id:c.id,name:'New milestone',seq:(ms.length?Math.max(...ms.map(x=>x.seq||0))+1:1)}});reloadMs();}
        catch(e){showToast&&showToast('Failed');}
      };
      const delMs=async(m)=>{
        if(!confirm(`Delete "${m.name}"?`))return;
        setMs(list=>list.filter(x=>x.id!==m.id));
        try{await rpcCall('project_milestone_delete',{p_id:m.id});}catch(e){reloadMs();}
      };
      const seedMs=async()=>{
        try{const rows=await rpcCall('project_milestones_seed',{p_client_id:c.id});setMs(rows||[]);showToast&&showToast('Milestones added');}
        catch(e){showToast&&showToast('Failed to seed');}
      };

      const card={background:'var(--surface)',border:'1px solid var(--bd)',borderRadius:14,padding:'18px 20px',marginBottom:16};
      const lbl={fontSize:11,fontWeight:600,letterSpacing:'.04em',textTransform:'uppercase',color:'var(--t3)',marginBottom:8};
      const inputS={width:'100%',padding:'8px 10px',border:'1px solid var(--bd)',borderRadius:8,background:'var(--bg)',color:'var(--t1)',fontSize:13};

      const doneCount=ms.filter(m=>m.status==='done').length;
      const pct=ms.length?Math.round(doneCount/ms.length*100):0;

      return h`<div class="client-edit">
        <!-- Header: status + countdown + progress -->
        <div style=${{...card,display:'flex',alignItems:'center',gap:18,flexWrap:'wrap'}}>
          <div style=${{flex:1,minWidth:200}}>
            <div style=${{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
              <${PPill} status=${status}/>
              ${cd&&h`<span style=${{fontSize:13,fontWeight:600,color:cd.col}}>${cd.txt}</span>`}
            </div>
            <div style=${{height:8,background:'var(--bg)',borderRadius:8,overflow:'hidden'}}>
              <div style=${{height:'100%',width:pct+'%',background:BRAND,borderRadius:8,transition:'width .3s'}}></div>
            </div>
            <div style=${{fontSize:12,color:'var(--t3)',marginTop:6}}>${doneCount}/${ms.length} milestones done · ${pct}%</div>
          </div>
          <div style=${{display:'flex',gap:24}}>
            <div><div style=${lbl}>Start</div><div style=${{fontSize:14,fontWeight:600}}>${fmtDate(client.project_start_date)}</div></div>
            <div><div style=${lbl}>Deadline</div><div style=${{fontSize:14,fontWeight:600,color:cd&&cd.urgent?'#DC2626':'var(--t1)'}}>${fmtDate(client.project_deadline)}</div></div>
          </div>
        </div>

        <!-- Setup -->
        <div style=${card}>
          <div style=${lbl}>Project setup</div>
          <div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12}}>
            <div><div style=${{fontSize:12,color:'var(--t2)',marginBottom:4}}>Start date</div>
              <input type="date" style=${inputS} value=${client.project_start_date||''} onChange=${e=>save({project_start_date:e.target.value||null})}/></div>
            <div><div style=${{fontSize:12,color:'var(--t2)',marginBottom:4}}>Deadline</div>
              <input type="date" style=${inputS} value=${client.project_deadline||''} onChange=${e=>save({project_deadline:e.target.value||null})}/></div>
            <div><div style=${{fontSize:12,color:'var(--t2)',marginBottom:4}}>Budget (₹)</div>
              <input type="number" min="0" style=${inputS} value=${client.project_budget||''} placeholder="0" onChange=${e=>save({project_budget:e.target.value?Number(e.target.value):null})}/></div>
            <div><div style=${{fontSize:12,color:'var(--t2)',marginBottom:4}}>Advance %</div>
              <input type="number" min="0" max="100" style=${inputS} value=${client.project_advance_pct??50} onChange=${e=>save({project_advance_pct:e.target.value?Number(e.target.value):50})}/></div>
            <div><div style=${{fontSize:12,color:'var(--t2)',marginBottom:4}}>Status</div>
              <select style=${inputS} value=${status} onChange=${e=>save({project_status:e.target.value})}>
                ${Object.keys(PSTATUS).map(k=>h`<option key=${k} value=${k}>${PSTATUS[k].lbl}</option>`)}
              </select></div>
          </div>
          <div style=${{fontSize:12.5,color:'var(--t2)',marginTop:12,lineHeight:1.5}}>
            <i class="ti ti-send" style=${{fontSize:13,color:BRAND,marginRight:5}}></i>
            Send the client their intake (logo, content, domain &amp; hosting access) with the <strong>Send onboarding</strong> button at the top of this page — pick the <strong>${'Website Project Intake'}</strong> template. Passwords they enter are stored encrypted in the credentials vault (Overview tab).
          </div>
        </div>

        <!-- Payment gates -->
        <div style=${card}>
          <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div style=${lbl}>Payment</div>
            <div style=${{fontSize:12,color:'var(--t3)'}}>Total ${inr(budget)}</div>
          </div>
          ${budget<=0?h`<div style=${{fontSize:13,color:'var(--t3)'}}>Set a budget above to plan the advance &amp; balance milestones.</div>`:
          h`<div style=${{display:'flex',flexDirection:'column',gap:10}}>
            ${[{p:'advance',label:`Advance (${advPct}%)`,amt:advAmt,paid:advPaid,gate:'Unlocks the build'},
               {p:'balance',label:`Balance (${100-advPct}%)`,amt:balAmt,paid:balPaid,gate:'Unlocks handoff'}].map(row=>{
              const inv=phaseInv(row.p);
              return h`<div key=${row.p} style=${{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'var(--bg)',borderRadius:10,border:`1px solid ${row.paid?'rgba(16,185,129,.35)':'var(--bd)'}`}}>
                <i class=${'ti '+(row.paid?'ti-circle-check-filled':'ti-circle')} style=${{fontSize:20,color:row.paid?'#10B981':'var(--t3)'}}></i>
                <div style=${{flex:1}}>
                  <div style=${{fontSize:13.5,fontWeight:600}}>${row.label} · ${inr(row.amt)}</div>
                  <div style=${{fontSize:11.5,color:'var(--t3)'}}>${row.gate}${inv?` · invoice #${inv.invoice_number} (${inv.status})`:''}</div>
                </div>
                ${row.paid?h`<span style=${{fontSize:11.5,fontWeight:700,color:'#059669'}}>PAID</span>`
                 :inv?h`<span style=${{fontSize:11.5,fontWeight:600,color:'#B45309'}}>Awaiting</span>`
                 :h`<span style=${{fontSize:11.5,color:'var(--t3)'}}>No invoice yet</span>`}
              </div>`;
            })}
            <div style=${{fontSize:12,color:'var(--t2)',lineHeight:1.5,marginTop:2}}>
              <i class="ti ti-info-circle" style=${{fontSize:13,marginRight:5,color:BRAND}}></i>
              Create these in the <strong>Billing</strong> tab and tag each invoice's <strong>Milestone</strong> as Advance or Balance. The moment Razorpay (or a manual payment) settles the advance, the project auto-kicks-off; settling the balance unlocks handoff.
            </div>
          </div>`}
        </div>

        <!-- Milestones -->
        <div style=${card}>
          <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div style=${lbl}>Build timeline</div>
            <div style=${{display:'flex',gap:8}}>
              ${ms.length===0&&h`<button onClick=${seedMs} style=${{fontSize:12,fontWeight:600,color:BRAND,background:'rgba(255,0,238,.08)',border:'1px solid rgba(255,0,238,.3)',borderRadius:8,padding:'5px 11px',cursor:'pointer'}}><i class="ti ti-wand" style=${{fontSize:12,marginRight:4}}></i>Add default stages</button>`}
              <button onClick=${addMs} style=${{fontSize:12,fontWeight:600,color:'var(--t1)',background:'transparent',border:'1px solid var(--bd)',borderRadius:8,padding:'5px 11px',cursor:'pointer'}}><i class="ti ti-plus" style=${{fontSize:12,marginRight:4}}></i>Add</button>
            </div>
          </div>
          ${loadingMs?h`<div style=${{fontSize:13,color:'var(--t3)'}}>Loading…</div>`
          :ms.length===0?h`<div style=${{fontSize:13,color:'var(--t3)',padding:'8px 0'}}>No milestones yet — add the default 5-stage timeline to get going.</div>`
          :h`<div style=${{display:'flex',flexDirection:'column',gap:2}}>
            ${ms.map((m,i)=>{
              const st=MSTATUS[m.status]||MSTATUS.pending;
              const overdue=m.due_date&&m.status!=='done'&&daysBetween(todayStr(),m.due_date)<0;
              return h`<div key=${m.id} style=${{display:'flex',alignItems:'center',gap:12,padding:'11px 4px',borderBottom:i<ms.length-1?'1px solid var(--bd)':'none'}}>
                <button onClick=${()=>cycleStatus(m)} title=${'Click to cycle status — '+st.lbl} style=${{width:22,height:22,borderRadius:'50%',border:'2px solid '+st.dot,background:m.status==='done'?st.dot:'transparent',cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>
                  ${m.status==='done'&&h`<i class="ti ti-check" style=${{fontSize:12,color:'#fff'}}></i>`}
                </button>
                <input value=${m.name} onChange=${e=>editField(m,'name',e.target.value)} style=${{flex:1,minWidth:120,border:'none',background:'transparent',fontSize:13.5,fontWeight:600,color:'var(--t1)',padding:'2px 0',textDecoration:m.status==='done'?'line-through':'none',opacity:m.status==='done'?.6:1}}/>
                <input value=${m.owner||''} placeholder="Owner" onChange=${e=>editField(m,'owner',e.target.value)} style=${{width:90,border:'none',background:'transparent',fontSize:12.5,color:'var(--t2)',padding:'2px 0'}}/>
                <input type="date" value=${m.due_date||''} onChange=${e=>editField(m,'due_date',e.target.value||null)} style=${{width:130,border:'none',background:'transparent',fontSize:12.5,color:overdue?'#DC2626':'var(--t2)',fontWeight:overdue?600:400}}/>
                <span style=${{fontSize:11,fontWeight:600,color:st.col,minWidth:74,textAlign:'right'}}>${st.lbl}</span>
                <button onClick=${()=>delMs(m)} title="Delete" style=${{background:'transparent',border:'none',color:'var(--t3)',cursor:'pointer',padding:4}}><i class="ti ti-x" style=${{fontSize:13}}></i></button>
              </div>`;
            })}
          </div>`}
        </div>

        <!-- Handoff -->
        ${['launched','completed','awaiting_balance'].includes(status)&&h`<div style=${{...card,border:'1px solid rgba(16,185,129,.35)',background:'rgba(16,185,129,.05)'}}>
          <div style=${{...lbl,color:'#059669'}}>Handoff</div>
          <div style=${{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
            <div style=${{flex:1,minWidth:200}}>
              <div style=${{fontSize:12,color:'var(--t2)',marginBottom:4}}>Live website URL</div>
              <input type="url" placeholder="https://…" style=${inputS} value=${client.project_live_url||''} onChange=${e=>save({project_live_url:e.target.value||null})}/>
            </div>
            ${status!=='completed'&&h`<button onClick=${()=>save({project_status:'completed'})} style=${{fontSize:13,fontWeight:600,color:'#fff',background:'#059669',border:'none',borderRadius:9,padding:'9px 16px',cursor:'pointer'}}>Mark completed</button>`}
          </div>
          <div style=${{fontSize:12.5,color:'var(--t2)',marginTop:12,lineHeight:1.5}}>
            <i class="ti ti-arrow-up-right" style=${{fontSize:13,color:'#059669',marginRight:5}}></i>
            <strong>Upsell:</strong> offer a monthly maintenance + social retainer now — create a recurring invoice in Billing, or convert this client's Type to <strong>Monthly retainer</strong> in the Overview tab.
          </div>
        </div>`}
      </div>`;
    }

    // ── ActiveProjectsCard (Home strip) ────────────────────────────────────
    function ActiveProjectsCard({clients,onCard}){
      const list=Object.values(clients||{}).filter(c=>c&&c.retainer_type==='project'&&!['completed'].includes(c.project_status||'lead'));
      if(!list.length) return null;
      // sort: most urgent (soonest / overdue deadline) first
      list.sort((a,b)=>{
        const ad=a.project_deadline||'9999', bd=b.project_deadline||'9999';
        return ad<bd?-1:ad>bd?1:0;
      });
      return h`<div class="home-sec" style=${{marginTop:6,marginBottom:6}}>
        <div class="home-sec-title" style=${{fontSize:16,marginBottom:4}}><i class="ti ti-rocket" style=${{color:BRAND}}></i>Active Projects<span class="count">· ${list.length}</span></div>
        <div style=${{fontSize:12,color:'var(--t3)',marginBottom:12}}>Fixed-deadline builds. Click to open the timeline.</div>
        <div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:10}}>
          ${list.map(c=>{
            const cd=projectCountdown(c);const s=PSTATUS[c.project_status||'lead']||PSTATUS.lead;
            const col=c.brand_color_primary||c.color||BRAND;
            return h`<div key=${c.id} onClick=${()=>onCard&&onCard(c)} style=${{background:'var(--surface)',border:'1px solid var(--bd)',borderLeft:`3px solid ${col}`,borderRadius:12,padding:'13px 15px',cursor:'pointer'}}>
              <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:7}}>
                <div style=${{fontSize:14,fontWeight:600,color:'var(--t1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${c.name}</div>
                ${cd&&h`<span style=${{fontSize:11.5,fontWeight:600,color:cd.col,flexShrink:0}}>${cd.urgent?cd.txt:(cd.sub||cd.txt)}</span>`}
              </div>
              <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                <${PPill} status=${c.project_status||'lead'}/>
                ${c.project_deadline&&h`<span style=${{fontSize:11.5,color:'var(--t3)'}}>by ${fmtDate(c.project_deadline)}</span>`}
              </div>
            </div>`;
          })}
        </div>
      </div>`;
    }

    return { ProjectTab, ActiveProjectsCard };
  }
  window.AMS_PROJECTS = { buildProjects };
})();

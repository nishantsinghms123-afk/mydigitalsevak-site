// billing.js — invoicing/billing feature: per-client billing (BillingTab/invoices/statements/editor/
// viewer/payments/recurring) + billing dashboard (BillingApp/aging/income/expenses/tax/CSV import),
// extracted from index.html (Phase 3.1 split, done LAST due to live Razorpay payments). The shared
// invoice helpers (InvoiceTemplate/fmtINR/fmtMonthYear/etc., also used by client_portal.js via the
// bridge) stay in index.html and are injected. window.AMS_BILLING.buildBilling(deps) -> { BillingTab, BillingApp }.
(function(){
  function buildBilling(deps){
    const {React,h,createRoot,useState,useEffect,useRef,useCallback,useMemo,Av,EDate,ESelect,EText,EXPENSE_CATEGORIES,InvoiceTemplate,MONTHS,STATUS_STYLE,_loadFail,buildAgencySnapshot,buildClientSnapshot,calcInvoiceTotals,fmt,fmtDateLong,fmtINR,fmtMonthYear,insertNotif,logActivity,numToIndianWords,ordinalDayLocal,rpcCall,sendInvoiceEmail,t,todayISO} = deps;

    // ── BillingTab ──
function BillingTab({c,onUpdate,showToast,isAdmin}){
  if(!isAdmin)return h`<div class="empty"><i class="ti ti-lock"></i><div class="empty-t">Billing is restricted</div><div class="empty-s">Only Nishant can view billing information</div></div>`;
  const save=async(key,value)=>{const clean=value===''?null:value;try{await rpcCall('client_update',{p_client_id:c.id,p_patch:{[key]:clean}});onUpdate({...c,[key]:clean});showToast('Saved');}catch(e){showToast('Save failed');}};
  const contractEnd=c.contract_end?new Date(c.contract_end):null;const today=new Date();const daysLeft=contractEnd?Math.ceil((contractEnd-today)/(1000*60*60*24)):null;
  return h`<div>
    ${daysLeft!==null&&daysLeft<=30&&daysLeft>0&&h`<div class="contract-warn" style=${{background:'var(--amber-bg)',border:'1px solid #FCD34D',color:'var(--amber)'}}><i class="ti ti-alert-triangle" style=${{fontSize:16}}></i>Contract ends in ${daysLeft} days — ${fmt(c.contract_end)}</div>`}
    ${daysLeft!==null&&daysLeft<=0&&h`<div class="contract-warn" style=${{background:'var(--red-bg)',border:'1px solid #FCA5A5',color:'var(--red)'}}><i class="ti ti-alert-circle" style=${{fontSize:16}}></i>Contract ended ${fmt(c.contract_end)} — renewal needed</div>`}
    <div class="fi-group"><div class="fi-lbl">Payment status</div>
      <${ESelect} value=${c.payment_status||'active'}
        options=${[{value:'active',label:'Active — on track'},{value:'pending',label:'Pending — awaiting payment'},{value:'overdue',label:'Overdue — payment missed'},{value:'paused',label:'Paused — on hold'},{value:'cancelled',label:'Cancelled'}]}
        onSave=${v=>save('payment_status',v)}
        colored=${{active:{bg:'#DCFCE7',col:'#15803D'},pending:{bg:'#FEF3C7',col:'#B45309'},overdue:{bg:'#FEE2E2',col:'#DC2626'},paused:{bg:'#F3F4F6',col:'#6B7280'},cancelled:{bg:'#FEE2E2',col:'#DC2626'}}}/>
    </div>
    <div class="fi-grid fi-group"><div><div class="fi-lbl">Contract start</div><${EDate} value=${c.contract_start} onSave=${v=>save('contract_start',v)}/></div><div><div class="fi-lbl">Contract end</div><${EDate} value=${c.contract_end} onSave=${v=>save('contract_end',v)}/></div></div>
    <div class="fi-grid fi-group">
      <div><div class="fi-lbl">Payment terms</div><${ESelect} value=${c.payment_terms||'monthly'} options=${[{value:'monthly',label:'Monthly'},{value:'quarterly',label:'Quarterly'},{value:'annual',label:'Annual'},{value:'project',label:'Project-based'},{value:'advance',label:'Full advance'}]} onSave=${v=>save('payment_terms',v)}/></div>
      <div><div class="fi-lbl">Invoice day</div><${ESelect} value=${c.invoice_day?.toString()||'1'} options=${[{value:'1',label:'1st'},{value:'5',label:'5th'},{value:'10',label:'10th'},{value:'15',label:'15th'},{value:'25',label:'25th'}]} onSave=${v=>save('invoice_day',parseInt(v))}/></div>
    </div>
    <div class="fi-group"><div class="fi-lbl">Billing notes</div><${EText} value=${c.billing_notes} onSave=${v=>save('billing_notes',v)} placeholder="Invoice email, GST, payment terms, follow-up notes..." multiline/></div>

    <div style=${{marginTop:32,paddingTop:24,borderTop:'1px solid var(--bd)'}}>
      <div style=${{fontSize:14,fontWeight:600,color:'var(--t1)',marginBottom:4}}>Tax & billing identity</div>
      <div style=${{fontSize:11.5,color:'var(--t3)',marginBottom:14}}>Shows on every invoice's "Bill To" block. Drives GST split (intra-state CGST+SGST vs inter-state IGST).</div>
      <div class="fi-grid fi-group">
        <div><div class="fi-lbl">GSTIN (leave blank for B2C / unregistered)</div><${EText} value=${c.gstin} onSave=${v=>save('gstin',v?.toUpperCase()||null)} placeholder="09AAFCI6289M1ZR"/></div>
        <div><div class="fi-lbl">PAN</div><${EText} value=${c.pan} onSave=${v=>save('pan',v?.toUpperCase()||null)} placeholder="AAFCI6289M"/></div>
      </div>
      <div class="fi-grid fi-group">
        <div><div class="fi-lbl">State</div><${EText} value=${c.state} onSave=${v=>save('state',v)} placeholder="Uttar Pradesh"/></div>
        <div><div class="fi-lbl">Place of supply</div><${EText} value=${c.place_of_supply} onSave=${v=>save('place_of_supply',v)} placeholder="Uttar Pradesh / Other Countries"/></div>
      </div>
      <div class="fi-group"><div class="fi-lbl">Bill-to address</div><${EText} value=${c.bill_address} onSave=${v=>save('bill_address',v)} placeholder="Full registered address as it should print on the invoice" multiline/></div>
    </div>

    <${RecurringTemplate} client=${c} showToast=${showToast}/>
    <${ClientInvoices} client=${c} showToast=${showToast}/>
  </div>`;
}

    // ── RecurringTemplate ──
function RecurringTemplate({client,showToast}){
  const[tpl,setTpl]=useState(null);
  const[loading,setLoading]=useState(true);
  const[expanded,setExpanded]=useState(false);
  const[saving,setSaving]=useState(false);
  const[form,setForm]=useState(null);
  const load=()=>{
    setLoading(true);
    rpcCall('recurring_list',{p_client_id:client.id})
      .then(rows=>{const r=(rows||[])[0]||null;setTpl(r);setForm(r?{...r,line_items:Array.isArray(r.line_items)?r.line_items:[]}:null);})
      .catch(_loadFail('recurring',()=>setTpl(null)))
      .finally(()=>setLoading(false));
  };
  useEffect(load,[client.id]);
  const startNew=()=>{
    setForm({
      client_id:client.id,
      is_active:true,
      invoice_day:Number(client.invoice_day)||1,
      due_offset_days:7,
      gst_rate:18,
      hsn_sac:'998314',
      line_items:[{description:`Monthly retainer · ${client.name}`,hsn_sac:'998314',qty:1,rate:''}],
      terms:'Payment due within 7 days of invoice date.',
      starts_on:todayISO(),
      ends_on:null,
    });
    setExpanded(true);
  };
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const updateItem=(i,k,v)=>setForm(f=>({...f,line_items:f.line_items.map((it,j)=>j===i?{...it,[k]:v}:it)}));
  const addItem=()=>setForm(f=>({...f,line_items:[...f.line_items,{description:'',hsn_sac:'998314',qty:1,rate:''}]}));
  const removeItem=(i)=>setForm(f=>({...f,line_items:f.line_items.filter((_,j)=>j!==i)}));
  const save=async()=>{
    if(!form.line_items.length||!form.line_items.every(it=>it.description?.trim()&&Number(it.qty)>0&&Number(it.rate)>=0)){alert('Add at least one valid line item');return;}
    setSaving(true);
    try{
      const payload={
        client_id:client.id,
        is_active:!!form.is_active,
        invoice_day:Number(form.invoice_day)||1,
        due_offset_days:Number(form.due_offset_days)||7,
        gst_rate:Number(form.gst_rate)||0,
        hsn_sac:form.hsn_sac||'998314',
        line_items:form.line_items.map(it=>({description:it.description.trim(),hsn_sac:it.hsn_sac||'998314',qty:Number(it.qty)||0,rate:Number(it.rate)||0})),
        terms:form.terms||null,
        starts_on:form.starts_on||todayISO(),
        ends_on:form.ends_on||null,
      };
      const saved=await rpcCall('recurring_upsert',{p_data:tpl?{id:tpl.id,...payload}:payload});
      logActivity({action:tpl?'update':'insert',table_name:'recurring_invoice_templates',record_id:String(saved?.id||tpl?.id||''),record_label:'Recurring · '+client.name,changes:null});
      load();showToast('Recurring schedule saved');setExpanded(false);
    }catch(e){console.error('[recurring] save failed',e);showToast('Save failed: '+(e?.message||e));}
    finally{setSaving(false);}
  };
  const remove=async()=>{
    if(!tpl||!confirm('Delete the recurring schedule for '+client.name+'? No invoices created so far will be affected.'))return;
    try{
      await rpcCall('recurring_delete',{p_id:tpl.id});
      logActivity({action:'purge',table_name:'recurring_invoice_templates',record_id:String(tpl.id),record_label:'Recurring · '+client.name,changes:null});
      setTpl(null);setForm(null);setExpanded(false);showToast('Recurring schedule removed');
    }catch(e){showToast('Delete failed');}
  };
  const previewTotal=useMemo(()=>{if(!form?.line_items)return 0;const sub=form.line_items.reduce((s,it)=>s+(Number(it.qty)||0)*(Number(it.rate)||0),0);const tax=sub*((Number(form.gst_rate)||0)/100);return sub+tax;},[form?.line_items,form?.gst_rate]);
  // First-run date matches the engine (migration 074): the first invoice goes
  // out on the NEXT occurrence of invoice_day AFTER the schedule is saved
  // (respecting starts_on) — never retroactively for the current period.
  const firstRun=useMemo(()=>{
    const d=Math.min(28,Math.max(1,Number(form?.invoice_day)||1));
    const today=new Date();today.setHours(0,0,0,0);
    let base=today;
    if(form?.starts_on){const s=new Date(form.starts_on+'T00:00:00');if(!isNaN(s)&&s>base)base=s;}
    const next=base.getDate()<d
      ?new Date(base.getFullYear(),base.getMonth(),d)
      :new Date(base.getFullYear(),base.getMonth()+1,d);
    return`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
  },[form?.invoice_day,form?.starts_on]);

  if(loading)return null;
  return h`<div style=${{marginTop:32,paddingTop:24,borderTop:'1px solid var(--bd)'}}>
    <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,cursor:'pointer'}} onClick=${()=>setExpanded(e=>!e)}>
      <div>
        <div style=${{fontSize:14,fontWeight:600,color:'var(--t1)',display:'flex',alignItems:'center',gap:8}}>
          <i class="ti ti-refresh" style=${{fontSize:16,color:tpl?.is_active?'var(--green)':'var(--t3)'}}></i>
          Recurring billing
          ${tpl?.is_active&&h`<span style=${{padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600,background:'var(--green-bg)',color:'var(--green)',letterSpacing:'.04em',textTransform:'uppercase'}}>Active</span>`}
          ${tpl&&!tpl.is_active&&h`<span style=${{padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:600,background:'#F3F4F6',color:'#6B7280',letterSpacing:'.04em',textTransform:'uppercase'}}>Paused</span>`}
        </div>
        <div style=${{fontSize:11.5,color:'var(--t3)',marginTop:2}}>
          ${tpl
            ?`Auto-issues on the ${ordinalDayLocal(tpl.invoice_day)} of every month · last issued ${tpl.last_generated_on?fmt(tpl.last_generated_on):'never'}`
            :'Set this up once and AMS will create the same invoice every month automatically.'}
        </div>
      </div>
      <i class=${'ti '+(expanded?'ti-chevron-up':'ti-chevron-down')} style=${{fontSize:18,color:'var(--t3)'}}></i>
    </div>

    ${!form&&!expanded&&h``}
    ${!form&&expanded&&!tpl&&h`<div style=${{padding:'10px 0',display:'flex',gap:10}}>
      <button class="btn-pri" style=${{padding:'8px 14px',fontSize:12}} onClick=${startNew}><i class="ti ti-plus"></i>Set up recurring billing</button>
    </div>`}

    ${form&&expanded&&h`<div style=${{padding:'12px 0',borderTop:'1px solid var(--bd)',marginTop:6}}>
      <div class="fi-grid fi-group" style=${{gridTemplateColumns:'auto 1fr 1fr 1fr',alignItems:'end'}}>
        <label style=${{display:'flex',alignItems:'center',gap:6,padding:'8px 12px',background:form.is_active?'rgba(15,128,61,.08)':'var(--bg2)',borderRadius:6,fontSize:12,cursor:'pointer'}}>
          <input type="checkbox" checked=${form.is_active} onChange=${e=>set('is_active',e.target.checked)}/>
          Active
        </label>
        <div><div class="fi-lbl">Invoice day</div><input class="fi" type="number" min="1" max="28" value=${form.invoice_day} onInput=${e=>set('invoice_day',e.target.value)}/></div>
        <div><div class="fi-lbl">Due offset (days)</div><input class="fi" type="number" min="0" max="60" value=${form.due_offset_days} onInput=${e=>set('due_offset_days',e.target.value)}/></div>
        <div><div class="fi-lbl">GST rate (%)</div><input class="fi" type="number" min="0" max="28" step="0.5" value=${form.gst_rate} onInput=${e=>set('gst_rate',e.target.value)}/></div>
      </div>

      <div class="fi-lbl" style=${{marginTop:12}}>Line items (what gets billed every month)</div>
      <table class="inv-line-tbl">
        <thead><tr>
          <th style=${{width:'48%'}}>Description</th>
          <th style=${{width:90}}>HSN/SAC</th>
          <th class="num" style=${{width:60}}>Qty</th>
          <th class="num" style=${{width:110}}>Rate (₹)</th>
          <th class="num" style=${{width:110}}>Amount</th>
          <th class="rm"></th>
        </tr></thead>
        <tbody>
          ${form.line_items.map((it,i)=>h`<tr key=${i}>
            <td><input value=${it.description||''} placeholder="Monthly retainer" onInput=${e=>updateItem(i,'description',e.target.value)}/></td>
            <td><input value=${it.hsn_sac||''} placeholder="998314" onInput=${e=>updateItem(i,'hsn_sac',e.target.value)}/></td>
            <td class="num"><input type="number" min="0" step="0.5" value=${it.qty||''} onInput=${e=>updateItem(i,'qty',e.target.value)}/></td>
            <td class="num"><input type="number" min="0" step="0.01" value=${it.rate||''} placeholder="0.00" onInput=${e=>updateItem(i,'rate',e.target.value)}/></td>
            <td class="amt">${fmtINR((Number(it.qty)||0)*(Number(it.rate)||0))}</td>
            <td class="rm"><button onClick=${()=>removeItem(i)} title="Remove"><i class="ti ti-x"></i></button></td>
          </tr>`)}
        </tbody>
      </table>
      <button class="btn-sec" style=${{padding:'6px 12px',fontSize:12,marginTop:4}} onClick=${addItem}><i class="ti ti-plus"></i>Add line</button>

      <div class="fi-grid fi-group" style=${{marginTop:14}}>
        <div><div class="fi-lbl">Starts on</div><input class="fi" type="date" value=${form.starts_on||''} onInput=${e=>set('starts_on',e.target.value)}/></div>
        <div><div class="fi-lbl">Ends on (optional)</div><input class="fi" type="date" value=${form.ends_on||''} onInput=${e=>set('ends_on',e.target.value||null)}/></div>
      </div>

      <div style=${{margin:'14px 0',padding:'12px 14px',background:'var(--bg2)',borderRadius:8,fontSize:12,color:'var(--t2)'}}>
        Each invoice will total <strong style=${{color:'#ff00ee',fontSize:14,fontFamily:"'JetBrains Mono',monospace"}}>₹${fmtINR(previewTotal,false)}</strong> (incl. GST). The first one goes out on the next <strong>${ordinalDayLocal(form.invoice_day)}</strong> after you save — <strong>${fmtDateLong(firstRun)}</strong> — then on the ${ordinalDayLocal(form.invoice_day)} of every month, each due <strong>${form.due_offset_days} days</strong> after issue. Nothing is issued retroactively for the current period.
      </div>

      <div style=${{display:'flex',gap:8,justifyContent:'flex-end'}}>
        ${tpl&&h`<button class="btn-sec" onClick=${remove} style=${{color:'#DC2626',borderColor:'rgba(220,38,38,.3)'}}>Delete schedule</button>`}
        <button class="btn-sec" onClick=${()=>{setExpanded(false);setForm(tpl?{...tpl}:null);}}>Cancel</button>
        <button class="btn-pri" onClick=${save} disabled=${saving}>${saving?'Saving…':tpl?'Save changes':'Activate recurring billing'}</button>
      </div>
    </div>`}
  </div>`;
}

    // ── ClientInvoices ──
function ClientInvoices({client,showToast}){
  const[rows,setRows]=useState([]);
  const[agency,setAgency]=useState(null);
  const[loading,setLoading]=useState(true);
  const[editorOpen,setEditorOpen]=useState(false);
  const[editing,setEditing]=useState(null);
  const[viewing,setViewing]=useState(null);
  const[recordingFor,setRecordingFor]=useState(null);
  const[showStatement,setShowStatement]=useState(false);
  const[resendingId,setResendingId]=useState(null);
  const resendInvoice=async(r)=>{
    if(resendingId)return;
    if(!confirm(`Re-send invoice ${r.invoice_number} to ${client.name}?\n\nA fresh gracious-tone email will go out to the brand's contact email on file.`))return;
    setResendingId(r.id);
    try{
      const out=await sendInvoiceEmail(r.id);
      if(out.ok){
        showToast(`Invoice email re-sent to ${out.to||client.name} ✓`);
      }else if(out.error==='no email on file for this client'){
        showToast(`No email on file for ${client.name} — add a contact email first`);
      }else{
        showToast(`Email failed: ${out.error||'unknown'}`);
      }
    }finally{setResendingId(null);}
  };
  const load=()=>{
    setLoading(true);
    Promise.all([
      rpcCall('inv_list',{p_client_id:client.id,p_limit:36}),
      rpcCall('agency_settings_get'),
    ]).then(([invRows,aRow])=>{setRows(invRows||[]);setAgency(aRow||null);})
      .catch(_loadFail('invoices',()=>{setRows([]);}))
      .finally(()=>setLoading(false));
  };
  useEffect(load,[client.id]);
  const openNew=()=>{setEditing(null);setEditorOpen(true);};
  const openEdit=(inv)=>{setViewing(null);setEditing(inv);setEditorOpen(true);};
  const onSaved=(saved)=>{setEditorOpen(false);setEditing(null);load();showToast(editing?'Invoice updated':'Invoice created');if(!editing&&saved)setViewing(saved);};
  const removeRow=async(inv,e)=>{
    e?.stopPropagation();
    if(!confirm(`Move invoice ${inv.invoice_number} to trash?`))return;
    try{
      await rpcCall('inv_soft_delete',{p_id:inv.id});
      logActivity({action:'delete',table_name:'invoices',record_id:String(inv.id),record_label:inv.invoice_number,changes:null});
      load();showToast('Deleted');
    }catch(e){showToast('Delete failed');}
  };
  const STATUS_STYLE={
    paid:    {col:'#15803D',bg:'#DCFCE7'},
    overdue: {col:'#DC2626',bg:'#FEE2E2'},
    due:     {col:'#B45309',bg:'#FEF3C7'},
    partial: {col:'#1D4ED8',bg:'#DBEAFE'},
    waived:  {col:'#6B7280',bg:'#F3F4F6'},
    cancelled:{col:'#6B7280',bg:'#F3F4F6'},
  };
  return h`<div style=${{marginTop:32,paddingTop:24,borderTop:'1px solid var(--bd)'}}>
    <div style=${{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,gap:8,flexWrap:'wrap'}}>
      <div>
        <div style=${{fontSize:14,fontWeight:600,color:'var(--t1)'}}>Invoices</div>
        <div style=${{fontSize:11.5,color:'var(--t3)',marginTop:2}}>Click a row to view the full invoice · the client sees these in their Payments tab.</div>
      </div>
      <div style=${{display:'flex',gap:8}}>
        <button class="btn-sec" style=${{padding:'7px 12px',fontSize:12}} onClick=${()=>setShowStatement(true)} disabled=${rows.length===0}><i class="ti ti-file-text"></i>Statement</button>
        <button class="btn-pri" style=${{padding:'7px 14px',fontSize:12}} onClick=${openNew}><i class="ti ti-plus"></i>New invoice</button>
      </div>
    </div>
    ${loading?h`<div style=${{fontSize:13,color:'var(--t3)'}}>Loading…</div>`
      :rows.length===0?h`<div style=${{fontSize:13,color:'var(--t3)',padding:'18px 0',textAlign:'center',border:'1px dashed var(--bd)',borderRadius:8}}>No invoices yet for this client.</div>`
      :h`<div>${rows.map(r=>{
        const st=STATUS_STYLE[r.status]||STATUS_STYLE.due;
        const paid=Number(r.amount_paid)||0;const total=Number(r.amount)||0;
        return h`<div key=${r.id} style=${{display:'grid',gridTemplateColumns:'auto 1fr auto auto',gap:12,alignItems:'center',padding:'10px 12px',background:'var(--bg)',border:'1px solid var(--bd)',borderRadius:8,marginBottom:6,cursor:'pointer'}} onClick=${()=>setViewing(r)}>
          <span style=${{fontSize:11,color:'var(--t3)',letterSpacing:'.04em',fontWeight:500}}>${r.invoice_number}</span>
          <div style=${{minWidth:0}}>
            <div style=${{fontSize:13,color:'var(--t1)',fontWeight:500}}>${r.period_label||fmtMonthYear(r.period_start)}</div>
            <div style=${{fontSize:11,color:'var(--t3)',marginTop:2}}>Due ${fmt(r.due_date)}${r.status==='partial'?` · ₹${fmtINR(paid,false)} paid of ₹${fmtINR(total,false)}`:r.payment_method?' · paid via '+r.payment_method:''}</div>
          </div>
          <span style=${{fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:500,color:'var(--t1)'}}>₹${fmtINR(total,false)}</span>
          <div style=${{display:'flex',alignItems:'center',gap:6}} onClick=${e=>e.stopPropagation()}>
            <span style=${{padding:'3px 9px',borderRadius:10,fontSize:10.5,fontWeight:600,letterSpacing:'.04em',textTransform:'uppercase',color:st.col,background:st.bg}}>${r.status}</span>
            ${(r.status==='due'||r.status==='overdue'||r.status==='partial')&&h`<button class="icon-btn" style=${{padding:5}} onClick=${()=>resendInvoice(r)} disabled=${resendingId===r.id} title="Re-send invoice email">${resendingId===r.id?h`<i class="ti ti-loader-2 spinner" style=${{fontSize:14,color:'var(--t3)'}}></i>`:h`<i class="ti ti-mail-forward" style=${{color:'#ff00ee',fontSize:15}}></i>`}</button>`}
            ${(r.status==='due'||r.status==='overdue'||r.status==='partial')&&h`<button class="icon-btn" style=${{padding:5}} onClick=${()=>setRecordingFor(r)} title="Record payment"><i class="ti ti-cash-banknote" style=${{color:'#15803D',fontSize:15}}></i></button>`}
            <button class="icon-btn" style=${{padding:5}} onClick=${e=>removeRow(r,e)} title="Delete"><i class="ti ti-trash" style=${{color:'var(--red)',fontSize:14}}></i></button>
          </div>
        </div>`;
      })}</div>`}
    ${editorOpen&&h`<${InvoiceEditor} client=${client} agency=${agency} existing=${editing} onClose=${()=>{setEditorOpen(false);setEditing(null);}} onSaved=${onSaved}/>`}
    ${viewing&&!editorOpen&&h`<${InvoiceViewer} invoice=${viewing} onClose=${()=>setViewing(null)} onChanged=${(u)=>{setViewing(u);load();}} onEdit=${openEdit} showToast=${showToast}/>`}
    ${recordingFor&&h`<${RecordPaymentModal} invoice=${recordingFor} onClose=${()=>setRecordingFor(null)} onSaved=${()=>{setRecordingFor(null);load();}} showToast=${showToast}/>`}
    ${showStatement&&h`<${StatementOfAccount} client=${client} invoices=${rows} agency=${agency} onClose=${()=>setShowStatement(false)} showToast=${showToast}/>`}
  </div>`;
}

    // ── StatementOfAccount ──
function StatementOfAccount({client,invoices,agency,onClose,showToast}){
  const a=agency||{};
  const rows=useMemo(()=>(invoices||[]).filter(i=>!i.deleted_at&&i.status!=='cancelled'&&i.status!=='waived').slice().sort((a,b)=>(a.issued_on||a.period_start||'').localeCompare(b.issued_on||b.period_start||'')),[invoices]);
  const totals=useMemo(()=>{
    let billed=0,received=0,outstanding=0,tds=0;
    rows.forEach(i=>{
      const amt=Number(i.amount)||0;const paid=Number(i.amount_paid)||0;const t=Number(i.tds_amount)||0;
      if(i.type==='credit_note'){billed-=amt;received-=paid;return;}
      billed+=amt;received+=paid;tds+=t;
      const bal=amt-paid-t;
      if(bal>0&&(i.status==='due'||i.status==='overdue'||i.status==='partial'))outstanding+=bal;
    });
    return{billed,received,outstanding,tds};
  },[rows]);
  const printStmt=()=>{document.body.classList.add('printing-stmt');setTimeout(()=>{window.print();document.body.classList.remove('printing-stmt');},50);};
  const sendWhatsApp=()=>{
    const phone=(client.contact_phone||'').replace(/[^\d]/g,'');
    // Send the client to THEIR portal Payments tab (same route family the
    // invoice WhatsApp share uses) — never the staff #/clients/<id> route.
    const msg=`Statement of account · ${client.name}\nOutstanding balance: ₹${fmtINR(totals.outstanding,false)}\n\nPlease tap the link to view your invoices and pay:\n${window.location.origin}${window.location.pathname}#/payments`;
    const base=phone?`https://wa.me/${phone}`:'https://wa.me/';
    window.open(`${base}?text=${encodeURIComponent(msg)}`,'_blank','noopener,noreferrer');
  };
  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose();}}>
    <div class="modal-box inv-modal">
      <div class="modal-head">
        <div>
          <div style=${{fontSize:14,fontWeight:600}}>Statement of account</div>
          <div style=${{fontSize:11.5,color:'var(--t3)',marginTop:2}}>${client.name} · as of ${fmtDateLong(todayISO())}</div>
        </div>
        <button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        <div class="inv-doc" style=${{position:'relative'}}>
          <div class="inv-strip"></div>
          <div class="inv-head">
            <div class="inv-h-l">
              <div class="inv-logo">A</div>
              <div class="inv-co-name">${a.legal_name||'Advance Media Solution'}</div>
              <div class="inv-co-meta" style=${{whiteSpace:'pre-line'}}>${[a.address_line_1,a.address_line_2,[a.city,a.state,a.pincode].filter(Boolean).join(', ')].filter(Boolean).join('\n')}${a.gstin?'\nGSTIN: '+a.gstin:''}</div>
            </div>
            <div class="inv-h-r">
              <div class="inv-title">Statement</div>
              <div class="inv-num">As of ${fmtDateLong(todayISO())}</div>
            </div>
          </div>
          <div class="inv-billto-row">
            <div class="inv-billto">
              <div class="inv-section-lbl">For</div>
              <div class="name">${client.name}</div>
              <div class="addr">${client.bill_address||''}</div>
              ${client.gstin&&h`<div class="gst">GSTIN: ${client.gstin}</div>`}
            </div>
            <div class="inv-billto" style=${{textAlign:'right'}}>
              <div class="inv-section-lbl">Outstanding balance</div>
              <div style=${{fontFamily:"'Fraunces',Georgia,serif",fontSize:32,fontWeight:300,color:totals.outstanding>0?'#B33A1A':'#2D5F3F',letterSpacing:'-.02em',marginTop:6,fontVariationSettings:'"opsz" 96'}}>₹${fmtINR(totals.outstanding)}</div>
              <div style=${{fontFamily:"'Newsreader',Georgia,serif",fontStyle:'italic',fontSize:12.5,color:'#7A7165',marginTop:4}}>${totals.outstanding>0?'Pending payment':'All clear · paid up'}</div>
            </div>
          </div>
          <table class="inv-items">
            <thead><tr>
              <th style=${{width:28}}>#</th>
              <th style=${{width:78}}>Date</th>
              <th>Invoice</th>
              <th class="num" style=${{width:90}}>Billed</th>
              <th class="num" style=${{width:90}}>Received</th>
              <th class="num" style=${{width:90}}>Balance</th>
            </tr></thead>
            <tbody>
              ${rows.map((i,n)=>{const amt=Number(i.amount)||0;const paid=Number(i.amount_paid)||0;const t=Number(i.tds_amount)||0;const bal=i.status==='paid'?0:(amt-paid-t);const isCN=i.type==='credit_note';return h`<tr key=${i.id}>
                <td class="num">${n+1}</td>
                <td>${fmt(i.issued_on||i.period_start)}</td>
                <td class="desc"><b>${i.invoice_number}</b><span class="sub">${i.period_label||fmtMonthYear(i.period_start)||''}${isCN?' · credit note':''} · ${i.status}</span></td>
                <td class="num">${isCN?'−':''}₹${fmtINR(amt,false)}</td>
                <td class="num">${isCN?'−':''}₹${fmtINR(paid,false)}</td>
                <td class="num">${bal>0?'₹'+fmtINR(bal,false):'—'}</td>
              </tr>`;})}
            </tbody>
          </table>
          <div class="inv-tot-row">
            <div class="inv-tot">
              <div class="l"><span>Total billed</span><span class="v">₹ ${fmtINR(totals.billed)}</span></div>
              <div class="l"><span>Total received</span><span class="v">₹ ${fmtINR(totals.received)}</span></div>
              ${totals.tds>0&&h`<div class="l muted"><span>TDS deducted</span><span class="v">₹ ${fmtINR(totals.tds)}</span></div>`}
              <div class="l tot"><span>${totals.outstanding>0?'Balance due':'Balance'}</span><span class="v">₹ ${fmtINR(totals.outstanding)}</span></div>
            </div>
          </div>
          <div class="inv-words"><b>In words:</b> ${numToIndianWords(totals.outstanding)}</div>
          <div class="inv-thanks">Generated ${fmtDateLong(todayISO())} · for any queries, contact ${a.contact_email||a.contact_phone||'your account manager'}.</div>
        </div>
      </div>
      <div class="modal-foot" style=${{justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
        <div></div>
        <div class="inv-actions">
          <button class="btn-sec" onClick=${printStmt}><i class="ti ti-printer"></i>Print / Save PDF</button>
          <button class="btn-sec" onClick=${sendWhatsApp} style=${{color:'#25D366'}}><i class="ti ti-brand-whatsapp"></i>WhatsApp</button>
        </div>
      </div>
    </div>
  </div>`;
}

    // ── InvoiceEditor ──
function InvoiceEditor({client,agency,existing,onClose,onSaved}){
  // Defaults: if editing, hydrate from `existing`; if creating, sane defaults.
  const today=new Date();
  const firstOfMonth=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`;
  const invoiceDay=Number(client.invoice_day)||1;
  const defaultDue=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(invoiceDay).padStart(2,'0')}`;
  const seedItems=()=>{
    if(existing&&Array.isArray(existing.line_items)&&existing.line_items.length)return existing.line_items.map(it=>({...it}));
    const monthly=client.monthly_retainer||client.retainer_amount||0;
    return[{description:`Monthly retainer · ${fmtMonthYear(firstOfMonth)}`,hsn_sac:agency?.default_hsn_sac||'998314',qty:1,rate:monthly||''}];
  };
  const[form,setForm]=useState(()=>({
    invoice_number:existing?.invoice_number||'',
    issued_on:existing?.issued_on||todayISO(),
    period_start:existing?.period_start||firstOfMonth,
    period_label:existing?.period_label||'',
    due_date:existing?.due_date||defaultDue,
    discount_amount:existing?.discount_amount||0,
    gst_rate:existing?.gst_rate??(client.gst_applicable===false?0:Number(agency?.default_gst_rate)||18),
    tds_rate:existing?.tds_rate??(client.gstin?2:0), // default 2% TDS for B2B (client has GSTIN), 0% otherwise
    notes:existing?.notes||'',
    terms:existing?.terms||agency?.invoice_terms||'Payment due within 7 days of invoice date.',
    project_phase:existing?.project_phase||(client.retainer_type==='project'?'advance':''),
    line_items:seedItems(),
  }));
  const[saving,setSaving]=useState(false);
  const[reservedNumber,setReservedNumber]=useState(existing?.invoice_number||null);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const updateItem=(i,k,v)=>setForm(f=>({...f,line_items:f.line_items.map((it,j)=>j===i?{...it,[k]:v}:it)}));
  const addItem=()=>setForm(f=>({...f,line_items:[...f.line_items,{description:'',hsn_sac:agency?.default_hsn_sac||'998314',qty:1,rate:''}]}));
  const removeItem=(i)=>setForm(f=>({...f,line_items:f.line_items.filter((_,j)=>j!==i)}));
  // Reserve invoice number from server-side counter (only if creating new).
  useEffect(()=>{
    if(existing||reservedNumber)return;
    rpcCall('inv_get_next_number').then(data=>{
      if(data){setReservedNumber(data);set('invoice_number',data);}
    }).catch(()=>{});
  },[]);
  const totals=useMemo(()=>{
    const t=calcInvoiceTotals({
      lineItems:form.line_items,
      gstRate:form.gst_rate,
      discount:form.discount_amount,
      agencyState:agency?.state,
      clientState:client.state,
      placeOfSupply:client.place_of_supply||client.state,
    });
    // Refine supplyType: B2B if client has GSTIN, else B2C; EXPWOP stays as set.
    if(t.supplyType!=='EXPWOP')t.supplyType=client.gstin?'B2B':'B2C';
    // TDS is computed on the taxable value (pre-GST) per Indian tax convention.
    t.tdsRate=Number(form.tds_rate)||0;
    t.tdsAmount=Math.round(t.taxable*t.tdsRate)/100;
    t.netReceivable=t.total-t.tdsAmount;
    return t;
  },[form.line_items,form.gst_rate,form.discount_amount,form.tds_rate,agency?.state,client.state,client.place_of_supply,client.gstin]);
  const submit=async()=>{
    if(!form.invoice_number?.trim()){alert('Invoice number required');return;}
    if(form.line_items.length===0){alert('Add at least one line item');return;}
    if(!form.line_items.every(it=>it.description?.trim()&&Number(it.qty)>0&&Number(it.rate)>=0)){alert('Every line needs a description, quantity > 0, and a rate.');return;}
    if(!form.due_date){alert('Due date required');return;}
    setSaving(true);
    try{
      const today=todayISO();
      const baseStatus=existing?.status||(form.due_date<today?'overdue':'due');
      const payload={
        client_id:client.id,
        invoice_number:form.invoice_number.trim(),
        issued_on:form.issued_on,
        period_start:form.period_start,
        period_label:form.period_label?.trim()||null,
        amount:totals.total,
        subtotal:totals.subtotal,
        discount_amount:totals.discount,
        taxable_value:totals.taxable,
        gst_rate:totals.gstRate,
        cgst_amount:totals.cgst,
        sgst_amount:totals.sgst,
        igst_amount:totals.igst,
        supply_type:totals.supplyType,
        tds_rate:totals.tdsRate,
        tds_amount:totals.tdsAmount,
        hsn_sac:form.line_items[0]?.hsn_sac||agency?.default_hsn_sac||'998314',
        line_items:form.line_items.map(it=>({...it,qty:Number(it.qty)||0,rate:Number(it.rate)||0,amount:(Number(it.qty)||0)*(Number(it.rate)||0)})),
        due_date:form.due_date,
        project_phase:form.project_phase||null,
        status:baseStatus,
        notes:form.notes?.trim()||null,
        terms:form.terms?.trim()||null,
        place_of_supply:client.place_of_supply||client.state||null,
        agency_snapshot:buildAgencySnapshot(agency),
        client_snapshot:buildClientSnapshot(client),
      };
      let saved;
      if(existing){
        saved=await rpcCall('inv_update',{p_id:existing.id,p_data:payload});
        logActivity({action:'update',table_name:'invoices',record_id:String(existing.id),record_label:form.invoice_number,changes:null});
      }else{
        saved=await rpcCall('inv_create',{p_data:payload});
        logActivity({action:'insert',table_name:'invoices',record_id:String(saved?.id||''),record_label:form.invoice_number,changes:null});
        // Notify client portal
        try{insertNotif(client.name,'🧾 New invoice from AMS','Invoice '+form.invoice_number+' for ₹'+fmtINR(totals.total,false)+' is ready in your Payments tab.','info',client.name,null,'invoice',saved?.id);}catch(_){}
        // Fire the gracious invoice email — non-fatal if it fails.
        if(saved?.id){
          sendInvoiceEmail(saved.id).then(r=>{
            if(r.ok)console.info('[invoice] welcome email sent to',r.to);
            else console.warn('[invoice] email failed:',r.error);
          });
        }
      }
      onSaved(saved);
    }catch(e){console.error('[invoice] save failed',e);alert('Failed to save: '+(e?.message||e));}
    finally{setSaving(false);}
  };
  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose();}}>
    <div class="modal-box" style=${{maxWidth:720}}>
      <div class="modal-head">
        <div>
          <div style=${{fontSize:16,fontWeight:600}}>${existing?'Edit invoice':'New invoice'}</div>
          <div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>For ${client.name} ${totals.supplyType==='EXPWOP'?'· Export (zero-rated)':totals.cgst>0?'· Intra-state (CGST + SGST)':totals.igst>0?'· Inter-state (IGST)':'· No GST'}</div>
        </div>
        <button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        <div class="fi-grid fi-group" style=${{gridTemplateColumns:'1fr 1fr 1fr'}}>
          <div><div class="fi-lbl">Invoice number</div><input class="fi" type="text" value=${form.invoice_number} onInput=${e=>set('invoice_number',e.target.value)} placeholder="A00107"/></div>
          <div><div class="fi-lbl">Issued on</div><input class="fi" type="date" value=${form.issued_on} onInput=${e=>set('issued_on',e.target.value)}/></div>
          <div><div class="fi-lbl">Due date</div><input class="fi" type="date" value=${form.due_date} onInput=${e=>set('due_date',e.target.value)}/></div>
        </div>
        ${client.retainer_type==='project'&&h`<div class="fi-group"><div class="fi-lbl"><i class="ti ti-rocket" style=${{fontSize:12,marginRight:4,color:'#A8009C'}}></i>Project milestone</div><select class="fi fi-select" value=${form.project_phase} onChange=${e=>set('project_phase',e.target.value)}><option value="">— Not a milestone —</option><option value="advance">Advance — unlocks the build on payment</option><option value="balance">Balance — unlocks handoff on payment</option></select></div>`}
        <div class="fi-grid fi-group">
          <div><div class="fi-lbl">Period start</div><input class="fi" type="date" value=${form.period_start} onInput=${e=>set('period_start',e.target.value)}/></div>
          <div><div class="fi-lbl">Period label (optional)</div><input class="fi" type="text" value=${form.period_label} onInput=${e=>set('period_label',e.target.value)} placeholder=${fmtMonthYear(form.period_start)}/></div>
        </div>

        <div class="fi-lbl" style=${{marginTop:14}}>Line items</div>
        <table class="inv-line-tbl">
          <thead><tr>
            <th style=${{width:'45%'}}>Description</th>
            <th style=${{width:90}}>HSN/SAC</th>
            <th class="num" style=${{width:60}}>Qty</th>
            <th class="num" style=${{width:110}}>Rate (₹)</th>
            <th class="num" style=${{width:110}}>Amount</th>
            <th class="rm"></th>
          </tr></thead>
          <tbody>
            ${form.line_items.map((it,i)=>h`<tr key=${i}>
              <td><input value=${it.description||''} placeholder="Monthly retainer · May 2026" onInput=${e=>updateItem(i,'description',e.target.value)}/></td>
              <td><input value=${it.hsn_sac||''} placeholder="998314" onInput=${e=>updateItem(i,'hsn_sac',e.target.value)}/></td>
              <td class="num"><input type="number" min="0" step="0.5" value=${it.qty||''} onInput=${e=>updateItem(i,'qty',e.target.value)}/></td>
              <td class="num"><input type="number" min="0" step="0.01" value=${it.rate||''} placeholder="0.00" onInput=${e=>updateItem(i,'rate',e.target.value)}/></td>
              <td class="amt">${fmtINR((Number(it.qty)||0)*(Number(it.rate)||0))}</td>
              <td class="rm"><button onClick=${()=>removeItem(i)} title="Remove"><i class="ti ti-x"></i></button></td>
            </tr>`)}
          </tbody>
        </table>
        <button class="btn-sec" style=${{padding:'6px 12px',fontSize:12,marginTop:4}} onClick=${addItem}><i class="ti ti-plus"></i>Add line</button>

        <div class="fi-grid fi-group" style=${{marginTop:18,gridTemplateColumns:'1fr 1fr 1fr'}}>
          <div><div class="fi-lbl">Discount (₹)</div><input class="fi" type="number" min="0" step="0.01" value=${form.discount_amount||0} onInput=${e=>set('discount_amount',e.target.value)}/></div>
          <div><div class="fi-lbl">GST rate (%) ${client.gst_applicable===false?'— non-GST':''}</div><input class="fi" type="number" min="0" max="28" step="0.5" value=${form.gst_rate} onInput=${e=>set('gst_rate',e.target.value)}/></div>
          <div><div class="fi-lbl">TDS rate (%) ${client.gstin?'— B2B, default 2%':'— B2C, usually 0'}</div><input class="fi" type="number" min="0" max="30" step="0.1" value=${form.tds_rate} onInput=${e=>set('tds_rate',e.target.value)}/></div>
        </div>

        <div style=${{marginTop:14,padding:'12px 14px',background:'var(--bg2)',borderRadius:8,fontSize:12.5,color:'var(--t2)'}}>
          <div style=${{display:'grid',gridTemplateColumns:'1fr auto',rowGap:4,fontVariantNumeric:'tabular-nums'}}>
            <span>Subtotal</span><span>₹ ${fmtINR(totals.subtotal)}</span>
            ${totals.discount>0&&h`<span>− Discount</span><span>₹ ${fmtINR(totals.discount)}</span>`}
            <span>Taxable value</span><span>₹ ${fmtINR(totals.taxable)}</span>
            ${totals.cgst>0&&h`<span>+ CGST @ ${totals.gstRate/2}%</span><span>₹ ${fmtINR(totals.cgst)}</span>`}
            ${totals.sgst>0&&h`<span>+ SGST @ ${totals.gstRate/2}%</span><span>₹ ${fmtINR(totals.sgst)}</span>`}
            ${totals.igst>0&&h`<span>+ IGST @ ${totals.gstRate}%</span><span>₹ ${fmtINR(totals.igst)}</span>`}
            <span style=${{fontWeight:600,color:'var(--t1)',paddingTop:6,borderTop:'1px solid var(--bd)',marginTop:4}}>Invoice total</span><span style=${{fontWeight:600,color:'var(--t1)',paddingTop:6,borderTop:'1px solid var(--bd)',marginTop:4,fontSize:14}}>₹ ${fmtINR(totals.total)}</span>
            ${totals.tdsAmount>0&&h`<span style=${{color:'#B45309'}}>− TDS @ ${totals.tdsRate}% (deducted by client)</span><span style=${{color:'#B45309'}}>₹ ${fmtINR(totals.tdsAmount)}</span>`}
            ${totals.tdsAmount>0&&h`<span style=${{fontWeight:600,color:'#ff00ee',paddingTop:6,borderTop:'1px dashed var(--bd)',marginTop:4}}>Net receivable</span><span style=${{fontWeight:600,color:'#ff00ee',paddingTop:6,borderTop:'1px dashed var(--bd)',marginTop:4,fontSize:14}}>₹ ${fmtINR(totals.netReceivable)}</span>`}
          </div>
          ${totals.tdsAmount>0&&h`<div style=${{marginTop:8,fontSize:11,color:'var(--t3)',fontStyle:'italic',lineHeight:1.4}}>TDS of ₹${fmtINR(totals.tdsAmount)} will be withheld by the client and credited to your PAN. The invoice shows ₹${fmtINR(totals.total)} but you'll receive ₹${fmtINR(totals.netReceivable)}.</div>`}
        </div>

        <div class="fi-group" style=${{marginTop:14}}>
          <div class="fi-lbl">Terms (printed on invoice)</div>
          <input class="fi" type="text" value=${form.terms} onInput=${e=>set('terms',e.target.value)}/>
        </div>
        <div class="fi-group">
          <div class="fi-lbl">Internal notes (not printed)</div>
          <input class="fi" type="text" value=${form.notes} onInput=${e=>set('notes',e.target.value)} placeholder="advance received, holiday discount, etc."/>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-sec" onClick=${onClose} disabled=${saving}>Cancel</button>
        <button class="btn-pri" onClick=${submit} disabled=${saving}>${saving?'Saving…':existing?'Save changes':'Create invoice'}</button>
      </div>
    </div>
  </div>`;
}

    // ── RecordPaymentModal ──
function RecordPaymentModal({invoice,onClose,onSaved,showToast}){
  const total=Number(invoice?.amount)||0;
  const paid=Number(invoice?.amount_paid)||0;
  const balance=Math.max(0,total-paid);
  const[amount,setAmount]=useState(String(balance||''));
  const[method,setMethod]=useState('UPI');
  const[reference,setReference]=useState('');
  const[paidOn,setPaidOn]=useState(todayISO());
  const[saving,setSaving]=useState(false);
  const amt=Number(amount)||0;
  const isFull=amt>=balance&&amt>0;
  const isPartial=amt>0&&amt<balance;
  const newPaid=paid+amt;
  const newStatus=newPaid>=total?'paid':newPaid>0?'partial':invoice?.status;
  const save=async()=>{
    if(!(amt>0)){showToast('Enter an amount greater than 0');return;}
    if(amt>balance+0.01){if(!confirm(`Amount ₹${amt.toLocaleString('en-IN')} is more than the balance of ₹${balance.toLocaleString('en-IN')}. Continue anyway?`))return;}
    setSaving(true);
    try{
      await rpcCall('inv_payment_record',{p_data:{
        invoice_id:invoice.id,
        amount:amt,
        paid_on:paidOn,
        method,
        reference:reference.trim()||null,
      }});
      logActivity({action:'insert',table_name:'invoice_payments',record_id:String(invoice.id),record_label:invoice.invoice_number+' · ₹'+amt,changes:null});
      // Re-read the invoice (the trigger updated amount_paid/status).
      let fresh=null;
      try{fresh=await rpcCall('inv_get',{p_id:invoice.id});}catch(_){}
      onSaved(fresh||{...invoice,amount_paid:newPaid,status:newStatus});
      showToast(isFull?'Paid in full ✓':'Partial payment recorded');
    }catch(e){console.error('[payment] failed',e);showToast('Failed to record payment');}
    finally{setSaving(false);}
  };
  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose();}}>
    <div class="modal-box" style=${{maxWidth:440}}>
      <div class="modal-head">
        <div>
          <div style=${{fontSize:16,fontWeight:600}}>Record payment</div>
          <div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>${invoice?.invoice_number} · ${invoice?.client_snapshot?.name||''}</div>
        </div>
        <button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        <div style=${{padding:'12px 14px',background:'var(--bg2)',borderRadius:8,marginBottom:14,fontSize:12.5,color:'var(--t2)',display:'grid',gridTemplateColumns:'auto auto',gap:'4px 14px',fontVariantNumeric:'tabular-nums'}}>
          <span>Invoice total</span><span style=${{fontWeight:500,color:'var(--t1)',textAlign:'right'}}>₹${total.toLocaleString('en-IN')}</span>
          ${paid>0&&h`<span>Already received</span>`}
          ${paid>0&&h`<span style=${{fontWeight:500,color:'#15803D',textAlign:'right'}}>₹${paid.toLocaleString('en-IN')}</span>`}
          <span>Balance pending</span><span style=${{fontWeight:600,color:balance>0?'#B45309':'#15803D',textAlign:'right'}}>₹${balance.toLocaleString('en-IN')}</span>
        </div>
        <div class="fi-grid fi-group">
          <div><div class="fi-lbl">Amount received (₹)</div><input class="fi" type="number" min="0" step="0.01" value=${amount} onInput=${e=>setAmount(e.target.value)} autoFocus/></div>
          <div><div class="fi-lbl">Paid on</div><input class="fi" type="date" value=${paidOn} onInput=${e=>setPaidOn(e.target.value)}/></div>
        </div>
        <div class="fi-group">
          <div class="fi-lbl">Method</div>
          <select class="fi fi-select" value=${method} onChange=${e=>setMethod(e.target.value)}>
            <option>UPI</option>
            <option>Bank transfer</option>
            <option>Cash</option>
            <option>Cheque</option>
            <option>Razorpay</option>
            <option>Other</option>
          </select>
        </div>
        <div class="fi-group">
          <div class="fi-lbl">Reference (optional)</div>
          <input class="fi" type="text" value=${reference} onInput=${e=>setReference(e.target.value)} placeholder="UPI ref / bank ref / cheque no."/>
        </div>
        <div style=${{marginTop:6,padding:'10px 12px',borderRadius:8,fontSize:12,lineHeight:1.5,background:isFull?'rgba(15,128,61,.08)':isPartial?'rgba(29,78,216,.08)':'var(--bg2)',color:isFull?'#15803D':isPartial?'#1D4ED8':'var(--t3)'}}>
          ${amt<=0?h`<span>Enter an amount to see the new status.</span>`
            :isFull?h`<i class="ti ti-circle-check" style=${{marginRight:6}}></i>This will mark the invoice as <strong>PAID in full</strong>.`
            :isPartial?h`<i class="ti ti-info-circle" style=${{marginRight:6}}></i>This will mark as <strong>PARTIAL</strong> · ₹${(balance-amt).toLocaleString('en-IN')} will remain pending.`
            :h`<i class="ti ti-alert-triangle" style=${{marginRight:6}}></i>Amount exceeds balance.`}
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-sec" onClick=${onClose} disabled=${saving}>Cancel</button>
        <button class="btn-pri" onClick=${save} disabled=${saving||!(amt>0)}>${saving?'Saving…':isFull?'Mark paid in full':'Record payment'}</button>
      </div>
    </div>
  </div>`;
}

    // ── PaymentHistory ──
// Lists the individual invoice_payments rows (date / amount / mode / ref) via
// inv_payment_list (migration 060), with an admin-only delete through
// inv_payment_delete so a typo'd payment is correctable without SQL surgery.
// Renders nothing if the list RPC isn't available (older DB) or has no rows.
function PaymentHistory({invoice,canDelete,showToast,onChanged}){
  const[rows,setRows]=useState(null);     // null = loading/hidden
  const[busyId,setBusyId]=useState(null);
  const[canRemove,setCanRemove]=useState(true); // flips off if delete RPC missing
  const load=()=>{
    rpcCall('inv_payment_list',{p_invoice_id:invoice.id})
      .then(r=>setRows(Array.isArray(r)?r:[]))
      .catch(()=>setRows(null));
  };
  useEffect(load,[invoice.id,invoice.amount_paid]);
  const isFnMissing=(e)=>/PGRST202|could not find|404|function/i.test(String(e?.code||'')+' '+String(e?.message||''));
  const removePayment=async(p)=>{
    const when=p.paid_on?fmt(p.paid_on):'';
    if(!confirm(`Delete this payment of ₹${fmtINR(p.amount,false)}${when?' recorded on '+when:''}?\n\nThe invoice's paid amount and status will be recalculated automatically.`))return;
    setBusyId(p.id);
    try{
      await rpcCall('inv_payment_delete',{p_payment_id:p.id});
      logActivity({action:'delete',table_name:'invoice_payments',record_id:String(p.id),record_label:invoice.invoice_number+' · ₹'+fmtINR(p.amount,false),changes:null});
      let fresh=null;
      try{fresh=await rpcCall('inv_get',{p_id:invoice.id});}catch(_){}
      if(fresh)onChanged?.(fresh);
      load();
      showToast?.('Payment deleted — invoice recalculated');
    }catch(e){
      console.error('[payment-delete] failed',e);
      if(isFnMissing(e)){setCanRemove(false);showToast?.('Payment delete needs the latest DB migration');}
      else showToast?.('Delete failed: '+(e?.message||e));
    }finally{setBusyId(null);}
  };
  if(!rows||rows.length===0)return null;
  return h`<div style=${{marginTop:18,paddingTop:14,borderTop:'1px solid var(--bd)'}}>
    <div style=${{fontSize:12.5,fontWeight:600,color:'var(--t1)',marginBottom:8}}><i class="ti ti-cash-banknote" style=${{fontSize:14,marginRight:6,color:'#15803D',verticalAlign:'-2px'}}></i>Payments received</div>
    <div style=${{border:'1px solid var(--bd)',borderRadius:8,overflow:'hidden',background:'var(--bg)'}}>
      <table style=${{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
        <thead><tr style=${{background:'var(--bg2)',color:'var(--t3)',fontSize:10.5,letterSpacing:'.05em',textTransform:'uppercase',fontWeight:500}}>
          <th style=${{padding:'8px 12px',textAlign:'left'}}>Date</th>
          <th style=${{padding:'8px 12px',textAlign:'right'}}>Amount</th>
          <th style=${{padding:'8px 12px',textAlign:'left'}}>Mode</th>
          <th style=${{padding:'8px 12px',textAlign:'left'}}>Reference</th>
          ${canDelete&&canRemove&&h`<th style=${{padding:'8px 12px',width:42}}></th>`}
        </tr></thead>
        <tbody>
          ${rows.map(p=>h`<tr key=${p.id} style=${{borderTop:'1px solid var(--bd)'}}>
            <td style=${{padding:'8px 12px',color:'var(--t2)',whiteSpace:'nowrap'}}>${fmt(p.paid_on)}</td>
            <td style=${{padding:'8px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums',fontWeight:500,color:'var(--t1)'}}>₹${fmtINR(p.amount,false)}</td>
            <td style=${{padding:'8px 12px',color:'var(--t2)'}}>${p.method||'—'}</td>
            <td style=${{padding:'8px 12px',color:'var(--t3)',fontSize:11.5,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${p.reference||p.razorpay_payment_id||'—'}</td>
            ${canDelete&&canRemove&&h`<td style=${{padding:'8px 12px',textAlign:'right'}}>
              <button class="icon-btn" style=${{padding:4}} onClick=${()=>removePayment(p)} disabled=${busyId===p.id} title="Delete this payment (recalculates the invoice)">
                ${busyId===p.id?h`<i class="ti ti-loader-2 spinner" style=${{fontSize:13,color:'var(--t3)'}}></i>`:h`<i class="ti ti-trash" style=${{color:'var(--red)',fontSize:13}}></i>`}
              </button>
            </td>`}
          </tr>`)}
        </tbody>
      </table>
    </div>
  </div>`;
}

    // ── InvoiceViewer ──
function InvoiceViewer({invoice,onClose,onChanged,onEdit,showToast,canEdit=true,clients=[]}){
  const [inv,setInv]=useState(invoice);
  useEffect(()=>{setInv(invoice);},[invoice?.id]);
  const[linking,setLinking]=useState(false);
  const[relinkBusy,setRelinkBusy]=useState(false);
  const clientLinked=(clients||[]).some(c=>c.id===inv?.client_id);
  const reassignClient=async(c)=>{
    setRelinkBusy(true);
    try{
      const snap=buildClientSnapshot(c);
      const updated=await rpcCall('inv_reassign_client',{p_id:inv.id,p_client_id:c.id,p_snapshot:snap});
      const fresh={...inv,...(updated||{client_id:c.id,client_snapshot:snap})};
      logActivity({action:'update',table_name:'invoices',record_id:String(inv.id),record_label:inv.invoice_number+' · linked to '+c.name,changes:{client_id:{old:inv.client_id,new:c.id}}});
      setInv(fresh);onChanged?.(fresh);
      setLinking(false);showToast?.('Linked to '+c.name);
    }catch(e){console.error('[inv] reassign failed',e);showToast?.('Failed to link: '+(e?.message||e));}
    finally{setRelinkBusy(false);}
  };
  if(!inv)return null;
  const printIt=()=>{document.body.classList.add('printing-invoice');setTimeout(()=>{window.print();document.body.classList.remove('printing-invoice');},50);};
  const downloadPDF=async()=>{
    // Lazy-load html2pdf only when needed (~200KB).
    try{
      if(!window.html2pdf){
        await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
      }
      const el=document.querySelector('.inv-modal .inv-doc');
      if(!el){showToast?.('Invoice not rendered');return;}
      await window.html2pdf().from(el).set({margin:0,filename:'Invoice-'+inv.invoice_number+'.pdf',html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).save();
    }catch(e){console.error('[pdf] failed',e);showToast?.('Could not generate PDF');}
  };
  const [recording,setRecording]=useState(false);
  const onPaymentRecorded=(fresh)=>{setRecording(false);setInv(fresh);onChanged?.(fresh);};
  const shareWhatsApp=()=>{
    const url=`${window.location.origin}${window.location.pathname}#/payments/invoice/${inv.id}`;
    const c=inv.client_snapshot||{};
    const phone=(c.contact_phone||'').replace(/[^\d]/g,'');
    const total=Number(inv.amount)||0;
    const msg=`Hi${c.name?' '+c.name:''} 👋 — your invoice ${inv.invoice_number} for ₹${fmtINR(total,false)} (${inv.period_label||fmtMonthYear(inv.period_start)}) is ready. Tap to view and pay:\n${url}`;
    const base=phone?`https://wa.me/${phone}`:'https://wa.me/';
    window.open(`${base}?text=${encodeURIComponent(msg)}`,'_blank','noopener,noreferrer');
  };
  const cancelInvoice=async()=>{
    if(!confirm('Cancel this invoice? It will be marked CANCELLED and excluded from totals.'))return;
    try{
      const updated=await rpcCall('inv_cancel',{p_id:inv.id});
      logActivity({action:'update',table_name:'invoices',record_id:String(inv.id),record_label:inv.invoice_number+' · cancelled',changes:{status:{old:inv.status,new:'cancelled'}}});
      setInv(i=>({...i,...(updated||{status:'cancelled'})}));
      onChanged?.({...inv,...(updated||{status:'cancelled'})});
      showToast?.('Cancelled');
    }
    catch(e){showToast?.('Failed to cancel');}
  };
  const[creatingCN,setCreatingCN]=useState(false);
  const issueCreditNote=async(amount,reason)=>{
    // Issues a credit note linked to this invoice. Amount must be > 0.
    setCreatingCN(true);
    try{
      const cnNum=await rpcCall('inv_get_next_credit_note_number');
      if(!cnNum)throw new Error('Could not reserve credit note number');
      const a=inv.agency_snapshot||{};const c=inv.client_snapshot||{};
      // Mirror invoice's GST split, scaled to the refund amount
      const total=Number(inv.amount)||1;const ratio=amount/total;
      const cnPayload={
        type:'credit_note',parent_invoice_id:inv.id,
        client_id:inv.client_id,invoice_number:cnNum,
        issued_on:todayISO(),period_start:inv.period_start,period_label:'Credit · '+(inv.period_label||fmtMonthYear(inv.period_start)),
        amount:amount,subtotal:Math.round(Number(inv.subtotal)*ratio*100)/100,discount_amount:0,
        taxable_value:Math.round(Number(inv.taxable_value)*ratio*100)/100,
        gst_rate:inv.gst_rate,
        cgst_amount:Math.round(Number(inv.cgst_amount||0)*ratio*100)/100,
        sgst_amount:Math.round(Number(inv.sgst_amount||0)*ratio*100)/100,
        igst_amount:Math.round(Number(inv.igst_amount||0)*ratio*100)/100,
        supply_type:inv.supply_type,hsn_sac:inv.hsn_sac,place_of_supply:inv.place_of_supply,
        due_date:todayISO(),status:'paid', // credit notes are issued + settled immediately by convention
        amount_paid:amount,paid_at:new Date().toISOString(),
        line_items:[{description:reason||'Credit against '+inv.invoice_number,hsn_sac:inv.hsn_sac||'998314',qty:1,rate:amount,amount}],
        notes:'Credit note for invoice '+inv.invoice_number+(reason?' · '+reason:''),
        terms:'This credit can be adjusted against future invoices or refunded as agreed.',
        agency_snapshot:a,client_snapshot:c,
      };
      const cnRow=await rpcCall('inv_create',{p_data:cnPayload});
      logActivity({action:'insert',table_name:'invoices',record_id:String(cnRow?.id||''),record_label:cnNum+' · credit note',changes:null});
      try{insertNotif(c.name||'Client','🧾 Credit note issued','Credit note '+cnNum+' for ₹'+fmtINR(amount,false)+' has been added to your account.','info',c.name,null,'invoice',cnRow?.id);}catch(_){}
      showToast?.('Credit note '+cnNum+' issued');
      setCreatingCN(false);
      onChanged?.(inv);
    }catch(e){console.error('[credit-note] failed',e);showToast?.('Failed: '+(e?.message||e));setCreatingCN(false);}
  };
  const openCreditNote=()=>{
    const total=Number(inv.amount)||0;const paid=Number(inv.amount_paid)||0;
    const suggested=Math.min(paid||total,total);
    const amtStr=prompt(`Issue a credit note for invoice ${inv.invoice_number}.\n\nAmount to credit (₹):`,String(suggested));
    if(amtStr===null)return;
    const amt=Number(amtStr);
    if(!(amt>0)){showToast?.('Amount must be > 0');return;}
    const reason=prompt('Reason (optional, printed on the note):','')||'';
    issueCreditNote(amt,reason);
  };
  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose();}}>
    <div class="modal-box inv-modal">
      <div class="modal-head">
        <div>
          <div style=${{fontSize:14,fontWeight:600}}>${inv.invoice_number}</div>
          <div style=${{fontSize:11.5,color:'var(--t3)',marginTop:2}}>${inv.client_snapshot?.name||'Client'} · ${fmtMonthYear(inv.period_start)} · ${inv.status?.toUpperCase()}</div>
        </div>
        <button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        <${InvoiceTemplate} invoice=${inv}/>
        ${(Number(inv.amount_paid)||0)>0&&h`<${PaymentHistory} invoice=${inv} canDelete=${canEdit} showToast=${showToast} onChanged=${(fresh)=>{setInv(fresh);onChanged?.(fresh);}}/>`}
      </div>
      <div class="modal-foot" style=${{justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
        <div class="inv-actions">
          <button class="btn-sec" onClick=${downloadPDF}><i class="ti ti-download"></i>Download PDF</button>
          <button class="btn-sec" onClick=${printIt}><i class="ti ti-printer"></i>Print</button>
          <button class="btn-sec" onClick=${shareWhatsApp} style=${{color:'#25D366'}}><i class="ti ti-brand-whatsapp"></i>WhatsApp</button>
        </div>
        <div class="inv-actions">
          ${canEdit&&h`<button class="btn-sec" onClick=${()=>setLinking(true)} disabled=${relinkBusy} style=${clientLinked?{}:{color:'#B45309',borderColor:'rgba(180,83,9,.3)'}}><i class="ti ti-link"></i>${clientLinked?'Change client':'Link to client'}</button>`}
          ${canEdit&&inv.type!=='credit_note'&&(inv.status==='paid'||inv.status==='partial')&&h`<button class="btn-sec" onClick=${openCreditNote} disabled=${creatingCN} style=${{color:'#B45309',borderColor:'rgba(180,83,9,.3)'}}><i class="ti ti-receipt-refund"></i>${creatingCN?'Issuing…':'Issue credit note'}</button>`}
          ${canEdit&&inv.type!=='credit_note'&&inv.status!=='cancelled'&&inv.status!=='paid'&&h`<button class="btn-sec" onClick=${cancelInvoice} style=${{color:'#DC2626',borderColor:'rgba(220,38,38,.3)'}}>Cancel invoice</button>`}
          ${canEdit&&onEdit&&inv.type!=='credit_note'&&inv.status!=='paid'&&inv.status!=='cancelled'&&h`<button class="btn-sec" onClick=${()=>onEdit(inv)}><i class="ti ti-pencil"></i>Edit</button>`}
          ${canEdit&&inv.type!=='credit_note'&&inv.status!=='paid'&&inv.status!=='cancelled'&&h`<button class="btn-pri" onClick=${()=>setRecording(true)}><i class="ti ti-cash-banknote"></i>Record payment</button>`}
        </div>
      </div>
      ${recording&&h`<${RecordPaymentModal} invoice=${inv} onClose=${()=>setRecording(false)} onSaved=${onPaymentRecorded} showToast=${showToast}/>`}
      ${linking&&h`<${ClientPickerModal} clients=${clients} title=${clientLinked?'Change client':'Link this invoice to…'} subtitle=${'Currently: '+(inv.client_snapshot?.name||'unknown')} onClose=${()=>setLinking(false)} onPick=${reassignClient}/>`}
    </div>
  </div>`;
}

    // ── AgingReport ──
function AgingReport({invoices,clients,onOpen}){
  const rows=useMemo(()=>{
    const today=new Date();today.setHours(0,0,0,0);
    return invoices
      .filter(i=>(i.type||'invoice')==='invoice'&&!i.deleted_at&&(i.status==='due'||i.status==='overdue'||i.status==='partial'))
      .map(i=>{
        const due=i.due_date?new Date(i.due_date):null;
        const days=due?Math.floor((today-due)/86400000):0;
        const bal=(Number(i.amount)||0)-(Number(i.amount_paid)||0)-(Number(i.tds_amount)||0);
        const bucket=days<=0?'current':days<=30?'0-30':days<=60?'31-60':days<=90?'61-90':'90+';
        return{...i,days_overdue:Math.max(0,days),balance:bal,bucket};
      })
      .sort((a,b)=>b.days_overdue-a.days_overdue);
  },[invoices]);
  const totals=useMemo(()=>{
    const t={current:0,'0-30':0,'31-60':0,'61-90':0,'90+':0,all:0};
    rows.forEach(r=>{t[r.bucket]+=r.balance;t.all+=r.balance;});
    return t;
  },[rows]);
  const byClient=useMemo(()=>{
    const m={};rows.forEach(r=>{if(!m[r.client_id])m[r.client_id]={client:clients[r.client_id],rows:[],total:0,oldest:0};m[r.client_id].rows.push(r);m[r.client_id].total+=r.balance;if(r.days_overdue>m[r.client_id].oldest)m[r.client_id].oldest=r.days_overdue;});
    return Object.values(m).sort((a,b)=>b.total-a.total);
  },[rows,clients]);
  const BUCKETS=[['current','Not yet due','var(--t2)'],['0-30','0–30 days','#B45309'],['31-60','31–60 days','#DC2626'],['61-90','61–90 days','#DC2626'],['90+','90+ days','#7F1D1D']];
  if(rows.length===0)return h`<div style=${{padding:'48px 24px',textAlign:'center',color:'var(--t3)',fontSize:13,border:'1px dashed var(--bd)',borderRadius:10}}><i class="ti ti-check" style=${{fontSize:32,marginBottom:10,display:'block',color:'var(--green)'}}></i>Nothing outstanding. Everyone's paid up.</div>`;
  return h`<div>
    <div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:18}}>
      ${BUCKETS.map(([k,lb,col])=>h`<div key=${k} class="crd" style=${{padding:'12px 14px',borderColor:totals[k]>0?col:'var(--bd)'}}>
        <div style=${{fontSize:10.5,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',fontWeight:500}}>${lb}</div>
        <div style=${{fontSize:18,fontWeight:600,color:totals[k]>0?col:'var(--t3)',marginTop:6,fontVariantNumeric:'tabular-nums'}}>₹${fmtINR(totals[k],false)}</div>
      </div>`)}
    </div>
    <div style=${{marginBottom:8,fontSize:13,color:'var(--t2)'}}>Total outstanding · <strong style=${{color:'var(--t1)',fontVariantNumeric:'tabular-nums'}}>₹${fmtINR(totals.all,false)}</strong> across <strong>${rows.length}</strong> invoice${rows.length===1?'':'s'} · <strong>${byClient.length}</strong> client${byClient.length===1?'':'s'}</div>
    <div style=${{border:'1px solid var(--bd)',borderRadius:10,overflow:'hidden',background:'var(--surface)'}}>
      <table style=${{width:'100%',borderCollapse:'collapse',fontSize:13}}>
        <thead><tr style=${{background:'var(--bg2)',color:'var(--t3)',fontSize:11,letterSpacing:'.05em',textTransform:'uppercase',fontWeight:500}}>
          <th style=${{padding:'10px 12px',textAlign:'left'}}>Client</th>
          <th style=${{padding:'10px 12px',textAlign:'right'}}>Outstanding</th>
          <th style=${{padding:'10px 12px',textAlign:'right'}}>Oldest</th>
          <th style=${{padding:'10px 12px',textAlign:'right'}}>Invoices</th>
        </tr></thead>
        <tbody>
          ${byClient.map(g=>h`<tr key=${g.client?.id||'_'} style=${{borderTop:'1px solid var(--bd)'}}>
            <td style=${{padding:'10px 12px',color:'var(--t1)',fontWeight:500}}>${g.client?.name||g.rows[0]?.client_snapshot?.name||h`<em style=${{color:'var(--t3)'}}>missing client</em>`}</td>
            <td style=${{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums',fontWeight:600,color:g.oldest>60?'#DC2626':g.oldest>30?'#B45309':'var(--t1)'}}>₹${fmtINR(g.total,false)}</td>
            <td style=${{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums',color:g.oldest>60?'#DC2626':g.oldest>30?'#B45309':'var(--t3)',fontSize:12}}>${g.oldest===0?'—':g.oldest+' days'}</td>
            <td style=${{padding:'10px 12px',textAlign:'right',color:'var(--t2)'}}>${g.rows.length}</td>
          </tr>
          ${g.rows.map(r=>h`<tr key=${r.id} onClick=${()=>onOpen(r)} style=${{cursor:'pointer',background:'var(--bg)'}}>
            <td style=${{padding:'6px 12px 6px 28px',fontSize:12,color:'var(--t3)'}}>${r.invoice_number} · ${r.period_label||fmtMonthYear(r.period_start)}</td>
            <td style=${{padding:'6px 12px',textAlign:'right',fontSize:12,fontVariantNumeric:'tabular-nums',color:'var(--t2)'}}>₹${fmtINR(r.balance,false)}</td>
            <td style=${{padding:'6px 12px',textAlign:'right',fontSize:11,color:'var(--t3)'}}>${r.days_overdue===0?h`<span style=${{color:'var(--t3)'}}>not due</span>`:h`<span style=${{color:r.days_overdue>60?'#DC2626':r.days_overdue>30?'#B45309':'var(--t2)'}}>${r.days_overdue}d overdue</span>`}</td>
            <td style=${{padding:'6px 12px',textAlign:'right',fontSize:11,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em'}}>${r.status}</td>
          </tr>`)}`)}
        </tbody>
      </table>
    </div>
  </div>`;
}

    // ── IncomeReport ──
function IncomeReport({invoices,clients,showToast,canEdit=true}){
  const[year,setYear]=useState(()=>new Date().getFullYear());
  const[expenses,setExpenses]=useState([]);
  const[expLoading,setExpLoading]=useState(true);
  const[expErr,setExpErr]=useState('');
  const[editing,setEditing]=useState(null); // expense row being edited, or {} for "new"
  const[copyOpen,setCopyOpen]=useState(false);
  const loadExpenses=()=>{
    setExpLoading(true);setExpErr('');
    rpcCall('exp_list',{p_limit:5000})
      .then(rows=>setExpenses(rows||[]))
      .catch(e=>setExpErr(e?.message||'Failed to load expenses'))
      .finally(()=>setExpLoading(false));
  };
  useEffect(loadExpenses,[]);

  // Cash-basis revenue: individual payment rows for the selected year, so a
  // June advance on a May invoice counts as JUNE revenue. Falls back to the
  // old paid_at/issued_on attribution if the range RPC isn't deployed yet.
  const[payments,setPayments]=useState(null); // null = unavailable → fallback
  useEffect(()=>{
    let alive=true;
    rpcCall('inv_payments_list_range',{p_from:`${year}-01-01`,p_to:`${year}-12-31`})
      .then(rows=>{if(alive)setPayments(Array.isArray(rows)?rows:null);})
      .catch(()=>{if(alive)setPayments(null);});
    return()=>{alive=false;};
  },[year]);

  const revenue=useMemo(()=>{
    const months=Array.from({length:12},()=>0);
    const byClient={};
    let total=0;
    const invById={};invoices.forEach(i=>{invById[i.id]=i;});
    const add=(amt,when,clientId)=>{
      if(!when||when.getFullYear()!==Number(year))return;
      months[when.getMonth()]+=amt;total+=amt;
      const c=clients[clientId];const name=c?.name||'(unknown client)';
      byClient[name]=(byClient[name]||0)+amt;
    };
    if(payments){
      // Preferred: real payment rows, attributed to paid_on.
      payments.forEach(p=>{
        if(p.deleted_at)return;
        const inv=invById[p.invoice_id];
        if(inv&&((inv.type||'invoice')!=='invoice'||inv.deleted_at||inv.status==='cancelled'||inv.status==='waived'))return;
        const amt=Number(p.amount)||0;if(amt<=0)return;
        add(amt,p.paid_on?new Date(p.paid_on):null,inv?.client_id||p.client_id);
      });
    }else{
      invoices.forEach(i=>{
        if((i.type||'invoice')!=='invoice')return;
        if(i.deleted_at||i.status==='cancelled'||i.status==='waived')return;
        const paid=Number(i.amount_paid)||0;
        if(paid<=0)return;
        add(paid,i.paid_at?new Date(i.paid_at):(i.issued_on?new Date(i.issued_on):null),i.client_id);
      });
    }
    // Credit notes (refunds) REDUCE revenue in the month they were issued.
    invoices.forEach(i=>{
      if(i.type!=='credit_note'||i.deleted_at||i.status==='cancelled')return;
      const amt=Number(i.amount)||0;if(amt<=0)return;
      add(-amt,i.paid_at?new Date(i.paid_at):(i.issued_on?new Date(i.issued_on):null),i.client_id);
    });
    const clientRows=Object.entries(byClient).map(([name,sum])=>({name,sum})).sort((a,b)=>b.sum-a.sum);
    return{months,total,clientRows};
  },[invoices,clients,year,payments]);

  const expensesByMonth=useMemo(()=>{
    const months=Array.from({length:12},()=>0);
    const byCategory={};
    let total=0;
    expenses.forEach(e=>{
      if(!e.expense_date)return;
      const d=new Date(e.expense_date);
      if(d.getFullYear()!==Number(year))return;
      const amt=Number(e.amount)||0;
      months[d.getMonth()]+=amt;total+=amt;
      byCategory[e.category||'Other']=(byCategory[e.category||'Other']||0)+amt;
    });
    const catRows=Object.entries(byCategory).map(([name,sum])=>({name,sum})).sort((a,b)=>b.sum-a.sum);
    return{months,total,catRows};
  },[expenses,year]);

  const yearExpenses=useMemo(()=>expenses.filter(e=>e.expense_date&&new Date(e.expense_date).getFullYear()===Number(year)).sort((a,b)=>new Date(b.expense_date)-new Date(a.expense_date)),[expenses,year]);
  const monthsWithExp=useMemo(()=>{const s=new Set();expenses.forEach(e=>{if(e.expense_date){const d=new Date(e.expense_date);s.add(d.getFullYear()+'-'+d.getMonth());}});return[...s].map(k=>{const[y,m]=k.split('-').map(Number);return{y,m};}).sort((a,b)=>(b.y-a.y)||(b.m-a.m));},[expenses]);

  const yearOpts=useMemo(()=>{const ys=new Set([new Date().getFullYear(),Number(year)]);invoices.forEach(i=>{const d=i.paid_at||i.issued_on||i.period_start;if(d)ys.add(new Date(d).getFullYear());});expenses.forEach(e=>{if(e.expense_date)ys.add(new Date(e.expense_date).getFullYear());});return[...ys].sort((a,b)=>b-a);},[invoices,expenses,year]);
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const peak=Math.max(...revenue.months,...expensesByMonth.months,1);
  const net=revenue.total-expensesByMonth.total;

  const onSaved=()=>{setEditing(null);loadExpenses();showToast?.('Expense saved');};
  const onDeleted=async(row)=>{
    if(!confirm(`Delete ₹${fmtINR(row.amount,false)} expense (${row.category})?`))return;
    try{await rpcCall('exp_delete',{p_id:row.id});loadExpenses();showToast?.('Expense deleted');}
    catch(e){showToast?.('Delete failed');}
  };
  const onCopied=(rows)=>{setCopyOpen(false);loadExpenses();showToast?.(rows&&rows.length?`Copied ${rows.length} expense${rows.length===1?'':'s'}`:'Nothing new to copy');};

  return h`<div>
    <div style=${{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:18,gap:14,flexWrap:'wrap'}}>
      <div>
        <div style=${{fontSize:11,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',fontWeight:500}}>Profit and loss · ${year}</div>
        <div style=${{fontSize:13,color:'var(--t2)',marginTop:4}}>Cash-basis: revenue lands in the month each payment was received, credit notes reduce it, minus company expenses you log below.</div>
      </div>
      <select class="fi fi-select" value=${year} onChange=${e=>setYear(Number(e.target.value))} style=${{width:100}}>${yearOpts.map(y=>h`<option key=${y} value=${y}>${y}</option>`)}</select>
    </div>

    <div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginBottom:18}}>
      <div class="crd" style=${{padding:'14px 16px'}}>
        <div style=${{fontSize:11,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',fontWeight:500}}>Revenue</div>
        <div style=${{fontSize:22,fontWeight:600,color:'var(--t1)',marginTop:6,fontVariantNumeric:'tabular-nums'}}>₹${fmtINR(revenue.total,false)}</div>
        <div style=${{fontSize:11.5,color:'var(--t3)',marginTop:3}}>collected from clients</div>
      </div>
      <div class="crd" style=${{padding:'14px 16px'}}>
        <div style=${{fontSize:11,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',fontWeight:500}}>Expenses</div>
        <div style=${{fontSize:22,fontWeight:600,color:'var(--t1)',marginTop:6,fontVariantNumeric:'tabular-nums'}}>₹${fmtINR(expensesByMonth.total,false)}</div>
        <div style=${{fontSize:11.5,color:'var(--t3)',marginTop:3}}>${yearExpenses.length} entr${yearExpenses.length===1?'y':'ies'}</div>
      </div>
      <div class="crd" style=${{padding:'14px 16px',background:net>=0?'rgba(21,128,61,.06)':'var(--red-bg)',borderColor:net>=0?'rgba(21,128,61,.2)':'rgba(220,38,38,.2)'}}>
        <div style=${{fontSize:11,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',fontWeight:500}}>Net P&L</div>
        <div style=${{fontSize:22,fontWeight:600,color:net>=0?'#15803D':'var(--red)',marginTop:6,fontVariantNumeric:'tabular-nums'}}>${net>=0?'':'−'}₹${fmtINR(Math.abs(net),false)}</div>
        <div style=${{fontSize:11.5,color:'var(--t3)',marginTop:3}}>${revenue.total>0?Math.round(net/revenue.total*100):0}% margin</div>
      </div>
    </div>

    <div style=${{padding:'18px 18px 14px',border:'1px solid var(--bd)',borderRadius:10,background:'var(--surface)',marginBottom:24}}>
      <div style=${{display:'flex',alignItems:'center',gap:14,marginBottom:14,fontSize:11.5,color:'var(--t2)'}}>
        <div style=${{display:'flex',alignItems:'center',gap:6}}><span style=${{display:'inline-block',width:10,height:10,borderRadius:2,background:'linear-gradient(180deg, #FF66F5 0%, #ff00ee 100%)'}}></span>Revenue</div>
        <div style=${{display:'flex',alignItems:'center',gap:6}}><span style=${{display:'inline-block',width:10,height:10,borderRadius:2,background:'var(--t3)'}}></span>Expenses</div>
      </div>
      <div style=${{display:'grid',gridTemplateColumns:'repeat(12,1fr)',gap:6,alignItems:'end',height:140,marginBottom:6}}>
        ${MONTHS.map((mLb,m)=>{const r=Math.max(0,revenue.months[m]);const ex=expensesByMonth.months[m];return h`<div key=${m} style=${{display:'flex',gap:2,alignItems:'flex-end',justifyContent:'center',height:'100%',position:'relative'}} title=${mLb+' · revenue ₹'+fmtINR(revenue.months[m],false)+' · expenses ₹'+fmtINR(ex,false)}>
          <div style=${{flex:1,background:r>0?'linear-gradient(180deg, #FF66F5 0%, #ff00ee 100%)':'var(--bg2)',height:Math.round(r/peak*100)+'%',minHeight:r>0?4:1,borderRadius:'3px 3px 0 0'}}></div>
          <div style=${{flex:1,background:ex>0?'var(--t3)':'var(--bg2)',height:Math.round(ex/peak*100)+'%',minHeight:ex>0?4:1,borderRadius:'3px 3px 0 0',opacity:.7}}></div>
        </div>`;})}
      </div>
      <div style=${{display:'grid',gridTemplateColumns:'repeat(12,1fr)',gap:6,fontSize:10,color:'var(--t3)',textAlign:'center',textTransform:'uppercase',letterSpacing:'.04em',fontWeight:500}}>
        ${MONTHS.map(m=>h`<div key=${m}>${m}</div>`)}
      </div>
    </div>

    <div style=${{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:12,gap:10,flexWrap:'wrap'}}>
      <div>
        <div style=${{fontSize:14,fontWeight:600,color:'var(--t1)'}}>Company expenses · ${year}</div>
        <div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>Track salaries, rent, software, etc. — anything that eats into profit.</div>
      </div>
      <div style=${{display:'flex',gap:8}}>
        ${canEdit&&monthsWithExp.length>0&&h`<button class="btn-sec" style=${{padding:'7px 12px',fontSize:12}} onClick=${()=>setCopyOpen(true)}><i class="ti ti-copy"></i>Copy from a month</button>`}
        ${canEdit&&h`<button class="btn-pri" style=${{padding:'7px 14px',fontSize:12}} onClick=${()=>setEditing({})}><i class="ti ti-plus"></i>Add expense</button>`}
      </div>
    </div>

    ${expErr&&h`<div class="err"><i class="ti ti-alert-circle"></i>${expErr}</div>`}
    ${expLoading?h`<div style=${{padding:24,textAlign:'center',color:'var(--t3)',fontSize:13}}>Loading expenses…</div>`
      :yearExpenses.length===0?h`<div style=${{padding:'36px 24px',textAlign:'center',color:'var(--t3)',fontSize:13,border:'1px dashed var(--bd)',borderRadius:10,marginBottom:24}}>
        <i class="ti ti-receipt-tax" style=${{fontSize:32,marginBottom:10,display:'block'}}></i>
        ${canEdit?h`No expenses logged for ${year}. Click <strong>Add expense</strong> to record your first.`:h`No expenses logged for ${year}.`}
      </div>`
      :h`<div style=${{border:'1px solid var(--bd)',borderRadius:10,overflow:'hidden',background:'var(--surface)',marginBottom:24}}>
        <table style=${{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style=${{background:'var(--bg2)',color:'var(--t3)',fontSize:11,letterSpacing:'.05em',textTransform:'uppercase',fontWeight:500}}>
            <th style=${{padding:'10px 12px',textAlign:'left'}}>Date</th>
            <th style=${{padding:'10px 12px',textAlign:'left'}}>Category</th>
            <th style=${{padding:'10px 12px',textAlign:'left'}}>Vendor</th>
            <th style=${{padding:'10px 12px',textAlign:'left'}}>Notes</th>
            <th style=${{padding:'10px 12px',textAlign:'right'}}>Amount</th>
            <th style=${{padding:'10px 12px',width:68,textAlign:'right'}}></th>
          </tr></thead>
          <tbody>
            ${yearExpenses.map(e=>h`<tr key=${e.id} onClick=${()=>{if(canEdit)setEditing(e);}} style=${{cursor:canEdit?'pointer':'default',borderTop:'1px solid var(--bd)'}}>
              <td style=${{padding:'10px 12px',color:'var(--t2)',fontSize:12,whiteSpace:'nowrap'}}>${fmt(e.expense_date)}</td>
              <td style=${{padding:'10px 12px',color:'var(--t1)',fontWeight:500}}>${e.category||'Other'}</td>
              <td style=${{padding:'10px 12px',color:'var(--t2)'}}>${e.vendor||h`<span style=${{color:'var(--t3)'}}>—</span>`}</td>
              <td style=${{padding:'10px 12px',color:'var(--t2)',fontSize:12,maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>${e.notes||h`<span style=${{color:'var(--t3)'}}>—</span>`}</td>
              <td style=${{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums',fontWeight:500,color:'var(--t1)'}}>₹${fmtINR(e.amount,false)}</td>
              <td style=${{padding:'10px 12px',textAlign:'right'}} onClick=${ev=>ev.stopPropagation()}>
                ${canEdit&&h`<button class="icon-btn" style=${{padding:5}} onClick=${()=>onDeleted(e)} title="Delete"><i class="ti ti-trash" style=${{color:'var(--red)',fontSize:14}}></i></button>`}
              </td>
            </tr>`)}
            <tr style=${{borderTop:'2px solid var(--bd)',background:'var(--bg2)',fontWeight:600}}>
              <td colSpan="4" style=${{padding:'10px 12px',color:'var(--t2)',textTransform:'uppercase',fontSize:11,letterSpacing:'.05em'}}>Total ${year}</td>
              <td style=${{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums',color:'var(--t1)'}}>₹${fmtINR(expensesByMonth.total,false)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>`}

    ${expensesByMonth.catRows.length>0&&h`<div style=${{marginBottom:24}}>
      <div style=${{fontSize:14,fontWeight:600,color:'var(--t1)',marginBottom:10}}>Expenses by category</div>
      <div style=${{border:'1px solid var(--bd)',borderRadius:10,overflow:'hidden',background:'var(--surface)'}}>
        <table style=${{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style=${{background:'var(--bg2)',color:'var(--t3)',fontSize:11,letterSpacing:'.05em',textTransform:'uppercase',fontWeight:500}}>
            <th style=${{padding:'10px 12px',textAlign:'left'}}>Category</th>
            <th style=${{padding:'10px 12px',textAlign:'right'}}>Spent</th>
            <th style=${{padding:'10px 12px',textAlign:'right'}}>Share</th>
          </tr></thead>
          <tbody>
            ${expensesByMonth.catRows.map(r=>h`<tr key=${r.name} style=${{borderTop:'1px solid var(--bd)'}}>
              <td style=${{padding:'10px 12px',color:'var(--t1)',fontWeight:500}}>${r.name}</td>
              <td style=${{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums',fontWeight:500,color:'var(--t1)'}}>₹${fmtINR(r.sum,false)}</td>
              <td style=${{padding:'10px 12px',textAlign:'right',fontSize:12,color:'var(--t2)'}}>${expensesByMonth.total>0?Math.round(r.sum/expensesByMonth.total*100):0}%</td>
            </tr>`)}
          </tbody>
        </table>
      </div>
    </div>`}

    ${revenue.clientRows.length>0&&h`<div>
      <div style=${{fontSize:14,fontWeight:600,color:'var(--t1)',marginBottom:10}}>Revenue by client</div>
      <div style=${{border:'1px solid var(--bd)',borderRadius:10,overflow:'hidden',background:'var(--surface)'}}>
        <table style=${{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style=${{background:'var(--bg2)',color:'var(--t3)',fontSize:11,letterSpacing:'.05em',textTransform:'uppercase',fontWeight:500}}>
            <th style=${{padding:'10px 12px',textAlign:'left'}}>Client</th>
            <th style=${{padding:'10px 12px',textAlign:'right'}}>Collected</th>
            <th style=${{padding:'10px 12px',textAlign:'right'}}>Share</th>
          </tr></thead>
          <tbody>
            ${revenue.clientRows.map(r=>h`<tr key=${r.name} style=${{borderTop:'1px solid var(--bd)'}}>
              <td style=${{padding:'10px 12px',color:'var(--t1)',fontWeight:500}}>${r.name}</td>
              <td style=${{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums',fontWeight:500,color:'var(--t1)'}}>₹${fmtINR(r.sum,false)}</td>
              <td style=${{padding:'10px 12px',textAlign:'right',fontSize:12,color:'var(--t2)'}}>${revenue.total>0?Math.round(r.sum/revenue.total*100):0}%</td>
            </tr>`)}
          </tbody>
        </table>
      </div>
    </div>`}

    ${editing&&h`<${ExpenseEditor} expense=${editing} onClose=${()=>setEditing(null)} onSaved=${onSaved} showToast=${showToast}/>`}
    ${copyOpen&&h`<${ExpenseCopyModal} monthsWithExp=${monthsWithExp} onClose=${()=>setCopyOpen(false)} onCopied=${onCopied} showToast=${showToast}/>`}
  </div>`;
}

    // ── ExpenseEditor ──
function ExpenseEditor({expense,onClose,onSaved,showToast}){
  const isNew=!expense?.id;
  const[date,setDate]=useState(expense?.expense_date||new Date().toISOString().slice(0,10));
  const[category,setCategory]=useState(expense?.category||'Salaries');
  const[amount,setAmount]=useState(expense?.amount==null?'':String(expense.amount));
  const[vendor,setVendor]=useState(expense?.vendor||'');
  const[notes,setNotes]=useState(expense?.notes||'');
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState('');
  const save=async()=>{
    const amt=Number(amount);
    if(!amt||amt<=0){setErr('Amount must be greater than zero');return;}
    if(!date){setErr('Pick a date');return;}
    setSaving(true);setErr('');
    try{
      const payload={expense_date:date,category,amount:amt,vendor:vendor.trim()||null,notes:notes.trim()||null};
      if(isNew){await rpcCall('exp_create',{p_data:payload});}
      else{await rpcCall('exp_update',{p_id:expense.id,p_data:payload});}
      onSaved();
    }catch(e){setErr(e?.message||'Save failed');setSaving(false);}
  };
  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose();}}>
    <div class="modal-box" style=${{maxWidth:480}}>
      <div class="modal-head">
        <div><div style=${{fontSize:16,fontWeight:600}}>${isNew?'Add expense':'Edit expense'}</div><div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>${isNew?'Log a company spend':'Update this expense'}</div></div>
        <button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        ${err&&h`<div class="err" style=${{marginBottom:12}}><i class="ti ti-alert-circle"></i>${err}</div>`}
        <div style=${{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div class="fi-group"><div class="fi-lbl">Date</div><input class="fi" type="date" value=${date} onInput=${e=>setDate(e.target.value)}/></div>
          <div class="fi-group"><div class="fi-lbl">Category</div><select class="fi fi-select" value=${category} onChange=${e=>setCategory(e.target.value)}>${EXPENSE_CATEGORIES.map(c=>h`<option key=${c} value=${c}>${c}</option>`)}</select></div>
        </div>
        <div class="fi-group" style=${{marginBottom:12}}>
          <div class="fi-lbl">Amount (₹)</div>
          <input class="fi" type="number" min="0" step="0.01" value=${amount} onInput=${e=>setAmount(e.target.value)} placeholder="0.00" autoFocus=${isNew}/>
        </div>
        <div class="fi-group" style=${{marginBottom:12}}>
          <div class="fi-lbl">Vendor / paid to <span style=${{color:'var(--t3)',fontWeight:400}}>· optional</span></div>
          <input class="fi" type="text" value=${vendor} onInput=${e=>setVendor(e.target.value)} placeholder="e.g. Razorpay, AWS, landlord"/>
        </div>
        <div class="fi-group">
          <div class="fi-lbl">Notes <span style=${{color:'var(--t3)',fontWeight:400}}>· optional</span></div>
          <textarea class="fi" rows="2" value=${notes} onInput=${e=>setNotes(e.target.value)} placeholder="Anything to remember about this expense"></textarea>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-sec" onClick=${onClose} disabled=${saving}>Cancel</button>
        <button class="btn-pri" onClick=${save} disabled=${saving}>${saving?'Saving…':(isNew?'Add expense':'Save changes')}</button>
      </div>
    </div>
  </div>`;
}

    // ── ExpenseCopyModal ──
function ExpenseCopyModal({monthsWithExp,onClose,onCopied,showToast}){
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now=new Date();
  const[fromKey,setFromKey]=useState(()=>{
    // default to the most recent month that has expenses AND is not the current month
    const candidate=monthsWithExp.find(({y,m})=>!(y===now.getFullYear()&&m===now.getMonth()));
    return candidate?(candidate.y+'-'+candidate.m):(monthsWithExp[0]?(monthsWithExp[0].y+'-'+monthsWithExp[0].m):'');
  });
  const[toY,setToY]=useState(now.getFullYear());
  const[toM,setToM]=useState(now.getMonth());
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState('');
  const run=async()=>{
    if(!fromKey){setErr('Pick a source month');return;}
    setBusy(true);setErr('');
    try{
      const[fy,fm]=fromKey.split('-').map(Number);
      const rows=await rpcCall('exp_copy_month',{p_from_year:fy,p_from_month:fm+1,p_to_year:Number(toY),p_to_month:Number(toM)+1});
      onCopied(rows);
    }catch(e){setErr(e?.message||'Copy failed');setBusy(false);}
  };
  const yearOpts=Array.from(new Set([now.getFullYear(),now.getFullYear()-1,...monthsWithExp.map(x=>x.y)])).sort((a,b)=>b-a);
  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose();}}>
    <div class="modal-box" style=${{maxWidth:440}}>
      <div class="modal-head">
        <div><div style=${{fontSize:16,fontWeight:600}}>Copy expenses</div><div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>Clone every expense from one month into another</div></div>
        <button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body">
        ${err&&h`<div class="err" style=${{marginBottom:12}}><i class="ti ti-alert-circle"></i>${err}</div>`}
        <div class="fi-group" style=${{marginBottom:14}}>
          <div class="fi-lbl">Copy from</div>
          <select class="fi fi-select" value=${fromKey} onChange=${e=>setFromKey(e.target.value)}>
            ${monthsWithExp.map(({y,m})=>h`<option key=${y+'-'+m} value=${y+'-'+m}>${MONTHS[m]} ${y}</option>`)}
          </select>
        </div>
        <div class="fi-group" style=${{marginBottom:12}}>
          <div class="fi-lbl">Copy to</div>
          <div style=${{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <select class="fi fi-select" value=${toM} onChange=${e=>setToM(Number(e.target.value))}>${MONTHS.map((m,i)=>h`<option key=${m} value=${i}>${m}</option>`)}</select>
            <select class="fi fi-select" value=${toY} onChange=${e=>setToY(Number(e.target.value))}>${yearOpts.map(y=>h`<option key=${y} value=${y}>${y}</option>`)}</select>
          </div>
        </div>
        <div style=${{fontSize:12,color:'var(--t3)',lineHeight:1.6,padding:'10px 12px',background:'var(--bg2)',borderRadius:8}}>
          <i class="ti ti-info-circle" style=${{marginRight:4}}></i>Rows with the same category, vendor, amount and day-of-month already in the target month are skipped — safe to run twice.
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn-sec" onClick=${onClose} disabled=${busy}>Cancel</button>
        <button class="btn-pri" onClick=${run} disabled=${busy||!fromKey}>${busy?'Copying…':'Copy expenses'}</button>
      </div>
    </div>
  </div>`;
}

    // ── TaxReports ──
function TaxReports({invoices,clients,agency,showToast}){
  const now=new Date();
  const[month,setMonth]=useState(now.getMonth());
  const[year,setYear]=useState(now.getFullYear());
  const[bulkBusy,setBulkBusy]=useState(false);
  const filtered=useMemo(()=>{
    return invoices.filter(i=>{
      if(i.deleted_at||i.status==='cancelled'||i.status==='waived')return false;
      const d=i.issued_on?new Date(i.issued_on):(i.period_start?new Date(i.period_start):null);
      if(!d)return false;
      return d.getFullYear()===year&&d.getMonth()===month;
    });
  },[invoices,month,year]);
  const sections=useMemo(()=>{
    const b2b=[],b2cs=[],exp=[],cdnr=[];
    filtered.forEach(i=>{
      if(i.type==='credit_note'){cdnr.push(i);return;}
      if(i.supply_type==='EXPWOP'){exp.push(i);return;}
      if(i.supply_type==='B2B'||(i.client_snapshot&&i.client_snapshot.gstin)){b2b.push(i);return;}
      b2cs.push(i);
    });
    // Credit notes REDUCE the month's GST liability — sign every sum by type so
    // the header totals match what actually goes into GSTR-1 (invoices − CDNR).
    const sgn=(r)=>r.type==='credit_note'?-1:1;
    const taxable=filtered.reduce((s,r)=>s+sgn(r)*(Number(r.taxable_value)||0),0);
    return{b2b,b2cs,exp,cdnr,
      total:taxable,taxable,
      tax:filtered.reduce((s,r)=>s+sgn(r)*((Number(r.cgst_amount)||0)+(Number(r.sgst_amount)||0)+(Number(r.igst_amount)||0)),0)};
  },[filtered]);
  const downloadCSV=()=>{
    const fmtNum=(n)=>(Number(n)||0).toFixed(2);
    const csvDate=(d)=>{if(!d)return'';const x=new Date(d);return String(x.getDate()).padStart(2,'0')+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+x.getFullYear();};
    const esc=(s)=>{const v=String(s==null?'':s);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
    const lines=[];
    lines.push(['Section','GSTIN/UIN of Recipient','Recipient Name','Invoice Number','Invoice Date','Invoice Value','Place Of Supply','Reverse Charge','Invoice Type','Rate','Taxable Value','IGST','CGST','SGST','Cess','Notes'].map(esc).join(','));
    const writeRow=(section,i)=>{
      const c=i.client_snapshot||{};
      lines.push([section,c.gstin||'',c.name||'',i.invoice_number,csvDate(i.issued_on||i.period_start),fmtNum(i.amount),c.place_of_supply||c.state||'','N',i.supply_type||'',fmtNum(i.gst_rate),fmtNum(i.taxable_value),fmtNum(i.igst_amount),fmtNum(i.cgst_amount),fmtNum(i.sgst_amount),'0.00',i.type==='credit_note'?'Credit Note':''].map(esc).join(','));
    };
    sections.b2b.forEach(i=>writeRow('B2B',i));
    sections.b2cs.forEach(i=>writeRow('B2CS',i));
    sections.exp.forEach(i=>writeRow('EXP',i));
    sections.cdnr.forEach(i=>writeRow('CDNR',i));
    const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='GSTR1_'+year+'_'+String(month+1).padStart(2,'0')+'.csv';a.click();
    URL.revokeObjectURL(url);
    showToast?.('GSTR-1 CSV downloaded');
  };
  const downloadTDS=()=>{
    const fmtNum=(n)=>(Number(n)||0).toFixed(2);
    const esc=(s)=>{const v=String(s==null?'':s);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
    const csvDate=(d)=>{if(!d)return'';const x=new Date(d);return String(x.getDate()).padStart(2,'0')+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+x.getFullYear();};
    const lines=[['Invoice','Date','Client','PAN','GSTIN','Invoice Total','TDS Rate %','TDS Deducted','Net Receivable','Status'].map(esc).join(',')];
    filtered.filter(i=>Number(i.tds_amount)>0).forEach(i=>{
      const c=i.client_snapshot||{};
      lines.push([i.invoice_number,csvDate(i.issued_on),c.name||'',c.pan||'',c.gstin||'',fmtNum(i.amount),fmtNum(i.tds_rate),fmtNum(i.tds_amount),fmtNum(Number(i.amount)-Number(i.tds_amount||0)),i.status].map(esc).join(','));
    });
    const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='TDS_'+year+'_'+String(month+1).padStart(2,'0')+'.csv';a.click();
    URL.revokeObjectURL(url);
    showToast?.('TDS register downloaded');
  };
  // Every invoice for the month as one multi-page PDF — what the CA actually
  // wants at filing time, alongside the GSTR-1 CSV. Renders InvoiceTemplate
  // off-screen (the viewer modal is never opened) and lets html2pdf paginate
  // on the .html2pdf__page-break markers, one invoice per A4 page.
  const downloadAllPDF=async()=>{
    if(!filtered.length)return;
    let mount=null,root=null;
    setBulkBusy(true);
    try{
      if(!window.html2pdf){
        await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
      }
      // Oldest-first so the PDF reads in the same order as the CSV rows.
      const list=[...filtered].sort((a,b)=>{
        const da=new Date(a.issued_on||a.period_start||0),db=new Date(b.issued_on||b.period_start||0);
        return da-db||String(a.invoice_number||'').localeCompare(String(b.invoice_number||''));
      });
      mount=document.createElement('div');
      mount.style.cssText='position:fixed;left:-99999px;top:0;width:210mm;background:#fff;z-index:-1;pointer-events:none';
      document.body.appendChild(mount);
      root=createRoot(mount);
      root.render(h`<div>${list.map((inv,idx)=>h`<div key=${inv.id}>
        ${idx>0&&h`<div class="html2pdf__page-break"></div>`}
        <${InvoiceTemplate} invoice=${inv}/>
      </div>`)}</div>`);
      // createRoot renders concurrently — wait until every .inv-doc has painted
      // rather than guessing a timeout, or html2canvas captures a blank page.
      const ready=await new Promise(res=>{
        let tries=0;
        const poll=()=>{
          if(mount.querySelectorAll('.inv-doc').length>=list.length)return res(true);
          if(++tries>100)return res(false);   // ~5s
          setTimeout(poll,50);
        };
        poll();
      });
      if(!ready)throw new Error('render_timeout');
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      await window.html2pdf().from(mount).set({
        margin:0,
        filename:'Invoices_'+year+'_'+String(month+1).padStart(2,'0')+'.pdf',
        image:{type:'jpeg',quality:0.92},
        // scale 1.6 not 2 — a 50-invoice month at 2x can exhaust canvas memory.
        html2canvas:{scale:1.6,useCORS:true,backgroundColor:'#ffffff'},
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},
        pagebreak:{mode:['css','legacy'],before:'.html2pdf__page-break'},
      }).save();
      showToast?.(list.length+' invoice'+(list.length===1?'':'s')+' downloaded');
    }catch(e){
      console.error('[bulk-pdf] failed',e);
      showToast?.('Could not generate the invoice PDF');
    }finally{
      try{root?.unmount();}catch(_){/* already gone */}
      if(mount&&mount.parentNode)mount.parentNode.removeChild(mount);
      setBulkBusy(false);
    }
  };
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const yearOpts=useMemo(()=>{const ys=new Set([new Date().getFullYear()]);invoices.forEach(i=>{const d=i.issued_on||i.period_start;if(d)ys.add(new Date(d).getFullYear());});return[...ys].sort((a,b)=>b-a);},[invoices]);
  const tdsCount=filtered.filter(i=>Number(i.tds_amount)>0).length;
  return h`<div>
    <div style=${{display:'flex',alignItems:'center',gap:10,marginBottom:18,flexWrap:'wrap'}}>
      <select class="fi fi-select" value=${month} onChange=${e=>setMonth(Number(e.target.value))} style=${{width:160}}>${MONTHS.map((m,i)=>h`<option key=${m} value=${i}>${m}</option>`)}</select>
      <select class="fi fi-select" value=${year} onChange=${e=>setYear(Number(e.target.value))} style=${{width:100}}>${yearOpts.map(y=>h`<option key=${y} value=${y}>${y}</option>`)}</select>
      <div style=${{flex:1}}></div>
      <div style=${{fontSize:13,color:'var(--t2)'}}><strong style=${{color:'var(--t1)'}}>${filtered.length}</strong> invoice${filtered.length===1?'':'s'} · taxable <strong style=${{color:'var(--t1)',fontVariantNumeric:'tabular-nums'}}>₹${fmtINR(sections.taxable,false)}</strong> · tax <strong style=${{color:'var(--t1)',fontVariantNumeric:'tabular-nums'}}>₹${fmtINR(sections.tax,false)}</strong></div>
    </div>

    <div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:18}}>
      <div class="crd" style=${{padding:'12px 14px'}}>
        <div style=${{fontSize:10.5,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',fontWeight:500}}>B2B</div>
        <div style=${{fontSize:20,fontWeight:600,color:'var(--t1)',marginTop:6}}>${sections.b2b.length}</div>
        <div style=${{fontSize:11,color:'var(--t3)',marginTop:2}}>with GSTIN — counts for B2B in GSTR-1</div>
      </div>
      <div class="crd" style=${{padding:'12px 14px'}}>
        <div style=${{fontSize:10.5,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',fontWeight:500}}>B2C</div>
        <div style=${{fontSize:20,fontWeight:600,color:'var(--t1)',marginTop:6}}>${sections.b2cs.length}</div>
        <div style=${{fontSize:11,color:'var(--t3)',marginTop:2}}>unregistered — B2CS section</div>
      </div>
      <div class="crd" style=${{padding:'12px 14px'}}>
        <div style=${{fontSize:10.5,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',fontWeight:500}}>Exports</div>
        <div style=${{fontSize:20,fontWeight:600,color:'var(--t1)',marginTop:6}}>${sections.exp.length}</div>
        <div style=${{fontSize:11,color:'var(--t3)',marginTop:2}}>EXPWOP — zero-rated</div>
      </div>
      <div class="crd" style=${{padding:'12px 14px'}}>
        <div style=${{fontSize:10.5,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',fontWeight:500}}>Credit notes</div>
        <div style=${{fontSize:20,fontWeight:600,color:'var(--t1)',marginTop:6}}>${sections.cdnr.length}</div>
        <div style=${{fontSize:11,color:'var(--t3)',marginTop:2}}>CDNR section</div>
      </div>
    </div>

    <div style=${{display:'flex',gap:10,flexWrap:'wrap',marginBottom:18}}>
      <button class="btn-pri" onClick=${downloadCSV} disabled=${filtered.length===0}><i class="ti ti-file-download"></i>Download GSTR-1 CSV</button>
      <button class="btn-sec" onClick=${downloadAllPDF} disabled=${filtered.length===0||bulkBusy}><i class=${'ti '+(bulkBusy?'ti-loader-2 spinner':'ti-files')}></i>${bulkBusy?'Building PDF…':'All invoices PDF ('+filtered.length+')'}</button>
      <button class="btn-sec" onClick=${downloadTDS} disabled=${tdsCount===0}><i class="ti ti-file-spreadsheet"></i>TDS register (${tdsCount})</button>
    </div>

    <div style=${{padding:'14px 16px',background:'rgba(59,130,246,.06)',border:'1px solid rgba(59,130,246,.2)',borderRadius:8,fontSize:12.5,color:'var(--t2)',lineHeight:1.6}}>
      <div style=${{fontWeight:600,color:'var(--t1)',marginBottom:6}}>How to use GSTR-1 CSV</div>
      1. Click <strong>Download GSTR-1 CSV</strong> above.<br/>
      2. Open the file in Excel/Google Sheets to verify rows look right.<br/>
      3. Log in to <a href="https://www.gst.gov.in" target="_blank" style=${{color:'var(--blue)'}}>gst.gov.in</a> → Services → Returns → GSTR-1 → use the offline tool or manually enter values per section (B2B / B2CS / EXP / CDNR).<br/>
      4. The CSV has all data your accountant needs — taxable value, IGST/CGST/SGST split, place of supply.<br/>
      5. <strong>All invoices PDF</strong> gives your CA every invoice for the month as one file, one invoice per page — the supporting document set for the return.
    </div>
  </div>`;
}

    // ── BillingApp ──
// canEdit=false is the accounts_head (read-only finance) view: everything is
// visible and exportable, nothing is mutable. The server enforces the same
// split — reads go through _require_billing_read_role, writes through
// _require_billing_role (migration 084) — so this is affordance, not security.
function BillingApp({clients,currentUser,showToast,canEdit=true}){
  const[invoices,setInvoices]=useState([]);
  const[agency,setAgency]=useState(null);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState('');
  const[viewing,setViewing]=useState(null);
  const[editing,setEditing]=useState(null);
  const[editorClient,setEditorClient]=useState(null);
  const[picker,setPicker]=useState(false);
  const[importer,setImporter]=useState(false);
  const[recordingFor,setRecordingFor]=useState(null);
  // Filters
  const[statusF,setStatusF]=useState('all');
  const[clientF,setClientF]=useState('all');
  const[searchF,setSearchF]=useState('');
  const[period,setPeriod]=useState(()=>{const d=new Date();return{y:d.getFullYear(),m:'all'};});
  const load=()=>{
    setLoading(true);setErr('');
    Promise.all([
      rpcCall('inv_list',{p_limit:500}),
      rpcCall('agency_settings_get'),
    ]).then(([rows,aRow])=>{setInvoices(rows||[]);setAgency(aRow||null);})
      .catch(e=>setErr(e?.message||'Failed to load'))
      .finally(()=>setLoading(false));
  };
  useEffect(load,[]);
  const clientMap=useMemo(()=>{const m={};clients.forEach(c=>{m[c.id]=c;});return m;},[clients]);

  const filtered=useMemo(()=>{
    return invoices.filter(i=>{
      if(statusF!=='all'&&i.status!==statusF)return false;
      if(clientF!=='all'&&String(i.client_id)!==String(clientF))return false;
      if(period.y){const py=i.period_start?new Date(i.period_start).getFullYear():null;if(py!==Number(period.y))return false;}
      if(period.m!=='all'){const pm=i.period_start?new Date(i.period_start).getMonth():null;if(pm!==Number(period.m))return false;}
      if(searchF){const q=searchF.toLowerCase();const c=clientMap[i.client_id];if(!String(i.invoice_number||'').toLowerCase().includes(q)&&!String(c?.name||'').toLowerCase().includes(q))return false;}
      return true;
    });
  },[invoices,statusF,clientF,period,searchF,clientMap]);

  // Summary tiles — outstanding + overdue across ALL invoices, not filtered.
  // Balance is net of TDS (the client legally withholds it), so the header
  // agrees with the Aging tab and the Statement of account.
  const totals=useMemo(()=>{
    let outstanding=0,overdueCount=0,overdueSum=0;
    invoices.forEach(i=>{
      const paid=Number(i.amount_paid)||0;
      const total=Number(i.amount)||0;
      const tds=Number(i.tds_amount)||0;
      const bal=total-paid-tds;
      if(i.deleted_at||i.status==='cancelled'||i.status==='waived')return;
      if(i.status==='due'||i.status==='overdue'||i.status==='partial'){outstanding+=bal;}
      if(i.status==='overdue'){overdueCount++;overdueSum+=bal;}
    });
    return{outstanding,overdueCount,overdueSum};
  },[invoices]);

  const openNewInvoice=(client)=>{setEditorClient(client);setEditing(null);setPicker(false);};
  const onSaved=(saved)=>{setEditorClient(null);load();showToast('Invoice created');if(saved)setViewing(saved);};
  const openEdit=(inv)=>{const c=clientMap[inv.client_id];if(!c){showToast('Client missing');return;}setViewing(null);setEditorClient(c);setEditing(inv);};
  const removeRow=async(inv,e)=>{e?.stopPropagation();if(!confirm(`Move invoice ${inv.invoice_number} to trash?`))return;try{await rpcCall('inv_soft_delete',{p_id:inv.id});logActivity({action:'delete',table_name:'invoices',record_id:String(inv.id),record_label:inv.invoice_number,changes:null});load();showToast('Deleted');}catch(e){showToast('Delete failed');}};

  const yearOpts=useMemo(()=>{const ys=new Set();invoices.forEach(i=>{if(i.period_start)ys.add(new Date(i.period_start).getFullYear());});ys.add(new Date().getFullYear());return[...ys].sort((a,b)=>b-a);},[invoices]);
  const STATUS_STYLE={paid:{col:'#15803D',bg:'#DCFCE7'},overdue:{col:'#DC2626',bg:'#FEE2E2'},due:{col:'#B45309',bg:'#FEF3C7'},partial:{col:'#1D4ED8',bg:'#DBEAFE'},waived:{col:'#6B7280',bg:'#F3F4F6'},cancelled:{col:'#6B7280',bg:'#F3F4F6'}};
  const STATUS_LIST=['all','due','overdue','partial','paid','waived','cancelled'];

  // Sub-view: 'invoices' (default list) | 'aging' | 'income' | 'reports'
  const[subView,setSubView]=useState('invoices');

  return h`<div>
    <div style=${{marginBottom:18,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
      <div>
        <div class="sec-title">Finance</div>
        <div style=${{fontSize:13,color:'var(--t2)',marginTop:4}}>Invoices, ageing, P&L and tax exports across all clients.</div>
      </div>
      <div style=${{display:'flex',gap:4,padding:4,background:'var(--bg2)',borderRadius:10,border:'1px solid var(--bd)'}}>
        ${[['invoices','Invoices','ti-list'],['aging','Aging','ti-clock-hour-4'],['income','P&L','ti-trending-up'],['reports','Tax & exports','ti-file-export']].map(([k,lb,ic])=>h`<button key=${k} class="btn-sec" style=${{padding:'6px 12px',fontSize:12,border:'none',background:subView===k?'var(--surface)':'transparent',color:subView===k?'var(--t1)':'var(--t2)',fontWeight:subView===k?600:500,boxShadow:subView===k?'var(--shadow-sm)':'none'}} onClick=${()=>setSubView(k)}><i class=${'ti '+ic} style=${{fontSize:13,marginRight:5}}></i>${lb}</button>`)}
      </div>
    </div>

    ${subView==='aging'&&h`<${AgingReport} invoices=${invoices} clients=${clientMap} onOpen=${(i)=>setViewing(i)}/>`}
    ${subView==='income'&&h`<${IncomeReport} invoices=${invoices} clients=${clientMap} showToast=${showToast} canEdit=${canEdit}/>`}
    ${subView==='reports'&&h`<${TaxReports} invoices=${invoices} clients=${clientMap} agency=${agency} showToast=${showToast}/>`}
    ${subView!=='invoices'?'':h`<div>

    <div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12,marginBottom:20}}>
      <div class="crd" style=${{padding:'14px 16px',background:'var(--amber-bg)',borderColor:'rgba(180,83,9,.2)'}}>
        <div style=${{fontSize:11,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',fontWeight:500}}>Outstanding</div>
        <div style=${{fontSize:22,fontWeight:600,color:'var(--amber)',marginTop:6,fontVariantNumeric:'tabular-nums'}}>₹${fmtINR(totals.outstanding,false)}</div>
        <div style=${{fontSize:11.5,color:'var(--t3)',marginTop:3}}>net of TDS · across all unpaid invoices</div>
      </div>
      <div class="crd" style=${{padding:'14px 16px',background:'var(--red-bg)',borderColor:'rgba(220,38,38,.2)'}}>
        <div style=${{fontSize:11,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.05em',fontWeight:500}}>Overdue</div>
        <div style=${{fontSize:22,fontWeight:600,color:'var(--red)',marginTop:6,fontVariantNumeric:'tabular-nums'}}>${totals.overdueCount}<span style=${{fontSize:13,color:'var(--t3)',fontWeight:400,marginLeft:6}}>· ₹${fmtINR(totals.overdueSum,false)}</span></div>
        <div style=${{fontSize:11.5,color:'var(--t3)',marginTop:3}}>past due date, needs chasing</div>
      </div>
    </div>

    <div style=${{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:14}}>
      <input class="fi" type="text" placeholder="Search invoice number or client…" value=${searchF} onInput=${e=>setSearchF(e.target.value)} style=${{flex:'1 1 240px',minWidth:200,maxWidth:360}}/>
      <select class="fi fi-select" value=${clientF} onChange=${e=>setClientF(e.target.value)} style=${{width:170}}>
        <option value="all">All clients</option>
        ${clients.map(c=>h`<option key=${c.id} value=${c.id}>${c.name}</option>`)}
      </select>
      <select class="fi fi-select" value=${period.y} onChange=${e=>setPeriod(p=>({...p,y:e.target.value}))} style=${{width:96}}>
        ${yearOpts.map(y=>h`<option key=${y} value=${y}>${y}</option>`)}
      </select>
      <select class="fi fi-select" value=${period.m} onChange=${e=>setPeriod(p=>({...p,m:e.target.value}))} style=${{width:130}}>
        <option value="all">All months</option>
        ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=>h`<option key=${m} value=${i}>${m}</option>`)}
      </select>
      <div style=${{flex:1}}></div>
      ${canEdit&&h`<button class="btn-sec" style=${{padding:'7px 14px',fontSize:12}} onClick=${()=>setImporter(true)}><i class="ti ti-file-import"></i>Import CSV</button>`}
      ${canEdit&&h`<button class="btn-pri" style=${{padding:'7px 14px',fontSize:12}} onClick=${()=>setPicker(true)}><i class="ti ti-plus"></i>New invoice</button>`}
    </div>

    <div style=${{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
      ${STATUS_LIST.map(s=>{const c=s==='all'?{col:'var(--t2)',bg:'var(--bg2)'}:STATUS_STYLE[s];return h`<button key=${s} class=${'fb'+(statusF===s?' on':'')} onClick=${()=>setStatusF(s)} style=${{fontSize:11.5,padding:'5px 11px',textTransform:'uppercase',letterSpacing:'.04em',color:statusF===s?'#fff':c.col,background:statusF===s?(c.col==='var(--t2)'?'var(--t1)':c.col):c.bg,borderColor:'transparent'}}>${s==='all'?'All':s}</button>`;})}
    </div>

    ${err&&h`<div class="err"><i class="ti ti-alert-circle"></i>${err}</div>`}
    ${loading?h`<div style=${{padding:24,textAlign:'center',color:'var(--t3)',fontSize:13}}>Loading invoices…</div>`
      :filtered.length===0?h`<div style=${{padding:'48px 24px',textAlign:'center',color:'var(--t3)',fontSize:13,border:'1px dashed var(--bd)',borderRadius:10}}>
        ${invoices.length===0?h`<div><i class="ti ti-receipt-off" style=${{fontSize:32,marginBottom:10,display:'block'}}></i>${canEdit?h`No invoices yet. Click <strong>Import CSV</strong> to bring in your historical data, or <strong>New invoice</strong> to create the first.`:'No invoices yet.'}</div>`:'No invoices match these filters.'}
      </div>`
      :h`<div style=${{border:'1px solid var(--bd)',borderRadius:10,overflow:'hidden',background:'var(--surface)'}}>
        <table style=${{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead><tr style=${{background:'var(--bg2)',color:'var(--t3)',fontSize:11,letterSpacing:'.05em',textTransform:'uppercase',fontWeight:500}}>
            <th style=${{padding:'10px 12px',textAlign:'left'}}>Invoice</th>
            <th style=${{padding:'10px 12px',textAlign:'left'}}>Client</th>
            <th style=${{padding:'10px 12px',textAlign:'left'}}>Period</th>
            <th style=${{padding:'10px 12px',textAlign:'left'}}>Issued</th>
            <th style=${{padding:'10px 12px',textAlign:'left'}}>Due</th>
            <th style=${{padding:'10px 12px',textAlign:'right'}}>Amount</th>
            <th style=${{padding:'10px 12px',textAlign:'left'}}>Status</th>
            <th style=${{padding:'10px 12px',width:78,textAlign:'right'}}></th>
          </tr></thead>
          <tbody>
            ${filtered.map(i=>{const c=clientMap[i.client_id];const st=STATUS_STYLE[i.status]||STATUS_STYLE.due;const paid=Number(i.amount_paid)||0;const total=Number(i.amount)||0;return h`<tr key=${i.id} onClick=${()=>setViewing(i)} style=${{cursor:'pointer',borderTop:'1px solid var(--bd)'}}>
              <td style=${{padding:'10px 12px',fontSize:12,color:'var(--t2)',fontWeight:500}}>${i.invoice_number}</td>
              <td style=${{padding:'10px 12px',color:'var(--t1)',fontWeight:500}}>${c?.name||i.client_snapshot?.name||h`<em style=${{color:'var(--t3)'}}>missing client</em>`}</td>
              <td style=${{padding:'10px 12px',color:'var(--t2)'}}>${i.period_label||fmtMonthYear(i.period_start)}</td>
              <td style=${{padding:'10px 12px',color:'var(--t2)',fontSize:12}}>${fmt(i.issued_on||i.period_start)}</td>
              <td style=${{padding:'10px 12px',color:'var(--t2)',fontSize:12}}>${fmt(i.due_date)}</td>
              <td style=${{padding:'10px 12px',textAlign:'right',fontVariantNumeric:'tabular-nums',fontWeight:500,color:'var(--t1)'}}>
                ₹${fmtINR(total,false)}
                ${i.status==='partial'&&h`<div style=${{fontSize:10.5,color:'var(--t3)',fontWeight:400,marginTop:2}}>₹${fmtINR(paid,false)} paid</div>`}
              </td>
              <td style=${{padding:'10px 12px'}}><span style=${{padding:'3px 9px',borderRadius:10,fontSize:10.5,fontWeight:600,letterSpacing:'.04em',textTransform:'uppercase',color:st.col,background:st.bg}}>${i.status}</span></td>
              <td style=${{padding:'10px 12px',whiteSpace:'nowrap'}} onClick=${e=>e.stopPropagation()}>
                ${canEdit&&(i.status==='due'||i.status==='overdue'||i.status==='partial')&&h`<button class="icon-btn" style=${{padding:5,marginRight:4}} onClick=${()=>setRecordingFor(i)} title="Record payment"><i class="ti ti-cash-banknote" style=${{color:'#15803D',fontSize:15}}></i></button>`}
                ${canEdit&&h`<button class="icon-btn" style=${{padding:5}} onClick=${e=>removeRow(i,e)} title="Delete"><i class="ti ti-trash" style=${{color:'var(--red)',fontSize:14}}></i></button>`}
              </td>
            </tr>`;})}
          </tbody>
        </table>
      </div>`}

    <div style=${{marginTop:12,fontSize:11.5,color:'var(--t3)'}}>${filtered.length} of ${invoices.length} invoices · click any row to ${canEdit?'view, print, or record a payment':'view, print, or download'}</div>
    </div>`}

    ${picker&&h`<${ClientPickerModal} clients=${clients} onClose=${()=>setPicker(false)} onPick=${openNewInvoice}/>`}
    ${editorClient&&h`<${InvoiceEditor} client=${editorClient} agency=${agency} existing=${editing} onClose=${()=>{setEditorClient(null);setEditing(null);}} onSaved=${onSaved}/>`}
    ${viewing&&!editorClient&&h`<${InvoiceViewer} invoice=${viewing} clients=${clients} onClose=${()=>setViewing(null)} onChanged=${(u)=>{setViewing(u);load();}} onEdit=${openEdit} showToast=${showToast} canEdit=${canEdit}/>`}
    ${importer&&h`<${CSVImportModal} clients=${clients} agency=${agency} onClose=${()=>setImporter(false)} onImported=${()=>{setImporter(false);load();showToast('Import complete');}} showToast=${showToast}/>`}
    ${recordingFor&&h`<${RecordPaymentModal} invoice=${recordingFor} onClose=${()=>setRecordingFor(null)} onSaved=${(u)=>{setRecordingFor(null);load();}} showToast=${showToast}/>`}
  </div>`;
}

    // ── ClientPickerModal ──
function ClientPickerModal({clients,onClose,onPick,title,subtitle}){
  const[q,setQ]=useState('');
  const list=clients.filter(c=>!q||c.name.toLowerCase().includes(q.toLowerCase())||(c.industry||'').toLowerCase().includes(q.toLowerCase()));
  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose();}}>
    <div class="modal-box" style=${{maxWidth:420,maxHeight:'80vh',display:'flex',flexDirection:'column'}}>
      <div class="modal-head">
        <div><div style=${{fontSize:16,fontWeight:600}}>${title||'New invoice for…'}</div><div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>${subtitle||'Pick a client to bill'}</div></div>
        <button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body" style=${{flex:1,overflowY:'auto'}}>
        <input class="fi" type="text" placeholder="Search clients…" value=${q} onInput=${e=>setQ(e.target.value)} autoFocus/>
        <div style=${{marginTop:12,display:'flex',flexDirection:'column',gap:4}}>
          ${list.length===0?h`<div style=${{fontSize:13,color:'var(--t3)',padding:14,textAlign:'center'}}>No clients match.</div>`
            :list.map(c=>h`<div key=${c.id} onClick=${()=>onPick(c)} style=${{padding:'10px 12px',borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',gap:10,background:'var(--bg)',border:'1px solid var(--bd)'}}>
              <${Av} i=${c.initials||c.name.slice(0,2).toUpperCase()} c=${c.brand_color_primary||c.color||'#FF00EE'} s=${28}/>
              <div style=${{flex:1,minWidth:0}}>
                <div style=${{fontSize:13.5,fontWeight:500,color:'var(--t1)'}}>${c.name}</div>
                <div style=${{fontSize:11,color:'var(--t3)',marginTop:2}}>${c.industry||'—'}${c.state?' · '+c.state:''}${c.gstin?' · GSTIN ✓':''}</div>
              </div>
              <i class="ti ti-chevron-right" style=${{color:'var(--t3)'}}></i>
            </div>`)}
        </div>
      </div>
    </div>
  </div>`;
}

    // ── parseInvoiceCSV ──
function parseInvoiceCSV(text){
  // Minimal RFC-4180 parser. Handles quoted fields with embedded commas + escaped quotes.
  const rows=[];let cur=[],field='',q=false,i=0;
  while(i<text.length){const c=text[i];
    if(q){if(c==='"'&&text[i+1]==='"'){field+='"';i+=2;continue;}if(c==='"'){q=false;i++;continue;}field+=c;i++;}
    else{if(c==='"'){q=true;i++;continue;}if(c===','){cur.push(field);field='';i++;continue;}if(c==='\n'){cur.push(field);if(cur.length>1||cur[0]!=='')rows.push(cur);cur=[];field='';i++;continue;}if(c==='\r'){i++;continue;}field+=c;i++;}
  }
  if(field||cur.length){cur.push(field);if(cur.length>1||cur[0]!=='')rows.push(cur);}
  return rows;
}

    // ── CSVImportModal ──
function CSVImportModal({clients,agency,onClose,onImported,showToast}){
  const[stage,setStage]=useState('upload'); // upload → preview → committing → done
  const[rawRows,setRawRows]=useState([]);
  const[header,setHeader]=useState([]);
  const[parsed,setParsed]=useState([]);
  const[autoCreate,setAutoCreate]=useState(true);
  const[committing,setCommitting]=useState(false);
  const[result,setResult]=useState(null);
  const[progress,setProgress]=useState({done:0,total:0});
  const fileRef=useRef();

  const onFile=async(file)=>{
    if(!file)return;
    try{const text=await file.text();const rows=parseInvoiceCSV(text);if(rows.length<2){showToast('CSV looks empty');return;}
      setRawRows(rows);setHeader(rows[0]);
      preview(rows);
    }catch(e){console.error(e);showToast('Could not read file');}
  };
  const onPaste=(text)=>{const rows=parseInvoiceCSV(text);if(rows.length<2){showToast('Need a header row + at least one data row');return;}setRawRows(rows);setHeader(rows[0]);preview(rows);};

  const preview=(rows)=>{
    const head=rows[0].map(s=>String(s).trim());
    const idx={};head.forEach((h,i)=>{idx[h.toLowerCase()]=i;});
    const get=(row,name)=>{const i=idx[name.toLowerCase()];return i==null?'':String(row[i]||'').trim();};
    // Zoho's CSV uses DD-MM-YYYY for dates.
    const parseDMY=(s)=>{if(!s)return null;const m=s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;const d=new Date(s);return isNaN(d)?null:d.toISOString().slice(0,10);};
    const statusMap={'PAID':'paid','UNPAID':'due','PARTIAL':'partial','CANCELED':'cancelled','CANCELLED':'cancelled','OVERDUE':'overdue','VOID':'cancelled'};
    const out=[];
    const clientByLcName={};clients.forEach(c=>{clientByLcName[c.name.toLowerCase().trim()]=c;});
    const today=new Date().toISOString().slice(0,10);
    for(let r=1;r<rows.length;r++){
      const row=rows[r];if(!row||row.length<3)continue;
      const inv=get(row,'Invoice');if(!inv)continue;
      const name=get(row,'Billed To');if(!name)continue;
      const billed=clientByLcName[name.toLowerCase().trim()];
      const issued=parseDMY(get(row,'Date'));
      const due=parseDMY(get(row,'Due Date'))||issued||today;
      const amount=Number(get(row,'Amount')||get(row,'Invoice  Amount in INR')||0);
      const paid=Number(get(row,'Amount Paid in INR')||get(row,'Amount Paid')||0);
      const subtotal=Number(get(row,'Sub Total')||amount);
      const taxable=Number(get(row,'Taxable Value')||subtotal);
      const discount=Number(get(row,'Discount')||0);
      const igst=Number(get(row,'IGST')||0),cgst=Number(get(row,'CGST')||0),sgst=Number(get(row,'SGST')||0);
      const gstRateRaw=get(row,'GST Rate')||'';const gstRate=Number(gstRateRaw.replace(/[^\d.]/g,''))||0;
      const pos=get(row,'Place Of Supply')||'';
      const supplyTypeRaw=get(row,'Supply Type')||'';
      const supplyType=supplyTypeRaw==='EXPWOP'?'EXPWOP':supplyTypeRaw==='B2B'?'B2B':supplyTypeRaw==='B2C'?'B2C':(get(row,'GSTIN/UIN of Recipient')?'B2B':'B2C');
      let status=statusMap[get(row,'Status').toUpperCase()]||'due';
      if(status==='due'&&due<today)status='overdue';
      const gstin=get(row,'GSTIN/UIN of Recipient');
      const pan=get(row,'PAN');
      const hsn=get(row,'HSN/SAC list')||'998314';
      out.push({
        invoice_number:inv,
        client_id:billed?.id||null,
        client_name:name,
        client_existing:!!billed,
        client_gstin:gstin,
        client_pan:pan,
        client_state:pos&&pos!=='Other Countries'?pos:null,
        client_place_of_supply:pos,
        issued_on:issued,
        period_start:issued?issued.slice(0,8)+'01':null,
        period_label:issued?new Date(issued).toLocaleDateString('en-IN',{month:'long',year:'numeric'}):null,
        amount,subtotal,discount_amount:discount,taxable_value:taxable,
        gst_rate:gstRate,cgst_amount:cgst,sgst_amount:sgst,igst_amount:igst,
        amount_paid:paid,
        supply_type:supplyType,hsn_sac:hsn,place_of_supply:pos,
        due_date:due,status,
        line_items:[{description:`Services for ${issued?new Date(issued).toLocaleDateString('en-IN',{month:'long',year:'numeric'}):'period'}`,hsn_sac:hsn,qty:1,rate:taxable||amount}],
      });
    }
    setParsed(out);setStage('preview');
  };

  const counts=useMemo(()=>{
    const haveClient=parsed.filter(p=>p.client_existing||autoCreate).length;
    const skipClient=parsed.length-haveClient;
    return{total:parsed.length,haveClient,skipClient,
      paid:parsed.filter(p=>p.status==='paid').length,
      partial:parsed.filter(p=>p.status==='partial').length,
      unpaid:parsed.filter(p=>p.status==='due'||p.status==='overdue').length,
      cancelled:parsed.filter(p=>p.status==='cancelled').length,
    };
  },[parsed,autoCreate]);

  const commit=async()=>{
    setCommitting(true);setProgress({done:0,total:parsed.length});
    let created=0,updated=0,skipped=0,clientsCreated=0,errors=0;
    try{
      // Step 1: auto-create missing clients if opted in (small N, do sequentially)
      const clientLookup={};clients.forEach(c=>{clientLookup[c.name.toLowerCase().trim()]={...c};});
      if(autoCreate){
        const missing=parsed.filter(p=>!p.client_existing);
        const uniqueNames=[...new Set(missing.map(p=>p.client_name))];
        for(const name of uniqueNames){
          const sample=missing.find(p=>p.client_name===name);
          if(!sample)continue;
          try{
            const ini=name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()||name.slice(0,2).toUpperCase();
            const rows=await rpcCall('client_create',{p_data:{name,initials:ini,status:'inactive',gstin:sample.client_gstin||null,pan:sample.client_pan||null,state:sample.client_state||null,place_of_supply:sample.client_place_of_supply||null,color:'#9CA3AF',billing_notes:'Imported from Zoho CSV — fill in details.'}});
            clientLookup[name.toLowerCase().trim()]=rows?.[0];clientsCreated++;
          }catch(e){console.warn('[csv] client create failed for',name,e);}
        }
      }
      // Step 2: lookup existing invoices in one shot.
      const existingRows=await rpcCall('inv_list',{p_limit:2000});
      const existingByKey={};(existingRows||[]).forEach(r=>{existingByKey[r.client_id+'|'+r.invoice_number]=r;});

      const ag=agency?buildAgencySnapshot(agency):null;

      // Step 3: process invoices IN PARALLEL BATCHES of 8 (PostgREST handles this well,
      // total wall time drops from ~60s to ~8s for 88 rows). Sequential for-loop was
      // the cause of the "white screen" — browser appeared frozen during the long run.
      const BATCH=8;
      const work=async(p)=>{
        const c=clientLookup[p.client_name.toLowerCase().trim()];
        if(!c)return{outcome:'skip'};
        const key=c.id+'|'+p.invoice_number;
        const existing=existingByKey[key];
        let payload;
        try{
          payload={
            client_id:c.id,invoice_number:p.invoice_number,issued_on:p.issued_on,period_start:p.period_start,period_label:p.period_label,
            amount:p.amount,subtotal:p.subtotal,discount_amount:p.discount_amount,taxable_value:p.taxable_value,
            gst_rate:p.gst_rate,cgst_amount:p.cgst_amount,sgst_amount:p.sgst_amount,igst_amount:p.igst_amount,
            supply_type:p.supply_type,hsn_sac:p.hsn_sac,place_of_supply:p.place_of_supply,
            due_date:p.due_date,status:p.status,line_items:p.line_items,
            agency_snapshot:ag,client_snapshot:buildClientSnapshot({...c,...{gstin:p.client_gstin||c.gstin,pan:p.client_pan||c.pan,state:p.client_state||c.state,place_of_supply:p.client_place_of_supply||c.place_of_supply}}),
          };
        }catch(e){console.warn('[csv] payload build failed for',p.invoice_number,e);return{outcome:'error'};}
        try{
          if(existing){
            await rpcCall('inv_update',{p_id:existing.id,p_data:payload});
            if(Number(p.amount_paid)>(Number(existing.amount_paid)||0)){
              const diff=Number(p.amount_paid)-(Number(existing.amount_paid)||0);
              await rpcCall('inv_payment_record',{p_data:{invoice_id:existing.id,amount:diff,paid_on:p.issued_on||todayISO(),method:'Imported',reference:'csv:'+p.invoice_number}});
            }
            return{outcome:'update'};
          }
          const created=await rpcCall('inv_create',{p_data:{...payload,amount_paid:0}});
          const newId=created?.id;
          if(newId&&Number(p.amount_paid)>0){
            await rpcCall('inv_payment_record',{p_data:{invoice_id:newId,amount:p.amount_paid,paid_on:p.issued_on||todayISO(),method:'Imported',reference:'csv:'+p.invoice_number}});
          }
          return{outcome:'create'};
        }catch(e){console.warn('[csv] upsert failed for',p.invoice_number,e?.message||e);return{outcome:'error'};}
      };
      let done=0;
      for(let i=0;i<parsed.length;i+=BATCH){
        const slice=parsed.slice(i,i+BATCH);
        const results=await Promise.all(slice.map(work));
        results.forEach(r=>{
          if(r.outcome==='create')created++;
          else if(r.outcome==='update')updated++;
          else if(r.outcome==='skip')skipped++;
          else errors++;
        });
        done+=slice.length;
        setProgress({done,total:parsed.length});
        // Yield to the event loop so React can paint the progress update.
        await new Promise(r=>setTimeout(r,0));
      }
      setResult({created,updated,skipped,clientsCreated,errors});setStage('done');
    }catch(e){console.error('[csv] import failed',e);showToast('Import failed: '+(e?.message||e));}
    finally{setCommitting(false);}
  };

  return h`<div class="modal" onClick=${e=>{if(e.target===e.currentTarget)onClose();}}>
    <div class="modal-box" style=${{maxWidth:760,maxHeight:'90vh',display:'flex',flexDirection:'column'}}>
      <div class="modal-head">
        <div>
          <div style=${{fontSize:16,fontWeight:600}}>Import invoices from CSV</div>
          <div style=${{fontSize:12,color:'var(--t3)',marginTop:2}}>${stage==='upload'?'Drop your Zoho export below':stage==='preview'?`${counts.total} rows parsed — review before committing`:stage==='done'?'Done.':'Importing…'}</div>
        </div>
        <button class="icon-btn" onClick=${onClose}><i class="ti ti-x"></i></button>
      </div>
      <div class="modal-body" style=${{flex:1,overflowY:'auto'}}>
        ${stage==='upload'&&h`<div>
          <div style=${{padding:'18px',background:'rgba(59,130,246,.06)',border:'1px solid rgba(59,130,246,.2)',borderRadius:8,marginBottom:14,fontSize:12.5,color:'var(--t2)',lineHeight:1.6}}>
            <strong style=${{color:'var(--t1)'}}>Idempotent</strong> — safe to re-run. Existing invoices (same number + client) get updated with whatever your CSV says; new ones are created. Status changes propagate (UNPAID → PAID flips the row green).
          </div>
          <input ref=${fileRef} type="file" accept=".csv" onChange=${e=>onFile(e.target.files?.[0])} style=${{padding:'14px',width:'100%',border:'2px dashed var(--bd)',borderRadius:10,background:'var(--bg)',fontSize:13,cursor:'pointer'}}/>
          <div style=${{margin:'14px 0',textAlign:'center',color:'var(--t3)',fontSize:11.5}}>— or paste CSV content —</div>
          <textarea class="fi" rows="6" placeholder="Date,Invoice,Billed To,...&#10;19-05-2026,A00107,..." onPaste=${e=>{setTimeout(()=>onPaste(e.target.value),50);}} style=${{fontFamily:"'JetBrains Mono',monospace",fontSize:11,resize:'vertical'}}/>
          <div style=${{fontSize:11.5,color:'var(--t3)',marginTop:14,lineHeight:1.55}}>Expected columns (from Zoho): <code>Date, Invoice, Billed To, Currency, Amount, Status, Place Of Supply, Due Date, Due Amount, GST Rate, IGST, CGST, SGST, GSTIN/UIN of Recipient, PAN, Sub Total, Discount, Taxable Value, HSN/SAC list, Amount Paid in INR</code>. Extra columns are ignored.</div>
        </div>`}

        ${stage==='preview'&&h`<div>
          <div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8,marginBottom:14}}>
            <div class="crd" style=${{padding:'10px 12px'}}>
              <div style=${{fontSize:10,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Will import</div>
              <div style=${{fontSize:18,fontWeight:600,color:'var(--t1)',marginTop:4}}>${counts.haveClient}</div>
            </div>
            <div class="crd" style=${{padding:'10px 12px'}}>
              <div style=${{fontSize:10,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Paid</div>
              <div style=${{fontSize:18,fontWeight:600,color:'#15803D',marginTop:4}}>${counts.paid}</div>
            </div>
            <div class="crd" style=${{padding:'10px 12px'}}>
              <div style=${{fontSize:10,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Partial</div>
              <div style=${{fontSize:18,fontWeight:600,color:'#1D4ED8',marginTop:4}}>${counts.partial}</div>
            </div>
            <div class="crd" style=${{padding:'10px 12px'}}>
              <div style=${{fontSize:10,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Unpaid</div>
              <div style=${{fontSize:18,fontWeight:600,color:'#B45309',marginTop:4}}>${counts.unpaid}</div>
            </div>
            ${counts.cancelled>0&&h`<div class="crd" style=${{padding:'10px 12px'}}>
              <div style=${{fontSize:10,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.06em'}}>Cancelled</div>
              <div style=${{fontSize:18,fontWeight:600,color:'var(--t3)',marginTop:4}}>${counts.cancelled}</div>
            </div>`}
            ${counts.skipClient>0&&!autoCreate&&h`<div class="crd" style=${{padding:'10px 12px',borderColor:'rgba(220,38,38,.2)'}}>
              <div style=${{fontSize:10,color:'#DC2626',textTransform:'uppercase',letterSpacing:'.06em'}}>Will skip</div>
              <div style=${{fontSize:18,fontWeight:600,color:'#DC2626',marginTop:4}}>${counts.skipClient}</div>
              <div style=${{fontSize:10,color:'var(--t3)',marginTop:2}}>missing client</div>
            </div>`}
          </div>
          <label style=${{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',background:'var(--bg2)',borderRadius:8,marginBottom:14,fontSize:13,color:'var(--t1)',cursor:'pointer'}}>
            <input type="checkbox" checked=${autoCreate} onChange=${e=>setAutoCreate(e.target.checked)}/>
            Auto-create missing clients (${parsed.filter(p=>!p.client_existing).length} brand${parsed.filter(p=>!p.client_existing).length===1?'':'s'} not in your clients list)
          </label>
          <div style=${{border:'1px solid var(--bd)',borderRadius:8,overflow:'hidden',maxHeight:'42vh',overflowY:'auto'}}>
            <table style=${{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead style=${{position:'sticky',top:0,background:'var(--bg2)',color:'var(--t3)',fontSize:10,letterSpacing:'.06em',textTransform:'uppercase'}}>
                <tr><th style=${{padding:'8px 10px',textAlign:'left'}}>Invoice</th><th style=${{padding:'8px 10px',textAlign:'left'}}>Client</th><th style=${{padding:'8px 10px',textAlign:'left'}}>Period</th><th style=${{padding:'8px 10px',textAlign:'right'}}>Amount</th><th style=${{padding:'8px 10px',textAlign:'left'}}>Status</th></tr>
              </thead>
              <tbody>
                ${parsed.slice(0,200).map(p=>h`<tr key=${p.invoice_number} style=${{borderTop:'1px solid var(--bd)'}}>
                  <td style=${{padding:'7px 10px',fontFamily:"'JetBrains Mono',monospace"}}>${p.invoice_number}</td>
                  <td style=${{padding:'7px 10px',color:p.client_existing?'var(--t1)':(autoCreate?'#B45309':'#DC2626')}}>${p.client_name}${!p.client_existing&&h`<span style=${{fontSize:10,marginLeft:6,fontWeight:500}}>${autoCreate?'· will create':'· not in list'}</span>`}</td>
                  <td style=${{padding:'7px 10px',color:'var(--t2)'}}>${p.period_label||p.period_start||'—'}</td>
                  <td style=${{padding:'7px 10px',textAlign:'right',fontFamily:"'JetBrains Mono',monospace"}}>₹${fmtINR(p.amount,false)}</td>
                  <td style=${{padding:'7px 10px',textTransform:'uppercase',fontSize:10,letterSpacing:'.04em',fontWeight:600,color:p.status==='paid'?'#15803D':p.status==='partial'?'#1D4ED8':p.status==='overdue'?'#DC2626':p.status==='cancelled'?'var(--t3)':'#B45309'}}>${p.status}</td>
                </tr>`)}
                ${parsed.length>200&&h`<tr><td colSpan="5" style=${{padding:10,textAlign:'center',color:'var(--t3)',fontSize:11.5}}>+ ${parsed.length-200} more (will all be imported)</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>`}

        ${stage==='done'&&result&&h`<div style=${{padding:24,textAlign:'center'}}>
          <i class="ti ti-circle-check" style=${{fontSize:48,color:'#15803D',marginBottom:14,display:'block'}}></i>
          <div style=${{fontSize:18,fontWeight:600,marginBottom:8}}>Import complete</div>
          <div style=${{fontSize:13,color:'var(--t2)',lineHeight:1.7}}>
            <div><strong style=${{color:'#15803D'}}>${result.created}</strong> invoices created</div>
            <div><strong style=${{color:'var(--t1)'}}>${result.updated}</strong> invoices updated</div>
            ${result.clientsCreated>0&&h`<div><strong style=${{color:'var(--t1)'}}>${result.clientsCreated}</strong> new clients auto-created</div>`}
            ${result.skipped>0&&h`<div style=${{color:'#B45309'}}>${result.skipped} skipped (no client)</div>`}
            ${result.errors>0&&h`<div style=${{color:'#DC2626'}}>${result.errors} errors — check console</div>`}
          </div>
        </div>`}
      </div>
      <div class="modal-foot">
        ${stage==='upload'&&h`<button class="btn-sec" onClick=${onClose}>Cancel</button>`}
        ${stage==='preview'&&committing&&progress.total>0&&h`<div style=${{flex:1,marginRight:12,display:'flex',alignItems:'center',gap:10}}>
          <div style=${{flex:1,height:6,background:'var(--bg2)',borderRadius:3,overflow:'hidden'}}>
            <div style=${{height:'100%',width:Math.round(progress.done/progress.total*100)+'%',background:'var(--brand)',transition:'width .2s ease'}}></div>
          </div>
          <span style=${{fontSize:11.5,color:'var(--t2)',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>${progress.done} / ${progress.total}</span>
        </div>`}
        ${stage==='preview'&&h`<button class="btn-sec" onClick=${()=>setStage('upload')} disabled=${committing}>Back</button>`}
        ${stage==='preview'&&h`<button class="btn-pri" onClick=${commit} disabled=${committing||counts.haveClient===0}>${committing?`Importing ${progress.done}/${progress.total}…`:`Import ${counts.haveClient} invoices`}</button>`}
        ${stage==='done'&&h`<button class="btn-pri" onClick=${onImported}>Done</button>`}
      </div>
    </div>
  </div>`;
}


    return { BillingTab,BillingApp };
  }
  window.AMS_BILLING = { buildBilling };
})();

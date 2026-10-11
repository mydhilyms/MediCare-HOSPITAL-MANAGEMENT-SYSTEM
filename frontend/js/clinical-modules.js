/* Consistent, database-aligned ledgers for staff, pharmacy and billing.
 * Loaded after app.js and clinical-enhancements.js to replace the legacy mock-oriented views.
 */
const clinicSetText=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
const clinicList=(v)=>Array.isArray(v)?v:[];
const clinicRenderPage=(key,items,render)=>{
  const state=pagination[key];state.total=items.length;
  state.page=Math.max(1,Math.min(state.page,Math.ceil(items.length/state.limit)||1));
  render(items.slice((state.page-1)*state.limit,state.page*state.limit));
  renderPagination(({staff:'staff-pg',pharmacy:'pharmacy-pg',billing:'billing-pg'})[key],state);
};
async function loadClinicalBranches(select,selected){
  const el=document.getElementById(select);if(!el)return;
  const res=await apiRequest('/branches');
  el.innerHTML='<option value="">Select branch…</option>'+clinicList(res.branches).map(b=>`<option value="${b.branch_id}">${escapeClinical(b.location)} · #${b.branch_id}</option>`).join('');
  el.value=selected?String(selected):'';
}

// STAFF: role, branch and shift are the actual columns in the staff table.
let clinicAllStaff=[];
let clinicStaffSerial=0;
function initStaff(){
  pagination.staff={page:1,limit:12,total:0};
  document.getElementById('staff-search').oninput=debounce(()=>{pagination.staff.page=1;drawClinicalStaff();},180);
  document.getElementById('staff-dept-filter').onchange=()=>{pagination.staff.page=1;drawClinicalStaff();};
  document.getElementById('staff-pg').onclick=e=>{const b=e.target.closest('.page-btn[data-p]');if(b){pagination.staff.page=+b.dataset.p;drawClinicalStaff();}};
  document.getElementById('staff-add-btn').onclick=()=>openAddStaffModal();
  document.getElementById('staff-form-submit').onclick=submitStaffForm;
  fetchStaff();
}
async function fetchStaff(){
  const tbody=document.getElementById('staff-tbody');if(!tbody)return;
  const serial=++clinicStaffSerial;tbody.innerHTML=spinnerRow(6);
  try{
    const res=await apiRequest('/staff');
    if(serial!==clinicStaffSerial||currentPage!=='staff')return;
    clinicAllStaff=clinicList(res.staff);appState.staff=clinicAllStaff;
    const sel=document.getElementById('staff-dept-filter');const selected=sel.value;
    const roles=[...new Set(clinicAllStaff.map(s=>s.role).filter(Boolean))].sort();
    sel.innerHTML='<option value="">All roles</option>'+roles.map(r=>`<option value="${escapeClinical(r)}">${escapeClinical(r)}</option>`).join('');
    sel.value=selected;
    clinicSetText('staff-total',clinicAllStaff.length);
    clinicSetText('staff-present',new Set(clinicAllStaff.map(s=>s.branch_id)).size);
    clinicSetText('staff-absent',roles.length);
    clinicSetText('staff-leave',clinicAllStaff.filter(s=>!!s.shift).length);
    drawClinicalStaff();
  }catch(e){tbody.innerHTML=errorRow(6,escapeClinical(e.message));}
}
function drawClinicalStaff(){
  const filter=document.getElementById('staff-search')?.value.trim().toLowerCase()||'';
  const role=document.getElementById('staff-dept-filter')?.value||'';
  const rows=clinicAllStaff.filter(s=>(!filter||[s.name,s.role,s.branch_location,String(s.staff_id)].some(v=>String(v||'').toLowerCase().includes(filter)))&&(!role||s.role===role));
  clinicRenderPage('staff',rows,renderStaffTable);
}
function renderStaffTable(rows){
  const el=document.getElementById('staff-tbody');if(!el)return;
  el.innerHTML=rows.length?rows.map(s=>`<tr><td>${s.staff_id}</td><td class="fw-600">${escapeClinical(s.name)}</td><td>${escapeClinical(s.role)}</td><td>${escapeClinical(s.branch_location||s.branch_id)}</td><td>${escapeClinical(s.shift||'—')}</td><td><div class="flex gap-1"><button class="btn btn-outline btn-sm btn-icon" onclick="editStaff('${s.staff_id}')" title="Edit staff"><i class="fas fa-pen"></i></button><button class="btn btn-danger btn-sm btn-icon" onclick="deleteStaff('${s.staff_id}')" title="Delete staff"><i class="fas fa-trash"></i></button></div></td></tr>`).join(''):emptyRow(6,'No matching staff.');
}
function openAddStaffModal(){
  staffEditId=null;
  clinicSetText('staff-form-title','Add staff member');
  ['sf-name','sf-position','sf-shift'].forEach(id=>{document.getElementById(id).value='';});
  loadClinicalBranches('sf-branch-id').catch(e=>toast(e.message,'error'));
  openModal('modal-staff-form');
}
async function editStaff(id){
  try{
    const res=await apiRequest(`/staff/${intClinical(id,{min:1})}`);
    const s=res.staff;if(!s)throw Error('Staff record not found.');
    staffEditId=String(id);clinicSetText('staff-form-title',`Edit staff #${id}`);
    document.getElementById('sf-name').value=s.name||'';
    document.getElementById('sf-position').value=s.role||'';
    document.getElementById('sf-shift').value=s.shift||'';
    await loadClinicalBranches('sf-branch-id',s.branch_id);
    openModal('modal-staff-form');
  }catch(e){toast(e.message,'error');}
}
function viewStaff(id){const s=clinicAllStaff.find(row=>row.staff_id===Number(id));if(s)toast(`${s.name} · ${s.role} · ${s.branch_location||s.branch_id}`,'info');}
async function submitStaffForm(){
  const btn=document.getElementById('staff-form-submit');if(btn.disabled)return;
  const name=document.getElementById('sf-name').value.trim();
  const role=document.getElementById('sf-position').value.trim();
  if(!name||!role){toast('Name and role are required.','warning');return;}
  let branchId;try{branchId=getWhole('sf-branch-id',1);}catch(e){toast('Choose a valid branch.','error');return;}
  const body={name,role,branchId,shift:document.getElementById('sf-shift').value.trim()||null};
  btn.disabled=true;
  try{await apiRequest(staffEditId?`/staff/${staffEditId}`:'/staff',{method:staffEditId?'PUT':'POST',body:JSON.stringify(body)});closeModal('modal-staff-form');toast('Staff record saved.','success');await fetchStaff();}
  catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;}
}
function deleteStaff(id){
  confirmDialog(`Delete staff #${escapeClinical(id)}? Records with linked assignments cannot be removed.`,async()=>{
    try{await apiRequest(`/staff/${intClinical(id,{min:1})}`,{method:'DELETE'});toast('Staff deleted.','success');fetchStaff();}
    catch(e){toast(e.message,'error');}
  });
}

// PHARMACY: stock is always rendered and saved for an explicit pharmacy ID.
let clinicPharmacies=[];
let clinicInventory=[];
let clinicPharmacySerial=0;
function initPharmacy(){
  pagination.pharmacy={page:1,limit:12,total:0};
  document.getElementById('pharmacy-branch-select').onchange=()=>{pagination.pharmacy.page=1;fetchMedicines();};
  document.getElementById('pharmacy-status-filter').onchange=()=>{pagination.pharmacy.page=1;drawClinicalInventory();};
  document.getElementById('pharmacy-search').oninput=debounce(()=>{pagination.pharmacy.page=1;drawClinicalInventory();},180);
  document.getElementById('pharmacy-pg').onclick=e=>{const b=e.target.closest('.page-btn[data-p]');if(b){pagination.pharmacy.page=+b.dataset.p;drawClinicalInventory();}};
  document.getElementById('medicine-add-btn').onclick=openAddMedicineModal;
  document.getElementById('medicine-form-submit').onclick=submitMedicineForm;
  (async()=>{
    try{
      const res=await apiRequest('/pharmacy');clinicPharmacies=clinicList(res.pharmacies);
      const sel=document.getElementById('pharmacy-branch-select');
      sel.innerHTML=clinicPharmacies.length?clinicPharmacies.map(p=>`<option value="${p.pharmacy_id}">${escapeClinical(p.branch_location||p.name)} · #${p.pharmacy_id}</option>`).join(''):'<option value="">No pharmacy configured</option>';
      fetchMedicines();
    }catch(e){document.getElementById('pharmacy-tbody').innerHTML=errorRow(8,escapeClinical(e.message));}
  })();
}
async function fetchMedicines(){
  const tbody=document.getElementById('pharmacy-tbody');if(!tbody)return;
  const id=document.getElementById('pharmacy-branch-select')?.value;
  clinicInventory=[];
  if(!id){tbody.innerHTML=emptyRow(8,'Configure a pharmacy to view stock.');return;}
  const serial=++clinicPharmacySerial;tbody.innerHTML=spinnerRow(8);
  try{
    const res=await apiRequest(`/pharmacy/${intClinical(id,{min:1})}/inventory`);
    if(serial!==clinicPharmacySerial||currentPage!=='pharmacy')return;
    clinicInventory=clinicList(res.inventory);appState.medicines=clinicInventory;
    const inStock=clinicInventory.filter(m=>+m.stock_quantity>+m.reorder_level);
    clinicSetText('ph-total',clinicInventory.length);
    clinicSetText('ph-instock',inStock.length);
    clinicSetText('ph-lowstock',clinicInventory.filter(m=>+m.stock_quantity>0 && +m.stock_quantity<=+m.reorder_level).length);
    clinicSetText('ph-critical',clinicInventory.filter(m=>+m.stock_quantity===0).length);
    drawClinicalInventory();
  }catch(e){if(serial===clinicPharmacySerial)tbody.innerHTML=errorRow(8,escapeClinical(e.message));}
}
const clinicStockStatus=m=> +m.stock_quantity===0?'out_of_stock':+m.stock_quantity<=+m.reorder_level?'low_stock':'in_stock';
function drawClinicalInventory(){
  const filter=(document.getElementById('pharmacy-search')?.value||'').toLowerCase().trim();
  const status=document.getElementById('pharmacy-status-filter')?.value||'';
  const rows=clinicInventory.filter(m=>(!status||clinicStockStatus(m)===status)&&(!filter||String(m.medicine_name).toLowerCase().includes(filter)||String(m.medicine_id).includes(filter)));
  clinicSetText('pharmacy-table-count',`${rows.length} items`);
  clinicRenderPage('pharmacy',rows,renderPharmacyTable);
}
function renderPharmacyTable(rows){
  const tbody=document.getElementById('pharmacy-tbody');if(!tbody)return;
  tbody.innerHTML=rows.length?rows.map(m=>{
    const state=clinicStockStatus(m);
    const badge=state==='in_stock'?'In Stock':state==='low_stock'?'Low Stock':'Out Of Stock';
    return `<tr><td>${m.medicine_id}</td><td class="fw-600">${escapeClinical(m.medicine_name)}</td><td>${escapeClinical(clinicPharmacies.find(p=>p.pharmacy_id===m.pharmacy_id)?.branch_location||m.pharmacy_id)}</td><td>${Number(m.stock_quantity).toLocaleString()}</td><td>${Number(m.reorder_level||0).toLocaleString()}</td><td>${formatCurrency(m.price)}</td><td>${statusBadge(badge)}</td><td><div class="flex gap-1"><button class="btn btn-outline btn-sm btn-icon" onclick="editMedicine('${m.medicine_id}')" title="Edit pharmacy stock"><i class="fas fa-pen"></i></button><button class="btn btn-outline btn-sm btn-icon" onclick="restockMedicine('${m.medicine_id}')" title="Restock"><i class="fas fa-plus"></i></button></div></td></tr>`;
  }).join(''):emptyRow(8,'No stock records found for the selected filters.');
}
function fillMedicinePharmacies(selected,disable=false){
  const sel=document.getElementById('mf-pharmacy-id');
  sel.innerHTML='<option value="">Select pharmacy…</option>'+clinicPharmacies.map(p=>`<option value="${p.pharmacy_id}">${escapeClinical(p.branch_location||p.name||`Pharmacy #${p.pharmacy_id}`)}</option>`).join('');
  sel.value=String(selected||'');sel.disabled=disable;
}
function openAddMedicineModal(){
  medicineEditId=null;clinicSetText('medicine-form-title','Add medicine to inventory');
  for(const id of ['mf-name'])document.getElementById(id).value='';
  document.getElementById('mf-stock').value='0';document.getElementById('mf-price').value='0';document.getElementById('mf-reorder').value='10';
  fillMedicinePharmacies(document.getElementById('pharmacy-branch-select')?.value);
  openModal('modal-medicine-form');
}
async function editMedicine(id){
  const medicine=clinicInventory.find(m=>Number(m.medicine_id)===Number(id));if(!medicine)return;
  medicineEditId=String(id);clinicSetText('medicine-form-title',`Edit medicine #${id}`);
  document.getElementById('mf-name').value=medicine.medicine_name||'';
  document.getElementById('mf-stock').value=medicine.stock_quantity;
  document.getElementById('mf-price').value=medicine.price;
  document.getElementById('mf-reorder').value=medicine.reorder_level||0;
  fillMedicinePharmacies(medicine.pharmacy_id,true);
  openModal('modal-medicine-form');
}
async function submitMedicineForm(){
  const btn=document.getElementById('medicine-form-submit');if(btn.disabled)return;
  const name=document.getElementById('mf-name').value.trim();if(!name){toast('Medicine name is required.','warning');return;}
  let body;
  try{body={name,pharmacyId:getWhole('mf-pharmacy-id',1),stockQuantity:getWhole('mf-stock'),unitPrice:moneyClinical(document.getElementById('mf-price').value),reorderLevel:getWhole('mf-reorder')};}
  catch(e){toast(e.message,'error');return;}
  btn.disabled=true;
  try{
    const path=medicineEditId?`/medicines/${medicineEditId}`:'/medicines';
    await apiRequest(path,{method:medicineEditId?'PUT':'POST',body:JSON.stringify(body)});
    toast('Inventory saved for selected pharmacy.','success');closeModal('modal-medicine-form');fetchMedicines();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;}
}
function restockMedicine(id){
  const med=clinicInventory.find(m=>Number(m.medicine_id)===Number(id));if(!med)return;
  const answer=prompt(`Quantity to add for ${med.medicine_name} at this pharmacy:`, '10');if(answer===null)return;
  let qty;try{qty=intClinical(answer,{min:1});}catch(e){toast(e.message,'error');return;}
  apiRequest(`/pharmacy/${med.pharmacy_id}/inventory`,{method:'POST',body:JSON.stringify({medicineId:med.medicine_id,stockQuantity:qty,price:med.price,reorderLevel:med.reorder_level||0})})
    .then(()=>{toast('Stock increased.','success');fetchMedicines();}).catch(e=>toast(e.message,'error'));
}

// BILLING: no demo/fallback data, no invented completed appointments.
let clinicAllBills=[];
let clinicBillsSerial=0;
function initBilling(){
  pagination.billing={page:1,limit:12,total:0};
  document.getElementById('billing-search').oninput=debounce(()=>{pagination.billing.page=1;drawClinicalBills();},160);
  document.getElementById('billing-status-filter').onchange=()=>{pagination.billing.page=1;drawClinicalBills();};
  document.getElementById('billing-pg').onclick=e=>{const b=e.target.closest('.page-btn[data-p]');if(b){pagination.billing.page=+b.dataset.p;drawClinicalBills();}};
  document.getElementById('bill-add-btn').onclick=openAddBillForm;
  document.getElementById('bill-form-submit').onclick=submitBillForm;
  fetchBills();
}
async function fetchBills(){
  const tbody=document.getElementById('billing-tbody');if(!tbody)return;
  const serial=++clinicBillsSerial;tbody.innerHTML=spinnerRow(8);
  try{
    const res=await apiRequest('/billing');if(serial!==clinicBillsSerial||currentPage!=='billing')return;
    clinicAllBills=clinicList(res.bills);appState.bills=clinicAllBills;
    clinicSetText('bill-total',formatCurrency(clinicAllBills.reduce((v,b)=>v+Number(b.amount||0),0)));
    const amountFor=status=>formatCurrency(clinicAllBills.filter(b=>b.payment_status===status).reduce((v,b)=>v+Number(b.amount||0),0));
    clinicSetText('bill-paid',amountFor('paid'));clinicSetText('bill-pending',amountFor('unpaid'));clinicSetText('bill-overdue',amountFor('partial'));
    drawClinicalBills();
  }catch(e){tbody.innerHTML=errorRow(8,escapeClinical(e.message));}
}
function drawClinicalBills(){
  const query=document.getElementById('billing-search')?.value.toLowerCase().trim()||'';
  const status=document.getElementById('billing-status-filter')?.value||'';
  const filtered=clinicAllBills.filter(b=>(!status||b.payment_status===status)&&(!query||[b.bill_id,b.patient_name,b.doctor_name,b.appointment_id].some(v=>String(v||'').toLowerCase().includes(query))));
  clinicRenderPage('billing',filtered,renderBillingList);
}
function renderBillingList(bills){
  const tbody=document.getElementById('billing-tbody');if(!tbody)return;
  tbody.innerHTML=bills.length?bills.map(b=>`<tr><td class="fw-600">#${b.bill_id}</td><td>#${b.appointment_id}</td><td>${escapeClinical(b.patient_name)}</td><td>${escapeClinical(b.doctor_name)}</td><td>${escapeClinical(formatDate(b.bill_date))}</td><td class="fw-600">${formatCurrency(b.amount)}</td><td>${statusBadge(b.payment_status)}</td><td>${b.payment_status!=='paid'&&b.payment_status!=='cancelled'?`<button class="btn btn-outline btn-sm" onclick="recordPayment('${b.bill_id}')">Record full payment</button>`:'—'}</td></tr>`).join(''):emptyRow(8,'No invoices match this filter.');
}
async function openAddBillForm(){
  const select=document.getElementById('bf-appointment-id');select.innerHTML='<option value="">Loading completed appointments…</option>';
  document.getElementById('bf-amount').value='';document.getElementById('bf-status').value='unpaid';
  openModal('modal-bill-form');
  try{
    const res=await apiRequest('/appointments');
    const billed=new Set(clinicAllBills.map(b=>Number(b.appointment_id)));
    const eligible=clinicList(res.appointments).filter(a=>a.status==='completed'&&!billed.has(Number(a.appointmentId)));
    select.innerHTML='<option value="">Select unbilled appointment…</option>'+eligible.map(a=>`<option value="${a.appointmentId}">#${a.appointmentId} · ${escapeClinical(a.patientName)} · ${escapeClinical(formatDate(a.appointmentDate))}</option>`).join('');
    if(!eligible.length)toast('No completed unbilled appointments exist.','info');
  }catch(e){select.innerHTML='<option value="">Unable to load appointments</option>';toast(e.message,'error');}
}
async function submitBillForm(){
  const btn=document.getElementById('bill-form-submit');if(btn.disabled)return;
  let body;try{body={appointmentId:getWhole('bf-appointment-id',1),amount:moneyClinical(document.getElementById('bf-amount').value),paymentStatus:document.getElementById('bf-status').value};}
  catch(e){toast(e.message,'error');return;}
  btn.disabled=true;
  try{await apiRequest('/billing',{method:'POST',body:JSON.stringify(body)});toast('Invoice created.','success');closeModal('modal-bill-form');fetchBills();}
  catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;}
}
function recordPayment(id){
  const bill=clinicAllBills.find(b=>Number(b.bill_id)===Number(id));if(!bill)return;
  confirmDialog(`Record full payment of ${formatCurrency(bill.amount)} for invoice #${escapeClinical(id)}?`,async()=>{
    try{await apiRequest(`/billing/${id}/payment`,{method:'PUT',body:JSON.stringify({amount:bill.amount})});toast('Payment recorded.','success');fetchBills();}
    catch(e){toast(e.message,'error');}
  },'Record payment');
}


// PRESCRIPTIONS: no demo records, imaginary diagnosis/notes or silently truncated quantities.
let clinicMasterMedicines=[];
let clinicPrescriptionSerial=0;
function initPrescriptions(){
  document.getElementById('rx-add-btn').onclick=()=>{
    rxMedicines=[{medicineId:'',dosage:'',quantity:'1'}];renderRxMedicineList();
    document.getElementById('rx-date').value=todayLocalClinical();
    openModal('modal-rx-form');
  };
  document.getElementById('rx-add-medicine').onclick=addRxMedicine;
  document.getElementById('rx-form-submit').onclick=submitRxForm;
  const list=document.getElementById('rx-medicine-list');
  list.oninput=changeRxMedicine;
  list.onchange=changeRxMedicine;
  fetchPrescriptions();
  Promise.allSettled([populatePatientSelect('rx-patient-select'),populateDoctorSelect('rx-doctor'),
    apiRequest('/medicines').then(r=>{clinicMasterMedicines=clinicList(r.medicines);renderRxMedicineList();})]);
  rxMedicines=[{medicineId:'',dosage:'',quantity:'1'}];
  renderRxMedicineList();
}
async function fetchPrescriptions(){
  const tbody=document.getElementById('rx-tbody');if(!tbody)return;
  const serial=++clinicPrescriptionSerial;tbody.innerHTML=spinnerRow(6);
  try{
    const result=await apiRequest('/prescriptions');
    if(currentPage!=='prescriptions'||serial!==clinicPrescriptionSerial)return;
    appState.prescriptions=clinicList(result.prescriptions);
    renderPrescriptionsList(appState.prescriptions);
  }catch(e){if(serial===clinicPrescriptionSerial)tbody.innerHTML=errorRow(6,escapeClinical(e.message));}
}
function renderPrescriptionsList(records){
  const tbody=document.getElementById('rx-tbody');if(!tbody)return;
  clinicSetText('rx-count',`${records.length} records`);
  tbody.innerHTML=records.length?records.map(rx=>{
    const meds=clinicList(rx.medicines);
    const details=meds.map(m=>`${m.medicine_name||m.name||'Medicine'} · ${m.dosage||m.dose||'—'} (${m.quantity||m.qty||'—'} units)`).join('; ');
    const total=meds.reduce((sum,m)=>sum+Number(m.quantity||m.qty||0),0);
    return `<tr><td>${escapeClinical(rx.prescription_id)}</td><td>${escapeClinical(formatDate(rx.prescription_date||rx.date))}</td><td>${escapeClinical(rx.patient_name)}</td><td>${escapeClinical(rx.doctor_name)}</td><td title="${escapeClinical(details)}">${escapeClinical(meds.map(m=>m.medicine_name||m.name).join(', ')||'—')}</td><td>${total.toLocaleString('en-IN')}</td></tr>`;
  }).join(''):emptyRow(6,'No prescriptions recorded.');
}
function renderRxMedicineList(){
  const list=document.getElementById('rx-medicine-list');if(!list)return;
  list.innerHTML=rxMedicines.map((med,i)=>`<div class="rx-edit-row" data-idx="${i}">
    <select class="form-control" data-rx-field="medicineId" aria-label="Medicine ${i+1}" required>
      <option value="">Select medicine…</option>
      ${clinicMasterMedicines.map(m=>`<option value="${m.medicine_id||m.id}" ${String(m.medicine_id||m.id)===String(med.medicineId)?'selected':''}>${escapeClinical(m.name||m.medicine_name)}</option>`).join('')}
    </select>
    <input type="text" class="form-control" data-rx-field="dosage" placeholder="Dosage (e.g. 500 mg)" aria-label="Dosage" maxlength="100" value="${escapeClinical(med.dosage||'')}" required />
    <input type="number" class="form-control" data-rx-field="quantity" data-integer="true" step="1" min="1" placeholder="Units" aria-label="Units" value="${escapeClinical(med.quantity||'1')}" required />
    <button type="button" class="btn btn-outline btn-sm btn-icon" onclick="removeRxMedicine(${i})" title="Remove row" aria-label="Remove row"><i class="fas fa-xmark"></i> ×</button>
  </div>`).join('');
}
function changeRxMedicine(e){
  const node=e.target.closest('[data-rx-field]');if(!node)return;
  const i=Number(node.closest('[data-idx]')?.dataset.idx);
  if(Number.isInteger(i)&&rxMedicines[i])rxMedicines[i][node.dataset.rxField]=node.value;
}
function addRxMedicine(){rxMedicines.push({medicineId:'',dosage:'',quantity:'1'});renderRxMedicineList();}
function removeRxMedicine(i){rxMedicines.splice(i,1);if(!rxMedicines.length)rxMedicines.push({medicineId:'',dosage:'',quantity:'1'});renderRxMedicineList();}
async function submitRxForm(){
  const btn=document.getElementById('rx-form-submit');if(btn.disabled)return;
  let payload;
  try{
    const medicines=rxMedicines.map(m=>({medicineId:intClinical(m.medicineId,{min:1}),dosage:String(m.dosage||'').trim(),quantity:intClinical(m.quantity,{min:1})}));
    if(!medicines.every(m=>m.dosage&&m.dosage.length<=100))throw Error('Every medicine needs a dosage (maximum 100 characters).');
    if(new Set(medicines.map(m=>m.medicineId)).size!==medicines.length)throw Error('Combine duplicate medicines into one prescription row.');
    payload={patientId:getWhole('rx-patient-select',1),doctorId:getWhole('rx-doctor',1),medicines,prescriptionDate:document.getElementById('rx-date').value||null};
  }catch(e){toast(e.message,'error');return;}
  btn.disabled=true;
  try{await apiRequest('/prescriptions',{method:'POST',body:JSON.stringify(payload)});
    toast('Prescription issued.','success');closeModal('modal-rx-form');fetchPrescriptions();
  }catch(e){toast(e.message,'error');}finally{btn.disabled=false;}
}
function initSettings() { /* Read-only workspace; no fabricated settings-save action. */ }

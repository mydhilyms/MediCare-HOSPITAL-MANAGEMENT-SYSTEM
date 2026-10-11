/* Schema-aligned admin views for DBMS-PROJ (1).docx / 26 core HMS relations.
 * Loaded last: replaces legacy display-only columns and unsupported actions.
 * This file does not synthesize values which the PostgreSQL schema doesn't store.
 */
const sc = value => escapeClinical(value === null || value === undefined || value === '' ? '—' : String(value));
const scDate = value => value ? sc(formatDate(value)) : '—';
const scTime = value => value ? sc(String(value).slice(0, 5)) : '—';
const scMoney = value => sc(formatCurrency(value));
const scInt = (value, name='ID') => { const n=Number(value); if(!/^\d+$/.test(String(value)) || !Number.isSafeInteger(n) || n<1)throw Error(`${name} must be a positive whole number.`);return n; };
const scFloat = (value, name, max=Number.MAX_VALUE) => {const n=Number(value);if(String(value).trim()==='' || !Number.isFinite(n)||n<0||n>max)throw Error(`${name} must be a non-negative number.`);return n;};
const scEl=id=>document.getElementById(id);
const scVal=id=>scEl(id)?.value || '';
const scHtml=(id,content)=>{const e=scEl(id);if(e)e.innerHTML=content;};
const scTxt=(id,value)=>{const e=scEl(id);if(e)e.textContent=value;};
const scList=value=>Array.isArray(value)?value:[];
const scBadge = value => statusBadge(String(value||'unknown'));
const scListState = {};
// Header clicks sort actual rendered table cells; the same behavior applies to
// every schema-aligned register, without querying nonexistent database columns.
const scSortState={};
function scSortTable(tbody){
  const sort=scSortState[tbody.id];if(!sort)return;
  const rows=[...tbody.querySelectorAll('tr')];
  const numeric=text=>{
    const cleaned=text.replace(/[₹,%\s,]/g,'');
    return cleaned && /^-?\d+(\.\d+)?$/.test(cleaned)?Number(cleaned):null;
  };
  rows.sort((a,b)=>{
    const left=a.cells[sort.index]?.textContent.trim()||'', right=b.cells[sort.index]?.textContent.trim()||'';
    const l=numeric(left),r=numeric(right);
    return (l!==null&&r!==null?l-r:left.localeCompare(right,undefined,{numeric:true,sensitivity:'base'}))*sort.direction;
  });
  tbody.append(...rows);
}
function scEnableSort(tbody){
  const headings=tbody.closest('table')?.querySelectorAll('thead th')||[];
  headings.forEach((heading,index)=>{
    if(heading.dataset.noSort==='true'||/actions/i.test(heading.textContent))return;
    heading.style.cursor='pointer';heading.title=`Sort by ${heading.textContent.trim()}`;
    heading.onclick=()=>{
      const previous=scSortState[tbody.id];
      scSortState[tbody.id]={index,direction:previous?.index===index?-previous.direction:1};
      scSortTable(tbody);
    };
  });
  scSortTable(tbody);
}
const scRole=()=>document.body.dataset.accountRole||'';
const scCan=(...roles)=>roles.includes(scRole());
function scApplyRoleActions(){
  const buttons={
    'branch-add-btn':['ADMIN','STAFF'],
    'dept-add-btn':['ADMIN','STAFF'],
    'nurse-add-btn':['ADMIN','STAFF','NURSE'],
    'admission-add-btn':['ADMIN','DOCTOR','STAFF'],
    'paystructure-add-btn':['ADMIN','STAFF','BILLING'],
    'ot-add-btn':['ADMIN','DOCTOR','STAFF'],
    'lab-add-btn':['ADMIN','DOCTOR','NURSE','LAB'],
    'room-add-btn':['ADMIN','STAFF'],
    'doctorshift-add-btn':['ADMIN','STAFF','DOCTOR']
  };
  Object.entries(buttons).forEach(([id,roles])=>{const e=scEl(id);if(e)e.hidden=!scCan(...roles);});
}

async function scPopulate(id, endpoint, key, label, selected=''){
  const e=scEl(id);if(!e)return;
  const r=await apiRequest(endpoint);
  e.innerHTML='<option value="">Select…</option>'+scList(r[key]).map(x=>`<option value="${sc(label.id(x))}">${sc(label.text(x))}</option>`).join('');
  if(selected!==''&&selected!==null)e.value=String(selected);
}
const scLoadBranches=(id,selected='')=>scPopulate(id,'/branches','branches',{id:b=>b.branch_id,text:b=>`${b.location} (#${b.branch_id})`},selected);
const scLoadPatients=(id,selected='')=>scPopulate(id,'/patients','patients',{id:p=>p.patient_id,text:p=>`${p.name} (#${p.patient_id})`},selected);
function scError(e){toast(e?.message||'Request failed','error');}
function scBindSearch(searchId,fn){const el=scEl(searchId);if(el)el.oninput=debounce(fn,170);}
function scSimpleList({tableId,searchId,url,key,render}){
  const body=scEl(tableId);if(!body)return;
  body.innerHTML=spinnerRow(1);
  apiRequest(url).then(res=>{
    if(!document.contains(body))return;
    const rows=scList(res[key]);scListState[tableId]=rows;
    const redraw=()=>{
      const q=(scVal(searchId)||'').toLowerCase().trim();
      const filtered=!q?rows:rows.filter(row=>Object.values(row).some(value=>value!==null&&String(value).toLowerCase().includes(q)));
      body.innerHTML=filtered.length?filtered.map(render).join(''):`<tr><td colspan="20" class="text-muted">No matching records.</td></tr>`;
      scSortTable(body);
    };
    scBindSearch(searchId,redraw);redraw();scEnableSort(body);
  }).catch(e=>{if(document.contains(body))body.innerHTML=errorRow(1,sc(e.message));});
}

/* Account info is obtained from the verified server session, not a hardcoded admin label.
 * user_account records describe a ROLE; they are not automatically linked to a clinical employee ID.
 */
function scRenderAccount(user){
  if(!user||typeof user.username!=='string')return;
  const labels={ADMIN:'Administrator',DOCTOR:'Doctor',NURSE:'Nurse',STAFF:'Staff',BILLING:'Billing',PHARMACIST:'Pharmacist',LAB:'Laboratory'};
  const role=String(user.role||'').toUpperCase();
  document.querySelectorAll('.account-username').forEach(x=>x.textContent=user.username);
  document.querySelectorAll('.account-role').forEach(x=>x.textContent=labels[role]||role||'Unknown role');
  document.querySelectorAll('.account-avatar').forEach(x=>x.textContent=initials(user.username));
  scTxt('profile-username',user.username);scTxt('profile-role',labels[role]||role);
  document.body.dataset.accountRole=role;
  scApplyRoleActions();
  // Presentation-only navigation visibility; API authorization remains authoritative.
  const allowed={
    ADMIN:null,
    DOCTOR:['dashboard','patients','doctors','appointments','prescriptions','staff','admissions','reports','branches','departments','nurses','equipment','rooms','ot','labresults','doctorshifts','shiftlogs','settings'],
    NURSE:['dashboard','patients','doctors','appointments','prescriptions','admissions','branches','departments','nurses','equipment','rooms','ot','labresults','shiftlogs','settings'],
    STAFF:['dashboard','patients','doctors','appointments','prescriptions','billing','pharmacy','staff','admissions','reports','branches','departments','nurses','equipment','rooms','ot','labresults','doctorshifts','shiftlogs','paystructures','salaries','pharmacyinventory','settings'],
    BILLING:['dashboard','patients','doctors','appointments','billing','admissions','reports','branches','departments','paystructures','salaries','settings'],
    PHARMACIST:['pharmacy','pharmacyinventory','settings'],
    LAB:['labresults','settings']
  };
  const permitted=allowed[role]||null;
  document.querySelectorAll('.sidebar .nav-item[data-page]').forEach(el=>{el.hidden=Array.isArray(permitted)&&!permitted.includes(el.dataset.page);});
  const active=document.querySelector('.sidebar .nav-item[data-page].active');
  if(active?.hidden){navigate(permitted?.[0]||'dashboard');}
}
async function scRefreshAccount(){
  let saved=null;try{saved=JSON.parse(localStorage.getItem('hmsUser')||'null');}catch(_){}
  if(saved)scRenderAccount(saved);
  if(!getAuthToken())return;
  try{const profile=await apiRequest('/auth/me');if(profile.user){localStorage.setItem('hmsUser',JSON.stringify(profile.user));scRenderAccount(profile.user);}}
  catch(e){if(/401/.test(e.message))toast('Please sign in again.','warning');}
}
document.addEventListener('DOMContentLoaded',()=>{
  scRefreshAccount();
  scEl('logout-btn')?.addEventListener('click',()=>localStorage.removeItem('hmsUser'));
});
function initSettings(){
  let saved;try{saved=JSON.parse(localStorage.getItem('hmsUser')||'null');}catch(e){}
  if(saved)scRenderAccount(saved);scRefreshAccount();
}

/* Organizations: no address/phone/email/description fields in the approved schema. */
function initBranches(){
  fetchBranches();
  scEl('branch-add-btn').onclick=()=>{scVal('brf-name');scEl('brf-name').value='';scEl('brf-status').value='active';openModal('modal-branch-form');};
  scEl('branch-form-submit').onclick=submitBranchForm;
}
function fetchBranches(){scSimpleList({tableId:'branches-tbody',searchId:'branch-search',url:'/branches',key:'branches',render:b=>`<tr><td>${sc(b.branch_id)}</td><td class="fw-600">${sc(b.location)}</td><td>${scBadge(b.status)}</td></tr>`});}
async function submitBranchForm(){
  const btn=scEl('branch-form-submit');if(btn.disabled)return;
  const location=scVal('brf-name').trim(),status=scVal('brf-status');if(!location){toast('Branch location is required.','warning');return;}
  btn.disabled=true;try{await apiRequest('/branches',{method:'POST',body:JSON.stringify({location,status})});closeModal('modal-branch-form');fetchBranches();toast('Branch saved.','success');}catch(e){scError(e);}finally{btn.disabled=false;}
}
function initDepartments(){
  fetchDepartments();scEl('dept-form-submit').onclick=submitDeptForm;
  scEl('dept-add-btn').onclick=async()=>{scEl('dpf-name').value='';await scLoadBranches('dpf-branch').catch(scError);openModal('modal-dept-form');};
}
function fetchDepartments(){scSimpleList({tableId:'departments-tbody',searchId:'dept-search',url:'/departments',key:'departments',render:d=>`<tr><td>${sc(d.department_id)}</td><td class="fw-600">${sc(d.department_name)}</td><td>${sc(d.branch_location)}</td><td>${scBadge(d.status)}</td></tr>`});}
async function submitDeptForm(){
  const btn=scEl('dept-form-submit');if(btn.disabled)return;
  const name=scVal('dpf-name').trim();let branchId;
  try{branchId=scInt(scVal('dpf-branch'),'Branch ID');if(!name)throw Error('Department name is required.');}catch(e){scError(e);return;}
  btn.disabled=true;try{await apiRequest('/departments',{method:'POST',body:JSON.stringify({departmentName:name,branchId,status:scVal('dpf-status')})});closeModal('modal-dept-form');fetchDepartments();toast('Department saved.','success');}catch(e){scError(e);}finally{btn.disabled=false;}
}

/* Nurse's actual table: nurse_id, name, shift, branch_id. */
let scNurseEdit=null;
function initNurses(){
  fetchNurses();scEl('nurse-form-submit').onclick=submitNurseForm;
  scEl('nurse-add-btn').onclick=async()=>{scNurseEdit=null;scTxt('nurse-form-title','Add nurse');scEl('nrf-name').value='';scEl('nrf-shift').value='';try{await scLoadBranches('nrf-branch');openModal('modal-nurse-form');}catch(e){scError(e);}};
}
function fetchNurses(){scSimpleList({tableId:'nurses-tbody',searchId:'nurse-search',url:'/nurses',key:'nurses',render:n=>`<tr><td>${sc(n.nurse_id)}</td><td class="fw-600">${sc(n.name)}</td><td>${sc(n.shift)}</td><td>${sc(n.branch_location)} <span class="text-muted">(#${sc(n.branch_id)})</span></td><td>${scCan('ADMIN','STAFF')?`<button class="btn btn-outline btn-sm" onclick="scEditNurse(${Number(n.nurse_id)})">Edit</button>`:'—'}</td></tr>`});}
async function scEditNurse(id){
  const n=scListState['nurses-tbody']?.find(x=>x.nurse_id===id);if(!n)return;
  scNurseEdit=id;scTxt('nurse-form-title',`Edit nurse #${id}`);scEl('nrf-name').value=n.name||'';scEl('nrf-shift').value=n.shift||'';
  try{await scLoadBranches('nrf-branch',n.branch_id);openModal('modal-nurse-form');}catch(e){scError(e);}
}
async function submitNurseForm(){
  const btn=scEl('nurse-form-submit');if(btn.disabled)return;
  const name=scVal('nrf-name').trim(),shift=scVal('nrf-shift').trim()||null;let branchId;
  try{branchId=scInt(scVal('nrf-branch'),'Branch ID');if(!name)throw Error('Nurse name is required.');}catch(e){scError(e);return;}
  btn.disabled=true;
  try{await apiRequest(scNurseEdit?`/nurses/${scNurseEdit}`:'/nurses',{method:scNurseEdit?'PUT':'POST',body:JSON.stringify({name,shift,branchId})});closeModal('modal-nurse-form');fetchNurses();toast('Nurse saved.','success');}catch(e){scError(e);}finally{btn.disabled=false;}
}

/* Admissions: patient + composite (branch, room) allocation, no doctor field. */
function initAdmissions(){
  fetchAdmissions();scEl('admission-form-submit').onclick=submitAdmissionForm;
  scEl('admission-add-btn').onclick=async()=>{
    try{
      await Promise.all([scLoadPatients('adf-patient'),scLoadBranches('adf-branch')]);
      scEl('adf-branch').onchange=scLoadAdmissionRooms;await scLoadAdmissionRooms();
      scEl('adf-date').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
      openModal('modal-admission-form');
    }catch(e){scError(e);}
  };
}
async function scLoadAdmissionRooms(){
  const branch=scVal('adf-branch'),e=scEl('adf-room');if(!e)return;
  e.innerHTML='<option value="">Select room…</option>';
  if(!branch)return;
  try{const data=await apiRequest(`/rooms?branchId=${scInt(branch)}`);e.innerHTML+=[...(data.rooms||[])].filter(r=>r.availability_status==='available').map(r=>`<option value="${sc(r.room_no)}">${sc(r.room_no)} · ${sc(r.room_type)}</option>`).join('');}catch(ex){scError(ex);}
}
function fetchAdmissions(){scSimpleList({tableId:'admissions-tbody',searchId:'admission-search',url:'/admissions',key:'admissions',render:a=>`<tr><td>${sc(a.admission_id)}</td><td>${sc(a.patient_name)}</td><td>${sc(a.branch_location)}</td><td>${sc(a.room_no)}</td><td>${sc(a.admit_date_time?.replace('T',' ').slice(0,16))}</td><td>${a.discharge_date_time?sc(a.discharge_date_time.replace('T',' ').slice(0,16)):'Open'}</td><td>${!a.discharge_date_time?`<button class="btn btn-outline btn-sm" onclick="dischargePatient(${Number(a.admission_id)})">Discharge</button>`:'—'}</td></tr>`});}
async function submitAdmissionForm(){
  const btn=scEl('admission-form-submit');if(btn.disabled)return;
  let patientId,branchId;try{patientId=scInt(scVal('adf-patient'),'Patient');branchId=scInt(scVal('adf-branch'),'Branch');if(!scVal('adf-room')||!scVal('adf-date'))throw Error('Room and admission datetime are required.');}catch(e){scError(e);return;}
  btn.disabled=true;try{await apiRequest('/admissions',{method:'POST',body:JSON.stringify({patientId,branchId,roomNo:scVal('adf-room'),admitDateTime:scVal('adf-date')})});closeModal('modal-admission-form');fetchAdmissions();toast('Patient admitted.','success');}catch(e){scError(e);}finally{btn.disabled=false;}
}

/* Equipment: location is NOT serial no, and branch is NOT department. */
function initEquipment(){fetchEquipment();}
function fetchEquipment(){scSimpleList({tableId:'equipment-tbody',searchId:'equipment-search',url:'/equipment',key:'equipment',render:e=>`<tr><td>${sc(e.equipment_id)}</td><td class="fw-600">${sc(e.name)}</td><td>${sc(e.branch_location)}</td><td>${sc(e.location)}</td><td>${scDate(e.maintenance_date)}</td><td>${scBadge(e.status)}</td></tr>`});}
function initShiftLogs(){fetchShiftLogs();}
function fetchShiftLogs(){scSimpleList({tableId:'shiftlogs-tbody',searchId:'shiftlog-search',url:'/shift-logs',key:'shifts',render:s=>`<tr><td>${sc(s.shift_log_id)}</td><td class="fw-600">${sc(s.staff_name)}</td><td>${s.doctor_id?'Doctor':s.nurse_id?'Nurse':'Staff'}</td><td>${sc(s.branch_location)}</td><td>${scDate(s.shift_date)}</td><td>${scTime(s.start_time)}</td><td>${scTime(s.end_time)}</td><td>${scBadge(s.status)}</td></tr>`});}

/* PayStructure has a multiplier allowance_rate (not HRA + overtime salary fields). */
function initPayStructures(){
  fetchPayStructures();scEl('paystructure-form-submit').onclick=submitPayStructureForm;
  scEl('paystructure-add-btn').onclick=()=>{scEl('psf-basic').value='';scEl('psf-rate').value='0';openModal('modal-paystructure-form');};
}
function fetchPayStructures(){scSimpleList({tableId:'paystructures-tbody',searchId:'paystructure-search',url:'/pay-structures',key:'payStructures',render:p=>`<tr><td>${sc(p.pay_structure_id)}</td><td class="fw-600">${sc(p.employee_type)}</td><td>${scMoney(p.base_pay)}</td><td>${sc((Number(p.allowance_rate||0)*100).toFixed(2)+'%')}</td><td>${scBadge(p.status)}</td></tr>`});}
async function submitPayStructureForm(){
  const btn=scEl('paystructure-form-submit');if(btn.disabled)return;let basePay,allowanceRate;
  try{basePay=scFloat(scVal('psf-basic'),'Base pay');allowanceRate=scFloat(scVal('psf-rate'),'Allowance rate',99.9999);}catch(e){scError(e);return;}
  btn.disabled=true;try{await apiRequest('/pay-structures',{method:'POST',body:JSON.stringify({employeeType:scVal('psf-role'),basePay,allowanceRate,status:scVal('psf-status')})});closeModal('modal-paystructure-form');fetchPayStructures();toast('Pay structure saved.','success');}catch(e){scError(e);}finally{btn.disabled=false;}
}
/* Salary payments are not represented by a status or deduction column in the schema. */
function initSalaries(){fetchSalaries();}
function fetchSalaries(){scSimpleList({tableId:'salaries-tbody',searchId:'salary-search',url:'/salaries',key:'salaries',render:s=>`<tr><td>${sc(s.salary_id)}</td><td class="fw-600">${sc(s.staff_name)}</td><td>${sc(s.branch_id)}</td><td>${scDate(s.pay_month)}</td><td>${scMoney(s.base_pay_applied)}</td><td>${scMoney(s.allowance_applied)}</td><td>${scMoney(s.salary_amount)}</td></tr>`});}

/* OT scheduling: explicit same-branch nurse rather than auto-picking the first nurse. */
let scTheatres=[];
function initOT(){fetchOTTheatres();fetchOTSchedules();scEl('ot-schedule-submit').onclick=submitOTSchedule;
  scEl('ot-add-btn').onclick=async()=>{try{
    const [theatres,doctors,patients]=await Promise.all([apiRequest('/ot/theatres'),apiRequest('/doctors?status=active'),apiRequest('/patients')]);
    scTheatres=scList(theatres.theatres);
    scHtml('otf-theatre','<option value="">Select theatre…</option>'+scTheatres.map(t=>`<option value="${t.ot_id}">${sc(t.theatre_name)} · ${sc(t.branch_location)}</option>`).join(''));
    scHtml('otf-doctor','<option value="">Select doctor…</option>'+scList(doctors.doctors).map(d=>`<option value="${d.id}">${sc(d.name)}</option>`).join(''));
    scHtml('otf-patient','<option value="">Select patient…</option>'+scList(patients.patients).map(p=>`<option value="${p.patient_id}">${sc(p.name)}</option>`).join(''));
    scEl('otf-theatre').onchange=scLoadOtNurses;await scLoadOtNurses();openModal('modal-ot-form');
  }catch(e){scError(e);}};
}
async function scLoadOtNurses(){
 const ot=scTheatres.find(t=>String(t.ot_id)===scVal('otf-theatre'));
 scHtml('otf-nurse','<option value="">Select nurse…</option>');if(!ot)return;
 try{const r=await apiRequest(`/nurses?branchId=${scInt(ot.branch_id)}`);scHtml('otf-nurse','<option value="">Select nurse…</option>'+scList(r.nurses).map(n=>`<option value="${n.nurse_id}">${sc(n.name)} · ${sc(n.shift)}</option>`).join(''));}catch(e){scError(e);}
}
function fetchOTSchedules(){scSimpleList({tableId:'ot-tbody',searchId:null,url:'/ot/schedules',key:'schedules',render:s=>`<tr><td>${sc(s.ot_schedule_id)}</td><td>${sc(s.theatre_name)}</td><td>${sc(s.patient_name)}</td><td>${sc(s.doctor_name)}</td><td>${sc(s.nurse_name)}</td><td>${sc(s.procedure)}</td><td>${scDate(s.schedule_start)}</td><td>${sc(String(s.schedule_start||'').slice(11,16))} – ${sc(String(s.schedule_end||'').slice(11,16))}</td><td>${scBadge(s.status)}</td><td>${s.status==='scheduled'?`<button class="btn btn-outline btn-sm" onclick="updateOTStatus(${Number(s.ot_schedule_id)},'completed')">Complete</button>`:'—'}</td></tr>`});}
async function submitOTSchedule(){const btn=scEl('ot-schedule-submit');if(btn.disabled)return;let theatreId,patientId,doctorId,nurseId;
  try{theatreId=scInt(scVal('otf-theatre'),'Theatre');patientId=scInt(scVal('otf-patient'),'Patient');doctorId=scInt(scVal('otf-doctor'),'Doctor');nurseId=scInt(scVal('otf-nurse'),'Nurse');if(!scVal('otf-date')||!scVal('otf-start')||!scVal('otf-end')||scVal('otf-start')>=scVal('otf-end'))throw Error('Valid OT date, start and end times required.');}catch(e){scError(e);return;}
  btn.disabled=true;try{await apiRequest('/ot/schedules',{method:'POST',body:JSON.stringify({theatreId,patientId,doctorId,nurseId,procedureName:scVal('otf-procedure').trim()||'Surgery',scheduledDate:scVal('otf-date'),startTime:scVal('otf-start'),endTime:scVal('otf-end')})});closeModal('modal-ot-form');fetchOTSchedules();toast('OT scheduled.','success');}catch(e){scError(e);}finally{btn.disabled=false;}
}
/* LabResult: no doctor_id, normal_range, or status stored; status is derived from result_date. */
let scLabEdit=null;
function initLabResults(){
  fetchLabResults();scEl('lab-form-submit').onclick=submitLabResult;
  scEl('lab-add-btn').onclick=async()=>{
    scLabEdit=null;
    try{
      await scLoadPatients('lf-patient');scEl('lf-patient').disabled=false;
      scTxt('lab-form-title','Add lab result');
      scEl('lf-order-date').value=new Date().toISOString().slice(0,10);
      scEl('lf-result-date').value='';scEl('lf-test').value='';scEl('lf-result').value='';
      openModal('modal-lab-form');
    }catch(e){scError(e);}
  };
}
function fetchLabResults(){scSimpleList({tableId:'lab-tbody',searchId:'lab-search',url:'/lab-results',key:'labResults',render:l=>`<tr><td>${sc(l.lab_result_id)}</td><td>${sc(l.patient_name)}</td><td>${sc(l.test_type)}</td><td>${scDate(l.order_date)}</td><td>${scDate(l.result_date)}</td><td>${sc(l.result_details)}</td><td>${!l.result_date&&scCan('ADMIN','DOCTOR','NURSE','LAB')?`<button class="btn btn-outline btn-sm" onclick="scCompleteLab(${Number(l.lab_result_id)})">Enter result</button>`:'—'}</td></tr>`});}
async function scCompleteLab(id){
  const lab=scListState['lab-tbody']?.find(l=>Number(l.lab_result_id)===Number(id));if(!lab)return;
  scLabEdit=Number(id);scTxt('lab-form-title',`Record lab result #${id}`);
  try{
    await scLoadPatients('lf-patient',lab.patient_id);
    scEl('lf-patient').disabled=true;
    scEl('lf-order-date').value=String(lab.order_date||'').slice(0,10);
    scEl('lf-test').value=lab.test_type||'';
    scEl('lf-result-date').value=String(lab.result_date||new Date().toISOString().slice(0,10)).slice(0,10);
    scEl('lf-result').value=lab.result_details||'';
    openModal('modal-lab-form');
  }catch(e){scError(e);}
}
async function submitLabResult(){
  const btn=scEl('lab-form-submit');if(btn.disabled)return;
  const resultDetails=scVal('lf-result').trim();let patientId;
  try{
    if(!scLabEdit)patientId=scInt(scVal('lf-patient'),'Patient');
    if(!scVal('lf-test').trim()||!scVal('lf-order-date'))throw Error('Test type and order date are required.');
    if(scVal('lf-result-date')&&scVal('lf-result-date')<scVal('lf-order-date'))throw Error('Result date must not be before order date.');
    if(scLabEdit&&!resultDetails)throw Error('Enter test result details before completing the lab record.');
  }catch(e){scError(e);return;}
  btn.disabled=true;
  try{
    const body={testType:scVal('lf-test').trim(),resultDate:scVal('lf-result-date')||null,resultDetails:resultDetails||null};
    if(!scLabEdit){body.patientId=patientId;body.orderDate=scVal('lf-order-date');}
    await apiRequest(scLabEdit?`/lab-results/${scLabEdit}`:'/lab-results',{method:scLabEdit?'PUT':'POST',body:JSON.stringify(body)});
    closeModal('modal-lab-form');fetchLabResults();toast('Lab record saved.','success');
  }catch(e){scError(e);}finally{btn.disabled=false;}
}

/* Composite room PK (branch_id,room_no), not a synthetic room ID/capacity. */
function initRooms(){fetchRooms();scEl('room-add-btn').onclick=async()=>{try{await scLoadBranches('rf-branch');openModal('modal-room-form');}catch(e){scError(e);}};scEl('room-form-submit').onclick=submitRoomForm;scEl('room-type-filter').onchange=fetchRooms;}
function fetchRooms(){
 const body=scEl('rooms-tbody');if(!body)return;body.innerHTML=spinnerRow(6);
 apiRequest('/rooms').then(r=>{if(!document.contains(body))return;const rows=scList(r.rooms);renderRoomsStats(rows);let filtered=rows;
  const q=scVal('room-search').trim().toLowerCase(),kind=scVal('room-type-filter');if(q)filtered=filtered.filter(x=>`${x.room_no} ${x.branch_location}`.toLowerCase().includes(q));if(kind&&kind!=='All Types')filtered=filtered.filter(x=>x.room_type===kind);
  body.innerHTML=filtered.length?filtered.map(x=>`<tr><td>${sc(x.branch_id)}</td><td class="fw-600">${sc(x.room_no)}</td><td>${sc(x.room_type)}</td><td>${x.critical_care_monitoring?'Yes':'No'}</td><td>${scBadge(x.availability_status)}</td><td>${scCan('ADMIN','STAFF')?`<button class="btn btn-outline btn-sm" onclick="toggleRoomStatus('${sc(x.id)}','${sc(x.availability_status)}')">Toggle availability</button>`:'—'}</td></tr>`).join(''):emptyRow(6,'No matching rooms.');
  scBindSearch('room-search',fetchRooms);scEnableSort(body);
 }).catch(e=>body.innerHTML=errorRow(6,sc(e.message)));
}
async function submitRoomForm(){const btn=scEl('room-form-submit');if(btn.disabled)return;let branchId;
 try{branchId=scInt(scVal('rf-branch'),'Branch ID');if(!scVal('rf-number').trim())throw Error('Room number is required.');}catch(e){scError(e);return;}
 btn.disabled=true;try{await apiRequest('/rooms',{method:'POST',body:JSON.stringify({branchId,roomNo:scVal('rf-number').trim(),roomType:scVal('rf-type'),criticalCareMonitoring:scVal('rf-monitor')==='true',availabilityStatus:scVal('rf-status')})});closeModal('modal-room-form');fetchRooms();toast('Room saved.','success');}catch(e){scError(e);}finally{btn.disabled=false;}
}
/* Shift is identified by (doctor_id, branch_id, shift_start): no stored 'completed' status. */
function initDoctorShifts(){fetchDoctorShifts();scEl('doctorshift-form-submit').onclick=submitDoctorShiftForm;scEl('doctorshift-add-btn').onclick=async()=>{try{await Promise.all([populateDoctorSelect('dsf-doctor'),scLoadBranches('dsf-branch')]);openModal('modal-doctorshift-form');}catch(e){scError(e);}};}
function fetchDoctorShifts(){scSimpleList({tableId:'doctorshifts-tbody',searchId:'doctorshift-search',url:'/doctor-shifts',key:'shifts',render:s=>`<tr><td>${sc(s.doctor_name)}</td><td>${sc(s.branch_name)}</td><td>${sc(String(s.shift_start||'').replace('T',' ').slice(0,16))}</td><td>${sc(String(s.shift_end||'').replace('T',' ').slice(0,16))}</td><td><button class="btn btn-outline btn-sm" onclick="deleteDoctorShiftRecord('${sc(s.shift_id)}')">Remove</button></td></tr>`});}

/* Secondary pharmacy inventory view: use the same real inventory columns as Pharmacy. */
async function fetchPharmacies(){const e=scEl('pharmacy-branches-list');if(!e)return;
  try{const r=await apiRequest('/pharmacy');e.innerHTML=scList(r.pharmacies).map(p=>`<button class="btn btn-outline" data-pharmacy-id="${p.pharmacy_id}">${sc(p.branch_location)} · pharmacy #${sc(p.pharmacy_id)}</button>`).join('')||'No pharmacies configured.';
   e.querySelectorAll('[data-pharmacy-id]').forEach(b=>b.onclick=()=>loadPharmacyInventory(b.dataset.pharmacyId,b.textContent));
  }catch(ex){scError(ex);}
}
async function loadPharmacyInventory(pharmacyId,name){
 const el=scEl('pharmacy-inv-section');if(!el)return;el.style.display='block';el.innerHTML='<div class="table-state">Loading inventory…</div>';
 try{const r=await apiRequest(`/pharmacy/${scInt(pharmacyId)}/inventory`);el.innerHTML=`<h3 class="fw-600 mb-4">${sc(name)}</h3><div class="table-wrap"><table class="table"><thead><tr><th>Medicine ID</th><th>Medicine</th><th>Stock quantity</th><th>Reorder level</th><th>Price (₹)</th></tr></thead><tbody>${scList(r.inventory).map(i=>`<tr><td>${sc(i.medicine_id)}</td><td>${sc(i.medicine_name)}</td><td>${sc(i.stock_quantity)}</td><td>${sc(i.reorder_level)}</td><td>${scMoney(i.price)}</td></tr>`).join('')||'<tr><td colspan="5">No items.</td></tr>'}</tbody></table></div>`;}catch(ex){el.innerHTML=errorRow(5,sc(ex.message));}
}

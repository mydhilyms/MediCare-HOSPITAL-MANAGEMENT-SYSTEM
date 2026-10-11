/* Clinical dashboard refinements. Depends on app.js and its API helpers.
   No demo statistics or fabricated year data are used. */
const escapeClinical = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const intClinical = (value, {min=0,required=true}={}) => {
  const s=String(value??'').trim();
  if (!s && !required) return null;
  if (!/^\d+$/.test(s) || !Number.isSafeInteger(Number(s)) || Number(s)<min) throw new Error(`Please enter a whole number${min ? ` of at least ${min}` : ''}.`);
  return Number(s);
};
const moneyClinical = value => {
  const s=String(value??'').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s) || !Number.isFinite(Number(s))) throw new Error('Amount must be a non-negative value with at most two decimal places.');
  return +s;
};
function getWhole(id, min=0) { return intClinical(document.getElementById(id)?.value, {min}); }
function validateNumericForm(container) {
  for(const input of container?.querySelectorAll('input[data-integer="true"], input[type="number"][step="1"]') || []) {
    if (input.value === '' && !input.required) continue;
    try { intClinical(input.value, {min: input.min === '' ? 0 : Number(input.min),required:true}); input.removeAttribute('aria-invalid'); }
    catch(e) { input.setAttribute('aria-invalid','true'); input.focus(); toast(`${input.closest('.form-group')?.querySelector('label')?.textContent||'Value'}: whole numbers only.`,'error'); return false; }
  }
  return true;
}
// Guard backend-bound numeric values as well as input UI; avoid send of fractional integer IDs.
const nativeApiRequest=apiRequest;
apiRequest = async (path, options={}) => {
  if(options.body && typeof options.body==='string') {
    let b; try { b=JSON.parse(options.body); } catch(e) { b=null; }
    if (b && typeof b==='object') {
      const integerFields=['patientId','doctorId','departmentId','branchId','medicineId','pharmacyId','stockQuantity','quantity','reorderLevel','capacity','staffId','nurseId','theatreId','tokenNo','roomId','durationDays','admissionId','salaryId','payStructureId'];
      for(const field of integerFields) if(b[field]!==undefined && b[field]!==null && b[field]!=='') {
        if (!/^\d+$/.test(String(b[field])) || !Number.isSafeInteger(Number(b[field])) || Number(b[field])<0) throw new Error(`${field} must be a whole number.`);
      }
    }
  }
  return nativeApiRequest(path,options);
};

const clinicalCharts={};
function paintClinicalChart(id, type, labels, datasets, options={}) {
  const el=document.getElementById(id);
  if(!el) return;
  if(typeof Chart==='undefined') { el.parentElement.textContent='Charts require Chart.js to load.'; return; }
  if(clinicalCharts[id]) clinicalCharts[id].destroy();
  const context=el.getContext('2d');
  const gradient = (top,bottom) => {
    const g=context.createLinearGradient(0,0,0,245); g.addColorStop(0,top);g.addColorStop(1,bottom);return g;
  };
  const chartDatasets=datasets.map((d,i)=>({
    borderWidth: type==='bar'?0:2,
    pointRadius:0,pointHoverRadius:4,pointHitRadius:14,
    fill:type==='line',tension:.38,
    maxBarThickness:22,barPercentage:.65,categoryPercentage:.84,borderRadius:3,
    backgroundColor: type==='line' ? gradient(i===0?'rgba(171,139,253,.33)':'rgba(167,185,195,.16)','rgba(27,27,35,.01)') : (i===0?'rgba(166,129,253,.83)':'rgba(114,123,150,.38)'),
    borderColor:i===0?'#b69aff':'#868fa3',
    ...d
  }));
  clinicalCharts[id]=new Chart(context,{type,data:{labels,datasets:chartDatasets},options:{
    responsive:true, maintainAspectRatio:false, animation:{duration:620,easing:'easeOutQuart'},
    interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:datasets.length>1,position:'bottom',align:'start',labels:{usePointStyle:true,pointStyle:'circle',boxWidth:7,boxHeight:7,padding:14,color:'#9a9ca6',font:{size:10}}},tooltip:{backgroundColor:'#22232a',borderColor:'#484550',borderWidth:1,titleColor:'#dddfe6',bodyColor:'#c3c4d2',padding:10,cornerRadius:5,displayColors:true}},
    scales:{x:{grid:{display:false},border:{display:false},ticks:{color:'#82838d',font:{size:10},maxRotation:0}},y:{beginAtZero:true,grid:{color:'rgba(128,132,151,.15)',drawTicks:false},border:{display:false},ticks:{color:'#838592',font:{size:10},padding:10,callback:options.currency ? v => `₹${Number(v).toLocaleString('en-IN')}` : undefined}}},
    ...options
  }});
}
function buildApptChart(d) {
  paintClinicalChart('appt-chart','bar',d.labels,[{label:'Appointments',data:d.appointments||d.confirmed||[]}]);
}
function buildPatientChart(d) {
  paintClinicalChart('patient-chart','line',d.labels,[{label:'Patients seen',data:d.patients||d.inpatient||[]},{label:'Admissions',data:d.admissions||d.outpatient||[]}]);
}
function buildDeptChart(d) {
  const el=document.getElementById('dept-chart');if(!el)return;
  if(typeof Chart==='undefined'){el.parentElement.textContent='Charts require Chart.js to load.';return;}
  if(clinicalCharts['dept-chart'])clinicalCharts['dept-chart'].destroy();
  clinicalCharts['dept-chart']=new Chart(el,{type:'doughnut',data:{labels:d.labels||[],datasets:[{data:d.data||[],backgroundColor:['#a98cf7','#7c70a0','#5c5c80','#6f7586','#3a3c49','#b4bed0','#9f85c3'],borderColor:'#17181c',borderWidth:3,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:'73%',animation:{duration:600},plugins:{legend:{position:'right',labels:{color:'#9b9da8',boxWidth:9,boxHeight:9,padding:10,font:{size:10}}},tooltip:{backgroundColor:'#22232a',titleColor:'#f3f3f7',bodyColor:'#e9e9ed'}}}});
}
function buildRevenueChart(canvasId,d){
  paintClinicalChart(canvasId,'line',d.labels,[{label:'Paid',data:d.revenue||d.paid||[]},{label:'Outstanding',data:d.expenses||d.outstanding||[]}],{currency:true});
}
const emptyMonths=()=>['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(month=>({month,paid:0,outstanding:0,appointments:0,patients:0,admissions:0}));
let dashboardRequest=0;
let currentTrendRows=[];
async function setClinicalYearOptions(selectId){
  const sel=document.getElementById(selectId);if(!sel)return;
  let years=[new Date().getFullYear()];
  try{const res=await apiRequest('/reports/years'); years=(res.years||[]).filter(Number.isInteger);if(!years.length)years=[new Date().getFullYear()];}catch(e){ /* first-run database may have no records */ }
  const existing=sel.value;
  sel.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
  sel.value=years.includes(+existing)?existing:String(years[0]);
  return sel.value;
}
function updateDashboardStats(stats){
  [['dash-patients',stats.totalPatients],['dash-doctors',stats.totalDoctors],['dash-appointments',stats.upcomingAppointments],['dash-occupancy',`${Number(stats.occupancyPct||0).toFixed(1)}%`]].forEach(([id,v])=>{
    const el=document.getElementById(id);if(el)el.textContent=v===undefined?'—':(typeof v==='number'?v.toLocaleString('en-IN'):v);
  });
}
function renderDashboardSchedule(appts) {
  const panel=document.getElementById('dashboard-timeline');if(!panel)return;
  const list=Array.isArray(appts)?appts:[];
  panel.innerHTML=list.length ? `<div class="timeline-list">${list.slice(0,7).map(a=>{
    const day=formatDate(a.appointmentDate||a.appointment_date);
    const when=String(a.startTime||a.appointmentTime||a.appointment_time||'').slice(0,5);
    return `<div class="timeline-entry"><div class="timeline-time">${escapeClinical(when||'—')}<div class="timeline-date-label">${escapeClinical(day)}</div></div><div class="timeline-rail"></div><div><div class="timeline-title">${escapeClinical(a.patientName||a.patient_name)}</div><div class="timeline-meta">${escapeClinical(a.doctorName||a.doctor_name)}</div></div>${statusBadge(a.status)}</div>`;
  }).join('')}</div>`:'<div class="table-state empty">No upcoming appointments.</div>';
}
async function initDashboard(){
  await setClinicalYearOptions('dashboard-year');
  const sel=document.getElementById('dashboard-year');if(sel)sel.onchange=()=>loadDashboardData();
  const refresh=document.getElementById('dashboard-refresh');if(refresh)refresh.onclick=()=>loadDashboardData();
  await loadDashboardData();
}
async function loadDashboardData(){
  const serial=++dashboardRequest;
  const year=Number(document.getElementById('dashboard-year')?.value||new Date().getFullYear());
  const results=await Promise.allSettled([
    apiRequest('/dashboard/stats'),
    apiRequest(`/reports/trends?year=${year}`),
    apiRequest('/dashboard/departments'),
    apiRequest('/dashboard/appointments')
  ]);
  if(serial!==dashboardRequest || currentPage!=='dashboard')return;
  const unpack=(i,def)=>results[i].status==='fulfilled'?results[i].value:def;
  const stats=unpack(0,{}).stats||{};
  const months=unpack(1,{}).months||emptyMonths();
  const depts=unpack(2,{}).departments||[];
  const appts=unpack(3,{}).appointments||[];
  const total=months.reduce((sum,m)=>sum+Number(m.paid||0),0);
  const revenueEl=document.getElementById('dashboard-revenue-total');if(revenueEl)revenueEl.textContent=formatCurrency(total);
  const period=document.getElementById('dashboard-revenue-period');if(period)period.textContent=`Jan–Dec ${year} · collected payments`;
  const yearLabel=document.getElementById('dashboard-revenue-count');if(yearLabel)yearLabel.textContent=`${year} · 12 months`;
  ['dashboard-appt-year','dashboard-patient-year'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=String(year);});
  updateDashboardStats(stats);
  buildRevenueChart('revenue-chart-dash',{labels:months.map(m=>m.month),revenue:months.map(m=>m.paid),expenses:months.map(m=>m.outstanding)});
  buildApptChart({labels:months.map(m=>m.month),appointments:months.map(m=>m.appointments)});
  buildPatientChart({labels:months.map(m=>m.month),patients:months.map(m=>m.patients),admissions:months.map(m=>m.admissions)});
  buildDeptChart({labels:depts.map(d=>d.department_name),data:depts.map(d=>Number(d.appointment_count||0))});
  renderDashboardSchedule(appts);
  if(results.some(r=>r.status==='rejected'))toast('Some dashboard data could not be loaded. Check API connection.','warning');
}
let reportRequest=0;
async function initReports(){
  await setClinicalYearOptions('reports-year');
  const selector=document.getElementById('reports-year');if(selector)selector.onchange=()=>loadReportsData();
  const exportButton=document.getElementById('reports-export');if(exportButton)exportButton.onclick=exportClinicalCSV;
  await loadReportsData();
}
async function loadReportsData(){
  const serial=++reportRequest;
  const year=Number(document.getElementById('reports-year')?.value||new Date().getFullYear());
  try{
    const res=await apiRequest(`/reports/trends?year=${year}`);
    if(serial!==reportRequest||currentPage!=='reports')return;
    currentTrendRows=res.months||emptyMonths();
    const total=field=>currentTrendRows.reduce((sum,m)=>sum+Number(m[field]||0),0);
    [['rpt-revenue',formatCurrency(total('paid'))],['rpt-outstanding',formatCurrency(total('outstanding'))],['rpt-appts',total('appointments').toLocaleString()],['rpt-patients',total('patients').toLocaleString()]].forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.textContent=val;});
    buildRevenueChart('revenue-chart',{labels:currentTrendRows.map(m=>m.month),revenue:currentTrendRows.map(m=>m.paid),expenses:currentTrendRows.map(m=>m.outstanding)});
    paintClinicalChart('rpt-patient-chart','line',currentTrendRows.map(m=>m.month),[{label:'Patient visits',data:currentTrendRows.map(m=>m.patients)},{label:'Admissions',data:currentTrendRows.map(m=>m.admissions)}]);
    const tbody=document.getElementById('rpt-monthly-body');if(tbody)tbody.innerHTML=currentTrendRows.map(m=>`<tr><td class="fw-600">${escapeClinical(m.month)} ${year}</td><td>${formatCurrency(m.paid)}</td><td>${formatCurrency(m.outstanding)}</td><td>${Number(m.appointments).toLocaleString()}</td><td>${Number(m.patients).toLocaleString()}</td><td>${Number(m.admissions).toLocaleString()}</td></tr>`).join('');
  } catch(e){toast(e.message||'Failed to load trends','error');const tb=document.getElementById('rpt-monthly-body');if(tb)tb.innerHTML=errorRow(6,'Unable to retrieve report data.');}
}
function exportClinicalCSV(){
  if(!currentTrendRows.length){toast('No report loaded','warning');return;}
  const year=document.getElementById('reports-year')?.value||new Date().getFullYear();
  const rows=[['Month','Paid revenue','Outstanding','Appointments','Unique patient visits','Admissions'],...currentTrendRows.map(m=>[`${m.month} ${year}`,m.paid,m.outstanding,m.appointments,m.patients,m.admissions])];
  const text=rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`medicare-trends-${year}.csv`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
}

// Doctors: numeric department IDs, complete edit round-trip, archive without FK loss.
async function fillDoctorDepartmentSelect(selected='') {
  const sel=document.getElementById('df-dept-id');if(!sel)return;
  try {
    const res=await apiRequest('/departments');
    sel.innerHTML='<option value="">Select department…</option>'+(res.departments||[]).map(d=>`<option value="${d.department_id||d.id}">${escapeClinical(d.department_name||d.name)} · ${escapeClinical(d.branch_location||d.branch_name||'Branch '+d.branch_id)}</option>`).join('');
    sel.value=String(selected||'');
  } catch(e){sel.innerHTML='<option value="">Unable to load departments</option>';toast(e.message,'error');}
}
async function fillDoctorFilter() {
  const sel=document.getElementById('doctor-dept-filter');if(!sel)return;
  try {
    const res=await apiRequest('/departments');
    sel.innerHTML='<option value="">All departments</option>'+(res.departments||[]).map(d=>`<option value="${d.department_id||d.id}">${escapeClinical(d.department_name||d.name)}</option>`).join('');
  } catch(e){toast(e.message,'error');}
}
function initDoctors(){
  const search=document.getElementById('doctor-search');
  if(search)search.oninput=debounce(()=>fetchDoctors(),180);
  const dept=document.getElementById('doctor-dept-filter');if(dept)dept.onchange=()=>fetchDoctors();
  const status=document.getElementById('doctor-status-filter');if(status)status.onchange=()=>fetchDoctors();
  const add=document.getElementById('doctor-form-add-btn');if(add)add.onclick=()=>openAddDoctorModal();
  const save=document.getElementById('doctor-form-submit');if(save)save.onclick=submitDoctorForm;
  fillDoctorFilter().then(fetchDoctors);
}
let doctorLoadSerial=0;
async function fetchDoctors(){
  const tbody=document.getElementById('doctors-tbody');if(!tbody)return;
  const serial=++doctorLoadSerial;
  tbody.innerHTML=spinnerRow(8);
  const qs=new URLSearchParams();
  const search=document.getElementById('doctor-search')?.value.trim();if(search)qs.set('search',search);
  const department=document.getElementById('doctor-dept-filter')?.value;if(department)qs.set('department',department);
  qs.set('status',document.getElementById('doctor-status-filter')?.value||'active');
  try{
    const data=await apiRequest(`/doctors?${qs}`);
    if(serial!==doctorLoadSerial||currentPage!=='doctors')return;
    appState.doctorsRaw=data.doctors||[];
    appState.doctors=appState.doctorsRaw.map(normalizeDoctorRow);
    renderDoctorsGrid(appState.doctors);
    const count=document.getElementById('doctor-count');if(count)count.textContent=`· ${appState.doctors.length}`;
    const footer=document.getElementById('doctor-list-status');if(footer)footer.textContent=`${appState.doctors.length} records · Click a column header to sort`;
  }catch(e){if(serial===doctorLoadSerial)tbody.innerHTML=errorRow(8,e.message);}
}
function normalizeDoctorRow(row){
  return {id:String(row.id??row.doctorId??row.doctor_id),name:row.name||row.doctorName||'',spec:row.specialization||'',dept:row.departmentName||row.department_name||'',departmentId:row.departmentId||row.department_id,branch:row.branchLocation||row.branch_location||'',phone:row.phone||'',active:row.isActive!==false,status:row.isActive===false?'Archived':'Active'};
}
function renderDoctorsGrid(rows){
  const tbody=document.getElementById('doctors-tbody');if(!tbody)return;
  if(!rows.length){tbody.innerHTML=emptyRow(8,'No matching doctors.','fa-user-doctor');return;}
  tbody.innerHTML=rows.map(d=>`<tr>
    <td class="text-muted">${escapeClinical(d.id)}</td>
    <td><div class="flex items-center gap-2"><div class="avatar avatar-sm">${escapeClinical(initials(d.name))}</div><span class="fw-600">${escapeClinical(d.name)}</span></div></td>
    <td>${escapeClinical(d.spec||'—')}</td><td>${escapeClinical(d.dept)}</td><td>${escapeClinical(d.branch||'—')}</td><td>${escapeClinical(d.phone||'—')}</td>
    <td>${statusBadge(d.status)}</td>
    <td><div class="flex gap-1"><button class="btn btn-outline btn-sm btn-icon" title="View doctor" onclick="viewDoctor('${d.id}')"><i class="fas fa-eye"></i></button>
      <button class="btn btn-outline btn-sm btn-icon" title="Edit doctor" onclick="editDoctor('${d.id}')"><i class="fas fa-pen"></i></button>
      ${d.active?`<button class="btn btn-danger btn-sm btn-icon" title="Archive doctor" onclick="deleteDoctor('${d.id}')"><i class="fas fa-archive"></i></button>`:`<button class="btn btn-outline btn-sm" title="Restore doctor" onclick="restoreDoctor('${d.id}')">Restore</button>`}
    </div></td>
  </tr>`).join('');
}
function viewDoctor(id){
  const d=appState.doctors.find(x=>x.id===String(id));if(!d)return;
  const el=document.getElementById('view-doctor-content');if(!el)return;
  el.innerHTML=`<div class="fw-700" style="font-size:17px;margin-bottom:15px">${escapeClinical(d.name)}</div><div class="grid grid-2" style="gap:10px">${[['ID',d.id],['Specialization',d.spec||'—'],['Department',d.dept],['Branch',d.branch],['Phone',d.phone||'—'],['Status',d.status]].map(([k,v])=>`<div style="padding:10px;border:1px solid var(--gray-200);border-radius:5px"><div class="text-xs text-muted">${k}</div><div>${escapeClinical(v)}</div></div>`).join('')}</div>`;
  openModal('modal-view-doctor');
}
function openAddDoctorModal(){
  doctorEditId=null;
  document.getElementById('doctor-form-title').textContent='Add doctor';
  for(const id of ['df-name','df-specialization','df-contact']){const el=document.getElementById(id);if(el)el.value='';}
  fillDoctorDepartmentSelect();openModal('modal-doctor-form');
}
async function editDoctor(id){
  doctorEditId=String(id);
  try{
    const data=await apiRequest(`/doctors/${id}`);
    if(doctorEditId!==String(id))return;
    const d=data.doctor;if(!d)throw Error('Doctor not found.');
    await fillDoctorDepartmentSelect(d.departmentId);
    document.getElementById('doctor-form-title').textContent='Edit doctor';
    document.getElementById('df-name').value=d.name||'';
    document.getElementById('df-specialization').value=d.specialization||'';
    document.getElementById('df-contact').value=d.phone||'';
    openModal('modal-doctor-form');
  }catch(e){toast(e.message,'error');}
}
async function submitDoctorForm(){
  const btn=document.getElementById('doctor-form-submit');if(btn?.disabled)return;
  const name=document.getElementById('df-name')?.value.trim();
  const dept=document.getElementById('df-dept-id')?.value;
  if(!name){toast('Doctor name is required.','warning');return;}
  let departmentId;try{departmentId=intClinical(dept,{min:1});}catch(e){toast('Select a valid department.','warning');return;}
  const payload={name,departmentId,specialization:document.getElementById('df-specialization')?.value.trim()||null,phone:document.getElementById('df-contact')?.value.trim()||null};
  btn.disabled=true;
  try{
    if(doctorEditId)await apiRequest(`/doctors/${doctorEditId}`,{method:'PUT',body:JSON.stringify(payload)});
    else await apiRequest('/doctors',{method:'POST',body:JSON.stringify(payload)});
    closeModal('modal-doctor-form');toast(doctorEditId?'Doctor updated.':'Doctor created.','success');doctorEditId=null;await fetchDoctors();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;}
}
function deleteDoctor(id){
  const d=appState.doctors.find(x=>x.id===String(id));
  confirmDialog(`Archive ${escapeClinical(d?.name||`doctor ${id}`)}? Existing appointments and medical records will be preserved.`,async()=>{
    try{await apiRequest(`/doctors/${id}`,{method:'DELETE'});toast('Doctor archived. Records preserved.','success');await fetchDoctors();}
    catch(e){toast(e.message,'error');}
  },'Archive doctor');
}
function restoreDoctor(id){
  confirmDialog('Restore this doctor to the active directory?',async()=>{
    try{await apiRequest(`/doctors/${id}`,{method:'PUT',body:JSON.stringify({isActive:true})});toast('Doctor restored.','success');await fetchDoctors();}
    catch(e){toast(e.message,'error');}
  },'Restore doctor');
}

// Patients: read/write precisely the columns stored by the relational schema.
function initPatients(){
  pagination.patients={page:1,limit:12,total:0,filter:''};
  const search=document.getElementById('patient-search');if(search)search.oninput=debounce(()=>{pagination.patients.page=1;fetchPatients();},200);
  const next=document.getElementById('patient-pg');if(next)next.onclick=e=>{const btn=e.target.closest('.page-btn[data-p]');if(btn){pagination.patients.page=+btn.dataset.p;fetchPatients();}};
  const add=document.getElementById('patient-form-add-btn');if(add)add.onclick=openAddPatientModal;
  const save=document.getElementById('patient-form-submit');if(save)save.onclick=submitPatientForm;
  fetchPatients();
}
let patientsSerial=0;
async function fetchPatients(){
  const tbody=document.getElementById('patients-tbody');if(!tbody)return;
  const serial=++patientsSerial;tbody.innerHTML=spinnerRow(8);
  try{
    const q=document.getElementById('patient-search')?.value.trim()||'';
    const res=await apiRequest(`/patients${q?'?search='+encodeURIComponent(q):''}`);
    if(serial!==patientsSerial||currentPage!=='patients')return;
    appState.patientsRaw=res.patients||[];
    appState.patients=appState.patientsRaw.map(normalizePatientRow);
    const pager=pagination.patients;pager.total=appState.patients.length;pager.page=Math.min(pager.page,Math.max(1,Math.ceil(pager.total/pager.limit)));
    renderPatientsTable(appState.patients.slice((pager.page-1)*pager.limit,pager.page*pager.limit));
    renderPagination('patient-pg',pager);
    updatePatientStats({patients:appState.patients});
  }catch(e){if(serial===patientsSerial)tbody.innerHTML=errorRow(8,e.message);}
}
function normalizePatientRow(row){
  const name=row.name||[row.firstName,row.lastName].filter(Boolean).join(' ')||'Unnamed';
  const dob=row.dateOfBirth||row.dob||null;
  const date=dob?new Date(dob):null;
  const now=new Date();const age=date&&!Number.isNaN(date.getTime()) ? now.getFullYear()-date.getFullYear()-(now.getMonth()<date.getMonth()||(now.getMonth()===date.getMonth()&&now.getDate()<date.getDate())?1:0) : '—';
  return {id:String(row.id??row.patient_id),name,age,gender:row.gender||'—',contact:row.phone||row.contact||'—',dob:dob?formatDate(dob):'',street:row.street||'',city:row.city||'',state:row.state||'',pin:row.pinCode||row.pin_code||''};
}
function renderPatientsTable(rows){
  const tb=document.getElementById('patients-tbody');if(!tb)return;
  tb.innerHTML=rows.length?rows.map(p=>`<tr><td>${escapeClinical(p.id)}</td><td><div class="flex gap-2 items-center"><span class="avatar avatar-sm">${escapeClinical(initials(p.name))}</span><span class="fw-600">${escapeClinical(p.name)}</span></div></td><td>${escapeClinical(p.age)}</td><td>${escapeClinical(p.gender)}</td><td>${escapeClinical(p.contact)}</td><td>${escapeClinical(p.city||'—')}</td><td>${escapeClinical(p.dob||'—')}</td><td><div class="flex gap-1"><button class="btn btn-outline btn-sm btn-icon" title="View patient" onclick="viewPatient('${p.id}')"><i class="fas fa-eye"></i></button><button class="btn btn-outline btn-sm btn-icon" title="Edit patient" onclick="editPatient('${p.id}')"><i class="fas fa-pen"></i></button><button class="btn btn-danger btn-sm btn-icon" title="Delete patient" onclick="deletePatient('${p.id}')"><i class="fas fa-trash"></i></button></div></td></tr>`).join(''):emptyRow(8,'No matching patients.');
}
function updatePatientStats(res){
  const rows=res.patients||[];
  const counts=[rows.length,rows.filter(p=>p.gender==='Male').length,rows.filter(p=>p.gender==='Female').length,rows.filter(p=>!['Male','Female'].includes(p.gender)).length];
  ['pat-total','pat-active','pat-recovered','pat-critical'].forEach((id,i)=>{const el=document.getElementById(id);if(el)el.textContent=counts[i].toLocaleString();});
}
function viewPatient(id){
  const p=appState.patients.find(p=>p.id===String(id));if(!p)return;
  const el=document.getElementById('view-patient-content');if(!el)return;
  el.innerHTML=`<div class="fw-700 mb-4" style="font-size:17px">${escapeClinical(p.name)}</div><div class="grid grid-2" style="gap:10px">${[['ID',p.id],['Age',p.age],['Gender',p.gender],['Phone',p.contact],['Birth date',p.dob||'—'],['Street',p.street||'—'],['City',p.city||'—'],['State',p.state||'—'],['PIN',p.pin||'—']].map(([k,v])=>`<div style="border:1px solid var(--gray-200);padding:10px;border-radius:5px"><div class="text-xs text-muted">${k}</div><div>${escapeClinical(v)}</div></div>`).join('')}</div>`;
  openModal('modal-view-patient');
}
function openAddPatientModal(){
  patientEditId=null;
  document.getElementById('patient-form-title').textContent='Add patient';
  for(const id of ['pf-firstname','pf-lastname','pf-dob','pf-gender','pf-phone','pf-pin','pf-street','pf-city','pf-state']){const el=document.getElementById(id);if(el)el.value='';}
  openModal('modal-patient-form');
}
async function editPatient(id){
  try{
    const res=await apiRequest(`/patients/${id}`);
    const p=res.patient;if(!p)throw Error('Patient not found.');
    patientEditId=String(id);
    const values={'pf-firstname':p.firstName||'','pf-lastname':p.lastName||'','pf-dob':p.dateOfBirth?formatDate(p.dateOfBirth):'','pf-gender':p.gender||'','pf-phone':p.phone||'','pf-pin':p.pinCode||'','pf-street':p.street||'','pf-city':p.city||'','pf-state':p.state||''};
    for(const [field,value] of Object.entries(values)){const el=document.getElementById(field);if(el)el.value=value;}
    document.getElementById('patient-form-title').textContent='Edit patient';openModal('modal-patient-form');
  }catch(e){toast(e.message,'error');}
}
async function submitPatientForm(){
  const btn=document.getElementById('patient-form-submit');if(btn?.disabled)return;
  const firstName=document.getElementById('pf-firstname')?.value.trim();
  if(!firstName){toast('First name is required.','warning');return;}
  const payload={firstName,lastName:document.getElementById('pf-lastname')?.value.trim()||'',dateOfBirth:document.getElementById('pf-dob')?.value||null,gender:document.getElementById('pf-gender')?.value||null,phone:document.getElementById('pf-phone')?.value.trim()||null,pinCode:document.getElementById('pf-pin')?.value.trim()||null,street:document.getElementById('pf-street')?.value.trim()||null,city:document.getElementById('pf-city')?.value.trim()||null,state:document.getElementById('pf-state')?.value.trim()||null};
  btn.disabled=true;
  try{
    if(patientEditId)await apiRequest(`/patients/${patientEditId}`,{method:'PUT',body:JSON.stringify(payload)});
    else await apiRequest('/patients',{method:'POST',body:JSON.stringify(payload)});
    toast(patientEditId?'Patient updated.':'Patient registered.','success');closeModal('modal-patient-form');patientEditId=null;await fetchPatients();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;}
}
function deletePatient(id){
  const p=appState.patients.find(p=>p.id===String(id));
  confirmDialog(`Delete ${escapeClinical(p?.name||'this patient')}? Deletion may be blocked if clinical records reference the patient.`,async()=>{
    try{await apiRequest(`/patients/${id}`,{method:'DELETE'});toast('Patient deleted.','success');fetchPatients();}catch(e){toast(e.message,'error');}
  });
}

// Appointment workflow: real day timeline, edit existing slots, no ignored fields.
let clinicalAppointmentEditId=null;
let clinicalScheduleSerial=0;
function todayLocalClinical(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function changeTimelineDate(offset){
  const input=document.getElementById('appt-timeline-date');if(!input)return;
  const date=new Date(`${input.value||todayLocalClinical()}T12:00:00`);date.setDate(date.getDate()+offset);
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0');
  input.value=`${y}-${m}-${day}`;loadAppointmentTimeline();
}
function initAppointments(){
  pagination.appointments={page:1,limit:12,total:0,filter:'',status:''};
  const search=document.getElementById('appt-search');if(search)search.oninput=debounce(()=>{pagination.appointments.page=1;fetchAppointments();},200);
  const status=document.getElementById('appt-status-filter');if(status)status.onchange=()=>{pagination.appointments.page=1;fetchAppointments();};
  const pgr=document.getElementById('appt-pg');if(pgr)pgr.onclick=e=>{const btn=e.target.closest('.page-btn[data-p]');if(btn){pagination.appointments.page=+btn.dataset.p;fetchAppointments();}};
  const save=document.getElementById('appt-form-submit');if(save)save.onclick=submitAppointmentForm;
  const day=document.getElementById('appt-timeline-date');if(day){day.value=todayLocalClinical();day.onchange=loadAppointmentTimeline;}
  const prev=document.getElementById('timeline-prev');if(prev)prev.onclick=()=>changeTimelineDate(-1);
  const next=document.getElementById('timeline-next');if(next)next.onclick=()=>changeTimelineDate(1);
  const create=document.getElementById('appt-new-btn');if(create)create.onclick=openAddAppointment;
  fetchAppointments();loadAppointmentTimeline();
}
async function loadAppointmentTimeline(){
  const holder=document.getElementById('appt-timeline');if(!holder)return;
  const date=document.getElementById('appt-timeline-date')?.value||todayLocalClinical();
  const serial=++clinicalScheduleSerial;
  holder.innerHTML='<div class="table-state">Loading schedule…</div>';
  try{
    const data=await apiRequest(`/appointments?date=${encodeURIComponent(date)}`);
    if(serial!==clinicalScheduleSerial || currentPage!=='appointments')return;
    const rows=(data.appointments||[]).sort((a,b)=>String(a.appointmentTime||a.appointment_time||'').localeCompare(String(b.appointmentTime||b.appointment_time||'')));
    const count=document.getElementById('appt-timeline-count');if(count)count.textContent=`· ${rows.length} appointments`;
    holder.innerHTML=rows.length?rows.map(a=>`<div class="timeline-entry"><div class="timeline-time">${escapeClinical(String(a.appointmentTime||a.appointment_time||'').slice(0,5))}</div><div class="timeline-rail"></div><div><div class="timeline-title">${escapeClinical(a.patientName||a.patient_name)}</div><div class="timeline-meta">${escapeClinical(a.doctorName||a.doctor_name)} · ${escapeClinical(a.departmentName||'')}</div></div>${statusBadge(a.status)}</div>`).join(''):'<div class="table-state empty">No appointments on this date.</div>';
  }catch(e){if(serial===clinicalScheduleSerial)holder.innerHTML=`<div class="table-state error">${escapeClinical(e.message)}</div>`;}
}
function openAddAppointment(){
  clinicalAppointmentEditId=null;
  document.getElementById('appt-form-title').textContent='Schedule appointment';
  for(const id of ['af-patient-id','af-doctor','af-time']){const input=document.getElementById(id);if(input)input.value='';}
  document.getElementById('af-status').value='pending';
  document.getElementById('af-date').value=document.getElementById('appt-timeline-date')?.value||todayLocalClinical();
  Promise.all([populateDoctorSelect('af-doctor'),populatePatientSelect('af-patient-id')]).then(()=>openModal('modal-appt-form'));
}
async function populateDoctorSelect(selectId){
  const sel=document.getElementById(selectId);if(!sel)return;
  try{
    const data=await apiRequest('/doctors?status=active');
    sel.innerHTML='<option value="">Select doctor…</option>'+(data.doctors||[]).map(d=>`<option value="${d.id}" data-branch="${d.branchId}" data-dept="${d.departmentId}">${escapeClinical(d.name)} · ${escapeClinical(d.departmentName||'')}</option>`).join('');
  }catch(e){toast(e.message,'error');}
}
async function editAppointment(id){
  try{
    const [data]=await Promise.all([apiRequest(`/appointments/${id}`),populateDoctorSelect('af-doctor'),populatePatientSelect('af-patient-id')]);
    const a=data.appointment;if(!a)throw Error('Appointment not found.');
    clinicalAppointmentEditId=String(id);
    document.getElementById('appt-form-title').textContent=`Edit appointment #${id}`;
    document.getElementById('af-patient-id').value=String(a.patientId);
    document.getElementById('af-doctor').value=String(a.doctorId);
    document.getElementById('af-date').value=formatDate(a.appointmentDate);
    document.getElementById('af-time').value=String(a.appointmentTime||a.startTime||'').slice(0,5);
    document.getElementById('af-status').value=a.status;
    openModal('modal-appt-form');
  }catch(e){toast(e.message,'error');}
}
async function submitAppointmentForm(){
  const btn=document.getElementById('appt-form-submit');if(btn?.disabled)return;
  const pid=document.getElementById('af-patient-id')?.value, did=document.getElementById('af-doctor')?.value;
  const date=document.getElementById('af-date')?.value,time=document.getElementById('af-time')?.value;
  if(!pid||!did||!date||!time){toast('Patient, doctor, date and start time are required.','warning');return;}
  const selected=document.getElementById('af-doctor')?.selectedOptions?.[0];
  let payload;try{payload={patientId:intClinical(pid,{min:1}),doctorId:intClinical(did,{min:1}),branchId:intClinical(selected?.dataset?.branch,{min:1}),appointmentDate:date,appointmentTime:time,status:document.getElementById('af-status')?.value||'pending'};}catch(e){toast(e.message,'error');return;}
  btn.disabled=true;
  try{
    if(clinicalAppointmentEditId)await apiRequest(`/appointments/${clinicalAppointmentEditId}`,{method:'PUT',body:JSON.stringify(payload)});
    else await apiRequest('/appointments',{method:'POST',body:JSON.stringify(payload)});
    toast(clinicalAppointmentEditId?'Appointment updated.':'Appointment scheduled.','success');closeModal('modal-appt-form');clinicalAppointmentEditId=null;
    fetchAppointments();loadAppointmentTimeline();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;}
}
async function fetchAppointments(){
  const tbody=document.getElementById('appt-tbody');if(!tbody)return;
  tbody.innerHTML=spinnerRow(8);
  try{
    const qs=new URLSearchParams();const term=document.getElementById('appt-search')?.value.trim();const status=document.getElementById('appt-status-filter')?.value;
    if(term)qs.set('search',term);if(status)qs.set('status',status);
    const res=await apiRequest(`/appointments?${qs}`);
    if(currentPage!=='appointments')return;
    const rows=(res.appointments||[]).map(normalizeAppointmentRow);appState.appointments=rows;
    const pager=pagination.appointments;pager.total=rows.length;pager.page=Math.min(pager.page,Math.max(1,Math.ceil(rows.length/pager.limit)));
    renderAppointmentsTable(rows.slice((pager.page-1)*pager.limit,pager.page*pager.limit));renderPagination('appt-pg',pager);updateApptStats({appointments:res.appointments||[]});
  }catch(e){tbody.innerHTML=errorRow(8,e.message);}
}
function renderAppointmentsTable(rows){
  const tb=document.getElementById('appt-tbody');if(!tb)return;
  tb.innerHTML=rows.length?rows.map(a=>`<tr><td>${escapeClinical(a.id)}</td><td class="fw-600">${escapeClinical(a.patient)}</td><td>${escapeClinical(a.doctor)}</td><td>${escapeClinical(a.dept)}</td><td>${escapeClinical(a.date)}</td><td>${escapeClinical(String(a.time).slice(0,5))}</td><td>${statusBadge(a.status)}</td><td><div class="flex gap-1"><button class="btn btn-outline btn-sm btn-icon" title="Edit appointment" onclick="editAppointment('${a.id}')"><i class="fas fa-pen"></i></button><button class="btn btn-danger btn-sm btn-icon" title="Cancel appointment" onclick="cancelAppointment('${a.id}')" ${a.status==='Cancelled'?'disabled':''}><i class="fas fa-ban"></i></button></div></td></tr>`).join(''):emptyRow(8,'No appointments found.');
}
function cancelAppointment(id){confirmDialog(`Cancel appointment #${escapeClinical(id)}?`,async()=>{
  try{await apiRequest(`/appointments/${id}`,{method:'PUT',body:JSON.stringify({status:'cancelled'})});toast('Appointment cancelled.','success');fetchAppointments();loadAppointmentTimeline();}
  catch(e){toast(e.message,'error');}
},'Cancel appointment');}

// Consistent accessible, spreadsheet-like column sorting across every data table.
const clinicalSortByTable=new WeakMap();
function comparableClinical(cell){
  const raw=(cell?.innerText||cell?.textContent||'').trim().replace(/\s+/g,' ');
  if (/^(₹|\$)?[-\d,.]+%?$/.test(raw))return {kind:'number',value:Number(raw.replace(/[₹$,%]/g,''))};
  if(/^\d{4}-\d{2}-\d{2}/.test(raw))return {kind:'number',value:Date.parse(raw)||0};
  return {kind:'text',value:raw.toLocaleLowerCase()};
}
function applyClinicalTableSort(table) {
  const sort=clinicalSortByTable.get(table);if(!sort)return;
  const tbody=table.tBodies?.[0];if(!tbody||tbody.rows.length<2)return;
  const rows=[...tbody.rows];
  const sorted=rows.map((node,i)=>({node,i,key:comparableClinical(node.cells[sort.index])})).sort((a,b)=>{
    const cmp=a.key.kind==='number' && b.key.kind==='number' ? a.key.value-b.key.value : String(a.key.value).localeCompare(String(b.key.value),undefined,{numeric:true,sensitivity:'base'});
    return (cmp*sort.dir)||a.i-b.i;
  }).map(item=>item.node);
  if(sorted.every((row,i)=>row===rows[i]))return;
  tbody.replaceChildren(...sorted);
}
function initializeClinicalSort(){
  document.addEventListener('click',e=>{
    const th=e.target.closest('.app-shell .table th[data-sortable="true"]');if(!th)return;
    const table=th.closest('table');const index=[...th.parentElement.children].indexOf(th);const old=clinicalSortByTable.get(table);
    const dir=old&&old.index===index ? -old.dir:1;
    clinicalSortByTable.set(table,{index,dir});
    table.querySelectorAll('th').forEach(h=>h.removeAttribute('aria-sort'));
    th.setAttribute('aria-sort',dir===1?'ascending':'descending');applyClinicalTableSort(table);
  });
  document.addEventListener('keydown',e=>{
    if((e.key==='Enter'||e.key===' ') && e.target.matches('.app-shell .table th[data-sortable="true"]')){e.preventDefault();e.target.click();}
  });
  let frame=0;
  const decorate=()=>{
    document.querySelectorAll('.app-shell .table').forEach(table=>{
      table.querySelectorAll('thead th').forEach(th=>{
        const label=th.textContent.toLowerCase().trim();
        if(th.dataset.noSort==='true'||label==='actions'||label==='action'||!table.tBodies.length)return;
        th.dataset.sortable='true';th.tabIndex=0;th.setAttribute('role','button');th.setAttribute('title','Sort by '+th.textContent.trim());
      });
      applyClinicalTableSort(table);
    });
  };
  const root=document.getElementById('page-content');
  if(root)new MutationObserver(()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;decorate();});}).observe(root,{childList:true,subtree:true});
  decorate();
}
// Use strict, whole-number inputs for ids and quantities in secondary modules.
function enforceClinicalIntegerInputs(){
  const integerIds=['mf-stock','rf-capacity','rf-branch','otf-theatre','dpf-branch','bf-patient','bf-branch','adf-patient','adf-doctor','dsf-branch'];
  integerIds.forEach(id=>{const input=document.getElementById(id);if(!input)return;input.type='number';input.step='1';input.min=id==='mf-stock'?'0':'1';input.inputMode='numeric';input.dataset.integer='true';});
  document.querySelectorAll('.app-shell input[type=number]').forEach(input=>{
    if(input.getAttribute('step')===null){input.step='1';input.dataset.integer='true';}
  });
  document.addEventListener('input',e=>{if(e.target.matches('input[data-integer="true"]'))e.target.removeAttribute('aria-invalid');});
  document.addEventListener('click',e=>{
    const btn=e.target.closest('.modal-footer button[id$="-submit"]');if(!btn || btn.disabled)return;
    const modal=btn.closest('.modal');if(!validateNumericForm(modal)){
      e.stopImmediatePropagation();e.preventDefault();
    }
  },true);
}
document.addEventListener('DOMContentLoaded',()=>{
  initializeClinicalSort();enforceClinicalIntegerInputs();
});

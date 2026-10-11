// ============================================================
// HOSPITAL MANAGEMENT SYSTEM — app.js  (Full API Integration)
// ============================================================

/* ── Utility helpers ──────────────────────────────────────── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function avatarColor(name) {
  const palette = ['#2563EB','#0D9488','#8B5CF6','#F59E0B','#EF4444','#10B981','#6366F1','#EC4899'];
  let h = 0;
  for (const c of String(name||'?')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return palette[Math.abs(h) % palette.length];
}
function initials(name) {
  return String(name||'?').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase() || '?';
}
function statusBadge(status) {
  const map = {
    'Active':'badge-success','Recovered':'badge-teal','Critical':'badge-danger',
    'Confirmed':'badge-success','Pending':'badge-warning','Completed':'badge-gray','Cancelled':'badge-danger',
    'Paid':'badge-success','Unpaid':'badge-danger','Overdue':'badge-danger','Partial':'badge-warning',
    'In Stock':'badge-success','Low Stock':'badge-warning','Out Of Stock':'badge-danger',
    'Present':'badge-success','Absent':'badge-danger','On Leave':'badge-warning','Off Duty':'badge-gray',
    'Available':'badge-success','Busy':'badge-warning',
    'open':'badge-success','active':'badge-success','inactive':'badge-gray',
  };
  const label = humanizeStatus(status);
  return `<span class="badge ${map[label]||'badge-gray'}">${label}</span>`;
}
function toast(message, type = 'info') {
  const icons = { info:'fa-info-circle', success:'fa-check-circle', error:'fa-times-circle', warning:'fa-exclamation-triangle' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fas ${icons[type]} toast-icon"></i><span>${message}</span><i class="fas fa-times toast-close" onclick="this.parentElement.remove()"></i>`;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 4500);
}
function humanizeStatus(value) {
  if (!value) return 'Pending';
  return String(value).trim().replace(/_/g,' ').split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}
function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().split('T')[0];
}
function formatCurrency(v) {
  return '₹' + Number(v||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function spinnerRow(cols, msg='Loading…') {
  return `<tr><td colspan="${cols}"><div class="table-state"><div class="spinner"></div><span>${msg}</span></div></td></tr>`;
}
function emptyRow(cols, msg='No records found.', icon='fa-inbox') {
  return `<tr><td colspan="${cols}"><div class="table-state empty"><i class="fas ${icon}"></i><span>${msg}</span></div></td></tr>`;
}
function errorRow(cols, msg='Failed to load data.') {
  return `<tr><td colspan="${cols}"><div class="table-state error"><i class="fas fa-exclamation-circle"></i><span>${msg}</span></div></td></tr>`;
}

/* ── API ──────────────────────────────────────────────────── */
const API_BASE = 'http://localhost:8000/api';
const appState = {
  patients:[], doctors:[], appointments:[], medicines:[],
  staff:[], bills:[], prescriptions:[], branches:[],
  departments:[], nurses:[], admissions:[], equipment:[],
  shiftLogs:[], payStructures:[], salaries:[],
};
const pagination = {};  // keyed by page

function getAuthToken() { return localStorage.getItem('hmsToken'); }
function requireAuth() {
  if (!getAuthToken()) { window.location.href='index.html'; return false; }
  return true;
}

async function apiRequest(path, options = {}) {
  const token = getAuthToken();
  const headers = { Accept:'application/json', ...(options.headers||{}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type']||'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const ct = res.headers.get('content-type')||'';
  const payload = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((payload && payload.message)||`HTTP ${res.status}`);
  return payload;
}

/* ── Modal helpers ────────────────────────────────────────── */
function openModal(id) {
  const m = $(`#${id}`);
  if (m) { m.classList.add('active'); document.body.style.overflow='hidden'; }
}
function closeModal(id) {
  const m = $(`#${id}`);
  if (m) { m.classList.remove('active'); document.body.style.overflow=''; }
}
function closeAllModals() {
  $$('.modal-overlay').forEach(m => m.classList.remove('active'));
  document.body.style.overflow='';
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeAllModals();
});

/* ── Confirm Dialog ───────────────────────────────────────── */
function confirmDialog(message, onConfirm, btnLabel='Yes, Delete') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <div class="icon-wrap"><i class="fas fa-exclamation-triangle"></i></div>
      <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:.5rem">Are you sure?</h3>
      <p style="color:var(--gray-500);font-size:.875rem;margin-bottom:1.5rem">${message}</p>
      <div class="flex gap-3 justify-center">
        <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove();document.body.style.overflow=''">Cancel</button>
        <button class="btn btn-danger" id="confirm-ok">${btnLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow='hidden';
  overlay.querySelector('#confirm-ok').addEventListener('click', () => {
    onConfirm(); overlay.remove(); document.body.style.overflow='';
  });
  overlay.addEventListener('click', e => {
    if (e.target===overlay) { overlay.remove(); document.body.style.overflow=''; }
  });
}

/* ── Dropdown ─────────────────────────────────────────────── */
document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown')) $$('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
});
function toggleDropdown(id) {
  const menu = $(`#${id}`);
  const wasOpen = menu.classList.contains('open');
  $$('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  if (!wasOpen) menu.classList.add('open');
}

/* ── Pagination helper ───────────────────────────────────── */
function renderPagination(containerId, state) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const { page, total, limit } = state;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const infoEl = el.previousElementSibling;
  if (infoEl && infoEl.classList.contains('pagination-info')) {
    const from = Math.min((page-1)*limit+1, total);
    const to   = Math.min(page*limit, total);
    infoEl.textContent = `Showing ${from}–${to} of ${total} records`;
  }
  const pages = [];
  if (page > 1) pages.push(`<div class="page-btn" data-p="${page-1}"><i class="fas fa-chevron-left"></i></div>`);
  for (let i=1; i<=totalPages; i++) {
    if (i===1||i===totalPages||Math.abs(i-page)<=1)
      pages.push(`<div class="page-btn${i===page?' active':''}" data-p="${i}">${i}</div>`);
    else if (Math.abs(i-page)===2)
      pages.push(`<span style="color:var(--gray-400);padding:0 .3rem">…</span>`);
  }
  if (page < totalPages) pages.push(`<div class="page-btn" data-p="${page+1}"><i class="fas fa-chevron-right"></i></div>`);
  el.innerHTML = pages.join('');
}

/* ══════════════════════════════════════════════════════════
   PAGE ROUTER
════════════════════════════════════════════════════════════ */
const pageCache = {};
let currentPage = '';
let sidebarCollapsed = false;
let sidebarMobileOpen = false;

const PAGE_TITLES = {
  dashboard:'Dashboard', patients:'Patient Management', doctors:'Doctor Management',
  appointments:'Appointments', prescriptions:'Prescriptions & Treatment',
  pharmacy:'Pharmacy', billing:'Billing & Invoices', staff:'Staff Management',
  reports:'Reports & Analytics', settings:'Settings',
  branches:'Branches', departments:'Departments', nurses:'Nurses',
  admissions:'Admissions', equipment:'Equipment', shiftlogs:'Shift Logs',
  paystructures:'Pay Structures', salaries:'Salaries',
  ot:'Operation Theatre', labresults:'Lab Results', rooms:'Rooms & Beds',
  doctorshifts:'Doctor Shifts', pharmacyinventory:'Pharmacy Inventory',
};

function navigate(page) {
  if (page === currentPage) return;
  currentPage = page;
  $$('.nav-item[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page===page));
  const hdr = document.querySelector('.page-header-title');
  if (hdr) hdr.textContent = PAGE_TITLES[page]||page;
  const container = $('#page-content');
  if (!pageCache[page]) {
    const tpl = document.getElementById(`tpl-${page}`);
    if (!tpl) {
      container.innerHTML = `
        <div class="empty-state" style="min-height:50vh;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <i class="fas fa-exclamation-circle" style="font-size:3rem;color:var(--danger);margin-bottom:1rem"></i>
          <h3>Page not found</h3><p>Template <code>tpl-${page}</code> is missing.</p>
          <button class="btn btn-primary mt-4" onclick="navigate('dashboard')">Go to Dashboard</button>
        </div>`;
      return;
    }
    pageCache[page] = tpl.innerHTML;
  }
  container.style.opacity='0'; container.style.transition='opacity .15s';
  setTimeout(() => {
    container.innerHTML = pageCache[page];
    const pageEl = container.querySelector('.page');
    if (pageEl) pageEl.classList.add('active');
    container.style.opacity='1'; container.scrollTop=0;
    closeMobileSidebar(); initPage(page);
  }, 150);
}

function initPage(page) {
  setTimeout(() => {
    $$('.progress-bar[data-width]').forEach(bar => bar.style.width=bar.dataset.width+'%');
  }, 250);
  $$('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      tab.closest('.chart-tabs').querySelectorAll('.chart-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
  $$('.export-btn').forEach(btn => btn.addEventListener('click', () => toast(`Exporting as ${btn.dataset.format}…`,'info')));

  switch(page) {
    case 'dashboard':    initDashboard();    break;
    case 'patients':     initPatients();     break;
    case 'doctors':      initDoctors();      break;
    case 'appointments': initAppointments(); break;
    case 'prescriptions':initPrescriptions();break;
    case 'pharmacy':     initPharmacy();     break;
    case 'billing':      initBilling();      break;
    case 'staff':        initStaff();        break;
    case 'reports':      initReports();      break;
    case 'settings':     initSettings();     break;
    case 'branches':          initBranches();          break;
    case 'departments':       initDepartments();       break;
    case 'nurses':            initNurses();            break;
    case 'admissions':        initAdmissions();        break;
    case 'equipment':         initEquipment();         break;
    case 'shiftlogs':         initShiftLogs();         break;
    case 'paystructures':     initPayStructures();     break;
    case 'salaries':          initSalaries();          break;
    case 'ot':                initOT();                break;
    case 'labresults':        initLabResults();        break;
    case 'rooms':             initRooms();             break;
    case 'doctorshifts':      initDoctorShifts();      break;
    case 'pharmacyinventory': initPharmacyInventory(); break;
  }
  // The role-aware schema components are loaded last. Hide actions the API rejects.
  if (typeof scApplyRoleActions === 'function') scApplyRoleActions();
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════ */
async function initDashboard() {
  renderNotificationBadge();
  await loadDashboardData();
}

async function loadDashboardData() {
  try {
    const [statsR, revenueR, deptR, apptR] = await Promise.all([
      apiRequest('/dashboard/stats').catch(() => ({})),
      apiRequest('/dashboard/revenue').catch(() => ({ data:[] })),
      apiRequest('/dashboard/departments').catch(() => ({ departments:[] })),
      apiRequest('/appointments?limit=5').catch(() => ({ appointments:[] })),
    ]);

    const stats = statsR.stats || statsR || {};
    updateDashboardStats(stats);

    const revenueData = Array.isArray(revenueR.data) ? revenueR.data : [];
    const deptData = Array.isArray(deptR.departments) ? deptR.departments : [];
    const appts = Array.isArray(apptR.appointments) ? apptR.appointments : [];

    // Charts
    buildApptChart(HMS.chartData.appointmentsWeekly);
    buildPatientChart(HMS.chartData.patientMonthly);

    if (deptData.length) {
      buildDeptChart({ labels:deptData.map(d=>d.department_name||'Dept'), data:deptData.map(d=>Number(d.load_pct||0)), colors:['#2563EB','#0D9488','#8B5CF6','#F59E0B','#EF4444','#10B981'] });
    } else {
      buildDeptChart(HMS.chartData.deptDistribution);
    }

    renderDashboardSchedule(appts);
    renderActivities();

    if (revenueData.length) {
      buildRevenueChart('revenue-chart-dash', {
        labels: revenueData.map(r=>r.month_name||r.month||''),
        revenue: revenueData.map(r=>Number(r.revenue||0)),
        expenses: revenueData.map(r=>Number(r.expenses||0)),
      });
    }
  } catch(e) {
    updateDashboardStats({});
    buildApptChart(HMS.chartData.appointmentsWeekly);
    buildPatientChart(HMS.chartData.patientMonthly);
    buildDeptChart(HMS.chartData.deptDistribution);
    renderDashboardSchedule([]);
    renderActivities();
  }
}

function updateDashboardStats(stats) {
  const countUps = $$('.stat-card .count-up');
  const vals = [
    Number(stats.totalPatients||stats.total_patients||0),
    Number(stats.totalDoctors||stats.total_doctors||0),
    Number(stats.upcomingAppointments||stats.upcoming_appointments||stats.todayAppointments||0),
    Number(stats.revenue||stats.monthlyRevenue||0),
  ];
  countUps.forEach((el,i) => {
    const v = vals[i]??0;
    el.dataset.target=v; el.textContent='0';
  });
  animateCountUps();
}

function animateCountUps() {
  $$('.count-up').forEach(el => {
    const target = Number(el.dataset.target||0);
    let cur = 0;
    const step = Math.max(1, Math.ceil(target/40));
    const timer = setInterval(() => {
      cur = Math.min(cur+step, target);
      el.textContent = cur.toLocaleString();
      if (cur>=target) clearInterval(timer);
    }, 28);
  });
}

function buildApptChart(d) {
  const ctx = $('#appt-chart'); if (!ctx) return;
  new Chart(ctx, {
    type:'bar',
    data:{ labels:d.labels, datasets:[
      { label:'Confirmed', data:d.confirmed, backgroundColor:'#2563EB', borderRadius:5, barPercentage:.6 },
      { label:'Pending',   data:d.pending,   backgroundColor:'#F59E0B', borderRadius:5, barPercentage:.6 },
      { label:'Cancelled', data:d.cancelled, backgroundColor:'#EF4444', borderRadius:5, barPercentage:.6 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'top', labels:{ boxWidth:10, font:{family:'Inter',size:11} } } },
      scales:{ x:{grid:{display:false}}, y:{grid:{color:'#F1F5F9'},beginAtZero:true} },
    },
  });
}
function buildPatientChart(d) {
  const ctx = $('#patient-chart'); if (!ctx) return;
  new Chart(ctx, {
    type:'line',
    data:{ labels:d.labels, datasets:[
      { label:'Inpatient',  data:d.inpatient,  borderColor:'#2563EB', backgroundColor:'rgba(37,99,235,.08)', fill:true, tension:.4, pointRadius:4 },
      { label:'Outpatient', data:d.outpatient, borderColor:'#0D9488', backgroundColor:'rgba(13,148,136,.08)', fill:true, tension:.4, pointRadius:4 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'top', labels:{ boxWidth:10, font:{family:'Inter',size:11} } } },
      scales:{ x:{grid:{display:false}}, y:{grid:{color:'#F1F5F9'},beginAtZero:true} },
    },
  });
}
function buildDeptChart(d) {
  const ctx = $('#dept-chart'); if (!ctx) return;
  new Chart(ctx, {
    type:'doughnut',
    data:{ labels:d.labels, datasets:[{ data:d.data, backgroundColor:d.colors, borderWidth:0, hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'70%',
      plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{family:'Inter',size:11}, padding:12 } } },
    },
  });
}
function buildRevenueChart(canvasId, d) {
  const ctx = $(`#${canvasId}`); if (!ctx) return;
  new Chart(ctx, {
    type:'bar',
    data:{ labels:d.labels, datasets:[
      { label:'Revenue',  data:d.revenue,  backgroundColor:'#2563EB', borderRadius:6, barPercentage:.55 },
      { label:'Expenses', data:d.expenses, backgroundColor:'#EF4444', borderRadius:6, barPercentage:.55 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'top' } },
      scales:{ x:{grid:{display:false}}, y:{grid:{color:'#F1F5F9'},beginAtZero:true,ticks:{callback:v=>'₹'+v.toLocaleString()}} },
    },
  });
}

function renderDashboardSchedule(appts) {
  const tbody = $('#dashboard-schedule-body'); if (!tbody) return;
  if (!appts.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--gray-400)">No appointments today.</td></tr>`;
    return;
  }
  tbody.innerHTML = appts.slice(0,5).map(a => {
    const patient = a.patientName||a.patient_name||'Unknown';
    const doctor  = a.doctorName||a.doctor_name||'Unassigned';
    const status  = humanizeStatus(a.status||'pending');
    const col = avatarColor(patient);
    return `<tr>
      <td><div class="flex items-center gap-2"><div class="avatar avatar-sm" style="background:${col}">${initials(patient)}</div>${patient}</div></td>
      <td>${doctor}</td><td>${a.startTime||a.start_time||'—'}</td><td>${statusBadge(status)}</td>
    </tr>`;
  }).join('');
}

function renderActivities() {
  const list = $('#activity-list'); if (!list) return;
  const bg  = { blue:'var(--primary-light)', success:'#D1FAE5', warning:'#FEF3C7', purple:'#EDE9FE', danger:'#FEE2E2', teal:'var(--teal-light)' };
  const fg  = { blue:'var(--primary)', success:'var(--success)', warning:'var(--warning)', purple:'var(--purple)', danger:'var(--danger)', teal:'var(--teal)' };
  const data = (HMS.activities||[]).slice(0,8);
  list.innerHTML = data.map(a => `
    <div class="activity-item">
      <div class="activity-dot" style="background:${bg[a.color]||bg.blue};color:${fg[a.color]||fg.blue}"><i class="fas ${a.icon}"></i></div>
      <div class="activity-content">
        <div class="title">${a.title}</div><div class="desc">${a.desc}</div>
        <div class="time"><i class="fas fa-clock" style="margin-right:3px"></i>${a.time}</div>
      </div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════════
   PATIENTS  (full API CRUD + search/filter/pagination)
════════════════════════════════════════════════════════════ */
let patientEditId = null;
function initPatients() {
  pagination.patients = { page:1, limit:12, total:0, filter:'', status:'' };
  fetchPatients();
  const search = $('#patient-search');
  if (search) search.addEventListener('input', debounce(e => {
    pagination.patients.page=1; pagination.patients.filter=e.target.value; fetchPatients();
  }, 300));
  const statusF = $('#patient-status-filter');
  if (statusF) statusF.addEventListener('change', e => {
    pagination.patients.page=1; pagination.patients.status=e.target.value; fetchPatients();
  });
  document.getElementById('patient-pg')?.addEventListener('click', e => {
    const btn = e.target.closest('.page-btn[data-p]');
    if (btn) { pagination.patients.page=+btn.dataset.p; fetchPatients(); }
  });
  document.getElementById('patient-form-submit')?.addEventListener('click', submitPatientForm);
  document.getElementById('patient-form-add-btn')?.addEventListener('click', () => openAddPatientModal());
}
async function fetchPatients() {
  const { page, limit, filter, status } = pagination.patients;
  const tbody = $('#patients-tbody'); if (!tbody) return;
  tbody.innerHTML = spinnerRow(8);
  try {
    const qs = new URLSearchParams({ page, limit, ...(filter&&{search:filter}), ...(status&&{status}) });
    const res = await apiRequest(`/patients?${qs}`);
    const rows = (res.patients||[]).map(normalizePatientRow);
    appState.patients = rows;
    pagination.patients.total = res.total||rows.length;
    renderPatientsTable(rows);
    renderPagination('patient-pg', pagination.patients);
    updatePatientStats(res);
  } catch(e) {
    tbody.innerHTML = errorRow(8, e.message||'Failed to load patients.');
  }
}
function updatePatientStats(res) {
  // Compute stats from the returned patients array since backend has no stats sub-object
  const patients = res.patients || [];
  const total = res.total || patients.length;
  const active = patients.filter(p => (p.status||'').toLowerCase() === 'active').length;
  const recovered = patients.filter(p => (p.status||'').toLowerCase() === 'recovered').length;
  const critical = patients.filter(p => (p.status||'').toLowerCase() === 'critical').length;
  [['pat-total',total],['pat-active',active],['pat-recovered',recovered],['pat-critical',critical]].forEach(([id,v]) => {
    const el = $(`#${id}`); if (el) el.textContent = Number(v).toLocaleString();
  });
}
function normalizePatientRow(row) {
  const name = [row.firstName||row.first_name, row.lastName||row.last_name].filter(Boolean).join(' ') || row.name || 'Unknown Patient';
  const birthDate = row.dateOfBirth||row.date_of_birth;
  const age = birthDate ? Math.max(0, new Date().getFullYear()-new Date(birthDate).getFullYear()) : (row.age||'—');
  return {
    id: String(row.id??row.patient_id??'0'),
    name, age, gender: row.gender||'Other',
    blood: row.bloodGroup||row.blood_group||'—',
    contact: row.phone||row.contact||'—',
    disease: row.disease||row.primaryDiagnosis||row.primary_diagnosis||'General Care',
    status: humanizeStatus(row.status||'active'),
    admitted: formatDate(row.createdAt||row.created_at||row.admissionDate),
    doctor: row.doctor||row.doctorName||row.doctor_name||'Unassigned',
    address: row.address||'—',
  };
}
function renderPatientsTable(rows) {
  const tbody = $('#patients-tbody'); if (!tbody) return;
  if (!rows.length) { tbody.innerHTML = emptyRow(8,'No patients found.','fa-user-injured'); return; }
  tbody.innerHTML = rows.map(p => `
    <tr>
      <td><span class="text-primary fw-600">${p.id}</span></td>
      <td><div class="flex items-center gap-2">
        <div class="avatar avatar-sm" style="background:${avatarColor(p.name)}">${initials(p.name)}</div>
        <div><div class="fw-600" style="font-size:.875rem">${p.name}</div><div class="text-xs text-muted">${p.blood}</div></div>
      </div></td>
      <td>${p.age}</td><td>${p.gender}</td><td>${p.contact}</td><td>${p.disease}</td>
      <td>${statusBadge(p.status)}</td>
      <td><div class="flex gap-1">
        <button class="btn btn-sm btn-outline btn-icon" title="View"   onclick="viewPatient('${p.id}')"><i class="fas fa-eye"></i></button>
        <button class="btn btn-sm btn-outline btn-icon" title="Edit"   onclick="editPatient('${p.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-danger  btn-icon" title="Delete" onclick="deletePatient('${p.id}','${p.name}')"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`).join('');
}
function viewPatient(id) {
  const p = appState.patients.find(x=>x.id===id)||HMS.patients?.find(x=>x.id===id); if (!p) return;
  $('#view-patient-content').innerHTML = `
    <div style="text-align:center;margin-bottom:1.5rem">
      <div class="avatar avatar-xl" style="background:${avatarColor(p.name)};margin:0 auto .75rem">${initials(p.name)}</div>
      <h2 style="font-size:1.2rem;font-weight:700">${p.name}</h2>
      <p class="text-muted text-sm">${p.id} &bull; ${p.disease}</p>
      <div style="margin-top:.5rem">${statusBadge(p.status)}</div>
    </div>
    <div class="grid-2 grid" style="gap:.85rem">
      ${[['Age',p.age],['Gender',p.gender],['Blood Group',p.blood],['Contact',p.contact],['Admitted',p.admitted],['Assigned Doctor',p.doctor],['Address',p.address]].map(([k,v])=>`
        <div style="background:var(--gray-50);border-radius:var(--radius);padding:.85rem">
          <div class="text-xs text-muted fw-600 mb-1">${k}</div>
          <div class="fw-600" style="font-size:.875rem">${v}</div>
        </div>`).join('')}
    </div>`;
  openModal('modal-view-patient');
}
function openAddPatientModal() {
  patientEditId = null;
  document.getElementById('patient-form-title').textContent = 'Add New Patient';
  ['pf-firstname','pf-lastname','pf-dob','pf-phone','pf-email','pf-address'].forEach(id => { const el=$(`#${id}`); if(el) el.value=''; });
  ['pf-gender','pf-blood','pf-status'].forEach(id => { const el=$(`#${id}`); if(el) el.selectedIndex=0; });
  openModal('modal-patient-form');
}
function editPatient(id) {
  const raw = appState.patientsRaw?.find(x=>String(x.id)===String(id));
  const p = appState.patients.find(x=>x.id===String(id));
  if (!p) return;
  patientEditId = id;
  document.getElementById('patient-form-title').textContent = 'Edit Patient';
  const parts = p.name.split(' ');
  const fn = $('#pf-firstname'); if(fn) fn.value = parts[0]||'';
  const ln = $('#pf-lastname'); if(ln) ln.value = parts.slice(1).join(' ')||'';
  const ph = $('#pf-phone'); if(ph) ph.value = p.contact !== '—' ? p.contact : '';
  const st = $('#pf-status'); if(st) st.value = (p.status||'active').toLowerCase();
  const gd = $('#pf-gender'); if(gd) gd.value = p.gender||'Other';
  const bl = $('#pf-blood'); if(bl) bl.value = p.blood !== '—' ? p.blood : '';
  openModal('modal-patient-form');
}
async function submitPatientForm() {
  const btn = $('#patient-form-submit');
  const firstName = ($('#pf-firstname')?.value || '').trim();
  const phone     = ($('#pf-phone')?.value    || '').trim();
  if (!firstName) { toast('First name is required','warning'); return; }
  if (!phone)     { toast('Phone number is required','warning'); return; }
  const payload = {
    firstName,
    lastName:   ($('#pf-lastname')?.value  || '').trim() || null,
    dateOfBirth: $('#pf-dob')?.value       || null,
    gender:      $('#pf-gender')?.value    || 'Other',
    bloodGroup:  $('#pf-blood')?.value     || null,
    phone,
    email:       ($('#pf-email')?.value    || '').trim() || null,
    address:     ($('#pf-address')?.value  || '').trim() || null,
    status:      $('#pf-status')?.value    || 'active',
  };
  btn.disabled=true; btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Saving…';
  try {
    if (patientEditId) { await apiRequest(`/patients/${patientEditId}`, { method:'PUT', body:JSON.stringify(payload) }); toast('Patient updated!','success'); }
    else { await apiRequest('/patients', { method:'POST', body:JSON.stringify(payload) }); toast(`Patient ${firstName} added!`,'success'); }
    closeModal('modal-patient-form'); fetchPatients();
  } catch(e) { toast(e.message||'Failed to save patient','error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Save Patient'; }
}
function deletePatient(id, name) {
  confirmDialog(`This will permanently delete <strong>${name}</strong>.`, async () => {
    try { await apiRequest(`/patients/${id}`, { method:'DELETE' }); toast('Patient deleted','success'); fetchPatients(); }
    catch(e) { toast(e.message||'Delete failed','error'); }
  });
}

/* ══════════════════════════════════════════════════════════
   DOCTORS  (full API CRUD + search/filter)
════════════════════════════════════════════════════════════ */
let doctorEditId = null;
function initDoctors() {
  fetchDoctors();
  const search = $('#doctor-search');
  if (search) search.addEventListener('input', debounce(e=>fetchDoctors(e.target.value), 300));
  const deptF = $('#doctor-dept-filter');
  if (deptF) deptF.addEventListener('change', ()=>fetchDoctors($('#doctor-search')?.value||''));
  document.getElementById('doctor-form-submit')?.addEventListener('click', submitDoctorForm);
  document.getElementById('doctor-form-add-btn')?.addEventListener('click', ()=>openAddDoctorModal());
}
async function fetchDoctors(filter='') {
  const grid = $('#doctors-grid'); if (!grid) return;
  grid.innerHTML = `<div class="loading-state" style="grid-column:1/-1;text-align:center;padding:3rem"><div class="spinner" style="margin:0 auto 1rem"></div><p>Loading doctors…</p></div>`;
  try {
    const dept = $('#doctor-dept-filter')?.value||'';
    const qs = new URLSearchParams({ ...(filter&&{search:filter}), ...(dept&&dept!=='All Departments'&&{department:dept}) });
    const res = await apiRequest(`/doctors?${qs}`);
    const rows = (res.doctors||[]).map(normalizeDoctorRow);
    appState.doctors = rows;
    renderDoctorsGrid(rows);
  } catch(e) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--danger)"><i class="fas fa-exclamation-circle" style="font-size:2rem;margin-bottom:1rem"></i><p>${e.message}</p></div>`;
  }
}
function normalizeDoctorRow(row) {
  return {
    id:String(row.id??row.doctor_id??'0'),
    name:row.name||row.doctor_name||'Unknown Doctor',
    dept:row.departmentName||row.department_name||'General',
    status:humanizeStatus(row.status||'available'),
    exp:row.experience??row.exp??0, patients:row.patients??row.patientCount??0,
    rating:row.rating??4.5, schedule:row.schedule||'Mon-Fri 9AM-5PM',
    contact:row.phone||row.contact||'—', email:row.email||'—',
    color:avatarColor(row.name||row.doctor_name||'Dr'),
    qualification:row.qualification||'MBBS',
  };
}
function renderDoctorsGrid(rows) {
  const grid = $('#doctors-grid'); if (!grid) return;
  if (!rows.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--gray-400)"><i class="fas fa-user-md" style="font-size:3rem;margin-bottom:1rem"></i><p>No doctors found</p></div>`;
    return;
  }
  grid.innerHTML = rows.map(d => {
    const dotCls = d.status==='Available'?'online':d.status==='Busy'?'busy':'offline';
    return `
    <div class="doctor-card">
      <div class="doctor-avatar-wrap">
        <div class="avatar avatar-xl" style="background:${d.color}">${initials(d.name)}</div>
        <span class="doctor-online status-dot ${dotCls}"></span>
      </div>
      <div class="doctor-name">${d.name}</div>
      <div class="doctor-dept">${d.dept}</div>
      <div style="margin:.5rem 0">${statusBadge(d.status)}</div>
      <div class="doctor-stats">
        <div class="doctor-stat"><div class="value">${d.exp}y</div><div class="label">Exp.</div></div>
        <div class="doctor-stat"><div class="value">${d.patients}</div><div class="label">Patients</div></div>
        <div class="doctor-stat"><div class="value">${d.rating}★</div><div class="label">Rating</div></div>
      </div>
      <div class="divider"></div>
      <div class="text-xs text-muted mb-3"><i class="fas fa-clock" style="margin-right:4px"></i>${d.schedule}</div>
      <div class="flex gap-2">
        <button class="btn btn-primary btn-sm flex-1" onclick="viewDoctor('${d.id}')"><i class="fas fa-eye"></i> View</button>
        <button class="btn btn-outline btn-sm" onclick="editDoctor('${d.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-danger btn-sm" onclick="deleteDoctor('${d.id}','${d.name}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}
function viewDoctor(id) {
  const d = appState.doctors.find(x=>x.id===id); if (!d) return;
  $('#view-doctor-content').innerHTML = `
    <div style="background:linear-gradient(135deg,${d.color},var(--teal));border-radius:var(--radius-lg);padding:2rem;text-align:center;color:#fff;margin-bottom:1.5rem">
      <div class="avatar avatar-xl" style="background:rgba(255,255,255,.2);border:3px solid rgba(255,255,255,.5);margin:0 auto 1rem;font-size:1.6rem">${initials(d.name)}</div>
      <h2 style="font-size:1.15rem;font-weight:700">${d.name}</h2>
      <p style="opacity:.85;margin-top:.2rem">${d.dept} &bull; ${d.id}</p>
    </div>
    <div class="grid-2 grid" style="gap:.85rem">
      ${[['Experience',`${d.exp} years`],['Total Patients',d.patients],['Rating',`${d.rating}/5 ★`],['Status',d.status],['Contact',d.contact],['Email',d.email],['Schedule',d.schedule],['Qualification',d.qualification]].map(([k,v])=>`
        <div style="background:var(--gray-50);border-radius:var(--radius);padding:.85rem">
          <div class="text-xs text-muted fw-600 mb-1">${k}</div>
          <div class="fw-600" style="font-size:.875rem">${v}</div>
        </div>`).join('')}
    </div>`;
  openModal('modal-view-doctor');
}
function openAddDoctorModal() {
  doctorEditId=null;
  document.getElementById('doctor-form-title').textContent='Add New Doctor';
  ['df-name','df-specialization','df-contact','df-email','df-fee'].forEach(id=>{const el=$(`#${id}`);if(el)el.value='';});
  openModal('modal-doctor-form');
  populateDeptBranchSelects('df-dept-id','df-branch-id');
}
function editDoctor(id) {
  const d=appState.doctors.find(x=>x.id===String(id)); if(!d) return;
  doctorEditId=id;
  document.getElementById('doctor-form-title').textContent='Edit Doctor';
  const fn=$('#df-name'); if(fn) fn.value=d.name;
  const dc=$('#df-contact'); if(dc) dc.value=d.contact!=='—'?d.contact:'';
  const de=$('#df-email'); if(de) de.value=d.email!=='—'?d.email:'';
  const ds=$('#df-status'); if(ds) ds.value=(d.status||'available').toLowerCase();
  openModal('modal-doctor-form');
}
async function submitDoctorForm() {
  const btn=$('#doctor-form-submit');
  const name=($('#df-name')?.value||'').trim();
  const departmentId = $('#df-dept-id')?.value || $('#df-dept')?.value;
  const branchId = $('#df-branch-id')?.value || '1';
  if(!name){ toast('Doctor name is required','warning'); return; }
  if(!departmentId){ toast('Department is required','warning'); return; }
  const payload={
    name,
    departmentId: +departmentId,
    branchId: +branchId,
    specialization: ($('#df-specialization')?.value||'').trim()||null,
    phone: ($('#df-contact')?.value||'').trim()||null,
    email: ($('#df-email')?.value||'').trim()||null,
    consultationFee: +($('#df-fee')?.value||0),
    status: $('#df-status')?.value||'available',
  };
  btn.disabled=true; btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Saving…';
  try {
    if(doctorEditId){await apiRequest(`/doctors/${doctorEditId}`,{method:'PUT',body:JSON.stringify(payload)});toast('Doctor updated!','success');}
    else{await apiRequest('/doctors',{method:'POST',body:JSON.stringify(payload)});toast(`Dr. ${name} added!`,'success');}
    closeModal('modal-doctor-form'); fetchDoctors();
  } catch(e){toast(e.message||'Failed to save doctor','error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Save Doctor';}
}
function deleteDoctor(id,name){
  confirmDialog(`This will permanently delete <strong>${name}</strong>.`,async()=>{
    try{await apiRequest(`/doctors/${id}`,{method:'DELETE'});toast('Doctor deleted','success');fetchDoctors();}
    catch(e){toast(e.message||'Delete failed','error');}
  });
}

/* ══════════════════════════════════════════════════════════
   APPOINTMENTS  (full API + mini-calendar + status filter)
════════════════════════════════════════════════════════════ */
function initAppointments() {
  renderMiniCalendar();
  pagination.appointments = { page:1, limit:10, total:0, filter:'', status:'' };
  fetchAppointments();
  $('#appt-search')?.addEventListener('input', debounce(e=>{pagination.appointments.page=1;pagination.appointments.filter=e.target.value;fetchAppointments();},300));
  $('#appt-status-filter')?.addEventListener('change', e=>{pagination.appointments.page=1;pagination.appointments.status=e.target.value;fetchAppointments();});
  document.getElementById('appt-pg')?.addEventListener('click', e=>{
    const btn=e.target.closest('.page-btn[data-p]');
    if(btn){pagination.appointments.page=+btn.dataset.p;fetchAppointments();}
  });
  document.getElementById('appt-form-submit')?.addEventListener('click', submitAppointmentForm);
  populateDoctorSelect('af-doctor');
  populatePatientSelect('af-patient-id');
}
async function fetchAppointments() {
  const{page,limit,filter,status}=pagination.appointments;
  const tbody=$('#appt-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(9);
  try {
    const qs=new URLSearchParams({page,limit,...(filter&&{search:filter}),...(status&&{status})});
    const res=await apiRequest(`/appointments?${qs}`);
    const rows=(res.appointments||[]).map(normalizeAppointmentRow);
    appState.appointments=rows;
    pagination.appointments.total=res.total||rows.length;
    renderAppointmentsTable(rows);
    renderPagination('appt-pg',pagination.appointments);
    updateApptStats(res);
  } catch(e){tbody.innerHTML=errorRow(9,e.message);}
}
function updateApptStats(res) {
  const appts = res.appointments || [];
  const confirmed  = appts.filter(a=>(a.status||'').toLowerCase()==='confirmed').length;
  const pending    = appts.filter(a=>(a.status||'').toLowerCase()==='pending').length;
  const completed  = appts.filter(a=>(a.status||'').toLowerCase()==='completed').length;
  const cancelled  = appts.filter(a=>(a.status||'').toLowerCase()==='cancelled').length;
  [['appt-confirmed',confirmed],['appt-pending',pending],['appt-completed',completed],['appt-cancelled',cancelled]].forEach(([id,v])=>{
    const el=$(`#${id}`); if(el) el.textContent=Number(v).toLocaleString();
  });
}
function normalizeAppointmentRow(row) {
  return {
    id:String(row.id??row.appointment_id??'0'),
    patient:row.patientName||row.patient_name||'Unknown Patient',
    doctor:row.doctorName||row.doctor_name||'Unassigned',
    dept:row.departmentName||row.department_name||'General',
    date:formatDate(row.appointmentDate||row.appointment_date),
    time:row.startTime||row.start_time||'—',
    status:humanizeStatus(row.status||'pending'),
    type:humanizeStatus(row.appointmentType||row.appointment_type||'consultation'),
  };
}
function renderAppointmentsTable(rows) {
  const tbody=$('#appt-tbody'); if(!tbody) return;
  if(!rows.length){tbody.innerHTML=emptyRow(9,'No appointments found.','fa-calendar');return;}
  tbody.innerHTML=rows.map(a=>`
    <tr>
      <td><span class="text-primary fw-600">${a.id}</span></td>
      <td><div class="flex items-center gap-2"><div class="avatar avatar-sm" style="background:${avatarColor(a.patient)}">${initials(a.patient)}</div><span class="fw-500">${a.patient}</span></div></td>
      <td>${a.doctor}</td><td>${a.dept}</td><td>${a.date}</td><td>${a.time}</td>
      <td>${statusBadge(a.status)}</td>
      <td><span class="badge badge-primary">${a.type}</span></td>
      <td><div class="flex gap-1">
        <button class="btn btn-sm btn-outline btn-icon" onclick="editAppointment('${a.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="cancelAppointment('${a.id}')"><i class="fas fa-times"></i></button>
      </div></td>
    </tr>`).join('');
}
async function submitAppointmentForm() {
  const btn=$('#appt-form-submit');
  const patientId  = $('#af-patient-id')?.value  || $('#af-patient')?.value;
  const doctorId   = $('#af-doctor')?.value;
  const apptDate   = $('#af-date')?.value;
  const startTime  = $('#af-time')?.value  || $('#af-start-time')?.value;
  const endTime    = $('#af-end-time')?.value;
  // Derive departmentId and branchId from selected doctor
  const selDoc = appState.doctors.find(d=>String(d.id)===String(doctorId));
  const departmentId = selDoc?._departmentId || $('#af-dept-id')?.value || '1';
  const branchId     = selDoc?._branchId     || $('#af-branch-id')?.value || '1';
  if(!patientId)  { toast('Patient is required','warning'); return; }
  if(!doctorId)   { toast('Doctor is required','warning'); return; }
  if(!apptDate)   { toast('Appointment date is required','warning'); return; }
  if(!startTime)  { toast('Start time is required','warning'); return; }
  if(!endTime)    { toast('End time is required','warning'); return; }
  const payload={
    patientId:+patientId, doctorId:+doctorId,
    departmentId:+departmentId, branchId:+branchId,
    appointmentDate:apptDate, startTime, endTime,
    appointmentType:$('#af-type')?.value||'consultation',
    status:$('#af-status')?.value||'pending',
    notes:$('#af-notes')?.value||null,
  };
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Scheduling…';
  try{
    await apiRequest('/appointments',{method:'POST',body:JSON.stringify(payload)});
    toast('Appointment scheduled!','success');closeModal('modal-appt-form');fetchAppointments();
  }catch(e){toast(e.message||'Failed to schedule','error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-calendar-check"></i> Schedule';}
}
function editAppointment(id){toast(`Editing appointment ${id}…`,'info');}
function cancelAppointment(id){
  confirmDialog('Cancel this appointment?',async()=>{
    try{await apiRequest(`/appointments/${id}`,{method:'PUT',body:JSON.stringify({status:'cancelled'})});toast('Appointment cancelled','warning');fetchAppointments();}
    catch(e){toast(e.message,'error');}
  },'Yes, Cancel');
}
async function populateDoctorSelect(selectId) {
  const sel=$(`#${selectId}`); if(!sel) return;
  try{
    const res=await apiRequest('/doctors');
    const docs=res.doctors||[];
    // Store dept/branch on appState.doctors for appointment form cross-linking
    docs.forEach(d=>{
      const existing=appState.doctors.find(x=>String(x.id)===String(d.id||d.doctor_id));
      if(existing){
        existing._departmentId=d.departmentId||d.department_id;
        existing._branchId=d.branchId||d.branch_id;
      }
    });
    sel.innerHTML='<option value="">Select Doctor…</option>'+docs.map(d=>{
      const did=d.id||d.doctor_id;
      const dname=d.name||d.doctor_name;
      const dept=d.departmentName||d.department_name||'';
      return `<option value="${did}" data-dept="${d.departmentId||d.department_id||1}" data-branch="${d.branchId||d.branch_id||1}">${dname}${dept?' – '+dept:''}</option>`;
    }).join('');
    // When doctor changes, auto-fill hidden dept/branch inputs for appointment form
    sel.onchange=function(){
      const opt=this.options[this.selectedIndex];
      const deptInput=$('#af-dept-id')||$('#dsf-dept');
      const branchInput=$('#af-branch-id')||$('#dsf-branch');
      if(deptInput) deptInput.value=opt?.dataset?.dept||'1';
      if(branchInput) branchInput.value=opt?.dataset?.branch||'1';
    };
  }catch(e){console.warn('populateDoctorSelect failed',e);}
}
async function populateDeptBranchSelects(deptSelectId, branchSelectId) {
  try{
    const [dRes, bRes] = await Promise.all([apiRequest('/departments'), apiRequest('/branches')]);
    const dSel=$(`#${deptSelectId}`); const bSel=$(`#${branchSelectId}`);
    if(dSel) dSel.innerHTML='<option value="">Select Department…</option>'+(dRes.departments||[]).map(d=>`<option value="${d.department_id||d.id}">${d.department_name||d.name}</option>`).join('');
    if(bSel) bSel.innerHTML='<option value="">Select Branch…</option>'+(bRes.branches||[]).map(b=>`<option value="${b.branch_id||b.id}">${b.branch_name||b.name}</option>`).join('');
  }catch(e){}
}
function renderMiniCalendar() {
  const today=new Date(); const year=today.getFullYear(), month=today.getMonth();
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames=['Su','Mo','Tu','We','Th','Fr','Sa'];
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const eventDays=[3,7,10,14,17,21,24,28];
  const container=$('#mini-calendar'); if(!container) return;
  container.innerHTML=`
    <div class="flex items-center justify-between mb-3">
      <button class="btn btn-outline btn-sm btn-icon"><i class="fas fa-chevron-left"></i></button>
      <span class="fw-700">${months[month]} ${year}</span>
      <button class="btn btn-outline btn-sm btn-icon"><i class="fas fa-chevron-right"></i></button>
    </div>
    <div class="cal-header">${dayNames.map(d=>`<div class="cal-day-name">${d}</div>`).join('')}</div>
    <div class="calendar-grid">
      ${Array(firstDay).fill('<div></div>').join('')}
      ${Array.from({length:daysInMonth},(_,i)=>{
        const day=i+1,isToday=day===today.getDate(),hasEvent=eventDays.includes(day);
        return `<div class="cal-day${isToday?' today':''}${hasEvent?' has-event':''}" onclick="toast('${months[month]} ${day}','info')">${day}</div>`;
      }).join('')}
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   PRESCRIPTIONS  (live API)
════════════════════════════════════════════════════════════ */
function initPrescriptions() {
  fetchPrescriptions();
  // Load medicines into appState so prescription medicine selector has options
  if(!appState.medicines.length) apiRequest('/medicines').then(r=>{ appState.medicines=(r.medicines||[]).map(m=>({id:String(m.medicine_id||m.id),name:m.medicine_name||m.name})); renderRxMedicineList(); }).catch(()=>{});
  $('#rx-add-medicine')?.addEventListener('click', addRxMedicine);
  $('#rx-form-submit')?.addEventListener('click', submitRxForm);
  $('#rx-search')?.addEventListener('input', debounce(e=>fetchPrescriptions(e.target.value),300));
  populatePatientSelect('rx-patient-select');
  populateDoctorSelect('rx-doctor');
  renderRxMedicineList();
}
async function fetchPrescriptions(filter='') {
  const list=$('#rx-list'); if(!list) return;
  list.innerHTML=`<div class="loading-state" style="text-align:center;padding:3rem"><div class="spinner" style="margin:0 auto 1rem"></div><p>Loading prescriptions…</p></div>`;
  try{
    const qs=new URLSearchParams({...(filter&&{search:filter})});
    const res=await apiRequest(`/prescriptions?${qs}`);
    const rows=res.prescriptions||[];
    appState.prescriptions=rows;
    renderPrescriptionsList(rows.length?rows:HMS.prescriptions);
  }catch(e){renderPrescriptionsList(HMS.prescriptions);}
}
function renderPrescriptionsList(rxList) {
  const list=$('#rx-list'); if(!list) return;
  if(!rxList||!rxList.length){
    list.innerHTML=`<div class="empty-state" style="padding:3rem;text-align:center"><i class="fas fa-file-prescription" style="font-size:3rem;color:var(--gray-300);margin-bottom:1rem"></i><h3>No prescriptions</h3></div>`;
    return;
  }
  list.innerHTML=rxList.map(rx=>{
    // Backend returns first_name+last_name from JOIN, not a patientName field
    const patientName = rx.patientName || rx.patient ||
      ([rx.first_name,rx.last_name].filter(Boolean).join(' ')) || 'Unknown';
    const doctorName = rx.doctorName || rx.doctor || rx.doctor_name || 'Unassigned';
    const meds=rx.medicines||rx.items||[];
    return `
    <div class="card mb-4" style="overflow:hidden">
      <div class="rx-header">
        <div class="flex items-center justify-between">
          <div><div style="font-size:.72rem;opacity:.7">PRESCRIPTION ID</div><div style="font-size:1.1rem;font-weight:700">${rx.id||rx.prescription_id||'RX'}</div></div>
          <div style="text-align:right"><div style="font-size:.72rem;opacity:.7">DATE</div><div class="fw-600">${formatDate(rx.date||rx.created_at)}</div></div>
        </div>
      </div>
      <div class="card-body">
        <div class="two-col mb-4">
          <div><div class="text-xs text-muted fw-600 mb-1">Patient</div>
            <div class="flex items-center gap-2"><div class="avatar avatar-sm" style="background:${avatarColor(patientName)}">${initials(patientName)}</div><span class="fw-600">${patientName}</span></div>
          </div>
          <div><div class="text-xs text-muted fw-600 mb-1">Doctor</div>
            <div class="flex items-center gap-2"><div class="avatar avatar-sm" style="background:${avatarColor(doctorName)}">${initials(doctorName)}</div><span class="fw-600">${doctorName}</span></div>
          </div>
        </div>
        <div style="background:var(--primary-light);border-radius:var(--radius);padding:1rem;margin-bottom:1rem">
          <div class="text-xs fw-700 text-primary mb-1">DIAGNOSIS</div>
          <div style="font-size:.9rem;color:var(--gray-700)">${rx.diagnosis||'—'}</div>
        </div>
        <div class="fw-700 mb-3" style="font-size:.9rem"><i class="fas fa-pills text-primary" style="margin-right:.5rem"></i>Medicines</div>
        ${meds.map(m=>`
          <div class="medicine-row">
            <div style="flex:1"><div class="fw-600" style="font-size:.875rem">${m.name||m.medicine_name||'Medicine'}</div><div class="text-xs text-muted mt-1">${m.notes||''}</div></div>
            <div class="text-center" style="min-width:70px"><div class="text-xs text-muted">Dose</div><div class="fw-600 text-sm">${m.dose||m.dosage||'—'}</div></div>
            <div class="text-center" style="min-width:90px"><div class="text-xs text-muted">Frequency</div><div class="fw-600 text-sm">${m.freq||m.frequency||'—'}</div></div>
            <div class="text-center" style="min-width:70px"><div class="text-xs text-muted">Duration</div><div class="fw-600 text-sm">${m.dur||m.duration||'—'}</div></div>
          </div>`).join('')}
        <div style="background:var(--teal-light);border-radius:var(--radius);padding:1rem;margin-top:1rem">
          <div class="text-xs fw-700 text-teal mb-1"><i class="fas fa-sticky-note" style="margin-right:4px"></i>DOCTOR NOTES</div>
          <div style="font-size:.875rem;color:var(--gray-700)">${rx.notes||'—'}</div>
        </div>
      </div>
      <div style="padding:1rem 1.5rem;border-top:1px solid var(--gray-100);display:flex;gap:.75rem;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" onclick="toast('Printing…','info')"><i class="fas fa-print"></i> Print</button>
        <button class="btn btn-primary btn-sm" onclick="openModal('modal-rx-form')"><i class="fas fa-edit"></i> Edit</button>
      </div>
    </div>`;
  }).join('');
}
/* ── Prescription medicine list — now with medicine selector ── */
let rxMedicines = [{name:'',medicineId:null,dose:'',freq:'',dur:'7',qty:'7',notes:''}];
function renderRxMedicineList() {
  const container=$('#rx-medicine-list'); if(!container) return;
  const medOptions=(appState.medicines||[]).map(m=>`<option value="${m.id}" data-name="${m.name}">${m.name}</option>`).join('');
  container.innerHTML=rxMedicines.map((m,i)=>`
    <div class="medicine-row" style="flex-wrap:wrap;gap:.5rem">
      <select class="form-control" style="flex:2;min-width:150px" onchange="rxMedicines[${i}].medicineId=this.value;rxMedicines[${i}].name=this.options[this.selectedIndex]?.dataset?.name||this.options[this.selectedIndex]?.text">
        <option value="">Select medicine…</option>${medOptions}
      </select>
      <input class="form-control" style="width:80px" placeholder="Dose" value="${m.dose}" oninput="rxMedicines[${i}].dose=this.value">
      <input class="form-control" style="width:100px" placeholder="Frequency" value="${m.freq}" oninput="rxMedicines[${i}].freq=this.value">
      <input class="form-control" style="width:70px" placeholder="Days" value="${m.dur}" oninput="rxMedicines[${i}].dur=this.value">
      <input class="form-control" style="width:70px" placeholder="Qty" value="${m.qty}" oninput="rxMedicines[${i}].qty=this.value">
      <button class="del-btn" onclick="removeRxMedicine(${i})"><i class="fas fa-trash"></i></button>
    </div>`).join('');
}
function addRxMedicine(){rxMedicines.push({name:'',medicineId:null,dose:'',freq:'',dur:'7',qty:'7',notes:''});renderRxMedicineList();}
function removeRxMedicine(i){rxMedicines.splice(i,1);if(!rxMedicines.length)rxMedicines=[{name:'',medicineId:null,dose:'',freq:'',dur:'7',qty:'7',notes:''}];renderRxMedicineList();}
async function submitRxForm(){
  const btn=$('#rx-form-submit');
  // Patient and doctor come from select dropdowns with numeric IDs
  const patientId = $('#rx-patient-select')?.value || $('#af-patient-id')?.value;
  const doctorId  = $('#rx-doctor')?.value;
  if(!patientId){ toast('Patient is required','warning'); return; }
  if(!doctorId){  toast('Doctor is required','warning'); return; }
  // Build medicine list — each medicine needs a medicineId (from select) + details
  const validMeds = rxMedicines.filter(m=>m.medicineId||m.name);
  if(!validMeds.length){ toast('Add at least one medicine','warning'); return; }
  // Map free-text medicines: look up medicine id from appState
  const medicines = validMeds.map(m=>({
    medicineId: m.medicineId || (appState.medicines.find(x=>x.name.toLowerCase()===m.name.toLowerCase())?.id),
    dosage: m.dose||m.dosage||'As directed',
    frequency: m.freq||m.frequency||'Once daily',
    durationDays: parseInt(m.dur||m.duration||7)||7,
    quantity: parseInt(m.qty||m.quantity||7)||7,
    instructions: m.notes||'',
  })).filter(m=>m.medicineId);
  if(!medicines.length){ toast('Could not resolve medicine IDs. Use the medicine selector.','warning'); return; }
  const payload={ patientId:+patientId, doctorId:+doctorId, diagnosis:$('#rx-diagnosis')?.value||null, notes:$('#rx-notes')?.value||null, medicines };
  btn.disabled=true; btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Issuing…';
  try{
    await apiRequest('/prescriptions',{method:'POST',body:JSON.stringify(payload)});
    toast('Prescription issued!','success'); closeModal('modal-rx-form'); rxMedicines=[{name:'',dose:'',freq:'',dur:'',qty:'7',notes:'',medicineId:null}]; fetchPrescriptions();
  }catch(e){ toast(e.message||'Failed to save','error'); }
  finally{ btn.disabled=false; btn.innerHTML='<i class="fas fa-file-prescription"></i> Issue Prescription'; }
}
async function populatePatientSelect(selectId){
  const sel=$(`#${selectId}`); if(!sel) return;
  try{
    const res=await apiRequest('/patients?limit=200');
    sel.innerHTML='<option value="">Select Patient…</option>'+(res.patients||[]).map(p=>{
      const pid=p.id||p.patient_id;
      const pname=p.name||[p.firstName,p.lastName].filter(Boolean).join(' ');
      return `<option value="${pid}">${pname}</option>`;
    }).join('');
  }catch(e){}
}

/* ══════════════════════════════════════════════════════════
   PHARMACY  (full API + add/edit medicine modals)
════════════════════════════════════════════════════════════ */
let medicineEditId = null;
function initPharmacy(){
  pagination.pharmacy={page:1,limit:10,total:0,filter:'',status:''};
  fetchMedicines();
  $('#pharmacy-search')?.addEventListener('input', debounce(e=>{pagination.pharmacy.page=1;pagination.pharmacy.filter=e.target.value;fetchMedicines();},300));
  $('#pharmacy-status-filter')?.addEventListener('change', e=>{pagination.pharmacy.page=1;pagination.pharmacy.status=e.target.value;fetchMedicines();});
  document.getElementById('pharmacy-pg')?.addEventListener('click', e=>{
    const btn=e.target.closest('.page-btn[data-p]');
    if(btn){pagination.pharmacy.page=+btn.dataset.p;fetchMedicines();}
  });
  document.getElementById('medicine-form-submit')?.addEventListener('click', submitMedicineForm);
  document.getElementById('medicine-add-btn')?.addEventListener('click', ()=>openAddMedicineModal());
}
async function fetchMedicines(){
  const{page,limit,filter,status}=pagination.pharmacy;
  const tbody=$('#pharmacy-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(8);
  try{
    const qs=new URLSearchParams({page,limit,...(filter&&{search:filter}),...(status&&{status})});
    const res=await apiRequest(`/medicines?${qs}`);
    const rows=(res.medicines||[]).map(normalizeMedicineRow);
    appState.medicines=rows;
    pagination.pharmacy.total=res.total||rows.length;
    renderPharmacyTable(rows);
    renderPagination('pharmacy-pg',pagination.pharmacy);
    updatePharmacyStats(res);
  }catch(e){tbody.innerHTML=errorRow(8,e.message);}
}
function updatePharmacyStats(res){
  const meds = res.medicines || [];
  const total    = res.total || meds.length;
  const inStock  = meds.filter(m=>(m.status||'').toLowerCase()==='in_stock').length;
  const lowStock = meds.filter(m=>(m.status||'').toLowerCase()==='low_stock').length;
  const critical = meds.filter(m=>(m.status||'').toLowerCase()==='out_of_stock').length;
  [['ph-total',total],['ph-instock',inStock],['ph-lowstock',lowStock],['ph-critical',critical]].forEach(([id,v])=>{
    const el=$(`#${id}`); if(el) el.textContent=Number(v).toLocaleString();
  });
}
function normalizeMedicineRow(row){
  return {
    id:String(row.medicine_id??row.id??'0'),
    name:row.medicine_name||row.name||'Unknown',
    category:row.category||'General',
    stock:Number(row.stock_quantity??row.stock??0),
    expiry:formatDate(row.expiry_date||row.expiry),
    supplier:row.supplier||'—',
    price:Number(row.unit_price??row.price??0),
    status:humanizeStatus(row.status||'in_stock'),
  };
}
function renderPharmacyTable(rows){
  const tbody=$('#pharmacy-tbody'); if(!tbody) return;
  if(!rows.length){tbody.innerHTML=emptyRow(8,'No medicines found.','fa-pills');return;}
  tbody.innerHTML=rows.map(m=>{
    const pct=Math.min((m.stock/500)*100,100);
    const barColor=m.status==='In Stock'?'var(--success)':m.status==='Low Stock'?'var(--warning)':'var(--danger)';
    return `
    <tr>
      <td><span class="text-primary fw-600">${m.id}</span></td>
      <td><div class="fw-600" style="font-size:.875rem">${m.name}</div><div class="text-xs text-muted">${m.category}</div></td>
      <td><div class="flex items-center gap-2">
        <div style="width:70px"><div class="progress"><div class="progress-bar" style="width:${pct}%;background:${barColor}"></div></div></div>
        <span class="fw-600">${m.stock}</span>
      </div></td>
      <td>${m.expiry}</td><td>${m.supplier}</td><td>${formatCurrency(m.price)}</td>
      <td>${statusBadge(m.status)}</td>
      <td><div class="flex gap-1">
        <button class="btn btn-sm btn-outline btn-icon" onclick="editMedicine('${m.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-teal btn-icon" onclick="restockMedicine('${m.id}','${m.name}')"><i class="fas fa-plus"></i></button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteMedicine('${m.id}','${m.name}')"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');
}
function openAddMedicineModal(){
  medicineEditId=null;
  document.getElementById('medicine-form-title').textContent='Add Medicine';
  ['mf-name','mf-category','mf-stock','mf-price','mf-expiry','mf-supplier'].forEach(id=>{const el=$(`#${id}`);if(el)el.value='';});
  openModal('modal-medicine-form');
}
function editMedicine(id){
  const m=appState.medicines.find(x=>x.id===id); if(!m) return;
  medicineEditId=id;
  document.getElementById('medicine-form-title').textContent='Edit Medicine';
  $('#mf-name').value=m.name; $('#mf-category').value=m.category; $('#mf-stock').value=m.stock;
  $('#mf-price').value=m.price; $('#mf-expiry').value=m.expiry; $('#mf-supplier').value=m.supplier;
  openModal('modal-medicine-form');
}
async function submitMedicineForm(){
  const btn=$('#medicine-form-submit');
  const name=($('#mf-name')?.value||'').trim();
  if(!name){toast('Medicine name is required','warning');return;}
  const payload={medicineName:name,name,category:$('#mf-category')?.value,stockQuantity:+($('#mf-stock')?.value||0),unitPrice:+($('#mf-price')?.value||0),expiryDate:$('#mf-expiry')?.value,supplier:$('#mf-supplier')?.value};
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Saving…';
  try{
    if(medicineEditId){await apiRequest(`/medicines/${medicineEditId}`,{method:'PUT',body:JSON.stringify(payload)});toast('Medicine updated!','success');}
    else{await apiRequest('/medicines',{method:'POST',body:JSON.stringify(payload)});toast(`${name} added!`,'success');}
    closeModal('modal-medicine-form');fetchMedicines();
  }catch(e){toast(e.message||'Failed to save','error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Save';}
}
function restockMedicine(id,name){
  const qty=prompt(`Restock "${name}". Enter quantity to add:`,'100');
  if(!qty||isNaN(+qty)){return;}
  const m=appState.medicines.find(x=>x.id===id);
  const newStock=(m?.stock||0)+(+qty);
  apiRequest(`/medicines/${id}`,{method:'PUT',body:JSON.stringify({stockQuantity:newStock})}).then(()=>{toast(`${name} restocked by ${qty}!`,'success');fetchMedicines();}).catch(e=>toast(e.message,'error'));
}
function deleteMedicine(id,name){
  confirmDialog(`Delete <strong>${name}</strong> from inventory?`,async()=>{
    try{await apiRequest(`/medicines/${id}`,{method:'DELETE'});toast('Medicine removed','success');fetchMedicines();}
    catch(e){toast(e.message,'error');}
  });
}

/* ══════════════════════════════════════════════════════════
   BILLING  (full API + payment recording)
════════════════════════════════════════════════════════════ */
function initBilling(){
  pagination.billing={page:1,limit:10,total:0,filter:'',status:''};
  fetchBills();
  $('#billing-search')?.addEventListener('input', debounce(e=>{pagination.billing.page=1;pagination.billing.filter=e.target.value;fetchBills();},300));
  $('#billing-status-filter')?.addEventListener('change', e=>{pagination.billing.page=1;pagination.billing.status=e.target.value;fetchBills();});
  document.getElementById('billing-pg')?.addEventListener('click', e=>{
    const btn=e.target.closest('.page-btn[data-p]');
    if(btn){pagination.billing.page=+btn.dataset.p;fetchBills();}
  });
  document.getElementById('bill-form-submit')?.addEventListener('click', submitBillForm);
  document.getElementById('bill-add-btn')?.addEventListener('click', ()=>openModal('modal-bill-form'));
}
async function fetchBills(){
  const{page,limit,filter,status}=pagination.billing;
  const list=$('#billing-list'); if(!list) return;
  list.innerHTML=`<div class="loading-state" style="text-align:center;padding:3rem"><div class="spinner" style="margin:0 auto 1rem"></div><p>Loading invoices…</p></div>`;
  try{
    const qs=new URLSearchParams({page,limit,...(filter&&{search:filter}),...(status&&{status})});
    const res=await apiRequest(`/billing?${qs}`);
    const bills=res.bills||[];
    appState.bills=bills;
    pagination.billing.total=res.total||bills.length;
    renderBillingList(bills.length?bills:HMS.invoices);
    renderPagination('billing-pg',pagination.billing);
    updateBillingStats(res);
  }catch(e){renderBillingList(HMS.invoices);}
}
function updateBillingStats(res){
  const bills = res.bills || [];
  const totalRev  = bills.reduce((s,b)=>s+Number(b.total_amount||0),0);
  const paid      = bills.filter(b=>(b.status||'').toLowerCase()==='paid').reduce((s,b)=>s+Number(b.total_amount||0),0);
  const pending   = bills.filter(b=>(b.status||'').toLowerCase()==='pending').reduce((s,b)=>s+Number(b.total_amount||0),0);
  const partial   = bills.filter(b=>(b.status||'').toLowerCase()==='partial').reduce((s,b)=>s+Number(b.total_amount||0),0);
  [['bill-total',totalRev],['bill-paid',paid],['bill-pending',pending],['bill-overdue',partial]].forEach(([id,v])=>{
    const el=$(`#${id}`); if(el) el.textContent=formatCurrency(v);
  });
}
function renderBillingList(bills){
  const list=$('#billing-list'); if(!list) return;
  if(!bills||!bills.length){
    list.innerHTML=`<div class="empty-state" style="padding:3rem;text-align:center"><i class="fas fa-file-invoice-dollar" style="font-size:3rem;color:var(--gray-300);margin-bottom:1rem"></i><h3>No invoices found</h3></div>`;
    return;
  }
  list.innerHTML=bills.map(inv=>{
    const isPaid=String(inv.status).toLowerCase()==='paid';
    const isPending=String(inv.status).toLowerCase()==='pending';
    const total=Number(inv.total_amount||inv.totalAmount||0);
    const billId=inv.bill_id||inv.id||'INV';
    return `
    <div class="card mb-4" style="overflow:hidden">
      <div style="background:linear-gradient(135deg,#0F172A,var(--primary-dark));color:#fff;padding:1.5rem">
        <div class="flex items-center justify-between">
          <div><div style="font-size:.7rem;opacity:.6;letter-spacing:.08em">INVOICE</div><div style="font-size:1.3rem;font-weight:800">BL-${billId}</div></div>
          <div>${statusBadge(humanizeStatus(inv.status||'pending'))}</div>
        </div>
        <div class="two-col mt-4">
          <div><div style="font-size:.7rem;opacity:.6;margin-bottom:.2rem">BILLED TO</div>
            <div class="fw-600">${inv.patient||inv.patientName||inv.patient_name||'Patient'}</div>
            <div style="font-size:.8rem;opacity:.7">${inv.doctor||inv.doctorName||inv.doctor_name||'—'}</div>
          </div>
          <div style="text-align:right"><div style="font-size:.7rem;opacity:.6;margin-bottom:.2rem">DATE / DUE</div>
            <div class="fw-600">${formatDate(inv.createdAt||inv.created_at||inv.date)}</div>
            <div style="font-size:.8rem;opacity:.7">Mode: ${inv.payment_mode||inv.paymentMode||'Cash'}</div>
          </div>
        </div>
      </div>
      <div class="card-body">
        <div style="background:var(--gray-900);color:#fff;border-radius:var(--radius-lg);padding:1.25rem 1.5rem">
          <div class="flex justify-between" style="font-size:1.1rem;font-weight:800"><span>Total Amount</span><span>${formatCurrency(total)}</span></div>
          ${inv.notes?`<div style="margin-top:.75rem;font-size:.825rem;opacity:.7">${inv.notes}</div>`:''}
        </div>
      </div>
      <div style="padding:1rem 1.5rem;border-top:1px solid var(--gray-100);display:flex;gap:.75rem;justify-content:flex-end">
        <button class="btn btn-outline btn-sm" onclick="toast('Downloading PDF…','info')"><i class="fas fa-download"></i> PDF</button>
        <button class="btn btn-primary btn-sm" onclick="toast('Printing…','info')"><i class="fas fa-print"></i> Print</button>
        ${!isPaid?`<button class="btn btn-success btn-sm" onclick="recordPayment('${billId}','${total}')"><i class="fas fa-check"></i> Mark Paid</button>`:''}
      </div>
    </div>`;
  }).join('');
}
async function recordPayment(billId, total){
  const mode=prompt('Payment mode (cash/card/upi):','cash')||'cash';
  try{
    await apiRequest(`/billing/${billId}/payment`,{method:'PUT',body:JSON.stringify({paymentMode:mode,amount:+total})});
    toast('Payment recorded!','success');fetchBills();
  }catch(e){toast(e.message||'Payment failed','error');}
}
async function submitBillForm(){
  const btn=$('#bill-form-submit');
  const patientId=$('#bf-patient')?.value; const branchId=$('#bf-branch')?.value||'1'; const amount=$('#bf-amount')?.value;
  if(!patientId||!amount){toast('Patient and amount are required','warning');return;}
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Creating…';
  try{
    await apiRequest('/billing',{method:'POST',body:JSON.stringify({patientId,branchId,totalAmount:+amount,paymentMode:$('#bf-paymode')?.value||'cash',notes:$('#bf-notes')?.value})});
    toast('Invoice created!','success');closeModal('modal-bill-form');fetchBills();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Create Invoice';}
}

/* ══════════════════════════════════════════════════════════
   STAFF  (full API CRUD)
════════════════════════════════════════════════════════════ */
let staffEditId=null;
function initStaff(){
  pagination.staff={page:1,limit:10,total:0,filter:'',dept:''};
  fetchStaff();
  $('#staff-search')?.addEventListener('input', debounce(e=>{pagination.staff.page=1;pagination.staff.filter=e.target.value;fetchStaff();},300));
  $('#staff-dept-filter')?.addEventListener('change', e=>{pagination.staff.page=1;pagination.staff.dept=e.target.value;fetchStaff();});
  document.getElementById('staff-pg')?.addEventListener('click', e=>{
    const btn=e.target.closest('.page-btn[data-p]');
    if(btn){pagination.staff.page=+btn.dataset.p;fetchStaff();}
  });
  document.getElementById('staff-form-submit')?.addEventListener('click', submitStaffForm);
  document.getElementById('staff-add-btn')?.addEventListener('click', ()=>openAddStaffModal());
}
async function fetchStaff(){
  const{page,limit,filter,dept}=pagination.staff;
  const tbody=$('#staff-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(7);
  try{
    const qs=new URLSearchParams({page,limit,...(filter&&{search:filter}),...(dept&&dept!=='All Departments'&&{department:dept})});
    const res=await apiRequest(`/staff?${qs}`);
    const rows=(res.staff||[]).map(normalizeStaffRow);
    appState.staff=rows;
    pagination.staff.total=res.total||rows.length;
    renderStaffTable(rows);
    renderPagination('staff-pg',pagination.staff);
    updateStaffStats(res);
  }catch(e){tbody.innerHTML=errorRow(7,e.message);}
}
function updateStaffStats(res){
  const staff = res.staff || [];
  const total   = res.total || staff.length;
  const active  = staff.filter(s=>(s.status||'').toLowerCase()==='active').length;
  const onLeave = staff.filter(s=>(s.status||'').toLowerCase()==='on_leave').length;
  const inactive= staff.filter(s=>(s.status||'').toLowerCase()==='inactive').length;
  [['staff-total',total],['staff-present',active],['staff-absent',inactive],['staff-leave',onLeave]].forEach(([id,v])=>{
    const el=$(`#${id}`); if(el) el.textContent=Number(v).toLocaleString();
  });
}
function normalizeStaffRow(row){
  return {
    id:String(row.staff_id??row.id??'0'),
    name:row.staff_name||row.name||'Unknown Staff',
    dept:row.department_name||row.departmentName||'General',
    position:row.role||row.position||'Staff',
    contact:row.phone||row.contact||'—',
    email:row.email||'—',
    status:humanizeStatus(row.status||'active'),
    joined:formatDate(row.hire_date||row.joined||row.created_at),
  };
}
function renderStaffTable(rows){
  const tbody=$('#staff-tbody'); if(!tbody) return;
  if(!rows.length){tbody.innerHTML=emptyRow(7,'No staff found.','fa-users');return;}
  tbody.innerHTML=rows.map(s=>`
    <tr>
      <td><span class="text-primary fw-600">${s.id}</span></td>
      <td><div class="flex items-center gap-2">
        <div class="avatar avatar-sm" style="background:${avatarColor(s.name)}">${initials(s.name)}</div>
        <div><div class="fw-600" style="font-size:.875rem">${s.name}</div><div class="text-xs text-muted">${s.joined}</div></div>
      </div></td>
      <td>${s.dept}</td><td>${s.position}</td><td>${s.contact}</td>
      <td>${statusBadge(s.status)}</td>
      <td><div class="flex gap-1">
        <button class="btn btn-sm btn-outline btn-icon" onclick="viewStaff('${s.id}')"><i class="fas fa-eye"></i></button>
        <button class="btn btn-sm btn-outline btn-icon" onclick="editStaff('${s.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="deleteStaff('${s.id}','${s.name}')"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`).join('');
}
function viewStaff(id){
  const s=appState.staff.find(x=>x.id===id); if(!s) return;
  toast(`${s.name} — ${s.position}, ${s.dept}`,'info');
}
function openAddStaffModal(){
  staffEditId=null;
  document.getElementById('staff-form-title').textContent='Add Staff Member';
  ['sf-name','sf-position','sf-contact','sf-email'].forEach(id=>{const el=$(`#${id}`);if(el)el.value='';});
  openModal('modal-staff-form');
}
function editStaff(id){
  const s=appState.staff.find(x=>x.id===id); if(!s) return;
  staffEditId=id;
  document.getElementById('staff-form-title').textContent='Edit Staff';
  $('#sf-name').value=s.name; $('#sf-position').value=s.position; $('#sf-contact').value=s.contact; $('#sf-email').value=s.email; $('#sf-dept').value=s.dept; $('#sf-status').value=s.status;
  openModal('modal-staff-form');
}
async function submitStaffForm(){
  const btn=$('#staff-form-submit');
  const staffName=($('#sf-name')?.value||'').trim();
  const departmentId = $('#sf-dept-id')?.value || $('#sf-dept')?.value;
  const branchId = $('#sf-branch-id')?.value || '1';
  const role = $('#sf-position')?.value || 'STAFF';
  if(!staffName){ toast('Staff name is required','warning'); return; }
  if(!departmentId){ toast('Department is required','warning'); return; }
  const payload={
    staffName, name:staffName,
    role, departmentId:+departmentId, branchId:+branchId,
    phone:($('#sf-contact')?.value||'').trim()||null,
    email:($('#sf-email')?.value||'').trim()||null,
    hireDate:$('#sf-hire-date')?.value||new Date().toISOString().split('T')[0],
    status:$('#sf-status')?.value||'active',
  };
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Saving…';
  try{
    if(staffEditId){await apiRequest(`/staff/${staffEditId}`,{method:'PUT',body:JSON.stringify(payload)});toast('Staff updated!','success');}
    else{await apiRequest('/staff',{method:'POST',body:JSON.stringify(payload)});toast(`${staffName} added!`,'success');}
    closeModal('modal-staff-form');fetchStaff();
  }catch(e){toast(e.message||'Failed to save','error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Save Staff';}
}
function deleteStaff(id,name){
  confirmDialog(`Remove <strong>${name}</strong> from staff?`,async()=>{
    try{await apiRequest(`/staff/${id}`,{method:'DELETE'});toast('Staff removed','success');fetchStaff();}
    catch(e){toast(e.message,'error');}
  });
}

/* ══════════════════════════════════════════════════════════
   REPORTS  (live API charts + stat cards)
════════════════════════════════════════════════════════════ */
async function initReports(){
  loadReportsData();
  document.getElementById('rpt-generate')?.addEventListener('click', ()=>toast('Generating report…','info'));
}
async function loadReportsData(){
  try{
    const[revR,patR,apptR,pharmR]=await Promise.all([
      apiRequest('/reports/revenue').catch(()=>null),
      apiRequest('/reports/patients').catch(()=>null),
      apiRequest('/reports/appointments').catch(()=>null),
      apiRequest('/reports/pharmacy').catch(()=>null),
    ]);
    // Revenue chart
    const revData=revR?.data||revR?.report||HMS.chartData.revenueMonthly;
    if(Array.isArray(revData)){
      buildRevenueChart('revenue-chart',{labels:revData.map(r=>r.month||r.month_name||''),revenue:revData.map(r=>+r.revenue||0),expenses:revData.map(r=>+r.expenses||0)});
    } else {
      buildRevenueChart('revenue-chart',HMS.chartData.revenueMonthly);
    }
    // Patient chart
    const patData=patR?.data||patR?.report;
    if(Array.isArray(patData)){
      const ctx=$('#rpt-patient-chart'); if(ctx){
        new Chart(ctx,{type:'line',data:{labels:patData.map(r=>r.month||r.label||''),datasets:[{label:'Patients',data:patData.map(r=>+r.count||+r.total||0),borderColor:'#2563EB',backgroundColor:'rgba(37,99,235,.1)',fill:true,tension:.4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{x:{grid:{display:false}},y:{grid:{color:'#F1F5F9'},beginAtZero:true}}}});
      }
    } else {
      const ctx=$('#rpt-patient-chart'); if(ctx){
        const d=HMS.chartData.patientMonthly;
        new Chart(ctx,{type:'line',data:{labels:d.labels,datasets:[{label:'Inpatient',data:d.inpatient,borderColor:'#2563EB',backgroundColor:'rgba(37,99,235,.1)',fill:true,tension:.4},{label:'Outpatient',data:d.outpatient,borderColor:'#0D9488',backgroundColor:'rgba(13,148,136,.1)',fill:true,tension:.4}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{x:{grid:{display:false}},y:{grid:{color:'#F1F5F9'},beginAtZero:true}}}});
      }
    }
    // Stats
    updateReportStats(revR,patR,apptR);
  }catch(e){
    buildRevenueChart('revenue-chart',HMS.chartData.revenueMonthly);
  }
}
function updateReportStats(revR,patR,apptR){
  const r=revR?.summary||{},p=patR?.summary||{},a=apptR?.summary||{};
  [['rpt-revenue',r.ytdRevenue&&formatCurrency(r.ytdRevenue)],['rpt-patients',p.total&&Number(p.total).toLocaleString()],['rpt-appts',a.total&&Number(a.total).toLocaleString()]].forEach(([id,v])=>{const el=$(`#${id}`);if(el&&v)el.textContent=v;});
}

/* ══════════════════════════════════════════════════════════
   SETTINGS
════════════════════════════════════════════════════════════ */
function initSettings(){
  const togglesContainer=$('#notif-toggles');
  if(togglesContainer){
    const notifSettings=[['Email notifications for new appointments',true],['SMS alerts for critical patients',true],['Low stock pharmacy alerts',true],['Daily summary reports',false],['Security login alerts',true]];
    togglesContainer.innerHTML=notifSettings.map(([label,checked])=>`
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm">${label}</span>
        <label style="position:relative;display:inline-block;width:42px;height:22px;cursor:pointer">
          <input type="checkbox" ${checked?'checked':''} style="opacity:0;width:0;height:0" onchange="this.nextElementSibling.style.background=this.checked?'var(--primary)':'var(--gray-200)';this.nextElementSibling.querySelector('span').style.transform=this.checked?'translateX(20px)':'translateX(0)'">
          <span style="position:absolute;cursor:pointer;inset:0;background:${checked?'var(--primary)':'var(--gray-200)'};border-radius:99px;transition:.3s;display:flex;align-items:center;padding:2px">
            <span style="background:#fff;border-radius:50%;width:18px;height:18px;transform:${checked?'translateX(20px)':'translateX(0)'};transition:.3s;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,.2)"></span>
          </span>
        </label>
      </div>`).join('');
  }
  $('#settings-save')?.addEventListener('click', ()=>toast('Settings saved!','success'));
}

/* ══════════════════════════════════════════════════════════
   BRANCHES
════════════════════════════════════════════════════════════ */
function initBranches(){
  fetchBranches();
  $('#branch-search')?.addEventListener('input', debounce(e=>fetchBranches(e.target.value),300));
  $('#branch-form-submit')?.addEventListener('click', submitBranchForm);
  $('#branch-add-btn')?.addEventListener('click', ()=>openModal('modal-branch-form'));
}
async function fetchBranches(filter=''){
  const tbody=$('#branches-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(6);
  try{
    const qs=new URLSearchParams({...(filter&&{search:filter})});
    const res=await apiRequest(`/branches?${qs}`);
    const rows=res.branches||[];
    appState.branches=rows;
    renderBranchesTable(rows);
  }catch(e){tbody.innerHTML=errorRow(6,e.message);}
}
function renderBranchesTable(rows){
  const tbody=$('#branches-tbody'); if(!tbody) return;
  if(!rows.length){tbody.innerHTML=emptyRow(6,'No branches found.','fa-hospital');return;}
  tbody.innerHTML=rows.map(b=>`
    <tr>
      <td><span class="text-primary fw-600">${b.branch_id||b.id}</span></td>
      <td><div class="fw-600">${b.branch_name||b.name}</div></td>
      <td>${b.address||'—'}</td><td>${b.phone||'—'}</td><td>${b.email||'—'}</td>
      <td>${statusBadge(humanizeStatus(b.status||'active'))}</td>
      <td><div class="flex gap-1">
        <button class="btn btn-sm btn-outline btn-icon" onclick="toast('Editing branch…','info')"><i class="fas fa-edit"></i></button>
      </div></td>
    </tr>`).join('');
}
async function submitBranchForm(){
  const btn=$('#branch-form-submit');
  const name=($('#brf-name')?.value||'').trim();
  if(!name){toast('Branch name required','warning');return;}
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>';
  try{
    await apiRequest('/branches',{method:'POST',body:JSON.stringify({branchName:name,address:$('#brf-address')?.value,phone:$('#brf-phone')?.value,email:$('#brf-email')?.value})});
    toast('Branch created!','success');closeModal('modal-branch-form');fetchBranches();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Save';}
}

/* ══════════════════════════════════════════════════════════
   DEPARTMENTS
════════════════════════════════════════════════════════════ */
function initDepartments(){
  fetchDepartments();
  $('#dept-search')?.addEventListener('input', debounce(e=>fetchDepartments(e.target.value),300));
  $('#dept-form-submit')?.addEventListener('click', submitDeptForm);
  $('#dept-add-btn')?.addEventListener('click', ()=>openModal('modal-dept-form'));
}
async function fetchDepartments(filter=''){
  const tbody=$('#departments-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(6);
  try{
    const qs=new URLSearchParams({...(filter&&{search:filter})});
    const res=await apiRequest(`/departments?${qs}`);
    const rows=res.departments||[];
    appState.departments=rows;
    renderDepartmentsTable(rows);
  }catch(e){tbody.innerHTML=errorRow(6,e.message);}
}
function renderDepartmentsTable(rows){
  const tbody=$('#departments-tbody'); if(!tbody) return;
  if(!rows.length){tbody.innerHTML=emptyRow(6,'No departments found.','fa-hospital-alt');return;}
  tbody.innerHTML=rows.map(d=>`
    <tr>
      <td><span class="text-primary fw-600">${d.department_id||d.id}</span></td>
      <td><div class="fw-600">${d.department_name||d.name}</div></td>
      <td>${d.branch_name||d.branchName||'—'}</td>
      <td>${d.description||'—'}</td>
      <td>${statusBadge(humanizeStatus(d.status||'active'))}</td>
      <td><div class="flex gap-1">
        <button class="btn btn-sm btn-outline btn-icon" onclick="toast('Editing dept…','info')"><i class="fas fa-edit"></i></button>
      </div></td>
    </tr>`).join('');
}
async function submitDeptForm(){
  const btn=$('#dept-form-submit');
  const name=($('#dpf-name')?.value||'').trim(); const branchId=$('#dpf-branch')?.value;
  if(!name){toast('Department name required','warning');return;}
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>';
  try{
    await apiRequest('/departments',{method:'POST',body:JSON.stringify({departmentName:name,branchId:branchId||1,description:$('#dpf-desc')?.value})});
    toast('Department created!','success');closeModal('modal-dept-form');fetchDepartments();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Save';}
}

/* ══════════════════════════════════════════════════════════
   NURSES
════════════════════════════════════════════════════════════ */
function initNurses(){
  fetchNurses();
  populateDeptBranchSelects('nrf-dept','nrf-branch');
  $('#nurse-search')?.addEventListener('input', debounce(e=>fetchNurses(e.target.value),300));
  $('#nurse-form-submit')?.addEventListener('click', submitNurseForm);
  $('#nurse-add-btn')?.addEventListener('click', ()=>{
    openModal('modal-nurse-form');
    populateDeptBranchSelects('nrf-dept','nrf-branch');
  });
}
async function fetchNurses(filter=''){
  const tbody=$('#nurses-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(6);
  try{
    const qs=new URLSearchParams({...(filter&&{search:filter})});
    const res=await apiRequest(`/nurses?${qs}`);
    const rows=res.nurses||[];
    appState.nurses=rows;
    renderNursesTable(rows);
  }catch(e){tbody.innerHTML=errorRow(6,e.message);}
}
function renderNursesTable(rows){
  const tbody=$('#nurses-tbody'); if(!tbody) return;
  if(!rows.length){tbody.innerHTML=emptyRow(6,'No nurses found.','fa-user-nurse');return;}
  tbody.innerHTML=rows.map(n=>`
    <tr>
      <td><span class="text-primary fw-600">${n.nurse_id||n.id}</span></td>
      <td><div class="flex items-center gap-2"><div class="avatar avatar-sm" style="background:${avatarColor(n.nurse_name||n.name)}">${initials(n.nurse_name||n.name)}</div><span class="fw-600">${n.nurse_name||n.name}</span></div></td>
      <td>${n.department_name||n.departmentName||'—'}</td>
      <td>${n.phone||n.contact||'—'}</td>
      <td>${n.email||'—'}</td>
      <td>${statusBadge(humanizeStatus(n.status||'active'))}</td>
      <td><div class="flex gap-1">
        <button class="btn btn-sm btn-outline btn-icon" onclick="toast('Editing nurse…','info')"><i class="fas fa-edit"></i></button>
      </div></td>
    </tr>`).join('');
}
async function submitNurseForm(){
  const btn=$('#nurse-form-submit');
  const nurseName=($('#nrf-name')?.value||'').trim();
  const departmentId=$('#nrf-dept')?.value;
  const branchId=$('#nrf-branch')?.value||'1';
  if(!nurseName){ toast('Nurse name required','warning'); return; }
  if(!departmentId){ toast('Department is required','warning'); return; }
  btn.disabled=true; btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>';
  try{
    await apiRequest('/nurses',{method:'POST',body:JSON.stringify({
      nurseName, branchId:+branchId, departmentId:+departmentId,
      phone:($('#nrf-phone')?.value||'').trim()||null,
      email:($('#nrf-email')?.value||'').trim()||null,
      status:$('#nrf-status')?.value||'active',
    })});
    toast('Nurse added!','success'); closeModal('modal-nurse-form'); fetchNurses();
  }catch(e){ toast(e.message,'error'); }
  finally{ btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Save'; }
}

/* ══════════════════════════════════════════════════════════
   ADMISSIONS
════════════════════════════════════════════════════════════ */
function initAdmissions(){
  fetchAdmissions();
  $('#admission-search')?.addEventListener('input', debounce(e=>fetchAdmissions(e.target.value),300));
  $('#admission-form-submit')?.addEventListener('click', submitAdmissionForm);
  $('#admission-add-btn')?.addEventListener('click', ()=>openModal('modal-admission-form'));
}
async function fetchAdmissions(filter=''){
  const tbody=$('#admissions-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(7);
  try{
    const qs=new URLSearchParams({...(filter&&{search:filter})});
    const res=await apiRequest(`/admissions?${qs}`);
    const rows=res.admissions||[];
    appState.admissions=rows;
    renderAdmissionsTable(rows);
  }catch(e){tbody.innerHTML=errorRow(7,e.message);}
}
function renderAdmissionsTable(rows){
  const tbody=$('#admissions-tbody'); if(!tbody) return;
  if(!rows.length){tbody.innerHTML=emptyRow(7,'No admissions found.','fa-bed');return;}
  tbody.innerHTML=rows.map(a=>`
    <tr>
      <td><span class="text-primary fw-600">${a.admission_id||a.id}</span></td>
      <td><div class="flex items-center gap-2"><div class="avatar avatar-sm" style="background:${avatarColor(a.patient_name||a.patientName||'P')}">${initials(a.patient_name||a.patientName||'P')}</div><span class="fw-600">${a.patient_name||a.patientName||'Unknown'}</span></div></td>
      <td>${a.doctor_name||a.doctorName||'—'}</td>
      <td>${a.room_number||a.roomNumber||'—'}</td>
      <td>${formatDate(a.admission_date||a.admissionDate)}</td>
      <td>${formatDate(a.discharge_date||a.dischargeDate)||'Active'}</td>
      <td>${statusBadge(humanizeStatus(a.status||'active'))}</td>
      <td><div class="flex gap-1">
        <button class="btn btn-sm btn-outline btn-icon" onclick="toast('Viewing admission…','info')"><i class="fas fa-eye"></i></button>
        <button class="btn btn-sm btn-success btn-icon" onclick="dischargePatient('${a.admission_id||a.id}')"><i class="fas fa-sign-out-alt"></i></button>
      </div></td>
    </tr>`).join('');
}
async function submitAdmissionForm(){
  const btn=$('#admission-form-submit');
  const patientId=$('#adf-patient')?.value;
  if(!patientId){toast('Patient required','warning');return;}
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>';
  try{
    await apiRequest('/admissions',{method:'POST',body:JSON.stringify({patientId,doctorId:$('#adf-doctor')?.value,roomNumber:$('#adf-room')?.value,admissionDate:$('#adf-date')?.value||new Date().toISOString().split('T')[0],notes:$('#adf-notes')?.value})});
    toast('Patient admitted!','success');closeModal('modal-admission-form');fetchAdmissions();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Admit';}
}
function dischargePatient(id){
  confirmDialog('Discharge this patient?',async()=>{
    try{await apiRequest(`/admissions/${id}`,{method:'PUT',body:JSON.stringify({status:'discharged',dischargeDate:new Date().toISOString().split('T')[0]})});toast('Patient discharged','success');fetchAdmissions();}
    catch(e){toast(e.message,'error');}
  },'Yes, Discharge');
}

/* ══════════════════════════════════════════════════════════
   EQUIPMENT
════════════════════════════════════════════════════════════ */
function initEquipment(){
  fetchEquipment();
  $('#equipment-search')?.addEventListener('input', debounce(e=>fetchEquipment(e.target.value),300));
}
async function fetchEquipment(filter=''){
  const tbody=$('#equipment-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(6);
  try{
    const qs=new URLSearchParams({...(filter&&{search:filter})});
    const res=await apiRequest(`/equipment?${qs}`);
    const rows=res.equipment||[];
    appState.equipment=rows;
    renderEquipmentTable(rows);
  }catch(e){tbody.innerHTML=errorRow(6,e.message);}
}
function renderEquipmentTable(rows){
  const tbody=$('#equipment-tbody'); if(!tbody) return;
  if(!rows.length){tbody.innerHTML=emptyRow(6,'No equipment found.','fa-tools');return;}
  tbody.innerHTML=rows.map(e=>`
    <tr>
      <td><span class="text-primary fw-600">${e.equipment_id||e.id}</span></td>
      <td><div class="fw-600">${e.equipment_name||e.name}</div><div class="text-xs text-muted">${e.equipment_type||e.type||'General'}</div></td>
      <td>${e.department_name||e.departmentName||'—'}</td>
      <td>${e.serial_number||e.serialNumber||'—'}</td>
      <td>${formatDate(e.last_maintenance||e.lastMaintenance)||'—'}</td>
      <td>${statusBadge(humanizeStatus(e.status||'active'))}</td>
      <td><div class="flex gap-1">
        <button class="btn btn-sm btn-outline btn-icon" onclick="toast('Scheduling maintenance…','info')"><i class="fas fa-wrench"></i></button>
      </div></td>
    </tr>`).join('');
}

/* ══════════════════════════════════════════════════════════
   SHIFT LOGS
════════════════════════════════════════════════════════════ */
function initShiftLogs(){
  fetchShiftLogs();
  $('#shiftlog-search')?.addEventListener('input', debounce(e=>fetchShiftLogs(e.target.value),300));
}
async function fetchShiftLogs(filter=''){
  const tbody=$('#shiftlogs-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(7);
  try{
    const qs=new URLSearchParams({...(filter&&{search:filter})});
    const res=await apiRequest(`/shift-logs?${qs}`);
    // API returns key 'shifts' not 'shiftLogs'
    const rows=res.shifts||res.shiftLogs||res.shift_logs||[];
    appState.shiftLogs=rows;
    renderShiftLogsTable(rows);
  }catch(e){tbody.innerHTML=errorRow(7,e.message);}
}
function renderShiftLogsTable(rows){
  const tbody=$('#shiftlogs-tbody'); if(!tbody) return;
  if(!rows.length){tbody.innerHTML=emptyRow(7,'No shift logs found.','fa-clock');return;}
  tbody.innerHTML=rows.map(s=>`
    <tr>
      <td><span class="text-primary fw-600">${s.shift_log_id||s.id}</span></td>
      <td><div class="fw-600">${s.staff_name||s.staffName||'Unknown'}</div></td>
      <td>${s.branch_name||s.branchName||'—'}</td>
      <td>${formatDate(s.shift_date||s.shiftDate)}</td>
      <td>${s.start_time||s.startTime||'—'}</td>
      <td>${s.end_time||s.endTime||'—'}</td>
      <td>${statusBadge(humanizeStatus(s.status||'present'))}</td>
    </tr>`).join('');
}

/* ══════════════════════════════════════════════════════════
   PAY STRUCTURES
════════════════════════════════════════════════════════════ */
function initPayStructures(){
  fetchPayStructures();
  $('#paystructure-search')?.addEventListener('input', debounce(e=>fetchPayStructures(e.target.value),300));
  $('#paystructure-form-submit')?.addEventListener('click', submitPayStructureForm);
  $('#paystructure-add-btn')?.addEventListener('click', ()=>openModal('modal-paystructure-form'));
}
async function fetchPayStructures(filter=''){
  const tbody=$('#paystructures-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(6);
  try{
    const qs=new URLSearchParams({...(filter&&{search:filter})});
    const res=await apiRequest(`/pay-structures?${qs}`);
    const rows=res.payStructures||res.pay_structures||[];
    appState.payStructures=rows;
    renderPayStructuresTable(rows);
  }catch(e){tbody.innerHTML=errorRow(6,e.message);}
}
function renderPayStructuresTable(rows){
  const tbody=$('#paystructures-tbody'); if(!tbody) return;
  if(!rows.length){tbody.innerHTML=emptyRow(6,'No pay structures found.','fa-money-bill');return;}
  tbody.innerHTML=rows.map(p=>{
    const base=Number(p.base_salary||p.basicSalary||0);
    const allowance=Number(p.allowance||p.allowances||0);
    const overtime=Number(p.overtime_rate||p.overtimeRate||0);
    const gross=base+allowance;
    return `
    <tr>
      <td><span class="text-primary fw-600">${p.pay_structure_id||p.id}</span></td>
      <td><div class="fw-600">${p.staff_name||p.staffName||'—'}</div><div class="text-xs text-muted">${p.position_title||p.positionTitle||p.role||'—'}</div></td>
      <td>${formatCurrency(base)}</td>
      <td>${formatCurrency(allowance)}</td>
      <td>${formatCurrency(overtime)}/hr</td>
      <td>${formatCurrency(gross)}</td>
      <td><div class="flex gap-1">
        <button class="btn btn-sm btn-outline btn-icon" onclick="toast('Editing pay structure…','info')"><i class="fas fa-edit"></i></button>
      </div></td>
    </tr>`;
  }).join('');
}
async function submitPayStructureForm(){
  const btn=$('#paystructure-form-submit');
  const role=($('#psf-role')?.value||'').trim(); const basic=$('#psf-basic')?.value;
  if(!role||!basic){toast('Role and basic salary required','warning');return;}
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>';
  try{
    await apiRequest('/pay-structures',{method:'POST',body:JSON.stringify({role,basicSalary:+basic,hra:+($('#psf-hra')?.value||0),allowances:+($('#psf-allowances')?.value||0)})});
    toast('Pay structure created!','success');closeModal('modal-paystructure-form');fetchPayStructures();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Save';}
}

/* ══════════════════════════════════════════════════════════
   SALARIES
════════════════════════════════════════════════════════════ */
function initSalaries(){
  fetchSalaries();
  $('#salary-search')?.addEventListener('input', debounce(e=>fetchSalaries(e.target.value),300));
  $('#salary-form-submit')?.addEventListener('click', submitSalaryForm);
  $('#salary-add-btn')?.addEventListener('click', ()=>openModal('modal-salary-form'));
}
async function fetchSalaries(filter=''){
  const tbody=$('#salaries-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(7);
  try{
    const qs=new URLSearchParams({...(filter&&{search:filter})});
    const res=await apiRequest(`/salaries?${qs}`);
    const rows=res.salaries||[];
    appState.salaries=rows;
    renderSalariesTable(rows);
  }catch(e){tbody.innerHTML=errorRow(7,e.message);}
}
function renderSalariesTable(rows){
  const tbody=$('#salaries-tbody'); if(!tbody) return;
  if(!rows.length){tbody.innerHTML=emptyRow(7,'No salary records found.','fa-money-check-alt');return;}
  tbody.innerHTML=rows.map(s=>`
    <tr>
      <td><span class="text-primary fw-600">${s.salary_id||s.id}</span></td>
      <td><div class="fw-600">${s.staff_name||s.staffName||'—'}</div></td>
      <td>${s.month||'—'}</td>
      <td>${formatCurrency(s.basic_salary||s.basicSalary)}</td>
      <td>${formatCurrency(s.total_deductions||s.deductions||0)}</td>
      <td>${formatCurrency(s.net_salary||s.netSalary)}</td>
      <td>${statusBadge(humanizeStatus(s.payment_status||s.status||'pending'))}</td>
      <td><div class="flex gap-1">
        <button class="btn btn-sm btn-success btn-icon" onclick="markSalaryPaid('${s.salary_id||s.id}')"><i class="fas fa-check"></i></button>
        <button class="btn btn-sm btn-outline btn-icon" onclick="toast('Downloading slip…','info')"><i class="fas fa-download"></i></button>
      </div></td>
    </tr>`).join('');
}
async function submitSalaryForm(){
  const btn=$('#salary-form-submit');
  const staffId=$('#slf-staff')?.value; const month=$('#slf-month')?.value;
  if(!staffId||!month){toast('Staff and month required','warning');return;}
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>';
  try{
    await apiRequest('/salaries',{method:'POST',body:JSON.stringify({staffId,month,basicSalary:+($('#slf-basic')?.value||0),deductions:+($('#slf-deductions')?.value||0),paymentMode:$('#slf-paymode')?.value||'bank_transfer'})});
    toast('Salary record created!','success');closeModal('modal-salary-form');fetchSalaries();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Save';}
}
async function markSalaryPaid(id){
  try{
    await apiRequest(`/salaries/${id}`,{method:'PUT',body:JSON.stringify({paymentStatus:'paid'})});
    toast('Salary marked as paid!','success');fetchSalaries();
  }catch(e){toast(e.message,'error');}
}

/* ══════════════════════════════════════════════════════════
   NOTIFICATIONS
════════════════════════════════════════════════════════════ */
function renderNotifications(){
  const panel=$('#notif-panel'); if(!panel) return;
  panel.innerHTML=(HMS.notifications||[]).map(n=>`
    <div class="notif-item ${n.read?'read':''}" onclick="markNotifRead(${n.id})">
      <div class="notif-dot-badge"></div>
      <div style="flex:1">
        <div class="title">${n.title}</div><div class="desc">${n.desc}</div>
        <div class="time"><i class="fas fa-clock" style="margin-right:3px"></i>${n.time}</div>
      </div>
    </div>`).join('');
  renderNotificationBadge();
}
function markNotifRead(id){const n=(HMS.notifications||[]).find(x=>x.id===id);if(n)n.read=true;renderNotifications();}
function renderNotificationBadge(){const unread=(HMS.notifications||[]).filter(n=>!n.read).length;const badge=$('#notif-count');if(badge)badge.textContent=unread;}
function markAllRead(){(HMS.notifications||[]).forEach(n=>n.read=true);renderNotifications();toast('All notifications marked as read','success');}

/* ══════════════════════════════════════════════════════════
   SIDEBAR
════════════════════════════════════════════════════════════ */
function toggleSidebar(){
  if(window.innerWidth<=768){sidebarMobileOpen=!sidebarMobileOpen;$('.sidebar').classList.toggle('mobile-open',sidebarMobileOpen);$('.sidebar-overlay').classList.toggle('active',sidebarMobileOpen);}
  else{sidebarCollapsed=!sidebarCollapsed;$('.sidebar').classList.toggle('collapsed',sidebarCollapsed);$('.main-content').classList.toggle('collapsed',sidebarCollapsed);}
}
function closeMobileSidebar(){sidebarMobileOpen=false;$('.sidebar')?.classList.remove('mobile-open');$('.sidebar-overlay')?.classList.remove('active');}

/* ── Debounce ─────────────────────────────────────────────── */
function debounce(fn, ms=300){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};}

/* ══════════════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════
   OPERATION THEATRE (OT)
════════════════════════════════════════════════════════════ */
function initOT(){
  fetchOTTheatres();
  fetchOTSchedules();
  document.getElementById('ot-schedule-submit')?.addEventListener('click', submitOTSchedule);
  document.getElementById('ot-add-btn')?.addEventListener('click', ()=>openModal('modal-ot-form'));
}
async function fetchOTTheatres(){
  const list=$('#ot-theatres-list'); if(!list) return;
  list.innerHTML=`<div class="loading-state"><div class="spinner"></div><p>Loading…</p></div>`;
  try{
    const res=await apiRequest('/ot/theatres');
    const rows=res.theatres||[];
    if(!rows.length){list.innerHTML=`<div class="table-state empty"><i class="fas fa-hospital"></i><span>No theatres found</span></div>`;return;}
    list.innerHTML=`<div class="grid grid-4 gap-4">${rows.map(t=>`
      <div class="card" style="padding:1.25rem;border-left:4px solid var(--primary)">
        <div class="fw-700" style="font-size:.95rem;margin-bottom:.5rem">${t.theatre_name||t.name}</div>
        <div class="text-xs text-muted mb-2">ID: ${t.theatre_id||t.id}</div>
        <div>${statusBadge(humanizeStatus(t.status||'active'))}</div>
      </div>`).join('')}</div>`;
  }catch(e){list.innerHTML=`<div class="table-state error"><i class="fas fa-exclamation-circle"></i><span>${e.message}</span></div>`;}
}
async function fetchOTSchedules(filter=''){
  const tbody=$('#ot-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(8);
  try{
    const qs=new URLSearchParams({...(filter&&{search:filter})});
    const res=await apiRequest(`/ot/schedules?${qs}`);
    const rows=res.schedules||[];
    if(!rows.length){tbody.innerHTML=emptyRow(8,'No OT schedules found.','fa-procedures');return;}
    tbody.innerHTML=rows.map(s=>`
      <tr>
        <td><span class="text-primary fw-600">${s.schedule_id||s.id}</span></td>
        <td>${s.theatre_name||s.theatre_id||'—'}</td>
        <td>${s.patient_name||s.patient_id||'—'}</td>
        <td>${s.doctor_name||s.doctor_id||'—'}</td>
        <td>${s.procedure_name||'Surgery'}</td>
        <td>${formatDate(s.scheduled_date)}</td>
        <td>${s.start_time||'—'} – ${s.end_time||'—'}</td>
        <td>${statusBadge(humanizeStatus(s.status||'scheduled'))}</td>
        <td><div class="flex gap-1">
          <button class="btn btn-sm btn-outline btn-icon" onclick="updateOTStatus('${s.schedule_id||s.id}','completed')"><i class="fas fa-check"></i></button>
          <button class="btn btn-sm btn-danger btn-icon" onclick="deleteOTSchedule('${s.schedule_id||s.id}')"><i class="fas fa-trash"></i></button>
        </div></td>
      </tr>`).join('');
  }catch(e){tbody.innerHTML=errorRow(8,e.message);}
}
async function submitOTSchedule(){
  const btn=$('#ot-schedule-submit');
  const theatreId=$('#otf-theatre')?.value; const patientId=$('#otf-patient')?.value; const doctorId=$('#otf-doctor')?.value;
  const scheduledDate=$('#otf-date')?.value; const startTime=$('#otf-start')?.value; const endTime=$('#otf-end')?.value;
  if(!theatreId||!patientId||!doctorId||!scheduledDate||!startTime||!endTime){toast('All fields required','warning');return;}
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>';
  try{
    await apiRequest('/ot/schedules',{method:'POST',body:JSON.stringify({theatreId,patientId,doctorId,procedureName:$('#otf-procedure')?.value,scheduledDate,startTime,endTime})});
    toast('OT schedule created!','success');closeModal('modal-ot-form');fetchOTSchedules();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Schedule';}
}
async function updateOTStatus(id,status){
  try{await apiRequest(`/ot/schedules/${id}`,{method:'PUT',body:JSON.stringify({status})});toast(`Status updated to ${status}`,'success');fetchOTSchedules();}catch(e){toast(e.message,'error');}
}
async function deleteOTSchedule(id){
  confirmDialog('Delete this OT schedule?',async()=>{
    try{await apiRequest(`/ot/schedules/${id}`,{method:'DELETE'});toast('Schedule deleted','success');fetchOTSchedules();}catch(e){toast(e.message,'error');}
  });
}

/* ══════════════════════════════════════════════════════════
   LAB RESULTS
════════════════════════════════════════════════════════════ */
function initLabResults(){
  fetchLabResults();
  $('#lab-search')?.addEventListener('input', debounce(e=>fetchLabResults(e.target.value),300));
  document.getElementById('lab-form-submit')?.addEventListener('click', submitLabResult);
  document.getElementById('lab-add-btn')?.addEventListener('click', ()=>openModal('modal-lab-form'));
  populateDoctorSelect('lf-doctor');
}
async function fetchLabResults(filter=''){
  const tbody=$('#lab-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(8);
  try{
    const qs=new URLSearchParams({...(filter&&{search:filter})});
    const res=await apiRequest(`/lab-results?${qs}`);
    const rows=res.labResults||[];
    if(!rows.length){tbody.innerHTML=emptyRow(8,'No lab results found.','fa-flask');return;}
    tbody.innerHTML=rows.map(r=>`
      <tr>
        <td><span class="text-primary fw-600">${r.lab_result_id||r.id}</span></td>
        <td>${r.patient_name||r.patient_id||'—'}</td>
        <td>${r.doctor_name||r.doctor_id||'—'}</td>
        <td class="fw-600">${r.test_name||'—'}</td>
        <td>${r.result_value||'Pending'}</td>
        <td>${r.normal_range||'—'}</td>
        <td>${formatDate(r.created_at)}</td>
        <td>${statusBadge(humanizeStatus(r.status||'pending'))}</td>
        <td><div class="flex gap-1">
          <button class="btn btn-sm btn-outline btn-icon" onclick="updateLabStatus('${r.lab_result_id||r.id}','completed')"><i class="fas fa-check"></i></button>
        </div></td>
      </tr>`).join('');
  }catch(e){tbody.innerHTML=errorRow(8,e.message);}
}
async function submitLabResult(){
  const btn=$('#lab-form-submit');
  const patientId=$('#lf-patient')?.value; const doctorId=$('#lf-doctor')?.value; const testName=($('#lf-test')?.value||'').trim();
  if(!patientId||!doctorId||!testName){toast('Patient, doctor, and test name required','warning');return;}
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>';
  try{
    await apiRequest('/lab-results',{method:'POST',body:JSON.stringify({patientId,doctorId,testName,resultValue:$('#lf-result')?.value,normalRange:$('#lf-range')?.value})});
    toast('Lab result created!','success');closeModal('modal-lab-form');fetchLabResults();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Save';}
}
async function updateLabStatus(id,status){
  try{await apiRequest(`/lab-results/${id}`,{method:'PUT',body:JSON.stringify({status})});toast('Status updated','success');fetchLabResults();}catch(e){toast(e.message,'error');}
}

/* ══════════════════════════════════════════════════════════
   ROOMS & BEDS
════════════════════════════════════════════════════════════ */
function initRooms(){
  fetchRooms();
  $('#room-search')?.addEventListener('input', debounce(e=>fetchRooms(e.target.value),300));
  $('#room-type-filter')?.addEventListener('change', e=>fetchRooms($('#room-search')?.value||''));
  document.getElementById('room-form-submit')?.addEventListener('click', submitRoomForm);
  document.getElementById('room-add-btn')?.addEventListener('click', ()=>openModal('modal-room-form'));
}
async function fetchRooms(filter=''){
  const tbody=$('#rooms-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(6);
  try{
    const typeFilter=$('#room-type-filter')?.value||'';
    const res=await apiRequest('/rooms');
    let rows=res.rooms||[];
    if(filter) rows=rows.filter(r=>(r.room_number||'').toLowerCase().includes(filter.toLowerCase()));
    if(typeFilter&&typeFilter!=='All Types') rows=rows.filter(r=>(r.room_type||'').toLowerCase()===typeFilter.toLowerCase());
    renderRoomsStats(res.rooms||[]);
    if(!rows.length){tbody.innerHTML=emptyRow(6,'No rooms found.','fa-door-open');return;}
    tbody.innerHTML=rows.map(r=>`
      <tr>
        <td><span class="text-primary fw-600">${r.room_id||r.id}</span></td>
        <td class="fw-600">${r.room_number||'—'}</td>
        <td><span class="badge badge-primary">${humanizeStatus(r.room_type||'general')}</span></td>
        <td>${r.capacity||1}</td>
        <td>${r.branch_name||r.branch_id||'—'}</td>
        <td>${statusBadge(humanizeStatus(r.status||'available'))}</td>
        <td><div class="flex gap-1">
          <button class="btn btn-sm btn-teal btn-icon" onclick="toggleRoomStatus('${r.room_id||r.id}','${r.status}')"><i class="fas fa-toggle-on"></i></button>
          <button class="btn btn-sm btn-outline btn-icon" onclick="toast('Editing room…','info')"><i class="fas fa-edit"></i></button>
        </div></td>
      </tr>`).join('');
  }catch(e){tbody.innerHTML=errorRow(6,e.message);}
}
function renderRoomsStats(rooms){
  const total=rooms.length;
  const avail=rooms.filter(r=>r.status==='available').length;
  const occ=rooms.filter(r=>r.status==='occupied').length;
  const maint=rooms.filter(r=>r.status==='maintenance').length;
  [['room-total',total],['room-avail',avail],['room-occ',occ],['room-maint',maint]].forEach(([id,v])=>{const el=$(`#${id}`);if(el)el.textContent=v;});
}
async function toggleRoomStatus(id, current){
  const newStatus=current==='available'?'occupied':'available';
  try{await apiRequest(`/rooms/${id}`,{method:'PUT',body:JSON.stringify({status:newStatus})});toast(`Room marked ${newStatus}`,'success');fetchRooms();}catch(e){toast(e.message,'error');}
}
async function submitRoomForm(){
  const btn=$('#room-form-submit');
  const branchId=$('#rf-branch')?.value; const roomNumber=($('#rf-number')?.value||'').trim();
  if(!branchId||!roomNumber){toast('Branch and room number required','warning');return;}
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>';
  try{
    await apiRequest('/rooms',{method:'POST',body:JSON.stringify({branchId,roomNumber,roomType:$('#rf-type')?.value||'general',capacity:+($('#rf-capacity')?.value||1)})});
    toast('Room added!','success');closeModal('modal-room-form');fetchRooms();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Save';}
}

/* ══════════════════════════════════════════════════════════
   DOCTOR SHIFTS
════════════════════════════════════════════════════════════ */
function initDoctorShifts(){
  fetchDoctorShifts();
  $('#doctorshift-search')?.addEventListener('input', debounce(e=>fetchDoctorShifts(e.target.value),300));
  document.getElementById('doctorshift-form-submit')?.addEventListener('click', submitDoctorShiftForm);
  document.getElementById('doctorshift-add-btn')?.addEventListener('click', ()=>openModal('modal-doctorshift-form'));
  populateDoctorSelect('dsf-doctor');
}
async function fetchDoctorShifts(filter=''){
  const tbody=$('#doctorshifts-tbody'); if(!tbody) return;
  tbody.innerHTML=spinnerRow(7);
  try{
    const res=await apiRequest('/doctor-shifts');
    let rows=res.shifts||[];
    if(filter) rows=rows.filter(r=>(r.doctor_name||'').toLowerCase().includes(filter.toLowerCase())||String(r.doctor_id).includes(filter));
    if(!rows.length){tbody.innerHTML=emptyRow(7,'No doctor shifts found.','fa-calendar-alt');return;}
    tbody.innerHTML=rows.map(s=>`
      <tr>
        <td><span class="text-primary fw-600">${s.shift_id||s.id}</span></td>
        <td>${s.doctor_name||s.doctor_id||'—'}</td>
        <td>${s.branch_name||s.branch_id||'—'}</td>
        <td>${formatDate(s.shift_date)}</td>
        <td>${s.start_time||'—'}</td>
        <td>${s.end_time||'—'}</td>
        <td>${statusBadge(humanizeStatus(s.status||'scheduled'))}</td>
        <td><div class="flex gap-1">
          <button class="btn btn-sm btn-success btn-icon" onclick="updateDoctorShiftStatus('${s.shift_id||s.id}','completed')"><i class="fas fa-check"></i></button>
          <button class="btn btn-sm btn-danger btn-icon" onclick="deleteDoctorShiftRecord('${s.shift_id||s.id}')"><i class="fas fa-trash"></i></button>
        </div></td>
      </tr>`).join('');
  }catch(e){tbody.innerHTML=errorRow(7,e.message);}
}
async function submitDoctorShiftForm(){
  const btn=$('#doctorshift-form-submit');
  const doctorId=$('#dsf-doctor')?.value; const branchId=$('#dsf-branch')?.value;
  const shiftDate=$('#dsf-date')?.value; const startTime=$('#dsf-start')?.value; const endTime=$('#dsf-end')?.value;
  if(!doctorId||!branchId||!shiftDate||!startTime||!endTime){toast('All fields required','warning');return;}
  btn.disabled=true;btn.innerHTML='<div class="spinner" style="width:16px;height:16px;border-width:2px"></div>';
  try{
    await apiRequest('/doctor-shifts',{method:'POST',body:JSON.stringify({doctorId,branchId,shiftDate,startTime,endTime})});
    toast('Doctor shift added!','success');closeModal('modal-doctorshift-form');fetchDoctorShifts();
  }catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Save';}
}
async function updateDoctorShiftStatus(id,status){
  try{await apiRequest(`/doctor-shifts/${id}`,{method:'PUT',body:JSON.stringify({status})});toast('Shift updated','success');fetchDoctorShifts();}catch(e){toast(e.message,'error');}
}
async function deleteDoctorShiftRecord(id){
  confirmDialog('Delete this doctor shift?',async()=>{
    try{await apiRequest(`/doctor-shifts/${id}`,{method:'DELETE'});toast('Shift deleted','success');fetchDoctorShifts();}catch(e){toast(e.message,'error');}
  });
}

/* ══════════════════════════════════════════════════════════
   PHARMACY INVENTORY  (per-pharmacy stock)
════════════════════════════════════════════════════════════ */
async function initPharmacyInventory(){
  fetchPharmacies();
}
async function fetchPharmacies(){
  const container=$('#pharmacy-branches-list'); if(!container) return;
  container.innerHTML=`<div class="loading-state"><div class="spinner"></div><p>Loading pharmacies…</p></div>`;
  try{
    const res=await apiRequest('/pharmacy');
    const rows=res.pharmacies||[];
    if(!rows.length){container.innerHTML=`<div class="table-state empty"><i class="fas fa-store"></i><span>No pharmacies found</span></div>`;return;}
    container.innerHTML=`<div class="grid grid-4 gap-4">${rows.map(p=>`
      <div class="card" style="padding:1.25rem;cursor:pointer" onclick="loadPharmacyInventory('${p.pharmacy_id||p.id}','${p.pharmacy_name||p.name}')">
        <div class="fw-700 mb-1">${p.pharmacy_name||p.name}</div>
        <div class="text-xs text-muted">${p.location||p.address||'—'}</div>
        <div class="mt-2">${statusBadge(humanizeStatus(p.status||'active'))}</div>
        <button class="btn btn-outline btn-sm mt-3 w-full">View Inventory</button>
      </div>`).join('')}</div>`;
  }catch(e){container.innerHTML=`<div class="table-state error"><i class="fas fa-exclamation-circle"></i><span>${e.message}</span></div>`;}
}
async function loadPharmacyInventory(pharmacyId, pharmacyName){
  const section=$('#pharmacy-inv-section');
  if(section){
    section.innerHTML=`<h3 class="fw-700 mb-4">${pharmacyName} — Inventory</h3><div class="table-state"><div class="spinner"></div><span>Loading…</span></div>`;
    section.style.display='block';
  }
  try{
    const res=await apiRequest(`/pharmacy/${pharmacyId}/inventory`);
    const rows=res.inventory||[];
    if(!section) return;
    if(!rows.length){section.innerHTML=`<h3 class="fw-700 mb-4">${pharmacyName} — Inventory</h3><div class="table-state empty"><i class="fas fa-box-open"></i><span>No inventory items</span></div>`;return;}
    section.innerHTML=`
      <h3 class="fw-700 mb-4">${pharmacyName} — Inventory</h3>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Medicine</th><th>Category</th><th>Quantity</th><th>Reorder Level</th><th>Unit Price</th><th>Last Updated</th></tr></thead>
        <tbody>${rows.map(r=>`
          <tr>
            <td class="fw-600">${r.medicine_name||'—'}</td>
            <td>${r.category||'—'}</td>
            <td><span class="fw-700" style="color:${r.quantity<(r.reorder_level||10)?'var(--danger)':'var(--success)'}">${r.quantity}</span></td>
            <td>${r.reorder_level||0}</td>
            <td>${formatCurrency(r.unit_price)}</td>
            <td>${formatDate(r.last_updated)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  }catch(e){
    if(section) section.innerHTML=`<div class="table-state error"><i class="fas fa-exclamation-circle"></i><span>${e.message}</span></div>`;
  }
}

/* ══════════════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  $$('.nav-item[data-page]').forEach(item => item.addEventListener('click', ()=>navigate(item.dataset.page)));
  document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebar);
  document.querySelector('.sidebar-overlay')?.addEventListener('click', closeMobileSidebar);
  document.getElementById('mark-all-read')?.addEventListener('click', markAllRead);
  document.getElementById('logout-btn')?.addEventListener('click', ()=>confirmDialog('Are you sure you want to logout?', ()=>{localStorage.removeItem('hmsToken');window.location.href='index.html';},'Yes, Logout'));
  document.getElementById('header-search')?.addEventListener('keydown', e=>{if(e.key==='Enter')toast(`Searching for "${e.target.value}"…`,'info');});

  if(!requireAuth()) return;
  // Notifications are not part of the HMS schema; no mock notification source is loaded.
  navigate('dashboard');
});

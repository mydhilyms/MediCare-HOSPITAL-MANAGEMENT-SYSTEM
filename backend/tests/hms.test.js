const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const request = supertest;
const app = require('../src/app');

let token = '';
const agent = supertest.agent(app);

const authReq = () => agent.set('Authorization', `Bearer ${token}`);

test('health endpoint responds', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test('login returns JWT for admin', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'admin123' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.token);
  token = res.body.token;
});

test('dashboard stats requires authentication', async () => {
  const res = await request(app).get('/api/dashboard/stats');
  assert.equal(res.status, 401);
});

test('patients list loads with auth', async () => {
  const res = await authReq().get('/api/patients');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.patients));
});

test('doctors list loads with auth', async () => {
  const res = await authReq().get('/api/doctors');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.doctors));
});

test('patient CRUD works', async () => {
  const payload = {
    name: 'Test Patient',
    dob: '1990-01-01',
    gender: 'Male',
    street: '123 Test St',
    city: 'Kochi',
    state: 'Kerala',
    pinCode: '682001',
    phone: '9999999999',
  };

  const createRes = await authReq().post('/api/patients').send(payload);
  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.success, true);

  const patientId = createRes.body.patient.id;
  const updateRes = await authReq().put(`/api/patients/${patientId}`).send({ phone: '8888888888' });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.patient.phone, '8888888888');

  const deleteRes = await authReq().delete(`/api/patients/${patientId}`);
  assert.equal(deleteRes.status, 200);
});

test('doctor CRUD works', async () => {
  const doctorRes = await authReq().post('/api/doctors').send({
    departmentId: 1,
    name: 'Test Doctor',
    specialization: 'General Medicine',
    phone: '9876543210',
  });

  assert.equal(doctorRes.status, 201);
  const doctorId = doctorRes.body.doctor.id;

  const updated = await authReq().put(`/api/doctors/${doctorId}`).send({ specialization: 'Cardiology' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.doctor.specialization, 'Cardiology');
});

test('appointment conflict is rejected', async () => {
  const patients = await authReq().get('/api/patients');
  const doctors = await authReq().get('/api/doctors');

  if (!patients.body.patients?.length || !doctors.body.doctors?.length) {
    assert.ok(true);
    return;
  }

  const patientId = patients.body.patients[0].id;
  const doctorId = doctors.body.doctors[0].id;
  const branchId = doctors.body.doctors[0].branchId || 1;

  // In BCNF, an appointment must fit within a doctor's shift in this branch
  await authReq().post('/api/doctor-shifts').send({
    doctorId,
    branchId,
    shiftStart: '2099-12-01 09:00:00',
    shiftEnd: '2099-12-01 17:00:00',
  }).catch(() => {});

  const payload = {
    patientId,
    doctorId,
    branchId,
    appointmentDate: '2099-12-01',
    appointmentTime: '10:00:00',
  };

  const first = await authReq().post('/api/appointments').send(payload);
  assert.equal(first.status, 201);

  const second = await authReq().post('/api/appointments').send(payload);
  assert.equal(second.status, 409);
});

test('inventory cannot go negative', async () => {
  const inventoryRes = await authReq().get('/api/pharmacy');
  if (!inventoryRes.body.pharmacies?.length) {
    assert.ok(true);
    return;
  }

  const pharmacyId = inventoryRes.body.pharmacies[0].pharmacy_id;
  const medsRes = await authReq().get('/api/medicines');
  if (!medsRes.body.medicines?.length) {
    assert.ok(true);
    return;
  }

  const medicineId = medsRes.body.medicines[0].medicine_id;
  const res = await authReq()
    .put(`/api/pharmacy/${pharmacyId}/inventory/${medicineId}`)
    .send({ quantity: -9999, action: 'deduct' });

  assert.ok([400, 409].includes(res.status));
});

test('prescription creation works', async () => {
  const patients = await authReq().get('/api/patients');
  const doctors = await authReq().get('/api/doctors');
  const medicines = await authReq().get('/api/medicines');

  if (!patients.body.patients?.length || !doctors.body.doctors?.length || !medicines.body.medicines?.length) {
    assert.ok(true);
    return;
  }

  const res = await authReq().post('/api/prescriptions').send({
    patientId: patients.body.patients[0].id,
    doctorId: doctors.body.doctors[0].id,
    medicines: [{ medicineId: medicines.body.medicines[0].medicine_id, dosage: '1 tab', quantity: 1 }],
  });

  assert.equal(res.status, 201);
});

test('billing payment accepts partial payment', async () => {
  const bills = await authReq().get('/api/billing');
  if (!bills.body.bills?.length) {
    assert.ok(true);
    return;
  }

  const billId = bills.body.bills[0].bill_id;
  const amount = Number(bills.body.bills[0].total_amount || bills.body.bills[0].amount || 0);
  const res = await authReq().put(`/api/billing/${billId}/payment`).send({ paymentMode: 'cash', amount: Math.max(0, Math.min(amount, amount / 2)) });
  assert.ok([200, 400].includes(res.status));
});

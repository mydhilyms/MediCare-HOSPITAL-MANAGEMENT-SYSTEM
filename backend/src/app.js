const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const patientRoutes = require('./routes/patientRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const pharmacyRoutes = require('./routes/pharmacyRoutes');
const billingRoutes = require('./routes/billingRoutes');
const staffRoutes = require('./routes/staffRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const roomRoutes = require('./routes/roomRoutes');
const doctorShiftRoutes = require('./routes/doctorShiftRoutes');
const labResultsRoutes = require('./routes/labResultsRoutes');
const otRoutes = require('./routes/otRoutes');
const catalogController = require('./controllers/catalogController');

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Hospital Management System API is running.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/doctor-shifts', doctorShiftRoutes);
app.use('/api/lab-results', labResultsRoutes);
app.use('/api/ot', otRoutes);
app.get('/api/branches', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF','DOCTOR','NURSE','BILLING'), catalogController.getBranches);
app.post('/api/branches', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF'), catalogController.createBranch);
app.get('/api/departments', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','DOCTOR','NURSE','STAFF','BILLING'), catalogController.getDepartments);
app.post('/api/departments', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF'), catalogController.createDepartment);
app.get('/api/nurses', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','NURSE','DOCTOR','STAFF'), catalogController.getNurses);
app.post('/api/nurses', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF','NURSE'), catalogController.createNurse);
app.put('/api/nurses/:id', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF'), catalogController.updateNurse);
app.get('/api/admissions', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','DOCTOR','NURSE','STAFF','BILLING'), catalogController.getAdmissions);
app.post('/api/admissions', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','DOCTOR','STAFF'), catalogController.createAdmission);
app.put('/api/admissions/:id', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','DOCTOR','STAFF'), catalogController.updateAdmission);
app.get('/api/equipment', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','DOCTOR','NURSE','STAFF'), catalogController.getEquipment);
app.post('/api/equipment', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF'), catalogController.createEquipment);
app.put('/api/equipment/:id', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF'), catalogController.updateEquipment);
app.get('/api/shift-logs', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF','NURSE','DOCTOR'), catalogController.getShiftLogs);
app.post('/api/shift-logs', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF'), catalogController.createShiftLog);
app.get('/api/pay-structures', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF','BILLING'), catalogController.getPayStructures);
app.post('/api/pay-structures', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF','BILLING'), catalogController.createPayStructure);
app.get('/api/salaries', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF','BILLING'), catalogController.getSalaries);
app.post('/api/salaries', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF','BILLING'), catalogController.createSalary);
app.put('/api/salaries/:id', require('./middleware/auth').protect, require('./middleware/auth').authorize('ADMIN','STAFF','BILLING'), catalogController.updateSalary);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'API route not found.' });
});

app.use(errorHandler);

module.exports = app;

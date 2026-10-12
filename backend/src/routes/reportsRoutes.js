const express = require('express');
const { getRevenueReport, getPatientReport, getAppointmentReport, getPharmacyReport, getStaffReport, getFinancialReport, getAvailableYears, getMonthlyTrends } = require('../controllers/reportsController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/years', protect, authorize('ADMIN','BILLING','STAFF','DOCTOR'), getAvailableYears);
router.get('/trends', protect, authorize('ADMIN','BILLING','STAFF','DOCTOR'), getMonthlyTrends);
router.get('/revenue', protect, authorize('ADMIN','BILLING','STAFF','DOCTOR'), getRevenueReport);
router.get('/patients', protect, authorize('ADMIN','STAFF','DOCTOR'), getPatientReport);
router.get('/appointments', protect, authorize('ADMIN','STAFF','DOCTOR'), getAppointmentReport);
router.get('/pharmacy', protect, authorize('ADMIN','PHARMACIST','STAFF'), getPharmacyReport);
router.get('/staff', protect, authorize('ADMIN','STAFF'), getStaffReport);
router.get('/financial', protect, authorize('ADMIN','BILLING','STAFF'), getFinancialReport);

module.exports = router;

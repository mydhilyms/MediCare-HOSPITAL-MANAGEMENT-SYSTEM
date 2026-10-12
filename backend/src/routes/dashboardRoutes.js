const express = require('express');
const { getDashboardStats, getDashboardAppointments, getDashboardPatients, getDashboardRevenue, getDashboardDepartments } = require('../controllers/dashboardController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF','BILLING'), getDashboardStats);
router.get('/appointments', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF','BILLING'), getDashboardAppointments);
router.get('/patients', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF','BILLING'), getDashboardPatients);
router.get('/revenue', protect, authorize('ADMIN','DOCTOR','STAFF','BILLING'), getDashboardRevenue);
router.get('/departments', protect, authorize('ADMIN','DOCTOR','STAFF'), getDashboardDepartments);

module.exports = router;

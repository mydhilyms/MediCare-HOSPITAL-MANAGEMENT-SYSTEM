const express = require('express');
const { getOperationTheatres, getOtSchedules, createOtSchedule, updateOtSchedule, deleteOtSchedule } = require('../controllers/otController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/theatres', protect, authorize('ADMIN','DOCTOR','STAFF','NURSE'), getOperationTheatres);
router.get('/schedules', protect, authorize('ADMIN','DOCTOR','STAFF','NURSE'), getOtSchedules);
router.post('/schedules', protect, authorize('ADMIN','DOCTOR','STAFF'), createOtSchedule);
router.put('/schedules/:id', protect, authorize('ADMIN','DOCTOR','STAFF'), updateOtSchedule);
router.delete('/schedules/:id', protect, authorize('ADMIN','STAFF'), deleteOtSchedule);

module.exports = router;

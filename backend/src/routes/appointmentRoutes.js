const express = require('express');
const { getAppointments, getAppointmentById, createAppointment, updateAppointment, deleteAppointment } = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF','BILLING'), getAppointments);
router.get('/:id', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF','BILLING'), getAppointmentById);
router.post('/', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF'), createAppointment);
router.put('/:id', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF'), updateAppointment);
router.delete('/:id', protect, authorize('ADMIN','DOCTOR','STAFF'), deleteAppointment);

module.exports = router;

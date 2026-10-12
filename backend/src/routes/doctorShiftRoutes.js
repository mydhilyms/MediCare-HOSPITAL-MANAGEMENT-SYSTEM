const express = require('express');
const { getDoctorShifts, createDoctorShift, updateDoctorShift, deleteDoctorShift } = require('../controllers/doctorShiftController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, authorize('ADMIN','DOCTOR','STAFF','NURSE'), getDoctorShifts);
router.post('/', protect, authorize('ADMIN','STAFF','DOCTOR'), createDoctorShift);
router.put('/:doctorId/:branchId/:shiftStart', protect, authorize('ADMIN','STAFF','DOCTOR'), updateDoctorShift);
router.delete('/:doctorId/:branchId/:shiftStart', protect, authorize('ADMIN','STAFF'), deleteDoctorShift);
router.put('/:id', protect, authorize('ADMIN','STAFF','DOCTOR'), updateDoctorShift);
router.delete('/:id', protect, authorize('ADMIN','STAFF'), deleteDoctorShift);

module.exports = router;

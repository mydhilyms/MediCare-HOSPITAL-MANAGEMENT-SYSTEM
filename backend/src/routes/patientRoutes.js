const express = require('express');
const { getPatients, getPatientById, createPatient, updatePatient, deletePatient } = require('../controllers/patientController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF','BILLING'), getPatients);
router.get('/:id', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF','BILLING'), getPatientById);
router.post('/', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF'), createPatient);
router.put('/:id', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF'), updatePatient);
router.delete('/:id', protect, authorize('ADMIN'), deletePatient);

module.exports = router;

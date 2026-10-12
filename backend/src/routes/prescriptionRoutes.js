const express = require('express');
const { getPrescriptions, getPrescriptionById, createPrescription, updatePrescription } = require('../controllers/prescriptionController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, authorize('ADMIN','DOCTOR','NURSE','PHARMACIST','STAFF'), getPrescriptions);
router.get('/:id', protect, authorize('ADMIN','DOCTOR','NURSE','PHARMACIST','STAFF'), getPrescriptionById);
router.post('/', protect, authorize('ADMIN','DOCTOR','PHARMACIST'), createPrescription);
router.put('/:id', protect, authorize('ADMIN','DOCTOR','PHARMACIST'), updatePrescription);

module.exports = router;

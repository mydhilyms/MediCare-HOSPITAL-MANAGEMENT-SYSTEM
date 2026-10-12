const express = require('express');
const { getMedicines, getMedicineById, createMedicine, updateMedicine, deleteMedicine } = require('../controllers/medicineController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, authorize('ADMIN','DOCTOR','PHARMACIST','NURSE','STAFF','BILLING'), getMedicines);
router.get('/:id', protect, authorize('ADMIN','DOCTOR','PHARMACIST','NURSE','STAFF','BILLING'), getMedicineById);
router.post('/', protect, authorize('ADMIN','PHARMACIST','STAFF'), createMedicine);
router.put('/:id', protect, authorize('ADMIN','PHARMACIST','STAFF'), updateMedicine);
router.delete('/:id', protect, authorize('ADMIN','PHARMACIST'), deleteMedicine);

module.exports = router;

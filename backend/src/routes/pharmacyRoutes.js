const express = require('express');
const { getPharmacies, getInventory, addInventory, updateInventory } = require('../controllers/pharmacyController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, authorize('ADMIN','PHARMACIST','STAFF','DOCTOR','NURSE'), getPharmacies);
router.get('/:id/inventory', protect, authorize('ADMIN','PHARMACIST','STAFF'), getInventory);
router.post('/:id/inventory', protect, authorize('ADMIN','PHARMACIST','STAFF'), addInventory);
router.put('/:id/inventory/:medicineId', protect, authorize('ADMIN','PHARMACIST','STAFF'), updateInventory);

module.exports = router;

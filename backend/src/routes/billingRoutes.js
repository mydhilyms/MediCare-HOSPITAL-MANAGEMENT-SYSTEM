const express = require('express');
const { getBills, getBillById, createBill, updateBill, recordPayment } = require('../controllers/billingController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, authorize('ADMIN','BILLING','STAFF','DOCTOR'), getBills);
router.get('/:id', protect, authorize('ADMIN','BILLING','STAFF','DOCTOR'), getBillById);
router.post('/', protect, authorize('ADMIN','BILLING','STAFF'), createBill);
router.put('/:id', protect, authorize('ADMIN','BILLING','STAFF'), updateBill);
router.put('/:id/payment', protect, authorize('ADMIN','BILLING','STAFF'), recordPayment);

module.exports = router;

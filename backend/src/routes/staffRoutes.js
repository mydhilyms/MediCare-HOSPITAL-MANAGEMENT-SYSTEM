const express = require('express');
const { getStaff, getStaffById, createStaff, updateStaff, deleteStaff } = require('../controllers/staffController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, authorize('ADMIN','STAFF','DOCTOR','NURSE','BILLING'), getStaff);
router.get('/:id', protect, authorize('ADMIN','STAFF','DOCTOR','NURSE','BILLING'), getStaffById);
router.post('/', protect, authorize('ADMIN','STAFF'), createStaff);
router.put('/:id', protect, authorize('ADMIN','STAFF'), updateStaff);
router.delete('/:id', protect, authorize('ADMIN'), deleteStaff);

module.exports = router;

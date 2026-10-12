const express = require('express');
const { getLabResults, getLabResultById, createLabResult, updateLabResult, deleteLabResult } = require('../controllers/labResultsController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF','LAB','BILLING'), getLabResults);
router.get('/:id', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF','LAB','BILLING'), getLabResultById);
router.post('/', protect, authorize('ADMIN','DOCTOR','NURSE','LAB'), createLabResult);
router.put('/:id', protect, authorize('ADMIN','DOCTOR','NURSE','LAB'), updateLabResult);
router.delete('/:id', protect, authorize('ADMIN','LAB'), deleteLabResult);

module.exports = router;

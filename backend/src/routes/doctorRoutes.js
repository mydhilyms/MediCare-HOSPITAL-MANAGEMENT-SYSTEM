const express = require('express');
const { getDoctors, getDoctorById, createDoctor, updateDoctor, deleteDoctor } = require('../controllers/doctorController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF','BILLING'), getDoctors);
router.get('/:id', protect, authorize('ADMIN','DOCTOR','NURSE','STAFF','BILLING'), getDoctorById);
router.post('/', protect, authorize('ADMIN','DOCTOR','STAFF'), createDoctor);
router.put('/:id', protect, authorize('ADMIN','DOCTOR','STAFF'), updateDoctor);
router.delete('/:id', protect, authorize('ADMIN','STAFF'), deleteDoctor);

module.exports = router;

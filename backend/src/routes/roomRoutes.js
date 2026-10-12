const express = require('express');
const { getRooms, getAvailableRooms, createRoom, updateRoom } = require('../controllers/roomController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, authorize('ADMIN','STAFF','DOCTOR','NURSE'), getRooms);
router.get('/available', protect, authorize('ADMIN','STAFF','DOCTOR','NURSE'), getAvailableRooms);
router.post('/', protect, authorize('ADMIN','STAFF'), createRoom);
router.put('/:branchId/:roomNo', protect, authorize('ADMIN','STAFF'), updateRoom);
router.put('/:id', protect, authorize('ADMIN','STAFF'), updateRoom);

module.exports = router;

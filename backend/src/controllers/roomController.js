const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

const mapRoom = (r) => ({
  ...r,
  id: `${r.branch_id}_${r.room_no}`,
  room_id: `${r.branch_id}_${r.room_no}`,
  room_number: r.room_no,
  roomNumber: r.room_no,
  status: r.availability_status,
  branch_name: r.branch_location,
});

exports.getRooms = async (req, res, next) => {
  try {
    const { branchId } = req.query;
    let where = '';
    const params = [];
    if (branchId) {
      where = 'WHERE r.branch_id = $1';
      params.push(branchId);
    }
    const result = await db.query(
      `SELECT r.*, b.location AS branch_location
       FROM room r
       JOIN branch b ON b.branch_id = r.branch_id
       ${where}
       ORDER BY r.branch_id, r.room_no`,
      params
    );
    return sendSuccess(res, 200, { rooms: result.rows.map(mapRoom) });
  } catch (error) {
    next(error);
  }
};

exports.getAvailableRooms = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT r.*, b.location AS branch_location
       FROM room r
       JOIN branch b ON b.branch_id = r.branch_id
       WHERE r.availability_status = 'available'
       ORDER BY r.branch_id, r.room_no`
    );
    return sendSuccess(res, 200, { rooms: result.rows.map(mapRoom) });
  } catch (error) {
    next(error);
  }
};

exports.createRoom = async (req, res, next) => {
  try {
    const branchId = req.body.branchId || req.body.branch_id || 1;
    const roomNo = req.body.roomNo || req.body.room_no || req.body.roomNumber;
    const roomType = req.body.roomType || req.body.room_type || 'general';
    const criticalCareMonitoring = req.body.criticalCareMonitoring || false;
    const availabilityStatus = req.body.availabilityStatus || req.body.status || 'available';

    if (!branchId || !roomNo) return sendError(res, 400, 'Branch and room number are required.');

    const result = await db.query(
      `INSERT INTO room (branch_id, room_no, room_type, critical_care_monitoring, availability_status)
       VALUES ($1, $2, COALESCE($3, 'general'), COALESCE($4, FALSE), COALESCE($5, 'available'))
       RETURNING *`,
      [branchId, roomNo, roomType, criticalCareMonitoring, availabilityStatus]
    );

    return sendSuccess(res, 201, { room: mapRoom({ ...result.rows[0], branch_location: 'Branch ' + branchId }) });
  } catch (error) {
    next(error);
  }
};

exports.updateRoom = async (req, res, next) => {
  try {
    let branchId = req.params.branchId || req.body.branchId;
    let roomNo = req.params.roomNo || req.body.roomNo || req.params.id;

    if (req.params.id && req.params.id.includes('_')) {
      const parts = req.params.id.split('_');
      branchId = parts[0];
      roomNo = parts.slice(1).join('_');
    } else if (!branchId) {
      // Find branchId for roomNo
      const found = await db.query('SELECT branch_id FROM room WHERE room_no = $1 LIMIT 1', [roomNo]);
      branchId = found.rows[0]?.branch_id || 1;
    }

    const availabilityStatus = req.body.availabilityStatus || req.body.status;

    const result = await db.query(
      `UPDATE room
       SET room_type = COALESCE($1, room_type),
           critical_care_monitoring = COALESCE($2, critical_care_monitoring),
           availability_status = COALESCE($3, availability_status)
       WHERE branch_id = $4 AND room_no = $5
       RETURNING *`,
      [req.body.roomType, req.body.criticalCareMonitoring, availabilityStatus, branchId, roomNo]
    );

    if (!result.rows.length) return sendError(res, 404, 'Room not found.');
    return sendSuccess(res, 200, { room: mapRoom({ ...result.rows[0], branch_location: 'Branch ' + branchId }) });
  } catch (error) {
    next(error);
  }
};

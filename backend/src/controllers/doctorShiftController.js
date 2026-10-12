const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

exports.getDoctorShifts = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT ds.*,
              CONCAT(ds.doctor_id, '_', ds.branch_id, '_', EXTRACT(EPOCH FROM ds.shift_start)::BIGINT) AS shift_id,
              CONCAT(ds.doctor_id, '_', ds.branch_id, '_', EXTRACT(EPOCH FROM ds.shift_start)::BIGINT) AS id,
              TO_CHAR(ds.shift_start, 'YYYY-MM-DD') AS shift_date,
              TO_CHAR(ds.shift_start, 'HH24:MI') AS start_time,
              TO_CHAR(ds.shift_end, 'HH24:MI') AS end_time,
              d.name AS doctor_name,
              b.location AS branch_name,
              b.location AS branch_location
       FROM doctor_shift ds
       JOIN doctor d ON d.doctor_id = ds.doctor_id
       JOIN branch b ON b.branch_id = ds.branch_id
       ORDER BY ds.shift_start DESC`
    );
    return sendSuccess(res, 200, { shifts: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.createDoctorShift = async (req, res, next) => {
  try {
    const doctorId = req.body.doctorId || req.body.doctor_id;
    const branchId = req.body.branchId || req.body.branch_id;
    const shiftStart = req.body.shiftStart || (req.body.shiftDate && req.body.startTime ? `${req.body.shiftDate} ${req.body.startTime}:00` : null);
    const shiftEnd = req.body.shiftEnd || (req.body.shiftDate && req.body.endTime ? `${req.body.shiftDate} ${req.body.endTime}:00` : null);

    if (!doctorId || !branchId || !shiftStart || !shiftEnd) {
      return sendError(res, 400, 'Doctor, branch, shift date, start and end times are required.');
    }

    const result = await db.query(
      `INSERT INTO doctor_shift (doctor_id, branch_id, shift_start, shift_end)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [doctorId, branchId, shiftStart, shiftEnd]
    );

    return sendSuccess(res, 201, { shift: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateDoctorShift = async (req, res, next) => {
  try {
    let { doctorId, branchId, shiftStart } = req.params;
    if (req.params.id) {
      const parts = req.params.id.split('_');
      if (parts.length >= 3) {
        doctorId = parts[0];
        branchId = parts[1];
        const epoch = parts[2];
        const result = await db.query(
          `UPDATE doctor_shift
           SET shift_end = COALESCE($1, shift_end)
           WHERE doctor_id = $2 AND branch_id = $3 AND EXTRACT(EPOCH FROM shift_start)::BIGINT = $4
           RETURNING *`,
          [req.body.newShiftEnd || null, doctorId, branchId, epoch]
        );
        return sendSuccess(res, 200, { shift: result.rows[0] || { id: req.params.id, status: req.body.status } });
      }
    }

    const { newShiftStart, newShiftEnd } = req.body;
    const result = await db.query(
      `UPDATE doctor_shift
       SET shift_start = COALESCE($1, shift_start),
           shift_end = COALESCE($2, shift_end)
       WHERE doctor_id = $3 AND branch_id = $4 AND shift_start = $5
       RETURNING *`,
      [newShiftStart || null, newShiftEnd || null, doctorId, branchId, shiftStart]
    );

    if (!result.rows.length) return sendError(res, 404, 'Doctor shift not found.');
    return sendSuccess(res, 200, { shift: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.deleteDoctorShift = async (req, res, next) => {
  try {
    let { doctorId, branchId, shiftStart } = req.params;
    if (req.params.id) {
      const parts = req.params.id.split('_');
      if (parts.length >= 3) {
        doctorId = parts[0];
        branchId = parts[1];
        const epoch = parts[2];
        const result = await db.query(
          'DELETE FROM doctor_shift WHERE doctor_id = $1 AND branch_id = $2 AND EXTRACT(EPOCH FROM shift_start)::BIGINT = $3 RETURNING *',
          [doctorId, branchId, epoch]
        );
        if (!result.rows.length) return sendError(res, 404, 'Doctor shift not found.');
        return sendSuccess(res, 200, { message: 'Doctor shift deleted successfully.' });
      }
    }

    const result = await db.query(
      'DELETE FROM doctor_shift WHERE doctor_id = $1 AND branch_id = $2 AND shift_start = $3 RETURNING *',
      [doctorId, branchId, shiftStart]
    );
    if (!result.rows.length) return sendError(res, 404, 'Doctor shift not found.');
    return sendSuccess(res, 200, { message: 'Doctor shift deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

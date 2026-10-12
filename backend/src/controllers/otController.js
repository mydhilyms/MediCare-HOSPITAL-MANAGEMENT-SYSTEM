const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

exports.getOperationTheatres = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT ot.*,
              ot.ot_id AS id,
              ot.ot_id AS theatre_id,
              CONCAT('Theatre ', ot.ot_id) AS theatre_name,
              CONCAT('Theatre ', ot.ot_id) AS name,
              b.location AS branch_location
       FROM operation_theatre ot
       JOIN branch b ON b.branch_id = ot.branch_id
       ORDER BY ot.ot_id`
    );
    return sendSuccess(res, 200, { theatres: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.getOtSchedules = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT os.*,
              os.ot_schedule_id AS schedule_id,
              os.ot_schedule_id AS id,
              os.ot_id AS theatre_id,
              CONCAT('Theatre ', os.ot_id) AS theatre_name,
              os.procedure AS procedure_name,
              TO_CHAR(os.schedule_start, 'YYYY-MM-DD') AS scheduled_date,
              TO_CHAR(os.schedule_start, 'HH24:MI') AS start_time,
              TO_CHAR(os.schedule_end, 'HH24:MI') AS end_time,
              d.name AS doctor_name,
              p.name AS patient_name,
              n.name AS nurse_name
       FROM ot_schedule os
       JOIN doctor d ON d.doctor_id = os.doctor_id
       JOIN patient p ON p.patient_id = os.patient_id
       JOIN nurse n ON n.nurse_id = os.nurse_id
       ORDER BY os.schedule_start DESC`
    );
    return sendSuccess(res, 200, { schedules: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.createOtSchedule = async (req, res, next) => {
  try {
    const otId = req.body.otId || req.body.theatreId;
    const doctorId = req.body.doctorId || req.body.doctor_id;
    const patientId = req.body.patientId || req.body.patient_id;
    const nurseId = req.body.nurseId || req.body.nurse_id;
    const proc = req.body.procedure || req.body.procedureName || 'Surgery';
    const scheduleStart = req.body.scheduleStart || (req.body.scheduledDate && req.body.startTime ? `${req.body.scheduledDate} ${req.body.startTime}:00` : null);
    const scheduleEnd = req.body.scheduleEnd || (req.body.scheduledDate && req.body.endTime ? `${req.body.scheduledDate} ${req.body.endTime}:00` : null);
    const status = req.body.status || 'scheduled';

    if (!otId || !doctorId || !patientId || !nurseId || !scheduleStart || !scheduleEnd) {
      return sendError(res, 400, 'OT, doctor, nurse, patient, date, start and end times are required.');
    }

    // DB triggers enforce branch match and overlap rules
    const result = await db.query(
      `INSERT INTO ot_schedule (ot_id, patient_id, doctor_id, nurse_id, procedure, schedule_start, schedule_end, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'scheduled'))
       RETURNING *`,
      [otId, patientId, doctorId, nurseId, proc, scheduleStart, scheduleEnd, status]
    );

    return sendSuccess(res, 201, { schedule: result.rows[0] });
  } catch (error) {
    if (error.message && error.message.includes('RAISE')) {
      return sendError(res, 400, error.message);
    }
    next(error);
  }
};

exports.updateOtSchedule = async (req, res, next) => {
  try {
    const result = await db.query(
      `UPDATE ot_schedule
       SET procedure = COALESCE($1, procedure),
           schedule_start = COALESCE($2, schedule_start),
           schedule_end = COALESCE($3, schedule_end),
           status = COALESCE($4, status)
       WHERE ot_schedule_id = $5
       RETURNING *`,
      [req.body.procedure || req.body.procedureName, req.body.scheduleStart, req.body.scheduleEnd, req.body.status, req.params.id]
    );

    if (!result.rows.length) return sendError(res, 404, 'OT schedule not found.');
    return sendSuccess(res, 200, { schedule: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.deleteOtSchedule = async (req, res, next) => {
  try {
    const result = await db.query('DELETE FROM ot_schedule WHERE ot_schedule_id = $1 RETURNING ot_schedule_id', [req.params.id]);
    if (!result.rows.length) return sendError(res, 404, 'OT schedule not found.');
    return sendSuccess(res, 200, { message: 'OT schedule deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

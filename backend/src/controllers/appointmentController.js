const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

const mapAppointment = (row) => ({
  id: row.appointment_id,
  appointmentId: row.appointment_id,
  patientId: row.patient_id,
  doctorId: row.doctor_id,
  branchId: row.branch_id,
  appointmentDate: row.appointment_date,
  appointmentTime: row.appointment_time,
  startTime: row.appointment_time,
  tokenNo: row.token_no,
  status: row.status,
  patientName: row.patient_name,
  doctorName: row.doctor_name,
  departmentName: row.department_name,
  branchLocation: row.branch_location,
});

exports.getAppointments = async (req, res, next) => {
  try {
    const { search, status, date } = req.query;
    let where = '';
    const params = [];

    if (status) {
      where = `${where ? where + ' AND ' : ' WHERE '} a.status = $${params.length + 1}`;
      params.push(status);
    }

    if (date) {
      where = `${where ? where + ' AND ' : ' WHERE '} a.appointment_date = $${params.length + 1}`;
      params.push(date);
    }

    if (search) {
      where = `${where ? where + ' AND ' : ' WHERE '} (lower(p.name) ILIKE $${params.length + 1} OR lower(d.name) ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    const result = await db.query(
      `SELECT a.*, p.name AS patient_name, d.name AS doctor_name, dep.department_name, b.location AS branch_location
       FROM appointment a
       JOIN patient p ON p.patient_id = a.patient_id
       JOIN doctor d ON d.doctor_id = a.doctor_id
       JOIN department dep ON dep.department_id = d.department_id
       JOIN branch b ON b.branch_id = a.branch_id
       ${where}
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      params
    );

    return sendSuccess(res, 200, {
      appointments: result.rows.map(mapAppointment),
    });
  } catch (error) {
    next(error);
  }
};

exports.getAppointmentById = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT a.*, p.name AS patient_name, d.name AS doctor_name, dep.department_name, b.location AS branch_location
       FROM appointment a
       JOIN patient p ON p.patient_id = a.patient_id
       JOIN doctor d ON d.doctor_id = a.doctor_id
       JOIN department dep ON dep.department_id = d.department_id
       JOIN branch b ON b.branch_id = a.branch_id
       WHERE a.appointment_id = $1`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return sendError(res, 404, 'Appointment not found.');
    }

    return sendSuccess(res, 200, { appointment: mapAppointment(result.rows[0]) });
  } catch (error) {
    next(error);
  }
};

exports.createAppointment = async (req, res, next) => {
  try {
    const patientId = req.body.patientId || req.body.patient_id;
    const doctorId = req.body.doctorId || req.body.doctor_id;
    let branchId = req.body.branchId || req.body.branch_id;
    const appointmentDate = req.body.appointmentDate || req.body.appointment_date;
    const appointmentTime = req.body.appointmentTime || req.body.appointment_time || req.body.startTime || req.body.start_time;
    let tokenNo = req.body.tokenNo || req.body.token_no;
    const status = req.body.status || 'pending';

    if (!patientId || !doctorId || !appointmentDate || !appointmentTime) {
      return sendError(res, 400, 'Patient, doctor, appointment date and appointment time are required.');
    }

    // Auto-derive branchId from doctor's primary department if not supplied
    if (!branchId) {
      const docDept = await db.query(
        `SELECT dep.branch_id
         FROM doctor d
         JOIN department dep ON dep.department_id = d.department_id
         WHERE d.doctor_id = $1`,
        [doctorId]
      );
      if (docDept.rows.length) {
        branchId = docDept.rows[0].branch_id;
      } else {
        return sendError(res, 400, 'Doctor does not belong to any valid department/branch.');
      }
    }

    // Auto-generate sequential token number for this branch and date if not provided
    if (!tokenNo) {
      const tokenRes = await db.query(
        `SELECT COALESCE(MAX(token_no), 0) + 1 AS next_token
         FROM appointment
         WHERE branch_id = $1 AND appointment_date = $2`,
        [branchId, appointmentDate]
      );
      tokenNo = tokenRes.rows[0].next_token;
    }

    // The DB trigger check_appointment_rules and exclusion constraint enforce BCNF rules
    const result = await db.query(
      `INSERT INTO appointment (patient_id, doctor_id, branch_id, appointment_date, appointment_time, token_no, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [patientId, doctorId, branchId, appointmentDate, appointmentTime, tokenNo, status]
    );

    const full = await db.query(
      `SELECT a.*, p.name AS patient_name, d.name AS doctor_name, dep.department_name, b.location AS branch_location
       FROM appointment a
       JOIN patient p ON p.patient_id = a.patient_id
       JOIN doctor d ON d.doctor_id = a.doctor_id
       JOIN department dep ON dep.department_id = d.department_id
       JOIN branch b ON b.branch_id = a.branch_id
       WHERE a.appointment_id = $1`,
      [result.rows[0].appointment_id]
    );

    return sendSuccess(res, 201, { appointment: mapAppointment(full.rows[0] || result.rows[0]) });
  } catch (error) {
    if (error.code === '23P01') {
      return sendError(res, 409, 'Doctor is already booked for this time slot (schedule conflict).', 'exclusion_violation');
    }
    if (error.code === '23505') {
      return sendError(res, 409, 'Appointment token or slot conflict for this date.', 'duplicate_record');
    }
    if (error.message && error.message.toLowerCase().includes('overlap')) {
      return sendError(res, 409, error.message, 'overlap_conflict');
    }
    if (error.message && error.message.includes('RAISE')) {
      return sendError(res, 400, error.message);
    }
    next(error);
  }
};

exports.updateAppointment = async (req, res, next) => {
  try {
    const current = await db.query('SELECT * FROM appointment WHERE appointment_id = $1', [req.params.id]);
    if (!current.rows.length) {
      return sendError(res, 404, 'Appointment not found.');
    }

    const patientId = req.body.patientId || req.body.patient_id;
    const doctorId = req.body.doctorId || req.body.doctor_id;
    const branchId = req.body.branchId || req.body.branch_id;
    const appointmentDate = req.body.appointmentDate || req.body.appointment_date;
    const appointmentTime = req.body.appointmentTime || req.body.appointment_time || req.body.startTime || req.body.start_time;
    const tokenNo = req.body.tokenNo || req.body.token_no;
    const status = req.body.status;

    const result = await db.query(
      `UPDATE appointment
       SET patient_id = COALESCE($1, patient_id),
           doctor_id = COALESCE($2, doctor_id),
           branch_id = COALESCE($3, branch_id),
           appointment_date = COALESCE($4, appointment_date),
           appointment_time = COALESCE($5, appointment_time),
           token_no = COALESCE($6, token_no),
           status = COALESCE($7, status)
       WHERE appointment_id = $8
       RETURNING *`,
      [
        patientId,
        doctorId,
        branchId,
        appointmentDate,
        appointmentTime,
        tokenNo,
        status,
        req.params.id,
      ]
    );

    const full = await db.query(
      `SELECT a.*, p.name AS patient_name, d.name AS doctor_name, dep.department_name, b.location AS branch_location
       FROM appointment a
       JOIN patient p ON p.patient_id = a.patient_id
       JOIN doctor d ON d.doctor_id = a.doctor_id
       JOIN department dep ON dep.department_id = d.department_id
       JOIN branch b ON b.branch_id = a.branch_id
       WHERE a.appointment_id = $1`,
      [result.rows[0].appointment_id]
    );

    return sendSuccess(res, 200, { appointment: mapAppointment(full.rows[0] || result.rows[0]) });
  } catch (error) {
    if (error.code === '23P01') {
      return sendError(res, 409, 'Doctor is already booked for this time slot (schedule conflict).', 'exclusion_violation');
    }
    if (error.message && error.message.toLowerCase().includes('overlap')) {
      return sendError(res, 409, error.message, 'overlap_conflict');
    }
    if (error.message && error.message.includes('RAISE')) {
      return sendError(res, 400, error.message);
    }
    next(error);
  }
};

exports.deleteAppointment = async (req, res, next) => {
  try {
    const result = await db.query('DELETE FROM appointment WHERE appointment_id = $1 RETURNING appointment_id', [req.params.id]);
    if (!result.rows.length) return sendError(res, 404, 'Appointment not found.');
    return sendSuccess(res, 200, { message: 'Appointment deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

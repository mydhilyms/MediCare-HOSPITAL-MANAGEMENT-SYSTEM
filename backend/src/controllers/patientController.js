const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

const mapPatient = (row) => {
  const parts = (row.name || '').trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';
  const addressParts = [row.street, row.city, row.state, row.pin_code].filter(Boolean);

  return {
    id: row.patient_id,
    patient_id: row.patient_id,
    name: row.name,
    firstName,
    lastName,
    dob: row.dob,
    dateOfBirth: row.dob,
    gender: row.gender,
    street: row.street,
    city: row.city,
    state: row.state,
    pinCode: row.pin_code,
    pin_code: row.pin_code,
    phone: row.phone,
    contact: row.phone,
    address: addressParts.join(', ') || null,
  };
};

exports.getPatients = async (req, res, next) => {
  try {
    const { search } = req.query;
    let where = '';
    const params = [];

    if (search) {
      where = 'WHERE lower(name) ILIKE $1';
      params.push(`%${search}%`);
    }

    const result = await db.query(
      `SELECT * FROM patient ${where} ORDER BY patient_id DESC`,
      params
    );

    return sendSuccess(res, 200, { patients: result.rows.map(mapPatient) });
  } catch (error) {
    next(error);
  }
};

exports.getPatientById = async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM patient WHERE patient_id = $1', [req.params.id]);

    if (!result.rows.length) {
      return sendError(res, 404, 'Patient not found.');
    }

    return sendSuccess(res, 200, { patient: mapPatient(result.rows[0]) });
  } catch (error) {
    next(error);
  }
};

exports.createPatient = async (req, res, next) => {
  try {
    const { name, dob, gender, street, city, state, pinCode, phone } = req.body;
    const resolvedName = name || [req.body.firstName, req.body.lastName].filter(Boolean).join(' ');
    const resolvedDob = dob || req.body.dateOfBirth || null;
    const resolvedGender = gender || null;
    const resolvedStreet = street || req.body.address || null;
    const resolvedCity = city || null;
    const resolvedState = state || null;
    const resolvedPin = pinCode || req.body.pin_code || null;
    const resolvedPhone = phone || req.body.contact || null;

    if (!resolvedName) {
      return sendError(res, 400, 'Patient name is required.');
    }

    const result = await db.query(
      `INSERT INTO patient (name, dob, gender, street, city, state, pin_code, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [resolvedName, resolvedDob, resolvedGender, resolvedStreet, resolvedCity, resolvedState, resolvedPin, resolvedPhone]
    );

    return sendSuccess(res, 201, { patient: mapPatient(result.rows[0]) });
  } catch (error) {
    next(error);
  }
};

exports.updatePatient = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!/^\d+$/.test(String(id)) || Number(id) < 1) return sendError(res, 400, 'Invalid patient ID.');
    const body = req.body;
    const updates = [];
    const params = [];
    const set = (column, value) => { updates.push(`${column} = $${params.push(value)}`); };
    if (Object.prototype.hasOwnProperty.call(body, 'name') || Object.prototype.hasOwnProperty.call(body, 'firstName')) {
      const name = String(body.name ?? [body.firstName, body.lastName].filter(Boolean).join(' ')).trim();
      if (!name || name.length > 120) return sendError(res, 400, 'Patient name must be 1–120 characters.');
      set('name', name);
    }
    for (const [column, keys] of [
      ['dob', ['dob','dateOfBirth']], ['gender', ['gender']],
      ['street', ['street','address']], ['city',['city']], ['state',['state']],
      ['pin_code',['pinCode','pin_code']], ['phone',['phone','contact']]
    ]) {
      const key = keys.find(k => Object.prototype.hasOwnProperty.call(body,k));
      if (key !== undefined) set(column, body[key] === '' ? null : body[key]);
    }
    if (!updates.length) return sendError(res, 400, 'No patient fields supplied.');
    const changed = await db.query(`UPDATE patient SET ${updates.join(', ')} WHERE patient_id = $${params.push(id)} RETURNING *`, params);
    if (!changed.rows.length) return sendError(res, 404, 'Patient not found.');
    return sendSuccess(res, 200, { patient: mapPatient(changed.rows[0]) });
  } catch (error) { next(error); }
};

exports.deletePatient = async (req, res, next) => {
  try {
    const result = await db.query('DELETE FROM patient WHERE patient_id = $1 RETURNING patient_id', [req.params.id]);

    if (!result.rows.length) {
      return sendError(res, 404, 'Patient not found.');
    }

    return sendSuccess(res, 200, { message: 'Patient deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

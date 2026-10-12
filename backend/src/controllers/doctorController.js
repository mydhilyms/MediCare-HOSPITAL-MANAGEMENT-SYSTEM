const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

const asId = value => /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const mapDoctor = row => ({
  id: row.doctor_id,
  doctorId: row.doctor_id,
  name: row.name,
  doctorName: row.name,
  specialization: row.specialization,
  phone: row.phone,
  departmentId: row.department_id,
  departmentName: row.department_name,
  branchId: row.branch_id,
  branchLocation: row.branch_location,
  isActive: row.is_active,
  status: row.is_active ? 'active' : 'archived'
});
const doctorSelect = `SELECT d.*, dep.department_name, dep.branch_id, b.location AS branch_location
  FROM doctor d
  JOIN department dep ON dep.department_id = d.department_id
  JOIN branch b ON b.branch_id = dep.branch_id`;

exports.getDoctors = async (req, res, next) => {
  try {
    const conditions = [];
    const params = [];
    const status = req.query.status || 'active';
    if (!['active', 'archived', 'all'].includes(status)) return sendError(res, 400, 'Invalid doctor status filter.');
    if (status !== 'all') conditions.push(`d.is_active = $${params.push(status === 'active')}`);
    if (req.query.department && req.query.department !== 'all') {
      const id = asId(req.query.department);
      if (!id) return sendError(res, 400, 'Department must be a positive integer ID.');
      conditions.push(`d.department_id = $${params.push(id)}`);
    }
    if (req.query.search) {
      conditions.push(`(d.name ILIKE $${params.push('%' + String(req.query.search).trim() + '%')} OR d.specialization ILIKE $${params.length})`);
    }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const result = await db.query(`${doctorSelect}${where} ORDER BY d.name ASC, d.doctor_id ASC`, params);
    return sendSuccess(res, 200, { doctors: result.rows.map(mapDoctor), total: result.rows.length });
  } catch (error) { next(error); }
};

exports.getDoctorById = async (req, res, next) => {
  try {
    const id = asId(req.params.id);
    if (!id) return sendError(res, 400, 'Invalid doctor ID.');
    const result = await db.query(`${doctorSelect} WHERE d.doctor_id = $1`, [id]);
    if (!result.rows.length) return sendError(res, 404, 'Doctor not found.');
    return sendSuccess(res, 200, { doctor: mapDoctor(result.rows[0]) });
  } catch (error) { next(error); }
};

exports.createDoctor = async (req, res, next) => {
  try {
    const name = String(req.body.name ?? '').trim();
    const departmentId = asId(req.body.departmentId ?? req.body.department_id);
    if (!name || name.length > 120 || !departmentId) return sendError(res, 400, 'Valid name and department ID are required.');
    const specialization = req.body.specialization ? String(req.body.specialization).trim() : null;
    const phone = req.body.phone ? String(req.body.phone).trim() : null;
    if ((specialization && specialization.length > 120) || (phone && phone.length > 25)) return sendError(res, 400, 'Specialization or phone is too long.');
    const result = await db.query(
      `INSERT INTO doctor (name,specialization,phone,department_id) VALUES ($1,$2,$3,$4) RETURNING doctor_id`,
      [name, specialization, phone, departmentId]
    );
    const full = await db.query(`${doctorSelect} WHERE d.doctor_id = $1`, [result.rows[0].doctor_id]);
    return sendSuccess(res, 201, { doctor: mapDoctor(full.rows[0]) });
  } catch (error) { next(error); }
};

exports.updateDoctor = async (req, res, next) => {
  try {
    const id = asId(req.params.id);
    if (!id) return sendError(res, 400, 'Invalid doctor ID.');
    const body = req.body;
    const fields = [];
    const params = [];
    function field(name, value) { fields.push(`${name} = $${params.push(value)}`); }
    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      const name = String(body.name ?? '').trim();
      if (!name || name.length > 120) return sendError(res, 400, 'Doctor name must be 1–120 characters.');
      field('name', name);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'specialization')) {
      const spec = body.specialization == null ? null : String(body.specialization).trim() || null;
      if (spec && spec.length > 120) return sendError(res, 400, 'Specialization is too long.');
      field('specialization', spec);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
      const phone = body.phone == null ? null : String(body.phone).trim() || null;
      if (phone && phone.length > 25) return sendError(res, 400, 'Phone is too long.');
      field('phone', phone);
    }
    if (body.departmentId !== undefined || body.department_id !== undefined) {
      const department = asId(body.departmentId ?? body.department_id);
      if (!department) return sendError(res, 400, 'Department must be a valid ID.');
      field('department_id', department);
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') return sendError(res, 400, 'isActive must be a boolean.');
      field('is_active', body.isActive);
    }
    if (!fields.length) return sendError(res, 400, 'No valid doctor fields to update.');
    const result = await db.query(`UPDATE doctor SET ${fields.join(', ')} WHERE doctor_id = $${params.push(id)} RETURNING doctor_id`, params);
    if (!result.rows.length) return sendError(res, 404, 'Doctor not found.');
    const full = await db.query(`${doctorSelect} WHERE d.doctor_id = $1`, [id]);
    return sendSuccess(res, 200, { doctor: mapDoctor(full.rows[0]) });
  } catch (error) { next(error); }
};

// Archive instead of hard delete to retain appointment, prescription, shift and payroll integrity.
exports.deleteDoctor = async (req, res, next) => {
  try {
    const id = asId(req.params.id);
    if (!id) return sendError(res, 400, 'Invalid doctor ID.');
    const result = await db.query('UPDATE doctor SET is_active = FALSE WHERE doctor_id = $1 AND is_active RETURNING doctor_id', [id]);
    if (!result.rows.length) return sendError(res, 404, 'Active doctor not found.');
    return sendSuccess(res, 200, { message: 'Doctor archived. Historical records are preserved.', archivedDoctorId: id });
  } catch (error) { next(error); }
};

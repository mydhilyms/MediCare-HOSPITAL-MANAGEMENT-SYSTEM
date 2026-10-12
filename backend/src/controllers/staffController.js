const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

exports.getStaff = async (req, res, next) => {
  try {
    const { search } = req.query;
    let where = '';
    const params = [];

    if (search) {
      where = `WHERE lower(s.name) ILIKE $${params.length + 1}`;
      params.push(`%${search}%`);
    }

    const result = await db.query(
      `SELECT s.*, b.location AS branch_location
       FROM staff s
       JOIN branch b ON b.branch_id = s.branch_id
       ${where}
       ORDER BY s.staff_id DESC`,
      params
    );

    return sendSuccess(res, 200, { staff: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.getStaffById = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT s.*, b.location AS branch_location
       FROM staff s
       JOIN branch b ON b.branch_id = s.branch_id
       WHERE s.staff_id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return sendError(res, 404, 'Staff member not found.');
    return sendSuccess(res, 200, { staff: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.createStaff = async (req, res, next) => {
  try {
    const { name, role, shift, branchId } = req.body;
    if (!name || !role || !branchId) return sendError(res, 400, 'Staff name, role and branch are required.');

    const result = await db.query(
      `INSERT INTO staff (name, role, shift, branch_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, role, shift || null, branchId]
    );

    return sendSuccess(res, 201, { staff: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateStaff = async (req, res, next) => {
  try {
    const result = await db.query(
      `UPDATE staff
       SET name = COALESCE($1, name),
           role = COALESCE($2, role),
           shift = COALESCE($3, shift),
           branch_id = COALESCE($4, branch_id)
       WHERE staff_id = $5
       RETURNING *`,
      [req.body.name, req.body.role, req.body.shift, req.body.branchId, req.params.id]
    );

    if (!result.rows.length) return sendError(res, 404, 'Staff member not found.');
    return sendSuccess(res, 200, { staff: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.deleteStaff = async (req, res, next) => {
  try {
    const result = await db.query('DELETE FROM staff WHERE staff_id = $1 RETURNING staff_id', [req.params.id]);
    if (!result.rows.length) return sendError(res, 404, 'Staff member not found.');
    return sendSuccess(res, 200, { message: 'Staff member deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

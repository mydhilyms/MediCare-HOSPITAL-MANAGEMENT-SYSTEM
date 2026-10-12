const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

exports.getLabResults = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT lr.*,
              lr.lab_result_id AS id,
              lr.test_type AS test_name,
              lr.result_details AS result_value,
              lr.order_date AS created_at,
              CASE WHEN lr.result_date IS NOT NULL THEN 'completed' ELSE 'pending' END AS status,
              p.name AS patient_name
       FROM lab_result lr
       JOIN patient p ON p.patient_id = lr.patient_id
       ORDER BY lr.lab_result_id DESC`
    );
    return sendSuccess(res, 200, { labResults: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.getLabResultById = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT lr.*,
              lr.lab_result_id AS id,
              lr.test_type AS test_name,
              lr.result_details AS result_value,
              lr.order_date AS created_at,
              CASE WHEN lr.result_date IS NOT NULL THEN 'completed' ELSE 'pending' END AS status,
              p.name AS patient_name
       FROM lab_result lr
       JOIN patient p ON p.patient_id = lr.patient_id
       WHERE lr.lab_result_id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return sendError(res, 404, 'Lab result not found.');
    return sendSuccess(res, 200, { labResult: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.createLabResult = async (req, res, next) => {
  try {
    const patientId = req.body.patientId || req.body.patient_id;
    const testType = req.body.testType || req.body.testName;
    const orderDate = req.body.orderDate || new Date().toISOString().split('T')[0];
    const resultDetails = req.body.resultDetails ?? req.body.resultValue ?? null;
    const resultDate = req.body.resultDate || null;

    if (!patientId || !testType) {
      return sendError(res, 400, 'Patient and test type/name are required.');
    }

    const result = await db.query(
      `INSERT INTO lab_result (patient_id, test_type, order_date, result_date, result_details)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [patientId, testType, orderDate, resultDate, resultDetails]
    );

    return sendSuccess(res, 201, {
      labResult: {
        ...result.rows[0],
        id: result.rows[0].lab_result_id,
        test_name: testType,
        result_value: resultDetails,
        status: resultDate ? 'completed' : 'pending',
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.updateLabResult = async (req, res, next) => {
  try {
    const testType = req.body.testType || req.body.testName;
    let resultDate = req.body.resultDate;
    if (!resultDate && req.body.status === 'completed') {
      resultDate = new Date().toISOString().split('T')[0];
    }
    const resultDetails = req.body.resultDetails || req.body.resultValue;

    const result = await db.query(
      `UPDATE lab_result
       SET test_type = COALESCE($1, test_type),
           result_date = COALESCE($2, result_date),
           result_details = COALESCE($3, result_details)
       WHERE lab_result_id = $4
       RETURNING *`,
      [testType, resultDate, resultDetails, req.params.id]
    );

    if (!result.rows.length) return sendError(res, 404, 'Lab result not found.');
    return sendSuccess(res, 200, {
      labResult: {
        ...result.rows[0],
        id: result.rows[0].lab_result_id,
        status: result.rows[0].result_date ? 'completed' : 'pending',
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteLabResult = async (req, res, next) => {
  try {
    const result = await db.query('DELETE FROM lab_result WHERE lab_result_id = $1 RETURNING lab_result_id', [req.params.id]);
    if (!result.rows.length) return sendError(res, 404, 'Lab result not found.');
    return sendSuccess(res, 200, { message: 'Lab result deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

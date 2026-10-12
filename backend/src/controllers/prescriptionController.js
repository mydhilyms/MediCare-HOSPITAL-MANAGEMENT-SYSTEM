const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

exports.getPrescriptions = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT p.*,
              p.prescription_date AS date,
              pat.name AS patient_name,
              d.name AS doctor_name,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'medicine_id', pd.medicine_id,
                  'id', pd.medicine_id,
                  'medicine_name', m.name,
                  'name', m.name,
                  'dosage', pd.dosage,
                  'dose', pd.dosage,
                  'quantity', pd.quantity,
                  'qty', pd.quantity
                ))
                FROM prescription_detail pd
                JOIN medicine m ON m.medicine_id = pd.medicine_id
                WHERE pd.prescription_id = p.prescription_id
                ), '[]'::json
              ) AS medicines
       FROM prescription p
       JOIN patient pat ON pat.patient_id = p.patient_id
       JOIN doctor d ON d.doctor_id = p.doctor_id
       ORDER BY p.prescription_id DESC`
    );
    return sendSuccess(res, 200, { prescriptions: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.getPrescriptionById = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT p.*, pat.name AS patient_name, d.name AS doctor_name
       FROM prescription p
       JOIN patient pat ON pat.patient_id = p.patient_id
       JOIN doctor d ON d.doctor_id = p.doctor_id
       WHERE p.prescription_id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return sendError(res, 404, 'Prescription not found.');

    const details = await db.query(
      `SELECT pd.*, m.name AS medicine_name
       FROM prescription_detail pd
       JOIN medicine m ON m.medicine_id = pd.medicine_id
       WHERE pd.prescription_id = $1`,
      [req.params.id]
    );

    return sendSuccess(res, 200, { prescription: { ...result.rows[0], medicines: details.rows } });
  } catch (error) {
    next(error);
  }
};

exports.createPrescription = async (req, res, next) => {
  try {
    const { patientId, doctorId, prescriptionDate, medicines } = req.body;
    const validId = value => /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) && Number(value)>0;
    if (!validId(patientId) || !validId(doctorId) || !Array.isArray(medicines) || medicines.length === 0) {
      return sendError(res, 400, 'Valid patient ID, doctor ID and at least one medicine are required.');
    }
    if (prescriptionDate && !/^\d{4}-\d{2}-\d{2}$/.test(prescriptionDate))
      return sendError(res, 400, 'Prescription date must be YYYY-MM-DD.');
    const medicineIds=new Set();
    for (const med of medicines) {
      if(!validId(med.medicineId))return sendError(res,400,'Each medicine must have a positive integer ID.');
      if(medicineIds.has(Number(med.medicineId)))return sendError(res,400,'Each medicine can appear only once per prescription.');
      medicineIds.add(Number(med.medicineId));
      if(!/^\d+$/.test(String(med.quantity ?? '')) || !Number.isSafeInteger(Number(med.quantity)) || Number(med.quantity)<=0)
        return sendError(res,400,'Medicine quantity must be a positive whole number.');
      if(!String(med.dosage??'').trim() || String(med.dosage).length>100)
        return sendError(res,400,'Dosage must contain 1–100 characters.');
    }

    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      const patient = await client.query('SELECT patient_id FROM patient WHERE patient_id = $1', [patientId]);
      if (!patient.rows.length) {
        throw new Error('PATIENT_NOT_FOUND');
      }

      const doctor = await client.query('SELECT doctor_id FROM doctor WHERE doctor_id = $1 AND is_active', [doctorId]);
      if (!doctor.rows.length) {
        throw new Error('DOCTOR_NOT_FOUND');
      }

      const prescriptionResult = await client.query(
        `INSERT INTO prescription (patient_id, doctor_id, prescription_date)
         VALUES ($1, $2, COALESCE($3, CURRENT_DATE))
         RETURNING *`,
        [patientId, doctorId, prescriptionDate || null]
      );

      const prescription = prescriptionResult.rows[0];
      for (const med of medicines) {
        if (!med.medicineId) {
          throw new Error('MEDICINE_ID_REQUIRED');
        }

        const medCheck = await client.query('SELECT medicine_id FROM medicine WHERE medicine_id = $1', [med.medicineId]);
        if (!medCheck.rows.length) {
          throw new Error('MEDICINE_NOT_FOUND');
        }

        const quantity = Number(med.quantity);

        await client.query(
          `INSERT INTO prescription_detail (prescription_id, medicine_id, dosage, quantity)
           VALUES ($1, $2, $3, $4)`,
          [prescription.prescription_id, med.medicineId, med.dosage || '', quantity]
        );
      }

      await client.query('COMMIT');
      return sendSuccess(res, 201, { prescription });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.message === 'PATIENT_NOT_FOUND') return sendError(res, 404, 'Patient not found.');
      if (error.message === 'DOCTOR_NOT_FOUND') return sendError(res, 404, 'Doctor not found.');
      if (error.message === 'MEDICINE_NOT_FOUND') return sendError(res, 404, 'Medicine not found.');
      if (error.message === 'MEDICINE_ID_REQUIRED') return sendError(res, 400, 'Each medicine must include a valid medicine id.');
      if (error.message === 'INVALID_PRESCRIPTION_QUANTITY') return sendError(res, 400, 'Prescription quantities must be greater than zero.');
      next(error);
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

exports.updatePrescription = async (req, res, next) => {
  try {
    const result = await db.query(
      `UPDATE prescription
       SET prescription_date = COALESCE($1, prescription_date)
       WHERE prescription_id = $2
       RETURNING *`,
      [req.body.prescriptionDate, req.params.id]
    );

    if (!result.rows.length) return sendError(res, 404, 'Prescription not found.');
    return sendSuccess(res, 200, { prescription: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

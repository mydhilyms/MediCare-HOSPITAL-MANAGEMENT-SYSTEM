const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

const mapBill = (row) => ({
  ...row,
  total_amount: row.amount,
  totalAmount: row.amount,
  status: row.payment_status,
});

exports.getBills = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT b.*, a.patient_id, a.doctor_id, p.name AS patient_name, d.name AS doctor_name
       FROM bill b
       JOIN appointment a ON a.appointment_id = b.appointment_id
       JOIN patient p ON p.patient_id = a.patient_id
       JOIN doctor d ON d.doctor_id = a.doctor_id
       ORDER BY b.bill_id DESC`
    );
    return sendSuccess(res, 200, { bills: result.rows.map(mapBill) });
  } catch (error) {
    next(error);
  }
};

exports.getBillById = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT b.*, a.patient_id, a.doctor_id, p.name AS patient_name, d.name AS doctor_name
       FROM bill b
       JOIN appointment a ON a.appointment_id = b.appointment_id
       JOIN patient p ON p.patient_id = a.patient_id
       JOIN doctor d ON d.doctor_id = a.doctor_id
       WHERE b.bill_id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return sendError(res, 404, 'Bill not found.');
    return sendSuccess(res, 200, { bill: mapBill(result.rows[0]) });
  } catch (error) {
    next(error);
  }
};

const positiveId = value => /^\d+$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) && Number(value)>0;
const validMoney = value => /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(String(value ?? '')) && Number.isFinite(Number(value));
exports.createBill = async (req, res, next) => {
  try {
    const appointmentId = req.body.appointmentId ?? req.body.appointment_id;
    const amount = req.body.amount ?? req.body.totalAmount ?? req.body.total_amount;
    const paymentStatus = req.body.paymentStatus ?? 'unpaid';
    const otScheduleId = req.body.otScheduleId ?? req.body.ot_schedule_id ?? null;
    if (!positiveId(appointmentId)) return sendError(res,400,'An existing appointment ID is required.');
    if (!validMoney(amount)) return sendError(res,400,'Amount must be non-negative with at most two decimal places.');
    if (!['paid','unpaid','partial','cancelled'].includes(paymentStatus))return sendError(res,400,'Invalid payment status.');
    if (otScheduleId !== null && !positiveId(otScheduleId))return sendError(res,400,'Invalid operation schedule ID.');
    const appointment = await db.query('SELECT appointment_id, branch_id, status FROM appointment WHERE appointment_id=$1',[appointmentId]);
    if(!appointment.rows.length)return sendError(res,404,'Referenced appointment does not exist.');
    if(appointment.rows[0].status!=='completed')return sendError(res,409,'Only completed appointments can be billed.');
    const branchId=appointment.rows[0].branch_id;
    if(req.body.branchId!==undefined&&Number(req.body.branchId)!==Number(branchId))return sendError(res,400,'Billing branch must match appointment branch.');
    const result = await db.query(`INSERT INTO bill(appointment_id,branch_id,amount,payment_status,ot_schedule_id)
      VALUES($1,$2,$3,$4,$5) RETURNING *`,[appointmentId,branchId,amount,paymentStatus,otScheduleId]);
    return sendSuccess(res,201,{bill:mapBill(result.rows[0])});
  }catch(error){next(error);}
};

exports.updateBill = async (req, res, next) => {
  try {
    if(req.body.amount!==undefined && !validMoney(req.body.amount))return sendError(res,400,'Invalid invoice amount.');
    if(req.body.paymentStatus!==undefined && !['unpaid','partial','paid','cancelled'].includes(req.body.paymentStatus))return sendError(res,400,'Invalid invoice status.');
    const result = await db.query(
      `UPDATE bill
       SET amount = COALESCE($1, amount),
           payment_status = COALESCE($2, payment_status)
       WHERE bill_id = $3
       RETURNING *`,
      [req.body.amount, req.body.paymentStatus, req.params.id]
    );

    if (!result.rows.length) return sendError(res, 404, 'Bill not found.');
    return sendSuccess(res, 200, { bill: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.recordPayment = async (req, res, next) => {
  try {
    const { amount: paymentAmount } = req.body;
    if(paymentAmount!==undefined && !validMoney(paymentAmount))return sendError(res,400,'Invalid payment amount.');
    const current = await db.query('SELECT * FROM bill WHERE bill_id = $1', [req.params.id]);
    if (!current.rows.length) return sendError(res, 404, 'Bill not found.');

    const bill = current.rows[0];
    const total = Number(bill.amount || 0);
    const paid = Number(paymentAmount || total);

    if (paid < 0 || paid > total) {
      return sendError(res, 400, 'Payment amount must be between 0 and the bill total.');
    }

    const nextStatus = paid >= total ? 'paid' : 'partial';
    const result = await db.query(
      `UPDATE bill
       SET payment_status = $1
       WHERE bill_id = $2
       RETURNING *`,
      [nextStatus, req.params.id]
    );

    return sendSuccess(res, 200, {
      bill: result.rows[0],
      message: nextStatus === 'paid' ? 'Payment recorded successfully.' : 'Partial payment recorded successfully.',
    });
  } catch (error) {
    next(error);
  }
};

const db = require('../config/db');
const { sendSuccess } = require('../utils/response');

exports.getRevenueReport = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT TO_CHAR(month_start, 'Mon') AS month,
              TO_CHAR(month_start, 'Mon YYYY') AS month_name,
              COALESCE(paid_amount, total_amount, 0) AS revenue,
              0 AS expenses
       FROM v_revenue_summary
       ORDER BY month_start ASC`
    );
    const totalRev = result.rows.reduce((sum, r) => sum + Number(r.revenue || 0), 0);
    return sendSuccess(res, 200, {
      report: result.rows,
      data: result.rows,
      summary: { ytdRevenue: totalRev },
    });
  } catch (error) {
    next(error);
  }
};

exports.getPatientReport = async (req, res, next) => {
  try {
    const totalResult = await db.query('SELECT COUNT(*) AS total FROM patient');
    const total = Number(totalResult.rows[0]?.total || 0);

    const monthlyResult = await db.query(
      `SELECT TO_CHAR(appointment_date, 'Mon') AS month,
              COUNT(DISTINCT patient_id) AS count,
              COUNT(DISTINCT patient_id) AS total
       FROM appointment
       GROUP BY TO_CHAR(appointment_date, 'Mon')
       LIMIT 6`
    );

    const rows = monthlyResult.rows.length ? monthlyResult.rows : [{ month: 'Current', count: total, total }];

    return sendSuccess(res, 200, {
      report: rows,
      data: rows,
      summary: { total },
    });
  } catch (error) {
    next(error);
  }
};

exports.getAppointmentReport = async (req, res, next) => {
  try {
    const result = await db.query('SELECT status, COUNT(*) AS total FROM appointment GROUP BY status ORDER BY status');
    const totalResult = await db.query('SELECT COUNT(*) AS total FROM appointment');
    const total = Number(totalResult.rows[0]?.total || 0);

    return sendSuccess(res, 200, {
      report: result.rows,
      summary: { total },
    });
  } catch (error) {
    next(error);
  }
};

exports.getPharmacyReport = async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM v_pharmacy_alerts ORDER BY stock_quantity ASC');
    return sendSuccess(res, 200, { report: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.getStaffReport = async (req, res, next) => {
  try {
    const result = await db.query('SELECT role, COUNT(*) AS total FROM staff GROUP BY role ORDER BY role');
    return sendSuccess(res, 200, { report: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.getFinancialReport = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT
         SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END) AS revenue,
         SUM(CASE WHEN payment_status = 'unpaid' THEN amount ELSE 0 END) AS pending,
         SUM(CASE WHEN payment_status = 'partial' THEN amount ELSE 0 END) AS partial
       FROM bill`
    );
    return sendSuccess(res, 200, { report: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// Year-filtered actual database series; no hard-coded 2023/2024 mock values.
const validYear = value => /^\d{4}$/.test(String(value ?? '')) && +value >= 2000 && +value <= 2100;

exports.getAvailableYears = async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT yr::INT AS year FROM (
        SELECT EXTRACT(YEAR FROM bill_date) AS yr FROM bill
        UNION SELECT EXTRACT(YEAR FROM appointment_date) AS yr FROM appointment
        UNION SELECT EXTRACT(YEAR FROM admit_date_time) AS yr FROM admission
        UNION SELECT EXTRACT(YEAR FROM CURRENT_DATE) AS yr
      ) src WHERE yr BETWEEN 2000 AND 2100 ORDER BY year DESC`);
    return sendSuccess(res, 200, { years: result.rows.map(row => row.year) });
  } catch (error) { next(error); }
};

exports.getMonthlyTrends = async (req, res, next) => {
  try {
    const year = req.query.year ?? new Date().getFullYear();
    if (!validYear(year)) return res.status(400).json({ message: 'Year must be between 2000 and 2100.' });
    const result = await db.query(`
      WITH calendar AS (
        SELECT generate_series(make_date($1::INT,1,1),make_date($1::INT,12,1),INTERVAL '1 month')::DATE AS month_start
      ), billed AS (
        SELECT date_trunc('month',bill_date)::DATE AS m,
          COALESCE(SUM(amount) FILTER (WHERE payment_status = 'paid'),0) AS paid,
          COALESCE(SUM(amount) FILTER (WHERE payment_status IN ('unpaid','partial')),0) AS outstanding
        FROM bill WHERE bill_date >= make_date($1::INT,1,1) AND bill_date < make_date($1::INT+1,1,1)
        GROUP BY 1
      ), visits AS (
        SELECT date_trunc('month',appointment_date)::DATE AS m,
          COUNT(*) AS appointments, COUNT(DISTINCT patient_id) AS patients
        FROM appointment WHERE appointment_date >= make_date($1::INT,1,1)
        AND appointment_date < make_date($1::INT+1,1,1)
        GROUP BY 1
      ), stays AS (
        SELECT date_trunc('month',admit_date_time)::DATE AS m, COUNT(*) AS admissions
        FROM admission WHERE admit_date_time >= make_date($1::INT,1,1)
        AND admit_date_time < make_date($1::INT+1,1,1)
        GROUP BY 1
      )
      SELECT TO_CHAR(c.month_start,'Mon') AS month,
        COALESCE(b.paid,0)::NUMERIC AS paid,
        COALESCE(b.outstanding,0)::NUMERIC AS outstanding,
        COALESCE(v.appointments,0)::INT AS appointments,
        COALESCE(v.patients,0)::INT AS patients,
        COALESCE(s.admissions,0)::INT AS admissions
      FROM calendar c LEFT JOIN billed b ON b.m=c.month_start
      LEFT JOIN visits v ON v.m=c.month_start LEFT JOIN stays s ON s.m=c.month_start
      ORDER BY c.month_start ASC`, [+year]);
    const rows = result.rows.map(r => ({month:r.month,paid:+r.paid,outstanding:+r.outstanding,appointments:+r.appointments,patients:+r.patients,admissions:+r.admissions}));
    return sendSuccess(res, 200, { year:+year, months:rows });
  } catch (error) { next(error); }
};

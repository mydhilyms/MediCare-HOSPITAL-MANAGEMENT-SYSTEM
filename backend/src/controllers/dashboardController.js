const db = require('../config/db');
const { sendSuccess } = require('../utils/response');

exports.getDashboardStats = async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM get_dashboard_stats()');
    const row = result.rows[0];

    return sendSuccess(res, 200, {
      stats: {
        totalPatients: Number(row.total_patients || 0),
        activePatients: Number(row.active_patients || 0),
        totalDoctors: Number(row.total_doctors || 0),
        upcomingAppointments: Number(row.upcoming_appointments || 0),
        pendingBills: Number(row.pending_bills || 0),
        revenue: Number(row.revenue || 0),
        totalAdmissions: Number(row.total_admissions || 0),
        occupancyPct: Number(row.occupancy_pct || 0),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getDashboardAppointments = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT a.appointment_id, a.appointment_date, a.appointment_time, a.status,
              p.name AS patient_name,
              d.name AS doctor_name
       FROM appointment a
       JOIN patient p ON p.patient_id = a.patient_id
       JOIN doctor d ON d.doctor_id = a.doctor_id
       WHERE a.appointment_date >= CURRENT_DATE
       ORDER BY a.appointment_date, a.appointment_time
       LIMIT 10`
    );

    return sendSuccess(res, 200, { appointments: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.getDashboardPatients = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT patient_id, name
       FROM patient
       ORDER BY patient_id DESC
       LIMIT 10`
    );

    return sendSuccess(res, 200, { patients: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.getDashboardRevenue = async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM get_monthly_revenue(6) ORDER BY month_name');
    return sendSuccess(res, 200, { data: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.getDashboardDepartments = async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM get_department_load()');
    return sendSuccess(res, 200, { departments: result.rows });
  } catch (error) {
    next(error);
  }
};

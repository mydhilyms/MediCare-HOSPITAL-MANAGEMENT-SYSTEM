const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

// ---- Branches ----
exports.getBranches = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    let where = '';
    const params = [];

    if (status) {
      where += `${where ? ' AND ' : ' WHERE '} status = $${params.length + 1}`;
      params.push(status);
    }

    if (search) {
      where += `${where ? ' AND ' : ' WHERE '} lower(location) ILIKE $${params.length + 1}`;
      params.push(`%${search}%`);
    }

    const result = await db.query(`SELECT * FROM branch ${where} ORDER BY branch_id DESC`, params);
    return sendSuccess(res, 200, {
      branches: result.rows.map((b) => ({
        ...b,
        id: b.branch_id,
        name: b.location,
        branch_name: b.location,
      })),
    });
  } catch (error) {
    next(error);
  }
};

exports.createBranch = async (req, res, next) => {
  try {
    const location = req.body.location || req.body.branchName || req.body.branch_name || req.body.name;
    const status = req.body.status || 'active';
    if (!location) return sendError(res, 400, 'Branch location is required.');

    const result = await db.query(
      `INSERT INTO branch (location, status)
       VALUES ($1, COALESCE($2, 'active')) RETURNING *`,
      [location, status]
    );

    return sendSuccess(res, 201, { branch: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// ---- Departments ----
exports.getDepartments = async (req, res, next) => {
  try {
    const { branchId, search } = req.query;
    let where = '';
    const params = [];

    if (branchId) {
      where += `${where ? ' AND ' : ' WHERE '} d.branch_id = $${params.length + 1}`;
      params.push(branchId);
    }

    if (search) {
      where += `${where ? ' AND ' : ' WHERE '} lower(d.department_name) ILIKE $${params.length + 1}`;
      params.push(`%${search}%`);
    }

    const result = await db.query(
      `SELECT d.*, b.location AS branch_location, b.location AS branch_name
       FROM department d
       JOIN branch b ON b.branch_id = d.branch_id
       ${where}
       ORDER BY d.department_id DESC`,
      params
    );

    return sendSuccess(res, 200, {
      departments: result.rows.map((d) => ({
        ...d,
        id: d.department_id,
        name: d.department_name,
      })),
    });
  } catch (error) {
    next(error);
  }
};

exports.createDepartment = async (req, res, next) => {
  try {
    const branchId = req.body.branchId || req.body.branch_id;
    const departmentName = req.body.departmentName || req.body.department_name;
    const status = req.body.status || 'active';
    if (!branchId || !departmentName) return sendError(res, 400, 'Branch and department name are required.');

    const result = await db.query(
      `INSERT INTO department (branch_id, department_name, status)
       VALUES ($1, $2, COALESCE($3, 'active')) RETURNING *`,
      [branchId, departmentName, status]
    );

    return sendSuccess(res, 201, { department: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// ---- Nurses ----
exports.getNurses = async (req, res, next) => {
  try {
    const { branchId, search } = req.query;
    let where = '';
    const params = [];

    if (branchId) {
      where += `${where ? ' AND ' : ' WHERE '} n.branch_id = $${params.length + 1}`;
      params.push(branchId);
    }
    if (search) {
      where += `${where ? ' AND ' : ' WHERE '} lower(n.name) ILIKE $${params.length + 1}`;
      params.push(`%${search}%`);
    }

    const result = await db.query(
      `SELECT n.*,
              n.nurse_id AS id,
              n.name AS nurse_name,
              b.location AS branch_location
       FROM nurse n
       JOIN branch b ON b.branch_id = n.branch_id
       ${where}
       ORDER BY n.nurse_id DESC`,
      params
    );

    return sendSuccess(res, 200, { nurses: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.createNurse = async (req, res, next) => {
  try {
    const branchId = req.body.branchId ?? req.body.branch_id;
    const name = String(req.body.name || req.body.nurseName || '').trim();
    const shift = req.body.shift || null;
    if (!name || !Number.isSafeInteger(Number(branchId)) || Number(branchId) <= 0) return sendError(res, 400, 'Nurse name and valid branch ID are required.');

    const result = await db.query(
      `INSERT INTO nurse (branch_id, name, shift)
       VALUES ($1, $2, $3) RETURNING *`,
      [branchId, name, shift || null]
    );

    return sendSuccess(res, 201, {
      nurse: {
        ...result.rows[0],
        id: result.rows[0].nurse_id,
        nurse_name: name,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Nurse edits preserve the exact Nurse(name, shift, branch_id) relation.
exports.updateNurse = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const branchId = Number(req.body.branchId ?? req.body.branch_id);
    const name = String(req.body.name || '').trim();
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(branchId) || branchId <= 0 || !name)
      return sendError(res, 400, 'Valid nurse ID, name and branch are required.');
    const shift = req.body.shift === undefined ? null : (String(req.body.shift || '').trim() || null);
    // Existing OT schedules must continue to refer to nurses from the same branch.
    const conflicts = await db.query(
      `SELECT 1 FROM ot_schedule os JOIN operation_theatre ot ON ot.ot_id = os.ot_id
       WHERE os.nurse_id = $1 AND ot.branch_id <> $2 LIMIT 1`, [id, branchId]);
    if (conflicts.rows.length) return sendError(res, 409, 'Cannot transfer nurse: existing OT schedules belong to another branch.');
    const result = await db.query(
      'UPDATE nurse SET name = $1, shift = $2, branch_id = $3 WHERE nurse_id = $4 RETURNING *',
      [name, shift, branchId, id]
    );
    if (!result.rows.length) return sendError(res, 404, 'Nurse not found.');
    return sendSuccess(res, 200, { nurse: result.rows[0] });
  } catch (error) { next(error); }
};

// ---- Admissions ----
exports.getAdmissions = async (req, res, next) => {
  try {
    const { patientId, active } = req.query;
    let where = '';
    const params = [];

    if (patientId) {
      where += `${where ? ' AND ' : ' WHERE '} a.patient_id = $${params.length + 1}`;
      params.push(patientId);
    }
    if (active === 'true') {
      where += `${where ? ' AND ' : ' WHERE '} a.discharge_date_time IS NULL`;
    }

    const result = await db.query(
      `SELECT a.*,
              a.admission_id AS id,
              a.room_no AS room_number,
              a.room_no AS "roomNumber",
              a.admit_date_time AS admission_date,
              a.admit_date_time AS "admissionDate",
              a.discharge_date_time AS discharge_date,
              a.discharge_date_time AS "dischargeDate",
              CASE WHEN a.discharge_date_time IS NULL THEN 'active' ELSE 'discharged' END AS status,
              p.name AS patient_name,
              b.location AS branch_location
       FROM admission a
       JOIN patient p ON p.patient_id = a.patient_id
       JOIN branch b ON b.branch_id = a.branch_id
       ${where}
       ORDER BY a.admission_id DESC`,
      params
    );

    return sendSuccess(res, 200, { admissions: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.createAdmission = async (req, res, next) => {
  try {
    const patientId = req.body.patientId || req.body.patient_id;
    const roomNo = req.body.roomNo || req.body.room_no || req.body.roomNumber;
    const branchId = req.body.branchId || req.body.branch_id;
    const admitDateTime = req.body.admitDateTime || req.body.admissionDate || new Date();

    if (!patientId || !roomNo || !Number.isSafeInteger(Number(branchId)) || Number(branchId) < 1) {
      return sendError(res, 400, 'Patient, branch and room are required.');
    }

    const result = await db.query(
      `INSERT INTO admission (patient_id, branch_id, room_no, admit_date_time)
       VALUES ($1, $2, $3, COALESCE($4, NOW()))
       RETURNING *`,
      [patientId, branchId, roomNo, admitDateTime]
    );

    return sendSuccess(res, 201, { admission: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateAdmission = async (req, res, next) => {
  try {
    let dischargeDateTime = req.body.dischargeDateTime || req.body.dischargeDate;
    if (!dischargeDateTime && req.body.status === 'discharged') {
      dischargeDateTime = new Date();
    }

    const result = await db.query(
      `UPDATE admission
       SET discharge_date_time = COALESCE($1, discharge_date_time)
       WHERE admission_id = $2
       RETURNING *`,
      [dischargeDateTime || new Date(), req.params.id]
    );
    if (!result.rows.length) return sendError(res, 404, 'Admission not found.');
    return sendSuccess(res, 200, { admission: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// ---- Equipment ----
exports.getEquipment = async (req, res, next) => {
  try {
    const { branchId, status } = req.query;
    let where = '';
    const params = [];
    if (branchId) {
      where += `${where ? ' AND ' : ' WHERE '} e.branch_id = $${params.length + 1}`;
      params.push(branchId);
    }
    if (status) {
      where += `${where ? ' AND ' : ' WHERE '} e.status = $${params.length + 1}`;
      params.push(status);
    }

    const result = await db.query(
      `SELECT e.*,
              e.equipment_id AS id,
              e.name AS equipment_name,
              e.maintenance_date AS last_maintenance,
              e.maintenance_date AS "lastMaintenance",
              b.location AS branch_location
       FROM equipment e
       JOIN branch b ON b.branch_id = e.branch_id
       ${where}
       ORDER BY e.equipment_id DESC`,
      params
    );

    return sendSuccess(res, 200, { equipment: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.createEquipment = async (req, res, next) => {
  try {
    const branchId = req.body.branchId || req.body.branch_id || 1;
    const name = req.body.name || req.body.equipmentName;
    const location = req.body.location || null;
    const maintenanceDate = req.body.maintenanceDate || req.body.lastMaintenance || null;
    const status = req.body.status || 'available';

    if (!name) return sendError(res, 400, 'Equipment name is required.');
    const result = await db.query(
      `INSERT INTO equipment (branch_id, name, location, maintenance_date, status)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'available')) RETURNING *`,
      [branchId, name, location, maintenanceDate, status]
    );
    return sendSuccess(res, 201, { equipment: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateEquipment = async (req, res, next) => {
  try {
    const result = await db.query(
      `UPDATE equipment
       SET name = COALESCE($1, name),
           location = COALESCE($2, location),
           maintenance_date = COALESCE($3, maintenance_date),
           status = COALESCE($4, status)
       WHERE equipment_id = $5 RETURNING *`,
      [req.body.name || null, req.body.location || null, req.body.maintenanceDate || null, req.body.status || null, req.params.id]
    );
    if (!result.rows.length) return sendError(res, 404, 'Equipment not found.');
    return sendSuccess(res, 200, { equipment: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// ---- Shift Logs ----
exports.getShiftLogs = async (req, res, next) => {
  try {
    const { doctorId, nurseId, staffId, status } = req.query;
    let where = '';
    const params = [];
    if (doctorId) {
      where += `${where ? ' AND ' : ' WHERE '} sl.doctor_id = $${params.length + 1}`;
      params.push(doctorId);
    }
    if (nurseId) {
      where += `${where ? ' AND ' : ' WHERE '} sl.nurse_id = $${params.length + 1}`;
      params.push(nurseId);
    }
    if (staffId) {
      where += `${where ? ' AND ' : ' WHERE '} sl.staff_id = $${params.length + 1}`;
      params.push(staffId);
    }
    if (status) {
      where += `${where ? ' AND ' : ' WHERE '} sl.status = $${params.length + 1}`;
      params.push(status);
    }

    const result = await db.query(
      `SELECT sl.*,
              sl.shift_log_id AS id,
              b.location AS branch_location,
              b.location AS branch_name,
              doc.name AS doctor_name,
              n.name AS nurse_name,
              COALESCE(st.name, doc.name, n.name, 'Staff Member') AS staff_name
       FROM shift_log sl
       JOIN branch b ON b.branch_id = sl.branch_id
       LEFT JOIN doctor doc ON doc.doctor_id = sl.doctor_id
       LEFT JOIN nurse n ON n.nurse_id = sl.nurse_id
       LEFT JOIN staff st ON st.staff_id = sl.staff_id
       ${where}
       ORDER BY sl.shift_date DESC, sl.start_time DESC`,
      params
    );

    return sendSuccess(res, 200, { shifts: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.createShiftLog = async (req, res, next) => {
  try {
    const branchId = req.body.branchId || req.body.branch_id || 1;
    const doctorId = req.body.doctorId || req.body.doctor_id;
    const nurseId = req.body.nurseId || req.body.nurse_id;
    const staffId = req.body.staffId || req.body.staff_id;
    const shiftDate = req.body.shiftDate || req.body.shift_date || new Date().toISOString().split('T')[0];
    const startTime = req.body.startTime || req.body.start_time;
    const endTime = req.body.endTime || req.body.end_time;
    const status = req.body.status || 'scheduled';

    if (!startTime || !endTime) {
      return sendError(res, 400, 'Start and end times are required.');
    }
    // Exactly one of doctorId, nurseId, staffId must be set (enforced by DB CHECK)
    const targetStaffId = staffId || null;

    const result = await db.query(
      `INSERT INTO shift_log (branch_id, doctor_id, nurse_id, staff_id, shift_date, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'scheduled')) RETURNING *`,
      [branchId, doctorId || null, nurseId || null, targetStaffId, shiftDate, startTime, endTime, status]
    );
    return sendSuccess(res, 201, { shiftLog: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// ---- Pay Structures ----
exports.getPayStructures = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT ps.*,
              ps.pay_structure_id AS id,
              ps.employee_type AS role,
              ps.employee_type AS position_title,
              ps.base_pay AS base_salary,
              ps.base_pay AS basic_salary,
              ps.base_pay AS "basicSalary",
              ps.allowance_rate AS allowance,
              ps.allowance_rate AS allowances
       FROM pay_structure ps
       ORDER BY ps.pay_structure_id DESC`
    );
    return sendSuccess(res, 200, { payStructures: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.createPayStructure = async (req, res, next) => {
  try {
    const employeeType = String(req.body.employeeType || req.body.role || '').toLowerCase();
    if (!['doctor', 'nurse', 'staff'].includes(employeeType)) return sendError(res, 400, 'Employee type must be doctor, nurse, or staff.');
    const basePay = req.body.basePay !== undefined ? req.body.basePay : req.body.basicSalary;
    const allowanceRate = req.body.allowanceRate !== undefined ? req.body.allowanceRate : (req.body.allowances || req.body.hra || 0);
    const status = req.body.status || 'active';

    if (basePay === undefined || basePay === '' || !Number.isFinite(Number(basePay)) || Number(basePay) < 0 || !Number.isFinite(Number(allowanceRate)) || Number(allowanceRate) < 0) return sendError(res, 400, 'Valid base pay and allowance rate are required.');

    const result = await db.query(
      `INSERT INTO pay_structure (employee_type, base_pay, allowance_rate, status)
       VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, 'active')) RETURNING *`,
      [employeeType, Number(basePay), Number(allowanceRate || 0), status]
    );

    return sendSuccess(res, 201, { payStructure: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// ---- Salaries ----
exports.getSalaries = async (req, res, next) => {
  try {
    const { doctorId, nurseId, staffId } = req.query;
    let where = '';
    const params = [];
    if (doctorId) {
      where += `${where ? ' AND ' : ' WHERE '} sa.doctor_id = $${params.length + 1}`;
      params.push(doctorId);
    }
    if (nurseId) {
      where += `${where ? ' AND ' : ' WHERE '} sa.nurse_id = $${params.length + 1}`;
      params.push(nurseId);
    }
    if (staffId) {
      where += `${where ? ' AND ' : ' WHERE '} sa.staff_id = $${params.length + 1}`;
      params.push(staffId);
    }

    const result = await db.query(
      `SELECT sa.*,
              sa.salary_id AS id,
              TO_CHAR(sa.pay_month, 'YYYY-MM') AS month,
              sa.base_pay_applied AS basic_salary,
              sa.base_pay_applied AS "basicSalary",
              sa.salary_amount AS net_salary,
              sa.salary_amount AS "netSalary",
              doc.name AS doctor_name,
              n.name AS nurse_name,
              COALESCE(st.name, doc.name, n.name, 'Staff Member') AS staff_name
       FROM salary sa
       LEFT JOIN doctor doc ON doc.doctor_id = sa.doctor_id
       LEFT JOIN nurse n ON n.nurse_id = sa.nurse_id
       LEFT JOIN staff st ON st.staff_id = sa.staff_id
       ${where}
       ORDER BY sa.pay_month DESC`,
      params
    );
    return sendSuccess(res, 200, { salaries: result.rows });
  } catch (error) {
    next(error);
  }
};

exports.createSalary = async (req, res, next) => {
  try {
    const staffId = req.body.staffId || req.body.staff_id;
    const doctorId = req.body.doctorId || req.body.doctor_id;
    const nurseId = req.body.nurseId || req.body.nurse_id;
    const branchId = req.body.branchId || req.body.branch_id;
    let payStructureId = req.body.payStructureId || req.body.pay_structure_id;
    let payMonth = req.body.payMonth || req.body.month;
    const salaryAmount = req.body.salaryAmount !== undefined ? req.body.salaryAmount : (req.body.basicSalary !== undefined ? req.body.basicSalary : 0);
    const basePayApplied = req.body.basePayApplied !== undefined ? req.body.basePayApplied : salaryAmount;
    const allowanceApplied = req.body.allowanceApplied !== undefined ? req.body.allowanceApplied : 0;

    if (!payMonth) {
      payMonth = new Date().toISOString().slice(0, 7) + '-01';
    } else if (payMonth.length === 7) {
      payMonth = `${payMonth}-01`;
    }

    if (!branchId) {
      if (staffId) {
        const st = await db.query('SELECT branch_id FROM staff WHERE staff_id = $1', [staffId]);
        branchId = st.rows[0]?.branch_id;
      }
      if (!branchId) return sendError(res, 400, 'Branch is required.');
    }

    if (!payStructureId) return sendError(res, 400, 'Pay structure ID is required.');

    if ([staffId, doctorId, nurseId].filter(Boolean).length !== 1) return sendError(res, 400, 'Exactly one employee ID must be supplied.');
    // Exactly one of doctorId, nurseId, staffId must be non-null
    const targetStaffId = staffId || null;

    const result = await db.query(
      `INSERT INTO salary (branch_id, doctor_id, nurse_id, staff_id, pay_structure_id, pay_month, base_pay_applied, allowance_applied, salary_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [branchId, doctorId || null, nurseId || null, targetStaffId, payStructureId, payMonth, Number(basePayApplied), Number(allowanceApplied), Number(salaryAmount)]
    );

    return sendSuccess(res, 201, { salary: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateSalary = async (req, res, next) => {
  try {
    const { basePayApplied, allowanceApplied, salaryAmount } = req.body;
    const result = await db.query(
      `UPDATE salary
       SET base_pay_applied = COALESCE($1, base_pay_applied),
           allowance_applied = COALESCE($2, allowance_applied),
           salary_amount = COALESCE($3, salary_amount)
       WHERE salary_id = $4 RETURNING *`,
      [basePayApplied ?? null, allowanceApplied ?? null, salaryAmount ?? null, req.params.id]
    );
    if (!result.rows.length) return sendError(res, 404, 'Salary record not found.');
    return sendSuccess(res, 200, { salary: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

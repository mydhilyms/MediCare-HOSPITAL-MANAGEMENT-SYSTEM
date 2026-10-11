from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from generate import FIELDS, resolve_year_bounds

EXPECTED = {
    "branch": 3, "department": 6, "doctor": 9, "doctor_shift": 33,
    "patient": 30, "appointment": 36, "nurse": 9, "staff": 6,
    "nurse_assignment": 12, "staff_assignment": 9, "room": 12, "admission": 9,
    "prescription": 18, "medicine": 12, "prescription_detail": 30,
    "pharmacy": 3, "pharmacy_inventory": 24, "lab_result": 15,
    "operation_theatre": 3, "ot_schedule": 9, "equipment": 9,
    "bill": 18, "shift_log": 27, "pay_structure": 3, "salary": 9,
    "salary_shift_log": 18,
}
assert len(EXPECTED) == 26

# The scaled generator grows clinical records while keeping hospital-wide
# lookup tables shared by every cohort.
SHARED = {"branch", "department", "medicine", "pharmacy", "pharmacy_inventory", "pay_structure"}


def expected_counts(scale: int) -> dict[str, int]:
    return {name: count if name in SHARED else count * scale
            for name, count in EXPECTED.items()}



def check(condition, message):
    if not condition:
        raise ValueError(message)


def i(value):
    """IDs and counts must contain only whole-number digits."""
    s = str(value).strip()
    check(s.isascii() and s.isdigit(), f"Expected nonnegative whole number, got {s!r}")
    return int(s)


def clean(value):
    """Safe whitespace/case cleanup suitable for the synthetic dataset."""
    return " ".join(str(value).split()).casefold()


def status(value):
    return clean(value)


def day(value):
    return date.fromisoformat(str(value).strip())


def moment(value):
    return datetime.fromisoformat(str(value).strip())


def number(value):
    return Decimal(str(value).strip())


def money(value):
    return number(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def records(raw: str) -> list[list[str]]:
    if not raw.strip():
        return []
    return [token.split("~") for token in raw.split("|")]


class Projection:
    def __init__(self):
        self.tables = {name: {} for name in EXPECTED}
        self.refs = {"prescription": {}, "operation": {}, "bill": {}}
        self.raw_counts = {}

    def add(self, name, key, row):
        table = self.tables[name]
        if key in table:
            check(table[key] == row,
                  f"Functional dependency conflict in {name}, key={key!r}: {table[key]!r} != {row!r}")
        else:
            table[key] = row

    def require(self, name, key):
        check(key in self.tables[name], f"Broken foreign-key reference {name} key={key!r}")
        return self.tables[name][key]

    def identity(self, table, key, shown, context):
        expected = self.require(table, key)["name"]
        check(clean(shown) == expected,
              f"{context}: inconsistent name for {table} ID {key}: {shown!r}")

    def branch(self, bid, displayed_location, state=None):
        bid = i(bid)
        row = {"location": clean(displayed_location)}
        if state is not None:
            row["status"] = status(state)
        if bid in self.tables["branch"]:
            prior = self.tables["branch"][bid]
            check(prior["location"] == row["location"], f"Conflicting branch location {bid}")
            if state is not None:
                check(prior["status"] == row["status"], f"Conflicting branch status {bid}")
        else:
            check(state is not None, f"Branch {bid} not established by roster")
            self.add("branch", bid, row)
        return bid


def read_csvs(folder: Path):
    data = {}
    for filename, headers in FIELDS.items():
        path = folder / filename
        check(path.exists(), f"Missing CSV: {path}")
        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            check(reader.fieldnames == headers, f"Wrong columns/order in {filename}: {reader.fieldnames!r}")
            rows = list(reader)
        for n, row in enumerate(rows, 1):
            check(None not in row, f"Unexpected number of CSV columns in {filename} row {n}")
            check(i(row["paper_row"]) == n, f"paper_row incorrect at {filename}:{n}")
        data[filename] = rows
    return data


def project(folder: Path) -> Projection:
    raw = read_csvs(folder)
    p = Projection()
    p.raw_counts = {name: len(rows) for name, rows in raw.items()}

    for r in raw["01_hospital_roster.csv"]:
        home = p.branch(r["department_branch_id"], r["department_branch_location"],
                        r["department_branch_status"])
        depid, did = i(r["department_id"]), i(r["doctor_id"])
        p.add("department", depid, {"name": clean(r["department_name"]),
                                     "branch": home, "status": status(r["department_status"])})
        p.add("doctor", did, {"name": clean(r["doctor_name"]),
                               "department": depid, "specialization": clean(r["specialization"]),
                               "phone": r["doctor_phone"].strip()})
        branch = p.branch(r["shift_branch_id"], r["shift_branch_location"],
                          r["shift_branch_status"])
        start, end = moment(r["shift_start"]), moment(r["shift_end"])
        check(end > start, f"Doctor shift end <= start: {did}")
        p.add("doctor_shift", (did, branch, start), {"doctor": did, "branch": branch,
                                                       "start": start, "end": end})

    for r in raw["02_patient_visits.csv"]:
        ptid, did, depid = i(r["patient_id"]), i(r["doctor_id"]), i(r["department_id"])
        address = [clean(part) for part in r["patient_full_address"].split("|")]
        check(len(address) == 4, f"Address should split into Street/City/State/PIN, patient {ptid}")
        p.add("patient", ptid, {"name": clean(r["patient_name"]),
                                "dob": day(r["dob"]), "gender": status(r["gender"]),
                                "street": address[0], "city": address[1],
                                "state": address[2], "pin_code": address[3],
                                "phone": r["patient_phone"].strip()})
        p.identity("doctor", did, r["doctor_name"], "Patient visit")
        check(p.require("doctor", did)["department"] == depid,
              f"Doctor {did} department mismatch in patient visit")
        check(p.require("department", depid)["name"] == clean(r["department_name"]),
              f"Department {depid} name mismatch")
        bid = p.branch(r["branch_id"], r["branch_location"])
        appid = i(r["appointment_id"])
        p.add("appointment", appid, {"patient": ptid, "doctor": did, "branch": bid,
                                     "date": day(r["appointment_date"]),
                                     "time": r["appointment_time"].strip(),
                                     "token": i(r["token_no"]),
                                     "status": status(r["appointment_status"])})

    for r in raw["03_employee_roster.csv"]:
        kind, eid = status(r["employee_kind"]), i(r["employee_id"])
        check(kind in ("nurse", "staff"), f"Unknown employee kind {kind}")
        bid = p.branch(r["branch_id"], r["branch_location"], r["branch_status"])
        p.add(kind, eid, {"name": clean(r["employee_name"]), "branch": bid,
                           "shift": clean(r["shift_label"]),
                           **({"role": clean(r["role"])} if kind == "staff" else {})})

    for r in raw["04_care_register.csv"]:
        pid, bid = i(r["patient_id"]), p.branch(r["branch_id"], r["branch_location"])
        p.identity("patient", pid, r["patient_name"], "Care register")
        assignment_date = day(r["assignment_date"])
        for parts in records(r["nurses_list"]):
            check(len(parts) == 2, f"Care nurse entry malformed: {parts}")
            nid = i(parts[0]); p.identity("nurse", nid, parts[1], "Care register")
            check(p.require("nurse", nid)["branch"] == bid, f"Care nurse {nid} in wrong branch")
            p.add("nurse_assignment", (nid, pid, assignment_date),
                  {"nurse": nid, "patient": pid, "date": assignment_date})
        for parts in records(r["staff_list"]):
            check(len(parts) == 2, f"Care staff entry malformed: {parts}")
            sid = i(parts[0]); p.identity("staff", sid, parts[1], "Care register")
            check(p.require("staff", sid)["branch"] == bid, f"Care staff {sid} in wrong branch")
            p.add("staff_assignment", (sid, pid, assignment_date),
                  {"staff": sid, "patient": pid, "date": assignment_date})

    for r in raw["05_ward_register.csv"]:
        bid = p.branch(r["branch_id"], r["branch_location"])
        no = r["room_no"].strip()
        p.add("room", (bid, no), {"branch": bid, "no": no, "type": status(r["room_type"]),
                                  "critical": status(r["critical_care_monitoring"]) == "yes",
                                  "status": status(r["availability_status"])})
        for parts in records(r["admission_history"]):
            check(len(parts) == 5, f"Admission entry malformed: {parts}")
            aid, pid = i(parts[0]), i(parts[1])
            p.identity("patient", pid, parts[2], "Admission")
            start = moment(parts[3]); end = moment(parts[4]) if parts[4].strip() else None
            check(end is None or end > start, f"End before start for admission {aid}")
            p.add("admission", aid, {"patient": pid, "branch": bid, "room": no,
                                     "start": start, "end": end})

    for r in raw["06_prescription_register.csv"]:
        rxid, pid, did = i(r["prescription_id"]), i(r["patient_id"]), i(r["doctor_id"])
        p.identity("patient", pid, r["patient_name"], "Prescription")
        p.identity("doctor", did, r["doctor_name"], "Prescription")
        p.add("prescription", rxid, {"doctor": did, "patient": pid,
                                     "date": day(r["prescription_date"])})
        p.refs["prescription"][rxid] = i(r["appointment_reference"])
        for parts in records(r["medicines_list"]):
            check(len(parts) == 4, f"Prescription medicine entry malformed: {parts}")
            mid = i(parts[0])
            p.add("medicine", mid, {"name": clean(parts[1])})
            p.add("prescription_detail", (rxid, mid), {"prescription": rxid,
                                                       "medicine": mid, "dosage": parts[2].strip(),
                                                       "quantity": i(parts[3])})

    for r in raw["07_pharmacy_stock.csv"]:
        phid, bid = i(r["pharmacy_id"]), p.branch(r["branch_id"], r["branch_location"])
        p.add("pharmacy", phid, {"branch": bid})
        for parts in records(r["stock_items"]):
            check(len(parts) == 5, f"Pharmacy stock entry malformed: {parts}")
            mid = i(parts[0]); p.add("medicine", mid, {"name": clean(parts[1])})
            p.add("pharmacy_inventory", (phid, mid), {"pharmacy": phid, "medicine": mid,
                                                      "stock": i(parts[2]), "price": money(parts[3]),
                                                      "reorder": i(parts[4])})

    for r in raw["08_lab_register.csv"]:
        labid, pid = i(r["lab_result_id"]), i(r["patient_id"])
        p.identity("patient", pid, r["patient_name"], "Laboratory")
        p.branch(r["source_branch_id"], r["source_branch_location"])
        p.add("lab_result", labid, {"patient": pid, "test_type": clean(r["test_type"]),
                                    "order_date": day(r["order_date"]),
                                    "result_date": day(r["result_date"]) if r["result_date"].strip() else None,
                                    "details": r["result_details"].strip()})

    for r in raw["09_surgery_register.csv"]:
        otid, bid = i(r["ot_id"]), p.branch(r["ot_branch_id"], r["ot_branch_location"])
        p.add("operation_theatre", otid, {"branch": bid, "status": status(r["ot_current_status"])})
        sid = i(r["ot_schedule_id"])
        pid, did, nid = i(r["patient_id"]), i(r["doctor_id"]), i(r["nurse_id"])
        p.identity("patient", pid, r["patient_name"], "OT schedule")
        p.identity("doctor", did, r["doctor_name"], "OT schedule")
        p.identity("nurse", nid, r["nurse_name"], "OT schedule")
        p.add("ot_schedule", sid, {"ot": otid, "patient": pid, "doctor": did, "nurse": nid,
                                    "procedure": r["procedure"].strip(),
                                    "start": moment(r["schedule_start"]), "end": moment(r["schedule_end"]),
                                    "status": status(r["operation_status"])})
        p.refs["operation"][sid] = i(r["related_appointment_reference"])

    for r in raw["10_equipment_register.csv"]:
        eid, bid = i(r["equipment_id"]), p.branch(r["branch_id"], r["branch_location"])
        p.add("equipment", eid, {"branch": bid, "name": clean(r["equipment_name"]),
                                  "location": clean(r["equipment_location"]),
                                  "maintenance": day(r["maintenance_date"]),
                                  "status": status(r["equipment_status"])})

    for r in raw["11_billing_register.csv"]:
        bid, aid, pid, did = (i(r[x]) for x in ("bill_id", "appointment_id", "patient_id", "doctor_id"))
        p.identity("patient", pid, r["patient_name"], "Billing")
        p.identity("doctor", did, r["doctor_name"], "Billing")
        branchid = p.branch(r["branch_id"], r["branch_location"])
        otid = i(r["ot_schedule_reference"]) if r["ot_schedule_reference"].strip() else None
        p.add("bill", bid, {"appointment": aid, "branch": branchid, "amount": money(r["bill_amount"]),
                             "date": day(r["bill_date"]), "payment": status(r["payment_status"]),
                             "ot": otid})
        p.refs["bill"][bid] = {"patient": pid, "doctor": did,
                                "procedure": r["procedure_description"].strip()}

    for r in raw["12_payroll_register.csv"]:
        kind = status(r["employee_kind"])
        check(kind in ("doctor", "nurse", "staff"), f"Invalid payroll employee kind {kind!r}")
        eid, sid, payid = i(r["employee_id"]), i(r["salary_id"]), i(r["pay_structure_id"])
        p.identity(kind, eid, r["employee_name"], "Payroll")
        bid = p.branch(r["branch_id"], r["branch_location"])
        p.add("pay_structure", payid, {"type": kind, "base": money(r["base_pay"]),
                                       "rate": number(r["allowance_rate"]),
                                       "status": status(r["pay_structure_status"])})
        p.add("salary", sid, {"employee_type": kind, "employee": eid, "branch": bid,
                               "pay_month": day(r["pay_month"]), "pay_structure": payid,
                               "base": money(r["base_pay_applied"]),
                               "allowance": money(r["allowance_applied"]),
                               "total": money(r["salary_amount"])})
        for parts in records(r["duty_logs_list"]):
            check(len(parts) == 5, f"Payroll duty entry malformed: {parts}")
            logid = i(parts[0])
            p.add("shift_log", logid, {"employee_type": kind, "employee": eid, "branch": bid,
                                       "date": day(parts[1]), "start": parts[2].strip(),
                                       "end": parts[3].strip(), "status": status(parts[4])})
        for item in r["paid_shift_log_ids"].split("|"):
            logid = i(item)
            p.add("salary_shift_log", (sid, logid), {"salary": sid, "shift_log": logid})

    return p


def overlap(a_start, a_end, b_start, b_end):
    """Half-open intervals; touching endpoints are not a conflict."""
    return a_start < b_end and b_start < a_end


def validate(p: Projection, demo_year: int, scale: int = 1,
             start_year: int | None = None):
    """Check all 26 projected relations and yearly coverage.

    The positional `demo_year` is the inclusive END year for compatibility
    with existing callers of validate(project, year, scale).
    """
    start_year = demo_year - 1 if start_year is None else start_year
    check(1 <= demo_year - start_year + 1 <= 18, "Invalid 1–18 year range")
    t = p.tables
    for name, expected in expected_counts(scale).items():
        check(len(t[name]) == expected,
              f"Expected {expected} normalized {name} rows; got {len(t[name])}")

    # Bound the actual clinical dates to the supplied range. Birth dates are
    # historical and deliberately excluded; all patients must already exist.
    date_columns = {
        "doctor_shift": ("start", "end"), "appointment": ("date",),
        "nurse_assignment": ("date",), "staff_assignment": ("date",),
        "admission": ("start", "end"), "prescription": ("date",),
        "lab_result": ("order_date", "result_date"),
        "ot_schedule": ("start", "end"), "equipment": ("maintenance",),
        "bill": ("date",), "shift_log": ("date",), "salary": ("pay_month",),
    }
    for name, columns in date_columns.items():
        for key, row in t[name].items():
            for column in columns:
                value = row[column]
                if value is not None:
                    check(start_year <= value.year <= demo_year,
                          f"{name} {key}: {column} year {value.year} outside "
                          f"{start_year}–{demo_year}")
    for patient_id, patient in t["patient"].items():
        check(patient["dob"].year < start_year,
              f"Patient {patient_id} was born after the source records begin")

    # Every foreign key must exist, and all statuses/constraints must match SQL.
    for depid, dep in t["department"].items():
        p.require("branch", dep["branch"])
        check(dep["status"] in ("active", "inactive"), f"Department {depid} invalid status")
    for did, doc in t["doctor"].items():
        p.require("department", doc["department"])
    for bid, branch in t["branch"].items():
        check(branch["status"] in ("active", "inactive"), f"Branch {bid} invalid status")
    assert len({(x["branch"], x["name"]) for x in t["department"].values()}) == 6

    # Doctor shifts (including shifts in branches other than primary department).
    by_doc = defaultdict(list)
    for shift in t["doctor_shift"].values():
        p.require("doctor", shift["doctor"]); p.require("branch", shift["branch"])
        by_doc[shift["doctor"]].append(shift)
    for did, shifts in by_doc.items():
        shifts.sort(key=lambda s: s["start"])
        for a, b in zip(shifts, shifts[1:]):
            check(a["end"] <= b["start"], f"Doctor {did} has overlapping cross-branch shifts")
    check(any(len({s["branch"] for s in shifts}) >= 2 for shifts in by_doc.values()),
          "Missing required cross-branch doctor shift example")

    by_patient = defaultdict(list)
    by_doctor = defaultdict(list)
    seen_tokens = set()
    patient_branches = defaultdict(set)
    for appid, a in t["appointment"].items():
        p.require("patient", a["patient"]); p.require("doctor", a["doctor"])
        branch = p.require("branch", a["branch"])
        check(a["status"] in ("completed", "pending", "confirmed", "cancelled"),
              f"Appointment {appid} invalid status")
        check(a["token"] > 0, f"Appointment {appid} invalid token")
        token_key = (a["branch"], a["date"], a["token"])
        check(token_key not in seen_tokens, f"Duplicate branch/date token {token_key}")
        seen_tokens.add(token_key)
        start = moment(f'{a["date"]}T{a["time"]}')
        finish = start + timedelta(minutes=30)
        check(any(s["branch"] == a["branch"] and s["start"] <= start and finish <= s["end"]
                  for s in by_doc[a["doctor"]]), f"Appointment {appid} outside doctor shift")
        check(branch["status"] == "active" and
              t["department"][t["doctor"][a["doctor"]]["department"]]["status"] == "active",
              f"Appointment {appid} with inactive unit")
        a["start"] = start; a["finish"] = finish
        by_doctor[a["doctor"]].append(a)
        by_patient[a["patient"]].append(a)
        patient_branches[a["patient"]].add(a["branch"])
    check(len(patient_branches[1001]) >= 2, "Patient 1001 must visit multiple branches")
    check(len(patient_branches) == 30 * scale, "Every generated patient must have a visit")
    for did, appts in by_doctor.items():
        for j, a in enumerate(appts):
            for b in appts[j + 1:]:
                if a["status"] in ("pending", "confirmed") and b["status"] in ("pending", "confirmed"):
                    check(not overlap(a["start"], a["finish"], b["start"], b["finish"]),
                          f"Doctor {did} has overlapping pending/confirmed appointments")
    for pid, appts in by_patient.items():
        for j, a in enumerate(appts):
            for b in appts[j + 1:]:
                da = t["doctor"][a["doctor"]]["department"]
                db = t["doctor"][b["doctor"]]["department"]
                if da == db and a["status"] in ("pending", "confirmed") and b["status"] in ("pending", "confirmed"):
                    check(not overlap(a["start"], a["finish"], b["start"], b["finish"]),
                          f"Patient {pid} has overlapping same-department appointments")

    for nid, nurse in t["nurse"].items():
        p.require("branch", nurse["branch"])
    for sid, employee in t["staff"].items():
        p.require("branch", employee["branch"])
    for assignment in t["nurse_assignment"].values():
        p.require("nurse", assignment["nurse"]); p.require("patient", assignment["patient"])
    for assignment in t["staff_assignment"].values():
        p.require("staff", assignment["staff"]); p.require("patient", assignment["patient"])

    room_allocations = defaultdict(list)
    patient_allocations = defaultdict(list)
    for key, room in t["room"].items():
        p.require("branch", room["branch"])
        check(room["type"] in ("general", "private", "icu"), f"Room {key} invalid type")
        check(room["status"] in ("available", "occupied", "maintenance", "reserved"),
              f"Room {key} invalid status")
        check(room["critical"] == (room["type"] == "icu"), f"Room {key} incorrect ICU monitoring")
    for aid, admission in t["admission"].items():
        p.require("patient", admission["patient"])
        key = (admission["branch"], admission["room"])
        p.require("room", key)
        finish = admission["end"] or datetime.max
        room_allocations[key].append((admission["start"], finish, aid))
        patient_allocations[admission["patient"]].append((admission["start"], finish, aid))
        if admission["end"] is None:
            check(t["room"][key]["status"] == "occupied", f"Open admission {aid} must occupy room")
    for allocation_group in (room_allocations, patient_allocations):
        for key, episodes in allocation_group.items():
            for j, (start, end, aid) in enumerate(episodes):
                for other_start, other_end, other_aid in episodes[j + 1:]:
                    check(not overlap(start, end, other_start, other_end),
                          f"Conflicting admissions {aid} and {other_aid}, key={key}")
    check(len({r["branch"] for r in t["room"].values() if r["no"] == "101"}) == 3,
          "Missing repeated room number in different branches")
    check(any(len(items) == 2 for items in room_allocations.values()),
          "No room history with two separate admissions")

    for rxid, rx in t["prescription"].items():
        p.require("doctor", rx["doctor"]); p.require("patient", rx["patient"])
        app = p.require("appointment", p.refs["prescription"][rxid])
        check(app["doctor"] == rx["doctor"] and app["patient"] == rx["patient"]
              and app["date"] == rx["date"] and app["status"] == "completed",
              f"Prescription {rxid} does not match completed source visit")
    for detail in t["prescription_detail"].values():
        p.require("prescription", detail["prescription"])
        p.require("medicine", detail["medicine"])
        check(detail["quantity"] > 0, "Prescription has nonpositive quantity")
    for ph in t["pharmacy"].values():
        p.require("branch", ph["branch"])
    by_med = defaultdict(list)
    for inventory in t["pharmacy_inventory"].values():
        p.require("pharmacy", inventory["pharmacy"])
        p.require("medicine", inventory["medicine"])
        check(inventory["stock"] >= 0 and inventory["price"] >= 0 and inventory["reorder"] >= 0,
              "Negative inventory quantity/price/reorder value")
        by_med[inventory["medicine"]].append(inventory)
    check(any(len({x["price"] for x in items}) > 1 for items in by_med.values() if len(items) > 1),
          "Missing medicine with branch-specific prices")
    check(any(v["stock"] < v["reorder"] for v in t["pharmacy_inventory"].values()),
          "Missing low-stock sample inventory")

    for lid, lab in t["lab_result"].items():
        p.require("patient", lab["patient"])
        check(lab["result_date"] is None or lab["result_date"] >= lab["order_date"],
              f"Lab {lid} result predates order")
    for ot in t["operation_theatre"].values():
        p.require("branch", ot["branch"])
        check(ot["status"] in ("available", "busy", "maintenance", "inactive"),
              "Invalid OT status")
    for oid, op in t["ot_schedule"].items():
        ot = p.require("operation_theatre", op["ot"])
        p.require("patient", op["patient"]); p.require("doctor", op["doctor"])
        nurse = p.require("nurse", op["nurse"])
        check(ot["branch"] == nurse["branch"], f"OT {oid} nurse not in OT branch")
        check(op["start"] < op["end"], f"OT {oid} nonpositive duration")
        check(op["status"] in ("scheduled", "completed", "cancelled"), f"OT {oid} invalid status")
        check(any(shift["branch"] == ot["branch"] and shift["start"] <= op["start"]
                  and op["end"] <= shift["end"] for shift in by_doc[op["doctor"]]),
              f"OT {oid} doctor not on a branch-matching shift")
        app = p.require("appointment", p.refs["operation"][oid])
        check(app["patient"] == op["patient"] and app["doctor"] == op["doctor"]
              and app["branch"] == ot["branch"] and app["date"] == op["start"].date(),
              f"OT {oid} does not match its source appointment")
        check(op["start"] >= app["finish"], f"OT {oid} overlaps its initial consultation")
    surgeries = list(t["ot_schedule"].items())
    for j, (aid, a) in enumerate(surgeries):
        if a["status"] == "cancelled":
            continue
        for bid, b in surgeries[j + 1:]:
            if b["status"] == "cancelled":
                continue
            if (a["ot"] == b["ot"] or a["doctor"] == b["doctor"]
                or a["nurse"] == b["nurse"] or a["patient"] == b["patient"]):
                check(not overlap(a["start"], a["end"], b["start"], b["end"]),
                      f"OT schedule collision {aid}/{bid}")
    for equip in t["equipment"].values():
        p.require("branch", equip["branch"])
        check(equip["status"] in ("available", "in_use", "maintenance", "inactive"),
              "Invalid equipment status")

    billed_appointments = set()
    payment_by_year = defaultdict(int)
    completed_ot = set()
    for billid, b in t["bill"].items():
        appt = p.require("appointment", b["appointment"])
        check(b["appointment"] not in billed_appointments, "Duplicate bill for appointment")
        billed_appointments.add(b["appointment"])
        check(appt["branch"] == b["branch"], f"Bill {billid} branch mismatch")
        check(appt["patient"] == p.refs["bill"][billid]["patient"] and
              appt["doctor"] == p.refs["bill"][billid]["doctor"],
              f"Bill {billid} patient/doctor mismatch")
        check(appt["status"] == "completed" and b["date"] >= appt["date"],
              f"Bill {billid} is for incomplete/future consultation")
        check(b["payment"] in ("paid", "partial", "unpaid", "cancelled") and b["amount"] >= 0,
              f"Bill {billid} has invalid payment data")
        if b["ot"] is not None:
            op = p.require("ot_schedule", b["ot"])
            ot = p.require("operation_theatre", op["ot"])
            check(op["status"] == "completed" and ot["branch"] == b["branch"]
                  and op["patient"] == appt["patient"] and op["doctor"] == appt["doctor"],
                  f"Bill {billid} linked to uncompleted/mismatched surgery")
            check(b["date"] >= op["start"].date(), f"Bill {billid} predates surgery")
            completed_ot.add(b["ot"])
        if b["payment"] == "paid":
            payment_by_year[b["date"].year] += 1
    for selected_year in range(start_year, demo_year + 1):
        check(payment_by_year[selected_year] > 0,
              f"Need at least one PAID bill in {selected_year} for year-filtered charts")
    for relation, key in (("appointment", "date"), ("prescription", "date"),
                          ("bill", "date")):
        observed = {row[key].year for row in t[relation].values()}
        for selected_year in range(start_year, demo_year + 1):
            check(selected_year in observed,
                  f"{relation} has no records for year {selected_year}")
    check(len(completed_ot) == 6 * scale,
          f"Expected {6 * scale} completed operations with corresponding bills")
    check(sum(op["status"] == "scheduled" for op in t["ot_schedule"].values()) == 3 * scale,
          f"Expected {3 * scale} future scheduled surgeries without bills")

    for pid, pay in t["pay_structure"].items():
        check(pay["type"] in ("doctor", "nurse", "staff") and pay["status"] == "active",
              f"Pay structure {pid} invalid")
    logs_by_salary = defaultdict(list)
    for logid, log in t["shift_log"].items():
        p.require(log["employee_type"], log["employee"])
        check(log["status"] in ("completed", "absent", "cancelled", "scheduled"),
              f"ShiftLog {logid} status invalid")
        check(log["end"] > log["start"], f"ShiftLog {logid} has invalid times")
        check(log["branch"] == (t[log["employee_type"]][log["employee"]]["branch"]
                if log["employee_type"] != "doctor" else log["branch"]),
              f"ShiftLog {logid} employee assigned to different branch")
    for edge in t["salary_shift_log"].values():
        salary = p.require("salary", edge["salary"])
        log = p.require("shift_log", edge["shift_log"])
        check(salary["branch"] == log["branch"] and
              salary["employee_type"] == log["employee_type"] and
              salary["employee"] == log["employee"] and
              salary["pay_month"].year == log["date"].year and
              salary["pay_month"].month == log["date"].month and log["status"] == "completed",
              f"SalaryShiftLog {edge} does not match a completed shift")
        logs_by_salary[edge["salary"]].append(log)
    for salid, salary in t["salary"].items():
        pay = p.require("pay_structure", salary["pay_structure"])
        check(pay["type"] == salary["employee_type"], f"Salary {salid} wrong pay structure")
        check(salary["pay_month"].day == 1, f"Salary {salid} pay month not first day")
        check(salary["base"] == pay["base"], f"Salary {salid} incorrect base pay")
        logs = logs_by_salary[salid]
        check(len(logs) == 2, f"Salary {salid} should link two completed shifts")
        expected_allowance = (salary["base"] * pay["rate"] * Decimal(len(logs)) /
                              Decimal("3")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        check(salary["allowance"] == expected_allowance and
              salary["total"] == salary["base"] + salary["allowance"],
              f"Salary {salid} does not use documented completed-shift allowance rule")

    # Count multi-value source cells to prove 1NF work is visible.
    check(p.raw_counts["07_pharmacy_stock.csv"] < len(t["pharmacy_inventory"]),
          "Raw pharmacy cells did not expand into inventory rows")
    check(p.raw_counts["06_prescription_register.csv"] < len(t["prescription_detail"]),
          "Raw prescription cells did not expand into detail rows")
    return payment_by_year


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path(__file__).resolve().parent / "raw_csv",
                        help="Folder containing the 12 raw register CSVs")
    parser.add_argument("--year", type=int,
                        help="Legacy previous-year/end-year mode used by generator")
    parser.add_argument("--start-year", type=int,
                        help="Inclusive first year; must match generator")
    parser.add_argument("--end-year", type=int,
                        help="Inclusive last year; must match generator")
    parser.add_argument("--scale", type=int, default=1,
                        help="Same cohort count used by the generator (default: 1)")
    args = parser.parse_args()
    if not 1 <= args.scale <= 1000:
        parser.error("--scale must be between 1 and 1000")
    first_year, final_year = resolve_year_bounds(
        args.year, args.start_year, args.end_year, parser)
    try:
        projection = project(args.input)
        payment_by_year = validate(projection, final_year, args.scale, first_year)
    except (ValueError, KeyError, IndexError, AssertionError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
    print(f"PASS: {len(projection.raw_counts)} source CSVs were parsed and cross-validated")
    print("PASS: all documented 26 tables can be projected, including junction tables")
    print("PASS: PK/FK, doctor shifts, admissions, OT, invoices, inventory and payroll invariants")
    print(f"PASS: annual appointments, prescriptions and paid bills in EVERY year "
          f"{first_year}–{final_year}")
    print("PASS: same patient across branches, branch-specific stock prices")
    print("\nExpected normalized row counts after your SQL transformations:")
    for name, rows in projection.tables.items():
        print(f"  {name:22} {len(rows):>3}")
    print(f"\nPAID bills per year ({first_year}–{final_year}): "
          f"{dict(sorted(payment_by_year.items()))}")
    print("The script DOES NOT write normalized tables or load PostgreSQL; it checks source readiness.")


if __name__ == "__main__":
    main()

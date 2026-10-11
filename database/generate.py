from __future__ import annotations

import argparse
import csv
import random
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from faker import Faker


FIELDS = {
    "01_hospital_roster.csv": [
        "paper_row", "department_branch_id", "department_branch_location", "department_branch_status",
        "department_id", "department_name", "department_status", "doctor_id", "doctor_name",
        "specialization", "doctor_phone", "shift_branch_id", "shift_branch_location",
        "shift_branch_status", "shift_start", "shift_end",
    ],
    "02_patient_visits.csv": [
        "paper_row", "appointment_id", "appointment_date", "appointment_time", "token_no", "appointment_status",
        "patient_id", "patient_name", "dob", "gender", "patient_full_address", "patient_phone",
        "doctor_id", "doctor_name", "department_id", "department_name", "branch_id", "branch_location",
    ],
    "03_employee_roster.csv": [
        "paper_row", "employee_kind", "employee_id", "employee_name", "role", "shift_label",
        "branch_id", "branch_location", "branch_status",
    ],
    "04_care_register.csv": [
        "paper_row", "patient_id", "patient_name", "branch_id", "branch_location", "assignment_date",
        "nurses_list", "staff_list",
    ],
    "05_ward_register.csv": [
        "paper_row", "branch_id", "branch_location", "room_no", "room_type",
        "critical_care_monitoring", "availability_status", "admission_history",
    ],
    "06_prescription_register.csv": [
        "paper_row", "prescription_id", "appointment_reference", "patient_id", "patient_name",
        "doctor_id", "doctor_name", "prescription_date", "medicines_list",
    ],
    "07_pharmacy_stock.csv": [
        "paper_row", "pharmacy_id", "branch_id", "branch_location", "stock_items",
    ],
    "08_lab_register.csv": [
        "paper_row", "lab_result_id", "patient_id", "patient_name", "test_type",
        "order_date", "result_date", "result_details", "source_branch_id", "source_branch_location",
    ],
    "09_surgery_register.csv": [
        "paper_row", "ot_id", "ot_branch_id", "ot_branch_location", "ot_current_status",
        "ot_schedule_id", "patient_id", "patient_name", "doctor_id", "doctor_name",
        "nurse_id", "nurse_name", "procedure", "schedule_start", "schedule_end",
        "operation_status", "related_appointment_reference",
    ],
    "10_equipment_register.csv": [
        "paper_row", "equipment_id", "branch_id", "branch_location", "equipment_name",
        "equipment_location", "maintenance_date", "equipment_status",
    ],
    "11_billing_register.csv": [
        "paper_row", "bill_id", "appointment_id", "patient_id", "patient_name", "doctor_id", "doctor_name",
        "branch_id", "branch_location", "bill_amount", "bill_date", "payment_status",
        "ot_schedule_reference", "procedure_description",
    ],
    "12_payroll_register.csv": [
        "paper_row", "salary_id", "employee_kind", "employee_id", "employee_name", "branch_id",
        "branch_location", "pay_month", "pay_structure_id", "pay_structure_status", "base_pay", "allowance_rate",
        "base_pay_applied", "allowance_applied", "salary_amount", "duty_logs_list", "paid_shift_log_ids",
    ],
}

# Source-register encodings that deliberately violate 1NF. Split '|' into entries;
# split '~' inside an entry. All IDs are stable reference numbers, not inferred from names.
MEDICINES = [
    (801, "Paracetamol 500mg", "500mg"),
    (802, "Amlodipine 5mg", "5mg"),
    (803, "Amoxicillin 250mg", "250mg"),
    (804, "Metformin 500mg", "500mg"),
    (805, "Atorvastatin 10mg", "10mg"),
    (806, "Omeprazole 20mg", "20mg"),
    (807, "Cetirizine 10mg", "10mg"),
    (808, "Vitamin D3 1000IU", "1000IU"),
    (809, "Ibuprofen 200mg", "200mg"),
    (810, "Losartan 50mg", "50mg"),
    (811, "Salbutamol 2mg", "2mg"),
    (812, "Aspirin 75mg", "75mg"),
]


def dstr(value):
    return value.isoformat() if value is not None else ""


def ts(value: datetime) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S")


def money(number: Decimal | int | float | str) -> str:
    return str(Decimal(str(number)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def dirty(text: object, i: int) -> str:
    """Small reversible formatting differences, never misspell/alter identity."""
    s = str(text)
    if i % 7 == 0:
        return "  " + s + "  "
    if i % 7 == 1:
        return s.upper()
    if i % 7 == 2:
        return s.lower()
    if i % 7 == 3:
        return " " + s + " "
    return s


def make_data(seed: int, year: int, start_year: int | None = None):
    """One coherent cohort spanning start_year..year (both inclusive).

    `year` is the end year to retain backward compatibility with --year.
    Every completed session is deliberately placed in a year from the range.
    """
    start_year = year - 1 if start_year is None else start_year
    span = year - start_year + 1
    if not 1 <= span <= 18:
        raise ValueError("The requested year range must be 1 to 18 years (18 annual bill records)")
    rand = random.Random(seed)
    fake = Faker("en_IN")
    fake.seed_instance(seed)

    branch_names = [
        "Kochi Main Hospital", "Ernakulam City Branch", "Thrissur Medical Centre",
    ]
    branches = {101 + i: dict(id=101 + i, location=name, status="active")
                for i, name in enumerate(branch_names)}

    department_rows = [
        (501, "Cardiology", 101), (502, "Neurology", 101),
        (503, "Orthopedics", 102), (504, "General Medicine", 102),
        (505, "Pediatrics", 103), (506, "Cardiology", 103),
    ]
    departments = {did: dict(id=did, name=name, branch=bid, status="active")
                   for did, name, bid in department_rows}

    # Three doctors per branch. 201 and 204 each have one cross-branch session.
    doctor_specs = [(201, 501), (202, 501), (203, 502), (204, 503),
                    (205, 503), (206, 504), (207, 505), (208, 506), (209, 506)]
    doctors = {}
    for i, (did, dept) in enumerate(doctor_specs):
        name = "Dr. " + fake.name().removeprefix("Dr. ").strip()
        doctors[did] = dict(id=did, name=name, department=dept,
                            specialization=departments[dept]["name"],
                            phone=f"+91 {9800000000 + i * 73 + seed % 71:010d}")

    patients = {}
    city_options = [("Kochi", "682016"), ("Ernakulam", "682030"),
                    ("Thrissur", "680001")]
    for j in range(30):
        pid = 1001 + j
        city, pin = city_options[j // 10]
        dob = date(rand.randint(1954, min(2010, start_year - 1)),
                   rand.randint(1, 12), rand.randint(1, 28))
        patients[pid] = dict(
            id=pid, name=fake.name().replace("Dr. ", ""), dob=dob,
            gender="Female" if j % 2 == 0 else "Male",
            street=f"{21 + j} {['Temple Road', 'Station Lane', 'Market Street', 'Lake View Road'][j % 4]}",
            city=city, state="Kerala", pin=pin,
            phone=f"+91 {9001000000 + j * 37:010d}",
        )

    nurses = {}
    staff = {}
    staff_roles = ("Receptionist", "Lab Technician", "Pharmacist", "Billing Clerk", "Ward Assistant", "Administrator")
    for bidx, bid in enumerate(branches):
        for n in range(3):
            nid = 301 + 3 * bidx + n
            nurses[nid] = dict(id=nid, name=fake.name(), branch=bid,
                               shift="Morning" if n % 2 == 0 else "Evening")
        for n in range(2):
            sid = 401 + 2 * bidx + n
            staff[sid] = dict(id=sid, name=fake.name(), branch=bid,
                              shift="Morning" if n == 0 else "Evening",
                              role=staff_roles[bidx * 2 + n])

    # Eighteen completed doctor sessions are spread over ALL selected years.
    # This guarantees a source visit for each year (up to 18 years). Each
    # session has its own date, so no doctor or branch-shift collision arises.
    # The labels "historical" / "recent" identify the two distinct sessions
    # per doctor and are NOT assertions about the exact calendar year.
    shifts = []
    sessions = []
    for i, (did, depid) in enumerate(doctor_specs):
        home = departments[depid]["branch"]
        for phase, which in enumerate(("historical", "recent")):
            session_index = phase * len(doctor_specs) + i
            session_year = start_year + session_index * span // (2 * len(doctor_specs))
            day = date(session_year, 2 + session_index % 7, 10 + session_index % 9)
            bid = (102 if did == 201 else 101 if did == 204 else home) if phase else home
            start = datetime.combine(day, time(8, 0))
            shifts.append(dict(doctor=did, branch=bid, start=start,
                               end=datetime.combine(day, time(17, 0))))
            sessions.append(dict(doctor=did, branch=bid, day=day, which=which))

    # Surgical doctors have future availability in the correct branch.
    future_doctors = [201, 202, 204, 205, 208, 209]
    for j, did in enumerate(future_doctors):
        day = date(year, 11, 11 + j)
        bid = departments[doctors[did]["department"]]["branch"]
        shifts.append(dict(doctor=did, branch=bid,
                           start=datetime.combine(day, time(8, 0)),
                           end=datetime.combine(day, time(17, 0))))
        sessions.append(dict(doctor=did, branch=bid, day=day, which="future"))

    # 36 appointments: 30 completed across requested years plus 6 scheduled
    # in November of the end year. 30 distinct patients + 6 repeat visits.
    slots = []
    for session in sessions:
        did = session["doctor"]
        if session["which"] == "historical":
            how_many = 2
        elif session["which"] == "recent":
            how_many = 2 if did in (201, 202, 203) else 1
        else:
            how_many = 1
        for t in range(how_many):
            slots.append(dict(**session, # Distinguish 10:00 from 09:30.
                              hour=9 if t == 0 else 10,
                              status="confirmed" if session["which"] == "future" and t % 2 == 0
                              else "pending" if session["which"] == "future" else "completed"))
    assert len(slots) == 36
    slots.sort(key=lambda x: (x["day"], x["doctor"], x["hour"]))
    branch_patient_next = defaultdict(int)
    token_counter = defaultdict(int)
    appointments = {}
    for i, slot in enumerate(slots):
        bid = slot["branch"]
        ordinal = branch_patient_next[bid]
        if ordinal < 10:
            patient_id = 1001 + (bid - 101) * 10 + ordinal
        elif bid == 102 and ordinal == 10:
            # Patient registered in Kochi also visits the Ernakulam branch.
            patient_id = 1001
        else:
            patient_id = 1001 + (bid - 101) * 10 + ((ordinal - 10) % 10)
        branch_patient_next[bid] += 1
        token_counter[(bid, slot["day"])] += 1
        appointment_id = 3001 + i
        appointments[appointment_id] = dict(
            id=appointment_id, patient=patient_id, doctor=slot["doctor"], branch=bid,
            phase=slot["which"],
            day=slot["day"], when=time(slot["hour"], 30 if slot["hour"] == 9 else 0),
            token=token_counter[(bid, slot["day"])], status=slot["status"],
        )
    assert len({a["patient"] for a in appointments.values()}) == 30
    assert any(a["branch"] == 102 and a["patient"] == 1001 for a in appointments.values())

    # Payroll uses September of several historical years where practical.
    # Salary and completed shift logs share the exact employee, branch,
    # calendar month and year. These shifts are distinct from appointment shifts.
    paystructures = {9501: dict(kind="doctor", base=Decimal("90000.00"), rate=Decimal("0.1500")),
                     9502: dict(kind="nurse", base=Decimal("48000.00"), rate=Decimal("0.1000")),
                     9503: dict(kind="staff", base=Decimal("36000.00"), rate=Decimal("0.0800"))}
    payroll_people = []
    for bid in branches:
        payroll_people += [("doctor", {101: 201, 102: 204, 103: 208}[bid], bid),
                           ("nurse", 301 + (bid - 101) * 3, bid),
                           ("staff", 401 + (bid - 101) * 2, bid)]
    shiftlogs = []
    salaries = []
    for i, (kind, eid, bid) in enumerate(payroll_people):
        payroll_year = start_year + i * span // len(payroll_people)
        logs = []
        for j, day_num in enumerate((3, 10, 17)):
            log = dict(id=9001 + len(shiftlogs), kind=kind, employee=eid, branch=bid,
                       day=date(payroll_year, 9, day_num), start=time(9, 0), end=time(17, 0),
                       status="completed" if j < 2 else "absent")
            shiftlogs.append(log)
            logs.append(log)
            if kind == "doctor":
                shifts.append(dict(doctor=eid, branch=bid,
                                   start=datetime.combine(log["day"], log["start"]),
                                   end=datetime.combine(log["day"], log["end"])))
        payid = {"doctor": 9501, "nurse": 9502, "staff": 9503}[kind]
        p = paystructures[payid]
        # Demonstration assumption: allowance prorated by completed shifts (2/3).
        allowance = (p["base"] * p["rate"] * Decimal("2") / Decimal("3")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP)
        salaries.append(dict(id=9601 + i, kind=kind, employee=eid, branch=bid,
                             pay_month=date(payroll_year, 9, 1), paystruct=payid,
                             base=p["base"], rate=p["rate"], allowance=allowance,
                             total=p["base"] + allowance, logs=logs,
                             paid_logs=logs[:2]))

    # 12 branch-scoped rooms and 9 admissions. Completed admissions span
    # historical years; three open ICU admissions occur in the end year.
    # RoomNo '101' and 'ICU-01' repeat between branches.
    rooms = {}
    admissions = {}
    aid = 6001
    for bid in branches:
        for room_no, room_type in (("101", "private"), ("102", "general"),
                                   ("ICU-01", "icu"), ("103", "general")):
            rooms[(bid, room_no)] = dict(branch=bid, no=room_no, type=room_type,
                                         critical=room_type == "icu", status="available", admissions=[])
        idx = bid - 101
        early_year = start_year + (2 * idx) * (span - 1) // 5
        later_year = start_year + (2 * idx + 1) * (span - 1) // 5
        placement = [
            ("101", 1001 + 10 * idx, datetime(early_year, 4 + idx, 10, 10),
             datetime(early_year, 4 + idx, 13, 11)),
            ("101", 1002 + 10 * idx, datetime(later_year, 7 + idx, 8, 11),
             datetime(later_year, 7 + idx, 12, 10)),
            ("ICU-01", 1003 + 10 * idx, datetime(year, 10, 8 + idx, 9), None),
        ]
        for room_no, pid, admitted, discharged in placement:
            record = dict(id=aid, branch=bid, room=room_no, patient=pid,
                          start=admitted, end=discharged)
            admissions[aid] = record
            rooms[(bid, room_no)]["admissions"].append(record)
            if discharged is None:
                rooms[(bid, room_no)]["status"] = "occupied"
            aid += 1

    # 9 records contain 12 nurse assignments and 9 staff assignments.
    care = []
    for index, adm in enumerate(admissions.values()):
        bid = adm["branch"]
        bidx = bid - 101
        nurse_ids = [301 + 3 * bidx + (index % 3)]
        if index % 3 == 0:
            nurse_ids.append(301 + 3 * bidx + ((index + 1) % 3))
        staff_ids = [401 + 2 * bidx + index % 2]
        care.append(dict(patient=adm["patient"], branch=bid,
                         day=adm["start"].date(), nurses=nurse_ids, staff=staff_ids))

    # One prescription per completed DOCTOR SESSION ensures prescriptions
    # appear in every requested year. Twelve of them have repeating medicines.
    meds = {mid: dict(id=mid, name=name, dose=dose)
            for mid, name, dose in MEDICINES}
    completed_sessions = set()
    selected_rx = []
    for appt in sorted(appointments.values(), key=lambda a: (a["day"], a["id"])):
        if appt["status"] != "completed":
            continue
        session_key = (appt["doctor"], appt["day"])
        if session_key not in completed_sessions:
            selected_rx.append(appt)
            completed_sessions.add(session_key)
    assert len(selected_rx) == 18
    prescriptions = []
    for i, appt in enumerate(selected_rx):
        num = 2 if i < 12 else 1
        mid1 = 801 + (i % 12)
        selected = [mid1]
        if num == 2:
            mid2 = 801 + ((i + 5) % 12)
            assert mid1 != mid2
            selected.append(mid2)
        prescriptions.append(dict(id=4001 + i, appointment=appt["id"],
                                  patient=appt["patient"], doctor=appt["doctor"],
                                  day=appt["day"], items=[dict(medicine=m,
                                  dosage=meds[m]["dose"], qty=5 + ((i + k) % 6) * 5)
                                  for k, m in enumerate(selected)]))

    # Each of 3 pharmacies stores 8 medicines: 24 inventory records, all 12
    # medicine IDs covered; same medicine can be differently priced per branch.
    pharmacy_meds = {701: list(range(801, 809)),
                     702: list(range(805, 813)),
                     703: [801, 802, 803, 804, 809, 810, 811, 812]}
    pharmacies = {}
    for n, (pid, midlist) in enumerate(pharmacy_meds.items()):
        pharmacy = dict(id=pid, branch=101 + n, items=[])
        for k, mid in enumerate(midlist):
            stock = 8 if (k + n) % 5 == 0 else 55 + 10 * k
            reorder = 20 if k % 2 == 0 else 25
            price = Decimal("6.50") + Decimal(str((mid - 801) * 1.75)) + Decimal(n * 2)
            pharmacy["items"].append(dict(medicine=mid, stock=stock,
                                          price=price, reorder=reorder))
        pharmacies[pid] = pharmacy

    labs = []
    completed = [a for a in appointments.values() if a["status"] == "completed"]
    # Pick evenly across all completed sessions so lab results also span years.
    lab_source = ([selected_rx[j * (len(selected_rx) - 1) // 11] for j in range(12)]
                  + [a for a in appointments.values() if a["status"] != "completed"][:3])
    tests = ["CBC", "ECG", "X-Ray", "Lipid Profile", "Blood Glucose"]
    for i, appt in enumerate(lab_source):
        pending = i >= 12
        labs.append(dict(id=5001 + i, patient=appt["patient"],
                         branch=appt["branch"], test=tests[i % len(tests)],
                         order_date=appt["day"],
                         result_date=None if pending else appt["day"] + timedelta(days=1),
                         result="" if pending else "Synthetic findings; reviewed"))
    assert len(labs) == 15

    # 3 theatres x 3 procedures: completed surgery in each year + future slot.
    ots = {901 + j: dict(id=901 + j, branch=101 + j, status="available") for j in range(3)}
    surgery_specs = [
        (101, 201, "historical", "Cardiac catheterization"),
        (101, 202, "recent", "Cardiac diagnostic procedure"),
        (101, 201, "future", "Cardiac follow-up procedure"),
        (102, 204, "historical", "Arthroscopic procedure"),
        (102, 205, "recent", "Orthopedic day procedure"),
        (102, 204, "future", "Orthopedic follow-up procedure"),
        (103, 208, "historical", "Diagnostic cardiac procedure"),
        (103, 209, "recent", "Cardiology intervention"),
        (103, 208, "future", "Cardiology day procedure"),
    ]
    surgeries = []
    for i, (bid, did, which, procedure) in enumerate(surgery_specs):
        matching = [a for a in appointments.values() if a["branch"] == bid
                    and a["doctor"] == did and a["phase"] == which]
        assert matching, f"No suitable {which} appointment for {did} in branch {bid}"
        appt = matching[0]
        nid = 301 + (bid - 101) * 3 + (i % 3)
        start = datetime.combine(appt["day"], time(14, 0))
        surgeries.append(dict(id=7001 + i, ot=901 + bid - 101, patient=appt["patient"],
                              doctor=did, nurse=nid, procedure=procedure, start=start,
                              end=start + timedelta(hours=1, minutes=30),
                              status="scheduled" if which == "future" else "completed",
                              appointment=appt["id"]))

    equipments = []
    equipment_options = ["ECG Monitor", "Ventilator", "Defibrillator"]
    for bid in branches:
        for j, equipment_name in enumerate(equipment_options):
            equipment_index = (bid - 101) * 3 + j
            maintenance_year = start_year + equipment_index * span // 9
            equipments.append(dict(id=7101 + equipment_index, branch=bid,
                                   name=equipment_name,
                                   location=("Cardiology Lab", "ICU", "Emergency Wing")[j],
                                   maintenance=date(maintenance_year, 6 + j, 8 + bid - 101),
                                   status=("available", "in_use", "maintenance")[j]))

    # One invoice per completed session means even the smallest dataset has
    # chart-ready paid revenue in every selected year. Completed OT bills are
    # tied to the corresponding visit; future surgeries are never billed.
    surgery_by_appt = {s["appointment"]: s for s in surgeries if s["status"] == "completed"}
    chosen = sorted(selected_rx, key=lambda a: (a["day"], a["id"]))
    assert len(chosen) == 18
    assert set(surgery_by_appt).issubset({a["id"] for a in chosen})
    bills = []
    paid_years = set()
    for i, appt in enumerate(chosen):
        surgery = surgery_by_appt.get(appt["id"])
        bill_day = surgery["start"].date() if surgery else appt["day"]
        # Guarantee at least one PAID invoice in every year, even at scale=1.
        payment = ("paid" if bill_day.year not in paid_years
                   else ("paid", "partial", "unpaid", "paid")[i % 4])
        if payment == "paid":
            paid_years.add(bill_day.year)
        bills.append(dict(id=8001 + i, appointment=appt["id"],
                          branch=appt["branch"], patient=appt["patient"],
                          doctor=appt["doctor"], surgery=surgery["id"] if surgery else None,
                          procedure=surgery["procedure"] if surgery else "",
                          amount=Decimal(4500 + (i % 4) * 1000) if surgery
                          else Decimal(550 + (i % 4) * 175), day=bill_day,
                          payment=payment))

    assert len(shifts) == 33, len(shifts)
    return locals()


def create_registers(d):
    branches, departments, doctors = d["branches"], d["departments"], d["doctors"]
    patients, nurses, staff, appointments = d["patients"], d["nurses"], d["staff"], d["appointments"]
    meds = d["meds"]
    out = {filename: [] for filename in FIELDS}
    def add(file, row):
        row = {"paper_row": len(out[file]) + 1, **row}
        extra = set(row) - set(FIELDS[file])
        missing = set(FIELDS[file]) - set(row)
        if extra or missing:
            raise AssertionError(f"{file}: extra={extra}, missing={missing}")
        out[file].append(row)

    f = "01_hospital_roster.csv"
    for j, shift in enumerate(sorted(d["shifts"], key=lambda v: (v["start"], v["doctor"]))):
        doc = doctors[shift["doctor"]]
        dept = departments[doc["department"]]
        home = branches[dept["branch"]]
        shift_branch = branches[shift["branch"]]
        add(f, dict(department_branch_id=home["id"],
                    department_branch_location=dirty(home["location"], j),
                    department_branch_status=dirty(home["status"], j),
                    department_id=dept["id"], department_name=dirty(dept["name"], j + 1),
                    department_status=dirty(dept["status"], j + 2), doctor_id=doc["id"],
                    doctor_name=dirty(doc["name"], j + 3), specialization=dirty(doc["specialization"], j + 2),
                    doctor_phone=doc["phone"], shift_branch_id=shift_branch["id"],
                    shift_branch_location=dirty(shift_branch["location"], j + 4),
                    shift_branch_status=dirty(shift_branch["status"], j + 2),
                    shift_start=ts(shift["start"]), shift_end=ts(shift["end"])))

    f = "02_patient_visits.csv"
    for j, appt in enumerate(appointments.values()):
        pt = patients[appt["patient"]]
        doc = doctors[appt["doctor"]]
        dept = departments[doc["department"]]
        addr = " | ".join((pt["street"], pt["city"], pt["state"], pt["pin"]))
        add(f, dict(appointment_id=appt["id"], appointment_date=dstr(appt["day"]),
                    appointment_time=appt["when"].strftime("%H:%M"), token_no=appt["token"],
                    appointment_status=dirty(appt["status"], j), patient_id=pt["id"],
                    patient_name=dirty(pt["name"], j + 1), dob=dstr(pt["dob"]),
                    gender=dirty(pt["gender"], j), patient_full_address=addr,
                    patient_phone=pt["phone"], doctor_id=doc["id"],
                    doctor_name=dirty(doc["name"], j + 3), department_id=dept["id"],
                    department_name=dirty(dept["name"], j + 5),
                    branch_id=appt["branch"],
                    branch_location=dirty(branches[appt["branch"]]["location"], j + 2)))

    f = "03_employee_roster.csv"
    employees = [("nurse", n) for n in nurses.values()] + [("staff", s) for s in staff.values()]
    for j, (kind, e) in enumerate(employees):
        add(f, dict(employee_kind=dirty(kind, j), employee_id=e["id"],
                    employee_name=dirty(e["name"], j + 1),
                    role=e.get("role", ""), shift_label=dirty(e["shift"], j + 3),
                    branch_id=e["branch"],
                    branch_location=dirty(branches[e["branch"]]["location"], j + 1),
                    branch_status=dirty(branches[e["branch"]]["status"], j)))

    f = "04_care_register.csv"
    for j, care in enumerate(d["care"]):
        p = patients[care["patient"]]
        nurse_items = [f'{nid}~{nurses[nid]["name"]}' for nid in care["nurses"]]
        staff_items = [f'{sid}~{staff[sid]["name"]}' for sid in care["staff"]]
        add(f, dict(patient_id=p["id"], patient_name=dirty(p["name"], j),
                    branch_id=care["branch"],
                    branch_location=dirty(branches[care["branch"]]["location"], j + 1),
                    assignment_date=dstr(care["day"]),
                    nurses_list="|".join(nurse_items), staff_list="|".join(staff_items)))

    f = "05_ward_register.csv"
    for j, room in enumerate(d["rooms"].values()):
        admissions = []
        for a in room["admissions"]:
            admissions.append("~".join((str(a["id"]), str(a["patient"]),
                                         patients[a["patient"]]["name"], ts(a["start"]),
                                         ts(a["end"]) if a["end"] else "")))
        add(f, dict(branch_id=room["branch"],
                    branch_location=dirty(branches[room["branch"]]["location"], j),
                    room_no=room["no"], room_type=dirty(room["type"], j),
                    critical_care_monitoring="Yes" if room["critical"] else "No",
                    availability_status=dirty(room["status"], j + 2),
                    admission_history="|".join(admissions)))

    f = "06_prescription_register.csv"
    for j, p in enumerate(d["prescriptions"]):
        pt = patients[p["patient"]]
        doctor = doctors[p["doctor"]]
        items = ["~".join((str(item["medicine"]), meds[item["medicine"]]["name"],
                          item["dosage"], str(item["qty"]))) for item in p["items"]]
        add(f, dict(prescription_id=p["id"], appointment_reference=p["appointment"],
                    patient_id=pt["id"], patient_name=dirty(pt["name"], j),
                    doctor_id=doctor["id"], doctor_name=dirty(doctor["name"], j + 2),
                    prescription_date=dstr(p["day"]), medicines_list="|".join(items)))

    f = "07_pharmacy_stock.csv"
    for j, ph in enumerate(d["pharmacies"].values()):
        entries = ["~".join((str(i["medicine"]), meds[i["medicine"]]["name"], str(i["stock"]),
                             money(i["price"]), str(i["reorder"]))) for i in ph["items"]]
        add(f, dict(pharmacy_id=ph["id"], branch_id=ph["branch"],
                    branch_location=dirty(branches[ph["branch"]]["location"], j),
                    stock_items="|".join(entries)))

    f = "08_lab_register.csv"
    for j, lab in enumerate(d["labs"]):
        add(f, dict(lab_result_id=lab["id"], patient_id=lab["patient"],
                    patient_name=dirty(patients[lab["patient"]]["name"], j),
                    test_type=dirty(lab["test"], j + 2), order_date=dstr(lab["order_date"]),
                    result_date=dstr(lab["result_date"]), result_details=lab["result"],
                    source_branch_id=lab["branch"],
                    source_branch_location=dirty(branches[lab["branch"]]["location"], j)))

    f = "09_surgery_register.csv"
    for j, s in enumerate(d["surgeries"]):
        ot = d["ots"][s["ot"]]
        add(f, dict(ot_id=s["ot"], ot_branch_id=ot["branch"],
                    ot_branch_location=dirty(branches[ot["branch"]]["location"], j),
                    ot_current_status=ot["status"], ot_schedule_id=s["id"],
                    patient_id=s["patient"], patient_name=dirty(patients[s["patient"]]["name"], j),
                    doctor_id=s["doctor"], doctor_name=dirty(doctors[s["doctor"]]["name"], j + 1),
                    nurse_id=s["nurse"], nurse_name=dirty(nurses[s["nurse"]]["name"], j + 2),
                    procedure=s["procedure"], schedule_start=ts(s["start"]),
                    schedule_end=ts(s["end"]), operation_status=dirty(s["status"], j + 2),
                    related_appointment_reference=s["appointment"]))

    f = "10_equipment_register.csv"
    for j, e in enumerate(d["equipments"]):
        add(f, dict(equipment_id=e["id"], branch_id=e["branch"],
                    branch_location=dirty(branches[e["branch"]]["location"], j),
                    equipment_name=dirty(e["name"], j + 1), equipment_location=e["location"],
                    maintenance_date=dstr(e["maintenance"]),
                    equipment_status=dirty(e["status"], j + 2)))

    f = "11_billing_register.csv"
    for j, b in enumerate(d["bills"]):
        add(f, dict(bill_id=b["id"], appointment_id=b["appointment"], patient_id=b["patient"],
                    patient_name=dirty(patients[b["patient"]]["name"], j), doctor_id=b["doctor"],
                    doctor_name=dirty(doctors[b["doctor"]]["name"], j + 1),
                    branch_id=b["branch"],
                    branch_location=dirty(branches[b["branch"]]["location"], j + 2),
                    bill_amount=money(b["amount"]), bill_date=dstr(b["day"]),
                    payment_status=dirty(b["payment"], j),
                    ot_schedule_reference=b["surgery"] or "", procedure_description=b["procedure"]))

    f = "12_payroll_register.csv"
    for j, s in enumerate(d["salaries"]):
        p = d["paystructures"][s["paystruct"]]
        employee = {"doctor": doctors, "nurse": nurses, "staff": staff}[s["kind"]][s["employee"]]
        logs = ["~".join((str(log["id"]), dstr(log["day"]), log["start"].strftime("%H:%M"),
                          log["end"].strftime("%H:%M"), log["status"])) for log in s["logs"]]
        add(f, dict(salary_id=s["id"], employee_kind=dirty(s["kind"], j),
                    employee_id=s["employee"], employee_name=dirty(employee["name"], j),
                    branch_id=s["branch"],
                    branch_location=dirty(branches[s["branch"]]["location"], j + 2),
                    pay_month=dstr(s["pay_month"]), pay_structure_id=s["paystruct"],
                    pay_structure_status=dirty("active", j + 3),
                    base_pay=money(p["base"]), allowance_rate=str(p["rate"]),
                    base_pay_applied=money(s["base"]), allowance_applied=money(s["allowance"]),
                    salary_amount=money(s["total"]), duty_logs_list="|".join(logs),
                    paid_shift_log_ids="|".join(str(log["id"]) for log in s["paid_logs"])))

    return out


# Scaling keeps the original 3 branches, 6 departments, 3 pharmacies,
# 12 medicines and 3 pay structures. It adds NEW people, rooms, theatres,
# appointments and care/financial records in linked synthetic cohorts.
# Each cohort is a small self-contained clinical activity sample, not a
# second hospital. Uniqueness is preserved for every ID and composite key.
_ID_STEP = {
    "doctor": 9,
    "patient": 30,
    "appointment": 36,
    "nurse": 9,
    "staff": 6,
    "admission": 9,
    "prescription": 18,
    "lab": 15,
    "ot": 3,
    "ot_schedule": 9,
    "equipment": 9,
    "bill": 18,
    "salary": 9,
    "shift_log": 27,
}


def _shift_id(raw_value: str, kind: str, cohort: int) -> str:
    if not str(raw_value).strip():
        return ""
    return str(int(raw_value) + cohort * _ID_STEP[kind])


def _shift_encoded_ids(value: str, kind: str, cohort: int, separator: str = "~") -> str:
    """Change the leading ID in a 'ID~...' cell, with | separated items."""
    if not value:
        return value
    parts = []
    for item in value.split("|"):
        components = item.split(separator, 1)
        components[0] = _shift_id(components[0], kind, cohort)
        parts.append(separator.join(components))
    return "|".join(parts)


def _room_number(room: str, cohort: int) -> str:
    if room.startswith("ICU-"):
        return f"ICU-{cohort + 1:02d}"
    return str(int(room) + 100 * cohort)


def _mobile(phone: str, cohort: int) -> str:
    """Give each cohort distinct fictional phone numbers as well as IDs."""
    if not phone or cohort == 0:
        return phone
    prefix, number = phone.rsplit(" ", 1)
    return f"{prefix} {int(number) + cohort * 2500:010d}"


def relabel_registers(source: dict, cohort: int) -> dict:
    """Remap every FK/PK reference consistently, including denormalized lists."""
    if cohort == 0:
        return source
    result = {}
    for filename, rows in source.items():
        copied = []
        for raw in rows:
            row = dict(raw)
            def move(field, kind):
                row[field] = _shift_id(row[field], kind, cohort)

            if filename == "01_hospital_roster.csv":
                move("doctor_id", "doctor")
                row["doctor_phone"] = _mobile(row["doctor_phone"], cohort)

            elif filename == "02_patient_visits.csv":
                for field, kind in (("appointment_id", "appointment"),
                                    ("patient_id", "patient"),
                                    ("doctor_id", "doctor")):
                    move(field, kind)
                row["patient_phone"] = _mobile(row["patient_phone"], cohort)

            elif filename == "03_employee_roster.csv":
                kind = row["employee_kind"].strip().casefold()
                move("employee_id", kind)

            elif filename == "04_care_register.csv":
                move("patient_id", "patient")
                row["nurses_list"] = _shift_encoded_ids(row["nurses_list"], "nurse", cohort)
                row["staff_list"] = _shift_encoded_ids(row["staff_list"], "staff", cohort)

            elif filename == "05_ward_register.csv":
                row["room_no"] = _room_number(row["room_no"], cohort)
                admissions = []
                for entry in row["admission_history"].split("|"):
                    if not entry:
                        continue
                    parts = entry.split("~")
                    parts[0] = _shift_id(parts[0], "admission", cohort)
                    parts[1] = _shift_id(parts[1], "patient", cohort)
                    admissions.append("~".join(parts))
                row["admission_history"] = "|".join(admissions)

            elif filename == "06_prescription_register.csv":
                for field, kind in (("prescription_id", "prescription"),
                                    ("appointment_reference", "appointment"),
                                    ("patient_id", "patient"),
                                    ("doctor_id", "doctor")):
                    move(field, kind)
                # Medicine IDs are SHARED across every cohort.

            elif filename == "08_lab_register.csv":
                move("lab_result_id", "lab")
                move("patient_id", "patient")

            elif filename == "09_surgery_register.csv":
                for field, kind in (("ot_id", "ot"),
                                    ("ot_schedule_id", "ot_schedule"),
                                    ("patient_id", "patient"),
                                    ("doctor_id", "doctor"),
                                    ("nurse_id", "nurse"),
                                    ("related_appointment_reference", "appointment")):
                    move(field, kind)

            elif filename == "10_equipment_register.csv":
                move("equipment_id", "equipment")

            elif filename == "11_billing_register.csv":
                for field, kind in (("bill_id", "bill"),
                                    ("appointment_id", "appointment"),
                                    ("patient_id", "patient"),
                                    ("doctor_id", "doctor"),
                                    ("ot_schedule_reference", "ot_schedule")):
                    move(field, kind)

            elif filename == "12_payroll_register.csv":
                move("salary_id", "salary")
                move("employee_id", row["employee_kind"].strip().casefold())
                row["duty_logs_list"] = _shift_encoded_ids(
                    row["duty_logs_list"], "shift_log", cohort)
                row["paid_shift_log_ids"] = "|".join(
                    _shift_id(n, "shift_log", cohort)
                    for n in row["paid_shift_log_ids"].split("|") if n.strip())

            copied.append(row)
        result[filename] = copied
    return result


def make_scaled_registers(seed: int, year: int, scale: int,
                          start_year: int | None = None) -> dict:
    """N coherent cohorts sharing a hospital, covering start_year..year."""
    out = {filename: [] for filename in FIELDS}
    token_counter = defaultdict(int)
    for cohort in range(scale):
        local = create_registers(make_data(seed + cohort * 1009, year, start_year))
        local = relabel_registers(local, cohort)
        for filename, rows in local.items():
            # Hospital/department master data, medicines, pharmacy inventory,
            # and pay rules are shared across cohorts, not multiplied.
            if cohort and filename == "07_pharmacy_stock.csv":
                continue
            for row in rows:
                row = dict(row)
                row["paper_row"] = len(out[filename]) + 1
                if filename == "02_patient_visits.csv":
                    key = (row["branch_id"], row["appointment_date"])
                    token_counter[key] += 1
                    row["token_no"] = token_counter[key]
                out[filename].append(row)
    return out


def resolve_year_bounds(cli_year: int | None, start_year: int | None,
                        end_year: int | None, parser: argparse.ArgumentParser) -> tuple[int, int]:
    """Resolve old --year and new --start-year/--end-year CLI forms."""
    if cli_year is not None and (start_year is not None or end_year is not None):
        parser.error("Use either --year OR --start-year with --end-year, not both")
    if (start_year is None) != (end_year is None):
        parser.error("--start-year and --end-year must be supplied together")
    if start_year is None:
        end_year = 2026 if cli_year is None else cli_year
        start_year = end_year - 1
    if not 2000 <= start_year <= end_year <= 2090:
        parser.error("Require 2000 <= --start-year <= --end-year <= 2090")
    if end_year - start_year + 1 > 18:
        parser.error("Select at most 18 years: each cohort has 18 billed sessions, "
                     "to show paid revenue in every chosen year")
    return start_year, end_year


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent / "raw_csv",
                        help="Directory to write the 12 source-register CSV files")
    parser.add_argument("--seed", type=int, default=2026, help="Faker/random seed (default: 2026)")
    years = parser.add_argument_group("year selection")
    years.add_argument("--year", type=int,
                       help="Legacy mode: selected year and previous year; incompatible with --start/end-year")
    years.add_argument("--start-year", type=int,
                       help="First calendar year (inclusive); supply with --end-year")
    years.add_argument("--end-year", type=int,
                       help="Last calendar year (inclusive); supply with --start-year")
    parser.add_argument("--scale", type=int, default=1,
                        help="Number of linked clinical cohorts (default: 1). "
                             "Each adds 30 patients and 36 appointments.")
    args = parser.parse_args()
    if not 1 <= args.scale <= 1000:
        parser.error("--scale must be between 1 and 1000")
    start_year, end_year = resolve_year_bounds(
        args.year, args.start_year, args.end_year, parser)
    args.output.mkdir(parents=True, exist_ok=True)
    registers = make_scaled_registers(args.seed, end_year, args.scale, start_year)
    for filename, rows in registers.items():
        with (args.output / filename).open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=FIELDS[filename])
            writer.writeheader()
            writer.writerows(rows)
        print(f"{filename}: {len(rows):>6} raw register rows")
    appts = defaultdict(int)
    invoices = defaultdict(int)
    paid = defaultdict(int)
    for r in registers["02_patient_visits.csv"]:
        appts[int(r["appointment_date"][:4])] += 1
    for r in registers["11_billing_register.csv"]:
        bill_year = int(r["bill_date"][:4])
        invoices[bill_year] += 1
        if r["payment_status"].strip().casefold() == "paid":
            paid[bill_year] += 1
    print(f"Done. {len(registers)} linked CSV files in {args.output}")
    print(f"Years: {start_year}–{end_year} (inclusive); "
          f"scale: {args.scale}; {30 * args.scale} patients; "
          f"{36 * args.scale} appointments; 3 shared branches.")
    print("Year        Appointments   Bills   Paid bills")
    for y in range(start_year, end_year + 1):
        print(f"{y}        {appts[y]:>12}   {invoices[y]:>5}   {paid[y]:>10}")
    print("IMPORTANT: These files are denormalized source registers; "
          "do NOT COPY them into hms.* directly.")


if __name__ == "__main__":
    main()

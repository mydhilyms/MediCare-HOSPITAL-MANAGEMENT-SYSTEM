"""Regression tests for synthetic source CSV generation and cross-register checks.

Run: python -m unittest discover -s tests -v
"""
import csv
import hashlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from validate_raw_hms import EXPECTED, expected_counts, project, validate


def generate(destination, seed=2026, year=2026, scale=1):
    return subprocess.run([sys.executable, str(ROOT / "generate_raw_hms.py"),
                           "--output", str(destination), "--seed", str(seed),
                           "--year", str(year), "--scale", str(scale)], capture_output=True, text=True, check=True)


def generate_range(destination, start_year=2020, end_year=2026,
                   seed=2026, scale=1):
    return subprocess.run([sys.executable, str(ROOT / "generate_raw_hms.py"),
                           "--output", str(destination), "--seed", str(seed),
                           "--start-year", str(start_year), "--end-year", str(end_year),
                           "--scale", str(scale)], capture_output=True, text=True, check=True)


def digest(directory):
    return hashlib.sha256(b"".join(
        p.read_bytes() for p in sorted(Path(directory).glob("*.csv")))).hexdigest()


class HMSRawDataTests(unittest.TestCase):
    def test_generated_data_projects_to_all_26_tables(self):
        with tempfile.TemporaryDirectory() as tmp:
            generate(tmp)
            result = project(Path(tmp))
            validate(result, 2026)
            self.assertEqual(set(result.tables), set(EXPECTED))
            self.assertEqual(len(result.raw_counts), 12)

    def test_repeatability_for_same_seed_and_year(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            generate(a, 2026, 2026)
            generate(b, 2026, 2026)
            self.assertEqual(digest(a), digest(b))

    def test_different_seed_changes_data_but_remains_valid(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            generate(a, 2026, 2026)
            generate(b, 77, 2026)
            self.assertNotEqual(digest(a), digest(b))
            validate(project(Path(b)), 2026)

    def test_year_option_changes_year_and_is_valid(self):
        with tempfile.TemporaryDirectory() as tmp:
            generate(tmp, 123, 2028)
            validate(project(Path(tmp)), 2028)

    def test_scaled_data_preserves_all_26_tables_and_shared_masters(self):
        for factor in (2, 5):
            with self.subTest(scale=factor), tempfile.TemporaryDirectory() as tmp:
                generate(tmp, scale=factor)
                projected = project(Path(tmp))
                validate(projected, 2026, factor)
                actual = {name: len(rows) for name, rows in projected.tables.items()}
                self.assertEqual(actual, expected_counts(factor))
                self.assertEqual(len(projected.tables["branch"]), 3)
                self.assertEqual(len(projected.tables["patient"]), 30 * factor)
                self.assertEqual(len(projected.tables["appointment"]), 36 * factor)
                self.assertEqual(len(projected.tables["pharmacy_inventory"]), 24)

    def test_scaled_data_is_deterministic_with_same_seed(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            generate(a, seed=74, year=2027, scale=3)
            generate(b, seed=74, year=2027, scale=3)
            self.assertEqual(digest(a), digest(b))
            validate(project(Path(a)), 2027, 3)

    def test_scale_zero_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            proc = subprocess.run([sys.executable, str(ROOT / "generate_raw_hms.py"),
                                   "--output", tmp, "--scale", "0"],
                                  capture_output=True, text=True)
            self.assertNotEqual(proc.returncode, 0)
            self.assertIn("--scale must be between 1 and 1000", proc.stderr)

    def test_2020_through_2026_has_revenue_appointments_and_rx_each_year(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = generate_range(tmp, 2020, 2026)
            self.assertIn("Years: 2020–2026", result.stdout)
            p = project(Path(tmp))
            yearly_paid = validate(p, 2026, 1, 2020)
            all_years = set(range(2020, 2027))
            self.assertEqual(set(yearly_paid), all_years)
            self.assertTrue(all(yearly_paid[y] > 0 for y in all_years))
            for relation, key in (("appointment", "date"),
                                  ("prescription", "date"), ("bill", "date")):
                self.assertEqual({row[key].year for row in p.tables[relation].values()},
                                 all_years)
            self.assertTrue(any(a["status"] == "confirmed"
                                for a in p.tables["appointment"].values()))
            self.assertEqual(sum(x["status"] == "completed"
                                 for x in p.tables["ot_schedule"].values()), 6)
            self.assertEqual(sum(x["status"] == "scheduled"
                                 for x in p.tables["ot_schedule"].values()), 3)

    def test_range_scales_to_five_cohorts_with_all_relations_intact(self):
        with tempfile.TemporaryDirectory() as tmp:
            generate_range(tmp, 2020, 2026, seed=777, scale=5)
            p = project(Path(tmp))
            validate(p, 2026, 5, 2020)
            self.assertEqual({name: len(rows) for name, rows in p.tables.items()},
                             expected_counts(5))

    def test_range_is_repeatable(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            generate_range(a, 2018, 2026, seed=73, scale=3)
            generate_range(b, 2018, 2026, seed=73, scale=3)
            self.assertEqual(digest(a), digest(b))
            validate(project(Path(a)), 2026, 3, 2018)

    def test_single_year_range_is_valid(self):
        with tempfile.TemporaryDirectory() as tmp:
            generate_range(tmp, 2026, 2026)
            p = project(Path(tmp))
            self.assertGreater(validate(p, 2026, 1, 2026)[2026], 0)
            self.assertEqual({x["date"].year for x in p.tables["appointment"].values()},
                             {2026})

    def test_eighteen_year_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            generate_range(tmp, 2020, 2037)
            paid = validate(project(Path(tmp)), 2037, 1, 2020)
            self.assertEqual(len(paid), 18)

    def test_missing_reversed_overlong_and_mixed_year_flags_fail(self):
        cases = [(["--start-year", "2020"], "must be supplied together"),
                 (["--end-year", "2026"], "must be supplied together"),
                 (["--start-year", "2027", "--end-year", "2026"], "Require 2000"),
                 (["--start-year", "2000", "--end-year", "2026"], "at most 18 years"),
                 (["--year", "2026", "--start-year", "2020", "--end-year", "2026"],
                  "either --year OR")]
        for arguments, error in cases:
            with self.subTest(arguments=arguments), tempfile.TemporaryDirectory() as tmp:
                proc = subprocess.run([sys.executable, str(ROOT / "generate_raw_hms.py"),
                                       "--output", tmp, *arguments],
                                      capture_output=True, text=True)
                self.assertNotEqual(proc.returncode, 0)
                self.assertIn(error, proc.stderr)

    def test_validator_detects_wrong_year_window(self):
        with tempfile.TemporaryDirectory() as tmp:
            generate_range(tmp, 2020, 2026)
            with self.assertRaisesRegex(ValueError, "outside 2025–2026"):
                validate(project(Path(tmp)), 2026, 1)  # Incorrect legacy flags

    def test_broken_reference_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            generate(tmp)
            file = Path(tmp) / "09_surgery_register.csv"
            with file.open(newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                rows = list(reader); headers = reader.fieldnames
            rows[0]["nurse_id"] = "99999"  # Not present in employee roster.
            with file.open("w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=headers); w.writeheader(); w.writerows(rows)
            with self.assertRaisesRegex(ValueError, "foreign-key reference"):
                project(Path(tmp))

    def test_fractional_stock_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            generate(tmp)
            file = Path(tmp) / "07_pharmacy_stock.csv"
            with file.open(newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                rows = list(reader); headers = reader.fieldnames
            first = rows[0]["stock_items"].split("|")
            components = first[0].split("~")
            components[2] = "2.5"  # Invalid INTEGER stock_quantity.
            first[0] = "~".join(components)
            rows[0]["stock_items"] = "|".join(first)
            with file.open("w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=headers); w.writeheader(); w.writerows(rows)
            with self.assertRaisesRegex(ValueError, "whole number"):
                project(Path(tmp))

    def test_duplicate_patient_id_with_different_identity_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            generate(tmp)
            file = Path(tmp) / "02_patient_visits.csv"
            with file.open(newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                rows = list(reader); headers = reader.fieldnames
            idx = next(i for i,r in enumerate(rows) if i > 0 and r["patient_id"] == "1001")
            rows[idx]["patient_name"] = "Completely Different Identity"
            with file.open("w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=headers); w.writeheader(); w.writerows(rows)
            with self.assertRaisesRegex(ValueError, "Functional dependency conflict"):
                project(Path(tmp))


if __name__ == "__main__":
    unittest.main()

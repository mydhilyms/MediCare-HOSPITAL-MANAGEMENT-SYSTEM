# DATA
## Stuff
   ```powershell
   psql -h localhost -U postgres -d postgres -c "CREATE DATABASE hms;"
   psql -h localhost -U postgres -d hms -v ON_ERROR_STOP=1 -f sql/SCHEMA.sql
   psql -h localhost -U postgres -d hms -v ON_ERROR_STOP=1 -f sql/ADDITIONAL.sql

   py -m pip install -r requirements.txt
   
   python generate.py --start-year 2020 --end-year 2026 --scale 10 --output raw_csv
   python validate.py --start-year 2020 --end-year 2026 --scale 10 --input raw_csv
   python normalize.py --input raw_csv --evidence evidence
   python normalize.py --input raw_csv --db hms --user postgres --apply
   ```

   ```sql
   SELECT COUNT(*) FROM staging.patient_visits;  -- 36 raw visit rows
   SELECT COUNT(*) FROM hms.patient;              -- 30 distinct patients
   SELECT COUNT(*) FROM hms.appointment;          -- 36 visits
   SELECT COUNT(*) FROM hms.prescription_detail;  -- 30 atomic prescription lines
   SELECT COUNT(*) FROM hms.doctor_shift;         -- 33 valid shifts
   SELECT COUNT(*) FROM hms.salary_shift_log;     -- 18 payroll links

   SELECT EXTRACT(YEAR FROM a.appointment_date)::int AS year, COUNT(*) AS total
   FROM hms.appointment a GROUP BY 1 ORDER BY 1;

   SELECT EXTRACT(YEAR FROM b.bill_date)::int AS year, SUM(b.amount) AS paid_revenue
   FROM hms.bill b WHERE b.payment_status='paid'
   GROUP BY 1 ORDER BY 1;

   SELECT a.appointment_id,p.name AS patient,d.name AS doctor,br.location,
          a.appointment_date,a.status
   FROM hms.appointment a
   JOIN hms.patient p USING (patient_id)
   JOIN hms.doctor d USING (doctor_id)
   JOIN hms.branch br USING (branch_id)
   ORDER BY a.appointment_date LIMIT 12;
   ```
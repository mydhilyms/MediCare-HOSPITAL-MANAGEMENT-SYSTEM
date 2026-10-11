import argparse, collections, csv, datetime as dt, decimal, getpass, os, re, sys
from pathlib import Path

SOURCE = {
  'hospital_roster':'01_hospital_roster.csv', 'patient_visits':'02_patient_visits.csv',
  'employee_roster':'03_employee_roster.csv', 'care_register':'04_care_register.csv',
  'ward_register':'05_ward_register.csv','prescription_register':'06_prescription_register.csv',
  'pharmacy_stock':'07_pharmacy_stock.csv','lab_register':'08_lab_register.csv',
  'surgery_register':'09_surgery_register.csv','equipment_register':'10_equipment_register.csv',
  'billing_register':'11_billing_register.csv','payroll_register':'12_payroll_register.csv'}
ORDER = ['branch','department','doctor','patient','nurse','staff','medicine','pharmacy','pay_structure',
 'room','operation_theatre','equipment','doctor_shift','appointment','nurse_assignment',
 'staff_assignment','admission','prescription','prescription_detail','pharmacy_inventory',
 'lab_result','ot_schedule','bill','shift_log','salary','salary_shift_log']
PK = {'branch':'branch_id','department':'department_id','doctor':'doctor_id','patient':'patient_id',
'nurse':'nurse_id','staff':'staff_id','medicine':'medicine_id','pharmacy':'pharmacy_id',
'pay_structure':'pay_structure_id','room':('branch_id','room_no'),
'operation_theatre':'ot_id','equipment':'equipment_id',
'doctor_shift':('doctor_id','branch_id','shift_start'),'appointment':'appointment_id',
'nurse_assignment':('nurse_id','patient_id','assignment_date'),
'staff_assignment':('staff_id','patient_id','assignment_date'),
'admission':'admission_id','prescription':'prescription_id',
'prescription_detail':('prescription_id','medicine_id'),
'pharmacy_inventory':('pharmacy_id','medicine_id'),'lab_result':'lab_result_id',
'ot_schedule':'ot_schedule_id','bill':'bill_id','shift_log':'shift_log_id',
'salary':'salary_id','salary_shift_log':('salary_id','shift_log_id')}

def clean(s): return str(s or '').strip()
def norm(s): return ' '.join(clean(s).split())
def title(s): return norm(s).title()
def status(s): return clean(s).lower()
def as_int(s):
 s=clean(s)
 if not re.fullmatch(r'[0-9]+',s): raise ValueError('Expected non-negative integer, got '+repr(s))
 return int(s)
def money(s): return decimal.Decimal(clean(s))
def boolean(s):
 if status(s) in ('yes','true','1'): return True
 if status(s) in ('no','false','0'): return False
 raise ValueError('Unexpected boolean '+repr(s))
def date(s): return dt.date.fromisoformat(clean(s)) if clean(s) else None
def moment(s): return dt.datetime.fromisoformat(clean(s)) if clean(s) else None
def time(s): return dt.time.fromisoformat(clean(s)) if clean(s) else None
def cell_list(s): return [x.strip() for x in clean(s).split('|') if x.strip()]

def read_csvs(folder):
 data={}
 for logical, filename in SOURCE.items():
  with (folder/filename).open('r',encoding='utf-8-sig',newline='') as f: data[logical]=list(csv.DictReader(f))
 return data

def transform(raw):
 """One-to-many splits establish atomic 1NF rows. Grouping by documented
 candidate keys removes partial and transitive dependencies (2NF/3NF/BCNF).
 Conflicting values for a key are REJECTED, not guessed.
 """
 result={table:{} for table in ORDER}
 def add(table, row):
  pk=PK[table]; key=tuple(row[k] for k in (pk if isinstance(pk,tuple) else (pk,)))
  existing=result[table].get(key)
  if existing is not None and existing!=row:
   raise ValueError(f'Conflicting {table} record for candidate key {key}: {existing} <> {row}')
  result[table][key]=row
 def branch(id_,location,state): add('branch',dict(branch_id=as_int(id_),location=title(location),status=status(state)))
 def medicine(id_,name): add('medicine',dict(medicine_id=as_int(id_),name=norm(name)))
 for x in raw['hospital_roster']:
  branch(x['department_branch_id'],x['department_branch_location'],x['department_branch_status'])
  branch(x['shift_branch_id'],x['shift_branch_location'],x['shift_branch_status'])
  add('department',dict(department_id=as_int(x['department_id']),department_name=title(x['department_name']),branch_id=as_int(x['department_branch_id']),status=status(x['department_status'])))
  add('doctor',dict(doctor_id=as_int(x['doctor_id']),name=title(x['doctor_name']),specialization=title(x['specialization']),phone=norm(x['doctor_phone']),department_id=as_int(x['department_id'])))
  add('doctor_shift',dict(doctor_id=as_int(x['doctor_id']),branch_id=as_int(x['shift_branch_id']),shift_start=moment(x['shift_start']),shift_end=moment(x['shift_end'])))
 for x in raw['patient_visits']:
  address=[norm(v) for v in x['patient_full_address'].split('|')]
  if len(address)!=4: raise ValueError(f'Patient {x["patient_id"]}: expected street|city|state|PIN address')
  add('patient',dict(patient_id=as_int(x['patient_id']),name=title(x['patient_name']),dob=date(x['dob']),gender=title(x['gender']),street=title(address[0]),city=title(address[1]),state=title(address[2]),pin_code=address[3],phone=norm(x['patient_phone'])))
  add('appointment',dict(appointment_id=as_int(x['appointment_id']),patient_id=as_int(x['patient_id']),doctor_id=as_int(x['doctor_id']),branch_id=as_int(x['branch_id']),appointment_date=date(x['appointment_date']),appointment_time=time(x['appointment_time']),token_no=as_int(x['token_no']),status=status(x['appointment_status'])))
 for x in raw['employee_roster']:
  k=status(x['employee_kind']); base=dict(name=title(x['employee_name']),shift=title(x['shift_label']),branch_id=as_int(x['branch_id']))
  if k=='nurse': add('nurse',dict(nurse_id=as_int(x['employee_id']),**base))
  elif k=='staff': add('staff',dict(staff_id=as_int(x['employee_id']),role=title(x['role']),**base))
  else: raise ValueError(f'Unknown employee_kind {k}')
 for x in raw['care_register']:
  for item in cell_list(x['nurses_list']):
   nurse_id,*rest=item.split('~')
   add('nurse_assignment',dict(nurse_id=as_int(nurse_id),patient_id=as_int(x['patient_id']),assignment_date=date(x['assignment_date'])))
  for item in cell_list(x['staff_list']):
   staff_id,*rest=item.split('~')
   add('staff_assignment',dict(staff_id=as_int(staff_id),patient_id=as_int(x['patient_id']),assignment_date=date(x['assignment_date'])))
 for x in raw['ward_register']:
  bid=as_int(x['branch_id']); num=norm(x['room_no'])
  add('room',dict(branch_id=bid,room_no=num,room_type=status(x['room_type']),critical_care_monitoring=boolean(x['critical_care_monitoring']),availability_status=status(x['availability_status'])))
  for item in cell_list(x['admission_history']):
   bits=item.split('~')
   if len(bits)!=5: raise ValueError('Bad admission '+item)
   aid,pid,_,start,end=bits
   add('admission',dict(admission_id=as_int(aid),patient_id=as_int(pid),branch_id=bid,room_no=num,admit_date_time=moment(start),discharge_date_time=moment(end)))
 for x in raw['prescription_register']:
  rid=as_int(x['prescription_id'])
  add('prescription',dict(prescription_id=rid,doctor_id=as_int(x['doctor_id']),patient_id=as_int(x['patient_id']),prescription_date=date(x['prescription_date'])))
  for item in cell_list(x['medicines_list']):
   bits=item.split('~')
   if len(bits)!=4: raise ValueError('Bad medicine '+item)
   mid,name,dosage,qty=bits; medicine(mid,name)
   add('prescription_detail',dict(prescription_id=rid,medicine_id=as_int(mid),dosage=norm(dosage),quantity=as_int(qty)))
 for x in raw['pharmacy_stock']:
  phid=as_int(x['pharmacy_id'])
  add('pharmacy',dict(pharmacy_id=phid,branch_id=as_int(x['branch_id'])))
  for item in cell_list(x['stock_items']):
   bits=item.split('~')
   if len(bits)!=5: raise ValueError('Bad inventory item '+item)
   mid,name,qty,price,reorder=bits; medicine(mid,name)
   add('pharmacy_inventory',dict(pharmacy_id=phid,medicine_id=as_int(mid),stock_quantity=as_int(qty),price=money(price),reorder_level=as_int(reorder)))
 for x in raw['lab_register']:
  add('lab_result',dict(lab_result_id=as_int(x['lab_result_id']),patient_id=as_int(x['patient_id']),test_type=title(x['test_type']),order_date=date(x['order_date']),result_date=date(x['result_date']),result_details=norm(x['result_details']) or None))
 for x in raw['surgery_register']:
  add('operation_theatre',dict(ot_id=as_int(x['ot_id']),branch_id=as_int(x['ot_branch_id']),status=status(x['ot_current_status'])))
  add('ot_schedule',dict(ot_schedule_id=as_int(x['ot_schedule_id']),ot_id=as_int(x['ot_id']),patient_id=as_int(x['patient_id']),doctor_id=as_int(x['doctor_id']),nurse_id=as_int(x['nurse_id']),procedure=norm(x['procedure']),schedule_start=moment(x['schedule_start']),schedule_end=moment(x['schedule_end']),status=status(x['operation_status'])))
 for x in raw['equipment_register']:
  add('equipment',dict(equipment_id=as_int(x['equipment_id']),branch_id=as_int(x['branch_id']),name=title(x['equipment_name']),location=title(x['equipment_location']),maintenance_date=date(x['maintenance_date']),status=status(x['equipment_status'])))
 for x in raw['billing_register']:
  add('bill',dict(bill_id=as_int(x['bill_id']),appointment_id=as_int(x['appointment_id']),branch_id=as_int(x['branch_id']),amount=money(x['bill_amount']),bill_date=date(x['bill_date']),payment_status=status(x['payment_status']),ot_schedule_id=as_int(x['ot_schedule_reference']) if clean(x['ot_schedule_reference']) else None))
 for x in raw['payroll_register']:
  kind=status(x['employee_kind']); emp=as_int(x['employee_id']); sid=as_int(x['salary_id']); psid=as_int(x['pay_structure_id']); branch_id=as_int(x['branch_id'])
  emp_type={'doctor':'doctor_id','nurse':'nurse_id','staff':'staff_id'}.get(kind)
  if emp_type is None: raise ValueError(f'Unsupported payroll employee type {kind}')
  add('pay_structure',dict(pay_structure_id=psid,employee_type=kind,base_pay=money(x['base_pay']),allowance_rate=money(x['allowance_rate']),status=status(x['pay_structure_status'])))
  add('salary',dict(salary_id=sid,branch_id=branch_id,doctor_id=emp if kind=='doctor' else None,nurse_id=emp if kind=='nurse' else None,staff_id=emp if kind=='staff' else None,pay_structure_id=psid,pay_month=date(x['pay_month']),base_pay_applied=money(x['base_pay_applied']),allowance_applied=money(x['allowance_applied']),salary_amount=money(x['salary_amount'])))
  for item in cell_list(x['duty_logs_list']):
   bits=item.split('~')
   if len(bits)!=5: raise ValueError('Bad shift log '+item)
   lid,day,start,end,state=bits
   add('shift_log',dict(shift_log_id=as_int(lid),branch_id=branch_id,doctor_id=emp if kind=='doctor' else None,nurse_id=emp if kind=='nurse' else None,staff_id=emp if kind=='staff' else None,shift_date=date(day),start_time=time(start),end_time=time(end),status=status(state)))
  for lid in cell_list(x['paid_shift_log_ids']): add('salary_shift_log',dict(salary_id=sid,shift_log_id=as_int(lid)))
 return result

def checks(result):
 def exists(table, key):
  if not (key if isinstance(key,tuple) else (key,)) in result[table]:
   raise ValueError(f'Missing FK {table} {key}')
 for table,columns in {
  'department':[('branch_id','branch')], 'doctor':[('department_id','department')],
  'doctor_shift':[('doctor_id','doctor'),('branch_id','branch')],
  'appointment':[('patient_id','patient'),('doctor_id','doctor'),('branch_id','branch')],
  'nurse':[('branch_id','branch')],'staff':[('branch_id','branch')],
  'nurse_assignment':[('nurse_id','nurse'),('patient_id','patient')],
  'staff_assignment':[('staff_id','staff'),('patient_id','patient')],
  'room':[('branch_id','branch')],
  'admission':[('patient_id','patient')],
  'prescription':[('patient_id','patient'),('doctor_id','doctor')],
  'prescription_detail':[('prescription_id','prescription'),('medicine_id','medicine')],
  'pharmacy':[('branch_id','branch')],
  'pharmacy_inventory':[('pharmacy_id','pharmacy'),('medicine_id','medicine')],
  'lab_result':[('patient_id','patient')],
  'operation_theatre':[('branch_id','branch')],
  'ot_schedule':[('ot_id','operation_theatre'),('patient_id','patient'),('doctor_id','doctor'),('nurse_id','nurse')],
  'equipment':[('branch_id','branch')],
  'bill':[('appointment_id','appointment'),('branch_id','branch')],
  'shift_log':[('branch_id','branch')],
  'salary':[('branch_id','branch'),('pay_structure_id','pay_structure')],
  'salary_shift_log':[('salary_id','salary'),('shift_log_id','shift_log')],
 }.items():
  for row in result[table].values():
   for key,parent in columns: exists(parent,row[key])
 for row in result['admission'].values(): exists('room',(row['branch_id'],row['room_no']))
 for row in result['ot_schedule'].values():
  ot=result['operation_theatre'][(row['ot_id'],)]
  nurse=result['nurse'][(row['nurse_id'],)]
  if ot['branch_id']!=nurse['branch_id']: raise ValueError('OT nurse branch conflict')
 for row in result['bill'].values():
  ap=result['appointment'][(row['appointment_id'],)]
  if ap['branch_id']!=row['branch_id']: raise ValueError('Bill branch mismatch')
  if row['ot_schedule_id'] is not None:
   exists('ot_schedule',row['ot_schedule_id'])
   op=result['ot_schedule'][(row['ot_schedule_id'],)]
   if op['status']!='completed' or ap['patient_id']!=op['patient_id'] or ap['doctor_id']!=op['doctor_id']:
    raise ValueError('Bill operation mismatch/not completed')
 for row in result['salary_shift_log'].values():
  s=result['salary'][(row['salary_id'],)]; l=result['shift_log'][(row['shift_log_id'],)]
  if any(s[k]!=l[k] for k in ('branch_id','doctor_id','nurse_id','staff_id')) or l['status']!='completed' or l['shift_date'].replace(day=1)!=s['pay_month']:
   raise ValueError('Salary shift must match completed shift and month')
 for row in result['appointment'].values():
  if row['status'] not in ('pending','confirmed'): continue
  instant=dt.datetime.combine(row['appointment_date'],row['appointment_time'])
  matches=[s for s in result['doctor_shift'].values() if s['doctor_id']==row['doctor_id'] and s['branch_id']==row['branch_id'] and s['shift_start']<=instant and s['shift_end']>=instant+dt.timedelta(minutes=30)]
  if not matches: raise ValueError(f'Appointment {row["appointment_id"]} outside doctor shift')
 for row in result['salary'].values():
  ps=result['pay_structure'][(row['pay_structure_id'],)]
  etype=next(k for k in ('doctor','nurse','staff') if row[k+'_id'] is not None)
  if ps['employee_type']!=etype: raise ValueError('Wrong salary employee type')
  exists(etype,row[etype+'_id'])
 for row in result['shift_log'].values():
  for etype in ('doctor','nurse','staff'):
   if row[etype+'_id'] is not None: exists(etype,row[etype+'_id'])


def export_evidence(raw, result, folder):
 """Demonstration outputs for the appointment + medicine slice; the 26
 actual final tables are also exported as normalized CSVs for inspection.
 """
 folder.mkdir(parents=True,exist_ok=True)
 def write(name,records):
  if not records: return
  cols=list(records[0]); path=folder/(name+'.csv')
  with path.open('w',encoding='utf-8',newline='') as stream:
   w=csv.DictWriter(stream,fieldnames=cols);w.writeheader();w.writerows(records)
 visits={int(r['appointment_id']):r for r in raw['patient_visits']}
 raw_join=[]; nf1=[]
 for r in raw['prescription_register']:
  visit=visits[int(r['appointment_reference'])]
  # An intentionally denormalized *teaching slice*, not a full source register.
  outer={'appointment_id':visit['appointment_id'],'patient_id':visit['patient_id'],
   'patient_name':title(visit['patient_name']),'branch_id':visit['branch_id'],
   'branch_location':title(visit['branch_location']),'doctor_id':visit['doctor_id'],
   'doctor_name':title(visit['doctor_name']),'appointment_date':visit['appointment_date']}
  raw_join.append(dict(outer,medicines_list=r['medicines_list']))
  for item in cell_list(r['medicines_list']):
   mid,mname,dosage,qty=item.split('~')
   nf1.append(dict(outer,medicine_id=int(mid),medicine_name=mname,dosage=dosage,quantity=int(qty)))
 write('demo_0_unnormalized',raw_join)
 write('demo_1nf_atomic_visit_medicine',nf1)
 write('demo_2nf_visits',list({r['appointment_id']:dict((k,v) for k,v in r.items() if k not in ('medicine_id','medicine_name','dosage','quantity')) for r in nf1}.values()))
 write('demo_2nf_medicine',list({r['medicine_id']:{'medicine_id':r['medicine_id'],'medicine_name':r['medicine_name']} for r in nf1}.values()))
 write('demo_2nf_visit_medicine',[{'appointment_id':r['appointment_id'],'medicine_id':r['medicine_id'],'dosage':r['dosage'],'quantity':r['quantity']} for r in nf1])
 for table in ORDER:
  write('final_'+table,list(result[table].values()))
 print('Wrote normalization evidence and final relational CSV exports to',folder)


def load_database(raw,result,args):
 try: import psycopg2
 except ImportError: raise SystemExit('Install driver: py -m pip install "psycopg2-binary>=2.9,<3"')
 from psycopg2 import sql
 from psycopg2.extras import execute_values
 params=dict(host=args.host,port=args.port,dbname=args.db,user=args.user,
             password=os.getenv('HMS_DB_PASSWORD') or getpass.getpass('PostgreSQL password: '),connect_timeout=10)
 connection=psycopg2.connect(**params)
 try:
  with connection:
   with connection.cursor() as cur:
    cur.execute('SELECT to_regclass(%s)',('hms.branch',))
    if cur.fetchone()[0] is None: raise ValueError('HMS schema missing. Create an EMPTY database and run HMS_01_final_BCNF_schema.sql and backend/modify.sql first.')
    for t in ORDER:
     cur.execute(sql.SQL('SELECT EXISTS (SELECT 1 FROM {}.{} LIMIT 1)').format(sql.Identifier('hms'),sql.Identifier(t)))
     if cur.fetchone()[0]: raise ValueError('Refusing to load because hms.'+t+' is already populated. Use a NEW database.')
    cur.execute('CREATE SCHEMA IF NOT EXISTS staging')
    for name,rows in raw.items():
     headers=list(rows[0]) if rows else []
     if not headers: raise ValueError('Empty raw register '+name)
     cur.execute(sql.SQL('CREATE TABLE IF NOT EXISTS {}.{} ({} )').format(sql.Identifier('staging'),sql.Identifier(name),sql.SQL(', ').join(sql.SQL('{} TEXT').format(sql.Identifier(h)) for h in headers)))
     cur.execute(sql.SQL('SELECT EXISTS (SELECT 1 FROM {}.{} LIMIT 1)').format(sql.Identifier('staging'),sql.Identifier(name)))
     if cur.fetchone()[0]: raise ValueError('Staging table already populated: '+name)
     execute_values(cur,sql.SQL('INSERT INTO {}.{} ({}) VALUES %s').format(sql.Identifier('staging'),sql.Identifier(name),sql.SQL(',').join(map(sql.Identifier,headers))).as_string(connection),[tuple(r[h] for h in headers) for r in rows],page_size=500)
    for table in ORDER:
     rows=list(result[table].values())
     if not rows: continue
     cols=list(rows[0])
     query=sql.SQL('INSERT INTO {}.{} ({}) VALUES %s').format(sql.Identifier('hms'),sql.Identifier(table),sql.SQL(',').join(map(sql.Identifier,cols))).as_string(connection)
     execute_values(cur,query,[tuple(r[col] for col in cols) for r in rows],page_size=500)
    # Explicit identity values do not advance PostgreSQL IDENTITY sequences.
    for table in ORDER:
     pk=PK[table]
     if isinstance(pk,tuple): continue
     cur.execute('SELECT pg_get_serial_sequence(%s,%s)',(f'hms.{table}',pk))
     seq=cur.fetchone()[0]
     if seq:
      cur.execute(sql.SQL('SELECT setval(%s::regclass, COALESCE((SELECT MAX({}) FROM {}.{}),1),true)').format(sql.Identifier(pk),sql.Identifier('hms'),sql.Identifier(table)),(seq,))
    print('PostgreSQL transaction committed: staging and 26 normalized tables populated.')
 finally: connection.close()

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--input',type=Path,default=Path('raw_csv'))
 parser.add_argument('--apply',action='store_true',help='Write to PostgreSQL. Default: preview only.')
 parser.add_argument('--evidence',type=Path,default=None,help='Export 1NF/2NF examples and all 26 normalized table CSVs')
 parser.add_argument('--host',default='localhost'); parser.add_argument('--port',type=int,default=5432)
 parser.add_argument('--db',default=os.getenv('HMS_DB_NAME','hms_demo'))
 parser.add_argument('--user',default=os.getenv('HMS_DB_USER','postgres'))
 args=parser.parse_args()
 raw=read_csvs(args.input)
 result=transform(raw);checks(result)
 if args.evidence: export_evidence(raw,result,args.evidence)
 print('RAW CSV ROWS:',sum(map(len,raw.values())),'| distinct relation types:',len(result))
 for table in ORDER: print(f'  {table:22} {len(result[table]):>6}')
 if args.apply: load_database(raw,result,args)
 else: print('DRY RUN ONLY: no database accessed. Add --apply to stage/load into a fresh initialized database.')
if __name__=='__main__':
 try: main()
 except (ValueError,KeyError,FileNotFoundError) as exc:
  print('IMPORT STOPPED:',exc,file=sys.stderr);sys.exit(1)

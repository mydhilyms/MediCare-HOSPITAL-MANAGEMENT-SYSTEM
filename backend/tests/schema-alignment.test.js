/* Dependency-free tests for the DBMS design-alignment fixes.
 * These mock the database; PostgreSQL integration remains a separate step.
 * Run: node --test backend/tests/*.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const controller = (filename, db) => {
  const file = path.resolve(__dirname, '..', 'src', 'controllers', filename);
  const module = {exports:{}};
  const responses = {
    sendSuccess:(res,status,payload)=>Object.assign(res,{statusCode:status,data:payload}),
    sendError:(res,status,message)=>Object.assign(res,{statusCode:status,message})
  };
  vm.runInNewContext(fs.readFileSync(file,'utf8'), {
    module,exports:module.exports,
    require:(key)=>key==='../config/db'?db:key==='../utils/response'?responses:require(key),
    Date,Number,String,Array,Object,Promise,Error,RegExp
  }, {filename:file});
  return module.exports;
};
const req=(body={},params={},query={})=>({body,params,query});
async function call(fn,request) {
  const res={};let caught;
  await fn(request,res,e=>{caught=e;});
  if(caught)throw caught;
  return res;
}

test('Nurse list retrieves real nurse.shift and branch, not imaginary phone/email/department/status',async()=>{
  let sql='';
  const db={query:async q=>{sql=q;return {rows:[{nurse_id:390,name:'CMChaman Mall',shift:'Night',branch_id:100,branch_location:'Kochi Main Hospital'}]};}};
  const res=await call(controller('catalogController.js',db).getNurses,req());
  assert.equal(res.statusCode,200);
  assert.match(sql,/SELECT n\.\*/);
  assert.match(sql,/b\.branch_id = n\.branch_id/);
  assert.doesNotMatch(sql,/'General'\s+AS\s+department_name/i);
  assert.doesNotMatch(sql,/'active'\s+AS\s+status/i);
  assert.equal(res.data.nurses[0].shift,'Night');
});

test('Create Nurse persists only documented name/shift/branch columns',async()=>{
  let values;
  const db={query:async (sql,p)=>{assert.match(sql,/INSERT INTO nurse \(branch_id, name, shift\)/);values=[...p];return {rows:[{nurse_id:390,branch_id:100,name:'Nurse One',shift:'Evening'}]};}};
  const res=await call(controller('catalogController.js',db).createNurse,req({branchId:100,name:' Nurse One ',shift:'Evening',email:'not-stored@example.com'}));
  assert.equal(res.statusCode,201);
  assert.deepEqual(values,[100,'Nurse One','Evening']);
});

test('Create Nurse rejects missing branch without issuing SQL',async()=>{
  const fn=controller('catalogController.js',{query:async()=>{throw Error('DB must not be queried');}}).createNurse;
  for(const body of [{name:'Nurse One'},{name:'Nurse One',branchId:'A'},{name:'Nurse One',branchId:0}]){
    assert.equal((await call(fn,req(body))).statusCode,400);
  }
});

test('Nurse update persists shift and branch and does not invent email',async()=>{
  const queries=[];
  const db={query:async(q,p)=>{queries.push({q,p:[...p]});return /SELECT 1 FROM ot_schedule/.test(q)?{rows:[]}:{rows:[{nurse_id:390,branch_id:102,name:'New name',shift:'Day'}]};}};
  const res=await call(controller('catalogController.js',db).updateNurse,req({name:'New name',branchId:102,shift:'Day'}, {id:'390'}));
  assert.equal(res.statusCode,200);
  assert.match(queries[1].q,/UPDATE nurse SET name = \$1, shift = \$2, branch_id = \$3/);
  assert.deepEqual(queries[1].p,['New name','Day',102,390]);
});

test('Nurse transfer is blocked if existing OT schedules are in another branch',async()=>{
  let count=0;
  const db={query:async()=>{count++;return {rows:[{exists:1}]};}};
  const res=await call(controller('catalogController.js',db).updateNurse,req({name:'Nurse One',branchId:101}, {id:'390'}));
  assert.equal(res.statusCode,409);assert.equal(count,1);
});

test('OT creation requires a nurse ID; no automatic assignment of a random nurse',async()=>{
  const db={query:async()=>{throw Error('Should not insert without nurse');}};
  const fn=controller('otController.js',db).createOtSchedule;
  const body={theatreId:10,doctorId:20,patientId:30,scheduledDate:'2026-10-11',startTime:'12:00',endTime:'13:00'};
  const res=await call(fn,req(body));assert.equal(res.statusCode,400);
});

test('OT creation inserts explicitly selected doctor, patient, nurse and theatre',async()=>{
  let params;
  const db={query:async(q,p)=>{assert.match(q,/INSERT INTO ot_schedule \(ot_id, patient_id, doctor_id, nurse_id/);params=[...p];return {rows:[{ot_schedule_id:1}]};}};
  const res=await call(controller('otController.js',db).createOtSchedule,req({theatreId:10,patientId:30,doctorId:20,nurseId:40,scheduledDate:'2026-10-11',startTime:'12:00',endTime:'13:00'}));
  assert.equal(res.statusCode,201);
  assert.deepEqual(params.slice(0,4),[10,30,20,40]);
});

test('Lab creation persists original LabResult fields, not unsupported doctor/normal-range',async()=>{
  let sql,params;
  const db={query:async (q,p)=>{sql=q;params=[...p];return {rows:[{lab_result_id:22}]};}};
  const res=await call(controller('labResultsController.js',db).createLabResult,req({patientId:101,testType:'CBC',orderDate:'2026-09-01',resultDate:'2026-09-02',resultDetails:'Normal'}));
  assert.equal(res.statusCode,201);
  assert.match(sql,/INSERT INTO lab_result \(patient_id, test_type, order_date, result_date, result_details\)/);
  assert.deepEqual(params,[101,'CBC','2026-09-01','2026-09-02','Normal']);
});

test('Room mappings use branch + room composite identity, never a fabricated capacity',async()=>{
  const db={query:async()=>({rows:[{branch_id:100,room_no:'ICU_01',room_type:'icu',availability_status:'available',critical_care_monitoring:true,branch_location:'Main'}]})};
  const res=await call(controller('roomController.js',db).getRooms,req());
  assert.equal(res.statusCode,200);
  assert.equal(res.data.rooms[0].id,'100_ICU_01');
  assert.equal('capacity' in res.data.rooms[0],false);
});

test('Room composite IDs retain underscores in the room number on updates',async()=>{
  let params;
  const db={query:async(q,p)=>{params=[...p];return {rows:[{branch_id:100,room_no:'ICU_01',availability_status:'occupied'}]};}};
  const res=await call(controller('roomController.js',db).updateRoom,req({status:'occupied'},{id:'100_ICU_01'}));
  assert.equal(res.statusCode,200);
  assert.equal(params[3],'100');assert.equal(params[4],'ICU_01');
});

test('PayStructure rejects made-up role labels instead of coercing them to staff',async()=>{
  const fn=controller('catalogController.js',{query:async()=>{throw Error('Should not query DB');}}).createPayStructure;
  assert.equal((await call(fn,req({employeeType:'surgeon',basePay:50000}))).statusCode,400);
});

test('Salary query returns its real salary fields without invented paid/deductions flags',async()=>{
  let sql;
  const db={query:async q=>{sql=q;return {rows:[{salary_id:12,base_pay_applied:10000,allowance_applied:1000,salary_amount:11000}]};}};
  const res=await call(controller('catalogController.js',db).getSalaries,req());
  assert.equal(res.statusCode,200);
  assert.doesNotMatch(sql,/\bAS deductions\b|\bAS payment_status\b/i);
  assert.equal(res.data.salaries[0].salary_amount,11000);
});

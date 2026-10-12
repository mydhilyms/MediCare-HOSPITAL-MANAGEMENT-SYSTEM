/* Dependency-free controller contract tests.
   Run: node --test backend/tests/clinical-integrity.test.js from repository root.
   SQL result sets are mocked here; full database integration requires PostgreSQL. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function controller(name,db) {
  const filename=path.resolve(__dirname,`../src/controllers/${name}.js`);
  const module={exports:{}};
  const response={
    sendSuccess:(res,code,data)=>{res.statusCode=code;res.data=data;return res;},
    sendError:(res,code,message)=>{res.statusCode=code;res.message=message;return res;}
  };
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,
    require:(name)=> name==='../config/db'?db: name==='../utils/response'?response:require(name),
    Date,Number,String,Array,Object,Set,Error,RegExp,Promise}, {filename});
  return module.exports;
}
const makeReq=(body={},id='1',query={})=>({body,params:{id},query});
async function run(fn,req){
  const res={};let error=null;
  await fn(req,res,e=>{error=e;});
  if(error)throw error;
  return res;
}

test('doctor department filter queries using integer ID, not department name',async()=>{
  let invoked=false;
  const db={query:async(sql,params)=>{
    invoked=true;assert.match(sql,/d\.department_id = \$2/);
    assert.deepEqual([...params],[true,5]);return {rows:[]};
  }};
  const res=await run(controller('doctorController',db).getDoctors,makeReq({},'',{department:'5',status:'active'}));
  assert.equal(res.statusCode,200);assert.equal(invoked,true);
});

test('invalid or fractional department IDs are rejected',async()=>{
  const db={query:async()=>{throw Error('Must not reach database');}};
  for(const department of ['1.3','Cardiology','0']){
    const res=await run(controller('doctorController',db).getDoctors,makeReq({},'',{department}));
    assert.equal(res.statusCode,400);
  }
});

test('doctor updates persist the selected department and other edit fields',async()=>{
  let updated=null;
  const db={query:async(sql,params)=>{
    if(sql.startsWith('UPDATE doctor')){updated={sql,params:[...params]};return {rows:[{doctor_id:7}]};}
    return {rows:[{doctor_id:7,name:'Dr Patel',specialization:'Neurology',phone:'9000000000',department_id:2,department_name:'Neurology',branch_id:1,branch_location:'Main',is_active:true}]};
  }};
  const res=await run(controller('doctorController',db).updateDoctor,makeReq({name:'Dr Patel',specialization:'Neurology',phone:'9000000000',departmentId:2},'7'));
  assert.equal(res.statusCode,200);assert.match(updated.sql,/department_id = \$4/);assert.deepEqual(updated.params,['Dr Patel','Neurology','9000000000',2,7]);
});

test('doctor deletion safely archives, never hard-deletes referenced rows',async()=>{
  const db={query:async(sql,params)=>{assert.match(sql,/UPDATE doctor SET is_active = FALSE/);assert.doesNotMatch(sql,/DELETE FROM doctor/);assert.deepEqual([...params],[8]);return {rows:[{doctor_id:8}]};}};
  const res=await run(controller('doctorController',db).deleteDoctor,makeReq({},'8'));
  assert.equal(res.statusCode,200);assert.equal(res.data.archivedDoctorId,8);
});

test('patient update can clear a stored value without corrupting other fields',async()=>{
  let statement='',values;
  const db={query:async(sql,params)=>{statement=sql;values=[...params];return {rows:[{patient_id:3,name:'Jane Citizen',street:null,dob:'2000-04-10'}]};}};
  const res=await run(controller('patientController',db).updatePatient,makeReq({firstName:'Jane',lastName:'Citizen',street:'',dob:'2000-04-10'},'3'));
  assert.equal(res.statusCode,200);assert.match(statement,/street = \$3/);assert.deepEqual(values.slice(0,3),['Jane Citizen','2000-04-10',null]);
});

test('pharmacy updates reject fractional integer stock and thresholds',async()=>{
  const db={pool:{connect:()=>{throw Error('Should not open DB');}}};
  const fn=controller('medicineController',db).updateMedicine;
  assert.equal((await run(fn,makeReq({pharmacyId:2,stockQuantity:1.5},'12'))).statusCode,400);
  assert.equal((await run(fn,makeReq({pharmacyId:2,reorderLevel:2.1},'12'))).statusCode,400);
  assert.equal((await run(fn,makeReq({pharmacyId:2,unitPrice:1.234},'12'))).statusCode,400);
});

test('medicine update writes inventory to the explicit selected pharmacy',async()=>{
  const statements=[];let releases=0;
  const db={pool:{connect:async()=>({query:async(sql,params=[])=>{
    statements.push({sql,params:[...params]});
    if(/SELECT \* FROM medicine/.test(sql))return {rows:[{medicine_id:10,name:'Medicine'}]};
    if(/INSERT INTO pharmacy_inventory/.test(sql))return {rows:[{pharmacy_id:9,medicine_id:10,stock_quantity:22}]};
    return {rows:[]};
  },release:()=>releases++})}};
  const res=await run(controller('medicineController',db).updateMedicine,makeReq({pharmacyId:9,stockQuantity:22,unitPrice:'4.50',reorderLevel:10},'10'));
  assert.equal(res.statusCode,200);assert.equal(releases,1);
  const write=statements.find(x=>x.sql.includes('INSERT INTO pharmacy_inventory'));
  assert.deepEqual(write.params,[9,'10',22,'4.50',10]);
});

test('billing never fabricates a completed appointment',async()=>{
  const sql=[];
  const db={query:async(query,params)=>{sql.push(query);return {rows:[]};}};
  const res=await run(controller('billingController',db).createBill,makeReq({appointmentId:123,amount:'320.00',paymentStatus:'unpaid'}));
  assert.equal(res.statusCode,404);assert.equal(sql.length,1);assert.match(sql[0],/^SELECT appointment_id/);
});

test('billing rejects appointments not clinically marked complete',async()=>{
  const db={query:async(sql)=>{
    if(/SELECT appointment_id/.test(sql))return {rows:[{appointment_id:8,branch_id:2,status:'pending'}]};
    throw Error('Must not generate invoice');
  }};
  const res=await run(controller('billingController',db).createBill,makeReq({appointmentId:8,amount:'100.00',paymentStatus:'unpaid'}));
  assert.equal(res.statusCode,409);
});

test('prescriptions reject fractional, duplicate and missing dosage without DB writes',async()=>{
  const fn=controller('prescriptionController',{pool:{connect:()=>{throw Error('Should not connect');}}}).createPrescription;
  for(const medicines of [
    [{medicineId:10,dosage:'2 mg',quantity:2.4}],
    [{medicineId:10,dosage:'2 mg',quantity:2},{medicineId:10,dosage:'4 mg',quantity:1}],
    [{medicineId:10,dosage:'',quantity:2}]
  ]){
    const res=await run(fn,makeReq({patientId:1,doctorId:2,medicines}));
    assert.equal(res.statusCode,400);
  }
});

test('report year filter reaches SQL as a specific year parameter',async()=>{
  let input;
  const db={query:async(sql,args)=>{assert.match(sql,/generate_series\(make_date/);input=[...args];return {rows:[{month:'Jan',paid:'42.50',outstanding:'3',appointments:2,patients:1,admissions:0}]};}};
  const res=await run(controller('reportsController',db).getMonthlyTrends,makeReq({},'',{year:'2024'}));
  assert.equal(res.statusCode,200);assert.deepEqual(input,[2024]);assert.equal(res.data.year,2024);assert.equal(res.data.months[0].paid,42.5);
});

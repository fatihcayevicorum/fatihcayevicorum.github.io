"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../../personel-yonetimi/script.js"),"utf8");
test("earned wage deletes only a payment that actually exists",()=>{assert.ok(source.includes('else if(linkedPayment){batch.delete(doc(db,"adminPersonnelPayments",linkedPayment.id));batch.delete(doc(db,"adminCashMovements",linkedPayment.cashMovementId||linkedPayment.id))}'));assert.ok(source.includes("function findAttendancePayment("));assert.ok(!source.includes('}else{batch.delete(paymentRef);batch.delete(cashRef)}'))});
test("paid closed day cannot silently convert to earned",()=>{assert.ok(source.includes('wageAction==="earned"&&linkedPayment&&isFinanceLocked(linkedPayment.businessDate||item.date)'));assert.ok(source.includes("finans günü kapalı olduğu için Hak Etti durumuna çevrilemez"))});
test("attendance status changes remove only a real linked payment",()=>{assert.ok(source.includes("const linkedPayment=findAttendancePayment(existing,id,date,person.id)"));assert.ok(source.includes('if(linkedPayment){batch.delete(doc(db,"adminPersonnelPayments",linkedPayment.id))'));assert.ok(!source.includes('autoPaymentId=existing?.automaticPaymentId||`attendance_${id}`'))});

const vm=require('node:vm');
function ledger(work,paid,month='2026-10',id='p'){
  const context={attendance:work,payments:paid,personnel:[{id:'p',dailyWage:1000},{id:'q',dailyWage:200}],selectedMonth:month,number:x=>Number(x)||0};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function personMonth(id){'),source.indexOf('function renderCalendar'))+'\n'+source.match(/function attendanceWage\(row,person\)\{[^\n]+/)[0],context);
  return context.personMonth(id);
}
const earned=(date,amount=10000,extra={})=>({id:date,personnelId:'p',businessDate:date,status:'worked',wageSnapshot:amount,...extra});
const payment=(date,amount=10000,extra={})=>({id:'pay-'+date,personnelId:'p',businessDate:date,amount,...extra});
test('November payment closes October debt and keeps its actual payment date',()=>{
 const work=[earned('2026-10-31')],paid=[payment('2026-11-01')],before=JSON.stringify({work,paid});
 assert.equal(ledger(work,paid).remaining,0);assert.equal(ledger(work,paid).paid,0);
 const nov=ledger(work,paid,'2026-11');assert.equal(nov.remaining,0);assert.equal(nov.paid,10000);
 assert.equal(JSON.stringify({work,paid}),before);
});
test('partial payments settle oldest months; edit and delete recalculate without duplicate cash records',()=>{
 const work=[earned('2026-09-30',4000),earned('2026-10-31',10000),earned('2026-11-01',1000)];
 assert.equal(ledger(work,[payment('2026-11-02',6000)],'2026-09').remaining,0);
 assert.equal(ledger(work,[payment('2026-11-02',6000)]).remaining,8000);
 assert.equal(ledger(work,[payment('2026-11-02',9000)]).remaining,5000);
 assert.equal(ledger(work,[]).remaining,10000);
 assert.equal(ledger(work,[payment('2026-11-02',6000)],'2026-11').remaining,1000);
});
test('calendar payments stay with their work month instead of paying older debt',()=>{
 const work=[earned('2026-10-31'),earned('2026-11-01',1000)];
 const paid=[payment('2026-11-01',1000,{automaticAttendancePayment:true,attendanceId:'2026-11-01'}),payment('2026-11-02',4000)];
 assert.equal(ledger(work,paid).remaining,6000);assert.equal(ledger(work,paid,'2026-11').remaining,0);
});
test('advances remain visible and settle later earnings, including year boundaries',()=>{
 const paid=[payment('2026-12-31',12000)];
 assert.equal(ledger([earned('2026-12-30')],paid,'2026-12').remaining,-2000);
 const work=[earned('2026-12-30'),earned('2027-01-02',3000)];
 assert.equal(ledger(work,paid,'2026-12').remaining,0);assert.equal(ledger(work,paid,'2027-01').remaining,1000);
 assert.equal(ledger([],paid,'2026-12').remaining,-12000);
});
test('personnel balances are isolated; leave, wage snapshots and cents are preserved',()=>{
 const work=[earned('2026-10-01',10.15),earned('2026-10-02',5.2),earned('2026-10-03',100,{status:'leave'}),earned('2026-10-04',999,{personnelId:'q'})];
 const paid=[payment('2026-11-01',15.35),payment('2026-11-01',500,{personnelId:'q'})];
 assert.equal(ledger(work,paid).remaining,0);assert.equal(ledger(work,paid,'2026-10','q').remaining,499);
});
test('calendar overpayment is retained as credit and input order cannot change allocation',()=>{
 const work=[earned('2026-09-30',1000),earned('2026-10-31',1000)];
 const paid=[payment('2026-10-31',1500,{automaticAttendancePayment:true,attendanceId:'2026-10-31'})];
 assert.equal(ledger(work,paid,'2026-09').remaining,500);
 assert.equal(ledger([...work].reverse(),paid,'2026-09').remaining,500);
});

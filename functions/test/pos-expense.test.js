const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../..');
const cash=fs.readFileSync(path.join(root,'kasa-hesap-yonetimi/script.js'),'utf8');
const reports=fs.readFileSync(path.join(root,'raporlar/script.js'),'utf8');
function load(context,source,names){
 vm.createContext(context);
 for(const name of names){
  const match=new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  assert.ok(match,`missing ${name}`);
  const rest=source.slice(match.index);let compiled;
  for(let end=rest.indexOf('}');end>=0;end=rest.indexOf('}',end+1)){
   try{compiled=new vm.Script(`globalThis.${name}=(${rest.slice(0,end+1)})`);break}catch(error){if(!(error instanceof SyntaxError))throw error}
  }
  assert.ok(compiled,`cannot extract ${name}`);compiled.runInContext(context);
 }
 return context;
}
function finance(){
 const c={settings:{openingCash:100,openingBank:200,openingCard:6470,openingCardDebt:300,legacyOpeningCash:10,legacyOpeningBank:20,legacyOpeningCard:30},FINANCE_START_DATE:'2026-08-13',HISTORY_START_DATE:'2026-08-01',manualMovements:[],closed:new Set(['2026-10-18']),selectedDate:'2026-10-19',sales:[],financialAccounts:[],console};
 c.allMovements=()=>c.manualMovements;c.isFinanceDayClosed=d=>c.closed.has(d);
 return load(c,cash,['number','shiftDate','sortMovements','transferOut','transferIn','openingBalances','balancesThrough','accountBalancesForDate','dayTotals']);
}
const commission=(amount=170,accountId='legacy-pos')=>({id:'commission',type:'expense',account:'card',accountId,amount,businessDate:'2026-10-19',category:'Banka POS komisyonu',description:'Banka POS komisyonu',source:'manual'});
test('POS commission reduces 6470 to 6300 on open day; cash, bank and credit debt stay intact',()=>{
 const c=finance();c.manualMovements=[commission()];const b=c.accountBalancesForDate(c.selectedDate);
 assert.deepEqual({...b},{cash:100,bank:200,card:6300,cardDebt:300});
 assert.equal(c.dayTotals(c.manualMovements).expense,170);
 assert.equal(c.dayTotals(c.manualMovements).cardExpense,0);
});
test('editing and deleting POS commission recomputes balance without double deduction',()=>{
 const c=finance();c.manualMovements=[commission(100)];assert.equal(c.accountBalancesForDate(c.selectedDate).card,6370);
 c.manualMovements=[commission(170)];assert.equal(c.accountBalancesForDate(c.selectedDate).card,6300);
 c.manualMovements=[];assert.equal(c.accountBalancesForDate(c.selectedDate).card,6470);
});
test('closed day and next day carry deduct POS commission exactly once',()=>{
 const c=finance();c.manualMovements=[commission()];c.closed.add(c.selectedDate);
 assert.equal(c.balancesThrough(c.selectedDate).card,6300);
 assert.equal(c.accountBalancesForDate(c.selectedDate).card,6300);
 assert.equal(c.accountBalancesForDate('2026-10-20').card,6300);
});
test('historical card expenses keep legacy credit debt semantics',()=>{
 const c=finance();c.manualMovements=[{...commission(7),businessDate:'2026-08-12'}];
 assert.equal(c.balancesThrough('2026-08-12').card,0);
 assert.equal(c.balancesThrough('2026-08-12').cardDebt,37);
});
test('specific POS account loses commission while another POS and legacy balances remain intact',async()=>{
 const compat=fs.readFileSync(path.join(root,'assets/js/finance-account-compat.js'),'utf8');
 const realSource=fs.readFileSync(path.join(root,'assets/js/finance-real-accounts.js'),'utf8').replace('./finance-account-compat.js?v=554',`data:text/javascript,${encodeURIComponent(compat)}`);
 const real=await import(`data:text/javascript,${encodeURIComponent(realSource)}`);
 const c=finance();Object.assign(c,real,{paymentAccountFromSale:()=>null});
 load(c,cash,['realBalances']);
 c.financialAccounts=[{id:'pos-a',name:'POS A',type:'card',status:'active'},{id:'pos-b',name:'POS B',type:'card',status:'active'}];
 c.manualMovements=[{type:'income',account:'card',accountId:'pos-a',amount:6470,businessDate:'2026-10-18'},{type:'income',account:'card',accountId:'pos-b',amount:500,businessDate:'2026-10-18'},commission(170,'pos-a')];
 for(const closed of [false,true]){
  if(closed)c.closed.add(c.selectedDate);
  const rows=c.realBalances(),get=id=>rows.find(x=>x.id===id).balanceCents;
  assert.equal(get('pos-a'),630000);assert.equal(get('pos-b'),50000);assert.equal(get('legacy-pos'),647000);
  assert.equal(get('legacy-credit-card-debt'),30000);
 }
});
test('expense dialog includes active POS accounts and preserves selected POS when editing',()=>{
 const nodes=new Map(),c={selectedDate:'2026-10-19',canEditSelectedDate:()=>true,formatBusinessDate:d=>d,closeMovementCategoryPicker(){},renderMovementCategoryPicker(){},setTimeout(){},legacyId:t=>'legacy-'+t,number:Number};
 c.$=id=>{if(!nodes.has(id))nodes.set(id,{value:'',reset(){},showModal(){}});return nodes.get(id)};
 c.accountOptions=types=>{c.allowed=types;return '<option value="pos-a">POS A</option>'};
 load(c,cash,['openDialog']);c.openDialog('expense',{...commission(170,'pos-a')});
 assert.ok(c.allowed.includes('card'));assert.equal(c.$('account').value,'pos-a');
});
test('saving POS expense persists chosen account ID and name rather than bank or credit debt',async()=>{
 const nodes=new Map(),writes=[],c={selectedDate:'2026-10-19',canEditSelectedDate:()=>true,number:Number,serverTimestamp:()=>123,accountById:id=>id==='pos-a'?{id,name:'Banka POS',type:'card',status:'active'}:null,categoryItems:()=>[{id:'commission-cat',name:'Banka POS komisyonu'}],groupForCategory:()=>({id:'financial',name:'Finans Giderleri',active:true}),doc:()=>({}),db:{},movementsCol:{},auth:{currentUser:{uid:'owner'}},setDoc:async(ref,data)=>writes.push(data),updateDoc:async(ref,data)=>writes.push(data),toast(){},console};
 c.$=id=>{if(!nodes.has(id))nodes.set(id,{value:'',close(){}});return nodes.get(id)};
 for(const [id,value] of Object.entries({movementType:'expense',account:'pos-a',amount:'170',category:'commission-cat',description:'Banka POS komisyonu'}))c.$(id).value=value;
 load(c,cash,['saveMovement']);await c.saveMovement({preventDefault(){}});
 assert.equal(writes.length,1);assert.equal(writes[0].account,'card');assert.equal(writes[0].accountId,'pos-a');assert.equal(writes[0].accountNameSnapshot,'Banka POS');assert.equal(writes[0].amount,170);
});
function reporting(){
 const c={sales:[],cashMovements:[],range:{start:'2026-10-19',end:'2026-10-19'},currentBusinessDate:'2026-10-19',currentBusinessDayStartedAtMs:0,cashCategorySettings:{},num:v=>Number(v)||0,dateFromTimestamp:()=>'',reportTime:r=>r.createdAtMs||0};
 return load(c,reports,['emptyReport','expensePaymentType','expenseAccountLabel','expenseCategoryFor','expenseGroupFor','groupExpenseMovements','buildReport','reportExpenseDetailRows']);
}
test('reports put POS commission into total and POS group, separate from credit-card expenses',()=>{
 const c=reporting();c.cashMovements=[commission(),{...commission(40),id:'debt',account:'creditCard'}];c.report=c.buildReport();
 assert.equal(c.report.expenseTotal,210);assert.equal(c.report.posExpenseTotal,170);assert.equal(c.report.creditCardExpenseTotal,40);
 assert.equal(c.report.expenseGroups[0].pos,170);assert.equal(c.report.expenseGroups[0].card,40);
 assert.equal(c.reportExpenseDetailRows('pos-expenses').length,1);assert.equal(c.reportExpenseDetailRows('credit-expenses').length,1);
 assert.equal(c.reportExpenseDetailRows('pos-expenses')[0].label,'POS Hesabı');
 assert.equal(c.expensePaymentType({...commission(),businessDate:'2026-08-12'}),'creditCard');
});
test('rules change allows POS expense without altering existing date, routing and permission conditions',()=>{
 const current=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
 assert.match(current,/data.type == 'expense' && data.account in \['cash', 'bank', 'card', 'creditCard'\]/);
 assert.match(current,/financeDateOpen\(data.businessDate\)/);assert.match(current,/&& validFinanceRouting\(data\)/);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const compat=readFileSync(join(__dirname,'../../assets/js/finance-account-compat.js'),'utf8');
const compatUrl=`data:text/javascript,${encodeURIComponent(compat)}`;
const source=readFileSync(join(__dirname,'../../assets/js/finance-real-accounts.js'),'utf8').replace('./finance-account-compat.js?v=554',compatUrl);
const real=import(`data:text/javascript,${encodeURIComponent(source)}`);

const docs=[{id:'akbank',type:'bank',name:'Akbank',status:'active'},{id:'enpara',type:'bank',name:'Enpara',status:'active'},{id:'yedek',type:'cash',name:'Yedek Kasa',status:'passive'},{id:'ticari',type:'creditCard',name:'Ticari Kart',status:'active'}];
const totals={cash:2735,bank:36587,card:6335,cardDebt:440};
const all=()=>true;

test('legacy totals project to defaults without another opening movement',async()=>{
 const {distributeBalances,reconcileAccounts}=await real;
 const rows=distributeBalances(totals,docs,[],all);
 assert.equal(reconcileAccounts(totals,rows),true);
 assert.equal(rows.find(x=>x.id==='legacy-bank').balanceCents,3658700);
 assert.equal(rows.find(x=>x.id==='akbank').balanceCents,0);
 assert.equal(rows.find(x=>x.id==='legacy-pos').balanceCents,633500);
});

test('bank-to-bank transfer allocates money once and keeps aggregate unchanged',async()=>{
 const {distributeBalances,reconcileAccounts}=await real;
 const rows=distributeBalances(totals,docs,[
  {type:'transfer',fromAccount:'bank',fromAccountId:'legacy-bank',toAccount:'bank',toAccountId:'akbank',amount:150},
  {type:'transfer',fromAccount:'bank',fromAccountId:'akbank',toAccount:'bank',toAccountId:'enpara',amount:40}
 ],all);
 assert.equal(rows.find(x=>x.id==='legacy-bank').balanceCents,3643700);
 assert.equal(rows.find(x=>x.id==='akbank').balanceCents,11000);
 assert.equal(rows.find(x=>x.id==='enpara').balanceCents,4000);
 assert.equal(reconcileAccounts(totals,rows),true);
});

test('manual income, expense and credit debt preserve four aggregate sums',async()=>{
 const {distributeBalances,reconcileAccounts}=await real;
 const movements=[
  {type:'income',account:'bank',accountId:'akbank',amount:120.37},
  {type:'expense',account:'bank',accountId:'akbank',amount:20.12},
  {type:'expense',account:'creditCard',accountId:'ticari',amount:35.25},
  {type:'transfer',fromAccount:'cash',fromAccountId:'legacy-cash',toAccount:'cash',toAccountId:'yedek',amount:10},
  {type:'income',account:'bank',accountId:'enpara',amount:999,reversed:true}
 ];
 const rows=distributeBalances(totals,docs,movements,all);
 assert.equal(rows.find(x=>x.id==='akbank').balanceCents,10025);
 assert.equal(rows.find(x=>x.id==='ticari').balanceCents,3525);
 assert.equal(rows.find(x=>x.id==='yedek').balanceCents,1000);
 assert.equal(rows.find(x=>x.id==='enpara').balanceCents,0);
 assert.equal(reconcileAccounts(totals,rows),true);
});

test('editing an account name does not mutate a movement name snapshot',async()=>{
 const {accountRows}=await real;
 const movement={accountId:'akbank',accountNameSnapshot:'Akbank'};
 const named=accountRows(docs.map(d=>d.id==='akbank'?{...d,name:'Yeni Akbank'}:d));
 assert.equal(named.find(x=>x.id==='akbank').name,'Yeni Akbank');
 assert.equal(movement.accountNameSnapshot,'Akbank');
});

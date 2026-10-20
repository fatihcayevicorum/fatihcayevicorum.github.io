const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const asset=name=>readFileSync(join(__dirname,'../../assets/js',name),'utf8');
const url=source=>`data:text/javascript,${encodeURIComponent(source)}`;
const compat=url(asset('finance-account-compat.js'));
const realUrl=url(asset('finance-real-accounts.js').replace('./finance-account-compat.js?v=554',compat));
const real=import(realUrl);
const routing=import(url(asset('payment-account-routing.js').replace('./finance-real-accounts.js?v=557',realUrl)));
const cashSource=readFileSync(join(__dirname,'../../kasa-hesap-yonetimi/script.js'),'utf8');
const functions=cashSource.slice(cashSource.indexOf('function realBalances('),cashSource.indexOf('function renderFinancialAccounts('));
const docs=[{id:'cash2',name:'İkinci Kasa',type:'cash',status:'passive'},{id:'pos2',name:'İkinci POS',type:'card',status:'active'},{id:'bank2',name:'Akbank',type:'bank',status:'active'}];
const date='2026-10-18';
const sales=[['cash','cash2','cashAmount'],['card','pos2','cardAmount'],['transfer','bank2','transferAmount']].map(([paymentType,financeAccountId,amountKey])=>({paymentType,financeAccountId,[amountKey]:30,businessDate:date,cashMovementApplied:true}));

async function project(closed,records=sales){
 const {distributeBalances,reconcileAccounts}=await real,{paymentAccountsFromSale}=await routing;
 const totals={cash:closed?1030:1000,card:closed?230:200,bank:330,cardDebt:0};
 return new Function('distributeBalances','reconcileAccounts','paymentAccountsFromSale','accountBalancesForDate','financialAccounts','sales','manualMovements','isFinanceDayClosed',`const selectedDate='${date}',FINANCE_START_DATE='2026-08-13',HISTORY_START_DATE='2026-08-01';${functions};return {rows:realBalances(),pending:pendingAccountCollections('cash2')}`)(distributeBalances,reconcileAccounts,paymentAccountsFromSale,()=>totals,docs,records,[],()=>closed);
}

test('nakit ve POS kapanışta seçili hesaplara geçer, havale açık günde kullanılabilir',async()=>{
 const open=await project(false),closed=await project(true),balance=(data,id)=>data.rows.find(r=>r.id===id).balanceCents;
 assert.equal(balance(open,'cash2'),0);assert.equal(balance(open,'pos2'),0);assert.equal(balance(open,'bank2'),3000);
 assert.equal(open.pending,3000);
 assert.equal(balance(closed,'cash2'),3000);assert.equal(balance(closed,'pos2'),3000);assert.equal(balance(closed,'bank2'),3000);
 assert.equal(closed.pending,0);
 assert.equal(balance(closed,'legacy-cash'),100000);assert.equal(balance(closed,'legacy-pos'),20000);
});

test('iptal edilen nakit tahsilatı kapanış bekleyen tutardan çıkar',async()=>{
 const result=await project(false,sales.map(s=>({...s,reversed:s.financeAccountId==='cash2'})));
 assert.equal(result.pending,0);
});

test('one mixed quick sale allocates each share once across open and closed real accounts',async()=>{
 const quick={salesMode:'quick',businessDate:date,cashMovementApplied:true,cashAmount:30,cardAmount:30,transferAmount:30,paymentAllocations:sales.map(s=>({...s,type:s.paymentType}))};
 const open=await project(false,[quick]),closed=await project(true,[quick]),get=(data,id)=>data.rows.find(r=>r.id===id).balanceCents;
 assert.equal(open.pending,3000);assert.equal(get(open,'bank2'),3000);
 assert.equal(get(closed,'cash2'),3000);assert.equal(get(closed,'pos2'),3000);assert.equal(get(closed,'bank2'),3000);assert.equal(closed.pending,0);
});

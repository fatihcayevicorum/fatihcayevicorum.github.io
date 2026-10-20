const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../..'),asset=name=>fs.readFileSync(path.join(root,'assets/js',name),'utf8'),url=s=>`data:text/javascript,${encodeURIComponent(s)}`;
const helpers=import(url(asset('sales-mode.js'))),stockModule=import(url(asset('stock-recipe.js')));
const accounts=url(asset('finance-real-accounts.js').replace('./finance-account-compat.js?v=554',url(asset('finance-account-compat.js'))));
const routing=import(url(asset('payment-account-routing.js').replace('./finance-real-accounts.js?v=557',accounts)));
const source=fs.readFileSync(path.join(root,'adisyon/script.js'),'utf8');
const commit=source.slice(source.indexOf('async function commitQuickSale('),source.indexOf("window.addEventListener('beforeunload'"));
const {buildPosSalesMode}=require('../pos-sales-mode');

async function fixture({values={cash:20,card:30,transfer:10,current:40},stockQuantity=10,mode='quick',existing=null,price=100,active=true,offline=false,fail=false}={}){
 const {salesMode,quickPaymentQuote}=await helpers,{stockRequirements}=await stockModule,{selectedCollectionAccount,DEFAULT_COLLECTION_ACCOUNTS}=await routing;
 const data=new Map(),writes=[],nodes=new Map(),stock={id:'stock',name:'Çay',quantity:stockQuantity,unit:'adet',automaticDeduction:true,linkedMenuItemId:'tea',active:true,stockTrackingEnabled:true};
 const draft={currentAccountId:'customer',id:'basket',slotKey:'quick-basket',items:[{id:'tea',name:'Çay',lineId:'l1',unitPrice:100,quantity:1,complimentary:false}],createdBy:'owner'};
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='quickPayAccount'?'customer':'',textContent:'',inert:false,close(){this.closed=true}});return nodes.get(id)};
 const snap=(key,value)=>({id:key.split('/').at(-1),exists:()=>value!==undefined,data:()=>value});
 data.set('adminAppSettings/pos',{salesMode:mode,currentBusinessDate:'2026-10-20',currentBusinessDayStartedAtMs:1000});
 data.set('publicMenu/catalog',{items:[{id:'tea',name:'Çay',price}]});
 data.set('adminPaymentSettings/config',{methods:{cash:true,card:true,transfer:true},activeAccounts:{cash:'cash2',card:'pos2',transfer:'bank2'}});
 for(const [id,type] of [['cash2','cash'],['pos2','card'],['bank2','bank']])data.set(`adminFinancialAccounts/${id}`,{type,status:'active',name:id});
 data.set('adminCurrentAccounts/customer',{name:'Ahmet',balance:20,active});data.set('adminStockItems/stock',stock);
 if(existing)data.set('adminSales/quick-basket',existing);
 const context={console:{error(){}},JSON,Math,Number,String,Object,Date,Array,Error,
  $:node,posSalesMode:'quick',quickDraft:draft,quickCommitBusy:false,busy:false,auth:{currentUser:{uid:'owner'}},
  isLocalWorkingMode:()=>offline,requireStockData:()=>true,paymentMethodsReady:true,financialAccountsReady:true,canTransferCurrentAccount:true,
  quickQuote:()=>quickPaymentQuote(100,values,'customer'),show:message=>{context.message=message},settingsRef:{path:'adminAppSettings/pos'},menuRef:{path:'publicMenu/catalog'},
  salesCol:'adminSales',closingsCol:'adminDailyClosings',stockCol:'adminStockItems',stockMovesCol:'adminStockMovements',currentAccountsCol:'adminCurrentAccounts',currentAccountMovesCol:'adminCurrentAccountMovements',db:{},
  doc:(base,a,b)=>({id:b||a,path:b?`${a}/${b}`:`${base}/${a}`}),salesMode,normalizePaymentMethods:v=>v.methods||{cash:true,card:true,transfer:true},
  stocks:[stock],stockRequirements,selectedCollectionAccount,DEFAULT_COLLECTION_ACCOUNTS,
  loadCurrentAccountPricing:async(tx,db,account)=>({balance:account.balance,difference:0}),recordCurrentPriceAdjustment:()=>{},
  startOfBusinessDateMs:()=>1000,businessDate:'2026-10-20',serverTimestamp:()=>({stamp:true}),markInstantCashMovement:()=>({cashMovementApplied:true}),
  bumpCashMovement:(tx,args)=>tx.set({path:`cash/${args.account}`},args),
  el:{checkoutDialog:{open:false,close(){}},checkoutForm:{inert:false},orderView:{inert:false},productSearch:{value:''}},newQuickDraft:()=>({id:'new',items:[]}),persistQuickDraft:()=>{},renderQuickSale:()=>{},focusQuickSearch:()=>{},renderQuickPayment:()=>{},category:'all',
  runOnlineTransaction:async(db,callback)=>{
   const pending=[];let writing=false;
   const tx={get:async ref=>{assert.equal(writing,false,'all reads precede writes');return snap(ref.path,data.get(ref.path))},set:(ref,body)=>{writing=true;pending.push({kind:'set',path:ref.path,body})},update:(ref,body)=>{writing=true;pending.push({kind:'update',path:ref.path,body})}};
   await callback(tx);if(fail)throw Error('network');
   for(const w of pending){data.set(w.path,{...(w.kind==='update'?data.get(w.path):{}),...w.body});writes.push(w)}
  }
 };
 vm.createContext(context);vm.runInContext(commit,context);
 await context.commitQuickSale({preventDefault(){}});
 return {context,data,writes,draft,nodes};
}

test('sales mode defaults to table; only explicit quick switches',async()=>{const {salesMode}=await helpers;assert.equal(salesMode(), 'table');assert.equal(salesMode({salesMode:'garbage'}),'table');assert.equal(salesMode({salesMode:'quick'}),'quick')});
test('split uses cents; total must match exactly and current share needs an account',async()=>{
 const {quickPaymentQuote:q}=await helpers;
 assert.equal(q(.3,{cash:.1,card:.2}).complete,true);
 assert.equal(q(100,{cash:99.99}).complete,false);assert.equal(q(100,{cash:100.01}).complete,false);
 assert.equal(q(100,{current:100}).complete,false);assert.equal(q(100,{current:100},'c').complete,true);
 for(const value of [-1,Infinity,'abc',1.001])assert.throws(()=>q(100,{cash:value}),/invalid-amount/);
});
test('one complete mixed sale atomically writes stock, collection shares and only unpaid current debt',async()=>{
 const f=await fixture(),sale=f.data.get('adminSales/quick-basket');
 assert.ok(sale,'sale committed');assert.equal(sale.baseTotal,100);assert.equal(sale.paymentAmount,60);assert.equal(sale.currentAccountAmount,40);
 assert.equal(sale.paymentAllocations.length,3);assert.equal(sale.paymentAllocations[1].financeAccountId,'pos2');
 assert.equal(f.data.get('adminStockItems/stock').quantity,9);assert.equal(f.data.get('adminCurrentAccounts/customer').balance,60);
 assert.equal(f.data.get('adminCurrentAccountMovements/quick-basket').amount,40);
 assert.equal(f.writes.filter(w=>w.path.startsWith('adminSales/')).length,1);assert.equal(f.writes.some(w=>w.path.startsWith('adminOrders/')),false);
 assert.equal(f.context.quickDraft.id,'new');
});
test('incomplete or excessive split cannot create a sale or move money',async()=>{
 for(const values of [{cash:99.99},{cash:100,card:.01}]){const f=await fixture({values});assert.equal(f.writes.length,0);assert.equal(f.context.quickDraft.id,'basket')}
});
test('stock failure, changed mode/price, passive current account and transaction failure preserve basket and write nothing',async()=>{
 for(const input of [{stockQuantity:0},{mode:'table'},{price:110},{active:false},{fail:true},{offline:true}]){
  const f=await fixture(input);assert.equal(f.writes.length,0,JSON.stringify(input));assert.equal(f.context.quickDraft.id,'basket');assert.equal(f.context.busy,false);
 }
});
test('retry of the same completed basket does not repeat stock or payment writes',async()=>{
 const first=await fixture(),sale=first.data.get('adminSales/quick-basket');const second=await fixture({existing:sale});
 assert.equal(second.writes.length,0);assert.equal(second.context.quickDraft.id,'new');
 const paymentConflict=await fixture({existing:sale,values:{cash:100}});assert.equal(paymentConflict.writes.length,0);assert.equal(paymentConflict.context.quickDraft.id,'basket');
 const conflict=await fixture({existing:{...sale,quickDraftSignature:'different'}});assert.equal(conflict.writes.length,0);assert.equal(conflict.context.quickDraft.id,'basket');
});
test('current-account-only sale creates no cash income and product debt remains linked to items',async()=>{
 const f=await fixture({values:{current:100}});assert.equal(f.writes.filter(w=>w.path.startsWith('cash/')).length,0);
 assert.equal(f.data.get('adminSales/quick-basket').paymentType,'current-account');
 assert.equal(f.data.get('adminCurrentAccountMovements/quick-basket').items[0].id,'tea');
});
test('split account projections preserve real accounts, amounts, and reversed exclusion',async()=>{
 const {paymentAccountsFromSale}=await routing,f=await fixture(),sale=f.data.get('adminSales/quick-basket'),rows=paymentAccountsFromSale(sale);
 assert.deepEqual(JSON.parse(JSON.stringify(rows.map(r=>[r.accountId,r.amount]))),[['cash2',20],['pos2',30],['bank2',10]]);
 assert.deepEqual(paymentAccountsFromSale({...sale,reversed:true}),[]);
});
function modeService({open=false,owner=true,current='table'}={}){
 const writes=[],db={doc:path=>({path}),collection:path=>({where(){return{limit(){return{query:true}}}}}),runTransaction:async callback=>callback({get:async ref=>ref.query?{empty:!open}:{data:()=>({salesMode:current,tableSlots:['keep'],serialMode:true})},set:(...args)=>writes.push(args)})};
 const service=buildPosSalesMode({db,FieldValue:{serverTimestamp:()=>1},HttpsError:class extends Error{constructor(code,message){super(message);this.code=code}},requireOwner(){if(!owner)throw Error('permission-denied')}});
 return {service,writes};
}
test('mode switch checks owner, stale expected mode and open orders on server',async()=>{
 for(const options of [{owner:false},{open:true},{current:'quick'}]){const f=modeService(options);await assert.rejects(f.service({auth:{uid:'owner'},data:{salesMode:'quick',expectedMode:'table'}}));assert.equal(f.writes.length,0)}
 const f=modeService();await f.service({auth:{uid:'owner'},data:{salesMode:'quick',expectedMode:'table'}});assert.equal(f.writes.length,1);assert.equal(f.writes[0][1].salesMode,'quick');assert.equal(f.writes[0][2].merge,true);
});

async function existingDialogFixture(total=100){
 const {quickPaymentQuote}=await helpers;
 const context={Math,Number,Object,quickPaymentQuote,quickDraft:{items:[{unitPrice:total,quantity:1}],payments:[]},quickCommitBusy:false,busy:false,paymentMethodsReady:true,paymentMethods:{cash:true,card:true,transfer:true},method:'cash',commits:[],
  el:{paidAmount:{value:String(total),focus(){},select(){}},checkoutDialog:{open:true,addEventListener(){}}},
  billTotal:d=>d.items.reduce((s,i)=>s+i.unitPrice*i.quantity,0),orderTotal:d=>Math.max(0,total-d.payments.reduce((s,p)=>s+p.amount,0)),
  currentPaymentType:()=>context.method,isLocalWorkingMode:()=>false,persistQuickDraft:()=>true,renderOrder(){},renderCashPreview(){},formatInputAmount:String,show:m=>context.message=m,
  commitQuickSale:async()=>context.commits.push(context.quickQuote())};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function quickPaymentValues()'),source.indexOf('async function commitQuickSale(')),context);
 return context;
}
test('existing checkout confirms one tea directly with no allocation-add step',async()=>{
 const f=await existingDialogFixture(15);await f.checkoutQuickWithExistingDialog({preventDefault(){}});
 assert.equal(f.commits.length,1);assert.equal(f.commits[0].parts.cash,15);assert.equal(f.commits[0].complete,true);
});
test('existing checkout accepts cash 50 then card 50 and commits once with both shares',async()=>{
 const f=await existingDialogFixture();f.el.paidAmount.value='50';await f.checkoutQuickWithExistingDialog({});
 assert.equal(f.commits.length,0);assert.equal(f.quickDraft.payments.length,1);assert.equal(f.el.paidAmount.value,'50');
 f.method='card';await f.checkoutQuickWithExistingDialog({});assert.equal(f.commits.length,1);assert.equal(f.commits[0].parts.cash,50);assert.equal(f.commits[0].parts.card,50);assert.equal(f.commits[0].complete,true);
});
test('existing checkout rejects unavailable method, invalid precision and disconnected confirmation',async()=>{
 for(const values of [{amount:'-1'},{amount:'1.001'},{amount:'101'},{method:false},{offline:true}]){
  const f=await existingDialogFixture();if(values.amount)f.el.paidAmount.value=values.amount;if(values.method===false)f.paymentMethods.cash=false;if(values.offline)f.isLocalWorkingMode=()=>true;
  await f.checkoutQuickWithExistingDialog({});assert.equal(f.commits.length,0);assert.equal(f.quickDraft.payments.length,0);
 }
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const asset=name=>readFileSync(join(__dirname,'../../assets/js',name),'utf8');
const url=source=>`data:text/javascript,${encodeURIComponent(source)}`;
const compat=url(asset('finance-account-compat.js'));
const accounts=url(asset('finance-real-accounts.js').replace('./finance-account-compat.js?v=554',compat));
const routing=import(url(asset('payment-account-routing.js').replace('./finance-real-accounts.js?v=557',accounts)));
const docs=[{id:'akbank',type:'bank',name:'Akbank',status:'active'},{id:'enpara',type:'bank',name:'Enpara',status:'active'},{id:'pos2',type:'card',name:'İkinci POS',status:'passive'}];

test('tahsilat hesabı değişince eski satışın hesap kimliği ve adı korunur',async()=>{
 const {selectedCollectionAccount,paymentAccountFromSale}=await routing;
 const old=selectedCollectionAccount({activeAccounts:{transfer:'akbank'}},docs,'transfer');
 const recent=selectedCollectionAccount({activeAccounts:{transfer:'enpara'}},docs,'transfer');
 const sale={...old,paymentType:'transfer',transferAmount:125,businessDate:'2026-10-17',cashMovementApplied:true};
 assert.equal(old.financeAccountNameSnapshot,'Akbank');
 assert.equal(paymentAccountFromSale(sale).accountId,'akbank');
 assert.equal(recent.financeAccountId,'enpara');
 assert.equal(paymentAccountFromSale({...sale,reversed:true}),null);
});

test('pasif POS seçilemez ve varsayılan nakit hesabı kullanılabilir',async()=>{
 const {selectedCollectionAccount}=await routing;
 assert.throws(()=>selectedCollectionAccount({activeAccounts:{card:'pos2'}},docs,'card'),/inactive/);
 assert.equal(selectedCollectionAccount({},docs,'cash').financeAccountId,'legacy-cash');
});

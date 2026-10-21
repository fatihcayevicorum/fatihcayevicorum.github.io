const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('first table product starts a direct write without an extra settings transaction and preserves payload',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../adisyon/script.js'),'utf8'),body=source.slice(source.indexOf('async function saveOrder('),source.indexOf('function openPosBarcode('));
 let writes=0,release;const pending=new Promise(resolve=>release=resolve);
 const c={posSalesMode:'table',busy:false,selectedKey:'table-1',ordersCol:'orders',businessDate:'2026-10-21',auth:{currentUser:{uid:'owner'}},doc:()=>({id:'new-order'}),recordOrderTitle:()=> 'Masa 1',deleteField:()=>null,serverTimestamp:()=>0,isLocalWorkingMode:()=>false,acceptLocalWrite:p=>p,show:()=>{},console,
 setDoc:(ref,payload,options)=>{writes++;assert.equal(payload.updatedBy,'owner');assert.equal(payload.items[0].quantity,1);assert.equal(options.merge,true);return pending},runOnlineTransaction:()=>{throw Error('Unexpected server read')}};
 vm.createContext(c);vm.runInContext(body,c);const saved=c.saveOrder(null,[{id:'tea',quantity:1}]);assert.equal(writes,1);release();assert.equal(await saved,true);assert.equal(c.busy,false);
 const rules=fs.readFileSync(path.join(__dirname,'../../firestore.rules'),'utf8');assert.match(rules,/match \/adminOrders\/\{document\}[\s\S]*?hasPanel\('pos'\) && posTableMode\(\)/);
});

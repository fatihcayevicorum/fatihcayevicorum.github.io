'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../stok-yonetimi/script.js'),'utf8');
const history=source.match(/^async function openHistory\(id\).*$/m)[0];
async function load(rows){
 let rendered=[],reconciled=[];
 const el=new Proxy({historyDialog:{showModal(){}}},{get(o,k){return o[k]||(o[k]={});}});
 const ctx={stocks:[{id:'water',name:'Su',quantity:210}],historyStockId:'',historyMovements:[],catalog:{items:[]},el,movesCol:'moves',num:x=>Number(x)||0,formatNumber:String,esc:String,displayUnit:String,money:String,console,
 where:(field,op,value)=>({field,op,value}),limit:n=>({limit:n}),query:(col,...filters)=>({col,filters}),
 getDocs:async q=>{let result=rows.filter(x=>q.filters.every(f=>!f.field||x[f.field]===f.value));const cap=q.filters.find(f=>f.limit);if(cap)result=result.slice(0,cap.limit);return{docs:result.map(x=>({id:x.id,data:()=>x}))};},
 movementTime:x=>x.createdAtMs||x.createdAt?.toMillis()||Date.parse(x.operationDate)||0,
 reconcileLastPurchase:async(item,items)=>{reconciled=items;},renderProductHistory:items=>{rendered=items;}};
 vm.createContext(ctx);await vm.runInContext(history+';openHistory("water")',ctx);return{rendered,reconciled};
}
test('product history includes recent sales beyond 300 unordered documents',async()=>{
 const old=Array.from({length:300},(_,i)=>({id:'a'+i,stockItemId:'water',createdAtMs:i+1}));
 const rows=[...old,{id:'z1',stockItemId:'water',createdAtMs:1000,amount:1},{id:'z2',stockItemId:'water',createdAtMs:2000,amount:2},{id:'other',stockItemId:'tea',createdAtMs:3000}];
 const r=await load(rows);assert.equal(r.rendered.length,302);assert.equal(r.rendered[0].id,'z2');assert.equal(r.rendered[1].id,'z1');assert.equal(r.reconciled.length,302);
});
test('empty product history renders no unrelated movements',async()=>{const r=await load([{id:'tea',stockItemId:'tea',createdAtMs:1}]);assert.equal(r.rendered.length,0);});
test('legacy timestamps and operation dates remain in chronological order',async()=>{const r=await load([{id:'date',stockItemId:'water',operationDate:'2026-10-17'},{id:'stamp',stockItemId:'water',createdAt:{toMillis:()=>Date.parse('2026-10-18')}},{id:'ms',stockItemId:'water',createdAtMs:Date.parse('2026-10-19')}]);assert.equal(r.rendered.map(x=>x.id).join(','),'ms,stamp,date');});

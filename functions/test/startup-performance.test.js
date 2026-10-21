const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../..');
test('profile reads share only pending requests; later permission changes and failures are re-read',async()=>{
 const source=fs.readFileSync(path.join(root,'assets/js/admin-access.js'),'utf8').replace(/^import[^\n]+\n/gm,'').replace(/export /g,'');
 let count=0,resolve,reject;const c={ADMIN_UID:'owner',doc:(db,col,uid)=>({uid}),getDoc:()=>{count++;return new Promise((ok,no)=>{resolve=ok;reject=no})}};
 vm.createContext(c);vm.runInContext(source,c);const db={},user={uid:'staff'};
 const a=c.getManagementProfile(user,db),b=c.getManagementProfile(user,db);assert.equal(count,1);assert.equal(a,b);
 resolve({exists:()=>true,data:()=>({active:true,permissions:['pos']})});const profile=await a;assert.equal(c.profileHasPermission(profile,'pos'),true);
 const next=c.getManagementProfile(user,db);assert.equal(count,2);resolve({exists:()=>true,data:()=>({active:false,permissions:['pos']})});assert.equal(await next,null);
 const failed=c.getManagementProfile(user,db);reject(Error('network'));await assert.rejects(failed,/network/);
 const retried=c.getManagementProfile(user,db);assert.equal(count,4);resolve({exists:()=>true,data:()=>({active:true,permissions:[]})});assert.equal(c.profileHasPermission(await retried,'pos'),false);
});
test('static cache reuses exact versions, fetches a changed version, and keeps navigation network-first',async()=>{
 const handlers={},stores=new Map(),calls=[];
 const key=v=>typeof v==='string'?v:v.url;
 const caches={open:async name=>{if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return{match:async req=>data.get(key(req)),put:async(req,value)=>data.set(key(req),value)}} ,match:async()=>undefined};
 const c={URL,console,caches,self:{location:{origin:'https://example.test'},addEventListener:(name,handler)=>handlers[name]=handler},fetch:async req=>{calls.push(key(req));return{ok:true,clone(){return this}}}};
 c.importScripts=()=>{};c.firebase={initializeApp(){},messaging:()=>({onBackgroundMessage(){}})};
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'service-worker.js'),'utf8'),c);
 async function request(path,mode='cors'){let result;handlers.fetch({request:{url:'https://example.test'+path,method:'GET',mode},respondWith:p=>result=p});return await result}
 await request('/adisyon/script.js?v=592');await request('/adisyon/script.js?v=592');assert.equal(calls.length,1);
 await request('/adisyon/script.js?v=593');assert.equal(calls.length,2);
 await request('/assets/js/admin-access.js?v=346');await request('/assets/js/admin-access.js');assert.equal(calls.length,3);assert.match(calls[2],/v=592/);
 await request('/yonetim-merkezi/','navigate');await request('/yonetim-merkezi/','navigate');assert.equal(calls.length,5);
});

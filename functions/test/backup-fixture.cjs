'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),core=require('../system-backup-core'),{buildSystemBackup}=require('../system-backup');
class Timestamp{constructor(seconds,nanoseconds){this.seconds=seconds;this.nanoseconds=nanoseconds}toMillis(){return this.seconds*1000+this.nanoseconds/1e6}}
class GeoPoint{constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}
class HttpsError extends Error{constructor(code,msg){super(msg);this.code=code}}
class MemoryDB{
 constructor(){this.data=new Map;this.tail=Promise.resolve();this.fail=null;this.batchSizes=[];}
 doc(path){const db=this;return{path,id:path.split('/').at(-1),async get(){return db.snapshot(path)},async set(value,options){const old=db.data.get(path)||{};db.data.set(path,options?.merge?{...old,...value}:value)},async delete(){db.data.delete(path)},async listCollections(){return db.collections(path)}}}
 collection(path){const db=this;return{path,async get(){return{docs:[...db.data.keys()].filter(x=>x.startsWith(path+'/')&&x.split('/').length===path.split('/').length+1).sort().map(p=>db.snapshot(p))}},async listDocuments(){const paths=[...new Set([...db.data.keys()].filter(p=>p.startsWith(path+'/')).map(p=>p.split('/').slice(0,path.split('/').length+1).join('/')))];return paths.sort().map(p=>db.doc(p))}}}
 snapshot(path){const db=this;return{id:path.split('/').at(-1),ref:db.doc(path),exists:db.data.has(path),data:()=>db.data.get(path)}}
 collections(parent=''){const depth=parent?parent.split('/').length:0;const paths=[...new Set([...this.data.keys()].filter(p=>!parent||p.startsWith(parent+'/')).filter(p=>p.split('/').length>depth).map(p=>p.split('/').slice(0,depth+1).join('/')))];return paths.sort().map(p=>this.collection(p))}
 async getAll(...refs){return refs.map(ref=>this.snapshot(ref.path))}
 async listCollections(){return this.collections()}
 batch(){const db=this,ops=[];return{set(ref,value){ops.push(['set',ref,value])},delete(ref){ops.push(['delete',ref])},async commit(){db.batchSizes.push(ops.length);if(ops.some(([,r])=>r.path===db.fail))throw Error('injected batch failure');for(const [type,ref,value] of ops){if(type==='set')db.data.set(ref.path,value);else db.data.delete(ref.path)}}}}
 runTransaction(fn){const task=this.tail.then(async()=>{const ops=[];let written=false;const tx={get:async ref=>{assert.equal(written,false,'read after write');return ref.path.split('/').length%2?ref.get():this.snapshot(ref.path)},set:(r,d,o)=>{written=true;ops.push(()=>r.set(d,o))},delete:r=>{written=true;ops.push(()=>r.delete())}};const result=await fn(tx);for(const op of ops)await op();return result});this.tail=task.catch(()=>{});return task;}
}
class MemoryBucket{
 constructor(){this.data=new Map;this.tick=0;this.fail=null}
 file(name){const bucket=this;return{name,async save(bytes,opts={}){if(bucket.fail===name||(bucket.failReason&&bucket.failReason===opts.metadata?.metadata?.reason))throw Error('injected storage failure');const id=String(++bucket.tick);bucket.data.set(name,{bytes:Buffer.from(bytes),meta:{size:String(bytes.length),generation:id,timeCreated:new Date(1700000000000+bucket.tick).toISOString(),contentType:opts.contentType||'application/octet-stream',metadata:opts.metadata?.metadata||{},cacheControl:opts.metadata?.cacheControl||''}})},async setMetadata(m){const x=bucket.data.get(name);x.meta={...x.meta,...m};},async getMetadata(){const x=bucket.data.get(name);if(!x)throw new HttpsError('not-found','missing');return[x.meta]},async download(options={}){const x=bucket.data.get(name);if(!x)throw new HttpsError('not-found','missing');return[Buffer.from(x.bytes.subarray(options.start||0,options.end===undefined?undefined:options.end+1))]},async delete(){bucket.data.delete(name)}}}
 async getFiles({prefix}){return[[...this.data.keys()].filter(n=>n.startsWith(prefix)).sort().map(n=>this.file(n))]}
}
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){const db=new MemoryDB,bucket=new MemoryBucket;let clock=1700000000000;const auth={users:new Map,async getUsers(ids){return{users:ids.filter(x=>this.users.has(x.uid)).map(x=>this.users.get(x.uid)),notFound:ids.filter(x=>!this.users.has(x.uid))}}};db.data.set('adminSecurity/sensitiveAccess',{pinHash:'SECRET',salt:'SALT',updatedAtMs:8});db.data.set('adminSavingsSessions/owner',{expiresAtMs:clock+99999999,pinVersion:8});
 const api=buildSystemBackup({db,bucket,auth,Timestamp,GeoPoint,FieldValue:{},HttpsError,ownerUid:'owner',projectId:'fatihcayevi',now:()=>clock});const call=(name,data={},uid='owner')=>api[name]({auth:uid?{uid}:null,data});return{db,bucket,auth,api,call,advance:n=>clock+=n};}
function types(db=new MemoryDB){return{db,Timestamp,GeoPoint}}
function payload(rows=[],assets=[]){const collections=[...new Set(rows.map(x=>x.path.split('/').slice(0,-1).join('/')))];return core.seal({app:'Fatih Çay Evi',type:'full-application-backup',backupVersion:5,projectId:'fatihcayevi',scope:'business-data-and-site-assets',complete:true,createdAt:'2026-10-18T20:00:00.000Z',createdAtMs:1,excludedCollections:core.EXCLUDED,collections,documents:rows,assets,authIdentities:[],totalRecords:rows.length,totalAssets:assets.length});}
function row(path,value){const data=core.encode(value);return{path,data,sha256:core.hash(data)}}
async function stored(f,name){return JSON.parse((await f.bucket.file('system-backups/'+name).download())[0].toString())}
async function restore(f,backup){const start=await f.call('start',{name:backup.name,checksum:backup.checksum,confirmation:'GERİ YÜKLE'});let r;do{r=await f.call('resume',{jobId:start.jobId})}while(!r.completed);return r;}


module.exports={clone,MemoryDB,MemoryBucket,Timestamp,GeoPoint,HttpsError,fixture,types,payload,row,stored,restore};

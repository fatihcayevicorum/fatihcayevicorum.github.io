'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildEmailReport}=require('../email-report');
function fixture(){
 const store=new Map(),mails=[];let clock=1800000000000,providerFails=false;
 const snapshot=p=>({exists:store.has(p),data:()=>structuredClone(store.get(p))});
 const ref=p=>({path:p,get:async()=>snapshot(p),set:async(d,o)=>store.set(p,o?.merge?{...store.get(p),...structuredClone(d)}:structuredClone(d))});
 const db={doc:ref,runTransaction:async fn=>{const writes=[];const result=await fn({get:async r=>snapshot(r.path),set:(r,d)=>writes.push([r.path,structuredClone(d)])});for(const [p,d]of writes)store.set(p,d);return result}};
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code}}
 const api=buildEmailReport({db,FieldValue:{serverTimestamp:()=>123},HttpsError,requireOwner:r=>{if(r.auth?.uid!=='owner')throw new HttpsError('permission-denied','owner')},now:()=>clock,randomInt:()=>123456,fetchImpl:async(url,opts)=>{mails.push({url,...opts,body:JSON.parse(opts.body)});if(providerFails)throw Error('sensitive-provider-details');return {ok:true,json:async()=>({id:'mail-123'})}}});
 const call=(name,data,uid='owner')=>api[name]({data,auth:{uid}});
 return {call,store,mails,advance:()=>clock+=61000,fail:()=>providerFails=true};
}
process.env.RESEND_API_KEY='test-only-placeholder';
test('email: server denies non-owner reads, mutations and sends',async()=>{
 const f=fixture();for(const [name,data]of [['settings',{}],['settings',{action:'preferences'}],['send',{action:'verification'}]])await assert.rejects(f.call(name,data,'staff'),{code:'permission-denied'});assert.equal(f.store.size,0);assert.equal(f.mails.length,0);
});
test('email: initial state, normalization, revision and archived recipients',async()=>{
 const f=fixture();let s=await f.call('settings',{});assert.equal(s.automaticEnabled,false);assert.equal(s.recipients[0].verified,false);
 s=await f.call('settings',{action:'recipient',revision:s.revision,email:' Test@Example.com ',active:true});assert.equal(s.recipients[1].email,'test@example.com');
 await assert.rejects(f.call('settings',{action:'remove',revision:0,id:s.recipients[1].id}),{code:'aborted'});
 const id=s.recipients[1].id;s=await f.call('settings',{action:'remove',revision:s.revision,id});assert.equal(s.recipients.length,1);assert.equal(f.store.get('adminEmailReport/settings').recipients.length,2);
 await assert.rejects(f.call('settings',{action:'recipient',revision:s.revision,email:'bad\n@address',active:true}),{code:'invalid-argument'});
 await assert.rejects(f.call('settings',{action:'preferences',revision:s.revision,automaticEnabled:true}),{code:'failed-precondition'});
});
test('email: verification, attempt persistence, single use and verified-only test',async()=>{
 const f=fixture();let s=await f.call('settings',{}),id=s.recipients[0].id;
 await assert.rejects(f.call('send',{action:'test',id}),{code:'failed-precondition'});
 await f.call('send',{action:'verification',id});assert.equal(f.mails.length,1);assert.match(f.mails[0].body.text,/123456/);
 assert.equal(f.store.get('adminEmailReport/settings').revision,0);const challenge=f.store.get(`adminEmailVerification/${id}`);assert.equal(JSON.stringify(challenge).includes('123456'),false);
 await assert.rejects(f.call('settings',{action:'verify',id,code:'000000',revision:0}),{code:'permission-denied'});assert.equal(f.store.get(`adminEmailVerification/${id}`).attempts,1);
 s=await f.call('settings',{action:'verify',id,code:'123456',revision:0});assert.equal(s.recipients[0].verified,true);
 await assert.rejects(f.call('settings',{action:'verify',id,code:'123456',revision:s.revision}),{code:'failed-precondition'});
 await assert.rejects(f.call('send',{action:'test',id}),{code:'resource-exhausted'});
 f.advance();await f.call('send',{action:'test',id});assert.match(f.mails[1].body.text,/finansal bilgi içermez/);assert.ok(f.mails[1].headers['Idempotency-Key']);
});
test('email: expired code and lock after five wrong attempts',async()=>{
 const f=fixture(),s=await f.call('settings',{}),id=s.recipients[0].id;await f.call('send',{action:'verification',id});
 for(let i=0;i<5;i++)await assert.rejects(f.call('settings',{action:'verify',revision:0,id,code:'000000'}),{code:'permission-denied'});
 await assert.rejects(f.call('settings',{action:'verify',revision:0,id,code:'123456'}),{code:'failed-precondition'});
 f.advance();await f.call('send',{action:'verification',id});for(let i=0;i<10;i++)f.advance();await assert.rejects(f.call('settings',{action:'verify',revision:0,id,code:'123456'}),{code:'failed-precondition'});
});
test('email: provider failure preserves non-financial audit and hides secrets',async()=>{
 const f=fixture(),s=await f.call('settings',{});f.fail();await assert.rejects(f.call('send',{action:'verification',id:s.recipients[0].id}),e=>e.code==='unavailable'&&!e.message.includes('sensitive'));
 const job=[...f.store.entries()].find(([p])=>p.startsWith('adminEmailSendJobs/'))[1];assert.equal(job.status,'unknown_or_failed');assert.equal(JSON.stringify(job).includes('test-only-placeholder'),false);
});
test('email: passive recipients cannot receive and settings preserve preferences',async()=>{
 const f=fixture();let s=await f.call('settings',{});s=await f.call('settings',{action:'preferences',revision:s.revision,detailed:false,pdf:false,automaticEnabled:false});assert.equal(s.detailed,false);
 s=await f.call('settings',{action:'recipient',revision:s.revision,email:s.recipients[0].email,active:false});await assert.rejects(f.call('send',{action:'verification',id:s.recipients[0].id}),{code:'failed-precondition'});
});
test('email: client rule fallback excludes all private email collections',()=>{
 const fs=require('node:fs'),path=require('node:path');const rules=fs.readFileSync(path.join(__dirname,'../../firestore.rules'),'utf8');const fallback=rules.slice(rules.indexOf('match /{collection}/{document=**}'));
 for(const name of ['adminEmailReport','adminEmailVerification','adminEmailSendJobs'])assert.equal(fallback.split("'"+name+"'").length-1,2);
});

test('email: enabling requires verification; edits keep enable epoch and unrelated recipient updates keep automatic on',async()=>{
 const f=fixture();let s=await f.call('settings',{}),id=s.recipients[0].id;
 await assert.rejects(f.call('settings',{action:'preferences',revision:s.revision,detailed:true,pdf:true,automaticEnabled:true}),{code:'failed-precondition'});
 await f.call('send',{action:'verification',id});s=await f.call('settings',{action:'verify',id,code:'123456',revision:s.revision});
 s=await f.call('settings',{action:'preferences',revision:s.revision,detailed:true,pdf:true,automaticEnabled:true});assert.equal(s.automaticAvailable,true);assert.equal(s.automaticEnabled,true);const epoch=f.store.get('adminEmailReport/settings').enabledSinceMs;
 f.advance();s=await f.call('settings',{action:'preferences',revision:s.revision,detailed:false,pdf:false,automaticEnabled:true});assert.equal(f.store.get('adminEmailReport/settings').enabledSinceMs,epoch);
 s=await f.call('settings',{action:'recipient',revision:s.revision,email:'other@example.com',active:true});assert.equal(s.automaticEnabled,true);
 s=await f.call('settings',{action:'preferences',revision:s.revision,detailed:true,pdf:true,automaticEnabled:false});s=await f.call('settings',{action:'preferences',revision:s.revision,detailed:true,pdf:true,automaticEnabled:true});assert.ok(f.store.get('adminEmailReport/settings').enabledSinceMs>epoch);
});

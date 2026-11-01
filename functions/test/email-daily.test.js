'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildDailyEmail}=require('../email-daily');
const {buildDailyReport,reportText,renderDailyPdf}=require('../email-daily-report');
const date='2026-11-02',stamp=1793574000000;
const closing={businessDate:date,accountingMode:'report-only',cashTransferDisabled:true,salesTotal:300,roundingTotal:5,cashTotal:105,transferTotal:20,cardTotal:30,currentAccountCash:10,currentAccountTransfer:0,currentAccountCard:0,tipTotal:5,orderCount:2,itemCount:3,giftCount:1,merchantTeaCount:4,brewedPotCount:2,products:[{name:'Çay',quantity:3,unitPrice:15,total:45}]};
const movement=(extra={})=>({businessDate:date,type:'income',account:'cash',amount:100,...extra});
function fixture({enabled=true,pdf=false}={}){
 let clock=stamp,mode='ok',tail=Promise.resolve();const store=new Map(),mails=[];
 const config={revision:3,automaticEnabled:enabled,enabledSinceMs:stamp-1000,pdf,detailed:true,recipients:[{id:'a',email:'a@example.com',active:true,verified:true},{id:'b',email:'b@example.com',active:true,verified:false}]};
 store.set('adminEmailReport/settings',config);store.set(`adminFinanceDays/${date}`,{locked:true,businessDate:date,closedBy:'owner'});store.set('adminDailyClosings/close1',structuredClone(closing));store.set('adminCashMovements/m1',movement());
 const snap=p=>({id:p.split('/').pop(),exists:store.has(p),createTime:{toMillis:()=>stamp},data:()=>structuredClone(store.get(p))});
 const ref=p=>({path:p,get:async()=>snap(p),set:async(d,o)=>store.set(p,o?.merge?{...store.get(p),...structuredClone(d)}:structuredClone(d))});
 const db={doc:ref,collection:c=>({where:(key,op,value)=>({limit:limit=>({get:async()=>({docs:[...store.keys()].filter(p=>p.startsWith(c+'/')&&(op==='in'?value.includes(store.get(p)[key]):store.get(p)[key]===value)).slice(0,limit).map(snap)})})})}),runTransaction:fn=>{
  const result=tail.then(async()=>{const writes=[];const value=await fn({get:async r=>snap(r.path),set:(r,d)=>writes.push([r.path,structuredClone(d)])});for(const [p,d]of writes)store.set(p,d);return value});tail=result.catch(()=>{});return result;
 }};
 const api=buildDailyEmail({db,FieldValue:{},now:()=>clock,pause:async()=>{},fetchImpl:async(url,opts)=>{mails.push(opts);if(mode==='timeout')throw Error('private-provider-body');if(mode==='bad')return{ok:false,status:400};if(mode==='limit')return{ok:false,status:429};return{ok:true,json:async()=>({id:`mail-${mails.length}`})}}});
 const event={params:{businessDate:date},data:snap(`adminFinanceDays/${date}`)};
 return {api,event,store,mails,get config(){return store.get('adminEmailReport/settings')},queue:()=>api.onFinanceClosed(event),job:()=>store.get(`adminEmailDailyJobs/${date}`),mode:x=>mode=x,advance:ms=>clock+=ms};
}
process.env.RESEND_API_KEY='test-placeholder';
test('daily: finance totals separate current collection, transfers, POS expense and reversed items',()=>{
 const rows=[movement(),movement({account:'bank',amount:20}),movement({account:'card',amount:30}),movement({type:'expense',account:'card',amount:1.75}),movement({type:'expense',account:'creditCard',amount:10}),movement({type:'transfer',fromAccount:'cash',toAccount:'bank',amount:50}),movement({reversed:true,amount:999}),movement({source:'savings',type:'transfer',fromAccount:'bank',toAccount:'savings',amountCents:1000})];
 const before=JSON.stringify(rows),r=buildDailyReport(date,[closing],rows);assert.equal(r.totals.income,15000);assert.equal(r.totals.expense,1175);assert.equal(r.totals.result,13825);assert.equal(r.totals.collection,15500);assert.equal(r.totals.current,1000);assert.equal(r.totals.sales,29500);assert.equal(r.net.cash,5000);assert.equal(r.net.bank,6000);assert.equal(r.net.card,2825);assert.equal(r.net.creditCard,1000);assert.equal(JSON.stringify(rows),before);assert.match(reportText(r,true),/Çay/);assert.doesNotMatch(reportText(r,false),/SATILAN ÜRÜNLER/);
});
test('daily: off switch, old closes and unknown current breakdown are explicit',async()=>{
 const f=fixture({enabled:false});await f.queue();assert.equal(f.job(),undefined);f.config.automaticEnabled=true;f.config.enabledSinceMs=stamp+1;await f.queue();assert.equal(f.job(),undefined);
 const old={...closing};delete old.currentAccountCash;const r=buildDailyReport(date,[old],[]);assert.equal(r.currentKnown,false);assert.match(reportText(r,false),/Ayrım kayıtlı değil/);
});
test('daily: enqueue race creates one immutable snapshot and sends only verified active recipients',async()=>{
 const f=fixture(),financeBefore=JSON.stringify(f.store.get(`adminFinanceDays/${date}`));await Promise.all([f.queue(),f.queue()]);assert.equal(f.job().recipients.length,1);
 f.store.get('adminDailyClosings/close1').products[0].name='changed later';await Promise.all([f.api.processJob(date),f.api.processJob(date)]);assert.equal(f.mails.length,1);assert.equal(f.job().status,'accepted');assert.match(JSON.parse(f.mails[0].body).text,/Çay/);assert.doesNotMatch(JSON.parse(f.mails[0].body).text,/changed later/);await f.api.processJob(date);await f.queue();assert.equal(f.mails.length,1);assert.equal(JSON.stringify(f.store.get(`adminFinanceDays/${date}`)),financeBefore);
});
test('daily: unknown outcome retries identical body/key; accepted recipient is never resent',async()=>{
 const f=fixture();f.config.recipients[1].verified=true;await f.queue();let calls=0;f.mode('timeout');await f.api.processJob(date);assert.equal(f.job().status,'retry');assert.equal(f.mails.length,2);f.mode('ok');f.advance(16*60000);await f.api.retryPending();assert.equal(f.job().status,'accepted');assert.equal(f.mails.length,4);assert.equal(f.mails[0].body,f.mails[2].body);assert.equal(f.mails[0].headers['Idempotency-Key'],f.mails[2].headers['Idempotency-Key']);await f.api.retryPending();assert.equal(f.mails.length,4);
});
test('daily: partial success does not repeat accepted mail on retry',async()=>{
 const f=fixture();f.config.recipients[1].verified=true;await f.queue();f.job().recipients[0].status='accepted';f.job().recipients[0].providerId='prior';await f.api.processJob(date);assert.equal(f.mails.length,1);assert.deepEqual(JSON.parse(f.mails[0].body).to,['b@example.com']);
});
test('daily: removal/disable before processing cancels queued delivery and recipient privacy is preserved',async()=>{
 const f=fixture();await f.queue();f.config.recipients[0].active=false;await f.api.processJob(date);assert.equal(f.job().status,'skipped');assert.equal(f.mails.length,0);
 const g=fixture();await g.queue();g.config.automaticEnabled=false;await g.api.processJob(date);assert.equal(g.mails.length,0);
});
test('daily: permanent rejection stops, rate limit retries and expired unknown outcomes require review',async()=>{
 const f=fixture();await f.queue();f.mode('bad');await f.api.processJob(date);assert.equal(f.job().status,'failed');f.advance(16*60000);await f.api.retryPending();assert.equal(f.mails.length,1);
 const g=fixture();await g.queue();g.mode('limit');await g.api.processJob(date);assert.equal(g.job().status,'retry');g.advance(21*3600000);await g.api.retryPending();assert.equal(g.job().status,'review');assert.equal(g.mails.length,1);assert.equal(JSON.stringify(g.job()).includes('test-placeholder'),false);
});
test('daily: recover expired lease without creating another job',async()=>{
 const f=fixture();await f.queue();Object.assign(f.job(),{status:'sending',leaseUntilMs:stamp+360000});await f.api.retryPending();assert.equal(f.mails.length,0);f.advance(400000);await f.api.retryPending();assert.equal(f.mails.length,1);
});
test('daily: real PDF has deterministic bytes, Turkish font and multiple-page support',async()=>{
 const r=buildDailyReport(date,[closing],[movement({type:'expense',description:'Çorum şeker gideri - ğıİŞüöç'})]);r.products=Array.from({length:80},(_,i)=>({name:`Ürün ${i+1} Çay`,quantity:3,unitPrice:1500,total:4500}));
 const a=await renderDailyPdf(r,true,stamp),b=await renderDailyPdf(r,true,stamp);assert.ok(a.length>10000);assert.equal(a.subarray(0,4).toString(),'%PDF');assert.deepEqual(a,b);assert.match(a.toString('latin1'),/DejaVuSans/);
});
test('daily: rule fallback protects financial report payloads from all client access',()=>{
 const s=require('node:fs').readFileSync(require('node:path').join(__dirname,'../../firestore.rules'),'utf8').split('match /{collection}/{document=**}')[1];assert.equal(s.split("'adminEmailDailyJobs'").length-1,2);
});

test('daily: PDF attachment and retry body remain identical; recipients never see another address',async()=>{
 const f=fixture({pdf:true});await f.queue();f.mode('timeout');await f.api.processJob(date);const body=JSON.parse(f.mails[0].body);assert.equal(Buffer.from(body.attachments[0].content,'base64').subarray(0,4).toString(),'%PDF');assert.deepEqual(body.to,['a@example.com']);assert.equal(body.bcc,undefined);assert.equal(body.cc,undefined);
 f.advance(16*60000);f.mode('ok');await f.api.retryPending();assert.equal(f.mails[0].body,f.mails[1].body);
});
test('daily: enabling again does not release jobs from an earlier enable period',async()=>{
 const f=fixture();await f.queue();f.config.enabledSinceMs=stamp+1000;await f.api.processJob(date);assert.equal(f.mails.length,0);assert.equal(f.job().status,'skipped');
});

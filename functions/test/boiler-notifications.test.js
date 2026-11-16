'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{baseline,decide,businessDayKey,DEFAULT_PREFERENCES,buildBoilerNotifications}=require('../smart-boiler-notifications');
const AT=Date.parse('2026-11-16T08:00:00+03:00'),BOOT='a'.repeat(32);
function state(patch={}){const at=patch.lastSeenAtMs??AT;return{paired:true,lastSeenAtMs:at,measuredAtMs:at,targetMeasuredAtMs:at,controlMeasuredAtMs:at,endaConnected:true,bootId:BOOT,temperatureC:60,targetTemperatureC:95,controlVerified:true,controlEnabled:true,heaterOutputKnown:true,heaterOn:true,powerCommand:null,endaErrorCode:0,...patch}}
function command(patch={}){return{id:'c'.repeat(32),status:'confirmed',enabled:true,expected:false,source:'manual',bootId:BOOT,createdAtMs:AT,...patch}}
test('boiler notifications: first deployment creates a silent baseline',()=>{const result=decide(state(),{},AT);assert.deepEqual(result.events,[]);assert.equal(result.next.initialized,true);assert.equal(result.next.bootId,BOOT)});
test('boiler notifications: one-minute outage and recovery are separate, deduplicated events',()=>{let monitor=baseline(state(),AT),result=decide(state(),monitor,AT+61_000);assert.deepEqual(result.events.map(x=>x.type),['system-offline']);monitor=result.next;result=decide(state(),monitor,AT+120_000);assert.deepEqual(result.events,[]);result=decide(state({lastSeenAtMs:AT+121_000}),result.next,AT+121_000);assert.deepEqual(result.events.map(x=>x.type),['esp-connected'])});
test('boiler notifications: new boot records first temperature and confirmed schedule command',()=>{const monitor=baseline(state(),AT),result=decide(state({bootId:'b'.repeat(32),lastSeenAtMs:AT+1000,powerCommand:command({bootId:'b'.repeat(32),source:'schedule'})}),monitor,AT+1000);assert.deepEqual(result.events.map(x=>x.type),['startup-temperature','power-on']);assert.equal(result.events[1].preference,'schedulePower')});
test('boiler notifications: target reached fires on a real edge only once per 03:00 business day',()=>{let monitor=baseline(state(),AT),result=decide(state({temperatureC:95,lastSeenAtMs:AT+1000}),monitor,AT+1000);assert.deepEqual(result.events.map(x=>x.type),['target-reached']);monitor=result.next;result=decide(state({temperatureC:96,lastSeenAtMs:AT+2000}),monitor,AT+2000);assert.deepEqual(result.events,[]);assert.equal(businessDayKey(Date.parse('2026-11-17T02:59:00+03:00')),'2026-11-16');assert.equal(businessDayKey(Date.parse('2026-11-17T03:00:00+03:00')),'2026-11-17')});
test('boiler notifications: overshoot waits five minutes and ENDA error code is distinct',()=>{let monitor=baseline(state({temperatureC:95}),AT),result=decide(state({temperatureC:98,lastSeenAtMs:AT+1000}),monitor,AT+1000);assert.deepEqual(result.events,[]);monitor=result.next;result=decide(state({temperatureC:98,lastSeenAtMs:AT+302_000,endaErrorCode:1}),monitor,AT+302_000);assert.deepEqual(result.events.map(x=>x.type),['temperature-overshoot','enda-error'])});
test('boiler notifications: device preferences are independent and existing Taze Dem sender remains intact',()=>{assert.equal(Object.keys(DEFAULT_PREFERENCES).length,12);const index=fs.readFileSync(path.join(__dirname,'../index.js'),'utf8');assert.match(index,/async function sendAdminTeaPush/);assert.match(index,/async function sendAdminBoilerPush/);assert.match(index,/boilerNotificationsEnabled===true/);assert.match(index,/runBoilerNotificationMonitor/)});

test('R667: old, unchanged, offline and wrong boot commands never produce power alerts',()=>{
 for(const patch of [{powerCommand:command({createdAtMs:AT-600_000})},{powerCommand:command({expected:true})},{powerCommand:command({bootId:'b'.repeat(32)})},{powerCommand:command(),endaConnected:false},{powerCommand:command(),controlEnabled:false},{powerCommand:command(),controlVerified:false}]){
 const result=decide(state({...patch,lastSeenAtMs:AT+1000}),baseline(state(),AT),AT+1000);assert.ok(!result.events.some(x=>x.type.startsWith('power-')));
 }
});
test('R667: fresh scheduled close is labeled closed; confirmed command fires once',()=>{
 const input=state({lastSeenAtMs:AT+1000,controlEnabled:false,powerCommand:command({enabled:false,expected:true,source:'schedule'})});
 const result=decide(input,baseline(state(),AT),AT+1000);
 assert.equal(result.events.length,1);assert.equal(result.events[0].type,'power-off');assert.match(result.events[0].title,/Programla Kapatıldı/);assert.match(result.events[0].body,/kapatıldı/);
 assert.deepEqual(decide(input,result.next,AT+2000).events,[]);
});
test('R667: normal operation close to a 100 C target and rising after water draw has no false warning',()=>{
 let monitor=baseline(state(),AT);
 for(let m=1;m<=25;m++){const at=AT+m*60_000,result=decide(state({lastSeenAtMs:at,targetTemperatureC:100,temperatureC:95+(m%3)}),monitor,at);monitor=result.next;assert.ok(!result.events.some(x=>x.type==='heating-no-rise'))}
});
test('R667: stalled far from target warns once after 15 continuous minutes; progress and gaps restart timer',()=>{
 let monitor=baseline(state(),AT),warnings=0;
 for(let m=1;m<=25;m++){const at=AT+m*60_000,result=decide(state({lastSeenAtMs:at}),monitor,at);monitor=result.next;if(result.events.some(x=>x.type==='heating-no-rise')){warnings++;assert.equal(m,16)}}
 assert.equal(warnings,1);
 for(const reason of ['progress','gap','target','off','stale','boot']){
  monitor=baseline(state(),AT);
  for(let m=1;m<=25;m++){
   if(reason==='gap'&&m>=10&&m<=13)continue;
   const at=AT+m*60_000,patch=reason==='progress'?{temperatureC:60+m*.2}:reason==='target'&&m>=12?{targetTemperatureC:96}:reason==='off'&&m===12?{heaterOn:false}:reason==='stale'&&m===12?{measuredAtMs:AT}:reason==='boot'&&m>=12?{bootId:'b'.repeat(32)}:{};
   const result=decide(state({lastSeenAtMs:at,...patch}),monitor,at);monitor=result.next;assert.ok(!result.events.some(x=>x.type==='heating-no-rise'),reason);
  }
 }
});
test('R667: recorded event cannot be sent again even after monitor state rollback',async()=>{
 const records=new Map([['adminBoilerState/kazan-1',state({lastSeenAtMs:AT+1000,powerCommand:command()})],['adminBoilerNotificationState/kazan-1',baseline(state(),AT)]]);
 const db={doc:key=>({key,set:async(value,opts)=>records.set(key,opts?.merge?{...records.get(key),...value}:value)}),runTransaction:async fn=>fn({get:async ref=>({exists:records.has(ref.key),data:()=>records.get(ref.key)}),set:(ref,value)=>records.set(ref.key,value)})};
 let sends=0;const monitor=buildBoilerNotifications({db,FieldValue:{serverTimestamp:()=>AT},now:()=>AT+1000,sendPush:async()=>{sends++;return{successCount:1}}});
 await monitor.run();records.set('adminBoilerNotificationState/kazan-1',baseline(state(),AT));await monitor.run();assert.equal(sends,1);
});

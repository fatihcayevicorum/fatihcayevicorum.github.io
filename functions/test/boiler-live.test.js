'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {buildSmartBoiler,parseSample}=require('../smart-boiler');
const NOW=1800000000000;
function sample(extra={}){return{deviceId:'kazan-1',sentAtMs:NOW,temperatureC:27,measuredAgeMs:500,endaConnected:true,firmwareVersion:'KazanFW 0.2.0-aday',...extra};}
function fixture(){const records=new Map();let at=NOW;const db={doc:p=>({path:p}),runTransaction:async f=>{const writes=[];const result=await f({get:async ref=>({data:()=>records.get(ref.path)}),set:(ref,data)=>writes.push([ref.path,data])});for(const [p,v]of writes)records.set(p,v);return result;}};class HttpsError extends Error{constructor(code,m){super(m);this.code=code;}}return{records,api:buildSmartBoiler({db,HttpsError,ownerUid:'owner',projectId:'test',now:()=>at}),tick:n=>at+=n};}
test('boiler: validates live readings, disconnected samples and timestamps',()=>{assert.equal(parseSample(sample(),NOW).measuredAtMs,NOW-500);assert.equal(parseSample(sample({endaConnected:false,temperatureC:null,measuredAgeMs:null}),NOW).temperatureC,null);for(const patch of [{temperatureC:NaN},{temperatureC:999},{measuredAgeMs:11000},{sentAtMs:NOW-31000},{sentAtMs:NOW+31000},{targetTemperatureC:90},{deviceId:'other'},{endaConnected:false}])assert.throws(()=>parseSample(sample(patch),NOW));});
test('boiler: owner pairing, hashed token and fresh measurement',async()=>{const f=fixture();await assert.rejects(f.api.configure({auth:{uid:'staff'},data:{action:'pair'}}));const r=await f.api.configure({auth:{uid:'owner'},data:{action:'pair'}});assert.match(r.token,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify([...f.records.values()]).includes(r.token),false);assert.deepEqual(await f.api.ingest('Bearer '+r.token,sample()),{accepted:true});assert.equal(f.records.get('adminBoilerState/kazan-1').temperatureC,27);await assert.rejects(f.api.ingest('Bearer '+'0'.repeat(64),sample()),{status:401});});
test('boiler: duplicate and old payload do not refresh last seen; rate limit',async()=>{const f=fixture(),r=await f.api.configure({auth:{uid:'owner'},data:{action:'pair'}}),auth='Bearer '+r.token;await f.api.ingest(auth,sample());f.tick(2000);assert.equal((await f.api.ingest(auth,sample())).duplicate,true);assert.equal(f.records.get('adminBoilerState/kazan-1').lastSeenAtMs,NOW);await assert.rejects(f.api.ingest(auth,sample({sentAtMs:NOW+2000})),{status:429});f.tick(13000);await f.api.ingest(auth,sample({sentAtMs:NOW+15000,endaConnected:false,temperatureC:null,measuredAgeMs:null}));assert.equal(f.records.get('adminBoilerState/kazan-1').temperatureC,null);});
test('boiler: rotation, revoke and maintenance fail closed',async()=>{const f=fixture(),r=await f.api.configure({auth:{uid:'owner'},data:{action:'pair'}});await f.api.configure({auth:{uid:'owner'},data:{action:'pair'}});await assert.rejects(f.api.ingest('Bearer '+r.token,sample()),{status:401});const r2=await f.api.configure({auth:{uid:'owner'},data:{action:'pair'}});f.records.set('adminBackupControl/state',{active:true});await assert.rejects(f.api.ingest('Bearer '+r2.token,sample()),{status:503});f.records.set('adminBackupControl/state',{active:false});await f.api.configure({auth:{uid:'owner'},data:{action:'revoke'}});await assert.rejects(f.api.ingest('Bearer '+r2.token,sample()),{status:401});});
test('boiler: browser rejects cache, stale data, lost ENDA and network',()=>{let source=fs.readFileSync(path.join(__dirname,'../../assets/js/smart-boiler-live.js'),'utf8').replace(/^import.*;$/gm,'').replaceAll('export function','function');const context={Date:{now:()=>NOW},navigator:{onLine:true},URL};vm.createContext(context);vm.runInContext(source+'\nthis.api={view,set:(d,o)=>{data=d;online=o;message="";}};',context);const d={paired:true,temperatureC:28,endaConnected:true,measuredAtMs:NOW-1000,lastSeenAtMs:NOW-1000};context.api.set(d,true);assert.equal(context.api.view().temperature,28);context.api.set(d,false);assert.equal(context.api.view().fresh,false);context.api.set({...d,measuredAtMs:NOW-46000},true);assert.equal(context.api.view().temperature,null);context.api.set({...d,endaConnected:false},true);assert.equal(context.api.view().fresh,false);context.api.set(d,true);context.navigator.onLine=false;assert.equal(context.api.view().temperature,null);});
test('boiler: explicit rules prohibit client writes and credential fallback',()=>{const rules=fs.readFileSync(path.join(__dirname,'../../firestore.rules'),'utf8');assert.match(rules,/match \/adminBoilerState\/\{device\} \{\s*allow read: if hasPanel\('tea'\);\s*allow write: if backupWritable\(\) && \(false\);/);assert.equal((rules.match(/'adminBoilerDevices', 'adminBoilerState'\]/g)||[]).length,2);assert.equal(require('../system-backup-core').excluded('adminBoilerDevices/kazan-1'),true);});
test('boiler settings: tablet cards and themed action buttons stay scoped to the boiler dialog',()=>{const base=path.join(__dirname,'../..'),html=fs.readFileSync(path.join(base,'tanimlamalar/index.html'),'utf8'),css=fs.readFileSync(path.join(base,'tanimlamalar/style.css'),'utf8'),js=fs.readFileSync(path.join(base,'assets/js/smart-boiler-settings.js'),'utf8');assert.equal((html.match(/class="boiler-settings-grid/g)||[]).length,2);for(const id of ['pairBoilerDevice','revokeBoilerDevice','saveBoilerTargetRange','uploadBoilerFirmware','startBoilerUpdate','cancelBoilerUpdate'])assert.match(html,new RegExp(`id="${id}"[^>]*boiler-system-button|id="${id}"[^>]*class="[^"]*boiler-system-button`));assert.match(html,/smart-boiler-settings\.js\?v=644/);assert.match(html,/id="cancelBoilerTargetRange"/);assert.match(css,/\.smart-boiler-settings-dialog/);assert.match(css,/\.boiler-control-grid>\.boiler-square-card/);assert.match(css,/--boiler-control-value-size/);assert.match(css,/input\[type=file\]::file-selector-button/);assert.match(css,/var\(--theme-primary/);assert.match(js,/rangeCancel\.disabled=rangeSaving\|\|!rangeDirty/);assert.match(js,/rangeSave\.disabled=rangeSaving\|\|!rangeDirty/);assert.match(js,/rangeCancel\.onclick=cancelRange/);});

test('boiler target: legacy firmware, separate freshness and invalid payloads',()=>{
 const old=parseSample(sample(),NOW);assert.equal(old.targetTemperatureC,null);
 const valid=parseSample(sample({targetTemperatureC:99,targetAgeMs:500}),NOW);assert.equal(valid.targetTemperatureC,99);assert.equal(valid.targetMeasuredAtMs,NOW-500);
 for(const patch of [{targetTemperatureC:99},{targetTemperatureC:999,targetAgeMs:1},{targetTemperatureC:99,targetAgeMs:11000},{targetTemperatureC:null,targetAgeMs:1},{targetTemperatureC:99,targetAgeMs:1,endaConnected:false,temperatureC:null,measuredAgeMs:null}])assert.throws(()=>parseSample(sample(patch),NOW));
});
test('boiler target: fresh value, stale target, old firmware and offline',()=>{
 let source=fs.readFileSync(path.join(__dirname,'../../assets/js/smart-boiler-live.js'),'utf8').replace(/^import.*;$/gm,'').replaceAll('export function','function');const ctx={Date:{now:()=>NOW},navigator:{onLine:true},URL};vm.createContext(ctx);vm.runInContext(source+'\nthis.api={view,set:d=>{data=d;online=true;message="";}};',ctx);
 const d={paired:true,temperatureC:28,endaConnected:true,measuredAtMs:NOW-1000,lastSeenAtMs:NOW-1000,targetTemperatureC:99,targetMeasuredAtMs:NOW-1000};ctx.api.set(d);assert.equal(ctx.api.view().target,99);
 ctx.api.set({...d,targetMeasuredAtMs:NOW-46000});assert.equal(ctx.api.view().target,null);assert.equal(ctx.api.view().temperature,28);
 ctx.api.set({...d,targetTemperatureC:null});assert.equal(ctx.api.view().target,null);
 ctx.api.set(d);ctx.navigator.onLine=false;assert.equal(ctx.api.view().target,null);
});
function controlSample(extra={}){return sample({targetTemperatureC:95,targetAgeMs:500,bootId:'b'.repeat(32),control:{min:20,max:100,register:0,decimal:0},...extra})}
async function pairedControl(){const f=fixture(),r=await f.api.configure({auth:{uid:'owner'},data:{action:'pair'}});f.token='Bearer '+r.token;await f.api.ingest(f.token,controlSample());return f}
function command(extra={}){return{auth:{uid:'owner'},data:{id:'a'.repeat(32),target:99,expected:95,sentAtMs:NOW,...extra}}}
test('control: owner, range, legacy device and stale target guards',async()=>{const f=await pairedControl();await assert.rejects(f.api.setTarget({...command(),auth:{uid:'staff'}}));for(const patch of [{target:101},{target:19},{target:99.5},{expected:94},{sentAtMs:NOW-20000}])await assert.rejects(f.api.setTarget(command(patch)));f.tick(21000);await assert.rejects(f.api.setTarget(command({sentAtMs:NOW+21000})));});
test('control: dispatch once, explicit readback acknowledgement, duplicate request',async()=>{const f=await pairedControl();await f.api.setTarget(command());await f.api.setTarget(command());await assert.rejects(f.api.setTarget(command({id:'c'.repeat(32)})));f.tick(15000);const r=await f.api.ingest(f.token,controlSample({sentAtMs:NOW+15000}));assert.match(r.command,/^a{32},990,950,0,0,/);f.tick(5000);assert.equal((await f.api.ingest(f.token,controlSample({sentAtMs:NOW+20000}))).command,undefined);assert.equal(f.records.get('adminBoilerState/kazan-1').command.status,'dispatched');f.tick(5000);await f.api.ingest(f.token,controlSample({sentAtMs:NOW+25000,targetTemperatureC:99,result:{id:'a'.repeat(32),status:'confirmed'}}));assert.equal(f.records.get('adminBoilerState/kazan-1').command.status,'confirmed')});
test('control: manual change or reboot rejects pending command',async()=>{for(const patch of [{targetTemperatureC:96},{bootId:'c'.repeat(32)}]){const f=await pairedControl();await f.api.setTarget(command());f.tick(15000);assert.equal((await f.api.ingest(f.token,controlSample({sentAtMs:NOW+15000,...patch}))).command,undefined);assert.equal(f.records.get('adminBoilerState/kazan-1').command.status,'rejected')}});
test('control: expired pending never delivered and lost reply stays unknown',async()=>{for(const dispatch of [false,true]){const f=await pairedControl();await f.api.setTarget(command());if(dispatch){f.tick(15000);await f.api.ingest(f.token,controlSample({sentAtMs:NOW+15000}));f.tick(16000)}else f.tick(31000);assert.equal((await f.api.ingest(f.token,controlSample({sentAtMs:NOW+31000}))).command,undefined);assert.equal(f.records.get('adminBoilerState/kazan-1').command.status,dispatch?'unknown':'expired')}});
test('control: maintenance and revoke prevent writes',async()=>{const f=await pairedControl();f.records.set('adminBackupControl/state',{active:true});await assert.rejects(f.api.setTarget(command()));f.records.set('adminBackupControl/state',{active:false});await f.api.configure({auth:{uid:'owner'},data:{action:'revoke'}});await assert.rejects(f.api.setTarget(command()));});
test('control range: owner confirmation endpoint persists safe limits and server enforces them',async()=>{const f=await pairedControl();await assert.rejects(f.api.setTargetRange({auth:{uid:'staff'},data:{min:30,max:100}}));for(const data of [{min:19,max:100},{min:20,max:101},{min:90,max:90},{min:30,max:90}])await assert.rejects(f.api.setTargetRange({auth:{uid:'owner'},data}));assert.deepEqual(await f.api.setTargetRange({auth:{uid:'owner'},data:{min:30,max:95}}),{min:30,max:95});assert.deepEqual(f.records.get('adminBoilerState/kazan-1').targetRange,{min:30,max:95,updatedAtMs:NOW,updatedBy:'owner'});await assert.rejects(f.api.setTarget(command()));});
test('control range: pairing rotation preserves the configured target limits',async()=>{const f=await pairedControl();await f.api.setTargetRange({auth:{uid:'owner'},data:{min:30,max:95}});await f.api.configure({auth:{uid:'owner'},data:{action:'pair'}});assert.deepEqual(f.records.get('adminBoilerState/kazan-1').targetRange,{min:30,max:95});});

function hysteresisSample(extra={}){return controlSample({hysteresis:{onOff:true,value:3},...extra})}
async function pairedHysteresis(extra={}){const f=fixture(),r=await f.api.configure({auth:{uid:'owner'},data:{action:'pair'}});f.token='Bearer '+r.token;await f.api.ingest(f.token,hysteresisSample(extra));return f}
function hysteresisCommand(extra={}){return{auth:{uid:'owner'},data:{id:'d'.repeat(32),value:4,expected:3,sentAtMs:NOW,...extra}}}
test('hysteresis telemetry: validates mode and official 1-50 device range',()=>{
 const valid=parseSample(hysteresisSample(),NOW);assert.equal(valid.hysteresisOnOff,true);assert.equal(valid.hysteresisC,3);
 for(const hysteresis of [{onOff:true,value:0},{onOff:true,value:51},{onOff:'yes',value:3},{onOff:false,value:2,extra:true}])assert.throws(()=>parseSample(hysteresisSample({hysteresis}),NOW));
});
test('hysteresis control: owner, 1-10 UI range, ON/OFF and current-value guards',async()=>{
 const f=await pairedHysteresis();await assert.rejects(f.api.setHysteresis({...hysteresisCommand(),auth:{uid:'staff'}}));
 for(const patch of [{value:0},{value:11},{value:4.5},{expected:2},{sentAtMs:NOW-20000}])await assert.rejects(f.api.setHysteresis(hysteresisCommand(patch)));
 const pid=await pairedHysteresis({hysteresis:{onOff:false,value:3}});await assert.rejects(pid.api.setHysteresis(hysteresisCommand()));
});
test('hysteresis control: dispatches once and confirms only after ENDA readback',async()=>{
 const f=await pairedHysteresis();await f.api.setHysteresis(hysteresisCommand());await f.api.setHysteresis(hysteresisCommand());await assert.rejects(f.api.setTarget(command({id:'e'.repeat(32)})));
 f.tick(15000);const r=await f.api.ingest(f.token,hysteresisSample({sentAtMs:NOW+15000}));assert.match(r.hysteresisCommand,/^d{32},4,3,/);assert.equal(f.records.get('adminBoilerState/kazan-1').hysteresisCommand.status,'dispatched');
 f.tick(5000);await f.api.ingest(f.token,hysteresisSample({sentAtMs:NOW+20000,hysteresis:{onOff:true,value:4},hysteresisResult:{id:'d'.repeat(32),status:'confirmed'}}));assert.equal(f.records.get('adminBoilerState/kazan-1').hysteresisCommand.status,'confirmed');
});
test('hysteresis control: mode change, reboot and stale command fail closed',async()=>{
 for(const patch of [{hysteresis:{onOff:false,value:3}},{bootId:'c'.repeat(32)}]){const f=await pairedHysteresis();await f.api.setHysteresis(hysteresisCommand());f.tick(15000);assert.equal((await f.api.ingest(f.token,hysteresisSample({sentAtMs:NOW+15000,...patch}))).hysteresisCommand,undefined);assert.equal(f.records.get('adminBoilerState/kazan-1').hysteresisCommand.status,'rejected');}
});

// R639 — kalibrasyon, cihaz adı ve yeni Akıllı Kazan pencereleri.
test('boiler calibration: owner-only, validated, concurrency-safe, kept after pairing and device samples',async()=>{
 const f=fixture(),owner={auth:{uid:'owner'}};
 await assert.rejects(f.api.setCalibration({auth:{uid:'staff'},data:{value:1,expected:0}}),{code:'permission-denied'});
 for(const bad of [{value:6,expected:0},{value:-5.1,expected:0},{value:0.25,expected:0},{value:'1',expected:0},{value:NaN,expected:0},{value:1},{value:1,expected:0,extra:1}])await assert.rejects(f.api.setCalibration({...owner,data:bad}),{code:'invalid-argument'});
 assert.deepEqual(await f.api.setCalibration({...owner,data:{value:-1.5,expected:0}}),{value:-1.5});
 assert.equal(f.records.get('adminBoilerState/kazan-1').calibration.valueC,-1.5);
 await assert.rejects(f.api.setCalibration({...owner,data:{value:2,expected:0}}),{code:'failed-precondition'});
 assert.deepEqual(await f.api.setCalibration({...owner,data:{value:5,expected:-1.5}}),{value:5});
 assert.deepEqual(await f.api.setCalibration({...owner,data:{value:-0,expected:5}}),{value:0});
 await f.api.setCalibration({...owner,data:{value:2.5,expected:0}});
 const r=await f.api.configure({...owner,data:{action:'pair'}});
 assert.equal(f.records.get('adminBoilerState/kazan-1').calibration.valueC,2.5);
 await f.api.ingest('Bearer '+r.token,sample());
 const saved=f.records.get('adminBoilerState/kazan-1');
 assert.equal(saved.calibration.valueC,2.5);assert.equal(saved.temperatureC,27);
 f.records.set('adminBackupControl/state',{active:true});
 await assert.rejects(f.api.setCalibration({...owner,data:{value:1,expected:2.5}}),{code:'unavailable'});
});
test('boiler device name: owner-only, safe characters; device id, token and records stay untouched',async()=>{
 const f=fixture(),owner={auth:{uid:'owner'}},r=await f.api.configure({...owner,data:{action:'pair'}});
 await assert.rejects(f.api.setDeviceName({auth:{uid:'staff'},data:{name:'Ocak'}}),{code:'permission-denied'});
 for(const bad of [{name:''},{name:'   '},{name:'<b>x</b>'},{name:'a'.repeat(33)},{name:'-ilk'},{name:12},{name:'x',extra:1},{}])await assert.rejects(f.api.setDeviceName({...owner,data:bad}),{code:'invalid-argument'});
 assert.deepEqual(await f.api.setDeviceName({...owner,data:{name:'  Çay   Ocağı 1 '}}),{name:'Çay Ocağı 1'});
 let saved=f.records.get('adminBoilerState/kazan-1');
 assert.equal(saved.deviceName,'Çay Ocağı 1');assert.equal(saved.deviceId,'kazan-1');assert.equal(saved.paired,true);
 assert.deepEqual(await f.api.ingest('Bearer '+r.token,sample()),{accepted:true});
 saved=f.records.get('adminBoilerState/kazan-1');
 assert.equal(saved.deviceName,'Çay Ocağı 1');assert.equal(saved.deviceId,'kazan-1');assert.equal(saved.temperatureC,27);
 await f.api.configure({...owner,data:{action:'revoke'}});
 assert.equal(f.records.get('adminBoilerState/kazan-1').deviceName,'Çay Ocağı 1');
 f.records.set('adminBackupControl/state',{active:true});
 await assert.rejects(f.api.setDeviceName({...owner,data:{name:'Yeni'}}),{code:'unavailable'});
});
test('boiler calibration: shown temperature is corrected, heating phase keeps the raw reading, invalid values ignored',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../assets/js/smart-boiler-live.js'),'utf8').replace(/^import.*;$/gm,'').replaceAll('export function','function');
 const context={Date:{now:()=>NOW},navigator:{onLine:true},URL};vm.createContext(context);vm.runInContext(source+'\nthis.api={view,set:(d,o)=>{data=d;online=o;message="";}};',context);
 const d={paired:true,temperatureC:90,endaConnected:true,measuredAtMs:NOW-1000,lastSeenAtMs:NOW-1000,targetTemperatureC:90.4,targetMeasuredAtMs:NOW-1000,heaterOutputKnown:true,heaterOn:false};
 context.api.set(d,true);assert.equal(context.api.view().temperature,90);assert.equal(context.api.view().calibration,0);
 context.api.set({...d,calibration:{valueC:-2.5}},true);const v=context.api.view();
 assert.equal(v.temperature,87.5);assert.equal(v.rawTemperature,90);assert.equal(v.calibration,-2.5);assert.equal(v.phase,'reached');
 for(const bad of [9,-6,'x',NaN,null,undefined]){context.api.set({...d,calibration:{valueC:bad}},true);assert.equal(context.api.view().temperature,90);assert.equal(context.api.view().calibration,0)}
 context.api.set({...d,measuredAtMs:NOW-60000,calibration:{valueC:1}},true);assert.equal(context.api.view().temperature,null);
});
test('tea widget: shown boiler temperature is corrected, phase uses the raw reading',()=>{
 const {boilerView}=require('../widget-tea');
 const s={paired:true,endaConnected:true,temperatureC:90,measuredAtMs:NOW-1000,lastSeenAtMs:NOW-1000,targetTemperatureC:90.4,targetMeasuredAtMs:NOW-1000,heaterOutputKnown:true,heaterOn:false};
 assert.equal(boilerView(s,NOW).temperatureC,90);
 const v=boilerView({...s,calibration:{valueC:-2.5}},NOW);
 assert.equal(v.temperatureC,87.5);assert.equal(v.temperatureText,'88 °C');assert.equal(v.phase,'reached');
 assert.equal(boilerView({...s,calibration:{valueC:12}},NOW).temperatureC,90);
 assert.equal(boilerView({...s,calibration:{valueC:1},measuredAtMs:NOW-60000},NOW).temperatureC,null);
});
test('boiler settings page: header buttons, three side-by-side cards, firmware card and device tools in their own windows',()=>{
 const base=path.join(__dirname,'../..'),html=fs.readFileSync(path.join(base,'tanimlamalar/index.html'),'utf8'),css=fs.readFileSync(path.join(base,'tanimlamalar/style.css'),'utf8'),js=fs.readFileSync(path.join(base,'assets/js/smart-boiler-settings.js'),'utf8'),index=fs.readFileSync(path.join(base,'functions/index.js'),'utf8');
 const block=id=>{const start=html.indexOf(`<dialog id="${id}"`);assert.ok(start>=0,id);return html.slice(start,html.indexOf('</dialog>',start))};
 const main=block('smartBoilerSettingsDialog'),update=block('boilerUpdateDialog'),device=block('boilerDeviceDialog');
 for(const id of ['openBoilerUpdateDialog','openBoilerDeviceDialog'])assert.ok(main.indexOf(`id="${id}"`)>0&&main.indexOf(`id="${id}"`)<main.indexOf('boiler-control-grid'),id);
 assert.equal((main.match(/boiler-square-card/g)||[]).length,3);
 assert.ok(main.indexOf('boiler-target-range')<main.indexOf('id="boilerHysteresisSettings"')&&main.indexOf('id="boilerHysteresisSettings"')<main.indexOf('id="boilerCalibrationSettings"'));
 for(const id of ['boilerFirmwareCurrent','boilerFirmwareFile','boilerFirmwareVersion','boilerFirmwareSelect','pairBoilerDevice','revokeBoilerDevice','boilerDeviceName'])assert.doesNotMatch(main,new RegExp(`id="${id}"`),`${id} ana pencerede kalmamalı`);
 for(const id of ['boilerFirmwareCurrent','boilerFirmwareVersion','boilerFirmwareFile','uploadBoilerFirmware','boilerFirmwareSelect','startBoilerUpdate','cancelBoilerUpdate'])assert.match(update,new RegExp(`id="${id}"`),id);
 for(const id of ['pairBoilerDevice','revokeBoilerDevice','boilerConnectionState','boilerLastSeen','boilerDeviceId','boilerDeviceName','saveBoilerDeviceName'])assert.match(device,new RegExp(`id="${id}"`),id);
 assert.match(css,/@media\(min-width:701px\)\{\.boiler-control-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'yinelenen kimlik var');
 for(const m of js.matchAll(/\$\('([A-Za-z]+)'\)/g))assert.ok(ids.includes(m[1]),`JS'in beklediği kimlik sayfada yok: ${m[1]}`);
 assert.match(js,/setBoilerCalibration/);assert.match(js,/renameBoilerDevice/);assert.match(index,/exports\.setBoilerCalibration=/);assert.match(index,/exports\.renameBoilerDevice=/);
 assert.match(js,/key==='Enter'&&event\.target\.tagName==='INPUT'/);
});


"use strict";
const crypto=require('node:crypto');
const MAX_BYTES=100*1024*1024,MAX_DOCUMENTS=50000;
const EXCLUDED=Object.freeze(['adminSecurity','sensitivePinAttempts','adminSavingsSessions','adminHistorySessions','adminHistoryAttempts','adminTeaPushDevices','merchantPushDevices','customerPushDevices','publicPresence','accountDevices','adminBackupControl','adminBackupJobs','adminBackupLeases']);
function fail(message){const e=Error(message);e.code='invalid-argument';throw e;}
// Feed the canonical representation incrementally instead of allocating another
// complete JSON copy of every document and asset for each checksum.
function hash(value){const digest=crypto.createHash('sha256');if(typeof value==='string'||Buffer.isBuffer(value))return digest.update(value).digest('hex');let parts=[],size=0;
 const emit=text=>{parts.push(text);size+=text.length;if(size>=65536){digest.update(parts.join(''));parts=[];size=0;}};
 const visit=v=>{if(v===null||typeof v!=='object'){emit(JSON.stringify(v));return;}if(Array.isArray(v)){emit('[');v.forEach((x,i)=>{if(i)emit(',');visit(x)});emit(']');return;}emit('{');Object.keys(v).sort().forEach((k,i)=>{if(i)emit(',');emit(JSON.stringify(k));emit(':');visit(v[k])});emit('}');};
 visit(value);if(parts.length)digest.update(parts.join(''));return digest.digest('hex');}
function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
function excluded(path){const parts=path.split('/');return EXCLUDED.includes(parts[0])||parts.some((x,i)=>i%2===0&&x==='devices');}
function documentPath(path){if(typeof path!=='string'||Buffer.byteLength(path)>6000)fail('Belge yolu geçersiz.');const parts=path.split('/');if(parts.length%2||parts.some(x=>!x||x==='.'||x==='..'||/^__.*__$/.test(x)))fail('Belge yolu geçersiz.');return path;}
function assetPath(path){if(typeof path!=='string'||!path.startsWith('site/')||path.endsWith('/')||path.split('/').some(x=>!x||x==='.'||x==='..')||Buffer.byteLength(path)>1024)fail('Görsel yolu geçersiz.');return path;}
function encode(v,depth=0){
 if(depth>50)fail('Veri fazla iç içe.');
 if(v===null)return {t:'null'};
 if(typeof v==='string'||typeof v==='boolean')return {t:typeof v,v};
 if(typeof v==='number')return {t:'number',v:Number.isFinite(v)?v:String(v)};
 if(v instanceof Date)return {t:'date',v:v.toISOString()};
 if(Buffer.isBuffer(v)||v instanceof Uint8Array)return {t:'bytes',v:Buffer.from(v).toString('base64')};
 if(v&&typeof v.toMillis==='function'&&Number.isInteger(v.seconds)&&Number.isInteger(v.nanoseconds))return {t:'timestamp',s:v.seconds,n:v.nanoseconds};
 if(v&&v.constructor?.name==='GeoPoint')return {t:'geopoint',v:[v.latitude,v.longitude]};
 if(v&&typeof v.path==='string'&&typeof v.get==='function')return {t:'reference',v:documentPath(v.path)};
 if(Array.isArray(v))return {t:'array',v:v.map(x=>encode(x,depth+1))};
 if(v&&[Object.prototype,null].includes(Object.getPrototypeOf(v)))return {t:'map',v:Object.keys(v).sort().map(k=>[k,encode(v[k],depth+1)])};
 fail('Desteklenmeyen veri türü; yedek eksik oluşturulmadı.');
}
function decode(x,{Timestamp,GeoPoint,db},depth=0){
 if(!x||typeof x!=='object'||Array.isArray(x)||depth>50)fail('Veri türü geçersiz.');
 const only=keys=>{if(Object.keys(x).some(k=>!keys.includes(k)))fail('Veri alanı geçersiz.');};
 if(x.t==='null'){only(['t']);return null;}
 only(x.t==='timestamp'?['t','s','n']:['t','v']);
 switch(x.t){
 case 'string':case 'boolean':if(typeof x.v!==x.t)fail('Veri değeri geçersiz.');return x.v;
 case 'number':if(typeof x.v==='number'&&Number.isFinite(x.v))return x.v;if(['NaN','Infinity','-Infinity'].includes(x.v))return Number(x.v);break;
 case 'timestamp':if(Number.isInteger(x.s)&&x.s>=-62135596800&&x.s<=253402300799&&Number.isInteger(x.n)&&x.n>=0&&x.n<1e9)return new Timestamp(x.s,x.n);break;
 case 'date':if(typeof x.v==='string'&&Number.isFinite(Date.parse(x.v)))return new Date(x.v);break;
 case 'bytes':if(typeof x.v==='string'&&Buffer.from(x.v,'base64').toString('base64')===x.v)return Buffer.from(x.v,'base64');break;
 case 'geopoint':if(Array.isArray(x.v)&&x.v.length===2&&x.v.every(Number.isFinite)&&Math.abs(x.v[0])<=90&&Math.abs(x.v[1])<=180)return new GeoPoint(...x.v);break;
 case 'reference':return db.doc(documentPath(x.v));
 case 'array':if(Array.isArray(x.v))return x.v.map(v=>decode(v,{Timestamp,GeoPoint,db},depth+1));break;
 case 'map':{if(!Array.isArray(x.v))break;const seen=new Set();return Object.fromEntries(x.v.map(pair=>{if(!Array.isArray(pair)||pair.length!==2||typeof pair[0]!=='string'||seen.has(pair[0]))fail('Tekrarlanan veya geçersiz veri alanı.');seen.add(pair[0]);return[pair[0],decode(pair[1],{Timestamp,GeoPoint,db},depth+1)];}));}
 }
 fail('Veri türü veya değeri geçersiz.');
}
function seal(data){const payload={...data};delete payload.checksum;return {...payload,checksum:hash(payload)};}
function validate(data,{projectId,types,retainDecoded=true}){
 if(!data||data.app!=='Fatih Çay Evi'||data.type!=='full-application-backup'||data.backupVersion!==5)fail('Bu dosya doğrulanmış yeni tam işletme yedeği değil. Eski JSON yedekler otomatik tam geri yüklenmez.');
 if(data.projectId!==projectId)fail('Yedek farklı bir Firebase projesine ait.');
 const {checksum,...payload}=data;if(typeof checksum!=='string'||hash(payload)!==checksum)fail('Yedek bütünlük doğrulaması başarısız.');
 if(data.scope!=='business-data-and-site-assets'||canonical(data.excludedCollections)!==canonical(EXCLUDED)||!Array.isArray(data.documents)||!Array.isArray(data.assets)||!Array.isArray(data.authIdentities)||!Array.isArray(data.collections)||data.documents.length>MAX_DOCUMENTS)fail('Yedek kapsamı geçersiz.');
 if(data.totalRecords!==data.documents.length||data.totalAssets!==data.assets.length||data.complete!==true)fail('Yedek kayıt sayısı veya tamamlanma bilgisi uyuşmuyor.');
 const declared=new Set();for(const path of data.collections){documentPath(path+'/placeholder');if(excluded(path+'/placeholder')||declared.has(path))fail('Koleksiyon kapsamı geçersiz.');declared.add(path);}
 const ordered=rows=>rows.map(x=>x.path).join('\n')===rows.map(x=>x.path).sort((a,b)=>a.localeCompare(b,'en')).join('\n');if(!ordered(data.documents)||!ordered(data.assets))fail('Yedek kayıt sırası geçersiz.');
 const storageValue=v=>{if(v instanceof Date)fail('Belge tarihi zaman damgası biçiminde olmalı.');if(v instanceof types.Timestamp&&v.nanoseconds%1000!==0)fail('Zaman damgası saklama hassasiyetine uymuyor.');if(Array.isArray(v))v.forEach(storageValue);else if(v&&Object.getPrototypeOf(v)===Object.prototype)Object.values(v).forEach(storageValue);};
 const seen=new Set(),decoded=new Map();
 for(const row of data.documents){if(!row||Object.keys(row).some(k=>!['path','data','sha256'].includes(k)))fail('Belge kaydı geçersiz.');documentPath(row.path);if(excluded(row.path)||seen.has(row.path)||!declared.has(row.path.split('/').slice(0,-1).join('/')))fail('Yasak, tekrarlanan veya kapsam dışı belge.');seen.add(row.path);if(hash(row.data)!==row.sha256)fail('Belge sağlaması uyuşmuyor.');if(row.data?.t!=='map')fail('Belge bir alan haritası olmalı.');const value=decode(row.data,types);storageValue(value);if(hash(encode(value))!==row.sha256)fail('Belge veri biçimi standart değil.');if(Buffer.byteLength(JSON.stringify(row.data))>2*1024*1024)fail('Belge çok büyük.');if(retainDecoded||/^(staffUsers|merchantProfiles|adminSavingsOperations|adminSavingsAccounts|adminSavingsLedger)\//.test(row.path))decoded.set(row.path,value);}
 const paths=new Set();for(const asset of data.assets){if(!asset||Object.keys(asset).length!==7||Object.keys(asset).some(k=>!['path','base64','bytes','sha256','contentType','metadata','cacheControl'].includes(k)))fail('Görsel kaydı geçersiz.');assetPath(asset.path);if(paths.has(asset.path)||typeof asset.base64!=='string'||Buffer.from(asset.base64,'base64').toString('base64')!==asset.base64)fail('Görsel verisi geçersiz.');paths.add(asset.path);if(asset.metadata!==undefined&&(!asset.metadata||typeof asset.metadata!=='object'||Array.isArray(asset.metadata)||Object.entries(asset.metadata).some(([k,v])=>!k||typeof v!=='string')))fail('Görsel metaverisi geçersiz.');if(asset.cacheControl!==undefined&&typeof asset.cacheControl!=='string')fail('Görsel önbellek bilgisi geçersiz.');const bytes=Buffer.from(asset.base64,'base64');if(asset.bytes!==bytes.length||hash(bytes)!==asset.sha256||typeof asset.contentType!=='string')fail('Görsel sağlaması uyuşmuyor.');}
 const identities=new Set();for(const u of data.authIdentities){if(!u||typeof u.uid!=='string'||!u.uid||identities.has(u.uid)||Object.keys(u).some(k=>!['uid','email','disabled'].includes(k)))fail('Giriş kimlikleri geçersiz.');identities.add(u.uid);}
 for(const [path,d] of decoded){if((path.startsWith('staffUsers/')||path.startsWith('merchantProfiles/'))&&!path.includes('/devices/')){const uid=path.split('/')[1];if(!identities.has(uid))fail('Kullanıcı kartının giriş kimliği yedekte eksik.');}if(path.startsWith('adminSavingsOperations/')&&d.accountId&&!decoded.has('adminSavingsAccounts/'+d.accountId))fail('Birikim işleminin hesabı yedekte eksik.');}
 // Unit reconciliation includes reversal ledger entries, never valuation or TL rounding.
 const ledger=[...decoded].filter(([p])=>p.startsWith('adminSavingsLedger/')).map(([,d])=>d).filter(d=>d.side==='asset');
 for(const [path,account] of decoded){if(!path.startsWith('adminSavingsAccounts/'))continue;const rows=ledger.filter(d=>d.accountId===path.split('/')[1]);const total=rows.reduce((n,d)=>{if(!Number.isSafeInteger(d.amountScaled)||!['in','out'].includes(d.direction))fail('Birikim defteri geçersiz.');return n+BigInt(d.direction==='in'?d.amountScaled:-d.amountScaled);},0n);if(!Number.isSafeInteger(account.balanceUnits)||BigInt(account.balanceUnits)!==total)fail('Birikim miktarı ve işlem defteri uyuşmuyor.');}
 if(Buffer.byteLength(JSON.stringify(data))>MAX_BYTES)fail('Yedek boyut sınırını aşıyor.');
 return {data,decoded};
}
function planRestore(currentPaths,currentAssets,data){const wanted=new Set(data.documents.map(x=>x.path)),assets=new Set(data.assets.map(x=>x.path));return {deleteDocuments:currentPaths.filter(x=>!wanted.has(x)).sort(),deleteAssets:currentAssets.filter(x=>!assets.has(x)).sort()};}
module.exports={MAX_BYTES,MAX_DOCUMENTS,EXCLUDED,canonical,hash,excluded,documentPath,assetPath,encode,decode,seal,validate,planRestore};

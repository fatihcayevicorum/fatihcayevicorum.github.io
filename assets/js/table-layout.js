// R521: masa kimliklerini koruyan ortak bölge/masa ayarları.
export const DEFAULT_REGION={id:'salon',name:'Salon'};
export const MAX_TABLES=50;
const copy=value=>JSON.parse(JSON.stringify(value));
export function normalizeTableLayout(data={}){
  const regions=(Array.isArray(data.tableRegions)?data.tableRegions:[]).filter((r,i,a)=>r&&typeof r.id==='string'&&r.id&&a.findIndex(x=>x?.id===r.id)===i).map(r=>({id:r.id,name:String(r.name||'Bölge').slice(0,40)}));
  if(!regions.length)regions.push({...DEFAULT_REGION});
  const fallback=regions.find(r=>r.id==='salon')?.id||regions[0].id;
  const legacyCount=Math.min(50,Math.max(1,Math.floor(Number(data.tableCount)||15)));
  const slots=Array.isArray(data.tableSlots)?data.tableSlots:Array.from({length:legacyCount},(_,i)=>({key:`table-${i+1}`}));
  const tables=slots.filter((t,i,a)=>t&&/^table-[1-9]\d*$/.test(t.key)&&a.findIndex(x=>x?.key===t.key)===i).map(t=>({key:t.key,name:String(t.name||'').slice(0,60),active:t.active!==false,regionId:regions.some(r=>r.id===t.regionId)?t.regionId:fallback}));
  const highWater=Math.max(0,Math.floor(Number(data.tableNextNumber)||0)-1,Number(data.tableCount)||0,...tables.map(t=>Number(t.key.slice(6))));
  return{enabled:data.regionSystemEnabled===true,regions,tables,nextNumber:highWater+1};
}
export function cloneTableLayout(layout){return copy(layout)}
export function tableLayoutSignature(layout){return JSON.stringify(layout)}
export function openTableKeys(orders=[]){return new Set(orders.filter(o=>o.status!=='closed'&&o.status!=='cancelled'&&/^table-[1-9]\d*$/.test(o.slotKey)).map(o=>o.slotKey))}
export function availableLayoutTables(layout,orders=[]){
  const open=openTableKeys(orders),tables=layout.tables.filter(t=>t.active||open.has(t.key));
  for(const key of open)if(!tables.some(t=>t.key===key))tables.push({key,name:'',active:true,regionId:layout.regions[0].id});
  return tables;
}
export function validateTableLayout(next,orders=[]){
  if(!next.regions.length)throw new Error('En az bir bölge bulunmalı.');
  if(next.regions.some(r=>!r.name.trim()))throw new Error('Bölge adını yazın.');
  const names=next.regions.map(r=>r.name.trim().toLocaleLowerCase('tr-TR'));
  if(new Set(names).size!==names.length)throw new Error('Bölge adları farklı olmalı.');
  if(!next.tables.length||next.tables.length>MAX_TABLES)throw new Error(`Toplam masa sayısı 1–${MAX_TABLES} arasında olmalı.`);
  if(new Set(next.tables.map(t=>t.key)).size!==next.tables.length)throw new Error('Masa kimlikleri tekrar edemez.');
  if(next.tables.some(t=>!next.regions.some(r=>r.id===t.regionId)))throw new Error('Her masa bir bölgeye bağlı olmalı.');
  for(const key of openTableKeys(orders)){const table=next.tables.find(t=>t.key===key);if(!table||!table.active)throw new Error(`${key.slice(6)} numaralı masada açık adisyon var. Masa silinemez, azaltılamaz veya pasife alınamaz.`)}
}
export function resizeTableLayout(layout,counts,orders=[]){
  const next=cloneTableLayout(layout);
  const targets=layout.enabled?layout.regions.map(r=>({id:r.id,count:Number(counts[r.id])})): [{id:null,count:Number(counts.total)}];
  for(const target of targets)if(!Number.isInteger(target.count)||target.count<0||target.count>MAX_TABLES)throw new Error(`Masa sayısı 0–${MAX_TABLES} arasında tam sayı olmalı.`);
  const total=targets.reduce((sum,t)=>sum+t.count,0);
  if(total<1||total>MAX_TABLES)throw new Error(`Toplam masa sayısı 1–${MAX_TABLES} arasında olmalı.`);
  // Önce azalt; diğer bölgelere eklenen masalar hiçbir zaman eski kimliği kullanmaz.
  for(const {id,count} of targets){const tables=next.tables.filter(t=>id===null||t.regionId===id),remove=new Set(tables.slice(count).map(t=>t.key));next.tables=next.tables.filter(t=>!remove.has(t.key))}
  for(const {id,count} of targets){let size=next.tables.filter(t=>id===null||t.regionId===id).length;while(size++<count)next.tables.push({key:`table-${next.nextNumber++}`,name:'',active:true,regionId:id||next.regions.find(r=>r.id==='salon')?.id||next.regions[0].id})}
  validateTableLayout(next,orders);return next;
}
export function tableLayoutPayload(layout){return{regionSystemEnabled:layout.enabled,tableRegions:layout.regions.map(r=>({id:r.id,name:r.name.trim()})),tableSlots:layout.tables.map(t=>({...t,name:t.name.trim()})),tableNextNumber:layout.nextNumber,tableCount:layout.tables.length}}
// Sadece ayar belgesine yaz; adisyon, ödeme ve geçmiş kayıtlarını değiştirme.
export async function persistTableLayout({db,ref,current,next,orders,runTransaction,serverTimestamp,extra={}}){
  validateTableLayout(next,orders);
  await runTransaction(db,async tx=>{
    const snap=await tx.get(ref),latest=normalizeTableLayout(snap.data()||{});
    if(tableLayoutSignature(latest)!==tableLayoutSignature(current))throw new Error('Masa ayarları başka bir cihazda değişti. Pencereyi kapatıp yeniden açın.');
    validateTableLayout(next,orders);
    tx.set(ref,{...tableLayoutPayload(next),...extra,updatedAt:serverTimestamp()},{merge:true});
  });
}

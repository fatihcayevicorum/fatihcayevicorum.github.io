// R522: durum renklerinden ayrı, sınırlı boş masa paleti ve bölge simgeleri.
export const REGION_COLORS=[
 {id:'default',name:'Kırmızı',start:'#c74048',end:'#9b242d'},
 {id:'purple',name:'Mor',start:'#7955aa',end:'#533777'},
 {id:'plum',name:'Mürdüm',start:'#925473',end:'#66374f'},
 {id:'graphite',name:'Antrasit',start:'#59565e',end:'#39363e'},
 {id:'stone',name:'Taş Grisi',start:'#7a7772',end:'#55524e'},
 {id:'brown',name:'Kahverengi',start:'#8b6752',end:'#624634'}
];
export const REGION_ICONS=[{id:'chair',name:'Sandalye',fa:'chair'},{id:'umbrella',name:'Şemsiye',fa:'umbrella-beach'},{id:'bench',name:'Bank'},{id:'couch',name:'Koltuk',fa:'couch'},{id:'tree',name:'Ağaç',fa:'tree'},{id:'house',name:'Ev',fa:'house'},{id:'shop',name:'Dükkan',fa:'shop'}];
export function regionColor(id){return REGION_COLORS.find(c=>c.id===id)||REGION_COLORS[0]}
export function regionIconMarkup(id){const icon=REGION_ICONS.find(i=>i.id===id)||REGION_ICONS[0];return icon.id==='bench'?'<svg class="region-bench-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 7h22v10H5zM3 21h26M7 17v11m18-11v11M5 12h22"/></svg>':`<i class="fa-solid fa-${icon.fa}" aria-hidden="true"></i>`}
export function regionAppearance(layout,key){const table=layout.tables.find(t=>t.key===key),region=layout.regions.find(r=>r.id===table?.regionId);return{color:regionColor(region?.emptyColor),icon:region?.tableIcon||'chair'}}
export function regionStyleMarkup(layout,key){const {color}=regionAppearance(layout,key);return `style="--region-start:${color.start};--region-end:${color.end}"`}
// R521: masa kimliklerini koruyan ortak bölge/masa ayarları.
export const DEFAULT_REGION={id:'salon',name:'Salon'};
export const MAX_TABLES=50;
const copy=value=>JSON.parse(JSON.stringify(value));
export function normalizeTableLayout(data={}){
  const regions=(Array.isArray(data.tableRegions)?data.tableRegions:[]).filter((r,i,a)=>r&&typeof r.id==='string'&&r.id&&a.findIndex(x=>x?.id===r.id)===i).map(r=>({id:r.id,name:String(r.name||'Bölge').slice(0,40),emptyColor:regionColor(r.emptyColor).id,tableIcon:REGION_ICONS.some(i=>i.id===r.tableIcon)?r.tableIcon:'chair',nextTableNumber:Math.max(1,Math.floor(Number(r.nextTableNumber)||1))}));
  if(!regions.length)regions.push({...DEFAULT_REGION,emptyColor:'default',tableIcon:'chair'});
  const fallback=regions.find(r=>r.id==='salon')?.id||regions[0].id;
  const legacyCount=Math.min(50,Math.max(1,Math.floor(Number(data.tableCount)||15)));
  const slots=Array.isArray(data.tableSlots)?data.tableSlots:Array.from({length:legacyCount},(_,i)=>({key:`table-${i+1}`}));
  const tables=slots.filter((t,i,a)=>t&&/^table-[1-9]\d*$/.test(t.key)&&a.findIndex(x=>x?.key===t.key)===i).map(t=>({key:t.key,name:String(t.name||'').slice(0,60),active:t.active!==false,regionNumber:Math.max(0,Math.floor(Number(t.regionNumber)||0)),regionId:regions.some(r=>r.id===t.regionId)?t.regionId:fallback}));
  const highWater=Math.max(0,Math.floor(Number(data.tableNextNumber)||0)-1,Number(data.tableCount)||0,...tables.map(t=>Number(t.key.slice(6))));
  return numberRegionTables({enabled:data.regionSystemEnabled===true,regions,tables,nextNumber:highWater+1});
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
  for(const {id,count} of targets){let size=next.tables.filter(t=>id===null||t.regionId===id).length;while(size++<count)appendRegionTable(next,id||next.regions.find(r=>r.id==='salon')?.id||next.regions[0].id)}
  validateTableLayout(next,orders);return next;
}
export function tableLayoutPayload(layout){return{regionSystemEnabled:layout.enabled,tableRegions:layout.regions.map(r=>({id:r.id,name:r.name.trim(),emptyColor:regionColor(r.emptyColor).id,tableIcon:REGION_ICONS.some(i=>i.id===r.tableIcon)?r.tableIcon:'chair',nextTableNumber:r.nextTableNumber})),tableSlots:layout.tables.map(t=>({...t,name:t.name.trim()})),tableNextNumber:layout.nextNumber,tableCount:layout.tables.length}}
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

// R523: bölge numarası kalıcıdır; silme/sıralama diğer masaları yeniden numaralandırmaz.
export function numberRegionTables(layout){
 for(const region of layout.regions){const used=new Set();for(const table of layout.tables.filter(t=>t.regionId===region.id)){let n=Number(table.regionNumber);if(!Number.isInteger(n)||n<1||used.has(n)){n=1;while(used.has(n))n++}table.regionNumber=n;used.add(n)}region.nextTableNumber=Math.max(Number(region.nextTableNumber)||1,...[...used].map(n=>n+1))}
 return layout;
}
export function automaticTableTitle(layout,key){const table=layout.tables.find(t=>t.key===key),region=layout.regions.find(r=>r.id===table?.regionId);return table&&region?`${region.name.trim()} ${table.regionNumber}`:''}
export function appendRegionTable(layout,regionId){
 if(layout.tables.length>=MAX_TABLES)throw new Error(`En fazla ${MAX_TABLES} masa tanımlanabilir.`);
 const region=layout.regions.find(r=>r.id===regionId);if(!region)throw new Error('Bölge bulunamadı.');
 numberRegionTables(layout);const table={key:`table-${layout.nextNumber++}`,name:'',active:true,regionId,regionNumber:region.nextTableNumber++};layout.tables.push(table);return table;
}
export function transferRegionTables(layout,fromId,toId){const region=layout.regions.find(r=>r.id===toId);if(!region)throw new Error('Hedef bölge bulunamadı.');numberRegionTables(layout);for(const table of layout.tables.filter(t=>t.regionId===fromId)){table.regionId=toId;table.regionNumber=region.nextTableNumber++}}

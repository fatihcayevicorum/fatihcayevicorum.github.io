// R601 — Seçilmiş adisyon kayıtlarından salt okunur ürün grubu özeti.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function buildProductGroupSummary(records,definitions){
 const groups=definitions.map(g=>({id:g.id,name:g.name,sold:0,gift:0,marka:0,total:0,rows:new Map()})),links=new Map();
 definitions.forEach((g,i)=>(g.products||[]).forEach(p=>{const factor=Number(p.factor);if(p.id&&!links.has(p.id)&&Number.isFinite(factor)&&factor>0)links.set(p.id,{group:groups[i],factor});}));
 const other={id:'ungrouped',name:'Gruplanmamış Ürünler',sold:0,gift:0,marka:0,total:0,rows:new Map()};
 function add(item,type){const qty=Number(item.quantity);if(!Number.isFinite(qty)||qty<=0)return;const link=links.get(item.id),g=link?.group||other,factor=link?.factor||1,key=item.id||'legacy:'+String(item.name||'Ürün'),row=g.rows.get(key)||{name:item.name||'Ürün',factor,sold:0,gift:0,marka:0,total:0};row[type]+=qty;row.total+=qty;g[type]+=qty*factor;g.total+=qty*factor;g.rows.set(key,row);}
 for(const sale of records){if(sale.reversed===true||sale.cancelled===true||(sale.recordType&&sale.recordType!=='sale'))continue;
  const marka=sale.paymentType==='merchant-marka'||sale.settlementType==='merchant-marka'||sale.merchantMarka===true;
  for(const item of sale.items||[])add(item,item.complimentary?'gift':marka?'marka':'sold');
  if(marka&&!(sale.items||[]).length)add({name:'Esnaf Çay (Marka) · ürün bağlantısı yok',quantity:sale.merchantTeaCount??sale.merchantMarkaCount},'marka');
 }
 return [...groups,...(other.rows.size?[other]:[])].map(g=>({...g,rows:[...g.rows.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'tr'))}));
}
export function productGroupCards(groups){
 const number=v=>Number(v).toLocaleString('tr-TR',{maximumFractionDigits:2});
 const row=(name,qty)=>`<div class="daily-group-row"><span>${esc(name)}</span><b>${number(qty)} adet</b></div>`;
 return '<div class="daily-group-grid">'+(groups.map(g=>{
  const regular=g.rows.filter(p=>p.sold>0).map(p=>row(p.name,p.sold)).join('');
  const gifts=g.rows.filter(p=>p.gift>0).map(p=>row('İkram '+p.name,p.gift)).join('');
  const marka=g.marka>0?row('Marka',g.marka):'';
  return `<article class="daily-group-card"><header><h3>${esc(g.name)}</h3><strong>${number(g.total)}</strong></header><div class="daily-group-rows" tabindex="0" aria-label="${esc(g.name)} ürün listesi">${regular+gifts+marka||'<p class="daily-products-empty">Henüz ürün yok.</p>'}</div></article>`;
 }).join('')||'<p class="daily-products-empty">Henüz ürün kaydı yok.</p>')+'</div>';
}

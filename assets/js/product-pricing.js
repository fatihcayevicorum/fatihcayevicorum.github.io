// R526: tek katalog, kuruş yuvarlaması ve ürün bazında fiyat değişikliği.
export const priceCents=value=>Math.round((Number(value)||0)*100);
export function checkedPrice(value){const n=Number(String(value).replace(',','.'));if(!Number.isFinite(n)||n<0||n>99999)throw new Error('Fiyat 0–99.999 TL arasında olmalı.');return priceCents(n)/100}
export function bulkPricePreview(items,ids,mode,value){const n=Number(String(value).replace(',','.'));if(!Number.isFinite(n)||n<0)throw new Error('Geçerli bir değişim miktarı girin.');const selected=new Set(ids);return items.filter(p=>selected.has(p.id)&&!p.archived).map(p=>{let price=Number(p.price)||0;if(mode==='add')price+=n;else if(mode==='subtract')price-=n;else if(mode==='increase-percent')price*=1+n/100;else if(mode==='decrease-percent')price*=1-n/100;else throw new Error('İşlem türü geçersiz.');return{id:p.id,name:p.name,oldPrice:Number(p.price)||0,newPrice:checkedPrice(Math.round(price*100)/100)}})}
export function mergeCatalogChanges(current,base,next){
 const out={...current};
 for(const field of ['categories','items','bundleRules']){
  const before=new Map((base[field]||[]).map(x=>[x.id,x])),proposed=new Map((next[field]||[]).map(x=>[x.id,x]));
  const merged=new Map((current[field]||[]).map(x=>[x.id,{...x}]));
  for(const [id,old]of before)if(!proposed.has(id)&&merged.has(id)){if(field==='items')merged.set(id,{...merged.get(id),available:false,archived:true,posVisible:false});else if(field==='categories'&&(out.items||current.items||[]).some(p=>p.categoryId===id))merged.set(id,{...merged.get(id),customerVisible:false});else merged.delete(id)}
  for(const [id,n]of proposed){const old=before.get(id),live=merged.get(id);if(!old){if(live)throw new Error('Bu kayıt başka bir cihazda oluşturuldu. Sayfayı yenileyin.');merged.set(id,{...n});continue}if(!live)throw new Error('Kayıt başka bir cihazda kaldırıldı. Sayfayı yenileyin.');for(const key of Object.keys(n)){if(JSON.stringify(n[key])===JSON.stringify(old[key]))continue;if(JSON.stringify(live[key])!==JSON.stringify(old[key]))throw new Error('Aynı alan başka bir cihazda değişti. Güncel kayıtla yeniden deneyin.');live[key]=n[key]}}
  out[field]=[...merged.values()];
 }
 return out;
}

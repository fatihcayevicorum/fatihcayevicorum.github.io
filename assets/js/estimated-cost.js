// Estimated material costs only: this module never mutates stock.
export function portionCost(group){
 const {price,grams,used,yield:yieldCount}=group;
 return Math.round(Number(price)/Number(grams)*Number(used)/Number(yieldCount)*1e8)/1e8;
}
export function validateCostGroups(groups){
 const assigned=new Set();
 for(const g of groups){
  if(!g.name?.trim()||!['price','grams','used','yield'].every(k=>Number.isFinite(Number(g[k]))&&Number(g[k])>0))throw new Error('Grup adı ve sıfırdan büyük fiyat / miktarlar gerekli.');

  for(const p of g.products){if(!p.id||!Number.isFinite(Number(p.factor))||Number(p.factor)<=0)throw new Error('Ürün katsayısı sıfırdan büyük olmalı.');if(assigned.has(p.id))throw new Error('Bir ürün yalnızca bir maliyet grubuna bağlanabilir.');assigned.add(p.id);}
 }
 return true;
}
export function estimatedCostFor(productId,sale,settings){
 const versions=[...(settings.estimatedCostVersions||[])].sort((a,b)=>a.at-b.at);
 if(!versions.length)return null;
 const stamp=Number(sale.closedAtMs)||sale.closedAt?.toMillis?.()||sale.createdAt?.toMillis?.()||Number(sale.createdAtMs)||Date.parse(`${sale.businessDate}T00:00:00+03:00`);
 // Before an item's first definition use its first recorded estimate; later changes apply prospectively.
 const eligible=versions.filter(v=>v.at<=stamp),version=eligible.at(-1);
 let group=version?.groups?.find(g=>g.products.some(p=>p.id===productId));
 if(!group){const first=versions.find(v=>v.groups?.some(g=>g.products.some(p=>p.id===productId)));if(!first||first.at<=stamp)return null;group=first.groups.find(g=>g.products.some(p=>p.id===productId));}
 const link=group.products.find(p=>p.id===productId),value=portionCost(group)*Number(link.factor);
 return Number.isFinite(value)&&value>0?{unitCost:value,estimated:true}:null;
}

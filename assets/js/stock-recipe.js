// R363: shared stock quantities for direct sales and ingredient recipes.
export function stockLinks(productId, catalog, stocks) {
 const recipe=catalog.items?.find(p=>p.id===productId)?.recipe;
 if(Array.isArray(recipe)&&recipe.length) return recipe.map(r=>{
  const stock=stocks.find(s=>s.id===r.stockItemId);
  return {...stock,id:r.stockItemId,deductionAmount:Number(r.amount),recipeIngredient:true,
   unavailable:!stock||stock.active===false||stock.stockTrackingEnabled===false};
 });
 return stocks.filter(s=>s.active!==false&&s.automaticDeduction&&s.linkedMenuItemId===productId);
}
export function stockRequirements(items,catalog,stocks){
 const result=new Map();
 for(const line of items||[])for(const stock of stockLinks(line.id,catalog,stocks)){
  const amount=stock.recipeIngredient?Number(stock.deductionAmount):(Number(stock.deductionAmount)||1);
  if(!Number.isFinite(amount)||amount<=0||stock.unavailable)throw new Error('recipe-stock-unavailable');
  const qty=amount*(Number(line.quantity)||0);if(qty<=0)continue;
  const old=result.get(stock.id);result.set(stock.id,{stock,qty:Math.round(((old?.qty||0)+qty)*1e8)/1e8});
 }
 return [...result.values()];
}
export function saleStockReturns(sale,stocks){
 if(Array.isArray(sale.stockDeductions))return sale.stockDeductions.map(d=>({stock:{id:d.stockItemId},qty:Number(d.amount)||0})).filter(d=>d.qty>0);
 return stocks.filter(s=>s.active!==false&&s.automaticDeduction&&s.linkedMenuItemId).map(stock=>({stock,qty:(sale.items||[]).filter(i=>i.id===stock.linkedMenuItemId).reduce((n,i)=>n+(Number(i.quantity)||0),0)*(Number(stock.deductionAmount)||1)})).filter(d=>d.qty>0);
}

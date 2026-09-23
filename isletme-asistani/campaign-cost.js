import {estimatedCostFor} from '../assets/js/estimated-cost.js?v=364';
function materialLinks(product,stocks){return (product?.recipe||[]).map(r=>({id:r.stockItemId,stock:stocks.find(s=>s.id===r.stockItemId),amount:Number(r.amount)}));}
function totalMaterials(links){let cost=0,missing=!links.length;for(const l of links){const unit=Number(l.stock?.unitCost);if(!Number.isFinite(unit)||unit<=0||!Number.isFinite(l.amount)||l.amount<=0){missing=true;continue;}cost+=unit*l.amount;}return{cost,missing};}
export function productMaterialCost(id,sale,catalog,stocks,settings){
 const product=catalog.items.find(p=>p.id===id),estimate=estimatedCostFor(id,sale,settings),mode=product?.costMode||'auto';
 const useRecipe=mode==='recipe'||mode==='combined'||(mode==='auto'&&!estimate&&product?.recipe?.length);
 const ingredients=useRecipe?materialLinks(product,stocks):[];
 if(useRecipe){const recipe=totalMaterials(ingredients),base=mode==='combined'?estimate?.unitCost||0:0;return{unitCost:base+recipe.cost,missing:recipe.missing||(mode==='combined'&&!estimate),estimated:true,ingredients};}
 if(mode==='estimate'||estimate)return{unitCost:estimate?.unitCost||0,missing:!estimate,estimated:true,ingredients:[]};
 const links=stocks.filter(s=>s.active!==false&&s.linkedMenuItemId===id).map(stock=>({stock,amount:Number(stock.deductionAmount)||1}));const direct=totalMaterials(links);return{unitCost:direct.cost,missing:direct.missing,estimated:false,ingredients:[]};
}
// Actual campaign gifts only. Recipe overlap is counted once in the cost report.
export function campaignGiftCosts(sale,catalog,stocks,settings={}){
 const result=new Map(),items=sale.items||[];
 for(const gift of items){
  if(!gift.complimentary||!gift.automaticBundle||!(Number(gift.quantity)>0))continue;
  const rule=(catalog.bundleRules||[]).find(r=>r.id===gift.bundleRuleId),parentId=gift.bundleTriggerProductId||rule?.triggerProductId;
  const parentQuantity=items.filter(i=>i.id===parentId&&!i.complimentary&&!i.automaticBundle).reduce((n,i)=>n+(Number(i.quantity)||0),0);
  if(!parentId||!parentQuantity)continue;
  const product=catalog.items.find(i=>i.id===gift.id),links=product?.recipe?.length?materialLinks(product,stocks):stocks.filter(s=>s.linkedMenuItemId===gift.id).map(stock=>({id:stock.id,stock,amount:Number(stock.deductionAmount)||1}));
  const row=result.get(parentId)||{cost:0,missing:false,parentQuantity,materials:new Map()};
  if(!links.length)row.missing=true;
  for(const l of links){const unit=Number(l.stock?.unitCost);if(!Number.isFinite(unit)||unit<=0||!Number.isFinite(l.amount)||l.amount<=0){row.missing=true;continue;}const amount=Number(gift.quantity)*l.amount,old=row.materials.get(l.id);row.materials.set(l.id,{amount:(old?.amount||0)+amount,unit});}
  result.set(parentId,row);
 }
 for(const[id,row]of result){const base=productMaterialCost(id,sale,catalog,stocks,settings),covered=new Map();for(const l of base.ingredients)covered.set(l.id,(covered.get(l.id)||0)+l.amount*row.parentQuantity);for(const[stockId,m]of row.materials)row.cost+=Math.max(0,m.amount-(covered.get(stockId)||0))*m.unit;delete row.materials;}
 return result;
}

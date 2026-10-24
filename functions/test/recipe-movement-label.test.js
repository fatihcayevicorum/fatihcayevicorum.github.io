const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'assets/js/stock-recipe.js'),'utf8').replace(/export /g,''),ctx);
const ui=fs.readFileSync(path.join(root,'stok-yonetimi/script.js'),'utf8');
vm.runInContext(ui.match(/function movementLabel\(type\)\{[^\n]+/)[0]+'\n'+ui.slice(ui.indexOf('function stockMovementLabel(x)')),Object.assign(ctx,{formatNumber:n=>String(n)}));
const stocks=[{id:'water',linkedMenuItemId:'water-sale',automaticDeduction:true,quantity:20}],catalog={items:[{id:'drink',recipe:[{stockItemId:'water',amount:0.5}]}]};
test('recipe attribution preserves total stock and is independent of sale line order',()=>{
 const lines=[{id:'drink',quantity:4},{id:'water-sale',quantity:3}];
 for(const items of [lines,[...lines].reverse()]){const [d]=ctx.stockRequirements(items,catalog,stocks);assert.equal(d.qty,5);assert.equal(d.stock.recipeDeductionAmount,2);assert.equal(ctx.stockMovementLabel({type:'out',amount:d.qty,recipeAmount:d.stock.recipeDeductionAmount,source:'pos'}),'Reçete Düşüm (2) / Adisyon Satışı (3)');}
 assert.equal(stocks[0].recipeDeductionAmount,undefined);
});
test('recipe only labels, old movements and returns keep their meaning',()=>{
 const [d]=ctx.stockRequirements([{id:'drink',quantity:4}],catalog,stocks);assert.equal(d.qty,2);assert.equal(d.stock.recipeDeductionAmount,2);
 assert.equal(ctx.stockMovementLabel({type:'out',amount:2,recipeAmount:2}),'Reçete Düşüm');
 assert.equal(ctx.stockMovementLabel({type:'out',amount:2}),'Stoktan Düşüm');
 assert.equal(ctx.stockMovementLabel({type:'sale',amount:2}),'Adisyon Satışı');
 assert.equal(ctx.stockMovementLabel({type:'in',amount:2,recipeAmount:2}),'Stok Girişi');
 assert.equal(ctx.saleStockReturns({stockDeductions:[{stockItemId:'water',amount:5}]},stocks)[0].qty,5);
});

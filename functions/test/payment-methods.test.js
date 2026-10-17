const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const source=readFileSync(join(__dirname,'../../assets/js/payment-methods.js'),'utf8');
const moduleReady=import(`data:text/javascript,${encodeURIComponent(source)}`);

test('missing configuration preserves all three existing payment methods',async()=>{
 const {normalizePaymentMethods}=await moduleReady;
 assert.deepEqual(normalizePaymentMethods(null),{cash:true,transfer:true,card:true});
});
test('the last open payment method cannot be disabled',async()=>{
 const {canDisablePaymentMethod}=await moduleReady;
 assert.equal(canDisablePaymentMethod({cash:true,transfer:false,card:false},'cash'),false);
 assert.equal(canDisablePaymentMethod({cash:true,transfer:false,card:true},'cash'),true);
});
test('radio choices remain visible but disabled and a usable option is selected',async()=>{
 const {applyPaymentRadios}=await moduleReady;
 const inputs=['cash','transfer','card'].map(value=>({value,checked:value==='cash',disabled:false,closest:()=>({classList:{toggle(){}}})}));
 applyPaymentRadios({querySelectorAll:()=>inputs},{cash:false,transfer:true,card:false});
 assert.deepEqual(inputs.map(x=>x.disabled),[true,false,true]);
 assert.equal(inputs[1].checked,true);
});
test('a disabled select option cannot be chosen for a new current-account payment',async()=>{
 const {applyPaymentOptions}=await moduleReady;
 const select={options:['cash','transfer','card'].map(value=>({value})),value:'card'};
 applyPaymentOptions(select,{cash:true,transfer:false,card:false});
 assert.equal(select.value,'cash');
 assert.deepEqual(select.options.map(x=>x.disabled),[false,true,true]);
});

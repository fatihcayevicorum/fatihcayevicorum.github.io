const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const source=readFileSync(join(__dirname,'../../assets/js/table-layout.js'),'utf8');
const layoutModule=import(`data:text/javascript,${encodeURIComponent(source)}`);

test('masa sayısı düşürülüp tekrar artırıldığında görünen ad Masa 7, Masa 8 diye sürer',async()=>{
 const {normalizeTableLayout,resizeTableLayout,automaticTableTitle}=await layoutModule;
 const original=normalizeTableLayout({tableCount:15,tableRegions:[{id:'salon',name:'Masa',nextTableNumber:16}]});
 const reduced=resizeTableLayout(original,{total:6});
 const expanded=resizeTableLayout(normalizeTableLayout({
  tableRegions:reduced.regions,tableSlots:reduced.tables,tableNextNumber:reduced.nextNumber,tableCount:reduced.tables.length
 }),{total:8});
 assert.deepEqual(expanded.tables.slice(0,6).map(t=>t.key),original.tables.slice(0,6).map(t=>t.key));
 assert.equal(automaticTableTitle(expanded,expanded.tables[6].key),'Masa 7');
 assert.equal(automaticTableTitle(expanded,expanded.tables[7].key),'Masa 8');
 assert.ok(Number(expanded.tables[6].key.slice(6))>15);
});

test('bölgedeki son numaradan devam eder, eksik numarayı veya eski kimliği kullanmaz',async()=>{
 const {normalizeTableLayout,appendRegionTable,automaticTableTitle}=await layoutModule;
 const layout=normalizeTableLayout({tableRegions:[{id:'dis',name:'Dış',nextTableNumber:24}],tableSlots:[
  {key:'table-1',regionId:'dis',regionNumber:1},{key:'table-21',regionId:'dis',regionNumber:3}
 ],tableNextNumber:25});
 const added=appendRegionTable(layout,'dis');
 assert.equal(automaticTableTitle(layout,added.key),'Dış 4');
 assert.equal(added.key,'table-25');
});

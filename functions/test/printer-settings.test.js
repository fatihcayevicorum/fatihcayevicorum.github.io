const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../tanimlamalar/script.js'),'utf8');
test('test receipt opens selected paper size with sample label and never writes a sale',()=>{
 for(const width of [58,80]){
  let html='',closed=false,previews=0;const nodes={settingsReceiptPreview:{outerHTML:'<article>Örnek fiş</article>'},receiptFormMessage:{textContent:''}};
  const c={URL,location:{href:'https://example.test/tanimlamalar/'},$:id=>nodes[id],renderReceiptSettingsPreview:()=>previews++,receiptSettingsFromForm:()=>({paperWidthMm:width}),text:s=>s,window:{open:()=>({document:{write:s=>html=s,close:()=>closed=true}})}};
  vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function printTestReceipt(){'),source.indexOf('function receiptSettingsFromForm')),c);c.printTestReceipt();
  assert.equal(previews,1);assert.equal(closed,true);assert.ok(html.includes(`size:${width}mm auto`));assert.ok(html.includes('DENEME FİŞİ'));assert.ok(html.includes('Örnek fiş'));assert.ok(html.includes('style.css?v=593'));
 }
});
test('blocked test receipt popup leaves a useful message',()=>{
 const message={textContent:''},c={$:()=>message,renderReceiptSettingsPreview(){},window:{open:()=>null}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function printTestReceipt(){'),source.indexOf('function receiptSettingsFromForm')),c);c.printTestReceipt();assert.match(message.textContent,/açılır pencere/);
});

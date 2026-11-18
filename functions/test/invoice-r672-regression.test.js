'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
test('R672 reports exclude every reversed expense before totals and charts',()=>{
  const source=fs.readFileSync(path.join(root,'raporlar/script.js'),'utf8');
  assert.match(source,/if\(movement\.reversed===true\|\|movement\.type!=="expense"/);
  assert.match(source,/result\.expenseMovements\.push\(movement\)/);
});
test('R672 invoice UI keeps one add entry, camera/gallery choices and compact cash receipt',()=>{
  const invoice=fs.readFileSync(path.join(root,'faturalarim/index.html'),'utf8'),cash=fs.readFileSync(path.join(root,'kasa-hesap-yonetimi/script.js'),'utf8');
  assert.equal((invoice.match(/id="addInvoiceMenu"/g)||[]).length,1);
  assert.match(invoice,/Kameradan Çek/);assert.match(invoice,/Galeriden Yükle/);assert.match(invoice,/KDV Dâhil Toplam Fiyat/);
  assert.match(cash,/data-invoice-info/);assert.doesNotMatch(cash,/href="\.\.\/faturalarim\/">Faturayı Aç/);
});

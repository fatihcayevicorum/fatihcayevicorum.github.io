'use strict';
const crypto = require('crypto');
const fail = message => { throw new Error(message); };
const cents = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000000) fail('Tutar geçersiz.');
  return Math.round((n + Number.EPSILON) * 100);
};
const text = (value, max = 180) => String(value || '').trim().slice(0, max);
const date = value => {
  const s = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0,10)!==s) fail('Tarih geçersiz.');
  return s;
};
const id = value => { const s = text(value,100); if (!/^[\w-]{1,100}$/.test(s)) fail('Kayıt kimliği geçersiz.'); return s; };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function normalizeInvoice(input) {
  if (!['purchase','sale'].includes(input.kind)) fail('Fatura türünü seçin.');
  const supplierId = input.kind==='purchase' ? id(input.supplierId) : '';
  const partyName = text(input.partyName), number = text(input.number,60);
  if (!number || !partyName) fail('Firma ve fatura numarası zorunlu.');
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 60) fail('1–60 fatura satırı girin.');
  const lines = input.lines.map(row => {
    const name = text(row.name), quantity = Number(row.quantity), unit=text(row.unit,20).toLocaleLowerCase('tr-TR')||'adet';
    const multiplier = ['koli','paket'].includes(unit) ? Number(row.multiplier) : 1;
    if (!name || !Number.isFinite(quantity) || quantity<=0 || quantity>1000000 || !Number.isFinite(multiplier) || multiplier<=0 || multiplier>100000) fail('Ürün adı, miktar veya birim dönüşümü geçersiz.');
    const unitPriceCents = cents(row.unitPrice), totalCents = cents(row.total);
    if (Math.abs(Math.round(quantity*unitPriceCents)-totalCents)>Math.max(1,Math.ceil(quantity/2))) fail(`${name}: miktar, birim fiyat ve satır toplamını kontrol edin.`);
    const stock = input.kind==='purchase' && row.stock===true;
    return {name,quantity,multiplier,unit,unitPriceCents,totalCents,stock,stockItemId:stock?id(row.stockItemId):''};
  });
  const totalCents = cents(input.total), vatCents = cents(input.vat || 0);
  if (!totalCents || lines.reduce((s,r)=>s+r.totalCents,0)!==totalCents || vatCents>totalCents) fail('KDV dâhil satır toplamları fatura genel toplamıyla eşleşmeli.');
  const photo = text(input.photo,700000);
  if (photo && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo)||photo.length>650000)) fail('Fatura görseli çok büyük veya geçersiz.');
  return {kind:input.kind,supplierId,partyName,number,date:date(input.date),dueDate:input.dueDate?date(input.dueDate):'',lines,totalCents,vatCents,note:text(input.note,1500),photo};
}
function stockChange(stock, lines) {
  const previousQuantity = Number(stock.quantity)||0, previousUnitCost=Number(stock.unitCost)||0;
  if (stock.active===false || stock.stockTrackingEnabled===false || previousQuantity<0) fail('Stok ürünü kullanıma kapalı.');
  if (previousQuantity>0 && previousUnitCost<=0) fail('Mevcut stok alış maliyetini önce Stok bölümünden tamamlayın.');
  const amount=lines.reduce((s,r)=>s+r.quantity*r.multiplier,0), purchaseTotal=lines.reduce((s,r)=>s+r.totalCents,0)/100;
  if (!Number.isFinite(amount) || amount>100000000) fail('Stok miktarı çok büyük.');
  const resultingQuantity=previousQuantity+amount,unitCost=(previousQuantity*previousUnitCost+purchaseTotal)/resultingQuantity;
  return {previousQuantity,previousUnitCost,amount,purchaseTotal,resultingQuantity,unitCost};
}
const LEGACY={ 'legacy-cash':{type:'cash',name:'Ana Kasa'},'legacy-bank':{type:'bank',name:'Varsayılan Banka'},'legacy-credit-card-debt':{type:'creditCard',name:'Varsayılan Kredi Kartı'} };
function paymentAccount(accountId,record) {
  const fallback=LEGACY[accountId];
  const a=record ? {...record,type:fallback?.type||record.type} : fallback;
  if (!a || !['cash','bank','creditCard'].includes(a.type) || (a.status && a.status!=='active')) fail('Aktif nakit, banka veya işletme kredi kartı hesabını seçin.');
  return {id:accountId,type:a.type,name:text(a.name)||fallback?.name||'Hesap'};
}
module.exports={cents,text,date,id,hash,normalizeInvoice,stockChange,paymentAccount};

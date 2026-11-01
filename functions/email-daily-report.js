'use strict';
// Read-only report: saved closing prices and finance movements, never current catalogue prices.
const path=require('node:path');
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const cents=v=>Math.round(n(v)*100), money=v=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(n(v)/100);
const clean=v=>String(v??'').replace(/[\x00-\x1f]/g,' ').slice(0,500);
const accountNames={cash:'Nakit',bank:'Banka / Havale',card:'POS',creditCard:'Kredi Kartı Borcu'};
function buildDailyReport(date,closings,movements){
 if(!closings.length)throw Error('closing-missing');
 const totals={cashIncome:0,bankIncome:0,posIncome:0,expense:0,cashExpense:0,bankExpense:0,posExpense:0,creditExpense:0,sales:0,collection:0,current:0,tips:0,rounding:0,orders:0,items:0,gifts:0,marka:0,brews:0};
 let currentKnown=true;const products=new Map(),details=[],net={cash:0,bank:0,card:0,creditCard:0};
 for(const c of closings){
  totals.sales+=Math.max(0,cents(c.salesTotal)-cents(c.roundingTotal));totals.orders+=n(c.orderCount);totals.items+=n(c.itemCount);totals.gifts+=n(c.giftCount);totals.marka+=n(c.merchantTeaCount);totals.brews+=n(c.brewedPotCount);totals.tips+=cents(c.tipTotal);totals.rounding+=cents(c.roundingTotal);
  totals.collection+=cents(c.cashTotal??(n(c.cashIncomeTotal)-n(c.manualIncomeCash)))+cents(c.transferTotal??(n(c.bankIncomeTotal)-n(c.manualIncomeBank)))+cents(c.cardTotal??(n(c.cardIncomeTotal)-n(c.manualIncomeCard)));
  const known=['currentAccountCash','currentAccountTransfer','currentAccountCard'].every(k=>c[k]!=null&&Number.isFinite(Number(c[k])));
  if(!known)currentKnown=false;else totals.current+=cents(c.currentAccountCash)+cents(c.currentAccountTransfer)+cents(c.currentAccountCard);
  for(const p of c.products||[]){const key=JSON.stringify([p.name,p.unitPrice]),row=products.get(key)||{name:clean(p.name||'Ürün'),quantity:0,unitPrice:cents(p.unitPrice),total:0};row.quantity+=n(p.quantity);row.total+=cents(p.total??n(p.quantity)*n(p.unitPrice));products.set(key,row)}
 }
 const rows=movements.filter(m=>m.businessDate===date&&m.reversed!==true&&!(m.type==='transfer'&&(m.fromAccount==='personnel'||m.toAccount==='personnel')));
 // Same legacy closing inclusion rule as Kasa & Hesaplar; modern report-only closings are not cash income.
 for(const c of closings)if(c.accountingMode!=='report-only'&&c.cashTransferDisabled!==true)for(const [account,key]of [['cash','cashTotal'],['bank','transferTotal'],['card','cardTotal']])if(n(c[key]))rows.push({type:'income',account,amount:n(c[key]),category:'Gün Sonu',description:'Eski gün sonu tahsilatı'});
 for(const m of rows){
  const value=m.source==='savings'?Math.round(n(m.amountCents)):cents(m.amount);
  if(m.type==='income'){if(m.account==='cash')totals.cashIncome+=value;if(m.account==='bank')totals.bankIncome+=value;if(m.account==='card')totals.posIncome+=value;if(m.account in net)net[m.account]+=value}
  if(m.type==='expense'){totals.expense+=value;const key={cash:'cashExpense',bank:'bankExpense',card:'posExpense',creditCard:'creditExpense'}[m.account];if(key)totals[key]+=value;if(m.account in net)net[m.account]+=m.account==='creditCard'?value:-value}
  if(m.type==='transfer'){if(m.fromAccount in net)net[m.fromAccount]+=m.fromAccount==='creditCard'?value:-value;if(m.toAccount in net)net[m.toAccount]+=m.toAccount==='creditCard'?-value:value}
  if(['income','expense','transfer'].includes(m.type))details.push({type:m.type,amount:value,category:clean(m.category||''),description:clean(m.description||m.note||''),account:clean(m.accountName||accountNames[m.account]||m.account||''),from:clean(m.fromAccountName||accountNames[m.fromAccount]||''),to:clean(m.toAccountName||accountNames[m.toAccount]||'')});
 }
 totals.income=totals.cashIncome+totals.bankIncome+totals.posIncome;totals.result=totals.income-totals.expense;
 return {date,totals,currentKnown,net,products:[...products.values()].sort((a,b)=>a.name.localeCompare(b.name,'tr')),details};
}
function summaryRows(r){const t=r.totals;return [['Nakit Gelir',money(t.cashIncome)],['Havale Geliri',money(t.bankIncome)],['Kart / POS Geliri',money(t.posIncome)],['Toplam Gelir',money(t.income)],['Nakit Gider',money(t.cashExpense)],['Banka Gideri',money(t.bankExpense)],['POS Gideri',money(t.posExpense)],['Kredi Kartı Gideri',money(t.creditExpense)],['Toplam Gider',money(t.expense)],['Gelir - Gider Farkı',money(t.result)],['Toplam Satış (cariye yazılan dahil)',money(t.sales)],['Adisyon Tahsilatı (cari ve bahşiş dahil)',money(t.collection)],['Cari Tahsilatı (tahsilata dahil)',r.currentKnown?money(t.current):'Ayrım kayıtlı değil'],['Bahşiş (tahsilata dahil)',money(t.tips)],['Eksi Yuvarlama',money(t.rounding)],['Kapanan Adisyon',String(t.orders)],['Satılan Ürün',String(t.items)],['İkram',String(t.gifts)],['Esnaf Çay / Marka',String(t.marka)],['Demlenen Çay',`${t.brews} Demlik`]]}
function reportText(r,detailed){
 const lines=[`Fatih Çay Evi - ${r.date} Günlük Finans Raporu`,'',...summaryRows(r).map(([a,b])=>`${a}: ${b}`),'','Gelir - gider farkı muhasebe kârı değildir. Hesap aktarımları gelir/gider toplamına dahil değildir.'];
 if(detailed){lines.push('','SATILAN ÜRÜNLER',...r.products.map(p=>`${p.name}: ${p.quantity} x ${money(p.unitPrice)} = ${money(p.total)}`),'','FİNANS HAREKETLERİ',...r.details.map(d=>`${d.type==='income'?'Gelir':d.type==='expense'?'Gider':'Aktarım'} | ${d.type==='transfer'?`${d.from} → ${d.to}`:d.account} | ${d.category} | ${d.description} | ${money(d.amount)}`))}
 lines.push('','KASA / HESAPLAR - GÜNÜN NET HAREKETİ',...Object.entries(r.net).map(([k,v])=>`${accountNames[k]}: ${money(v)}`),'Net hareketler açılış/devir bakiyesini içermez. Kredi kartında pozitif değer borç artışıdır.');return lines.join('\n');
}
function renderDailyPdf(r,detailed,createdAtMs){
 const PDFDocument=require('pdfkit');
 return new Promise((resolve,reject)=>{
  const stamp=new Date(createdAtMs),doc=new PDFDocument({size:'A4',margin:44,bufferPages:true,info:{Title:`Fatih Çay Evi - ${r.date} Günlük Finans Raporu`,Author:'Fatih Çay Evi',CreationDate:stamp,ModDate:stamp}}),chunks=[];let size=0;
  doc.on('data',b=>{size+=b.length;if(size>8*1024*1024){doc.destroy(Error('pdf-size-limit'));return}chunks.push(b)});doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
  doc.registerFont('Regular',path.join(__dirname,'fonts/DejaVuSans.ttf'));doc.registerFont('Bold',path.join(__dirname,'fonts/DejaVuSans-Bold.ttf'));doc.font('Regular');
  const width=507;let page=0;
  const header=()=>{page++;doc.fillColor('#9b2424').font('Bold').fontSize(17).text('FATİH ÇAY EVİ',44,38);doc.fillColor('#555555').font('Regular').fontSize(9).text(`${r.date}  |  Günlük Finans Raporu`,44,64);doc.moveTo(44,84).lineTo(551,84).strokeColor('#dbb9b2').stroke();doc.y=100};
  header();
  const ensure=h=>{if(doc.y+h>780){doc.addPage();header()}};
  const section=text=>{ensure(48);doc.moveDown(.5);doc.font('Bold').fontSize(12).fillColor('#9b2424').text(text,44,doc.y,{width});doc.moveDown(.5)};
  const row=(left,right)=>{doc.font('Regular').fontSize(9);const h=Math.max(doc.heightOfString(left,{width:350}),doc.heightOfString(right,{width:135}))+10;ensure(h);const y=doc.y;doc.fillColor('#222222').text(left,48,y,{width:350});doc.font('Bold').text(right,404,y,{width:143,align:'right'});doc.moveTo(44,y+h-4).lineTo(551,y+h-4).strokeColor('#eeeeee').stroke();doc.y=y+h};
  section('Günün Özeti');for(const pair of summaryRows(r))row(...pair);
  if(detailed){section('Satılan Ürünler');if(!r.products.length)row('Satış ürünü kaydı yok','');for(const p of r.products)row(`${p.name}\n${p.quantity} × ${money(p.unitPrice)}`,money(p.total));section('Finans Hareketleri');if(!r.details.length)row('Finans hareketi yok','');for(const d of r.details)row(`${d.type==='income'?'Gelir':d.type==='expense'?'Gider':'Aktarım'} · ${d.type==='transfer'?`${d.from} → ${d.to}`:d.account}\n${[d.category,d.description].filter(Boolean).join(' / ')}`,money(d.amount))}
  section('Kasa / Hesaplar - Günün Net Hareketi');for(const [k,v]of Object.entries(r.net))row(accountNames[k],money(v));
  ensure(68);doc.font('Regular').fontSize(8).fillColor('#666666').text('Net hareketler açılış/devir bakiyesini içermez. Kredi kartında pozitif değer borç artışıdır. Gelir - gider farkı muhasebe kârı değildir. Hesap aktarımları gelir/gider toplamına dahil değildir.',44,doc.y+10,{width});
  const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.font('Regular').fontSize(8).fillColor('#777777').text(`fatihcayevi.com.tr  |  ${i+1} / ${range.count}`,44,804,{width,align:'center',lineBreak:false})}doc.end();
 });
}
module.exports={buildDailyReport,summaryRows,reportText,renderDailyPdf};

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
function renderLegacyDailyPdf(r,detailed,createdAtMs){
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


// R613: category labels are presentation-only snapshots; saved prices/amounts stay authoritative.
const normalizedName=v=>String(v||'').normalize('NFC').replace(/[’‘]/g,"'").trim().replace(/\s+/g,' ').toLocaleLowerCase('tr-TR');
function decorateReport(report,catalog={}){
 const categories=new Map((catalog.categories||[]).map(c=>[String(c.id),c]));
 const names=new Map();for(const item of catalog.items||[]){const name=normalizedName(item.name),category=categories.get(String(item.categoryId));if(!category)continue;const options=names.get(name)||new Map();options.set(String(category.id),category);names.set(name,options)}
 return {...report,products:report.products.map(p=>{
  const options=names.get(normalizedName(p.name)),category=options?.size===1?[...options.values()][0]:null;
  return {...p,categoryId:category?String(category.id):'ungrouped',categoryName:category?clean(category.name):'Gruplanmamış Ürünler',categoryOrder:category?n(category.order):999999};
 })};
}
function groupedProducts(r){
 const groups=new Map();for(const p of r.products||[]){const id=p.categoryId||'ungrouped',g=groups.get(id)||{id,name:p.categoryName||'Gruplanmamış Ürünler',order:p.categoryOrder??999999,quantity:0,total:0,rows:[]};g.quantity+=n(p.quantity);g.total+=n(p.total);g.rows.push({...p});groups.set(id,g)}
 const compare=(a,b)=>n(b.quantity)-n(a.quantity)||a.name.localeCompare(b.name,'tr')||n(a.unitPrice)-n(b.unitPrice);
 return [...groups.values()].sort((a,b)=>(a.id==='ungrouped')-(b.id==='ungrouped')||n(a.order)-n(b.order)||a.name.localeCompare(b.name,'tr')).map(g=>({...g,rows:g.rows.sort(compare)}));
}
const qty=v=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(n(v));
const displayMoney=v=>money(v).replace('₺','').trim()+' TL';
const businessDateLabel=date=>new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Istanbul'}).format(new Date(`${date}T12:00:00+03:00`));
function emailSummaryText(r,hasPdf){const t=r.totals;return [`Fatih Çay Evi - ${businessDateLabel(r.date)}`,'',`Toplam gelir: ${displayMoney(t.income)}`,`Toplam gider: ${displayMoney(t.expense)}`,`Gelir - gider farkı: ${displayMoney(t.result)}`,'',`${qty(t.orders)} adisyon · ${qty(t.items)} ürün · ${qty(t.brews)} demlik`,hasPdf?'Rapor PDF olarak ektedir.':'Bu gönderimde PDF eki kapalı.','Gelir - gider farkı muhasebe kârı değildir.'].join('\n')}
function emailSummaryHtml(r,hasPdf){
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const t=r.totals;
 const rows=[['Toplam gelir',t.income,'#327451'],['Toplam gider',t.expense,'#9B2929'],['Gelir - gider farkı',t.result,'#3A6787']].map(([name,value,color])=>`<tr><td style="padding:13px 0;border-bottom:1px solid #e4ded7;font-size:16px;color:#282522">${name}</td><td align="right" style="padding:13px 0;border-bottom:1px solid #e4ded7;font-size:20px;font-weight:bold;color:${color};white-space:nowrap">${esc(displayMoney(value))}</td></tr>`).join('');
 return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#faf7f1;font-family:Arial,sans-serif;color:#282522"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e4ded7;border-radius:14px"><tr><td style="padding:24px 20px"><h1 style="margin:0 0 8px;color:#9B2929;font-size:23px">Fatih Çay Evi</h1><p style="font-size:16px;margin:0 0 16px">${esc(businessDateLabel(r.date))} · Günlük özet</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table><p style="font-size:16px;line-height:1.6;margin:20px 0">${esc(qty(t.orders))} adisyon · ${esc(qty(t.items))} ürün · ${esc(qty(t.brews))} demlik</p><p style="font-size:16px;line-height:1.6;margin:0">${hasPdf?'Rapor PDF olarak ektedir.':'Bu gönderimde PDF eki kapalı.'}</p><p style="font-size:12px;line-height:1.5;color:#716a65;margin:18px 0 0">Gelir - gider farkı muhasebe kârı değildir.</p></td></tr></table></td></tr></table></body></html>`;
}
function renderDailyPdf(r,detailed,createdAtMs){
 const PDFDocument=require('pdfkit'),t=r.totals,groups=groupedProducts(r),palette=['#9B2929','#3A6787','#B5854B','#327451','#8A5D83','#706A62'];
 return new Promise((resolve,reject)=>{
  const stamp=new Date(createdAtMs),doc=new PDFDocument({size:'A4',margin:0,bufferPages:true,info:{Title:`Fatih Çay Evi - ${r.date} Günlük İşletme Raporu`,Author:'Fatih Çay Evi',CreationDate:stamp,ModDate:stamp}}),chunks=[];let size=0;
  doc.on('data',b=>{size+=b.length;if(size>8*1024*1024){doc.destroy(Error('pdf-size-limit'));return}chunks.push(b)});doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
  doc.registerFont('R',path.join(__dirname,'fonts/DejaVuSans.ttf'));doc.registerFont('B',path.join(__dirname,'fonts/DejaVuSans-Bold.ttf'));doc.font('R');
  const RED='#9B2929',INK='#282522',MUTED='#716A65',LINE='#E4DED7',CREAM='#FAF7F1',GREEN='#327451',BLUE='#3A6787';
  const text=(value,x,y,w=523,size=9,font='R',color=INK,align='left')=>doc.font(font).fontSize(size).fillColor(color).text(String(value),x,y,{width:w,align,lineGap:1});
  const measure=(value,w,size=9,font='R')=>doc.font(font).fontSize(size).heightOfString(String(value),{width:w,lineGap:1});
  const fit=(value,x,y,w,size=18,min=10,font='B',color=INK,align='left')=>{while(size>min&&doc.font(font).fontSize(size).widthOfString(String(value))>w)size--;return text(value,x,y,w,size,font,color,align)};
  const box=(x,y,w,h,fill='#FFFFFF',stroke=LINE,radius=10)=>doc.roundedRect(x,y,w,h,radius).fillAndStroke(fill,stroke);
  const line=y=>doc.moveTo(36,y).lineTo(559,y).lineWidth(.6).stroke(LINE);
  const header=title=>{doc.rect(0,0,595.28,96).fill(CREAM);doc.image(path.join(__dirname,'assets/report-logo.png'),36,10,{fit:[76,76]});text('FATİH ÇAY EVİ',128,28,360,19,'B',RED);text(`${businessDateLabel(r.date)} · Günlük İşletme Raporu`,128,57,431,9.5,'R',MUTED);text(title,36,108,523,12,'B')};
  const panel=(x,y,w,h,title)=>{box(x,y,w,h);fit(title,x+14,y+15,w-28,11,8,'B',RED)};
  const kv=(x,y,label,value,w=227)=>{text(label,x,y,w*.54,9.5,'R',MUTED);fit(value,x+w*.54,y,w*.46,10,8,'B',INK,'right')};
  const pct=v=>qty(v)+'%';
  const shortLabel=(value,width)=>{let label=String(value);doc.font('R').fontSize(8.2);if(doc.widthOfString(label)<=width)return label;while(label.length&&doc.widthOfString(label+'…')>width)label=label.slice(0,-1);return label+'…'};
  const donut=(rows,cx,cy,radius)=>{const total=rows.reduce((sum,g)=>sum+Math.max(0,n(g.quantity)),0);if(!total){doc.circle(cx,cy,radius).fill('#EEE7DE');doc.circle(cx,cy,radius*.66).fill('#FFFFFF');return}let at=-Math.PI/2;for(const [i,row]of rows.entries()){const delta=2*Math.PI*Math.max(0,n(row.quantity))/total;if(!delta)continue;const pathPoints=[];for(let j=0;j<=Math.max(2,Math.ceil(delta*40));j++){const a=at+delta*j/Math.max(2,Math.ceil(delta*40));pathPoints.push([cx+radius*Math.cos(a),cy+radius*Math.sin(a)])}doc.moveTo(cx,cy).lineTo(...pathPoints[0]);for(const point of pathPoints.slice(1))doc.lineTo(...point);doc.closePath().fill(palette[i%palette.length]);at+=delta}doc.circle(cx,cy,radius*.66).fill('#FFFFFF')};
  header('Günün Özeti');
  for(const [i,label,value,color,bg]of [[0,'TOPLAM GELİR',t.income,GREEN,'#EDF5EF'],[1,'TOPLAM GİDER',t.expense,RED,'#FAEFEA'],[2,'GELİR - GİDER FARKI',t.result,BLUE,'#EDF2F6']]){const x=36+i*178;box(x,135,167,82,bg,bg);text(label,x+14,151,139,8.1,'B',color);fit(displayMoney(value),x+14,177,139,18,10,'B',color)}
  text('Gelir - gider farkı, muhasebe kârı veya toplam kasa bakiyesi değildir.',36,228,523,8.5,'R',MUTED);
  panel(36,251,255,146,'Gelir ve Tahsilat Dağılımı');
  for(const [i,label,value]of [[0,'Nakit',t.cashIncome],[1,'Havale',t.bankIncome],[2,'Kart / POS',t.posIncome]])kv(50,291+i*25,label,displayMoney(value));
  doc.moveTo(50,366).lineTo(277,366).lineWidth(.6).stroke(LINE);kv(50,377,'Toplam gelir',displayMoney(t.income));
  panel(304,251,255,146,'Satış ve Cari Tahsilatı');kv(318,291,'Toplam satış',displayMoney(t.sales));text('Cariye yazılan satışlar dahil',318,310,227,8,'R',MUTED);kv(318,335,'Cari tahsilatı',r.currentKnown?displayMoney(t.current):'Ayrım kayıtlı değil');text(`Adisyon tahsilatı: ${displayMoney(t.collection)}`,318,354,227,8,'R',MUTED);text('Cari tahsilatı adisyon tahsilatının içindedir.',318,367,227,7.8,'R',MUTED);text(`Yuvarlama: ${displayMoney(t.rounding)} · Bahşiş: ${displayMoney(t.tips)}`,318,382,227,7.5,'R',MUTED);
  for(const [i,label,value]of [[0,'ADİSYON',t.orders],[1,'SATILAN ÜRÜN',t.items],[2,'İKRAM',t.gifts],[3,'ESNAF / MARKA',t.marka],[4,'DEMLİK',t.brews]]){const x=36+i*106.4;box(x,414,97.4,64,CREAM,CREAM);fit(qty(value),x+8,427,81.4,20,12,'B',INK,'center');text(label,x+4,458,89.4,7,'B',MUTED,'center')}
  panel(36,496,255,237,'Gelir ve Gider Karşılaştırması');const max=Math.max(Math.abs(t.income),Math.abs(t.expense),1);
  for(const [y,label,value,color]of [[545,'Gelir',t.income,GREEN],[610,'Gider',t.expense,RED]]){text(label,50,y,70,10,'B');fit(displayMoney(value),120,y,157,10,8,'B',color,'right');box(50,y+22,227,15,'#F0EDE8','#F0EDE8',5);const bar=227*Math.abs(value)/max;if(bar>.01)doc.roundedRect(50,y+22,bar,15,Math.min(5,bar/2)).fill(color)}
  text(t.income>0?`Gider / gelir oranı: ${pct(t.expense/t.income*100)}`:'Gider / gelir oranı: gelir yok',50,693,227,9,'B',MUTED);
  panel(304,496,255,237,'Ürün Gruplarının Adet Dağılımı');
  const chartGroups=groups.length<=4?groups:groups.slice(0,3).concat([{name:'Diğer gruplar',quantity:groups.slice(3).reduce((s,g)=>s+g.quantity,0)}]),chartTotal=chartGroups.reduce((s,g)=>s+Math.max(0,g.quantity),0);
  donut(chartGroups,377,595,47);fit(qty(chartTotal),345,580,64,19,10,'B',INK,'center');text('ürün',345,605,64,8,'R',MUTED,'center');
  if(!chartGroups.length)text('Satış ürünü kaydı yok.',318,660,227,9,'R',MUTED);
  chartGroups.forEach((g,i)=>{const y=648+i*18;doc.circle(320,y+5,3).fill(palette[i%palette.length]);text(shortLabel(g.name,110),330,y,110,8.2,'R');fit(`${qty(g.quantity)} · ${pct(chartTotal?g.quantity/chartTotal*100:0)}`,440,y,105,8.2,6,'B',INK,'right')});
  text('Grafikler bu güne ait tutarları ve ürün adetlerini gösterir.',36,752,523,8.3,'R',MUTED);
  text(detailed?'Ürünler ayrıntılarda grup içinde satış adedine göre azalan sıradadır.':'Bu raporda ayrıntılı ürün ve finans hareketi listesi kapalıdır.',36,768,523,8.1,'R',MUTED);
  // All detail rows flow; no truncation or fixed two-page limit on unusually busy days.
  let y=135;
  const newPage=title=>{doc.addPage();header(title);y=135};
  const ensure=(h,title,limit=776)=>{if(y+h>limit)newPage(title)};
  if(detailed){
   newPage('Ürün ve Finans Ayrıntıları');
   const tableHeader=()=>{box(36,y,523,25,RED,RED,5);for(const [x,w,label,align]of [[48,22,'No','left'],[78,237,'Ürün','left'],[317,37,'Adet','right'],[362,83,'Birim Fiyat','right'],[453,94,'Tutar','right']])text(label,x,y+7,w,9,'B','#FFFFFF',align);y+=25};
   const groupHeader=(g,continued=false)=>{const h=Math.max(20,measure(g.name+(continued?' (devam)':''),280,9,'B')+8);doc.rect(36,y,523,h).fill('#EEE7DE');text(g.name+(continued?' (devam)':''),48,y+5,280,9,'B',RED);fit(`${qty(g.quantity)} adet · ${displayMoney(g.total)}`,340,y+5,207,8.5,7,'B',INK,'right');y+=h};
   tableHeader();let index=0;
   for(const g of groups){
    if(y+Math.max(20,measure(g.name,280,9,'B')+8)+30>776){newPage('Ürün Ayrıntıları (devam)');tableHeader()}groupHeader(g);
    for(const [i,p]of g.rows.entries()){
     const values=[String(index+1),p.name,qty(p.quantity),displayMoney(p.unitPrice),displayMoney(p.total)],cols=[[48,22],[78,237],[317,37],[362,83],[453,94]],h=Math.max(17.5,...values.map((v,j)=>measure(v,cols[j][1],j===0?8.4:9,j===4?'B':'R')+5));
     if(y+h>776){newPage('Ürün Ayrıntıları (devam)');tableHeader();groupHeader(g,true)}
     if(i%2===0)doc.rect(36,y,523,h).fill(CREAM);
     values.forEach((v,j)=>text(v,cols[j][0],y+3.5,cols[j][1],j===0?8.4:9,j===4?'B':'R',j===0?MUTED:INK,j>1?'right':'left'));y+=h;index++;
    }
   }
   if(!groups.length){text('Satış ürünü kaydı yok.',48,y+8,499,10,'R',MUTED);y+=32}
   ensure(45,'Ürün Toplamları');line(y);text(`${qty(groups.reduce((s,g)=>s+g.quantity,0))} ürün · İkram ve marka adedi ayrı gösterilir.`,36,y+8,300,8,'R',MUTED);fit(`Ürün toplamı: ${displayMoney(groups.reduce((s,g)=>s+g.total,0))}`,338,y+8,221,9,7,'B',INK,'right');text(`Yuvarlama: ${displayMoney(t.rounding)} | Net satış: ${displayMoney(t.sales)}`,230,y+25,329,8,'R',MUTED,'right');y+=52;
   ensure(62,'Finans Hareketleri');text('Finans Hareketleri',36,y,523,11,'B',RED);y+=22;
   for(const [i,d]of r.details.entries()){
    const label=[d.category,d.description].filter(Boolean).join(' / '),account=d.type==='transfer'?`${d.from} → ${d.to}`:d.account,kind=d.type==='income'?'Gelir':d.type==='expense'?'Gider':'Aktarım',h=Math.max(22,measure(label,265,9)+10,measure(account,60,8.5)+10,measure(displayMoney(d.amount),99,9,'B')+10);
    if(y+h>776){newPage('Finans Hareketleri (devam)');text('Finans Hareketleri (devam)',36,y,523,11,'B',RED);y+=24}
    if(i%2===0)doc.rect(36,y,523,h).fill(CREAM);text(kind,44,y+5,58,9,'B',d.type==='expense'?RED:GREEN);text(account,108,y+5,60,8.5);text(label,174,y+5,265,9);text(displayMoney(d.amount),448,y+5,99,9,'B',INK,'right');y+=h;
   }
   if(!r.details.length){text('Finans hareketi kaydı yok.',44,y,500,9,'R',MUTED);y+=24}
   y+=12;
  }
  if(detailed){
  const netNote=`Banka: ${displayMoney(r.net.bank)} · POS: ${displayMoney(r.net.card)} · Kredi kartı borcu değişimi: ${displayMoney(r.net.creditCard)}`;
  ensure(18+measure(netNote,523,8)+5+measure('Net hareketler devir bakiyesini içermez. Hesap aktarımları gelir veya gider sayılmaz.',523,7.6),'Hesap Özeti',784);text('Günün net hesap hareketi',36,y,260,9,'B');fit(`Nakit: ${displayMoney(r.net.cash)}`,310,y,249,9,7,'B',BLUE,'right');y+=18;
  text(netNote,36,y,523,8,'R',MUTED);y+=measure(netNote,523,8)+5;
  text('Net hareketler devir bakiyesini içermez. Hesap aktarımları gelir veya gider sayılmaz.',36,y,523,7.6,'R',MUTED);
  }
  const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(i);line(788);text('fatihcayevi.com.tr',36,801,450,8,'R',MUTED);text(`${i+1} / ${range.count}`,510,801,49,8,'R',MUTED,'right')}doc.end();
 });
}
module.exports={buildDailyReport,summaryRows,reportText,renderLegacyDailyPdf,decorateReport,groupedProducts,emailSummaryText,emailSummaryHtml,renderDailyPdf};

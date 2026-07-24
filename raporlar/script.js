import{initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{collection,doc,getFirestore,onSnapshot}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{ADMIN_UID,firebaseConfig}from"../firebase-config.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const salesCol=collection(db,"adminSales"),closingsCol=collection(db,"adminDailyClosings"),stocksCol=collection(db,"adminStockItems"),stockMovesCol=collection(db,"adminStockMovements"),menuRef=doc(db,"publicMenu","catalog"),settingsRef=doc(db,"adminAppSettings","pos");
const el={periodButtons:$("periodButtons"),dateRange:$("dateRange"),startDate:$("startDate"),endDate:$("endDate"),applyRange:$("applyRange"),periodLabel:$("periodLabel"),connection:$("connection"),salesTotal:$("salesTotal"),cashTotal:$("cashTotal"),creditTotal:$("creditTotal"),itemCount:$("itemCount"),orderCount:$("orderCount"),giftCount:$("giftCount"),tipTotal:$("tipTotal"),roundingTotal:$("roundingTotal"),categoryTabs:$("categoryTabs"),productSearch:$("productSearch"),productReport:$("productReport"),productEmpty:$("productEmpty"),rankingList:$("rankingList"),rankingEmpty:$("rankingEmpty"),categoryReport:$("categoryReport"),stockProductSelect:$("stockProductSelect"),stockReportHint:$("stockReportHint"),stockReportContent:$("stockReportContent"),stockPackages:$("stockPackages"),stockReceived:$("stockReceived"),stockPurchaseTotal:$("stockPurchaseTotal"),stockAverageCost:$("stockAverageCost"),stockSold:$("stockSold"),stockRevenue:$("stockRevenue"),stockProfit:$("stockProfit"),stockRemaining:$("stockRemaining"),stockEntryCount:$("stockEntryCount"),stockEntryList:$("stockEntryList"),stockEntryEmpty:$("stockEntryEmpty"),closingList:$("closingList"),closingEmpty:$("closingEmpty"),exportPdf:$("exportPdf"),exportExcel:$("exportExcel"),logoutButton:$("logoutButton"),toast:$("toast")};
let sales=[],closings=[],stocks=[],stockMovements=[],catalog={categories:[],items:[]},period="today",category="all",range={start:today(),end:today()},report=emptyReport(),loaded=0,toastTimer;

el.periodButtons.onclick=e=>{const button=e.target.closest("[data-period]");if(!button)return;period=button.dataset.period;[...el.periodButtons.children].forEach(x=>x.classList.toggle("active",x===button));el.dateRange.hidden=period!=="custom";if(period!=="custom"){range=periodRange(period);render()}};
el.applyRange.onclick=()=>{if(!el.startDate.value||!el.endDate.value)return show("Başlangıç ve bitiş tarihini seçin.");if(el.startDate.value>el.endDate.value)return show("Başlangıç tarihi bitişten sonra olamaz.");range={start:el.startDate.value,end:el.endDate.value};render()};
el.categoryTabs.onclick=e=>{const button=e.target.closest("[data-category]");if(!button)return;category=button.dataset.category;renderProducts()};
el.productSearch.oninput=renderProducts;
el.stockProductSelect.onchange=renderStockReport;
el.exportPdf.onclick=exportPdf;
el.exportExcel.onclick=exportExcel;
el.logoutButton.onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
document.addEventListener("click",e=>{const menu=document.querySelector(".panel-menu");if(menu?.open&&!menu.contains(e.target))menu.removeAttribute("open")});
updateClock();setInterval(updateClock,1000);el.startDate.value=range.start;el.endDate.value=range.end;

onAuthStateChanged(auth,async user=>{if(!user||user.uid!==ADMIN_UID){if(user)await signOut(auth);location.replace("../yonetici-giris.html?next=raporlar/");return}subscribe()});
function subscribe(){
  onSnapshot(salesCol,s=>{sales=s.docs.map(d=>({id:d.id,...d.data()}));ready()},fail);
  onSnapshot(closingsCol,s=>{closings=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.businessDate||b.id).localeCompare(String(a.businessDate||a.id)));ready()},fail);
  onSnapshot(menuRef,s=>{const d=s.data()||{};catalog={categories:Array.isArray(d.categories)?d.categories:[],items:Array.isArray(d.items)?d.items:[]};ready()},fail);
  onSnapshot(stocksCol,s=>{stocks=s.docs.map(d=>({id:d.id,...d.data()}));ready()},fail);
  onSnapshot(stockMovesCol,s=>{stockMovements=s.docs.map(d=>({id:d.id,...d.data()}));ready()},fail);
  onSnapshot(settingsRef,s=>{const d=s.data()||{};if(period==="today"){range={start:d.currentBusinessDate||today(),end:d.currentBusinessDate||today()};el.startDate.value=range.start;el.endDate.value=range.end}ready()},fail);
}
function ready(){loaded++;el.connection.innerHTML='<i class="fa-solid fa-circle-check"></i> Canlı veri';el.connection.classList.remove("error");render()}
function fail(error){console.error(error);el.connection.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> Bağlantı hatası';el.connection.classList.add("error");show("Rapor verileri alınamadı.")}

function buildReport(){
  const selected=sales.filter(s=>{const date=s.businessDate||dateFromTimestamp(s.closedAt||s.createdAt);return date>=range.start&&date<=range.end});
  const result=emptyReport(),products=new Map();
  for(const sale of selected){
    if(sale.recordType==="payment"){result.cashTotal+=num(sale.cashAmount??sale.amount);result.tipTotal+=num(sale.tipAmount);continue}
    if(sale.recordType!=="sale"&&sale.items==null)continue;
    result.salesTotal+=num(sale.baseTotal)||sumBillableItems(sale.items);
    result.cashTotal+=num(sale.cashAmount??sale.paymentAmount??sale.paidTotal);
    result.creditTotal+=num(sale.openAccountAmount);
    result.tipTotal+=num(sale.tipAmount);
    result.roundingTotal+=num(sale.roundingDiscount)||Math.max(0,-num(sale.roundingAmount));
    result.orderCount++;
    for(const item of sale.items||[]){
      const qty=num(item.quantity),price=num(item.unitPrice);
      if(item.complimentary){result.giftCount+=qty;continue}
      result.itemCount+=qty;
      const id=item.id||`${item.name}|${price}`,menuItem=catalog.items.find(x=>x.id===item.id),categoryId=menuItem?.categoryId||"other",current=products.get(id)||{id,name:item.name||menuItem?.name||"Ürün",quantity:0,total:0,categoryId};
      current.quantity+=qty;current.total+=qty*price;products.set(id,current);
    }
  }
  result.products=[...products.values()].sort((a,b)=>b.quantity-a.quantity||b.total-a.total);
  return result;
}
function render(){
  report=buildReport();
  el.periodLabel.textContent=`${formatDate(range.start)}${range.start===range.end?"":` – ${formatDate(range.end)}`}`;
  el.salesTotal.textContent=money(report.salesTotal);el.cashTotal.textContent=money(report.cashTotal);el.creditTotal.textContent=money(report.creditTotal);el.itemCount.textContent=formatNumber(report.itemCount);el.orderCount.textContent=formatNumber(report.orderCount);el.giftCount.textContent=formatNumber(report.giftCount);el.tipTotal.textContent=money(report.tipTotal);el.roundingTotal.textContent=money(report.roundingTotal);
  renderTabs();renderProducts();renderRanking();renderCategories();renderStockOptions();renderStockReport();renderClosings();
}
function renderTabs(){const cats=catalog.categories.filter(c=>report.products.some(p=>p.categoryId===c.id));el.categoryTabs.innerHTML=`<button class="${category==="all"?"active":""}" data-category="all">Tümü</button>`+cats.map(c=>`<button class="${category===c.id?"active":""}" data-category="${esc(c.id)}">${esc(c.name)}</button>`).join("")}
function renderProducts(){const q=el.productSearch.value.trim().toLocaleLowerCase("tr-TR"),items=report.products.filter(p=>(category==="all"||p.categoryId===category)&&p.name.toLocaleLowerCase("tr-TR").includes(q));el.productReport.innerHTML=items.map(p=>`<div class="product-row"><div class="product-copy"><strong>${esc(p.name)}</strong><span>${esc(categoryName(p.categoryId))}</span></div><b>${formatNumber(p.quantity)} adet</b><em>${money(p.total)}</em></div>`).join("");el.productEmpty.hidden=items.length>0}
function renderRanking(){const top=report.products.slice(0,5),least=[...report.products].sort((a,b)=>a.quantity-b.quantity||a.total-b.total).slice(0,5),max=top[0]?.quantity||1,row=(p,i)=>`<div class="ranking-item"><span>${i+1}</span><div><strong>${esc(p.name)}</strong><small>${Math.round(p.quantity/max*100)}% satış yoğunluğu</small></div><b>${formatNumber(p.quantity)} adet</b></div>`;el.rankingList.innerHTML=top.length?`<p class="ranking-group-title">En çok satan 5 ürün</p>${top.map(row).join("")}<p class="ranking-group-title">En az satan 5 ürün</p>${least.map(row).join("")}`:"";el.rankingEmpty.hidden=top.length>0}
function renderCategories(){const map=new Map();for(const p of report.products){const key=p.categoryId||"other",x=map.get(key)||{name:categoryName(key),quantity:0,total:0};x.quantity+=p.quantity;x.total+=p.total;map.set(key,x)}const items=[...map.values()].sort((a,b)=>b.quantity-a.quantity),max=items[0]?.quantity||1;el.categoryReport.innerHTML=items.map(x=>`<article class="category-card"><header><h3>${esc(x.name)}</h3><b>${formatNumber(x.quantity)} adet</b></header><div class="bar"><i style="width:${Math.max(4,x.quantity/max*100)}%"></i></div><p>${money(x.total)} ürün toplamı</p></article>`).join("")||'<p class="empty">Seçilen dönemde kategori verisi bulunmuyor.</p>'}
function renderStockOptions(){const selected=el.stockProductSelect.value,items=stocks.filter(x=>x.active!==false&&x.linkedMenuItemId).sort((a,b)=>String(a.name).localeCompare(String(b.name),"tr"));el.stockProductSelect.innerHTML='<option value="">Stok ürünü seçin</option>'+items.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");if(items.some(x=>x.id===selected))el.stockProductSelect.value=selected}
function renderStockReport(){const stock=stocks.find(x=>x.id===el.stockProductSelect.value);el.stockReportHint.hidden=!!stock;el.stockReportContent.hidden=!stock;if(!stock)return;const entries=stockMovements.filter(x=>x.stockItemId===stock.id&&(x.type==="in"||x.type==="initial")&&movementDate(x)>=range.start&&movementDate(x)<=range.end).sort((a,b)=>movementDate(a).localeCompare(movementDate(b))),packageCount=entries.reduce((sum,x)=>sum+movementPackages(x,stock),0),received=entries.reduce((sum,x)=>sum+num(x.amount),0),purchaseTotal=entries.reduce((sum,x)=>sum+movementPurchase(x,stock),0),averageCost=received>0?purchaseTotal/received:num(stock.unitCost);let sold=0,revenue=0;for(const sale of sales){const date=sale.businessDate||dateFromTimestamp(sale.closedAt||sale.createdAt);if(date<range.start||date>range.end||sale.recordType==="payment")continue;for(const item of sale.items||[]){if(item.id!==stock.linkedMenuItemId||item.complimentary)continue;const qty=num(item.quantity);sold+=qty;revenue+=qty*num(item.unitPrice)}}const profit=revenue-sold*averageCost;el.stockPackages.textContent=formatNumber(packageCount);el.stockReceived.textContent=formatNumber(received);el.stockPurchaseTotal.textContent=money(purchaseTotal);el.stockAverageCost.textContent=money(averageCost);el.stockSold.textContent=formatNumber(sold);el.stockRevenue.textContent=money(revenue);el.stockProfit.textContent=money(profit);el.stockRemaining.textContent=`${formatNumber(stock.quantity)} ${stock.unit||"adet"}`;el.stockEntryCount.textContent=`${entries.length} işlem`;el.stockEntryList.innerHTML=entries.map(x=>{const packages=movementPackages(x,stock),amount=num(x.amount),paid=movementPurchase(x,stock),cost=amount>0?paid/amount:0;return`<div class="stock-entry-row"><i class="fa-solid fa-box"></i><div><strong>${formatDate(movementDate(x))}</strong><small>${x.note?esc(x.note):"Stok girişi"}</small></div><b>${formatNumber(packages)} koli</b><b>${formatNumber(amount)} adet</b><b>${money(paid)} • ${money(cost)}/adet</b></div>`}).join("");el.stockEntryEmpty.hidden=entries.length>0}
function renderClosings(){const items=closings.slice(0,40);el.closingList.innerHTML=items.map(c=>`<div class="closing-row"><i class="fa-solid fa-calendar-check"></i><div><strong>${formatDate(c.businessDate||c.id)}</strong><small>${formatNumber(c.orderCount)} adisyon • ${formatNumber(c.itemCount)} ürün</small></div><b>${money(c.salesTotal)} satış</b><b>${money(c.cashTotal)} nakit</b><b>${money(c.openAccountTotal)} açık hesap</b></div>`).join("");el.closingEmpty.hidden=items.length>0}

function exportPdf(){const rows=report.products.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(categoryName(p.categoryId))}</td><td>${formatNumber(p.quantity)}</td><td>${money(p.total)}</td></tr>`).join(""),popup=window.open("","_blank","width=900,height=720");if(!popup)return show("PDF penceresi açılamadı. Açılır pencereye izin verin.");popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Fatih Çay Evi Raporu</title><style>body{font-family:Arial;padding:32px;color:#332a28}h1{color:#7d1b24}table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #ddd;text-align:left}.summary{line-height:1.8;text-align:right}.total{font-size:19px;font-weight:bold}</style></head><body><h1>Fatih Çay Evi — Satış Raporu</h1><p>${formatDate(range.start)}${range.start===range.end?"":` – ${formatDate(range.end)}`}</p><table><thead><tr><th>Ürün</th><th>Kategori</th><th>Adet</th><th>Toplam</th></tr></thead><tbody>${rows}</tbody></table><div class="summary"><div>Toplam satış: ${money(report.salesTotal)}</div><div>Nakit kasa: ${money(report.cashTotal)}</div><div>Açık hesap: ${money(report.creditTotal)}</div><div>Bahşiş: ${money(report.tipTotal)}</div><div>Yuvarlama: ${money(report.roundingTotal)}</div><div>İkram: ${formatNumber(report.giftCount)} adet</div><p class="total">${formatNumber(report.orderCount)} kapanan adisyon</p></div><script>window.onload=()=>window.print()<\/script></body></html>`);popup.document.close()}
function exportExcel(){const rows=report.products.map(p=>`<Row><Cell><Data ss:Type="String">${xml(p.name)}</Data></Cell><Cell><Data ss:Type="String">${xml(categoryName(p.categoryId))}</Data></Cell><Cell><Data ss:Type="Number">${p.quantity}</Data></Cell><Cell><Data ss:Type="Number">${p.total}</Data></Cell></Row>`).join(""),summary=[["Toplam Satış",report.salesTotal],["Nakit Kasa",report.cashTotal],["Açık Hesap",report.creditTotal],["Bahşiş",report.tipTotal],["Hesap Yuvarlama",report.roundingTotal],["İkram Adedi",report.giftCount],["Kapanan Adisyon",report.orderCount]].map(x=>`<Row><Cell><Data ss:Type="String">${x[0]}</Data></Cell><Cell/><Cell/><Cell><Data ss:Type="Number">${x[1]}</Data></Cell></Row>`).join(""),content=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Satış Raporu"><Table><Row><Cell><Data ss:Type="String">Ürün</Data></Cell><Cell><Data ss:Type="String">Kategori</Data></Cell><Cell><Data ss:Type="String">Adet</Data></Cell><Cell><Data ss:Type="String">Toplam</Data></Cell></Row>${rows}${summary}</Table></Worksheet></Workbook>`;download(content,`satis-raporu-${range.start}-${range.end}.xls`,"application/vnd.ms-excel")}

function periodRange(type){const d=new Date(`${today()}T12:00:00`);if(type==="week"){const day=(d.getDay()+6)%7,start=new Date(d);start.setDate(d.getDate()-day);return{start:iso(start),end:iso(d)}}if(type==="month")return{start:`${today().slice(0,7)}-01`,end:today()};return{start:today(),end:today()}}
function emptyReport(){return{salesTotal:0,cashTotal:0,creditTotal:0,itemCount:0,orderCount:0,giftCount:0,tipTotal:0,roundingTotal:0,products:[]}}
function sumBillableItems(items){return(items||[]).filter(x=>!x.complimentary).reduce((sum,x)=>sum+num(x.unitPrice)*num(x.quantity),0)}
function movementDate(x){return String(x.operationDate||dateFromTimestamp(x.createdAt)||"")}
function movementPackages(x,stock){if(num(x.packageCount)>0)return num(x.packageCount);if(x.enteredUnit&&(x.enteredUnit===stock.packageUnit||x.enteredUnit==="koli"))return num(x.enteredAmount);return num(x.amount)/Math.max(1,num(x.unitsPerPackage)||num(stock.unitsPerPackage)||1)}
function movementPurchase(x,stock){if(num(x.purchaseTotal)>0)return num(x.purchaseTotal);if(x.purchasePriceBasis==="total")return num(x.purchasePrice);if(x.purchasePriceBasis==="package")return num(x.purchasePrice)*movementPackages(x,stock);if(x.purchasePriceBasis==="unit")return num(x.purchasePrice)*num(x.amount);return 0}
function categoryName(id){return catalog.categories.find(c=>c.id===id)?.name||(id==="other"?"Diğer":"Kategorisiz")}
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date())}
function iso(d){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(d)}
function dateFromTimestamp(v){const d=v?.toDate?.();return d?new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(d):""}
function formatDate(v){const [y,m,d]=String(v||"").split("-");return y&&m&&d?`${d}.${m}.${y}`:"—"}
function num(v){return Number(v)||0}
function money(v){return new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",minimumFractionDigits:num(v)%1?2:0}).format(num(v))}
function formatNumber(v){return new Intl.NumberFormat("tr-TR",{maximumFractionDigits:2}).format(num(v))}
function updateClock(){const n=new Date();$("currentTime").textContent=new Intl.DateTimeFormat("tr-TR",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Europe/Istanbul"}).format(n);$("currentDate").textContent=new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"2-digit",year:"2-digit",timeZone:"Europe/Istanbul"}).format(n).replace(/\./g,"/")}
function show(message){clearTimeout(toastTimer);el.toast.textContent=message;el.toast.classList.add("show");toastTimer=setTimeout(()=>el.toast.classList.remove("show"),3000)}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
function xml(v){return String(v??"").replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]))}

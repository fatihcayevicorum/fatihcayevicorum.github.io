import{getApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{collection,doc,getFirestore,onSnapshot,serverTimestamp,setDoc}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{ADMIN_UID}from"../firebase-config.js";
const app=getApp(),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let sales=[],catalog={categories:[],items:[]},settings={tableCount:15,tableMeta:{}},activeTableKey="";
onAuthStateChanged(auth,user=>{if(user?.uid!==ADMIN_UID)return;onSnapshot(collection(db,"adminSales"),s=>{sales=s.docs.map(d=>d.data());sortFrequent()});onSnapshot(doc(db,"publicMenu","catalog"),s=>{catalog=s.data()||catalog});onSnapshot(doc(db,"adminAppSettings","pos"),s=>{settings=s.data()||settings})});

document.addEventListener("click",event=>{const table=event.target.closest("[data-key]");if(table?.dataset.key?.startsWith("table-"))activeTableKey=table.dataset.key});
$("creditOrderForm").addEventListener("submit",()=>waitAndClearCreditLink(activeTableKey));
function waitAndClearCreditLink(key,attempt=0){if(!key)return;setTimeout(async()=>{if($("creditOrderDialog").open){if(attempt<40)waitAndClearCreditLink(key,attempt+1);return}const next={...(settings.tableMeta||{}),[key]:{...(settings.tableMeta?.[key]||{}),creditCustomerId:""}};try{await setDoc(doc(db,"adminAppSettings","pos"),{tableMeta:next,updatedAt:serverTimestamp()},{merge:true})}catch(error){console.error(error)}},200)}

const names=document.createElement("div");names.className="table-name-settings";names.innerHTML='<h3>Kalıcı Masa İsimleri</h3><p>Masa isimleri hesap kapansa da değişmez.</p><div id="bulkTableNames"></div>';$("tableCountInput").closest("label").after(names);
$("tableSettings").addEventListener("click",()=>setTimeout(renderTableNames));
$("tableCountInput").addEventListener("input",renderTableNames);
$("settingsForm").addEventListener("submit",async()=>{const next={...(settings.tableMeta||{})};document.querySelectorAll("[data-table-name]").forEach(input=>{const key=input.dataset.tableName;next[key]={...(next[key]||{}),name:input.value.trim()}});await setDoc(doc(db,"adminAppSettings","pos"),{tableMeta:next,updatedAt:serverTimestamp()},{merge:true})});
function renderTableNames(){const count=Math.min(50,Math.max(1,Number($("tableCountInput").value)||15));$("bulkTableNames").innerHTML=Array.from({length:count},(_,i)=>{const key=`table-${i+1}`;return`<label><span>${i+1}</span><input data-table-name="${key}" maxlength="30" value="${esc(settings.tableMeta?.[key]?.name||`Masa ${i+1}`)}"></label>`}).join("")}

new MutationObserver(sortFrequent).observe($("productGrid"),{childList:true});
function sortFrequent(){if(!document.querySelector('[data-category="all"].active'))return;const counts=new Map();for(const sale of sales)for(const item of sale.items||[])counts.set(item.id,(counts.get(item.id)||0)+Number(item.quantity||0));const current=[...$("productGrid").children],sorted=[...current].sort((a,b)=>(counts.get(b.dataset.product)||0)-(counts.get(a.dataset.product)||0));if(current.every((node,index)=>node===sorted[index]))return;sorted.forEach(node=>$("productGrid").append(node))}

$("dailyStatus").addEventListener("click",()=>setTimeout(renderCategoryReport));
function renderCategoryReport(){const target=$("dailyReport").querySelector(".report-products");if(!target)return;const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date()),quantities=new Map();for(const sale of sales.filter(s=>s.businessDate===day&&s.recordType==="sale"))for(const item of sale.items||[])if(!item.complimentary)quantities.set(item.id,(quantities.get(item.id)||0)+Number(item.quantity||0));const groups=(catalog.categories||[]).map(category=>({name:category.name,items:(catalog.items||[]).filter(item=>item.categoryId===category.id&&quantities.get(item.id)).map(item=>({name:item.name,qty:quantities.get(item.id)}))})).filter(group=>group.items.length);target.innerHTML=`<span>Ürünlere göre adet</span><div class="category-report-grid">${groups.map(group=>`<article><h4>${esc(group.name)}</h4>${group.items.map(item=>`<div><span>${esc(item.name)}</span><b>${item.qty} adet</b></div>`).join("")}</article>`).join("")||"<p>Henüz ürün satışı yok.</p>"}</div>`}
function esc(v=""){const d=document.createElement("div");d.textContent=v;return d.innerHTML}

import{getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{collection,doc,getDoc,getFirestore,serverTimestamp,setDoc}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{lockSensitiveAccess,requireSensitiveAccess}from"../assets/js/sensitive-access.js";
import{firebaseConfig}from"../assets/js/firebase-config.js";
import{getManagementProfile}from"../assets/js/admin-access.js";

const app=getApps().find(item=>item.name==="[DEFAULT]")||initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const defaultIncome=["İşletmeye Para Girişi","PET Şişe Dönüşüm İadesi","Diğer Gelir"];
const defaultExpense=["Toptancı / Ürün Alımı","Faturalar","Kira","Elektrik","Su","İnternet","Demirbaş","Temizlik","Market","Manav","Bakım ve Onarım","Maaş Ödemesi","Diğer Gider"];
const button=$("quickCashButton"),dialog=$("quickCashDialog"),form=$("quickCashForm"),category=$("quickCashCategory"),categoryButton=$("quickCashCategoryButton"),categoryLabel=$("quickCashCategoryLabel"),categoryPicker=$("quickCashCategoryPicker"),amount=$("quickCashAmount"),description=$("quickCashDescription"),save=$("saveQuickCash");
let categories={income:defaultIncome,expense:defaultExpense},groups={income:[],expense:[]},activeBusinessDate=today(),busy=false;

button?.addEventListener("click",openQuickCash);
$("closeQuickCash")?.addEventListener("click",()=>dialog.close());
$("cancelQuickCash")?.addEventListener("click",()=>dialog.close());
form?.addEventListener("change",event=>{if(event.target.name==="quickCashType"){renderCategories();syncPersonnelAccounts()}});
form?.addEventListener("submit",saveQuickMovement);
categoryButton?.addEventListener("click",()=>categoryPicker.hidden?openCategoryPicker():closeCategoryPicker());
categoryPicker?.addEventListener("click",event=>{const option=event.target.closest("[data-quick-category]");if(!option)return;const type=form.elements.quickCashType.value,item=(categories[type]||[]).find(x=>x.id===option.dataset.quickCategory);if(!item)return;category.value=item.id;categoryLabel.textContent=item.name;categoryButton.classList.add("is-selected");closeCategoryPicker();categoryButton.focus()});
document.addEventListener("pointerdown",event=>{if(!categoryPicker.hidden&&!categoryPicker.contains(event.target)&&!categoryButton.contains(event.target))closeCategoryPicker()});
dialog?.addEventListener("keydown",event=>{if(event.key==="Escape"&&!categoryPicker.hidden){event.preventDefault();event.stopPropagation();closeCategoryPicker();categoryButton.focus()}});
form?.addEventListener("scroll",closeCategoryPicker);
window.addEventListener("resize",closeCategoryPicker);

async function openQuickCash(){
  const profile=await getManagementProfile(auth.currentUser,db),personnel=profile?.permissions?.includes("personnel");
  if(!personnel)lockSensitiveAccess();
  const unlocked=personnel||await requireSensitiveAccess({title:"Hızlı Kasa İşlemi",message:"Gelir veya gider eklemek için yönetici PIN'ini girin."});
  if(!unlocked)return;
  form.reset();
  form.elements.quickCashType.value="expense";
  form.elements.quickCashAccount.value="cash";
  await Promise.all([loadCategories(),loadBusinessDate()]);
  renderCategories();
  renderAccountLabel();
  applyPersonnelLimits(personnel);
  $("quickCashDate").textContent=`İş günü: ${formatDate(activeBusinessDate)} • Saat otomatik kaydedilir`;
  dialog.showModal();
  setTimeout(()=>amount.focus(),80);
}

function applyPersonnelLimits(personnel){form.dataset.personnel=personnel?"true":"false";syncPersonnelAccounts()}
function syncPersonnelAccounts(){const personnel=form.dataset.personnel==="true",expense=form.elements.quickCashType.value==="expense",bank=form.querySelector('[name="quickCashAccount"][value="bank"]'),card=$("quickCashCardAccount"),cashOnly=personnel&&expense;if(bank)bank.disabled=cashOnly;if(card)card.disabled=cashOnly;if(cashOnly)form.elements.quickCashAccount.value="cash"}

async function loadCategories(){
  try{
    const snapshot=await getDoc(doc(db,"adminCashSettings","config")),data=snapshot.exists()?snapshot.data():{};
    categories={income:activeItems(data.incomeCategories,defaultIncome,"income"),expense:activeItems(data.expenseCategories,defaultExpense,"expense")};groups={income:groupItems(data.incomeGroups,"income"),expense:groupItems(data.expenseGroups,"expense")};
  }catch(error){console.error(error);categories={income:activeItems([],defaultIncome,"income"),expense:activeItems([],defaultExpense,"expense")};groups={income:groupItems([],"income"),expense:groupItems([],"expense")};toast("Kasa kategorileri alınamadı; varsayılan liste açıldı.")}
}

async function loadBusinessDate(){
  try{const snapshot=await getDoc(doc(db,"adminAppSettings","pos")),data=snapshot.exists()?snapshot.data():{};activeBusinessDate=data.currentBusinessDate||today()}catch(error){console.warn(error);activeBusinessDate=today()}
}

function activeItems(items,defaults,type){const list=Array.isArray(items)&&items.length?items:defaults.map((name,i)=>({id:`${type}-${i+1}`,name,active:true}));return list.map((x,i)=>typeof x==="string"?{id:`${type}-${i+1}`,name:x,groupId:"",active:true}:{id:String(x.id||`${type}-${i+1}`),name:String(x.name||""),groupId:String(x.groupId||""),active:x.active!==false}).filter(x=>x.active&&x.name)}
function groupItems(items,type){return[{id:`${type}-legacy`,name:"Diğer",active:true},...(Array.isArray(items)?items:[]).filter(x=>x&&x.id!==`${type}-legacy`).map(x=>({id:String(x.id),name:String(x.name||"Grup"),active:x.active!==false}))]}
const categoryOrder=new Intl.Collator("tr",{numeric:true,sensitivity:"base"});
function renderCategories(){category.value="";categoryLabel.textContent="Kategori seçin";categoryButton.classList.remove("is-selected");closeCategoryPicker();const type=form.elements.quickCashType.value||"expense",items=categories[type]||[],available=(groups[type]||[]).filter(g=>g.active).sort((a,b)=>categoryOrder.compare(a.name,b.name));categoryPicker.innerHTML=available.map(group=>{const children=items.filter(item=>(item.groupId||`${type}-legacy`)===group.id).sort((a,b)=>categoryOrder.compare(a.name,b.name));return children.length?`<div class="quick-cash-category-group">${esc(group.name)}</div>${children.map(item=>`<button type="button" role="option" data-quick-category="${esc(item.id)}" class="quick-cash-category-option">${esc(item.name)}</button>`).join("")}`:""}).join("")||'<p class="quick-cash-category-empty">Kategori bulunamadı.</p>';renderAccountLabel()}
function openCategoryPicker(){const field=categoryButton.getBoundingClientRect(),box=dialog.getBoundingClientRect();categoryPicker.style.left=`${field.left-box.left}px`;categoryPicker.style.top=`${field.bottom-box.top+4}px`;categoryPicker.style.width=`${field.width}px`;categoryPicker.style.maxHeight=`${Math.max(60,Math.min(300,window.innerHeight-field.bottom-12))}px`;categoryPicker.hidden=false;categoryButton.setAttribute("aria-expanded","true");categoryPicker.scrollTop=0}
function closeCategoryPicker(){if(!categoryPicker)return;categoryPicker.hidden=true;categoryButton?.setAttribute("aria-expanded","false")}

function renderAccountLabel(){
  const label=$("quickCashCardLabel"),input=$("quickCashCardAccount"),income=form.elements.quickCashType.value==="income";
  if(label)label.textContent=income?"Kart":"Kredi Kartı";
  if(input)input.value=income?"card":"creditCard";
}

async function saveQuickMovement(event){
  event.preventDefault();
  if(busy)return;
  const type=form.elements.quickCashType.value,account=form.elements.quickCashAccount.value,value=Number(amount.value),selectedItem=(categories[type]||[]).find(x=>x.id===category.value),selectedGroup=(groups[type]||[]).find(x=>x.id===(selectedItem?.groupId||`${type}-legacy`)),selectedCategory=selectedItem?.name||"",note=description.value.trim();
  if(form.dataset.personnel==="true"&&type==="expense"&&account!=="cash")return toast("Personel yalnızca nakit gider ekleyebilir.");
  const validAccount=type==="income"?["cash","bank","card"].includes(account):["cash","bank","creditCard"].includes(account);
  if(!["income","expense"].includes(type)||!validAccount)return toast("İşlem türü veya hesap seçimi geçersiz.");
  if(!Number.isFinite(value)||value<=0)return toast("Geçerli bir tutar girin.");
  if(!selectedCategory||!selectedGroup||!selectedGroup.active)return toast("Grup ve kategori seçin.");
  busy=true;save.disabled=true;save.textContent="Kaydediliyor…";
  const createdAtMs=Date.now();
  try{
    await setDoc(doc(collection(db,"adminCashMovements")),{type,amount:value,account,fromAccount:"",toAccount:"",category:selectedCategory,categoryId:selectedItem.id,groupId:selectedGroup.id,groupName:selectedGroup.name,description:note||selectedCategory,businessDate:activeBusinessDate,automatic:false,source:"pos-quick-cash",createdAtMs,updatedAtMs:createdAtMs,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:auth.currentUser.uid});
    dialog.close();
    toast(`${type==="expense"?"Gider":"Gelir"} kasa bölümüne kaydedildi.`);
  }catch(error){console.error(error);toast("Kasa hareketi kaydedilemedi. Yetki ve bağlantıyı kontrol edin.")}
  finally{busy=false;save.disabled=false;save.textContent="Kaydet"}
}

function toast(message){const target=$("toast");if(!target)return;target.textContent=message;target.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>target.classList.remove("show"),3200)}
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date())}
function formatDate(value){const[y,m,d]=String(value).split("-");return`${d}.${m}.${y}`}
function esc(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]))}

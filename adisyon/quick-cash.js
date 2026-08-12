import{getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{collection,doc,getDoc,getFirestore,serverTimestamp,setDoc}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{lockSensitiveAccess,requireSensitiveAccess}from"../assets/js/sensitive-access.js";
import{firebaseConfig}from"../assets/js/firebase-config.js";

const app=getApps().find(item=>item.name==="[DEFAULT]")||initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const defaultIncome=["İşletmeye Para Girişi","PET Şişe Dönüşüm İadesi","Diğer Gelir"];
const defaultExpense=["Toptancı / Ürün Alımı","Faturalar","Kira","Elektrik","Su","İnternet","Demirbaş","Temizlik","Market","Manav","Bakım ve Onarım","Maaş Ödemesi","Diğer Gider"];
const button=$("quickCashButton"),dialog=$("quickCashDialog"),form=$("quickCashForm"),category=$("quickCashCategory"),amount=$("quickCashAmount"),description=$("quickCashDescription"),save=$("saveQuickCash");
let categories={income:defaultIncome,expense:defaultExpense},activeBusinessDate=today(),busy=false;

button?.addEventListener("click",openQuickCash);
$("closeQuickCash")?.addEventListener("click",()=>dialog.close());
$("cancelQuickCash")?.addEventListener("click",()=>dialog.close());
form?.addEventListener("change",event=>{if(event.target.name==="quickCashType")renderCategories()});
form?.addEventListener("submit",saveQuickMovement);

async function openQuickCash(){
  lockSensitiveAccess();
  const unlocked=await requireSensitiveAccess({title:"Hızlı Kasa İşlemi",message:"Gelir veya gider eklemek için yönetici PIN'ini girin."});
  if(!unlocked)return;
  form.reset();
  form.elements.quickCashType.value="expense";
  form.elements.quickCashAccount.value="cash";
  await Promise.all([loadCategories(),loadBusinessDate()]);
  renderCategories();
  renderAccountLabel();
  $("quickCashDate").textContent=`İş günü: ${formatDate(activeBusinessDate)} • Saat otomatik kaydedilir`;
  dialog.showModal();
  setTimeout(()=>amount.focus(),80);
}

async function loadCategories(){
  try{
    const snapshot=await getDoc(doc(db,"adminCashSettings","config")),data=snapshot.exists()?snapshot.data():{};
    categories={income:activeNames(data.incomeCategories,defaultIncome),expense:activeNames(data.expenseCategories,defaultExpense)};
  }catch(error){console.error(error);categories={income:defaultIncome,expense:defaultExpense};toast("Kasa kategorileri alınamadı; varsayılan liste açıldı.")}
}

async function loadBusinessDate(){
  try{const snapshot=await getDoc(doc(db,"adminAppSettings","pos")),data=snapshot.exists()?snapshot.data():{};activeBusinessDate=data.currentBusinessDate||today()}catch(error){console.warn(error);activeBusinessDate=today()}
}

function activeNames(items,defaults){
  if(!Array.isArray(items)||!items.length)return defaults;
  const names=items.filter(item=>typeof item==="string"||item?.active!==false).map(item=>typeof item==="string"?item:String(item?.name||"").trim()).filter(Boolean);
  return names.length?names:defaults;
}

function renderCategories(){
  const type=form.elements.quickCashType.value||"expense",items=categories[type]||[];
  category.innerHTML=items.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join("");
  renderAccountLabel();
}

function renderAccountLabel(){
  const label=$("quickCashCardLabel");
  if(label)label.textContent=form.elements.quickCashType.value==="income"?"Kart":"Kredi Kartı";
}

async function saveQuickMovement(event){
  event.preventDefault();
  if(busy)return;
  const type=form.elements.quickCashType.value,account=form.elements.quickCashAccount.value,value=Number(amount.value),selectedCategory=category.value,note=description.value.trim();
  if(!["income","expense"].includes(type)||!["cash","bank"].includes(account))return toast("İşlem türü veya hesap seçimi geçersiz.");
  if(!Number.isFinite(value)||value<=0)return toast("Geçerli bir tutar girin.");
  if(!selectedCategory)return toast("Bir kategori seçin.");
  busy=true;save.disabled=true;save.textContent="Kaydediliyor…";
  const createdAtMs=Date.now();
  try{
    await setDoc(doc(collection(db,"adminCashMovements")),{type,amount:value,account,fromAccount:"",toAccount:"",category:selectedCategory,description:note||selectedCategory,businessDate:activeBusinessDate,automatic:false,source:"pos-quick-cash",createdAtMs,updatedAtMs:createdAtMs,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:auth.currentUser.uid});
    dialog.close();
    toast(`${type==="expense"?"Gider":"Gelir"} kasa bölümüne kaydedildi.`);
  }catch(error){console.error(error);toast("Kasa hareketi kaydedilemedi. Yetki ve bağlantıyı kontrol edin.")}
  finally{busy=false;save.disabled=false;save.textContent="Kaydet"}
}

function toast(message){const target=$("toast");if(!target)return;target.textContent=message;target.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>target.classList.remove("show"),3200)}
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date())}
function formatDate(value){const[y,m,d]=String(value).split("-");return`${d}.${m}.${y}`}
function esc(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]))}

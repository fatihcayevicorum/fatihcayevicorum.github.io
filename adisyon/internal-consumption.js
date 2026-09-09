import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, doc, getFirestore, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "../assets/js/firebase-config.js";
import { hasPanelAccess } from "../assets/js/admin-access.js";

const app=getApps()[0]||initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const menuRef=doc(db,"publicMenu","catalog"),settingsRef=doc(db,"adminAppSettings","pos"),stockCol=collection(db,"adminStockItems"),stockMovesCol=collection(db,"adminStockMovements"),consumptionCol=collection(db,"adminInternalConsumptions");
const pendingStorageKey="fatih-cay-evi-internal-consumption-pending-v1";
let catalog={categories:[],items:[]},stocks=[],cart=[],category="all",busy=false,businessDate=today();
const dialog=$("internalConsumptionDialog"),openButton=$("internalConsumptionButton"),closeButton=$("closeInternalConsumption"),search=$("internalSearch"),tabs=$("internalCategoryTabs"),grid=$("internalProductGrid"),empty=$("internalProductEmpty"),items=$("internalCartItems"),cartEmpty=$("internalCartEmpty"),note=$("internalNote"),total=$("internalTotalQuantity"),clear=$("clearInternalCart"),save=$("saveInternalConsumption"),toast=$("toast");
if(!dialog||!openButton) throw new Error("Dahili Tüketim arayüzü bulunamadı.");
openButton.addEventListener("click",()=>{restorePending();category="all";search.value="";render();dialog.showModal();requestAnimationFrame(()=>{search.focus({preventScroll:true});search.select()})});
closeButton.addEventListener("click",()=>dialog.close());
dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close()});
dialog.addEventListener("cancel",e=>{e.preventDefault();dialog.close()});
search.addEventListener("input",renderProducts);note.addEventListener("input",persistPending);clear.addEventListener("click",()=>{cart=[];note.value="";persistPending();render()});save.addEventListener("click",saveConsumption);
tabs.addEventListener("click",e=>{const b=e.target.closest("[data-internal-category]");if(!b)return;category=b.dataset.internalCategory;renderProducts()});
grid.addEventListener("click",e=>{const b=e.target.closest("[data-internal-product]");if(!b||busy)return;const product=availableProducts().find(x=>x.id===b.dataset.internalProduct);if(!product)return;const line=cart.find(x=>x.id===product.id);line?line.quantity++:cart.push({id:product.id,name:product.name,quantity:1});search.value="";persistPending();render();requestAnimationFrame(()=>search.focus({preventScroll:true}))});
items.addEventListener("click",e=>{const b=e.target.closest("[data-internal-qty]");if(!b||busy)return;const line=cart.find(x=>x.id===b.dataset.internalId);if(!line)return;line.quantity+=Number(b.dataset.internalQty);if(line.quantity<=0)cart=cart.filter(x=>x.id!==line.id);persistPending();render()});
onAuthStateChanged(auth,async user=>{if(!await hasPanelAccess(user,db,"pos"))return;onSnapshot(settingsRef,s=>{businessDate=String(s.data()?.currentBusinessDate||today());restorePending();render()},error=>{console.warn(error);restorePending();render()});onSnapshot(menuRef,s=>{const d=s.exists()?s.data():{};catalog={categories:Array.isArray(d.categories)?d.categories:[],items:Array.isArray(d.items)?d.items:[]};render()},error=>notify("Menü bilgileri alınamadı."));onSnapshot(stockCol,s=>{stocks=s.docs.map(x=>({id:x.id,...x.data()}));render()},error=>notify("Stok bilgileri alınamadı."))});
function availableProducts(){return catalog.items.filter(p=>p.available!==false&&stocks.some(s=>s.active!==false&&s.automaticDeduction&&s.linkedMenuItemId===p.id)).sort((a,b)=>String(a.name).localeCompare(String(b.name),"tr"))}
function render(){renderProducts();renderCart()}
function renderProducts(){const all=availableProducts(),q=search.value.trim().toLocaleLowerCase("tr-TR"),cats=catalog.categories.filter(c=>all.some(p=>p.categoryId===c.id));tabs.innerHTML=`<button class="${category==="all"?"active":""}" data-internal-category="all">Tümü</button>`+cats.map(c=>`<button class="${category===c.id?"active":""}" data-internal-category="${esc(c.id)}">${esc(c.name)}</button>`).join("");const filtered=all.filter(p=>(category==="all"||p.categoryId===category)&&(!q||String(p.name).toLocaleLowerCase("tr-TR").includes(q)));empty.hidden=filtered.length>0;grid.innerHTML=filtered.map(p=>`<button type="button" class="product internal-product-button" data-internal-product="${esc(p.id)}"><strong>${esc(p.name)}</strong></button>`).join("")}
function renderCart(){const qty=cart.reduce((s,x)=>s+x.quantity,0);cartEmpty.hidden=cart.length>0;items.innerHTML=cart.map(x=>`<article class="order-item"><div><strong>${esc(x.name)}</strong><small>Dahili tüketim</small></div><div class="qty"><button type="button" data-internal-id="${esc(x.id)}" data-internal-qty="-1">−</button><b>${x.quantity}</b><button type="button" data-internal-id="${esc(x.id)}" data-internal-qty="1">+</button></div></article>`).join("");total.textContent=qty;save.disabled=!qty||busy}
async function saveConsumption(){
  if(busy||!cart.length)return;
  busy=true;renderCart();
  try{
    const submittedCart=cart.map(x=>({...x})),submittedNote=note.value.trim(),ref=doc(consumptionCol),date=businessDate,createdAtMs=Date.now();
    await runTransaction(db,async tx=>{
      const deductions=[];
      for(const line of submittedCart){
        const links=stocks.filter(s=>s.active!==false&&s.automaticDeduction&&s.linkedMenuItemId===line.id);
        if(!links.length)throw new Error("stock-link");
        for(const stock of links){
          const sr=doc(stockCol,stock.id),snap=await tx.get(sr);
          if(!snap.exists())throw new Error("stock-missing");
          const fresh=snap.data(),amount=line.quantity*(Number(stock.deductionAmount)||1),before=Number(fresh.quantity)||0,unitCost=Number(fresh.unitCost)||Number(stock.unitCost)||0;
          if(before<amount)throw new Error(`insufficient:${stock.name||line.name}:${before}:${amount}`);
          deductions.push({line,stock,sr,amount,before,after:before-amount,unitCost,totalCost:amount*unitCost});
        }
      }
      const costByItem=new Map();
      for(const d of deductions){
        tx.update(d.sr,{quantity:d.after,updatedAt:serverTimestamp()});
        tx.set(doc(stockMovesCol),{stockItemId:d.stock.id,stockName:d.stock.name||d.line.name,type:"out",amount:d.amount,previousQuantity:d.before,resultingQuantity:d.after,unit:d.stock.unit||"adet",unitCost:d.unitCost,totalCost:d.totalCost,operationDate:date,note:`Dahili Tüketim: ${d.line.name}`,source:"internal-consumption",consumptionId:ref.id,createdAtMs,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid});
        costByItem.set(d.line.id,(costByItem.get(d.line.id)||0)+d.totalCost);
      }
      const savedItems=submittedCart.map(x=>({...x,totalCost:costByItem.get(x.id)||0,unitCost:x.quantity>0?(costByItem.get(x.id)||0)/x.quantity:0})),totalCost=savedItems.reduce((sum,x)=>sum+Number(x.totalCost||0),0);
      tx.set(ref,{businessDate:date,items:savedItems,totalQuantity:submittedCart.reduce((s,x)=>s+x.quantity,0),totalCost,note:submittedNote,createdAtMs,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid});
    });
    notify("Dahili tüketim stoktan düşüldü.");dialog.close();cart=[];note.value="";persistPending();render();
  }catch(error){console.error(error);const parts=String(error.message||"").split(":");notify(error.message==="stock-link"?"Seçilen ürünün stok bağlantısı bulunamadı.":parts[0]==="insufficient"?`${parts[1]} stoku yetersiz. Mevcut: ${parts[2]}, gereken: ${parts[3]}.`:"Dahili tüketim kaydedilemedi.")}
  finally{busy=false;renderCart()}
}
function restorePending(){
  try{
    const saved=JSON.parse(localStorage.getItem(pendingStorageKey)||"null");
    if(!saved||saved.businessDate!==businessDate){localStorage.removeItem(pendingStorageKey);cart=[];note.value="";return}
    cart=Array.isArray(saved.items)?saved.items.map(x=>({id:String(x.id||""),name:String(x.name||"Ürün"),quantity:Math.max(1,Math.floor(Number(x.quantity)||1))})).filter(x=>x.id):[];
    note.value=String(saved.note||"").slice(0,80);
  }catch(error){console.warn("Bekleyen dahili tüketim listesi okunamadı.",error);localStorage.removeItem(pendingStorageKey);cart=[];note.value=""}
}
function persistPending(){
  try{
    if(!cart.length&&!note.value.trim()){localStorage.removeItem(pendingStorageKey);return}
    localStorage.setItem(pendingStorageKey,JSON.stringify({businessDate,items:cart.map(x=>({id:x.id,name:x.name,quantity:x.quantity})),note:note.value.trim(),updatedAtMs:Date.now()}));
  }catch(error){console.warn("Bekleyen dahili tüketim listesi saklanamadı.",error);notify("Dahili tüketim listesi cihazda saklanamadı.")}
}
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date())}
function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
function notify(message){if(!toast)return;toast.textContent=message;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),3000)}

import{initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{getFirestore}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{firebaseConfig}from"../assets/js/firebase-config.js";
import{getManagementProfile,isOwner}from"../assets/js/admin-access.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const daily=[
  {permission:"tea",name:"Taze Dem",description:"Demlikleri ve tazelik sürelerini takip et",path:"taze-dem-paneli/",icon:"fa-mug-hot"},
  {permission:"pos",name:"Adisyon",description:"Masaları, siparişleri ve ödemeleri yönet",path:"adisyon/",icon:"fa-receipt"}
];
const management=[
  {permission:"menu",name:"Menü Yönetimi",description:"Kategori, ürün ve fiyatları düzenle",path:"menu-yonetimi/",icon:"fa-utensils"},
  {permission:"stock",name:"Stok Takibi",description:"Stok miktarlarını ve hareketlerini izle",path:"stok-yonetimi/",icon:"fa-boxes-stacked"},
  {permission:"stock",name:"Sipariş Listesi",description:"Stok siparişlerini hazırla ve teslimatları takip et",path:"siparis-listesi/",icon:"fa-clipboard-list"},
  {permission:"merchant",name:"Esnaf Yönetimi",description:"Esnaf müşterileri ve çay siparişlerini yönet",path:"esnaf-yonetimi/",icon:"fa-store"},
  {permission:"reports",name:"Raporlar",description:"Satış ve işletme raporlarını incele",path:"raporlar/?v=200",icon:"fa-chart-column"},
  {permission:"cash",name:"Kasa ve Hesaplar",description:"Kasa ile banka hareketlerini takip et",path:"kasa-hesap-yonetimi/?v=202",icon:"fa-vault"},
  {ownerOnly:true,name:"Personel Yönetimi",description:"Çalışma günlerini, hak edişleri ve ödemeleri takip et",path:"personel-yonetimi/",icon:"fa-people-roof"},
  {permission:"home",name:"Ana Sayfa Yönetimi",description:"Duyuru ve kampanya alanlarını düzenle",path:"ana-sayfa-yonetimi/",icon:"fa-house"},
  {ownerOnly:true,name:"Bildirim Merkezi",description:"Yeni yapı için ayrılan yönetim alanı",path:"bildirim-merkezi/",icon:"fa-bell"},
  {ownerOnly:true,name:"Veri ve Yedekleme",description:"Verileri dışa aktar ve yedekleri yönet",path:"veri-yonetimi/",icon:"fa-database"},
  {ownerOnly:true,name:"Kullanıcı Yönetimi",description:"Kullanıcı oluştur ve panel yetkilerini belirle",path:"kullanici-yonetimi/",icon:"fa-users-gear"},
  {soon:true,name:"Üye Yönetimi",description:"Müşteri üyeliği ve sadakat sistemi",icon:"fa-id-card"}
];

onAuthStateChanged(auth,async user=>{
  if(!user){location.replace("../yonetici-giris.html?next=yonetim-merkezi/");return}
  const profile=await getManagementProfile(user,db).catch(()=>null);
  if(!profile){await signOut(auth);location.replace("../yonetici-giris.html");return}
  renderWelcome(profile);
  const owner=isOwner(user),can=item=>item.soon||owner||(!item.ownerOnly&&profile.permissions.includes(item.permission));
  const visibleDaily=daily.filter(can),visibleManagement=management.filter(can);
  $("dailySection").hidden=!visibleDaily.length;
  $("dailyGrid").innerHTML=visibleDaily.map(card).join("");
  $("managementGrid").innerHTML=visibleManagement.map(card).join("");
  $("emptyState").hidden=visibleManagement.length>0;
});

$("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
function card(item){
  if(item.soon)return`<article class="center-card is-soon" aria-disabled="true"><span class="soon-badge">YAKINDA</span><span class="card-icon"><i class="fa-solid ${item.icon}"></i></span><div><strong>${item.name}</strong><small>${item.description}</small></div></article>`;
  return`<a class="center-card" href="../${item.path}"><i class="fa-solid fa-arrow-right arrow"></i><span class="card-icon"><i class="fa-solid ${item.icon}"></i></span><div><strong>${item.name}</strong><small>${item.description}</small></div></a>`;
}
function renderWelcome(profile){
  const copy=document.querySelector(".brand-copy");
  if(!copy||copy.querySelector(".user-welcome"))return;
  const text=document.createElement("p");
  text.className="user-welcome";
  text.textContent=`Hoş geldin, ${profile.displayName||"Kullanıcı"}`;
  copy.querySelector(".eyebrow")?.insertAdjacentElement("afterend",text);
}
function tick(){const d=new Date;$("currentTime").textContent=d.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});$("currentDate").textContent=d.toLocaleDateString("tr-TR")}tick();setInterval(tick,1000);

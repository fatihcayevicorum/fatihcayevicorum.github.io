import{getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{doc,getFirestore,onSnapshot}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{firebaseConfig}from"./firebase-config.js";
const app=getApps().find(a=>a.name==="[DEFAULT]")||initializeApp(firebaseConfig),db=getFirestore(app);
ensureFooter();
const panelMenu=document.querySelector(".panel-menu-list");if(panelMenu&&!panelMenu.querySelector('[href*="ana-sayfa-yonetimi"]'))panelMenu.insertAdjacentHTML("beforeend",'<a href="../ana-sayfa-yonetimi/"><i class="fa-solid fa-house-pen"></i>Ana Sayfa Yönetimi</a>');
onSnapshot(doc(db,"publicSite","config"),snapshot=>{const data=snapshot.data()||{};if(data.logoUrl)document.querySelectorAll("img.logo,img.brand-logo,.login-card img,.brand img").forEach(img=>{img.src=data.logoUrl});});
function ensureFooter(){let footer=document.querySelector("footer");if(!footer){footer=document.createElement("footer");document.body.append(footer)}footer.classList.add("system-footer");footer.innerHTML="<p>© 2026 Fatih Çay Evi — Tüm Hakları Saklıdır.</p>";const style=document.createElement("style");style.textContent=".system-footer{width:100%;margin:28px 0 0!important;padding:20px 12px!important;text-align:center!important;background:transparent!important;color:#776b67!important;font:500 .72rem Poppins,Arial,sans-serif!important;border:0!important}.system-footer p{margin:0!important}";document.head.append(style)}

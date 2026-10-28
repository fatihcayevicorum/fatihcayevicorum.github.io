import{getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{getFirestore}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{firebaseConfig}from"../assets/js/firebase-config.js";
import{hasPanelAccess}from"../assets/js/admin-access.js";
import{mountBoilerPage}from"../assets/js/smart-boiler.js?v=609";
const app=getApps().find(a=>a.name==="[DEFAULT]")||initializeApp(firebaseConfig);
onAuthStateChanged(getAuth(app),async user=>{
 const page=document.getElementById("boilerPage"),notice=document.getElementById("boilerAccess");page.hidden=true;
 if(!user){location.replace("../yonetici-giris.html?next=akilli-kazan/");return}
 try{if(!await hasPanelAccess(user,getFirestore(app),"tea")){notice.textContent="Bu sayfa için Taze Dem yetkisi gerekiyor.";return}
 notice.hidden=true;page.hidden=false;mountBoilerPage(page);
 }catch{notice.hidden=false;notice.textContent="Yetki kontrolü tamamlanamadı. Bağlantınızı kontrol edip sayfayı yenileyin."}
});

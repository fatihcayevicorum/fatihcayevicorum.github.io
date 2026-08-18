import{getApp,getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{ADMIN_UID,firebaseConfig}from"../assets/js/firebase-config.js";
const app=getApps().length?getApp():initializeApp(firebaseConfig),auth=getAuth(app),byId=id=>document.getElementById(id);
onAuthStateChanged(auth,current=>{if(!current||current.uid!==ADMIN_UID)location.replace("../yonetici-giris.html?next=bildirim-merkezi/")});
byId("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
function tick(){const now=new Date;byId("currentTime").textContent=now.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});byId("currentDate").textContent=now.toLocaleDateString("tr-TR")}
tick();setInterval(tick,1000);

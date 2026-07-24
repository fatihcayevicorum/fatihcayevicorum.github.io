import{initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";import{ADMIN_UID,firebaseConfig}from"../firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),$=id=>document.getElementById(id);
onAuthStateChanged(auth,async user=>{if(!user||user.uid!==ADMIN_UID){if(user)await signOut(auth);location.replace("../yonetici-giris.html?next=operasyon-paneli/")}});
$("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
function tick(){const now=new Date();$("currentTime").textContent=now.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});$("currentDate").textContent=now.toLocaleDateString("tr-TR").replaceAll(".","/")}tick();setInterval(tick,1000);

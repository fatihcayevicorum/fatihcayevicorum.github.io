import{initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{doc,getDoc,getFirestore}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{firebaseConfig}from"./firebase-config.js";
const app=initializeApp(firebaseConfig,"merchant-portal"),auth=getAuth(app),db=getFirestore(app);
const form=document.getElementById("loginForm"),username=document.getElementById("username"),password=document.getElementById("password"),button=document.getElementById("loginButton"),message=document.getElementById("loginMessage");
document.getElementById("showPassword").onclick=()=>{password.type=password.type==="password"?"text":"password";};
const loginError=new URLSearchParams(location.search).get("error");if(loginError==="inactive")show("Hesabınız kullanıma kapalı. İşletmeyle görüşün.");if(loginError==="profile")show("Esnaf profiliniz bulunamadı. İşletmeyle görüşün.");
onAuthStateChanged(auth,async user=>{if(!user)return;const profile=await getDoc(doc(db,"merchantProfiles",user.uid));if(profile.exists()&&profile.data().active!==false)location.replace("esnaf-paneli/");});
form.addEventListener("submit",async event=>{event.preventDefault();setBusy(true);try{const login=normalize(username.value);if(!login)throw Error("invalid");const result=await signInWithEmailAndPassword(auth,`${login}@esnaf.fatihcayevi.local`,password.value);const profile=await getDoc(doc(db,"merchantProfiles",result.user.uid));if(!profile.exists()||profile.data().active===false){await signOut(auth);throw Error("inactive");}location.replace("esnaf-paneli/");}catch(error){console.error(error);show(error.message==="inactive"?"Hesabınız kullanıma kapalı. İşletmeyle görüşün.":"Kullanıcı adı veya şifre hatalı.");setBusy(false);}});
function normalize(value){return value.trim().toLocaleLowerCase("tr-TR").replaceAll("ı","i").replaceAll("ş","s").replaceAll("ğ","g").replaceAll("ü","u").replaceAll("ö","o").replaceAll("ç","c").replace(/[^a-z0-9._-]/g,"");}
function show(text){message.textContent=text;message.classList.add("is-visible");}
function setBusy(busy){button.disabled=busy;button.innerHTML=busy?'<i class="fa-solid fa-circle-notch fa-spin"></i> Giriş yapılıyor…':'<i class="fa-solid fa-right-to-bracket"></i> Giriş Yap';}

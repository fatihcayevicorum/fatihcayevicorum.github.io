const base=new URL("../../",import.meta.url),path=location.pathname;
const adminPaths=["yonetici-giris","yonetim-merkezi","bildirim-merkezi","taze-dem-paneli","menu-yonetimi","stok-yonetimi","siparis-listesi","adisyon","adisyon-gecmisi","esnaf-yonetimi","raporlar","personel-yonetimi","ana-sayfa-yonetimi","tanimlamalar","veri-yonetimi","kasa-hesap-yonetimi","kullanici-yonetimi"];
const esnafPath=path.includes("/esnaf-giris")||path.includes("/esnaf-paneli/");
const manifest=esnafPath?"esnaf-manifest.webmanifest":adminPaths.some(x=>path.includes(x))?"admin-manifest.webmanifest":"manifest.webmanifest";
installHead(manifest);
let installPrompt=null;
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;showInstallButton()});
window.addEventListener("appinstalled",()=>{installPrompt=null;document.getElementById("pwaInstallButton")?.remove();notify("Fatih Çay Evi uygulaması kuruldu.")});
if("serviceWorker"in navigator){const startServiceWorker=async()=>{try{const registration=await navigator.serviceWorker.register(new URL("./service-worker.js",base),{scope:base.pathname,updateViaCache:"none"});registration.addEventListener("updatefound",()=>{const worker=registration.installing;worker?.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)showUpdateButton(worker)})})}catch(error){console.error("PWA kaydı yapılamadı:",error)}};document.readyState==="complete"?startServiceWorker():window.addEventListener("load",startServiceWorker,{once:true})}

function installHead(file){
  if(!document.querySelector('link[rel="manifest"]')){const link=document.createElement("link");link.rel="manifest";link.href=new URL(file,base).href;document.head.append(link)}
  if(!document.querySelector('link[rel="apple-touch-icon"]')){const icon=document.createElement("link");icon.rel="apple-touch-icon";icon.href=new URL("assets/icons/icon-192.png?v=264",base).href;document.head.append(icon)}
  // Telefonun durum çubuğu rengini tema yöneticisi belirler.
  // Burada sabit bordo atamak, seçilen temayı sayfa açıldıktan sonra eziyordu.
  const capable=document.createElement("meta");capable.name="apple-mobile-web-app-capable";capable.content="yes";document.head.append(capable);
  const title=document.createElement("meta");title.name="apple-mobile-web-app-title";title.content=adminPaths.some(x=>location.pathname.includes(x))?"Fatih Yönetim":"Fatih Çay Evi";document.head.append(title)
}
function showInstallButton(){
  if(document.getElementById("pwaInstallButton")||matchMedia("(display-mode: standalone)").matches)return;
  const button=document.createElement("button");button.id="pwaInstallButton";button.type="button";button.innerHTML='<i class="fa-solid fa-download"></i><span>Uygulamayı Yükle</span>';button.onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;button.remove()};document.body.append(button);addStyle()
}
function showUpdateButton(worker){
  if(document.getElementById("pwaUpdateButton"))return;const button=document.createElement("button");button.id="pwaUpdateButton";button.type="button";button.textContent="Yeni Sürüm Hazır";button.onclick=()=>{worker.postMessage({type:"SKIP_WAITING"});button.textContent="Güncellendi";button.disabled=true};document.body.append(button);addStyle()
}
function addStyle(){if(document.getElementById("pwaStyle"))return;const style=document.createElement("style"),managementPage=adminPaths.some(x=>path.includes(x));style.id="pwaStyle";style.textContent=`#pwaInstallButton,#pwaUpdateButton{position:fixed;right:16px;bottom:${managementPage?"92px":"16px"};z-index:79;display:flex;align-items:center;gap:8px;border:0;border-radius:14px;padding:12px 16px;background:var(--theme-primary,#64151d);color:var(--theme-on-primary,#fff);box-shadow:var(--theme-shadow,0 10px 30px #34101455);font:700 12px Poppins,Arial,sans-serif;cursor:pointer}#pwaInstallButton:active,#pwaUpdateButton:active{transform:scale(.97)}`;document.head.append(style)}
function notify(message){const toast=document.getElementById("toast");if(toast){toast.textContent=message;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2800)}}

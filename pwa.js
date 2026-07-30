const base=new URL("./",import.meta.url),path=location.pathname;
const adminPaths=["yonetici-giris","yonetim-merkezi","taze-dem-paneli","menu-yonetimi","stok-yonetimi","acik-hesap","adisyon","esnaf-yonetimi","raporlar","ana-sayfa-yonetimi","veri-yonetimi","kasa-hesap-yonetimi","bildirim-yonetimi","kullanici-yonetimi"];
const esnafPath=path.includes("/esnaf-giris")||path.includes("/esnaf-paneli/");
const manifest=esnafPath?"esnaf-manifest.webmanifest":adminPaths.some(x=>path.includes(x))?"admin-manifest.webmanifest":"manifest.webmanifest";
installHead(manifest);
let installPrompt=null;
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;showInstallButton()});
window.addEventListener("appinstalled",()=>{installPrompt=null;document.getElementById("pwaInstallButton")?.remove();notify("Fatih Çay Evi uygulaması kuruldu.")});
if("serviceWorker"in navigator)window.addEventListener("load",async()=>{try{const registration=await navigator.serviceWorker.register(new URL("./service-worker.js",base),{scope:base.pathname});registration.addEventListener("updatefound",()=>{const worker=registration.installing;worker?.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)showUpdateButton(worker)})})}catch(error){console.error("PWA kaydı yapılamadı:",error)}});

function installHead(file){
  if(!document.querySelector('link[rel="manifest"]')){const link=document.createElement("link");link.rel="manifest";link.href=new URL(file,base).href;document.head.append(link)}
  if(!document.querySelector('link[rel="apple-touch-icon"]')){const icon=document.createElement("link");icon.rel="apple-touch-icon";icon.href=new URL("pwa-icons/icon-192.png",base).href;document.head.append(icon)}
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content","#5a1018");
  const capable=document.createElement("meta");capable.name="apple-mobile-web-app-capable";capable.content="yes";document.head.append(capable);
  const title=document.createElement("meta");title.name="apple-mobile-web-app-title";title.content=adminPaths.some(x=>location.pathname.includes(x))?"Fatih Yönetim":"Fatih Çay Evi";document.head.append(title)
}
function showInstallButton(){
  if(document.getElementById("pwaInstallButton")||matchMedia("(display-mode: standalone)").matches)return;
  const button=document.createElement("button");button.id="pwaInstallButton";button.type="button";button.innerHTML='<i class="fa-solid fa-download"></i><span>Uygulamayı Yükle</span>';button.onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;button.remove()};document.body.append(button);addStyle()
}
function showUpdateButton(worker){
  const button=document.createElement("button");button.id="pwaUpdateButton";button.type="button";button.textContent="Yeni Sürümü Yükle";button.onclick=()=>worker.postMessage({type:"SKIP_WAITING"});document.body.append(button);addStyle();navigator.serviceWorker.addEventListener("controllerchange",()=>location.reload(),{once:true})
}
function addStyle(){if(document.getElementById("pwaStyle"))return;const style=document.createElement("style");style.id="pwaStyle";style.textContent="#pwaInstallButton,#pwaUpdateButton{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;align-items:center;gap:8px;border:0;border-radius:14px;padding:12px 16px;background:#64151d;color:#fff;box-shadow:0 10px 30px #34101455;font:700 12px Poppins,Arial,sans-serif;cursor:pointer}#pwaInstallButton:active,#pwaUpdateButton:active{transform:scale(.97)}";document.head.append(style)}
function notify(message){const toast=document.getElementById("toast");if(toast){toast.textContent=message;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2800)}}

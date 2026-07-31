import{getFunctions,httpsCallable}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";

const DEVICE_KEY="fatih-cay-evi-device-id-v1";
export function getDeviceId(){let id=localStorage.getItem(DEVICE_KEY);if(!id){const bytes=new Uint8Array(18);crypto.getRandomValues(bytes);id=[...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");localStorage.setItem(DEVICE_KEY,id)}return id}
export function deviceInfo(){const ua=navigator.userAgent||"",type=/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)?"tablet":/iPhone|iPod|Android.*Mobile/i.test(ua)?"telefon":"bilgisayar";return{deviceId:getDeviceId(),deviceType:type,deviceName:type==="telefon"?"Telefon":type==="tablet"?"Tablet":"Bilgisayar",platform:String(navigator.platform||"").slice(0,50),userAgent:ua.slice(0,240)}}
export async function registerDevice(app,audience){const call=httpsCallable(getFunctions(app,"europe-west1"),"registerLoginDevice");return(await call({...deviceInfo(),audience})).data}
export function deviceLimitMessage(error){const code=String(error?.code||"");if(code.includes("resource-exhausted"))return"Bu hesap izin verilen cihaz sayısına ulaştı. Eski cihazın yetkisini yönetim panelinden kaldırın.";if(code.includes("permission-denied"))return"Bu cihazın giriş yetkisi bulunmuyor.";return"Cihaz doğrulaması yapılamadı. İnternet bağlantısını kontrol edin."}

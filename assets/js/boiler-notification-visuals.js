/* R668: event-specific compact icons, shared by foreground and background. */
(function(root){
  const isBoiler=data=>String(data.type||"").startsWith("admin-boiler-");
  const typeOf=data=>String(data.type||"").slice(13);
  const icons={"system-offline":"red-alert","esp-connected":"wifi","enda-connected":"link","enda-disconnected":"unlink","startup-temperature":"wifi","power-on":"power","power-off":"power","target-reached":"target","temperature-overshoot":"orange-alert","enda-error":"sensor","heating-no-rise":"shield-warning","control-off-rising":"shield"};
  root.fatihNotificationVisuals=function(data={}){
    if(!isBoiler(data))return{icon:"/assets/icons/icon-192.png",badge:"/assets/icons/notification-badge-96.png"};
    const name=data.connectionState==="esp-only"?"orange-alert":icons[typeOf(data)]||"red-alert";
    return{icon:`/assets/icons/boiler/${name}-r668.png`,badge:"/assets/icons/boiler/badge-r665.png"};
  };
  root.fatihNotificationTitle=function(data={},fallback="Fatih Çay Evi"){
    if(!isBoiler(data))return fallback;
    const labels={"system-offline":"Bağlantı kesildi","esp-connected":"ESP32 bağlandı","enda-connected":"ENDA bağlandı","enda-disconnected":"ENDA bağlantısı kesildi","startup-temperature":"Çalışmaya başladı","power-on":String(data.title||fallback).includes("Programla")?"Programla açıldı":"Açıldı","power-off":String(data.title||fallback).includes("Programla")?"Programla kapatıldı":"Kapatıldı","target-reached":"Hedefe ulaştı","temperature-overshoot":"Sıcaklık uyarısı","enda-error":"Sensör hatası","heating-no-rise":"Isıtma uyarısı","control-off-rising":"Kontrol uyarısı"};
    const symbol={critical:"🚨",warning:"⚠️",success:"✅",info:"ℹ️"}[data.severity]||"ℹ️";
    return `${symbol} KAZAN · ${data.connectionState==="both"?"Bağlantı sağlandı":labels[typeOf(data)]||"Bildirim"}`;
  };
})(globalThis);

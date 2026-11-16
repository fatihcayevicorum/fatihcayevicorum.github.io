/* R666: compact boiler notifications; status appears at the start of the title. */
(function(root){
  const isBoiler=data=>String(data.type||"").startsWith("admin-boiler-");
  root.fatihNotificationVisuals=function(data={}){
    if(!isBoiler(data))return{icon:"/assets/icons/icon-192.png",badge:"/assets/icons/notification-badge-96.png"};
    return{badge:"/assets/icons/boiler/badge-r665.png"};
  };
  root.fatihNotificationTitle=function(data={},fallback="Fatih Çay Evi"){
    if(!isBoiler(data))return fallback;
    const labels={"system-offline":"Bağlantı kesildi","esp-connected":"ESP32 bağlandı","enda-connected":"ENDA bağlandı","enda-disconnected":"ENDA bağlantısı kesildi","startup-temperature":"Çalışmaya başladı","power-on":String(data.title||fallback).includes("Programla")?"Programla açıldı":"Açıldı","power-off":"Kapatıldı","target-reached":"Hedefe ulaştı","temperature-overshoot":"Sıcaklık uyarısı","enda-error":"Sensör hatası","heating-no-rise":"Isıtma uyarısı","control-off-rising":"Kontrol uyarısı"};
    const symbol={critical:"🚨",warning:"⚠️",success:"✅",info:"ℹ️"}[data.severity]||"ℹ️";
    return `${symbol} KAZAN · ${labels[String(data.type).slice(13)]||"Bildirim"}`;
  };
})(globalThis);

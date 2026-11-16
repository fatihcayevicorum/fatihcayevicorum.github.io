/* R669: compact boiler-only body layout and custom status-bar badge. */
(function(root){
  const isBoiler=data=>String(data.type||"").startsWith("admin-boiler-");
  const typeOf=data=>String(data.type||"").slice(13);
  const icons={"system-offline":"red-alert","esp-connected":"wifi","enda-connected":"link","enda-disconnected":"unlink","startup-temperature":"wifi","power-on":"power","power-off":"power","target-reached":"target","temperature-overshoot":"orange-alert","enda-error":"sensor","heating-no-rise":"shield-warning","control-off-rising":"shield"};
  root.fatihNotificationVisuals=function(data={}){
    if(!isBoiler(data))return{icon:"/assets/icons/icon-192.png",badge:"/assets/icons/notification-badge-96.png"};
    const name=data.connectionState==="esp-only"?"orange-alert":icons[typeOf(data)]||"red-alert";
    return{icon:`/assets/icons/boiler/${name}-r668.png`,badge:"/assets/icons/boiler/badge-r669.png"};
  };
  // Samsung controls the expanded notification layout. Short lines reduce overlap
  // without changing server event text, safety conditions or other push types.
  root.fatihNotificationBody=function(data={},fallback=""){
    const body=String(fallback||"");
    if(!isBoiler(data))return fallback;
    const match=body.match(/Hedef:\s*([^,\n]+),\s*mevcut:\s*(-?\d+(?:[.,]\d+)?\s*°C|—)(?=\.|$)/i);
    let compact=body;
    if(typeOf(data)==="temperature-overshoot"&&match){
      compact="Hedef: "+match[1]+" · Anlık: "+match[2]+"\n5 dk hedefin üzerinde.";
    }else if(typeOf(data)==="heating-no-rise"&&match){
      compact="Hedef: "+match[1]+" · Anlık: "+match[2]+"\nHedefin 5°C'den fazla altında.\n15 dk ısıtma var, artış yetersiz.\nKazan ve kontaktörü kontrol edin.";
    }else{
      compact=body.replace(/([.!?])\s+/g,"$1\n");
    }
    return compact.split("\n").map(paragraph=>{
      const lines=[];let line="";
      for(const word of paragraph.trim().split(/\s+/)){
        if(!word)continue;
        if(line&&line.length+1+word.length>30){lines.push(line);line=word;}
        else line+=(line?" ":"")+word;
      }
      if(line)lines.push(line);
      return lines.join("\n");
    }).filter(Boolean).join("\n");
  };
  root.fatihNotificationTitle=function(data={},fallback="Fatih Çay Evi"){
    if(!isBoiler(data))return fallback;
    const labels={"system-offline":"Bağlantı kesildi","esp-connected":"ESP32 bağlandı","enda-connected":"ENDA bağlandı","enda-disconnected":"ENDA bağlantısı kesildi","startup-temperature":"Çalışmaya başladı","power-on":String(data.title||fallback).includes("Programla")?"Programla açıldı":"Açıldı","power-off":String(data.title||fallback).includes("Programla")?"Programla kapatıldı":"Kapatıldı","target-reached":"Hedefe ulaştı","temperature-overshoot":"Sıcaklık uyarısı","enda-error":"Sensör hatası","heating-no-rise":"Isıtma uyarısı","control-off-rising":"Kontrol uyarısı"};
    const symbol={critical:"🚨",warning:"⚠️",success:"✅",info:"ℹ️"}[data.severity]||"ℹ️";
    return `${symbol} KAZAN · ${data.connectionState==="both"?"Bağlantı sağlandı":labels[typeOf(data)]||"Bildirim"}`;
  };
})(globalThis);

/* R665: shared foreground/background notification artwork. */
(function(root){
  root.fatihNotificationVisuals=function(data={}){
    const defaults={icon:"/assets/icons/icon-192.png",badge:"/assets/icons/notification-badge-96.png"};
    if(!String(data.type||"").startsWith("admin-boiler-"))return defaults;
    const severity=["critical","warning","success","info"].includes(data.severity)?data.severity:"info";
    return{icon:`/assets/icons/boiler/${severity}-r665.png`,badge:"/assets/icons/boiler/badge-r665.png",image:"/assets/icons/boiler/fahkon-r665.png"};
  };
})(globalThis);

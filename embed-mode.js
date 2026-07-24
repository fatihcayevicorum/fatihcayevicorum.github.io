if(new URLSearchParams(location.search).get("embed")==="1"){
  document.documentElement.classList.add("is-embedded-panel");
  const style=document.createElement("style");
  style.textContent=`html.is-embedded-panel{background:#f8f1e6}.is-embedded-panel body{min-height:100%;background:#f8f1e6}.is-embedded-panel .app-header,.is-embedded-panel body>footer,.is-embedded-panel .merchant-alert-button,.is-embedded-panel .merchant-alert-popup{display:none!important}.is-embedded-panel body>main,.is-embedded-panel .page-shell{width:100%!important;max-width:none!important;margin:0!important;padding:10px!important}.is-embedded-panel dialog{max-height:calc(100vh - 20px)}.is-embedded-panel .view{padding-top:0!important}`;
  document.head.append(style);
}

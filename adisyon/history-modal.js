const openButton=document.getElementById("closedOrdersHistoryButton");
const dialog=document.getElementById("closedOrdersHistoryDialog");
const closeButton=document.getElementById("closeClosedOrdersHistory");
const frame=document.getElementById("closedOrdersHistoryFrame");

function ensureFrame(){
  if(frame && (frame.getAttribute("src")==="about:blank" || !frame.getAttribute("src"))){
    frame.setAttribute("src",frame.dataset.src||"../adisyon-gecmisi/?embed=1");
  }
}
function openHistory(){
  if(!dialog)return;
  ensureFrame();
  if(!dialog.open)dialog.showModal();
}
function closeHistory(){if(dialog?.open)dialog.close()}
openButton?.addEventListener("click",openHistory);
closeButton?.addEventListener("click",closeHistory);
dialog?.addEventListener("click",e=>{if(e.target===dialog)closeHistory()});
dialog?.addEventListener("cancel",e=>{e.preventDefault();closeHistory()});

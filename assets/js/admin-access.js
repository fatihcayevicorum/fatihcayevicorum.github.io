import{doc,getDoc}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{ADMIN_UID}from"./firebase-config.js";

export const PANEL_DEFINITIONS=[
  {id:"tea",name:"Taze Dem",path:"taze-dem-paneli/",icon:"fa-mug-hot"},
  {id:"pos",name:"Adisyon",path:"adisyon/",icon:"fa-receipt"},
  {id:"currentAccounts",name:"Cari Hesaplar",path:"cari-hesaplar/",icon:"fa-address-book"},
  {id:"menu",name:"Menü Yönetimi",path:"menu-yonetimi/",icon:"fa-utensils"},
  {id:"stock",name:"Stok Yönetimi",path:"stok-yonetimi/",icon:"fa-boxes-stacked"},
  {id:"merchant",name:"Esnaf Yönetimi",path:"esnaf-yonetimi/",icon:"fa-store"},
  {id:"reports",name:"Raporlar",path:"raporlar/",icon:"fa-chart-column"},
  {id:"cash",name:"Kasa ve Hesaplar",path:"kasa-hesap-yonetimi/",icon:"fa-vault"},
  {id:"home",name:"Ana Sayfa Yönetimi",path:"ana-sayfa-yonetimi/",icon:"fa-house"}
];
export const ACTION_DEFINITIONS=[
  {id:"currentAccountTransfer",name:"Adisyondan Cari Hesaba Aktar",icon:"fa-arrow-right-arrow-left",kind:"action",requires:"pos"}
];
export const PERMISSION_DEFINITIONS=[...PANEL_DEFINITIONS.slice(0,3),...ACTION_DEFINITIONS,...PANEL_DEFINITIONS.slice(3)];
export const ALL_PANEL_IDS=PERMISSION_DEFINITIONS.map(x=>x.id);
export function isOwner(user){return user?.uid===ADMIN_UID}
export async function getManagementProfile(user,db){
  if(!user)return null;
  if(isOwner(user)){
    const snap=await getDoc(doc(db,"staffUsers",user.uid)).catch(()=>null);
    return{uid:user.uid,displayName:snap?.data()?.displayName||"Fatih Ali Altınlı",phone:snap?.data()?.phone||"",role:"owner",active:true,permissions:ALL_PANEL_IDS};
  }
  const snap=await getDoc(doc(db,"staffUsers",user.uid));
  if(!snap.exists()||snap.data().active===false)return null;
  const data=snap.data();
  return{uid:user.uid,...data,permissions:Array.isArray(data.permissions)?data.permissions:[]};
}
export async function hasPanelAccess(user,db,panel){
  const profile=await getManagementProfile(user,db);
  return profileHasPermission(profile,panel);
}
export function profileHasPermission(profile,permission){
  if(!profile)return false;
  if(profile.role==="owner"||profile.permissions?.includes(permission))return true;
  return permission==="currentAccountTransfer"&&profile.permissionSchemaVersion!=="r286"&&profile.permissions?.includes("pos");
}
export function normalizePhone(value=""){
  let digits=String(value).replace(/\D/g,"");
  if(digits.startsWith("0090"))digits=digits.slice(2);
  if(digits.length===11&&digits.startsWith("0"))digits=`90${digits.slice(1)}`;
  if(digits.length===10)digits=`90${digits}`;
  return digits.length===12&&digits.startsWith("90")?digits:"";
}
export function phoneLoginEmail(value){
  const phone=normalizePhone(value);
  return phone?`p${phone}@login.fatihcayevi.local`:"";
}
export function firstAllowedPath(profile){
  return profile?"yonetim-merkezi/":"";
}

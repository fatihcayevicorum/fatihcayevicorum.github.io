const DATABASE_NAME="fatihNotificationSounds",STORE_NAME="sounds",DATABASE_VERSION=1;
export const SOUND_TYPES={merchantOrder:"merchant-order",teaReady:"tea-ready",teaExpired:"tea-expired"};
const MUTE_PREFIX="fatihNotificationSoundMuted:";

function database(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE_NAME,DATABASE_VERSION);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE_NAME))request.result.createObjectStore(STORE_NAME)};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error)
  })
}

async function read(type){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE_NAME,"readonly"),request=transaction.objectStore(STORE_NAME).get(type);
    request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);transaction.oncomplete=()=>db.close()
  })
}

async function write(type,value){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE_NAME,"readwrite");transaction.objectStore(STORE_NAME).put(value,type);
    transaction.oncomplete=()=>{db.close();resolve()};transaction.onerror=()=>reject(transaction.error)
  })
}

async function remove(type){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE_NAME,"readwrite");transaction.objectStore(STORE_NAME).delete(type);
    transaction.oncomplete=()=>{db.close();resolve()};transaction.onerror=()=>reject(transaction.error)
  })
}

export function isNotificationSoundMuted(type){return localStorage.getItem(MUTE_PREFIX+type)==="1"}
export function setNotificationSoundMuted(type,value){value?localStorage.setItem(MUTE_PREFIX+type,"1"):localStorage.removeItem(MUTE_PREFIX+type)}
export async function getNotificationSound(type){return await read(type)}
export async function saveNotificationSound(type,file){
  if(!file?.type?.startsWith("audio/"))throw new Error("audio-required");
  if(file.size>5*1024*1024)throw new Error("file-too-large");
  await write(type,{blob:file,name:file.name||"Özel ses",type:file.type,updatedAtMs:Date.now()});
  setNotificationSoundMuted(type,false)
}
export async function resetNotificationSound(type){await remove(type);setNotificationSoundMuted(type,false)}

export async function playNotificationSound(type,{force=false}={}){
  if(!force&&isNotificationSoundMuted(type))return false;
  const saved=await read(type).catch(()=>null);
  if(saved?.blob){
    const url=URL.createObjectURL(saved.blob),audio=new Audio(url);audio.volume=.9;
    try{await audio.play();audio.onended=()=>URL.revokeObjectURL(url);return true}catch{URL.revokeObjectURL(url);return false}
  }
  return playDefault(type)
}

function playDefault(type){
  try{
    const Context=window.AudioContext||window.webkitAudioContext,context=new Context,now=context.currentTime;
    const notes=type===SOUND_TYPES.teaExpired?[[392,0,.2],[294,.24,.24]]:type===SOUND_TYPES.teaReady?[[660,0,.12],[880,.15,.18]]:[[880,0,.14],[660,.18,.18],[880,.4,.22]];
    notes.forEach(([frequency,delay,duration])=>{const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type=type===SOUND_TYPES.teaExpired?"triangle":"sine";oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,now+delay);gain.gain.exponentialRampToValueAtTime(.22,now+delay+.02);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);oscillator.connect(gain).connect(context.destination);oscillator.start(now+delay);oscillator.stop(now+delay+duration+.03)});
    return true
  }catch{return false}
}

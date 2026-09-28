export const PENDING_INTERNAL_CONSUMPTION_KEY="fatih-cay-evi-internal-consumption-pending-v1";

export function hasLocalPendingInternalConsumption(date){
  try{
    const saved=JSON.parse(localStorage.getItem(PENDING_INTERNAL_CONSUMPTION_KEY)||"null");
    return saved?.businessDate===date&&hasItems(saved.items);
  }catch{return false}
}

export function hasPendingInternalConsumptionDraft(data){
  return Object.values(data?.devices||{}).some(device=>hasItems(device?.items));
}

function hasItems(items){
  return Array.isArray(items)&&items.some(item=>item?.id&&Number(item.quantity)>0);
}

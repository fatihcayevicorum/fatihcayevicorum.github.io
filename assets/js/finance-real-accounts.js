import { LEGACY_FINANCE_ACCOUNTS } from "./finance-account-compat.js?v=554";

export const ACCOUNT_TYPES=Object.freeze(["cash","bank","card","creditCard"]);
export const ACCOUNT_LABELS=Object.freeze({cash:"Nakit Kasalar",bank:"Banka Hesapları",card:"POS Hesapları",creditCard:"Kredi Kartı Borçları"});
const BALANCE_KEY={cash:"cash",bank:"bank",card:"card",creditCard:"cardDebt"};

export function accountRows(documents=[]){
  const overrides=new Map(documents.map(row=>[row.id,row]));
  return [...LEGACY_FINANCE_ACCOUNTS.map(row=>({...row,...overrides.get(row.id),id:row.id,type:row.type,legacy:true,status:"active"})),
    ...documents.filter(row=>!LEGACY_FINANCE_ACCOUNTS.some(legacy=>legacy.id===row.id)&&ACCOUNT_TYPES.includes(row.type)).map(row=>({...row,legacy:false,status:row.status||"active"}))];
}

// Existing R556 sums stay authoritative. Only explicitly tagged movements can
// move a share away from the legacy account; untagged history stays there.
export function distributeBalances(totals,documents,movements,include){
  const accounts=accountRows(documents),balances=Object.fromEntries(accounts.map(row=>[row.id,0]));
  for(const movement of movements){
    if(!include(movement))continue;
    const cents=Math.round((Number(movement.amount)||0)*100);
    if(!cents||movement.reversed===true)continue;
    const add=(id,type,delta)=>{const account=accounts.find(row=>row.id===id);if(account&&!account.legacy&&account.type===type)balances[id]+=delta};
    if(movement.type==="income")add(movement.accountId,movement.account,cents);
    if(movement.type==="expense")add(movement.accountId,movement.account,movement.account==="creditCard"?cents:-cents);
    if(movement.type==="transfer"){
      add(movement.fromAccountId,movement.fromAccount,movement.fromAccount==="creditCard"?cents:-cents);
      add(movement.toAccountId,movement.toAccount,movement.toAccount==="creditCard"?-cents:cents);
    }
  }
  for(const legacy of LEGACY_FINANCE_ACCOUNTS){
    const aggregate=Math.round((Number(totals[BALANCE_KEY[legacy.type]])||0)*100);
    balances[legacy.id]=aggregate-accounts.filter(row=>row.type===legacy.type&&!row.legacy).reduce((sum,row)=>sum+balances[row.id],0);
  }
  return accounts.map(row=>({...row,balanceCents:balances[row.id]}));
}

export function reconcileAccounts(totals,rows){
  return ACCOUNT_TYPES.every(type=>rows.filter(row=>row.type===type).reduce((sum,row)=>sum+row.balanceCents,0)===Math.round((Number(totals[BALANCE_KEY[type]])||0)*100));
}

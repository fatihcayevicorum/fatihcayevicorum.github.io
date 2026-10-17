const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const source=readFileSync(join(__dirname,'../../assets/js/finance-account-compat.js'),'utf8');
const compat=import(`data:text/javascript,${encodeURIComponent(source)}`);

test('legacy finance accounts have stable, distinct IDs and payment routes',async()=>{
  const {LEGACY_FINANCE_ACCOUNTS,legacyAccountForPayment}=await compat;
  assert.equal(new Set(LEGACY_FINANCE_ACCOUNTS.map(x=>x.id)).size,4);
  assert.equal(legacyAccountForPayment('cash').id,'legacy-cash');
  assert.equal(legacyAccountForPayment('transfer').id,'legacy-bank');
  assert.equal(legacyAccountForPayment('card').id,'legacy-pos');
  assert.equal(legacyAccountForPayment('unknown'),null);
});

test('opening balances and later totals project once, to the cent, without changing the source',async()=>{
  const {projectLegacyBalances,reconcileLegacyBalances}=await compat;
  for(const balances of [
    {cash:0,bank:0,card:0,cardDebt:0},
    {cash:2735.25,bank:36587.81,card:6335.12,cardDebt:4490.04},
    {cash:-10.05,bank:2.11,card:0,cardDebt:125.97}
  ]) {
    const before=JSON.stringify(balances),rows=projectLegacyBalances(balances);
    assert.equal(reconcileLegacyBalances(balances,rows).ok,true);
    assert.equal(JSON.stringify(balances),before);
    assert.equal(rows.find(x=>x.type==='creditCard').balanceCents,Math.round(balances.cardDebt*100));
  }
});

test('a misallocated or duplicated balance blocks reconciliation',async()=>{
  const {projectLegacyBalances,reconcileLegacyBalances}=await compat;
  const balances={cash:100,bank:200,card:30,cardDebt:25};
  const rows=projectLegacyBalances(balances);
  rows[1].balanceCents+=500;
  assert.deepEqual(reconcileLegacyBalances(balances,rows).differences.bank,{expected:20000,actual:20500});
});

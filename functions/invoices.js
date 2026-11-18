'use strict';
const C=require('./invoices-core');
function buildInvoices({db,FieldValue,HttpsError,requireOwner,now=()=>Date.now()}) {
  const fail=(code,message)=>{throw new HttpsError(code,message)};
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date(now()));
  const ref=(c,id)=>db.doc(`${c}/${id}`);
  const stamp=uid=>({updatedAtMs:now(),updatedAt:FieldValue.serverTimestamp(),updatedBy:uid});
  const created=uid=>({...stamp(uid),createdAtMs:now(),createdAt:FieldValue.serverTimestamp(),createdBy:uid});
  async function handler(request) {
    requireOwner(request);
    try { return await execute(request.data||{},request.auth.uid); }
    catch(e){if(e instanceof HttpsError)throw e;throw new HttpsError('failed-precondition',e.message||'İşlem tamamlanamadı.');}
  }
  async function execute(d,uid) {
    const operationDate=today();
    if(d.action==='supplier') {
      const name=C.text(d.name,100),taxId=C.text(d.taxId,11),supplierId=C.id(d.id);
      if(name.length<2 || (taxId&&!/^\d{10,11}$/.test(taxId)))fail('invalid-argument','Firma adı veya vergi numarası geçersiz.');
      return db.runTransaction(async tx=>{
        const r=ref('adminSuppliers',supplierId),s=await tx.get(r);
        if(s.exists && s.data().taxId!==taxId)fail('failed-precondition','Kayıtlı firmanın vergi numarası değiştirilemez.');
        const key=ref('adminSupplierKeys',C.hash(taxId||name.toLocaleLowerCase('tr-TR'))),k=await tx.get(key);
        if(k.exists&&k.data().supplierId!==supplierId)fail('already-exists','Bu tedarikçi zaten kayıtlı.');
        tx.set(r,{name,taxId,taxOffice:C.text(d.taxOffice,100),address:C.text(d.address,300),phone:C.text(d.phone,30),note:C.text(d.note,500),...(s.exists?stamp(uid):{...created(uid),balanceCents:0}),active:true},{merge:true});
        tx.set(key,{supplierId});return{id:supplierId};
      });
    }
    if(d.action==='mapping') {
      const supplierId=C.id(d.supplierId),name=C.text(d.name),stockItemId=C.id(d.stockItemId),multiplier=Number(d.multiplier||1);
      if(!name||!Number.isFinite(multiplier)||multiplier<=0||multiplier>100000)fail('invalid-argument','Eşleştirme geçersiz.');
      return db.runTransaction(async tx=>{const s=await tx.get(ref('adminSuppliers',supplierId)),stock=await tx.get(ref('adminStockItems',stockItemId));if(!s.exists||!stock.exists||stock.data().active===false)fail('not-found','Tedarikçi veya ürün bulunamadı.');tx.set(ref('adminInvoiceMappings',C.hash(`${supplierId}|${name.toLocaleLowerCase('tr-TR')}`)),{supplierId,name,stockItemId,multiplier,...stamp(uid)});return{saved:true};});
    }
    if(d.action==='invoice') {
      const invoice=C.normalizeInvoice(d.invoice),invoiceId=C.id(d.id),paid=C.cents(d.payment?.amount||0);
      if(invoice.kind==='sale'&&paid)fail('invalid-argument','Giden faturalar yalnız arşiv kaydıdır.');
      if(paid>invoice.totalCents)fail('invalid-argument','Ödeme fatura tutarını aşamaz.');
      const requestHash=C.hash(JSON.stringify({invoice,paid,accountId:paid?d.payment.accountId:''}));
      const fingerprint=C.hash(`${invoice.kind}|${invoice.supplierId||invoice.partyName.toLocaleLowerCase('tr-TR')}|${invoice.number.toLocaleUpperCase('tr-TR').replace(/\s/g,'')}`);
      return db.runTransaction(async tx=>{
        const r=ref('adminInvoices',invoiceId),existing=await tx.get(r);
        if(existing.exists){if(existing.data().requestHash!==requestHash||existing.data().status!=='posted')fail('already-exists','Bu işlem daha önce farklı içerikle veya iptal edilmiş olarak kaydedildi. Yeni taslak açın.');return{id:invoiceId,alreadyExists:true};}
        const unique=ref('adminInvoiceKeys',fingerprint),u=await tx.get(unique);
        let replacesInvoiceId='';
        if(u.exists){const prior=await tx.get(ref('adminInvoices',u.data().invoiceId));if(!prior.exists||prior.data().status!=='cancelled')fail('already-exists','Bu fatura numarası daha önce kaydedildi.');replacesInvoiceId=prior.id;}
        const supplier=invoice.kind==='purchase'?await tx.get(ref('adminSuppliers',invoice.supplierId)):null;
        if(invoice.kind==='purchase'&&(!supplier?.exists||supplier.data().active===false))fail('not-found','Tedarikçi bulunamadı.');
        if(supplier)invoice.partyName=supplier.data().name;
        const groups=new Map();for(const line of invoice.lines.filter(r=>r.stock)){if(!groups.has(line.stockItemId))groups.set(line.stockItemId,[]);groups.get(line.stockItemId).push(line)}
        const changes=[];
        for(const [stockId,lines]of groups){const s=await tx.get(ref('adminStockItems',stockId));if(!s.exists)fail('not-found','Stok ürünü bulunamadı.');changes.push({id:stockId,stock:s.data(),change:C.stockChange(s.data(),lines),lines})}
        const account=paid?await readAccount(tx,d.payment.accountId):null;
        if(paid)await checkDay(tx,operationDate);
        const {photo,...fields}=invoice;
        tx.set(r,{...fields,status:'posted',paidCents:paid,fingerprint,requestHash,replacesInvoiceId,hasPhoto:!!photo,title:`${invoice.partyName} • ${invoice.number}`,businessDate:invoice.date,...created(uid)});
        tx.set(unique,{invoiceId});
        if(photo)tx.set(ref('adminInvoicePhotos',invoiceId),{photo,...created(uid)});
        if(supplier)tx.update(supplier.ref,{balanceCents:(supplier.data().balanceCents||0)+invoice.totalCents-paid,...stamp(uid)});
        for(const {id,stock,change,lines}of changes){
          const moveId=`invoice-${invoiceId}-${id}`;
          tx.update(ref('adminStockItems',id),{quantity:change.resultingQuantity,unitCost:change.unitCost,...stamp(uid)});
          tx.set(ref('adminStockMovements',moveId),{...change,source:'invoice',invoiceId,stockItemId:id,stockName:stock.name,linkedMenuItemId:stock.linkedMenuItemId||'',type:'in',unit:stock.unit||'adet',packageCount:lines.reduce((s,l)=>s+l.quantity,0),unitsPerPackage:lines.length===1?lines[0].multiplier:1,purchasePrice:lines.length===1?lines[0].unitPriceCents/100:change.purchaseTotal,purchaseUnitCost:change.purchaseTotal/change.amount,operationDate:invoice.date,note:`Fatura: ${invoice.number}`,cashMovementId:'',...created(uid)});
        }
        for(const line of invoice.lines.filter(l=>l.stock))tx.set(ref('adminInvoiceMappings',C.hash(`${invoice.supplierId}|${line.name.toLocaleLowerCase('tr-TR')}`)),{supplierId:invoice.supplierId,name:line.name,stockItemId:line.stockItemId,multiplier:line.multiplier,...stamp(uid)});
        if(paid)writePayment(tx,`initial-${invoiceId}`,invoiceId,invoice,paid,account,uid,operationDate);
        return{id:invoiceId};
      });
    }
    if(d.action==='payment') {
      const paymentId=C.id(d.id),invoiceId=C.id(d.invoiceId),amount=C.cents(d.amount);
      if(!amount)fail('invalid-argument','Ödeme tutarı sıfır olamaz.');
      return db.runTransaction(async tx=>{
        const p=await tx.get(ref('adminInvoicePayments',paymentId));if(p.exists){const prior=p.data();if(prior.invoiceId!==invoiceId||prior.amountCents!==amount||prior.accountId!==d.accountId||prior.reversed)fail('already-exists','Bu ödeme isteği daha önce farklı içerikle işlendi. Ödeme geçmişini kontrol edin.');return{id:paymentId,alreadyExists:true};}
        const s=await tx.get(ref('adminInvoices',invoiceId)),invoice=s.data();
        if(!s.exists||invoice.kind!=='purchase'||invoice.status!=='posted')fail('failed-precondition','Ödenecek alış faturası bulunamadı.');
        if(amount>invoice.totalCents-invoice.paidCents)fail('failed-precondition','Ödeme kalan borcu aşamaz.');
        const supplier=await tx.get(ref('adminSuppliers',invoice.supplierId)),account=await readAccount(tx,d.accountId);await checkDay(tx,operationDate);
        if(!supplier.exists)fail('not-found','Tedarikçi bulunamadı.');
        tx.update(s.ref,{paidCents:invoice.paidCents+amount,...stamp(uid)});
        tx.update(supplier.ref,{balanceCents:supplier.data().balanceCents-amount,...stamp(uid)});
        writePayment(tx,paymentId,invoiceId,invoice,amount,account,uid,operationDate);return{id:paymentId};
      });
    }
    if(d.action==='cancelPayment') {
      const paymentId=C.id(d.id),reason=C.text(d.reason,500);if(!reason)fail('invalid-argument','İptal açıklaması yazın.');
      return db.runTransaction(async tx=>{
        const p=await tx.get(ref('adminInvoicePayments',paymentId)),payment=p.data();if(!p.exists)fail('not-found','Ödeme bulunamadı.');if(payment.reversed)return{alreadyCancelled:true};
        if(payment.businessDate!==operationDate)fail('failed-precondition','Geçmiş gün ödemesi burada iptal edilemez.');await checkDay(tx,operationDate);
        const s=await tx.get(ref('adminInvoices',payment.invoiceId)),supplier=await tx.get(ref('adminSuppliers',payment.supplierId)),cash=await tx.get(ref('adminCashMovements',`invoice-${paymentId}`));
        if(!s.exists||!supplier.exists||!cash.exists||cash.data().reversed)fail('failed-precondition','Bağlı kayıtlar doğrulanamadı.');
        tx.update(s.ref,{paidCents:s.data().paidCents-payment.amountCents,...stamp(uid)});tx.update(supplier.ref,{balanceCents:supplier.data().balanceCents+payment.amountCents,...stamp(uid)});
        const reverse={reversed:true,reversalReason:reason,reversedBy:uid,reversedAt:FieldValue.serverTimestamp(),...stamp(uid)};tx.update(p.ref,reverse);tx.update(cash.ref,reverse);return{cancelled:true};
      });
    }
    if(d.action==='editPayment') {
      const paymentId=C.id(d.id),amount=C.cents(d.amount);if(!amount)fail('invalid-argument','Ödeme tutarı sıfır olamaz.');
      return db.runTransaction(async tx=>{
        const p=await tx.get(ref('adminInvoicePayments',paymentId)),payment=p.data();if(!p.exists||payment.reversed)fail('not-found','Düzeltilecek aktif ödeme bulunamadı.');
        if(payment.businessDate!==operationDate)fail('failed-precondition','Kapatılmış veya geçmiş finans günündeki ödeme düzeltilemez.');
        const s=await tx.get(ref('adminInvoices',payment.invoiceId)),invoice=s.data(),supplier=await tx.get(ref('adminSuppliers',payment.supplierId)),cash=await tx.get(ref('adminCashMovements',`invoice-${paymentId}`)),account=await readAccount(tx,d.accountId);await checkDay(tx,operationDate);
        if(!s.exists||invoice.status!=='posted'||!supplier.exists||!cash.exists||cash.data().reversed)fail('failed-precondition','Bağlı kayıtlar doğrulanamadı.');
        const nextPaid=invoice.paidCents-payment.amountCents+amount;if(nextPaid<0||nextPaid>invoice.totalCents)fail('failed-precondition','Düzeltilen ödeme kalan borcu aşamaz.');
        const delta=amount-payment.amountCents,changed={amountCents:amount,account:account.type,accountId:account.id,accountNameSnapshot:account.name,correctedAt:FieldValue.serverTimestamp(),correctedBy:uid,...stamp(uid)};
        tx.update(s.ref,{paidCents:nextPaid,...stamp(uid)});tx.update(supplier.ref,{balanceCents:supplier.data().balanceCents-delta,...stamp(uid)});tx.update(p.ref,changed);tx.update(cash.ref,{amount:amount/100,account:account.type,accountType:account.type,accountId:account.id,accountNameSnapshot:account.name,correctedAt:FieldValue.serverTimestamp(),correctedBy:uid,...stamp(uid)});return{corrected:true};
      });
    }
    if(d.action==='cancelInvoice') {
      const invoiceId=C.id(d.id),reason=C.text(d.reason,500);if(!reason)fail('invalid-argument','İptal açıklaması yazın.');
      return db.runTransaction(async tx=>{
        const s=await tx.get(ref('adminInvoices',invoiceId)),invoice=s.data();if(!s.exists)fail('not-found','Fatura bulunamadı.');if(invoice.status==='cancelled')return{alreadyCancelled:true};
        const supplier=invoice.kind==='purchase'?await tx.get(ref('adminSuppliers',invoice.supplierId)):null,changes=[];
        const paymentQuery=db.collection('adminInvoicePayments').where('invoiceId','==',invoiceId),paymentSnapshot=await tx.get(paymentQuery),activePayments=paymentSnapshot.docs.map(x=>({ref:x.ref,...x.data()})).filter(x=>x.reversed!==true),cashRows=[];
        if(activePayments.some(x=>x.businessDate!==operationDate))fail('failed-precondition','Geçmiş finans gününde gerçekleşmiş ödeme var. Fatura iptali için önce iade/düzeltme işlemi gerekir.');
        if(activePayments.length)await checkDay(tx,operationDate);
        for(const payment of activePayments){const cash=await tx.get(ref('adminCashMovements',`invoice-${payment.ref.id}`));if(!cash.exists||cash.data().reversed)fail('failed-precondition','Bağlı ödeme hareketleri doğrulanamadı.');cashRows.push({payment,cash});}
        const activePaid=activePayments.reduce((sum,x)=>sum+x.amountCents,0);if(activePaid!==invoice.paidCents)fail('failed-precondition','Fatura ödeme toplamları uyuşmuyor; kısmi iptal yapılmadı.');
        for(const stockId of new Set(invoice.lines.filter(l=>l.stock).map(l=>l.stockItemId))){const stock=await tx.get(ref('adminStockItems',stockId)),move=await tx.get(ref('adminStockMovements',`invoice-${invoiceId}-${stockId}`));if(!stock.exists||!move.exists||move.data().reversed||Math.abs(Number(stock.data().quantity)-Number(move.data().resultingQuantity))>.00001||Math.abs(Number(stock.data().unitCost)-Number(move.data().unitCost))>.00001)fail('failed-precondition','Stokta sonraki hareket var. Fatura otomatik iptal edilemez.');changes.push({stock,move})}
        tx.update(s.ref,{status:'cancelled',paidCents:0,cancelReason:reason,cancelledBy:uid,...stamp(uid)});
        if(supplier)tx.update(supplier.ref,{balanceCents:supplier.data().balanceCents-(invoice.totalCents-activePaid),...stamp(uid)});
        const reverse={reversed:true,reversalReason:reason,reversedBy:uid,reversedAt:FieldValue.serverTimestamp(),...stamp(uid)};for(const {payment,cash}of cashRows){tx.update(payment.ref,reverse);tx.update(cash.ref,reverse)}
        for(const {stock,move}of changes){tx.update(stock.ref,{quantity:move.data().previousQuantity,unitCost:move.data().previousUnitCost,...stamp(uid)});tx.update(move.ref,{reversed:true,reversedBy:uid,reversalReason:reason,...stamp(uid)});}
        return{cancelled:true};
      });
    }
    fail('invalid-argument','İşlem tanınmadı.');
  }
  async function checkDay(tx,businessDate){const s=await tx.get(ref('adminFinanceDays',businessDate));if(s.exists&&s.data().locked===true)fail('failed-precondition','Bugünün finans günü kapalı. Ödeme kaydedilemez.');}
  async function readAccount(tx,value){const accountId=C.id(value),s=await tx.get(ref('adminFinancialAccounts',accountId));return C.paymentAccount(accountId,s.exists?s.data():null);}
  function writePayment(tx,paymentId,invoiceId,invoice,amountCents,account,uid,businessDate){
    const title=`${invoice.partyName} • ${invoice.number} fatura ödemesi`;
    tx.set(ref('adminInvoicePayments',paymentId),{invoiceId,supplierId:invoice.supplierId,amountCents,account:account.type,accountId:account.id,accountNameSnapshot:account.name,businessDate,title,...created(uid)});
    tx.set(ref('adminCashMovements',`invoice-${paymentId}`),{type:'expense',amount:amountCents/100,account:account.type,accountType:account.type,accountId:account.id,accountNameSnapshot:account.name,fromAccount:'',toAccount:'',category:'Fatura / Tedarikçi Ödemesi',description:title,businessDate,automatic:true,source:'invoice-payment',sourceId:paymentId,invoiceId,...created(uid)});
  }
  return{handler};
}
module.exports={buildInvoices};

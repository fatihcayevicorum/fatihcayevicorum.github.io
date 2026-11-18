'use strict';
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const{doc,setDoc,getDoc,updateDoc,deleteDoc}=require('firebase/firestore');
const{initializeApp,deleteApp}=require('firebase-admin/app');
const{getFirestore,FieldValue}=require('firebase-admin/firestore');
const{buildInvoices}=require('../invoices');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
class HttpsError extends Error{constructor(code,message){super(message);this.code=code}}
(async()=>{
const projectId='demo-fatih-invoices',owner='obuZLQXuPAWsHE20bZxcAxCNsO02';
const env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync(path.resolve(__dirname,'../../firestore.rules'),'utf8')}});
const app=initializeApp({projectId},'invoice-test'),db=getFirestore(app),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date());
const handler=buildInvoices({db,FieldValue,HttpsError,requireOwner:r=>{if(r.auth?.uid!==owner)throw new HttpsError('permission-denied','Denied')}}).handler,call=data=>handler({auth:{uid:owner},data});
try{
 await db.doc('adminSuppliers/s1').set({name:'Test Firma',balanceCents:0,active:true});await db.doc('adminStockItems/tea').set({name:'Çay',quantity:10,unitCost:10,active:true});
 const invoice={kind:'purchase',supplierId:'s1',partyName:'Test Firma',number:'ABC',date,lines:[{name:'Çay',quantity:2,unit:'koli',unitPrice:100,total:200,stock:true,stockItemId:'tea',multiplier:10}],total:200,vat:0};
 const simultaneous=await Promise.allSettled([call({action:'invoice',id:'i1',invoice}),call({action:'invoice',id:'i2',invoice})]);assert.equal(simultaneous.filter(x=>x.status==='fulfilled').length,1);const id=simultaneous.find(x=>x.status==='fulfilled').value.id;
 const payments=await Promise.allSettled([call({action:'payment',id:'p1',invoiceId:id,amount:150,accountId:'legacy-cash'}),call({action:'payment',id:'p2',invoiceId:id,amount:150,accountId:'legacy-bank'})]);assert.equal(payments.filter(x=>x.status==='fulfilled').length,1);assert.equal((await db.doc('adminSuppliers/s1').get()).data().balanceCents,5000);assert.equal((await db.doc('adminStockItems/tea').get()).data().quantity,30);
 const ownerDb=env.authenticatedContext(owner).firestore(),staffDb=env.authenticatedContext('staff').firestore(),anon=env.unauthenticatedContext().firestore();
 for(const name of ['adminInvoices','adminSuppliers','adminInvoicePayments','adminInvoiceMappings','adminInvoicePhotos','adminInvoiceKeys','adminSupplierKeys']){await assertFails(setDoc(doc(ownerDb,name,'forged'),{amount:1}));await assertFails(getDoc(doc(staffDb,name,id)));await assertFails(getDoc(doc(anon,name,id)));}
 await assertSucceeds(getDoc(doc(ownerDb,'adminInvoices',id)));await assertSucceeds(setDoc(doc(ownerDb,'adminInvoiceDrafts','draft'),{invoice:{number:'DRAFT'}}));
 const paymentId=payments.find(x=>x.status==='fulfilled').value.id,cashRef=doc(ownerDb,'adminCashMovements',`invoice-${paymentId}`);await assertFails(updateDoc(cashRef,{amount:1}));await assertFails(deleteDoc(cashRef));
 await db.doc('adminBackupControl/state').set({active:true});await assertFails(setDoc(doc(ownerDb,'adminInvoiceDrafts','blocked'),{invoice:{}}));
 console.log('Emulator: concurrent duplicate invoice, concurrent overpayment, atomic balances, owner/staff/anonymous rules, immutable linked cash, maintenance draft gate passed');
}finally{await env.cleanup();await deleteApp(app)}})().catch(e=>{console.error(e);process.exitCode=1});

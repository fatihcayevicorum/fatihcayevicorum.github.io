const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeRecord}=require('../operation-history');

test('payment method changes appear as individual Turkish history rows',()=>{
 const first=makeRecord({source:'adminPaymentSettings',id:'config',before:null,after:{methods:{cash:true,transfer:false,card:true},updatedBy:'owner'},eventId:'toggle-1',time:'2026-10-18T00:00:00.000Z',authId:'owner',authType:'user'});
 const second=makeRecord({source:'adminPaymentSettings',id:'config',before:{methods:{cash:true,transfer:false,card:true}},after:{methods:{cash:true,transfer:true,card:true},updatedBy:'owner'},eventId:'toggle-2',time:'2026-10-18T00:01:00.000Z',authId:'owner',authType:'user'});
 assert.equal(first.title,'Havale / EFT ödeme yöntemi kapatıldı');
 assert.equal(second.title,'Havale / EFT ödeme yöntemi açıldı');
 assert.notEqual(first.groupKey,second.groupKey);
 assert.equal(first.actorUid,'owner');
 assert.equal(first.historyVisible,true);
});

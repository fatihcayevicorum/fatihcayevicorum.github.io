const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeRecord}=require('../operation-history');
const base={source:'adminFinancialAccounts',id:'akbank',eventId:'evt',time:'2026-10-18T00:00:00.000Z',authId:'owner',authType:'user'};
test('account name and status changes record actor, old and new values',()=>{
 const before={type:'bank',name:'Akbank',status:'active'};
 const after={type:'bank',name:'Akbank Ticari',status:'active',updatedBy:'owner'};
 const rename=makeRecord({...base,before,after});
 assert.match(rename.title,/Akbank hesabının adı Akbank Ticari oldu/);
 assert.equal(rename.actorUid,'owner');
 assert.equal(rename.changes.find(x=>x.field==='name').before,'Akbank');
 const passive=makeRecord({...base,eventId:'evt2',before:after,after:{...after,status:'passive'}});
 assert.match(passive.title,/pasife alındı/);
 assert.equal(passive.changes.find(x=>x.field==='status').after,'passive');
});

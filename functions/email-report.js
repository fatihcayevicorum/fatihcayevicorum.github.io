'use strict';
// R611: configuration and non-financial test mail. Finance closing is not connected yet.
const crypto = require('node:crypto');
const DEFAULT_EMAIL = 'fatihalialtinli19@gmail.com';
const FROM = 'Fatih Çay Evi <rapor@fatihcayevi.com.tr>';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function buildEmailReport({db, FieldValue, HttpsError, requireOwner, fetchImpl = global.fetch, now = Date.now, randomInt = crypto.randomInt}) {
  const configRef = db.doc('adminEmailReport/settings');
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const emailValue = value => {
    const email = String(value || '').trim().toLowerCase();
    if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email)) fail('invalid-argument', 'Geçerli bir e-posta adresi yazın.');
    return email;
  };
  const initial = () => ({revision: 0, automaticEnabled: false, detailed: true, pdf: true, recipients: [{id: hash(DEFAULT_EMAIL), email: DEFAULT_EMAIL, active: true, verified: false}]});
  const read = snap => snap.exists ? snap.data() : initial();
  const publicState = state => ({revision: state.revision, automaticEnabled: false, detailed: state.detailed, pdf: state.pdf, automaticAvailable: false, recipients: state.recipients.filter(r => !r.removedAtMs).map(({id,email,active,verified,verifiedAtMs}) => ({id,email,active,verified,verifiedAtMs: verifiedAtMs || null})), lastSend: state.lastSend || null});
  async function settings(request) {
    requireOwner(request);
    const input = request.data || {}, action = input.action || 'get';
    if (action === 'get') return publicState(read(await configRef.get()));
    if (!['preferences','recipient','remove','verify'].includes(action)) fail('invalid-argument', 'İşlem geçersiz.');
    return db.runTransaction(async tx => {
      const state = read(await tx.get(configRef));
      if (input.revision !== state.revision) fail('aborted', 'Ayarlar başka bir cihazda değişti. Yenileyip tekrar deneyin.');
      let codeRef;
      if (action === 'preferences') {
        if (input.automaticEnabled === true) fail('failed-precondition', 'Otomatik günlük rapor bağlantısı henüz hazır değil.');
        if (typeof input.detailed !== 'boolean' || typeof input.pdf !== 'boolean') fail('invalid-argument', 'Rapor tercihleri geçersiz.');
        state.detailed = input.detailed; state.pdf = input.pdf;
      } else if (action === 'recipient') {
        const email = emailValue(input.email), id = hash(email);
        const recipient = state.recipients.find(r => r.id === id);
        if (typeof input.active !== 'boolean') fail('invalid-argument', 'Alıcı durumu geçersiz.');
        if (recipient) { recipient.active = input.active; recipient.removedAtMs = null; }
        else {
          if (state.recipients.filter(r => !r.removedAtMs).length >= 10 || state.recipients.length >= 100) fail('resource-exhausted', 'Alıcı sınırına ulaşıldı.');
          state.recipients.push({id,email,active:input.active,verified:false,createdAtMs:now()});
        }
      } else {
        const recipient = state.recipients.find(r => r.id === input.id && !r.removedAtMs);
        if (!recipient) fail('not-found', 'Alıcı bulunamadı.');
        if (action === 'remove') { recipient.active = false; recipient.removedAtMs = now(); }
        else {
          codeRef = db.doc(`adminEmailVerification/${recipient.id}`);
          const challenge = (await tx.get(codeRef)).data() || {};
          if (!/^\d{6}$/.test(String(input.code || ''))) fail('invalid-argument', 'Altı haneli doğrulama kodunu yazın.');
          if (challenge.expiresAtMs <= now() || !challenge.expiresAtMs || challenge.attempts >= 5 || challenge.used) fail('failed-precondition', 'Kodun süresi doldu veya deneme sınırına ulaşıldı. Yeni kod isteyin.');
          const correct = hash(`${challenge.salt}:${input.code}`) === challenge.digest;
          tx.set(codeRef, {...challenge, attempts:challenge.attempts+1, used:correct});
          // Commit failed attempts before reporting them, rather than throwing in the transaction.
          if (!correct) return {invalidCode:true};
          recipient.verified = true; recipient.verifiedAtMs = now();
        }
      }
      state.revision++; state.automaticEnabled = false; state.updatedBy = request.auth.uid; state.updatedAt = FieldValue.serverTimestamp();
      tx.set(configRef, state);
      return publicState(state);
    }).then(result => { if (result.invalidCode) fail('permission-denied', 'Doğrulama kodu yanlış.'); return result; });
  }
  async function send(request) {
    requireOwner(request);
    const input = request.data || {};
    if (!['verification','test'].includes(input.action)) fail('invalid-argument', 'Gönderim türü geçersiz.');
    if (!process.env.RESEND_API_KEY) fail('failed-precondition', 'E-posta hizmetinin sunucu anahtarı tanımlanmamış.');
    const code = String(randomInt(100000,1000000)), salt = crypto.randomBytes(24).toString('hex');
    const jobId = crypto.randomUUID(), stamp = now();
    const jobRef = db.doc(`adminEmailSendJobs/${jobId}`), limitRef = db.doc('adminEmailReport/sendLimit');
    const recipient = await db.runTransaction(async tx => {
      const configSnap = await tx.get(configRef), state = read(configSnap), limit = (await tx.get(limitRef)).data() || {};
      const r = state.recipients.find(r => r.id === input.id && !r.removedAtMs);
      if (!r || !r.active) fail('failed-precondition', 'Aktif bir alıcı seçin.');
      if (input.action === 'test' && !r.verified) fail('failed-precondition', 'Önce alıcı adresini doğrulayın.');
      if (limit.nextAtMs > stamp) fail('resource-exhausted', 'Yeni gönderim için bir dakika bekleyin.');
      const day = Math.floor(stamp / 86400000), count = limit.day === day ? limit.count : 0;
      if (count >= 50) fail('resource-exhausted', 'Günlük test ve doğrulama gönderim sınırına ulaşıldı.');
      if (!configSnap.exists) tx.set(configRef, state);
      tx.set(limitRef, {nextAtMs:stamp+60000, day, count:count+1});
      if (input.action === 'verification') tx.set(db.doc(`adminEmailVerification/${r.id}`), {digest:hash(`${salt}:${code}`),salt,expiresAtMs:stamp+600000,attempts:0,used:false});
      tx.set(jobRef,{type:input.action,recipientId:r.id,email:r.email,status:'pending',createdAtMs:stamp,createdBy:request.auth.uid});
      return r;
    });
    try {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method:'POST', headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`fce-${jobId}`},
        body:JSON.stringify({from:FROM,to:[recipient.email],subject:input.action === 'verification' ? 'Fatih Çay Evi — Alıcı Doğrulama Kodu' : 'Fatih Çay Evi — Test E-postası',text: input.action === 'verification' ? `Fatih Çay Evi rapor alıcısı doğrulama kodunuz: ${code}\nKod 10 dakika geçerlidir. Bu işlem finansal bilgi içermez.` : 'Fatih Çay Evi e-posta bağlantısı için test mesajıdır. Bu e-posta finansal bilgi içermez. Otomatik günlük rapor henüz etkin değildir.'}),
        signal:AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error('provider');
      const result = await response.json();
      if (!result.id) throw new Error('provider');
      await jobRef.set({status:'accepted',providerId:result.id,completedAtMs:now()},{merge:true});
      await configRef.set({lastSend:{type:input.action,email:recipient.email,status:'accepted',atMs:now()}},{merge:true});
      return {accepted:true};
    } catch (error) {
      // Never log provider bodies, credentials, or verification codes.
      await jobRef.set({status:'unknown_or_failed',completedAtMs:now()},{merge:true}).catch(()=>{});
      fail('unavailable', 'Gönderim sonucu doğrulanamadı. Bir dakika sonra gelen kutusu ve spam klasörünü kontrol edin; gerekirse yeniden gönderin.');
    }
  }
  return {settings,send};
}
module.exports = {buildEmailReport};

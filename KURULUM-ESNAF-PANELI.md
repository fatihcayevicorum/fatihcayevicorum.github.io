# Esnaf Paneli Kurulumu

1. Paket içindeki dosyaları sitenin ana dizinine yükleyin.
2. Firebase Console → Authentication → Sign-in method bölümünde **E-posta/Şifre** girişinin açık olduğunu doğrulayın.
3. Ana dizindeki güncel `firestore.rules` dosyasını Firebase Firestore Rules bölümünde yayınlayın.
4. Yönetici girişi yaptıktan sonra **Paneller → Esnaf Yönetimi** yolunu açın.
5. Esnafı kullanıcı adı ve ilk şifresiyle kaydedin, ardından **Bakiye** düğmesinden peşin aldığı çay adedini yükleyin.
6. Esnaf giriş adresi: `esnaf-giris.html`

## İşleyiş

- Sipariş oluşturulunca bakiye düşmez.
- Yönetici siparişi **Teslim Et** olarak tamamlayınca çay adedi bakiyeden düşer.
- İptal edilen sipariş bakiyeyi etkilemez.
- Her bakiye yüklemesi, düzeltme ve teslimat ayrı hareket olarak saklanır.
- Şifreler Firestore veritabanına kaydedilmez.

> Not: Bu statik sürümde başka kullanıcının şifresini yönetici panelinden güvenli biçimde sıfırlamak için sunucu yetkisi bulunmadığından şifre sıfırlama düğmesi eklenmemiştir. İstenirse sonraki aşamada Firebase Cloud Function ile güvenli şifre yenileme eklenebilir.

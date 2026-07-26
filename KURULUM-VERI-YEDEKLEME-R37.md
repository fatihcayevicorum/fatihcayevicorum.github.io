# Veri ve Yedekleme Paneli — R37

## Yükleme

1. Bu paketteki tüm dosyaları GitHub projesine yükleyin.
2. Firebase Console → Storage → Rules bölümünü açın.
3. Paketteki `storage.rules` dosyasının içeriğini kurallar ekranına yapıştırın.
4. **Yayınla** düğmesine basın.

Storage kuralı yayınlanmadan cihaz yedeği indirilebilir; ancak yedeğin sistem
içinde saklanması ve kayıtlı yedekler listesi çalışmaz.

## Kullanım

- Yönetim panellerindeki **Paneller** menüsünden **Veri ve Yedekleme** sayfasını açın.
- **Şimdi Tam Yedek Al** düğmesi bütün Firestore yönetim verilerini JSON olarak
  cihaza indirir ve sistemde saklar.
- Sistemde son 10 yedek tutulur.
- Veri temizlemeden ve geri yüklemeden önce sistem otomatik tam yedek alır.
- Firebase Authentication kullanıcı şifreleri güvenlik nedeniyle JSON yedeğine
  dahil değildir.

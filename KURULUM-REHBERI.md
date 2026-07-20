# Fatih Çay Evi — Canlı Taze Dem Sistemi

Bu paket müşteri ana sayfasını, yönetici girişini ve canlı Taze Dem panelini birlikte içerir.

## Sayfalar

- `/index.html`: Müşteri ana sayfası; Firestore'daki canlı demlik durumunu yalnızca okur.
- `/yonetici-giris.html`: Firebase e-posta/şifre yönetici girişi.
- `/taze-dem-paneli/index.html`: Demlik başlatma, bitirme ve günlük kayıt paneli.

## Canlı akış

1. Yönetici e-posta ve şifresiyle giriş yapar.
2. “Yeni Dem Başlat” işlemi Firestore'a başlangıç zamanını yazar.
3. Müşteri sayfası `publicTea/status` belgesini gerçek zamanlı dinler.
4. İlk 20 dakika müşteri “Demleniyor” ve hazır olmasına kalan süreyi görür.
5. Sonraki 60 dakika durum Taze Demlendi, Taze, Normal ve Dem Eskimek Üzere olarak değişir.
6. Demlik bitirilince müşteri ekranından kalkar; arkadaki demlik otomatik öne geçer.

Sayaç her saniye ekranda güncellenir fakat Firestore'a her saniye veri yazmaz. Yalnızca demlik başlatma ve bitirme işlemleri veritabanına yazılır.

## Firebase ayarları

### Güvenlik kuralları

Firebase Console > Firestore Database > Kurallar bölümüne girin. `firestore.rules` dosyasının tamamını kopyalayıp mevcut kuralların yerine yapıştırın ve “Yayınla” düğmesine basın.

Kuralların sonucu:

- Müşteriler yalnızca `publicTea/status` belgesini okuyabilir.
- Yalnızca UID değeri `obuZLQXuPAWsHE20bZxcAxCNsO02` olan yönetici yazabilir.
- Yönetici geçmişi müşteriler tarafından okunamaz.
- Diğer bütün Firestore erişimleri kapalıdır.

### Yetkili alan adı

Firebase Console > Authentication > Ayarlar > Yetkili alan adları bölümüne `fatihcayevicorum.github.io` eklenmelidir.

## GitHub Pages'e yükleme

Bu klasörün içindeki bütün dosya ve klasörleri GitHub Pages deposunun ana dizinine yükleyin. Mevcut aynı adlı dosyaların üzerine yazın.

Yükleme sonrası adresler:

- Müşteri: `https://fatihcayevicorum.github.io/`
- Yönetici girişi: `https://fatihcayevicorum.github.io/yonetici-giris.html`
- Panel: `https://fatihcayevicorum.github.io/taze-dem-paneli/`

Panel adresi doğrudan açılırsa giriş yapılmamış kullanıcı otomatik olarak yönetici girişine yönlendirilir.

## Güvenlik

- Yönetici şifresi hiçbir dosyada yer almaz.
- Firebase web bağlantı ayarları istemci kodunda bulunabilir; gerçek erişim güvenliği Firestore kuralları ve Authentication ile sağlanır.
- Yönetici giriş sayfasında hesap oluşturma özelliği yoktur.
- Başka bir Firebase hesabı giriş yapsa bile UID eşleşmediği için panele alınmaz.

# Fatih Çay Evi — Canlı Taze Dem Sistemi

Bu paket müşteri ana sayfasını, canlı Taze Dem sistemini, Menü Yönetimini, Stok Yönetimini ve Açık Hesap panelini birlikte içerir.

## Sayfalar

- `/index.html`: Müşteri ana sayfası; Firestore'daki canlı demlik durumunu yalnızca okur.
- `/yonetici-giris.html`: Firebase e-posta/şifre yönetici girişi.
- `/taze-dem-paneli/index.html`: Demlik başlatma, bitirme ve günlük kayıt paneli.
- `/menu.html`: Müşterilerin gördüğü canlı ürün ve fiyat listesi.
- `/menu-yonetimi/index.html`: Kategori, ürün, fiyat ve satış durumu yönetim paneli.
- `/stok-yonetimi/index.html`: Stok kartları, kritik seviye ve stok hareketleri yönetim paneli.
- `/acik-hesap/index.html`: Müşteri borcu, nakit tahsilat, limit ve mesajla bakiye paylaşımı paneli.

## Açık hesap akışı

1. Müşteri adı, telefon numarası ve uyarı limitiyle bir hesap kartı oluşturulur.
2. “Borç Ekle” işlemi müşterinin bakiyesini artırır; limit aşılırsa işlem engellenmez, yalnızca onay uyarısı gösterilir.
3. “Tahsilat” işlemi nakit ve kısmi ödeme kaydeder; kalan borç otomatik hesaplanır.
4. Açık hesap yetkisi müşteri bazında açılıp kapatılabilir. Kapatılan müşterinin eski borcu ve hareketleri korunur.
5. Mesaj düğmesi telefonda paylaşım ekranını açar. Desteklenmeyen cihazlarda hazırlanmış metinle WhatsApp açılır; mesaj kullanıcı onayı olmadan gönderilmez.

## Stok akışı

1. Yönetici ürünü doğrudan Menü Yönetimi listesinden seçebilir; çay ve şeker gibi hammaddeleri elle yazabilir.
2. Stok kartına miktar, ölçü birimi, alış tarihi, alış fiyatı, satış fiyatı ve kritik seviye girilir.
3. Koli veya paket girişinde `1 koli = 12/24 adet` dönüşümü tanımlanır; stok adet bazında saklanır.
4. Şişe içecek veya atıştırmalık, menüdeki karşılığına bağlanıp “otomatik düşüm” için hazırlanabilir. Adisyondaki 1 satış yalnızca tanımlanan adet kadar düşer.
5. Çay, şeker ve benzeri hammaddelerde “Kullanım / Çıkış” işlemi elle kaydedilir.
6. Her stok girişi, kullanım ve sayım düzeltmesi tarihçede saklanır.
7. Kritik seviyedeki ve tükenen stoklar özet alanında ayrıca gösterilir.

## Menü akışı

1. Yönetici mevcut hesabıyla Menü Yönetimi panelini açar.
2. Önce kategorileri, ardından ürünleri ve fiyatları ekler.
3. Değişiklikler `publicMenu/catalog` belgesine yazılır.
4. `menu.html` sayfası aynı belgeyi gerçek zamanlı dinler ve değişiklikleri anında gösterir.
5. Ürünler silinmeden geçici olarak “Mevcut değil” yapılabilir.

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

- Müşteriler yalnızca `publicTea/status` ve `publicMenu/catalog` belgelerini okuyabilir.
- Yalnızca UID değeri `obuZLQXuPAWsHE20bZxcAxCNsO02` olan yönetici yazabilir.
- Stok kartları ve stok hareketleri yalnızca yönetici tarafından okunup yazılabilir.
- Açık hesap müşterileri ve borç hareketleri yalnızca yönetici tarafından okunup yazılabilir.
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
- Müşteri menüsü: `https://fatihcayevicorum.github.io/menu.html`
- Menü yönetimi: `https://fatihcayevicorum.github.io/menu-yonetimi/`
- Stok yönetimi: `https://fatihcayevicorum.github.io/stok-yonetimi/`
- Açık hesap: `https://fatihcayevicorum.github.io/acik-hesap/`

Panel adresi doğrudan açılırsa giriş yapılmamış kullanıcı otomatik olarak yönetici girişine yönlendirilir.

## Güvenlik

- Yönetici şifresi hiçbir dosyada yer almaz.
- Firebase web bağlantı ayarları istemci kodunda bulunabilir; gerçek erişim güvenliği Firestore kuralları ve Authentication ile sağlanır.
- Yönetici giriş sayfasında hesap oluşturma özelliği yoktur.
- Başka bir Firebase hesabı giriş yapsa bile UID eşleşmediği için panele alınmaz.

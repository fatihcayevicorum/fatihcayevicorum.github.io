# Fatih Kazan ESP32 0.6.1 OTA — test

R633 web sistemiyle 0.6.0 sürümünden güvenli OTA güncelleme denemesi içindir. İşlevler 0.6.0 ile aynıdır; sürüm numarası OTA sonucunun açıkça doğrulanabilmesi için 0.6.1-ota-test olarak değiştirilmiştir.

Bulut telemetrisi başarılı bağlantıda 5 saniyede bir gönderilir. Hızlı güncelleme; widget, APK ve bildirim alanının aynı veriye daha kısa sürede ulaşmasını sağlar. Bağlantı hatasında mevcut kademeli bekleme korunur; cihaz ve Firebase gereksiz sorguyla yüklenmez.

## Yükleme

1. Önce R624 Firebase Functions, Firestore ve Storage kurallarının yayını tamamlanmalıdır.
2. Bu klasörü ayrı tutun. USB ile çalışan 0.6.0 klasörünüzdeki `device_secrets.h` ve `boiler_cloud.h` dosyalarını bu yeni sketch klasörüne kopyalayın. Bu özel dosyalar pakette ve GitHub'da bulunmaz.
3. Yeni `.ino` dosyasını Arduino IDE'de açın. Çalışan ESP32 Dev Module kart ve bölümleme ayarlarınızla `Sketch > Export Compiled Binary` işlemini yapın.
4. Oluşan uygulama `.bin` dosyasını Tanımlamalar → Akıllı Kazan bölümünde `0.6.1-ota-test` sürümüyle hazırlayın ve güncellemeyi başlatın.
5. ESP32 yeniden bağlandığında firmware alanının `KazanFW 0.6.1-ota-test` olduğunu; sıcaklık, hedef ve ENDA bağlantısının yeniden geldiğini doğrulayın.

Bu test sürümü USB ile yüklenmeyecek; 0.6.0 OTA aday sürümünden internet üzerinden gönderilecektir. Dosya boyutu ve SHA-256 hem sunucuda hem cihazda doğrulanır. İndirme yalnızca eşleştirilmiş cihaz anahtarıyla yapılır.

ENDA çıkış seçimi H32 üzerinden okunur. C/A2 rölesi seçiliyse D0, SSR seçiliyse D2 durumu kullanılır. Bu bilgi kontrol çıkış komutudur; rezistansın fiziksel olarak elektrik tükettiğinin kesin kanıtı değildir.

## OTA denemesi

Güncelleme sırasında ESP32'nin elektriğini kesmeyin. Başlatma sonrasında durum sırasıyla bekliyor, indiriliyor/kuruluyor ve başarılı olmalıdır. Yeniden başladıktan sonra ENDA sıcaklığı ve hedefi tekrar gelmeden testi tamamlanmış saymayın.

Uzaktan ayar yalnızca ana yöneticiye açıktır; internet, güncel veri, ENDA'nın Celsius ve otomatik çalışma modu gerekir. Aralık 20–100 °C ve ENDA'nın kendi alt/üst sınırlarıyla kısıtlıdır. Artı/eksi taslağı değiştirir, Kaydet komutu gönderir; Vazgeç yalnızca henüz gönderilmemiş taslağı sıfırlar. Gönderilmiş komutu geri almaz.

Sadece aktif hedef yazılır. ENDA'nın ısıtma, PID, histerezis veya röle ayarı değiştirilmez. Örneğin 98'de durup 90'da başlama ayarı ayrı ENDA ayarıdır.

## Kontrol durumu

Bu ESP32 sürümü henüz gerçek cihazda OTA ile yüklenmedi. Bölümleme düzeni, OTA alanı, ENDA çıkış okuması ve yeniden başlatma cihaz başında doğrulanmalıdır. Geri dönüş desteği kartın gerçek bölümleme düzeni görülmeden onaylanmış sayılmaz. Çalışan 0.6.0 ve önceki firmware dosyalarını saklayın.

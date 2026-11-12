# Fatih Kazan ESP32 0.6.3 kalibrasyon — aday

0.6.2 ON/OFF sürümünü temel alır. Web sistemindeki kalibrasyon değeri, ESP32'nin doğrulanmış HTTPS yanıt başlığıyla cihaza iletilir. ESP32 yalnız yerel panel gösterimine uygular; buluta ham ENDA sıcaklığı gönderilir, hedef/ON-OFF/ısıtıcı kontrolü ve ENDA parametreleri değişmez. Çevrimdışı iken son alınmış değer korunur; veri eskirse panel canlı sıcaklık göstermeyi bırakır.

## Aday doğrulaması
- Web canlı görünümünde mevcut offset zaten uygulanır; bu firmware ham sıcaklığı gönderdiği için çift düzeltme olmaz.
- Yerel panelde düzeltilmiş ve ham değer ayrı JSON alanlarıyla sunulur; görünür ana sıcaklık düzeltilmiştir.
- Fiziksel cihaz, bağımsız referans termometre, OTA ve Arduino derlemesi henüz doğrulanmadı.
- Bu adayda OTA için kullanılacak üretim paketi main'de manuel onaylı işlemle hazırlanmalıdır. Dal derlemesi yalnızca duman testidir.

Özel `device_secrets.h` ve `boiler_cloud.h` dosyalarını kaynağa eklemeyin.
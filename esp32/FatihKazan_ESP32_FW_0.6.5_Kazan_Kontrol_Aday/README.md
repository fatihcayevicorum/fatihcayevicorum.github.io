# FatihKazan ESP32 FW 0.6.5 Kazan Kontrol Aday

Bu aday, 0.6.4 ENDA Offset adayını korur ve web/PWA'daki kazan açma/kapatma altyapısı için cihaz desteğini ekler.

- Kazan açık/kapalı durumu ENDA ETx420 resmi C6 coil değerinden okunur.
- C6 `0` iken kontrol çıkışları aktiftir; kazan açık kabul edilir.
- C6 `1` iken ENDA yalnız gösterge modundadır; ısıtma kontrolü kapanır fakat ENDA, ESP32 ve sıcaklık ölçümü çalışmaya devam eder.
- Güç komutu yalnız güncel durum beklenen değerle eşleşirse, zaman aşımına uğramamışsa ve Wi-Fi/ENDA koşulları uygunsa bir kez yazılır.
- İşlem ancak C6 tekrar okunup istenen değer doğrulandığında `confirmed` olur. Yazma yanıtı veya geri okuma belirsizse otomatik tekrar yapılmaz.
- Anlık ısıtma çıkışı güç durumu yerine kullanılmaz; hedefe ulaşınca beklemeye geçen kazan açık kalır.
- Hedef sıcaklık, ON/OFF farkı, H35 offset, OTA ve mevcut bağlantı akışları korunur.
- Mod seçimi cihazda ayrı bir isim olarak tutulmaz; web/sunucu doğrulanmış hedef sıcaklık ve ON/OFF farkı komutlarını kullanır.
- Haftalık program ESP32'de bağımsız takvim çalıştırmaz; sunucu yalnız planlı olay anında aynı doğrulanmış güç komutunu üretir. Böylece manuel kontrol bir sonraki planlı olaya kadar geçerlidir.

## Güvenlik ve etkinleştirme

Bu klasör yalnız aday kaynaktır. Web komutları kapalı kalır. Fiziksel ENDA/kontaktör testi, C6 açık-kapalı geri okuması ve güvenli çalışma doğrulanmadan canlı sunucuya alınmamalı veya OTA ile cihaza yüklenmemelidir.

# FatihKazan ESP32 FW 0.6.6 Bildirim Telemetri Aday

Bu aday, 0.6.5 kazan kontrol sürümünün çalışan hedef sıcaklık, ON/OFF farkı, H35 offset, C6 aç/kapat, ısıtma çıkışı ve OTA akışlarını korur.

Eklenen cihaz desteği:

- ENDA ETx420 resmi `I2` ölçüm hata register'ı okunur.
- `0` hata yok; `1–5` resmi ENDA sensör/ölçüm hata kodlarıdır.
- Sensör hatasında uydurma veya önceki sıcaklık canlı ölçümmüş gibi gönderilmez.
- RS485 iletişimi ile sıcaklık ölçümünün geçerliliği ayrı değerlendirilir.
- ENDA iletişimi sürerken hata kodu, kazan kontrol durumu ve bilinen çıkış durumu buluta aktarılabilir.
- Bağlantı kesilmesi, yeniden bağlanma, ilk açılış sıcaklığı, hedefe ulaşma ve güvenlik bildirimleri için R660 web/Firebase sözleşmesiyle uyumludur.

## Güvenlik

- Hata kodu varken hedef sıcaklık, ON/OFF farkı ve kalibrasyon bilgileri geçerli ölçüm gibi gönderilmez.
- C6 kapatma komutu mevcut tek-sefer yazma ve geri-okuma doğrulamasını korur.
- Otomatik Modbus yazma veya komut tekrarı eklenmemiştir.
- Flash bölüm düzeni değiştirilmemiştir; `default` bölüm şeması ve mevcut OTA alanı kullanılır.
- Bu klasör aday kaynaktır. Derleme ve OTA boyut kontrolü tamamlanmadan cihaza yüklenmez.

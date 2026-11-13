# FatihKazan ESP32 FW 0.6.4 ENDA Offset Aday

Bu aday, Tanımlamalar > Akıllı Kazan bölümündeki sıcaklık kalibrasyonunu ENDA ETx420 cihazının resmi H35 (adres 35 / 0x23) offset parametresine yazar.

- ENDA offset değeri yazılmadan önce güncel değer ve ondalık modu okunur.
- Yazma tek kez yapılır; H35 tekrar okunup aynı değer görülmeden işlem onaylanmaz.
- Web, ESP yerel paneli ve ENDA aynı düzeltilmiş sıcaklığı gösterir; offset ikinci kez uygulanmaz.
- Arayüz sınırı -5,0…+5,0 °C ve 0,1 °C adımıdır.
- ENDA tam derece modundaysa yalnız tam derece offset kabul edilir.
- Hedef sıcaklık, ON/OFF farkı, bağlantı bilgileri ve geçmiş veri yapısı korunur.

Gerçek kalibrasyon, ölçüm kararlı iken bağımsız güvenilir referans termometreyle yapılmalıdır. Kaynama sıcaklığı rakım ve hava basıncına bağlıdır; suyun kaynaması tek başına 100 °C referansı sayılmaz.

# Fatih Kazan ESP32 0.6.2 ON/OFF — aday

Onaylı `KazanFW 0.6.1-ota-test` sürümünü temel alır. ENDA ET4420'nin ON/OFF kontrol modu ile C.HYS sıcaklık farkını güvenli biçimde okumak ve yalnız uygun koşullarda değiştirmek için hazırlanmıştır.

## Resmî ENDA eşlemesi

- H4 / holding register 0004: C.Pb oransal bant. Değer sıfırsa ON/OFF modu aktiftir.
- H5 / holding register 0005: C.HYS kontrol çıkışı histerezisi. ENDA aralığı 1–50 °C'dir.
- C.HYS yalnız C.Pb sıfırken etkindir.

Fatih Çay Evi arayüzü yazma aralığını ayrıca 1–10 °C ile sınırlar. Firmware C.Pb değerini değiştirmez ve PID modunu uzaktan ON/OFF moduna çevirmez.

## Güvenli çalışma

ESP32 her okuma döngüsünde H4 ve H5'i kontrol eder. Cihaz ON/OFF modunda değilse H5 yazma komutu reddedilir. Yazmadan hemen önce cihaz modu ile beklenen eski değer tekrar okunur; komut yalnız bir kez gönderilir ve H5 tekrar okunarak sonuç doğrulanır. Hedef sıcaklık ve ON/OFF farkı komutları aynı anda çalıştırılmaz.

## OTA aday testi

1. `device_secrets.h` ve `boiler_cloud.h` özel dosyalarını onaylı 0.6.1 klasöründen bu klasöre kopyalayın. GitHub'a veya paylaşılan ZIP'e eklemeyin.
2. Arduino IDE'de çalışan ESP32 Dev Module ve bölümleme ayarlarıyla `Sketch > Export Compiled Binary` işlemini yapın.
3. Normal `.ino.bin` dosyasını Tanımlamalar → Akıllı Kazan bölümünde `0.6.2-onoff-aday` sürümüyle hazırlayın.
4. OTA güncellemesinden sonra firmware alanını, sıcaklığı ve hedef sıcaklığı doğrulayın.
5. Akıllı Kazan ekranında kontrol modu ile mevcut C.HYS değerini kontrol edin.

İlk cihaz testinde önce yalnız okunan değer incelenmelidir. Ekran PID modu gösterirse uzaktan yazma denenmez. ON/OFF modu görünürse fark en fazla bir derece değiştirilir, ENDA üzerinden doğrulanır ve gerekirse eski değere geri alınır.

## Kontrol durumu

Kaynak kod ve sunucu akışı hazırlanmış adaydır. Henüz Arduino IDE'de derlenmemiş, gerçek cihaza OTA ile yüklenmemiş ve H4/H5 değerleri gerçek ENDA üzerinde doğrulanmamıştır. Test edilip kullanıcı tarafından onaylanmadan ana firmware değildir.

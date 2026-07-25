# R27 — Sayfa Kaydırma Düzeltmesi

R26 sonrasında bazı panel sayfalarında normal sayfa kaydırmasını engelleyen arka plan kilidi düzeltildi.

## Düzeltilen davranış

- Menü Yönetimi, Stok Yönetimi, Açık Hesap, Adisyon, Esnaf Yönetimi, Raporlar ve Ana Sayfa Yönetimi tekrar normal şekilde kayar.
- Taze Dem sayfasının çalışan kaydırma düzeni korunur.
- Bir pencere gerçekten açıkken yalnız arka sayfa sabit kalır.
- Açılan pencerenin kendi içeriği kaymaya devam eder.
- Pencere kapanınca ana sayfa normal şekilde kayar.
- Kaydırma çubukları görünmez kalır.
- Mavi dokunma efekti yerine hafif basma efekti korunur.

## Kurulum

ZIP içindeki dosya yapısını bozmadan sitenizdeki aynı dosyaların üzerine yükleyin.

Firebase veya Firestore kuralı değişmedi. Yükleme sonrasında bir kez `Ctrl + F5` yapın.

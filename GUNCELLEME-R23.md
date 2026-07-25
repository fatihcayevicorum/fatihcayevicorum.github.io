# R23 — İş Günü ve Güvenli Gün Kapatma

Bu paket yalnızca aşağıdaki dosyaları günceller:

- `adisyon/index.html`
- `adisyon/script.js`
- `adisyon/polish.css`
- `taze-dem-paneli/index.html`
- `taze-dem-paneli/script.js`

## Kurulum

ZIP içindeki klasör yapısını bozmadan bu beş dosyayı sitenizdeki aynı klasörlerin üzerine yükleyin.

Bu güncellemede `firestore.rules` değişmedi; Firebase kurallarını yeniden yayınlamanız gerekmez.

## Kontrol

1. Taze Dem panelinden yeni bir dem başlatın.
2. Adisyon sayfasındaki “Bugünün Durumu” ekranında demlik sayısını kontrol edin.
3. Açık adisyon varsa “Günü Kapat” işleminin engellendiğini kontrol edin.
4. Açık adisyon yokken gün sonu ekranını açın. Onay kutusu işaretlenmeden kesin kapatma butonu çalışmaz.
5. Günü kapattıktan sonra Taze Dem panelinde yeni iş günü sayacının sıfırdan başladığını kontrol edin.

Not: Gün kapatma işlemi gerçek bir kapanış kaydı oluşturur. Deneme yapacaksanız gösterim verileriniz üzerinde yapın.

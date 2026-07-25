# R25 — Adisyon Tamamlama Paketi

## Güncellenen bölümler

- `adisyon/index.html`
- `adisyon/script.js`
- `adisyon/polish.css`
- `adisyon/enhancements.css`
- `adisyon/enhancements.js`
- `raporlar/index.html`
- `raporlar/script.js`
- `raporlar/style.css`

## Kurulum

ZIP içindeki `adisyon` ve `raporlar` klasörlerini sitenizdeki aynı klasörlerin üzerine yükleyin.

Bu güncellemede `firestore.rules` değişmedi; Firebase kurallarını yeniden yayınlamanız gerekmez.

## Gelen özellikler

- Masa Ayarları yalnızca masa sayısını belirler.
- Geçici adisyon adı ve açık hesap müşterisi, açık adisyonun üstündeki çarktan seçilir.
- Hesap kapanınca geçici isim ve müşteri bağlantısı otomatik silinir.
- Masa taşıma ve birleştirmede isim ile müşteri bağlantısı korunur.
- Ödemede Nakit ve Banka Havalesi seçilebilir.
- Telefon/tablet klavyesi yerine ekrandaki dokunmatik rakam tuşları kullanılır.
- Sık kullanılan ürünler otomatik olarak üst sıralara gelir.
- Günlük ürün özeti kategorilere göre sütunlu gösterilir.
- Son Ödemeler ekranından aktif iş günündeki nakit, havale ve yuvarlama işlemi geri alınabilir.
- Kapatılmış adisyon geri açılırken stok miktarı ve stok hareketi de düzeltilir.
- Raporlarda banka havalesi nakitten ayrı gösterilir.

## Önemli

Ödeme düzeltme yalnızca kapanmamış aktif iş gününde kullanılabilir. Gün sonu kapandıktan sonra eski raporlar değiştirilemez.

Açık hesaba aktarılmış adisyonlar, müşteri bakiyesine bağlı olduğundan Son Ödemeler ekranından geri alınmaz.

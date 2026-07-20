# Fatih Çay Evi mobil görünüm düzeltmesi

Bu paket, yayındaki ana sayfanın mevcut içerik ve renklerini koruyarak dikey mobil görünümü düzenler.

Son güncellemede üst karşılama alanı kısaltılmış ve koyu kırmızı geçişli arka plana alınmıştır. “Hoş Geldiniz” kartı tek kısa paragrafa düşürülmüş, menü butonu ise sayfanın ana eylemi olarak daha belirgin hâle getirilmiştir.

Menü bölümü, çay tazelik bölümünün üstüne taşınmıştır. Alt kısımdaki tekrar eden logo, iletişim bilgileri ve sosyal bağlantılar kaldırılmış; hızlı erişim bölümünden sonra yalnızca telif hakkı satırı bırakılmıştır.

## Uygulama

GitHub deposundaki mevcut `index.html`, `style.css` ve `script.js` dosyalarını yedekleyin. Bu paketteki aynı adlı üç dosyayı deponun ana dizinine yükleyip mevcut dosyaların üzerine yazın. `logo.png` dosyanızı değiştirmeyin.

GitHub Pages güncellemesi çoğunlukla birkaç dakika içinde görünür. Eski tasarım görünürse tarayıcıda `Ctrl + F5` ile zorla yenileyin.

## Yapılan değişiklikler

- Ana sayfadaki eksik `.quick-actions`, `.card`, `.gallery-placeholder`, `.gallery-box`, `.menuButton` ve tazelik göstergesi stilleri tamamlandı.
- 320–639 piksel dikey mobil ekranlar için logo, başlık, panel boşlukları ve yazı boyutları küçültülüp dengelendi.
- Koyu kırmızı geçişli üst alanın yüksekliği azaltıldı; logo ve metin aralıkları sıkılaştırıldı.
- “Hoş Geldiniz” bölümü tek kısa paragrafla kompakt hâle getirildi.
- Menü butonuna ikon kutusu, açıklama ve yön oku eklenerek görsel önceliği artırıldı.
- Hızlı erişim kartları mobilde iki sütun, geniş ekranda dört sütun olacak şekilde düzenlendi.
- Çay tazelik bilgilerindeki açık zemin üzerinde görünmeyen beyaz/gri yazılar koyu ve okunaklı renklere çevrildi.
- Tazelik göstergesinin çubuğu görünür hale getirildi; JavaScript erişilebilirlik değerini de güncelliyor.
- Hava durumu alanı ikon ve metin grubu olarak düzenlendi; veri geldiğinde satırların yanlış sütuna kayması önlendi.
- Hover efektleri JavaScript'ten CSS'e taşındı. Böylece dokunmatik telefonlarda takılı kalan büyüme efektleri önlendi.
- Yukarı çıkma düğmesi çentikli telefonların güvenli ekran boşluklarına uyarlandı.
- Dış bağlantılara `rel="noopener noreferrer"`, ikon bağlantılarına açıklayıcı etiketler eklendi.
- Resmî Google yorum bağlantısı `https://g.page/r/CSOIVY6sAnqOEAE/review` olarak düzeltildi.

## Dikkat: Menü sayfası

Yayındaki `menu.html` dosyası şu anda yalnızca 1 bayt ve içerik göstermiyor. Bu paket ana sayfanın mobil düzenini düzeltir; menü sayfasının içeriğini oluşturmaz. Menü butonunun çalışması için `menu.html` ayrıca hazırlanmalıdır.

## Kontrol listesi

- 320 px, 360 px ve 390 px genişliklerde yatay kaydırma olmamalı.
- Hızlı erişim alanında iki kart yan yana görünmeli.
- Telefon numarası kart dışına taşmamalı.
- Tazelik çubuğu ve iki bilgi kutusu okunaklı olmalı.
- Hava durumu ikonu, derece ve açıklama aynı blokta hizalanmalı.

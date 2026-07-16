document.addEventListener("DOMContentLoaded", () => {

  // Çay tazelik göstergesi
  const fill = document.getElementById("freshFill");
  const text = document.getElementById("freshText");

  let percent = 100;

  function updateFreshness() {
    if (!fill || !text) return;

    fill.style.width = percent + "%";

    if (percent >= 85) {
      fill.style.background = "#00c853";
      text.textContent = "%" + percent + " - Yeni Demlendi";
    } else if (percent >= 60) {
      fill.style.background = "#7cb342";
      text.textContent = "%" + percent + " - Çok Taze";
    } else if (percent >= 35) {
      fill.style.background = "#fbc02d";
      text.textContent = "%" + percent + " - İdeal İçim";
    } else {
      fill.style.background = "#d32f2f";
      text.textContent = "%" + percent + " - Yeni Dem Hazırlanıyor";
    }
  }

  updateFreshness();

  // Kart animasyonu
  const panels = document.querySelectorAll(".panel");

  panels.forEach((panel, index) => {
    panel.style.opacity = "0";
    panel.style.transform = "translateY(20px)";

    setTimeout(() => {
      panel.style.transition = "0.5s";
      panel.style.opacity = "1";
      panel.style.transform = "translateY(0)";
    }, index * 150);
  });

  // Footer yılı
  const footer = document.querySelector("footer");

  if (footer) {
    footer.innerHTML = "© " + new Date().getFullYear() + " Fatih Çay Evi";
  }

});

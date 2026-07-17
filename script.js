document.addEventListener("DOMContentLoaded", () => {

    /* ==========================
       PANEL ANİMASYONU
    ========================== */

    const panels = document.querySelectorAll(".panel");

    const observer = new IntersectionObserver((entries) => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                entry.classList;
                entry.target.classList.add("show");

            }

        });

    }, {
        threshold: 0.15
    });

    panels.forEach(panel => observer.observe(panel));



    /* ==========================
       YUKARI ÇIK BUTONU
    ========================== */

    const topBtn = document.getElementById("topBtn");

    window.addEventListener("scroll", () => {

        if (window.scrollY > 350) {

            topBtn.classList.add("showTop");

        } else {

            topBtn.classList.remove("showTop");

        }

    });

    topBtn.addEventListener("click", () => {

        window.scrollTo({

            top: 0,

            behavior: "smooth"

        });

    });



    /* ==========================
       ÇAY TAZELİK GÖSTERGESİ
    ========================== */

    const fill = document.getElementById("freshFill");
    const text = document.getElementById("freshText");

    if (fill && text) {

        const hour = new Date().getHours();

        let percent = 100;

        if (hour >= 8 && hour < 10) {

            percent = 100;

        } else if (hour >= 10 && hour < 12) {

            percent = 90;

        } else if (hour >= 12 && hour < 14) {

            percent = 75;

        } else if (hour >= 14 && hour < 16) {

            percent = 60;

        } else if (hour >= 16 && hour < 18) {

            percent = 45;

        } else {

            percent = 95;

        }

        fill.style.width = percent + "%";

        if (percent >= 85) {

            fill.style.background = "#18c964";
            text.innerHTML = "🟢 %" + percent + " - Yeni Demlendi";

        }

        else if (percent >= 60) {

            fill.style.background = "#f5c542";
            text.innerHTML = "🟡 %" + percent + " - Taze";

        }

        else {

            fill.style.background = "#e53935";
            text.innerHTML = "🔴 %" + percent + " - Yeni Dem Hazırlanıyor";

        }

    }



    /* ==========================
       LOGO EFEKTİ
    ========================== */

    const logo = document.querySelector(".logo");

    if (logo) {

        logo.addEventListener("mouseenter", () => {

            logo.style.transform = "scale(1.05) rotate(2deg)";

        });

        logo.addEventListener("mouseleave", () => {

            logo.style.transform = "scale(1)";

        });

    }



    /* ==========================
       KART ANİMASYONU
    ========================== */

    const cards = document.querySelectorAll(".card");

    cards.forEach(card => {

        card.addEventListener("mouseenter", () => {

            card.style.transform = "translateY(-6px)";

        });

        card.addEventListener("mouseleave", () => {

            card.style.transform = "translateY(0)";

        });

    });



    /* ==========================
       MENÜ BUTONU
    ========================== */

    const menuButton = document.querySelector(".menuButton");

    if (menuButton) {

        menuButton.addEventListener("mouseenter", () => {

            menuButton.style.transform = "scale(1.05)";

        });

        menuButton.addEventListener("mouseleave", () => {

            menuButton.style.transform = "scale(1)";

        });

    }



    /* ==========================
   HAVA DURUMU
========================== */

async function loadWeather() {

    try {

        // Çorum koordinatları
        const lat = 40.5506;
        const lon = 34.9556;

        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`
        );

        const data = await response.json();

        const temp = data.current.temperature_2m;
        const code = data.current.weather_code;

        let icon = "☀️";
        let text = "Açık";
        let teaMessage = "";

       if ([1,2,3].includes(code)) {

    icon = "⛅";
    text = "Parçalı Bulutlu";
    teaMessage = "Güzel bir çay ve samimi sohbet için bekleriz. ☕";

} else if ([45,48].includes(code)) {

    icon = "🌫️";
    text = "Sisli";
    teaMessage = "Sisli havada sıcak çay keyfi bir başka güzel. ☕";

} else if ([51,53,55,61,63,65].includes(code)) {

    icon = "🌧️";
    text = "Yağmurlu";
    teaMessage = "Yağmurlu havanın en güzel eşlikçisi sıcak bir çaydır. ☕";

} else if ([71,73,75].includes(code)) {

    icon = "❄️";
    text = "Karlı";
    teaMessage = "Soğuk havalarda içinizi ısıtacak çayımız hazır. ☕";

} else if ([95,96,99].includes(code)) {

    icon = "⛈️";
    text = "Fırtınalı";
    teaMessage = "Fırtınalı havada sıcak bir mola vermeye ne dersiniz? ☕";

} else {

    teaMessage = "Taze çayımız ve sıcak sohbetimizle bekleriz. ☕";

}

        document.getElementById("weather").innerHTML = `
            <div class="weather-icon">${icon}</div>
            <h3>Çorum</h3>
            <p><strong>${temp}°C</strong></p>
            <p>${text}</p>
            <p class="weather-message">
${teaMessage}
</p>
        `;

    } catch (error) {

        document.getElementById("weather").innerHTML = `
            <p>Hava durumu yüklenemedi.</p>
        `;

        console.error(error);

    }

}

loadWeather();

});

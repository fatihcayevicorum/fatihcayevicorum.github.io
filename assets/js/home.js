document.addEventListener("DOMContentLoaded", () => {
    initPanelAnimations();
    initTopButton();
    updateTeaFreshness();
    loadWeather();
});

function initPanelAnimations() {
    const panels = document.querySelectorAll(".panel");

    if (!("IntersectionObserver" in window)) {
        panels.forEach((panel) => panel.classList.add("show"));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            entry.target.classList.add("show");
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.12 });

    panels.forEach((panel) => observer.observe(panel));
}

function initTopButton() {
    const topButton = document.getElementById("topBtn");
    if (!topButton) return;

    let ticking = false;

    const updateVisibility = () => {
        topButton.classList.toggle("showTop", window.scrollY > 350);
        ticking = false;
    };

    window.addEventListener("scroll", () => {
        if (ticking) return;

        window.requestAnimationFrame(updateVisibility);
        ticking = true;
    }, { passive: true });

    updateVisibility();

    topButton.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
}

function updateTeaFreshness() {
    const text = document.getElementById("freshText");
    const progressBar = document.getElementById("freshBar");

    if (!progressBar || !text) return;

    const hour = new Date().getHours();
    let percent = 95;

    if (hour >= 8 && hour < 10) percent = 100;
    else if (hour >= 10 && hour < 12) percent = 90;
    else if (hour >= 12 && hour < 14) percent = 75;
    else if (hour >= 14 && hour < 16) percent = 60;
    else if (hour >= 16 && hour < 18) percent = 45;

    let color = "#18a957";
    let label = `🟢 %${percent} - Yeni Demlendi`;

    if (percent < 60) {
        color = "#d93b35";
        label = `🔴 %${percent} - Yeni Dem Hazırlanıyor`;
    } else if (percent < 85) {
        color = "#d9a526";
        label = `🟡 %${percent} - Taze`;
    }

    progressBar.value = percent;
    progressBar.textContent = `%${percent}`;
    progressBar.style.setProperty("--progress-color", color);
    text.textContent = label;
}

async function loadWeather() {
    const weatherIcon = document.getElementById("weatherIcon");
    const weatherTemp = document.getElementById("weatherTemp");
    const weatherText = document.getElementById("weatherText");

    if (!weatherIcon || !weatherTemp || !weatherText) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    try {
        const latitude = 40.5506;
        const longitude = 34.9556;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;

        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Hava durumu isteği başarısız: ${response.status}`);

        const data = await response.json();
        const temperature = Math.round(data.current.temperature_2m);
        const weather = getWeatherDescription(data.current.weather_code);

        weatherIcon.textContent = weather.icon;
        weatherTemp.textContent = `${temperature}°C`;
        weatherText.textContent = weather.text;
    } catch (error) {
        weatherIcon.textContent = "🌤️";
        weatherTemp.textContent = "--°C";
        weatherText.textContent = "Hava durumu şu anda alınamıyor.";
        console.error(error);
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function getWeatherDescription(code) {
    if ([1, 2, 3].includes(code)) return { icon: "⛅", text: "Parçalı Bulutlu" };
    if ([45, 48].includes(code)) return { icon: "🌫️", text: "Sisli" };
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
        return { icon: "🌧️", text: "Yağmurlu" };
    }
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: "❄️", text: "Karlı" };
    if ([95, 96, 99].includes(code)) return { icon: "⛈️", text: "Fırtınalı" };
    return { icon: "☀️", text: "Açık" };
}

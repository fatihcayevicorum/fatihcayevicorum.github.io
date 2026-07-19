document.addEventListener("DOMContentLoaded", () => {

    // Tarih ve Saat
    function updateClock() {

        const now = new Date();

        const date = now.toLocaleDateString("tr-TR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        });

        const time = now.toLocaleTimeString("tr-TR");

        const dateEl = document.getElementById("date");
        const clockEl = document.getElementById("clock");

        if(dateEl) dateEl.textContent = date;
        if(clockEl) clockEl.textContent = time;

    }

    updateClock();
    setInterval(updateClock,1000);


    // Test Demliği
    const btn=document.getElementById("newTea");

    if(btn){

        btn.addEventListener("click",()=>{

            const teaList=document.getElementById("teaList");

            teaList.innerHTML=`

            <div class="tea-card">

                <h3>🫖 Demlik 1</h3>

                <p class="status brewing">

                    ⏳ Demleniyor

                </p>

                <small>20:00</small>

            </div>

            `;

            document.getElementById("aktifDemlik").textContent="1";
            document.getElementById("demlenenDemlik").textContent="1";

        });

    }


    // Çıkış

    const logout=document.querySelector(".logout");

    if(logout){

        logout.onclick=()=>{

            window.location.href="login.html";

        }

    }

});
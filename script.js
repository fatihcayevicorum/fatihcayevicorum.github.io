document.addEventListener("DOMContentLoaded", () => {

    /* ===========================
       ÇAY TAZELİK GÖSTERGESİ
    =========================== */

    const fill = document.getElementById("freshFill");
    const text = document.getElementById("freshText");

    let percent = 100;

    function updateFreshness() {

        if (!fill || !text) return;

        fill.style.width = percent + "%";

        if (percent >= 85) {

            fill.style.background = "#00c853";
            text.innerHTML = "🟢 %" + percent + " - Yeni Demlendi";

        } else if (percent >= 60) {

            fill.style.background = "#8bc34a";
            text.innerHTML = "🟢 %" + percent + " - Çok Taze";

        } else if (percent >= 35) {

            fill.style.background = "#ffc107";
            text.innerHTML = "🟡 %" + percent + " - İdeal İçim";

        } else {

            fill.style.background = "#f44336";
            text.innerHTML = "🔴 %" + percent + " - Yeni Dem Hazırlanıyor";

        }

    }

    updateFreshness();



    /* ===========================
       PANEL ANİMASYONU
    =========================== */

    const panels = document.querySelectorAll(".panel");

    const observer = new IntersectionObserver((entries)=>{

        entries.forEach(entry=>{

            if(entry.isIntersecting){

                entry.target.classList.add("show");

            }

        });

    },{

        threshold:0.15

    });

    panels.forEach(panel=>observer.observe(panel));



    /* ===========================
       YUKARI ÇIK BUTONU
    =========================== */

    const topBtn = document.getElementById("topBtn");

    window.addEventListener("scroll",()=>{

        if(window.scrollY>350){

            topBtn.classList.add("showTop");

        }else{

            topBtn.classList.remove("showTop");

        }

    });

    topBtn.addEventListener("click",()=>{

        window.scrollTo({

            top:0,

            behavior:"smooth"

        });

    });



    /* ===========================
       LOGO HAREKETİ
    =========================== */

    const logo=document.querySelector(".logo");

    if(logo){

        logo.addEventListener("mouseenter",()=>{

            logo.style.transform="scale(1.05)";

        });

        logo.addEventListener("mouseleave",()=>{

            logo.style.transform="scale(1)";

        });

    }



    /* ===========================
       MENÜ BUTONU
    =========================== */

    const menuBtn=document.querySelector(".menuButton");

    if(menuBtn){

        menuBtn.addEventListener("mouseenter",()=>{

            menuBtn.style.transform="scale(1.05)";

        });

        menuBtn.addEventListener("mouseleave",()=>{

            menuBtn.style.transform="scale(1)";

        });

    }

});

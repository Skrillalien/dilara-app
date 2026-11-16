// ─────────────────────────────────────────────────────────────
// İlk açılış rehberi
//
// Uygulamayı ilk kez açan (giriş yapmamış) kişiye 3 kısa ekran.
// Kaydırarak ya da "İleri" ile geçilir, "Atla" ile kapanır.
// Bir kez gösterilir (localStorage → onboardingSeen).
// ─────────────────────────────────────────────────────────────

const ONBOARDING_KEY = "onboardingSeen";

const ONBOARDING_SLIDES = [
    {
        art: `
            <div class="ob-art-logo">
                <svg class="brand-mark" aria-hidden="true"><use href="#brandMark"/></svg>
            </div>`,
        title: "İkinize ait bir köşe",
        text: "Anılarınız, fotoğraflarınız, şarkılarınız ve hayalleriniz tek bir yerde. Burayı sadece sen ve partnerin görürsünüz."
    },
    {
        art: `
            <div class="ob-art-stack">
                <div class="ob-chip ob-chip-big">💗 Seni özledim <b>×3</b></div>
                <div class="ob-chip-row">
                    <div class="ob-chip">😊 Mutlu</div>
                    <div class="ob-chip">🥱 Uykulu</div>
                </div>
                <div class="ob-chip ob-chip-soft">❓ Günün Sorusu: İlk buluşmamızda ne giymiştim?</div>
            </div>`,
        title: "Her gün birbirinizi hissedin",
        text: "Özlediğinde tek dokunuşla haber ver, ruh halini paylaş, Günün Sorusu'nu birlikte cevaplayın."
    },
    {
        art: `
            <div class="ob-art-letter">
                <svg viewBox="0 0 200 140" aria-hidden="true">
                    <rect x="14" y="20" width="172" height="110" rx="16" class="ob-env"/>
                    <path d="M22 30 L100 88 L178 30" class="ob-env-line"/>
                    <circle cx="100" cy="88" r="22" class="ob-seal"/>
                    <path d="M100 99 C90 92 86 88 86 83 C86 79 89 76 93 76 C96 76 98 78 100 80 C102 78 104 76 107 76 C111 76 114 79 114 83 C114 88 110 92 100 99Z" class="ob-seal-heart"/>
                </svg>
                <div class="ob-chip ob-chip-soft">🔒 14 Şubat'ta açılır</div>
            </div>`,
        title: "Geleceğe küçük sürprizler",
        text: "Seçtiğin güne kadar açılmayan mühürlü mektuplar yaz. Geçen yılın bugününde neler yaşadığınızı birlikte hatırlayın."
    }
];

function shouldShowOnboarding() {
    try {
        return !localStorage.getItem(ONBOARDING_KEY);
    } catch {
        return false;
    }
}

function showOnboarding() {

    if (document.getElementById("onboarding")) return;

    const wrap = document.createElement("div");

    wrap.id = "onboarding";
    wrap.className = "onboarding";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "Kalp Kalbe'ye hoş geldin");

    wrap.innerHTML = `
        <button class="ob-skip" type="button">Atla</button>

        <div class="ob-track">
            ${ONBOARDING_SLIDES.map((s, i) => `
                <section class="ob-slide" data-index="${i}">
                    <div class="ob-art">${s.art}</div>
                    <h2 class="ob-title">${s.title}</h2>
                    <p class="ob-text">${s.text}</p>
                </section>
            `).join("")}
        </div>

        <div class="ob-footer">
            <div class="ob-dots">
                ${ONBOARDING_SLIDES.map((_, i) => `<span class="ob-dot${i === 0 ? " active" : ""}"></span>`).join("")}
            </div>
            <button class="ob-next" type="button">İleri</button>
        </div>
    `;

    document.body.appendChild(wrap);

    const track = wrap.querySelector(".ob-track");
    const dots = [...wrap.querySelectorAll(".ob-dot")];
    const next = wrap.querySelector(".ob-next");
    const last = ONBOARDING_SLIDES.length - 1;

    const current = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));

    const update = () => {

        const i = current();

        dots.forEach((d, n) => d.classList.toggle("active", n === i));

        next.textContent = i >= last ? "Başlayalım 💜" : "İleri";
        next.classList.toggle("final", i >= last);

    };

    track.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });

    next.addEventListener("click", () => {

        const i = current();

        if (i >= last) {
            finishOnboarding();
            return;
        }

        track.scrollTo({ left: (i + 1) * track.clientWidth, behavior: "smooth" });

    });

    dots.forEach((d, n) => d.addEventListener("click", () => {
        track.scrollTo({ left: n * track.clientWidth, behavior: "smooth" });
    }));

    wrap.querySelector(".ob-skip").addEventListener("click", finishOnboarding);

    requestAnimationFrame(() => wrap.classList.add("show"));

}

function finishOnboarding() {

    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}

    const wrap = document.getElementById("onboarding");

    if (!wrap) return;

    wrap.classList.remove("show");
    wrap.classList.add("hide");

    setTimeout(() => wrap.remove(), 320);

}

// Android geri tuşu: rehber açıksa önceki ekrana dön (capacitor.js)
function onboardingBack() {

    const wrap = document.getElementById("onboarding");

    if (!wrap) return false;

    const track = wrap.querySelector(".ob-track");
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));

    if (i > 0) track.scrollTo({ left: (i - 1) * track.clientWidth, behavior: "smooth" });

    // Rehber açıkken uygulamadan çıkmasın
    return true;

}

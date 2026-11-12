// ─────────────────────────────────────────────────────────────
// Yasal metinlerin ortak bilgileri
//
// Uygulama adı ya da iletişim adresi değişince SADECE burayı
// değiştir; gizlilik politikası ve kullanım koşulları buradan okur.
// ─────────────────────────────────────────────────────────────

window.LEGAL = {

    // Mağazadaki uygulama adı
    appName: "[UYGULAMA ADI]",

    // Veri sorumlusu / yayıncı
    publisher: "Berk Can Asatekin",

    // Kullanıcıların veri talepleri ve destek için yazacağı adres
    contactEmail: "[DESTEK E-POSTASI]",

    // Metinlerin son güncellenme tarihi
    updated: "12 Kasım 2026",

    // Metin sürümü (değiştikçe artır; kullanıcı onayları bu sürümle kaydedilir)
    version: 1

};

// Sayfadaki [data-fill="..."] alanlarını doldur
document.addEventListener("DOMContentLoaded", () => {

    document.querySelectorAll("[data-fill]").forEach(el => {

        const key = el.dataset.fill;
        const value = window.LEGAL[key];

        if (value === undefined) return;

        if (key === "contactEmail" && el.tagName === "A") {
            el.href = `mailto:${value}`;
        }

        el.textContent = value;

    });

    document.title = document.title.replace("{app}", window.LEGAL.appName);

});

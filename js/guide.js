// ─────────────────────────────────────────────────────────────
// Yeni kullanıcıyı yönlendirme
//
// • Partner henüz katılmadıysa ana sayfada davet kartı; katıldığı an
//   uygulama kendini yeniler
// • Kapak fotoğrafı yoksa üst alanda "Kapak fotoğrafı ekle"
// • "İlk adımlar" kartı (6 adım). İlerleme çiftin verisinden
//   hesaplanır, yani biriniz yapınca ikinizde de işaretlenir.
//   Hepsi bitince kutlayıp kaybolur; ✕ ile gizlenebilir.
// • Boş sayfalar: çizim + tek cümle + düğme + hazır öneriler
// • Biz sayfası: kartlarda sayılar, yeniler, bekleyenler
// ─────────────────────────────────────────────────────────────

const GUIDE_HIDDEN_KEY = "guideHidden";
const GUIDE_SEEN_KEY = "guideSeenIncomplete";
const GUIDE_REFRESH_MS = 20 * 1000;

let guideSummary = null;
let guideFetchedAt = 0;
let guideFetching = null;
let guideWaiting = false;

function guideStore(key, value) {
    try {
        if (value === undefined) return localStorage.getItem(key);
        localStorage.setItem(key, value);
    } catch {}
    return null;
}

// ── Veriler ─────────────────────────────────────────────────

async function refreshGuide(force = false) {

    if (!window.firebase?.getCoupleSummary) return;

    if (!force && Date.now() - guideFetchedAt < GUIDE_REFRESH_MS) {
        renderGuide();
        return;
    }

    if (guideFetching) return guideFetching;

    guideFetching = window.firebase.getCoupleSummary()
        .then(summary => {
            if (summary) {
                guideSummary = summary;
                guideFetchedAt = Date.now();
            }
        })
        .catch(error => console.warn("Özet alınamadı:", error))
        .finally(() => {
            guideFetching = null;
            renderGuide();
        });

    return guideFetching;

}

function renderGuide() {
    renderGettingStarted();
    renderBizInfo();
}

// Sayfa değişince (ui.js → showPage)
function guideOnPage(page) {
    if (page === "home" || page === "us") refreshGuide();
}

// ── Partner bekleniyor ──────────────────────────────────────

function startGuideWaiting(inviteCode) {

    guideWaiting = true;

    const card = document.getElementById("inviteHomeCard");
    const code = document.getElementById("inviteHomeCode");

    if (code) code.textContent = inviteCode || "";
    if (card) card.style.display = "";

    // Paylaş düğmesi kodu buradan okur (invite.js)
    const display = document.getElementById("inviteCodeDisplay");
    if (display && inviteCode) display.textContent = inviteCode;

    // Partner katılınca her şeyi baştan yükle
    window.firebase?.listenCouple?.(couple => {
        if ((couple.members || []).length >= 2) {
            showToast("💜 Partnerin katıldı! Hazırlanıyor…");
            setTimeout(() => location.reload(), 1200);
        }
    });

    refreshGuide(true);

}

// ── Kapak fotoğrafı ─────────────────────────────────────────

function renderCoverPlaceholder(hasPhotos) {

    const btn = document.getElementById("coverAddBtn");

    if (btn) btn.style.display = hasPhotos ? "none" : "";

}

function pickCoverPhoto() {
    document.getElementById("sliderPhotoInput")?.click();
}

// ── İlk adımlar ─────────────────────────────────────────────

function guideSteps(s) {

    return [
        {
            id: "invite", icon: "💌", text: "Partnerini davet et",
            done: s.members >= 2,
            go: () => shareInviteLink(document.getElementById("inviteHomeShare"))
        },
        {
            id: "cover", icon: "🖼️", text: "Kapak fotoğrafı ekleyin",
            done: s.slider > 0,
            go: pickCoverPhoto
        },
        {
            id: "memory", icon: "📝", text: "İlk anınızı yazın",
            done: s.memories > 0,
            go: () => { showPage("our-memories"); setTimeout(() => document.getElementById("memoryText")?.focus(), 300); }
        },
        {
            id: "song", icon: "🎵", text: "İlk şarkınızı bırakın",
            done: s.songs > 0,
            go: () => { showPage("our-songs"); openSongForm(); }
        },
        {
            id: "dream", icon: "✨", text: "İlk hayalinizi ekleyin",
            done: s.dreams > 0,
            go: () => showPage("our-dreams")
        },
        {
            id: "question", icon: "💬", text: "Günün sorusunu cevaplayın",
            done: s.answers > 0,
            go: () => showPage("our-questions")
        }
    ];

}

function renderGettingStarted() {

    const card = document.getElementById("guideCard");

    if (!card) return;

    const s = guideSummary;

    if (!s || guideStore(GUIDE_HIDDEN_KEY) === "1") {
        card.style.display = "none";
        return;
    }

    const steps = guideSteps(s);
    const done = steps.filter(x => x.done).length;

    if (done === steps.length) {

        card.style.display = "none";

        // Sadece bu cihazda kartı yarımken gördüyse kutla
        if (guideStore(GUIDE_SEEN_KEY) === "1") {
            guideStore(GUIDE_SEEN_KEY, "done");
            showToast("🎉 İlk adımları birlikte tamamladınız!");
            if (typeof spawnConfetti === "function") spawnConfetti();
        }

        return;

    }

    if (guideStore(GUIDE_SEEN_KEY) !== "done") guideStore(GUIDE_SEEN_KEY, "1");

    // Sırada: tamamlanmamış ilk adım
    const next = steps.find(x => !x.done);

    const note = done === 0 ? "" : done >= steps.length - 2 ? " · az kaldı 💜" : " · harika gidiyorsunuz";

    card.style.display = "";
    card.innerHTML = `
        <div class="guide-head">
            <b>İlk adımlar</b>
            <span>${done}/${steps.length}${note}</span>
            <button class="guide-close" type="button" aria-label="Gizle" onclick="hideGettingStarted()">✕</button>
        </div>
        <div class="guide-bar"><i style="width:${Math.round(done / steps.length * 100)}%"></i></div>
        ${steps.map(x => `
            <button class="guide-step${x.done ? " done" : ""}${x === next ? " next" : ""}" type="button"
                data-step="${x.id}" ${x.done ? "disabled" : ""}>
                <span class="guide-ic">${x.done ? "✓" : x.icon}</span>
                <span class="guide-text">${x.text}</span>
                ${x.done ? "" : '<span class="guide-chev">›</span>'}
            </button>
        `).join("")}
    `;

    card.querySelectorAll(".guide-step:not(.done)").forEach(btn => {
        btn.addEventListener("click", () => steps.find(x => x.id === btn.dataset.step)?.go());
    });

}

function hideGettingStarted() {

    guideStore(GUIDE_HIDDEN_KEY, "1");

    document.getElementById("guideCard").style.display = "none";

    showToast("Gizlendi. Ayarlar → Uygulama rehberi'nden geri açabilirsin.");

}

function showGettingStartedAgain() {

    guideStore(GUIDE_HIDDEN_KEY, "0");

    if (typeof closeSheets === "function") closeSheets();

    showPage("home");
    refreshGuide(true);

}

// ── Boş sayfalar ────────────────────────────────────────────

const EMPTY_ART = {
    sparkle: `<svg viewBox="0 0 120 96" aria-hidden="true">
        <path d="M60 10C62 30 70 38 90 40C70 42 62 50 60 70C58 50 50 42 30 40C50 38 58 30 60 10Z" class="ea-a"/>
        <path d="M95 60c1 7 4 10 11 11c-7 1-10 4-11 11c-1-7-4-10-11-11c7-1 10-4 11-11Z" class="ea-b"/>
        <path d="M24 64c.8 5 3 7 8 8c-5 .8-7 3-8 8c-.8-5-3-7-8-8c5-.8 7-3 8-8Z" class="ea-c"/></svg>`,
    book: `<svg viewBox="0 0 120 96" aria-hidden="true">
        <path d="M22 22c12-6 26-6 38 2v56c-12-8-26-8-38-2z" class="ea-c"/>
        <path d="M98 22c-12-6-26-6-38 2v56c12-8 26-8 38-2z" class="ea-a"/>
        <path d="M60 34c-3-6-12-5-12 2c0 5 6 9 12 14c6-5 12-9 12-14c0-7-9-8-12-2z" class="ea-heart"/></svg>`,
    music: `<svg viewBox="0 0 120 96" aria-hidden="true">
        <path d="M48 20l40-8v52" class="ea-line"/><path d="M48 20v56" class="ea-line"/>
        <circle cx="38" cy="76" r="11" class="ea-a"/><circle cx="78" cy="64" r="11" class="ea-b"/></svg>`,
    photo: `<svg viewBox="0 0 120 96" aria-hidden="true">
        <rect x="18" y="22" width="60" height="50" rx="10" class="ea-c" transform="rotate(-8 48 47)"/>
        <rect x="42" y="18" width="60" height="50" rx="10" class="ea-a" transform="rotate(6 72 43)"/>
        <circle cx="64" cy="36" r="6" class="ea-sun"/><path d="M48 62l14-14 10 10 8-8 16 16" class="ea-line"/></svg>`,
    calendar: `<svg viewBox="0 0 120 96" aria-hidden="true">
        <rect x="26" y="20" width="68" height="62" rx="12" class="ea-c"/>
        <rect x="26" y="20" width="68" height="18" rx="9" class="ea-a"/>
        <path d="M60 52c-3-6-12-5-12 2c0 5 6 9 12 14c6-5 12-9 12-14c0-7-9-8-12-2z" class="ea-heart"/></svg>`
};

function emptyStateHtml({ art, title, text, button, onclick }) {

    return `
        <div class="empty-guide">
            <div class="empty-guide-art">${EMPTY_ART[art] || ""}</div>
            <div class="empty-guide-title">${title}</div>
            <div class="empty-guide-text">${text}</div>
            ${button ? `<button class="empty-guide-btn" type="button" onclick="${onclick}">${button}</button>` : ""}
        </div>
    `;

}

const DREAM_SUGGESTIONS = [
    ["🏝️", "Birlikte tatile gitmek"],
    ["⛺", "Kamp yapmak"],
    ["🐶", "Evcil hayvan sahiplenmek"],
    ["🎢", "Lunaparka gitmek"],
    ["🍳", "Birlikte yemek kursuna gitmek"],
    ["✈️", "Yurt dışına gitmek"],
    ["🌅", "Gün doğumunu birlikte izlemek"],
    ["🏠", "Kendi evimizi kurmak"]
];

function emptyDreamsHtml() {

    return emptyStateHtml({
        art: "sparkle",
        title: "Birlikte ilk hayaliniz ne?",
        text: "Gitmek istediğiniz yerler, yapmak istediğiniz şeyler… Gerçekleşince işaretleyin, burada birikip dursun.",
        button: "＋ Yeni hayal ekle",
        onclick: "openDreamForm()"
    }) + `
        <div class="empty-sugg-label">Ya da bunlardan biriyle başla, dokununca eklenir:</div>
        <div class="empty-chips">
            ${DREAM_SUGGESTIONS.map(([emoji, title], i) => `
                <button class="empty-chip" type="button" onclick="addSuggestedDream(${i}, this)">
                    <span class="empty-chip-plus">＋</span>${emoji} ${title}
                </button>
            `).join("")}
        </div>
    `;

}

async function addSuggestedDream(index, button) {

    const [emoji, title] = DREAM_SUGGESTIONS[index] || [];

    if (!title || button.disabled) return;

    button.disabled = true;

    try {
        await window.firebase.addDream({ emoji, title, note: "", completed: false });
        showToast("✨ Hayallerinize eklendi");
        guideFetchedAt = 0;
    } catch (error) {
        console.error("Hayal eklenemedi:", error);
        showToast("Eklenemedi, tekrar dene.");
        button.disabled = false;
    }

}

function emptyMemoriesHtml() {
    return emptyStateHtml({
        art: "book",
        title: "İlk anınızı yazın",
        text: "Bugün ne güzel bir şey oldu? Bir cümle bile yeter. Fotoğraf da ekleyebilirsin; yıllar sonra okumak çok güzel olacak.",
        button: "Yazmaya başla",
        onclick: "document.getElementById('memoryText').focus()"
    });
}

function emptySongsHtml() {
    return emptyStateHtml({
        art: "music",
        title: "Sizin şarkınız hangisi?",
        text: "Spotify ya da YouTube'dan bir şarkı bırak, altına bir not yaz. Partnerin açınca görsün.",
        button: "＋ İlk şarkıyı bırak",
        onclick: "openSongForm()"
    });
}

function emptyPhotosHtml() {
    return emptyStateHtml({
        art: "photo",
        title: "İlk fotoğrafınızı ekleyin",
        text: "Birlikte çektiğiniz kareler burada aylara göre dizilir. Anılara eklediğin fotoğraflar da burada görünür.",
        button: "＋ Fotoğraf ekle",
        onclick: "selectPhoto()"
    });
}

// ── Takvim önerileri ────────────────────────────────────────

function calendarSuggestions() {

    const me = (typeof coupleNames !== "undefined" && coupleNames.me) || "";
    const partner = (typeof coupleNames !== "undefined" && coupleNames.partner) || "";

    const list = [];

    if (typeof START_DATE !== "undefined" && START_DATE instanceof Date && !isNaN(START_DATE)) {
        list.push({
            emoji: "💜", name: "Yıldönümümüz",
            day: START_DATE.getDate(), month: START_DATE.getMonth() + 1,
            hint: "tanışma tarihinizden"
        });
    }

    list.push({ emoji: "💝", name: "Sevgililer Günü", day: 14, month: 2 });

    if (partner && partner !== "Ben") list.push({ emoji: "🎂", name: `${withGenitive(partner)} Doğum Günü`, ask: true });
    if (me && me !== "Sen") list.push({ emoji: "🎂", name: `${withGenitive(me)} Doğum Günü`, ask: true });

    list.push({ emoji: "🌸", name: "Kadınlar Günü", day: 8, month: 3 });

    const have = new Set((typeof EVENTS !== "undefined" ? EVENTS : []).map(e => String(e.name || "").toLocaleLowerCase("tr-TR")));

    return list.map(x => ({ ...x, added: have.has(x.name.toLocaleLowerCase("tr-TR")) }));

}

// Türkçe -(n)in eki: Berk'in, Dilara'nın, Umut'un, Gül'ün
function withGenitive(name) {

    const vowels = "aeıioöuüAEIİOÖUÜ";
    const lastVowel = [...name].reverse().find(ch => vowels.includes(ch)) || "e";
    const v = { a: "ı", ı: "ı", e: "i", i: "i", o: "u", u: "u", ö: "ü", ü: "ü" }[lastVowel.toLocaleLowerCase("tr-TR")] || "i";
    const endsWithVowel = vowels.includes(name.slice(-1));

    return `${name}'${endsWithVowel ? "n" : ""}${v}n`;

}

function calendarSuggestionsHtml(isEmpty) {

    // Liste doluyken sadece eklenmemiş öneriler
    const all = calendarSuggestions().map((x, i) => ({ ...x, index: i }));
    const items = isEmpty ? all : all.filter(x => !x.added);

    if (!items.length) return "";

    const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

    return `
        ${isEmpty ? emptyStateHtml({
            art: "calendar",
            title: "Önemli günleriniz",
            text: "Ekleyin; o gün yaklaşınca ikinize de hatırlatalım."
        }) : ""}
        <div class="empty-sugg-label">Önerilenler</div>
        ${items.map(x => `
            <div class="cal-sugg">
                <div class="cal-sugg-emoji">${x.emoji}</div>
                <div class="cal-sugg-text">
                    <b>${escapeNow(x.name)}</b>
                    <small>${x.ask ? "Tarih seç" : `${x.day} ${months[x.month - 1]}${x.hint ? " · " + x.hint : ""}`}</small>
                </div>
                ${x.added
                    ? '<span class="cal-sugg-btn added">✓ Eklendi</span>'
                    : `<button class="cal-sugg-btn" type="button" onclick="addSuggestedEvent(${x.index}, this)">＋ Ekle</button>`}
            </div>
        `).join("")}
    `;

}

async function addSuggestedEvent(index, button) {

    const item = calendarSuggestions()[index];

    if (!item || button.disabled) return;

    // Doğum günü: tarihi sor (formu doldurarak aç)
    if (item.ask) {
        openEventForm();
        setTimeout(() => {
            const emoji = document.getElementById("eventEmoji");
            const name = document.getElementById("eventName");
            if (emoji) emoji.value = item.emoji;
            if (name) name.value = item.name;
            document.getElementById("eventDay")?.focus();
        }, 50);
        return;
    }

    button.disabled = true;

    try {
        await window.firebase.addEvent({ emoji: item.emoji, name: item.name, day: item.day, month: item.month, repeatYearly: true });
        showToast("Özel gün eklendi 🎉");
    } catch (error) {
        console.error("Özel gün eklenemedi:", error);
        showToast("Eklenemedi, tekrar dene.");
        button.disabled = false;
    }

}

// ── Biz sayfası: canlı bilgiler ─────────────────────────────

function bizCard(target) {
    return document.querySelector(`.biz-card[onclick*="${target}"]`);
}

function setBizInfo(target, info, badge = null, empty = false) {

    const card = bizCard(target);

    if (!card) return;

    let infoEl = card.querySelector(".biz-card-info");

    if (!infoEl) {
        infoEl = document.createElement("div");
        infoEl.className = "biz-card-info";
        card.appendChild(infoEl);
    }

    infoEl.innerHTML = info || "";
    infoEl.style.display = info ? "" : "none";

    card.classList.toggle("has-info", !!info);
    card.classList.toggle("is-empty", !!empty);

    let badgeEl = card.querySelector(".biz-card-badge");

    if (badge) {
        if (!badgeEl) {
            badgeEl = document.createElement("span");
            card.appendChild(badgeEl);
        }
        badgeEl.className = "biz-card-badge" + (badge.kind ? " " + badge.kind : "");
        badgeEl.textContent = badge.text;
    } else {
        badgeEl?.remove();
    }

}

function unseenBadge(type) {
    const n = typeof inboxUnseen !== "undefined" ? (inboxUnseen[type] || []).length : 0;
    return n ? { text: `${n} yeni` } : null;
}

function renderBizInfo() {

    const s = guideSummary;

    if (!s) return;

    const num = n => (typeof n === "number" ? n : null);

    // Anılar
    const mem = num(s.memories);
    setBizInfo("our-memories", mem ? `${mem} anı` : mem === 0 ? "＋ İlk anınızı yazın" : "", unseenBadge("memories"), mem === 0);

    // Fotoğraflar (anılardaki fotoğraflar da galeride)
    const photos = typeof galleryItems !== "undefined" && galleryItems.length ? galleryItems.length : num(s.photos);
    setBizInfo("our-photos", photos ? `${photos} fotoğraf` : photos === 0 ? "＋ İlk fotoğrafı ekle" : "", null, photos === 0);

    // Şarkılar
    const songs = num(s.songs);
    setBizInfo("our-songs", songs ? `${songs} şarkı` : songs === 0 ? "＋ İlk şarkıyı bırak" : "", unseenBadge("songs"), songs === 0);

    // Takvim: en yakın gün
    const events = typeof EVENTS !== "undefined" ? EVENTS : [];
    if (events.length && typeof daysUntil === "function" && typeof nextOccurrence === "function") {
        const next = events
            .map(e => ({ e, days: daysUntil(nextOccurrence(e.month, e.day)) }))
            .sort((a, b) => a.days - b.days)[0];
        setBizInfo("our-calendar", next.days === 0
            ? `🎉 Bugün: ${escapeNow(next.e.name)}`
            : `<span class="biz-big">${next.days}</span> gün · ${escapeNow(next.e.name)}`);
    } else {
        setBizInfo("our-calendar", "＋ Önemli günlerinizi ekleyin", null, true);
    }

    // Hayaller
    const dreams = num(s.dreams);
    const doneN = num(s.dreamsDone);
    setBizInfo("our-dreams",
        dreams ? `${dreams} hayal` : dreams === 0 ? "＋ İlk hayalinizi ekleyin" : "",
        doneN ? { text: `${doneN} gerçekleşti`, kind: "green" } : unseenBadge("dreams"),
        dreams === 0);

    // Yan Yana
    if (typeof proximityMonthDays !== "undefined" && proximityMonthDays.length) {
        setBizInfo("openTogetherStats", `Bu ay ${proximityMonthDays.length} gün`);
    }

    // Günün Sorusu
    if (typeof questionByDay === "function" && typeof questionToday === "function") {
        const q = questionByDay(questionToday());
        const mine = q && typeof questionMyAnswers !== "undefined" && questionMyAnswers[q.day];
        if (q && !mine && !q.revealed) {
            setBizInfo("our-questions", "Bugünkü soru seni bekliyor", { text: "🔒 Cevapla", kind: "lock" });
        } else if (q) {
            setBizInfo("our-questions", q.revealed ? "Bugünkü cevaplar açıldı" : "Partnerin bekleniyor");
        }
    }

    // Mektuplar
    if (typeof lettersAll !== "undefined") {
        const sealed = lettersAll.filter(l => l.status === "sealed").length;
        const opened = lettersAll.filter(l => l.status !== "sealed").length;
        const unseen = unseenBadge("letters");
        if (sealed) setBizInfo("our-letters", `${sealed} mühürlü mektup`, unseen);
        else if (opened) setBizInfo("our-letters", `${opened} açılmış mektup`, unseen);
        else setBizInfo("our-letters", "＋ İlk mektubu mühürle", null, true);
    }

}

// ── Başlat ──────────────────────────────────────────────────

// Çift hazır olunca (app.js)
function startGuide() {
    refreshGuide(true);
}

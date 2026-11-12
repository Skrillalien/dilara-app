// ─────────────────────────────────────────────────────────────
// Mühürlü Mektuplar
//
// Bir tarih seçip mektup yazarsın; o tarihe kadar mühürlü kalır,
// partnerin içeriği göremez. "Açılış tarihini gizli tut" seçilirse
// partner sadece mühürlü bir mektup olduğunu görür, ne zaman
// açılacağını bilmez. Tarih gelince sunucu mektubu açar.
//
// Mühürlüyken düzenlenebilir ve iptal edilebilir.
// Aynı anda bırakılabilecek mektup sayısı pakete bağlıdır
// (ücretsiz: 1). Asıl kontrol sunucuda (functions/index.js).
// ─────────────────────────────────────────────────────────────

const LETTER_FREE_LIMIT = 1;
const LETTER_PREMIUM_LIMIT = 20;
const LETTER_MAX_LENGTH = 5000;

let lettersStarted = false;
let lettersAll = [];
let letterContents = {};
let letterLimit = LETTER_FREE_LIMIT;
let letterTicker = null;
let letterOpening = new Set();

// Yazma penceresinin durumu
let letterEditingId = null;
let letterPhoto = null;          // prepareImage() çıktısı
let letterPhotoRemoved = false;

// ── Yardımcılar ─────────────────────────────────────────────

function lettersMyUid() {

    return window.firebase?.getCurrentAuthUser?.()?.uid;

}

function letterPartnerName() {

    const name = typeof coupleNames !== "undefined" ? coupleNames.partner : "";

    return name && name !== "Ben" ? name : "Sevgilin";

}

function letterMs(ts) {

    if (!ts) return null;
    if (typeof ts === "number") return ts;

    return ts.toMillis?.() ?? (ts.seconds ? ts.seconds * 1000 : null);

}

function letterDateText(ms, withTime = false) {

    if (!ms) return "";

    const opts = { day: "numeric", month: "long", year: "numeric" };

    if (withTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit" });

    return new Date(ms).toLocaleString("tr-TR", opts);

}

// "3 gün 4 saat", "5 saat 12 dk", "8 dk"
function letterCountdown(ms) {

    const diff = ms - Date.now();

    if (diff <= 0) return null;

    const min = Math.floor(diff / 60000);
    const hours = Math.floor(min / 60);
    const days = Math.floor(hours / 24);

    if (days >= 365) {
        const years = Math.floor(days / 365);
        const rest = Math.floor((days % 365) / 30);
        return rest ? `${years} yıl ${rest} ay` : `${years} yıl`;
    }

    if (days >= 30) {
        const months = Math.floor(days / 30);
        const rest = days % 30;
        return rest ? `${months} ay ${rest} gün` : `${months} ay`;
    }

    if (days >= 1) return `${days} gün ${hours % 24} saat`;
    if (hours >= 1) return `${hours} saat ${min % 60} dk`;

    return `${Math.max(1, min)} dk`;

}

function escapeLetter(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

}

function letterTextHtml(text) {

    return escapeLetter(text).replace(/\n/g, "<br>");

}

// ── Başlatma ────────────────────────────────────────────────

function startLetters() {

    if (lettersStarted) return;

    if (!window.firebaseReady || !window.firebase?.getCurrentAuthUser?.()) {
        window.addEventListener("firebaseReady", startLetters, { once: true });
        return;
    }

    lettersStarted = true;

    window.firebase.listenLetters(items => {
        lettersAll = items;
        renderLetters();
    });

    window.firebase.listenMyLetterContents(items => {
        letterContents = Object.fromEntries(items.map(i => [i.id, i]));
        renderLetters();
    });

    // Paket (ileride Premium)
    window.firebase.getMyCoupleData?.().then(couple => {
        letterLimit = couple?.plan === "premium" ? LETTER_PREMIUM_LIMIT : LETTER_FREE_LIMIT;
        renderLetters();
    }).catch(() => {});

    // Geri sayımları güncelle
    clearInterval(letterTicker);
    letterTicker = setInterval(() => {
        if (document.getElementById("page-our-letters")?.classList.contains("active")) {
            renderLetters();
        }
    }, 30000);

}

// ── Liste ───────────────────────────────────────────────────

function renderLetters() {

    const list = document.getElementById("lettersList");

    if (!list) return;

    const myUid = lettersMyUid();

    const byNewest = (a, b) =>
        (letterMs(b.openedAt) || letterMs(b.createdAt) || 0) -
        (letterMs(a.openedAt) || letterMs(a.createdAt) || 0);

    const incoming = lettersAll
        .filter(l => l.status === "sealed" && l.authorId !== myUid)
        .sort((a, b) => (letterMs(a.openAt) || Infinity) - (letterMs(b.openAt) || Infinity));

    const mine = lettersAll
        .filter(l => l.status === "sealed" && l.authorId === myUid)
        .sort((a, b) => (realOpenAt(a) || 0) - (realOpenAt(b) || 0));

    const opened = lettersAll
        .filter(l => l.status === "open")
        .sort(byNewest);

    renderLetterComposeButton(mine.length);

    // Geri sayımı bitenleri hemen açtır (sunucu zaten dakikada bir açıyor)
    [...incoming, ...mine].forEach(l => {
        const at = realOpenAt(l);
        if (at && at <= Date.now()) requestLetterOpen(l.id);
    });

    if (lettersAll.length === 0) {

        list.innerHTML = `
            <div class="letters-empty">
                <div class="letters-empty-seal">💌</div>
                <div class="letters-empty-title">Henüz mühürlü mektup yok</div>
                <div class="letters-empty-text">
                    Bir mektup yaz, bir tarih seç. O gün gelene kadar mühürlü kalsın,
                    ${escapeLetter(letterPartnerName())} ancak o gün okuyabilsin.
                </div>
            </div>
        `;

        return;

    }

    const sections = [];

    if (incoming.length) {
        sections.push(letterSection("Seni bekleyenler", incoming.map(renderIncomingLetter)));
    }

    if (mine.length) {
        sections.push(letterSection("Senin mühürlediklerin", mine.map(renderMySealedLetter)));
    }

    if (opened.length) {
        sections.push(letterSection("Açılan mektuplar", opened.map(renderOpenedLetter)));
    }

    list.innerHTML = sections.join("");

}

function realOpenAt(letter) {

    return letterMs(letter.openAt) || letterMs(letterContents[letter.id]?.openAt);

}

function letterSection(title, cards) {

    return `
        <div class="letters-section">
            <div class="letters-section-title">${title}</div>
            ${cards.join("")}
        </div>
    `;

}

function renderLetterComposeButton(myActive) {

    const btn = document.getElementById("letterComposeBtn");
    const hint = document.getElementById("letterLimitHint");

    if (!btn || !hint) return;

    const full = myActive >= letterLimit;

    btn.classList.toggle("disabled", full);

    if (full) {

        hint.style.display = "block";
        hint.textContent = letterLimit === 1
            ? "Aynı anda 1 mühürlü mektup bırakabilirsin. Bu mektup açılınca ya da iptal edince yenisini yazabilirsin."
            : `Aynı anda ${letterLimit} mühürlü mektup bırakabilirsin.`;

    } else {

        hint.style.display = "none";

    }

}

function letterSealHtml(small = false) {

    return `
        <div class="letter-seal${small ? " small" : ""}">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M12,21.35l-1.45,-1.32C5.4,15.36 2,12.28 2,8.5 2,5.42 4.42,3 7.5,3c1.74,0 3.41,0.81 4.5,2.09C13.09,3.81 14.76,3 16.5,3 19.58,3 22,5.42 22,8.5c0,3.78 -3.4,6.86 -8.55,11.54L12,21.35z"/>
            </svg>
        </div>
    `;

}

// Partnerin mühürlü mektubu: içerik yok, sadece zarf
function renderIncomingLetter(letter) {

    const at = letterMs(letter.openAt);
    const left = at ? letterCountdown(at) : null;

    let when;

    if (letter.hideDate) {
        when = `<span class="letter-when secret">Açılış tarihi sürpriz 🤫</span>`;
    } else if (left) {
        when = `<span class="letter-when">${left} sonra açılacak</span>
                <span class="letter-sub">${letterDateText(at, true)}</span>`;
    } else {
        when = `<span class="letter-when soon">Açılıyor…</span>`;
    }

    return `
        <div class="letter-card sealed">
            ${letterSealHtml()}
            <div class="letter-card-body">
                <div class="letter-card-title">${escapeLetter(authorInfo(letter).label)}</div>
                ${when}
                <span class="letter-sub">Mühürlendi: ${letterDateText(letterMs(letter.createdAt))}</span>
            </div>
        </div>
    `;

}

// Benim mühürlü mektubum: içeriğini ben görebilirim
function renderMySealedLetter(letter) {

    const content = letterContents[letter.id] || {};
    const at = letterMs(content.openAt) || letterMs(letter.openAt);
    const left = at ? letterCountdown(at) : null;

    const preview = (content.text || "").replace(/\s+/g, " ").trim();

    return `
        <div class="letter-card mine" onclick="openLetterMenu('${letter.id}')">
            ${letterSealHtml()}
            <div class="letter-card-body">
                <div class="letter-card-title">
                    ${escapeLetter(letterPartnerName())} için
                    ${letter.hideDate ? `<span class="letter-tag">Tarih gizli</span>` : ""}
                </div>
                <span class="letter-when">${left ? `${left} sonra açılacak` : "Açılıyor…"}</span>
                <span class="letter-sub">${letterDateText(at, true)}</span>
                ${preview ? `<span class="letter-preview">${escapeLetter(preview)}</span>` : ""}
            </div>
            ${content.thumbUrl ? `<img class="letter-thumb" src="${content.thumbUrl}" loading="lazy">` : ""}
            <button class="letter-menu-btn" aria-label="Seçenekler"
                onclick="event.stopPropagation(); openLetterMenu('${letter.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>
                </svg>
            </button>
        </div>
    `;

}

function renderOpenedLetter(letter) {

    const myUid = lettersMyUid();
    const fromMe = letter.authorId === myUid;
    const unread = !fromMe && !letter.readAt;

    const preview = (letter.text || "").replace(/\s+/g, " ").trim();

    let status = "";

    if (fromMe) {
        status = letter.readAt
            ? `<span class="letter-read">Okundu ✓</span>`
            : `<span class="letter-sub">Henüz okunmadı</span>`;
    }

    return `
        <div class="letter-card opened${unread ? " unread" : ""}" onclick="openLetterReader('${letter.id}')">
            <div class="letter-paper-icon">${unread ? "💌" : "📜"}</div>
            <div class="letter-card-body">
                <div class="letter-card-title">
                    ${escapeLetter(authorInfo(letter).label)}
                    ${unread ? `<span class="letter-tag new">Yeni</span>` : ""}
                </div>
                <span class="letter-sub">Açıldı: ${letterDateText(letterMs(letter.openedAt) || letterMs(letter.openAt))}</span>
                ${preview ? `<span class="letter-preview">${unread ? "Okumak için dokun" : escapeLetter(preview)}</span>` : ""}
                ${status}
            </div>
            ${letter.thumbUrl && !unread ? `<img class="letter-thumb" src="${letter.thumbUrl}" loading="lazy">` : ""}
        </div>
    `;

}

function requestLetterOpen(id) {

    if (letterOpening.has(id)) return;

    letterOpening.add(id);

    window.firebase.openLetterNow(id)
        .catch(error => console.warn("Mektup açılamadı:", error))
        .finally(() => setTimeout(() => letterOpening.delete(id), 60000));

}

// ── Okuma ───────────────────────────────────────────────────

function openLetterReader(id) {

    const letter = lettersAll.find(l => l.id === id);

    if (!letter || letter.status !== "open") return;

    const myUid = lettersMyUid();
    const fromMe = letter.authorId === myUid;
    const firstRead = !fromMe && !letter.readAt;

    const body = document.getElementById("letterReaderBody");

    body.innerHTML = `
        <div class="letter-paper">
            <div class="letter-paper-head">
                <span>${escapeLetter(authorInfo(letter).label)}</span>
                <span>${letterDateText(letterMs(letter.createdAt))}</span>
            </div>
            ${letter.text ? `<div class="letter-paper-text">${letterTextHtml(letter.text)}</div>` : ""}
            ${letter.thumbUrl ? `
                <img class="letter-paper-photo" src="${letter.thumbUrl}"
                    onclick="openLetterPhoto('${letter.id}')">` : ""}
            <div class="letter-paper-foot">
                Açıldı: ${letterDateText(letterMs(letter.openedAt) || letterMs(letter.openAt), true)}
            </div>
        </div>
        ${firstRead ? letterSealHtml() : ""}
    `;

    const reader = document.getElementById("letterReader");

    reader.classList.toggle("breaking", firstRead);

    document.getElementById("modalOverlay").classList.add("active");
    reader.classList.add("active");

    if (firstRead) {
        window.appHaptics?.light?.();
        window.firebase.markLetterRead(id).catch(error => console.warn("Okundu işaretlenemedi:", error));
    }

}

function closeLetterReader() {

    document.getElementById("letterReader").classList.remove("active", "breaking");
    document.getElementById("modalOverlay").classList.remove("active");

}

function openLetterPhoto(id) {

    const letter = lettersAll.find(l => l.id === id);

    if (!letter) return;

    showInViewer(letter);
    document.getElementById("viewerAuthor").textContent = authorInfo(letter).label;
    document.getElementById("viewerDate").textContent = letterDateText(letterMs(letter.openedAt));
    document.getElementById("viewerText").style.display = "none";
    document.getElementById("imageViewer").style.display = "flex";

}

// ── Mühürlü mektubun menüsü ─────────────────────────────────

function openLetterMenu(id) {

    letterEditingId = id;

    document.getElementById("letterMenuOverlay").classList.add("active");
    document.getElementById("letterMenu").classList.add("active");

}

function closeLetterMenu() {

    document.getElementById("letterMenuOverlay").classList.remove("active");
    document.getElementById("letterMenu").classList.remove("active");

}

function editLetterFromMenu() {

    const id = letterEditingId;

    closeLetterMenu();
    openLetterComposer(id);

}

async function cancelLetterFromMenu() {

    const id = letterEditingId;

    closeLetterMenu();

    if (!confirm("Bu mektubu iptal etmek istiyor musun? Mektup silinecek ve geri getirilemeyecek.")) return;

    try {

        await window.firebase.deleteLetter(id);
        showToast("Mektup iptal edildi");

    } catch (error) {

        console.error(error);
        showToast(letterErrorText(error));

    }

}

// ── Yazma penceresi ─────────────────────────────────────────

function openLetterComposer(editId = null) {

    const myActive = lettersAll.filter(l => l.status === "sealed" && l.authorId === lettersMyUid()).length;

    if (!editId && myActive >= letterLimit) {
        showToast(letterLimit === 1
            ? "Aynı anda 1 mühürlü mektup bırakabilirsin 💌"
            : `Aynı anda ${letterLimit} mühürlü mektup bırakabilirsin`);
        return;
    }

    letterEditingId = editId;
    letterPhoto = null;
    letterPhotoRemoved = false;

    const content = editId ? (letterContents[editId] || {}) : {};
    const at = editId ? letterMs(content.openAt) : null;

    document.getElementById("letterModalTitle").textContent =
        editId ? "Mektubu düzenle" : "Yeni mühürlü mektup";

    document.getElementById("letterSaveBtn").textContent =
        editId ? "Kaydet" : "💌 Mühürle";

    document.getElementById("letterText").value = content.text || "";
    document.getElementById("letterHideDate").checked = content.hideDate === true;

    document.getElementById("letterHideHint").textContent =
        `${letterPartnerName()} sadece mühürlü bir mektup olduğunu görür, ne zaman açılacağını bilmez.`;

    setLetterDate(at ? new Date(at) : defaultLetterDate());

    renderLetterPhotoPreview(content.thumbUrl || null);
    updateLetterCounter();

    document.getElementById("modalOverlay").classList.add("active");
    document.getElementById("letterModal").classList.add("active");

}

function closeLetterComposer() {

    document.getElementById("letterModal").classList.remove("active");
    document.getElementById("modalOverlay").classList.remove("active");

    document.getElementById("letterPhotoInput").value = "";

    letterPhoto = null;
    letterPhotoRemoved = false;

}

// Varsayılan: yarın sabah 09:00
function defaultLetterDate() {

    const d = new Date();

    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);

    return d;

}

function pad2(n) {

    return String(n).padStart(2, "0");

}

function setLetterDate(date) {

    document.getElementById("letterDate").value =
        `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

    document.getElementById("letterTime").value =
        `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

    const today = new Date();

    document.getElementById("letterDate").min =
        `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

    updateLetterWhenHint();

}

function getLetterDate() {

    const day = document.getElementById("letterDate").value;
    const time = document.getElementById("letterTime").value || "09:00";

    if (!day) return null;

    const date = new Date(`${day}T${time}`);

    return isNaN(date) ? null : date;

}

// Hızlı seçimler
function quickLetterDate(kind) {

    const d = new Date();

    if (kind === "tomorrow") { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    if (kind === "week") { d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); }
    if (kind === "month") { d.setMonth(d.getMonth() + 1); d.setHours(9, 0, 0, 0); }
    if (kind === "year") { d.setFullYear(d.getFullYear() + 1); d.setHours(9, 0, 0, 0); }

    setLetterDate(d);

}

function updateLetterWhenHint() {

    const hint = document.getElementById("letterWhenHint");
    const date = getLetterDate();

    if (!hint) return;

    if (!date) {
        hint.textContent = "";
        return;
    }

    const left = letterCountdown(date.getTime());

    hint.textContent = left ? `${left} sonra açılacak` : "Geçmiş bir zaman seçtin";
    hint.classList.toggle("error", !left);

}

function updateLetterCounter() {

    const text = document.getElementById("letterText").value;
    const counter = document.getElementById("letterCounter");

    counter.textContent = `${text.length} / ${LETTER_MAX_LENGTH}`;
    counter.classList.toggle("error", text.length > LETTER_MAX_LENGTH);

}

function pickLetterPhoto() {

    document.getElementById("letterPhotoInput").click();

}

async function onLetterPhotoPicked(event) {

    const file = event.target.files[0];

    if (!file) return;

    try {

        letterPhoto = await prepareImage(file);
        letterPhotoRemoved = false;

        renderLetterPhotoPreview(URL.createObjectURL(letterPhoto.thumbBlob));

    } catch (error) {

        console.error(error);
        showToast("Bu fotoğraf açılamadı.");

    }

}

function removeLetterPhoto() {

    letterPhoto = null;
    letterPhotoRemoved = true;

    document.getElementById("letterPhotoInput").value = "";

    renderLetterPhotoPreview(null);

}

function renderLetterPhotoPreview(src) {

    const box = document.getElementById("letterPhotoPreview");

    if (!src) {
        box.innerHTML = "";
        box.style.display = "none";
        return;
    }

    box.style.display = "block";
    box.innerHTML = `
        <img src="${src}">
        <button class="letter-photo-remove" onclick="removeLetterPhoto()" aria-label="Fotoğrafı kaldır">✕</button>
    `;

}

async function saveLetter() {

    const btn = document.getElementById("letterSaveBtn");
    const text = document.getElementById("letterText").value.trim();
    const date = getLetterDate();
    const hideDate = document.getElementById("letterHideDate").checked;

    const editing = letterEditingId;
    const hadPhoto = editing ? !!letterContents[editing]?.thumbUrl : false;
    const willHavePhoto = !!letterPhoto || (hadPhoto && !letterPhotoRemoved);

    if (!text && !willHavePhoto) {
        showToast("Mektuba bir şeyler yaz 💌");
        return;
    }

    if (text.length > LETTER_MAX_LENGTH) {
        showToast("Mektup çok uzun.");
        return;
    }

    if (!date || date.getTime() < Date.now() + 2 * 60 * 1000) {
        showToast("Açılış zamanı en az birkaç dakika sonrası olmalı.");
        return;
    }

    const payload = {
        text,
        openAt: date.getTime(),
        hideDate,
        photo: letterPhoto || (editing && letterPhotoRemoved && hadPhoto ? "remove" : null)
    };

    btn.disabled = true;
    btn.textContent = letterPhoto ? "Fotoğraf yükleniyor…" : "Mühürleniyor…";

    try {

        if (editing) {
            await window.firebase.updateLetter(editing, payload);
            showToast("Mektup güncellendi 💌");
        } else {
            await window.firebase.sealLetter(payload);
            showToast(hideDate ? "Mektup mühürlendi 🤫" : "Mektup mühürlendi 💌");
        }

        closeLetterComposer();

    } catch (error) {

        console.error("Mektup kaydedilemedi:", error);
        showToast(letterErrorText(error));

    } finally {

        btn.disabled = false;
        btn.textContent = editing ? "Kaydet" : "💌 Mühürle";

    }

}

function letterErrorText(error) {

    const map = {
        LETTER_LIMIT: letterLimit === 1
            ? "Aynı anda 1 mühürlü mektup bırakabilirsin."
            : `Aynı anda ${letterLimit} mühürlü mektup bırakabilirsin.`,
        DATE_IN_PAST: "Açılış zamanı geçmişte olamaz.",
        DATE_TOO_FAR: "En fazla 5 yıl sonrasını seçebilirsin.",
        TEXT_TOO_LONG: "Mektup çok uzun.",
        EMPTY_LETTER: "Mektuba bir şeyler yaz 💌",
        NO_PARTNER: "Önce partnerinle bağlanmalısın.",
        ALREADY_OPEN: "Bu mektup açılmış, artık değiştirilemez.",
        LETTER_NOT_FOUND: "Mektup bulunamadı.",
        PHOTO_NOT_UPLOADED: "Fotoğraf yüklenemedi, tekrar dene."
    };

    return map[error?.message] || "Bir sorun oldu, tekrar dene.";

}

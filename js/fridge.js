// ─────────────────────────────────────────────────────────────
// Buzdolabı
//
// Ana sayfada ikinizin kısa notu, mıknatısla tutturulmuş iki kâğıt.
// Solda onunki, sağda seninki. Kâğıt renkleri temanın vurgu
// renklerinin açık tonları.
//
// • Kimse yazmadıysa: sadece küçük "📌 Buzdolabına not bırak" baloncuğu
// • Kendi kâğıdına dokun → yaz (80 karakter, hazır kısa notlar)
// • Onun kâğıdına dokun → büyük hâli + 💜 bırak (köşesine yapışır)
// • 24 saati geçen not hafifçe solar ("dün")
// • Yeni not asılınca sevgiline bildirim (functions → onFridgeWritten)
//
// Veri: fridge/{coupleId}_{uid} = { text, at, heartAt, … }
// ─────────────────────────────────────────────────────────────

const FRIDGE_MAX = 80;
const FRIDGE_QUICK = [
    "🍝 Akşam yemeği bende",
    "🛒 Eve gelirken ekmek al",
    "💜 Seni çok seviyorum",
    "😴 Bu akşam erken yatıyorum",
    "☕ Kahve içelim mi?",
    "🍿 Bu akşam film gecesi?"
];

let fridgeStarted = false;
let fridgeNotes = {};           // uid → { id, text, at, heartAt }

function fridgeMe() {
    return window.firebase?.getCurrentAuthUser?.()?.uid;
}

function fridgePartner() {
    return window.couplePartnerUid || Object.keys(fridgeNotes).find(uid => uid !== fridgeMe()) || null;
}

function fridgePartnerName() {
    const raw = typeof coupleNames !== "undefined" ? coupleNames.partner : "";
    return raw && raw !== "Ben" ? raw : "Sevgilin";
}

function fridgeHeart(uid) {
    if (typeof coupleHearts === "undefined") return "💜";
    return (uid === fridgeMe() ? coupleHearts.me : coupleHearts.partner) || "💜";
}

function fridgeEsc(v) {
    return String(v ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// "14:32", "dün 22:10", "3 gün önce"
function fridgeWhen(ms) {

    if (!ms) return "";

    const d = new Date(ms);
    const now = new Date();
    const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);

    if (days <= 0) return time;
    if (days === 1) return `dün ${time}`;

    return `${days} gün önce`;

}

function fridgeNote(uid) {
    const n = uid ? fridgeNotes[uid] : null;
    return n && String(n.text || "").trim() ? n : null;
}

// ── Başlatma ────────────────────────────────────────────────

function startFridge() {

    if (fridgeStarted) return;

    if (!window.firebaseReady || !window.firebase?.getCurrentAuthUser?.()) {
        window.addEventListener("firebaseReady", startFridge, { once: true });
        return;
    }

    fridgeStarted = true;

    renderFridge();

    window.firebase.listenFridge(notes => {

        fridgeNotes = notes || {};

        renderFridge();

        if (isSheetOpen?.("fridgeSheet") && fridgeSheetMode === "view") renderFridgeView();

    });

    // "dün" / solma güncel kalsın
    setInterval(renderFridge, 5 * 60 * 1000);

}

// ── Ana sayfa ───────────────────────────────────────────────

function fridgePaperHtml(note, uid, mine) {

    const old = Date.now() - note.at > 24 * 60 * 60 * 1000;
    const heart = note.heartAt
        ? `<span class="fridge-heart">${fridgeHeart(mine ? fridgePartner() : fridgeMe())}</span>`
        : "";

    return `
        <button type="button" class="fridge-paper ${mine ? "mine" : "theirs"}${old ? " old" : ""}"
            onclick="${mine ? "openFridgeEditor()" : "openFridgeView()"}">
            <span class="fridge-magnet"></span>
            <span class="fridge-text">${fridgeEsc(note.text)}</span>
            <small>${mine ? "Sen" : fridgeEsc(fridgePartnerName())} · ${fridgeWhen(note.at)}</small>
            ${heart}
        </button>
    `;

}

function renderFridge() {

    const box = document.getElementById("fridgeCard");

    if (!box) return;

    const me = fridgeMe();
    const partner = fridgePartner();

    // Eşleşmeden anlamı yok
    if (!partner) {
        box.innerHTML = "";
        return;
    }

    const mine = fridgeNote(me);
    const theirs = fridgeNote(partner);
    const name = fridgePartnerName();

    // Kimse yazmadı: küçük baloncuk-düğme
    if (!mine && !theirs) {
        box.innerHTML = `
            <button type="button" class="fridge-bubble" onclick="openFridgeEditor()">
                <span class="fridge-bubble-paper">📌</span>
                Buzdolabına not bırak
            </button>
        `;
        return;
    }

    box.innerHTML = `
        <div class="fridge">
            <div class="fridge-head">
                <span>📌 Buzdolabı</span>
                <small>${theirs && !theirs.heartAt ? `${fridgeEsc(typeof withGenitive === "function" ? withGenitive(name) : name)} notuna dokun, 💜 bırak` : "kendi kâğıdına dokun, yaz"}</small>
            </div>
            <div class="fridge-papers">
                ${theirs
                    ? fridgePaperHtml(theirs, partner, false)
                    : `<div class="fridge-empty theirs">${fridgeEsc(name)}<br>henüz yazmadı</div>`}
                ${mine
                    ? fridgePaperHtml(mine, me, true)
                    : `<button type="button" class="fridge-empty mine" onclick="openFridgeEditor()"><b>＋</b>Sen de yaz</button>`}
            </div>
        </div>
    `;

}

// ── Panel ───────────────────────────────────────────────────

let fridgeSheetMode = null;

function openFridgeSheet() {

    if (typeof closeSheets === "function") closeSheets("fridgeSheet");

    document.getElementById("fridgeSheet").classList.add("open");
    document.getElementById("fridgeOverlay").classList.add("open");

    if (typeof updateMissButton === "function") updateMissButton();

}

function closeFridgeSheet() {

    document.getElementById("fridgeSheet")?.classList.remove("open");
    document.getElementById("fridgeOverlay")?.classList.remove("open");

    fridgeSheetMode = null;

    if (typeof updateMissButton === "function") updateMissButton();

}

// Kendi notunu yaz / değiştir
function openFridgeEditor() {

    if (!fridgePartner()) return;

    fridgeSheetMode = "edit";

    const mine = fridgeNote(fridgeMe());
    const body = document.getElementById("fridgeSheetBody");

    body.innerHTML = `
        <div class="fridge-sheet-paper mine">
            <span class="fridge-magnet"></span>
            <textarea id="fridgeInput" maxlength="${FRIDGE_MAX}" rows="3"
                placeholder="Buzdolabına ne yazalım?"
                oninput="updateFridgeCount()">${fridgeEsc(mine?.text || "")}</textarea>
            <span class="fridge-count" id="fridgeCount"></span>
        </div>

        <div class="fridge-quick">
            ${FRIDGE_QUICK.map((t, i) => `<button type="button" onclick="useFridgeQuick(${i})">${fridgeEsc(t)}</button>`).join("")}
        </div>

        <button type="button" class="fridge-save" onclick="saveFridgeNote(this)">📌 Buzdolabına as</button>

        ${mine ? `<button type="button" class="fridge-remove" onclick="removeFridgeNote()">Notumu kaldır</button>` : ""}
    `;

    updateFridgeCount();
    openFridgeSheet();

    setTimeout(() => {
        const input = document.getElementById("fridgeInput");
        if (!input) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }, 350);

}

function updateFridgeCount() {

    const input = document.getElementById("fridgeInput");
    const count = document.getElementById("fridgeCount");

    if (input && count) count.textContent = `${input.value.length}/${FRIDGE_MAX}`;

}

function useFridgeQuick(i) {

    const input = document.getElementById("fridgeInput");

    if (!input || !FRIDGE_QUICK[i]) return;

    input.value = FRIDGE_QUICK[i];

    window.appHaptics?.light?.();

    updateFridgeCount();
    input.focus();

}

async function saveFridgeNote(button) {

    const text = String(document.getElementById("fridgeInput")?.value || "").trim();

    if (!text) {
        showToast("Bir şey yaz 💜");
        return;
    }

    button.disabled = true;

    try {

        await window.firebase.setFridgeNote(text);

        (window.appHaptics?.success || window.appHaptics?.light)?.();

        closeFridgeSheet();

        showToast("📌 Buzdolabına asıldı");

    } catch (error) {

        console.error("Not asılamadı:", error);
        showToast("Kaydedilemedi, tekrar dene.");
        button.disabled = false;

    }

}

async function removeFridgeNote() {

    try {

        await window.firebase.clearFridgeNote();

        closeFridgeSheet();

        showToast("Notun kaldırıldı");

    } catch (error) {

        console.error(error);
        showToast("Kaldırılamadı, tekrar dene.");

    }

}

// Onun notu: büyük hâli + 💜
function openFridgeView() {

    fridgeSheetMode = "view";

    renderFridgeView();
    openFridgeSheet();

}

function renderFridgeView() {

    const note = fridgeNote(fridgePartner());
    const body = document.getElementById("fridgeSheetBody");

    if (!note) {
        closeFridgeSheet();
        return;
    }

    const myHeart = fridgeHeart(fridgeMe());

    body.innerHTML = `
        <div class="fridge-sheet-paper theirs">
            <span class="fridge-magnet"></span>
            <div class="fridge-sheet-text">${fridgeEsc(note.text)}</div>
            <small>${fridgeEsc(fridgePartnerName())} · ${fridgeWhen(note.at)}</small>
            ${note.heartAt ? `<span class="fridge-heart big">${myHeart}</span>` : ""}
        </div>

        <button type="button" class="fridge-save" onclick="toggleFridgeHeart()">
            ${note.heartAt ? "Kalbi geri al" : `${myHeart} Kalp bırak`}
        </button>

        <button type="button" class="fridge-remove" onclick="openFridgeEditor()">📌 Ben de not bırakayım</button>
    `;

}

async function toggleFridgeHeart() {

    const note = fridgeNote(fridgePartner());

    if (!note) return;

    const on = !note.heartAt;

    note.heartAt = on ? Date.now() : null;

    renderFridgeView();
    renderFridge();

    if (on) (window.appHaptics?.success || window.appHaptics?.light)?.();

    try {

        await window.firebase.heartFridgeNote(note.id, on);

    } catch (error) {

        console.error(error);
        showToast("Kaydedilemedi, tekrar dene.");

    }

}

const COMPLETED_MESSAGES = [
    "✨ Birlikte Yaptık",
    "🌿 Bir Hayal Daha Gerçek Oldu",
    "💜 Anılarımıza Eklendi"
];

let currentDreams = [];

function loadDreams() {

    const list = document.getElementById("dreamsList");

    if (!window.firebaseReady) {

        list.innerHTML = "Bağlanıyor...";

        window.addEventListener(
            "firebaseReady",
            loadDreams,
            { once: true }
        );

        return;

    }

    list.innerHTML = "Yükleniyor...";

    window.firebase.listenDreams((dreams) => {

        currentDreams = dreams;

        if (dreams.length === 0) {

            list.innerHTML = `
                <div class="memories-empty">

                    ✨
                    <br><br>

                    Henüz hiç hayal eklenmedi.
                    <br>

                    İlk hayali sen ekle 💜

                </div>
            `;

            return;

        }

        const open = dreams.filter(d => !d.completed);

        const done = dreams
            .filter(d => d.completed)
            .sort((x, y) => dreamDoneMs(y) - dreamDoneMs(x));

        list.innerHTML =
            open.map(renderDreamCard).join("") +
            (done.length
                ? `<div class="dream-section-title">Gerçekleşenler · ${done.length}</div>` +
                  done.map(renderDreamCard).join("")
                : "");

    });

}

function dreamDoneMs(dream) {
    return dream.completedAt?.toMillis?.() || dream.createdAt?.toMillis?.() || 0;
}

function escapeDream(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function dreamDateText(ms) {
    if (!ms) return "";
    return new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

// Kompakt kart: emoji · başlık + not · işaret düğmesi
function renderDreamCard(dream) {

    const done = !!dream.completed;
    const note = String(dream.note || "").trim();

    const who = escapeInboxHtml(authorInfo(dream).label);

    const meta = done
        ? `${escapeDream(dream.completedMessage || "✨ Birlikte yaptık")}${dream.completedAt ? " · " + dreamDateText(dream.completedAt.toMillis?.()) : ""}`
        : who;

    return `
        <div class="dream-card${done ? " done" : ""}" onclick="toggleDreamNote(this)">

            <div class="dream-emoji${emojiCountClass(dream.emoji)}">${escapeDream(dream.emoji || "✨")}</div>

            <div class="dream-body">
                <div class="dream-title">${escapeDream(dream.title)}</div>
                ${note ? `<div class="dream-note">${formatMemoryText(escapeDream(note))}</div>` : ""}
                <div class="dream-meta">${meta}</div>
            </div>

            <button
                class="dream-check"
                type="button"
                aria-label="${done ? "Gerçekleşmedi olarak işaretle" : "Gerçekleşti olarak işaretle"}"
                onclick="event.stopPropagation(); toggleDreamCompleted('${dream.id}', ${!done})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
            </button>

            <button
                class="dream-more"
                type="button"
                aria-label="Seçenekler"
                onclick="openDreamMenu(event, '${dream.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
            </button>

        </div>
    `;

}

// Birden fazla emoji yazıldıysa kutuya sığsın diye küçült
function emojiCountClass(emoji) {

    const text = String(emoji || "");

    const count = typeof Intl !== "undefined" && Intl.Segmenter
        ? [...new Intl.Segmenter("tr", { granularity: "grapheme" }).segment(text)].length
        : Array.from(text).length;

    if (count >= 3) return " many";
    if (count === 2) return " two";

    return "";

}

// Uzun not iki satırda kısalır; karta dokununca tamamı açılır
function toggleDreamNote(card) {
    if (card.querySelector(".dream-note")) card.classList.toggle("expanded");
}

function openDreamForm() {

    const form = document.getElementById("dreamForm");
    const container = document.getElementById("dreamFormContainer");

    container.appendChild(form);

    form.style.display = "block";

    document.getElementById("modalOverlay").classList.add("active");
    document.getElementById("dreamModal").classList.add("active");

}

function closeDreamForm() {

    document.getElementById("modalOverlay").classList.remove("active");
    document.getElementById("dreamModal").classList.remove("active");

    resetDreamForm();

}

function resetDreamForm() {

    document.getElementById("dreamEmoji").value = "";
    document.getElementById("dreamTitle").value = "";
    document.getElementById("dreamNote").value = "";

}

async function saveDream() {

    const emoji =
        document.getElementById("dreamEmoji").value.trim();

    const title =
        document.getElementById("dreamTitle").value.trim();

    const note =
        document.getElementById("dreamNote").value.trim();

    if (!title) {

        showToast("Hayalini yazmayı unutma 💜");
        return;

    }

    try {

        await window.firebase.addDream({

            emoji: emoji || "✨",

            title,

            note,

            completed: false

        });

        closeDreamForm();

        showToast("✨ Yeni hayal eklendi");

    } catch (e) {

        console.error(e);

        showToast("Bir hata oluştu");

    }

}

async function toggleDreamCompleted(id, completed) {

    let data = {
        completed,
        completedAt: completed ? new Date() : null
    };

    if (completed) {

        const message =
            COMPLETED_MESSAGES[
                Math.floor(
                    Math.random() * COMPLETED_MESSAGES.length
                )
            ];

        data.completedMessage = message;

        showToast("🎉 Bir hayal daha gerçek oldu!");

    } else {

        data.completedMessage = "";

    }

    await window.firebase.updateDream(id, data);

}

function openDreamMenu(event, dreamId) {

    event.stopPropagation();

    openActionMenu("dream", dreamId);

}
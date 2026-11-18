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

        // Boşken üstteki "Yeni …" düğmesi gizlenir, boş ekranın düğmesi yeter
        document.getElementById("page-our-dreams")?.classList.toggle("page-empty", dreams.length === 0);

        if (typeof renderBizInfo === "function" && typeof guideSummary !== "undefined" && guideSummary) {
            guideSummary.dreams = dreams.length;
            guideSummary.dreamsDone = dreams.filter(d => d.completed).length;
            renderBizInfo();
        }

        if (dreams.length === 0) {

            list.innerHTML = emptyDreamsHtml();

            return;

        }

        const open = dreams.filter(d => !d.completed);

        const done = dreams
            .filter(d => d.completed)
            .sort((x, y) => dreamDoneMs(y) - dreamDoneMs(x));

        // Yer değiştiren kartlar zıplamasın, akarak yeni yerine gitsin
        const before = measureDreamCards(list);

        list.innerHTML =
            open.map(renderDreamCard).join("") +
            (done.length
                ? `<div class="dream-section-title" data-id="__done">Gerçekleşenler · ${done.length}</div>` +
                  done.map(renderDreamCard).join("")
                : "");

        animateDreamCards(list, before);

        dreamMovedId = null;

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
        <div class="dream-card${done ? " done" : ""}${dream.id === dreamMovedId ? " moved" : ""}" data-id="${dream.id}" onclick="toggleDreamNote(this)">

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
                onclick="event.stopPropagation(); toggleDreamCompleted('${dream.id}', ${!done}, this)">
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

// ── Akıcı yer değiştirme (FLIP) ─────────────────────────────

const DREAM_MOVE_MS = 460;
const DREAM_EASE = "cubic-bezier(.22,.8,.24,1)";

function measureDreamCards(list) {

    const map = {};

    list.querySelectorAll("[data-id]").forEach(el => {
        map[el.dataset.id] = el.getBoundingClientRect().top;
    });

    return map;

}

function animateDreamCards(list, before) {

    if (!Object.keys(before).length || !list.animate) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    list.querySelectorAll("[data-id]").forEach(el => {

        const id = el.dataset.id;

        if (!(id in before)) {
            // Yeni beliren (ör. "Gerçekleşenler" başlığı)
            el.animate(
                [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
                { duration: 320, easing: DREAM_EASE, delay: 120, fill: "backwards" }
            );
            return;
        }

        const dy = before[id] - el.getBoundingClientRect().top;

        if (Math.abs(dy) < 1) return;

        const moving = el.classList.contains("moved");

        el.animate(
            moving
                ? [
                    { transform: `translateY(${dy}px) scale(1)`, zIndex: 2 },
                    { transform: `translateY(${dy * 0.5}px) scale(1.025)`, zIndex: 2, offset: 0.45 },
                    { transform: "none", zIndex: 2 }
                  ]
                : [{ transform: `translateY(${dy}px)` }, { transform: "none" }],
            { duration: DREAM_MOVE_MS, easing: DREAM_EASE }
        );

    });

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

let dreamMovedId = null;

async function toggleDreamCompleted(id, completed, button) {

    const card = button?.closest(".dream-card");

    if (card) {

        if (card.dataset.busy) return;
        card.dataset.busy = "1";

        // 1) Halka hemen dolsun / boşalsın
        card.classList.toggle("done", completed);
        card.classList.add(completed ? "just-done" : "just-undone");

        if (completed) window.appHaptics?.light?.();

        // 2) Dolma animasyonu görünsün, sonra kart yerine aksın
        await new Promise(resolve => setTimeout(resolve, 280));

    }

    dreamMovedId = id;

    const data = {
        completed,
        completedAt: completed ? new Date() : null,
        completedMessage: completed
            ? COMPLETED_MESSAGES[Math.floor(Math.random() * COMPLETED_MESSAGES.length)]
            : ""
    };

    try {

        await window.firebase.updateDream(id, data);

        if (completed) showToast("🎉 Bir hayal daha gerçek oldu!");

    } catch (error) {

        console.error(error);

        showToast("Kaydedilemedi, tekrar dene.");

        if (card) {
            card.classList.toggle("done", !completed);
            delete card.dataset.busy;
        }

    }

}

function openDreamMenu(event, dreamId) {

    event.stopPropagation();

    openActionMenu("dream", dreamId);

}
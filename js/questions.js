// ─────────────────────────────────────────────────────────────
// Günün Sorusu
//
// Her gün ikinize aynı soru gelir. Cevabını yazarsın ama
// partnerinin cevabını göremezsin; ikiniz de cevaplayınca iki
// cevap birlikte açılır. Kilit sunucuda (functions/index.js).
//
// • Ana sayfada bugünün sorusu (#questionCard)
// • Biz → Günün Sorusu: bütün sorular ve cevaplar; geçmiş günler
//   sonradan da cevaplanabilir
// • Açılmış cevaplara tepki (❤️ 😂 😮 🥺 🔥 👏)
// • Kendi sorunu ekleme: Premium
// ─────────────────────────────────────────────────────────────

// Sunucuyla aynı gün sınırı (functions/index.js → QUESTION_TIMEZONE)
const QUESTION_TIMEZONE = "Europe/Istanbul";
const QUESTION_ANSWER_MAX = 1000;
const QUESTION_REACTION_LIST = ["❤️", "😂", "😮", "🥺", "🔥", "👏"];

const QUESTION_CATEGORY = {
    fun: "😄 Eğlenceli",
    deep: "🌙 Derin",
    memories: "📸 Anılar",
    future: "🔭 Gelecek",
    whatIf: "✨ Ya şöyle olsaydı",
    choice: "⚖️ Bu mu şu mu",
    custom: "👑 Sizin sorunuz"
};

let questionsStarted = false;
let questionsAll = [];
let questionMyAnswers = {};       // gün → cevap
let questionEditing = new Set();  // düzenlenen günler
let questionSending = new Set();
let questionEnsuredDay = null;
let questionPlan = "free";
let questionModalDay = null;

// ── Yardımcılar ─────────────────────────────────────────────

function questionToday() {

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: QUESTION_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());

}

function questionDayText(day) {

    const [y, m, d] = day.split("-").map(Number);
    const date = new Date(y, m - 1, d);

    const today = questionToday();

    if (day === today) return "Bugün";

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    if (day === yKey) return "Dün";

    return date.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        ...(y !== new Date().getFullYear() ? { year: "numeric" } : {})
    });

}

function questionMyUid() {

    return window.firebase?.getCurrentAuthUser?.()?.uid;

}

function questionNames() {

    const me = (typeof coupleNames !== "undefined" && coupleNames.me) || "Sen";
    const raw = (typeof coupleNames !== "undefined" && coupleNames.partner) || "";

    return { me, partner: raw && raw !== "Ben" ? raw : "Sevgilin" };

}

function escapeQuestion(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

}

function questionTextHtml(text) {

    return escapeQuestion(text).replace(/\n/g, "<br>");

}

function questionByDay(day) {

    return questionsAll.find(q => q.day === day);

}

// ── Başlatma ────────────────────────────────────────────────

function startQuestions() {

    if (questionsStarted) return;

    if (!window.firebaseReady || !window.firebase?.getCurrentAuthUser?.()) {
        window.addEventListener("firebaseReady", startQuestions, { once: true });
        return;
    }

    questionsStarted = true;

    let firstLoad = true;

    window.firebase.listenQuestions(items => {

        questionsAll = items;

        renderQuestionViews();

        if (firstLoad) {
            firstLoad = false;
            ensureTodayQuestionOnce();
        }

    });

    window.firebase.listenMyAnswers(items => {

        questionMyAnswers = Object.fromEntries(items.map(a => [a.day, a]));

        renderQuestionViews();

    });

    window.firebase.getMyCoupleData?.().then(couple => {
        questionPlan = couple?.plan === "premium" ? "premium" : "free";
    }).catch(() => {});

    // Uygulama gece yarısını geçerek açık kaldıysa yeni günün sorusu
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            ensureTodayQuestionOnce();
            renderQuestionViews();
        }
    });

}

// Bugünün sorusu yoksa sunucudan iste (gün başına bir kez)
async function ensureTodayQuestionOnce() {

    const today = questionToday();

    if (questionEnsuredDay === today) return;
    if (questionByDay(today)) {
        questionEnsuredDay = today;
        return;
    }

    questionEnsuredDay = today;

    try {
        await window.firebase.ensureTodayQuestion();
    } catch (error) {
        console.warn("Günün sorusu alınamadı:", error);
        questionEnsuredDay = null;
    }

}

function renderQuestionViews() {

    renderQuestionCard();
    renderQuestionArchive();

    if (questionModalDay) renderQuestionModal();

}

// ── Bir sorunun gövdesi (ana sayfa kartı ve pencere ortak) ──

function questionBodyHtml(q, ctx) {

    const myUid = questionMyUid();
    const { me, partner } = questionNames();

    const mine = questionMyAnswers[q.day];
    const answeredBy = q.answeredBy || [];
    const partnerAnswered = answeredBy.some(uid => uid !== myUid);
    const editing = questionEditing.has(q.day);
    const sending = questionSending.has(q.day);

    const inputId = `qa-${ctx}-${q.day}`;

    const head = `
        <div class="question-category">${QUESTION_CATEGORY[q.category] || ""}</div>
        <div class="question-text">${escapeQuestion(q.text)}</div>
    `;

    // 1) İkisi de cevapladı: açıldı
    if (q.revealed) {

        const answers = q.answers || {};
        const partnerId = Object.keys(answers).find(uid => uid !== myUid);
        const reactions = q.reactions || {};

        const myReaction = reactions[myUid];
        const theirReaction = partnerId ? reactions[partnerId] : null;

        return `
            ${head}
            <div class="question-answers">
                <div class="question-answer mine">
                    <div class="question-answer-name">💙 ${escapeQuestion(me)}</div>
                    <div class="question-answer-text">${questionTextHtml(answers[myUid]?.text || mine?.text || "")}</div>
                    ${theirReaction ? `<div class="question-answer-reaction">${theirReaction}</div>` : ""}
                </div>
                <div class="question-answer theirs">
                    <div class="question-answer-name">💗 ${escapeQuestion(partner)}</div>
                    <div class="question-answer-text">${questionTextHtml(partnerId ? answers[partnerId]?.text : "")}</div>
                    ${myReaction ? `<div class="question-answer-reaction">${myReaction}</div>` : ""}
                </div>
            </div>
            <div class="question-react">
                ${QUESTION_REACTION_LIST.map(emoji => `
                    <button class="${myReaction === emoji ? "active" : ""}"
                        onclick="reactQuestion('${q.id}', '${emoji}')">${emoji}</button>
                `).join("")}
            </div>
        `;

    }

    // 2) Ben cevapladım, partner bekleniyor
    if (mine && !editing) {

        return `
            ${head}
            <div class="question-answer mine solo">
                <div class="question-answer-name">💙 Senin cevabın</div>
                <div class="question-answer-text">${questionTextHtml(mine.text)}</div>
            </div>
            <div class="question-lock">
                🔒 ${escapeQuestion(partner)} cevaplayınca ikiniz de göreceksiniz
            </div>
            <button class="question-link" onclick="editQuestionAnswer('${q.day}')">Cevabımı düzenle</button>
        `;

    }

    // 3) Henüz cevaplamadım (ya da düzenliyorum)
    return `
        ${head}
        ${partnerAnswered && !mine ? `
            <div class="question-waiting">👀 ${escapeQuestion(partner)} cevapladı, seninkini bekliyor</div>
        ` : ""}
        <textarea
            id="${inputId}"
            class="question-input"
            maxlength="${QUESTION_ANSWER_MAX}"
            rows="3"
            placeholder="Cevabını yaz… İkiniz de cevaplayınca açılacak"
        >${editing && mine ? escapeQuestion(mine.text) : ""}</textarea>
        <div class="question-actions">
            ${editing ? `<button class="question-link" onclick="cancelQuestionEdit('${q.day}')">Vazgeç</button>` : "<span></span>"}
            <button class="question-send" ${sending ? "disabled" : ""}
                onclick="submitQuestionAnswer('${q.day}', '${ctx}')">
                ${sending ? "Gönderiliyor…" : (editing ? "Kaydet" : "Gönder")}
            </button>
        </div>
    `;

}

// ── Ana sayfa kartı ─────────────────────────────────────────

function renderQuestionCard() {

    const card = document.getElementById("questionCard");
    const body = document.getElementById("questionCardBody");

    if (!card || !body) return;

    const q = questionByDay(questionToday());

    if (!q) {
        card.style.display = "none";
        return;
    }

    // Yazarken liste yenilenirse yazılanı kaybetme
    const input = document.getElementById(`qa-home-${q.day}`);
    const draft = input && document.activeElement === input ? input.value : null;

    if (draft !== null) return;

    card.style.display = "block";
    body.innerHTML = questionBodyHtml(q, "home");

}

// ── Cevap gönder / düzenle ──────────────────────────────────

async function submitQuestionAnswer(day, ctx) {

    const input = document.getElementById(`qa-${ctx}-${day}`);
    const text = input?.value.trim() || "";

    if (!text) {
        showToast("Bir şeyler yaz 💬");
        return;
    }

    questionSending.add(day);
    renderQuestionViews();

    try {

        const result = await window.firebase.answerQuestion(day, text);

        questionEditing.delete(day);

        window.appHaptics?.light?.();

        showToast(result?.revealed ? "Cevaplarınız açıldı! 💞" : "Cevabın kaydedildi 🔒");

    } catch (error) {

        console.error("Cevap gönderilemedi:", error);

        const map = {
            ALREADY_REVEALED: "Cevaplar açıldı, artık değiştirilemez.",
            TEXT_TOO_LONG: "Cevap çok uzun.",
            EMPTY_ANSWER: "Bir şeyler yaz 💬"
        };

        showToast(map[error?.message] || "Gönderilemedi, tekrar dene.");

        // Yazılanı geri koy
        questionSending.delete(day);
        renderQuestionViews();

        const again = document.getElementById(`qa-${ctx}-${day}`);
        if (again) again.value = text;

        return;

    }

    questionSending.delete(day);
    renderQuestionViews();

}

function editQuestionAnswer(day) {

    questionEditing.add(day);
    renderQuestionViews();

}

function cancelQuestionEdit(day) {

    questionEditing.delete(day);
    renderQuestionViews();

}

async function reactQuestion(id, emoji) {

    const q = questionsAll.find(x => x.id === id);
    const current = q?.reactions?.[questionMyUid()];

    try {
        await window.firebase.reactToQuestion(id, current === emoji ? null : emoji);
        window.appHaptics?.light?.();
    } catch (error) {
        console.error("Tepki bırakılamadı:", error);
        showToast("Tepki bırakılamadı.");
    }

}

// ── Arşiv sayfası ───────────────────────────────────────────

function renderQuestionArchive() {

    const list = document.getElementById("questionsList");

    if (!list) return;

    const myUid = questionMyUid();
    const { partner } = questionNames();

    const sorted = [...questionsAll].sort((a, b) => b.day.localeCompare(a.day));

    if (sorted.length === 0) {

        list.innerHTML = `
            <div class="letters-empty">
                <div class="letters-empty-seal">💬</div>
                <div class="letters-empty-title">İlk soru yolda</div>
                <div class="letters-empty-text">Her gün ikinize yeni bir soru gelecek.</div>
            </div>
        `;

        return;

    }

    list.innerHTML = sorted.map(q => {

        const mine = !!questionMyAnswers[q.day];
        const partnerAnswered = (q.answeredBy || []).some(uid => uid !== myUid);

        let status;

        if (q.revealed) status = `<span class="question-chip open">Açıldı</span>`;
        else if (mine) status = `<span class="question-chip">🔒 ${escapeQuestion(partner)} bekleniyor</span>`;
        else if (partnerAnswered) status = `<span class="question-chip waiting">👀 Seni bekliyor</span>`;
        else status = `<span class="question-chip">Cevaplanmadı</span>`;

        return `
            <div class="question-row" onclick="openQuestionModal('${q.day}')">
                <div class="question-row-top">
                    <span class="question-row-day">${questionDayText(q.day)}</span>
                    ${status}
                </div>
                <div class="question-row-text">${escapeQuestion(q.text)}</div>
            </div>
        `;

    }).join("");

}

// ── Soru penceresi (arşivden) ───────────────────────────────

function openQuestionModal(day) {

    questionModalDay = day;

    renderQuestionModal();

    document.getElementById("modalOverlay").classList.add("active");
    document.getElementById("questionModal").classList.add("active");

}

function renderQuestionModal() {

    const q = questionByDay(questionModalDay);
    const body = document.getElementById("questionModalBody");

    if (!q || !body) return;

    const input = document.getElementById(`qa-modal-${q.day}`);

    if (input && document.activeElement === input) return;

    document.getElementById("questionModalDay").textContent = questionDayText(q.day);

    body.innerHTML = questionBodyHtml(q, "modal");

}

function closeQuestionModal() {

    questionModalDay = null;

    document.getElementById("questionModal").classList.remove("active");
    document.getElementById("modalOverlay").classList.remove("active");

}

// ── Kendi sorunu ekle (Premium) ─────────────────────────────

function openCustomQuestion() {

    if (questionPlan !== "premium") {
        showToast("👑 Kendi sorularınızı eklemek Premium özelliği");
        return;
    }

    document.getElementById("customQuestionText").value = "";
    document.getElementById("modalOverlay").classList.add("active");
    document.getElementById("customQuestionModal").classList.add("active");

}

function closeCustomQuestion() {

    document.getElementById("customQuestionModal").classList.remove("active");
    document.getElementById("modalOverlay").classList.remove("active");

}

async function saveCustomQuestion() {

    const text = document.getElementById("customQuestionText").value.trim();

    if (text.length < 5) {
        showToast("Soru biraz daha uzun olmalı.");
        return;
    }

    try {

        const result = await window.firebase.addCustomQuestion(text);

        closeCustomQuestion();

        showToast(result?.position === 1
            ? "Sorun yarın ikinize gelecek 👑"
            : `Sorun sıraya eklendi (${result.position}. sırada) 👑`);

    } catch (error) {

        const map = {
            PREMIUM_REQUIRED: "👑 Bu bir Premium özelliği",
            QUEUE_FULL: "Sırada çok soru var, biraz bekle.",
            TOO_SHORT: "Soru biraz daha uzun olmalı.",
            TEXT_TOO_LONG: "Soru çok uzun."
        };

        showToast(map[error?.message] || "Soru eklenemedi.");

    }

}

// ─────────────────────────────────────────────────────────────
// Ona hatırlat
//
// Sevgiline bir hatırlatma kurarsın ("İlacını iç", "Diş randevun").
// Saati gelince sunucu onun telefonuna "💗 Berk hatırlatıyor"
// bildirimi gönderir (functions → fireReminders). O "✓ Yaptım"
// deyince sana haber gelir; istersen kısa bir teşekkür de yazar.
//
// • Ana sayfa: sadece BUGÜN sana kurulmuş bir hatırlatma varsa
//   küçük bir şerit (yoksa hiç görünmez).
// • Biz → Hatırlatmalar: "Ona kurduklarım" / "Bana kurulanlar".
// • Kuran düzenler/siler; hatırlatılan "yaptım", "10 dk sonra"
//   ve sessize alma yapabilir.
// • Ücretsiz: tek seferlikler sınırsız, tekrarlayan (her gün /
//   her hafta) aynı anda en fazla 3. Premium'da sınırsız.
//
// Veri: reminders/{id} (alanlar için functions/index.js başı)
// ─────────────────────────────────────────────────────────────

const REM_FREE_RECURRING = 3;
const REM_HOUR = 60 * 60 * 1000;
const REM_DAY = 24 * REM_HOUR;

const REM_PRESETS = [
    { emoji: "💊", label: "İlaç",       title: "İlacını içmeyi unutma" },
    { emoji: "🦷", label: "Randevu",    title: "Randevunu unutma" },
    { emoji: "💧", label: "Su",         title: "Bir bardak su iç" },
    { emoji: "🧾", label: "Fatura",     title: "Faturayı ödemeyi unutma" },
    { emoji: "🎂", label: "Doğum günü", title: "Doğum gününü kutlamayı unutma" },
    { emoji: "🛒", label: "Al",         title: "Eve gelirken ekmek al" },
    { emoji: "📞", label: "Ara",        title: "Anneni aramayı unutma" },
    { emoji: "🏃", label: "Spor",       title: "Spora gitmeyi unutma" }
];

const REM_EMOJIS = ["⏰", "💊", "🦷", "💧", "🧾", "🎂", "🛒", "📞", "🏃", "🐾", "🌱", "🚗", "📚", "💜"];

let remStarted = false;
let remList = [];
let remUnsub = null;
let remTab = "theirs";          // "theirs": ona kurduklarım, "mine": bana kurulanlar
let remSheetMode = null;        // "create" | "edit" | "detail"
let remSheetId = null;
let remDraft = null;

// ── Yardımcılar ─────────────────────────────────────────────

function remMe() {
    return window.firebase?.getCurrentAuthUser?.()?.uid;
}

function remPartnerUid() {
    return window.couplePartnerUid || null;
}

function remPartnerName() {
    const raw = typeof coupleNames !== "undefined" ? coupleNames.partner : "";
    return raw && raw !== "Ben" ? raw : "Sevgilin";
}

// "Dilara" → "Dilara'ya", "Berk" → "Berk'e"
function remDative(name) {

    const n = String(name || "").trim();
    const lower = n.toLocaleLowerCase("tr-TR");
    const vowels = lower.match(/[aeıioöuü]/g);
    const last = vowels ? vowels[vowels.length - 1] : "e";
    const back = "aıou".includes(last);
    const endsVowel = /[aeıioöuü]$/.test(lower);

    return `${n}'${endsVowel ? "y" : ""}${back ? "a" : "e"}`;

}

function remNameOf(uid) {
    return uid === remMe() ? "Sen" : remPartnerName();
}

function remHeartOf(uid) {
    if (typeof coupleHearts === "undefined") return "💗";
    return (uid === remMe() ? coupleHearts.me : coupleHearts.partner) || "💗";
}

function remEsc(v) {
    return String(v ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function remSameDay(a, b) {
    if (!a || !b) return false;
    const x = new Date(a), y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

function remTime(ms) {
    return new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

// "Bugün 21:00", "Yarın 09:30", "Pazar 10:00", "12 Ara 10:00"
function remWhen(ms) {

    if (!ms) return "";

    const now = Date.now();
    const time = remTime(ms);

    if (remSameDay(ms, now)) return `Bugün ${time}`;
    if (remSameDay(ms, now + REM_DAY)) return `Yarın ${time}`;
    if (remSameDay(ms, now - REM_DAY)) return `Dün ${time}`;

    if (ms > now && ms - now < 6 * REM_DAY) {
        const day = new Date(ms).toLocaleDateString("tr-TR", { weekday: "long" });
        return `${day[0].toLocaleUpperCase("tr-TR")}${day.slice(1)} ${time}`;
    }

    return new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) + ` ${time}`;

}

// "25 dk sonra", "2 sa önce"
function remRelative(ms) {

    const diff = ms - Date.now();
    const abs = Math.abs(diff);
    const word = diff >= 0 ? "sonra" : "önce";

    if (abs < 60 * 1000) return diff >= 0 ? "şimdi" : "az önce";
    if (abs < REM_HOUR) return `${Math.round(abs / 60000)} dk ${word}`;

    return `${Math.round(abs / REM_HOUR)} sa ${word}`;

}

function remRepeatText(r, at) {

    if (r.repeat === "daily") return `Her gün ${remTime(at)}`;

    if (r.repeat === "weekly") {
        const day = new Date(at).toLocaleDateString("tr-TR", { weekday: "long" });
        return `Her ${day} ${remTime(at)}`;
    }

    return "";

}

function remDueAt(r) {

    const times = [r.nextAt, !r.earlySent ? r.earlyAt : null, r.snoozeUntil]
        .filter(t => typeof t === "number" && t > 0);

    return times.length ? Math.min(...times) : null;

}

// Bu hatırlatmanın şu anki durumu
//   pending   saati geldi, bugün çaldı, henüz yapılmadı
//   upcoming  bugün içinde çalacak (önceden "yaptım" denebilir)
//   done      bugünkü yapıldı
function remState(r) {

    const now = Date.now();

    if (r.lastAt && r.doneFor !== r.lastAt && remSameDay(r.lastAt, now)) {
        return { kind: "pending", at: r.lastAt };
    }

    if (r.doneFor && r.doneAt && remSameDay(r.doneAt, now)) {
        return { kind: "done", at: r.doneFor };
    }

    if (r.nextAt && r.doneFor !== r.nextAt && remSameDay(r.nextAt, now)) {
        return { kind: "upcoming", at: r.nextAt };
    }

    return { kind: r.nextAt ? "later" : "past", at: r.nextAt || r.lastAt };

}

function remSortKey(r) {

    const s = remState(r);
    const order = { pending: 0, upcoming: 1, done: 2, later: 3, past: 4 };

    return order[s.kind] * 1e14 + (s.kind === "past" ? -(s.at || 0) : (s.at || 0));

}

// ── Başlatma ────────────────────────────────────────────────

function startReminders() {

    if (remStarted) return;

    if (!window.firebaseReady || !window.firebase?.getCurrentAuthUser?.()) {
        window.addEventListener("firebaseReady", startReminders, { once: true });
        return;
    }

    remStarted = true;

    remUnsub = window.firebase.listenReminders(list => {

        remList = list || [];

        renderReminders();

    });

    // "25 dk sonra" yazıları güncel kalsın
    setInterval(renderReminders, 60 * 1000);

}

function renderReminders() {

    renderReminderStrip();
    renderReminderPage();
    renderReminderBiz();

    if (remSheetMode && remSheetMode !== "create" && isSheetOpen?.("reminderSheet")) {
        const r = remList.find(x => x.id === remSheetId);
        if (!r) closeReminderSheet();
        else if (remSheetMode === "detail") renderReminderDetail(r);
    }

}

// ── Ana sayfa şeridi ────────────────────────────────────────

function renderReminderStrip() {

    const box = document.getElementById("reminderStrip");

    if (!box) return;

    const me = remMe();
    const now = Date.now();

    // Bana kurulmuş, bugün bekleyen ya da bugün çalacak olanlar
    const items = remList
        .filter(r => r.targetId === me && !r.muted)
        .map(r => ({ r, s: remState(r) }))
        .filter(({ s }) => s.kind === "pending" || (s.kind === "upcoming" && s.at - now < 12 * REM_HOUR))
        .sort((a, b) => remSortKey(a.r) - remSortKey(b.r));

    if (!items.length) {
        box.style.display = "none";
        box.innerHTML = "";
        return;
    }

    const { r, s } = items[0];
    const more = items.length - 1;

    box.style.display = "";
    box.innerHTML = `
        <div class="rem-strip${s.kind === "pending" ? " pending" : ""}" onclick="openReminderDetail('${r.id}')">
            <span class="rem-ico">${remEsc(r.emoji || "⏰")}</span>
            <span class="rem-strip-text">
                <b>${remEsc(r.title)} · ${remTime(s.at)}</b>
                <small>${remHeartOf(r.authorId)} ${remEsc(remNameOf(r.authorId))} · ${remRelative(s.at)}${more ? ` · +${more}` : ""}</small>
            </span>
            <button class="rem-done-btn" type="button" onclick="event.stopPropagation(); markReminderDone('${r.id}')">✓ Tamam</button>
        </div>
    `;

}

// ── Biz kartı ───────────────────────────────────────────────

function renderReminderBiz() {

    if (typeof setBizInfo !== "function") return;

    const me = remMe();
    const today = remList.filter(r => ["pending", "upcoming", "done"].includes(remState(r).kind));
    const waiting = remList.filter(r => r.targetId === me && remState(r).kind === "pending").length;

    setBizInfo(
        "our-reminders",
        today.length ? `Bugün ${today.length} hatırlatma` : remPartnerUid() ? "＋ Ona bir şey hatırlat" : "",
        waiting ? { text: `${waiting} bekliyor` } : null,
        !remList.length
    );

}

// ── Sayfa ───────────────────────────────────────────────────

function setReminderTab(tab) {

    remTab = tab;

    window.appHaptics?.light?.();

    renderReminderPage();

}

function renderReminderPage() {

    const box = document.getElementById("reminderList");
    const tabs = document.getElementById("reminderTabs");

    if (!box || !tabs) return;

    const me = remMe();
    const partner = remPartnerName();

    if (!remPartnerUid()) {
        tabs.innerHTML = "";
        box.innerHTML = `
            <div class="empty-guide">
                <div class="empty-guide-icon">⏰</div>
                <div class="empty-guide-title">Sevgilin katılınca</div>
                <div class="empty-guide-text">Ona ilacını, randevusunu, su içmeyi hatırlatabileceksin. Saati gelince telefonuna senden bir hatırlatma gider.</div>
            </div>
        `;
        return;
    }

    const mine = remList.filter(r => r.targetId === me);
    const theirs = remList.filter(r => r.authorId === me);
    const waiting = mine.filter(r => remState(r).kind === "pending").length;

    tabs.innerHTML = `
        <button type="button" class="${remTab === "theirs" ? "active" : ""}" onclick="setReminderTab('theirs')">${remEsc(remDative(partner))} kurduklarım</button>
        <button type="button" class="${remTab === "mine" ? "active" : ""}" onclick="setReminderTab('mine')">Bana kurulanlar${waiting ? ` <i>${waiting}</i>` : mine.length ? ` · ${mine.length}` : ""}</button>
    `;

    const list = (remTab === "mine" ? mine : theirs).slice().sort((a, b) => remSortKey(a) - remSortKey(b));

    if (!list.length) {
        box.innerHTML = remTab === "mine"
            ? `<div class="rem-empty">💜 ${remEsc(partner)} sana bir hatırlatma kurunca burada görünecek.</div>`
            : `<div class="rem-empty">Ona ilacını, randevusunu ya da su içmeyi hatırlat.<br>Saati gelince telefonuna senden bir bildirim gider 💜</div>`;
        return;
    }

    const groups = [
        ["Bugün", list.filter(r => ["pending", "upcoming", "done"].includes(remState(r).kind))],
        ["Yaklaşan", list.filter(r => remState(r).kind === "later")],
        ["Geçmiş", list.filter(r => remState(r).kind === "past").slice(0, 10)]
    ];

    box.innerHTML = groups
        .filter(([, items]) => items.length)
        .map(([title, items]) => `
            <div class="rem-section">${title}</div>
            ${items.map(r => reminderItemHtml(r)).join("")}
        `).join("");

}

function reminderItemHtml(r) {

    const me = remMe();
    const s = remState(r);
    const authored = r.authorId === me;
    const other = remPartnerName();

    const when = r.repeat !== "once" && r.nextAt
        ? remRepeatText(r, r.nextAt)
        : remWhen(s.at || r.nextAt || r.lastAt);

    let status = "";

    if (s.kind === "done") {
        status = `<span class="rem-status ok">✓ ${authored ? `${remEsc(other)} yaptı` : "Yaptın"} · ${remTime(r.doneAt)}${r.thanks ? ` · “${remEsc(r.thanks)}”` : ""}</span>`;
    } else if (s.kind === "pending") {
        status = Date.now() - s.at > REM_HOUR
            ? `<span class="rem-status wait">⏳ Henüz yapılmadı</span>`
            : `<span class="rem-status">🔔 Hatırlatıldı · ${remTime(s.at)}</span>`;
    } else if (s.kind === "past" && r.doneFor) {
        status = `<span class="rem-status ok">✓ Yapıldı</span>`;
    }

    if (r.muted) {
        status += `<span class="rem-status muted">🔕 ${authored ? "Sessize aldı" : "Sessize aldın"}</span>`;
    }

    return `
        <button type="button" class="rem-item${s.kind === "past" ? " past" : ""}${s.kind === "pending" ? " pending" : ""}"
            onclick="${authored ? `openReminderEdit('${r.id}')` : `openReminderDetail('${r.id}')`}">
            <span class="rem-ico">${remEsc(r.emoji || "⏰")}</span>
            <span class="rem-item-text">
                <b>${remEsc(r.title)}</b>
                <small>${when}${r.repeat !== "once" ? " · 🔁" : ""}${r.dayBefore && r.repeat === "once" ? " · 1 gün önce de" : ""}</small>
                ${status}
            </span>
            ${!authored && (s.kind === "pending" || s.kind === "upcoming")
                ? `<span class="rem-done-btn" onclick="event.stopPropagation(); markReminderDone('${r.id}')">✓ Tamam</span>`
                : ""}
        </button>
    `;

}

// ── Panel: kur / düzenle ────────────────────────────────────

function openReminderSheet() {

    if (typeof closeSheets === "function") closeSheets("reminderSheet");

    document.getElementById("reminderSheet").classList.add("open");
    document.getElementById("reminderOverlay").classList.add("open");

    if (typeof updateMissButton === "function") updateMissButton();

}

function closeReminderSheet() {

    document.getElementById("reminderSheet")?.classList.remove("open");
    document.getElementById("reminderOverlay")?.classList.remove("open");

    remSheetMode = null;
    remSheetId = null;

    if (typeof updateMissButton === "function") updateMissButton();

}

function remDefaultAt() {

    // Bir saat sonrası, çeyreğe yuvarlanmış
    const d = new Date(Date.now() + REM_HOUR);

    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);

    return d.getTime();

}

function remDateValue(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function remTimeValue(ms) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function openReminderCreate(preset = null) {

    if (!remPartnerUid()) {
        showToast("Sevgilin katılınca hatırlatma kurabilirsin 💜");
        return;
    }

    remSheetMode = "create";
    remSheetId = null;

    remDraft = {
        title: preset?.title || "",
        emoji: preset?.emoji || "⏰",
        at: remDefaultAt(),
        repeat: "once",
        dayBefore: false
    };

    renderReminderForm();
    openReminderSheet();

    setTimeout(() => document.getElementById("remTitle")?.focus(), 350);

}

function openReminderEdit(id) {

    const r = remList.find(x => x.id === id);

    if (!r) return;

    remSheetMode = "edit";
    remSheetId = id;

    remDraft = {
        title: r.title,
        emoji: r.emoji || "⏰",
        at: r.nextAt || r.lastAt || remDefaultAt(),
        repeat: r.repeat || "once",
        dayBefore: !!r.dayBefore
    };

    renderReminderForm(r);
    openReminderSheet();

}

function renderReminderForm(existing = null) {

    const body = document.getElementById("reminderSheetBody");
    const d = remDraft;
    const partner = remPartnerName();
    const heart = remHeartOf(remPartnerUid());

    body.innerHTML = `
        <div class="bny-title">${heart} ${remEsc(remDative(partner))} hatırlat</div>

        ${existing ? reminderStatusHtml(existing) : ""}

        <div class="rem-title-row">
            <button type="button" class="rem-emoji-btn" onclick="cycleReminderEmoji()" aria-label="Simge">${remEsc(d.emoji)}</button>
            <input id="remTitle" class="rem-input" maxlength="120" placeholder="Ne hatırlatayım?"
                value="${remEsc(d.title)}" oninput="remDraft.title = this.value">
        </div>

        ${existing ? "" : `
        <div class="rem-presets">
            ${REM_PRESETS.map((p, i) => `<button type="button" onclick="applyReminderPreset(${i})">${p.emoji} ${p.label}</button>`).join("")}
        </div>`}

        <div class="rem-row rem-row-when">
            <span>Ne zaman</span>
            <span class="rem-when">
                <input type="date" id="remDate" value="${remDateValue(d.at)}" min="${remDateValue(Date.now())}">
                <input type="time" id="remTime" value="${remTimeValue(d.at)}">
            </span>
        </div>

        <div class="rem-row">
            <span>Tekrar</span>
            <span class="rem-chips">
                ${[["once", "Bir kez"], ["daily", "Her gün"], ["weekly", "Haftada"]].map(([k, label]) =>
                    `<button type="button" class="${d.repeat === k ? "active" : ""}" onclick="setReminderRepeat('${k}')">${label}</button>`).join("")}
            </span>
        </div>

        ${d.repeat === "once" ? `
        <label class="rem-row">
            <span>1 gün önce de hatırlat<small>Doğum günü, randevu gibi şeyler için</small></span>
            <input type="checkbox" class="notify-switch" ${d.dayBefore ? "checked" : ""} onchange="remDraft.dayBefore = this.checked">
        </label>` : ""}

        <button type="button" class="rem-save" onclick="saveReminder(this)">
            ${existing ? "Kaydet" : "Hatırlatmayı kur"}
        </button>

        ${existing ? `<button type="button" class="rem-delete" onclick="deleteReminderFromSheet()">🗑️ Hatırlatmayı sil</button>` : ""}
    `;

}

function reminderStatusHtml(r) {

    const s = remState(r);

    if (s.kind === "done") {
        return `<div class="rem-sheet-status ok">✓ ${remEsc(remPartnerName())} bugün yaptı · ${remTime(r.doneAt)}${r.thanks ? `<br>“${remEsc(r.thanks)}”` : ""}</div>`;
    }

    if (s.kind === "pending") {
        return `<div class="rem-sheet-status">${Date.now() - s.at > REM_HOUR ? "⏳ Henüz yapılmadı" : "🔔 Hatırlatıldı"} · ${remTime(s.at)}</div>`;
    }

    if (r.muted) return `<div class="rem-sheet-status">🔕 ${remEsc(remPartnerName())} bu hatırlatmayı sessize aldı</div>`;

    return "";

}

function remSyncFormInputs() {

    const date = document.getElementById("remDate")?.value;
    const time = document.getElementById("remTime")?.value;

    if (date && time) {
        const at = new Date(`${date}T${time}:00`).getTime();
        if (!Number.isNaN(at)) remDraft.at = at;
    }

    const title = document.getElementById("remTitle");

    if (title) remDraft.title = title.value;

}

function applyReminderPreset(i) {

    const p = REM_PRESETS[i];

    if (!p) return;

    remSyncFormInputs();

    remDraft.title = p.title;
    remDraft.emoji = p.emoji;

    window.appHaptics?.light?.();

    renderReminderForm();

    const input = document.getElementById("remTitle");

    if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }

}

function cycleReminderEmoji() {

    remSyncFormInputs();

    const i = REM_EMOJIS.indexOf(remDraft.emoji);

    remDraft.emoji = REM_EMOJIS[(i + 1) % REM_EMOJIS.length];

    window.appHaptics?.light?.();

    renderReminderForm(remSheetMode === "edit" ? remList.find(x => x.id === remSheetId) : null);

}

function remIsPremium() {
    return typeof isPremiumPlan !== "function" || isPremiumPlan(typeof premiumCouple !== "undefined" ? premiumCouple : null);
}

function setReminderRepeat(repeat) {

    remSyncFormInputs();

    remDraft.repeat = repeat;

    if (repeat !== "once") remDraft.dayBefore = false;

    renderReminderForm(remSheetMode === "edit" ? remList.find(x => x.id === remSheetId) : null);

}

async function saveReminder(button) {

    remSyncFormInputs();

    const d = remDraft;
    const title = String(d.title || "").trim();

    if (!title) {
        showToast("Ne hatırlatacağını yaz 💜");
        document.getElementById("remTitle")?.focus();
        return;
    }

    const step = d.repeat === "daily" ? REM_DAY : d.repeat === "weekly" ? 7 * REM_DAY : 0;
    let at = d.at;

    if (at <= Date.now() + 30 * 1000) {
        if (!step) {
            showToast("Geçmiş bir zaman seçtin, saati kontrol et ⏰");
            return;
        }
        while (at <= Date.now()) at += step;
    }

    // Ücretsiz: aynı anda en fazla 3 tekrarlayan hatırlatma
    if (step && !remIsPremium()) {

        const me = remMe();
        const active = remList.filter(r => r.authorId === me && r.repeat !== "once" && r.nextAt && r.id !== remSheetId).length;

        if (active >= REM_FREE_RECURRING) {
            if (typeof openPremium === "function") {
                openPremium(`Ücretsiz planda aynı anda ${REM_FREE_RECURRING} tekrarlayan hatırlatma kurabilirsin. Tek seferlik hatırlatmalar sınırsız 💜`);
            }
            return;
        }

    }

    const earlyAt = !step && d.dayBefore && at - REM_DAY > Date.now() ? at - REM_DAY : null;

    const data = {
        title: title.slice(0, 120),
        emoji: d.emoji || "⏰",
        repeat: d.repeat,
        dayBefore: !step && !!d.dayBefore,
        nextAt: at,
        earlyAt,
        earlySent: false
    };

    data.dueAt = remDueAt({ ...data, snoozeUntil: null });

    button.disabled = true;

    try {

        if (remSheetMode === "edit" && remSheetId) {
            await window.firebase.updateReminder(remSheetId, data);
            showToast("Hatırlatma güncellendi");
        } else {
            await window.firebase.addReminder({ ...data, targetId: remPartnerUid() });
            showToast(`⏰ ${remWhen(at)} ${remDative(remPartnerName())} hatırlatacağım`);
            remTab = "theirs";
        }

        (window.appHaptics?.success || window.appHaptics?.light)?.();

        closeReminderSheet();

    } catch (error) {

        console.error("Hatırlatma kaydedilemedi:", error);
        showToast("Kaydedilemedi, tekrar dene.");
        button.disabled = false;

    }

}

async function deleteReminderFromSheet() {

    const id = remSheetId;

    if (!id) return;

    const ok = await appConfirm({ icon: "⏰", title: "Hatırlatma silinsin mi?", ok: "Sil", danger: true });

    if (!ok) return;

    try {
        await window.firebase.deleteReminder(id);
        closeReminderSheet();
        showToast("Hatırlatma silindi");
    } catch (error) {
        console.error(error);
        showToast("Silinemedi, tekrar dene.");
    }

}

// ── Panel: bana kurulan (yaptım / 10 dk / sessize al) ──────

function openReminderDetail(id) {

    const r = remList.find(x => x.id === id);

    if (!r) return;

    if (r.authorId === remMe()) {
        openReminderEdit(id);
        return;
    }

    remSheetMode = "detail";
    remSheetId = id;

    renderReminderDetail(r, true);
    openReminderSheet();

}

function renderReminderDetail(r, fresh = false) {

    const body = document.getElementById("reminderSheetBody");
    const s = remState(r);
    const author = remNameOf(r.authorId);
    const keepThanks = !fresh ? document.getElementById("remThanks")?.value || "" : "";

    const when = r.repeat !== "once" && r.nextAt ? remRepeatText(r, r.nextAt) : remWhen(s.at);

    body.innerHTML = `
        <div class="rem-detail-emoji">${remEsc(r.emoji || "⏰")}</div>
        <div class="rem-detail-title">${remEsc(r.title)}</div>
        <div class="rem-detail-sub">${remHeartOf(r.authorId)} ${remEsc(author)} hatırlatıyor · ${when}</div>

        ${s.kind === "done" ? `
            <div class="rem-sheet-status ok">✓ Bugün yaptın · ${remTime(r.doneAt)}</div>
        ` : s.kind === "pending" || s.kind === "upcoming" ? `
            <input id="remThanks" class="rem-input" maxlength="120" placeholder="Ona bir teşekkür yaz (isteğe bağlı)" value="${remEsc(keepThanks)}">
            <button type="button" class="rem-save" onclick="markReminderDone('${r.id}', true)">✓ Yaptım</button>
            ${s.kind === "pending" ? `<button type="button" class="rem-snooze" onclick="snoozeReminder('${r.id}')">⏰ 10 dk sonra tekrar hatırlat</button>` : ""}
        ` : ""}

        <label class="rem-row">
            <span>Sessize al<small>${r.muted ? `Bildirim gelmiyor; ${remEsc(author)} bunu görüyor` : `Bildirim gelmesin; ${remEsc(author)} bunu görür`}</small></span>
            <input type="checkbox" class="notify-switch" ${r.muted ? "checked" : ""} onchange="toggleReminderMute('${r.id}', this.checked)">
        </label>
    `;

}

async function markReminderDone(id, fromSheet = false) {

    const r = remList.find(x => x.id === id);

    if (!r) return;

    const s = remState(r);

    if (s.kind !== "pending" && s.kind !== "upcoming") return;

    const thanks = fromSheet ? String(document.getElementById("remThanks")?.value || "").trim().slice(0, 120) : "";

    // Ekranı hemen güncelle
    Object.assign(r, { doneFor: s.at, doneAt: Date.now(), thanks: thanks || null, snoozeUntil: null });

    renderReminders();

    (window.appHaptics?.success || window.appHaptics?.light)?.();

    showToast(`💜 ${remDative(remPartnerName())} haber verdim`);

    if (fromSheet) closeReminderSheet();

    try {

        await window.firebase.updateReminder(id, {
            doneFor: r.doneFor,
            doneAt: r.doneAt,
            thanks: r.thanks,
            snoozeUntil: null,
            dueAt: remDueAt(r)
        });

    } catch (error) {

        console.error("İşaretlenemedi:", error);
        showToast("Kaydedilemedi, tekrar dene.");

    }

}

async function snoozeReminder(id) {

    const r = remList.find(x => x.id === id);

    if (!r) return;

    const snoozeUntil = Date.now() + 10 * 60 * 1000;

    closeReminderSheet();

    try {

        await window.firebase.updateReminder(id, {
            snoozeUntil,
            dueAt: remDueAt({ ...r, snoozeUntil })
        });

        showToast("⏰ 10 dakika sonra tekrar hatırlatacağım");

    } catch (error) {

        console.error(error);
        showToast("Kaydedilemedi, tekrar dene.");

    }

}

async function toggleReminderMute(id, muted) {

    try {

        await window.firebase.updateReminder(id, { muted });

        showToast(muted ? "🔕 Sessize alındı" : "🔔 Bildirimler açık");

    } catch (error) {

        console.error(error);
        showToast("Kaydedilemedi, tekrar dene.");

    }

}

// ─────────────────────────────────────────────────────────────
// Defter: sevgilin hakkında bildiklerin + gizli hediye fikirlerin
//
// Biz'deki kartın adı sevgilinin adı ve senin onun için seçtiğin
// kalp ("Dilara 💗"). Sayfada üç sekme:
//   • Onun hakkında: çiçek, ayakkabı, yüzük… sevdikleri, sevmedikleri.
//     Sen yazarsın. "Tahmin" dersen yanında "?" olur ve ona sorulur;
//     "Gizli" dersen sadece sen görürsün.
//   • 🔒 Hediye fikirleri: tamamen gizli. Verince ✓ → "Verdiklerim".
//   • "Dilara'nın defteri": onun SENİN hakkında yazdıkları; "✓ Doğru"
//     ya da "Düzelt". Kaç bilginin doğru olduğu küçük bir skor.
// Doğum günü / yıldönümünden 14 ve 3 gün önce hediye hatırlatması
// sunucudan gelir (functions → giftNotebookReminders).
//
// Veri: notebook/{id} (kurallar: firestore.rules → notebook)
// ─────────────────────────────────────────────────────────────

const NB_TILES = [
    { key: "flower",  emoji: "🌷", label: "Çiçek" },
    { key: "shoe",    emoji: "👟", label: "Ayakkabı" },
    { key: "ring",    emoji: "💍", label: "Yüzük" },
    { key: "color",   emoji: "🎨", label: "Renk" },
    { key: "jewelry", emoji: "💎", label: "Takı" },
    { key: "perfume", emoji: "🌸", label: "Parfüm" }
];

const NB_LIKES = [
    { key: "coffee", emoji: "☕", label: "Kahve siparişi" },
    { key: "sweet",  emoji: "🍫", label: "Tatlı" },
    { key: "food",   emoji: "🍽️", label: "Yemek / yer" },
    { key: "film",   emoji: "🎬", label: "Film / dizi" },
    { key: "music",  emoji: "🎵", label: "Müzik" },
    { key: "book",   emoji: "📚", label: "Kitap" },
    { key: "brand",  emoji: "🏷️", label: "Marka / mağaza" }
];

const NB_IDEA_TYPES = [
    { key: "gift",       emoji: "🎁", label: "Hediye" },
    { key: "experience", emoji: "✨", label: "Deneyim" },
    { key: "place",      emoji: "🍽️", label: "Yer" },
    { key: "small",      emoji: "💐", label: "Küçük sürpriz" }
];

const NB_FREE_IDEAS = 10;
const NB_GIFT_RE = /doğum|yıldönüm|sevgililer|evlilik|nişan/i;

let nbStarted = false;
let nbMine = [];
let nbAboutMe = [];
let nbTab = "about";            // "about" | "ideas" | "mine"
let nbEditing = null;           // panelde düzenlenen kayıt (ya da yeni taslak)
let nbFixing = null;            // "Düzelt" açık olan bilgi

// ── Yardımcılar ─────────────────────────────────────────────

function nbMe() {
    return window.firebase?.getCurrentAuthUser?.()?.uid;
}

function nbPartner() {
    return window.couplePartnerUid || null;
}

function nbPartnerName() {
    const raw = typeof coupleNames !== "undefined" ? coupleNames.partner : "";
    return raw && raw !== "Ben" ? raw : "Sevgilin";
}

function nbPartnerHeart() {
    return (typeof coupleHearts !== "undefined" && coupleHearts.partner) || "💗";
}

function nbGen(name) {
    return typeof withGenitive === "function" ? withGenitive(name) : `${name}'in`;
}

function nbEsc(v) {
    return String(v ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function nbFacts() {
    return nbMine.filter(e => e.kind === "fact");
}

function nbIdeas() {
    return nbMine.filter(e => e.kind === "idea");
}

function nbFact(key) {
    return nbFacts().find(e => e.key === key);
}

function nbPreset(key) {
    return [...NB_TILES, ...NB_LIKES].find(p => p.key === key);
}

function nbIsPremium() {
    return typeof isPremiumPlan !== "function" || isPremiumPlan(typeof premiumCouple !== "undefined" ? premiumCouple : null);
}

// Yaklaşan hediye günü (30 gün içinde): { name, emoji, days }
function nbNextGiftDay() {

    if (typeof EVENTS === "undefined" || typeof nextOccurrence !== "function") return null;

    const myName = String((typeof coupleNames !== "undefined" && coupleNames.me) || "").toLocaleLowerCase("tr-TR");

    return EVENTS
        .filter(e => e.name && (NB_GIFT_RE.test(e.name) || e.emoji === "🎂"))
        .filter(e => !myName || !e.name.toLocaleLowerCase("tr-TR").includes(myName))
        .map(e => ({ ...e, days: daysUntil(nextOccurrence(e.month, e.day)) }))
        .filter(e => e.days >= 0 && e.days <= 30)
        .sort((a, b) => a.days - b.days)[0] || null;

}

// ── Başlatma ────────────────────────────────────────────────

function startNotebook() {

    if (nbStarted) return;

    if (!window.firebaseReady || !window.firebase?.getCurrentAuthUser?.()) {
        window.addEventListener("firebaseReady", startNotebook, { once: true });
        return;
    }

    nbStarted = true;

    window.firebase.listenNotebook(state => {

        nbMine = state.mine || [];
        nbAboutMe = state.aboutMe || [];

        renderNotebook();

    });

}

function renderNotebook() {

    renderNotebookBiz();
    renderNotebookPage();

}

// ── Biz kartı: "Dilara 💗" ──────────────────────────────────

function renderNotebookBiz() {

    const title = document.getElementById("notebookBizTitle");

    if (title) title.textContent = nbPartner() ? `${nbPartnerName()} ${nbPartnerHeart()}` : "Defterim";

    if (typeof setBizInfo !== "function") return;

    const ideas = nbIdeas().filter(i => !i.givenAt).length;
    const facts = nbFacts().length;
    const pending = nbAboutMe.filter(f => !f.confirmedAt).length;

    const info = [facts ? `${facts} bilgi` : "", ideas ? `🔒 ${ideas} fikir` : ""].filter(Boolean).join(" · ");

    setBizInfo(
        "our-notebook",
        info || (nbPartner() ? "Onu ne kadar tanıyorsun?" : ""),
        pending ? { text: `${pending} soru` } : null,
        !facts && !ideas
    );

}

// ── Sayfa ───────────────────────────────────────────────────

function setNotebookTab(tab) {

    nbTab = tab;
    nbFixing = null;

    window.appHaptics?.light?.();

    renderNotebookPage();

}

function renderNotebookPage() {

    const head = document.getElementById("notebookTitle");
    const tabs = document.getElementById("notebookTabs");
    const body = document.getElementById("notebookBody");

    if (!head || !tabs || !body) return;

    const name = nbPartnerName();

    head.textContent = nbPartner() ? `${name} ${nbPartnerHeart()}` : "Defter";

    if (!nbPartner()) {
        tabs.innerHTML = "";
        body.innerHTML = `
            <div class="empty-guide">
                <div class="empty-guide-icon">📖</div>
                <div class="empty-guide-title">Sevgilin katılınca</div>
                <div class="empty-guide-text">Onun sevdiği çiçeği, ayakkabı numarasını, hediye fikirlerini burada tutacaksın.</div>
            </div>
        `;
        return;
    }

    const pending = nbAboutMe.filter(f => !f.confirmedAt).length;

    tabs.innerHTML = `
        <button type="button" class="${nbTab === "about" ? "active" : ""}" onclick="setNotebookTab('about')">Hakkında</button>
        <button type="button" class="${nbTab === "ideas" ? "active" : ""}" onclick="setNotebookTab('ideas')">🔒 Hediyeler</button>
        <button type="button" class="${nbTab === "mine" ? "active" : ""}" onclick="setNotebookTab('mine')">${nbEsc(nbGen(name))} defteri${pending ? ` <i>${pending}</i>` : ""}</button>
    `;

    body.innerHTML = nbTab === "ideas" ? nbIdeasHtml() : nbTab === "mine" ? nbAboutMeHtml() : nbAboutHtml();

}

// Değer + rozetler (✓ onayladı, ? tahmin, 🔒 gizli)
function nbMarks(f) {

    if (!f) return "";
    if (f.secret) return `<span class="nb-mark lock">🔒</span>`;
    if (f.confirmedAt) return `<span class="nb-mark ok">✓</span>`;

    return "";

}

function nbValueText(f) {
    return `${nbEsc(f.value)}${f.guess && !f.confirmedAt ? "?" : ""}`;
}

function nbAboutHtml() {

    const facts = nbFacts();
    const name = nbPartnerName();

    const tiles = NB_TILES.map(p => {
        const f = nbFact(p.key);
        return f ? `
            <button type="button" class="nb-tile" onclick="openNotebookFact('${p.key}')">
                ${nbMarks(f)}
                <i>${p.emoji}</i>
                <b>${nbValueText(f)}</b>
                <small>${p.label}</small>
            </button>
        ` : `
            <button type="button" class="nb-tile empty" onclick="openNotebookFact('${p.key}')">
                <i>${p.emoji}</i>
                <b>＋</b>
                <small>${p.label}</small>
            </button>
        `;
    }).join("");

    const likes = [
        ...NB_LIKES.map(p => nbFact(p.key)).filter(Boolean),
        ...facts.filter(f => f.key === "custom")
    ];

    const dislikes = facts.filter(f => f.key === "dislike");
    const missing = NB_LIKES.filter(p => !nbFact(p.key));

    const row = f => {
        const p = nbPreset(f.key);
        return `
            <button type="button" class="nb-row${f.key === "dislike" ? " no" : ""}" onclick="openNotebookEntry('${f.id}')">
                <span class="nb-row-emoji">${nbEsc(f.emoji || p?.emoji || "✏️")}</span>
                <span class="nb-row-text">
                    <b>${nbValueText(f)}</b>
                    <small>${nbEsc(f.key === "dislike" ? "Sevmez" : f.label || p?.label || "")}</small>
                </span>
                ${f.secret ? `<span class="nb-row-mark">🔒</span>` : f.confirmedAt ? `<span class="nb-row-mark ok">✓ onayladı</span>` : f.guess ? `<span class="nb-row-mark">soruldu</span>` : ""}
            </button>
        `;
    };

    return `
        <div class="nb-sub">${nbEsc(name)} hakkında bildiklerin · sen yazarsın, o onaylar</div>

        <div class="nb-tiles">${tiles}</div>

        <div class="nb-section">Sevdikleri</div>
        ${likes.map(row).join("")}
        <div class="nb-chips">
            ${missing.map(p => `<button type="button" onclick="openNotebookFact('${p.key}')">＋ ${p.emoji} ${p.label}</button>`).join("")}
            <button type="button" onclick="openNotebookFact('custom')">＋ ✏️ Kendi başlığın</button>
        </div>

        <div class="nb-section">Sevmedikleri</div>
        ${dislikes.map(row).join("")}
        <div class="nb-chips">
            <button type="button" onclick="openNotebookFact('dislike')">＋ 🚫 Sevmediği bir şey</button>
        </div>
    `;

}

function nbIdeasHtml() {

    const ideas = nbIdeas();
    const open = ideas.filter(i => !i.givenAt).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const given = ideas.filter(i => i.givenAt).sort((a, b) => b.givenAt - a.givenAt);
    const next = nbNextGiftDay();

    const typeOf = i => NB_IDEA_TYPES.find(t => t.key === i.type) || NB_IDEA_TYPES[0];
    const when = ms => ms ? new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "";

    const row = i => `
        <div class="nb-idea${i.givenAt ? " given" : ""}">
            <button type="button" class="nb-idea-main" onclick="openNotebookEntry('${i.id}')">
                <span class="nb-row-emoji">${typeOf(i).emoji}</span>
                <span class="nb-row-text">
                    <b>${nbEsc(i.title)}</b>
                    <small>${[
                        i.givenAt ? `${i.givenFor ? nbEsc(i.givenFor) : when(i.givenAt)}'da verdin` : "",
                        !i.givenAt && i.note ? nbEsc(i.note) : "",
                        !i.givenAt && i.price ? `~${nbEsc(i.price)} ₺` : "",
                        !i.givenAt && i.link ? "🔗 link" : "",
                        !i.givenAt ? when(i.createdAt) : ""
                    ].filter(Boolean).join(" · ")}</small>
                </span>
            </button>
            <button type="button" class="nb-check${i.givenAt ? " on" : ""}" aria-label="Verdim"
                onclick="toggleNotebookGiven('${i.id}')">${i.givenAt ? "✓" : ""}</button>
        </div>
    `;

    return `
        <div class="nb-sub">🔒 Sadece sen görürsün · ${nbEsc(nbPartnerName())} hiçbir şekilde göremez</div>

        <button type="button" class="song-add-card nb-add" onclick="openNotebookIdea()">
            <span>＋ Fikir ekle</span>
        </button>

        ${next ? `<div class="nb-banner">${nbEsc(next.emoji || "🎂")} ${nbEsc(next.name)} ${next.days === 0 ? "bugün" : `${next.days} gün sonra`} · ${open.length} fikir var</div>` : ""}

        ${open.length ? open.map(row).join("") : `<div class="nb-empty">"Ne güzelmiş" dediği bir şey mi oldu? Hemen not al 💝</div>`}

        ${given.length ? `<div class="nb-section">Verdiklerim</div>${given.map(row).join("")}` : ""}
    `;

}

function nbAboutMeHtml() {

    const name = nbPartnerName();
    const facts = nbAboutMe.slice();
    const pending = facts.filter(f => !f.confirmedAt);
    const confirmed = facts.filter(f => f.confirmedAt);

    if (!facts.length) {
        return `<div class="nb-empty">${nbEsc(name)} henüz senin hakkında bir şey yazmadı.<br>Yazdığında burada "doğru mu?" diye sorulacak 💜</div>`;
    }

    const label = f => nbEsc(f.key === "dislike" ? "Sevmediğin" : f.label || nbPreset(f.key)?.label || "");
    const emoji = f => nbEsc(f.emoji || nbPreset(f.key)?.emoji || "✏️");

    const question = f => nbFixing === f.id ? `
        <div class="nb-ask">
            <b>${emoji(f)} ${label(f)}</b>
            <input id="nbFixInput" class="rem-input" maxlength="200" value="${nbEsc(f.value)}"
                enterkeyhint="done" onkeydown="if (event.key === 'Enter') confirmNotebookFact('${f.id}', true)">
            <div class="nb-ask-actions">
                <button type="button" class="yes" onclick="confirmNotebookFact('${f.id}', true)">Kaydet</button>
                <button type="button" onclick="nbFixing = null; renderNotebookPage()">Vazgeç</button>
            </div>
        </div>
    ` : `
        <div class="nb-ask">
            <b>${emoji(f)} ${label(f)}: “${nbEsc(f.value)}” mi?</b>
            <div class="nb-ask-actions">
                <button type="button" class="yes" onclick="confirmNotebookFact('${f.id}')">✓ Doğru</button>
                <button type="button" onclick="openNotebookFix('${f.id}')">Düzelt</button>
            </div>
        </div>
    `;

    return `
        <div class="nb-score">
            <b>${confirmed.length}/${facts.length}</b>
            <span>${nbEsc(name)} seni ne kadar tanıyor${pending.length ? `<small>${pending.length} bilgi onayını bekliyor</small>` : `<small>Hepsini onayladın 💜</small>`}</span>
        </div>

        ${pending.map(question).join("")}

        ${confirmed.length ? `<div class="nb-section">Onayladıkların <small>· düzeltmek için dokun</small></div>` : ""}
        ${confirmed.map(f => nbFixing === f.id ? question(f) : `
            <button type="button" class="nb-row" onclick="openNotebookFix('${f.id}')">
                <span class="nb-row-emoji">${emoji(f)}</span>
                <span class="nb-row-text"><b>${nbEsc(f.value)}</b><small>${label(f)}</small></span>
                <span class="nb-row-mark ok">✓ <i class="nb-edit">✏️</i></span>
            </button>
        `).join("")}

        <div class="nb-foot">🔒 ${nbEsc(nbGen(name))} gizli notlarını ve hediye fikirlerini göremezsin</div>
    `;

}

// ── Panel: bilgi ekle / düzenle ─────────────────────────────

function openNotebookSheet() {

    if (typeof closeSheets === "function") closeSheets("notebookSheet");

    document.getElementById("notebookSheet").classList.add("open");
    document.getElementById("notebookOverlay").classList.add("open");

    if (typeof updateMissButton === "function") updateMissButton();

}

function closeNotebookSheet() {

    document.getElementById("notebookSheet")?.classList.remove("open");
    document.getElementById("notebookOverlay")?.classList.remove("open");

    nbEditing = null;

    if (typeof updateMissButton === "function") updateMissButton();

}

// Hazır başlık (çiçek, ayakkabı…) ya da "custom" / "dislike"
function openNotebookFact(key) {

    const existing = nbPreset(key) ? nbFact(key) : null;

    if (existing) {
        openNotebookEntry(existing.id);
        return;
    }

    const p = nbPreset(key);

    nbEditing = {
        kind: "fact",
        key,
        emoji: p?.emoji || (key === "dislike" ? "🚫" : "✏️"),
        label: p?.label || "",
        value: "",
        guess: false,
        secret: false
    };

    renderNotebookFactForm();
    openNotebookSheet();

    setTimeout(() => document.getElementById(key === "custom" ? "nbLabel" : "nbValue")?.focus(), 350);

}

function openNotebookEntry(id) {

    const e = nbMine.find(x => x.id === id);

    if (!e) return;

    nbEditing = { ...e };

    if (e.kind === "idea") renderNotebookIdeaForm();
    else renderNotebookFactForm();

    openNotebookSheet();

}

function renderNotebookFactForm() {

    const e = nbEditing;
    const body = document.getElementById("notebookSheetBody");
    const name = nbPartnerName();
    const title = e.key === "dislike" ? "Sevmediği bir şey" : e.key === "custom" ? "Kendi başlığın" : e.label;

    body.innerHTML = `
        <div class="bny-title">${nbEsc(e.emoji)} ${nbEsc(title)}</div>

        ${e.key === "custom" ? `<input id="nbLabel" class="rem-input nb-gap" maxlength="40" placeholder="Başlık (ör. Kedisinin adı)" value="${nbEsc(e.label)}">` : ""}

        <input id="nbValue" class="rem-input nb-gap" maxlength="200"
            placeholder="${e.key === "dislike" ? "Ör. Kırmızı gül, tatlı parfümler" : "Yaz…"}"
            value="${nbEsc(e.value)}">

        <label class="rem-row">
            <span>Emin değilim, tahmin<small>Yanında "?" görünür; ${nbEsc(name)} onaylar ya da düzeltir</small></span>
            <input type="checkbox" class="notify-switch" id="nbGuess" ${e.guess ? "checked" : ""}>
        </label>

        <label class="rem-row">
            <span>🔒 Gizli tut<small>Sadece sen görürsün, ${nbEsc(name)} görmez</small></span>
            <input type="checkbox" class="notify-switch" id="nbSecret" ${e.secret ? "checked" : ""}>
        </label>

        ${e.confirmedAt ? `<div class="rem-sheet-status ok">✓ ${nbEsc(name)} bunu onayladı</div>` : ""}

        <button type="button" class="rem-save" onclick="saveNotebookFact(this)">Kaydet</button>
        ${e.id ? `<button type="button" class="rem-delete" onclick="deleteNotebookFromSheet()">🗑️ Sil</button>` : ""}
    `;

}

async function saveNotebookFact(button) {

    const e = nbEditing;
    const value = String(document.getElementById("nbValue")?.value || "").trim().slice(0, 200);
    const label = e.key === "custom" ? String(document.getElementById("nbLabel")?.value || "").trim().slice(0, 40) : e.label;
    const guess = !!document.getElementById("nbGuess")?.checked;
    const secret = !!document.getElementById("nbSecret")?.checked;

    if (!value) {
        showToast("Bir şey yaz 💜");
        return;
    }

    if (e.key === "custom" && !label) {
        showToast("Bir başlık yaz");
        document.getElementById("nbLabel")?.focus();
        return;
    }

    // Değer değiştiyse eski onay geçersiz
    const changed = !e.id || value !== e.value;

    const data = {
        kind: "fact",
        key: e.key,
        emoji: e.emoji,
        label,
        value,
        guess,
        secret,
        confirmedAt: changed ? null : (e.confirmedAt || null)
    };

    button.disabled = true;

    try {

        if (e.id) await window.firebase.updateNotebookEntry(e.id, data);
        else await window.firebase.addNotebookEntry({ ...data, subjectId: nbPartner() });

        closeNotebookSheet();

    } catch (error) {

        console.error("Defter kaydedilemedi:", error);
        showToast("Kaydedilemedi, tekrar dene.");
        button.disabled = false;

    }

}

async function deleteNotebookFromSheet() {

    const e = nbEditing;

    if (!e?.id) return;

    const ok = await appConfirm({ icon: "📖", title: e.kind === "idea" ? "Fikir silinsin mi?" : "Bilgi silinsin mi?", ok: "Sil", danger: true });

    if (!ok) return;

    try {
        await window.firebase.deleteNotebookEntry(e.id);
        closeNotebookSheet();
    } catch (error) {
        console.error(error);
        showToast("Silinemedi, tekrar dene.");
    }

}

// ── Panel: hediye fikri ─────────────────────────────────────

function openNotebookIdea() {

    const open = nbIdeas().filter(i => !i.givenAt).length;

    if (open >= NB_FREE_IDEAS && !nbIsPremium()) {
        if (typeof openPremium === "function") {
            openPremium(`Ücretsiz planda aynı anda ${NB_FREE_IDEAS} hediye fikri tutabilirsin. Premium ile sınırsız 💝`);
        }
        return;
    }

    nbEditing = { kind: "idea", type: "gift", title: "", note: "", link: "", price: "", secret: true };

    renderNotebookIdeaForm();
    openNotebookSheet();

    setTimeout(() => document.getElementById("nbTitle")?.focus(), 350);

}

function renderNotebookIdeaForm() {

    const e = nbEditing;
    const body = document.getElementById("notebookSheetBody");

    body.innerHTML = `
        <div class="bny-title">🔒 Hediye fikri</div>

        <input id="nbTitle" class="rem-input nb-gap" maxlength="200" placeholder="Ne? (ör. Kablosuz kulaklık)" value="${nbEsc(e.title)}">
        <input id="nbNote" class="rem-input nb-gap" maxlength="500" placeholder="Not (ör. “Benimki bozuldu” dedi)" value="${nbEsc(e.note)}">

        <div class="rem-chips nb-gap" id="nbTypes">
            ${NB_IDEA_TYPES.map(t => `<button type="button" class="${e.type === t.key ? "active" : ""}" onclick="setNotebookIdeaType('${t.key}')">${t.emoji} ${t.label}</button>`).join("")}
        </div>

        <div class="nb-two">
            <input id="nbLink" class="rem-input" maxlength="500" placeholder="🔗 Link" value="${nbEsc(e.link)}" inputmode="url">
            <input id="nbPrice" class="rem-input" maxlength="12" placeholder="₺ Fiyat" value="${nbEsc(e.price)}" inputmode="numeric">
        </div>

        ${e.id && e.link ? `<a class="nb-link" href="${nbEsc(e.link)}" target="_blank" rel="noopener">Linki aç ↗</a>` : ""}

        <button type="button" class="rem-save" onclick="saveNotebookIdea(this)">${e.id ? "Kaydet" : "Deftere ekle"}</button>
        ${e.id ? `<button type="button" class="rem-delete" onclick="deleteNotebookFromSheet()">🗑️ Sil</button>` : ""}
    `;

}

function setNotebookIdeaType(type) {

    nbEditing.title = document.getElementById("nbTitle")?.value || "";
    nbEditing.note = document.getElementById("nbNote")?.value || "";
    nbEditing.link = document.getElementById("nbLink")?.value || "";
    nbEditing.price = document.getElementById("nbPrice")?.value || "";
    nbEditing.type = type;

    window.appHaptics?.light?.();

    renderNotebookIdeaForm();

}

async function saveNotebookIdea(button) {

    const e = nbEditing;
    const title = String(document.getElementById("nbTitle")?.value || "").trim().slice(0, 200);

    if (!title) {
        showToast("Ne olduğunu yaz 💝");
        document.getElementById("nbTitle")?.focus();
        return;
    }

    let link = String(document.getElementById("nbLink")?.value || "").trim().slice(0, 500);

    if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;

    const data = {
        kind: "idea",
        secret: true,
        type: e.type || "gift",
        title,
        note: String(document.getElementById("nbNote")?.value || "").trim().slice(0, 500),
        link,
        price: String(document.getElementById("nbPrice")?.value || "").trim().slice(0, 12)
    };

    button.disabled = true;

    try {

        if (e.id) await window.firebase.updateNotebookEntry(e.id, data);
        else await window.firebase.addNotebookEntry({ ...data, subjectId: nbPartner(), givenAt: null });

        closeNotebookSheet();

        if (!e.id) showToast("💝 Deftere eklendi");

    } catch (error) {

        console.error("Fikir kaydedilemedi:", error);
        showToast("Kaydedilemedi, tekrar dene.");
        button.disabled = false;

    }

}

async function toggleNotebookGiven(id) {

    const i = nbMine.find(x => x.id === id);

    if (!i) return;

    const on = !i.givenAt;

    // Hangi gün için verildi: bugüne en yakın hediye günü (varsa)
    const next = nbNextGiftDay();
    const givenFor = on && next && next.days <= 3 ? next.name : null;

    Object.assign(i, { givenAt: on ? Date.now() : null, givenFor });

    renderNotebookPage();

    if (on) {
        (window.appHaptics?.success || window.appHaptics?.light)?.();
        showToast("🎁 Verdiklerime eklendi");
    }

    try {
        await window.firebase.updateNotebookEntry(id, { givenAt: i.givenAt, givenFor });
    } catch (error) {
        console.error(error);
        showToast("Kaydedilemedi, tekrar dene.");
    }

}

// ── Onun benim hakkımda yazdıkları: onayla / düzelt ─────────

// Onun yazdığını düzelt (onaylamadan önce ya da onayladıktan sonra)
function openNotebookFix(id) {

    nbFixing = id;

    window.appHaptics?.light?.();

    renderNotebookPage();

    setTimeout(() => {
        const input = document.getElementById("nbFixInput");
        if (!input) return;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        input.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);

}

async function confirmNotebookFact(id, withFix = false) {

    const f = nbAboutMe.find(x => x.id === id);

    if (!f) return;

    const data = { confirmedAt: Date.now(), guess: false };

    if (withFix) {
        const value = String(document.getElementById("nbFixInput")?.value || "").trim().slice(0, 200);
        if (!value) {
            showToast("Doğrusunu yaz");
            return;
        }
        data.value = value;
    }

    // Değişmediyse ve zaten onaylıysa yazmaya gerek yok
    if (withFix && f.confirmedAt && data.value === f.value) {
        nbFixing = null;
        renderNotebookPage();
        return;
    }

    const wasConfirmed = !!f.confirmedAt;

    Object.assign(f, data);
    nbFixing = null;

    renderNotebook();

    if (withFix && wasConfirmed) showToast("✏️ Düzeltildi");

    (window.appHaptics?.success || window.appHaptics?.light)?.();

    try {
        await window.firebase.updateNotebookEntry(id, data);
    } catch (error) {
        console.error(error);
        showToast("Kaydedilemedi, tekrar dene.");
    }

}

// ─────────────────────────────────────────────────────────────
// Yılımız: yıl sonu özeti
//
// • 15 Aralık'tan 15 Ocak'a kadar ana sayfada ve Biz'de
//   "2026'nız hazır" kartı (yöneticiler her zaman görür, deneme için)
// • Instagram hikayesi gibi kartlar: sağa dokun → sonraki,
//   sola dokun → önceki
// • Her kart 1080×1920 görsel olarak paylaşılabilir
// • Veriler sunucuda hesaplanır (functions → getWrapped)
// ─────────────────────────────────────────────────────────────

const WRAPPED_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const WRAPPED_MOODS = {
    love: ["🥰", "Aşık"], happy: ["😊", "Mutlu"], calm: ["😌", "Huzurlu"], tired: ["😴", "Yorgun"],
    stressed: ["😰", "Stresli"], sad: ["😔", "Üzgün"], angry: ["😤", "Sinirli"], sick: ["🤒", "Hasta"]
};

let wrappedData = null;
let wrappedCards = [];
let wrappedIndex = 0;
let wrappedAdmin = false;

// Yönetici hesabında Yılımız'ı sezon dışında da "Önizleme" olarak
// göster (test için). Kapalı: herkes gibi 15 Aralık'ta görünür.
const WRAPPED_ADMIN_PREVIEW = false;
let wrappedStarted = false;

// Gösterilecek yıl: 15-31 Aralık → bu yıl, 1-15 Ocak → geçen yıl
function wrappedSeasonYear(now = new Date()) {

    const month = now.getMonth();

    if (month === 11 && now.getDate() >= 15) return now.getFullYear();
    if (month === 0 && now.getDate() <= 15) return now.getFullYear() - 1;

    return null;

}

// "2026'nız", "2027'niz", "2028'iniz" (sayının okunuşuna göre ek)
function yearYour(year) {

    const ones = { 1: "'iniz", 2: "'niz", 3: "'ünüz", 4: "'ünüz", 5: "'iniz", 6: "'nız", 7: "'niz", 8: "'iniz", 9: "'unuz" };
    const tens = { 1: "'unuz", 2: "'niz", 3: "'unuz", 4: "'ınız", 5: "'niz", 6: "'ınız", 7: "'iniz", 8: "'iniz", 9: "'ınız", 0: "'iniz" };

    const last = year % 10;

    return String(year) + (last ? ones[last] : tens[Math.floor(year / 10) % 10]);

}

function wrappedYear() {
    return wrappedSeasonYear() || new Date().getFullYear();
}

// Çift hazır olunca (app.js)
function startWrapped() {

    if (wrappedStarted) return;

    wrappedStarted = true;

    renderWrappedEntry();

    if (!WRAPPED_ADMIN_PREVIEW) return;

    window.firebase?.amIAdmin?.().then(isAdmin => {
        wrappedAdmin = !!isAdmin;
        renderWrappedEntry();
    }).catch(() => {});

}

function renderWrappedEntry() {

    const show = !!wrappedSeasonYear() || wrappedAdmin;
    const year = wrappedYear();

    for (const id of ["wrappedHomeCard", "wrappedBizCard"]) {

        const el = document.getElementById(id);

        if (!el) continue;

        el.style.display = show ? "" : "none";

        const title = el.querySelector(".wrapped-entry-title");
        if (title) title.textContent = `🎁 ${yearYour(year)} hazır!`;

        const tag = el.querySelector(".wrapped-entry-tag");
        if (tag) tag.style.display = wrappedSeasonYear() ? "none" : "";

    }

}

// ── Kartlar ─────────────────────────────────────────────────

function wName(d, uid) {
    return d.names?.[uid] || (uid === window.firebase?.getCurrentAuthUser?.()?.uid ? "Sen" : "Partnerin");
}

function wPair(d, map) {
    return (d.members || []).map(uid => `${wName(d, uid)} ${wNum(map?.[uid] || 0)}`).join(" · ");
}

function wMonth(month) {
    return WRAPPED_MONTHS[(month || 1) - 1];
}

function wNum(n) {
    return Number(n || 0).toLocaleString("tr-TR");
}

function buildWrappedCards(d) {

    const cards = [];
    const coupleName = (d.members || []).map(uid => wName(d, uid)).join(" & ");

    cards.push({
        kind: "intro",
        emoji: "💞",
        kicker: `Yılımız ${d.year}`,
        title: coupleName,
        lines: [d.startedThisYear
            ? `Birlikte ilk ${wNum(d.daysTogether)} günümüz`
            : `Bu yıl birlikte ${wNum(d.daysTogether)} gün`],
        hint: "Dokun ve başla →"
    });

    const m = d.memories || {};
    if (m.count) {
        cards.push({
            emoji: "📝",
            kicker: "Anılarımız",
            big: m.count,
            suffix: m.count === 1 ? "anı yazdınız" : "anı yazdınız",
            lines: [
                m.topMonth && `En çok ${wMonth(m.topMonth.month)} ayında yazdınız (${m.topMonth.count})`,
                m.topTag && `En sevdiğiniz etiket: ${m.topTag.tag}`,
                wPair(d, m.perAuthor)
            ].filter(Boolean)
        });
    }

    if (m.first?.text) {
        cards.push({
            emoji: "🌱",
            kicker: "Yılın ilk anısı",
            quote: m.first.text,
            lines: [[
                m.first.authorId ? wName(d, m.first.authorId) : "",
                m.first.at ? new Date(m.first.at).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) : ""
            ].filter(Boolean).join(" · ")]
        });
    }

    const p = d.photos || {};
    if (p.count) {
        cards.push({
            emoji: "📸",
            kicker: "Fotoğraflarımız",
            big: p.count,
            suffix: "fotoğraf biriktirdiniz",
            lines: [p.topMonth && `En kalabalık ay: ${wMonth(p.topMonth.month)} (${p.topMonth.count})`].filter(Boolean)
        });
    }

    const s = d.songs || {};
    if (s.count || s.playsTotal) {
        const items = [];
        if (s.count) items.push({ emoji: "💌", text: wPair(d, s.perAuthor), sub: "Kim kaç şarkı bıraktı" });
        if (s.topArtist) items.push({ emoji: "🎤", text: s.topArtist.artist, sub: `En çok bıraktığınız sanatçı · ${s.topArtist.count} şarkı` });
        if (s.first) items.push({ emoji: "🥇", text: [s.first.title, s.first.artist].filter(Boolean).join(" — "), sub: "Yılın ilk şarkısı" });
        if (s.topPlays?.[0]) items.push({ emoji: "🎧", text: [s.topPlays[0].title, s.topPlays[0].artist].filter(Boolean).join(" — "), sub: `En çok "şu an dinliyorum" · ${s.topPlays[0].count} kez` });
        cards.push({
            emoji: "🎵",
            kicker: "Şarkılarımız",
            big: s.count || s.playsTotal,
            suffix: s.count ? "şarkı bıraktınız" : "şarkı paylaştınız",
            list: items
        });
    }

    const x = d.misses || {};
    if (x.total) {
        const top = Object.entries(x.perAuthor || {}).sort((a, b) => b[1] - a[1]);
        const more = top.length > 1 && top[0][1] > top[1][1] ? wName(d, top[0][0]) : null;
        cards.push({
            emoji: "💗",
            kicker: "Özledim",
            big: x.total,
            suffix: "kere özlediniz",
            lines: [
                wPair(d, x.perAuthor),
                more && `Daha çok özleyen: ${more} 😏`,
                x.max?.count > 1 && `Tek seferde en uzun seri: x${wNum(x.max.count)}`
            ].filter(Boolean)
        });
    }

    const t = d.together || {};
    if (t.days) {
        cards.push({
            emoji: "🫶",
            kicker: "Yan yana",
            big: t.days,
            suffix: "gün yan yanaydınız",
            lines: [t.topMonth && `En çok ${wMonth(t.topMonth.month)} ayında (${t.topMonth.count} gün)`].filter(Boolean)
        });
    }

    if (d.streakBest >= 2) {
        cards.push({
            emoji: "🔥",
            kicker: "Seri",
            big: d.streakBest,
            suffix: "günlük en uzun seriniz",
            lines: [`Tam ${wNum(d.streakBest)} gün boyunca bir gün bile birbirinizden kopmadınız 💜`]
        });
    }

    const moods = (d.members || []).map(uid => [uid, d.moods?.[uid]]).filter(([, v]) => v);
    if (moods.length) {
        cards.push({
            emoji: "🌈",
            kicker: "Ruh hâliniz",
            title: "Bu yıl en çok…",
            list: moods.map(([uid, v]) => {
                const [emoji, label] = WRAPPED_MOODS[v.mood] || ["💜", v.mood];
                return { emoji, text: `${wName(d, uid)}: ${label}`, sub: `${v.count} kez` };
            })
        });
    }

    const q = d.questions || {};
    const letters = d.letters?.count || 0;
    if (q.both || letters) {
        cards.push({
            emoji: "💬",
            kicker: "Konuşmalarımız",
            big: q.both || letters,
            suffix: q.both ? "soruyu birlikte cevapladınız" : "mühürlü mektup yazdınız",
            lines: [
                q.both && letters && `💌 ${letters} mühürlü mektup`,
                q.both && wPair(d, q.perAuthor) + " cevap"
            ].filter(Boolean)
        });
    }

    const dr = d.dreams || {};
    if (dr.done) {
        cards.push({
            emoji: "✨",
            kicker: "Hayallerimiz",
            big: dr.done,
            suffix: dr.done === 1 ? "hayal gerçekleşti" : "hayal gerçekleşti",
            list: (dr.doneList || []).map(x => ({ emoji: x.emoji, text: x.title }))
        });
    } else if (dr.added) {
        cards.push({
            emoji: "✨",
            kicker: "Hayallerimiz",
            big: dr.added,
            suffix: "yeni hayal kurdunuz",
            lines: ["Gelecek yıl gerçekleşsin 💜"]
        });
    }

    const stats = [
        [m.count, "anı"], [p.count, "fotoğraf"], [s.count, "şarkı"],
        [x.total, "özledim"], [t.days, "gün yan yana"], [d.streakBest, "gün seri"]
    ].filter(([n]) => n);

    cards.push({
        kind: "outro",
        emoji: "💜",
        kicker: `${d.year} özetimiz`,
        title: coupleName,
        stats,
        lines: ["Nice yıllara 🥂"]
    });

    return cards;

}

// ── Görüntüleyici ───────────────────────────────────────────

async function openWrapped(refresh = false) {

    closeWrapped(true);

    const wrap = document.createElement("div");

    wrap.id = "wrapped";
    wrap.className = "wr-wrap";
    wrap.innerHTML = `
        <div class="wr-bars" id="wrBars"></div>
        <button class="wr-close" type="button" aria-label="Kapat">✕</button>
        <div class="wr-stage" id="wrStage">
            <div class="wr-loading"><div class="wr-spinner"></div>${yearYour(wrappedYear())} hazırlanıyor…</div>
        </div>
        <button class="wr-share" id="wrShare" type="button" style="display:none;">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>
            Paylaş
        </button>
    `;

    // Temaya özel sahne (Kar Tanesi, Gece Mavisi, Orman, Sakura)
    const scene = wrappedScene();
    if (scene) {
        wrap.dataset.scene = scene;
        wrap.querySelector("#wrStage").insertAdjacentHTML("afterend", wrappedSceneHtml(scene));
    }

    document.body.appendChild(wrap);

    wrap.querySelector(".wr-close").addEventListener("click", () => closeWrapped());
    wrap.querySelector("#wrShare").addEventListener("click", e => { e.stopPropagation(); shareWrappedCard(); });
    wrap.querySelector("#wrStage").addEventListener("click", e => {
        if (!wrappedCards.length) return;
        const x = e.clientX / window.innerWidth;
        showWrappedCard(wrappedIndex + (x < 0.3 ? -1 : 1));
    });

    requestAnimationFrame(() => wrap.classList.add("show"));

    try {

        wrappedData = await window.firebase.getWrapped(wrappedYear(), refresh);
        wrappedCards = buildWrappedCards(wrappedData);
        wrappedIndex = 0;

        document.getElementById("wrBars").innerHTML = wrappedCards.map(() => "<i><b></b></i>").join("");
        document.getElementById("wrShare").style.display = "";

        showWrappedCard(0);

    } catch (error) {

        console.error("Yılımız alınamadı:", error);

        const stage = document.getElementById("wrStage");
        if (stage) stage.innerHTML = `<div class="wr-loading">Özet hazırlanamadı 😢<br><small>İnternetini kontrol edip tekrar dene.</small></div>`;

    }

}

function closeWrapped(instant = false) {

    const wrap = document.getElementById("wrapped");

    if (!wrap) return false;

    if (instant) {
        wrap.remove();
        return true;
    }

    wrap.classList.remove("show");
    setTimeout(() => wrap.remove(), 260);

    return true;

}

function wrappedCardHtml(card) {

    const esc = v => (typeof escapeNow === "function" ? escapeNow(v) : String(v ?? ""));

    return `
        <div class="wr-emoji">${card.emoji || ""}</div>
        ${card.kicker ? `<div class="wr-kicker">${esc(card.kicker)}</div>` : ""}
        ${card.title ? `<div class="wr-title">${esc(card.title)}</div>` : ""}
        ${card.big !== undefined ? `<div class="wr-big" data-count="${card.big}">0</div>` : ""}
        ${card.suffix ? `<div class="wr-suffix">${esc(card.suffix)}</div>` : ""}
        ${card.quote ? `<div class="wr-quote">“${esc(card.quote)}”</div>` : ""}
        ${card.stats ? `<div class="wr-stats">${card.stats.map(([n, label]) => `
            <div><b>${wNum(n)}</b><span>${esc(label)}</span></div>`).join("")}</div>` : ""}
        ${card.list ? `<div class="wr-list">${card.list.map(item => `
            <div class="wr-item"><span class="wr-item-emoji">${item.emoji || ""}</span>
                <span><b>${esc(item.text)}</b>${item.sub ? `<small>${esc(item.sub)}</small>` : ""}</span></div>`).join("")}</div>` : ""}
        ${(card.lines || []).map(line => `<div class="wr-line">${esc(line)}</div>`).join("")}
        ${card.hint ? `<div class="wr-hint">${esc(card.hint)}</div>` : ""}
    `;

}

function showWrappedCard(index) {

    if (index < 0) index = 0;

    if (index >= wrappedCards.length) {
        closeWrapped();
        return;
    }

    wrappedIndex = index;

    const stage = document.getElementById("wrStage");
    const card = wrappedCards[index];

    stage.className = `wr-stage wr-bg-${index % 5}${card.kind ? " wr-" + card.kind : ""}`;
    stage.innerHTML = `<div class="wr-card">${wrappedCardHtml(card)}</div>`;

    document.querySelectorAll("#wrBars i").forEach((bar, i) => {
        bar.classList.toggle("done", i < index);
        bar.classList.toggle("now", i === index);
    });

    // Sayı sayarak artsın
    const big = stage.querySelector(".wr-big");

    if (big) {
        const target = Number(big.dataset.count) || 0;
        const start = performance.now();
        const dur = Math.min(1400, 500 + target * 2);
        const step = now => {
            const t = Math.min(1, (now - start) / dur);
            const eased = 1 - Math.pow(1 - t, 3);
            big.textContent = wNum(Math.round(target * eased));
            if (t < 1 && document.body.contains(big)) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    window.appHaptics?.light?.();

}

// ── Paylaşılabilir görsel (1080×1920) ───────────────────────

function wrappedColors(index) {

    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim() || "#c084fc";
    const accent2 = css.getPropertyValue("--accent2").trim() || "#f472b6";

    const scene = wrappedScene();
    if (scene) return WRAPPED_SCENES[scene][index % 5];

    const sets = [
        [accent, accent2, "#1a0b2e"],
        [accent2, "#1a0b2e", accent],
        ["#1a0b2e", accent, accent2],
        [accent, "#0d0720", accent2],
        [accent2, accent, "#0d0720"]
    ];

    return sets[index % sets.length];

}

function wrapText(ctx, text, maxWidth) {

    const words = String(text).split(/\s+/);
    const lines = [];
    let line = "";

    for (const word of words) {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    }

    if (line) lines.push(line);

    return lines;

}

async function renderWrappedImage(card, index) {

    const W = 1080, H = 1920, PAD = 110, MAXW = W - PAD * 2;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext("2d");
    const [c1, c2, c3] = wrappedColors(index);

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, c1);
    g.addColorStop(0.55, c2);
    g.addColorStop(1, c3);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const scene = wrappedScene();
    if (scene) drawWrappedScene(ctx, W, H, scene, index);

    // Okunurluk için hafif karartma
    ctx.fillStyle = scene ? "rgba(10, 4, 24, .22)" : "rgba(10, 4, 24, .38)";
    ctx.fillRect(0, 0, W, H);

    try {
        await Promise.all([
            document.fonts.load("600 200px 'Playfair Display'"),
            document.fonts.load("700 60px Inter"),
            document.fonts.load("500 44px Inter")
        ]);
    } catch {}

    const serif = "'Playfair Display', Georgia, serif";
    const sans = "Inter, system-ui, sans-serif";

    // Önce yükseklikleri ölç, sonra ortala
    const blocks = [];
    const add = (font, color, text, lineH, gap = 0, align = "center", maxW = MAXW) => {
        ctx.font = font;
        const lines = wrapText(ctx, text, maxW);
        blocks.push({ font, color, lines, lineH, gap, align });
    };

    if (card.emoji) add(`150px ${sans}`, "#fff", card.emoji, 170, 20);
    if (card.kicker) add(`700 40px ${sans}`, "rgba(255,255,255,.85)", card.kicker.toLocaleUpperCase("tr-TR"), 56, 18);
    if (card.title) add(`600 84px ${serif}`, "#fff", card.title, 100, 16);
    if (card.big !== undefined) add(`600 230px ${serif}`, "#fff", wNum(card.big), 250, 0);
    if (card.suffix) add(`600 54px ${sans}`, "#fff", card.suffix, 70, 36);
    if (card.quote) add(`italic 600 64px ${serif}`, "#fff", `“${card.quote}”`, 86, 30);

    if (card.stats) {
        blocks.push({ stats: card.stats, height: Math.ceil(card.stats.length / 2) * 190 + 20 });
    }

    for (const item of card.list || []) {
        add(`600 48px ${sans}`, "#fff", `${item.emoji || ""}  ${item.text}`, 62, 0);
        if (item.sub) add(`400 36px ${sans}`, "rgba(255,255,255,.75)", item.sub, 50, 0);
        blocks[blocks.length - 1].gap = 26;
    }

    for (const line of card.lines || []) add(`500 44px ${sans}`, "rgba(255,255,255,.92)", line, 60, 14);

    const total = blocks.reduce((sum, b) => sum + (b.stats ? b.height : b.lines.length * b.lineH) + (b.gap || 0), 0);

    let y = Math.max(220, (H - total) / 2 - 40);

    ctx.textBaseline = "top";

    for (const b of blocks) {

        if (b.stats) {
            const colW = MAXW / 2;
            b.stats.forEach(([n, label], i) => {
                const cx = PAD + colW * (i % 2) + colW / 2;
                const cy = y + Math.floor(i / 2) * 190;
                ctx.textAlign = "center";
                ctx.fillStyle = "#fff";
                ctx.font = `600 96px ${serif}`;
                ctx.fillText(wNum(n), cx, cy);
                ctx.font = `500 36px ${sans}`;
                ctx.fillStyle = "rgba(255,255,255,.8)";
                ctx.fillText(label, cx, cy + 112);
            });
            y += b.height;
            continue;
        }

        ctx.font = b.font;
        ctx.fillStyle = b.color;
        ctx.textAlign = "center";

        for (const line of b.lines) {
            ctx.fillText(line, W / 2, y);
            y += b.lineH;
        }

        y += b.gap || 0;

    }

    // Alt imza
    ctx.textAlign = "center";
    ctx.font = `600 40px ${serif}`;
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.fillText("Kalp Kalbe", W / 2, H - 170);
    ctx.font = `500 30px ${sans}`;
    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.fillText(`Yılımız ${wrappedData?.year || ""}`, W / 2, H - 118);

    return canvas.toDataURL("image/png");

}

async function shareWrappedCard() {

    const card = wrappedCards[wrappedIndex];

    if (!card) return;

    const btn = document.getElementById("wrShare");

    if (btn?.disabled) return;
    if (btn) btn.disabled = true;

    try {

        const dataUrl = await renderWrappedImage(card, wrappedIndex);
        const name = `kalpkalbe-yilimiz-${wrappedData?.year}-${wrappedIndex + 1}`;
        const text = `Yılımız ${wrappedData?.year} 💜 #KalpKalbe`;

        if (window.Capacitor?.isNativePlatform?.() && window.appShareImage) {
            await window.appShareImage(dataUrl, name, text);
            return;
        }

        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `${name}.png`, { type: "image/png" });

        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text });
            return;
        }

        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `${name}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        showToast("📥 Görsel indirildi");

    } catch (error) {

        if (error?.name !== "AbortError" && !/cancel/i.test(error?.message || "")) {
            console.error("Paylaşılamadı:", error);
            showToast("Paylaşılamadı, tekrar dene.");
        }

    } finally {

        if (btn) btn.disabled = false;

    }

}

// ── Temaya özel Yılımız sahneleri ───────────────────────────
// Kar Tanesi, Gece Mavisi, Orman ve Sakura temalarında hikâyenin
// arkasında o temaya özel bir sahne oynar. Paylaşılan görsel de
// aynı sahnenin durağan hâlini taşır. Diğer temalar eskisi gibi.

const WRAPPED_SCENES = {
    kis: [
        ["#0d2140", "#3f6f9f", "#a9cdee"],
        ["#123058", "#5d8fbf", "#0b1a33"],
        ["#9cc4e8", "#3c6a99", "#0c1f3b"],
        ["#0b1a33", "#2c5a8a", "#8fb9e0"],
        ["#4b7cad", "#163a63", "#0a1830"]
    ],
    gece: [
        ["#050b2e", "#0f1d5c", "#27348f"],
        ["#0b1748", "#1c2b78", "#05081f"],
        ["#1a2470", "#0a1240", "#03061a"],
        ["#03061a", "#0f1d5c", "#2f2a86"],
        ["#0f1d5c", "#050b2e", "#1c1550"]
    ],
    orman: [
        ["#123826", "#0c2218", "#04100a"],
        ["#1d4d33", "#0e2a1c", "#050f09"],
        ["#0a1f15", "#1a4630", "#06140d"],
        ["#2a5a3a", "#0f2d1e", "#030a06"],
        ["#0c2218", "#24553a", "#06140d"]
    ],
    sakura: [
        ["#f3a6c3", "#c25a8a", "#5a1f45"],
        ["#e88db2", "#9b3f70", "#3f1431"],
        ["#c25a8a", "#f0a3c0", "#6b2852"],
        ["#7a2e5c", "#d978a3", "#f6bdd2"],
        ["#e27fa8", "#7a2e5c", "#3f1431"]
    ]
};

// Sakura dalı (viewBox 0 0 400 300, sol üst köşeden uzanır)
const SAKURA_BRANCH = "M-10 40 C 60 50 110 70 170 110 C 210 135 250 150 300 158 M 120 80 C 135 50 150 35 175 22 M 210 132 C 220 165 225 190 240 215 M 60 52 C 70 80 72 100 66 125";
const SAKURA_FLOWERS = [[175, 22, 13], [300, 158, 14], [240, 215, 12], [66, 125, 11], [150, 95, 10], [255, 150, 9], [110, 66, 9], [200, 125, 8], [30, 45, 9]];

function wrappedScene() {
    const id = typeof currentTheme !== "undefined" ? currentTheme : null;
    return id && WRAPPED_SCENES[id] ? id : null;
}

// Aynı tohumla hep aynı dağılım (paylaşılan görsel her seferinde aynı)
function wrSeeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// Çam ağaçları: [x, taban y, yükseklik, genişlik] (0..1 oranları)
function wrPines(seed, count, baseY, minH, maxH) {
    const r = wrSeeded(seed);
    const trees = [];
    for (let i = 0; i < count; i++) {
        const x = (i + r() * .6) / count;
        const h = minH + r() * (maxH - minH);
        trees.push([x, baseY + r() * .02, h, h * (.42 + r() * .1)]);
    }
    return trees;
}

function wrPinePoints(tree, W, H) {
    const [x, by, h, w] = tree;
    const cx = x * W, base = by * H, top = base - h * H, half = w * W / 2;
    // Üç kat dal
    const pts = [];
    const tiers = [[0, .45, .55], [.3, .75, .78], [.55, 1, 1]];
    for (const [t0, t1, wf] of tiers) {
        const y0 = top + (base - top) * t0;
        const y1 = top + (base - top) * t1;
        pts.push([[cx, y0], [cx + half * wf, y1], [cx - half * wf, y1]]);
    }
    pts.push([[cx - half * .08, base - (base - top) * .02], [cx + half * .08, base - (base - top) * .02], [cx + half * .08, base + 6], [cx - half * .08, base + 6]]);
    return pts;
}

function wrPineSvg(trees, fill) {
    const W = 400, H = 800;
    const polys = trees.map(t => wrPinePoints(t, W, H)
        .map(p => `<polygon points="${p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ")}"/>`).join("")).join("");
    return `<svg viewBox="0 0 400 800" preserveAspectRatio="none"><g fill="${fill}">${polys}</g><rect x="0" y="${(trees[0]?.[1] || .95) * H}" width="400" height="80" fill="${fill}"/></svg>`;
}

function wrappedSceneHtml(scene) {

    const r = Math.random;
    const rnd = (a, b) => a + r() * (b - a);
    const items = [];

    if (scene === "kis") {
        // Üç derinlikte kar: uzakta küçük ve yavaş, yakında büyük ve bulanık
        for (let i = 0; i < 40; i++) {
            const s = rnd(2, 4);
            items.push(`<i class="wrs-dot" style="left:${rnd(0, 100)}%;width:${s}px;height:${s}px;animation-duration:${rnd(12, 20).toFixed(1)}s,${rnd(3, 6).toFixed(1)}s;animation-delay:-${rnd(0, 20).toFixed(1)}s,-${rnd(0, 6).toFixed(1)}s"></i>`);
        }
        for (let i = 0; i < 22; i++) {
            items.push(`<i class="wrs-flake" style="left:${rnd(0, 100)}%;font-size:${rnd(14, 24).toFixed(0)}px;opacity:${rnd(.6, .95).toFixed(2)};animation-duration:${rnd(8, 14).toFixed(1)}s,${rnd(3, 6).toFixed(1)}s;animation-delay:-${rnd(0, 14).toFixed(1)}s,-${rnd(0, 6).toFixed(1)}s">❄</i>`);
        }
        for (let i = 0; i < 4; i++) {
            items.push(`<i class="wrs-flake near" style="left:${rnd(0, 100)}%;font-size:${rnd(40, 60).toFixed(0)}px;animation-duration:${rnd(6, 9).toFixed(1)}s,${rnd(4, 7).toFixed(1)}s;animation-delay:-${rnd(0, 9).toFixed(1)}s,-${rnd(0, 7).toFixed(1)}s">❄</i>`);
        }
        items.push(`<i class="wrs-frost"></i>`);
        items.push(`<i class="wrs-snowbank"><svg viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 30 C 60 10 110 40 170 24 C 230 8 290 36 340 20 C 370 12 390 18 400 22 L400 60 L0 60Z" fill="rgba(235,245,255,.9)"/><path d="M0 44 C 80 30 140 52 220 38 C 290 26 340 48 400 36 L400 60 L0 60Z" fill="#fff"/></svg></i>`);
    }

    if (scene === "gece") {
        items.push(`<i class="wrs-aurora"></i><i class="wrs-aurora two"></i>`);
        for (let i = 0; i < 90; i++) {
            const s = r() < .12 ? rnd(2.4, 3.4) : rnd(1, 2);
            items.push(`<i class="wrs-star" style="left:${rnd(0, 100)}%;top:${rnd(0, 88)}%;width:${s}px;height:${s}px;animation-duration:${rnd(2.5, 6).toFixed(1)}s;animation-delay:-${rnd(0, 6).toFixed(1)}s"></i>`);
        }
        items.push(`<i class="wrs-moon"></i>`);
        items.push(`<i class="wrs-shoot" style="top:14%;left:78%;animation-delay:2s"></i>`);
        items.push(`<i class="wrs-shoot" style="top:34%;left:95%;animation-delay:7.5s"></i>`);
    }

    if (scene === "orman") {
        items.push(`<i class="wrs-rays"></i>`);
        items.push(`<i class="wrs-pines far">${wrPineSvg(wrPines(7, 9, .93, .18, .3), "rgba(6,22,14,.75)")}</i>`);
        items.push(`<i class="wrs-mist"></i>`);
        items.push(`<i class="wrs-pines near">${wrPineSvg(wrPines(21, 6, .97, .22, .36), "#020805")}</i>`);
        for (let i = 0; i < 26; i++) {
            const s = rnd(3, 6);
            items.push(`<i class="wrs-fly" style="left:${rnd(0, 100)}%;top:${rnd(8, 92)}%;width:${s}px;height:${s}px;animation-duration:${rnd(2.5, 5.5).toFixed(1)}s,${rnd(12, 24).toFixed(1)}s;animation-delay:-${rnd(0, 6).toFixed(1)}s,-${rnd(0, 24).toFixed(1)}s"></i>`);
        }
    }

    if (scene === "sakura") {
        for (let i = 0; i < 6; i++) {
            const s = rnd(60, 140);
            items.push(`<i class="wrs-bokeh" style="left:${rnd(-10, 90)}%;top:${rnd(10, 85)}%;width:${s}px;height:${s}px;animation-delay:-${rnd(0, 10).toFixed(1)}s"></i>`);
        }
        const flowers = SAKURA_FLOWERS.map(([x, y, s]) => {
            const petals = [0, 72, 144, 216, 288].map(a =>
                `<ellipse cx="${x}" cy="${y - s * .55}" rx="${(s * .42).toFixed(1)}" ry="${(s * .58).toFixed(1)}" transform="rotate(${a} ${x} ${y})"/>`).join("");
            return `<g fill="#ffd3e2">${petals}</g><circle cx="${x}" cy="${y}" r="${(s * .22).toFixed(1)}" fill="#e2668f"/>`;
        }).join("");
        items.push(`<i class="wrs-branch"><svg viewBox="0 0 400 300"><path d="${SAKURA_BRANCH}" fill="none" stroke="#3b1426" stroke-width="7" stroke-linecap="round"/>${flowers}</svg></i>`);
        for (let i = 0; i < 26; i++) {
            const s = rnd(9, 18);
            items.push(`<i class="wrs-petal" style="left:${rnd(0, 100)}%;width:${s}px;height:${(s * .65).toFixed(1)}px;opacity:${rnd(.6, .95).toFixed(2)};animation-duration:${rnd(9, 16).toFixed(1)}s,${rnd(3, 6).toFixed(1)}s;animation-delay:-${rnd(0, 16).toFixed(1)}s,-${rnd(0, 6).toFixed(1)}s"></i>`);
        }
    }

    const still = typeof themeFxEnabled === "function" && !themeFxEnabled();

    return `<div class="wr-scene wrs-${scene}${still ? " still" : ""}" aria-hidden="true">${items.join("")}</div>`;

}

// Paylaşılan görsel için sahnenin durağan çizimi (yazılardan önce)
function drawWrappedScene(ctx, W, H, scene, index) {

    const r = wrSeeded(1000 + index * 97);
    const rnd = (a, b) => a + r() * (b - a);

    const snowflake = (x, y, size, alpha) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rnd(0, Math.PI));
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = Math.max(1.5, size / 12);
        ctx.lineCap = "round";
        for (let k = 0; k < 6; k++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(0, -size / 2);
            ctx.moveTo(0, -size * .3); ctx.lineTo(size * .12, -size * .4);
            ctx.moveTo(0, -size * .3); ctx.lineTo(-size * .12, -size * .4);
            ctx.stroke();
        }
        ctx.restore();
    };

    const glow = (x, y, rad, color) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };

    if (scene === "kis") {
        glow(W * .5, 0, W * .9, "rgba(200,230,255,.25)");
        for (let i = 0; i < 90; i++) {
            ctx.fillStyle = `rgba(255,255,255,${rnd(.4, .9).toFixed(2)})`;
            ctx.beginPath(); ctx.arc(rnd(0, W), rnd(0, H), rnd(2, 6), 0, Math.PI * 2); ctx.fill();
        }
        for (let i = 0; i < 26; i++) snowflake(rnd(0, W), rnd(0, H * .92), rnd(30, 70), rnd(.5, .9).toFixed(2));
        for (let i = 0; i < 3; i++) snowflake(rnd(0, W), rnd(0, H * .8), rnd(120, 170), .18);
        // Kar yığını imzanın altında kalsın
        ctx.fillStyle = "rgba(235,245,255,.9)";
        ctx.beginPath(); ctx.moveTo(0, H - 60);
        ctx.bezierCurveTo(W * .3, H - 95, W * .55, H - 40, W, H - 75);
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.moveTo(0, H - 30);
        ctx.bezierCurveTo(W * .35, H - 60, W * .6, H - 15, W, H - 45);
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    }

    if (scene === "gece") {
        const band = (y, c1, c2) => {
            ctx.save();
            ctx.filter = "blur(60px)";
            const g = ctx.createLinearGradient(0, y - 120, W, y + 120);
            g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(.35, c1); g.addColorStop(.7, c2); g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.ellipse(W / 2, y, W * .75, 110, -.25, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        };
        band(H * .2, "rgba(80,255,190,.35)", "rgba(120,110,255,.3)");
        band(H * .3, "rgba(150,90,255,.22)", "rgba(80,220,255,.2)");
        for (let i = 0; i < 220; i++) {
            const s = r() < .1 ? rnd(3, 5) : rnd(1.2, 2.6);
            ctx.fillStyle = `rgba(255,255,255,${rnd(.35, 1).toFixed(2)})`;
            ctx.beginPath(); ctx.arc(rnd(0, W), rnd(0, H * .9), s, 0, Math.PI * 2); ctx.fill();
        }
        glow(150, 230, 160, "rgba(243,226,166,.35)");
        // Hilal: ayrı tuvalde kesip yapıştır (arka plan silinmesin)
        const moon = document.createElement("canvas");
        moon.width = moon.height = 140;
        const mc = moon.getContext("2d");
        mc.fillStyle = "#f3e2a6";
        mc.beginPath(); mc.arc(70, 70, 62, 0, Math.PI * 2); mc.fill();
        mc.globalCompositeOperation = "destination-out";
        mc.beginPath(); mc.arc(98, 52, 56, 0, Math.PI * 2); mc.fill();
        ctx.drawImage(moon, 80, 160);
        ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 3;
        const sg = ctx.createLinearGradient(820, 260, 620, 360);
        sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(1, "#fff");
        ctx.strokeStyle = sg;
        ctx.beginPath(); ctx.moveTo(880, 230); ctx.lineTo(640, 350); ctx.stroke();
    }

    if (scene === "orman") {
        ctx.save();
        ctx.globalAlpha = .18;
        for (let i = 0; i < 4; i++) {
            const x = W * (.15 + i * .22);
            const g = ctx.createLinearGradient(x, 0, x + 260, H * .8);
            g.addColorStop(0, "rgba(220,255,200,.9)"); g.addColorStop(1, "rgba(220,255,200,0)");
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 70, 0); ctx.lineTo(x + 330, H * .8); ctx.lineTo(x + 200, H * .8); ctx.fill();
        }
        ctx.restore();
        const drawPines = (trees, fill) => {
            ctx.fillStyle = fill;
            for (const t of trees) for (const poly of wrPinePoints(t, W, H)) {
                ctx.beginPath(); poly.forEach(([a, b], k) => (k ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill();
            }
            ctx.fillRect(0, (trees[0]?.[1] || .95) * H, W, H);
        };
        drawPines(wrPines(7, 9, .93, .18, .3), "rgba(6,22,14,.75)");
        const mg = ctx.createLinearGradient(0, H * .72, 0, H * .9);
        mg.addColorStop(0, "rgba(200,230,210,0)"); mg.addColorStop(.5, "rgba(200,230,210,.16)"); mg.addColorStop(1, "rgba(200,230,210,0)");
        ctx.fillStyle = mg; ctx.fillRect(0, H * .72, W, H * .18);
        drawPines(wrPines(21, 6, .97, .22, .36), "#020805");
        for (let i = 0; i < 40; i++) {
            const x = rnd(0, W), y = rnd(H * .08, H * .9), s = rnd(4, 9);
            glow(x, y, s * 6, `rgba(225,255,120,${rnd(.25, .55).toFixed(2)})`);
            ctx.fillStyle = "#f2ffb8";
            ctx.beginPath(); ctx.arc(x, y, s / 2, 0, Math.PI * 2); ctx.fill();
        }
    }

    if (scene === "sakura") {
        for (let i = 0; i < 7; i++) glow(rnd(0, W), rnd(H * .1, H * .85), rnd(120, 260), "rgba(255,220,235,.22)");
        ctx.save();
        const k = W * .7 / 400;
        ctx.scale(k, k);
        ctx.strokeStyle = "#3b1426"; ctx.lineWidth = 7; ctx.lineCap = "round";
        ctx.stroke(new Path2D(SAKURA_BRANCH));
        for (const [x, y, s] of SAKURA_FLOWERS) {
            ctx.fillStyle = "#ffd3e2";
            for (const a of [0, 72, 144, 216, 288]) {
                ctx.save(); ctx.translate(x, y); ctx.rotate(a * Math.PI / 180);
                ctx.beginPath(); ctx.ellipse(0, -s * .55, s * .42, s * .58, 0, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
            ctx.fillStyle = "#e2668f";
            ctx.beginPath(); ctx.arc(x, y, s * .22, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        for (let i = 0; i < 46; i++) {
            const s = rnd(18, 36);
            ctx.save();
            ctx.translate(rnd(0, W), rnd(H * .1, H));
            ctx.rotate(rnd(0, Math.PI * 2));
            ctx.globalAlpha = rnd(.55, .95);
            const pg = ctx.createLinearGradient(-s / 2, 0, s / 2, 0);
            pg.addColorStop(0, "#ffd6e5"); pg.addColorStop(1, "#f2a3c1");
            ctx.fillStyle = pg;
            ctx.beginPath(); ctx.ellipse(0, 0, s / 2, s * .32, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    }

}

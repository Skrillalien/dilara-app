// ─────────────────────────────────────────────────────────────
// Yılımız: yıl sonu özeti
//
// • Aralık başından 15 Ocak'a kadar ana sayfada ve Biz'de
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
let wrappedStarted = false;

// Gösterilecek yıl: Aralık → bu yıl, 1-15 Ocak → geçen yıl
function wrappedSeasonYear(now = new Date()) {

    const month = now.getMonth();

    if (month === 11) return now.getFullYear();
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

    // Okunurluk için hafif karartma
    ctx.fillStyle = "rgba(10, 4, 24, .38)";
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

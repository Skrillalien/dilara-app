// ─────────────────────────────────────────────────────────────
// Şu an dinliyorum
//
// • Kişi bir şarkı bağlantısını 5 dakikalığına paylaşır; ana
//   sayfanın üstünde dönen plak + şarkı adı görünür, dokununca
//   şarkı açılır. 5 dakika sonra kaybolur (sunucu da siler).
// • Spotify / YouTube → Paylaş → Kalp Kalbe (Android) ya da
//   Şarkılarımız → "Şu an dinliyorum" ile paylaşılır
// • Aynı pencereden şarkı istenirse Şarkılarımız'a da eklenir
// ─────────────────────────────────────────────────────────────

let nowItems = [];
let nowStarted = false;
let nowTicker = null;
let nowPendingShare = null;
let nowSheetMeta = null;
let nowSheetReq = 0;

// ── Paylaşılan metinden bağlantı çıkar ──────────────────────

function extractShareLink(text) {

    const match = String(text || "").match(/https?:\/\/[^\s<>"']+/i);

    return match ? match[0].replace(/[).,!?]+$/, "") : null;

}

// Bazı uygulamalar metne "Şarkı - Sanatçı" ya da "X by Y" ekler
function guessTitleArtist(text, link) {

    const rest = String(text || "").replace(link || "", "").replace(/\s+/g, " ").trim()
        .replace(/^(listen to|check out|dinle|şunu dinle)\s+/i, "")
        .replace(/\s+on spotify$/i, "")
        .replace(/[:\-–]\s*$/, "")
        .trim();

    if (!rest || rest.length > 140) return {};

    let m = rest.match(/^(.+?)\s+by\s+(.+)$/i);
    if (m) return { title: m[1].trim(), artist: m[2].trim() };

    m = rest.match(/^(.+?)\s+[-–·]\s+(.+)$/);
    if (m) return { title: m[1].trim(), artist: m[2].trim() };

    return { title: rest };

}

// ── Gelen paylaşım (Android "Paylaş" / web paylaşım hedefi) ──

function receiveSharedText(text, subject = "") {

    const link = extractShareLink(text) || extractShareLink(subject);

    if (!link) {
        showToast("Paylaşılan içerikte bir şarkı bağlantısı bulamadım.");
        return;
    }

    const guess = guessTitleArtist(subject || text, link);

    const share = { link, ...guess };

    // Henüz giriş / çift hazır değilse sonra aç
    if (!window.isCoupleReady) {
        nowPendingShare = share;
        return;
    }

    openNowPlayingSheet(share);

}

function sharedFromUrl(url) {

    try {

        const u = new URL(url);

        if (u.protocol !== "kalpkalbe:" || (u.host || u.pathname.replace(/^\/+/, "").split("/")[0]) !== "paylas") return false;

        receiveSharedText(u.searchParams.get("text") || "", u.searchParams.get("subject") || "");

        return true;

    } catch {
        return false;
    }

}

function initNowPlayingShareIn() {

    // Web (Android'de ana ekrana eklenmiş uygulama): ?paylas=1&text=…
    const params = new URLSearchParams(location.search);

    if (params.get("paylas")) {

        const text = [params.get("title"), params.get("text"), params.get("url")].filter(Boolean).join(" ");

        ["paylas", "title", "text", "url"].forEach(k => params.delete(k));

        const rest = params.toString();
        history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);

        if (text) receiveSharedText(text, params.get("title") || "");

    }

    // Android uygulaması
    const App = window.Capacitor?.Plugins?.App;

    if (window.Capacitor?.isNativePlatform?.() && App) {

        App.getLaunchUrl?.().then(r => r?.url && sharedFromUrl(r.url)).catch(() => {});

        App.addListener("appUrlOpen", e => e?.url && sharedFromUrl(e.url));

    }

}

// ── Paylaşım penceresi ──────────────────────────────────────

function openNowPlayingSheet(prefill = {}) {

    closeNowPlayingSheet(true);

    const wrap = document.createElement("div");

    wrap.id = "nowSheet";
    wrap.className = "np-sheet-wrap";

    wrap.innerHTML = `
        <div class="np-sheet" role="dialog" aria-label="Şu an dinliyorum">
            <div class="np-sheet-handle"></div>
            <div class="np-sheet-title">🎧 Şu an ne dinliyorsun?</div>
            <div class="np-sheet-sub">Partnerinin ana sayfasında 5 dakika görünür, dokununca şarkı açılır.</div>

            <input id="nowLink" class="song-input np-input" type="text" inputmode="url"
                placeholder="Spotify / YouTube linki" autocomplete="off">

            <div id="nowPreview" class="np-preview" style="display:none;"></div>

            <button class="np-btn primary" id="nowShareBtn" type="button">🎧 Şu an dinliyorum · 5 dk</button>
            <button class="np-btn" id="nowSaveBtn" type="button">➕ Şarkılarımıza ekle</button>
        </div>
    `;

    document.body.appendChild(wrap);

    const input = wrap.querySelector("#nowLink");

    input.value = prefill.link || "";

    nowSheetMeta = { title: prefill.title || "", artist: prefill.artist || "" };

    input.addEventListener("input", () => updateNowPreview());
    input.addEventListener("paste", () => setTimeout(updateNowPreview, 0));

    wrap.addEventListener("click", e => { if (e.target === wrap) closeNowPlayingSheet(); });
    wrap.querySelector("#nowShareBtn").addEventListener("click", e => submitNowPlaying(e.currentTarget));
    wrap.querySelector("#nowSaveBtn").addEventListener("click", e => saveSharedSong(e.currentTarget));

    requestAnimationFrame(() => wrap.classList.add("show"));

    if (input.value) updateNowPreview();
    else setTimeout(() => input.focus(), 250);

}

function closeNowPlayingSheet(instant = false) {

    const wrap = document.getElementById("nowSheet");

    if (!wrap) return false;

    if (instant) {
        wrap.remove();
        return true;
    }

    wrap.classList.remove("show");
    setTimeout(() => wrap.remove(), 260);

    return true;

}

async function updateNowPreview() {

    const link = document.getElementById("nowLink")?.value.trim();
    const box = document.getElementById("nowPreview");

    if (!box) return;

    const platform = typeof detectSongPlatform === "function" ? detectSongPlatform(link) : null;

    if (!link || !platform) {
        box.style.display = "none";
        return;
    }

    const req = ++nowSheetReq;

    box.style.display = "";
    box.innerHTML = `<div class="np-preview-text">Şarkı bilgisi alınıyor…</div>`;

    const meta = typeof fetchSongMeta === "function" ? await fetchSongMeta(link) : { platform };

    if (req !== nowSheetReq) return;

    nowSheetMeta = {
        ...nowSheetMeta,
        platform,
        title: meta.title || nowSheetMeta?.title || "",
        artist: meta.artist || nowSheetMeta?.artist || "",
        cover: meta.cover || null
    };

    const art = nowSheetMeta.cover
        ? `<img src="${escapeNow(nowSheetMeta.cover)}" alt="">`
        : `<span class="np-preview-note">♪</span>`;

    box.innerHTML = `
        <div class="np-preview-art">${art}</div>
        <div class="np-preview-text">
            <b>${escapeNow(nowSheetMeta.title || "Şarkı")}</b>
            <span>${escapeNow(nowSheetMeta.artist || songPlatformLabel?.(platform) || "")}</span>
        </div>
    `;

}

function currentSheetSong() {

    const link = document.getElementById("nowLink")?.value.trim();

    if (!link || !/^https?:\/\//i.test(link)) {
        showToast("Önce bir şarkı linki yapıştır 🎵");
        return null;
    }

    const platform = typeof detectSongPlatform === "function" ? detectSongPlatform(link) : null;

    return {
        link,
        platform,
        title: nowSheetMeta?.title || "",
        artist: nowSheetMeta?.artist || "",
        cover: nowSheetMeta?.platform === platform ? nowSheetMeta.cover || null : null
    };

}

async function submitNowPlaying(button) {

    const song = currentSheetSong();

    if (!song || button.disabled) return;

    button.disabled = true;

    try {

        await window.firebase.shareNowPlaying(song);

        closeNowPlayingSheet();

        const partner = (typeof coupleNames !== "undefined" && coupleNames.partner) || "Partnerin";
        showToast(`🎧 ${partner} şu an ne dinlediğini görüyor`);

    } catch (error) {

        console.error("Paylaşılamadı:", error);
        showToast("Paylaşılamadı, tekrar dene.");

    } finally {

        button.disabled = false;

    }

}

async function saveSharedSong(button) {

    const song = currentSheetSong();

    if (!song || button.disabled) return;

    button.disabled = true;

    try {

        await window.firebase.addSong(song.link, song.title, song.artist, "", song.platform, song.cover);

        button.textContent = "✓ Şarkılarımıza eklendi";

        showToast("🎵 Şarkılarımıza eklendi");

    } catch (error) {

        console.error("Şarkı eklenemedi:", error);
        showToast("Eklenemedi, tekrar dene.");
        button.disabled = false;

    }

}

// ── Ana sayfadaki "şu an çalıyor" ───────────────────────────

function activeNowItems() {
    return nowItems.filter(i => i.expiresAt > Date.now());
}

function renderNowPlaying() {

    const el = document.getElementById("nowPlaying");

    if (!el) return;

    const me = window.firebase?.getCurrentAuthUser?.()?.uid;
    const active = activeNowItems();

    // Önce partnerinki, yoksa kendi paylaşımın
    const item = active.find(i => i.uid !== me) || active.find(i => i.uid === me);

    if (!item) {
        el.classList.remove("show");
        el.dataset.uid = "";
        return;
    }

    const mine = item.uid === me;
    const partner = (typeof coupleNames !== "undefined" && coupleNames.partner) || "Partnerin";
    const left = Math.max(1, Math.ceil((item.expiresAt - Date.now()) / 60000));

    const who = mine ? `Sen dinliyorsun · ${left} dk` : `${partner} dinliyor`;
    const sub = [who, item.artist].filter(Boolean).join(" · ");

    const label = item.cover
        ? `<img src="${escapeNow(item.cover)}" alt="">`
        : `<span>♪</span>`;

    el.dataset.uid = item.uid;
    el.dataset.link = item.link;

    el.innerHTML = `
        <span class="np-vinyl" aria-hidden="true"><span class="np-vinyl-label">${label}</span></span>
        <span class="np-text">
            <b>${escapeNow(item.title || "Bir şarkı")}</b>
            <span>${escapeNow(sub)}</span>
        </span>
        <span class="np-eq" aria-hidden="true"><i></i><i></i><i></i></span>
        ${mine ? `<span class="np-stop" role="button" aria-label="Paylaşımı durdur">✕</span>` : ""}
    `;

    el.setAttribute("aria-label", `${who}: ${item.title || "bir şarkı"}. Açmak için dokun.`);
    el.classList.add("show");

}

function onNowPlayingTap(event) {

    const el = document.getElementById("nowPlaying");

    if (event.target.closest(".np-stop")) {
        event.stopPropagation();
        window.firebase.stopNowPlaying();
        nowItems = nowItems.filter(i => i.uid !== el.dataset.uid);
        renderNowPlaying();
        showToast("Paylaşım durduruldu");
        return;
    }

    if (el?.dataset.link) window.open(el.dataset.link, "_blank");

}

// Çift hazır olunca (app.js)
function startNowPlaying() {

    if (nowStarted || !window.firebase?.listenNowPlaying) return;

    nowStarted = true;

    window.firebase.listenNowPlaying(items => {
        nowItems = items;
        renderNowPlaying();
    });

    // Süre dolunca kaybolsun, kalan dakika güncellensin
    nowTicker = setInterval(renderNowPlaying, 15 * 1000);

    if (nowPendingShare) {
        const share = nowPendingShare;
        nowPendingShare = null;
        setTimeout(() => openNowPlayingSheet(share), 400);
    }

}

function escapeNow(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initNowPlayingShareIn);
else initNowPlayingShareIn();

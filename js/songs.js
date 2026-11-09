let currentSongs = [];

function loadSongs() {

    
    const list = document.getElementById("songsList");

    if (!window.firebaseReady) {

        list.innerHTML = "Bağlanıyor...";

        window.addEventListener(
            "firebaseReady",
            loadSongs,
            { once: true }
        );

        return;

    }

    list.innerHTML = "Yükleniyor...";

    window.firebase.listenSongs((songs) => {

        currentSongs = songs;

        if (songs.length === 0) {

            list.innerHTML = `
                <div class="memories-empty">

                    🎵
                    <br><br>

                    Henüz hiç şarkı yok.
                    <br>

                    İlk şarkıyı sen bırak 💜

                </div>
            `;

            return;
 
        }

        list.innerHTML = songs.map(renderSongCard).join("");

        backfillSpotifyCovers(songs);

    });

}

// ── Platform algılama ve oEmbed ─────────────────────────────

function detectSongPlatform(link) {

    const url = (link || "").toLowerCase();

    if (url.includes("spotify.com") || url.includes("spotify.link")) return "spotify";
    if (url.includes("music.youtube.com")) return "ytmusic";
    if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";

    return null;

}

const SONG_PLATFORM_ICONS = {

    spotify: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.6.6 0 0 1-.9.2c-2.4-1.5-5.4-1.8-8.9-1a.6.6 0 1 1-.3-1.2c3.9-.9 7.2-.5 9.9 1.1.3.2.4.6.2.9Zm1.2-2.8a.8.8 0 0 1-1 .3c-2.7-1.7-6.9-2.2-10.1-1.2a.8.8 0 0 1-.5-1.5c3.7-1.1 8.3-.6 11.4 1.4.4.2.5.7.2 1Zm.1-2.9C14.7 8.8 9.4 8.6 6.3 9.5a.9.9 0 1 1-.5-1.8c3.5-1.1 9.4-.9 13 1.3a.9.9 0 0 1-.9 1.7Z"/></svg>`,

    youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15.1V8.9l5.8 3.1-5.8 3.1Z"/></svg>`,

    ytmusic: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 15.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11Zm-1.8-8.2v5.4L14.9 12l-4.7-2.7Z"/></svg>`,

    other: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/></svg>`

};

async function fetchSongMeta(link) {

    const platform = detectSongPlatform(link);

    if (!platform) return { platform: null };

    const endpoint = platform === "spotify"
        ? `https://open.spotify.com/oembed?url=${encodeURIComponent(link)}`
        : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link)}`;

    try {

        const res = await fetch(endpoint);

        if (!res.ok) return { platform };

        const data = await res.json();

        // YouTube: "Sanatçı - Topic" / "SanatçıVEVO" gibi kanal adlarını temizle
        const artist = (data.author_name || "")
            .replace(/\s*-\s*Topic$/i, "")
            .replace(/VEVO$/i, "")
            .trim();

        return {
            platform,
            title: (data.title || "").trim(),
            artist: platform === "spotify" ? "" : artist,
            cover: platform === "spotify" ? (data.thumbnail_url || null) : null
        };

    } catch (e) {

        console.warn("Şarkı bilgisi alınamadı:", e);

        return { platform };

    }

}

// Formdaki son algılanan bilgiler
let songLinkMeta = { platform: null, cover: null };
let songLinkTimer = null;
let songLinkRequestId = 0;

function onSongLinkInput() {

    clearTimeout(songLinkTimer);

    songLinkTimer = setTimeout(async () => {

        const link = document.getElementById("songLink").value.trim();
        const preview = document.getElementById("songLinkPreview");
        const platform = detectSongPlatform(link);

        songLinkMeta = { platform, cover: null };

        if (!link || !platform) {
            preview.style.display = "none";
            preview.innerHTML = "";
            return;
        }

        preview.style.display = "flex";
        preview.innerHTML = renderSongPreview(platform, null, "Bilgiler alınıyor…");

        const requestId = ++songLinkRequestId;
        const meta = await fetchSongMeta(link);

        // Bu arada link değiştiyse eski cevabı yok say
        if (requestId !== songLinkRequestId) return;

        songLinkMeta = { platform, cover: meta.cover || null };

        const titleInput = document.getElementById("songTitle");
        const artistInput = document.getElementById("songArtist");

        if (meta.title && !titleInput.value.trim()) titleInput.value = meta.title;
        if (meta.artist && !artistInput.value.trim()) artistInput.value = meta.artist;

        preview.innerHTML = renderSongPreview(
            platform,
            meta.cover,
            meta.title || "Link tanındı"
        );

    }, 350);

}

function songPlatformLabel(platform) {

    return {
        spotify: "Spotify",
        youtube: "YouTube",
        ytmusic: "YouTube Music"
    }[platform] || "Link";

}

function renderSongArt(platform, cover, sizeClass = "") {

    if (cover) {
        return `<img class="song-art ${sizeClass}" src="${escapeSongHtml(cover)}" alt="" loading="lazy">`;
    }

    const key = SONG_PLATFORM_ICONS[platform] ? platform : "other";

    return `<div class="song-art song-art-icon is-${key} ${sizeClass}">${SONG_PLATFORM_ICONS[key]}</div>`;

}

function renderSongPreview(platform, cover, text) {

    return `
        ${renderSongArt(platform, cover, "song-art-sm")}
        <div class="song-preview-text">
            <div class="song-preview-platform is-${platform}">${songPlatformLabel(platform)}</div>
            <div class="song-preview-title">${escapeSongHtml(text)}</div>
        </div>
    `;

}

// ── Kart ─────────────────────────────────────────────────────

function escapeSongHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}

function renderSongCard(song) {

    const date = song.createdAt?.toDate?.();

    const dateStr = date
        ? date.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })
        : "";

    const platform = song.platform || detectSongPlatform(song.link);
    const cleanNote = (song.note || "").trim();

    const isMine = song.authorId
        ? song.authorId === window.firebase.getCurrentAuthUser()?.uid
        : null;

    const authorName = song.authorId
        ? (isMine ? (coupleNames.me || "Sen") : (coupleNames.partner || "Partner"))
        : (song.author || "");

    const authorEmoji = song.authorId
        ? (isMine ? "💙" : "💗")
        : (song.author === "Berk" ? "💙" : "💗");

    const title = song.title || "İsimsiz şarkı";

    const sub = [song.artist, dateStr].filter(Boolean).map(escapeSongHtml).join(" · ");

    return `
        <div class="song-card" onclick="openSongLink('${song.id}')">

            <div class="song-row">

                ${renderSongArt(platform, song.cover)}

                <div class="song-body">
                    <div class="song-title">${escapeSongHtml(title)}</div>
                    <div class="song-sub">${sub}</div>
                </div>

                <div class="song-side">
                    <span class="song-author-dot" title="${escapeSongHtml(authorName)}">${authorEmoji}</span>
                    <button
                        class="song-menu-btn"
                        aria-label="Şarkı menüsü"
                        onclick="openSongMenu(event, '${song.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="1.8"/>
                            <circle cx="12" cy="12" r="1.8"/>
                            <circle cx="12" cy="19" r="1.8"/>
                        </svg>
                    </button>
                </div>

            </div>

            ${cleanNote
                ? `<div class="song-note">${formatMemoryText(cleanNote)}</div>`
                : ""
            }

        </div>
    `;

}

function openSongLink(id) {

    const song = currentSongs.find(s => s.id === id);

    if (song?.link) window.open(song.link, "_blank");

}

// Eski Spotify şarkılarına bir kez kapak ekle
const songCoverChecked = new Set();

async function backfillSpotifyCovers(songs) {

    for (const song of songs) {

        if (song.cover || songCoverChecked.has(song.id)) continue;
        if (detectSongPlatform(song.link) !== "spotify") continue;

        songCoverChecked.add(song.id);

        const meta = await fetchSongMeta(song.link);

        if (!meta.cover) continue;

        try {
            await window.firebase.updateSong(song.id, {
                cover: meta.cover,
                platform: "spotify"
            });
        } catch (e) {
            console.warn("Kapak kaydedilemedi:", e);
        }

    }

}

async function saveSong() {

    const link = document.getElementById("songLink").value.trim();
    const title = document.getElementById("songTitle").value.trim();
    const artist = document.getElementById("songArtist").value.trim();
    const note = document.getElementById("songNote").value.trim();

    if (!link) {

        showToast("Önce bir şarkı linki gir 💜");

        return;

    }

    try {

        // Önizleme henüz bitmediyse platformu yine de kaydet
        const platform = detectSongPlatform(link);
        const cover = songLinkMeta.platform === platform ? songLinkMeta.cover : null;

        await window.firebase.addSong(
            link,
            title,
            artist,
            note,
            platform,
            cover
        );

        closeSongForm();

        document.getElementById("songLink").value = "";
        document.getElementById("songTitle").value = "";
        document.getElementById("songArtist").value = "";
        document.getElementById("songNote").value = "";

        showToast("🎵 Şarkı bırakıldı");

    } catch (e) {

        showToast("Hata: " + e.message);

    }

}

async function deleteSong(id) {

    if (!confirm("Bu şarkıyı silmek istediğine emin misin?")) return;

    try {

        await window.firebase.deleteSong(id);

        showToast("🎵 Şarkı silindi.");

    } catch (e) {

        showToast("Silinemedi: " + e.message);

    }

}

function openSongMenu(event, songId) {

    event.stopPropagation();

    openActionMenu("song", songId);

}

function openSongForm() {

    const form = document.getElementById("songForm");
    const container = document.getElementById("songFormContainer");

    container.appendChild(form);

    form.style.display = "block";

    document.getElementById("modalOverlay").classList.add("active");
    document.getElementById("songModal").classList.add("active");

}

function closeSongForm() {

    document.getElementById("modalOverlay").classList.remove("active");
    document.getElementById("songModal").classList.remove("active");

    resetSongForm();

}

function resetSongForm() {

    document.getElementById("songLink").value = "";
    document.getElementById("songTitle").value = "";
    document.getElementById("songArtist").value = "";
    document.getElementById("songNote").value = "";

    const preview = document.getElementById("songLinkPreview");

    if (preview) {
        preview.style.display = "none";
        preview.innerHTML = "";
    }

    songLinkMeta = { platform: null, cover: null };

}

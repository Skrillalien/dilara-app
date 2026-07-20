let currentSongs = [];

function loadSongs() {

    console.log("loadSongs çalıştı");
    
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

        list.innerHTML = songs.map(song => {

            const date = song.createdAt?.toDate?.();

            const dateStr = date
                ? date.toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                })
                : "";

            return `

                <div
                    class="song-card"
                    onclick="window.open('${song.link}','_blank')">

                    <div class="song-header">

                        <div>

                            <div class="song-title">

                                <svg
                                    class="song-title-icon"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round">

                                    <path d="M9 18V6l10-2v12"/>

                                    <circle cx="7" cy="18" r="2"/>

                                    <circle cx="17" cy="16" r="2"/>

                                </svg>

                                <span>

                                    ${song.title}

                                </span>

                            </div>

                            <div class="song-artist">

                                ${song.artist}

                            </div>

                        </div>

                        <div class="song-header-right">

                            <svg
                                class="song-link-icon"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round">

                                <path d="M7 17L17 7"/>

                                <path d="M8 7h9v9"/>

                            </svg>

                        </div>

                    </div>

                    <div class="song-meta">
                        <div class="song-info-row">
                            <div class="song-author">
                                ${song.author === "Berk"
                                    ? "💙 Berk"
                                    : "💗 Dilara"}
                            </div>

                            <div class="song-date">
                                ${dateStr}
                            </div>
                        </div>
                    </div>

                    ${
                        song.note
                            ? `
                                <div class="song-note">

                                    ${song.note}

                                </div>
                            `
                            : ""
                    }

                        <button
                            class="photo-menu-btn"
                            onclick="openSongMenu(event, '${song.id}')">

                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="currentColor">

                                <circle cx="12" cy="5" r="1.8"/>
                                <circle cx="12" cy="12" r="1.8"/>
                                <circle cx="12" cy="19" r="1.8"/>

                            </svg>

                        </button>

                </div>

            `;

        }).join("");

    });

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

    const currentUser = localStorage.getItem("currentUser");

    try {

        await window.firebase.addSong(
            link,
            title,
            artist,
            note,
            currentUser
        );

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

    document.getElementById("songFormOverlay").style.display = "block";
    document.getElementById("songFormPopup").classList.add("show");

}

function closeSongForm() {

    document.getElementById("songFormOverlay").style.display = "none";
    document.getElementById("songFormPopup").classList.remove("show");

}
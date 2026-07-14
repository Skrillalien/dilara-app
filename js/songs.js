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

                            <div class="song-date">

                                ${dateStr}

                            </div>

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

                    <div class="song-author">

                        ${song.author === "Berk"
                            ? "💙 Berk"
                            : "💗 Dilara"}

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
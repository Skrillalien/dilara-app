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

        list.innerHTML = songs.map(song => `

            <div class="song-card">

                <div class="song-author">

                    ${song.author === "Berk"
                        ? "💙 Berk"
                        : "💗 Dilara"}

                </div>

                <div class="song-note">

                    ${song.note || ""}

                </div>

                <button
                    class="song-open-btn"
                    onclick="window.open('${song.link}','_blank')">

                    ▶ Dinle

                </button>

            </div>

        `).join("");

    });

}

async function saveSong() {

    const link = document.getElementById("songLink").value.trim();
    const note = document.getElementById("songNote").value.trim();

    if (!link) {

        showToast("Önce bir şarkı linki gir 💜");

        return;

    }

    const currentUser = localStorage.getItem("currentUser");

    try {

        await window.firebase.addSong(
            link,
            note,
            currentUser
        );

        document.getElementById("songLink").value = "";
        document.getElementById("songNote").value = "";

        showToast("🎵 Şarkı bırakıldı");

    } catch (e) {

        showToast("Hata: " + e.message);

    }

}
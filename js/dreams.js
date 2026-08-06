const COMPLETED_MESSAGES = [
    "✨ Birlikte Yaptık",
    "🌿 Bir Hayal Daha Gerçek Oldu",
    "💚 Anılarımıza Eklendi"
];

let currentDreams = [];

function loadDreams() {

    const list = document.getElementById("dreamsList");

    if (!window.firebaseReady) {

        list.innerHTML = "Bağlanıyor...";

        window.addEventListener(
            "firebaseReady",
            loadDreams,
            { once: true }
        );

        return;

    }

    list.innerHTML = "Yükleniyor...";

    window.firebase.listenDreams((dreams) => {

        currentDreams = dreams;

        if (dreams.length === 0) {

            list.innerHTML = `
                <div class="memories-empty">

                    ✨
                    <br><br>

                    Henüz hiç hayal eklenmedi.
                    <br>

                    İlk hayali sen ekle 💜

                </div>
            `;

            return;

        }

        list.innerHTML = dreams.map(dream => {

            return `

                <div
                    class="event-card ${dream.completed ? 'dream-completed' : ''}"
                    onclick="toggleDreamCompleted('${dream.id}', ${!dream.completed})">

                    <div class="event-icon">

                        ${dream.emoji || "✨"}

                    </div>

                    <button
                        class="photo-menu-btn"
                        onclick="openDreamMenu(event, '${dream.id}')">

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

                    <div class="event-info">

                        <div class="event-name">

                            ${dream.title}

                        </div>

                        <div class="event-date">

                            ${
                                dream.author === "Berk"
                                    ? "💙 Berk"
                                    : "💗 Dilara"
                            }

                        </div>

                    <div class="dream-status">

                        ${
                            dream.completed
                                ? dream.completedMessage
                                : "💭 Hayalini Kuruyoruz"
                        }

                    </div>

                </div>

                </div>

            `;

        }).join("");

    });

}

function openDreamForm() {

    const form = document.getElementById("dreamForm");
    const container = document.getElementById("dreamFormContainer");

    container.appendChild(form);

    form.style.display = "block";

    document.getElementById("modalOverlay").classList.add("active");
    document.getElementById("dreamModal").classList.add("active");

}

function closeDreamForm() {

    document.getElementById("modalOverlay").classList.remove("active");
    document.getElementById("dreamModal").classList.remove("active");

    resetDreamForm();

}

function resetDreamForm() {

    document.getElementById("dreamEmoji").value = "";
    document.getElementById("dreamTitle").value = "";
    document.getElementById("dreamNote").value = "";

}

async function saveDream() {

    const emoji =
        document.getElementById("dreamEmoji").value.trim();

    const title =
        document.getElementById("dreamTitle").value.trim();

    const note =
        document.getElementById("dreamNote").value.trim();

    if (!title) {

        showToast("Hayalini yazmayı unutma 💜");
        return;

    }

    const currentUser =
        localStorage.getItem("currentUser");

    try {

        await window.firebase.addDream({

            emoji: emoji || "✨",

            title,

            note,

            author: currentUser,

            completed: false,


        });

        closeDreamForm();

        showToast("✨ Yeni hayal eklendi");

    } catch (e) {

        console.error(e);

        showToast("Bir hata oluştu");

    }

}

async function toggleDreamCompleted(id, completed) {

    let data = {
        completed
    };

    if (completed) {

        const message =
            COMPLETED_MESSAGES[
                Math.floor(
                    Math.random() * COMPLETED_MESSAGES.length
                )
            ];

        data.completedMessage = message;

    } else {

        data.completedMessage = "";

    }

    await window.firebase.updateDream(id, data);

}

function openDreamMenu(event, dreamId) {

    event.stopPropagation();

    openActionMenu("dream", dreamId);

}
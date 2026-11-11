let selectedPhoto = null;

let currentMemories = [];

let coupleMemberProfiles = {};

async function loadCoupleMemberProfiles() {

    try {

        const couple =
            await window.firebase.getMyCoupleData();

        if (!couple) return;

        if (!Array.isArray(couple.members)) return;

        coupleMemberProfiles = {};

        for (const uid of couple.members) {

            const profile =
                await window.firebase.getUserProfileByUid(uid);

            if (profile) {

                coupleMemberProfiles[uid] =
                    profile.name || null;

            }

        }

    } catch (error) {

        console.error(
            "Çift üyeleri alınamadı:",
            error
        );

    }

}


async function previewPhoto(event) {

    const file = event.target.files[0];

    if (!file) return;

    try {

        // Küçültülmüş hali hazırlanır; yükleme "Kaydet"e basınca olur
        selectedPhoto = await prepareImage(file);

        const preview = document.getElementById("photoPreview");

        if (preview.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);

        preview.src = URL.createObjectURL(selectedPhoto.thumbBlob);

        document.getElementById("photoPreviewContainer").style.display = "block";

    } catch (error) {

        console.error("Fotoğraf hazırlanamadı:", error);
        selectedPhoto = null;
        showToast("Bu fotoğraf açılamadı.");

    }

}

async function saveMemory() {
    const text = document.getElementById('memoryText').value.trim();
    if (!text) return;
    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    btn.textContent = 'Kaydediliyor...';

    try {

        await window.firebase.addMemory(
            text,
            selectedPhoto
        );

        loadWaitingItems();
        document.getElementById('memoryText').value = '';
        selectedPhoto = null;
        document.getElementById("photoInput").value = "";
        document.getElementById("photoPreviewContainer").style.display = "none";
        showToast('Anı kaydedildi 💜');
        loadMemories();

    }

    catch (e) {
        console.error("Anı kaydedilemedi:", e);
        showToast(selectedPhoto ? 'Fotoğraf yüklenemedi, tekrar dene.' : 'Anı kaydedilemedi.');
    }

    btn.disabled = false;
    btn.textContent = 'Kaydet';
}

async function loadMemories() {

     await loadCoupleMemberProfiles();

    const list = document.getElementById('memoriesList');

    if (!window.firebaseReady) {
        list.innerHTML = '<div class="memories-loading">Bağlanıyor...</div>';
        window.addEventListener('firebaseReady', loadMemories, { once: true });
        return;
    }
    list.innerHTML = '<div class="memories-loading">Yükleniyor...</div>';
    window.firebase.listenMemories((memories) => {
        currentMemories = memories;
        if (memories.length === 0) {
            list.innerHTML = '<div class="memories-empty">Henüz anı yok 💜<br>İlk anıyı sen ekle!</div>';
            return;
        }
        list.innerHTML = memories.map(m => {
            const date = m.createdAt?.toDate?.();
            const dateStr = date ? date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
            return `
              <div class="memory-card">
                <div class="memory-header">
                <span class="memory-author">
                    ${escapeInboxHtml(authorInfo(m).label)}
                </span>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="memory-date">${dateStr}</span>

                    <button
                        class="memory-menu-btn"
                        onclick="openMemoryMenu(event, '${m.id}')">

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
                </div>
                <div class="memory-text">${formatMemoryText(m.text)}</div>
                ${hasImage(m) ? `
                    <img
                        src="${imageSrc(m, 'thumb')}"
                        class="memory-image"
                        loading="lazy"
                        decoding="async"
                        onclick="openMemoryImage('${m.id}')">
                ` : ''}
              </div>`;
        }).join('');
        // Bekleyen notları da güncelle
        loadWaitingItems();
    });
}

async function loadLastMemory() {
    if (!window.firebaseReady) {
        window.addEventListener('firebaseReady', loadLastMemory, { once: true });
        return;
    }

    await loadCoupleMemberProfiles();

    window.firebase.listenMemories((memories) => {
        if (memories.length === 0) return;
        const last = memories[0];

        document.getElementById('lastMemoryAuthor').textContent =
            authorInfo(last).label
        document.getElementById('lastMemoryText').innerHTML =
            formatMemoryText(last.text);
        const date = last.createdAt?.toDate?.();
        if (date) {
            document.getElementById('lastMemoryDate').textContent =
                date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
        }
    });
}

function openMemoryMenu(event, memoryId) {

    event.stopPropagation();

    openActionMenu("memory", memoryId);

}

// Bekleyen notlar / şarkılar / hayaller artık js/inbox.js içinde.
// Eski çağrılar bozulmasın diye bu isim korunuyor; tek bir kez başlatır.
function loadWaitingItems() {

    startInbox();

}

async function updateMemoryAuthorInfo() {

    const info =
        document.getElementById("memoryAuthorInfo");

    if (!info) return;

    const profile =
        await window.firebase.getUserProfile();

    if (!profile) {

        info.textContent = "";

        return;

    }

    info.textContent =
        `💜 Bu anı ${profile.name} adına kaydedilecek`;

}

function openMemoryImage(memoryId) {

    const memory = currentMemories.find(m => m.id === memoryId);

    if (!memory) return;

    document.getElementById("viewerImage").src = imageSrc(memory, "full");

    document.getElementById("viewerAuthor").textContent =
        authorInfo(memory).label;

    if (memory.createdAt?.toDate) {

        document.getElementById("viewerDate").textContent =
            memory.createdAt.toDate().toLocaleDateString(
                "tr-TR",
                {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                }
            );

    } else {

        document.getElementById("viewerDate").textContent = "";

    }

    document.getElementById("viewerText").innerHTML =
        formatMemoryText(memory.text || "");

    document.getElementById("viewerText").style.display =
        memory.text ? "block" : "none";

    document.getElementById("imageViewer").style.display = "flex";

}

function formatMemoryText(text) {

    return text
        .replace(
            /#[a-zA-Z0-9ğüşöçıİĞÜŞÖÇ]+/g,
            match => `<span class="memory-tag">${match}</span>`
        )
        .replace(/\n/g, "<br>");

}
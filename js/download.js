// ─────────────────────────────────────────────────────────────
// Fotoğraf indirme
//
// • Fotoğraf açıkken sağ üstteki ⬇ düğmesi
// • Fotoğraflarımız / Anılarımız'daki ⋯ menüsünde "İndir"
//   (menü şarkı, hayal, özel gün için de kullanılıyor; "İndir"
//   sadece fotoğrafı olan kayıtlarda görünür)
//
// Telefon uygulaması: galeride "Kalp Kalbe" albümüne kaydeder
// (js/capacitor.js → window.appMedia). Tarayıcı: dosya olarak indirir;
// iPhone'da paylaş menüsü açılır ("Görüntüyü Kaydet").
// ─────────────────────────────────────────────────────────────

let viewerItem = null;
let downloadBusy = false;

function downloadFileName(item) {

    const ms = item?.createdAt?.toMillis?.()
        || (item?.createdAt?.seconds ? item.createdAt.seconds * 1000 : Date.now());

    const d = new Date(ms);
    const p = n => String(n).padStart(2, "0");

    return `kalpkalbe-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;

}

async function downloadImageItem(item) {

    const url = imageSrc(item, "full");

    if (!url) {
        showToast("Bu kayıtta fotoğraf yok.");
        return;
    }

    if (downloadBusy) return;

    downloadBusy = true;
    showToast("Fotoğraf indiriliyor…");

    const name = downloadFileName(item);

    try {

        if (window.Capacitor?.isNativePlatform?.() && window.appMedia) {

            await window.appMedia.saveToGallery(url, name);
            showToast("📥 Galeriye kaydedildi (Kalp Kalbe albümü)");
            return;

        }

        await downloadInBrowser(url, name);

    } catch (error) {

        console.error("Fotoğraf indirilemedi:", error);
        showToast("Fotoğraf indirilemedi, tekrar dene.");

    } finally {

        downloadBusy = false;

    }

}

async function downloadInBrowser(url, name) {

    let blob;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("HTTP " + res.status);
        blob = await res.blob();
    } catch {
        // Dosya alınamadıysa (ör. ağ izni) fotoğrafı yeni sekmede aç
        window.open(url, "_blank", "noopener");
        showToast("Açılan fotoğrafa basılı tutup kaydedebilirsin.");
        return;
    }

    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const fileName = `${name}.${ext}`;

    // iPhone / iPad: paylaş menüsü → "Görüntüyü Kaydet"
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const file = typeof File === "function" ? new File([blob], fileName, { type: blob.type }) : null;

    if (ios && file && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file] });
        } catch (error) {
            if (error?.name !== "AbortError") throw error;
        }
        return;
    }

    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);

    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);

    showToast("📥 Fotoğraf indirildi");

}

// ── Görüntüleyici ───────────────────────────────────────────

function downloadViewerImage(event) {

    event?.stopPropagation();

    if (viewerItem) downloadImageItem(viewerItem);

}

// ── ⋯ menüsü ────────────────────────────────────────────────

function actionImageItem(type, id) {

    if (type === "photo") {
        return (typeof galleryItems !== "undefined" ? galleryItems : [])
            .find(i => i.type === "photo" && i.id === id) || null;
    }

    if (type === "memory") {
        const list = typeof currentMemories !== "undefined" ? currentMemories : [];
        const item = list.find(m => m.id === id)
            || (typeof galleryItems !== "undefined" ? galleryItems : []).find(i => i.type === "memory" && i.id === id);
        return item && hasImage(item) ? item : null;
    }

    return null;

}

function performDownloadAction() {

    const item = actionImageItem(currentActionType, currentActionId);

    closeActionMenu();

    if (item) downloadImageItem(item);

}

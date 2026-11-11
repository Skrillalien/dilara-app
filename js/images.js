// ─────────────────────────────────────────────────────────────
// Görseller
//
// Fotoğraflar artık Firestore'a metin olarak gömülmüyor;
// Firebase Storage'a dosya olarak yükleniyor. Her fotoğrafın
// iki hali var:
//   • büyük (en uzun kenar 1600 px) → tam ekran görüntüleyici, başlık
//   • küçük (en uzun kenar 600 px) → galeri, not kartları, listeler
// Firestore'da sadece bağlantıları tutulur:
//   imageUrl, thumbUrl, imagePath, thumbPath, width, height
//
// Eski kayıtlarda fotoğraf "image" alanında metin (data URL) olarak
// duruyor. imageSrc() ikisini de gösterir; migrateLegacyImages()
// eskileri bir kerelik Storage'a taşır.
// ─────────────────────────────────────────────────────────────

const IMAGE_FULL_MAX = 1600;
const IMAGE_FULL_QUALITY = 0.82;
const IMAGE_THUMB_MAX = 600;
const IMAGE_THUMB_QUALITY = 0.72;

// Kayıttaki fotoğrafın gösterilecek adresi
// size: "thumb" (liste/galeri) | "full" (büyük görünüm)
function imageSrc(item, size = "full") {

    if (!item) return "";

    if (size === "thumb") {
        return item.thumbUrl || item.imageUrl || item.image || "";
    }

    return item.imageUrl || item.image || item.thumbUrl || "";

}

function hasImage(item) {

    return !!(item && (item.imageUrl || item.thumbUrl || item.image));

}

function loadImageElement(src) {

    return new Promise((resolve, reject) => {

        const img = new Image();

        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("IMAGE_LOAD_FAILED"));
        img.src = src;

    });

}

function canvasToBlob(canvas, quality) {

    return new Promise((resolve, reject) => {

        canvas.toBlob(
            blob => blob ? resolve(blob) : reject(new Error("IMAGE_ENCODE_FAILED")),
            "image/jpeg",
            quality
        );

    });

}

// En uzun kenarı max olacak şekilde küçült (büyütme yapmaz)
function resizeToBlob(img, max, quality) {

    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));

    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    // Şeffaf PNG'ler JPEG'de siyah olmasın
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    return canvasToBlob(canvas, quality).then(blob => ({ blob, width, height }));

}

// Bir görseli (dosya ya da adres) yüklemeye hazırla
// Döner: { blob, thumbBlob, width, height }
async function prepareImage(source) {

    const isFile = source instanceof Blob;
    const url = isFile ? URL.createObjectURL(source) : source;

    try {

        const img = await loadImageElement(url);

        const full = await resizeToBlob(img, IMAGE_FULL_MAX, IMAGE_FULL_QUALITY);
        const thumb = await resizeToBlob(img, IMAGE_THUMB_MAX, IMAGE_THUMB_QUALITY);

        return {
            blob: full.blob,
            thumbBlob: thumb.blob,
            width: full.width,
            height: full.height
        };

    } finally {

        if (isFile) URL.revokeObjectURL(url);

    }

}

// ── Eski fotoğrafları Storage'a taşıma ──────────────────────
// Uygulama açıldıktan biraz sonra arka planda bir kez çalışır.
// İki partner aynı anda çalıştırsa da sorun olmaz: dosya yolu
// kayıt kimliğinden üretildiği için aynı dosyanın üstüne yazılır.

let imageMigrationRunning = false;

async function migrateLegacyImages() {

    if (imageMigrationRunning) return;

    if (!window.firebase?.listLegacyImages) return;

    imageMigrationRunning = true;

    try {

        const items = await window.firebase.listLegacyImages();

        if (items.length === 0) return;

        console.log(`Eski fotoğraflar taşınıyor: ${items.length}`);

        let moved = 0;

        for (const item of items) {

            try {

                const prepared = await prepareImage(item.image);

                await window.firebase.attachLegacyImage(item.collection, item.id, prepared);

                moved++;

            } catch (error) {

                // Biri başarısız olursa diğerlerine devam; bir sonraki açılışta tekrar denenir
                console.warn("Fotoğraf taşınamadı:", item.collection, item.id, error);

            }

        }

        console.log(`Fotoğraf taşıma bitti: ${moved}/${items.length}`);

    } catch (error) {

        console.warn("Fotoğraf taşıma başlatılamadı:", error);

    } finally {

        imageMigrationRunning = false;

    }

}

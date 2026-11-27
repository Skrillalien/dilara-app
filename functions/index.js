// ─────────────────────────────────────────────────────────────
// Push bildirimleri
//
// memories / songs / dreams / misses koleksiyonlarına yeni bir kayıt
// eklenince, çiftin DİĞER üyesinin telefonlarına bildirim gönderir.
// Bildirime dokununca uygulama ilgili sayfayı açar (data.page).
//
// Telefonların FCM token'ları pushTokens/{token} belgelerinde durur
// ({ uid, platform, updatedAt }; uygulama açılınca js/capacitor.js kaydeder).
// Eski sürümün users/{uid}.fcmTokens dizisi de okunur.
// ─────────────────────────────────────────────────────────────

const { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const crypto = require("crypto");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

// ─────────────────────────────────────────────────────────────
// PREMIUM
// false: Premium özellikleri herkese açık (👑 işareti yine görünür).
// true:  sadece couples.plan == "premium" olan çiftlere açık.
// İstemcideki eşi: js/app.js → PREMIUM_ENFORCED
// ─────────────────────────────────────────────────────────────
const PREMIUM_ENFORCED = false;

function isPremiumCouple(couple) {

    if (!PREMIUM_ENFORCED) return true;

    const data = typeof couple?.data === "function" ? couple.data() : couple;

    return premiumActive(data?.premium) || data?.plan === "premium";

}

const db = admin.firestore();

// Firestore veritabanının bulunduğu bölgeyle aynı olmalı.
// (Firebase Console > Firestore > üstte yazan konum)
setGlobalOptions({ region: "europe-west1", maxInstances: 5 });

const TYPES = {
    memories: {
        category: "content",
        page: "our-memories",
        icon: "💌",
        body: (d) => withPreview("Sana yeni bir not bıraktı", d.text || ((d.imageUrl || d.image) ? "📷 Fotoğraf" : ""))
    },
    songs: {
        category: "content",
        page: "our-songs",
        icon: "🎵",
        body: (d) => withPreview("Sana bir şarkı bıraktı", [d.title, d.artist].filter(Boolean).join(" · "))
    },
    dreams: {
        category: "content",
        page: "our-dreams",
        icon: "✨",
        body: (d) => withPreview("Yeni bir hayal ekledi", d.title)
    },
    misses: {
        category: "love",
        page: "miss",
        icon: "💗",
        // Aynı etiketli bildirimler telefonda üst üste yığılmaz, yenisi eskisinin yerine geçer
        tag: "miss",
        body: (d) => {
            const n = Math.max(1, Math.floor(Number(d.count) || 1));
            if (n === 1) return "Seni özledi 🥺";
            if (n >= 100) return `Seni tam ${n} kere özledi! 💥💗`;
            return `Seni ${n} kere özledi 🥺`;
        }
    }
};

// Bu hatalar token'ın artık geçersiz olduğunu gösterir → sileriz
const DEAD_TOKEN_ERRORS = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "messaging/invalid-argument"
]);

function withPreview(text, preview) {

    const clean = String(preview || "").replace(/\s+/g, " ").trim();

    if (!clean) return text;

    const short = clean.length > 90 ? clean.slice(0, 88) + "…" : clean;

    return `${text}: “${short}”`;

}

// Bir kullanıcının bütün telefonlarına bildirim gönder
// Bildirim türleri (Ayarlar → Bildirimler). Kategorisiz bildirimler
// (ör. partnerin katıldı, hesap silindi) her zaman gider.
const NOTIFY_CATEGORIES = ["love", "content", "letters", "questions", "reminders", "music"];

async function sendPushToUser(uid, { title, body, data = {}, tag = null, category = null }) {

    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();

    if (category && userSnap.get(`notifyPrefs.${category}`) === false) {
        logger.info("Bildirim türü kapalı, gönderilmedi", { uid, category });
        return;
    }

    const tokenSnap = await db.collection("pushTokens").where("uid", "==", uid).get();
    const legacy = userSnap.get("fcmTokens") || [];

    const tokens = [...new Set([
        ...tokenSnap.docs.map(d => d.id),
        ...legacy
    ])].filter(Boolean);

    if (tokens.length === 0) {
        logger.info("Alıcının kayıtlı telefonu yok", { uid });
        return;
    }

    // FCM data alanları sadece metin olabilir
    const stringData = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
    );

    const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: stringData,
        android: {
            priority: "high",
            notification: {
                channelId: "partner",
                icon: "ic_stat_heart",
                color: "#c084fc",
                ...(tag ? { tag } : {})
            }
        },
        // Web (iPhone ana ekran uygulaması, tarayıcılar)
        webpush: {
            headers: { Urgency: "high" },
            notification: {
                icon: "./icon-192.png",
                badge: "./icon-192.png",
                ...(tag ? { tag, renotify: true } : {})
            }
        }
    });

    const dead = tokens.filter((_, i) =>
        !response.responses[i].success &&
        DEAD_TOKEN_ERRORS.has(response.responses[i].error?.code)
    );

    if (dead.length) {

        await Promise.all(dead.map(token =>
            db.doc(`pushTokens/${token}`).delete().catch(() => {})
        ));

        if (legacy.some(token => dead.includes(token))) {
            await userRef.update({
                fcmTokens: admin.firestore.FieldValue.arrayRemove(...dead)
            });
        }

    }

    logger.info("Bildirim gönderildi", {
        to: uid,
        page: stringData.page,
        success: response.successCount,
        failed: response.failureCount,
        removed: dead.length
    });

}

async function userName(uid, fallback = "Sevgilin") {

    const snap = await db.doc(`users/${uid}`).get();

    return snap.get("name") || fallback;

}

async function notifyPartner(type, event) {

    const data = event.data?.data();

    if (!data) return;

    const { coupleId, authorId } = data;

    if (!coupleId || !authorId) {
        logger.warn("coupleId/authorId yok, bildirim atlanıyor", { type, id: event.params.id });
        return;
    }

    const coupleSnap = await db.doc(`couples/${coupleId}`).get();
    const members = coupleSnap.get("members") || [];
    const recipients = members.filter(uid => uid !== authorId);

    if (recipients.length === 0) return;

    const authorName = await userName(authorId);

    const t = TYPES[type];

    for (const uid of recipients) {

        await sendPushToUser(uid, {
            title: `${t.icon} ${authorName}`,
            body: t.body(data),
            data: { page: t.page, type, id: event.params.id },
            tag: t.tag || null,
            category: t.category || null
        });

    }

}

exports.onMemoryCreated = onDocumentCreated("memories/{id}", (event) => notifyPartner("memories", event));
exports.onSongCreated = onDocumentCreated("songs/{id}", (event) => notifyPartner("songs", event));
exports.onDreamCreated = onDocumentCreated("dreams/{id}", (event) => notifyPartner("dreams", event));
// Özledim: art arda gelen serileri topla, bir süre yeni seri gelmezse
// tek bildirim gönder ("Seni 1000 kere özledi"). Fotoğraflardaki gibi.
const MISS_BATCH_WAIT_MS = 20 * 1000;
const MISS_BATCH_RESET_MS = 10 * 60 * 1000;

exports.onMissCreated = onDocumentCreated({ document: "misses/{id}", timeoutSeconds: 120 }, async (event) => {

    const data = event.data?.data();
    const { coupleId, authorId } = data || {};

    if (!coupleId || !authorId) return;

    const add = Math.max(1, Math.floor(Number(data.count) || 1));
    const stateRef = db.doc(`missNotify/${authorId}`);
    const stamp = Date.now();

    await db.runTransaction(async tx => {
        const state = await tx.get(stateRef);
        const fresh = !state.exists || stamp - (state.get("lastAt") || 0) > MISS_BATCH_RESET_MS;
        tx.set(stateRef, {
            coupleId,
            count: fresh ? add : (state.get("count") || 0) + add,
            lastAt: stamp
        });
    });

    await new Promise(resolve => setTimeout(resolve, MISS_BATCH_WAIT_MS));

    // Bu arada yeni seri geldiyse bildirimi o gönderecek
    const count = await db.runTransaction(async tx => {
        const state = await tx.get(stateRef);
        if (!state.exists || state.get("lastAt") !== stamp) return 0;
        tx.delete(stateRef);
        return state.get("count") || add;
    });

    if (!count) return;

    const couple = await db.doc(`couples/${coupleId}`).get();
    const recipients = (couple.get("members") || []).filter(m => m !== authorId);

    if (!recipients.length) return;

    const name = await userName(authorId);
    const t = TYPES.misses;

    for (const to of recipients) {
        await sendPushToUser(to, {
            title: `${t.icon} ${name}`,
            body: t.body({ count }),
            data: { page: t.page, type: "misses", id: event.params.id },
            tag: t.tag,
            category: t.category
        });
    }

});


// ─────────────────────────────────────────────────────────────
// Davet koduyla çifte katılma
//
// İstemci kurallar gereği başka çiftleri okuyamaz; katılma işini
// sunucu yapar. Kullanıcı daha önce tek başına bir çift kurduysa
// (partneri hiç katılmadıysa) o boş çift silinir.
// ─────────────────────────────────────────────────────────────

exports.joinCouple = onCall(async (request) => {

    const uid = request.auth?.uid;

    if (!uid) throw new HttpsError("unauthenticated", "Giriş yapmalısın.");

    const code = String(request.data?.code || "").trim().toUpperCase();

    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
        throw new HttpsError("invalid-argument", "INVITE_CODE_NOT_FOUND");
    }

    const found = await db.collection("couples")
        .where("inviteCode", "==", code)
        .limit(1)
        .get();

    if (found.empty) throw new HttpsError("not-found", "INVITE_CODE_NOT_FOUND");

    const coupleRef = found.docs[0].ref;
    const userRef = db.doc(`users/${uid}`);

    let waiting = [];

    const coupleId = await db.runTransaction(async tx => {

        const couple = await tx.get(coupleRef);
        const user = await tx.get(userRef);

        const members = couple.get("members") || [];

        if (members.includes(uid)) return coupleRef.id;

        // Partneri hesabını silmiş (arşiv) çiftlere kimse katılamaz
        if (couple.get("partnerLeft")) throw new HttpsError("failed-precondition", "COUPLE_FULL");

        if (members.length >= 2) throw new HttpsError("failed-precondition", "COUPLE_FULL");

        // Kullanıcının mevcut çifti
        const oldCoupleId = user.get("coupleId");

        if (oldCoupleId && oldCoupleId !== coupleRef.id) {

            const oldRef = db.doc(`couples/${oldCoupleId}`);
            const old = await tx.get(oldRef);
            const oldMembers = old.exists ? (old.get("members") || []) : [];

            if (oldMembers.length >= 2) {
                throw new HttpsError("failed-precondition", "ALREADY_IN_COUPLE");
            }

            if (old.exists) tx.delete(oldRef);

        }

        tx.update(coupleRef, {
            members: admin.firestore.FieldValue.arrayUnion(uid)
        });

        tx.set(userRef, { coupleId: coupleRef.id }, { merge: true });

        waiting = members.filter(m => m !== uid);

        return coupleRef.id;

    });

    logger.info("Çifte katıldı", { uid, coupleId });

    // Davet edene haber ver
    if (waiting.length) {

        const name = await userName(uid, "Partnerin");

        await Promise.all(waiting.map(to => sendPushToUser(to, {
            title: `💞 ${name} sana katıldı!`,
            body: "Artık bağlısınız. İlk notunu bırakmaya ne dersin? 💜",
            data: { page: "home", type: "joined" }
        }).catch(error => logger.warn("Katılma bildirimi gönderilemedi", { error: error.message }))));

    }

    return { coupleId };

});

// ─────────────────────────────────────────────────────────────
// Silinen kaydın fotoğraf dosyalarını Storage'dan da sil
// (kayıtta imagePath / thumbPath alanları varsa)
// ─────────────────────────────────────────────────────────────

async function deleteStoredImages(event) {

    const data = event.data?.data();

    if (!data) return;

    const paths = [data.imagePath, data.thumbPath].filter(Boolean);

    if (paths.length === 0) return;

    const bucket = admin.storage().bucket();

    await Promise.all(paths.map(path =>
        bucket.file(path).delete({ ignoreNotFound: true }).catch(error => {
            logger.warn("Dosya silinemedi", { path, error: error.message });
        })
    ));

}

exports.onPhotoDeleted = onDocumentDeleted("photos/{id}", deleteStoredImages);
exports.onMemoryDeleted = onDocumentDeleted("memories/{id}", deleteStoredImages);
exports.onSliderImageDeleted = onDocumentDeleted("sliderImages/{id}", deleteStoredImages);
exports.onDreamDeleted = onDocumentDeleted("dreams/{id}", deleteStoredImages);

// Hayalin fotoğrafı kaldırılınca dosyaları da sil
exports.onDreamPhotoRemoved = onDocumentUpdated("dreams/{id}", async (event) => {

    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};

    const gone = [before.imagePath, before.thumbPath]
        .filter(path => path && path !== after.imagePath && path !== after.thumbPath);

    if (gone.length === 0) return;

    const bucket = admin.storage().bucket();

    await Promise.all(gone.map(path =>
        bucket.file(path).delete({ ignoreNotFound: true }).catch(error => {
            logger.warn("Dosya silinemedi", { path, error: error.message });
        })
    ));

});


// ═════════════════════════════════════════════════════════════
// MÜHÜRLÜ MEKTUPLAR
//
// Bir mektup açılış tarihine kadar partnere görünmez. İçerik iki
// kayda bölünür:
//
//   letters/{id}         Çiftin ikisi de görür. Mühürlüyken sadece
//                        "mühürlü bir mektup var" bilgisi ve (gizli
//                        değilse) açılış tarihi durur. Açılınca metin
//                        ve fotoğraf buraya kopyalanır.
//   letterContents/{id}  Sadece yazan okuyabilir: metin, gerçek açılış
//                        tarihi, fotoğraf. Açılınca silinir.
//
// Fotoğraf mühürlüyken couples/{c}/sealed/{yazan}/ altında durur
// (sadece yazan okuyabilir); açılınca couples/{c}/letters/ altına
// kopyalanır.
//
// İstemci bu kayıtlara doğrudan yazamaz; her şey aşağıdaki
// fonksiyonlardan geçer. Böylece kilit, sınır ve tarih kontrolü
// telefonda değil sunucuda yapılır (telefonun saatini ileri almak
// işe yaramaz).
// ═════════════════════════════════════════════════════════════

// Aynı anda kaç mühürlü mektup bırakılabilir (yazan kişi başına)
const LETTER_LIMITS = { free: 1, premium: 20 };

const LETTER_MAX_TEXT = 5000;
const LETTER_MIN_DELAY_MS = 60 * 1000;
const LETTER_MAX_DELAY_MS = 5 * 365 * 24 * 60 * 60 * 1000;

function letterLimit(couple) {

    return isPremiumCouple(couple) ? LETTER_LIMITS.premium : LETTER_LIMITS.free;

}

function sealedPaths(coupleId, uid, id) {

    const base = `couples/${coupleId}/sealed/${uid}/${id}`;

    return { imagePath: `${base}.jpg`, thumbPath: `${base}_thumb.jpg` };

}

function openedPaths(coupleId, id) {

    const base = `couples/${coupleId}/letters/${id}`;

    return { imagePath: `${base}.jpg`, thumbPath: `${base}_thumb.jpg` };

}

// Dosyanın indirme bağlantısı (Firebase istemcisinin getDownloadURL'i ile aynı biçim)
async function downloadUrl(file) {

    const [meta] = await file.getMetadata();

    let token = meta.metadata?.firebaseStorageDownloadTokens?.split(",")[0];

    if (!token) {
        token = crypto.randomUUID();
        await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    }

    return `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/` +
        `${encodeURIComponent(file.name)}?alt=media&token=${token}`;

}

async function imageFields(paths) {

    const bucket = admin.storage().bucket();
    const full = bucket.file(paths.imagePath);
    const thumb = bucket.file(paths.thumbPath);

    const [[fullExists], [thumbExists]] = await Promise.all([full.exists(), thumb.exists()]);

    if (!fullExists || !thumbExists) {
        throw new HttpsError("failed-precondition", "PHOTO_NOT_UPLOADED");
    }

    const [imageUrl, thumbUrl] = await Promise.all([downloadUrl(full), downloadUrl(thumb)]);

    return { imageUrl, thumbUrl, imagePath: paths.imagePath, thumbPath: paths.thumbPath };

}

// Giriş yapmış kullanıcının çifti (ve partnerin olup olmadığı)
async function requireCouple(uid) {

    if (!uid) throw new HttpsError("unauthenticated", "Giriş yapmalısın.");

    const coupleId = (await db.doc(`users/${uid}`).get()).get("coupleId");

    if (!coupleId) throw new HttpsError("failed-precondition", "COUPLE_NOT_FOUND");

    const couple = await db.doc(`couples/${coupleId}`).get();
    const members = couple.get("members") || [];

    if (!members.includes(uid)) throw new HttpsError("permission-denied", "COUPLE_NOT_FOUND");

    const partnerId = members.find(m => m !== uid) || null;

    return { coupleId, couple, partnerId };

}

function cleanLetterInput(data, { requireAll = true } = {}) {

    const text = String(data?.text ?? "").replace(/\r\n/g, "\n").trim();
    const openAtMs = Number(data?.openAt);
    const hideDate = data?.hideDate === true;

    if (text.length > LETTER_MAX_TEXT) {
        throw new HttpsError("invalid-argument", "TEXT_TOO_LONG");
    }

    if (requireAll || data?.openAt !== undefined) {

        const now = Date.now();

        if (!Number.isFinite(openAtMs) || openAtMs < now + LETTER_MIN_DELAY_MS) {
            throw new HttpsError("invalid-argument", "DATE_IN_PAST");
        }

        if (openAtMs > now + LETTER_MAX_DELAY_MS) {
            throw new HttpsError("invalid-argument", "DATE_TOO_FAR");
        }

    }

    return { text, openAtMs, hideDate };

}

// "3 gün sonra", "5 saat sonra" — saat diliminden bağımsız
function relativeOpenText(openAtMs) {

    const diff = Math.max(0, openAtMs - Date.now());
    const hours = Math.round(diff / 3600000);
    const days = Math.round(diff / 86400000);

    if (diff < 3600000) return `${Math.max(1, Math.round(diff / 60000))} dakika sonra`;
    if (hours < 36) return `${hours} saat sonra`;
    if (days < 60) return `${days} gün sonra`;

    const months = Math.round(days / 30);

    if (months < 24) return `${months} ay sonra`;

    return `${Math.round(days / 365)} yıl sonra`;

}

// ── Mektup mühürle ──────────────────────────────────────────
// data: { id, text, openAt (ms), hideDate, hasPhoto }
// Fotoğraf varsa istemci önce sealed/ yoluna yükler, sonra bunu çağırır.
exports.sealLetter = onCall(async (request) => {

    const uid = request.auth?.uid;
    const { coupleId, couple, partnerId } = await requireCouple(uid);

    if (!partnerId) throw new HttpsError("failed-precondition", "NO_PARTNER");

    const id = String(request.data?.id || "");

    if (!/^[A-Za-z0-9]{15,40}$/.test(id)) throw new HttpsError("invalid-argument", "BAD_ID");

    const { text, openAtMs, hideDate } = cleanLetterInput(request.data);
    const hasPhoto = request.data?.hasPhoto === true;

    if (!text && !hasPhoto) throw new HttpsError("invalid-argument", "EMPTY_LETTER");

    // Sınır: bu kişinin şu an mühürlü kaç mektubu var?
    const active = await db.collection("letterContents")
        .where("authorId", "==", uid)
        .count()
        .get();

    if (active.data().count >= letterLimit(couple)) {
        throw new HttpsError("resource-exhausted", "LETTER_LIMIT");
    }

    const photo = hasPhoto ? await imageFields(sealedPaths(coupleId, uid, id)) : {};

    const letterRef = db.doc(`letters/${id}`);
    const contentRef = db.doc(`letterContents/${id}`);
    const openAt = admin.firestore.Timestamp.fromMillis(openAtMs);
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.runTransaction(async tx => {

        if ((await tx.get(letterRef)).exists) {
            throw new HttpsError("already-exists", "BAD_ID");
        }

        tx.set(letterRef, {
            coupleId,
            authorId: uid,
            status: "sealed",
            hideDate,
            openAt: hideDate ? null : openAt,
            hasPhoto,
            seenBy: [uid],
            createdAt: now,
            updatedAt: now
        });

        tx.set(contentRef, {
            coupleId,
            authorId: uid,
            text,
            openAt,
            hideDate,
            hasPhoto,
            ...photo,
            createdAt: now,
            updatedAt: now
        });

    });

    const name = await userName(uid);

    await sendPushToUser(partnerId, {
        title: `💌 ${name}`,
        body: hideDate
            ? "Sana mühürlü bir mektup bıraktı. Ne zaman açılacağı sürpriz 🤫"
            : `Sana mühürlü bir mektup bıraktı · ${relativeOpenText(openAtMs)} açılacak`,
        data: { page: "our-letters", type: "letters", id },
        category: "letters"
    });

    logger.info("Mektup mühürlendi", { id, coupleId, hideDate, hasPhoto });

    return { id };

});

// ── Mühürlü mektubu düzenle ─────────────────────────────────
// data: { id, text, openAt, hideDate, photo: "keep" | "replace" | "remove" }
exports.updateLetter = onCall(async (request) => {

    const uid = request.auth?.uid;
    const { coupleId } = await requireCouple(uid);

    const id = String(request.data?.id || "");
    const contentRef = db.doc(`letterContents/${id}`);
    const letterRef = db.doc(`letters/${id}`);

    const content = await contentRef.get();

    if (!content.exists || content.get("authorId") !== uid) {
        throw new HttpsError("not-found", "LETTER_NOT_FOUND");
    }

    const { text, openAtMs, hideDate } = cleanLetterInput(request.data);
    const photoMode = ["keep", "replace", "remove"].includes(request.data?.photo)
        ? request.data.photo
        : "keep";

    let photo = {};
    let hasPhoto = content.get("hasPhoto") === true;
    const paths = sealedPaths(coupleId, uid, id);

    if (photoMode === "replace") {
        photo = await imageFields(paths);
        hasPhoto = true;
    }

    if (photoMode === "remove" && hasPhoto) {

        const bucket = admin.storage().bucket();

        await Promise.all([paths.imagePath, paths.thumbPath].map(p =>
            bucket.file(p).delete({ ignoreNotFound: true })
        ));

        const del = admin.firestore.FieldValue.delete();

        photo = { imageUrl: del, thumbUrl: del, imagePath: del, thumbPath: del };
        hasPhoto = false;

    }

    if (!text && !hasPhoto) throw new HttpsError("invalid-argument", "EMPTY_LETTER");

    const openAt = admin.firestore.Timestamp.fromMillis(openAtMs);
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.runTransaction(async tx => {

        const letter = await tx.get(letterRef);

        if (!letter.exists || letter.get("status") !== "sealed") {
            throw new HttpsError("failed-precondition", "ALREADY_OPEN");
        }

        tx.update(contentRef, { text, openAt, hideDate, hasPhoto, ...photo, updatedAt: now });

        tx.update(letterRef, {
            hideDate,
            openAt: hideDate ? null : openAt,
            hasPhoto,
            updatedAt: now
        });

    });

    return { id };

});

// ── Mektubu sil ─────────────────────────────────────────────
// Mühürlüyse sadece yazan iptal edebilir; açılmışsa iki taraf da silebilir.
// Dosyalar, kayıt silinince aşağıdaki tetikleyicilerle temizlenir.
exports.deleteLetter = onCall(async (request) => {

    const uid = request.auth?.uid;
    const { coupleId } = await requireCouple(uid);

    const id = String(request.data?.id || "");
    const letterRef = db.doc(`letters/${id}`);
    const contentRef = db.doc(`letterContents/${id}`);

    const letter = await letterRef.get();

    if (!letter.exists || letter.get("coupleId") !== coupleId) {
        throw new HttpsError("not-found", "LETTER_NOT_FOUND");
    }

    if (letter.get("status") === "sealed" && letter.get("authorId") !== uid) {
        throw new HttpsError("permission-denied", "NOT_AUTHOR");
    }

    const batch = db.batch();

    batch.delete(letterRef);
    batch.delete(contentRef);

    await batch.commit();

    return { id };

});

// ── Mektubu aç ──────────────────────────────────────────────
// Tarihi geldiyse içeriği letters/ kaydına taşır, fotoğrafı kopyalar,
// iki tarafa da bildirim gönderir. Birden çok kez çağrılsa da bir kez açar.
async function openLetter(id) {

    const contentRef = db.doc(`letterContents/${id}`);
    const letterRef = db.doc(`letters/${id}`);

    const content = await contentRef.get();

    if (!content.exists) return false;

    if (content.get("openAt").toMillis() > Date.now()) return false;

    const coupleId = content.get("coupleId");
    const authorId = content.get("authorId");

    // Fotoğrafı herkesin (çiftin) okuyabileceği yere kopyala
    let photo = {};

    if (content.get("hasPhoto")) {

        const bucket = admin.storage().bucket();
        const from = sealedPaths(coupleId, authorId, id);
        const to = openedPaths(coupleId, id);

        try {

            await bucket.file(from.imagePath).copy(bucket.file(to.imagePath));
            await bucket.file(from.thumbPath).copy(bucket.file(to.thumbPath));

            photo = await imageFields(to);

        } catch (error) {

            // Fotoğrafsız açmak yerine bekle; bir sonraki dakika tekrar denenir
            logger.error("Mektup fotoğrafı kopyalanamadı", { id, error: error.message });
            return false;

        }

    }

    const opened = await db.runTransaction(async tx => {

        const [c, l] = await Promise.all([tx.get(contentRef), tx.get(letterRef)]);

        if (!c.exists || !l.exists || l.get("status") !== "sealed") return false;

        tx.update(letterRef, {
            status: "open",
            ...dayIndexFields(new Date(), "open"),
            text: c.get("text") || "",
            openAt: c.get("openAt"),
            openedAt: admin.firestore.FieldValue.serverTimestamp(),
            hasPhoto: Object.keys(photo).length > 0,
            ...photo,
            // Açıldığı için partnere tekrar "yeni" görünsün
            seenBy: [authorId],
            readAt: null
        });

        // İçerik kaydı silinince mühürlü fotoğraflar da silinir (tetikleyici)
        tx.delete(contentRef);

        return true;

    });

    if (!opened) return false;

    const couple = await db.doc(`couples/${coupleId}`).get();
    const partnerId = (couple.get("members") || []).find(m => m !== authorId);
    const [authorName, partnerName] = await Promise.all([
        userName(authorId),
        partnerId ? userName(partnerId) : Promise.resolve("Sevgilin")
    ]);

    const data = { page: "our-letters", type: "letters", id };

    if (partnerId) {
        await sendPushToUser(partnerId, {
            title: "💌 Mühürlü mektubun açıldı",
            body: `${authorName} sana yazmıştı, şimdi okuyabilirsin`,
            data,
            category: "letters"
        });
    }

    // Yazana sadece "okundu" bildirimi gider (onLetterRead)

    logger.info("Mektup açıldı", { id, coupleId });

    return true;

}

// Geri sayım bitince uygulama hemen açtırmak için çağırır
exports.openLetterNow = onCall(async (request) => {

    const { coupleId } = await requireCouple(request.auth?.uid);

    const id = String(request.data?.id || "");
    const letter = await db.doc(`letters/${id}`).get();

    if (!letter.exists || letter.get("coupleId") !== coupleId) {
        throw new HttpsError("not-found", "LETTER_NOT_FOUND");
    }

    return { opened: await openLetter(id) };

});

// Uygulama kapalıyken de açılsın: her dakika tarihi gelenleri aç
exports.openDueLetters = onSchedule({ schedule: "every 1 minutes", maxInstances: 1 }, async () => {

    const due = await db.collection("letterContents")
        .where("openAt", "<=", admin.firestore.Timestamp.now())
        .limit(50)
        .get();

    for (const doc of due.docs) {

        try {
            await openLetter(doc.id);
        } catch (error) {
            logger.error("Mektup açılamadı", { id: doc.id, error: error.message });
        }

    }

});

// Partner mektubu okuyunca yazana haber ver
exports.onLetterRead = onDocumentUpdated("letters/{id}", async (event) => {

    const before = event.data.before.data();
    const after = event.data.after.data();

    if (!after || after.status !== "open") return;
    if (before.readAt || !after.readAt) return;

    const couple = await db.doc(`couples/${after.coupleId}`).get();
    const readerId = (couple.get("members") || []).find(m => m !== after.authorId);

    if (!readerId) return;

    await sendPushToUser(after.authorId, {
        title: "💜 Mektubun okundu",
        body: `${await userName(readerId)} mektubunu okudu`,
        data: { page: "our-letters", type: "letters", id: event.params.id },
        category: "letters"
    });

});

// Dosya temizliği
exports.onLetterDeleted = onDocumentDeleted("letters/{id}", deleteStoredImages);
exports.onLetterContentDeleted = onDocumentDeleted("letterContents/{id}", deleteStoredImages);


// ═════════════════════════════════════════════════════════════
// GÜNÜN SORUSU
//
//   dailyQuestions/{coupleId}_{gün}   Çiftin ikisi de görür: soru,
//        kimlerin cevapladığı (answeredBy), açıldıysa iki cevap
//        (answers) ve tepkiler (reactions).
//   questionAnswers/{coupleId}_{gün}_{uid}   Sadece yazan görür.
//
// İkisi de cevaplayınca sunucu iki cevabı dailyQuestions'a kopyalar
// (revealed: true). O ana kadar partnerin cevabı telefona hiç inmez.
//
// Soru sırası: couples.questionCursor. Kimsenin uygulamayı açmadığı
// günlerde soru verilmez, havuz boşa harcanmaz. Premium çiftlerin
// kendi soruları (couples.customQueue) sıradaki havuz sorusundan önce gelir.
// ═════════════════════════════════════════════════════════════

const { QUESTIONS } = require("./questions");

// Gün sınırı bu saat dilimine göre (ileride çifte göre ayarlanabilir)
const QUESTION_TIMEZONE = "Europe/Istanbul";
const ANSWER_MAX = 1000;
const CUSTOM_QUEUE_MAX = 30;
const QUESTION_REACTIONS = ["❤️", "😂", "😮", "🥺", "🔥", "👏"];

function questionDayKey(date = new Date()) {

    // en-CA biçimi: 2026-11-12
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: QUESTION_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);

}

function questionDocId(coupleId, day) {

    return `${coupleId}_${day}`;

}

// Bugünün sorusunu (yoksa) oluştur
exports.ensureTodayQuestion = onCall(async (request) => {

    const uid = request.auth?.uid;
    const { coupleId } = await requireCouple(uid);

    const day = questionDayKey();
    const questionRef = db.doc(`dailyQuestions/${questionDocId(coupleId, day)}`);
    const coupleRef = db.doc(`couples/${coupleId}`);

    await db.runTransaction(async tx => {

        const [question, couple] = await Promise.all([tx.get(questionRef), tx.get(coupleRef)]);

        if (question.exists) return;

        const queue = couple.get("customQueue") || [];
        const cursor = couple.get("questionCursor") || 0;

        let data;

        if (queue.length > 0) {

            const [custom, ...rest] = queue;

            data = { text: custom.text, category: "custom", customBy: custom.authorId || null, index: null };

            tx.update(coupleRef, { customQueue: rest });

        } else {

            const q = QUESTIONS[cursor % QUESTIONS.length];

            data = { text: q.text, category: q.category, index: cursor };

            tx.update(coupleRef, { questionCursor: cursor + 1 });

        }

        tx.set(questionRef, {
            coupleId,
            day,
            ...data,
            answeredBy: [],
            revealed: false,
            answers: {},
            reactions: {},
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

    });

    return { id: questionRef.id, day };

});

// Cevap ver (ya da açılmadan önce düzenle)
// data: { day: "2026-11-12", text }
exports.answerQuestion = onCall(async (request) => {

    const uid = request.auth?.uid;
    const { coupleId, partnerId } = await requireCouple(uid);

    const day = String(request.data?.day || "");
    const text = String(request.data?.text ?? "").replace(/\r\n/g, "\n").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpsError("invalid-argument", "BAD_DAY");
    if (!text) throw new HttpsError("invalid-argument", "EMPTY_ANSWER");
    if (text.length > ANSWER_MAX) throw new HttpsError("invalid-argument", "TEXT_TOO_LONG");

    const questionRef = db.doc(`dailyQuestions/${questionDocId(coupleId, day)}`);
    const myRef = db.doc(`questionAnswers/${questionDocId(coupleId, day)}_${uid}`);
    const partnerRef = partnerId
        ? db.doc(`questionAnswers/${questionDocId(coupleId, day)}_${partnerId}`)
        : null;

    const result = await db.runTransaction(async tx => {

        const [question, mine, theirs] = await Promise.all([
            tx.get(questionRef),
            tx.get(myRef),
            partnerRef ? tx.get(partnerRef) : Promise.resolve(null)
        ]);

        if (!question.exists || question.get("coupleId") !== coupleId) {
            throw new HttpsError("not-found", "QUESTION_NOT_FOUND");
        }

        if (question.get("revealed")) {
            throw new HttpsError("failed-precondition", "ALREADY_REVEALED");
        }

        const now = admin.firestore.Timestamp.now();
        const firstTime = !mine.exists;

        tx.set(myRef, {
            coupleId,
            day,
            authorId: uid,
            text,
            answeredAt: mine.exists ? mine.get("answeredAt") : now,
            updatedAt: now
        });

        // Partner de cevapladıysa ikisini birlikte aç
        if (theirs?.exists) {

            tx.update(questionRef, {
                answeredBy: admin.firestore.FieldValue.arrayUnion(uid),
                revealed: true,
                revealedAt: now,
                answers: {
                    [uid]: { text, at: now },
                    [partnerId]: { text: theirs.get("text"), at: theirs.get("answeredAt") || now }
                }
            });

            return { revealed: true, firstTime };

        }

        tx.update(questionRef, {
            answeredBy: admin.firestore.FieldValue.arrayUnion(uid)
        });

        return { revealed: false, firstTime };

    });

    if (partnerId) {

        const name = await userName(uid);
        const data = { page: "question", type: "question", day };

        if (result.revealed) {

            await sendPushToUser(partnerId, {
                title: "💬 Cevaplarınız açıldı",
                body: `${name} de günün sorusunu cevapladı. Gel bak ne yazmış!`,
                data,
                tag: `question-${day}`,
                category: "questions"
            });

        } else if (result.firstTime) {

            await sendPushToUser(partnerId, {
                title: `💬 ${name} günün sorusunu cevapladı`,
                body: "Seninkini bekliyor 👀 Sen de cevaplayınca ikiniz de görebileceksiniz.",
                data,
                tag: `question-${day}`,
                category: "questions"
            });

        }

    }

    return { revealed: result.revealed };

});

// Kendi sorunu ekle (Premium)
exports.addCustomQuestion = onCall(async (request) => {

    const uid = request.auth?.uid;
    const { coupleId, couple } = await requireCouple(uid);

    if (!isPremiumCouple(couple)) {
        throw new HttpsError("permission-denied", "PREMIUM_REQUIRED");
    }

    const text = String(request.data?.text ?? "").replace(/\s+/g, " ").trim();

    if (text.length < 5) throw new HttpsError("invalid-argument", "TOO_SHORT");
    if (text.length > 200) throw new HttpsError("invalid-argument", "TEXT_TOO_LONG");

    const queue = couple.get("customQueue") || [];

    if (queue.length >= CUSTOM_QUEUE_MAX) throw new HttpsError("resource-exhausted", "QUEUE_FULL");

    await db.doc(`couples/${coupleId}`).update({
        customQueue: admin.firestore.FieldValue.arrayUnion({
            text,
            authorId: uid,
            at: admin.firestore.Timestamp.now()
        })
    });

    return { position: queue.length + 1 };

});

// Cevaba tepki bırakılınca diğerine haber ver
exports.onQuestionReaction = onDocumentUpdated("dailyQuestions/{id}", async (event) => {

    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};

    const prev = before.reactions || {};
    const next = after.reactions || {};

    for (const [reactorId, emoji] of Object.entries(next)) {

        if (!emoji || prev[reactorId] === emoji) continue;
        if (!QUESTION_REACTIONS.includes(emoji)) continue;

        const couple = await db.doc(`couples/${after.coupleId}`).get();
        const otherId = (couple.get("members") || []).find(m => m !== reactorId);

        if (!otherId) continue;

        await sendPushToUser(otherId, {
            title: `${emoji} ${await userName(reactorId)}`,
            body: "Günün sorusundaki cevabına tepki bıraktı",
            data: { page: "our-questions", type: "question", day: after.day },
            tag: `question-reaction-${after.day}`,
            category: "questions"
        });

    }

});


// ═════════════════════════════════════════════════════════════
// RUH HALİ
//
//   couples.moods.{uid} = { mood, note, at }   şu anki ruh hali
//   moodLogs/{id}                              geçmiş (takvim, Premium)
//   nudges/{id}                                "sarıl", "kahve" gibi karşılıklar
//
// Zor ruh hallerinde partnere bildirim gider, ama kişi başına 6 saatte
// en fazla bir kez. 6 saat ilk bildirimden sayılır; arada yapılan
// değişiklikler süreyi sıfırlamaz.
// ═════════════════════════════════════════════════════════════

const MOODS = {
    love:     { emoji: "🥰", label: "Aşık" },
    happy:    { emoji: "😊", label: "Mutlu" },
    calm:     { emoji: "😌", label: "Huzurlu" },
    tired:    { emoji: "😴", label: "Yorgun" },
    stressed: { emoji: "😰", label: "Stresli", notify: true },
    sad:      { emoji: "😔", label: "Üzgün", notify: true },
    angry:    { emoji: "😤", label: "Sinirli", notify: true },
    sick:     { emoji: "🤒", label: "Hasta", notify: true }
};

const MOOD_NOTIFY_GAP_MS = 6 * 60 * 60 * 1000;

const NUDGES = {
    hug:    { emoji: "🫂", text: "sana sarıldı" },
    coffee: { emoji: "☕", text: "sana kahve ısmarlıyor" },
    kiss:   { emoji: "😘", text: "sana bir öpücük gönderdi" },
    // Bugün geçen yıl → "Hatırladım"
    remember: { emoji: "💜", text: null, page: "onthisday" }
};

exports.onMoodLogged = onDocumentCreated("moodLogs/{id}", async (event) => {

    const data = event.data?.data();
    const mood = MOODS[data?.mood];

    if (!data || !mood?.notify) return;

    const { coupleId, authorId } = data;

    // Son bildirim zamanı sunucuya özel bir kayıtta tutulur
    const stateRef = db.doc(`moodNotify/${authorId}`);

    const allowed = await db.runTransaction(async tx => {

        const state = await tx.get(stateRef);
        const last = state.get("lastAt")?.toMillis?.() || 0;

        if (Date.now() - last < MOOD_NOTIFY_GAP_MS) return false;

        tx.set(stateRef, { lastAt: admin.firestore.Timestamp.now() });

        return true;

    });

    if (!allowed) {
        logger.info("Ruh hali bildirimi atlandı (6 saat dolmadı)", { authorId });
        return;
    }

    const couple = await db.doc(`couples/${coupleId}`).get();
    const partnerId = (couple.get("members") || []).find(m => m !== authorId);

    if (!partnerId) return;

    const name = await userName(authorId);
    const note = String(data.note || "").trim();

    await sendPushToUser(partnerId, {
        title: `${mood.emoji} ${name}: ${mood.label}`,
        body: note ? `“${note.slice(0, 100)}”` : "Bugün biraz desteğe ihtiyacı olabilir 💜",
        data: { page: "mood", type: "mood" },
        tag: "mood",
        category: "love"
    });

});

// Su hatırlatması (js/water.js): sevgilinin bardağına dokununca.
// Kişi başına yarım saatte en fazla bir tane.
const WATER_NUDGE_GAP_MS = 30 * 60 * 1000;

const WATER_NUDGE_LINES = [
    "Sevgilim, bir bardak su içer misin? Benim için 💙",
    "Su içme vakti! Sen içmeden içim rahat etmeyecek 🥺",
    "Bir bardak su iç, sonra gelip sana sarılacağım 🫂",
    "Güzel bardağın boş kalmasın, hadi bir yudum 💧",
    "Seni seviyorum, şimdi bir bardak su iç 😘",
    "Kendine iyi bak diye hatırlatıyorum: bir bardak su 💙"
];

async function sendWaterNudge(data) {

    const stateRef = db.doc(`waterNudge/${data.authorId}`);

    const allowed = await db.runTransaction(async tx => {
        const state = await tx.get(stateRef);
        const last = state.get("lastAt")?.toMillis?.() || 0;
        if (Date.now() - last < WATER_NUDGE_GAP_MS) return false;
        tx.set(stateRef, { lastAt: admin.firestore.Timestamp.now() });
        return true;
    });

    if (!allowed) {
        logger.info("Su hatırlatması atlandı (30 dk dolmadı)", { authorId: data.authorId });
        return;
    }

    const couple = await db.doc(`couples/${data.coupleId}`).get();
    const partnerId = (couple.get("members") || []).find(m => m !== data.authorId);

    if (!partnerId) return;

    const line = WATER_NUDGE_LINES[Math.floor(Math.random() * WATER_NUDGE_LINES.length)];

    await sendPushToUser(partnerId, {
        title: `💧 ${await userName(data.authorId)}`,
        body: line,
        data: { page: "water", type: "nudge" },
        tag: "water",
        category: "love"
    });

}

exports.onNudge = onDocumentCreated("nudges/{id}", async (event) => {

    const data = event.data?.data();

    if (data?.type === "water") {
        await sendWaterNudge(data);
        return;
    }

    const nudge = NUDGES[data?.type];

    if (!data || !nudge) return;

    const couple = await db.doc(`couples/${data.coupleId}`).get();
    const partnerId = (couple.get("members") || []).find(m => m !== data.authorId);

    if (!partnerId) return;

    const label = String(data.label || "").slice(0, 40);

    await sendPushToUser(partnerId, {
        title: `${nudge.emoji} ${await userName(data.authorId)}`,
        body: nudge.text || (label
            ? `${label.replace(/ bugün$/, "")}ki bir anınızı hatırladı`
            : "Eski bir anınızı hatırladı"),
        data: { page: nudge.page || "mood", type: "nudge" },
        tag: nudge.page ? "remember" : "nudge",
        category: "love"
    });

});


// ═════════════════════════════════════════════════════════════
// BUGÜN GEÇEN YIL
//
// Her kayda eklendiği günün anahtarı yazılır:
//   md: "11-12", dayKey: "2026-11-12"  (Türkiye saatine göre)
//   (açılan mektuplarda openMd / openDayKey)
//
// Her gece 00:05'te her çift için bugüne denk gelen anılar
// (3 ay, 6 ay, 1 yıl, 2 yıl… önce) bulunur ve
// onThisDay/{coupleId}_{gün} kaydına yazılır. Uygulama sadece
// bu kaydı okur. Sabah 9'da anısı olan çiftlere bildirim gider.
//
// Ayın her ayda olmayan günleri (ör. 30 Kasım + 3 ay): dönüm,
// hedef ayın son gününde gösterilir.
// ═════════════════════════════════════════════════════════════

const OTD_TIMEZONE = "Europe/Istanbul";
const OTD_MONTH_OFFSETS = [3, 6];
const OTD_MAX_YEARS = 20;
const OTD_INDEX_VERSION = 1;

// Türkiye saatine göre "YYYY-MM-DD"
function istanbulDayKey(date) {

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: OTD_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);

}

function dayIndexFields(date, prefix = "") {

    const dayKey = istanbulDayKey(date);
    const md = dayKey.slice(5);

    return prefix
        ? { [`${prefix}DayKey`]: dayKey, [`${prefix}Md`]: md }
        : { dayKey, md };

}

function lastDayOfMonth(year, month1) {

    return new Date(Date.UTC(year, month1, 0)).getUTCDate();

}

function pad2(n) {

    return String(n).padStart(2, "0");

}

function otdLabel(months) {

    return months < 12 ? `${months} ay önce bugün` : `${months / 12} yıl önce bugün`;

}

// Bugüne denk gelen kaynak günler: { "2025-11-12": { months, label }, … }
function anniversarySourceDays(todayKey) {

    const [ty, tm, td] = todayKey.split("-").map(Number);
    const todayIsLast = td === lastDayOfMonth(ty, tm);

    const offsets = [
        ...OTD_MONTH_OFFSETS,
        ...Array.from({ length: OTD_MAX_YEARS }, (_, i) => (i + 1) * 12)
    ];

    const result = {};

    for (const months of offsets) {

        // Kaynak ay
        const total = ty * 12 + (tm - 1) - months;
        const sy = Math.floor(total / 12);
        const sm = (total % 12) + 1;
        const sLast = lastDayOfMonth(sy, sm);

        // Kaynak günden "months" ay sonrası (gün yoksa ayın son günü) bugün olmalı
        const days = todayIsLast
            ? Array.from({ length: Math.max(0, sLast - td + 1) }, (_, i) => td + i)
            : (td <= sLast ? [td] : []);

        for (const d of days) {
            result[`${sy}-${pad2(sm)}-${pad2(d)}`] = { months, label: otdLabel(months) };
        }

    }

    return result;

}

// Yeni kayıtlara gün anahtarını yaz
async function indexCreatedDay(event) {

    const snap = event.data;

    if (!snap || snap.get("md")) return;

    const created = snap.get("createdAt")?.toDate?.() || new Date();

    await snap.ref.update(dayIndexFields(created)).catch(error => {
        logger.warn("Gün anahtarı yazılamadı", { path: snap.ref.path, error: error.message });
    });

}

exports.indexMemoryDay = onDocumentCreated("memories/{id}", indexCreatedDay);
exports.indexPhotoDay = onDocumentCreated("photos/{id}", indexCreatedDay);
exports.indexSongDay = onDocumentCreated("songs/{id}", indexCreatedDay);

// Bir çiftin eski kayıtlarına (bir kez) gün anahtarı yaz
async function backfillCoupleDays(coupleId) {

    let writes = 0;
    let batch = db.batch();

    const flush = async () => {
        if (writes % 400 === 0 && writes > 0) {
            await batch.commit();
            batch = db.batch();
        }
    };

    for (const name of ["memories", "photos", "songs"]) {

        const snap = await db.collection(name).where("coupleId", "==", coupleId).get();

        for (const doc of snap.docs) {

            if (doc.get("md")) continue;

            const created = doc.get("createdAt")?.toDate?.();

            if (!created) continue;

            batch.update(doc.ref, dayIndexFields(created));
            writes++;
            await flush();

        }

    }

    const letters = await db.collection("letters")
        .where("coupleId", "==", coupleId)
        .where("status", "==", "open")
        .get();

    for (const doc of letters.docs) {

        if (doc.get("openMd")) continue;

        const opened = (doc.get("openedAt") || doc.get("openAt"))?.toDate?.();

        if (!opened) continue;

        batch.update(doc.ref, dayIndexFields(opened, "open"));
        writes++;
        await flush();

    }

    if (writes % 400 !== 0) await batch.commit();

    await db.doc(`couples/${coupleId}`).update({ dayIndexVersion: OTD_INDEX_VERSION });

    logger.info("Gün anahtarları dolduruldu", { coupleId, writes });

}

// Bir çift için bugünün anılarını bul
async function findAnniversaries(coupleId, todayKey) {

    const sources = anniversarySourceDays(todayKey);
    const mds = [...new Set(Object.keys(sources).map(k => k.slice(5)))];

    if (mds.length === 0) return [];

    // "in" en fazla 30 değer alır
    const chunks = [];
    for (let i = 0; i < mds.length; i += 30) chunks.push(mds.slice(i, i + 30));

    const items = [];

    const collect = (name, snap, dayField) => {
        snap.docs.forEach(doc => {
            const source = sources[doc.get(dayField)];
            if (source) items.push({ collection: name, id: doc.id, months: source.months, label: source.label });
        });
    };

    for (const chunk of chunks) {

        for (const name of ["memories", "photos", "songs"]) {

            const snap = await db.collection(name)
                .where("coupleId", "==", coupleId)
                .where("md", "in", chunk)
                .get();

            collect(name, snap, "dayKey");

        }

        const letters = await db.collection("letters")
            .where("coupleId", "==", coupleId)
            .where("openMd", "in", chunk)
            .get();

        collect("letters", letters, "openDayKey");

    }

    // En eski dönüm önce; aynı dönümde fotoğraflı olanlar önce
    const order = { photos: 0, memories: 1, letters: 2, songs: 3 };

    return items.sort((a, b) => b.months - a.months || order[a.collection] - order[b.collection]);

}

// Her gece: bugünün anılarını hazırla
exports.prepareOnThisDay = onSchedule({
    schedule: "5 0 * * *",
    timeZone: OTD_TIMEZONE,
    maxInstances: 1,
    timeoutSeconds: 540
}, async () => {

    const todayKey = istanbulDayKey(new Date());

    // Yakınlık: 6 saatten eski konumları sil
    const stale = await db.collection("presence")
        .where("at", "<", admin.firestore.Timestamp.fromMillis(Date.now() - PRESENCE_KEEP_MS))
        .get();

    await Promise.all(stale.docs.map(d => d.ref.delete().catch(() => {})));

    const couples = await db.collection("couples").select("members", "dayIndexVersion").get();

    let withItems = 0;

    for (const couple of couples.docs) {

        if ((couple.get("members") || []).length < 2) continue;

        try {

            if (couple.get("dayIndexVersion") !== OTD_INDEX_VERSION) {
                await backfillCoupleDays(couple.id);
            }

            const items = await findAnniversaries(couple.id, todayKey);

            if (items.length === 0) continue;

            await db.doc(`onThisDay/${couple.id}_${todayKey}`).set({
                coupleId: couple.id,
                day: todayKey,
                label: items[0].label,
                items,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            withItems++;

        } catch (error) {

            logger.error("Bugün geçen yıl hazırlanamadı", { coupleId: couple.id, error: error.message });

        }

    }

    logger.info("Bugün geçen yıl hazır", { day: todayKey, couples: couples.size, withItems });

});

// Sabah 9: anısı olan çiftlere bildirim
exports.notifyOnThisDay = onSchedule({
    schedule: "0 9 * * *",
    timeZone: OTD_TIMEZONE,
    maxInstances: 1,
    timeoutSeconds: 540
}, async () => {

    const todayKey = istanbulDayKey(new Date());
    const snap = await db.collection("onThisDay").where("day", "==", todayKey).get();

    for (const doc of snap.docs) {

        const couple = await db.doc(`couples/${doc.get("coupleId")}`).get();
        const count = (doc.get("items") || []).length;

        for (const uid of couple.get("members") || []) {

            await sendPushToUser(uid, {
                title: `📅 ${doc.get("label")}`,
                body: count > 1 ? `${count} anınız var 💜` : "Bir anınız var 💜",
                data: { page: "onthisday", type: "onthisday" },
                tag: "onthisday",
                category: "reminders"
            }).catch(error => logger.warn("Bildirim gönderilemedi", { uid, error: error.message }));

        }

    }

});


// ═════════════════════════════════════════════════════════════
// YAKINLIK
//
// Uygulama açıkken telefon kaba konumunu reportPresence'a gönderir.
// Sunucu iki son konumu karşılaştırır ve sadece sonucu kaydeder:
//   couples.together = { active, lastAt, since }
//   togetherDays/{coupleId}_{YYYY-MM} = { coupleId, year, month, days: [...] }
// Konum presence/{uid} kaydında sadece son değer olarak durur,
// istemci okuyamaz ve 6 saatten eskisi silinir.
//
// İkisi de açmadıysa (couples.proximityOptIn.{uid}) çalışmaz.
// ═════════════════════════════════════════════════════════════

const PRESENCE_FRESH_MS = 30 * 60 * 1000;     // "aynı anda" sayılma penceresi
const PRESENCE_KEEP_MS = 6 * 60 * 60 * 1000;  // konum en fazla bu kadar tutulur
const TOGETHER_MIN_M = 100;                   // konum iyi ölçülünce eşik
const TOGETHER_MAX_M = 200;                   // konum belirsizken en fazla
const PRESENCE_MAX_ACCURACY_M = 500;          // bundan kötü ölçümle karar verilmez

function distanceMeters(a, b) {

    const R = 6371000;
    const rad = x => x * Math.PI / 180;

    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);

    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(h));

}

// İki ölçümün belirsizliğine göre 100–200 m arası eşik
function togetherThreshold(accA, accB) {

    const uncertainty = ((Number(accA) || 100) + (Number(accB) || 100)) / 2;

    return Math.min(TOGETHER_MAX_M, Math.max(TOGETHER_MIN_M, uncertainty));

}

exports.reportPresence = onCall(async (request) => {

    const uid = request.auth?.uid;
    const { coupleId, couple, partnerId } = await requireCouple(uid);

    const lat = Number(request.data?.lat);
    const lng = Number(request.data?.lng);
    const accuracy = Math.max(1, Math.min(5000, Number(request.data?.accuracy) || 100));

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new HttpsError("invalid-argument", "BAD_LOCATION");
    }

    const optIn = couple.get("proximityOptIn") || {};

    if (!optIn[uid]) throw new HttpsError("failed-precondition", "NOT_ENABLED");

    const now = Date.now();
    const myRef = db.doc(`presence/${uid}`);

    // Çok belirsiz ölçüm (ör. kapalı alanda 1-2 km): hiçbir şeyi değiştirme
    if (accuracy > PRESENCE_MAX_ACCURACY_M) return { together: null, unsure: true };

    await myRef.set({ coupleId, lat, lng, accuracy, at: admin.firestore.Timestamp.fromMillis(now) });

    if (!partnerId || !optIn[partnerId]) return { together: false, waiting: true };

    const partnerRef = db.doc(`presence/${partnerId}`);
    const partner = await partnerRef.get();

    let together = false;

    if (partner.exists) {

        const partnerAt = partner.get("at")?.toMillis?.() || 0;

        if (now - partnerAt > PRESENCE_KEEP_MS) {

            await partnerRef.delete().catch(() => {});

        } else if (
            now - partnerAt <= PRESENCE_FRESH_MS &&
            partner.get("coupleId") === coupleId &&
            (partner.get("accuracy") || 0) <= PRESENCE_MAX_ACCURACY_M
        ) {

            const distance = distanceMeters(
                { lat, lng },
                { lat: partner.get("lat"), lng: partner.get("lng") }
            );

            together = distance <= togetherThreshold(accuracy, partner.get("accuracy"));

        }

    }

    const coupleRef = db.doc(`couples/${coupleId}`);
    const previous = couple.get("together") || {};
    const nowTs = admin.firestore.Timestamp.fromMillis(now);

    if (together) {

        const wasActive = previous.active && now - (previous.lastAt?.toMillis?.() || 0) <= PRESENCE_FRESH_MS;

        await coupleRef.update({
            together: { active: true, lastAt: nowTs, since: wasActive ? previous.since : nowTs }
        });

        // Bugünü "yan yana geçen günler"e ekle
        const dayKey = istanbulDayKey(new Date(now));
        const monthKey = dayKey.slice(0, 7);

        await db.doc(`togetherDays/${coupleId}_${monthKey}`).set({
            coupleId,
            year: Number(dayKey.slice(0, 4)),
            month: monthKey,
            days: admin.firestore.FieldValue.arrayUnion(dayKey)
        }, { merge: true });

    } else if (previous.active) {

        await coupleRef.update({ "together.active": false });

    }

    return { together };

});

// Kapatınca konumu hemen sil
exports.clearPresence = onCall(async (request) => {

    const uid = request.auth?.uid;

    if (!uid) throw new HttpsError("unauthenticated", "Giriş yapmalısın.");

    await db.doc(`presence/${uid}`).delete().catch(() => {});

    return { ok: true };

});


// ═════════════════════════════════════════════════════════════
// HESAP SİLME
//
// Silen kişinin eklediği her şey silinir; partnerin ekledikleri
// partnerde kalır. Partner kalan çiftte "arşiv" olarak devam eder
// (couples.partnerLeft); bu çifte artık kimse katılamaz.
// Kayıtlar silinince fotoğraf dosyaları tetikleyicilerle silinir.
// İstemci önce şifreyle yeniden doğrulama yapar.
// ═════════════════════════════════════════════════════════════

// Silen kişinin eklediği kayıtların bulunduğu koleksiyonlar
const AUTHORED_COLLECTIONS = [
    "memories", "photos", "songs", "dreams", "events",
    "misses", "moodLogs", "nudges", "letters", "letterContents", "questionAnswers",
    "water", "reminders", "fridge", "notebook",
    // Eski slider fotoğraflarında authorId yok; onlar çift silinince gider
    "sliderImages"
];

async function deleteQueryInBatches(docs) {

    for (let i = 0; i < docs.length; i += 400) {

        const batch = db.batch();

        docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));

        await batch.commit();

    }

}

async function deleteStoragePrefix(prefix) {

    await admin.storage().bucket().deleteFiles({ prefix, force: true }).catch(error => {
        logger.warn("Storage klasörü silinemedi", { prefix, error: error.message });
    });

}

exports.deleteAccount = onCall(async (request) => {

    const uid = request.auth?.uid;

    if (!uid) throw new HttpsError("unauthenticated", "Giriş yapmalısın.");

    // Hassas işlem: son 10 dakika içinde şifreyle giriş/doğrulama yapılmış olmalı
    const authTime = (request.auth.token?.auth_time || 0) * 1000;

    if (Date.now() - authTime > 10 * 60 * 1000) {
        throw new HttpsError("failed-precondition", "REAUTH_REQUIRED");
    }

    const userRef = db.doc(`users/${uid}`);
    const user = await userRef.get();
    const myName = user.get("name") || "";
    const coupleId = user.get("coupleId") || null;

    logger.info("Hesap siliniyor", { uid, coupleId });

    if (coupleId) {

        const coupleRef = db.doc(`couples/${coupleId}`);
        const couple = await coupleRef.get();
        const members = (couple.get("members") || []).filter(m => m !== uid);

        // 1) Benim eklediklerim (eski kayıtlarda sadece isim tutuluyordu)
        for (const name of AUTHORED_COLLECTIONS) {

            const snap = await db.collection(name).where("coupleId", "==", coupleId).get();

            const mine = snap.docs.filter(d => {
                const data = d.data();
                return data.authorId === uid || (!data.authorId && myName && data.author === myName);
            });

            await deleteQueryInBatches(mine);

        }

        // 2) Günün Sorusu: açılmış cevaplardan benimkini çıkar
        const questions = await db.collection("dailyQuestions").where("coupleId", "==", coupleId).get();

        for (const q of questions.docs) {

            const answers = { ...(q.get("answers") || {}) };
            const reactions = { ...(q.get("reactions") || {}) };

            delete answers[uid];
            delete reactions[uid];

            await q.ref.update({
                answers,
                reactions,
                answeredBy: (q.get("answeredBy") || []).filter(m => m !== uid)
            });

        }

        // 3) Mühürlü mektup fotoğraflarım
        await deleteStoragePrefix(`couples/${coupleId}/sealed/${uid}/`);

        if (members.length === 0) {

            // Çiftte kimse kalmadı: ortak alanın tamamını sil
            for (const name of [
                ...AUTHORED_COLLECTIONS, "dailyQuestions",
                "onThisDay", "togetherDays", "songPlays", "wrapped"
            ]) {
                const rest = await db.collection(name).where("coupleId", "==", coupleId).get();
                await deleteQueryInBatches(rest.docs);
            }

            await deleteStoragePrefix(`couples/${coupleId}/`);
            await coupleRef.delete();

        } else {

            // Partner kalıyor: çift arşive dönüşür, kimse katılamaz
            const moods = { ...(couple.get("moods") || {}) };
            const optIn = { ...(couple.get("proximityOptIn") || {}) };

            delete moods[uid];
            delete optIn[uid];

            await coupleRef.update({
                members,
                moods,
                proximityOptIn: optIn,
                "together.active": false,
                partnerLeft: {
                    name: myName || null,
                    at: admin.firestore.FieldValue.serverTimestamp()
                },
                inviteCode: admin.firestore.FieldValue.delete()
            });

            await sendPushToUser(members[0], {
                title: "💔 Hesap silindi",
                body: `${myName || "Partnerin"} hesabını sildi. Senin eklediklerin uygulamada saklanıyor.`,
                data: { page: "home", type: "account" }
            }).catch(() => {});

        }

    }

    // 4) Kişisel kayıtlar
    const tokens = await db.collection("pushTokens").where("uid", "==", uid).get();

    await deleteQueryInBatches(tokens.docs);

    await Promise.all([
        db.doc(`presence/${uid}`).delete().catch(() => {}),
        db.doc(`moodNotify/${uid}`).delete().catch(() => {}),
        db.doc(`battery/${uid}`).delete().catch(() => {}),
        db.doc(`nowPlaying/${uid}`).delete().catch(() => {}),
        db.doc(`photoNotify/${uid}`).delete().catch(() => {}),
        db.doc(`missNotify/${uid}`).delete().catch(() => {}),
        db.doc(`waterNudge/${uid}`).delete().catch(() => {}),
        userRef.delete()
    ]);

    // 5) Giriş hesabı
    await admin.auth().deleteUser(uid);

    logger.info("Hesap silindi", { uid });

    return { ok: true };

});


// ─────────────────────────────────────────────────────────────
// Şu an dinliyorum
//
// nowPlaying/{uid}: kişi bir şarkıyı 5 dakikalığına paylaşır.
// • Spotify bağlantılarında sanatçı adı istemcide alınamıyor;
//   burada şarkı sayfasından eklenir
// • Partnere bildirim gider
// • Süresi geçen kayıtlar 10 dakikada bir silinir
// ─────────────────────────────────────────────────────────────

function decodeHtml(text) {
    return String(text || "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

async function spotifyTrackMeta(link) {

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {

        const res = await fetch(link, {
            signal: controller.signal,
            redirect: "follow",
            headers: { "User-Agent": "Mozilla/5.0 (compatible; KalpKalbe/1.0)", "Accept-Language": "tr,en" }
        });

        if (!res.ok) return {};

        const html = await res.text();

        const meta = name => {
            const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${name}"[^>]+content="([^"]*)"`, "i"))
                || html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${name}"`, "i"));
            return m ? decodeHtml(m[1]).trim() : "";
        };

        // Sayfa başlığı: "Cambaz - song and lyrics by Mor ve Ötesi | Spotify"
        // ya da "Şarkı - Song, Lyrics, and Music Video by Sanatçı | Spotify"
        const pageTitle = decodeHtml((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "");
        const fromTitle = pageTitle.match(/^(.*?)\s+-\s+.*?\bby\s+(.+?)\s*\|\s*Spotify/i);

        // og:description: "Sanatçı · Albüm · Song · 2004"
        const description = meta("og:description");

        const artist = meta("music:musician_description")
            || (fromTitle ? fromTitle[2] : "")
            || (description.includes(" · ") ? description.split(" · ")[0] : "");

        return {
            title: meta("og:title") || (fromTitle ? fromTitle[1] : ""),
            artist: artist.length < 120 ? artist : "",
            cover: meta("og:image")
        };

    } catch (error) {

        logger.warn("Spotify bilgisi alınamadı", { error: error.message });
        return {};

    } finally {

        clearTimeout(timer);

    }

}

exports.onNowPlaying = onDocumentWritten("nowPlaying/{uid}", async (event) => {

    const after = event.data?.after;

    if (!after?.exists) return;

    const data = after.data();
    const before = event.data.before?.exists ? event.data.before.data() : null;

    // Sunucunun kendi güncellemesi ya da aynı paylaşım: tekrar işleme
    if (before && before.shareId === data.shareId) return;

    const { coupleId, uid } = data;

    if (!coupleId || !uid) return;

    let { title, artist, cover } = data;

    if (data.platform === "spotify" && (!artist || !title)) {

        const meta = await spotifyTrackMeta(data.link);

        const update = {};

        if (!title && meta.title) update.title = title = meta.title.slice(0, 200);
        if (!artist && meta.artist) update.artist = artist = meta.artist.slice(0, 200);
        if (!cover && meta.cover) update.cover = cover = meta.cover.slice(0, 480);

        if (Object.keys(update).length) {
            await after.ref.update(update).catch(() => {});
        }

    }

    // Yılımız için: hangi şarkı kaç kere paylaşıldı (sadece sayı ve şarkı adı)
    await countSongPlay(coupleId, uid, { link: data.link, title, artist, cover })
        .catch(error => logger.warn("Şarkı paylaşımı sayılamadı", { error: error.message }));

    const coupleSnap = await db.doc(`couples/${coupleId}`).get();
    const recipients = (coupleSnap.get("members") || []).filter(m => m !== uid);

    if (recipients.length === 0) return;

    const name = await userName(uid);
    const song = [title, artist].filter(Boolean).join(" · ") || "Bir şarkı";

    for (const to of recipients) {
        await sendPushToUser(to, {
            title: `🎧 ${name} şu an dinliyor`,
            body: song,
            data: { page: "nowplaying", type: "nowPlaying" },
            tag: "nowplaying",
            category: "music"
        });
    }

});

exports.cleanupNowPlaying = onSchedule({ schedule: "every 10 minutes", maxInstances: 1 }, async () => {

    const expired = await db.collection("nowPlaying")
        .where("expiresAt", "<", admin.firestore.Timestamp.now())
        .get();

    await Promise.all(expired.docs.map(d => d.ref.delete().catch(() => {})));

    if (expired.size) logger.info("Süresi geçen 'şu an dinliyorum' silindi", { count: expired.size });

});

// ─────────────────────────────────────────────────────────────
// Fotoğraf bildirimi (toplu)
//
// Arka arkaya birkaç fotoğraf eklenirse tek bildirim gider:
// "Berk 4 fotoğraf ekledi". Her fotoğraf sayacı artırır, 40 sn
// bekler; o sürede yenisi gelmediyse bildirimi o gönderir.
// ─────────────────────────────────────────────────────────────

const PHOTO_BATCH_WAIT_MS = 40 * 1000;

exports.onPhotoCreated = onDocumentCreated({ document: "photos/{id}", timeoutSeconds: 120 }, async (event) => {

    const data = event.data?.data();
    const { coupleId, authorId } = data || {};

    if (!coupleId || !authorId) return;

    const stateRef = db.doc(`photoNotify/${authorId}`);
    const stamp = Date.now();

    await db.runTransaction(async tx => {
        const state = await tx.get(stateRef);
        const fresh = !state.exists || stamp - (state.get("lastAt") || 0) > 10 * 60 * 1000;
        tx.set(stateRef, {
            coupleId,
            count: fresh ? 1 : (state.get("count") || 0) + 1,
            lastAt: stamp
        });
    });

    await new Promise(resolve => setTimeout(resolve, PHOTO_BATCH_WAIT_MS));

    // Sırası gelen son fotoğraf mı? Öyleyse sayacı sıfırla ve gönder
    const count = await db.runTransaction(async tx => {
        const state = await tx.get(stateRef);
        if (!state.exists || state.get("lastAt") !== stamp) return 0;
        tx.delete(stateRef);
        return state.get("count") || 1;
    });

    if (!count) return;

    const couple = await db.doc(`couples/${coupleId}`).get();
    const recipients = (couple.get("members") || []).filter(m => m !== authorId);

    if (!recipients.length) return;

    const name = await userName(authorId);

    for (const to of recipients) {
        await sendPushToUser(to, {
            title: `📷 ${name}`,
            body: count > 1 ? `${count} yeni fotoğraf ekledi 💜` : "Yeni bir fotoğraf ekledi 💜",
            data: { page: "our-photos", type: "photos" },
            tag: "photos",
            category: "content"
        });
    }

});

// ─────────────────────────────────────────────────────────────
// Hatırlatmalar
//
// 09:00  Özel günler (bugün) + ilişki dönüm noktaları
//        (her ayın yıldönümü, yıl dönümü, her 100. gün)
// 21:00  Yarınki özel günler + seri tehlikede uyarısı
//
// Özel gün hatırlatmaları eskiden sadece Android telefonda yerel
// olarak kuruluyordu; artık sunucudan herkese gidiyor.
// ─────────────────────────────────────────────────────────────

function istanbulParts(date) {

    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: OTD_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date).map(p => [p.type, p.value]));

    return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };

}

function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// startDate "YYYY-MM-DD" → bugünkü dönüm noktası metni ya da null
function milestoneText(startDate, today) {

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDate || ""));

    if (!m) return null;

    const start = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };

    const startUtc = Date.UTC(start.y, start.m - 1, start.d);
    const todayUtc = Date.UTC(today.y, today.m - 1, today.d);

    if (todayUtc <= startUtc) return null;

    const days = Math.round((todayUtc - startUtc) / 86400000);

    // Ay yıldönümü: 31'inde başlayanlar için kısa aylarda ayın son günü
    const anniversaryDay = Math.min(start.d, daysInMonth(today.y, today.m));
    const months = (today.y - start.y) * 12 + (today.m - start.m);

    const texts = [];

    if (today.d === anniversaryDay && months > 0) {
        if (months % 12 === 0) texts.push(`🎉 Bugün ${months / 12}. yılınız!`);
        else texts.push(`💜 Bugün ${months}. ayınız!`);
    }

    if (days % 100 === 0) texts.push(`✨ Birlikte ${days}. gününüz`);

    return texts.length ? texts : null;

}

async function forEachCouple(handler) {

    const couples = await db.collection("couples").get();

    for (const couple of couples.docs) {

        const members = couple.get("members") || [];

        if (members.length < 2 || couple.get("partnerLeft")) continue;

        try {
            await handler(couple, members);
        } catch (error) {
            logger.warn("Hatırlatma hatası", { coupleId: couple.id, error: error.message });
        }

    }

}

async function eventsOn(coupleId, month, day) {

    const snap = await db.collection("events").where("coupleId", "==", coupleId).get();

    return snap.docs
        .map(d => d.data())
        .filter(e => Number(e.month) === month && Number(e.day) === day && e.name);

}

exports.morningReminders = onSchedule({
    schedule: "0 9 * * *",
    timeZone: OTD_TIMEZONE,
    maxInstances: 1,
    timeoutSeconds: 540
}, async () => {

    const today = istanbulParts(new Date());

    await forEachCouple(async (couple, members) => {

        for (const e of await eventsOn(couple.id, today.m, today.d)) {
            for (const uid of members) {
                await sendPushToUser(uid, {
                    title: `${e.emoji || "📅"} Bugün ${e.name}!`,
                    body: "Unutmayın 💜",
                    data: { page: "our-calendar", type: "event" },
                    tag: `event-${today.m}-${today.d}`,
                    category: "reminders"
                });
            }
        }

        await giftNotebookReminders(couple, members);

        const milestone = milestoneText(couple.get("startDate"), today);

        if (milestone) {
            for (const uid of members) {
                await sendPushToUser(uid, {
                    title: milestone[0],
                    body: milestone[1] || "Nice güzel günlere 💜",
                    data: { page: "home", type: "milestone" },
                    tag: "milestone",
                    category: "reminders"
                });
            }
        }

    });

});

exports.eveningReminders = onSchedule({
    schedule: "0 21 * * *",
    timeZone: OTD_TIMEZONE,
    maxInstances: 1,
    timeoutSeconds: 540
}, async () => {

    const now = new Date();
    const today = istanbulParts(now);
    const tomorrow = istanbulParts(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    const todayKey = `${today.y}-${String(today.m).padStart(2, "0")}-${String(today.d).padStart(2, "0")}`;

    await forEachCouple(async (couple, members) => {

        // Yarınki özel günler
        for (const e of await eventsOn(couple.id, tomorrow.m, tomorrow.d)) {
            for (const uid of members) {
                await sendPushToUser(uid, {
                    title: `${e.emoji || "📅"} Yarın ${e.name}`,
                    body: "Hazırlık için hâlâ vakit var 😉",
                    data: { page: "our-calendar", type: "event" },
                    tag: `event-${tomorrow.m}-${tomorrow.d}`,
                    category: "reminders"
                });
            }
        }

        // Seri: bugün henüz tamamlanmadıysa, uğramayanlara hatırlat
        const streak = couple.get("streak");
        const count = streak?.count || 0;

        if (count < 2 || !streak.lastCountedDay || streak.lastCountedDay >= todayKey) return;

        const visited = uid => {
            const day = streak.visits?.[uid];
            return !!day && day > streak.lastCountedDay;
        };

        const missing = members.filter(uid => !visited(uid));

        if (!missing.length) return;

        for (const uid of missing) {

            const partnerId = members.find(m => m !== uid);
            const partnerCame = partnerId && visited(partnerId);
            const partnerName = partnerCame ? await userName(partnerId) : "";

            await sendPushToUser(uid, {
                title: `🔥 ${count} günlük seriniz bozulmasın`,
                body: partnerCame
                    ? `${partnerName} bugün uğradı, senin de girmen yeterli 💗`
                    : "Bugün ikiniz de uygulamaya bir uğrayın 💗",
                data: { page: "home", type: "streak" },
                tag: "streak",
                category: "reminders"
            });

        }

    });

});


// ─────────────────────────────────────────────────────────────
// Premium
//
// Premium çift başınadır: biri alınca ikisi de kullanır.
// couples/{id}.premium = {
//   gift:  { until: Timestamp | null, grantedAt, note }   (hediye; null = süresiz)
//   store: { until: Timestamp, productId, store, buyerUid } (mağaza aboneliği)
// }
// couples/{id}.plan = "premium" | "free"  (ikisinden biri geçerliyse premium)
//
// • Hediye: sadece yöneticiler (admins/{uid} belgesi olanlar) verebilir
// • Mağaza: RevenueCat webhook'u (revenuecatWebhook) yazar
// • Süresi dolanlar her gece "free" olur (expirePremiums)
// ─────────────────────────────────────────────────────────────

function premiumPartActive(part, now = Date.now()) {

    if (!part) return false;

    if (part.until === null) return true;          // süresiz hediye

    const ms = part.until?.toMillis?.() ?? (typeof part.until === "number" ? part.until : 0);

    return ms > now;

}

function premiumActive(premium, now = Date.now()) {
    return premiumPartActive(premium?.gift, now) || premiumPartActive(premium?.store, now);
}

// premium haritasını yaz ve plan alanını ona göre ayarla
async function writeCouplePremium(coupleRef, mutate) {

    return db.runTransaction(async tx => {

        const snap = await tx.get(coupleRef);

        if (!snap.exists) throw new HttpsError("not-found", "COUPLE_NOT_FOUND");

        const premium = { ...(snap.get("premium") || {}) };

        mutate(premium);

        Object.keys(premium).forEach(k => premium[k] === undefined && delete premium[k]);

        tx.update(coupleRef, {
            premium,
            plan: premiumActive(premium) ? "premium" : "free"
        });

        return premium;

    });

}

async function requireAdmin(request) {

    const uid = request.auth?.uid;

    if (!uid) throw new HttpsError("unauthenticated", "NOT_SIGNED_IN");

    const adminDoc = await db.doc(`admins/${uid}`).get();

    if (!adminDoc.exists) throw new HttpsError("permission-denied", "NOT_ADMIN");

    return uid;

}

async function coupleRefForEmail(email) {

    let user;

    try {
        user = await admin.auth().getUserByEmail(String(email || "").trim().toLowerCase());
    } catch {
        throw new HttpsError("not-found", "USER_NOT_FOUND");
    }

    const coupleId = (await db.doc(`users/${user.uid}`).get()).get("coupleId");

    if (!coupleId) throw new HttpsError("failed-precondition", "NO_COUPLE");

    return { user, coupleRef: db.doc(`couples/${coupleId}`) };

}

// Ayarlar'da yönetici bölümünü göstermek için
exports.amIAdmin = onCall(async (request) => {

    if (!request.auth?.uid) return { admin: false };

    return { admin: (await db.doc(`admins/${request.auth.uid}`).get()).exists };

});

// Hediye Premium ver: { email, days } (days boş/0 = süresiz)
exports.adminGrantPremium = onCall(async (request) => {

    const adminUid = await requireAdmin(request);

    const days = Number(request.data?.days) || 0;

    if (days < 0 || days > 3650) throw new HttpsError("invalid-argument", "BAD_DAYS");

    const { user, coupleRef } = await coupleRefForEmail(request.data?.email);

    const until = days ? admin.firestore.Timestamp.fromMillis(Date.now() + days * 86400000) : null;

    await writeCouplePremium(coupleRef, premium => {
        premium.gift = {
            until,
            grantedAt: admin.firestore.Timestamp.now(),
            grantedBy: adminUid,
            note: String(request.data?.note || "").slice(0, 80)
        };
    });

    logger.info("Hediye Premium verildi", { coupleId: coupleRef.id, days });

    // Çiftin ikisine de haber ver
    const members = (await coupleRef.get()).get("members") || [];

    await Promise.all(members.map(uid => sendPushToUser(uid, {
        title: "👑 Premium hediyen var!",
        body: days ? `Kalp Kalbe Premium ${days} gün boyunca açık 💜` : "Kalp Kalbe Premium artık sizde 💜",
        data: { page: "home", type: "premium" }
    }).catch(() => {})));

    return { ok: true, coupleId: coupleRef.id, user: user.email, until: until ? until.toMillis() : null };

});

exports.adminRevokePremium = onCall(async (request) => {

    await requireAdmin(request);

    const { coupleRef } = await coupleRefForEmail(request.data?.email);

    await writeCouplePremium(coupleRef, premium => { delete premium.gift; });

    return { ok: true };

});

// Hediye Premium listesi (yönetici ekranı)
exports.adminListPremium = onCall(async (request) => {

    await requireAdmin(request);

    const snap = await db.collection("couples").where("plan", "==", "premium").get();

    const rows = [];

    for (const couple of snap.docs) {

        const premium = couple.get("premium") || {};

        if (!premium.gift) continue;

        const emails = [];

        for (const uid of couple.get("members") || []) {
            try { emails.push((await admin.auth().getUser(uid)).email); } catch {}
        }

        rows.push({
            coupleId: couple.id,
            emails,
            until: premium.gift.until ? premium.gift.until.toMillis() : null,
            note: premium.gift.note || "",
            store: premiumPartActive(premium.store)
        });

    }

    return { rows };

});

// Süresi dolan hediye / abonelikleri kapat
exports.expirePremiums = onSchedule({ schedule: "15 3 * * *", timeZone: OTD_TIMEZONE, maxInstances: 1 }, async () => {

    const snap = await db.collection("couples").where("plan", "==", "premium").get();

    let expired = 0;

    for (const couple of snap.docs) {

        if (premiumActive(couple.get("premium"))) continue;

        await couple.ref.update({ plan: "free" });
        expired++;

    }

    if (expired) logger.info("Süresi dolan Premium kapatıldı", { expired });

});

// ── Mağaza satın alımları (RevenueCat) ──────────────────────
//
// RevenueCat → Project settings → Integrations → Webhooks:
//   URL:  https://europe-west1-<proje>.cloudfunctions.net/revenuecatWebhook
//   Authorization header: functions/.env içindeki REVENUECAT_WEBHOOK_AUTH
// Uygulamada RevenueCat kullanıcı kimliği = Firebase uid.
// Ayar yapılmadıysa webhook hiçbir şeyi değiştirmez.

const RC_ACTIVE_EVENTS = ["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "NON_RENEWING_PURCHASE", "SUBSCRIPTION_EXTENDED", "TEMPORARY_ENTITLEMENT_GRANT"];
const RC_END_EVENTS = ["EXPIRATION"];

exports.revenuecatWebhook = onRequest(async (req, res) => {

    const secret = process.env.REVENUECAT_WEBHOOK_AUTH;

    if (!secret) {
        res.status(503).send("not configured");
        return;
    }

    if (req.method !== "POST" || req.get("Authorization") !== secret) {
        res.status(401).send("unauthorized");
        return;
    }

    const event = req.body?.event || {};
    const type = event.type;
    const uid = event.app_user_id;

    if (!uid || (!RC_ACTIVE_EVENTS.includes(type) && !RC_END_EVENTS.includes(type))) {
        res.status(200).send("ignored");
        return;
    }

    try {

        const coupleId = (await db.doc(`users/${uid}`).get()).get("coupleId");

        if (!coupleId) {
            logger.warn("RevenueCat: kullanıcının çifti yok", { uid, type });
            res.status(200).send("no couple");
            return;
        }

        await writeCouplePremium(db.doc(`couples/${coupleId}`), premium => {

            if (RC_END_EVENTS.includes(type)) {
                delete premium.store;
                return;
            }

            premium.store = {
                until: admin.firestore.Timestamp.fromMillis(Number(event.expiration_at_ms) || Date.now() + 86400000),
                productId: event.product_id || null,
                store: event.store || null,
                buyerUid: uid
            };

        });

        logger.info("RevenueCat olayı işlendi", { type, coupleId });

        res.status(200).send("ok");

    } catch (error) {

        logger.error("RevenueCat webhook hatası", { error: error.message, type });
        res.status(500).send("error");

    }

});


// ═════════════════════════════════════════════════════════════
// YILIMIZ (yıl sonu özeti)
//
//   songPlays/{coupleId}_{yıl}  "şu an dinliyorum" paylaşım sayıları
//   wrapped/{coupleId}_{yıl}    hesaplanmış özet (6 saat önbellek)
//
// İkisi de sadece sunucudan okunur/yazılır. Özet; anılar, fotoğraflar,
// şarkılar, özledimler, yan yana günler, seri, ruh hali, Günün Sorusu,
// mektuplar ve hayallerden hesaplanır.
// ═════════════════════════════════════════════════════════════

const WRAPPED_CACHE_MS = 6 * 60 * 60 * 1000;
// Hesaplama değişince artır: eski önbellek kullanılmaz
const WRAPPED_VERSION = 3;

function songPlayKey(link) {

    const url = String(link || "");

    const spotify = url.match(/spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/);
    if (spotify) return "sp_" + spotify[1];

    const youtube = url.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/)([A-Za-z0-9_-]{6,})/);
    if (youtube) return "yt_" + youtube[1];

    return "h_" + require("crypto").createHash("sha1").update(url).digest("hex").slice(0, 16);

}

async function countSongPlay(coupleId, uid, song) {

    if (!song.link) return;

    const year = istanbulDayKey(new Date()).slice(0, 4);
    const key = songPlayKey(song.link);
    const ref = db.doc(`songPlays/${coupleId}_${year}`);
    const inc = admin.firestore.FieldValue.increment(1);

    await ref.set({
        coupleId,
        year: Number(year),
        total: inc,
        perUser: { [uid]: inc },
        songs: {
            [key]: {
                count: inc,
                title: String(song.title || "").slice(0, 200),
                artist: String(song.artist || "").slice(0, 200),
                cover: String(song.cover || "").slice(0, 480),
                link: String(song.link).slice(0, 480)
            }
        }
    }, { merge: true });

}

function tsMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (value instanceof Date) return value.getTime();
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function topEntry(map) {
    let best = null;
    for (const [key, value] of Object.entries(map)) {
        if (!best || value > best[1]) best = [key, value];
    }
    return best;
}

async function computeWrapped(coupleId, couple, year) {

    const members = couple.members || [];
    const yearStr = String(year);

    // Yıl sınırları (İstanbul, UTC+3)
    const startMs = Date.parse(`${year}-01-01T00:00:00+03:00`);
    const endMs = Date.parse(`${year + 1}-01-01T00:00:00+03:00`);
    const inYear = ms => ms >= startMs && ms < endMs;
    const monthOf = ms => Number(istanbulDayKey(new Date(ms)).slice(5, 7));

    const byCouple = name => db.collection(name).where("coupleId", "==", coupleId).get();

    const [memSnap, photoSnap, songSnap, missSnap, moodSnap, questionSnap, letterSnap, dreamSnap, playSnap, togetherSnap] = await Promise.all([
        byCouple("memories"), byCouple("photos"), byCouple("songs"), byCouple("misses"),
        byCouple("moodLogs"), byCouple("dailyQuestions"), byCouple("letters"), byCouple("dreams"),
        db.doc(`songPlays/${coupleId}_${year}`).get(),
        byCouple("togetherDays")
    ]);

    const names = {};
    for (const uid of members) names[uid] = await userName(uid, "");

    const perAuthor = () => Object.fromEntries(members.map(uid => [uid, 0]));

    // Kaydı kim ekledi? Yeni kayıtlarda authorId var; uygulamanın ilk
    // sürümlerinden kalan kayıtlarda yalnız isim ("author") yazıyor ya da
    // authorId eski (artık çiftte olmayan) bir hesabı gösteriyor.
    const norm = v => String(v || "").trim().toLocaleLowerCase("tr-TR");
    const firstWord = v => norm(v).split(/\s+/)[0];
    const byName = raw => {
        const a = norm(raw);
        if (!a) return null;
        return members.find(uid => norm(names[uid]) === a)
            || members.find(uid => firstWord(names[uid]) === firstWord(a))
            || null;
    };
    const foreignIds = new Set();
    for (const snap of [memSnap, songSnap, missSnap]) {
        for (const d of snap.docs) {
            const id = d.get("authorId");
            if (id && !members.includes(id)) foreignIds.add(id);
        }
    }
    const foreignNames = {};
    await Promise.all([...foreignIds].slice(0, 20).map(async uid => {
        foreignNames[uid] = await userName(uid, "");
    }));
    const authorOf = x => {
        if (!x) return null;
        if (x.authorId && members.includes(x.authorId)) return x.authorId;
        return byName(x.author)
            || (x.authorId ? byName(foreignNames[x.authorId]) : null)
            // seenBy ilk olarak ekleyen kişiyle başlar
            || (Array.isArray(x.seenBy) && members.includes(x.seenBy[0]) ? x.seenBy[0] : null)
            || null;
    };
    const unmatched = [];

    // Birlikte geçen gün (yıl içinde, başlangıç tarihinden sonra)
    const coupleStart = couple.startDate ? Date.parse(`${couple.startDate}T00:00:00+03:00`) : startMs;
    const from = Math.max(startMs, coupleStart || startMs);
    const to = Math.min(Date.now(), endMs);
    const daysTogether = Math.max(0, Math.floor((to - from) / 86400000));
    const startedThisYear = coupleStart >= startMs && coupleStart < endMs;

    // Anılar
    const memories = memSnap.docs.map(d => d.data()).filter(m => inYear(tsMillis(m.createdAt)));
    const memMonths = {};
    const tags = {};
    const memAuthors = perAuthor();
    for (const m of memories) {
        const month = monthOf(tsMillis(m.createdAt));
        memMonths[month] = (memMonths[month] || 0) + 1;
        { const a = authorOf(m); if (a) memAuthors[a]++; else unmatched.push({ type: "memory", authorId: m.authorId || null, author: m.author || null }); }
        for (const tag of String(m.text || "").match(/#[\p{L}\p{N}_]+/gu) || []) {
            const t = tag.toLocaleLowerCase("tr-TR");
            tags[t] = (tags[t] || 0) + 1;
        }
    }
    const firstMemory = memories.sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt))[0] || null;

    // Fotoğraflar (anılardaki fotoğraflar dahil)
    const photoTimes = [
        ...photoSnap.docs.map(d => tsMillis(d.get("createdAt"))),
        ...memories.filter(m => m.imageUrl || m.thumbUrl || m.image).map(m => tsMillis(m.createdAt))
    ].filter(inYear);
    const photoMonths = {};
    for (const ms of photoTimes) photoMonths[monthOf(ms)] = (photoMonths[monthOf(ms)] || 0) + 1;

    // Şarkılar
    const songs = songSnap.docs.map(d => d.data()).filter(x => inYear(tsMillis(x.createdAt)))
        .sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
    const songAuthors = perAuthor();
    const artists = {};
    const artistLabel = {};
    for (const x of songs) {
        { const a = authorOf(x); if (a) songAuthors[a]++; else unmatched.push({ type: "song", authorId: x.authorId || null, author: x.author || null }); }
        const artist = String(x.artist || "").trim();
        if (artist) {
            const key = artist.toLocaleLowerCase("tr-TR");
            artists[key] = (artists[key] || 0) + 1;
            artistLabel[key] = artistLabel[key] || artist;
        }
    }
    const topArtist = topEntry(artists);
    const firstSong = songs[0] || null;

    const plays = playSnap.exists ? playSnap.data() : null;
    const topPlays = plays
        ? Object.values(plays.songs || {}).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 3)
        : [];

    // Özledim
    const missAuthors = perAuthor();
    let missTotal = 0;
    let missMax = null;
    for (const d of missSnap.docs) {
        const m = d.data();
        const ms = tsMillis(m.createdAt) || Number(m.clientAt) || 0;
        if (!inYear(ms)) continue;
        const n = Math.max(1, Math.floor(Number(m.count) || 1));
        missTotal += n;
        const who = authorOf(m);
        if (who) missAuthors[who] += n;
        if (!missMax || n > missMax.count) missMax = { count: n, authorId: who, at: ms };
    }

    if (unmatched.length) console.warn("Yılımız: sahibi bulunamayan kayıtlar", coupleId, unmatched.slice(0, 20));

    // Yan yana
    let togetherTotal = 0;
    const togetherMonths = {};
    for (const d of togetherSnap.docs) {
        const t = d.data();
        if (String(t.month || "").slice(0, 4) !== yearStr) continue;
        const n = (t.days || []).length;
        togetherTotal += n;
        togetherMonths[Number(String(t.month).slice(5, 7))] = n;
    }

    // Ruh hali (kişi başı en sık)
    const moodCounts = Object.fromEntries(members.map(uid => [uid, {}]));
    for (const d of moodSnap.docs) {
        const m = d.data();
        const ms = tsMillis(m.createdAt) || Date.parse(`${m.day}T12:00:00+03:00`) || 0;
        if (!inYear(ms) || !moodCounts[m.authorId] || !m.mood) continue;
        moodCounts[m.authorId][m.mood] = (moodCounts[m.authorId][m.mood] || 0) + 1;
    }
    const topMoods = Object.fromEntries(Object.entries(moodCounts).map(([uid, counts]) => {
        const top = topEntry(counts);
        return [uid, top ? { mood: top[0], count: top[1] } : null];
    }));

    // Günün Sorusu
    let questionsBoth = 0;
    const questionAuthors = perAuthor();
    for (const d of questionSnap.docs) {
        const q = d.data();
        if (String(q.day || "").slice(0, 4) !== yearStr) continue;
        const answered = Object.keys(q.answers || {});
        for (const uid of answered) if (uid in questionAuthors) questionAuthors[uid]++;
        if (q.revealed) questionsBoth++;
    }

    // Mektuplar
    const letters = letterSnap.docs.map(d => d.data()).filter(l => inYear(tsMillis(l.createdAt)));

    // Hayaller
    const dreams = dreamSnap.docs.map(d => d.data());
    const dreamsDone = dreams.filter(x => x.completed && inYear(tsMillis(x.completedAt)))
        .sort((a, b) => tsMillis(a.completedAt) - tsMillis(b.completedAt));
    const dreamsAdded = dreams.filter(x => inYear(tsMillis(x.createdAt))).length;

    const monthTop = map => {
        const top = topEntry(map);
        return top ? { month: Number(top[0]), count: top[1] } : null;
    };

    return {
        year,
        members,
        names,
        startDate: couple.startDate || null,
        startedThisYear,
        daysTogether,
        memories: {
            count: memories.length,
            perAuthor: memAuthors,
            topMonth: monthTop(memMonths),
            topTag: topEntry(tags) && topEntry(tags)[1] >= 2 ? { tag: topEntry(tags)[0], count: topEntry(tags)[1] } : null,
            first: firstMemory ? {
                text: String(firstMemory.text || "").slice(0, 160),
                at: tsMillis(firstMemory.createdAt),
                authorId: authorOf(firstMemory)
            } : null
        },
        photos: { count: photoTimes.length, topMonth: monthTop(photoMonths) },
        songs: {
            count: songs.length,
            perAuthor: songAuthors,
            topArtist: topArtist && topArtist[1] >= 2 ? { artist: artistLabel[topArtist[0]], count: topArtist[1] } : null,
            first: firstSong ? {
                title: firstSong.title || "", artist: firstSong.artist || "",
                cover: firstSong.cover || "", authorId: authorOf(firstSong)
            } : null,
            playsTotal: plays?.total || 0,
            topPlays: topPlays.map(p => ({ title: p.title, artist: p.artist, cover: p.cover, count: p.count || 0 }))
        },
        misses: { total: missTotal, perAuthor: missAuthors, max: missMax },
        together: { days: togetherTotal, topMonth: monthTop(togetherMonths) },
        streakBest: couple.streak?.best || 0,
        moods: topMoods,
        questions: { both: questionsBoth, perAuthor: questionAuthors },
        letters: { count: letters.length },
        dreams: {
            added: dreamsAdded,
            done: dreamsDone.length,
            doneList: dreamsDone.slice(0, 5).map(x => ({ emoji: x.emoji || "✨", title: String(x.title || "").slice(0, 80) }))
        },
        computedAt: Date.now()
    };

}

// Yılımız özeti: { year?, refresh? }
exports.getWrapped = onCall({ timeoutSeconds: 120, memory: "512MiB" }, async (request) => {

    const uid = request.auth?.uid;

    if (!uid) throw new HttpsError("unauthenticated", "NOT_SIGNED_IN");

    const coupleId = (await db.doc(`users/${uid}`).get()).get("coupleId");

    if (!coupleId) throw new HttpsError("failed-precondition", "NO_COUPLE");

    const coupleSnap = await db.doc(`couples/${coupleId}`).get();
    const couple = coupleSnap.data() || {};

    if (!(couple.members || []).includes(uid)) throw new HttpsError("permission-denied", "NOT_MEMBER");

    const thisYear = Number(istanbulDayKey(new Date()).slice(0, 4));
    let year = Number(request.data?.year) || thisYear;
    if (year > thisYear || year < 2020) year = thisYear;

    const cacheRef = db.doc(`wrapped/${coupleId}_${year}`);
    const cached = await cacheRef.get();

    // Geçmiş yıllar değişmez; bu yıl 6 saatte bir tazelenir
    const fresh = cached.exists && cached.get("version") === WRAPPED_VERSION && (year < thisYear || Date.now() - (cached.get("computedAt") || 0) < WRAPPED_CACHE_MS);

    if (fresh && !request.data?.refresh) return cached.get("data");

    const data = await computeWrapped(coupleId, couple, year);

    await cacheRef.set({ coupleId, year, version: WRAPPED_VERSION, computedAt: data.computedAt, data });

    return data;

});

// ─────────────────────────────────────────────────────────────
// Ücretsiz kota: fotoğraf ve şarkı
//
// Ücretsiz planda çift başına 36 fotoğraf ve 36 şarkı. Fotoğraf
// sayısına Fotoğraflarımız'daki fotoğraflar, fotoğraflı anılar ve
// fotoğraflı (gerçekleşmiş) hayaller birlikte girer. Anılar sınırsız.
//
// Sayılar couples/{id}.usage = { photos, songs } alanında tutulur;
// her ekleme/silmede sunucu baştan sayar (kendini düzelten sayaç).
// İstemci ve firestore.rules bu sayıya bakarak sınırı uygular.
// İstemcideki eşi: js/app.js → FREE_LIMITS, kurallarda: freeLimitOk()
// ─────────────────────────────────────────────────────────────

const FREE_LIMITS = { photos: 36, songs: 36 };

const memoryHasPhoto = m => !!(m && (m.imageUrl || m.thumbUrl || m.image));

async function recountUsage(coupleId) {

    if (!coupleId) return null;

    const [photos, songs, memories, dreams] = await Promise.all([
        db.collection("photos").where("coupleId", "==", coupleId).count().get(),
        db.collection("songs").where("coupleId", "==", coupleId).count().get(),
        db.collection("memories").where("coupleId", "==", coupleId)
            .select("imageUrl", "thumbUrl", "image").get(),
        db.collection("dreams").where("coupleId", "==", coupleId)
            .select("imageUrl", "thumbUrl").get()
    ]);

    const withPhoto = snap => snap.docs.filter(d => memoryHasPhoto(d.data())).length;

    const usage = {
        photos: photos.data().count + withPhoto(memories) + withPhoto(dreams),
        songs: songs.data().count
    };

    const coupleRef = db.doc(`couples/${coupleId}`);
    const couple = await coupleRef.get();

    if (!couple.exists) return usage;

    const old = couple.get("usage") || {};

    if (old.photos !== usage.photos || old.songs !== usage.songs) {
        await coupleRef.update({ usage });
    }

    return usage;

}

function usageTrigger(onlyIfPhotoChanged) {

    return async (event) => {

        const before = event.data?.before?.data();
        const after = event.data?.after?.data();

        // Anılarda sadece fotoğraf eklenip/çıkınca say
        if (onlyIfPhotoChanged && memoryHasPhoto(before) === memoryHasPhoto(after)) return;

        try {
            await recountUsage(after?.coupleId || before?.coupleId);
        } catch (error) {
            logger.error("Kota sayılamadı", error);
        }

    };

}

exports.usagePhotos = onDocumentWritten("photos/{id}", usageTrigger(false));
exports.usageSongs = onDocumentWritten("songs/{id}", usageTrigger(false));
exports.usageMemories = onDocumentWritten("memories/{id}", usageTrigger(true));
exports.usageDreams = onDocumentWritten("dreams/{id}", usageTrigger(true));

// Eski çiftlerde usage alanı henüz yok: uygulama bir kez ister
exports.refreshUsage = onCall(async (request) => {

    const { coupleId } = await requireCouple(request.auth?.uid);

    const usage = await recountUsage(coupleId);

    return { usage, limits: FREE_LIMITS };

});

// ═════════════════════════════════════════════════════════════
// ONA HATIRLAT (js/reminders.js)
//
//   reminders/{id} = {
//     coupleId, authorId (kuran), targetId (hatırlatılan),
//     title, emoji, repeat: "once" | "daily" | "weekly", dayBefore,
//     nextAt      sıradaki zaman (ms) · tekrar yoksa çalınca null
//     earlyAt     "1 gün önce de" zamanı (ms), earlySent
//     snoozeUntil "10 dk sonra" (ms)
//     lastAt      en son çalan zaman (ms)
//     doneFor     hangi zamanın yapıldığı (ms), doneAt, thanks
//     muted       hatırlatılan kişi sessize aldı
//     dueAt       yukarıdakilerin en yakını: sunucu buna bakar
//   }
//
// Her dakika dueAt'i gelen kayıtlar işlenir; bildirim sunucudan
// gider (telefon kapalıyken de). Hatırlatılan "yaptım" deyince
// kurana haber gider. Saati 1 saat geçip yapılmayan, kurana sadece
// listede "henüz yapılmadı" olarak görünür (bildirim yok).
// ═════════════════════════════════════════════════════════════

const REMINDER_STEP = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 };
const DAY_MS = 24 * 60 * 60 * 1000;

function reminderDueAt(r) {

    const times = [
        r.nextAt,
        !r.earlySent ? r.earlyAt : null,
        r.snoozeUntil
    ].filter(t => typeof t === "number" && t > 0);

    return times.length ? Math.min(...times) : null;

}

async function processReminder(doc) {

    const r = doc.data();
    const now = Date.now();
    const upd = {};
    const pushes = [];

    const author = await userName(r.authorId);

    // "1 gün önce" haberi
    if (r.earlyAt && !r.earlySent && r.earlyAt <= now) {

        if (!r.muted && r.doneFor !== r.nextAt) {
            const when = new Date(r.nextAt).toLocaleTimeString("tr-TR", {
                hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul"
            });
            pushes.push({ title: `${r.emoji || "⏰"} Yarın ${when}`, body: `${author} hatırlatıyor: ${r.title}` });
        }

        upd.earlySent = true;

    }

    // Zamanı geldi
    if (r.nextAt && r.nextAt <= now) {

        const occ = r.nextAt;
        const doneEarly = r.doneFor === occ;

        // Sunucu uzun süre çalışmadıysa eski hatırlatmayı bildirme
        if (!doneEarly && !r.muted && now - occ < 6 * 60 * 60 * 1000) {
            pushes.push({ title: `${r.emoji || "⏰"} ${author} hatırlatıyor`, body: r.title });
        }

        upd.lastAt = occ;

        if (!doneEarly) {
            upd.doneAt = null;
            upd.thanks = null;
        }

        let next = null;
        const step = REMINDER_STEP[r.repeat];

        if (step) {
            next = occ + step;
            while (next <= now) next += step;
        }

        upd.nextAt = next;
        upd.earlyAt = next && r.dayBefore ? next - DAY_MS : null;
        upd.earlySent = false;
        upd.snoozeUntil = null;

    }

    // "10 dk sonra"
    if (r.snoozeUntil && r.snoozeUntil <= now && upd.snoozeUntil === undefined) {

        if (!r.muted && r.doneFor !== r.lastAt) {
            pushes.push({ title: `${r.emoji || "⏰"} ${author} hatırlatıyor`, body: r.title });
        }

        upd.snoozeUntil = null;

    }

    upd.dueAt = reminderDueAt({ ...r, ...upd });

    await doc.ref.update(upd);

    for (const push of pushes) {
        await sendPushToUser(r.targetId, {
            ...push,
            data: { page: "reminders", type: "reminders", id: doc.id },
            tag: `rem-${doc.id}`,
            category: "reminders"
        });
    }

}

exports.fireReminders = onSchedule({ schedule: "every 1 minutes", maxInstances: 1 }, async () => {

    const due = await db.collection("reminders")
        .where("dueAt", "<=", Date.now())
        .limit(100)
        .get();

    for (const doc of due.docs) {
        try {
            await processReminder(doc);
        } catch (error) {
            logger.error("Hatırlatma işlenemedi", { id: doc.id, error: error.message });
        }
    }

});

// Hatırlatılan "yaptım" deyince kurana haber
exports.onReminderDone = onDocumentUpdated("reminders/{id}", async (event) => {

    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};

    if (!after.doneAt || after.doneAt === before.doneAt) return;

    const name = await userName(after.targetId);
    const thanks = String(after.thanks || "").trim().slice(0, 120);

    await sendPushToUser(after.authorId, {
        title: `✓ ${name} yaptı`,
        body: `${after.emoji || "⏰"} ${after.title}${thanks ? ` · “${thanks}”` : ""}`,
        data: { page: "reminders", type: "reminders", id: event.params.id },
        tag: `rem-done-${event.params.id}`,
        category: "reminders"
    });

});

// ─────────────────────────────────────────────────────────────
// BUZDOLABI (js/fridge.js): yeni not ve kalp haberleri
// ─────────────────────────────────────────────────────────────

exports.onFridgeWritten = onDocumentWritten("fridge/{id}", async (event) => {

    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data();

    if (!after) return;

    const couple = await db.doc(`couples/${after.coupleId}`).get();
    const partnerId = (couple.get("members") || []).find(m => m !== after.authorId);

    if (!partnerId) return;

    // Yeni not asıldı → sevgiline
    if (after.text && (after.text !== before.text || after.at !== before.at)) {

        await sendPushToUser(partnerId, {
            title: `📌 ${await userName(after.authorId)} buzdolabına not bıraktı`,
            body: after.text,
            data: { page: "home", type: "fridge" },
            tag: "fridge",
            category: "love"
        });

        return;

    }

    // Notuna kalp bırakıldı → not sahibine
    if (after.heartAt && !before.heartAt) {

        await sendPushToUser(after.authorId, {
            title: `💜 ${await userName(partnerId)} notuna kalp bıraktı`,
            body: after.text || "",
            data: { page: "home", type: "fridge" },
            tag: "fridge-heart",
            category: "love"
        });

    }

});

// ─────────────────────────────────────────────────────────────
// DEFTER: hediye zamanı hatırlatması (js/notebook.js)
//
// Doğum günü, yıldönümü, sevgililer günü gibi günlerden 14 ve 3 gün
// önce (sabah hatırlatmasıyla birlikte) sadece hediye alacak kişiye:
// "Hediye defterinde 4 fikir var". Kendi doğum gününde kendisine
// gitmez (etkinliğin adında kendi adı geçiyorsa).
// ─────────────────────────────────────────────────────────────

const GIFT_EVENT_RE = /doğum|yıldönüm|yil ?dönüm|sevgililer|evlilik|nişan/i;

async function giftNotebookReminders(couple, members) {

    const now = new Date();
    const events = (await db.collection("events").where("coupleId", "==", couple.id).get())
        .docs.map(d => d.data())
        .filter(e => e.name && (GIFT_EVENT_RE.test(e.name) || e.emoji === "🎂"));

    if (!events.length) return;

    for (const ahead of [14, 3]) {

        const target = istanbulParts(new Date(now.getTime() + ahead * 24 * 60 * 60 * 1000));
        const due = events.filter(e => Number(e.month) === target.m && Number(e.day) === target.d);

        for (const e of due) {
            for (const uid of members) {

                const name = String(await userName(uid, "")).trim().toLocaleLowerCase("tr-TR");

                if (name && e.name.toLocaleLowerCase("tr-TR").includes(name)) continue;

                const ideas = await db.collection("notebook")
                    .where("coupleId", "==", couple.id)
                    .where("authorId", "==", uid)
                    .where("kind", "==", "idea")
                    .get();

                const open = ideas.docs.filter(d => !d.get("givenAt")).length;

                await sendPushToUser(uid, {
                    title: `🎁 ${e.name} ${ahead} gün sonra`,
                    body: open
                        ? `Hediye defterinde ${open} fikir var. Bir göz at 💝`
                        : "Hediye defterine bir fikir not etmek ister misin? 💝",
                    data: { page: "our-notebook", type: "notebook" },
                    tag: `gift-${target.m}-${target.d}`,
                    category: "reminders"
                });

            }
        }

    }

}


// ═════════════════════════════════════════════════════════════
// VERİ TEMİZLİĞİ
//
// İşi biten kayıtlar tutulmaz:
//   • Buzdolabı notu: asıldıktan 24 saat sonra silinir (15 dk'da bir)
//   • Sarıl / kahve gibi karşılıklar (nudges): 7 gün sonra (her gece)
//   • Yılımız biter bitmez (16 Ocak), geçen yıl ve öncesine ait:
//       misses     özledim kayıtları (sadece yıl sonu sayısı için tutuluyordu)
//       songPlays  "şu an dinliyorum" yıllık sayaçları
//       water      günlük su kayıtları
//   Anılar, fotoğraflar, ruh hali takvimi, Yan Yana günleri, sorular,
//   mektuplar, hayaller kalıcıdır (kullanıcı geçmişe dönüp bakıyor).
// ═════════════════════════════════════════════════════════════

const FRIDGE_TTL_MS = 24 * 60 * 60 * 1000;
const NUDGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Sorgu boşalana kadar 400'erli siler; silinen sayıyı döner
async function deleteAllMatching(makeQuery, maxRounds = 50) {

    let total = 0;

    for (let round = 0; round < maxRounds; round++) {

        const snap = await makeQuery().limit(400).get();

        if (snap.empty) break;

        await deleteQueryInBatches(snap.docs);

        total += snap.size;

        if (snap.size < 400) break;

    }

    return total;

}

exports.cleanupFridge = onSchedule({ schedule: "every 15 minutes", maxInstances: 1 }, async () => {

    const cutoff = Date.now() - FRIDGE_TTL_MS;

    const n = await deleteAllMatching(() => db.collection("fridge").where("at", "<", cutoff));

    if (n) logger.info("Süresi dolan buzdolabı notları silindi", { count: n });

});

exports.dailyCleanup = onSchedule({ schedule: "20 4 * * *", timeZone: OTD_TIMEZONE, maxInstances: 1 }, async () => {

    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - NUDGE_TTL_MS);

    const n = await deleteAllMatching(() => db.collection("nudges").where("createdAt", "<", cutoff));

    if (n) logger.info("Eski karşılıklar silindi", { count: n });

});

// Yılımız 15 Ocak'a kadar gösteriliyor (js/wrapped.js); 16 Ocak gecesi
// geçen yılın ham kayıtları silinir.
async function yearlyCleanup(year) {

    const firstDay = `${year}-01-01`;
    // 1 Ocak 00:00 İstanbul (UTC+3)
    const yearStart = admin.firestore.Timestamp.fromMillis(Date.UTC(year, 0, 1) - 3 * 60 * 60 * 1000);

    const counts = {
        misses: await deleteAllMatching(() => db.collection("misses").where("day", "<", firstDay), 200)
            // İlk sürümlerden kalan, "day" alanı olmayan kayıtlar
            + await deleteAllMatching(() => db.collection("misses").where("createdAt", "<", yearStart), 200),
        songPlays: await deleteAllMatching(() => db.collection("songPlays").where("year", "<", year), 200),
        water: await deleteAllMatching(() => db.collection("water").where("day", "<", firstDay), 200)
    };

    logger.info("Yıllık temizlik bitti", { year, ...counts });

    return counts;

}

exports.yearlyCleanup = onSchedule({
    schedule: "30 4 16 1 *",
    timeZone: OTD_TIMEZONE,
    timeoutSeconds: 540,
    maxInstances: 1
}, async () => {

    await yearlyCleanup(Number(istanbulDayKey(new Date()).slice(0, 4)));

});

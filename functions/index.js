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

const { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

// Firestore veritabanının bulunduğu bölgeyle aynı olmalı.
// (Firebase Console > Firestore > üstte yazan konum)
setGlobalOptions({ region: "europe-west1", maxInstances: 5 });

const TYPES = {
    memories: {
        page: "our-memories",
        icon: "💌",
        body: (d) => withPreview("Sana yeni bir not bıraktı", d.text || ((d.imageUrl || d.image) ? "📷 Fotoğraf" : ""))
    },
    songs: {
        page: "our-songs",
        icon: "🎵",
        body: (d) => withPreview("Sana bir şarkı bıraktı", [d.title, d.artist].filter(Boolean).join(" · "))
    },
    dreams: {
        page: "our-dreams",
        icon: "✨",
        body: (d) => withPreview("Yeni bir hayal ekledi", d.title)
    },
    misses: {
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
async function sendPushToUser(uid, { title, body, data = {}, tag = null }) {

    const userRef = db.doc(`users/${uid}`);

    const tokenSnap = await db.collection("pushTokens").where("uid", "==", uid).get();
    const legacy = (await userRef.get()).get("fcmTokens") || [];

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
            tag: t.tag || null
        });

    }

}

exports.onMemoryCreated = onDocumentCreated("memories/{id}", (event) => notifyPartner("memories", event));
exports.onSongCreated = onDocumentCreated("songs/{id}", (event) => notifyPartner("songs", event));
exports.onDreamCreated = onDocumentCreated("dreams/{id}", (event) => notifyPartner("dreams", event));
exports.onMissCreated = onDocumentCreated("misses/{id}", (event) => notifyPartner("misses", event));


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

    const coupleId = await db.runTransaction(async tx => {

        const couple = await tx.get(coupleRef);
        const user = await tx.get(userRef);

        const members = couple.get("members") || [];

        if (members.includes(uid)) return coupleRef.id;

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

        return coupleRef.id;

    });

    logger.info("Çifte katıldı", { uid, coupleId });

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

    return couple.get("plan") === "premium" ? LETTER_LIMITS.premium : LETTER_LIMITS.free;

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
        data: { page: "our-letters", type: "letters", id }
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
            data
        });
    }

    await sendPushToUser(authorId, {
        title: "💌 Mektubun açıldı",
        body: `${partnerName} artık mektubunu okuyabilir`,
        data
    });

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
        data: { page: "our-letters", type: "letters", id: event.params.id }
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
                tag: `question-${day}`
            });

        } else if (result.firstTime) {

            await sendPushToUser(partnerId, {
                title: `💬 ${name} günün sorusunu cevapladı`,
                body: "Seninkini bekliyor 👀 Sen de cevaplayınca ikiniz de görebileceksiniz.",
                data,
                tag: `question-${day}`
            });

        }

    }

    return { revealed: result.revealed };

});

// Kendi sorunu ekle (Premium)
exports.addCustomQuestion = onCall(async (request) => {

    const uid = request.auth?.uid;
    const { coupleId, couple } = await requireCouple(uid);

    if (couple.get("plan") !== "premium") {
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
            tag: `question-reaction-${after.day}`
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
        tag: "mood"
    });

});

exports.onNudge = onDocumentCreated("nudges/{id}", async (event) => {

    const data = event.data?.data();
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
        tag: nudge.page ? "remember" : "nudge"
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
                tag: "onthisday"
            }).catch(error => logger.warn("Bildirim gönderilemedi", { uid, error: error.message }));

        }

    }

});

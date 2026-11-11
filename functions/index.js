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

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
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
        body: (d) => withPreview("Sana yeni bir not bıraktı", d.text || (d.image ? "📷 Fotoğraf" : ""))
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

    const authorSnap = await db.doc(`users/${authorId}`).get();
    const authorName = authorSnap.get("name") || "Sevgilin";

    const t = TYPES[type];

    for (const uid of recipients) {

        const userRef = db.doc(`users/${uid}`);

        const tokenSnap = await db.collection("pushTokens").where("uid", "==", uid).get();
        const legacy = (await userRef.get()).get("fcmTokens") || [];

        const tokens = [...new Set([
            ...tokenSnap.docs.map(d => d.id),
            ...legacy
        ])].filter(Boolean);

        if (tokens.length === 0) {
            logger.info("Alıcının kayıtlı telefonu yok", { uid });
            continue;
        }

        const response = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: {
                title: `${t.icon} ${authorName}`,
                body: t.body(data)
            },
            data: {
                page: t.page,
                type,
                id: event.params.id
            },
            android: {
                priority: "high",
                notification: {
                    channelId: "partner",
                    icon: "ic_stat_heart",
                    color: "#c084fc",
                    ...(t.tag ? { tag: t.tag } : {})
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
            type,
            to: uid,
            success: response.successCount,
            failed: response.failureCount,
            removed: dead.length
        });

    }

}

exports.onMemoryCreated = onDocumentCreated("memories/{id}", (event) => notifyPartner("memories", event));
exports.onSongCreated = onDocumentCreated("songs/{id}", (event) => notifyPartner("songs", event));
exports.onDreamCreated = onDocumentCreated("dreams/{id}", (event) => notifyPartner("dreams", event));
exports.onMissCreated = onDocumentCreated("misses/{id}", (event) => notifyPartner("misses", event));

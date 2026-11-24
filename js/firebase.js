import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';

import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    updateDoc,
    orderBy,
    query,
    where,
    onSnapshot,
    serverTimestamp,
    Timestamp,
    arrayUnion,
    arrayRemove,
    getDoc,
    setDoc,
    runTransaction,
    deleteField,
    writeBatch,
    getCountFromServer,
    increment
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

import {
    getFunctions,
    httpsCallable
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';

import {
    getMessaging,
    getToken,
    isSupported as isMessagingSupported
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js';

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    sendEmailVerification,
    reload,
    EmailAuthProvider,
    reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyDWzpBdbdb_db25-tSD27A0IEGW1MeUlJM",
    authDomain: "dilara-app-6c7ab.firebaseapp.com",
    projectId: "dilara-app-6c7ab",
    storageBucket: "dilara-app-6c7ab.firebasestorage.app",
    messagingSenderId: "1047372766813",
    appId: "1:1047372766813:web:0e6cb16013ea74927937b4"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

const auth = getAuth(app);

const storage = getStorage(app);

// Cloud Function'lar functions/index.js'teki bölgede
const functions = getFunctions(app, "europe-west1");

// ── Fotoğraf yükleme ────────────────────────────────────────
// prepared: js/images.js → prepareImage() çıktısı
// Dosyalar: couples/{coupleId}/{kind}/{docId}.jpg ve {docId}_thumb.jpg
async function uploadCoupleImage(coupleId, kind, docId, prepared) {

    const imagePath = `couples/${coupleId}/${kind}/${docId}.jpg`;
    const thumbPath = `couples/${coupleId}/${kind}/${docId}_thumb.jpg`;

    const metadata = {
        contentType: "image/jpeg",
        cacheControl: "public, max-age=31536000"
    };

    const [full, thumb] = await Promise.all([
        uploadBytes(storageRef(storage, imagePath), prepared.blob, metadata),
        uploadBytes(storageRef(storage, thumbPath), prepared.thumbBlob, metadata)
    ]);

    const [imageUrl, thumbUrl] = await Promise.all([
        getDownloadURL(full.ref),
        getDownloadURL(thumb.ref)
    ]);

    return {
        imageUrl,
        thumbUrl,
        imagePath,
        thumbPath,
        width: prepared.width || null,
        height: prepared.height || null
    };

}

// Eski (metin olarak gömülü) fotoğrafları bul
async function listLegacyImages() {

    const coupleId = await getMyCouple();

    if (!coupleId) return [];

    const result = [];

    for (const name of ["photos", "memories", "sliderImages"]) {

        const snap = await getDocs(query(
            collection(db, name),
            where("coupleId", "==", coupleId)
        ));

        snap.docs.forEach(d => {

            const data = d.data();

            if (typeof data.image === "string" && data.image.startsWith("data:")) {
                result.push({ collection: name, id: d.id, image: data.image });
            }

        });

    }

    return result;

}

// Eski fotoğrafı Storage'a yükle, kaydı bağlantılarla güncelle
async function attachLegacyImage(collectionName, id, prepared) {

    const coupleId = await getMyCouple();

    if (!coupleId) throw new Error("COUPLE_NOT_FOUND");

    const kind = collectionName === "sliderImages" ? "slider" : collectionName;

    const uploaded = await uploadCoupleImage(coupleId, kind, id, prepared);

    await updateDoc(doc(db, collectionName, id), {
        ...uploaded,
        image: deleteField()
    });

}

async function createCouple(user, startDate) {

    const inviteCode =
        Math.random().toString(36).substring(2, 8).toUpperCase();

    const coupleRef = doc(collection(db, "couples"));

    await setDoc(coupleRef, {
        members: [user.uid],
        inviteCode: inviteCode,
        startDate: startDate,
        createdAt: serverTimestamp()
    });

    await setDoc(
        doc(db, "users", user.uid),
        {
            coupleId: coupleRef.id
        },
        {
            merge: true
        }
    );

    return {
        coupleId: coupleRef.id,
        inviteCode: inviteCode
    };

}

async function getMyInviteCode(user) {

    if (!user) return null;

    const userSnap = await getDoc(
        doc(db, "users", user.uid)
    );

    if (!userSnap.exists()) return null;

    const userData = userSnap.data();

    if (!userData.coupleId) return null;

    const coupleSnap = await getDoc(
        doc(db, "couples", userData.coupleId)
    );

    if (!coupleSnap.exists()) return null;

    const coupleData = coupleSnap.data();

    // Zaten partneri varsa kodu tekrar göstermeyelim
    if (coupleData.members?.length >= 2) {
        return null;
    }

    return coupleData.inviteCode || null;

}

// Davet koduyla katılma sunucuda yapılır (functions/index.js → joinCouple).
// İstemci güvenlik kuralları gereği başka çiftleri okuyamaz.
async function joinCouple(user, inviteCode) {

    try {

        const result = await httpsCallable(functions, "joinCouple")({
            code: String(inviteCode || "").trim().toUpperCase()
        });

        return result.data.coupleId;

    } catch (error) {

        // Sunucu hata kodunu mesaj olarak gönderir
        const known = ["INVITE_CODE_NOT_FOUND", "COUPLE_FULL", "ALREADY_IN_COUPLE"];

        throw new Error(known.includes(error.message) ? error.message : "JOIN_FAILED");

    }

}

async function cancelMyCouple() {

    const user = auth.currentUser;

    if (!user) return;

    // Kullanıcının profilini bul
    const userRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) return;

    const userData = userDoc.data();
    const coupleId = userData.coupleId;

    if (!coupleId) return;

    // Couple kaydını sil
    await deleteDoc(
        doc(db, "couples", coupleId)
    );

    // Kullanıcının coupleId bilgisini temizle
    await setDoc(
        userRef,
        {
            coupleId: null
        },
        {
            merge: true
        }
    );

}

async function getMyCouple() {

    const user = auth.currentUser;

    if (!user) return null;

    const userDoc = await getDoc(
        doc(db, "users", user.uid)
    );

    if (!userDoc.exists()) return null;

    return userDoc.data().coupleId || null;

}

// Yılımız özeti (sunucuda hesaplanır, js/wrapped.js)
// Ücretsiz kota sayılarını (couples.usage) sunucuya baştan saydırır
async function refreshUsage() {

    const result = await httpsCallable(functions, "refreshUsage")({});

    return result.data;

}

async function getWrapped(year, refresh = false) {

    const result = await httpsCallable(functions, "getWrapped")({ year, refresh });

    return result.data;

}

// İlk adımlar kartı ve Biz sayfası için sayılar (guide.js).
// Sayım sorguları belge okumaz: 1000 kayıt başına 1 okuma sayılır.
async function getCoupleSummary() {

    const user = auth.currentUser;
    const coupleId = await getMyCouple();

    if (!user || !coupleId) return null;

    const count = async (name, ...extra) => {
        try {
            const snap = await getCountFromServer(query(
                collection(db, name),
                where("coupleId", "==", coupleId),
                ...extra
            ));
            return snap.data().count;
        } catch (error) {
            console.warn("Sayılamadı:", name, error);
            return null;
        }
    };

    const [memories, photos, songs, dreams, dreamsDone, slider, answers, coupleSnap] = await Promise.all([
        count("memories"),
        count("photos"),
        count("songs"),
        count("dreams"),
        count("dreams", where("completed", "==", true)),
        count("sliderImages"),
        count("questionAnswers", where("authorId", "==", user.uid)),
        getDoc(doc(db, "couples", coupleId))
    ]);

    const members = coupleSnap.exists() ? coupleSnap.data().members || [] : [];

    return { memories, photos, songs, dreams, dreamsDone, slider, answers, members: members.length };

}

async function getMyCoupleData() {

    const user = auth.currentUser;

    if (!user) return null;

    const userDoc = await getDoc(
        doc(db, "users", user.uid)
    );

    if (!userDoc.exists()) return null;

    const coupleId = userDoc.data().coupleId;

    if (!coupleId) return null;

    const coupleDoc = await getDoc(
        doc(db, "couples", coupleId)
    );

    if (!coupleDoc.exists()) return null;

    return {
        id: coupleDoc.id,
        ...coupleDoc.data()
    };

}

async function getUserProfile() {

    const user = auth.currentUser;

    if (!user) return null;

    const userDoc = await getDoc(
        doc(db, "users", user.uid)
    );

    if (!userDoc.exists()) return null;

    return {
        uid: user.uid,
        ...userDoc.data()
    };

}

// Çift serisi: couples/{coupleId}.streak
// mutator(streak, members) saf bir fonksiyon olmalı; transaction
// çakışmada tekrar çalıştırılabilir. { streak } dönerse yazılır.
async function updateCoupleStreak(mutator) {

    const coupleId = await getMyCouple();

    if (!coupleId) return null;

    const ref = doc(db, "couples", coupleId);

    return runTransaction(db, async (tx) => {

        const snap = await tx.get(ref);

        if (!snap.exists()) return null;

        const data = snap.data();

        const result = mutator(data.streak || null, data.members || []);

        if (result && result.streak) {
            tx.update(ref, { streak: result.streak });
        }

        return result;

    });

}

function listenCoupleStreak(callback) {

    let unsubscribe = null;

    getMyCouple().then(coupleId => {

        if (!coupleId) return;

        unsubscribe = onSnapshot(
            doc(db, "couples", coupleId),
            snap => {
                const data = snap.data() || {};
                callback(data.streak || null, data.members || []);
            },
            error => console.error("Seri dinleme hatası:", error)
        );

    });

    return () => unsubscribe && unsubscribe();

}

async function getUserProfileByUid(uid) {

    if (!uid) return null;

    const userDoc =
        await getDoc(
            doc(db, "users", uid)
        );

    if (!userDoc.exists()) return null;

    return {
        uid: uid,
        ...userDoc.data()
    };

}

async function getCurrentUserName() {

    const profile = await getUserProfile();

    if (!profile || !profile.name) {
        throw new Error("USER_PROFILE_NOT_FOUND");
    }

    return profile.name;

}

async function createUserProfile(uid, name, email, consentVersion = null) {

    await setDoc(
        doc(db, "users", uid),
        {
            name: name,
            email: email,
            coupleId: null,
            createdAt: serverTimestamp(),
            ...(consentVersion ? { consents: { version: consentVersion, at: serverTimestamp() } } : {})
        },
        { merge: true }
    );

}

// Gizlilik politikası / kullanım koşulları onayı (sürümüyle birlikte)
async function saveConsent(version) {

    const user = auth.currentUser;

    if (!user) throw new Error("NOT_SIGNED_IN");

    await updateDoc(doc(db, "users", user.uid), {
        consents: { version, at: serverTimestamp() }
    });

}

async function registerUser(email, password) {

    const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
    );

    return result.user;
}


async function loginUser(email, password) {

    const result = await signInWithEmailAndPassword(
        auth,
        email,
        password
    );

    return result.user;
}


async function logoutUser() {

    await signOut(auth);

}

function getCurrentAuthUser() {
    return auth.currentUser;
}

function listenAuth(callback) {

    return onAuthStateChanged(auth, callback);

}

// image: js/images.js → prepareImage() çıktısı ya da null
async function addMemory(text, image = null) {

    const coupleId = await getMyCouple();

    if (!coupleId) {
        throw new Error("COUPLE_NOT_FOUND");
    }

    const profile = await getUserProfile();

    if (!profile) {
        throw new Error("USER_PROFILE_NOT_FOUND");
    }

    const memoryRef = doc(collection(db, 'memories'));

    const uploaded = image
        ? await uploadCoupleImage(coupleId, "memories", memoryRef.id, image)
        : {};

    await setDoc(memoryRef, {

        text,
        ...uploaded,
        ...(window.isTogetherNow?.() ? { together: true } : {}),

        coupleId,

        authorId: profile.uid,

        seenBy: [profile.uid],

        createdAt: serverTimestamp()

    });
}

// Aynı şarkıyı tanımak için anahtar: Spotify parça kimliği,
// YouTube video kimliği ya da sorgusuz adres
function songKey(link) {

    const raw = String(link || "").trim();

    const spotify = raw.match(/spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/i);
    if (spotify) return "spotify:" + spotify[1];

    const yt = raw.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
    if (yt) return "youtube:" + yt[1];

    try {
        const u = new URL(raw);
        return (u.host + u.pathname).toLowerCase().replace(/\/+$/, "");
    } catch {
        return raw.toLowerCase();
    }

}

async function addSong(link, title, artist, note, platform = null, cover = null) {
    const coupleId = await getMyCouple();

    if (!coupleId) {
        throw new Error("COUPLE_NOT_FOUND");
    }

    const profile = await getUserProfile();

    if (!profile) {
        throw new Error("USER_PROFILE_NOT_FOUND");
    }

    // Aynı şarkı daha önce eklendiyse eskisini kaldır;
    // yenisi listenin en başına gelir
    try {

        const key = songKey(link);

        const existing = await getDocs(query(
            collection(db, "songs"),
            where("coupleId", "==", coupleId)
        ));

        await Promise.all(existing.docs
            .filter(d => songKey(d.get("link")) === key)
            .map(d => deleteDoc(d.ref)));

    } catch (error) {
        console.warn("Eski kopya silinemedi:", error);
    }

    await addDoc(collection(db, "songs"), {

        link,
        title,
        artist,
        note,
        platform,
        cover,

        authorId: profile.uid,

        coupleId,

        seenBy: [profile.uid],

        createdAt: serverTimestamp()

    });
}

async function updateSong(id, data) {

    await updateDoc(doc(db, "songs", id), data);

}

async function markSongsSeen(currentUser) {

    const coupleId = await getMyCouple();

    if (!coupleId) return;

    const q = query(
        collection(db, "songs"),
        where("coupleId", "==", coupleId)
    );

    const snapshot = await getDocs(q);

    for (const song of snapshot.docs) {

        const data = song.data();

        if (
            data.author !== currentUser &&
            (!data.seenBy ||
             !data.seenBy.includes(currentUser))
        ) {

            await updateDoc(song.ref, {
                seenBy: arrayUnion(currentUser)
            });

        }

    }

}


async function listenSongs(callback) {

    const coupleId = await getMyCouple();

    if (!coupleId) {
        callback([]);
        return;
    }

    const q = query(
        collection(db, "songs"),
        where("coupleId", "==", coupleId)
    );

    return onSnapshot(q, (snap) => {

        const songs = snap.docs
            .map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            .sort((a, b) => {

                const dateA = a.createdAt?.toMillis?.() || 0;
                const dateB = b.createdAt?.toMillis?.() || 0;

                return dateB - dateA;

            });

        callback(songs);

    }, (error) => {

        console.error(
            "Songs dinleme hatası:",
            error
        );

    });

}

async function deleteSong(id) {

    await deleteDoc(doc(db, "songs", id));

}

// image: js/images.js → prepareImage() çıktısı
async function addPhoto(image) {
    const coupleId = await getMyCouple();

    if (!coupleId) {
        throw new Error("COUPLE_NOT_FOUND");
    }

    const profile = await getUserProfile();

    if (!profile) {
        throw new Error("USER_PROFILE_NOT_FOUND");
    }

    const photoRef = doc(collection(db, "photos"));

    const uploaded = await uploadCoupleImage(coupleId, "photos", photoRef.id, image);

    await setDoc(photoRef, {

        ...uploaded,
        ...(window.isTogetherNow?.() ? { together: true } : {}),
        authorId: profile.uid,
        coupleId,

        createdAt: serverTimestamp()

    });
}

async function getMemories() {

    const coupleId = await getMyCouple();

    if (!coupleId) return [];

    const q = query(
        collection(db, 'memories'),
        where('coupleId', '==', coupleId)
    );

    const snap = await getDocs(q);

    return snap.docs
        .map(d => ({
            id: d.id,
            ...d.data()
        }))
        .sort((a, b) => {

            const dateA = a.createdAt?.toMillis?.() || 0;
            const dateB = b.createdAt?.toMillis?.() || 0;

            return dateB - dateA;

        });
}

async function deleteMemory(id) {
    await deleteDoc(doc(db, 'memories', id));
}
    
// Partnerin eklediği ve henüz görülmemiş kayıtları "görüldü" yap.
// collectionName: "memories" | "songs" | "dreams"
async function markSeen(collectionName, ids) {

    const user = auth.currentUser;

    if (!user || !ids || ids.length === 0) return;

    await Promise.all(ids.map(id =>
        updateDoc(doc(db, collectionName, id), {
            seenBy: arrayUnion(user.uid)
        }).catch(e => console.warn("Görüldü işaretlenemedi:", collectionName, id, e))
    ));

}

// ── Push bildirim token'ları ────────────────────────────────
// Her telefonun FCM token'ı ayrı bir koleksiyonda tutulur:
//   pushTokens/{token} = { uid, platform, updatedAt }
// users/{uid} belgesine BİLEREK yazmıyoruz: o belgeye yapılan
// yerel yazma, bağlantı yavaşken profilin (isim, coupleId)
// eksik okunmasına yol açıyordu.
// Cloud Function (functions/index.js) bildirimi bu token'lara gönderir.
async function savePushToken(token, platform = 'android') {

    const user = auth.currentUser;

    if (!user || !token) return;

    await setDoc(doc(db, 'pushTokens', token), {
        uid: user.uid,
        platform,
        updatedAt: serverTimestamp()
    });

}

// ── Web bildirimleri (iPhone'da ana ekrana eklenmiş uygulama, tarayıcılar) ──
// Firebase Console → Proje ayarları → Cloud Messaging →
// "Web Push certificates" bölümündeki anahtar (herkese açık anahtar, gizli değil)
const WEB_PUSH_VAPID_KEY = "BBXZOqUeFqabNENH71W3d2zBKQfbvniwxDARELNiLrmu_v6plOpNRCG2YJDfcHpWTFqbQq5EaKXid2691vVZJCU";

// Döner: "enabled" | "denied" | "unsupported" | "needs-install" | "error"
async function enableWebPush({ askPermission = true } = {}) {

    try {

        if (!("Notification" in window) || !("serviceWorker" in navigator)) {

            // iPhone'da Safari sekmesinde Notification yok; ana ekrana eklenince gelir
            const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);

            return ios ? "needs-install" : "unsupported";

        }

        if (!(await isMessagingSupported())) return "unsupported";

        let permission = Notification.permission;

        if (permission === "default" && askPermission) {
            permission = await Notification.requestPermission();
        }

        if (permission !== "granted") return permission === "denied" ? "denied" : "unsupported";

        const registration =
            await navigator.serviceWorker.getRegistration("./") ||
            await navigator.serviceWorker.register("sw.js");

        await navigator.serviceWorker.ready;

        const token = await getToken(getMessaging(app), {
            vapidKey: WEB_PUSH_VAPID_KEY,
            serviceWorkerRegistration: registration
        });

        if (!token) return "error";

        await savePushToken(token, "web");

        try { localStorage.setItem("webPushToken", token); } catch {}

        return "enabled";

    } catch (error) {

        console.error("Web bildirimi açılamadı:", error);
        return "error";

    }

}

async function disableWebPush() {

    let token = null;

    try { token = localStorage.getItem("webPushToken"); } catch {}

    if (token) await removePushToken(token);

}

async function removePushToken(token) {

    if (!auth.currentUser || !token) return;

    await deleteDoc(doc(db, 'pushTokens', token)).catch(() => {});

}

async function markMemoriesSeen(user) {

    const coupleId = await getMyCouple();

    if (!coupleId) return;

    const q = query(
        collection(db, "memories"),
        where("coupleId", "==", coupleId)
    );

    const snap = await getDocs(q);

    for (const d of snap.docs) {

        const data = d.data();

        if (data.author === user) continue;

        const seenBy = data.seenBy || [];

        if (!seenBy.includes(user)) {

            await updateDoc(
                doc(db, "memories", d.id),
                {
                    seenBy: arrayUnion(user)
                }
            );

        }

    }

}

async function listenMemories(callback) {

    const coupleId = await getMyCouple();

    if (!coupleId) {
        callback([]);
        return;
    }

    const q = query(
        collection(db, 'memories'),
        where('coupleId', '==', coupleId)
    );

    return onSnapshot(q, (snap) => {

        const memories = snap.docs
            .map(d => ({
                id: d.id,
                ...d.data()
            }))
            .sort((a, b) => {

                const dateA = a.createdAt?.toMillis?.() || 0;
                const dateB = b.createdAt?.toMillis?.() || 0;

                return dateB - dateA;

            });

        callback(memories);

    }, (error) => {

        console.error(
            "Memories dinleme hatası:",
            error
        );

    });

}

window.firebaseReady = true;

window.dispatchEvent(
    new Event("firebaseReady")
);

async function getPhotos() {

    const coupleId = await getMyCouple();

    if (!coupleId) return [];

    const q = query(
        collection(db, "photos"),
        where("coupleId", "==", coupleId)
    );

    const snap = await getDocs(q);

    return snap.docs
        .map(doc => ({
            id: doc.id,
            ...doc.data()
        }))
        .sort((a, b) => {

            const dateA = a.createdAt?.toMillis?.() || 0;
            const dateB = b.createdAt?.toMillis?.() || 0;

            return dateB - dateA;

        });

}

async function deletePhoto(photoId){

    await deleteDoc(
        doc(db, "photos", photoId)
    );

}

async function addSliderImage(image) {

    const coupleId = await getMyCouple();

    if (!coupleId) {
        throw new Error("COUPLE_NOT_FOUND");
    }

    const snap = await getDocs(
        query(
            collection(db, "sliderImages"),
            where("coupleId", "==", coupleId)
        )
    );

    const nextOrder = snap.size + 1;

    const sliderRef = doc(collection(db, "sliderImages"));

    const uploaded = await uploadCoupleImage(coupleId, "slider", sliderRef.id, image);

    await setDoc(
        sliderRef,
        {
            ...uploaded,
            order: nextOrder,
            active: true,
            coupleId,
            authorId: auth.currentUser?.uid || null,
            createdAt: serverTimestamp()
        }
    );

}

async function getSliderImages() {

    const coupleId = await getMyCouple();

    if (!coupleId) return [];

    const q = query(
        collection(db, "sliderImages"),
        where("coupleId", "==", coupleId)
    );

    const snap = await getDocs(q);

    return snap.docs
        .map(doc => ({
            id: doc.id,
            ...doc.data()
        }))
        .filter(item => item.active)
        .sort((a, b) => a.order - b.order);

}

function listenSliderImages(callback) {

    getMyCouple().then(coupleId => {

        if (!coupleId) {
            callback([]);
            return;
        }

        const q = query(
            collection(db, "sliderImages"),
            where("coupleId", "==", coupleId)
        );

        return onSnapshot(
            q,
            snap => {

                const images = snap.docs
                    .map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    .sort((a, b) => a.order - b.order);

                callback(images);

            },
            error => {

                console.error(
                    "Slider dinleme hatası:",
                    error
                );

                callback([]);

            }
        );

    }).catch(error => {

        console.error(
            "Slider coupleId hatası:",
            error
        );

        callback([]);

    });

}

// Kapak fotoğraflarının sırası: ids listesindeki sırayla 1, 2, 3…
async function reorderSliderImages(ids) {

    const batch = writeBatch(db);

    ids.forEach((id, index) => {
        batch.update(doc(db, "sliderImages", id), { order: index + 1 });
    });

    await batch.commit();

}

async function deleteSliderImage(id) {

    await deleteDoc(
        doc(db, "sliderImages", id)
    );

    // Kalanları yeniden sırala (sadece bu çiftin fotoğrafları)
    const coupleId = await getMyCouple();

    if (!coupleId) return;

    const snap = await getDocs(
        query(
            collection(db, "sliderImages"),
            where("coupleId", "==", coupleId)
        )
    );

    const batch = writeBatch(db);

    snap.docs
        .sort((a, b) => (a.data().order || 0) - (b.data().order || 0))
        .forEach((item, index) => {
            batch.update(item.ref, { order: index + 1 });
        });

    await batch.commit();

}

async function addEvent(event) {

    const coupleId = await getMyCouple();

    if (!coupleId) {
        throw new Error("COUPLE_NOT_FOUND");
    }

    const author = await getCurrentUserName();

    await addDoc(
        collection(db, "events"),
        {
            ...event,
            author,
            coupleId
        }
    );

}

async function getEvents() {

    const coupleId = await getMyCouple();

    if (!coupleId) return [];

    const q = query(
        collection(db, "events"),
        where("coupleId", "==", coupleId)
    );

    const snap = await getDocs(q);

    return snap.docs
        .map(doc => ({
            id: doc.id,
            ...doc.data()
        }))
        .sort((a, b) => {

            if (a.month !== b.month) {
                return a.month - b.month;
            }

            return a.day - b.day;

        });

}

function listenEvents(callback) {

    getMyCouple().then(coupleId => {

        if (!coupleId) {
            callback([]);
            return;
        }

        const q = query(
            collection(db, "events"),
            where("coupleId", "==", coupleId)
        );

        return onSnapshot(
            q,
            snapshot => {

                const events = snapshot.docs
                    .map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    .sort((a, b) => {

                        if (a.month !== b.month) {
                            return a.month - b.month;
                        }

                        return a.day - b.day;

                    });

                callback(events);

            },
            error => {

                console.error(
                    "Events dinleme hatası:",
                    error
                );

                callback([]);

            }
        );

    }).catch(error => {

        console.error(
            "Events coupleId hatası:",
            error
        );

        callback([]);

    });

}

async function updateEvent(id, data) {

    await updateDoc(
        doc(db, "events", id),
        data
    );

}

async function deleteEvent(id) {

    await deleteDoc(
        doc(db, "events", id)
    );

}

async function deleteDream(id) {

    await deleteDoc(
        doc(db, "dreams", id)
    );

}

async function addDream(dream) {
    const coupleId = await getMyCouple();

    if (!coupleId) {
        throw new Error("COUPLE_NOT_FOUND");
    }

    const profile = await getUserProfile();

    if (!profile) {
        throw new Error("USER_PROFILE_NOT_FOUND");
    }

    await addDoc(
        collection(db, "dreams"),
        {
            ...dream,
            authorId: profile.uid,
            seenBy: [profile.uid],
            coupleId,
            createdAt: serverTimestamp()
        }
    );
}

async function getDreams() {

    const coupleId = await getMyCouple();

    if (!coupleId) return [];

    const q = query(
        collection(db, "dreams"),
        where("coupleId", "==", coupleId)
    );

    const snap = await getDocs(q);

    return snap.docs
        .map(doc => ({
            id: doc.id,
            ...doc.data()
        }))
        .sort((a, b) => {

            const dateA = a.createdAt?.toMillis?.() || 0;
            const dateB = b.createdAt?.toMillis?.() || 0;

            return dateB - dateA;

        });

}

function listenDreams(callback) {

    getMyCouple().then(coupleId => {

        if (!coupleId) {
            callback([]);
            return;
        }

        const q = query(
            collection(db, "dreams"),
            where("coupleId", "==", coupleId)
        );

        return onSnapshot(
            q,
            snapshot => {

                const dreams = snapshot.docs
                    .map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }))
                    .sort((a, b) => {

                        const dateA =
                            a.createdAt?.toMillis?.() || 0;

                        const dateB =
                            b.createdAt?.toMillis?.() || 0;

                        return dateB - dateA;

                    });

                callback(dreams);

            },
            error => {

                console.error(
                    "Dreams dinleme hatası:",
                    error
                );

                callback([]);

            }
        );

    }).catch(error => {

        console.error(
            "Dreams coupleId hatası:",
            error
        );

        callback([]);

    });

}

// Gerçekleşen hayale fotoğraf (dreams/{id}.imageUrl …).
// Aynı yola yazılır: değiştirince eskisinin üzerine gelir.
async function setDreamPhoto(id, prepared) {

    const coupleId = await getMyCouple();

    if (!coupleId) throw new Error("COUPLE_NOT_FOUND");

    const uploaded = await uploadCoupleImage(coupleId, "dreams", id, prepared);

    await updateDoc(doc(db, "dreams", id), {
        ...uploaded,
        photoAt: serverTimestamp()
    });

}

// Dosyaları sunucu siler (functions → onDreamUpdated)
async function removeDreamPhoto(id) {

    await updateDoc(doc(db, "dreams", id), {
        imageUrl: deleteField(),
        thumbUrl: deleteField(),
        imagePath: deleteField(),
        thumbPath: deleteField(),
        width: deleteField(),
        height: deleteField(),
        photoAt: deleteField()
    });

}

async function updateDream(id, data) {

    await updateDoc(
        doc(db, "dreams", id),
        data
    );

}

// ── Özledim ─────────────────────────────────────────────────
// misses/{id} = { coupleId, authorId, count, day:"YYYY-MM-DD", clientAt, createdAt }
// Her "özledim serisi" (art arda basışlar) tek bir kayıt olur.
// Cloud Function partnere bildirim gönderir.

function localDayKey(date = new Date()) {

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;

}

async function addMiss(count) {

    const user = auth.currentUser;
    const coupleId = await getMyCouple();

    if (!user || !coupleId) throw new Error("COUPLE_NOT_FOUND");

    await addDoc(collection(db, "misses"), {
        coupleId,
        authorId: user.uid,
        count: Math.max(1, Math.floor(count)),
        day: localDayKey(),
        clientAt: Date.now(),
        createdAt: serverTimestamp()
    });

}

// Bugünün özledimlerini dinler. callback(items, changes)
// changes: ilk yüklemeden sonra yeni eklenenler
function listenTodayMisses(callback) {

    let unsubscribe = null;
    let first = true;

    getMyCouple().then(coupleId => {

        if (!coupleId) {
            callback([], []);
            return;
        }

        // İki eşitlik filtresi: ek index gerektirmez
        const q = query(
            collection(db, "misses"),
            where("coupleId", "==", coupleId),
            where("day", "==", localDayKey())
        );

        unsubscribe = onSnapshot(q, snapshot => {

            const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            const added = first
                ? []
                : snapshot.docChanges()
                    .filter(c => c.type === "added")
                    .map(c => ({ id: c.doc.id, ...c.doc.data() }));

            first = false;

            callback(items, added);

        }, error => console.warn("Özledim dinlenemedi:", error));

    });

    return () => unsubscribe?.();

}

// ── Mühürlü mektuplar ───────────────────────────────────────
// Yazma işlemleri Cloud Function'lardan geçer (functions/index.js).
// Bkz. js/letters.js

// Çiftin bütün mektupları (mühürlüler içeriksiz)
function listenLetters(callback) {

    let unsubscribe = null;

    getMyCouple().then(coupleId => {

        if (!coupleId) {
            callback([]);
            return;
        }

        unsubscribe = onSnapshot(
            query(collection(db, "letters"), where("coupleId", "==", coupleId)),
            snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            error => {
                console.error("Mektuplar dinlenemedi:", error);
                callback([]);
            }
        );

    });

    return () => unsubscribe?.();

}

// Benim mühürlü mektuplarımın içerikleri (sadece ben görebilirim)
function listenMyLetterContents(callback) {

    let unsubscribe = null;

    getMyCouple().then(coupleId => {

        const user = auth.currentUser;

        if (!coupleId || !user) {
            callback([]);
            return;
        }

        unsubscribe = onSnapshot(
            query(
                collection(db, "letterContents"),
                where("coupleId", "==", coupleId),
                where("authorId", "==", user.uid)
            ),
            snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            error => {
                console.error("Mektup içerikleri dinlenemedi:", error);
                callback([]);
            }
        );

    });

    return () => unsubscribe?.();

}

async function uploadSealedImage(coupleId, uid, id, prepared) {

    const base = `couples/${coupleId}/sealed/${uid}/${id}`;
    const metadata = { contentType: "image/jpeg" };

    await Promise.all([
        uploadBytes(storageRef(storage, `${base}.jpg`), prepared.blob, metadata),
        uploadBytes(storageRef(storage, `${base}_thumb.jpg`), prepared.thumbBlob, metadata)
    ]);

}

function callableError(error) {

    // Sunucunun gönderdiği hata kodu mesajda
    return new Error(error?.message || "UNKNOWN");

}

// letter: { text, openAt (ms), hideDate, photo: prepareImage() çıktısı | null }
async function sealLetter(letter) {

    const user = auth.currentUser;
    const coupleId = await getMyCouple();

    if (!user || !coupleId) throw new Error("COUPLE_NOT_FOUND");

    const id = doc(collection(db, "letters")).id;

    if (letter.photo) await uploadSealedImage(coupleId, user.uid, id, letter.photo);

    try {

        await httpsCallable(functions, "sealLetter")({
            id,
            text: letter.text,
            openAt: letter.openAt,
            hideDate: letter.hideDate,
            hasPhoto: !!letter.photo
        });

    } catch (error) {

        throw callableError(error);

    }

    return id;

}

// photo: prepareImage() çıktısı (değiştir) | "remove" (kaldır) | null (dokunma)
async function updateLetter(id, letter) {

    const user = auth.currentUser;
    const coupleId = await getMyCouple();

    if (!user || !coupleId) throw new Error("COUPLE_NOT_FOUND");

    let photoMode = "keep";

    if (letter.photo === "remove") {
        photoMode = "remove";
    } else if (letter.photo) {
        await uploadSealedImage(coupleId, user.uid, id, letter.photo);
        photoMode = "replace";
    }

    try {

        await httpsCallable(functions, "updateLetter")({
            id,
            text: letter.text,
            openAt: letter.openAt,
            hideDate: letter.hideDate,
            photo: photoMode
        });

    } catch (error) {

        throw callableError(error);

    }

}

async function deleteLetter(id) {

    try {
        await httpsCallable(functions, "deleteLetter")({ id });
    } catch (error) {
        throw callableError(error);
    }

}

async function openLetterNow(id) {

    try {
        const result = await httpsCallable(functions, "openLetterNow")({ id });
        return result.data?.opened === true;
    } catch (error) {
        throw callableError(error);
    }

}

async function markLetterRead(id) {

    const user = auth.currentUser;

    if (!user) return;

    await updateDoc(doc(db, "letters", id), {
        readAt: serverTimestamp(),
        seenBy: arrayUnion(user.uid)
    });

}

// ── Günün Sorusu ────────────────────────────────────────────
// Bkz. js/questions.js ve functions/index.js

function listenQuestions(callback) {

    let unsubscribe = null;

    getMyCouple().then(coupleId => {

        if (!coupleId) {
            callback([]);
            return;
        }

        unsubscribe = onSnapshot(
            query(collection(db, "dailyQuestions"), where("coupleId", "==", coupleId)),
            snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            error => {
                console.error("Sorular dinlenemedi:", error);
                callback([]);
            }
        );

    });

    return () => unsubscribe?.();

}

// Benim cevaplarım (açılmamış olanlar dahil; sadece ben görebilirim)
function listenMyAnswers(callback) {

    let unsubscribe = null;

    getMyCouple().then(coupleId => {

        const user = auth.currentUser;

        if (!coupleId || !user) {
            callback([]);
            return;
        }

        unsubscribe = onSnapshot(
            query(
                collection(db, "questionAnswers"),
                where("coupleId", "==", coupleId),
                where("authorId", "==", user.uid)
            ),
            snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            error => {
                console.error("Cevaplar dinlenemedi:", error);
                callback([]);
            }
        );

    });

    return () => unsubscribe?.();

}

async function ensureTodayQuestion() {

    try {
        const result = await httpsCallable(functions, "ensureTodayQuestion")({});
        return result.data;
    } catch (error) {
        throw callableError(error);
    }

}

async function answerQuestion(day, text) {

    try {
        const result = await httpsCallable(functions, "answerQuestion")({ day, text });
        return result.data;
    } catch (error) {
        throw callableError(error);
    }

}

async function addCustomQuestion(text) {

    try {
        const result = await httpsCallable(functions, "addCustomQuestion")({ text });
        return result.data;
    } catch (error) {
        throw callableError(error);
    }

}

// emoji: null → tepkiyi kaldır
async function reactToQuestion(id, emoji) {

    const user = auth.currentUser;

    if (!user) return;

    await updateDoc(doc(db, "dailyQuestions", id), {
        [`reactions.${user.uid}`]: emoji || deleteField()
    });

}

// ── Ruh Hali ────────────────────────────────────────────────
// Bkz. js/moods.js

// Çiftin şu anki ruh halleri: callback({ uid: { mood, note, at } })
function listenMoods(callback) {

    let unsubscribe = null;

    getMyCouple().then(coupleId => {

        if (!coupleId) {
            callback({});
            return;
        }

        unsubscribe = onSnapshot(
            doc(db, "couples", coupleId),
            snap => callback(snap.get("moods") || {}),
            error => console.error("Ruh hali dinlenemedi:", error)
        );

    });

    return () => unsubscribe?.();

}

async function setMood(mood, note = "") {

    const user = auth.currentUser;
    const coupleId = await getMyCouple();

    if (!user || !coupleId) throw new Error("COUPLE_NOT_FOUND");

    const cleanNote = String(note || "").trim().slice(0, 120);

    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    await updateDoc(doc(db, "couples", coupleId), {
        [`moods.${user.uid}`]: { mood, note: cleanNote, at: serverTimestamp() }
    });

    // Geçmiş (takvim) ve gerekirse partnere bildirim için
    await addDoc(collection(db, "moodLogs"), {
        coupleId,
        authorId: user.uid,
        mood,
        note: cleanNote,
        day,
        createdAt: serverTimestamp()
    });

}

async function sendNudge(type, extra = {}) {

    const user = auth.currentUser;
    const coupleId = await getMyCouple();

    if (!user || !coupleId) throw new Error("COUPLE_NOT_FOUND");

    await addDoc(collection(db, "nudges"), {
        coupleId,
        authorId: user.uid,
        type,
        ...(extra.label ? { label: String(extra.label).slice(0, 40) } : {}),
        createdAt: serverTimestamp()
    });

}

// ── Ona hatırlat (js/reminders.js) ──────────────────────────

function listenReminders(callback) {

    let unsubscribe = null;
    let stopped = false;

    getMyCouple().then(coupleId => {

        if (!coupleId || stopped) {
            callback([]);
            return;
        }

        unsubscribe = onSnapshot(
            query(collection(db, "reminders"), where("coupleId", "==", coupleId)),
            snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            error => console.error("Hatırlatmalar dinlenemedi:", error)
        );

    });

    return () => {
        stopped = true;
        unsubscribe?.();
    };

}

async function addReminder(data) {

    const user = auth.currentUser;
    const coupleId = await getMyCouple();

    if (!user || !coupleId) throw new Error("COUPLE_NOT_FOUND");

    const ref = await addDoc(collection(db, "reminders"), {
        ...data,
        coupleId,
        authorId: user.uid,
        muted: false,
        lastAt: null,
        doneFor: null,
        doneAt: null,
        thanks: null,
        snoozeUntil: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    return ref.id;

}

async function updateReminder(id, data) {

    await updateDoc(doc(db, "reminders", id), {
        ...data,
        updatedAt: serverTimestamp()
    });

}

async function deleteReminder(id) {

    await deleteDoc(doc(db, "reminders", id));

}

// ── Su takibi (js/water.js) ─────────────────────────────────
// water/{coupleId}_{uid}_{gün} = { coupleId, authorId, day, ml, goal }

// Bugünün iki kaydını (ikinizin) dinler: uid → { ml, goal }
function listenWater(day, callback) {

    let unsubscribe = null;
    let stopped = false;

    getMyCouple().then(coupleId => {

        if (!coupleId || stopped) {
            callback({});
            return;
        }

        unsubscribe = onSnapshot(
            query(collection(db, "water"), where("coupleId", "==", coupleId), where("day", "==", day)),
            snap => {
                const out = {};
                snap.docs.forEach(d => {
                    const data = d.data();
                    out[data.authorId] = { ml: data.ml || 0, goal: data.goal || null };
                });
                callback(out);
            },
            error => console.error("Su dinlenemedi:", error)
        );

    });

    return () => {
        stopped = true;
        unsubscribe?.();
    };

}

// delta: eklenecek ml (geri alırken eksi)
async function addWater(day, delta, goal) {

    const user = auth.currentUser;
    const coupleId = await getMyCouple();

    if (!user || !coupleId) throw new Error("COUPLE_NOT_FOUND");

    await setDoc(doc(db, "water", `${coupleId}_${user.uid}_${day}`), {
        coupleId,
        authorId: user.uid,
        day,
        goal: Math.round(goal),
        ml: increment(Math.round(delta)),
        updatedAt: serverTimestamp()
    }, { merge: true });

}

async function getWaterSettings() {

    const profile = await getUserProfile();

    return profile?.water || null;

}

async function saveWaterSettings({ goal, glass }) {

    const user = auth.currentUser;

    if (!user) throw new Error("NOT_SIGNED_IN");

    await updateDoc(doc(db, "users", user.uid), {
        "water.goal": Math.round(goal),
        "water.glass": Math.round(glass)
    });

}

// Kendi son günlerim: gün → { ml, goal }
async function getWaterHistory(days) {

    const user = auth.currentUser;
    const coupleId = await getMyCouple();

    if (!user || !coupleId) return {};

    const snaps = await Promise.all(days.map(day =>
        getDoc(doc(db, "water", `${coupleId}_${user.uid}_${day}`)).catch(() => null)
    ));

    const out = {};

    snaps.forEach((snap, i) => {
        if (snap?.exists()) out[days[i]] = { ml: snap.get("ml") || 0, goal: snap.get("goal") || null };
    });

    return out;

}

// Bir kişinin ruh hali geçmişi (takvim)
async function getMoodLogs(uid) {

    const coupleId = await getMyCouple();

    if (!coupleId) return [];

    const snap = await getDocs(query(
        collection(db, "moodLogs"),
        where("coupleId", "==", coupleId),
        where("authorId", "==", uid)
    ));

    return snap.docs.map(d => ({ id: d.id, ...d.data() }));

}

// ── Bugün geçen yıl ─────────────────────────────────────────
// Sunucu her gece onThisDay/{coupleId}_{gün} kaydını hazırlar.

function istanbulToday() {

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Istanbul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());

}

// callback(kayıt ya da null)
function listenOnThisDay(callback) {

    let unsubscribe = null;

    getMyCouple().then(coupleId => {

        if (!coupleId) {
            callback(null);
            return;
        }

        unsubscribe = onSnapshot(
            doc(db, "onThisDay", `${coupleId}_${istanbulToday()}`),
            snap => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            error => {
                console.warn("Bugün geçen yıl okunamadı:", error);
                callback(null);
            }
        );

    });

    return () => unsubscribe?.();

}

// items: [{ collection, id, label, months }] → kayıtların kendisi
async function getOnThisDayItems(items) {

    const results = await Promise.all(items.map(async item => {

        try {

            const snap = await getDoc(doc(db, item.collection, item.id));

            return snap.exists() ? { ...item, data: { id: snap.id, ...snap.data() } } : null;

        } catch {

            return null;

        }

    }));

    return results.filter(Boolean);

}

// ── Yakınlık ────────────────────────────────────────────────
// Bkz. js/proximity.js ve functions/index.js → reportPresence

// Çift kaydının tamamını dinle (yakınlık durumu, izinler)
function listenCouple(callback) {

    let unsubscribe = null;

    getMyCouple().then(coupleId => {

        if (!coupleId) return;

        unsubscribe = onSnapshot(
            doc(db, "couples", coupleId),
            snap => callback(snap.data() || {}),
            error => console.warn("Çift kaydı dinlenemedi:", error)
        );

    });

    return () => unsubscribe?.();

}

// ── Premium (yönetici: hediye) ─────────────────────────────

async function amIAdmin() {

    if (!auth.currentUser) return false;

    try {
        const result = await httpsCallable(functions, "amIAdmin")({});
        return !!result.data?.admin;
    } catch {
        return false;
    }

}

async function callAdmin(name, data) {

    try {
        const result = await httpsCallable(functions, name)(data);
        return result.data;
    } catch (error) {
        // functions → HttpsError mesajı: USER_NOT_FOUND, NO_COUPLE…
        throw new Error(error?.message || "ADMIN_FAILED");
    }

}

async function adminGrantPremium({ email, days, note }) {
    return callAdmin("adminGrantPremium", { email, days, note });
}

async function adminRevokePremium({ email }) {
    return callAdmin("adminRevokePremium", { email });
}

async function adminListPremium() {
    const data = await callAdmin("adminListPremium", {});
    return data?.rows || [];
}

async function setProximityOptIn(enabled) {

    const user = auth.currentUser;
    const coupleId = await getMyCouple();

    if (!user || !coupleId) throw new Error("COUPLE_NOT_FOUND");

    await updateDoc(doc(db, "couples", coupleId), {
        [`proximityOptIn.${user.uid}`]: enabled ? true : deleteField()
    });

    if (!enabled) {
        await httpsCallable(functions, "clearPresence")({}).catch(() => {});
    }

}

async function reportPresence(lat, lng, accuracy) {

    try {
        const result = await httpsCallable(functions, "reportPresence")({ lat, lng, accuracy });
        return result.data;
    } catch (error) {
        throw callableError(error);
    }

}

// Bu ayın "yan yana" günleri: callback(gün listesi)
function listenTogetherMonth(callback) {

    let unsubscribe = null;

    getMyCouple().then(coupleId => {

        if (!coupleId) return;

        const month = istanbulToday().slice(0, 7);

        unsubscribe = onSnapshot(
            doc(db, "togetherDays", `${coupleId}_${month}`),
            snap => callback(snap.exists() ? (snap.get("days") || []) : []),
            error => {
                console.warn("Yan yana günler okunamadı:", error);
                callback([]);
            }
        );

    });

    return () => unsubscribe?.();

}

// Bir yılın aylık "yan yana" günleri
async function getTogetherYear(year) {

    const coupleId = await getMyCouple();

    if (!coupleId) return [];

    const snap = await getDocs(query(
        collection(db, "togetherDays"),
        where("coupleId", "==", coupleId),
        where("year", "==", year)
    ));

    return snap.docs.map(d => ({ id: d.id, ...d.data() }));

}

// ── Şifre sıfırlama ve hesap silme ──────────────────────────

async function sendPasswordReset(email) {

    // Firebase'in gönderdiği e-posta Türkçe olsun
    auth.languageCode = "tr";

    await sendPasswordResetEmail(auth, email);

}

// ── Bildirim türleri (js/notifications.js) ──────────────────

// Günün Sorusu: cevapları açılan ve okunan günler (js/questions.js)
async function markQuestionSeen(days) {

    const user = auth.currentUser;

    if (!user) throw new Error("NOT_SIGNED_IN");

    const list = (Array.isArray(days) ? days : [days]).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

    if (!list.length) return;

    await updateDoc(doc(db, "users", user.uid), { questionSeen: arrayUnion(...list) });

}

// Sevgili olunan tarih ("YYYY-MM-DD"), Ayarlar'dan değiştirilebilir
async function setCoupleStartDate(startDate) {

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error("BAD_DATE");

    const coupleId = await getMyCouple();

    if (!coupleId) throw new Error("NO_COUPLE");

    await updateDoc(doc(db, "couples", coupleId), { startDate });

}

// Adını değiştir (Ayarlar → Adım)
async function setMyName(name) {

    const user = auth.currentUser;

    if (!user) throw new Error("NOT_SIGNED_IN");

    const clean = String(name || "").trim().slice(0, 30);

    if (!clean) throw new Error("EMPTY_NAME");

    await updateDoc(doc(db, "users", user.uid), { name: clean });

}

// Kalbim (app.js → HEART_CHOICES)
async function setMyHeart(heart) {

    const user = auth.currentUser;

    if (!user) throw new Error("NOT_SIGNED_IN");

    await updateDoc(doc(db, "users", user.uid), { heart });

}

async function setNotifyPref(key, value) {

    const user = auth.currentUser;

    if (!user) throw new Error("NOT_SIGNED_IN");

    await updateDoc(doc(db, "users", user.uid), {
        [`notifyPrefs.${key}`]: !!value
    });

}

// ── Şu an dinliyorum (js/nowplaying.js) ─────────────────────
// Tek belge: nowPlaying/{uid}. 5 dakika sonra görünmez olur,
// sunucu da süresi geçenleri siler.

const NOW_PLAYING_MS = 5 * 60 * 1000;

async function shareNowPlaying({ link, platform, title, artist, cover }) {

    const user = auth.currentUser;
    const coupleId = await getMyCouple();

    if (!user || !coupleId) throw new Error("COUPLE_NOT_FOUND");

    const clip = (v, n) => (v ? String(v).slice(0, n) : "");

    await setDoc(doc(db, "nowPlaying", user.uid), {
        uid: user.uid,
        coupleId,
        link: clip(link, 480),
        platform: platform || null,
        title: clip(title, 200),
        artist: clip(artist, 200),
        cover: cover ? clip(cover, 480) : null,
        shareId: Math.random().toString(36).slice(2, 12),
        sharedAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + NOW_PLAYING_MS)
    });

}

async function stopNowPlaying() {

    const user = auth.currentUser;

    if (!user) return;

    await deleteDoc(doc(db, "nowPlaying", user.uid)).catch(() => {});

}

function listenNowPlaying(callback) {

    let unsubscribe = null;

    getMyCouple().then(coupleId => {

        if (!coupleId) return;

        const q = query(collection(db, "nowPlaying"), where("coupleId", "==", coupleId));

        unsubscribe = onSnapshot(q, snapshot => {

            callback(snapshot.docs.map(d => {
                const data = d.data();
                return {
                    ...data,
                    uid: data.uid || d.id,
                    expiresAt: data.expiresAt?.toMillis?.() || 0
                };
            }));

        }, error => console.warn("Şu an dinlenen alınamadı:", error));

    });

    return () => unsubscribe?.();

}

// ── Partner pili (js/battery.js) ────────────────────────────

async function saveMyBattery({ level, charging }) {

    const user = auth.currentUser;
    const coupleId = await getMyCouple();

    if (!user || !coupleId) return;

    await setDoc(doc(db, "battery", user.uid), {
        uid: user.uid,
        coupleId,
        level: Math.max(0, Math.min(100, Math.round(level))),
        charging: !!charging,
        at: serverTimestamp()
    });

}

async function deleteMyBattery() {

    const user = auth.currentUser;

    if (!user) return;

    await deleteDoc(doc(db, "battery", user.uid)).catch(() => {});

}

function listenCoupleBattery(callback) {

    let unsubscribe = null;

    getMyCouple().then(coupleId => {

        if (!coupleId) return;

        const q = query(collection(db, "battery"), where("coupleId", "==", coupleId));

        unsubscribe = onSnapshot(q, snapshot => {

            const map = {};

            snapshot.docs.forEach(d => {
                const data = d.data();
                map[data.uid || d.id] = {
                    ...data,
                    at: data.at?.toMillis?.() || Date.now()
                };
            });

            callback(map);

        }, error => console.warn("Pil bilgisi dinlenemedi:", error));

    });

    return () => unsubscribe?.();

}

// ── E-posta doğrulama (js/verify.js) ────────────────────────

async function sendVerificationEmail() {

    const user = auth.currentUser;

    if (!user || user.emailVerified) return false;

    auth.languageCode = "tr";

    await sendEmailVerification(user);

    return true;

}

// Doğrulama bağlantısına başka bir uygulamada (e-posta) basılmış
// olabilir: güncel durumu sunucudan al
async function refreshEmailVerified() {

    const user = auth.currentUser;

    if (!user) return null;

    try { await reload(user); } catch {}

    return {
        verified: !!auth.currentUser?.emailVerified,
        usesPassword: (auth.currentUser?.providerData || []).some(p => p.providerId === "password"),
        createdAt: Date.parse(auth.currentUser?.metadata?.creationTime || "") || 0,
        email: auth.currentUser?.email || ""
    };

}

// Şifreyle yeniden doğrula, sonra sunucuda hesabı ve verileri sil
async function deleteMyAccount(password) {

    const user = auth.currentUser;

    if (!user?.email) throw new Error("NOT_SIGNED_IN");

    await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password)
    );

    // Yeni giriş zamanı sunucuya taze bir kimlik kartıyla gitsin
    await user.getIdToken(true);

    try {
        await httpsCallable(functions, "deleteAccount")({});
    } catch (error) {
        throw callableError(error);
    }

    await signOut(auth).catch(() => {});

}

window.firebase = {
    setNotifyPref,
    shareNowPlaying,
    stopNowPlaying,
    listenNowPlaying,
    saveMyBattery,
    deleteMyBattery,
    listenCoupleBattery,
    sendVerificationEmail,
    refreshEmailVerified,
    saveConsent,
    sendPasswordReset,
    deleteMyAccount,
    listenCouple,
    getCoupleSummary,
    setMyHeart,
    setMyName,
    setCoupleStartDate,
    markQuestionSeen,
    getWrapped,
    setDreamPhoto,
    listenReminders,
    addReminder,
    updateReminder,
    deleteReminder,
    removeDreamPhoto,
    refreshUsage,
    reorderSliderImages,
    amIAdmin,
    adminGrantPremium,
    adminRevokePremium,
    adminListPremium,
    setProximityOptIn,
    reportPresence,
    listenTogetherMonth,
    getTogetherYear,
    listenOnThisDay,
    getOnThisDayItems,
    listenMoods,
    setMood,
    sendNudge,
    listenWater,
    addWater,
    getWaterSettings,
    saveWaterSettings,
    getWaterHistory,
    getMoodLogs,
    listenQuestions,
    listenMyAnswers,
    ensureTodayQuestion,
    answerQuestion,
    addCustomQuestion,
    reactToQuestion,
    enableWebPush,
    disableWebPush,
    listenLetters,
    listenMyLetterContents,
    sealLetter,
    updateLetter,
    deleteLetter,
    openLetterNow,
    markLetterRead,
    listLegacyImages,
    attachLegacyImage,
    addMiss,
    listenTodayMisses,
    registerUser,
    loginUser,
    logoutUser,
    listenAuth,
    getCurrentAuthUser,
    getUserProfile,
    getCurrentUserName,

    createUserProfile,

    addMemory,
    addPhoto,
    getPhotos,
    getSliderImages,
    getMemories,
    deletePhoto,
    deleteMemory,
    markMemoriesSeen,
    listenMemories,

    addSong,
    updateSong,
    markSeen,
    savePushToken,
    removePushToken,
    updateCoupleStreak,
    listenCoupleStreak,
    addSliderImage,
    deleteSliderImage,
    listenSliderImages,
    addEvent,
    getEvents,
    listenEvents,
    updateEvent,
    deleteEvent,
    listenSongs,
    deleteSong,
    markSongsSeen,
    addDream,
    getDreams,
    listenDreams,
    updateDream,
    deleteDream,

    createCouple,
    getMyInviteCode,
    joinCouple,
    getMyCouple,
    getMyCoupleData,
    getUserProfile,
    getUserProfileByUid,
    cancelMyCouple
};

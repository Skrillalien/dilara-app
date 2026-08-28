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
    arrayUnion,
    getDoc,
    setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
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

async function createCouple(user) {

    const inviteCode =
        Math.random().toString(36).substring(2, 8).toUpperCase();

    const coupleRef = doc(collection(db, "couples"));

    await setDoc(coupleRef, {
        members: [user.uid],
        inviteCode: inviteCode,
        createdAt: serverTimestamp()
    });

    await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        coupleId: coupleRef.id
    });

    return {
        coupleId: coupleRef.id,
        inviteCode: inviteCode
    };

}


async function joinCouple(user, inviteCode) {

    const q = query(
        collection(db, "couples")
    );

    const snapshot = await getDocs(q);

    const coupleDoc = snapshot.docs.find(
        d => d.data().inviteCode === inviteCode.toUpperCase()
    );

    if (!coupleDoc) {
        throw new Error("INVITE_CODE_NOT_FOUND");
    }

    const coupleData = coupleDoc.data();

    if (coupleData.members.length >= 2) {
        throw new Error("COUPLE_FULL");
    }

    await updateDoc(coupleDoc.ref, {
        members: arrayUnion(user.uid)
    });

    await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        coupleId: coupleDoc.id
    });

    return coupleDoc.id;

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

async function createUserProfile(uid, name, email) {

    await setDoc(
        doc(db, "users", uid),
        {
            name: name,
            email: email,
            coupleId: null,
            createdAt: serverTimestamp()
        },
        { merge: true }
    );

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

async function addMemory(text, author, image = null) {

    const coupleId = await getMyCouple();

    if (!coupleId) {
        throw new Error("COUPLE_NOT_FOUND");
    }

    await addDoc(collection(db, 'memories'), {

        text,
        author,
        image,

        coupleId,

        seenBy: [author],

        createdAt: serverTimestamp()

    });
}

async function addSong(link, title, artist, note, author) {

    const coupleId = await getMyCouple();

    if (!coupleId) {
        throw new Error("COUPLE_NOT_FOUND");
    }

    await addDoc(collection(db, "songs"), {

        link,
        title,
        artist,
        note,
        author,

        coupleId,

        seenBy: [author],

        createdAt: serverTimestamp()

    });

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

async function addPhoto(image, author) {

    const coupleId = await getMyCouple();

    if (!coupleId) {
        throw new Error("COUPLE_NOT_FOUND");
    }

    await addDoc(collection(db, "photos"), {

        image,
        author,
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

    await addDoc(
        collection(db, "sliderImages"),
        {
            image,
            order: nextOrder,
            active: true,
            coupleId,
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

async function deleteSliderImage(id) {

    await deleteDoc(
        doc(db, "sliderImages", id)
    );

    const snap = await getDocs(
        query(
            collection(db, "sliderImages"),
            orderBy("order", "asc")
        )
    );

    let order = 1;

    for (const item of snap.docs) {

        await updateDoc(
            doc(db, "sliderImages", item.id),
            {
                order: order++
            }
        );

    }

}

async function addEvent(event) {

    const coupleId = await getMyCouple();

    if (!coupleId) {
        throw new Error("COUPLE_NOT_FOUND");
    }

    await addDoc(
        collection(db, "events"),
        {
            ...event,
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

    await addDoc(
        collection(db, "dreams"),
        {
            ...dream,
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

async function updateDream(id, data) {

    await updateDoc(
        doc(db, "dreams", id),
        data
    );

}

window.firebase = {
    registerUser,
    loginUser,
    logoutUser,
    listenAuth,
    getCurrentAuthUser,

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
    joinCouple,
    getMyCouple,
};

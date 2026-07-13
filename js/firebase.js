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
    onSnapshot,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

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

async function addMemory(text, author, image = null) {
    await addDoc(collection(db, 'memories'), {
        text,
        author,
        image,
        seenBy: [author],
        createdAt: serverTimestamp()
    });
}

async function addPhoto(image, author) {

    await addDoc(collection(db, "photos"), {

        image,
        author,

        createdAt: serverTimestamp()

    });

}

async function getMemories() {
    const q = query(collection(db, 'memories'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function deleteMemory(id) {
    await deleteDoc(doc(db, 'memories', id));
}
    
async function markMemoriesSeen(user) {

    const q = query(collection(db, "memories"));
    const snap = await getDocs(q);

    for (const d of snap.docs) {

        const data = d.data();

        if (data.author === user) continue;

        const seenBy = data.seenBy || [];

        if (!seenBy.includes(user)) {

            await updateDoc(doc(db, "memories", d.id), {
                seenBy: [...seenBy, user]
            });

        }
    }
}

function listenMemories(callback) {
    const q = query(collection(db, 'memories'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
        const memories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(memories);
    });
}

window.firebaseReady = true;

window.dispatchEvent(
    new Event("firebaseReady")
);

async function getPhotos() {

    const snap = await getDocs(
        query(
            collection(db, "photos"),
            orderBy("createdAt", "desc")
        )
    );

    return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

}

async function deletePhoto(photoId){

    await deleteDoc(
        doc(db, "photos", photoId)
    );

}

window.firebase = {
    addMemory,
    addPhoto,
    getPhotos,
    getMemories,
    deletePhoto,
    deleteMemory,
    markMemoriesSeen,
    listenMemories
};


// Shared "memoryVerses" Firestore collection: state + CRUD. The
// "who's memorizing" selection itself lives in active-user.js, shared
// across the whole app, not just Memorize.
//
// Doc shape: { reference, text, progress, createdAt }. `progress` is a map
// keyed by user id: { [userId]: { correctCount, attempts, needsReview } }.
import { ready } from "./firebase.js";

let db = null;
let verses = [];
const listeners = new Set();

function notify() {
  listeners.forEach((cb) => cb(verses));
}

export function subscribeMemoryVerses(callback) {
  listeners.add(callback);
  callback(verses);
  return () => listeners.delete(callback);
}

export function getMemoryVerses() {
  return verses;
}

export function addMemoryVerse(reference, text) {
  if (!db) return;
  db.collection("memoryVerses").add({
    reference,
    text,
    progress: {},
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

export function deleteMemoryVerse(id) {
  if (!db) return;
  db.collection("memoryVerses").doc(id).delete();
}

export function recordVerseProgress(verseId, userId, wasCorrect) {
  if (!db || !userId) return;
  const v = verses.find((v) => v.id === verseId);
  if (!v) return;
  const prev = (v.progress && v.progress[userId]) || { correctCount: 0, attempts: 0, needsReview: false };
  db.collection("memoryVerses")
    .doc(verseId)
    .update({
      [`progress.${userId}`]: {
        correctCount: (prev.correctCount || 0) + (wasCorrect ? 1 : 0),
        attempts: (prev.attempts || 0) + 1,
        needsReview: !wasCorrect,
      },
    });
}

ready
  .then((firestoreDb) => {
    db = firestoreDb;
    db.collection("memoryVerses").onSnapshot(
      (snapshot) => {
        verses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        notify();
      },
      (err) => console.error(err)
    );
  })
  .catch((err) => console.error(err));

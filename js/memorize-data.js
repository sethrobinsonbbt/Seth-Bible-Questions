// Shared "memoryVerses" + "verseCategories" Firestore collections: state +
// CRUD. The "who's memorizing" selection itself lives in active-user.js,
// shared across the whole app, not just Memorize.
//
// memoryVerses doc shape: { reference, text, categoryId, progress, createdAt }.
// `categoryId` is a verseCategories doc id, or null for uncategorized.
// `progress` is a map keyed by user id:
// { [userId]: { correctCount, attempts, needsReview } } — written by both
// practice modes (Fill in the Blank and Flashcards) so "needs review" and
// star/mastery ratings reflect practice from either one.
//
// verseCategories doc shape: { name, createdAt }.
import { ready } from "./firebase.js";

let db = null;
let verses = [];
let categories = [];
const verseListeners = new Set();
const categoryListeners = new Set();

function notifyVerses() {
  verseListeners.forEach((cb) => cb(verses));
}

function notifyCategories() {
  categoryListeners.forEach((cb) => cb(categories));
}

export function subscribeMemoryVerses(callback) {
  verseListeners.add(callback);
  callback(verses);
  return () => verseListeners.delete(callback);
}

export function subscribeVerseCategories(callback) {
  categoryListeners.add(callback);
  callback(categories);
  return () => categoryListeners.delete(callback);
}

export function getMemoryVerses() {
  return verses;
}

export function getVerseCategories() {
  return categories;
}

export function addMemoryVerse(reference, text, categoryId) {
  if (!db) return;
  db.collection("memoryVerses").add({
    reference,
    text,
    categoryId: categoryId || null,
    progress: {},
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

export function deleteMemoryVerse(id) {
  if (!db) return;
  db.collection("memoryVerses").doc(id).delete();
}

export function assignVerseCategory(verseId, categoryId) {
  if (!db) return;
  db.collection("memoryVerses").doc(verseId).update({ categoryId: categoryId || null });
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

// Clears one user's progress on every memory verse (used by Setup's
// per-member "Reset Stats"). Other users' progress on the same verses is
// untouched.
export function resetUserProgress(userId) {
  if (!db) return;
  const affected = verses.filter((v) => v.progress && v.progress[userId]);
  if (affected.length === 0) return;
  const batch = db.batch();
  affected.forEach((v) => {
    batch.update(db.collection("memoryVerses").doc(v.id), { [`progress.${userId}`]: firebase.firestore.FieldValue.delete() });
  });
  batch.commit();
}

// ---------- Categories ----------

export function addVerseCategory(name) {
  if (!db) return;
  db.collection("verseCategories").add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
}

export function updateVerseCategory(id, name) {
  if (!db) return;
  db.collection("verseCategories").doc(id).update({ name });
}

export function deleteVerseCategory(id) {
  if (!db) return;
  // Un-categorize any verses that pointed at it rather than leaving a
  // dangling categoryId, then delete the category itself.
  const affected = verses.filter((v) => v.categoryId === id);
  const batch = db.batch();
  affected.forEach((v) => {
    batch.update(db.collection("memoryVerses").doc(v.id), { categoryId: null });
  });
  batch.delete(db.collection("verseCategories").doc(id));
  batch.commit();
}

ready
  .then((firestoreDb) => {
    db = firestoreDb;
    db.collection("memoryVerses").onSnapshot(
      (snapshot) => {
        verses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        notifyVerses();
      },
      (err) => console.error(err)
    );
    db.collection("verseCategories").onSnapshot(
      (snapshot) => {
        categories = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        notifyCategories();
      },
      (err) => console.error(err)
    );
  })
  .catch((err) => console.error(err));

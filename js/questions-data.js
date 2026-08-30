// Shared "questions" Firestore collection: state + CRUD. Used by the
// kid-facing quiz view (questions.js) and the admin view (settings.js).
//
// Doc shape: { text, answer, assignedTo: ageGroupId|null, progress, createdAt }
// `assignedTo` is an age-group id (see age-groups-data.js) or null for the
// unassigned Library pool. `progress` is a map keyed by user id:
// { [userId]: { correctCount, wrongCount, needsReview } } — tracked per
// user so two kids sharing an age group don't share the same score.
import { ready } from "./firebase.js";
import { QUESTION_BANK } from "./question-bank-data.js";
import { FAMILY_QUESTIONS } from "./family-question-bank.js";

let db = null;
let questions = [];
const listeners = new Set();

function notify() {
  listeners.forEach((cb) => cb(questions));
}

export function subscribeQuestions(callback) {
  listeners.add(callback);
  callback(questions);
  return () => listeners.delete(callback);
}

export function getQuestions() {
  return questions;
}

export function addQuestion(text, answer, assignedTo) {
  if (!db) return;
  db.collection("questions").add({
    text,
    answer: answer || null,
    assignedTo: assignedTo || null,
    progress: {},
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

export function updateQuestion(id, text, answer) {
  if (!db) return;
  db.collection("questions").doc(id).update({ text, answer: answer || null });
}

export function updateQuestionAssignment(id, assignedTo) {
  if (!db) return;
  db.collection("questions").doc(id).update({ assignedTo: assignedTo || null });
}

export function deleteQuestion(id) {
  if (!db) return;
  db.collection("questions").doc(id).delete();
}

export function recordAnswer(id, userId, wasCorrect) {
  if (!db || !userId) return;
  const q = questions.find((q) => q.id === id);
  if (!q) return;
  const prev = (q.progress && q.progress[userId]) || { correctCount: 0, wrongCount: 0, needsReview: false };
  db.collection("questions")
    .doc(id)
    .update({
      [`progress.${userId}`]: {
        correctCount: (prev.correctCount || 0) + (wasCorrect ? 1 : 0),
        wrongCount: (prev.wrongCount || 0) + (wasCorrect ? 0 : 1),
        needsReview: !wasCorrect,
      },
    });
}

export function resetProgress(id) {
  if (!db) return;
  db.collection("questions").doc(id).update({ progress: {} });
}

// Adds every item whose text doesn't already match an existing question
// (case-insensitive). Returns how many were added.
export function bulkImport(items) {
  if (!db) return 0;
  const existingText = new Set(questions.map((q) => q.text.trim().toLowerCase()));
  const toAdd = items.filter((item) => !existingText.has(item.text.trim().toLowerCase()));
  if (toAdd.length === 0) return 0;
  const batch = db.batch();
  const col = db.collection("questions");
  toAdd.forEach((item) => {
    batch.set(col.doc(), {
      text: item.text,
      answer: item.answer || null,
      assignedTo: item.assignedTo || null,
      progress: {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
  batch.commit();
  return toAdd.length;
}

export function importQuestionBank() {
  return bulkImport(QUESTION_BANK.map((text) => ({ text })));
}

export function importFamilyQuestions() {
  return bulkImport(FAMILY_QUESTIONS);
}

ready.then((firestoreDb) => {
  db = firestoreDb;
  db.collection("questions").onSnapshot(
    (snapshot) => {
      questions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      notify();
    },
    (err) => console.error(err)
  );
}).catch((err) => console.error(err));

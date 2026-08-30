// Shared "questions" Firestore collection: state + CRUD. Used by the
// kid-facing quiz view (questions.js) and the admin view (settings.js).
//
// Doc shape: { text, answer, reference, assignedTo: ageGroupId|null,
// type, progress, createdAt }. `reference` is an optional Bible citation
// (e.g. "Genesis 1:3") backing up the answer. `assignedTo` is an age-group
// id (see age-groups-data.js) or null for the unassigned Library pool.
// `progress` is a map keyed by user id:
// { [userId]: { correctCount, wrongCount, needsReview } } — tracked per
// user so two kids sharing an age group don't share the same score.
//
// `type` is one of:
//   "classic" (default/missing) — plain text `answer`, shown on demand via
//     Show Answer, self-graded Right/Wrong. Everything from before these
//     other types existed is this shape.
//   "multiple-choice" — `choices: [string,...]`, `correctIndex: number`.
//   "order" — `items: [string,...]` already in the correct order; shown to
//     the quiz-taker shuffled, tapped back into order.
//   "select-all" — `options: [string,...]`, `correctIndices: [number,...]`
//     (the subset of `options` that are true/correct).
// Every type still just grades as right-or-wrong overall (no partial
// credit) so scoring/progress tracking stays the same shape regardless.
import { ready } from "./firebase.js";
import { getFamilyId, scopedCollection } from "./family.js";

let db = null;
let questions = [];
const listeners = new Set();

function notify() {
  listeners.forEach((cb) => cb(questions));
}

function questionsCollection() {
  return scopedCollection(db, "questions");
}

export function subscribeQuestions(callback) {
  listeners.add(callback);
  callback(questions);
  return () => listeners.delete(callback);
}

export function getQuestions() {
  return questions;
}

// `data` also accepts the type-specific fields documented above (choices/
// correctIndex, items, options/correctIndices) — whichever ones apply to
// data.type, the rest are left null.
export function addQuestion(data) {
  if (!db) return;
  questionsCollection().add({
    text: data.text,
    answer: data.answer || null,
    reference: data.reference || null,
    assignedTo: data.assignedTo || null,
    type: data.type || "classic",
    choices: data.choices || null,
    correctIndex: data.correctIndex != null ? data.correctIndex : null,
    items: data.items || null,
    options: data.options || null,
    correctIndices: data.correctIndices || null,
    progress: {},
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

export function updateQuestion(id, data) {
  if (!db) return;
  questionsCollection()
    .doc(id)
    .update({
      text: data.text,
      answer: data.answer || null,
      reference: data.reference || null,
      type: data.type || "classic",
      choices: data.choices || null,
      correctIndex: data.correctIndex != null ? data.correctIndex : null,
      items: data.items || null,
      options: data.options || null,
      correctIndices: data.correctIndices || null,
    });
}

export function updateQuestionAssignment(id, assignedTo) {
  if (!db) return;
  questionsCollection().doc(id).update({ assignedTo: assignedTo || null });
}

export function deleteQuestion(id) {
  if (!db) return;
  questionsCollection().doc(id).delete();
}

export function recordAnswer(id, userId, wasCorrect) {
  if (!db || !userId) return;
  const q = questions.find((q) => q.id === id);
  if (!q) return;
  const prev = (q.progress && q.progress[userId]) || { correctCount: 0, wrongCount: 0, needsReview: false };
  questionsCollection()
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
  questionsCollection().doc(id).update({ progress: {} });
}

// Clears one user's progress on every question (used by Setup's per-member
// "Reset Stats"). Other users' progress on the same questions is untouched.
export function resetUserProgress(userId) {
  if (!db) return;
  const affected = questions.filter((q) => q.progress && q.progress[userId]);
  if (affected.length === 0) return;
  const batch = db.batch();
  affected.forEach((q) => {
    batch.update(questionsCollection().doc(q.id), { [`progress.${userId}`]: firebase.firestore.FieldValue.delete() });
  });
  batch.commit();
}

if (getFamilyId()) {
  ready.then((firestoreDb) => {
    db = firestoreDb;
    questionsCollection().onSnapshot(
      (snapshot) => {
        questions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        notify();
      },
      (err) => console.error(err)
    );
  }).catch((err) => console.error(err));
}

// Tracks whether the family has "started" the default Daily Reading plan,
// and computes completed/missed-day stats since that start date.
//
// Doc shape: appState/dailyPlan = { startDate: "YYYY-MM-DD" } — its mere
// existence means the plan is "started". Stats are computed on demand
// (not stored) by scanning dailyReadingProgress docs from startDate through
// yesterday (today doesn't count as missed until the day is over).
import { ready } from "./firebase.js";
import { dateKey } from "./default-reading-plan.js";

let db = null;
let planState = null; // { startDate } | null
let planStats = null; // { completed, missed, missedDates, totalDays } | null
const listeners = new Set();

function notify() {
  listeners.forEach((cb) => cb({ planState, planStats }));
}

// Registers a callback for live updates, immediately invoked with the
// current state. Returns an unsubscribe function.
export function subscribePlanState(callback) {
  listeners.add(callback);
  callback({ planState, planStats });
  return () => listeners.delete(callback);
}

export function startPlan() {
  if (!db) return;
  db.collection("appState")
    .doc("dailyPlan")
    .set({ startDate: dateKey(new Date()) });
}

export function resetPlan() {
  if (!db) return;
  db.collection("appState").doc("dailyPlan").delete();
}

async function computeStats() {
  if (!db || !planState) {
    planStats = null;
    notify();
    return;
  }

  const start = planState.startDate;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const endKey = dateKey(yesterday);

  if (endKey < start) {
    // Plan started today (or in the future) — no elapsed days to judge yet.
    planStats = { completed: 0, missed: 0, missedDates: [], totalDays: 0 };
    notify();
    return;
  }

  try {
    const snapshot = await db
      .collection("dailyReadingProgress")
      .where(firebase.firestore.FieldPath.documentId(), ">=", start)
      .where(firebase.firestore.FieldPath.documentId(), "<=", endKey)
      .get();

    const doneDates = new Set();
    snapshot.forEach((doc) => {
      const d = doc.data();
      if (d.read1 && d.read2 && d.read3) doneDates.add(doc.id);
    });

    const missedDates = [];
    const cursor = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${endKey}T00:00:00`);
    let totalDays = 0;
    while (cursor <= endDate) {
      totalDays++;
      const key = dateKey(cursor);
      if (!doneDates.has(key)) missedDates.push(key);
      cursor.setDate(cursor.getDate() + 1);
    }
    missedDates.reverse(); // most recent first — that's the useful catch-up order

    planStats = { completed: doneDates.size, missed: missedDates.length, missedDates, totalDays };
  } catch (err) {
    console.error(err);
  }
  notify();
}

// Call after any write to dailyReadingProgress that could change the stats
// (a toggle, Mark All Complete) so the numbers stay live without a
// dedicated Firestore listener on the whole collection.
export function refreshPlanStats() {
  computeStats();
}

ready
  .then((firestoreDb) => {
    db = firestoreDb;
    db.collection("appState")
      .doc("dailyPlan")
      .onSnapshot(
        (doc) => {
          planState = doc.exists ? doc.data() : null;
          computeStats();
        },
        (err) => console.error(err)
      );
  })
  .catch((err) => console.error(err));

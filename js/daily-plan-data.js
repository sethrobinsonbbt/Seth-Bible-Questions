// Tracks, per family member, whether they've "started" the default Daily
// Reading plan, and computes their own completed/missed-day stats since
// their own start date — reading progress is per-person, same as
// Questions and Memorize, not one shared family log.
//
// Doc shapes:
//   appState/dailyPlan = { [userId]: { startDate: "YYYY-MM-DD" } } — a
//     user having a key here means they've started the plan.
//   dailyReadingProgress/{dateKey} = { [userId]: { read1, read2, read3 } }
// Stats are computed on demand (not stored) by scanning
// dailyReadingProgress docs from a user's own startDate through yesterday.
import { ready } from "./firebase.js";
import { dateKey } from "./default-reading-plan.js";
import { getFamilyId, scopedCollection } from "./family.js";

let db = null;
let planStates = {}; // { [userId]: {startDate} }
let planStatsByUser = {}; // { [userId]: {completed, missed, missedDates, totalDays, currentStreak} }
const knownUserIds = new Set(); // users we've been asked to compute/keep stats for
const listeners = new Set();

function appStateCollection() {
  return scopedCollection(db, "appState");
}

function dailyReadingProgressCollection() {
  return scopedCollection(db, "dailyReadingProgress");
}

function notify() {
  listeners.forEach((cb) => cb({ planStates, planStatsByUser }));
}

// Registers a callback for live updates, immediately invoked with the
// current state. Both maps are keyed by user id — pick out whichever
// user's slice you need (planStates[userId], planStatsByUser[userId]).
// Returns an unsubscribe function.
export function subscribePlanState(callback) {
  listeners.add(callback);
  callback({ planStates, planStatsByUser });
  return () => listeners.delete(callback);
}

export function startPlan(userId) {
  if (!db || !userId) return;
  appStateCollection()
    .doc("dailyPlan")
    .set({ [userId]: { startDate: dateKey(new Date()) } }, { merge: true });
}

export function resetPlan(userId) {
  if (!db || !userId) return;
  appStateCollection()
    .doc("dailyPlan")
    .update({ [userId]: firebase.firestore.FieldValue.delete() });
}

// Marks one of a day's three readings done for one user — used by the
// Bible page's "Mark as Read" button (see bible-reader.js) as well as
// the Reading Plan page's own per-reading toggle.
export function markDailyReadingDone(dateKeyStr, index, userId) {
  if (!db || !userId) return;
  const field = `read${index + 1}`;
  dailyReadingProgressCollection()
    .doc(dateKeyStr)
    .set({ [userId]: { [field]: true } }, { merge: true })
    .then(() => refreshPlanStats(userId));
}

// Reads today's own progress doc directly (it's outside the start..yesterday
// range everything else scans, since "today" isn't finalized as missed or
// completed until the day is over).
async function isTodayDone(userId) {
  const todayKey = dateKey(new Date());
  const doc = await dailyReadingProgressCollection().doc(todayKey).get();
  const d = (doc.exists && doc.data()[userId]) || {};
  return !!(d.read1 && d.read2 && d.read3);
}

async function computeStatsFor(userId) {
  const state = planStates[userId];
  if (!db || !state) {
    delete planStatsByUser[userId];
    notify();
    return;
  }

  const start = state.startDate;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const endKey = dateKey(yesterday);

  try {
    const todayDone = await isTodayDone(userId);

    if (endKey < start) {
      // Plan started today (or in the future) — no elapsed days to judge yet.
      planStatsByUser[userId] = { completed: 0, missed: 0, missedDates: [], totalDays: 0, currentStreak: todayDone ? 1 : 0 };
      notify();
      return;
    }

    const snapshot = await dailyReadingProgressCollection()
      .where(firebase.firestore.FieldPath.documentId(), ">=", start)
      .where(firebase.firestore.FieldPath.documentId(), "<=", endKey)
      .get();

    const doneDates = new Set();
    snapshot.forEach((doc) => {
      const d = (doc.data() || {})[userId];
      if (d && d.read1 && d.read2 && d.read3) doneDates.add(doc.id);
    });

    const missedDates = [];
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${endKey}T00:00:00`);
    let totalDays = 0;
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      totalDays++;
      const key = dateKey(cursor);
      if (!doneDates.has(key)) missedDates.push(key);
      cursor.setDate(cursor.getDate() + 1);
    }
    missedDates.reverse(); // most recent first — that's the useful catch-up order

    // Current streak: consecutive completed days walking back from
    // yesterday (today doesn't break a streak just by not being finished
    // yet), plus one more if today is *also* already done.
    let currentStreak = 0;
    const streakCursor = new Date(endDate);
    while (streakCursor >= startDate) {
      const key = dateKey(streakCursor);
      if (!doneDates.has(key)) break;
      currentStreak++;
      streakCursor.setDate(streakCursor.getDate() - 1);
    }
    if (todayDone) currentStreak++;

    planStatsByUser[userId] = { completed: doneDates.size, missed: missedDates.length, missedDates, totalDays, currentStreak };
  } catch (err) {
    console.error(err);
  }
  notify();
}

// Call after any write for this user that could change their stats (a
// toggle, Mark All Complete) — also doubles as "warm up this user's
// stats" for anywhere that needs them but hasn't asked before (Setup's
// Family Members list, or switching the active user on the Reading Plan
// page), since it's cheap to just recompute on request.
export function refreshPlanStats(userId) {
  if (!userId) return;
  knownUserIds.add(userId);
  computeStatsFor(userId);
}

if (getFamilyId()) {
  ready
    .then((firestoreDb) => {
      db = firestoreDb;
      appStateCollection()
        .doc("dailyPlan")
        .onSnapshot(
          (doc) => {
            planStates = doc.exists ? doc.data() || {} : {};
            notify();
            knownUserIds.forEach((userId) => computeStatsFor(userId));
          },
          (err) => console.error(err)
        );
    })
    .catch((err) => console.error(err));
}

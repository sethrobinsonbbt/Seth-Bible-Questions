// "prayerLists" Firestore collection: state + CRUD + the rotation logic
// behind the Prayer List section (prayer.js).
//
// Every list belongs to one family member (`ownerId`, a users doc id) —
// whoever's picked in the header's User dropdown sees and checks off only
// their own lists.
//
// Doc shape: {
//   ownerId, name, kind,           // kind: "people" | "thankful" | "goals" | "custom" (just sets the icon)
//   items: [string, ...],          // the things to pray for, in rotation order
//   slots: ["morning"|"afternoon"|"evening", ...],
//   days: [0..6, ...],             // 0 = Sunday, like Date#getDay()
//   perPrayer: number,             // how many items per prayer; 0 = all of them, every time
//   position: number,              // index of the first item in the current (not yet finished) batch
//   checked: [string, ...],        // items in the current batch checked off so far
//   done: { "YYYY-MM-DD|slot": [string, ...] }, // batches finished today, per prayer time
//   createdAt,
// }
//
// Rotation: each scheduled prayer time shows the next `perPrayer` items
// starting at `position`. They stay there — day after day if need be —
// until every one is checked off. Finishing the batch records it under
// today's prayer time in `done` (so that prayer shows "Done ✓" for the rest
// of the day) and moves `position` past it, so the NEXT scheduled prayer
// time picks up with the next items on the list.
import { ready } from "./firebase.js";
import { getFamilyId, scopedCollection } from "./family.js";

export const SLOTS = [
  { id: "morning", label: "Morning", icon: "🌅" },
  { id: "afternoon", label: "Afternoon", icon: "☀️" },
  { id: "evening", label: "Evening", icon: "🌙" },
];

export const KINDS = [
  { id: "people", label: "People", icon: "🙏" },
  { id: "thankful", label: "Thankful For", icon: "💛" },
  { id: "goals", label: "Goals", icon: "🎯" },
  { id: "custom", label: "Other", icon: "📝" },
];

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let db = null;
let lists = [];
const listeners = new Set();

function collection() {
  return scopedCollection(db, "prayerLists");
}

function notify() {
  listeners.forEach((cb) => cb(lists));
}

export function subscribePrayerLists(callback) {
  listeners.add(callback);
  callback(lists);
  return () => listeners.delete(callback);
}

// Local-time date key, so "today" flips at the family's midnight, not UTC's.
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function slotForTime(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export function isScheduled(list, slotId, date = new Date()) {
  return (list.slots || []).includes(slotId) && (list.days || []).includes(date.getDay());
}

// The items to pray for at this prayer time right now, plus whether
// they're already finished for today. Doesn't write anything.
export function batchFor(list, slotId, date = new Date()) {
  const items = list.items || [];
  const sessionKey = `${todayKey(date)}|${slotId}`;
  const done = (list.done || {})[sessionKey];
  if (done) return { items: done, checked: done, finished: true, sessionKey };
  if (items.length === 0) return { items: [], checked: [], finished: false, sessionKey };

  const count = list.perPrayer > 0 ? Math.min(list.perPrayer, items.length) : items.length;
  const start = list.perPrayer > 0 ? (list.position || 0) % items.length : 0;
  const batch = [];
  for (let i = 0; i < count; i++) batch.push(items[(start + i) % items.length]);
  const checked = (list.checked || []).filter((t) => batch.includes(t));
  return { items: batch, checked, finished: false, sessionKey };
}

// Keeps only today's entries in `done` so the doc doesn't grow forever.
function prunedDone(done, date) {
  const today = todayKey(date);
  const out = {};
  Object.keys(done || {}).forEach((k) => {
    if (k.startsWith(today + "|")) out[k] = done[k];
  });
  return out;
}

// Checks or unchecks one item at this prayer time. Finishing the batch
// advances the rotation; unchecking an item of an already-finished batch
// re-opens it (and steps the rotation back), for an accidental tap.
export function toggleItem(list, slotId, itemText, date = new Date()) {
  if (!db) return;
  const batch = batchFor(list, slotId, date);
  const items = list.items || [];
  const done = prunedDone(list.done, date);
  const rotates = list.perPrayer > 0 && items.length > 0;

  if (batch.finished) {
    delete done[batch.sessionKey];
    const position = rotates
      ? (((list.position || 0) - batch.items.length) % items.length + items.length) % items.length
      : 0;
    collection().doc(list.id).update({
      done,
      position,
      checked: batch.items.filter((t) => t !== itemText),
    });
    return;
  }

  const checked = batch.checked.includes(itemText)
    ? batch.checked.filter((t) => t !== itemText)
    : [...batch.checked, itemText];

  if (batch.items.length > 0 && batch.items.every((t) => checked.includes(t))) {
    done[batch.sessionKey] = batch.items;
    collection().doc(list.id).update({
      done,
      checked: [],
      position: rotates ? ((list.position || 0) + batch.items.length) % items.length : 0,
    });
  } else {
    collection().doc(list.id).update({ checked, done });
  }
}

export function addPrayerList(data) {
  if (!db) return;
  collection().add({
    ownerId: data.ownerId,
    name: data.name,
    kind: data.kind || "custom",
    items: data.items || [],
    slots: data.slots || [],
    days: data.days || [],
    perPrayer: data.perPrayer || 0,
    position: 0,
    checked: [],
    done: {},
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// Editing the items keeps the rotation where it was when possible: it
// re-finds the item that was next up, so adding names to the end of the
// list doesn't make anyone get skipped or repeated.
export function updatePrayerList(list, data) {
  if (!db) return;
  const oldItems = list.items || [];
  const nextUp = oldItems.length ? oldItems[(list.position || 0) % oldItems.length] : null;
  const newItems = data.items || [];
  let position = nextUp != null ? newItems.indexOf(nextUp) : 0;
  if (position < 0) position = newItems.length ? (list.position || 0) % newItems.length : 0;
  collection().doc(list.id).update({
    name: data.name,
    kind: data.kind || "custom",
    items: newItems,
    slots: data.slots || [],
    days: data.days || [],
    perPrayer: data.perPrayer || 0,
    position,
    checked: (list.checked || []).filter((t) => newItems.includes(t)),
  });
}

export function deletePrayerList(id) {
  if (!db) return;
  collection().doc(id).delete();
}

if (getFamilyId()) {
  ready
    .then((firestoreDb) => {
      db = firestoreDb;
      collection().onSnapshot(
        (snapshot) => {
          lists = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          notify();
        },
        (err) => console.error(err)
      );
    })
    .catch((err) => console.error(err));
}

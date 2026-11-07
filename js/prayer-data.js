// "prayerLists" Firestore collection: state + CRUD + the rotation logic
// behind the Prayer List section (prayer.js).
//
// Every list belongs to one family member (`ownerId`, a users doc id) —
// whoever's picked in the header's User dropdown sees and checks off only
// their own lists.
//
// Doc shape: {
//   ownerId, name,
//   kind,                          // "people" | "thankful" | "goals" | "custom" — which tab it's under
//   items: [{ id, name, note }],   // the things to pray for, in rotation order; `note` is the optional
//                                  // "what to pray for about them". (Lists made before notes existed
//                                  // stored plain strings — normalizeItems() reads those as
//                                  // { id: text, name: text, note: "" }, so old check-offs still match.)
//   slots: ["morning"|"afternoon"|"evening", ...],
//   days: [0..6, ...],             // 0 = Sunday, like Date#getDay()
//   perPrayer: number,             // how many items per prayer; 0 = all of them, every time
//   position: number,              // index of the first item in the current (not yet finished) batch
//   checked: [itemId, ...],        // items in the current batch checked off so far
//   done: { "YYYY-MM-DD|slot": [itemId, ...] }, // batches finished today, per prayer time
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

// `tab` is the short tab label; `item`/`note` label the add-item form.
// `itemEg`/`noteEg` are placeholder examples in the add form's boxes.
// `perPrayer` is the default "how many each prayer" for a new list.
export const KINDS = [
  { id: "people", label: "People", tab: "People", icon: "🙏", item: "Name", note: "What to pray about for them", itemEg: "Name — e.g. Sister Judy", noteEg: "What to pray about — e.g. Physical well-being and dementia", perPrayer: 3 },
  { id: "thankful", label: "Thankful For", tab: "Thankful", icon: "💛", item: "Something you're thankful for", note: "Details", itemEg: "Thankful for — e.g. Our church family", noteEg: "Details (optional)", perPrayer: 0 },
  { id: "goals", label: "Goals", tab: "Goals", icon: "🎯", item: "Goal", note: "Details", itemEg: "Goal — e.g. Read the Bible every day", noteEg: "Details (optional)", perPrayer: 0 },
  { id: "custom", label: "Other", tab: "Other", icon: "📝", item: "Something to pray about", note: "Details", itemEg: "e.g. Our nation's leaders", noteEg: "What to pray about (optional)", perPrayer: 0 },
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

export function normalizeItems(list) {
  return (list.items || []).map((it) =>
    typeof it === "string" ? { id: it, name: it, note: "" } : { id: it.id, name: it.name || "", note: it.note || "" }
  );
}

function newItemId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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

// The items to pray for at this prayer time right now (item objects), the
// ids checked off so far, and whether they're already finished for today.
// Doesn't write anything.
export function batchFor(list, slotId, date = new Date()) {
  const items = normalizeItems(list);
  const sessionKey = `${todayKey(date)}|${slotId}`;
  const doneIds = (list.done || {})[sessionKey];
  if (doneIds) {
    const doneItems = doneIds.map((id) => items.find((it) => it.id === id)).filter(Boolean);
    return { items: doneItems, checked: doneIds, finished: true, sessionKey };
  }
  if (items.length === 0) return { items: [], checked: [], finished: false, sessionKey };

  const count = list.perPrayer > 0 ? Math.min(list.perPrayer, items.length) : items.length;
  const start = list.perPrayer > 0 ? (list.position || 0) % items.length : 0;
  const batch = [];
  for (let i = 0; i < count; i++) batch.push(items[(start + i) % items.length]);
  const batchIds = batch.map((it) => it.id);
  const checked = (list.checked || []).filter((id) => batchIds.includes(id));
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
export function toggleItem(list, slotId, itemId, date = new Date()) {
  if (!db) return;
  const batch = batchFor(list, slotId, date);
  const items = normalizeItems(list);
  const done = prunedDone(list.done, date);
  const rotates = list.perPrayer > 0 && items.length > 0;
  const batchIds = batch.items.map((it) => it.id);

  if (batch.finished) {
    delete done[batch.sessionKey];
    const position = rotates
      ? ((((list.position || 0) - batchIds.length) % items.length) + items.length) % items.length
      : 0;
    collection().doc(list.id).update({ done, position, checked: batchIds.filter((id) => id !== itemId) });
    return;
  }

  const checked = batch.checked.includes(itemId)
    ? batch.checked.filter((id) => id !== itemId)
    : [...batch.checked, itemId];

  if (batchIds.length > 0 && batchIds.every((id) => checked.includes(id))) {
    done[batch.sessionKey] = batchIds;
    collection().doc(list.id).update({
      done,
      checked: [],
      position: rotates ? ((list.position || 0) + batchIds.length) % items.length : 0,
    });
  } else {
    collection().doc(list.id).update({ checked, done });
  }
}

// ---------- Lists ----------

export function addPrayerList(data) {
  if (!db) return;
  collection().add({
    ownerId: data.ownerId,
    name: data.name,
    kind: data.kind || "custom",
    items: (data.items || []).map((it) => ({ id: newItemId(), name: it.name, note: it.note || "" })),
    slots: data.slots || [],
    days: data.days || [],
    perPrayer: data.perPrayer || 0,
    position: 0,
    checked: [],
    done: {},
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// Name + schedule only — items are managed one at a time below.
export function updatePrayerListSettings(list, data) {
  if (!db) return;
  collection().doc(list.id).update({
    name: data.name,
    slots: data.slots || [],
    days: data.days || [],
    perPrayer: data.perPrayer || 0,
  });
}

export function deletePrayerList(id) {
  if (!db) return;
  collection().doc(id).delete();
}

// ---------- Items ----------

// New items go at the end of the list, so whoever's next up stays next up.
export function addItem(list, { name, note }) {
  if (!db) return;
  const items = normalizeItems(list);
  items.push({ id: newItemId(), name, note: note || "" });
  collection().doc(list.id).update({ items });
}

export function updateItem(list, itemId, { name, note }) {
  if (!db) return;
  const items = normalizeItems(list).map((it) => (it.id === itemId ? { ...it, name, note: note || "" } : it));
  collection().doc(list.id).update({ items });
}

// Removing an item ahead of the rotation's place shifts the place back one,
// so nobody gets skipped.
export function removeItem(list, itemId) {
  if (!db) return;
  const items = normalizeItems(list);
  const idx = items.findIndex((it) => it.id === itemId);
  if (idx < 0) return;
  items.splice(idx, 1);
  let position = list.position || 0;
  if (idx < position) position -= 1;
  if (items.length === 0 || position >= items.length) position = 0;
  collection()
    .doc(list.id)
    .update({ items, position, checked: (list.checked || []).filter((id) => id !== itemId) });
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

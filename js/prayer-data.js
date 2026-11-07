// "prayerLists" Firestore collection: state + CRUD + the rotation logic
// behind the Prayer List section (prayer.js).
//
// Every list belongs to one family member (`ownerId`, a users doc id) —
// whoever's picked in the header's User dropdown sees and checks off only
// their own lists.
//
// Doc shape: {
//   ownerId, name,
//   kind,                          // a KINDS id below ("people", "praise", "thankful", ...) — which tab it's under,
//                                  // or "quick": the one-off "Just This Once" list (see below)
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
//
// Quick adds: each person has at most one kind "quick" list, fed by the
// Quick Add box under Start Praying. It's in every prayer (all times, all
// days), never rotates, and an item is deleted once it's been checked off
// and that prayer is closed — prayed for once, then gone.
import { ready } from "./firebase.js";
import { getFamilyId, scopedCollection } from "./family.js";

export const SLOTS = [
  { id: "morning", label: "Morning", icon: "🌅" },
  { id: "afternoon", label: "Afternoon", icon: "☀️" },
  { id: "evening", label: "Evening", icon: "🌙" },
];

// Which tab a list is filed under. People first, then the eight prayer
// categories (from "Prayer App 150 Reflections and 8 Categories.xlsx" —
// `prompt` and `scripture` are that sheet's example prompt and references,
// `topics` its "topics included"). `tab` is the short tab label;
// `item`/`note` label the add form, `itemEg`/`noteEg` are its placeholder
// examples, and `perPrayer` is the default "how many each prayer" for a
// new list (0 = all of them).
//
// `legacy` kinds no longer get a tab of their own unless someone already has
// a list there, so nothing saved is lost: "family" and "ecclesia" (folded
// into People) and "goals" / "custom" (🎯 Goals / 📝 Other, from before the
// eight categories).
export const KINDS = [
  // People also covers the sheet's "Family & Relationships" and "Ecclesia &
  // Others" categories — one list of everyone to pray for by name.
  { id: "people", label: "People", tab: "People", icon: "👥", item: "Name", note: "What to pray about for them",
    itemEg: "Name — e.g. Sister Judy", noteEg: "What to pray about — e.g. Physical well-being and dementia", perPrayer: 3,
    topics: "Family; marriage; children; friendships; reconciliation; brethren and sisters; illness; grief; loneliness; those struggling spiritually",
    prompt: "Pray by name for family, friends and your ecclesia, including their spiritual and practical needs.",
    scripture: "Ephesians 3:14–19; Ephesians 6:18; James 5:16" },
  { id: "praise", label: "Praise & Worship", tab: "Praise", icon: "🙌", item: "Something to praise God for", note: "Details",
    itemEg: "e.g. His faithfulness", noteEg: "Details (optional)", perPrayer: 0,
    topics: "God's character; creation; His name; His promises; Jesus Christ",
    prompt: "Praise God for His mercy, faithfulness, holiness, and the hope He has provided through Christ.",
    scripture: "Psalm 145:3; Psalm 103:1–5" },
  { id: "thankful", label: "Thanksgiving", tab: "Thanks", icon: "💛", item: "Something you're thankful for", note: "Details",
    itemEg: "e.g. Our church family", noteEg: "Details (optional)", perPrayer: 0,
    topics: "Daily blessings; answered prayers; family; salvation; fellowship",
    prompt: "Thank God for a specific blessing today and for something you usually take for granted.",
    scripture: "1 Thessalonians 5:18; Philippians 4:6" },
  { id: "growth", label: "Forgiveness & Spiritual Growth", tab: "Growth", icon: "🌱", item: "Something to work on", note: "Details",
    itemEg: "e.g. Patience with others", noteEg: "Details (optional)", perPrayer: 0,
    topics: "Repentance; temptation; humility; faith; wisdom; Christlike character",
    prompt: "Confess a particular shortcoming and ask for wisdom and strength to change your conduct.",
    scripture: "Psalm 51:10; Colossians 1:9–11" },
  { id: "guidance", label: "Guidance & Daily Life", tab: "Guidance", icon: "🧭", item: "Something you need guidance on", note: "Details",
    itemEg: "e.g. A decision at work", noteEg: "Details (optional)", perPrayer: 0,
    topics: "Decisions; work; finances; responsibilities; provision; stewardship",
    prompt: "Pray for discernment in a decision and for the willingness to act responsibly.",
    scripture: "James 1:5; Matthew 6:11" },
  { id: "trials", label: "Trials & Strength", tab: "Trials", icon: "🛡️", item: "A difficulty", note: "Details",
    itemEg: "e.g. Feeling discouraged", noteEg: "Details (optional)", perPrayer: 0,
    topics: "Suffering; discouragement; perseverance; uncertainty; trust in God's will",
    prompt: "Ask for faith and endurance in a present difficulty, while submitting the outcome to God.",
    scripture: "Romans 12:12; Luke 22:42" },
  { id: "kingdom", label: "God's Kingdom & Purpose", tab: "Kingdom", icon: "👑", item: "Something to pray for", note: "Details",
    itemEg: "e.g. Christ's return", noteEg: "Details (optional)", perPrayer: 0,
    topics: "Christ's return; resurrection; God's promises; nations; peace and righteousness",
    prompt: "Pray for Christ's return, the fulfillment of God's promises, and your readiness for the Kingdom.",
    scripture: "Matthew 6:10; Revelation 11:15" },
  { id: "family", label: "Family & Relationships", tab: "Family", icon: "🏠", item: "Who or what", note: "What to pray about",
    itemEg: "e.g. The kids", noteEg: "What to pray about (optional)", perPrayer: 0,
    topics: "Marriage; children; parenting; reconciliation; friendships",
    prompt: "Pray for patience, understanding, and spiritual growth within your family and relationships.",
    scripture: "Ephesians 3:14–19; Matthew 6:14–15", legacy: true },
  { id: "ecclesia", label: "Ecclesia & Others", tab: "Ecclesia", icon: "⛪", item: "Who or what", note: "What to pray about",
    itemEg: "e.g. Brother Tom", noteEg: "What to pray about (optional)", perPrayer: 3,
    topics: "Brethren and sisters; illness; grief; loneliness; preaching; those struggling spiritually",
    prompt: "Pray by name for someone in your ecclesia, including their spiritual and practical needs.",
    scripture: "Ephesians 6:18; James 5:16", legacy: true },
  { id: "goals", label: "Goals", tab: "Goals", icon: "🎯", item: "Goal", note: "Details",
    itemEg: "Goal — e.g. Read the Bible every day", noteEg: "Details (optional)", perPrayer: 0, legacy: true },
  { id: "custom", label: "Other", tab: "Other", icon: "📝", item: "Something to pray about", note: "Details",
    itemEg: "e.g. Our nation's leaders", noteEg: "What to pray about (optional)", perPrayer: 0, legacy: true },
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
  if (!db) return null;
  return collection().add({
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

// ---------- Quick adds ("Just This Once") ----------

export const QUICK_KIND = "quick";
let quickCreating = null; // { ownerId, pending: [{name, note}] } while the quick list's first add is in flight

export function addQuickItem(ownerId, { name, note }) {
  if (!db || !ownerId) return;
  const existing = lists.find((l) => l.ownerId === ownerId && l.kind === QUICK_KIND);
  if (existing) return addItem(existing, { name, note });
  // Two quick adds in a row before the new list shows up mustn't make two lists.
  if (quickCreating && quickCreating.ownerId === ownerId) {
    quickCreating.pending.push({ name, note });
    return;
  }
  quickCreating = { ownerId, pending: [] };
  const done = () => {
    const pending = quickCreating ? quickCreating.pending : [];
    quickCreating = null;
    const created = lists.find((l) => l.ownerId === ownerId && l.kind === QUICK_KIND);
    if (created && pending.length) {
      const items = normalizeItems(created);
      pending.forEach((p) => items.push({ id: newItemId(), name: p.name, note: p.note || "" }));
      collection().doc(created.id).update({ items });
    }
  };
  const ref = addPrayerList({
    ownerId,
    name: "Just This Once",
    kind: QUICK_KIND,
    items: [{ name, note }],
    slots: SLOTS.map((s) => s.id),
    days: [0, 1, 2, 3, 4, 5, 6],
    perPrayer: 0,
  });
  if (ref && ref.then) ref.then(() => setTimeout(done, 0), () => (quickCreating = null));
  else quickCreating = null;
}

// Quick items just toggle — no rotation, no "done" batches.
export function toggleQuickItem(list, itemId) {
  if (!db) return;
  const checked = (list.checked || []).includes(itemId)
    ? list.checked.filter((id) => id !== itemId)
    : [...(list.checked || []), itemId];
  collection().doc(list.id).update({ checked });
}

// Deletes every checked-off quick item. Called when a prayer is closed (and
// whenever the page shows with leftovers, e.g. the app was closed mid-prayer).
export function clearCheckedQuickItems(list) {
  if (!db) return;
  const checked = list.checked || [];
  if (checked.length === 0) return;
  const items = normalizeItems(list).filter((it) => !checked.includes(it.id));
  collection().doc(list.id).update({ items, checked: [], done: {} });
}

// ---------- Hidden reflections (family-wide) ----------
//
// appState/prayerReflections = { hidden: [reflectionId, ...] } — ids from
// prayer-quotes.js that anyone in the family has marked "Hide". They're
// skipped for everyone; restoring brings them all back.

let hiddenReflections = [];
const hiddenListeners = new Set();

function reflectionsDoc() {
  return scopedCollection(db, "appState").doc("prayerReflections");
}

export function subscribeHiddenReflections(callback) {
  hiddenListeners.add(callback);
  callback(hiddenReflections);
  return () => hiddenListeners.delete(callback);
}

export function hideReflection(id) {
  if (!db) return;
  reflectionsDoc().set({ hidden: firebase.firestore.FieldValue.arrayUnion(id) }, { merge: true });
}

export function unhideReflection(id) {
  if (!db) return;
  reflectionsDoc().set({ hidden: firebase.firestore.FieldValue.arrayRemove(id) }, { merge: true });
}

export function unhideAllReflections() {
  if (!db) return;
  reflectionsDoc().set({ hidden: [] }, { merge: true });
}

if (getFamilyId()) {
  ready
    .then((firestoreDb) => {
      db = firestoreDb;
      reflectionsDoc().onSnapshot(
        (doc) => {
          hiddenReflections = (doc.exists && doc.data().hidden) || [];
          hiddenListeners.forEach((cb) => cb(hiddenReflections));
        },
        (err) => console.error(err)
      );
    })
    .catch((err) => console.error(err));
}

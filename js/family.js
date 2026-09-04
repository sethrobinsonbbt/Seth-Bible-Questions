// Multi-family support: every family's data lives under its own
// families/{familyId} document, isolated from every other family by
// Firestore security rules (see README's Firestore setup section). The
// familyId itself is the shared secret — a long random code, so knowing
// it is what grants access, same soft-security model as the per-family
// Setup passcode below (see settings.js). There is no per-person login;
// anyone with the code can use that family's copy of the app, exactly
// like the pre-multi-family app worked for one family.
//
// families/{familyId} doc shape: { name, passcode, createdAt }.
import { ready } from "./firebase.js";

const FAMILY_ID_KEY = "bible-questions-family-id";

// A family's join code is an adjective + a noun + 4 digits (e.g.
// "SUNNYTIGER4823") rather than fully random characters — easier to
// remember, say over the phone, and type on a phone keyboard than the
// old scheme's random string. Displayed and matched in all-caps, same as
// before, so normalizeCode() below needs no changes; only newly created
// families get a code in this format — existing ones keep whatever they
// already have.
//
// Digits are chosen from the same restricted set as the old scheme (no
// 0/1, to avoid 0/O and 1/I confusion) since this is still read/typed by
// hand; the word lists are kept to short, common, easy-to-spell words for
// the same reason.
const CODE_DIGITS = "23456789";
const CODE_DIGIT_COUNT = 4;

const CODE_ADJECTIVES = [
  "Happy", "Sunny", "Brave", "Calm", "Bright", "Bold", "Swift", "Quiet",
  "Gentle", "Jolly", "Merry", "Lucky", "Mighty", "Noble", "Proud", "Quick",
  "Sharp", "Silly", "Smart", "Sturdy", "Trusty", "Vivid", "Warm", "Wild",
  "Wise", "Witty", "Zesty", "Cheerful", "Cozy", "Crisp", "Daring", "Eager",
  "Fancy", "Fearless", "Fresh", "Friendly", "Funky", "Glowing", "Golden",
  "Grand", "Great", "Handy", "Honest", "Humble", "Jazzy", "Keen", "Kind",
  "Lively", "Loyal", "Magic", "Mellow", "Nifty", "Peaceful", "Peppy",
  "Playful", "Plucky", "Radiant", "Ready", "Rosy", "Royal", "Rugged",
  "Sassy", "Scenic", "Serene", "Shiny", "Silent", "Sleek", "Snappy",
  "Solid", "Sparkly", "Speedy", "Spry", "Steady", "Stellar", "Sunlit",
  "Sweet", "Thrifty", "Tidy", "Tough", "Trim", "Vibrant", "Zippy",
];

const CODE_NOUNS = [
  "Tiger", "Eagle", "River", "Falcon", "Otter", "Panda", "Robin", "Comet",
  "Meadow", "Harbor", "Canyon", "Cedar", "Willow", "Maple", "Aspen",
  "Breeze", "Cloud", "Ember", "Forest", "Garden", "Glacier", "Grove",
  "Horizon", "Island", "Jungle", "Lagoon", "Lantern", "Meteor", "Mountain",
  "Oasis", "Orchard", "Pebble", "Prairie", "Rainbow", "Ridge", "Ripple",
  "Sparrow", "Summit", "Sunrise", "Sunset", "Thunder", "Trail", "Valley",
  "Voyage", "Wave", "Wren", "Beaver", "Dolphin", "Fox", "Heron", "Lynx",
  "Moose", "Osprey", "Puma", "Raccoon", "Salmon", "Stag", "Swan", "Turtle",
  "Whale", "Badger", "Bison", "Cardinal", "Crane", "Deer", "Dove", "Hawk",
  "Ibis", "Koala", "Lark", "Lion", "Owl", "Panther", "Phoenix", "Quail",
  "Rabbit", "Squirrel", "Wolf", "Zebra",
];

let familyInfo = null;
const listeners = new Set();

function notify() {
  listeners.forEach((cb) => cb(familyInfo));
}

export function getFamilyId() {
  try {
    return localStorage.getItem(FAMILY_ID_KEY) || null;
  } catch (e) {
    return null;
  }
}

export function setFamilyId(id) {
  try {
    if (id) localStorage.setItem(FAMILY_ID_KEY, id);
    else localStorage.removeItem(FAMILY_ID_KEY);
  } catch (e) {
    /* ignore */
  }
}

export function normalizeCode(raw) {
  return (raw || "")
    .toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function randomCode() {
  const adjective = CODE_ADJECTIVES[Math.floor(Math.random() * CODE_ADJECTIVES.length)];
  const noun = CODE_NOUNS[Math.floor(Math.random() * CODE_NOUNS.length)];
  let digits = "";
  for (let i = 0; i < CODE_DIGIT_COUNT; i++) {
    digits += CODE_DIGITS[Math.floor(Math.random() * CODE_DIGITS.length)];
  }
  return (adjective + noun + digits).toUpperCase();
}

// Returns a scoped CollectionReference for `name` under the current
// family — use this everywhere a data module used to call
// db.collection(name) directly.
export function scopedCollection(db, name) {
  return db.collection("families").doc(getFamilyId()).collection(name);
}

// Generates a fresh, collision-checked code and creates the family doc.
// Sets it as the active family on success (does not reload the page —
// callers should do that once ready, so every data module's onSnapshot
// wiring starts fresh against the new family).
export async function createFamily(db, name, passcode) {
  let id;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomCode();
    const doc = await db.collection("families").doc(candidate).get();
    if (!doc.exists) {
      id = candidate;
      break;
    }
  }
  if (!id) throw new Error("Couldn't generate a unique family code — please try again.");

  await db.collection("families").doc(id).set({
    name,
    passcode,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  setFamilyId(id);
  return id;
}

// Every subcollection that actually lives under families/{familyId}/... —
// kept in sync with each data module's own scopedCollection(db, "...")
// calls. Used only by changeFamilyCode below to copy a family's data
// forward onto its new code.
const SCOPED_COLLECTION_NAMES = [
  "users",
  "questions",
  "memoryVerses",
  "verseCategories",
  "readingPlans",
  "dailyReadingProgress",
  "appState",
];

// Moves the current family onto a new join code someone picked themselves
// (rather than createFamily's random one) — e.g. switching to something
// more memorable. Copies the family doc (name/passcode) and every document
// in every subcollection onto families/{newCode}, then switches this
// device over. The OLD family and its data are left in place, untouched —
// same "copy forward, don't delete" precedent as settings.js's legacy-data
// migration — since deleting a Firestore subcollection recursively isn't a
// single client-side call, and there's no harm in an orphaned old family
// hanging around. Every OTHER device sharing this family keeps using the
// old code until someone manually updates them with the new one — that's
// an unavoidable consequence of changing a shared secret, same as changing
// a WiFi password. Does not reload the page — callers should do that.
export async function changeFamilyCode(db, newCodeRaw) {
  const newCode = normalizeCode(newCodeRaw);
  if (!newCode) return { ok: false, error: "Enter a new code." };
  const oldId = getFamilyId();
  if (!oldId) return { ok: false, error: "No current family to change." };
  if (newCode === oldId) return { ok: false, error: "That's already this family's code." };

  const newDocRef = db.collection("families").doc(newCode);
  const alreadyTaken = await newDocRef.get();
  if (alreadyTaken.exists) {
    return { ok: false, error: "That code is already taken by another family — try a different one." };
  }

  const oldDocRef = db.collection("families").doc(oldId);
  const oldDoc = await oldDocRef.get();
  if (!oldDoc.exists) return { ok: false, error: "Couldn't find this family's current data." };

  await newDocRef.set(oldDoc.data());

  for (const name of SCOPED_COLLECTION_NAMES) {
    const docs = (await oldDocRef.collection(name).get()).docs;
    // Firestore batches cap at 500 writes; chunk generously under that.
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach((doc) => {
        batch.set(newDocRef.collection(name).doc(doc.id), doc.data());
      });
      await batch.commit();
    }
  }

  setFamilyId(newCode);
  return { ok: true, newCode };
}

// Verifies a code matches an existing family before joining.
export async function joinFamily(db, rawCode) {
  const id = normalizeCode(rawCode);
  if (id.length === 0) return { ok: false, error: "Enter a family code." };
  const doc = await db.collection("families").doc(id).get();
  if (!doc.exists) {
    return { ok: false, error: "That code doesn't match a family — double-check it and try again." };
  }
  setFamilyId(id);
  return { ok: true };
}

// Registers a callback for live updates to the current family's info
// (name, passcode), immediately invoked with the current value. Returns
// an unsubscribe function. Only meaningful once a familyId is set.
export function subscribeFamilyInfo(callback) {
  listeners.add(callback);
  callback(familyInfo);
  return () => listeners.delete(callback);
}

export function updateFamilyPasscode(db, passcode) {
  const familyId = getFamilyId();
  if (!db || !familyId) return;
  db.collection("families").doc(familyId).update({ passcode });
}

// ---------- "Forgot the code?" ----------
// A requester who's lost their family's code has no families/{familyId}
// to write under, so these live in their own top-level collection
// instead. Matching a request back to a family is just a casual name
// comparison (not unique, not a security boundary) — the family's own
// owner sees anything that looks like theirs in Setup and reaches out
// themselves; there's no automated emailing or texting here.
function nameMatchKey(name) {
  return (name || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

export function requestCodeReminder(db, familyNameHint, contact) {
  if (!db) return Promise.reject(new Error("Not connected yet — check your internet connection and try again."));
  return db.collection("codeRequests").add({
    familyNameHint: familyNameHint.trim(),
    contact: contact.trim(),
    requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

// Registers a callback for live updates to the requests matching
// `familyName`, immediately invoked with the current list. Returns an
// unsubscribe function.
export function subscribeCodeRequests(db, familyName, callback) {
  if (!db) return () => {};
  const key = nameMatchKey(familyName);
  return db.collection("codeRequests").onSnapshot(
    (snapshot) => {
      const matches = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((r) => nameMatchKey(r.familyNameHint) === key);
      callback(matches);
    },
    (err) => console.error(err)
  );
}

export function dismissCodeRequest(db, requestId) {
  if (!db) return;
  db.collection("codeRequests").doc(requestId).delete();
}

// Synchronous reads of the currently-loaded family info (populated by the
// onSnapshot listener below, same pattern as active-user.js) — used by
// the Setup passcode gates, which need a plain equality check, not a
// subscription.
export function getFamilyName() {
  return familyInfo ? familyInfo.name : null;
}

export function getFamilyPasscode() {
  return familyInfo ? familyInfo.passcode : null;
}

if (getFamilyId()) {
  ready
    .then((db) => {
      db.collection("families")
        .doc(getFamilyId())
        .onSnapshot(
          (doc) => {
            familyInfo = doc.exists ? doc.data() : null;
            notify();
          },
          (err) => console.error(err)
        );
    })
    .catch((err) => console.error(err));
}

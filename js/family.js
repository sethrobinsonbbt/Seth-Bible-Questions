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

// Characters chosen to avoid visual ambiguity (no 0/O, 1/I/L) since
// families share this code out loud or by text message.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

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
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
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

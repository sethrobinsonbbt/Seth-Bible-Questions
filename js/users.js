// Shared "users" (family members) Firestore collection: state + CRUD,
// used by the Questions tabs, the Memorize section's "who's memorizing"
// picker, and the Settings page's member management. Scoped under the
// current family (see family.js) — every family has its own users list.
import { ready } from "./firebase.js";
import { getFamilyId, scopedCollection } from "./family.js";

let db = null;
let users = []; // [{id, name, ageGroups: [id,...]}]
const listeners = new Set();

function notify() {
  listeners.forEach((cb) => cb(users));
}

function usersCollection() {
  return scopedCollection(db, "users");
}

// Registers a callback for live updates, immediately invoked with the
// current list. Returns an unsubscribe function.
export function subscribeUsers(callback) {
  listeners.add(callback);
  callback(users);
  return () => listeners.delete(callback);
}

export function getUsers() {
  return users;
}

export function addUser(name, ageGroups) {
  if (!db) return;
  usersCollection().add({
    name,
    ageGroups: ageGroups || [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

export function updateUser(id, name, ageGroups) {
  if (!db) return;
  usersCollection().doc(id).update({ name, ageGroups: ageGroups || [] });
}

export function deleteUser(id) {
  if (!db) return;
  usersCollection().doc(id).delete();
}

// No family picked yet for this device (see family-gate.js) — nothing to
// subscribe to until one is; a page reload after joining/creating a
// family re-runs this module fresh.
if (getFamilyId()) {
  ready
    .then((firestoreDb) => {
      db = firestoreDb;
      usersCollection().onSnapshot(
        (snapshot) => {
          users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          notify();
        },
        (err) => console.error(err)
      );
    })
    .catch((err) => console.error(err));
}

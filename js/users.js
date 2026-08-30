// Shared "users" (family members) Firestore collection: state + CRUD,
// used by the Questions tabs, the Memorize section's "who's memorizing"
// picker, and the Settings page's member management.
import { ready } from "./firebase.js";

let db = null;
let users = []; // [{id, name, ageGroups: [id,...]}]
const listeners = new Set();

function notify() {
  listeners.forEach((cb) => cb(users));
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
  db.collection("users").add({
    name,
    ageGroups: ageGroups || [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

export function updateUser(id, name, ageGroups) {
  if (!db) return;
  db.collection("users").doc(id).update({ name, ageGroups: ageGroups || [] });
}

export function deleteUser(id) {
  if (!db) return;
  db.collection("users").doc(id).delete();
}

ready.then((firestoreDb) => {
  db = firestoreDb;
  db.collection("users").onSnapshot(
    (snapshot) => {
      users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      notify();
    },
    (err) => console.error(err)
  );
}).catch((err) => console.error(err));

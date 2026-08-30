// Shared Firebase bootstrapping. Other modules import `ready` (a promise that
// resolves with the Firestore db instance once config is valid and anonymous
// auth completes) and `getDb()` for synchronous access after that.

let db = null;
let resolveReady, rejectReady;

export const ready = new Promise((resolve, reject) => {
  resolveReady = resolve;
  rejectReady = reject;
});

export function isConfigPlaceholder() {
  const cfg = window.FIREBASE_CONFIG || {};
  return !cfg.apiKey || cfg.apiKey === "YOUR_API_KEY";
}

export function getDb() {
  return db;
}

// onStatus(status, err?) is called with: "not-configured" | "connecting" | "synced" | "error"
export function initFirebase(onStatus) {
  if (isConfigPlaceholder()) {
    onStatus("not-configured");
    return;
  }

  try {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.firestore();
    onStatus("connecting");

    // Silent anonymous sign-in so Firestore isn't wide open to the public
    // internet, without requiring an actual login screen. See README.md.
    firebase
      .auth()
      .signInAnonymously()
      .catch((err) => {
        console.error(err);
        onStatus("error", err);
        rejectReady(err);
      });

    firebase.auth().onAuthStateChanged((user) => {
      if (!user) return;
      onStatus("synced");
      resolveReady(db);
    });
  } catch (err) {
    console.error(err);
    onStatus("error", err);
    rejectReady(err);
  }
}

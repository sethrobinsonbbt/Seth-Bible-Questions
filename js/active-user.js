// The single "who's using this device right now" selection, shown at the
// top of every section (see main.js) and shared by anything that tracks
// per-person progress: Questions (whose quiz you're taking), Memorize
// (whose practice attempts get recorded), and the Bible page's M+ button.
// Persisted per device so it's remembered the next time the app opens.
const ACTIVE_USER_KEY = "bible-questions-active-user";

let activeUserId = load();
const listeners = new Set();

function load() {
  try {
    return localStorage.getItem(ACTIVE_USER_KEY) || null;
  } catch (e) {
    return null;
  }
}

function save(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_USER_KEY, id);
    else localStorage.removeItem(ACTIVE_USER_KEY);
  } catch (e) {
    /* ignore */
  }
}

export function getActiveUser() {
  return activeUserId;
}

export function setActiveUser(id) {
  activeUserId = id || null;
  save(activeUserId);
  listeners.forEach((cb) => cb(activeUserId));
}

// Registers a callback for changes, immediately invoked with the current
// value. Returns an unsubscribe function.
export function subscribeActiveUser(callback) {
  listeners.add(callback);
  callback(activeUserId);
  return () => listeners.delete(callback);
}

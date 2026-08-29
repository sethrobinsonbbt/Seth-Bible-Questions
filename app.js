// Bible Questions app
// Data model: Firestore collection "questions", each doc:
//   { text: string, assignedTo: "asher" | "ollie" | "parents" | null, createdAt }
// assignedTo === null means the question sits in the shared "Library" (unassigned).

const PEOPLE = [
  { id: "asher", label: "Asher" },
  { id: "ollie", label: "Ollie" },
  { id: "parents", label: "Parents" },
];
const LIBRARY_TAB = { id: "library", label: "Library" };
const TABS = [...PEOPLE, LIBRARY_TAB];

let activeTab = TABS[0].id;
let allQuestions = []; // [{id, text, assignedTo}]
let editingId = null;
let lastRandomId = null;
let db = null;

const el = (id) => document.getElementById(id);

function personLabel(id) {
  const p = PEOPLE.find((p) => p.id === id);
  return p ? p.label : id;
}

// ---------- Firebase setup ----------

function isConfigPlaceholder() {
  const cfg = window.FIREBASE_CONFIG || {};
  return !cfg.apiKey || cfg.apiKey === "YOUR_API_KEY";
}

function initFirebase() {
  const statusEl = el("connection-status");
  const bannerEl = el("setup-banner");

  if (isConfigPlaceholder()) {
    bannerEl.hidden = false;
    statusEl.hidden = false;
    statusEl.textContent = "Not configured";
    return;
  }

  try {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.firestore();
    statusEl.hidden = false;
    statusEl.textContent = "Connecting…";

    // Silent anonymous sign-in so the Firestore data isn't wide open to the
    // public internet, without requiring an actual login screen. See README.md.
    firebase
      .auth()
      .signInAnonymously()
      .catch((err) => {
        console.error(err);
        statusEl.textContent = "Auth error";
        statusEl.classList.remove("ok");
      });

    firebase.auth().onAuthStateChanged((user) => {
      if (!user) return;
      db.collection("questions").onSnapshot(
        (snapshot) => {
          allQuestions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          statusEl.textContent = "Synced";
          statusEl.classList.add("ok");
          render();
        },
        (err) => {
          console.error(err);
          statusEl.textContent = "Connection error";
          statusEl.classList.remove("ok");
        }
      );
    });
  } catch (err) {
    console.error(err);
    bannerEl.hidden = false;
    statusEl.hidden = false;
    statusEl.textContent = "Config error";
  }
}

// ---------- Firestore actions ----------

function addQuestion(text, assignedTo) {
  if (!db) return;
  db.collection("questions").add({
    text,
    assignedTo: assignedTo || null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function updateQuestionText(id, text) {
  if (!db) return;
  db.collection("questions").doc(id).update({ text });
}

function updateQuestionAssignment(id, assignedTo) {
  if (!db) return;
  db.collection("questions").doc(id).update({ assignedTo: assignedTo || null });
}

function deleteQuestion(id) {
  if (!db) return;
  db.collection("questions").doc(id).delete();
}

// ---------- Rendering ----------

function questionsForTab(tabId) {
  if (tabId === "library") return allQuestions.filter((q) => !q.assignedTo);
  return allQuestions.filter((q) => q.assignedTo === tabId);
}

function renderTabs() {
  const tabsEl = el("tabs");
  tabsEl.innerHTML = "";
  TABS.forEach((tab) => {
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (tab.id === activeTab ? " active" : "");
    btn.textContent = tab.label;
    btn.addEventListener("click", () => {
      activeTab = tab.id;
      editingId = null;
      lastRandomId = null;
      render();
    });
    tabsEl.appendChild(btn);
  });
}

function renderRandomCard(list) {
  const card = el("random-card");
  if (activeTab === "library" || list.length === 0) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  el("random-person").textContent = personLabel(activeTab);

  let pick = list[Math.floor(Math.random() * list.length)];
  if (list.length > 1 && lastRandomId) {
    let tries = 0;
    while (pick.id === lastRandomId && tries < 10) {
      pick = list[Math.floor(Math.random() * list.length)];
      tries++;
    }
  }
  lastRandomId = pick.id;
  el("random-text").textContent = pick.text;
}

function buildAssignSelect(currentValue) {
  const select = document.createElement("select");
  select.className = "assign-select";

  const libOpt = document.createElement("option");
  libOpt.value = "";
  libOpt.textContent = "Library (unassigned)";
  select.appendChild(libOpt);

  PEOPLE.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label;
    select.appendChild(opt);
  });

  select.value = currentValue || "";
  return select;
}

function renderList(list) {
  const listEl = el("question-list");
  const emptyEl = el("empty-state");
  listEl.innerHTML = "";

  el("list-title").textContent =
    activeTab === "library" ? "Library (unassigned)" : `${personLabel(activeTab)}'s Questions`;

  if (list.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  list.forEach((q) => {
    const li = document.createElement("li");
    li.className = "question-card";

    if (editingId === q.id) {
      const textarea = document.createElement("textarea");
      textarea.className = "edit-textarea";
      textarea.value = q.text;
      li.appendChild(textarea);

      const actions = document.createElement("div");
      actions.className = "question-row-actions";

      const saveBtn = document.createElement("button");
      saveBtn.className = "btn btn-primary btn-small";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => {
        const val = textarea.value.trim();
        if (val) updateQuestionText(q.id, val);
        editingId = null;
        render();
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-small";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        editingId = null;
        render();
      });

      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);
      li.appendChild(actions);
    } else {
      const p = document.createElement("p");
      p.className = "question-text";
      p.textContent = q.text;
      li.appendChild(p);

      const actions = document.createElement("div");
      actions.className = "question-row-actions";

      const assignSelect = buildAssignSelect(q.assignedTo);
      assignSelect.addEventListener("change", () => {
        updateQuestionAssignment(q.id, assignSelect.value);
      });
      actions.appendChild(assignSelect);

      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-small";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        editingId = q.id;
        render();
      });
      actions.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-danger btn-small";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        if (confirm("Delete this question?")) deleteQuestion(q.id);
      });
      actions.appendChild(deleteBtn);

      li.appendChild(actions);
    }

    listEl.appendChild(li);
  });
}

function render() {
  renderTabs();
  const list = questionsForTab(activeTab);
  renderRandomCard(list);
  renderList(list);
}

// ---------- Add/Edit modal ----------

function openAddModal() {
  el("modal-title").textContent = "Add Question";
  el("modal-text").value = "";

  const select = el("modal-assign");
  select.innerHTML = "";
  const libOpt = document.createElement("option");
  libOpt.value = "";
  libOpt.textContent = "Library (unassigned)";
  select.appendChild(libOpt);
  PEOPLE.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label;
    select.appendChild(opt);
  });
  select.value = activeTab === "library" ? "" : activeTab;

  el("modal-backdrop").hidden = false;
  el("modal-text").focus();
}

function closeModal() {
  el("modal-backdrop").hidden = true;
}

function setupModal() {
  el("add-question-btn").addEventListener("click", openAddModal);
  el("modal-cancel-btn").addEventListener("click", closeModal);
  el("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
  el("modal-save-btn").addEventListener("click", () => {
    const text = el("modal-text").value.trim();
    if (!text) return;
    const assignedTo = el("modal-assign").value || null;
    addQuestion(text, assignedTo);
    closeModal();
  });
}

// ---------- Init ----------

document.addEventListener("DOMContentLoaded", () => {
  setupModal();
  el("random-next-btn").addEventListener("click", () => {
    renderRandomCard(questionsForTab(activeTab));
  });
  render();
  initFirebase();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
});

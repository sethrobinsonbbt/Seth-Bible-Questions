// Custom Bible reading planner: pick a start chapter and an end chapter
// (can span multiple books, e.g. all of Judges, or 1 Samuel through 2 Kings
// for "the stories of the kings") and get a checklist to track progress.
import { ready } from "./firebase.js";
import { BOOKS, computeChapterSequence } from "./bible-data.js";

let db = null;
let plans = []; // [{id, name, startBook, startChapter, endBook, endChapter, chapters, progress}]
let activePlanId = null;
let refs = {};

function buildSkeleton(container) {
  container.innerHTML = `
    <div class="list-toolbar">
      <h2>Reading Plans</h2>
      <button id="new-plan-btn" class="btn btn-primary">+ New Plan</button>
    </div>
    <nav id="plan-tabs" class="tabs plan-tabs"></nav>
    <div id="plan-detail"></div>

    <div id="plan-modal-backdrop" class="modal-backdrop" hidden>
      <div class="modal">
        <h3>New Reading Plan</h3>
        <label for="plan-name-input">Plan name</label>
        <input id="plan-name-input" type="text" placeholder="e.g. Judges, or Kings of Israel" />

        <label for="plan-start-book">Start book</label>
        <select id="plan-start-book"></select>
        <label for="plan-start-chapter">Start chapter</label>
        <input id="plan-start-chapter" type="number" min="1" value="1" />

        <label for="plan-end-book">End book</label>
        <select id="plan-end-book"></select>
        <label for="plan-end-chapter">End chapter</label>
        <input id="plan-end-chapter" type="number" min="1" value="1" />

        <p id="plan-error" class="form-error" hidden></p>

        <div class="modal-actions">
          <button id="plan-cancel-btn" class="btn">Cancel</button>
          <button id="plan-save-btn" class="btn btn-primary">Create</button>
        </div>
      </div>
    </div>
  `;

  refs.tabs = container.querySelector("#plan-tabs");
  refs.detail = container.querySelector("#plan-detail");
  refs.modalBackdrop = container.querySelector("#plan-modal-backdrop");
  refs.nameInput = container.querySelector("#plan-name-input");
  refs.startBook = container.querySelector("#plan-start-book");
  refs.startChapter = container.querySelector("#plan-start-chapter");
  refs.endBook = container.querySelector("#plan-end-book");
  refs.endChapter = container.querySelector("#plan-end-chapter");
  refs.error = container.querySelector("#plan-error");

  [refs.startBook, refs.endBook].forEach((select) => {
    BOOKS.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.name;
      opt.textContent = b.name;
      select.appendChild(opt);
    });
  });

  container.querySelector("#new-plan-btn").addEventListener("click", openModal);
  container.querySelector("#plan-cancel-btn").addEventListener("click", closeModal);
  refs.modalBackdrop.addEventListener("click", (e) => {
    if (e.target === refs.modalBackdrop) closeModal();
  });
  container.querySelector("#plan-save-btn").addEventListener("click", savePlan);
}

function openModal() {
  refs.nameInput.value = "";
  refs.startBook.value = BOOKS[0].name;
  refs.startChapter.value = "1";
  refs.endBook.value = BOOKS[0].name;
  refs.endChapter.value = "1";
  refs.error.hidden = true;
  refs.modalBackdrop.hidden = false;
  refs.nameInput.focus();
}

function closeModal() {
  refs.modalBackdrop.hidden = true;
}

function savePlan() {
  const name = refs.nameInput.value.trim();
  const startBook = refs.startBook.value;
  const startChapter = Number(refs.startChapter.value);
  const endBook = refs.endBook.value;
  const endChapter = Number(refs.endChapter.value);

  if (!name) {
    refs.error.textContent = "Give the plan a name.";
    refs.error.hidden = false;
    return;
  }

  const chapters = computeChapterSequence(startBook, startChapter, endBook, endChapter);
  if (!chapters) {
    refs.error.textContent =
      "That's not a valid range — the end point needs to come after the start point in Bible order.";
    refs.error.hidden = false;
    return;
  }

  closeModal();

  if (!db) return;
  db.collection("readingPlans").add({
    name,
    startBook,
    startChapter,
    endBook,
    endChapter,
    chapters,
    progress: chapters.map(() => false),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function deletePlan(id) {
  if (!db) return;
  if (!confirm("Delete this reading plan?")) return;
  db.collection("readingPlans").doc(id).delete();
}

function toggleChapter(plan, index) {
  if (!db) return;
  const progress = plan.progress.slice();
  progress[index] = !progress[index];
  db.collection("readingPlans").doc(plan.id).update({ progress });
}

function navigateToChapter(book, chapter) {
  window.dispatchEvent(new CustomEvent("bible:navigate", { detail: { book, chapter } }));
}

function renderTabs() {
  refs.tabs.innerHTML = "";
  plans.forEach((plan) => {
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (plan.id === activePlanId ? " active" : "");
    btn.textContent = plan.name;
    btn.addEventListener("click", () => {
      activePlanId = plan.id;
      renderDetail();
      renderTabs();
    });
    refs.tabs.appendChild(btn);
  });
}

function renderDetail() {
  const plan = plans.find((p) => p.id === activePlanId);
  if (!plan) {
    refs.detail.innerHTML = `<p class="empty-state">No reading plans yet. Tap "+ New Plan" to make one — e.g. start at Judges 1 and end at Judges 21.</p>`;
    return;
  }

  const doneCount = plan.progress.filter(Boolean).length;
  const total = plan.chapters.length;

  refs.detail.innerHTML = `
    <div class="plan-header">
      <div>
        <strong>${escapeHtml(plan.name)}</strong>
        <div class="plan-range">${escapeHtml(plan.startBook)} ${plan.startChapter} — ${escapeHtml(plan.endBook)} ${plan.endChapter} · ${doneCount}/${total} read</div>
      </div>
      <button id="delete-plan-btn" class="btn btn-danger btn-small">Delete Plan</button>
    </div>
    <ul class="plan-checklist" id="plan-checklist"></ul>
  `;

  refs.detail.querySelector("#delete-plan-btn").addEventListener("click", () => deletePlan(plan.id));

  const listEl = refs.detail.querySelector("#plan-checklist");
  plan.chapters.forEach((ch, i) => {
    const li = document.createElement("li");
    li.className = "plan-row" + (plan.progress[i] ? " plan-row-done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!plan.progress[i];
    checkbox.addEventListener("change", () => toggleChapter(plan, i));

    const label = document.createElement("span");
    label.className = "plan-row-label";
    label.textContent = `${ch.book} ${ch.chapter}`;

    const readBtn = document.createElement("button");
    readBtn.className = "btn btn-small";
    readBtn.textContent = "Read";
    readBtn.addEventListener("click", () => navigateToChapter(ch.book, ch.chapter));

    li.appendChild(checkbox);
    li.appendChild(label);
    li.appendChild(readBtn);
    listEl.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function mountPlanner(container) {
  buildSkeleton(container);
  renderTabs();
  renderDetail();

  ready.then((firestoreDb) => {
    db = firestoreDb;
    db.collection("readingPlans").onSnapshot(
      (snapshot) => {
        plans = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        if (!activePlanId && plans.length > 0) activePlanId = plans[0].id;
        if (activePlanId && !plans.find((p) => p.id === activePlanId)) {
          activePlanId = plans.length > 0 ? plans[0].id : null;
        }
        renderTabs();
        renderDetail();
      },
      (err) => console.error(err)
    );
  });
}

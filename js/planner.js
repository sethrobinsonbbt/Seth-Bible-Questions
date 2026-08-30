// Custom Bible reading planner: pick a start chapter and an end chapter
// (can span multiple books, e.g. all of Judges, or 1 Samuel through 2 Kings
// for "the stories of the kings") and get a checklist to track progress.
import { ready } from "./firebase.js";
import { BOOKS, computeChapterSequence } from "./bible-data.js";
import { readingsForDate, parseReadingLabel, dateKey } from "./default-reading-plan.js";

let db = null;
let plans = []; // [{id, name, startBook, startChapter, endBook, endChapter, chapters, progress}]
let activePlanId = null;
let dailyDate = new Date();
let dailyProgress = { read1: false, read2: false, read3: false };
let dailyUnsub = null;
let refs = {};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAYS_IN_MONTH = [31,28,31,30,31,30,31,31,30,31,30,31];

function buildSkeleton(container) {
  container.innerHTML = `
    <div class="daily-reading-card">
      <div class="daily-reading-header">
        <button id="daily-prev-btn" class="nav-icon-btn" aria-label="Previous day">‹</button>
        <div class="daily-reading-date" id="daily-reading-date"></div>
        <button id="daily-next-btn" class="nav-icon-btn" aria-label="Next day">›</button>
      </div>
      <div class="daily-reading-picker">
        <select id="daily-month-select"></select>
        <select id="daily-day-select"></select>
      </div>
      <button id="daily-today-btn" class="btn btn-small" hidden>Jump to Today</button>
      <ul class="plan-checklist" id="daily-reading-list"></ul>
    </div>

    <div class="list-toolbar">
      <h2>Custom Reading Plans</h2>
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
        <select id="plan-start-chapter"></select>

        <label for="plan-end-book">End book</label>
        <select id="plan-end-book"></select>
        <label for="plan-end-chapter">End chapter</label>
        <select id="plan-end-chapter"></select>

        <p id="plan-error" class="form-error" hidden></p>

        <div class="modal-actions">
          <button id="plan-cancel-btn" class="btn">Cancel</button>
          <button id="plan-save-btn" class="btn btn-primary">Create</button>
        </div>
      </div>
    </div>
  `;

  refs.dailyPrevBtn = container.querySelector("#daily-prev-btn");
  refs.dailyNextBtn = container.querySelector("#daily-next-btn");
  refs.dailyDateLabel = container.querySelector("#daily-reading-date");
  refs.dailyTodayBtn = container.querySelector("#daily-today-btn");
  refs.dailyList = container.querySelector("#daily-reading-list");
  refs.dailyMonthSelect = container.querySelector("#daily-month-select");
  refs.dailyDaySelect = container.querySelector("#daily-day-select");

  refs.dailyPrevBtn.addEventListener("click", () => shiftDailyDate(-1));
  refs.dailyNextBtn.addEventListener("click", () => shiftDailyDate(1));
  refs.dailyTodayBtn.addEventListener("click", jumpToToday);

  MONTH_NAMES.forEach((name, i) => {
    const opt = document.createElement("option");
    opt.value = String(i + 1);
    opt.textContent = name;
    refs.dailyMonthSelect.appendChild(opt);
  });
  refs.dailyMonthSelect.addEventListener("change", () => {
    populateDaySelect(Number(refs.dailyMonthSelect.value));
    goToPickedDate();
  });
  refs.dailyDaySelect.addEventListener("change", goToPickedDate);

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

  refs.startBook.addEventListener("change", () => {
    populateChapterSelect(refs.startChapter, refs.startBook.value);
  });
  refs.endBook.addEventListener("change", () => {
    populateChapterSelect(refs.endChapter, refs.endBook.value);
  });

  container.querySelector("#new-plan-btn").addEventListener("click", openModal);
  container.querySelector("#plan-cancel-btn").addEventListener("click", closeModal);
  refs.modalBackdrop.addEventListener("click", (e) => {
    if (e.target === refs.modalBackdrop) closeModal();
  });
  container.querySelector("#plan-save-btn").addEventListener("click", savePlan);
}

function populateChapterSelect(select, bookName) {
  const book = BOOKS.find((b) => b.name === bookName);
  const count = book ? book.chapters : 1;
  const previous = select.value;
  select.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Chapter ${i}`;
    select.appendChild(opt);
  }
  select.value = previous && Number(previous) <= count ? previous : "1";
}

function openModal() {
  refs.nameInput.value = "";
  refs.startBook.value = BOOKS[0].name;
  refs.endBook.value = BOOKS[0].name;
  populateChapterSelect(refs.startChapter, refs.startBook.value);
  populateChapterSelect(refs.endChapter, refs.endBook.value);
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

// ---------- Daily reading (default plan, calendar-linked) ----------

function subscribeDaily(date) {
  if (dailyUnsub) {
    dailyUnsub();
    dailyUnsub = null;
  }
  if (!db) return;
  dailyUnsub = db
    .collection("dailyReadingProgress")
    .doc(dateKey(date))
    .onSnapshot(
      (doc) => {
        dailyProgress = doc.exists ? doc.data() : { read1: false, read2: false, read3: false };
        renderDaily();
      },
      (err) => console.error(err)
    );
}

function toggleDailyRead(index) {
  if (!db) return;
  const field = `read${index + 1}`;
  db.collection("dailyReadingProgress")
    .doc(dateKey(dailyDate))
    .set({ [field]: !dailyProgress[field] }, { merge: true });
}

function populateDaySelect(month) {
  const count = DAYS_IN_MONTH[month - 1];
  const previous = refs.dailyDaySelect.value;
  refs.dailyDaySelect.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = String(i);
    refs.dailyDaySelect.appendChild(opt);
  }
  refs.dailyDaySelect.value = previous && Number(previous) <= count ? previous : "1";
}

function goToPickedDate() {
  const month = Number(refs.dailyMonthSelect.value);
  const day = Number(refs.dailyDaySelect.value);
  const d = new Date(dailyDate);
  d.setMonth(month - 1, day);
  dailyDate = d;
  subscribeDaily(dailyDate);
  renderDaily();
}

function shiftDailyDate(delta) {
  const d = new Date(dailyDate);
  d.setDate(d.getDate() + delta);
  dailyDate = d;
  subscribeDaily(dailyDate);
  renderDaily();
}

function jumpToToday() {
  dailyDate = new Date();
  subscribeDaily(dailyDate);
  renderDaily();
}

function renderDaily() {
  const readings = readingsForDate(dailyDate);
  const isToday = dateKey(dailyDate) === dateKey(new Date());

  refs.dailyDateLabel.textContent =
    dailyDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
    (isToday ? " · Today" : "");
  refs.dailyTodayBtn.hidden = isToday;

  const month = dailyDate.getMonth() + 1;
  refs.dailyMonthSelect.value = String(month);
  populateDaySelect(month);
  refs.dailyDaySelect.value = String(dailyDate.getDate());

  refs.dailyList.innerHTML = "";
  if (!readings) return;

  readings.forEach((label, i) => {
    const li = document.createElement("li");
    const field = `read${i + 1}`;
    const done = !!dailyProgress[field];
    li.className = "plan-row" + (done ? " plan-row-done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = done;
    checkbox.addEventListener("change", () => toggleDailyRead(i));

    const labelEl = document.createElement("span");
    labelEl.className = "plan-row-label";
    labelEl.textContent = label;

    const readBtn = document.createElement("button");
    readBtn.className = "btn btn-small";
    readBtn.textContent = "Read";
    readBtn.addEventListener("click", () => {
      const chapters = parseReadingLabel(label);
      if (chapters.length > 0) navigateToChapter(chapters[0].book, chapters[0].chapter);
    });

    li.appendChild(checkbox);
    li.appendChild(labelEl);
    li.appendChild(readBtn);
    refs.dailyList.appendChild(li);
  });
}

export function mountPlanner(container) {
  buildSkeleton(container);
  renderTabs();
  renderDetail();
  renderDaily();

  ready.then((firestoreDb) => {
    db = firestoreDb;
    subscribeDaily(dailyDate);
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
  }).catch((err) => console.error(err));
}

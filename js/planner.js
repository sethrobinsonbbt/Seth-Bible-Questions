// Custom Bible reading planner: pick a start chapter and an end chapter
// (can span multiple books, e.g. all of Judges, or 1 Samuel through 2 Kings
// for "the stories of the kings") and get a checklist to track progress.
import { ready } from "./firebase.js";
import { BOOKS, computeChapterSequence } from "./bible-data.js";
import { readingsForDate, parseReadingLabel, dateKey } from "./default-reading-plan.js";
import { subscribePlanState, startPlan, resetPlan, refreshPlanStats } from "./daily-plan-data.js";
import { getActiveUser, subscribeActiveUser } from "./active-user.js";
import { scopedCollection } from "./family.js";

let db = null;
let plans = []; // [{id, name, startBook, startChapter, endBook, endChapter, chapters, progress: {[userId]: [bool,...]}}]
let activePlanId = null;
// Custom plans are managed on their own page (reached via the subtle
// "Change Plan" link) — the main Reading Plan page just shows whichever
// one is currently active, if any, below the daily reading card.
let managingPlans = false;
let dailyDate = new Date();
let dailyDocData = {}; // the raw dailyReadingProgress doc for `dailyDate`: {[userId]: {read1,read2,read3}}
let dailyUnsub = null;
let activeUserId = null;
let planStates = {}; // {[userId]: {startDate}} — from daily-plan-data.js
let planStatsByUser = {}; // {[userId]: stats} — from daily-plan-data.js
let refs = {};

function readingPlansCollection() {
  return scopedCollection(db, "readingPlans");
}

function dailyReadingProgressCollection() {
  return scopedCollection(db, "dailyReadingProgress");
}

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
        <button id="daily-reading-date" class="daily-reading-date-btn"></button>
        <button id="daily-next-btn" class="nav-icon-btn" aria-label="Next day">›</button>
      </div>
      <div class="daily-reading-toolbar">
        <button id="daily-today-btn" class="btn btn-small" hidden>Jump to Today</button>
      </div>
      <div id="daily-plan-status" class="plan-status"></div>
      <ul class="plan-checklist" id="daily-reading-list"></ul>
      <div class="mark-all-row">
        <button id="daily-mark-all-btn" class="btn btn-primary btn-small" hidden>✓ Mark All Complete</button>
      </div>
    </div>

    <div id="daily-date-modal-backdrop" class="modal-backdrop" hidden>
      <div class="modal">
        <h3>Pick a Date</h3>
        <label for="daily-month-select">Date</label>
        <div class="date-picker-row">
          <select id="daily-month-select"></select>
          <select id="daily-day-select"></select>
        </div>
        <div class="modal-actions">
          <button id="daily-date-close-btn" class="btn btn-primary">Done</button>
        </div>
      </div>
    </div>

    <div id="plan-area"></div>

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
  refs.dailyMarkAllBtn = container.querySelector("#daily-mark-all-btn");
  refs.dailyMarkAllBtn.addEventListener("click", markAllDailyComplete);
  refs.planStatus = container.querySelector("#daily-plan-status");
  refs.dailyMonthSelect = container.querySelector("#daily-month-select");
  refs.dailyDaySelect = container.querySelector("#daily-day-select");
  refs.dailyDateModalBackdrop = container.querySelector("#daily-date-modal-backdrop");

  refs.dailyPrevBtn.addEventListener("click", () => shiftDailyDate(-1));
  refs.dailyNextBtn.addEventListener("click", () => shiftDailyDate(1));
  refs.dailyTodayBtn.addEventListener("click", jumpToToday);
  refs.dailyDateLabel.addEventListener("click", openDateModal);
  container.querySelector("#daily-date-close-btn").addEventListener("click", closeDateModal);
  refs.dailyDateModalBackdrop.addEventListener("click", (e) => {
    if (e.target === refs.dailyDateModalBackdrop) closeDateModal();
  });

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

  refs.planArea = container.querySelector("#plan-area");
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
  readingPlansCollection().add({
    name,
    startBook,
    startChapter,
    endBook,
    endChapter,
    chapters,
    progress: {}, // per-user; each user's array is created lazily on first toggle
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function deletePlan(id) {
  if (!db) return;
  if (!confirm("Delete this reading plan?")) return;
  readingPlansCollection().doc(id).delete();
}

function progressForUser(plan, userId) {
  return (plan.progress && plan.progress[userId]) || plan.chapters.map(() => false);
}

// No sign-in check here — this is only ever reached via buildCheckToggle,
// which already gates (and reverts the checkbox) before calling onChange.
function toggleChapter(plan, index) {
  if (!db) return;
  const userId = getActiveUser();
  if (!userId) return;
  const progress = progressForUser(plan, userId).slice();
  progress[index] = !progress[index];
  readingPlansCollection()
    .doc(plan.id)
    .set({ progress: { [userId]: progress } }, { merge: true });
}

function navigateToChapter(book, chapter, dailyCtx) {
  window.dispatchEvent(new CustomEvent("bible:navigate", { detail: { book, chapter, dailyContext: dailyCtx } }));
}

// Dispatches between the two states of the plans area: the compact view
// (a subtle "Change Plan" link plus whichever plan is currently active,
// if any) and the full manage-plans page (pick or create one).
function renderPlanArea() {
  if (managingPlans) {
    refs.planArea.innerHTML = `
      <div class="settings-header">
        <button id="plan-manage-back-btn" class="btn btn-small">← Back</button>
        <h2>Reading Plans</h2>
        <button id="new-plan-btn" class="btn btn-primary btn-small">+ New Plan</button>
      </div>
      <ul id="plan-select-list" class="question-list"></ul>
      <p id="plan-select-empty" class="empty-state" hidden>No custom plans yet — tap "+ New Plan" to make one.</p>
    `;
    refs.planArea.querySelector("#plan-manage-back-btn").addEventListener("click", () => {
      managingPlans = false;
      renderPlanArea();
    });
    refs.planArea.querySelector("#new-plan-btn").addEventListener("click", openModal);
    renderPlanSelectList();
  } else {
    const plan = plans.find((p) => p.id === activePlanId);
    refs.planArea.innerHTML = `
      <button id="change-plan-btn" class="change-plan-link">${plan ? "Change Plan" : "+ Choose or Create a Reading Plan"}</button>
      <div id="plan-detail"></div>
    `;
    refs.planArea.querySelector("#change-plan-btn").addEventListener("click", () => {
      managingPlans = true;
      renderPlanArea();
    });
    refs.detail = refs.planArea.querySelector("#plan-detail");
    renderDetail();
  }
}

// The manage-plans page's list: every custom plan, with a way to make it
// the active one (shown on the main page) or delete it.
function renderPlanSelectList() {
  const listEl = refs.planArea.querySelector("#plan-select-list");
  const emptyEl = refs.planArea.querySelector("#plan-select-empty");
  listEl.innerHTML = "";
  emptyEl.hidden = plans.length !== 0;

  plans.forEach((plan) => {
    const li = document.createElement("li");
    li.className = "question-card";

    const doneCount = progressForUser(plan, activeUserId).filter(Boolean).length;
    const nameEl = document.createElement("p");
    nameEl.className = "question-text";
    nameEl.innerHTML = `<strong>${escapeHtml(plan.name)}</strong>${plan.id === activePlanId ? " · <em>currently active</em>" : ""}`;
    li.appendChild(nameEl);

    const rangeEl = document.createElement("p");
    rangeEl.className = "question-answer";
    rangeEl.textContent = `${plan.startBook} ${plan.startChapter} — ${plan.endBook} ${plan.endChapter} · ${doneCount}/${plan.chapters.length} read`;
    li.appendChild(rangeEl);

    const actions = document.createElement("div");
    actions.className = "question-row-actions";

    if (plan.id !== activePlanId) {
      const useBtn = document.createElement("button");
      useBtn.className = "btn btn-primary btn-small";
      useBtn.textContent = "Use This Plan";
      useBtn.addEventListener("click", () => {
        activePlanId = plan.id;
        managingPlans = false;
        renderPlanArea();
      });
      actions.appendChild(useBtn);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-small";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deletePlan(plan.id));
    actions.appendChild(deleteBtn);

    li.appendChild(actions);
    listEl.appendChild(li);
  });
}

function renderDetail() {
  const plan = plans.find((p) => p.id === activePlanId);
  if (!plan) {
    refs.detail.innerHTML = "";
    return;
  }

  const userProgress = progressForUser(plan, activeUserId);
  const doneCount = userProgress.filter(Boolean).length;
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
    li.className = "plan-row" + (userProgress[i] ? " plan-row-done" : "");

    const toggle = buildCheckToggle(!!userProgress[i], () => toggleChapter(plan, i));

    const label = document.createElement("span");
    label.className = "plan-row-label";
    label.textContent = `${ch.book} ${ch.chapter}`;

    const readBtn = document.createElement("button");
    readBtn.className = "btn btn-small";
    readBtn.textContent = "Read";
    readBtn.addEventListener("click", () => navigateToChapter(ch.book, ch.chapter));

    li.appendChild(toggle);
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

// A checkbox styled as a rounded checkmark toggle, used for both the
// custom-plan checklist and the daily reading list.
// Reading progress is tracked per-person, same as Questions and
// Memorize — block the action (and revert the checkbox) if nobody's
// picked in the header's User dropdown.
function requireSignedIn() {
  if (getActiveUser()) return true;
  alert("Pick who you are (in the User dropdown up top) before marking a reading done.");
  return false;
}

function buildCheckToggle(checked, onChange) {
  const label = document.createElement("label");
  label.className = "check-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => {
    if (!requireSignedIn()) {
      input.checked = checked;
      return;
    }
    onChange();
  });
  const mark = document.createElement("span");
  mark.className = "check-toggle-mark";
  label.appendChild(input);
  label.appendChild(mark);
  return label;
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
        dailyDocData = doc.exists ? doc.data() || {} : {};
        renderDaily();
      },
      (err) => console.error(err)
    );
}

function toggleDailyRead(index) {
  if (!db) return;
  const userId = getActiveUser();
  if (!userId) return;
  const field = `read${index + 1}`;
  const current = (dailyDocData[userId] || {})[field];
  dailyReadingProgressCollection()
    .doc(dateKey(dailyDate))
    .set({ [userId]: { [field]: !current } }, { merge: true })
    .then(() => refreshPlanStats(userId));
}

function markAllDailyComplete() {
  if (!requireSignedIn()) return;
  if (!db) return;
  const userId = getActiveUser();
  dailyReadingProgressCollection()
    .doc(dateKey(dailyDate))
    .set({ [userId]: { read1: true, read2: true, read3: true } }, { merge: true })
    .then(() => refreshPlanStats(userId));
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

function goToMissedDate(key) {
  dailyDate = new Date(`${key}T00:00:00`);
  subscribeDaily(dailyDate);
  renderDaily();
}

function renderPlanStatus() {
  const el = refs.planStatus;
  const planState = planStates[activeUserId];
  if (!planState) {
    el.innerHTML = `
      <p class="plan-status-hint">Track how many days you complete (and miss) by starting the plan.</p>
      <button id="start-plan-btn" class="btn btn-primary btn-small">▶ Start Plan</button>
    `;
    el.querySelector("#start-plan-btn").addEventListener("click", () => {
      if (!requireSignedIn()) return;
      startPlan(getActiveUser());
    });
    return;
  }

  const stats = planStatsByUser[activeUserId] || { completed: 0, missed: 0, missedDates: [] };
  const startLabel = new Date(`${planState.startDate}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  el.innerHTML = `
    <p class="plan-status-hint">Started ${startLabel}</p>
    <div class="plan-stats-row">
      <div class="plan-stat"><strong>🔥 ${stats.currentStreak || 0}</strong><span>Current Streak</span></div>
      <div class="plan-stat"><strong>${stats.completed}</strong><span>Completed</span></div>
      <div class="plan-stat"><strong>${stats.missed}</strong><span>Missed</span></div>
    </div>
    ${
      stats.missedDates.length > 0
        ? `<details class="missed-days"><summary>Catch up on ${stats.missedDates.length} missed day${stats.missedDates.length === 1 ? "" : "s"}</summary>
            <div class="missed-days-actions">
              <button id="missed-days-select-all-btn" class="btn btn-small">Select All</button>
              <button id="mark-selected-missed-btn" class="btn btn-primary btn-small">✓ Mark Selected Done</button>
            </div>
            <ul class="missed-days-list" id="missed-days-list"></ul>
          </details>`
        : ""
    }
    <button id="reset-plan-btn" class="btn btn-small">Reset Streak</button>
  `;

  if (stats.missedDates.length > 0) {
    const listEl = el.querySelector("#missed-days-list");
    stats.missedDates.forEach((key) => {
      const li = document.createElement("li");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "missed-day-checkbox";
      checkbox.value = key;

      const label = document.createElement("span");
      label.className = "missed-day-label";
      label.textContent = new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      const btn = document.createElement("button");
      btn.className = "btn btn-small";
      btn.textContent = "Catch Up";
      btn.addEventListener("click", () => goToMissedDate(key));

      li.appendChild(checkbox);
      li.appendChild(label);
      li.appendChild(btn);
      listEl.appendChild(li);
    });

    el.querySelector("#missed-days-select-all-btn").addEventListener("click", () => {
      listEl.querySelectorAll(".missed-day-checkbox").forEach((cb) => (cb.checked = true));
    });
    el.querySelector("#mark-selected-missed-btn").addEventListener("click", () => {
      if (!requireSignedIn()) return;
      const keys = Array.from(listEl.querySelectorAll(".missed-day-checkbox:checked")).map((cb) => cb.value);
      if (keys.length === 0) return;
      markDaysComplete(keys, getActiveUser());
    });
  }

  el.querySelector("#reset-plan-btn").addEventListener("click", () => {
    if (!requireSignedIn()) return;
    if (confirm("Reset your reading streak? This clears your start date — your daily checkmarks stay recorded.")) {
      resetPlan(getActiveUser());
    }
  });
}

// Marks every reading done for a batch of missed dates at once (e.g. "I
// know I did these, I just forgot to check them off") without needing to
// open each day individually.
function markDaysComplete(dateKeys, userId) {
  if (!db || !userId) return;
  const batch = db.batch();
  dateKeys.forEach((key) => {
    batch.set(
      dailyReadingProgressCollection().doc(key),
      { [userId]: { read1: true, read2: true, read3: true } },
      { merge: true }
    );
  });
  batch.commit().then(() => refreshPlanStats(userId));
}

function openDateModal() {
  refs.dailyDateModalBackdrop.hidden = false;
}

function closeDateModal() {
  refs.dailyDateModalBackdrop.hidden = true;
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
    const done = !!(dailyDocData[activeUserId] || {})[field];
    li.className = "plan-row" + (done ? " plan-row-done" : "");

    const toggle = buildCheckToggle(done, () => toggleDailyRead(i));

    const labelEl = document.createElement("span");
    labelEl.className = "plan-row-label";
    labelEl.textContent = label;

    const readBtn = document.createElement("button");
    readBtn.className = "btn btn-small";
    readBtn.textContent = "Read";
    readBtn.addEventListener("click", () => {
      const chapters = parseReadingLabel(label);
      if (chapters.length > 0) {
        navigateToChapter(chapters[0].book, chapters[0].chapter, { dateKey: dateKey(dailyDate), index: i });
      }
    });

    li.appendChild(toggle);
    li.appendChild(labelEl);
    li.appendChild(readBtn);
    refs.dailyList.appendChild(li);
  });

  const userDaily = dailyDocData[activeUserId] || {};
  refs.dailyMarkAllBtn.hidden = readings.every((_, i) => userDaily[`read${i + 1}`]);
}

export function mountPlanner(container) {
  buildSkeleton(container);
  renderPlanArea();
  renderDaily();

  subscribePlanState(({ planStates: states, planStatsByUser: statsByUser }) => {
    planStates = states;
    planStatsByUser = statsByUser;
    renderPlanStatus();
  });

  subscribeActiveUser((id) => {
    activeUserId = id;
    if (id) refreshPlanStats(id);
    renderDaily();
    renderPlanArea();
    renderPlanStatus();
  });

  ready.then((firestoreDb) => {
    db = firestoreDb;
    subscribeDaily(dailyDate);
    readingPlansCollection().onSnapshot(
      (snapshot) => {
        plans = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        if (!activePlanId && plans.length > 0) activePlanId = plans[0].id;
        if (activePlanId && !plans.find((p) => p.id === activePlanId)) {
          activePlanId = plans.length > 0 ? plans[0].id : null;
        }
        renderPlanArea();
      },
      (err) => console.error(err)
    );
  }).catch((err) => console.error(err));
}

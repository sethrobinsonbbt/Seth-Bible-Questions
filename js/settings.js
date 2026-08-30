// Settings section: a simple passcode gate, then family member management,
// a Question Library subpage, family stats, and backup. This is the only
// place questions and family members are created or edited — the Questions
// tab itself is a read-only quiz view, safe for kids to use unsupervised.
//
// IMPORTANT: the passcode is a soft deterrent only, not real security. This
// is a static site with no server — anyone who opens the browser's dev
// tools can read the passcode straight out of this file. It's meant to
// keep a curious kid from poking around, not to protect sensitive data.
import { AGE_GROUPS, ageGroupLabel, buildAgeGroupSelect } from "./age-groups-data.js";
import { subscribeUsers, addUser, updateUser, deleteUser } from "./users.js";
import {
  subscribeQuestions,
  addQuestion,
  updateQuestion,
  updateQuestionAssignment,
  deleteQuestion,
  resetProgress,
} from "./questions-data.js";
import { subscribeMemoryVerses } from "./memorize-data.js";
import { subscribePlanState } from "./daily-plan-data.js";
import { ready } from "./firebase.js";

const PASSWORD = "1967";
const UNLOCK_KEY = "bible-questions-settings-unlocked";

let users = [];
let questions = [];
let memoryVerses = [];
let planState = null;
let planStats = null;
let editingUserId = null;
let addingUser = false;
let editingQuestionId = null;
let questionFilter = "all"; // "all" | "unassigned" | an age-group id
let questionSearch = "";
// The Question Library subpage has its own edit lock, separate from (and
// on top of) the outer Setup passcode — it defaults locked every time you
// open the subpage, so browsing questions never accidentally exposes
// edit/delete controls until you deliberately tap to unlock them.
let libraryUnlocked = false;
let refs = {};

function isUnlocked() {
  try {
    return localStorage.getItem(UNLOCK_KEY) === "true";
  } catch (e) {
    return false;
  }
}

function setUnlocked(value) {
  try {
    if (value) localStorage.setItem(UNLOCK_KEY, "true");
    else localStorage.removeItem(UNLOCK_KEY);
  } catch (e) {
    /* ignore */
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Lock screen ----------

function buildLockScreen(container) {
  refs = {};
  container.innerHTML = `
    <div class="settings-lock">
      <h2>🔒 Setup</h2>
      <p>Enter the family passcode to manage family members and questions.</p>
      <input id="settings-password-input" type="password" inputmode="numeric" placeholder="Passcode" />
      <p id="settings-password-error" class="form-error" hidden>That's not it — try again.</p>
      <button id="settings-unlock-btn" class="btn btn-primary">Unlock</button>
      <p class="settings-fineprint">This is a simple deterrent, not real security — it's meant to keep quick
      taps from a kid out, not to protect sensitive data.</p>
    </div>
  `;
  const input = container.querySelector("#settings-password-input");
  const submit = () => {
    if (input.value === PASSWORD) {
      setUnlocked(true);
      buildMainView(container);
    } else {
      container.querySelector("#settings-password-error").hidden = false;
      input.value = "";
      input.focus();
    }
  };
  container.querySelector("#settings-unlock-btn").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

// ---------- Family members ----------

function buildUserForm(user) {
  const wrapper = document.createElement("div");

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "edit-answer-input";
  nameInput.placeholder = "Name";
  nameInput.value = user ? user.name : "";
  wrapper.appendChild(nameInput);

  const groupsWrap = document.createElement("div");
  groupsWrap.className = "age-group-checkboxes";
  const checkboxes = [];
  AGE_GROUPS.forEach((g) => {
    const label = document.createElement("label");
    label.className = "age-group-checkbox";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = g.id;
    cb.checked = !!(user && user.ageGroups && user.ageGroups.includes(g.id));
    checkboxes.push(cb);
    label.appendChild(cb);
    label.append(" " + g.label);
    groupsWrap.appendChild(label);
  });
  wrapper.appendChild(groupsWrap);

  const actions = document.createElement("div");
  actions.className = "question-row-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-primary btn-small";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) return;
    const ageGroups = checkboxes.filter((cb) => cb.checked).map((cb) => cb.value);
    if (user) updateUser(user.id, name, ageGroups);
    else addUser(name, ageGroups);
    editingUserId = null;
    addingUser = false;
    renderUsers();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-small";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => {
    editingUserId = null;
    addingUser = false;
    renderUsers();
  });

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  wrapper.appendChild(actions);
  return wrapper;
}

function renderUsers() {
  const listEl = refs.userList;
  listEl.innerHTML = "";

  if (addingUser) {
    const li = document.createElement("li");
    li.className = "question-card";
    li.appendChild(buildUserForm(null));
    listEl.appendChild(li);
  }

  refs.userEmpty.hidden = users.length !== 0;

  users.forEach((user) => {
    const li = document.createElement("li");
    li.className = "question-card";

    if (editingUserId === user.id) {
      li.appendChild(buildUserForm(user));
    } else {
      const nameEl = document.createElement("p");
      nameEl.className = "question-text";
      nameEl.textContent = user.name;
      li.appendChild(nameEl);

      const groupsEl = document.createElement("p");
      groupsEl.className = "question-answer";
      groupsEl.textContent =
        user.ageGroups && user.ageGroups.length > 0
          ? user.ageGroups.map(ageGroupLabel).join(", ")
          : "No age groups yet — this member won't see any questions.";
      li.appendChild(groupsEl);

      const actions = document.createElement("div");
      actions.className = "question-row-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-small";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        editingUserId = user.id;
        renderUsers();
      });
      actions.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-danger btn-small";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        if (confirm(`Remove ${user.name}? Their question scores will stay recorded but won't be shown anywhere.`)) {
          deleteUser(user.id);
        }
      });
      actions.appendChild(deleteBtn);

      li.appendChild(actions);
    }

    listEl.appendChild(li);
  });
}

// ---------- Question Library ----------

function filteredQuestions() {
  let list = questions;
  if (questionFilter === "unassigned") list = list.filter((q) => !q.assignedTo);
  else if (questionFilter !== "all") list = list.filter((q) => q.assignedTo === questionFilter);

  const term = questionSearch.trim().toLowerCase();
  if (term) {
    list = list.filter(
      (q) => q.text.toLowerCase().includes(term) || (q.answer && q.answer.toLowerCase().includes(term))
    );
  }
  return list;
}

function aggregateScore(q) {
  const progress = q.progress || {};
  let correct = 0;
  let wrong = 0;
  Object.values(progress).forEach((p) => {
    correct += p.correctCount || 0;
    wrong += p.wrongCount || 0;
  });
  return { correct, wrong };
}

function renderQuestionFilterSelect() {
  const select = refs.filterSelect;
  select.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All questions";
  select.appendChild(allOpt);
  const unassignedOpt = document.createElement("option");
  unassignedOpt.value = "unassigned";
  unassignedOpt.textContent = "Unassigned";
  select.appendChild(unassignedOpt);
  AGE_GROUPS.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.label;
    select.appendChild(opt);
  });
  select.value = questionFilter;
}

function renderQuestionsAdmin() {
  const listEl = refs.adminQuestionList;
  const list = filteredQuestions();
  listEl.innerHTML = "";
  refs.adminQuestionEmpty.hidden = list.length !== 0;

  list.forEach((q) => {
    const li = document.createElement("li");
    li.className = "question-card";

    if (libraryUnlocked && editingQuestionId === q.id) {
      const textarea = document.createElement("textarea");
      textarea.className = "edit-textarea";
      textarea.value = q.text;
      li.appendChild(textarea);

      const answerInput = document.createElement("input");
      answerInput.type = "text";
      answerInput.className = "edit-answer-input";
      answerInput.placeholder = "Answer (optional)";
      answerInput.value = q.answer || "";
      li.appendChild(answerInput);

      const referenceInput = document.createElement("input");
      referenceInput.type = "text";
      referenceInput.className = "edit-answer-input";
      referenceInput.placeholder = "Reference (optional) — e.g. Genesis 1:3";
      referenceInput.value = q.reference || "";
      li.appendChild(referenceInput);

      const actions = document.createElement("div");
      actions.className = "question-row-actions";

      const saveBtn = document.createElement("button");
      saveBtn.className = "btn btn-primary btn-small";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => {
        const val = textarea.value.trim();
        if (val) updateQuestion(q.id, val, answerInput.value.trim(), referenceInput.value.trim());
        editingQuestionId = null;
        renderQuestionsAdmin();
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-small";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        editingQuestionId = null;
        renderQuestionsAdmin();
      });

      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);
      li.appendChild(actions);
    } else {
      const p = document.createElement("p");
      p.className = "question-text";
      p.textContent = q.text;
      li.appendChild(p);

      if (q.answer || q.reference) {
        const a = document.createElement("p");
        a.className = "question-answer";
        a.textContent = [q.answer && `Answer: ${q.answer}`, q.reference && `Reference: ${q.reference}`]
          .filter(Boolean)
          .join(" — ");
        li.appendChild(a);
      }

      const { correct, wrong } = aggregateScore(q);
      if (correct > 0 || wrong > 0) {
        const scoreLine = document.createElement("p");
        scoreLine.className = "question-score";
        scoreLine.textContent = `✅ ${correct} · ❌ ${wrong} across the family`;
        li.appendChild(scoreLine);
      }

      if (libraryUnlocked) {
        const actions = document.createElement("div");
        actions.className = "question-row-actions";

        const assignSelect = buildAgeGroupSelect(q.assignedTo);
        assignSelect.addEventListener("change", () => {
          updateQuestionAssignment(q.id, assignSelect.value);
        });
        actions.appendChild(assignSelect);

        const editBtn = document.createElement("button");
        editBtn.className = "btn btn-small";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => {
          editingQuestionId = q.id;
          renderQuestionsAdmin();
        });
        actions.appendChild(editBtn);

        if (correct > 0 || wrong > 0) {
          const resetBtn = document.createElement("button");
          resetBtn.className = "btn btn-small";
          resetBtn.textContent = "Reset Score";
          resetBtn.addEventListener("click", () => {
            if (confirm("Reset everyone's score on this question? This can't be undone.")) resetProgress(q.id);
          });
          actions.appendChild(resetBtn);
        }

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn-danger btn-small";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => {
          if (confirm("Delete this question?")) deleteQuestion(q.id);
        });
        actions.appendChild(deleteBtn);

        li.appendChild(actions);
      }
    }

    listEl.appendChild(li);
  });
}

// ---------- Family stats ----------

function renderFamilyStats() {
  const listEl = refs.statsList;
  listEl.innerHTML = "";
  refs.statsEmpty.hidden = users.length !== 0;

  users.forEach((user) => {
    let qCorrect = 0;
    let qWrong = 0;
    questions.forEach((q) => {
      const p = q.progress && q.progress[user.id];
      if (p) {
        qCorrect += p.correctCount || 0;
        qWrong += p.wrongCount || 0;
      }
    });

    let vCorrect = 0;
    let vAttempts = 0;
    memoryVerses.forEach((v) => {
      const p = v.progress && v.progress[user.id];
      if (p) {
        vCorrect += p.correctCount || 0;
        vAttempts += p.attempts || 0;
      }
    });

    const li = document.createElement("li");
    li.className = "question-card";

    const name = document.createElement("p");
    name.className = "question-text";
    name.textContent = user.name;
    li.appendChild(name);

    const line = document.createElement("p");
    line.className = "question-answer";
    line.textContent = `📖 Questions: ✅ ${qCorrect} · ❌ ${qWrong}   ✍️ Memorize: ✅ ${vCorrect} / ${vAttempts} attempts`;
    li.appendChild(line);

    listEl.appendChild(li);
  });
}

function renderReadingPlanStat() {
  const el = refs.readingPlanStat;
  if (!planState) {
    el.textContent = "📅 Daily Reading Plan: not started yet (see the Reading Plan page).";
    return;
  }
  const stats = planStats || { completed: 0, missed: 0, currentStreak: 0 };
  el.textContent = `📅 Daily Reading Plan (family-wide): 🔥 ${stats.currentStreak || 0} day streak · ✅ ${stats.completed} completed · ❌ ${stats.missed} missed`;
}

// ---------- Data export ----------

async function exportAllData() {
  const btn = refs.exportBtn;
  const originalText = btn.textContent;
  btn.textContent = "Exporting…";
  btn.disabled = true;
  try {
    const db = await ready;
    const collectionNames = ["users", "questions", "memoryVerses", "readingPlans", "dailyReadingProgress", "appState"];
    const data = {};
    for (const name of collectionNames) {
      const snapshot = await db.collection(name).get();
      data[name] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bible-questions-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("Couldn't export data — check your internet connection and try again.");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ---------- Add-question modal ----------

function openAddQuestionModal() {
  refs.qModalText.value = "";
  refs.qModalAnswer.value = "";
  refs.qModalReference.value = "";
  refs.qModalError.hidden = true;
  const select = buildAgeGroupSelect(questionFilter === "unassigned" || questionFilter === "all" ? "" : questionFilter);
  refs.qModalAssignWrap.innerHTML = "";
  refs.qModalAssignWrap.appendChild(select);
  refs.qModalAssign = select;
  refs.qModalBackdrop.hidden = false;
  refs.qModalText.focus();
}

function closeAddQuestionModal() {
  refs.qModalBackdrop.hidden = true;
}

// ---------- Question Library subpage ----------

function buildLibraryView(container) {
  refs = {};
  container.innerHTML = `
    <div class="settings-header">
      <button id="library-back-btn" class="btn btn-small">← Setup</button>
      <h2>📚 Question Library</h2>
      <button id="library-lock-btn" class="btn btn-small">${libraryUnlocked ? "🔓 Editing" : "🔒 Locked"}</button>
    </div>

    <div class="question-filter-row">
      <select id="question-filter-select" class="assign-select"></select>
      <input id="question-search-input" type="text" placeholder="🔍 Search questions…" />
    </div>
    ${
      libraryUnlocked
        ? `<div class="list-toolbar-actions"><button id="add-question-btn" class="btn btn-primary">+ Add Question</button></div>`
        : `<p class="settings-fineprint">🔒 Locked — tap the lock above to reassign, edit, or delete questions.</p>`
    }
    <ul id="admin-question-list" class="question-list"></ul>
    <p id="admin-question-empty" class="empty-state" hidden>No questions match this filter.</p>

    <div id="settings-question-modal-backdrop" class="modal-backdrop" hidden>
      <div class="modal">
        <h3>Add Question</h3>
        <label for="settings-question-text">Question</label>
        <textarea id="settings-question-text" rows="4" placeholder="e.g. Who built the ark?"></textarea>
        <label for="settings-question-answer">Answer</label>
        <input id="settings-question-answer" type="text" placeholder="e.g. Noah" />
        <label for="settings-question-reference">Reference (optional)</label>
        <input id="settings-question-reference" type="text" placeholder="e.g. Genesis 1:3" />
        <label>Assign to</label>
        <div id="settings-question-assign-wrap"></div>
        <p id="settings-question-error" class="form-error" hidden></p>
        <div class="modal-actions">
          <button id="settings-question-cancel-btn" class="btn">Cancel</button>
          <button id="settings-question-save-btn" class="btn btn-primary">Save</button>
        </div>
      </div>
    </div>
  `;

  refs.adminQuestionList = container.querySelector("#admin-question-list");
  refs.adminQuestionEmpty = container.querySelector("#admin-question-empty");
  refs.filterSelect = container.querySelector("#question-filter-select");

  container.querySelector("#library-back-btn").addEventListener("click", () => buildMainView(container));
  container.querySelector("#library-lock-btn").addEventListener("click", () => {
    libraryUnlocked = !libraryUnlocked;
    buildLibraryView(container);
  });

  renderQuestionFilterSelect();
  refs.filterSelect.addEventListener("change", () => {
    questionFilter = refs.filterSelect.value;
    renderQuestionsAdmin();
  });

  refs.searchInput = container.querySelector("#question-search-input");
  refs.searchInput.value = questionSearch;
  refs.searchInput.addEventListener("input", () => {
    questionSearch = refs.searchInput.value;
    renderQuestionsAdmin();
  });

  if (libraryUnlocked) {
    refs.qModalBackdrop = container.querySelector("#settings-question-modal-backdrop");
    refs.qModalText = container.querySelector("#settings-question-text");
    refs.qModalAnswer = container.querySelector("#settings-question-answer");
    refs.qModalReference = container.querySelector("#settings-question-reference");
    refs.qModalAssignWrap = container.querySelector("#settings-question-assign-wrap");
    refs.qModalError = container.querySelector("#settings-question-error");

    container.querySelector("#add-question-btn").addEventListener("click", openAddQuestionModal);
    container.querySelector("#settings-question-cancel-btn").addEventListener("click", closeAddQuestionModal);
    refs.qModalBackdrop.addEventListener("click", (e) => {
      if (e.target === refs.qModalBackdrop) closeAddQuestionModal();
    });
    container.querySelector("#settings-question-save-btn").addEventListener("click", () => {
      const text = refs.qModalText.value.trim();
      const answer = refs.qModalAnswer.value.trim();
      if (!text) {
        refs.qModalError.textContent = "Give the question some text.";
        refs.qModalError.hidden = false;
        return;
      }
      if (!answer) {
        refs.qModalError.textContent = "An answer is required (reference is optional).";
        refs.qModalError.hidden = false;
        return;
      }
      const reference = refs.qModalReference.value.trim();
      const assignedTo = refs.qModalAssign.value || null;
      addQuestion(text, answer, reference, assignedTo);
      closeAddQuestionModal();
    });
  }

  renderQuestionsAdmin();
}

// ---------- Main Setup view ----------

function buildMainView(container) {
  refs = {};
  container.innerHTML = `
    <div class="settings-header">
      <h2>🔒 Setup</h2>
      <button id="settings-lock-btn" class="btn btn-small">Lock</button>
    </div>

    <div class="settings-panel">
      <div class="list-toolbar">
        <h2>Family Members</h2>
        <button id="add-user-btn" class="btn btn-primary">+ Add Member</button>
      </div>
      <ul id="user-list" class="question-list"></ul>
      <p id="user-empty" class="empty-state" hidden>No family members yet.</p>
    </div>

    <div class="settings-panel">
      <div class="list-toolbar">
        <h2>Questions</h2>
        <button id="open-library-btn" class="btn btn-primary">📚 Question Library</button>
      </div>
      <p id="library-count" class="settings-fineprint"></p>
    </div>

    <div class="settings-panel">
      <div class="list-toolbar">
        <h2>Family Stats</h2>
      </div>
      <p id="reading-plan-stat" class="question-score"></p>
      <ul id="family-stats-list" class="question-list"></ul>
      <p id="family-stats-empty" class="empty-state" hidden>Add family members to see stats.</p>
    </div>

    <div class="settings-panel">
      <div class="list-toolbar">
        <h2>Backup</h2>
      </div>
      <p class="settings-fineprint">Download everything — family members, questions, memory verses, reading plans and progress — as one JSON file.</p>
      <button id="export-data-btn" class="btn">⬇️ Export All Data</button>
    </div>
  `;

  refs.userList = container.querySelector("#user-list");
  refs.userEmpty = container.querySelector("#user-empty");
  refs.libraryCount = container.querySelector("#library-count");
  refs.statsList = container.querySelector("#family-stats-list");
  refs.statsEmpty = container.querySelector("#family-stats-empty");
  refs.readingPlanStat = container.querySelector("#reading-plan-stat");
  refs.exportBtn = container.querySelector("#export-data-btn");
  refs.exportBtn.addEventListener("click", exportAllData);

  container.querySelector("#settings-lock-btn").addEventListener("click", () => {
    setUnlocked(false);
    buildLockScreen(container);
  });

  container.querySelector("#add-user-btn").addEventListener("click", () => {
    addingUser = true;
    renderUsers();
  });

  container.querySelector("#open-library-btn").addEventListener("click", () => {
    libraryUnlocked = false; // always opens locked/read-only; tap the lock to edit
    buildLibraryView(container);
  });

  renderUsers();
  renderLibraryCount();
  renderFamilyStats();
  renderReadingPlanStat();
}

function renderLibraryCount() {
  if (!refs.libraryCount) return;
  refs.libraryCount.textContent = `${questions.length} question${questions.length === 1 ? "" : "s"} in the library.`;
}

export function mountSettings(container) {
  if (isUnlocked()) {
    buildMainView(container);
  } else {
    buildLockScreen(container);
  }

  subscribeUsers((updated) => {
    users = updated;
    if (refs.userList) renderUsers();
    if (refs.statsList) renderFamilyStats();
  });
  subscribeQuestions((updated) => {
    questions = updated;
    if (refs.adminQuestionList) renderQuestionsAdmin();
    if (refs.statsList) renderFamilyStats();
    if (refs.libraryCount) renderLibraryCount();
  });
  subscribeMemoryVerses((updated) => {
    memoryVerses = updated;
    if (refs.statsList) renderFamilyStats();
  });
  subscribePlanState(({ planState: state, planStats: stats }) => {
    planState = state;
    planStats = stats;
    if (refs.readingPlanStat) renderReadingPlanStat();
  });
}

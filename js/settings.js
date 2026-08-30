// Settings section: a simple passcode gate, then a landing page linking to
// three subpages (Family Members, Question Library, Memory Verses) plus
// Backup. This is the only place questions, family members, and memory
// verse categories are created or edited — the Questions and Memorize
// tabs themselves are read-only/practice views, safe for kids to use
// unsupervised.
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
  resetUserProgress as resetUserQuestionProgress,
} from "./questions-data.js";
import {
  subscribeMemoryVerses,
  subscribeVerseCategories,
  addVerseCategory,
  updateVerseCategory,
  deleteVerseCategory,
  assignVerseCategory,
  resetUserProgress as resetUserVerseProgress,
} from "./memorize-data.js";
import { subscribePlanState } from "./daily-plan-data.js";
import { ready } from "./firebase.js";

const PASSWORD = "1967";
const UNLOCK_KEY = "bible-questions-settings-unlocked";

let users = [];
let questions = [];
let memoryVerses = [];
let verseCategories = [];
let planState = null;
let planStats = null;
let editingUserId = null;
let addingUser = false;
let editingQuestionId = null;
let questionFilter = "all"; // "all" | "unassigned" | an age-group id
let questionSearch = "";
let editingCategoryId = null;
let addingCategory = false;
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

// ---------- Shared: per-user stat line + reset ----------

function userStatsLine(user) {
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

  return { qCorrect, qWrong, vCorrect, vAttempts };
}

function resetUserStats(user) {
  if (!confirm(`Reset ${user.name}'s stats? This clears their Questions and Memorize progress — it can't be undone.`)) {
    return;
  }
  resetUserQuestionProgress(user.id);
  resetUserVerseProgress(user.id);
}

// ---------- Family Members subpage ----------

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

      const { qCorrect, qWrong, vCorrect, vAttempts } = userStatsLine(user);
      const statsEl = document.createElement("p");
      statsEl.className = "question-score";
      statsEl.textContent = `📖 Questions: ✅ ${qCorrect} · ❌ ${qWrong}   ✍️ Memorize: ✅ ${vCorrect} / ${vAttempts} attempts`;
      li.appendChild(statsEl);

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

      if (qCorrect > 0 || qWrong > 0 || vAttempts > 0) {
        const resetStatsBtn = document.createElement("button");
        resetStatsBtn.className = "btn btn-small";
        resetStatsBtn.textContent = "Reset Stats";
        resetStatsBtn.addEventListener("click", () => resetUserStats(user));
        actions.appendChild(resetStatsBtn);
      }

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

function renderReadingPlanStat() {
  const el = refs.readingPlanStat;
  if (!el) return;
  if (!planState) {
    el.textContent = "📅 Daily Reading Plan: not started yet (see the Reading Plan page).";
    return;
  }
  const stats = planStats || { completed: 0, missed: 0, currentStreak: 0 };
  el.textContent = `📅 Daily Reading Plan (family-wide): 🔥 ${stats.currentStreak || 0} day streak · ✅ ${stats.completed} completed · ❌ ${stats.missed} missed`;
}

function buildFamilyView(container) {
  refs = {};
  container.innerHTML = `
    <div class="settings-header">
      <button id="family-back-btn" class="btn btn-small">← Setup</button>
      <h2>👪 Family Members</h2>
      <span></span>
    </div>
    <p id="reading-plan-stat" class="question-score"></p>
    <div class="list-toolbar">
      <h2>Members</h2>
      <button id="add-user-btn" class="btn btn-primary">+ Add Member</button>
    </div>
    <ul id="user-list" class="question-list"></ul>
    <p id="user-empty" class="empty-state" hidden>No family members yet.</p>
  `;

  refs.userList = container.querySelector("#user-list");
  refs.userEmpty = container.querySelector("#user-empty");
  refs.readingPlanStat = container.querySelector("#reading-plan-stat");

  container.querySelector("#family-back-btn").addEventListener("click", () => buildMainView(container));
  container.querySelector("#add-user-btn").addEventListener("click", () => {
    addingUser = true;
    renderUsers();
  });

  renderUsers();
  renderReadingPlanStat();
}

// ---------- Question Library subpage ----------

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

// ---------- Memory Verses subpage ----------

function buildCategoryForm(category) {
  const wrapper = document.createElement("div");
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "edit-answer-input";
  nameInput.placeholder = "Category name, e.g. Salvation";
  nameInput.value = category ? category.name : "";
  wrapper.appendChild(nameInput);

  const actions = document.createElement("div");
  actions.className = "question-row-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-primary btn-small";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) return;
    if (category) updateVerseCategory(category.id, name);
    else addVerseCategory(name);
    editingCategoryId = null;
    addingCategory = false;
    renderCategories();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-small";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => {
    editingCategoryId = null;
    addingCategory = false;
    renderCategories();
  });

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  wrapper.appendChild(actions);
  return wrapper;
}

function renderCategories() {
  const listEl = refs.categoryList;
  listEl.innerHTML = "";

  if (addingCategory) {
    const li = document.createElement("li");
    li.className = "question-card";
    li.appendChild(buildCategoryForm(null));
    listEl.appendChild(li);
  }

  refs.categoryEmpty.hidden = verseCategories.length !== 0;

  verseCategories.forEach((cat) => {
    const li = document.createElement("li");
    li.className = "question-card";

    if (editingCategoryId === cat.id) {
      li.appendChild(buildCategoryForm(cat));
    } else {
      const count = memoryVerses.filter((v) => v.categoryId === cat.id).length;

      const nameEl = document.createElement("p");
      nameEl.className = "question-text";
      nameEl.textContent = cat.name;
      li.appendChild(nameEl);

      const countEl = document.createElement("p");
      countEl.className = "question-answer";
      countEl.textContent = `${count} verse${count === 1 ? "" : "s"}`;
      li.appendChild(countEl);

      const actions = document.createElement("div");
      actions.className = "question-row-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-small";
      editBtn.textContent = "Rename";
      editBtn.addEventListener("click", () => {
        editingCategoryId = cat.id;
        renderCategories();
      });
      actions.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-danger btn-small";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        if (confirm(`Delete "${cat.name}"? Its verses move to Uncategorized, not deleted.`)) deleteVerseCategory(cat.id);
      });
      actions.appendChild(deleteBtn);

      li.appendChild(actions);
    }

    listEl.appendChild(li);
  });
}

function buildCategorySelect(currentValue) {
  const select = document.createElement("select");
  select.className = "assign-select";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "Uncategorized";
  select.appendChild(noneOpt);
  verseCategories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    select.appendChild(opt);
  });
  select.value = currentValue || "";
  return select;
}

function renderVersesAdmin() {
  const listEl = refs.verseAdminList;
  listEl.innerHTML = "";
  refs.verseAdminEmpty.hidden = memoryVerses.length !== 0;

  memoryVerses.forEach((v) => {
    const li = document.createElement("li");
    li.className = "question-card";

    const refEl = document.createElement("p");
    refEl.className = "question-text";
    refEl.textContent = v.reference;
    li.appendChild(refEl);

    const textEl = document.createElement("p");
    textEl.className = "question-answer";
    textEl.textContent = v.text.length > 90 ? v.text.slice(0, 90) + "…" : v.text;
    li.appendChild(textEl);

    const actions = document.createElement("div");
    actions.className = "question-row-actions";
    const select = buildCategorySelect(v.categoryId);
    select.addEventListener("change", () => assignVerseCategory(v.id, select.value));
    actions.appendChild(select);
    li.appendChild(actions);

    listEl.appendChild(li);
  });
}

function buildMemoryVersesView(container) {
  refs = {};
  container.innerHTML = `
    <div class="settings-header">
      <button id="mv-back-btn" class="btn btn-small">← Setup</button>
      <h2>✍️ Memory Verses</h2>
      <span></span>
    </div>

    <div class="settings-panel">
      <div class="list-toolbar">
        <h2>Categories</h2>
        <button id="add-category-btn" class="btn btn-primary">+ Add Category</button>
      </div>
      <ul id="category-list" class="question-list"></ul>
      <p id="category-empty" class="empty-state" hidden>No categories yet — verses will just show in one list.</p>
    </div>

    <div class="settings-panel">
      <div class="list-toolbar">
        <h2>All Verses</h2>
      </div>
      <ul id="verse-admin-list" class="question-list"></ul>
      <p id="verse-admin-empty" class="empty-state" hidden>No memory verses yet — add some from the Memorize page.</p>
    </div>
  `;

  refs.categoryList = container.querySelector("#category-list");
  refs.categoryEmpty = container.querySelector("#category-empty");
  refs.verseAdminList = container.querySelector("#verse-admin-list");
  refs.verseAdminEmpty = container.querySelector("#verse-admin-empty");

  container.querySelector("#mv-back-btn").addEventListener("click", () => buildMainView(container));
  container.querySelector("#add-category-btn").addEventListener("click", () => {
    addingCategory = true;
    renderCategories();
  });

  renderCategories();
  renderVersesAdmin();
}

// ---------- Data export ----------

async function exportAllData() {
  const btn = refs.exportBtn;
  const originalText = btn.textContent;
  btn.textContent = "Exporting…";
  btn.disabled = true;
  try {
    const db = await ready;
    const collectionNames = [
      "users",
      "questions",
      "memoryVerses",
      "verseCategories",
      "readingPlans",
      "dailyReadingProgress",
      "appState",
    ];
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

// ---------- Main Setup view ----------

function buildMainView(container) {
  refs = {};
  container.innerHTML = `
    <div class="settings-header">
      <h2>🔒 Setup</h2>
      <button id="settings-lock-btn" class="btn btn-small">Lock</button>
    </div>

    <ul class="settings-nav-list">
      <li><button id="open-family-btn" class="settings-nav-link">
        <span class="settings-nav-icon">👪</span>
        <span class="settings-nav-text"><strong>Family Members</strong><span id="family-count"></span></span>
        <span class="settings-nav-chevron">›</span>
      </button></li>
      <li><button id="open-library-btn" class="settings-nav-link">
        <span class="settings-nav-icon">📚</span>
        <span class="settings-nav-text"><strong>Question Library</strong><span id="library-count"></span></span>
        <span class="settings-nav-chevron">›</span>
      </button></li>
      <li><button id="open-memverses-btn" class="settings-nav-link">
        <span class="settings-nav-icon">✍️</span>
        <span class="settings-nav-text"><strong>Memory Verses</strong><span id="memverses-count"></span></span>
        <span class="settings-nav-chevron">›</span>
      </button></li>
    </ul>

    <div class="settings-panel">
      <div class="list-toolbar">
        <h2>Backup</h2>
      </div>
      <p class="settings-fineprint">Download everything — family members, questions, memory verses, reading plans and progress — as one JSON file.</p>
      <button id="export-data-btn" class="btn">⬇️ Export All Data</button>
    </div>
  `;

  refs.familyCount = container.querySelector("#family-count");
  refs.libraryCount = container.querySelector("#library-count");
  refs.memversesCount = container.querySelector("#memverses-count");
  refs.exportBtn = container.querySelector("#export-data-btn");
  refs.exportBtn.addEventListener("click", exportAllData);

  container.querySelector("#settings-lock-btn").addEventListener("click", () => {
    setUnlocked(false);
    buildLockScreen(container);
  });

  container.querySelector("#open-family-btn").addEventListener("click", () => buildFamilyView(container));
  container.querySelector("#open-library-btn").addEventListener("click", () => {
    libraryUnlocked = false; // always opens locked/read-only; tap the lock to edit
    buildLibraryView(container);
  });
  container.querySelector("#open-memverses-btn").addEventListener("click", () => buildMemoryVersesView(container));

  renderNavCounts();
}

function renderNavCounts() {
  if (refs.familyCount) refs.familyCount.textContent = `${users.length} member${users.length === 1 ? "" : "s"}`;
  if (refs.libraryCount) refs.libraryCount.textContent = `${questions.length} question${questions.length === 1 ? "" : "s"}`;
  if (refs.memversesCount) {
    refs.memversesCount.textContent = `${memoryVerses.length} verse${memoryVerses.length === 1 ? "" : "s"} · ${verseCategories.length} categor${verseCategories.length === 1 ? "y" : "ies"}`;
  }
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
    renderNavCounts();
  });
  subscribeQuestions((updated) => {
    questions = updated;
    if (refs.adminQuestionList) renderQuestionsAdmin();
    if (refs.userList) renderUsers();
    renderNavCounts();
  });
  subscribeMemoryVerses((updated) => {
    memoryVerses = updated;
    if (refs.userList) renderUsers();
    if (refs.categoryList) renderCategories();
    if (refs.verseAdminList) renderVersesAdmin();
    renderNavCounts();
  });
  subscribeVerseCategories((updated) => {
    verseCategories = updated;
    if (refs.categoryList) renderCategories();
    if (refs.verseAdminList) renderVersesAdmin();
    renderNavCounts();
  });
  subscribePlanState(({ planState: state, planStats: stats }) => {
    planState = state;
    planStats = stats;
    renderReadingPlanStat();
  });
}

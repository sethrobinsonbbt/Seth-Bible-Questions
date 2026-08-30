// Settings section: a simple passcode gate, then family member management
// and full question administration (add/edit/delete/assign to age group,
// plus the bulk-import buttons). This is the only place questions and
// family members are created or edited — the Questions tab itself is a
// read-only quiz view, safe for kids to use unsupervised.
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
  importQuestionBank,
  importFamilyQuestions,
} from "./questions-data.js";
import { QUESTION_BANK } from "./question-bank-data.js";
import { FAMILY_QUESTIONS } from "./family-question-bank.js";

const PASSWORD = "1967";
const UNLOCK_KEY = "bible-questions-settings-unlocked";

let users = [];
let questions = [];
let editingUserId = null;
let addingUser = false;
let editingQuestionId = null;
let questionFilter = "all"; // "all" | "unassigned" | an age-group id
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
      buildUnlockedView(container);
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

// ---------- Question admin ----------

function filteredQuestions() {
  if (questionFilter === "all") return questions;
  if (questionFilter === "unassigned") return questions.filter((q) => !q.assignedTo);
  return questions.filter((q) => q.assignedTo === questionFilter);
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
  unassignedOpt.textContent = "Library (unassigned)";
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

    if (editingQuestionId === q.id) {
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
        resetBtn.addEventListener("click", () => resetProgress(q.id));
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

    listEl.appendChild(li);
  });
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

// ---------- Import actions ----------

function countNew(items) {
  const existingText = new Set(questions.map((q) => q.text.trim().toLowerCase()));
  return items.filter((i) => !existingText.has(i.text.trim().toLowerCase())).length;
}

function runImportFamilyQuestions() {
  const count = countNew(FAMILY_QUESTIONS);
  if (count === 0) {
    alert("Every one of your family's questions is already in your list.");
    return;
  }
  if (!confirm(`Add ${count} question(s) from your family's list (with answers) into the Library?`)) return;
  importFamilyQuestions();
}

function runImportQuestionBank() {
  const count = countNew(QUESTION_BANK.map((text) => ({ text })));
  if (count === 0) {
    alert("Every question from the built-in bank is already in your list.");
    return;
  }
  if (!confirm(`Add ${count} question(s) from the built-in Bible trivia bank into the Library?`)) return;
  importQuestionBank();
}

// ---------- Shell ----------

function buildUnlockedView(container) {
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
        <h2>All Questions</h2>
        <div class="list-toolbar-actions">
          <button id="import-family-btn" class="btn">📥 Import Our Family's Questions</button>
          <button id="import-bank-btn" class="btn">📥 Import Question Bank</button>
          <button id="add-question-btn" class="btn btn-primary">+ Add Question</button>
        </div>
      </div>
      <select id="question-filter-select" class="assign-select"></select>
      <ul id="admin-question-list" class="question-list"></ul>
      <p id="admin-question-empty" class="empty-state" hidden>No questions match this filter.</p>
    </div>

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

  refs.userList = container.querySelector("#user-list");
  refs.userEmpty = container.querySelector("#user-empty");
  refs.adminQuestionList = container.querySelector("#admin-question-list");
  refs.adminQuestionEmpty = container.querySelector("#admin-question-empty");
  refs.filterSelect = container.querySelector("#question-filter-select");
  refs.qModalBackdrop = container.querySelector("#settings-question-modal-backdrop");
  refs.qModalText = container.querySelector("#settings-question-text");
  refs.qModalAnswer = container.querySelector("#settings-question-answer");
  refs.qModalReference = container.querySelector("#settings-question-reference");
  refs.qModalAssignWrap = container.querySelector("#settings-question-assign-wrap");
  refs.qModalError = container.querySelector("#settings-question-error");

  container.querySelector("#settings-lock-btn").addEventListener("click", () => {
    setUnlocked(false);
    buildLockScreen(container);
  });

  container.querySelector("#add-user-btn").addEventListener("click", () => {
    addingUser = true;
    renderUsers();
  });

  renderQuestionFilterSelect();
  refs.filterSelect.addEventListener("change", () => {
    questionFilter = refs.filterSelect.value;
    renderQuestionsAdmin();
  });

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

  container.querySelector("#import-family-btn").addEventListener("click", runImportFamilyQuestions);
  container.querySelector("#import-bank-btn").addEventListener("click", runImportQuestionBank);

  renderUsers();
  renderQuestionsAdmin();
}

export function mountSettings(container) {
  if (isUnlocked()) {
    buildUnlockedView(container);
  } else {
    buildLockScreen(container);
  }

  subscribeUsers((updated) => {
    users = updated;
    if (refs.userList) renderUsers();
  });
  subscribeQuestions((updated) => {
    questions = updated;
    if (refs.adminQuestionList) renderQuestionsAdmin();
  });
}

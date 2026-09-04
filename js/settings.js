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
  addMemoryVerse,
  updateMemoryVerseText,
  addVerseCategory,
  updateVerseCategory,
  deleteVerseCategory,
  assignVerseCategory,
  resetUserProgress as resetUserVerseProgress,
} from "./memorize-data.js";
import { subscribePlanState, refreshPlanStats, resetPlan } from "./daily-plan-data.js";
import { ready } from "./firebase.js";
import {
  getFamilyId,
  getFamilyPasscode,
  subscribeFamilyInfo,
  setFamilyId,
  scopedCollection,
  subscribeCodeRequests,
  dismissCodeRequest,
  changeFamilyCode,
  SCOPED_COLLECTION_NAMES,
} from "./family.js";
import { QUESTION_TYPES, questionTypeLabel, buildQuestionTypeEditor } from "./question-type-editor.js";
import { supportsSpeech, getEnglishVoices, getSelectedVoice, saveVoiceURI } from "./voice-picker.js";

const UNLOCK_KEY = "bible-questions-settings-unlocked";

let users = [];
let questions = [];
let memoryVerses = [];
let verseCategories = [];
let planStates = {}; // {[userId]: {startDate}} — from daily-plan-data.js
let planStatsByUser = {}; // {[userId]: stats} — from daily-plan-data.js
let familyName = null;
let codeRequests = [];
let codeRequestsUnsub = null;
let editingUserId = null;
let addingUser = false;
let editingQuestionId = null;
// Empty set = no filter (show everything). Otherwise each entry is an
// age-group id or "unassigned" — a question matches if its assignment is
// in this set. Multi-select, so you can e.g. see "7-10" and "11-15" at once.
let questionFilters = new Set();
let questionSearch = "";
let editingCategoryId = null;
let addingCategory = false;
// About/Credits lists real account details (an email, a username, a
// monthly cost) — not just admin controls — so it gets the same
// re-locks-every-time treatment as the Question Library, on top of the
// outer Setup passcode.
let aboutUnlocked = false;
let refs = {};

// What this site runs on — shown (passcode-gated) on the About subpage.
// Not a secret from the family, but real account details that shouldn't
// be casually stumbled into, since this is a public site with no real
// login (see the passcode fineprint above).
const ABOUT_SERVICES = [
  {
    icon: "🌐",
    name: "GitHub Pages",
    detail: "Hosts this site's files (free, static — no server). Account: seth@bigbrandtire.com.",
  },
  {
    icon: "🔥",
    name: "Firebase",
    detail: "Firestore database + anonymous sign-in — this is what syncs family members, questions, and progress across devices (free Spark plan). Account: sethjrobinson@gmail.com (Google).",
  },
  {
    icon: "🐷",
    name: "Porkbun",
    detail:
      "Domain registration. Username: sethjrobinson. Renews yearly, next due August 29, 2027 for all three: " +
      "christadelphian.family ($31.41/yr), christadelphian.bible ($41.88/yr), christadelphian.shop ($31.41/yr).",
  },
  {
    icon: "📖",
    name: "bible-api.com",
    detail: "Free public Bible text API — kept only as an automatic fallback now that the KJV text is bundled with the app itself.",
  },
];

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

// ---------- CSV/TSV parsing (Excel paste- and upload-friendly) ----------
// Excel/Sheets exports/uploads as CSV; copying cells and pasting directly
// pastes as TSV. Both are parsed the same way (RFC4180-ish: quoted fields
// may contain the delimiter, newlines, and "" for a literal quote). Header
// names are normalized (lowercased, spaces/underscores stripped) so
// "Assigned To" and "assignedTo" both resolve the same way, whether the
// data arrived as a spreadsheet or as pasted JSON from an older export.
function normalizeHeader(h) {
  return (h || "").toString().trim().toLowerCase().replace(/[\s_]+/g, "");
}

// Matches an imported row back to an existing question/verse by its text
// (or reference), tolerating the round-trip noise Excel/Sheets commonly
// introduce — curly quotes swapped in for straight ones, doubled-up
// whitespace, stray leading/trailing spaces — so editing a spreadsheet
// and re-importing it updates the matching item instead of silently
// failing to match and getting added as a duplicate.
function normalizeForMatch(str) {
  return (str || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
}

function splitDelimited(raw, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore — \n (if any) handles the line break
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Parses pasted/uploaded input into an array of plain objects keyed by
// normalized header name. Accepts CSV, TSV (an Excel copy/paste), or a
// JSON array (for anyone re-importing an older export) — auto-detected.
function parseTabularInput(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return [];

  if (trimmed[0] === "[") {
    const data = JSON.parse(trimmed);
    if (!Array.isArray(data)) throw new Error("Expected a JSON array of rows.");
    return data.map((item) => {
      const obj = {};
      Object.keys(item || {}).forEach((k) => (obj[normalizeHeader(k)] = item[k]));
      return obj;
    });
  }

  const firstLine = trimmed.split(/\r?\n/)[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? "\t" : ",";

  const table = splitDelimited(trimmed, delimiter).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) return [];
  const header = table[0].map(normalizeHeader);
  return table.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => (obj[h] = (r[i] || "").toString().trim()));
    return obj;
  });
}

function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}

function toCsv(headers, rows) {
  const lines = [headers.join(",")];
  rows.forEach((row) => lines.push(headers.map((h) => csvEscape(row[h])).join(",")));
  return lines.join("\r\n");
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
    if (input.value === getFamilyPasscode()) {
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

  const planState = planStates[user.id];
  const planStat = planStatsByUser[user.id];

  return { qCorrect, qWrong, vCorrect, vAttempts, planState, planStat };
}

function resetUserStats(user) {
  if (!confirm(`Reset ${user.name}'s stats? This clears their Questions, Memorize, and Reading Plan progress — it can't be undone.`)) {
    return;
  }
  resetUserQuestionProgress(user.id);
  resetUserVerseProgress(user.id);
  resetPlan(user.id);
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

      const { qCorrect, qWrong, vCorrect, vAttempts, planState, planStat } = userStatsLine(user);
      const statsEl = document.createElement("p");
      statsEl.className = "question-score";
      statsEl.textContent = `📖 Questions: ✅ ${qCorrect} · ❌ ${qWrong}   ✍️ Memorize: ✅ ${vCorrect} / ${vAttempts} attempts`;
      li.appendChild(statsEl);

      const planEl = document.createElement("p");
      planEl.className = "question-score";
      planEl.textContent = planState
        ? `📅 Reading Plan: 🔥 ${(planStat && planStat.currentStreak) || 0} day streak · ✅ ${(planStat && planStat.completed) || 0} completed · ❌ ${(planStat && planStat.missed) || 0} missed`
        : "📅 Reading Plan: not started yet";
      li.appendChild(planEl);

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

      if (qCorrect > 0 || qWrong > 0 || vAttempts > 0 || planState) {
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

function buildFamilyView(container) {
  refs = {};
  container.innerHTML = `
    <div class="settings-header">
      <button id="family-back-btn" class="btn btn-small">← Setup</button>
      <h2>👪 Family Members</h2>
      <span></span>
    </div>
    <div class="list-toolbar">
      <h2>Members</h2>
      <button id="add-user-btn" class="btn btn-primary">+ Add Member</button>
    </div>
    <ul id="user-list" class="question-list"></ul>
    <p id="user-empty" class="empty-state" hidden>No family members yet.</p>
  `;

  refs.userList = container.querySelector("#user-list");
  refs.userEmpty = container.querySelector("#user-empty");

  container.querySelector("#family-back-btn").addEventListener("click", () => buildMainView(container));
  container.querySelector("#add-user-btn").addEventListener("click", () => {
    addingUser = true;
    renderUsers();
  });

  renderUsers();
}

// ---------- Bulk import/export (shared by Question Library & Memory Verses) ----------

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// A paste-or-upload JSON import flow: parses rows, matches each one against
// what's already here, and shows a preview with counts before anything is
// actually added. A row that matches an existing item updates it in place
// (including any text change) instead of adding a duplicate; only rows that
// don't match anything become new items — so re-importing the same file
// (edited or not) is always safe.
//
// Matching is either `matchFn(row, existingItems)` — for callers that want
// ID-first matching (an "id" column, when present and still valid, wins;
// otherwise it falls back to a content key) — or the simpler `keyFn(item)`,
// used to build a one-time lookup map when there's no id column at all.
function openImportModal({ title, hint, sampleText, existingItems, keyFn, matchFn, parseRows, describeRow, onImportRow, downloadTemplate }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>${escapeHtml(title)}</h3>
      <p class="settings-fineprint">${hint}</p>
      ${downloadTemplate ? `<div class="import-template-row"><button id="import-template-btn" type="button" class="btn btn-small">⬇️ Download template (Excel-friendly)</button></div>` : ""}
      <label for="import-file-input">Upload a .csv file (or paste from Excel/Sheets below)</label>
      <input id="import-file-input" type="file" accept="text/csv,.csv,.tsv,text/tab-separated-values,application/json,.json" />
      <label for="import-textarea">…or copy cells from Excel/Sheets and paste here</label>
      <textarea id="import-textarea" rows="8" placeholder="${escapeHtml(sampleText)}"></textarea>
      <p id="import-error" class="form-error" hidden></p>
      <div id="import-preview" class="settings-panel" hidden></div>
      <div class="modal-actions">
        <button id="import-cancel-btn" class="btn">Cancel</button>
        <button id="import-preview-btn" class="btn">Preview</button>
        <button id="import-confirm-btn" class="btn btn-primary" hidden>Import</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  if (downloadTemplate) {
    backdrop.querySelector("#import-template-btn").addEventListener("click", downloadTemplate);
  }

  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector("#import-cancel-btn").addEventListener("click", close);

  const fileInput = backdrop.querySelector("#import-file-input");
  const textarea = backdrop.querySelector("#import-textarea");
  const errorEl = backdrop.querySelector("#import-error");
  const previewEl = backdrop.querySelector("#import-preview");
  const previewBtn = backdrop.querySelector("#import-preview-btn");
  const confirmBtn = backdrop.querySelector("#import-confirm-btn");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      textarea.value = reader.result;
    };
    reader.readAsText(file);
  });

  const existingByKey = keyFn ? new Map(existingItems.map((item) => [keyFn(item), item])) : null;
  const findMatch = matchFn ? (row) => matchFn(row, existingItems) : (row) => existingByKey.get(keyFn(row));
  let readyRows = null;

  previewBtn.addEventListener("click", () => {
    errorEl.hidden = true;
    previewEl.hidden = true;
    confirmBtn.hidden = true;
    readyRows = null;

    let rows;
    try {
      rows = parseRows(textarea.value);
    } catch (err) {
      errorEl.textContent = err.message || "Couldn't read that — check it matches the template.";
      errorEl.hidden = false;
      return;
    }
    if (rows.length === 0) {
      errorEl.textContent = "No rows found. Make sure the first row is a header (text, answer, reference, assignedTo, etc.).";
      errorEl.hidden = false;
      return;
    }

    readyRows = rows.map((row) => ({ row, existingMatch: findMatch(row) }));
    const updateCount = readyRows.filter((r) => r.existingMatch).length;

    previewEl.hidden = false;
    previewEl.innerHTML = `
      <p>${rows.length} row${rows.length === 1 ? "" : "s"} found${
        updateCount > 0
          ? ` — ${updateCount} match${updateCount === 1 ? "es" : ""} something already here and will be updated in place (not duplicated)`
          : ""
      }.</p>
      <ul class="question-list">
        ${readyRows
          .slice(0, 20)
          .map(
            ({ row, existingMatch }) =>
              `<li class="question-card"><p class="question-text">${escapeHtml(describeRow(row))}</p>${
                existingMatch ? `<p class="question-score">🔁 already here — will update</p>` : ""
              }</li>`
          )
          .join("")}
        ${readyRows.length > 20 ? `<li>…and ${readyRows.length - 20} more</li>` : ""}
      </ul>
    `;
    confirmBtn.hidden = false;
  });

  confirmBtn.addEventListener("click", () => {
    if (!readyRows) return;
    const updateCount = readyRows.filter((r) => r.existingMatch).length;
    readyRows.forEach(({ row, existingMatch }) => onImportRow(row, existingMatch));
    close();
    const addCount = readyRows.length - updateCount;
    const parts = [];
    if (addCount > 0) parts.push(`${addCount} added`);
    if (updateCount > 0) parts.push(`${updateCount} updated`);
    alert(`Done — ${parts.join(", ")}.`);
  });
}

// ---------- Question Library subpage ----------

function filteredQuestions() {
  let list = questions;
  if (questionFilters.size > 0) {
    list = list.filter((q) => questionFilters.has(q.assignedTo || "unassigned"));
  }

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

function questionFilterLabel() {
  if (questionFilters.size === 0) return "🔎 Filter: All";
  if (questionFilters.size === 1) {
    const [only] = questionFilters;
    return `🔎 Filter: ${only === "unassigned" ? "Unassigned" : ageGroupLabel(only)}`;
  }
  return `🔎 Filter: ${questionFilters.size} selected`;
}

function renderQuestionFilterDropdown() {
  refs.filterSummary.textContent = questionFilterLabel();
  refs.filterPanel.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.checked = questionFilters.has(cb.value);
  });
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

      const typeEditor = buildQuestionTypeEditor(q);
      li.appendChild(typeEditor.el);

      const answerInput = document.createElement("input");
      answerInput.type = "text";
      answerInput.className = "edit-answer-input";
      answerInput.placeholder = "Answer (optional)";
      answerInput.value = q.answer || "";

      const referenceInput = document.createElement("input");
      referenceInput.type = "text";
      referenceInput.className = "edit-answer-input";
      referenceInput.placeholder = "Reference (optional) — e.g. Genesis 1:3";
      referenceInput.value = q.reference || "";

      // The plain "answer" field is classic-only — hide it for the other
      // types, where the type-specific fields above are the real answer.
      function syncAnswerVisibility() {
        answerInput.hidden = typeEditor.typeSelect.value !== "classic";
      }
      typeEditor.typeSelect.addEventListener("change", syncAnswerVisibility);
      syncAnswerVisibility();

      li.appendChild(answerInput);
      li.appendChild(referenceInput);

      const errorEl = document.createElement("p");
      errorEl.className = "form-error";
      errorEl.hidden = true;
      li.appendChild(errorEl);

      const actions = document.createElement("div");
      actions.className = "question-row-actions";

      const saveBtn = document.createElement("button");
      saveBtn.className = "btn btn-primary btn-small";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => {
        const val = textarea.value.trim();
        if (!val) return;
        const typeData = typeEditor.collect();
        const err = typeEditor.validate(typeData);
        if (err) {
          errorEl.textContent = err;
          errorEl.hidden = false;
          return;
        }
        updateQuestion(q.id, {
          ...typeData,
          text: val,
          answer: typeData.type === "classic" ? answerInput.value.trim() : "",
          reference: referenceInput.value.trim(),
        });
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

      if (q.type && q.type !== "classic") {
        const typeLine = document.createElement("p");
        typeLine.className = "question-answer";
        if (q.type === "multiple-choice") {
          typeLine.textContent = `🔘 Multiple Choice — ${(q.choices || []).length} choices`;
        } else if (q.type === "order") {
          typeLine.textContent = `🔢 Put in Order — ${(q.items || []).join(" → ")}`;
        } else if (q.type === "select-all") {
          typeLine.textContent = `☑️ Select All — ${(q.options || []).length} options`;
        }
        if (q.reference) typeLine.textContent += ` — Reference: ${q.reference}`;
        li.appendChild(typeLine);
      } else if (q.answer || q.reference) {
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

    listEl.appendChild(li);
  });
}

function openAddQuestionModal() {
  refs.qModalText.value = "";
  refs.qModalAnswer.value = "";
  refs.qModalReference.value = "";
  refs.qModalError.hidden = true;

  const typeEditor = buildQuestionTypeEditor(null);
  refs.qModalTypeWrap.innerHTML = "";
  refs.qModalTypeWrap.appendChild(typeEditor.el);
  refs.qModalTypeEditor = typeEditor;
  function syncAnswerVisibility() {
    refs.qModalAnswer.hidden = typeEditor.typeSelect.value !== "classic";
    refs.qModalAnswer.previousElementSibling.hidden = refs.qModalAnswer.hidden;
  }
  typeEditor.typeSelect.addEventListener("change", syncAnswerVisibility);
  syncAnswerVisibility();

  const onlyFilter = questionFilters.size === 1 ? [...questionFilters][0] : "";
  const select = buildAgeGroupSelect(onlyFilter === "unassigned" ? "" : onlyFilter);
  refs.qModalAssignWrap.innerHTML = "";
  refs.qModalAssignWrap.appendChild(select);
  refs.qModalAssign = select;
  refs.qModalBackdrop.hidden = false;
  refs.qModalText.focus();
}

function closeAddQuestionModal() {
  refs.qModalBackdrop.hidden = true;
}

function questionKey(item) {
  return normalizeForMatch(item.text);
}

// A row with a still-valid "id" matches that exact question, however much
// its text has changed — that's what lets you rename a question on
// re-import instead of just editing everything but the wording. A row
// without an id (freshly typed, or from an export made before this column
// existed) falls back to matching by text, same as before.
function questionMatchFn(row, existingItems) {
  if (row.id) {
    const byId = existingItems.find((q) => q.id === row.id);
    if (byId) return byId;
  }
  const key = questionKey(row);
  return existingItems.find((q) => questionKey(q) === key) || null;
}

const QUESTION_CSV_HEADERS = [
  "id",
  "text",
  "answer",
  "reference",
  "assignedTo",
  "type",
  "choices",
  "correctChoice",
  "items",
  "options",
  "correctOptions",
];

// Choices/items/options and their correct answer(s) are packed into a
// single cell each, pipe-separated (e.g. "Genesis|Exodus|Leviticus") — one
// wide CSV covers every question type instead of needing one template per
// type. `correctChoice`/`correctOptions` reference the actual text (not a
// position), so reordering choices in a spreadsheet can't silently point
// the correct answer at the wrong one.
function splitPipe(str) {
  return (str || "")
    .toString()
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function joinPipe(list) {
  return (list || []).join("|");
}

function exportQuestions() {
  const rows = questions.map((q) => ({
    id: q.id,
    text: q.text,
    answer: q.answer || "",
    reference: q.reference || "",
    assignedTo: q.assignedTo || "",
    type: q.type && q.type !== "classic" ? q.type : "",
    choices: q.type === "multiple-choice" ? joinPipe(q.choices) : "",
    correctChoice: q.type === "multiple-choice" && q.correctIndex != null ? (q.choices || [])[q.correctIndex] || "" : "",
    items: q.type === "order" ? joinPipe(q.items) : "",
    options: q.type === "select-all" ? joinPipe(q.options) : "",
    correctOptions:
      q.type === "select-all" ? joinPipe((q.correctIndices || []).map((i) => (q.options || [])[i]).filter(Boolean)) : "",
  }));
  downloadFile(`questions-export-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(QUESTION_CSV_HEADERS, rows), "text/csv");
}

function downloadQuestionTemplate() {
  downloadFile(
    "questions-template.csv",
    toCsv(QUESTION_CSV_HEADERS, [
      { text: "Who built the ark?", answer: "Noah", reference: "Genesis 6:14", assignedTo: "7-10" },
      {
        text: "What is the first book of the Bible?",
        assignedTo: "adult",
        type: "multiple-choice",
        choices: "Genesis|Exodus|Leviticus",
        correctChoice: "Genesis",
      },
      {
        text: "Put the months in order, starting with January",
        assignedTo: "adult",
        type: "order",
        items: "January|February|March",
      },
      {
        text: "Which of these are among the Ten Commandments?",
        assignedTo: "adult",
        type: "select-all",
        options: "Honor your father and mother|Steal from your neighbor|Keep the Sabbath holy",
        correctOptions: "Honor your father and mother|Keep the Sabbath holy",
      },
    ]),
    "text/csv"
  );
}

function parseQuestionRows(raw) {
  const data = parseTabularInput(raw);
  return data.map((item, i) => {
    const text = ((item.text ?? item.question) || "").toString().trim();
    if (!text) throw new Error(`Row ${i + 1} is missing a question ("text").`);
    const rawType = (item.type || "").toString().trim();
    const type = QUESTION_TYPES.some((t) => t.id === rawType) ? rawType : "classic";

    const row = {
      id: (item.id || "").toString().trim() || null,
      text,
      answer: (item.answer || "").toString().trim(),
      reference: (item.reference || "").toString().trim(),
      assignedTo: (item.assignedto || "").toString().trim() || null,
      type,
      choices: null,
      correctIndex: null,
      items: null,
      options: null,
      correctIndices: null,
    };

    if (type === "multiple-choice") {
      const choices = splitPipe(item.choices);
      if (choices.length < 2) {
        throw new Error(`Row ${i + 1} (${text}): multiple-choice needs at least 2 "choices" separated by |.`);
      }
      const correctChoice = (item.correctchoice || "").toString().trim();
      const correctIndex = choices.findIndex((c) => normalizeForMatch(c) === normalizeForMatch(correctChoice));
      if (correctIndex === -1) {
        throw new Error(`Row ${i + 1} (${text}): "correctChoice" must match one of the "choices" exactly.`);
      }
      row.choices = choices;
      row.correctIndex = correctIndex;
    } else if (type === "order") {
      const items = splitPipe(item.items);
      if (items.length < 2) {
        throw new Error(`Row ${i + 1} (${text}): order needs at least 2 "items" separated by |, listed in the correct order.`);
      }
      row.items = items;
    } else if (type === "select-all") {
      const options = splitPipe(item.options);
      if (options.length < 2) {
        throw new Error(`Row ${i + 1} (${text}): select-all needs at least 2 "options" separated by |.`);
      }
      const correctOptions = splitPipe(item.correctoptions);
      const correctIndices = correctOptions
        .map((co) => options.findIndex((o) => normalizeForMatch(o) === normalizeForMatch(co)))
        .filter((idx) => idx !== -1);
      if (correctIndices.length === 0) {
        throw new Error(`Row ${i + 1} (${text}): "correctOptions" must match one or more of the "options" exactly.`);
      }
      row.options = options;
      row.correctIndices = correctIndices;
    }

    return row;
  });
}

function openQuestionImportModal() {
  openImportModal({
    title: "Import Questions",
    hint: `Open the template in Excel/Sheets, fill in a row per question, then either save it as a .csv and upload it, or just copy the cells and paste them below. Columns: text, answer, reference (optional), assignedTo — one of ${AGE_GROUPS.map(
      (g) => `"${g.id}"`
    ).join(", ")} (or leave it blank for Unassigned). Leave "type" blank for a classic question. For Multiple Choice, set type to "multiple-choice" and fill "choices" and "correctChoice" (choices separated by | , e.g. "Genesis|Exodus|Leviticus"). For Put in Order, set type to "order" and list "items" separated by | in the correct order. For Select All, set type to "select-all" and fill "options" and "correctOptions" (also | -separated). "id" is filled in automatically when you Export — leave it in place to update that exact question (even a text change is treated as an edit, not a new question) or clear it to add a brand-new one. Download the template below for worked examples of each.`,
    sampleText: "text, answer, reference, assignedTo\nWho built the ark?, Noah, Genesis 6:14, 7-10",
    existingItems: questions,
    matchFn: questionMatchFn,
    parseRows: parseQuestionRows,
    describeRow: (row) => row.text + (row.answer ? ` — ${row.answer}` : row.type !== "classic" ? ` (${questionTypeLabel(row.type)})` : ""),
    onImportRow: (row, existingMatch) => {
      const data = {
        text: row.text,
        answer: row.answer,
        reference: row.reference,
        type: row.type,
        choices: row.choices,
        correctIndex: row.correctIndex,
        items: row.items,
        options: row.options,
        correctIndices: row.correctIndices,
      };
      if (existingMatch) {
        updateQuestion(existingMatch.id, data);
        if (row.assignedTo !== (existingMatch.assignedTo || null)) {
          updateQuestionAssignment(existingMatch.id, row.assignedTo);
        }
      } else {
        addQuestion({ ...data, assignedTo: row.assignedTo });
      }
    },
    downloadTemplate: downloadQuestionTemplate,
  });
}

function buildLibraryView(container) {
  refs = {};
  container.innerHTML = `
    <div class="settings-header">
      <button id="library-back-btn" class="btn btn-small">← Setup</button>
      <h2>📚 Question Library</h2>
      <span></span>
    </div>

    <div class="question-filter-row">
      <input id="question-search-input" type="text" placeholder="🔍 Search questions…" />
    </div>
    <div class="list-toolbar-actions">
      <button id="add-question-btn" class="btn btn-primary">+ Add Question</button>
      <details class="filter-dropdown" id="question-filter-dropdown">
        <summary class="btn btn-small" id="question-filter-summary">🔎 Filter: All</summary>
        <div class="filter-dropdown-panel">
          <label class="filter-check"><input type="checkbox" value="unassigned" /> Unassigned</label>
          ${AGE_GROUPS.map((g) => `<label class="filter-check"><input type="checkbox" value="${g.id}" /> ${g.label}</label>`).join("")}
          <div class="filter-dropdown-actions">
            <button type="button" id="question-filter-clear-btn" class="btn btn-small">Clear</button>
            <button type="button" id="question-filter-done-btn" class="btn btn-small btn-primary">Done</button>
          </div>
        </div>
      </details>
      <button id="export-questions-btn" class="btn btn-small">⬇️ Export</button>
      <button id="import-questions-btn" class="btn btn-small">⬆️ Import</button>
    </div>
    <ul id="admin-question-list" class="question-list"></ul>
    <p id="admin-question-empty" class="empty-state" hidden>No questions match this filter.</p>

    <div id="settings-question-modal-backdrop" class="modal-backdrop" hidden>
      <div class="modal">
        <h3>Add Question</h3>
        <label for="settings-question-text">Question</label>
        <textarea id="settings-question-text" rows="4" placeholder="e.g. Who built the ark?"></textarea>
        <label>Type</label>
        <div id="settings-question-type-wrap"></div>
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
  refs.filterDropdown = container.querySelector("#question-filter-dropdown");
  refs.filterSummary = container.querySelector("#question-filter-summary");
  refs.filterPanel = container.querySelector(".filter-dropdown-panel");

  container.querySelector("#library-back-btn").addEventListener("click", () => buildMainView(container));

  renderQuestionFilterDropdown();
  refs.filterPanel.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) questionFilters.add(cb.value);
      else questionFilters.delete(cb.value);
      renderQuestionFilterDropdown();
      renderQuestionsAdmin();
    });
  });
  container.querySelector("#question-filter-clear-btn").addEventListener("click", () => {
    questionFilters.clear();
    renderQuestionFilterDropdown();
    renderQuestionsAdmin();
  });
  container.querySelector("#question-filter-done-btn").addEventListener("click", () => {
    refs.filterDropdown.open = false;
  });

  refs.searchInput = container.querySelector("#question-search-input");
  refs.searchInput.value = questionSearch;
  refs.searchInput.addEventListener("input", () => {
    questionSearch = refs.searchInput.value;
    renderQuestionsAdmin();
  });

  refs.qModalBackdrop = container.querySelector("#settings-question-modal-backdrop");
  refs.qModalText = container.querySelector("#settings-question-text");
  refs.qModalTypeWrap = container.querySelector("#settings-question-type-wrap");
  refs.qModalAnswer = container.querySelector("#settings-question-answer");
  refs.qModalReference = container.querySelector("#settings-question-reference");
  refs.qModalAssignWrap = container.querySelector("#settings-question-assign-wrap");
  refs.qModalError = container.querySelector("#settings-question-error");

  container.querySelector("#add-question-btn").addEventListener("click", openAddQuestionModal);
  container.querySelector("#export-questions-btn").addEventListener("click", exportQuestions);
  container.querySelector("#import-questions-btn").addEventListener("click", openQuestionImportModal);
  container.querySelector("#settings-question-cancel-btn").addEventListener("click", closeAddQuestionModal);
  refs.qModalBackdrop.addEventListener("click", (e) => {
    if (e.target === refs.qModalBackdrop) closeAddQuestionModal();
  });
  container.querySelector("#settings-question-save-btn").addEventListener("click", () => {
    const text = refs.qModalText.value.trim();
    if (!text) {
      refs.qModalError.textContent = "Give the question some text.";
      refs.qModalError.hidden = false;
      return;
    }
    const typeData = refs.qModalTypeEditor.collect();
    const typeErr = refs.qModalTypeEditor.validate(typeData);
    if (typeErr) {
      refs.qModalError.textContent = typeErr;
      refs.qModalError.hidden = false;
      return;
    }
    const answer = refs.qModalAnswer.value.trim();
    if (typeData.type === "classic" && !answer) {
      refs.qModalError.textContent = "An answer is required (reference is optional).";
      refs.qModalError.hidden = false;
      return;
    }
    const reference = refs.qModalReference.value.trim();
    const assignedTo = refs.qModalAssign.value || null;
    addQuestion({
      ...typeData,
      text,
      answer: typeData.type === "classic" ? answer : "",
      reference,
      assignedTo,
    });
    closeAddQuestionModal();
  });

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

function verseKey(item) {
  return normalizeForMatch(item.reference);
}

const VERSE_CSV_HEADERS = ["reference", "text", "category"];

function exportVerses() {
  const rows = memoryVerses.map((v) => {
    const cat = verseCategories.find((c) => c.id === v.categoryId);
    return { reference: v.reference, text: v.text, category: cat ? cat.name : "" };
  });
  downloadFile(`memory-verses-export-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(VERSE_CSV_HEADERS, rows), "text/csv");
}

function downloadVerseTemplate() {
  downloadFile(
    "memory-verses-template.csv",
    toCsv(VERSE_CSV_HEADERS, [{ reference: "John 3:16", text: "For God so loved the world...", category: "Salvation" }]),
    "text/csv"
  );
}

function parseVerseRows(raw) {
  const data = parseTabularInput(raw);
  return data.map((item, i) => {
    const reference = ((item.reference) || "").toString().trim();
    const text = ((item.text) || "").toString().trim();
    if (!reference || !text) throw new Error(`Row ${i + 1} needs both a reference and text.`);
    const categoryName = ((item.category) || "").toString().trim();
    const match = categoryName && verseCategories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
    return { reference, text, categoryId: match ? match.id : null, categoryName };
  });
}

function openVerseImportModal() {
  openImportModal({
    title: "Import Memory Verses",
    hint: 'Open the template in Excel/Sheets, fill in a row per verse, then either save it as a .csv and upload it, or just copy the cells and paste them below. "category" should match an existing category name exactly (see above) — anything else, or left blank, comes in Uncategorized.',
    sampleText: "reference, text, category\nJohn 3:16, For God so loved the world..., Salvation",
    existingItems: memoryVerses,
    keyFn: verseKey,
    parseRows: parseVerseRows,
    describeRow: (row) =>
      `${row.reference} — ${row.text.length > 70 ? row.text.slice(0, 70) + "…" : row.text}` +
      (row.categoryName && !row.categoryId ? ` (category "${row.categoryName}" not found — will be Uncategorized)` : ""),
    onImportRow: (row, existingMatch) => {
      if (existingMatch) {
        updateMemoryVerseText(existingMatch.id, row.reference, row.text);
        if (row.categoryId !== (existingMatch.categoryId || null)) {
          assignVerseCategory(existingMatch.id, row.categoryId);
        }
      } else {
        addMemoryVerse(row.reference, row.text, row.categoryId);
      }
    },
    downloadTemplate: downloadVerseTemplate,
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
        <div class="list-toolbar-actions">
          <button id="export-verses-btn" class="btn btn-small">⬇️ Export</button>
          <button id="import-verses-btn" class="btn btn-small">⬆️ Import</button>
        </div>
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
  container.querySelector("#export-verses-btn").addEventListener("click", exportVerses);
  container.querySelector("#import-verses-btn").addEventListener("click", openVerseImportModal);

  renderCategories();
  renderVersesAdmin();
}

// ---------- About / Credits subpage ----------

function buildAboutView(container) {
  refs = {};

  if (!aboutUnlocked) {
    container.innerHTML = `
      <div class="settings-header">
        <button id="about-back-btn" class="btn btn-small">← Setup</button>
        <h2>ℹ️ About</h2>
        <span></span>
      </div>
      <div class="settings-lock">
        <p>This page lists the actual accounts this site runs on — enter the passcode again to view it.</p>
        <input id="about-password-input" type="password" inputmode="numeric" placeholder="Passcode" />
        <p id="about-password-error" class="form-error" hidden>That's not it — try again.</p>
        <button id="about-unlock-btn" class="btn btn-primary">Unlock</button>
      </div>
    `;
    container.querySelector("#about-back-btn").addEventListener("click", () => buildMainView(container));
    const input = container.querySelector("#about-password-input");
    const submit = () => {
      if (input.value === getFamilyPasscode()) {
        aboutUnlocked = true;
        buildAboutView(container);
      } else {
        container.querySelector("#about-password-error").hidden = false;
        input.value = "";
        input.focus();
      }
    };
    container.querySelector("#about-unlock-btn").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    return;
  }

  container.innerHTML = `
    <div class="settings-header">
      <button id="about-back-btn" class="btn btn-small">← Setup</button>
      <h2>ℹ️ About</h2>
      <button id="about-lock-btn" class="btn btn-small">🔓 Viewing</button>
    </div>
    <p class="settings-fineprint">What this site runs on. This list includes real account details —
    it's tucked behind the passcode, but remember that's a soft deterrent, not real security
    (see the note on the main Setup screen).</p>
    <ul class="settings-nav-list">
      ${ABOUT_SERVICES.map(
        (s) => `
        <li class="about-service">
          <span class="settings-nav-icon">${s.icon}</span>
          <span class="settings-nav-text"><strong>${escapeHtml(s.name)}</strong><span class="about-service-detail">${escapeHtml(s.detail)}</span></span>
        </li>`
      ).join("")}
    </ul>
  `;

  container.querySelector("#about-back-btn").addEventListener("click", () => buildMainView(container));
  container.querySelector("#about-lock-btn").addEventListener("click", () => {
    aboutUnlocked = false;
    buildAboutView(container);
  });
}

// ---------- Data export ----------

async function exportAllData() {
  const btn = refs.exportBtn;
  const originalText = btn.textContent;
  btn.textContent = "Exporting…";
  btn.disabled = true;
  try {
    const db = await ready;
    const data = {};
    for (const name of SCOPED_COLLECTION_NAMES) {
      const snapshot = await scopedCollection(db, name).get();
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
    <p id="settings-family-name" class="settings-fineprint"></p>
    <div class="settings-panel">
      <div class="list-toolbar">
        <h2>Family Code</h2>
      </div>
      <p class="settings-fineprint">Share this with the rest of the family so their devices can join —
      each one only needs to enter it once. Tapping "Copy Join Link" gives them a link that fills it in
      automatically.</p>
      <p id="family-code-display" class="family-code-display"></p>
      <button id="copy-join-link-btn" class="btn btn-small">📋 Copy Join Link</button>
      <button id="change-family-code-btn" class="btn btn-small">✏️ Change Code</button>
    </div>

    <div id="voice-panel" class="settings-panel" hidden>
      <div class="list-toolbar">
        <h2>🔊 Reading Voice</h2>
      </div>
      <p class="settings-fineprint">Used when a Bible chapter is read aloud (the 🔊 Listen button). Picking a voice plays a quick sample of it.</p>
      <select id="voice-select" class="bible-select"></select>
    </div>

    <div id="code-requests-panel" class="settings-panel" hidden>
      <div class="list-toolbar">
        <h2>📨 Code Requests</h2>
      </div>
      <p class="settings-fineprint">Someone tried to join using this family's name but didn't have the
      code. Reach out yourself with the contact info below, then dismiss it.</p>
      <ul id="code-requests-list" class="question-list"></ul>
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
      <li><button id="open-about-btn" class="settings-nav-link">
        <span class="settings-nav-icon">ℹ️</span>
        <span class="settings-nav-text"><strong>About</strong><span>What this site runs on</span></span>
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

    <div class="settings-panel">
      <div class="list-toolbar">
        <h2>This Device</h2>
      </div>
      <p class="settings-fineprint">Switches this device to a different family's code. You'll need this family's code again to come back.</p>
      <button id="switch-family-btn" class="btn btn-danger">Switch Family</button>
    </div>
  `;

  refs.familyCount = container.querySelector("#family-count");
  refs.libraryCount = container.querySelector("#library-count");
  refs.memversesCount = container.querySelector("#memverses-count");
  refs.familyNameEl = container.querySelector("#settings-family-name");
  refs.exportBtn = container.querySelector("#export-data-btn");
  refs.exportBtn.addEventListener("click", exportAllData);

  refs.voicePanel = container.querySelector("#voice-panel");
  refs.voiceSelect = container.querySelector("#voice-select");
  refreshVoicePanel();

  const familyCodeEl = container.querySelector("#family-code-display");
  const familyCode = getFamilyId() || "";
  familyCodeEl.textContent = familyCode;
  container.querySelector("#copy-join-link-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const originalText = btn.textContent;
    const joinLink = `${window.location.origin}${window.location.pathname}?family=${familyCode}`;
    try {
      await navigator.clipboard.writeText(joinLink);
      btn.textContent = "✅ Copied!";
    } catch (err) {
      // Clipboard access can be blocked (older browsers, non-HTTPS, etc.) —
      // fall back to just showing the link so it can be copied by hand.
      prompt("Copy this link:", joinLink);
    }
    setTimeout(() => {
      btn.textContent = originalText;
    }, 1500);
  });

  container.querySelector("#change-family-code-btn").addEventListener("click", async (e) => {
    const raw = prompt("New family code (e.g. an adjective + noun + digits):");
    if (!raw || !raw.trim()) return;
    if (
      !confirm(
        `Change this family's code to "${raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")}"? Every other device will need this new code to keep working — share it with them right after. The old code stops working here, though nothing is deleted.`
      )
    ) {
      return;
    }
    const btn = e.currentTarget;
    const originalText = btn.textContent;
    btn.textContent = "Changing…";
    btn.disabled = true;
    try {
      const db = await ready;
      const result = await changeFamilyCode(db, raw);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      alert(`Done! This family's code is now ${result.newCode}. Share it with the rest of the family so they can update their own devices.`);
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Couldn't change the code — check your internet connection and try again.");
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });

  container.querySelector("#settings-lock-btn").addEventListener("click", () => {
    setUnlocked(false);
    buildLockScreen(container);
  });

  container.querySelector("#open-family-btn").addEventListener("click", () => buildFamilyView(container));
  container.querySelector("#open-library-btn").addEventListener("click", () => buildLibraryView(container));
  container.querySelector("#open-memverses-btn").addEventListener("click", () => buildMemoryVersesView(container));
  container.querySelector("#open-about-btn").addEventListener("click", () => {
    aboutUnlocked = false; // always opens locked; tap through with the passcode to view
    buildAboutView(container);
  });
  container.querySelector("#switch-family-btn").addEventListener("click", () => {
    if (confirm("Switch to a different family? You'll need a family code to get back in — this one included.")) {
      // Setup's unlocked state is a plain device-wide flag, not tied to a
      // family — without clearing it here, the next family would find
      // Setup already unlocked without ever entering its own passcode.
      setUnlocked(false);
      setFamilyId(null);
      window.location.reload();
    }
  });

  refs.codeRequestsPanel = container.querySelector("#code-requests-panel");
  refs.codeRequestsList = container.querySelector("#code-requests-list");

  renderNavCounts();
  renderFamilyName();
  renderCodeRequests();
}

function renderCodeRequests() {
  const panel = refs.codeRequestsPanel;
  const listEl = refs.codeRequestsList;
  if (!panel || !listEl) return;
  panel.hidden = codeRequests.length === 0;
  listEl.innerHTML = "";
  codeRequests.forEach((r) => {
    const li = document.createElement("li");
    li.className = "question-card";

    const contactEl = document.createElement("p");
    contactEl.className = "question-text";
    contactEl.textContent = r.contact;
    li.appendChild(contactEl);

    const actions = document.createElement("div");
    actions.className = "question-row-actions";
    const dismissBtn = document.createElement("button");
    dismissBtn.className = "btn btn-small";
    dismissBtn.textContent = "Got it — dismiss";
    dismissBtn.addEventListener("click", () => {
      ready.then((db) => dismissCodeRequest(db, r.id));
    });
    actions.appendChild(dismissBtn);
    li.appendChild(actions);

    listEl.appendChild(li);
  });
}

// Read aloud on picking a new voice, so you can hear it before committing
// to it for actual chapter reading.
const VOICE_SAMPLE_TEXT = "In the beginning God created the heaven and the earth.";

function speakVoiceSample(voice) {
  // Some browsers (Chrome in particular) silently drop an utterance queued
  // right after cancel() in the same tick — only cancel when something's
  // actually speaking, same guard bible-reader.js's own Listen feature
  // already uses around its identical cancel()-then-speak() sequence.
  if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(VOICE_SAMPLE_TEXT);
  try {
    utterance.voice = voice;
  } catch (e) {
    // Stale voice reference (the engine's own list moved on since this one
    // was fetched) — fall back to the engine's default rather than not
    // speaking at all, same as bible-reader.js's Listen feature does.
  }
  window.speechSynthesis.speak(utterance);
}

// Shows/populates the Voice panel once the browser has actually finished
// loading its voice list — speechSynthesis.getVoices() commonly returns
// empty (or an incomplete list) the first time it's called, especially on
// Android Chrome; the full list only becomes available once the async
// "voiceschanged" event fires (wired once in mountSettings), so this runs
// both right after Setup's main view renders and again whenever that event
// fires, re-querying getEnglishVoices() fresh each time.
function refreshVoicePanel() {
  const panel = refs.voicePanel;
  const select = refs.voiceSelect;
  if (!panel || !select) return;
  if (!supportsSpeech()) {
    panel.hidden = true;
    return;
  }
  const voices = getEnglishVoices();
  panel.hidden = voices.length <= 1;
  if (voices.length <= 1) return;
  const current = getSelectedVoice();
  select.innerHTML = "";
  voices.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = v.name;
    select.appendChild(opt);
  });
  if (current) select.value = current.voiceURI;
  select.onchange = () => {
    saveVoiceURI(select.value);
    const voice = voices.find((v) => v.voiceURI === select.value);
    if (voice) speakVoiceSample(voice);
  };
}

function renderNavCounts() {
  if (refs.familyCount) refs.familyCount.textContent = `${users.length} member${users.length === 1 ? "" : "s"}`;
  if (refs.libraryCount) refs.libraryCount.textContent = `${questions.length} question${questions.length === 1 ? "" : "s"}`;
  if (refs.memversesCount) {
    refs.memversesCount.textContent = `${memoryVerses.length} verse${memoryVerses.length === 1 ? "" : "s"} · ${verseCategories.length} categor${verseCategories.length === 1 ? "y" : "ies"}`;
  }
}

function renderFamilyName() {
  if (refs.familyNameEl) refs.familyNameEl.textContent = familyName ? familyName : "";
}

export function mountSettings(container) {
  if (isUnlocked()) {
    buildMainView(container);
  } else {
    buildLockScreen(container);
  }

  // The voice list itself typically finishes loading asynchronously,
  // separately from any one render of the main view — see refreshVoicePanel.
  if (supportsSpeech()) {
    window.speechSynthesis.onvoiceschanged = refreshVoicePanel;
  }

  subscribeUsers((updated) => {
    users = updated;
    users.forEach((u) => refreshPlanStats(u.id));
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
  subscribePlanState(({ planStates: states, planStatsByUser: statsByUser }) => {
    planStates = states;
    planStatsByUser = statsByUser;
    if (refs.userList) renderUsers();
  });
  subscribeFamilyInfo((info) => {
    familyName = info ? info.name : null;
    renderFamilyName();
    if (codeRequestsUnsub) {
      codeRequestsUnsub();
      codeRequestsUnsub = null;
    }
    if (familyName) {
      ready.then((db) => {
        codeRequestsUnsub = subscribeCodeRequests(db, familyName, (matches) => {
          codeRequests = matches;
          renderCodeRequests();
        });
      });
    }
  });
}

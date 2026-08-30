// "Questions" section: a random-question quiz card cycling through
// whichever family members are toggled on in the "Questions for:" row.
// Turns rotate alphabetically by name, one question per turn, each scoped
// to that person's own age groups. Adding/deleting questions and managing
// family members both live in the password-protected Setup section;
// editing a question's text is also available right here via a
// passcode-gated Edit button, for quick fixes mid-quiz.
import { subscribeQuestions, recordAnswer, updateQuestion } from "./questions-data.js";
import { subscribeUsers } from "./users.js";
import { getActiveUser } from "./active-user.js";
import { fetchVerseRange } from "./bible-api.js";
import { getFamilyPasscode } from "./family.js";

let users = [];
let allQuestions = [];
// null = not yet defaulted (waiting on the first real users list); after
// that it's the persisted array of user ids toggled on in "Questions for:".
let includedUserIds = null;
let currentTurnUserId = null;
let currentRandomId = null;
let showingAnswer = false;
let history = []; // [{ userId, questionId }, ...], for ‹ Back / Next › browsing
let historyIndex = -1;
let verseTextCache = {};
let editingQuestionId = null;
// Live state for whichever multiple-choice/order/select-all question is
// currently on screen — keyed by question id so it survives incidental
// re-renders (e.g. an unrelated Firestore update) but resets on a new pick.
let interactiveState = null;

// How many recently-shown questions to avoid immediately repeating — a
// question (right OR wrong) won't come up again until at least this many
// others have been shown first, per person.
const RECENCY_WINDOW = 10;

const INCLUDED_KEY = "bible-questions:quiz-included-ids";

const el = (id) => document.getElementById(id);

function loadIncluded() {
  try {
    const raw = localStorage.getItem(INCLUDED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveIncluded(ids) {
  try {
    localStorage.setItem(INCLUDED_KEY, JSON.stringify(ids));
  } catch (e) {
    // ignore — storage unavailable, non-critical
  }
}

// Computed once, the first time a real (non-empty) users list shows up:
// whichever member is picked in the header's "who's using this" selector
// (if any), otherwise everyone — so the page works immediately without
// forcing a selection first. After that, only manually toggling a chip
// changes who's included; a newly added family member starts untoggled.
function ensureIncludedDefaults() {
  if (includedUserIds !== null || users.length === 0) return;
  const stored = loadIncluded();
  if (stored) {
    includedUserIds = stored.filter((id) => users.some((u) => u.id === id));
    return;
  }
  const active = getActiveUser();
  includedUserIds = active && users.some((u) => u.id === active) ? [active] : users.map((u) => u.id);
}

function includedUsersSorted() {
  return users.filter((u) => includedUserIds.includes(u.id)).sort((a, b) => a.name.localeCompare(b.name));
}

function questionsForUser(user) {
  if (!user) return [];
  const groups = new Set(user.ageGroups || []);
  return allQuestions.filter((q) => q.assignedTo && groups.has(q.assignedTo));
}

// Per-question stats for one user: how many times they've been asked this
// one and how many of those they got right.
function questionStatsFor(q, userId) {
  const p = (q.progress && q.progress[userId]) || {};
  const correctCount = p.correctCount || 0;
  const wrongCount = p.wrongCount || 0;
  return { correctCount, wrongCount, asked: correctCount + wrongCount };
}

// Weighted so a question this user gets wrong more often comes up more
// often, without ever fully excluding the ones they know well — a 100%
// wrong question is picked ~4x as often as a perfect one.
function weightFor(q, userId) {
  const { wrongCount, asked } = questionStatsFor(q, userId);
  if (asked === 0) return 1;
  return 1 + (wrongCount / asked) * 3;
}

function weightedRandomPick(list, userId) {
  const weights = list.map((q) => weightFor(q, userId));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

// Picks the next question for this user: brand-new (never-asked) questions
// first, then a weighted pick favoring ones they've gotten wrong more —
// while avoiding repeating anything from the last RECENCY_WINDOW shown to
// them specifically, so a just-missed question doesn't immediately come
// right back around.
function pickRandomQuestion(list, userId, recentIds) {
  if (list.length === 0) return null;
  const recentSet = new Set((recentIds || []).slice(-RECENCY_WINDOW));
  const notRecent = list.filter((q) => !recentSet.has(q.id));
  const pool = notRecent.length > 0 ? notRecent : list;

  const newOnes = pool.filter((q) => questionStatsFor(q, userId).asked === 0);
  if (newOnes.length > 0) {
    return newOnes[Math.floor(Math.random() * newOnes.length)];
  }
  return weightedRandomPick(pool, userId);
}

// Question ids already shown to this specific person this session, for
// pickRandomQuestion's recency check — kept per-person so Timmy's recent
// questions don't block a repeat for Susie, and vice versa.
function personHistory(userId) {
  return history.filter((h) => h.userId === userId).map((h) => h.questionId);
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

// The next person (alphabetically, wrapping around) after `afterUserId`
// who actually has at least one assigned question — skips anyone with an
// empty pool so the rotation never gets stuck on them. `afterUserId` of
// null starts from the top of the list.
function nextTurnUser(afterUserId) {
  const list = includedUsersSorted();
  if (list.length === 0) return null;
  const startIdx = afterUserId ? list.findIndex((u) => u.id === afterUserId) : -1;
  for (let step = 1; step <= list.length; step++) {
    const candidate = list[mod(startIdx + step, list.length)];
    if (questionsForUser(candidate).length > 0) return candidate;
  }
  return null;
}

// Renders the "Questions for:" chip row — every family member, each
// independently toggleable (not just an Adult folding in kids anymore).
function renderQuizForRow() {
  const row = el("quiz-for-row");
  if (users.length === 0) {
    row.hidden = true;
    return;
  }
  row.hidden = false;

  // Keep the label, drop any previously-rendered chips.
  Array.from(row.querySelectorAll(".chip")).forEach((chip) => chip.remove());

  const sorted = [...users].sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach((u) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (includedUserIds.includes(u.id) ? " active" : "");
    chip.textContent = u.name;
    chip.addEventListener("click", () => {
      includedUserIds = includedUserIds.includes(u.id)
        ? includedUserIds.filter((id) => id !== u.id)
        : [...includedUserIds, u.id];
      saveIncluded(includedUserIds);
      // The rotation just changed — drop whatever was mid-browse.
      currentTurnUserId = null;
      currentRandomId = null;
      interactiveState = null;
      history = [];
      historyIndex = -1;
      render();
    });
    row.appendChild(chip);
  });
}

// Fetches and shows the cited verse's text for the currently-revealed
// question. Guards against a stale response landing after the user has
// already moved on to a different question.
function loadVerseTextFor(reference, forRandomId) {
  const verseTextEl = el("random-verse-text");
  if (!reference) {
    verseTextEl.hidden = true;
    return;
  }
  const cached = verseTextCache[reference];
  if (cached) {
    verseTextEl.hidden = false;
    verseTextEl.textContent = cached;
    return;
  }
  verseTextEl.hidden = false;
  verseTextEl.textContent = "Loading verse…";
  fetchVerseRange(reference, "kjv")
    .then((result) => {
      if (forRandomId !== currentRandomId) return; // superseded
      verseTextCache[reference] = result.text;
      verseTextEl.textContent = result.text;
    })
    .catch(() => {
      if (forRandomId !== currentRandomId) return;
      verseTextEl.textContent = "Couldn't load verse text.";
    });
}

// Renders whichever question/person `currentRandomId`/`currentTurnUserId`
// point at, picking a fresh first turn if nothing's shown yet.
function renderRandomCard() {
  const card = el("random-card");
  const included = includedUsersSorted();
  if (included.length === 0) {
    card.hidden = true;
    el("empty-state").hidden = true;
    el("no-selection-msg").hidden = false;
    return;
  }
  el("no-selection-msg").hidden = true;

  if (!currentTurnUserId || !currentRandomId) {
    const firstUser = nextTurnUser(null);
    if (!firstUser) {
      card.hidden = true;
      el("empty-state").hidden = false;
      return;
    }
    const pick = pickRandomQuestion(questionsForUser(firstUser), firstUser.id, personHistory(firstUser.id));
    pushHistory(firstUser.id, pick.id);
  }

  const user = users.find((u) => u.id === currentTurnUserId);
  const pick = allQuestions.find((q) => q.id === currentRandomId);
  if (!user || !pick) {
    // Stale reference (person or question removed/reassigned) — repick.
    currentTurnUserId = null;
    currentRandomId = null;
    renderRandomCard();
    return;
  }

  el("empty-state").hidden = true;
  card.hidden = false;
  el("random-person").textContent = user.name;

  const { correctCount, asked } = questionStatsFor(pick, user.id);
  const needsReview = !!(pick.progress && pick.progress[user.id] && pick.progress[user.id].needsReview);

  const statEl = el("random-question-stat");
  if (asked > 0) {
    statEl.hidden = false;
    statEl.textContent = `${correctCount}/${asked}`;
    statEl.classList.toggle("random-question-stat-warn", needsReview);
  } else {
    statEl.hidden = true;
  }

  el("random-text").textContent = pick.text;
  el("random-back-btn").disabled = historyIndex <= 0;

  if (pick.type && pick.type !== "classic") {
    // The other question types are always tap-driven and self-grading —
    // no Show Answer step.
    el("random-answer").hidden = true;
    el("random-reveal-actions").hidden = true;
    el("random-grade-actions").hidden = true;
    el("random-verse-text").hidden = true;
    renderInteractive(pick);
    return;
  }
  el("random-interactive").hidden = true;

  // Always requires tapping Show Answer first — Wrong/Correct only ever
  // replace it in the same spot once that's happened, never alongside it.
  const revealed = showingAnswer;
  const hasAnswerContent = !!(pick.answer || pick.reference);
  el("random-answer").hidden = !revealed || !hasAnswerContent;
  el("random-answer").textContent = [pick.answer && `Answer: ${pick.answer}`, pick.reference && `Reference: ${pick.reference}`]
    .filter(Boolean)
    .join(" — ");
  el("random-reveal-actions").hidden = revealed;
  el("random-grade-actions").hidden = !revealed;

  if (revealed && pick.reference) {
    loadVerseTextFor(pick.reference, pick.id);
  } else {
    el("random-verse-text").hidden = true;
  }
}

// ---------- Multiple choice / order / select-all: tap-driven quiz UI ----------

function shuffledIndices(n) {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

function ensureInteractiveState(pick) {
  if (interactiveState && interactiveState.id === pick.id) return interactiveState;
  let n = 0;
  if (pick.type === "multiple-choice") n = (pick.choices || []).length;
  else if (pick.type === "order") n = (pick.items || []).length;
  else if (pick.type === "select-all") n = (pick.options || []).length;
  interactiveState = {
    id: pick.id,
    answered: false,
    selectedIndex: null,
    orderPicks: [],
    checked: new Set(),
    shuffleOrder: shuffledIndices(n),
  };
  return interactiveState;
}

// Credits the answer, then pauses briefly so the tap feedback is visible
// before moving on to the next question.
function finishInteractive(pick, wasCorrect) {
  creditAnswer(pick, wasCorrect);
  setTimeout(() => {
    if (currentRandomId !== pick.id) return; // moved on already
    interactiveState = null;
    nextRandomQuestion();
  }, 1200);
}

function renderInteractive(pick) {
  const host = el("random-interactive");
  host.hidden = false;
  host.innerHTML = "";
  const state = ensureInteractiveState(pick);

  if (pick.type === "multiple-choice") renderMultipleChoice(host, pick, state);
  else if (pick.type === "order") renderOrder(host, pick, state);
  else if (pick.type === "select-all") renderSelectAll(host, pick, state);
}

function renderMultipleChoice(host, pick, state) {
  const list = document.createElement("div");
  list.className = "interactive-choice-list";
  state.shuffleOrder.forEach((origIdx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "interactive-choice-btn";
    btn.textContent = pick.choices[origIdx];
    if (state.answered) {
      btn.disabled = true;
      if (origIdx === pick.correctIndex) btn.classList.add("choice-correct");
      else if (origIdx === state.selectedIndex) btn.classList.add("choice-wrong");
    } else {
      btn.addEventListener("click", () => {
        state.answered = true;
        state.selectedIndex = origIdx;
        const wasCorrect = origIdx === pick.correctIndex;
        renderInteractive(pick);
        finishInteractive(pick, wasCorrect);
      });
    }
    list.appendChild(btn);
  });
  host.appendChild(list);
}

function renderOrder(host, pick, state) {
  const remaining = state.shuffleOrder.filter((idx) => !state.orderPicks.includes(idx));

  const pickedList = document.createElement("ol");
  pickedList.className = "interactive-order-picked";
  state.orderPicks.forEach((idx) => {
    const li = document.createElement("li");
    li.textContent = pick.items[idx];
    pickedList.appendChild(li);
  });
  if (state.orderPicks.length > 0) host.appendChild(pickedList);

  const chipRow = document.createElement("div");
  chipRow.className = "interactive-order-chips";
  remaining.forEach((idx) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "interactive-order-chip";
    chip.textContent = pick.items[idx];
    chip.addEventListener("click", () => {
      if (state.answered) return;
      state.orderPicks.push(idx);
      if (state.orderPicks.length === state.shuffleOrder.length) {
        state.answered = true;
        const wasCorrect = state.orderPicks.every((v, i) => v === i);
        renderInteractive(pick);
        finishInteractive(pick, wasCorrect);
      } else {
        renderInteractive(pick);
      }
    });
    chipRow.appendChild(chip);
  });
  host.appendChild(chipRow);

  if (state.answered) {
    const wasCorrect = state.orderPicks.every((v, i) => v === i);
    const resultEl = document.createElement("p");
    resultEl.className = "interactive-result";
    resultEl.textContent = wasCorrect ? "✅ Correct order!" : `❌ Not quite — correct order: ${pick.items.join(" → ")}`;
    host.appendChild(resultEl);
  }
}

function renderSelectAll(host, pick, state) {
  const correctSet = new Set(pick.correctIndices);
  const wasCorrect = () => correctSet.size === state.checked.size && [...correctSet].every((idx) => state.checked.has(idx));

  const list = document.createElement("div");
  list.className = "interactive-choice-list";
  state.shuffleOrder.forEach((idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "interactive-choice-btn interactive-choice-toggle";
    btn.textContent = (state.checked.has(idx) ? "☑️ " : "⬜ ") + pick.options[idx];
    if (state.answered) {
      btn.disabled = true;
      if (correctSet.has(idx)) btn.classList.add("choice-correct");
      else if (state.checked.has(idx)) btn.classList.add("choice-wrong");
    } else {
      btn.classList.toggle("choice-selected", state.checked.has(idx));
      btn.addEventListener("click", () => {
        if (state.checked.has(idx)) state.checked.delete(idx);
        else state.checked.add(idx);
        renderInteractive(pick);
      });
    }
    list.appendChild(btn);
  });
  host.appendChild(list);

  if (!state.answered) {
    const submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.className = "btn btn-primary";
    submitBtn.textContent = "Submit";
    submitBtn.disabled = state.checked.size === 0;
    submitBtn.addEventListener("click", () => {
      state.answered = true;
      const correct = wasCorrect();
      renderInteractive(pick);
      finishInteractive(pick, correct);
    });
    host.appendChild(submitBtn);
  } else {
    const resultEl = document.createElement("p");
    resultEl.className = "interactive-result";
    resultEl.textContent = wasCorrect() ? "✅ Correct!" : "❌ Not quite — correct ones are highlighted.";
    host.appendChild(resultEl);
  }
}

// Records a freshly-shown question id for a person, truncating any "redo"
// history past the current point (mirrors normal back/forward browsing).
function pushHistory(userId, questionId) {
  history = history.slice(0, historyIndex + 1);
  history.push({ userId, questionId });
  historyIndex = history.length - 1;
  currentTurnUserId = userId;
  currentRandomId = questionId;
  showingAnswer = false;
}

// Forces a fresh pick (used by "Next ›" / Correct / Wrong / finishing an
// interactive question) — advances the rotation to the next included
// person, as opposed to renderRandomCard's default of preserving whatever
// is currently shown across incidental re-renders (e.g. an unrelated
// Firestore update).
function nextRandomQuestion() {
  if (historyIndex < history.length - 1) {
    // Already have a "forward" entry from a previous Back — reuse it.
    historyIndex++;
    const entry = history[historyIndex];
    currentTurnUserId = entry.userId;
    currentRandomId = entry.questionId;
    showingAnswer = false;
  } else {
    const nextUser = nextTurnUser(currentTurnUserId);
    if (!nextUser) return;
    const pick = pickRandomQuestion(questionsForUser(nextUser), nextUser.id, personHistory(nextUser.id));
    if (!pick) return;
    pushHistory(nextUser.id, pick.id);
  }
  renderRandomCard();
}

function previousQuestion() {
  if (historyIndex <= 0) return;
  historyIndex--;
  const entry = history[historyIndex];
  currentTurnUserId = entry.userId;
  currentRandomId = entry.questionId;
  showingAnswer = false;
  renderRandomCard();
}

function revealAnswer() {
  showingAnswer = true;
  renderRandomCard();
}

function creditAnswer(pick, wasCorrect) {
  if (!currentTurnUserId) return;
  recordAnswer(pick.id, currentTurnUserId, wasCorrect);
}

function answerCurrent(wasCorrect) {
  if (!currentRandomId || !currentTurnUserId) return;
  const pick = allQuestions.find((q) => q.id === currentRandomId);
  if (!pick) return;
  creditAnswer(pick, wasCorrect);
  nextRandomQuestion();
}

function tryEditCurrentQuestion() {
  const pick = allQuestions.find((q) => q.id === currentRandomId);
  if (!pick) return;
  const entered = prompt("Enter the Setup passcode to edit this question:");
  if (entered === null) return;
  if (entered !== getFamilyPasscode()) {
    alert("Incorrect passcode.");
    return;
  }
  openEditModal(pick);
}

function openEditModal(pick) {
  editingQuestionId = pick.id;
  el("q-edit-text").value = pick.text || "";
  el("q-edit-answer").value = pick.answer || "";
  el("q-edit-reference").value = pick.reference || "";
  el("q-edit-error").hidden = true;
  el("q-edit-modal-backdrop").hidden = false;
}

function closeEditModal() {
  editingQuestionId = null;
  el("q-edit-modal-backdrop").hidden = true;
}

function saveEdit() {
  const text = el("q-edit-text").value.trim();
  if (!text) {
    el("q-edit-error").textContent = "Question text can't be empty.";
    el("q-edit-error").hidden = false;
    return;
  }
  const answer = el("q-edit-answer").value.trim();
  const reference = el("q-edit-reference").value.trim();
  const existing = allQuestions.find((q) => q.id === editingQuestionId);
  updateQuestion(editingQuestionId, { ...existing, text, answer, reference });
  verseTextCache = {}; // reference may have changed
  closeEditModal();
}

function render() {
  ensureIncludedDefaults();

  if (users.length === 0) {
    el("no-users-msg").hidden = false;
    el("quiz-for-row").hidden = true;
    el("random-card").hidden = true;
    el("empty-state").hidden = true;
    el("no-selection-msg").hidden = true;
    return;
  }
  el("no-users-msg").hidden = true;

  renderQuizForRow();
  renderRandomCard();
}

export function mountQuestions() {
  el("random-back-btn").addEventListener("click", previousQuestion);
  el("random-next-btn").addEventListener("click", nextRandomQuestion);
  el("random-show-answer-btn").addEventListener("click", revealAnswer);
  el("random-correct-btn").addEventListener("click", () => answerCurrent(true));
  el("random-wrong-btn").addEventListener("click", () => answerCurrent(false));
  el("random-edit-btn").addEventListener("click", tryEditCurrentQuestion);
  el("q-edit-cancel-btn").addEventListener("click", closeEditModal);
  el("q-edit-save-btn").addEventListener("click", saveEdit);
  el("q-edit-modal-backdrop").addEventListener("click", (e) => {
    if (e.target === el("q-edit-modal-backdrop")) closeEditModal();
  });

  subscribeUsers((updated) => {
    users = updated;
    render();
  });
  subscribeQuestions((updated) => {
    allQuestions = updated;
    render();
  });
}

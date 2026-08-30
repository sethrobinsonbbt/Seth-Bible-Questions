// "Questions" section: a random-question quiz card for whoever is picked in
// the global "who's using this" selector at the top of the app (see
// main.js / active-user.js), covering every age group that person belongs
// to. An Adult can also toggle on other family members ("Include: ...") to
// fold their age groups into the pool — handy for a parent quizzing a kid
// directly from the adult's own login. Adding/deleting questions and
// managing family members both live in the password-protected Setup
// section; editing a question's text is also available right here via a
// passcode-gated Edit button, for quick fixes mid-quiz.
import { subscribeQuestions, recordAnswer, updateQuestion } from "./questions-data.js";
import { subscribeUsers } from "./users.js";
import { subscribeActiveUser } from "./active-user.js";
import { fetchVerseRange } from "./bible-api.js";
import { getFamilyPasscode } from "./family.js";

let users = [];
let allQuestions = [];
let activeUserId = null;
let currentRandomId = null;
let currentIsForSelf = true;
let showingAnswer = false;
let history = []; // question ids shown, in order, for the ‹ Back / Next › browsing
let historyIndex = -1;
let includedKidIds = [];
let verseTextCache = {};
let editingQuestionId = null;

// How many recently-shown questions to avoid immediately repeating — a
// question (right OR wrong) won't come up again until at least this many
// others have been shown first.
const RECENCY_WINDOW = 10;

const el = (id) => document.getElementById(id);

function isAdult(user) {
  return !!user && (user.ageGroups || []).includes("adult");
}

function includedKidsStorageKey(userId) {
  return `bible-questions:included-kids:${userId}`;
}

function loadIncludedKids(userId) {
  try {
    const raw = localStorage.getItem(includedKidsStorageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveIncludedKids(userId, ids) {
  try {
    localStorage.setItem(includedKidsStorageKey(userId), JSON.stringify(ids));
  } catch (e) {
    // ignore — storage unavailable, non-critical
  }
}

// The full set of age groups that should count as "this person's
// questions" right now: their own, plus any included family member's
// (an Adult quizzing their kids from their own login).
function effectiveAgeGroups(user) {
  const groups = new Set(user.ageGroups || []);
  if (isAdult(user)) {
    includedKidIds.forEach((id) => {
      const kid = users.find((u) => u.id === id);
      if (kid) (kid.ageGroups || []).forEach((g) => groups.add(g));
    });
  }
  return groups;
}

// A question "is for self" when it matches the active user's own age
// groups — as opposed to only matching an included kid's, which puts the
// quiz into kid-mode (auto-shown answer + verse text).
function isPickForSelf(pick, user) {
  return (user.ageGroups || []).includes(pick.assignedTo);
}

function questionsForUser(user) {
  if (!user) return [];
  const groups = effectiveAgeGroups(user);
  return allQuestions.filter((q) => q.assignedTo && groups.has(q.assignedTo));
}

function activeUser() {
  return users.find((u) => u.id === activeUserId) || null;
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
// while avoiding repeating anything from the last RECENCY_WINDOW shown, so
// a just-missed question doesn't immediately come right back around.
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

// Renders the "Include: ..." chip row — only relevant for an Adult active
// user with other family members to fold in.
function renderIncludeKidsRow() {
  const row = el("include-kids-row");
  const user = activeUser();
  const others = user ? users.filter((u) => u.id !== user.id) : [];

  if (!user || !isAdult(user) || others.length === 0) {
    row.hidden = true;
    return;
  }
  row.hidden = false;

  // Keep the label, drop any previously-rendered chips.
  Array.from(row.querySelectorAll(".chip")).forEach((chip) => chip.remove());

  others.forEach((kid) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (includedKidIds.includes(kid.id) ? " active" : "");
    chip.textContent = kid.name;
    chip.addEventListener("click", () => {
      includedKidIds = includedKidIds.includes(kid.id)
        ? includedKidIds.filter((id) => id !== kid.id)
        : [...includedKidIds, kid.id];
      saveIncludedKids(user.id, includedKidIds);
      // The question pool just changed — drop whatever was mid-browse.
      currentRandomId = null;
      history = [];
      historyIndex = -1;
      render();
    });
    row.appendChild(chip);
  });
}

// Fetches and shows the cited verse's text for the currently-shown
// question (kid-mode only). Guards against a stale response landing after
// the user has already moved on to a different question.
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

// Renders whichever question `currentRandomId` points at, refreshing its
// live score/review state. Falls back to picking a random one if that id
// isn't in the current user's list (person switch, or it was deleted/reassigned).
function renderRandomCard(list) {
  const card = el("random-card");
  const user = activeUser();
  if (!user) {
    card.hidden = true;
    return;
  }
  if (list.length === 0) {
    card.hidden = true;
    el("empty-state").hidden = false;
    return;
  }
  el("empty-state").hidden = true;
  card.hidden = false;
  el("random-person").textContent = user.name;

  const correctTotal = list.reduce((sum, q) => sum + ((q.progress && q.progress[user.id] && q.progress[user.id].correctCount) || 0), 0);
  const reviewCount = list.filter((q) => q.progress && q.progress[user.id] && q.progress[user.id].needsReview).length;
  el("random-score").textContent = `✅ ${correctTotal} correct so far${reviewCount > 0 ? ` · 🔁 ${reviewCount} to review` : ""}`;

  let pick = list.find((q) => q.id === currentRandomId);
  if (!pick) {
    pick = pickRandomQuestion(list, user.id, history);
    pushHistory(pick.id);
  }

  currentIsForSelf = isPickForSelf(pick, user);
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

  const hasAnswerContent = !!(pick.answer || pick.reference);
  const revealed = !currentIsForSelf || !hasAnswerContent || showingAnswer;

  el("random-answer").hidden = !revealed;
  el("random-answer").textContent = [pick.answer && `Answer: ${pick.answer}`, pick.reference && `Reference: ${pick.reference}`]
    .filter(Boolean)
    .join(" — ");
  el("random-reveal-actions").hidden = revealed;
  el("random-grade-actions").hidden = !revealed;
  el("random-back-btn").disabled = historyIndex <= 0;

  if (currentIsForSelf) {
    el("random-verse-text").hidden = true;
  } else {
    loadVerseTextFor(pick.reference, pick.id);
  }
}

// Records a freshly-shown question id, truncating any "redo" history past
// the current point (mirrors normal back/forward browsing).
function pushHistory(id) {
  history = history.slice(0, historyIndex + 1);
  history.push(id);
  historyIndex = history.length - 1;
  currentRandomId = id;
  showingAnswer = false;
}

// Forces a fresh pick (used by "Next ›" / Correct / Wrong), as opposed to
// renderRandomCard's default of preserving whatever is currently shown
// across incidental re-renders (e.g. an unrelated Firestore update).
function nextRandomQuestion() {
  const user = activeUser();
  const list = questionsForUser(user);
  if (list.length === 0) return;

  if (historyIndex < history.length - 1) {
    // Already have a "forward" entry from a previous Back — reuse it.
    historyIndex++;
    currentRandomId = history[historyIndex];
    showingAnswer = false;
  } else {
    pushHistory(pickRandomQuestion(list, user.id, history).id);
  }
  renderRandomCard(list);
}

function previousQuestion() {
  if (historyIndex <= 0) return;
  historyIndex--;
  currentRandomId = history[historyIndex];
  showingAnswer = false;
  renderRandomCard(questionsForUser(activeUser()));
}

function revealAnswer() {
  showingAnswer = true;
  renderRandomCard(questionsForUser(activeUser()));
}

// In kid-mode, "Correct"/"Wrong" should credit every included kid whose
// age group this question was actually assigned to — not the adult asking
// it, and not kids who wouldn't have been shown this question on their own.
function answerCurrent(wasCorrect) {
  const user = activeUser();
  if (!currentRandomId || !user) return;
  const pick = allQuestions.find((q) => q.id === currentRandomId);
  if (!pick) return;

  if (currentIsForSelf) {
    recordAnswer(currentRandomId, user.id, wasCorrect);
  } else {
    includedKidIds.forEach((kidId) => {
      const kid = users.find((u) => u.id === kidId);
      if (kid && (kid.ageGroups || []).includes(pick.assignedTo)) {
        recordAnswer(currentRandomId, kidId, wasCorrect);
      }
    });
  }
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
  updateQuestion(editingQuestionId, text, answer, reference);
  verseTextCache = {}; // reference may have changed
  closeEditModal();
}

function render() {
  if (users.length === 0) {
    el("no-users-msg").hidden = false;
    el("no-active-user-msg").hidden = true;
    el("include-kids-row").hidden = true;
    el("random-card").hidden = true;
    el("empty-state").hidden = true;
    return;
  }
  el("no-users-msg").hidden = true;

  const user = activeUser();
  if (!user) {
    el("no-active-user-msg").hidden = false;
    el("include-kids-row").hidden = true;
    el("random-card").hidden = true;
    el("empty-state").hidden = true;
    return;
  }
  el("no-active-user-msg").hidden = true;

  renderIncludeKidsRow();
  const list = questionsForUser(user);
  renderRandomCard(list);
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
  subscribeActiveUser((id) => {
    activeUserId = id;
    currentRandomId = null;
    history = [];
    historyIndex = -1;
    includedKidIds = id ? loadIncludedKids(id) : [];
    render();
  });
}

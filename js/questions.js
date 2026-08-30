// "Questions" section: one tab per family member (managed in Settings),
// each showing a random-question quiz card for every age group that member
// belongs to. Adding/editing/assigning questions and managing family
// members both live in the password-protected Settings section — this view
// is quiz-only, safe for kids to use on their own.
import { subscribeQuestions, recordAnswer } from "./questions-data.js";
import { subscribeUsers } from "./users.js";

let users = [];
let allQuestions = [];
let activeUserId = null;
let currentRandomId = null;
let showingAnswer = false;

const el = (id) => document.getElementById(id);

function questionsForUser(user) {
  if (!user) return [];
  const groups = user.ageGroups || [];
  return allQuestions.filter((q) => q.assignedTo && groups.includes(q.assignedTo));
}

function activeUser() {
  return users.find((u) => u.id === activeUserId) || null;
}

function pickRandomQuestion(list, userId, excludeId) {
  const reviewPool = list.filter((q) => q.progress && q.progress[userId] && q.progress[userId].needsReview);
  const pool = reviewPool.length > 0 ? reviewPool : list;
  let candidates = pool;
  if (excludeId && pool.length > 1) {
    const filtered = pool.filter((q) => q.id !== excludeId);
    if (filtered.length > 0) candidates = filtered;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function renderTabs() {
  const tabsEl = el("tabs");
  tabsEl.innerHTML = "";

  if (users.length === 0) {
    el("no-users-msg").hidden = false;
    el("random-card").hidden = true;
    el("question-list").innerHTML = "";
    el("empty-state").hidden = true;
    return;
  }
  el("no-users-msg").hidden = true;

  if (!activeUserId || !users.find((u) => u.id === activeUserId)) {
    activeUserId = users[0].id;
  }

  users.forEach((user) => {
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (user.id === activeUserId ? " active" : "");
    btn.textContent = user.name;
    btn.addEventListener("click", () => {
      activeUserId = user.id;
      currentRandomId = null;
      render();
    });
    tabsEl.appendChild(btn);
  });
}

// Renders whichever question `currentRandomId` points at, refreshing its
// live score/review state. Falls back to picking a random one if that id
// isn't in the current user's list (tab switch, or it was deleted/reassigned).
function renderRandomCard(list) {
  const card = el("random-card");
  const user = activeUser();
  if (!user || list.length === 0) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  el("random-person").textContent = user.name;

  const correctTotal = list.reduce((sum, q) => sum + ((q.progress && q.progress[user.id] && q.progress[user.id].correctCount) || 0), 0);
  const reviewCount = list.filter((q) => q.progress && q.progress[user.id] && q.progress[user.id].needsReview).length;
  el("random-score").textContent = `✅ ${correctTotal} correct so far${reviewCount > 0 ? ` · 🔁 ${reviewCount} to review` : ""}`;

  let pick = list.find((q) => q.id === currentRandomId);
  if (!pick) {
    pick = pickRandomQuestion(list, user.id, currentRandomId);
    currentRandomId = pick.id;
    showingAnswer = false;
  }

  const pickProgress = (pick.progress && pick.progress[user.id]) || {};

  el("random-text").textContent = pick.text;
  el("random-review-tag").hidden = !pickProgress.needsReview;
  el("random-answer").hidden = !showingAnswer;
  el("random-answer").textContent = pick.answer ? `Answer: ${pick.answer}` : "";
  el("random-show-answer-btn").hidden = !pick.answer;
  el("random-show-answer-btn").textContent = showingAnswer ? "🙈 Hide Answer" : "👁️ Show Answer";
}

// Forces a fresh pick (used by "Skip" / Correct / Wrong), as opposed to
// renderRandomCard's default of preserving whatever is currently shown
// across incidental re-renders (e.g. an unrelated Firestore update).
function nextRandomQuestion() {
  const user = activeUser();
  const list = questionsForUser(user);
  if (list.length === 0) return;
  currentRandomId = pickRandomQuestion(list, user.id, currentRandomId).id;
  showingAnswer = false;
  renderRandomCard(list);
}

function toggleAnswer() {
  showingAnswer = !showingAnswer;
  el("random-answer").hidden = !showingAnswer;
  el("random-show-answer-btn").textContent = showingAnswer ? "🙈 Hide Answer" : "👁️ Show Answer";
}

function answerCurrent(wasCorrect) {
  const user = activeUser();
  if (!currentRandomId || !user) return;
  recordAnswer(currentRandomId, user.id, wasCorrect);
  nextRandomQuestion();
}

function renderList(list) {
  const listEl = el("question-list");
  const emptyEl = el("empty-state");
  const user = activeUser();
  listEl.innerHTML = "";

  el("list-title").textContent = user ? `${user.name}'s Questions` : "Questions";

  if (users.length === 0) {
    emptyEl.hidden = true;
    return;
  }
  if (list.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  list.forEach((q) => {
    const li = document.createElement("li");
    li.className = "question-card";

    const p = document.createElement("p");
    p.className = "question-text";
    p.textContent = q.text;
    li.appendChild(p);

    const progress = (q.progress && q.progress[user.id]) || {};
    const correct = progress.correctCount || 0;
    const wrong = progress.wrongCount || 0;
    if (correct > 0 || wrong > 0) {
      const scoreLine = document.createElement("p");
      scoreLine.className = "question-score";
      scoreLine.textContent = `✅ ${correct} · ❌ ${wrong}${progress.needsReview ? " · 🔁 needs review" : ""}`;
      li.appendChild(scoreLine);
    }

    listEl.appendChild(li);
  });
}

function render() {
  renderTabs();
  const user = activeUser();
  const list = questionsForUser(user);
  renderRandomCard(list);
  renderList(list);
}

export function mountQuestions() {
  el("random-next-btn").addEventListener("click", nextRandomQuestion);
  el("random-show-answer-btn").addEventListener("click", toggleAnswer);
  el("random-correct-btn").addEventListener("click", () => answerCurrent(true));
  el("random-wrong-btn").addEventListener("click", () => answerCurrent(false));

  subscribeUsers((updated) => {
    users = updated;
    render();
  });
  subscribeQuestions((updated) => {
    allQuestions = updated;
    render();
  });
}

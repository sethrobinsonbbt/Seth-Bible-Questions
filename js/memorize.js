// Verse memorization: a personal bank of KJV verses, with two practice modes:
//   1. "Guess the Reference" — shown the verse, identify the reference
//      (multiple choice, or type it in for a harder challenge).
//   2. "Fill in the Blanks" — shown the reference, type the first letter of
//      each word from memory. A 5-level scaffold decides how many words are
//      already filled in for you (easiest) vs. fully blank (hardest).
import { ready } from "./firebase.js";
import { fetchVerseRange } from "./bible-api.js";
import { subscribeUsers } from "./users.js";

const VERSION = "kjv"; // memorization is always King James per the spec
const ACTIVE_USER_KEY = "bible-questions-memorize-active-user";

// Common short/function words revealed first at easier levels, so the words
// left to recall are the more distinctive ones. Includes KJV-specific terms.
const STOPWORDS = new Set([
  "a","an","the","and","or","but","if","of","to","in","on","at","by","for","with","as",
  "is","are","was","were","be","been","being","it","its","he","she","they","them","his","her","their",
  "i","you","we","us","our","your","this","that","these","those","not","so","then","than","when","which",
  "who","whom","what","all","have","has","had","do","did","does","from","into","unto","up","out","no","yes",
  "shall","will","would","should","could","can","may","might","must","thee","thou","thy","thine","ye","art",
  "hast","hath","doth","O","one","also","upon","among","because","therefore","behold",
]);

let db = null;
let verses = []; // [{id, reference, text, progress}]
let users = [];
let activeUserId = loadActiveUser();
let refs = {};
let view = "list"; // "list" | "guess" | "blanks"
let guessDifficulty = "easy"; // "easy" | "hard"
let blanksLevel = 0; // 0 (Beginner/most filled) .. 4 (Expert/all blank)
let currentVerseId = null;
let currentOptions = [];
let blanksTokens = [];
let answered = false;

function loadActiveUser() {
  try {
    return localStorage.getItem(ACTIVE_USER_KEY) || null;
  } catch (e) {
    return null;
  }
}

function saveActiveUser(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_USER_KEY, id);
    else localStorage.removeItem(ACTIVE_USER_KEY);
  } catch (e) {
    /* ignore */
  }
}

function recordVerseProgress(verseId, wasCorrect) {
  if (!db || !activeUserId) return;
  const v = verses.find((v) => v.id === verseId);
  if (!v) return;
  const prev = (v.progress && v.progress[activeUserId]) || { correctCount: 0, attempts: 0 };
  db.collection("memoryVerses")
    .doc(verseId)
    .update({
      [`progress.${activeUserId}`]: {
        correctCount: (prev.correctCount || 0) + (wasCorrect ? 1 : 0),
        attempts: (prev.attempts || 0) + 1,
      },
    });
}

function pickRandomVerse(excludeId) {
  const pool = excludeId ? verses.filter((v) => v.id !== excludeId) : verses;
  const list = pool.length > 0 ? pool : verses;
  return list[Math.floor(Math.random() * list.length)];
}

function normalizeRef(str) {
  return str.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------- Firestore actions ----------

async function addVerse(reference) {
  const errorEl = refs.addError;
  errorEl.hidden = true;
  try {
    const data = await fetchVerseRange(reference, VERSION);
    if (!data.text) throw new Error("That reference didn't return any text.");
    if (!db) return;
    await db.collection("memoryVerses").add({
      reference: data.reference,
      text: data.text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    refs.refInput.value = "";
  } catch (err) {
    console.error(err);
    errorEl.textContent = `Couldn't find "${reference}". Try a format like "John 3:16" or "Psalm 23:1-3".`;
    errorEl.hidden = false;
  }
}

function deleteVerse(id) {
  if (!db) return;
  if (!confirm("Remove this verse from your memory list?")) return;
  db.collection("memoryVerses").doc(id).delete();
}

// ---------- List view ----------

function renderUserSelect() {
  const select = refs.userSelect;
  select.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = users.length === 0 ? "No family members yet (add in Settings)" : "Select a person…";
  select.appendChild(noneOpt);
  users.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.name;
    select.appendChild(opt);
  });
  if (activeUserId && users.some((u) => u.id === activeUserId)) {
    select.value = activeUserId;
  } else {
    activeUserId = null;
    select.value = "";
  }
}

function renderList() {
  refs.listEl.innerHTML = "";
  refs.emptyEl.hidden = verses.length !== 0;
  refs.practiceRow.hidden = verses.length === 0;

  verses.forEach((v) => {
    const li = document.createElement("li");
    li.className = "question-card";

    const p = document.createElement("p");
    p.className = "question-text";
    p.textContent = v.reference;
    li.appendChild(p);

    const progress = activeUserId && v.progress && v.progress[activeUserId];
    if (progress) {
      const scoreLine = document.createElement("p");
      scoreLine.className = "question-score";
      scoreLine.textContent = `✅ ${progress.correctCount || 0} / ${progress.attempts || 0} attempts`;
      li.appendChild(scoreLine);
    }

    const actions = document.createElement("div");
    actions.className = "question-row-actions";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-small";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteVerse(v.id));
    actions.appendChild(deleteBtn);
    li.appendChild(actions);

    refs.listEl.appendChild(li);
  });
}

// ---------- Guess the Reference ----------

function startGuess() {
  if (verses.length === 0) {
    showList();
    return;
  }
  view = "guess";
  answered = false;
  const verse = pickRandomVerse();
  currentVerseId = verse ? verse.id : null;

  if (guessDifficulty === "easy") {
    const distractorPool = verses.filter((v) => v.id !== currentVerseId).map((v) => v.reference);
    shuffle(distractorPool);
    const wrongOptions = distractorPool.slice(0, 3);
    currentOptions = shuffle([verse.reference, ...wrongOptions]);
  } else {
    currentOptions = [];
  }
  renderPractice();
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderGuess() {
  const verse = verses.find((v) => v.id === currentVerseId);
  if (!verse) {
    refs.practiceArea.innerHTML = `<p class="empty-state">Add a verse first.</p>`;
    return;
  }

  const diffToggle = `
    <div class="difficulty-toggle">
      <button class="btn btn-small ${guessDifficulty === "easy" ? "btn-primary" : ""}" id="guess-easy-btn">Multiple Choice</button>
      <button class="btn btn-small ${guessDifficulty === "hard" ? "btn-primary" : ""}" id="guess-hard-btn">Type the Reference</button>
    </div>
  `;

  let bodyHtml = `<p class="memorize-verse-text">${escapeHtml(verse.text)}</p>`;

  if (guessDifficulty === "easy") {
    bodyHtml += `<div class="guess-options" id="guess-options">${currentOptions
      .map((opt) => `<button class="btn guess-option-btn" data-ref="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`)
      .join("")}</div>`;
  } else {
    bodyHtml += `
      <input id="guess-ref-input" type="text" placeholder="e.g. John 3:16" ${answered ? "disabled" : ""} />
      <button id="guess-check-btn" class="btn btn-primary" ${answered ? "hidden" : ""}>Check</button>
    `;
  }

  bodyHtml += `<p id="guess-feedback" class="practice-feedback"></p>`;
  bodyHtml += `<button id="guess-next-btn" class="btn btn-primary" ${answered ? "" : "hidden"}>Next Verse</button>`;

  refs.practiceArea.innerHTML = `
    <button id="back-to-list-btn" class="btn btn-small back-btn">← My Verses</button>
    <h3>Guess the Reference</h3>
    ${diffToggle}
    ${bodyHtml}
  `;

  refs.practiceArea.querySelector("#back-to-list-btn").addEventListener("click", showList);
  refs.practiceArea.querySelector("#guess-easy-btn").addEventListener("click", () => {
    guessDifficulty = "easy";
    startGuess();
  });
  refs.practiceArea.querySelector("#guess-hard-btn").addEventListener("click", () => {
    guessDifficulty = "hard";
    startGuess();
  });

  if (guessDifficulty === "easy" && !answered) {
    refs.practiceArea.querySelectorAll(".guess-option-btn").forEach((btn) => {
      btn.addEventListener("click", () => gradeGuess(btn.dataset.ref, verse));
    });
  }
  if (guessDifficulty === "hard" && !answered) {
    const input = refs.practiceArea.querySelector("#guess-ref-input");
    const submit = () => gradeGuess(input.value, verse);
    refs.practiceArea.querySelector("#guess-check-btn").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  }
  if (answered) {
    refs.practiceArea.querySelector("#guess-next-btn").addEventListener("click", startGuess);
  }
}

function gradeGuess(givenRef, verse) {
  answered = true;
  const correct = normalizeRef(givenRef) === normalizeRef(verse.reference);
  recordVerseProgress(verse.id, correct);
  const feedback = refs.practiceArea.querySelector("#guess-feedback");
  feedback.textContent = correct
    ? "✅ Correct!"
    : `❌ Not quite — it's ${verse.reference}.`;
  feedback.className = "practice-feedback " + (correct ? "feedback-correct" : "feedback-wrong");
  renderGuess();
}

// ---------- Fill in the Blanks ----------

const REVEAL_FRACTIONS = [0.65, 0.45, 0.25, 0.1, 0];
const LEVEL_LABELS = ["Beginner", "Easy", "Medium", "Hard", "Expert"];

function buildBlanksTokens(text) {
  const rawTokens = text.trim().split(/\s+/);
  const tokens = rawTokens.map((raw) => {
    const m = raw.match(/[A-Za-z']+/);
    if (!m) return { raw, blankable: false };
    return {
      raw,
      blankable: true,
      prefix: raw.slice(0, m.index),
      core: m[0],
      suffix: raw.slice(m.index + m[0].length),
    };
  });

  const blankableIdx = tokens
    .map((t, i) => (t.blankable ? i : -1))
    .filter((i) => i !== -1);

  const priority = blankableIdx.slice().sort((a, b) => {
    const ta = tokens[a];
    const tb = tokens[b];
    const aStop = STOPWORDS.has(ta.core.toLowerCase()) ? 0 : 1;
    const bStop = STOPWORDS.has(tb.core.toLowerCase()) ? 0 : 1;
    if (aStop !== bStop) return aStop - bStop;
    return ta.core.length - tb.core.length;
  });

  const revealFraction = REVEAL_FRACTIONS[blanksLevel];
  const revealCount = Math.round(revealFraction * priority.length);
  const revealedSet = new Set(priority.slice(0, revealCount));

  tokens.forEach((t, i) => {
    if (t.blankable) t.revealed = revealedSet.has(i);
  });

  return tokens;
}

function startBlanks() {
  if (verses.length === 0) {
    showList();
    return;
  }
  view = "blanks";
  answered = false;
  const verse = pickRandomVerse();
  currentVerseId = verse ? verse.id : null;
  if (verse) blanksTokens = buildBlanksTokens(verse.text);
  renderPractice();
}

function renderBlanks() {
  const verse = verses.find((v) => v.id === currentVerseId);
  if (!verse) {
    refs.practiceArea.innerHTML = `<p class="empty-state">Add a verse first.</p>`;
    return;
  }

  const levelOptions = LEVEL_LABELS.map(
    (label, i) => `<option value="${i}" ${i === blanksLevel ? "selected" : ""}>${label}</option>`
  ).join("");

  const wordsHtml = blanksTokens
    .map((t, i) => {
      if (!t.blankable) return `<span class="blank-word">${escapeHtml(t.raw)}</span>`;
      if (t.revealed) return `<span class="blank-word">${escapeHtml(t.raw)}</span>`;
      return `<span class="blank-word">${escapeHtml(t.prefix)}<input class="letter-input" data-index="${i}" maxlength="1" ${answered ? "disabled" : ""}>${escapeHtml(t.suffix)}</span>`;
    })
    .join(" ");

  refs.practiceArea.innerHTML = `
    <button id="back-to-list-btn" class="btn btn-small back-btn">← My Verses</button>
    <h3>Fill in the Blanks</h3>
    <p class="memorize-reference">${escapeHtml(verse.reference)}</p>
    <label for="blanks-level-select">Difficulty</label>
    <select id="blanks-level-select">${levelOptions}</select>
    <p class="blank-help">Type the first letter of each missing word.</p>
    <div class="blank-words">${wordsHtml}</div>
    <p id="blanks-feedback" class="practice-feedback"></p>
    <div class="modal-actions">
      <button id="blanks-check-btn" class="btn btn-primary" ${answered ? "hidden" : ""}>Check</button>
      <button id="blanks-reveal-btn" class="btn" ${answered ? "" : "hidden"}>Show Full Verse</button>
      <button id="blanks-next-btn" class="btn btn-primary" ${answered ? "" : "hidden"}>New Verse</button>
    </div>
    <p id="blanks-full-text" class="memorize-verse-text" hidden>${escapeHtml(verse.text)}</p>
  `;

  refs.practiceArea.querySelector("#back-to-list-btn").addEventListener("click", showList);
  refs.practiceArea.querySelector("#blanks-level-select").addEventListener("change", (e) => {
    blanksLevel = Number(e.target.value);
    startBlanks();
  });
  if (!answered) {
    refs.practiceArea.querySelector("#blanks-check-btn").addEventListener("click", gradeBlanks);
  } else {
    refs.practiceArea.querySelector("#blanks-next-btn").addEventListener("click", startBlanks);
    refs.practiceArea.querySelector("#blanks-reveal-btn").addEventListener("click", () => {
      refs.practiceArea.querySelector("#blanks-full-text").hidden = false;
    });
  }
}

function gradeBlanks() {
  answered = true;
  const inputs = refs.practiceArea.querySelectorAll(".letter-input");
  let correctCount = 0;
  let total = 0;
  inputs.forEach((input) => {
    const idx = Number(input.dataset.index);
    const token = blanksTokens[idx];
    const expected = token.core[0].toLowerCase();
    const given = input.value.trim().toLowerCase();
    total++;
    if (given === expected) {
      correctCount++;
      input.classList.add("letter-correct");
    } else {
      input.classList.add("letter-wrong");
    }
  });

  const feedback = refs.practiceArea.querySelector("#blanks-feedback");
  feedback.textContent = `${correctCount} / ${total} correct`;
  feedback.className = "practice-feedback " + (correctCount === total ? "feedback-correct" : "feedback-wrong");
  recordVerseProgress(currentVerseId, total > 0 && correctCount === total);

  inputs.forEach((input) => (input.disabled = true));
  refs.practiceArea.querySelector("#blanks-check-btn").hidden = true;
  refs.practiceArea.querySelector("#blanks-reveal-btn").hidden = false;
  refs.practiceArea.querySelector("#blanks-next-btn").hidden = false;
  refs.practiceArea.querySelector("#blanks-reveal-btn").addEventListener("click", () => {
    refs.practiceArea.querySelector("#blanks-full-text").hidden = false;
  });
  refs.practiceArea.querySelector("#blanks-next-btn").addEventListener("click", startBlanks);
}

// ---------- Shared ----------

function showList() {
  view = "list";
  renderPractice();
}

function renderPractice() {
  if (view === "list") {
    refs.practiceArea.innerHTML = "";
    return;
  }
  if (view === "guess") renderGuess();
  if (view === "blanks") renderBlanks();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function buildSkeleton(container) {
  container.innerHTML = `
    <div class="list-toolbar">
      <h2>Memory Verses</h2>
    </div>
    <label for="memorize-user-select">Who's memorizing?</label>
    <select id="memorize-user-select" class="assign-select"></select>
    <div class="add-verse-row">
      <input id="verse-ref-input" type="text" placeholder="e.g. John 3:16 (King James Version)" />
      <button id="add-verse-btn" class="btn btn-primary">+ Add Verse</button>
    </div>
    <p id="verse-add-error" class="form-error" hidden></p>
    <ul id="verse-list" class="question-list"></ul>
    <p id="verse-empty" class="empty-state" hidden>No memory verses yet — add one above (King James Version).</p>

    <div class="practice-launch-row" id="practice-launch-row" hidden>
      <button id="practice-guess-btn" class="btn btn-primary">🔤 Guess the Reference</button>
      <button id="practice-blanks-btn" class="btn btn-primary">✍️ Fill in the Blanks</button>
    </div>

    <div id="practice-area"></div>
  `;

  refs.refInput = container.querySelector("#verse-ref-input");
  refs.addError = container.querySelector("#verse-add-error");
  refs.listEl = container.querySelector("#verse-list");
  refs.emptyEl = container.querySelector("#verse-empty");
  refs.practiceRow = container.querySelector("#practice-launch-row");
  refs.practiceArea = container.querySelector("#practice-area");
  refs.userSelect = container.querySelector("#memorize-user-select");

  refs.userSelect.addEventListener("change", () => {
    activeUserId = refs.userSelect.value || null;
    saveActiveUser(activeUserId);
    renderList();
  });

  container.querySelector("#add-verse-btn").addEventListener("click", () => {
    const val = refs.refInput.value.trim();
    if (val) addVerse(val);
  });
  refs.refInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const val = refs.refInput.value.trim();
      if (val) addVerse(val);
    }
  });

  container.querySelector("#practice-guess-btn").addEventListener("click", startGuess);
  container.querySelector("#practice-blanks-btn").addEventListener("click", startBlanks);
}

export function mountMemorize(container) {
  buildSkeleton(container);
  renderList();

  subscribeUsers((updated) => {
    users = updated;
    renderUserSelect();
    renderList();
  });

  ready.then((firestoreDb) => {
    db = firestoreDb;
    db.collection("memoryVerses").onSnapshot(
      (snapshot) => {
        verses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        renderList();
        if (view !== "list" && !verses.find((v) => v.id === currentVerseId)) {
          showList();
        }
      },
      (err) => console.error(err)
    );
  }).catch((err) => console.error(err));
}

// Verse memorization: a personal bank of KJV verses, with two practice modes:
//   1. "Guess the Reference" — shown the verse, identify the reference
//      (multiple choice, or type it in for a harder challenge).
//   2. "Fill in the Blanks" — shown the reference, type the first letter of
//      each word from memory. A 5-level scaffold decides how many words are
//      already filled in for you (easiest) vs. fully blank (hardest).
// Verses are added via a book/chapter picker that lets individual verses be
// unchecked, so only part of a passage gets memorized if that's all that's
// wanted (see verse-picker.js).
import { subscribeUsers } from "./users.js";
import {
  subscribeMemoryVerses,
  getActiveMemorizeUser,
  setActiveMemorizeUser,
  addMemoryVerse,
  deleteMemoryVerse,
  recordVerseProgress,
} from "./memorize-data.js";
import { populateBookSelect, populateChapterSelect, loadChapterVerses, computeVerseSelection } from "./verse-picker.js";

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

let verses = []; // [{id, reference, text, progress}]
let users = [];
let activeUserId = getActiveMemorizeUser();
let refs = {};
let view = "list"; // "list" | "guess" | "blanks"
let guessDifficulty = "easy"; // "easy" | "hard"
let blanksLevel = 0; // 0 (Beginner/most filled) .. 4 (Expert/all blank)
let currentVerseId = null;
let currentOptions = [];
let blanksTokens = [];
let answered = false;
let pickerVerses = []; // verses of the chapter currently loaded in the add-verse modal

function pickRandomVerse(excludeId) {
  const reviewPool = verses.filter(
    (v) => v.progress && v.progress[activeUserId] && v.progress[activeUserId].needsReview
  );
  const pool = reviewPool.length > 0 ? reviewPool : verses;
  let candidates = pool;
  if (excludeId && pool.length > 1) {
    const filtered = pool.filter((v) => v.id !== excludeId);
    if (filtered.length > 0) candidates = filtered;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function normalizeRef(str) {
  return str.trim().toLowerCase().replace(/\s+/g, " ");
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
      scoreLine.textContent = `✅ ${progress.correctCount || 0} / ${progress.attempts || 0} attempts${
        progress.needsReview ? " · 🔁 needs review" : ""
      }`;
      li.appendChild(scoreLine);
    }

    const actions = document.createElement("div");
    actions.className = "question-row-actions";
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-small";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      if (confirm("Remove this verse from your memory list?")) deleteMemoryVerse(v.id);
    });
    actions.appendChild(deleteBtn);
    li.appendChild(actions);

    refs.listEl.appendChild(li);
  });
}

// ---------- Add-verse picker modal ----------

function openAddVerseModal() {
  refs.vpError.hidden = true;
  refs.vpVerseList.innerHTML = "";
  refs.vpVerseList.hidden = true;
  refs.vpSelectRow.hidden = true;
  populateChapterSelect(refs.vpChapterSelect, refs.vpBookSelect.value);
  refs.vpModalBackdrop.hidden = false;
  loadPickerChapter();
}

function closeAddVerseModal() {
  refs.vpModalBackdrop.hidden = true;
}

async function loadPickerChapter() {
  const book = refs.vpBookSelect.value;
  const chapter = Number(refs.vpChapterSelect.value);
  refs.vpError.hidden = true;
  refs.vpVerseList.innerHTML = `<p class="bible-status">Loading ${book} ${chapter}…</p>`;
  refs.vpVerseList.hidden = false;
  refs.vpSelectRow.hidden = true;
  try {
    pickerVerses = await loadChapterVerses(book, chapter);
    renderPickerVerseList();
  } catch (err) {
    console.error(err);
    pickerVerses = [];
    refs.vpVerseList.innerHTML = "";
    refs.vpVerseList.hidden = true;
    refs.vpError.textContent = "Couldn't load that chapter. Check your internet connection and try again.";
    refs.vpError.hidden = false;
  }
}

function renderPickerVerseList() {
  refs.vpVerseList.innerHTML = "";
  refs.vpSelectRow.hidden = pickerVerses.length === 0;
  pickerVerses.forEach((v) => {
    const label = document.createElement("label");
    label.className = "verse-picker-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.dataset.verse = String(v.verse);
    const span = document.createElement("span");
    span.innerHTML = `<sup>${v.verse}</sup> ${escapeHtml(v.text)}`;
    label.appendChild(cb);
    label.appendChild(span);
    refs.vpVerseList.appendChild(label);
  });
}

function setAllPickerChecked(checked) {
  refs.vpVerseList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = checked));
}

function saveVerseFromPicker() {
  const checkedSet = new Set(
    Array.from(refs.vpVerseList.querySelectorAll('input[type="checkbox"]:checked')).map((cb) =>
      Number(cb.dataset.verse)
    )
  );
  const selection = computeVerseSelection(refs.vpBookSelect.value, Number(refs.vpChapterSelect.value), pickerVerses, checkedSet);
  if (!selection) {
    refs.vpError.textContent = "Check at least one verse to memorize.";
    refs.vpError.hidden = false;
    return;
  }
  addMemoryVerse(selection.reference, selection.text);
  closeAddVerseModal();
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
  recordVerseProgress(verse.id, activeUserId, correct);
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
  recordVerseProgress(currentVerseId, activeUserId, total > 0 && correctCount === total);

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
      <button id="add-verse-btn" class="btn btn-primary">+ Add Verse</button>
    </div>
    <label for="memorize-user-select">Who's memorizing?</label>
    <select id="memorize-user-select" class="assign-select"></select>
    <ul id="verse-list" class="question-list"></ul>
    <p id="verse-empty" class="empty-state" hidden>No memory verses yet — tap "+ Add Verse" to pick a passage (King James Version).</p>

    <div class="practice-launch-row" id="practice-launch-row" hidden>
      <button id="practice-guess-btn" class="btn btn-primary">🔤 Guess the Reference</button>
      <button id="practice-blanks-btn" class="btn btn-primary">✍️ Fill in the Blanks</button>
    </div>

    <div id="practice-area"></div>

    <div id="verse-picker-modal-backdrop" class="modal-backdrop" hidden>
      <div class="modal">
        <h3>Add a Verse</h3>
        <div class="verse-picker-controls">
          <select id="vp-book-select" class="bible-select"></select>
          <select id="vp-chapter-select" class="bible-select"></select>
        </div>
        <p class="blank-help">Uncheck any verses you don't want to memorize.</p>
        <div class="verse-picker-select-row" id="vp-select-row" hidden>
          <button id="vp-select-all-btn" class="btn btn-small">Select All</button>
          <button id="vp-select-none-btn" class="btn btn-small">Select None</button>
        </div>
        <div id="vp-verse-list" class="verse-picker-list"></div>
        <p id="vp-error" class="form-error" hidden></p>
        <div class="modal-actions">
          <button id="vp-cancel-btn" class="btn">Cancel</button>
          <button id="vp-save-btn" class="btn btn-primary">Add Selected</button>
        </div>
      </div>
    </div>
  `;

  refs.listEl = container.querySelector("#verse-list");
  refs.emptyEl = container.querySelector("#verse-empty");
  refs.practiceRow = container.querySelector("#practice-launch-row");
  refs.practiceArea = container.querySelector("#practice-area");
  refs.userSelect = container.querySelector("#memorize-user-select");

  refs.vpModalBackdrop = container.querySelector("#verse-picker-modal-backdrop");
  refs.vpBookSelect = container.querySelector("#vp-book-select");
  refs.vpChapterSelect = container.querySelector("#vp-chapter-select");
  refs.vpSelectRow = container.querySelector("#vp-select-row");
  refs.vpVerseList = container.querySelector("#vp-verse-list");
  refs.vpError = container.querySelector("#vp-error");

  populateBookSelect(refs.vpBookSelect);
  populateChapterSelect(refs.vpChapterSelect, refs.vpBookSelect.value);

  refs.userSelect.addEventListener("change", () => {
    activeUserId = refs.userSelect.value || null;
    setActiveMemorizeUser(activeUserId);
    renderList();
  });

  container.querySelector("#add-verse-btn").addEventListener("click", openAddVerseModal);
  container.querySelector("#vp-cancel-btn").addEventListener("click", closeAddVerseModal);
  refs.vpModalBackdrop.addEventListener("click", (e) => {
    if (e.target === refs.vpModalBackdrop) closeAddVerseModal();
  });
  container.querySelector("#vp-save-btn").addEventListener("click", saveVerseFromPicker);
  container.querySelector("#vp-select-all-btn").addEventListener("click", () => setAllPickerChecked(true));
  container.querySelector("#vp-select-none-btn").addEventListener("click", () => setAllPickerChecked(false));

  refs.vpBookSelect.addEventListener("change", () => {
    populateChapterSelect(refs.vpChapterSelect, refs.vpBookSelect.value);
    loadPickerChapter();
  });
  refs.vpChapterSelect.addEventListener("change", loadPickerChapter);

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

  subscribeMemoryVerses((updated) => {
    verses = updated;
    renderList();
    if (view !== "list" && !verses.find((v) => v.id === currentVerseId)) {
      showList();
    }
  });
}

// Verse memorization. Home view: category chips (skipped entirely if no
// categories exist yet), a Fill in the Blank / Flashcards mode tab, and a
// verse list with a 0–3 star mastery rating per verse for whoever's
// picked in the header's User dropdown. Tapping a verse launches whichever
// mode is selected:
//   - Fill in the Blank: pick a difficulty, then type the first letter of
//     each blanked word — correct reveals the word and moves on, wrong
//     flashes a momentary ✗ and lets you retry that word.
//   - Flashcards: shown either the verse or the reference (your choice),
//     flip to see the other side, then self-grade Fail/Hard/Good/Easy.
// Verses are added via a book/chapter/verse-range picker (see
// verse-picker.js) — categorizing verses happens in Setup, not here.
import { subscribeActiveUser } from "./active-user.js";
import { subscribeMemoryVerses, subscribeVerseCategories, addMemoryVerse, deleteMemoryVerse, recordVerseProgress } from "./memorize-data.js";
import {
  populateBookSelect,
  populateChapterSelect,
  populateVerseRangeSelects,
  loadChapterVerses,
  computeVerseRangeSelection,
} from "./verse-picker.js";

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

const REVEAL_FRACTIONS = [0.6, 0.3, 0.1, 0];
const LEVEL_LABELS = ["Easy", "Medium", "Hard", "Blanks Only"];
const LEVEL_HINTS = ["Few blanks", "Half blanks", "Most blanks", "No words given"];
const LEVEL_DOT_CLASSES = ["dot-easy", "dot-medium", "dot-hard", "dot-blanksonly"];
const MODE_KEY = "bible-questions-memorize-mode";
const LEVEL_KEY = "bible-questions-memorize-level";
const STARTWITH_KEY = "bible-questions-memorize-startwith";

let verses = [];
let categories = [];
let activeUserId = null;
let refs = {};
let selectedCategoryId = ""; // "" = All
let practiceMode = loadPref(MODE_KEY, "fitb"); // "fitb" | "flashcard"
let view = "list"; // "list" | "practice"
let currentVerseId = null;
let pickerVerses = []; // verses of the chapter currently loaded in the add-verse modal

// ---------- Small localStorage helpers ----------

function loadPref(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (e) {
    return fallback;
  }
}

function savePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* ignore */
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Stars / mastery ----------

function starsForVerse(verse) {
  const p = activeUserId && verse.progress && verse.progress[activeUserId];
  const correct = (p && p.correctCount) || 0;
  if (correct >= 6) return 3;
  if (correct >= 3) return 2;
  if (correct >= 1) return 1;
  return 0;
}

function starString(count) {
  return "★★★".slice(0, count) + "☆☆☆".slice(0, 3 - count);
}

// ---------- Home view: categories, mode tabs, verse list ----------

function versesForSelectedCategory() {
  if (!selectedCategoryId) return verses;
  return verses.filter((v) => v.categoryId === selectedCategoryId);
}

function renderCategoryRow() {
  const row = refs.categoryRow;
  if (categories.length === 0) {
    row.hidden = true;
    row.innerHTML = "";
    return;
  }
  row.hidden = false;
  row.innerHTML = "";

  const allChip = document.createElement("button");
  allChip.className = "mem-category-chip" + (selectedCategoryId === "" ? " active" : "");
  allChip.textContent = `All (${verses.length})`;
  allChip.addEventListener("click", () => {
    selectedCategoryId = "";
    renderCategoryRow();
    renderVerseList();
  });
  row.appendChild(allChip);

  categories.forEach((cat) => {
    const count = verses.filter((v) => v.categoryId === cat.id).length;
    const chip = document.createElement("button");
    chip.className = "mem-category-chip" + (selectedCategoryId === cat.id ? " active" : "");
    chip.textContent = `${cat.name} (${count})`;
    chip.addEventListener("click", () => {
      selectedCategoryId = cat.id;
      renderCategoryRow();
      renderVerseList();
    });
    row.appendChild(chip);
  });
}

function renderModeTabs() {
  refs.modeTabs.querySelectorAll(".mem-mode-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === practiceMode);
  });
}

function renderVerseList() {
  const list = versesForSelectedCategory();
  refs.listEl.innerHTML = "";
  refs.emptyEl.hidden = verses.length !== 0;
  refs.listEl.hidden = list.length === 0;

  list.forEach((v) => {
    const li = document.createElement("li");
    li.className = "mem-verse-card";

    const body = document.createElement("button");
    body.className = "mem-verse-card-body";
    body.addEventListener("click", () => openPractice(v.id));

    const refLine = document.createElement("div");
    refLine.className = "mem-verse-card-top";
    const refEl = document.createElement("strong");
    refEl.textContent = v.reference;
    refLine.appendChild(refEl);
    const starsEl = document.createElement("span");
    starsEl.className = "mem-verse-stars";
    starsEl.textContent = starString(starsForVerse(v));
    refLine.appendChild(starsEl);
    body.appendChild(refLine);

    const snippet = document.createElement("p");
    snippet.className = "mem-verse-snippet";
    snippet.textContent = v.text.length > 90 ? v.text.slice(0, 90) + "…" : v.text;
    body.appendChild(snippet);

    li.appendChild(body);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-small mem-verse-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      if (confirm("Remove this verse from your memory list?")) deleteMemoryVerse(v.id);
    });
    li.appendChild(deleteBtn);

    refs.listEl.appendChild(li);
  });
}

function renderHome() {
  renderCategoryRow();
  renderModeTabs();
  renderVerseList();
}

// ---------- Add-verse picker modal ----------

function buildAddVerseCategorySelect() {
  const select = document.createElement("select");
  select.className = "assign-select";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "Uncategorized";
  select.appendChild(noneOpt);
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    select.appendChild(opt);
  });
  select.value = selectedCategoryId || "";
  return select;
}

function openAddVerseModal() {
  refs.vpError.hidden = true;
  populateChapterSelect(refs.vpChapterSelect, refs.vpBookSelect.value);
  refs.vpCategoryWrap.innerHTML = "";
  refs.vpCategorySelect = buildAddVerseCategorySelect();
  refs.vpCategoryWrap.appendChild(refs.vpCategorySelect);
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
  refs.vpPreview.textContent = `Loading ${book} ${chapter}…`;
  try {
    pickerVerses = await loadChapterVerses(book, chapter);
    populateVerseRangeSelects(refs.vpFromSelect, refs.vpToSelect, pickerVerses.length);
    updateVersePreview();
  } catch (err) {
    console.error(err);
    pickerVerses = [];
    refs.vpPreview.textContent = "";
    refs.vpError.textContent = "Couldn't load that chapter. Check your internet connection and try again.";
    refs.vpError.hidden = false;
  }
}

function updateVersePreview() {
  const from = Number(refs.vpFromSelect.value);
  const to = Number(refs.vpToSelect.value);
  const selection = computeVerseRangeSelection(refs.vpBookSelect.value, Number(refs.vpChapterSelect.value), pickerVerses, from, to);
  refs.vpPreview.textContent = selection ? selection.text : "";
}

function onFromVerseChange() {
  const from = Number(refs.vpFromSelect.value);
  const to = Number(refs.vpToSelect.value);
  if (from > to) refs.vpToSelect.value = String(from);
  updateVersePreview();
}

function onToVerseChange() {
  const from = Number(refs.vpFromSelect.value);
  const to = Number(refs.vpToSelect.value);
  if (to < from) refs.vpFromSelect.value = String(to);
  updateVersePreview();
}

function saveVerseFromPicker() {
  const from = Number(refs.vpFromSelect.value);
  const to = Number(refs.vpToSelect.value);
  const selection = computeVerseRangeSelection(refs.vpBookSelect.value, Number(refs.vpChapterSelect.value), pickerVerses, from, to);
  if (!selection) {
    refs.vpError.textContent = "Couldn't load that chapter's verses — try again.";
    refs.vpError.hidden = false;
    return;
  }
  addMemoryVerse(selection.reference, selection.text, refs.vpCategorySelect.value || null);
  closeAddVerseModal();
}

// ---------- Practice shell ----------

function openPractice(verseId) {
  currentVerseId = verseId;
  view = "practice";
  refs.listView.hidden = true;
  if (practiceMode === "fitb") startFitbChallenge(verseId);
  else startFlashcard(verseId);
}

function closePractice() {
  view = "list";
  currentVerseId = null;
  refs.listView.hidden = false;
  refs.practiceArea.innerHTML = "";
  renderHome();
}

// ---------- Fill in the Blank ----------

let blanksLevel = Number(loadPref(LEVEL_KEY, "0"));
let blanksTokens = [];
let hadWrongInSession = false;

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

  const blankableIdx = tokens.map((t, i) => (t.blankable ? i : -1)).filter((i) => i !== -1);

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

function startFitbChallenge(verseId) {
  const verse = verses.find((v) => v.id === verseId);
  if (!verse) {
    closePractice();
    return;
  }
  refs.practiceArea.innerHTML = `
    <button id="practice-close-btn" class="btn btn-small back-btn">✕ My Verses</button>
    <p class="mem-challenge-label">Ready to Memorize?</p>
    <div class="mem-ref-pill">🖐 ${escapeHtml(verse.reference)}</div>
    <div class="mem-challenge-verse-card">"${escapeHtml(verse.text)}"</div>
    <p class="mem-challenge-heading">Choose your challenge</p>
    <div class="mem-challenge-options" id="mem-challenge-options">
      ${LEVEL_LABELS.map(
        (label, i) => `
        <button class="mem-challenge-option ${i === blanksLevel ? "active" : ""}" data-level="${i}">
          <span class="dot ${LEVEL_DOT_CLASSES[i]}"></span>
          <span class="mem-challenge-option-label">${label}</span>
          <small>${LEVEL_HINTS[i]}</small>
        </button>`
      ).join("")}
    </div>
    <button id="start-game-btn" class="btn btn-primary btn-block">Start Game →</button>
  `;

  refs.practiceArea.querySelector("#practice-close-btn").addEventListener("click", closePractice);
  refs.practiceArea.querySelectorAll(".mem-challenge-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      blanksLevel = Number(btn.dataset.level);
      savePref(LEVEL_KEY, String(blanksLevel));
      refs.practiceArea.querySelectorAll(".mem-challenge-option").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
  refs.practiceArea.querySelector("#start-game-btn").addEventListener("click", () => startFitbBlanks(verseId));
}

function startFitbBlanks(verseId) {
  const verse = verses.find((v) => v.id === verseId);
  if (!verse) {
    closePractice();
    return;
  }
  hadWrongInSession = false;
  blanksTokens = buildBlanksTokens(verse.text);
  renderFitbBlanks(verse);
}

function renderFitbBlanks(verse) {
  const wordsHtml = blanksTokens
    .map((t, i) => {
      if (!t.blankable || t.revealed) return `<span class="blank-word">${escapeHtml(t.raw)}</span>`;
      return `<span class="blank-word blank-pending" data-index="${i}">${escapeHtml(t.prefix)}<input class="letter-input" data-index="${i}" maxlength="1" autocomplete="off" autocapitalize="off">${escapeHtml(t.suffix)}</span>`;
    })
    .join(" ");

  refs.practiceArea.innerHTML = `
    <button id="practice-close-btn" class="btn btn-small back-btn">✕ My Verses</button>
    <div class="mem-practice-header">
      <span class="mem-ref-pill">🖐 ${escapeHtml(verse.reference)} (KJV)</span>
      <span class="mem-difficulty-pill"><span class="dot ${LEVEL_DOT_CLASSES[blanksLevel]}"></span>${LEVEL_LABELS[blanksLevel]}</span>
    </div>
    <div class="mem-blanks-card">${wordsHtml}</div>
    <p id="fitb-feedback" class="practice-feedback"></p>
    <p id="fitb-full-text" class="memorize-verse-text" hidden>${escapeHtml(verse.text)}</p>
    <div class="modal-actions">
      <button id="fitb-reveal-btn" class="btn" hidden>Show Full Verse</button>
      <button id="fitb-restart-btn" class="btn" hidden>Try Again</button>
      <button id="fitb-next-btn" class="btn btn-primary" hidden>← My Verses</button>
    </div>
  `;

  refs.practiceArea.querySelector("#practice-close-btn").addEventListener("click", closePractice);
  setupFitbInputs();

  const first = refs.practiceArea.querySelector(".letter-input");
  if (first) first.focus();
  else checkFitbComplete(verse); // a verse with no blankable words at all
}

function setupFitbInputs() {
  refs.practiceArea.querySelectorAll(".letter-input").forEach((input) => {
    input.addEventListener("input", () => {
      const idx = Number(input.dataset.index);
      const given = input.value.trim().toLowerCase();
      if (!given) return;
      const token = blanksTokens[idx];
      const expected = token.core[0].toLowerCase();
      const wordSpan = input.closest(".blank-word");

      if (given === expected) {
        wordSpan.textContent = token.raw;
        wordSpan.classList.remove("blank-pending");
        wordSpan.classList.add("blank-correct");
        focusNextBlank(idx);
        checkFitbComplete(verses.find((v) => v.id === currentVerseId));
      } else {
        hadWrongInSession = true;
        flashWrong(wordSpan);
        input.value = "";
      }
    });
  });
}

function focusNextBlank(fromIndex) {
  const inputs = Array.from(refs.practiceArea.querySelectorAll(".letter-input"));
  const next = inputs.find((inp) => Number(inp.dataset.index) > fromIndex);
  if (next) next.focus();
}

function flashWrong(wordSpan) {
  wordSpan.classList.add("blank-wrong-flash");
  const x = document.createElement("span");
  x.className = "blank-x-flash";
  x.textContent = "✗";
  wordSpan.appendChild(x);
  setTimeout(() => {
    wordSpan.classList.remove("blank-wrong-flash");
    x.remove();
  }, 500);
}

function checkFitbComplete(verse) {
  if (refs.practiceArea.querySelectorAll(".blank-pending").length > 0) return;
  recordVerseProgress(currentVerseId, activeUserId, !hadWrongInSession);
  const feedback = refs.practiceArea.querySelector("#fitb-feedback");
  feedback.textContent = hadWrongInSession ? "✅ Completed — you got there!" : "🌟 Perfect — first try!";
  feedback.className = "practice-feedback " + (hadWrongInSession ? "" : "feedback-correct");
  refs.practiceArea.querySelector("#fitb-reveal-btn").hidden = false;
  refs.practiceArea.querySelector("#fitb-restart-btn").hidden = false;
  refs.practiceArea.querySelector("#fitb-next-btn").hidden = false;
  refs.practiceArea.querySelector("#fitb-reveal-btn").addEventListener("click", () => {
    refs.practiceArea.querySelector("#fitb-full-text").hidden = false;
  });
  refs.practiceArea.querySelector("#fitb-restart-btn").addEventListener("click", () => startFitbBlanks(verse.id));
  refs.practiceArea.querySelector("#fitb-next-btn").addEventListener("click", closePractice);
}

// ---------- Flashcards ----------

let flashcardStartWith = loadPref(STARTWITH_KEY, "verse"); // "verse" | "reference"
let flashcardFlipped = false;

function startFlashcard(verseId) {
  flashcardFlipped = false;
  renderFlashcard(verseId);
}

function renderFlashcard(verseId) {
  const verse = verses.find((v) => v.id === verseId);
  if (!verse) {
    closePractice();
    return;
  }
  const startWithVerse = flashcardStartWith === "verse";
  const front = startWithVerse ? verse.text : verse.reference;
  const back = startWithVerse ? verse.reference : verse.text;

  const cardHtml = flashcardFlipped
    ? `<p class="mem-flashcard-main">${escapeHtml(front)}</p><hr class="mem-flashcard-divider">
       <p class="mem-flashcard-back">${escapeHtml(back)}</p>`
    : `<p class="mem-flashcard-main">${escapeHtml(front)}</p>`;

  refs.practiceArea.innerHTML = `
    <button id="practice-close-btn" class="btn btn-small back-btn">← My Verses</button>
    <div class="mem-practice-header"><span class="mem-ref-pill">🖐 ${escapeHtml(verse.reference)} (KJV)</span></div>
    <div class="mem-flashcard">${cardHtml}</div>
    ${
      flashcardFlipped
        ? `<div class="mem-grade-row">
            <button class="btn mem-grade-btn mem-grade-fail" data-grade="fail">Fail</button>
            <button class="btn mem-grade-btn mem-grade-hard" data-grade="hard">Hard</button>
            <button class="btn mem-grade-btn mem-grade-good" data-grade="good">Good</button>
            <button class="btn mem-grade-btn mem-grade-easy" data-grade="easy">Easy</button>
          </div>`
        : `<button id="flip-btn" class="btn btn-primary btn-block">🔄 Flip</button>`
    }
    <div class="mem-startwith-row">
      <span>Start with</span>
      <div class="mem-startwith-toggle">
        <button class="mem-startwith-btn ${startWithVerse ? "active" : ""}" data-start="verse">Verse</button>
        <button class="mem-startwith-btn ${!startWithVerse ? "active" : ""}" data-start="reference">Reference</button>
      </div>
    </div>
  `;

  refs.practiceArea.querySelector("#practice-close-btn").addEventListener("click", closePractice);
  const flipBtn = refs.practiceArea.querySelector("#flip-btn");
  if (flipBtn) {
    flipBtn.addEventListener("click", () => {
      flashcardFlipped = true;
      renderFlashcard(verseId);
    });
  }
  refs.practiceArea.querySelectorAll(".mem-grade-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      recordVerseProgress(verseId, activeUserId, btn.dataset.grade !== "fail");
      closePractice();
    });
  });
  refs.practiceArea.querySelectorAll(".mem-startwith-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      flashcardStartWith = btn.dataset.start;
      savePref(STARTWITH_KEY, flashcardStartWith);
      flashcardFlipped = false;
      renderFlashcard(verseId);
    });
  });
}

// ---------- Shell ----------

function buildSkeleton(container) {
  container.innerHTML = `
    <div id="mem-list-view">
      <div class="list-toolbar">
        <h2>Memory Verses</h2>
        <button id="add-verse-btn" class="btn btn-primary">+ Add Verse</button>
      </div>
      <div class="mem-category-row" id="mem-category-row"></div>
      <div class="mem-mode-tabs" id="mem-mode-tabs">
        <button class="mem-mode-tab" data-mode="fitb">✍️ Fill in the Blank</button>
        <button class="mem-mode-tab" data-mode="flashcard">🗂️ Flashcards</button>
      </div>
      <ul id="verse-list" class="mem-verse-list"></ul>
      <p id="verse-empty" class="empty-state" hidden>No memory verses yet — tap "+ Add Verse" to pick a passage (King James Version).</p>
    </div>

    <div id="practice-area"></div>

    <div id="verse-picker-modal-backdrop" class="modal-backdrop" hidden>
      <div class="modal">
        <h3>Add a Verse</h3>
        <div class="verse-picker-controls">
          <select id="vp-book-select" class="bible-select"></select>
          <select id="vp-chapter-select" class="bible-select"></select>
        </div>
        <div class="verse-range-row">
          <div>
            <label for="vp-from-verse-select">From verse</label>
            <select id="vp-from-verse-select" class="bible-select"></select>
          </div>
          <div>
            <label for="vp-to-verse-select">To verse</label>
            <select id="vp-to-verse-select" class="bible-select"></select>
          </div>
        </div>
        <label>Category</label>
        <div id="vp-category-wrap"></div>
        <p id="vp-preview" class="memorize-verse-text"></p>
        <p id="vp-error" class="form-error" hidden></p>
        <div class="modal-actions">
          <button id="vp-cancel-btn" class="btn">Cancel</button>
          <button id="vp-save-btn" class="btn btn-primary">Add Verse</button>
        </div>
      </div>
    </div>
  `;

  refs.listView = container.querySelector("#mem-list-view");
  refs.categoryRow = container.querySelector("#mem-category-row");
  refs.modeTabs = container.querySelector("#mem-mode-tabs");
  refs.listEl = container.querySelector("#verse-list");
  refs.emptyEl = container.querySelector("#verse-empty");
  refs.practiceArea = container.querySelector("#practice-area");

  refs.vpModalBackdrop = container.querySelector("#verse-picker-modal-backdrop");
  refs.vpBookSelect = container.querySelector("#vp-book-select");
  refs.vpChapterSelect = container.querySelector("#vp-chapter-select");
  refs.vpFromSelect = container.querySelector("#vp-from-verse-select");
  refs.vpToSelect = container.querySelector("#vp-to-verse-select");
  refs.vpCategoryWrap = container.querySelector("#vp-category-wrap");
  refs.vpPreview = container.querySelector("#vp-preview");
  refs.vpError = container.querySelector("#vp-error");

  populateBookSelect(refs.vpBookSelect);
  populateChapterSelect(refs.vpChapterSelect, refs.vpBookSelect.value);

  container.querySelector("#add-verse-btn").addEventListener("click", openAddVerseModal);
  container.querySelector("#vp-cancel-btn").addEventListener("click", closeAddVerseModal);
  refs.vpModalBackdrop.addEventListener("click", (e) => {
    if (e.target === refs.vpModalBackdrop) closeAddVerseModal();
  });
  container.querySelector("#vp-save-btn").addEventListener("click", saveVerseFromPicker);

  refs.vpBookSelect.addEventListener("change", () => {
    populateChapterSelect(refs.vpChapterSelect, refs.vpBookSelect.value);
    loadPickerChapter();
  });
  refs.vpChapterSelect.addEventListener("change", loadPickerChapter);
  refs.vpFromSelect.addEventListener("change", onFromVerseChange);
  refs.vpToSelect.addEventListener("change", onToVerseChange);

  refs.modeTabs.querySelectorAll(".mem-mode-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      practiceMode = btn.dataset.mode;
      savePref(MODE_KEY, practiceMode);
      renderModeTabs();
    });
  });
}

export function mountMemorize(container) {
  buildSkeleton(container);
  renderHome();

  subscribeActiveUser((id) => {
    activeUserId = id;
    if (view === "list") renderVerseList();
  });

  subscribeMemoryVerses((updated) => {
    verses = updated;
    if (view === "list") {
      renderHome();
    } else if (!verses.find((v) => v.id === currentVerseId)) {
      closePractice();
    }
  });

  subscribeVerseCategories((updated) => {
    categories = updated;
    if (view === "list") renderCategoryRow();
  });
}

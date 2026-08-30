// Verse memorization. Home view: a Memorizing/Future/Complete bucket tab
// row (per-user, see BUCKETS below), category chips
// below that (skipped entirely if no custom categories exist yet), a
// Fill in the Blank / Flashcards mode tab, a Play button, and the verse
// list itself — each card showing a mastery dot and an icon-only bucket
// picker. Tapping a verse (or Play) launches whichever mode is selected:
//   - Fill in the Blank: pick a difficulty, then type the first letter of
//     each blanked word — correct reveals the word and moves on; wrong
//     flashes a momentary ✗, and 3 wrong attempts (or the IDK button)
//     auto-fills it and moves on.
//   - Flashcards: shown either the verse or the reference (your choice),
//     flip to see the other side, then self-grade Fail/Hard/Good/Easy.
// Either mode's score feeds "Next Verse", which picks another verse from
// the same pool the same way the Questions quiz picks questions.
// Verses are added via a book/chapter/verse-range picker (see
// verse-picker.js) — categorizing verses happens in Setup, not here.
import { subscribeActiveUser } from "./active-user.js";
import { subscribeMemoryVerses, subscribeVerseCategories, addMemoryVerse, recordVerseProgress, setVerseBucket } from "./memorize-data.js";
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

// Fraction of blankable words actually blanked out at each difficulty —
// Easy leaves most of the verse visible, Blanks Only shows none of it.
const BLANK_FRACTIONS = [0.25, 0.5, 0.75, 1];
const LEVEL_LABELS = ["Easy", "Medium", "Hard", "Blanks Only"];
const LEVEL_HINTS = ["Few blanks", "Half blanks", "Most blanks", "No words given"];
const LEVEL_DOT_CLASSES = ["dot-easy", "dot-medium", "dot-hard", "dot-blanksonly"];
const MODE_KEY = "bible-questions-memorize-mode";
const LEVEL_KEY = "bible-questions-memorize-level";
const STARTWITH_KEY = "bible-questions-memorize-startwith";

// Wrong letter-attempts on one blank before it's auto-filled and practice
// moves on to the next blank — same threshold the IDK button skips to
// immediately, for whichever blank currently has focus.
const MAX_WRONG_ATTEMPTS = 3;

// The three per-user buckets a verse can be filed under, replacing the
// old "Delete" action — verses aren't removed, just moved between piles.
// The ids are stored as-is in Firestore (see setVerseBucket), so only the
// display labels change if these get renamed again — never the ids.
const BUCKETS = [
  { id: "memorizing", label: "Memorizing" },
  { id: "future", label: "Future" },
  { id: "memorized", label: "Complete" },
];

// Three standalone icons (no head/silhouette) marking which bucket this
// is — a brain (actively working on it — Memorizing), a calendar
// (Future), or a lightbulb with a checkmark and idea rays (got it —
// Complete). Pure line art via currentColor, so it's
// automatically monochrome and adapts to the light/dark theme.
const BUCKET_ICONS = {
  memorizing:
    '<g transform="translate(12,12) scale(2.15)">' +
    '<path d="M-3.4,0.3 A1.5,1.5 0 0 1 -2.6,-2.3 A1.5,1.5 0 0 1 0.1,-3.3 A1.5,1.5 0 0 1 2.8,-2.3 A1.6,1.6 0 0 1 3.5,0.4 A1.5,1.5 0 0 1 2.4,3.2 A1.5,1.5 0 0 1 -0.4,3.4 A1.5,1.5 0 0 1 -3.4,0.3 Z"/>' +
    '<path d="M0.1,-3.3 L0.1,3.3"/>' +
    '<path d="M-2,-1.4 C-1.3,-1 -0.5,-1 0.1,-1.4"/>' +
    '<path d="M0.6,-1.4 C1.2,-1 1.9,-1.2 2.2,-1.8"/>' +
    '<path d="M-1.6,0.8 C-1,1.2 -0.2,1.1 0.1,0.6"/>' +
    '<path d="M0.6,0.7 C1.1,1.1 1.7,1 2,0.5"/></g>',
  future:
    '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/>' +
    '<path d="M3.5,9 L20.5,9"/>' +
    '<path d="M7.5,2.5 L7.5,6.5 M16.5,2.5 L16.5,6.5"/>' +
    '<circle cx="12" cy="14.2" r="1.7" fill="currentColor" stroke="none"/>',
  memorized:
    '<g transform="translate(12,13) scale(1.5)">' +
    '<path d="M-2.3,-1.2 C-2.3,-2.8 -1.1,-4 0,-4 C1.1,-4 2.3,-2.8 2.3,-1.2 C2.3,-0.1 1.7,0.6 1.2,1.2 C0.9,1.6 0.7,2 0.7,2.5 L-0.7,2.5 C-0.7,2 -0.9,1.6 -1.2,1.2 C-1.7,0.6 -2.3,-0.1 -2.3,-1.2 Z"/>' +
    '<path d="M-0.7,2.5 L-0.7,3.3 L0.7,3.3 L0.7,2.5"/>' +
    '<path d="M-1,-1.4 L-0.2,-0.3 L1.4,-2.2"/></g>' +
    '<path d="M12,3.5 L12,1.8 M6.5,5.8 L5.2,4.5 M17.5,5.8 L18.8,4.5 M4.5,11 L2.8,11 M19.5,11 L21.2,11"/>',
};

function bucketIconSvg(bucketId) {
  return `<svg class="mem-bucket-icon" viewBox="0 0 24 24" aria-hidden="true">${BUCKET_ICONS[bucketId] || ""}</svg>`;
}

// How many recently-practiced verses to avoid immediately repeating via
// "Next Verse" — mirrors the same recency window used by the Questions quiz.
const VERSE_RECENCY_WINDOW = 10;

let verses = [];
let categories = [];
let activeUserId = null;
let refs = {};
let selectedCategoryId = ""; // "" = All
let selectedBucket = "memorizing";
let practiceMode = loadPref(MODE_KEY, "fitb"); // "fitb" | "flashcard"
let view = "list"; // "list" | "practice"
let currentVerseId = null;
let verseHistory = []; // verse ids practiced this session, most recent last
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

// ---------- Mastery dot ----------

// A small gray-to-red-to-green dot summarizing how this verse is going —
// gray until it's been practiced at all, then a traffic-light color from
// the same recency-weighted average used to prioritize "Next Verse".
function masteryColor(verse) {
  const { avg } = verseStatsFor(verse, activeUserId);
  if (avg === null) return "#9ca3af";
  return `hsl(${Math.round(avg * 120)}, 70%, 45%)`;
}

// ---------- Home view: categories, mode tabs, verse list ----------

// Which of the three BUCKETS a verse is currently filed under for the
// active user — missing/no-user defaults to "memorizing" so pre-existing
// verses (added before buckets existed) show up in the main working set.
function bucketForVerse(v) {
  return (activeUserId && v.buckets && v.buckets[activeUserId]) || "memorizing";
}

function versesInSelectedBucket() {
  return verses.filter((v) => bucketForVerse(v) === selectedBucket);
}

function filteredVerses() {
  let list = versesInSelectedBucket();
  if (selectedCategoryId) {
    list = list.filter((v) => v.categoryId === selectedCategoryId);
  }
  return list;
}

function renderBucketTabs() {
  const row = refs.bucketTabs;
  row.innerHTML = BUCKETS.map((b) => {
    const count = verses.filter((v) => bucketForVerse(v) === b.id).length;
    return `<button class="mem-mode-tab ${selectedBucket === b.id ? "active" : ""}" data-bucket="${b.id}">${bucketIconSvg(b.id)} ${b.label} (${count})</button>`;
  }).join("");
  row.querySelectorAll(".mem-mode-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedBucket = btn.dataset.bucket;
      renderHome();
    });
  });
}

function renderCategoryRow() {
  const row = refs.categoryRow;
  // No custom categories made yet — nothing to filter by, so skip the row
  // entirely rather than showing a lone, useless "All" chip.
  if (categories.length === 0) {
    row.hidden = true;
    return;
  }
  row.hidden = false;
  row.innerHTML = "";
  const base = versesInSelectedBucket();

  const allChip = document.createElement("button");
  allChip.className = "chip" + (selectedCategoryId === "" ? " active" : "");
  allChip.textContent = `All (${base.length})`;
  allChip.addEventListener("click", () => {
    selectedCategoryId = "";
    renderCategoryRow();
    renderVerseList();
  });
  row.appendChild(allChip);

  categories.forEach((cat) => {
    const count = base.filter((v) => v.categoryId === cat.id).length;
    const chip = document.createElement("button");
    chip.className = "chip" + (selectedCategoryId === cat.id ? " active" : "");
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
  const list = filteredVerses();
  refs.playBtn.hidden = list.length === 0;
  refs.listEl.innerHTML = "";
  refs.emptyEl.hidden = verses.length !== 0;
  refs.listEl.hidden = list.length === 0;

  list.forEach((v) => {
    const li = document.createElement("li");
    li.className = "mem-verse-card";
    // The whole card opens practice — it's a plain li (not a <button>)
    // specifically so the bucket-picker <details> below can nest inside
    // it validly; its own click listener stops this one from firing.
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.addEventListener("click", () => openPractice(v.id));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPractice(v.id);
      }
    });

    const refLine = document.createElement("div");
    refLine.className = "mem-verse-card-top";
    const refEl = document.createElement("strong");
    refEl.textContent = v.reference;
    refLine.appendChild(refEl);

    const topRight = document.createElement("div");
    topRight.className = "mem-verse-card-top-right";
    topRight.addEventListener("click", (e) => e.stopPropagation());

    const currentBucket = bucketForVerse(v);
    const picker = document.createElement("details");
    picker.className = "mem-bucket-pick";
    const summary = document.createElement("summary");
    summary.innerHTML = bucketIconSvg(currentBucket);
    summary.title = (BUCKETS.find((b) => b.id === currentBucket) || {}).label || "";
    picker.appendChild(summary);

    const panel = document.createElement("div");
    panel.className = "mem-bucket-pick-panel";
    BUCKETS.forEach((b) => {
      const optBtn = document.createElement("button");
      optBtn.type = "button";
      optBtn.className = "mem-bucket-pick-option" + (b.id === currentBucket ? " active" : "");
      optBtn.innerHTML = `${bucketIconSvg(b.id)}<span>${b.label}</span>`;
      optBtn.addEventListener("click", () => {
        picker.open = false;
        if (!activeUserId) {
          alert("Pick who you are (in the User dropdown up top) before changing a verse's status.");
          return;
        }
        setVerseBucket(v.id, activeUserId, b.id);
      });
      panel.appendChild(optBtn);
    });
    picker.appendChild(panel);
    topRight.appendChild(picker);

    const dot = document.createElement("span");
    dot.className = "mem-mastery-dot";
    dot.style.backgroundColor = masteryColor(v);
    topRight.appendChild(dot);

    refLine.appendChild(topRight);
    li.appendChild(refLine);

    const snippet = document.createElement("p");
    snippet.className = "mem-verse-snippet";
    snippet.textContent = v.text.length > 90 ? v.text.slice(0, 90) + "…" : v.text;
    li.appendChild(snippet);

    refs.listEl.appendChild(li);
  });
}

function renderHome() {
  renderBucketTabs();
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

function openPractice(verseId, opts) {
  currentVerseId = verseId;
  view = "practice";
  refs.listView.hidden = true;
  if (practiceMode === "fitb") startFitbChallenge(verseId, opts && opts.skipPreview);
  else startFlashcard(verseId);
}

function closePractice() {
  view = "list";
  currentVerseId = null;
  refs.listView.hidden = false;
  refs.practiceArea.innerHTML = "";
  renderHome();
}

// Recency-weighted mastery for one user on one verse, from the last (up
// to) 5 practice-attempt scores — null means never practiced.
function verseStatsFor(v, userId) {
  const p = (v.progress && v.progress[userId]) || {};
  const scores = p.recentScores || [];
  return {
    avg: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    practiced: scores.length > 0,
  };
}

function verseWeightFor(v, userId) {
  const { avg } = verseStatsFor(v, userId);
  return 1 + (1 - (avg === null ? 1 : avg)) * 3;
}

// Same shape as the Questions quiz's picker: never-practiced verses first,
// then a weighted pick favoring ones scored poorly, avoiding anything
// practiced in the last VERSE_RECENCY_WINDOW attempts if there's an
// alternative.
function pickNextVerse(pool, userId, recentIds) {
  if (pool.length === 0) return null;
  const recentSet = new Set((recentIds || []).slice(-VERSE_RECENCY_WINDOW));
  const notRecent = pool.filter((v) => !recentSet.has(v.id));
  const candidates = notRecent.length > 0 ? notRecent : pool;

  const unpracticed = candidates.filter((v) => !verseStatsFor(v, userId).practiced);
  if (unpracticed.length > 0) {
    return unpracticed[Math.floor(Math.random() * unpracticed.length)];
  }

  const weights = candidates.map((v) => verseWeightFor(v, userId));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// Moves straight into practicing another verse from the current
// bucket/category pool — skipping the difficulty-picker screen, same as
// "Next" on the Questions quiz.
function goToNextVerse() {
  verseHistory.push(currentVerseId);
  const pool = filteredVerses();
  const next = pickNextVerse(pool, activeUserId, verseHistory);
  if (!next) {
    closePractice();
    return;
  }
  currentVerseId = next.id;
  if (practiceMode === "fitb") startFitbBlanks(next.id);
  else startFlashcard(next.id);
}

// "▶ Play" kicks off a practice session over just the verses in the
// current bucket/category view — picks the first verse the same way
// "Next Verse" would (new ones first, then weighted toward poor scores),
// then that button chains through the rest.
function startPlay() {
  verseHistory = [];
  const pool = filteredVerses();
  const first = pickNextVerse(pool, activeUserId, verseHistory);
  if (!first) return;
  // Skip the verse-text preview for Play's first verse — with a whole
  // session ahead of you, seeing the answer before picking a difficulty
  // isn't the point (every verse after this one already skips it, via
  // goToNextVerse going straight to the blanks screen).
  openPractice(first.id, { skipPreview: true });
}

// ---------- Fill in the Blank ----------

let blanksLevel = Number(loadPref(LEVEL_KEY, "0"));
let blanksTokens = [];
let hadWrongInSession = false;
let showingFullVerseDuringPractice = false;

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
      wrongAttempts: 0,
      helped: false,
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

  // BLANK_FRACTIONS is the fraction to blank out; priority is sorted
  // easiest-to-reveal first, so what's LEFT UN-blanked comes off the front.
  const blankFraction = BLANK_FRACTIONS[blanksLevel];
  const revealCount = Math.round((1 - blankFraction) * priority.length);
  const revealedSet = new Set(priority.slice(0, revealCount));

  tokens.forEach((t, i) => {
    if (t.blankable) t.revealed = revealedSet.has(i);
  });

  return tokens;
}

function startFitbChallenge(verseId, skipPreview) {
  const verse = verses.find((v) => v.id === verseId);
  if (!verse) {
    closePractice();
    return;
  }
  refs.practiceArea.innerHTML = `
    <button id="practice-close-btn" class="btn btn-small back-btn">← Back to Verse Library</button>
    <p class="mem-challenge-label">Ready to Memorize?</p>
    ${
      skipPreview
        ? ""
        : `<div class="mem-ref-pill">🖐 ${escapeHtml(verse.reference)}</div>
           <div class="mem-challenge-verse-card">"${escapeHtml(verse.text)}"</div>`
    }
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
  showingFullVerseDuringPractice = false;
  blanksTokens = buildBlanksTokens(verse.text);
  renderFitbBlanks(verse);
}

// Widens the blank roughly with the word it's hiding, so a long word like
// "beginning" reads as a longer blank than "of" even though only the first
// letter is actually typed into it.
function blankWidth(word) {
  return Math.max(1.5, Math.min(6, word.length * 0.65)).toFixed(2) + "rem";
}

function renderFitbBlanks(verse) {
  const wordsHtml = blanksTokens
    .map((t, i) => {
      if (!t.blankable || t.revealed) return `<span class="blank-word">${escapeHtml(t.raw)}</span>`;
      return `<span class="blank-word blank-pending" data-index="${i}">${escapeHtml(t.prefix)}<input class="letter-input" style="width:${blankWidth(t.core)}" data-index="${i}" maxlength="1" autocomplete="off" autocapitalize="off">${escapeHtml(t.suffix)}</span>`;
    })
    .join(" ");
  const isComplete = !blanksTokens.some((t) => t.blankable && !t.revealed && !t.resolved);

  refs.practiceArea.innerHTML = `
    <button id="practice-close-btn" class="btn btn-small back-btn">← Back to Verse Library</button>
    <div class="mem-practice-header">
      <span class="mem-ref-pill">🖐 ${escapeHtml(verse.reference)} (KJV)</span>
      <span class="mem-difficulty-pill"><span class="dot ${LEVEL_DOT_CLASSES[blanksLevel]}"></span>${LEVEL_LABELS[blanksLevel]}</span>
    </div>
    ${
      isComplete
        ? ""
        : `<div class="mem-blanks-toolbar">
            <button id="fitb-show-full-btn" class="btn btn-small">${showingFullVerseDuringPractice ? "🙈 Hide Full Verse" : "👁️ Show Full Verse"}</button>
            <button id="fitb-idk-btn" class="btn btn-small">🤷 IDK</button>
          </div>`
    }
    <div class="mem-blanks-card">${wordsHtml}</div>
    <p id="fitb-feedback" class="practice-feedback"></p>
    <p id="fitb-full-text" class="memorize-verse-text" ${showingFullVerseDuringPractice ? "" : "hidden"}>${escapeHtml(verse.text)}</p>
    <div class="modal-actions">
      <button id="fitb-restart-btn" class="btn" hidden>Try Again</button>
      <button id="fitb-next-verse-btn" class="btn" hidden>Next Verse →</button>
      <button id="fitb-next-btn" class="btn btn-primary" hidden>Back to Verse Library</button>
    </div>
  `;

  refs.practiceArea.querySelector("#practice-close-btn").addEventListener("click", closePractice);
  const showFullBtn = refs.practiceArea.querySelector("#fitb-show-full-btn");
  if (showFullBtn) {
    showFullBtn.addEventListener("click", () => {
      showingFullVerseDuringPractice = !showingFullVerseDuringPractice;
      renderFitbBlanks(verse);
    });
  }
  const idkBtn = refs.practiceArea.querySelector("#fitb-idk-btn");
  if (idkBtn) idkBtn.addEventListener("click", () => applyIdk(verse));
  setupFitbInputs();

  if (!isComplete) {
    const first = refs.practiceArea.querySelector(".letter-input");
    if (first) first.focus();
  } else {
    checkFitbComplete(verse);
  }
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
        resolveBlank(idx, wordSpan, false);
      } else {
        hadWrongInSession = true;
        token.wrongAttempts++;
        if (token.wrongAttempts >= MAX_WRONG_ATTEMPTS) {
          resolveBlank(idx, wordSpan, true);
        } else {
          flashWrong(wordSpan);
          input.value = "";
        }
      }
    });
  });
}

// Fills in a blank — either because it was typed correctly, or because it
// was auto-filled (3 wrong attempts, or IDK) — and advances to the next one.
function resolveBlank(idx, wordSpan, helped) {
  const token = blanksTokens[idx];
  token.resolved = true;
  token.helped = helped;
  wordSpan.textContent = token.raw;
  wordSpan.classList.remove("blank-pending");
  wordSpan.classList.add(helped ? "blank-helped" : "blank-correct");
  focusNextBlank(idx);
  checkFitbComplete(verses.find((v) => v.id === currentVerseId));
}

// IDK always applies to the first not-yet-filled blank — in practice
// that's whichever one the person is currently stuck on.
function applyIdk(verse) {
  const pendingSpan = refs.practiceArea.querySelector(".blank-pending");
  if (!pendingSpan) return;
  const idx = Number(pendingSpan.dataset.index);
  resolveBlank(idx, pendingSpan, true);
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

  const blankable = blanksTokens.filter((t) => t.blankable && !t.revealed);
  const helpedCount = blankable.filter((t) => t.helped).length;
  const attemptScore = blankable.length > 0 ? (blankable.length - helpedCount) / blankable.length : 1;
  const wasCorrect = helpedCount === 0;
  recordVerseProgress(currentVerseId, activeUserId, wasCorrect, attemptScore);

  // The in-progress toolbar (Show Full Verse / IDK) is redundant once every
  // word is already showing — drop it rather than re-rendering the card.
  const toolbar = refs.practiceArea.querySelector(".mem-blanks-toolbar");
  if (toolbar) toolbar.remove();
  showingFullVerseDuringPractice = false;
  const fullTextEl = refs.practiceArea.querySelector("#fitb-full-text");
  if (fullTextEl) fullTextEl.hidden = true;

  const feedback = refs.practiceArea.querySelector("#fitb-feedback");
  feedback.textContent = hadWrongInSession ? "✅ Completed — you got there!" : "🌟 Perfect — first try!";
  feedback.className = "practice-feedback " + (hadWrongInSession ? "" : "feedback-correct");

  const pool = filteredVerses();
  const hasNextVerse = pool.length > 1;

  refs.practiceArea.querySelector("#fitb-restart-btn").hidden = false;
  refs.practiceArea.querySelector("#fitb-next-verse-btn").hidden = !hasNextVerse;
  refs.practiceArea.querySelector("#fitb-next-btn").hidden = false;
  refs.practiceArea.querySelector("#fitb-restart-btn").addEventListener("click", () => startFitbBlanks(verse.id));
  if (hasNextVerse) {
    refs.practiceArea.querySelector("#fitb-next-verse-btn").addEventListener("click", goToNextVerse);
  }
  refs.practiceArea.querySelector("#fitb-next-btn").addEventListener("click", closePractice);
}

// ---------- Flashcards ----------

let flashcardStartWith = loadPref(STARTWITH_KEY, "verse"); // "verse" | "reference"
let flashcardFlipped = false;
let flashcardGraded = false;

// Maps a self-grade to a 0..1 attempt score, feeding the same recency-
// weighted mastery used by Fill in the Blank and by "Next Verse".
const GRADE_SCORES = { fail: 0, hard: 0.33, good: 0.67, easy: 1 };

function startFlashcard(verseId) {
  flashcardFlipped = false;
  flashcardGraded = false;
  renderFlashcard(verseId);
}

function renderFlashcard(verseId) {
  const verse = verses.find((v) => v.id === verseId);
  if (!verse) {
    closePractice();
    return;
  }

  if (flashcardGraded) {
    const pool = filteredVerses();
    const hasNextVerse = pool.length > 1;
    refs.practiceArea.innerHTML = `
      <button id="practice-close-btn" class="btn btn-small back-btn">← Back to Verse Library</button>
      <div class="mem-practice-header"><span class="mem-ref-pill">🖐 ${escapeHtml(verse.reference)} (KJV)</span></div>
      <p class="practice-feedback feedback-correct">✅ Recorded!</p>
      <div class="modal-actions">
        <button id="flashcard-again-btn" class="btn">Practice Again</button>
        <button id="flashcard-next-verse-btn" class="btn" ${hasNextVerse ? "" : "hidden"}>Next Verse →</button>
        <button id="flashcard-done-btn" class="btn btn-primary">Back to Verse Library</button>
      </div>
    `;
    refs.practiceArea.querySelector("#practice-close-btn").addEventListener("click", closePractice);
    refs.practiceArea.querySelector("#flashcard-again-btn").addEventListener("click", () => startFlashcard(verseId));
    if (hasNextVerse) {
      refs.practiceArea.querySelector("#flashcard-next-verse-btn").addEventListener("click", goToNextVerse);
    }
    refs.practiceArea.querySelector("#flashcard-done-btn").addEventListener("click", closePractice);
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
    <button id="practice-close-btn" class="btn btn-small back-btn">← Back to Verse Library</button>
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
      const grade = btn.dataset.grade;
      recordVerseProgress(verseId, activeUserId, grade !== "fail", GRADE_SCORES[grade]);
      flashcardGraded = true;
      renderFlashcard(verseId);
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
      <div class="mem-mode-tabs" id="mem-bucket-tabs"></div>
      <div class="chip-row" id="mem-category-row"></div>
      <div class="mem-mode-tabs" id="mem-mode-tabs">
        <button class="mem-mode-tab" data-mode="fitb">✍️ Fill in the Blank</button>
        <button class="mem-mode-tab" data-mode="flashcard">🗂️ Flashcards</button>
      </div>
      <button id="mem-play-btn" class="btn btn-primary btn-block" hidden>▶ Play</button>
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
  refs.bucketTabs = container.querySelector("#mem-bucket-tabs");
  refs.categoryRow = container.querySelector("#mem-category-row");
  refs.modeTabs = container.querySelector("#mem-mode-tabs");
  refs.playBtn = container.querySelector("#mem-play-btn");
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
  refs.playBtn.addEventListener("click", startPlay);
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
    if (view === "list") renderHome();
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

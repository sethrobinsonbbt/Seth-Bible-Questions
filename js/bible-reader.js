import { BOOKS, BIBLE_VERSIONS } from "./bible-data.js";
import { fetchChapter } from "./bible-api.js";
import { addQuestion } from "./questions-data.js";
import { buildAgeGroupSelect } from "./age-groups-data.js";
import {
  populateChapterSelect as populatePickerChapterSelect,
  populateVerseRangeSelects,
  loadChapterVerses,
  computeVerseRangeSelection,
} from "./verse-picker.js";
import { addMemoryVerse } from "./memorize-data.js";
import { getActiveUser } from "./active-user.js";
import { parseReadingLabel, readingsForDate, dateKey } from "./default-reading-plan.js";
import { markDailyReadingDone } from "./daily-plan-data.js";

const STORAGE_KEY = "bible-reader-state";

let state = loadState();
let refs = {};
let requestId = 0;
let speaking = false;
let stoppingDeliberately = false; // true while we're cancelling speech ourselves (not a natural finish)
let currentVerses = []; // verse texts for the currently-loaded chapter, spoken one at a time
let currentVerseIndex = 0;
let fastForwardActive = false; // long-press-to-speed-up on the Listen button
let autoPlayNextChapter = false; // set when auto-advancing to the next daily reading mid-speech
let longPressTimer = null;
let longPressTriggered = false;
const NORMAL_RATE = 1;
const FAST_RATE = 2.2;
const LONG_PRESS_MS = 350;
const VOICE_KEY = "bible-questions-voice-uri";
let pickerVerses = []; // verses of the chapter currently loaded in the M+ modal
// Set when the chapter on screen is (part of) a tracked daily reading —
// { dateKey, index } where index is 0/1/2 for that day's 1st/2nd/3rd
// reading. Drives the "Mark as Read" / "Next Reading" footer. Cleared by
// any deliberate "go somewhere else" navigation (book picker, jump-to
// search) but preserved across Previous/Next chapter paging.
let dailyContext = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.book && saved.chapter && saved.version) {
      // Fall back to KJV if a previously-saved version (e.g. WEB/ASV/BBE)
      // has since been removed from BIBLE_VERSIONS.
      if (!BIBLE_VERSIONS.some((v) => v.id === saved.version)) saved.version = "kjv";
      return saved;
    }
  } catch (e) {
    /* ignore */
  }
  return { version: "kjv", book: "John", chapter: 3 };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* ignore */
  }
}

function bookChapterCount(bookName) {
  const book = BOOKS.find((b) => b.name === bookName);
  return book ? book.chapters : 1;
}

function buildSkeleton(container) {
  container.innerHTML = `
    <div class="bible-jump-row">
      <input id="bible-jump-input" type="text" placeholder="Jump to… e.g. John 3:16" />
      <button id="bible-jump-btn" class="btn btn-small">Go</button>
    </div>
    <p id="bible-jump-error" class="form-error" hidden>Couldn't find that — try "Book Chapter", e.g. "John 3".</p>
    <div class="bible-controls">
      <select id="bible-version-select" class="bible-select"></select>
      <select id="bible-book-select" class="bible-select"></select>
      <select id="bible-chapter-select" class="bible-select"></select>
    </div>
    <div class="bible-nav-row">
      <button id="bible-prev-btn" class="btn btn-small">← Previous</button>
      <div class="bible-plus-group">
        <button id="bible-addq-btn" class="q-plus-btn" aria-label="Add a question">Q<sup>+</sup></button>
        <button id="bible-addm-btn" class="q-plus-btn m-plus-btn" aria-label="Add a memory verse">M<sup>+</sup></button>
      </div>
      <button id="bible-next-btn" class="btn btn-small">Next →</button>
    </div>
    <div id="bible-content" class="bible-content"></div>

    <div id="bible-addq-modal-backdrop" class="modal-backdrop" hidden>
      <div class="modal">
        <h3>Add a Question</h3>
        <label for="bible-addq-text">Question</label>
        <textarea id="bible-addq-text" rows="3" placeholder="e.g. Who built the ark?"></textarea>
        <label for="bible-addq-answer">Answer</label>
        <input id="bible-addq-answer" type="text" placeholder="e.g. Noah" />
        <label for="bible-addq-reference">Reference (optional)</label>
        <input id="bible-addq-reference" type="text" placeholder="e.g. Genesis 6:14" />
        <label>Assign to</label>
        <div id="bible-addq-assign-wrap"></div>
        <p id="bible-addq-error" class="form-error" hidden></p>
        <div class="modal-actions">
          <button id="bible-addq-cancel-btn" class="btn">Cancel</button>
          <button id="bible-addq-save-btn" class="btn btn-primary">Save</button>
        </div>
      </div>
    </div>

    <div id="bible-addm-modal-backdrop" class="modal-backdrop" hidden>
      <div class="modal">
        <h3>Add a Memory Verse</h3>
        <div class="verse-picker-controls">
          <select id="bible-addm-book-select" class="bible-select"></select>
          <select id="bible-addm-chapter-select" class="bible-select"></select>
        </div>
        <div class="verse-range-row">
          <div>
            <label for="bible-addm-from-verse-select">From verse</label>
            <select id="bible-addm-from-verse-select" class="bible-select"></select>
          </div>
          <div>
            <label for="bible-addm-to-verse-select">To verse</label>
            <select id="bible-addm-to-verse-select" class="bible-select"></select>
          </div>
        </div>
        <p id="bible-addm-preview" class="memorize-verse-text"></p>
        <p id="bible-addm-error" class="form-error" hidden></p>
        <div class="modal-actions">
          <button id="bible-addm-cancel-btn" class="btn">Cancel</button>
          <button id="bible-addm-save-btn" class="btn btn-primary">Add Verse</button>
        </div>
      </div>
    </div>
  `;

  refs.jumpInput = container.querySelector("#bible-jump-input");
  refs.jumpError = container.querySelector("#bible-jump-error");
  const jump = () => jumpToReference();
  container.querySelector("#bible-jump-btn").addEventListener("click", jump);
  refs.jumpInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") jump();
  });

  refs.versionSelect = container.querySelector("#bible-version-select");
  refs.bookSelect = container.querySelector("#bible-book-select");
  refs.chapterSelect = container.querySelector("#bible-chapter-select");
  refs.prevBtn = container.querySelector("#bible-prev-btn");
  refs.nextBtn = container.querySelector("#bible-next-btn");
  refs.content = container.querySelector("#bible-content");
  refs.addqBtn = container.querySelector("#bible-addq-btn");
  refs.addqModalBackdrop = container.querySelector("#bible-addq-modal-backdrop");
  refs.addqText = container.querySelector("#bible-addq-text");
  refs.addqAnswer = container.querySelector("#bible-addq-answer");
  refs.addqReference = container.querySelector("#bible-addq-reference");
  refs.addqAssignWrap = container.querySelector("#bible-addq-assign-wrap");
  refs.addqError = container.querySelector("#bible-addq-error");

  refs.addqBtn.addEventListener("click", openAddQModal);
  container.querySelector("#bible-addq-cancel-btn").addEventListener("click", closeAddQModal);
  refs.addqModalBackdrop.addEventListener("click", (e) => {
    if (e.target === refs.addqModalBackdrop) closeAddQModal();
  });
  container.querySelector("#bible-addq-save-btn").addEventListener("click", saveQuickQuestion);

  refs.addmBtn = container.querySelector("#bible-addm-btn");
  refs.addmModalBackdrop = container.querySelector("#bible-addm-modal-backdrop");
  refs.addmBookSelect = container.querySelector("#bible-addm-book-select");
  refs.addmChapterSelect = container.querySelector("#bible-addm-chapter-select");
  refs.addmFromSelect = container.querySelector("#bible-addm-from-verse-select");
  refs.addmToSelect = container.querySelector("#bible-addm-to-verse-select");
  refs.addmPreview = container.querySelector("#bible-addm-preview");
  refs.addmError = container.querySelector("#bible-addm-error");

  BOOKS.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b.name;
    opt.textContent = b.name;
    refs.addmBookSelect.appendChild(opt);
  });

  refs.addmBtn.addEventListener("click", openAddMModal);
  container.querySelector("#bible-addm-cancel-btn").addEventListener("click", closeAddMModal);
  refs.addmModalBackdrop.addEventListener("click", (e) => {
    if (e.target === refs.addmModalBackdrop) closeAddMModal();
  });
  container.querySelector("#bible-addm-save-btn").addEventListener("click", saveVerseFromPicker);
  refs.addmBookSelect.addEventListener("change", () => {
    populatePickerChapterSelect(refs.addmChapterSelect, refs.addmBookSelect.value);
    loadPickerChapter();
  });
  refs.addmChapterSelect.addEventListener("change", loadPickerChapter);
  refs.addmFromSelect.addEventListener("change", onFromVerseChange);
  refs.addmToSelect.addEventListener("change", onToVerseChange);

  BIBLE_VERSIONS.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.label;
    refs.versionSelect.appendChild(opt);
  });
  // Nothing to choose with only one version — hide the dropdown rather
  // than show a select you can't actually change.
  refs.versionSelect.hidden = BIBLE_VERSIONS.length <= 1;

  BOOKS.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b.name;
    opt.textContent = b.name;
    refs.bookSelect.appendChild(opt);
  });

  refs.versionSelect.addEventListener("change", () => {
    state.version = refs.versionSelect.value;
    saveState();
    loadChapter();
  });

  refs.bookSelect.addEventListener("change", () => {
    state.book = refs.bookSelect.value;
    state.chapter = 1;
    dailyContext = null;
    saveState();
    populateChapterSelect();
    loadChapter();
  });

  refs.chapterSelect.addEventListener("change", () => {
    state.chapter = Number(refs.chapterSelect.value);
    saveState();
    loadChapter();
  });

  refs.prevBtn.addEventListener("click", () => step(-1));
  refs.nextBtn.addEventListener("click", () => step(1));
}

function populateChapterSelect() {
  const count = bookChapterCount(state.book);
  refs.chapterSelect.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Chapter ${i}`;
    refs.chapterSelect.appendChild(opt);
  }
}

function syncControls() {
  refs.versionSelect.value = state.version;
  refs.bookSelect.value = state.book;
  populateChapterSelect();
  refs.chapterSelect.value = String(state.chapter);
}

function step(delta) {
  const bookIdx = BOOKS.findIndex((b) => b.name === state.book);
  let chapter = state.chapter + delta;
  let idx = bookIdx;

  if (chapter < 1) {
    if (bookIdx === 0) return; // already at the very first chapter of the Bible
    idx = bookIdx - 1;
    chapter = BOOKS[idx].chapters;
  } else if (chapter > bookChapterCount(state.book)) {
    if (bookIdx === BOOKS.length - 1) return; // already at the very last chapter of the Bible
    idx = bookIdx + 1;
    chapter = 1;
  }

  state.book = BOOKS[idx].name;
  state.chapter = chapter;
  saveState();
  syncControls();
  loadChapter();
}

async function loadChapter() {
  const myRequest = ++requestId;
  stopListening();
  refs.content.innerHTML = `<p class="bible-status">Loading ${state.book} ${state.chapter}…</p>`;

  try {
    const data = await fetchChapter(state.book, state.chapter, state.version);
    if (myRequest !== requestId) return; // a newer request superseded this one

    const verseHtml = data.verses
      .map((v) => `<p class="bible-verse"><sup>${v.verse}</sup> ${escapeHtml(v.text)}</p>`)
      .join("");

    const voices = supportsSpeech() ? window.speechSynthesis.getVoices() : [];
    const listenBtn = supportsSpeech()
      ? `<button id="bible-listen-btn" class="btn btn-small listen-btn">🔊 Listen</button>`
      : "";
    const voiceRowHtml =
      supportsSpeech() && voices.length > 1
        ? `
          <div class="bible-voice-row">
            <label for="bible-voice-select">Voice</label>
            <select id="bible-voice-select" class="bible-select"></select>
          </div>
        `
        : "";

    const dailyFooterHtml = dailyContext
      ? `
        <div class="bible-daily-actions">
          <button id="bible-mark-read-btn" class="btn btn-primary">✓ Mark as Read</button>
          <p id="bible-mark-read-status" class="bible-mark-read-status" hidden>Marked! ✅</p>
          <div class="bible-daily-actions-row">
            <button id="bible-next-chapter-btn" class="btn btn-small">Next Chapter →</button>
            ${dailyContext.index < 2 ? `<button id="bible-next-reading-btn" class="btn btn-small">Next Reading →</button>` : ""}
          </div>
        </div>
      `
      : "";

    refs.content.innerHTML = `
      <div class="bible-chapter-heading-row">
        <h3 class="bible-chapter-heading">${escapeHtml(data.reference)} — ${escapeHtml(data.translationName)}</h3>
        ${listenBtn}
      </div>
      ${voiceRowHtml}
      ${verseHtml || '<p class="bible-status">No verses returned.</p>'}
      ${dailyFooterHtml}
    `;

    if (supportsSpeech()) {
      const verseTexts = data.verses.map((v) => v.text);
      setupListenButton(verseTexts);
      setupVoiceSelect(voices);
      if (autoPlayNextChapter) {
        autoPlayNextChapter = false;
        startListening(verseTexts);
      }
    }

    if (dailyContext) {
      refs.content.querySelector("#bible-mark-read-btn").addEventListener("click", markCurrentReadingRead);
      refs.content.querySelector("#bible-next-chapter-btn").addEventListener("click", () => step(1));
      const nextReadingBtn = refs.content.querySelector("#bible-next-reading-btn");
      if (nextReadingBtn) nextReadingBtn.addEventListener("click", goToNextReadingForDay);
    }
  } catch (err) {
    if (myRequest !== requestId) return;
    console.error(err);
    const message =
      err && err.message && err.message.includes("ESV API key")
        ? escapeHtml(err.message)
        : "Couldn't load this chapter. Check your internet connection and try again.";
    refs.content.innerHTML = `
      <p class="bible-status bible-error">${message}</p>
      <button id="bible-retry-btn" class="btn btn-small">Retry</button>
    `;
    refs.content.querySelector("#bible-retry-btn").addEventListener("click", loadChapter);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Read-aloud ----------
//
// Spoken one verse at a time (chained via onend) rather than as one long
// utterance, so a long-press on the Listen button can restart just the
// current verse at a faster rate instead of losing your place in the
// whole chapter. `stoppingDeliberately` distinguishes "we cancelled this
// utterance ourselves" (restart/stop/navigate away) from "it actually
// finished speaking" (browsers fire onend either way).

function supportsSpeech() {
  return "speechSynthesis" in window;
}

function getSavedVoiceURI() {
  try {
    return localStorage.getItem(VOICE_KEY) || null;
  } catch (e) {
    return null;
  }
}

function saveVoiceURI(uri) {
  try {
    if (uri) localStorage.setItem(VOICE_KEY, uri);
    else localStorage.removeItem(VOICE_KEY);
  } catch (e) {
    /* ignore */
  }
}

// Prefers a saved manual pick; otherwise a heuristic "best" voice — network
// voices (not locally synthesized) tend to sound noticeably more natural
// than a device's built-in default, so favor those when the browser
// exposes any, falling back to a name that suggests better quality.
function pickBestVoice(voices) {
  const english = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : voices;
  return (
    pool.find((v) => !v.localService) ||
    pool.find((v) => /Google|Microsoft|Natural|Enhanced|Premium/i.test(v.name)) ||
    pool[0] ||
    null
  );
}

function getSelectedVoice() {
  if (!supportsSpeech()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const savedURI = getSavedVoiceURI();
  const saved = savedURI && voices.find((v) => v.voiceURI === savedURI);
  return saved || pickBestVoice(voices);
}

function setupVoiceSelect(voices) {
  const select = refs.content.querySelector("#bible-voice-select");
  if (!select) return;
  const current = getSelectedVoice();
  select.innerHTML = "";
  voices.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.voiceURI;
    opt.textContent = v.name;
    select.appendChild(opt);
  });
  if (current) select.value = current.voiceURI;
  select.addEventListener("change", () => saveVoiceURI(select.value));
}

function updateListenBtnLabel() {
  const btn = refs.content.querySelector("#bible-listen-btn");
  if (!btn) return;
  btn.textContent = speaking ? (fastForwardActive ? "⏩ 2x speed" : "⏹ Stop") : "🔊 Listen";
}

function stopListening() {
  if (supportsSpeech() && speaking) {
    stoppingDeliberately = true;
    window.speechSynthesis.cancel();
  }
  speaking = false;
  fastForwardActive = false;
}

function startListening(verses) {
  stopListening();
  speaking = true;
  currentVerses = verses;
  currentVerseIndex = 0;
  speakCurrentVerse();
  updateListenBtnLabel();
}

function speakCurrentVerse() {
  if (!speaking) return;
  if (currentVerseIndex >= currentVerses.length) {
    speaking = false;
    updateListenBtnLabel();
    onChapterFinishedSpeaking();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(currentVerses[currentVerseIndex]);
  utterance.rate = fastForwardActive ? FAST_RATE : NORMAL_RATE;
  const voice = getSelectedVoice();
  if (voice) {
    try {
      utterance.voice = voice;
    } catch (e) {
      /* stale voice reference — fall back to the engine's default */
    }
  }
  utterance.onend = () => {
    if (stoppingDeliberately) {
      stoppingDeliberately = false;
      return;
    }
    if (!speaking) return;
    currentVerseIndex++;
    speakCurrentVerse();
  };
  utterance.onerror = () => {
    stoppingDeliberately = false;
  };
  window.speechSynthesis.speak(utterance);
}

// Restarts just the current verse — used when toggling the long-press
// speed boost on or off, so the rate change takes effect immediately
// without losing more than a few words of context.
function restartCurrentVerseAtRate() {
  if (!speaking) return;
  stoppingDeliberately = true;
  window.speechSynthesis.cancel();
  speakCurrentVerse();
}

// When a chapter finishes speaking on its own (not stopped manually) and
// it was part of today's reading plan: mark it read and keep going
// hands-free into the next reading, or stop once the day's last one ends.
function onChapterFinishedSpeaking() {
  if (!dailyContext) return;
  markDailyReadingDone(dailyContext.dateKey, dailyContext.index);
  if (dailyContext.index >= 2) return;

  const readings = readingsForDate(new Date(`${dailyContext.dateKey}T00:00:00`));
  if (!readings) return;
  const nextIndex = dailyContext.index + 1;
  const chapters = parseReadingLabel(readings[nextIndex]);
  if (chapters.length === 0) return;

  autoPlayNextChapter = true;
  goTo(chapters[0].book, chapters[0].chapter, state.version, { dateKey: dailyContext.dateKey, index: nextIndex });
}

function setupListenButton(verses) {
  const btn = refs.content.querySelector("#bible-listen-btn");
  if (!btn) return;
  updateListenBtnLabel();

  btn.addEventListener("pointerdown", () => {
    if (!speaking) return;
    longPressTriggered = false;
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      fastForwardActive = true;
      restartCurrentVerseAtRate();
      updateListenBtnLabel();
    }, LONG_PRESS_MS);
  });

  const endPress = () => {
    clearTimeout(longPressTimer);
    if (fastForwardActive) {
      fastForwardActive = false;
      restartCurrentVerseAtRate();
      updateListenBtnLabel();
    }
  };
  btn.addEventListener("pointerup", endPress);
  btn.addEventListener("pointerleave", endPress);
  btn.addEventListener("pointercancel", endPress);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());

  btn.addEventListener("click", () => {
    if (longPressTriggered) {
      longPressTriggered = false; // consume — this click just ended a long-press, not a tap
      return;
    }
    if (speaking) {
      stopListening();
      updateListenBtnLabel();
    } else {
      startListening(verses);
    }
  });
}

// ---------- Quick "Q+" add-question (no Setup passcode needed) ----------

function openAddQModal() {
  refs.addqText.value = "";
  refs.addqAnswer.value = "";
  refs.addqReference.value = state.book && state.chapter ? `${state.book} ${state.chapter}` : "";
  refs.addqError.hidden = true;
  const select = buildAgeGroupSelect("");
  refs.addqAssignWrap.innerHTML = "";
  refs.addqAssignWrap.appendChild(select);
  refs.addqAssign = select;
  refs.addqModalBackdrop.hidden = false;
  refs.addqText.focus();
}

function closeAddQModal() {
  refs.addqModalBackdrop.hidden = true;
}

function saveQuickQuestion() {
  const text = refs.addqText.value.trim();
  const answer = refs.addqAnswer.value.trim();
  if (!text) {
    refs.addqError.textContent = "Give the question some text.";
    refs.addqError.hidden = false;
    return;
  }
  if (!answer) {
    refs.addqError.textContent = "An answer is required (reference is optional).";
    refs.addqError.hidden = false;
    return;
  }
  const reference = refs.addqReference.value.trim();
  const assignedTo = refs.addqAssign.value || null;
  addQuestion(text, answer, reference, assignedTo);
  closeAddQModal();
}

// ---------- Quick "M+" add-memory-verse (mirrors Q+) ----------

function openAddMModal() {
  refs.addmError.hidden = true;
  refs.addmBookSelect.value = state.book;
  populatePickerChapterSelect(refs.addmChapterSelect, refs.addmBookSelect.value);
  refs.addmChapterSelect.value = String(state.chapter);
  refs.addmModalBackdrop.hidden = false;
  loadPickerChapter();
}

function closeAddMModal() {
  refs.addmModalBackdrop.hidden = true;
}

async function loadPickerChapter() {
  const book = refs.addmBookSelect.value;
  const chapter = Number(refs.addmChapterSelect.value);
  refs.addmError.hidden = true;
  refs.addmPreview.textContent = `Loading ${book} ${chapter}…`;
  try {
    pickerVerses = await loadChapterVerses(book, chapter);
    populateVerseRangeSelects(refs.addmFromSelect, refs.addmToSelect, pickerVerses.length);
    updateAddmPreview();
  } catch (err) {
    console.error(err);
    pickerVerses = [];
    refs.addmPreview.textContent = "";
    refs.addmError.textContent = "Couldn't load that chapter. Check your internet connection and try again.";
    refs.addmError.hidden = false;
  }
}

function updateAddmPreview() {
  const from = Number(refs.addmFromSelect.value);
  const to = Number(refs.addmToSelect.value);
  const selection = computeVerseRangeSelection(refs.addmBookSelect.value, Number(refs.addmChapterSelect.value), pickerVerses, from, to);
  refs.addmPreview.textContent = selection ? selection.text : "";
}

function onFromVerseChange() {
  const from = Number(refs.addmFromSelect.value);
  const to = Number(refs.addmToSelect.value);
  if (from > to) refs.addmToSelect.value = String(from);
  updateAddmPreview();
}

function onToVerseChange() {
  const from = Number(refs.addmFromSelect.value);
  const to = Number(refs.addmToSelect.value);
  if (to < from) refs.addmFromSelect.value = String(to);
  updateAddmPreview();
}

function saveVerseFromPicker() {
  if (!getActiveUser()) {
    refs.addmError.textContent = "Pick who's memorizing this up top ☝️ before adding a verse.";
    refs.addmError.hidden = false;
    return;
  }
  const from = Number(refs.addmFromSelect.value);
  const to = Number(refs.addmToSelect.value);
  const selection = computeVerseRangeSelection(refs.addmBookSelect.value, Number(refs.addmChapterSelect.value), pickerVerses, from, to);
  if (!selection) {
    refs.addmError.textContent = "Couldn't load that chapter's verses — try again.";
    refs.addmError.hidden = false;
    return;
  }
  addMemoryVerse(selection.reference, selection.text);
  closeAddMModal();
}

// ---------- Daily-reading footer (Mark as Read / Next Reading) ----------

function markCurrentReadingRead() {
  if (!dailyContext) return;
  markDailyReadingDone(dailyContext.dateKey, dailyContext.index);
  const statusEl = refs.content.querySelector("#bible-mark-read-status");
  if (statusEl) {
    statusEl.hidden = false;
    setTimeout(() => {
      statusEl.hidden = true;
    }, 1800);
  }
}

function goToNextReadingForDay() {
  if (!dailyContext || dailyContext.index >= 2) return;
  const readings = readingsForDate(new Date(`${dailyContext.dateKey}T00:00:00`));
  if (!readings) return;
  const nextIndex = dailyContext.index + 1;
  const chapters = parseReadingLabel(readings[nextIndex]);
  if (chapters.length === 0) return;
  goTo(chapters[0].book, chapters[0].chapter, state.version, { dateKey: dailyContext.dateKey, index: nextIndex });
}

// ---------- Quick "jump to reference" search ----------

function jumpToReference() {
  const raw = refs.jumpInput.value.trim();
  if (!raw) return;
  const parsed = parseReadingLabel(raw);
  const first = parsed[0];
  const match = first && BOOKS.find((b) => b.name.toLowerCase() === first.book.toLowerCase());

  if (!match || first.chapter < 1 || first.chapter > match.chapters) {
    refs.jumpError.hidden = false;
    return;
  }

  refs.jumpError.hidden = true;
  refs.jumpInput.value = "";
  goTo(match.name, first.chapter, state.version);
}

export function goTo(book, chapter, version, dailyCtx) {
  state.book = book;
  state.chapter = chapter;
  if (version) state.version = version;
  dailyContext = dailyCtx || null;
  saveState();
  syncControls();
  loadChapter();
}

export function mountBibleReader(container) {
  buildSkeleton(container);

  // Bible is the app's landing section — open straight to today's first
  // daily reading rather than resuming wherever a previous session left
  // off (mount only ever runs once, at app load).
  const today = new Date();
  const readings = readingsForDate(today);
  const firstReadingChapters = readings ? parseReadingLabel(readings[0]) : [];
  if (firstReadingChapters.length > 0) {
    state.book = firstReadingChapters[0].book;
    state.chapter = firstReadingChapters[0].chapter;
    dailyContext = { dateKey: dateKey(today), index: 0 };
    saveState();
  }

  syncControls();
  loadChapter();
}

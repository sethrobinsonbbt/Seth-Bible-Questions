import { BOOKS, BIBLE_VERSIONS } from "./bible-data.js";
import { fetchChapter } from "./bible-api.js";
import { addQuestion } from "./questions-data.js";
import { buildAgeGroupSelect } from "./age-groups-data.js";
import { populateChapterSelect as populatePickerChapterSelect, loadChapterVerses, computeVerseSelection } from "./verse-picker.js";
import { addMemoryVerse, getActiveMemorizeUser, setActiveMemorizeUser } from "./memorize-data.js";
import { subscribeUsers } from "./users.js";
import { parseReadingLabel } from "./default-reading-plan.js";

const STORAGE_KEY = "bible-reader-state";

let state = loadState();
let refs = {};
let requestId = 0;
let speaking = false;
let users = [];
let pickerVerses = []; // verses of the chapter currently loaded in the M+ modal

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
        <label for="bible-addm-user-select">Who's memorizing?</label>
        <select id="bible-addm-user-select" class="assign-select"></select>
        <div class="verse-picker-controls">
          <select id="bible-addm-book-select" class="bible-select"></select>
          <select id="bible-addm-chapter-select" class="bible-select"></select>
        </div>
        <p class="blank-help">Uncheck any verses you don't want to memorize.</p>
        <div class="verse-picker-select-row" id="bible-addm-select-row" hidden>
          <button id="bible-addm-select-all-btn" class="btn btn-small">Select All</button>
          <button id="bible-addm-select-none-btn" class="btn btn-small">Select None</button>
        </div>
        <div id="bible-addm-verse-list" class="verse-picker-list"></div>
        <p id="bible-addm-error" class="form-error" hidden></p>
        <div class="modal-actions">
          <button id="bible-addm-cancel-btn" class="btn">Cancel</button>
          <button id="bible-addm-save-btn" class="btn btn-primary">Add Selected</button>
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
  refs.addmUserSelect = container.querySelector("#bible-addm-user-select");
  refs.addmBookSelect = container.querySelector("#bible-addm-book-select");
  refs.addmChapterSelect = container.querySelector("#bible-addm-chapter-select");
  refs.addmSelectRow = container.querySelector("#bible-addm-select-row");
  refs.addmVerseList = container.querySelector("#bible-addm-verse-list");
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
  container.querySelector("#bible-addm-select-all-btn").addEventListener("click", () => setAllPickerChecked(true));
  container.querySelector("#bible-addm-select-none-btn").addEventListener("click", () => setAllPickerChecked(false));
  refs.addmBookSelect.addEventListener("change", () => {
    populatePickerChapterSelect(refs.addmChapterSelect, refs.addmBookSelect.value);
    loadPickerChapter();
  });
  refs.addmChapterSelect.addEventListener("change", loadPickerChapter);

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

    const listenBtn = supportsSpeech()
      ? `<button id="bible-listen-btn" class="btn btn-small listen-btn">🔊 Listen</button>`
      : "";

    refs.content.innerHTML = `
      <div class="bible-chapter-heading-row">
        <h3 class="bible-chapter-heading">${escapeHtml(data.reference)} — ${escapeHtml(data.translationName)}</h3>
        ${listenBtn}
      </div>
      ${verseHtml || '<p class="bible-status">No verses returned.</p>'}
    `;

    if (supportsSpeech()) {
      const chapterText = data.verses.map((v) => v.text).join(" ");
      refs.content.querySelector("#bible-listen-btn").addEventListener("click", () => toggleListen(chapterText));
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

function supportsSpeech() {
  return "speechSynthesis" in window;
}

function stopListening() {
  if (supportsSpeech() && speaking) window.speechSynthesis.cancel();
  speaking = false;
}

function toggleListen(text) {
  if (!supportsSpeech()) return;
  const btn = refs.content.querySelector("#bible-listen-btn");
  if (speaking) {
    stopListening();
    if (btn) btn.textContent = "🔊 Listen";
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = () => {
    speaking = false;
    if (btn) btn.textContent = "🔊 Listen";
  };
  utterance.onerror = () => {
    speaking = false;
    if (btn) btn.textContent = "🔊 Listen";
  };
  speaking = true;
  if (btn) btn.textContent = "⏹ Stop";
  window.speechSynthesis.speak(utterance);
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

function renderAddmUserSelect() {
  const select = refs.addmUserSelect;
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
  select.value = getActiveMemorizeUser() && users.some((u) => u.id === getActiveMemorizeUser()) ? getActiveMemorizeUser() : "";
}

function openAddMModal() {
  refs.addmError.hidden = true;
  refs.addmVerseList.innerHTML = "";
  refs.addmSelectRow.hidden = true;
  renderAddmUserSelect();
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
  refs.addmVerseList.innerHTML = `<p class="bible-status">Loading ${book} ${chapter}…</p>`;
  refs.addmSelectRow.hidden = true;
  try {
    pickerVerses = await loadChapterVerses(book, chapter);
    renderPickerVerseList();
  } catch (err) {
    console.error(err);
    pickerVerses = [];
    refs.addmVerseList.innerHTML = "";
    refs.addmError.textContent = "Couldn't load that chapter. Check your internet connection and try again.";
    refs.addmError.hidden = false;
  }
}

function renderPickerVerseList() {
  refs.addmVerseList.innerHTML = "";
  refs.addmSelectRow.hidden = pickerVerses.length === 0;
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
    refs.addmVerseList.appendChild(label);
  });
}

function setAllPickerChecked(checked) {
  refs.addmVerseList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = checked));
}

function saveVerseFromPicker() {
  const userId = refs.addmUserSelect.value;
  if (!userId) {
    refs.addmError.textContent = "Pick who's memorizing this verse.";
    refs.addmError.hidden = false;
    return;
  }
  const checkedSet = new Set(
    Array.from(refs.addmVerseList.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => Number(cb.dataset.verse))
  );
  const selection = computeVerseSelection(refs.addmBookSelect.value, Number(refs.addmChapterSelect.value), pickerVerses, checkedSet);
  if (!selection) {
    refs.addmError.textContent = "Check at least one verse to memorize.";
    refs.addmError.hidden = false;
    return;
  }
  addMemoryVerse(selection.reference, selection.text);
  setActiveMemorizeUser(userId);
  closeAddMModal();
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

export function goTo(book, chapter, version) {
  state.book = book;
  state.chapter = chapter;
  if (version) state.version = version;
  saveState();
  syncControls();
  loadChapter();
}

export function mountBibleReader(container) {
  buildSkeleton(container);
  syncControls();
  loadChapter();
  subscribeUsers((updated) => {
    users = updated;
  });
}

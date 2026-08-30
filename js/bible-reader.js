import { BOOKS, BIBLE_VERSIONS } from "./bible-data.js";
import { fetchChapter } from "./bible-api.js";
import { addQuestion } from "./questions-data.js";
import { buildAgeGroupSelect } from "./age-groups-data.js";

const STORAGE_KEY = "bible-reader-state";

let state = loadState();
let refs = {};
let requestId = 0;

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
    <div class="bible-controls">
      <select id="bible-version-select" class="bible-select"></select>
      <select id="bible-book-select" class="bible-select"></select>
      <select id="bible-chapter-select" class="bible-select"></select>
    </div>
    <div class="bible-nav-row">
      <button id="bible-prev-btn" class="btn btn-small">← Previous</button>
      <button id="bible-addq-btn" class="q-plus-btn" aria-label="Add a question">Q<sup>+</sup></button>
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
  `;

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
  refs.content.innerHTML = `<p class="bible-status">Loading ${state.book} ${state.chapter}…</p>`;

  try {
    const data = await fetchChapter(state.book, state.chapter, state.version);
    if (myRequest !== requestId) return; // a newer request superseded this one

    const verseHtml = data.verses
      .map((v) => `<p class="bible-verse"><sup>${v.verse}</sup> ${escapeHtml(v.text)}</p>`)
      .join("");

    refs.content.innerHTML = `
      <h3 class="bible-chapter-heading">${escapeHtml(data.reference)} — ${escapeHtml(data.translationName)}</h3>
      ${verseHtml || '<p class="bible-status">No verses returned.</p>'}
    `;
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
}

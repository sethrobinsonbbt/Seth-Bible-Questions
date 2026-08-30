import { BOOKS, BIBLE_VERSIONS } from "./bible-data.js";
import { fetchChapter } from "./bible-api.js";

const STORAGE_KEY = "bible-reader-state";

let state = loadState();
let refs = {};
let requestId = 0;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.book && saved.chapter && saved.version) return saved;
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
      <button id="bible-next-btn" class="btn btn-small">Next →</button>
    </div>
    <div id="bible-content" class="bible-content"></div>
  `;

  refs.versionSelect = container.querySelector("#bible-version-select");
  refs.bookSelect = container.querySelector("#bible-book-select");
  refs.chapterSelect = container.querySelector("#bible-chapter-select");
  refs.prevBtn = container.querySelector("#bible-prev-btn");
  refs.nextBtn = container.querySelector("#bible-next-btn");
  refs.content = container.querySelector("#bible-content");

  BIBLE_VERSIONS.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.label;
    refs.versionSelect.appendChild(opt);
  });

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
    refs.content.innerHTML = `
      <p class="bible-status bible-error">Couldn't load this chapter. Check your internet connection and try again.</p>
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

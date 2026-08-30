// Strong's number popup: opened by a long-press on a word in the Bible
// reader (see bible-reader.js). Shows the Hebrew/Greek word's meaning, and
// every place it occurs elsewhere in the KJV, in a big bordered window
// over the page — markup lives in index.html (#strongs-popup-backdrop).
import { fetchLexiconEntry, fetchOccurrences, extractCrossRefs } from "./strongs-data.js";

const OCCURRENCES_PER_PAGE = 50;

let refs = null;
let activeTab = "meaning";
let currentNumbers = []; // every Strong's number the long-pressed word maps to
let currentNumber = null; // which of currentNumbers is currently shown
let occurrencesCache = {}; // strongs number -> resolved occurrence list
let occurrencesPage = 0;
let history = []; // previously-viewed numbers, for "‹ Back" when following a cross-reference link

function el(id) {
  return document.getElementById(id);
}

function ensureRefs() {
  if (refs) return refs;
  refs = {
    backdrop: el("strongs-popup-backdrop"),
    close: el("strongs-popup-close-btn"),
    back: el("strongs-popup-back-btn"),
    number: el("strongs-popup-number"),
    lemma: el("strongs-popup-lemma"),
    multi: el("strongs-popup-multi"),
    tabs: document.querySelectorAll(".strongs-tab"),
    body: el("strongs-popup-body"),
  };
  refs.close.addEventListener("click", closeStrongsPopup);
  refs.back.addEventListener("click", goBack);
  refs.backdrop.addEventListener("click", (e) => {
    if (e.target === refs.backdrop) closeStrongsPopup();
  });
  refs.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab;
      renderTabs();
      renderBody();
    });
  });
  return refs;
}

// `numbers` is the full set of Strong's numbers the long-pressed word maps
// to (usually one; sometimes two, e.g. an untranslated article bundled
// with the noun it modifies) — the last one is shown first, since that's
// consistently the substantive word in this dataset's tagging.
export function openStrongsPopup(numbers) {
  const list = Array.isArray(numbers) ? numbers : [numbers];
  if (list.length === 0) return;
  ensureRefs();
  history = [];
  activeTab = "meaning";
  showNumber(list[list.length - 1], list);
  refs.backdrop.hidden = false;
}

export function closeStrongsPopup() {
  if (!refs) return;
  refs.backdrop.hidden = true;
}

function goBack() {
  if (history.length === 0) return;
  const prev = history.pop();
  showNumber(prev.number, prev.numbers, true);
}

function showNumber(number, numbers, skipHistory) {
  if (!skipHistory && currentNumber && currentNumber !== number) {
    history.push({ number: currentNumber, numbers: currentNumbers });
  }
  currentNumber = number;
  currentNumbers = numbers || [number];
  occurrencesPage = 0;
  refs.back.hidden = history.length === 0;
  renderMultiChips();
  renderTabs();
  renderBody();
}

function renderMultiChips() {
  if (currentNumbers.length <= 1) {
    refs.multi.hidden = true;
    refs.multi.innerHTML = "";
    return;
  }
  refs.multi.hidden = false;
  refs.multi.innerHTML =
    `<span class="chip-row-label">This word:</span>` +
    currentNumbers
      .slice()
      .reverse()
      .map((n) => `<button type="button" class="chip strongs-number-chip ${n === currentNumber ? "active" : ""}" data-number="${n}">${n}</button>`)
      .join("");
  refs.multi.querySelectorAll(".strongs-number-chip").forEach((btn) => {
    btn.addEventListener("click", () => showNumber(btn.dataset.number, currentNumbers));
  });
}

function renderTabs() {
  refs.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === activeTab));
}

async function renderBody() {
  refs.number.textContent = currentNumber;
  refs.lemma.textContent = "Loading…";
  refs.body.innerHTML = `<p class="bible-status">Loading…</p>`;

  const number = currentNumber; // guard against a stale response after the user moves on
  const entry = await fetchLexiconEntry(number).catch(() => null);
  if (number !== currentNumber) return;

  refs.lemma.textContent = entry ? entry.l : "";

  if (activeTab === "meaning") {
    renderMeaningTab(entry);
  } else {
    renderOccurrencesTab(number);
  }
}

function linkifyStrongsRefs(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML.replace(/\b([GH]\d+)\b/g, (match) => `<button type="button" class="strongs-inline-link" data-number="${match}">${match}</button>`);
}

function renderMeaningTab(entry) {
  if (!entry) {
    refs.body.innerHTML = `<p class="bible-status">No dictionary entry found for ${currentNumber}.</p>`;
    return;
  }

  const pron = [entry.x, entry.p].filter(Boolean).join(" — ");
  const crossRefs = extractCrossRefs(entry.v, currentNumber);

  refs.body.innerHTML = `
    <div class="strongs-meaning">
      ${pron ? `<p class="strongs-pron">${escapeHtml(pron)}</p>` : ""}
      ${entry.k ? `<p class="strongs-kjv-def"><strong>KJV translates as:</strong> ${escapeHtml(entry.k)}</p>` : ""}
      ${entry.d ? `<p class="strongs-def">${escapeHtml(entry.d)}</p>` : ""}
      ${entry.v ? `<p class="strongs-derivation"><strong>Derivation:</strong> ${linkifyStrongsRefs(entry.v)}</p>` : ""}
    </div>
  `;

  if (crossRefs.length > 0) {
    refs.body.querySelectorAll(".strongs-inline-link").forEach((btn) => {
      btn.addEventListener("click", () => showNumber(btn.dataset.number, [btn.dataset.number]));
    });
  }
}

async function renderOccurrencesTab(number) {
  if (!occurrencesCache[number]) {
    refs.body.innerHTML = `<p class="bible-status">Loading occurrences…</p>`;
    try {
      occurrencesCache[number] = await fetchOccurrences(number);
    } catch (err) {
      if (number !== currentNumber) return;
      refs.body.innerHTML = `<p class="bible-status bible-error">Couldn't load occurrences.</p>`;
      return;
    }
  }
  if (number !== currentNumber) return;
  renderOccurrencesPage(number);
}

function renderOccurrencesPage(number) {
  const all = occurrencesCache[number] || [];
  const totalPages = Math.max(1, Math.ceil(all.length / OCCURRENCES_PER_PAGE));
  occurrencesPage = Math.min(occurrencesPage, totalPages - 1);
  const start = occurrencesPage * OCCURRENCES_PER_PAGE;
  const pageItems = all.slice(start, start + OCCURRENCES_PER_PAGE);

  const listHtml = pageItems
    .map(
      (o) => `<li><button type="button" class="strongs-occurrence-btn" data-book="${escapeHtml(o.book)}" data-chapter="${o.chapter}" data-verse="${o.verse}">${escapeHtml(o.book)} ${o.chapter}:${o.verse}</button></li>`
    )
    .join("");

  refs.body.innerHTML = `
    <p class="strongs-occurrence-count">${all.length} occurrence${all.length === 1 ? "" : "s"} in the KJV</p>
    <ul class="strongs-occurrence-list">${listHtml || "<li>None found.</li>"}</ul>
    ${
      totalPages > 1
        ? `<div class="strongs-occurrence-pager">
            <button type="button" id="strongs-occ-prev" class="btn btn-small" ${occurrencesPage === 0 ? "disabled" : ""}>‹ Prev</button>
            <span>Page ${occurrencesPage + 1} of ${totalPages}</span>
            <button type="button" id="strongs-occ-next" class="btn btn-small" ${occurrencesPage >= totalPages - 1 ? "disabled" : ""}>Next ›</button>
          </div>`
        : ""
    }
  `;

  refs.body.querySelectorAll(".strongs-occurrence-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeStrongsPopup();
      window.dispatchEvent(
        new CustomEvent("bible:navigate", {
          detail: { book: btn.dataset.book, chapter: Number(btn.dataset.chapter), version: "kjv" },
        })
      );
    });
  });
  const prevBtn = el("strongs-occ-prev");
  const nextBtn = el("strongs-occ-next");
  if (prevBtn) prevBtn.addEventListener("click", () => { occurrencesPage--; renderOccurrencesPage(number); });
  if (nextBtn) nextBtn.addEventListener("click", () => { occurrencesPage++; renderOccurrencesPage(number); });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

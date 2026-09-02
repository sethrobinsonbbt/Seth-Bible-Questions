// The JC Notes bottom-sheet popup — shared by two independent commentary
// sources, both driven from bible-reader.js: the JC badge/chapter-reference
// link (openJcNotesPopup, jc-notes-data.js) and per-verse hyperlinks
// (openVerseCommentaryPopup, jc-verse-notes-data.js). Markup lives in
// index.html (#jc-notes-popup-backdrop), mirroring strongs-popup.js's
// lazy-refs pattern.
let refs = null;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function ensureRefs() {
  if (refs) return refs;
  refs = {
    backdrop: document.getElementById("jc-notes-popup-backdrop"),
    close: document.getElementById("jc-notes-popup-close-btn"),
    title: document.getElementById("jc-notes-popup-title"),
    body: document.getElementById("jc-notes-popup-body"),
  };
  refs.close.addEventListener("click", closeJcNotesPopup);
  refs.backdrop.addEventListener("click", (e) => {
    if (e.target === refs.backdrop) closeJcNotesPopup();
  });
  return refs;
}

// `note` is { paragraphs, verseMap } as returned by jc-notes-data.js's
// fetchJcNote — this module owns escaping/rendering it. `targetVerse`
// (optional — a verse number, as tapped from the reading text) scrolls
// straight to and highlights that verse's own paragraph, when it has one;
// omitted (or when that verse has no paragraph of its own), the popup
// just opens at the top, same as opening it from the JC badge. `onlyIndices`
// (optional — a list of paragraph indices, as tapped from a linked chapter
// reference) renders just those paragraphs instead of the whole chapter —
// used for the general remarks that aren't tied to any one verse.
export function openJcNotesPopup(title, note, targetVerse, onlyIndices) {
  ensureRefs();
  refs.title.textContent = title;
  const indices = onlyIndices || note.paragraphs.map((_, i) => i);
  const targetIndex = targetVerse != null ? note.verseMap[String(targetVerse)] : undefined;
  refs.body.innerHTML = indices
    .map((i) => `<p${i === targetIndex ? ' class="jc-notes-highlight"' : ""}>${escapeHtml(note.paragraphs[i])}</p>`)
    .join("");
  refs.backdrop.hidden = false;
  const targetPos = targetIndex != null ? indices.indexOf(targetIndex) : -1;
  const targetEl = targetPos >= 0 ? refs.body.children[targetPos] : null;
  if (targetEl) targetEl.scrollIntoView({ block: "start" });
  else refs.body.scrollTop = 0;
}

// Renders the *other* commentary source (js/jc-verse-notes-data.js) in the
// same bottom sheet: a list of independent, attributed entries for one
// verse — potentially many, from different authors and years — rather
// than the single paragraph `openJcNotesPopup` shows. `entries` is
// `[{ author, year, text }, ...]`, already combined across every group
// that covers the tapped verse (see bible-reader.js).
export function openVerseCommentaryPopup(title, entries) {
  ensureRefs();
  refs.title.textContent = title;
  refs.body.innerHTML = entries
    .map(
      (e) => `
        <div class="verse-commentary-entry">
          <p class="verse-commentary-attribution">${escapeHtml(e.author)}${e.year ? ` · ${e.year}` : ""}</p>
          <p class="verse-commentary-text">${escapeHtml(e.text).replace(/\n/g, "<br>")}</p>
        </div>
      `
    )
    .join("");
  refs.backdrop.hidden = false;
  refs.body.scrollTop = 0;
}

export function closeJcNotesPopup() {
  if (!refs) return;
  refs.backdrop.hidden = true;
}

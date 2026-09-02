// The "JC Notes" bottom-sheet popup: opened by tapping the JC Notes button
// below a chapter's reading text (see bible-reader.js). Markup lives in
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

export function closeJcNotesPopup() {
  if (!refs) return;
  refs.backdrop.hidden = true;
}

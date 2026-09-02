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

// `noteText` is the raw commentary text (paragraphs separated by "\n\n",
// as stored in data/jc-notes/) — this module owns escaping/rendering it.
export function openJcNotesPopup(title, noteText) {
  ensureRefs();
  refs.title.textContent = title;
  refs.body.innerHTML = noteText
    .split("\n\n")
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
  refs.body.scrollTop = 0;
  refs.backdrop.hidden = false;
}

export function closeJcNotesPopup() {
  if (!refs) return;
  refs.backdrop.hidden = true;
}

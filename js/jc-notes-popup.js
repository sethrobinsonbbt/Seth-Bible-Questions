// The JC Notes bottom-sheet popup — shared by two independent commentary
// sources, both driven from bible-reader.js: the JC badge (openJcNotesPopup,
// jc-notes-data.js — the whole chapter), per-verse hyperlinks
// (openVerseCommentaryPopup, jc-verse-notes-data.js), and a linked chapter
// reference (openGeneralNotesPopup — whichever source has remarks on the
// chapter as a whole rather than any one verse, from either or both
// sources). Markup lives in index.html (#jc-notes-popup-backdrop),
// mirroring strongs-popup.js's lazy-refs pattern.
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
// fetchJcNote — this module owns escaping/rendering it. Always shows every
// paragraph, top to bottom — this is only ever opened from the JC badge
// (the whole chapter); a linked chapter reference's general-only remarks
// go through openGeneralNotesPopup instead, and per-verse links through
// openVerseCommentaryPopup.
export function openJcNotesPopup(title, note) {
  ensureRefs();
  refs.title.textContent = title;
  refs.body.innerHTML = note.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  refs.backdrop.hidden = false;
  refs.body.scrollTop = 0;
}

// Shared by openVerseCommentaryPopup and openGeneralNotesPopup: a list of
// independent, attributed entries — potentially many, from different
// authors and years — from js/jc-verse-notes-data.js. `entries` is
// `[{ author, year, text }, ...]`.
function entriesHtml(entries) {
  return entries
    .map(
      (e) => `
        <div class="verse-commentary-entry">
          <p class="verse-commentary-attribution">${escapeHtml(e.author)}${e.year ? ` · ${e.year}` : ""}</p>
          <p class="verse-commentary-text">${escapeHtml(e.text).replace(/\n/g, "<br>")}</p>
        </div>
      `
    )
    .join("");
}

// Renders the *other* commentary source (js/jc-verse-notes-data.js) in the
// same bottom sheet — see entriesHtml — for one verse's combined entries
// across every group that covers it (see bible-reader.js).
export function openVerseCommentaryPopup(title, entries) {
  ensureRefs();
  refs.title.textContent = title;
  refs.body.innerHTML = entriesHtml(entries);
  refs.backdrop.hidden = false;
  refs.body.scrollTop = 0;
}

// Opened from a linked chapter reference in the heading (e.g. "2 Kings 7")
// — everything either commentary source has for the chapter as a whole,
// rather than any one verse: `paragraphs` (plain strings — jc-notes-data.js's
// unassigned paragraphs, if any) rendered first, then `entries` (attributed,
// jc-verse-notes-data.js's generalEntries, if any) below. Either can be
// empty; the chapter reference is only linked at all when at least one of
// them has something (see bible-reader.js).
export function openGeneralNotesPopup(title, paragraphs, entries) {
  ensureRefs();
  refs.title.textContent = title;
  refs.body.innerHTML = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("") + entriesHtml(entries);
  refs.backdrop.hidden = false;
  refs.body.scrollTop = 0;
}

export function closeJcNotesPopup() {
  if (!refs) return;
  refs.backdrop.hidden = true;
}

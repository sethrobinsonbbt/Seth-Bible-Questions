// "JC Notes" — daily Bible reading commentary, bundled as one static file
// per book (data/jc-notes/<Book>.json, chapter number -> commentary text),
// fetched on demand and cached, mirroring strongs-data.js's per-book
// lazy-load pattern. Source: a year's worth of daily commentary, keyed by
// (book, chapter) and deduplicated (the same chapter can come up on more
// than one day across the year's reading plan; the longest of the
// duplicates is kept) — see README.md for provenance and generation
// details.
//
// Coverage is intentionally incomplete (some chapters, and a few very
// short books, have no commentary in the source material), so a missing
// book file or chapter key isn't an error — fetchJcNote just resolves to
// null and the reader silently doesn't show a JC Notes section.
const bookNotesCache = new Map(); // book name -> parsed {chapter: text} object, or null

async function loadBookNotes(bookName) {
  if (bookNotesCache.has(bookName)) return bookNotesCache.get(bookName);
  const promise = fetch(`data/jc-notes/${encodeURIComponent(bookName)}.json`)
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  bookNotesCache.set(bookName, promise);
  return promise;
}

// Returns the commentary text for this book/chapter, or null if there
// isn't any.
export async function fetchJcNote(bookName, chapter) {
  const notes = await loadBookNotes(bookName);
  return (notes && notes[String(chapter)]) || null;
}

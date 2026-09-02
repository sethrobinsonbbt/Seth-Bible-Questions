// "JC Notes" — daily Bible reading commentary, bundled as one static file
// per book (data/jc-notes/<Book>.json), fetched on demand and cached,
// mirroring strongs-data.js's per-book lazy-load pattern. Source: a year's
// worth of daily commentary, keyed by (book, chapter) and deduplicated
// (the same chapter can come up on more than one day across the year's
// reading plan; the longest of the duplicates is kept) — see README.md
// for provenance and generation details.
//
// Each chapter entry is { paragraphs: [string, ...], verseMap: {"1": 0,
// "3": 1, ...} } — paragraphs already split apart (mostly one per "V.N –"
// / "V.N-M –" marker in the source, plus a leading intro paragraph when
// there is one), and verseMap pointing each verse number that has its own
// paragraph at that paragraph's index, so a specific verse can be linked
// straight to its commentary instead of just opening the chapter's notes
// at the top. A verse with no entry has no paragraph of its own — it
// isn't covered individually in the source material.
//
// Coverage is intentionally incomplete (some chapters, and a few very
// short books, have no commentary in the source material), so a missing
// book file or chapter key isn't an error — fetchJcNote just resolves to
// null and the reader silently doesn't show a JC Notes button/link.
const bookNotesCache = new Map(); // book name -> parsed {chapter: {paragraphs, verseMap}} object, or null

async function loadBookNotes(bookName) {
  if (bookNotesCache.has(bookName)) return bookNotesCache.get(bookName);
  const promise = fetch(`data/jc-notes/${encodeURIComponent(bookName)}.json`)
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  bookNotesCache.set(bookName, promise);
  return promise;
}

// Returns { paragraphs, verseMap } for this book/chapter, or null if
// there's no commentary for it.
export async function fetchJcNote(bookName, chapter) {
  const notes = await loadBookNotes(bookName);
  return (notes && notes[String(chapter)]) || null;
}

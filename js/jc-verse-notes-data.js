// A second, independent commentary source used only for the per-verse
// hyperlinks in the Bible reader (js/bible-reader.js) — NOT the JC badge,
// which still shows the original single-voice commentary from
// jc-notes-data.js. Bundled as one static file per book
// (data/jc-verse-notes/<Book>.json), fetched on demand and cached, same
// lazy-load pattern as jc-notes-data.js/strongs-data.js.
//
// Source: a multi-author, multi-year daily-reading-notes archive (see
// README.md for provenance) organized as one or more verse-labeled
// "groups" per chapter, each holding every dated/attributed entry written
// against that verse (or verse range) across the years. Each chapter
// entry is { groups: [{ verses: [1,2,...], entries: [{author, year, text}] }],
// generalEntries: [{author, year, text}] } — "groups" is what drives verse
// links (a verse can appear in more than one group, e.g. once alone as
// "v.1" and again as part of "v.1,2" elsewhere, so a verse's full
// commentary is every group that lists it); "generalEntries" (remarks not
// tied to any verse) isn't used here — that's covered by the JC badge's
// own chapter-reference link, from the other source.
//
// Coverage is intentionally incomplete (some chapters/books have nothing
// here — 2 John/3 John's own ambiguous scrape data was dropped rather
// than guessed at, see the preprocessing script), so a missing book file
// or chapter key isn't an error — fetchJcVerseNotes just resolves to null
// and no verse numbers get linked for that chapter.
const bookNotesCache = new Map(); // book name -> parsed {chapter: {groups, generalEntries}} object, or null

async function loadBookNotes(bookName) {
  if (bookNotesCache.has(bookName)) return bookNotesCache.get(bookName);
  const promise = fetch(`data/jc-verse-notes/${encodeURIComponent(bookName)}.json`)
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  bookNotesCache.set(bookName, promise);
  return promise;
}

// Returns { groups, generalEntries } for this book/chapter, or null if
// there's no verse-commentary data for it.
export async function fetchJcVerseNotes(bookName, chapter) {
  const notes = await loadBookNotes(bookName);
  return (notes && notes[String(chapter)]) || null;
}

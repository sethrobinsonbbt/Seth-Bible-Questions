// Strong's number data: a bundled, per-book KJV text tagged with Strong's
// numbers (data/strongs/kjv-text/<Book>.json), a combined Hebrew+Greek
// lexicon (data/strongs/lexicon.json), and a reverse "every occurrence"
// index (data/strongs/occurrences.json). All three are static files
// checked into this repo (not fetched from any third-party API), derived
// from public-domain/CC-BY-SA sources — see README.md for provenance.
//
// This is why the app only ever offers the KJV (js/bible-data.js's
// BIBLE_VERSIONS): the OSIS-tagged source text this data is built from is
// only available for the KJV, so Strong's numbers can't be offered for any
// other translation.
import { BOOKS } from "./bible-data.js";

const bookTextCache = new Map(); // book name -> parsed chapters array
let lexiconPromise = null;
let occurrencesPromise = null;

function segmentsToText(segments) {
  return segments.map((seg) => (Array.isArray(seg) ? seg[0] : seg)).join("");
}

async function loadBookText(bookName) {
  if (bookTextCache.has(bookName)) return bookTextCache.get(bookName);
  const promise = fetch(`data/strongs/kjv-text/${encodeURIComponent(bookName)}.json`).then((res) => {
    if (!res.ok) throw new Error(`No Strong's data for ${bookName}`);
    return res.json();
  });
  bookTextCache.set(bookName, promise);
  try {
    return await promise;
  } catch (err) {
    bookTextCache.delete(bookName);
    throw err;
  }
}

// Returns { reference, translationName, verses: [{verse, text, segments}] }
// — the same shape bible-api.js's fetchChapter returns, plus `segments`
// (each either a plain string, or a [text, [strongsNumbers]] pair) so the
// reader can render individual words as long-press targets.
export async function fetchStrongsChapter(bookName, chapter) {
  const chapters = await loadBookText(bookName);
  const verseSegmentsList = chapters[chapter - 1];
  if (!verseSegmentsList) throw new Error(`${bookName} has no chapter ${chapter}`);

  const verses = verseSegmentsList.map((segments, i) => ({
    verse: i + 1,
    text: segmentsToText(segments),
    segments,
  }));

  return {
    reference: `${bookName} ${chapter}`,
    translationName: "King James Version (KJV)",
    verses,
  };
}

export function loadLexicon() {
  if (!lexiconPromise) {
    lexiconPromise = fetch("data/strongs/lexicon.json").then((res) => {
      if (!res.ok) throw new Error("Couldn't load the Strong's dictionary.");
      return res.json();
    });
  }
  return lexiconPromise;
}

export async function fetchLexiconEntry(strongsNumber) {
  const lexicon = await loadLexicon();
  return lexicon[strongsNumber] || null;
}

function loadOccurrenceIndex() {
  if (!occurrencesPromise) {
    occurrencesPromise = fetch("data/strongs/occurrences.json").then((res) => {
      if (!res.ok) throw new Error("Couldn't load the occurrence index.");
      return res.json();
    });
  }
  return occurrencesPromise;
}

// Returns every [book, chapter, verse] occurrence of a Strong's number,
// resolved to this app's own book names (js/bible-data.js's BOOKS order),
// in Bible order.
export async function fetchOccurrences(strongsNumber) {
  const index = await loadOccurrenceIndex();
  const raw = index[strongsNumber] || [];
  return raw.map(([bookIdx, chapter, verse]) => ({
    book: BOOKS[bookIdx].name,
    chapter,
    verse,
  }));
}

// Strong's dictionary "derivation" (and occasionally "definition") text
// often mentions other Strong's numbers in passing (e.g. "from H24" or
// "feminine of G846") — pull those out so the popup can offer them as
// links to jump straight to that entry.
export function extractCrossRefs(text, excludeNumber) {
  if (!text) return [];
  const found = new Set();
  const matches = text.match(/\b[GH]\d+\b/g) || [];
  matches.forEach((n) => {
    if (n !== excludeNumber) found.add(n);
  });
  return Array.from(found);
}

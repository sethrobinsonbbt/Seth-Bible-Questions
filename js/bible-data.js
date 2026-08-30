// Canonical 66-book order + chapter counts (used by the reader and the
// custom reading planner to compute chapter sequences).
export const BOOKS = [
  { name: "Genesis", chapters: 50 },
  { name: "Exodus", chapters: 40 },
  { name: "Leviticus", chapters: 27 },
  { name: "Numbers", chapters: 36 },
  { name: "Deuteronomy", chapters: 34 },
  { name: "Joshua", chapters: 24 },
  { name: "Judges", chapters: 21 },
  { name: "Ruth", chapters: 4 },
  { name: "1 Samuel", chapters: 31 },
  { name: "2 Samuel", chapters: 24 },
  { name: "1 Kings", chapters: 22 },
  { name: "2 Kings", chapters: 25 },
  { name: "1 Chronicles", chapters: 29 },
  { name: "2 Chronicles", chapters: 36 },
  { name: "Ezra", chapters: 10 },
  { name: "Nehemiah", chapters: 13 },
  { name: "Esther", chapters: 10 },
  { name: "Job", chapters: 42 },
  { name: "Psalms", chapters: 150 },
  { name: "Proverbs", chapters: 31 },
  { name: "Ecclesiastes", chapters: 12 },
  { name: "Song of Solomon", chapters: 8 },
  { name: "Isaiah", chapters: 66 },
  { name: "Jeremiah", chapters: 52 },
  { name: "Lamentations", chapters: 5 },
  { name: "Ezekiel", chapters: 48 },
  { name: "Daniel", chapters: 12 },
  { name: "Hosea", chapters: 14 },
  { name: "Joel", chapters: 3 },
  { name: "Amos", chapters: 9 },
  { name: "Obadiah", chapters: 1 },
  { name: "Jonah", chapters: 4 },
  { name: "Micah", chapters: 7 },
  { name: "Nahum", chapters: 3 },
  { name: "Habakkuk", chapters: 3 },
  { name: "Zephaniah", chapters: 3 },
  { name: "Haggai", chapters: 2 },
  { name: "Zechariah", chapters: 14 },
  { name: "Malachi", chapters: 4 },
  { name: "Matthew", chapters: 28 },
  { name: "Mark", chapters: 16 },
  { name: "Luke", chapters: 24 },
  { name: "John", chapters: 21 },
  { name: "Acts", chapters: 28 },
  { name: "Romans", chapters: 16 },
  { name: "1 Corinthians", chapters: 16 },
  { name: "2 Corinthians", chapters: 13 },
  { name: "Galatians", chapters: 6 },
  { name: "Ephesians", chapters: 6 },
  { name: "Philippians", chapters: 4 },
  { name: "Colossians", chapters: 4 },
  { name: "1 Thessalonians", chapters: 5 },
  { name: "2 Thessalonians", chapters: 3 },
  { name: "1 Timothy", chapters: 6 },
  { name: "2 Timothy", chapters: 4 },
  { name: "Titus", chapters: 3 },
  { name: "Philemon", chapters: 1 },
  { name: "Hebrews", chapters: 13 },
  { name: "James", chapters: 5 },
  { name: "1 Peter", chapters: 5 },
  { name: "2 Peter", chapters: 3 },
  { name: "1 John", chapters: 5 },
  { name: "2 John", chapters: 1 },
  { name: "3 John", chapters: 1 },
  { name: "Jude", chapters: 1 },
  { name: "Revelation", chapters: 22 },
];

export function bookIndex(name) {
  return BOOKS.findIndex((b) => b.name === name);
}

// Public-domain translations, fetched with no API key via bible-api.com.
// Other modern copyrighted translations (NIV, NLT, NKJV, RSV, etc.) require
// a paid licensing/API agreement and aren't included for that reason.
export const BIBLE_VERSIONS = [
  { id: "kjv", label: "King James Version (KJV)" },
  { id: "asv", label: "American Standard Version (ASV)" },
  { id: "web", label: "World English Bible (WEB)" },
  { id: "bbe", label: "Bible in Basic English (BBE)" },
  { id: "webbe", label: "World English Bible, British Edition (WEBBE)" },
  // ESV needs your own free Crossway API key — see esv-config.js / README.md.
  // Harmless to leave enabled even without a key: selecting it just shows
  // the usual friendly "couldn't load" error instead of text.
  { id: "esv", label: "English Standard Version (ESV)" },
];

// Walk forward through the canonical book order from (startBook, startChapter)
// through (endBook, endChapter) inclusive. Returns null if the range is
// invalid (unknown book, or end comes before start).
export function computeChapterSequence(startBook, startChapter, endBook, endChapter) {
  const startIdx = bookIndex(startBook);
  const endIdx = bookIndex(endBook);
  if (startIdx === -1 || endIdx === -1) return null;

  const chapters = [];
  let bi = startIdx;
  let chapter = startChapter;

  while (true) {
    const book = BOOKS[bi];
    if (chapter < 1 || chapter > book.chapters) return null;

    chapters.push({ book: book.name, chapter });

    if (bi === endIdx && chapter === endChapter) break;

    chapter++;
    if (chapter > book.chapters) {
      bi++;
      chapter = 1;
      if (bi >= BOOKS.length) return null; // ran off the end without reaching endBook/endChapter
    }

    if (chapters.length > 1200) return null; // sanity cap (whole Bible is ~1189 chapters)
  }

  return chapters;
}

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

// Common short forms for each book, so typed-in references (the Bible
// page's "Jump to..." box) don't have to spell the whole name out.
// Deliberately doesn't cover every abbreviation scheme in existence (e.g.
// roman-numeral prefixes like "IICor") — just the handful most people
// actually type.
const BOOK_ABBREVIATIONS = {
  Genesis: ["gen", "ge", "gn"],
  Exodus: ["ex", "exo", "exod"],
  Leviticus: ["lev", "le", "lv"],
  Numbers: ["num", "nu", "nm", "nb"],
  Deuteronomy: ["deut", "dt", "de"],
  Joshua: ["josh", "jos", "jsh"],
  Judges: ["judg", "jdg", "jg", "jdgs"],
  Ruth: ["rut", "ru", "rth"],
  "1 Samuel": ["1sam", "1sa", "1s", "1sm"],
  "2 Samuel": ["2sam", "2sa", "2s", "2sm"],
  "1 Kings": ["1kgs", "1ki", "1k"],
  "2 Kings": ["2kgs", "2ki", "2k"],
  "1 Chronicles": ["1chr", "1ch", "1chron"],
  "2 Chronicles": ["2chr", "2ch", "2chron"],
  Ezra: ["ezr", "ez"],
  Nehemiah: ["neh", "ne"],
  Esther: ["esth", "est", "es"],
  Job: ["jb"],
  Psalms: ["ps", "psa", "psalm", "pslm", "psm"],
  Proverbs: ["prov", "pro", "pr", "prv"],
  Ecclesiastes: ["eccl", "eccles", "ecc", "ec"],
  "Song of Solomon": ["song", "sos", "so", "canticles", "cant", "songofsongs"],
  Isaiah: ["isa", "is"],
  Jeremiah: ["jer", "je", "jr"],
  Lamentations: ["lam", "la"],
  Ezekiel: ["ezek", "eze", "ezk"],
  Daniel: ["dan", "da", "dn"],
  Hosea: ["hos", "ho"],
  Joel: ["jl"],
  Amos: ["am"],
  Obadiah: ["obad", "ob"],
  Jonah: ["jon", "jnh"],
  Micah: ["mic", "mc"],
  Nahum: ["nah", "na"],
  Habakkuk: ["hab", "hb"],
  Zephaniah: ["zeph", "zep", "zp"],
  Haggai: ["hag", "hg"],
  Zechariah: ["zech", "zec", "zc"],
  Malachi: ["mal", "ml"],
  Matthew: ["matt", "mat", "mt"],
  Mark: ["mrk", "mk", "mr"],
  Luke: ["luk", "lk"],
  John: ["joh", "jn", "jhn"],
  Acts: ["act", "ac"],
  Romans: ["rom", "ro", "rm"],
  "1 Corinthians": ["1cor", "1co"],
  "2 Corinthians": ["2cor", "2co"],
  Galatians: ["gal", "ga"],
  Ephesians: ["eph", "ephes"],
  Philippians: ["phil", "php", "pp"],
  Colossians: ["col", "co"],
  "1 Thessalonians": ["1thess", "1thes", "1th"],
  "2 Thessalonians": ["2thess", "2thes", "2th"],
  "1 Timothy": ["1tim", "1ti"],
  "2 Timothy": ["2tim", "2ti"],
  Titus: ["tit", "ti"],
  Philemon: ["philem", "phm", "pm"],
  Hebrews: ["heb"],
  James: ["jas", "jm"],
  "1 Peter": ["1pet", "1pe", "1pt"],
  "2 Peter": ["2pet", "2pe", "2pt"],
  "1 John": ["1jn", "1jo", "1joh"],
  "2 John": ["2jn", "2jo", "2joh"],
  "3 John": ["3jn", "3jo", "3joh"],
  Jude: ["jud", "jde"],
  Revelation: ["rev", "re", "revelations", "apoc"],
};

function normalizeBookKey(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const BOOK_LOOKUP = new Map();
BOOKS.forEach((b) => BOOK_LOOKUP.set(normalizeBookKey(b.name), b.name));
Object.entries(BOOK_ABBREVIATIONS).forEach(([canonical, abbrevs]) => {
  abbrevs.forEach((a) => BOOK_LOOKUP.set(normalizeBookKey(a), canonical));
});

// Resolves a typed book name or common abbreviation (e.g. "Ex", "Exo",
// "1 Cor", "1Cor", "Song") to its canonical BOOKS name, or null if
// unrecognized. Case-insensitive and ignores spaces/periods, so "1 Cor.",
// "1Cor", and "1 corinthians" all resolve the same way.
export function resolveBookName(input) {
  if (!input) return null;
  return BOOK_LOOKUP.get(normalizeBookKey(input)) || null;
}

// Just the one, deliberately: King James Version, public domain, fetched
// for free with no API key from bible-api.com. ASV and YLT were both tried
// and dropped — ASV was too similar to KJV to be worth a second slot, and
// having both a devotional read and a very-literal one didn't add enough
// to be worth the extra choice. WEB/BBE/WEBBE were too modern/plain for
// this family's taste. Other modern copyrighted translations (NIV, NLT,
// NKJV, RSV, ESV, etc.) require either a paid licensing/API agreement or a
// browser-exposed API key tradeoff (see esv-config.js for that story) and
// aren't included for that reason. If this list ever grows past one entry
// again, the version dropdown in js/bible-reader.js reappears on its own.
export const BIBLE_VERSIONS = [{ id: "kjv", label: "King James Version (KJV)" }];

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

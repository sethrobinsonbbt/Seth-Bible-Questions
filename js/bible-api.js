// Fetches Bible text for two sources:
//   - bible-api.com for public-domain translations (no key required)
//   - Crossway's ESV API for the ESV (needs a free key — see esv-config.js)
// Both are cached in localStorage so repeat reads of the same chapter/verse
// don't hit the network again, and work offline afterward.

const BIBLE_API_BASE = "https://bible-api.com/";
const ESV_API_BASE = "https://api.esv.org/v3/passage/text/";

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function cacheSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // storage full or unavailable — fine to skip caching
  }
}

async function fetchFromBibleApi(reference, version) {
  const url = `${BIBLE_API_BASE}${encodeURIComponent(reference)}?translation=${encodeURIComponent(version)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load "${reference}" (${version}): ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  return {
    reference: data.reference,
    translationName: data.translation_name || version,
    text: (data.text || "").trim(),
    verses: (data.verses || []).map((v) => ({ verse: v.verse, text: v.text.trim() })),
  };
}

// ESV's text endpoint returns one formatted string per passage rather than
// a structured verse list, so pull verse numbers back out of the
// "[12] Verse text here" markers we asked for via include-verse-numbers.
function parseEsvVerses(text) {
  const parts = text.split(/\[(\d+)\]\s*/);
  const verses = [];
  for (let i = 1; i < parts.length; i += 2) {
    const verseNum = parseInt(parts[i], 10);
    const verseText = (parts[i + 1] || "").trim();
    if (!isNaN(verseNum) && verseText) verses.push({ verse: verseNum, text: verseText });
  }
  return verses;
}

async function fetchFromEsvApi(reference) {
  const apiKey = window.ESV_API_KEY;
  if (!apiKey || apiKey === "YOUR_ESV_API_KEY") {
    throw new Error("ESV API key not configured — see README.md.");
  }

  const params = new URLSearchParams({
    q: reference,
    "include-headings": "false",
    "include-footnotes": "false",
    "include-verse-numbers": "true",
    "include-short-copyright": "false",
    "include-passage-references": "false",
  });
  const res = await fetch(`${ESV_API_BASE}?${params}`, {
    headers: { Authorization: `Token ${apiKey}` },
  });
  if (!res.ok) throw new Error(`ESV API error for "${reference}": ${res.status}`);
  const data = await res.json();
  const text = (data.passages && data.passages[0]) || "";
  if (!text.trim()) throw new Error(`No ESV text returned for "${reference}".`);

  return {
    reference: data.canonical || reference,
    translationName: "English Standard Version (ESV)",
    text: text.trim(),
    verses: parseEsvVerses(text),
  };
}

async function fetchReference(reference, version) {
  const cacheKey = `bible-cache:${version}:${reference}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const result = version === "esv" ? await fetchFromEsvApi(reference) : await fetchFromBibleApi(reference, version);
  cacheSet(cacheKey, result);
  return result;
}

export function fetchChapter(bookName, chapter, version) {
  return fetchReference(`${bookName} ${chapter}`, version);
}

export function fetchVerseRange(reference, version) {
  return fetchReference(reference, version);
}

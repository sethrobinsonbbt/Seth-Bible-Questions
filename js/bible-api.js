// Thin wrapper around bible-api.com (no API key required; serves public-domain
// translations only). Caches responses in localStorage so repeat reads of the
// same chapter/verse don't hit the network again, and work offline afterward.

const BASE = "https://bible-api.com/";

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

async function fetchReference(reference, version) {
  const cacheKey = `bible-cache:${version}:${reference}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = `${BASE}${encodeURIComponent(reference)}?translation=${encodeURIComponent(version)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load "${reference}" (${version}): ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  const result = {
    reference: data.reference,
    translationName: data.translation_name || version,
    text: (data.text || "").trim(),
    verses: (data.verses || []).map((v) => ({ verse: v.verse, text: v.text.trim() })),
  };
  cacheSet(cacheKey, result);
  return result;
}

export function fetchChapter(bookName, chapter, version) {
  return fetchReference(`${bookName} ${chapter}`, version);
}

export function fetchVerseRange(reference, version) {
  return fetchReference(reference, version);
}

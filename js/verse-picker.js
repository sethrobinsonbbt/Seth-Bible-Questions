// Shared "pick a passage, then check off which verses to memorize" logic,
// used by the Memorize page's own "+ Add Verse" flow and the Bible page's
// M+ quick-add. Fetches a whole chapter and lets the verses be trimmed down
// (memorizing only part of a chapter), computing a clean reference label
// like "John 3:16" or "John 3:16-18,20" from whichever verses stay checked.
import { BOOKS } from "./bible-data.js";
import { fetchChapter } from "./bible-api.js";

export function bookChapterCount(bookName) {
  const book = BOOKS.find((b) => b.name === bookName);
  return book ? book.chapters : 1;
}

export function populateBookSelect(select) {
  BOOKS.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b.name;
    opt.textContent = b.name;
    select.appendChild(opt);
  });
}

export function populateChapterSelect(select, bookName) {
  const count = bookChapterCount(bookName);
  const previous = select.value;
  select.innerHTML = "";
  for (let i = 1; i <= count; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Chapter ${i}`;
    select.appendChild(opt);
  }
  select.value = previous && Number(previous) <= count ? previous : "1";
}

export async function loadChapterVerses(book, chapter) {
  const data = await fetchChapter(book, chapter, "kjv");
  return data.verses; // [{verse, text}]
}

// Collapses a set of checked verse numbers into a compact reference
// suffix, e.g. {1,2,3,5,7,8,9} -> "1-3,5,7-9". Assumes `checkedNums` is
// non-empty and sorted ascending.
function collapseRanges(checkedNums) {
  const ranges = [];
  let start = checkedNums[0];
  let prev = checkedNums[0];
  for (let i = 1; i < checkedNums.length; i++) {
    if (checkedNums[i] === prev + 1) {
      prev = checkedNums[i];
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = checkedNums[i];
    prev = checkedNums[i];
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(",");
}

// Given the full verse list for a chapter and the set of verse numbers
// still checked, returns { reference, text } — or null if nothing is
// checked. Reference omits verse numbers entirely when the whole chapter
// is selected (matches how the rest of the app cites full chapters).
export function computeVerseSelection(book, chapter, allVerses, checkedSet) {
  const selected = allVerses.filter((v) => checkedSet.has(v.verse)).sort((a, b) => a.verse - b.verse);
  if (selected.length === 0) return null;

  const text = selected.map((v) => v.text).join(" ");
  const wholeChapter = selected.length === allVerses.length;
  const suffix = wholeChapter ? "" : `:${collapseRanges(selected.map((v) => v.verse))}`;
  return { reference: `${book} ${chapter}${suffix}`, text };
}

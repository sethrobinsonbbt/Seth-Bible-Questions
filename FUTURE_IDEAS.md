# Future ideas

Not scheduled — just a running list of things worth doing later.

## Audit the rest of data/jc-notes/ for the same "swallowed second reading" bug

Found and fixed for 2 Corinthians this session: its original PDF source
extraction only recognized single-chapter day-headers (e.g. "Job 6"),
not combined-reading headers like "2 Corinthians 1 and 2" — so on any
day with two readings, the second reading's header wasn't recognized as
a new section and its content got silently glued onto the end of
whatever the first reading was that day. 2 Corinthians was missing 10
of its 13 chapters this way; each was traced by hand back to whichever
other book/chapter it had been glued onto (see git history for the
"Recover 2 Corinthians' missing chapters" commit for the full list and
method) and split back out.

This is a systemic bug in whatever tool produced `commentary_data.json`
(recoverable via `git show 87da636:commentary_data.json` — the original
raw extraction, ~1400 day-records), not something specific to
2 Corinthians — any other book that was a "second reading" alongside an
OT/Psalm chapter on some day is a candidate for the same problem, and
there's no reliable textual signature to auto-detect every instance
(a broad regex for "<full book name> <chapter>[ and/to <chapter>]"
embedded mid-paragraph catches real cases but also many false positives
— ordinary cross-references like "see comments on Luke 21" or "this
connects to Psalm 51" use the same shape). Worth a fuller, patient
pass through the ~1400 raw records checking data/jc-notes/ coverage
against each book's real chapter count (any book/chapter combination
that's unexpectedly thin or entirely missing, the way 2 Corinthians
1-2/6-13 were, is worth tracing the same way this fix did) — the
`data/jc-notes/*.json` output for a book with real gaps is a much more
reliable signal than trying to pattern-match the raw text directly.

## Two "Next" buttons after grading a question

On the Questions page, the nav row's own **Next ›** (`#random-next-btn`
in `index.html`) is always visible — it's meant for browsing ahead
without scoring. But the more-recently-added post-grade **Next ›**
(`#random-post-grade-actions` / `#random-next-after-grade-btn`, which
replaces Wrong/Correct once a classic question is graded, and the
equivalent button `appendNextButton()` adds after an interactive
question is graded) shows up *at the same time* as that nav-row Next —
so after answering, there are two "Next ›" buttons on screen at once,
which is confusing.

Idea: drop the newer post-grade Next button entirely and just let the
already-visible nav-row Next serve double duty — once a question's been
graded (`gradedCorrect !== null` in `js/questions.js`, or an interactive
question's `state.answered`), tapping the nav-row's existing Next
advances the same way `nextRandomQuestion()`/`appendNextButton()`
already do. Removes a redundant element without losing any behavior —
the "take as long as you want to review the answer before moving on"
behavior stays exactly the same, there'd just be one visible way to do
it instead of two.

Touches: `index.html` (remove `#random-post-grade-actions` and the
interactive types' appended Next buttons), `js/questions.js` (remove
`appendNextButton()`, wire the classic post-grade state into hiding/
showing nothing new — the nav-row Next is already wired to
`nextRandomQuestion`).

## Friendlier family join codes — done

New family codes are now `ADJECTIVE + NOUN + 4 digits` (e.g.
`SUNNYTIGER4823`), generated from curated word lists in `js/family.js`
(82 adjectives x 79 nouns x 4 digits from a restricted 2-9 set, ~26.5M
combinations), all uppercase with no separator so `normalizeCode()`
needed no changes at all — it already uppercases and strips
punctuation, so `sunny-tiger-4823` or `SunnyTiger4823` typed back in
still matches. Existing families keep their original ~8-random-character
code; only newly created ones get the new format.

## Automatically email the join code to whoever forgot it

Today's "Forgot your code?" flow (see README's "Multi-family support")
is a manual relay: a requester leaves their family-name guess + contact
info in the `codeRequests` Firestore collection, and the family owner
sees a matching entry in Setup and reaches out themselves — no email is
actually sent by the app. That was a deliberate choice at the time,
because this is a fully static site with no backend, and real email
sending needs one.

Idea: collect an **owner email** when a family is created (a new
required field on `family-gate.js`'s "Create a Family" form, stored on
the `families/{familyId}` doc alongside `name`/`passcode`). Then when
someone submits "Forgot your code?", automatically email that owner —
containing the requester's own submitted contact info and (ideally) the
join code or a `?family=CODE` link — instead of relying on them to
notice the request in Setup.

This *is* possible, but it means giving up the "no backend at all"
architecture this app otherwise has. Two real options, both viable:

1. **Firebase's "Trigger Email" extension + Cloud Functions.** The
   standard way to do this on Firebase: a Cloud Function (installed as
   a pre-built extension, minimal custom code) watches a Firestore
   collection and sends the email via SMTP (e.g. through SendGrid or
   another provider) whenever a doc is added. Requires upgrading the
   Firebase project from the free Spark plan to the pay-as-you-go Blaze
   plan — a credit card has to be on file, though actual usage at
   family-app volumes would very likely stay $0/month.
2. **A client-side email API (e.g. EmailJS).** Keeps everything
   static/serverless — the app calls the email service directly from
   the browser. Simpler to set up, but the service's public key/config
   ships in the client code (visible to anyone who looks), so it's more
   exposed to abuse than a server-side key, and free tiers are
   low-volume (roughly 200 emails/month on EmailJS's free plan as of
   this writing) — worth rechecking current limits when this gets built.

Either path is a meaningful step up in complexity/cost from everything
else in this app, so it's worth deciding deliberately rather than
assuming it's a small add-on. Keeping the existing manual "Code
Requests" panel in Setup as a fallback (in case an email bounces or
never arrives) is probably worth doing regardless of which path is
chosen.

## Point per-verse JC hyperlinks at a different source folder — done

User cleared the copyright question (permission confirmed) and asked to
build it out for the per-verse hyperlinks specifically, keeping the JC
badge/chapter-reference link on the original source. Built as a fully
separate pipeline rather than replacing anything: raw `.txt` files (76,
one per book mostly — Song of Solomon split per-chapter, Psalm 119
extras skipped as redundant with `Psalm.txt`, 2 John/3 John's merged,
ambiguously-numbered-chapters file resolved by content — its internal
"Chapter 1"/"Chapter 3" are those books' real chapter 1, "Chapter 2" was
dropped as an unattributable artifact) parsed into `{ groups: [{verses,
entries: [{author, year, text}]}], generalEntries }` per chapter, one
JSON file per book under `data/jc-verse-notes/`. See `js/jc-verse-notes-data.js`,
`openVerseCommentaryPopup` in `js/jc-notes-popup.js`, and
`loadVerseCommentary`/`linkChapterReference` in `js/bible-reader.js`.
A handful of source entries that were just "." or "-" (evidently
incomplete submissions) were filtered out during parsing.

## Shorten "King James Version (KJV)" to "KJV" — done

Chapter heading now just shows "KJV" (`js/bible-reader.js`'s
`loadChapter()`) instead of the full translation name.

## Move the Voice picker to Setup, and filter out novelty "voices" — done

The Voice picker now lives in 🔒 Setup's **🔊 Reading Voice** panel
instead of inline above the chapter text, and novelty/sound-effect
voice names (Bubbles, Zarvox, etc.) are filtered out. Shared logic
lives in `js/voice-picker.js`, used by both `js/bible-reader.js` and
`js/settings.js`.

## Hyperlink the chapter reference too, for commentary not tied to any verse — done

The chapter reference in the heading (e.g. "2 Kings 7") is now a link,
styled like a linked verse number, whenever that chapter's JC Notes
have at least one paragraph not covered by `verseMap` — tapping it
opens the popup showing just those paragraphs.

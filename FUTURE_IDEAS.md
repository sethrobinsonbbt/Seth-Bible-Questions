# Future ideas

Not scheduled — just a running list of things worth doing later.

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

## Friendlier family join codes

Right now `createFamily()` (in `js/family.js`) generates a family's join
code as ~8 random characters from a restricted alphabet (no `0/O/1/I/L`,
e.g. `AB3XQK9P`) — collision-checked against existing families. It's
compact but not especially memorable or easy to type/read aloud.

Idea: generate codes as **adjective (or adverb) + noun + 3 digits**, e.g.
`SunnyTiger482` or `QuietRiver019`. Easier to remember, say over the
phone, and type on a phone keyboard, while still landing in a large
enough space to avoid collisions for realistic numbers of families
(a few hundred adjectives x a few hundred nouns x 1000 gives tens of
millions of combinations).

Notes for whoever picks this up:
- Keep the existing collision-check-and-retry loop in `createFamily()`
  (in `js/family.js`) — just swap out the generator.
- Curate reasonably short, easy-to-spell word lists (avoid anything easy
  to mishear or that could combine awkwardly).
- Decide on casing/separators (e.g. `SunnyTiger482` vs `sunny-tiger-482`)
  — matters for how it looks on the "Family Code" panel and in the
  `?family=CODE` join link.
- `normalizeCode()` in `js/family.js` currently uppercases and matches
  against the random-alphabet format; it'll need to handle whatever
  casing/format the new scheme uses instead.
- Existing families already have codes in the old format — this only
  needs to affect *newly created* families, not require migrating
  existing ones.

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

## Move the Voice picker to Setup, and filter out novelty "voices"

The **Voice** dropdown (`#bible-voice-row` in `js/bible-reader.js`,
populated by `refreshVoiceUI()`) currently lives inline above the
chapter text, right next to **🔊 Listen**. Move it into 🔒 Setup
instead — a one-time "pick your reading voice" preference doesn't need
to take up space on every chapter view; it already persists across
chapters/sessions via `localStorage` (`VOICE_KEY` /
`bible-questions-voice-uri`), so Setup just needs its own small panel
with the same `<select>`, wired to the same `getSelectedVoice`/
`saveVoiceURI` functions (may be worth exporting them from
bible-reader.js, or moving the voice-picking logic into its own small
module both files import — similar to how `question-type-editor.js`
got split out).

Separately: some devices' voice lists include novelty/sound-effect
entries that don't actually speak words — e.g. "Bubbles", "Bells" (this
is a known thing on Apple platforms in particular — Siri/iOS ships
several joke voices like "Albert", "Bad News", "Bahh", "Boing",
"Bubbles", "Cellos", "Good News", "Jester", "Organ", "Trinoids",
"Whisper", "Wobble", "Zarvox" — the exact list has changed across OS
versions). The Web Speech API gives no programmatic way to detect
"this is a novelty voice" — no flag for it — so this needs a curated
name-based exclusion list in `getEnglishVoices()` (in
`js/bible-reader.js`), filtering out any voice whose name matches a
known novelty entry. Worth checking what the user's own phone actually
lists before finalizing the exclusion list, since it may not match the
classic Apple set exactly (Android/Chrome voices are named
differently).

## Point JC Notes at a different source folder

User-provided link:
https://drive.google.com/drive/folders/1QgBHviIVrpLQAgyl_NLpcd_pKDZKRK6M?usp=share_link
— wants this used as the source for JC Notes (the verse/chapter
commentary hyperlinks) instead of the current one.

Not yet investigated. Important: the *last* time a Google Drive folder
link was handed over for this feature, it turned out to be the exact
same "Comments on the Daily Readings" PDFs already extracted and
bundled as `data/jc-notes/` — not new content at all. So the first
step here has to be actually listing this folder's contents and
comparing them against what's already integrated (the
`mcp__Google_Drive__search_files` / `read_file_content` tools worked
fine for this last time — see the session history) — confirm it's
genuinely different/better material before doing any rebuild work.
If it does turn out to be different, the existing pipeline (raw
extraction -> dedupe by (book, chapter), keep the longest duplicate ->
clean_text() strips PDF-extraction artifacts -> split into paragraphs
on "V.N -" markers -> verseMap built from each paragraph's own leading
marker -> one JSON file per book under `data/jc-notes/`) is a
reasonable template to reuse or adapt, but the source's actual
structure (verse-organized? chapter-organized? some other format
entirely?) needs to be inspected first, same as the note on the
original connection-details doc said.

## Shorten "King James Version (KJV)" to "KJV"

The chapter heading in `js/bible-reader.js`'s `loadChapter()` currently
reads e.g. "Genesis 1 — King James Version (KJV)" (`data.reference` +
`data.translationName`, where `translationName` is
`"King James Version (KJV)"` from `strongs-data.js`'s
`fetchStrongsChapter` / the `bible-api.js` fallback). Since this app
only ever offers the one translation (see README's Bible section), the
long name doesn't need to keep announcing itself in full on every
chapter — just display `"KJV"` in the heading. Simplest: shorten it at
the display site in `loadChapter()` rather than changing what
`translationName` itself contains everywhere (other code may still
want the full name, e.g. if a second translation is ever added later).

## Hyperlink the chapter reference too, for commentary not tied to any verse

Following on from the per-verse JC Notes links: some chapters' JC Notes
have a leading paragraph (or others) that aren't about any specific
verse — general remarks on the chapter as a whole (e.g. Genesis 1's
"Genesis 1 to 4 constitute the foundation of all Scriptural
revelation..." intro paragraph, before the "V.1 –" one starts). Right
now those are only reachable by opening the whole chapter's notes from
the JC badge.

Idea: when a chapter has JC Notes AND at least one paragraph isn't
covered by any entry in `note.verseMap` (i.e. its index never appears
as a `verseMap` value), make the chapter reference text itself (e.g.
"2 Kings 7", in the `<h3 class="bible-chapter-heading">` built in
`loadChapter()`) a link too — styled the same teal/underlined way as a
linked verse number. Tapping it would open the JC Notes popup showing
*only* those unassigned paragraphs (not the full chapter), the same
way tapping a verse number scrolls to just its own paragraph.

Touches:
- `js/bible-reader.js` — compute the "has unassigned paragraphs" check
  in `loadJcNotes()` (paragraph indices 0..paragraphs.length-1 minus
  the set of values in `verseMap`), and link the reference text in the
  heading when that set is non-empty.
- `js/jc-notes-popup.js`'s `openJcNotesPopup()` — needs a way to render
  only a subset of paragraphs (by index list) instead of always the
  full array; the verse-number-tap path keeps showing everything with
  one paragraph highlighted, same as today.

# Bible Questions

A tiny family Bible app with five sections, reached from the ☰ menu (tap
the icon at the top-left). A **User** dropdown in the header (next to 🌓)
picks the active family member — set it once and it's remembered on that
device, driving whose score gets tracked wherever progress applies
(Questions, Memorize).

- **Bible** — the default landing page: opens straight to today's first
  Reading Plan passage. Read the King James Version, any book and
  chapter, with Previous/Next navigation, a "Jump to…" reference box,
  and a text-to-speech "Listen" button. When the chapter on screen is
  part of today's reading, a footer offers **✓ Mark as Read**, **Next
  Chapter**, and **Next Reading** (jumps to the day's next passage).
  **Press and hold any word** to look up its underlying Hebrew/Greek
  Strong's number — meaning, and every other place that word occurs in
  the KJV (see below).
- **Reading Plan** — the daily plan (see below) plus custom reading
  plans between any two chapters (e.g. all of Judges, or 1 Samuel
  through 2 Kings for "the kings of Israel"), with a checklist to track
  progress, plus a start/streak/missed-days system for the daily plan.
- **Questions** — a quiz card that cycles alphabetically through
  whichever family members are toggled on in a **Questions for:** chip
  row (everyone, by default). Picks new (never-asked) questions first for
  whoever's turn it is, then weights toward ones that person gets wrong
  more often — without ever fully hiding the ones they know well, and
  never repeating anything from their last 10 questions shown. A
  **Show Answer** button reveals the answer and swaps itself, in the same
  spot, for ✅ Correct / ❌ Wrong; each question shows its own right/asked
  tally (e.g. `12/18`) top-right of the card, next to a passcode-gated
  **✏️** button for quick fixes, once it's been asked at least once.
  Adding/deleting questions still lives in Setup.
- **Memorize** — a bank of King James verses, filed into three per-person
  buckets (Memorizing — a brain icon / Future — a calendar
  / Complete — a lightbulb with a checkmark; pick one per verse
  from a compact icon-only dropdown), and further filterable by any
  custom categories you make in Setup. A small
  mastery dot per verse (gray until practiced, then green-to-red by how
  well recent attempts went) and two practice modes chosen via a tab:
  **Fill in the Blank** (choose a difficulty — Easy/Medium/Hard/Blanks
  Only blank out roughly 25/50/75/100% of the verse's words;
  type the first letter of each blanked word, peek at the full verse any
  time via a toggle, and an **IDK** button or 3 wrong attempts auto-fills
  the current word and moves on) and **Flashcards** (verse-or-reference,
  flip, self-grade Fail/Hard/Good/Easy). Either mode records a 0–1 score
  per attempt (last 5 attempts averaged) and, once you finish a verse,
  offers **Next Verse →** — same new-first/weighted-toward-poor-scores
  logic as Questions. Tracks whoever's picked in the header's **User**
  dropdown.
- **🔒 Setup** — set off by a divider at the bottom of the ☰ menu, since
  it's an admin area rather than something a family member needs
  day-to-day. Passcode-gated (see below). A landing page links to four
  subpages: **👪 Family Members** (add/edit/delete, age groups, and
  per-person stats with a Reset Stats button), **📚 Question Library**
  (add/edit/delete questions, reassign age group via a multi-select
  filter, and bulk import/export as a spreadsheet-friendly CSV — Excel/
  Sheets copy-paste works directly, with a downloadable template),
  **✍️ Memory Verses** (create/rename/delete categories, file verses
  into them, and the same CSV bulk import/export), and **ℹ️ About** (its
  own passcode re-entry — what accounts/services this site runs on).

Everything syncs live across every phone and computer that has the site
open, using a free Firebase project. It's a static site — installable on
an iPhone via Safari's "Add to Home Screen" (opens full-screen, no browser
chrome) and installable as an app from Chrome on desktop/Android too.

## Getting Started

One-time project setup — not to be confused with the in-app **🔒 Setup**
section described below, which is for day-to-day family/question
management. You only need to do the steps on this page once.

### 1. Create a free Firebase project

1. Go to https://console.firebase.google.com and click **Add project**.
   Name it anything (e.g. "bible-questions"). You can skip Google
   Analytics.
2. In the left sidebar, click **Build → Firestore Database → Create
   database**. Choose a location close to you, and start in
   **production mode** (we'll set custom rules below).
3. In the left sidebar, click **Build → Authentication → Get started**.
   Under the **Sign-in method** tab, enable **Anonymous**. This lets the
   app quietly authenticate each device without any login screen, so the
   database isn't wide open to strangers on the internet.
4. Click the gear icon → **Project settings**. Under "Your apps", click
   the **</>** (web) icon to register a new web app (any nickname is
   fine, no need for Firebase Hosting). Copy the `firebaseConfig` object
   it shows you.
5. Paste those values into `firebase-config.js` in this repo, replacing
   the placeholders.

### 2. Lock down Firestore rules

Every family's data lives under its own `families/{familyId}` document (see
**Multi-family support** below) — a family's code *is* its familyId, so
knowing the code is what grants access to that family's data, nothing more
fine-grained than that. In the Firebase console, go to **Firestore Database
→ Rules** and paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /families/{familyId}/{document=**} {
      allow read, write: if request.auth != null;
    }
    match /codeRequests/{requestId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

`codeRequests` is a small, deliberately separate top-level collection for
the "forgot your code?" flow (see **Multi-family support** below) — a
requester who's lost their code has no `families/{familyId}` to write
under, so these live outside the per-family tree. Any signed-in device can
read the whole thing, same soft-security tradeoff as everything else here
— what's stored is just a family-name guess plus a contact, not anything
sensitive.

Click **Publish**. This means only devices that have opened the app (and
silently signed in anonymously) can read or write data, and only within
whichever family's subtree they're pointed at — a stray script poking at
your project can't spray junk data into some collection name you never
created, and one family's data isn't reachable at all without that
family's code.

**If you're upgrading a site that had data from before family codes
existed:** keep the *old* rules in place (see git history, or ask) until
you've run **Setup → ⚠️ One-Time Migration → Migrate Old Data** to copy
that data into a family — only then paste the rules above and publish.
Once published, the old top-level collections stop being reachable by the
app (they're simply orphaned, not deleted — you can clean them up from the
Firebase console whenever, or leave them).

**How much protection is this really?** Anonymous auth means *anyone* who
has (or guesses) a family's code becomes an authorized reader/writer of
that family's data the moment the page runs — same as a Google Doc's
"anyone with the link" sharing, not a real per-person login. That's a real
gap, not just theoretical, even though guessing an 8-character random code
is astronomically unlikely. It costs nothing (see "How much is this going
to cost me?" below) but it's worth understanding what it does and doesn't
protect against:

- **What it stops:** someone finding your `firebase-config.js` values and
  hitting your Firestore directly from a *different* app or script (they
  can't skip auth), and one family's code doesn't expose any other
  family's data.
- **What it doesn't stop:** someone who has a specific family's code —
  they get the same access as that family's own devices. Don't share a
  family's code outside that family.

Two ways to raise the bar further, in rough order of effort:

- **Keep the URL unlisted.** Don't link it anywhere public, don't submit it
  to search engines. This repo already ships a `robots.txt` and a `noindex`
  meta tag asking well-behaved crawlers not to index it — that's obscurity,
  not security, but combined with an unlisted/custom URL it makes
  "stumbling across it" genuinely unlikely rather than just hoped-for.
- **Firebase App Check.** Free, and stops scripted/automated abuse of your
  Firestore API directly (bots hitting the API without ever loading your
  page), by requiring a token proving the request came from your actual
  registered site (via reCAPTCHA v3). It does *not* stop a human who
  actually opens the real page with a valid family code, so it doesn't
  fully close the gap above — see
  [Firebase App Check docs](https://firebase.google.com/docs/app-check) if
  you want to set it up.

Real per-person access control (individual logins instead of "anyone with
this family's code is authorized") would mean real Firebase Auth accounts
per person plus rules that check `request.auth.uid` against a family
membership lookup — a bigger change, but one that layers on top of this
same data structure rather than requiring another rewrite. Ask if you'd
like to go that route.

Note each family's own **Setup passcode** (chosen when the family is
created — see below) is a separate, much weaker layer on top of this —
it's a plain string stored on that family's own document and checked in
the browser (`js/settings.js`), not real access control. Anyone with dev
tools open and that family's code can read it straight out of Firestore.
It's there to keep a curious kid from poking around Setup, not to protect
anything you actually need to keep private.

### Multi-family support

This app supports more than one family sharing the same deployment and
Firebase project, fully isolated from each other:

- **First visit, any device:** a full-screen gate (`js/family-gate.js`)
  asks to either **Create a Family** (pick a name and a Setup passcode —
  this generates a random ~8-character family code) or **Join a Family**
  (enter an existing code, or open a link like
  `https://yourdomain.com/?family=AB3XQK9P` which fills the code in
  automatically). The code is stored on that device (`localStorage`) so
  this only happens once per device.
- Every family's data — family members, questions, memory verses, reading
  plans, everything — lives under `families/{familyId}/...` in the same
  Firestore project (see `js/family.js`), completely separate from every
  other family's.
- The family's **name** shows (read-only) at the top of **Setup**, along
  with the family's own **code** and a **📋 Copy Join Link** button (copies
  a link that auto-fills the code for whoever opens it) — this is the only
  place to find the code again after creating a family, so it's worth a
  glance if you're about to add someone new. There's also a **Switch
  Family** button further down Setup for moving a device to a different
  family's code (you'll need a code to get back in).
- There's no cross-family anything — no shared question bank, no way to
  see another family exists. The starter question banks
  (`js/question-bank-data.js`, `js/family-question-bank.js`) are bundled
  content every family can import from Setup, not Firestore data, so they
  aren't affected by any of this.
- **Forgot your code?** On the Join tab, a device without the code can
  leave a note — the family's name plus their own email or phone — via a
  small link below the Join button. There's no automated emailing or
  texting (this is a static site, no server to send anything from): the
  note just shows up as a **📨 Code Requests** panel in Setup for whoever
  set up that family, matched by name (a casual match, not exact — a
  family with a common name might see a request meant for someone else's
  "The Smiths," and just ignore it). The family owner reaches out and
  sends the code themselves, then dismisses the request.

### 3. Host the site

The simplest option is GitHub Pages, since the code already lives in this
repo:

1. On GitHub, go to the repo's **Settings → Pages**.
2. Under "Build and deployment", set **Source** to "Deploy from a
   branch", pick this branch, and folder `/ (root)`.
3. Save. GitHub will give you a URL like
   `https://<username>.github.io/<repo>/` within a minute or two.

**Custom domain:** this repo's `CNAME` file already points GitHub Pages
at **christadelphian.family**. GitHub can't finish wiring that up on its
own, though — it needs a DNS change made at wherever the domain was
registered (Namecheap, GoDaddy, Google Domains, etc.), since the domain
itself isn't hosted here:

1. In that registrar's DNS settings for `christadelphian.family`, add
   four **A** records (all for the root/apex domain, i.e. no `www` or
   other prefix) pointing to:
   ```
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```
   (Optional, for IPv6: four **AAAA** records to `2606:50c0:8000::153`,
   `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.)
2. Back on GitHub's **Settings → Pages**, the custom domain field should
   pick up `christadelphian.family` from the `CNAME` file automatically;
   once GitHub can see the DNS change (can take anywhere from a few
   minutes to a few hours), a green checkmark appears there and an
   **Enforce HTTPS** checkbox becomes available — turn that on so the
   site's certificate covers the new domain.
3. If you'd like `www.christadelphian.family` to work too, add a
   **CNAME** record for the `www` subdomain pointing to
   `<username>.github.io` at the same registrar.

A nicer URL doesn't change any of the privacy considerations described
above — it's still just a friendlier name pointing at the same
Firestore-backed site, protected the same way (anonymous-only auth,
`noindex`/`robots.txt`, no public listing).

### 4. Install it on your phone / Chrome

- **iPhone (Safari):** open the site's URL, tap the Share icon, then
  **Add to Home Screen**. It'll behave like a normal app icon.
- **Chrome (desktop or Android):** open the site, click the install icon
  in the address bar (or Menu → "Install Bible Questions…").

### 5. (Optional, currently not enabled) Add the ESV translation

The code for this exists (`js/bible-api.js`) but ESV is left out of the
version list in `js/bible-data.js` for now — the family decided the
key-exposure tradeoff below wasn't worth it. To turn it back on, add
`{ id: "esv", label: "English Standard Version (ESV)" }` back into
`BIBLE_VERSIONS`, then:

1. Go to https://api.esv.org and sign in / create a free account.
2. Under your account's **API Applications**, create a new application
   (any name) and copy the API key it gives you.
3. Paste it into `esv-config.js` in this repo, replacing the
   `YOUR_ESV_API_KEY` placeholder.

**Read this before you do:** unlike the Firebase config, this key is not
designed to be public — it's a plain bearer token, and since this is a
static site with no server, it has to be sent straight from the
browser, where anyone who opens dev tools (or looks at the file in this
repo) can read and reuse it. For a free, non-commercial key with no
payment method attached, the realistic worst case is someone else using
up your daily request quota, not a bill — but it's a real tradeoff, not
a secret the way Firebase's config is. If you'd rather keep the key off
the browser entirely, that needs a small server-side proxy (e.g. a
Firebase Cloud Function); ask Claude if you want to go that route
instead.

## Using the app

Tap 🌓 in the header to cycle the color theme: **Auto** (follows your
device's system setting), **Dark**, then **Light**. Your choice is
remembered on that device.

The **User** dropdown in the header picks the active family member for the
whole app — it drives whose score gets tracked on Questions and Memorize
alike, replacing separate per-page pickers. It's remembered on that
device, so it doesn't need to be reselected every visit.

### Questions

- No need to pick who you are up top first — a **Questions for:**
  chip row above the card lists every family member, and any combination
  can be toggled on at once (the first time you open the page it starts
  with whichever person is picked in the header's **User** dropdown, if
  any, otherwise everyone; after that, your toggle choices are
  remembered). With more than one person toggled on, the card **cycles
  through them alphabetically by name**, one question per turn — the
  label at the top (e.g. "**Alice's question**") always says whose turn
  it is. Each person's turn only draws from their own age group(s); it's
  a straightforward rotation, not a blended pool.
- For whoever's turn it is: new (never-asked) questions for them come up
  first; once everything's been tried at least once, questions they tend
  to get wrong come up more often (never exclusively — everything stays
  in the pool), and nothing repeats within their last 10 questions shown.
  Tap **Show Answer** to reveal the answer (and the cited verse's text,
  if the question has a reference — silently skipped if it can't be
  fetched) — it's replaced, in the same spot, by **✅ Correct** /
  **❌ Wrong**. Tapping one scores it immediately but doesn't move on by
  itself — it's replaced, again in the same spot, by a plain **Next ›**,
  so you can take as long as you want looking over the answer before
  moving to the next person's turn (**‹ Back** / the nav row's own
  **Next ›** browse the history of turns already taken, without
  scoring). Once a question's been asked at least
  once, its right/asked tally (e.g. `12/18`) shows top-right of the card,
  so you can see at a glance how shaky it is — scores are tracked per
  person, so two kids sharing an age group don't share a score (overall
  totals and review flags live in Setup, not on this card).
- **✏️** (top-right of the card, next to the right/asked tally) lets you
  fix a question right from here, gated behind the same Setup passcode as
  the Question Library (see **Setup**) — the same full editor as the
  Library's, so a Multiple Choice/Put in Order/Select All question's
  choices/items/options (and its type) are editable too, not just text
  and reference. Handy for a quick fix mid-quiz without leaving the page.
- **Multiple Choice / Put in Order / Select All That Apply** questions
  (set up in the Question Library — see **Setup**) skip the Show
  Answer step entirely: tap a choice, tap the items back into order, or
  check the correct options and hit Submit, and it's graded right there —
  right/wrong feedback shows immediately, with its own **Next ›** button
  to move on whenever you're ready, same as the classic flow. The same
  for every family member regardless of whose turn it is.

### 🔒 Setup

Enter this family's Setup passcode (chosen when the family was created —
see **Multi-family support** above) to unlock the landing page, which
shows the family's name plus links to four subpages, a Backup panel, and
a Switch Family action:

- **👪 Family Members** — **+ Add Member** to name someone and check
  which age group(s) they belong to (a person can be in more than
  one — e.g. a 10-year-old could also be checked into 11–15 if they're
  ready for harder questions). Each member's row also shows their stats
  (📖 Questions ✅/❌, ✍️ Memorize ✅/attempts, 📅 Reading Plan streak and
  completed/missed count — all per-person) with **Edit**, **Reset
  Stats** (clears that one person's Questions, Memorize, *and* Reading
  Plan progress — everyone else's stays put), and **Delete**.
- **📚 Question Library** — no separate lock (getting this far already
  means the Setup passcode was entered): **🔎 Filter** is a multi-select
  dropdown next to the import/export buttons — check any combination of
  age groups and/or **Unassigned** to narrow the list, or leave it all
  unchecked for everything; **🔍 Search questions…** by text or answer
  combines with it. Every row gets an age-group dropdown to reassign it,
  **Edit**, **Delete**, and (once it has a score) **Reset Score** (clears
  *everyone's* progress on that one question — for one person's overall
  stats, use Family Members' Reset Stats instead). **+ Add Question**
  needs the question text and a required answer (an optional reference,
  e.g. "Genesis 1:3", and an age-group assignment or leave it
  **Unassigned**). Editing an existing question still allows a blank
  answer, since some imported questions (e.g. "Name some of the Ten
  Commandments") are intentionally open-ended. **⬇️ Export** downloads
  a `.csv` (opens directly in Excel/Sheets); **⬆️ Import** accepts a
  `.csv` upload *or* pasting cells copied straight out of Excel/Sheets
  (also still accepts an old JSON export) — **⬇️ Download template**
  in the Import dialog gives you a starter file with the right columns.
  Import shows a preview before anything is added (now properly
  scrollable if it runs long): the exported CSV's first column is an
  **id** — a row whose id still matches a question here updates that
  exact question in place (text, answer, reference, type, everything),
  *even if you changed the wording* — so renaming a question is a normal
  edit, not something that creates a duplicate or orphans the old one.
  Clear the id (or leave it blank on a freshly-typed row) to add a
  brand-new question instead. Rows with no id, or an id that no longer
  matches anything, fall back to matching by the question's text
  (tolerating the odd curly-quote/whitespace change Excel/Sheets tend to
  introduce on a round-trip) — this is what makes an old export (from
  before the id column existed) or a hand-typed row still work sensibly.
  The whole point is that exporting your questions, editing them
  (renames included), and re-importing is a safe way to bulk-edit, not
  something that doubles everything up or loses everyone's progress on a
  question you just wanted to reword.
  - **Question types** — the **Type** dropdown on Add/Edit switches
    between four kinds. **Classic** is the original type an answer,
    self-graded Right/Wrong. **Multiple Choice** shows a few choices and
    you mark which is correct; family members tap one and it's graded
    instantly. **Put in Order** is a list already in the correct order
    (e.g. the books of the Torah, the months, the twelve tribes) — it's
    shown shuffled and family members tap the items back into sequence,
    which also makes it the natural fit for things like the Ten
    Commandments or the Beatitudes that don't have a clean multiple-choice
    answer. **Select All That Apply** shows a set of options with one or
    more correct, checked off then submitted at once (e.g. "which of
    these are among the Ten Commandments?"). All three are always
    tap-driven and self-grading in the quiz (no Show Answer step) — only
    Classic keeps the type-an-answer, Show Answer, self-graded flow. In
    the CSV, set `type` to
    `multiple-choice`, `order`, or `select-all` (leave it blank for
    Classic), and fill in the matching columns with `|`-separated values:
    `choices` + `correctChoice` (the exact text of the right one) for
    Multiple Choice, `items` (already in the correct order) for Put in
    Order, and `options` + `correctOptions` (one or more, `|`-separated)
    for Select All. **⬇️ Download template** includes one worked example
    of each type.
- **✍️ Memory Verses** — **Categories**: **+ Add Category** to name a
  group (e.g. "Salvation", "Peace"); **Rename** or **Delete** any of them
  (deleting a category un-categorizes its verses rather than deleting
  the verses themselves). **All Verses**: every memory verse with a
  dropdown to file it under a category (or leave it **Uncategorized**),
  plus its own CSV **⬇️ Export** / **⬆️ Import** (with template) for
  bulk-adding verses the same way as the Question Library above (matched
  to a category by name; an unrecognized or missing category name comes
  in Uncategorized). Adding verses one at a time still happens from the
  Memorize page (see below) — this subpage is for organizing what's
  already there and bulk import/export.
- **ℹ️ About** — opens its own passcode prompt (re-entered every time,
  like the Question Library's edit lock) before showing what this site
  actually runs on: the GitHub account hosting it, the Firebase project
  behind the family data, and the Porkbun account/domains/renewal dates.
  This is real account information, not just admin controls, so it's
  worth remembering the passcode note above applies here too — anyone
  reading this repo's source on GitHub, or a browser's dev tools, can
  see it regardless of the passcode.
- **Backup**: **⬇️ Export All Data** downloads every collection (family
  members, questions, memory verses, verse categories, reading plans,
  and all reading progress) as one JSON file — a manual safety net
  alongside Firebase's own backups.

Changes sync instantly to everyone else with the app open.

### Bible

This is the app's landing page — the very first thing it opens to (once
per app load) is today's first Reading Plan passage, so there's always
something to read right away. From there, type a reference into the
**Jump to…** box and tap **Go** to jump straight there — common
abbreviations work too (e.g. "Ex 3:14", "1Cor 13", "Ps 23", "Rev. 22",
not just "Exodus 3:14") — or pick a book and chapter from the dropdowns
and use the **‹ / ›** buttons either side of them to move chapter by
chapter. Everything is deliberately kept to two compact rows (the search
box, then book/chapter/navigation together) so there's more room left
for the text itself, especially on a phone. Chapters you've read are
cached on your device, so they still load without a connection.

Whenever the chapter on screen is part of a tracked daily reading (either
because you just landed here, or you tapped **Read** on one from the
Reading Plan page), a footer appears below the text:

- **✓ Mark as Read** checks off that reading in the Reading Plan's
  streak tracking, without leaving the page (requires a User picked up
  top, same as checking it off from the Reading Plan page itself).
- **Next Chapter →** moves forward one chapter (same as the ← Previous /
  Next → row above, just handy without scrolling back up).
- **Next Reading →** jumps straight to the day's next passage (hidden
  once you're on the day's third/last one).

The **Q⁺**, **M⁺**, and (when this chapter has one) **JC** badges (see
below) float at the top-right of the chapter text and stay put as you
scroll, so they're always reachable.

Just one translation is offered: the **King James Version**, public
domain. Its text is bundled with the app itself (see **Strong's
numbers** below) rather than fetched from an API, so chapters load
instantly and work fully offline once you've opened them; a free,
no-API-key fetch from [bible-api.com](https://bible-api.com) is kept
only as a fallback should the bundled data ever fail to load. A few
other translations were tried and dropped: ASV is public domain too,
but close enough to KJV (same textual family and register) that it
didn't earn a second slot; YLT (aggressively word-for-word literal)
wasn't different enough to be worth having alongside a devotional read
either; WEB, BBE, and WEBBE were too modern/plain for this family's
taste. ESV support exists in the code but isn't enabled — see "Add the
ESV translation" above. Other modern translations (NIV, NLT, NKJV, RSV,
etc.) are copyrighted with no free API we know of, so they aren't
included. (With only one version, the version dropdown stays hidden —
it reappears automatically if `BIBLE_VERSIONS` ever grows past one
entry. Note that a second translation could only ever be a fallback
display option — the Strong's number feature below is tied to the KJV
specifically, since that's the only translation this kind of
word-by-word tagging exists for.)

**Strong's numbers:** press and hold any word in the reading text to
look up the original Hebrew or Greek word behind it. A window opens
(tap the ✕, or tap outside it, to close) with two tabs:

- **Meaning** — the original word, its transliteration/pronunciation,
  how the KJV translators rendered it elsewhere, its full definition,
  and a "Derivation" line explaining where the word comes from —
  any other Strong's numbers mentioned there (e.g. "from H24") are
  themselves tappable, so you can follow a word's roots a few links
  deep; **‹ Back** returns to wherever you followed a link from. If
  the word you pressed is a compound of more than one original-language
  word (common in the Old Testament, where several English words often
  render a single Hebrew word, or the reverse), a small row of chips
  above the tabs lets you switch between them.
- **Occurrences** — every other place that exact Hebrew/Greek word
  appears in the KJV, 50 at a time with **‹ Prev** / **Next ›** paging,
  each one showing the actual verse text (centered, with the matching
  word highlighted) rather than just a bare reference. Tap one to
  preview that verse full-size in the same window; a **Jump to
  Reference →** button at the bottom is what actually takes you
  there (closing the popup) — so glancing at a cross-reference doesn't
  cost you your place in the chapter you were reading unless you choose
  to leave it. **‹ Back** returns to the occurrence list instead.

This data is bundled with the app rather than fetched live: the KJV
text tagged word-by-word with Strong's numbers comes from
[scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases)
(MIT-licensed, derived from the public-domain 1769 KJV), and the
Hebrew/Greek dictionary definitions come from
[openscriptures/strongs](https://github.com/openscriptures/strongs)
(CC BY-SA, itself derived from James Strong's public-domain 1890/1894
concordance). The tagged text lives in `data/strongs/kjv-text/` (one
file per book, fetched — and then cached — only for books you actually
open), and the dictionary/occurrence-index files live directly in
`data/strongs/`.

The little **Q⁺** badge is a quick way to jot down a question inspired by
whatever you're currently reading, without needing the Setup passcode.
Same fields as Setup's question form
(question text, required answer, optional reference — pre-filled with
the current book/chapter — and age-group assignment); it adds straight
into the shared question pool.

Next to it, the amber **M⁺** badge quick-adds a memory verse straight
from whatever chapter you have open — pick a **From verse** / **To
verse** range (so you can memorize just part of a passage) and **Add
Verse**. It tracks progress under whoever's picked in the header's
**User** dropdown (it'll ask you to pick someone there first if no one's
selected yet). It shares the exact same verse-picker as Memorize's own
**+ Add Verse** (see below).

Below those, a small teal **JC** badge appears when this chapter has
commentary — pulled from a year's worth of daily Bible reading notes.
Tapping it opens the commentary in a popup over the bottom half of the
screen (tap outside it, or the ✕, to close), scrolled to the top. Not
every chapter has one (the source material simply didn't cover every
chapter), in which case the badge just isn't there — no "no notes for
this chapter" placeholder.

Individual verse numbers are tappable too, in whichever color the JC
badge uses, wherever the commentary discusses that verse specifically
(most of the source material is itself organized this way — "V.1 –
...", "V.26-28 – ..." per paragraph): tapping one jumps straight to and
highlights that paragraph in the popup instead of opening at the top.
A verse number stays plain, non-interactive text when nothing in the
commentary calls it out on its own.

Like Strong's numbers, this is bundled data (`data/jc-notes/`, one
file per book, fetched — and cached — only for books you open) rather
than anything fetched live. The source was a year's daily commentary
in which the same chapter can come up more than once (different
reading passes through the same book); where that happened, the
longest of the versions was kept, then split into paragraphs and
matched back to the verse(s) each one covers.

Tap **🔊 Listen** above the chapter text to have the device read the
chapter aloud, one verse at a time (using your browser's built-in
text-to-speech — no API key, works offline); tap it again (now **⏹
Stop**) to stop. It automatically stops when you navigate to another
chapter. Which voice reads it is picked in 🔒 Setup's **🔊 Reading
Voice** panel — a dropdown of your device's English voices (novelty/
sound-effect voices like "Bubbles" or "Zarvox", which some platforms
ship alongside real ones and which don't actually speak words, are
filtered out by name) appears there whenever more than one is
available; it may take a moment to show up on first load, since most
browsers finish loading their voice list asynchronously rather than
having it ready immediately (the app watches for that and reveals the
dropdown as soon as it's actually available). The default pick favors
a higher-quality network voice over a device's flat built-in one where
available; your choice is remembered and used everywhere Listen plays.
**Press and hold** the Listen button to speed up — the longer you
hold, the faster it goes, ramping 2× → 3× → 4×; release to drop back
to normal speed. If the chapter is part of today's reading plan, letting it play through to
the end automatically marks that reading done and moves on to the day's
next reading, hands-free — until the day's last reading finishes, when
it stops.

Listening tries to keep going even if your phone's screen locks — while
active it asks to keep the screen awake (the most common reason speech
gets cut off) and, on browsers that support it, plays a silent
background track so the OS treats it like real media playback. Neither
can override manually pressing the power button, and this is
noticeably less reliable on iOS Safari than on Android Chrome — a real
platform limitation, not something we can fully fix from a web app.

### Reading Plan

- **Daily Reading** (top of the section): the classic "Bible Companion"
  plan — two Old Testament passages plus one New Testament passage per
  calendar day, repeating every year (see `js/default-reading-plan.js`).
  Opens to today by default; use **‹ / ›** to step a day at a time,
  **Jump to Today** to snap back, or tap the date itself to pop up
  month/day dropdowns and jump straight to any date. Each of the day's
  three readings has its own rounded checkmark toggle (synced across
  devices) and a **Read** button that jumps straight to it in the
  **Bible** section. **✓ Mark All Complete** at the bottom checks off all
  three readings for the date you're viewing in one tap. Checking
  anything off (here or in a custom plan below) requires someone picked
  in the header's **User** dropdown first — reading progress, streaks,
  and stats are all tracked per-person (same as Questions and Memorize),
  so without a User picked the checkbox just reverts and asks you to
  pick who you are.
- **▶ Start Plan** begins tracking your streak on the Daily Reading plan
  from today: once started, a small stats block shows your **Current
  Streak** (consecutive days completed, counting back from today — it
  doesn't reset just because today isn't finished yet) plus running
  **Completed** vs. **Missed** totals (a day counts as missed once it's
  passed without all three readings checked off). Missed days collapse
  into a **Catch up on N missed days** list — tap **Catch Up** next to
  any of them to jump straight to that date and check off what you
  finish, or check off several at once and tap **✓ Mark Selected Done**
  to bulk-catch-up without visiting each day individually (also requires
  a User picked). **Reset Streak** clears the start date (your daily
  checkmarks themselves are never deleted).
- **Custom reading plans** (below that): a subtle **Change Plan** link —
  intentionally low-key, since most people set this up once and rarely
  touch it again — opens a dedicated page listing every custom plan
  you've made, each with **Use This Plan** (makes it the one shown on
  the main Reading Plan page) and **Delete**, plus **+ New Plan** to
  create another: name it and pick a start book/chapter and an end
  book/chapter (inclusive). The plan can span multiple books, in Bible
  order — e.g. start at Judges 1, end at Judges 21 for the whole book;
  or start at 1 Samuel 1, end at 2 Kings 25 to read through all the
  kings.
- Whichever plan is active shows its checklist right on the main page,
  below the **Change Plan** link. Check off chapters as you go (also
  requires a User picked) — progress syncs across devices. Tap **Read**
  on any chapter to jump straight to it in the **Bible** section.
  **Delete Plan** removes it for everyone.

### Memorize

Attempts get tracked under whoever's picked in the **User** dropdown in
the header — this is optional; practicing without picking anyone just
won't record a score.

The home view: a **Memorizing / Future / Complete**
tab row along the top — three per-person buckets a verse can be filed
under (see the per-verse picker below), defaulting to Memorizing so
every newly-added verse (and anything added before buckets existed)
starts in the main working set — a brain icon for Memorizing (actively
working on it), a calendar for Future, a lightbulb with a
checkmark for Complete (got it). Below that, category chips —
skipped entirely until you make at
least one custom category in Setup — a **✍️ Fill in the Blank** /
**🗂️ Flashcards** tab that picks which mode
a verse launches into, a **▶ Play** button, and the verse list itself.
Each verse's row shows a small mastery dot (top-right — gray until
you've practiced it at all, then colored green-to-red by how well recent
attempts have gone) and, just to its left, an icon-only dropdown showing
that verse's current bucket — tap it to refile the verse into a
different one (there's no delete from here; verses only move between
buckets). Tap anywhere else on a verse's card to practice just that one;
tap **▶ Play** instead to start a session that runs through the current
bucket/category view (new-first / weighted-toward-poor-scores — same
picking logic as Questions and "Next Verse" below) without having to tap
into each verse individually. Tap a bucket tab or category chip to
filter the list down to it (both narrow the list together, and
**▶ Play** respects whatever's currently selected).

**+ Add Verse** opens a picker: choose a book and chapter (the King
James text loads automatically), then narrow **From verse** / **To
verse** down from the whole chapter if you only want part of a passage
memorized (e.g. just verses 16–17) — a live preview shows the exact text
that range covers before you save, and a **Category** dropdown files it
under one of Setup's categories right away (or leave it
**Uncategorized**). The saved reference reflects the range (e.g.
`John 3:16-17`, or just `John 3` if the whole chapter stays selected).
The Bible page's **M⁺** badge (see above) opens the same picker
pre-filled to whatever chapter you're reading.

**✍️ Fill in the Blank**: tapping a verse first asks you to **choose your
challenge** — Easy (~25% of words blanked), Medium (~50%), Hard (~75%),
or Blanks Only (100%, no words given at all) — showing the full verse
text so you know what you're about to attempt. **Start Game** drops into
the verse with the harder/rarer words blanked out first as the
percentage climbs. Type the first letter of each blanked word: get it
right and the whole word fills in, moving you to the next blank; get it
wrong and a momentary ✗ flashes so you can try again — after 3 wrong
attempts on the same word it's auto-filled for you and practice moves on
(no permanent penalty, just unstuck). A **🤷 IDK** button does the same
thing on demand for whatever word you're stuck on, and a **👁️ Show Full
Verse** toggle lets you peek at the whole verse at any point while
practicing (it's not shown once you've finished, since every word is
already filled in on the card by then). Finishing the verse without ever
needing help records a perfect ✅; finishing after some auto-filled words
still counts as done, just not first-try-perfect (that's what feeds the
★ rating above).

**🗂️ Flashcards**: shows either the verse text or just the reference —
your choice, via the **Start with: Verse / Reference** toggle at the
bottom, remembered for next time. Tap **🔄 Flip** to reveal the other
side, then grade yourself honestly: **Fail** / **Hard** / **Good** /
**Easy**. Only **Fail** counts against you — Hard/Good/Easy all count as
a successful recall (just at varying confidence), matching how real
spaced-repetition flashcard apps grade.

Either mode scores the attempt from 0 to 1 (Fill in the Blank: the
fraction of words gotten right without help; Flashcards: Fail/Hard/Good/
Easy map to 0/0.33/0.67/1) and keeps a rolling window of your last 5
attempts per verse — that recency-weighted average is what "Next Verse"
below uses to spot a verse you're currently struggling with, even if you
aced it the first few times. After finishing a verse, **Next Verse →**
jumps straight into another one from the same bucket/category view —
never-practiced verses first, then weighted toward ones scored poorly
recently, never repeating anything from the last 10 verses practiced (a
"Back to Verse Library" button is always there too, if you'd rather
stop).

## Adding another person, or another age group

Adding a person is just **+ Add Member** in Setup — no code changes
needed. Age groups, on the other hand, are a fixed list in code (since
they double as the assignment target for every question). To add or
rename one, edit the `AGE_GROUPS` array in `js/age-groups-data.js`:

```js
export const AGE_GROUPS = [
  { id: "2-3", label: "2–3 years" },
  { id: "4-6", label: "4–6 years" },
  { id: "7-10", label: "7–10 years" },
  { id: "11-15", label: "11–15 years" },
  { id: "adult", label: "Adult" },
];
```

Commit and push — the new group shows up everywhere (member checkboxes,
question assignment dropdown) automatically. Don't remove an id that's
already in use, or those questions/memberships will silently stop
matching anything.

## Files

- `index.html` — page shell (links all the stylesheets below).
- `css/base.css` — shared theme tokens, header/menu chrome, and generic
  components (buttons, modals, cards, chips, forms) reused across two or
  more sections.
- `css/questions.css`, `css/bible.css`, `css/planner.css`,
  `css/memorize.css`, `css/settings.css` — one stylesheet per section,
  holding only the styles specific to it. Splitting it this way (instead
  of one large `style.css`) keeps a change to one section's look from
  requiring a read through everyone else's.
- `js/main.js` — top-level section navigation and app bootstrapping.
- `js/firebase.js` — shared Firebase init (anonymous auth + Firestore).
- `js/users.js` — shared "family members" Firestore collection (state +
  CRUD), used by Questions, Memorize, and Setup.
- `js/active-user.js` — the single "who's using this" selection shown at
  the top of every page (see main.js), shared by Questions, Memorize, and
  the Bible page's M⁺ button.
- `js/age-groups-data.js` — the fixed list of age groups.
- `js/questions-data.js` — shared "questions" Firestore collection (state
  + CRUD), used by both the quiz view and Setup. Each question has a
  `type` (classic/multiple-choice/order/select-all) plus whichever
  type-specific fields go with it — see the doc comment at the top of the
  file.
- `js/questions.js` — the kid-facing Questions quiz view (read-only,
  aside from the passcode-gated quick-edit modal). Classic questions use
  the type-an-answer/Show Answer/self-graded flow; the other three types
  render a tap-driven, self-grading UI into `#random-interactive` instead
  (multiple-choice buttons, order-tap chips, select-all checkboxes +
  Submit).
- `js/question-type-editor.js` — the question type selector + type-
  specific fields editor (choices/items/options, and which are correct),
  shared by the Question Library's Add/Edit forms (`js/settings.js`) and
  the Questions page's mid-quiz quick-edit modal (`js/questions.js`).
- `js/question-bank-data.js` / `js/family-question-bank.js` — the two
  bundled question banks. Their one-time Setup import buttons have been
  removed now that both are imported; these files stay in the repo,
  unused, in case a bulk-import feature is wanted again later.
- `js/family.js` — the multi-family data model: family id storage,
  create/join, the per-family `scopedCollection()` helper every other
  data module uses, the family's name/passcode, and the "forgot your
  code?" request/dismiss functions.
- `js/family-gate.js` — the one-time "Create a Family" / "Join a Family"
  screen shown before the app mounts on a device with no family picked
  yet, plus its "Forgot your code?" mini-form.
- `js/settings.js` — the passcode-gated Setup landing page (Family Code,
  the 🔊 Reading Voice panel, Code Requests, Backup) and its four
  subpages (Family Members + stats/reset, Question Library, Memory
  Verses categories, About), each with bulk CSV import/export (Excel/
  Sheets-friendly, with a downloadable template; also still accepts a
  pasted JSON array) where noted above.
- `js/bible-data.js` — the 66-book/chapter-count table, the list of
  available translations, and `resolveBookName` (common abbreviations —
  "Ex", "1Cor", "Ps", etc. — to canonical book name) used by the Bible
  page's "Jump to..." search.
- `js/bible-api.js` — fetches chapter/verse text from bible-api.com, with
  localStorage caching. Kept only as an automatic fallback for the Bible
  reading section now that the KJV text is bundled (see `strongs-data.js`
  below) — still the live source for the Memorize/M⁺ verse picker.
- `js/strongs-data.js` — loads the bundled Strong's-tagged KJV text
  (`data/strongs/kjv-text/*.json`, one file per book), the combined
  Hebrew/Greek dictionary (`data/strongs/lexicon.json`), and the
  "every occurrence" reverse index (`data/strongs/occurrences.json`) —
  see the Bible section above for licensing/provenance.
- `js/strongs-popup.js` — the long-press word-lookup popup (Meaning /
  Occurrences tabs, cross-reference links, verse preview + jump).
- `js/jc-notes-data.js` — loads the bundled JC Notes commentary
  (`data/jc-notes/*.json`, one file per book; each chapter is
  `{ paragraphs, verseMap }`, with `verseMap` pointing individual verse
  numbers at their own paragraph) — see the Bible section above for how
  it's sourced/deduplicated.
- `js/jc-notes-popup.js` — the bottom-sheet popup that shows a chapter's
  JC Notes: opened from the JC badge (whole chapter), from a linked verse
  number (scrolls to and highlights that verse's paragraph), or from a
  linked chapter reference in the heading (shows just the paragraph(s)
  not tied to any verse — general remarks on the chapter as a whole).
- `js/voice-picker.js` — the shared "reading voice" logic (English-only,
  novelty/sound-effect voices filtered by name, saved pick, heuristic
  best-voice fallback) used by both the Bible reader's Listen feature and
  Setup's Voice panel, so they agree on the same pick.
- `js/bible-reader.js` — the Bible reading section. The chapter heading's
  reference text (e.g. "2 Kings 7") becomes a link, same styling as a
  linked verse number, whenever that chapter's JC Notes have at least one
  paragraph not covered by `verseMap`.
- `js/planner.js` — the Reading Plan section (daily reading card + custom reading plans).
- `js/default-reading-plan.js` — the 365-day default reading plan data
  and its passage-label parser (used to jump to a reading in the Bible
  section).
- `js/daily-plan-data.js` — tracks whether the Daily Reading plan has
  been "started" and computes completed/missed-day stats since then.
- `js/memorize.js` — the verse memorization section (per-user
  Memorizing/Future/Memorized buckets, custom categories, mode tabs,
  verse list with a mastery dot, Fill in the Blank, Flashcards, and the
  shared "Next Verse" picker both modes use).
- `js/memorize-data.js` — shared "memoryVerses" and "verseCategories"
  Firestore collections (state + CRUD + per-user progress reset, a
  rolling last-5-attempt-score window per verse, and per-user bucket
  assignment), used by Memorize, the Bible page's M⁺ button, and Setup.
- `js/verse-picker.js` — the shared book/chapter/From-verse/To-verse
  picker logic (fetch a chapter, collapse a verse range into a reference
  like "John 3:16-18") used by both Memorize's + Add Verse and the Bible
  page's M⁺ button.
- `data/strongs/` — the bundled Strong's data described above (a few MB;
  fetched lazily per-book/on first use, not all at once).
- `firebase-config.js` — your project's Firebase config (fill this in).
- `esv-config.js` — your (optional) free ESV API key (fill this in).
- `CNAME` — the custom domain GitHub Pages serves the site on.
- `manifest.json` / `service-worker.js` / `icons/` — makes it installable
  as a PWA and lets the app shell (plus, once opened, the KJV text
  itself) load instantly and offline after the first visit. Live data
  (questions, plans, verses, progress) still needs a connection, since
  that comes from Firestore, not the app shell.

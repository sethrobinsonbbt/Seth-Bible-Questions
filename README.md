# Bible Questions

A tiny family Bible app with five sections, reached from the ☰ menu (tap
the icon at the top-left):

- **Reading Plan** — the default landing page. The daily plan (see
  below) plus custom reading plans between any two chapters (e.g. all
  of Judges, or 1 Samuel through 2 Kings for "the kings of Israel"),
  with a checklist to track progress.
- **Questions** — one tab per family member, each showing a random-question
  quiz card (with answer reveal, and ✅ Correct / ❌ Wrong buttons that track
  a score and automatically resurface missed questions). Read-only and
  kid-safe — no editing controls live here.
- **Bible** — read the KJV, WEB, BBE, or WEBBE translation, any book and
  chapter, with Previous/Next chapter navigation.
- **Memorize** — a bank of King James verses with two practice modes:
  guess the reference from the verse (multiple choice or type-in), and
  fill in the first letter of each word given the reference, with 5
  difficulty levels from mostly-filled-in to completely blank. A "Who's
  memorizing?" picker tracks each person's own attempts/correct count.
- **🔒 Setup** — set off by a divider at the bottom of the ☰ menu, since
  it's an admin area rather than something a family member needs
  day-to-day. Passcode-gated (see below). This is where you add
  family members (each assigned to one or more age groups), and where all
  question authoring lives: add/edit/delete questions, assign them to an
  age group (2–3, 4–6, 7–10, 11–15, Adult), and the two bulk-import
  buttons. A family member's Questions tab shows the union of every age
  group they belong to.

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

In the Firebase console, go to **Firestore Database → Rules** and paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{id}              { allow read, write: if request.auth != null; }
    match /questions/{id}          { allow read, write: if request.auth != null; }
    match /memoryVerses/{id}       { allow read, write: if request.auth != null; }
    match /readingPlans/{id}       { allow read, write: if request.auth != null; }
    match /dailyReadingProgress/{id} { allow read, write: if request.auth != null; }
    match /appState/{id}           { allow read, write: if request.auth != null; }
  }
}
```

Click **Publish**. This means only devices that have opened the app (and
silently signed in anonymously) can read or write the app's data — and,
compared to a blanket `match /{document=**}`, only within these six known
collections, so a stray script poking at your project can't spray junk
data into some new collection name you never created. Add a line here if
you ever add a new Firestore collection.

**How much protection is this really?** Anonymous auth means *anyone* who
loads the page — not just your family — becomes an authorized reader/writer
the moment the page runs. That's a real gap, not just theoretical, even
though a stranger stumbling onto a family Bible-trivia URL is unlikely. It
costs nothing (see "How much is this going to cost me?" below) but it's
worth understanding what it does and doesn't protect against:

- **What it stops:** someone finding your `firebase-config.js` values and
  hitting your Firestore directly from a *different* app or script without
  ever loading your page (they can't skip auth, and now can't touch
  collections outside the six above either).
- **What it doesn't stop:** someone who actually opens your site's URL —
  they get anonymous auth automatically, same as your family does, and can
  read or write anything in those six collections.

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
  actually opens the real page, so it doesn't fully close the anonymous-auth
  gap above — see [Firebase App Check docs](https://firebase.google.com/docs/app-check)
  if you want to set it up.

Real per-family access control (a login instead of "anyone who opens the
page is authorized") would mean adding a Cloud Function that checks a
shared passcode server-side and issues a custom auth token — a bigger
change (requires enabling the pay-as-you-go Blaze plan to deploy a
function, though usage would still cost $0) that's out of scope unless you
want to take this from "hobby family app" to "actually gated." Ask if
you'd like to go that route.

Note the **Setup** section's "1967" passcode is a separate, much
weaker layer on top of this — it's a plain string checked in the browser
(`js/settings.js`), not real access control. Anyone who opens the
browser's dev tools can read it straight out of the page. It's there to
keep a curious kid from poking around, not to protect sensitive data —
don't rely on it for anything you actually need to keep private. Change
it by editing the `PASSWORD` constant near the top of `js/settings.js`.

### 3. Host the site

The simplest option is GitHub Pages, since the code already lives in this
repo:

1. On GitHub, go to the repo's **Settings → Pages**.
2. Under "Build and deployment", set **Source** to "Deploy from a
   branch", pick this branch, and folder `/ (root)`.
3. Save. GitHub will give you a URL like
   `https://<username>.github.io/<repo>/` within a minute or two.

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

### Questions

- Tap a family member's tab. The big card at the top shows a random
  question from any age group they belong to — tap **👁️ Show Answer** to
  reveal the answer, then **✅ Correct** or **❌ Wrong** to score it and
  move to the next one (or **🎲 Skip** to move on without scoring).
- Missed questions (❌) are marked **🔁 needs review** and get
  preferentially resurfaced until answered correctly — scores are tracked
  per person, so two kids sharing an age group don't share a score.
- Below the card is a plain list of that person's questions with their
  running score. There's no editing here by design — see **Setup**.

### 🔒 Setup

- Enter the passcode (default `1967`, see the security note above) to
  unlock **Family Members** and **All Questions** management.
- **Family Members**: **+ Add Member** to name someone and check which
  age group(s) they belong to (a person can be in more than one — e.g. a
  10-year-old could also be checked into 11–15 if they're ready for
  harder questions). Edit or delete anyone here.
- **All Questions**: filter by age group (or **Library (unassigned)** /
  **All questions**) and/or type into **🔍 Search questions…** to filter
  by question text or answer — the two combine. Each row has an
  age-group dropdown to (re)assign it, **Edit**, **Delete**, and (once
  it has a score) **Reset Score** (clears everyone's progress on that
  question).
- **+ Add Question** opens a form for the question text, a required
  answer, an optional reference (e.g. "Genesis 1:3"), and which age
  group to assign it to (or leave it in the **Library** if undecided).
  Editing an existing question still allows a blank answer, since some
  imported questions (e.g. "Name some of the Ten Commandments") are
  intentionally open-ended.
- **📥 Import Our Family's Questions** adds the fact-checked family list
  (see `js/family-question-bank.js`) into the Library, with answers.
  **📥 Import Question Bank** adds a starter set of ~100 general Bible
  trivia questions (see `js/question-bank-data.js`). Both skip anything
  whose text already matches a question you have, so they're safe to
  click more than once.
- Changes sync instantly to everyone else with the app open.
- **Family Stats**: a per-person rollup of Questions (✅/❌) and Memorize
  (✅ correct / attempts) scores, plus one family-wide line for the
  Daily Reading Plan's current streak and completed/missed count
  (reading progress isn't tracked per person — it's one shared family
  log).
- **Backup**: **⬇️ Export All Data** downloads every collection (family
  members, questions, memory verses, reading plans, and all reading
  progress) as one JSON file — a manual safety net alongside Firebase's
  own backups.

### Bible

Type a reference into the **Jump to…** box (e.g. "John 3:16" or
"Genesis 5") and tap **Go** to jump straight there, or pick a book and
chapter from the dropdowns, or use ← Previous / Next → to move chapter
by chapter. Chapters you've read are cached on your device, so they
still load without a connection.

Just one translation is offered: the **King James Version**, public
domain, fetched for free with no API key from
[bible-api.com](https://bible-api.com). A few others were tried and
dropped: ASV is public domain too, but close enough to KJV (same
textual family and register) that it didn't earn a second slot; YLT
(aggressively word-for-word literal) wasn't different enough to be
worth having alongside a devotional read either; WEB, BBE, and WEBBE
were too modern/plain for this family's taste. ESV support exists in
the code but isn't enabled — see "Add the ESV translation" above.
Other modern translations (NIV, NLT, NKJV, RSV, etc.) are copyrighted
with no free API we know of, so they aren't included — you're welcome
to add one yourself in `js/bible-data.js` (`BIBLE_VERSIONS`) and
`js/bible-api.js` if you get access to such an API. (With only one
version, the version dropdown stays hidden — it reappears automatically
if `BIBLE_VERSIONS` ever grows past one entry.)

The little **Q⁺** badge between Previous and Next is a quick way to jot
down a question inspired by whatever you're currently reading, without
needing the Setup passcode. Same fields as Setup's question form
(question text, required answer, optional reference — pre-filled with
the current book/chapter — and age-group assignment); it adds straight
into the shared question pool.

Next to it, the amber **M⁺** badge quick-adds a memory verse straight
from whatever chapter you have open — pick who's memorizing it, uncheck
any verses you don't want (so you can memorize just part of a passage),
and **Add Selected**. It shares the exact same verse-picker as Memorize's
own **+ Add Verse** (see below).

Tap **🔊 Listen** above the chapter text to have the device read the
whole chapter aloud (using your browser's built-in text-to-speech — no
API key, works offline); tap it again (now **⏹ Stop**) to stop. It
automatically stops when you navigate to another chapter.

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
  three readings for the date you're viewing in one tap.
- **▶ Start Plan** begins tracking your streak on the Daily Reading plan
  from today: once started, a small stats block shows your **Current
  Streak** (consecutive days completed, counting back from today — it
  doesn't reset just because today isn't finished yet) plus running
  **Completed** vs. **Missed** totals (a day counts as missed once it's
  passed without all three readings checked off). Missed days collapse
  into a **Catch up on N missed days** list — tap **Catch Up** next to
  any of them to jump straight to that date and check off what you
  finish, or check off several at once and tap **✓ Mark Selected Done**
  to bulk-catch-up without visiting each day individually. **Reset
  Streak** clears the start date (your daily checkmarks themselves are
  never deleted).
- **Custom Reading Plans** (below that): **+ New Plan** lets you name a
  plan and pick a start book/chapter and an end book/chapter (inclusive).
  The plan can span multiple books, in Bible order — e.g. start at
  Judges 1, end at Judges 21 for the whole book; or start at 1 Samuel 1,
  end at 2 Kings 25 to read through all the kings.
- Tap a plan's tab to see its checklist. Check off chapters as you go —
  progress syncs across devices. Tap **Read** on any chapter to jump
  straight to it in the **Bible** section.
- **Delete Plan** removes it for everyone.

### Memorize

- Pick **Who's memorizing?** at the top (family members are managed in
  Setup) so attempts get tracked under the right person — this is
  optional; practicing without picking anyone just won't record a score.
- **+ Add Verse** opens a picker: choose a book and chapter (the King
  James text loads automatically), then uncheck any verses you don't
  want — handy for memorizing just part of a passage (e.g. only verses
  16–17 of a chapter). **Select All / Select None** speed up picking.
  The saved reference is computed from whatever's still checked (e.g.
  `John 3:16-18,20` for a non-contiguous pick, or just `John 3` if the
  whole chapter stays checked). The Bible page's **M⁺** badge (see
  above) opens the same picker pre-filled to whatever chapter you're
  reading.
- **🔤 Guess the Reference**: shown the verse text, pick the right
  reference. Toggle **Multiple Choice** (easier) or **Type the
  Reference** (harder — must match the reference format, e.g. "John
  3:16").
- **✍️ Fill in the Blanks**: shown the reference, type the first letter
  of each missing word from memory. The **Difficulty** dropdown controls
  how many words are already filled in for you:
  - **Beginner/Easy**: most short, common words (and, the, of, unto...)
    are filled in — only the more distinctive words need a letter.
  - **Medium/Hard**: fewer words filled in.
  - **Expert**: every word is blank — pure recall.
  - After checking, **Show Full Verse** reveals the whole text.
- Both practice modes prioritize verses missed last time (marked
  **🔁 needs review** in the list) the same way Questions does, so
  practice naturally circles back to the ones that need it.

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

- `index.html` / `style.css` — page shell and all styling.
- `js/main.js` — top-level section navigation and app bootstrapping.
- `js/firebase.js` — shared Firebase init (anonymous auth + Firestore).
- `js/users.js` — shared "family members" Firestore collection (state +
  CRUD), used by Questions, Memorize, and Setup.
- `js/age-groups-data.js` — the fixed list of age groups.
- `js/questions-data.js` — shared "questions" Firestore collection (state
  + CRUD + bulk import), used by both the quiz view and Setup.
- `js/questions.js` — the kid-facing Questions quiz view (read-only).
- `js/question-bank-data.js` / `js/family-question-bank.js` — the two
  bundled question banks importable from Setup.
- `js/settings.js` — the passcode-gated Setup section (member +
  question administration).
- `js/bible-data.js` — the 66-book/chapter-count table and the list of
  available translations.
- `js/bible-api.js` — fetches chapter/verse text from bible-api.com, with
  localStorage caching.
- `js/bible-reader.js` — the Bible reading section.
- `js/planner.js` — the Reading Plan section (daily reading card + custom reading plans).
- `js/default-reading-plan.js` — the 365-day default reading plan data
  and its passage-label parser (used to jump to a reading in the Bible
  section).
- `js/daily-plan-data.js` — tracks whether the Daily Reading plan has
  been "started" and computes completed/missed-day stats since then.
- `js/memorize.js` — the verse memorization section.
- `js/memorize-data.js` — shared "memoryVerses" Firestore collection
  (state + CRUD) and the "who's memorizing" active-user preference,
  used by both Memorize and the Bible page's M⁺ button.
- `js/verse-picker.js` — the shared book/chapter/verse-checkbox picker
  logic (fetch a chapter, collapse checked verses into a reference like
  "John 3:16-18,20") used by both Memorize's + Add Verse and the Bible
  page's M⁺ button.
- `firebase-config.js` — your project's Firebase config (fill this in).
- `esv-config.js` — your (optional) free ESV API key (fill this in).
- `manifest.json` / `service-worker.js` / `icons/` — makes it installable
  as a PWA and lets the app shell load instantly (and offline) after the
  first visit. Data itself (questions, Bible text, plans, verses) still
  requires an internet connection the first time it's fetched.

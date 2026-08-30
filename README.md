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
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Click **Publish**. This means only devices that have opened the app (and
silently signed in anonymously) can read or write any of the app's data
(questions, family members, reading plans, memory verses).

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

## Using the app

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
  **All questions**). Each row has an age-group dropdown to (re)assign
  it, **Edit**, **Delete**, and (once it has a score) **Reset Score**
  (clears everyone's progress on that question).
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

### Bible

Pick a translation, book, and chapter from the dropdowns, or use ←
Previous / Next → to move chapter by chapter. Chapters you've read are
cached on your device, so they still load without a connection.

Only public-domain translations are included (KJV, WEB, BBE, WEBBE),
fetched for free with no API key from
[bible-api.com](https://bible-api.com). Modern translations like NIV or
ESV are copyrighted and require a paid licensing/API agreement, so they
aren't included — you're welcome to add one yourself in
`js/bible-data.js` (`BIBLE_VERSIONS`) if you get access to such an API.

The little **Q⁺** badge between Previous and Next is a quick way to jot
down a question inspired by whatever you're currently reading, without
needing the Setup passcode. Same fields as Setup's question form
(question text, required answer, optional reference — pre-filled with
the current book/chapter — and age-group assignment); it adds straight
into the shared question pool.

### Reading Plan

- **Daily Reading** (top of the section): the classic "Bible Companion"
  plan — two Old Testament passages plus one New Testament passage per
  calendar day, repeating every year (see `js/default-reading-plan.js`).
  Opens to today by default; use **‹ / ›** to step a day at a time,
  **Jump to Today** to snap back, or tap the date itself to pop up
  month/day dropdowns and jump straight to any date. Each of the day's
  three readings has its own checkbox (synced across devices) and a
  **Read** button that jumps straight to it in the **Bible** section.
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
- Add a verse by typing its reference (e.g. `John 3:16` or
  `Psalm 23:1-3`) — the King James text is looked up automatically.
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
- `js/memorize.js` — the verse memorization section.
- `firebase-config.js` — your project's Firebase config (fill this in).
- `manifest.json` / `service-worker.js` / `icons/` — makes it installable
  as a PWA and lets the app shell load instantly (and offline) after the
  first visit. Data itself (questions, Bible text, plans, verses) still
  requires an internet connection the first time it's fetched.

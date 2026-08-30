# Bible Questions

A tiny family Bible app with four sections, tabbed across the top:

- **Questions** — tabs for **Asher**, **Ollie**, and **Parents**, plus a
  shared **Library** of questions that aren't assigned to anyone yet. Add,
  edit, delete, and reassign questions from any tab, or import a starter
  bank of ~100 Bible trivia questions with one click.
- **Bible** — read the KJV, WEB, BBE, or WEBBE translation, any book and
  chapter, with Previous/Next chapter navigation.
- **Planner** — build a custom reading plan between any two chapters (e.g.
  all of Judges, or 1 Samuel through 2 Kings for "the kings of Israel"),
  and check off chapters as you read them.
- **Memorize** — a bank of King James verses with two practice modes:
  guess the reference from the verse (multiple choice or type-in), and
  fill in the first letter of each word given the reference, with 5
  difficulty levels from mostly-filled-in to completely blank.

Everything syncs live across every phone and computer that has the site
open, using a free Firebase project. It's a static site — installable on
an iPhone via Safari's "Add to Home Screen" (opens full-screen, no browser
chrome) and installable as an app from Chrome on desktop/Android too.

## Setup

You only need to do this once.

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
(questions, reading plans, memory verses).

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

- Tap a tab (**Asher**, **Ollie**, **Parents**, **Library**) to switch
  who you're asking.
- On a person's tab, the big card at the top shows a random question for
  them — tap **🎲 Another question** to get a different one. Below that
  is the full list assigned to them.
- **+ Add Question** opens a form to type a new question and choose who
  it's for (or leave it in the **Library** if you haven't decided yet).
- Every question row has a dropdown to reassign it (e.g. move it from
  Library to Ollie, or from Asher over to Parents), plus **Edit** and
  **Delete** buttons.
- On the **Library** tab, **📥 Import Question Bank** adds a starter set
  of ~100 Bible trivia questions (see `js/question-bank-data.js`) as
  unassigned questions — it skips any that already match text you've
  already added, so it's safe to click more than once.
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

### Planner

- **+ New Plan** lets you name a plan and pick a start book/chapter and
  an end book/chapter (inclusive). The plan can span multiple books, in
  Bible order — e.g. start at Judges 1, end at Judges 21 for the whole
  book; or start at 1 Samuel 1, end at 2 Kings 25 to read through all the
  kings.
- Tap a plan's tab to see its checklist. Check off chapters as you go —
  progress syncs across devices. Tap **Read** on any chapter to jump
  straight to it in the **Bible** section.
- **Delete Plan** removes it for everyone.

### Memorize

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

## Adding another person/tab later

Open `js/questions.js` and add an entry to the `PEOPLE` array near the
top, e.g.:

```js
export const PEOPLE = [
  { id: "asher", label: "Asher" },
  { id: "ollie", label: "Ollie" },
  { id: "parents", label: "Parents" },
  { id: "grandma", label: "Grandma" },
];
```

Commit and push — the new tab shows up for everyone automatically.

## Files

- `index.html` / `style.css` — page shell and all styling.
- `js/main.js` — top-level section navigation and app bootstrapping.
- `js/firebase.js` — shared Firebase init (anonymous auth + Firestore).
- `js/questions.js` / `js/question-bank-data.js` — the Questions section
  and its bundled trivia bank.
- `js/bible-data.js` — the 66-book/chapter-count table and the list of
  available translations.
- `js/bible-api.js` — fetches chapter/verse text from bible-api.com, with
  localStorage caching.
- `js/bible-reader.js` — the Bible reading section.
- `js/planner.js` — the custom reading planner.
- `js/memorize.js` — the verse memorization section.
- `firebase-config.js` — your project's Firebase config (fill this in).
- `manifest.json` / `service-worker.js` / `icons/` — makes it installable
  as a PWA and lets the app shell load instantly (and offline) after the
  first visit. Data itself (questions, Bible text, plans, verses) still
  requires an internet connection the first time it's fetched.

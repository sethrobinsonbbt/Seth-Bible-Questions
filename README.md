# Bible Questions

A tiny family app for Bible-reading questions. Tabs across the top for
**Asher**, **Ollie**, and **Parents**, plus a shared **Library** of
questions that aren't assigned to anyone yet. Add, edit, delete, and
reassign questions from any tab. Everything syncs live across every phone
and computer that has the site open, using a free Firebase project.

It's a static site — installable on an iPhone via Safari's "Add to Home
Screen" (opens full-screen, no browser chrome) and installable as an app
from Chrome on desktop/Android too.

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
    match /questions/{questionId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Click **Publish**. This means only devices that have opened the app (and
silently signed in anonymously) can read or write questions.

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
- Changes sync instantly to everyone else with the app open.

## Adding another person/tab later

Open `app.js` and add an entry to the `PEOPLE` array near the top, e.g.:

```js
const PEOPLE = [
  { id: "asher", label: "Asher" },
  { id: "ollie", label: "Ollie" },
  { id: "parents", label: "Parents" },
  { id: "grandma", label: "Grandma" },
];
```

Commit and push — the new tab shows up for everyone automatically.

## Files

- `index.html` / `style.css` / `app.js` — the whole app (no build step).
- `firebase-config.js` — your project's Firebase config (fill this in).
- `manifest.json` / `service-worker.js` / `icons/` — makes it installable
  as a PWA and lets the app shell load instantly (and offline) after the
  first visit. Question data itself still requires an internet
  connection to sync through Firestore.

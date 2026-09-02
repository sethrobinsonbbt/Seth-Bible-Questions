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

## Point JC Notes at a different source folder — investigated, needs a decision

User-provided link:
https://drive.google.com/drive/folders/1QgBHviIVrpLQAgyl_NLpcd_pKDZKRK6M?usp=share_link
— wants this used as the source for JC Notes (the verse/chapter
commentary hyperlinks) instead of the current one.

**Investigated.** This folder is genuinely different from what's
already integrated — but it's not a drop-in replacement, and needs a
decision before any rebuild work starts.

What's there: 76 `.txt` files (one per book, mostly — Song of Solomon
is split per-chapter, 2 John/3 John are combined, Psalm 119 has some
redundant extra slices alongside the full `Psalm.txt`). Structure,
confirmed by reading `Genesis.txt` and `Philemon.txt` in full:

```
GENESIS
======================================================================

Chapter 1
--------------------------------------------------

 v.1
 — Peter Forbes [2009] (jan01)
 Both Mark 1:1 and John 1:1 echo the creation language...

 — Valerie Mello [2012] (jan01)
 "In the beginning God created the heaven and the earth."
 ...

 v.2-3
 — John Wilson [2004] (jan01)
 ...
```

This is a **multi-author, multi-year daily-reading-notes archive** —
verse (or verse-range) labeled sections, each containing one or more
independent commentary entries from different contributors across
different years (the same verse can have entries from the same author
in 2001, 2004, 2006, ... plus other authors), not a single continuous
voice. There's also a `[General / Whole Chapter]` pseudo-label for
commentary not tied to any verse.

Two things worth deciding before building anything:

1. **It carries an explicit copyright notice** — Philemon.txt's
   trailing entries read `© 2026 DailyReadings.org.uk`. The current
   `data/jc-notes/` content's provenance/licensing was presumably
   already settled when it was first integrated; this new source's
   terms haven't been checked, and it's bundled into a public
   GitHub Pages site's static files (readable by anyone), not kept
   server-side.
2. **It's a different kind of feature, not just a bigger version of the
   current one.** Today's JC Notes shows one paragraph per verse. This
   source would mean showing *multiple* dated, attributed entries per
   verse (sometimes many, across years/authors) — the UI (currently a
   flat list of `<p>`s in `jc-notes-popup.js`) and the data shape
   (`{ paragraphs, verseMap }`, one paragraph per verse) would both
   need real redesign to show "verse N has 4 entries, from these
   authors/years" sensibly, not just a bigger version of the existing
   split-into-paragraphs pipeline.

If given the go-ahead: raw file -> parse `Chapter N` sections -> within
each, parse `v.N` / `v.N-M` / `[General / Whole Chapter]` labels ->
within each label, split on `— Author [Year] (datecode)` attribution
lines into individual entries -> new per-book JSON shape that keeps
each entry's author/year rather than collapsing to one paragraph per
verse. Full raw file listing and the Genesis/Philemon inspection are in
this session's history if picked back up later.

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

# Future ideas

Not scheduled — just a running list of things worth doing later.

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

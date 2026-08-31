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

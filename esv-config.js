// Fill this in with YOUR OWN free Crossway ESV API key.
// See README.md ("Adding the ESV translation") for how to get one.
//
// IMPORTANT — unlike firebase-config.js, this key is NOT safe to treat as
// public: it's a plain bearer token, and this is a static site with no
// server, so it has to be sent straight from the browser to Crossway's
// API. That means anyone who opens this site's dev tools (or looks at
// this file in the repo) can read it and use it themselves. For a free,
// non-commercial key with no payment method attached, the realistic
// worst case is someone else eating your daily request quota — not a
// bill. If you want the key kept off the browser entirely, that needs a
// small server-side proxy (e.g. a Firebase Cloud Function), which is a
// bigger step than this file; ask Claude if you want that instead.
window.ESV_API_KEY = "YOUR_ESV_API_KEY";

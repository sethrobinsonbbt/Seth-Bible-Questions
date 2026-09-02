// Shared "reading voice" picking logic for the Bible reader's Listen
// feature (js/bible-reader.js) and the Setup page's Voice panel
// (js/settings.js) — both need the same saved pick and the same filtered
// voice list, so it lives here once rather than duplicated.
const VOICE_KEY = "bible-questions-voice-uri";

// Known non-speech novelty/sound-effect "voices" — several platforms (Apple
// in particular, under Settings > Accessibility > Spoken Content) ship joke
// voices like "Bubbles" or "Zarvox" that don't actually pronounce words.
// The Web Speech API has no flag for this, so it's a curated name-based
// exclusion list; the exact set has changed across OS versions, so this
// isn't guaranteed exhaustive.
const NOVELTY_VOICE_NAMES = new Set([
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "good news",
  "jester",
  "organ",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
]);

export function supportsSpeech() {
  return "speechSynthesis" in window;
}

// Only English, non-novelty voices are offered — this app is KJV-only, so a
// voice speaking another language isn't useful, and a sound-effect "voice"
// can't read anything at all.
export function getEnglishVoices() {
  if (!supportsSpeech()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang && v.lang.toLowerCase().startsWith("en"))
    .filter((v) => !NOVELTY_VOICE_NAMES.has(v.name.trim().toLowerCase()));
}

export function getSavedVoiceURI() {
  try {
    return localStorage.getItem(VOICE_KEY) || null;
  } catch (e) {
    return null;
  }
}

export function saveVoiceURI(uri) {
  try {
    if (uri) localStorage.setItem(VOICE_KEY, uri);
    else localStorage.removeItem(VOICE_KEY);
  } catch (e) {
    /* ignore */
  }
}

// Prefers a saved manual pick; otherwise a heuristic "best" voice — network
// voices (not locally synthesized) tend to sound noticeably more natural
// than a device's built-in default, so favor those when the browser
// exposes any, falling back to a name that suggests better quality.
function pickBestVoice(voices) {
  return (
    voices.find((v) => !v.localService) ||
    voices.find((v) => /Google|Microsoft|Natural|Enhanced|Premium/i.test(v.name)) ||
    voices[0] ||
    null
  );
}

export function getSelectedVoice() {
  const voices = getEnglishVoices();
  if (voices.length === 0) return null;
  const savedURI = getSavedVoiceURI();
  const saved = savedURI && voices.find((v) => v.voiceURI === savedURI);
  return saved || pickBestVoice(voices);
}

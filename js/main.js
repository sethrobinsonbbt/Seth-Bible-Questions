import { initFirebase, isConfigPlaceholder } from "./firebase.js";
import { mountQuestions } from "./questions.js";
import { mountBibleReader, goTo as goToBibleChapter } from "./bible-reader.js";
import { mountPlanner } from "./planner.js";
import { mountMemorize } from "./memorize.js";
import { mountSettings } from "./settings.js";
import { subscribeUsers } from "./users.js";
import { getActiveUser, setActiveUser } from "./active-user.js";

// "bible" is listed first, so it's both the top menu item and the default
// landing section — it opens straight to today's first daily reading (see
// bible-reader.js's mountBibleReader). "settings" gets a visual divider in
// the menu (see renderSideMenu) since it's an admin-only area, distinct
// from the family-facing sections above it.
const SECTIONS = [
  { id: "bible", label: "Bible", mount: mountBibleReader },
  { id: "planner", label: "Reading Plan", mount: mountPlanner },
  { id: "questions", label: "Questions", mount: mountQuestions },
  { id: "memorize", label: "Memorize", mount: mountMemorize },
  { id: "settings", label: "🔒 Setup", mount: mountSettings, divider: true },
];

let activeSection = SECTIONS[0].id;

// ---------- Global "who's using this" selector (shown on every page) ----------

function setupActiveUserBar() {
  const select = document.getElementById("active-user-select");

  subscribeUsers((users) => {
    const current = getActiveUser();
    select.innerHTML = "";
    const noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = users.length === 0 ? "No family yet" : "User";
    select.appendChild(noneOpt);
    users.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = u.name;
      select.appendChild(opt);
    });
    select.value = current && users.some((u) => u.id === current) ? current : "";
    if (!current || !users.some((u) => u.id === current)) setActiveUser(null);
  });

  select.addEventListener("change", () => setActiveUser(select.value || null));
}

// ---------- Theme (light / dark / auto) ----------

const THEME_KEY = "bible-questions-theme"; // "light" | "dark" | absent = follow system

function getThemePref() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (e) {
    return null;
  }
}

function setThemePref(value) {
  try {
    if (value) localStorage.setItem(THEME_KEY, value);
    else localStorage.removeItem(THEME_KEY);
  } catch (e) {
    /* ignore */
  }
}

// Plain line-art sun/moon/half-and-half glyphs (currentColor fill/stroke)
// instead of colored emoji, so the toggle reads as a monochrome icon that
// automatically matches the app's light/dark text color either way.
const THEME_ICONS = {
  light:
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4.5" fill="currentColor"/>' +
    '<g stroke="currentColor" stroke-width="1.7" stroke-linecap="round">' +
    '<line x1="12" y1="1.5" x2="12" y2="4.2"/><line x1="12" y1="19.8" x2="12" y2="22.5"/>' +
    '<line x1="1.5" y1="12" x2="4.2" y2="12"/><line x1="19.8" y1="12" x2="22.5" y2="12"/>' +
    '<line x1="4.4" y1="4.4" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.6" y2="19.6"/>' +
    '<line x1="4.4" y1="19.6" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.6" y2="4.4"/>' +
    "</g></svg>",
  dark:
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M20 14.6A8.6 8.6 0 1 1 9.4 4 7 7 0 0 0 20 14.6z" fill="currentColor"/>' +
    "</svg>",
  auto:
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
    '<path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>' +
    "</svg>",
};

function applyTheme() {
  const pref = getThemePref();
  if (pref === "light" || pref === "dark") {
    document.documentElement.dataset.theme = pref;
  } else {
    delete document.documentElement.dataset.theme;
  }
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  const key = pref === "dark" ? "dark" : pref === "light" ? "light" : "auto";
  const label = pref === "dark" ? "Dark" : pref === "light" ? "Light" : "Auto";
  btn.innerHTML = `${THEME_ICONS[key]}<span>Theme: ${label}</span>`;
  btn.setAttribute("aria-label", `Theme: ${pref || "auto"} — tap to change`);
}

// Cycles Auto → Dark → Light → Auto, so it's always possible to go back to
// following the device's system setting.
function cycleTheme() {
  const pref = getThemePref();
  setThemePref(pref === null ? "dark" : pref === "dark" ? "light" : null);
  applyTheme();
}

// Applied immediately (not just on DOMContentLoaded) so a saved preference
// takes effect before first paint instead of flashing the wrong theme.
applyTheme();

function renderSideMenu() {
  const linksEl = document.getElementById("side-menu-links");
  linksEl.innerHTML = "";
  SECTIONS.forEach((section) => {
    if (section.divider) {
      linksEl.appendChild(document.createElement("hr")).className = "side-menu-divider";
    }
    const btn = document.createElement("button");
    btn.className = "side-menu-item" + (section.id === activeSection ? " active" : "");
    btn.textContent = section.label;
    btn.addEventListener("click", () => {
      setActiveSection(section.id);
      closeMenu();
    });
    linksEl.appendChild(btn);
  });
}

function openMenu() {
  document.getElementById("side-menu").classList.add("open");
  document.getElementById("side-menu-backdrop").hidden = false;
}

function closeMenu() {
  document.getElementById("side-menu").classList.remove("open");
  document.getElementById("side-menu-backdrop").hidden = true;
}

function setupMenu() {
  document.getElementById("menu-toggle-btn").addEventListener("click", openMenu);
  document.getElementById("side-menu-close-btn").addEventListener("click", closeMenu);
  document.getElementById("side-menu-backdrop").addEventListener("click", closeMenu);
}

function setActiveSection(id) {
  activeSection = id;
  SECTIONS.forEach((section) => {
    document.getElementById(`section-${section.id}`).hidden = section.id !== id;
  });
  renderSideMenu();
}

function initSections() {
  renderSideMenu();
  SECTIONS.forEach((section) => {
    document.getElementById(`section-${section.id}`).hidden = section.id !== activeSection;
  });
  SECTIONS.forEach((section) => section.mount(document.getElementById(`section-${section.id}`)));
}

function setupStatusBanner() {
  const statusEl = document.getElementById("connection-status");
  const bannerEl = document.getElementById("setup-banner");

  initFirebase((status) => {
    statusEl.hidden = false;
    if (status === "not-configured") {
      bannerEl.hidden = false;
      statusEl.textContent = "Not configured";
      statusEl.classList.remove("ok");
    } else if (status === "connecting") {
      statusEl.textContent = "Connecting…";
      statusEl.classList.remove("ok");
    } else if (status === "synced") {
      statusEl.textContent = "Synced";
      statusEl.classList.add("ok");
    } else {
      statusEl.textContent = "Connection error";
      statusEl.classList.remove("ok");
      if (isConfigPlaceholder()) bannerEl.hidden = false;
    }
  });
}

window.addEventListener("bible:navigate", (e) => {
  setActiveSection("bible");
  goToBibleChapter(e.detail.book, e.detail.chapter, e.detail.version, e.detail.dailyContext);
});

document.addEventListener("DOMContentLoaded", () => {
  initSections();
  setupMenu();
  setupStatusBanner();
  setupActiveUserBar();
  applyTheme();
  document.getElementById("theme-toggle-btn").addEventListener("click", cycleTheme);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
});

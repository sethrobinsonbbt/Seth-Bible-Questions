import { initFirebase, isConfigPlaceholder } from "./firebase.js";
import { mountQuestions } from "./questions.js";
import { mountBibleReader, goTo as goToBibleChapter } from "./bible-reader.js";
import { mountPlanner } from "./planner.js";
import { mountMemorize } from "./memorize.js";
import { mountSettings } from "./settings.js";

// "settings" is deliberately left out of the primary tab row (it's an
// admin-only area, easy to overlook or crowd out on a small screen) and
// reached instead via the footer link built in setupFooter().
const SECTIONS = [
  { id: "questions", label: "Questions", mount: mountQuestions },
  { id: "bible", label: "Bible", mount: mountBibleReader },
  { id: "planner", label: "Planner", mount: mountPlanner },
  { id: "memorize", label: "Memorize", mount: mountMemorize },
  { id: "settings", label: "🔒 Setup", mount: mountSettings, hideFromNav: true },
];

let activeSection = SECTIONS[0].id;

function renderPrimaryNav() {
  const nav = document.getElementById("primary-tabs");
  nav.innerHTML = "";
  SECTIONS.filter((section) => !section.hideFromNav).forEach((section) => {
    const btn = document.createElement("button");
    btn.className = "tab-btn primary-tab-btn" + (section.id === activeSection ? " active" : "");
    btn.textContent = section.label;
    btn.addEventListener("click", () => setActiveSection(section.id));
    nav.appendChild(btn);
  });
}

function setActiveSection(id) {
  activeSection = id;
  SECTIONS.forEach((section) => {
    document.getElementById(`section-${section.id}`).hidden = section.id !== id;
  });
  renderPrimaryNav();
  setupFooterActive();
}

function setupFooter() {
  const btn = document.getElementById("footer-setup-btn");
  btn.addEventListener("click", () => setActiveSection("settings"));
  setupFooterActive();
}

function setupFooterActive() {
  document.getElementById("footer-setup-btn").classList.toggle("active", activeSection === "settings");
}

function initSections() {
  renderPrimaryNav();
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
  goToBibleChapter(e.detail.book, e.detail.chapter, e.detail.version);
});

document.addEventListener("DOMContentLoaded", () => {
  initSections();
  setupFooter();
  setupStatusBanner();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
});

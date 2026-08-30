// Shown once per device, before the rest of the app mounts: pick a family
// by code, or create a new one. See family.js for the data model. On
// success this does a full page reload rather than continuing in place —
// every data module wires its Firestore subscriptions once, at import
// time, scoped to whatever family is active; reloading is the simplest
// way to make sure all of them start fresh against the new family.
import { ready } from "./firebase.js";
import { getFamilyId, normalizeCode, createFamily, joinFamily, requestCodeReminder } from "./family.js";

function familyCodeFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get("family");
  } catch (e) {
    return null;
  }
}

export function mountFamilyGate(onReady) {
  if (getFamilyId()) {
    onReady();
    return;
  }

  const gate = document.getElementById("family-gate");
  gate.hidden = false;

  const tabs = gate.querySelectorAll(".family-gate-tab");
  const joinPanel = document.getElementById("family-gate-join");
  const createPanel = document.getElementById("family-gate-create");
  const statusEl = document.getElementById("family-gate-status");
  const codeInput = document.getElementById("family-code-input");
  const joinBtn = document.getElementById("family-join-btn");
  const joinError = document.getElementById("family-join-error");
  const nameInput = document.getElementById("family-name-input");
  const passcodeInput = document.getElementById("family-passcode-input");
  const createBtn = document.getElementById("family-create-btn");
  const createError = document.getElementById("family-create-error");
  const forgotToggle = document.getElementById("forgot-code-toggle");
  const forgotPanel = document.getElementById("forgot-code-panel");
  const forgotNameInput = document.getElementById("forgot-family-name");
  const forgotContactInput = document.getElementById("forgot-contact");
  const forgotError = document.getElementById("forgot-code-error");
  const forgotSuccess = document.getElementById("forgot-code-success");
  const forgotSubmitBtn = document.getElementById("forgot-code-submit-btn");

  function showTab(tab) {
    tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
    joinPanel.hidden = tab !== "join";
    createPanel.hidden = tab !== "create";
  }

  tabs.forEach((btn) => btn.addEventListener("click", () => showTab(btn.dataset.tab)));

  const urlCode = familyCodeFromUrl();
  if (urlCode) {
    codeInput.value = normalizeCode(urlCode);
    showTab("join");
  }

  function setBusy(busy, label) {
    statusEl.hidden = !busy;
    statusEl.textContent = busy ? label : "";
    joinBtn.disabled = busy;
    createBtn.disabled = busy;
  }

  joinBtn.addEventListener("click", async () => {
    joinError.hidden = true;
    setBusy(true, "Connecting…");
    try {
      const db = await ready;
      const result = await joinFamily(db, codeInput.value);
      if (!result.ok) {
        joinError.textContent = result.error;
        joinError.hidden = false;
        setBusy(false);
        return;
      }
      setBusy(true, "Joined! Loading your family's data…");
      window.location.reload();
    } catch (err) {
      console.error(err);
      joinError.textContent = "Couldn't connect — check your internet connection and try again.";
      joinError.hidden = false;
      setBusy(false);
    }
  });

  forgotToggle.addEventListener("click", () => {
    forgotPanel.hidden = !forgotPanel.hidden;
  });

  forgotSubmitBtn.addEventListener("click", async () => {
    forgotError.hidden = true;
    forgotSuccess.hidden = true;
    const familyNameHint = forgotNameInput.value.trim();
    const contact = forgotContactInput.value.trim();
    if (!familyNameHint || !contact) {
      forgotError.textContent = "Enter both the family name and how to reach you.";
      forgotError.hidden = false;
      return;
    }
    const originalText = forgotSubmitBtn.textContent;
    forgotSubmitBtn.disabled = true;
    forgotSubmitBtn.textContent = "Sending…";
    try {
      const db = await ready;
      await requestCodeReminder(db, familyNameHint, contact);
      forgotSuccess.hidden = false;
      forgotNameInput.value = "";
      forgotContactInput.value = "";
    } catch (err) {
      console.error(err);
      forgotError.textContent = "Couldn't send that — check your internet connection and try again.";
      forgotError.hidden = false;
    } finally {
      forgotSubmitBtn.disabled = false;
      forgotSubmitBtn.textContent = originalText;
    }
  });

  createBtn.addEventListener("click", async () => {
    createError.hidden = true;
    const name = nameInput.value.trim();
    const passcode = passcodeInput.value.trim();
    if (!name) {
      createError.textContent = "Give your family a name.";
      createError.hidden = false;
      return;
    }
    if (!passcode) {
      createError.textContent = "Pick a Setup passcode.";
      createError.hidden = false;
      return;
    }
    setBusy(true, "Connecting…");
    try {
      const db = await ready;
      await createFamily(db, name, passcode);
      setBusy(true, "Family created! Loading…");
      window.location.reload();
    } catch (err) {
      console.error(err);
      createError.textContent = "Couldn't create your family — check your internet connection and try again.";
      createError.hidden = false;
      setBusy(false);
    }
  });
}

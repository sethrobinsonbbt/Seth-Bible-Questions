// "Prayer List" section. Each family member keeps their own prayer lists
// (people, things they're thankful for, goals, ...), each scheduled into
// any of their Morning / Afternoon / Evening prayers on chosen days of the
// week, N items at a time. The top of the page shows today's prayer for
// the selected time, with a checkbox per item; the rotation itself lives
// in prayer-data.js.
import {
  SLOTS,
  KINDS,
  DAY_LABELS,
  subscribePrayerLists,
  slotForTime,
  isScheduled,
  batchFor,
  toggleItem,
  addPrayerList,
  updatePrayerList,
  deletePrayerList,
} from "./prayer-data.js";
import { subscribeUsers } from "./users.js";
import { subscribeActiveUser } from "./active-user.js";

const el = (id) => document.getElementById(id);

let users = [];
let allLists = [];
let activeUserId = null;
let selectedSlot = slotForTime();
let editingList = null; // the list being edited, or null when adding a new one

const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function kindInfo(kind) {
  return KINDS.find((k) => k.id === kind) || KINDS[KINDS.length - 1];
}

function myLists() {
  return allLists
    .filter((l) => l.ownerId === activeUserId)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

function daysSummary(days) {
  const set = [...new Set(days || [])].sort((a, b) => a - b);
  if (set.length === 7) return "Every day";
  if (set.length === 0) return "No days picked";
  if (set.join() === WEEKDAYS.join()) return "Mon–Fri";
  if (set.join() === "0,6") return "Weekends";
  return set.map((d) => DAY_LABELS[d]).join(", ");
}

function scheduleSummary(list) {
  const count = list.perPrayer > 0 ? `${list.perPrayer} per prayer` : "All each prayer";
  const slots = SLOTS.filter((s) => (list.slots || []).includes(s.id)).map((s) => s.label);
  return [count, slots.length ? slots.join(" & ") : "No prayer time picked", daysSummary(list.days)].join(" · ");
}

// ---------- Today's prayer ----------

function renderSlotTabs() {
  const host = el("prayer-slot-tabs");
  host.innerHTML = "";
  SLOTS.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "prayer-slot-tab" + (s.id === selectedSlot ? " active" : "");
    btn.innerHTML = `<span aria-hidden="true">${s.icon}</span> ${s.label}`;
    btn.addEventListener("click", () => {
      selectedSlot = s.id;
      render();
    });
    host.appendChild(btn);
  });
}

function renderToday() {
  const host = el("prayer-today");
  host.innerHTML = "";
  const scheduled = myLists().filter((l) => isScheduled(l, selectedSlot) && (l.items || []).length > 0);

  if (scheduled.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-state prayer-today-empty";
    const slotLabel = SLOTS.find((s) => s.id === selectedSlot).label.toLowerCase();
    p.textContent = myLists().length
      ? `Nothing scheduled for today's ${slotLabel} prayer.`
      : "No prayer lists yet — tap \"+ New List\" below to start one.";
    host.appendChild(p);
    return;
  }

  scheduled.forEach((list) => {
    const batch = batchFor(list, selectedSlot);
    const card = document.createElement("div");
    card.className = "prayer-card" + (batch.finished ? " finished" : "");

    const head = document.createElement("div");
    head.className = "prayer-card-head";
    const title = document.createElement("span");
    title.className = "prayer-card-title";
    title.textContent = `${kindInfo(list.kind).icon} ${list.name}`;
    head.appendChild(title);
    const status = document.createElement("span");
    status.className = "prayer-card-status";
    status.textContent = batch.finished ? "Done ✓" : `${batch.checked.length}/${batch.items.length}`;
    head.appendChild(status);
    card.appendChild(head);

    const ul = document.createElement("ul");
    ul.className = "prayer-items";
    batch.items.forEach((text) => {
      const li = document.createElement("li");
      const label = document.createElement("label");
      label.className = "prayer-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = batch.checked.includes(text);
      cb.addEventListener("change", () => toggleItem(list, selectedSlot, text));
      const span = document.createElement("span");
      span.textContent = text;
      label.append(cb, span);
      li.appendChild(label);
      ul.appendChild(li);
    });
    card.appendChild(ul);

    if (batch.finished && list.perPrayer > 0) {
      const note = document.createElement("p");
      note.className = "prayer-card-note";
      note.textContent = "The next ones on this list come up at your next scheduled prayer.";
      card.appendChild(note);
    }
    host.appendChild(card);
  });
}

// ---------- My lists ----------

function renderMyLists() {
  const ul = el("prayer-lists");
  ul.innerHTML = "";
  const lists = myLists();
  el("prayer-lists-empty").hidden = lists.length > 0;
  lists.forEach((list) => {
    const li = document.createElement("li");
    li.className = "prayer-list-row";
    const info = document.createElement("div");
    info.className = "prayer-list-info";
    const name = document.createElement("div");
    name.className = "prayer-list-name";
    const n = (list.items || []).length;
    name.textContent = `${kindInfo(list.kind).icon} ${list.name} (${n})`;
    const sched = document.createElement("div");
    sched.className = "prayer-list-sched";
    sched.textContent = scheduleSummary(list);
    info.append(name, sched);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn btn-small";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => openModal(list));
    li.append(info, edit);
    ul.appendChild(li);
  });
}

// ---------- Add / edit modal ----------

function buildToggleChips(hostId, options, selected) {
  const host = el(hostId);
  host.innerHTML = "";
  options.forEach((o) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (selected.includes(o.id) ? " active" : "");
    chip.dataset.value = String(o.id);
    chip.textContent = o.label;
    chip.addEventListener("click", () => chip.classList.toggle("active"));
    host.appendChild(chip);
  });
}

function selectedChipValues(hostId) {
  return Array.from(el(hostId).querySelectorAll(".chip.active")).map((c) => c.dataset.value);
}

function setDays(days) {
  el("prayer-days")
    .querySelectorAll(".chip")
    .forEach((c) => c.classList.toggle("active", days.includes(Number(c.dataset.value))));
}

function syncPerPrayer() {
  el("prayer-per-count").disabled = el("prayer-per-all").checked;
}

function openModal(list) {
  editingList = list || null;
  el("prayer-modal-title").textContent = list ? "Edit Prayer List" : "New Prayer List";
  el("prayer-delete-btn").hidden = !list;
  el("prayer-error").hidden = true;

  const kindSelect = el("prayer-kind");
  kindSelect.innerHTML = "";
  KINDS.forEach((k) => {
    const opt = document.createElement("option");
    opt.value = k.id;
    opt.textContent = `${k.icon} ${k.label}`;
    kindSelect.appendChild(opt);
  });
  kindSelect.value = list ? list.kind || "custom" : "people";
  el("prayer-name").value = list ? list.name : "";
  el("prayer-items").value = list ? (list.items || []).join("\n") : "";

  const per = list ? list.perPrayer || 0 : 3;
  el("prayer-per-all").checked = per === 0;
  el("prayer-per-count").value = per || 3;
  syncPerPrayer();

  buildToggleChips("prayer-slots", SLOTS.map((s) => ({ id: s.id, label: `${s.icon} ${s.label}` })), list ? list.slots || [] : [slotForTime()]);
  buildToggleChips("prayer-days", DAY_LABELS.map((label, i) => ({ id: i, label })), []);
  setDays(list ? list.days || [] : ALL_DAYS);

  el("prayer-modal-backdrop").hidden = false;
  if (!list) el("prayer-name").focus();
}

function closeModal() {
  editingList = null;
  el("prayer-modal-backdrop").hidden = true;
}

function showError(msg) {
  el("prayer-error").textContent = msg;
  el("prayer-error").hidden = false;
}

function saveModal() {
  const kind = el("prayer-kind").value;
  const name = el("prayer-name").value.trim() || kindInfo(kind).label;
  const items = [
    ...new Set(
      el("prayer-items")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
  const slots = selectedChipValues("prayer-slots");
  const days = selectedChipValues("prayer-days").map(Number);
  const perPrayer = el("prayer-per-all").checked ? 0 : parseInt(el("prayer-per-count").value, 10);

  if (items.length === 0) return showError("Add at least one thing to pray for (one per line).");
  if (!el("prayer-per-all").checked && !(perPrayer >= 1)) return showError("Pick how many to pray for each time (1 or more), or tick \"All\".");
  if (slots.length === 0) return showError("Pick at least one prayer time.");
  if (days.length === 0) return showError("Pick at least one day.");

  const data = { name, kind, items, slots, days, perPrayer };
  if (editingList) updatePrayerList(editingList, data);
  else addPrayerList({ ...data, ownerId: activeUserId });
  closeModal();
}

function deleteCurrent() {
  if (!editingList) return;
  if (!confirm(`Delete the "${editingList.name}" prayer list?`)) return;
  deletePrayerList(editingList.id);
  closeModal();
}

// ---------- Shell ----------

function buildSkeleton(container) {
  container.innerHTML = `
    <p id="prayer-no-user" class="empty-state" hidden></p>
    <div id="prayer-main" hidden>
      <div class="list-toolbar">
        <h2 id="prayer-heading">Today's Prayer</h2>
      </div>
      <div class="prayer-slot-tabs" id="prayer-slot-tabs"></div>
      <div id="prayer-today"></div>

      <div class="list-toolbar prayer-lists-toolbar">
        <h2>My Prayer Lists</h2>
        <button id="prayer-add-btn" class="btn btn-primary">+ New List</button>
      </div>
      <ul id="prayer-lists" class="prayer-lists"></ul>
      <p id="prayer-lists-empty" class="empty-state" hidden>Make a list of people to pray for, things you're thankful for, goals — anything.</p>
    </div>

    <div id="prayer-modal-backdrop" class="modal-backdrop" hidden>
      <div class="modal">
        <h3 id="prayer-modal-title">New Prayer List</h3>
        <label for="prayer-kind">Kind</label>
        <select id="prayer-kind"></select>
        <label for="prayer-name">Name</label>
        <input id="prayer-name" type="text" placeholder="e.g. Friends at church" />
        <label for="prayer-items">Things to pray for — one per line, in order</label>
        <textarea id="prayer-items" rows="6" placeholder="Grandma&#10;Pastor John&#10;The Smith family"></textarea>
        <label for="prayer-per-count">How many each prayer</label>
        <div class="prayer-per-row">
          <input id="prayer-per-count" type="number" min="1" inputmode="numeric" />
          <label class="prayer-inline-check"><input id="prayer-per-all" type="checkbox" /> All of them, every time</label>
        </div>
        <label>Prayer times</label>
        <div class="prayer-chip-wrap" id="prayer-slots"></div>
        <label>Days</label>
        <div class="prayer-chip-wrap" id="prayer-days"></div>
        <div class="prayer-day-presets">
          <button type="button" class="btn btn-small" data-days="all">Every day</button>
          <button type="button" class="btn btn-small" data-days="weekdays">Mon–Fri</button>
          <button type="button" class="btn btn-small" data-days="weekends">Weekends</button>
        </div>
        <p id="prayer-error" class="form-error" hidden></p>
        <div class="modal-actions">
          <button id="prayer-delete-btn" class="btn btn-danger prayer-delete-btn" hidden>Delete</button>
          <button id="prayer-cancel-btn" class="btn">Cancel</button>
          <button id="prayer-save-btn" class="btn btn-primary">Save</button>
        </div>
      </div>
    </div>
  `;
}

function render() {
  const noUser = el("prayer-no-user");
  const main = el("prayer-main");
  const me = users.find((u) => u.id === activeUserId);
  if (!me) {
    noUser.textContent =
      users.length === 0
        ? "No family members set up yet. Add them in 🔒 Setup (☰ menu)."
        : "Pick who you are in the User dropdown at the top to see your prayer lists.";
    noUser.hidden = false;
    main.hidden = true;
    return;
  }
  noUser.hidden = true;
  main.hidden = false;
  el("prayer-heading").textContent = `${me.name}'s Prayer Today`;
  renderSlotTabs();
  renderToday();
  renderMyLists();
}

export function mountPrayer(container) {
  buildSkeleton(container);
  el("prayer-add-btn").addEventListener("click", () => openModal(null));
  el("prayer-cancel-btn").addEventListener("click", closeModal);
  el("prayer-save-btn").addEventListener("click", saveModal);
  el("prayer-delete-btn").addEventListener("click", deleteCurrent);
  el("prayer-per-all").addEventListener("change", syncPerPrayer);
  el("prayer-modal-backdrop").addEventListener("click", (e) => {
    if (e.target === el("prayer-modal-backdrop")) closeModal();
  });
  container.querySelectorAll(".prayer-day-presets button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.days;
      setDays(preset === "weekdays" ? WEEKDAYS : preset === "weekends" ? [0, 6] : ALL_DAYS);
    });
  });

  subscribeUsers((updated) => {
    users = updated;
    render();
  });
  subscribeActiveUser((id) => {
    activeUserId = id;
    if (el("prayer-main")) render();
  });
  subscribePrayerLists((updated) => {
    allLists = updated;
    render();
  });
}

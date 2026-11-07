// "Prayer List" section. Each family member keeps their own prayer lists
// under four tabs (People / Thankful / Goals / Other). Each tab IS the
// list: type a name and what to pray about them (e.g. "Sister Judy" —
// "Physical well-being and dementia") and tap Add — the first Add creates
// the list behind the scenes with a default schedule. ⚙️ Schedule sets how
// many come up each prayer, at which prayer times, on which days.
//
// "🙏 Start Prayer" opens the prayer itself for the selected prayer time:
// everything picked for it from every tab (the next N in each list's
// rotation — see prayer-data.js), each with its note and a checkbox, plus
// "+ Add" to add someone mid-prayer. A prayer quote sits at the bottom of
// the page (prayer-quotes.js).
import {
  SLOTS,
  KINDS,
  DAY_LABELS,
  subscribePrayerLists,
  normalizeItems,
  slotForTime,
  isScheduled,
  batchFor,
  toggleItem,
  addPrayerList,
  updatePrayerListSettings,
  deletePrayerList,
  addItem,
  updateItem,
  removeItem,
} from "./prayer-data.js";
import { subscribeUsers } from "./users.js";
import { subscribeActiveUser, setActiveUser } from "./active-user.js";
import { PRAYER_QUOTES } from "./prayer-quotes.js";

const el = (id) => document.getElementById(id);

const KIND_TAB_KEY = "bible-questions:prayer-kind-tab";
const WEEKDAYS = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

let users = [];
let allLists = [];
let activeUserId = null;
let selectedSlot = slotForTime();
let selectedKind = loadKindTab();
let editingList = null; // list whose ⚙️ Schedule modal is open, or null when creating one
let creatingKind = null; // kind of the list being created
let praying = false; // true while the Start Prayer view is open
let openTodayAddFor = null; // list id whose "+ Add" form is open in the prayer view
let quoteOffset = 0; // how many times "Another" has been tapped today
let editingItem = null; // { listId, itemId } being edited inline under My Prayer Lists
// Typed-but-unsent text in each add/edit form, keyed by form, so a re-render
// (e.g. another device's update arriving) doesn't wipe what's being typed.
const drafts = {};
let focusAfterRender = null; // form key whose name box should get focus after the next render

function loadKindTab() {
  try {
    const v = localStorage.getItem(KIND_TAB_KEY);
    return KINDS.some((k) => k.id === v) ? v : "people";
  } catch (e) {
    return "people";
  }
}

function saveKindTab(v) {
  try {
    localStorage.setItem(KIND_TAB_KEY, v);
  } catch (e) {
    /* ignore */
  }
}

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

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ---------- Shared item form (name + note + submit) ----------

// `key` identifies the form for drafts/focus. `initial` pre-fills it (edit).
// onSubmit({name, note}) is called with trimmed values; the form clears
// itself and keeps focus in the name box for adding several in a row.
function buildItemForm({ key, kind, initial, submitLabel, onSubmit, onCancel }) {
  const info = kindInfo(kind);
  const draft = drafts[key] || initial || { name: "", note: "" };
  const form = make("form", "prayer-item-form");
  form.dataset.key = key;

  const name = make("input", "prayer-item-form-name");
  name.type = "text";
  name.placeholder = info.itemEg;
  name.setAttribute("aria-label", info.item);
  name.value = draft.name || "";
  const note = make("textarea", "prayer-item-form-note");
  note.rows = 2;
  note.placeholder = info.noteEg;
  note.setAttribute("aria-label", info.note);
  note.value = draft.note || "";
  const err = make("p", "form-error");
  err.hidden = true;

  const saveDraft = () => {
    drafts[key] = { name: name.value, note: note.value };
  };
  name.addEventListener("input", saveDraft);
  note.addEventListener("input", saveDraft);

  const actions = make("div", "prayer-item-form-actions");
  if (onCancel) {
    const cancel = make("button", "btn btn-small", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => {
      delete drafts[key];
      onCancel();
    });
    actions.appendChild(cancel);
  }
  const submit = make("button", "btn btn-primary btn-small", submitLabel || "Add");
  submit.type = "submit";
  actions.appendChild(submit);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = name.value.trim();
    if (!n) {
      err.textContent = `Enter ${info.item.toLowerCase()} first.`;
      err.hidden = false;
      name.focus();
      return;
    }
    const noteText = note.value.trim();
    delete drafts[key];
    name.value = "";
    note.value = "";
    err.hidden = true;
    focusAfterRender = key;
    onSubmit({ name: n, note: noteText });
    name.focus();
  });

  form.append(name, note, err, actions);
  return form;
}

function renderItemText(item) {
  const wrap = make("span", "prayer-item-text");
  wrap.appendChild(make("span", "prayer-item-name", item.name));
  if (item.note) wrap.appendChild(make("span", "prayer-item-note", item.note));
  return wrap;
}

function slotInfo(id) {
  return SLOTS.find((s) => s.id === id);
}

// Lists with something to pray about at the selected prayer time today.
function scheduledLists() {
  return myLists().filter((l) => isScheduled(l, selectedSlot) && normalizeItems(l).length > 0);
}

// ---------- Home: prayer time + Start Prayer ----------

function renderSlotTabs(hostId) {
  const host = el(hostId);
  host.innerHTML = "";
  SLOTS.forEach((s) => {
    // Emoji only; the name is still there for screen readers and on hover.
    const btn = make("button", "prayer-tab prayer-slot-icon" + (s.id === selectedSlot ? " active" : ""), s.icon);
    btn.type = "button";
    btn.title = `${s.label} prayer`;
    btn.setAttribute("aria-label", `${s.label} prayer`);
    btn.setAttribute("aria-pressed", s.id === selectedSlot ? "true" : "false");
    btn.addEventListener("click", () => {
      selectedSlot = s.id;
      openTodayAddFor = null;
      render();
    });
    host.appendChild(btn);
  });
}

// The start card is just the three prayer-time emoji and "Start Praying" —
// what's on the list for that time shows once the prayer is opened.
// ---------- The prayer itself ----------

function renderPrayer() {
  el("prayer-view-title").textContent = `${slotInfo(selectedSlot).icon} ${slotInfo(selectedSlot).label} Prayer`;
  const host = el("prayer-view-cards");
  host.innerHTML = "";
  const lists = scheduledLists().sort(
    (a, b) => KINDS.findIndex((k) => k.id === (a.kind || "custom")) - KINDS.findIndex((k) => k.id === (b.kind || "custom"))
  );

  if (lists.length === 0) {
    host.appendChild(
      make(
        "p",
        "empty-state prayer-today-empty",
        myLists().some((l) => normalizeItems(l).length)
          ? "Nothing picked for this prayer time. Change it with ⚙️ Schedule on the previous page."
          : "Nothing to pray about yet. Go back and add people and things under What to Pray About."
      )
    );
  }

  let allDone = lists.length > 0;
  lists.forEach((list) => {
    const info = kindInfo(list.kind);
    const batch = batchFor(list, selectedSlot);
    if (!batch.finished) allDone = false;
    const card = make("div", "prayer-card" + (batch.finished ? " finished" : ""));

    const head = make("div", "prayer-card-head");
    head.appendChild(make("span", "prayer-card-title", `${info.icon} ${list.name}`));
    head.appendChild(
      make("span", "prayer-card-status", batch.finished ? "Done ✓" : `${batch.checked.length}/${batch.items.length}`)
    );
    card.appendChild(head);

    const ul = make("ul", "prayer-items");
    batch.items.forEach((item) => {
      const li = document.createElement("li");
      const label = make("label", "prayer-item");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = batch.checked.includes(item.id);
      cb.addEventListener("change", () => toggleItem(list, selectedSlot, item.id));
      label.append(cb, renderItemText(item));
      li.appendChild(label);
      ul.appendChild(li);
    });
    card.appendChild(ul);

    if (batch.finished && list.perPrayer > 0) {
      card.appendChild(make("p", "prayer-card-note", "The next ones on this list come up at your next scheduled prayer."));
    }

    const key = `today:${list.id}`;
    if (openTodayAddFor === list.id) {
      card.appendChild(
        buildItemForm({
          key,
          kind: list.kind,
          onSubmit: (vals) => addItem(list, vals),
          onCancel: () => {
            openTodayAddFor = null;
            render();
          },
        })
      );
    } else {
      const addBtn = make("button", "prayer-card-add-btn", list.kind === "people" ? "+ Add a name" : "+ Add");
      addBtn.type = "button";
      addBtn.addEventListener("click", () => {
        openTodayAddFor = list.id;
        focusAfterRender = key;
        render();
      });
      card.appendChild(addBtn);
    }
    host.appendChild(card);
  });

  renderQuote("prayer-view-quote");
  el("prayer-finish-btn").textContent = allDone ? "Amen ✓" : "Done for now";
}

function openPrayer() {
  praying = true;
  render();
  window.scrollTo(0, 0);
}

function closePrayer() {
  praying = false;
  openTodayAddFor = null;
  render();
  window.scrollTo(0, 0);
}

// ---------- Quotes ----------

function quoteOfTheDay() {
  if (PRAYER_QUOTES.length === 0) return null;
  const now = new Date();
  const dayNumber = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86400000);
  return PRAYER_QUOTES[(((dayNumber + quoteOffset) % PRAYER_QUOTES.length) + PRAYER_QUOTES.length) % PRAYER_QUOTES.length];
}

function renderQuote(hostId) {
  const host = el(hostId);
  host.innerHTML = "";
  const q = quoteOfTheDay();
  host.hidden = !q;
  if (!q) return;
  const block = make("blockquote", "prayer-quote-text", `“${q.text}”`);
  host.appendChild(block);
  const foot = make("div", "prayer-quote-foot");
  foot.appendChild(make("span", "prayer-quote-source", q.source ? `— ${q.source}` : ""));
  if (PRAYER_QUOTES.length > 1) {
    const another = make("button", "prayer-card-add-btn", "Another ›");
    another.type = "button";
    another.addEventListener("click", () => {
      quoteOffset += 1;
      renderQuote(hostId);
    });
    foot.appendChild(another);
  }
  host.appendChild(foot);
}

// ---------- My prayer lists (by tab) ----------

function renderKindTabs() {
  const host = el("prayer-kind-tabs");
  host.innerHTML = "";
  KINDS.forEach((k) => {
    const btn = make("button", "prayer-tab" + (k.id === selectedKind ? " active" : ""));
    btn.type = "button";
    btn.innerHTML = `<span aria-hidden="true">${k.icon}</span> ${k.tab}`;
    btn.addEventListener("click", () => {
      selectedKind = k.id;
      saveKindTab(k.id);
      editingItem = null;
      render();
    });
    host.appendChild(btn);
  });
}

function renderManageItem(list, item) {
  const li = make("li", "prayer-manage-item");
  if (editingItem && editingItem.listId === list.id && editingItem.itemId === item.id) {
    li.appendChild(
      buildItemForm({
        key: `edit:${list.id}:${item.id}`,
        kind: list.kind,
        initial: { name: item.name, note: item.note },
        submitLabel: "Save",
        onSubmit: (vals) => {
          editingItem = null;
          focusAfterRender = null;
          updateItem(list, item.id, vals);
        },
        onCancel: () => {
          editingItem = null;
          render();
        },
      })
    );
    return li;
  }
  li.appendChild(renderItemText(item));
  const actions = make("div", "prayer-manage-item-actions");
  const edit = make("button", "prayer-icon-btn", "✏️");
  edit.type = "button";
  edit.setAttribute("aria-label", `Edit ${item.name}`);
  edit.addEventListener("click", () => {
    editingItem = { listId: list.id, itemId: item.id };
    focusAfterRender = `edit:${list.id}:${item.id}`;
    render();
  });
  const del = make("button", "prayer-icon-btn", "✕");
  del.type = "button";
  del.setAttribute("aria-label", `Remove ${item.name}`);
  del.addEventListener("click", () => {
    if (confirm(`Remove "${item.name}"?`)) removeItem(list, item.id);
  });
  actions.append(edit, del);
  li.appendChild(actions);
  return li;
}

function renderManage() {
  const host = el("prayer-manage");
  host.innerHTML = "";
  const info = kindInfo(selectedKind);
  const lists = myLists().filter((l) => (l.kind || "custom") === selectedKind);

  // No list for this tab yet: the add form is right there anyway — the
  // first Add quietly creates the list with a default schedule.
  if (lists.length === 0) {
    const card = make("div", "prayer-manage-card");
    card.appendChild(make("div", "prayer-list-name", `${info.icon} ${info.label}`));
    card.appendChild(
      make(
        "p",
        "prayer-card-note-muted",
        selectedKind === "people"
          ? "Add the people you want to pray for, and what to pray about for each."
          : `Add what goes on your ${info.label} list.`
      )
    );
    card.appendChild(
      buildItemForm({
        key: `new:${selectedKind}`,
        kind: selectedKind,
        onSubmit: (vals) => {
          focusAfterRender = "manage:new";
          addPrayerList({
            kind: selectedKind,
            name: info.label,
            ownerId: activeUserId,
            items: [vals],
            perPrayer: info.perPrayer,
            slots: SLOTS.map((sl) => sl.id),
            days: ALL_DAYS,
          });
        },
      })
    );
    host.appendChild(card);
    return;
  }

  lists.forEach((list) => {
    const card = make("div", "prayer-manage-card");
    const head = make("div", "prayer-manage-head");
    const titleWrap = make("div", "prayer-list-info");
    const items = normalizeItems(list);
    titleWrap.appendChild(make("div", "prayer-list-name", `${list.name} (${items.length})`));
    titleWrap.appendChild(make("div", "prayer-list-sched", scheduleSummary(list)));
    const sched = make("button", "btn btn-small", "⚙️ Schedule");
    sched.type = "button";
    sched.addEventListener("click", () => openModal(list));
    head.append(titleWrap, sched);
    card.appendChild(head);

    const ul = make("ul", "prayer-manage-items");
    items.forEach((item) => ul.appendChild(renderManageItem(list, item)));
    card.appendChild(ul);

    card.appendChild(
      buildItemForm({
        key: `manage:${list.id}`,
        kind: list.kind,
        onSubmit: (vals) => addItem(list, vals),
      })
    );
    host.appendChild(card);
  });
}

// ---------- Schedule modal (name, how many, times, days) ----------

function buildToggleChips(hostId, options, selected) {
  const host = el(hostId);
  host.innerHTML = "";
  options.forEach((o) => {
    const chip = make("button", "chip" + (selected.includes(o.id) ? " active" : ""), o.label);
    chip.type = "button";
    chip.dataset.value = String(o.id);
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

function openModal(list, kind) {
  editingList = list || null;
  creatingKind = list ? null : kind;
  const info = kindInfo(list ? list.kind : kind);
  el("prayer-modal-title").textContent = list ? `${info.icon} ${list.name}` : `${info.icon} New ${info.label} List`;
  el("prayer-delete-btn").hidden = !list;
  el("prayer-error").hidden = true;
  el("prayer-name").value = list ? list.name : info.label;

  const per = list ? list.perPrayer || 0 : kind === "people" ? 3 : 0;
  el("prayer-per-all").checked = per === 0;
  el("prayer-per-count").value = per || 3;
  syncPerPrayer();

  buildToggleChips(
    "prayer-slots",
    SLOTS.map((s) => ({ id: s.id, label: `${s.icon} ${s.label}` })),
    list ? list.slots || [] : [slotForTime()]
  );
  buildToggleChips("prayer-days", DAY_LABELS.map((label, i) => ({ id: i, label })), []);
  setDays(list ? list.days || [] : ALL_DAYS);

  el("prayer-modal-backdrop").hidden = false;
}

function closeModal() {
  editingList = null;
  creatingKind = null;
  el("prayer-modal-backdrop").hidden = true;
}

function showError(msg) {
  el("prayer-error").textContent = msg;
  el("prayer-error").hidden = false;
}

function saveModal() {
  const kind = editingList ? editingList.kind : creatingKind;
  const name = el("prayer-name").value.trim() || kindInfo(kind).label;
  const slots = selectedChipValues("prayer-slots");
  const days = selectedChipValues("prayer-days").map(Number);
  const perPrayer = el("prayer-per-all").checked ? 0 : parseInt(el("prayer-per-count").value, 10);

  if (!el("prayer-per-all").checked && !(perPrayer >= 1)) {
    return showError('Pick how many to pray for each time (1 or more), or tick "All".');
  }
  if (slots.length === 0) return showError("Pick at least one prayer time.");
  if (days.length === 0) return showError("Pick at least one day.");

  const data = { name, slots, days, perPrayer };
  if (editingList) updatePrayerListSettings(editingList, data);
  else {
    addPrayerList({ ...data, kind, ownerId: activeUserId });
    focusAfterRender = "manage:new";
  }
  closeModal();
}

function deleteCurrent() {
  if (!editingList) return;
  if (!confirm(`Delete the whole "${editingList.name}" list?`)) return;
  deletePrayerList(editingList.id);
  closeModal();
}

// ---------- Shell ----------

function buildSkeleton(container) {
  container.innerHTML = `
    <p id="prayer-no-user" class="empty-state" hidden></p>
    <div id="prayer-who" class="prayer-who" hidden>
      <h2 class="prayer-who-title">Who's praying?</h2>
      <div id="prayer-who-btns" class="prayer-who-btns"></div>
    </div>
    <div id="prayer-main" hidden>
      <div id="prayer-home">
        <div class="list-toolbar">
          <h2 id="prayer-heading">Prayer</h2>
        </div>
        <div class="prayer-start-card">
          <div class="prayer-tabs" id="prayer-slot-tabs"></div>
          <button id="prayer-start-btn" class="btn btn-primary btn-block prayer-start-btn">🙏 Start Praying</button>
        </div>

        <div class="list-toolbar prayer-lists-toolbar">
          <h2>What to Pray About</h2>
        </div>
        <div class="prayer-tabs prayer-kind-tabs" id="prayer-kind-tabs"></div>
        <div id="prayer-manage"></div>

        <div class="list-toolbar prayer-lists-toolbar">
          <h2>On Prayer</h2>
        </div>
        <div id="prayer-home-quote" class="prayer-quote"></div>
      </div>

      <div id="prayer-view" hidden>
        <div class="prayer-view-top">
          <button id="prayer-back-btn" class="btn btn-small">‹ Back</button>
          <h2 id="prayer-view-title" class="prayer-view-title"></h2>
        </div>
        <div id="prayer-view-cards"></div>
        <div id="prayer-view-quote" class="prayer-quote"></div>
        <button id="prayer-finish-btn" class="btn btn-primary btn-block">Amen ✓</button>
      </div>
    </div>

    <div id="prayer-modal-backdrop" class="modal-backdrop" hidden>
      <div class="modal">
        <h3 id="prayer-modal-title">New Prayer List</h3>
        <label for="prayer-name">List name</label>
        <input id="prayer-name" type="text" placeholder="e.g. Friends at church" />
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
          <button id="prayer-delete-btn" class="btn btn-danger prayer-delete-btn" hidden>Delete list</button>
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
  if (!noUser) return;
  const me = users.find((u) => u.id === activeUserId);
  const who = el("prayer-who");
  if (!me) {
    main.hidden = true;
    // Nobody picked yet: this page is all about one person's prayers, so
    // ask who right here instead of pointing at the header dropdown.
    // Picking someone sets them app-wide, same as that dropdown.
    if (users.length === 0) {
      noUser.textContent = "No family members set up yet. Add them in 🔒 Setup (☰ menu).";
      noUser.hidden = false;
      who.hidden = true;
      return;
    }
    noUser.hidden = true;
    who.hidden = false;
    const btns = el("prayer-who-btns");
    btns.innerHTML = "";
    [...users]
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((u) => {
        const b = make("button", "btn prayer-who-btn", u.name);
        b.type = "button";
        b.addEventListener("click", () => setActiveUser(u.id));
        btns.appendChild(b);
      });
    return;
  }
  noUser.hidden = true;
  who.hidden = true;
  main.hidden = false;

  // Remember which form box had focus (and where), so re-rendering under
  // someone mid-typing puts them right back.
  const active = document.activeElement;
  const activeForm = active && active.closest && active.closest(".prayer-item-form");
  const restore = activeForm
    ? { key: activeForm.dataset.key, cls: active.className, start: active.selectionStart, end: active.selectionEnd }
    : null;

  el("prayer-heading").textContent = `${me.name}'s Prayer`;
  el("prayer-home").hidden = praying;
  el("prayer-view").hidden = !praying;
  if (praying) {
    renderPrayer();
  } else {
    renderSlotTabs("prayer-slot-tabs");
    renderKindTabs();
    renderManage();
    renderQuote("prayer-home-quote");
  }

  let target = null;
  if (focusAfterRender === "manage:new") {
    const forms = el("prayer-manage").querySelectorAll(".prayer-item-form");
    if (forms.length) target = forms[forms.length - 1].querySelector(".prayer-item-form-name");
    if (target) focusAfterRender = null;
  } else if (focusAfterRender) {
    const form = document.querySelector(`.prayer-item-form[data-key="${CSS.escape(focusAfterRender)}"]`);
    if (form) target = form.querySelector(".prayer-item-form-name");
    focusAfterRender = null;
  } else if (restore) {
    const form = document.querySelector(`.prayer-item-form[data-key="${CSS.escape(restore.key)}"]`);
    target = form && form.querySelector("." + restore.cls.split(" ")[0]);
    if (target) {
      target.focus();
      try {
        target.setSelectionRange(restore.start, restore.end);
      } catch (e) {
        /* ignore */
      }
      return;
    }
  }
  if (target) target.focus();
}

export function mountPrayer(container) {
  buildSkeleton(container);
  el("prayer-start-btn").addEventListener("click", openPrayer);
  el("prayer-back-btn").addEventListener("click", closePrayer);
  el("prayer-finish-btn").addEventListener("click", closePrayer);
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
    praying = false;
    openTodayAddFor = null;
    editingItem = null;
    render();
  });
  subscribePrayerLists((updated) => {
    allLists = updated;
    render();
  });
}

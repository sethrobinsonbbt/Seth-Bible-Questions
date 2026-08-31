// The question type selector + type-specific fields editor (choices/items/
// options, and which of them are correct), shared by every place a
// question can be added or edited: the Question Library's Add modal and
// inline Edit (settings.js), and the Questions page's mid-quiz quick-edit
// modal (questions.js).

export const QUESTION_TYPES = [
  { id: "classic", label: "Classic (type an answer)" },
  { id: "multiple-choice", label: "Multiple Choice" },
  { id: "order", label: "Put in Order" },
  { id: "select-all", label: "Select All That Apply" },
];

export function questionTypeLabel(type) {
  return (QUESTION_TYPES.find((t) => t.id === type) || QUESTION_TYPES[0]).label;
}

// A list of text-input rows with "+ Add" / "×" remove, and an optional
// per-row radio (exactly one correct) or checkbox (any number correct) to
// its left. Shared by the multiple-choice/order/select-all editors below —
// they only differ in whether there's a selector and what it means.
export function buildDynamicList({ initialValues, selectMode, initialSelected, placeholder }) {
  const wrap = document.createElement("div");
  wrap.className = "dynamic-list";
  const radioName = "dynlist-" + Math.random().toString(36).slice(2);
  const rows = [];

  function addRow(value, selected) {
    const row = document.createElement("div");
    row.className = "dynamic-list-row";

    let selectInput = null;
    if (selectMode) {
      selectInput = document.createElement("input");
      selectInput.type = selectMode;
      if (selectMode === "radio") selectInput.name = radioName;
      selectInput.checked = !!selected;
      row.appendChild(selectInput);
    }

    const input = document.createElement("input");
    input.type = "text";
    input.className = "edit-answer-input";
    input.placeholder = placeholder || "";
    input.value = value || "";
    row.appendChild(input);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "dynamic-list-remove";
    removeBtn.setAttribute("aria-label", "Remove");
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      row.remove();
      rows.splice(rows.indexOf(entry), 1);
    });
    row.appendChild(removeBtn);

    wrap.insertBefore(row, addBtn);
    const entry = { row, input, selectInput };
    rows.push(entry);
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn-small";
  addBtn.textContent = "+ Add";
  addBtn.addEventListener("click", () => addRow("", false));
  wrap.appendChild(addBtn);

  (initialValues && initialValues.length ? initialValues : ["", "", ""]).forEach((v, i) =>
    addRow(v, initialSelected && initialSelected.includes(i))
  );

  return {
    el: wrap,
    getValues() {
      return rows.map((r) => r.input.value.trim()).filter((v) => v !== "");
    },
    // Indices are relative to the non-empty values getValues() returns,
    // so a selection lines up correctly even if a blank row is skipped.
    getSelectedIndices() {
      const nonEmpty = rows.filter((r) => r.input.value.trim() !== "");
      const indices = [];
      nonEmpty.forEach((r, i) => {
        if (r.selectInput && r.selectInput.checked) indices.push(i);
      });
      return indices;
    },
  };
}

// Builds the type selector + whichever type-specific fields go with it,
// pre-filled from `existing` (a question, when editing) if its own type
// matches the one currently selected. Returns { el, collect(), validate() }.
export function buildQuestionTypeEditor(existing) {
  const wrap = document.createElement("div");
  wrap.className = "qtype-editor";

  const typeSelect = document.createElement("select");
  typeSelect.className = "assign-select";
  QUESTION_TYPES.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    typeSelect.appendChild(opt);
  });
  typeSelect.value = (existing && existing.type) || "classic";
  wrap.appendChild(typeSelect);

  const fieldsHost = document.createElement("div");
  wrap.appendChild(fieldsHost);
  let listBuilder = null;

  function renderFields() {
    fieldsHost.innerHTML = "";
    listBuilder = null;
    const type = typeSelect.value;
    const sameTypeAsExisting = existing && existing.type === type;

    if (type === "multiple-choice") {
      const hint = document.createElement("p");
      hint.className = "settings-fineprint";
      hint.textContent = "Enter each choice, and mark which one is correct.";
      fieldsHost.appendChild(hint);
      listBuilder = buildDynamicList({
        initialValues: sameTypeAsExisting ? existing.choices : null,
        selectMode: "radio",
        initialSelected: sameTypeAsExisting && existing.correctIndex != null ? [existing.correctIndex] : null,
        placeholder: "Choice",
      });
      fieldsHost.appendChild(listBuilder.el);
    } else if (type === "order") {
      const hint = document.createElement("p");
      hint.className = "settings-fineprint";
      hint.textContent = "List the items in their correct order — they'll be shuffled for the quiz.";
      fieldsHost.appendChild(hint);
      listBuilder = buildDynamicList({
        initialValues: sameTypeAsExisting ? existing.items : null,
        selectMode: null,
        placeholder: "Item",
      });
      fieldsHost.appendChild(listBuilder.el);
    } else if (type === "select-all") {
      const hint = document.createElement("p");
      hint.className = "settings-fineprint";
      hint.textContent = "Enter each option, and check the ones that are correct.";
      fieldsHost.appendChild(hint);
      listBuilder = buildDynamicList({
        initialValues: sameTypeAsExisting ? existing.options : null,
        selectMode: "checkbox",
        initialSelected: sameTypeAsExisting ? existing.correctIndices : null,
        placeholder: "Option",
      });
      fieldsHost.appendChild(listBuilder.el);
    }
  }

  typeSelect.addEventListener("change", renderFields);
  renderFields();

  return {
    el: wrap,
    typeSelect,
    collect() {
      const type = typeSelect.value;
      if (type === "multiple-choice") {
        const choices = listBuilder.getValues();
        const selected = listBuilder.getSelectedIndices();
        return { type, choices, correctIndex: selected.length ? selected[0] : null };
      }
      if (type === "order") {
        return { type, items: listBuilder.getValues() };
      }
      if (type === "select-all") {
        return { type, options: listBuilder.getValues(), correctIndices: listBuilder.getSelectedIndices() };
      }
      return { type: "classic" };
    },
    validate(data) {
      if (data.type === "multiple-choice") {
        if (data.choices.length < 2) return "Add at least 2 choices.";
        if (data.correctIndex == null) return "Mark which choice is correct.";
      } else if (data.type === "order") {
        if (data.items.length < 2) return "Add at least 2 items to put in order.";
      } else if (data.type === "select-all") {
        if (data.options.length < 2) return "Add at least 2 options.";
        if (data.correctIndices.length === 0) return "Check at least one correct option.";
      }
      return null;
    },
  };
}

// Fixed list of age groups questions can be assigned to. Family members
// belong to one or more of these; a member's Questions tab shows the union
// of every age group they're in.
export const AGE_GROUPS = [
  { id: "2-3", label: "2–3 years" },
  { id: "4-6", label: "4–6 years" },
  { id: "7-10", label: "7–10 years" },
  { id: "11-15", label: "11–15 years" },
  { id: "adult", label: "Adult" },
];

export function ageGroupLabel(id) {
  const g = AGE_GROUPS.find((g) => g.id === id);
  return g ? g.label : id;
}

// Builds a <select> with a "Library (unassigned)" option plus one per age
// group, defaulting to `currentValue`. Shared by Settings' question admin
// and the Daily Reading page's quick "Q+" add-question modal.
export function buildAgeGroupSelect(currentValue) {
  const select = document.createElement("select");
  select.className = "assign-select";

  const libOpt = document.createElement("option");
  libOpt.value = "";
  libOpt.textContent = "Library (unassigned)";
  select.appendChild(libOpt);

  AGE_GROUPS.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.label;
    select.appendChild(opt);
  });

  select.value = currentValue || "";
  return select;
}

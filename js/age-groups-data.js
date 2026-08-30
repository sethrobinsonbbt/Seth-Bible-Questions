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

// Round 683 — the ONE place that says how the team roster is loaded.
// A person can belong to several teams: segment (active), segment2 (second team) and segments_extra (a Super admin's extra teams).
// Every page that builds a PIC list / team member list must load these columns, otherwise second/extra teams silently disappear
// (that was the Round 681/682 bug: ~30 pages each had their own copy of the column list). Use rosterQuery() — never type the list again.
// Then filter with filterProfilesByTeam() / memberOfTeam() (lib/workstationHelpers.js) or hasTeam()/anyTeam()/profileTeams() (lib/teamTypes.js).
export const ROSTER_COLUMNS = "id, name, segment, role, segment2, segments_extra";

// rosterQuery(supabase) -> query builder, chain .order("name") etc. exactly like supabase.from("profiles").select(...)
// extra = more columns, e.g. rosterQuery(supabase, "email, subteam")
export function rosterQuery(db, extra = "") {
  return db.from("profiles").select(extra ? `${ROSTER_COLUMNS}, ${extra}` : ROSTER_COLUMNS);
}

// Round 656 — everyone who belongs to a team, counting people whose SECOND team (profiles.segment2) is this one.
// Falls back to the plain segment match if the segment2 column is not there yet (SQL not run).
export async function teamMembersQuery(client, team, columns) {
  const r = await client.from("profiles").select(columns).or(`segment.eq.${team},segment2.eq.${team}`);
  if (!r.error) return r;
  return client.from("profiles").select(columns).eq("segment", team);
}

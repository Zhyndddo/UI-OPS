// Round 656 — everyone who belongs to a team, counting people whose SECOND team (profiles.segment2) is this one.
// Falls back to the plain segment match if the segment2 column is not there yet (SQL not run).
export async function teamMembersQuery(client, team, columns) {
  const r0 = await client.from("profiles").select(columns).or(`segment.eq.${team},segment2.eq.${team},segments_extra.cs.{${team}}`);   // Round 678: + Super admins holding this team as an extra
  if (!r0.error) return r0;
  const r = await client.from("profiles").select(columns).or(`segment.eq.${team},segment2.eq.${team}`);
  if (!r.error) return r;
  return client.from("profiles").select(columns).eq("segment", team);
}

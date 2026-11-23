# Team & role rules (read before touching teams, roles, PIC lists)

## How a person belongs to teams
- `profiles.segment` = the ACTIVE team (what the person picked in the switcher; labels, Task Table).
- `profiles.segment2` = second team (set by a dev in Config > Team).
- `profiles.segments_extra` (text[]) = extra teams, Super admin only.
- Anyone "is in team X" if X is in ANY of those three. Never compare `profile.segment === "X"` for access or lists.

## Which helper answers which question
| Question | Use |
|---|---|
| Load the people for a PIC / team list | `rosterQuery(supabase)` from `lib/roster.js` (never type the column list again) |
| People of team X for a dropdown | `filterProfilesByTeam(people, "X")` (`lib/workstationHelpers.js`, uses `memberOfTeam`) |
| Is THIS profile in team X / any of these teams | `hasTeam(p, "X")`, `anyTeam(p, fn)`, `profileTeams(p)` (`lib/teamTypes.js`) |
| Server fan-out to a team (notifications, digests) | `teamMembersQuery(client, team, columns)` (`lib/teamMembers.js`) and the SQL function `fanout_notification` |
| Is this person an admin | `isAdminRole(p)` (admin OR super admin), `isAdminOrAbove(p)` (+ dev) — never `role === "admin"` |
| Dev-only | `isDev(p)` / `role === "dev"` (dev is never in PIC lists) |

## Roles (low to high)
exc (Member) < teamlead < admin < superadmin < dev. Only a dev can create/change a Super admin or set second/extra teams.

## The guard
`npm run check:teams` (scripts/check-team-rules.js) fails if a changed file adds: a profiles select naming `segment` without `segments_extra`, a direct `.segment === "Team"` compare, a `role === "admin"` compare, or builds PIC lists without `rosterQuery`.
Existing spots are frozen in `scripts/team-rules-baseline.json`; fix one -> run `npm run check:teams -- --update-baseline`. Reviewed exception on one line: trailing `// roster-ok`, `// segment-ok` or `// role-ok`.
Run it before every push of a round that touches teams, roles or PIC lists.

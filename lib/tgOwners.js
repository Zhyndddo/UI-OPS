// Round 630 — "who should answer?" for the recap's unanswered questions. For each question: (1) the person it is addressed to
// ("Hiếu ơi …", "Hiếu Tâm ơi …"), else (2) the PIC of the release it names. Adds m.owner (a short text) or leaves it empty.
import { findPic, norm } from "./chatParse";
import { loadPeople } from "./tgIntake";
import { loadReleaseTitles } from "./chatActions";
import { loadOwners, picText } from "./friday";

export async function addOwners(db, open) {
  if (!open?.length) return open;
  const people = await loadPeople(db).catch(() => []);
  const rels = await loadReleaseTitles(db).catch(() => []);
  for (const m of open) {
    try {
      const first = String(m.text).split(/\r?\n/)[0].replace(/^@\w+\s*/, "");
      const pic = findPic(first, people);
      if (pic.addressed && pic.profiles.length) { m.owner = pic.profiles.map((p) => p.name).join(", "); continue; }
      const n = ` ${norm(m.text)} `;
      const rel = rels.find((r) => n.includes(` ${r.n} `));
      if (rel) { const [row] = await loadOwners(db, [{ id: rel.id }]); const t = row ? picText(row) : ""; if (t) m.owner = t === "chưa có" ? `chưa có PIC (${rel.title})` : `PIC ${t} (${rel.title})`; }
    } catch (e) { /* owner is a bonus */ }
  }
  return open;
}

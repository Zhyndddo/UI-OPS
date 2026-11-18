// Round 645 — "is this the same song?" for the rights form (browser + server).
// Title key: accents, case, spaces, punctuation, symbols, zero-width / full-width / look-alike (Cyrillic, Greek) letters are all ignored,
// so "Nắng. Ấm! Xa_Dần", "NANG AM XA DAN" and "Nа́ng Аm Xa Dаn" (Cyrillic а) give the SAME key. It cannot catch real misspellings.
const HOMO = { а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", к: "k", м: "m", т: "t", в: "b", ԁ: "d", ɡ: "g", α: "a", ο: "o", ν: "v", ρ: "p", ι: "i", κ: "k", τ: "t", υ: "u", ε: "e" };
export function textKey(s) {
  let t = String(s || "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/đ/g, "d");
  t = Array.from(t, (ch) => HOMO[ch] || ch).join("");
  return t.replace(/[^\p{L}\p{N}]+/gu, "");
}
// Several performers ("A, B", "B & A", "A ft. B", "A x B", "A và B") -> the same sorted list of keys.
export function artistKeyOf(s) {
  const parts = String(s || "").split(/\s*(?:,|&|;|\/|\+|\bfeat\.?|\bft\.?|\bx\b|\bvà\b|\band\b|\bwith\b)\s*/i).map(textKey).filter(Boolean);
  return [...new Set(parts)].sort().join("|");
}
export const songKeyOf = (title, artist) => `${textKey(title)}|${artistKeyOf(artist)}`;

// an.thien@vieent.vn -> a**n@**.vn
export function maskEmail(e) {
  const [local = "", domain = ""] = String(e || "").trim().split("@");
  if (!local || !domain) return "***";
  const lm = local.length <= 2 ? local[0] + "**" : local[0] + "**" + local.slice(-1);
  return `${lm}@**.${domain.split(".").pop()}`;
}

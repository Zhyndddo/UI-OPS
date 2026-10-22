// Round 548 — accounts that see the new layout pieces BEFORE they go global.
// Everyone else sees the app exactly as before. To roll a piece out to
// everyone, remove its isUiTester() check (listed in doc548.md); to move the
// test to another person, edit this one list. Matching is on the REAL signed-in
// profile (not "view as"), case-insensitive.
export const UI_TESTER_EMAILS = ["an.thien@gmail.com", "an.thien@vieent.vn"];

export function isUiTester(profile) {
  const email = (profile?.email || "").trim().toLowerCase();
  return !!email && UI_TESTER_EMAILS.includes(email);
}

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

// Round 594 — Teachers' Day (Ngày Nhà giáo Việt Nam, 20/11): shared switches + the hook every piece uses.
//   TD_ENABLED  false = completely off (nothing renders anywhere).
//   Live for every signed-in account, only 15–22 Nov (Vietnam date); it switches itself off after that (Round 613: test mode removed).
// To remove for good: delete teachersDay.js, ChalkBar.js, ThankNotes.js, TeachersDayDecor.js (+ .module.css), the two mounts
// (AppShell.js, BottomBar.js) and the [data-decor="teachers-day"] / [data-chalk] blocks at the end of app/globals.css.
export const TD_ENABLED = true;
const FROM = 1115;   // month*100+day, Vietnam date
const TO = 1122;
const BOARD = 1120;

export function vnToday() {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });   // YYYY-MM-DD
  const [y, m, d] = s.split("-").map(Number);
  return { year: y, key: m * 100 + d };
}

// -> { active, boardDay, boardOpen, year, profile }
export function useTeachersDay() {
  const { realProfile } = useAuth();
  const [t, setT] = useState({ year: 0, key: 0 });
  useEffect(() => { setT(vnToday()); }, []);
  const inWindow = t.key >= FROM && t.key <= TO;
  const active = TD_ENABLED && !!realProfile && t.year > 0 && inWindow;
  const boardDay = t.key === BOARD;
  return { active, boardDay, boardOpen: boardDay, year: t.year, profile: realProfile };
}

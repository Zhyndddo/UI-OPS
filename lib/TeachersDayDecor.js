"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useTeachersDay } from "./teachersDay";
import ChalkGame from "./ChalkGame";
import { ThankBoard, ThankCompose, ThankInbox } from "./ThankNotes";
import styles from "./TeachersDayDecor.module.css";

// Round 594 — Teachers' Day (20/11): falling daisies (hoa cúc họa mi), chalk doodles, a chalkboard greeting popup (once per person per year),
// a small dock for the thank-you notes (send / inbox / board) and, via lib/ChalkBar.js, chalk writing on the bottom bar that can be wiped.
// Who sees it and when: see lib/teachersDay.js. Everything is click-through except the dock, the pill's × and the popups; honours reduced motion.

// left %, size px, fall seconds, delay seconds, spin deg
const DAISIES = [
  [4, 22, 19, 0, 20], [10, 16, 23, 5, -25], [16, 20, 21, 9, 15], [23, 17, 25, 2, -15], [29, 22, 20, 12, 25],
  [35, 15, 24, 6, -30], [41, 20, 22, 1, 10], [47, 18, 26, 10, -20], [53, 22, 19, 4, 30], [59, 16, 23, 14, -10],
  [65, 20, 21, 3, 20], [71, 17, 25, 8, -25], [77, 22, 20, 13, 15], [83, 15, 24, 7, -15], [89, 20, 22, 11, 25], [95, 18, 26, 0, -30],
];

function Daisy({ className, style }) {
  return (
    <svg className={className} style={style} viewBox="-20 -20 40 40" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => <ellipse key={i} cx="0" cy="-11" rx="3.6" ry="8.2" fill="#fffdf4" stroke="#e9e2c8" strokeWidth="0.5" transform={`rotate(${i * 36})`} />)}
      <circle r="5.2" fill="#ffc83d" /><circle r="5.2" fill="none" stroke="#e9a11d" strokeWidth="0.7" />
    </svg>
  );
}

function ChalkDoodles() {
  const stroke = { fill: "none", stroke: "#f4efdf", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="tdChalk"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" /></filter>
      </svg>
      <svg className={styles.doodleApple} viewBox="0 0 80 80" aria-hidden="true" filter="url(#tdChalk)">
        <path {...stroke} d="M40 24 C28 14 10 22 14 44 C17 60 30 70 40 66 C50 70 63 60 66 44 C70 22 52 14 40 24 Z" />
        <path {...stroke} d="M40 24 C40 16 42 10 48 6" /><path {...stroke} d="M46 12 C54 8 60 12 62 16 C56 18 50 17 46 12 Z" />
      </svg>
      <svg className={styles.doodleStaff} viewBox="0 0 160 70" aria-hidden="true" filter="url(#tdChalk)">
        {[14, 26, 38, 50, 62].map((y) => <path key={y} {...stroke} strokeWidth="1.6" d={`M6 ${y} L154 ${y}`} />)}
        <ellipse {...stroke} cx="52" cy="50" rx="8" ry="6" /><path {...stroke} d="M60 50 L60 14" />
        <ellipse {...stroke} cx="100" cy="38" rx="8" ry="6" /><path {...stroke} d="M108 38 L108 4" /><path {...stroke} d="M60 14 L108 4" />
      </svg>
      <div className={styles.doodleGrade} aria-hidden="true">A+</div>
    </>
  );
}

export default function TeachersDayDecor() {
  const { active, isDev, boardDay, boardOpen, testMode, year, profile } = useTeachersDay();
  const [cheer, setCheer] = useState(false);
  const [pillHidden, setPillHidden] = useState(false);
  const [panel, setPanel] = useState(null);   // "compose" | "inbox" | "board" | null
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    document.documentElement.setAttribute("data-decor", "teachers-day");
    return () => { if (document.documentElement.getAttribute("data-decor") === "teachers-day") document.documentElement.removeAttribute("data-decor"); };
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    try { setPillHidden(window.sessionStorage.getItem("teachersDayPillHidden") === "1"); } catch {}
    const key = `teachersDayCheer${year}`;
    let seen = false;
    try { seen = window.localStorage.getItem(key) === "1"; if (!seen) window.localStorage.setItem(key, "1"); } catch {}
    if (!seen) { const t = setTimeout(() => setCheer(true), 800); return () => clearTimeout(t); }
    return undefined;
  }, [active, year]);

  // on 20/11 the blackboard opens by itself once per person
  useEffect(() => {
    if (!active || !boardDay) return undefined;
    const key = `teachersDayBoard${year}`;
    let seen = false;
    try { seen = window.localStorage.getItem(key) === "1"; if (!seen) window.localStorage.setItem(key, "1"); } catch {}
    if (seen) return undefined;
    const t = setTimeout(() => setPanel("board"), 2400);
    return () => clearTimeout(t);
  }, [active, boardDay, year]);

  const loadUnread = useCallback(async () => {
    const { count, error } = await supabase.from("thank_notes").select("id", { count: "exact", head: true }).is("read_at", null);
    if (!error) setUnread(count || 0);
  }, []);
  useEffect(() => { if (active) loadUnread(); }, [active, loadUnread]);

  if (!active) return null;
  const hidePill = () => { setPillHidden(true); try { window.sessionStorage.setItem("teachersDayPillHidden", "1"); } catch {} };

  return (
    <>
      {cheer && (
        <div className={styles.panelBackdrop} onClick={() => setCheer(false)} role="dialog" aria-modal="true" aria-label="Chúc mừng Ngày Nhà giáo Việt Nam">
          <div className={styles.board} onClick={(e) => e.stopPropagation()}>
            {DAISIES.slice(0, 8).map(([x, size, , delay, rot], i) => <Daisy key={i} className={styles.cheerDaisy} style={{ left: `${(x * 7) % 96}%`, width: size, height: size, animationDelay: `-${delay}s`, "--rot": `${rot}deg` }} />)}
            <div className={styles.cheerWrite}>Tri ân thầy cô</div>
            <div className={styles.cheerSub}>Chúc mừng Ngày Nhà giáo Việt Nam 20/11</div>
            <div className={styles.cheerText}>Cảm ơn những người đã dạy, dẫn dắt và đồng hành cùng chúng ta ✿</div>
            <div className={styles.boardActions} style={{ justifyContent: "center" }}>
              <button type="button" className={styles.chalkBtn} onClick={() => { setCheer(false); setPanel("compose"); }}>✎ Gửi lời cảm ơn</button>
              <button type="button" className={styles.linkBtn} onClick={() => setCheer(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
      {panel === "compose" && <ThankCompose profile={profile} testMode={testMode} onClose={() => setPanel(null)} onSent={loadUnread} />}
      {panel === "inbox" && <ThankInbox onClose={() => setPanel(null)} onRead={loadUnread} />}
      {panel === "board" && <ThankBoard onClose={() => setPanel(null)} isDev={isDev} boardDay={boardDay} />}

      <ChalkGame />
      <div className={styles.layer} aria-hidden="true">
        {DAISIES.map(([x, size, dur, delay, rot], i) => (
          <Daisy key={i} className={styles.daisy} style={{ left: `${x}%`, width: size, height: size, animationDuration: `${dur + 6}s`, animationDelay: `-${delay * 2}s`, "--rot": `${rot}deg` }} />
        ))}
        <ChalkDoodles />
      </div>
      <div className={styles.topLine} aria-hidden="true" />
      {!pillHidden && (
        <div className={styles.pill} role="status">
          <span>🌼</span><span>Chúc mừng Ngày Nhà giáo Việt Nam 20/11</span><span>🌼</span>
          <button type="button" className={styles.pillClose} onClick={hidePill} aria-label="Ẩn lời chúc">×</button>
        </div>
      )}
      <div className={styles.dock}>
        <button type="button" className={styles.dockBtn} onClick={() => setPanel("compose")}>✎ Gửi cảm ơn</button>
        <button type="button" className={styles.dockBtn} onClick={() => setPanel("inbox")}>💌 Hộp thư{unread ? <span className={styles.dockBadge}>{unread}</span> : null}</button>
        {boardOpen && <button type="button" className={styles.dockBtn} onClick={() => setPanel("board")}>🌼 Bảng tri ân{!boardDay ? " (thử)" : ""}</button>}
      </div>
    </>
  );
}

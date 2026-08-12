// ============================================================================
// Round 85 — TEMPORARY, short-lived feature. Per explicit request: "live
// there for a while for report out and delete in about 3-4 big fix... a
// shortlive function that will be delete from the database as well to
// save space." See DATA_FIXES.md's "Round 85" entry for the exact
// teardown checklist (files to delete + drop-round85-team-building-survey.sql)
// once this has served its purpose. Do NOT build other features on top of
// this — it's meant to come out cleanly, not grow dependents.
// ============================================================================
//
// Content transcribed verbatim from the delivered "khảo sát team
// building.xlsx" (Sheet1). 3 parts: General (9 rating questions),
// Destinations (9 rating questions under their own section label), and
// Style (1 single-choice question, a-e options, different answer pool
// from the 1-10 rating scale used everywhere else).

export const RATING_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const SURVEY_TITLE = "Bảng Khảo Sát Nhanh Chuyến Đi Chơi";

export const GENERAL_QUESTIONS = [
  { key: "g1", label: "1. Bạn có thích trekking rừng (tổng quãng đường 2,1km, đường mòn kết hợp cầu thang đá)" },
  { key: "g2", label: "2. Bạn có thích đi đến các điểm du lịch tâm linh (KDL núi Tà Cú)" },
  { key: "g3", label: "3. Bạn có thích di chuyển bằng cáp treo tham quan" },
  { key: "g4", label: "4. Bạn có thích tắm biển không (thời gian trên 3 tiếng)" },
  { key: "g5", label: "5. Bạn có thích tắm biển không (thời gian từ 1-2 tiếng)" },
  { key: "g6", label: "6. Bạn có thích cắm trại bờ biển không (không qua đêm trên bờ biển)" },
  { key: "g7", label: "7. Bạn có thích trượt cát, vui chơi, chụp hình tại đồi cát (Bàu Trắng)" },
  { key: "g8", label: "8. Bạn có thích đến các vùng đảo còn hoang sơ (Hòn Rơm, Hòn Ghềnh)" },
  { key: "g9", label: "9. Bạn có thích hoạt động lặn ngắm san hô (hòn Ghềnh)" },
];

export const DESTINATION_SECTION_LABEL = "Một số điểm đến có thể nằm trên đường tham quan:";

export const DESTINATION_QUESTIONS = [
  { key: "d1", label: "Trường Dục Thanh" },
  { key: "d2", label: "Dinh Vạn Thuỷ Tú" },
  { key: "d3", label: "Tháp Poshanư" },
  { key: "d4", label: "Dông Mũi Né" },
  { key: "d5", label: "Gỏi cua thanh long – Đặc sản Mũi Né độc đáo" },
  { key: "d6", label: "Lẩu thả" },
  { key: "d7", label: "Gỏi cá mai" },
  { key: "d8", label: "Chả lụi" },
  { key: "d9", label: "Hải sản Đêm (tự túc chi phí)" },
];

// Single-choice — a different answer pool from the 1-10 rating scale used
// by every question above, per explicit clarification.
export const STYLE_QUESTION = {
  key: "style",
  label: "Chương trình Team Building",
  options: [
    { value: "a", label: "a. chạy trạm" },
    { value: "b", label: "b. chơi game vận động tập trung" },
    { value: "c", label: "c. một số hoạt động trí não và vận động nhẹ" },
    { value: "d", label: "d. không thích chơi vận động lắm" },
    { value: "e", label: "e. cho em nghỉ dưỡng một hôm đi sếp" },
  ],
};

// All rating questions in one flat list, for the report tab's aggregation
// loop (General + Destinations share the same 1-10 scale/shape).
export const ALL_RATING_QUESTIONS = [...GENERAL_QUESTIONS, ...DESTINATION_QUESTIONS];

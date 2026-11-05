// Round 587 — pre-training survey ("Khảo sát chuẩn bị buổi học AI / Claude"). One source of truth for the form, the server check and the results page.
// type: "single" (pick one) | "multi" (pick several; `exclusive` options clear the others) | "scale" (1-5) | "text" (long answer)
// other: true  = the question also has a free "Khác" box.
export const SURVEY_TITLE = "Khảo sát chuẩn bị buổi học: dùng AI (Claude) trong công việc";
export const SURVEY_INTRO = "Khoảng 5 phút. Câu trả lời giúp ban tổ chức thiết kế buổi học đúng với việc thật của bạn. Bạn có thể quay lại sửa câu trả lời bất cứ lúc nào.";
export const SURVEY_SEEN_BY = "Câu trả lời được ban tổ chức buổi đào tạo xem, kèm tên của bạn.";

export const SECTIONS = [
  { id: "A", title: "A. Thông tin chung", questions: [
    { id: "q1", type: "single", text: "Bộ phận của bạn?", options: ["Phân phối/Ops", "Royalty/Kế toán", "YouTube/Content ID", "A&R", "Marketing/Social", "Pháp lý/Bản quyền", "Thiết kế/Video"] },
    { id: "q2", type: "single", text: "Bạn có mang laptop đến buổi học được không?", options: ["Có", "Không", "Chưa chắc"] },
  ] },
  { id: "B", title: "B. Mức độ hiện tại", questions: [
    { id: "q3", type: "multi", text: "Bạn đã dùng AI nào?", options: ["Claude", "ChatGPT", "Gemini", "Copilot", { label: "Chưa dùng", exclusive: true }], other: true },
    { id: "q4", type: "single", text: "Bạn đã dùng Claude chưa?", options: ["Chưa có tài khoản", "Có nhưng ít dùng", "Dùng thường xuyên"] },
    { id: "q5", type: "multi", text: "Bạn từng dùng tính năng nào của Claude?", options: ["Chỉ chat hỏi đáp", "Upload file PDF/Excel", "Projects", "Tạo tài liệu/bảng tính", "Tìm kiếm web", { label: "Chưa dùng tính năng nào", exclusive: true }] },
    { id: "q6", type: "scale", text: "Bạn tự đánh giá từ 1 đến 5", low: "1 = chưa biết bắt đầu", high: "5 = dùng AI hằng ngày cho nhiều việc" },
    { id: "q7", type: "multi", text: "Khi dùng AI, bạn hay gặp vấn đề gì?", options: ["Trả lời chung chung", "Sai thông tin", "Phải hỏi lại nhiều lần", "Không biết hỏi thế nào", "Kết quả không dùng ngay được"], other: true },
  ] },
  { id: "C", title: "C. Công việc thật (quan trọng nhất)", questions: [
    { id: "q8", type: "text", text: "3 việc chiếm nhiều thời gian nhất trong tuần của bạn là gì?" },
    { id: "q9", type: "text", text: "Việc nào lặp lại thường xuyên mà bạn muốn làm nhanh hơn?" },
    { id: "q10", type: "multi", text: "Bạn làm việc nhiều với loại file nào?", options: ["Email", "Excel/CSV", "Hợp đồng PDF/Word", "Metadata", "Nội dung social", "Tài liệu tiếng Anh"], other: true },
    { id: "q11", type: "multi", text: "Bạn muốn Claude giúp việc gì nhất?", options: ["Email tiếng Anh", "Xử lý Excel/royalty", "Đọc hợp đồng", "Viết nội dung", "Làm báo cáo/slide", "Nghiên cứu"], other: true },
  ] },
  { id: "D", title: "D. Lo ngại", questions: [
    { id: "q12", type: "multi", text: "Bạn có lo ngại gì khi dùng AI trong công việc?", options: ["Bảo mật dữ liệu", "Sợ sai", "Sợ bị thay thế", { label: "Không", exclusive: true }], other: true },
    { id: "q13", type: "single", text: "Bạn có biết dữ liệu nào không nên đưa lên AI không?", options: ["Có", "Không chắc", "Không"] },
  ] },
  { id: "E", title: "E. Chuẩn bị cho buổi học", questions: [
    { id: "q14", type: "text", text: "Hãy mang theo 1 việc thật bạn đang làm. Mô tả ngắn: đó là việc gì, đầu vào là gì, kết quả bạn cần là gì?" },
    { id: "q15", type: "text", text: "Sau buổi học, bạn muốn tự làm được điều gì?" },
  ] },
];

export const QUESTIONS = SECTIONS.flatMap((s) => s.questions.map((q) => ({ ...q, section: s.id })));
export const optLabel = (o) => (typeof o === "string" ? o : o.label);
export const optList = (q) => (q.options || []).map(optLabel);

// Server-side check + clean-up of a submitted answer set. Returns { ok, answers } or { ok:false, error }.
// answers shape: { q1: "Phân phối/Ops", q3: { picks: ["Claude"], other: "…" }, q6: 4, q8: "…" }
export function cleanAnswers(raw) {
  const out = {};
  const src = raw && typeof raw === "object" ? raw : {};
  for (const q of QUESTIONS) {
    const v = src[q.id];
    if (q.type === "single") {
      if (typeof v !== "string" || !optList(q).includes(v)) return { ok: false, error: `Chưa trả lời: ${q.text}` };
      out[q.id] = v;
    } else if (q.type === "multi") {
      const picks = Array.isArray(v?.picks) ? v.picks.filter((x) => typeof x === "string" && optList(q).includes(x)) : [];
      const other = q.other && typeof v?.other === "string" ? v.other.trim().slice(0, 300) : "";
      if (!picks.length && !other) return { ok: false, error: `Chưa trả lời: ${q.text}` };
      out[q.id] = { picks: Array.from(new Set(picks)), other };
    } else if (q.type === "scale") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: `Chưa trả lời: ${q.text}` };
      out[q.id] = n;
    } else {
      const t = typeof v === "string" ? v.trim().slice(0, 2000) : "";
      if (!t) return { ok: false, error: `Chưa trả lời: ${q.text}` };
      out[q.id] = t;
    }
  }
  return { ok: true, answers: out };
}

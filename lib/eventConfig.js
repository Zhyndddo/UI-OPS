// Round 574 — Event check-in (register -> QR by email -> scan at the door). Everything that changes per event is here.
export const EVENT = {
  title: "Hội nghị Giới thiệu hoạt động Trung tâm Quản lý và Khai thác Bản ghi Việt Nam",
  when: "Thứ Hai, 09.11.2026 · 09:00 – 12:00",
  where: "Lầu 3 – Tòa nhà Friendship Tower, 31 Lê Duẩn, P. Sài Gòn, TP. Hồ Chí Minh",
  host: "Hiệp hội Công nghiệp Ghi âm Việt Nam (RIAV)",
  note: "Vui lòng đưa mã QR này cho nhân viên tiếp đón khi đến dự.",
};
// The QR contains this prefix + a random token. The door page refuses anything that does not look like this.
export const QR_PREFIX = "EVT1.";
export const TOKEN_RE = /^EVT1\.[A-Za-z0-9_-]{22}$/;

const plain = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
function wantsMyTasks(text) {
  const t = plain(text).replace(/@\w+/g, " ");
  const me = /\b(toi|minh|em|anh|chi|my|me|mine)\b/.test(t);
  if (/\b(ai|nguoi nao|who)\b.{0,25}\b(tag|nhac|goi|mention)\b/.test(t) && me) return true;
  if (/\b(inbox|hop thu)\b/.test(t) && me) return true;
  return /\b(viec|task|tasks|ticket|tickets)\b/.test(t) && me && /(tom tat|tong hop|sum ?up|summary|liet ke|danh sach|list|co gi|nao|what|show|xem|check|con)/.test(t);
}


const vnShort = (iso) => new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(5, 16).replace("T", " ").split(" ").map((x, i) => (i ? x : x.split("-").reverse().join("/"))).join(" ");

for (const t of ["@friday tóm tắt việc của tôi","Friday ơi sum up task của mình đi","ai tag mình vậy","check inbox của em","/mytasks","hôm nay ăn gì","tôi có task nào","tạo ticket cho mình","danh sách việc của anh"]) console.log(wantsMyTasks(t), t);
console.log(vnShort("2026-11-18T03:05:00Z"));

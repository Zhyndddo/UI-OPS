const BULLET = /^\s*(?:[-•*·–—]|\d+[.)])\s*/;
export function titleList(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;
  const bulleted = lines.filter((l) => BULLET.test(l));
  const items = (bulleted.length >= 2 ? bulleted : lines.slice(1)).map((l) => l.replace(BULLET, "").trim()).filter(Boolean);
  return items.length >= 2 ? items.slice(0, 20) : null;
}

console.log(titleList("cho tôi release date của các bài này \n- Không muốn thể hiện\n- em đã yêu anh quá nhiều \n- Gặp anh giữa luân hồi \n- Chào con \n- Tại sao?"));
console.log(titleList("tuần này phát hành gì"));

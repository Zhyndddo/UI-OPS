
const norm=(x)=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const allReleases=async()=>[{title:'Chào con'},{title:'Tại sao?'}];
const BULLET = /^\s*(?:[-•*·–—]|\d+[.)])\s*/;
const REQ_WORDS = /\b(release|phat hanh|ngay|date|pic|phu trach|thieu|missing|tinh trang|trang thai|status|ai la|ai lam|check|kiem tra|cho (?:toi|minh|em|anh|chi)|giup|hoi|cac bai|bai nay|nhung bai|danh sach)\b/;
const dmyFull = (iso) => (iso ? iso.split("-").reverse().join("/") : "chưa có ngày");

async function splitBatch(db, text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(BULLET, "").trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const all = await allReleases(db);
  const titles = new Set(all.map((r) => norm(r.title)));
  const firstIsSong = titles.has(norm(lines[0]));
  const request = !firstIsSong && (REQ_WORDS.test(` ${norm(lines[0])} `) || lines.length >= 3) ? lines[0] : "";
  const items = (request ? lines.slice(1) : lines).slice(0, 20);
  if (items.length < 2 && !(request && items.length >= 1 && REQ_WORDS.test(` ${norm(request)} `) && lines.length >= 3)) return null;
  return { request, items, all };
}


const db={};
const show=async(t)=>{const r=await splitBatch(db,t);console.log(r?{request:r.request,items:r.items}:null)};
await show("cho tôi release date của các bài này\nKhông muốn thể hiện\nChào con\nTại sao?");
await show("PIC\nChào con\nTại sao?");
await show("Chào con\nTại sao?\nGặp anh");
await show("thiếu gì\nChào con");
await show("tình trạng\nBài A\nBài B\n");
await show("hello\nworld");

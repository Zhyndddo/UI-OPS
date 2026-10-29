// Round 566 — "is this drawing a pumpkin face?" Rule based, no image analysis: strokes are grouped into shapes
// (strokes whose boxes touch/overlap belong together, so a triangle drawn with 3 lines is ONE eye) and the shapes
// must look like two eyes (upper part, one left + one right) and a mouth (lower part, wide). It cannot judge art,
// only that a real attempt at a lantern face was made. Canvas logical size is W x H.
export const FACE_W = 320;
export const FACE_H = 280;

const bbox = (pts) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
};
const pathLen = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return l; };
const touch = (a, b, gap) => a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1;

export function checkPumpkinFace(strokes, W = FACE_W, H = FACE_H) {
  const real = (strokes || []).filter((s) => s && s.length >= 2 && pathLen(s) >= 8);
  if (real.length < 3) return { ok: false, hint: "Vẽ 2 mắt và 1 miệng nhé (cần ít nhất 3 nét)." };
  if (real.length > 60) return { ok: false, hint: "Nhiều nét quá — bấm Xoá và vẽ gọn lại." };
  // group touching strokes into shapes
  const boxes = real.map((s) => bbox(s));
  const parent = real.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (touch(boxes[i], boxes[j], 8)) parent[find(i)] = find(j);
  const groups = new Map();
  real.forEach((s, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(...s); });
  const shapes = [...groups.values()].map((pts) => { const b = bbox(pts); return { ...b, w: b.x1 - b.x0, h: b.y1 - b.y0, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 }; });
  if (shapes.length > 12) return { ok: false, hint: "Nhiều nét quá — bấm Xoá và vẽ gọn lại." };

  const eyes = shapes.filter((s) => s.cy < H * 0.54 && s.w <= W * 0.36 && s.h <= H * 0.38 && (s.w >= 8 || s.h >= 8) && s.cx > W * 0.1 && s.cx < W * 0.9);
  const mouths = shapes.filter((s) => s.cy > H * 0.52 && s.w >= W * 0.2 && s.h <= H * 0.5 && s.cx > W * 0.25 && s.cx < W * 0.75);
  const left = eyes.filter((s) => s.cx < W * 0.5).sort((a, b) => a.cx - b.cx)[0];
  const right = eyes.filter((s) => s.cx >= W * 0.5).sort((a, b) => b.cx - a.cx)[0];
  if (!left || !right || right.cx - left.cx < W * 0.2) return { ok: false, hint: "Cần 2 mắt ở nửa trên, một bên trái và một bên phải." };
  if (!mouths.length) return { ok: false, hint: "Cần 1 cái miệng rộng ở nửa dưới." };
  return { ok: true, eyes: 2, mouth: 1 };
}

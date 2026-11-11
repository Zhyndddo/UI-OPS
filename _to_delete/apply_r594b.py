#!/usr/bin/env python3
# Round 594b — wires the "Bôi bảng sạch hơn nhé" game into ChalkBar.js and TeachersDayDecor.js.
# Run from the repo root (UI-OPS) AFTER copying ChalkGame.js into lib/:   python3 apply_r594b.py
# Every anchor is asserted first; if anything does not match, nothing is written.
import re, sys

def patch(path, pairs):
    s = open(path, encoding="utf-8").read()
    for a, b in pairs:
        if s.count(a) != 1:
            sys.exit(f"STOP: anchor not found exactly once in {path}: {a[:70]!r} (found {s.count(a)})")
    for a, b in pairs:
        s = s.replace(a, b)
    open(path, "w", encoding="utf-8").write(s)
    print("patched", path)

patch("lib/ChalkBar.js", [
    ("let w = 1, h = 1, dpr = 1, last = null, timer = null, lastWipe = 0;",
     "let w = 1, h = 1, dpr = 1, last = null, timer = null, lastWipe = 0;\n"
     "    // Round 594b — coverage grid: when ~85% of the bar has been wiped, tell ChalkGame (\"chalk-cleared\")\n"
     "    const GC = 40, GR = 3;\n"
     "    let grid = new Uint8Array(GC * GR), coolUntil = 0;"),
    ("      mctx.clearRect(0, 0, mask.width, mask.height);\n      render();\n    }\n    function tick()",
     "      mctx.clearRect(0, 0, mask.width, mask.height);\n      grid = new Uint8Array(GC * GR);\n      render();\n    }\n    function tick()"),
    ("clearInterval(timer); timer = null; }",
     "clearInterval(timer); timer = null; grid = new Uint8Array(GC * GR); }"),
    ("      last = { x, y };\n      lastWipe = Date.now();",
     "      {\n"
     "        const a = last || { x, y }, cw = w / GC, chh = h / GR, rad = ERASER / 2 + 4;\n"
     "        const steps = Math.max(1, Math.ceil(Math.hypot(x - a.x, y - a.y) / 8));\n"
     "        for (let i = 0; i <= steps; i++) {\n"
     "          const px = a.x + ((x - a.x) * i) / steps, py = a.y + ((y - a.y) * i) / steps;\n"
     "          for (let gy = 0; gy < GR; gy++) for (let gx = 0; gx < GC; gx++) {\n"
     "            if (Math.hypot((gx + 0.5) * cw - px, (gy + 0.5) * chh - py) <= rad + cw / 2) grid[gy * GC + gx] = 1;\n"
     "          }\n"
     "        }\n"
     "        let n = 0; for (let i = 0; i < grid.length; i++) n += grid[i];\n"
     "        if (n / grid.length >= 0.85 && Date.now() > coolUntil) {\n"
     "          coolUntil = Date.now() + 6000; grid = new Uint8Array(GC * GR);\n"
     "          window.dispatchEvent(new CustomEvent(\"chalk-cleared\"));\n"
     "        }\n"
     "      }\n"
     "      last = { x, y };\n      lastWipe = Date.now();"),
])

s = open("lib/TeachersDayDecor.js", encoding="utf-8").read()
m = re.search(r'^import [^\n]*"\./teachersDay";\n', s, re.M)
if not m:
    sys.exit('STOP: cannot find the import of "./teachersDay" in lib/TeachersDayDecor.js')
anchor = '      <div className={styles.layer} aria-hidden="true">'
if s.count(anchor) != 1:
    sys.exit("STOP: layer anchor not found once in lib/TeachersDayDecor.js")
if "ChalkGame" in s:
    sys.exit("TeachersDayDecor.js already mentions ChalkGame — nothing changed")
s = s[:m.end()] + 'import ChalkGame from "./ChalkGame";\n' + s[m.end():]
s = s.replace(anchor, "      <ChalkGame />\n" + anchor)
open("lib/TeachersDayDecor.js", "w", encoding="utf-8").write(s)
print("patched lib/TeachersDayDecor.js")

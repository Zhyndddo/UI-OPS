// Round 622 — Hit Makers sound effects, synthesised with the Web Audio API (no sound files to host). Muted state is remembered in the browser.
let ctx = null;
let muted = false;
try { muted = typeof localStorage !== "undefined" && localStorage.getItem("hm_muted") === "1"; } catch (e) { muted = false; }

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) { try { const C = window.AudioContext || window.webkitAudioContext; ctx = C ? new C() : null; } catch (e) { ctx = null; } }
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}
function tone(freq, dur, type = "sine", vol = 0.12, when = 0, slideTo = null) {
  const c = ac(); if (!c || muted) return;
  const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.1, when = 0, centre = 2200) {
  const c = ac(); if (!c || muted) return;
  const len = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = centre; f.Q.value = 0.9;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(c.destination); src.start(c.currentTime + when);
}

export const sfx = {
  isMuted: () => muted,
  setMuted(v) { muted = !!v; try { localStorage.setItem("hm_muted", muted ? "1" : "0"); } catch (e) { /* ignore */ } },
  unlock() { ac(); },
  rattle() { noise(0.05, 0.1, 0, 1500 + Math.random() * 1500); tone(180 + Math.random() * 120, 0.04, "square", 0.03); },
  land() { tone(150, 0.16, "sine", 0.3, 0, 60); noise(0.08, 0.14, 0, 900); tone(90, 0.12, "sine", 0.2, 0.09, 50); },
  hop() { tone(520 + Math.random() * 60, 0.07, "triangle", 0.12, 0, 760); },
  zip() { tone(260, 0.28, "sawtooth", 0.07, 0, 1500); noise(0.25, 0.06, 0, 3200); },
  coin() { tone(880, 0.08, "square", 0.07); tone(1320, 0.14, "square", 0.07, 0.07); },
  buy() { tone(523, 0.09, "triangle", 0.12); tone(659, 0.09, "triangle", 0.12, 0.09); tone(784, 0.16, "triangle", 0.12, 0.18); },
  jail() { tone(120, 0.4, "sawtooth", 0.16, 0, 45); noise(0.2, 0.12, 0.02, 500); },
  turn() { tone(660, 0.14, "sine", 0.14); tone(990, 0.22, "sine", 0.14, 0.12); },
  card() { noise(0.14, 0.1, 0, 3200); tone(300, 0.12, "triangle", 0.1, 0.04, 760); tone(990, 0.16, "sine", 0.08, 0.14); },
  year() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", 0.11, i * 0.09)); },
};

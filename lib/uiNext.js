// Round 531 — "UI Next" relayout, piece 1. Everything new is OFF by default and
// only applies when <html data-ui="next"> is set, so shipping it changes nothing
// for anyone until they opt in: open any page with ?uinext=1 (saved in this
// browser), ?uinext=0 to switch off, or use the toggle on /ui-lab.
export const UIX_FLAG_KEY = "uiNext";
export const UIX_DENSITY_KEY = "uiNextDensity";
export const DENSITIES = ["compact", "normal", "comfortable"];

export function readUiNext() {
  try { return window.localStorage.getItem(UIX_FLAG_KEY) === "1"; } catch { return false; }
}
export function readDensity() {
  try { const d = window.localStorage.getItem(UIX_DENSITY_KEY); return DENSITIES.includes(d) ? d : "normal"; } catch { return "normal"; }
}
export function setUiNext(on) {
  try { window.localStorage.setItem(UIX_FLAG_KEY, on ? "1" : "0"); } catch {}
  window.dispatchEvent(new Event("uix-change"));
}
export function setDensity(d) {
  try { window.localStorage.setItem(UIX_DENSITY_KEY, d); } catch {}
  window.dispatchEvent(new Event("uix-change"));
}

// Promise-based confirm dialog. With UI Next on it shows the styled dialog;
// with it off it is exactly window.confirm, so adopting it anywhere is safe.
// uiConfirm({ title, message, confirmLabel, cancelLabel, tone: "danger"|"normal" }) -> Promise<boolean>
export function uiConfirm(opts = {}) {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (document.documentElement.getAttribute("data-ui") !== "next") {
    return Promise.resolve(window.confirm([opts.title, opts.message].filter(Boolean).join("\n\n")));
  }
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent("uix-confirm", { detail: { ...opts, resolve } }));
  });
}

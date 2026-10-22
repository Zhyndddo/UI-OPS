// Round 549 — layout preference for the corner section switcher (lib/SectionSwitcher.js).
// "auto" = one horizontal row when every banner fits, otherwise a vertical stack;
// "horizontal" / "vertical" force one. Phones always get the vertical stack.
// Stored per browser, like the theme; changed from the topbar's Settings panel.
export const SWITCHER_LAYOUTS = [
  { value: "auto", label: "Auto" },
  { value: "horizontal", label: "Row" },
  { value: "vertical", label: "Column" },
];
const KEY = "switcherLayout";

export function readSwitcherLayout() {
  try {
    const v = window.localStorage.getItem(KEY);
    return SWITCHER_LAYOUTS.some((o) => o.value === v) ? v : "auto";
  } catch { return "auto"; }
}
export function setSwitcherLayout(v) {
  try { window.localStorage.setItem(KEY, v); } catch {}
  window.dispatchEvent(new Event("switcher-layout-change"));
}

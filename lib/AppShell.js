"use client";

import Sidebar, { SIDEBAR_WIDTH } from "./Sidebar";

// Wraps internal (staff-facing) pages with the sidebar. Deliberately NOT
// applied at the root layout level — the magic-link picker page
// (/pick-package/[token]) is for external artists and must never show
// internal navigation, so it simply never imports this.
export default function AppShell({ children }) {
  return (
    <>
      <Sidebar />
      <div style={{ marginLeft: SIDEBAR_WIDTH, minHeight: "100vh" }}>{children}</div>
    </>
  );
}

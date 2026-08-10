"use client";
import AppShell from "../../../lib/AppShell";
import PhuLucStyleTicketList from "../../../lib/PhuLucStyleTicketList";
export default function Page() {
  return (
    <AppShell>
      {/* Round 81 item 5 — Giá Trị PL (Publishing) removed from just this
          list per explicit request; Phụ Lục MG keeps its own column
          untouched (hideGiaTri defaults to false there). */}
      <PhuLucStyleTicketList typeKey="phu_luc_publishing" basePath="/tickets/phu-luc-publishing" title="Phụ Lục Publishing" differentiator="Publishing" hideGiaTri />
    </AppShell>
  );
}

"use client";
import AppShell from "../../../lib/AppShell";
import PhuLucStyleTicketList from "../../../lib/PhuLucStyleTicketList";
export default function Page() {
  return (
    <AppShell>
      <PhuLucStyleTicketList typeKey="phu_luc_mg" basePath="/tickets/phu-luc-mg" title="Phụ Lục MG" differentiator="MG" />
    </AppShell>
  );
}

"use client";
import AppShell from "../../../lib/AppShell";
import PhuLucStyleTicketList from "../../../lib/PhuLucStyleTicketList";
export default function Page() {
  return (
    <AppShell>
      <PhuLucStyleTicketList typeKey="phu_luc_publishing" basePath="/tickets/phu-luc-publishing" title="Phụ Lục Publishing" differentiator="Publishing" />
    </AppShell>
  );
}

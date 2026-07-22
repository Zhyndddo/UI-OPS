"use client";
import AppShell from "../../../lib/AppShell";
import TicketListPage from "../../../lib/TicketListPage";
export default function Page() {
  return <AppShell><TicketListPage typeKey="stream_update" basePath="/tickets/stream-update" /></AppShell>;
}

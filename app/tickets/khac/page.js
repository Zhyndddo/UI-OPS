"use client";
import AppShell from "../../../lib/AppShell";
import TicketListPage from "../../../lib/TicketListPage";
export default function Page() {
  return <AppShell><TicketListPage typeKey="khac" basePath="/tickets/khac" /></AppShell>;
}

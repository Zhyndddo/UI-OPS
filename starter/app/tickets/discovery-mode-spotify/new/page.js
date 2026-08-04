"use client";
import AppShell from "../../../../lib/AppShell";
import NewTicketPage from "../../../../lib/NewTicketPage";
export default function Page() {
  return <AppShell><NewTicketPage typeKey="discovery_mode_spotify" basePath="/tickets/discovery-mode-spotify" /></AppShell>;
}

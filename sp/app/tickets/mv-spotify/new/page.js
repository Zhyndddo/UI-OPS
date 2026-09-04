"use client";
import AppShell from "../../../../lib/AppShell";
import NewTicketPage from "../../../../lib/NewTicketPage";
export default function Page() {
  return <AppShell><NewTicketPage typeKey="mv_spotify" basePath="/tickets/mv-spotify" /></AppShell>;
}

"use client";
import AppShell from "../../../../lib/AppShell";
import NewTicketPage from "../../../../lib/NewTicketPage";
export default function Page() {
  return <AppShell><NewTicketPage typeKey="report_conflict" basePath="/tickets/report-conflict" /></AppShell>;
}

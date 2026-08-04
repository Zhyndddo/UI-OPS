"use client";
import AppShell from "../../../../lib/AppShell";
import NewTicketPage from "../../../../lib/NewTicketPage";
export default function Page() {
  return <AppShell><NewTicketPage typeKey="sony_publish" basePath="/tickets/sony-publish" /></AppShell>;
}

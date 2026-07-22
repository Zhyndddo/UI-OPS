"use client";
import AppShell from "../../../lib/AppShell";
import TicketListPage from "../../../lib/TicketListPage";
export default function Page() {
  return <AppShell><TicketListPage typeKey="media_booking" basePath="/tickets/media-booking" /></AppShell>;
}

"use client";
import AppShell from "../../../lib/AppShell";
import TicketListPage from "../../../lib/TicketListPage";
export default function Page() {
  return <AppShell><TicketListPage typeKey="booking_not_in_package" basePath="/tickets/booking-not-in-package" /></AppShell>;
}

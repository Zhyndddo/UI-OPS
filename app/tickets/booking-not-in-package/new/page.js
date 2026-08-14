"use client";
import AppShell from "../../../../lib/AppShell";
import NewTicketPage from "../../../../lib/NewTicketPage";
export default function Page() {
  return <AppShell><NewTicketPage typeKey="booking_not_in_package" basePath="/tickets/booking-not-in-package" /></AppShell>;
}

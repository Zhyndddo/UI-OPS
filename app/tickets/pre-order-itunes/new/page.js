"use client";
import AppShell from "../../../../lib/AppShell";
import NewTicketPage from "../../../../lib/NewTicketPage";
export default function Page() {
  return <AppShell><NewTicketPage typeKey="pre_order_itunes" basePath="/tickets/pre-order-itunes" /></AppShell>;
}

"use client";
import AppShell from "../../../lib/AppShell";
import TicketListPage from "../../../lib/TicketListPage";
export default function Page() {
  return <AppShell><TicketListPage typeKey="pre_order_itunes" basePath="/tickets/pre-order-itunes" /></AppShell>;
}

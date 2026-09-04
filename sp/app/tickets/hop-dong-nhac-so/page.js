"use client";
import AppShell from "../../../lib/AppShell";
import TicketListPage from "../../../lib/TicketListPage";

// Round 146 follow-up — item 1: external tool link to the team's
// "information list" spreadsheet, shown at the top of this ticket's list
// next to "+ New Ticket" (see TicketListPage's optional externalLink prop).
const INFO_LIST_URL = "https://docs.google.com/spreadsheets/d/1QyqZlB2c-7rs6irQQjAUyNcd8F3x43vly6ay8Xmgxns?resourcekey=&usp=forms_web_b&urp=linked#gid=415829846";

export default function Page() {
  return (
    <AppShell>
      <TicketListPage
        typeKey="hop_dong_nhac_so"
        basePath="/tickets/hop-dong-nhac-so"
        externalLink={{ label: "Information List", url: INFO_LIST_URL }}
      />
    </AppShell>
  );
}

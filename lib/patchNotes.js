// Round 553 — the "📌 Patch notes" page in the chat. Updated by the dev team each round/patch
// (newest first). Plain text only. `date` is optional.
export const PATCH_NOTES = [
  {
    round: "553", date: "23 Oct 2026", title: "Chat: patch notes, faster tagging",
    items: [
      "Patch notes page (this one) replaces the old “How this chat works” channel; the legends stay pinned at the top.",
      "Tagging with # and @ is faster: people load once and are filtered instantly, release searches are remembered, and a “Searching…” line shows while loading.",
      "Messages show a loading shimmer while a channel opens.",
      "Fixed Enter sending twice on Mac when typing with Vietnamese input (the Enter that confirms a word no longer sends).",
      "Sandbox channel removed.",
    ],
  },
  {
    round: "552", date: "23 Oct 2026", title: "Chat for everyone + Helper bot",
    items: [
      "Chat is open to all staff, with topic channels UPLOAD, SMARTLINK, CONFIRM and PITCHING.",
      "Legends: # release card, @ mention (rings the bell), $ how-to guide, ! urgent.",
      "@helper answers “how do I…” from the guides; if there is no guide it pings Zhyn.",
    ],
  },
  {
    round: "550", title: "Corner section switcher for everyone",
    items: ["The button under the top bar that jumps between workstations / ticket types is now on for all accounts (Settings → Section switcher: Auto / Row / Column)."],
  },
  {
    round: "549", title: "Skeleton loaders",
    items: ["Tables show a table-shaped shimmer while they load instead of plain “Loading…”."],
  },
  {
    round: "547", title: "Kho Nhạc import accepts any spreadsheet",
    items: ["The Phái Sinh / Kho Nhạc import reads any sheet, finds the header row, lets you map columns, and shows a preview before importing."],
  },
];

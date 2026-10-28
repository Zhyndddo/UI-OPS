// Round 553 — the "📌 Patch notes" page in the chat. Updated by the dev team each round/patch
// (newest first). Plain text only. `date` is optional.
export const PATCH_NOTES = [
  {
    round: "562", date: "28 Oct 2026", title: "Booking Không Gói for AR",
    items: [
      "AR can now see and create “Booking Không Trong Package”. AR is the requester; Marketing works the tickets.",
      "Release detail: switching a release to a different label (including one without the HĐ prefix) is no longer blocked. Only typing the prefix away on the same label is.",
    ],
  },
  {
    round: "560", date: "27 Oct 2026", title: "Halloween theme + faster Task Table",
    items: [
      "Halloween decoration for everyone until 1 November: orange/purple colours, falling pumpkins, a corner web, and a pumpkin you can click. It switches itself off after 1 Nov.",
      "Task Table opens instantly with the last numbers and refreshes in the background.",
    ],
  },
  {
    round: "559", date: "26 Oct 2026", title: "Direct messages, private channels, subscribe",
    items: [
      "Direct messages: “+ New message” in the left list, pick a person. Only the two of you can read it, and it always notifies you.",
      "Subscribe: every channel has a 🔔 Subscribe button top right. The number on the chat bubble and the sound only come from channels you subscribed to (plus your direct messages).",
      "Admins create and delete channels and add people. A new channel is hidden from everyone until people are added.",
      "The existing channels (UPLOAD, SMARTLINK, CONFIRM, PITCHING) stay open to everyone; they start unsubscribed.",
    ],
  },
  {
    round: "556", date: "24 Oct 2026", title: "Equipment tab",
    items: ["Tools → new “Equipment” tab with the sound-system on/off guide (view only)."],
  },
  {
    round: "555", date: "23 Oct 2026", title: "Chat mentions: bubble badge + sound, no more bell rows",
    items: [
      "When someone tags you, a red number appears on the chat bubble (and next to the channel). It clears when you open that channel.",
      "A short sound plays when a message tags you. 🔔/🔕 in the chat header mutes it.",
      "Tagging no longer adds anything to the notification panel or pops a toast.",
      "Typing @, # or $ plus one letter now shows the real options (click, or ↑ ↓ then Enter/Tab). If nothing matches, it says so.",
      "@helper with no matching guide now tags Zhyn in the chat reply instead of sending a bell ping.",
    ],
  },
  {
    round: "554", date: "23 Oct 2026", title: "Chat: clickable @names, fewer bell rows",
    items: [
      "Click an @name in a message to see who it is (and their team) and reply to them in one click.",
      "Pings are merged: while someone still has an unread chat ping for a channel, new mentions update that one bell entry (with a count) instead of adding more.",
    ],
  },
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

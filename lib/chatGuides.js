// Round 552 — chat legends, how-to guides and the Helper bot's brain. NO AI: plain lookups.
// Guides live in THIS FILE only (edited by the dev team in a round, not in the app).
// DRAFT: written from how the pages work in the code — correct anything that is off.

export const BOT_NAME = "Helper";
// Who gets the bell when the Helper has no guide for a question.
export const ESCALATE_EMAIL = "an.thien@vieent.vn";
export const ESCALATE_COOLDOWN_MS = 10 * 60 * 1000;

// @name shortcuts that are not profile names. email → resolved to a profile at send time.
export const MENTION_ALIASES = [
  { name: "zhyn", email: "an.thien@vieent.vn", hint: "Zhyn (app dev)" },
  { name: "helper", bot: true, hint: "Helper bot — ask how to do something" },
];

export const LEGENDS = [
  { sym: "#", title: "#DID — release card", text: "Type # and 1+ letter of a DID or song title, pick one, and a clickable release card (artist, date, package, locked or not) is added under your message." },
  { sym: "@", title: "@name — mention", text: "Type @ and 1+ letter: a list of real names appears — click, or use ↑ ↓ and Enter/Tab. The person gets a number on their chat bubble and a sound. @zhyn reaches the app dev. @helper asks the Helper bot." },
  { sym: "$", title: "$guide — how-to card", text: "Type $ and 1+ letter (e.g. $u, $smart) to drop a step-by-step guide card: where to click, what to enter." },
  { sym: "!", title: "! — urgent", text: "Start a message with ! to show it with a red strip so it stands out. (It does not ping anyone; use @name for that.)" },
  { sym: "↵", title: "Enter / Shift+Enter", text: "Enter sends. Shift+Enter adds a new line. Links you paste become clickable." },
  { sym: "✎", title: "Edit / delete", text: "You can edit or delete your own messages. Delete only hides it; nothing is lost from the database." },
  { sym: "🤖", title: "Ask the Helper", text: "Write @helper and your question, e.g. “@helper how do I add a smartlink”. If a guide matches it posts the card; if not, it says so and tags Zhyn." },
];

// id = the token after $ (no spaces). keywords are lower-case, no accents needed for English; add Vietnamese too.
export const GUIDES = [
  {
    id: "upload-row", title: "Fill a New Release Setup row", channel: "UPLOAD",
    keywords: ["upload", "new release", "setup", "link lbm", "link share", "upc", "apple id", "drive", "fill", "row"],
    steps: [
      "Go to the sidebar → Workstation → New Release Setup.",
      "Find the release (search box, or sort by release date). Rows due today/this week are highlighted.",
      "Fill the empty required cells: UPC, Apple ID, Link Drive, Link LBM, Link Share and Smartlink. Empty ones are marked in the table.",
      "Click out of the cell (or press Enter) to save it. Each cell saves by itself.",
      "Use the Upload Note / Linkshare Note boxes for anything the next person must know (e.g. TikTok/Facebook timing).",
      "The row counts as done when LBM + Share + Smartlink are filled (plus the pre-order link if a pre-order was requested). Use “Show done rows” to see finished ones.",
    ],
  },
  {
    id: "upload-status", title: "Pending / Cancel a release in Upload", channel: "UPLOAD",
    keywords: ["pending", "cancel", "running", "status", "upload status", "hold"],
    steps: [
      "New Release Setup → find the row.",
      "Change the upload status from Running to Pending or Cancel.",
      "Cancelled rows are counted separately and hidden with the done rows.",
    ],
  },
  {
    id: "smartlink-add", title: "Add a smartlink", channel: "SMARTLINK",
    keywords: ["smartlink", "smart link", "link", "add smartlink", "phase 2"],
    steps: [
      "Before release: Workstation → New Release Setup → the Smartlink cell of the release row. Paste the link and click out to save.",
      "After the release is live: Workstation → Re-Check → tab “Phase 2 — Smartlink”.",
      "There, check the Smartlink and URL LBM columns and use “Update Smartlink” if the link changed.",
      "Smartlink counts toward the release’s upload percentage, so an empty one keeps the row “not done”.",
    ],
  },
  {
    id: "confirm-phase1", title: "Re-Check Phase 1 (before release)", channel: "CONFIRM",
    keywords: ["confirm", "recheck", "re-check", "phase 1", "dsp", "check", "pre-release", "tag confirm"],
    steps: [
      "Sidebar → Workstation → Re-Check → tab “Phase 1: Pre-release”.",
      "For each release, tick the DSP check once all the platforms look right (Spotify, Apple, Zing, NCT, Facebook, YouTube). It only reads Yes when every one is correct.",
      "Fill URL LBM and Tag Confirm, then add a Note if anything is odd.",
      "Done rows hide; use “Show done rows” to bring them back.",
    ],
  },
  {
    id: "confirm-phase2", title: "Re-Check Phase 2 (after release)", channel: "CONFIRM",
    keywords: ["phase 2", "confirm", "recheck", "re-check", "sound", "instagram", "tiktok", "artist pick", "after release", "live"],
    steps: [
      "Re-Check → tab “Phase 2 — Smartlink”.",
      "Confirm the Smartlink and URL LBM, then use “Update Smartlink” if it changed.",
      "Mark Sound Instagram and Sound TikTok once the sound is updated, and set Artist Pick (Done / Uneditible / Skip).",
      "Leave a Note for anything the next person should know.",
    ],
  },
  {
    id: "pitching-update", title: "Update a pitching request", channel: "PITCHING",
    keywords: ["pitching", "pitch", "nct", "zing", "spotify", "priority", "co goi", "có gói", "domestic", "status"],
    steps: [
      "Sidebar → Workstation → Pitching.",
      "Find the release; the “Requested” column shows which platforms were asked for.",
      "Set each platform’s status: Chưa thực hiện → Đang thực hiện → Đã pitching (or Không thực hiện / Không hỗ trợ).",
      "For NCT and Zing, “Có gói” opens the services checklist — tick what the package includes.",
      "Add the LBM URL and a Note, and set the platform PIC if it differs from the default.",
    ],
  },
  {
    id: "ticket-new", title: "Create a ticket", channel: "",
    keywords: ["ticket", "create", "new ticket", "request", "tạo ticket"],
    steps: [
      "Sidebar → Tickets → pick the ticket type for what you need.",
      "Click the “New” button on that type’s page.",
      "Fill the required fields (the form marks them), attach the related DID if asked, and submit.",
      "Track it from the same type’s list; the bell tells you when it is assigned or completed.",
    ],
  },
];

const strip = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

export function guideById(id) {
  return GUIDES.find((g) => g.id === id) || null;
}

// `$` autocomplete: 1+ letter against id, title, keywords. Guides of the current channel first.
export function searchGuides(q, channelName) {
  const n = strip(q);
  if (n.length < 1) return [];
  return GUIDES.filter((g) => strip(g.id + " " + g.title + " " + g.keywords.join(" ")).includes(n))
    .sort((a, b) => (b.channel === channelName) - (a.channel === channelName))
    .slice(0, 6);
}

// Helper bot: score guides against a free-text question. Returns up to 2 best, or [] if nothing fits.
export function matchGuides(text, channelName) {
  const words = strip(text).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  const scored = GUIDES.map((g) => {
    const hay = strip(g.title + " " + g.keywords.join(" "));
    let score = 0;
    words.forEach((w) => { if (hay.includes(w)) score += 1; });
    g.keywords.forEach((k) => { if (strip(text).includes(strip(k))) score += 2; });
    if (g.channel && g.channel === channelName) score += 1;
    return { g, score };
  }).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((x) => x.g);
}

export function isHelperAsk(body) {
  return /(^|\s)@helper\b/i.test(body || "");
}

// Round 569 — "Picture render" (Tools -> Picture render tab): types a name onto a designated picture at a FIXED spot.
// Everything that changes per invitation lives here, hard coded on purpose (same position every time, batch style).
//
// TO SET UP THE REAL PICTURE (done by the developer when the picture, font and colour are sent):
//   1. put the picture in public/picture-render/ (e.g. invitation.png) and set `src` below
//   2. put the font file in public/picture-render/ and fill `font` (family + file); leave null to use the system bold font
//   3. set text.x / text.y (the point the name is aligned to, in PICTURE pixels), text.maxWidth, text.color, text.fontSize
// With src = null the tab shows a grey PLACEHOLDER picture with a dashed box where the name will go, so the whole flow
// (render, download, zip, save to Drive) can be tried before the real picture arrives.
export const PICTURE_TEMPLATES = [
  {
    id: "invitation",
    label: "Invitation",
    src: "/picture-render/invitation.png",   // RIAV / VCRRM invitation, 1055 x 1491
    width: 1080,               // placeholder size only; with a real picture its own size is used
    height: 1350,
    driveFolder: "picture-render/invitation",   // inside the same Drive folder as the Halloween pictures
    // Font = Be Vietnam Pro Bold Italic (matches the finished invitation). Replace the file if the real font is sent.
    font: { family: "InviteFont", src: "/picture-render/invite-font.ttf", weight: "700", style: "italic" },
    text: {
      x: 528,                  // anchor point (picture pixels): centre under "Kính mời"
      y: 252,                  // baseline (the blank line was removed from the picture)
      align: "center",         // "left" | "center" | "right": which way the name grows from the anchor
      baseline: "alphabetic",  // "alphabetic" | "middle" | "top" | "bottom"
      maxWidth: 760,           // a long name shrinks (never below minFontSize) so it stays inside this width
      fontSize: 43,
      minFontSize: 22,
      fontWeight: "700",
      fontStyle: "italic",     // like "Kính mời" (the browser slants the font if it has no italic file)
      fallbackFamily: "Arial, 'Helvetica Neue', sans-serif",
      color: "#193f87",        // blue of the name in the finished invitation
      uppercase: false,
    },
  },
];

export const MAX_NAMES_PER_BATCH = 200;

// Public page (/picture, no login, shared access code): smaller batches + the server-side limits live in app/api/picture-render-public/route.js
export const PUBLIC_MAX_NAMES = 30;

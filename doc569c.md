# Round 569c — Picture render matches the finished invitation

Changed (no SQL, no env vars, nothing in Supabase):
- public/picture-render/invitation.png — the blank underline under "Kính mời" is erased (name now sits on clean paper, like the finished one).
- public/picture-render/invite-font.ttf — now Be Vietnam Pro **Bold Italic** (real italic, Vietnamese-complete).
- lib/pictureRenderConfig.js — name centred x=528, baseline y=252, size 43 (auto-shrinks for long names, down to 22), bold italic, colour #193f87, max width 760.
- lib/PictureRender.js — font loader now passes the italic style to the FontFace.

Tested: "Anh LONG NGUYEN" renders at x 319–736, same as the finished invitation. Long Vietnamese names shrink to fit.

Still needed from Apps Script (from Round 569b): paste drive-webhook-v3.gs, New version, same /exec URL.

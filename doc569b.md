# Round 569b — Picture render: real invitation set up (RIAV / VCRRM, 09.11.2026)

Files: public/picture-render/invitation.png (the picture you sent, 1055 x 1491), public/picture-render/invite-font.ttf (INTERIM: Be Vietnam Pro SemiBold, already in the app), lib/pictureRenderConfig.js (position, colour, size), lib/PictureRender.js (adds italic support). No SQL, no env vars. Needs r569 (earlier zip) pushed too, with drive-webhook-v3.gs in the Apps Script.

What I set (hard coded in lib/pictureRenderConfig.js):
- Spot: centred on the blank line under "Kính mời" (line y = 259, x 254-802); the name sits on the line (baseline y 249, centre x 528), max width 520 px; a long name shrinks (38 px down to 22 px) and never moves.
- Colour: #1b4286, the blue of "Kính mời" / the title, sampled from the picture.
- Style: italic semi-bold like "Kính mời" (slanted by the browser because the interim font has no italic file).
- Checked with 3 names, incl. a 40-letter one: all stay inside the line, accents clear of "Kính mời" and "tham dự".

Still waiting: the real font file (the picture's lettering looks like Be Vietnam Pro, so the interim may already be close; send the file if you have it, ideally an italic one). Change anything (bigger/smaller, higher/lower, other colour) by telling me; or edit text.fontSize / text.y / text.color in lib/pictureRenderConfig.js.

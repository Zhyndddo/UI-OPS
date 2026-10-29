# Round 566b — Halloween teaser roll-out tweaks

- Special sticker: white die-cut disc (92px), now FLOATS UP from the bottom (14 s, freezes on hover). One per 5 min.
- Fallback: if nobody has won yet today, from 15:00 Vietnam time stickers appear every 2 min (max 8 per page load; owner uncapped). No prize rollover: one prize per day stays the rule. Once the prize is taken the hunt closes for everyone else (server says `taken`).
- Bat: ~170px (0.3x of the test size), 3 erratic passes: left->right, right->left, left->right. Icon is flipped on the right->left pass. Click it any time to open the panel; after the 3rd pass it vanishes.
- Cobweb spider is back to normal for everyone (the owner test shortcut is gone; owner's first sticker still appears after ~4 s).
- Decor pieces (the normal falling emojis) fall at the original rate again (duration dur instead of dur+6, delay not doubled).
- No SQL in this round. Files: lib/HalloweenFace.js, lib/HalloweenFace.module.css, lib/HalloweenDecor.js

# Round 543b - HOTFIX: pick-package links with non-ASCII codes returned 404

Symptom (owner, 22 Oct): /pick-package/LDTĐ-22102026-0180 -> "Failed to load resource: 404".
Cause: my Round 540/541 /api/magic route only accepted tokens made of A-Z a-z 0-9 _ - . Pick-package tokens are readable codes that can contain letters like "Đ", so the route answered 404 "not found". Not an RLS/permission problem (the server uses the service role).
Fix: app/api/magic/route.js - new cleanToken(): trims, undoes a leftover percent-encoding, requires 1-200 chars and no control characters (tokens are only ever bound query values, so no other restriction is needed). lib/pickPackageServer.js - pickPackageMeta() (link preview in layout.js) also decodes the percent-encoded segment Next passes it.
Tested: tokens "abc", "LDTĐ-22102026-0180", "LDT%C4%90-22102026-0180" and a quote all pass validation; empty and 300-char tokens are refused.
Push only (no SQL). Fixes every pick-package link with a non-ASCII character; cost-report / performance / channels tokens were always plain ASCII so they were not affected.

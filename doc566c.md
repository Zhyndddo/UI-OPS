# Round 566c — re-send saved drawings to Google Drive (owner only)

New route: POST /api/halloween-face/resend (owner account only). Sends every drawing with no drive_url, oldest first, up to 40 per call;
stops at the first failure and reports the reason. Safe to run again.

How to run (while signed in as an.thien@vieent.vn on the app, open the browser console, paste):

(async()=>{const k=Object.keys(localStorage).find(x=>/^sb-.*-auth-token$/.test(x));const t=JSON.parse(localStorage.getItem(k)).access_token;const r=await fetch('/api/halloween-face/resend',{method:'POST',headers:{Authorization:'Bearer '+t}});console.log(r.status,await r.json());})()

Expect: { found: N, sent: N, results: [...] }. Check the Drive folder. If ok:false, the error says why (forbidden = secret/script version, "not configured" = env vars).
Files: app/api/halloween-face/resend/route.js, app/api/halloween-face/route.js (env trim, r566j)

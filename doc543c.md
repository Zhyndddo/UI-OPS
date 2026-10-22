# Round 543c - fix for the broken 543b build (Round 542 code was never pushed)

Vercel error: `./app/api/magic/route.js  Module not found: Can't resolve '../../../lib/performanceRollupData'`.
Cause: the repo never received the Round 542 code (git log: 540, 541, 543b only; lib/performanceRollupData.js and lib/publicSettings.js are missing). My 543b zip shipped route.js from the sandbox, which already contained the 542 imports, so it referenced files the repo doesn't have. My mistake: I assumed 542 was pushed.

This zip = Round 542 code + the 543b hotfix, complete and consistent:
- app/api/magic/route.js (542 kinds perf-rollup/setting + 543b cleanToken)
- lib/pickPackageServer.js (543b)
- lib/performanceRollupData.js, lib/PerformanceReport.js, lib/publicSettings.js (542)
- app/channels/[token]/page.js + layout.js, app/performance-report/[token]/page.js, app/pick-package/[token]/page.js, app/cost-report/[token]/page.js (542)
- sql/pending/fix-round542-revoke-last-anon-table-access.sql (542 SQL - see order below)

SQL order: the 542 SQL must only be run AFTER this code is deployed. If it was already run before the code, the performance report link, the theme lock and the channel intro/sheet line are failing for logged-out visitors until this deploys (the old deployed code still reads those tables with the public key).

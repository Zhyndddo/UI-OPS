import { build } from "esbuild";
await build({ entryPoints: ["/tmp/t630/test.mjs"], bundle: true, platform: "node", format: "esm", outfile: "/tmp/t630/out.mjs", logLevel: "error",
  external: ["nodemailer"],
  plugins: [{ name: "stub", setup(b) {
    b.onResolve({ filter: /digestData$/ }, () => ({ path: "/tmp/t630/stub-digest.js" }));
    b.onResolve({ filter: /supabaseAdmin$/ }, () => ({ path: "/tmp/t630/stub-admin.js" }));
    b.onResolve({ filter: /\/mail$/ }, () => ({ path: "/tmp/t630/stub-admin.js" }));
  } }] });

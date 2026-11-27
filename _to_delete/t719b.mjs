import { build } from "esbuild";
import fs from "fs";
await build({ entryPoints: ["app/tools/vcrrm-fee/page.js"], bundle: true, platform: "node", format: "esm", outfile: "_to_delete/t719b.out.mjs", jsx: "automatic", loader: { ".js": "jsx" }, external: ["react","react-dom","xlsx"], logLevel: "error",
  plugins: [{ name: "stub", setup(b) {
    b.onResolve({ filter: /AppShell$/ }, () => ({ path: "appshell", namespace: "stub" }));
    b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: "css", namespace: "stub" }));
    b.onLoad({ filter: /^appshell$/, namespace: "stub" }, () => ({ contents: "export default function A({children}){return children}", loader: "js" }));
    b.onLoad({ filter: /^css$/, namespace: "stub" }, () => ({ contents: "export default new Proxy({}, {get:(_,k)=>String(k)})", loader: "js" }));
  } }] });

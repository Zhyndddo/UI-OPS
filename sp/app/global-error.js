"use client";

// Round 223 — catches an error in the ROOT layout itself (ThemeProvider,
// AuthProvider, or app/layout.js's own markup) — app/error.js can't catch
// this since the crash happens above it in the tree. Next.js requires
// this file to render its own <html>/<body>, since it fully REPLACES the
// root layout when it fires. Deliberately bare — no CSS module import, no
// app context, inline styles only — since if the root layout is what
// broke, nothing that depends on it (including the app's own theme
// system) should be trusted to still work either.
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#0f0f0f", color: "#eee", textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ marginBottom: 8, fontSize: 20 }}>Something went wrong</h1>
        <p style={{ color: "#999", fontSize: 13, marginBottom: 24 }}>
          The app failed to load. Try again, or refresh the page.
        </p>
        <button
          onClick={() => reset()}
          style={{ border: "1px solid #ff6b1a", borderRadius: 6, background: "rgba(255,107,26,0.1)", color: "#eee", padding: "8px 16px", fontSize: 13, cursor: "pointer" }}
        >
          Try Again
        </button>
      </body>
    </html>
  );
}

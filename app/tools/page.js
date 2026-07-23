import AppShell from "../../lib/AppShell";
import { supabase } from "../../lib/supabaseClient";

// Without this, Next.js may cache this page's Supabase query result at
// build time and keep serving a stale error snapshot even after the
// underlying database permissions are fixed — force it to run fresh on
// every request instead.
export const dynamic = "force-dynamic";

export default async function Home() {
  const envOk = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  let rows = null;
  let queryError = null;

  if (envOk && supabase) {
    const { data, error } = await supabase
      .from("lookup_options")
      .select("category, value")
      .limit(10);
    rows = data;
    queryError = error;
  }

  return (
    <AppShell>
    <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Pipeline check</h1>
      <p style={{ color: "#999", marginBottom: 32 }}>
        Vercel → Supabase connectivity test
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <StatusRow
          label="Environment variables"
          ok={envOk}
          detail={
            envOk
              ? "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY found"
              : "Missing — set them in Vercel → Settings → Environment Variables, then redeploy"
          }
        />
        <StatusRow
          label="Supabase query"
          ok={envOk && !queryError}
          detail={
            queryError
              ? queryError.message
              : envOk
              ? `${rows?.length ?? 0} row(s) returned from lookup_options`
              : "Skipped — env vars missing"
          }
        />
      </div>

      {rows && rows.length > 0 && (
        <table
          style={{
            marginTop: 32,
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr>
              <th style={cellStyle}>category</th>
              <th style={cellStyle}>value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={cellStyle}>{r.category}</td>
                <td style={cellStyle}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rows && rows.length === 0 && (
        <p style={{ marginTop: 32, color: "#888", fontSize: 14 }}>
          Connected fine, but lookup_options came back empty — did schema.sql's seed
          rows actually run? Check the Table Editor.
        </p>
      )}

      <a
        href="/new-release"
        style={{
          display: "inline-block",
          marginTop: 32,
          color: "#ff6b1a",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        → Go to New Release form
      </a>

      <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid #262626" }}>
        <p style={{ color: "#666", fontSize: 12, marginBottom: 12 }}>Demo pages</p>
        <div style={{ display: "grid", gap: 8 }}>
          <a href="/releases" style={demoLinkStyle}>→ New Release dashboard</a>
          <a href="/booking" style={demoLinkStyle}>→ Booking Board</a>
          <a href="/artists" style={demoLinkStyle}>→ Artist List</a>
          <a href="/labels" style={demoLinkStyle}>→ Label List</a>
          <a href="/tickets/newrelease-upload" style={demoLinkStyle}>→ Ticket: Newrelease Upload</a>
          <a href="/tickets/phu-luc" style={demoLinkStyle}>→ Ticket: Phụ Lục</a>
          <a href="/tickets/design" style={demoLinkStyle}>→ Ticket: Design</a>
          <a href="/tickets/phai-sinh" style={demoLinkStyle}>→ Ticket: Phái Sinh</a>
          <a href="/tickets/media-booking" style={demoLinkStyle}>→ Ticket: Media Booking</a>
          <a href="/tickets/manual-claim" style={demoLinkStyle}>→ Ticket: Manual Claim</a>
          <a href="/tickets/report-conflict" style={demoLinkStyle}>→ Ticket: Report Conflict</a>
          <a href="/tickets/artist-profile" style={demoLinkStyle}>→ Ticket: Artist Profile</a>
          <a href="/tickets/stream-update" style={demoLinkStyle}>→ Ticket: Stream Update</a>
          <a href="/tickets/khac" style={demoLinkStyle}>→ Ticket: Khác</a>
          <a href="/summary" style={demoLinkStyle}>→ Summary</a>
        </div>
      </div>
    </main>
    </AppShell>
  );
}

const demoLinkStyle = {
  display: "inline-block",
  color: "#ccc",
  fontSize: 14,
  textDecoration: "none",
};

function StatusRow({ label, ok, detail }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: "#161616",
        borderRadius: 8,
        border: "1px solid #262626",
      }}
    >
      <span style={{ fontSize: 18 }}>{ok ? "✅" : "❌"}</span>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ color: "#888", fontSize: 13 }}>{detail}</div>
      </div>
    </div>
  );
}

const cellStyle = { textAlign: "left", padding: "6px 10px", borderBottom: "1px solid #262626" };

import "./globals.css";
import { ThemeProvider } from "../lib/ThemeContext";
import { AuthProvider } from "../lib/AuthContext";

// Round 356 — metadataBase lets Next.js resolve any relative OG/Twitter
// image URL (like the file-convention app/channels/[token]/opengraph-
// image.js) into an absolute one without a console warning, and keeps
// that resolution stable across preview/prod deploys instead of guessing
// from the request host.
// Round 358 — switched to the internal.vieent.com custom domain, matching
// app/channels/[token]/layout.js's SITE_URL (see that file's note on the
// domain-claim caveat).
export const metadata = {
  title: "Task Tracking v2",
  description: "Vercel + Supabase — VIEENT Task Tracking v2",
  metadataBase: new URL("https://internal.vieent.com"),
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "../lib/ThemeContext";
import { AuthProvider } from "../lib/AuthContext";

// Round 387 — "change font on all app (or that based one, any specific
// font choices don't change). font sent along with this zip": Be Vietnam
// Pro, self-hosted from the .ttf files the request came with (app/fonts/,
// OFL-licensed — see OFL.txt alongside them) rather than pulled from
// Google Fonts' CDN, so this app has no new external font dependency.
// Weights picked to cover every fontWeight value actually used across the
// app (grepped: 400/600/700/800 are common, 900 appears once) — Medium
// (500) thrown in too since the browser would otherwise synthesize a fake
// bold for anything landing between two loaded weights. next/font/local
// self-hosts + subsets + preloads automatically and exposes one CSS
// variable (--font-be-vietnam-pro) rather than a bare font-family name, so
// nothing else has to change to consume it beyond globals.css's html/body
// rule below. The few deliberately-monospace spots in the app (ticket IDs,
// raw-data preview boxes — "SF Mono"/"monospace" in their own inline
// styles) are untouched, per "any specific font choices don't change" —
// they never inherited the old system-font stack either, so this doesn't
// touch them.
const beVietnamPro = localFont({
  src: [
    { path: "./fonts/BeVietnamPro-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/BeVietnamPro-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/BeVietnamPro-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/BeVietnamPro-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/BeVietnamPro-ExtraBold.ttf", weight: "800", style: "normal" },
    { path: "./fonts/BeVietnamPro-Black.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-be-vietnam-pro",
  display: "swap",
});

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
    <html lang="en" className={beVietnamPro.variable}>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

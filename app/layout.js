import "./globals.css";
import { ThemeProvider, ThemeToggle } from "../lib/ThemeContext";

export const metadata = {
  title: "Task Tracking v2 — pipeline check",
  description: "Vercel + Supabase connectivity test",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <ThemeToggle />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

import "./globals.css";
import { ThemeProvider } from "../lib/ThemeContext";
import { CurrentUserProvider } from "../lib/CurrentUserContext";

export const metadata = {
  title: "Task Tracking v2",
  description: "Vercel + Supabase — VIEENT Task Tracking v2",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <CurrentUserProvider>{children}</CurrentUserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

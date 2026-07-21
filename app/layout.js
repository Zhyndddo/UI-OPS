export const metadata = {
  title: "Task Tracking v2 — pipeline check",
  description: "Vercel + Supabase connectivity test",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
          background: "#0b0b0b",
          color: "#f4f4f4",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}

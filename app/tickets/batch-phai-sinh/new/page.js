"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Round 41 — Phái Sinh (Batch) merged into Phái Sinh (choose Type: Kho
// nhạc / Chuyển net / Takedown, see app/tickets/phai-sinh/new/page.js).
// This route is retired but kept as a redirect stub rather than deleted,
// in case anything still links here (bookmarks, notification links on
// tickets created before the merge).
export default function BatchPhaiSinhNewRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/tickets/phai-sinh/new");
  }, [router]);
  return null;
}

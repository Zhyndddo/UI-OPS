"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Round 41 — Phái Sinh (Batch) merged into Phái Sinh (see
// app/tickets/phai-sinh/page.js — Kho Nhạc-family rows there now have an
// "Open Batch" link into app/tickets/batch-phai-sinh/[id]/page.js, which
// is unchanged and still real). This list route itself is retired but
// kept as a redirect stub rather than deleted, in case anything still
// links here (bookmarks, old notification links).
export default function BatchPhaiSinhListRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/tickets/phai-sinh");
  }, [router]);
  return null;
}

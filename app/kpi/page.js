"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Round 462 — the standalone KPI prototype (Rounds 459-461) moved into Task
// Table's "Performance" tab with real role scoping; old bookmarks land there.
export default function KpiRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/task-table"); }, [router]);
  return null;
}

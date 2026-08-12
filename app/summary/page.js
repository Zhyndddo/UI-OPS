"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Round 57 — /summary's content (the per-team "not done" worklist) moved
// into /report as a second tab ("Team Worklist"), per request ("I forgot
// we have the summary item already, can you merge them?"). This page just
// redirects so old bookmarks/links keep working instead of 404ing.
export default function SummaryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/report?tab=worklist");
  }, [router]);
  return null;
}

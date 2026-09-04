"use client";

// Round 172 — "+ New Ticket" moved into a popup on the list page
// (lib/NewArtistProfileTicketPopup.js, opened from
// app/tickets/artist-profile/page.js) instead of this being its own page.
// This route stays as a redirect only so any existing bookmark/link to
// /tickets/artist-profile/new still lands somewhere sensible instead of
// 404ing.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewArtistProfilePageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/tickets/artist-profile");
  }, [router]);
  return null;
}

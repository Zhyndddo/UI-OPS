"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The root URL, the first thing anyone hits, goes to the Dashboard (/releases) — "default page = Dashboard" for first
// load, the topbar's home-click, and post-login.
//
// Round 564c — this used to be a SERVER redirect() (HTTP 307). Google Search Console's ownership check fetches the
// root URL and did not follow that hop, so the verification tag in app/layout.js was never seen ("couldn't find your
// web page"). Now / answers 200 with the normal <head> (tag included) and the browser forwards itself right away.
// Same destination for people; only the hop moved from the server into the browser.
export default function RootPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/releases"); }, [router]);
  return <div style={{ minHeight: "100vh", background: "var(--bg)" }} aria-hidden="true" />;
}

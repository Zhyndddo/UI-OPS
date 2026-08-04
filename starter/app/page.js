import { redirect } from "next/navigation";

// The root URL, the first thing anyone hits, now goes straight to the
// Dashboard — matching "default page = Dashboard" for first load, the
// topbar's home-click, and post-login. The old diagnostic content that
// used to live here moved to /tools (still reachable, just not the
// default anymore, and not in the sidebar nav either).
export default function RootPage() {
  redirect("/releases");
}

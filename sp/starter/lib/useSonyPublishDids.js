import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Shared by Upload Workstation and Pre-release Workstation — both need to
// know which releases already have a Sony Publish ticket, so their rows
// can lock (see SonyPublishLockRow.js). Fetched once per page load via a
// single batched query (tab lookup + non-deleted tickets for that tab),
// same shape as every other "existing tickets for a type" fetch elsewhere
// in the app — not per-row, so this doesn't scale with the release count.
export function useSonyPublishDids() {
  const [dids, setDids] = useState(new Set());

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "sony_publish").single();
      if (!tab) return;
      const { data: tickets } = await supabase.from("tickets").select("data").eq("tab_id", tab.id).is("deleted_at", null);
      setDids(new Set((tickets || []).map((t) => t.data?.releaseId).filter(Boolean)));
    })();
  }, []);

  return dids;
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Round 645 — moved: rights declarations are now the ticket type "Khai báo bản quyền".
export default function Moved() {
  const router = useRouter();
  useEffect(() => { router.replace("/tickets/khai-bao-ban-quyen"); }, [router]);
  return null;
}

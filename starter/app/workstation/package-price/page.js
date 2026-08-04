"use client";

import AppShell from "../../../lib/AppShell";
import TypeSwitcher from "../../../lib/TypeSwitcher";
import styles from "../../shared.module.css";

// Deliberately empty — placeholder page so the nav entry exists and the
// route is real; real content comes later.
export default function PackagePriceWorkstation() {
  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container}>
          <TypeSwitcher kind="workstation" current="package_price" />
          <div className={styles.eyebrow}>// Workstation</div>
          <h1 className={styles.title}>Package Price Management</h1>
          <div className={styles.emptyState}>Not built yet — coming back to this later.</div>
        </div>
      </div>
    </AppShell>
  );
}

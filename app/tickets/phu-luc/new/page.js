"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabaseClient";
import styles from "../../../shared.module.css";

const EMPTY = {
  releaseId: "",
  giaTri: "",
  label: "",
  name: "",
  linkPhuLuc: "",
  ngayGui: "",
  ngayKy: "",
  maPL: "",
};

export default function NewPhuLucTicket() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [vcpmc, setVcpmc] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.releaseId.trim() || !form.giaTri.trim()) {
      setError("DID and Giá Trị Phụ Lục are required.");
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id").eq("key", "phu_luc").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Phụ Lục ticket type — did schema.sql get redeployed?");
      return;
    }
    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data: { ...form, vcpmcDocQuyen: vcpmc },
      deadline: deadline || null,
    });
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else router.push("/tickets/phu-luc");
  }

  return (
    <div className={styles.page}>
      <div className={styles.container} style={{ maxWidth: 640 }}>
        <Link href="/tickets/phu-luc" className={styles.backLink}>← Back</Link>
        <div className={styles.eyebrow}>// New Ticket</div>
        <h1 className={styles.title}>Phụ Lục</h1>

        {error && <div className={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>DID <span className={styles.required}>*</span></label>
              <input className={styles.input} value={form.releaseId} onChange={(e) => update("releaseId", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Giá Trị Phụ Lục <span className={styles.required}>*</span></label>
              <input className={styles.input} value={form.giaTri} onChange={(e) => update("giaTri", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Deadline</label>
              <input type="date" className={styles.input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>

          <label className={styles.checkboxRow} style={{ marginBottom: 20 }}>
            <input type="checkbox" checked={vcpmc} onChange={(e) => setVcpmc(e.target.checked)} />
            VCPMC Độc Quyền
          </label>

          <div className={styles.subheading}>Workstation fields (drives the PL Status column)</div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Label</label>
              <input className={styles.input} value={form.label} onChange={(e) => update("label", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Name (Project)</label>
              <input className={styles.input} value={form.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Mã PL</label>
              <input className={styles.input} value={form.maPL} onChange={(e) => update("maPL", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Link Phụ Lục</label>
              <input className={styles.input} value={form.linkPhuLuc} onChange={(e) => update("linkPhuLuc", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Ngày Gửi</label>
              <input type="date" className={styles.input} value={form.ngayGui} onChange={(e) => update("ngayGui", e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Ngày Ký</label>
              <input type="date" className={styles.input} value={form.ngayKy} onChange={(e) => update("ngayKy", e.target.value)} />
            </div>
          </div>

          <p style={{ color: "#666", fontSize: 12, marginBottom: 16 }}>
            Leave Link/Ngày Gửi/Ngày Ký empty to see "Chưa Soạn" on the list; fill them in
            progressively to watch PL Status move through Đã Soạn → Chờ Ký → Đã Ký.
          </p>

          <button className={styles.btnPrimary} type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Ticket"}
          </button>
        </form>
      </div>
    </div>
  );
}

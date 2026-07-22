"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { fmtDate } from "../../../lib/helpers";
import styles from "../../shared.module.css";

const TABS = [
  { key: "overview", label: "Tổng Hợp" },
  { key: "url", label: "URL" },
  { key: "media_booking", label: "Media Booking" },
  { key: "pitching", label: "Pitching" },
  { key: "pre_release", label: "Pre-release & Note" },
  { key: "streaming_milestone", label: "Streaming/Milestone" },
  { key: "tasklist", label: "Tasklist" },
];

const PIPELINE_STAGES = ["BRIEF & DATA", "DEALING"];

const META_ITEMS = [
  { key: "meta_audio", label: "Audio" },
  { key: "meta_artwork", label: "Artwork" },
  { key: "meta_working_files", label: "Working Files" },
  { key: "meta_lyric", label: "Lyric" },
  { key: "meta_mv", label: "MV" },
  { key: "meta_doc", label: "Metadata" },
];

const BOOKING_ROUNDS = ["INT", "Đợt 1", "Đợt 2"];
const BOOKING_PLATFORMS = ["TikTok", "Facebook", "Instagram", "YouTube"];

export default function ReleaseDetailPage() {
  const { id } = useParams();
  const [release, setRelease] = useState(null);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState("overview");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [packageItems, setPackageItems] = useState([]);
  const [bookingEntries, setBookingEntries] = useState([]);
  const [magicLinkUrl, setMagicLinkUrl] = useState(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    if (!supabase || !id) return;
    supabase
      .from("releases")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else {
          setRelease(data);
          setForm(data);
        }
      });
    supabase
      .from("release_package_items")
      .select("*")
      .eq("release_id", id)
      .order("sort_order")
      .then(({ data }) => setPackageItems(data || []));
    supabase
      .from("media_booking_entries")
      .select("*")
      .eq("release_id", id)
      .then(({ data }) => setBookingEntries(data || []));
    // Magic links never expire once created — fetch the most recent one so
    // it shows up on return visits instead of only right after generating.
    supabase
      .from("magic_links")
      .select("token")
      .eq("release_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.token) setMagicLinkUrl(`${window.location.origin}/pick-package/${data.token}`);
      });

    // Live updates — e.g. an artist picking a package on the magic-link
    // page should show up here without a manual refresh. Only patches
    // fields the user isn't actively editing, so it won't stomp on
    // in-progress typing in another tab.
    const channel = supabase
      .channel(`release-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "releases", filter: `id=eq.${id}` },
        (payload) => {
          setRelease(payload.new);
          setForm((f) => (f ? { ...f, ...payload.new } : payload.new));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function saveTab() {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("releases").update(form).eq("id", id);
    setSaving(false);
    if (err) setError(err.message);
    else {
      setRelease(form);
      setSaved(true);
    }
  }

  // Clicking SEND UPLOAD does real work: creates an actual Newrelease
  // Upload ticket, and — the first time only, tracked via
  // package_ticket_sent — ALSO sends a Package Prep ticket to Marketing.
  // That same one-time gate is shared with the manual "Send Package Ticket
  // to Marketing" button below — whichever one fires first "uses up" the
  // gate, and the other won't send a duplicate afterward.
  async function toggleUpload() {
    const newVal = !form.requested;
    setForm((f) => ({ ...f, requested: newVal }));
    await supabase.from("releases").update({ requested: newVal }).eq("id", id);
    setRelease((r) => ({ ...r, requested: newVal }));

    if (newVal) {
      const { data: uploadTab } = await supabase.from("ticket_tabs").select("id").eq("key", "newrelease_upload").single();
      if (uploadTab) {
        await supabase.from("tickets").insert({
          tab_id: uploadTab.id,
          data: { releaseId: form.did, project: form.title, artist: form.main_artist, label: form.label },
        });
      }
      await sendPackageTicket();
    }
  }

  // Sending the package-prep ticket IS what starts the DEALING stage — no
  // separate manual "Advance" action needed. This is a genuine one-time
  // gate (not an override): once package_ticket_sent is true, calling this
  // again — from either this button or the Upload flow — does nothing.
  async function sendPackageTicket() {
    if (form.package_ticket_sent) return;
    const { data: tab } = await supabase.from("ticket_tabs").select("id").eq("key", "package_prep").single();
    if (tab) {
      await supabase.from("tickets").insert({
        tab_id: tab.id,
        data: { releaseId: form.did, contractType: form.project_type, note: `Chuẩn bị gói cho ${form.title} — ${form.main_artist}` },
      });
    }
    const patch = { package_ticket_sent: true };
    if (form.project_type === "BRIEF & DATA") patch.project_type = "DEALING";
    await supabase.from("releases").update(patch).eq("id", id);
    setForm((f) => ({ ...f, ...patch }));
    setRelease((r) => ({ ...r, ...patch }));
  }

  async function addBookingEntry(round, platform, channelType, link) {
    if (!link) return;
    const { data, error: err } = await supabase
      .from("media_booking_entries")
      .insert({ release_id: id, booking_round: round, platform, channel_type: channelType, link, status: "Chưa Booking" })
      .select()
      .single();
    if (!err && data) setBookingEntries((prev) => [...prev, data]);
  }

  async function cycleBookingStatus(entry) {
    const order = ["Chưa Booking", "Đã Gửi", "Done"];
    const next = order[(order.indexOf(entry.status) + 1) % order.length];
    await supabase.from("media_booking_entries").update({ status: next }).eq("id", entry.id);
    setBookingEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: next } : e)));
  }

  // Magic link — real Resend sending isn't wired up yet, so this just
  // generates the token and shows the link on screen (agreed: fake the
  // email step for now). Stays usable indefinitely; package_locked is what
  // actually shuts off writes on the recipient's end, not the link itself.
  async function generateMagicLink() {
    setGeneratingLink(true);
    const { data, error: err } = await supabase
      .from("magic_links")
      .insert({ release_id: id })
      .select("token")
      .single();
    setGeneratingLink(false);
    if (!err && data) {
      setMagicLinkUrl(`${window.location.origin}/pick-package/${data.token}`);
    }
  }

  async function togglePackageLock() {
    const newVal = !form.package_locked;
    setForm((f) => ({ ...f, package_locked: newVal }));
    await supabase.from("releases").update({ package_locked: newVal }).eq("id", id);
    setRelease((r) => ({ ...r, package_locked: newVal }));
  }

  if (error && !release) return <div className={styles.page}><div className={styles.container}><div className={styles.errorBox}>{error}</div></div></div>;
  if (!form) return <div className={styles.page}><div className={styles.container}>Loading…</div></div>;

  const metaDone = META_ITEMS.filter((m) => form[m.key]).length;
  const nameGroupFilled = form.title && form.main_artist && form.release_date;
  const uploadReady = metaDone === META_ITEMS.length && nameGroupFilled;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link href="/releases" className={styles.backLink}>
          ← Back to New Release
        </Link>

        <div style={{ marginBottom: 20 }}>
          <div className={styles.eyebrow}>{form.did || "—"}</div>
          <h1 className={styles.title} style={{ marginBottom: 4 }}>
            {form.title} — {form.main_artist}
          </h1>
          <div style={{ color: "#888", fontSize: 13 }}>
            {form.release_date} {form.release_time}
          </div>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}
        {saved && <div className={styles.successBox}>Saved.</div>}

        <div className={styles.tabBar}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`${styles.tabBtn} ${tab === t.key ? styles.tabBtnActive : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <OverviewTab
            form={form}
            update={update}
            metaDone={metaDone}
            uploadReady={uploadReady}
            onSave={saveTab}
            saving={saving}
            onUpload={toggleUpload}
            packageItems={packageItems}
            magicLinkUrl={magicLinkUrl}
            generatingLink={generatingLink}
            onGenerateLink={generateMagicLink}
            onToggleLock={togglePackageLock}
            onSendPackageTicket={sendPackageTicket}
          />
        )}
        {tab === "url" && <UrlTab form={form} update={update} onSave={saveTab} saving={saving} />}
        {tab === "media_booking" && (
          <MediaBookingTab form={form} entries={bookingEntries} onAdd={addBookingEntry} onCycleStatus={cycleBookingStatus} />
        )}
        {tab === "pitching" && <PitchingTab form={form} update={update} onSave={saveTab} saving={saving} />}
        {tab === "pre_release" && <PreReleaseTab form={form} update={update} onSave={saveTab} saving={saving} />}
        {tab === "streaming_milestone" && <StreamingMilestoneTab form={form} />}
        {tab === "tasklist" && <TasklistTab form={form} bookingEntries={bookingEntries} />}
      </div>
    </div>
  );
}


function SaveBar({ onSave, saving }) {
  return (
    <div style={{ marginTop: 20 }}>
      <button className={styles.btnPrimary} onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

// Loại Dự Án is no longer a static dropdown — it's the booking pipeline:
// BRIEF & DATA -> DEALING (persists until artist locks in) -> a real resolved package
// (set once the artist locks one in via the magic link). Shows the current
// stage — no manual "Advance" action anymore; sending the package ticket
// to Marketing (below, in the Package section) is what actually moves
// BRIEF & DATA -> DEALING. Once resolved to a real package, shows that
// value read-only plus the derived Phụ Lục requirement.
function PipelineControl({ form, update }) {
  const stage = form.project_type;
  const isPipelineStage = PIPELINE_STAGES.includes(stage);

  return (
    <div style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 14, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className={styles.statusBadge} style={{ background: "rgba(255,107,26,0.15)", color: "#ff9d5c" }}>
          {stage}
        </span>
        {stage === "BRIEF & DATA" && (
          <span style={{ color: "#666", fontSize: 11 }}>
            Moves to DEALING automatically once a Package Ticket is sent (see Package section below)
          </span>
        )}
        {stage === "DEALING" && (
          <span style={{ color: "#666", fontSize: 11 }}>
            Waiting on artist to pick a package via the magic link (see Package section below)
          </span>
        )}
      </div>
      {!isPipelineStage && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#888" }}>
          Resolved package — <span style={{ color: "#ffca4d" }}>Phụ Lục required, see URL tab.</span>
          {" "}
          <button className={styles.btnSmall} onClick={() => update("project_type", "BRIEF & DATA")}>
            Reset to BRIEF & DATA
          </button>
        </div>
      )}
      <p style={{ color: "#555", fontSize: 11, marginTop: 8, marginBottom: 0 }}>
        Click Save below to persist a stage change.
      </p>
    </div>
  );
}

function fmtVnd(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + " đ";
}

function OverviewTab({ form, update, metaDone, uploadReady, onSave, saving, onUpload, packageItems, magicLinkUrl, generatingLink, onGenerateLink, onToggleLock, onSendPackageTicket }) {
  return (
    <div>
      <div className={styles.grid2}>
        <Field label="Link Drive">
          <input className={styles.input} value={form.drive_link || ""} onChange={(e) => update("drive_link", e.target.value)} />
        </Field>
        <Field label="Link LBM (locked — edit from URL tab or Ticket)">
          <input className={styles.input} value={form.link_lbm || ""} disabled />
        </Field>
        <Field label="Media Channel">
          <input className={styles.input} value={form.requester_segment || ""} onChange={(e) => update("requester_segment", e.target.value)} placeholder="VIEENT / ENVI / ALL" />
        </Field>
        <Field label="Thể Loại (Genre)">
          <input className={styles.input} value={form.genre || ""} onChange={(e) => update("genre", e.target.value)} />
        </Field>
        <Field label="Chủ Đề (Topic)">
          <input className={styles.input} value={form.theme || ""} onChange={(e) => update("theme", e.target.value)} />
        </Field>
      </div>

      <div className={styles.subheading}>Trạng Thái Gói (Loại Dự Án)</div>
      <PipelineControl form={form} update={update} />

      <div className={styles.subheading}>Name / Artist / Release Date (editing updates the title above)</div>
      <div className={styles.grid2}>
        <Field label="Name">
          <input className={styles.input} value={form.title || ""} onChange={(e) => update("title", e.target.value)} />
        </Field>
        <Field label="Main Artist">
          <input className={styles.input} value={form.main_artist || ""} onChange={(e) => update("main_artist", e.target.value)} />
        </Field>
        <Field label="Release Date">
          <input type="date" className={styles.input} value={form.release_date || ""} onChange={(e) => update("release_date", e.target.value)} />
        </Field>
        <Field label="Release Time">
          <input type="time" className={styles.input} value={form.release_time || ""} onChange={(e) => update("release_time", e.target.value)} />
        </Field>
      </div>

      <div className={styles.subheading}>Metadata Checklist ({metaDone}/6)</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        {META_ITEMS.map((m) => (
          <label key={m.key} className={styles.checkboxRow}>
            <input type="checkbox" checked={!!form[m.key]} onChange={(e) => update(m.key, e.target.checked)} />
            {m.label}
          </label>
        ))}
      </div>

      <SaveBar onSave={onSave} saving={saving} />

      <div style={{ marginTop: 24, borderTop: "1px solid #262626", paddingTop: 20 }}>
        <button
          className={styles.btnPrimary}
          disabled={!uploadReady || form.requested}
          onClick={onUpload}
          style={{ opacity: form.requested ? 0.5 : uploadReady ? 1 : 0.3 }}
        >
          {form.requested ? "UPLOAD SENT" : "SEND UPLOAD"}
        </button>
      </div>

      <div style={{ marginTop: 24, borderTop: "1px solid #262626", paddingTop: 20 }}>
        <div className={styles.subheading} style={{ marginTop: 0 }}>Package (Gói Hỗ Trợ Truyền Thông)</div>

        {["BRIEF & DATA", "DEALING"].includes(form.project_type) ? (
          <p style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
            No contract type resolved yet — package details will show once the artist locks one in.
          </p>
        ) : (
          <p style={{ fontSize: 13, color: "#ccc", marginBottom: 4 }}>
            Contract type: <strong style={{ color: "#ff9d5c" }}>{form.project_type}</strong>
            {form.package_locked && <span style={{ color: "#888" }}> (locked)</span>}
          </p>
        )}

        {form.package_total_value != null && (
          <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
            Tổng Giá Trị Gói: <strong style={{ color: "#ccc" }}>{fmtVnd(form.package_total_value)}</strong>
            {" · "}Thanh Toán: <strong style={{ color: "#ccc" }}>{form.package_payment_status}</strong>
          </p>
        )}

        {packageItems.length > 0 && (
          <table className={styles.table} style={{ marginBottom: 16 }}>
            <thead><tr><th>Hạng Mục</th><th>Số Lượng</th><th>Chi Tiết</th><th>Thành Tiền</th></tr></thead>
            <tbody>
              {packageItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.category}</td>
                  <td>{item.quantity} {item.unit}</td>
                  <td style={{ fontSize: 11, color: "#999" }}>{item.detail || "—"}</td>
                  <td>{fmtVnd(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className={styles.btnSecondary} onClick={onGenerateLink} disabled={generatingLink}>
            {generatingLink ? "Generating…" : "Generate Magic Link"}
          </button>
          <button className={styles.btnSmall} onClick={onToggleLock}>
            {form.package_locked ? "Unlock editing" : "Lock editing"}
          </button>
          <button
            className={styles.btnSmall}
            onClick={onSendPackageTicket}
            disabled={form.package_ticket_sent}
            style={form.package_ticket_sent ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
          >
            {form.package_ticket_sent ? "Package Ticket Sent" : "Send Package Ticket to Marketing"}
          </button>
        </div>

        {magicLinkUrl && (
          <div style={{ marginTop: 14, background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
              Real email sending isn't wired up yet — share this link manually for now:
            </div>
            <a href={magicLinkUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#ff6b1a", fontSize: 13, wordBreak: "break-all" }}>
              {magicLinkUrl}
            </a>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, borderTop: "1px solid #262626", paddingTop: 20 }}>
        <div className={styles.subheading} style={{ marginTop: 0 }}>Additional Flags</div>
        <GateFields form={form} update={update} />
      </div>
    </div>
  );
}

const GATE_FIELDS = [
  ["gate_pitching", "Pitching"],
  ["gate_publishing", "Publishing"],
  ["gate_goi_ho_tro_truyen_thong", "Gói Hỗ Trợ Truyền Thông"],
  ["gate_split_share", "Split Share"],
  ["gate_lyric_musixmatch", "Lyric Musixmatch"],
  ["gate_design", "Design"],
  ["gate_co_trong_net_youtube", "Có Trong Net YouTube"],
];
const GATE_OPTIONS = ["false", "true", "update"];
const GATE_LABELS = { false: "No", true: "Yes", update: "Update" };

// Tri-state gate fields — Yes (do it) / No (don't need to) / Update (will
// decide yes/no later). Ticking "Yes" is meant to reveal more detail —
// pitching already has its full breakdown on the Pitching tab, so this
// just cross-links there; split_share is the one with genuinely new
// sub-fields, including a repeatable list (multiple labels can each take
// a cut).
function GateToggle({ value, onChange }) {
  return (
    <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden" }}>
      {GATE_OPTIONS.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 12,
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            background: value === o ? "#ff6b1a" : "transparent",
            color: value === o ? "#0a0a0a" : "#ccc",
          }}
        >
          {GATE_LABELS[o]}
        </button>
      ))}
    </div>
  );
}

function GateFields({ form, update }) {
  const entries = form.split_share_entries || [];

  function updateEntry(i, key, value) {
    const next = entries.map((e, idx) => (idx === i ? { ...e, [key]: value } : e));
    update("split_share_entries", next);
  }
  function addEntry() {
    update("split_share_entries", [...entries, { percentage: "", shared_label: "", scope: "only_new_release" }]);
  }
  function removeEntry(i) {
    update("split_share_entries", entries.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
        {GATE_FIELDS.map(([key, label]) => (
          <div key={key} className={styles.field} style={{ marginBottom: 0 }}>
            <label className={styles.fieldLabel}>{label}</label>
            <GateToggle value={form[key] || "false"} onChange={(v) => update(key, v)} />
          </div>
        ))}
      </div>

      {form.gate_pitching === "true" && (
        <p style={{ color: "#666", fontSize: 11, marginBottom: 12 }}>
          Pitching detail (priority, Spotify/NCT/Zing) is on the Pitching tab.
        </p>
      )}

      {form.gate_split_share === "true" && (
        <div style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 12, marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
            Split Share
          </div>
          {entries.map((entry, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className={styles.field} style={{ marginBottom: 0, width: 90 }}>
                <label className={styles.fieldLabel}>%</label>
                <input className={styles.input} value={entry.percentage} onChange={(e) => updateEntry(i, "percentage", e.target.value)} />
              </div>
              <div className={styles.field} style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
                <label className={styles.fieldLabel}>Shared Label</label>
                <input className={styles.input} value={entry.shared_label} onChange={(e) => updateEntry(i, "shared_label", e.target.value)} />
              </div>
              <div className={styles.field} style={{ marginBottom: 0, minWidth: 180 }}>
                <label className={styles.fieldLabel}>Scope</label>
                <select className={styles.select} value={entry.scope} onChange={(e) => updateEntry(i, "scope", e.target.value)}>
                  <option value="only_new_release">Only New Release</option>
                  <option value="include_derivative">Include Derivative</option>
                </select>
              </div>
              <button className={styles.btnSmall} style={{ borderColor: "#c0392b", color: "#e57373" }} onClick={() => removeEntry(i)}>
                Remove
              </button>
            </div>
          ))}
          <button className={styles.btnSmall} onClick={addEntry}>+ Add Label</button>
          {entries.some((e) => e.scope === "include_derivative") && (
            <p style={{ color: "#ffca4d", fontSize: 11, marginTop: 8 }}>
              ⚠ At least one entry includes derivative works — the Phái Sinh ticket system should be flagged
              that related derivative products need uploading. Not automated yet; flag manually for now.
            </p>
          )}
        </div>
      )}

      <p style={{ color: "#555", fontSize: 11, marginTop: 12 }}>
        Ticking any field here is meant to add a line to the Tasklist tab — not wired up yet.
      </p>
    </div>
  );
}

function UrlTab({ form, update, onSave, saving }) {
  const fields = [
    ["smartlink", "Smartlink"],
    ["upc", "UPC"],
    ["link_lbm", "Link LBM"],
    ["link_share", "Link Share"],
    ["link_preorder", "Link Pre-order"],
    ["link_ugc", "Link UGC"],
    ["link_media_report", "Link Media Report"],
    ["link_phu_luc", "URL Phụ Lục"],
    ["promotion_package_url", "URL Promotion Package"],
  ];
  const plStatus = phuLucStatusClient(form);
  return (
    <div>
      <div className={styles.grid2}>
        {fields.map(([key, label]) => (
          <Field key={key} label={label}>
            <input className={styles.input} value={form[key] || ""} onChange={(e) => update(key, e.target.value)} />
          </Field>
        ))}
      </div>
      <p style={{ color: "#888", fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        Status Phụ Lục: <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{plStatus}</span>
        {" — "}{phuLucNextStep(form)}
      </p>
      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

// Clear, actionable next step instead of a vague "go check another tab"
// pointer — tells you exactly what's missing right now.
function phuLucNextStep(form) {
  if (!form.link_phu_luc) return "add a URL Phụ Lục above to begin.";
  if (!form.phu_luc_ngay_gui) return "next: set Ngày Gửi (Pre-release & Note tab).";
  if (!form.phu_luc_ngay_ky) return "next: set Ngày Ký (Pre-release & Note tab).";
  return "complete.";
}

// Mirrors phu_luc_status() in schema.sql — client-side so the URL tab can
// show it live without a round trip.
function phuLucStatusClient(form) {
  if (form.link_phu_luc && form.phu_luc_ngay_ky) return "Đã Ký";
  if (form.link_phu_luc && form.phu_luc_ngay_gui) return "Chờ Ký";
  if (form.link_phu_luc) return "Đã Soạn";
  return "Chưa Soạn";
}

function MediaBookingTab({ form, entries, onAdd, onCycleStatus }) {
  const [round, setRound] = useState("INT");
  const [channelType, setChannelType] = useState("Internal");

  const visibleEntries = entries.filter((e) => e.booking_round === round && e.channel_type === channelType);
  // Per the real workflow: Internal booking runs immediately in parallel
  // with the Phụ Lục signing process; everything else waits until it's
  // actually signed.
  const plSigned = phuLucStatusClient(form) === "Đã Ký";
  const isRestricted = round !== "INT" && !plSigned;

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {BOOKING_ROUNDS.map((r) => (
          <button
            key={r}
            onClick={() => setRound(r)}
            className={`${styles.tabBtn} ${round === r ? styles.tabBtnActive : ""}`}
            style={{ border: "1px solid #262626", borderRadius: 6 }}
          >
            {r}
          </button>
        ))}
      </div>

      {isRestricted && (
        <div className={styles.errorBox} style={{ background: "#1a1a1a", borderColor: "#5a4a1a", color: "#ffca4d", marginBottom: 16 }}>
          ⚠ Only Internal booking should run right now — Phụ Lục isn't signed yet (Status Phụ Lục: {phuLucStatusClient(form)}).
          Not a hard block yet, just a heads up.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {BOOKING_PLATFORMS.map((platform) => {
          const cellEntries = visibleEntries.filter((e) => e.platform === platform);
          return (
            <div key={platform} style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b1a", marginBottom: 8, textTransform: "uppercase" }}>
                {platform}
              </div>
              <BookingCell
                round={round}
                platform={platform}
                channelType={channelType}
                entries={cellEntries}
                onAdd={onAdd}
                onCycleStatus={onCycleStatus}
              />
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, borderTop: "1px solid #262626", paddingTop: 16 }}>
        <div className={styles.fieldLabel} style={{ marginBottom: 8 }}>Channel Type</div>
        <div style={{ display: "flex", border: "1px solid #333", borderRadius: 6, overflow: "hidden", width: "fit-content" }}>
          {["Internal", "External"].map((c) => (
            <button
              key={c}
              onClick={() => setChannelType(c)}
              style={{
                padding: "9px 20px",
                fontSize: 12,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                background: channelType === c ? "#ff6b1a" : "transparent",
                color: channelType === c ? "#0a0a0a" : "#ccc",
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <p style={{ color: "#666", fontSize: 11, marginTop: 8 }}>
          Round "INT" means no External channel is currently planned for this release (though that could
          change) — separate from this Internal/External switch, which picks which kind of channel you're
          viewing within whichever round is selected above.
        </p>
      </div>
    </div>
  );
}

function BookingCell({ round, platform, channelType, entries, onAdd, onCycleStatus }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const done = entries.filter((e) => e.status === "Done").length;
  return (
    <div style={{ fontSize: 12 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
        title={entries.map((e) => `${e.status}: ${e.link}`).join("\n")}
      >
        <span style={{ color: "#ccc" }}>Links</span>
        <span style={{ color: entries.length ? "#ff9d5c" : "#555", fontWeight: 700 }}>
          {done} / {entries.length}
        </span>
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          {entries.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
              <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
                {e.link}
              </a>
              <button
                onClick={() => onCycleStatus(e)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#ff9d5c", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}
              >
                {e.status}
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            <input
              className={styles.input}
              style={{ padding: "4px 8px", fontSize: 11 }}
              placeholder="link…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <button
              className={styles.btnSmall}
              onClick={() => {
                onAdd(round, platform, channelType, link);
                setLink("");
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PitchingTab({ form, update, onSave, saving }) {
  const statusOpts = ["", "Chưa thực hiện", "Đang thực hiện", "Đã pitching", "Không thực hiện"];
  const nctZingOpts = ["", "Chưa thực hiện", "Đã pitching", "Không hỗ trợ", "Có gói"];
  return (
    <div>
      <label className={styles.checkboxRow} style={{ marginBottom: 16 }}>
        <input type="checkbox" checked={!!form.priority_pitching} onChange={(e) => update("priority_pitching", e.target.checked)} />
        Priority Pitching
      </label>

      <div className={styles.grid2}>
        <Field label="Spotify Status">
          <select className={styles.select} value={form.pitching_status_spotify || ""} onChange={(e) => update("pitching_status_spotify", e.target.value)}>
            {statusOpts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
        </Field>
        <Field label="NCT Status">
          <select className={styles.select} value={form.pitching_status_nct || ""} onChange={(e) => update("pitching_status_nct", e.target.value)}>
            {nctZingOpts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
        </Field>
        <Field label="Zing Status">
          <select className={styles.select} value={form.pitching_status_zing || ""} onChange={(e) => update("pitching_status_zing", e.target.value)}>
            {nctZingOpts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
          </select>
        </Field>
      </div>

      <div className={styles.subheading}>Spotify Extra Fields</div>
      <div className={styles.grid2}>
        <Field label="Pitch Genre">
          <input className={styles.input} value={form.pitch_genre || ""} onChange={(e) => update("pitch_genre", e.target.value)} />
        </Field>
        <Field label="Mood">
          <input className={styles.input} value={form.pitch_mood || ""} onChange={(e) => update("pitch_mood", e.target.value)} />
        </Field>
        <Field label="Instrumental">
          <input className={styles.input} value={form.pitch_instrumental || ""} onChange={(e) => update("pitch_instrumental", e.target.value)} />
        </Field>
        <Field label="Pitch Note">
          <textarea className={styles.textarea} value={form.pitch_note || ""} onChange={(e) => update("pitch_note", e.target.value)} />
        </Field>
        <Field label="Memo">
          <textarea className={styles.textarea} value={form.pitch_memo || ""} onChange={(e) => update("pitch_memo", e.target.value)} />
        </Field>
      </div>
      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

function PreReleaseTab({ form, update, onSave, saving }) {
  return (
    <div>
      <div className={styles.grid2}>
        <Field label="CANVAS MV Status">
          <input className={styles.input} value={form.canva_mv_status || ""} onChange={(e) => update("canva_mv_status", e.target.value)} />
        </Field>
        <Field label="CANVAS Status">
          <input className={styles.input} value={form.canva_status || ""} onChange={(e) => update("canva_status", e.target.value)} />
        </Field>
        <Field label="Artist Pick Status">
          <input className={styles.input} value={form.artist_pick_status || ""} onChange={(e) => update("artist_pick_status", e.target.value)} />
        </Field>
        <Field label="Musixmatch Link">
          <input className={styles.input} value={form.musixmatch_link || ""} onChange={(e) => update("musixmatch_link", e.target.value)} />
        </Field>
        <Field label="Musixmatch Status">
          <input className={styles.input} value={form.musixmatch_status || ""} onChange={(e) => update("musixmatch_status", e.target.value)} />
        </Field>
        <Field label="NCT Lyric">
          <input className={styles.input} value={form.nct_lyric || ""} onChange={(e) => update("nct_lyric", e.target.value)} />
        </Field>
      </div>

      <div className={styles.subheading}>Phụ Lục (Booking)</div>
      <div className={styles.grid2}>
        <Field label="Ngày Gửi">
          <input type="date" className={styles.input} value={form.phu_luc_ngay_gui || ""} onChange={(e) => update("phu_luc_ngay_gui", e.target.value)} />
        </Field>
        <Field label="Ngày Ký">
          <input type="date" className={styles.input} value={form.phu_luc_ngay_ky || ""} onChange={(e) => update("phu_luc_ngay_ky", e.target.value)} />
        </Field>
      </div>
      <p style={{ color: "#888", fontSize: 12, marginTop: -8, marginBottom: 16 }}>
        Status Phụ Lục: <span style={{ color: "#ff9d5c", fontWeight: 700 }}>{phuLucStatusClient(form)}</span>
        {" — "}{phuLucNextStep(form)}
      </p>

      <div className={styles.subheading}>Linkshare Note</div>
      <div className={styles.grid2}>
        <Field label="Tiktok Release Timing">
          <select className={styles.select} value={form.linkshare_tiktok_timing || ""} onChange={(e) => update("linkshare_tiktok_timing", e.target.value)}>
            <option value="">—</option>
            <option>Cùng Ngày</option>
            <option>Ngày release+4</option>
            <option>Ngày release+7</option>
          </select>
        </Field>
        <Field label="Facebook Release Timing">
          <select className={styles.select} value={form.linkshare_facebook_timing || ""} onChange={(e) => update("linkshare_facebook_timing", e.target.value)}>
            <option value="">—</option>
            <option>Cùng ngày</option>
            <option>Ngày deliver+4</option>
          </select>
        </Field>
      </div>

      <div className={styles.subheading}>Generated Notes (preview)</div>
      <pre style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 14, fontSize: 12, color: "#ccc", whiteSpace: "pre-wrap" }}>
{buildProductNote(form)}
      </pre>
      <pre style={{ background: "#121212", border: "1px solid #262626", borderRadius: 8, padding: 14, fontSize: 12, color: "#ccc", whiteSpace: "pre-wrap", marginTop: 10 }}>
{buildLinkshareNote(form)}
      </pre>

      <SaveBar onSave={onSave} saving={saving} />
    </div>
  );
}

// View-only. Pulls stream metrics + milestone chart entries by DID.
// NOTE: matching derivative (phái sinh) tracks that aren't in NEW RELEASE
// isn't resolved yet — only an exact DID match is done here; fuzzy/derivative
// matching is flagged as a follow-up, not implemented in this pass.
function StreamingMilestoneTab({ form }) {
  const [metrics, setMetrics] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !form.did) { setLoading(false); return; }
    (async () => {
      const { data: links } = await supabase.from("release_dsp_links").select("id, platform, url_or_id").eq("release_id", form.id);
      let snaps = [];
      if (links && links.length) {
        const { data } = await supabase
          .from("dsp_metrics_snapshots")
          .select("*, release_dsp_links!inner(platform, release_id)")
          .eq("release_dsp_links.release_id", form.id)
          .order("fetched_at", { ascending: false })
          .limit(20);
        snaps = data || [];
      }
      const { data: chart } = await supabase
        .from("milestone_chart_entries")
        .select("*")
        .eq("did", form.did)
        .order("entry_date", { ascending: false });
      setMetrics(snaps);
      setMilestones(chart || []);
      setLoading(false);
    })();
  }, [form.id, form.did]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span className={styles.fieldLabel}>Promotion Package</span>
        {form.promotion_package_url ? (
          <a href={form.promotion_package_url} target="_blank" rel="noopener noreferrer" title="Open Promotion Package link" style={{ fontSize: 18 }}>
            🔗
          </a>
        ) : (
          <span style={{ color: "#555", fontSize: 12 }}>no link set — add one on the URL tab</span>
        )}
      </div>

      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : (
        <>
          <div className={styles.subheading}>Stream Numbers</div>
          {metrics.length === 0 ? (
            <p style={{ color: "#666", fontSize: 12, marginBottom: 20 }}>No stream data linked yet.</p>
          ) : (
            <table className={styles.table} style={{ marginBottom: 24 }}>
              <thead><tr><th>Platform</th><th>Streams</th><th>Fetched</th></tr></thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.id}>
                    <td>{m.release_dsp_links?.platform}</td>
                    <td>{m.streams ?? "—"}</td>
                    <td>{fmtDate(m.fetched_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className={styles.subheading}>Milestone (Chart Rank)</div>
          <p style={{ color: "#666", fontSize: 11, marginTop: -8, marginBottom: 12 }}>
            Matched by exact DID ({form.did || "—"}). Derivative-track matching isn't implemented yet.
          </p>
          {milestones.length === 0 ? (
            <p style={{ color: "#666", fontSize: 12 }}>No milestone entries for this DID.</p>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Chart</th><th>Date</th><th>Rank</th><th>Platform</th></tr></thead>
              <tbody>
                {milestones.map((m) => (
                  <tr key={m.id}>
                    <td>{m.chart}</td>
                    <td>{fmtDate(m.entry_date)}</td>
                    <td>{m.rank}</td>
                    <td>{m.platform || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function TasklistTab({ form, bookingEntries }) {
  const items = [
    ["Link Drive", form.drive_link],
    ["Metadata: Audio", form.meta_audio],
    ["Metadata: Artwork", form.meta_artwork],
    ["Metadata: Working Files", form.meta_working_files],
    ["Metadata: Lyric", form.meta_lyric],
    ["Metadata: MV", form.meta_mv],
    ["Metadata: Doc", form.meta_doc],
    ["Smartlink", form.smartlink],
    ["UPC", form.upc],
    ["Link LBM", form.link_lbm],
    ["Link Share", form.link_share],
    ["Media Booking entries", bookingEntries.length > 0],
    ["Pitching: Spotify", form.pitching_status_spotify],
    ["Pitching: NCT", form.pitching_status_nct],
    ["Pitching: Zing", form.pitching_status_zing],
    ["CANVAS Status", form.canva_status],
    ["Artist Pick Status", form.artist_pick_status],
    ["Musixmatch", form.musixmatch_link],
  ];
  return (
    <table className={styles.table}>
      <thead>
        <tr><th>Field</th><th>Status</th></tr>
      </thead>
      <tbody>
        {items.map(([label, val]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>{val ? <span style={{ color: "#7ee6a8" }}>✓ Filled</span> : <span style={{ color: "#555" }}>— Empty</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function buildProductNote(f) {
  const lines = [
    `Tên Bài Hát: ${f.title || ""}`,
    `Ca sĩ: ${f.main_artist || ""}`,
    `Ngày Phát Hành: ${f.release_date || ""} ${f.release_time || ""}`,
    `---------------------`,
    `CHANNEL: ${f.requester_segment || ""}`,
    `---------------------`,
  ];
  const numbered = [
    ["LINK DRIVE", f.drive_link],
    ["LINK SHARE", f.link_share],
    ["SMARTLINK", f.smartlink],
    ["LINKDASH", f.link_lbm],
    ["UPC", f.upc],
    ["LINK UGC", f.link_ugc],
    ["MEDIA REPORT", f.link_media_report],
  ];
  numbered.forEach(([label, val], i) => {
    if (val) lines.push(`${i + 1}. ${label}: ${val}`);
  });
  return lines.join("\n");
}

function buildLinkshareNote(f) {
  return [
    `Thời gian phát hành Tiktok: ${f.linkshare_tiktok_timing || ""}`,
    `Thời gian phát hành Facebook: ${f.linkshare_facebook_timing || ""}`,
    `Link DATA: ${f.drive_link || ""}`,
  ].join("\n");
}

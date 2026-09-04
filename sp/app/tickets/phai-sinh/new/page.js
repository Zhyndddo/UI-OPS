"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../lib/AppShell";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuth } from "../../../../lib/AuthContext";
import { LabelInput, ArtistInput } from "../../../../lib/ReferenceInputs";
import RelatedDidField from "../../../../lib/RelatedDidField";
import { parseBatchPaste, BATCH_ITEM_COLUMNS } from "../../../../lib/phaiSinhBatchParse";
import BatchFileImport from "../../../../lib/BatchFileImport";
import { PHAI_SINH_TYPE_OPTIONS, isKhoNhacType } from "../../../../lib/phaiSinhTypes";
import CopyrightChecklistFields from "../../../../lib/CopyrightChecklistFields";
import { emptyCopyrightChecklist, mushCopyrightChecklistToText } from "../../../../lib/copyrightChecklist";
import styles from "../../../shared.module.css";

// Round 41 — Phái Sinh and Phái Sinh (Batch) merged into one ticket type,
// one form. Type now drives which flow renders: "Phái sinh" is the
// original one-song form below (unchanged); "Kho nhạc" / "Chuyển net" /
// "Takedown" all switch to the batch flow (one parent ticket + a pasted
// or file-imported list of songs as children in phai_sinh_batch_items —
// same table Phái Sinh (Batch) already used, reused here instead of a
// second one). Per explicit request, Tên Bài/Related DID/Artist/Feature
// Artist/URL/Composer/Lyricist/Producer/Mixer/Release Date/Release Time
// don't apply to a Kho Nhạc-family parent (that data lives per-song in
// the children table instead) — Label/Tác Quyền/Description/Deadline
// still do and stay in the form.
export default function PhaiSinhNewTicket() {
  const router = useRouter();
  const { profile } = useAuth();

  const [typeRequest, setTypeRequest] = useState(PHAI_SINH_TYPE_OPTIONS[0]);
  const isBatch = isKhoNhacType(typeRequest);

  const [deadline, setDeadline] = useState("");
  const [deadlineTouched, setDeadlineTouched] = useState(false);
  const [tenBai, setTenBai] = useState("");
  const [relatedDid, setRelatedDid] = useState("");
  const [artist, setArtist] = useState("");
  const [featureArtist, setFeatureArtist] = useState("");
  const [label, setLabel] = useState("");
  const [composer, setComposer] = useState("");
  const [lyricist, setLyricist] = useState("");
  const [producer, setProducer] = useState("");
  const [mixer, setMixer] = useState("");
  const [url, setUrl] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [releaseTime, setReleaseTime] = useState("");
  const [tacQuyen, setTacQuyen] = useState("");
  const [description, setDescription] = useState("Full CID, FB +4 ngày, TikTok +7 ngày");

  // Round 95 — Tác Quyền's real input is now the same structured checklist
  // widget as the Copyrights tab (release detail page)/New Release Setup —
  // tacQuyenChecklist holds that structured shape. What actually gets
  // saved into the ticket (tacQuyen, above) stays a plain string though,
  // since that's what the ticket index table cell and every other reader
  // of tacQuyen already expects — it's kept auto-synced to a "mushed" text
  // block generated from the checklist (see mushCopyrightChecklistToText)
  // UNLESS the requester types directly into the text box themselves, at
  // which point tacQuyenTouched stops the auto-sync so their edit isn't
  // clobbered by the next checklist change. "↻ Regenerate" resets that.
  const [tacQuyenChecklist, setTacQuyenChecklist] = useState(emptyCopyrightChecklist());
  const [tacQuyenTouched, setTacQuyenTouched] = useState(false);

  function handleTacQuyenChecklistChange(next) {
    setTacQuyenChecklist(next);
    if (!tacQuyenTouched) setTacQuyen(mushCopyrightChecklistToText(next));
  }

  function regenerateTacQuyenText() {
    setTacQuyen(mushCopyrightChecklistToText(tacQuyenChecklist));
    setTacQuyenTouched(false);
  }

  // Batch-flow-only state.
  const [pasteText, setPasteText] = useState("");
  const [fileRows, setFileRows] = useState(null); // { rows, skipped, fileName } | null — file import takes priority over the paste box if both are used
  const { rows: pastedRows, skipped: pasteSkipped } = parseBatchPaste(pasteText);
  const importedRows = fileRows ? fileRows.rows : pastedRows;
  const importedSkipped = fileRows ? fileRows.skipped : pasteSkipped;

  const [artists, setArtists] = useState([]);
  const [labels, setLabels] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("artists").select("stage_name, labels(label_name)").order("stage_name").then(({ data }) => setArtists(data || []));
    supabase.from("labels").select("label_name").order("label_name").then(({ data }) => setLabels(data || []));
  }, []);

  // Deadline defaults to Release Date until the requester picks a deadline
  // themselves — clearing it back to blank re-enables the auto-fill, so it
  // keeps tracking Release Date edits until an explicit choice is made.
  // (Kho Nhạc-family tickets have no Release Date field, so this simply
  // never fires for them — Deadline stays whatever's typed in directly.)
  useEffect(() => {
    if (!releaseDate || deadlineTouched) return;
    setDeadline(releaseDate);
  }, [releaseDate, deadlineTouched]);

  function handleDeadlineChange(v) {
    setDeadline(v);
    setDeadlineTouched(v !== "");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!supabase) {
      setError("Supabase isn't configured — check environment variables.");
      return;
    }
    if (!supabase) return;

    if (isBatch) {
      if (importedRows.length === 0) {
        setError("Paste or import at least one song first — nothing parsed yet.");
        return;
      }
      setSubmitting(true);
      const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "phai_sinh").single();
      if (tabErr || !tab) {
        setSubmitting(false);
        setError("Couldn't find the Phái Sinh ticket type — did schema.sql get redeployed?");
        return;
      }
      const { data: created, error: insertErr } = await supabase
        .from("tickets")
        .insert({
          tab_id: tab.id,
          data: { typeRequest, label, tacQuyen, description },
          deadline: deadline || null,
          status: tab.default_status,
          status_log: { [tab.default_status]: new Date().toISOString() },
          requester_segment: profile?.segment || null,
          requester_name: profile?.name || null,
        })
        .select()
        .single();
      if (insertErr || !created) {
        setSubmitting(false);
        setError(insertErr?.message || "Couldn't create the ticket.");
        return;
      }
      const { error: itemsErr } = await supabase.from("phai_sinh_batch_items").insert(
        importedRows.map((r) => ({ ...r, batch_ticket_id: created.id }))
      );
      setSubmitting(false);
      if (itemsErr) {
        setError(`Ticket created, but songs failed to import: ${itemsErr.message}. Open it and use "+ Add" to retry.`);
        return;
      }
      router.push(`/tickets/batch-phai-sinh/${created.id}`);
      return;
    }

    if (!tenBai.trim() || !artist.trim() || !tacQuyen.trim()) {
      setError("Tên Bài, Artist, and Tác Quyền required.");
      return;
    }
    setSubmitting(true);
    const { data: tab, error: tabErr } = await supabase.from("ticket_tabs").select("id, default_status").eq("key", "phai_sinh").single();
    if (tabErr || !tab) {
      setSubmitting(false);
      setError("Couldn't find the Phái Sinh ticket type — did schema.sql get redeployed?");
      return;
    }

    const data = {
      typeRequest,
      tenBai,
      relatedDid,
      artist,
      label,
      composer,
      producer,
      url,
      tacQuyen,
      releaseDate,
      releaseTime,
      description,
    };
    if (featureArtist.trim()) data.featureArtist = featureArtist;
    // Lyricist/Mixer only go into the record if actually filled in —
    // leaving either blank means "same as Composer", which the list
    // view's computed Composer/Lyricist and Mixer display already falls
    // back to on its own.
    if (lyricist.trim()) data.lyricist = lyricist;
    if (mixer.trim()) data.mixer = mixer;

    const { error: insertErr } = await supabase.from("tickets").insert({
      tab_id: tab.id,
      data,
      deadline: deadline || null,
      status: tab.default_status,
      status_log: { [tab.default_status]: new Date().toISOString() },
      requester_segment: profile?.segment || null,
      requester_name: profile?.name || null,
    });
    setSubmitting(false);
    if (insertErr) setError(insertErr.message);
    else router.push("/tickets/phai-sinh");
  }

  // Shared between the batch form and the single-song form below — same
  // structured checklist + auto-synced free-text block either way, just
  // required on the single-song form.
  function tacQuyenField(required) {
    return (
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Tác Quyền {required && <span className={styles.required}>*</span>}</label>
        <CopyrightChecklistFields styles={styles} value={tacQuyenChecklist} onChange={handleTacQuyenChecklistChange} compact />
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              Auto-filled from the checklist above — free-edit below if needed (this text is what actually saves).
            </span>
            <button type="button" className={styles.btnSmall} onClick={regenerateTacQuyenText}>↻ Regenerate</button>
          </div>
          <textarea
            className={styles.textarea}
            value={tacQuyen}
            onChange={(e) => { setTacQuyen(e.target.value); setTacQuyenTouched(true); }}
          />
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: isBatch ? 760 : 640 }}>
          <Link href="/tickets/phai-sinh" className={styles.backLink}>← Back</Link>
          <div className={styles.eyebrow}>// New Ticket</div>
          <h1 className={styles.title}>Phái Sinh</h1>

          {error && <div className={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Type</label>
                <select className={styles.select} value={typeRequest} onChange={(e) => setTypeRequest(e.target.value)}>
                  {PHAI_SINH_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Deadline (Hạn Cuối)</label>
                <input type="date" className={styles.input} value={deadline} onChange={(e) => handleDeadlineChange(e.target.value)} />
                {!isBatch && (
                  <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                    If not picked, defaults to taking Release Date as deadline.
                  </p>
                )}
              </div>
            </div>

            {isBatch ? (
              <>
                <div className={styles.grid2}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Label</label>
                    <LabelInput styles={styles} value={label} onChange={setLabel} labels={labels} placeholder="Type or pick from Label List…" />
                  </div>
                </div>
                {tacQuyenField(false)}
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Description</label>
                  <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Songs — paste or import a file</label>
                  <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 0, marginBottom: 8 }}>
                    Expected column order: {BATCH_ITEM_COLUMNS.join(" · ")}. A header row is auto-skipped either way.
                    If you import a file, it takes priority over anything pasted below.
                  </p>
                  <BatchFileImport styles={styles} onParsed={setFileRows} />
                  <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "10px 0 4px" }}>— or paste directly —</p>
                  <textarea
                    className={styles.textarea}
                    style={{ minHeight: 200, fontFamily: "monospace", fontSize: 11 }}
                    value={pasteText}
                    onChange={(e) => { setPasteText(e.target.value); setFileRows(null); }}
                    placeholder="Paste tab-separated rows here…"
                    disabled={!!fileRows}
                  />
                  <p style={{ fontSize: 12, marginTop: 6, color: importedRows.length > 0 ? "var(--success-fg)" : "var(--text-faint)" }}>
                    {fileRows ? `From ${fileRows.fileName}: ` : ""}
                    {importedRows.length} song{importedRows.length === 1 ? "" : "s"} parsed
                    {importedSkipped > 0 ? `, ${importedSkipped} blank line${importedSkipped === 1 ? "" : "s"} skipped` : ""}.
                    {fileRows && (
                      <button type="button" onClick={() => setFileRows(null)} style={{ marginLeft: 8, background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>
                        clear file, use paste instead
                      </button>
                    )}
                  </p>
                </div>

                <button className={styles.btnPrimary} type="submit" disabled={submitting}>
                  {submitting ? "Creating…" : `Create Ticket (${importedRows.length} song${importedRows.length === 1 ? "" : "s"})`}
                </button>
              </>
            ) : (
              <>
                <div className={styles.grid2}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Tên Bài <span className={styles.required}>*</span></label>
                    <input className={styles.input} value={tenBai} onChange={(e) => setTenBai(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Related DID</label>
                    <RelatedDidField styles={styles} value={relatedDid} onChange={setRelatedDid} />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Artist <span className={styles.required}>*</span></label>
                    <ArtistInput styles={styles} value={artist} onChange={setArtist} artists={artists} placeholder="Type or pick from Artist List…" />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Feature Artist</label>
                    <ArtistInput styles={styles} value={featureArtist} onChange={setFeatureArtist} artists={artists} placeholder="Feat. artist(s), if any…" />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Label</label>
                    <LabelInput styles={styles} value={label} onChange={setLabel} labels={labels} placeholder="Type or pick from Label List…" />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>URL</label>
                    <input className={styles.input} value={url} onChange={(e) => setUrl(e.target.value)} />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Composer</label>
                    <input className={styles.input} value={composer} onChange={(e) => setComposer(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Lyricist</label>
                    <input className={styles.input} value={lyricist} onChange={(e) => setLyricist(e.target.value)} />
                    <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                      If not filled, defaults to taking the same name as Composer.
                    </p>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Producer</label>
                    <input className={styles.input} value={producer} onChange={(e) => setProducer(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Mixer</label>
                    <input className={styles.input} value={mixer} onChange={(e) => setMixer(e.target.value)} />
                    <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                      If not filled, defaults to taking the same name as Composer.
                    </p>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Release Date</label>
                    <input type="date" className={styles.input} value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Release Time</label>
                    <input className={styles.input} value={releaseTime} onChange={(e) => setReleaseTime(e.target.value)} />
                  </div>
                </div>

                {tacQuyenField(true)}
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Description</label>
                  <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>

                <button className={styles.btnPrimary} type="submit" disabled={submitting}>
                  {submitting ? "Creating…" : "Create Ticket"}
                </button>
              </>
            )}
          </form>
        </div>
      </div>
    </AppShell>
  );
}

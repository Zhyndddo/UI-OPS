"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "../../../../lib/AppShell";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuth } from "../../../../lib/AuthContext";
import { LabelInput, ArtistInput } from "../../../../lib/ReferenceInputs";
import RelatedDidField from "../../../../lib/RelatedDidField";
import styles from "../../../shared.module.css";

const TYPE_OPTIONS = ["Phái sinh", "Kho nhạc"];

// Bespoke — like Design, Phái Sinh outgrew the generic form: Type +
// Deadline share a row up top, Composer/Lyricist/Mixer default off each
// other, Artist/Feature Artist/Label reference the same Artist/Label List
// tables the New Release form uses (free text still allowed, matching an
// existing row just lets you pick it).
//
// LBM url and Note are intentionally NOT collected here — OPS fills those
// in after the work is actually done, from the ticket list
// (app/tickets/phai-sinh/page.js), same as before. Nothing downstream
// changed; the requester just isn't asked to guess at them up front.
export default function PhaiSinhNewTicket() {
  const router = useRouter();
  const { profile } = useAuth();

  const [typeRequest, setTypeRequest] = useState(TYPE_OPTIONS[0]);
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
    if (!tenBai.trim() || !artist.trim() || !tacQuyen.trim()) {
      setError("Tên Bài, Artist, and Tác Quyền required.");
      return;
    }
    if (!supabase) {
      setError("Supabase isn't configured — check environment variables.");
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

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.container} style={{ maxWidth: 640 }}>
          <Link href="/tickets/phai-sinh" className={styles.backLink}>← Back</Link>
          <div className={styles.eyebrow}>// New Ticket</div>
          <h1 className={styles.title}>Phái Sinh</h1>

          {error && <div className={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Type</label>
                <select className={styles.select} value={typeRequest} onChange={(e) => setTypeRequest(e.target.value)}>
                  {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Deadline</label>
                <input type="date" className={styles.input} value={deadline} onChange={(e) => handleDeadlineChange(e.target.value)} />
                <p style={{ color: "var(--text-faint)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                  If not picked, defaults to taking Release Date as deadline.
                </p>
              </div>

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

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Tác Quyền <span className={styles.required}>*</span></label>
              <textarea className={styles.textarea} value={tacQuyen} onChange={(e) => setTacQuyen(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Description</label>
              <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <button className={styles.btnPrimary} type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Ticket"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}

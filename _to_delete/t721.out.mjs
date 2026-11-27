// lib/releaseInfoForm.js
function previewSeconds(v) {
  const s = String(v == null ? "" : v).trim().replace(/\s*(s|giây|sec)$/i, "");
  if (/^\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s)));
  const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  if (!m) return String(v == null ? "" : v).trim();
  return String(m[3] != null ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]));
}
var PROJECT_KINDS = [
  { key: "pitching", label: "Pitching & h\u1ED7 tr\u1EE3 truy\u1EC1n th\xF4ng", sub: "G\u1EEDi tr\u01B0\u1EDBc t\u1ED1i thi\u1EC3u 14 ng\xE0y" },
  { key: "release_only", label: "Ch\u1EC9 ph\xE1t h\xE0nh / ph\xE2n ph\u1ED1i (kh\xF4ng Pitching)", sub: "G\u1EEDi tr\u01B0\u1EDBc t\u1ED1i thi\u1EC3u 04 ng\xE0y l\xE0m vi\u1EC7c" },
  { key: "urgent", label: "D\u1EF1 \xE1n g\u1EA5p (ph\xE1t h\xE0nh trong 24\u201348h)", sub: "TikTok \u2265 24h \xB7 Zing MP3 \u2265 48h (Th\u1EE9 2\u2013Th\u1EE9 5) \xB7 Meta \u2265 04 ng\xE0y" }
];
var FILE_FIELDS = [
  { key: "audio", label: "File audio", hint: "24bit, 48000Hz, WAV" },
  { key: "artwork", label: "File h\xECnh", hint: "3000x3000px" },
  { key: "mv", label: "File MV", hint: "n\u1EBFu c\xF3" },
  { key: "dsp_photo", label: "H\xECnh profile DSP", hint: "n\u1EBFu ngh\u1EC7 s\u0129 mu\u1ED1n c\u1EADp nh\u1EADt h\xECnh profile tr\u01B0\u1EDBc khi ra m\u1EAFt" }
];
var PLATFORMS = [
  { key: "spotify", label: "Spotify" },
  { key: "apple", label: "Apple Music" },
  { key: "zing", label: "Zing MP3" },
  { key: "nct", label: "NCT" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" }
];
var REQUIRED_PLATFORMS = ["spotify", "apple"];
var PROMO_FIELDS = [
  { key: "artist_photo", label: "Artist Photo", hint: "b\u1ED9 \u1EA3nh ngh\u1EC7 s\u0129 ch\u1EA5t l\u01B0\u1EE3ng cao" },
  { key: "mv_photo", label: "MV Photo", hint: "\u1EA3nh h\u1EADu tr\u01B0\u1EDDng, stills t\u1EEB MV" },
  { key: "bts", label: "Behind The Scenes", hint: "clip / h\xECnh h\u1EADu tr\u01B0\u1EDDng thu \xE2m, quay MV" },
  { key: "short_video", label: "Short Video / Lipsync TikTok", hint: "video ng\u1EAFn qu\u1EA3ng b\xE1 tr\u01B0\u1EDBc/sau ph\xE1t h\xE0nh" },
  { key: "cta", label: "CTA Video / Audio", hint: "video k\xEAu g\u1ECDi fan tr\xEAn t\u1EA5t c\u1EA3 n\u1EC1n t\u1EA3ng" },
  { key: "media_plan", label: "K\u1EBF ho\u1EA1ch truy\u1EC1n th\xF4ng", hint: "master plan / timeline, n\u1EBFu c\xF3" },
  { key: "design_file", label: "File h\xECnh thi\u1EBFt k\u1EBF", hint: "psd / tiff" }
];
var DIRECTION_FIELDS = [
  { key: "goal", label: "M\u1EE5c ti\xEAu v\xE0 \xFD \u0111\u1ECBnh", hint: "L\xFD do th\u1EF1c hi\u1EC7n d\u1EF1 \xE1n, th\xF4ng \u0111i\u1EC7p ch\xEDnh, c\u1EA3m x\xFAc mong mu\u1ED1n mang \u0111\u1EBFn cho ng\u01B0\u1EDDi nghe." },
  { key: "style", label: "Phong c\xE1ch & c\xE1ch ti\u1EBFp c\u1EADn", hint: "M\xE0u s\u1EAFc \xE2m nh\u1EA1c, ch\u1EA5t li\u1EC7u / k\u1EF9 thu\u1EADt s\u1EA3n xu\u1EA5t, s\u1EF1 th\u1EED nghi\u1EC7m ho\u1EB7c pha tr\u1ED9n phong c\xE1ch." },
  { key: "story", label: "\xDD ngh\u0129a v\xE0 c\xE2u chuy\u1EC7n", hint: "Nh\u1EEFng suy ngh\u0129, c\u1EA3m x\xFAc, c\xE2u chuy\u1EC7n truy\u1EC1n c\u1EA3m h\u1EE9ng g\u1EEDi g\u1EAFm trong t\xE1c ph\u1EA9m." }
];
var DESIGN_FIELDS = [
  { key: "spotify_video", label: "Spotify Video Banner", hint: "16:9 \xB7 .MOV/.MP4 \xB7 t\u1ED1i \u0111a 30 gi\xE2y \xB7 t\u1ED1i \u0111a 500MB \xB7 t\u1ED1i thi\u1EC3u 1280x720 \xB7 \xE2m thanh chu\u1EA9n h\xF3a theo Spotify" },
  { key: "spotify_image", label: "Spotify Image Banner", hint: "1.91:1 \xB7 800x418 \u2192 1200x628 px \xB7 .JPG \xB7 t\u1ED1i \u0111a 1MB" },
  { key: "zing_psd", label: "Zing MP3", hint: "file PSD (Zing t\u1EF1 resize theo chu\u1EA9n hi\u1EC3n th\u1ECB)" },
  { key: "nct", label: "Nh\u1EA1c C\u1EE7a Tui (NCT)", hint: "1280 x 256 px" },
  { key: "cta_clip", label: "Call-to-action video clip / audio", hint: "Zing MP3 / NCT / Spotify (khi BTV n\u1EC1n t\u1EA3ng y\xEAu c\u1EA7u)" }
];
var str = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
var isoDate = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x));
var link = (v) => str(v, 500);
var mapLinks = (src, fields) => Object.fromEntries(fields.map((f) => [f.key, link(src?.[f.key])]));
function workingDaysBetween(from, to) {
  let n = 0;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) n += 1;
  }
  return n;
}
function deadlineCheck(kind, releaseIso, now = /* @__PURE__ */ new Date()) {
  if (!isoDate(releaseIso || "")) return { level: "info", text: "Ch\u1ECDn ng\xE0y ph\xE1t h\xE0nh \u0111\u1EC3 ki\u1EC3m tra th\u1EDDi h\u1EA1n g\u1EEDi d\u1EF1 \xE1n." };
  const rel = /* @__PURE__ */ new Date(releaseIso + "T00:00:00");
  const days = Math.round((rel - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  if (days < 0) return { level: "warn", past: true, text: `Ng\xE0y ph\xE1t h\xE0nh ${releaseIso.split("-").reverse().join("/")} \u0111\xE3 qua. B\u1EA1n v\u1EABn c\xF3 th\u1EC3 g\u1EEDi, nh\u01B0ng h\xE3y ki\u1EC3m tra l\u1EA1i ng\xE0y ph\xE1t h\xE0nh.` };
  if (kind === "pitching") return days >= 14 ? { level: "ok", text: `C\xF2n ${days} ng\xE0y \u2014 \u0111\u1EE7 th\u1EDDi h\u1EA1n Pitching (t\u1ED1i thi\u1EC3u 14 ng\xE0y).` } : { level: "warn", late: true, text: `Ch\u1EC9 c\xF2n ${days} ng\xE0y \u2014 d\u1EF1 \xE1n Pitching c\u1EA7n g\u1EEDi tr\u01B0\u1EDBc t\u1ED1i thi\u1EC3u 14 ng\xE0y.` };
  if (kind === "release_only") {
    const w = workingDaysBetween(now, rel);
    return w >= 4 ? { level: "ok", text: `C\xF2n ${w} ng\xE0y l\xE0m vi\u1EC7c \u2014 \u0111\u1EE7 th\u1EDDi h\u1EA1n (t\u1ED1i thi\u1EC3u 04 ng\xE0y l\xE0m vi\u1EC7c).` } : { level: "warn", text: `Ch\u1EC9 c\xF2n ${w} ng\xE0y l\xE0m vi\u1EC7c \u2014 d\u1EF1 \xE1n ch\u1EC9 ph\xE1t h\xE0nh c\u1EA7n g\u1EEDi tr\u01B0\u1EDBc t\u1ED1i thi\u1EC3u 04 ng\xE0y l\xE0m vi\u1EC7c.`, late: true };
  }
  if (kind === "urgent") return { level: "info", text: "D\u1EF1 \xE1n g\u1EA5p: th\u1EDDi h\u1EA1n t\xF9y n\u1EC1n t\u1EA3ng \u2014 TikTok \u2265 24h, Zing MP3 \u2265 48h (ch\u1EC9 nh\u1EADn Th\u1EE9 2\u2013Th\u1EE9 5), Meta \u2265 04 ng\xE0y." };
  return { level: "info", text: "Ch\u1ECDn lo\u1EA1i d\u1EF1 \xE1n \u0111\u1EC3 ki\u1EC3m tra th\u1EDDi h\u1EA1n g\u1EEDi." };
}
var REST_MIN = 3;
var RELEASE_TYPE_KEYS = ["Single", "EP", "Album"];
function restFilled(a) {
  const n = (o) => Object.values(o || {}).filter((v) => String(v || "").trim()).length;
  return n(a.promo) + n(a.direction) + (a.project_kind === "pitching" ? n(a.design) : 0);
}
var cleanTrackRights = (r2) => {
  const x = r2 && typeof r2 === "object" ? r2 : {};
  const keys = ["master", "performing", "publishing"];
  const pick = (g) => Object.fromEntries(keys.filter((k) => x[g] && x[g][k] === true).map((k) => [k, true]));
  const owned = pick("owned"), licensed = pick("licensed");
  keys.forEach((k) => {
    if (owned[k] && licensed[k]) delete licensed[k];
  });
  const d = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "";
  const out = { owned, licensed, platforms: x.platforms === "all" || x.platforms === "some" ? x.platforms : "", platforms_note: String(x.platforms_note || "").slice(0, 300).trim(), term: x.term === "perpetual" || x.term === "limited" ? x.term : "", term_from: d(x.term_from), term_to: d(x.term_to), proof: String(x.proof || "").slice(0, 500).trim() };
  return out.platforms || out.term || out.proof || Object.keys(owned).length || Object.keys(licensed).length ? out : null;
};
function cleanReleaseInfo(input, opts = {}) {
  const i = input || {};
  const kind = PROJECT_KINDS.some((k) => k.key === i.project_kind) ? i.project_kind : "";
  const genres = (Array.isArray(i.genres) ? i.genres : []).map((g) => str(g, 60)).filter(Boolean).slice(0, 2);
  const profiles = (Array.isArray(i.profiles) ? i.profiles : []).map((r2) => ({ p: PLATFORMS.some((x) => x.key === r2?.p) ? r2.p : "", url: link(r2?.url) })).filter((r2) => r2.p && r2.url).slice(0, 16);
  const d = {
    song_title: str(i.song_title, 200),
    performer: str(i.performer, 200),
    composer: str(i.composer, 200),
    producer: str(i.producer, 200),
    mixer: str(i.mixer, 200),
    lyricist: str(i.lyricist, 200),
    featuring: str(i.featuring, 200),
    genres,
    project_kind: kind,
    release_date: isoDate(str(i.release_date, 10)) ? str(i.release_date, 10) : "",
    release_time: /^\d{2}:\d{2}$/.test(str(i.release_time, 5)) ? str(i.release_time, 5) : "",
    preview_time: previewSeconds(str(i.preview_time, 40)),
    tiktok_demo_date: isoDate(str(i.tiktok_demo_date, 10)) ? str(i.tiktok_demo_date, 10) : "",
    lyrics: str(i.lyrics, 2e4),
    profile_links: str(i.profile_links, 1500),
    profiles,
    profile_returning: i.profile_returning === true,
    audio_kind: i.audio_kind === "demo" ? "demo" : "final",
    artwork_kind: i.artwork_kind === "demo" ? "demo" : "final",
    files: mapLinks(i.files, FILE_FIELDS),
    promo: mapLinks(i.promo, PROMO_FIELDS),
    design: kind === "pitching" ? mapLinks(i.design, DESIGN_FIELDS) : {},
    direction: Object.fromEntries(DIRECTION_FIELDS.map((f) => [f.key, str(i.direction?.[f.key], 2e3)])),
    contact_email: str(i.contact_email, 120),
    sender_name: str(i.sender_name, 120),
    note: str(i.note, 3e3),
    label: str(i.label, 120),
    release_type: RELEASE_TYPE_KEYS.includes(i.release_type) ? i.release_type : "",
    deliver_only: !!kind && kind !== "pitching"
  };
  d.tracks = d.release_type === "EP" || d.release_type === "Album" ? (Array.isArray(i.tracks) ? i.tracks : []).map((t) => {
    const o = typeof t === "string" ? { title: t } : t || {};
    return { title: str(o.title, 200), performer: str(o.performer == null ? d.performer : o.performer, 200), featuring: str(o.featuring, 200), preview_time: previewSeconds(str(o.preview_time, 40)), rights_note: str(o.rights_note, 600), rights: cleanTrackRights(o.rights), composer: str(o.composer, 200), lyricist: str(o.lyricist, 200), producer: str(o.producer, 200), mixer: str(o.mixer, 200), lyrics: str(o.lyrics, 2e4) };
  }).filter((t) => t.title).slice(0, 40) : [];
  d.late_ack = i.late_ack === true;
  if (d.deliver_only) {
    d.promo = {};
    d.direction = {};
    d.design = {};
  }
  if (opts.intro) {
    if (!d.label) return { ok: false, error: "Vui l\xF2ng nh\u1EADp Label (ho\u1EB7c ghi t\xEAn ngh\u1EC7 s\u0129 n\u1EBFu kh\xF4ng c\xF3 h\xE3ng)." };
    if (!d.release_type) return { ok: false, error: "Vui l\xF2ng ch\u1ECDn lo\u1EA1i h\xECnh: Single / EP / Album." };
    if ((d.release_type === "EP" || d.release_type === "Album") && d.tracks.length < 2) return { ok: false, error: `Vui l\xF2ng nh\u1EADp tracklist c\u1EE7a ${d.release_type} (\xEDt nh\u1EA5t 2 track).` };
  }
  if (!d.song_title) return { ok: false, error: "Vui l\xF2ng nh\u1EADp t\xEAn b\xE0i h\xE1t." };
  if (!d.performer) return { ok: false, error: "Vui l\xF2ng nh\u1EADp ngh\u1EC7 s\u0129 tr\xECnh b\xE0y." };
  if (!d.composer) return { ok: false, error: "Vui l\xF2ng nh\u1EADp t\xEAn ng\u01B0\u1EDDi s\xE1ng t\xE1c." };
  if (!d.profile_returning) {
    const miss = REQUIRED_PLATFORMS.filter((k) => !d.profiles.some((r2) => r2.p === k));
    if (miss.length) return { ok: false, error: `Vui l\xF2ng th\xEAm link profile ngh\u1EC7 s\u0129 tr\xEAn ${miss.map((k) => PLATFORMS.find((x) => x.key === k).label).join(" v\xE0 ")} (ho\u1EB7c t\xEDch "\u0110\xE3 ph\xE1t h\xE0nh v\u1EDBi VIEENT tr\u01B0\u1EDBc \u0111\xE2y").` };
  }
  if (!kind) return { ok: false, error: "Vui l\xF2ng ch\u1ECDn lo\u1EA1i d\u1EF1 \xE1n (Pitching / ch\u1EC9 ph\xE1t h\xE0nh / g\u1EA5p)." };
  if (!d.release_date) return { ok: false, error: "Vui l\xF2ng ch\u1ECDn ng\xE0y ph\xE1t h\xE0nh." };
  if (!d.files.audio || !d.files.artwork) return { ok: false, error: "Vui l\xF2ng th\xEAm link ho\u1EB7c t\u1EA3i l\xEAn File audio v\xE0 File h\xECnh (artwork) \u2014 hai m\u1EE5c n\xE0y b\u1EAFt bu\u1ED9c." };
  const dlc = deadlineCheck(kind, d.release_date, opts.now);
  if (dlc.late && !d.late_ack) return { ok: false, error: "Ng\xE0y ph\xE1t h\xE0nh ch\u01B0a \u0111\u1EE7 th\u1EDDi h\u1EA1n g\u1EEDi t\u1ED1i thi\u1EC3u. Vui l\xF2ng t\xEDch x\xE1c nh\u1EADn \u0111\xE3 hi\u1EC3u \u1EDF m\u1EE5c Th\u1EDDi gian ph\xE1t h\xE0nh." };
  if (!d.deliver_only && restFilled(d) < REST_MIN) return { ok: false, error: `Vui l\xF2ng \u0111i\u1EC1n \xEDt nh\u1EA5t ${REST_MIN} m\u1EE5c \u1EDF ph\u1EA7n T\u01B0 li\u1EC7u truy\u1EC1n th\xF4ng / \u0110\u1ECBnh h\u01B0\u1EDBng n\u1ED9i dung${d.project_kind === "pitching" ? " / Thi\u1EBFt k\u1EBF" : ""} (hi\u1EC7n c\xF3 ${restFilled(d)}), ho\u1EB7c ch\u1ECDn lo\u1EA1i d\u1EF1 \xE1n "Ch\u1EC9 ph\xE1t h\xE0nh".` };
  if (d.contact_email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(d.contact_email)) return { ok: false, error: "Email li\xEAn h\u1EC7 kh\xF4ng h\u1EE3p l\u1EC7." };
  const bad = [...Object.values(d.files), ...Object.values(d.promo), ...Object.values(d.design), ...d.profiles.map((r2) => r2.url)].find((v) => v && !/^https?:\/\//i.test(v));
  if (bad) return { ok: false, error: "C\xE1c \xF4 link ph\u1EA3i b\u1EAFt \u0111\u1EA7u b\u1EB1ng http:// ho\u1EB7c https://." };
  return { ok: true, data: d };
}

// lib/releaseInfoDocs.js
var dmy = (iso) => iso ? iso.split("-").reverse().join("/") : "";
var dash = (v) => String(v || "").trim() ? String(v).trim() : "\u2014";
var when = (a) => [dmy(a.release_date), a.release_time].filter(Boolean).join(" ") || "\u2014";
var RT_NAME = { master: "Master", performing: "Bi\u1EC3u di\u1EC5n", publishing: "T\xE1c gi\u1EA3" };
var rightsText = (r2) => [Object.keys(r2.owned || {}).length && `s\u1EDF h\u1EEFu ${Object.keys(r2.owned).map((k) => RT_NAME[k]).join("/")}`, Object.keys(r2.licensed || {}).length && `c\u1EA5p ph\xE9p ${Object.keys(r2.licensed).map((k) => RT_NAME[k]).join("/")}`, r2.platforms === "all" ? "m\u1ECDi n\u1EC1n t\u1EA3ng" : r2.platforms === "some" ? `n\u1EC1n t\u1EA3ng: ${r2.platforms_note || "m\u1ED9t s\u1ED1"}` : "", r2.term === "perpetual" ? "v\u0129nh vi\u1EC5n" : r2.term === "limited" ? `th\u1EDDi h\u1EA1n ${r2.term_from || "?"} \u2192 ${r2.term_to || "?"}` : "", r2.proof && `minh ch\u1EE9ng: ${r2.proof}`].filter(Boolean).join(", ");
function infoBlocks(a) {
  const kind = PROJECT_KINDS.find((k) => k.key === a.project_kind);
  const b = [
    { t: "title", text: "TH\xD4NG TIN PH\xC1T H\xC0NH" },
    { t: "sub", text: `${dash(a.performer)} \u2014 ${dash(a.song_title)}` },
    { t: "h1", text: "01. X\xC1C NH\u1EACN B\u1EA2N QUY\u1EC0N & CAM K\u1EBET S\u1EEC D\u1EE4NG (COPYRIGHT DECLARATION & TERMS)" },
    { t: "p", text: "B\u1EB1ng vi\u1EC7c \u0111i\u1EC1n v\xE0 g\u1EEDi B\u1EA3n Th\xF4ng Tin Ph\xE1t H\xE0nh n\xE0y, Qu\xFD \u0110\u1ED1i t\xE1c v\xE0 Ngh\u1EC7 s\u0129 cam k\u1EBFt:" },
    { t: "h2", text: "QUY\u1EC0N S\u1EDE H\u1EEEU & T\xCDNH S\xC1NG T\u1EA0O" },
    { t: "p", text: "Cam k\u1EBFt t\xE1c ph\u1EA9m g\u1EEDi ph\xE1t h\xE0nh l\xE0 t\xE1c ph\u1EA9m nguy\xEAn b\u1EA3n, t\u1EF1 s\xE1ng t\u1EA1o, kh\xF4ng sao ch\xE9p/nh\xE1i l\u1EA1i v\xE0 tu\xE2n th\u1EE7 \u0111\xFAng Lu\u1EADt S\u1EDF h\u1EEFu tr\xED tu\u1EC7." },
    { t: "p", text: "\u0110\u1ED1i v\u1EDBi c\xE1c S\u1EA3n ph\u1EA9m KH\xD4NG s\u1EDF h\u1EEFu 100%: \u0110\u1ED1i t\xE1c b\u1EAFt bu\u1ED9c khai b\xE1o \u0111\u1EA7y \u0111\u1EE7, ch\xEDnh x\xE1c th\xF4ng tin c\xE1c b\xEAn li\xEAn quan + th\u1EDDi h\u1EA1n s\u1EDF h\u1EEFu c\u1EE5 th\u1EC3 \u0111\u1ED1i v\u1EDBi 03 nh\xF3m quy\u1EC1n:" },
    { t: "bullet", text: "Master Rights (Quy\u1EC1n Nh\xE0 xu\u1EA5t b\u1EA3n / B\u1EA3n Ghi)" },
    { t: "bullet", text: "Performing Rights (Quy\u1EC1n Bi\u1EC3u di\u1EC5n / Ngh\u1EC7 s\u0129)" },
    { t: "bullet", text: "Publishing Rights (Quy\u1EC1n T\xE1c gi\u1EA3 / S\xE1ng t\xE1c)" },
    { t: "h2", text: "CAM K\u1EBET CH\u1ED0NG GIAN L\u1EACN & TR\xC1CH NHI\u1EC6M PH\xC1P L\xDD" },
    { t: "bullet", text: "Nghi\xEAm c\u1EA5m m\u1ECDi h\xE0nh vi khai b\xE1o gi\u1EA3 m\u1EA1o, gian l\u1EADn ho\u1EB7c cung c\u1EA5p th\xF4ng tin/t\xE0i li\u1EC7u sai s\u1EF1 th\u1EADt." },
    { t: "bullet", text: "Trong tr\u01B0\u1EDDng h\u1EE3p ph\xE1t sinh tranh ch\u1EA5p, vi ph\u1EA1m b\u1EA3n quy\u1EC1n ho\u1EB7c gian l\u1EADn th\xF4ng tin: Qu\xFD \u0110\u1ED1i t\xE1c ch\u1ECBu ho\xE0n to\xE0n tr\xE1ch nhi\u1EC7m tr\u01B0\u1EDBc ph\xE1p lu\u1EADt, \u0111\u1ED3ng th\u1EDDi chi tr\u1EA3 to\xE0n b\u1ED9 chi ph\xED b\u1ED3i th\u01B0\u1EDDng thi\u1EC7t h\u1EA1i li\xEAn quan." },
    { t: "bullet", text: "B\xEAn ph\xE1t h\xE0nh c\xF3 quy\u1EC1n ngay l\u1EADp t\u1EE9c g\u1EE1 b\u1ECF s\u1EA3n ph\u1EA9m, t\u1EA1m d\u1EEBng h\u1EE3p t\xE1c v\xE0 kh\u1EA5u tr\u1EEB doanh thu \u0111\u1EC3 kh\u1EAFc ph\u1EE5c h\u1EADu qu\u1EA3." },
    { t: "p", text: "(Khai b\xE1o chi ti\u1EBFt 03 nh\xF3m quy\u1EC1n \u0111\u01B0\u1EE3c th\u1EF1c hi\u1EC7n \u1EDF form Khai b\xE1o b\u1EA3n quy\u1EC1n ri\xEAng.)" },
    { t: "h1", text: "02. QUY \u0110\u1ECANH V\u1EC0 TH\u1EDCI GIAN G\u1EECI D\u1EF0 \xC1N (DEADLINE SEEDING & RELEASE)" },
    { t: "bullet", text: "D\u1EF1 \xE1n Pitching & H\u1ED7 tr\u1EE3 truy\u1EC1n th\xF4ng: tr\u01B0\u1EDBc t\u1ED1i thi\u1EC3u 14 ng\xE0y." },
    { t: "bullet", text: "D\u1EF1 \xE1n ch\u1EC9 Ph\xE1t h\xE0nh/Ph\xE2n ph\u1ED1i (Kh\xF4ng Pitching): tr\u01B0\u1EDBc t\u1ED1i thi\u1EC3u 04 ng\xE0y l\xE0m vi\u1EC7c." },
    { t: "bullet", text: "D\u1EF1 \xE1n G\u1EA5p (ph\xE1t h\xE0nh trong 24\u201348h): TikTok t\u1ED1i thi\u1EC3u 24h \xB7 Zing MP3 t\u1ED1i thi\u1EC3u 48h (ch\u1EC9 nh\u1EADn Th\u1EE9 2 \u2013 Th\u1EE9 5) \xB7 Meta (Facebook/Instagram) t\u1ED1i thi\u1EC3u 04 ng\xE0y." },
    { t: "kv", k: "Lo\u1EA1i d\u1EF1 \xE1n \u0111\xE3 ch\u1ECDn", v: kind ? kind.label : "\u2014" },
    { t: "h1", text: "03. TH\xD4NG TIN K\u1EF8 THU\u1EACT & H\u1ED2 S\u01A0 PH\xC1T H\xC0NH (METADATA & RELEASE ASSETS)" },
    { t: "h2", text: "A. D\u1EEE LI\u1EC6U S\u1EA2N PH\u1EA8M (METADATA)" },
    { t: "kv", k: "   Label", v: dash(a.label) },
    { t: "kv", k: "   Lo\u1EA1i h\xECnh", v: dash(a.release_type) },
    ...(a.tracks || []).length ? [{ t: "kv", k: "   Tracklist", v: a.tracks.map((t, i) => `${i + 1}. ${typeof t === "string" ? t : t.title}`).join(" \xB7 ") }] : [],
    { t: "kv", k: "1. T\xEAn s\u1EA3n ph\u1EA9m", v: dash(a.song_title) },
    { t: "kv", k: "2. Th\u1EC3 lo\u1EA1i", v: (a.genres || []).filter(Boolean).join(", ") || "\u2014" },
    { t: "kv", k: "3. Ngh\u1EC7 s\u0129 tr\xECnh b\xE0y (Main artist)", v: dash(a.performer) },
    { t: "kv", k: "   Ngh\u1EC7 s\u0129 h\u1EE3p t\xE1c (Featuring)", v: dash(a.featuring) },
    { t: "kv", k: "4. S\xE1ng t\xE1c", v: dash(a.composer) },
    { t: "kv", k: "   Ng\u01B0\u1EDDi vi\u1EBFt l\u1EDDi", v: dash(a.lyricist) },
    { t: "kv", k: "5. Producer", v: dash(a.producer) },
    { t: "kv", k: "6. Mixer", v: dash(a.mixer) },
    ...(a.tracks || []).length ? [] : [{ t: "kv", k: "7. Preview Time", v: /^\d+$/.test(String(a.preview_time || "")) ? a.preview_time + " gi\xE2y" : dash(a.preview_time) }],
    { t: "kv", k: "8. Ng\xE0y ph\xE1t h\xE0nh demo TikTok", v: a.tiktok_demo_date ? dmy(a.tiktok_demo_date) : "\u2014" },
    { t: "kv", k: "10. Ng\xE0y gi\u1EDD ph\xE1t h\xE0nh", v: when(a) }
  ];
  FILE_FIELDS.forEach((f, i) => b.push({ t: "kv", k: `${11 + i}. ${f.label}`, v: dash(a.files?.[f.key]) + ((f.key === "audio" || f.key === "artwork") && a.files?.[f.key] ? (f.key === "audio" ? a.audio_kind : a.artwork_kind) === "demo" ? " (DEMO)" : " (ch\xEDnh th\u1EE9c)" : "") }));
  const prof = (a.profiles || []).filter((r2) => r2 && r2.url).map((r2) => `${PLATFORMS.find((x) => x.key === r2.p)?.label || r2.p}: ${r2.url}`).join(" \xB7 ") || a.profile_links;
  b.push({ t: "kv", k: `${11 + FILE_FIELDS.length}. Link profile ngh\u1EC7 s\u0129`, v: dash(prof) + (a.profile_returning ? " (\u0111\xE3 ph\xE1t h\xE0nh v\u1EDBi VIEENT tr\u01B0\u1EDBc \u0111\xE2y)" : "") });
  (a.tracks || []).filter((t) => t && typeof t === "object" && (t.performer || t.featuring || t.preview_time || t.rights_note || t.rights || t.composer || t.lyricist || t.producer || t.mixer || t.lyrics)).forEach((t, i) => {
    b.push({ t: "kv", k: `   Track ${(a.tracks || []).indexOf(t) + 1}: ${t.title}`, v: [t.performer && `Ngh\u1EC7 s\u0129: ${t.performer}`, t.featuring && `Feat: ${t.featuring}`, t.preview_time && `Preview: ${/^\d+$/.test(String(t.preview_time)) ? t.preview_time + "s" : t.preview_time}`, t.composer && `S\xE1ng t\xE1c: ${t.composer}`, t.lyricist && `L\u1EDDi: ${t.lyricist}`, t.producer && `Producer: ${t.producer}`, t.mixer && `Mixer: ${t.mixer}`, t.rights && `Quy\u1EC1n ri\xEAng: ${rightsText(t.rights)}`, t.rights_note && `Ghi ch\xFA quy\u1EC1n: ${t.rights_note}`, t.lyrics && "Lyrics (c\xF3)"].filter(Boolean).join(" \xB7 ") });
  });
  const lyUrl = /^https?:\/\/\S+$/i.test(String(a.lyrics || "").trim());
  b.push({ t: "kv", k: "9. Lyrics", v: a.lyrics ? lyUrl ? String(a.lyrics).trim() : "(xem b\xEAn d\u01B0\u1EDBi)" : "\u2014" });
  if (a.note) b.push({ t: "kv", k: "   Ghi ch\xFA c\u1EE7a \u0111\u1ED1i t\xE1c", v: String(a.note).replace(/\s*\n\s*/g, " \xB7 ") });
  if (a.lyrics && !lyUrl) {
    b.push({ t: "gap" });
    String(a.lyrics).split(/\r?\n/).forEach((l) => b.push({ t: "p", text: l }));
    b.push({ t: "gap" });
  }
  if (a.deliver_only) {
    b.push({ t: "h2", text: "B. CH\u1EC8 PH\xC1T H\xC0NH / ONLY DELIVER" });
    b.push({ t: "p", text: "\u0110\u1ED1i t\xE1c ch\u1ECDn ch\u1EC9 ph\xE1t h\xE0nh: kh\xF4ng c\xF3 t\u01B0 li\u1EC7u truy\u1EC1n th\xF4ng, \u0111\u1ECBnh h\u01B0\u1EDBng n\u1ED9i dung hay thi\u1EBFt k\u1EBF." });
    b.push({ t: "gap" });
    b.push({ t: "p", text: `Li\xEAn h\u1EC7: ${dash(a.contact_email)}` });
    return b;
  }
  b.push({ t: "h2", text: "B. T\u01AF LI\u1EC6U TRUY\u1EC0N TH\xD4NG (PROMO ASSETS)" });
  PROMO_FIELDS.forEach((f, i) => b.push({ t: "kv", k: `${i + 1}. ${f.label}`, v: dash(a.promo?.[f.key]) }));
  DIRECTION_FIELDS.forEach((f, i) => b.push({ t: "kv", k: `${i + 1}. ${f.label}`, v: dash(a.direction?.[f.key]) }));
  if (a.project_kind === "pitching") {
    b.push({ t: "h2", text: "C. T\u01AF LI\u1EC6U THI\u1EBET K\u1EBE (DESIGN SPECS)" });
    DESIGN_FIELDS.forEach((f) => b.push({ t: "kv", k: f.label, v: dash(a.design?.[f.key]) }));
  }
  b.push({ t: "gap" });
  b.push({ t: "p", text: `Li\xEAn h\u1EC7: ${dash(a.contact_email)}` });
  return b;
}

// _to_delete/t721.mjs
var r = cleanReleaseInfo({ release_type: "Single", label: "X", song_title: "S", performer: "P", composer: "A B", release_date: "2027-03-01", project_kind: "release_only", late_ack: true, contact_email: "a@b.co", genres: ["Pop", ""], profile_returning: true, files: { audio: "https://x.co/a", artwork: "https://x.co/b" }, note: "d\xF2ng 1\nd\xF2ng 2" }, { intro: true });
console.log(r.ok, JSON.stringify(r.data?.note), infoBlocks(r.data).find((b) => /Ghi chú/.test(b.k || ""))?.v);

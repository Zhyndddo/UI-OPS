// Round 155 item 1 (Pitching's "Zing" tool) — direct port of the team's
// Google Sheets LET()/BYROW() formula that builds one combined pitch email
// body for a batch of releases at once (not a static link, and not a
// single-release generator like buildNewReleasePreviewNote):
//
//   {if(counta(C62:C91)=0; "add DID đi cô bé đáng yêu ơi";
//   LET(
//     finder; FILTER('NEW RELEASE'!A4:M; ISNUMBER(MATCH('NEW RELEASE'!U4:U; C62:C91; 0)));
//     body; BYROW(finder; LAMBDA(r; TEXTJOIN(CHAR(10); TRUE;
//         "Song name: "&INDEX(r; column('NEW RELEASE'!D:D));
//         "Main Artist: "&INDEX(r; column('NEW RELEASE'!E:E));
//         "Release date: "&TEXT(INDEX(r; column('NEW RELEASE'!G:G)); "dd/MM/yyyy hh:mm");
//         "Thông tin phát hành: "&INDEX(r; column('NEW RELEASE'!L:L))
//       )));
//     "[VIEENT x Zing] Dự án:" & CHAR(10)&CHAR(10)
//     & "Dear team Zing MP3," & CHAR(10)&CHAR(10)
//     & "Thay mặt VIEENT Music, em gửi team thông tin dự án sắp tới, chi tiết như sau:" & CHAR(10)&CHAR(10)
//     & TEXTJOIN(REPT(CHAR(10);2); TRUE; body)
//     & CHAR(10)&CHAR(10)
//     & "Nhờ team Zing MP3 xem qua và back lại giúp VIEENT package có thể hỗ trợ cho dự án này nhé." & CHAR(10)&CHAR(10)
//     & "Cảm ơn mọi người,"
//   ))}
//
// C62:C91 is a hand-picked list of DIDs; 'NEW RELEASE' column U is the
// sheet's own DID column, D/E/G/L are Song name/Main Artist/Release date/
// "Thông tin phát hành". Ported to plain releases fields:
//   D -> title, E -> main_artist, G -> release_date + release_time,
//   L ("Thông tin phát hành") -> releases.link_share — confirmed via
//   explicit follow-up correction (Round 155's original best-guess of
//   releases.brief was wrong).
//
// releases is an array of {title, main_artist, release_date, release_time,
// link_share} rows, already fetched/matched by DID by the caller (see
// ZingPitchCard in app/tool-directory/page.js and ZingPitchRow in
// lib/ToolsButton.js). Returns the same
// "add DID đi cô bé đáng yêu ơi" placeholder the sheet shows when nothing's
// picked yet, preserved verbatim (not translated/cleaned up).
function ddmmyyyyhhmm(dateStr, timeStr) {
  if (!dateStr) return "";
  const dt = new Date(`${dateStr}T${(timeStr || "00:00").slice(0, 5)}:00`);
  if (isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()} ${hh}:${min}`;
}

export function buildZingPitchNote(releases) {
  if (!releases || releases.length === 0) return "add DID đi cô bé đáng yêu ơi";

  const body = releases
    .map((r) =>
      [
        `Song name: ${r.title || ""}`,
        `Main Artist: ${r.main_artist || ""}`,
        `Release date: ${ddmmyyyyhhmm(r.release_date, r.release_time)}`,
        `Thông tin phát hành: ${r.link_share || ""}`,
      ].join("\n")
    )
    .join("\n\n");

  return [
    "[VIEENT x Zing] Dự án:",
    "",
    "Dear team Zing MP3,",
    "",
    "Thay mặt VIEENT Music, em gửi team thông tin dự án sắp tới, chi tiết như sau:",
    "",
    body,
    "",
    "Nhờ team Zing MP3 xem qua và back lại giúp VIEENT package có thể hỗ trợ cho dự án này nhé.",
    "",
    "Cảm ơn mọi người,",
  ].join("\n");
}

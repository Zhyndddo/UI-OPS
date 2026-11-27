import { cleanReleaseInfo } from "/sessions/rcw-01g5wcsaxjvoprd6g6vdjdwa/mnt/UI-OPS/lib/releaseInfoForm.js";
import { infoBlocks } from "/sessions/rcw-01g5wcsaxjvoprd6g6vdjdwa/mnt/UI-OPS/lib/releaseInfoDocs.js";
const r = cleanReleaseInfo({ release_type:"Single", label:"X", song_title:"S", performer:"P", composer:"A B", release_date:"2027-03-01", project_kind:"release_only", late_ack:true, contact_email:"a@b.co", genres:["Pop",""], profile_returning:true, files:{audio:"https://x.co/a",artwork:"https://x.co/b"}, note:"dòng 1\ndòng 2" }, { intro:true });
console.log(r.ok, JSON.stringify(r.data?.note), infoBlocks(r.data).find(b=>/Ghi chú/.test(b.k||""))?.v);

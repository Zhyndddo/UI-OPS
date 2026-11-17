process.env.RIGHTS_FORM_SECRET="x";
const h = await import(process.cwd()+"/lib/rightsHolder.js");
const link = h.makeHolderLink("https://x.app","11111111-1111-1111-1111-111111111111");
const tok = link.split("/").pop();
console.log(link.startsWith("https://x.app/khai-bao/xac-nhan/"), h.readHolderToken(tok), h.readHolderToken(tok+"x"));
const o = await import(process.cwd()+"/lib/rightsOtp.js");
const key="a@b.vn|h:1"; const {challenge,code}=o.newChallenge(key); const c=o.readChallenge(challenge);
console.log(o.codeMatches(c,key,code), o.codeMatches(c,"a@b.vn|h:2",code));

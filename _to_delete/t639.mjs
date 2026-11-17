process.env.RIGHTS_FORM_SECRET="x";
const m = await import(process.cwd()+"/lib/rightsOtp.js");
const {challenge,code}=m.newChallenge("a@b.vn"); const c=m.readChallenge(challenge);
console.log(code.length, m.codeMatches(c,"a@b.vn",code), m.codeMatches(c,"a@b.vn","000000"), m.codeMatches(c,"z@b.vn",code));
const t=m.sign({a:1,form_hash:"h"},"audit"); console.log(!!m.unsign(t,"audit"), m.unsign(t,"otp"), m.unsign(t.replace(/.$/,"A"),"audit"));
console.log(m.formHash({b:1,a:2})===m.formHash({a:2,b:1}), m.describeUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17 like Mac OS X) AppleWebKit Mobile Safari/604"));

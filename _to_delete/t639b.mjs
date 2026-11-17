process.env.RIGHTS_FORM_SECRET="x";
const m = await import(process.cwd()+"/lib/rightsOtp.js");
const t=m.sign({a:1},"audit"); const [p,s]=t.split(".");
console.log(m.unsign(t,"audit")!==null, m.unsign(p+"."+(s[0]==="A"?"B":"A")+s.slice(1),"audit"), m.unsign(Buffer.from('{"a":2}').toString("base64url")+"."+s,"audit"));

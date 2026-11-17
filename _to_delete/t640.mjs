const m = await import(process.cwd()+"/lib/rightsForm.js");
const base={song_title:"A",contact_email:"a@b.vn",owned:{master:true,performing:true,publishing:true},term:"limited",signer_name:"X"};
console.log(m.cleanDeclaration({...base,term_from:"2026-01-01",term_to:"2028-12-31"}).data?.term_note);
console.log(m.cleanDeclaration({...base,term_from:"2029-01-01",term_to:"2028-12-31"}).error);
console.log(m.cleanDeclaration({...base,term_to:"2028-12-31"}).data?.term_note, m.cleanDeclaration({...base}).ok);

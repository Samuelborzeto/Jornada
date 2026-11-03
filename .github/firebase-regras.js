// Usado pelo workflow "Firebase - regras do banco".
const fs=require('fs'); const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
const out=(k,v)=>fs.appendFileSync(process.env.GITHUB_OUTPUT,`${k}=${v}\n`);
(async()=>{
  const rules=admin.securityRules();
  if(!fs.existsSync('firestore.rules')){
    const rs=await rules.getFirestoreRuleset();
    const src=rs.source.map(f=>f.content).join('\n');
    fs.writeFileSync('firestore.rules',src.endsWith('\n')?src:src+'\n');
    console.log('Regras lidas do Firebase e salvas em firestore.rules'); out('lidas','1'); return;
  }
  const src=fs.readFileSync('firestore.rules','utf8');
  const atual=(await rules.getFirestoreRuleset()).source.map(f=>f.content).join('\n');
  if(atual.trim()===src.trim()){ console.log('Regras já estão iguais no Firebase.'); out('lidas','0'); return; }
  await rules.releaseFirestoreRulesetFromSource(src);
  console.log('Regras novas publicadas no Firebase.'); out('lidas','0');
})().catch(e=>{ console.error(e); process.exit(1); });

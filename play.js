// Robô do Play Console (API do Google Play). Uso: node play.js status
// Credencial: variável PLAY_SA com o JSON da conta de serviço (vem dos secrets do GitHub).
const {GoogleAuth}=require('google-auth-library');
const PKG='io.github.samuelborzeto.familia';
const API=`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
(async()=>{
  const auth=new GoogleAuth({credentials:JSON.parse(process.env.PLAY_SA),scopes:['https://www.googleapis.com/auth/androidpublisher']});
  const c=await auth.getClient();
  const req=async(method,url)=>{ try{ return (await c.request({method,url})).data; }catch(e){ const m=e.response?e.response.status+' '+JSON.stringify(e.response.data&&e.response.data.error&&e.response.data.error.message):e.message; throw new Error(m); } };
  const cmd=process.argv[2]||'status';
  if(cmd!=='status'){ console.log('comando desconhecido:',cmd); process.exit(1); }
  const edit=await req('POST',`${API}/edits`);
  try{
    const tr=await req('GET',`${API}/edits/${edit.id}/tracks`);
    console.log('Faixas:');
    for(const t of tr.tracks||[]){
      const rs=(t.releases||[]).map(r=>`${r.name||'-'} [${(r.versionCodes||[]).join(',')}] ${r.status}`).join(' | ')||'sem versão';
      console.log(`- ${t.track}: ${rs}`);
    }
    const li=await req('GET',`${API}/edits/${edit.id}/listings`);
    for(const l of li.listings||[]) console.log(`Página da loja ${l.language}: "${l.title}", descrição completa com ${(l.fullDescription||'').length} caracteres`);
  } finally { await req('DELETE',`${API}/edits/${edit.id}`).catch(()=>{}); }
  console.log('ok (só leitura, nada foi alterado)');
})().catch(e=>{ console.error('erro:',e.message); process.exit(1); });

// Envia os avisos de horário dos hábitos. Roda pelo GitHub Actions a cada 5 minutos.
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
const db=admin.firestore();
const JANELA=40; // minutos de tolerância, porque o GitHub pode atrasar a execução
function agora(tz){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return {dia:`${p.year}-${p.month}-${p.day}`,min:Number(p.hour)*60+Number(p.minute)};
}
(async()=>{
  const snap=await db.collection('pushSchedules').get(); let enviados=0;
  for(const doc of snap.docs){
    const d=doc.data(); let tokens=d.tokens||[]; if(!tokens.length) continue;
    const {dia,min}=agora(d.tz||'America/Sao_Paulo'); const sent=d.sent||{}; const upd={}; const ruins=new Set();
    for(const [pid,prof] of Object.entries(d.byProfile||{})){
      for(const it of (prof.items||[])){
        if(!it.time) continue;
        const [h,m]=it.time.split(':').map(Number), t=h*60+m, chave=`${pid}_${it.hid}`;
        if(min<t||min-t>JANELA||sent[chave]===dia) continue;
        upd[`sent.${chave}`]=dia;
        let feito=false;
        try{ const p=await db.doc(`users/${doc.id}/profiles/${pid}`).get(); const n=(((p.data()||{}).log||{})[dia]||{})[it.hid]||0; feito=it.kind==='avoid'?n===1:n>=(it.target||1); }catch(e){}
        if(feito) continue;
        const res=await admin.messaging().sendEachForMulticast({tokens,data:{title:`Hora de: ${it.name}`,body:prof.name?`${prof.name}, marque no app quando terminar.`:'Marque no app quando terminar.',url:d.appUrl||'',tag:chave},webpush:{headers:{Urgency:'high',TTL:'3600'}}});
        res.responses.forEach((r,i)=>{ const c=(r.error&&r.error.code)||''; if(!r.success&&/not-registered|invalid-registration|invalid-argument/.test(c)) ruins.add(tokens[i]); });
        enviados+=res.successCount;
      }
    }
    if(ruins.size){ tokens=tokens.filter(t=>!ruins.has(t)); upd.tokens=tokens; }
    if(Object.keys(upd).length) await doc.ref.update(upd);
  }
  console.log('avisos enviados:',enviados);
})().catch(e=>{ console.error(e); process.exit(1); });

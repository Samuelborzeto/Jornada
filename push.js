// Envia os avisos de horário dos hábitos. Roda pelo GitHub Actions a cada 5 minutos.
// O app grava em pushSchedules/{uid}.slots as faixas de horário (UTC, de 5 em 5 min) que têm aviso.
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
const db=admin.firestore();
const JANELA=40; // minutos de tolerância, porque o GitHub pode atrasar a execução
function agora(tz){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return {dia:`${p.year}-${p.month}-${p.day}`,min:Number(p.hour)*60+Number(p.minute)};
}
(async()=>{
  // Lê só as contas que têm algum aviso nos últimos 40 minutos (faixas de 5 min, em UTC).
  const d0=new Date(), agoraUtc=d0.getUTCHours()*60+d0.getUTCMinutes(), base=Math.floor(agoraUtc/5)*5;
  const faixas=[]; for(let k=0;k<=Math.ceil(JANELA/5);k++) faixas.push(((base-5*k)%1440+1440)%1440);
  const snap=await db.collection('pushSchedules').where('slots','array-contains-any',faixas).get(); let enviados=0;
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
  // Placar da família: 1 aviso por dia às 19h (hora local de cada conta), para quem tem família e não desligou em Ajustes.
  const hUtc=d0.getUTCHours();
  if(hUtc>=20&&hUtc<=23){
    const todos=await db.collection('pushSchedules').get(); const famCache={};
    const segunda=dia=>{ const [y,m,dd]=dia.split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,dd)); const k=(dt.getUTCDay()+6)%7; dt.setUTCDate(dt.getUTCDate()-k); return dt.toISOString().slice(0,10); };
    for(const doc of todos.docs){
      const d=doc.data(); const tokens=d.tokens||[]; if(!tokens.length) continue;
      const {dia,min}=agora(d.tz||'America/Sao_Paulo'); if(min<19*60||min>19*60+40||d.placarSent===dia) continue;
      const wk=segunda(dia); let mandou=false;
      for(const [pid,prof] of Object.entries(d.byProfile||{})){
        if(!prof.placar||!prof.fid||!prof.mid) continue;
        if(!famCache[prof.fid]){ try{ const ms=await db.collection(`families/${prof.fid}/members`).get(); famCache[prof.fid]=ms.docs.map(x=>Object.assign({id:x.id},x.data())); }catch(e){ famCache[prof.fid]=[]; } }
        const lista=famCache[prof.fid].filter(m=>m.week===wk).sort((a,b)=>(b.weekPts||0)-(a.weekPts||0)); if(lista.length<2) continue;
        const pos=lista.findIndex(m=>m.id===prof.mid); if(pos<0) continue; const eu=lista[pos];
        let body;
        if(pos===0){ const seg=lista[1]; const gap=(eu.weekPts||0)-(seg.weekPts||0); body=gap>0?`Você lidera a semana, ${gap} pontos à frente de ${seg.name||'alguém'}. Marque hoje para segurar a liderança.`:`Empate na liderança com ${seg.name||'alguém'}. Quem fechar o dia cheio sai na frente.`; }
        else { const fr=lista[pos-1]; const gap=(fr.weekPts||0)-(eu.weekPts||0); body=`Você está em ${pos+1}º, ${gap} pontos atrás de ${fr.name||'alguém'}. Um dia cheio vale até 100.`; }
        const titulo=Object.keys(d.byProfile).length>1?`Placar da casa · ${prof.name||''}`:'Placar da casa';
        const res=await admin.messaging().sendEachForMulticast({tokens,data:{title:titulo,body,url:d.appUrl||'',tag:`placar_${pid}`},webpush:{headers:{Urgency:'normal',TTL:'7200'}}});
        enviados+=res.successCount; mandou=true;
      }
      if(mandou) await doc.ref.update({placarSent:dia});
    }
  }
  console.log('avisos enviados:',enviados);
})().catch(e=>{ console.error(e); process.exit(1); });

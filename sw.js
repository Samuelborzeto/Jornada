const CACHE='jornada-v4';
const CORE=['./','index.html','manifest.json','icon.png'];
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE).catch(()=>{}))); });
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  if(u.hostname==='www.gstatic.com'&&u.pathname.startsWith('/firebasejs/')){
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return res; })));
    return;
  }
  if(u.origin!==location.origin) return;
  e.respondWith(fetch(e.request).then(r=>{ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return r; }).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))));
});
// avisos de horário
self.addEventListener('push',e=>{
  let p={}; try{ p=e.data?e.data.json():{}; }catch(err){ p={data:{title:'Jornada',body:e.data?e.data.text():''}}; }
  const d=p.data||p, n=p.notification||{};
  const title=d.title||n.title||'Jornada', body=d.body||n.body||'';
  e.waitUntil(self.registration.showNotification(title,{body,icon:'icon.png',badge:'icon.png',tag:d.tag||undefined,renotify:!!d.tag,data:{url:d.url||self.registration.scope}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||self.registration.scope;
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{
    for(const w of ws){ if(w.url.startsWith(self.registration.scope)&&'focus' in w) return w.focus(); }
    return self.clients.openWindow(url);
  }));
});

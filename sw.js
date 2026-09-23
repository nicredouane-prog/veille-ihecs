const CACHE='ihecs-test-actus-v5.8';
const CORE=['/','/manifest.webmanifest','/icon.svg','/app-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  if(u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/'))));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();const url=e.notification?.data?.url||'/';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus'in c){c.navigate?.(url);return c.focus()}}return clients.openWindow(url)}));
});
self.addEventListener('push',e=>{
  let data={};try{data=e.data?e.data.json():{}}catch{}
  e.waitUntil(self.registration.showNotification(data.title||'IHECS Test Actus',{body:data.body||'C’est l’heure de réviser l’actualité.',icon:'/app-icon.png',badge:'/app-icon.png',tag:data.tag||'ihecs-reminder',renotify:true,data:{url:data.url||'/'}}));
});

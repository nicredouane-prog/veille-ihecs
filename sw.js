const CACHE='ihecs-test-actus-v4.4';
const CORE=['/','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/'))))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>list[0]?list[0].focus():clients.openWindow('/')))});

self.addEventListener('push',e=>{let data={};try{data=e.data?e.data.json():{}}catch{};e.waitUntil(self.registration.showNotification(data.title||'IHECS Test Actus',{body:data.body||'C’est l’heure de réviser l’actualité.',icon:'/app-icon.png',badge:'/app-icon.png',tag:data.tag||'ihecs-reminder',data:{url:data.url||'/'}}))});

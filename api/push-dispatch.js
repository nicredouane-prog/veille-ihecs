import webpush from 'web-push';
const localHM=(tz)=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:tz||'Europe/Brussels',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date());const g=t=>parts.find(p=>p.type===t)?.value||'00';return `${g('hour')}:${g('minute')}`};
export default async function handler(req,res){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,pub=process.env.VAPID_PUBLIC_KEY,priv=process.env.VAPID_PRIVATE_KEY;
  if(!url||!key||!pub||!priv) return res.status(503).json({error:'PUSH_BACKEND_NOT_CONFIGURED'});
  webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@example.com',pub,priv);
  const r=await fetch(`${url}/rest/v1/ihecs_push_subscriptions?enabled=eq.true&select=*`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});if(!r.ok)return res.status(500).json({error:'DB_READ_FAILED'});
  const rows=await r.json();let sent=0,removed=0;
  for(const row of rows){if(localHM(row.timezone)!==String(row.reminder_time||'').slice(0,5))continue;try{await webpush.sendNotification({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},JSON.stringify({title:'IHECS Test Actus',body:'C’est l’heure de faire ton point actu.',tag:'ihecs-daily-reminder',url:'/'}));sent++;}catch(e){if(e?.statusCode===404||e?.statusCode===410)removed++;}}
  res.status(200).json({ok:true,sent,removed,checked:rows.length});
}

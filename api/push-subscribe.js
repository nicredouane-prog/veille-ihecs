const json=(res,status,data)=>res.status(status).json(data);
export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:'METHOD_NOT_ALLOWED'});
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) return json(res,503,{error:'PUSH_BACKEND_NOT_CONFIGURED'});
  const {subscription,reminderTime='19:00',timezone='Europe/Brussels',enabled=true}=req.body||{};
  const endpoint=subscription?.endpoint,p256dh=subscription?.keys?.p256dh,auth=subscription?.keys?.auth;
  if(!endpoint||!p256dh||!auth) return json(res,400,{error:'INVALID_SUBSCRIPTION'});
  const row={endpoint,p256dh,auth,reminder_time:reminderTime,timezone,enabled:Boolean(enabled),updated_at:new Date().toISOString()};
  const r=await fetch(`${url}/rest/v1/ihecs_push_subscriptions?on_conflict=endpoint`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
  if(!r.ok) return json(res,500,{error:'DB_WRITE_FAILED',detail:await r.text()});
  return json(res,200,{ok:true});
}

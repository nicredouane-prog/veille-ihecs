export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try{
    const r=await fetch('https://tndwtppmemjgsoohubuz.supabase.co/functions/v1/ihecs-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'subscribe',...req.body})});
    const body=await r.text();res.status(r.status).setHeader('Content-Type','application/json').send(body);
  }catch(e){res.status(500).json({error:'PUSH_PROXY_SUBSCRIBE_FAILED'});}
}
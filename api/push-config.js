export default async function handler(req,res){
  try{
    const r=await fetch('https://tndwtppmemjgsoohubuz.supabase.co/functions/v1/ihecs-push?action=config',{cache:'no-store'});
    const body=await r.text();res.status(r.status).setHeader('Content-Type','application/json').send(body);
  }catch(e){res.status(500).json({configured:false,error:'PUSH_PROXY_CONFIG_FAILED'});}
}
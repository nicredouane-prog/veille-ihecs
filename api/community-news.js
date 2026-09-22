const cfg=()=>({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY});
export default async function handler(req,res){
  const {url,key}=cfg();
  if(!url||!key) return res.status(503).json({error:'PARTAGE_NON_CONFIGURE',message:'Le partage communautaire sera activé dès que Supabase sera relié.'});
  const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  const endpoint=`${url.replace(/\/$/,'')}/rest/v1/shared_news`;
  try{
    if(req.method==='GET'){
      const r=await fetch(`${endpoint}?select=*&order=created_at.desc&limit=100`,{headers});
      const data=await r.json(); return res.status(r.status).json(data);
    }
    if(req.method==='POST'){
      const b=req.body||{};
      const row={title:b.title,description:b.description,context:b.context||'',category:b.category||'Belgique / Société',source:b.source||'',url:b.url,image:b.image||'',quiz_prompt:b.quizPrompt||'',quiz_answer:b.quizAnswer||'',created_at:new Date().toISOString()};
      const r=await fetch(endpoint,{method:'POST',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(row)});
      const data=await r.json(); return res.status(r.status).json(data);
    }
    return res.status(405).json({error:'Méthode non autorisée'});
  }catch(e){return res.status(500).json({error:e.message||'Erreur de partage'});}
}

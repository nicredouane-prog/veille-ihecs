const clean = (s='') => s.replace(/\s+/g,' ').trim();
async function getJson(url){
  const c=new AbortController(); const timer=setTimeout(()=>c.abort(),7000);
  try{
    const r=await fetch(url,{signal:c.signal,headers:{'user-agent':'IHECS-Test-Actus/5.2'}});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=604800');
  const name=clean(String(req.query?.name||''));
  if(!name || name.length>100) return res.status(400).json({image:''});
  try{
    const search=await getJson(`https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=3&format=json&origin=*`);
    const hits=search?.query?.search||[];
    for(const hit of hits){
      const title=hit?.title; if(!title) continue;
      try{
        const page=await getJson(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
        const image=page?.thumbnail?.source||page?.originalimage?.source||'';
        if(image) return res.status(200).json({image,title:page?.title||title,source:'Wikipedia'});
      }catch{}
    }
    return res.status(200).json({image:''});
  }catch{
    return res.status(200).json({image:''});
  }
}

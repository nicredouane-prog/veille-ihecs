function privateHost(host=''){
  const h=host.toLowerCase();
  return h==='localhost'||h==='127.0.0.1'||h==='::1'||h.endsWith('.local')||/^10\./.test(h)||/^192\.168\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h);
}
export default async function handler(req,res){
  const raw=String(req.query?.url||'');
  let u;
  try{u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||privateHost(u.hostname)) throw new Error();}catch{return res.status(400).end('Bad image URL')}
  try{
    const c=new AbortController(); const timer=setTimeout(()=>c.abort(),9000);
    const r=await fetch(u.toString(),{signal:c.signal,redirect:'follow',headers:{'user-agent':'Mozilla/5.0 IHECS-Test-Actus/3.2','accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'}});
    clearTimeout(timer);
    if(!r.ok) return res.status(404).end('Image unavailable');
    const type=r.headers.get('content-type')||'';
    if(!type.startsWith('image/')) return res.status(415).end('Not an image');
    const buf=Buffer.from(await r.arrayBuffer());
    if(buf.length<1500||buf.length>8_000_000) return res.status(422).end('Invalid image');
    res.setHeader('Content-Type',type);
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).end(buf);
  }catch{return res.status(404).end('Image unavailable')}
}

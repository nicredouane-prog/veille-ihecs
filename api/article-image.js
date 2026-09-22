const decode = (s='') => s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const meta = (html, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const p of patterns){ const m=html.match(p); if(m) return decode(m[1]).trim(); }
  return '';
};
function absolute(url, base){ try{return new URL(url,base).toString()}catch{return ''} }
function firstUsefulImg(html, base){
  const matches=[...html.matchAll(/<img\b[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)];
  for(const m of matches){
    const u=absolute(decode(m[1]),base);
    if(u && !/logo|icon|avatar|sprite|pixel|tracking|ads?\b|favicon|brand|google|gnews|default|placeholder|author|profil/i.test(u)) return u;
  }
  return '';
}
async function fetchHtml(url){
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const r=await fetch(url,{signal:controller.signal,redirect:'follow',headers:{'user-agent':'Mozilla/5.0 VeilleIHECS/2.5'}});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const type=r.headers.get('content-type')||'';
    if(!type.includes('text/html')) throw new Error('not-html');
    return {html:await r.text(), finalUrl:r.url||url};
  }finally{clearTimeout(timer)}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=604800');
  const raw=String(req.query?.url||'');
  let u; try{u=new URL(raw); if(!['http:','https:'].includes(u.protocol)) throw new Error()}catch{return res.status(400).json({image:''})}
  try{
    const {html,finalUrl}=await fetchHtml(u.toString());
    let candidate=meta(html,'og:image:secure_url')||meta(html,'og:image')||meta(html,'twitter:image')||meta(html,'twitter:image:src')||firstUsefulImg(html,finalUrl);
    candidate=absolute(candidate,finalUrl);
    if(/logo|icon|avatar|sprite|pixel|tracking|favicon|brand|google|gnews|default|placeholder|author|profil/i.test(candidate)) candidate='';
    return res.status(200).json({image:candidate});
  }catch{return res.status(200).json({image:''})}
}

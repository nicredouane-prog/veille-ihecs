const decode = (s='') => s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
const strip = (s='') => decode(s).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const meta = (html, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const p of patterns){ const m=html.match(p); if(m) return decode(m[1]).trim(); }
  return '';
};
const titleTag = html => strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
const categoryFor = (text='') => {
  const t=text.toLowerCase();
  if(/gouvernement|ministre|parlement|élection|parti|coalition|politique|président|premier ministre|député|sénat|commission européenne/.test(t)) return 'Politique';
  if(/guerre|ukraine|gaza|israël|otan|onu|diplomat|international|chine|états-unis|russie|iran|europe/.test(t)) return 'International';
  if(/euro|budget|inflation|banque|entreprise|emploi|économie|marché|prix|salaire|finance|bourse/.test(t)) return 'Économie';
  if(/football|sport|cyclisme|tennis|formule 1|match|championnat|diables rouges/.test(t)) return 'Sport';
  if(/cinéma|film|musique|culture|festival|livre|art|concert|série|prix|récompense/.test(t)) return 'Culture';
  if(/science|climat|environnement|santé|espace|technologie|intelligence artificielle|\bia\b/.test(t)) return 'Sciences';
  return 'Belgique / Société';
};
const sentences = text => (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[]).map(s=>s.trim()).filter(s=>s.length>35);

async function fetchHtml(url){
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const r=await fetch(url,{signal:controller.signal,redirect:'follow',headers:{'user-agent':'Mozilla/5.0 VeilleIHECS/2.2'}});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const type=r.headers.get('content-type')||'';
    if(!type.includes('text/html')) throw new Error('Le lien ne renvoie pas une page web lisible.');
    return await r.text();
  } finally { clearTimeout(timer); }
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST uniquement'});
  const {url,pastedText=''}=req.body||{};
  if(!url) return res.status(400).json({error:'Lien manquant'});
  let u; try { u=new URL(url); if(!['http:','https:'].includes(u.protocol)) throw new Error(); } catch { return res.status(400).json({error:'Lien invalide'}); }
  try{
    let html=''; let fetchError='';
    try{ html=await fetchHtml(u.toString()); }catch(e){ fetchError=e.message; }
    const title=meta(html,'og:title')||titleTag(html)||u.hostname.replace(/^www\./,'');
    const descMeta=meta(html,'og:description')||meta(html,'description');
    const image=meta(html,'og:image');
    const site=meta(html,'og:site_name')||u.hostname.replace(/^www\./,'');
    const paras=[...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>strip(m[1])).filter(p=>p.length>70 && !/cookie|abonnez|newsletter|publicité/i.test(p));
    const body=strip(pastedText).length>100 ? strip(pastedText) : paras.join(' ');
    const base=(body||descMeta||title).slice(0,12000);
    const s=sentences(base);
    const summary=(s.slice(0,3).join(' ')||descMeta||title).slice(0,900);
    const context=(s.slice(3,6).join(' ')||'Complète le contexte avec la source originale : acteurs, date, antécédents et conséquences.').slice(0,900);
    const keyPoints=s.slice(0,5).map(x=>x.slice(0,240));
    const category=categoryFor(`${title} ${base}`);
    return res.status(200).json({
      title, source:site, url:u.toString(), image, description:summary, context, keyPoints, category,
      access: strip(pastedText).length>100 ? 'texte-fourni' : body.length>250 ? 'article-public' : 'limite',
      warning: fetchError || (body.length<=250 ? "Le contenu complet n'a pas pu être lu. Si tu es abonné, colle le texte de l'article dans le champ prévu." : '')
    });
  }catch(e){ return res.status(500).json({error:e.message||'Analyse impossible'}); }
}

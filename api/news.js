const SOURCES = [
  { name:'RTBF', official:'https://rss.rtbf.be/article/rss/rtbfinfo_homepage.xml', queries:['site:rtbf.be'] },
  { name:'RTL info', queries:['site:rtl.be/actu','site:rtl.be'] },
  { name:'La Libre', queries:['site:lalibre.be'] },
  { name:'Le Soir', queries:['site:lesoir.be'] },
  { name:'BX1', queries:['site:bx1.be'] },
  { name:'La DH', queries:['site:dhnet.be'] },
  { name:'Le Vif', queries:['site:levif.be'] },
  { name:"L'Avenir", queries:['site:lavenir.net'] },
  { name:'Sudinfo', queries:['site:sudinfo.be'] },
];

const decode=(v='')=>v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
const strip=(v='')=>decode(v).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const tag=(xml,name)=>{const m=xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'));return m?decode(m[1]).trim():''};
const attr=(xml,tagName,attrName)=>{const m=xml.match(new RegExp(`<${tagName}[^>]*\\s${attrName}=["']([^"']+)["'][^>]*>`,'i'));return m?decode(m[1]):''};

function categoryFor(text=''){
  const t=text.toLowerCase();
  if(/\b(décès|deces|mort de|est mort|est morte|est décédé|est décédée|s['’]est éteint|s['’]est éteinte|disparition de|nous a quittés|meurt à|décède à)\b/.test(t)) return 'Nécrologie';
  if(/gouvernement|ministre|parlement|élection|parti|coalition|président|premier ministre|député|sénat|commission européenne|diplomat/.test(t)) return 'Politique';
  if(/guerre|ukraine|gaza|israël|otan|onu|international|chine|états-unis|russie|iran|moyen-orient|europe/.test(t)) return 'International';
  if(/euro|budget|inflation|banque|entreprise|emploi|économie|marché|prix|salaire|finance|bourse|énergie/.test(t)) return 'Économie';
  if(/football|sport|cyclisme|tennis|formule 1|match|championnat|diables rouges|tournoi/.test(t)) return 'Sport';
  if(/cinéma|film|musique|culture|festival|livre|art|concert|série|prix littéraire/.test(t)) return 'Culture';
  if(/science|climat|environnement|santé|espace|technologie|intelligence artificielle|\bia\b/.test(t)) return 'Sciences';
  return 'Belgique / Société';
}



function ensurePeriod(s=''){s=s.trim();return /[.!?…]$/.test(s)?s:`${s}.`}
function headlineSummary(title='',category=''){
  let t=(title||'').replace(/[«»]/g,'').replace(/\s+/g,' ').trim();
  if(!t) return '';
  const i=t.indexOf(':');
  if(i>3&&i<t.length-4){
    const left=t.slice(0,i).trim(), right=t.slice(i+1).trim().replace(/^[\"'“]+|[\"'”]+$/g,'');
    if(right.length>18) return ensurePeriod(`Dans le contexte de ${left.toLowerCase()}, ${right.charAt(0).toLowerCase()+right.slice(1)}`);
  }
  t=t.replace(/^[\"'“][^\"'”]{5,140}[\"'”]\s*[:–—-]\s*/,'').trim()||t;
  return ensurePeriod(t.charAt(0).toUpperCase()+t.slice(1));
}
function contextSentence(category='',title=''){
  const t=(title||'').toLowerCase();
  if(/iran|ormuz|moyen-orient|guerre|isra[eë]l|gaza|ukraine|russie/.test(t)) return "L’enjeu concerne aussi les rapports de force internationaux, la sécurité et les conséquences diplomatiques ou économiques.";
  if(/gouvernement|ministre|parlement|élection|coalition|président|diplomat/.test(t)||category==='Politique') return "Il faut surtout retenir les acteurs concernés, la décision ou l’évolution politique et ses conséquences.";
  if(/gr[eè]ve|a[eé]roport|skeyes|transport|train|sncb/.test(t)) return "Il faut surtout retenir l’origine de la perturbation, les acteurs concernés et son impact concret.";
  if(/prix|festival|film|cin[eé]ma|r[eé]compense|remporte|gagne/.test(t)||category==='Culture') return "Il faut retenir l’œuvre ou la personne concernée, la distinction ou l’événement culturel et pourquoi il fait l’actualité.";
  if(category==='Économie') return "Le point important est l’acteur économique concerné, l’évolution annoncée et son impact potentiel.";
  if(category==='Sport') return "Le point important est l’événement, les acteurs principaux et le résultat ou l’enjeu sportif.";
  if(category==='Sciences') return "Le point important est ce qui a été annoncé ou découvert, par qui, et ce que cela change.";
  return "Le point essentiel est le fait principal, les acteurs concernés et la raison pour laquelle l’événement compte.";
}
function parseFeed(xml, configuredSource){
  const blocks=xml.match(/<item\b[\s\S]*?<\/item>/gi)||[];
  return blocks.map((item,index)=>{
    let title=strip(tag(item,'title'));
    // Google News ajoute souvent « - Nom du média » au titre : on l'enlève.
    title=title.replace(/\s+[–—-]\s+(RTBF|RTL info|La Libre|Le Soir|BX1|La DH|DHnet|Le Vif|L'Avenir|Sudinfo).*$/i,'').trim();
    const description=strip(tag(item,'description')||tag(item,'content:encoded'));
    const pubDateRaw=tag(item,'pubDate')||tag(item,'dc:date');
    const date=pubDateRaw?new Date(pubDateRaw):new Date();
    const enclosure=attr(item,'enclosure','url')||attr(item,'media:content','url')||attr(item,'media:thumbnail','url');
    const category=categoryFor(`${title} ${description}`); const summaryShort=headlineSummary(title,category); const summaryLong=[summaryShort,contextSentence(category,title)].filter(Boolean).join(' '); return {id:`${configuredSource}-${date.getTime()}-${index}-${title.slice(0,24)}`,title,source:configuredSource,url:strip(tag(item,'link')),description:description.slice(0,650),summaryShort,summaryLong,image:enclosure,date:Number.isNaN(date.getTime())?new Date().toISOString():date.toISOString(),category};
  }).filter(x=>x.title&&x.url);
}

async function fetchText(url){
  const c=new AbortController(); const timer=setTimeout(()=>c.abort(),8000);
  try{const r=await fetch(url,{signal:c.signal,redirect:'follow',headers:{'user-agent':'Mozilla/5.0 IHECS-Test-Actus/3.1'}});if(!r.ok) throw new Error(`HTTP ${r.status}`);return await r.text()}finally{clearTimeout(timer)}
}
const googleUrl=(q,days,sinceDate='',beforeDate='')=>{
  let dateClause='';
  if(sinceDate) dateClause=` after:${sinceDate}${beforeDate?` before:${beforeDate}`:''}`;
  else dateClause=` when:${days}d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${q}${dateClause}`)}&hl=fr&gl=BE&ceid=BE:fr`;
};
const iso=d=>new Date(d).toISOString().slice(0,10);
function windowsFor(startMs,endMs){
  const out=[]; const span=30*86400000; let cur=startMs; let guard=0;
  while(cur<endMs && guard<12){
    const next=Math.min(cur+span,endMs+86400000);
    out.push([iso(cur),iso(next)]); cur=next; guard++;
  }
  return out;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=30');
  const requestedSince=String(req.query?.since||'').match(/^\d{4}-\d{2}-\d{2}$/)?.[0]||'';
  const days=Math.max(1,Math.min(365,Number(String(req.query?.days||'180'))||180));
  const since=requestedSince ? new Date(`${requestedSince}T00:00:00Z`).getTime() : Date.now()-days*86400000;
  const endNow=Date.now();
  const ranges=requestedSince||days>45 ? windowsFor(since,endNow) : [];
  const jobs=SOURCES.map(async source=>{
    const errors=[];
    const urls=[];
    if(source.official) urls.push(source.official);
    for(const q of source.queries){
      if(ranges.length){ for(const [after,before] of ranges) urls.push(googleUrl(q,days,after,before)); }
      else urls.push(googleUrl(q,days,requestedSince));
    }
    // Une recherche ciblée complète le flux général pour ne pas rater les décès de personnalités.
    // On la garde à une seule requête par média afin de ne pas alourdir excessivement le rafraîchissement.
    const deathBase=source.queries[0]||`"${source.name}"`;
    urls.push(googleUrl(`${deathBase} (décès OR "est mort" OR "est décédé" OR "s'est éteint")`,days,requestedSince));
    const settled=await Promise.allSettled(urls.map(async url=>parseFeed(await fetchText(url),source.name)));
    const feeds=[];
    settled.forEach(r=>{if(r.status==='fulfilled') feeds.push(...r.value); else errors.push(r.reason?.message||'Erreur flux')});
    if(!feeds.length){
      try{const xml=await fetchText(googleUrl(`\"${source.name}\"`,days,requestedSince));feeds.push(...parseFeed(xml,source.name));}catch(e){errors.push(e.message)}
    }
    const seen=new Set();
    const items=feeds
      .filter(x=>new Date(x.date).getTime()>=since)
      .filter(x=>{const k=x.title.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g,' ').trim().slice(0,120);if(seen.has(k))return false;seen.add(k);return true;})
      .sort((a,b)=>new Date(b.date)-new Date(a.date))
      .slice(0,400);
    return {source:source.name,ok:items.length>0,error:items.length?null:errors.join(' / ')||'Aucun article',items};
  });
  const results=await Promise.all(jobs);
  const all=results.flatMap(r=>r.items).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const seen=new Set();
  const items=all.filter(item=>{const key=item.title.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g,' ').trim().slice(0,115);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,3000);
  res.status(200).json({generatedAt:new Date().toISOString(),days,since:requestedSince||null,items,sources:results.map(r=>({name:r.source,ok:r.ok,error:r.error||null,count:r.items.length}))});
}

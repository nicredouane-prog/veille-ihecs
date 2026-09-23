const SOURCES=[
  ['RTBF','site:rtbf.be'],['RTL info','site:rtl.be'],['La Libre','site:lalibre.be'],
  ['Le Soir','site:lesoir.be'],['BX1','site:bx1.be'],['La DH','site:dhnet.be'],
  ['Le Vif','site:levif.be'],["L'Avenir",'site:lavenir.net'],['Sudinfo','site:sudinfo.be']
];
const decode=(v='')=>v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&nbsp;/gi,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const strip=(v='')=>decode(v).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const tag=(xml,name)=>{const m=xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'));return m?decode(m[1]).trim():''};
const norm=(v='')=>v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
async function get(url,timeout=8000){const c=new AbortController();const t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{signal:c.signal,redirect:'follow',headers:{'user-agent':'Mozilla/5.0 IHECS-Test-Actus/5.6'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r;}finally{clearTimeout(t)}}
const googleUrl=q=>`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:30d`)}&hl=fr&gl=BE&ceid=BE:fr`;
function parse(xml,source){return (xml.match(/<item\b[\s\S]*?<\/item>/gi)||[]).map((item,i)=>{const title=strip(tag(item,'title')).replace(/\s+[–—-]\s+(RTBF|RTL info|La Libre|Le Soir|BX1|La DH|DHnet|Le Vif|L'Avenir|Sudinfo).*$/i,'').trim();const description=strip(tag(item,'description'));const d=new Date(tag(item,'pubDate')||Date.now());return{id:`obit-${source}-${d.getTime()}-${i}`,title,description,source,url:strip(tag(item,'link')),date:d.toISOString()}}).filter(x=>x.title&&x.url)}
function isDeathNews(a){const t=`${a.title} ${a.description}`.toLowerCase();return /(est mort|est morte|est décédé|est décédée|décès de|deces de|mort de|disparition de|s['’]est éteint|s['’]est éteinte|nous a quitté|nous a quittés|meurt à|décède à)/i.test(t)}
function extractPerson(title=''){
  const t=title.replace(/[«»“”"]/g,' ').replace(/\s+/g,' ').trim();
  const pats=[
    /(?:mort|décès|deces|disparition)\s+(?:de|du|d['’])\s*(?:son|sa|leur)\s+(?:fils|fille|époux|épouse|mari|femme|frère|frère|sœur|soeur)\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})/i,
    /(?:mort|décès|deces|disparition)\s+(?:de|du|d['’])\s*([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})/,
    /^([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})\s+(?:est mort|est morte|est décédé|est décédée|meurt|décède|s['’]est éteint|s['’]est éteinte)/,
    /(?:adieu|hommage)\s+à\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})/,
    /(?:le|la)\s+(?:chanteur|chanteuse|acteur|actrice|réalisateur|réalisatrice|journaliste|sportif|sportive|mannequin|écrivain|écrivaine)\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})\s+(?:est mort|est morte|est décédé|est décédée|meurt|décède)/i
  ];
  for(const p of pats){const m=t.match(p);if(m?.[1])return m[1].trim()}
  return '';
}
function qidFromClaim(claim){return claim?.mainsnak?.datavalue?.value?.id||''}
function timeFromClaim(claim){const s=claim?.mainsnak?.datavalue?.value?.time||'';const m=s.match(/([+-]\d{4,})-(\d{2})-(\d{2})/);return m?new Date(`${m[1].replace('+','')}-${m[2]}-${m[3]}T12:00:00Z`):null}
async function resolvePerson(name){
  const sr=await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=fr&uselang=fr&type=item&limit=8&format=json&origin=*`);
  const sj=await sr.json();
  const exact=(sj.search||[]).filter(x=>norm(x.label)===norm(name)||norm(x.match?.text||'')===norm(name));
  for(const hit of exact){
    const er=await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(hit.id)}&props=labels|descriptions|claims&languages=fr|en&format=json&origin=*`);
    const ej=await er.json(); const e=ej?.entities?.[hit.id]; if(!e)continue;
    const isHuman=(e.claims?.P31||[]).some(c=>qidFromClaim(c)==='Q5'); if(!isHuman)continue;
    const file=e.claims?.P18?.[0]?.mainsnak?.datavalue?.value; if(!file)continue;
    const label=e.labels?.fr?.value||e.labels?.en?.value||hit.label||name;
    if(norm(label)!==norm(name) && !(hit.aliases||[]).some(a=>norm(a)===norm(name)))continue;
    const desc=e.descriptions?.fr?.value||e.descriptions?.en?.value||'';
    const birth=timeFromClaim(e.claims?.P569?.[0]); const death=timeFromClaim(e.claims?.P570?.[0]);
    let age=null;if(birth&&death){age=death.getUTCFullYear()-birth.getUTCFullYear();const md=(death.getUTCMonth()-birth.getUTCMonth())*31+death.getUTCDate()-birth.getUTCDate();if(md<0)age--;if(age<0||age>125)age=null}
    const genderQ=qidFromClaim(e.claims?.P21?.[0]); const gender=genderQ==='Q6581072'?'female':genderQ==='Q6581097'?'male':'';
    const image=`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1000`;
    const cleanDesc=desc.replace(/^personne\s+/i,'').replace(/\.$/,'');
    const who=cleanDesc?`${label} était ${cleanDesc}.`:`${label} était une personnalité publique.`;
    return{id:hit.id,person:label,image,who,age,gender};
  }
  return null;
}
function deathInfo(articles=[]){
  const text=articles.map(a=>`${a.title}. ${a.description}`).join(' ');
  const confirmed=[
    [/des suites (?:d['’]|de )([^.;]{3,90})/i,m=>`Les sources indiquent un décès des suites ${m[0].replace(/^des suites /i,'')}.`],
    [/emporté(?:e)? par ([^.;]{3,80})/i,m=>`Les sources indiquent qu’il/elle a été emporté(e) par ${m[1]}.`],
    [/(?:mort|décéd(?:é|ée)) dans (un accident[^.;]{0,90})/i,m=>`Les sources indiquent un décès dans ${m[1]}.`],
    [/(?:mort|décéd(?:é|ée)) après (un accident[^.;]{0,90})/i,m=>`Les sources indiquent un décès après ${m[1]}.`]
  ];
  for(const [re,fn] of confirmed){const m=text.match(re);if(m)return fn(m)}
  if(/overdose/i.test(text)){
    if(/présumée|suspectée|apparente|possible|soupçonn/i.test(text)) return 'Une overdose est évoquée ou suspectée par certaines sources, mais la cause officielle n’est pas encore confirmée.';
    return 'Des sources évoquent une overdose. La formulation exacte et la confirmation officielle sont à vérifier dans les articles liés.';
  }
  if(/cancer/i.test(text)) return 'Les sources mentionnent un cancer dans le contexte du décès.';
  if(/crise cardiaque|arrêt cardiaque/i.test(text)) return 'Les sources mentionnent un arrêt ou une crise cardiaque dans les circonstances du décès.';
  if(/suicide/i.test(text)) return 'Les sources indiquent un suicide comme cause du décès.';
  return 'La cause du décès n’est pas précisée ou n’est pas encore officiellement établie dans les sources récupérées.';
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1800');
  try{
    const feeds=await Promise.allSettled(SOURCES.map(async([source,site])=>{
      const q=`${site} ("est mort" OR "est décédé" OR "décès de" OR "mort de" OR "meurt à" OR "décède à")`;
      return parse(await (await get(googleUrl(q))).text(),source);
    }));
    const raw=feeds.flatMap(x=>x.status==='fulfilled'?x.value:[]).filter(isDeathNews).sort((a,b)=>new Date(b.date)-new Date(a.date));
    const groups=new Map();
    for(const a of raw){const person=extractPerson(a.title);if(!person)continue;const k=norm(person);if(!groups.has(k))groups.set(k,{person,articles:[]});groups.get(k).articles.push(a)}
    const candidates=[...groups.values()].sort((a,b)=>new Date(b.articles[0].date)-new Date(a.articles[0].date)).slice(0,24);
    const rows=[];
    for(let i=0;i<candidates.length;i+=6){
      const batch=candidates.slice(i,i+6);
      const out=await Promise.all(batch.map(async g=>{try{const p=await resolvePerson(g.person);if(!p)return null;const arts=g.articles.sort((a,b)=>new Date(b.date)-new Date(a.date));const primary=arts[0];const sources=[];const seen=new Set();for(const a of arts){if(seen.has(a.source))continue;seen.add(a.source);sources.push({source:a.source,url:a.url,date:a.date,title:a.title});if(sources.length>=5)break}return{id:`obit-${p.id}`,qid:p.id,person:p.person,image:p.image,who:p.who,age:p.age,gender:p.gender,cause:deathInfo(arts),date:primary.date,source:primary.source,url:primary.url,title:`Décès de ${p.person}`,description:p.who,summaryShort:`${p.person} est décédé${p.age?` à ${p.age} ans`:''}.`,summaryLong:`${p.who} ${deathInfo(arts)}`,category:'Nécrologie',sources,articleCount:arts.length};}catch{return null}}));
      rows.push(...out.filter(Boolean));
      if(rows.length>=12)break;
    }
    const merged=[];const seenQ=new Set();for(const r of rows){if(seenQ.has(r.qid))continue;seenQ.add(r.qid);merged.push(r)}
    return res.status(200).json({generatedAt:new Date().toISOString(),items:merged.slice(0,12)});
  }catch(e){return res.status(500).json({error:'Impossible de charger la nécrologie',detail:String(e?.message||e)})}
}

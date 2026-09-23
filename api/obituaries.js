const SOURCES=[
  ['RTBF','site:rtbf.be'],['RTL info','site:rtl.be'],['La Libre','site:lalibre.be'],
  ['Le Soir','site:lesoir.be'],['BX1','site:bx1.be'],['La DH','site:dhnet.be'],
  ['Le Vif','site:levif.be'],["L'Avenir",'site:lavenir.net'],['Sudinfo','site:sudinfo.be']
];
const decode=(v='')=>v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&nbsp;/gi,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const strip=(v='')=>decode(v).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const tag=(xml,name)=>{const m=xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'));return m?decode(m[1]).trim():''};
const norm=(v='')=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const uniq=a=>[...new Set((a||[]).filter(Boolean))];

async function get(url,timeout=8500){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{signal:c.signal,redirect:'follow',headers:{'user-agent':'Mozilla/5.0 IHECS-Test-Actus/6.0'}});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  }finally{clearTimeout(t)}
}
const googleUrl=(q,days=60)=>`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&hl=fr&gl=BE&ceid=BE:fr`;

function parse(xml,fallback='Presse'){
  return (xml.match(/<item\b[\s\S]*?<\/item>/gi)||[]).map((item,i)=>{
    const raw=strip(tag(item,'title'));
    const title=raw.replace(/\s+[–—-]\s+(RTBF|RTL info|La Libre|Le Soir|BX1|La DH|DHnet|Le Vif|L'Avenir|Sudinfo).*$/i,'').trim();
    const source=strip(tag(item,'source'))||fallback;
    const d=new Date(tag(item,'pubDate')||Date.now());
    return {id:`obit-${source}-${d.getTime()}-${i}`,title,description:strip(tag(item,'description')),source,url:strip(tag(item,'link')),date:d.toISOString()};
  }).filter(x=>x.title&&x.url);
}
function deathArticle(a){
  const t=`${a.title} ${a.description}`;
  return /\b(est mort|est morte|est décédé|est décédée|décès de|deces de|mort de|disparition de|s['’]est éteint|s['’]est éteinte|nous a quitté|nous a quittés|meurt à|décède à|décédé à l['’]âge|décédée à l['’]âge)\b/i.test(t);
}
const NAME=`[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\\s+(?:de|du|des|van|von|der|den|d['’]))?(?:\\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3}`;
function namedDeceased(title=''){
  const t=title.replace(/[«»“”"]/g,' ').replace(/\s+/g,' ').trim();
  const patterns=[
    new RegExp(`(?:décès|deces|mort|disparition)\\s+(?:de|du|d['’])\\s*(${NAME})`,'i'),
    new RegExp(`^(${NAME})\\s+(?:est mort|est morte|est décédé|est décédée|meurt|décède|s['’]est éteint|s['’]est éteinte)\\b`,'i'),
    new RegExp(`^(${NAME})\\s*,[^:]{0,70}\\b(?:est mort|est morte|est décédé|est décédée|meurt|décède)\\b`,'i'),
    new RegExp(`(?:décès|deces)\\s+de\\s+(?:son|sa|l['’])?(?:épouse|époux|mari|femme|compagnon|compagne|fils|fille)?\\s*(${NAME})`,'i'),
    new RegExp(`(?:hommage|adieu)\\s+à\\s+(${NAME})`,'i')
  ];
  for(const p of patterns){
    const m=t.match(p);
    if(m?.[1]){
      const n=m[1].replace(/\s+(?:à|après|dans|des|du|de|pour|qui|dont)$/i,'').trim();
      if(n.split(/\s+/).length>=2) return n;
    }
  }
  return '';
}
function qid(c){return c?.mainsnak?.datavalue?.value?.id||''}
function claimIds(e,p,max=6){return uniq((e?.claims?.[p]||[]).map(qid)).slice(0,max)}
function claimTime(e,p){
  const s=e?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value?.time||'';
  const m=s.match(/([+-]\d{4,})-(\d{2})-(\d{2})/); if(!m)return null;
  const y=m[1].replace('+',''); if(Number(y)<1000)return null;
  return new Date(`${y}-${m[2]}-${m[3]}T12:00:00Z`);
}
async function entity(id){
  const r=await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(id)}&props=labels|descriptions|claims|sitelinks&languages=fr|en&format=json&origin=*`);
  return (await r.json())?.entities?.[id]||null;
}
async function labels(ids){
  const out={},clean=uniq(ids).filter(x=>/^Q\d+$/.test(x));
  for(let i=0;i<clean.length;i+=40){
    const part=clean.slice(i,i+40);
    try{
      const r=await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${part.join('|')}&props=labels&languages=fr|en&format=json&origin=*`);
      const j=await r.json();
      for(const id of part) out[id]=j?.entities?.[id]?.labels?.fr?.value||j?.entities?.[id]?.labels?.en?.value||'';
    }catch{}
  }
  return out;
}
async function wikiImage(e){
  const file=e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if(file) return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1000`;
  const site=e?.sitelinks?.frwiki?.title?'fr':e?.sitelinks?.enwiki?.title?'en':'';
  if(!site)return '';
  try{
    const title=e.sitelinks[`${site}wiki`].title;
    const r=await get(`https://${site}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    const j=await r.json();
    return j?.originalimage?.source||j?.thumbnail?.source||'';
  }catch{return ''}
}
function age(b,d){
  if(!b)return null; d=d||new Date();
  let a=d.getUTCFullYear()-b.getUTCFullYear();
  if(d.getUTCMonth()<b.getUTCMonth()||(d.getUTCMonth()===b.getUTCMonth()&&d.getUTCDate()<b.getUTCDate()))a--;
  return a>=0&&a<=125?a:null;
}
async function resolve(name){
  const sr=await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=fr&uselang=fr&type=item&limit=8&format=json&origin=*`);
  const hits=(await sr.json())?.search||[];
  let best=null;
  for(const hit of hits){
    try{
      const e=await entity(hit.id); if(!e)continue;
      if(!(e.claims?.P31||[]).some(c=>qid(c)==='Q5'))continue; // human
      const label=e.labels?.fr?.value||e.labels?.en?.value||hit.label||name;
      const nn=norm(name),nl=norm(label);
      let score=nn===nl?12:(nl.includes(nn)||nn.includes(nl)?7:0);
      if(score<7)continue;
      score+=Math.min(3,Object.keys(e.sitelinks||{}).length/30);
      if(!best||score>best.score)best={e,label,id:hit.id,score};
    }catch{}
  }
  if(!best)return null;
  const image=await wikiImage(best.e); if(!image)return null;

  const e=best.e;
  const occupationIds=claimIds(e,'P106',8),countryIds=claimIds(e,'P27',3),workIds=claimIds(e,'P800',5),awardIds=claimIds(e,'P166',5),sportIds=claimIds(e,'P641',3),teamIds=claimIds(e,'P54',5),positionIds=claimIds(e,'P39',5),partyIds=claimIds(e,'P102',3);
  const L=await labels([...occupationIds,...countryIds,...workIds,...awardIds,...sportIds,...teamIds,...positionIds,...partyIds]);
  const vals=ids=>ids.map(x=>L[x]).filter(Boolean);
  const occupations=vals(occupationIds),countries=vals(countryIds),works=vals(workIds),awards=vals(awardIds),sports=vals(sportIds),teams=vals(teamIds),positions=vals(positionIds),parties=vals(partyIds);
  const occ=norm(occupations.join(' '));
  let profileType='general',profileLabel='Personnalité';
  if(/acteur|actrice|comedien|comedienne|realisateur|realisatrice|cinema/.test(occ)){profileType='actor';profileLabel='Cinéma / télévision'}
  else if(sports.length||teams.length||/footballeur|cycliste|tennis|athlete|sportif|sportive|pilote|basket|rugby|hockey/.test(occ)){profileType='sport';profileLabel='Sport'}
  else if(parties.length||positions.length||/politique|ministre|president|depute|senateur|maire|bourgmestre|diplomate/.test(occ)){profileType='politics';profileLabel='Politique'}

  const fmt=(a,n=4)=>a.slice(0,n).join(' · ');
  const details=[];
  if(profileType==='actor'){
    if(occupations.length)details.push({label:'Métier',value:fmt(occupations,3)});
    if(works.length)details.push({label:'Films / œuvres',value:fmt(works,4)});
    if(awards.length)details.push({label:'Récompenses',value:fmt(awards,4)});
  }else if(profileType==='sport'){
    if(sports.length)details.push({label:'Sport',value:fmt(sports,2)});
    if(teams.length)details.push({label:'Clubs / équipes',value:fmt(teams,4)});
    if(awards.length)details.push({label:'Distinctions',value:fmt(awards,3)});
  }else if(profileType==='politics'){
    if(countries.length)details.push({label:'Pays',value:fmt(countries,2)});
    if(positions.length)details.push({label:'Fonctions',value:fmt(positions,4)});
    if(parties.length)details.push({label:'Parti',value:fmt(parties,3)});
  }else{
    if(occupations.length)details.push({label:'Activité',value:fmt(occupations,3)});
    if(works.length)details.push({label:'Connu notamment pour',value:fmt(works,4)});
    if(awards.length)details.push({label:'Récompenses',value:fmt(awards,3)});
  }
  if(countries.length&&!details.some(d=>d.label==='Pays'))details.push({label:'Pays',value:fmt(countries,2)});

  const birth=claimTime(e,'P569'),death=claimTime(e,'P570');
  const desc=e.descriptions?.fr?.value||e.descriptions?.en?.value||'personnalité publique';
  return {
    qid:best.id,person:best.label,image,who:`${best.label} était ${desc.replace(/\.$/,'')}.`,
    age:age(birth,death||new Date()),country:countries[0]||'',occupationShort:occupations[0]||'',
    profileType,profileLabel,details
  };
}
function cause(arts){
  const t=arts.map(a=>`${a.title}. ${a.description}`).join(' ');
  const rules=[
    [/des suites (?:d['’]|de )([^.;]{3,100})/i,m=>`Les sources indiquent un décès des suites ${m[0].replace(/^des suites /i,'')}.`],
    [/emporté(?:e)? par ([^.;]{3,90})/i,m=>`Les sources indiquent qu’il/elle a été emporté(e) par ${m[1]}.`],
    [/(?:mort|décéd(?:é|ée)) dans (un accident[^.;]{0,100})/i,m=>`Les sources indiquent un décès dans ${m[1]}.`]
  ];
  for(const [r,f] of rules){const m=t.match(r);if(m)return f(m)}
  if(/overdose/i.test(t))return 'Une overdose est évoquée dans les articles récupérés ; vérifie la source pour le niveau de confirmation.';
  if(/cancer/i.test(t))return 'Les articles mentionnent un cancer dans le contexte du décès.';
  return 'La cause du décès n’est pas précisée ou n’est pas encore officiellement établie dans les sources récupérées.';
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1800');
  try{
    const jobs=[];
    for(const [source,site] of SOURCES){
      jobs.push((async()=>parse(await (await get(googleUrl(`${site} ("est mort" OR "est décédé" OR "décès de" OR "mort de")`,60))).text(),source))());
      jobs.push((async()=>parse(await (await get(googleUrl(`${site} ("s'est éteint" OR "nous a quittés" OR "disparition de")`,60))).text(),source))());
    }
    jobs.push((async()=>parse(await (await get(googleUrl(`("est mort" OR "est décédé" OR "décès de") (acteur OR actrice OR chanteur OR sportif OR ministre OR président OR écrivain OR journaliste)`,60))).text(),'Presse'))());

    const settled=await Promise.allSettled(jobs);
    const raw=settled.flatMap(x=>x.status==='fulfilled'?x.value:[]).filter(deathArticle).sort((a,b)=>new Date(b.date)-new Date(a.date));
    const seenArticle=new Set(),articles=[];
    for(const a of raw){
      const k=norm(a.title); if(seenArticle.has(k))continue;
      seenArticle.add(k); articles.push(a);
    }

    const named=[];
    for(const a of articles){
      const name=namedDeceased(a.title);
      if(name)named.push({...a,personCandidate:name});
    }

    const resolved=[];
    for(let i=0;i<Math.min(named.length,90);i+=8){
      const batch=named.slice(i,i+8);
      const rows=await Promise.all(batch.map(async a=>{
        try{
          const p=await resolve(a.personCandidate);
          return p?{article:a,profile:p}:null;
        }catch{return null}
      }));
      resolved.push(...rows.filter(Boolean));
      if(new Set(resolved.map(x=>x.profile.qid)).size>=24)break;
    }

    const groups=new Map();
    for(const r of resolved){
      if(!groups.has(r.profile.qid))groups.set(r.profile.qid,{profile:r.profile,articles:[]});
      groups.get(r.profile.qid).articles.push(r.article);
    }

    const items=[...groups.values()].map(g=>{
      const arts=g.articles.sort((a,b)=>new Date(b.date)-new Date(a.date));
      const primary=arts[0],sources=[];
      const ss=new Set();
      for(const a of arts){
        const k=`${a.source}|${a.url}`; if(ss.has(k))continue;
        ss.add(k); sources.push({source:a.source,url:a.url,date:a.date,title:a.title});
        if(sources.length>=6)break;
      }
      const p=g.profile,c=cause(arts);
      return {
        id:`obit-${p.qid}`,qid:p.qid,person:p.person,image:p.image,who:p.who,age:p.age,
        country:p.country,occupationShort:p.occupationShort,profileType:p.profileType,profileLabel:p.profileLabel,details:p.details,
        date:primary.date,source:primary.source,url:primary.url,title:`Décès de ${p.person}`,description:p.who,
        summaryShort:`${p.person} est décédé${p.age?` à ${p.age} ans`:''}.`,
        summaryLong:`${p.who} ${c}`,category:'Nécrologie',cause:c,sources,articleCount:arts.length,
        politicalNote:p.profileType==='politics'?'Le parti et les fonctions sont affichés lorsqu’ils sont documentés. L’app ne déduit pas elle-même une étiquette droite/gauche.':''
      };
    }).sort((a,b)=>new Date(b.date)-new Date(a.date));

    return res.status(200).json({generatedAt:new Date().toISOString(),items:items.slice(0,20),candidates:articles.length,named:named.length,verified:items.length});
  }catch(e){
    return res.status(500).json({error:'Impossible de charger la nécrologie',detail:String(e?.message||e)});
  }
}

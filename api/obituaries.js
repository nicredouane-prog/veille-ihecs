const norm=(v='')=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const uniq=a=>[...new Set((a||[]).filter(Boolean))];
const decode=(v='')=>v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&nbsp;/gi,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const strip=(v='')=>decode(v).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const tag=(xml,name)=>{const m=xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'));return m?decode(m[1]).trim():''};

async function get(url,timeout=10000,options={}){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{...options,signal:c.signal,redirect:'follow',headers:{'user-agent':'IHECS-Test-Actus/6.1','accept-language':'fr-BE,fr;q=0.9,en;q=0.6',...(options.headers||{})}});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  }finally{clearTimeout(t)}
}

async function fetchRecentDeaths(days=60,limit=80){
  const since=new Date(Date.now()-days*86400000).toISOString();
  const query=`
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?person ?personLabel ?personDescription ?death ?image ?sitelinks WHERE {
  ?person wdt:P31 wd:Q5 ;
          wdt:P570 ?death ;
          wdt:P18 ?image ;
          wikibase:sitelinks ?sitelinks .
  FILTER(?death >= "${since}"^^xsd:dateTime)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
ORDER BY DESC(?death) DESC(?sitelinks)
LIMIT ${limit}`;
  const body=new URLSearchParams({query,format:'json'}).toString();
  const r=await get('https://query.wikidata.org/sparql',15000,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/sparql-results+json'},body});
  const j=await r.json();
  return (j?.results?.bindings||[]).map(x=>({
    qid:(x.person?.value||'').split('/').pop(),
    person:x.personLabel?.value||'',
    description:x.personDescription?.value||'',
    death:x.death?.value||'',
    image:x.image?.value||'',
    sitelinks:Number(x.sitelinks?.value||0)
  })).filter(x=>/^Q\d+$/.test(x.qid)&&x.person&&x.death&&x.image);
}

function parseFeed(xml){
  return (xml.match(/<item\b[\s\S]*?<\/item>/gi)||[]).map((item,i)=>{
    const raw=strip(tag(item,'title'));
    const source=strip(tag(item,'source'))||'Presse';
    const title=raw.replace(/\s+[–—-]\s+[^–—-]{2,45}$/,'').trim();
    const d=new Date(tag(item,'pubDate')||Date.now());
    return {id:`g-${d.getTime()}-${i}`,title,description:strip(tag(item,'description')),source,url:strip(tag(item,'link')),date:d.toISOString()};
  }).filter(x=>x.title&&x.url);
}
const googleUrl=(q,days=30)=>`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&hl=fr&gl=BE&ceid=BE:fr`;
const deathTerms=s=>/\b(mort|morte|décès|deces|décédé|décédée|disparition|s['’]est éteint|s['’]est éteinte|nous a quittés|nous a quitté|adieu)\b/i.test(s||'');
function namePresent(article,name){
  const hay=norm(`${article.title} ${article.description}`),full=norm(name);
  if(full&&hay.includes(full))return true;
  const parts=full.split(' ').filter(x=>x.length>=3);
  return parts.length>=2&&parts.slice(-2).every(p=>hay.includes(p));
}
function nearDeath(articleDate,deathDate,maxDays=30){
  const a=new Date(articleDate),d=new Date(deathDate),diff=(a-d)/86400000;
  return diff>=-2&&diff<=maxDays;
}
async function searchArticlesFor(candidates){
  const result=new Map(candidates.map(c=>[c.qid,[]]));
  const batches=[];
  for(let i=0;i<candidates.length;i+=5)batches.push(candidates.slice(i,i+5));
  const settled=await Promise.allSettled(batches.map(async batch=>{
    const names=batch.map(x=>`"${x.person.replace(/"/g,'')}"`).join(' OR ');
    const q=`(${names}) (mort OR décès OR décédé OR décédée OR disparition OR "s'est éteint")`;
    const r=await get(googleUrl(q,35),9000);
    return {batch,items:parseFeed(await r.text())};
  }));
  for(const job of settled){
    if(job.status!=='fulfilled')continue;
    const {batch,items}=job.value;
    for(const c of batch){
      const matches=items.filter(a=>namePresent(a,c.person)&&deathTerms(`${a.title} ${a.description}`)&&nearDeath(a.date,c.death,35));
      if(matches.length)result.set(c.qid,matches.slice(0,6));
    }
  }
  return result;
}

const qid=c=>c?.mainsnak?.datavalue?.value?.id||'';
const claimIds=(e,p,max=6)=>uniq((e?.claims?.[p]||[]).map(qid)).slice(0,max);
function claimTime(e,p){
  const s=e?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value?.time||'';
  const m=s.match(/([+-]\d{4,})-(\d{2})-(\d{2})/); if(!m)return null;
  const y=m[1].replace('+',''); if(Number(y)<1000)return null;
  return new Date(`${y}-${m[2]}-${m[3]}T12:00:00Z`);
}
async function fetchEntities(ids){
  const out={};
  for(let i=0;i<ids.length;i+=40){
    const part=ids.slice(i,i+40);
    try{
      const r=await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${part.join('|')}&props=labels|descriptions|claims|sitelinks&languages=fr|en&format=json&origin=*`,12000);
      Object.assign(out,(await r.json())?.entities||{});
    }catch{}
  }
  return out;
}
async function fetchLabels(ids){
  const clean=uniq(ids).filter(x=>/^Q\d+$/.test(x)),out={};
  for(let i=0;i<clean.length;i+=45){
    const part=clean.slice(i,i+45);
    try{
      const r=await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${part.join('|')}&props=labels|claims&languages=fr|en&format=json&origin=*`,12000);
      const j=await r.json();
      for(const id of part){
        const e=j?.entities?.[id]; if(e)out[id]={label:e.labels?.fr?.value||e.labels?.en?.value||id,entity:e};
      }
    }catch{}
  }
  return out;
}
function ageAt(birth,death){
  if(!birth||!death)return null;
  let a=death.getUTCFullYear()-birth.getUTCFullYear();
  if(death.getUTCMonth()<birth.getUTCMonth()||(death.getUTCMonth()===birth.getUTCMonth()&&death.getUTCDate()<birth.getUTCDate()))a--;
  return a>=0&&a<=125?a:null;
}
function commonsImage(v){return v?String(v).replace('http://','https://'):''}
function causeFromArticles(arts=[]){
  const t=arts.map(a=>`${a.title}. ${a.description}`).join(' ');
  const rules=[
    [/des suites (?:d['’]|de )([^.;]{3,110})/i,m=>`Les articles indiquent un décès des suites ${m[0].replace(/^des suites /i,'')}.`],
    [/emporté(?:e)? par ([^.;]{3,100})/i,m=>`Les articles indiquent qu’il/elle a été emporté(e) par ${m[1]}.`],
    [/(?:mort|décéd(?:é|ée)) dans (un accident[^.;]{0,110})/i,m=>`Les articles indiquent un décès dans ${m[1]}.`],
    [/(?:mort|décéd(?:é|ée)) après (un accident[^.;]{0,110})/i,m=>`Les articles indiquent un décès après ${m[1]}.`]
  ];
  for(const [r,f] of rules){const m=t.match(r);if(m)return f(m)}
  if(/\boverdose\b/i.test(t))return 'Une overdose est évoquée dans les articles récupérés ; ouvre la source pour vérifier le niveau de confirmation.';
  if(/\bcancer\b/i.test(t))return 'Les articles mentionnent un cancer dans le contexte du décès.';
  if(/crise cardiaque|arrêt cardiaque/i.test(t))return 'Les articles mentionnent un arrêt ou une crise cardiaque.';
  return 'La cause du décès n’est pas précisée ou n’est pas encore officiellement établie dans les articles récupérés.';
}
const fmt=(arr,n=4)=>arr.slice(0,n).join(' · ');

function basicProfile(candidate,e,labelData,alignmentLabels){
  if(!e)return null;
  const ids={
    occupations:claimIds(e,'P106',8),countries:claimIds(e,'P27',4),works:claimIds(e,'P800',6),awards:claimIds(e,'P166',6),
    sports:claimIds(e,'P641',3),teams:claimIds(e,'P54',6),positions:claimIds(e,'P39',6),parties:claimIds(e,'P102',3)
  };
  const vals=k=>ids[k].map(id=>labelData[id]?.label).filter(Boolean);
  const occupations=vals('occupations'),countries=vals('countries'),works=vals('works'),awards=vals('awards'),sports=vals('sports'),teams=vals('teams'),positions=vals('positions'),parties=vals('parties');
  const descriptor=norm(`${candidate.description} ${occupations.join(' ')}`);
  let profileType='general',profileLabel='Personnalité';
  if(/acteur|actrice|comedien|comedienne|realisateur|realisatrice|cinema|television/.test(descriptor)){profileType='actor';profileLabel='Cinéma / télévision'}
  else if(sports.length||teams.length||/footballeur|cycliste|tennis|athlete|sportif|sportive|pilote|basket|rugby|hockey/.test(descriptor)){profileType='sport';profileLabel='Sport'}
  else if(parties.length||positions.length||/politique|ministre|president|depute|senateur|maire|bourgmestre|diplomate/.test(descriptor)){profileType='politics';profileLabel='Politique'}
  const details=[];
  if(profileType==='actor'){
    if(occupations.length)details.push({label:'Métier',value:fmt(occupations,3)});
    if(works.length)details.push({label:'Films / œuvres marquantes',value:fmt(works,4)});
    if(awards.length)details.push({label:'Récompenses',value:fmt(awards,4)});
    if(countries.length)details.push({label:'Pays',value:fmt(countries,2)});
  }else if(profileType==='sport'){
    if(sports.length)details.push({label:'Sport',value:fmt(sports,2)});
    if(teams.length)details.push({label:'Clubs / équipes',value:fmt(teams,4)});
    if(countries.length)details.push({label:'Pays',value:fmt(countries,2)});
    if(awards.length)details.push({label:'Distinctions',value:fmt(awards,3)});
  }else if(profileType==='politics'){
    if(countries.length)details.push({label:'Pays',value:fmt(countries,2)});
    if(positions.length)details.push({label:'Fonctions',value:fmt(positions,4)});
    if(parties.length)details.push({label:'Parti',value:fmt(parties,3)});
    const align=[];
    for(const pid of ids.parties){
      const pe=labelData[pid]?.entity;
      for(const aid of [...claimIds(pe,'P1387',3),...claimIds(pe,'P1142',5)]){
        if(alignmentLabels[aid]?.label)align.push(alignmentLabels[aid].label);
      }
    }
    if(uniq(align).length)details.push({label:'Positionnement / idéologie',value:fmt(uniq(align),4)});
  }else{
    if(occupations.length)details.push({label:'Activité',value:fmt(occupations,3)});
    if(countries.length)details.push({label:'Pays',value:fmt(countries,2)});
    if(works.length)details.push({label:'Connu notamment pour',value:fmt(works,4)});
    if(awards.length)details.push({label:'Récompenses',value:fmt(awards,3)});
  }
  const birth=claimTime(e,'P569'),death=new Date(candidate.death),genderQ=qid(e?.claims?.P21?.[0]);
  const gender=genderQ==='Q6581072'?'female':genderQ==='Q6581097'?'male':'';
  const who=candidate.description?`${candidate.person} était ${candidate.description.replace(/\.$/,'')}.`:`${candidate.person} était une personnalité publique.`;
  return {person:candidate.person,image:commonsImage(candidate.image),who,age:ageAt(birth,death),gender,country:countries[0]||'',occupationShort:occupations[0]||'',profileType,profileLabel,details,politicalNote:profileType==='politics'?'Le positionnement affiché reprend uniquement des données documentées ; l’app ne déduit pas elle-même une étiquette droite/gauche.':''};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=1800, stale-while-revalidate=3600');
  try{
    const recent=await fetchRecentDeaths(60,80);
    const candidates=recent.sort((a,b)=>new Date(b.death)-new Date(a.death)||b.sitelinks-a.sitelinks).slice(0,60);
    const articleMap=await searchArticlesFor(candidates);
    const withPress=candidates.filter(c=>(articleMap.get(c.qid)||[]).length>0).slice(0,35);

    const entities=await fetchEntities(withPress.map(x=>x.qid));
    const refs=[];
    for(const c of withPress){
      const e=entities[c.qid]; if(!e)continue;
      for(const p of ['P106','P27','P800','P166','P641','P54','P39','P102'])refs.push(...claimIds(e,p,8));
    }
    const labelData=await fetchLabels(refs);
    const alignmentIds=[];
    for(const v of Object.values(labelData)){
      const pe=v?.entity;
      alignmentIds.push(...claimIds(pe,'P1387',3),...claimIds(pe,'P1142',5));
    }
    const alignmentLabels=await fetchLabels(alignmentIds);

    const items=[];
    for(const c of withPress){
      const arts=(articleMap.get(c.qid)||[]).sort((a,b)=>new Date(b.date)-new Date(a.date));
      if(!arts.length)continue;
      const p=basicProfile(c,entities[c.qid],labelData,alignmentLabels);
      if(!p?.image)continue;
      const primary=arts[0],sources=[],seen=new Set();
      for(const a of arts){
        const k=`${a.source}|${a.url}`; if(seen.has(k))continue;
        seen.add(k); sources.push({source:a.source,url:a.url,date:a.date,title:a.title});
        if(sources.length>=6)break;
      }
      const cause=causeFromArticles(arts);
      const verb=p.gender==='female'?'décédée':'décédé';
      items.push({id:`obit-${c.qid}`,qid:c.qid,...p,date:c.death,reportedAt:primary.date,source:primary.source,url:primary.url,title:`Décès de ${p.person}`,description:p.who,summaryShort:`${p.person} est ${verb}${p.age?` à ${p.age} ans`:''}.`,summaryLong:`${p.who} ${cause}`,category:'Nécrologie',cause,sources,articleCount:arts.length,sitelinks:c.sitelinks});
      if(items.length>=20)break;
    }
    return res.status(200).json({generatedAt:new Date().toISOString(),items,candidates:recent.length,named:withPress.length,verified:items.length,method:'wikidata-recent-deaths-plus-press'});
  }catch(e){
    return res.status(500).json({error:'Impossible de charger la nécrologie',detail:String(e?.message||e)});
  }
}

const SOURCES=[
  ['RTBF','site:rtbf.be'],['RTL info','site:rtl.be'],['La Libre','site:lalibre.be'],
  ['Le Soir','site:lesoir.be'],['BX1','site:bx1.be'],['La DH','site:dhnet.be'],
  ['Le Vif','site:levif.be'],["L'Avenir",'site:lavenir.net'],['Sudinfo','site:sudinfo.be']
];

const uniq=a=>[...new Set((a||[]).filter(Boolean))];
const norm=(v='')=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const decode=(v='')=>String(v||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&nbsp;/gi,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const strip=(v='')=>decode(v).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const tag=(xml,name)=>{const m=String(xml||'').match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'));return m?decode(m[1]).trim():''};

async function safeFetch(url,timeout=7500,options={}){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{...options,signal:c.signal,redirect:'follow',headers:{'user-agent':'IHECS-Test-Actus/6.2','accept-language':'fr-BE,fr;q=0.9,en;q=0.6',...(options.headers||{})}});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  }finally{clearTimeout(t)}
}

function parseFeed(xml,fallback='Presse'){
  return (String(xml||'').match(/<item\b[\s\S]*?<\/item>/gi)||[]).map((item,i)=>{
    const raw=strip(tag(item,'title'));
    const source=strip(tag(item,'source'))||fallback;
    const title=raw.replace(/\s+[–—-]\s+(RTBF|RTL info|La Libre|Le Soir|BX1|La DH|DHnet|Le Vif|L'Avenir|Sudinfo).*$/i,'').trim();
    const d=new Date(tag(item,'pubDate')||Date.now());
    return {id:`g-${source}-${d.getTime()}-${i}`,title,description:strip(tag(item,'description')),source,url:strip(tag(item,'link')),date:d.toISOString()};
  }).filter(x=>x.title&&x.url);
}
const googleUrl=(q,days=45)=>`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&hl=fr&gl=BE&ceid=BE:fr`;

const NAME_WORD="[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]{1,}";
const NAME=`${NAME_WORD}(?:\\s+(?:de|du|des|van|von|der|den|d['’]))?(?:\\s+${NAME_WORD}){1,3}`;
const BAD_NAME=/^(La France|La Belgique|Union Européenne|Commission Européenne|États-Unis|Royaume-Uni|Le Monde|Le Soir|La Libre|RTL Info|RTBF)$/i;

function extractDeceased(text=''){
  const t=String(text||'').replace(/[«»“”"]/g,' ').replace(/\s+/g,' ').trim();
  const patterns=[
    new RegExp(`(?:la\\s+)?mort\\s+(?:de|du|d['’])\\s*(${NAME})`,'i'),
    new RegExp(`(?:le\\s+)?décès\\s+(?:de|du|d['’])\\s*(${NAME})`,'i'),
    new RegExp(`disparition\\s+(?:de|du|d['’])\\s*(${NAME})`,'i'),
    new RegExp(`^(${NAME})\\s+(?:est mort|est morte|est décédé|est décédée|meurt|décède|s['’]est éteint|s['’]est éteinte)\\b`,'i'),
    new RegExp(`(?:adieu|hommage)\\s+à\\s+(${NAME})`,'i')
  ];
  for(const p of patterns){
    const m=t.match(p);
    if(m?.[1]){
      let n=m[1].replace(/\s+(?:à|après|dans|des|du|de|pour|qui|dont|suite)$/i,'').trim();
      if(n.split(/\s+/).length>=2&&!BAD_NAME.test(n)) return n;
    }
  }
  return '';
}

function explicitDeath(article){
  return /\b(mort|morte|décès|deces|décédé|décédée|disparition|s['’]est éteint|s['’]est éteinte|nous a quitté|nous a quittés|meurt|décède)\b/i.test(`${article.title} ${article.description}`);
}

async function newsCandidates(){
  const jobs=[];
  for(const [source,site] of SOURCES){
    jobs.push((async()=>{
      try{
        const r=await safeFetch(googleUrl(`${site} ("est mort" OR "est décédé" OR "décès de" OR "mort de" OR "s'est éteint")`,60),6500);
        return parseFeed(await r.text(),source);
      }catch{return []}
    })());
  }
  jobs.push((async()=>{try{const r=await safeFetch(googleUrl(`("est mort" OR "est décédé" OR "décès de" OR "mort de") (acteur OR actrice OR chanteur OR chanteuse OR sportif OR sportive OR ministre OR président OR écrivain OR journaliste)`,45),6500);return parseFeed(await r.text(),'Presse')}catch{return []}})());
  const lists=(await Promise.all(jobs)).flat().filter(explicitDeath).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const grouped=new Map();
  for(const a of lists){
    const person=extractDeceased(`${a.title} ${a.description}`);
    if(!person)continue;
    const k=norm(person); if(!k)continue;
    if(!grouped.has(k))grouped.set(k,{person,date:a.date,articles:[]});
    grouped.get(k).articles.push(a);
  }
  return [...grouped.values()];
}

const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
function cleanWiki(v=''){
  return String(v||'')
    .replace(/<ref[\s\S]*?<\/ref>/gi,' ')
    .replace(/<ref[^>]*\/>/gi,' ')
    .replace(/\{\{[^{}]*\}\}/g,' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,'$2')
    .replace(/\[\[([^\]]+)\]\]/g,'$1')
    .replace(/''+/g,'')
    .replace(/\s+/g,' ').trim();
}
function refUrl(line=''){
  const m=String(line).match(/\|\s*url\s*=\s*([^|}\s]+)/i);
  return m?m[1].trim():'';
}

async function wikipediaDeathCandidates(){
  try{
    const r=await safeFetch('https://en.wikipedia.org/w/api.php?action=parse&page=Deaths_in_2026&prop=wikitext&format=json&origin=*&redirects=1',6500);
    const j=await r.json();
    const wt=j?.parse?.wikitext?.['*']||'';
    if(!wt)return [];
    const now=new Date();
    const cutoff=new Date(now.getTime()-60*86400000);
    let month=-1,day=0;
    const out=[];
    for(const line of wt.split(/\r?\n/)){
      const mh=line.match(/^==\s*([A-Za-z]+)\s*==\s*$/);
      if(mh){month=monthNames.findIndex(x=>x.toLowerCase()===mh[1].toLowerCase());continue;}
      const dh=line.match(/^===\s*(\d{1,2})\s*===\s*$/);
      if(dh){day=Number(dh[1]);continue;}
      if(month<0||!day||!/^\*\s/.test(line))continue;
      const date=new Date(Date.UTC(now.getUTCFullYear(),month,day,12));
      if(date<cutoff||date>new Date(now.getTime()+2*86400000))continue;
      const lm=line.match(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/);
      if(!lm)continue;
      const page=lm[1].trim(); const person=(lm[2]||lm[1]).trim();
      if(!person||BAD_NAME.test(person)||/^(List of|Deaths in|Category:)/i.test(page))continue;
      const after=line.slice((lm.index||0)+lm[0].length);
      const am=after.match(/^\s*,\s*(\d{1,3})\s*,\s*([^<\n]+)/);
      const age=am?Number(am[1]):null;
      const bio=am?cleanWiki(am[2]):cleanWiki(after.replace(/^\s*,\s*/,''));
      const url=refUrl(line);
      out.push({person,page,date:date.toISOString(),age,bio,url,articles:url?[{source:'Source biographique',url,date:date.toISOString(),title:`Décès de ${person}`}]:[]});
    }
    return out.sort((a,b)=>new Date(b.date)-new Date(a.date));
  }catch{return []}
}

function mergeCandidates(a=[],b=[]){
  const map=new Map();
  for(const c of [...a,...b]){
    const k=norm(c.person); if(!k)continue;
    if(!map.has(k))map.set(k,{person:c.person,page:c.page||c.person,date:c.date||new Date().toISOString(),age:c.age||null,bio:c.bio||'',articles:[]});
    const row=map.get(k);
    if(c.date&&new Date(c.date)>new Date(row.date))row.date=c.date;
    if(!row.age&&c.age)row.age=c.age;
    if(!row.bio&&c.bio)row.bio=c.bio;
    for(const art of c.articles||[]){
      if(!row.articles.some(x=>x.url===art.url))row.articles.push(art);
    }
  }
  return [...map.values()].sort((x,y)=>new Date(y.date)-new Date(x.date));
}

async function wikiProfiles(candidates){
  const names=candidates.map(c=>c.page||c.person).slice(0,40);
  const pages={};
  for(let i=0;i<names.length;i+=20){
    const part=names.slice(i,i+20);
    try{
      const url=`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(part.join('|'))}&prop=pageimages|description|pageprops&piprop=thumbnail|original&pithumbsize=900&redirects=1&format=json&origin=*`;
      const r=await safeFetch(url,7000); const j=await r.json();
      for(const p of Object.values(j?.query?.pages||{})){
        const title=p?.title||''; if(title)pages[norm(title)]=p;
      }
      for(const redir of j?.query?.redirects||[]){
        const target=pages[norm(redir.to)]; if(target)pages[norm(redir.from)]=target;
      }
    }catch{}
  }

  const missing=[];
  for(const c of candidates.slice(0,32)){
    const p=pages[norm(c.page||c.person)]||pages[norm(c.person)];
    if(!p||p.missing!==undefined||!(p.original?.source||p.thumbnail?.source))missing.push(c);
  }
  // A small fallback search for exact-title misses.
  const fallback=await Promise.all(missing.slice(0,8).map(async c=>{
    try{
      const u=`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(c.person)}&gsrlimit=3&prop=pageimages|description|pageprops&piprop=thumbnail|original&pithumbsize=900&format=json&origin=*`;
      const r=await safeFetch(u,5500); const j=await r.json();
      const arr=Object.values(j?.query?.pages||{}).filter(Boolean);
      arr.sort((x,y)=>(norm(x.title)===norm(c.person)?-10:0)-(norm(y.title)===norm(c.person)?-10:0));
      return {key:norm(c.person),page:arr.find(x=>x.original?.source||x.thumbnail?.source)||null};
    }catch{return {key:norm(c.person),page:null}}
  }));
  for(const x of fallback)if(x.page)pages[x.key]=x.page;
  return pages;
}

const qid=c=>c?.mainsnak?.datavalue?.value?.id||'';
const claimIds=(e,p,max=6)=>uniq((e?.claims?.[p]||[]).map(qid)).slice(0,max);
function claimTime(e,p){
  const s=e?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value?.time||''; const m=s.match(/([+-]\d{4,})-(\d{2})-(\d{2})/); if(!m)return null;
  const y=m[1].replace('+',''); if(Number(y)<1000)return null; return new Date(`${y}-${m[2]}-${m[3]}T12:00:00Z`);
}
async function wikidataEntities(ids){
  const clean=uniq(ids).filter(x=>/^Q\d+$/.test(x)); if(!clean.length)return {};
  try{
    const r=await safeFetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${clean.join('|')}&props=labels|descriptions|claims&languages=fr|en&format=json&origin=*`,8000);
    return (await r.json())?.entities||{};
  }catch{return {}}
}
async function labelMap(ids){
  const clean=uniq(ids).filter(x=>/^Q\d+$/.test(x)); if(!clean.length)return {};
  const out={};
  for(let i=0;i<clean.length;i+=45){
    try{
      const part=clean.slice(i,i+45); const r=await safeFetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${part.join('|')}&props=labels|claims&languages=fr|en&format=json&origin=*`,7500); const j=await r.json();
      for(const id of part){const e=j?.entities?.[id]; if(e)out[id]={label:e.labels?.fr?.value||e.labels?.en?.value||id,entity:e};}
    }catch{}
  }
  return out;
}
const fmt=(arr,n=4)=>arr.slice(0,n).join(' · ');
function inferBasicProfile(c,page){
  const d=`${page?.description||''} ${c.bio||''}`;
  const low=norm(d);
  let profileType='general',profileLabel='Personnalité';
  if(/actor|actress|film director|acteur|actrice|cinema|television/.test(low)){profileType='actor';profileLabel='Cinéma / télévision'}
  else if(/football|footballer|cyclist|tennis|boxer|basketball|rugby|athlete|sport/.test(low)){profileType='sport';profileLabel='Sport'}
  else if(/politician|minister|president|senator|member of parliament|mayor|politique|ministre/.test(low)){profileType='politics';profileLabel='Politique'}
  const details=[];
  if(c.bio)details.push({label:profileType==='actor'?'Carrière':profileType==='sport'?'Carrière sportive':profileType==='politics'?'Fonctions':'Profil',value:c.bio.slice(0,220)});
  return {profileType,profileLabel,details};
}
function ageAt(b,d){if(!b||!d)return null;let a=d.getUTCFullYear()-b.getUTCFullYear();if(d.getUTCMonth()<b.getUTCMonth()||(d.getUTCMonth()===b.getUTCMonth()&&d.getUTCDate()<b.getUTCDate()))a--;return a>=0&&a<=125?a:null;}

function enrichProfile(c,page,entity,labels){
  const basic=inferBasicProfile(c,page); if(!entity)return basic;
  const ids={occupations:claimIds(entity,'P106',8),countries:claimIds(entity,'P27',4),works:claimIds(entity,'P800',6),awards:claimIds(entity,'P166',6),sports:claimIds(entity,'P641',3),teams:claimIds(entity,'P54',6),positions:claimIds(entity,'P39',6),parties:claimIds(entity,'P102',3)};
  const vals=k=>ids[k].map(id=>labels[id]?.label).filter(Boolean);
  const occupations=vals('occupations'),countries=vals('countries'),works=vals('works'),awards=vals('awards'),sports=vals('sports'),teams=vals('teams'),positions=vals('positions'),parties=vals('parties');
  const desc=norm(`${page?.description||''} ${c.bio||''} ${occupations.join(' ')}`);
  let profileType=basic.profileType,profileLabel=basic.profileLabel;
  if(/acteur|actrice|actor|actress|comedien|realisateur|cinema/.test(desc)){profileType='actor';profileLabel='Cinéma / télévision'}
  else if(sports.length||teams.length||/football|cyclist|tennis|athlete|sportif|sportive|basket|rugby|hockey|boxer/.test(desc)){profileType='sport';profileLabel='Sport'}
  else if(parties.length||positions.length||/politician|politique|ministre|president|depute|senator|mayor/.test(desc)){profileType='politics';profileLabel='Politique'}
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
  }else{
    if(occupations.length)details.push({label:'Activité',value:fmt(occupations,3)});
    if(countries.length)details.push({label:'Pays',value:fmt(countries,2)});
    if(works.length)details.push({label:'Connu notamment pour',value:fmt(works,4)});
    if(awards.length)details.push({label:'Récompenses',value:fmt(awards,3)});
  }
  if(!details.length&&c.bio)details.push({label:'Profil',value:c.bio.slice(0,220)});
  return {profileType,profileLabel,details,country:countries[0]||'',occupationShort:occupations[0]||'',birth:claimTime(entity,'P569')};
}

function causeFromArticles(arts=[],bio=''){
  const t=`${arts.map(a=>`${a.title}. ${a.description||''}`).join(' ')} ${bio}`;
  const rules=[
    [/des suites (?:d['’]|de )([^.;]{3,110})/i,m=>`Les sources indiquent un décès des suites ${m[0].replace(/^des suites /i,'')}.`],
    [/emporté(?:e)? par ([^.;]{3,100})/i,m=>`Les sources indiquent qu’il/elle a été emporté(e) par ${m[1]}.`],
    [/(?:mort|décéd(?:é|ée)) dans (un accident[^.;]{0,110})/i,m=>`Les sources indiquent un décès dans ${m[1]}.`]
  ];
  for(const [r,f] of rules){const m=t.match(r);if(m)return f(m)}
  if(/cancer/i.test(t))return 'Les sources mentionnent un cancer dans le contexte du décès.';
  if(/heart attack|crise cardiaque|arrêt cardiaque/i.test(t))return 'Les sources mentionnent un arrêt ou une crise cardiaque.';
  return 'La cause du décès n’est pas précisée ou n’est pas encore officiellement établie dans les sources récupérées.';
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1800');
  const diagnostics={news:0,wikipedia:0,profiles:0};
  try{
    const [news,wiki]=await Promise.all([newsCandidates(),wikipediaDeathCandidates()]);
    diagnostics.news=news.length; diagnostics.wikipedia=wiki.length;
    const candidates=mergeCandidates(news,wiki).slice(0,40);
    if(!candidates.length)return res.status(200).json({generatedAt:new Date().toISOString(),items:[],...diagnostics,method:'news-plus-wikipedia-fallback'});

    const pages=await wikiProfiles(candidates);
    const selected=[];
    for(const c of candidates){
      const p=pages[norm(c.page||c.person)]||pages[norm(c.person)];
      const image=p?.original?.source||p?.thumbnail?.source||'';
      if(!p||p.missing!==undefined||!image)continue;
      selected.push({c,p,image,qid:p.pageprops?.wikibase_item||''});
      if(selected.length>=24)break;
    }
    diagnostics.profiles=selected.length;

    const entities=await wikidataEntities(selected.map(x=>x.qid));
    const refIds=[];
    for(const x of selected){
      const e=entities[x.qid]; if(!e)continue;
      for(const prop of ['P106','P27','P800','P166','P641','P54','P39','P102'])refIds.push(...claimIds(e,prop,8));
    }
    const labels=await labelMap(refIds);

    const items=[];
    for(const x of selected){
      const {c,p,image,qid:qidValue}=x;
      const enriched=enrichProfile(c,p,entities[qidValue],labels);
      const death=new Date(c.date);
      const age=c.age||ageAt(enriched.birth,death)||null;
      const description=p.description||c.bio||'personnalité publique';
      const who=`${c.person} était ${description.replace(/\.$/,'')}.`;
      const articles=(c.articles||[]).filter(a=>a.url);
      // If Wikipedia provided a reference but no Google News result, keep that reference as the source article.
      const primary=articles[0]||null;
      if(!primary)continue;
      const sources=[]; const seen=new Set();
      for(const a of articles){const k=`${a.source}|${a.url}`;if(seen.has(k))continue;seen.add(k);sources.push({source:a.source||'Article source',url:a.url,date:a.date||c.date,title:a.title||`Décès de ${c.person}`});if(sources.length>=6)break;}
      const cause=causeFromArticles(articles,c.bio||'');
      items.push({
        id:`obit-${qidValue||norm(c.person)}`,qid:qidValue,person:c.person,image,who,age,
        country:enriched.country||'',occupationShort:enriched.occupationShort||'',profileType:enriched.profileType,profileLabel:enriched.profileLabel,details:enriched.details,
        date:c.date,source:primary.source||'Article source',url:primary.url,title:`Décès de ${c.person}`,description:who,
        summaryShort:`${c.person} est décédé${age?` à ${age} ans`:''}.`,summaryLong:`${who} ${cause}`,category:'Nécrologie',cause,sources,articleCount:articles.length,
        politicalNote:enriched.profileType==='politics'?'Les fonctions et partis affichés viennent de données de référence. L’app ne déduit pas elle-même une étiquette politique.':''
      });
      if(items.length>=20)break;
    }

    return res.status(200).json({generatedAt:new Date().toISOString(),items,...diagnostics,verified:items.length,method:'news-plus-wikipedia-deaths-no-sparql'});
  }catch(e){
    // Do not turn a third-party timeout into a dead screen: return a usable empty payload with diagnostics.
    return res.status(200).json({generatedAt:new Date().toISOString(),items:[],...diagnostics,verified:0,warning:String(e?.message||e),method:'degraded'});
  }
}

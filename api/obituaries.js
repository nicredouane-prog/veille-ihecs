const SOURCES=[
  ['RTBF','site:rtbf.be'],['RTL info','site:rtl.be'],['La Libre','site:lalibre.be'],
  ['Le Soir','site:lesoir.be'],['BX1','site:bx1.be'],['La DH','site:dhnet.be'],
  ['Le Vif','site:levif.be'],["L'Avenir",'site:lavenir.net'],['Sudinfo','site:sudinfo.be']
];

const decode=(v='')=>v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&nbsp;/gi,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const strip=(v='')=>decode(v).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const tag=(xml,name)=>{const m=xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'));return m?decode(m[1]).trim():''};
const norm=(v='')=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const unique=a=>[...new Set((a||[]).filter(Boolean))];

async function get(url,timeout=9000){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
  try{
    const r=await fetch(url,{signal:c.signal,redirect:'follow',headers:{'user-agent':'Mozilla/5.0 IHECS-Test-Actus/5.8'}});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  }finally{clearTimeout(t)}
}
const googleUrl=(q,days=45)=>`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&hl=fr&gl=BE&ceid=BE:fr`;

function parse(xml,fallbackSource=''){
  return (xml.match(/<item\b[\s\S]*?<\/item>/gi)||[]).map((item,i)=>{
    const title=strip(tag(item,'title')).replace(/\s+[–—-]\s+(RTBF|RTL info|La Libre|Le Soir|BX1|La DH|DHnet|Le Vif|L'Avenir|Sudinfo).*$/i,'').trim();
    const description=strip(tag(item,'description'));
    const sourceTag=strip(tag(item,'source'))||fallbackSource||'Presse';
    const d=new Date(tag(item,'pubDate')||Date.now());
    return {id:`obit-${sourceTag}-${d.getTime()}-${i}`,title,description,source:sourceTag,url:strip(tag(item,'link')),date:d.toISOString()};
  }).filter(x=>x.title&&x.url);
}

function isDeathNews(a){
  const t=`${a.title} ${a.description}`.toLowerCase();
  return /(est mort|est morte|est décédé|est décédée|décès de|deces de|mort de|disparition de|s['’]est éteint|s['’]est éteinte|nous a quitté|nous a quittés|meurt à|décède à|mort à l['’]âge|décédé à l['’]âge|décédée à l['’]âge)/i.test(t);
}
const BAD_NAMES=new Set(['le monde','la belgique','les états unis','etats unis','union européenne','la france','l europe','europe','belgique','france','bruxelles','paris','rome','londres','washington','rtl info','rtbf','le soir','la libre','sudinfo','l avenir','la dh','bx1']);

function extractPeople(title=''){
  const t=title.replace(/[«»“”"]/g,' ').replace(/\s+/g,' ').trim();
  const found=[];
  const patterns=[
    /(?:la\s+)?mort\s+de\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,4})/g,
    /(?:le\s+)?décès\s+de\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,4})/g,
    /disparition\s+de\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,4})/g,
    /([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,4})\s+(?:est mort|est morte|est décédé|est décédée|meurt|décède|s['’]est éteint|s['’]est éteinte)/g,
    /(?:acteur|actrice|chanteur|chanteuse|réalisateur|réalisatrice|sportif|sportive|footballeur|footballeuse|cycliste|tennisman|tenniswoman|politique|ministre|président|présidente|journaliste|écrivain|écrivaine|artiste|mannequin)\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,4})/gi
  ];
  for(const re of patterns){
    for(const m of t.matchAll(re)){
      const n=(m[1]||'').replace(/\s+(?:à|après|dans|des|du|de|pour|qui|dont)$/i,'').trim();
      if(n.split(/\s+/).length>=2&&!BAD_NAMES.has(norm(n))) found.push(n);
    }
  }
  // Fallback: proper-name sequences close to a death article.
  if(found.length===0){
    const seq=t.match(/\b[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]{2,}(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]{2,}){1,3}\b/g)||[];
    for(const n of seq){
      if(!BAD_NAMES.has(norm(n))&&!/^(Décès|Mort|Hommage|Disparition|Toutes|Une|Un|Le|La|Les)\b/.test(n)) found.push(n);
    }
  }
  return unique(found).slice(0,5);
}
function qidFromClaim(c){return c?.mainsnak?.datavalue?.value?.id||''}
function timeFromClaim(c){
  const s=c?.mainsnak?.datavalue?.value?.time||''; const m=s.match(/([+-]\d{4,})-(\d{2})-(\d{2})/);
  if(!m)return null;
  const year=m[1].replace('+',''); if(Number(year)<1000)return null;
  return new Date(`${year}-${m[2]}-${m[3]}T12:00:00Z`);
}
function claimIds(e,prop,max=6){return unique((e?.claims?.[prop]||[]).map(qidFromClaim)).slice(0,max)}
async function labelsFor(ids){
  const clean=unique(ids).filter(x=>/^Q\d+$/.test(x)); if(!clean.length)return {};
  const out={};
  for(let i=0;i<clean.length;i+=45){
    const part=clean.slice(i,i+45);
    try{
      const r=await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${part.join('|')}&props=labels|descriptions|claims&languages=fr|en&format=json&origin=*`);
      const j=await r.json();
      for(const id of part){
        const e=j?.entities?.[id]; if(!e)continue;
        out[id]={label:e.labels?.fr?.value||e.labels?.en?.value||id,description:e.descriptions?.fr?.value||e.descriptions?.en?.value||'',entity:e};
      }
    }catch{}
  }
  return out;
}
async function wikiThumbnail(e){
  const site=e?.sitelinks?.frwiki?.title?'fr':e?.sitelinks?.enwiki?.title?'en':'';
  const title=site?e.sitelinks[`${site}wiki`].title:'';
  if(!site||!title)return '';
  try{
    const r=await get(`https://${site}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    const j=await r.json();
    return j?.originalimage?.source||j?.thumbnail?.source||'';
  }catch{return ''}
}
function ageAt(birth,death){
  if(!birth||!death)return null;
  let a=death.getUTCFullYear()-birth.getUTCFullYear();
  if(death.getUTCMonth()<birth.getUTCMonth()||(death.getUTCMonth()===birth.getUTCMonth()&&death.getUTCDate()<birth.getUTCDate()))a--;
  return a>=0&&a<=125?a:null;
}
function recentEnough(death,articleDate){
  if(!death)return false;
  const a=new Date(articleDate||Date.now());
  return Math.abs(a-death)<=180*86400000;
}
async function resolvePerson(name,articleDate){
  const sr=await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=fr&uselang=fr&type=item&limit=12&format=json&origin=*`);
  const sj=await sr.json();
  const hits=sj.search||[];
  const ranked=[];
  for(const hit of hits){
    try{
      const er=await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(hit.id)}&props=labels|descriptions|claims|sitelinks&languages=fr|en&format=json&origin=*`);
      const ej=await er.json(); const e=ej?.entities?.[hit.id]; if(!e)continue;
      if(!(e.claims?.P31||[]).some(c=>qidFromClaim(c)==='Q5'))continue;
      const death=timeFromClaim(e.claims?.P570?.[0]); if(!recentEnough(death,articleDate))continue;
      const label=e.labels?.fr?.value||e.labels?.en?.value||hit.label||name;
      const nName=norm(name),nLabel=norm(label);
      let score=nName===nLabel?10:(nLabel.includes(nName)||nName.includes(nLabel)?6:0);
      if(norm(hit.match?.text||'')===nName)score+=3;
      score+=Math.min(4,Object.keys(e.sitelinks||{}).length/20);
      if(score<4)continue;
      ranked.push({score,e,label,id:hit.id,death});
    }catch{}
  }
  ranked.sort((a,b)=>b.score-a.score);
  const best=ranked[0]; if(!best)return null;
  const e=best.e;
  let image='';
  const file=e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if(file)image=`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1000`;
  if(!image)image=await wikiThumbnail(e);
  if(!image)return null;

  const birth=timeFromClaim(e.claims?.P569?.[0]);
  const age=ageAt(birth,best.death);
  const genderQ=qidFromClaim(e.claims?.P21?.[0]);
  const gender=genderQ==='Q6581072'?'female':genderQ==='Q6581097'?'male':'';

  const occupationIds=claimIds(e,'P106',8);
  const countryIds=claimIds(e,'P27',4);
  const workIds=claimIds(e,'P800',6);
  const awardIds=claimIds(e,'P166',6);
  const sportIds=claimIds(e,'P641',3);
  const teamIds=claimIds(e,'P54',6);
  const positionIds=claimIds(e,'P39',6);
  const partyIds=claimIds(e,'P102',3);
  const allLabels=await labelsFor([...occupationIds,...countryIds,...workIds,...awardIds,...sportIds,...teamIds,...positionIds,...partyIds]);
  const L=ids=>ids.map(id=>allLabels[id]?.label).filter(Boolean);

  const occupations=L(occupationIds),countries=L(countryIds),works=L(workIds),awards=L(awardIds),sports=L(sportIds),teams=L(teamIds),positions=L(positionIds),parties=L(partyIds);
  const occNorm=norm(occupations.join(' '));
  let profileType='general',profileLabel='Personnalité';
  if(/acteur|actrice|comedien|comedienne|realisateur|realisatrice|cinema/.test(occNorm)){profileType='actor';profileLabel='Cinéma / télévision'}
  else if(sports.length||teams.length||/footballeur|cycliste|tennis|athlete|sportif|sportive|pilote|basket|rugby|hockey/.test(occNorm)){profileType='sport';profileLabel='Sport'}
  else if(parties.length||positions.length||/politique|ministre|president|depute|senateur|maire|bourgmestre|diplomate/.test(occNorm)){profileType='politics';profileLabel='Politique'}

  let partyIdeologies=[],partyAlignments=[];
  if(profileType==='politics'&&partyIds.length){
    const partyData=await labelsFor(partyIds);
    const ideologyIds=[],alignmentIds=[];
    for(const id of partyIds){
      const pe=partyData[id]?.entity;
      ideologyIds.push(...claimIds(pe,'P1142',5));
      alignmentIds.push(...claimIds(pe,'P1387',3));
    }
    const polLabels=await labelsFor([...ideologyIds,...alignmentIds]);
    partyIdeologies=unique(ideologyIds.map(id=>polLabels[id]?.label).filter(Boolean));
    partyAlignments=unique(alignmentIds.map(id=>polLabels[id]?.label).filter(Boolean));
  }

  const desc=e.descriptions?.fr?.value||e.descriptions?.en?.value||'';
  const who=desc?`${best.label} était ${desc.replace(/^personne\s+/i,'').replace(/\.$/,'')}.`:`${best.label} était une personnalité publique.`;
  const fmtList=(arr,max=3)=>arr.slice(0,max).join(' · ');
  const details=[];
  const occupationShort=occupations[0]||'';

  if(profileType==='actor'){
    if(occupations.length)details.push({label:'Métier',value:fmtList(occupations,3)});
    if(works.length)details.push({label:'Films / œuvres marquantes',value:fmtList(works,4)});
    if(awards.length)details.push({label:'Récompenses',value:fmtList(awards,4)});
    if(countries.length)details.push({label:'Pays',value:fmtList(countries,2)});
  }else if(profileType==='sport'){
    if(sports.length)details.push({label:'Sport',value:fmtList(sports,2)});
    if(teams.length)details.push({label:'Clubs / équipes',value:fmtList(teams,4)});
    if(countries.length)details.push({label:'Pays',value:fmtList(countries,2)});
    if(awards.length)details.push({label:'Distinctions',value:fmtList(awards,3)});
  }else if(profileType==='politics'){
    if(countries.length)details.push({label:'Pays',value:fmtList(countries,2)});
    if(positions.length)details.push({label:'Fonctions',value:fmtList(positions,4)});
    if(parties.length)details.push({label:'Parti',value:fmtList(parties,3)});
    const orientation=partyAlignments.length?fmtList(partyAlignments,3):partyIdeologies.length?fmtList(partyIdeologies,4):'Non renseigné de façon suffisamment fiable';
    details.push({label:'Positionnement / idéologie',value:orientation});
  }else{
    if(occupations.length)details.push({label:'Activité',value:fmtList(occupations,3)});
    if(countries.length)details.push({label:'Pays',value:fmtList(countries,2)});
    if(works.length)details.push({label:'Connu notamment pour',value:fmtList(works,4)});
    if(awards.length)details.push({label:'Récompenses',value:fmtList(awards,3)});
  }

  return {
    id:best.id,person:best.label,image,who,age,gender,birthDate:birth?.toISOString()||'',deathDate:best.death?.toISOString()||'',
    profileType,profileLabel,occupationShort,country:countries[0]||'',details,
    politicalNote:profileType==='politics'?'Le positionnement affiché reprend uniquement les données renseignées pour le parti ou la personnalité ; l’app ne déduit pas elle-même « droite » ou « gauche ».':''
  };
}

function deathInfo(articles=[]){
  const text=articles.map(a=>`${a.title}. ${a.description}`).join(' ');
  const patterns=[
    [/des suites (?:d['’]|de )([^.;]{3,100})/i,m=>`Les sources indiquent un décès des suites ${m[0].replace(/^des suites /i,'')}.`],
    [/emporté(?:e)? par ([^.;]{3,90})/i,m=>`Les sources indiquent qu’il/elle a été emporté(e) par ${m[1]}.`],
    [/(?:mort|décéd(?:é|ée)) dans (un accident[^.;]{0,100})/i,m=>`Les sources indiquent un décès dans ${m[1]}.`],
    [/(?:mort|décéd(?:é|ée)) après (un accident[^.;]{0,100})/i,m=>`Les sources indiquent un décès après ${m[1]}.`]
  ];
  for(const [re,fn] of patterns){const m=text.match(re);if(m)return fn(m)}
  if(/overdose/i.test(text)){
    if(/présumée|suspectée|apparente|possible|soupçonn/i.test(text))return 'Une overdose est évoquée par certaines sources, sans confirmation officielle définitive dans les informations récupérées.';
    return 'Des sources mentionnent une overdose ; vérifie l’article source pour le niveau de confirmation.';
  }
  if(/cancer/i.test(text))return 'Les sources mentionnent un cancer dans le contexte du décès.';
  if(/crise cardiaque|arrêt cardiaque/i.test(text))return 'Les sources mentionnent un arrêt ou une crise cardiaque dans les circonstances du décès.';
  return 'La cause du décès n’est pas précisée ou n’est pas encore officiellement établie dans les sources récupérées.';
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1800');
  try{
    const jobs=[];
    for(const [source,site] of SOURCES){
      jobs.push((async()=>parse(await (await get(googleUrl(`${site} ("décès" OR "mort" OR "décédé" OR "décédée")`,60))).text(),source))());
      jobs.push((async()=>parse(await (await get(googleUrl(`${site} ("est mort" OR "est décédé" OR "s'est éteint" OR "nous a quittés")`,60))).text(),source))());
    }
    jobs.push((async()=>parse(await (await get(googleUrl(`("est mort" OR "est décédé" OR "décès de") (acteur OR actrice OR chanteur OR chanteuse OR sportif OR sportive OR ministre OR président OR écrivain OR journaliste)`,45))).text(),'Presse'))());
    jobs.push((async()=>parse(await (await get(googleUrl(`("mort de" OR "décès de") (footballeur OR cycliste OR acteur OR actrice OR musicien OR politique)`,45))).text(),'Presse'))());

    const feeds=await Promise.allSettled(jobs);
    const raw=feeds.flatMap(x=>x.status==='fulfilled'?x.value:[])
      .filter(isDeathNews)
      .sort((a,b)=>new Date(b.date)-new Date(a.date));

    // Deduplicate articles first.
    const articleSeen=new Set(),articles=[];
    for(const a of raw){
      const k=norm(a.title);
      if(articleSeen.has(k))continue;
      articleSeen.add(k); articles.push(a);
    }

    // Resolve article -> verified deceased Wikidata entity. This is intentionally
    // stricter on identity than on title syntax, so we can show more people safely.
    const resolved=[];
    for(let i=0;i<Math.min(articles.length,70);i+=7){
      const batch=articles.slice(i,i+7);
      const rows=await Promise.all(batch.map(async a=>{
        const names=extractPeople(a.title);
        for(const name of names){
          try{
            const p=await resolvePerson(name,a.date);
            if(p)return {article:a,profile:p};
          }catch{}
        }
        return null;
      }));
      resolved.push(...rows.filter(Boolean));
      if(new Set(resolved.map(x=>x.profile.id)).size>=20)break;
    }

    // Merge every newspaper article about the same verified person.
    const byQid=new Map();
    for(const row of resolved){
      const q=row.profile.id;
      if(!byQid.has(q))byQid.set(q,{profile:row.profile,articles:[]});
      byQid.get(q).articles.push(row.article);
    }

    const items=[...byQid.values()].map(g=>{
      const arts=g.articles.sort((a,b)=>new Date(b.date)-new Date(a.date));
      const primary=arts[0];
      const sources=[]; const sourceSeen=new Set();
      for(const a of arts){
        const sk=`${a.source}|${a.url}`;
        if(sourceSeen.has(sk))continue;
        sourceSeen.add(sk); sources.push({source:a.source,url:a.url,date:a.date,title:a.title});
        if(sources.length>=6)break;
      }
      const p=g.profile;
      const cause=deathInfo(arts);
      return {
        id:`obit-${p.id}`,qid:p.id,person:p.person,image:p.image,who:p.who,age:p.age,gender:p.gender,
        profileType:p.profileType,profileLabel:p.profileLabel,occupationShort:p.occupationShort,country:p.country,details:p.details,politicalNote:p.politicalNote,
        date:primary.date,source:primary.source,url:primary.url,title:`Décès de ${p.person}`,description:p.who,
        summaryShort:`${p.person} est décédé${p.age?` à ${p.age} ans`:''}.`,
        summaryLong:`${p.who} ${cause}`,category:'Nécrologie',cause,sources,articleCount:arts.length
      };
    }).sort((a,b)=>new Date(b.date)-new Date(a.date));

    return res.status(200).json({generatedAt:new Date().toISOString(),items:items.slice(0,20),candidates:articles.length});
  }catch(e){
    return res.status(500).json({error:'Impossible de charger la nécrologie',detail:String(e?.message||e)});
  }
}

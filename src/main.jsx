import React, {useEffect, useMemo, useRef, useState} from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const APP_VERSION='v5.1';
const PUSH_ENDPOINT='https://tndwtppmemjgsoohubuz.supabase.co/functions/v1/ihecs-push';
const fmt = (value, short=false) => new Intl.DateTimeFormat('fr-BE', short ? {day:'2-digit',month:'short'} : {day:'2-digit',month:'long',year:'numeric'}).format(new Date(value));
const fmtNews = value => {
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return '';
  const date=new Intl.DateTimeFormat('fr-BE',{day:'2-digit',month:'short',timeZone:'Europe/Brussels'}).format(d);
  const time=new Intl.DateTimeFormat('fr-BE',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Brussels'}).format(d);
  return `${date} · ${time}`;
};
const isoToday = () => new Date().toISOString().slice(0,10);
const nextDay = d => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate()+1); return x.toISOString().slice(0,10); };
const daysBetween = (a,b) => Math.max(0,Math.ceil((new Date(b)-new Date(a))/86400000));
const safeJson = (k,fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };

const articleTime = item => {
  const t=Date.parse(item?.date||'');
  return Number.isFinite(t)?t:0;
};
const articleKey = item => String(item?.url||`${item?.source||''}|${item?.title||''}`).toLowerCase().trim();
function mergeArticleLists(...lists){
  const map=new Map();
  for(const item of lists.flat()){
    if(!item?.title) continue;
    const key=articleKey(item);
    if(!key) continue;
    const prev=map.get(key);
    if(!prev || articleTime(item)>=articleTime(prev)) map.set(key,item);
  }
  return [...map.values()].sort((a,b)=>articleTime(b)-articleTime(a));
}


const tidyHeadline=(value='')=>value
  .replace(/\s+[–—-]\s+(RTBF|RTL info|La Libre|Le Soir|BX1|La DH|DHnet|Le Vif|L'Avenir|Sudinfo).*$/i,'')
  .replace(/\s+/g,' ').trim();
const sentenceCase=(s='')=>s ? s.charAt(0).toUpperCase()+s.slice(1) : s;
const ensurePeriod=(s='')=>/[.!?…]$/.test(s.trim())?s.trim():`${s.trim()}.`;
function headlineSummary(title='',category=''){
  let t=tidyHeadline(title).replace(/[«»]/g,'').trim();
  if(!t) return '';
  // Les titres avec un contexte avant « : » deviennent une phrase naturelle.
  const colon=t.indexOf(':');
  if(colon>3 && colon<t.length-4){
    const left=t.slice(0,colon).trim();
    let right=t.slice(colon+1).trim();
    if(/^['\"“]/.test(right)) right=right.replace(/^['\"“]+|['\"”]+$/g,'').trim();
    if(right && right.length>18) return ensurePeriod(`Dans le contexte de ${left.toLowerCase()}, ${right.charAt(0).toLowerCase()+right.slice(1)}`);
  }
  // Les titres de type citation : on garde le fait après la citation lorsqu'il existe.
  t=t.replace(/^['\"“][^'\"”]{5,140}['\"”]\s*[:–—-]\s*/,'').trim()||t;
  return ensurePeriod(sentenceCase(t));
}
function contextSentence(category='',title=''){
  const t=(title||'').toLowerCase();
  if(/iran|ormuz|moyen-orient|guerre|isra[eë]l|gaza|ukraine|russie/.test(t)) return "L’enjeu dépasse l’événement immédiat : il touche aux rapports de force internationaux, à la sécurité et aux conséquences diplomatiques ou économiques.";
  if(/gouvernement|ministre|parlement|élection|coalition|président|diplomat/.test(t)||category==='Politique') return "L’essentiel est de retenir les acteurs concernés, la décision ou l’évolution politique annoncée et ses conséquences.";
  if(/gr[eè]ve|a[eé]roport|skeyes|transport|train|sncb/.test(t)) return "Il faut surtout retenir l’origine de la perturbation, les acteurs concernés et son impact concret sur le fonctionnement du service.";
  if(/prix|festival|film|cin[eé]ma|r[eé]compense|remporte|gagne/.test(t)||category==='Culture') return "Pour le test, retiens surtout l’œuvre ou la personne concernée, la distinction ou l’événement culturel et pourquoi il fait l’actualité.";
  if(category==='Économie') return "À retenir : l’acteur économique concerné, la décision ou l’évolution annoncée et son impact potentiel.";
  if(category==='Sport') return "À retenir : l’événement, les principaux acteurs et le résultat ou l’enjeu sportif qui explique pourquoi cette information compte.";
  if(category==='Sciences') return "À retenir : ce qui a été annoncé ou découvert, par qui, et ce que cela change ou pourrait changer.";
  return "Pour comprendre cette actualité, retiens le fait principal, les acteurs concernés et la raison pour laquelle l’événement est important.";
}
function displaySummaries(item){
  const short=item.summaryShort||headlineSummary(item.title,item.category)||item.description||'';
  const long=item.summaryLong||[short,contextSentence(item.category,item.title)].filter(Boolean).join(' ');
  return {short,long};
}


function isObituary(item){
  const t=`${item?.title||''} ${item?.description||''}`.toLowerCase();
  return item?.category==='Nécrologie'||/\b(décès|deces|mort de|est mort|est morte|est décédé|est décédée|s['’]est éteint|s['’]est éteinte|disparition de|nous a quittés|meurt à|décède à)\b/.test(t);
}
function obituaryInfo(item){
  const title=(item?.title||'').replace(/\s+/g,' ').trim();
  const desc=(item?.description||'').replace(/\s+/g,' ').trim();
  const text=`${title}. ${desc}`;
  const personPatterns=[
    /(?:décès|deces|mort|disparition) de ([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})/,
    /^([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})\s+(?:est mort|est morte|est décédé|est décédée|s['’]est éteint|s['’]est éteinte)/,
    /^([A-ZÀ-ÖØ-Ý][^,:;–—-]{3,60}),\s+.*(?:mort|décédé|décédée)/i
  ];
  let person=''; for(const re of personPatterns){const m=title.match(re);if(m){person=m[1].trim();break;}}
  const roles=[
    ['acteur','un acteur'],['actrice','une actrice'],['chanteur','un chanteur'],['chanteuse','une chanteuse'],['journaliste','un·e journaliste'],['écrivain','un écrivain'],['écrivaine','une écrivaine'],['réalisateur','un réalisateur'],['réalisatrice','une réalisatrice'],['musicien','un musicien'],['musicienne','une musicienne'],['footballeur','un footballeur'],['footballeuse','une footballeuse'],['sportif','un sportif'],['sportive','une sportive'],['ministre','une personnalité politique'],['président','une personnalité politique'],['présidente','une personnalité politique'],['scientifique','un·e scientifique'],['artiste','un·e artiste'],['animateur','un animateur'],['animatrice','une animatrice'],['chef','un·e chef']
  ];
  let role=''; const low=text.toLowerCase(); for(const [k,v] of roles){if(low.includes(k)){role=v;break;}}
  let cause='Cause du décès non précisée dans les informations publiques récupérées.';
  const causePatterns=[/des suites (?:d['’]|de )([^.;]{3,100})/i,/à la suite d(?:e|['’]) ([^.;]{3,100})/i,/mort(?:e)? dans (un accident[^.;]{0,80})/i,/décéd(?:é|ée) dans (un accident[^.;]{0,80})/i];
  for(const re of causePatterns){const m=text.match(re);if(m){cause=`La source indique : ${m[0].replace(/^[a-zà-ÿ]/,c=>c.toUpperCase())}.`;break;}}
  if(cause.startsWith('Cause du') && /\bcancer\b/i.test(text)) cause='La source évoque un cancer comme cause ou contexte du décès.';
  const ageMatch=text.match(/(?:à|a)\s+(\d{1,3})\s+ans/i);
  const age=ageMatch?Number(ageMatch[1]):null;
  const whoBase=person&&role?`${person} était ${role}.`:role?`Il s’agissait de ${role}.`:(desc?desc.split(/(?<=[.!?])\s+/)[0]:'La source revient sur son parcours et son importance publique.');
  const who=age&&age>0&&age<130?`${whoBase} La personne avait ${age} ans.`:whoBase;
  return {person:person||'Personnalité décédée',who,cause};
}

const topicStopWords=new Set('de du des le la les un une et ou en au aux à a l d pour par sur dans avec sans chez ce cet cette ces son sa ses leur leurs est sont a ont vers après avant plus moins très nouveau nouvelle nouveaux nouvelles actualité actu article video vidéo direct live'.split(/\s+/));
function topicTokens(item){
  const raw=`${item?.title||''} ${item?.summaryShort||''} ${item?.description||''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return new Set(raw.replace(/[^a-z0-9'-]+/g,' ').split(/\s+/).filter(x=>x.length>3&&!topicStopWords.has(x)));
}
function relatedScore(a,b){
  if(!a||!b||a.id===b.id) return 0;
  const A=topicTokens(a),B=topicTokens(b); let common=0;
  A.forEach(x=>{if(B.has(x)) common++});
  const entityBoost=[...A].some(x=>B.has(x)&&x.length>=7)?1.5:0;
  const catBoost=a.category===b.category?.toString()?0.5:0;
  return common+entityBoost+catBoost;
}


const brusselsDayKey=(date=new Date())=>{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=t=>parts.find(p=>p.type===t)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const shiftDayKey=(key,delta)=>{
  const [y,m,d]=key.split('-').map(Number); const x=new Date(Date.UTC(y,m-1,d+delta,12));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}-${String(x.getUTCDate()).padStart(2,'0')}`;
};
const noiseBrief=/programmes? t[eé]l[eé]|soir ?mag|horoscope|m[eé]t[eé]o|loterie|euromillions|people|buzz|insolite|programme tv/i;
function cleanBriefTitle(v=''){return v.replace(/\s+[–—-]\s+(RTBF|RTL info|La Libre|Le Soir|BX1|La DH|DHnet|Le Vif|L'Avenir|Sudinfo).*$/i,'').replace(/\s+/g,' ').trim();}
function buildDailyBrief(items=[]){
  const target=shiftDayKey(brusselsDayKey(),-1);
  const yesterday=items.filter(n=>brusselsDayKey(new Date(n.date||0))===target&&!noiseBrief.test(n.title||''));
  const clusters=[];
  for(const item of yesterday){
    let best=null,bestScore=0;
    for(const c of clusters){const score=Math.max(...c.items.map(x=>relatedScore(item,x)));if(score>bestScore){bestScore=score;best=c;}}
    if(best&&bestScore>=2.5) best.items.push(item); else clusters.push({items:[item]});
  }
  const categoryWeight={International:5,Politique:5,'Économie':4,Sciences:4,'Belgique / Société':3,Culture:2,Sport:2};
  const ranked=clusters.map(c=>{const sources=[...new Set(c.items.map(x=>x.source).filter(Boolean))];const categories=[...new Set(c.items.map(x=>x.category).filter(Boolean))];const latest=[...c.items].sort((a,b)=>new Date(b.date)-new Date(a.date))[0];const score=c.items.length*2+sources.length*3+Math.max(...categories.map(x=>categoryWeight[x]||1));return {...c,sources,categories,latest,score};}).sort((a,b)=>b.score-a.score||new Date(b.latest?.date)-new Date(a.latest?.date));
  return {day:target,total:yesterday.length,topics:ranked.length,points:ranked.slice(0,5).map((c,i)=>{const sum=displaySummaries(c.latest);const extra=c.items.length>1?` Sujet suivi dans ${c.items.length} articles (${c.sources.slice(0,4).join(', ')}${c.sources.length>4?'…':''}).`:'';return {id:`brief-${i}`,title:cleanBriefTitle(c.latest?.title||''),summary:`${sum.short||c.latest?.description||''}${extra}`.trim(),item:c.latest,count:c.items.length,sources:c.sources};})};
}
function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4);const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));}

const nav = [
  ['Accueil','⌂'],['Actus','◉'],['Révisions','✓'],['Tutoriel','?']
];

const tutorialSteps=[
  {title:'Bienvenue dans IHECS Test Actus',text:'L’app rassemble l’actualité utile à tes tests, organise la matière depuis le dernier test de chaque prof et te permet de réviser avec des questions adaptées.',tab:'Accueil'},
  {title:'Actus',text:'Dans Actus, tu retrouves le fil complet, l’ajout d’un article et une rubrique Nécrologie dédiée aux décès de personnalités.',tab:'Actus'},
  {title:'Filtrer l’actualité',text:'Dans Actus, affiche tout, uniquement ce qui est paru depuis le test de Mr Gras, depuis celui de Mr Leconte, ou depuis une date précise.',tab:'Actus'},
  {title:'Nécrologie',text:'La rubrique Nécrologie privilégie les articles avec photo et résume qui est décédé, qui était la personne et la cause du décès uniquement lorsqu’elle est explicitement mentionnée par la source.',tab:'Actus'},
  {title:'Révisions',text:'Dans Révisions, tu retrouves les modes d’entraînement, les tests fictifs de Mr Gras et Mr Leconte, ainsi que Mes tests et les dates à connaître.',tab:'Révisions'},
  {title:'Ajouter une information',text:'Le bouton Ajouter se trouve maintenant dans Actus. Colle un lien et l’app prépare une fiche qui peut intégrer tes révisions.',tab:'Actus'},
  {title:'Sur téléphone',text:'Installe l’app depuis ton navigateur pour l’utiliser comme une vraie application. Tu peux aussi programmer ton rappel quotidien depuis l’accueil.',tab:'Accueil'},
  {title:'Tu es prêt',text:'Le tutoriel ne s’affichera plus automatiquement. Tu pourras le relancer à tout moment depuis l’onglet Tutoriel.',tab:'Tutoriel'}
];

function App(){
  const [tab,setTab]=useState('Accueil');
  const [actusView,setActusView]=useState('fil');
  const [revisionView,setRevisionView]=useState('menu');
  const [tests,setTests]=useState(()=>safeJson('veille-tests',{qcm:'2026-09-21',photo:'2026-09-05'}));
  const [history,setHistory]=useState(()=>safeJson('veille-history',[]));
  const [news,setNews]=useState(()=>safeJson('ihecs-news-cache',[]));
  const [manualNews,setManualNews]=useState(()=>safeJson('veille-manual-news',[]));
  const [sharedNews,setSharedNews]=useState([]);
  const [addUrl,setAddUrl]=useState('');
  const [addText,setAddText]=useState('');
  const [draft,setDraft]=useState(null);
  const [analyzing,setAnalyzing]=useState(false);
  const [addMessage,setAddMessage]=useState('');
  const [shareGlobal,setShareGlobal]=useState(false);
  const [mediaAccess,setMediaAccess]=useState(()=>safeJson('veille-media-access',{}));
  const [sourceStatus,setSourceStatus]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [lastUpdatedAt,setLastUpdatedAt]=useState(null);
  const [refreshing,setRefreshing]=useState(false);
  const lastFetchRef=useRef(0);
  const [query,setQuery]=useState('');
  const [visibleLimit,setVisibleLimit]=useState(60);
  const [category,setCategory]=useState('Toutes');
  const [dateFilter,setDateFilter]=useState(()=>localStorage.getItem('veille-date-filter')||'all');
  const [customSince,setCustomSince]=useState(()=>localStorage.getItem('veille-custom-since')||'');
  const [selected,setSelected]=useState(null);
  const swipeStartRef=useRef(null);
  const [quiz,setQuiz]=useState(null);
  const [quizAnswer,setQuizAnswer]=useState('');
  const [quizResult,setQuizResult]=useState(null);
  const [deck,setDeck]=useState([]);
  const [deckIndex,setDeckIndex]=useState(0);
  const [flashRevealed,setFlashRevealed]=useState(false);
  const [deckStats,setDeckStats]=useState({ok:0,review:0});
  const [recentTestIds,setRecentTestIds]=useState(()=>JSON.parse(localStorage.getItem('ihecs-recent-test-ids')||'[]'));
  const [recentTopicKeys,setRecentTopicKeys]=useState(()=>JSON.parse(localStorage.getItem('ihecs-recent-topic-keys')||'[]'));
  const [photoAnswer,setPhotoAnswer]=useState('');
  const [photoDeckLoading,setPhotoDeckLoading]=useState(false);
  const [photoDeckMessage,setPhotoDeckMessage]=useState('');
  const [saved,setSaved]=useState(()=>safeJson('veille-saved',[]));
  const [reminderTime,setReminderTime]=useState(()=>localStorage.getItem('veille-reminder-time')||'19:00');
  const [reminderEnabled,setReminderEnabled]=useState(()=>localStorage.getItem('veille-reminder-enabled')==='1');
  const [notifStatus,setNotifStatus]=useState(typeof Notification==='undefined'?'unsupported':Notification.permission);
  const [installPrompt,setInstallPrompt]=useState(null);
  const [installed,setInstalled]=useState(()=>window.matchMedia?.('(display-mode: standalone)').matches||false);
  const [editingTestDate,setEditingTestDate]=useState(null);
  const [testDateDraft,setTestDateDraft]=useState('');
  const [tutorialOpen,setTutorialOpen]=useState(()=>localStorage.getItem('ihecs-tutorial-seen-v1')!=='1');
  const [tutorialStep,setTutorialStep]=useState(0);
  const [dailyPromptOpen,setDailyPromptOpen]=useState(false);
  const [dailyBriefOpen,setDailyBriefOpen]=useState(false);
  const [pushServerStatus,setPushServerStatus]=useState('idle');
  const today=isoToday();

  useEffect(()=>localStorage.setItem('veille-tests',JSON.stringify(tests)),[tests]);
  useEffect(()=>localStorage.setItem('veille-history',JSON.stringify(history)),[history]);
  useEffect(()=>localStorage.setItem('veille-saved',JSON.stringify(saved)),[saved]);
  useEffect(()=>localStorage.setItem('veille-manual-news',JSON.stringify(manualNews)),[manualNews]);
  useEffect(()=>localStorage.setItem('veille-media-access',JSON.stringify(mediaAccess)),[mediaAccess]);
  useEffect(()=>{ try{ localStorage.setItem('ihecs-news-cache',JSON.stringify(news.slice(0,1500))); }catch{} },[news]);
  useEffect(()=>localStorage.setItem('veille-reminder-time',reminderTime),[reminderTime]);
  useEffect(()=>localStorage.setItem('veille-reminder-enabled',reminderEnabled?'1':'0'),[reminderEnabled]);
  useEffect(()=>localStorage.setItem('veille-date-filter',dateFilter),[dateFilter]);
  useEffect(()=>localStorage.setItem('veille-custom-since',customSince),[customSince]);

  useEffect(()=>{
    if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
    const handler=e=>{e.preventDefault();setInstallPrompt(e)};
    window.addEventListener('beforeinstallprompt',handler);
    window.addEventListener('appinstalled',()=>{setInstalled(true);setInstallPrompt(null)});
    return()=>window.removeEventListener('beforeinstallprompt',handler);
  },[]);

  useEffect(()=>{
    if(notifStatus==='granted') syncPushSubscription({enabled:reminderEnabled,time:reminderTime});
  },[reminderEnabled,reminderTime,notifStatus]);

  const loadNews=async(sinceOverride=null,{silent=false}={})=>{
    if(silent) setRefreshing(true); else setLoading(true);
    setError('');
    const since = sinceOverride===null ? filterSince : sinceOverride;
    try{
      const qs=new URLSearchParams();
      if(since) qs.set('since',since); else qs.set('days','180');
      qs.set('_refresh',String(Math.floor(Date.now()/60000)));
      const r=await fetch(`/api/news?${qs.toString()}`,{cache:'no-store'});
      if(!r.ok) throw new Error(`Erreur ${r.status}`);
      const data=await r.json();
      // On fusionne au lieu de remplacer : un article fraîchement vu ne disparaît plus
      // si Google News/RSS le retire momentanément de son flux au rafraîchissement suivant.
      setNews(prev=>mergeArticleLists(prev,data.items||[]).slice(0,4500)); setSourceStatus(data.sources||[]);
      setLastUpdatedAt(data.generatedAt||new Date().toISOString());
      lastFetchRef.current=Date.now();
      try{
        const sr=await fetch('/api/community-news',{cache:'no-store'});
        if(sr.ok){
          const rows=await sr.json();
          setSharedNews((Array.isArray(rows)?rows:[]).map(x=>({id:`shared-${x.id||x.created_at}`,title:x.title,description:x.description||'',summaryShort:x.summary_short||'',summaryLong:x.summary_long||'',context:x.context||'',category:x.category||'Belgique / Société',source:x.source||'Ajout partagé',url:x.url,image:x.image||'',date:x.created_at||new Date().toISOString(),quizPrompt:x.quiz_prompt||'',quizAnswer:x.quiz_answer||'',shared:true})));
        }
      }catch{}
    }catch(e){ setError("Impossible de charger les flux d'actualité pour le moment."); }
    finally{ setLoading(false); setRefreshing(false); }
  };


  const profs=useMemo(()=>[
    {key:'qcm',name:'Mr Gras',label:'QCM & personnalités',type:'QCM à une seule réponse + reconnaissance de personnes'},
    {key:'photo',name:'Mr Leconte',label:'Photo & explication',type:"Expliquer l'actualité en quelques lignes"}
  ],[]);

  const markTest=(key,date=today)=>{
    const previous=tests[key];
    setHistory(h=>[{id:crypto.randomUUID?.()||`${Date.now()}`,prof:key,date,from:nextDay(previous),to:date,previous},...h]);
    setTests(t=>({...t,[key]:date}));
  };
  const openTestDateEditor=(key)=>{ setEditingTestDate(key); setTestDateDraft(tests[key]||today); };
  const saveTestDate=(key)=>{
    if(!testDateDraft || testDateDraft>today) return;
    const oldDate=tests[key];
    setTests(t=>({...t,[key]:testDateDraft}));
    setHistory(h=>{
      const i=h.findIndex(x=>x.prof===key && x.date===oldDate);
      if(i<0) return h;
      const copy=[...h];
      copy[i]={...copy[i],date:testDateDraft,to:testDateDraft};
      return copy;
    });
    setEditingTestDate(null);
  };

  const combinedNews=useMemo(()=>{
    // Une seule source de vérité pour l'ordre : date/heure de publication décroissante.
    // Les ajouts manuels/partagés ne peuvent plus casser l'ordre chronologique du flux.
    return mergeArticleLists(manualNews,sharedNews,news);
  },[manualNews,sharedNews,news]);

  const dailyBrief=useMemo(()=>buildDailyBrief(combinedNews),[combinedNews]);
  useEffect(()=>{
    if(loading||tutorialOpen||combinedNews.length===0) return;
    const day=brusselsDayKey(); const key=`ihecs-daily-brief-prompt-${day}`;
    if(localStorage.getItem(key)==='1') return;
    localStorage.setItem(key,'1');
    setDailyPromptOpen(true);
  },[loading,tutorialOpen,combinedNews.length]);

  const activeSince=useMemo(()=>{
    const dates=Object.values(tests).filter(Boolean).sort();
    return dates[0] ? nextDay(dates[0]) : today;
  },[tests,today]);
  const relevantNews=useMemo(()=>combinedNews.filter(n=>n.date.slice(0,10)>=activeSince),[combinedNews,activeSince]);
  const categories=['Toutes',...Array.from(new Set(combinedNews.map(n=>n.category))).sort()];
  const filterSince=useMemo(()=>{
    if(dateFilter==='gras') return tests.qcm?nextDay(tests.qcm):'';
    if(dateFilter==='leconte') return tests.photo?nextDay(tests.photo):'';
    if(dateFilter==='custom') return customSince||'';
    return '';
  },[dateFilter,customSince,tests]);

  // Recharge la fenêtre correspondant au filtre de date : le nombre d'articles
  // vient réellement de la période choisie, au lieu d'être calculé sur un lot fixe de titres récents.
  useEffect(()=>{ loadNews(filterSince); },[filterSince]);

  // Veille active tant que l'application est ouverte : actualisation périodique + retour au premier plan.
  useEffect(()=>{
    const timer=setInterval(()=>loadNews(filterSince,{silent:true}),180000);
    const onVisible=()=>{
      if(document.visibilityState==='visible' && Date.now()-lastFetchRef.current>60000){
        loadNews(filterSince,{silent:true});
      }
    };
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('focus',onVisible);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onVisible)};
  },[filterSince]);
  const filtered=useMemo(()=>combinedNews.filter(n=>{
    const q=query.toLowerCase().trim();
    const dateOk=!filterSince || (n.date||'').slice(0,10)>=filterSince;
    return dateOk && (category==='Toutes'||n.category===category) && (!q||`${n.title} ${n.description} ${n.source}`.toLowerCase().includes(q));
  }).sort((a,b)=>articleTime(b)-articleTime(a)),[combinedNews,query,category,filterSince]);
  useEffect(()=>setVisibleLimit(60),[query,category,dateFilter,customSince]);
  const obituaryNews=useMemo(()=>combinedNews.filter(isObituary).sort((a,b)=>articleTime(b)-articleTime(a)),[combinedNews]);

  const relatedToSelected=useMemo(()=>{
    if(!selected) return [];
    return combinedNews
      .filter(n=>n.id!==selected.id && new Date(n.date||0)>=new Date(selected.date||0))
      .map(n=>({n,score:relatedScore(selected,n)}))
      .filter(x=>x.score>=2)
      .sort((a,b)=>b.score-a.score || new Date(b.n.date)-new Date(a.n.date))
      .slice(0,6).map(x=>x.n);
  },[selected,combinedNews]);

  const articleDeck=useMemo(()=>{
    const base=tab==='Actus'&&actusView==='fil'&&filtered.length?filtered:combinedNews;
    if(!selected) return base;
    if(base.some(n=>String(n.id)===String(selected.id))) return base;
    return [selected,...base];
  },[tab,actusView,filtered,combinedNews,selected]);
  const articleIndex=selected?articleDeck.findIndex(n=>String(n.id)===String(selected.id)):-1;

  const navTo=(next,{replace=false}={})=>{
    if(next===tab && !selected) return;
    const state={ihecs:true,tab:next};
    const hash=`#${next.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-')}`;
    if(replace) window.history.replaceState(state,'',hash); else window.history.pushState(state,'',hash);
    setSelected(null); setTutorialOpen(false); setTab(next);
  };
  const openArticle=(item,{replace=false}={})=>{
    if(!item) return;
    const state={ihecs:true,tab,articleId:String(item.id)};
    const hash=`#actu-${encodeURIComponent(String(item.id)).slice(0,80)}`;
    if(replace) window.history.replaceState(state,'',hash); else window.history.pushState(state,'',hash);
    setSelected(item);
  };
  const closeArticle=()=>{
    if(window.history.state?.ihecs&&window.history.state?.articleId) window.history.back();
    else setSelected(null);
  };
  const navigateArticle=dir=>{
    if(articleDeck.length<2||articleIndex<0) return;
    const next=(articleIndex+dir+articleDeck.length)%articleDeck.length;
    openArticle(articleDeck[next],{replace:true});
  };
  const onArticleTouchStart=e=>{
    const t=e.changedTouches?.[0]; if(t) swipeStartRef.current={x:t.clientX,y:t.clientY};
  };
  const onArticleTouchEnd=e=>{
    const start=swipeStartRef.current; const t=e.changedTouches?.[0]; swipeStartRef.current=null;
    if(!start||!t) return;
    const dx=t.clientX-start.x, dy=t.clientY-start.y;
    if(Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.25) return;
    navigateArticle(dx<0?1:-1);
  };

  useEffect(()=>{
    const state=window.history.state;
    if(!state?.ihecs) window.history.replaceState({ihecs:true,tab:'Accueil'},'',window.location.pathname+window.location.search+'#accueil');
  },[]);
  useEffect(()=>{
    const onPop=e=>{
      const state=e.state;
      if(!state?.ihecs) return;
      setTutorialOpen(false);
      setTab(state.tab||'Accueil');
      if(state.articleId){
        const found=combinedNews.find(n=>String(n.id)===String(state.articleId));
        setSelected(found||null);
      }else setSelected(null);
    };
    window.addEventListener('popstate',onPop);
    return()=>window.removeEventListener('popstate',onPop);
  },[combinedNews]);

  const toggleSaved=id=>setSaved(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);

  const cleanTitle=(value='')=>value
    .replace(/\s+[–—-]\s+(RTBF|RTL info|La Libre|Le Soir|BX1|La DH|DHnet|Le Vif|L'Avenir|Sudinfo).*$/i,'')
    .replace(/\s+/g,' ').trim();

  const maskAnswer=(text='',answer='')=>{
    let out=cleanTitle(text||'');
    const bits=String(answer||'').split(/\s+et\s+|\s*\/\s*/i).map(x=>x.trim()).filter(x=>x.length>1);
    const escape=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    for(const bit of bits){
      try{ out=out.replace(new RegExp(escape(bit),'gi'),'[à trouver]'); }catch{}
    }
    return out;
  };
  useEffect(()=>localStorage.setItem('ihecs-recent-test-ids',JSON.stringify(recentTestIds.slice(-60))),[recentTestIds]);
  useEffect(()=>localStorage.setItem('ihecs-recent-topic-keys',JSON.stringify(recentTopicKeys.slice(-40))),[recentTopicKeys]);

  const questionLead=(item,answer='')=>{
    const title=cleanTitle(item?.title||'');
    if(!title) return '';
    const masked=maskAnswer(title,answer);
    // N'affiche un contexte masqué que s'il reste naturel. Sinon le titre brut est préférable.
    if(masked && masked!==title && !/\[à trouver\].*\[à trouver\]/i.test(masked) && masked.length>=18) return masked;
    return title;
  };

  const badQuizTitle=(title='')=>{
    const t=cleanTitle(title).toLowerCase();
    if(!t || t.length<18) return true;
    return /^(la |le |les )?(photo|vidéo|video) (extraordinaire|incroyable)|\bvoici\b|\bregardez\b|\ben images?\b|\bminute par minute\b|\bdirect\b|\blive\b/.test(t);
  };
  const cleanAnswerText=(value='')=>String(value||'')
    .replace(/\s+(?:RTBF|RTL info|La Libre|Le Soir|BX1|La DH|DHnet|Le Vif|L'Avenir|Sudinfo)\s*$/i,'')
    .replace(/\s*\(VID[ÉE]O\)\s*$/i,'')
    .replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'');
  const validShortAnswer=(value='')=>{
    const a=cleanAnswerText(value);
    return a.length>=2 && a.length<=85 && !/^\[|à trouver|information à revoir/i.test(a);
  };

  const genericActorStart=/^(de |du |des |un |une |le |la |les |l['’]|tout |toute |plus |moins |nouveau|nouvelle|nouvelles|transport|économie|accord|décision|mesure|enquête|enquêtes|rouages|photo|vidéo)/i;
  const looksLikePerson=(value='')=>{
    const a=cleanAnswerText(value);
    if(!a || genericActorStart.test(a) || /[,:;!?]/.test(a)) return false;
    const words=a.split(/\s+/).filter(Boolean);
    if(words.length<2 || words.length>4) return false;
    return words.every(w=>/^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+$/.test(w) || /^(de|du|van|von|der|den|d['’])$/i.test(w));
  };
  const knownOrg=/\b(Skeyes|Eurocontrol|Ryanair|Brussels Airport(?: Company)?|STIB|SNCB|TEC|De Lijn|Commission européenne|Parlement européen|Parlement bruxellois|gouvernement(?: belge| fédéral| wallon| flamand| bruxellois)?|police fédérale|ONU|OTAN|UEFA|FIFA|OpenAI|Anthropic|Mistral AI|Proximus|Orange Belgium|Digi Belgium|Telenet|Arianespace|Ariane Espace|ESA|NASA)\b/i;
  const looksLikeOrganisation=(value='')=>{
    const a=cleanAnswerText(value);
    if(!a || genericActorStart.test(a) || /["“”]/.test(a) || a.length>70) return false;
    if(knownOrg.test(a)) return true;
    if(/\b(commission|parlement|gouvernement|parti|police|armée|université|banque|club|fédération|entreprise|groupe|compagnie|association|syndicat|aéroport|airport|airlines|airways|laboratoire|agence|ministère)\b/i.test(a) && /^[A-ZÀ-ÖØ-Ý]/.test(a)) return true;
    // Acronymes ou marques clairement capitalisées.
    if(/^[A-Z0-9][A-Za-z0-9À-ÿ&'’.-]*(?:\s+[A-Z0-9][A-Za-z0-9À-ÿ&'’.-]*){0,4}$/.test(a) && !/^(Transport|Économie|Accord|Décision|Mesure|Nouvelles?|Enquêtes?)\b/i.test(a)) return true;
    return false;
  };
  const actorKind=(value='',item={})=> looksLikePerson(value)?'person':looksLikeOrganisation(value)?'organisation':'unknown';
  const clipDecision=(value='',max=125)=>{
    let x=cleanAnswerText(value)
      .replace(/^['"“”]+|['"“”]+$/g,'')
      .replace(/\s+(?:selon|d'après)\s+.+$/i,'')
      .replace(/\s*\([^)]*VID[ÉE]O[^)]*\)\s*$/i,'')
      .replace(/\s+[–—-]\s+(?:Trends-Tendances|RTBF|RTL info|La Libre|Le Soir|BX1|La DH|DHnet|Le Vif|L'Avenir|Sudinfo).*$/i,'')
      .trim();
    if(x.length>max){
      const cut=x.slice(0,max);
      x=cut.slice(0,Math.max(cut.lastIndexOf(' '),80)).trim()+'…';
    }
    return x;
  };
  const makeFact=(item)=>{
    // v4.8 : moteur volontairement conservateur. Une question n'est créée que si
    // le titre contient un fait clair, mémorisable et une réponse proprement identifiable.
    if(!item?.title || badQuizTitle(item.title) || lowValueForTest(item)) return null;
    const t=cleanTitle(item.title||'');
    let m;

    // Questions ajoutées manuellement : uniquement lorsqu'elles ont été relues par l'utilisateur.
    if(item.manual && item.quizPrompt && item.quizAnswer && validShortAnswer(item.quizAnswer)){
      const a=cleanAnswerText(item.quizAnswer);
      return {question:item.quizPrompt,answer:a,type:'text',answerKind:looksLikePerson(a)?'person':looksLikeOrganisation(a)?'organisation':'event',quality:12};
    }

    // Belgique + autre pays : question centrée sur le pays partenaire, plus naturelle pour un test d'actu.
    if((m=t.match(/^La Belgique et ([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’ -]{2,35}) (rétablissent|rompent|signent|annoncent|concluent|ouvrent|ferment) (.+)$/i))){
      const country=cleanAnswerText(m[1]);
      const action=m[2].toLowerCase();
      const object=clipDecision(m[3],100);
      if(validShortAnswer(country)) return {question:`Avec quel pays la Belgique ${action} ${object} ?`,answer:country,type:'entity',answerKind:'country',quality:12};
    }

    // Institution / organisation explicitement nommée en début de titre.
    if((m=t.match(/^(La |Le |Les |L['’])?((?:Commission européenne|Parlement européen|Parlement bruxellois|gouvernement fédéral|gouvernement wallon|gouvernement flamand|gouvernement bruxellois|police fédérale|Skeyes|Eurocontrol|Ryanair|Brussels Airport Company|STIB|SNCB|TEC|De Lijn|ONU|OTAN|UEFA|FIFA|OpenAI|Anthropic|Mistral AI|Proximus|Orange Belgium|Digi Belgium|Telenet|Arianespace|ESA|NASA))\s+(annonce|propose|confirme|dément|réclame|demande|décide|adopte|approuve|rejette|suspend|supprime|autorise|interdit|lance|présente|dévoile|publie|rouvre|ferme|signe)\s+(.+)$/i))){
      const org=cleanAnswerText(m[2]);
      const verb=m[3].toLowerCase();
      const object=clipDecision(m[4],115);
      if(object.length>=10) return {question:`Quelle organisation ${verb} ${object} ?`,answer:org,type:'entity',answerKind:'organisation',quality:12};
    }

    // Personnalité clairement nommée + action claire.
    if((m=t.match(/^(?:['"“][^'"”]{3,120}['"”]\s*:\s*)?([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+(?:de|du|van|von|der|den|d['’]))?\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){0,1})\s+(annonce|confirme|dément|propose|réclame|demande|présente|dévoile|publie|signe|quitte|rejoint)\s+(.+)$/i))){
      const person=cleanAnswerText(m[1]);
      const verb=m[2].toLowerCase();
      const object=clipDecision(m[3],115);
      if(looksLikePerson(person)&&object.length>=12) return {question:`Qui ${verb} ${object} ?`,answer:person,type:'entity',answerKind:'person',quality:12};
    }

    // Récompense / victoire : on demande QUI a obtenu la récompense, pas le détail de la formulation.
    if((m=t.match(/^(.+?)\s+(remporte|gagne|reçoit|décroche|obtient)\s+(.+)$/i))){
      const subject=cleanAnswerText(m[1]);
      const prize=clipDecision(m[3],105);
      const kind=looksLikePerson(subject)?'person':looksLikeOrganisation(subject)?'organisation':'unknown';
      if(kind!=='unknown'&&prize.length>=6) return {question:`Qui ${m[2].toLowerCase()} ${prize} ?`,answer:subject,type:'entity',answerKind:kind,quality:12};
    }

    // Nomination : on demande la personne quand le rôle est clairement identifié.
    if((m=t.match(/^([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})\s+(?:est nommé|est nommée|devient|est élu|est élue|est désigné|est désignée)\s+(.+)$/i))){
      const person=cleanAnswerText(m[1]);
      const role=clipDecision(m[2],100);
      if(looksLikePerson(person)&&role.length>=7) return {question:`Qui devient ${role} ?`,answer:person,type:'entity',answerKind:'person',quality:12};
    }

    // Grève chez une organisation : question factuelle sur l'organisme concerné.
    if((m=t.match(/(?:gr[eè]ve|mouvement social|arr[eê]t de travail).*?\bchez\s+([^:;,–—-]{2,55})/i))){
      const actor=cleanAnswerText(m[1]);
      if(looksLikeOrganisation(actor)) return {question:`Quelle organisation est directement concernée par ce mouvement de grève ?`,answer:actor,type:'entity',answerKind:'organisation',quality:11};
    }

    // Citation / prise de parole : uniquement si une personne clairement nommée est le sujet.
    if((m=t.match(/^([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})\s+sur\s+([^:]{8,100})\s*:/i))){
      const person=cleanAnswerText(m[1]);
      const subject=clipDecision(m[2],90);
      if(looksLikePerson(person)) return {question:`Quelle personnalité s’est exprimée sur ${subject.toLowerCase()} ?`,answer:person,type:'entity',answerKind:'person',quality:11};
    }

    return null;
  };
  const withLead=(item,fact)=> fact ? ({...fact,lead:questionLead(item,fact.answer)}) : null;

  const shuffle=(arr)=>{
    const out=[...arr];
    for(let i=out.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [out[i],out[j]]=[out[j],out[i]];
    }
    return out;
  };
  const shortOption=(v='')=>{
    const x=String(v).replace(/[«»“”]/g,'').replace(/\s+/g,' ').trim();
    if(!x || x.length>55) return '';
    if(/[.!?;:]/.test(x.slice(0,-1))) return '';
    return x;
  };
  const curatedDistractors=(fact)=>{
    const q=(fact.question||'').toLowerCase();
    const a=(fact.answer||'').toLowerCase();
    if(fact.answerKind==='place' && q.includes('aéroport')) return ['Brussels Airport','Liège Airport','Aéroport d’Ostende','Aéroport de Charleroi'].filter(x=>x.toLowerCase()!==a);
    if(fact.answerKind==='country') return ['Rwanda','France','Allemagne','Pays-Bas','Ukraine','Russie','Iran','Israël','États-Unis','Royaume-Uni'].filter(x=>x.toLowerCase()!==a);
    if(fact.answerKind==='organisation'){
      const txt=((fact.item?.title||'')+' '+a).toLowerCase();
      if(/skeyes|aéroport|aviation|vol/.test(txt)) return ['Skeyes','Brussels Airport Company','Eurocontrol','Ryanair'].filter(x=>x.toLowerCase()!==a);
      if(/orange|digi|proximus|telenet|télécom|telecom/.test(txt)) return ['Orange Belgium','Proximus','Telenet','Digi Belgium'].filter(x=>x.toLowerCase()!==a);
      if(/espace|ariane|aerospace|esa|nasa/.test(txt)) return ['Arianespace','ESA','NASA','AerospaceLab'].filter(x=>x.toLowerCase()!==a);
    }
    return [];
  };
  const plausibleForKind=(value,kind)=>{
    const v=shortOption(value); if(!v) return '';
    if(kind==='person' && !looksLikePerson(v)) return '';
    if(kind==='organisation' && !looksLikeOrganisation(v)) return '';
    if((kind==='place'||kind==='country') && !/^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’ -]{2,40}$/.test(v)) return '';
    return v;
  };
  const buildOptions=(fact,facts)=>{
    if(!['entity','entity-pair'].includes(fact.type)) return [];
    const answer=plausibleForKind(fact.answer,fact.answerKind);
    if(!answer || fact.answerKind==='pair') return [];
    const curated=curatedDistractors(fact).map(x=>plausibleForKind(x,fact.answerKind)).filter(Boolean);
    const sameKind=facts
      .filter(x=>x!==fact && x.answerKind===fact.answerKind)
      .map(x=>plausibleForKind(x.answer,fact.answerKind))
      .filter(x=>x && x.toLowerCase()!==answer.toLowerCase());
    const unique=[...new Set([...curated,...sameKind])].filter(x=>x.toLowerCase()!==answer.toLowerCase());
    if(unique.length<3) return [];
    return shuffle([answer,...shuffle(unique).slice(0,3)]);
  };


  const lowValueForTest=(item)=>{
    const t=`${item?.title||''} ${item?.description||''}`.toLowerCase();
    // Faits divers / contenus très locaux ou anecdotiques : on les laisse dans Actualités,
    // mais on ne les utilise pas pour les tests d'actualité générale de Mr Gras.
    return /disparition|avis de recherche|personne disparue|accident de la route|fait divers|incendie d'habitation|vol à l'étalage|braquage|meurtre|agression|météo|horoscope|loterie|euromillions|lotto|photo extraordinaire|insolite|buzz|people|carnet rose/.test(t);
  };
  const majorTopicHints=[
    'ryanair','skeyes','charleroi','brussels airport','rwanda','iran','ormuz','ukraine','russie','gaza','israel','otan','onu','trump','etats-unis','union europeenne','commission europeenne','gouvernement','parlement','budget','inflation','sncb','enseignement','migration','asile','proximus','orange','digi','telenet','diables rouges','uefa','fifa','festival','cannes','venise','milan','oscar','palme','nobel','intelligence artificielle','openai','anthropic','mistral'
  ];
  const normalizeTopicText=(v='')=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  const topicKey=(item)=>{
    const text=normalizeTopicText(`${item?.title||''} ${item?.summaryShort||''}`);
    const hits=majorTopicHints.filter(h=>text.includes(normalizeTopicText(h)));
    if(hits.length) return hits.slice(0,2).join('|');
    const tokens=[...topicTokens(item)].filter(x=>x.length>=5 && !/belgique|actualite|annonce|nouveau|nouvelle|video|photo/.test(x));
    return tokens.slice(0,3).sort().join('|') || normalizeTopicText(item?.title||'').slice(0,48);
  };
  const testImportance=(item)=>{
    if(lowValueForTest(item)) return -100;
    const t=normalizeTopicText(`${item?.title||''} ${item?.description||''}`);
    let score=0;
    if(['Politique','International','Économie','Sciences','Culture','Sport'].includes(item?.category)) score+=3;
    if(/gouvernement|ministre|parlement|election|president|diplomat|guerre|iran|ukraine|russie|gaza|israel|otan|onu|commission europeenne|union europeenne|budget|inflation|reforme|greve|skeyes|sncb|aeroport|nomme|elu|prix|festival|remporte|gagne|record|champion|accord|sanction|migration|asile/.test(t)) score+=4;
    if(/local|commune|quartier|rue|province/.test(t)) score-=1;
    return score;
  };

  const pickDiverseItems=(pool,count,excludeIds=[],excludeTopics=[])=>{
    const excluded=new Set(excludeIds);
    const blockedTopics=new Set(excludeTopics);
    const available=shuffle(pool.filter(n=>n.title && !excluded.has(n.id||n.url)))
      .sort((a,b)=>testImportance(b)-testImportance(a));
    const chosen=[];
    const sourceCounts=new Map();
    const categoryCounts=new Map();
    const sessionTopics=new Set();
    // Premier passage : un seul article par sujet, max 2 par source et max 3 par catégorie.
    for(const item of available){
      const key=topicKey(item);
      if(!key || blockedTopics.has(key) || sessionTopics.has(key) || testImportance(item)<0) continue;
      const src=item.source||'Autre', cat=item.category||'Autre';
      if((sourceCounts.get(src)||0)>=2) continue;
      if((categoryCounts.get(cat)||0)>=3) continue;
      chosen.push(item); sessionTopics.add(key);
      sourceCounts.set(src,(sourceCounts.get(src)||0)+1);
      categoryCounts.set(cat,(categoryCounts.get(cat)||0)+1);
      if(chosen.length>=count) break;
    }
    // Deuxième passage : on relâche source/catégorie, mais jamais le doublon de sujet dans la même session.
    if(chosen.length<count){
      for(const item of available){
        const key=topicKey(item);
        if(chosen.includes(item)||!key||blockedTopics.has(key)||sessionTopics.has(key)||testImportance(item)<0) continue;
        chosen.push(item); sessionTopics.add(key);
        if(chosen.length>=count) break;
      }
    }
    return shuffle(chosen);
  };

  const buildDeck=(count=12,mode='gras')=>{
    setPhotoDeckMessage('');
    let base=(relevantNews.length?relevantNews:combinedNews).filter(n=>n.title);
    if(mode==='essential') base=base.filter(n=>testImportance(n)>=5);

    if(!base.length) return;
    // On évite à la fois les mêmes ARTICLES et les mêmes SUJETS vus récemment.
    let pool=base.filter(n=>!recentTestIds.includes(n.id||n.url) && !recentTopicKeys.includes(topicKey(n)));
    if(pool.length<Math.min(count*2,base.length)) pool=base.filter(n=>!recentTopicKeys.includes(topicKey(n)));
    if(pool.length<Math.min(count,base.length)) pool=base;
    const items=pickDiverseItems(pool,Math.min(Math.max(count*7,100),pool.length),[],recentTopicKeys.slice(-10));
    const facts=items.map(item=>{const fact=withLead(item,makeFact(item));return fact?{item,...fact,topicKey:topicKey(item)}:null}).filter(Boolean);
    let cards;
    if(mode==='leconte'){
      cards=shuffle(facts.filter(x=>x.item.image)).slice(0,Math.min(count,facts.length)).map(x=>({...x,kind:'photo'}));
    }else{
      // Une seule question par sujet dans la session, même si plusieurs médias parlent du même événement.
      const seenTopics=new Set();
      let candidateFacts=facts.filter(x=>x.quality>=9 && x.question && x.answer && !/cette actualité|dans cette actualité|au sujet de|que faut-il retenir/i.test(x.question));
      if(mode==='people') candidateFacts=candidateFacts.filter(x=>x.answerKind==='person');
      const reliable=shuffle(candidateFacts).filter(f=>{
        if(!f.topicKey || seenTopics.has(f.topicKey)) return false;
        seenTopics.add(f.topicKey); return true;
      });
      cards=[];
      for(const fact of reliable){
        const options=buildOptions(fact,reliable);
        // Un QCM n'existe que si les 4 propositions sont du même type. Sinon, flashcard précise.
        cards.push({...fact,kind:options.length===4?'mcq':'flash',options});
        if(cards.length>=count) break;
      }
      cards=shuffle(cards);
    }
    setRecentTestIds(ids=>[...ids,...cards.map(c=>c.item.id||c.item.url)].slice(-60));
    setRecentTopicKeys(keys=>[...keys,...cards.map(c=>c.topicKey||topicKey(c.item)).filter(Boolean)].slice(-40));
    setDeck(cards); setDeckIndex(0); setFlashRevealed(false); setDeckStats({ok:0,review:0}); setQuiz(null); setQuizAnswer(''); setQuizResult(null); setPhotoAnswer('');
  };
  const makeQuiz=()=>buildDeck(12,'gras');
  const resolvePhoto=async(item)=>{
    if(item?.image) return {...item,image:item.image};
    if(!item?.url) return null;
    try{
      const r=await fetch(`/api/article-image?url=${encodeURIComponent(item.url)}`);
      if(!r.ok) return null;
      const data=await r.json();
      return data?.image?{...item,image:data.image}:null;
    }catch{return null;}
  };
  const makePhotoTest=async()=>{
    const base=(relevantNews.length?relevantNews:combinedNews).filter(n=>n.title);
    let candidates=base.filter(n=>!recentTestIds.includes(n.id||n.url) && !recentTopicKeys.includes(topicKey(n)));
    if(candidates.length<10) candidates=base.filter(n=>!recentTopicKeys.includes(topicKey(n)));
    if(candidates.length<6) candidates=base;
    const pool=pickDiverseItems(candidates,Math.min(60,candidates.length),[],recentTopicKeys.slice(-18));
    setPhotoDeckLoading(true); setPhotoDeckMessage('Recherche de photos d’actualité exploitables…');
    setDeck([]); setDeckIndex(0); setPhotoAnswer(''); setQuizResult(null); setFlashRevealed(false); setDeckStats({ok:0,review:0});
    const found=[];
    // Priorité aux images déjà fournies par les médias, puis enrichissement des autres fiches.
    for(const item of pool.filter(n=>n.image)){
      found.push({...item,image:item.image});
      if(found.length>=6) break;
    }
    const remaining=pool.filter(n=>!n.image && n.url).slice(0,36);
    for(let i=0;i<remaining.length && found.length<6;i+=6){
      const batch=await Promise.all(remaining.slice(i,i+6).map(resolvePhoto));
      for(const item of batch.filter(Boolean)){
        if(!found.some(x=>x.url===item.url)) found.push(item);
        if(found.length>=6) break;
      }
    }
    const cards=found.slice(0,6).map(item=>({item,kind:'photo'}));
    setRecentTestIds(ids=>[...ids,...cards.map(c=>c.item.id||c.item.url)].slice(-60));
    setRecentTopicKeys(keys=>[...keys,...cards.map(c=>topicKey(c.item)).filter(Boolean)].slice(-40));
    setDeck(shuffle(cards)); setDeckIndex(0); setPhotoDeckLoading(false);
    setPhotoDeckMessage(cards.length?`${cards.length} photo${cards.length>1?'s':''} prête${cards.length>1?'s':''}.`:'Aucune vraie photo exploitable n’a été trouvée dans les articles chargés.');
  };
  const nextCard=(result)=>{
    if(result) setDeckStats(s=>({...s,[result]:s[result]+1}));
    setPhotoAnswer(''); setQuizAnswer(''); setQuizResult(null); setFlashRevealed(false);
    setDeckIndex(i=>Math.min(i+1,deck.length));
  };
  const analyzeLink=async()=>{
    if(!addUrl.trim()) return;
    setAnalyzing(true); setAddMessage(''); setDraft(null);
    try{
      const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:addUrl.trim(),pastedText:addText})});
      const data=await r.json();
      if(!r.ok) throw new Error(data.error||'Analyse impossible');
      const fp=makeFact(data);
      setDraft({...data,quizPrompt:fp?.question||'',quizAnswer:fp?.answer||''});
      if(data.warning) setAddMessage(data.warning);
    }catch(e){setAddMessage(e.message||'Analyse impossible');}
    finally{setAnalyzing(false);}
  };
  const saveDraft=async()=>{
    if(!draft) return;
    const item={...draft,id:`manual-${Date.now()}`,date:new Date().toISOString(),manual:true};
    setManualNews(x=>[item,...x]);
    let msg='Actualité ajoutée à tes révisions et aux tests fictifs.';
    if(shareGlobal){
      try{
        const r=await fetch('/api/community-news',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
        const data=await r.json();
        if(r.ok) msg='Actualité ajoutée et publiée pour tous les utilisateurs.';
        else if(data?.error==='PARTAGE_NON_CONFIGURE') msg='Ajoutée à tes révisions. Le partage global sera actif dès que Supabase sera relié.';
        else msg='Ajoutée à tes révisions, mais le partage global a échoué.';
      }catch{msg='Ajoutée à tes révisions, mais le partage global a échoué.';}
    }
    setAddMessage(msg); setDraft(null); setAddUrl(''); setAddText(''); setShareGlobal(false);
  };

  const syncPushSubscription=async({enabled=reminderEnabled,time=reminderTime}={})=>{
    if(typeof Notification==='undefined'||Notification.permission!=='granted'||!('serviceWorker' in navigator)) return false;
    setPushServerStatus('connecting');
    try{
      const cfg=await fetch(`${PUSH_ENDPOINT}?action=config`,{cache:'no-store'}).then(r=>r.json());
      if(!cfg?.configured||!cfg?.publicKey){setPushServerStatus('setup');return false;}
      const reg=await navigator.serviceWorker.ready;
      let sub=await reg.pushManager.getSubscription();
      if(!sub&&enabled) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(cfg.publicKey)});
      if(!sub){setPushServerStatus('idle');return false;}
      const r=await fetch(PUSH_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'subscribe',subscription:sub.toJSON(),reminderTime:time,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Brussels',enabled})});
      if(!r.ok) throw new Error('push backend unavailable');
      setPushServerStatus(enabled?'active':'idle'); return true;
    }catch{setPushServerStatus('setup');return false;}
  };
  const requestNotifications=async()=>{
    if(typeof Notification==='undefined'){setNotifStatus('unsupported');return}
    const p=await Notification.requestPermission(); setNotifStatus(p);
    if(p==='granted'){setReminderEnabled(true);await syncPushSubscription({enabled:true,time:reminderTime});}
  };
  const closeTutorial=()=>{ localStorage.setItem('ihecs-tutorial-seen-v1','1'); setTutorialOpen(false); setTutorialStep(0); };
  const relaunchTutorial=()=>{ setTutorialStep(0); setTutorialOpen(true); };
  const tutorialNext=()=>{
    if(tutorialStep>=tutorialSteps.length-1){ closeTutorial(); return; }
    setTutorialStep(i=>Math.min(i+1,tutorialSteps.length-1));
  };
  const tutorialPrev=()=>setTutorialStep(i=>Math.max(0,i-1));

  const testNotification=async()=>{
    if(!('Notification' in window)){ setNotifStatus('unsupported'); return; }
    let permission=Notification.permission;
    if(permission!=='granted'){ permission=await Notification.requestPermission(); setNotifStatus(permission); }
    if(permission!=='granted') return;
    const ok=await syncPushSubscription({enabled:true,time:reminderTime});
    if(!ok) return;
    try{
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.getSubscription();
      if(!sub) throw new Error('subscription missing');
      const r=await fetch(PUSH_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'test',subscription:sub.toJSON()})});
      if(!r.ok) throw new Error('test failed');
      setPushServerStatus('active');
    }catch{
      setPushServerStatus('setup');
    }
  };

  const installApp=async()=>{
    if(!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><img className="brandLogo" src="/app-icon.png" alt=""/><div className="brandText"><strong>IHECS Test Actus</strong><span>RÉVISIONS D’ACTUALITÉ</span></div></div>
      <nav>{nav.map(([x,icon])=><button key={x} className={tab===x?'active':''} onClick={()=>navTo(x)}><span>{icon}</span>{x}</button>)}</nav>
      <div className="sideFoot"><span className={`dot ${error?'bad':loading?'wait':'ok'}`}></span>{loading?'Actualisation…':error?'Flux indisponible':'Veille en direct'}</div>
    </aside>

    <main>
      <header className="topbar"><div><p className="eyebrow">IHECS Test Actus <span className="versionBadge">{APP_VERSION}</span></p><h1>{tab}</h1></div><div className="refreshGroup"><span className="refreshStamp">{refreshing?'Mise à jour…':lastUpdatedAt?`Mis à jour à ${new Intl.DateTimeFormat('fr-BE',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Europe/Brussels'}).format(new Date(lastUpdatedAt))}`:''}</span><button className="iconBtn" onClick={()=>loadNews(filterSince,{silent:true})} title="Actualiser maintenant">↻</button></div></header>

      {tab==='Accueil'&&<>
        <section className="hero">
          <div><span className="liveBadge"><i/> ACTUALITÉ EN DIRECT</span><h2>Si j’avais un test demain</h2><p>L’app garde la matière depuis le dernier test surprise de Mr Gras et de Mr Leconte.</p><div className="heroMeta"><strong>{relevantNews.length}</strong> actus récupérées depuis la période la plus ancienne · <strong>{sourceStatus.filter(s=>s.ok).length}</strong> sources actives</div></div>
          <div className="heroActions"><button className="lightBtn" onClick={()=>{setRevisionView('tests');navTo('Révisions');makeQuiz()}}>Faire un test blanc →</button><button className="briefHeroBtn" onClick={()=>setDailyBriefOpen(true)}>Brief d’hier</button></div>
        </section>

        <section className="homeRubrics"><div className="sectionTitle"><div><p className="eyebrow">Navigation</p><h2>Mes rubriques</h2></div></div><div className="homeRubricGrid"><button onClick={()=>{setActusView('fil');navTo('Actus')}}><span>◉</span><strong>Actus</strong><small>Fil complet, nécrologie et ajout d’articles</small></button><button onClick={()=>{setRevisionView('menu');navTo('Révisions')}}><span>✓</span><strong>Révisions</strong><small>Entraînements, tests fictifs et mes tests</small></button><button onClick={()=>navTo('Tutoriel')}><span>?</span><strong>Tutoriel</strong><small>Revoir le fonctionnement de l’app</small></button><button onClick={()=>setDailyBriefOpen(true)}><span>☀</span><strong>Brief d’hier</strong><small>Les 5 sujets importants de la veille</small></button></div></section>

        <section><div className="sectionTitle"><div><p className="eyebrow">Périodes automatiques</p><h2>Mes profs</h2></div></div>
          <div className="profGrid">{profs.map(p=><article className="profCard" key={p.key}>
            <div className="profTop"><span className="number">{p.key==='qcm'?'01':'02'}</span><span className="softPill">{p.label}</span></div>
            <h3>{p.name}</h3><p className="muted">{p.type}</p>
            <div className="testDateLine"><span>Dernier test</span><strong>{fmt(tests[p.key])}</strong></div>
            <div className="period"><span>Matière actuelle</span><strong>{fmt(nextDay(tests[p.key]),true)} → aujourd’hui</strong><small>{daysBetween(nextDay(tests[p.key]),today)+1} jours d’actualité</small></div>
            {editingTestDate===p.key&&<div className="dateEditor"><label>📌 Corriger la date du test<input type="date" max={today} value={testDateDraft} onChange={e=>setTestDateDraft(e.target.value)}/></label><div><button onClick={()=>saveTestDate(p.key)} disabled={!testDateDraft||testDateDraft>today}>Enregistrer</button><button className="secondary" onClick={()=>setEditingTestDate(null)}>Annuler</button></div></div>}
            <div className="actions"><button onClick={()=>{setRevisionView('menu');navTo('Révisions')}}>Réviser</button><button className="secondary" onClick={()=>markTest(p.key)}>J’ai eu un test aujourd’hui</button><button className="pinDateBtn" onClick={()=>openTestDateEditor(p.key)}>📌 Modifier la date</button></div>
          </article>)}</div>
        </section>

        <section className="reminderCard"><div><p className="eyebrow">Rappel quotidien</p><h2>Réviser sur téléphone</h2><p>Choisis ton heure de rappel et vérifie immédiatement que ton téléphone autorise bien les notifications.</p></div><div className="reminderControls"><input type="time" value={reminderTime} onChange={e=>setReminderTime(e.target.value)}/>{notifStatus!=='granted'?<button onClick={requestNotifications}>Activer les notifications</button>:<label className="switchLabel"><input type="checkbox" checked={reminderEnabled} onChange={e=>setReminderEnabled(e.target.checked)}/> Rappel actif</label>}<button className="secondary" onClick={testNotification}>Tester la notification</button>{!installed&&installPrompt&&<button className="secondary" onClick={installApp}>Installer l’app</button>}</div><small className="reminderNote">{pushServerStatus==='active'?'✓ Push serveur actif : le rappel fonctionnera même si l’app est fermée.':pushServerStatus==='connecting'?'Connexion au push serveur…':pushServerStatus==='setup'?'Connexion au serveur push impossible pour le moment.':'Active les notifications puis utilise “Tester la notification”.'}</small></section>

        <section><div className="sectionTitle"><div><p className="eyebrow">À surveiller</p><h2>Dernières actualités</h2></div><button className="textBtn" onClick={()=>navTo('Actus')}>Tout voir →</button></div>
          {loading?<Skeleton/>:error?<Empty text={error}/>:<div className="headlineList">{combinedNews.slice(0,7).map((n,i)=><NewsRow key={n.id} n={n} index={i+1} onOpen={()=>openArticle(n)} saved={saved.includes(n.id)} onSave={()=>toggleSaved(n.id)}/>)}</div>}
        </section>
      </>}

      {tab==='Actus'&&actusView==='fil'&&<section className="noTop">
        <div className="subTabs"><button className="active" onClick={()=>setActusView('fil')}>Fil d’actu</button><button onClick={()=>setActusView('necrologie')}>Nécrologie</button><button onClick={()=>setActusView('ajouter')}>＋ Ajouter</button></div>
        <div className="toolbar"><div className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un sujet, une personne, un média…"/></div><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></div>
        <div className="periodFilter">
          <div className="periodFilterText"><span>Afficher l’actualité</span><strong>{filterSince?`depuis le ${fmt(filterSince,true)}`:'sans limite de date'}</strong></div>
          <div className="periodChoices">
            <button className={dateFilter==='all'?'active':''} onClick={()=>setDateFilter('all')}>Toutes</button>
            <button className={dateFilter==='gras'?'active':''} onClick={()=>setDateFilter('gras')}>Depuis le test de Mr Gras</button>
            <button className={dateFilter==='leconte'?'active':''} onClick={()=>setDateFilter('leconte')}>Depuis le test de Mr Leconte</button>
            <button className={dateFilter==='custom'?'active':''} onClick={()=>setDateFilter('custom')}>Depuis une date</button>
            {dateFilter==='custom'&&<input type="date" value={customSince} max={today} onChange={e=>setCustomSince(e.target.value)}/>} 
          </div>
        </div>
        <div className="sourceStrip"><strong>Sources suivies</strong>{sourceStatus.map(s=><span key={s.name} className={s.ok?'sourceOk':'sourceOff'}>{s.name}{s.ok&&typeof s.count==='number'?` · ${s.count}`:''}</span>)}</div>
        <div className="resultCount">{filtered.length} actualité{filtered.length>1?'s':''}{filterSince?' dans cette période':''}</div>
        {loading?<Skeleton/>:error?<Empty text={error}/>:filtered.length===0?<Empty text="Aucune actualité trouvée pour cette période."/>:<><div className="newsGrid">{filtered.slice(0,visibleLimit).map(n=><NewsCard key={n.id} n={n} onOpen={()=>openArticle(n)} saved={saved.includes(n.id)} onSave={()=>toggleSaved(n.id)}/>)}</div>{filtered.length>visibleLimit&&<div className="loadMoreWrap"><button className="loadMoreBtn" onClick={()=>setVisibleLimit(v=>Math.min(v+60,filtered.length))}>Afficher 60 actus de plus <span>{visibleLimit} / {filtered.length}</span></button></div>}</>}
      </section>}

      {tab==='Actus'&&actusView==='necrologie'&&<section className="noTop">
        <div className="subTabs"><button onClick={()=>setActusView('fil')}>Fil d’actu</button><button className="active" onClick={()=>setActusView('necrologie')}>Nécrologie</button><button onClick={()=>setActusView('ajouter')}>＋ Ajouter</button></div>
        <div className="necrologyIntro"><div><p className="eyebrow">Personnalités disparues</p><h2>Nécrologie</h2><p>Une fiche courte pour retenir qui est décédé, qui était la personne et la cause du décès uniquement lorsqu’elle est explicitement mentionnée par une source. Les cartes sans photo exploitable ne sont pas affichées.</p></div></div>
        {loading?<Skeleton/>:obituaryNews.length===0?<Empty text="Aucune nécrologie avec photo exploitable n’a encore été récupérée."/>:<div className="necrologyGrid">{obituaryNews.slice(0,80).map(n=><ObituaryCard key={n.id} item={n} onOpen={()=>openArticle(n)}/>)}</div>}
      </section>}

      {tab==='Actus'&&actusView==='ajouter'&&<section className="noTop">
        <div className="subTabs"><button onClick={()=>setActusView('fil')}>Fil d’actu</button><button onClick={()=>setActusView('necrologie')}>Nécrologie</button><button className="active" onClick={()=>setActusView('ajouter')}>＋ Ajouter</button></div>
        <div className="revisionIntro"><div><p className="eyebrow">Ajout manuel</p><h2>Ajouter une actualité</h2><p>Colle un lien : l’app récupère ce qui est publiquement accessible, résume, classe et ajoute l’info à tes révisions. Pour un article réservé aux abonnés, colle aussi le texte auquel tu as accès.</p></div></div>
        <div className="addGrid">
          <article className="addCard"><label>Lien de l’article</label><input type="url" value={addUrl} onChange={e=>setAddUrl(e.target.value)} placeholder="https://…"/><label>Texte de l’article <span>(optionnel — utile pour un paywall)</span></label><textarea value={addText} onChange={e=>setAddText(e.target.value)} placeholder="Si tu es abonné, tu peux coller ici le texte de l’article pour que l’app l’analyse sans contourner le paywall."/><button className="submit" disabled={!addUrl.trim()||analyzing} onClick={analyzeLink}>{analyzing?'Analyse en cours…':'Analyser le lien'}</button>{addMessage&&<p className="statusMsg">{addMessage}</p>}</article>
          <article className="addCard mediaCard"><p className="eyebrow">Mes accès médias</p><h3>Abonnements</h3><p className="muted">L’app ne stocke jamais tes mots de passe et ne contourne aucun paywall. Indique seulement les médias auxquels tu es abonné pour te rappeler que tu peux coller le texte d’un article payant.</p>{['Le Soir','La Libre','La DH','Le Vif'].map(m=><label className="mediaToggle" key={m}><input type="checkbox" checked={!!mediaAccess[m]} onChange={e=>setMediaAccess(x=>({...x,[m]:e.target.checked}))}/><span>{m}</span><small>{mediaAccess[m]?'Abonnement indiqué':'Non indiqué'}</small></label>)}</article>
        </div>
        {draft&&<article className="draftCard"><div className="draftTop"><span className="softPill">{draft.category}</span><span className="softPill">{draft.source}</span></div><h2>{draft.title}</h2>{draft.image&&<img className="draftImage" src={draft.image} alt="Illustration de l’article"/>}<label>Résumé</label><textarea value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/><label>Contexte</label><textarea value={draft.context||''} onChange={e=>setDraft(d=>({...d,context:e.target.value}))}/><label>Question proposée pour Mr Gras</label><input value={draft.quizPrompt||''} onChange={e=>setDraft(d=>({...d,quizPrompt:e.target.value}))}/><label>Réponse attendue</label><input value={draft.quizAnswer||''} onChange={e=>setDraft(d=>({...d,quizAnswer:e.target.value}))}/><label className="shareToggle"><input type="checkbox" checked={shareGlobal} onChange={e=>setShareGlobal(e.target.checked)}/><span><strong>Partager à tous les utilisateurs</strong><small>Nécessite la base partagée Supabase. Sinon l’info reste enregistrée sur ton appareil.</small></span></label><div className="draftActions"><button className="submit" onClick={saveDraft}>Valider et ajouter</button><a className="secondaryLink" href={draft.url} target="_blank" rel="noreferrer">Vérifier la source ↗</a></div></article>}
      </section>}

      {tab==='Révisions'&&revisionView==='menu'&&<section className="noTop">
        <div className="subTabs"><button className="active" onClick={()=>setRevisionView('menu')}>Révisions</button><button onClick={()=>setRevisionView('tests')}>Tests fictifs</button><button onClick={()=>setRevisionView('mes-tests')}>Mes tests</button></div>
        <div className="revisionIntro"><div><p className="eyebrow">Révision intelligente</p><h2>Choisis ton mode</h2><p>Les exercices portent sur le contenu de l’actualité, jamais sur le nom du média qui a publié l’article.</p></div></div>
        <div className="modeGrid"><button className="mode" onClick={()=>{setRevisionView('tests');buildDeck(12,'gras')}}><span>JUSQU’À 12 QUESTIONS · SUJETS ÉQUILIBRÉS</span><strong>Session Mr Gras</strong><small>QCM et questions précises sur des sujets différents</small></button><button className="mode" onClick={()=>{setRevisionView('tests');buildDeck(15,'essential')}}><span>15 QUESTIONS PRIORITAIRES</span><strong>Si j’avais un test demain</strong><small>Uniquement les sujets les plus importants de ta période</small></button><button className="mode" onClick={()=>{setRevisionView('tests');buildDeck(10,'people')}}><span>PERSONNALITÉS</span><strong>Qui est qui ?</strong><small>Noms, fonctions et personnes au cœur de l’actualité</small></button><button className="mode" onClick={()=>{setRevisionView('tests');makePhotoTest()}}><span>6 PHOTOS</span><strong>Session Mr Leconte</strong><small>Photo → expliquer l’actualité</small></button><button className="mode" onClick={()=>{setActusView('fil');setTab('Actus');setCategory('Toutes')}}><span>ACTU</span><strong>Revoir les fiches</strong><small>{relevantNews.length} éléments dans la période</small></button><button className="mode" onClick={()=>{setActusView('fil');setTab('Actus');setQuery('')}}><span>★</span><strong>Mes articles sauvegardés</strong><small>{saved.length} sauvegardés</small></button></div>
      </section>}

      {tab==='Révisions'&&revisionView==='tests'&&<section className="noTop">
        <div className="subTabs"><button onClick={()=>setRevisionView('menu')}>Révisions</button><button className="active" onClick={()=>setRevisionView('tests')}>Tests fictifs</button><button onClick={()=>setRevisionView('mes-tests')}>Mes tests</button></div>
        <div className="examHeader"><div><p className="eyebrow">Mode entraînement</p><h2>Test d’actu fictif</h2><p className="muted">Mr Gras : questions uniquement à partir de faits clairement identifiés. Les réponses sont des personnes, pays ou organisations réelles, avec des choix du même type. Les sujets sont équilibrés entre politique, international, économie, société, culture, sciences et sport ; les articles ambigus sont ignorés. Mr Leconte : photos tirées d’autres actualités quand c’est possible.</p></div><div className="examBtns"><button onClick={()=>buildDeck(12,'gras')}>12 questions · Mr Gras</button><button className="secondary" onClick={()=>buildDeck(15,'essential')}>Test demain</button><button className="secondary" onClick={()=>buildDeck(10,'people')}>Personnalités</button><button className="secondary" onClick={makePhotoTest} disabled={photoDeckLoading}>{photoDeckLoading?'Recherche des photos…':'6 photos · Mr Leconte'}</button></div></div>
        {photoDeckLoading&&<div className="photoSearchStatus"><span className="spinner"/>Recherche des photos publiées avec les actualités…</div>}
        {!photoDeckLoading&&photoDeckMessage&&deck.length===0&&<div className="photoSearchStatus">{photoDeckMessage}</div>}
        {deck.length===0&&!photoDeckLoading&&!photoDeckMessage&&<Empty text="Choisis une session Mr Gras ou Mr Leconte pour commencer."/>}
        {deck.length>0&&deckIndex<deck.length&&(()=>{const c=deck[deckIndex];return <article className="examCard flashExam">
          <div className="deckTop"><div className="questionNo">{c.kind==='photo'?'MR LECONTE · PHOTO':c.kind==='mcq'?'MR GRAS · QCM · UNE SEULE RÉPONSE':'MR GRAS · FLASHCARD'}</div><span>{deckIndex+1} / {deck.length}</span></div>
          <div className="progress"><i style={{width:`${((deckIndex+1)/deck.length)*100}%`}}/></div>
          {c.kind==='photo'?<>
            <img className="testPhoto" src={`/api/image-proxy?url=${encodeURIComponent(c.item.image)}`} alt="Photo liée à l’actualité"/>
            <h3>Quelle actualité cette photo représente-t-elle ?</h3>
            <p className="hint">Explique le fait, les personnes ou institutions concernées et le contexte en quelques lignes.</p>
            <textarea value={photoAnswer} onChange={e=>setPhotoAnswer(e.target.value)} placeholder="Ta réponse…"/>
            {!quizResult?<button className="submit" disabled={photoAnswer.trim().length<15} onClick={()=>setQuizResult(true)}>Voir la correction</button>:<div className="correction"><span>Réponse attendue</span><h3>{c.item.title}</h3><p>{displaySummaries(c.item).long||c.answer}</p>{c.item.context&&<p className="muted">Contexte : {c.item.context}</p>}<div className="correctionLinks"><button className="textBtn left" onClick={()=>openArticle(c.item)}>Voir la fiche d’actu →</button><a href={c.item.url} target="_blank" rel="noreferrer">Article source ↗</a></div></div>}
          </>:c.kind==='mcq'?<>
            <span className="cardCategory">{c.item.category}</span>
            <h3>{c.question}</h3>
            <div className="answers">{c.options.map(opt=><button key={opt} className={quizAnswer===opt?'chosen':''} disabled={quizResult!==null} onClick={()=>setQuizAnswer(opt)}>{opt}</button>)}</div>
            {quizResult===null?<button className="submit" disabled={!quizAnswer} onClick={()=>setQuizResult(quizAnswer===c.answer)}>Valider ma réponse</button>:<div className={`feedback ${quizResult?'good':'wrong'}`}><strong>{quizResult?'Bonne réponse.':'Mauvaise réponse.'}</strong><p>Réponse : <b>{c.answer}</b></p><p>{displaySummaries(c.item).long}</p><div className="correctionLinks"><button className="textBtn left" onClick={()=>openArticle(c.item)}>Voir la fiche d’actu →</button><a href={c.item.url} target="_blank" rel="noreferrer">Article source ↗</a></div></div>}
          </>:<>
            <span className="cardCategory">{c.item.category}</span>
            {c.lead&&<div className="questionContext"><span>Contexte de la question</span><p>{c.lead}</p></div>}
            <h3>{c.question}</h3>
            {!flashRevealed?<div className="flashHidden"><p>Donne une réponse précise avant de retourner la carte.</p><button className="submit" onClick={()=>setFlashRevealed(true)}>Voir la réponse</button></div>:<div className="flashAnswer"><span>Réponse attendue</span><h3>{c.answer}</h3><p>{displaySummaries(c.item).long}</p>{c.item.context&&<p className="muted">Contexte : {c.item.context}</p>}<div className="correctionLinks"><button className="textBtn left" onClick={()=>openArticle(c.item)}>Voir la fiche d’actu →</button><a href={c.item.url} target="_blank" rel="noreferrer">Article source ↗</a></div></div>}
          </>}
          {(flashRevealed||quizResult!==null)&&<div className="deckActions"><button className="review" onClick={()=>nextCard('review')}>À revoir</button><button className="know" onClick={()=>nextCard('ok')}>Je maîtrise →</button></div>}
        </article>})()}
        {deck.length>0&&deckIndex>=deck.length&&<article className="examCard resultCard"><p className="eyebrow">Session terminée</p><h3>{deckStats.ok} maîtrisée{deckStats.ok>1?'s':''} · {deckStats.review} à revoir</h3><p>Relance une session : les cartes sont tirées dans l’actualité de ta période de test.</p><button className="submit" onClick={()=>buildDeck(12,'gras')}>Relancer une session</button></article>}
      </section>}

      {tab==='Révisions'&&revisionView==='mes-tests'&&<section className="noTop">
        <div className="subTabs"><button onClick={()=>setRevisionView('menu')}>Révisions</button><button onClick={()=>setRevisionView('tests')}>Tests fictifs</button><button className="active" onClick={()=>setRevisionView('mes-tests')}>Mes tests</button></div>
        <div className="testGrid">{profs.map(p=><article className="settingsCard" key={p.key}><span className="softPill">{p.label}</span><h2>{p.name}</h2><label>Date du dernier test d’actu</label><input type="date" value={tests[p.key]} max={today} onChange={e=>setTests(t=>({...t,[p.key]:e.target.value}))}/><div className="period compact"><span>Actualités à connaître depuis</span><strong>{fmt(nextDay(tests[p.key]))} → aujourd’hui</strong></div><button onClick={()=>markTest(p.key)}>Enregistrer un test aujourd’hui</button></article>)}</div>
        <div className="sectionTitle historyTitle"><div><p className="eyebrow">Archives</p><h2>Historique des tests</h2></div></div>{history.length===0?<Empty text="Aucun test archivé pour l’instant."/>:<div className="historyList">{history.map(h=><div key={h.id} className="historyItem"><div><strong>{h.prof==='qcm'?'Mr Gras — QCM':'Mr Leconte — Photo'}</strong><span>Test du {fmt(h.date)}</span></div><p>Matière archivée : {fmt(h.from)} → {fmt(h.to)}</p></div>)}</div>}
      </section>}

      {tab==='Tutoriel'&&<section className="noTop tutorialPage">
        <div className="tutorialHero"><div><p className="eyebrow">Aide & prise en main</p><h2>Découvrir IHECS Test Actus</h2><p>Relance la présentation complète de l’application ou consulte rapidement les fonctions principales.</p></div><button className="submit" onClick={relaunchTutorial}>Relancer le tutoriel</button></div>
        <div className="tutorialOverview">{tutorialSteps.slice(1,-1).map((step,i)=><article className="tutorialOverviewCard" key={step.title}><span>{String(i+1).padStart(2,'0')}</span><h3>{step.title}</h3><p>{step.text}</p><button className="textBtn left" onClick={()=>navTo(step.tab)}>Ouvrir {step.tab} →</button></article>)}</div>
      </section>}
    </main>

    {dailyPromptOpen&&<div className="briefPromptBack" role="dialog" aria-modal="true" aria-label="Résumé de l’actualité de la veille"><article className="briefPrompt"><span className="briefPromptIcon">☀</span><p className="eyebrow">Une fois par jour</p><h2>Un résumé de l’actu de la veille ?</h2><p>J’ai regroupé les articles d’hier par sujet pour te sortir les points les plus importants.</p><div className="briefPromptMeta"><strong>{dailyBrief.total}</strong> articles analysés · <strong>{dailyBrief.topics}</strong> sujets regroupés</div><div className="briefPromptActions"><button className="secondary" onClick={()=>setDailyPromptOpen(false)}>Pas aujourd’hui</button><button className="submit" onClick={()=>{setDailyPromptOpen(false);setDailyBriefOpen(true)}}>Voir les 5 points →</button></div></article></div>}
    {dailyBriefOpen&&<div className="briefBack" role="dialog" aria-modal="true" aria-label="Brief de la veille"><article className="briefModal"><button className="close" onClick={()=>setDailyBriefOpen(false)}>×</button><p className="eyebrow">Brief de la veille</p><h2>Les 5 points importants</h2><p className="briefLead">{dailyBrief.total?`${dailyBrief.total} articles publiés hier ont été regroupés en ${dailyBrief.topics} sujets.`:'Je n’ai pas encore assez d’articles datés d’hier pour construire le brief.'}</p>{dailyBrief.points.length?<div className="briefPoints">{dailyBrief.points.map((point,i)=><article className="briefPoint" key={point.id}><span>{String(i+1).padStart(2,'0')}</span><div><h3>{point.title}</h3><p>{point.summary}</p><small>{point.sources.join(' · ')}</small><button className="textBtn left" onClick={()=>{setDailyBriefOpen(false);setSelected(point.item)}}>Voir la fiche →</button></div></article>)}</div>:<Empty text="Aucun sujet majeur n’a pu être regroupé pour hier."/>}<div className="briefFooter"><button className="secondary" onClick={()=>setDailyBriefOpen(false)}>Fermer</button><button className="submit" onClick={()=>{setDailyBriefOpen(false);setActusView('fil');navTo('Actus')}}>Voir toutes les actus →</button></div></article></div>}
    {tutorialOpen&&<div className="tutorialBack" role="dialog" aria-modal="true" aria-label="Tutoriel IHECS Test Actus"><article className="tutorialModal"><div className="tutorialModalTop"><div><span className="tutorialStepCount">{tutorialStep+1} / {tutorialSteps.length}</span><div className="tutorialDots">{tutorialSteps.map((_,i)=><i key={i} className={i<=tutorialStep?'active':''}/>)}</div></div><button className="tutorialSkip" onClick={closeTutorial}>Passer</button></div><div className="tutorialVisual"><span>{nav.find(n=>n[0]===tutorialSteps[tutorialStep].tab)?.[1]||'•'}</span></div><p className="eyebrow">Présentation de l’app</p><h2>{tutorialSteps[tutorialStep].title}</h2><p className="tutorialText">{tutorialSteps[tutorialStep].text}</p><div className="tutorialActions">{tutorialStep>0?<button className="secondary" onClick={tutorialPrev}>← Précédent</button>:<span/>}<button className="secondary" onClick={()=>{navTo(tutorialSteps[tutorialStep].tab);setTutorialOpen(false)}}>Voir cette section</button><button className="submit" onClick={tutorialNext}>{tutorialStep===tutorialSteps.length-1?'Terminer':'Suivant →'}</button></div></article></div>}

    {selected&&(()=>{const sum=displaySummaries(selected);return <div className="modalBack" onClick={closeArticle}><article className="modal articleReader" onClick={e=>e.stopPropagation()} onTouchStart={onArticleTouchStart} onTouchEnd={onArticleTouchEnd}><div className="articleReaderTop"><button className="readerArrow" onClick={()=>navigateArticle(-1)} disabled={articleDeck.length<2} aria-label="Actualité précédente">‹</button><div className="readerPosition"><strong>{articleIndex>=0?articleIndex+1:1} / {articleDeck.length||1}</strong><span>Glisse ← → pour changer d’actu</span></div><button className="readerArrow" onClick={()=>navigateArticle(1)} disabled={articleDeck.length<2} aria-label="Actualité suivante">›</button></div><button className="close" onClick={closeArticle} aria-label="Fermer">×</button><div className="modalMeta"><span>{selected.category}</span><span>{selected.source}</span><span>{fmtNews(selected.date)}</span>{selected.manual&&<span>Ajout manuel</span>}{selected.shared&&<span>Partagé</span>}</div><h2>{selected.title}</h2><SmartImage item={selected} className="modalImage" alt="Illustration de l’actualité"/><div className="summaryStack"><div className="factBox summaryShort"><span>Résumé express</span><p>{sum.short||"Résumé indisponible pour le moment."}</p></div><div className="factBox summaryLong"><span>Résumé clair</span><p>{sum.long||sum.short}</p></div></div>{selected.context&&<><h3>Contexte</h3><p className="muted">{selected.context}</p></>}<h3>Source originale</h3><p className="muted">Les résumés servent à réviser. Pour vérifier un détail, une citation ou un chiffre, ouvre toujours l’article du média.</p>
        {relatedToSelected.length>0&&<div className="topicFollow"><div className="topicFollowHead"><span>Suivi du sujet</span><h3>Lire les articles liés et plus récents</h3><p>Cette actualité peut évoluer. Voici d’autres articles portant sur le même sujet, y compris chez d’autres médias.</p></div><div className="relatedList">{relatedToSelected.map(r=><article key={r.id} className="relatedItem"><div><span>{r.source} · {fmtNews(r.date)}</span><strong>{r.title}</strong></div><div className="relatedActions"><button className="textBtn left" onClick={()=>openArticle(r,{replace:true})}>Voir la fiche</button><a href={r.url} target="_blank" rel="noreferrer">Lire l’article lié ↗</a></div></article>)}</div></div>}
        <div className="modalActions"><a className="primaryLink" href={selected.url} target="_blank" rel="noreferrer">Lire l’article source ↗</a><button className="secondary" onClick={()=>toggleSaved(selected.id)}>{saved.includes(selected.id)?'★ Sauvegardé':'☆ Sauvegarder'}</button></div></article></div>})()}
  </div>
}


function SmartImage({item,className='',alt='',fallback=null}){
  const [src,setSrc]=useState(item?.image||'');
  const [done,setDone]=useState(!!item?.image);
  useEffect(()=>{
    let alive=true;
    setSrc(item?.image||''); setDone(!!item?.image);
    if(item?.image||!item?.url) return ()=>{alive=false};
    fetch(`/api/article-image?url=${encodeURIComponent(item.url)}`).then(r=>r.ok?r.json():null).then(data=>{
      if(!alive) return;
      if(data?.image) setSrc(data.image);
      setDone(true);
    }).catch(()=>{if(alive)setDone(true)});
    return()=>{alive=false};
  },[item?.image,item?.url]);
  if(src) return <img className={className} src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={()=>{setSrc('');setDone(true)}}/>;
  if(!done) return <div className={`${className} imageLoading`} aria-label="Recherche de la photo"><span>Recherche de la photo…</span></div>;
  return fallback;
}


function ObituaryCard({item,onOpen}){
  const [src,setSrc]=useState(item?.image||'');
  const [checked,setChecked]=useState(!!item?.image);
  useEffect(()=>{let alive=true;setSrc(item?.image||'');setChecked(!!item?.image);if(item?.image||!item?.url)return()=>{alive=false};fetch(`/api/article-image?url=${encodeURIComponent(item.url)}`).then(r=>r.ok?r.json():null).then(d=>{if(!alive)return;if(d?.image)setSrc(d.image);setChecked(true)}).catch(()=>{if(alive)setChecked(true)});return()=>{alive=false}},[item?.image,item?.url]);
  if(!checked&&!src) return null;
  if(!src) return null;
  const info=obituaryInfo(item);
  return <article className="obituaryCard"><img src={src} alt={`Photo de ${info.person}`} loading="lazy" referrerPolicy="no-referrer" onError={()=>setSrc('')}/><div className="obituaryBody"><div className="cardMeta"><span>{item.source}</span><span>{fmtNews(item.date)}</span></div><h3>{info.person}</h3><div className="obituaryFact"><span>Qui c’était</span><p>{info.who}</p></div><div className="obituaryFact"><span>Décès</span><p>{info.cause}</p></div><div className="obituaryActions"><button className="textBtn left" onClick={onOpen}>Voir la fiche →</button><a href={item.url} target="_blank" rel="noreferrer">Article source ↗</a></div></div></article>
}

function NewsRow({n,index,onOpen,saved,onSave}){return <article className="headline"><span className="rank">{String(index).padStart(2,'0')}</span><div className="headlineBody" onClick={onOpen}><div className="meta"><b>{n.source}</b><span>{n.category}</span><span>{fmtNews(n.date)}</span></div><h3>{n.title}</h3></div><button className="saveBtn" onClick={onSave}>{saved?'★':'☆'}</button></article>}
function NewsCard({n,onOpen,saved,onSave}){const sum=displaySummaries(n);return <article className="newsCard"><SmartImage item={n} className="newsCardImage" alt="Illustration de l’actualité"/><div className="cardMeta"><span>{n.source}</span><span>{fmtNews(n.date)}</span></div><button className="saveBtn floating" onClick={onSave}>{saved?'★':'☆'}</button><div className="categoryLine">{n.category}</div><h3 onClick={onOpen}>{n.title}</h3><p>{sum.short||'Ouvrir la fiche pour accéder à la source.'}</p><button className="textBtn left" onClick={onOpen}>Voir la fiche →</button></article>}
function Feedback({ok,item}){return <div className={`feedback ${ok?'good':'wrong'}`}><strong>{ok?'Bonne réponse.':'Pas cette fois.'}</strong><p>À retenir : <b>{item.title}</b></p><a href={item.url} target="_blank" rel="noreferrer">Revoir l’actualité ↗</a></div>}
function Skeleton(){return <div className="skeletonWrap">{[1,2,3,4].map(i=><div className="skeleton" key={i}/>)}</div>}
function Empty({text}){return <div className="empty"><div>—</div><p>{text}</p></div>}

createRoot(document.getElementById('root')).render(<App/>);

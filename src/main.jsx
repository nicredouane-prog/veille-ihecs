import React, {useEffect, useMemo, useState} from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const APP_VERSION='v3.7';
const fmt = (value, short=false) => new Intl.DateTimeFormat('fr-BE', short ? {day:'2-digit',month:'short'} : {day:'2-digit',month:'long',year:'numeric'}).format(new Date(value));
const isoToday = () => new Date().toISOString().slice(0,10);
const nextDay = d => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate()+1); return x.toISOString().slice(0,10); };
const daysBetween = (a,b) => Math.max(0,Math.ceil((new Date(b)-new Date(a))/86400000));
const safeJson = (k,fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };


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

const nav = [
  ['Accueil','⌂'],['Actualités','◉'],['Ajouter','＋'],['Révisions','✓'],['Tests fictifs','✎'],['Mes tests','▣']
];

function App(){
  const [tab,setTab]=useState('Accueil');
  const [tests,setTests]=useState(()=>safeJson('veille-tests',{qcm:'2026-09-21',photo:'2026-09-05'}));
  const [history,setHistory]=useState(()=>safeJson('veille-history',[]));
  const [news,setNews]=useState([]);
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
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('Toutes');
  const [dateFilter,setDateFilter]=useState(()=>localStorage.getItem('veille-date-filter')||'all');
  const [customSince,setCustomSince]=useState(()=>localStorage.getItem('veille-custom-since')||'');
  const [selected,setSelected]=useState(null);
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
  const today=isoToday();

  useEffect(()=>localStorage.setItem('veille-tests',JSON.stringify(tests)),[tests]);
  useEffect(()=>localStorage.setItem('veille-history',JSON.stringify(history)),[history]);
  useEffect(()=>localStorage.setItem('veille-saved',JSON.stringify(saved)),[saved]);
  useEffect(()=>localStorage.setItem('veille-manual-news',JSON.stringify(manualNews)),[manualNews]);
  useEffect(()=>localStorage.setItem('veille-media-access',JSON.stringify(mediaAccess)),[mediaAccess]);
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
    if(!reminderEnabled || notifStatus!=='granted') return;
    const timer=setInterval(()=>{
      const now=new Date();
      const hh=String(now.getHours()).padStart(2,'0');
      const mm=String(now.getMinutes()).padStart(2,'0');
      const key=`veille-last-reminder-${today}`;
      if(`${hh}:${mm}`===reminderTime && localStorage.getItem(key)!=='1'){
        navigator.serviceWorker?.ready.then(reg=>reg.showNotification('IHECS Test Actus',{body:'Petit rappel : fais 10 minutes de révision de l’actu.',icon:'/icon.svg',badge:'/icon.svg',tag:'daily-revision'}));
        localStorage.setItem(key,'1');
      }
    },30000);
    return()=>clearInterval(timer);
  },[reminderEnabled,reminderTime,notifStatus,today]);

  const loadNews=async()=>{
    setLoading(true); setError('');
    try{
      const r=await fetch('/api/news?days=120');
      if(!r.ok) throw new Error(`Erreur ${r.status}`);
      const data=await r.json();
      setNews(data.items||[]); setSourceStatus(data.sources||[]);
      try{
        const sr=await fetch('/api/community-news');
        if(sr.ok){
          const rows=await sr.json();
          setSharedNews((Array.isArray(rows)?rows:[]).map(x=>({id:`shared-${x.id||x.created_at}`,title:x.title,description:x.description||'',summaryShort:x.summary_short||'',summaryLong:x.summary_long||'',context:x.context||'',category:x.category||'Belgique / Société',source:x.source||'Ajout partagé',url:x.url,image:x.image||'',date:x.created_at||new Date().toISOString(),quizPrompt:x.quiz_prompt||'',quizAnswer:x.quiz_answer||'',shared:true})));
        }
      }catch{}
    }catch(e){ setError("Impossible de charger les flux d'actualité pour le moment."); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{loadNews()},[]);

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
    const all=[...manualNews,...sharedNews,...news];
    const seen=new Set();
    return all.filter(n=>{ const k=(n.url||n.title||n.id).toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });
  },[manualNews,sharedNews,news]);

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
  const filtered=useMemo(()=>combinedNews.filter(n=>{
    const q=query.toLowerCase().trim();
    const dateOk=!filterSince || (n.date||'').slice(0,10)>=filterSince;
    return dateOk && (category==='Toutes'||n.category===category) && (!q||`${n.title} ${n.description} ${n.source}`.toLowerCase().includes(q));
  }),[combinedNews,query,category,filterSince]);
  const relatedToSelected=useMemo(()=>{
    if(!selected) return [];
    return combinedNews
      .filter(n=>n.id!==selected.id && new Date(n.date||0)>=new Date(selected.date||0))
      .map(n=>({n,score:relatedScore(selected,n)}))
      .filter(x=>x.score>=2)
      .sort((a,b)=>b.score-a.score || new Date(b.n.date)-new Date(a.n.date))
      .slice(0,6).map(x=>x.n);
  },[selected,combinedNews]);

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

  const makeFact=(item)=>{
    // v3.4 : si l'article ne permet pas une question nette avec une réponse vérifiable,
    // il n'entre pas dans le test de Mr Gras. Pas de question vague pour remplir artificiellement 12 cartes.
    if(!item?.title || badQuizTitle(item.title)) return null;
    if(item.quizPrompt && item.quizAnswer && validShortAnswer(item.quizAnswer)){
      return {question:item.quizPrompt,answer:cleanAnswerText(item.quizAnswer),type:'text',answerKind:'event',quality:8};
    }
    const t=cleanTitle(item.title||'');
    const d=(item.summaryShort||item.description||'').replace(/\s+/g,' ').trim();
    let m;

    // Citation + personnalité clairement nommée : on teste la personne, pas la citation.
    if((m=t.match(/(?:premiers?|premières?)\s+mots?\s+de\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})\s+(?:aux|à l['’]|au)\s+([^()–—:]{3,60})/i))){
      const person=cleanAnswerText(m[1]), group=cleanAnswerText(m[2]);
      return {question:`Quelle personnalité a livré ses premiers mots ${/^(diables|red|équipe)/i.test(group)?'aux':'à'} ${group} dans cette actualité ?`,answer:person,type:'entity',answerKind:'person',quality:9};
    }

    // Grèves / mouvements sociaux : acteur ou lieu structurant, jamais micro-chiffres.
    if((m=t.match(/(?:gr[eè]ve|mouvement social|arr[eê]t de travail).*?\bchez\s+([^:;,–—-]{2,55})/i))){
      const actor=cleanAnswerText(m[1]);
      if(validShortAnswer(actor)) return {question:`Quelle entreprise ou organisation est directement concernée par la grève évoquée dans cette actualité ?`,answer:actor,type:'entity',answerKind:'organisation',quality:9};
    }
    if((m=t.match(/\ba[ée]roport de\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’ -]{2,35})/))){
      const place=cleanAnswerText(m[1].replace(/\s+(?:pr[eé]voit|annonce|sera|est|a)\b.*$/i,''));
      if(validShortAnswer(place)) return {question:`Quel aéroport belge est directement concerné par cette actualité ?`,answer:place,type:'entity',answerKind:'place',quality:8};
    }

    // Prix / récompenses / victoires : format très proche d'un vrai QCM d'actu.
    if((m=t.match(/^(.+?)\s+(?:remporte|gagne|reçoit|décroche|obtient)\s+(.+)$/i))){
      const subject=cleanAnswerText(m[1]), prize=cleanAnswerText(m[2]);
      if(validShortAnswer(prize)) return {question:`Quelle récompense, distinction ou victoire est associée à « ${subject} » ?`,answer:prize,type:'text',answerKind:'award',quality:9};
    }

    // Nominations / nouvelles fonctions.
    if((m=t.match(/^(.+?)\s+(?:est nommé|est nommée|devient|est élu|est élue|est désigné|est désignée)\s+(.+)$/i))){
      const person=cleanAnswerText(m[1]), role=cleanAnswerText(m[2]);
      if(validShortAnswer(person)&&validShortAnswer(role)) return {question:`Quelle nouvelle fonction ou responsabilité est attribuée à ${person} ?`,answer:role,type:'text',answerKind:'role',quality:9};
    }

    // Relations diplomatiques ou accords entre deux acteurs clairement identifiés.
    if((m=t.match(/^(?:La |Le |L’|L'|Les )?([A-ZÀ-ÖØ-Ý][^,:;]{1,35}?)\s+et\s+([A-ZÀ-ÖØ-Ý][^,:;]{1,35}?)\s+(rétablissent|signent|annoncent|concluent|adoptent|lancent|décident|ouvrent|ferment)\b/i))){
      const a=cleanAnswerText(m[1]), b=cleanAnswerText(m[2]), action=m[3].toLowerCase();
      if(validShortAnswer(a)&&validShortAnswer(b)) return {question:`Quels sont les deux acteurs directement concernés par l'actualité où ils ${action} une mesure ou un accord ?`,answer:`${a} et ${b}`,type:'entity-pair',answerKind:'pair',quality:9};
    }

    // Après un contexte avant « : », on analyse le fait principal séparément.
    const core=(t.includes(':')?t.split(':').slice(1).join(':').trim():t).replace(/^['"“”]+|['"“”]+$/g,'').trim();

    // « L'Iran a communiqué / annoncé / décidé... » -> qui ?
    if((m=core.match(/^(?:La |Le |L’|L'|Les )?([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’ .-]{2,45}?)\s+(?:a |ont )?(communiqué|annoncé|annoncent|décidé|décident|adopté|adoptent|confirmé|confirment|signé|signent|rouvert|rouvrent|fermé|ferment)\b/i))){
      const actor=cleanAnswerText(m[1]);
      if(validShortAnswer(actor)) return {question:`Quel acteur est à l'origine de l'annonce ou de la décision décrite dans cette actualité ?`,answer:actor,type:'entity',answerKind:'organisation',quality:8};
    }

    // Lancement / présentation : qui est à l'origine ?
    if((m=core.match(/^(.+?)\s+(?:lance|présente|dévoile|publie)\s+(.+)$/i))){
      const actor=cleanAnswerText(m[1]), object=cleanAnswerText(m[2]);
      if(validShortAnswer(actor)&&object.length>=8) return {question:`Qui est à l’origine de « ${object} » ?`,answer:actor,type:'entity',answerKind:'organisation',quality:9};
    }

    // Décision / annonce avec acteur simple. On rejette les débuts éditoriaux (« du changement... »).
    if((m=core.match(/^(.+?)\s+(?:annonce|confirme|décide|adopte|approuve|rejette|suspend|supprime|autorise|interdit)\s+(.+)$/i))){
      const actor=cleanAnswerText(m[1]), decision=cleanAnswerText(m[2]);
      if(validShortAnswer(actor) && actor.length<=55 && !/^(du|de la|un|une)\s+(changement|nouveau|nouvelle|rebondissement)/i.test(actor) && decision.length>=10){
        return {question:`Quel acteur a annoncé ou pris la décision décrite dans cette actualité ?`,answer:actor,type:'entity',answerKind:'organisation',quality:8};
      }
    }

    // Arrivée / départ d'une personne : on teste la personne ou l'organisation si le titre est explicite.
    if((m=core.match(/(?:arrivée|arrive|rejoint)\s+(?:de\s+)?([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3})\s+(?:chez|à|au)\s+([^,;:–—]{2,50})/i))){
      const person=cleanAnswerText(m[1]), org=cleanAnswerText(m[2]);
      if(validShortAnswer(person)&&validShortAnswer(org)) return {question:`Quelle personnalité rejoint ${org} dans cette actualité ?`,answer:person,type:'entity',answerKind:'person',quality:8};
    }

    // Pas de fallback « Que faut-il retenir ? ». Si on ne sait pas poser une question précise, on saute l'article.
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
    if(q.includes('aéroport')) return ['Brussels Airport','Aéroport de Liège','Aéroport d’Ostende','Aéroport de Charleroi'].filter(x=>x.toLowerCase()!==a);
    if(q.includes('entreprise')||q.includes('organisation')){
      if(/orange|digi|proximus|telenet|télécom|telecom/.test((fact.item?.title||'')+' '+a)) return ['Orange Belgium','Proximus','Telenet','Digi Belgium'].filter(x=>x.toLowerCase()!==a);
      if(/skeyes|aéroport|aviation|vol/.test((fact.item?.title||'')+' '+a)) return ['Skeyes','Brussels Airport Company','Eurocontrol','Ryanair'].filter(x=>x.toLowerCase()!==a);
    }
    return [];
  };
  const buildOptions=(fact,facts)=>{
    if(!['entity','entity-pair','text'].includes(fact.type)) return [];
    const answer=shortOption(fact.answer);
    if(!answer) return [];
    const curated=curatedDistractors(fact).map(shortOption).filter(Boolean);
    const sameKind=facts
      .filter(x=>x!==fact && x.answerKind===fact.answerKind)
      .map(x=>shortOption(x.answer))
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

  const buildDeck=(count=20,mode='gras')=>{
    setPhotoDeckMessage('');
    const base=(relevantNews.length?relevantNews:combinedNews).filter(n=>n.title);
    if(!base.length) return;
    // On évite à la fois les mêmes ARTICLES et les mêmes SUJETS vus récemment.
    let pool=base.filter(n=>!recentTestIds.includes(n.id||n.url) && !recentTopicKeys.includes(topicKey(n)));
    if(pool.length<Math.min(count*2,base.length)) pool=base.filter(n=>!recentTopicKeys.includes(topicKey(n)));
    if(pool.length<Math.min(count,base.length)) pool=base;
    const items=pickDiverseItems(pool,Math.min(Math.max(count*5,60),pool.length),[],recentTopicKeys.slice(-18));
    const facts=items.map(item=>{const fact=withLead(item,makeFact(item));return fact?{item,...fact,topicKey:topicKey(item)}:null}).filter(Boolean);
    let cards;
    if(mode==='leconte'){
      cards=shuffle(facts.filter(x=>x.item.image)).slice(0,Math.min(count,facts.length)).map(x=>({...x,kind:'photo'}));
    }else{
      // Une seule question par sujet dans la session, même si plusieurs médias parlent du même événement.
      const seenTopics=new Set();
      const reliable=shuffle(facts.filter(x=>x.quality>=8)).filter(f=>{
        if(!f.topicKey || seenTopics.has(f.topicKey)) return false;
        seenTopics.add(f.topicKey); return true;
      });
      cards=[];
      for(const fact of reliable){
        const options=fact.quality>=6?buildOptions(fact,reliable):[];
        cards.push({...fact,kind:options.length===4?'mcq':'flash',options});
        if(cards.length>=count) break;
      }
      cards=shuffle(cards);
    }
    setRecentTestIds(ids=>[...ids,...cards.map(c=>c.item.id||c.item.url)].slice(-60));
    setRecentTopicKeys(keys=>[...keys,...cards.map(c=>c.topicKey||topicKey(c.item)).filter(Boolean)].slice(-40));
    setDeck(cards); setDeckIndex(0); setFlashRevealed(false); setDeckStats({ok:0,review:0}); setQuiz(null); setQuizAnswer(''); setQuizResult(null); setPhotoAnswer('');
  };
  const makeQuiz=()=>buildDeck(20,'gras');
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

  const requestNotifications=async()=>{
    if(typeof Notification==='undefined'){setNotifStatus('unsupported');return}
    const p=await Notification.requestPermission(); setNotifStatus(p);
    if(p==='granted') setReminderEnabled(true);
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
      <nav>{nav.map(([x,icon])=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}><span>{icon}</span>{x}</button>)}</nav>
      <div className="sideFoot"><span className={`dot ${error?'bad':loading?'wait':'ok'}`}></span>{loading?'Actualisation…':error?'Flux indisponible':'Veille en direct'}</div>
    </aside>

    <main>
      <header className="topbar"><div><p className="eyebrow">IHECS Test Actus <span className="versionBadge">{APP_VERSION}</span></p><h1>{tab}</h1></div><button className="iconBtn" onClick={loadNews} title="Actualiser">↻</button></header>

      {tab==='Accueil'&&<>
        <section className="hero">
          <div><span className="liveBadge"><i/> ACTUALITÉ EN DIRECT</span><h2>Si j’avais un test demain</h2><p>L’app garde la matière depuis le dernier test surprise de Mr Gras et de Mr Leconte.</p><div className="heroMeta"><strong>{relevantNews.length}</strong> actus récupérées depuis la période la plus ancienne · <strong>{sourceStatus.filter(s=>s.ok).length}</strong> sources actives</div></div>
          <button className="lightBtn" onClick={()=>{setTab('Tests fictifs');makeQuiz()}}>Faire un test blanc →</button>
        </section>

        <section><div className="sectionTitle"><div><p className="eyebrow">Périodes automatiques</p><h2>Mes profs</h2></div></div>
          <div className="profGrid">{profs.map(p=><article className="profCard" key={p.key}>
            <div className="profTop"><span className="number">{p.key==='qcm'?'01':'02'}</span><span className="softPill">{p.label}</span></div>
            <h3>{p.name}</h3><p className="muted">{p.type}</p>
            <div className="testDateLine"><span>Dernier test</span><strong>{fmt(tests[p.key])}</strong></div>
            <div className="period"><span>Matière actuelle</span><strong>{fmt(nextDay(tests[p.key]),true)} → aujourd’hui</strong><small>{daysBetween(nextDay(tests[p.key]),today)+1} jours d’actualité</small></div>
            {editingTestDate===p.key&&<div className="dateEditor"><label>📌 Corriger la date du test<input type="date" max={today} value={testDateDraft} onChange={e=>setTestDateDraft(e.target.value)}/></label><div><button onClick={()=>saveTestDate(p.key)} disabled={!testDateDraft||testDateDraft>today}>Enregistrer</button><button className="secondary" onClick={()=>setEditingTestDate(null)}>Annuler</button></div></div>}
            <div className="actions"><button onClick={()=>setTab('Révisions')}>Réviser</button><button className="secondary" onClick={()=>markTest(p.key)}>J’ai eu un test aujourd’hui</button><button className="pinDateBtn" onClick={()=>openTestDateEditor(p.key)}>📌 Modifier la date</button></div>
          </article>)}</div>
        </section>

        <section className="reminderCard"><div><p className="eyebrow">Rappel quotidien</p><h2>Réviser sur téléphone</h2><p>Installe l’app puis choisis l’heure à laquelle tu veux recevoir ton rappel.</p></div><div className="reminderControls"><input type="time" value={reminderTime} onChange={e=>setReminderTime(e.target.value)}/>{notifStatus!=='granted'?<button onClick={requestNotifications}>Activer les notifications</button>:<label className="switchLabel"><input type="checkbox" checked={reminderEnabled} onChange={e=>setReminderEnabled(e.target.checked)}/> Rappel actif</label>}{!installed&&installPrompt&&<button className="secondary" onClick={installApp}>Installer l’app</button>}</div><small className="reminderNote">Version actuelle : le rappel fonctionne quand l’app ou son service est actif. La notification fiable même app fermée sera branchée au serveur dans l’étape suivante.</small></section>

        <section><div className="sectionTitle"><div><p className="eyebrow">À surveiller</p><h2>Dernières actualités</h2></div><button className="textBtn" onClick={()=>setTab('Actualités')}>Tout voir →</button></div>
          {loading?<Skeleton/>:error?<Empty text={error}/>:<div className="headlineList">{combinedNews.slice(0,7).map((n,i)=><NewsRow key={n.id} n={n} index={i+1} onOpen={()=>setSelected(n)} saved={saved.includes(n.id)} onSave={()=>toggleSaved(n.id)}/>)}</div>}
        </section>
      </>}

      {tab==='Actualités'&&<section className="noTop">
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
        <div className="sourceStrip"><strong>Sources suivies</strong>{sourceStatus.map(s=><span key={s.name} className={s.ok?'sourceOk':'sourceOff'}>{s.name}</span>)}</div>
        <div className="resultCount">{filtered.length} actualité{filtered.length>1?'s':''}{filterSince?' dans cette période':''}</div>
        {loading?<Skeleton/>:error?<Empty text={error}/>:filtered.length===0?<Empty text="Aucune actualité trouvée pour cette période."/>:<div className="newsGrid">{filtered.map(n=><NewsCard key={n.id} n={n} onOpen={()=>setSelected(n)} saved={saved.includes(n.id)} onSave={()=>toggleSaved(n.id)}/>)}</div>}
      </section>}

      {tab==='Ajouter'&&<section className="noTop">
        <div className="revisionIntro"><div><p className="eyebrow">Ajout manuel</p><h2>Ajouter une actualité</h2><p>Colle un lien : l’app récupère ce qui est publiquement accessible, résume, classe et ajoute l’info à tes révisions. Pour un article réservé aux abonnés, colle aussi le texte auquel tu as accès.</p></div></div>
        <div className="addGrid">
          <article className="addCard"><label>Lien de l’article</label><input type="url" value={addUrl} onChange={e=>setAddUrl(e.target.value)} placeholder="https://…"/><label>Texte de l’article <span>(optionnel — utile pour un paywall)</span></label><textarea value={addText} onChange={e=>setAddText(e.target.value)} placeholder="Si tu es abonné, tu peux coller ici le texte de l’article pour que l’app l’analyse sans contourner le paywall."/><button className="submit" disabled={!addUrl.trim()||analyzing} onClick={analyzeLink}>{analyzing?'Analyse en cours…':'Analyser le lien'}</button>{addMessage&&<p className="statusMsg">{addMessage}</p>}</article>
          <article className="addCard mediaCard"><p className="eyebrow">Mes accès médias</p><h3>Abonnements</h3><p className="muted">L’app ne stocke jamais tes mots de passe et ne contourne aucun paywall. Indique seulement les médias auxquels tu es abonné pour te rappeler que tu peux coller le texte d’un article payant.</p>{['Le Soir','La Libre','La DH','Le Vif'].map(m=><label className="mediaToggle" key={m}><input type="checkbox" checked={!!mediaAccess[m]} onChange={e=>setMediaAccess(x=>({...x,[m]:e.target.checked}))}/><span>{m}</span><small>{mediaAccess[m]?'Abonnement indiqué':'Non indiqué'}</small></label>)}</article>
        </div>
        {draft&&<article className="draftCard"><div className="draftTop"><span className="softPill">{draft.category}</span><span className="softPill">{draft.source}</span></div><h2>{draft.title}</h2>{draft.image&&<img className="draftImage" src={draft.image} alt="Illustration de l’article"/>}<label>Résumé</label><textarea value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/><label>Contexte</label><textarea value={draft.context||''} onChange={e=>setDraft(d=>({...d,context:e.target.value}))}/><label>Question proposée pour Mr Gras</label><input value={draft.quizPrompt||''} onChange={e=>setDraft(d=>({...d,quizPrompt:e.target.value}))}/><label>Réponse attendue</label><input value={draft.quizAnswer||''} onChange={e=>setDraft(d=>({...d,quizAnswer:e.target.value}))}/><label className="shareToggle"><input type="checkbox" checked={shareGlobal} onChange={e=>setShareGlobal(e.target.checked)}/><span><strong>Partager à tous les utilisateurs</strong><small>Nécessite la base partagée Supabase. Sinon l’info reste enregistrée sur ton appareil.</small></span></label><div className="draftActions"><button className="submit" onClick={saveDraft}>Valider et ajouter</button><a className="secondaryLink" href={draft.url} target="_blank" rel="noreferrer">Vérifier la source ↗</a></div></article>}
      </section>}

      {tab==='Révisions'&&<section className="noTop">
        <div className="revisionIntro"><div><p className="eyebrow">Révision intelligente</p><h2>Choisis ton mode</h2><p>Les exercices portent sur le contenu de l’actualité, jamais sur le nom du média qui a publié l’article.</p></div></div>
        <div className="modeGrid"><button className="mode" onClick={()=>{setTab('Tests fictifs');buildDeck(20,'gras')}}><span>JUSQU’À 20 QUESTIONS · 1 SUJET = 1 QUESTION</span><strong>Session Mr Gras</strong><small>Sujets variés, sans répétition de la même actualité dans la session</small></button><button className="mode" onClick={()=>{setTab('Tests fictifs');makePhotoTest()}}><span>6 PHOTOS</span><strong>Session Mr Leconte</strong><small>Photo → expliquer l’actualité</small></button><button className="mode" onClick={()=>{setTab('Actualités');setCategory('Toutes')}}><span>ACTU</span><strong>Revoir les fiches</strong><small>{relevantNews.length} éléments dans la période</small></button><button className="mode" onClick={()=>{setTab('Actualités');setQuery('')}}><span>★</span><strong>Mes articles sauvegardés</strong><small>{saved.length} sauvegardés</small></button></div>
      </section>}

      {tab==='Tests fictifs'&&<section className="noTop">
        <div className="examHeader"><div><p className="eyebrow">Mode entraînement</p><h2>Test d’actu fictif</h2><p className="muted">Mr Gras : uniquement des questions précises avec une réponse identifiable. Les articles qui ne permettent pas de fabriquer une bonne question sont écartés. Les sujets sont mélangés à chaque session et les sujets récemment vus sont évités. Mr Leconte : photos tirées d’autres actualités quand c’est possible.</p></div><div className="examBtns"><button onClick={()=>buildDeck(20,'gras')}>Jusqu’à 12 questions · Mr Gras</button><button className="secondary" onClick={makePhotoTest} disabled={photoDeckLoading}>{photoDeckLoading?'Recherche des photos…':'6 photos · Mr Leconte'}</button></div></div>
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
            {!quizResult?<button className="submit" disabled={photoAnswer.trim().length<15} onClick={()=>setQuizResult(true)}>Voir la correction</button>:<div className="correction"><span>Réponse attendue</span><h3>{c.item.title}</h3><p>{c.item.description||c.answer}</p>{c.item.context&&<p className="muted">Contexte : {c.item.context}</p>}<div className="correctionLinks"><button className="textBtn left" onClick={()=>setSelected(c.item)}>Voir la fiche d’actu →</button><a href={c.item.url} target="_blank" rel="noreferrer">Article source ↗</a></div></div>}
          </>:c.kind==='mcq'?<>
            <span className="cardCategory">{c.item.category}</span>
            <h3>{c.question}</h3>
            <div className="answers">{c.options.map(opt=><button key={opt} className={quizAnswer===opt?'chosen':''} disabled={quizResult!==null} onClick={()=>setQuizAnswer(opt)}>{opt}</button>)}</div>
            {quizResult===null?<button className="submit" disabled={!quizAnswer} onClick={()=>setQuizResult(quizAnswer===c.answer)}>Valider ma réponse</button>:<div className={`feedback ${quizResult?'good':'wrong'}`}><strong>{quizResult?'Bonne réponse.':'Mauvaise réponse.'}</strong><p>Réponse : <b>{c.answer}</b></p>{c.item.description&&<p>{c.item.description}</p>}<div className="correctionLinks"><button className="textBtn left" onClick={()=>setSelected(c.item)}>Voir la fiche d’actu →</button><a href={c.item.url} target="_blank" rel="noreferrer">Article source ↗</a></div></div>}
          </>:<>
            <span className="cardCategory">{c.item.category}</span>
            {c.lead&&<div className="questionContext"><span>Contexte de la question</span><p>{c.lead}</p></div>}
            <h3>{c.question}</h3>
            {!flashRevealed?<div className="flashHidden"><p>Donne une réponse précise avant de retourner la carte.</p><button className="submit" onClick={()=>setFlashRevealed(true)}>Voir la réponse</button></div>:<div className="flashAnswer"><span>Réponse attendue</span><h3>{c.answer}</h3>{c.item.description&&c.answer!==c.item.description&&<p>{c.item.description}</p>}{c.item.context&&<p className="muted">Contexte : {c.item.context}</p>}<div className="correctionLinks"><button className="textBtn left" onClick={()=>setSelected(c.item)}>Voir la fiche d’actu →</button><a href={c.item.url} target="_blank" rel="noreferrer">Article source ↗</a></div></div>}
          </>}
          {(flashRevealed||quizResult!==null)&&<div className="deckActions"><button className="review" onClick={()=>nextCard('review')}>À revoir</button><button className="know" onClick={()=>nextCard('ok')}>Je maîtrise →</button></div>}
        </article>})()}
        {deck.length>0&&deckIndex>=deck.length&&<article className="examCard resultCard"><p className="eyebrow">Session terminée</p><h3>{deckStats.ok} maîtrisée{deckStats.ok>1?'s':''} · {deckStats.review} à revoir</h3><p>Relance une session : les cartes sont tirées dans l’actualité de ta période de test.</p><button className="submit" onClick={()=>buildDeck(20,'gras')}>Relancer une session</button></article>}
      </section>}

      {tab==='Mes tests'&&<section className="noTop">
        <div className="testGrid">{profs.map(p=><article className="settingsCard" key={p.key}><span className="softPill">{p.label}</span><h2>{p.name}</h2><label>Date du dernier test d’actu</label><input type="date" value={tests[p.key]} max={today} onChange={e=>setTests(t=>({...t,[p.key]:e.target.value}))}/><div className="period compact"><span>Actualités à connaître depuis</span><strong>{fmt(nextDay(tests[p.key]))} → aujourd’hui</strong></div><button onClick={()=>markTest(p.key)}>Enregistrer un test aujourd’hui</button></article>)}</div>
        <div className="sectionTitle historyTitle"><div><p className="eyebrow">Archives</p><h2>Historique des tests</h2></div></div>{history.length===0?<Empty text="Aucun test archivé pour l’instant."/>:<div className="historyList">{history.map(h=><div key={h.id} className="historyItem"><div><strong>{h.prof==='qcm'?'Mr Gras — QCM':'Mr Leconte — Photo'}</strong><span>Test du {fmt(h.date)}</span></div><p>Matière archivée : {fmt(h.from)} → {fmt(h.to)}</p></div>)}</div>}
      </section>}
    </main>

    {selected&&(()=>{const sum=displaySummaries(selected);return <div className="modalBack" onClick={()=>setSelected(null)}><article className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}>×</button><div className="modalMeta"><span>{selected.category}</span><span>{selected.source}</span><span>{fmt(selected.date)}</span>{selected.manual&&<span>Ajout manuel</span>}{selected.shared&&<span>Partagé</span>}</div><h2>{selected.title}</h2><SmartImage item={selected} className="modalImage" alt="Illustration de l’actualité"/><div className="summaryStack"><div className="factBox summaryShort"><span>Résumé express</span><p>{sum.short||"Résumé indisponible pour le moment."}</p></div><div className="factBox summaryLong"><span>Résumé clair</span><p>{sum.long||sum.short}</p></div></div>{selected.context&&<><h3>Contexte</h3><p className="muted">{selected.context}</p></>}<h3>Source originale</h3><p className="muted">Les résumés servent à réviser. Pour vérifier un détail, une citation ou un chiffre, ouvre toujours l’article du média.</p>
        {relatedToSelected.length>0&&<div className="topicFollow"><div className="topicFollowHead"><span>Suivi du sujet</span><h3>Lire les articles liés et plus récents</h3><p>Cette actualité peut évoluer. Voici d’autres articles portant sur le même sujet, y compris chez d’autres médias.</p></div><div className="relatedList">{relatedToSelected.map(r=><article key={r.id} className="relatedItem"><div><span>{r.source} · {fmt(r.date,true)}</span><strong>{r.title}</strong></div><div className="relatedActions"><button className="textBtn left" onClick={()=>setSelected(r)}>Voir la fiche</button><a href={r.url} target="_blank" rel="noreferrer">Lire l’article lié ↗</a></div></article>)}</div></div>}
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

function NewsRow({n,index,onOpen,saved,onSave}){return <article className="headline"><span className="rank">{String(index).padStart(2,'0')}</span><div className="headlineBody" onClick={onOpen}><div className="meta"><b>{n.source}</b><span>{n.category}</span><span>{fmt(n.date,true)}</span></div><h3>{n.title}</h3></div><button className="saveBtn" onClick={onSave}>{saved?'★':'☆'}</button></article>}
function NewsCard({n,onOpen,saved,onSave}){const sum=displaySummaries(n);return <article className="newsCard"><SmartImage item={n} className="newsCardImage" alt="Illustration de l’actualité"/><div className="cardMeta"><span>{n.source}</span><span>{fmt(n.date,true)}</span></div><button className="saveBtn floating" onClick={onSave}>{saved?'★':'☆'}</button><div className="categoryLine">{n.category}</div><h3 onClick={onOpen}>{n.title}</h3><p>{sum.short||'Ouvrir la fiche pour accéder à la source.'}</p><button className="textBtn left" onClick={onOpen}>Voir la fiche →</button></article>}
function Feedback({ok,item}){return <div className={`feedback ${ok?'good':'wrong'}`}><strong>{ok?'Bonne réponse.':'Pas cette fois.'}</strong><p>À retenir : <b>{item.title}</b></p><a href={item.url} target="_blank" rel="noreferrer">Revoir l’actualité ↗</a></div>}
function Skeleton(){return <div className="skeletonWrap">{[1,2,3,4].map(i=><div className="skeleton" key={i}/>)}</div>}
function Empty({text}){return <div className="empty"><div>—</div><p>{text}</p></div>}

createRoot(document.getElementById('root')).render(<App/>);

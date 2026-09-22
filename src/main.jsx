import React, {useEffect, useMemo, useState} from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const APP_VERSION='v3.1';
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
  const [selected,setSelected]=useState(null);
  const [quiz,setQuiz]=useState(null);
  const [quizAnswer,setQuizAnswer]=useState('');
  const [quizResult,setQuizResult]=useState(null);
  const [deck,setDeck]=useState([]);
  const [deckIndex,setDeckIndex]=useState(0);
  const [flashRevealed,setFlashRevealed]=useState(false);
  const [deckStats,setDeckStats]=useState({ok:0,review:0});
  const [photoAnswer,setPhotoAnswer]=useState('');
  const [saved,setSaved]=useState(()=>safeJson('veille-saved',[]));
  const [reminderTime,setReminderTime]=useState(()=>localStorage.getItem('veille-reminder-time')||'19:00');
  const [reminderEnabled,setReminderEnabled]=useState(()=>localStorage.getItem('veille-reminder-enabled')==='1');
  const [notifStatus,setNotifStatus]=useState(typeof Notification==='undefined'?'unsupported':Notification.permission);
  const [installPrompt,setInstallPrompt]=useState(null);
  const [installed,setInstalled]=useState(()=>window.matchMedia?.('(display-mode: standalone)').matches||false);
  const today=isoToday();

  useEffect(()=>localStorage.setItem('veille-tests',JSON.stringify(tests)),[tests]);
  useEffect(()=>localStorage.setItem('veille-history',JSON.stringify(history)),[history]);
  useEffect(()=>localStorage.setItem('veille-saved',JSON.stringify(saved)),[saved]);
  useEffect(()=>localStorage.setItem('veille-manual-news',JSON.stringify(manualNews)),[manualNews]);
  useEffect(()=>localStorage.setItem('veille-media-access',JSON.stringify(mediaAccess)),[mediaAccess]);
  useEffect(()=>localStorage.setItem('veille-reminder-time',reminderTime),[reminderTime]);
  useEffect(()=>localStorage.setItem('veille-reminder-enabled',reminderEnabled?'1':'0'),[reminderEnabled]);

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
  const filtered=useMemo(()=>combinedNews.filter(n=>{
    const q=query.toLowerCase().trim();
    return (category==='Toutes'||n.category===category) && (!q||`${n.title} ${n.description} ${n.source}`.toLowerCase().includes(q));
  }),[combinedNews,query,category]);

  const toggleSaved=id=>setSaved(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);

  const cleanTitle=(value='')=>value
    .replace(/\s+[–—-]\s+(RTBF|RTL info|La Libre|Le Soir|BX1|La DH|DHnet|Le Vif|L'Avenir|Sudinfo).*$/i,'')
    .replace(/\s+/g,' ').trim();

  const makeFact=(item)=>{
    // Une question de test d'actu doit porter sur le fait essentiel : acteur, fonction, décision, lieu, prix ou événement.
    // Les micro-chiffres (nombre de vols, victimes, euros, etc.) ne deviennent jamais automatiquement une question.
    if(item.quizPrompt && item.quizAnswer) return {question:item.quizPrompt,answer:item.quizAnswer,type:'text',answerKind:'event',quality:6};
    const t=cleanTitle(item.title||'');
    const d=(item.description||'').replace(/\s+/g,' ').trim();
    let m;

    // Grèves / mouvements sociaux : on teste l'acteur concerné, pas le nombre de perturbations.
    if((m=t.match(/(?:gr[eè]ve|mouvement social|arr[eê]t de travail).*?\bchez\s+([^:;,–—-]{2,55})/i))){
      const actor=m[1].trim();
      return {question:`Quelle entreprise ou organisation est directement concernée par cette grève ?`,answer:actor,type:'entity',answerKind:'organisation',quality:7};
    }
    if((m=t.match(/\ba[ée]roport de\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’ -]{2,35})/))){
      const place=m[1].trim().replace(/\s+(?:pr[eé]voit|annonce|sera|est|a)\b.*$/i,'').trim();
      return {question:`Quel aéroport belge est au cœur de cette actualité ?`,answer:place,type:'entity',answerKind:'place',quality:6};
    }

    // Prix / récompenses / compétitions.
    if((m=t.match(/^(.+?)\s+(?:remporte|gagne|reçoit|décroche|obtient)\s+(.+)$/i))){
      const subject=m[1].trim(), prize=m[2].trim().replace(/[.!?]+$/,'');
      return {question:`Quelle récompense, distinction ou victoire est associée à « ${subject} » ?`,answer:prize,type:'text',answerKind:'award',quality:7};
    }
    if((m=t.match(/^(.+?)\s+(?:est nommé|est nommée|devient|est élu|est élue|est désigné|est désignée)\s+(.+)$/i))){
      const person=m[1].trim(), role=m[2].trim().replace(/[.!?]+$/,'');
      return {question:`Quelle nouvelle fonction ou responsabilité concerne ${person} ?`,answer:role,type:'text',answerKind:'role',quality:7};
    }

    // Deux pays / deux acteurs liés par une décision diplomatique ou institutionnelle.
    if((m=t.match(/^(?:La |Le |L’|L'|Les )?([A-ZÀ-ÖØ-Ý][^,:;]{1,35}?)\s+et\s+([A-ZÀ-ÖØ-Ý][^,:;]{1,35}?)\s+(rétablissent|signent|annoncent|concluent|adoptent|lancent|décident|ouvrent|ferment)\b/i))){
      const a=m[1].trim(), b=m[2].trim(), action=m[3].toLowerCase();
      return {question:`Quels sont les deux acteurs au centre de cette actualité où ils ${action} une mesure ou un accord ?`,answer:`${a} et ${b}`,type:'entity-pair',answerKind:'pair',quality:7};
    }

    // Lancement / présentation : qui est à l'origine ?
    if((m=t.match(/^(.+?)\s+(?:lance|présente|dévoile|publie)\s+(.+)$/i))){
      const actor=m[1].trim(), object=m[2].trim();
      return {question:`Qui est à l’origine de « ${object} » ?`,answer:actor,type:'entity',answerKind:'organisation',quality:7};
    }

    // Décision / annonce : acteur identifiable.
    if((m=t.match(/^(.+?)\s+(?:annonce|confirme|décide|adopte|approuve|rejette|suspend|supprime|autorise|interdit)\s+(.+)$/i))){
      const actor=m[1].trim(), decision=m[2].trim();
      if(actor.length<=70) return {question:`Quel acteur est à l’origine de la décision suivante : « ${decision} » ?`,answer:actor,type:'entity',answerKind:'organisation',quality:6};
    }

    // « X : ... » → sujet clairement identifié. On demande le fait associé, jamais « quelle actu ? » sans repère.
    const parts=t.split(/\s*[:—–]\s*/).filter(Boolean);
    if(parts.length>=2 && parts[0].length>=3 && parts[0].length<=65){
      const subject=parts[0].trim();
      const event=parts.slice(1).join(' — ').trim();
      if(event.length>=12) return {question:`Quel événement important concerne « ${subject} » ?`,answer:event,type:'text',answerKind:'event',quality:4};
    }

    // Si le titre ne permet pas une vraie question autonome, on crée une flashcard guidée avec un sujet explicite.
    const subject=(t.match(/^([^,.;:—–]{4,70})/)||[])[1]?.trim();
    if(subject && d){
      return {question:`Que faut-il retenir au sujet de « ${subject} » ?`,answer:d.slice(0,280),type:'open',answerKind:'event',quality:3};
    }
    return {question:`Quel fait essentiel faut-il retenir de « ${t} » ?`,answer:d||t||'Information à revoir',type:'open',answerKind:'event',quality:2};
  };

  const shuffle=(arr)=>[...arr].sort(()=>Math.random()-.5);
  const buildOptions=(fact,facts)=>{
    if(!['entity','entity-pair','text'].includes(fact.type)) return [];
    const sameKind=facts
      .filter(x=>x!==fact && x.answer && x.answer!==fact.answer && x.answerKind===fact.answerKind && ['entity','entity-pair','text'].includes(x.type))
      .map(x=>x.answer);
    const broad=facts
      .filter(x=>x!==fact && x.answer && x.answer!==fact.answer && x.type===fact.type)
      .map(x=>x.answer);
    const pool=[...sameKind,...broad].filter(x=>x && x.length<170);
    const unique=[...new Set(pool)];
    if(unique.length<3) return [];
    return shuffle([fact.answer,...shuffle(unique).slice(0,3)]);
  };

  const buildDeck=(count=12,mode='gras')=>{
    const pool=(relevantNews.length?relevantNews:combinedNews).filter(n=>n.title);
    if(!pool.length) return;
    const shuffled=shuffle(pool).slice(0,Math.min(Math.max(count*6,60),pool.length));
    const facts=shuffled.map(item=>({item,...makeFact(item)})).sort((a,b)=>b.quality-a.quality);
    let cards;
    if(mode==='leconte'){
      cards=facts.filter(x=>x.item.image||x.item.url).slice(0,Math.min(count,facts.length)).map(x=>({...x,kind:'photo'}));
    }else{
      const reliable=facts.filter(x=>x.quality>=3);
      cards=reliable.map(fact=>{
        const options=fact.quality>=6?buildOptions(fact,reliable):[];
        return {...fact,kind:options.length===4?'mcq':'flash',options};
      }).slice(0,Math.min(count,reliable.length));
    }
    setDeck(cards); setDeckIndex(0); setFlashRevealed(false); setDeckStats({ok:0,review:0}); setQuiz(null); setQuizAnswer(''); setQuizResult(null); setPhotoAnswer('');
  };
  const makeQuiz=()=>buildDeck(12,'gras');
  const makePhotoTest=()=>buildDeck(6,'leconte');
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
      setDraft({...data,quizPrompt:fp.question,quizAnswer:fp.answer});
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
          <div className="profGrid">{profs.map(p=><article className="profCard" key={p.key}><div className="profTop"><span className="number">{p.key==='qcm'?'01':'02'}</span><span className="softPill">{p.label}</span></div><h3>{p.name}</h3><p className="muted">{p.type}</p><div className="period"><span>Matière actuelle</span><strong>{fmt(nextDay(tests[p.key]),true)} → aujourd’hui</strong><small>{daysBetween(nextDay(tests[p.key]),today)+1} jours d’actualité</small></div><div className="actions"><button onClick={()=>setTab('Révisions')}>Réviser</button><button className="secondary" onClick={()=>markTest(p.key)}>J’ai eu un test aujourd’hui</button></div></article>)}</div>
        </section>

        <section className="reminderCard"><div><p className="eyebrow">Rappel quotidien</p><h2>Réviser sur téléphone</h2><p>Installe l’app puis choisis l’heure à laquelle tu veux recevoir ton rappel.</p></div><div className="reminderControls"><input type="time" value={reminderTime} onChange={e=>setReminderTime(e.target.value)}/>{notifStatus!=='granted'?<button onClick={requestNotifications}>Activer les notifications</button>:<label className="switchLabel"><input type="checkbox" checked={reminderEnabled} onChange={e=>setReminderEnabled(e.target.checked)}/> Rappel actif</label>}{!installed&&installPrompt&&<button className="secondary" onClick={installApp}>Installer l’app</button>}</div><small className="reminderNote">Version actuelle : le rappel fonctionne quand l’app ou son service est actif. La notification fiable même app fermée sera branchée au serveur dans l’étape suivante.</small></section>

        <section><div className="sectionTitle"><div><p className="eyebrow">À surveiller</p><h2>Dernières actualités</h2></div><button className="textBtn" onClick={()=>setTab('Actualités')}>Tout voir →</button></div>
          {loading?<Skeleton/>:error?<Empty text={error}/>:<div className="headlineList">{combinedNews.slice(0,7).map((n,i)=><NewsRow key={n.id} n={n} index={i+1} onOpen={()=>setSelected(n)} saved={saved.includes(n.id)} onSave={()=>toggleSaved(n.id)}/>)}</div>}
        </section>
      </>}

      {tab==='Actualités'&&<section className="noTop">
        <div className="toolbar"><div className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un sujet, une personne, un média…"/></div><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></div>
        <div className="sourceStrip"><strong>Sources suivies</strong>{sourceStatus.map(s=><span key={s.name} className={s.ok?'sourceOk':'sourceOff'}>{s.name}</span>)}</div>
        {loading?<Skeleton/>:error?<Empty text={error}/>:<div className="newsGrid">{filtered.map(n=><NewsCard key={n.id} n={n} onOpen={()=>setSelected(n)} saved={saved.includes(n.id)} onSave={()=>toggleSaved(n.id)}/>)}</div>}
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
        <div className="modeGrid"><button className="mode" onClick={()=>{setTab('Tests fictifs');buildDeck(12,'gras')}}><span>12 QUESTIONS</span><strong>Session Mr Gras</strong><small>QCM sur les faits essentiels + flashcards</small></button><button className="mode" onClick={()=>{setTab('Tests fictifs');makePhotoTest()}}><span>6 PHOTOS</span><strong>Session Mr Leconte</strong><small>Photo → expliquer l’actualité</small></button><button className="mode" onClick={()=>{setTab('Actualités');setCategory('Toutes')}}><span>ACTU</span><strong>Revoir les fiches</strong><small>{relevantNews.length} éléments dans la période</small></button><button className="mode" onClick={()=>{setTab('Actualités');setQuery('')}}><span>★</span><strong>Mes articles sauvegardés</strong><small>{saved.length} sauvegardés</small></button></div>
      </section>}

      {tab==='Tests fictifs'&&<section className="noTop">
        <div className="examHeader"><div><p className="eyebrow">Mode entraînement</p><h2>Test d’actu fictif</h2><p className="muted">Mr Gras : questions claires sur les acteurs, décisions, fonctions, lieux, récompenses et enjeux — pas sur des micro-chiffres. Mr Leconte : photos d’actualité à expliquer.</p></div><div className="examBtns"><button onClick={()=>buildDeck(12,'gras')}>12 questions · Mr Gras</button><button className="secondary" onClick={makePhotoTest}>6 photos · Mr Leconte</button></div></div>
        {deck.length===0&&<Empty text="Choisis une session Mr Gras ou Mr Leconte pour commencer."/>}
        {deck.length>0&&deckIndex<deck.length&&(()=>{const c=deck[deckIndex];return <article className="examCard flashExam">
          <div className="deckTop"><div className="questionNo">{c.kind==='photo'?'MR LECONTE · PHOTO':c.kind==='mcq'?'MR GRAS · QCM · UNE SEULE RÉPONSE':'MR GRAS · FLASHCARD'}</div><span>{deckIndex+1} / {deck.length}</span></div>
          <div className="progress"><i style={{width:`${((deckIndex+1)/deck.length)*100}%`}}/></div>
          {c.kind==='photo'?<>
            <SmartImage item={c.item} className="testPhoto" alt="Photo liée à l’actualité" fallback={<div className="photoUnavailable"><strong>Aucune photo exploitable pour cette actu.</strong><span>Passe à une autre photo.</span><button type="button" onClick={()=>nextCard('review')}>Question suivante</button></div>}/>
            <h3>Quelle actualité cette photo représente-t-elle ?</h3>
            <p className="hint">Explique le fait, les personnes ou institutions concernées et le contexte en quelques lignes.</p>
            <textarea value={photoAnswer} onChange={e=>setPhotoAnswer(e.target.value)} placeholder="Ta réponse…"/>
            {!quizResult?<button className="submit" disabled={photoAnswer.trim().length<15} onClick={()=>setQuizResult(true)}>Voir la correction</button>:<div className="correction"><span>Réponse attendue</span><h3>{c.item.title}</h3><p>{c.item.description||c.answer}</p>{c.item.context&&<p className="muted">Contexte : {c.item.context}</p>}</div>}
          </>:c.kind==='mcq'?<>
            <span className="cardCategory">{c.item.category}</span>
            <h3>{c.question}</h3>
            <div className="answers">{c.options.map(opt=><button key={opt} className={quizAnswer===opt?'chosen':''} disabled={quizResult!==null} onClick={()=>setQuizAnswer(opt)}>{opt}</button>)}</div>
            {quizResult===null?<button className="submit" disabled={!quizAnswer} onClick={()=>setQuizResult(quizAnswer===c.answer)}>Valider ma réponse</button>:<div className={`feedback ${quizResult?'good':'wrong'}`}><strong>{quizResult?'Bonne réponse.':'Mauvaise réponse.'}</strong><p>Réponse : <b>{c.answer}</b></p>{c.item.description&&<p>{c.item.description}</p>}</div>}
          </>:<>
            <span className="cardCategory">{c.item.category}</span>
            <h3>{c.question}</h3>
            {!flashRevealed?<div className="flashHidden"><p>Donne une réponse précise avant de retourner la carte.</p><button className="submit" onClick={()=>setFlashRevealed(true)}>Voir la réponse</button></div>:<div className="flashAnswer"><span>Réponse attendue</span><h3>{c.answer}</h3>{c.item.description&&c.answer!==c.item.description&&<p>{c.item.description}</p>}{c.item.context&&<p className="muted">Contexte : {c.item.context}</p>}</div>}
          </>}
          {(flashRevealed||quizResult!==null)&&<div className="deckActions"><button className="review" onClick={()=>nextCard('review')}>À revoir</button><button className="know" onClick={()=>nextCard('ok')}>Je maîtrise →</button></div>}
        </article>})()}
        {deck.length>0&&deckIndex>=deck.length&&<article className="examCard resultCard"><p className="eyebrow">Session terminée</p><h3>{deckStats.ok} maîtrisée{deckStats.ok>1?'s':''} · {deckStats.review} à revoir</h3><p>Relance une session : les cartes sont tirées dans l’actualité de ta période de test.</p><button className="submit" onClick={()=>buildDeck(12,'gras')}>Recommencer avec 12 questions</button></article>}
      </section>}

      {tab==='Mes tests'&&<section className="noTop">
        <div className="testGrid">{profs.map(p=><article className="settingsCard" key={p.key}><span className="softPill">{p.label}</span><h2>{p.name}</h2><label>Date du dernier test</label><input type="date" value={tests[p.key]} max={today} onChange={e=>setTests(t=>({...t,[p.key]:e.target.value}))}/><div className="period compact"><span>Prochaine matière</span><strong>{fmt(nextDay(tests[p.key]))} → aujourd’hui</strong></div><button onClick={()=>markTest(p.key)}>Enregistrer un test aujourd’hui</button></article>)}</div>
        <div className="sectionTitle historyTitle"><div><p className="eyebrow">Archives</p><h2>Historique des tests</h2></div></div>{history.length===0?<Empty text="Aucun test archivé pour l’instant."/>:<div className="historyList">{history.map(h=><div key={h.id} className="historyItem"><div><strong>{h.prof==='qcm'?'Mr Gras — QCM':'Mr Leconte — Photo'}</strong><span>Test du {fmt(h.date)}</span></div><p>Matière archivée : {fmt(h.from)} → {fmt(h.to)}</p></div>)}</div>}
      </section>}
    </main>

    {selected&&(()=>{const sum=displaySummaries(selected);return <div className="modalBack" onClick={()=>setSelected(null)}><article className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}>×</button><div className="modalMeta"><span>{selected.category}</span><span>{selected.source}</span><span>{fmt(selected.date)}</span>{selected.manual&&<span>Ajout manuel</span>}{selected.shared&&<span>Partagé</span>}</div><h2>{selected.title}</h2><SmartImage item={selected} className="modalImage" alt="Illustration de l’actualité"/><div className="summaryStack"><div className="factBox summaryShort"><span>Résumé express</span><p>{sum.short||"Résumé indisponible pour le moment."}</p></div><div className="factBox summaryLong"><span>Résumé clair</span><p>{sum.long||sum.short}</p></div></div>{selected.context&&<><h3>Contexte</h3><p className="muted">{selected.context}</p></>}<h3>Source originale</h3><p className="muted">Les résumés servent à réviser. Pour vérifier un détail, une citation ou un chiffre, ouvre toujours l’article du média.</p><div className="modalActions"><a className="primaryLink" href={selected.url} target="_blank" rel="noreferrer">Lire l’article source ↗</a><button className="secondary" onClick={()=>toggleSaved(selected.id)}>{saved.includes(selected.id)?'★ Sauvegardé':'☆ Sauvegarder'}</button></div></article></div>})()}
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

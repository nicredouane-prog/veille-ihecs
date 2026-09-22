import React, {useEffect, useMemo, useState} from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const APP_VERSION='v2.2';
const fmt = (value, short=false) => new Intl.DateTimeFormat('fr-BE', short ? {day:'2-digit',month:'short'} : {day:'2-digit',month:'long',year:'numeric'}).format(new Date(value));
const isoToday = () => new Date().toISOString().slice(0,10);
const nextDay = d => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate()+1); return x.toISOString().slice(0,10); };
const daysBetween = (a,b) => Math.max(0,Math.ceil((new Date(b)-new Date(a))/86400000));
const safeJson = (k,fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };

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
        navigator.serviceWorker?.ready.then(reg=>reg.showNotification('Veille Actu IHECS',{body:'Petit rappel : fais 10 minutes de révision de l’actu.',icon:'/icon.svg',badge:'/icon.svg',tag:'daily-revision'}));
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
          setSharedNews((Array.isArray(rows)?rows:[]).map(x=>({id:`shared-${x.id||x.created_at}`,title:x.title,description:x.description||'',context:x.context||'',category:x.category||'Belgique / Société',source:x.source||'Ajout partagé',url:x.url,image:x.image||'',date:x.created_at||new Date().toISOString(),quizPrompt:x.quiz_prompt||'',quizAnswer:x.quiz_answer||'',shared:true})));
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

  const makeQuiz=()=>{
    const pool=(relevantNews.length>=4?relevantNews:combinedNews).filter(n=>n.title && (n.description||'').length>20);
    if(pool.length<4) return;
    const correct=pool[Math.floor(Math.random()*pool.length)];
    const distractors=pool.filter(n=>n.id!==correct.id).sort(()=>Math.random()-.5).slice(0,3);
    const options=[correct,...distractors].sort(()=>Math.random()-.5);
    setQuiz({kind:'qcm',correct,options}); setQuizAnswer(''); setQuizResult(null);
  };
  const makePhotoTest=()=>{
    const pool=(relevantNews.length?relevantNews:combinedNews).filter(n=>n.title);
    if(!pool.length) return;
    const item=pool[Math.floor(Math.random()*pool.length)];
    setQuiz({kind:'photo',correct:item}); setPhotoAnswer(''); setQuizResult(null);
  };

  const analyzeLink=async()=>{
    if(!addUrl.trim()) return;
    setAnalyzing(true); setAddMessage(''); setDraft(null);
    try{
      const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:addUrl.trim(),pastedText:addText})});
      const data=await r.json();
      if(!r.ok) throw new Error(data.error||'Analyse impossible');
      setDraft({...data,quizPrompt:`Quelle affirmation décrit correctement cette actualité ?`,quizAnswer:data.title});
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
      <div className="brand"><div className="brandMark">V</div><div><strong>Veille Actu</strong><span>IHECS</span></div></div>
      <nav>{nav.map(([x,icon])=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}><span>{icon}</span>{x}</button>)}</nav>
      <div className="sideFoot"><span className={`dot ${error?'bad':loading?'wait':'ok'}`}></span>{loading?'Actualisation…':error?'Flux indisponible':'Veille en direct'}</div>
    </aside>

    <main>
      <header className="topbar"><div><p className="eyebrow">Veille journalistique <span className="versionBadge">{APP_VERSION}</span></p><h1>{tab}</h1></div><button className="iconBtn" onClick={loadNews} title="Actualiser">↻</button></header>

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
        <div className="modeGrid"><button className="mode" onClick={()=>{setTab('Tests fictifs');makeQuiz()}}><span>QCM</span><strong>Une seule bonne réponse</strong><small>Format Mr Gras</small></button><button className="mode" onClick={()=>{setTab('Tests fictifs');makePhotoTest()}}><span>PHOTO</span><strong>Expliquer l’actualité</strong><small>Format Mr Leconte</small></button><button className="mode" onClick={()=>{setTab('Actualités');setCategory('Toutes')}}><span>ACTU</span><strong>Revoir les fiches</strong><small>{relevantNews.length} éléments dans la période</small></button><button className="mode" onClick={()=>{setTab('Actualités');setQuery('')}}><span>★</span><strong>Mes articles sauvegardés</strong><small>{saved.length} sauvegardés</small></button></div>
      </section>}

      {tab==='Tests fictifs'&&<section className="noTop">
        <div className="examHeader"><div><p className="eyebrow">Mode entraînement</p><h2>Test d’actu fictif</h2></div><div className="examBtns"><button onClick={makeQuiz}>Nouveau QCM</button><button className="secondary" onClick={makePhotoTest}>Question photo</button></div></div>
        {!quiz&&<Empty text="Choisis un type de question pour commencer."/>}
        {quiz?.kind==='qcm'&&<article className="examCard"><div className="questionNo">MR GRAS · QCM · UNE SEULE RÉPONSE</div><h3>Quelle actualité correspond à ce résumé ?</h3><blockquote>{quiz.correct.description}</blockquote><div className="answers">{quiz.options.map(o=><button key={o.id} className={quizAnswer===o.id?'chosen':''} onClick={()=>{setQuizAnswer(o.id);setQuizResult(null)}}>{o.title}</button>)}</div><button className="submit" disabled={!quizAnswer} onClick={()=>setQuizResult(quizAnswer===quiz.correct.id)}>Valider ma réponse</button>{quizResult!==null&&<Feedback ok={quizResult} item={quiz.correct}/>}</article>}
        {quiz?.kind==='photo'&&<article className="examCard"><div className="questionNo">MR LECONTE · PHOTO · RÉPONSE RÉDIGÉE</div><div className="fakePhoto"><span>PHOTO D’ACTUALITÉ</span><div>{quiz.correct.category}</div></div><h3>Explique en quelques lignes l’actualité représentée par cette photo.</h3><p className="hint">À faire apparaître : l’événement, les personnes/organisations concernées, le lieu ou la date si pertinent, et pourquoi c’est important.</p><textarea value={photoAnswer} onChange={e=>setPhotoAnswer(e.target.value)} placeholder="Ta réponse…"/><button className="submit" disabled={photoAnswer.trim().length<15} onClick={()=>setQuizResult(true)}>Voir la correction</button>{quizResult&&<div className="correction"><span>Éléments à faire apparaître</span><h3>{quiz.correct.title}</h3><p>{quiz.correct.description||"Le flux ne fournit pas encore de résumé. Ouvre la source pour préparer une réponse complète."}</p><a href={quiz.correct.url} target="_blank" rel="noreferrer">Lire la source originale ↗</a></div>}</article>}
      </section>}

      {tab==='Mes tests'&&<section className="noTop">
        <div className="testGrid">{profs.map(p=><article className="settingsCard" key={p.key}><span className="softPill">{p.label}</span><h2>{p.name}</h2><label>Date du dernier test</label><input type="date" value={tests[p.key]} max={today} onChange={e=>setTests(t=>({...t,[p.key]:e.target.value}))}/><div className="period compact"><span>Prochaine matière</span><strong>{fmt(nextDay(tests[p.key]))} → aujourd’hui</strong></div><button onClick={()=>markTest(p.key)}>Enregistrer un test aujourd’hui</button></article>)}</div>
        <div className="sectionTitle historyTitle"><div><p className="eyebrow">Archives</p><h2>Historique des tests</h2></div></div>{history.length===0?<Empty text="Aucun test archivé pour l’instant."/>:<div className="historyList">{history.map(h=><div key={h.id} className="historyItem"><div><strong>{h.prof==='qcm'?'Mr Gras — QCM':'Mr Leconte — Photo'}</strong><span>Test du {fmt(h.date)}</span></div><p>Matière archivée : {fmt(h.from)} → {fmt(h.to)}</p></div>)}</div>}
      </section>}
    </main>

    {selected&&<div className="modalBack" onClick={()=>setSelected(null)}><article className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}>×</button><div className="modalMeta"><span>{selected.category}</span><span>{selected.source}</span><span>{fmt(selected.date)}</span>{selected.manual&&<span>Ajout manuel</span>}{selected.shared&&<span>Partagé</span>}</div><h2>{selected.title}</h2><div className="factBox"><span>À retenir</span><p>{selected.description||"Le flux de ce média ne fournit qu’un titre. La source originale reste disponible ci-dessous."}</p></div>{selected.context&&<><h3>Contexte</h3><p className="muted">{selected.context}</p></>}<h3>Pourquoi l’ouvrir ?</h3><p className="muted">Pour un test d’actualité, vérifie dans l’article original les acteurs, les dates, le contexte antérieur et les conséquences. L’app ne présente pas un résumé automatique comme une source.</p><div className="modalActions"><a className="primaryLink" href={selected.url} target="_blank" rel="noreferrer">Lire l’article source ↗</a><button className="secondary" onClick={()=>toggleSaved(selected.id)}>{saved.includes(selected.id)?'★ Sauvegardé':'☆ Sauvegarder'}</button></div></article></div>}
  </div>
}

function NewsRow({n,index,onOpen,saved,onSave}){return <article className="headline"><span className="rank">{String(index).padStart(2,'0')}</span><div className="headlineBody" onClick={onOpen}><div className="meta"><b>{n.source}</b><span>{n.category}</span><span>{fmt(n.date,true)}</span></div><h3>{n.title}</h3></div><button className="saveBtn" onClick={onSave}>{saved?'★':'☆'}</button></article>}
function NewsCard({n,onOpen,saved,onSave}){return <article className="newsCard"><div className="cardMeta"><span>{n.source}</span><span>{fmt(n.date,true)}</span></div><button className="saveBtn floating" onClick={onSave}>{saved?'★':'☆'}</button><div className="categoryLine">{n.category}</div><h3 onClick={onOpen}>{n.title}</h3><p>{n.description||'Ouvrir la fiche pour accéder à la source.'}</p><button className="textBtn left" onClick={onOpen}>Voir la fiche →</button></article>}
function Feedback({ok,item}){return <div className={`feedback ${ok?'good':'wrong'}`}><strong>{ok?'Bonne réponse.':'Pas cette fois.'}</strong><p>À retenir : <b>{item.title}</b></p><a href={item.url} target="_blank" rel="noreferrer">Revoir l’actualité ↗</a></div>}
function Skeleton(){return <div className="skeletonWrap">{[1,2,3,4].map(i=><div className="skeleton" key={i}/>)}</div>}
function Empty({text}){return <div className="empty"><div>—</div><p>{text}</p></div>}

createRoot(document.getElementById('root')).render(<App/>);

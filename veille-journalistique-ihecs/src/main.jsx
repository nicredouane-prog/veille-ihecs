import React, {useEffect, useMemo, useState} from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const fmt = (value, short=false) => new Intl.DateTimeFormat('fr-BE', short ? {day:'2-digit',month:'short'} : {day:'2-digit',month:'long',year:'numeric'}).format(new Date(value));
const isoToday = () => new Date().toISOString().slice(0,10);
const nextDay = d => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate()+1); return x.toISOString().slice(0,10); };
const daysBetween = (a,b) => Math.max(0,Math.ceil((new Date(b)-new Date(a))/86400000));
const safeJson = (k,fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };

const nav = [
  ['Accueil','⌂'],['Actualités','◉'],['Révisions','✓'],['Tests fictifs','✎'],['Mes tests','▣']
];

function App(){
  const [tab,setTab]=useState('Accueil');
  const [tests,setTests]=useState(()=>safeJson('veille-tests',{qcm:'2026-09-21',photo:'2026-09-05'}));
  const [history,setHistory]=useState(()=>safeJson('veille-history',[]));
  const [news,setNews]=useState([]);
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
  const today=isoToday();

  useEffect(()=>localStorage.setItem('veille-tests',JSON.stringify(tests)),[tests]);
  useEffect(()=>localStorage.setItem('veille-history',JSON.stringify(history)),[history]);
  useEffect(()=>localStorage.setItem('veille-saved',JSON.stringify(saved)),[saved]);

  const loadNews=async()=>{
    setLoading(true); setError('');
    try{
      const r=await fetch('/api/news?days=120');
      if(!r.ok) throw new Error(`Erreur ${r.status}`);
      const data=await r.json();
      setNews(data.items||[]); setSourceStatus(data.sources||[]);
    }catch(e){ setError("Impossible de charger les flux d'actualité pour le moment."); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{loadNews()},[]);

  const profs=useMemo(()=>[
    {key:'qcm',name:'Prof 1',label:'QCM & personnalités',type:'QCM à une seule réponse + reconnaissance de personnes'},
    {key:'photo',name:'Prof 2',label:'Photo & explication',type:"Expliquer l'actualité en quelques lignes"}
  ],[]);

  const markTest=(key,date=today)=>{
    const previous=tests[key];
    setHistory(h=>[{id:crypto.randomUUID?.()||`${Date.now()}`,prof:key,date,from:nextDay(previous),to:date,previous},...h]);
    setTests(t=>({...t,[key]:date}));
  };

  const activeSince=useMemo(()=>{
    const dates=Object.values(tests).filter(Boolean).sort();
    return dates[0] ? nextDay(dates[0]) : today;
  },[tests,today]);
  const relevantNews=useMemo(()=>news.filter(n=>n.date.slice(0,10)>=activeSince),[news,activeSince]);
  const categories=['Toutes',...Array.from(new Set(news.map(n=>n.category))).sort()];
  const filtered=useMemo(()=>news.filter(n=>{
    const q=query.toLowerCase().trim();
    return (category==='Toutes'||n.category===category) && (!q||`${n.title} ${n.description} ${n.source}`.toLowerCase().includes(q));
  }),[news,query,category]);

  const toggleSaved=id=>setSaved(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);

  const makeQuiz=()=>{
    const pool=relevantNews.length>=4?relevantNews:news;
    if(pool.length<4) return;
    const correct=pool[Math.floor(Math.random()*pool.length)];
    const distractors=[...new Set(pool.filter(n=>n.id!==correct.id).map(n=>n.source))].filter(x=>x!==correct.source).slice(0,3);
    while(distractors.length<3) distractors.push(['RTBF','RTL info','La Libre','Le Soir','BX1'].filter(x=>x!==correct.source&&!distractors.includes(x))[0]);
    const options=[correct.source,...distractors].sort(()=>Math.random()-.5);
    setQuiz({kind:'qcm',correct,options}); setQuizAnswer(''); setQuizResult(null);
  };
  const makePhotoTest=()=>{
    const pool=(relevantNews.length?relevantNews:news).filter(n=>n.title);
    if(!pool.length) return;
    const item=pool[Math.floor(Math.random()*pool.length)];
    setQuiz({kind:'photo',correct:item}); setPhotoAnswer(''); setQuizResult(null);
  };

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">V</div><div><strong>Veille Actu</strong><span>IHECS</span></div></div>
      <nav>{nav.map(([x,icon])=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}><span>{icon}</span>{x}</button>)}</nav>
      <div className="sideFoot"><span className={`dot ${error?'bad':loading?'wait':'ok'}`}></span>{loading?'Actualisation…':error?'Flux indisponible':'Veille en direct'}</div>
    </aside>

    <main>
      <header className="topbar"><div><p className="eyebrow">Veille journalistique</p><h1>{tab}</h1></div><button className="iconBtn" onClick={loadNews} title="Actualiser">↻</button></header>

      {tab==='Accueil'&&<>
        <section className="hero">
          <div><span className="liveBadge"><i/> ACTUALITÉ EN DIRECT</span><h2>Si j’avais un test demain</h2><p>L’app garde la matière depuis le dernier test surprise de chacun de tes profs.</p><div className="heroMeta"><strong>{relevantNews.length}</strong> actus récupérées depuis la période la plus ancienne · <strong>{sourceStatus.filter(s=>s.ok).length}</strong> sources actives</div></div>
          <button className="lightBtn" onClick={()=>{setTab('Tests fictifs');makeQuiz()}}>Faire un test blanc →</button>
        </section>

        <section><div className="sectionTitle"><div><p className="eyebrow">Périodes automatiques</p><h2>Mes profs</h2></div></div>
          <div className="profGrid">{profs.map(p=><article className="profCard" key={p.key}><div className="profTop"><span className="number">{p.key==='qcm'?'01':'02'}</span><span className="softPill">{p.label}</span></div><h3>{p.name}</h3><p className="muted">{p.type}</p><div className="period"><span>Matière actuelle</span><strong>{fmt(nextDay(tests[p.key]),true)} → aujourd’hui</strong><small>{daysBetween(nextDay(tests[p.key]),today)+1} jours d’actualité</small></div><div className="actions"><button onClick={()=>setTab('Révisions')}>Réviser</button><button className="secondary" onClick={()=>markTest(p.key)}>J’ai eu un test aujourd’hui</button></div></article>)}</div>
        </section>

        <section><div className="sectionTitle"><div><p className="eyebrow">À surveiller</p><h2>Dernières actualités</h2></div><button className="textBtn" onClick={()=>setTab('Actualités')}>Tout voir →</button></div>
          {loading?<Skeleton/>:error?<Empty text={error}/>:<div className="headlineList">{news.slice(0,7).map((n,i)=><NewsRow key={n.id} n={n} index={i+1} onOpen={()=>setSelected(n)} saved={saved.includes(n.id)} onSave={()=>toggleSaved(n.id)}/>)}</div>}
        </section>
      </>}

      {tab==='Actualités'&&<section className="noTop">
        <div className="toolbar"><div className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un sujet, une personne, un média…"/></div><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></div>
        <div className="sourceStrip"><strong>Sources suivies</strong>{sourceStatus.map(s=><span key={s.name} className={s.ok?'sourceOk':'sourceOff'}>{s.name}</span>)}</div>
        {loading?<Skeleton/>:error?<Empty text={error}/>:<div className="newsGrid">{filtered.map(n=><NewsCard key={n.id} n={n} onOpen={()=>setSelected(n)} saved={saved.includes(n.id)} onSave={()=>toggleSaved(n.id)}/>)}</div>}
      </section>}

      {tab==='Révisions'&&<section className="noTop">
        <div className="revisionIntro"><div><p className="eyebrow">Révision intelligente</p><h2>Choisis ton mode</h2><p>Les exercices utilisent les titres réellement récupérés dans ta période de matière.</p></div></div>
        <div className="modeGrid"><button className="mode" onClick={()=>{setTab('Tests fictifs');makeQuiz()}}><span>QCM</span><strong>Une seule bonne réponse</strong><small>Format prof 1</small></button><button className="mode" onClick={()=>{setTab('Tests fictifs');makePhotoTest()}}><span>PHOTO</span><strong>Expliquer l’actualité</strong><small>Format prof 2</small></button><button className="mode" onClick={()=>{setTab('Actualités');setCategory('Toutes')}}><span>ACTU</span><strong>Revoir les fiches</strong><small>{relevantNews.length} éléments dans la période</small></button><button className="mode" onClick={()=>{setTab('Actualités');setQuery('')}}><span>★</span><strong>Mes articles sauvegardés</strong><small>{saved.length} sauvegardés</small></button></div>
      </section>}

      {tab==='Tests fictifs'&&<section className="noTop">
        <div className="examHeader"><div><p className="eyebrow">Mode entraînement</p><h2>Test d’actu fictif</h2></div><div className="examBtns"><button onClick={makeQuiz}>Nouveau QCM</button><button className="secondary" onClick={makePhotoTest}>Question photo</button></div></div>
        {!quiz&&<Empty text="Choisis un type de question pour commencer."/>}
        {quiz?.kind==='qcm'&&<article className="examCard"><div className="questionNo">QUESTION QCM · UNE SEULE RÉPONSE</div><h3>Quel média est associé à ce titre d’actualité ?</h3><blockquote>{quiz.correct.title}</blockquote><div className="answers">{quiz.options.map(o=><button key={o} className={quizAnswer===o?'chosen':''} onClick={()=>{setQuizAnswer(o);setQuizResult(null)}}>{o}</button>)}</div><button className="submit" disabled={!quizAnswer} onClick={()=>setQuizResult(quizAnswer===quiz.correct.source)}>Valider ma réponse</button>{quizResult!==null&&<Feedback ok={quizResult} item={quiz.correct}/>}</article>}
        {quiz?.kind==='photo'&&<article className="examCard"><div className="questionNo">QUESTION PHOTO · RÉPONSE RÉDIGÉE</div><div className="fakePhoto"><span>PHOTO D’ACTUALITÉ</span><div>{quiz.correct.category}</div></div><h3>Explique en quelques lignes l’actualité représentée par cette photo.</h3><p className="hint">Pour cet entraînement sans banque d’images, le sujet est masqué jusqu’à ta correction. Décris ce qui pourrait être attendu : événement, acteurs, lieu/date et enjeu.</p><textarea value={photoAnswer} onChange={e=>setPhotoAnswer(e.target.value)} placeholder="Ta réponse…"/><button className="submit" disabled={photoAnswer.trim().length<15} onClick={()=>setQuizResult(true)}>Voir la correction</button>{quizResult&&<div className="correction"><span>Éléments à faire apparaître</span><h3>{quiz.correct.title}</h3><p>{quiz.correct.description||"Le flux ne fournit pas encore de résumé. Ouvre la source pour préparer une réponse complète."}</p><a href={quiz.correct.url} target="_blank" rel="noreferrer">Lire la source originale ↗</a></div>}</article>}
      </section>}

      {tab==='Mes tests'&&<section className="noTop">
        <div className="testGrid">{profs.map(p=><article className="settingsCard" key={p.key}><span className="softPill">{p.label}</span><h2>{p.name}</h2><label>Date du dernier test</label><input type="date" value={tests[p.key]} max={today} onChange={e=>setTests(t=>({...t,[p.key]:e.target.value}))}/><div className="period compact"><span>Prochaine matière</span><strong>{fmt(nextDay(tests[p.key]))} → aujourd’hui</strong></div><button onClick={()=>markTest(p.key)}>Enregistrer un test aujourd’hui</button></article>)}</div>
        <div className="sectionTitle historyTitle"><div><p className="eyebrow">Archives</p><h2>Historique des tests</h2></div></div>{history.length===0?<Empty text="Aucun test archivé pour l’instant."/>:<div className="historyList">{history.map(h=><div key={h.id} className="historyItem"><div><strong>{h.prof==='qcm'?'Prof 1 — QCM':'Prof 2 — Photo'}</strong><span>Test du {fmt(h.date)}</span></div><p>Matière archivée : {fmt(h.from)} → {fmt(h.to)}</p></div>)}</div>}
      </section>}
    </main>

    {selected&&<div className="modalBack" onClick={()=>setSelected(null)}><article className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}>×</button><div className="modalMeta"><span>{selected.category}</span><span>{selected.source}</span><span>{fmt(selected.date)}</span></div><h2>{selected.title}</h2><div className="factBox"><span>À retenir</span><p>{selected.description||"Le flux de ce média ne fournit qu’un titre. La source originale reste disponible ci-dessous."}</p></div><h3>Pourquoi l’ouvrir ?</h3><p className="muted">Pour un test d’actualité, vérifie dans l’article original les acteurs, les dates, le contexte antérieur et les conséquences. L’app ne présente pas un résumé automatique comme une source.</p><div className="modalActions"><a className="primaryLink" href={selected.url} target="_blank" rel="noreferrer">Lire l’article source ↗</a><button className="secondary" onClick={()=>toggleSaved(selected.id)}>{saved.includes(selected.id)?'★ Sauvegardé':'☆ Sauvegarder'}</button></div></article></div>}
  </div>
}

function NewsRow({n,index,onOpen,saved,onSave}){return <article className="headline"><span className="rank">{String(index).padStart(2,'0')}</span><div className="headlineBody" onClick={onOpen}><div className="meta"><b>{n.source}</b><span>{n.category}</span><span>{fmt(n.date,true)}</span></div><h3>{n.title}</h3></div><button className="saveBtn" onClick={onSave}>{saved?'★':'☆'}</button></article>}
function NewsCard({n,onOpen,saved,onSave}){return <article className="newsCard"><div className="cardMeta"><span>{n.source}</span><span>{fmt(n.date,true)}</span></div><button className="saveBtn floating" onClick={onSave}>{saved?'★':'☆'}</button><div className="categoryLine">{n.category}</div><h3 onClick={onOpen}>{n.title}</h3><p>{n.description||'Ouvrir la fiche pour accéder à la source.'}</p><button className="textBtn left" onClick={onOpen}>Voir la fiche →</button></article>}
function Feedback({ok,item}){return <div className={`feedback ${ok?'good':'wrong'}`}><strong>{ok?'Bonne réponse.':'Pas cette fois.'}</strong><p>Réponse : <b>{item.source}</b></p><a href={item.url} target="_blank" rel="noreferrer">Revoir l’actualité ↗</a></div>}
function Skeleton(){return <div className="skeletonWrap">{[1,2,3,4].map(i=><div className="skeleton" key={i}/>)}</div>}
function Empty({text}){return <div className="empty"><div>—</div><p>{text}</p></div>}

createRoot(document.getElementById('root')).render(<App/>);

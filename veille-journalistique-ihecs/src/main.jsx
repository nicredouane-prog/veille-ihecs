import React, {useMemo, useState} from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const demoNews=[
 {id:1,cat:'Belgique',title:'Réforme fédérale : négociations et calendrier politique',date:'2026-09-22',summary:'Données de démonstration. Cette fiche montre comment l’app présentera une actualité importante avec résumé, contexte et sources.',context:'Le contexte replacera l’événement dans les institutions belges, les décisions précédentes et les acteurs concernés.',why:'À retenir pour un test : qui décide, ce qui change, les dates clés et les conséquences.',people:[{name:'Exemple de personnalité',role:'Fonction publique',why:'Impliquée directement dans l’actualité'}],sources:['RTBF','RTL info','Le Soir']},
 {id:2,cat:'International',title:'Sommet international : nouveaux engagements diplomatiques',date:'2026-09-21',summary:'Exemple d’actualité internationale pour tester la navigation et les fiches.',context:'Les remises en contexte relieront les faits aux événements précédents.',why:'Permet de comprendre les enjeux, les rapports de force et les acteurs.',people:[{name:'Exemple de dirigeant',role:'Chef d’État',why:'Présent au sommet'}],sources:['RTBF','BBC','Reuters']}
];

function App(){
 const [tab,setTab]=useState('Accueil');
 const [tests,setTests]=useState({qcm:'2026-09-21',photo:'2026-09-05'});
 const [history,setHistory]=useState([]);
 const today=new Date().toISOString().slice(0,10);
 const start=(d)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+1);return x.toISOString().slice(0,10)};
 const markTest=(key)=>{setHistory(h=>[{prof:key,date:today,previous:tests[key]},...h]);setTests(t=>({...t,[key]:today}))};
 const cards=useMemo(()=>[
  {key:'qcm',name:'Prof — QCM & personnalités',type:'QCM à réponse unique + photos',last:tests.qcm},
  {key:'photo',name:'Prof — Photo & explication',type:'Expliquer l’actualité en quelques lignes',last:tests.photo}
 ],[tests]);
 return <div className="app">
  <aside className="sidebar"><div className="brand">Veille Actu<br/><span>IHECS</span></div>{['Accueil','Actualités','Révisions','Tests fictifs','Mes tests'].map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</aside>
  <main>
   {tab==='Accueil' && <>
    <div className="hero"><div><p className="eyebrow">Préparation aux tests surprise</p><h1>Si j’avais un test demain</h1><p>Révise automatiquement toute l’actualité depuis le dernier test de chaque professeur.</p></div><button onClick={()=>setTab('Tests fictifs')}>Lancer un test blanc</button></div>
    <section><h2>Mes deux profs</h2><div className="grid">{cards.map(c=><div className="card" key={c.key}><div className="pill">{c.type}</div><h3>{c.name}</h3><p>Dernier test : <strong>{c.last}</strong></p><p>Matière à connaître : <strong>{start(c.last)} → aujourd’hui</strong></p><div className="actions"><button onClick={()=>setTab('Révisions')}>Réviser</button><button className="ghost" onClick={()=>markTest(c.key)}>J’ai eu un test aujourd’hui</button></div></div>)}</div></section>
    <section><h2>Actualités importantes</h2><div className="newsgrid">{demoNews.map(n=><article key={n.id} className="news"><div className="pill">{n.cat}</div><h3>{n.title}</h3><p>{n.summary}</p><button onClick={()=>setTab('Actualités')}>Ouvrir la fiche</button></article>)}</div></section>
   </>}
   {tab==='Actualités' && <section><div className="sectionHead"><div><p className="eyebrow">Démonstration</p><h1>Fiches d’actualité</h1></div></div>{demoNews.map(n=><article className="detail" key={n.id}><div className="pill">{n.cat} · {n.date}</div><h2>{n.title}</h2><h4>Résumé</h4><p>{n.summary}</p><h4>Contexte</h4><p>{n.context}</p><h4>Pourquoi c’est important</h4><p>{n.why}</p><h4>Personnes à connaître</h4>{n.people.map(p=><div className="person" key={p.name}><div className="avatar">Photo</div><div><strong>{p.name}</strong><br/>{p.role}<br/><span>{p.why}</span></div></div>)}<h4>Sources</h4><p>{n.sources.join(' · ')}</p></article>)}</section>}
   {tab==='Révisions' && <section><h1>Révisions</h1><div className="grid"><div className="card"><h3>Essentiels</h3><p>Revoir les événements majeurs depuis le dernier test.</p></div><div className="card"><h3>Personnalités</h3><p>Nom, fonction et pourquoi la personne est dans l’actualité.</p></div><div className="card"><h3>Mes erreurs</h3><p>Les questions ratées reviendront plus souvent.</p></div></div></section>}
   {tab==='Tests fictifs' && <section><h1>Test d’actu fictif</h1><div className="grid"><div className="card"><div className="pill">Prof 1</div><h3>QCM + personnalités</h3><p>Une seule bonne réponse par question, puis reconnaissance de personnes sur photo.</p><button>Démarrer</button></div><div className="card"><div className="pill">Prof 2</div><h3>Photo → expliquer l’actu</h3><p>Une photo, quelques lignes à rédiger, puis comparaison avec les éléments indispensables.</p><button>Démarrer</button></div></div></section>}
   {tab==='Mes tests' && <section><h1>Mes tests</h1><div className="grid">{cards.map(c=><div className="card" key={c.key}><h3>{c.name}</h3><label>Dernier test</label><input type="date" value={c.last} onChange={e=>setTests(t=>({...t,[c.key]:e.target.value}))}/><p>La matière suivante commence le <strong>{start(c.last)}</strong>.</p></div>)}</div>{history.length>0&&<><h2>Historique</h2>{history.map((h,i)=><div className="history" key={i}>Test enregistré le {h.date} — période précédente conservée depuis {h.previous}</div>)}</>}</section>}
  </main>
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);

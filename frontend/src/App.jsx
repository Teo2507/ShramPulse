import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import html2pdf from "html2pdf.js";

const API = import.meta.env.VITE_API_URL || "http://localhost:5050/api";
const APP_DATA_VERSION = "dynamic-v6";
function storedJSON(key){ try { if(localStorage.getItem("sp_data_version")!==APP_DATA_VERSION){ localStorage.removeItem("sp_worker"); localStorage.removeItem("sp_gov"); localStorage.setItem("sp_data_version",APP_DATA_VERSION); } return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
const MAP_URL = "https://cdn.jsdelivr.net/gh/AbhinavSwami28/india-official-geojson@main/india-states-simplified.geojson";
const STATE_ALIASES = {
  "NCT of Delhi":"Delhi", "National Capital Territory of Delhi":"Delhi", "Delhi NCR":"Delhi",
  "Jammu & Kashmir":"Jammu and Kashmir", "Jammu and Kashmir":"Jammu and Kashmir",
  "Dadra and Nagar Haveli and Daman and Diu":"Dadra and Nagar Haveli and Daman and Diu",
  "Andaman & Nicobar":"Andaman and Nicobar Islands", "Andaman and Nicobar":"Andaman and Nicobar Islands",
  "Odisha":"Odisha", "Orissa":"Odisha", "Uttarakhand":"Uttarakhand", "Uttaranchal":"Uttarakhand",
  "Puducherry":"Puducherry", "Pondicherry":"Puducherry", "Tamilnadu":"Tamil Nadu", "West Bengal":"West Bengal",
  "Chhattisgarh":"Chhattisgarh", "Chattisgarh":"Chhattisgarh", "Telangana":"Telangana", "Bengaluru Urban":"Karnataka"
};
function canonicalStateName(name="") { const raw=String(name||'').trim(); return STATE_ALIASES[raw] || raw; }

const INDIAN_STATES = [
  "Andaman and Nicobar Islands","Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chandigarh","Chhattisgarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Goa","Gujarat","Haryana","Himachal Pradesh","Jammu and Kashmir","Jharkhand","Karnataka","Kerala","Ladakh","Lakshadweep","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Puducherry","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal"
];
const OCCUPATIONS = ["Construction Worker","Driver","Electrician","Factory / Production Worker","Agricultural Worker","Welder","Plumber","Security Worker","Other"];
const OCCUPATION_ALIASES = {
  construction:["construction","construction worker","கட்டுமான","கட்டிட வேலை"], driver:["driver","driving","ஓட்டுநர்"], electrician:["electrician","electrical","electric","எலக்ட்ரீசியன்","மின்சார வேலை"], factory:["factory","factory worker","production","production worker","தொழிற்சாலை"], agricultural:["agricultural","agriculture","farm","விவசாய"], welder:["welder","welding","வெல்டர்"], plumber:["plumber","plumbing","குழாய் வேலை"], security:["security","security guard","பாதுகாப்பு"]
};
function occupationFromText(text,current="Other") { const x=String(text||"").toLowerCase(); for(const [key,aliases] of Object.entries(OCCUPATION_ALIASES)){ if(aliases.some(a=>x.includes(a.toLowerCase()) || String(text).includes(a))) return OCCUPATIONS.find(o=>o.toLowerCase().includes(key)) || current; } return current; }

function SuggestInput({label,value,onChange,state,placeholder,required=false}) {
  const [options,setOptions]=useState([]); const [open,setOpen]=useState(false);
  useEffect(()=>{let live=true; const timer=setTimeout(async()=>{try{const d=await api(`/locations?state=${encodeURIComponent(state||"")}&q=${encodeURIComponent(value||"")}`);if(live)setOptions(d.results||[]);}catch{if(live)setOptions([])}},120);return()=>{live=false;clearTimeout(timer)}},[value,state]);
  const filtered=options.slice(0,8);
  return <div className="suggest-wrap"><label>{label}<input value={value} onFocus={()=>setOpen(true)} onChange={e=>{onChange(e.target.value);setOpen(true)}} onBlur={()=>setTimeout(()=>setOpen(false),160)} placeholder={placeholder} required={required}/></label>{open&&value&&filtered.length>0&&<div className="suggest-menu">{filtered.map((x,i)=><button type="button" key={`${x.state}-${x.district}-${x.city}-${i}`} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(label.toLowerCase().includes("district")?x.district:x.city);setOpen(false)}}><b>{label.toLowerCase().includes("district")?x.district:x.city}</b><small>{x.city}{x.district!==x.city?` · ${x.district}`:""}</small></button>)}</div>}</div>;
}

const schemeData = [
  { id:"s1", name:"One Nation One Ration Card", category:"Food Security", description:"Information about ration portability for eligible beneficiaries moving between locations.", tag:"Migrant Friendly", url:"https://dfpd.gov.in/distribution-of-food-grains/en" },
  { id:"s2", name:"Pradhan Mantri Shram Yogi Maandhan", category:"Social Security", description:"Information about pension support for eligible unorganised workers.", tag:"Social Security", url:"https://maandhan.in/" }
];

const jobData = [
  ["Machine Operator","Tamil Nadu","Chennai","Factory / Production Worker","Machine operation · Production"],
  ["Electrical Maintenance Assistant","Kerala","Kochi","Electrician","Wiring · Maintenance"],
  ["Logistics / Delivery Worker","Karnataka","Bengaluru","Driver","Driving · Logistics"],
  ["Construction Worker","Telangana","Hyderabad","Construction Worker","Site work · Masonry"],
  ["Production Worker","Maharashtra","Pune","Factory / Production Worker","Assembly · Machine operation"],
  ["Electrical Technician","Maharashtra","Pune","Electrician","Installation · Troubleshooting"],
  ["Construction Helper","Maharashtra","Mumbai","Construction Worker","Construction · Site safety"],
  ["Transport Driver","Tamil Nadu","Coimbatore","Driver","Driving · Route planning"],
  ["Site Supervisor","Tamil Nadu","Tirunelveli","Construction Worker","Site supervision · Safety"],
  ["Industrial Electrician","Maharashtra","Nashik","Electrician","Industrial maintenance"]
].map((x,i)=>({id:`j${i+1}`,title:x[0],state:x[1],city:x[2],occupation:x[3],skills:x[4],source:"National Career Service"}));

async function api(path, options={}) {
  try {
    const r = await fetch(`${API}${path}`, {
      headers:{"Content-Type":"application/json", ...(options.headers||{})},
      ...options
    });
    const data = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(data.message || `Request failed (${r.status})`);
    return data;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Backend connection failed. Start ShramPulse backend on http://localhost:5050 (API: ${API}).`);
    }
    throw error;
  }
}

function Logo({compact=false}) {
  return <div className={`brand ${compact?"compact":""}`}><div className="sp-logo"><span>S</span><b>P</b></div><div className="brand-copy"><strong>ShramPulse</strong>{!compact && <small>Worker Mobility Intelligence</small>}</div></div>;
}
function ThemeToggle({theme,setTheme}) { return <button className="theme-toggle" onClick={()=>setTheme(theme==="dark"?"light":"dark")} title="Toggle theme"><span>{theme==="dark"?"☀":"☾"}</span><b>{theme==="dark"?"Bright":"Dark"}</b></button>; }
function Toast({message,onClose}) { if(!message)return null; return <div className="toast"><span>✓</span><div>{message}</div><button onClick={onClose}>×</button></div>; }
function Splash({onDone}) { useEffect(()=>{const t=setTimeout(onDone,1900);return()=>clearTimeout(t)},[onDone]); return <div className="splash"><div className="splash-mark"><i></i><div className="splash-sp"><span>S</span><b>P</b></div><i></i></div><h1>ShramPulse</h1><p>Report your move. Discover your opportunities.</p><div className="splash-loader"><span></span></div></div>; }

function Landing({go,theme,setTheme}) { return <div className="landing-page">
  <header className="public-nav"><Logo/><div className="public-nav-right"><span className="demo-badge"><i/> Prototype Mode</span><ThemeToggle theme={theme} setTheme={setTheme}/></div></header>
  <main className="landing-main">
    <section className="hero-copy">
      <div className="eyebrow">CONSENT-BASED MOBILITY INTELLIGENCE</div>
      <h1>Report your move.<br/><em>Discover what comes next.</em></h1>
      <p>ShramPulse turns worker-confirmed migration updates into location-aware opportunities and aggregated labour intelligence — without continuous GPS tracking.</p>
      <div className="hero-buttons"><button className="btn primary" onClick={()=>go("worker-login")}>Enter Worker Portal <b>→</b></button><button className="btn secondary" onClick={()=>go("gov-login")}>Open Intelligence Dashboard <b>↗</b></button></div>
      <div className="trust-line"><span>✓ Worker confirmed</span><span>✓ Privacy conscious</span><span>✓ Dynamic insights</span></div>
    </section>
    <section className="hero-panel">
      <div className="hero-panel-top"><span>LIVE CONCEPT</span><strong>LIVE DATA</strong></div>
      <div className="pulse-ring"><div className="hero-sp"><span>S</span><b>P</b></div></div>
      <div className="mini-flow"><div><small>INPUT</small><b>Worker report</b></div><i>→</i><div><small>CONFIRMED MOVE</small><b>Live location</b></div></div>
      <div className="hero-stat-grid"><div><strong>0 → N</strong><span>Worker profiles</span></div><div><strong>LIVE</strong><span>Dynamic updates</span></div><div><strong>AI</strong><span>Tamil + English</span></div></div>
    </section>
  </main>
  <section className="feature-ribbon"><div><span>01</span><b>REPORT</b><small>Worker confirms location</small></div><div><span>02</span><b>MATCH</b><small>Jobs + welfare guidance</small></div><div><span>03</span><b>VISUALIZE</b><small>Heatmaps + migration flows</small></div></section>
  <footer>Prototype Demonstration · Not an official Government of India portal</footer>
</div>; }

function AuthShell({children,go,theme,setTheme}) { return <div className="auth-page"><div className="auth-top"><button className="back-link" onClick={()=>go("landing")}>← Back</button><Logo compact/><ThemeToggle theme={theme} setTheme={setTheme}/></div>{children}<footer>Demo environment · Sensitive identifiers are masked</footer></div>; }

function WorkerLogin({go,onLogin,theme,setTheme}) { const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [error,setError]=useState("");const submit=async e=>{e.preventDefault();setError("");try{const d=await api("/auth/worker/login",{method:"POST",body:JSON.stringify({email,password})});localStorage.setItem("sp_worker",JSON.stringify(d.worker));onLogin(d.worker);go("worker-home")}catch(err){setError(err.message)}};return <AuthShell go={go} theme={theme} setTheme={setTheme}><div className="auth-card"><div className="auth-kicker">WORKER PORTAL</div><h1>Welcome back.</h1><p>Sign in to update your location, view opportunities and keep your profile current.</p><form onSubmit={submit}><label>Email<input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@example.com" required/></label><label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Your password" required/></label>{error&&<div className="error-box">⚠ {error}</div>}<button className="btn primary full">Sign in <b>→</b></button></form><div className="auth-switch">Don't have an account? <button onClick={()=>go("worker-signup")}>Create one</button></div></div></AuthShell>; }

function WorkerSignup({go,onLogin,theme,setTheme}) { const [form,setForm]=useState({name:"",email:"",password:"",mobile:"",occupation:"Other",state:"",district:"",city:"",aadhaarLast4:""});const [error,setError]=useState("");const set=(k,v)=>setForm(f=>({...f,[k]:v}));const submit=async e=>{e.preventDefault();setError("");try{const d=await api("/auth/worker/signup",{method:"POST",body:JSON.stringify(form)});localStorage.setItem("sp_worker",JSON.stringify(d.worker));onLogin(d.worker);go("worker-home")}catch(err){setError(err.message)}};return <AuthShell go={go} theme={theme} setTheme={setTheme}><div className="auth-card wide"><div className="auth-kicker">NEW WORKER ACCOUNT</div><h1>Create your profile.</h1><p>Every registration creates a new worker record. Nothing is pre-filled, so you can demonstrate the system with different people.</p><form onSubmit={submit} className="form-grid"><label>Full name<input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="Enter full name" required/></label><label>Email<input value={form.email} onChange={e=>set("email",e.target.value)} type="email" placeholder="Enter email address" required/></label><label>Password<input value={form.password} onChange={e=>set("password",e.target.value)} type="password" placeholder="Create a password" required/></label><label>Mobile<input value={form.mobile} onChange={e=>set("mobile",e.target.value)} placeholder="Enter mobile number" required/></label><label>Occupation<select value={form.occupation} onChange={e=>set("occupation",e.target.value)}>{OCCUPATIONS.map(x=><option key={x}>{x}</option>)}</select></label><label>Current state<select value={form.state} onChange={e=>setForm(f=>({...f,state:e.target.value,district:"",city:""}))} required><option value="">Select state</option>{INDIAN_STATES.map(x=><option key={x}>{x}</option>)}</select></label><SuggestInput label="District" value={form.district} onChange={v=>set("district",v)} state={form.state} placeholder="Type district — e.g. k" required/><SuggestInput label="City / town" value={form.city} onChange={v=>set("city",v)} state={form.state} placeholder="Type city / town" required/><label>Aadhaar / ID last 4 digits<input maxLength="4" value={form.aadhaarLast4} onChange={e=>set("aadhaarLast4",e.target.value.replace(/\D/g,""))} placeholder="Optional"/></label><div className="consent"><input type="checkbox" required/> I consent to use my information for migration and opportunity services.</div>{error&&<div className="error-box span-2">⚠ {error}</div>}<button className="btn primary full span-2">Create account <b>→</b></button></form><div className="auth-switch">Already registered? <button onClick={()=>go("worker-login")}>Sign in</button></div></div></AuthShell>; }

function Sidebar({page,setPage,worker,onLogout,theme,setTheme}) { const items=[["home","Overview","⌂"],["migration","My Migration","↗"],["opportunities","Opportunities","✦"],["schemes","Welfare","◇"],["profile","Profile","○"]];return <aside className="sidebar"><Logo/><div className="worker-mini"><div className="avatar">{worker?.name?.charAt(0)||"W"}</div><div><b>{worker?.name}</b><span>{worker?.occupation}</span></div></div><nav>{items.map(([id,label,icon])=><button className={page===id?"active":""} key={id} onClick={()=>setPage(id)}><span>{icon}</span>{label}</button>)}</nav><div className="sidebar-bottom"><ThemeToggle theme={theme} setTheme={setTheme}/><button onClick={onLogout} className="logout">↪ Sign out</button></div></aside>; }

function WorkerLayout({worker,setWorker,page,setPage,onLogout,theme,setTheme,children,toast}) { return <div className="app-shell"><Sidebar page={page} setPage={setPage} worker={worker} onLogout={onLogout} theme={theme} setTheme={setTheme}/><div className="app-main"><header className="app-top"><div><span className="mobile-brand"><Logo compact/></span><small>WORKER PORTAL</small><strong>{page==="home"?"Your mobility workspace":page==="migration"?"Migration update":page==="opportunities"?"Recommended opportunities":page==="schemes"?"Welfare support":"Your profile"}</strong></div><div className="top-right"><span className="online-dot">● Live</span><ThemeToggle theme={theme} setTheme={setTheme}/><div className="top-avatar">{worker?.name?.charAt(0)}</div></div></header>{children}</div><Toast message={toast} onClose={()=>{}}/></div>; }

function LocationBanner({worker,onUpdate}) { return <div className="location-banner"><div className="loc-icon">⌖</div><div><small>CURRENT CONFIRMED LOCATION</small><h2>{worker.city}, {worker.state}</h2><p>Last confirmed {new Date(worker.updatedAt||Date.now()).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</p></div><button className="btn primary" onClick={onUpdate}>Update location <b>→</b></button></div>; }

function WorkerHome({worker,setPage,onUpdate}) { const [jobs,setJobs]=useState([]);useEffect(()=>{setJobs(jobData.filter(j=>j.state===worker.state && (j.occupation===worker.occupation || j.occupation==="Other")).slice(0,3))},[worker]);return <div className="page"><div className="page-head"><div><span className="eyebrow">GOOD TO SEE YOU</span><h1>Hello, {worker.name.split(" ")[0]} <span>👋</span></h1><p>Your confirmed location powers your recommendations — not continuous tracking.</p></div></div><LocationBanner worker={worker} onUpdate={onUpdate}/><div className="section-head"><div><span className="eyebrow">PERSONALIZED FOR YOU</span><h2>What changed with your location?</h2></div><button className="text-btn" onClick={()=>setPage("opportunities")}>View all →</button></div><div className="dashboard-grid"><div className="insight-card green"><span className="card-icon">✦</span><small>LOCATION MATCH</small><h3>{worker.state}</h3><p>Recommendations are filtered using your current state and occupation.</p><button onClick={()=>setPage("opportunities")}>Explore matches →</button></div><div className="insight-card orange"><span className="card-icon">◇</span><small>WELFARE</small><h3>2 support schemes</h3><p>Relevant information is available for eligible workers.</p><button onClick={()=>setPage("schemes")}>View schemes →</button></div><div className="insight-card dark"><span className="card-icon">↗</span><small>MIGRATION HISTORY</small><h3>Worker confirmed</h3><p>Every move becomes an auditable migration event.</p><button onClick={()=>setPage("migration")}>See history →</button></div></div><div className="section-head"><div><span className="eyebrow">JOB MATCHING</span><h2>Top opportunities near {worker.city}</h2></div></div><div className="job-grid">{jobs.length?jobs.map(j=><JobCard key={j.id} job={j} />):<div className="empty-card">No demo job matches yet. Change your occupation or location to see matching opportunities.</div>}</div></div>; }
function JobCard({job}) { return <article className="job-card"><div className="job-logo">💼</div><div className="job-main"><span>{job.source}</span><h3>{job.title}</h3><p>📍 {job.city}, {job.state}</p><small>{job.skills}</small><a className="text-btn inline-link" href="https://ncs.gov.in/" target="_blank" rel="noreferrer">View official NCS ↗</a></div><div className="match">MATCH</div></article>; }
function SchemeCard({scheme}) { return <article className="scheme-card"><div className="scheme-icon">✦</div><div><span>{scheme.tag}</span><h3>{scheme.name}</h3><p>{scheme.description}</p><a className="text-btn inline-link" href={scheme.url} target="_blank" rel="noreferrer">Official information ↗</a></div></article>; }



function speakText(text, lang) {
  if (!("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang=lang==='ta'?'ta-IN':'en-IN'; u.rate=0.88;
  const voices=window.speechSynthesis.getVoices(); const wanted=lang==='ta'?['ta-IN','ta'] : ['en-IN','en-GB','en-US']; const v=voices.find(x=>wanted.some(w=>x.lang?.toLowerCase()===w.toLowerCase() || x.lang?.toLowerCase().startsWith(w.split('-')[0]))); if(v)u.voice=v;
  window.speechSynthesis.speak(u); return true;
}

async function parseMigrationWithAI(text,worker){
  const d=await api('/ai/parse-migration',{method:'POST',body:JSON.stringify({text,worker})});
  return d.parsed||null;
}

function VoiceMigrationAssistant({worker,onDetected}) {
  const [lang,setLang]=useState('en'),[listening,setListening]=useState(false),[transcript,setTranscript]=useState(''),[message,setMessage]=useState(''),[supported,setSupported]=useState(true),[busy,setBusy]=useState(false); 
  const recognitionRef=useRef(null);
  useEffect(()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){setSupported(false);return;}const r=new SR();r.continuous=false;r.interimResults=true;r.maxAlternatives=5;r.lang=lang==='ta'?'ta-IN':'en-IN';
    r.onstart=()=>{setListening(true);setMessage(lang==='ta'?'கேட்கிறோம்… இடம் மற்றும் வேலை பற்றி இயல்பாக சொல்லுங்கள்.':'Listening… describe your new location and job naturally.');};
    r.onend=()=>setListening(false); r.onerror=e=>{setListening(false);setMessage(e.error==='not-allowed'?'Microphone permission was denied. Please allow microphone access.':(lang==='ta'?'தெளிவாக கேட்கவில்லை. மீண்டும் முயற்சிக்கவும்.':'I could not hear that clearly. Please try again.'));};
    r.onresult=async event=>{let finalText='',interim='';for(let i=event.resultIndex;i<event.results.length;i++){const t=event.results[i][0]?.transcript||'';if(event.results[i].isFinal)finalText+=t;else interim+=t;}const text=(finalText||interim).trim();if(text)setTranscript(text);if(!finalText.trim())return;setBusy(true);try{const parsed=await parseMigrationWithAI(finalText,worker);if(parsed){onDetected(parsed,finalText,lang);setMessage(lang==='ta'?'இடம் மற்றும் வேலை விவரங்கள் கண்டறியப்பட்டன. கீழே சரிபார்க்கவும்.':'Location and job details detected. Review the fields below before confirming.');const dest=parsed.city?`${parsed.city}, ${parsed.state}`:parsed.state;speakText(lang==='ta'?`நீங்கள் ${dest} சென்றதாக புரிந்துகொண்டோம். வேலை: ${parsed.occupation}. சரிபார்த்து உறுதிப்படுத்தவும்.`:`We understood the destination as ${dest}. Occupation: ${parsed.occupation}. Please review and confirm.`,lang);}else setMessage(lang==='ta'?'இடத்தை கண்டறிய முடியவில்லை. நகரம் அல்லது மாவட்டத்தை தெளிவாக சொல்லுங்கள்.':'I could not identify the destination. Please say a city or district clearly.');}catch(e){setMessage(e.message||'Voice processing failed.');}finally{setBusy(false);}};
    recognitionRef.current=r; return()=>{try{r.stop()}catch{}};
  },[lang,worker,onDetected]);
  const start=()=>{if(!supported){setMessage('Speech recognition is not supported here. Use Chrome or Edge.');return;}if(busy)return;try{recognitionRef.current?.start()}catch{}}; const stop=()=>recognitionRef.current?.stop();
  return <div className="voice-assistant"><div className="voice-head"><div><span className="eyebrow">VOICE MIGRATION UPDATE</span><h3>Speak your move</h3><p>English or Tamil. The voice is transcribed first, then location, district, city, reason and occupation are extracted into editable fields.</p></div><div className="voice-langs"><button className={lang==='en'?'active':''} onClick={()=>setLang('en')}>English</button><button className={lang==='ta'?'active':''} onClick={()=>setLang('ta')}>தமிழ்</button></div></div><div className={`mic-zone ${listening?'listening':''}`}><button type="button" className="mic-button" onClick={listening?stop:start} aria-label="Speak migration update"><span>{busy?'…':listening?'■':'🎙'}</span></button><div><b>{busy?(lang==='ta'?'புரிந்துகொள்கிறோம்…':'Processing…'):listening?(lang==='ta'?'கேட்கிறோம்…':'Listening…'):(lang==='ta'?'மைக்ரோஃபோனைத் தொடவும்':'Tap the microphone')}</b><small>{lang==='ta'?'உதாரணம்: நான் திருநெல்வேலியிலிருந்து புனேக்கு எலக்ட்ரீசியன் வேலைக்காக சென்றேன்.':'Example: I moved from Tirunelveli to Pune for an electrician job.'}</small></div></div>{transcript&&<div className="transcript-box"><span>TRANSCRIPT</span><p>{transcript}</p></div>}{message&&<div className="voice-message">{message}</div>}{!supported&&<div className="voice-warning">Speech recognition is unavailable in this browser. Use Chrome or Edge for the microphone demo.</div>}</div>;
}

function MigrationPage({worker,onUpdated}) {
  const [form,setForm]=useState({state:worker.state,district:worker.district,city:worker.city,occupation:worker.occupation,reason:"New Job"});
  const [error,setError]=useState(""); const [done,setDone]=useState(null); const [voiceData,setVoiceData]=useState(null);
  useEffect(()=>setForm({state:worker.state,district:worker.district,city:worker.city,occupation:worker.occupation,reason:"New Job"}),[worker]);
  const update=(k,v)=>setForm(f=>({...f,[k]:v}));
  const onDetected=useCallback((parsed)=>{setVoiceData(parsed);setForm(f=>({...f,state:parsed.state||f.state,district:parsed.district||f.district,city:parsed.city||f.city,occupation:parsed.occupation||f.occupation,reason:parsed.reason||f.reason}));},[]);
  const submit=async e=>{e.preventDefault();setError("");try{const d=await api("/migration/update",{method:"POST",body:JSON.stringify({workerId:worker.id,...form})});setDone(d);onUpdated(d.worker,d.event)}catch(err){setError(err.message)}};
  if(done)return <div className="page"><div className="success-screen"><div className="success-mark">✓</div><span className="eyebrow">{done.event.isMigration===false?'LOCATION UPDATE CONFIRMED':'MIGRATION EVENT CONFIRMED'}</span><h1>{done.event.isMigration===false?'Same location':<>{done.event.fromState} <i>→</i> {done.event.toState}</>}</h1><p>{done.event.fromCity} → {done.event.toCity}</p><div className="event-summary"><div><small>Previous</small><b>{done.event.fromCity}, {done.event.fromState}</b></div><div><small>New confirmed location</small><b>{done.event.toCity}, {done.event.toState}</b></div><div><small>Reason</small><b>{done.event.reason}</b></div></div><button className="btn primary" onClick={()=>setDone(null)}>Make another update</button></div></div>;
  return <div className="page"><div className="page-head"><span className="eyebrow">CONSENT-BASED UPDATE</span><h1>Where are you working now?</h1><p>You decide when to report a move. ShramPulse does not continuously track your location.</p></div>
    <VoiceMigrationAssistant worker={worker} onDetected={onDetected}/>
    {voiceData&&<div className="voice-detected"><div><span className="eyebrow">VOICE DETAILS DETECTED</span><h3>Review before submitting</h3><p>The detected destination has been placed into the editable form below. Nothing changes until you confirm.</p></div><span className="review-pill">✓ Ready to review</span></div>}
    <form className="migration-form" onSubmit={submit}><div className="form-section"><div className="section-number">01</div><div><h3>New location</h3><p>Tell us your current work location, or edit what voice detection found.</p><div className="form-grid"><label>State<select value={form.state} onChange={e=>setForm(f=>({...f,state:e.target.value,district:"",city:""}))}>{INDIAN_STATES.map(x=><option key={x}>{x}</option>)}</select></label><SuggestInput label="District" value={form.district} onChange={v=>update("district",v)} state={form.state} placeholder="Type district — e.g. k" required/><SuggestInput label="City / town" value={form.city} onChange={v=>update("city",v)} state={form.state} placeholder="Type city / town" required/><label>Occupation<select value={form.occupation} onChange={e=>update("occupation",e.target.value)}>{OCCUPATIONS.map(x=><option key={x}>{x}</option>)}</select></label></div></div></div><div className="form-section"><div className="section-number">02</div><div><h3>Why did you move?</h3><div className="reason-grid">{["New Job","Seasonal Work","Returned Home","Other"].map(r=><button type="button" className={form.reason===r?"reason active":"reason"} onClick={()=>update("reason",r)} key={r}><span>{form.reason===r?"✓":"○"}</span>{r}</button>)}</div></div></div>{error&&<div className="error-box">⚠ {error}</div>}<div className="migration-submit"><div><b>From</b><span>{worker.city}, {worker.state}</span><i>→</i><b>To</b><span>{form.city||"New city"}, {form.state}</span></div><button className="btn primary">Confirm migration <b>→</b></button></div></form></div>;
}

function ProfilePage({worker,onSaved}) { const [form,setForm]=useState(worker);const [msg,setMsg]=useState("");const save=async e=>{e.preventDefault();try{const d=await api(`/workers/${worker.id}`,{method:"PUT",body:JSON.stringify(form)});onSaved(d.worker);setMsg("Profile updated successfully.")}catch(err){setMsg(err.message)}};return <div className="page"><div className="page-head"><span className="eyebrow">YOUR IDENTITY</span><h1>Profile & preferences</h1><p>Edit your details anytime. Location changes made here are profile edits; migration history is created through a confirmed migration update.</p></div><form className="profile-card" onSubmit={save}><div className="profile-banner"><div className="big-avatar">{worker.name.charAt(0)}</div><div><h2>{worker.name}</h2><span>{worker.id} · {worker.occupation}</span></div></div><div className="form-grid"><label>Full name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Mobile<input value={form.mobile} onChange={e=>setForm({...form,mobile:e.target.value})}/></label><label>Occupation<select value={form.occupation} onChange={e=>setForm({...form,occupation:e.target.value})}>{OCCUPATIONS.map(x=><option key={x}>{x}</option>)}</select></label><label>State<select value={form.state} onChange={e=>setForm({...form,state:e.target.value,district:"",city:""})}>{INDIAN_STATES.map(x=><option key={x}>{x}</option>)}</select></label><SuggestInput label="District" value={form.district} onChange={v=>setForm({...form,district:v})} state={form.state} placeholder="Type district"/><SuggestInput label="City" value={form.city} onChange={v=>setForm({...form,city:v})} state={form.state} placeholder="Type city"/><label>Masked ID<input value={`XXXX-XXXX-${form.aadhaarLast4||"----"}`} disabled/></label></div>{msg&&<div className="success-box">✓ {msg}</div>}<button className="btn primary">Save profile <b>→</b></button></form></div>; }

function WorkerApp({worker,setWorker,onLogout,theme,setTheme}) { const [page,setPage]=useState("home");const update=(w)=>{setWorker(w);localStorage.setItem("sp_worker",JSON.stringify(w))};return <WorkerLayout worker={worker} setWorker={update} page={page} setPage={setPage} onLogout={onLogout} theme={theme} setTheme={setTheme}>{page==="home"&&<WorkerHome worker={worker} setPage={setPage} onUpdate={()=>setPage("migration")}/>} {page==="migration"&&<MigrationPage worker={worker} onUpdated={(w)=>update(w)}/>} {page==="opportunities"&&<div className="page"><div className="page-head"><span className="eyebrow">SMART MATCHING</span><h1>Opportunities for {worker.name.split(" ")[0]}</h1><p>Matching considers your confirmed state, city and occupation.</p></div><div className="job-grid">{jobData.filter(j=>j.state===worker.state || j.occupation===worker.occupation).map(j=><JobCard key={j.id} job={j}/>)}</div></div>} {page==="schemes"&&<div className="page"><div className="page-head"><span className="eyebrow">WELFARE SUPPORT</span><h1>Support that travels with you.</h1><p>These are information cards for genuine schemes; production enrollment would use official channels.</p></div><div className="scheme-grid">{schemeData.map(s=><SchemeCard key={s.id} scheme={s}/>)}</div></div>} {page==="profile"&&<ProfilePage worker={worker} onSaved={update}/>}</WorkerLayout>; }

function GovLogin({go,onLogin,theme,setTheme}) {
  const [username,setUsername]=useState("authorized@shrampulse.demo");
  const [password,setPassword]=useState("ShramPulse@2026");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const submit=async e=>{e.preventDefault();setError("");setBusy(true);try{const d=await api("/auth/authorized/login",{method:"POST",body:JSON.stringify({username:username.trim(),password})});localStorage.setItem("sp_gov",JSON.stringify(d));onLogin(true);go("gov-dashboard")}catch(err){setError(err.message||"Authorized login failed. Check that the backend is running on port 5050.")}finally{setBusy(false)}};
  return <AuthShell go={go} theme={theme} setTheme={setTheme}><div className="auth-card"><div className="auth-kicker">AUTHORIZED ACCESS</div><h1>Mobility intelligence.</h1><p>A separate analytics workspace for authorized demo administrators.</p><form onSubmit={submit}><label>Administrator ID<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username"/></label><label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password"/></label>{error&&<div className="error-box">⚠ {error}</div>}<button className="btn dark full" disabled={busy}>{busy?"Authenticating…":"Authenticate"} <b>↗</b></button></form><div className="demo-note">Fixed authorized login: authorized@shrampulse.demo / ShramPulse@2026</div><div className="demo-note">The authorized portal is separate from the worker portal.</div></div></AuthShell>;
}

function Heatmap({states,flows,migrationDestinations=[],theme='light'}) {
  const [hover, setHover] = useState(null);
  // The dashboard map is a migration heatmap: it counts confirmed destination
  // events from the backend, not every registered worker. This keeps a newly
  // registered worker off the migration map until they actually move.
  const counts=Object.fromEntries((migrationDestinations||[]).map(s=>[canonicalStateName(s.name),Number(s.count)||0]));
  const max=Math.max(1,...Object.values(counts));
  const dark=theme==='dark';
  const color=(n)=>{
    const t=n/max;
    if(t===0)return dark?'#1a2620':'#eef2ef';
    if(t<.25)return dark?'#244b31':'#d8f2d5';
    if(t<.5)return dark?'#2f7541':'#9ed98f';
    if(t<.75)return dark?'#3fa95b':'#4fbf58';
    return dark?'#64d27d':'#14863b';
  };
  const nameOf=(geo)=>canonicalStateName(geo.properties?.ST_NM||geo.properties?.NAME_1||geo.properties?.st_nm||geo.properties?.State_Name||geo.properties?.name||'');
  const topFlows=(flows||[]).slice(0,4);
  return <div className="heatmap-card">
    <div className="map-top"><div><span className="eyebrow">INDIA MIGRATION HEATMAP</span><h2>Confirmed migration destinations</h2><small className="map-caption">Only worker-confirmed moves are counted. Registrations alone do not create a hotspot.</small></div>
      <div className="legend"><span>Low</span><i className="heat-0"/><i className="heat-1"/><i className="heat-2"/><i className="heat-3"/><i className="heat-4"/><span>High</span></div>
    </div>
    <div className="map-wrap"><ComposableMap projection="geoMercator" projectionConfig={{scale:880,center:[82,22]}} width={700} height={570}>
      <Geographies geography={MAP_URL}>{({geographies})=>geographies.map(geo=>{const name=nameOf(geo);const count=counts[name]||0;return <Geography key={geo.rsmKey} geography={geo} onMouseEnter={()=>setHover({name,count})} onMouseLeave={()=>setHover(null)} style={{default:{fill:color(count),outline:"none",stroke:dark?"#5a6a60":"#ffffff",strokeWidth:.65},hover:{fill:"#ff9f1c",outline:"none",stroke:"#ffffff",strokeWidth:1.2},pressed:{fill:"#ff9f1c",outline:"none"}}}/>})}</Geographies>
    </ComposableMap>{hover&&<div className="map-tooltip"><b>{hover.name}</b><span>{hover.count} confirmed move{hover.count===1?"":"s"}</span></div>}</div>
    <div className="map-flow-strip">{topFlows.map(f=><div key={f.key}><b>{f.fromState}</b><span>→</span><b>{f.toState}</b><em>{f.count}</em></div>)}</div>
  </div>;
}
function AssistantText({text}) {
  const lines=String(text||'').split(/\r?\n/);
  return <div className="assistant-rich-text">{lines.map((line,i)=>{
    const parts=line.split(/(\*\*[^*]+\*\*)/g);
    return <div className={line.trim().startsWith('•')||/^\d+\./.test(line.trim())?'assistant-list-line':'assistant-text-line'} key={i}>
      {parts.map((p,j)=>p.startsWith('**')&&p.endsWith('**')?<strong key={j}>{p.slice(2,-2)}</strong>:p)}
    </div>;
  })}</div>;
}

function GovAssistant(){
  const [input,setInput]=useState('');
  const [messages,setMessages]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [sessionId,setSessionId]=useState(null);
  const [listening,setListening]=useState(false),[supported,setSupported]=useState(true),[busy,setBusy]=useState(false);
  const recognitionRef=useRef(null); const sendRef=useRef(null);
  const loadHistory=useCallback(async()=>{try{const d=await api('/chat/sessions');setSessions(d.sessions||[]);}catch{}},[]);
  const createChat=useCallback(async()=>{try{const d=await api('/chat/sessions',{method:'POST',body:JSON.stringify({title:'New chat'})});setSessionId(d.session);setMessages([]);await loadHistory();}catch(e){setMessages([{role:'assistant',text:'⚠️ I could not start a new chat. Please try again.'}]);}},[loadHistory]);
  useEffect(()=>{loadHistory().then(()=>createChat());},[loadHistory,createChat]);
  const openChat=async(id)=>{try{const d=await api(`/chat/sessions/${id}/messages`);setSessionId(id);setMessages((d.messages||[]).map(m=>({role:m.role,text:m.content})));}catch{}}
  const send=useCallback(async(text=input)=>{const q=String(text||'').trim();if(!q||busy)return;setInput('');setBusy(true);setMessages(m=>[...m,{role:'user',text:q},{role:'assistant',text:'🤖 Thinking…'}]);try{if(!sessionId){await createChat();return;}const d=await api('/ai/chat',{method:'POST',body:JSON.stringify({message:q,sessionId})});const answer=d.answer||'I could not find a reliable live-data answer.';setMessages(m=>{const copy=m.slice();copy[copy.length-1]={role:'assistant',text:answer};return copy});await loadHistory();}catch(e){setMessages(m=>{const copy=m.slice();copy[copy.length-1]={role:'assistant',text:`⚠️ ${e.message||'AI service is unavailable.'}`};return copy});}finally{setBusy(false);}},[input,busy,sessionId,createChat,loadHistory]);
  sendRef.current=send;
  useEffect(()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){setSupported(false);return;}const r=new SR();r.continuous=false;r.interimResults=true;r.maxAlternatives=5;r.lang='en-IN';r.onstart=()=>setListening(true);r.onend=()=>setListening(false);r.onerror=e=>{setListening(false);setMessages(m=>[...m,{role:'assistant',text:e.error==='not-allowed'?'🎙️ Microphone access is required for voice input.':'🎙️ Voice recognition could not complete. Please try again or type your question.'}] )};r.onresult=e=>{let finalText='';for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)finalText+=e.results[i][0]?.transcript||'';if(finalText.trim())sendRef.current?.(finalText.trim());};recognitionRef.current=r;return()=>{try{r.stop()}catch{}}},[]);
  const start=()=>{if(!supported){setMessages(m=>[...m,{role:'assistant',text:'🎙️ Voice recognition is not supported in this browser. Please use Chrome/Edge or type your question.'}]);return;}try{recognitionRef.current?.start()}catch{}};
  return <div className="assistant-layout"><aside className="chat-history"><div className="history-head"><b>Chat History</b><button className="new-chat-btn" onClick={createChat}>＋ New Chat</button></div><div className="history-list">{sessions.map(s=><button className={`history-item ${s.id===sessionId?'active':''}`} key={s.id} onClick={()=>openChat(s.id)}><div><b>{s.title||'New chat'}</b><small>{new Date(s.updatedAt||s.createdAt).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small></div></button>)}</div></aside><section className="chat-panel"><div className="assistant-head"><div><span className="eyebrow">AUTHORIZED AI ASSISTANT</span><h2>Ask ShramPulse</h2><p>English only. Answers use fresh Supabase worker and employment data. Government schemes or job recommendations are provided only when you explicitly ask.</p></div></div><div className="assistant-messages">{messages.length===0&&<div className="empty-card"><b>👋 Hello!</b><p>Ask me about current worker locations, state migration counts, employment sectors, occupations or migration flows.</p></div>}{messages.map((m,i)=><div className={`chat-bubble ${m.role}`} key={i}><span>{m.role==='assistant'?'SP':'You'}</span><AssistantText text={m.text}/>{m.role==='assistant'&&<button className="speak-btn" onClick={()=>speakText(m.text,'en')}>🔊</button>}</div>)}</div><div className="assistant-input"><button type="button" onClick={listening?()=>recognitionRef.current?.stop():start} title={listening?'Stop voice input':'Start voice input'}>{listening?'■':'🎙'}</button><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')send()}} placeholder="Ask about the live ShramPulse data…" disabled={busy}/><button type="button" onClick={()=>send()} disabled={busy}>{busy?'…':'Send'}</button></div>{!supported&&<small className="assistant-note">Voice recognition is unavailable in this browser. Type your question instead.</small>}</section></div>;
}

function DynamicBarChart({items,labelKey='name',valueKey='count',employment=false}){
  const sorted=items.slice().sort((a,b)=>b[valueKey]-a[valueKey]||String(a[labelKey]).localeCompare(String(b[labelKey])));
  const max=Math.max(1,...sorted.map(x=>Number(x[valueKey])||0));
  return <div className={`bar-chart ${employment?'employment-chart':''}`}>{sorted.map((x,i)=>{const value=Number(x[valueKey])||0;const height=value?Math.max(8,(value/max)*100):2;return <div className="chart-column" key={String(x[labelKey])}><strong className="chart-value">{value}</strong><div className="chart-bar-wrap"><i className={employment?`sector-bar sector-${i%6}`:''} style={{height:`${height}%`,opacity:value?1:.25}}/></div><b className="chart-label" title={x[labelKey]}>{x[labelKey]}</b></div>})}</div>;
}

function ReportHeatmap({states}) {
  const counts=Object.fromEntries(states.map(s=>[canonicalStateName(s.name),s.count]));
  const max=Math.max(1,...states.map(s=>s.count));
  const color=(n)=>{const t=n/max;if(t===0)return '#eef2ef';if(t<.25)return '#d8f2d5';if(t<.5)return '#9ed98f';if(t<.75)return '#4fbf58';return '#14863b'};
  const nameOf=(geo)=>canonicalStateName(geo.properties?.ST_NM||geo.properties?.NAME_1||geo.properties?.st_nm||geo.properties?.State_Name||geo.properties?.name||'');
  return <div className="report-map-wrap"><ComposableMap projection="geoMercator" projectionConfig={{scale:880,center:[82,22]}} width={820} height={620}><Geographies geography={MAP_URL}>{({geographies})=>geographies.map(geo=>{const name=nameOf(geo);const count=counts[name]||0;return <Geography key={geo.rsmKey} geography={geo} style={{default:{fill:color(count),outline:'none',stroke:'#ffffff',strokeWidth:.65},hover:{fill:'#ff9f1c',outline:'none',stroke:'#ffffff',strokeWidth:1},pressed:{fill:'#ff9f1c',outline:'none'}}}/>})}</Geographies></ComposableMap></div>;
}

function SectorTrendChart({trends}) {
  const width=900,height=390,pad={l:58,r:24,t:28,b:58};
  const months=trends?.[0]?.data||[];
  const max=Math.max(1,...(trends||[]).flatMap(t=>t.data.map(d=>Number(d.count)||0)));
  const colors=['#14863b','#2678c7','#e49b25','#8057b8','#d25b75','#68757e'];
  const x=i=>pad.l+(months.length<=1?0:i*(width-pad.l-pad.r)/Math.max(1,months.length-1));
  const y=v=>pad.t+(height-pad.t-pad.b)-(v/max)*(height-pad.t-pad.b);
  return <div className="trend-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Migration trend by employment sector">{[0,.25,.5,.75,1].map((t,i)=>{const yy=y(t*max);return <g key={i}><line x1={pad.l} x2={width-pad.r} y1={yy} y2={yy} stroke="#dce5df" strokeWidth="1"/><text x={pad.l-10} y={yy+4} textAnchor="end" fontSize="11" fill="#66766d">{Math.round(t*max)}</text></g>})}{months.map((m,i)=><text key={m.month} x={x(i)} y={height-28} textAnchor="middle" fontSize="11" fill="#66766d">{m.label}</text>)}{(trends||[]).map((trend,si)=>{const points=trend.data.map((d,i)=>`${x(i)},${y(Number(d.count)||0)}`).join(' ');return <g key={trend.name}><polyline fill="none" stroke={colors[si%colors.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points}/>{trend.data.map((d,i)=><circle key={`${trend.name}-${i}`} cx={x(i)} cy={y(Number(d.count)||0)} r="3.5" fill={colors[si%colors.length]}/>)}</g>})}</svg><div className="trend-legend">{(trends||[]).map((t,i)=><span key={t.name}><i style={{background:colors[i%colors.length]}}/>{t.name}</span>)}</div></div>;
}

function ReportPage({data,theme='light'}) {
  const [generated,setGenerated]=useState(new Date());
  const reportRef=useRef(null);
  const r=data.report||{};
  const topStates=data.states.slice(0,8), topCities=r.topCities||[], topOcc=r.topOccupations||[];
  const period=new Date(`${r.periodKey||''}-01T00:00:00`);
  const monthTitle=r.period||period.toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  const printReport=()=>{setGenerated(new Date());setTimeout(()=>window.print(),50)};
  const downloadReport=async()=>{
    if(!reportRef.current)return;
    setGenerated(new Date());
    const options={margin:0,filename:`ShramPulse_Migration_Report_${(r.periodKey||'live')}.pdf`,image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy']}};
    await html2pdf().set(options).from(reportRef.current).save();
  };
  return <div className={`report-only site-report-${theme}`}>
    <div className="report-toolbar"><button onClick={downloadReport}>⇩ Download PDF</button><button onClick={printReport}>⎙ Print</button></div>
    <div ref={reportRef} className="report-document">
    <div className="report-page">
      <div className="report-title">SHRAMPULSE</div><div className="report-main-title">MIGRATION INTELLIGENCE REPORT</div><div className="report-period">Report Period: {monthTitle.toUpperCase()}</div>
      <div className="report-section-head">Section 1 - MIGRATION OVERVIEW <span>(All values are dynamic from live Supabase data)</span></div>
      <div className="report-two-col"><div className="report-box report-overview"><b>Total Registered Workers:</b> {r.totalWorkers||0}<br/><b>Location Updates Received:</b> {r.updatesReceived||0}<br/><b>Workers who confirmed “same location”:</b> {r.sameLocation||0}<br/><b>Workers who reported migration:</b> {r.migrations||0}<br/><b>Workers who did not respond to monthly update:</b> {r.noResponse||0}</div><div className="report-box report-bullets"><b>High-demand destination</b><br/>• {r.highDemandDestination||'No data'}<br/>• {topCities[0]?.name||'No city data'}<br/>• {topCities[1]?.name||'No second destination recorded'}<br/><br/><b>Low recorded inflow</b><br/>• {r.lowInflowDestination||'No data'}</div></div>
      <div className="report-grid-2">
        <div><div className="report-section-head">Section 2 - MIGRATION STATUS <span>(Dynamic Data)</span></div><div className="report-box"><b>Highest migration state:</b> {data.states[0]?.name||'—'}<br/><b>Lowest migration state:</b> {data.states[data.states.length-1]?.name||'—'}<br/><b>Highest migration city:</b> {topCities[0]?.name||'—'}<br/><b>Top origin → destination route:</b> {r.topOriginDestination||'—'}<br/><b>Most affected occupation:</b> {r.mostAffectedOccupation||'—'}<br/><b>Total migration events:</b> {r.totalMigrationEvents||0}</div></div>
        <div><div className="report-section-head">Section 5 - TREND ANALYSIS</div><div className="report-box report-mini-trend"><div><b>{r.previousMonthEvents||0}</b><small>{r.previousMonthEvents? 'Previous month':'Previous month'}</small></div><div><b>{r.currentMonthEvents||0}</b><small>{monthTitle}</small></div><div><b>{r.changePct>=0?'+':''}{Number(r.changePct||0).toFixed(1)}%</b><small>Change</small></div></div></div>
      </div>
      <div className="report-grid-2">
        <div><div className="report-section-head">Section 3 - STATE-WISE MIGRATION</div><div className="report-table"><div className="rt-head"><b>State</b><b>Migrants</b><b>Share</b></div>{topStates.map(s=><div className="rt-row" key={s.name}><span>{s.name}</span><span>{s.count}</span><span>{r.totalWorkers?((s.count/r.totalWorkers)*100).toFixed(1):'0.0'}%</span></div>)}</div></div>
        <div><div className="report-section-head">Section 5 - RESPONSE ANALYSIS</div><div className="report-box"><b>Updates received:</b> {r.updatesReceived||0}<br/><b>Same location:</b> {r.sameLocation||0}<br/><b>Migration reports:</b> {r.migrations||0}<br/><b>No response:</b> {r.noResponse||0}<br/><b>Response rate:</b> {r.responseRate||0}%</div><div className="report-section-head report-gap-head">Section 7 - MIGRATION & OPPORTUNITY GAP</div><div className="report-box">{(r.highDemandDestinations||[]).slice(0,3).map((x,i)=><div key={x.name}>• <b>{x.name}</b> — {x.count} recorded inflow{ x.count===1?'':'s'}</div>)}{!(r.highDemandDestinations||[]).length&&<div>• No migration inflow recorded for this period.</div>}</div></div>
      </div>
      <div className="report-grid-2 report-bottom-grid"><div><div className="report-section-head">Section 4 - CITY / OCCUPATION INSIGHTS</div><div className="report-box report-list">• <b>Top migrant cities:</b> {topCities.map(x=>x.name).join(', ')||'No data'}<br/>• <b>Major occupations:</b> {topOcc.map(x=>x.name).join(', ')||'No data'}<br/>• <b>High-demand destinations:</b> {(r.highDemandDestinations||[]).slice(0,3).map(x=>x.name).join(', ')||'No data'}<br/>• <b>Low inflow locations:</b> {(r.lowInflowDestinations||[]).slice(0,2).map(x=>x.name).join(', ')||'No data'}</div></div><div><div className="report-section-head">Section 8 - KEY OBSERVATIONS</div><div className="report-box report-list">{(r.observations||[]).slice(0,4).map((x,i)=><div key={i}>• {x}</div>)}</div></div></div>
      <div className="report-footer">Generated by <b>ShramPulse</b> | Report generated: {generated.toLocaleString('en-IN')} | Live Supabase / Demonstration Data <span>Page 1 of 3</span></div>
    </div>

    <div className="report-page report-page-2">
      <div className="report-title">SHRAMPULSE</div><div className="report-main-title small">NATIONAL MOBILITY HEATMAP</div><div className="report-period">Current confirmed worker concentration</div>
      <div className="report-section-head">Section 9 - INDIA MIGRATION HEATMAP <span>(Dynamic state-wise worker data)</span></div>
      <div className="report-map-box"><ReportHeatmap states={data.states}/><div className="report-legend"><span>Low</span><i/><i/><i/><i/><i/><span>High</span></div></div>
      <div className="report-grid-2 heatmap-bottom"><div><div className="report-section-head">STATE CONCENTRATION</div><div className="report-table compact">{topStates.slice(0,6).map((s,i)=><div className="rt-row" key={s.name}><span><b>{i+1}.</b> {s.name}</span><span>{s.count}</span><span>{r.totalWorkers?((s.count/r.totalWorkers)*100).toFixed(1):'0.0'}%</span></div>)}</div></div><div><div className="report-section-head">TOP CONFIRMED FLOWS</div><div className="report-box report-list">{(data.flows||[]).slice(0,7).map(f=><div key={f.key}>• <b>{f.fromState}</b> → <b>{f.toState}</b> — {f.count} move{f.count===1?'':'s'}</div>)}{!data.flows.length&&<div>• No confirmed migration flows yet.</div>}</div><div className="report-section-head">HEATMAP LEGEND</div><div className="report-box">Darker green indicates a higher number of currently active workers in that state. Values are recalculated from live worker records each time the report is generated.</div></div></div>
      <div className="report-footer">Generated by <b>ShramPulse</b> | Dynamic state map from live Supabase data <span>Page 2 of 3</span></div>
    </div>

    <div className="report-page report-page-3">
      <div className="report-title">SHRAMPULSE</div><div className="report-main-title small">SECTOR MIGRATION TRENDS</div><div className="report-period">Six-month dynamic trend from confirmed migration events</div>
      <div className="report-section-head">Section 10 - EMPLOYMENT SECTOR TREND ANALYSIS <span>(Dynamic monthly data)</span></div>
      <div className="report-box trend-box"><SectorTrendChart trends={data.sectorTrends||[]}/></div>
      <div className="report-section-head">CURRENT EMPLOYMENT SECTOR SNAPSHOT</div>
      <div className="sector-report-grid">{(data.employmentInsights||[]).map((x,i)=><div className="sector-report-card" key={x.name}><span>{x.name}</span><b>{x.count}</b><small>active worker{ x.count===1?'':'s'}</small></div>)}</div>
      <div className="report-grid-2"><div><div className="report-section-head">SECTOR DEFINITIONS</div><div className="report-box report-list"><div>• <b>Construction & Infrastructure:</b> Construction Worker, Electrician, Welder, Plumber</div><div>• <b>Manufacturing & Industrial Production:</b> Factory / Production Worker and related roles</div><div>• <b>Agriculture:</b> Agricultural Worker and related roles</div><div>• <b>Transportation & Logistics:</b> Driver, delivery, transport and logistics roles</div><div>• <b>Services & Security:</b> Security and service roles</div><div>• <b>Others:</b> Everything else</div></div></div><div><div className="report-section-head">DYNAMIC TREND NOTES</div><div className="report-box report-list">{(r.observations||[]).map((x,i)=><div key={i}>• {x}</div>)}<div>• Trend values represent confirmed migration events classified using the same occupation-to-sector rules used by the Government dashboard.</div></div></div></div>
      <div className="report-footer">Generated by <b>ShramPulse</b> | Dynamic sector trends and current sector counts <span>Page 3 of 3</span></div>
    </div>
    </div>
  </div>;
}

function GovDashboard({onLogout,theme,setTheme}) {
  const [data,setData]=useState(null);const [loading,setLoading]=useState(true);const [tab,setTab]=useState('overview');
  const load=async()=>{try{const d=await api('/analytics');setData(d)}catch{}finally{setLoading(false)}};
  useEffect(()=>{load();const t=setInterval(load,3000);return()=>clearInterval(t)},[]);
  if(loading||!data)return <div className="gov-loading"><Logo/><div>Loading live mobility intelligence…</div></div>;
  return <div className="gov-shell"><aside className="gov-sidebar"><Logo/><div className="gov-label">AUTHORIZED WORKSPACE</div><nav>{[['overview','Overview','▦'],['migration','Migration flows','↗'],['graph','Graph','▥'],['insights','Employment insights','◌'],['report','Migration report','▤'],['assistant','AI Assistant','✦']].map(([id,l,i])=><button className={tab===id?'active':''} onClick={()=>setTab(id)} key={id}><span>{i}</span>{l}</button>)}</nav><div className="gov-side-bottom"><ThemeToggle theme={theme} setTheme={setTheme}/><button onClick={onLogout}>↪ Sign out</button></div></aside><main className="gov-main"><header className="gov-header"><div><span className="eyebrow">SHRAMPULSE / MOBILITY INTELLIGENCE</span><h1>{tab==='overview'?'National mobility overview':tab==='migration'?'Migration flows':tab==='graph'?'Migrant state graph':tab==='assistant'?'Authorized AI assistant':tab==='report'?'Migration intelligence report':'Employment insights'}</h1></div><div className="admin-chip"><span>●</span> Authorized Demo Admin <ThemeToggle theme={theme} setTheme={setTheme}/></div></header>{tab==='overview'&&<><div className="metric-grid">{[[data.totals.workers,'Registered workers','Live Supabase profiles'],[data.totals.states,'States represented','Current confirmed locations'],[data.totals.updates,'Migration events','Worker-confirmed updates'],[data.totals.migrants,'Active movers','Workers with migration history']].map(([n,l,s])=><div className="metric" key={l}><strong>{n}</strong><span>{l}</span><small>{s}</small></div>)}</div><div className="gov-grid"><Heatmap states={data.states} flows={data.flows} migrationDestinations={data.migrationDestinations} theme={theme}/><div className="side-analytics"><div className="analytics-card"><div className="card-head"><div><span className="eyebrow">EMPLOYMENT MIX</span><h2>Who is working?</h2></div></div>{data.employmentInsights.map((x,i)=><div className="bar-row" key={x.name}><span>{x.name}</span><div><i style={{width:`${Math.max(2,(x.count/Math.max(1,data.employmentInsights[0]?.count))*100)}%`}}/></div><b>{x.count}</b></div>)}</div><div className="analytics-card recent"><div className="card-head"><div><span className="eyebrow">LIVE FEED</span><h2>Recent updates</h2></div></div>{data.recent.map(e=><div className="feed-row" key={e.id}><span className="feed-dot"/><div><b>{e.fromCity}, {e.fromState} → {e.toCity}, {e.toState}</b><small>{e.occupation} · {new Date(e.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div></div>)}{!data.recent.length&&<div className="empty-small">No migration events yet.</div>}</div></div></div></>} {tab==='migration'&&<MigrationFlows data={data}/>} {tab==='graph'&&<div className="analytics-card large graph-card"><span className="eyebrow">LIVE SUPABASE DATA</span><h2>State-wise migrant workers</h2><p className="large-copy">Highest → lowest. X axis: State · Y axis: Number of Migrants. Every value is calculated from current active worker records.</p><DynamicBarChart items={data.states}/></div>} {tab==='insights'&&<div className="analytics-card large graph-card"><span className="eyebrow">LIVE SUPABASE DATA</span><h2>Employment insights</h2><p className="large-copy">Workers are automatically classified from their current job role. X axis: Sector · Y axis: Number of Migrant Workers.</p><DynamicBarChart items={data.employmentInsights} employment/><div className="sector-legend">{data.employmentInsights.map((x,i)=><span key={x.name}><i className={`sector-dot sector-${i%6}`}/>{x.name}</span>)}</div></div>} {tab==='report'&&<ReportPage data={data} theme={theme}/>} {tab==='assistant'&&<GovAssistant/>}</main></div>;
}
function MigrationFlows({data}) {return <div className="gov-content-grid"><div className="analytics-card large"><span className="eyebrow">ORIGIN → DESTINATION</span><h2>Confirmed migration flows</h2>{data.flows.length?data.flows.map(f=><div className="flow-row" key={f.key}><div><b>{f.fromState}</b><small>{f.fromCity}</small></div><div className="flow-line"><i/><span>{f.count} worker{f.count!==1?"s":""}</span></div><div><b>{f.toState}</b><small>{f.toCity}</small></div></div>):<div className="empty-card">No confirmed migration flow yet. Use the Worker Portal to move someone between states.</div>}</div><div className="analytics-card"><span className="eyebrow">STATE RANKING</span><h2>Current distribution</h2>{data.states.slice().sort((a,b)=>b.count-a.count).map((s,i)=><div className="rank-row" key={s.name}><b>{String(i+1).padStart(2,"0")}</b><span>{s.name}</span><strong>{s.count}</strong></div>)}</div></div>}
function App(){
  const [screen,setScreen]=useState("splash");
  const [worker,setWorker]=useState(()=>storedJSON("sp_worker"));
  const [gov,setGov]=useState(()=>!!storedJSON("sp_gov"));
  const [theme,setTheme]=useState(()=>localStorage.getItem("sp_theme")||"light");
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem("sp_theme",theme)},[theme]);
  const logoutWorker=()=>{localStorage.removeItem("sp_worker");setWorker(null);setScreen("landing")};
  const logoutGov=()=>{localStorage.removeItem("sp_gov");setGov(false);setScreen("landing")};
  if(screen==="splash")return <Splash onDone={()=>setScreen(worker?"worker-home":gov?"gov-dashboard":"landing")}/>;
  if(screen==="landing")return <Landing go={setScreen} theme={theme} setTheme={setTheme}/>;
  if(screen==="worker-login")return <WorkerLogin go={setScreen} onLogin={setWorker} theme={theme} setTheme={setTheme}/>;
  if(screen==="worker-signup")return <WorkerSignup go={setScreen} onLogin={setWorker} theme={theme} setTheme={setTheme}/>;
  if(screen==="gov-login")return <GovLogin go={setScreen} onLogin={setGov} theme={theme} setTheme={setTheme}/>;
  if(screen==="gov-dashboard"&&gov)return <GovDashboard onLogout={logoutGov} theme={theme} setTheme={setTheme}/>;
  if(screen==="worker-home"&&worker)return <WorkerApp worker={worker} setWorker={setWorker} onLogout={logoutWorker} theme={theme} setTheme={setTheme}/>;
  return <Landing go={setScreen} theme={theme} setTheme={setTheme}/>;
}

export default App;

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, AudioLines, BadgeCheck, Check, CheckCircle2,
  ChevronDown, CircleDot, Clock3, Compass, Headphones, MapPin, Mic, Navigation, Plus,
  RefreshCw, ShieldCheck, Sparkles, TrainFront, Users, Volume2, VolumeX, Wallet, Zap,
} from 'lucide-react';

type Trip = {
  origin: string; destination: string; date: string; deadline: string; passengers: number;
  budget: number; preference: string; comfort: string; accessibility: string;
  status: string; selectedPlan: string | null; activeIssue: string | null;
  arrivalOffset: number; costOffset: number;
};
type Plan = { id: string; name: string; mode: string; depart: string; arrive: string; hours: string; cost: number; changes: string; fit: string; accent: string };
type LogItem = { id: string; time: string; title: string; detail: string; kind: 'normal' | 'alert' | 'approved' };
type Message = { who: 'assistant' | 'traveler'; text: string };
type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechErrorEvent = { error: string };
type SpeechRecognizer = {
  lang: string; interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
};
const STORAGE_KEY = 'roamguard-demo-trip-v1';
const DEMO_PLAN: Plan[] = [
  { id:'express', name:'Direct express', mode:'Train', depart:'06:15', arrive:'14:40', hours:'8h 25m', cost:1450, changes:'Non-stop', fit:'Most reliable', accent:'teal' },
  { id:'comfort', name:'Comfort connection', mode:'Train + cab', depart:'07:05', arrive:'13:55', hours:'6h 50m', cost:2180, changes:'1 easy change', fit:'Earliest arrival', accent:'blue' },
  { id:'value', name:'Value route', mode:'Bus', depart:'05:30', arrive:'16:10', hours:'10h 40m', cost:890, changes:'Non-stop', fit:'Lowest cost', accent:'gold' },
];
const SAMPLE_TRIP: Trip = {
  origin:'Hyderabad', destination:'Bengaluru', date:new Date(Date.now() + 14 * 86400000).toISOString().slice(0,10), deadline:'18:00', passengers:2,
  budget:3000, preference:'Any comfortable option', comfort:'Standard', accessibility:'None specified',
  status:'Planning', selectedPlan:'comfort', activeIssue:null, arrivalOffset:0, costOffset:0,
};
const cityNames = ['Hyderabad','Bengaluru','Chennai','Mumbai','Pune','Delhi','Vijayawada','Visakhapatnam','Kochi','Mysuru','Warangal','Tirupati'];
const routesByPair: Record<string, Plan[]> = {
  'hyderabad-bengaluru': DEMO_PLAN,
  'chennai-bengaluru': [
    { id:'daytrain', name:'Intercity train', mode:'Train', depart:'07:20', arrive:'12:50', hours:'5h 30m', cost:980, changes:'Non-stop', fit:'Balanced choice', accent:'teal' },
    { id:'sleeper', name:'Overnight coach', mode:'Bus', depart:'22:00', arrive:'06:45', hours:'8h 45m', cost:1250, changes:'Non-stop', fit:'Save daytime', accent:'blue' },
    { id:'flight', name:'Airport connection', mode:'Flight + cab', depart:'09:10', arrive:'11:35', hours:'2h 25m', cost:4800, changes:'2 connections', fit:'Fastest option', accent:'gold' },
  ],
  'mumbai-pune': [
    { id:'deccan', name:'Deccan express', mode:'Train', depart:'08:10', arrive:'11:30', hours:'3h 20m', cost:740, changes:'Non-stop', fit:'Balanced choice', accent:'teal' },
    { id:'road', name:'Road transfer', mode:'Cab', depart:'07:30', arrive:'11:00', hours:'3h 30m', cost:3400, changes:'Non-stop', fit:'Door to door', accent:'blue' },
    { id:'coach', name:'Value coach', mode:'Bus', depart:'06:00', arrive:'10:15', hours:'4h 15m', cost:560, changes:'Non-stop', fit:'Lowest cost', accent:'gold' },
  ],
  'vijayawada-visakhapatnam': [
    { id:'coastal', name:'Coastal express', mode:'Train', depart:'06:45', arrive:'13:20', hours:'6h 35m', cost:860, changes:'Non-stop', fit:'Balanced choice', accent:'teal' },
    { id:'coach', name:'Day coach', mode:'Bus', depart:'07:00', arrive:'14:30', hours:'7h 30m', cost:720, changes:'Non-stop', fit:'Lowest cost', accent:'gold' },
  ],
};
const getPlans = (from: string, to: string): Plan[] => routesByPair[`${from.toLowerCase()}-${to.toLowerCase()}`] ?? [
  { id:'rail', name:'Rail connection', mode:'Train', depart:'06:30', arrive:'15:05', hours:'8h 35m', cost:1320, changes:'1 change', fit:'Balanced choice', accent:'teal' },
  { id:'coach', name:'Intercity coach', mode:'Bus', depart:'07:15', arrive:'16:40', hours:'9h 25m', cost:1080, changes:'Non-stop', fit:'Lowest cost', accent:'gold' },
];
const initialLog: LogItem[] = [
  { id:'welcome', time:'Today, 09:12', title:'Trip workspace opened', detail:'Hyderabad → Bengaluru · plan is ready to review.', kind:'normal' },
];

function readSaved(): { trip: Trip; log: LogItem[] } | null {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as { trip: Trip; log: LogItem[] } : null; } catch { return null; }
}
function localExtract(text: string): Partial<Trip> {
  const lower = text.toLowerCase();
  const found = cityNames.filter(city => lower.includes(city.toLowerCase()));
  const routeMatch = text.match(/from\s+([a-zA-Z ]+?)\s+to\s+([a-zA-Z ]+?)(?:\s+(?:on|by|before|for|with)\b|[,.;]|$)/i);
  const origin = found[0] || routeMatch?.[1]?.trim();
  const destination = found[1] || routeMatch?.[2]?.trim();
  const dateMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const relativeDate = /\btomorrow\b/i.test(text)
    ? dateAtOffset(1)
    : /\btoday\b/i.test(text)
      ? dateAtOffset(0)
      : undefined;
  const timeMatch = text.match(/\b(?:by|before|arrive by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let deadline = '';
  if (timeMatch) {
    let hour = Number(timeMatch[1]); const suffix = timeMatch[3]?.toLowerCase();
    if (suffix === 'pm' && hour < 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    deadline = `${String(hour).padStart(2,'0')}:${timeMatch[2] || '00'}`;
  }
  const passenger = text.match(/(\d+)\s+(?:people|passengers|travellers|travelers|of us)/i);
  const budget = text.match(/(?:under|budget(?:\s+of)?|within)\s*(?:₹|rs\.?\s*)?([\d,]+)/i);
  const preference = /\b(flight|flights|fly|plane)\b/i.test(text) ? 'Flight preferred'
    : /\b(bus|buses|coach|coaches)\b/i.test(text) ? 'Bus preferred'
    : /\b(trains?|rail)\b/i.test(text) ? 'Train preferred' : '';
  const accessibility = /\b(wheelchair|step-free|accessible)\b/i.test(text) ? 'Step-free access requested'
    : /\b(visual assistance|hearing assistance)\b/i.test(text) ? 'Assistance requested' : '';
  const comfort = /\b(comfort|premium|business|extra legroom)\b/i.test(text) ? 'Extra comfort requested' : '';
  return { ...(origin ? {origin: cityNames.find(c => c.toLowerCase() === origin.toLowerCase()) || titleCase(origin)} : {}),
    ...(destination ? {destination: cityNames.find(c => c.toLowerCase() === destination.toLowerCase()) || titleCase(destination)} : {}),
    ...(dateMatch ? {date:dateMatch[1]} : relativeDate ? {date:relativeDate} : {}), ...(deadline ? {deadline} : {}),
    ...(passenger ? {passengers:Number(passenger[1])} : {}), ...(budget ? {budget:Number(budget[1].replaceAll(',',''))} : {}),
    ...(preference ? {preference} : {}), ...(accessibility ? {accessibility} : {}), ...(comfort ? {comfort} : {}) };
}
function titleCase(value: string) { return value.replace(/\b\w/g, c => c.toUpperCase()); }
function dateAtOffset(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function formatDate(value: string) { if (!value) return 'Choose a date'; return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); }
function timeFrom(base: string, offset: number) {
  const [h,m] = base.split(':').map(Number); const total = h * 60 + m + offset;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

export default function Dashboard() {
  const saved = useMemo(readSaved, []);
  const [trip, setTrip] = useState<Trip>(saved?.trip ?? SAMPLE_TRIP);
  const [log, setLog] = useState<LogItem[]>(saved?.log ?? initialLog);
  const [request, setRequest] = useState('');
  const [messages, setMessages] = useState<Message[]>([{who:'assistant',text:'Tell me where you’re headed and what matters most. I’ll shape a plan for you to review.'}]);
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null);
  const [issue, setIssue] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [followUpMode, setFollowUpMode] = useState('');
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<'en'|'te'>('en');
  const [voiceState, setVoiceState] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [showTripDetails, setShowTripDetails] = useState(false);
  const [errorText, setErrorText] = useState('');
  const recognitionRef = useRef<SpeechRecognizer | null>(null);
  const plans = useMemo(() => getPlans(trip.origin, trip.destination), [trip.origin, trip.destination]);
  const hasRoute = Boolean(trip.origin && trip.destination);
  const selected = hasRoute ? plans.find(plan => plan.id === trip.selectedPlan) ?? plans[0] : undefined;
  const outputArrival = selected ? timeFrom(selected.arrive, trip.arrivalOffset) : '--:--';
  const deadlineMiss = Boolean(selected && trip.deadline && outputArrival > trip.deadline);
  const viablePlans = plans.filter(plan => plan.cost + trip.costOffset <= trip.budget);
  const t = (en: string, te: string) => lang === 'en' ? en : te;
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify({trip,log})); }, [trip,log]);
  useEffect(() => () => { recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); }, []);

  function addLog(title: string, detail: string, kind: LogItem['kind'] = 'normal') {
    setLog(prev => [{id:`${Date.now()}-${Math.random()}`,time:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),title,detail,kind},...prev]);
  }
  function requestPlan(event?: FormEvent) {
    event?.preventDefault();
    if (!request.trim()) return;
    setBusy(true); setErrorText('');
    const raw = request.trim();
    setMessages(prev => [...prev,{who:'traveler',text:raw}]);
    window.setTimeout(() => {
      const extracted = localExtract(raw);
      const newTrip = {...trip,origin:'',destination:'',...extracted,status:'Planning',selectedPlan:null,activeIssue:null,arrivalOffset:0,costOffset:0};
      setTrip(newTrip); setRequest(''); setBusy(false);
      if (!extracted.origin || !extracted.destination) {
        setMessages(prev => [...prev,{who:'assistant',text:'I have the request, but need both the starting city and destination before I can compare a route. Which cities should I use?'}]);
        setFollowUpMode(!extracted.origin ? 'origin' : 'destination');
        setFollowUp('');
      } else {
        setFollowUp(''); setFollowUpMode('');
        setMessages(prev => [...prev,{who:'assistant',text:`I found ${newTrip.origin} to ${newTrip.destination}${extracted.deadline ? `, arriving by ${extracted.deadline}` : ''}. Check the trip details, then compare the simulated options below.`}]);
        addLog('Trip request interpreted',`${newTrip.origin} → ${newTrip.destination} · local demo extraction`,'normal');
      }
    },420);
  }
  function submitFollowUp(event: FormEvent) {
    event.preventDefault();
    const cities = cityNames.filter(city => followUp.toLowerCase().includes(city.toLowerCase()));
    if (cities.length < 1) { setErrorText('Please enter a city from the suggestions, such as Hyderabad or Bengaluru.'); return; }
    const updated = {...trip};
    if (followUpMode === 'origin') updated.origin = cities[0];
    else if (followUpMode === 'destination') updated.destination = cities[0];
    else { updated.origin = cities[0]; updated.destination = cities[1] || ''; }
    if (!updated.destination) { setFollowUpMode('destination'); setFollowUp(''); setErrorText('And where are you travelling to?'); return; }
    setTrip({...updated,selectedPlan:null,status:'Planning'}); setFollowUp(''); setFollowUpMode('');
    setMessages(prev => [...prev,{who:'traveler',text:followUp},{who:'assistant',text:`Thanks. Comparing ${updated.origin} to ${updated.destination} now. Review the extracted details before choosing.`}]);
    addLog('Route details clarified',`${updated.origin} → ${updated.destination}`,'normal'); setErrorText('');
  }
  function simulate(eventName: string) {
    if (eventName === 'find alternative') {
      const candidate = plans.find(plan => plan.id !== trip.selectedPlan && plan.cost <= trip.budget);
      setPendingPlan(candidate ?? null);
      setIssue(eventName);
      if (!candidate) addLog('No feasible alternative found','All simulated choices exceed the current budget or match the selected route.','alert');
      else addLog('Alternative options recalculated',`${candidate.name} · simulated arrival ${timeFrom(candidate.arrive,0)} · ₹${candidate.cost.toLocaleString('en-IN')}`,'alert');
      return;
    }
    const impact = eventName === 'delay' ? 120 : eventName === 'cancellation' ? 240 : 180;
    setTrip(prev => ({...prev,activeIssue:eventName,status:'Disruption simulated',arrivalOffset:impact,costOffset:eventName === 'cancellation' ? 350 : 0}));
    setIssue(eventName); setPendingPlan(null);
    addLog(`${titleCase(eventName)} simulated`,`No live transport data used. Estimated arrival now ${selected ? timeFrom(selected.arrive,impact) : 'unknown'}.`,'alert');
    setMessages(prev => [...prev,{who:'assistant',text:`I’ve modelled a ${eventName}. Estimated arrival is ${selected ? timeFrom(selected.arrive,impact) : 'unknown'}${trip.deadline ? `, against your ${trip.deadline} deadline` : ''}. I have not changed your plan. Review a recovery option before approving anything.`}]);
  }
  function proposeRecovery() {
    const next = plans.filter(plan => plan.id !== trip.selectedPlan && plan.cost + trip.costOffset <= trip.budget)
      .sort((a,b) => a.cost - b.cost || a.arrive.localeCompare(b.arrive))[0];
    setPendingPlan(next ?? null); setIssue(issue || trip.activeIssue || 'recovery');
    if (!next) addLog('No feasible recovery route','Every simulated alternative misses the budget limit. Your existing plan remains unchanged.','alert');
    else addLog('Recovery recommendation prepared',`${next.name} · estimated arrival ${timeFrom(next.arrive,0)} · ₹${next.cost.toLocaleString('en-IN')}. Awaiting your approval.`,'alert');
  }
  function approveRecovery() {
    if (!pendingPlan) return;
    setTrip(prev => ({...prev,selectedPlan:pendingPlan.id,status:'Recovery approved',activeIssue:null,arrivalOffset:0,costOffset:0}));
    addLog('Recovery applied by you',`${pendingPlan.name} selected. This is a simulated plan only; no booking was made.`,'approved');
    setMessages(prev => [...prev,{who:'assistant',text:`Your plan view is updated to ${pendingPlan.name}. This is only a saved demo itinerary; nothing has been booked.`}]);
    setPendingPlan(null); setIssue('');
  }
  function keepCurrent() { setPendingPlan(null); setTrip(prev => ({...prev,status:prev.activeIssue ? 'Disruption simulated' : 'Planning'})); addLog('Recommendation declined','Current journey plan left unchanged.','normal'); }
  function updateTrip<K extends keyof Trip>(key: K, value: Trip[K]) {
    setTrip(prev => ({...prev,[key]:value,...(key === 'origin' || key === 'destination' ? {selectedPlan:null} : {})}));
  }
  function startVoice() {
    const SpeechRecognitionCtor = (window as Window & { SpeechRecognition?: new () => SpeechRecognizer; webkitSpeechRecognition?: new () => SpeechRecognizer }).SpeechRecognition
      || (window as Window & { webkitSpeechRecognition?: new () => SpeechRecognizer }).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) { setVoiceState('Speech input is not supported in this browser. You can type your request instead.'); return; }
    try {
      const recognition = new SpeechRecognitionCtor(); recognitionRef.current = recognition;
      recognition.lang = lang === 'te' ? 'te-IN' : 'en-IN'; recognition.interimResults = false;
      recognition.onstart = () => setVoiceState('Listening… speak your travel request.');
      recognition.onresult = event => { const result = event.results[0]?.[0]?.transcript ?? ''; setRequest(result); setVoiceState(result ? `Heard: “${result}”` : 'No speech detected. Please try again or type.'); };
      recognition.onerror = event => setVoiceState(event.error === 'not-allowed' ? 'Microphone permission was denied. You can type your request instead.' : `Speech input issue (${event.error}). Please type your request.`);
      recognition.onend = () => { if (recognitionRef.current === recognition) recognitionRef.current = null; };
      recognition.start();
    } catch { setVoiceState('Could not start the microphone. Please type your request instead.'); }
  }
  function speakSummary() {
    if (!('speechSynthesis' in window)) { setVoiceState('Speech output is not supported in this browser.'); return; }
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(`${trip.origin} to ${trip.destination}. ${selected?.name ?? 'No route selected'}. Estimated arrival ${outputArrival}. Cost ${selected ? selected.cost + trip.costOffset : 'not available'} rupees.`);
    utterance.lang = lang === 'te' ? 'te-IN' : 'en-IN'; utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance); setSpeaking(true);
  }
  function clearTrip() {
    const fresh = {...SAMPLE_TRIP,origin:'',destination:'',selectedPlan:null,status:'Not started'};
    setTrip(fresh); setLog([]); setMessages([{who:'assistant',text:'A fresh trip workspace is ready. Tell me where you’re headed.'}]); setPendingPlan(null); setIssue(''); setFollowUp(''); setFollowUpMode('');
  }

  const fields = [
    {label:t('From','నుండి'),key:'origin' as const,value:trip.origin},
    {label:t('To','వరకు'),key:'destination' as const,value:trip.destination},
    {label:t('Travel date','ప్రయాణ తేదీ'),key:'date' as const,value:trip.date},
    {label:t('Arrive by','చేరుకోవాల్సిన సమయం'),key:'deadline' as const,value:trip.deadline},
    {label:t('Passengers','ప్రయాణికులు'),key:'passengers' as const,value:trip.passengers},
    {label:t('Budget · ₹','బడ్జెట్ · ₹'),key:'budget' as const,value:trip.budget},
  ];
  return (
    <div className="shell flex">
      <aside className="sidebar hidden sm:flex flex-col px-4 py-5">
        <div className="sidebar-brand flex items-center gap-3 px-2 mb-10">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#244665] text-[#7de0c4]"><Compass size={21}/></div>
          <div className="brand-word"><div className="display-font text-[16px] font-extrabold tracking-tight">roamguard</div><div className="text-[10px] text-slate-400 tracking-[.12em] uppercase">AI trip companion</div></div>
        </div>
        <div className="sidebar-caption px-3 mb-3 text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Workspace</div>
        <nav className="flex flex-col gap-1">
          <button className="nav-item flex items-center gap-3 rounded-xl bg-white/10 px-3 py-3 text-left text-[12px] font-semibold text-white" data-testid="nav-dashboard" aria-current="page"><Navigation size={16} className="text-[#83dfc5]"/><span className="nav-text">{t('My journey','నా ప్రయాణం')}</span></button>
          <button onClick={() => document.getElementById('trip-planner')?.scrollIntoView({behavior:'smooth'})} className="nav-item flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] font-medium text-slate-300 hover:bg-white/5" data-testid="nav-planner"><Sparkles size={16}/><span className="nav-text">{t('Plan a trip','ప్రయాణం ప్లాన్ చేయండి')}</span></button>
          <button onClick={() => document.getElementById('activity-log')?.scrollIntoView({behavior:'smooth'})} className="nav-item flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[12px] font-medium text-slate-300 hover:bg-white/5" data-testid="nav-activity"><Activity size={16}/><span className="nav-text">{t('Journey activity','ప్రయాణ వివరాలు')}</span></button>
        </nav>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.045] p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-100"><ShieldCheck size={15} className="text-[#78d5b6]"/> Your approval comes first</div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">RoamGuard will recommend a change, never apply one without your say.</p>
        </div>
        <div className="mt-5 px-2 text-[10px] text-slate-500">Demo workspace · Local only</div>
      </aside>

      <main className="main-area min-h-[100dvh]">
        <header className="topbar sticky top-0 z-20 flex items-center justify-between border-b border-[#e4eaf1] bg-[#f8fafc]/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e9f4f1] text-[#328d79] sm:hidden"><Compass size={19}/></div>
            <div><div className="display-font text-[13px] font-extrabold text-[#203451]">Journey workspace</div><div className="text-[10px] text-[#8a96a6]">A clear plan, and a steadier next step.</div></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="pill border border-[#e5d6b2] bg-[#fff9eb] text-[#946d23]"><span className="h-1.5 w-1.5 rounded-full bg-[#d7a94f]"/>{t('SIMULATED DATA','అనుకరణ డేటా')}</span>
            <button className="secondary-btn !px-2.5 !py-2" aria-label="Toggle English and Telugu" onClick={() => setLang(lang === 'en' ? 'te' : 'en')} data-testid="button-language"><span className="text-[10px] font-extrabold">{lang === 'en' ? 'EN' : 'తె'}</span><ChevronDown size={12}/></button>
            <button className="secondary-btn hidden sm:inline-flex" onClick={speakSummary} data-testid="button-speak"><span>{speaking ? <VolumeX size={14}/> : <Volume2 size={14}/>}</span><span>{speaking ? 'Stop audio' : 'Listen'}</span></button>
          </div>
        </header>
        <div className="content-wrap">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div><div className="eyebrow mb-2 flex items-center gap-2"><span className="h-px w-5 bg-[#4ba18f]"/> TRAVEL, WITH A PLAN B</div><h1 className="display-font text-[27px] font-extrabold tracking-[-.04em] text-[#192d49] sm:text-[32px]">{t('Your journey, in good hands.','మీ ప్రయాణం, చక్కని ప్రణాళికతో.')}</h1><p className="mt-1.5 max-w-xl text-[12px] text-[#768397]">Tell us what the journey needs. We’ll make the choices easier to see.</p></div>
            <button onClick={clearTrip} className="secondary-btn" data-testid="button-new-trip"><Plus size={14}/>{t('New trip','కొత్త ప్రయాణం')}</button>
          </div>

          <section id="trip-planner" className="panel mb-5 overflow-hidden">
            <div className="grid lg:grid-cols-[1.12fr_.88fr]">
              <div className="p-5 sm:p-6">
                <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#edf5f3] text-[#3d9a85]"><Sparkles size={14}/></div><h2 className="display-font text-[14px] font-extrabold text-[#203451]">{t('Tell me about your trip','మీ ప్రయాణం గురించి చెప్పండి')}</h2></div><span className="pill bg-[#eef3f8] text-[#52647b]">DEMO MODE · LOCAL</span></div>
                <p className="mb-3 text-[11px] leading-relaxed text-[#7b899b]">Write naturally. For example: “From Hyderabad to Bengaluru on 2025-06-18, 2 people, arrive by 6 pm, under ₹3,000.”</p>
                <form onSubmit={requestPlan}>
                  <div className="relative">
                    <textarea aria-label="Describe your trip" className="field min-h-[92px] resize-y !pr-12 !leading-relaxed" placeholder="I’m travelling from… I need to arrive by…" value={request} onChange={e => setRequest(e.target.value)} data-testid="input-trip-request"/>
                    <button type="button" onClick={startVoice} className="absolute right-2 top-2 rounded-lg p-2 text-[#55718e] hover:bg-[#f0f4f8]" aria-label="Start speech input" data-testid="button-voice-input"><Mic size={16}/></button>
                  </div>
                  {voiceState && <p className="mt-1.5 flex items-start gap-1.5 text-[10px] text-[#607389]" role="status" data-testid="status-voice"><AudioLines size={13} className="mt-px shrink-0"/>{voiceState}</p>}
                  {errorText && <p className="mt-1.5 text-[10px] text-[#bc4848]" role="alert" data-testid="text-request-error">{errorText}</p>}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-[#8995a5]"><ShieldCheck size={13}/> No live schedules · no bookings · your approval always</div>
                    <button className="primary-btn" type="submit" disabled={!request.trim() || busy} data-testid="button-plan-trip">{busy ? <><RefreshCw size={14} className="animate-spin"/>Reading request…</> : <>{t('Build my plan','ప్రణాళిక చూపించు')}<ArrowRight size={14}/></>}</button>
                  </div>
                </form>
              </div>
              <div className="border-t border-[#e9eef3] bg-[#f9fbfd] p-5 sm:p-6 lg:border-l lg:border-t-0">
                <div className="mb-3 flex items-center justify-between"><h3 className="display-font text-[12px] font-extrabold text-[#263a57]">{t('I understood this','అర్థమైన వివరాలు')}</h3><button onClick={() => setShowTripDetails(!showTripDetails)} className="text-[10px] font-bold text-[#428f80]" data-testid="button-edit-trip-details">{showTripDetails ? 'Done' : 'Edit details'}</button></div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {fields.map(field => <label key={field.key} className="min-w-0"><span className="small-label block mb-1">{field.label}</span>
                    {showTripDetails ? <input className="field !py-2" type={field.key === 'date' ? 'date' : field.key === 'deadline' ? 'time' : field.key === 'passengers' || field.key === 'budget' ? 'number' : 'text'} value={String(field.value)} onChange={e => updateTrip(field.key, (field.key === 'passengers' || field.key === 'budget' ? Number(e.target.value) : e.target.value) as never)} data-testid={`input-trip-${field.key}`}/>
                    : <span className="block truncate text-[12px] font-semibold text-[#283b56]" data-testid={`value-trip-${field.key}`}>{field.key === 'date' ? formatDate(String(field.value)) : field.key === 'budget' ? `₹${Number(field.value).toLocaleString('en-IN')}` : field.key === 'deadline' && !field.value ? 'Not set' : String(field.value) || <span className="font-normal text-[#a3adba]">Not provided</span>}</span>}
                  </label>)}
                </div>
                <div className="mt-3 border-t border-[#e8edf2] pt-3">
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-[10px]"><span><span className="text-[#8995a5]">Transport </span><b className="text-[#334862]">{trip.preference}</b></span><span><span className="text-[#8995a5]">Comfort </span><b className="text-[#334862]">{trip.comfort}</b></span></div>
                  <div className="mt-1.5 text-[10px]"><span className="text-[#8995a5]">Access needs </span><b className="text-[#334862]">{trip.accessibility}</b></div>
                </div>
                {followUpMode && <form onSubmit={submitFollowUp} className="mt-3 rounded-xl border border-[#ebdba9] bg-[#fffaf0] p-3 fade-in"><label className="mb-2 block text-[11px] font-bold text-[#775a22]">{followUpMode === 'origin' ? 'Which city are you starting from?' : followUpMode === 'destination' ? 'And where are you travelling to?' : 'Which two cities should I use?'}</label><input autoFocus value={followUp} onChange={e => setFollowUp(e.target.value)} placeholder={followUpMode === 'destination' ? 'e.g. Bengaluru' : 'e.g. Hyderabad, Bengaluru'} className="field !bg-white" list="city-suggestions" data-testid="input-route-followup"/><datalist id="city-suggestions">{cityNames.map(city => <option key={city} value={city}/>)}</datalist><button type="submit" className="primary-btn mt-2 !py-2" data-testid="button-submit-followup">Add route details<ArrowRight size={13}/></button></form>}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(290px,.8fr)]">
            <div className="min-w-0">
              <section className="panel mb-5 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f4] px-5 py-4 sm:px-6">
                  <div><div className="flex items-center gap-2"><h2 className="display-font text-[14px] font-extrabold text-[#203451]">{t('Journey overview','ప్రయాణ సారాంశం')}</h2><span className={`pill ${trip.activeIssue ? 'bg-[#fff1ea] text-[#a35436]' : 'bg-[#eaf5f1] text-[#39866e]'}`} data-testid="status-journey">{trip.status}</span></div><p className="mt-1 text-[10px] text-[#8a96a6]">{formatDate(trip.date)} · {trip.passengers} travellers · simulated estimates</p></div>
                  <button onClick={speakSummary} className="secondary-btn !px-2.5 !py-2 sm:hidden" aria-label={speaking ? 'Stop speech' : 'Listen to trip summary'} data-testid="button-speak-mobile">{speaking ? <VolumeX size={14}/> : <Headphones size={14}/>}</button>
                </div>
                <div className="px-5 py-5 sm:px-6">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
                    <div><div className="small-label mb-1 flex items-center gap-1"><MapPin size={12} className="text-[#4b9a8a]"/>ORIGIN</div><div className="display-font truncate text-[18px] font-extrabold text-[#1c304d] sm:text-[22px]" data-testid="text-origin">{trip.origin || 'Add origin'}</div><div className="mt-1 text-[11px] font-semibold text-[#62748a]">{selected?.depart ?? '—'} <span className="font-normal text-[#9aa6b5]">departure</span></div></div>
                    <div className="flex min-w-[70px] flex-col items-center gap-1 text-[#6c879d]"><div className="flex w-full items-center"><span className="h-2 w-2 rounded-full border-2 border-[#4c9c8a] bg-white"/><span className="route-line h-px flex-1"/><Navigation size={13} className="rotate-90 text-[#4c9c8a]"/><span className="route-line h-px flex-1"/><span className="h-2 w-2 rounded-full border-2 border-[#284c70] bg-white"/></div><span className="text-[9px] font-semibold">{selected?.hours ?? 'route pending'}</span></div>
                    <div className="text-right"><div className="small-label mb-1 flex items-center justify-end gap-1">DESTINATION <MapPin size={12} className="text-[#294a70]"/></div><div className="display-font truncate text-[18px] font-extrabold text-[#1c304d] sm:text-[22px]" data-testid="text-destination">{trip.destination || 'Add destination'}</div><div className={`mt-1 text-[11px] font-semibold ${deadlineMiss ? 'text-[#bd5d48]' : 'text-[#62748a]'}`} data-testid="text-arrival">{outputArrival} <span className="font-normal text-[#9aa6b5]">est. arrival</span></div></div>
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#edf0f4] pt-4">
                    <div><div className="small-label mb-1 flex items-center gap-1"><Clock3 size={12}/>Arrival deadline</div><div className={`text-[12px] font-bold ${deadlineMiss ? 'text-[#b55346]' : 'text-[#314560]'}`}>{trip.deadline || 'Not set'} {deadlineMiss && <span className="font-medium">· {Math.round(trip.arrivalOffset/60)}h late</span>}</div></div>
                    <div className="border-l border-[#edf0f4] pl-3"><div className="small-label mb-1 flex items-center gap-1"><Wallet size={12}/>Estimated cost</div><div className="text-[12px] font-bold text-[#314560]">₹{selected ? (selected.cost + trip.costOffset).toLocaleString('en-IN') : '—'}</div></div>
                    <div className="border-l border-[#edf0f4] pl-3"><div className="small-label mb-1 flex items-center gap-1"><Users size={12}/>Travellers</div><div className="text-[12px] font-bold text-[#314560]">{trip.passengers} people</div></div>
                  </div>
                  {trip.activeIssue && <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#f0d5c8] bg-[#fff8f4] p-3 text-[11px] text-[#875340]" role="status" data-testid="alert-trip-disruption"><AlertTriangle size={15} className="mt-0.5 shrink-0"/><div><b>{titleCase(trip.activeIssue)} simulation</b><div className="mt-0.5">The displayed estimates are adjusted for this demo scenario. This is not a live alert.</div></div></div>}
                </div>
              </section>

              <section className="mb-5">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><div className="flex items-center gap-2"><h2 className="display-font text-[14px] font-extrabold text-[#203451]">{t('Routes to consider','పరిశీలించాల్సిన మార్గాలు')}</h2><span className="pill bg-[#eff3f7] text-[#64738a]">SIMULATED</span></div><p className="mt-1 text-[10px] text-[#8a96a6]">Illustrative choices only · not live schedules or availability</p></div><span className="text-[10px] text-[#8a96a6]">{plans.length} options</span></div>
                {!hasRoute ? <div className="panel flex flex-col items-center px-5 py-8 text-center" data-testid="state-route-needed"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#edf4f5] text-[#538f8c]"><MapPin size={17}/></div><h3 className="display-font text-[13px] font-extrabold text-[#34445a]">Add your route to compare options</h3><p className="mt-1 max-w-sm text-[11px] leading-relaxed text-[#8290a1]">Share a starting city and destination in the trip request above. I’ll ask if anything essential is missing.</p></div> : plans.length === 0 || (trip.budget > 0 && viablePlans.length === 0) ? <div className="panel flex flex-col items-center px-5 py-8 text-center" data-testid="state-no-feasible-route"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#fff4ed] text-[#ba704f]"><AlertTriangle size={18}/></div><h3 className="display-font text-[13px] font-extrabold text-[#34445a]">No feasible route within this budget</h3><p className="mt-1 max-w-sm text-[11px] leading-relaxed text-[#8290a1]">Every simulated option is over ₹{trip.budget.toLocaleString('en-IN')}. You can increase the budget or adjust your transport preference; nothing will be booked.</p><button onClick={() => {setShowTripDetails(true);document.getElementById('trip-planner')?.scrollIntoView({behavior:'smooth'});}} className="secondary-btn mt-4" data-testid="button-adjust-budget">Adjust trip details</button></div> : <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{viablePlans.slice(0,3).map((plan,index) => {
                  const active = selected?.id === plan.id; const best = plan.fit;
                  return <article key={plan.id} className={`panel relative flex min-w-0 flex-col overflow-hidden p-4 transition-all ${active ? '!border-[#86bdad] ring-1 ring-[#cde6de]' : ''}`} data-testid={`card-itinerary-${plan.id}`}>
                    {active && <span className="absolute right-3 top-3 pill bg-[#e9f5f0] text-[#32846d]"><Check size={11}/>Current plan</span>}
                    <div className="mb-3 flex items-center gap-2"><div className={`flex h-8 w-8 items-center justify-center rounded-lg ${plan.accent==='teal'?'bg-[#e9f5f0] text-[#3e947e]':plan.accent==='blue'?'bg-[#edf2f9] text-[#52749b]':'bg-[#fbf4e6] text-[#a97d35]'}`}>{plan.mode.toLowerCase().includes('train') ? <TrainFront size={16}/> : <Navigation size={16}/>}</div><span className="text-[10px] font-semibold text-[#667990]">{plan.mode}</span></div>
                    <div className="display-font pr-1 text-[14px] font-extrabold leading-snug text-[#253954]">{plan.name}</div><div className="mt-1 text-[10px] text-[#8491a1]">{best}</div>
                    <div className="mt-4 flex items-center gap-2"><span className="text-[17px] font-extrabold text-[#263c5a]">{plan.depart}</span><span className="h-px flex-1 bg-[#dce4ec]"/><ArrowRight size={12} className="text-[#91a0b1]"/><span className="text-[17px] font-extrabold text-[#263c5a]">{timeFrom(plan.arrive,active ? trip.arrivalOffset : 0)}</span></div>
                    <div className="mt-1 flex justify-between text-[9px] text-[#8491a1]"><span>Departure</span><span>Est. arrival</span></div>
                    <div className="mt-4 flex items-end justify-between border-t border-[#edf0f4] pt-3"><div><div className="small-label">{plan.changes} · {plan.hours}</div><div className="mt-1 text-[15px] font-extrabold text-[#203451]">₹{(plan.cost + (active ? trip.costOffset : 0)).toLocaleString('en-IN')}</div></div>
                      {!active && <button onClick={() => {updateTrip('selectedPlan',plan.id);updateTrip('status','Planning');setPendingPlan(null);}} className="secondary-btn !px-2.5 !py-2" data-testid={`button-select-plan-${plan.id}`}>Compare</button>}
                    </div>
                    {index === 0 && <div className="mt-2 text-[9px] text-[#91a0af]">Indicative estimate · demo</div>}
                  </article>;
                })}</div>}
              </section>

              <section className="panel mb-5 p-5 sm:p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="flex items-center gap-2"><h2 className="display-font text-[14px] font-extrabold text-[#203451]">If plans change</h2><span className="pill bg-[#fff6e7] text-[#987038]">TRY A SCENARIO</span></div><p className="mt-1 text-[10px] text-[#8a96a6]">Simulate a disruption to see the practical impact. No external data.</p></div><Zap size={16} className="text-[#c39246]"/></div>
                <div className="flex flex-wrap gap-2">
                  {[['delay','Delay · +2 hours'],['cancellation','Cancellation'],['missed connection','Missed connection']].map(([value,label])=><button key={value} onClick={() => simulate(value)} className={`secondary-btn ${trip.activeIssue===value?'!border-[#d5ad76] !bg-[#fff8eb]':''}`} data-testid={`button-simulate-${value.replaceAll(' ','-')}`}><AlertTriangle size={13}/>{label}</button>)}
                  <button onClick={proposeRecovery} className="primary-btn" data-testid="button-find-alternative"><RefreshCw size={13}/>Find an alternative</button>
                </div>
                {issue && <div className="mt-4 rounded-xl border border-[#e8edf1] bg-[#f8fafc] p-4 fade-in" data-testid="panel-recovery-recommendation">
                  {pendingPlan ? <><div className="flex items-start gap-2"><div className="mt-0.5 text-[#398f7b]"><Sparkles size={15}/></div><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-[12px] font-extrabold text-[#283d59]">Recommended next step</h3><span className="pill bg-[#fff6e7] text-[#987038]">SIMULATED</span></div><p className="mt-1 text-[11px] leading-relaxed text-[#687a8e]">{pendingPlan.name} could arrive around <b className="text-[#30445f]">{pendingPlan.arrive}</b> for <b className="text-[#30445f]">₹{pendingPlan.cost.toLocaleString('en-IN')}</b>. This is within your ₹{trip.budget.toLocaleString('en-IN')} budget. It is an estimate, not a live schedule.</p></div></div><div className="mt-3 rounded-lg bg-white px-3 py-2 text-[10px] text-[#718196]"><b className="text-[#314561]">Why this option:</b> {trip.activeIssue ? 'It fits the stated budget, avoids the current simulated disruption, and offers an earlier arrival estimate than the delayed plan.' : 'It fits the stated budget and offers a different route from your current plan. Compare the times and estimated cost before deciding.'}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#567264]"><ShieldCheck size={13}/>Nothing changes until you approve</span><div className="flex gap-2"><button onClick={keepCurrent} className="secondary-btn" data-testid="button-decline-recovery">Keep current plan</button><button onClick={approveRecovery} className="primary-btn !bg-[#347f70] hover:!bg-[#286b5d]" data-testid="button-approve-recovery"><Check size={14}/>Approve this change</button></div></div></> : <div className="flex items-start gap-2 text-[11px] text-[#845b43]"><AlertTriangle size={15} className="mt-0.5 shrink-0"/><div><b>No feasible simulated alternative right now.</b><div className="mt-1">Your current plan is untouched. Review your budget or trip details to explore other options.</div></div><button onClick={keepCurrent} className="ml-auto text-[10px] font-bold text-[#56677b]" data-testid="button-dismiss-recovery">Dismiss</button></div>}
                </div>}
              </section>
            </div>

            <aside className="min-w-0">
              <section className="panel mb-5 overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#edf0f4] px-5 py-4"><div><h2 className="display-font text-[14px] font-extrabold text-[#203451]">Journey status</h2><p className="mt-1 text-[10px] text-[#8a96a6]">Your plan at a glance</p></div><div className={`flex h-8 w-8 items-center justify-center rounded-full ${trip.activeIssue?'bg-[#fff1e9] text-[#b75a3d]':'bg-[#eaf5f1] text-[#438b76]'}`}><Activity size={16}/></div></div>
                <div className="p-5">
                  <div className="mb-4 flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${trip.activeIssue?'bg-[#fff2eb] text-[#b65d41]':'bg-[#edf5f2] text-[#368c76]'}`}>{trip.activeIssue ? <AlertTriangle size={18}/> : <BadgeCheck size={19}/>}</div><div><div className="text-[13px] font-extrabold text-[#2a3e59]" data-testid="text-status-summary">{trip.status}</div><div className="text-[10px] text-[#8895a5]">{trip.activeIssue ? 'Recovery not yet applied' : selected ? 'Plan ready for your review' : 'Add a route to get started'}</div></div></div>
                  <div className="space-y-3">
                    {[['Trip request',Boolean(trip.origin && trip.destination)],['Options compared',Boolean(selected)],['Your approval',trip.status==='Recovery approved']].map(([label,done])=><div key={String(label)} className="flex items-center gap-2.5"><span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full ${done?'bg-[#e7f4ef] text-[#38866e]':'bg-[#f0f3f6] text-[#9ca9b7]'}`}>{done ? <Check size={11}/> : <CircleDot size={12}/>}</span><span className={`text-[11px] ${done?'font-semibold text-[#425671]':'text-[#8794a4]'}`}>{label}</span><span className="ml-auto text-[9px] text-[#9ca8b5]">{done?'Done':'Waiting'}</span></div>)}
                  </div>
                  <div className="mt-4 rounded-xl bg-[#f5f8fa] p-3"><div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-[#536981]"><ShieldCheck size={13} className="text-[#4a9887]"/>Nothing is booked</div><p className="text-[10px] leading-relaxed text-[#8390a0]">This demo plans and models options only. You stay in control of every decision.</p></div>
                </div>
              </section>

              <section className="panel mb-5 overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#edf0f4] px-5 py-4"><div><h2 className="display-font text-[14px] font-extrabold text-[#203451]">Travel companion</h2><p className="mt-1 text-[10px] text-[#8a96a6]">Natural language · demo mode</p></div><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#73bea9] opacity-40"/><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#58a891]"/></span></div>
                <div className="flex max-h-[215px] flex-col gap-2 overflow-y-auto p-4" aria-live="polite">
                  {messages.slice(-4).map((message,index)=><div key={`${message.who}-${index}`} className={`max-w-[92%] rounded-xl px-3 py-2.5 text-[10px] leading-relaxed ${message.who==='assistant'?'self-start rounded-tl-sm bg-[#f1f5f8] text-[#586c83]':'self-end rounded-tr-sm bg-[#203b5c] text-white'}`} data-testid={`message-${message.who}-${index}`}>{message.text}</div>)}
                  {busy && <div className="flex items-center gap-2 self-start rounded-xl bg-[#f1f5f8] px-3 py-2.5 text-[10px] text-[#6e8093]" role="status"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#58a891]"/>{t('Reading your request…','మీ అభ్యర్థనను పరిశీలిస్తున్నాను…')}</div>}
                </div>
                <div className="border-t border-[#edf0f4] px-4 py-3"><div className="flex items-start gap-2 text-[9px] leading-relaxed text-[#8995a4]"><Sparkles size={12} className="mt-0.5 shrink-0 text-[#4d9b89]"/>Local demo extraction is active. No Gemini connection or external service is used.</div></div>
              </section>

              <section id="activity-log" className="panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#edf0f4] px-5 py-4"><div><h2 className="display-font text-[14px] font-extrabold text-[#203451]">Journey activity</h2><p className="mt-1 text-[10px] text-[#8a96a6]">Saved on this device</p></div><Activity size={15} className="text-[#7490a3]"/></div>
                <div className="log-scroll p-4">
                  {log.length ? log.map(item=><div key={item.id} className="relative flex gap-3 pb-4 last:pb-0" data-testid={`log-event-${item.id}`}><div className="relative flex flex-col items-center"><span className={`z-[1] mt-1 flex h-6 w-6 items-center justify-center rounded-full ${item.kind==='alert'?'bg-[#fff3e8] text-[#ba7443]':item.kind==='approved'?'bg-[#e7f4ef] text-[#38866e]':'bg-[#eef2f7] text-[#5f7893]'}`}>{item.kind==='alert'?<AlertTriangle size={12}/>:item.kind==='approved'?<CheckCircle2 size={12}/>:<CircleDot size={12}/>}</span><span className="absolute top-7 h-full w-px bg-[#e6ebf0] last:hidden"/></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><span className="text-[10px] font-bold text-[#40536d]">{item.title}</span><span className="shrink-0 text-[9px] text-[#9aa5b2]">{item.time}</span></div><p className="mt-1 text-[9px] leading-relaxed text-[#8794a4]">{item.detail}</p></div></div>) : <div className="py-5 text-center" data-testid="state-empty-log"><div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#f1f5f8] text-[#8092a5]"><Activity size={16}/></div><p className="text-[10px] font-semibold text-[#66778b]">No journey activity yet</p><p className="mt-1 text-[9px] text-[#98a4b2]">Your choices and simulated events will appear here.</p></div>}
                </div>
              </section>
              <div className="mt-3 flex items-start gap-2 px-1 text-[9px] leading-relaxed text-[#919baa]"><AlertTriangle size={12} className="mt-px shrink-0"/> All route times and prices are illustrative demo estimates, not live schedules, fares, availability, or booking commitments.</div>
            </aside>
          </div>
          <div className="mobile-nav fixed bottom-0 left-0 z-30 hidden w-full justify-around border-t border-[#e1e8ee] bg-white/95 px-4 py-2 backdrop-blur">
            <button onClick={() => window.scrollTo({top:0,behavior:'smooth'})} className="flex flex-col items-center gap-1 px-4 py-1 text-[#3d8b78]" data-testid="mobile-nav-home"><Compass size={17}/><span className="text-[9px] font-bold">Journey</span></button>
            <button onClick={() => document.getElementById('trip-planner')?.scrollIntoView({behavior:'smooth'})} className="flex flex-col items-center gap-1 px-4 py-1 text-[#748397]" data-testid="mobile-nav-plan"><Sparkles size={17}/><span className="text-[9px] font-semibold">Plan</span></button>
            <button onClick={() => document.getElementById('activity-log')?.scrollIntoView({behavior:'smooth'})} className="flex flex-col items-center gap-1 px-4 py-1 text-[#748397]" data-testid="mobile-nav-activity"><Activity size={17}/><span className="text-[9px] font-semibold">Activity</span></button>
          </div>
        </div>
      </main>
    </div>
  );
}

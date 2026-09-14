require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = Number(process.env.PORT || 5050);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Supabase environment variables are not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}
const supabase = createClient(SUPABASE_URL || 'https://invalid.supabase.co', SUPABASE_SERVICE_ROLE_KEY || 'invalid', { auth: { persistSession: false } });

app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '1mb' }));

function clean(value = '') { return String(value ?? '').trim(); }
function normalize(value = '') { return clean(value).toLowerCase().normalize('NFKC').replace(/[.,!?;:()[\]{}'"`]/g, ' ').replace(/\s+/g, ' ').trim(); }
function safeWorker(row) {
  if (!row) return null;

  const occupationRaw =
    clean(row.occupation) ||
    clean(row.job) ||
    clean(row.role) ||
    'Other';

  // Normalize legacy occupation values.
  const occupation = detectOccupation(
    occupationRaw,
    occupationRaw || 'Other'
  );

  // Support both old and new worker schemas.
  const state =
    clean(row.current_state) ||
    clean(row.state) ||
    clean(row.origin_state) ||
    '';

  const district =
    clean(row.current_district) ||
    clean(row.district) ||
    clean(row.origin_district) ||
    '';

  const city =
    clean(row.current_city) ||
    clean(row.city) ||
    clean(row.origin_city) ||
    '';

  const originState =
    clean(row.origin_state) ||
    clean(row.originState) ||
    state;

  const originDistrict =
    clean(row.origin_district) ||
    clean(row.originDistrict) ||
    district;

  const originCity =
    clean(row.origin_city) ||
    clean(row.originCity) ||
    city;

  // IMPORTANT:
  // Always derive the sector from the normalized occupation first.
  // This prevents legacy "Others" values from overriding the
  // correct sector.
  let sector = classifySector(occupation);

  // If the occupation cannot be classified, preserve a valid
  // legacy sector when one exists.
  const legacySector =
    clean(row.employment_sector) ||
    clean(row.sector);

  if (
    sector === 'Others' &&
    legacySector &&
    SECTORS.includes(legacySector) &&
    legacySector !== 'Others'
  ) {
    sector = legacySector;
  }

  return {
    id: row.id,
    name: row.name || 'Worker',
    email: row.email || '',
    mobile: row.mobile || '',

    occupation,
    sector,

    state,
    district,
    city,

    originState,
    originDistrict,
    originCity,

    active: row.active !== false,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLocationUpdateAt: row.last_location_update_at,

    aadhaarLast4: row.aadhaar_last4 || ''
  };
}
function safeMigrationEvent(row) {
  if (!row) return null;

  return {
    id: row.id,

    worker_id: row.worker_id,

    from_state:
      clean(row.from_state) ||
      clean(row.fromState) ||
      '',

    from_city:
      clean(row.from_city) ||
      clean(row.fromCity) ||
      '',

    to_state:
      clean(row.to_state) ||
      clean(row.toState) ||
      '',

    to_city:
      clean(row.to_city) ||
      clean(row.toCity) ||
      '',

    occupation:
      clean(row.occupation) ||
      'Other',

    reason:
      clean(row.reason) ||
      'Other',

    timestamp:
      row.timestamp ||
      row.created_at ||
      new Date().toISOString(),

    confirmed: row.confirmed !== false,
    is_migration: row.is_migration !== false
  };
}
const LOCATION_DATA = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'locations.json'), 'utf8'));
const CITY_OVERRIDES = { 'Kanniyakumari':'Nagercoil','The Nilgiris':'Udhagamandalam','Ernakulam':'Kochi','Bengaluru Urban':'Bengaluru','Bengaluru South':'Bengaluru','Mumbai':'Mumbai','Mumbai Suburban':'Mumbai','Pune':'Pune','Gautam Buddha Nagar':'Noida','Khordha':'Bhubaneswar','Kamrup Metro':'Guwahati','North Goa':'Panaji','South Goa':'Margao','Durg':'Bhilai','East Singhbum':'Jamshedpur','Rangareddy':'Hyderabad','Central':'New Delhi','New Delhi':'New Delhi','Kolkata':'Kolkata','Howrah':'Howrah','Darjeeling':'Darjeeling','Thiruvananthapuram':'Thiruvananthapuram','Leh Ladakh':'Leh' };
const ALL_LOCATIONS = Object.entries(LOCATION_DATA).flatMap(([state, districts]) => districts.map(district => ({ state, district, city: CITY_OVERRIDES[district] || district })));
const LOCATION_ALIASES = {
  'நாகர்கோவில்':{state:'Tamil Nadu',district:'Kanniyakumari',city:'Nagercoil'},'கன்னியாகுமரி':{state:'Tamil Nadu',district:'Kanniyakumari',city:'Nagercoil'},'சென்னை':{state:'Tamil Nadu',district:'Chennai',city:'Chennai'},'மதுரை':{state:'Tamil Nadu',district:'Madurai',city:'Madurai'},'திருநெல்வேலி':{state:'Tamil Nadu',district:'Tirunelveli',city:'Tirunelveli'},'கோயம்புத்தூர்':{state:'Tamil Nadu',district:'Coimbatore',city:'Coimbatore'},'கோவை':{state:'Tamil Nadu',district:'Coimbatore',city:'Coimbatore'},'நீலகிரி':{state:'Tamil Nadu',district:'The Nilgiris',city:'Udhagamandalam'},'வேலூர்':{state:'Tamil Nadu',district:'Vellore',city:'Vellore'},'சேலம்':{state:'Tamil Nadu',district:'Salem',city:'Salem'},'தர்மபுரி':{state:'Tamil Nadu',district:'Dharmapuri',city:'Dharmapuri'},'திண்டுக்கல்':{state:'Tamil Nadu',district:'Dindigul',city:'Dindigul'},'திருப்பூர்':{state:'Tamil Nadu',district:'Tiruppur',city:'Tiruppur'},'திருவண்ணாமலை':{state:'Tamil Nadu',district:'Tiruvannamalai',city:'Tiruvannamalai'},'தூத்துக்குடி':{state:'Tamil Nadu',district:'Thoothukkudi',city:'Thoothukkudi'},'திருச்சிராப்பள்ளி':{state:'Tamil Nadu',district:'Tiruchirappalli',city:'Tiruchirappalli'},'தஞ்சாவூர்':{state:'Tamil Nadu',district:'Thanjavur',city:'Thanjavur'},'ஈரோடு':{state:'Tamil Nadu',district:'Erode',city:'Erode'},'நாமக்கல்':{state:'Tamil Nadu',district:'Namakkal',city:'Namakkal'},'கரூர்':{state:'Tamil Nadu',district:'Karur',city:'Karur'},'கிருஷ்ணகிரி':{state:'Tamil Nadu',district:'Krishnagiri',city:'Krishnagiri'},'மயிலாடுதுறை':{state:'Tamil Nadu',district:'Mayiladuthurai',city:'Mayiladuthurai'},'விழுப்புரம்':{state:'Tamil Nadu',district:'Viluppuram',city:'Viluppuram'},'விருதுநகர்':{state:'Tamil Nadu',district:'Virudhunagar',city:'Virudhunagar'},'ராமநாதபுரம்':{state:'Tamil Nadu',district:'Ramanathapuram',city:'Ramanathapuram'},'புதுக்கோட்டை':{state:'Tamil Nadu',district:'Pudukkottai',city:'Pudukkottai'},'சிவகங்கை':{state:'Tamil Nadu',district:'Sivaganga',city:'Sivaganga'},'தென்காசி':{state:'Tamil Nadu',district:'Tenkasi',city:'Tenkasi'},'தேனி':{state:'Tamil Nadu',district:'Theni',city:'Theni'},'திருவள்ளூர்':{state:'Tamil Nadu',district:'Thiruvallur',city:'Thiruvallur'},'திருவாரூர்':{state:'Tamil Nadu',district:'Thiruvarur',city:'Thiruvarur'},'நாகப்பட்டினம்':{state:'Tamil Nadu',district:'Nagapattinam',city:'Nagapattinam'},'பெரம்பலூர்':{state:'Tamil Nadu',district:'Perambalur',city:'Perambalur'},'ராணிப்பேட்டை':{state:'Tamil Nadu',district:'Ranipet',city:'Ranipet'},'அரியலூர்':{state:'Tamil Nadu',district:'Ariyalur',city:'Ariyalur'},'செங்கல்பட்டு':{state:'Tamil Nadu',district:'Chengalpattu',city:'Chengalpattu'},'புனே':{state:'Maharashtra',district:'Pune',city:'Pune'},'மும்பை':{state:'Maharashtra',district:'Mumbai Suburban',city:'Mumbai'},'கொச்சி':{state:'Kerala',district:'Ernakulam',city:'Kochi'},'பெங்களூரு':{state:'Karnataka',district:'Bengaluru Urban',city:'Bengaluru'},'ஹைதராபாத்':{state:'Telangana',district:'Hyderabad',city:'Hyderabad'},'டெல்லி':{state:'Delhi',district:'Central Delhi',city:'New Delhi'},'கொல்கத்தா':{state:'West Bengal',district:'Kolkata',city:'Kolkata'},'ஜெய்ப்பூர்':{state:'Rajasthan',district:'Jaipur',city:'Jaipur'},'லக்னோ':{state:'Uttar Pradesh',district:'Lucknow',city:'Lucknow'}
};
function locationCandidates(text) {
  const raw = String(text || ''), n = normalize(raw), found=[];
  for (const loc of ALL_LOCATIONS) {
    const terms=[normalize(loc.city),normalize(loc.district)].filter(Boolean);
    const idx=terms.map(t=>n.indexOf(t)).filter(i=>i>=0);
    if(idx.length) found.push({...loc,index:Math.min(...idx)});
  }
  for(const [alias,loc] of Object.entries(LOCATION_ALIASES)){const i=raw.indexOf(alias);if(i>=0)found.push({...loc,index:i});}
  const unique=new Map(); found.forEach(x=>unique.set(`${x.state}|${x.district}|${x.city}`,x));
  return [...unique.values()].sort((a,b)=>a.index-b.index);
}
function findLocation(value,state='') { const n=normalize(value); const rows=ALL_LOCATIONS.filter(x=>!state||x.state===state); return rows.find(x=>normalize(x.city)===n||normalize(x.district)===n)||rows.find(x=>normalize(x.city).includes(n)||normalize(x.district).includes(n))||null; }

const SECTORS = ['Construction & Infrastructure','Manufacturing & Industrial Production','Agriculture','Transportation & Logistics','Services & Security','Others'];
const OCCUPATIONS = ['Construction Worker','Electrician','Welder','Plumber','Factory / Production Worker','Agricultural Worker','Driver','Security Worker','Other'];
function classifySector(role='') {
  const n=normalize(role);
  if(/construction|கட்டுமான|கட்டிட/.test(n)||/electric|electrical|மின்சார/.test(n)||/welder|welding|வெல்டர்/.test(n)||/plumb|குழாய்|பிளம்ப/.test(n)) return 'Construction & Infrastructure';
  if(/factory|production|manufactur|industrial|தொழிற்சாலை|உற்பத்தி/.test(n)) return 'Manufacturing & Industrial Production';
  if(/agric|farm|farmer|plantation|விவசாய/.test(n)) return 'Agriculture';
  if(/driver|driving|delivery|transport|logistic|lorry|truck|ஓட்டுநர்|டிரைவர்/.test(n)) return 'Transportation & Logistics';
  if(/security|guard|watchman|service|செக்யூரிட்டி|பாதுகாப்பு/.test(n)) return 'Services & Security';
  return 'Others';
}
function detectOccupation(text,current='Other'){const n=normalize(text); const checks=[['Electrician',/electrician|electrical|electric work|மின்சார|எலக்ட்ரீசியன்|எலக்ட்ரிஷியன்/],['Welder',/welder|welding|வெல்டர்|வெல்டிங்/],['Plumber',/plumber|plumbing|குழாய்|பிளம்பர்/],['Driver',/driver|driving|lorry|truck|delivery|transport|logistics|ஓட்டுநர்|டிரைவர்/],['Factory / Production Worker',/factory|production|manufactur|industrial|தொழிற்சாலை|உற்பத்தி/],['Agricultural Worker',/agricultural|agriculture|farm|farming|plantation|விவசாய/],['Security Worker',/security|guard|watchman|பாதுகாப்பு|செக்யூரிட்டி/],['Construction Worker',/construction|site work|கட்டுமான|கட்டிட வேலை/]]; for(const [v,re] of checks)if(re.test(n))return v; return current||'Other';}
function detectReason(text){const n=normalize(text);if(/new job|new work|for a job|for work|got a job|joining|employment|வேலைக்காக|புதிய வேலை/.test(n))return 'New Job';if(/seasonal|temporary|contract|பருவகால|தற்காலிக/.test(n))return 'Seasonal Work';if(/return home|returned home|back home|வீட்டுக்கு|திரும்ப/.test(n))return 'Returned Home';return 'Other';}
function extractMigration(text,worker={}){const c=locationCandidates(text);let destination=null,origin=null;if(c.length>=2){origin=c[0];destination=c[c.length-1]}else if(c.length===1)destination=c[0];if(!destination)return null;const current={state:worker.state||'',district:worker.district||'',city:worker.city||''};if(!origin&&normalize(destination.city)===normalize(current.city)&&destination.state===current.state)return null;if(!origin)origin=current;return {state:destination.state,district:destination.district,city:destination.city,occupation:detectOccupation(text,worker.occupation||'Other'),reason:detectReason(text),fromState:origin.state||'',fromCity:origin.city||''};}

async function gemini(prompt,jsonMode=false){const key=process.env.GEMINI_API_KEY;if(!key)return null;const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';const url=`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;const generationConfig={temperature:0.05};if(jsonMode)generationConfig.responseMimeType='application/json';const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig})});if(!r.ok)throw new Error(`Gemini request failed: ${r.status}`);const d=await r.json();return d?.candidates?.[0]?.content?.parts?.[0]?.text||null;}
function parseGeminiJson(v){try{return JSON.parse(String(v).replace(/^```json\s*/i,'').replace(/\s*```$/,'').trim())}catch{return null}}

const DEMO_PASSWORD='Worker@2026';
const DEMO_WORKERS=[
 ['Demo Worker 01','demo01@shrampulse.demo','Tamil Nadu','Chennai','Chennai','Electrician'],
 ['Demo Worker 02','demo02@shrampulse.demo','Kerala','Ernakulam','Kochi','Driver'],
 ['Demo Worker 03','demo03@shrampulse.demo','Karnataka','Bengaluru Urban','Bengaluru','Construction Worker'],
 ['Demo Worker 04','demo04@shrampulse.demo','Maharashtra','Pune','Pune','Factory / Production Worker'],
 ['Demo Worker 05','demo05@shrampulse.demo','Telangana','Hyderabad','Hyderabad','Agricultural Worker'],
 ['Demo Worker 06','demo06@shrampulse.demo','Tamil Nadu','Madurai','Madurai','Welder'],
 ['Demo Worker 07','demo07@shrampulse.demo','Andhra Pradesh','Visakhapatnam','Visakhapatnam','Plumber'],
 ['Demo Worker 08','demo08@shrampulse.demo','Rajasthan','Jaipur','Jaipur','Security Worker'],
 ['Demo Worker 09','demo09@shrampulse.demo','Gujarat','Ahmedabad','Ahmedabad','Driver'],
 ['Demo Worker 10','demo10@shrampulse.demo','West Bengal','Kolkata','Kolkata','Construction Worker']
];

// Demo data is intentionally simple: 10 registrations, exactly ONE confirmed move.
// Other demo workers remain at their registered/origin locations until a worker actually updates.
const DEMO_MOVED_ID='SP-DEMO-01';
const DEMO_MOVED_TO=['Maharashtra','Pune','Pune'];

async function insertWorker(row){
  // Some existing Supabase projects created an older `password` NOT NULL column.
  // Try the current schema first; if that legacy column exists, populate it with
  // the bcrypt hash (never plaintext), while retaining password_hash for current installs.
  const withLegacy={...row,password:row.password_hash};
  let result=await supabase.from('workers').insert(withLegacy).select('*').single();
  if(result.error && /password(?:_hash)?.*does not exist|column.*password(?:_hash)?/i.test(result.error.message)){
    const legacy={...row,password:row.password_hash}; delete legacy.password_hash;
    result=await supabase.from('workers').insert(legacy).select('*').single();
  }
  return result;
}

async function ensureSeed() {
  const { count, error } = await supabase
    .from('workers')
    .select('id', { count: 'exact', head: true });

  if (error) {
    throw new Error(`Supabase workers table unavailable: ${error.message}`);
  }

  // Get existing demo workers by ID
  const { data: demoRows, error: demoError } = await supabase
    .from('workers')
    .select('*')
    .like('id', 'SP-DEMO-%')
    .order('id', { ascending: true });

  if (demoError) {
    throw new Error(`Supabase demo lookup failed: ${demoError.message}`);
  }

  const existingIds = new Set(
    (demoRows || []).map(row => row.id)
  );

  // Also check emails so an older prototype record doesn't
  // cause a duplicate-email failure.
  const demoEmails = DEMO_WORKERS.map(row => row[1]);

  const { data: existingEmailRows, error: emailError } = await supabase
    .from('workers')
    .select('id,email')
    .in('email', demoEmails);

  if (emailError) {
    throw new Error(`Supabase demo email lookup failed: ${emailError.message}`);
  }

  const existingEmails = new Map(
    (existingEmailRows || []).map(row => [
      String(row.email).toLowerCase(),
      row.id
    ])
  );

  const password_hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const now = new Date().toISOString();

  const rows = DEMO_WORKERS.map((w, i) => {
    const key = String(i + 1).padStart(2, '0');
    const moved = key === '01';

    return {
      id: `SP-DEMO-${key}`,
      name: w[0],
      email: w[1],
      password_hash,
      mobile: `90000000${key}`,

      origin_state: w[2],
      origin_district: w[3],
      origin_city: w[4],

      current_state: moved ? DEMO_MOVED_TO[0] : w[2],
      current_district: moved ? DEMO_MOVED_TO[1] : w[3],
      current_city: moved ? DEMO_MOVED_TO[2] : w[4],

      occupation: w[5],
      employment_sector: classifySector(w[5]),

      active: true,
      is_demo: true,

      created_at: now,
      updated_at: now,

      last_location_update_at: moved ? now : null
    };
  });

  // ----------------------------------------------------------
  // Insert only genuinely missing demo workers.
  // Existing records are NEVER deleted.
  // ----------------------------------------------------------

  for (const row of rows) {
    const existingId = existingIds.has(row.id);
    const existingEmailId = existingEmails.get(
      String(row.email).toLowerCase()
    );

    // Already exists by ID -> don't insert.
    if (existingId) {
      continue;
    }

    // Already exists by email -> don't insert.
    // This prevents the duplicate workers_email_key error.
    if (existingEmailId) {
      console.log(
        `Demo worker already exists for ${row.email} (ID: ${existingEmailId}); skipping insert.`
      );
      continue;
    }

    const result = await insertWorker(row);

    if (result.error) {
      throw new Error(`Demo seed failed: ${result.error.message}`);
    }

    console.log(`Inserted demo worker: ${row.email}`);
  }


  // ----------------------------------------------------------
  // Repair only the intended demo migration data.
  // Real worker records are never touched.
  // ----------------------------------------------------------

  const { data: allDemo, error: allDemoError } = await supabase
    .from('workers')
    .select('id')
    .like('id', 'SP-DEMO-%');

  if (allDemoError) {
    throw new Error(
      `Supabase demo worker lookup failed: ${allDemoError.message}`
    );
  }

  const { count: demoMigrationCount, error: demoMigrationError } =
    await supabase
      .from('migration_events')
      .select('id', { count: 'exact', head: true })
      .like('id', 'ME-DEMO-%');

  if (demoMigrationError) {
    throw new Error(
      `Supabase demo migration lookup failed: ${demoMigrationError.message}`
    );
  }


  // Only repair demo migration history when all 10 demo
  // workers are available and the intended single demo move
  // has not been established.
  if ((allDemo || []).length >= 10 && demoMigrationCount !== 1) {

    const { error: delME } = await supabase
      .from('migration_events')
      .delete()
      .like('id', 'ME-DEMO-%');

    if (delME) {
      throw new Error(
        `Demo migration cleanup failed: ${delME.message}`
      );
    }

    const { error: delLU } = await supabase
      .from('location_updates')
      .delete()
      .like('id', 'LU-DEMO-%');

    if (delLU) {
      throw new Error(
        `Demo location cleanup failed: ${delLU.message}`
      );
    }


    // Update only demo worker 01.
    const { error: updateError } = await supabase
      .from('workers')
      .update({
        current_state: DEMO_MOVED_TO[0],
        current_district: DEMO_MOVED_TO[1],
        current_city: DEMO_MOVED_TO[2],
        last_location_update_at: new Date().toISOString()
      })
      .eq('id', DEMO_MOVED_ID);

    if (updateError) {
      throw new Error(
        `Demo moved worker repair failed: ${updateError.message}`
      );
    }


    // Keep demo workers 02-10 at their registered locations.
    for (let i = 1; i < DEMO_WORKERS.length; i++) {
      const w = DEMO_WORKERS[i];
      const demoId = `SP-DEMO-${String(i + 1).padStart(2, '0')}`;

      const { error: e } = await supabase
        .from('workers')
        .update({
          origin_state: w[2],
          origin_district: w[3],
          origin_city: w[4],

          current_state: w[2],
          current_district: w[3],
          current_city: w[4],

          occupation: w[5],
          employment_sector: classifySector(w[5]),

          is_demo: true,
          active: true,
          last_location_update_at: null
        })
        .eq('id', demoId);

      if (e) {
        throw new Error(
          `Demo worker repair failed: ${e.message}`
        );
      }
    }


    // Create the one intended demo migration event.
    const { error: one } = await supabase
      .from('migration_events')
      .insert({
        id: 'ME-DEMO-001',
        worker_id: DEMO_MOVED_ID,

        from_state: 'Tamil Nadu',
        from_city: 'Chennai',

        to_state: 'Maharashtra',
        to_city: 'Pune',

        occupation: 'Electrician',
        reason: 'New Job',

        timestamp: new Date().toISOString(),
        confirmed: true,
        is_migration: true
      });

    if (one) {
      throw new Error(
        `Demo migration seed failed: ${one.message}`
      );
    }


    // Create the corresponding location update.
    const { error: loc } = await supabase
      .from('location_updates')
      .insert({
        id: 'LU-DEMO-001',
        worker_id: DEMO_MOVED_ID,

        state: 'Maharashtra',
        district: 'Pune',
        city: 'Pune',

        occupation: 'Electrician',
        update_type: 'MIGRATION',

        responded: true,
        timestamp: new Date().toISOString()
      });

    if (loc) {
      throw new Error(
        `Demo location seed failed: ${loc.message}`
      );
    }
  } else if ((count || 0) === 0) {
    // Completely empty database.
    // Re-check once after the seed operation.
    return ensureSeed();
  }
}

async function getWorkers(){const {data,error}=await supabase.from('workers').select('*').order('created_at',{ascending:true});if(error)throw new Error(error.message);return data||[];}
function monthKey(d){const x=new Date(d);return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}`;}
function monthLabel(key){const [y,m]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1,1)).toLocaleDateString('en-IN',{month:'short',year:'numeric',timeZone:'UTC'});}
function lastMonths(n=6){const now=new Date();const out=[];for(let i=n-1;i>=0;i--){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i,1));out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`)}return out;}
async function getAnalytics() {
  const workers = await getWorkers();

  const { data: events, error: eventError } = await supabase
    .from('migration_events')
    .select('*')
    .order('timestamp', { ascending: false });

  if (eventError) {
    throw new Error(eventError.message);
  }

  const { data: updates, error: updateError } = await supabase
    .from('location_updates')
    .select('*')
    .order('timestamp', { ascending: false });

  if (updateError) {
    throw new Error(updateError.message);
  }

  // ----------------------------------------------------------
  // Normalize legacy migration records.
  // This keeps older database records compatible with the
  // current analytics system without modifying the database.
  // ----------------------------------------------------------

  const normalizedEvents = (events || [])
    .map(safeMigrationEvent)
    .filter(Boolean);

  // ----------------------------------------------------------
  // Normalize worker records.
  // This allows both old and new worker schemas to contribute
  // correctly to the dashboard.
  // ----------------------------------------------------------

  const normalizedWorkers = (workers || [])
    .map(safeWorker)
    .filter(Boolean);

  const stateMap = new Map();
  const sectorMap = new Map();
  const occupationMap = new Map();
  const flowMap = new Map();
  const cities = {};

  const activeWorkers = normalizedWorkers.filter(
    worker => worker.active !== false
  );

  // ----------------------------------------------------------
  // CURRENT WORKER DISTRIBUTION
  // ----------------------------------------------------------

  activeWorkers.forEach(worker => {
    const state = clean(worker.state) || 'Unknown';

    stateMap.set(
      state,
      (stateMap.get(state) || 0) + 1
    );

    const sector =
      clean(worker.sector) ||
      classifySector(worker.occupation);

    sectorMap.set(
      sector,
      (sectorMap.get(sector) || 0) + 1
    );

    const occupation =
      clean(worker.occupation) ||
      'Other';

    occupationMap.set(
      occupation,
      (occupationMap.get(occupation) || 0) + 1
    );

    if (worker.city) {
      const key = `${worker.city}, ${state}`;

      cities[key] =
        (cities[key] || 0) + 1;
    }
  });

  // ----------------------------------------------------------
  // CONFIRMED MIGRATION EVENTS
  // ----------------------------------------------------------

  const migrationEvents = normalizedEvents.filter(
    event => event.is_migration !== false
  );

  // ----------------------------------------------------------
  // MIGRATION FLOWS
  // ----------------------------------------------------------

  migrationEvents.forEach(event => {
    const fromState =
      clean(event.from_state) || 'Unknown';

    const toState =
      clean(event.to_state) || 'Unknown';

    const fromCity =
      clean(event.from_city) || 'Unknown';

    const toCity =
      clean(event.to_city) || 'Unknown';

    const key =
      `${fromState}|${toState}|${fromCity}|${toCity}`;

    const existing =
      flowMap.get(key) || {
        key,
        fromState,
        toState,
        fromCity,
        toCity,
        count: 0
      };

    existing.count++;

    flowMap.set(key, existing);
  });

  // ----------------------------------------------------------
  // STATE DISTRIBUTION
  // ----------------------------------------------------------

  const states = [...stateMap]
    .map(([name, count]) => ({
      name,
      count
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.name.localeCompare(b.name)
    );

  // ----------------------------------------------------------
  // EMPLOYMENT SECTOR DISTRIBUTION
  // ----------------------------------------------------------

  const employmentInsights = SECTORS
    .map(sector => ({
      name: sector,
      sector,
      count: sectorMap.get(sector) || 0
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        SECTORS.indexOf(a.sector) -
          SECTORS.indexOf(b.sector)
    );

  // ----------------------------------------------------------
  // OCCUPATION DISTRIBUTION
  // ----------------------------------------------------------

  const occupations = [...occupationMap]
    .map(([name, count]) => ({
      name,
      count,
      sector: classifySector(name)
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.name.localeCompare(b.name)
    );

  // ----------------------------------------------------------
  // MONTHLY MIGRATION TRENDS
  // ----------------------------------------------------------

  const months = lastMonths(6);

  const sectorTrends = SECTORS.map(sector => ({
    name: sector,

    data: months.map(month => ({
      month,
      label: monthLabel(month),

      count: migrationEvents.filter(event =>
        monthKey(event.timestamp) === month &&
        classifySector(
          event.occupation || 'Other'
        ) === sector
      ).length
    }))
  }));

  // ----------------------------------------------------------
  // CURRENT MONTH RESPONSE DATA
  // ----------------------------------------------------------

  const now = new Date();

  const periodKey = monthKey(now);

  const periodUpdates =
    (updates || []).filter(
      update =>
        monthKey(update.timestamp) === periodKey
    );

  const respondedWorkers =
    new Set(
      periodUpdates
        .filter(update => update.responded !== false)
        .map(update => update.worker_id)
    );

  // ----------------------------------------------------------
  // CURRENT MONTH DESTINATIONS / OCCUPATIONS / FLOWS
  // ----------------------------------------------------------

  const destinationMap = new Map();
  const originMap = new Map();
  const occupationEventMap = new Map();

  migrationEvents
    .filter(
      event =>
        monthKey(event.timestamp) === periodKey
    )
    .forEach(event => {
      const toCity =
        clean(event.to_city) || 'Unknown';

      const toState =
        clean(event.to_state) || 'Unknown';

      const destination =
        `${toCity}, ${toState}`;

      destinationMap.set(
        destination,
        (destinationMap.get(destination) || 0) + 1
      );

      const occupation =
        clean(event.occupation) || 'Other';

      occupationEventMap.set(
        occupation,
        (occupationEventMap.get(occupation) || 0) + 1
      );

      const fromState =
        clean(event.from_state) || 'Unknown';

      const flow =
        `${fromState} → ${toState}`;

      originMap.set(
        flow,
        (originMap.get(flow) || 0) + 1
      );
    });

  // ----------------------------------------------------------
  // ALL-TIME MIGRATION DESTINATIONS
  // ----------------------------------------------------------

  const migrationDestinationMap =
    new Map();

  migrationEvents.forEach(event => {
    const state =
      clean(event.to_state) || 'Unknown';

    migrationDestinationMap.set(
      state,
      (migrationDestinationMap.get(state) || 0) + 1
    );
  });

  const migrationDestinations =
    [...migrationDestinationMap]
      .map(([name, count]) => ({
        name,
        count
      }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.name.localeCompare(b.name)
      );

  // ----------------------------------------------------------
  // SORTED CURRENT-MONTH DATA
  // ----------------------------------------------------------

  const destinationEntries =
    [...destinationMap]
      .sort((a, b) => b[1] - a[1]);

  const occupationEntries =
    [...occupationEventMap]
      .sort((a, b) => b[1] - a[1]);

  const flowEntries =
    [...originMap]
      .sort((a, b) => b[1] - a[1]);

  // ----------------------------------------------------------
  // MONTH-OVER-MONTH MIGRATION CHANGE
  // ----------------------------------------------------------

  const currentMonthEvents =
    migrationEvents.filter(
      event =>
        monthKey(event.timestamp) === periodKey
    ).length;

  const previousKey =
    months[months.length - 2];

  const previousMonthEvents =
    migrationEvents.filter(
      event =>
        monthKey(event.timestamp) === previousKey
    ).length;

  const changePct =
    previousMonthEvents
      ? (
          (currentMonthEvents -
            previousMonthEvents) /
          previousMonthEvents
        ) * 100
      : 0;

  // ----------------------------------------------------------
  // RESPONSE RATE
  // ----------------------------------------------------------

  const responseRate =
    activeWorkers.length
      ? Math.round(
          (respondedWorkers.size /
            activeWorkers.length) *
            100
        )
      : 0;

  // ----------------------------------------------------------
  // REPORT
  // ----------------------------------------------------------

  const report = {
    period: monthLabel(periodKey),
    periodKey,

    totalWorkers:
      activeWorkers.length,

    updatesReceived:
      periodUpdates.length,

    sameLocation:
      periodUpdates.filter(
        update =>
          update.update_type ===
          'SAME_LOCATION'
      ).length,

    migrations:
      periodUpdates.filter(
        update =>
          update.update_type ===
          'MIGRATION'
      ).length,

    noResponse:
      Math.max(
        0,
        activeWorkers.length -
          respondedWorkers.size
      ),

    responseRate,

    highDemandDestination:
      destinationEntries[0]?.[0] ||
      'No migration recorded',

    highDemandDestinationCount:
      destinationEntries[0]?.[1] || 0,

    lowInflowDestination:
      destinationEntries.length
        ? destinationEntries[
            destinationEntries.length - 1
          ][0]
        : 'No migration recorded',

    topOriginDestination:
      flowEntries[0]?.[0] ||
      'No migration recorded',

    mostAffectedOccupation:
      occupationEntries[0]?.[0] ||
      'No migration recorded',

    totalMigrationEvents:
      migrationEvents.length,

    currentMonthEvents,

    previousMonthEvents,

    changePct,

    topCities:
      Object.entries(cities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({
          name,
          count
        })),

    topOccupations:
      occupations.slice(0, 5),

    topFlows:
      flowEntries
        .slice(0, 5)
        .map(([route, count]) => ({
          route,
          count
        })),

    highDemandDestinations:
      destinationEntries
        .slice(0, 5)
        .map(([name, count]) => ({
          name,
          count
        })),

    lowInflowDestinations:
      destinationEntries
        .slice(-5)
        .reverse()
        .map(([name, count]) => ({
          name,
          count
        })),

    observations: []
  };

  // ----------------------------------------------------------
  // AUTOMATIC OBSERVATIONS
  // ----------------------------------------------------------

  const topSector =
    employmentInsights[0];

  const topState =
    states[0];

  const lowState =
    states[states.length - 1];

  report.observations = [
    topState
      ? `${topState.name} currently has the highest active worker concentration (${topState.count}).`
      : null,

    topSector
      ? `${topSector.name} is the largest current employment sector (${topSector.count} workers).`
      : null,

    destinationEntries[0]
      ? `${destinationEntries[0][0]} is the highest recorded destination for ${report.period} (${destinationEntries[0][1]} update${destinationEntries[0][1] === 1 ? '' : 's'}).`
      : null,

    lowState
      ? `${lowState.name} has the lowest active worker count in the current dataset (${lowState.count}).`
      : null
  ].filter(Boolean);

  // ----------------------------------------------------------
  // FINAL ANALYTICS SNAPSHOT
  // ----------------------------------------------------------

  return {
    totals: {
      workers: activeWorkers.length,

      states: states.length,

      updates:
        migrationEvents.length,

      migrants:
        new Set(
          migrationEvents
            .map(event => event.worker_id)
            .filter(Boolean)
        ).size
    },

    states,

    employmentInsights,

    occupations,

    flows:
      [...flowMap.values()]
        .sort(
          (a, b) =>
            b.count - a.count
        ),

    migrationDestinations,

    recent:
      migrationEvents
        .slice(0, 8)
        .map(event => ({
          id: event.id,
          fromState: event.from_state,
          toState: event.to_state,
          fromCity: event.from_city,
          toCity: event.to_city,
          occupation: event.occupation,
          timestamp: event.timestamp
        })),

    cities,

    workers: activeWorkers,

    sectorTrends,

    report
  };
}

function deterministicAnswer(question,snapshot){
  const n=normalize(question), states=snapshot.states||[], sectors=snapshot.employmentInsights||[], workers=snapshot.workers||[], flows=snapshot.flows||[], report=snapshot.report||{};
  const total=snapshot.totals?.workers||0, migrationCount=snapshot.totals?.updates||0, movers=snapshot.totals?.migrants||0;
  const stateMatch=states.find(s=>n.includes(normalize(s.name)));
  const sectorMatch=sectors.find(s=>n.includes(normalize(s.name)));
  const occupationAliases=[['Electrician','electric'],['Driver','driver'],['Construction Worker','construction'],['Agricultural Worker','agric'],['Welder','welder'],['Plumber','plumb'],['Security Worker','security'],['Factory / Production Worker','factory|production']];
  const occMatch=occupationAliases.find(([name,rx])=>new RegExp(rx).test(n));
  const occupationWorkers=occMatch?workers.filter(w=>w.occupation===occMatch[0]):[];

  if(/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(n))
    return `👋 **Hello. I’m ShramPulse Assistant.**\n\nI can answer questions using the current live dashboard data, including:\n• Registered workers and active movers\n• State and city distribution\n• Confirmed migration flows and destinations\n• Employment sectors and occupations\n• Response and update statistics`;
  if(/how many|number|count|total/.test(n)&&/registered|active worker|worker/.test(n)&&!stateMatch&&!sectorMatch&&!occMatch)
    return `📊 **Registered workers:** ${total}\n\nThese are active worker profiles currently returned by the ShramPulse backend.`;
  if(/active mover|migrant.*move|how many.*moved|migration.*worker/.test(n))
    return `↗️ **Active movers:** ${movers}\n\nThis counts unique workers with at least one confirmed migration event.`;
  if(/migration event|migration report|confirmed move|total migration/.test(n))
    return `📍 **Confirmed migration events:** ${migrationCount}\n\nOnly confirmed migration events are included in this figure.`;
  if(/state(s)? represented|how many state|number of state/.test(n))
    return `🗺️ **States represented:** ${states.length}\n\nThe dashboard derives this from workers’ current confirmed locations.`;
  if(/how many|number|count/.test(n)&&stateMatch)
    return `📊 **${stateMatch.name}: ${stateMatch.count} worker${stateMatch.count===1?'':'s'}**\n\nThis value is calculated from the current active worker records.`;
  if(/which state|state.*most|highest.*state|most.*migrant|top state/.test(n)){
    const top=states[0]; return top?`🏆 **Highest worker concentration:** ${top.name}\n\n**${top.count} active worker${top.count===1?'':'s'}** are currently confirmed there.`:'📍 No state data is available yet.';
  }
  if(/lowest.*state|state.*lowest|least.*state/.test(n)){
    const low=states[states.length-1]; return low?`📉 **Lowest worker concentration:** ${low.name}\n\n**${low.count} active worker${low.count===1?'':'s'}** are currently confirmed there.`:'📍 No state data is available yet.';
  }
  if(/state-wise|state wise|all states|state list|rank.*state/.test(n)&&/worker|migrant|count|list|rank/.test(n))
    return states.length?`🗺️ **State-wise worker distribution (highest → lowest)**\n\n${states.map((x,i)=>`${i+1}. **${x.name}** — ${x.count}`).join('\n')}`:'📍 No state data is available yet.';
  if(/which sector|sector.*most|highest.*sector|largest.*sector/.test(n)){
    const top=sectors[0]; return top?`💼 **Largest employment sector:** ${top.name}\n\n**${top.count} active worker${top.count===1?'':'s'}** are currently classified in this sector.`:'💼 No employment data is available yet.';
  }
  if(/how many|number|count/.test(n)&&sectorMatch)
    return `💼 **${sectorMatch.name}: ${sectorMatch.count} worker${sectorMatch.count===1?'':'s'}**\n\nSector classification is derived from the worker’s current occupation.`;
  if(/occupation|electrician|driver|construction|agric|welder|plumb|security|factory|production/.test(n)&&(/how many|number|count|most|top|which/.test(n))){
    if(occMatch)return `👷 **${occMatch[0]}:** ${occupationWorkers.length} active worker${occupationWorkers.length===1?'':'s'}.`;
    const top=Object.entries(workers.reduce((m,w)=>(m[w.occupation]=(m[w.occupation]||0)+1,m),{})).sort((a,b)=>b[1]-a[1]).slice(0,6);
    return top.length?`👷 **Top occupations**\n\n${top.map((x,i)=>`${i+1}. **${x[0]}** — ${x[1]}`).join('\n')}`:'👷 No occupation data is available yet.';
  }
  if(/migration flow|flow|route|moved from|origin.*destination|destination/.test(n)){
    const f=flows[0]; return f?`↗️ **Top confirmed migration flow**\n\n**${f.fromCity}, ${f.fromState} → ${f.toCity}, ${f.toState}**\n\nRecorded moves: **${f.count}**`:'↗️ No confirmed migration flows are available yet.';
  }
  if(/destination|where.*migrat|where.*move/.test(n)){
    const d=snapshot.migrationDestinations?.[0]; return d?`📍 **Top confirmed destination:** ${d.name}\n\nConfirmed moves into this state: **${d.count}**`:'📍 No confirmed migration destination is available yet.';
  }
  if(/response rate|responded|response/.test(n))
    return `📨 **Monthly response rate:** ${report.responseRate||0}%\n\nUpdates received: **${report.updatesReceived||0}** · No response: **${report.noResponse||0}**`;
  if(/same location/.test(n)) return `📌 **Same-location confirmations:** ${report.sameLocation||0}`;
  if(/recent|latest|live feed|updates/.test(n)){
    const recent=snapshot.recent||[]; return recent.length?`🟢 **Recent confirmed migration updates**\n\n${recent.slice(0,6).map(e=>`• **${e.fromCity}, ${e.fromState} → ${e.toCity}, ${e.toState}** — ${e.occupation||'Other'}`).join('\n')}`:'🟢 No migration updates have been recorded yet.';
  }
  if(/trend|this month|current month|previous month|change/.test(n))
    return `📈 **Migration trend**\n\nCurrent month: **${report.currentMonthEvents||0}** confirmed event${report.currentMonthEvents===1?'':'s'}\nPrevious month: **${report.previousMonthEvents||0}**\nChange: **${Number(report.changePct||0).toFixed(1)}%**`;
  if(/scheme|welfare|benefit|support/.test(n))
    return `🏛️ **Welfare guidance**\n\nShramPulse can point you toward the welfare information configured in the worker portal. Eligibility and scheme status should always be verified on the official government source before applying.`;
  if(/job|jobs|vacanc|opportunit|employment/.test(n))
    return `💼 **Opportunity guidance**\n\nTell me a state, city, occupation, or sector and I can use the live ShramPulse context to explain the relevant worker/employment data.`;
  return `I’m the **ShramPulse mobility assistant**. I can answer questions about the live worker dataset, including **worker counts, states, destinations, migration flows, occupations, employment sectors, response rates and trends**.\n\nTry: “How many workers are registered?”, “Which state has the most workers?”, or “What is the top migration flow?”`;
}

app.get('/api/health',async(req,res)=>{try{await ensureSeed();res.json({ok:true,service:'SHRAMPULSE BACKEND',database:'supabase-postgresql',version:7})}catch(e){res.status(500).json({ok:false,message:e.message})}});
app.get('/api/locations',(req,res)=>{const state=clean(req.query.state),q=normalize(req.query.q);let rows=ALL_LOCATIONS.filter(x=>!state||x.state===state);if(q)rows=rows.filter(x=>normalize(x.district).includes(q)||normalize(x.city).includes(q)||normalize(x.state).includes(q));res.json({results:rows.slice(0,20)});});
app.get('/api/workers',async(req,res)=>{try{await ensureSeed();res.json({workers:(await getWorkers()).filter(w=>w.active!==false).map(safeWorker)})}catch(e){res.status(500).json({message:e.message})}});

app.post('/api/auth/worker/signup',async(req,res)=>{try{await ensureSeed();const b=req.body||{};const required=['name','email','password','mobile','occupation','state','district','city'];if(required.some(k=>!clean(b[k])))return res.status(400).json({message:'Please complete all required fields.'});const email=clean(b.email).toLowerCase();const {data:existing}=await supabase.from('workers').select('id').eq('email',email).maybeSingle();if(existing)return res.status(409).json({message:'An account with this email already exists.'});const loc=findLocation(b.city,b.state)||findLocation(b.district,b.state);const city=loc?.city||clean(b.city),district=loc?.district||clean(b.district),state=loc?.state||clean(b.state);const occupation=detectOccupation(`${b.occupation}`,clean(b.occupation)||'Other');const password_hash=await bcrypt.hash(String(b.password),10);const id=`SP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;const now=new Date().toISOString();const row={id,name:clean(b.name),email,mobile:clean(b.mobile),password_hash,origin_state:state,origin_district:district,origin_city:city,current_state:state,current_district:district,current_city:city,occupation,employment_sector:classifySector(occupation),aadhaar_last4:String(b.aadhaarLast4||'').slice(-4),active:true,is_demo:false,created_at:now,updated_at:now,last_location_update_at:now};const {data,error}=await insertWorker(row);if(error)throw new Error(error.message);res.status(201).json({worker:safeWorker(data)})}catch(e){res.status(500).json({message:e.message})}});
app.post('/api/auth/worker/login', async (req, res) => {
  try {
    await ensureSeed();

    const identifier = clean(
      req.body?.email ||
      req.body?.workerId ||
      req.body?.id ||
      req.body?.username ||
      ''
    );

    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      return res.status(400).json({
        message: 'Worker ID/email and password are required.'
      });
    }

    /*
     * Supports both:
     *   - current worker IDs: SP-XXXXXXXXXX
     *   - demo IDs: SP-DEMO-01
     *   - older worker IDs
     *   - email addresses
     *   - mobile numbers
     *
     * Nothing is deleted or modified here.
     */

    let worker = null;

    // 1. Try exact worker ID first.
    {
      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .eq('id', identifier)
        .eq('active', true)
        .maybeSingle();

      if (error) {
        console.warn('Worker ID lookup failed:', error.message);
      }

      if (data) worker = data;
    }

    // 2. Try email if ID did not match.
    if (!worker) {
      const email = identifier.toLowerCase();

      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .eq('email', email)
        .eq('active', true)
        .maybeSingle();

      if (error) {
        console.warn('Worker email lookup failed:', error.message);
      }

      if (data) worker = data;
    }

    // 3. Try mobile number for older accounts.
    if (!worker) {
      const mobile = identifier.replace(/\s+/g, '');

      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .eq('mobile', mobile)
        .eq('active', true)
        .maybeSingle();

      if (error) {
        console.warn('Worker mobile lookup failed:', error.message);
      }

      if (data) worker = data;
    }

    if (!worker) {
      return res.status(401).json({
        message: 'Invalid worker ID/email or password.'
      });
    }

    /*
     * Current schema normally uses password_hash.
     * Older installations may have password.
     */
    const storedPassword =
      clean(worker.password_hash) ||
      clean(worker.password);

    if (!storedPassword) {
      return res.status(401).json({
        message: 'This worker account has no valid password configured.'
      });
    }

    let passwordValid = false;

    /*
     * Current accounts use bcrypt.
     */
    try {
      passwordValid = await bcrypt.compare(password, storedPassword);
    } catch {
      passwordValid = false;
    }

    /*
     * Legacy fallback:
     * Some very old demo/project records may contain plaintext
     * passwords in the legacy `password` column.
     *
     * We only compare it here; we never return the password.
     */
    if (!passwordValid && worker.password) {
      passwordValid = password === String(worker.password);
    }

    if (!passwordValid) {
      return res.status(401).json({
        message: 'Invalid worker ID/email or password.'
      });
    }

    /*
     * If an old account authenticated using plaintext `password`,
     * upgrade it to bcrypt without deleting the old worker.
     *
     * This is optional and non-destructive.
     */
    if (
      worker.password &&
      !worker.password_hash &&
      password === String(worker.password)
    ) {
      try {
        const upgradedHash = await bcrypt.hash(password, 10);

        await supabase
          .from('workers')
          .update({
            password_hash: upgradedHash,
            updated_at: new Date().toISOString()
          })
          .eq('id', worker.id);

        worker.password_hash = upgradedHash;
      } catch (upgradeError) {
        console.warn(
          'Legacy password upgrade skipped:',
          upgradeError.message
        );
      }
    }

    res.json({
      worker: safeWorker(worker)
    });

  } catch (e) {
    console.error('Worker login error:', e);

    res.status(500).json({
      message: e.message || 'Worker login failed.'
    });
  }
});
app.post('/api/auth/authorized/login',(req,res)=>{const username=clean(req.body?.username).toLowerCase(),password=String(req.body?.password||'');const expectedUser=process.env.AUTHORIZED_EMAIL||'authorized@shrampulse.demo',expectedPass=process.env.AUTHORIZED_PASSWORD||'ShramPulse@2026';if(username===expectedUser.toLowerCase()&&password===expectedPass)return res.json({role:'administrator',authenticatedAt:new Date().toISOString()});res.status(401).json({message:'Invalid authorized credentials.'});});
app.put('/api/workers/:id',async(req,res)=>{try{const fields={};for(const k of ['name','email','mobile'])if(req.body?.[k]!==undefined)fields[k]=clean(req.body[k]);if(req.body?.occupation!==undefined){fields.occupation=detectOccupation(req.body.occupation,'Other');fields.employment_sector=classifySector(fields.occupation);}if(req.body?.state||req.body?.district||req.body?.city){const loc=findLocation(req.body.city||req.body.district||req.body.state,req.body.state||'');if(loc){fields.current_state=loc.state;fields.current_district=loc.district;fields.current_city=loc.city;}else{fields.current_state=clean(req.body.state);fields.current_district=clean(req.body.district);fields.current_city=clean(req.body.city);}}fields.updated_at=new Date().toISOString();if(fields.current_state)fields.last_location_update_at=fields.updated_at;const {data,error}=await supabase.from('workers').update(fields).eq('id',req.params.id).select('*').single();if(error)throw new Error(error.message);res.json({worker:safeWorker(data)})}catch(e){res.status(500).json({message:e.message})}});
app.post('/api/migration/update',async(req,res)=>{try{const b=req.body||{};const {data:worker}=await supabase.from('workers').select('*').eq('id',b.workerId).single();if(!worker)return res.status(404).json({message:'Worker not found.'});const loc=findLocation(b.city||b.district,b.state)||{state:clean(b.state),district:clean(b.district),city:clean(b.city)};if(!loc.state||!loc.city)return res.status(400).json({message:'State and city are required.'});const occupation=detectOccupation(b.occupation||'',worker.occupation||'Other');const now=new Date().toISOString();const same=worker.current_state===loc.state&&worker.current_city===loc.city;const event={id:`ME-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,worker_id:worker.id,from_state:worker.current_state,from_city:worker.current_city,to_state:loc.state,to_city:loc.city,occupation,reason:clean(b.reason)||'Other',timestamp:now,confirmed:true,is_migration:!same};const {error:eventError}=await supabase.from('migration_events').insert(event);if(eventError)throw new Error(eventError.message);const {error:logError}=await supabase.from('location_updates').insert({id:`LU-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,worker_id:worker.id,state:loc.state,district:loc.district,city:loc.city,occupation,update_type:same?'SAME_LOCATION':'MIGRATION',responded:true,timestamp:now});if(logError)throw new Error(logError.message);const update={current_state:loc.state,current_district:loc.district,current_city:loc.city,occupation,employment_sector:classifySector(occupation),updated_at:now,last_location_update_at:now};const {data:updated,error:updateError}=await supabase.from('workers').update(update).eq('id',worker.id).select('*').single();if(updateError)throw new Error(updateError.message);res.json({worker:safeWorker(updated),event:{id:event.id,fromState:event.from_state,toState:event.to_state,fromCity:event.from_city,toCity:event.to_city,occupation:event.occupation,reason:event.reason,timestamp:event.timestamp,isMigration:event.is_migration}})}catch(e){res.status(500).json({message:e.message})}});

app.post('/api/sms/send',async(req,res)=>{try{const {data:worker}=await supabase.from('workers').select('*').eq('id',req.body?.workerId).single();if(!worker)return res.status(404).json({message:'Worker not found.'});const token=crypto.randomBytes(16).toString('hex');const sms={id:`SMS-${Date.now()}`,worker_id:worker.id,mobile:worker.mobile,message:`Hello ${worker.name.split(' ')[0]}, please confirm your current work location.`,token,status:'SIMULATED',timestamp:new Date().toISOString()};const {error}=await supabase.from('sms_events').insert(sms);if(error)throw new Error(error.message);res.json({sms:{...sms,worker_id:undefined},demoUpdateUrl:`${process.env.FRONTEND_PUBLIC_URL||'http://localhost:5173'}/#update/${token}`})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/sms/:token',async(req,res)=>{try{const {data:sms}=await supabase.from('sms_events').select('*').eq('token',req.params.token).maybeSingle();if(!sms)return res.status(404).json({message:'Token not found.'});const {data:worker}=await supabase.from('workers').select('*').eq('id',sms.worker_id).maybeSingle();res.json({sms,worker:safeWorker(worker)})}catch(e){res.status(500).json({message:e.message})}});

app.get('/api/analytics',async(req,res)=>{try{await ensureSeed();res.json(await getAnalytics())}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/analytics/summary',async(req,res)=>{try{await ensureSeed();const a=await getAnalytics();res.json(a)}catch(e){res.status(500).json({message:e.message})}});

app.post('/api/ai/parse-migration',async(req,res)=>{const text=clean(req.body?.text),worker=req.body?.worker||{};if(!text)return res.status(400).json({message:'Speech text is required.'});const fallback=extractMigration(text,worker);try{const prompt=`Return ONLY JSON with state,district,city,occupation,reason,fromState,fromCity. Extract a worker's intended current work location from this natural Tamil/English speech. Do not invent a place. Current worker: ${JSON.stringify({state:worker.state,district:worker.district,city:worker.city,occupation:worker.occupation})}. Valid occupation examples: ${OCCUPATIONS.join(', ')}. Sentence: ${JSON.stringify(text)}`;const ai=parseGeminiJson(await gemini(prompt,true));if(ai){const parsed={state:clean(ai.state)||fallback?.state||'',district:clean(ai.district)||fallback?.district||'',city:clean(ai.city)||fallback?.city||'',occupation:detectOccupation(text,clean(ai.occupation)||fallback?.occupation||worker.occupation||'Other'),reason:clean(ai.reason)||fallback?.reason||'Other',fromState:clean(ai.fromState)||fallback?.fromState||worker.state||'',fromCity:clean(ai.fromCity)||fallback?.fromCity||worker.city||''};const loc=findLocation(parsed.city,parsed.state)||findLocation(parsed.district,parsed.state);if(loc){parsed.state=loc.state;parsed.district=loc.district;parsed.city=loc.city;}return res.json({parsed,source:'gemini+rules'});}}catch(e){console.warn('Location AI fallback:',e.message)}if(!fallback)return res.status(422).json({message:'I could not identify the destination clearly. Please say the city or district again.'});res.json({parsed:fallback,source:'rules'});});

app.post('/api/chat/sessions',async(req,res)=>{try{const title=clean(req.body?.title)||'New chat';const id=crypto.randomUUID();const {data,error}=await supabase.from('chat_sessions').insert({id,title}).select('*').single();if(error)throw new Error(error.message);res.status(201).json({session:id,title:data.title,createdAt:data.created_at,updatedAt:data.updated_at})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/chat/sessions',async(req,res)=>{try{const {data,error}=await supabase.from('chat_sessions').select('*').order('updated_at',{ascending:false});if(error)throw new Error(error.message);res.json({sessions:(data||[]).map(x=>({id:x.id,title:x.title,createdAt:x.created_at,updatedAt:x.updated_at}))})}catch(e){res.status(500).json({message:e.message})}});
app.get('/api/chat/sessions/:id/messages',async(req,res)=>{try{const {data,error}=await supabase.from('chat_messages').select('*').eq('session_id',req.params.id).order('created_at',{ascending:true});if(error)throw new Error(error.message);res.json({messages:(data||[]).map(x=>({id:x.id,role:x.role,content:x.content,createdAt:x.created_at}))})}catch(e){res.status(500).json({message:e.message})}});

app.post('/api/ai/chat',async(req,res)=>{try{await ensureSeed();const text=clean(req.body?.message);if(!text)return res.status(400).json({message:'Message is required.'});const sessionId=clean(req.body?.sessionId)||crypto.randomUUID();let sessionExists=true;if(req.body?.sessionId){const {data}=await supabase.from('chat_sessions').select('id').eq('id',sessionId).maybeSingle();sessionExists=!!data;}if(!sessionExists)return res.status(404).json({message:'Chat session not found.'});if(!req.body?.sessionId){await supabase.from('chat_sessions').insert({id:sessionId,title:text.slice(0,70)});}
  await supabase.from('chat_messages').insert({session_id:sessionId,role:'user',content:text});
  const snapshot=await getAnalytics();
  const deterministic=deterministicAnswer(text,snapshot);
  let answer=deterministic;
  const asksScheme=/suggest|recommend|available|which.*scheme|what.*scheme|government.*support|welfare.*support|benefit.*available/i.test(text) && /scheme|welfare|benefit|support/i.test(text);
  const asksJob=/suggest|recommend|suitable|opportunit|vacanc|which.*job|what.*job/i.test(text) && /job|work|employment|vacanc/i.test(text);
  if(process.env.GEMINI_API_KEY){
    const prompt=`You are the ShramPulse authorized assistant. Answer in clear, structured English using ONLY the live dashboard context below for factual values. Never invent a count, worker, migration, scheme, job, location, eligibility rule, or source. If the user asks something unrelated to ShramPulse, briefly say what you can help with. For schemes/jobs, only recommend when explicitly requested and clearly label recommendations as guidance that must be verified on the official source. Prefer a short heading followed by 2-6 bullets. Keep numerical answers exact. Context: ${JSON.stringify(snapshot)}. User question: ${JSON.stringify(text)}`;
    try{const ai=await gemini(prompt);if(ai)answer=ai.trim();}catch(e){console.warn('AI response fallback:',e.message)}
  }
  if(!answer)answer=asksScheme?'🏛️ You asked for government schemes. ShramPulse can provide scheme guidance when a verified scheme source is configured; please check official government portals for current eligibility.':asksJob?'💼 You asked for job recommendations. ShramPulse can provide opportunity guidance when a verified job source is configured.':'I could not find a reliable live-data answer for that request.';
  await supabase.from('chat_messages').insert({session_id:sessionId,role:'assistant',content:answer});
  await supabase.from('chat_sessions').update({updated_at:new Date().toISOString()}).eq('id',sessionId);
  res.json({answer,source:'live-supabase',sessionId});
}catch(e){res.status(500).json({message:e.message})}});

app.use((req,res)=>res.status(404).json({message:`Route not found: ${req.method} ${req.path}`}));
app.use((err,req,res,next)=>{console.error('Server error:',err);res.status(500).json({message:'Internal server error.'})});

if (require.main === module) { ensureSeed().then(()=>app.listen(PORT,()=>console.log(`ShramPulse backend on http://localhost:${PORT}`))).catch(err=>{console.error(err.message);app.listen(PORT,()=>console.log(`ShramPulse backend started on http://localhost:${PORT}; Supabase setup required.`));}); }
module.exports = app;

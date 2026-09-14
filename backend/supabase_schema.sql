create extension if not exists pgcrypto;

create table if not exists public.workers (
  id text primary key,
  name text not null,
  email text not null unique,
  mobile text,
  password_hash text not null,
  password text,
  origin_state text,
  origin_district text,
  origin_city text,
  current_state text not null,
  current_district text,
  current_city text not null,
  occupation text not null default 'Other',
  employment_sector text not null default 'Others',
  aadhaar_last4 text,
  active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_location_update_at timestamptz
);

-- Compatibility for older prototypes that used a required `password` column.
alter table public.workers add column if not exists password text;
alter table public.workers alter column password drop not null;

create index if not exists workers_current_state_idx on public.workers(current_state);
create index if not exists workers_sector_idx on public.workers(employment_sector);
create index if not exists workers_occupation_idx on public.workers(occupation);

create table if not exists public.migration_events (
  id text primary key,
  worker_id text not null references public.workers(id) on delete cascade,
  from_state text,
  from_city text,
  to_state text not null,
  to_city text not null,
  occupation text,
  reason text,
  timestamp timestamptz not null default now(),
  confirmed boolean not null default true,
  is_migration boolean not null default true
);
create index if not exists migration_events_worker_idx on public.migration_events(worker_id);
create index if not exists migration_events_timestamp_idx on public.migration_events(timestamp desc);
alter table public.migration_events add column if not exists is_migration boolean not null default true;

create table if not exists public.location_updates (
  id text primary key,
  worker_id text not null references public.workers(id) on delete cascade,
  state text not null,
  district text,
  city text not null,
  occupation text,
  update_type text not null check (update_type in ('SAME_LOCATION','MIGRATION')),
  responded boolean not null default true,
  timestamp timestamptz not null default now()
);
create index if not exists location_updates_timestamp_idx on public.location_updates(timestamp desc);
create index if not exists location_updates_worker_idx on public.location_updates(worker_id);


create table if not exists public.sms_events (
  id text primary key,
  worker_id text not null references public.workers(id) on delete cascade,
  mobile text,
  message text not null,
  token text not null unique,
  status text not null default 'SIMULATED',
  timestamp timestamptz not null default now()
);
create index if not exists sms_events_worker_idx on public.sms_events(worker_id);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_session_idx on public.chat_messages(session_id,created_at);

alter table public.workers enable row level security;
alter table public.migration_events enable row level security;
alter table public.location_updates enable row level security;
alter table public.sms_events enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
-- The application uses the server-side Supabase service-role key. No client policy is required for this prototype.

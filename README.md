# ShramPulse — Supabase/PostgreSQL Dynamic Prototype

This version modifies the existing ShramPulse prototype rather than rebuilding its UI. Existing worker portal, map, migration workflow, opportunities, welfare cards, branding and styling are preserved; the requested persistence, analytics and authorized-assistant functionality is integrated around them.

## Database

The live application database is **Supabase PostgreSQL**.

There is no local JSON database and no Firebase dependency.

Run:

```text
backend/supabase_schema.sql
```

in the Supabase SQL Editor before starting the backend.

### Required backend environment

Copy `backend/.env.example` to `.env` and set:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
AUTHORIZED_EMAIL=authorized@shrampulse.demo
AUTHORIZED_PASSWORD=ShramPulse@2026
PORT=5050
```

The service-role key is server-only and must never be placed in frontend environment variables.

## Initial 10 demo workers

When `workers` is empty, the backend inserts exactly 10 demo workers and a small idempotent demonstration history (migration events + monthly location confirmations) so the heatmap, response analysis and six-month sector trends are populated immediately. Restarting the server does not duplicate either workers or demo history.

Demo worker password:

```text
Worker@2026
```

Emails:

```text
demo01@shrampulse.demo
demo02@shrampulse.demo
demo03@shrampulse.demo
demo04@shrampulse.demo
demo05@shrampulse.demo
demo06@shrampulse.demo
demo07@shrampulse.demo
demo08@shrampulse.demo
demo09@shrampulse.demo
demo10@shrampulse.demo
```

Authorized demo login:

```text
authorized@shrampulse.demo
ShramPulse@2026
```

For production, replace the authorized credentials with environment variables and do not publish them.

## Dynamic analytics

Authorized → **Graph** uses current active worker records and sorts states from highest to lowest migrant count.

Authorized → **Employment insights** uses the same live worker records and the canonical occupation-to-sector classifier:

1. Construction & Infrastructure — Construction worker, Electrician, Welder, Plumber
2. Manufacturing & Industrial Production — Factory/Production/Manufacturing/Industrial worker
3. Agriculture — Agricultural/Farm/Farmer/Plantation worker
4. Transportation & Logistics — Driver/Truck driver/Delivery/Transport/Logistics worker
5. Services & Security — Security/Guard/Watchman/Service worker
6. Others — everything else

The India map, state graph, employment graph and AI analytics all read the same Supabase source of truth.

## Authorized AI

The authorized assistant is English-only. It:

- uses fresh database-backed analytics for each request;
- answers state, worker, occupation, sector and migration-flow questions deterministically where possible;
- does not append schemes/jobs to normal analytics answers;
- only invokes the optional AI provider for explicit scheme/job recommendation requests;
- supports English browser speech recognition and English text-to-speech;
- stores persistent chat sessions and messages in Supabase;
- provides New Chat and chat history.

## Worker location voice

The worker migration assistant remains bilingual and supports `en-IN` and `ta-IN`. It accepts natural sentences, extracts a likely location and occupation, and requires the user to review/confirm before the existing migration update is saved.

## Local development

### Backend

```bash
cd backend
npm install
npm start
```

Backend:

```text
http://localhost:5050
```

Health:

```text
http://localhost:5050/api/health
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend normally starts at:

```text
http://localhost:5173
```

Frontend environment:

```env
VITE_API_URL=http://localhost:5050/api
```

## Vercel

The project contains Vercel configuration for both frontend and backend.

### Backend project

Set the Vercel project root to `backend` and configure:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
AUTHORIZED_EMAIL=
AUTHORIZED_PASSWORD=
```

The backend is exposed through `/api/*` by `backend/api/index.js`.

### Frontend project

Set the Vercel project root to `frontend` and configure:

```env
VITE_API_URL=https://YOUR-BACKEND.vercel.app/api
```

Build command:

```text
npm run build
```

Output directory:

```text
dist
```

## GitHub

Do not commit real `.env` files or secrets. The repository includes `.gitignore` and `.env.example`.

Do not commit `node_modules`, `dist`, logs or temporary files.

## Scope of changes

The requested changes were limited to:

- Supabase/PostgreSQL persistence;
- idempotent 10-worker seed;
- dynamic state graph;
- dynamic employment insights graph;
- occupation/sector classification;
- live analytics;
- English-only authorized AI assistant;
- persistent chat sessions/history and New Chat;
- English authorized voice input and TTS;
- Tamil + English worker location voice handling;
- responsive graph/chat additions;
- Vercel/GitHub configuration.

Existing worker-facing pages, map component, migration UI, opportunities, welfare cards, branding and core navigation were not intentionally redesigned.

## Frontend build reliability

The frontend uses pinned, compatible package versions and an explicit `vite.config.js` with the React plugin. This avoids relying on floating `latest` dependency resolution and ensures JSX/React is transformed correctly during `vite build`.

## Dynamic 3-page Migration Intelligence Report

The authorized dashboard now includes **Migration report**. The report is generated from live Supabase data and is formatted as exactly three A4 pages:

1. **Page 1 — Migration Intelligence Overview:** dynamic worker/update/response metrics, state ranking, migration status, city/occupation insights, trend summary, opportunity-gap observations.
2. **Page 2 — India Mobility Heatmap:** dynamic state-wise worker concentration map plus live state ranking and confirmed migration flows.
3. **Page 3 — Sector Migration Trends:** dynamic six-month migration-event trend for all six canonical employment sectors plus the current sector snapshot.

The report uses the same occupation-to-sector classifier as the Government dashboard. The **Download PDF** button opens the browser print dialog with A4 print CSS; choose **Save as PDF** to export the three-page report.

The Supabase schema includes `location_updates` and `migration_events.is_migration` so monthly response metrics can distinguish same-location confirmations from actual migrations.

# SwingIQ Deployment Guide

Step-by-step instructions for deploying SwingIQ to production using free-tier services.

---

## Prerequisites

Sign up for these five services (all have free tiers):

| Service   | Purpose          | URL                        |
|-----------|------------------|----------------------------|
| Neon      | PostgreSQL DB    | https://neon.tech          |
| Upstash   | Redis            | https://upstash.com        |
| Supabase  | Authentication   | https://supabase.com       |
| Render    | Backend hosting  | https://render.com         |
| Vercel    | Frontend hosting | https://vercel.com         |

---

## Step 1: Database (Neon)

1. Create a free Neon project.
2. Name the database `swingiq`.
3. Copy the connection string from the dashboard. It looks like:
   ```
   postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/swingiq
   ```
4. Append `?sslmode=require` to the connection string:
   ```
   postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/swingiq?sslmode=require
   ```
5. Save this as your `DATABASE_URL`.

---

## Step 2: Redis (Upstash)

1. Create a free Upstash Redis database.
2. Copy the **TLS** connection string from the dashboard. It starts with `rediss://` (note the double-s for TLS):
   ```
   rediss://default:xxx@us1-xxx.upstash.io:6379
   ```
3. Save this as your `REDIS_URL`.

---

## Step 3: Auth (Supabase)

1. Create a free Supabase project.
2. Go to **Settings > API** and copy:
   - **Project URL** — save as `SUPABASE_URL`
   - **anon (public) key** — save as `VITE_SUPABASE_ANON_KEY` (frontend)
   - **service_role key** — save as `SUPABASE_SERVICE_ROLE_KEY` (backend, for invite API)
3. Go to **Auth > Settings**:
   - Disable **"Enable email confirmations"** — invited users confirm via the invite link instead.
4. Go to **Auth > URL Configuration**:
   - Set the **Site URL** to your frontend production URL (e.g., `https://swingiq.vercel.app`).

---

## Step 4: Backend (Render)

1. Connect your GitHub repo to Render.
2. Create a new **Web Service**.
3. Set the **Root Directory** to `backend`.
4. Set the **Build Command**:
   ```bash
   pip install -r requirements.txt
   ```
5. Set the **Start Command**:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
6. Add all environment variables from `backend/.env.example` with your real values:
   - `DATABASE_URL`
   - `REDIS_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_EMAIL`
   - `ANTHROPIC_API_KEY`
   - `FRONTEND_URL`
7. Deploy.
8. Copy the Render service URL (e.g., `https://swingiq-api.onrender.com`) — you will need it for the frontend.

---

## Step 5: Frontend (Vercel)

1. Connect your GitHub repo to Vercel.
2. Set the **Root Directory** to `frontend`.
3. Set the **Build Command**:
   ```bash
   npm run build
   ```
4. Set the **Output Directory** to `dist`.
5. Add environment variables:
   - `VITE_API_URL` — your Render backend URL (e.g., `https://swingiq-api.onrender.com`)
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon key
6. Deploy.

---

## Step 6: Database Migration

Run Alembic migrations against the Neon database from your local machine:

```bash
cd backend
export DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/swingiq?sslmode=require"
source venv/bin/activate
alembic upgrade head
```

Verify the tables were created:

```bash
psql "$DATABASE_URL" -c "\dt"
```

---

## Keeping it Free

### Render cold starts

Render's free tier spins down the service after 15 minutes of inactivity. To keep it warm, use a free cron service (e.g., [Upstash QStash](https://upstash.com/docs/qstash), [cron-job.org](https://cron-job.org)) to ping your `/health` endpoint every 14 minutes:

```
GET https://swingiq-api.onrender.com/health
```

### Neon compute suspension

Neon suspends its compute after 5 minutes of inactivity. Reconnection takes roughly 1 second and is transparent to the application -- no code changes needed.

### Monthly limits to watch

| Service  | Free-tier limit                     |
|----------|-------------------------------------|
| Upstash  | 10,000 commands/day                 |
| Supabase | 50,000 monthly active users         |
| Neon     | 0.5 GB storage, 190 compute hours   |
| Render   | 750 hours/month (enough for 1 app)  |
| Vercel   | 100 GB bandwidth/month              |

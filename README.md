# Inbox AI

Ask your inbox anything. A web app that connects to Gmail and lets you ask natural-language questions about your email history, with AI-generated thread summaries.

## Stack

- **Frontend / Backend**: Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Database**: Supabase Postgres + `pgvector`
- **Auth**: NextAuth.js v5 (Auth.js) with Google OAuth
- **LLM**: Anthropic Claude (Sonnet for synthesis, Haiku for filter extraction)
- **Embeddings**: OpenAI `text-embedding-3-small`
- **Background jobs**: Inngest
- **Hosting**: Vercel

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Provision services

#### Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. In SQL editor, enable `pgvector`: `create extension if not exists vector;` (also done by migrations).
3. Link the local CLI: `npx supabase link --project-ref <your-ref>`.
4. Push migrations: `npm run db:push`.

#### Google Cloud / Gmail OAuth
1. Create a project in [Google Cloud Console](https://console.cloud.google.com).
2. Enable the **Gmail API**.
3. Create OAuth 2.0 credentials (Web application).
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (and your prod URL).
4. While in **Testing** mode, add your Google account email under "Test users" (max 100).

#### Inngest
1. For local dev, run `npx inngest-cli@latest dev` in a second terminal — no account needed.
2. For production, sign up at [inngest.com](https://www.inngest.com), create an app, and copy the event key + signing key.

#### Anthropic + OpenAI
- Get keys from [console.anthropic.com](https://console.anthropic.com) and [platform.openai.com](https://platform.openai.com).

### 3. Environment

```bash
cp .env.example .env.local
```

Generate the secrets:

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 32      # ENCRYPTION_KEY
```

Fill in every value in `.env.local`.

### 4. Run

In two terminals:

```bash
npm run dev
```

```bash
npm run inngest:dev
```

Visit http://localhost:3000.

## Deploying to Vercel

1. Push the repo to GitHub and import it into [vercel.com](https://vercel.com/new).
2. In **Project Settings → Environment Variables**, add every key from
   `.env.example` (production scope, and preview if you use preview deploys).
   - Skip `NEXTAUTH_URL` and `AUTH_URL`. Auth.js v5 picks up the host from
     `VERCEL_URL` because `trustHost: true` is set in `lib/auth.ts`.
   - `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are required in production
     (sign up at [inngest.com](https://www.inngest.com) and connect the Vercel
     integration so background jobs run).
   - `ENCRYPTION_KEY` must be the **same value** you used locally if you've
     already encrypted refresh tokens in Supabase, otherwise existing tokens
     can't be decrypted. Generate a fresh one (`openssl rand -hex 32`) for a
     clean Supabase project.
3. Add your production domain to Google Cloud Console as an authorized redirect
   URI: `https://<your-vercel-domain>/api/auth/callback/google`.
4. Add your production domain to the Google OAuth consent screen's authorized
   domains, and (while in Testing mode) add yourself as a test user.
5. Deploy. The first request to `/` will trigger Auth.js setup; signing in
   should redirect to `/inbox`.

`npm run build` followed by `npm run start` reproduces exactly what Vercel
serves — use it to debug production-only issues locally.

## Project layout

```
app/
  api/
    auth/[...nextauth]/   NextAuth handlers
    sync/                 Start sync (POST), poll status (GET)
    search/               Query endpoint
    threads/[id]/         Thread detail + lazy summary
    feedback/             Thumbs up/down on answers
    inngest/              Inngest serve handler
  (app)/                  Authenticated app routes
    search/               Main search page
    sync/                 First-time sync progress
    thread/[id]/          Thread detail page
  page.tsx                Landing
lib/
  db/                     Supabase queries (always include user_id)
  gmail.ts                Gmail API wrapper
  llm.ts                  Claude wrapper
  embeddings.ts           OpenAI embeddings wrapper
  encryption.ts           AES-256-GCM for refresh tokens
  email-parser.ts         MIME -> clean text
inngest/                  Background sync functions
supabase/migrations/      Schema, RLS, RPC
```

## Security

- Refresh tokens are encrypted at rest with AES-256-GCM before insertion.
- Every table has Row Level Security; users can only read their own data.
- API routes Zod-validate input and gate on `auth()`.
- Email body content is **never** logged — only metadata (message ID, user ID, action).

## Out of scope (MVP)

Email composition, multi-provider, mobile, team features, browser extension. See product doc.

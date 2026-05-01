-- Enable extensions
create extension if not exists vector;
create extension if not exists pgcrypto;

-- ============================================================
-- users
-- ============================================================
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  image text,
  google_refresh_token text,
  last_sync_at timestamptz,
  last_history_id text,
  sync_status text check (sync_status in ('pending', 'in_progress', 'complete', 'failed')) default 'pending',
  sync_progress_count int default 0,
  sync_progress_total int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- emails
-- ============================================================
create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  gmail_message_id text not null,
  thread_id text not null,
  subject text,
  from_address text,
  from_name text,
  to_addresses text[] default '{}',
  cc_addresses text[] default '{}',
  date timestamptz,
  body_text text,
  body_summary text,
  has_attachments boolean default false,
  labels text[] default '{}',
  embedding vector(1536),
  created_at timestamptz default now(),
  unique (user_id, gmail_message_id)
);

create index if not exists emails_user_id_idx on public.emails (user_id);
create index if not exists emails_user_date_idx on public.emails (user_id, date desc);
create index if not exists emails_thread_id_idx on public.emails (thread_id);
create index if not exists emails_user_thread_idx on public.emails (user_id, thread_id);
create index if not exists emails_embedding_idx on public.emails using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================
-- threads
-- ============================================================
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  gmail_thread_id text not null,
  subject text,
  participant_emails text[] default '{}',
  message_count int default 0,
  first_message_date timestamptz,
  last_message_date timestamptz,
  thread_summary text,
  summary_generated_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, gmail_thread_id)
);

create index if not exists threads_user_id_idx on public.threads (user_id);
create index if not exists threads_user_last_msg_idx on public.threads (user_id, last_message_date desc);

-- ============================================================
-- search_queries
-- ============================================================
create table if not exists public.search_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  query text not null,
  result_email_ids uuid[] default '{}',
  answer text,
  feedback text check (feedback in ('helpful', 'not_helpful')),
  created_at timestamptz default now()
);

create index if not exists search_queries_user_id_idx on public.search_queries (user_id, created_at desc);

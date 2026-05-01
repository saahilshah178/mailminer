-- Enable RLS on every user-scoped table.
-- NOTE: Auth.js v5 in this project uses JWT sessions and writes through the
-- service role key for server-side queries. RLS policies below assume that
-- direct client-side reads (if any) carry a Supabase JWT whose `sub` matches
-- our `users.id`. Service-role queries bypass RLS by design and are restricted
-- to server-only modules.

alter table public.users enable row level security;
alter table public.emails enable row level security;
alter table public.threads enable row level security;
alter table public.search_queries enable row level security;

-- users: a user can only read/update their own row
drop policy if exists "users_self_select" on public.users;
create policy "users_self_select" on public.users
  for select using (auth.uid() = id);

drop policy if exists "users_self_update" on public.users;
create policy "users_self_update" on public.users
  for update using (auth.uid() = id);

-- emails: owner-only on every operation
drop policy if exists "emails_owner_select" on public.emails;
create policy "emails_owner_select" on public.emails
  for select using (auth.uid() = user_id);

drop policy if exists "emails_owner_insert" on public.emails;
create policy "emails_owner_insert" on public.emails
  for insert with check (auth.uid() = user_id);

drop policy if exists "emails_owner_update" on public.emails;
create policy "emails_owner_update" on public.emails
  for update using (auth.uid() = user_id);

drop policy if exists "emails_owner_delete" on public.emails;
create policy "emails_owner_delete" on public.emails
  for delete using (auth.uid() = user_id);

-- threads
drop policy if exists "threads_owner_select" on public.threads;
create policy "threads_owner_select" on public.threads
  for select using (auth.uid() = user_id);

drop policy if exists "threads_owner_insert" on public.threads;
create policy "threads_owner_insert" on public.threads
  for insert with check (auth.uid() = user_id);

drop policy if exists "threads_owner_update" on public.threads;
create policy "threads_owner_update" on public.threads
  for update using (auth.uid() = user_id);

drop policy if exists "threads_owner_delete" on public.threads;
create policy "threads_owner_delete" on public.threads
  for delete using (auth.uid() = user_id);

-- search_queries
drop policy if exists "search_queries_owner_select" on public.search_queries;
create policy "search_queries_owner_select" on public.search_queries
  for select using (auth.uid() = user_id);

drop policy if exists "search_queries_owner_insert" on public.search_queries;
create policy "search_queries_owner_insert" on public.search_queries
  for insert with check (auth.uid() = user_id);

drop policy if exists "search_queries_owner_update" on public.search_queries;
create policy "search_queries_owner_update" on public.search_queries
  for update using (auth.uid() = user_id);

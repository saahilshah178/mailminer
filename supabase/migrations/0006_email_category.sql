-- Per-message Gmail tab category, derived from `labels`.
--
-- Gmail tags every INBOX message with exactly one CATEGORY_* label
-- (CATEGORY_PRIMARY, CATEGORY_SOCIAL, CATEGORY_PROMOTIONS, CATEGORY_UPDATES,
-- CATEGORY_FORUMS). Sent / drafts / very old INBOX messages may have none.
-- We materialise that into a single `category` column so all downstream
-- queries can filter by it directly instead of poking at `labels` arrays.
--
-- The column is a STORED generated column so it auto-recomputes whenever
-- `labels` is upserted — sync code never has to remember to update it.
--
-- Tab assignment:
--   * Primary tab = threads whose latest INBOX message's category is in
--     ('primary', 'forums', 'none') — i.e. anything Gmail did NOT classify
--     as a noisy category.
--   * Other tab   = threads whose latest INBOX message's category is in
--     ('social', 'promotions', 'updates').
--
-- Using the latest INBOX message's category mirrors Gmail's own behaviour:
-- a thread shows under whichever tab its newest inbox-bound message belongs
-- to.

-- 1. Public helper for any callers that need to derive a category from a
-- labels array (e.g. one-off backfills, ad-hoc queries).
create or replace function public.gmail_category_from_labels(p_labels text[])
returns text
language sql
immutable
as $$
  select case
    when 'CATEGORY_PRIMARY'    = any(coalesce(p_labels, '{}'::text[])) then 'primary'
    when 'CATEGORY_SOCIAL'     = any(coalesce(p_labels, '{}'::text[])) then 'social'
    when 'CATEGORY_PROMOTIONS' = any(coalesce(p_labels, '{}'::text[])) then 'promotions'
    when 'CATEGORY_UPDATES'    = any(coalesce(p_labels, '{}'::text[])) then 'updates'
    when 'CATEGORY_FORUMS'     = any(coalesce(p_labels, '{}'::text[])) then 'forums'
    else 'none'
  end;
$$;

-- 2. Plain column with a constant default (Postgres ≥11 stores constant
-- defaults in metadata, so this does NOT rewrite the table — important on
-- managed instances with limited maintenance_work_mem).
alter table public.emails
  add column if not exists category text not null default 'none';

-- 3. Trigger that re-derives `category` from `labels` on every insert/update.
-- Behaves like a generated column but doesn't require a table rewrite to
-- install. App code never has to remember to set `category`.
create or replace function public.emails_set_category()
returns trigger
language plpgsql
as $$
begin
  new.category := public.gmail_category_from_labels(new.labels);
  return new;
end;
$$;

drop trigger if exists trg_emails_set_category on public.emails;
create trigger trg_emails_set_category
  before insert or update of labels on public.emails
  for each row
  execute function public.emails_set_category();

-- 4. Backfill existing rows in chunks so we never blow the WAL or memory
-- budget on large mailboxes. The CTE-based loop walks `id` in batches of
-- 5,000 and only touches rows whose stored category disagrees with what the
-- helper would compute — i.e. it's idempotent and safe to re-run.
do $$
declare
  rows_updated int;
begin
  loop
    with batch as (
      select id
      from public.emails
      where category is distinct from public.gmail_category_from_labels(labels)
      limit 5000
    )
    update public.emails e
       set category = public.gmail_category_from_labels(e.labels)
      from batch
     where e.id = batch.id;
    get diagnostics rows_updated = row_count;
    exit when rows_updated = 0;
  end loop;
end;
$$;

create index if not exists emails_user_category_idx
  on public.emails (user_id, category);

-- 3. Rewrite `thread_list_filtered` to filter by *latest INBOX message's*
-- category instead of the previous "any message in thread has X label"
-- heuristic. The signature changes shape — the old `p_any_categories` /
-- `p_exclude_categories` (which referenced raw label IDs like
-- "CATEGORY_PROMOTIONS") are replaced by `p_categories` (an array of
-- normalised category names: 'primary' | 'social' | …).
drop function if exists public.thread_list_filtered(
  uuid, text, text[], text[], int, int
);

create or replace function public.thread_list_filtered(
  p_user_id uuid,
  p_include_label text default 'INBOX',
  p_categories text[] default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  thread_db_id uuid,
  gmail_thread_id text,
  subject text,
  participant_emails text[],
  message_count int,
  last_message_date timestamptz,
  latest_from_address text,
  latest_from_name text,
  latest_snippet text,
  latest_has_attachments boolean,
  is_unread boolean,
  is_starred boolean,
  is_important boolean,
  category text
)
language sql
stable
as $$
  with thread_label_set as (
    select
      e.thread_id,
      array_agg(distinct lab) as all_labels
    from public.emails e,
         unnest(coalesce(e.labels, '{}'::text[])) lab
    where e.user_id = p_user_id
    group by e.thread_id
  ),
  -- Latest message overall in the thread — drives the snippet / from / date
  -- the UI displays.
  latest_per_thread as (
    select distinct on (e.thread_id)
      e.thread_id,
      e.from_address,
      e.from_name,
      e.body_text,
      e.has_attachments,
      e.date
    from public.emails e
    where e.user_id = p_user_id
    order by e.thread_id, e.date desc nulls last
  ),
  -- Latest INBOX message — drives which tab the thread belongs to. If the
  -- thread has no INBOX message we fall back to the latest message overall.
  latest_inbox_per_thread as (
    select distinct on (e.thread_id)
      e.thread_id,
      e.category
    from public.emails e
    where e.user_id = p_user_id
      and 'INBOX' = any(coalesce(e.labels, '{}'::text[]))
    order by e.thread_id, e.date desc nulls last
  ),
  thread_category as (
    select
      lpt.thread_id,
      coalesce(lipt.category, public.gmail_category_from_labels(NULL)) as category
    from latest_per_thread lpt
    left join latest_inbox_per_thread lipt on lipt.thread_id = lpt.thread_id
  ),
  matching_thread_ids as (
    select t.thread_id
    from thread_label_set t
    join thread_category tc on tc.thread_id = t.thread_id
    where (p_include_label is null or p_include_label = any(t.all_labels))
      and (
        p_categories is null
        or coalesce(array_length(p_categories, 1), 0) = 0
        or tc.category = any(p_categories)
      )
  ),
  thread_label_agg as (
    select e.thread_id,
      bool_or('UNREAD' = any(e.labels)) as is_unread,
      bool_or('STARRED' = any(e.labels)) as is_starred,
      bool_or('IMPORTANT' = any(e.labels)) as is_important
    from public.emails e
    join matching_thread_ids m on m.thread_id = e.thread_id
    where e.user_id = p_user_id
    group by e.thread_id
  )
  select
    t.id as thread_db_id,
    t.gmail_thread_id,
    t.subject,
    t.participant_emails,
    t.message_count,
    t.last_message_date,
    l.from_address as latest_from_address,
    l.from_name as latest_from_name,
    substring(coalesce(l.body_text, '') for 220) as latest_snippet,
    coalesce(l.has_attachments, false) as latest_has_attachments,
    coalesce(a.is_unread, false) as is_unread,
    coalesce(a.is_starred, false) as is_starred,
    coalesce(a.is_important, false) as is_important,
    tc.category as category
  from public.threads t
  join latest_per_thread l on l.thread_id = t.gmail_thread_id
  join thread_category tc on tc.thread_id = t.gmail_thread_id
  join matching_thread_ids m on m.thread_id = t.gmail_thread_id
  left join thread_label_agg a on a.thread_id = t.gmail_thread_id
  where t.user_id = p_user_id
  order by t.last_message_date desc nulls last
  limit p_limit offset p_offset;
$$;

-- 4. Extend the legacy `thread_list` RPC to also return `category` so callers
-- can render the same `InboxThreadRow` shape regardless of which RPC the
-- list came from.
drop function if exists public.thread_list(uuid, text, int, int);

create or replace function public.thread_list(
  p_user_id uuid,
  p_label text default 'INBOX',
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  thread_db_id uuid,
  gmail_thread_id text,
  subject text,
  participant_emails text[],
  message_count int,
  last_message_date timestamptz,
  latest_from_address text,
  latest_from_name text,
  latest_snippet text,
  latest_has_attachments boolean,
  is_unread boolean,
  is_starred boolean,
  is_important boolean,
  category text
)
language sql
stable
as $$
  with matching_thread_ids as (
    select distinct thread_id
    from public.emails
    where user_id = p_user_id
      and (p_label is null or p_label = any(labels))
  ),
  latest_per_thread as (
    select distinct on (e.thread_id)
      e.thread_id,
      e.from_address,
      e.from_name,
      e.body_text,
      e.has_attachments,
      e.date
    from public.emails e
    join matching_thread_ids m on m.thread_id = e.thread_id
    where e.user_id = p_user_id
    order by e.thread_id, e.date desc nulls last
  ),
  latest_inbox_per_thread as (
    select distinct on (e.thread_id)
      e.thread_id,
      e.category
    from public.emails e
    join matching_thread_ids m on m.thread_id = e.thread_id
    where e.user_id = p_user_id
      and 'INBOX' = any(coalesce(e.labels, '{}'::text[]))
    order by e.thread_id, e.date desc nulls last
  ),
  thread_label_agg as (
    select e.thread_id,
      bool_or('UNREAD' = any(e.labels)) as is_unread,
      bool_or('STARRED' = any(e.labels)) as is_starred,
      bool_or('IMPORTANT' = any(e.labels)) as is_important
    from public.emails e
    join matching_thread_ids m on m.thread_id = e.thread_id
    where e.user_id = p_user_id
    group by e.thread_id
  )
  select
    t.id as thread_db_id,
    t.gmail_thread_id,
    t.subject,
    t.participant_emails,
    t.message_count,
    t.last_message_date,
    l.from_address as latest_from_address,
    l.from_name as latest_from_name,
    substring(coalesce(l.body_text, '') for 220) as latest_snippet,
    coalesce(l.has_attachments, false) as latest_has_attachments,
    coalesce(a.is_unread, false) as is_unread,
    coalesce(a.is_starred, false) as is_starred,
    coalesce(a.is_important, false) as is_important,
    coalesce(li.category, 'none') as category
  from public.threads t
  join latest_per_thread l on l.thread_id = t.gmail_thread_id
  left join thread_label_agg a on a.thread_id = t.gmail_thread_id
  left join latest_inbox_per_thread li on li.thread_id = t.gmail_thread_id
  where t.user_id = p_user_id
  order by t.last_message_date desc nulls last
  limit p_limit offset p_offset;
$$;

-- 5. Rewrite `inbox_tab_counts` to bucket by latest-INBOX-message category.
create or replace function public.inbox_tab_counts(p_user_id uuid)
returns table (
  primary_total bigint,
  primary_unread bigint,
  other_total bigint,
  other_unread bigint
)
language sql
stable
as $$
  with thread_meta as (
    select
      e.thread_id,
      bool_or('INBOX' = any(coalesce(e.labels, '{}'::text[]))) as has_inbox,
      bool_or('UNREAD' = any(coalesce(e.labels, '{}'::text[]))) as is_unread
    from public.emails e
    where e.user_id = p_user_id
    group by e.thread_id
  ),
  latest_inbox_per_thread as (
    select distinct on (e.thread_id)
      e.thread_id,
      e.category
    from public.emails e
    where e.user_id = p_user_id
      and 'INBOX' = any(coalesce(e.labels, '{}'::text[]))
    order by e.thread_id, e.date desc nulls last
  )
  select
    count(*) filter (
      where m.has_inbox
        and l.category in ('primary', 'forums', 'none')
    )::bigint as primary_total,
    count(*) filter (
      where m.has_inbox
        and l.category in ('primary', 'forums', 'none')
        and m.is_unread
    )::bigint as primary_unread,
    count(*) filter (
      where m.has_inbox
        and l.category in ('social', 'promotions', 'updates')
    )::bigint as other_total,
    count(*) filter (
      where m.has_inbox
        and l.category in ('social', 'promotions', 'updates')
        and m.is_unread
    )::bigint as other_unread
  from thread_meta m
  join latest_inbox_per_thread l on l.thread_id = m.thread_id;
$$;

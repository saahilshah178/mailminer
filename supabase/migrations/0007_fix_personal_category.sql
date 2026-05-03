-- Bugfix: Gmail's API uses `CATEGORY_PERSONAL` (not `CATEGORY_PRIMARY`) as
-- the system label for messages in the Primary tab. Migration 0006 checked
-- for `CATEGORY_PRIMARY`, which never matches, so every primary-tagged
-- message in users' mailboxes was deriving category='none'.
--
-- This migration:
--   1. Repoints `gmail_category_from_labels` at the correct label.
--   2. Re-runs the chunked backfill so every existing email row recomputes
--      its `category` column. The trigger from 0006 covers future writes.
--   3. Tightens the inbox-tab count function: Primary = ONLY explicit
--      `category = 'primary'` rows; Other = everything else (matches the
--      product spec "anything not marked CATEGORY_PRIMARY belongs to other").

create or replace function public.gmail_category_from_labels(p_labels text[])
returns text
language sql
immutable
as $$
  select case
    when 'CATEGORY_PERSONAL'   = any(coalesce(p_labels, '{}'::text[])) then 'primary'
    when 'CATEGORY_SOCIAL'     = any(coalesce(p_labels, '{}'::text[])) then 'social'
    when 'CATEGORY_PROMOTIONS' = any(coalesce(p_labels, '{}'::text[])) then 'promotions'
    when 'CATEGORY_UPDATES'    = any(coalesce(p_labels, '{}'::text[])) then 'updates'
    when 'CATEGORY_FORUMS'     = any(coalesce(p_labels, '{}'::text[])) then 'forums'
    else 'none'
  end;
$$;

-- Re-derive `category` for every row whose stored value disagrees with the
-- (now-corrected) helper. Idempotent + chunked so it's safe on large
-- mailboxes within Supabase's maintenance_work_mem budget.
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

-- Inbox tab counts: Primary = exactly `category = 'primary'` for the latest
-- INBOX message in the thread; Other = anything else.
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
      where m.has_inbox and l.category = 'primary'
    )::bigint as primary_total,
    count(*) filter (
      where m.has_inbox and l.category = 'primary' and m.is_unread
    )::bigint as primary_unread,
    count(*) filter (
      where m.has_inbox and l.category <> 'primary'
    )::bigint as other_total,
    count(*) filter (
      where m.has_inbox and l.category <> 'primary' and m.is_unread
    )::bigint as other_unread
  from thread_meta m
  join latest_inbox_per_thread l on l.thread_id = m.thread_id;
$$;

-- Per-user spec: rebuild Primary/Other inbox tab partitioning around
-- IMPORTANT + CATEGORY_PERSONAL labels (not just CATEGORY_*).
--
-- Per-message rule (applied to the message's `labels` array):
--   1. No INBOX label  → message lives in SENT / SPAM / etc., not in either
--      inbox tab.
--   2. INBOX + IMPORTANT          → primary (importance overrides category).
--   3. INBOX + CATEGORY_PERSONAL  → primary (and no IMPORTANT required).
--   4. INBOX otherwise            → other.
--
-- Threads inherit the classification of their *latest INBOX message*,
-- mirroring how Gmail itself buckets threads.
--
-- Mirrors `classifyInboxTab` in `lib/gmail-category.ts` — keep them in
-- lockstep.

-- 1. Reusable predicate so call sites and the count RPC share one definition.
create or replace function public.inbox_tab_for_labels(p_labels text[])
returns text
language sql
immutable
as $$
  select case
    when not ('INBOX' = any(coalesce(p_labels, '{}'::text[]))) then null
    when 'IMPORTANT'         = any(p_labels) then 'primary'
    when 'CATEGORY_PERSONAL' = any(p_labels) then 'primary'
    else 'other'
  end;
$$;

-- 2. Replace `thread_list_filtered` signature: drop the old (uuid, text, text[], int, int)
-- variant and recreate it with `p_tab text` instead of `p_categories text[]`.
drop function if exists public.thread_list_filtered(
  uuid, text, text[], int, int
);

create or replace function public.thread_list_filtered(
  p_user_id uuid,
  p_include_label text default 'INBOX',
  p_tab text default null,
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
  -- Latest message overall — drives snippet / from / date in the UI.
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
  -- Latest INBOX message — drives tab + category for the thread.
  latest_inbox_per_thread as (
    select distinct on (e.thread_id)
      e.thread_id,
      e.category,
      e.labels
    from public.emails e
    where e.user_id = p_user_id
      and 'INBOX' = any(coalesce(e.labels, '{}'::text[]))
    order by e.thread_id, e.date desc nulls last
  ),
  thread_classification as (
    select
      lpt.thread_id,
      coalesce(lipt.category, 'none') as category,
      public.inbox_tab_for_labels(lipt.labels) as tab
    from latest_per_thread lpt
    left join latest_inbox_per_thread lipt on lipt.thread_id = lpt.thread_id
  ),
  matching_thread_ids as (
    select t.thread_id
    from thread_label_set t
    join thread_classification tc on tc.thread_id = t.thread_id
    where (p_include_label is null or p_include_label = any(t.all_labels))
      and (p_tab is null or tc.tab = p_tab)
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
  join thread_classification tc on tc.thread_id = t.gmail_thread_id
  join matching_thread_ids m on m.thread_id = t.gmail_thread_id
  left join thread_label_agg a on a.thread_id = t.gmail_thread_id
  where t.user_id = p_user_id
  order by t.last_message_date desc nulls last
  limit p_limit offset p_offset;
$$;

-- 3. Rewrite `inbox_tab_counts` to use the same per-message classifier,
-- driven by the latest INBOX message in each thread.
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
      e.labels
    from public.emails e
    where e.user_id = p_user_id
      and 'INBOX' = any(coalesce(e.labels, '{}'::text[]))
    order by e.thread_id, e.date desc nulls last
  ),
  classified as (
    select
      m.thread_id,
      m.has_inbox,
      m.is_unread,
      public.inbox_tab_for_labels(l.labels) as tab
    from thread_meta m
    join latest_inbox_per_thread l on l.thread_id = m.thread_id
  )
  select
    count(*) filter (where has_inbox and tab = 'primary')::bigint as primary_total,
    count(*) filter (where has_inbox and tab = 'primary' and is_unread)::bigint as primary_unread,
    count(*) filter (where has_inbox and tab = 'other')::bigint as other_total,
    count(*) filter (where has_inbox and tab = 'other' and is_unread)::bigint as other_unread
  from classified;
$$;

-- Inbox Primary/Other tab support.
--
-- Gmail buckets messages into category labels (CATEGORY_PROMOTIONS,
-- CATEGORY_SOCIAL, CATEGORY_UPDATES, CATEGORY_FORUMS) in addition to INBOX.
-- We want the default "/inbox" view to show two tabs:
--   * Primary  = INBOX threads with NONE of the noisy categories.
--   * Other    = INBOX threads tagged with at least one of those categories.
--
-- `thread_list_filtered` generalises the existing `thread_list` RPC to take
-- both "must contain at least one of these labels" (`p_any_categories`) and
-- "must contain none of these labels" (`p_exclude_categories`) sets so the
-- same query backs both tabs.
--
-- `inbox_tab_counts` returns one row with totals + unread counts per tab so
-- the UI can render `Primary  3 new` / `Other  127` in a single round-trip.

create or replace function public.thread_list_filtered(
  p_user_id uuid,
  p_include_label text default 'INBOX',
  p_any_categories text[] default null,
  p_exclude_categories text[] default null,
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
  is_important boolean
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
  matching_thread_ids as (
    select thread_id
    from thread_label_set
    where (p_include_label is null or p_include_label = any(all_labels))
      and (
        p_any_categories is null
        or coalesce(array_length(p_any_categories, 1), 0) = 0
        or all_labels && p_any_categories
      )
      and (
        p_exclude_categories is null
        or coalesce(array_length(p_exclude_categories, 1), 0) = 0
        or not (all_labels && p_exclude_categories)
      )
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
    coalesce(a.is_important, false) as is_important
  from public.threads t
  join latest_per_thread l on l.thread_id = t.gmail_thread_id
  left join thread_label_agg a on a.thread_id = t.gmail_thread_id
  where t.user_id = p_user_id
  order by t.last_message_date desc nulls last
  limit p_limit offset p_offset;
$$;

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
  with thread_labels as (
    select
      e.thread_id,
      bool_or('INBOX' = any(e.labels)) as has_inbox,
      bool_or('UNREAD' = any(e.labels)) as is_unread,
      bool_or(
        'CATEGORY_PROMOTIONS' = any(e.labels)
        or 'CATEGORY_SOCIAL' = any(e.labels)
        or 'CATEGORY_UPDATES' = any(e.labels)
      ) as has_other_category
    from public.emails e
    where e.user_id = p_user_id
    group by e.thread_id
  )
  select
    count(*) filter (where has_inbox and not has_other_category)::bigint as primary_total,
    count(*) filter (where has_inbox and not has_other_category and is_unread)::bigint as primary_unread,
    count(*) filter (where has_inbox and has_other_category)::bigint as other_total,
    count(*) filter (where has_inbox and has_other_category and is_unread)::bigint as other_unread
  from thread_labels;
$$;

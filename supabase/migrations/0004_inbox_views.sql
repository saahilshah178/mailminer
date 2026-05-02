-- Inbox-style thread listing.
--
-- Returns one row per Gmail thread, ordered by the latest message date in the
-- thread. Optionally filters to threads that contain at least one email with a
-- given Gmail label (e.g. INBOX, STARRED, SENT, IMPORTANT, CATEGORY_*).
-- Aggregates UNREAD/STARRED/IMPORTANT label flags across all messages in the
-- thread so the UI can render the unread bold state, star, etc.
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
  is_important boolean
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

-- Per-label thread totals + unread totals for the sidebar.
create or replace function public.thread_label_counts(p_user_id uuid)
returns table (
  label text,
  total_count bigint,
  unread_count bigint
)
language sql
stable
as $$
  with email_labels as (
    select
      e.thread_id,
      unnest(e.labels) as label,
      'UNREAD' = any(e.labels) as is_unread
    from public.emails e
    where e.user_id = p_user_id
  ),
  per_thread as (
    select label, thread_id, bool_or(is_unread) as thread_unread
    from email_labels
    group by label, thread_id
  )
  select
    label,
    count(*)::bigint as total_count,
    count(*) filter (where thread_unread)::bigint as unread_count
  from per_thread
  group by label;
$$;

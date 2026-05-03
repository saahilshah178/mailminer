-- Widen the inbox Primary tab to match what Gmail's web UI shows under the
-- (default for many users) "tabs disabled" setting: everything in INBOX
-- except marketing-grade noise.
--
-- Tab assignment is now:
--   * Primary = INBOX, latest message category in (primary, updates, forums, none)
--   * Other   = INBOX, latest message category in (promotions, social)
--
-- Mirrors the JS `PRIMARY_TAB_CATEGORIES` / `OTHER_TAB_CATEGORIES` arrays in
-- lib/gmail-category.ts — keep them in lockstep.

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
        and l.category in ('primary', 'updates', 'forums', 'none')
    )::bigint as primary_total,
    count(*) filter (
      where m.has_inbox
        and l.category in ('primary', 'updates', 'forums', 'none')
        and m.is_unread
    )::bigint as primary_unread,
    count(*) filter (
      where m.has_inbox
        and l.category in ('promotions', 'social')
    )::bigint as other_total,
    count(*) filter (
      where m.has_inbox
        and l.category in ('promotions', 'social')
        and m.is_unread
    )::bigint as other_unread
  from thread_meta m
  join latest_inbox_per_thread l on l.thread_id = m.thread_id;
$$;

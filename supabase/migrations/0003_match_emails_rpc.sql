-- Cosine top-k retrieval for a given user. Server callable via supabase.rpc().
-- Supports optional structured filters extracted from the user's query.

create or replace function public.match_emails(
  p_user_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 30,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_sender_domain text default null,
  p_has_attachments boolean default null
)
returns table (
  id uuid,
  gmail_message_id text,
  thread_id text,
  subject text,
  from_address text,
  from_name text,
  to_addresses text[],
  date timestamptz,
  body_text text,
  has_attachments boolean,
  labels text[],
  similarity float
)
language sql
stable
as $$
  select
    e.id,
    e.gmail_message_id,
    e.thread_id,
    e.subject,
    e.from_address,
    e.from_name,
    e.to_addresses,
    e.date,
    e.body_text,
    e.has_attachments,
    e.labels,
    1 - (e.embedding <=> p_query_embedding) as similarity
  from public.emails e
  where e.user_id = p_user_id
    and e.embedding is not null
    and (p_date_from is null or e.date >= p_date_from)
    and (p_date_to is null or e.date <= p_date_to)
    and (p_sender_domain is null or e.from_address ilike '%@' || p_sender_domain)
    and (p_has_attachments is null or e.has_attachments = p_has_attachments)
  order by e.embedding <=> p_query_embedding
  limit p_match_count;
$$;

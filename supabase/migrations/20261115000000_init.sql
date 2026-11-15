-- MyAI schema: conversations, messages, PDF RAG, image storage, daily quotas.
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ───────────── Conversations & messages ─────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_user_updated on public.conversations (user_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,   -- { sources: [...], image_path: "..." }
  created_at timestamptz not null default now()
);
create index messages_conv_created on public.messages (conversation_id, created_at);
-- Trigram index: substring search that works for Arabic and English alike.
create index messages_content_trgm on public.messages using gin (content extensions.gin_trgm_ops);

-- ───────────── Documents (PDF RAG) ─────────────
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now()
);
create index documents_conv on public.documents (conversation_id);

create table public.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page int,
  content text not null,
  embedding extensions.vector(768) not null
);
create index document_chunks_doc on public.document_chunks (document_id);
-- Exact search is used because queries are scoped to a handful of the user's documents.
-- Add an HNSW index once you exceed ~100k chunks:
--   create index on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ───────────── Daily usage quotas (protects your Gemini bill) ─────────────
create table public.usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  kind text not null,
  count int not null default 0,
  primary key (user_id, day, kind)
);

-- ───────────── Row Level Security ─────────────
alter table public.conversations   enable row level security;
alter table public.messages        enable row level security;
alter table public.documents       enable row level security;
alter table public.document_chunks enable row level security;
alter table public.usage_daily     enable row level security;

create policy own_conversations on public.conversations for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy own_messages on public.messages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.conversations c
                where c.id = conversation_id and c.user_id = (select auth.uid()))
  );

create policy own_documents on public.documents for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (conversation_id is null or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())))
  );

create policy own_chunks on public.document_chunks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.documents d
                where d.id = document_id and d.user_id = (select auth.uid()))
  );

-- Users can read their usage, but only consume_quota() writes it.
create policy read_own_usage on public.usage_daily for select to authenticated
  using (user_id = (select auth.uid()));

-- ───────────── Functions ─────────────
create or replace function public.match_chunks(
  query_embedding extensions.vector(768),
  document_ids uuid[],
  match_count int default 8
)
returns table (id bigint, document_id uuid, page int, content text, similarity float)
language sql stable security invoker
set search_path = public, extensions
as $$
  select c.id, c.document_id, c.page, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  where c.document_id = any(document_ids)
  order by c.embedding <=> query_embedding
  limit least(match_count, 20);
$$;

create or replace function public.search_messages(q text)
returns table (conversation_id uuid, title text, snippet text, created_at timestamptz)
language sql stable security invoker
set search_path = public, extensions
as $$
  select m.conversation_id, c.title, left(m.content, 200), m.created_at
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.content ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by m.created_at desc
  limit 50;
$$;

-- Atomically increments today's counter; returns false once the limit is exceeded.
create or replace function public.consume_quota(p_kind text, p_limit int)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare
  c int;
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into public.usage_daily (user_id, day, kind, count)
  values (auth.uid(), current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set count = usage_daily.count + 1
  returning count into c;
  return c <= p_limit;
end;
$$;
revoke execute on function public.consume_quota(text, int) from public, anon;
grant execute on function public.consume_quota(text, int) to authenticated;

-- ───────────── Storage: private bucket, one folder per user ─────────────
insert into storage.buckets (id, name, public)
values ('generated-images', 'generated-images', false)
on conflict (id) do nothing;

create policy img_select on storage.objects for select to authenticated
  using (bucket_id = 'generated-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy img_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'generated-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy img_delete on storage.objects for delete to authenticated
  using (bucket_id = 'generated-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table if not exists public.conversations (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  companion_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (user_id, id)
);

create table if not exists public.messages (
  id text not null,
  conversation_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  companion_id text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  modality text not null check (modality in ('text', 'voice_message', 'live_call', 'proactive')),
  created_at timestamptz not null,
  archived_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (user_id, id),
  foreign key (user_id, conversation_id) references public.conversations(user_id, id) on delete cascade
);

create index if not exists messages_archive_order_idx
  on public.messages (user_id, conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Users own conversations" on public.conversations;
create policy "Users own conversations" on public.conversations
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users own messages" on public.messages;
create policy "Users own messages" on public.messages
  for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations
      where conversations.user_id = auth.uid()
        and conversations.id = messages.conversation_id
    )
  );

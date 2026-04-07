create extension if not exists "pgcrypto";

create table if not exists public.happiness_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  display_name text not null,
  eta_weights jsonb not null default '{"relational":35,"expressive":25,"reflective":15,"virtuous":25}'::jsonb,
  iota_weights jsonb not null default '{"today":60,"recent":25,"medium":10,"long":5}'::jsonb,
  windows jsonb not null default '{"recentDays":2,"mediumDays":45,"longDays":548}'::jsonb,
  baselines jsonb not null default '{"recent":9,"medium":6.5,"long":8}'::jsonb,
  reminder_time time not null default '23:00',
  timezone text not null default 'Europe/Rome',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.happiness_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.happiness_profiles(id) on delete cascade,
  entry_date date not null,
  relational numeric(4,2) not null check (relational between 0 and 10),
  expressive numeric(4,2) not null check (expressive between 0 and 10),
  reflective numeric(4,2) not null check (reflective between 0 and 10),
  virtuous numeric(4,2) not null check (virtuous between 0 and 10),
  eta numeric(5,2) not null,
  iota numeric(5,2) not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, entry_date)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.happiness_profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.happiness_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.happiness_profiles(id) on delete cascade,
  local_date date not null,
  sent_at timestamptz not null default now(),
  unique (profile_id, local_date)
);

create index if not exists happiness_entries_profile_date_idx
  on public.happiness_entries (profile_id, entry_date desc);

create index if not exists happiness_profiles_reminder_idx
  on public.happiness_profiles (timezone, reminder_time);

create index if not exists happiness_reminder_logs_profile_date_idx
  on public.happiness_reminder_logs (profile_id, local_date desc);

alter table public.happiness_profiles enable row level security;
alter table public.happiness_entries enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.happiness_reminder_logs enable row level security;

drop policy if exists "profiles_select_own" on public.happiness_profiles;
create policy "profiles_select_own"
  on public.happiness_profiles
  for select
  using (owner_user_id = auth.uid());

drop policy if exists "profiles_insert_own" on public.happiness_profiles;
create policy "profiles_insert_own"
  on public.happiness_profiles
  for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "profiles_update_own" on public.happiness_profiles;
create policy "profiles_update_own"
  on public.happiness_profiles
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "profiles_delete_own" on public.happiness_profiles;
create policy "profiles_delete_own"
  on public.happiness_profiles
  for delete
  using (owner_user_id = auth.uid());

drop policy if exists "entries_select_own" on public.happiness_entries;
create policy "entries_select_own"
  on public.happiness_entries
  for select
  using (
    exists (
      select 1
      from public.happiness_profiles p
      where p.id = happiness_entries.profile_id
        and p.owner_user_id = auth.uid()
    )
  );

drop policy if exists "entries_insert_own" on public.happiness_entries;
create policy "entries_insert_own"
  on public.happiness_entries
  for insert
  with check (
    exists (
      select 1
      from public.happiness_profiles p
      where p.id = happiness_entries.profile_id
        and p.owner_user_id = auth.uid()
    )
  );

drop policy if exists "entries_update_own" on public.happiness_entries;
create policy "entries_update_own"
  on public.happiness_entries
  for update
  using (
    exists (
      select 1
      from public.happiness_profiles p
      where p.id = happiness_entries.profile_id
        and p.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.happiness_profiles p
      where p.id = happiness_entries.profile_id
        and p.owner_user_id = auth.uid()
    )
  );

drop policy if exists "entries_delete_own" on public.happiness_entries;
create policy "entries_delete_own"
  on public.happiness_entries
  for delete
  using (
    exists (
      select 1
      from public.happiness_profiles p
      where p.id = happiness_entries.profile_id
        and p.owner_user_id = auth.uid()
    )
  );

drop policy if exists "push_select_own" on public.push_subscriptions;
create policy "push_select_own"
  on public.push_subscriptions
  for select
  using (
    exists (
      select 1
      from public.happiness_profiles p
      where p.id = push_subscriptions.profile_id
        and p.owner_user_id = auth.uid()
    )
  );

drop policy if exists "push_insert_own" on public.push_subscriptions;
create policy "push_insert_own"
  on public.push_subscriptions
  for insert
  with check (
    exists (
      select 1
      from public.happiness_profiles p
      where p.id = push_subscriptions.profile_id
        and p.owner_user_id = auth.uid()
    )
  );

drop policy if exists "push_update_own" on public.push_subscriptions;
create policy "push_update_own"
  on public.push_subscriptions
  for update
  using (
    exists (
      select 1
      from public.happiness_profiles p
      where p.id = push_subscriptions.profile_id
        and p.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.happiness_profiles p
      where p.id = push_subscriptions.profile_id
        and p.owner_user_id = auth.uid()
    )
  );

drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_delete_own"
  on public.push_subscriptions
  for delete
  using (
    exists (
      select 1
      from public.happiness_profiles p
      where p.id = push_subscriptions.profile_id
        and p.owner_user_id = auth.uid()
    )
  );

drop policy if exists "reminder_logs_select_own" on public.happiness_reminder_logs;
create policy "reminder_logs_select_own"
  on public.happiness_reminder_logs
  for select
  using (
    exists (
      select 1
      from public.happiness_profiles p
      where p.id = happiness_reminder_logs.profile_id
        and p.owner_user_id = auth.uid()
    )
  );

create or replace function public.due_push_subscriptions(lookahead_minutes integer default 15)
returns table (
  profile_id uuid,
  display_name text,
  local_date date,
  endpoint text,
  p256dh text,
  auth text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as profile_id,
    p.display_name,
    timezone(p.timezone, now())::date as local_date,
    s.endpoint,
    s.p256dh,
    s.auth
  from public.happiness_profiles p
  join public.push_subscriptions s
    on s.profile_id = p.id
  where timezone(p.timezone, now())::time >= p.reminder_time
    and timezone(p.timezone, now())::time < (p.reminder_time + make_interval(mins => lookahead_minutes))
    and not exists (
      select 1
      from public.happiness_entries e
      where e.profile_id = p.id
        and e.entry_date = timezone(p.timezone, now())::date
    )
    and not exists (
      select 1
      from public.happiness_reminder_logs r
      where r.profile_id = p.id
        and r.local_date = timezone(p.timezone, now())::date
    );
$$;

revoke all on function public.due_push_subscriptions(integer) from public;
revoke all on function public.due_push_subscriptions(integer) from anon;
revoke all on function public.due_push_subscriptions(integer) from authenticated;
grant execute on function public.due_push_subscriptions(integer) to service_role;

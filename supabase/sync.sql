-- Run in the SUPABASE CLOUD SQL Editor, as the project owner.
-- No local PostgreSQL instance is required. Re-running does not reset records.
begin;
create table if not exists public.passage_account (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id)
);
alter table public.passage_account enable row level security;
revoke all on public.passage_account from public, anon, authenticated;

create table if not exists public.passage_snapshots (
  user_id uuid primary key references auth.users(id),
  version bigint not null check (version between 1 and 9007199254740991),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  seed_hash text not null check (seed_hash = '8039b22a5425a868fb8b29340f3a54998548eb28a9fd2b1507d51d13efbc9a2e'),
  seed_backup text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.passage_revisions (
  user_id uuid not null references auth.users(id),
  version bigint not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, version)
);
alter table public.passage_snapshots enable row level security;
alter table public.passage_revisions enable row level security;
revoke all on public.passage_snapshots, public.passage_revisions from public, anon, authenticated;
grant select (user_id, version, snapshot, seed_hash, updated_at) on public.passage_snapshots to authenticated;
grant select on public.passage_revisions to authenticated;
drop policy if exists passage_own_snapshot on public.passage_snapshots;
create policy passage_own_snapshot on public.passage_snapshots for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists passage_own_revisions on public.passage_revisions;
create policy passage_own_revisions on public.passage_revisions for select to authenticated using ((select auth.uid()) = user_id);

-- No direct INSERT/UPDATE/DELETE grants. These small RPCs are the only writes.
-- SECURITY DEFINER is required to enforce version checks even for an API caller
-- bypassing the UI; every function checks auth.uid() against the single account.
create or replace function public.passage_initialize(p_backup text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  backup jsonb;
  data jsonb;
  hash text := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_backup, 'UTF8')), 'hex');
  current_version bigint;
begin
  if uid is null or not exists (select 1 from public.passage_account a where a.user_id = uid) then
    raise exception 'Account not allowed' using errcode = '42501';
  end if;
  if hash is distinct from '8039b22a5425a868fb8b29340f3a54998548eb28a9fd2b1507d51d13efbc9a2e' then
    raise exception 'Only the approved 2026-10-14 backup can initialize cloud data';
  end if;
  -- Serialize initialization with every save for this account.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  select s.version into current_version from public.passage_snapshots s where s.user_id = uid;
  if found then return jsonb_build_object('ok', true, 'version', current_version); end if;
  backup := p_backup::jsonb;
  data := jsonb_build_object('schema', 1,
    'entries', (select jsonb_object_agg(e->>'id', e) from jsonb_array_elements(backup->'entries') e),
    'lessonProgress', (select jsonb_object_agg(key, value - 'saved' - 'recall' - 'recalled') from jsonb_each(backup->'lessonProgress')));
  insert into public.passage_snapshots(user_id, version, snapshot, seed_hash, seed_backup) values (uid, 1, data, hash, p_backup);
  insert into public.passage_revisions(user_id, version, snapshot) values (uid, 1, data);
  return jsonb_build_object('ok', true, 'version', 1);
end;
$$;

create or replace function public.passage_save(p_expected_version bigint, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  next_version bigint;
begin
  if uid is null or not exists (select 1 from public.passage_account a where a.user_id = uid) then
    raise exception 'Account not allowed' using errcode = '42501';
  end if;
  if p_snapshot is null or (p_snapshot->>'schema') is distinct from '1'
    or jsonb_typeof(p_snapshot->'entries') is distinct from 'object'
    or jsonb_typeof(p_snapshot->'lessonProgress') is distinct from 'object'
    or octet_length(p_snapshot::text) > 5000000 then
    raise exception 'Invalid snapshot';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  update public.passage_snapshots s set snapshot = p_snapshot, version = s.version + 1, updated_at = now()
    where s.user_id = uid and s.version = p_expected_version returning s.version into next_version;
  if not found then return jsonb_build_object('ok', false, 'conflict', true); end if;
  -- Keep every accepted snapshot, including deletions/resets, for recovery.
  insert into public.passage_revisions(user_id, version, snapshot) values (uid, next_version, p_snapshot);
  return jsonb_build_object('ok', true, 'version', next_version);
end;
$$;
revoke all on function public.passage_initialize(text), public.passage_save(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.passage_initialize(text), public.passage_save(bigint, jsonb) to authenticated;
commit;

-- After creating your one Auth user, authorize its UUID (run separately):
-- insert into public.passage_account(user_id) values ('YOUR_AUTH_USER_UUID');
-- Never delete/truncate snapshots or revisions to "reset" a device.

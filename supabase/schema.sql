-- SMM Order Automator — Supabase schema
-- Run this in the Supabase SQL editor for your project.
-- This version supports mass orders and multiple SMM-panel API providers.

create extension if not exists "pgcrypto";

-- App-wide legacy settings. Kept for backwards compatibility with older installs.
create table if not exists app_settings (
  id int primary key default 1,
  api_key text,
  api_url text,
  constraint single_row check (id = 1)
);

-- Backfill generic columns for older installs that still use socpanel_* names.
alter table app_settings add column if not exists api_key text;
alter table app_settings add column if not exists api_url text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'socpanel_api_key'
  ) then
    execute 'update app_settings
             set api_key = coalesce(api_key, socpanel_api_key)
             where api_key is null and socpanel_api_key is not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'socpanel_api_url'
  ) then
    execute 'update app_settings
             set api_url = coalesce(api_url, socpanel_api_url)
             where api_url is null and socpanel_api_url is not null';
  end if;
end
$$;

insert into app_settings (id) values (1) on conflict (id) do nothing;
alter table app_settings alter column api_url drop default;

-- Multiple SMM panel providers. Any provider that follows the common
-- action/services/add API pattern can be added here.
create table if not exists api_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  api_url text not null,
  api_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table api_providers alter column api_url drop default;

-- Optional migration helper: copy legacy single-provider settings into providers.
insert into api_providers (name, api_url, api_key, is_active)
select
  'Legacy provider',
  api_url,
  api_key,
  true
from app_settings
where id = 1
  and api_key is not null
  and api_url is not null
  and btrim(api_url) <> ''
  and not exists (
    select 1
    from api_providers
    where lower(name) = 'legacy provider'
      and api_url = app_settings.api_url
  );

-- Platforms this tool supports.
do $$ begin
  create type platform_t as enum ('x', 'instagram', 'tiktok', 'linkedin', 'youtube');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type tier_t as enum ('priority', 'regular');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_status_t as enum ('pending', 'submitted', 'failed');
exception when duplicate_object then null;
end $$;

-- One row per (platform, service_type, slot_index). Each preset can point to a
-- different provider and service ID.
create table if not exists service_presets (
  id uuid primary key default gen_random_uuid(),
  platform platform_t not null,
  tier tier_t not null,
  service_type text not null,
  slot_index int not null default 1,
  api_provider_id uuid references api_providers(id) on delete set null,
  panel_service_id text,
  quantity int not null default 0,
  comment_categories text[] not null default '{}',
  keywords text[] not null default '{}',
  is_fallback boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, service_type, slot_index)
);

-- MIGRATION for older databases that already have service_presets.
alter table service_presets add column if not exists api_provider_id uuid references api_providers(id) on delete set null;
alter table service_presets add column if not exists panel_service_id text;
alter table service_presets add column if not exists comment_categories text[] not null default '{}';
alter table service_presets add column if not exists slot_index int not null default 1;
alter table service_presets add column if not exists keywords text[] not null default '{}';
alter table service_presets add column if not exists is_fallback boolean not null default false;

-- Drop conflicting legacy uniqueness before normalizing comments slot rows.
alter table service_presets drop constraint if exists service_presets_platform_tier_service_type_key;
alter table service_presets drop constraint if exists service_presets_platform_service_type_slot_index_key;

-- Convert legacy comments_slot_N rows into comments service with slot indexes.
update service_presets
set service_type = 'comments'
where service_type ~ '^comments_slot_[0-9]+$';

-- Re-rank slot indexes so old regular/priority rows become independent slots.
with ranked as (
  select
    id,
    row_number() over (
      partition by platform, service_type
      order by
        case when tier = 'priority' then 0 else 1 end,
        created_at,
        id
    ) as next_slot
  from service_presets
)
update service_presets s
set slot_index = ranked.next_slot
from ranked
where ranked.id = s.id;

update service_presets
set keywords = case
  when array_length(keywords, 1) is null
    then coalesce(comment_categories, '{}')
  else keywords
end;

alter table service_presets
  add constraint service_presets_platform_service_type_slot_index_key
  unique (platform, service_type, slot_index);

-- A pool of comments uploaded via CSV, shuffled and assigned one-per-link.
create table if not exists comment_pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  platform platform_t not null,
  category text,
  created_at timestamptz not null default now()
);

alter table comment_pools add column if not exists category text;


create table if not exists comment_pool_items (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references comment_pools(id) on delete cascade,
  comment text not null,
  used boolean not null default false,
  used_in_order_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_comment_pool_items_unused
  on comment_pool_items (pool_id) where used = false;

-- Every link in a mass submit becomes its own tracked order row.
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  platform platform_t not null,
  tier tier_t not null,
  link text not null,
  source text not null default 'manual',
  status order_status_t not null default 'pending',
  comment_pool_id uuid references comment_pools(id),
  services_ordered jsonb not null default '[]',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_created_at on orders (created_at desc);

-- Older install helper:
-- If comment_pools is missing platform, run:
--   alter table comment_pools add column if not exists platform platform_t;
--   update comment_pools set platform = 'x' where platform is null;
--   alter table comment_pools alter column platform set not null;

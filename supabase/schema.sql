-- SMM Order Automator — Supabase schema
-- Run this in the Supabase SQL editor for your project.
-- This version supports mass orders and multiple SMM-panel API providers.

create extension if not exists "pgcrypto";

-- App-wide legacy settings. Kept for backwards compatibility with older installs.
create table if not exists app_settings (
  id int primary key default 1,
  socpanel_api_key text,
  socpanel_api_url text default 'https://socpanel.com/api/v2',
  constraint single_row check (id = 1)
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

-- Multiple SMM panel providers. Any provider that follows the common
-- action/services/add API pattern can be added here.
create table if not exists api_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  api_url text not null default 'https://socpanel.com/api/v2',
  api_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Optional migration helper: copy the old SocPanel settings into providers.
insert into api_providers (name, api_url, api_key, is_active)
select
  'SocPanel',
  coalesce(socpanel_api_url, 'https://socpanel.com/api/v2'),
  socpanel_api_key,
  true
from app_settings
where id = 1
  and socpanel_api_key is not null
  and not exists (select 1 from api_providers where name = 'SocPanel');

-- Platforms this tool supports.
do $$ begin
  create type platform_t as enum ('x', 'instagram', 'tiktok', 'linkedin');
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

-- One row per (platform, tier, service_type). Each preset can point to a
-- different provider and service ID.
create table if not exists service_presets (
  id uuid primary key default gen_random_uuid(),
  platform platform_t not null,
  tier tier_t not null,
  service_type text not null,
  api_provider_id uuid references api_providers(id) on delete set null,
  panel_service_id text,
  socpanel_service_id text, -- legacy alias kept so older data does not break
  quantity int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, tier, service_type)
);

-- MIGRATION for older databases that already have service_presets.
alter table service_presets add column if not exists api_provider_id uuid references api_providers(id) on delete set null;
alter table service_presets add column if not exists panel_service_id text;
alter table service_presets add column if not exists socpanel_service_id text;
update service_presets
set panel_service_id = coalesce(panel_service_id, socpanel_service_id)
where panel_service_id is null and socpanel_service_id is not null;

-- A pool of comments uploaded via CSV, shuffled and assigned one-per-link.
create table if not exists comment_pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  platform platform_t not null,
  created_at timestamptz not null default now()
);

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

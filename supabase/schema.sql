-- SMM Order Automator — Supabase schema
-- Run this in the Supabase SQL editor for your project.

create extension if not exists "pgcrypto";

-- App-wide settings (single row). API keys are stored here server-side only,
-- never exposed to the browser.
create table if not exists app_settings (
  id int primary key default 1,
  socpanel_api_key text,
  socpanel_api_url text default 'https://socpanel.com/api/v2',
  constraint single_row check (id = 1)
);
insert into app_settings (id) values (1) on conflict (id) do nothing;

-- Platforms this tool supports.
create type platform_t as enum ('x', 'instagram', 'tiktok', 'linkedin');
create type tier_t as enum ('priority', 'regular');
create type order_status_t as enum ('pending', 'submitted', 'failed');

-- One row per (platform, tier, service_type). Quantities are editable in the UI.
-- socpanel_service_id maps to the actual service ID pulled from SocPanel's
-- `services` endpoint — set this once you've matched it in the Services page.
create table if not exists service_presets (
  id uuid primary key default gen_random_uuid(),
  platform platform_t not null,
  tier tier_t not null,
  service_type text not null, -- e.g. 'views', 'likes', 'retweets', 'comments', 'shares'
  socpanel_service_id text,
  quantity int not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, tier, service_type)
);

-- A pool of comments uploaded via CSV, shuffled and assigned one-per-link.
-- Pools are platform-specific (an X pool shouldn't be usable on a LinkedIn order).
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

-- Every order placed, and what happened. All orders are triggered by a
-- pasted link — no platform auto-detects posts.
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  platform platform_t not null,
  tier tier_t not null,
  link text not null,
  source text not null default 'manual',
  status order_status_t not null default 'pending',
  comment_pool_id uuid references comment_pools(id),
  services_ordered jsonb not null default '[]', -- [{service_type, socpanel_service_id, quantity, socpanel_order_id, error}]
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_created_at on orders (created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- MIGRATION: if you already ran an earlier version of this schema that
-- included watched_x_accounts (auto-polling X), drop it — we moved to
-- manual paste for every platform, including X, to stay within X's API
-- terms of service:
--
--   drop table if exists watched_x_accounts;
--   alter table app_settings drop column if exists x_bearer_token;
--   alter table app_settings drop column if exists cron_secret;
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────
-- MIGRATION: if you already ran this schema before comment_pools had a
-- `platform` column, run this block once instead of the create table above:
--
--   alter table comment_pools add column if not exists platform platform_t;
--   update comment_pools set platform = 'x' where platform is null; -- adjust per pool
--   alter table comment_pools alter column platform set not null;
-- ─────────────────────────────────────────────────────────────────────────

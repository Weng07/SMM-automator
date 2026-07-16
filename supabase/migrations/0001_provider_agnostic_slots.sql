-- 0001_provider_agnostic_slots.sql
-- Purpose:
-- 1) Make app/provider settings provider-agnostic
-- 2) Migrate service presets to slot-based routing
-- 3) Avoid duplicate-key failures during reruns

create extension if not exists "pgcrypto";

-- 1) App settings: generic fallback columns
create table if not exists app_settings (
  id int primary key default 1,
  api_key text,
  api_url text,
  constraint single_row check (id = 1)
);

alter table app_settings add column if not exists api_key text;
alter table app_settings add column if not exists api_url text;

-- Backfill from legacy column names if they still exist.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_settings' and column_name = 'socpanel_api_key'
  ) then
    execute 'update app_settings
             set api_key = coalesce(api_key, socpanel_api_key)
             where api_key is null and socpanel_api_key is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_settings' and column_name = 'socpanel_api_url'
  ) then
    execute 'update app_settings
             set api_url = coalesce(api_url, socpanel_api_url)
             where api_url is null and socpanel_api_url is not null';
  end if;
end
$$;

insert into app_settings (id) values (1) on conflict (id) do nothing;
alter table app_settings alter column api_url drop default;

-- 2) Provider table
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

-- 3) Slot-based service presets
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
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, service_type, slot_index)
);

alter table service_presets add column if not exists api_provider_id uuid references api_providers(id) on delete set null;
alter table service_presets add column if not exists panel_service_id text;
alter table service_presets add column if not exists comment_categories text[] not null default '{}';
alter table service_presets add column if not exists slot_index int not null default 1;
alter table service_presets add column if not exists keywords text[] not null default '{}';

-- Critical: remove old/new unique constraints before normalization updates.
alter table service_presets drop constraint if exists service_presets_platform_tier_service_type_key;
alter table service_presets drop constraint if exists service_presets_platform_service_type_slot_index_key;

update service_presets
set service_type = 'comments'
where service_type ~ '^comments_slot_[0-9]+$';

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

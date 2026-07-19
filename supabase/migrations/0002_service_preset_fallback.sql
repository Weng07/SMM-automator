-- 0002_service_preset_fallback.sql
-- Adds retry fallback flag for service preset slots.

alter table if exists service_presets
  add column if not exists is_fallback boolean not null default false;

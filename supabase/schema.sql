-- 계약관리 (Contract Manager) schema
-- Run this in the Supabase SQL Editor for this project's dedicated Supabase project.

create extension if not exists "pgcrypto";

-- Single-row table holding the shared site password (changeable in-app).
create table if not exists cm_settings (
  id int primary key default 1,
  password text not null default '0000',
  updated_at timestamptz not null default now(),
  constraint cm_settings_singleton check (id = 1)
);
insert into cm_settings (id, password)
  values (1, '0000')
  on conflict (id) do nothing;

-- User-defined extra columns (beyond the fixed fields).
create table if not exists cm_custom_fields (
  id uuid primary key default gen_random_uuid(),
  field_key text unique not null,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Contract list.
create table if not exists cm_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_date date,
  customer_name text,
  product_name text,
  monthly_premium numeric,
  converted_premium numeric,
  payment_period text,
  insurance_company text,
  design_number text,
  memo text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cm_contracts_date_idx on cm_contracts (contract_date);
create index if not exists cm_contracts_company_idx on cm_contracts (insurance_company);

-- RLS: app-level password gate protects access (no Supabase Auth), so the
-- anon/publishable key needs full read/write.
alter table cm_settings enable row level security;
alter table cm_custom_fields enable row level security;
alter table cm_contracts enable row level security;

drop policy if exists cm_settings_all on cm_settings;
create policy cm_settings_all on cm_settings for all using (true) with check (true);

drop policy if exists cm_custom_fields_all on cm_custom_fields;
create policy cm_custom_fields_all on cm_custom_fields for all using (true) with check (true);

drop policy if exists cm_contracts_all on cm_contracts;
create policy cm_contracts_all on cm_contracts for all using (true) with check (true);

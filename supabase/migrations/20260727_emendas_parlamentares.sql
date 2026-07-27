-- Furo Público — módulo estruturado de emendas parlamentares
-- Execute no SQL Editor do Supabase antes do primeiro workflow de importação.

create table if not exists public.parliamentary_amendments (
  id uuid primary key default gen_random_uuid(),
  external_code text not null unique,
  year integer not null check (year between 2000 and 2100),
  author_name text not null,
  amendment_type text,
  amendment_number text,
  committed numeric(18,2) not null default 0,
  liquidated numeric(18,2) not null default 0,
  paid numeric(18,2) not null default 0,
  rest_registered numeric(18,2) not null default 0,
  rest_cancelled numeric(18,2) not null default 0,
  rest_paid numeric(18,2) not null default 0,
  localities text[] not null default '{}',
  functions text[] not null default '{}',
  subfunctions text[] not null default '{}',
  allocations jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  documents_status text not null default 'pending'
    check (documents_status in ('pending','partial','complete','error')),
  document_count integer not null default 0,
  beneficiary_count integer not null default 0,
  processed_at timestamptz,
  last_error text,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parliamentary_amendments_author_year_idx
  on public.parliamentary_amendments (author_name, year desc);
create index if not exists parliamentary_amendments_status_idx
  on public.parliamentary_amendments (documents_status, paid desc, committed desc);
create index if not exists parliamentary_amendments_values_idx
  on public.parliamentary_amendments (paid desc, liquidated desc, committed desc);

create table if not exists public.amendment_case_links (
  alert_id uuid not null references public.alerts(id) on delete cascade,
  amendment_id uuid not null references public.parliamentary_amendments(id) on delete cascade,
  match_type text not null default 'exact_name_year'
    check (match_type in ('exact_name_year','manual')),
  author_name text not null,
  created_at timestamptz not null default now(),
  primary key (alert_id, amendment_id)
);

create index if not exists amendment_case_links_amendment_idx
  on public.amendment_case_links (amendment_id);

create table if not exists public.amendment_documents (
  id uuid primary key default gen_random_uuid(),
  document_code text not null unique,
  summarized_code text,
  document_date date,
  year integer,
  phase text,
  species text,
  amount numeric(18,2),
  formal_beneficiary_name text,
  formal_beneficiary_tax_id text,
  formal_beneficiary_uf char(2),
  formal_beneficiary_municipality text,
  formal_beneficiary_is_intermediary boolean not null default false,
  managing_unit_code text,
  managing_unit text,
  agency_code text,
  agency text,
  superior_agency_code text,
  superior_agency text,
  observation text,
  raw_reference jsonb not null default '{}'::jsonb,
  raw_detail jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists amendment_documents_date_phase_idx
  on public.amendment_documents (document_date desc, phase);
create index if not exists amendment_documents_beneficiary_idx
  on public.amendment_documents (formal_beneficiary_tax_id, formal_beneficiary_name);

create table if not exists public.amendment_document_links (
  amendment_id uuid not null references public.parliamentary_amendments(id) on delete cascade,
  document_id uuid not null references public.amendment_documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (amendment_id, document_id)
);

create index if not exists amendment_document_links_document_idx
  on public.amendment_document_links (document_id);

create table if not exists public.amendment_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique,
  name text not null,
  tax_id text,
  beneficiary_type text,
  uf char(2),
  municipality text,
  raw jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists amendment_beneficiaries_tax_idx
  on public.amendment_beneficiaries (tax_id);
create index if not exists amendment_beneficiaries_name_idx
  on public.amendment_beneficiaries (name);

create table if not exists public.amendment_beneficiary_flows (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  amendment_id uuid not null references public.parliamentary_amendments(id) on delete cascade,
  document_id uuid not null references public.amendment_documents(id) on delete cascade,
  beneficiary_id uuid not null references public.amendment_beneficiaries(id) on delete cascade,
  role text not null check (
    role in ('favorecido_documento','intermediario_financeiro','beneficiario_final')
  ),
  amount numeric(18,2),
  document_phase text,
  document_date date,
  source_kind text not null check (source_kind in ('document_detail','final_beneficiary')),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists amendment_beneficiary_flows_amendment_idx
  on public.amendment_beneficiary_flows (amendment_id, document_date desc);
create index if not exists amendment_beneficiary_flows_beneficiary_idx
  on public.amendment_beneficiary_flows (beneficiary_id, document_date desc);
create index if not exists amendment_beneficiary_flows_document_idx
  on public.amendment_beneficiary_flows (document_id);

-- Reaproveita a função set_updated_at criada no schema inicial.
drop trigger if exists parliamentary_amendments_set_updated_at on public.parliamentary_amendments;
create trigger parliamentary_amendments_set_updated_at
before update on public.parliamentary_amendments
for each row execute function public.set_updated_at();

drop trigger if exists amendment_documents_set_updated_at on public.amendment_documents;
create trigger amendment_documents_set_updated_at
before update on public.amendment_documents
for each row execute function public.set_updated_at();

drop trigger if exists amendment_beneficiaries_set_updated_at on public.amendment_beneficiaries;
create trigger amendment_beneficiaries_set_updated_at
before update on public.amendment_beneficiaries
for each row execute function public.set_updated_at();

drop trigger if exists amendment_beneficiary_flows_set_updated_at on public.amendment_beneficiary_flows;
create trigger amendment_beneficiary_flows_set_updated_at
before update on public.amendment_beneficiary_flows
for each row execute function public.set_updated_at();

alter table public.parliamentary_amendments enable row level security;
alter table public.amendment_case_links enable row level security;
alter table public.amendment_documents enable row level security;
alter table public.amendment_document_links enable row level security;
alter table public.amendment_beneficiaries enable row level security;
alter table public.amendment_beneficiary_flows enable row level security;

-- Não há política pública. O painel administrativo acessa as tabelas somente
-- no servidor com SUPABASE_SERVICE_ROLE_KEY.

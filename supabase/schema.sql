-- Furo Público — estrutura inicial
-- Execute no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.investigations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  summary text not null,
  finding text not null,
  category text not null check (category in ('despesas','emendas','votos','contratos','campanha','outros')),
  status text not null default 'triagem' check (status in ('triagem','em_apuracao','aguardando_resposta','publicado','atualizado','arquivado')),
  confidence text not null default 'pista' check (confidence in ('pista','cruzamento','documental')),
  state char(2),
  municipality text,
  involved_amount numeric(16,2),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  is_featured boolean not null default false,
  is_demo boolean not null default false,
  tags text[] not null default '{}',
  entities jsonb not null default '[]'::jsonb,
  facts jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  responses jsonb not null default '[]'::jsonb,
  methodology text not null default '',
  caveat text not null default '',
  created_by text,
  constraint published_requires_date check (status not in ('publicado','atualizado') or published_at is not null),
  constraint public_case_requires_source check (status not in ('publicado','atualizado','aguardando_resposta') or jsonb_array_length(sources) > 0)
);

create index if not exists investigations_status_date_idx on public.investigations (status, published_at desc);
create index if not exists investigations_category_idx on public.investigations (category);
create index if not exists investigations_tags_idx on public.investigations using gin (tags);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  title text not null,
  rule text not null,
  severity text not null check (severity in ('baixa','media','alta')),
  status text not null default 'novo' check (status in ('novo','em_revisao','descartado','convertido')),
  detected_at timestamptz not null,
  deputy_name text,
  supplier_name text,
  amount numeric(16,2),
  evidence jsonb not null default '{}'::jsonb,
  reviewer_notes text,
  investigation_id uuid references public.investigations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alerts_status_detected_idx on public.alerts (status, detected_at desc);
create index if not exists alerts_evidence_idx on public.alerts using gin (evidence);

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  title text not null,
  description text not null,
  source_urls text[] not null default '{}',
  status text not null default 'nova' check (status in ('nova','em_triagem','em_apuracao','descartada','convertida')),
  metadata jsonb not null default '{}'::jsonb,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tips_status_created_idx on public.tips (status, created_at desc);

create table if not exists public.editorial_audit_log (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists investigations_set_updated_at on public.investigations;
create trigger investigations_set_updated_at before update on public.investigations for each row execute function public.set_updated_at();
drop trigger if exists alerts_set_updated_at on public.alerts;
create trigger alerts_set_updated_at before update on public.alerts for each row execute function public.set_updated_at();
drop trigger if exists tips_set_updated_at on public.tips;
create trigger tips_set_updated_at before update on public.tips for each row execute function public.set_updated_at();

alter table public.investigations enable row level security;
alter table public.alerts enable row level security;
alter table public.tips enable row level security;
alter table public.editorial_audit_log enable row level security;

-- O público só pode ler casos efetivamente publicáveis.
drop policy if exists "Public can read published investigations" on public.investigations;
create policy "Public can read published investigations"
on public.investigations for select
to anon, authenticated
using (status in ('publicado','atualizado','aguardando_resposta'));

-- Alertas, pistas e auditoria não têm política pública. O aplicativo acessa essas
-- tabelas somente no servidor, com a service role. Nunca exponha a service role no navegador.

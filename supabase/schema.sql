-- ============================================================
-- PRUMO — Plataforma do Pequeno Empreendedor
-- Projeto Supabase: khpmenwzknkkpclpgsps
-- Cole TUDO no SQL Editor e execute uma única vez (idempotente).
-- Todas as tabelas usam o prefixo pe_ para não colidir com outros projetos.
-- Multi-tenant: cada empresa (pe_companies) só enxerga os próprios dados (RLS).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Utilitários ----------
create or replace function pe_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Empresas e membros ----------
create table if not exists pe_companies (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name           text not null,
  owner_name     text,
  business_type  text,
  sells          text,
  channels       text[] default '{}',
  revenue_range  text,
  employees      int  default 0,
  target_margin  numeric(5,2) default 30,
  opening_balance numeric(14,2) default 0,
  onboarded      boolean default false,
  settings       jsonb default '{}'::jsonb,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table if not exists pe_members (
  company_id uuid not null references pe_companies(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'vendedor'
             check (role in ('administrador','gerente','vendedor','financeiro','operacional')),
  created_at timestamptz default now(),
  primary key (company_id, user_id)
);

-- Funções de autorização (security definer evita recursão de RLS)
create or replace function pe_is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pe_members m where m.company_id = cid and m.user_id = auth.uid());
$$;

create or replace function pe_has_role(cid uuid, roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pe_members m
                 where m.company_id = cid and m.user_id = auth.uid() and m.role = any(roles));
$$;

-- Ao criar empresa: dono vira administrador e ganha assinatura de teste
create or replace function pe_on_company_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into pe_members (company_id, user_id, role) values (new.id, new.owner_id, 'administrador')
  on conflict do nothing;
  insert into pe_subscriptions (company_id, plan_code, status, trial_ends_at)
  values (new.id, 'essencial', 'trial', now() + interval '14 days');
  return new;
end $$;

-- ---------- Planos e assinaturas (preços editáveis, sem valor fixo no código) ----------
create table if not exists pe_plans (
  code        text primary key,
  name        text not null,
  description text,
  price_cents int  default 0,
  limits      jsonb default '{}'::jsonb,
  active      boolean default true
);

insert into pe_plans (code, name, description, limits) values
  ('essencial',    'Essencial',    'Para MEIs e negócios muito pequenos.',          '{"users":1}'),
  ('profissional', 'Profissional', 'Para pequenos negócios em crescimento.',        '{"users":5}'),
  ('empresa',      'Empresa',      'Para empresas com equipe e operação maior.',    '{"users":50}')
on conflict (code) do nothing;

create table if not exists pe_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null unique references pe_companies(id) on delete cascade,
  plan_code     text not null references pe_plans(code) default 'essencial',
  status        text not null default 'trial' check (status in ('trial','active','past_due','canceled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

drop trigger if exists trg_pe_company_created on pe_companies;
create trigger trg_pe_company_created after insert on pe_companies
for each row execute function pe_on_company_created();

-- ---------- Clientes e oportunidades ----------
create table if not exists pe_customers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  name        text not null,
  phone       text,
  whatsapp    text,
  email       text,
  city        text,
  origin      text,
  birthday    date,
  notes       text,
  next_action text,
  next_action_date date,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists pe_opportunities (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  customer_id uuid references pe_customers(id) on delete set null,
  title       text not null,
  value       numeric(14,2) default 0,
  stage       text not null default 'novo'
              check (stage in ('novo','contato','negociacao','proposta','venda','posvenda','perdido')),
  next_action text,
  next_action_date date,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ---------- Produtos, fornecedores e estoque ----------
create table if not exists pe_suppliers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  name        text not null,
  cnpj        text,
  contact     text,
  phone       text,
  lead_time_days int,
  payment_terms text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists pe_products (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  supplier_id uuid references pe_suppliers(id) on delete set null,
  name        text not null,
  sku         text,
  barcode     text,
  category    text,
  description text,
  image_url   text,
  cost        numeric(14,2) not null default 0,
  price       numeric(14,2) not null default 0,
  fee_pct     numeric(5,2)  not null default 0,   -- taxas/comissões/cartão sobre a venda (%)
  stock       numeric(14,3) not null default 0,
  min_stock   numeric(14,3) not null default 0,
  is_service  boolean default false,
  active      boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists pe_stock_movements (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  product_id  uuid not null references pe_products(id) on delete cascade,
  kind        text not null check (kind in ('entrada','saida','ajuste')),
  quantity    numeric(14,3) not null,
  reason      text,
  ref_sale_id uuid,
  created_at  timestamptz default now()
);

-- ---------- Vendas ----------
create table if not exists pe_sales (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  customer_id uuid references pe_customers(id) on delete set null,
  sold_at     date not null default current_date,
  payment_method text,
  status      text not null default 'paga' check (status in ('paga','a_receber','cancelada')),
  discount    numeric(14,2) default 0,
  total       numeric(14,2) not null default 0,
  cost_total  numeric(14,2) not null default 0,
  items       jsonb not null default '[]'::jsonb,  -- [{product_id,name,qty,unit_price,unit_cost}]
  notes       text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz default now()
);

create table if not exists pe_sale_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  sale_id     uuid not null references pe_sales(id) on delete cascade,
  product_id  uuid references pe_products(id) on delete set null,
  name        text not null,
  quantity    numeric(14,3) not null default 1,
  unit_price  numeric(14,2) not null default 0,
  unit_cost   numeric(14,2) not null default 0
);

-- ---------- Financeiro (contas a pagar/receber + caixa) ----------
create table if not exists pe_transactions (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  kind        text not null check (kind in ('receita','despesa')),
  description text not null,
  category    text,
  cost_center text,
  amount      numeric(14,2) not null,
  due_date    date not null default current_date,
  paid_date   date,                       -- null = pendente (conta a pagar/receber)
  customer_id uuid references pe_customers(id) on delete set null,
  supplier_id uuid references pe_suppliers(id) on delete set null,
  sale_id     uuid references pe_sales(id) on delete set null,
  recurrence  text default 'nenhuma' check (recurrence in ('nenhuma','semanal','mensal','anual')),
  bank_ref    text,                       -- reservado para conciliação bancária futura
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ---------- Tarefas ----------
create table if not exists pe_tasks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  title       text not null,
  category    text default 'administrativo'
              check (category in ('vendas','financeiro','marketing','estoque','administrativo')),
  priority    text default 'media' check (priority in ('alta','media','baixa')),
  status      text default 'aberta' check (status in ('aberta','andamento','concluida')),
  due_date    date,
  assignee_id uuid references auth.users(id),
  customer_id uuid references pe_customers(id) on delete set null,
  recurrence  text default 'nenhuma',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ---------- Preparado para fases seguintes ----------
create table if not exists pe_campaigns (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  name        text not null,
  objective   text,
  audience    text,
  product_id  uuid references pe_products(id) on delete set null,
  price       numeric(14,2),
  message     text,
  status      text default 'rascunho',
  channel     text,
  caption     text,
  starts_at   date,
  ends_at     date,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists pe_automations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  name        text not null,
  trigger     jsonb not null default '{}'::jsonb,
  actions     jsonb not null default '[]'::jsonb,
  active      boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists pe_employees (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  user_id     uuid references auth.users(id),
  name        text not null,
  role        text,
  monthly_goal numeric(14,2),
  active      boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Bancos criados antes do módulo de Marketing: adiciona as colunas novas
alter table pe_campaigns add column if not exists channel text;
alter table pe_campaigns add column if not exists caption text;

-- ---------- Alertas dispensados, consultas ao Consultor, métricas, auditoria ----------
create table if not exists pe_notifications (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  alert_key   text not null,
  dismissed_until date,
  created_at  timestamptz default now(),
  unique (company_id, alert_key)
);

create table if not exists pe_consultations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  question    text not null,
  answer      jsonb,
  created_by  uuid default auth.uid(),
  created_at  timestamptz default now()
);

create table if not exists pe_business_metrics (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  metric_date date not null,
  sales       numeric(14,2) default 0,
  revenue     numeric(14,2) default 0,
  expenses    numeric(14,2) default 0,
  profit      numeric(14,2) default 0,
  cash        numeric(14,2) default 0,
  unique (company_id, metric_date)
);

create table if not exists pe_audit_logs (
  id          bigserial primary key,
  company_id  uuid,
  user_id     uuid default auth.uid(),
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  created_at  timestamptz default now()
);

create or replace function pe_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec record;
begin
  rec := case when tg_op = 'DELETE' then old else new end;
  insert into pe_audit_logs (company_id, user_id, action, entity, entity_id)
  values (rec.company_id, auth.uid(), tg_op, tg_table_name, rec.id);
  return rec;
end $$;

-- ---------- Índices ----------
create index if not exists idx_pe_customers_company     on pe_customers (company_id);
create index if not exists idx_pe_opps_company_stage    on pe_opportunities (company_id, stage);
create index if not exists idx_pe_products_company      on pe_products (company_id);
create index if not exists idx_pe_stock_company_prod    on pe_stock_movements (company_id, product_id);
create index if not exists idx_pe_sales_company_date    on pe_sales (company_id, sold_at desc);
create index if not exists idx_pe_sale_items_sale       on pe_sale_items (sale_id);
create index if not exists idx_pe_tx_company_due        on pe_transactions (company_id, due_date);
create index if not exists idx_pe_tx_company_paid       on pe_transactions (company_id, paid_date);
create index if not exists idx_pe_tasks_company_status  on pe_tasks (company_id, status);
create index if not exists idx_pe_audit_company         on pe_audit_logs (company_id, created_at desc);
create index if not exists idx_pe_members_user          on pe_members (user_id);

-- ---------- RLS: isolamento total por empresa ----------
alter table pe_companies       enable row level security;
alter table pe_members         enable row level security;
alter table pe_plans           enable row level security;
alter table pe_subscriptions   enable row level security;
alter table pe_audit_logs      enable row level security;

drop policy if exists pe_companies_select on pe_companies;
create policy pe_companies_select on pe_companies for select
  using (owner_id = auth.uid() or pe_is_member(id));
drop policy if exists pe_companies_insert on pe_companies;
create policy pe_companies_insert on pe_companies for insert
  with check (owner_id = auth.uid());
drop policy if exists pe_companies_update on pe_companies;
create policy pe_companies_update on pe_companies for update
  using (pe_has_role(id, array['administrador'])) with check (pe_has_role(id, array['administrador']));
drop policy if exists pe_companies_delete on pe_companies;
create policy pe_companies_delete on pe_companies for delete
  using (owner_id = auth.uid());

drop policy if exists pe_members_select on pe_members;
create policy pe_members_select on pe_members for select
  using (user_id = auth.uid() or pe_is_member(company_id));
drop policy if exists pe_members_admin on pe_members;
create policy pe_members_admin on pe_members for all
  using (pe_has_role(company_id, array['administrador']))
  with check (pe_has_role(company_id, array['administrador']));

drop policy if exists pe_plans_read on pe_plans;
create policy pe_plans_read on pe_plans for select using (true);

drop policy if exists pe_subs_select on pe_subscriptions;
create policy pe_subs_select on pe_subscriptions for select using (pe_is_member(company_id));

drop policy if exists pe_audit_select on pe_audit_logs;
create policy pe_audit_select on pe_audit_logs for select
  using (pe_has_role(company_id, array['administrador','gerente']));

-- Tabelas de dados: membros da empresa leem; escrita conforme papel
do $$
declare t text;
begin
  foreach t in array array[
    'pe_customers','pe_opportunities','pe_suppliers','pe_products','pe_stock_movements',
    'pe_sales','pe_sale_items','pe_transactions','pe_tasks','pe_campaigns','pe_automations',
    'pe_employees','pe_notifications','pe_consultations','pe_business_metrics'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('create policy %I on %I for select using (pe_is_member(company_id))', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format($p$create policy %I on %I for all
      using (pe_is_member(company_id))
      with check (pe_is_member(company_id))$p$, t || '_write', t);
  end loop;

  -- Financeiro só para administrador, gerente e financeiro
  drop policy if exists pe_transactions_write on pe_transactions;
  drop policy if exists pe_transactions_select on pe_transactions;
  create policy pe_transactions_select on pe_transactions for select
    using (pe_has_role(company_id, array['administrador','gerente','financeiro']));
  create policy pe_transactions_write on pe_transactions for all
    using (pe_has_role(company_id, array['administrador','gerente','financeiro']))
    with check (pe_has_role(company_id, array['administrador','gerente','financeiro']));

  -- Triggers de updated_at e auditoria
  foreach t in array array[
    'pe_companies','pe_customers','pe_opportunities','pe_suppliers','pe_products','pe_transactions',
    'pe_tasks','pe_campaigns','pe_automations','pe_employees','pe_subscriptions'
  ] loop
    execute format('drop trigger if exists trg_%s_touch on %I', t, t);
    execute format('create trigger trg_%s_touch before update on %I for each row execute function pe_touch_updated_at()', t, t);
  end loop;

  foreach t in array array['pe_customers','pe_products','pe_sales','pe_transactions','pe_tasks'] loop
    execute format('drop trigger if exists trg_%s_audit on %I', t, t);
    execute format('create trigger trg_%s_audit after insert or update or delete on %I for each row execute function pe_audit()', t, t);
  end loop;
end $$;

-- Recarrega o cache da API (PostgREST)
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- EQUIPE E PERMISSÕES (idempotente; pode ser executado de novo)
-- Papéis: administrador, gerente, vendedor, financeiro, operacional
-- ============================================================
alter table pe_members add column if not exists id uuid default gen_random_uuid();
create unique index if not exists idx_pe_members_id on pe_members (id);
alter table pe_members add column if not exists email text;
alter table pe_members add column if not exists name text;
alter table pe_members add column if not exists monthly_goal numeric(14,2);

update pe_members m
   set email = u.email,
       name  = coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))
  from auth.users u
 where u.id = m.user_id and m.email is null;

-- Dono da empresa entra como administrador já com e-mail e nome
create or replace function pe_on_company_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into pe_members (company_id, user_id, role, email, name)
  select new.id, new.owner_id, 'administrador', u.email,
         coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))
    from auth.users u where u.id = new.owner_id
  on conflict do nothing;
  insert into pe_subscriptions (company_id, plan_code, status, trial_ends_at)
  values (new.id, 'essencial', 'trial', now() + interval '14 days');
  return new;
end $$;

-- Convites: o administrador convida por e-mail; a pessoa entra com esse e-mail e vira membro
create table if not exists pe_invites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references pe_companies(id) on delete cascade,
  email       text not null,
  role        text not null default 'vendedor'
              check (role in ('administrador','gerente','vendedor','financeiro','operacional')),
  status      text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by  uuid default auth.uid(),
  created_at  timestamptz default now(),
  accepted_at timestamptz
);
create index if not exists idx_pe_invites_company on pe_invites (company_id);
create index if not exists idx_pe_invites_email   on pe_invites (lower(email));
alter table pe_invites enable row level security;
drop policy if exists pe_invites_select on pe_invites;
create policy pe_invites_select on pe_invites for select
  using (pe_has_role(company_id, array['administrador','gerente']));
drop policy if exists pe_invites_write on pe_invites;
create policy pe_invites_write on pe_invites for all
  using (pe_has_role(company_id, array['administrador']))
  with check (pe_has_role(company_id, array['administrador']));

-- Aceita convites pendentes do usuário logado (chamada pelo app ao entrar)
create or replace function pe_accept_invites() returns int
language plpgsql security definer set search_path = public as $$
declare v_email text; v_name text; n int := 0; r record;
begin
  select lower(email), coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1))
    into v_email, v_name from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;
  for r in select * from pe_invites where lower(email) = v_email and status = 'pending' loop
    insert into pe_members (company_id, user_id, role, email, name)
    values (r.company_id, auth.uid(), r.role, v_email, v_name)
    on conflict (company_id, user_id) do update set role = excluded.role;
    update pe_invites set status = 'accepted', accepted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function pe_accept_invites() from public, anon;
grant execute on function pe_accept_invites() to authenticated;

-- Produtos: perfis sem edição só podem mexer no estoque (a venda baixa estoque)
create or replace function pe_guard_products() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pe_has_role(new.company_id, array['administrador','gerente','operacional']) then return new; end if;
  if new.name is distinct from old.name or new.sku is distinct from old.sku
     or new.category is distinct from old.category or new.cost is distinct from old.cost
     or new.price is distinct from old.price or new.fee_pct is distinct from old.fee_pct
     or new.min_stock is distinct from old.min_stock or new.active is distinct from old.active
     or new.is_service is distinct from old.is_service then
    raise exception 'Seu perfil não pode alterar os dados do produto (apenas o estoque).';
  end if;
  return new;
end $$;
drop trigger if exists trg_pe_products_guard on pe_products;
create trigger trg_pe_products_guard before update on pe_products
for each row execute function pe_guard_products();

-- Permissões por papel em cada tabela (leitura e escrita)
do $$
declare r record;
begin
  for r in select * from (values
    ('pe_customers',       array['administrador','gerente','vendedor','financeiro'],                  array['administrador','gerente','vendedor']),
    ('pe_opportunities',   array['administrador','gerente','vendedor'],                               array['administrador','gerente','vendedor']),
    ('pe_campaigns',       array['administrador','gerente','vendedor'],                               array['administrador','gerente']),
    ('pe_sales',           array['administrador','gerente','vendedor','financeiro'],                  array['administrador','gerente','vendedor']),
    ('pe_sale_items',      array['administrador','gerente','vendedor','financeiro'],                  array['administrador','gerente','vendedor']),
    ('pe_products',        array['administrador','gerente','vendedor','financeiro','operacional'],    array['administrador','gerente','vendedor','operacional']),
    ('pe_stock_movements', array['administrador','gerente','vendedor','financeiro','operacional'],    array['administrador','gerente','vendedor','operacional']),
    ('pe_suppliers',       array['administrador','gerente','financeiro','operacional'],               array['administrador','gerente','operacional']),
    ('pe_employees',       array['administrador','gerente'],                                          array['administrador','gerente']),
    ('pe_automations',     array['administrador','gerente'],                                          array['administrador','gerente'])
  ) as t(tbl, rd, wr) loop
    execute format('drop policy if exists %I on %I', r.tbl || '_select', r.tbl);
    execute format('drop policy if exists %I on %I', r.tbl || '_write',  r.tbl);
    execute format('create policy %I on %I for select using (pe_has_role(company_id, %L::text[]))', r.tbl || '_select', r.tbl, r.rd);
    execute format('create policy %I on %I for all using (pe_has_role(company_id, %L::text[])) with check (pe_has_role(company_id, %L::text[]))', r.tbl || '_write', r.tbl, r.wr, r.wr);
  end loop;
end $$;

-- Financeiro: administrador, gerente e financeiro; vendedor só vê/cria a receita ligada às vendas
drop policy if exists pe_transactions_select on pe_transactions;
drop policy if exists pe_transactions_write on pe_transactions;
drop policy if exists pe_transactions_vendedor_ins on pe_transactions;
create policy pe_transactions_select on pe_transactions for select
  using (pe_has_role(company_id, array['administrador','gerente','financeiro'])
         or (kind = 'receita' and sale_id is not null and pe_has_role(company_id, array['vendedor'])));
create policy pe_transactions_write on pe_transactions for all
  using (pe_has_role(company_id, array['administrador','gerente','financeiro']))
  with check (pe_has_role(company_id, array['administrador','gerente','financeiro']));
create policy pe_transactions_vendedor_ins on pe_transactions for insert
  with check (kind = 'receita' and sale_id is not null and pe_has_role(company_id, array['vendedor']));

NOTIFY pgrst, 'reload schema';


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

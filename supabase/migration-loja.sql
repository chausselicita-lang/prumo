
-- ============================================================
-- LOJA ONLINE: catálogo público, página da campanha, pedidos e rastreio
-- (idempotente; pode ser executado de novo)
-- Segurança: o público só usa 3 funções (pe_store_get, pe_place_order, pe_track).
-- Nenhuma tabela é aberta ao público e custo/margem nunca saem do banco.
-- ============================================================
alter table pe_companies add column if not exists slug text;
alter table pe_companies add column if not exists store_enabled boolean default false;
alter table pe_companies add column if not exists store_settings jsonb default '{}'::jsonb;
alter table pe_companies drop constraint if exists pe_companies_slug_fmt;
alter table pe_companies add constraint pe_companies_slug_fmt
  check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
create unique index if not exists idx_pe_companies_slug on pe_companies (lower(slug)) where slug is not null;

alter table pe_products add column if not exists published boolean default false;

alter table pe_campaigns add column if not exists slug text;
alter table pe_campaigns add column if not exists landing jsonb default '{}'::jsonb;
create unique index if not exists idx_pe_campaigns_slug on pe_campaigns (company_id, lower(slug)) where slug is not null;

-- Pedidos feitos na loja online
create table if not exists pe_orders (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references pe_companies(id) on delete cascade,
  code          text not null,
  campaign_id   uuid references pe_campaigns(id) on delete set null,
  customer_id   uuid references pe_customers(id) on delete set null,
  customer_name text not null,
  phone         text not null,
  notes         text,
  items         jsonb not null default '[]'::jsonb,
  total         numeric(14,2) not null default 0,
  status        text not null default 'novo' check (status in ('novo','atendimento','confirmado','cancelado')),
  sale_id       uuid references pe_sales(id) on delete set null,
  consent_at    timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_pe_orders_company on pe_orders (company_id, created_at desc);
create index if not exists idx_pe_orders_phone   on pe_orders (company_id, phone, created_at desc);

-- Visitas (sem dados pessoais): landing, catálogo, carrinho e pedido
create table if not exists pe_store_events (
  id          bigserial primary key,
  company_id  uuid not null references pe_companies(id) on delete cascade,
  campaign_id uuid references pe_campaigns(id) on delete set null,
  kind        text not null check (kind in ('landing','catalog','cart','order')),
  created_at  timestamptz default now()
);
create index if not exists idx_pe_events_company on pe_store_events (company_id, created_at desc);

alter table pe_orders       enable row level security;
alter table pe_store_events enable row level security;
drop policy if exists pe_orders_select on pe_orders;
create policy pe_orders_select on pe_orders for select
  using (pe_has_role(company_id, array['administrador','gerente','vendedor']));
drop policy if exists pe_orders_write on pe_orders;
create policy pe_orders_write on pe_orders for all
  using (pe_has_role(company_id, array['administrador','gerente','vendedor']))
  with check (pe_has_role(company_id, array['administrador','gerente','vendedor']));
drop policy if exists pe_events_select on pe_store_events;
create policy pe_events_select on pe_store_events for select
  using (pe_has_role(company_id, array['administrador','gerente']));

drop trigger if exists trg_pe_orders_touch on pe_orders;
create trigger trg_pe_orders_touch before update on pe_orders
for each row execute function pe_touch_updated_at();

-- Vitrine pública: só produtos publicados, sem custo e sem estoque exato
create or replace function pe_store_get(p_slug text, p_camp text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c record; prods jsonb; camp jsonb := null;
begin
  select * into c from pe_companies where lower(slug) = lower(p_slug) and store_enabled;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'price', p.price, 'category', p.category,
           'description', p.description, 'image', p.image_url,
           'available', (p.is_service or p.stock > 0)) order by p.name), '[]'::jsonb)
    into prods from pe_products p where p.company_id = c.id and p.published and p.active;
  if p_camp is not null and p_camp <> '' then
    select jsonb_build_object('name', k.name, 'product_id', k.product_id, 'price', k.price,
                              'ends_at', k.ends_at, 'landing', k.landing)
      into camp from pe_campaigns k
     where k.company_id = c.id and lower(k.slug) = lower(p_camp) and k.status = 'ativa'
       and (k.ends_at is null or k.ends_at >= current_date);
  end if;
  return jsonb_build_object(
    'company', jsonb_build_object(
       'name', c.name, 'whatsapp', c.store_settings->>'whatsapp', 'headline', c.store_settings->>'headline',
       'about', c.store_settings->>'about', 'accent', c.store_settings->>'accent',
       'show_prices', coalesce((c.store_settings->>'show_prices')::boolean, true),
       'logo', c.store_settings->>'logo_url', 'instagram', c.store_settings->>'instagram'),
    'products', prods, 'campaign', camp);
end $$;

-- Pedido: o servidor recalcula os preços (nunca confia no navegador), confere estoque e limita abuso
create or replace function pe_place_order(p_slug text, p_camp text, p_name text, p_phone text,
                                          p_notes text, p_items jsonb, p_consent boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c record; pr record; it jsonb; v_name text; v_phone text; v_qty int; v_price numeric;
  v_total numeric := 0; v_items jsonb := '[]'::jsonb; v_pub jsonb := '[]'::jsonb;
  v_camp uuid; v_camp_prod uuid; v_camp_price numeric; v_cust uuid; v_id uuid; v_code text;
begin
  select * into c from pe_companies where lower(slug) = lower(p_slug) and store_enabled;
  if not found then raise exception 'Loja indisponível.'; end if;
  v_name  := btrim(coalesce(p_name, ''));
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Informe o seu nome.'; end if;
  if char_length(v_phone) < 10 or char_length(v_phone) > 13 then raise exception 'Informe um WhatsApp válido, com DDD.'; end if;
  if not coalesce(p_consent, false) then raise exception 'É preciso autorizar o uso dos dados para enviar o pedido.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Seu carrinho está vazio.'; end if;
  if (select count(*) from pe_orders
       where company_id = c.id and regexp_replace(phone, '\D', '', 'g') = v_phone
         and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Muitos pedidos em pouco tempo. Tente novamente mais tarde.'; end if;

  if p_camp is not null and p_camp <> '' then
    select id, product_id, price into v_camp, v_camp_prod, v_camp_price
      from pe_campaigns where company_id = c.id and lower(slug) = lower(p_camp) and status = 'ativa'
       and (ends_at is null or ends_at >= current_date);
  end if;

  for it in select value from jsonb_array_elements(p_items) loop
    v_qty := least(greatest(coalesce((it->>'qty')::int, 0), 0), 99);
    if v_qty < 1 then continue; end if;
    select * into pr from pe_products
     where id = (it->>'id')::uuid and company_id = c.id and published and active;
    if not found then raise exception 'Um dos produtos não está mais disponível.'; end if;
    if not pr.is_service and pr.stock < v_qty then raise exception 'Estoque insuficiente de %.', pr.name; end if;
    v_price := pr.price;
    if v_camp is not null and v_camp_prod = pr.id and v_camp_price is not null then v_price := v_camp_price; end if;
    v_total := v_total + v_price * v_qty;
    v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', pr.id, 'name', pr.name,
                 'qty', v_qty, 'unit_price', v_price, 'unit_cost', pr.cost));
    v_pub   := v_pub   || jsonb_build_array(jsonb_build_object('name', pr.name, 'qty', v_qty, 'unit_price', v_price));
  end loop;
  if jsonb_array_length(v_items) = 0 then raise exception 'Seu carrinho está vazio.'; end if;

  select id into v_cust from pe_customers
   where company_id = c.id
     and right(regexp_replace(coalesce(whatsapp, phone, ''), '\D', '', 'g'), 10) = right(v_phone, 10) limit 1;
  if v_cust is null then
    insert into pe_customers (company_id, name, phone, whatsapp, origin, notes)
    values (c.id, v_name, v_phone, v_phone, 'Loja online', 'Cadastrado automaticamente por um pedido da loja online.')
    returning id into v_cust;
  end if;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into pe_orders (company_id, code, campaign_id, customer_id, customer_name, phone, notes, items, total, consent_at)
  values (c.id, v_code, v_camp, v_cust, v_name, v_phone, left(btrim(coalesce(p_notes, '')), 500), v_items, v_total, now())
  returning id into v_id;
  insert into pe_store_events (company_id, campaign_id, kind) values (c.id, v_camp, 'order');
  return jsonb_build_object('order_id', v_id, 'code', v_code, 'total', v_total, 'items', v_pub);
end $$;

-- Rastreio de visitas (sem dados pessoais)
create or replace function pe_track(p_slug text, p_camp text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid; kid uuid;
begin
  if p_kind not in ('landing', 'catalog', 'cart') then return; end if;
  select id into cid from pe_companies where lower(slug) = lower(p_slug) and store_enabled;
  if cid is null then return; end if;
  if p_camp is not null and p_camp <> '' then
    select id into kid from pe_campaigns where company_id = cid and lower(slug) = lower(p_camp);
  end if;
  insert into pe_store_events (company_id, campaign_id, kind) values (cid, kid, p_kind);
end $$;

revoke all on function pe_store_get(text, text) from public;
revoke all on function pe_place_order(text, text, text, text, text, jsonb, boolean) from public;
revoke all on function pe_track(text, text, text) from public;
grant execute on function pe_store_get(text, text) to anon, authenticated;
grant execute on function pe_place_order(text, text, text, text, text, jsonb, boolean) to anon, authenticated;
grant execute on function pe_track(text, text, text) to anon, authenticated;

-- Fotos: bucket público para leitura; só membros com perfil adequado enviam para a pasta da própria empresa
insert into storage.buckets (id, name, public) values ('pe-media', 'pe-media', true)
on conflict (id) do nothing;
drop policy if exists pe_media_insert on storage.objects;
create policy pe_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'pe-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
              and pe_has_role(((storage.foldername(name))[1])::uuid, array['administrador','gerente','operacional']));
drop policy if exists pe_media_update on storage.objects;
create policy pe_media_update on storage.objects for update to authenticated
  using (bucket_id = 'pe-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and pe_has_role(((storage.foldername(name))[1])::uuid, array['administrador','gerente','operacional']));
drop policy if exists pe_media_delete on storage.objects;
create policy pe_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'pe-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and pe_has_role(((storage.foldername(name))[1])::uuid, array['administrador','gerente','operacional']));

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- LOJA ONLINE (parte 2): várias fotos por produto, destaques e identidade da marca na vitrine
-- (idempotente; pode ser executado de novo)
-- ============================================================
alter table pe_products add column if not exists gallery jsonb default '[]'::jsonb;
alter table pe_products add column if not exists featured boolean default false;

create or replace function pe_store_get(p_slug text, p_camp text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c record; prods jsonb; camp jsonb := null;
begin
  select * into c from pe_companies where lower(slug) = lower(p_slug) and store_enabled;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'price', p.price, 'category', p.category,
           'description', p.description, 'image', p.image_url,
           'gallery', coalesce(p.gallery, '[]'::jsonb), 'featured', coalesce(p.featured, false),
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
       'logo', c.store_settings->>'logo_url', 'instagram', c.store_settings->>'instagram',
       'cover', c.store_settings->>'cover_url', 'city', c.store_settings->>'city',
       'hours', c.store_settings->>'hours', 'delivery', c.store_settings->>'delivery',
       'policy', c.store_settings->>'policy',
       'payments', coalesce(c.store_settings->'payments', '[]'::jsonb)),
    'products', prods, 'campaign', camp);
end $$;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════
-- 09: النواقص — قايمة الحاجات اللي محتاجة تتجاب
-- المنتجات اللي كميتها خلصت بتظهر في الموقع لوحدها، والجدول ده للي الكاشير بيضيفه بإيده
-- (مثلاً منتج لسه متجردش وخلص، أو حاجة الزبون طلبها ومش موجودة عندنا خالص).
-- آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 08.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists shortages (
  id bigint generated always as identity primary key,
  shop_id uuid not null default my_shop() references shops on delete cascade,
  product_id bigint references products on delete set null,
  name text not null,
  note text,
  user_name text,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists shortages_shop on shortages (shop_id, done);

alter table shortages enable row level security;
drop policy if exists shop_read on shortages;
create policy shop_read on shortages for select using (shop_id = my_shop());

-- مين يقدر يستخدم النواقص: أي حد بيبيع أو بيتعامل مع المخزون والمشتريات
create or replace function _require_shortages() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if my_shop() is null then raise exception 'حسابك لسه مش متفعّل. استنى المدير يفعّله'; end if;
  if not (has_perm('sell') or has_perm('products') or has_perm('stock') or has_perm('purchases')) then
    raise exception 'مش مسموحلك تعمل: النواقص. اطلب الصلاحية من المدير';
  end if;
end $$;

-- إضافة للنواقص: من منتج موجود (p_product) أو باسم حر (p_name). لو المنتج موجود في القايمة بالفعل مش بيتكرر.
create or replace function shortage_add(p_product bigint, p_name text, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_name text; v_id bigint;
begin
  perform _require_shortages();
  if p_product is not null then
    select name into v_name from products where id = p_product and shop_id = my_shop();
    if v_name is null then raise exception 'المنتج مش موجود'; end if;
    select id into v_id from shortages where shop_id = my_shop() and product_id = p_product and not done limit 1;
    if v_id is not null then
      if _t(p_note) is not null then update shortages set note = _t(p_note) where id = v_id; end if;
      return v_id;
    end if;
  else
    v_name := _t(p_name);
    if v_name is null then raise exception 'اكتب اسم الحاجة الناقصة'; end if;
  end if;
  insert into shortages (shop_id, product_id, name, note, user_name)
  values (my_shop(), p_product, v_name, _t(p_note), _me_name()) returning id into v_id;
  perform _log('shortage_add', 'النواقص', 'إضافة للنواقص', 'تم إضافة ' || v_name || ' للنواقص',
    _d('المنتج', v_name, 'ملاحظات', _t(p_note)), false);
  return v_id;
end $$;

-- اتجاب / رجّعه للقايمة
create or replace function shortage_done(p_id bigint, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s shortages;
begin
  perform _require_shortages();
  update shortages set done = p_done, done_at = case when p_done then now() end
  where id = p_id and shop_id = my_shop() returning * into s;
  if not found then raise exception 'الحاجة دي مش في النواقص'; end if;
  if p_done then
    perform _log('shortage_done', 'النواقص', 'اتجاب من النواقص', 'تم تعليم ' || s.name || ' إنه اتجاب', null, false);
  end if;
end $$;

create or replace function shortage_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  perform _require_shortages();
  delete from shortages where id = p_id and shop_id = my_shop() returning name into v_name;
  if v_name is null then raise exception 'الحاجة دي مش في النواقص'; end if;
end $$;

-- مسح اللي اتجاب كله مرة واحدة
create or replace function shortage_clear_done() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform _require_shortages();
  delete from shortages where shop_id = my_shop() and done;
  get diagnostics n = row_count;
  return n;
end $$;

-- الصلاحيات
revoke execute on function _require_shortages() from public;
revoke execute on function shortage_add(bigint, text, text) from public;
revoke execute on function shortage_done(bigint, boolean) from public;
revoke execute on function shortage_delete(bigint) from public;
revoke execute on function shortage_clear_done() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function _require_shortages() from anon, authenticated';
    execute 'revoke all on table shortages from anon';
    execute 'revoke insert, update, delete, truncate on table shortages from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on table shortages to authenticated';
    execute 'grant execute on function shortage_add(bigint, text, text) to authenticated';
    execute 'grant execute on function shortage_done(bigint, boolean) to authenticated';
    execute 'grant execute on function shortage_delete(bigint) to authenticated';
    execute 'grant execute on function shortage_clear_done() to authenticated';
  end if;
end $$;

-- التحديث اللحظي
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'shortages') then
    alter publication supabase_realtime add table shortages;
  end if;
end $$;

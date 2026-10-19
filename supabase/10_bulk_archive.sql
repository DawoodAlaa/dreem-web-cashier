-- ═══════════════════════════════════════════════════════════════════
-- 10: حذف كذا منتج مرة واحدة (من صفحة المنتجات) + التراجع عنه
-- العملية بتتسجل مرة واحدة في السجل، والتوفيقات اللي المنتجات دي أساسها بتتشال معاها وبترجع مع التراجع.
-- آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 09.
--
-- التراجع: دالة undo الأصلية (02_core.sql) بتتسمى _undo_core، وundo الجديدة بتتعامل مع
-- "حذف منتجات" وبتحوّل أي عملية تانية لـ _undo_core زي ما هي.
-- لو 02_core.sql اتنفذ تاني بعد الملف ده، نفّذ الملف ده تاني بعده.
-- ═══════════════════════════════════════════════════════════════════

create or replace function archive_products(p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare ids bigint[]; gids bigint[]; n int; names text;
begin
  perform require_perm('products', 'حذف المنتجات');
  select coalesce(array_agg(id order by id), '{}'), count(*), string_agg(name, '، ' order by name)
    into ids, n, names
  from products where id = any (coalesce(p_ids, '{}')) and shop_id = my_shop() and not archived;
  if n = 0 then raise exception 'اختار المنتجات اللي عايز تحذفها'; end if;
  select coalesce(array_agg(id order by id), '{}') into gids
  from compat_groups where base_product_id = any (ids) and shop_id = my_shop() and not archived;
  perform _log('products_archive', 'المنتجات', 'حذف منتجات',
    'تم حذف ' || n || ' منتج' || case when cardinality(gids) > 0 then ' و ' || cardinality(gids) || ' توفيقة' else '' end,
    _d('عدد المنتجات', n::text,
       'التوفيقات اللي اتشالت معاها', case when cardinality(gids) > 0 then cardinality(gids)::text end,
       'المنتجات', case when length(names) > 3000 then left(names, 3000) || ' …' else names end),
    true,
    jsonb_build_object('product_ids', to_jsonb(ids), 'group_ids', to_jsonb(gids)));
  update products set archived = true where id = any (ids);
  update compat_groups set archived = true where id = any (gids);
  return n;
end $$;

-- undo الأصلية بتتنقل لـ _undo_core (مرة واحدة بس)
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = '_undo_core') then
    alter function undo(bigint) rename to _undo_core;
  end if;
end $$;

create or replace function undo(p_op bigint) returns void
language plpgsql security definer set search_path = public as $$
declare e activity_logs;
begin
  select * into e from activity_logs where id = p_op and shop_id = my_shop();
  if found and e.action = 'products_archive' then
    perform require_perm('undo', 'التراجع');
    select * into e from activity_logs where id = p_op for update;
    if e.status = 'undone' then raise exception 'العملية دي اتعمل لها تراجع قبل كده'; end if;
    update products set archived = false
    where id in (select jsonb_array_elements_text(e.snapshot -> 'product_ids')::bigint) and shop_id = my_shop();
    update compat_groups set archived = false
    where id in (select jsonb_array_elements_text(coalesce(e.snapshot -> 'group_ids', '[]'))::bigint) and shop_id = my_shop();
    update activity_logs set status = 'undone', undone_at = now() where id = p_op;
    insert into activity_logs (shop_id, action, section, title, description, undo_of, user_id, user_name)
    values (my_shop(), 'undo', e.section, 'تراجع عن حذف منتجات', 'تم التراجع عن: ' || e.description, p_op, auth.uid(), _me_name());
    return;
  end if;
  perform _undo_core(p_op);
end $$;

-- الصلاحيات
revoke execute on function archive_products(bigint[]) from public;
revoke execute on function undo(bigint) from public;
revoke execute on function _undo_core(bigint) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function archive_products(bigint[]) from anon';
    execute 'revoke execute on function undo(bigint) from anon';
    execute 'revoke execute on function _undo_core(bigint) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function archive_products(bigint[]) to authenticated';
    execute 'grant execute on function undo(bigint) to authenticated';
  end if;
end $$;

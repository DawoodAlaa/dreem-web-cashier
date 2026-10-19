-- ═══════════════════════════════════════════════════════════════════
-- 11: التوفيقات بقت معلومات بس (مش مربوطة بالمنتجات)
-- - save_compat: المنتج الأساسي بقى اختياري (p_base ممكن يبقى null)
-- - archive_products: حذف المنتجات مبقاش بيشيل التوفيقات
-- آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 10.
-- ═══════════════════════════════════════════════════════════════════

create or replace function save_compat(p_id bigint, p_name text, p_base bigint, p_devices text[], p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare devs text[]; o compat_groups; v_gid bigint; v_op bigint;
begin
  perform require_perm('products', 'التوفيقات');
  select coalesce(array_agg(distinct trim(d)), '{}') into devs from unnest(p_devices) d where _t(d) is not null;
  if _t(p_name) is null then raise exception 'اكتب اسم المجموعة'; end if;
  if cardinality(devs) = 0 then raise exception 'اختار جهاز واحد على الأقل'; end if;
  if p_base is not null and not exists (select 1 from products where id = p_base and shop_id = my_shop()) then
    raise exception 'المنتج مش موجود';
  end if;
  if p_id is null then
    v_op := _log('compat_add', 'التوفيقات', 'إضافة توفيقة',
      'تم إضافة مجموعة التوفيقات ' || trim(p_name) || E'\nالأجهزة: ' || array_to_string(devs, '، '),
      _d('المجموعة', trim(p_name), 'الأجهزة', array_to_string(devs, '، ')));
    insert into compat_groups (shop_id, name, base_product_id, notes) values (my_shop(), trim(p_name), p_base, _t(p_notes)) returning id into v_gid;
    insert into compat_devices (shop_id, group_id, device) select my_shop(), v_gid, d from unnest(devs) d;
    update activity_logs set snapshot = jsonb_build_object('group_id', v_gid) where id = v_op;
  else
    select * into o from compat_groups where id = p_id and shop_id = my_shop();
    if not found then raise exception 'المجموعة مش موجودة'; end if;
    perform _log('compat_edit', 'التوفيقات', 'تعديل توفيقة', 'تم تعديل مجموعة التوفيقات ' || o.name,
      _d('المجموعة', trim(p_name), 'الأجهزة قبل', (select string_agg(device, '، ') from compat_devices where group_id = p_id),
         'الأجهزة بعد', array_to_string(devs, '، ')),
      true, jsonb_build_object('group', to_jsonb(o), 'devices', (select coalesce(jsonb_agg(device), '[]') from compat_devices where group_id = p_id)));
    update compat_groups set name = trim(p_name), base_product_id = p_base, notes = _t(p_notes) where id = p_id;
    delete from compat_devices where group_id = p_id;
    insert into compat_devices (shop_id, group_id, device) select my_shop(), p_id, d from unnest(devs) d;
  end if;
end $$;

-- حذف كذا منتج: من غير ما يلمس التوفيقات (التراجع القديم لسه بيرجّع group_ids لو موجودة في السجل)
create or replace function archive_products(p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare ids bigint[]; n int; names text;
begin
  perform require_perm('products', 'حذف المنتجات');
  select coalesce(array_agg(id order by id), '{}'), count(*), string_agg(name, '، ' order by name)
    into ids, n, names
  from products where id = any (coalesce(p_ids, '{}')) and shop_id = my_shop() and not archived;
  if n = 0 then raise exception 'اختار المنتجات اللي عايز تحذفها'; end if;
  perform _log('products_archive', 'المنتجات', 'حذف منتجات', 'تم حذف ' || n || ' منتج',
    _d('عدد المنتجات', n::text, 'المنتجات', case when length(names) > 3000 then left(names, 3000) || ' …' else names end),
    true,
    jsonb_build_object('product_ids', to_jsonb(ids), 'group_ids', '[]'::jsonb));
  update products set archived = true where id = any (ids);
  return n;
end $$;

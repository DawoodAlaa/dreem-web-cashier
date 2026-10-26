-- ═══════════════════════════════════════════════════════════════════
-- 16: النواقص — "قرب يخلص" جنب "خلص"
-- low = true: المنتج لسه موجود بس قرب يخلص (يتجاب قبل ما يخلص)
-- low = false: خلص ومحتاج يتجاب
-- shortage_mark بتضيف المنتج أو بتغيّر حالته لو هو في القايمة بالفعل.
-- آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 15.
-- ═══════════════════════════════════════════════════════════════════

alter table shortages add column if not exists low boolean not null default false;

create or replace function shortage_mark(p_product bigint, p_name text, p_note text, p_low boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_name text; v_id bigint; v_low boolean := coalesce(p_low, false);
begin
  perform _require_shortages();
  if p_product is not null then
    select name into v_name from products where id = p_product and shop_id = my_shop();
    if v_name is null then raise exception 'المنتج مش موجود'; end if;
    select id into v_id from shortages where shop_id = my_shop() and product_id = p_product and not done limit 1;
    if v_id is not null then
      update shortages set low = v_low, note = coalesce(_t(p_note), note) where id = v_id;
      return v_id;
    end if;
  else
    v_name := _t(p_name);
    if v_name is null then raise exception 'اكتب اسم الحاجة الناقصة'; end if;
  end if;
  insert into shortages (shop_id, product_id, name, note, user_name, low)
  values (my_shop(), p_product, v_name, _t(p_note), _me_name(), v_low) returning id into v_id;
  perform _log('shortage_add', 'النواقص', case when v_low then 'قرب يخلص' else 'إضافة للنواقص' end,
    case when v_low then 'تم تعليم ' || v_name || ' إنه قرب يخلص' else 'تم إضافة ' || v_name || ' للنواقص' end,
    _d('المنتج', v_name, 'ملاحظات', _t(p_note)), false);
  return v_id;
end $$;

revoke execute on function shortage_mark(bigint, text, text, boolean) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function shortage_mark(bigint, text, text, boolean) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function shortage_mark(bigint, text, text, boolean) to authenticated';
  end if;
end $$;

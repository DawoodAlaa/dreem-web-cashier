-- ═══════════════════════════════════════════════════════════════════
-- 20: إضافة بضاعة (أي موظف معاه صلاحية add_goods)
-- الموظف بيضيف منتجات جديدة ويرجّع منتجات من الأرشيف ويزوّد عدد الموجود.
-- ميقدرش يغيّر سعر منتج موجود ولا ينقّص عدد منتج اتعد قبل كده (ده الجرد).
-- الجديد والراجع من الأرشيف بيتباعوا على طول، وبيظهروا للمدير في المراجعة
-- (products.review_by فيها اسم اللي ضاف، ولما تتراجع بتبقى فاضية).
-- آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 19.
-- ═══════════════════════════════════════════════════════════════════

alter table products add column if not exists review_by text;
alter table products add column if not exists review_at timestamptz;

-- الأرشيف: اقتراحات وقت الكتابة (الجملة بس للي معاه تقرير الأرباح)
create or replace function goods_archive() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') from (
    select p.id, p.name, p.category_id, p.sell_price as sell, p.min_sell_price as min_sell,
      case when has_perm('reports') then p.cost_price end as cost
    from products p
    where p.shop_id = my_shop() and p.archived and not p.is_used
      and (has_perm('add_goods') or has_perm('products'))
      and exists (select 1 from categories c where c.id = p.category_id and not c.archived)
      and (select count(*) from variants v where v.product_id = p.id and not v.archived) = 1
      and not exists (
        select 1 from products a
        where a.shop_id = p.shop_id and not a.archived and a.category_id = p.category_id and lower(trim(a.name)) = lower(trim(p.name))
      )
    limit 5000
  ) x
$$;

-- p: {category_id, rows: [{variant_id, qty} | {restore_id, qty, cost?, sell?} | {name, qty, cost, sell}]}
create or replace function add_goods(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_track boolean := coalesce(_setting('track_stock'), '1') <> '0';
  v_cat bigint := (p ->> 'category_id')::bigint;
  v_me text;
  v_op bigint; r jsonb; v_qty int; v_name text; v_pid bigint; v_vid bigint; v_cost numeric; v_sell numeric; v_min numeric;
  pr products; vr variants;
  new_ids bigint[] := '{}'; back_ids bigint[] := '{}'; was_unc bigint[] := '{}'; old_prices jsonb := '[]';
  n_new int := 0; n_back int := 0; n_add int := 0; v_total int := 0; lines text[] := '{}'; v_lines text;
begin
  if not has_perm('products') then perform require_perm('add_goods', 'إضافة بضاعة'); end if;
  if jsonb_typeof(p -> 'rows') is distinct from 'array' or jsonb_array_length(p -> 'rows') = 0 then
    raise exception 'مفيش منتجات تتضاف';
  end if;
  v_me := _me_name();
  v_op := _log('goods_add', 'المنتجات', 'إضافة بضاعة', 'إضافة بضاعة');

  for r in select * from jsonb_array_elements(p -> 'rows') loop
    v_qty := case when v_track then coalesce((r ->> 'qty')::int, 0) else 0 end;
    v_vid := (r ->> 'variant_id')::bigint;
    v_pid := (r ->> 'restore_id')::bigint;
    v_name := _t(r ->> 'name');
    if v_track and v_qty <= 0 then raise exception 'اكتب العدد%', coalesce(' لـ "' || v_name || '"', ''); end if;

    -- اسم مكتوب بإيده: لو موجود في نفس الصنف يبقى نفس المنتج مش منتج جديد
    if v_vid is null and v_pid is null then
      if v_name is null then raise exception 'اكتب اسم المنتج'; end if;
      if v_cat is null then raise exception 'اختار الصنف'; end if;
      if not exists (select 1 from categories where id = v_cat and shop_id = my_shop() and not archived) then
        raise exception 'الصنف مش موجود';
      end if;
      select * into pr from products
      where shop_id = my_shop() and category_id = v_cat and not archived and lower(trim(name)) = lower(v_name) order by id limit 1;
      if found then
        if (select count(*) from variants where product_id = pr.id and not archived) <> 1 then
          raise exception 'المنتج "%" ليه أنواع. اختار النوع من القايمة', pr.name;
        end if;
        select id into v_vid from variants where product_id = pr.id and not archived;
      else
        select id into v_pid from products x
        where x.shop_id = my_shop() and x.category_id = v_cat and x.archived and not x.is_used and lower(trim(x.name)) = lower(v_name)
          and (select count(*) from variants v where v.product_id = x.id and not v.archived) = 1
        order by x.id desc limit 1;
      end if;
    end if;

    -- موظف تاني رجّع المنتج ده من الأرشيف قبل شوية: يتزود عليه
    if v_pid is not null then
      select * into pr from products where id = v_pid and shop_id = my_shop() for update;
      if not found then raise exception 'المنتج مش موجود'; end if;
      if not pr.archived then
        select id into v_vid from variants where product_id = v_pid and not archived order by id limit 1;
        v_pid := null;
      end if;
    end if;

    if v_pid is not null then
      -- رجوع من الأرشيف
      if (select count(*) from variants where product_id = v_pid and not archived) <> 1 then
        raise exception 'المنتج "%" ليه أنواع. رجّعه من صفحة السجل أو ضيفه من جديد', pr.name;
      end if;
      select * into vr from variants where product_id = v_pid and not archived for update;
      v_cost := coalesce((r ->> 'cost')::numeric, pr.cost_price);
      v_sell := coalesce((r ->> 'sell')::numeric, pr.sell_price);
      if v_cost < 0 or v_sell <= 0 then raise exception 'سعر "%" غلط', pr.name; end if;
      v_min := least(coalesce((r ->> 'min_sell')::numeric, pr.min_sell_price), v_sell);
      old_prices := old_prices || jsonb_build_array(jsonb_build_array(pr.id, pr.cost_price, pr.sell_price, pr.min_sell_price));
      update products set archived = false, cost_price = round(v_cost, 2), sell_price = round(v_sell, 2), min_sell_price = round(v_min, 2),
        review_by = v_me, review_at = now()
      where id = v_pid;
      back_ids := back_ids || v_pid;
      n_back := n_back + 1;
      if v_track then
        if vr.uncounted then
          was_unc := was_unc || vr.id;
          update variants set uncounted = false where id = vr.id;
        end if;
        perform _move_stock(vr.id, v_qty - vr.stock, 'count', v_op);
      end if;
      v_name := pr.name;

    elsif v_vid is not null then
      -- منتج موجود: السعر مبيتغيرش
      select * into vr from variants where id = v_vid and shop_id = my_shop() and not archived for update;
      if not found then raise exception 'المنتج مش موجود'; end if;
      select * into pr from products where id = vr.product_id;
      if pr.archived then raise exception 'المنتج "%" اتحذف', pr.name; end if;
      continue when not v_track;
      if vr.uncounted then
        -- لسه متعدّش: العدد ده أول رصيد ليه
        was_unc := was_unc || vr.id;
        update variants set uncounted = false where id = vr.id;
        perform _move_stock(vr.id, v_qty - vr.stock, 'count', v_op);
      else
        perform _move_stock(vr.id, v_qty, 'add', v_op);
      end if;
      n_add := n_add + 1;
      v_name := _variant_label(vr.id);

    else
      -- منتج جديد
      if (r ->> 'cost') is null then raise exception 'اكتب سعر الجملة لـ "%"', v_name; end if;
      v_sell := (r ->> 'sell')::numeric;
      r := jsonb_build_object('category_id', v_cat, 'name', v_name, 'cost', (r ->> 'cost')::numeric, 'sell', v_sell,
        'min_sell', coalesce((r ->> 'min_sell')::numeric, v_sell), 'min_stock', 1, 'uncounted', not v_track,
        'variants', jsonb_build_array(jsonb_build_object('stock', v_qty)));
      perform _validate_product(r);
      v_pid := _insert_product(r, v_op);
      update products set review_by = v_me, review_at = now() where id = v_pid;
      new_ids := new_ids || v_pid;
      n_new := n_new + 1;
    end if;

    v_total := v_total + v_qty;
    lines := lines || (v_name || case when v_track then ' (' || v_qty || ')' else '' end);
  end loop;

  if n_new + n_back + n_add = 0 then raise exception 'مفيش منتجات تتضاف'; end if;
  perform _auto_parts();
  v_lines := array_to_string(lines, '، ');
  update activity_logs set
    description = 'تم إضافة بضاعة: ' || (n_new + n_back + n_add) || ' منتج' || case when v_track then ' و' || v_total || ' قطعة' else '' end,
    details = _d('منتجات جديدة', nullif(n_new, 0)::text, 'رجعت من الأرشيف', nullif(n_back, 0)::text, 'زاد عددها', nullif(n_add, 0)::text,
      'إجمالي القطع', case when v_track then v_total::text end,
      'المنتجات', case when length(v_lines) > 3000 then left(v_lines, 3000) || ' …' else v_lines end),
    snapshot = jsonb_build_object('new_ids', to_jsonb(new_ids), 'back_ids', to_jsonb(back_ids), 'was_uncounted', to_jsonb(was_unc), 'old_prices', old_prices)
  where id = v_op;
  return jsonb_build_object('new', n_new, 'back', n_back, 'added', n_add, 'pieces', v_total);
end $$;

-- المراجعة: p_items [{id, cost?, sell?, min_sell?}] بتثبّت الأسعار وبتشيل المنتج من القايمة
create or replace function goods_review(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; pr products; v_cost numeric; v_sell numeric; v_min numeric;
  v_can_cost boolean := has_perm('reports');
  old_prices jsonb := '[]'; names text[] := '{}'; n int := 0;
begin
  perform require_perm('products', 'مراجعة البضاعة');
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    select * into pr from products where id = (it ->> 'id')::bigint and shop_id = my_shop() for update;
    continue when not found;
    v_cost := case when v_can_cost then coalesce((it ->> 'cost')::numeric, pr.cost_price) else pr.cost_price end;
    v_sell := coalesce((it ->> 'sell')::numeric, pr.sell_price);
    v_min := coalesce((it ->> 'min_sell')::numeric, pr.min_sell_price);
    if v_cost < 0 or v_min < 0 or v_sell <= 0 then raise exception 'سعر "%" غلط', pr.name; end if;
    if v_min > v_sell + 0.005 then raise exception '"%": أقل سعر لازم يبقى أقل من أو يساوي سعر البيع', pr.name; end if;
    if abs(v_cost - pr.cost_price) > 0.005 or abs(v_sell - pr.sell_price) > 0.005 or abs(v_min - pr.min_sell_price) > 0.005 then
      old_prices := old_prices || jsonb_build_array(jsonb_build_array(pr.id, pr.cost_price, pr.sell_price, pr.min_sell_price));
      names := names || pr.name;
    end if;
    update products set cost_price = round(v_cost, 2), sell_price = round(v_sell, 2), min_sell_price = round(v_min, 2),
      review_by = null, review_at = null
    where id = pr.id;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'مفيش منتجات للمراجعة'; end if;
  if jsonb_array_length(old_prices) > 0 then
    perform _log('bulk_price', 'المنتجات', 'مراجعة بضاعة', 'تم تعديل أسعار ' || jsonb_array_length(old_prices) || ' منتج في المراجعة',
      _d('المنتجات', array_to_string(names, '، ')), true, jsonb_build_object('prices', old_prices));
  end if;
  return n;
end $$;

-- التراجع: نفس 14 + إضافة البضاعة
create or replace function undo(p_op bigint) returns void
language plpgsql security definer set search_path = public as $$
declare e activity_logs; v_pid bigint; v_ids bigint[];
begin
  select * into e from activity_logs where id = p_op and shop_id = my_shop();
  if found and e.action in ('products_archive', 'salary_in', 'salary_out') then
    perform require_perm('undo', 'التراجع');
    select * into e from activity_logs where id = p_op for update;
    if e.status = 'undone' then raise exception 'العملية دي اتعمل لها تراجع قبل كده'; end if;
    if e.action = 'products_archive' then
      update products set archived = false
      where id in (select jsonb_array_elements_text(e.snapshot -> 'product_ids')::bigint) and shop_id = my_shop();
      update compat_groups set archived = false
      where id in (select jsonb_array_elements_text(coalesce(e.snapshot -> 'group_ids', '[]'))::bigint) and shop_id = my_shop();
    else
      -- التحويل: لازم الرصيد يكفي عشان الفلوس ترجع الدرج
      if e.action = 'salary_in' and salary_balance() + 0.005 <
         (select coalesce(sum(amount), 0) from salary_moves where op_id = p_op and not voided) then
        raise exception 'رصيد المرتبات مش كفاية عشان ترجّع التحويل ده (اتسحب منه)';
      end if;
      update salary_moves set voided = true where op_id = p_op and shop_id = my_shop();
      update cash_moves set voided = true where op_id = p_op and shop_id = my_shop();
      update expenses set voided = true where op_id = p_op and shop_id = my_shop();
    end if;
    update activity_logs set status = 'undone', undone_at = now() where id = p_op;
    insert into activity_logs (shop_id, action, section, title, description, undo_of, user_id, user_name)
    values (my_shop(), 'undo', e.section, 'تراجع عن ' || e.title, 'تم التراجع عن: ' || e.description, p_op, auth.uid(), _me_name());
    return;
  end if;

  if found and e.action = 'goods_add' and e.status is distinct from 'undone' then
    perform require_perm('undo', 'التراجع');
    select coalesce(array_agg(x::bigint), '{}') into v_ids from (
      select jsonb_array_elements_text(e.snapshot -> 'new_ids') x
      union all select jsonb_array_elements_text(e.snapshot -> 'back_ids')
    ) t;
    foreach v_pid in array v_ids loop
      if exists (
        select 1 from stock_moves sm join variants vv on vv.id = sm.variant_id
        where vv.product_id = v_pid and not sm.voided and sm.op_id > p_op
      ) then
        raise exception 'المنتج "%" اتعمل عليه حركات بعد إضافته (بيع أو تعديل كمية). اعمل تراجع عنها الأول أو احذف المنتج',
          (select name from products where id = v_pid);
      end if;
    end loop;
    update variants set uncounted = true
    where id in (select jsonb_array_elements_text(e.snapshot -> 'was_uncounted')::bigint) and shop_id = my_shop();
  end if;

  perform _undo_core(p_op);

  -- تعديل منتج: _undo_core بترجّع الاسم والحالة، واحنا بنرجّع أسعار الأنواع كمان
  if e.action = 'product_edit' then
    update variants x set cost_price = (r ->> 'cost_price')::numeric, sell_price = (r ->> 'sell_price')::numeric,
      min_sell_price = (r ->> 'min_sell_price')::numeric
    from jsonb_array_elements(coalesce(e.snapshot -> 'variants', '[]')) r
    where x.id = (r ->> 'id')::bigint and r ? 'sell_price' and x.shop_id = my_shop();
  elsif e.action = 'goods_add' then
    update products set archived = true, review_by = null, review_at = null where id = any (v_ids) and shop_id = my_shop();
    update products x set cost_price = (r ->> 1)::numeric, sell_price = (r ->> 2)::numeric, min_sell_price = (r ->> 3)::numeric
    from jsonb_array_elements(e.snapshot -> 'old_prices') r
    where x.id = (r ->> 0)::bigint and x.shop_id = my_shop();
    update activity_logs set title = 'تراجع عن إضافة بضاعة' where undo_of = p_op and shop_id = my_shop();
  end if;
end $$;

revoke execute on function goods_archive() from public;
revoke execute on function add_goods(jsonb) from public;
revoke execute on function goods_review(jsonb) from public;
revoke execute on function undo(bigint) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function goods_archive() from anon';
    execute 'revoke execute on function add_goods(jsonb) from anon';
    execute 'revoke execute on function goods_review(jsonb) from anon';
    execute 'revoke execute on function undo(bigint) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function goods_archive() to authenticated';
    execute 'grant execute on function add_goods(jsonb) to authenticated';
    execute 'grant execute on function goods_review(jsonb) to authenticated';
    execute 'grant execute on function undo(bigint) to authenticated';
  end if;
end $$;

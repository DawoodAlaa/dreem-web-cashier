-- ═══════════════════════════════════════════════════════════════════
-- 14: كل نوع (متغير) في المنتج ممكن يبقى ليه سعر مختلف
-- variants.cost_price / sell_price / min_sell_price — لو فاضية النوع بياخد سعر المنتج.
-- الدوال هنا نسخة من الأصلية (03 / 04 / 05) بالظبط ومعدّل فيها بس الأماكن اللي بتقرا السعر:
-- البيع والمرتجع والاستبدال والهالك بيستخدموا سعر النوع، وإضافة/تعديل المنتج بيحفظوا أسعار الأنواع.
-- اتولّد بـ scripts/sql (build14). آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 13.
-- ═══════════════════════════════════════════════════════════════════

alter table variants add column if not exists cost_price numeric(14, 2);
alter table variants add column if not exists sell_price numeric(14, 2);
alter table variants add column if not exists min_sell_price numeric(14, 2);

create or replace function _validate_product(p jsonb) returns void
language plpgsql immutable as $$
declare n int; names text[];
begin
  if _t(p ->> 'name') is null then raise exception 'اكتب اسم المنتج'; end if;
  if coalesce((p ->> 'cost')::numeric, 0) < 0 or coalesce((p ->> 'sell')::numeric, 0) < 0 or coalesce((p ->> 'min_sell')::numeric, 0) < 0 then
    raise exception 'الأسعار مينفعش تبقى بالسالب';
  end if;
  if coalesce((p ->> 'sell')::numeric, 0) <= 0 then raise exception 'اكتب سعر البيع'; end if;
  if (p ->> 'min_sell')::numeric > (p ->> 'sell')::numeric + 0.005 then
    raise exception 'أقل سعر بيع لازم يبقى أقل من أو يساوي سعر البيع';
  end if;
  n := jsonb_array_length(coalesce(p -> 'variants', '[]'));
  if n = 0 then raise exception 'لازم يبقى في متغير واحد على الأقل'; end if;
  if exists (select 1 from jsonb_array_elements(p -> 'variants') v where coalesce((v ->> 'stock')::int, 0) < 0) then
    raise exception 'الكمية مينفعش تبقى بالسالب';
  end if;
  select array_agg(_t(v ->> 'name')) into names from jsonb_array_elements(p -> 'variants') v;
  if n > 1 and exists (select 1 from unnest(names) x where x is null) then raise exception 'اكتب اسم لكل متغير'; end if;
  if (select count(distinct x) from unnest(names) x) < (select count(x) from unnest(names) x) then
    raise exception 'في متغيرين بنفس الاسم';
  end if;
  -- أسعار الأنواع (لو النوع ليه سعر مختلف)
  if exists (select 1 from jsonb_array_elements(p -> 'variants') v
             where coalesce((v ->> 'cost')::numeric, 0) < 0 or coalesce((v ->> 'min_sell')::numeric, 0) < 0
                or ((v ->> 'sell') is not null and (v ->> 'sell')::numeric <= 0)) then
    raise exception 'أسعار الأنواع مينفعش تبقى بالسالب أو صفر';
  end if;
  if exists (select 1 from jsonb_array_elements(p -> 'variants') v
             where coalesce((v ->> 'min_sell')::numeric, (p ->> 'min_sell')::numeric, (p ->> 'sell')::numeric)
                   > coalesce((v ->> 'sell')::numeric, (p ->> 'sell')::numeric) + 0.005) then
    raise exception 'في نوع أقل سعر بيع بتاعه أكبر من سعر البيع';
  end if;
end $$;

create or replace function _insert_product(p jsonb, p_op bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_pid bigint; v_vid bigint; v jsonb; n int; v_unc boolean;
begin
  insert into products (shop_id, category_id, name, cost_price, sell_price, min_sell_price, image_url, min_stock, notes, imei, is_used)
  values (
    my_shop(), (p ->> 'category_id')::bigint, trim(p ->> 'name'), round(coalesce((p ->> 'cost')::numeric, 0), 2),
    round((p ->> 'sell')::numeric, 2), round(coalesce((p ->> 'min_sell')::numeric, (p ->> 'sell')::numeric), 2),
    _t(p ->> 'image_url'), coalesce((p ->> 'min_stock')::int, 0), _t(p ->> 'notes'), _t(p ->> 'imei'),
    coalesce((p ->> 'is_used')::boolean, false)
  ) returning id into v_pid;
  if not exists (select 1 from categories where id = (p ->> 'category_id')::bigint and shop_id = my_shop()) then
    raise exception 'الصنف مش موجود';
  end if;
  n := jsonb_array_length(p -> 'variants');
  for v in select * from jsonb_array_elements(p -> 'variants') loop
    v_unc := coalesce((p ->> 'uncounted')::boolean, false) or coalesce((v ->> 'uncounted')::boolean, false);
    insert into variants (shop_id, product_id, name, uncounted, cost_price, sell_price, min_sell_price)
    values (my_shop(), v_pid, case when n = 1 and _t(v ->> 'name') is null then null else _t(v ->> 'name') end, v_unc,
      round((v ->> 'cost')::numeric, 2), round((v ->> 'sell')::numeric, 2), round((v ->> 'min_sell')::numeric, 2))
    returning id into v_vid;
    if not v_unc then perform _move_stock(v_vid, coalesce((v ->> 'stock')::int, 0), 'initial', p_op); end if;
  end loop;
  return v_pid;
end $$;

create or replace function edit_product(p_id bigint, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  o products; v_op bigint; price_changed boolean; vi jsonb; ov variants; keep bigint[] := '{}'; n int;
  v_name text; v_vid bigint; v_unc boolean := coalesce((p ->> 'uncounted')::boolean, false);
begin
  perform require_perm('products', 'تعديل المنتجات');
  perform _validate_product(p);
  select * into o from products where id = p_id and shop_id = my_shop() for update;
  if not found then raise exception 'المنتج مش موجود'; end if;
  price_changed := abs(o.sell_price - (p ->> 'sell')::numeric) > 0.005 or abs(o.cost_price - (p ->> 'cost')::numeric) > 0.005
    or abs(o.min_sell_price - (p ->> 'min_sell')::numeric) > 0.005;
  v_op := _log('product_edit', 'المنتجات', case when price_changed then 'تعديل سعر' else 'تعديل منتج' end,
    case when abs(o.sell_price - (p ->> 'sell')::numeric) > 0.005
      then 'تم تعديل سعر المنتج ' || o.name || E'\nمن ' || _m(o.sell_price) || ' إلى ' || _m((p ->> 'sell')::numeric)
      else 'تم تعديل معلومات المنتج ' || o.name end,
    _d('المنتج', o.name,
       'الاسم', case when o.name <> trim(p ->> 'name') then o.name || ' ← ' || trim(p ->> 'name') end,
       'سعر الجملة', case when abs(o.cost_price - (p ->> 'cost')::numeric) > 0.005 then _m(o.cost_price) || ' ← ' || _m((p ->> 'cost')::numeric) end,
       'سعر البيع', case when abs(o.sell_price - (p ->> 'sell')::numeric) > 0.005 then _m(o.sell_price) || ' ← ' || _m((p ->> 'sell')::numeric) end,
       'أقل سعر بيع', case when abs(o.min_sell_price - (p ->> 'min_sell')::numeric) > 0.005 then _m(o.min_sell_price) || ' ← ' || _m((p ->> 'min_sell')::numeric) end),
    true,
    jsonb_build_object('product', to_jsonb(o), 'variants', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'archived', archived, 'cost_price', cost_price, 'sell_price', sell_price, 'min_sell_price', min_sell_price)), '[]') from variants where product_id = p_id)));

  update products set
    category_id = (p ->> 'category_id')::bigint, name = trim(p ->> 'name'),
    cost_price = round((p ->> 'cost')::numeric, 2), sell_price = round((p ->> 'sell')::numeric, 2),
    min_sell_price = round((p ->> 'min_sell')::numeric, 2), image_url = _t(p ->> 'image_url'),
    min_stock = coalesce((p ->> 'min_stock')::int, 0), notes = _t(p ->> 'notes'), imei = _t(p ->> 'imei')
  where id = p_id;

  n := jsonb_array_length(p -> 'variants');
  for vi in select * from jsonb_array_elements(p -> 'variants') loop
    v_name := case when n = 1 and _t(vi ->> 'name') is null then null else _t(vi ->> 'name') end;
    if (vi ->> 'id') is not null then
      select * into ov from variants where id = (vi ->> 'id')::bigint and product_id = p_id;
      if not found then raise exception 'المتغير مش موجود'; end if;
      keep := keep || ov.id;
      update variants set name = v_name, archived = false, cost_price = round((vi ->> 'cost')::numeric, 2),
        sell_price = round((vi ->> 'sell')::numeric, 2), min_sell_price = round((vi ->> 'min_sell')::numeric, 2) where id = ov.id;
      if not ov.uncounted then perform _move_stock(ov.id, coalesce((vi ->> 'stock')::int, 0) - ov.stock, 'adjust', v_op); end if;
    else
      insert into variants (shop_id, product_id, name, uncounted, cost_price, sell_price, min_sell_price)
      values (my_shop(), p_id, v_name, v_unc, round((vi ->> 'cost')::numeric, 2), round((vi ->> 'sell')::numeric, 2),
        round((vi ->> 'min_sell')::numeric, 2)) returning id into v_vid;
      if not v_unc then perform _move_stock(v_vid, coalesce((vi ->> 'stock')::int, 0), 'initial', v_op); end if;
    end if;
  end loop;
  for ov in select * from variants where product_id = p_id and not archived and not (id = any (keep)) loop
    if not ov.uncounted then perform _move_stock(ov.id, -ov.stock, 'adjust', v_op); end if;
    update variants set archived = true where id = ov.id;
  end loop;
  perform _auto_parts();
end $$;

create or replace function complete_sale(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ln jsonb; v variants; pr products; v_op bigint; v_inv bigint; v_no int; c customers;
  v_sub numeric := 0; v_min numeric := 0; v_total numeric; v_disc numeric := round(coalesce((p ->> 'discount')::numeric, 0), 2);
  v_paid numeric; v_debt numeric; v_count int := 0; v_lines text := ''; lowered boolean := false;
begin
  perform require_perm('sell', 'البيع');
  if jsonb_array_length(coalesce(p -> 'lines', '[]')) = 0 then raise exception 'السلة فاضية'; end if;
  if v_disc < 0 then raise exception 'الخصم مينفعش يبقى بالسالب'; end if;

  -- الوصلة الخلصانة تتفك من الشاحن والشاحن الخلصان يتجمّع
  perform _auto_split_for((select jsonb_agg(jsonb_build_object('variant_id', l -> 'variant_id', 'qty', l -> 'qty')) from jsonb_array_elements(p -> 'lines') l));

  for ln in select * from jsonb_array_elements(p -> 'lines') loop
    select * into v from variants where id = (ln ->> 'variant_id')::bigint and shop_id = my_shop();
    if not found then raise exception 'منتج في السلة مش موجود'; end if;
    select * into pr from products where id = v.product_id;
    pr.cost_price := coalesce(v.cost_price, pr.cost_price); pr.sell_price := coalesce(v.sell_price, pr.sell_price);
    pr.min_sell_price := coalesce(v.min_sell_price, pr.min_sell_price);
    if (ln ->> 'qty')::int <= 0 then raise exception 'الكمية لازم تبقى أكبر من صفر'; end if;
    if not v.uncounted and v.stock < (ln ->> 'qty')::int then
      raise exception 'الكمية المتاحة من "%" هي % بس', _variant_label(v.id), v.stock;
    end if;
    if (ln ->> 'unit_price')::numeric + 0.005 < pr.min_sell_price then
      raise exception 'سعر "%" (%) أقل من أقل سعر بيع (%)', _variant_label(v.id), _m((ln ->> 'unit_price')::numeric), _m(pr.min_sell_price);
    end if;
    if (ln ->> 'unit_price')::numeric + 0.005 < pr.sell_price then lowered := true; end if;
    v_sub := v_sub + round((ln ->> 'unit_price')::numeric * (ln ->> 'qty')::int, 2);
    v_min := v_min + pr.min_sell_price * (ln ->> 'qty')::int;
  end loop;
  if lowered or v_disc > 0 then perform require_perm('discount', 'الخصم وتقليل السعر'); end if;
  v_total := round(v_sub - v_disc, 2);
  if v_total + 0.005 < v_min then
    raise exception 'الخصم كبير: إجمالي الفاتورة مينفعش يقل عن % (مجموع أقل أسعار البيع)', _m(v_min);
  end if;
  v_paid := round(least(coalesce((p ->> 'paid')::numeric, v_total), v_total), 2);
  if v_paid < 0 then raise exception 'المبلغ المدفوع غلط'; end if;
  v_debt := round(v_total - v_paid, 2);
  if (p ->> 'customer_id') is not null then
    select * into c from customers where id = (p ->> 'customer_id')::bigint and shop_id = my_shop();
  end if;
  if v_debt > 0.005 then
    perform require_perm('credit', 'البيع الآجل');
    if c.id is null then raise exception 'اختار العميل عشان الباقي يتسجل عليه آجل'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(my_shop()::text || ':invoice'));
  select coalesce(max(no), 0) + 1 into v_no from invoices where shop_id = my_shop();
  v_op := _log('sale', 'المبيعات', 'فاتورة بيع', '');
  insert into invoices (shop_id, no, customer_id, customer_name, subtotal, discount, total, paid, note, user_name, op_id)
  values (my_shop(), v_no, c.id, c.name, round(v_sub, 2), v_disc, v_total, v_paid, _t(p ->> 'note'), _me_name(), v_op)
  returning id into v_inv;

  for ln in select * from jsonb_array_elements(p -> 'lines') loop
    select * into v from variants where id = (ln ->> 'variant_id')::bigint;
    select * into pr from products where id = v.product_id;
    pr.cost_price := coalesce(v.cost_price, pr.cost_price); pr.sell_price := coalesce(v.sell_price, pr.sell_price);
    pr.min_sell_price := coalesce(v.min_sell_price, pr.min_sell_price);
    insert into invoice_items (shop_id, invoice_id, variant_id, product_id, product_name, variant_name, cost_price, base_price, min_price, unit_price, qty)
    values (my_shop(), v_inv, v.id, pr.id, pr.name, v.name, pr.cost_price, pr.sell_price, pr.min_sell_price,
      round((ln ->> 'unit_price')::numeric, 2), (ln ->> 'qty')::int);
    perform _move_stock(v.id, -(ln ->> 'qty')::int, 'sale', v_op);
    v_count := v_count + (ln ->> 'qty')::int;
    v_lines := v_lines || case when v_lines = '' then '' else E'\n' end || _variant_label(v.id) || ' × ' || (ln ->> 'qty') || ' = '
      || _m((ln ->> 'unit_price')::numeric * (ln ->> 'qty')::int);
  end loop;

  perform _cash(v_paid, 'sale', v_op, 'فاتورة #' || v_no);
  if v_debt > 0.005 then
    insert into customer_txns (shop_id, customer_id, amount, kind, invoice_id, note, op_id)
    values (my_shop(), c.id, v_debt, 'credit_sale', v_inv, 'باقي فاتورة #' || v_no, v_op);
  end if;
  update activity_logs set
    description = 'تم إنشاء فاتورة بيع رقم #' || v_no || E'\nالمجموع ' || _m(v_total),
    details = _d('رقم الفاتورة', '#' || v_no, 'عدد الأصناف', v_count::text, 'المجموع الفرعي', _m(v_sub),
      'الخصم', case when v_disc > 0 then _m(v_disc) end, 'الإجمالي', _m(v_total), 'المدفوع', _m(v_paid),
      'آجل على العميل', case when v_debt > 0 then _m(v_debt) end, 'العميل', c.name, 'الأصناف', v_lines)
  where id = v_op;
  return jsonb_build_object('id', v_inv, 'no', v_no, 'total', v_total);
end $$;

create or replace function create_adjustment(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  inv invoices; it invoice_items; r jsonb; v variants; pr products; v_kind text; v_factor numeric;
  v_in numeric := 0; v_out numeric := 0; v_diff numeric; v_cash numeric; v_debtd numeric := 0; v_bal numeric; v_off numeric;
  v_returnable int; v_op bigint; v_adj bigint; v_label text; v_ins_text text := ''; v_outs_text text := '';
begin
  perform require_perm('returns', 'المرتجع والاستبدال');
  select * into inv from invoices where id = (p ->> 'invoice_id')::bigint and shop_id = my_shop() for update;
  if not found then raise exception 'الفاتورة مش موجودة'; end if;
  if inv.voided then raise exception 'الفاتورة دي ملغاة'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(p -> 'ins', '[]')) x where (x ->> 'qty')::int > 0) then
    raise exception 'اختار المنتجات اللي راجعة';
  end if;
  v_kind := case when jsonb_array_length(coalesce(p -> 'outs', '[]')) = 0 then 'return' else 'exchange' end;
  v_label := case when v_kind = 'return' then 'مرتجع' else 'استبدال' end;
  v_factor := case when inv.subtotal <= 0 then 1 else inv.total / inv.subtotal end;

  for r in select * from jsonb_array_elements(p -> 'ins') where (value ->> 'qty')::int > 0 loop
    select * into it from invoice_items where id = (r ->> 'invoice_item_id')::bigint and invoice_id = inv.id;
    if not found then raise exception 'المنتج ده مش في الفاتورة'; end if;
    select it.qty - coalesce(sum(ai.qty), 0) into v_returnable from adjustment_items ai join adjustments a on a.id = ai.adjustment_id
      where ai.invoice_item_id = it.id and ai.direction = 'in' and not a.voided;
    if (r ->> 'qty')::int > v_returnable then
      raise exception 'الكمية اللي راجعة من "%" أكبر من المتاح (%)', it.product_name, v_returnable;
    end if;
    v_in := v_in + it.unit_price * v_factor * (r ->> 'qty')::int;
    v_ins_text := v_ins_text || case when v_ins_text = '' then '' else E'\n' end || coalesce(it.product_name || coalesce(' (' || it.variant_name || ')', ''), '')
      || ' × ' || (r ->> 'qty') || case when coalesce((r ->> 'damaged')::boolean, false) then ' (تالف)' else '' end;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p -> 'outs', '[]')) loop
    select * into v from variants where id = (r ->> 'variant_id')::bigint and shop_id = my_shop();
    select * into pr from products where id = v.product_id;
    pr.cost_price := coalesce(v.cost_price, pr.cost_price); pr.sell_price := coalesce(v.sell_price, pr.sell_price);
    pr.min_sell_price := coalesce(v.min_sell_price, pr.min_sell_price);
    if (r ->> 'unit_price')::numeric + 0.005 < pr.min_sell_price then
      raise exception 'سعر "%" أقل من أقل سعر بيع (%)', _variant_label(v.id), _m(pr.min_sell_price);
    end if;
    v_out := v_out + round((r ->> 'unit_price')::numeric * (r ->> 'qty')::int, 2);
    v_outs_text := v_outs_text || case when v_outs_text = '' then '' else E'\n' end || _variant_label(v.id) || ' × ' || (r ->> 'qty');
  end loop;
  v_in := round(v_in, 2); v_out := round(v_out, 2);
  v_diff := round(v_out - v_in, 2);
  v_cash := v_diff;
  if v_diff < 0 and coalesce((p ->> 'offset_debt')::boolean, false) and inv.customer_id is not null then
    select coalesce(sum(amount), 0) into v_bal from customer_txns where customer_id = inv.customer_id and not voided;
    if v_bal > 0 then
      v_off := round(least(-v_diff, v_bal), 2);
      v_debtd := -v_off;
      v_cash := round(v_diff + v_off, 2);
    end if;
  end if;
  if v_cash < 0 and -v_cash > cash_balance() + 0.005 then
    raise exception 'المبلغ في الدرج (%) مش كفاية عشان ترجّع %', _m(cash_balance()), _m(-v_cash);
  end if;

  if v_kind = 'exchange' then
    perform _auto_split_for((select jsonb_agg(jsonb_build_object('variant_id', o -> 'variant_id', 'qty', o -> 'qty')) from jsonb_array_elements(p -> 'outs') o));
  end if;

  v_op := _log(v_kind, 'الفواتير', v_label,
    case when v_kind = 'return' then 'تم تسجيل مرتجع على الفاتورة #' || inv.no || E'\nالمبلغ المرتجع ' || _m(v_in)
      else 'تم تسجيل استبدال على الفاتورة #' || inv.no || E'\nالفرق ' || _m(v_diff) end,
    _d('رقم الفاتورة', '#' || inv.no, 'المرتجع من العميل', v_ins_text, 'المنتجات البديلة', nullif(v_outs_text, ''),
       'قيمة المرتجع', _m(v_in), 'قيمة البديل', case when v_kind = 'exchange' then _m(v_out) end,
       'العميل دفع', case when v_cash > 0 then _m(v_cash) end, 'العميل استلم', case when v_cash < 0 then _m(-v_cash) end,
       'اتخصم من مديونية العميل', case when v_debtd < 0 then _m(-v_debtd) end));
  insert into adjustments (shop_id, invoice_id, kind, in_total, out_total, cash_delta, debt_delta, note, op_id)
  values (my_shop(), inv.id, v_kind, v_in, v_out, v_cash, v_debtd, _t(p ->> 'note'), v_op) returning id into v_adj;

  for r in select * from jsonb_array_elements(p -> 'ins') where (value ->> 'qty')::int > 0 loop
    select * into it from invoice_items where id = (r ->> 'invoice_item_id')::bigint;
    insert into adjustment_items (shop_id, adjustment_id, invoice_item_id, variant_id, product_id, product_name, variant_name, direction, qty, unit_price, cost_price, damaged)
    values (my_shop(), v_adj, it.id, it.variant_id, it.product_id, it.product_name, it.variant_name, 'in', (r ->> 'qty')::int,
      round(it.unit_price * v_factor, 2), it.cost_price, coalesce((r ->> 'damaged')::boolean, false));
    if coalesce((r ->> 'damaged')::boolean, false) then
      insert into losses (shop_id, variant_id, product_id, product_name, qty, unit_cost, reason, note, source, op_id)
      values (my_shop(), it.variant_id, it.product_id, it.product_name || coalesce(' (' || it.variant_name || ')', ''), (r ->> 'qty')::int,
        it.cost_price, case when v_kind = 'return' then 'مرتجع تالف' else 'استبدال تالف' end, 'فاتورة #' || inv.no, v_kind, v_op);
    else
      perform _move_stock(it.variant_id, (r ->> 'qty')::int, case when v_kind = 'return' then 'return' else 'exchange_in' end, v_op);
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p -> 'outs', '[]')) loop
    select * into v from variants where id = (r ->> 'variant_id')::bigint;
    select * into pr from products where id = v.product_id;
    pr.cost_price := coalesce(v.cost_price, pr.cost_price); pr.sell_price := coalesce(v.sell_price, pr.sell_price);
    pr.min_sell_price := coalesce(v.min_sell_price, pr.min_sell_price);
    insert into adjustment_items (shop_id, adjustment_id, variant_id, product_id, product_name, variant_name, direction, qty, unit_price, cost_price)
    values (my_shop(), v_adj, v.id, pr.id, pr.name, v.name, 'out', (r ->> 'qty')::int, round((r ->> 'unit_price')::numeric, 2), pr.cost_price);
    perform _move_stock(v.id, -(r ->> 'qty')::int, 'exchange_out', v_op);
  end loop;
  perform _cash(v_cash, case when v_kind = 'return' then 'refund' else 'exchange' end, v_op, v_label || ' فاتورة #' || inv.no);
  if abs(v_debtd) > 0.005 then
    insert into customer_txns (shop_id, customer_id, amount, kind, invoice_id, note, op_id)
    values (my_shop(), inv.customer_id, v_debtd, 'return_offset', inv.id, v_label || ' فاتورة #' || inv.no, v_op);
  end if;
end $$;

create or replace function add_loss(p_variant bigint, p_free_name text, p_qty int, p_unit_cost numeric, p_reason text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text; v_cost numeric; v_pid bigint; v_op bigint;
begin
  perform require_perm('stock', 'تسجيل الهوالك');
  if coalesce(p_qty, 0) <= 0 then raise exception 'اكتب الكمية'; end if;
  if p_variant is not null then
    select _variant_label(v.id), coalesce(p_unit_cost, v.cost_price, p.cost_price), p.id into v_name, v_cost, v_pid
    from variants v join products p on p.id = v.product_id where v.id = p_variant and v.shop_id = my_shop();
    if v_name is null then raise exception 'المنتج مش موجود'; end if;
  else
    if _t(p_free_name) is null then raise exception 'اختار المنتج أو اكتب اسمه'; end if;
    if p_unit_cost is null or p_unit_cost < 0 then raise exception 'اكتب التكلفة'; end if;
    v_name := trim(p_free_name); v_cost := p_unit_cost;
  end if;
  v_op := _log('loss', 'الهوالك', 'هالك', 'تم تسجيل هالك للمنتج ' || v_name || E'\nالكمية: ' || p_qty || ' - السبب: ' || p_reason,
    _d('المنتج', v_name, 'الكمية', p_qty::text, 'التكلفة', _m(v_cost), 'الإجمالي', _m(v_cost * p_qty), 'السبب', p_reason, 'ملاحظات', _t(p_note)));
  if p_variant is not null then perform _move_stock(p_variant, -p_qty, 'loss', v_op); end if;
  insert into losses (shop_id, variant_id, product_id, product_name, qty, unit_cost, reason, note, op_id)
  values (my_shop(), p_variant, v_pid, v_name, p_qty, round(v_cost, 2), p_reason, _t(p_note), v_op);
end $$;

create or replace function undo(p_op bigint) returns void
language plpgsql security definer set search_path = public as $$
declare e activity_logs;
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
  perform _undo_core(p_op);
  -- تعديل منتج: _undo_core بترجّع الاسم والحالة، واحنا بنرجّع أسعار الأنواع كمان
  if e.action = 'product_edit' then
    update variants x set cost_price = (r ->> 'cost_price')::numeric, sell_price = (r ->> 'sell_price')::numeric,
      min_sell_price = (r ->> 'min_sell_price')::numeric
    from jsonb_array_elements(coalesce(e.snapshot -> 'variants', '[]')) r
    where x.id = (r ->> 'id')::bigint and r ? 'sell_price' and x.shop_id = my_shop();
  end if;
end $$;

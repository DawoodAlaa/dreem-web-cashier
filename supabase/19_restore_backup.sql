-- ═══════════════════════════════════════════════════════════════════
-- 19: استرجاع نسخة احتياطية (المدير بس)
-- بيمسح بيانات المحل وبيرجّعها من ملف النسخة في عملية واحدة: لو أي حاجة
-- فشلت مفيش حاجة بتتغير. المستخدمين وحساباتهم مبيتلمسوش.
-- أي جدول مش موجود في الملف (نسخة قديمة) بيفضل زي ما هو.
-- آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 18.
-- ═══════════════════════════════════════════════════════════════════

create or replace function restore_backup(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  -- الترتيب: الأب قبل الابن (الإعدادات الأول عشان تريجر متابعة الكميات)
  v_tables text[] := array[
    'app_settings', 'categories', 'products', 'variants', 'stock_moves', 'product_parts', 'compat_groups', 'compat_devices',
    'used_purchases', 'customers', 'customer_txns', 'invoices', 'invoice_items', 'adjustments', 'adjustment_items',
    'held_carts', 'losses', 'expenses', 'cash_moves', 'settlements', 'suppliers', 'purchases', 'purchase_items',
    'supplier_txns', 'offers', 'offer_items', 'activity_logs', 'salary_moves', 'shortages'];
  v_shop uuid := my_shop();
  v_src text := coalesce(p -> 'categories' -> 0 ->> 'shop_id', p -> 'products' -> 0 ->> 'shop_id');
  v_last text;
  v_rows jsonb;
  v_seq text;
  v_max bigint;
  v_out jsonb := '{}';
  t text;
  i int;
begin
  if not is_owner() then raise exception 'المدير بس اللي يقدر يسترجع نسخة'; end if;
  if p ->> 'format' is distinct from 'cashier-cloud-backup-v1'
     or jsonb_typeof(p -> 'products') is distinct from 'array'
     or jsonb_typeof(p -> 'invoices') is distinct from 'array' then
    raise exception 'الملف ده مش نسخة احتياطية من البرنامج';
  end if;
  if v_src is not null and v_src::uuid <> v_shop and exists (select 1 from shops where id = v_src::uuid) then
    raise exception 'النسخة دي بتاعة محل تاني';
  end if;
  select value into v_last from app_settings where shop_id = v_shop and key = 'last_cloud_backup';

  begin
    for i in reverse array_upper(v_tables, 1)..1 loop
      t := v_tables[i];
      if p ? t then execute format('delete from %I where shop_id = $1', t) using v_shop; end if;
    end loop;

    foreach t in array v_tables loop
      continue when not p ? t;
      select coalesce(jsonb_agg(e || jsonb_build_object('shop_id', v_shop)), '[]') into v_rows from jsonb_array_elements(p -> t) e;
      if t = 'salary_moves' then
        -- اللي اتمسح حسابه: السحب بيفضل باسمه من غير ربط بالحساب
        select coalesce(jsonb_agg(case when exists (select 1 from profiles x where x.id::text = e ->> 'person_id') then e else e || '{"person_id": null}' end), '[]')
        into v_rows from jsonb_array_elements(v_rows) e;
      end if;
      execute format('insert into %I overriding system value select * from jsonb_populate_recordset(null::%I, $1)', t, t) using v_rows;
      v_out := v_out || jsonb_build_object(t, jsonb_array_length(v_rows));
      -- عدّاد الأرقام ميرجعش ورا (مهم لو النسخة بترجع على سيرفر جديد)
      if t <> 'app_settings' then
        v_seq := pg_get_serial_sequence(t, 'id');
        execute format('select greatest((select last_value from %s), coalesce((select max(id) from %I), 1))', v_seq, t) into v_max;
        perform setval(v_seq, v_max);
      end if;
    end loop;
  exception when others then
    raise exception 'ملف النسخة ناقص أو بايظ، ومفيش حاجة اتغيرت (%)', sqlerrm;
  end;

  if v_last is not null then
    insert into app_settings (shop_id, key, value) values (v_shop, 'last_cloud_backup', v_last)
    on conflict (shop_id, key) do update set value = excluded.value;
  end if;
  perform _log('restore', 'النظام', 'استرجاع نسخة احتياطية', 'تم استرجاع نسخة احتياطية بتاريخ ' || coalesce(left(p ->> 'created_at', 10), '-'),
    _d('تاريخ النسخة', left(p ->> 'created_at', 10), 'المنتجات', (v_out ->> 'products'), 'الفواتير', (v_out ->> 'invoices')), false);
  return v_out;
end $$;

revoke execute on function restore_backup(jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function restore_backup(jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function restore_backup(jsonb) to authenticated';
  end if;
end $$;

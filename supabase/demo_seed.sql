-- ═══════════════════════════════════════════════════════════════════
-- بيانات تجريبية لمحل "ديمو" (محل منفصل للتجربة)
-- بيشتغل باسم صاحب محل "ديمو" وكل حاجة بتعدّي من دوال البرنامج نفسها،
-- فمش بيلمس أي محل تاني. بيرفض يشتغل لو المحل مش موجود أو فيه منتجات بالفعل.
-- ═══════════════════════════════════════════════════════════════════
do $$
declare
  v_shop uuid; v_owner uuid; n int;
  c_phone bigint; c_charger bigint; c_head bigint; c_screen bigint; c_case bigint; c_cable bigint;
  p_a15 bigint; p_ip13 bigint; p_redmi bigint; p_ch25 bigint; p_ch20 bigint; p_buds bigint; p_wire bigint;
  p_scr14 bigint; p_scrA15 bigint; p_case13 bigint; p_cable bigint;
  c_ahmed bigint; c_karim bigint; s_main bigint;
  vid jsonb;
begin
  select count(*) into n from shops where name = 'ديمو';
  if n <> 1 then raise exception 'لازم يبقى في محل واحد اسمه "ديمو" (لقيت %)', n; end if;
  select s.id, pf.id into v_shop, v_owner from shops s join profiles pf on pf.shop_id = s.id and pf.role = 'owner'
  where s.name = 'ديمو' order by pf.created_at limit 1;
  if v_owner is null then raise exception 'محل ديمو ملوش صاحب'; end if;
  if v_shop = 'd6b436c8-98e7-4bea-8b1f-267b0b60e105' then raise exception 'ده محل Dreem Phone!'; end if;
  if exists (select 1 from products where shop_id = v_shop) then raise exception 'محل ديمو فيه منتجات بالفعل'; end if;

  -- نشتغل باسم صاحب محل ديمو
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('test.uid', v_owner::text, true);
  if my_shop() is distinct from v_shop then raise exception 'مش شغال باسم صاحب محل ديمو'; end if;

  select id into c_phone from categories where shop_id = v_shop and name = 'موبايلات';
  select id into c_charger from categories where shop_id = v_shop and name = 'شواحن';
  select id into c_head from categories where shop_id = v_shop and name = 'سماعات';
  select id into c_screen from categories where shop_id = v_shop and name = 'اسكرينات';
  select id into c_case from categories where shop_id = v_shop and name = 'جرابات';
  select id into c_cable from categories where shop_id = v_shop and name = 'كابلات';

  perform deposit(5000, 'فلوس أول اليوم');

  -- ───── المنتجات ─────
  p_a15 := add_product(jsonb_build_object('category_id', c_phone, 'name', 'Samsung Galaxy A15 128GB', 'cost', 6500, 'sell', 7200, 'min_sell', 7000, 'min_stock', 1,
    'variants', jsonb_build_array(jsonb_build_object('name', 'أسود', 'stock', 2), jsonb_build_object('name', 'أزرق', 'stock', 1))));
  p_ip13 := add_product(jsonb_build_object('category_id', c_phone, 'name', 'iPhone 13 128GB', 'cost', 22000, 'sell', 24500, 'min_sell', 24000, 'min_stock', 1,
    'variants', jsonb_build_array(jsonb_build_object('name', null, 'stock', 1))));
  p_redmi := add_product(jsonb_build_object('category_id', c_phone, 'name', 'Redmi Note 13 256GB', 'cost', 7800, 'sell', 8600, 'min_sell', 8400, 'min_stock', 1,
    'variants', jsonb_build_array(jsonb_build_object('name', null, 'stock', 0))));
  p_ch25 := add_product(jsonb_build_object('category_id', c_charger, 'name', 'شاحن سامسونج 25W أصلي', 'cost', 180, 'sell', 300, 'min_sell', 250, 'min_stock', 3,
    'variants', jsonb_build_array(jsonb_build_object('name', null, 'stock', 6))));
  p_ch20 := add_product(jsonb_build_object('category_id', c_charger, 'name', 'شاحن آيفون 20W', 'cost', 220, 'sell', 400, 'min_sell', 330, 'min_stock', 3,
    'variants', jsonb_build_array(jsonb_build_object('name', null, 'stock', 2))));
  p_cable := add_product(jsonb_build_object('category_id', c_cable, 'name', 'وصلة تايب سي', 'cost', 30, 'sell', 75, 'min_sell', 50, 'min_stock', 5,
    'variants', jsonb_build_array(jsonb_build_object('name', '1 متر', 'stock', 12), jsonb_build_object('name', '2 متر', 'stock', 5, 'cost', 45, 'sell', 100, 'min_sell', 75))));
  p_buds := add_product(jsonb_build_object('category_id', c_head, 'name', 'AirPods Pro (هاي كوبي)', 'cost', 350, 'sell', 650, 'min_sell', 550, 'min_stock', 2,
    'variants', jsonb_build_array(jsonb_build_object('name', null, 'stock', 4))));
  p_wire := add_product(jsonb_build_object('category_id', c_head, 'name', 'سماعة سلك سامسونج', 'cost', 40, 'sell', 100, 'min_sell', 70,
    'variants', jsonb_build_array(jsonb_build_object('name', null, 'stock', 0, 'uncounted', true))));
  -- اسكرينة بنوعين: عادي بسعر المنتج، ومستورد بسعره
  p_scr14 := add_product(jsonb_build_object('category_id', c_screen, 'name', 'اسكرينة iPhone 14 Pro', 'cost', 50, 'sell', 150, 'min_sell', 100, 'min_stock', 3,
    'variants', jsonb_build_array(jsonb_build_object('name', 'عادي', 'stock', 10),
      jsonb_build_object('name', 'برايفسي', 'stock', 6, 'cost', 50, 'sell', 150, 'min_sell', 100),
      jsonb_build_object('name', 'مستورد', 'stock', 4, 'cost', 120, 'sell', 250, 'min_sell', 200))));
  p_scrA15 := add_product(jsonb_build_object('category_id', c_screen, 'name', 'اسكرينة Samsung A15', 'cost', 17, 'sell', 50, 'min_sell', 20, 'min_stock', 5,
    'variants', jsonb_build_array(jsonb_build_object('name', 'شفاف', 'stock', 15), jsonb_build_object('name', 'برايفسي', 'stock', 3, 'cost', 20))));
  p_case13 := add_product(jsonb_build_object('category_id', c_case, 'name', 'جراب سيليكون iPhone 13', 'cost', 40, 'sell', 120, 'min_sell', 80, 'min_stock', 2,
    'variants', jsonb_build_array(jsonb_build_object('name', 'أسود', 'stock', 5), jsonb_build_object('name', 'أحمر', 'stock', 1), jsonb_build_object('name', 'شفاف', 'stock', 0))));

  -- ───── العملاء والتجار ─────
  c_ahmed := customer_save(null, 'أحمد محمود', '01012345678', null);
  c_karim := customer_save(null, 'كريم سعيد', '01198765432', 'زبون دايم');
  s_main := supplier_save(null, 'مخزن النور للإكسسوارات', '01234567890', null);

  -- ───── مبيعات ─────
  perform complete_sale(jsonb_build_object('discount', 0, 'paid', 450, 'lines', jsonb_build_array(
    jsonb_build_object('variant_id', (select id from variants where product_id = p_ch20), 'qty', 1, 'unit_price', 400),
    jsonb_build_object('variant_id', (select id from variants where product_id = p_scrA15 and name = 'شفاف'), 'qty', 1, 'unit_price', 50))));
  perform complete_sale(jsonb_build_object('discount', 0, 'paid', 250, 'lines', jsonb_build_array(
    jsonb_build_object('variant_id', (select id from variants where product_id = p_scr14 and name = 'مستورد'), 'qty', 1, 'unit_price', 250))));
  perform complete_sale(jsonb_build_object('discount', 50, 'paid', 7150, 'customer_id', c_karim, 'lines', jsonb_build_array(
    jsonb_build_object('variant_id', (select id from variants where product_id = p_a15 and name = 'أسود'), 'qty', 1, 'unit_price', 7200))));
  -- بيع آجل: أحمد دفع 400 والباقي عليه
  perform complete_sale(jsonb_build_object('discount', 0, 'paid', 400, 'customer_id', c_ahmed, 'lines', jsonb_build_array(
    jsonb_build_object('variant_id', (select id from variants where product_id = p_buds), 'qty', 1, 'unit_price', 650),
    jsonb_build_object('variant_id', (select id from variants where product_id = p_case13 and name = 'أسود'), 'qty', 1, 'unit_price', 120))));
  perform complete_sale(jsonb_build_object('discount', 0, 'paid', 300, 'lines', jsonb_build_array(
    jsonb_build_object('variant_id', (select id from variants where product_id = p_ch25), 'qty', 1, 'unit_price', 300))));
  perform complete_sale(jsonb_build_object('discount', 0, 'paid', 250, 'lines', jsonb_build_array(
    jsonb_build_object('variant_id', (select id from variants where product_id = p_cable and name = '1 متر'), 'qty', 2, 'unit_price', 75),
    jsonb_build_object('variant_id', (select id from variants where product_id = p_cable and name = '2 متر'), 'qty', 1, 'unit_price', 100))));

  -- ───── مشتريات (جزء منها آجل للتاجر) ─────
  perform create_purchase(jsonb_build_object('supplier_id', s_main, 'paid', 500, 'lines', jsonb_build_array(
    jsonb_build_object('variant_id', (select id from variants where product_id = p_ch25), 'qty', 4, 'unit_cost', 180),
    jsonb_build_object('variant_id', (select id from variants where product_id = p_case13 and name = 'أحمر'), 'qty', 4, 'unit_cost', 40))));

  -- ───── مصاريف ─────
  perform add_expense('شاي وقهوة', 'نثريات', 60, now(), null);
  perform add_expense('كهربا', 'كهرباء ومياه', 350, now(), 'فاتورة الشهر');

  -- ───── المرتبات ─────
  perform salary_fund_add(500, 'يومية النهارده');
  perform salary_withdraw(null, 'محمد (موظف)', 200, 'سلفة');
  perform salary_withdraw(null, null, 150, null);

  -- ───── النواقص ─────
  perform shortage_add(p_redmi, null, 'الزباين بتسأل عليه');
  perform shortage_add(null, 'شاحن أنكر 20W', null);
end $$;

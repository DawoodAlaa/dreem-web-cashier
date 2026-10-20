// بيبني supabase/14_variant_prices.sql من دوال السيرفر الأصلية نفسها + تعديلات صغيرة محددة
import { readFileSync, writeFileSync } from 'node:fs'

const OLD = 'C:/Users/Asus/Downloads/Cashier Dreem/supabase/'
const NEW = 'C:/Users/Asus/Downloads/Dreem Web Cashier/supabase/'
const src = (f) => readFileSync(OLD + f, 'utf8').replace(/\r\n/g, '\n')

function fn(file, name) {
  const s = src(file)
  const start = s.indexOf(`create or replace function ${name}(`)
  if (start < 0) throw new Error(`مش لاقي ${name}`)
  const end = s.indexOf('end $$;', start)
  return s.slice(start, end + 'end $$;'.length)
}
function rep(text, a, b, times = 1) {
  const n = text.split(a).length - 1
  if (n !== times) throw new Error(`متوقع ${times} مرة ولقيت ${n}: ${a.slice(0, 80)}`)
  return text.split(a).join(b)
}

// السعر الفعلي للنوع: سعر النوع لو موجود، غير كده سعر المنتج
const OVERRIDE = `select * into pr from products where id = v.product_id;
    pr.cost_price := coalesce(v.cost_price, pr.cost_price); pr.sell_price := coalesce(v.sell_price, pr.sell_price);
    pr.min_sell_price := coalesce(v.min_sell_price, pr.min_sell_price);`

let validate = fn('03_products.sql', '_validate_product')
validate = rep(
  validate,
  `  if (select count(distinct x) from unnest(names) x) < (select count(x) from unnest(names) x) then
    raise exception 'في متغيرين بنفس الاسم';
  end if;
end $$;`,
  `  if (select count(distinct x) from unnest(names) x) < (select count(x) from unnest(names) x) then
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
end $$;`,
)

let insertProduct = fn('03_products.sql', '_insert_product')
insertProduct = rep(
  insertProduct,
  `    insert into variants (shop_id, product_id, name, uncounted)
    values (my_shop(), v_pid, case when n = 1 and _t(v ->> 'name') is null then null else _t(v ->> 'name') end, v_unc)`,
  `    insert into variants (shop_id, product_id, name, uncounted, cost_price, sell_price, min_sell_price)
    values (my_shop(), v_pid, case when n = 1 and _t(v ->> 'name') is null then null else _t(v ->> 'name') end, v_unc,
      round((v ->> 'cost')::numeric, 2), round((v ->> 'sell')::numeric, 2), round((v ->> 'min_sell')::numeric, 2))`,
)

let editProduct = fn('03_products.sql', 'edit_product')
editProduct = rep(
  editProduct,
  `jsonb_build_object('id', id, 'name', name, 'archived', archived)`,
  `jsonb_build_object('id', id, 'name', name, 'archived', archived, 'cost_price', cost_price, 'sell_price', sell_price, 'min_sell_price', min_sell_price)`,
)
editProduct = rep(
  editProduct,
  `      update variants set name = v_name, archived = false where id = ov.id;`,
  `      update variants set name = v_name, archived = false, cost_price = round((vi ->> 'cost')::numeric, 2),
        sell_price = round((vi ->> 'sell')::numeric, 2), min_sell_price = round((vi ->> 'min_sell')::numeric, 2) where id = ov.id;`,
)
editProduct = rep(
  editProduct,
  `      insert into variants (shop_id, product_id, name, uncounted) values (my_shop(), p_id, v_name, v_unc) returning id into v_vid;`,
  `      insert into variants (shop_id, product_id, name, uncounted, cost_price, sell_price, min_sell_price)
      values (my_shop(), p_id, v_name, v_unc, round((vi ->> 'cost')::numeric, 2), round((vi ->> 'sell')::numeric, 2),
        round((vi ->> 'min_sell')::numeric, 2)) returning id into v_vid;`,
)

let sale = fn('04_sales.sql', 'complete_sale')
sale = rep(sale, 'select * into pr from products where id = v.product_id;', OVERRIDE, 2)

let adjust = fn('04_sales.sql', 'create_adjustment')
adjust = rep(adjust, 'select * into pr from products where id = v.product_id;', OVERRIDE, 2)

let loss = fn('05_money.sql', 'add_loss')
loss = rep(loss, 'coalesce(p_unit_cost, p.cost_price)', 'coalesce(p_unit_cost, v.cost_price, p.cost_price)')

// undo: نفس 12 بالظبط + بعد التراجع عن "تعديل منتج" بنرجّع أسعار الأنواع
let undo = readFileSync(NEW + '12_salaries.sql', 'utf8').replace(/\r\n/g, '\n')
{
  const start = undo.indexOf('create or replace function undo(')
  undo = undo.slice(start, undo.indexOf('end $$;', start) + 'end $$;'.length)
}
undo = rep(
  undo,
  `  perform _undo_core(p_op);
end $$;`,
  `  perform _undo_core(p_op);
  -- تعديل منتج: _undo_core بترجّع الاسم والحالة، واحنا بنرجّع أسعار الأنواع كمان
  if e.action = 'product_edit' then
    update variants x set cost_price = (r ->> 'cost_price')::numeric, sell_price = (r ->> 'sell_price')::numeric,
      min_sell_price = (r ->> 'min_sell_price')::numeric
    from jsonb_array_elements(coalesce(e.snapshot -> 'variants', '[]')) r
    where x.id = (r ->> 'id')::bigint and r ? 'sell_price' and x.shop_id = my_shop();
  end if;
end $$;`,
)

const out = `-- ═══════════════════════════════════════════════════════════════════
-- 14: كل نوع (متغير) في المنتج ممكن يبقى ليه سعر مختلف
-- variants.cost_price / sell_price / min_sell_price — لو فاضية النوع بياخد سعر المنتج.
-- الدوال هنا نسخة من الأصلية (03 / 04 / 05) بالظبط ومعدّل فيها بس الأماكن اللي بتقرا السعر:
-- البيع والمرتجع والاستبدال والهالك بيستخدموا سعر النوع، وإضافة/تعديل المنتج بيحفظوا أسعار الأنواع.
-- اتولّد بـ scripts/sql (build14). آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 13.
-- ═══════════════════════════════════════════════════════════════════

alter table variants add column if not exists cost_price numeric(14, 2);
alter table variants add column if not exists sell_price numeric(14, 2);
alter table variants add column if not exists min_sell_price numeric(14, 2);

${validate}

${insertProduct}

${editProduct}

${sale}

${adjust}

${loss}

${undo}
`
writeFileSync(NEW + '14_variant_prices.sql', out)
console.log('ok', out.length)

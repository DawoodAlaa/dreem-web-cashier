-- ═══════════════════════════════════════════════════════════════════
-- 15: متابعة الكميات (تشغيل / إيقاف) لكل محل
-- لما تتقفل (app_settings.track_stock = '0'):
--   - كل الأنواع بتبقى "مش متجردة" (uncounted)، فالبيع والاستبدال مش بيتقيدوا بالكمية.
--   - أي نوع جديد أو جرد بيفضل uncounted (trigger)، فمفيش كمية بترجع لوحدها.
--   - الفواتير والهالك والتقارير بتسجل عدد القطع عادي.
-- لما تتشغل تاني: المنتجات بتفضل "لسه متجردش" لحد ما تتجرد (الجرد الأولاني).
-- آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 14.
-- ═══════════════════════════════════════════════════════════════════

create or replace function _variants_track_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from app_settings where shop_id = new.shop_id and key = 'track_stock' and value = '0') then
    new.uncounted := true;
  end if;
  return new;
end $$;

drop trigger if exists variants_track_stock on variants;
create trigger variants_track_stock before insert or update of uncounted on variants
for each row execute function _variants_track_stock();

-- تشغيل / إيقاف متابعة الكميات. بيرجع عدد الأنواع اللي اتحولت لـ "مش متجردة"
create or replace function set_track_stock(p_on boolean) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  perform require_perm('settings', 'الإعدادات');
  if p_on is null then raise exception 'اختار تشغيل أو إيقاف'; end if;
  insert into app_settings (shop_id, key, value) values (my_shop(), 'track_stock', case when p_on then '1' else '0' end)
  on conflict (shop_id, key) do update set value = excluded.value;
  if not p_on then
    update variants set uncounted = true where shop_id = my_shop() and not uncounted;
    get diagnostics n = row_count;
  end if;
  perform _log('settings', 'الإعدادات',
    case when p_on then 'تشغيل متابعة الكميات' else 'إيقاف متابعة الكميات' end,
    case when p_on then 'تم تشغيل متابعة الكميات. المنتجات محتاجة جرد أولاني'
         else 'تم إيقاف متابعة الكميات. البيع مش بيتقيد بالكمية، والفواتير والهالك بيسجلوا عدد القطع' end,
    null, false);
  return n;
end $$;

revoke execute on function _variants_track_stock() from public;
revoke execute on function set_track_stock(boolean) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function _variants_track_stock() from anon, authenticated';
    execute 'revoke execute on function set_track_stock(boolean) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function set_track_stock(boolean) to authenticated';
  end if;
end $$;

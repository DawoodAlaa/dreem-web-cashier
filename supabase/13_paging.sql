-- ═══════════════════════════════════════════════════════════════════
-- 13: الأداء — الفواتير والسجل بقوا بيتحمّلوا صفحة صفحة
-- الأرقام الإجمالية والقوايم بتتحسب على السيرفر عشان تفضل صح للفترة كلها
-- من غير ما الموبايل يحمّل كل الفواتير.
-- آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 12.
-- ═══════════════════════════════════════════════════════════════════

-- إجماليات الفواتير في فترة: العدد، الصافي (بعد المرتجع والاستبدال)، والملغي
create or replace function invoices_summary(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  with inv as (
    select id, total, voided from invoices
    where shop_id = my_shop() and created_at >= p_from and created_at < p_to
      and (has_perm('sell') or has_perm('returns'))
  ),
  adj as (
    select coalesce(sum(a.out_total - a.in_total), 0) as diff
    from adjustments a join inv on inv.id = a.invoice_id
    where not a.voided and not inv.voided
  )
  select jsonb_build_object(
    'count', (select count(*) from inv where not voided),
    'voided', (select count(*) from inv where voided),
    'net', round((select coalesce(sum(total), 0) from inv where not voided) + (select diff from adj), 2)
  )
$$;

-- الأقسام وأنواع العمليات اللي في السجل في فترة (لفلاتر صفحة السجل)
create or replace function log_facets(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('section', section, 'title', title, 'n', n) order by section, title), '[]')
  from (
    select section, title, count(*) n from activity_logs
    where shop_id = my_shop() and created_at >= p_from and created_at < p_to and has_perm('log')
    group by section, title
  ) x
$$;

create index if not exists invoices_shop_no on invoices (shop_id, no);
create index if not exists adjustments_invoice_live on adjustments (invoice_id) where not voided;

revoke execute on function invoices_summary(timestamptz, timestamptz) from public;
revoke execute on function log_facets(timestamptz, timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function invoices_summary(timestamptz, timestamptz) from anon';
    execute 'revoke execute on function log_facets(timestamptz, timestamptz) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function invoices_summary(timestamptz, timestamptz) to authenticated';
    execute 'grant execute on function log_facets(timestamptz, timestamptz) to authenticated';
  end if;
end $$;

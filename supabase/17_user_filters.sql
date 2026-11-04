-- ═══════════════════════════════════════════════════════════════════
-- 17: فلتر بالموظف في الفواتير والسجل
-- invoices_by_user: كل موظف باع كام في الفترة (نفس حساب invoices_summary)
-- log_users: مين ليه عمليات في السجل في الفترة
-- آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 16.
-- ═══════════════════════════════════════════════════════════════════

create or replace function invoices_by_user(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  with inv as (
    select id, total, voided, user_name from invoices
    where shop_id = my_shop() and created_at >= p_from and created_at < p_to and user_name is not null
      and (has_perm('sell') or has_perm('returns'))
  ),
  adj as (
    select a.invoice_id, sum(a.out_total - a.in_total) as diff
    from adjustments a join inv on inv.id = a.invoice_id
    where not a.voided and not inv.voided
    group by a.invoice_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('name', user_name, 'count', n, 'voided', v, 'net', net) order by user_name), '[]')
  from (
    select i.user_name,
      count(*) filter (where not i.voided) as n,
      count(*) filter (where i.voided) as v,
      round(coalesce(sum(i.total + coalesce(adj.diff, 0)) filter (where not i.voided), 0), 2) as net
    from inv i left join adj on adj.invoice_id = i.id
    group by i.user_name
  ) x
$$;

create or replace function log_users(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', user_name, 'n', n) order by user_name), '[]')
  from (
    select user_name, count(*) n from activity_logs
    where shop_id = my_shop() and created_at >= p_from and created_at < p_to and user_name is not null and has_perm('log')
    group by user_name
  ) x
$$;

revoke execute on function invoices_by_user(timestamptz, timestamptz) from public;
revoke execute on function log_users(timestamptz, timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function invoices_by_user(timestamptz, timestamptz) from anon';
    execute 'revoke execute on function log_users(timestamptz, timestamptz) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function invoices_by_user(timestamptz, timestamptz) to authenticated';
    execute 'grant execute on function log_users(timestamptz, timestamptz) to authenticated';
  end if;
end $$;

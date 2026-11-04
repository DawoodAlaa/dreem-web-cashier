-- ═══════════════════════════════════════════════════════════════════
-- 18: مسح مستخدم من المحل (المدير بس)
-- الحساب بيتمسح نهائي واسم المستخدم بيرجع متاح. الفواتير والسجل بيفضلوا
-- باسمه لأن الاسم متسجل مع كل عملية.
-- آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 17.
-- ═══════════════════════════════════════════════════════════════════

create or replace function delete_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v profiles;
begin
  if not is_owner() then raise exception 'المدير بس اللي يقدر يمسح مستخدم'; end if;
  select * into v from profiles where id = p_user and shop_id = my_shop();
  if not found then raise exception 'المستخدم مش موجود'; end if;
  if v.role = 'owner' then raise exception 'مينفعش تمسح حساب المدير'; end if;
  perform _log('member', 'النظام', 'مسح مستخدم', 'تم مسح حساب ' || v.name, _d('المستخدم', v.name, 'اسم المستخدم', v.username), false);
  delete from auth.users where id = p_user;
end $$;

revoke execute on function delete_member(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function delete_member(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function delete_member(uuid) to authenticated';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- 12: المرتبات — درج تاني للمرتبات
-- - تحويل من الدرج: الفلوس بتخرج من الدرج الأساسي (cash_moves: salary_fund) وبتدخل صندوق المرتبات.
--   ده مش مصروف، الفلوس بس اتنقلت.
-- - سحب مرتب: بيخرج من صندوق المرتبات بس، وبيتسجل مصروف "رواتب" (عشان تقرير الأرباح) من غير ما يلمس الدرج.
-- - الاتنين بيتسجلوا في السجل وينفع يتعمل لهم تراجع.
-- الصلاحية: "salaries" للتحويل وتسجيل سحب لأي حد. أي موظف مفعّل يقدر يسجل سحب لنفسه.
-- آمن يتنفذ أكتر من مرة. بيتنفذ بعد 01 … 11.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists salary_moves (
  id bigint generated always as identity primary key,
  shop_id uuid not null default my_shop() references shops on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  amount numeric(14, 2) not null check (amount > 0),
  person_id uuid references profiles on delete set null,
  person_name text,
  note text,
  user_name text,
  op_id bigint not null,
  voided boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists salary_moves_shop on salary_moves (shop_id, created_at desc);
create index if not exists salary_moves_op on salary_moves (op_id);

alter table salary_moves enable row level security;
drop policy if exists shop_read on salary_moves;
create policy shop_read on salary_moves for select using (shop_id = my_shop());

create or replace function salary_balance() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(case when kind = 'in' then amount else -amount end), 2), 0)
  from salary_moves where shop_id = my_shop() and not voided
$$;

-- تحويل من الدرج لصندوق المرتبات
create or replace function salary_fund_add(p_amount numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_op bigint; v_drawer numeric;
begin
  perform require_perm('salaries', 'المرتبات');
  if coalesce(p_amount, 0) <= 0 then raise exception 'اكتب المبلغ'; end if;
  perform pg_advisory_xact_lock(hashtext(my_shop()::text || ':drawer'));
  v_drawer := cash_balance();
  if p_amount > v_drawer + 0.005 then
    raise exception 'المبلغ في الدرج (%) أقل من المبلغ اللي عايز تحوّله', _m(v_drawer);
  end if;
  v_op := _log('salary_in', 'المرتبات', 'تحويل للمرتبات',
    'تم تحويل ' || _m(p_amount) || ' من الدرج لصندوق المرتبات' || coalesce(E'\n' || _t(p_note), ''),
    _d('المبلغ', _m(p_amount), 'رصيد المرتبات بعد', _m(salary_balance() + p_amount), 'ملاحظات', _t(p_note)));
  insert into salary_moves (shop_id, kind, amount, note, user_name, op_id)
  values (my_shop(), 'in', round(p_amount, 2), _t(p_note), _me_name(), v_op);
  perform _cash(-p_amount, 'salary_fund', v_op, 'تحويل للمرتبات');
end $$;

-- سحب من صندوق المرتبات. p_person = الموظف (null = نفسي)، أو p_person_name لحد مش في المستخدمين
create or replace function salary_withdraw(p_person uuid, p_person_name text, p_amount numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_op bigint; v_bal numeric; v_pid uuid; v_name text;
begin
  if my_shop() is null then raise exception 'حسابك لسه مش متفعّل. استنى المدير يفعّله'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'اكتب المبلغ'; end if;
  if p_person is null and _t(p_person_name) is null then
    v_pid := auth.uid();
  else
    v_pid := p_person;
  end if;
  if v_pid is not null then
    select name into v_name from profiles where id = v_pid and shop_id = my_shop();
    if v_name is null then raise exception 'الموظف ده مش في المحل'; end if;
  else
    v_name := _t(p_person_name);
  end if;
  -- السحب لحد تاني محتاج صلاحية المرتبات
  if v_pid is distinct from auth.uid() then perform require_perm('salaries', 'تسجيل سحب لموظف تاني'); end if;
  perform pg_advisory_xact_lock(hashtext(my_shop()::text || ':salaries'));
  v_bal := salary_balance();
  if p_amount > v_bal + 0.005 then raise exception 'رصيد المرتبات (%) أقل من المبلغ', _m(v_bal); end if;
  v_op := _log('salary_out', 'المرتبات', 'سحب مرتب',
    'تم سحب ' || _m(p_amount) || ' من المرتبات لـ ' || v_name || coalesce(E'\n' || _t(p_note), ''),
    _d('الموظف', v_name, 'المبلغ', _m(p_amount), 'رصيد المرتبات بعد', _m(v_bal - p_amount), 'ملاحظات', _t(p_note)));
  insert into salary_moves (shop_id, kind, amount, person_id, person_name, note, user_name, op_id)
  values (my_shop(), 'out', round(p_amount, 2), v_pid, v_name, _t(p_note), _me_name(), v_op);
  -- مصروف "رواتب" عشان تقرير الأرباح (من غير ما يلمس الدرج)
  insert into expenses (shop_id, title, category, amount, date, note, op_id)
  values (my_shop(), 'مرتب ' || v_name, 'رواتب', round(p_amount, 2), now(), coalesce(_t(p_note), 'من صندوق المرتبات'), v_op);
end $$;

-- التراجع: undo بتتعامل مع "حذف منتجات" (10) و"المرتبات"، وأي عملية تانية بتروح لـ _undo_core
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
end $$;

-- الصلاحيات
revoke execute on function salary_balance() from public;
revoke execute on function salary_fund_add(numeric, text) from public;
revoke execute on function salary_withdraw(uuid, text, numeric, text) from public;
revoke execute on function undo(bigint) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table salary_moves from anon';
    execute 'revoke insert, update, delete, truncate on table salary_moves from authenticated';
    execute 'revoke execute on function salary_balance() from anon';
    execute 'revoke execute on function salary_fund_add(numeric, text) from anon';
    execute 'revoke execute on function salary_withdraw(uuid, text, numeric, text) from anon';
    execute 'revoke execute on function undo(bigint) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on table salary_moves to authenticated';
    execute 'grant execute on function salary_balance() to authenticated';
    execute 'grant execute on function salary_fund_add(numeric, text) to authenticated';
    execute 'grant execute on function salary_withdraw(uuid, text, numeric, text) to authenticated';
    execute 'grant execute on function undo(bigint) to authenticated';
  end if;
end $$;

-- التحديث اللحظي
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'salary_moves') then
    alter publication supabase_realtime add table salary_moves;
  end if;
end $$;

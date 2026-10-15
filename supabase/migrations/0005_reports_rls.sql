-- ═══════════════════════════════════════════════════════════════════
-- العروض والتقارير وسياسات أمان الصفوف (RLS)
-- القيد المعكوس يبقى أثره في الأرصدة لأن قيد العكس يقابله؛ لذلك «المرحّل» = كل ما ليس مسودة.
-- ═══════════════════════════════════════════════════════════════════

create or replace view public.v_posted_lines with (security_invoker = on) as
select l.*, e.entry_date, e.doc_type, e.number_text, e.memo as entry_memo, e.reference, e.status as entry_status, e.posted_at
  from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
 where e.status <> 'draft';

create or replace view public.v_cash_balances with (security_invoker = on) as
select c.*, a.code as account_code,
       coalesce(s.balance_fc, 0) as balance_fc,
       coalesce(s.balance_base, 0) as balance_base,
       s.last_date
  from public.cash_accounts c
  join public.accounts a on a.id = c.account_id
  left join lateral (
    select sum(l.debit_fc - l.credit_fc) as balance_fc, sum(l.debit - l.credit) as balance_base, max(l.entry_date) as last_date
      from public.v_posted_lines l where l.account_id = c.account_id) s on true;

-- رصيد صافٍ واحد لكل طرف (على حسابات الميزانية فقط): موجب = له عندي/عليه لي، سالب = عليّ له
create or replace view public.v_party_balances with (security_invoker = on) as
select p.id as party_id, p.book_id, p.name, p.kind, p.phone, p.relation, p.is_active,
       coalesce(sum(case when a.type = 'asset' then l.debit - l.credit end), 0) as receivable,
       coalesce(sum(case when a.type in ('liability','equity') then l.credit - l.debit end), 0) as payable,
       coalesce(sum(case when a.type in ('asset','liability','equity') then l.debit - l.credit end), 0) as net,
       max(l.entry_date) as last_date
  from public.parties p
  left join public.v_posted_lines l on l.party_id = p.id
  left join public.accounts a on a.id = l.account_id
 group by p.id;

-- توزيع المدفوع على الأقساط بالأقدم أولاً
create or replace view public.v_installments with (security_invoker = on) as
with paid as (
  select dp.debt_id, sum(dp.amount) as total
    from public.debt_payments dp join public.journal_entries x on x.id = dp.entry_id
   where x.status = 'posted' group by dp.debt_id
), cum as (
  select i.*, sum(i.amount) over (partition by i.debt_id order by i.due_date, i.seq) as cum_amount
    from public.debt_installments i
)
select c.id, c.debt_id, c.book_id, c.seq, c.due_date, c.amount, c.note,
       least(c.amount, greatest(0, coalesce(p.total,0) - (c.cum_amount - c.amount))) as paid,
       case
         when least(c.amount, greatest(0, coalesce(p.total,0) - (c.cum_amount - c.amount))) >= c.amount then 'paid'
         when c.due_date < current_date then 'overdue'
         when least(c.amount, greatest(0, coalesce(p.total,0) - (c.cum_amount - c.amount))) > 0 then 'partial'
         else 'upcoming' end as state
  from cum c left join paid p on p.debt_id = c.debt_id;

create or replace view public.v_debts with (security_invoker = on) as
select d.*, p.name as party_name, p.phone as party_phone,
       coalesce(pay.paid, 0) as paid,
       d.principal - coalesce(pay.paid, 0) as remaining,
       round((d.principal - coalesce(pay.paid, 0)) * d.fx_rate, 2) as remaining_base,
       nx.due_date as next_due_date, nx.remaining as next_due_amount,
       coalesce(od.overdue, 0) as overdue_amount
  from public.debts d
  join public.parties p on p.id = d.party_id
  left join lateral (
    select sum(dp.amount) as paid from public.debt_payments dp
      join public.journal_entries x on x.id = dp.entry_id
     where dp.debt_id = d.id and x.status = 'posted') pay on true
  left join lateral (
    select i.due_date, i.amount - i.paid as remaining from public.v_installments i
     where i.debt_id = d.id and i.paid < i.amount order by i.due_date, i.seq limit 1) nx on true
  left join lateral (
    select sum(i.amount - i.paid) as overdue from public.v_installments i
     where i.debt_id = d.id and i.paid < i.amount and i.due_date < current_date) od on true;

-- ───────────── ميزان المراجعة (على الحسابات التفصيلية؛ التجميع للأب في الواجهة) ─────────────
create or replace function public.report_trial_balance(p_book uuid, p_from date default null, p_to date default null)
returns table (account_id uuid, opening numeric, debit numeric, credit numeric, closing numeric)
language sql stable security invoker set search_path = public as $$
  select l.account_id,
         coalesce(sum(l.debit - l.credit) filter (where p_from is not null and l.entry_date < p_from), 0),
         coalesce(sum(l.debit) filter (where (p_from is null or l.entry_date >= p_from)), 0),
         coalesce(sum(l.credit) filter (where (p_from is null or l.entry_date >= p_from)), 0),
         coalesce(sum(l.debit - l.credit), 0)
    from public.v_posted_lines l
   where l.book_id = p_book and (p_to is null or l.entry_date <= p_to)
   group by l.account_id
$$;

-- ───────────── كشف حساب (حساب و/أو طرف و/أو مركز تكلفة) مع رصيد افتتاحي وجارٍ ─────────────
create or replace function public.report_statement(
  p_book uuid, p_account uuid default null, p_party uuid default null, p_cost_center uuid default null,
  p_from date default null, p_to date default null, p_include_children boolean default true)
returns table (line_id uuid, entry_id uuid, entry_date date, number_text text, doc_type text, description text,
               account_id uuid, party_id uuid, currency text, debit_fc numeric, credit_fc numeric,
               debit numeric, credit numeric, balance numeric, balance_fc numeric, is_opening boolean, seq bigint)
language sql stable security invoker set search_path = public as $$
  with recursive tree as (
    select id from public.accounts where id = p_account
    union all
    select a.id from public.accounts a join tree t on a.parent_id = t.id where p_include_children
  ), base as (
    select l.* from public.v_posted_lines l
     where l.book_id = p_book
       and (p_account is null or l.account_id in (select id from tree))
       and (p_party is null or (l.party_id = p_party and exists (
              select 1 from public.accounts a where a.id = l.account_id and a.type in ('asset','liability','equity'))))
       and (p_cost_center is null or l.cost_center_id = p_cost_center)
       and (p_to is null or l.entry_date <= p_to)
  ), op as (
    select coalesce(sum(debit - credit), 0) as amt, coalesce(sum(debit_fc - credit_fc), 0) as amt_fc
      from base where p_from is not null and entry_date < p_from
  )
  select null::uuid, null::uuid, p_from, null::text, null::text, 'رصيد أول المدة', null::uuid, null::uuid, null::text,
         null::numeric, null::numeric, null::numeric, null::numeric, op.amt, op.amt_fc, true, 0::bigint from op
  union all
  select b.id, b.entry_id, b.entry_date, b.number_text, b.doc_type,
         coalesce(b.description, b.entry_memo), b.account_id, b.party_id, b.currency,
         b.debit_fc, b.credit_fc, b.debit, b.credit,
         (select amt from op) + sum(b.debit - b.credit) over w,
         (select amt_fc from op) + sum(b.debit_fc - b.credit_fc) over w,
         false, row_number() over w
    from base b
   where p_from is null or b.entry_date >= p_from
  window w as (order by b.entry_date, b.posted_at, b.entry_id, b.line_no rows unbounded preceding)
  order by 17
$$;

-- ───────────── الدخل والمصروف الشهري (للرسوم البيانية) ─────────────
create or replace function public.report_monthly(p_book uuid, p_months int default 12, p_to date default current_date)
returns table (month date, scope text, revenue numeric, expense numeric)
language sql stable security invoker set search_path = public as $$
  select date_trunc('month', l.entry_date)::date, a.scope,
         coalesce(sum(case when a.type = 'revenue' then l.credit - l.debit end), 0),
         coalesce(sum(case when a.type = 'expense' then l.debit - l.credit end), 0)
    from public.v_posted_lines l join public.accounts a on a.id = l.account_id
   where l.book_id = p_book and a.type in ('revenue','expense')
     and l.entry_date > (date_trunc('month', p_to) - make_interval(months => p_months))::date
     and l.entry_date <= p_to
   group by 1, 2 order by 1
$$;

-- ───────────── لوحة التحكم ─────────────
create or replace function public.dashboard(p_book uuid, p_today date default current_date) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v jsonb; m_from date := date_trunc('month', p_today)::date;
begin
  if not public.can_read(p_book) then raise exception 'لا تملك صلاحية'; end if;
  select jsonb_build_object(
    'cash', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'currency', currency,
                       'balance_fc', balance_fc, 'balance_base', balance_base) order by sort_order)
                      from public.v_cash_balances where book_id = p_book and is_active), '[]'::jsonb),
    'totals', (select jsonb_build_object(
        'assets', coalesce(sum(case when a.type='asset' then l.debit - l.credit end),0),
        'liabilities', coalesce(sum(case when a.type='liability' then l.credit - l.debit end),0),
        'cash', coalesce(sum(case when ca.id is not null and ca.kind <> 'card' then l.debit - l.credit end),0),
        'cards', coalesce(sum(case when ca.kind = 'card' then l.credit - l.debit end),0),
        'receivable', coalesce(sum(case when a.system_key in ('ar','debts_receivable','jamiya_paid','staff_advances') then l.debit - l.credit end),0),
        'payable', coalesce(sum(case when a.system_key in ('ap','debts_payable','jamiya_payable','financing') or ca.kind = 'card' then l.credit - l.debit end),0),
        'month_revenue', coalesce(sum(case when a.type='revenue' and l.entry_date >= m_from and l.entry_date <= p_today then l.credit - l.debit end),0),
        'month_expense', coalesce(sum(case when a.type='expense' and l.entry_date >= m_from and l.entry_date <= p_today then l.debit - l.credit end),0),
        'month_personal_expense', coalesce(sum(case when a.type='expense' and a.scope='personal' and l.entry_date >= m_from and l.entry_date <= p_today then l.debit - l.credit end),0),
        'month_business_revenue', coalesce(sum(case when a.type='revenue' and a.scope='business' and l.entry_date >= m_from and l.entry_date <= p_today then l.credit - l.debit end),0)
      ) from public.v_posted_lines l join public.accounts a on a.id = l.account_id
        left join public.cash_accounts ca on ca.account_id = l.account_id
       where l.book_id = p_book and l.entry_date <= p_today),
    'top_expenses', coalesce((select jsonb_agg(t) from (
        select a.id, a.name, sum(l.debit - l.credit) as amount
          from public.v_posted_lines l join public.accounts a on a.id = l.account_id
         where l.book_id = p_book and a.type = 'expense' and l.entry_date >= m_from and l.entry_date <= p_today
         group by a.id, a.name having sum(l.debit - l.credit) > 0 order by 3 desc limit 6) t), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'revenue', revenue, 'expense', expense) order by month)
                         from (select month, sum(revenue) revenue, sum(expense) expense
                                 from public.report_monthly(p_book, 6, p_today) group by month) x), '[]'::jsonb),
    'upcoming', coalesce((select jsonb_agg(t order by t.due_date) from (
        select i.id, i.debt_id, i.due_date, i.amount - i.paid as amount, i.state, d.direction, d.currency, d.party_name, d.party_phone
          from public.v_installments i join public.v_debts d on d.id = i.debt_id
         where i.book_id = p_book and d.status = 'active' and i.paid < i.amount and i.due_date <= p_today + 14
         order by i.due_date limit 12) t), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(t) from (
        select e.id, e.number_text, e.doc_type, e.entry_date, e.memo, e.total, e.status, p.name as party_name
          from public.journal_entries e left join public.parties p on p.id = e.party_id
         where e.book_id = p_book order by e.created_at desc limit 8) t), '[]'::jsonb),
    'top_parties', coalesce((select jsonb_agg(t) from (
        select party_id, name, net from public.v_party_balances
         where book_id = p_book and net <> 0 order by abs(net) desc limit 6) t), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ───────────── تصدير نسخة احتياطية كاملة للدفتر (JSON) ─────────────
create or replace function public.export_book(p_book uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.can_admin(p_book) then raise exception 'التصدير الكامل لمدير الدفتر فقط'; end if;
  return jsonb_build_object(
    'format', 'mahasi-backup', 'version', 1, 'exported_at', now(),
    'book', (select to_jsonb(b) from public.books b where id = p_book),
    'currencies', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.currencies x where book_id = p_book),
    'fx_rates', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.fx_rates x where book_id = p_book),
    'accounts', (select coalesce(jsonb_agg(to_jsonb(x) order by code), '[]') from public.accounts x where book_id = p_book),
    'cost_centers', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.cost_centers x where book_id = p_book),
    'parties', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.parties x where book_id = p_book),
    'cash_accounts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.cash_accounts x where book_id = p_book),
    'journal_entries', (select coalesce(jsonb_agg(to_jsonb(x) order by entry_date, created_at), '[]') from public.journal_entries x where book_id = p_book),
    'journal_lines', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.journal_lines x where book_id = p_book),
    'debts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.debts x where book_id = p_book),
    'debt_installments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.debt_installments x where book_id = p_book),
    'debt_payments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.debt_payments x where book_id = p_book),
    'entry_templates', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.entry_templates x where book_id = p_book)
  );
end $$;

-- ═════════════ RLS ═════════════
alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.book_members enable row level security;
alter table public.currencies enable row level security;
alter table public.fx_rates enable row level security;
alter table public.accounts enable row level security;
alter table public.cost_centers enable row level security;
alter table public.parties enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.doc_sequences enable row level security;
alter table public.debts enable row level security;
alter table public.debt_installments enable row level security;
alter table public.debt_payments enable row level security;
alter table public.entry_templates enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_self on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

create policy books_read on public.books for select using (public.can_read(id));
create policy books_update on public.books for update using (public.can_admin(id)) with check (public.can_admin(id));

create policy members_read on public.book_members for select using (public.can_read(book_id));
create policy members_update on public.book_members for update using (public.can_admin(book_id)) with check (public.can_admin(book_id));
create policy members_delete on public.book_members for delete using (public.can_admin(book_id) or user_id = auth.uid());

-- جداول البيانات العامة: قراءة للأعضاء، كتابة لمن له صلاحية التعديل
do $$
declare t text;
begin
  foreach t in array array['currencies','fx_rates','accounts','cost_centers','parties','entry_templates'] loop
    execute format('create policy %1$s_read on public.%1$s for select using (public.can_read(book_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.can_write(book_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.can_write(book_id)) with check (public.can_write(book_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.can_write(book_id))', t);
  end loop;
  -- هذه الجداول تُكتب عبر الدوال فقط؛ للعميل قراءة (وتعديل محدود لبعضها)
  foreach t in array array['cash_accounts','journal_entries','journal_lines','debts','debt_installments','debt_payments','doc_sequences'] loop
    execute format('create policy %1$s_read on public.%1$s for select using (public.can_read(book_id))', t);
  end loop;
end $$;

-- تعديل بيانات وصفية للصندوق والدين (الاسم، الملاحظات...) مسموح؛ المبالغ عبر الدوال
create policy cash_accounts_update on public.cash_accounts for update using (public.can_write(book_id)) with check (public.can_write(book_id));
create policy debts_update on public.debts for update using (public.can_write(book_id)) with check (public.can_write(book_id));
-- لا تعديل مباشر للقيود من العميل إطلاقاً؛ المسودات تُعدَّل عبر update_draft فقط

create policy audit_read on public.audit_log for select using (public.can_admin(book_id));

-- حماية حقول الدين المالية من التعديل المباشر
create or replace function public.trg_debts_guard() returns trigger
language plpgsql as $$
begin
  if public._is_client() and (new.principal <> old.principal or new.currency <> old.currency or new.fx_rate <> old.fx_rate
     or new.direction <> old.direction or new.account_id <> old.account_id or new.party_id <> old.party_id
     or new.status <> old.status or new.entry_id is distinct from old.entry_id or new.book_id <> old.book_id) then
    raise exception 'الحقول المالية للدين تُعدَّل عبر السداد أو العكس فقط';
  end if;
  return new;
end $$;
create trigger debts_guard before update on public.debts for each row execute function public.trg_debts_guard();

create or replace function public.trg_cash_guard() returns trigger
language plpgsql as $$
begin
  if public._is_client() and (new.account_id <> old.account_id or new.book_id <> old.book_id
     or (new.currency <> old.currency and exists (select 1 from public.journal_lines where account_id = old.account_id))) then
    raise exception 'لا يمكن تغيير حساب أو عملة صندوق عليه حركات';
  end if;
  if new.name <> old.name then
    update public.accounts set name = new.name where id = new.account_id;
  end if;
  return new;
end $$;
create trigger cash_guard before update on public.cash_accounts for each row execute function public.trg_cash_guard();

-- حماية العملات: العملة الأساسية ثابتة، ولا حذف لعملة مستخدمة
create or replace function public.trg_currencies_guard() returns trigger
language plpgsql as $$
begin
  if not public._is_client() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.is_base or exists (select 1 from public.journal_lines where book_id = old.book_id and currency = old.code)
       or exists (select 1 from public.cash_accounts where book_id = old.book_id and currency = old.code)
       or exists (select 1 from public.debts where book_id = old.book_id and currency = old.code) then
      raise exception 'لا يمكن حذف عملة مستخدمة؛ يمكنك تعطيلها';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' and new.is_base then raise exception 'العملة الأساسية تُحدد عند إنشاء الدفتر'; end if;
  if tg_op = 'UPDATE' then
    if new.code <> old.code or new.book_id <> old.book_id or new.is_base <> old.is_base then
      raise exception 'لا يمكن تغيير رمز العملة أو جعلها أساسية';
    end if;
    if old.is_base and (new.default_rate <> 1 or not new.is_active) then
      raise exception 'العملة الأساسية سعرها 1 ولا تُعطَّل';
    end if;
  end if;
  return new;
end $$;
create trigger currencies_guard before insert or update or delete on public.currencies
for each row execute function public.trg_currencies_guard();

-- ═════════════ الصلاحيات على مستوى الأدوار ═════════════
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
-- الدوال الداخلية (تبدأ بـ _) ودوال الـ triggers لا تُستدعى من العميل
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_%' or p.proname like 'trg\_%') loop
    execute format('revoke execute on function %s from authenticated, anon, public', f.sig);
  end loop;
end $$;
-- _is_client تُستخدم داخل سياسات وtriggers تعمل بصلاحية العميل
grant execute on function public._is_client() to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- تقارير إضافية: مراكز التكلفة، حركة الصناديق، تحليل المصروفات
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.report_cost_centers(p_book uuid, p_from date default null, p_to date default null)
returns table (cost_center_id uuid, revenue numeric, expense numeric, lines bigint)
language sql stable security invoker set search_path = public as $$
  select l.cost_center_id,
         coalesce(sum(case when a.type = 'revenue' then l.credit - l.debit end), 0),
         coalesce(sum(case when a.type = 'expense' then l.debit - l.credit end), 0),
         count(*)
    from public.v_posted_lines l join public.accounts a on a.id = l.account_id
   where l.book_id = p_book and a.type in ('revenue','expense')
     and (p_from is null or l.entry_date >= p_from) and (p_to is null or l.entry_date <= p_to)
   group by l.cost_center_id
$$;

create or replace function public.report_cash_flow(p_book uuid, p_from date default null, p_to date default null)
returns table (cash_account_id uuid, opening_fc numeric, in_fc numeric, out_fc numeric, closing_fc numeric, in_base numeric, out_base numeric)
language sql stable security invoker set search_path = public as $$
  select c.id,
         coalesce(sum(l.debit_fc - l.credit_fc) filter (where p_from is not null and l.entry_date < p_from), 0),
         coalesce(sum(l.debit_fc) filter (where p_from is null or l.entry_date >= p_from), 0),
         coalesce(sum(l.credit_fc) filter (where p_from is null or l.entry_date >= p_from), 0),
         coalesce(sum(l.debit_fc - l.credit_fc), 0),
         coalesce(sum(l.debit) filter (where p_from is null or l.entry_date >= p_from), 0),
         coalesce(sum(l.credit) filter (where p_from is null or l.entry_date >= p_from), 0)
    from public.cash_accounts c
    left join public.v_posted_lines l on l.account_id = c.account_id and (p_to is null or l.entry_date <= p_to)
   where c.book_id = p_book
   group by c.id
$$;

create or replace function public.report_expenses(p_book uuid, p_from date default null, p_to date default null)
returns table (account_id uuid, month date, amount numeric)
language sql stable security invoker set search_path = public as $$
  select l.account_id, date_trunc('month', l.entry_date)::date, sum(l.debit - l.credit)
    from public.v_posted_lines l join public.accounts a on a.id = l.account_id
   where l.book_id = p_book and a.type = 'expense'
     and (p_from is null or l.entry_date >= p_from) and (p_to is null or l.entry_date <= p_to)
   group by 1, 2
$$;

-- دفتر شخصي بلا نشاط تجاري: تعطيل الحسابات التجارية البحتة (يمكن تفعيلها لاحقاً من الدليل)
create or replace function public.trg_books_business() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.has_business is distinct from old.has_business then
    update public.accounts set is_active = new.has_business
     where book_id = new.id and scope = 'business' and system_key is distinct from 'bank_fees';
  end if;
  return new;
end $$;
create trigger books_business after update of has_business on public.books
for each row execute function public.trg_books_business();

grant execute on function public.report_cost_centers(uuid, date, date) to authenticated;
grant execute on function public.report_cash_flow(uuid, date, date) to authenticated;
grant execute on function public.report_expenses(uuid, date, date) to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- دوال إنشاء القيود وترحيلها وعكسها
-- كل الدوال SECURITY DEFINER مع فحص صريح للصلاحية.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public._require_write(p_book uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول' using errcode = '28000'; end if;
  if not public.can_write(p_book) then raise exception 'لا تملك صلاحية التعديل في هذا الدفتر' using errcode = '42501'; end if;
end $$;

create or replace function public._require_admin(p_book uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول' using errcode = '28000'; end if;
  if not public.can_admin(p_book) then raise exception 'هذه العملية لمدير الدفتر فقط' using errcode = '42501'; end if;
end $$;

create or replace function public._series(p_doc_type text) returns text
language sql immutable as $$
  select case p_doc_type
    when 'journal' then 'JV' when 'receipt' then 'RV' when 'payment' then 'PV'
    when 'transfer' then 'TR' when 'expense' then 'EX' when 'income' then 'IN'
    when 'opening' then 'OB' when 'debt' then 'DB' when 'debt_payment' then 'DP'
    when 'reversal' then 'RJ' when 'adjustment' then 'AJ' when 'closing' then 'CL'
    else 'JV' end
$$;

create or replace function public._fiscal_year(p_book uuid, p_date date) returns int
language sql stable security definer set search_path = public as $$
  select extract(year from p_date)::int
         - case when extract(month from p_date)::int < b.fiscal_year_start_month then 1 else 0 end
  from public.books b where b.id = p_book
$$;

create or replace function public._account_id(p_book uuid, p_key text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from public.accounts where book_id = p_book and system_key = p_key;
  if v is null then raise exception 'الحساب النظامي «%» غير موجود في الدليل', p_key; end if;
  return v;
end $$;

-- سعر الصرف لعملة في تاريخ (آخر سعر مسجل حتى التاريخ، وإلا الافتراضي)
create or replace function public.rate_on(p_book uuid, p_currency text, p_date date) returns numeric
language sql stable security definer set search_path = public as $$
  select case when c.is_base then 1 else coalesce(
    (select r.rate from public.fx_rates r where r.book_id = p_book and r.currency_code = p_currency
      and r.rate_date <= p_date order by r.rate_date desc limit 1), c.default_rate) end
  from public.currencies c where c.book_id = p_book and c.code = p_currency
    and (auth.uid() is null or public.can_read(p_book))
$$;

-- ───────────── كتابة أسطر قيد (داخلي) ─────────────
create or replace function public._write_lines(p_entry public.journal_entries, p_lines jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  ln jsonb; i int := 0; v_cur text; v_rate numeric; v_dr numeric; v_cr numeric;
  v_acc public.accounts;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'القيد يحتاج سطرين على الأقل';
  end if;
  delete from public.journal_lines where entry_id = p_entry.id;
  for ln in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    select * into v_acc from public.accounts where id = (ln->>'account_id')::uuid;
    if v_acc.id is null or v_acc.book_id <> p_entry.book_id then
      raise exception 'السطر %: الحساب غير موجود في هذا الدفتر', i;
    end if;
    v_cur  := coalesce(nullif(ln->>'currency',''), p_entry.currency);
    if not exists (select 1 from public.currencies where book_id = p_entry.book_id and code = v_cur) then
      raise exception 'السطر %: العملة % غير معرّفة', i, v_cur;
    end if;
    if v_cur = (select base_currency from public.books where id = p_entry.book_id) then
      v_rate := 1;  -- العملة الأساسية سعرها 1 دائماً
    else
      v_rate := coalesce(nullif(ln->>'fx_rate','')::numeric,
                         case when v_cur = p_entry.currency then p_entry.fx_rate
                              else public.rate_on(p_entry.book_id, v_cur, p_entry.entry_date) end);
    end if;
    if v_rate is null or v_rate <= 0 then raise exception 'السطر %: سعر صرف غير صحيح', i; end if;
    v_dr := round(coalesce(nullif(ln->>'debit','')::numeric, 0), 2);
    v_cr := round(coalesce(nullif(ln->>'credit','')::numeric, 0), 2);
    if v_dr < 0 or v_cr < 0 then raise exception 'السطر %: لا تُقبل مبالغ سالبة', i; end if;
    if v_dr > 0 and v_cr > 0 then raise exception 'السطر %: لا يجمع السطر بين مدين ودائن', i; end if;
    if v_dr = 0 and v_cr = 0 then raise exception 'السطر %: المبلغ صفر', i; end if;
    if (ln ? 'party_id') and nullif(ln->>'party_id','') is not null and not exists (
        select 1 from public.parties where id = (ln->>'party_id')::uuid and book_id = p_entry.book_id) then
      raise exception 'السطر %: الطرف غير موجود في هذا الدفتر', i;
    end if;
    if (ln ? 'cost_center_id') and nullif(ln->>'cost_center_id','') is not null and not exists (
        select 1 from public.cost_centers where id = (ln->>'cost_center_id')::uuid and book_id = p_entry.book_id) then
      raise exception 'السطر %: مركز التكلفة غير موجود', i;
    end if;
    insert into public.journal_lines (entry_id, book_id, line_no, account_id, party_id, cost_center_id,
      description, currency, fx_rate, debit_fc, credit_fc, debit, credit)
    values (p_entry.id, p_entry.book_id, i, v_acc.id,
      nullif(ln->>'party_id','')::uuid,
      coalesce(nullif(ln->>'cost_center_id','')::uuid, p_entry.cost_center_id),
      nullif(ln->>'description',''), v_cur, v_rate, v_dr, v_cr,
      round(v_dr * v_rate, 2), round(v_cr * v_rate, 2));
  end loop;
end $$;

-- ───────────── ترحيل قيد ─────────────
create or replace function public._post(p_id uuid, p_skip_cash_check boolean default false) returns public.journal_entries
language plpgsql security definer set search_path = public as $$
declare
  e public.journal_entries; b public.books;
  v_dr numeric; v_cr numeric; v_diff numeric; v_bad text; v_year int; v_no int; r record; v_bal numeric;
  v_round uuid;
begin
  select * into e from public.journal_entries where id = p_id for update;
  if e.id is null then raise exception 'القيد غير موجود'; end if;
  if e.status <> 'draft' then raise exception 'القيد مرحّل مسبقاً'; end if;
  select * into b from public.books where id = e.book_id;
  if b.lock_date is not null and e.entry_date <= b.lock_date then
    raise exception 'الفترة حتى % مقفلة؛ لا يمكن الترحيل بتاريخ %', b.lock_date, e.entry_date;
  end if;

  if (select count(*) from public.journal_lines where entry_id = p_id) < 2 then
    raise exception 'القيد يحتاج سطرين على الأقل';
  end if;

  select string_agg(a.code || ' ' || a.name, '، ') into v_bad
    from public.journal_lines l join public.accounts a on a.id = l.account_id
   where l.entry_id = p_id and (not a.is_postable or (not a.is_active and e.doc_type <> 'reversal'));
  if v_bad is not null then
    raise exception 'حسابات لا تقبل قيوداً (رئيسية أو معطلة): %', v_bad;
  end if;

  -- السطر الذي يمس صندوقاً يجب أن يكون بعملة الصندوق
  select string_agg(ca.name, '، ') into v_bad
    from public.journal_lines l join public.cash_accounts ca on ca.account_id = l.account_id
   where l.entry_id = p_id and l.currency <> ca.currency;
  if v_bad is not null then raise exception 'عملة السطر لا تطابق عملة: %', v_bad; end if;

  select coalesce(sum(debit),0), coalesce(sum(credit),0) into v_dr, v_cr
    from public.journal_lines where entry_id = p_id;
  v_diff := v_dr - v_cr;
  if v_diff <> 0 then
    -- فرق التقريب مقبول فقط في القيود متعددة العملات، وبحد أقصى هللة لكل سطر (وريال كحد أعلى)
    if exists (select 1 from public.journal_lines where entry_id = p_id and currency <> b.base_currency)
       and abs(v_diff) <= least(1, 0.01 * (select count(*) from public.journal_lines where entry_id = p_id)) then
      -- فرق تقريب ناتج عن أسعار الصرف: يُرحَّل إلى حساب فروق التقريب
      v_round := public._account_id(e.book_id, 'rounding');
      insert into public.journal_lines (entry_id, book_id, line_no, account_id, description, currency, fx_rate,
                                        debit_fc, credit_fc, debit, credit)
      values (p_id, e.book_id, (select max(line_no)+1 from public.journal_lines where entry_id = p_id),
              v_round, 'فرق تقريب', b.base_currency, 1,
              greatest(-v_diff,0), greatest(v_diff,0), greatest(-v_diff,0), greatest(v_diff,0));
      v_dr := greatest(v_dr, v_cr);
    else
      raise exception 'القيد غير متوازن: المدين % والدائن % (الفرق %)', v_dr, v_cr, v_diff;
    end if;
  end if;
  if v_dr = 0 then raise exception 'مبلغ القيد صفر'; end if;

  -- منع الرصيد السالب في الصناديق التي لا تسمح به
  if not p_skip_cash_check then
    for r in select distinct ca.name, ca.account_id from public.journal_lines l
               join public.cash_accounts ca on ca.account_id = l.account_id
              where l.entry_id = p_id and not ca.allow_negative and l.credit_fc > 0 loop
      select coalesce(sum(l.debit_fc - l.credit_fc), 0) into v_bal
        from public.journal_lines l join public.journal_entries x on x.id = l.entry_id
       where l.account_id = r.account_id and (x.status <> 'draft' or x.id = p_id);
      if v_bal < 0 then
        raise exception 'الرصيد غير كافٍ في «%»؛ سيصبح %', r.name, v_bal using errcode = 'P0001';
      end if;
    end loop;
  end if;

  v_year := public._fiscal_year(e.book_id, e.entry_date);
  insert into public.doc_sequences as s (book_id, series, fiscal_year, last_value)
  values (e.book_id, public._series(e.doc_type), v_year, 1)
  on conflict (book_id, series, fiscal_year) do update set last_value = s.last_value + 1
  returning last_value into v_no;

  update public.journal_entries set
    status = 'posted', number = v_no, fiscal_year = v_year,
    number_text = public._series(e.doc_type) || '-' || v_year || '-' || lpad(v_no::text, 5, '0'),
    total = v_dr, posted_by = auth.uid(), posted_at = now()
  where id = p_id returning * into e;
  return e;
end $$;

-- ───────────── إنشاء قيد/سند (مسودة أو مرحّل) ─────────────
-- p: {book_id, doc_type, entry_date, memo, reference, party_id, cash_account_id, cost_center_id,
--     currency, fx_rate, meta, post, lines:[{account_id, debit, credit, party_id, cost_center_id, description, currency, fx_rate}]}
create or replace function public.create_entry(p jsonb) returns public.journal_entries
language plpgsql security definer set search_path = public as $$
declare e public.journal_entries; v_book uuid := (p->>'book_id')::uuid; v_cur text; v_rate numeric; v_date date;
begin
  perform public._require_write(v_book);
  if coalesce(p->>'doc_type','') not in ('journal','receipt','payment','transfer','expense','income','opening','adjustment') then
    raise exception 'نوع السند غير مسموح هنا: %', p->>'doc_type';
  end if;
  v_date := coalesce(nullif(p->>'entry_date','')::date, current_date);
  v_cur := coalesce(nullif(p->>'currency',''), (select base_currency from public.books where id = v_book));
  if not exists (select 1 from public.currencies where book_id = v_book and code = v_cur) then
    raise exception 'العملة % غير معرّفة', v_cur;
  end if;
  v_rate := case when v_cur = (select base_currency from public.books where id = v_book) then 1
                 else coalesce(nullif(p->>'fx_rate','')::numeric, public.rate_on(v_book, v_cur, v_date)) end;

  if nullif(p->>'party_id','') is not null and not exists (select 1 from public.parties where id = (p->>'party_id')::uuid and book_id = v_book) then
    raise exception 'الطرف غير موجود'; end if;
  if nullif(p->>'cash_account_id','') is not null and not exists (select 1 from public.cash_accounts where id = (p->>'cash_account_id')::uuid and book_id = v_book) then
    raise exception 'الصندوق غير موجود'; end if;
  if nullif(p->>'cost_center_id','') is not null and not exists (select 1 from public.cost_centers where id = (p->>'cost_center_id')::uuid and book_id = v_book) then
    raise exception 'مركز التكلفة غير موجود'; end if;

  insert into public.journal_entries (book_id, doc_type, entry_date, memo, reference, party_id, cash_account_id,
                                      cost_center_id, currency, fx_rate, meta)
  values (v_book, p->>'doc_type', v_date, nullif(p->>'memo',''), nullif(p->>'reference',''),
          nullif(p->>'party_id','')::uuid, nullif(p->>'cash_account_id','')::uuid, nullif(p->>'cost_center_id','')::uuid,
          v_cur, v_rate, coalesce(p->'meta','{}'::jsonb))
  returning * into e;

  perform public._write_lines(e, p->'lines');
  if coalesce((p->>'post')::boolean, true) then
    e := public._post(e.id);
  end if;
  return e;
end $$;

-- تعديل مسودة (الأسطر تُستبدل كاملة)
create or replace function public.update_draft(p_id uuid, p jsonb) returns public.journal_entries
language plpgsql security definer set search_path = public as $$
declare e public.journal_entries;
begin
  select * into e from public.journal_entries where id = p_id for update;
  if e.id is null then raise exception 'القيد غير موجود'; end if;
  perform public._require_write(e.book_id);
  if e.status <> 'draft' then raise exception 'لا يمكن تعديل قيد مرحّل؛ استخدم «عكس القيد»'; end if;
  if nullif(p->>'party_id','') is not null and not exists (select 1 from public.parties where id = (p->>'party_id')::uuid and book_id = e.book_id) then
    raise exception 'الطرف غير موجود'; end if;
  if nullif(p->>'cost_center_id','') is not null and not exists (select 1 from public.cost_centers where id = (p->>'cost_center_id')::uuid and book_id = e.book_id) then
    raise exception 'مركز التكلفة غير موجود'; end if;
  update public.journal_entries set
    entry_date = coalesce(nullif(p->>'entry_date','')::date, entry_date),
    memo = case when p ? 'memo' then nullif(p->>'memo','') else memo end,
    reference = case when p ? 'reference' then nullif(p->>'reference','') else reference end,
    party_id = case when p ? 'party_id' then nullif(p->>'party_id','')::uuid else party_id end,
    cost_center_id = case when p ? 'cost_center_id' then nullif(p->>'cost_center_id','')::uuid else cost_center_id end,
    meta = coalesce(p->'meta', meta)
  where id = p_id returning * into e;
  if p ? 'lines' then perform public._write_lines(e, p->'lines'); end if;
  if coalesce((p->>'post')::boolean, false) then e := public._post(e.id); end if;
  return e;
end $$;

create or replace function public.post_entry(p_id uuid) returns public.journal_entries
language plpgsql security definer set search_path = public as $$
declare v_book uuid;
begin
  select book_id into v_book from public.journal_entries where id = p_id;
  if v_book is null then raise exception 'القيد غير موجود'; end if;
  perform public._require_write(v_book);
  return public._post(p_id);
end $$;

create or replace function public.delete_draft(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.journal_entries;
begin
  select * into e from public.journal_entries where id = p_id;
  if e.id is null then raise exception 'القيد غير موجود'; end if;
  perform public._require_write(e.book_id);
  if e.status <> 'draft' then raise exception 'لا يمكن حذف قيد مرحّل؛ استخدم «عكس القيد»'; end if;
  delete from public.journal_entries where id = p_id;
end $$;

-- ───────────── عكس قيد مرحّل ─────────────
create or replace function public.reverse_entry(p_id uuid, p_date date default null, p_reason text default null)
returns public.journal_entries
language plpgsql security definer set search_path = public as $$
declare e public.journal_entries; r public.journal_entries; b public.books; v_date date;
begin
  select * into e from public.journal_entries where id = p_id for update;
  if e.id is null then raise exception 'القيد غير موجود'; end if;
  perform public._require_write(e.book_id);
  if e.status = 'draft' then raise exception 'المسودة تُحذف ولا تُعكس'; end if;
  if e.status = 'reversed' then raise exception 'القيد معكوس مسبقاً'; end if;
  if e.doc_type = 'reversal' then raise exception 'لا يمكن عكس قيد عكسي؛ أنشئ قيداً جديداً'; end if;
  if e.debt_id is not null then
    if not exists (select 1 from public.debts d where d.id = e.debt_id and d.book_id = e.book_id
                     and (d.entry_id = e.id or exists (select 1 from public.debt_payments dp where dp.entry_id = e.id and dp.debt_id = d.id))) then
      raise exception 'ارتباط القيد بالدين غير صالح';
    end if;
    if e.doc_type = 'debt' and exists (select 1 from public.debt_payments dp join public.journal_entries x on x.id = dp.entry_id
                                        where dp.debt_id = e.debt_id and x.status = 'posted') then
      raise exception 'على هذا الدين دفعات مرحّلة؛ اعكس الدفعات أولاً ثم اعكس قيد الدين';
    end if;
  end if;
  select * into b from public.books where id = e.book_id;
  v_date := coalesce(p_date, e.entry_date);
  if b.lock_date is not null and v_date <= b.lock_date then
    raise exception 'الفترة حتى % مقفلة؛ اختر تاريخاً للعكس بعدها', b.lock_date;
  end if;

  insert into public.journal_entries (book_id, doc_type, entry_date, memo, reference, party_id, cash_account_id,
       cost_center_id, currency, fx_rate, reverses_id, debt_id, meta)
  values (e.book_id, 'reversal', v_date,
          'عكس ' || coalesce(e.number_text,'') || coalesce(' — ' || nullif(p_reason,''), ''),
          e.reference, e.party_id, e.cash_account_id, e.cost_center_id, e.currency, e.fx_rate, e.id, e.debt_id,
          jsonb_build_object('reason', p_reason, 'original_type', e.doc_type))
  returning * into r;

  insert into public.journal_lines (entry_id, book_id, line_no, account_id, party_id, cost_center_id, description,
       currency, fx_rate, debit_fc, credit_fc, debit, credit)
  select r.id, l.book_id, l.line_no, l.account_id, l.party_id, l.cost_center_id, l.description,
         l.currency, l.fx_rate, l.credit_fc, l.debit_fc, l.credit, l.debit
    from public.journal_lines l where l.entry_id = e.id;

  r := public._post(r.id, true);
  update public.journal_entries set status = 'reversed', reversed_by_id = r.id where id = e.id;

  -- أثر العكس على الديون
  if e.doc_type = 'debt' and e.debt_id is not null then
    update public.debts set status = 'cancelled' where id = e.debt_id;
  elsif e.doc_type = 'debt_payment' and e.debt_id is not null then
    update public.debts set status = 'active' where id = e.debt_id and status in ('settled','forgiven');
  end if;
  return r;
end $$;

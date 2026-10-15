-- ═══════════════════════════════════════════════════════════════════
-- إنشاء الدفتر وبذر الدليل، الصناديق، الأعضاء، الديون
-- ═══════════════════════════════════════════════════════════════════

-- ───────────── دليل الحسابات الافتراضي ─────────────
create or replace function public._seed_chart(p_book uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select * from (values
  -- code, name, type, scope, parent, system_key
  ('1','الأصول','asset','both',null,null),
  ('11','الأصول المتداولة','asset','both','1',null),
  ('1101','النقدية','asset','both','11','cash_group'),
  ('1102','البنوك والمحافظ الإلكترونية','asset','both','11','bank_group'),
  ('1103','العملاء','asset','business','11','ar'),
  ('1104','ديون لي (أصدقاء وأقارب وسُلف)','asset','personal','11','debts_receivable'),
  ('1105','أقساط جمعيات مدفوعة','asset','personal','11','jamiya_paid'),
  ('1106','المخزون','asset','business','11','inventory'),
  ('1107','مصروفات مدفوعة مقدماً','asset','both','11','prepaid'),
  ('1108','ضريبة القيمة المضافة - مدخلات','asset','business','11','vat_in'),
  ('1109','عُهد وسُلف الموظفين','asset','business','11','staff_advances'),
  ('1110','حساب وسيط تحت التسوية','asset','both','11','suspense'),
  ('12','الأصول غير المتداولة','asset','both','1',null),
  ('1201','السيارات','asset','both','12',null),
  ('1202','الأجهزة والمعدات','asset','both','12',null),
  ('1203','الأثاث والتجهيزات','asset','both','12',null),
  ('1204','العقارات والأراضي','asset','personal','12',null),
  ('1205','الاستثمارات (أسهم وذهب)','asset','personal','12','investments'),
  ('1209','مجمع الإهلاك','asset','both','12','accum_depreciation'),
  ('2','الخصوم','liability','both',null,null),
  ('21','الخصوم المتداولة','liability','both','2',null),
  ('2101','الموردون','liability','business','21','ap'),
  ('2102','ديون عليّ (أصدقاء وأقارب)','liability','personal','21','debts_payable'),
  ('2103','بطاقات الائتمان','liability','both','21','card_group'),
  ('2104','جمعيات مستحقة عليّ','liability','personal','21','jamiya_payable'),
  ('2105','ضريبة القيمة المضافة - مخرجات','liability','business','21','vat_out'),
  ('2106','مصروفات مستحقة','liability','both','21','accrued'),
  ('2107','دفعات مقدمة من العملاء','liability','business','21','customer_advances'),
  ('2108','أمانات لديّ لصالح الغير','liability','both','21','trust'),
  ('22','الخصوم طويلة الأجل','liability','both','2',null),
  ('2201','التمويل الشخصي وتمويل السيارة','liability','personal','22','financing'),
  ('2202','التمويل العقاري','liability','personal','22',null),
  ('3','حقوق الملكية','equity','both',null,null),
  ('3101','رأس المال وصافي الثروة الافتتاحي','equity','both','3','opening_equity'),
  ('3102','جاري المالك','equity','both','3','owner_current'),
  ('3103','المسحوبات الشخصية','equity','personal','3','drawings'),
  ('3104','الأرباح المرحّلة','equity','both','3','retained'),
  ('4','الإيرادات','revenue','both',null,null),
  ('41','إيرادات النشاط','revenue','business','4',null),
  ('4101','المبيعات','revenue','business','41','sales'),
  ('4102','إيرادات الخدمات والاستشارات الهندسية','revenue','business','41','services'),
  ('4103','مردودات وخصم مسموح به','revenue','business','41','sales_returns'),
  ('42','الإيرادات الشخصية','revenue','personal','4',null),
  ('4201','الراتب','revenue','personal','42','salary'),
  ('4202','البدلات والمكافآت','revenue','personal','42',null),
  ('4203','إيرادات الإيجار','revenue','personal','42',null),
  ('4204','عوائد الاستثمار','revenue','personal','42',null),
  ('4205','هدايا وهبات مستلمة','revenue','personal','42','gifts_in'),
  ('43','إيرادات أخرى','revenue','both','4',null),
  ('4301','أرباح فروق العملة','revenue','both','43','fx_gain'),
  ('4302','أرباح بيع الأصول','revenue','both','43',null),
  ('4303','فروق التقريب','revenue','both','43','rounding'),
  ('5','مصروفات النشاط','expense','business',null,null),
  ('51','تكلفة الإيرادات','expense','business','5',null),
  ('5101','تكلفة البضاعة المباعة','expense','business','51','cogs'),
  ('5102','مقاولو الباطن','expense','business','51',null),
  ('52','المصروفات التشغيلية','expense','business','5',null),
  ('5201','الأجور والرواتب','expense','business','52',null),
  ('5202','إيجار المكتب','expense','business','52',null),
  ('5203','الاتصالات والإنترنت - عمل','expense','business','52',null),
  ('5204','المواصلات والمحروقات - عمل','expense','business','52',null),
  ('5205','الرسوم الحكومية والاشتراكات المهنية','expense','business','52',null),
  ('5206','البرامج والاشتراكات التقنية','expense','business','52',null),
  ('5207','التسويق والإعلان','expense','business','52',null),
  ('5208','الرسوم البنكية','expense','both','52','bank_fees'),
  ('5209','الإهلاك','expense','business','52','depreciation'),
  ('5210','خسائر فروق العملة','expense','both','52','fx_loss'),
  ('5211','الديون المعدومة','expense','both','52','bad_debts'),
  ('5212','مصروفات متنوعة - عمل','expense','business','52',null),
  ('6','المصروفات الشخصية','expense','personal',null,null),
  ('61','مصروفات المعيشة','expense','personal','6',null),
  ('6101','السكن والإيجار','expense','personal','61',null),
  ('6102','الكهرباء والماء','expense','personal','61',null),
  ('6103','الغذاء والتموين','expense','personal','61',null),
  ('6104','المطاعم والمقاهي','expense','personal','61',null),
  ('6105','السيارة والمحروقات','expense','personal','61',null),
  ('6106','الاتصالات والإنترنت - شخصي','expense','personal','61',null),
  ('6107','التعليم','expense','personal','61',null),
  ('6108','العلاج والصحة','expense','personal','61',null),
  ('6109','الملابس والعناية الشخصية','expense','personal','61',null),
  ('6110','السفر والترفيه','expense','personal','61',null),
  ('6111','التأمين','expense','personal','61',null),
  ('6112','الرسوم الحكومية والإقامة','expense','personal','61',null),
  ('62','الالتزامات العائلية والخيرية','expense','personal','6',null),
  ('6201','تحويلات للأهل','expense','personal','62','family_transfers'),
  ('6202','الزكاة','expense','personal','62','zakat'),
  ('6203','الصدقات والهدايا المقدمة','expense','personal','62','gifts_out'),
  ('63','مصروفات التمويل والتحويل','expense','personal','6',null),
  ('6301','أرباح ورسوم التمويل','expense','personal','63','finance_cost'),
  ('6302','رسوم التحويل والصرافة','expense','personal','63','transfer_fees'),
  ('6399','مصروفات شخصية متنوعة','expense','personal','6','personal_misc')
  ) as t(code, name, type, scope, parent, skey) order by length(code), code
  loop
    insert into public.accounts (book_id, code, name, type, scope, parent_id, system_key)
    values (p_book, r.code, r.name, r.type, r.scope,
            (select id from public.accounts where book_id = p_book and code = r.parent), r.skey);
  end loop;
end $$;

-- ───────────── إنشاء صندوق/بنك/محفظة/بطاقة مع حسابه في الدليل ─────────────
create or replace function public._create_cash_account(p_book uuid, p_name text, p_kind text, p_currency text,
  p_bank text default null, p_iban text default null, p_allow_negative boolean default null)
returns public.cash_accounts
language plpgsql security definer set search_path = public as $$
declare v_parent public.accounts; v_code text; v_acc uuid; c public.cash_accounts; v_n int;
begin
  if p_kind not in ('cash','bank','wallet','card') then raise exception 'نوع غير صحيح'; end if;
  if not exists (select 1 from public.currencies where book_id = p_book and code = p_currency) then
    raise exception 'العملة % غير معرّفة', p_currency;
  end if;
  select * into v_parent from public.accounts where book_id = p_book and system_key =
    case p_kind when 'cash' then 'cash_group' when 'card' then 'card_group' else 'bank_group' end;
  select count(*) + 1 into v_n from public.accounts where parent_id = v_parent.id;
  loop
    v_code := v_parent.code || lpad(v_n::text, 2, '0');
    exit when not exists (select 1 from public.accounts where book_id = p_book and code = v_code);
    v_n := v_n + 1;
  end loop;
  insert into public.accounts (book_id, code, name, type, scope, parent_id)
  values (p_book, v_code, p_name, v_parent.type, 'both', v_parent.id) returning id into v_acc;
  insert into public.cash_accounts (book_id, name, kind, account_id, currency, bank_name, iban, allow_negative, sort_order)
  values (p_book, p_name, p_kind, v_acc, p_currency, p_bank, p_iban,
          coalesce(p_allow_negative, p_kind = 'card'),
          (select coalesce(max(sort_order),0)+1 from public.cash_accounts where book_id = p_book))
  returning * into c;
  return c;
end $$;

create or replace function public.create_cash_account(p jsonb) returns public.cash_accounts
language plpgsql security definer set search_path = public as $$
declare v_book uuid := (p->>'book_id')::uuid;
begin
  perform public._require_write(v_book);
  if length(trim(coalesce(p->>'name',''))) = 0 then raise exception 'الاسم مطلوب'; end if;
  return public._create_cash_account(v_book, trim(p->>'name'), p->>'kind',
    coalesce(nullif(p->>'currency',''), (select base_currency from public.books where id = v_book)),
    nullif(p->>'bank_name',''), nullif(p->>'iban',''), nullif(p->>'allow_negative','')::boolean);
end $$;

-- ───────────── إنشاء دفتر جديد ─────────────
create or replace function public.create_book(p jsonb) returns public.books
language plpgsql security definer set search_path = public as $$
declare b public.books; v_base text := coalesce(nullif(p->>'base_currency',''), 'SAR');
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول' using errcode = '28000'; end if;
  if (select count(*) from public.book_members where user_id = auth.uid() and role = 'owner') >= 20 then
    raise exception 'وصلت للحد الأقصى من الدفاتر';
  end if;
  insert into public.books (name, base_currency, has_business, owner_name, fiscal_year_start_month, created_by)
  values (coalesce(nullif(trim(p->>'name'),''), 'دفتري'), v_base, coalesce((p->>'has_business')::boolean, true),
          nullif(p->>'owner_name',''), coalesce(nullif(p->>'fiscal_year_start_month','')::int, 1), auth.uid())
  returning * into b;
  insert into public.book_members (book_id, user_id, role) values (b.id, auth.uid(), 'owner');
  insert into public.profiles (id, full_name) values (auth.uid(), nullif(p->>'owner_name',''))
    on conflict (id) do nothing;

  insert into public.currencies (book_id, code, name, symbol, is_base, default_rate) values
    (b.id, 'SAR', 'ريال سعودي', 'ر.س', v_base = 'SAR', 1),
    (b.id, 'USD', 'دولار أمريكي', '$', v_base = 'USD', case when v_base = 'SAR' then 3.75 else 1 end),
    (b.id, 'YER_ADN', 'ريال يمني (عدن)', 'ر.ي', false, 0.0024),
    (b.id, 'YER_SAN', 'ريال يمني (صنعاء)', 'ر.ي', false, 0.0071),
    (b.id, 'AED', 'درهم إماراتي', 'د.إ', v_base = 'AED', case when v_base = 'SAR' then 1.0211 else 1 end);
  if not exists (select 1 from public.currencies where book_id = b.id and is_base) then
    insert into public.currencies (book_id, code, name, is_base, default_rate) values (b.id, v_base, v_base, true, 1);
  end if;
  update public.currencies set default_rate = 1 where book_id = b.id and is_base;

  perform public._seed_chart(b.id);
  if not b.has_business then
    update public.accounts set is_active = false where book_id = b.id and scope = 'business';
  end if;

  insert into public.cost_centers (book_id, code, name, kind) values
    (b.id, 'P', 'شخصي', 'personal'),
    (b.id, 'B', 'العمل الحر', 'business');

  perform public._create_cash_account(b.id, 'الصندوق الرئيسي', 'cash', v_base);
  perform public._create_cash_account(b.id, 'المحفظة الشخصية', 'cash', v_base);
  perform public._create_cash_account(b.id, 'الحساب البنكي', 'bank', v_base);
  return b;
end $$;

create or replace function public.delete_book(p_book uuid, p_confirm text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.book_role(p_book), '') <> 'owner' then raise exception 'حذف الدفتر للمالك فقط' using errcode = '42501'; end if;
  if p_confirm is distinct from (select name from public.books where id = p_book) then
    raise exception 'اكتب اسم الدفتر بالضبط لتأكيد الحذف';
  end if;
  -- الحذف المتتالي يتم بصلاحية مالك الجداول فيمر عبر الحمايات
  delete from public.books where id = p_book;
end $$;

-- ───────────── إدارة الأعضاء ─────────────
create or replace function public.add_member(p_book uuid, p_email text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  perform public._require_admin(p_book);
  if p_role not in ('admin','accountant','viewer') then raise exception 'دور غير صحيح'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'لا يوجد مستخدم مسجّل بهذا البريد؛ اطلب منه إنشاء حساب أولاً'; end if;
  insert into public.book_members (book_id, user_id, role) values (p_book, v_user, p_role)
  on conflict (book_id, user_id) do update set role = excluded.role
  where public.book_members.role <> 'owner';
end $$;

create or replace function public.list_members(p_book uuid)
returns table (user_id uuid, email text, full_name text, role text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, p.full_name, m.role, m.created_at
    from public.book_members m join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
   where m.book_id = p_book and public.can_read(p_book)
   order by m.created_at
$$;

-- ───────────── الديون ─────────────
-- p: {book_id, direction, kind, party_id, title, currency, fx_rate, principal, start_date, due_date,
--     account_id?, cash_account_id?, counter_account_id?, reminder_days, notes,
--     installments:[{due_date, amount, note}]}
create or replace function public.create_debt(p jsonb) returns public.debts
language plpgsql security definer set search_path = public as $$
declare
  v_book uuid := (p->>'book_id')::uuid; d public.debts; e public.journal_entries;
  v_dir text := p->>'direction'; v_cur text; v_rate numeric; v_amt numeric; v_base numeric;
  v_ctrl uuid; v_counter uuid; v_cash public.cash_accounts; v_cash_rate numeric; v_cash_amt numeric;
  v_party public.parties; v_date date; v_sum numeric; ins jsonb; i int := 0; v_lines jsonb; v_ctrl_line jsonb; v_cnt_line jsonb;
begin
  perform public._require_write(v_book);
  if v_dir not in ('receivable','payable') then raise exception 'اتجاه الدين غير صحيح'; end if;
  select * into v_party from public.parties where id = (p->>'party_id')::uuid and book_id = v_book;
  if v_party.id is null then raise exception 'اختر الشخص أو الجهة'; end if;
  v_date := coalesce(nullif(p->>'start_date','')::date, current_date);
  v_cur := coalesce(nullif(p->>'currency',''), (select base_currency from public.books where id = v_book));
  if not exists (select 1 from public.currencies where book_id = v_book and code = v_cur) then
    raise exception 'العملة % غير معرّفة', v_cur; end if;
  v_rate := case when v_cur = (select base_currency from public.books where id = v_book) then 1
                 else coalesce(nullif(p->>'fx_rate','')::numeric, public.rate_on(v_book, v_cur, v_date)) end;
  if v_rate is null or v_rate <= 0 then raise exception 'سعر صرف غير صحيح'; end if;
  v_amt := round((p->>'principal')::numeric, 2);
  if v_amt is null or v_amt <= 0 then raise exception 'مبلغ الدين يجب أن يكون أكبر من صفر'; end if;
  v_base := round(v_amt * v_rate, 2);

  v_ctrl := coalesce(nullif(p->>'account_id','')::uuid,
    public._account_id(v_book, case when v_dir = 'receivable' then 'debts_receivable' else 'debts_payable' end));
  if not exists (select 1 from public.accounts where id = v_ctrl and book_id = v_book) then
    raise exception 'حساب الدين غير موجود'; end if;

  if nullif(p->>'cash_account_id','') is not null then
    select * into v_cash from public.cash_accounts where id = (p->>'cash_account_id')::uuid and book_id = v_book;
    if v_cash.id is null then raise exception 'الصندوق غير موجود'; end if;
    v_counter := v_cash.account_id;
    if v_cash.currency = v_cur then v_cash_rate := v_rate; v_cash_amt := v_amt;
    else
      v_cash_rate := public.rate_on(v_book, v_cash.currency, v_date);
      v_cash_amt := round(v_base / v_cash_rate, 2);
      -- السعر الفعلي ليتطابق المعادل بالعملة الأساسية
      v_cash_rate := v_base / v_cash_amt;
    end if;
  else
    -- دين قائم سابقاً (بدون حركة نقدية): الطرف المقابل حساب آخر أو صافي الثروة الافتتاحي
    v_counter := coalesce(nullif(p->>'counter_account_id','')::uuid, public._account_id(v_book, 'opening_equity'));
    v_cash_rate := v_rate; v_cash_amt := v_amt;
  end if;

  insert into public.debts (book_id, direction, kind, party_id, title, currency, fx_rate, principal, start_date,
                            due_date, account_id, reminder_days, notes)
  values (v_book, v_dir, coalesce(nullif(p->>'kind',''),'loan'), v_party.id, nullif(p->>'title',''), v_cur, v_rate,
          v_amt, v_date, nullif(p->>'due_date','')::date, v_ctrl, coalesce(nullif(p->>'reminder_days','')::int, 3),
          nullif(p->>'notes',''))
  returning * into d;

  -- الأقساط (إن لم تُحدد: قسط واحد بتاريخ الاستحقاق أو بعد شهر)
  if jsonb_typeof(p->'installments') = 'array' and jsonb_array_length(p->'installments') > 0 then
    v_sum := 0;
    for ins in select * from jsonb_array_elements(p->'installments') loop
      i := i + 1;
      insert into public.debt_installments (debt_id, book_id, seq, due_date, amount, note)
      values (d.id, v_book, i, (ins->>'due_date')::date, round((ins->>'amount')::numeric, 2), nullif(ins->>'note',''));
      v_sum := v_sum + round((ins->>'amount')::numeric, 2);
    end loop;
    if v_sum <> v_amt then raise exception 'مجموع الأقساط (%) لا يساوي مبلغ الدين (%)', v_sum, v_amt; end if;
  else
    insert into public.debt_installments (debt_id, book_id, seq, due_date, amount)
    values (d.id, v_book, 1, coalesce(d.due_date, (v_date + interval '1 month')::date), v_amt);
  end if;
  update public.debts set due_date = (select max(due_date) from public.debt_installments where debt_id = d.id)
   where id = d.id returning * into d;

  v_ctrl_line := jsonb_build_object('account_id', v_ctrl, 'party_id', v_party.id, 'currency', v_cur, 'fx_rate', v_rate,
                   'description', coalesce(d.title, case when v_dir='receivable' then 'دين لي على ' else 'دين عليّ لـ ' end || v_party.name));
  v_cnt_line := jsonb_build_object('account_id', v_counter, 'currency', case when v_cash.id is not null then v_cash.currency else v_cur end,
                   'fx_rate', v_cash_rate);
  if v_dir = 'receivable' then
    v_lines := jsonb_build_array(v_ctrl_line || jsonb_build_object('debit', v_amt),
                                 v_cnt_line || jsonb_build_object('credit', v_cash_amt));
  else
    v_lines := jsonb_build_array(v_cnt_line || jsonb_build_object('debit', v_cash_amt),
                                 v_ctrl_line || jsonb_build_object('credit', v_amt));
  end if;

  insert into public.journal_entries (book_id, doc_type, entry_date, memo, party_id, cash_account_id, currency, fx_rate, debt_id)
  values (v_book, 'debt', v_date,
          coalesce(d.title, case when v_dir='receivable' then 'إقراض ' else 'اقتراض من ' end || v_party.name),
          v_party.id, v_cash.id, v_cur, v_rate, d.id)
  returning * into e;
  perform public._write_lines(e, v_lines);
  e := public._post(e.id);
  update public.debts set entry_id = e.id where id = d.id returning * into d;
  return d;
end $$;

create or replace function public.debt_remaining(p_debt uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select d.principal - coalesce((select sum(dp.amount) from public.debt_payments dp
                                  join public.journal_entries x on x.id = dp.entry_id
                                 where dp.debt_id = d.id and x.status = 'posted'), 0)
  from public.debts d where d.id = p_debt and (auth.uid() is null or public.can_read(d.book_id))
$$;

-- سداد دفعة (تحصيل دين لي أو سداد دين عليّ) مع فروق العملة المحققة
-- p: {debt_id, amount, pay_date, cash_account_id, fx_rate?, memo?}
create or replace function public.pay_debt(p jsonb) returns public.journal_entries
language plpgsql security definer set search_path = public as $$
declare
  d public.debts; v_party public.parties; v_cash public.cash_accounts; e public.journal_entries;
  v_amt numeric; v_rem numeric; v_date date; v_rate_now numeric; v_carry numeric; v_now numeric; v_diff numeric;
  v_cash_rate numeric; v_cash_amt numeric; v_lines jsonb; v_ctrl jsonb; v_cashl jsonb;
begin
  select * into d from public.debts where id = (p->>'debt_id')::uuid for update;
  if d.id is null then raise exception 'الدين غير موجود'; end if;
  perform public._require_write(d.book_id);
  if d.status not in ('active') then raise exception 'الدين ليس نشطاً (الحالة: %)', d.status; end if;
  select * into v_party from public.parties where id = d.party_id;
  select * into v_cash from public.cash_accounts where id = (p->>'cash_account_id')::uuid and book_id = d.book_id;
  if v_cash.id is null then raise exception 'اختر الصندوق أو البنك'; end if;
  v_amt := round((p->>'amount')::numeric, 2);
  v_rem := public.debt_remaining(d.id);
  if v_amt is null or v_amt <= 0 then raise exception 'المبلغ يجب أن يكون أكبر من صفر'; end if;
  if v_amt > v_rem then raise exception 'المبلغ (%) أكبر من المتبقي (%)', v_amt, v_rem; end if;
  v_date := coalesce(nullif(p->>'pay_date','')::date, current_date);
  v_rate_now := case when d.currency = (select base_currency from public.books where id = d.book_id) then 1
                     else coalesce(nullif(p->>'fx_rate','')::numeric, public.rate_on(d.book_id, d.currency, v_date)) end;
  if v_rate_now is null or v_rate_now <= 0 then raise exception 'سعر صرف غير صحيح'; end if;

  v_carry := round(v_amt * d.fx_rate, 2);   -- القيمة الدفترية بسعر نشأة الدين
  v_now := round(v_amt * v_rate_now, 2);    -- القيمة الفعلية بسعر يوم السداد
  if v_cash.currency = d.currency then v_cash_amt := v_amt; v_cash_rate := v_rate_now;
  else
    v_cash_rate := public.rate_on(d.book_id, v_cash.currency, v_date);
    v_cash_amt := round(v_now / v_cash_rate, 2);
    v_cash_rate := v_now / v_cash_amt;
  end if;
  v_diff := v_now - v_carry;

  v_ctrl := jsonb_build_object('account_id', d.account_id, 'party_id', d.party_id, 'currency', d.currency, 'fx_rate', d.fx_rate,
                               'description', case when d.direction='receivable' then 'تحصيل من ' else 'سداد لـ ' end || v_party.name);
  v_cashl := jsonb_build_object('account_id', v_cash.account_id, 'currency', v_cash.currency, 'fx_rate', v_cash_rate);
  if d.direction = 'receivable' then
    v_lines := jsonb_build_array(v_cashl || jsonb_build_object('debit', v_cash_amt),
                                 v_ctrl || jsonb_build_object('credit', v_amt));
    if v_diff > 0 then v_lines := v_lines || jsonb_build_object('account_id', public._account_id(d.book_id,'fx_gain'), 'credit', v_diff, 'currency', (select base_currency from public.books where id=d.book_id), 'fx_rate', 1, 'description', 'ربح فرق عملة');
    elsif v_diff < 0 then v_lines := v_lines || jsonb_build_object('account_id', public._account_id(d.book_id,'fx_loss'), 'debit', -v_diff, 'currency', (select base_currency from public.books where id=d.book_id), 'fx_rate', 1, 'description', 'خسارة فرق عملة');
    end if;
  else
    v_lines := jsonb_build_array(v_ctrl || jsonb_build_object('debit', v_amt),
                                 v_cashl || jsonb_build_object('credit', v_cash_amt));
    if v_diff > 0 then v_lines := v_lines || jsonb_build_object('account_id', public._account_id(d.book_id,'fx_loss'), 'debit', v_diff, 'currency', (select base_currency from public.books where id=d.book_id), 'fx_rate', 1, 'description', 'خسارة فرق عملة');
    elsif v_diff < 0 then v_lines := v_lines || jsonb_build_object('account_id', public._account_id(d.book_id,'fx_gain'), 'credit', -v_diff, 'currency', (select base_currency from public.books where id=d.book_id), 'fx_rate', 1, 'description', 'ربح فرق عملة');
    end if;
  end if;

  insert into public.journal_entries (book_id, doc_type, entry_date, memo, party_id, cash_account_id, currency, fx_rate, debt_id)
  values (d.book_id, 'debt_payment', v_date,
          coalesce(nullif(p->>'memo',''), case when d.direction='receivable' then 'تحصيل دفعة من ' else 'سداد دفعة لـ ' end || v_party.name),
          d.party_id, v_cash.id, d.currency, v_rate_now, d.id)
  returning * into e;
  perform public._write_lines(e, v_lines);
  e := public._post(e.id);
  insert into public.debt_payments (debt_id, book_id, entry_id, pay_date, amount) values (d.id, d.book_id, e.id, v_date, v_amt);
  if public.debt_remaining(d.id) = 0 then update public.debts set status = 'settled' where id = d.id; end if;
  return e;
end $$;

-- إبراء/إسقاط المتبقي من دين (مثلاً تحويله إلى هبة أو ديون معدومة)
-- p: {debt_id, date, mode: 'bad_debt'|'gift', memo}
create or replace function public.forgive_debt(p jsonb) returns public.journal_entries
language plpgsql security definer set search_path = public as $$
declare d public.debts; v_party public.parties; e public.journal_entries; v_rem numeric; v_acc uuid; v_date date; v_lines jsonb;
begin
  select * into d from public.debts where id = (p->>'debt_id')::uuid for update;
  if d.id is null then raise exception 'الدين غير موجود'; end if;
  perform public._require_write(d.book_id);
  if d.status <> 'active' then raise exception 'الدين ليس نشطاً'; end if;
  select * into v_party from public.parties where id = d.party_id;
  v_rem := public.debt_remaining(d.id);
  v_date := coalesce(nullif(p->>'date','')::date, current_date);
  if d.direction = 'receivable' then
    v_acc := public._account_id(d.book_id, case when p->>'mode' = 'gift' then 'gifts_out' else 'bad_debts' end);
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_acc, 'debit', v_rem, 'currency', d.currency, 'fx_rate', d.fx_rate, 'party_id', d.party_id),
      jsonb_build_object('account_id', d.account_id, 'credit', v_rem, 'currency', d.currency, 'fx_rate', d.fx_rate, 'party_id', d.party_id));
  else
    v_acc := public._account_id(d.book_id, 'gifts_in');
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', d.account_id, 'debit', v_rem, 'currency', d.currency, 'fx_rate', d.fx_rate, 'party_id', d.party_id),
      jsonb_build_object('account_id', v_acc, 'credit', v_rem, 'currency', d.currency, 'fx_rate', d.fx_rate, 'party_id', d.party_id));
  end if;
  insert into public.journal_entries (book_id, doc_type, entry_date, memo, party_id, currency, fx_rate, debt_id)
  values (d.book_id, 'debt_payment', v_date,
          coalesce(nullif(p->>'memo',''), 'إبراء المتبقي من دين ' || v_party.name), d.party_id, d.currency, d.fx_rate, d.id)
  returning * into e;
  perform public._write_lines(e, v_lines);
  e := public._post(e.id);
  insert into public.debt_payments (debt_id, book_id, entry_id, pay_date, amount, kind) values (d.id, d.book_id, e.id, v_date, v_rem, 'forgiveness');
  update public.debts set status = 'forgiven' where id = d.id;
  return e;
end $$;

-- إعادة جدولة الأقساط (للمتبقي فقط؛ الأقساط القديمة تُستبدل)
create or replace function public.reschedule_debt(p_debt uuid, p_installments jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare d public.debts; v_paid numeric; v_sum numeric := 0; ins jsonb; i int := 0;
begin
  select * into d from public.debts where id = p_debt for update;
  if d.id is null then raise exception 'الدين غير موجود'; end if;
  perform public._require_write(d.book_id);
  if d.status <> 'active' then raise exception 'الدين ليس نشطاً'; end if;
  v_paid := d.principal - public.debt_remaining(d.id);
  delete from public.debt_installments where debt_id = d.id;
  if v_paid > 0 then
    insert into public.debt_installments (debt_id, book_id, seq, due_date, amount, note)
    values (d.id, d.book_id, 1, coalesce((select max(pay_date) from public.debt_payments where debt_id = d.id), d.start_date), v_paid, 'المسدد قبل إعادة الجدولة');
    i := 1;
  end if;
  for ins in select * from jsonb_array_elements(p_installments) loop
    i := i + 1;
    insert into public.debt_installments (debt_id, book_id, seq, due_date, amount, note)
    values (d.id, d.book_id, i, (ins->>'due_date')::date, round((ins->>'amount')::numeric,2), nullif(ins->>'note',''));
    v_sum := v_sum + round((ins->>'amount')::numeric,2);
  end loop;
  if v_sum <> d.principal - v_paid then
    raise exception 'مجموع الأقساط الجديدة (%) يجب أن يساوي المتبقي (%)', v_sum, d.principal - v_paid;
  end if;
  update public.debts set due_date = (select max(due_date) from public.debt_installments where debt_id = d.id) where id = d.id;
end $$;

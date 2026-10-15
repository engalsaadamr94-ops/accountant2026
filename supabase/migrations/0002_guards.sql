-- ═══════════════════════════════════════════════════════════════════
-- الصلاحيات المساعدة، الحمايات (Triggers)، سجل التدقيق
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.book_role(p_book uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.book_members where book_id = p_book and user_id = auth.uid()
$$;

create or replace function public.can_read(p_book uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.book_members where book_id = p_book and user_id = auth.uid())
$$;

create or replace function public.can_write(p_book uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.book_members where book_id = p_book and user_id = auth.uid()
                 and role in ('owner','admin','accountant'))
$$;

create or replace function public.can_admin(p_book uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.book_members where book_id = p_book and user_id = auth.uid()
                 and role in ('owner','admin'))
$$;

-- هل التعديل قادم من مستخدم عادي مباشرة (وليس من دالة نظام SECURITY DEFINER)؟
create or replace function public._is_client() returns boolean
language sql stable as $$
  select current_user in ('authenticated','anon')
$$;

-- ───────────── حماية القيود المرحّلة ─────────────
create or replace function public.trg_entries_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    -- الحذف المتتالي عند حذف الدفتر كاملاً يتم بصلاحية مالك الجدول، فلا يمر من هنا كعميل
    if old.status <> 'draft' and public._is_client() then
      raise exception 'لا يمكن حذف قيد مرحّل؛ استخدم «عكس القيد»' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and public._is_client() then
      raise exception 'لا يمكن تعديل قيد مرحّل؛ استخدم «عكس القيد»' using errcode = 'P0001';
    end if;
    if public._is_client() and (new.status <> old.status or new.number is distinct from old.number) then
      raise exception 'تغيير حالة القيد أو رقمه يتم عبر دوال الترحيل فقط' using errcode = 'P0001';
    end if;
    if new.book_id <> old.book_id then
      raise exception 'لا يمكن نقل القيد إلى دفتر آخر';
    end if;
    new.updated_at := now();
    return new;
  end if;
  -- INSERT
  if public._is_client() and new.status <> 'draft' then
    raise exception 'القيد يُنشأ كمسودة ثم يُرحَّل عبر دالة الترحيل' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger entries_guard before insert or update or delete on public.journal_entries
for each row execute function public.trg_entries_guard();

create or replace function public.trg_lines_guard() returns trigger
language plpgsql as $$
declare st text; bk uuid;
begin
  select status, book_id into st, bk from public.journal_entries
   where id = coalesce(new.entry_id, old.entry_id);
  if st is null then
    -- القيد نفسه يُحذف (حذف متتالٍ لمسودة)
    return coalesce(new, old);
  end if;
  if st <> 'draft' and public._is_client() then
    raise exception 'لا يمكن تعديل أسطر قيد مرحّل' using errcode = 'P0001';
  end if;
  if tg_op <> 'DELETE' then
    if new.book_id <> bk then
      raise exception 'سطر القيد لا ينتمي لنفس الدفتر';
    end if;
    return new;
  end if;
  return old;
end $$;

create trigger lines_guard before insert or update or delete on public.journal_lines
for each row execute function public.trg_lines_guard();

-- ───────────── حماية شجرة الحسابات ─────────────
create or replace function public.trg_accounts_guard() returns trigger
language plpgsql as $$
declare has_lines boolean; p record;
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id) then
    if new.parent_id is not null then
      select * into p from public.accounts where id = new.parent_id;
      if p.book_id <> new.book_id then raise exception 'الحساب الأب من دفتر آخر'; end if;
      if p.type <> new.type then
        raise exception 'نوع الحساب الفرعي يجب أن يطابق نوع الحساب الأب (%)', p.type;
      end if;
      if exists (select 1 from public.journal_lines where account_id = new.parent_id) then
        raise exception 'لا يمكن إضافة حساب فرعي تحت «%» لأن عليه حركات', p.name;
      end if;
      -- منع الحلقات الدائرية
      if tg_op = 'UPDATE' and exists (
        with recursive up as (
          select id, parent_id from public.accounts where id = new.parent_id
          union all select a.id, a.parent_id from public.accounts a join up on a.id = up.parent_id
        ) select 1 from up where id = new.id) then
        raise exception 'لا يمكن جعل الحساب فرعياً لأحد فروعه';
      end if;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.type <> old.type or new.book_id <> old.book_id then
      select exists (select 1 from public.journal_lines where account_id = old.id) into has_lines;
      if has_lines then raise exception 'لا يمكن تغيير نوع حساب عليه حركات'; end if;
    end if;
    if new.is_postable is distinct from old.is_postable and public._is_client() then
      raise exception 'خاصية قبول القيود تُحدد آلياً حسب وجود حسابات فرعية';
    end if;
    if old.system_key is not null and new.system_key is distinct from old.system_key and public._is_client() then
      raise exception 'لا يمكن تغيير مفتاح حساب نظامي';
    end if;
  end if;
  if tg_op = 'DELETE' then
    if old.system_key is not null and public._is_client() then
      raise exception 'لا يمكن حذف حساب نظامي؛ يمكنك تعطيله';
    end if;
    if public._is_client() and exists (select 1 from public.accounts where parent_id = old.id) then
      raise exception 'لا يمكن حذف حساب له فروع';
    end if;
    return old;
  end if;
  return new;
end $$;

create trigger accounts_guard before insert or update or delete on public.accounts
for each row execute function public.trg_accounts_guard();

-- تحديث خاصية «يقبل قيوداً» للأب بعد إضافة/نقل/حذف الفروع
create or replace function public.trg_accounts_postable() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT','UPDATE') and new.parent_id is not null then
    update public.accounts set is_postable = false where id = new.parent_id and is_postable;
  end if;
  if tg_op in ('UPDATE','DELETE') and old.parent_id is not null then
    update public.accounts a set is_postable = true
     where a.id = old.parent_id
       and not exists (select 1 from public.accounts c where c.parent_id = a.id);
  end if;
  return null;
end $$;

create trigger accounts_postable after insert or update of parent_id or delete on public.accounts
for each row execute function public.trg_accounts_postable();

-- ───────────── حماية الأطراف والصناديق من الحذف إن كان عليها حركات ─────────────
create or replace function public.trg_no_delete_with_lines() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'parties' and exists (select 1 from public.journal_lines where party_id = old.id) then
    raise exception 'لا يمكن حذف «%» لأن عليه حركات؛ يمكنك تعطيله', old.name;
  end if;
  if tg_table_name = 'cost_centers' and exists (select 1 from public.journal_lines where cost_center_id = old.id) then
    raise exception 'لا يمكن حذف مركز تكلفة عليه حركات؛ يمكنك تعطيله';
  end if;
  return old;
end $$;

create trigger parties_no_delete before delete on public.parties
for each row execute function public.trg_no_delete_with_lines();
create trigger cost_centers_no_delete before delete on public.cost_centers
for each row execute function public.trg_no_delete_with_lines();

-- ───────────── منع تغيير إعدادات حساسة في الدفتر لغير المدير ─────────────
create or replace function public.trg_books_guard() returns trigger
language plpgsql as $$
begin
  if new.base_currency <> old.base_currency and exists (
     select 1 from public.journal_entries where book_id = old.id and status <> 'draft') then
    raise exception 'لا يمكن تغيير العملة الأساسية بعد ترحيل قيود';
  end if;
  if new.base_currency <> old.base_currency and public._is_client() then
    raise exception 'العملة الأساسية تُحدد عند إنشاء الدفتر ولا تتغير';
  end if;
  if new.created_by <> old.created_by and public._is_client() then
    raise exception 'لا يمكن تغيير منشئ الدفتر';
  end if;
  return new;
end $$;

create trigger books_guard before update on public.books
for each row execute function public.trg_books_guard();

-- عضو المالك لا يُحذف ولا يُخفَّض إلا بنقل الملكية
create or replace function public.trg_members_guard() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.role = 'owner' and public._is_client() then
    if (select count(*) from public.book_members where book_id = old.book_id and role = 'owner') <= 1
       and (tg_op = 'DELETE' or new.role <> 'owner') then
      raise exception 'لا يمكن إزالة آخر مالك للدفتر';
    end if;
  end if;
  -- صفوف المالكين لا يعدّلها أو يحذفها إلا مالك
  if tg_op in ('UPDATE','DELETE') and old.role = 'owner' and public._is_client()
     and coalesce(public.book_role(old.book_id), '') <> 'owner' and old.user_id <> auth.uid() then
    raise exception 'المالك وحده يستطيع تعديل صلاحية مالك آخر';
  end if;
  if tg_op in ('INSERT','UPDATE') and new.role = 'owner' and public._is_client()
     and coalesce(public.book_role(new.book_id), '') <> 'owner' then
    raise exception 'المالك وحده يستطيع منح صلاحية المالك';
  end if;
  return coalesce(new, old);
end $$;

create trigger members_guard before insert or update or delete on public.book_members
for each row execute function public.trg_members_guard();

-- ───────────── سجل التدقيق ─────────────
create or replace function public.trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb; bk uuid; rid text;
begin
  r := to_jsonb(coalesce(new, old));
  bk := case when tg_table_name = 'books' then (r->>'id')::uuid else (r->>'book_id')::uuid end;
  rid := coalesce(r->>'id', r->>'user_id', r->>'code');
  insert into public.audit_log (book_id, table_name, row_id, action, old_data, new_data, user_id)
  values (bk, tg_table_name, rid, lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['books','book_members','accounts','cost_centers','parties','cash_accounts',
                           'journal_entries','debts','debt_installments','currencies','fx_rates','entry_templates']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.trg_audit()', t);
  end loop;
end $$;

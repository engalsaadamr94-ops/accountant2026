-- محاسبي — ملف الإعداد الكامل لقاعدة البيانات (كل الـ migrations بالترتيب)
-- شغّله مرة واحدة في Supabase: SQL Editor ← New query ← الصق ← Run


-- ════════ 0001_core.sql ════════
-- ═══════════════════════════════════════════════════════════════════
-- محاسبي — المرحلة الأولى: الجداول الأساسية
-- قيد مزدوج، دفاتر متعددة لكل مستخدم، أعضاء بصلاحيات، تعدد عملات.
-- المبالغ بنوع numeric (دقيق، بلا أخطاء فاصلة عائمة).
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────────── الملف الشخصي ─────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- ───────────── الدفاتر (كل دفتر = منشأة/ذمة مالية مستقلة) ─────────────
create table public.books (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  base_currency text not null default 'SAR',
  fiscal_year_start_month int not null default 1 check (fiscal_year_start_month between 1 and 12),
  has_business boolean not null default true,
  vat_enabled boolean not null default false,
  vat_rate numeric(5,2) not null default 15 check (vat_rate >= 0 and vat_rate <= 100),
  vat_number text,
  owner_name text,
  phone text,
  address text,
  -- تاريخ الإقفال: لا يُسمح بترحيل أو عكس أي قيد بتاريخ مساوٍ له أو قبله
  lock_date date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.book_members (
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','accountant','viewer')),
  created_at timestamptz not null default now(),
  primary key (book_id, user_id)
);
create index on public.book_members (user_id);

-- ───────────── العملات وأسعار الصرف ─────────────
create table public.currencies (
  book_id uuid not null references public.books(id) on delete cascade,
  code text not null check (code ~ '^[A-Z_]{3,8}$'),
  name text not null,
  symbol text,
  is_base boolean not null default false,
  is_active boolean not null default true,
  -- سعر الصرف الافتراضي: كم وحدة من العملة الأساسية تساوي وحدة واحدة من هذه العملة
  default_rate numeric(20,10) not null default 1 check (default_rate > 0),
  primary key (book_id, code)
);

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  currency_code text not null,
  rate_date date not null,
  rate numeric(20,10) not null check (rate > 0),
  created_at timestamptz not null default now(),
  unique (book_id, currency_code, rate_date),
  foreign key (book_id, currency_code) references public.currencies(book_id, code) on delete cascade
);

-- ───────────── دليل الحسابات ─────────────
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  code text not null,
  name text not null check (length(trim(name)) > 0),
  parent_id uuid references public.accounts(id),
  type text not null check (type in ('asset','liability','equity','revenue','expense')),
  scope text not null default 'both' check (scope in ('personal','business','both')),
  -- يُحدَّث آلياً: الحساب الذي له فروع لا يقبل قيوداً
  is_postable boolean not null default true,
  system_key text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (book_id, code),
  unique (book_id, system_key)
);
create index on public.accounts (book_id, parent_id);

-- ───────────── مراكز التكلفة (شخصي، عمل حر، مشاريع) ─────────────
create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null default 'project' check (kind in ('personal','business','project')),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (book_id, code)
);

-- ───────────── الأطراف: عملاء، موردون، أشخاص ─────────────
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'person' check (kind in ('customer','supplier','both','person')),
  relation text,           -- قريب، صديق، زميل، جهة...
  phone text,
  email text,
  vat_number text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.parties (book_id, name);

-- ───────────── الصناديق والبنوك والمحافظ والبطاقات ─────────────
create table public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('cash','bank','wallet','card')),
  account_id uuid not null unique references public.accounts(id),
  currency text not null,
  bank_name text,
  iban text,
  allow_negative boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (book_id, currency) references public.currencies(book_id, code)
);

-- ───────────── القيود (كل سند يولّد قيداً) ─────────────
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'journal','receipt','payment','transfer','expense','income',
    'opening','debt','debt_payment','reversal','adjustment','closing')),
  number int,
  number_text text,
  fiscal_year int,
  entry_date date not null,
  status text not null default 'draft' check (status in ('draft','posted','reversed')),
  memo text,
  reference text,
  party_id uuid references public.parties(id),
  cash_account_id uuid references public.cash_accounts(id),
  cost_center_id uuid references public.cost_centers(id),
  currency text not null,
  fx_rate numeric(20,10) not null default 1 check (fx_rate > 0),
  total numeric(18,2) not null default 0,
  reverses_id uuid references public.journal_entries(id),
  reversed_by_id uuid references public.journal_entries(id),
  debt_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_by uuid,
  posted_at timestamptz,
  unique (book_id, doc_type, fiscal_year, number)
);
create index on public.journal_entries (book_id, status, entry_date);
create index on public.journal_entries (book_id, doc_type, entry_date);
create index on public.journal_entries (debt_id);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  line_no int not null,
  account_id uuid not null references public.accounts(id),
  party_id uuid references public.parties(id),
  cost_center_id uuid references public.cost_centers(id),
  description text,
  currency text not null,
  fx_rate numeric(20,10) not null default 1 check (fx_rate > 0),
  debit_fc numeric(18,2) not null default 0 check (debit_fc >= 0),
  credit_fc numeric(18,2) not null default 0 check (credit_fc >= 0),
  debit numeric(18,2) not null default 0 check (debit >= 0),
  credit numeric(18,2) not null default 0 check (credit >= 0),
  check (not (debit_fc > 0 and credit_fc > 0)),
  check (debit_fc > 0 or credit_fc > 0 or debit > 0 or credit > 0)
);
create index on public.journal_lines (entry_id);
create index on public.journal_lines (account_id);
create index on public.journal_lines (party_id);
create index on public.journal_lines (cost_center_id);
create index on public.journal_lines (book_id);

-- ترقيم تسلسلي بلا فجوات لكل نوع سند ولكل سنة مالية
create table public.doc_sequences (
  book_id uuid not null references public.books(id) on delete cascade,
  series text not null,
  fiscal_year int not null,
  last_value int not null default 0,
  primary key (book_id, series, fiscal_year)
);

-- ───────────── الديون (لي وعليّ) ─────────────
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  direction text not null check (direction in ('receivable','payable')),
  kind text not null default 'loan' check (kind in ('loan','credit_sale','credit_purchase','financing','card','jamiya','other')),
  party_id uuid not null references public.parties(id),
  title text,
  currency text not null,
  fx_rate numeric(20,10) not null default 1 check (fx_rate > 0),
  principal numeric(18,2) not null check (principal > 0),
  start_date date not null,
  due_date date,
  account_id uuid not null references public.accounts(id),
  entry_id uuid references public.journal_entries(id),
  status text not null default 'active' check (status in ('active','settled','forgiven','cancelled')),
  reminder_days int not null default 3 check (reminder_days between 0 and 60),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.debts (book_id, direction, status);
alter table public.journal_entries add constraint journal_entries_debt_fk foreign key (debt_id) references public.debts(id);

create table public.debt_installments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  seq int not null,
  due_date date not null,
  amount numeric(18,2) not null check (amount > 0),
  note text,
  unique (debt_id, seq)
);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  entry_id uuid not null unique references public.journal_entries(id),
  pay_date date not null,
  amount numeric(18,2) not null check (amount > 0),
  kind text not null default 'payment' check (kind in ('payment','forgiveness')),
  created_at timestamptz not null default now()
);
create index on public.debt_payments (debt_id);

-- ───────────── قوالب العمليات السريعة ─────────────
create table public.entry_templates (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  name text not null,
  doc_type text not null,
  payload jsonb not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ───────────── سجل التدقيق (إلحاق فقط) ─────────────
create table public.audit_log (
  id bigserial primary key,
  book_id uuid,
  table_name text not null,
  row_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  at timestamptz not null default now()
);
create index on public.audit_log (book_id, at desc);

-- ════════ 0002_guards.sql ════════
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

-- ════════ 0003_posting.sql ════════
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

-- ════════ 0004_setup_debts.sql ════════
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

-- ════════ 0005_reports_rls.sql ════════
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

-- ════════ 0006_more_reports.sql ════════
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

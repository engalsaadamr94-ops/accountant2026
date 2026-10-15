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

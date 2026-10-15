// أنواع البيانات كما ترجع من قاعدة البيانات (numeric يصل رقماً أو نصاً حسب القيمة)
export type Num = number | string;

export type Role = "owner" | "admin" | "accountant" | "viewer";
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type Scope = "personal" | "business" | "both";
export type DocType =
  | "journal" | "receipt" | "payment" | "transfer" | "expense" | "income"
  | "opening" | "debt" | "debt_payment" | "reversal" | "adjustment" | "closing";

export type Book = {
  id: string; name: string; base_currency: string; fiscal_year_start_month: number; has_business: boolean;
  vat_enabled: boolean; vat_rate: Num; vat_number: string | null; owner_name: string | null; phone: string | null;
  address: string | null; lock_date: string | null; created_by: string; created_at: string;
};

export type Currency = { book_id: string; code: string; name: string; symbol: string | null; is_base: boolean; is_active: boolean; default_rate: Num };

export type Account = {
  id: string; book_id: string; code: string; name: string; parent_id: string | null; type: AccountType; scope: Scope;
  is_postable: boolean; system_key: string | null; is_active: boolean; notes: string | null;
};

export type CostCenter = { id: string; book_id: string; code: string; name: string; kind: "personal" | "business" | "project"; is_active: boolean; notes: string | null };

export type Party = {
  id: string; book_id: string; name: string; kind: "customer" | "supplier" | "both" | "person"; relation: string | null;
  phone: string | null; email: string | null; vat_number: string | null; address: string | null; notes: string | null; is_active: boolean;
};

export type CashAccount = {
  id: string; book_id: string; name: string; kind: "cash" | "bank" | "wallet" | "card"; account_id: string; currency: string;
  bank_name: string | null; iban: string | null; allow_negative: boolean; is_active: boolean; sort_order: number;
};
export type CashBalance = CashAccount & { account_code: string; balance_fc: Num; balance_base: Num; last_date: string | null };

export type Entry = {
  id: string; book_id: string; doc_type: DocType; number: number | null; number_text: string | null; fiscal_year: number | null;
  entry_date: string; status: "draft" | "posted" | "reversed"; memo: string | null; reference: string | null;
  party_id: string | null; cash_account_id: string | null; cost_center_id: string | null; currency: string; fx_rate: Num;
  total: Num; reverses_id: string | null; reversed_by_id: string | null; debt_id: string | null; meta: Record<string, unknown>;
  created_by: string | null; created_at: string; posted_at: string | null; posted_by: string | null;
};

export type Line = {
  id: string; entry_id: string; line_no: number; account_id: string; party_id: string | null; cost_center_id: string | null;
  description: string | null; currency: string; fx_rate: Num; debit_fc: Num; credit_fc: Num; debit: Num; credit: Num;
};

export type Debt = {
  id: string; book_id: string; direction: "receivable" | "payable"; kind: string; party_id: string; title: string | null;
  currency: string; fx_rate: Num; principal: Num; start_date: string; due_date: string | null; account_id: string;
  entry_id: string | null; status: "active" | "settled" | "forgiven" | "cancelled"; reminder_days: number; notes: string | null;
  party_name: string; party_phone: string | null; paid: Num; remaining: Num; remaining_base: Num;
  next_due_date: string | null; next_due_amount: Num | null; overdue_amount: Num; created_at: string;
};

export type Installment = { id: string; debt_id: string; seq: number; due_date: string; amount: Num; paid: Num; note: string | null; state: "paid" | "partial" | "overdue" | "upcoming" };

export type PartyBalance = { party_id: string; book_id: string; name: string; kind: Party["kind"]; phone: string | null; relation: string | null; is_active: boolean; receivable: Num; payable: Num; net: Num; last_date: string | null };

export type StatementRow = {
  line_id: string | null; entry_id: string | null; entry_date: string | null; number_text: string | null; doc_type: DocType | null;
  description: string | null; account_id: string | null; party_id: string | null; currency: string | null;
  debit_fc: Num | null; credit_fc: Num | null; debit: Num | null; credit: Num | null; balance: Num; balance_fc: Num; is_opening: boolean; seq: number;
};

export type TBRow = { account_id: string; opening: Num; debit: Num; credit: Num; closing: Num };

export type Template = { id: string; book_id: string; name: string; doc_type: DocType; payload: VoucherDraft; sort_order: number };

export type VoucherDraft = {
  kind: VoucherKind;
  cash_account_id?: string;
  to_cash_account_id?: string;
  party_id?: string;
  cost_center_id?: string;
  memo?: string;
  rows?: { account_id: string; amount: number | string; description?: string; cost_center_id?: string; party_id?: string }[];
  amount?: number | string;
};

export type VoucherKind = "expense" | "income" | "receipt" | "payment" | "transfer" | "journal";

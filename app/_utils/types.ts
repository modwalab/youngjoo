export type Contract = {
  id: string;
  contract_date: string | null;
  customer_name: string | null;
  product_name: string | null;
  monthly_premium: number | null;
  converted_premium: number | null;
  payment_period: string | null;
  insurance_company: string | null;
  design_number: string | null;
  memo: string | null;
  extra: Record<string, string>;
  created_at?: string;
};

export type CustomFieldDef = {
  id: string;
  field_key: string;
  label: string;
  sort_order: number;
};

export type FixedFieldDef = {
  key: keyof Omit<Contract, "id" | "extra" | "created_at">;
  label: string;
  type: "date" | "text" | "number";
};

export const FIXED_FIELDS: FixedFieldDef[] = [
  { key: "contract_date", label: "계약날짜", type: "date" },
  { key: "customer_name", label: "고객명", type: "text" },
  { key: "product_name", label: "상품명", type: "text" },
  { key: "monthly_premium", label: "월납보험료", type: "number" },
  { key: "converted_premium", label: "환산보험료", type: "number" },
  { key: "payment_period", label: "납입기간", type: "text" },
  { key: "insurance_company", label: "보험사명", type: "text" },
  { key: "design_number", label: "가입설계번호", type: "text" },
  { key: "memo", label: "비고", type: "text" },
];

export type AssetType = "vehicle" | "real_estate" | "investment" | "business" | "other" | "cash" | "retirement" | "personal";

export const ASSET_TYPE_META: Record<AssetType, { label: string; icon: string }> = {
  vehicle:     { label: "Vehicle",          icon: "🚗" },
  real_estate: { label: "Real Property",    icon: "🏠" },
  investment:  { label: "Investment",       icon: "📈" },
  business:    { label: "Business",         icon: "💼" },
  other:       { label: "Other",            icon: "📋" },
  cash:        { label: "Cash & Savings",   icon: "💵" },
  retirement:  { label: "Retirement",       icon: "🏦" },
  personal:    { label: "Personal Property",icon: "💍" },
};

export const ASSET_ICONS = ["🚗", "🏠", "📈", "🏢", "💎", "⌚", "💻", "🎸", "🛥️", "✈️"];

export interface AssetSummary {
  id: string;
  name: string;
  icon: string;
  asset_type: AssetType;
  current_value: number;
  is_liquid: boolean;
  linked_debt_id: string | null;
  linked_debt_name: string | null;
  linked_debt_balance: number | null;
  net_equity: number;
  created_at: string;
}

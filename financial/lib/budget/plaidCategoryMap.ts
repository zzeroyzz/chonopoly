// Maps Plaid's personal_finance_category.primary values (new API)
// and legacy string-array categories to internal category names.

export const PLAID_PRIMARY_MAP: Record<string, string> = {
  FOOD_AND_DRINK:      "Food & Drink",
  TRANSPORTATION:      "Transportation",
  ENTERTAINMENT:       "Entertainment",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT:    "Home",
  MEDICAL:             "Medical",
  PERSONAL_CARE:       "Personal Care",
  TRAVEL:              "Travel",
  INCOME:              "Income",
  TRANSFER_IN:         "Income",
  TRANSFER_OUT:        "Uncategorized",
  LOAN_PAYMENTS:       "Uncategorized",
  BANK_FEES:           "Uncategorized",
};

// Legacy Plaid category array: first meaningful keyword → internal name
const LEGACY_KEYWORD_MAP: Array<{ keywords: string[]; category: string }> = [
  { keywords: ["groceries", "supermarkets"],                     category: "Food & Drink" },
  { keywords: ["restaurants", "fast food", "food and drink"],    category: "Food & Drink" },
  { keywords: ["gas stations", "fuel", "transportation"],        category: "Transportation" },
  { keywords: ["taxi", "ride share", "parking", "automotive"],   category: "Transportation" },
  { keywords: ["airlines", "travel", "hotels", "lodging"],       category: "Travel" },
  { keywords: ["entertainment", "recreation", "arts"],           category: "Entertainment" },
  { keywords: ["gyms", "fitness", "sports"],                     category: "Personal Care" },
  { keywords: ["pharmacies", "healthcare", "hospital", "doctor"], category: "Medical" },
  { keywords: ["shops", "shopping", "clothing", "electronics"],  category: "Shopping" },
  { keywords: ["home improvement", "utilities", "rent"],         category: "Home" },
  { keywords: ["personal care", "hair", "spa", "salon"],         category: "Personal Care" },
  { keywords: ["income", "payroll", "deposit"],                  category: "Income" },
];

/**
 * Resolves a Plaid transaction to an internal category name.
 * Accepts either the new personal_finance_category.primary string
 * or the legacy category string array.
 */
export function mapPlaidCategory(
  primaryCategory: string | undefined,
  legacyCategories?: string[]
): string {
  if (primaryCategory) {
    const mapped = PLAID_PRIMARY_MAP[primaryCategory.toUpperCase()];
    if (mapped) return mapped;
  }

  if (legacyCategories?.length) {
    const haystack = legacyCategories.join(" ").toLowerCase();
    for (const { keywords, category } of LEGACY_KEYWORD_MAP) {
      if (keywords.some((k) => haystack.includes(k))) return category;
    }
  }

  return "Uncategorized";
}

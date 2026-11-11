export type TransactionCategoryInput = { id: string; name: string };

export type TransactionCategoryFilter = {
  key: string;
  name: string;
  lineIds: string[];
  preferredLineId: string;
};

export function groupTransactionCategories(
  lines: readonly TransactionCategoryInput[],
): TransactionCategoryFilter[] {
  const grouped = new Map<string, TransactionCategoryFilter>();
  for (const line of lines) {
    const name = line.name.trim();
    const normalized = name.toLowerCase();
    if (!normalized) continue;
    const existing = grouped.get(normalized);
    if (existing) {
      if (!existing.lineIds.includes(line.id)) existing.lineIds.push(line.id);
      continue;
    }
    grouped.set(normalized, {
      key: `category:${normalized}`,
      name,
      lineIds: [line.id],
      preferredLineId: line.id,
    });
  }
  return [...grouped.values()];
}

export function parseUsageValue(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!normalized) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function formatUsageValue(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: 2,
  }).format(value);
}

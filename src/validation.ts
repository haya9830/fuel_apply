/** Decimal input only: accept Japanese full-width digits, never hex/exponent notation. */
export function parseUsageValue(input: string): number | null {
  const normalized = input.normalize("NFKC").trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function formatUsageValue(value: number): string {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 20 }).format(
    value,
  );
}

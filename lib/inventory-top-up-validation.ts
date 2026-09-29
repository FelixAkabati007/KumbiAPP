const MAX_TOP_UP = 1_000_000_000;

export function parsePositiveQuantity(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  if (!text || !/^(?:\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const quantity = Number(text);
  return Number.isFinite(quantity) && quantity > 0 && quantity <= MAX_TOP_UP ? quantity : null;
}


export interface ReceiptStats {
  today: number;
  week: number;
  month: number;
  total: number;
}

export function getReceiptStats(): ReceiptStats {
  // TODO: Implement actual stats retrieval (e.g., from API or local storage)
  // Currently returning default values to prevent runtime errors
  return {
    today: 0,
    week: 0,
    month: 0,
    total: 0,
  };
}

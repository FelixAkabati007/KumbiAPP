
export interface ReceiptStats {
  today: number;
  week: number;
  month: number;
  total: number;
}

export function emptyReceiptStats(): ReceiptStats {
  return { today: 0, week: 0, month: 0, total: 0 };
}

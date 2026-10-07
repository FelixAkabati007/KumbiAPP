export const SHORT_STAY_DURATION_MINUTES = 130;
export const SHORT_STAY_REMINDER_MINUTES = 20;

export function isShortStayRoomType(name: string | null | undefined) {
  return /short time|short stay/i.test(name ?? "");
}

export function addShortStayDuration(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid short-stay check-in time");
  return new Date(date.getTime() + SHORT_STAY_DURATION_MINUTES * 60_000);
}

export function shortStayReminderAt(checkoutDueAt: Date | string) {
  const date = checkoutDueAt instanceof Date ? checkoutDueAt : new Date(checkoutDueAt);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid short-stay checkout time");
  return new Date(date.getTime() - SHORT_STAY_REMINDER_MINUTES * 60_000);
}

export function formatCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

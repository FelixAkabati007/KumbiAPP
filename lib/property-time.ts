export const PROPERTY_TIME_ZONE = "Africa/Accra";
export const HOTEL_BOOKING_WINDOW_HOURS = 24;

export function getPropertyTimeZone() {
  return process.env.KUMBI_PROPERTY_TIMEZONE?.trim() || PROPERTY_TIME_ZONE;
}

export function addHotelBookingWindow(checkIn: Date | string) {
  const checkInDate = checkIn instanceof Date ? checkIn : new Date(checkIn);
  if (Number.isNaN(checkInDate.getTime())) throw new Error("Invalid check-in timestamp");
  return new Date(checkInDate.getTime() + HOTEL_BOOKING_WINDOW_HOURS * 60 * 60 * 1000);
}

export function isHotelWindowOverdue(checkIn: Date | string, now = new Date()) {
  return now.getTime() >= addHotelBookingWindow(checkIn).getTime();
}

export function formatPropertyDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-GH", {
    timeZone: getPropertyTimeZone(),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value instanceof Date ? value : new Date(value));
}

const AISENSE_TIME_ENDPOINT = "https://aisenseapi.com/services/v1/datetime/+0000";

export async function getAuthoritativeNow() {
  try {
    const response = await fetch(AISENSE_TIME_ENDPOINT, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Time API returned ${response.status}`);
    const payload = (await response.json()) as { datetime?: string };
    const value = payload.datetime ? new Date(payload.datetime) : null;
    if (value && !Number.isNaN(value.getTime())) return value;
  } catch {
    // Fall back to the runtime clock when the public service is unavailable.
  }
  return new Date();
}

export async function propertyNowIso() {
  return (await getAuthoritativeNow()).toISOString();
}

export { AISENSE_TIME_ENDPOINT };

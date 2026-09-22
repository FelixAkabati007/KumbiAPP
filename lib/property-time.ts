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

export function propertyNowIso() {
  return new Date().toISOString();
}

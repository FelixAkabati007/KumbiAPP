import { getPropertyTimeZone } from "@/lib/property-time";

export { getPropertyTimeZone };


export function propertyDayExpression(column = "now()") {
  const timezone = getPropertyTimeZone().replace(/[^A-Za-z0-9_+\-/]/g, "");
  return `(timezone('${timezone}', ${column}))::date`;
}

export function propertyNowExpression() {
  const timezone = getPropertyTimeZone().replace(/[^A-Za-z0-9_+\-/]/g, "");
  return `timezone('${timezone}', now())`;
}

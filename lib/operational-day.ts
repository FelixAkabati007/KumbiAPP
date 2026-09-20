const DEFAULT_PROPERTY_TIMEZONE = "Africa/Accra";

export function getPropertyTimeZone() {
  const configured = process.env.KUMBI_PROPERTY_TIMEZONE?.trim();
  return configured || DEFAULT_PROPERTY_TIMEZONE;
}

export function propertyDayExpression(column = "now()") {
  const timezone = getPropertyTimeZone().replace(/[^A-Za-z0-9_+\-/]/g, "");
  return `(timezone('${timezone}', ${column}))::date`;
}

export function propertyNowExpression() {
  const timezone = getPropertyTimeZone().replace(/[^A-Za-z0-9_+\-/]/g, "");
  return `timezone('${timezone}', now())`;
}

export type FinanceDepartment = "hotel" | "restaurant" | "event" | "shared_event" | "shared";

export const financeDepartmentSql = `CASE
  WHEN LOWER(COALESCE(event_key, '')) LIKE 'f0-%' OR LOWER(COALESCE(event_key, '')) LIKE 'fo-%' OR LOWER(COALESCE(source, '')) LIKE 'f0-%' OR LOWER(COALESCE(source, '')) LIKE 'fo-%' OR LOWER(COALESCE(metadata->>'source', '')) LIKE 'f0-%' OR LOWER(COALESCE(metadata->>'source', '')) LIKE 'fo-%' OR LOWER(COALESCE(metadata->>'department', '')) LIKE 'f0-%' OR LOWER(COALESCE(metadata->>'department', '')) LIKE 'fo-%' OR LOWER(COALESCE(metadata->>'businessUnit', '')) LIKE 'f0-%' OR LOWER(COALESCE(metadata->>'businessUnit', '')) LIKE 'fo-%' THEN 'shared'
  WHEN LOWER(COALESCE(event_key, '')) LIKE 'vip-authorization%' OR LOWER(COALESCE(source, '')) LIKE 'vip-authorization%' OR LOWER(COALESCE(metadata->>'source', '')) LIKE 'vip-authorization%' OR LOWER(COALESCE(metadata->>'department', '')) LIKE 'vip-authorization%' OR LOWER(COALESCE(metadata->>'businessUnit', '')) LIKE 'vip-authorization%' THEN 'shared_event'
  WHEN LOWER(COALESCE(event_key, '')) LIKE 'event-payment:%' OR LOWER(COALESCE(source, '')) LIKE 'event-payment:%' OR LOWER(COALESCE(metadata->>'source', '')) LIKE 'event-payment:%' OR LOWER(COALESCE(metadata->>'department', '')) LIKE 'event-payment:%' OR LOWER(COALESCE(metadata->>'businessUnit', '')) LIKE 'event-payment:%' THEN 'event'
  WHEN source = 'event_booking' THEN 'event'
  WHEN LOWER(COALESCE(metadata->>'department', '')) IN ('hotel','room','accommodation','hotel-pre-checkin','hotel-pre-check-in','hotel_folio','hotel-folio','hotel-payment') OR LOWER(COALESCE(metadata->>'businessUnit', '')) IN ('hotel','room','accommodation','hotel-pre-checkin','hotel-pre-check-in','hotel_folio','hotel-folio','hotel-payment') OR LOWER(COALESCE(source, '')) IN ('hotel-pre-checkin','hotel-pre-check-in','hotel_folio','hotel-folio','hotel-payment') THEN 'hotel'
  WHEN LOWER(COALESCE(metadata->>'department', '')) IN ('restaurant','pos','food_beverage','food_and_beverage','pos-order-completion','restaurant-order','hotel-folio-restaurant') OR LOWER(COALESCE(metadata->>'businessUnit', '')) IN ('restaurant','pos','food_beverage','food_and_beverage','pos-order-completion','restaurant-order','hotel-folio-restaurant') OR LOWER(COALESCE(source, '')) IN ('pos-order-completion','restaurant-order','hotel-folio-restaurant') THEN 'restaurant'
  WHEN LOWER(COALESCE(metadata->>'sharedEvent', metadata->>'shared_event', 'false')) = 'true' OR LOWER(COALESCE(metadata->>'department', '')) IN ('shared_event','shared_events','event_shared') OR LOWER(COALESCE(metadata->>'businessUnit', '')) IN ('shared_event','shared_events','event_shared') OR LOWER(COALESCE(source, '')) IN ('shared_event','shared_events','event_shared') THEN 'shared_event'
  WHEN LOWER(COALESCE(metadata->>'department', '')) IN ('event','events','event_organization') OR LOWER(COALESCE(metadata->>'businessUnit', '')) IN ('event','events','event_organization') OR LOWER(COALESCE(source, '')) IN ('event','events','event_organization') THEN 'event'
  ELSE 'shared'
END`;

export const financeClassificationMetadata = (source: string, department?: string | null) => {
  const normalized = source.trim().toLowerCase();
  if (normalized.startsWith("f0-") || normalized.startsWith("fo-")) return { department: "Shared", businessUnit: "Corporate", classificationRule: "fo-corporate" };
  if (normalized.startsWith("vip-authorization")) return { department: "Shared Event", businessUnit: "Shared Event", classificationRule: "vip-authorization-shared-event" };
  if (normalized.startsWith("event-payment:")) return { department: "Event Organization", businessUnit: "Event Organization", classificationRule: "event-payment-event-organization" };
  return { department: department ?? "Shared" };
};

export const complimentaryLedgerMetadata = (authorizationId: string, usageId: string, amount: number, appliedBy: { id: string; name?: string | null; email?: string | null }, approvedBy?: { id: string; name?: string | null; email?: string | null }) => ({
  source: `vip-authorization-${authorizationId}`,
  department: "Shared Event",
  businessUnit: "Shared Event",
  classificationRule: "vip-authorization-shared-event",
  complimentary: true,
  waivedAmount: amount,
  paymentMethod: "complimentary-waived",
  usageId,
  performedBy: appliedBy,
  approvedBy: approvedBy ?? null,
});

export const financeDepartmentLabels: Record<FinanceDepartment, string> = {
  hotel: "Hotel",
  restaurant: "Restaurant",
  event: "Event",
  shared_event: "Shared Event",
  shared: "Shared / Corporate",
};

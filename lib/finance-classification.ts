export type FinanceDepartment = "hotel" | "restaurant" | "event" | "shared_event" | "shared";

export const financeDepartmentSql = `CASE
  WHEN LOWER(COALESCE(source, '')) LIKE 'f0-%' OR LOWER(COALESCE(metadata->>'source', '')) LIKE 'f0-%' OR LOWER(COALESCE(metadata->>'department', '')) LIKE 'f0-%' OR LOWER(COALESCE(metadata->>'businessUnit', '')) LIKE 'f0-%' THEN 'shared'
  WHEN LOWER(COALESCE(source, '')) LIKE 'vip-authorization%' OR LOWER(COALESCE(metadata->>'source', '')) LIKE 'vip-authorization%' OR LOWER(COALESCE(metadata->>'department', '')) LIKE 'vip-authorization%' OR LOWER(COALESCE(metadata->>'businessUnit', '')) LIKE 'vip-authorization%' THEN 'shared_event'
  WHEN LOWER(COALESCE(source, '')) LIKE 'event-payment:%' OR LOWER(COALESCE(metadata->>'source', '')) LIKE 'event-payment:%' OR LOWER(COALESCE(metadata->>'department', '')) LIKE 'event-payment:%' OR LOWER(COALESCE(metadata->>'businessUnit', '')) LIKE 'event-payment:%' THEN 'event'
  WHEN source = 'event_booking' THEN 'event'
  WHEN LOWER(COALESCE(metadata->>'department', metadata->>'businessUnit', source, 'shared')) IN ('hotel','room','accommodation','hotel-pre-checkin','hotel-pre-check-in','hotel_folio','hotel-folio','hotel-payment') OR source IN ('hotel-pre-checkin','hotel-pre-check-in','hotel_folio','hotel-folio','hotel-payment') THEN 'hotel'
  WHEN LOWER(COALESCE(metadata->>'department', metadata->>'businessUnit', source, 'shared')) IN ('restaurant','pos','food_beverage','food_and_beverage','pos-order-completion','restaurant-order','hotel-folio-restaurant') OR source IN ('pos-order-completion','restaurant-order','hotel-folio-restaurant') THEN 'restaurant'
  WHEN LOWER(COALESCE(metadata->>'sharedEvent', metadata->>'shared_event', 'false')) = 'true' OR LOWER(COALESCE(metadata->>'department', metadata->>'businessUnit', source, '')) IN ('shared_event','shared_events','event_shared') THEN 'shared_event'
  WHEN LOWER(COALESCE(metadata->>'department', metadata->>'businessUnit', source, 'shared')) IN ('event','events','event_organization') THEN 'event'
  ELSE 'shared'
END`;

export const financeClassificationMetadata = (source: string, department?: string | null) => {
  const normalized = source.trim().toLowerCase();
  if (normalized.startsWith("f0-")) return { department: "Shared", businessUnit: "Corporate", classificationRule: "f0-corporate" };
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

export const RECEIPT_SOURCES = ["restaurant", "hotel", "event"] as const;
export type ReceiptSource = (typeof RECEIPT_SOURCES)[number];

export const PRINT_METHODS = ["thermal", "browser", "bridge"] as const;
export type CanonicalPrintMethod = (typeof PRINT_METHODS)[number];

const sourceAliases: Record<string, ReceiptSource> = {
  pos: "restaurant",
  restaurant: "restaurant",
  sale: "restaurant",
  hotel: "hotel",
  folio: "hotel",
  reservation: "hotel",
  event: "event",
  catering: "event",
  cateringevent: "event",
};

const printMethodAliases: Record<string, CanonicalPrintMethod> = {
  thermal: "thermal",
  escpos: "thermal",
  usb: "thermal",
  serial: "thermal",
  browser: "browser",
  web: "browser",
  window: "browser",
  bridge: "bridge",
  printbridge: "bridge",
  "print-bridge": "bridge",
  tcp: "bridge",
};

export function normalizeReceiptSource(value: unknown): ReceiptSource {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return sourceAliases[normalized] ?? "restaurant";
}

export function normalizePrintMethod(value: unknown): CanonicalPrintMethod {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return printMethodAliases[normalized] ?? "browser";
}

export interface CanonicalReceiptIdentity {
  source: ReceiptSource;
  entityId: string;
  receiptNumber: string;
  version: number;
}

export function canonicalReceiptKey(identity: CanonicalReceiptIdentity): string {
  return [
    normalizeReceiptSource(identity.source),
    identity.entityId.trim(),
    identity.receiptNumber.trim().toUpperCase(),
    Math.max(1, Math.trunc(identity.version || 1)),
  ].join(":");
}

export interface CanonicalReceiptEnvelope<T> {
  identity: CanonicalReceiptIdentity;
  printMethod: CanonicalPrintMethod;
  payload: T;
}

export function canonicalizeReceipt<T>(input: {
  source?: unknown;
  entityId: string;
  receiptNumber: string;
  version?: number;
  printMethod?: unknown;
  payload: T;
}): CanonicalReceiptEnvelope<T> {
  const identity = {
    source: normalizeReceiptSource(input.source),
    entityId: input.entityId,
    receiptNumber: input.receiptNumber,
    version: Math.max(1, Math.trunc(input.version ?? 1)),
  };

  return {
    identity,
    printMethod: normalizePrintMethod(input.printMethod),
    payload: input.payload,
  };
}

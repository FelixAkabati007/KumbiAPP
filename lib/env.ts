/**
 * Environment variables utility for the application
 */

// Define environment variables
export const env = {
  // Database configuration (Neon/PostgreSQL)
  DATABASE_URL: process.env.DATABASE_URL || "",

  // App configuration
  NODE_ENV: process.env.NODE_ENV || "development",
  APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",

  // Feature flags
  ENABLE_CASH_DRAWER: process.env.NEXT_PUBLIC_ENABLE_CASH_DRAWER === "true",
  ENABLE_THERMAL_PRINTER:
    process.env.NEXT_PUBLIC_ENABLE_THERMAL_PRINTER === "true",
  ENABLE_BARCODE_SCANNER:
    process.env.NEXT_PUBLIC_ENABLE_BARCODE_SCANNER === "true",

  // Security secrets (server-side)
  JWT_SECRET: process.env.JWT_SECRET || "",
  SESSION_SECRET: process.env.SESSION_SECRET || "",
};

// Feature flags
export const features = {
  cashDrawer: env.ENABLE_CASH_DRAWER,
  thermalPrinter: env.ENABLE_THERMAL_PRINTER,
  barcodeScanner: env.ENABLE_BARCODE_SCANNER,
  // Computed capability flags used in app logic
  hasDatabase: !!env.DATABASE_URL,
};

// Validate environment variables
export function validateEnv() {
  const errors = [];
  const warnings = [];

  // Validate environment variables
  if (!env.DATABASE_URL) {
    if (env.NODE_ENV === "production") {
      errors.push("DATABASE_URL is missing (Required for Neon PostgreSQL)");
    } else {
      warnings.push(
        "DATABASE_URL is missing (App may not function correctly without DB)"
      );
    }
  } else if (
    !env.DATABASE_URL.startsWith("postgres://") &&
    !env.DATABASE_URL.startsWith("postgresql://")
  ) {
    errors.push("DATABASE_URL must start with postgres:// or postgresql://");
  }

  if (!env.JWT_SECRET && env.NODE_ENV === "production") {
    errors.push("JWT_SECRET is missing");
  }

  if (!env.SESSION_SECRET && env.NODE_ENV === "production") {
    errors.push("SESSION_SECRET is missing");
  }

  return {
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}

export default env;

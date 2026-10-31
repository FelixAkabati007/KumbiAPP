import packageJson from "../package.json";
import { query } from "./db";
import { updateSystemState } from "./system-sync";

export type UpdateCategory = "major" | "feature" | "fix" | "security" | "maintenance";

export interface SoftwareUpdate {
  id: string;
  version: string;
  build: string;
  title: string;
  description: string;
  releaseDate: string; // ISO 8601 string
  type: UpdateCategory;
  isCritical: boolean;
  details: string[];
  source?: string;
  author?: string;
}

export interface SoftwareUpdateResponse {
  currentVersion: string;
  currentBuild: string;
  latestVersion: string;
  latestBuild: string;
  isUpdateAvailable: boolean;
  branch: string;
  deploymentId: string | null;
  source: string;
  checkedAt: string;
  updates: SoftwareUpdate[];
  latestUpdate?: SoftwareUpdate;
  // Backward compatibility fields
  version: string;
  build: string;
  changes: string[];
}

/**
 * Canonical built-in release history of KumbiAPP.
 * Guaranteed to be available even when database is uninitialized or offline.
 */
export const CANONICAL_SOFTWARE_UPDATES: SoftwareUpdate[] = [
  {
    id: "update-1.2.6",
    version: "1.2.6",
    build: "prod-2026-10-31-0e385ab",
    title: "Enterprise POS Concession Engine, Dynamic Settings & Modern Layouts",
    description: "Dual-tier restaurant concession authorization, Ghana GRA compliant receipts, floating settings save bar, and scrollable operations workspaces.",
    releaseDate: "2026-10-31T12:00:00.000Z",
    type: "feature",
    isCritical: false,
    source: "Core Team & Operations",
    details: [
      "Enterprise POS discount engine: Item-level and whole-ticket concessions with percentage and flat GHS support",
      "Manager PIN authorization and supervisory sign-off for concessions exceeding staff thresholds",
      "Mathematically transparent receipt printing with explicit savings breakdown across browser and thermal slips",
      "Floating sticky settings action bar with dirty field detection and instant discard revert",
      "Live 80mm/58mm thermal receipt preview in settings with real-time GRA levy calculations",
      "Mobile-responsive dropdown category switcher eliminating horizontal overflow on settings tabs",
      "Dedicated scrollable viewports for Menu Management items and Technical Operations room selectors",
      "Automated post-update release details and changelog presentation dialog",
    ],
  },
  {
    id: "update-1.2.5",
    version: "1.2.5",
    build: "prod-2026-10-28-55e6ba1",
    title: "Unified Blob Storage & Neon Connection Architecture",
    description: "Enterprise-grade storage resiliency and hardened case-insensitive authentication workflows.",
    releaseDate: "2026-10-28T21:05:00.000Z",
    type: "major",
    isCritical: true,
    source: "KumbiAPP Core Release",
    details: [
      "Unified hybrid blob storage: Seamless auto-switching between Vercel Blob and Neon PostgreSQL BYTEA tables",
      "Resilient database connection resolution across all Neon & Vercel Postgres environment variables",
      "Case-insensitive user sign-in normalization with deactivated account safeguards",
      "Setup-db bootstrap fix allowing initial admin creation without authentication deadlocks",
      "Streaming blob endpoint with HTTP ETag 304 caching for menu and room media assets",
    ],
  },
  {
    id: "update-1.2.0",
    version: "1.2.0",
    build: "prod-2026-10-27-89df312",
    title: "Canonical Financial Ledger & Inventory Conversions",
    description: "Financial immutability and multi-unit recipe conversion calculations.",
    releaseDate: "2026-10-27T18:30:00.000Z",
    type: "feature",
    isCritical: false,
    source: "Finance & Supply Chain",
    details: [
      "Double-entry canonical financial ledger with immutable transactional reconciliation",
      "Dynamic inventory unit of measure (UOM) conversions with precision matrices",
      "Stock movement auditing with physical count variance thresholds",
      "Hotel & Restaurant consolidated folio payment processing",
    ],
  },
  {
    id: "update-1.1.0",
    version: "1.1.0",
    build: "prod-2026-10-25-a1b2c3d",
    title: "Hospitality Check-In, Room Management & Live Outbox",
    description: "Comprehensive hotel guest experience and asynchronous event streaming.",
    releaseDate: "2026-10-25T14:00:00.000Z",
    type: "feature",
    isCritical: false,
    source: "Hospitality Module",
    details: [
      "Streamlined guest check-in, room assignment, and identity verification",
      "Housekeeping live room statuses and maintenance ticketing",
      "Real-time system synchronization with outbox transactional relays",
      "Thermal printer receipt generation with custom branding",
    ],
  },
  {
    id: "update-1.0.0",
    version: "1.0.0",
    build: "prod-2026-10-20-initial",
    title: "KumbiAPP Core ERP & POS Foundation",
    description: "Initial production release of the unified hotel, restaurant, and POS system.",
    releaseDate: "2026-10-20T10:00:00.000Z",
    type: "maintenance",
    isCritical: false,
    source: "Core Team",
    details: [
      "Modern touch-optimized POS terminal with kitchen display sync",
      "Menu item catalogs with category and ingredient tracking",
      "Staff attendance tracking, shift scheduling, and payroll ledger",
      "Dark mode aesthetic and responsive mobile-first UI components",
    ],
  },
];

let updatesTableEnsured = false;

/**
 * Ensures the software_updates table exists and is seeded with canonical releases.
 */
export async function ensureSoftwareUpdatesTable(): Promise<void> {
  if (updatesTableEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS software_updates (
        id VARCHAR(100) PRIMARY KEY,
        version VARCHAR(50) NOT NULL,
        build VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(50) NOT NULL DEFAULT 'feature',
        is_critical BOOLEAN NOT NULL DEFAULT FALSE,
        details JSONB NOT NULL DEFAULT '[]'::jsonb,
        source VARCHAR(100) DEFAULT 'production',
        release_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_software_updates_version ON software_updates(version);
      CREATE INDEX IF NOT EXISTS idx_software_updates_release_date ON software_updates(release_date DESC);
    `);

    // Check if table is empty, if so, seed canonical updates
    const countCheck = await query(`SELECT COUNT(*) as count FROM software_updates`);
    const count = parseInt(countCheck.rows[0]?.count || "0", 10);
    if (count === 0) {
      for (const update of CANONICAL_SOFTWARE_UPDATES) {
        await query(
          `INSERT INTO software_updates (id, version, build, title, description, type, is_critical, details, source, release_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
            update.id,
            update.version,
            update.build,
            update.title,
            update.description,
            update.type,
            update.isCritical,
            JSON.stringify(update.details),
            update.source || "production",
            update.releaseDate,
          ]
        );
      }
    }
    updatesTableEnsured = true;
  } catch (error) {
    // Database may be offline or connection string missing in test
    // Gracefully handled by falling back to CANONICAL_SOFTWARE_UPDATES
  }
}

/**
 * Compare two semver strings: returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
 */
export function compareSemver(v1: string, v2: string): number {
  const clean1 = (v1 || "").replace(/^v/, "").trim();
  const clean2 = (v2 || "").replace(/^v/, "").trim();

  const parts1 = clean1.split(".").map((p) => parseInt(p, 10) || 0);
  const parts2 = clean2.split(".").map((p) => parseInt(p, 10) || 0);

  const length = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < length; i++) {
    const num1 = parts1[i] ?? 0;
    const num2 = parts2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Retrieves all software updates, combining database records with canonical updates.
 */
export async function getSoftwareUpdates(): Promise<SoftwareUpdate[]> {
  try {
    await ensureSoftwareUpdatesTable();
    const result = await query(
      `SELECT id, version, build, title, description, type, is_critical, details, source, release_date
       FROM software_updates
       ORDER BY release_date DESC`
    );

    if (result && result.rows && result.rows.length > 0) {
      const dbUpdates: SoftwareUpdate[] = result.rows.map((row) => ({
        id: row.id,
        version: row.version,
        build: row.build,
        title: row.title,
        description: row.description || "",
        releaseDate: new Date(row.release_date).toISOString(),
        type: (row.type as UpdateCategory) || "feature",
        isCritical: Boolean(row.is_critical),
        details: Array.isArray(row.details)
          ? row.details
          : typeof row.details === "string"
          ? JSON.parse(row.details)
          : [],
        source: row.source,
      }));

      // Ensure any canonical updates not in DB are merged
      const knownIds = new Set(dbUpdates.map((u) => u.id));
      for (const canonical of CANONICAL_SOFTWARE_UPDATES) {
        if (!knownIds.has(canonical.id)) {
          dbUpdates.push(canonical);
        }
      }
      return dbUpdates.sort(
        (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
      );
    }
  } catch {
    // If DB unavailable, fallback to canonical
  }

  return [...CANONICAL_SOFTWARE_UPDATES];
}

/**
 * Publishes a new software update in real-time.
 * Triggers system synchronization so all open clients receive it immediately.
 */
export async function publishSoftwareUpdate(
  updateInput: Omit<SoftwareUpdate, "id" | "releaseDate"> & { id?: string; releaseDate?: string }
): Promise<SoftwareUpdate> {
  await ensureSoftwareUpdatesTable();

  const id = updateInput.id || `update-${updateInput.version}-${Date.now()}`;
  const releaseDate = updateInput.releaseDate || new Date().toISOString();
  const build = updateInput.build || `build-${Date.now()}`;
  const details = updateInput.details || [];

  const update: SoftwareUpdate = {
    id,
    version: updateInput.version,
    build,
    title: updateInput.title,
    description: updateInput.description || "",
    releaseDate,
    type: updateInput.type || "feature",
    isCritical: Boolean(updateInput.isCritical),
    details,
    source: updateInput.source || "production",
  };

  try {
    await query(
      `INSERT INTO software_updates (id, version, build, title, description, type, is_critical, details, source, release_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         version = EXCLUDED.version,
         build = EXCLUDED.build,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         type = EXCLUDED.type,
         is_critical = EXCLUDED.is_critical,
         details = EXCLUDED.details,
         source = EXCLUDED.source,
         release_date = EXCLUDED.release_date`,
      [
        update.id,
        update.version,
        update.build,
        update.title,
        update.description,
        update.type,
        update.isCritical,
        JSON.stringify(update.details),
        update.source,
        update.releaseDate,
      ]
    );

    // Notify real-time sync listeners
    await updateSystemState("updates");
  } catch (error) {
    console.error("Failed to persist software update to database:", error);
  }

  return update;
}

/**
 * Constructs the complete real-time release payload for the frontend UI.
 */
export async function getReleasePayload(clientBuild?: string | null): Promise<SoftwareUpdateResponse> {
  const updates = await getSoftwareUpdates();
  const latestUpdate = updates[0] || CANONICAL_SOFTWARE_UPDATES[0];

  const currentVersion = packageJson.version || "1.2.5";
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA;
  const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || process.env.GIT_BRANCH || "main";
  const currentBuild = commitSha || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || latestUpdate.build;

  // Determine whether an update is available:
  // 1. If latest release version > current package version
  // 2. Or if client passed its current build hash and latest build differs
  let isUpdateAvailable = false;

  if (latestUpdate) {
    const versionDiff = compareSemver(latestUpdate.version, currentVersion);
    if (versionDiff > 0) {
      isUpdateAvailable = true;
    } else if (
      clientBuild &&
      clientBuild !== "development" &&
      latestUpdate.build !== "development" &&
      clientBuild !== latestUpdate.build
    ) {
      isUpdateAvailable = true;
    }
  }

  return {
    currentVersion,
    currentBuild,
    latestVersion: latestUpdate ? latestUpdate.version : currentVersion,
    latestBuild: latestUpdate ? latestUpdate.build : currentBuild,
    isUpdateAvailable,
    branch,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    source: commitSha ? "deployment commit metadata" : "system release registry",
    checkedAt: new Date().toISOString(),
    updates,
    latestUpdate,
    version: currentVersion,
    build: currentBuild,
    changes: latestUpdate ? latestUpdate.details : [],
  };
}

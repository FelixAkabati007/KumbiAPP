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
interface GitHubCommitApiItem {
  sha: string;
  commit: {
    author: {
      name: string;
      email?: string;
      date: string;
    };
    message: string;
  };
}

let cachedGitHubUpdates: { updates: SoftwareUpdate[]; timestamp: number } | null = null;
const GITHUB_CACHE_TTL_MS = 25_000; // 25 seconds cache

function parseCommitToSoftwareUpdate(item: GitHubCommitApiItem, baseVersion: string): SoftwareUpdate {
  const sha = item.sha;
  const shortSha = sha.substring(0, 7);
  const rawMessage = (item.commit?.message || "").trim();
  const [firstLine, ...bodyLines] = rawMessage.split("\n");
  const title = firstLine || `Update ${shortSha}`;
  const lowerTitle = title.toLowerCase();

  let type: UpdateCategory = "feature";
  if (lowerTitle.startsWith("fix")) type = "fix";
  else if (lowerTitle.startsWith("feat")) type = "feature";
  else if (lowerTitle.startsWith("perf") || lowerTitle.startsWith("chore") || lowerTitle.startsWith("refactor") || lowerTitle.startsWith("test")) type = "maintenance";
  else if (lowerTitle.includes("security") || lowerTitle.startsWith("sec")) type = "security";
  else if (lowerTitle.includes("break") || rawMessage.includes("BREAKING CHANGE")) type = "major";

  const isCritical = type === "security" || type === "major";

  const details = bodyLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("Co-authored-by:"))
    .map((line) => line.replace(/^[-*•]\s*/, ""));

  const authorName = item.commit?.author?.name || "KumbiAPP Team";

  return {
    id: `commit-${sha}`,
    version: `${baseVersion} (${shortSha})`,
    build: sha,
    title,
    description: details.length > 0 ? details[0] : `Pushed by ${authorName}`,
    releaseDate: item.commit?.author?.date || new Date().toISOString(),
    type,
    isCritical,
    details: details.length > 0 ? details : [title],
    source: `GitHub main · ${shortSha}`,
    author: authorName,
  };
}

export async function fetchLatestGitHubCommits(repo = "FelixAkabati007/KumbiAPP", limit = 15): Promise<SoftwareUpdate[]> {
  const now = Date.now();
  if (cachedGitHubUpdates && now - cachedGitHubUpdates.timestamp < GITHUB_CACHE_TTL_MS) {
    return cachedGitHubUpdates.updates;
  }

  const baseVersion = packageJson.version || "1.2.6";

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "KumbiAPP-Version-Sync",
    };

    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=${limit}`, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = (await res.json()) as GitHubCommitApiItem[];
      if (Array.isArray(data) && data.length > 0) {
        const parsed = data.map((item) => parseCommitToSoftwareUpdate(item, baseVersion));
        cachedGitHubUpdates = { updates: parsed, timestamp: now };
        return parsed;
      }
    }
  } catch (err) {
    console.debug("[software-updates] GitHub commits fetch skipped or fallback to cache:", err);
  }

  return cachedGitHubUpdates?.updates || [];
}

/**
 * Retrieves all software updates, combining live GitHub commits, database records, and canonical updates.
 */
export async function getSoftwareUpdates(): Promise<SoftwareUpdate[]> {
  const liveCommits = await fetchLatestGitHubCommits();

  try {
    await ensureSoftwareUpdatesTable();
    const result = await query(
      `SELECT id, version, build, title, description, type, is_critical, details, source, release_date
       FROM software_updates
       ORDER BY release_date DESC`
    );

    const dbUpdates: SoftwareUpdate[] = (result?.rows || []).map((row) => ({
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

    const knownIds = new Set<string>();
    const merged: SoftwareUpdate[] = [];

    // Prioritize real-time GitHub commits first
    for (const update of liveCommits) {
      if (!knownIds.has(update.id)) {
        knownIds.add(update.id);
        merged.push(update);
      }
    }

    // Then database updates
    for (const update of dbUpdates) {
      if (!knownIds.has(update.id)) {
        knownIds.add(update.id);
        merged.push(update);
      }
    }

    // Then canonical releases
    for (const canonical of CANONICAL_SOFTWARE_UPDATES) {
      if (!knownIds.has(canonical.id)) {
        knownIds.add(canonical.id);
        merged.push(canonical);
      }
    }

    return merged.sort(
      (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
    );
  } catch {
    // If DB is unavailable, combine liveCommits with canonical
    if (liveCommits.length > 0) {
      const knownIds = new Set(liveCommits.map((u) => u.id));
      const merged = [...liveCommits];
      for (const canonical of CANONICAL_SOFTWARE_UPDATES) {
        if (!knownIds.has(canonical.id)) {
          merged.push(canonical);
        }
      }
      return merged.sort(
        (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
      );
    }
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

  const currentVersion = packageJson.version || "1.2.6";
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA;
  const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || process.env.GIT_BRANCH || "main";
  const currentBuild = commitSha || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || (clientBuild || latestUpdate.build);
  const latestBuild = latestUpdate ? latestUpdate.build : currentBuild;

  // Determine whether an update is available:
  // 1. If latest release version > current package version (semver comparison)
  // 2. Or if client passed its running build hash, and the latest remote build differs from it
  let isUpdateAvailable = false;

  if (latestUpdate) {
    const versionDiff = compareSemver(latestUpdate.version, currentVersion);
    if (versionDiff > 0) {
      isUpdateAvailable = true;
    } else if (
      clientBuild &&
      clientBuild !== "development" &&
      latestBuild !== "development"
    ) {
      const cleanClient = clientBuild.trim().toLowerCase();
      const cleanLatest = latestBuild.trim().toLowerCase();
      if (
        cleanClient !== cleanLatest &&
        !cleanClient.startsWith(cleanLatest.slice(0, 7)) &&
        !cleanLatest.startsWith(cleanClient.slice(0, 7))
      ) {
        isUpdateAvailable = true;
      }
    }
  }

  return {
    currentVersion,
    currentBuild,
    latestVersion: latestUpdate ? latestUpdate.version : currentVersion,
    latestBuild,
    isUpdateAvailable,
    branch,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    source: commitSha ? "deployment commit metadata" : "GitHub main release stream",
    checkedAt: new Date().toISOString(),
    updates,
    latestUpdate,
    version: currentVersion,
    build: currentBuild,
    changes: latestUpdate ? latestUpdate.details : [],
  };
}

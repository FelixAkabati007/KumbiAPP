import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("hotel operational invariants", () => {
  it("checks the critical room, reservation, housekeeping, and folio relationships", async () => {
    const source = await readFile(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../lib/services/hotel-invariants.ts"),
      "utf8",
    );

    expect(source).toContain("dirtyRoomsWithoutCleaningTask");
    expect(source).toContain("duplicateActiveCleaningTasks");
    expect(source).toContain("checkedInReservationsWithoutOccupiedRoom");
    expect(source).toContain("occupiedRoomsWithoutCheckedInReservation");
    expect(source).toContain("activeReservationsWithoutRoom");
    expect(source).toContain("openFoliosWithoutReservation");
    expect(source).toContain("status IN ('pending', 'in_progress')");
  });

  it("exposes details through an admin-only endpoint", async () => {
    const source = await readFile(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/api/admin/hotel-invariants/route.ts"),
      "utf8",
    );

    expect(source).toContain("requireAdmin");
    expect(source).toContain("getHotelInvariantDetails");
    expect(source).toContain("Cache-Control");
  });
});

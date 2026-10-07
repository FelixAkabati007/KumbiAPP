import { query } from "@/lib/db";

export type HotelInvariantReport = {
  generatedAt: string;
  healthy: boolean;
  checks: {
    dirtyRoomsWithoutCleaningTask: number;
    duplicateActiveCleaningTasks: number;
    cleaningTasksOnReadyRooms: number;
    checkedInReservationsWithoutOccupiedRoom: number;
    occupiedRoomsWithoutCheckedInReservation: number;
    activeReservationsWithoutRoom: number;
    openFoliosWithoutReservation: number;
  };
};

export async function getHotelInvariantReport(): Promise<HotelInvariantReport> {
  const result = await query<HotelInvariantReport["checks"]>(`
    SELECT
      (
        SELECT COUNT(*)::int FROM rooms r
        WHERE r.is_active = true AND r.status = 'dirty'
          AND NOT EXISTS (
            SELECT 1 FROM housekeeping_tasks h
            WHERE h.room_id = r.id AND h.task_type = 'cleaning'
              AND h.status IN ('pending', 'in_progress')
          )
      ) AS "dirtyRoomsWithoutCleaningTask",
      (
        SELECT COUNT(*)::int FROM (
          SELECT room_id FROM housekeeping_tasks
          WHERE task_type = 'cleaning' AND status IN ('pending', 'in_progress')
          GROUP BY room_id HAVING COUNT(*) > 1
        ) duplicates
      ) AS "duplicateActiveCleaningTasks",
      (
        SELECT COUNT(*)::int FROM housekeeping_tasks h
        JOIN rooms r ON r.id = h.room_id
        WHERE h.task_type = 'cleaning' AND h.status IN ('pending', 'in_progress')
          AND r.status NOT IN ('dirty', 'cleaning')
      ) AS "cleaningTasksOnReadyRooms",
      (
        SELECT COUNT(*)::int FROM reservations res
        LEFT JOIN rooms r ON r.id = res.room_id
        WHERE res.status = 'checked_in' AND (r.id IS NULL OR r.status <> 'occupied')
      ) AS "checkedInReservationsWithoutOccupiedRoom",
      (
        SELECT COUNT(*)::int FROM rooms r
        WHERE r.is_active = true AND r.status = 'occupied'
          AND NOT EXISTS (
            SELECT 1 FROM reservations res
            WHERE res.room_id = r.id AND res.status = 'checked_in'
          )
      ) AS "occupiedRoomsWithoutCheckedInReservation",
      (
        SELECT COUNT(*)::int FROM reservations
        WHERE status IN ('pending', 'confirmed', 'checked_in') AND room_id IS NULL
      ) AS "activeReservationsWithoutRoom",
      (
        SELECT COUNT(*)::int FROM guest_folios f
        LEFT JOIN reservations res ON res.id = f.reservation_id
        WHERE res.id IS NULL AND COALESCE(f.status, 'open') IN ('open', 'active')
      ) AS "openFoliosWithoutReservation"
  `);

  const checks = result.rows[0] ?? {
    dirtyRoomsWithoutCleaningTask: 0,
    duplicateActiveCleaningTasks: 0,
    cleaningTasksOnReadyRooms: 0,
    checkedInReservationsWithoutOccupiedRoom: 0,
    occupiedRoomsWithoutCheckedInReservation: 0,
    activeReservationsWithoutRoom: 0,
    openFoliosWithoutReservation: 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    healthy: Object.values(checks).every((value) => Number(value) === 0),
    checks,
  };
}

export async function getHotelInvariantDetails() {
  const report = await getHotelInvariantReport();
  const [dirtyRooms, duplicateTasks, checkedInMismatches] = await Promise.all([
    query(`SELECT r.id, r.room_number, r.status FROM rooms r WHERE r.status = 'dirty' AND NOT EXISTS (SELECT 1 FROM housekeeping_tasks h WHERE h.room_id = r.id AND h.task_type = 'cleaning' AND h.status IN ('pending', 'in_progress')) ORDER BY r.room_number`),
    query(`SELECT room_id, COUNT(*)::int AS active_task_count FROM housekeeping_tasks WHERE task_type = 'cleaning' AND status IN ('pending', 'in_progress') GROUP BY room_id HAVING COUNT(*) > 1`),
    query(`SELECT res.id AS reservation_id, res.room_id, r.status AS room_status FROM reservations res LEFT JOIN rooms r ON r.id = res.room_id WHERE res.status = 'checked_in' AND (r.id IS NULL OR r.status <> 'occupied')`),
  ]);

  return {
    ...report,
    details: {
      dirtyRoomsWithoutCleaningTask: dirtyRooms.rows,
      duplicateActiveCleaningTasks: duplicateTasks.rows,
      checkedInReservationsWithoutOccupiedRoom: checkedInMismatches.rows,
    },
  };
}

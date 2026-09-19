import { describe, expect, it } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();
neonConfig.webSocketConstructor = ws;

const databaseUrl = process.env.DATABASE_URL;
describe.skipIf(!databaseUrl)("normal guest folio lifecycle integration", () => {
  it("reconciles restaurant purchase, itemized folio, Shared / Corporate Finance, and settlement", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const fixture = await pool.query(
        `SELECT r.id, r.status
         FROM reservations r
         JOIN guest_folios gf ON gf.reservation_id = r.id
         WHERE ($1::uuid IS NULL OR r.id = $1::uuid)
           AND ($1::uuid IS NOT NULL OR EXISTS (
             SELECT 1 FROM guest_folio_items gfi
             WHERE gfi.reservation_id = r.id AND gfi.source_type = 'restaurant_order'
           ))
           AND ($1::uuid IS NOT NULL OR EXISTS (
             SELECT 1 FROM transactions t
             WHERE t.metadata->>'reservationId' = r.id::text
               AND t.metadata->>'source' = 'hotel-folio-restaurant'
               AND t.status = 'completed'
           ))
         ORDER BY CASE WHEN r.status = 'checked_out' THEN 0 ELSE 1 END, r.created_at DESC
         LIMIT 1`,
        [process.env.FOLIO_INTEGRATION_RESERVATION_ID || null],
      );
      expect(fixture.rows).toHaveLength(1);
      const reservationId = fixture.rows[0].id;
      const reservation = await pool.query(
        `SELECT id, status FROM reservations WHERE id = $1::uuid`,
        [reservationId],
      );
      expect(reservation.rows).toHaveLength(1);

      const folio = await pool.query(
        `SELECT reservation_id, total_charges, paid_amount, balance
         FROM guest_folios
         WHERE reservation_id = $1`,
        [reservationId],
      );
      expect(folio.rows).toHaveLength(1);
      expect(Number(folio.rows[0].balance)).toBeGreaterThanOrEqual(0);
      expect(Number(folio.rows[0].balance)).toBeCloseTo(
        Number(folio.rows[0].total_charges) - Number(folio.rows[0].paid_amount),
        2,
      );

      const restaurantCharges = await pool.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(total_amount), 0) AS total
         FROM guest_folio_items
         WHERE reservation_id = $1::uuid AND source_type = 'restaurant_order'`,
        [reservationId],
      );
      const financePostings = await pool.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0) AS total
         FROM transactions
         WHERE metadata->>'reservationId' = $1::text
           AND COALESCE(metadata->>'businessUnit', 'shared') = 'shared'
           AND metadata->>'source' = 'hotel-folio-restaurant'
           AND status = 'completed'`,
        [reservationId],
      );

      expect(Number(financePostings.rows[0].count)).toBeGreaterThanOrEqual(
        Number(restaurantCharges.rows[0].count),
      );
      expect(Number(financePostings.rows[0].total)).toBeGreaterThanOrEqual(
        Number(restaurantCharges.rows[0].total),
      );

      if (reservation.rows[0].status === "checked_out") {
        expect(Number(folio.rows[0].balance)).toBe(0);
      }
    } finally {
      await pool.end();
    }
  }, 30000);
});

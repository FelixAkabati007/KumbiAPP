I have identified the cause of the `Internal Server Error` during signup. The application is trying to fetch system settings from a `settings` database table that likely **does not exist** in your current database instance, causing the API to crash.

### **The Problem**
- **Error:** `Failed to fetch settings: Internal Server Error` (Status 500)
- **Cause:** The `GET /api/settings` endpoint attempts to query the `settings` table (`SELECT data FROM settings WHERE id = 1`). Since this table hasn't been created in your live database yet, the query fails, throwing an exception that results in a 500 error.
- **Verification:** The seeding script you ran earlier only interacted with the `users` table. The `settings` table definition exists in `schema.sql` but hasn't been applied.

### **The Solution**
I will create and run a targeted migration script to ensure the `settings` table exists and is properly initialized.

#### **Step 1: Create a Fix Script**
I will create `scripts/fix-settings-table.ts` with the following logic:
1.  **Connect to the Database:** Reuse the working connection logic from `seed-admin.ts`.
2.  **Create Table:** Execute the SQL to create the `settings` table if it doesn't exist (using the exact schema definition).
3.  **Initialize Data:** Insert a default empty settings row (`id=1`, `data='{}'`) to ensure the API returns a valid response immediately.

#### **Step 2: Run the Fix**
I will execute the script using `npx tsx scripts/fix-settings-table.ts`.

#### **Step 3: Verification**
I will verify the fix by checking that the script completes successfully. You can then try signing up again; the error should be gone.

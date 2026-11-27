import { describe, expect, it, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  generateVapidKeyPair,
  createVapidAuthorizationHeader,
  encryptWebPushPayload,
  saveWebPushSubscription,
  removeWebPushSubscription,
  type WebPushEnvelope,
} from "@/lib/web-push";
import {
  ensureNotificationsSchema,
  getAdminAndGeneralManagerUserIds,
  getUnreadNotificationCount,
  notifyAdminsAndGeneralManagers,
} from "@/lib/server-notifications";
import {
  registerAttendance,
  type AttendanceQueryExecutor,
  type AttendanceTransactionRunner,
} from "@/lib/attendance-service";

describe("Web Push RFC 8291/8292 and App Icon Badging (Real PostgreSQL)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    );
  });

  it("generates valid VAPID keys, signs RFC 8292 ES256 JWT, and encrypts/decrypts RFC 8291 aes128gcm payload", () => {
    // 1. Generate server VAPID keys
    const serverVapid = generateVapidKeyPair();
    expect(serverVapid.publicKey).toBeDefined();
    expect(serverVapid.privateKey).toBeDefined();

    // 2. Generate subscriber client key pair (P-256)
    const clientEcdh = crypto.createECDH("prime256v1");
    clientEcdh.generateKeys();
    const clientPublicKeyBase64 = clientEcdh.getPublicKey().toString("base64url");
    const clientAuthSecret = crypto.randomBytes(16);
    const clientAuthBase64 = clientAuthSecret.toString("base64url");

    // 3. Create VAPID header
    const audience = "https://fcm.googleapis.com";
    const authHeader = createVapidAuthorizationHeader(
      `${audience}/fcm/send/device-token`,
      {
        publicKey: serverVapid.publicKey,
        privateKey: serverVapid.privateKey,
        subject: "mailto:admin@kumbisaly.com",
      }
    );
    expect(authHeader.startsWith("vapid t=")).toBe(true);
    expect(authHeader.includes(", k=")).toBe(true);

    // 4. Encrypt Web Push payload with unreadCount
    const payload: WebPushEnvelope = {
      type: "kumbi_notification",
      title: "Staff Check-In Alert",
      body: "Kofi Mensah checked in at 08:02 AM (Kitchen)",
      unreadCount: 3,
      url: "/attendance",
      category: "attendance",
      tag: "attendance-check-in-1",
      sentAt: new Date().toISOString(),
    };
    const encrypted = encryptWebPushPayload(
      JSON.stringify(payload),
      {
        p256dh: clientPublicKeyBase64,
        auth: clientAuthBase64,
      }
    );
    expect(encrypted.length).toBeGreaterThan(86); // At least salt(16) + rs(4) + idlen(1) + serverKey(65)

    // 5. Decrypt the RFC 8291 aes128gcm payload using subscriber private key to verify exact round-trip!
    const salt = encrypted.subarray(0, 16);
    const recordSize = encrypted.readUInt32BE(16);
    expect(recordSize).toBe(4096);
    const idlen = encrypted.readUInt8(20);
    expect(idlen).toBe(65);
    const serverEphemeralPublicKey = encrypted.subarray(21, 21 + idlen);
    const ciphertextWithTag = encrypted.subarray(21 + idlen);

    // Derive IKM
    const sharedSecret = clientEcdh.computeSecret(serverEphemeralPublicKey);
    const clientPublicBuf = clientEcdh.getPublicKey();

    const authInfo = Buffer.concat([
      Buffer.from("WebPush: info\0", "utf8"),
      clientPublicBuf,
      serverEphemeralPublicKey,
    ]);
    const prk = crypto.createHmac("sha256", clientAuthSecret).update(sharedSecret).digest();
    const ikmHmac = crypto.createHmac("sha256", prk);
    ikmHmac.update(authInfo);
    ikmHmac.update(Buffer.from([1]));
    const ikm = ikmHmac.digest();

    // Derive Content Encryption Key (CEK) and Nonce
    const cekInfo = Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), Buffer.from([1])]);
    const prkKey = crypto.createHmac("sha256", salt).update(ikm).digest();
    const cek = crypto.createHmac("sha256", prkKey).update(cekInfo).digest().subarray(0, 16);

    const nonceInfo = Buffer.concat([Buffer.from("Content-Encoding: nonce\0", "utf8"), Buffer.from([1])]);
    const nonce = crypto.createHmac("sha256", prkKey).update(nonceInfo).digest().subarray(0, 12);

    const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);
    const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);

    const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
    decipher.setAuthTag(tag);
    const decryptedWithPadding = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Strip padding delimiter (\x02)
    const delimiterIndex = decryptedWithPadding.lastIndexOf(0x02);
    expect(delimiterIndex).toBeGreaterThanOrEqual(0);
    const decryptedPayloadRaw = decryptedWithPadding.subarray(0, delimiterIndex).toString("utf8");
    const decryptedObj: WebPushEnvelope = JSON.parse(decryptedPayloadRaw);

    expect(decryptedObj.title).toBe(payload.title);
    expect(decryptedObj.body).toBe(payload.body);
    expect(decryptedObj.unreadCount).toBe(3);
    expect(decryptedObj.url).toBe("/attendance");
  });

  async function setupPg() {
    const db = new PGlite();
    await db.exec(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'staff',
        password_hash VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE staff_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        business_email VARCHAR(255) NOT NULL UNIQUE,
        department VARCHAR(100),
        position VARCHAR(100),
        job_classification VARCHAR(100) DEFAULT 'other',
        employment_status VARCHAR(50) DEFAULT 'active',
        password_hash VARCHAR(255) NOT NULL DEFAULT 'managed',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE work_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(120) NOT NULL,
        job_classification VARCHAR(100) NOT NULL,
        department VARCHAR(100),
        shift_period VARCHAR(20) NOT NULL DEFAULT 'standard',
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        reminder_minutes INTEGER NOT NULL DEFAULT 20,
        timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Accra',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE staff_schedule_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id UUID NOT NULL,
        schedule_id UUID NOT NULL,
        work_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const executor: AttendanceQueryExecutor = async <R = Record<string, unknown>>(text: string, params?: unknown[]) => {
      const r = await db.query(text, params as unknown[]);
      return { rows: r.rows as R[], rowCount: r.affectedRows || r.rows.length };
    };

    const runTransaction: AttendanceTransactionRunner = async (cb) => {
      await db.exec("BEGIN");
      try {
        const out = await cb({ query: executor });
        await db.exec("COMMIT");
        return out;
      } catch (err) {
        await db.exec("ROLLBACK");
        throw err;
      }
    };

    await ensureNotificationsSchema(executor);

    return { db, executor, runTransaction };
  }

  function generateDeviceP256() {
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.generateKeys();
    return {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: crypto.randomBytes(16).toString("base64url"),
    };
  }

  it("registers multiple push subscriptions per user across devices and tracks unread count", async () => {
    const { executor } = await setupPg();

    // Insert Admin and GM users
    const adminUser = await executor<{ id: string }>(
      "INSERT INTO users (email, name, role) VALUES ('admin@kumbisaly.com', 'System Admin', 'admin') RETURNING id"
    );
    const gmUser = await executor<{ id: string }>(
      "INSERT INTO users (email, name, role) VALUES ('gm@kumbisaly.com', 'General Manager', 'manager') RETURNING id"
    );
    const waiterUser = await executor<{ id: string }>(
      "INSERT INTO users (email, name, role) VALUES ('waiter@kumbisaly.com', 'Kofi Waiter', 'waiterWaitress') RETURNING id"
    );

    const adminId = adminUser.rows[0].id;
    const gmId = gmUser.rows[0].id;

    // Verify getAdminAndGeneralManagerUserIds finds both admin and manager
    const adminGmIds = await getAdminAndGeneralManagerUserIds(executor);
    expect(adminGmIds).toContain(adminId);
    expect(adminGmIds).toContain(gmId);
    expect(adminGmIds).not.toContain(waiterUser.rows[0].id);

    // Save multiple devices for Admin (e.g. Phone + Laptop)
    const adminPhoneKeys = generateDeviceP256();
    await saveWebPushSubscription(
      {
        userId: adminId,
        userRole: "admin",
        subscription: {
          endpoint: "https://push.services.mozilla.com/push/v1/admin-phone-endpoint",
          keys: adminPhoneKeys,
        },
        userAgent: "Admin iPhone",
      },
      executor
    );

    const adminLaptopKeys = generateDeviceP256();
    await saveWebPushSubscription(
      {
        userId: adminId,
        userRole: "admin",
        subscription: {
          endpoint: "https://push.services.mozilla.com/push/v1/admin-laptop-endpoint",
          keys: adminLaptopKeys,
        },
        userAgent: "Admin MacBook Chrome",
      },
      executor
    );

    // Save device for General Manager
    const gmPhoneKeys = generateDeviceP256();
    await saveWebPushSubscription(
      {
        userId: gmId,
        userRole: "manager",
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/gm-android-endpoint",
          keys: gmPhoneKeys,
        },
        userAgent: "GM Android",
      },
      executor
    );

    // Check device count in web_push_subscriptions
    const subs = await executor<{ endpoint: string }>("SELECT endpoint FROM web_push_subscriptions");
    expect(subs.rowCount).toBe(3);

    // Initial unread count should be 0
    const initialAdminCount = await getUnreadNotificationCount(adminId, executor);
    expect(initialAdminCount).toBe(0);

    // Notify admins and GMs
    await notifyAdminsAndGeneralManagers(
      {
        title: "Staff Check-In Alert",
        message: "Kofi Waiter checked in at 08:15 AM (Restaurant)",
        type: "attendance_check_in",
        url: "/attendance",
        dedupeKey: "check-in-kofi-today",
      },
      executor
    );

    // Both Admin and GM now have 1 unread notification
    const adminUnreadAfterCheckIn = await getUnreadNotificationCount(adminId, executor);
    const gmUnreadAfterCheckIn = await getUnreadNotificationCount(gmId, executor);
    expect(adminUnreadAfterCheckIn).toBe(1);
    expect(gmUnreadAfterCheckIn).toBe(1);

    // Remove one device on sign-out (pass undefined as userId to delete by endpoint with custom executor)
    await removeWebPushSubscription("https://push.services.mozilla.com/push/v1/admin-phone-endpoint", undefined, executor);
    const remainingSubs = await executor<{ endpoint: string }>(
      "SELECT endpoint FROM web_push_subscriptions WHERE user_id = $1::varchar",
      [adminId]
    );
    expect(remainingSubs.rowCount).toBe(1);
    expect(remainingSubs.rows[0].endpoint).toBe("https://push.services.mozilla.com/push/v1/admin-laptop-endpoint");
  });

  it("automatically creates notifications for Admin and GM upon staff check-in and check-out in registerAttendance", async () => {
    const { executor, runTransaction } = await setupPg();

    // Insert Admin, GM, and Staff
    const admin = await executor<{ id: string }>(
      "INSERT INTO users (email, name, role) VALUES ('admin@kumbisaly.com', 'Boss Admin', 'admin') RETURNING id"
    );
    const gm = await executor<{ id: string }>(
      "INSERT INTO users (email, name, role) VALUES ('gm@kumbisaly.com', 'Lead Manager', 'manager') RETURNING id"
    );
    const staff = await executor<{ id: string }>(
      "INSERT INTO users (email, name, role) VALUES ('staff@kumbisaly.com', 'Ama Serwaa', 'waiterWaitress') RETURNING id"
    );

    const adminId = admin.rows[0].id;
    const gmId = gm.rows[0].id;
    const staffUserId = staff.rows[0].id;

    // Create staff profile
    await executor<{ id: string }>(
      `INSERT INTO staff_profiles (
        user_id, first_name, last_name, business_email, department, position, job_classification
      ) VALUES (
        $1::uuid, 'Ama', 'Serwaa', 'ama@kumbisaly.com', 'Service', 'Waitress', 'waiterWaitress'
      ) RETURNING id`,
      [staffUserId]
    );

    // Create schedule
    await executor(
      `INSERT INTO work_schedules (name, job_classification, department, start_time, end_time, reminder_minutes)
       VALUES ('Waiters/ Waitress', 'waiterWaitress', 'Service', '08:00', '23:59', 20)`
    );

    const session = {
      id: staffUserId,
      email: "ama@kumbisaly.com",
      name: "Ama Serwaa",
      role: "waiterWaitress" as const,
    };

    // 1. Staff performs check-in
    const checkInResult = await registerAttendance(session, "check_in", undefined, {
      canonicalNow: "2026-11-26T08:05:00.000Z",
      executor,
      runTransaction,
    });
    expect(checkInResult.nextAction).toBe("check_out");

    // Verify Admin and GM received check-in notifications
    const adminNotifications1 = await executor<{ title: string; message: string; type: string }>(
      "SELECT title, message, type FROM notifications WHERE recipient_user_id = $1::varchar",
      [adminId]
    );
    expect(adminNotifications1.rowCount).toBe(1);
    expect(adminNotifications1.rows[0].type).toBe("attendance_check_in");
    expect(adminNotifications1.rows[0].title).toContain("Staff Check-In");
    expect(adminNotifications1.rows[0].message).toContain("Ama Serwaa");

    const gmNotifications1 = await executor<{ title: string; type: string }>(
      "SELECT title, type FROM notifications WHERE recipient_user_id = $1::varchar",
      [gmId]
    );
    expect(gmNotifications1.rowCount).toBe(1);
    expect(gmNotifications1.rows[0].type).toBe("attendance_check_in");

    // Staff member should NOT receive admin attendance alert
    const staffNotifications = await executor<{ id: string }>(
      "SELECT id FROM notifications WHERE recipient_user_id = $1::varchar",
      [staffUserId]
    );
    expect(staffNotifications.rowCount).toBe(0);

    // 2. Staff performs check-out
    const checkOutResult = await registerAttendance(session, "check_out", undefined, {
      canonicalNow: "2026-11-26T17:05:00.000Z",
      executor,
      runTransaction,
    });
    expect(checkOutResult.nextAction).toBe("complete");

    // Verify Admin and GM now have 2 notifications: check_in AND check_out
    const adminNotifications2 = await executor<{ title: string; message: string; type: string }>(
      "SELECT title, message, type FROM notifications WHERE recipient_user_id = $1::varchar ORDER BY created_at ASC",
      [adminId]
    );
    expect(adminNotifications2.rowCount).toBe(2);
    expect(adminNotifications2.rows[1].type).toBe("attendance_check_out");
    expect(adminNotifications2.rows[1].title).toContain("Staff Check-Out");
    expect(adminNotifications2.rows[1].message).toContain("Ama Serwaa");

    const unreadCount = await getUnreadNotificationCount(adminId, executor);
    expect(unreadCount).toBe(2);

    // 3. Mark all notifications read
    await executor(
      `UPDATE notifications
       SET read = true, read_at = CURRENT_TIMESTAMP
       WHERE recipient_user_id = $1::varchar AND read_at IS NULL`,
      [adminId]
    );

    const unreadAfterMarkAll = await getUnreadNotificationCount(adminId, executor);
    expect(unreadAfterMarkAll).toBe(0);
  });

  it("syncAppIconBadge properly controls navigator badging API", async () => {
    const { syncAppIconBadge } = await import("@/lib/notifications");

    const setBadgeMock = vi.fn().mockResolvedValue(undefined);
    const clearBadgeMock = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("navigator", {
      setAppBadge: setBadgeMock,
      clearAppBadge: clearBadgeMock,
    });

    // 1. Setting count > 0 calls setAppBadge
    await syncAppIconBadge(5);
    expect(setBadgeMock).toHaveBeenCalledWith(5);

    // 2. Setting count === 0 calls clearAppBadge
    await syncAppIconBadge(0);
    expect(clearBadgeMock).toHaveBeenCalled();
  });
});

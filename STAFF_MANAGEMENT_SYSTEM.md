# Staff Management System - Implementation Guide

## Overview
A comprehensive role-based staff management system with audit logging, approval workflows, shift-based authentication, and secure password management for the Kumbisaly Heritage Hotel & Restaurant system.

---

## Database Schema

### Core Tables

#### `staff_profiles`
Enhanced staff profiles with secure password management and employment tracking.
- Unique business email for login
- Password history (last 5 passwords)
- Password changed timestamp
- Employment status tracking
- Created by audit trail

#### `staff_sessions`
Shift-based session management with device tracking.
- Device fingerprinting for device-specific sessions
- Session token management
- Inactivity tracking and warning system
- Login/logout audit trail

#### `staff_approval_requests`
Manager approval workflow for staff modifications.
- Request type: create, update, delete
- Action data in JSONB format
- Approval/rejection tracking with timestamps
- Manager and admin role tracking

#### `staff_audit_logs`
Immutable, comprehensive audit logging.
- Unique action IDs for each action
- Actor and target staff information
- Detailed change records in JSONB
- IP address and device fingerprint tracking
- UTC timestamps for compliance

#### `password_reset_tokens`
Secure password reset token management.
- Time-limited tokens (1-hour expiry)
- Single-use tokens with used tracking
- Audit trail of who initiated resets

#### `device_registrations`
Device tracking for shift-based terminal access.
- Device fingerprint identification
- Last user and timestamp tracking
- Device type classification

---

## API Endpoints

### Staff Management (Admin Only)

#### POST `/api/admin/staff`
Create new staff member (admin only, no approval needed)
```json
{
  "firstName": "Kwesi",
  "lastName": "Mensah",
  "businessEmail": "kwesi.mensah@kumbisaly.com",
  "phone": "+233501234567",
  "department": "Front Desk",
  "position": "Receptionist",
  "hireDate": "2024-01-15",
  "password": "SecurePassword123!"
}
```

#### GET `/api/admin/staff`
List all staff members with optional filtering
```
?limit=50&offset=0&department=Front%20Desk&status=active
```

#### GET `/api/admin/staff/[id]`
Get individual staff member details

#### PATCH `/api/admin/staff/[id]`
Update staff member details (admin only)
```json
{
  "firstName": "Kwesi",
  "phone": "+233501234567",
  "employmentStatus": "active"
}
```

#### DELETE `/api/admin/staff/[id]`
Soft delete staff member (marks as inactive, termination date recorded)

---

### Manager Approval Workflow

#### POST `/api/admin/staff-approvals`
Manager requests staff modification (queued for admin approval)
```json
{
  "requestType": "update",
  "staffMemberId": "uuid",
  "actionData": {
    "position": "Senior Receptionist",
    "department": "Front Desk"
  }
}
```

#### GET `/api/admin/staff-approvals`
List pending approval requests (admin only)
```
?status=pending&limit=50&offset=0
```

---

### Password Management

#### POST `/api/admin/staff/[id]/password-reset`
Initiate forced password reset (admin/manager only)
```json
{
  "reason": "Suspected compromise - requiring immediate reset"
}
```

#### GET `/api/admin/staff/[id]/password-reset?token=[resetToken]`
Validate password reset token

---

### Authentication

#### POST `/api/auth/staff-login`
Staff login with device fingerprint (prevents concurrent logins)
```json
{
  "email": "kwesi.mensah@kumbisaly.com",
  "password": "SecurePassword123!",
  "deviceFingerprint": "sha256-hash-of-device",
  "userAgent": "Mozilla/5.0..."
}
```

**Response:**
```json
{
  "token": "jwt-token",
  "sessionToken": "session-token",
  "user": {
    "id": "uuid",
    "email": "kwesi.mensah@kumbisaly.com",
    "name": "Kwesi Mensah",
    "role": "staff"
  }
}
```

#### GET `/api/auth/staff-logout`
Validate current session and check for inactivity

#### POST `/api/auth/staff-logout`
Logout and clear session data

---

### Audit Logging

#### GET `/api/admin/audit-logs`
Retrieve audit logs with comprehensive filtering (admin only)
```
?actionType=staff_created&actorId=uuid&targetStaffId=uuid
&startDate=2024-01-01&endDate=2024-12-31&limit=50&offset=0
&format=json
```

Supports CSV export:
```
?format=csv
```

---

## Security Features

### 1. Password Complexity Requirements
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character
- Password history (cannot reuse last 5 passwords)

### 2. Unique Business Email
- All staff accounts require unique business email
- Email serves as primary login identifier
- Email validation before account creation

### 3. Shift-Based Session Management
- Device fingerprinting prevents account sharing
- Single active session per device
- Automatic logout on inactivity (15+ minutes)
- Inactivity warning at 12 minutes
- Full session data clearing on logout

### 4. Approval Workflow
- Managers can only create/modify staff with admin approval
- All requests queued in approval system
- Admin review and approval/rejection tracking
- Audit trail of all actions

### 5. Password Reset Security
- Time-limited tokens (1-hour expiry)
- Single-use reset tokens
- Logged by initiating admin/manager
- Forced new password on next login

### 6. Comprehensive Audit Logging
- Immutable, timestamped logs
- Unique action IDs for tracking
- Actor and target identification
- Change details captured
- IP address and device fingerprint
- UTC timestamps for compliance

---

## Role-Based Access Control

### Admin
- ✓ Full CRUD on staff accounts (no approval needed)
- ✓ Create, update, delete staff
- ✓ Initiate password resets
- ✓ Approve/reject manager requests
- ✓ View audit logs
- ✓ Export compliance reports

### Manager
- ✓ View staff list
- ✓ Request staff modifications (queued for approval)
- ✓ Initiate password resets (with approval)
- ✗ Cannot directly modify or delete staff
- ✗ Cannot approve requests

### Staff
- ✓ Change own password
- ✓ View own profile
- ✓ Log in/out with device fingerprint
- ✗ Cannot manage other staff
- ✗ Cannot view audit logs

---

## Client Implementation

### Device Fingerprinting
```javascript
function generateDeviceFingerprint() {
  const navigator_data = navigator.userAgent + navigator.language;
  const screen_data = window.screen.width + window.screen.height;
  const timezone = new Date().getTimezoneOffset();
  
  const combined = navigator_data + screen_data + timezone;
  return CryptoJS.SHA256(combined).toString();
}
```

### Login Flow
```javascript
const deviceFingerprint = generateDeviceFingerprint();

const response = await fetch('/api/auth/staff-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'staff@kumbisaly.com',
    password: 'SecurePassword123!',
    deviceFingerprint,
    userAgent: navigator.userAgent
  })
});

const { token, sessionToken } = await response.json();

// Store tokens in memory or HTTP-only cookies
localStorage.setItem('authToken', token);
```

### Session Validation
```javascript
// Periodically check session validity
setInterval(async () => {
  const response = await fetch('/api/auth/staff-logout', {
    method: 'GET'
  });
  
  const { isValid, requiresReauth } = await response.json();
  
  if (!isValid) {
    window.location.href = '/login';
  }
  
  if (requiresReauth) {
    showInactivityWarning();
  }
}, 60000); // Check every minute
```

---

## Deployment Considerations

1. **Database Migration**: Run schema.sql to create all tables and indexes
2. **Environment Variables**: Ensure JWT_SECRET and NODE_ENV are set
3. **HTTPS Only**: Require HTTPS in production for secure cookies
4. **Rate Limiting**: Implement rate limiting on login endpoint
5. **IP Allowlisting**: Consider IP restrictions for POS terminals
6. **Backup**: Regular backups of audit logs for compliance
7. **Log Retention**: Define retention policy for audit logs (compliance requirement)
8. **Encryption**: Consider additional encryption for sensitive password reset tokens

---

## Testing Checklist

- [ ] Create staff account as admin
- [ ] Verify unique email constraint
- [ ] Test password complexity validation
- [ ] Login with staff account
- [ ] Verify concurrent login prevention
- [ ] Test inactivity timeout (15 minutes)
- [ ] Initiate password reset
- [ ] Verify reset token expiry (1 hour)
- [ ] Manager requests staff modification
- [ ] Admin approves/rejects request
- [ ] Check audit logs for all actions
- [ ] Export audit logs as CSV
- [ ] Verify IP address logging
- [ ] Verify device fingerprint tracking

---

## Ghana Hospitality Compliance

- Supports Ghana Cedis (GHS) currency in related systems
- Business email format validation (e.g., @kumbisaly.com)
- Phone number format support (+233...)
- UTC timezone for all timestamps
- Audit logs for regulatory compliance

---

## Future Enhancements

1. Two-factor authentication (2FA)
2. SMS/Email notifications for security events
3. Role-based dashboard with analytics
4. Staff shift scheduling integration
5. Biometric authentication for POS terminals
6. Real-time activity monitoring
7. Automated compliance report generation
8. Integration with payroll systems

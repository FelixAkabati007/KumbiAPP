# Environment Setup Guide

This guide will help you resolve all red errors (critical variables missing in production) and yellow warnings (optional variables missing in development) in the KHHREST application.

## Quick Setup

1. **Copy the example file:**

   ```bash
   cp .env.example .env.local
   ```

2. **Update with your actual values** (see sections below)

3. **Restart your development server:**
   ```bash
   npm run dev
   ```

## Environment Variables by Category

### 🔴 Critical Variables (Required for Production)

These variables **must** be set in production environments:

#### Database & Backend

```bash
# Neon / PostgreSQL Database URL
DATABASE_URL=postgresql://neondb_owner:password@ep-host.region.aws.neon.tech/neondb?sslmode=require
```

#### Security

```bash
# Generate secure keys with: openssl rand -base64 32
JWT_SECRET=your-jwt-secret-key-here-minimum-32-characters
SESSION_SECRET=your-session-secret-key-here-minimum-32-characters
```

### 🟡 Optional Variables (Development Warnings)

These variables are optional but recommended:

#### Payment Processing

```bash
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-publishable-key
```

#### Email Configuration

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

#### Caching

```bash
REDIS_URL=redis://localhost:6379
```

### 🟢 Feature Flags

Control which features are enabled:

```bash
ENABLE_ANALYTICS=false
ENABLE_NOTIFICATIONS=true
ENABLE_THERMAL_PRINTER=true
ENABLE_BARCODE_SCANNER=true
ENABLE_CASH_DRAWER=true
```

## Development vs Production

### Development Mode

- ✅ **Auto-generated secure keys** for JWT_SECRET and SESSION_SECRET
- ✅ **localStorage fallback** for transaction logs and settings
- ⚠️ **Warnings only** for missing optional variables
- 🟢 **No red errors** - app will run with defaults

### Production Mode

- ❌ **Red errors** for missing critical variables
- 🔒 **No auto-generation** of security keys
- 🚫 **No fallbacks** - must have proper configuration

## How to Get Required Values

### Neon Database

1. Create a project at [neon.tech](https://neon.tech)
2. Get the connection string from the dashboard
3. Add it as `DATABASE_URL`

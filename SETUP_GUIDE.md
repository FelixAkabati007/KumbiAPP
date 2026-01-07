# KHHREST Setup Guide

This guide will help you set up the Kumbisaly Heritage Restaurant POS system with proper Neon database configuration.

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18+ installed
- A Neon account and project (https://neon.tech)
- Git

### 2. Environment Setup

1. **Clone and install dependencies:**

   ```bash
   npm install
   ```

2. **Copy environment file:**

   ```bash
   cp .env.example .env.local
   ```

3. **Configure Neon credentials in `.env.local`:**
   ```env
   DATABASE_URL=postgres://user:password@ep-project-123456.region.aws.neon.tech/neondb?sslmode=require
   ```

### 3. Database Setup

#### Option A: Using Neon Dashboard (SQL Editor)

1. Go to your Neon project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `database-schema.sql` (located in project root or `lib/db/schema.sql`)
4. Run the query to create tables and seed initial data.

#### Option B: Using psql

1. **Get your connection string** from the Neon dashboard.
2. **Run the schema file:**

   ```bash
   psql "postgres://user:password@host/dbname?sslmode=require" -f database-schema.sql
   ```

### 4. Authentication Configuration

The application currently uses a simplified authentication provider (see `components/auth-provider.tsx`).
Ensure `JWT_SECRET` and `SESSION_SECRET` are set in your `.env.local` for session management.

```env
JWT_SECRET=your_jwt_secret
SESSION_SECRET=your_session_secret
```

### 5. Verify Setup

1. Start the development server:
   ```bash
   npm run dev
   ```
2. Visit `http://localhost:3000`
3. Check the environment status at `http://localhost:3000/env-test`

## 🔧 Configuration Details

### Database Connection

The application uses `@neondatabase/serverless` for connection pooling and efficient serverless operation.
Configuration is located in `lib/db.ts`.

### Troubleshooting

- If you encounter connection errors, ensure your IP is allowed or "Allow all IPs" is enabled in Neon settings.
- Check `DATABASE_URL` format. It should start with `postgres://` or `postgresql://`.

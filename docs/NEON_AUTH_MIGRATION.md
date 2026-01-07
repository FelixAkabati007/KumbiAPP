
# Neon Auth Migration Guide

This project is migrating from a custom JWT implementation to **Neon Auth SDK** (powered by Better Auth / Stack Auth).

## Prerequisites

1.  **Neon Project**: Ensure you have a Neon project with Auth enabled.
2.  **Environment Variables**:
    Add the following to your `.env` file:
    ```env
    NEON_AUTH_API_URL=https://<your-project-id>.auth.neon.tech
    # If using specific provider keys
    # NEON_AUTH_PROJECT_ID=...
    ```

## Code Changes

### 1. SDK Installation
The `@neondatabase/neon-js` package has been installed.

### 2. Client Initialization
A new client is initialized in `lib/neon-client.ts`.

### 3. Auth Service
New auth functions are available in `lib/auth-neon.ts`.

### 4. Switching Implementations

**Current Status**: The app currently uses `lib/auth.ts` (Custom JWT).

**To Switch**:
1.  Configure the environment variables.
2.  Update `app/api/auth/login/route.ts` to use `signInWithEmail` from `lib/auth-neon.ts` (or handle on client side).
3.  Update `app/api/auth/signup/route.ts` to use `signUpWithEmail`.
4.  Replace `getSession` calls in `lib/auth.ts` with `getNeonSession` from `lib/auth-neon.ts`.

## Migration Strategy

We have implemented the "Parallel" pattern. The new Neon Auth logic resides in `lib/auth-neon.ts` and does not interfere with the existing running application until the environment variables are set and the routes are switched.

## Next Steps

1.  Obtain Neon Auth credentials from the Neon Console.
2.  Update `.env`.
3.  Refactor `app/login/page.tsx` (Frontend) to use the Neon SDK directly for a better UX (Magic Links/OTP).

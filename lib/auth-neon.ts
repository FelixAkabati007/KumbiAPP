import { neonClient } from "./neon-client";
import { cookies } from "next/headers";

/**
 * Neon Auth Service Wrapper
 * This replaces the custom JWT implementation in lib/auth.ts
 */

export async function getNeonSession() {
  const cookieStore = await cookies();
  // Neon Auth (via Better Auth) typically sets a session token in cookies
  // The SDK might handle this automatically if we use the client-side adapter,
  // but for server-side Next.js, we often need to verify the token.

  // Note: The specific cookie name depends on the Neon Auth provider configuration.
  // Assuming standard Better Auth cookie or Neon specific.
  const token =
    cookieStore.get("neon_token")?.value ||
    cookieStore.get("session_token")?.value;

  if (!token) return null;

  try {
    // Verify token using Neon SDK
    // The vanilla adapter doesn't expose a direct 'verify' method easily for server-side
    // without the full context.
    // However, we can use the `fetchWithToken` to call a protected endpoint or user info endpoint.

    // For now, we assume the token is valid if we can get user info
    // const response = await neonClient.auth.getUser(token);
    // Note: .getUser() is hypothetical based on common SDK patterns;
    // exact method depends on specific BetterAuthVanillaAdapter implementation which acts as a client.
    console.warn(
      "getNeonSession: getUser method not verified. Returning null."
    );
    return null; // response;
  } catch (error) {
    console.error("Neon Auth session verification failed:", error);
    return null;
  }
}

export async function signInWithEmail(email: string) {
  // This triggers the magic link or OTP flow
  // return await neonClient.auth.signIn.email({
  //   email,
  //   callbackURL: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  // });
  console.warn(
    "signInWithEmail not implemented correctly for this SDK version"
  );
  return { error: { message: "Not implemented" } };
}

export async function signUpWithEmail(
  email: string,
  name: string,
  password: string
) {
  // @ts-ignore - Allowing password if supported by the adapter
  return await neonClient.auth.signUp.email({
    email,
    password,
    name,
    callbackURL: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  });
}

export async function signOut() {
  return await neonClient.auth.signOut();
}

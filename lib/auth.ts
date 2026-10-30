import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

function getJwtSecret(): string {
  return (
    process.env.JWT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "your-secret-key-change-me"
  );
}

export type JwtPayloadData = {
  id: string;
  email: string;
  role: string;
};

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function signToken(payload: JwtPayloadData): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "1d" });
}

export function verifyToken(token: string): JwtPayloadData | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayloadData;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<JwtPayloadData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

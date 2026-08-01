import { hash as bcryptHash, compare as bcryptCompare } from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-me";

export type JwtPayloadData = {
  id: string;
  email: string;
  role: string;
};

export async function hashPassword(password: string): Promise<string> {
  return await bcryptHash(password, 10);
}

export async function comparePassword(
  password: string,
  hashValue: string
): Promise<boolean> {
  return await bcryptCompare(password, hashValue);
}

export function signToken(payload: JwtPayloadData): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });
}

export function verifyToken(token: string): JwtPayloadData | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayloadData;
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

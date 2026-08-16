import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "../db/client.js";

export async function signToken(
  userId: string,
  rememberMe = true
): Promise<string> {
  const key = new TextEncoder().encode(getJwtSecret());
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(rememberMe ? "30d" : "1d")
    .sign(key);
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const key = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(token, key);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

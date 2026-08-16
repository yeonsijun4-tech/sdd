import { SignJWT, jwtVerify } from "jose";

const TOKEN_TTL = "7d";

export async function signToken(
  userId: string,
  secret: string
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(key);
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<string | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

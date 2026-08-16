const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveKey(password, salt);
  const saltHex = bufferToHex(salt);
  const hashHex = bufferToHex(new Uint8Array(hash));
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = hexToBuffer(saltHex);
  const expected = hexToBuffer(hashHex);
  const actual = new Uint8Array(await deriveKey(password, salt));

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
}

function bufferToHex(buffer: Uint8Array): string {
  return [...buffer].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export function createId(): string {
  return crypto.randomUUID();
}

export function sanitizeNickname(value: string): string {
  return value.trim().slice(0, 16);
}

export function isValidNickname(value: string): boolean {
  return /^[a-zA-Z0-9가-힣_]{2,16}$/.test(value);
}

export function isValidPassword(value: string): boolean {
  return value.length >= 6 && value.length <= 64;
}

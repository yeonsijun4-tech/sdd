export const DEV_POINT_GRANT = "18472638294882030023725";
export const DEV_NICKNAMES = ["ysjyoun", "ysjyoun0"];

export function normalizePointInput(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;

  try {
    return BigInt(text).toString();
  } catch {
    return null;
  }
}

export function comparePoints(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

export function addPoints(current: string, delta: string): string {
  const next = BigInt(current) + BigInt(delta);
  return next < 0n ? "0" : next.toString();
}

export function multiplyPoints(value: string, multiplier: number): string {
  return (BigInt(value) * BigInt(Math.trunc(multiplier))).toString();
}

export function formatPointsKo(value: string | number): string {
  const big =
    typeof value === "number" ? BigInt(Math.trunc(value)) : BigInt(value || "0");
  return `${big.toLocaleString("ko-KR")}P`;
}

export function pointsGreaterThan(a: string, b: string): boolean {
  return BigInt(a) > BigInt(b);
}

export function pointsGreaterOrEqual(a: string, b: string): boolean {
  return BigInt(a) >= BigInt(b);
}

export function isZeroPoints(value: string): boolean {
  return BigInt(value || "0") === 0n;
}

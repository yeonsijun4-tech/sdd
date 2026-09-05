export function formatPoints(value: string | number): string {
  const big =
    typeof value === "number" ? BigInt(Math.trunc(value)) : BigInt(value || "0");
  return `${big.toLocaleString("ko-KR")}P`;
}

export function parsePointInput(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return 0n;
  return BigInt(trimmed);
}

export function pointsGreaterThan(a: string | number, b: string | number): boolean {
  const left = typeof a === "number" ? BigInt(Math.trunc(a)) : BigInt(a || "0");
  const right = typeof b === "number" ? BigInt(Math.trunc(b)) : BigInt(b || "0");
  return left > right;
}

export function pointsGreaterOrEqual(a: string | number, b: string | number): boolean {
  const left = typeof a === "number" ? BigInt(Math.trunc(a)) : BigInt(a || "0");
  const right = typeof b === "number" ? BigInt(Math.trunc(b)) : BigInt(b || "0");
  return left >= right;
}

export function isZeroPoints(value: string | number): boolean {
  const big =
    typeof value === "number" ? BigInt(Math.trunc(value)) : BigInt(value || "0");
  return big === 0n;
}

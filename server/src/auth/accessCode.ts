export function getAccessCode(): string {
  return process.env.LOGIN_ACCESS_CODE ?? "0828";
}

export function verifyAccessCode(code: string | undefined): boolean {
  return String(code ?? "").trim() === getAccessCode();
}

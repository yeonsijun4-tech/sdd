export function isDbConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  const code = candidate.code ?? "";
  const message = candidate.message ?? "";
  return (
    [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "57P01",
      "53300",
      "08006",
      "08003",
      "ECONNABORTED",
      "ENOTFOUND",
    ].includes(code) ||
    message.includes("Connection terminated") ||
    message.includes("connection timeout") ||
    message.includes("Cannot use a pool after calling end") ||
    message.includes("Client has encountered a connection error") ||
    message.includes("terminating connection")
  );
}

export function mapApiError(error: unknown): { status: 503; message: string } {
  void error;
  return {
    status: 503,
    message: "서버가 준비 중입니다. 같은 버튼을 다시 눌러 주세요.",
  };
}

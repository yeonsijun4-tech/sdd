export const BLOCKED_ERROR_PHRASE = "요청 처리 중 문제가 발생했습니다";

const GENERIC_FAILURE_PATTERNS = [
  BLOCKED_ERROR_PHRASE,
  "요청 처리 중 오류",
  "서버 내부 오류",
  "서버 오류 (",
  "잠시 후 다시 시도해 주세요",
];

export function isBlockedErrorMessage(message: string): boolean {
  const text = message.trim();
  return GENERIC_FAILURE_PATTERNS.some((pattern) => text.includes(pattern));
}

export function isTransientServerError(status: number, message = ""): boolean {
  if (status >= 500 || status === 503 || status === 502 || status === 504) {
    return true;
  }
  return (
    message.includes("준비 중") ||
    message.includes("깨어나는 중") ||
    message.includes("연결할 수 없") ||
    message.includes("연결이 잠시")
  );
}

export function shouldSilenceErrorToast(error: unknown): boolean {
  if (error instanceof Error && "status" in error) {
    const apiError = error as Error & {
      status?: number;
      accountDeleted?: boolean;
      forceExit?: boolean;
    };

    if (apiError.forceExit || apiError.accountDeleted) {
      return false;
    }

    const status = typeof apiError.status === "number" ? apiError.status : 0;
    if (isBlockedErrorMessage(apiError.message)) {
      return true;
    }
    if (isTransientServerError(status, apiError.message)) {
      return true;
    }
  }

  if (error instanceof Error) {
    return isBlockedErrorMessage(error.message) || isTransientServerError(0, error.message);
  }

  return false;
}

export function sanitizeUserMessage(message: string, status = 0): string {
  if (isBlockedErrorMessage(message)) {
    return "";
  }

  if (isTransientServerError(status, message)) {
    return "";
  }

  return message;
}

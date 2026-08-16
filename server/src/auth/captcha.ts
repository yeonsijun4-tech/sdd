interface CaptchaEntry {
  answer: string;
  expiresAt: number;
}

const captchas = new Map<string, CaptchaEntry>();
const TTL_MS = 5 * 60 * 1000;

function randomDigit(): number {
  return Math.floor(Math.random() * 9) + 1;
}

export function createCaptcha() {
  const left = randomDigit();
  const right = randomDigit();
  const id = crypto.randomUUID();

  captchas.set(id, {
    answer: String(left + right),
    expiresAt: Date.now() + TTL_MS,
  });

  cleanupExpired();

  return {
    captchaId: id,
    question: `${left} + ${right} = ?`,
  };
}

export function verifyCaptcha(captchaId: string, answer: string): boolean {
  cleanupExpired();

  const entry = captchas.get(captchaId);
  if (!entry) return false;

  captchas.delete(captchaId);

  if (Date.now() > entry.expiresAt) return false;

  return entry.answer === answer.trim();
}

function cleanupExpired() {
  const now = Date.now();
  for (const [id, entry] of captchas.entries()) {
    if (entry.expiresAt <= now) captchas.delete(id);
  }
}

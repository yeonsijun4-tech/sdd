import {
  HOUSE_EDGE,
  MAX_NUMBER,
  MIN_NUMBER,
  WIN_MULTIPLIER,
  type GuessChoice,
} from "../types.js";

export interface ProbabilityInfo {
  up: number;
  down: number;
  upPercent: number;
  downPercent: number;
  upMultiplier: number;
  downMultiplier: number;
}

export function clampNumber(value: number): number {
  return Math.max(MIN_NUMBER, Math.min(MAX_NUMBER, Math.round(value)));
}

export function randomNumber(): number {
  return Math.floor(Math.random() * (MAX_NUMBER - MIN_NUMBER + 1)) + MIN_NUMBER;
}

export function randomNumberExcept(exclude: number): number {
  const safeExclude = clampNumber(exclude);
  let next = randomNumber();
  while (next === safeExclude) {
    next = randomNumber();
  }
  return next;
}

export function calculateProbabilities(current: number): ProbabilityInfo {
  const safeCurrent = clampNumber(current);
  const possibleOutcomes = Math.max(1, MAX_NUMBER - MIN_NUMBER);
  const upWins = Math.max(0, MAX_NUMBER - safeCurrent);
  const downWins = Math.max(0, safeCurrent - MIN_NUMBER);

  const up = upWins / possibleOutcomes;
  const down = downWins / possibleOutcomes;

  const upMultiplier = up > 0 ? roundMultiplier((1 - HOUSE_EDGE) / up) : 0;
  const downMultiplier = down > 0 ? roundMultiplier((1 - HOUSE_EDGE) / down) : 0;

  return {
    up,
    down,
    upPercent: roundPercent(up),
    downPercent: roundPercent(down),
    upMultiplier,
    downMultiplier,
  };
}

export function roundMultiplier(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundPercent(probability: number): number {
  return Math.round(probability * 1000) / 10;
}

export function evaluateGuess(
  current: number,
  next: number,
  choice: GuessChoice
): "WIN" | "LOSE" {
  if (choice === "UP") return next > current ? "WIN" : "LOSE";
  return next < current ? "WIN" : "LOSE";
}

export function calculateRoundGain(sessionPoints: number): number {
  return sessionPoints;
}

export function applyWinMultiplier(sessionPoints: number): {
  gain: number;
  total: number;
} {
  const gain = calculateRoundGain(sessionPoints);
  return {
    gain,
    total: sessionPoints * WIN_MULTIPLIER,
  };
}

export function buildProbabilityPayload(current: number) {
  const probabilities = calculateProbabilities(current);
  return {
    currentNumber: current,
    minNumber: MIN_NUMBER,
    maxNumber: MAX_NUMBER,
    probabilities: {
      up: probabilities.upPercent,
      down: probabilities.downPercent,
    },
    multipliers: {
      up: WIN_MULTIPLIER,
      down: WIN_MULTIPLIER,
    },
    rules: {
      probabilityRule:
        `UP 확률 = (${MAX_NUMBER} - 현재숫자) / ${MAX_NUMBER - MIN_NUMBER}, DOWN 확률 = (현재숫자 - ${MIN_NUMBER}) / ${MAX_NUMBER - MIN_NUMBER}. 다음 숫자는 현재 숫자와 같지 않습니다.`,
      multiplierRule: `성공 시 미확정 포인트가 항상 ${WIN_MULTIPLIER}배로 증가합니다.`,
      rewardRule: `성공 시 현재 미확정 포인트 × ${WIN_MULTIPLIER}가 적용됩니다.`,
    },
  };
}

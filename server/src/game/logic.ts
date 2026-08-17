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
  tie: number;
  upPercent: number;
  downPercent: number;
  tiePercent: number;
  upMultiplier: number;
  downMultiplier: number;
}

export function clampNumber(value: number): number {
  return Math.max(MIN_NUMBER, Math.min(MAX_NUMBER, Math.round(value)));
}

export function randomNumber(): number {
  return Math.floor(Math.random() * MAX_NUMBER) + MIN_NUMBER;
}

export function calculateProbabilities(current: number): ProbabilityInfo {
  const safeCurrent = clampNumber(current);
  const upWins = Math.max(0, MAX_NUMBER - safeCurrent);
  const downWins = Math.max(0, safeCurrent - MIN_NUMBER);
  const tie = 1;

  const up = upWins / MAX_NUMBER;
  const down = downWins / MAX_NUMBER;
  const tieProb = tie / MAX_NUMBER;

  const upMultiplier = up > 0 ? roundMultiplier((1 - HOUSE_EDGE) / up) : 0;
  const downMultiplier = down > 0 ? roundMultiplier((1 - HOUSE_EDGE) / down) : 0;

  return {
    up,
    down,
    tie: tieProb,
    upPercent: roundPercent(up),
    downPercent: roundPercent(down),
    tiePercent: roundPercent(tieProb),
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
): "WIN" | "LOSE" | "TIE" {
  if (next === current) return "TIE";
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
      tie: probabilities.tiePercent,
    },
    multipliers: {
      up: WIN_MULTIPLIER,
      down: WIN_MULTIPLIER,
    },
    rules: {
      tieRule:
        "다음 숫자가 현재 숫자와 같으면 UP/DOWN 모두 실패 처리되며, 해당 라운드의 베팅금액은 유지되지 않습니다.",
      probabilityRule:
        "UP 확률 = (100 - 현재숫자) / 100, DOWN 확률 = (현재숫자 - 1) / 100, 동일 숫자 = 1 / 100",
      multiplierRule: `성공 시 베팅금액이 항상 ${WIN_MULTIPLIER}배로 증가합니다.`,
      rewardRule: `성공 시 현재 베팅금액 × ${WIN_MULTIPLIER}가 적용됩니다.`,
    },
  };
}

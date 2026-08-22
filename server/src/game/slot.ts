import crypto from "node:crypto";

export const SLOT_MIN_MAX_SESSION_GAIN = 100_000_000;
export const SLOT_MIN_BET = 1_000_000_000_000;
export const SLOT_WIN_MULTIPLIER = 1000;
export const SLOT_WIN_CHANCE = 0.3;

export type SlotReels = [number, number, number];

export function spinSlotReels(): { reels: SlotReels; win: boolean } {
  const win = crypto.randomInt(0, 10_000) < SLOT_WIN_CHANCE * 10_000;
  if (win) {
    return { reels: [7, 7, 7], win: true };
  }

  let reels: SlotReels;
  do {
    reels = [
      crypto.randomInt(1, 8),
      crypto.randomInt(1, 8),
      crypto.randomInt(1, 8),
    ];
  } while (reels[0] === 7 && reels[1] === 7 && reels[2] === 7);

  return { reels, win: false };
}

export function calculateSlotPayout(betAmount: number, win: boolean): number {
  return win ? betAmount * SLOT_WIN_MULTIPLIER : 0;
}

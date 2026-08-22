const BGM_SRC =
  "https://ncsmusic.s3.eu-west-1.amazonaws.com/tracks/000/000/997/phoenix-1629450035-ZSHfvWoObF.mp3";
const BGM_ENABLED_KEY = "1zuxm_bgm_enabled";

let audio: HTMLAudioElement | null = null;
let autostartBound = false;

export function isBgmEnabled(): boolean {
  return localStorage.getItem(BGM_ENABLED_KEY) !== "0";
}

export function setBgmEnabled(enabled: boolean): void {
  localStorage.setItem(BGM_ENABLED_KEY, enabled ? "1" : "0");
  if (!enabled) {
    pauseBgm();
    return;
  }
  void tryPlayBgm();
}

export function pauseBgm(): void {
  audio?.pause();
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(BGM_SRC);
    audio.loop = true;
    audio.volume = 0.32;
    audio.preload = "auto";
  }
  return audio;
}

export async function tryPlayBgm(): Promise<boolean> {
  if (!isBgmEnabled()) return false;

  const element = ensureAudio();
  if (!element.paused) return true;

  try {
    await element.play();
    return true;
  } catch {
    return false;
  }
}

export function setupBgmAutostart(): void {
  if (autostartBound) return;
  autostartBound = true;

  const resume = () => {
    if (!isBgmEnabled()) return;
    void tryPlayBgm();
  };

  document.addEventListener("pointerdown", resume, { passive: true });
  document.addEventListener("keydown", resume);
}

export function syncBgmForLoggedInUser(isLoggedIn: boolean): void {
  if (!isLoggedIn) {
    pauseBgm();
    return;
  }
  setupBgmAutostart();
  void tryPlayBgm();
}

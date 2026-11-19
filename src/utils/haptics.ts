export type HapticKind = 'light' | 'medium' | 'success' | 'warning';

export const HAPTICS_STORAGE_KEY = 'vayu_mobile_haptics_enabled_v1';

export const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  light: 10,
  medium: 20,
  success: [14, 35, 22],
  warning: [24, 30, 24],
};

export interface MobileDetectEnv {
  userAgent?: string;
  maxTouchPoints?: number;
  coarsePointer?: boolean;
  narrowViewport?: boolean;
}

export function detectMobileDevice(customEnv?: MobileDetectEnv): boolean {
  if (customEnv) {
    const ua = customEnv.userAgent ?? '';
    const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
    const hasTouch = (customEnv.maxTouchPoints ?? 0) > 0;
    const coarse = Boolean(customEnv.coarsePointer);
    const narrow = Boolean(customEnv.narrowViewport);
    return isMobileUa || coarse || (hasTouch && narrow);
  }

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const ua = navigator.userAgent || '';
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const coarse = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  const hasTouch = (navigator.maxTouchPoints ?? 0) > 0;
  const narrow = window.innerWidth <= 900;

  return isMobileUa || coarse || (hasTouch && narrow);
}

export function isHapticsEnabled(storageOverride?: { getItem(key: string): string | null }): boolean {
  try {
    const store = storageOverride ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return true;
    const raw = store.getItem(HAPTICS_STORAGE_KEY);
    if (raw === 'false' || raw === '0') return false;
    return true;
  } catch {
    return true;
  }
}

export function setHapticsEnabled(
  enabled: boolean,
  storageOverride?: { setItem(key: string, val: string): void }
): void {
  try {
    const store = storageOverride ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    store?.setItem(HAPTICS_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage quota errors
  }
}

export interface HapticTriggerEnv {
  isMobile?: boolean;
  enabled?: boolean;
  vibrate?: (pattern: number | number[]) => boolean;
}

export function triggerHaptic(
  kind: HapticKind = 'light',
  envOverride?: HapticTriggerEnv
): { triggered: boolean; reason?: 'disabled' | 'desktop' | 'unsupported' | 'ok' } {
  const enabled = envOverride?.enabled ?? isHapticsEnabled();
  if (!enabled) {
    return { triggered: false, reason: 'disabled' };
  }

  const isMobile = envOverride?.isMobile ?? detectMobileDevice();
  if (!isMobile) {
    return { triggered: false, reason: 'desktop' };
  }

  const vibrateFn =
    envOverride?.vibrate ??
    (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
      ? navigator.vibrate.bind(navigator)
      : null);

  if (!vibrateFn) {
    return { triggered: false, reason: 'unsupported' };
  }

  try {
    const ok = vibrateFn(HAPTIC_PATTERNS[kind]);
    return { triggered: Boolean(ok), reason: 'ok' };
  } catch {
    return { triggered: false, reason: 'unsupported' };
  }
}

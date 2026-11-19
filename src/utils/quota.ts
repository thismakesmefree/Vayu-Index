export const MAX_FREE_PROMPTS_PER_DAY = 10;
export const QUOTA_STORAGE_KEY = 'vayu_free_tier_quota_v1';
export const CUSTOM_KEY_STORAGE_KEY = 'vayu_custom_gemini_key_v1';
export const THEME_STORAGE_KEY = 'vayu_theme_mode_v1';
export const DOCK_ORIENTATION_KEY = 'vayu_dock_orientation_v1';
export const AUTH_SESSION_STORAGE_KEY = 'vayu_auth_session_v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DailyQuotaRecord {
  dateKey: string;
  usedCount: number;
}

export interface QuotaStatus {
  dateKey: string;
  usedCount: number;
  remaining: number;
  limit: number;
  isExhausted: boolean;
}

export function getLocalDateKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function readDailyQuota(storage: StorageLike, now: Date = new Date()): QuotaStatus {
  const todayKey = getLocalDateKey(now);
  let usedCount = 0;

  try {
    const raw = storage.getItem(QUOTA_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DailyQuotaRecord>;
      if (parsed.dateKey === todayKey && typeof parsed.usedCount === 'number' && parsed.usedCount >= 0) {
        usedCount = Math.min(MAX_FREE_PROMPTS_PER_DAY, Math.floor(parsed.usedCount));
      } else {
        // Automatic 24-hour date reset when calendar day changes
        storage.setItem(QUOTA_STORAGE_KEY, JSON.stringify({ dateKey: todayKey, usedCount: 0 }));
      }
    } else {
      storage.setItem(QUOTA_STORAGE_KEY, JSON.stringify({ dateKey: todayKey, usedCount: 0 }));
    }
  } catch {
    usedCount = 0;
  }

  const remaining = Math.max(0, MAX_FREE_PROMPTS_PER_DAY - usedCount);
  return {
    dateKey: todayKey,
    usedCount,
    remaining,
    limit: MAX_FREE_PROMPTS_PER_DAY,
    isExhausted: remaining <= 0,
  };
}

export function consumeFreeTierPrompt(
  storage: StorageLike,
  now: Date = new Date()
): { allowed: boolean; status: QuotaStatus } {
  const current = readDailyQuota(storage, now);
  if (current.isExhausted) {
    return { allowed: false, status: current };
  }

  const nextUsed = current.usedCount + 1;
  const record: DailyQuotaRecord = {
    dateKey: current.dateKey,
    usedCount: nextUsed,
  };
  storage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(record));

  const remaining = Math.max(0, MAX_FREE_PROMPTS_PER_DAY - nextUsed);
  return {
    allowed: true,
    status: {
      dateKey: current.dateKey,
      usedCount: nextUsed,
      remaining,
      limit: MAX_FREE_PROMPTS_PER_DAY,
      isExhausted: remaining <= 0,
    },
  };
}

export function getBrowserStorage(): StorageLike {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  const memory = new Map<string, string>();
  return {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => {
      memory.set(k, v);
    },
    removeItem: (k) => {
      memory.delete(k);
    },
  };
}

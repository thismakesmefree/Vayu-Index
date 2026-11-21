export const CUSTOM_KEY_STORAGE_KEY = 'vayu_custom_gemini_key_v1';
export const THEME_STORAGE_KEY = 'vayu_theme_mode_v1';
export const DOCK_ORIENTATION_KEY = 'vayu_dock_orientation_v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
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

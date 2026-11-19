import { DefaultDarkVariant, DockOrientation, ResolvedTheme, ThemeMode } from '../types';

export const THEME_STORAGE_KEY = 'vayu_theme_mode_v2';
export const DEFAULT_DARK_VARIANT_KEY = 'vayu_default_dark_variant_v1';

export const THEME_MEDIA_ASSETS = {
  darkImage: '/assets/aistudio/dark_24ff50f3.png',
  lightImage: '/assets/aistudio/light_8e2c77fd.png',
  darkToLightVideo: '/assets/aistudio/dark-to-light_upscaled.mp4',
  darkToLightFallbackVideo: '/assets/aistudio/dark-to-light_18d61ae3.mp4',
  lightToDarkVideo: '/assets/aistudio/light-to-dark_upscaled.mp4',
  lightToDarkFallbackVideo: '/assets/aistudio/light-to-dark_26317572.mp4',
} as const;

export type ThemeTransitionDirection = 'light-to-dark' | 'dark-to-light' | null;

export function resolveThemeMode(
  mode: ThemeMode,
  defaultDarkVariant: DefaultDarkVariant,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  if (mode === 'oled') return 'oled';
  return systemPrefersDark ? defaultDarkVariant : 'light';
}

export function getQuickToggleNextTheme(
  currentMode: ThemeMode,
  defaultDarkVariant: DefaultDarkVariant
): ThemeMode {
  if (currentMode === 'light') return defaultDarkVariant;
  if (currentMode === 'dark' || currentMode === 'oled') return 'auto';
  return 'light';
}

/**
 * Determines which theme transition video should play when the resolved theme changes.
 * Light <-> Dark/OLED triggers the matching animated sky transition video; Dark <-> OLED does not.
 */
export function getThemeTransitionDirection(
  previous: ResolvedTheme,
  next: ResolvedTheme
): ThemeTransitionDirection {
  if (previous === next) return null;
  if (previous === 'light' && (next === 'dark' || next === 'oled')) {
    return 'light-to-dark';
  }
  if ((previous === 'dark' || previous === 'oled') && next === 'light') {
    return 'dark-to-light';
  }
  return null;
}

/**
 * Mobile viewports (<768px) default to horizontal bottom floating dock;
 * desktop defaults to saved orientation or vertical left-docked pill.
 */
export function getInitialDockOrientation(
  savedOrientation: string | null,
  viewportWidth: number
): DockOrientation {
  if (viewportWidth > 0 && viewportWidth < 768) {
    return 'horizontal';
  }
  if (savedOrientation === 'horizontal' || savedOrientation === 'vertical') {
    return savedOrientation;
  }
  return 'vertical';
}

export interface ThemeTokens {
  isLight: boolean;
  surface: string;
  surfaceSubtle: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  divider: string;
  input: string;
  selectBg: string;
  btnSecondary: string;
  accentText: string;
  mapBg: string;
  gridStroke: string;
}

export function getThemeTokens(resolved: ResolvedTheme): ThemeTokens {
  if (resolved === 'light') {
    return {
      isLight: true,
      surface: 'bg-white/68 border-white/80 shadow-[0_14px_38px_-12px_rgba(30,41,75,0.18)]',
      surfaceSubtle: 'bg-white/56 border-white/68',
      surfaceElevated: 'bg-white/84 border-white/90 shadow-[0_20px_48px_-12px_rgba(30,41,75,0.24)]',
      textPrimary: 'text-slate-950',
      textSecondary: 'text-slate-900',
      textMuted: 'text-slate-700',
      divider: 'border-slate-900/16',
      input: 'border-white/80 bg-white/84 text-slate-950 placeholder-slate-600 backdrop-blur-md',
      selectBg: 'bg-white/92 text-slate-950 border-white/80',
      btnSecondary: 'border-white/80 bg-white/70 hover:bg-white/88 text-slate-950 backdrop-blur-md',
      accentText: 'text-sky-800',
      mapBg: 'bg-slate-200/80',
      gridStroke: 'rgba(15, 23, 42, 0.14)',
    };
  }

  if (resolved === 'oled') {
    return {
      isLight: false,
      surface: 'bg-[#03050c]/88 border-white/20',
      surfaceSubtle: 'bg-[#070b1a]/78 border-white/15',
      surfaceElevated: 'bg-[#03050d]/94 border-white/24 shadow-[0_22px_48px_-12px_rgba(0,0,0,0.9)]',
      textPrimary: 'text-white',
      textSecondary: 'text-slate-100',
      textMuted: 'text-slate-300',
      divider: 'border-white/15',
      input: 'border-white/20 bg-black/78 text-white placeholder-slate-300 backdrop-blur-md',
      selectBg: 'bg-[#070a14] text-white border-white/22',
      btnSecondary: 'border-white/22 bg-[#0d1224]/76 hover:bg-[#17203d]/88 text-white backdrop-blur-md',
      accentText: 'text-[#38BDF8]',
      mapBg: 'bg-black',
      gridStroke: 'rgba(255, 255, 255, 0.10)',
    };
  }

  // Default Dark Liquid Glass ('dark') overlaying dark.png volumetric twilight sky
  return {
    isLight: false,
    surface: 'bg-[#091026]/68 border-white/24',
    surfaceSubtle: 'bg-[#0e1836]/56 border-white/18',
    surfaceElevated: 'bg-[#091129]/84 border-white/28 shadow-[0_20px_48px_-12px_rgba(2,6,20,0.74)]',
    textPrimary: 'text-white',
    textSecondary: 'text-slate-100',
    textMuted: 'text-slate-200/90',
    divider: 'border-white/16',
    input: 'border-white/24 bg-[#0b132b]/72 text-white placeholder-slate-300/85 backdrop-blur-md',
    selectBg: 'bg-[#0d1630]/92 text-white border-white/24',
    btnSecondary: 'border-white/24 bg-[#111c3a]/68 hover:bg-[#192852]/84 text-white backdrop-blur-md',
    accentText: 'text-[#38BDF8]',
    mapBg: 'bg-[#080d1d]',
    gridStroke: 'rgba(255, 255, 255, 0.11)',
  };
}

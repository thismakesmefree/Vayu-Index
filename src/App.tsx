import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { AlertTriangle, Bell, ExternalLink, Loader2, MapPin, Monitor, Moon, Sparkles, Sun, X } from 'lucide-react';
import { AtmosphericBackground } from './components/AtmosphericBackground';
import { FloatingDock } from './components/FloatingDock';
import { LandingView } from './components/LandingView';
import { DashboardView } from './components/DashboardView';
import { AIChatView } from './components/AIChatView';
import { MapView } from './components/MapView';
import { StatisticsView } from './components/StatisticsView';
import { SettingsView } from './components/SettingsView';
import { GeminiApiKeySetupModal } from './components/GeminiApiKeySetupModal';
import { LocationGateModal } from './components/LocationGateModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import {
  AppRoute,
  BackgroundRouteTask,
  DefaultDarkVariant,
  DockOrientation,
  ThemeMode,
  UserLocationState,
} from './types';
import { getAqiBand, LocationTelemetry, TransitMode } from './utils/airQuality';
import { CUSTOM_KEY_STORAGE_KEY, DOCK_ORIENTATION_KEY, getBrowserStorage } from './utils/quota';
import {
  DEFAULT_DARK_VARIANT_KEY,
  getInitialDockOrientation,
  getQuickToggleNextTheme,
  getThemeTokens,
  resolveThemeMode,
  THEME_STORAGE_KEY,
} from './utils/theme';
import { fetchLocationTelemetry, LOCATION_STORAGE_KEY } from './utils/location';
import { triggerHaptic } from './utils/haptics';
import { sendRouteReadyNotification } from './utils/notifications';
import { MAPS_AUTH_FAILURE_EVENT, MAPS_QUOTA_EXCEEDED_EVENT } from './utils/mapsErrors';
import type { LatLngPoint } from './utils/routeOptimizer';

const PAGE_SPRING = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 30,
  mass: 0.9,
};

export default function App() {
  const storage = useMemo(() => getBrowserStorage(), []);

  const [route, setRoute] = useState<AppRoute>('landing');

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = storage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'oled' || saved === 'auto') {
      return saved;
    }
    return 'dark';
  });

  const [defaultDarkVariant, setDefaultDarkVariant] = useState<DefaultDarkVariant>(() => {
    const saved = storage.getItem(DEFAULT_DARK_VARIANT_KEY);
    return saved === 'oled' ? 'oled' : 'dark';
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = useMemo(
    () => resolveThemeMode(themeMode, defaultDarkVariant, systemPrefersDark),
    [themeMode, defaultDarkVariant, systemPrefersDark]
  );

  const tokens = useMemo(() => getThemeTokens(resolvedTheme), [resolvedTheme]);

  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobileViewport(window.innerWidth < 768);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [dockOrientation, setDockOrientation] = useState<DockOrientation>(() => {
    const saved = storage.getItem(DOCK_ORIENTATION_KEY);
    const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
    return getInitialDockOrientation(saved, width);
  });

  // Mobile Map-only floating dock auto-hide (disappears while scrolling/panning, returns 2s after stopping)
  const [mapDockHidden, setMapDockHidden] = useState(false);
  const mapDockTimerRef = useRef<number | null>(null);

  const clearMapDockTimer = useCallback(() => {
    if (mapDockTimerRef.current !== null) {
      window.clearTimeout(mapDockTimerRef.current);
      mapDockTimerRef.current = null;
    }
  }, []);

  const notifyMapScrollActivity = useCallback(() => {
    if (route !== 'map' || !isMobileViewport) return;
    setMapDockHidden(true);
    clearMapDockTimer();
    mapDockTimerRef.current = window.setTimeout(() => {
      setMapDockHidden(false);
      mapDockTimerRef.current = null;
    }, 2000);
  }, [route, isMobileViewport, clearMapDockTimer]);

  useEffect(() => {
    if (route !== 'map' || !isMobileViewport) {
      clearMapDockTimer();
      setMapDockHidden(false);
      return;
    }

    const onScrollOrGesture = () => {
      notifyMapScrollActivity();
    };

    window.addEventListener('scroll', onScrollOrGesture, { passive: true });
    window.addEventListener('wheel', onScrollOrGesture, { passive: true });
    window.addEventListener('touchmove', onScrollOrGesture, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScrollOrGesture);
      window.removeEventListener('wheel', onScrollOrGesture);
      window.removeEventListener('touchmove', onScrollOrGesture);
      clearMapDockTimer();
    };
  }, [route, isMobileViewport, notifyMapScrollActivity, clearMapDockTimer]);

  const [locationState, setLocationState] = useState<UserLocationState>(() => {
    try {
      const raw = storage.getItem(LOCATION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as UserLocationState;
        if (
          (parsed.status === 'granted' || parsed.status === 'manual') &&
          parsed.coords &&
          Number.isFinite(parsed.coords.lat) &&
          Number.isFinite(parsed.coords.lon)
        ) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return {
      status: 'pending',
      label: 'Unset',
      region: '',
    };
  });

  const locationConfirmed =
    (locationState.status === 'granted' || locationState.status === 'manual') &&
    Boolean(locationState.coords);

  const [locationModalOpen, setLocationModalOpen] = useState<boolean>(() => !locationConfirmed);

  const [telemetry, setTelemetry] = useState<LocationTelemetry | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState<boolean>(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  const [pendingActionAfterLocation, setPendingActionAfterLocation] = useState<
    null | 'free-tier' | { type: 'custom-key'; key: string }
  >(null);

  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    return storage.getItem(CUSTOM_KEY_STORAGE_KEY) || '';
  });

  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [routeAfterApiKey, setRouteAfterApiKey] = useState<AppRoute | null>(null);
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string | null>(null);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [gmpAuthFailure, setGmpAuthFailure] = useState(false);
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundRouteTask[]>([]);
  const [activeTaskResult, setActiveTaskResult] = useState<BackgroundRouteTask | null>(null);
  const [routeReadyToast, setRouteReadyToast] = useState<BackgroundRouteTask | null>(null);
  const notifiedTaskIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    const onAuthFailure = () => setGmpAuthFailure(true);
    window.addEventListener(MAPS_QUOTA_EXCEEDED_EVENT, onQuotaExceeded);
    window.addEventListener(MAPS_AUTH_FAILURE_EVENT, onAuthFailure);
    return () => {
      window.removeEventListener(MAPS_QUOTA_EXCEEDED_EVENT, onQuotaExceeded);
      window.removeEventListener(MAPS_AUTH_FAILURE_EVENT, onAuthFailure);
    };
  }, []);

  useEffect(() => {
    const openTaskById = (taskId: string | null) => {
      if (taskId) {
        const match = backgroundTasks.find((t) => t.id === taskId && t.status === 'completed');
        if (match) {
          setActiveTaskResult(match);
        }
      }
      setRoute('map');
    };

    const onCustomOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<{ taskId?: string }>).detail;
      openTaskById(detail?.taskId ?? null);
    };

    const onSwMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'VAYU_OPEN_ROUTE_TASK') {
        openTaskById(ev.data.taskId ?? null);
      }
    };

    window.addEventListener('vayu-open-route-task', onCustomOpen);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      window.removeEventListener('vayu-open-route-task', onCustomOpen);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [backgroundTasks]);

  // Poll only tasks created in this browser session; task IDs act as unguessable access tokens.
  const hasRunningBackgroundTasks = backgroundTasks.some(
    (t) => t.status === 'pending' || t.status === 'running'
  );

  useEffect(() => {
    if (!hasRunningBackgroundTasks) return;
    const timer = window.setInterval(async () => {
      const updates = await Promise.all(
        backgroundTasks
          .filter((task) => task.status === 'pending' || task.status === 'running')
          .map(async (task) => {
            try {
              const response = await fetch(`/api/routes/background-tasks/${encodeURIComponent(task.id)}`);
              if (!response.ok) return null;
              const data = (await response.json()) as { task?: BackgroundRouteTask };
              return data.task ?? null;
            } catch {
              return null;
            }
          })
      );
      const changedTasks = updates.filter((task): task is BackgroundRouteTask => Boolean(task));
      if (changedTasks.length === 0) return;
      setBackgroundTasks((previous) =>
        previous.map((task) => changedTasks.find((update) => update.id === task.id) ?? task)
      );

      for (const task of changedTasks) {
        if (task.status === 'completed' && !notifiedTaskIdsRef.current.has(task.id)) {
          notifiedTaskIdsRef.current.add(task.id);
          triggerHaptic('success');
          setRouteReadyToast(task);
          const title = `Vayu Route Ready (${task.distanceKm} km)`;
          const body = task.result?.summaryText
            ? `${task.originLabel} → ${task.destinationLabel}: ${task.result.summaryText}`
            : `Optimized low-pollution corridor from ${task.originLabel} to ${task.destinationLabel} is ready.`;
          void sendRouteReadyNotification(title, body, { taskId: task.id });
        }
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [hasRunningBackgroundTasks, backgroundTasks]);

  const handleEnqueueBackgroundTask = useCallback(
    async (params: {
      origin: LatLngPoint;
      destination: LatLngPoint;
      originLabel: string;
      destinationLabel: string;
      transitMode: TransitMode;
    }): Promise<BackgroundRouteTask | null> => {
      try {
        const res = await fetch('/api/routes/background-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...params,
            userApiKey: customApiKey || undefined,
          }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { task?: BackgroundRouteTask };
        if (data.task) {
          setBackgroundTasks((prev) => [data.task!, ...prev.filter((t) => t.id !== data.task!.id)]);
          return data.task;
        }
        return null;
      } catch {
        return null;
      }
    },
    [customApiKey]
  );

  const loadTelemetry = useCallback(async (loc: UserLocationState) => {
    if (!loc.coords) return;
    setTelemetryLoading(true);
    setTelemetryError(null);
    try {
      const live = await fetchLocationTelemetry(loc);
      setTelemetry(live);
    } catch (err: unknown) {
      setTelemetryError(
        err instanceof Error ? err.message : 'Unable to fetch live weather and AQI telemetry.'
      );
    } finally {
      setTelemetryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (locationConfirmed && locationState.coords) {
      loadTelemetry(locationState);
    }
  }, [
    locationConfirmed,
    locationState.coords?.lat,
    locationState.coords?.lon,
    locationState.label,
    loadTelemetry,
  ]);

  const aqiBand = telemetry ? getAqiBand(telemetry.compositeAqi) : getAqiBand(35);

  useEffect(() => {
    storage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode, storage]);

  useEffect(() => {
    storage.setItem(DEFAULT_DARK_VARIANT_KEY, defaultDarkVariant);
  }, [defaultDarkVariant, storage]);

  useEffect(() => {
    if (resolvedTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, [resolvedTheme]);

  const handleChangeDockOrientation = useCallback(
    (next: DockOrientation) => {
      storage.setItem(DOCK_ORIENTATION_KEY, next);
      setDockOrientation(next);
    },
    [storage]
  );

  const handleConfirmLocation = (nextState: UserLocationState) => {
    storage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(nextState));
    setLocationState(nextState);
    setTelemetry(null);
    setLocationModalOpen(false);

    if (pendingActionAfterLocation === 'free-tier') {
      setPendingActionAfterLocation(null);
      setRoute('dashboard');
    } else if (
      pendingActionAfterLocation &&
      typeof pendingActionAfterLocation === 'object' &&
      pendingActionAfterLocation.type === 'custom-key'
    ) {
      const k = pendingActionAfterLocation.key;
      setPendingActionAfterLocation(null);
      handleSaveCustomKey(k);
      setRoute('dashboard');
    }
  };

  const handleEnterFreeTier = () => {
    if (!locationConfirmed) {
      setPendingActionAfterLocation('free-tier');
      setLocationModalOpen(true);
      return;
    }
    setRoute('dashboard');
  };

  const handleSaveCustomKey = (key: string) => {
    storage.setItem(CUSTOM_KEY_STORAGE_KEY, key);
    setCustomApiKey(key);
  };

  const handleEnterWithCustomKey = (key: string) => {
    if (!locationConfirmed) {
      setPendingActionAfterLocation({ type: 'custom-key', key });
      setLocationModalOpen(true);
      return;
    }
    handleSaveCustomKey(key);
    setRoute('dashboard');
  };

  const handleClearCustomKey = () => {
    storage.removeItem(CUSTOM_KEY_STORAGE_KEY);
    setCustomApiKey('');
  };

  const handleOpenApiKeySetup = () => {
    setRouteAfterApiKey(null);
    setApiKeyModalOpen(true);
  };

  const handleOpenAiChat = (prompt?: string) => {
    if (prompt) setPendingAiPrompt(prompt);
    if (customApiKey.trim()) {
      setRoute('ai');
      return;
    }
    setRouteAfterApiKey('ai');
    setApiKeyModalOpen(true);
  };

  const handleNavigate = (nextRoute: AppRoute) => {
    if (nextRoute === 'ai') {
      handleOpenAiChat();
      return;
    }
    setRoute(nextRoute);
  };

  const handleSaveApiKeyFromModal = (key: string) => {
    handleSaveCustomKey(key);
    setApiKeyModalOpen(false);
    if (routeAfterApiKey) setRoute(routeAfterApiKey);
    setRouteAfterApiKey(null);
  };

  const handleToggleDockOrientation = () => {
    triggerHaptic('medium');
    setDockOrientation((prev) => {
      const next = prev === 'vertical' ? 'horizontal' : 'vertical';
      storage.setItem(DOCK_ORIENTATION_KEY, next);
      return next;
    });
  };

  const handleQuickToggleTheme = () => {
    triggerHaptic('light');
    setThemeMode((prev) => getQuickToggleNextTheme(prev, defaultDarkVariant));
  };

  const isLanding = route === 'landing';

  const renderQuickThemeIcon = () => {
    if (themeMode === 'light') return <Sun className="w-3.5 h-3.5 text-amber-500" />;
    if (themeMode === 'auto') return <Monitor className="w-3.5 h-3.5 text-[#38BDF8]" />;
    if (themeMode === 'oled') return <Sparkles className="w-3.5 h-3.5 text-[#D0BCFF]" />;
    return <Moon className="w-3.5 h-3.5 text-[#38BDF8]" />;
  };

  const renderTelemetryPlaceholder = () => {
    if (!locationConfirmed) {
      return (
        <div className={`vayu-glass-panel rounded-2xl border p-8 text-center space-y-4 ${tokens.surface}`}>
          <MapPin className="mx-auto w-8 h-8 text-[#38BDF8]" />
          <h2 className={`font-display text-xl font-bold ${tokens.textPrimary}`}>
            Location Calibration Required
          </h2>
          <p className={`mx-auto max-w-md text-sm ${tokens.textSecondary}`}>
            Allow GPS access or select your city manually so Vayu Index can stream real-time AQI,
            weather, and cyclone telemetry for your exact location.
          </p>
          <button
            type="button"
            onClick={() => setLocationModalOpen(true)}
            className="rounded-lg bg-gradient-to-r from-[#38BDF8] to-[#8B5CF6] px-5 py-2.5 text-sm font-semibold text-[#060609] cursor-pointer"
          >
            Set Your Location
          </button>
        </div>
      );
    }

    if (telemetryError) {
      return (
        <div className={`vayu-glass-panel rounded-2xl border p-8 text-center space-y-4 ${tokens.surface}`}>
          <AlertTriangle className="mx-auto w-8 h-8 text-amber-400" />
          <h2 className={`font-display text-lg font-bold ${tokens.textPrimary}`}>
            Unable to Load Live Telemetry for {locationState.label}
          </h2>
          <p className={`mx-auto max-w-md text-xs ${tokens.textMuted}`}>{telemetryError}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => loadTelemetry(locationState)}
              className="rounded-lg bg-[#38BDF8] px-4 py-2 text-xs font-semibold text-[#060609] cursor-pointer"
            >
              Retry Live Sync
            </button>
            <button
              type="button"
              onClick={() => setLocationModalOpen(true)}
              className={`rounded-lg border px-4 py-2 text-xs font-semibold cursor-pointer ${tokens.btnSecondary}`}
            >
              Change Location
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={`vayu-glass-panel rounded-2xl border p-10 text-center space-y-3 ${tokens.surface}`}>
        <Loader2 className="mx-auto w-8 h-8 animate-spin text-[#38BDF8]" />
        <h2 className={`font-display text-lg font-semibold ${tokens.textPrimary}`}>
          Streaming Live Telemetry for {locationState.label}...
        </h2>
        <p className={`text-xs ${tokens.textMuted}`}>
          Fetching real-time Open-Meteo AQI, meteorological sensors, 7-day outlook &amp; GDACS cyclone feeds
        </p>
      </div>
    );
  };

  return (
    <MotionConfig reducedMotion="user">
    <div
      className={`relative min-h-screen w-full overflow-x-clip ${tokens.textPrimary}`}
      data-theme-mode={themeMode}
      data-resolved-theme={resolvedTheme}
      data-default-dark={defaultDarkVariant}
      data-dock-orientation={dockOrientation}
      data-location-status={locationState.status}
    >
      <AtmosphericBackground resolvedTheme={resolvedTheme} ambientGlow={aqiBand.ambientGlow} />
      <OfflineIndicator />

      {gmpAuthFailure && (
        <div
          role="alert"
          data-testid="gmp-auth-failure-banner"
          className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-950/90 px-4 py-2 text-xs text-amber-200 backdrop-blur-md"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Google Maps rejected the configured key. This is not necessarily a quota error. Check that the Maps JavaScript API is enabled, billing is active, and the website referrer and API restrictions match this deployment.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setGmpAuthFailure(false)}
            aria-label="Dismiss Google Maps authentication warning"
            className="rounded p-1 hover:bg-amber-500/20 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {gmpQuotaExceeded && (
        <div
          role="alert"
          data-testid="gmp-quota-banner"
          className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-950/90 px-4 py-2 text-xs text-amber-200 backdrop-blur-md"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Google Maps Platform demo quota reached. Switch to your own Cloud API key to continue uninterrupted map tiles.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-100 hover:bg-amber-500/30"
            >
              <span>Resolve Quota</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              type="button"
              onClick={() => setGmpQuotaExceeded(false)}
              aria-label="Dismiss quota banner"
              className="rounded p-1 hover:bg-amber-500/20 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {routeReadyToast && (
        <div
          role="status"
          data-testid="background-route-toast"
          className="fixed bottom-20 right-4 z-50 max-w-sm rounded-2xl border border-emerald-400/40 bg-neutral-950/95 p-4 text-xs text-slate-100 shadow-2xl backdrop-blur-xl space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-emerald-400">
              <Bell className="w-4 h-4 shrink-0" />
              <span>Long-Range Gemini Route Ready</span>
            </div>
            <button
              type="button"
              onClick={() => setRouteReadyToast(null)}
              aria-label="Dismiss route notification"
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-slate-300 leading-relaxed">
            {routeReadyToast.originLabel} → {routeReadyToast.destinationLabel} ({routeReadyToast.distanceKm} km):{' '}
            {routeReadyToast.result?.summaryText}
          </p>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setActiveTaskResult(routeReadyToast);
              setRouteReadyToast(null);
              setRoute('map');
            }}
            className="w-full rounded-lg bg-gradient-to-r from-[#38BDF8] to-[#10B981] py-2 font-semibold text-[#060609] cursor-pointer"
          >
            View Route on Map
          </button>
        </div>
      )}

      {!isLanding && (
        <FloatingDock
          activeRoute={route}
          onNavigate={handleNavigate}
          orientation={dockOrientation}
          onToggleOrientation={handleToggleDockOrientation}
          resolvedTheme={resolvedTheme}
          isHidden={isMobileViewport && route === 'map' && mapDockHidden}
        />
      )}

      <AnimatePresence mode="wait">
        {isLanding ? (
          <motion.div
            key="view-landing"
            initial={{ opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.99 }}
            transition={PAGE_SPRING}
          >
            <LandingView
              resolvedTheme={resolvedTheme}
              themeMode={themeMode}
              onQuickToggleTheme={handleQuickToggleTheme}
              telemetry={telemetry}
              telemetryLoading={telemetryLoading}
              locationState={locationState}
              onOpenLocationGate={() => setLocationModalOpen(true)}
              customApiKey={customApiKey}
              onEnterFreeTier={handleEnterFreeTier}
              onEnterWithCustomKey={handleEnterWithCustomKey}
              onOpenApiKeySetup={handleOpenApiKeySetup}
            />
          </motion.div>
        ) : (
          <div
            className={`relative z-10 mx-auto w-full max-w-[1440px] pr-3 sm:px-8 pt-4 sm:pt-5 transition-all ${
              dockOrientation === 'vertical'
                ? 'pl-[74px] sm:pl-24 pb-10'
                : 'pl-3 pb-24'
            }`}
          >
            <header
              data-testid="floating-top-menubar"
              className={`vayu-glass-elevated sticky top-3 sm:top-4 z-30 mb-6 flex items-center justify-between gap-2 sm:gap-4 rounded-full border px-3 sm:px-5 py-2 sm:py-2.5 ${tokens.surfaceElevated}`}
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setRoute('landing')}
                  className={`font-display text-sm sm:text-lg font-bold tracking-tight hover:text-[#38BDF8] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${tokens.textPrimary}`}
                >
                  Vayu Index
                </button>
                <button
                  type="button"
                  onClick={() => setLocationModalOpen(true)}
                  className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium max-w-[220px] truncate cursor-pointer ${tokens.btnSecondary}`}
                  title="Change calibrated location"
                >
                  <MapPin className="w-3 h-3 text-[#38BDF8] shrink-0" />
                  <span className="truncate">
                    {locationConfirmed ? locationState.label : 'Set Location'}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink-0">
                <button
                  type="button"
                  onClick={handleQuickToggleTheme}
                  data-testid="header-theme-toggle"
                  aria-label={`Cycle theme mode (current: ${themeMode})`}
                  title={`Theme: ${themeMode.toUpperCase()} (configure Default Dark in Settings)`}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${tokens.btnSecondary}`}
                >
                  {renderQuickThemeIcon()}
                  <span className="hidden sm:inline">{themeMode}</span>
                </button>

                <PWAInstallButton variant="compact" />

                <button
                  type="button"
                  onClick={() => setRoute('settings')}
                  className={`rounded-lg border px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${tokens.btnSecondary}`}
                >
                  {customApiKey ? 'API key saved' : 'Add API key'}
                </button>
              </div>
            </header>

            <AnimatePresence mode="wait">
              <motion.main
                key={`view-${route}`}
                initial={{ opacity: 0, y: 12, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.985 }}
                transition={PAGE_SPRING}
              >
                {route === 'settings' ? (
                  <SettingsView
                    themeMode={themeMode}
                    resolvedTheme={resolvedTheme}
                    defaultDarkVariant={defaultDarkVariant}
                    onChangeThemeMode={setThemeMode}
                    onChangeDefaultDarkVariant={setDefaultDarkVariant}
                    dockOrientation={dockOrientation}
                    onChangeDockOrientation={handleChangeDockOrientation}
                    locationState={locationState}
                    onOpenLocationGate={() => setLocationModalOpen(true)}
                    customApiKey={customApiKey}
                    onSaveCustomKey={handleSaveCustomKey}
                    onClearCustomKey={handleClearCustomKey}
                    onOpenApiKeySetup={handleOpenApiKeySetup}
                  />
                ) : !telemetry ? (
                  renderTelemetryPlaceholder()
                ) : (
                  <>
                    {route === 'dashboard' && (
                      <DashboardView
                        resolvedTheme={resolvedTheme}
                        telemetry={telemetry}
                        isRefreshing={telemetryLoading}
                        onRefresh={() => loadTelemetry(locationState)}
                        locationState={locationState}
                        onOpenLocationGate={() => setLocationModalOpen(true)}
                        onNavigate={handleNavigate}
                        onAskAi={(prompt) => {
                          handleOpenAiChat(prompt);
                        }}
                      />
                    )}
                    {route === 'ai' && (
                      <AIChatView
                        resolvedTheme={resolvedTheme}
                        city={telemetry}
                        customApiKey={customApiKey}
                        initialPrompt={pendingAiPrompt}
                        onClearInitialPrompt={() => setPendingAiPrompt(null)}
                      />
                    )}
                    {route === 'map' && (
                      <MapView
                        resolvedTheme={resolvedTheme}
                        city={telemetry}
                        customApiKey={customApiKey}
                        onRequireApiKey={handleOpenApiKeySetup}
                        backgroundTasks={backgroundTasks}
                        activeTaskResult={activeTaskResult}
                        onClearActiveTaskResult={() => setActiveTaskResult(null)}
                        onEnqueueBackgroundTask={handleEnqueueBackgroundTask}
                        onMapInteractionActivity={notifyMapScrollActivity}
                      />
                    )}
                    {route === 'stats' && (
                      <StatisticsView resolvedTheme={resolvedTheme} city={telemetry} />
                    )}
                  </>
                )}
              </motion.main>
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>

      <LocationGateModal
        isOpen={locationModalOpen}
        resolvedTheme={resolvedTheme}
        canDismiss={locationConfirmed}
        onClose={() => {
          setPendingActionAfterLocation(null);
          setLocationModalOpen(false);
        }}
        onConfirmLocation={handleConfirmLocation}
      />

      <GeminiApiKeySetupModal
        isOpen={apiKeyModalOpen}
        resolvedTheme={resolvedTheme}
        initialKey={customApiKey}
        onClose={() => {
          setApiKeyModalOpen(false);
          setRouteAfterApiKey(null);
        }}
        onSave={handleSaveApiKeyFromModal}
      />
    </div>
    </MotionConfig>
  );
}

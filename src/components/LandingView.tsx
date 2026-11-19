import React, { useState } from 'react';
import {
  ArrowRight,
  KeyRound,
  Loader2,
  LocateFixed,
  Lock,
  MapPin,
  ShieldCheck,
  Sparkles,
  Wind,
} from 'lucide-react';
import { AuthMode, ResolvedTheme, ThemeMode, UserLocationState } from '../types';
import { getAqiBand, LocationTelemetry } from '../utils/airQuality';
import { QuotaStatus } from '../utils/quota';
import { getThemeTokens } from '../utils/theme';
import { PWAInstallButton } from './PWAInstallButton';
import { ScrollRevealCard } from './ScrollRevealCard';

interface LandingViewProps {
  resolvedTheme: ResolvedTheme;
  themeMode: ThemeMode;
  onQuickToggleTheme: () => void;
  telemetry: LocationTelemetry | null;
  telemetryLoading: boolean;
  locationState: UserLocationState;
  onOpenLocationGate: () => void;
  quotaStatus: QuotaStatus;
  customApiKey: string;
  authMode: AuthMode;
  onEnterFreeTier: () => void;
  onEnterWithCustomKey: (key: string) => void;
  onOpenOAuth: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  resolvedTheme,
  themeMode,
  onQuickToggleTheme,
  telemetry,
  telemetryLoading,
  locationState,
  onOpenLocationGate,
  quotaStatus,
  customApiKey,
  onEnterFreeTier,
  onEnterWithCustomKey,
  onOpenOAuth,
}) => {
  const [guestSubMode, setGuestSubMode] = useState<'free' | 'key'>(
    customApiKey ? 'key' : 'free'
  );
  const [keyInput, setKeyInput] = useState(customApiKey);
  const [keyError, setKeyError] = useState<string | null>(null);

  const tokens = getThemeTokens(resolvedTheme);
  const locationConfirmed =
    (locationState.status === 'granted' || locationState.status === 'manual') &&
    Boolean(locationState.coords);
  const aqiBand = telemetry ? getAqiBand(telemetry.compositeAqi) : null;

  const handleKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (trimmed.length < 12) {
      setKeyError('Enter a valid Gemini API key (minimum 12 characters).');
      return;
    }
    setKeyError(null);
    onEnterWithCustomKey(trimmed);
  };

  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1320px] flex-col px-4 py-6 sm:px-8">
      {/* Clean Top Bar: Brand + Location + Theme + Install + OAuth */}
      <header className={`flex flex-wrap items-center justify-between gap-3 border-b pb-5 ${tokens.divider}`}>
        <div className="flex items-center gap-3">
          <span className={`font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0 ${tokens.textPrimary}`}>
            Vayu Index
          </span>
          <button
            type="button"
            onClick={onOpenLocationGate}
            className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium max-w-[260px] truncate cursor-pointer ${tokens.btnSecondary}`}
          >
            <MapPin className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
            <span className="truncate">
              {locationConfirmed ? locationState.label : 'Set Your Location'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onQuickToggleTheme}
            data-testid="quick-theme-toggle"
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${tokens.btnSecondary}`}
          >
            Theme: {themeMode}
          </button>
          <PWAInstallButton variant="compact" />
          <button
            type="button"
            onClick={onOpenOAuth}
            className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${tokens.btnSecondary}`}
          >
            Sign in with OAuth
          </button>
        </div>
      </header>

      {/* Main 12-column atmospheric landing split */}
      <main className="my-auto grid grid-cols-1 gap-8 py-10 lg:grid-cols-12 lg:items-center">
        {/* Left Hero Column */}
        <section className="lg:col-span-6 space-y-6">
          <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${tokens.accentText}`}>
            Live Global Atmospheric Telemetry
          </p>

          <h1 className={`font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl text-balance ${tokens.textPrimary}`}>
            Real-time air quality &amp; weather precision
          </h1>

          <p className={`max-w-xl text-base leading-relaxed ${tokens.textSecondary}`}>
            Coordinate-exact AQI surveillance, full meteorological diagnostics, global cyclone tracking,
            AI-quantified exposure routines, and green-corridor route planning for your exact location.
          </p>

          {/* Compact Live Telemetry Snapshot Card */}
          <ScrollRevealCard immediate delay={0.04}>
          <div className={`vayu-glass-panel rounded-2xl border p-5 ${tokens.surface}`}>
            {telemetry && aqiBand ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className={`text-xs ${tokens.textMuted}`}>
                    {telemetry.name} · {telemetry.region}
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-3">
                    <span className={`font-display text-4xl font-bold tabular-nums ${tokens.textPrimary}`}>
                      {telemetry.compositeAqi}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: aqiBand.color }}>
                      {aqiBand.advisory}
                    </span>
                  </div>
                </div>

                <div className={`flex flex-wrap items-center gap-5 text-xs tabular-nums ${tokens.textSecondary}`}>
                  <div>
                    <span className={`block ${tokens.textMuted}`}>Weather</span>
                    <span className={`font-mono-tabular text-sm font-semibold ${tokens.textPrimary}`}>
                      {telemetry.temperatureC}°C · {telemetry.meteorology.weatherLabel}
                    </span>
                  </div>
                  <div>
                    <span className={`block ${tokens.textMuted}`}>PM2.5</span>
                    <span className={`font-mono-tabular text-sm font-semibold ${tokens.textPrimary}`}>
                      {telemetry.pollutants[0].value} µg/m³
                    </span>
                  </div>
                  <div>
                    <span className={`block ${tokens.textMuted}`}>Wind</span>
                    <span className={`font-mono-tabular text-sm font-semibold ${tokens.textPrimary}`}>
                      {telemetry.windKmh} km/h {telemetry.windDir}
                    </span>
                  </div>
                </div>
              </div>
            ) : telemetryLoading ? (
              <div className="flex items-center gap-3 py-2 text-sm">
                <Loader2 className="w-5 h-5 animate-spin text-[#38BDF8] shrink-0" />
                <div>
                  <p className={`font-semibold ${tokens.textPrimary}`}>
                    Syncing live telemetry for {locationState.label}...
                  </p>
                  <p className={`text-xs ${tokens.textMuted}`}>
                    Querying Open-Meteo Air Quality, Meteorology &amp; GDACS cyclone tracks
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4 py-1">
                <div>
                  <p className={`text-sm font-semibold ${tokens.textPrimary}`}>
                    No Location Calibrated Yet
                  </p>
                  <p className={`mt-0.5 text-xs ${tokens.textMuted}`}>
                    Allow GPS or search your city/coordinates to stream live local metrics
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenLocationGate}
                  className="rounded-lg bg-[#38BDF8] px-3.5 py-2 text-xs font-semibold text-[#060609] hover:brightness-110 transition-all cursor-pointer"
                >
                  Calibrate Now
                </button>
              </div>
            )}
          </div>
          </ScrollRevealCard>

          <div className={`flex flex-wrap items-center gap-6 text-xs ${tokens.textMuted}`}>
            <span className="flex items-center gap-2">
              <Wind className="w-4 h-4 text-[#38BDF8]" />
              Live AQI, Weather &amp; Cyclones
            </span>
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
              Gemini 3.8 Flash Coach
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Offline-Ready PWA
            </span>
          </div>
        </section>

        {/* Right Mode Selection Column */}
        <section className="lg:col-span-6 space-y-4">
          {/* Location Calibration Status Card */}
          <ScrollRevealCard immediate delay={0.04}>
          <div className={`vayu-glass-panel rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 ${tokens.surface}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#38BDF8]/30 bg-[#38BDF8]/15 text-[#38BDF8]">
                {locationConfirmed ? <MapPin className="w-4 h-4" /> : <LocateFixed className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${tokens.textPrimary}`}>
                  {locationConfirmed
                    ? `Location: ${locationState.label}`
                    : 'Location Access Required'}
                </p>
                <p className={`text-[11px] truncate ${tokens.textMuted}`}>
                  {locationConfirmed && locationState.coords
                    ? `${locationState.region} (${locationState.coords.lat.toFixed(2)}°, ${locationState.coords.lon.toFixed(2)}°)`
                    : 'Allow GPS or search your location manually to continue'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenLocationGate}
              data-testid="landing-calibrate-location-btn"
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${tokens.btnSecondary}`}
            >
              {locationConfirmed ? 'Change Location' : 'Set Location'}
            </button>
          </div>
          </ScrollRevealCard>

          {/* Option B: OAuth Login Mode */}
          <ScrollRevealCard immediate delay={0.08}>
          <div className={`vayu-glass-panel rounded-2xl border p-6 transition-colors ${tokens.surface}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className={`font-display text-lg font-semibold ${tokens.textPrimary}`}>
                  Login Mode (OAuth)
                </h2>
                <p className={`mt-1 text-sm ${tokens.textSecondary}`}>
                  Automatically attaches your linked Gemini API key session and unlocks{' '}
                  <span className={`font-medium ${tokens.textPrimary}`}>
                    Low-Smog Route Planning
                  </span>{' '}
                  in Map View.
                </p>
              </div>
              <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            </div>

            <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t ${tokens.divider}`}>
              <span className={`text-xs ${tokens.textMuted}`}>
                Unrestricted AI queries · Route planner unlocked
              </span>
              <button
                type="button"
                onClick={onOpenOAuth}
                data-testid="landing-oauth-btn"
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#38BDF8] to-[#8B5CF6] px-4 py-2.5 text-sm font-semibold text-[#060609] shadow-[0_0_24px_-4px_rgba(56,189,248,0.4)] hover:brightness-110 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Sign in with OAuth</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          </ScrollRevealCard>

          {/* Option A: Guest Mode */}
          <ScrollRevealCard delay={0.12}>
          <div className={`vayu-glass-panel rounded-2xl border p-6 ${tokens.surface}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={`font-display text-lg font-semibold ${tokens.textPrimary}`}>
                  Guest Mode
                </h2>
                <p className={`mt-0.5 text-xs flex items-center gap-1.5 ${tokens.textMuted}`}>
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Low-Smog Route Planner in Map View stays locked until OAuth sign-in</span>
                </p>
              </div>

              <div className={`flex items-center gap-1 rounded-lg border p-1 ${tokens.surfaceSubtle}`}>
                <button
                  type="button"
                  onClick={() => setGuestSubMode('free')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    guestSubMode === 'free'
                      ? 'bg-[#38BDF8] text-[#060609] font-semibold'
                      : `${tokens.textMuted}`
                  }`}
                >
                  Free Tier
                </button>
                <button
                  type="button"
                  onClick={() => setGuestSubMode('key')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    guestSubMode === 'key'
                      ? 'bg-[#38BDF8] text-[#060609] font-semibold'
                      : `${tokens.textMuted}`
                  }`}
                >
                  Own API Key
                </button>
              </div>
            </div>

            {guestSubMode === 'free' ? (
              <div className="mt-5 space-y-4">
                <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${tokens.surfaceSubtle}`}>
                  <div>
                    <p className={`text-sm font-medium ${tokens.textPrimary}`}>Daily AI Quota</p>
                    <p className={`text-xs ${tokens.textMuted}`}>
                      Resets automatically every 24 hours
                    </p>
                  </div>
                  <span
                    data-testid="landing-quota-badge"
                    className={`font-mono-tabular text-sm font-semibold ${tokens.accentText}`}
                  >
                    {quotaStatus.remaining} / {quotaStatus.limit} prompts left
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onEnterFreeTier}
                  data-testid="landing-guest-free-btn"
                  className={`flex h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors cursor-pointer ${tokens.btnSecondary}`}
                >
                  <span>Continue as Guest (Free Tier)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <form onSubmit={handleKeySubmit} className="mt-5 space-y-3">
                <div>
                  <label htmlFor="guest-gemini-key" className={`block text-xs font-medium mb-1.5 ${tokens.textSecondary}`}>
                    Personal Gemini API Key (stored locally for unrestricted AI queries)
                  </label>
                  <div className="relative">
                    <KeyRound className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${tokens.textMuted}`} />
                    <input
                      id="guest-gemini-key"
                      type="password"
                      value={keyInput}
                      onChange={(e) => {
                        setKeyInput(e.target.value);
                        if (keyError) setKeyError(null);
                      }}
                      placeholder="AIzaSy..."
                      className={`h-11 w-full rounded-lg border pl-9 pr-3 text-sm focus:border-[#38BDF8] focus:outline-none ${tokens.input}`}
                    />
                  </div>
                  {keyError && (
                    <p className="mt-1.5 text-xs text-red-500" role="alert">
                      {keyError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  data-testid="landing-guest-key-btn"
                  className={`flex h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors cursor-pointer ${tokens.btnSecondary}`}
                >
                  <span>Save Key &amp; Enter Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
          </ScrollRevealCard>
        </section>
      </main>
    </div>
  );
};

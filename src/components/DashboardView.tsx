import React, { useState } from 'react';
import {
  AirVent,
  ArrowDown,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Cloud,
  CloudRain,
  Compass,
  Droplets,
  Eye,
  Gauge,
  MapPin,
  Newspaper,
  RefreshCw,
  Route,
  Shield,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Tornado,
  Wind,
} from 'lucide-react';
import { AppRoute, AuthMode, ResolvedTheme, UserLocationState } from '../types';
import {
  buildTodaySuggestions,
  calculateCigaretteEquivalence,
  getAqiBand,
  getPollutantBand,
  LocationTelemetry,
  NewsFeedItem,
  PollutantMetric,
  TodaySuggestion,
} from '../utils/airQuality';
import { QuotaStatus } from '../utils/quota';
import { getThemeTokens } from '../utils/theme';
import { triggerHaptic } from '../utils/haptics';
import { ScrollRevealCard } from './ScrollRevealCard';

interface DashboardViewProps {
  resolvedTheme: ResolvedTheme;
  telemetry: LocationTelemetry;
  isRefreshing: boolean;
  onRefresh: () => void;
  locationState: UserLocationState;
  onOpenLocationGate: () => void;
  onNavigate: (route: AppRoute) => void;
  onAskAi?: (prompt: string) => void;
  authMode: AuthMode;
  quotaStatus: QuotaStatus;
}

const Sparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  const safe = data.length > 1 ? data : [data[0] ?? 0, data[0] ?? 0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = Math.max(0.5, max - min);
  const points = safe
    .map((val, idx) => {
      const x = (idx / Math.max(1, safe.length - 1)) * 120;
      const y = 28 - ((val - min) / range) * 22;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 120 32" className="h-7 w-full overflow-visible" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

const AqiRadialGauge: React.FC<{ aqi: number; cityName: string; isLight: boolean }> = ({
  aqi,
  cityName,
  isLight,
}) => {
  const band = getAqiBand(aqi);
  const normalized = Math.min(1, Math.max(0.05, aqi / 350));
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 0.75;
  const totalArc = circumference * arcFraction;
  const filledArc = totalArc * normalized;

  const angleRad = ((135 + 270 * normalized) * Math.PI) / 180;
  const headX = 110 + radius * Math.cos(angleRad);
  const headY = 110 + radius * Math.sin(angleRad);

  return (
    <div className="relative flex flex-col items-center justify-center py-1">
      <svg viewBox="0 0 220 200" className="w-full max-w-[215px]" aria-label={`US AQI ${aqi} in ${cityName}`}>
        <defs>
          <filter id="gaugeGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx="110"
          cy="110"
          r="98"
          fill="none"
          stroke={isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.06)'}
          strokeWidth="1.5"
          strokeDasharray="3 7"
        />

        <circle
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          stroke={isLight ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.08)'}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${totalArc} ${circumference}`}
          transform="rotate(135 110 110)"
        />

        <circle
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          stroke={band.color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filledArc} ${circumference}`}
          transform="rotate(135 110 110)"
          filter="url(#gaugeGlow)"
        />

        <circle cx={headX} cy={headY} r="5.5" fill={isLight ? '#0F172A' : '#F8FAFC'} filter="url(#gaugeGlow)" />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1 text-center">
        <span className={`text-[11px] font-medium uppercase tracking-[0.12em] ${isLight ? 'text-slate-500' : 'text-[#94A3B8]'}`}>
          US AQI
        </span>
        <span className={`font-display text-5xl font-bold tracking-tight tabular-nums mt-0.5 ${isLight ? 'text-slate-950' : 'text-[#F8FAFC]'}`}>
          {aqi}
        </span>
        <span className="mt-1 text-xs font-semibold" style={{ color: band.color }}>
          {band.label}
        </span>
      </div>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  resolvedTheme,
  telemetry,
  isRefreshing,
  onRefresh,
  locationState,
  onOpenLocationGate,
  onNavigate,
  onAskAi,
  authMode,
  quotaStatus,
}) => {
  const [newsFilter, setNewsFilter] = useState<'All' | NewsFeedItem['category']>('All');
  const [expandedNewsId, setExpandedNewsId] = useState<string | null>(telemetry.newsFeed[0]?.id ?? null);
  const [expandedSuggestionId, setExpandedSuggestionId] = useState<string | null>(null);

  const band = getAqiBand(telemetry.compositeAqi);
  const tokens = getThemeTokens(resolvedTheme);
  const met = telemetry.meteorology;
  const maxHourlyAqi = Math.max(...telemetry.hourlyForecast.map((h) => h.aqi), 60);
  const cigEq = calculateCigaretteEquivalence(telemetry.pollutants[0]?.value ?? 0);
  const pm25Value = telemetry.pollutants.find((p) => p.id === 'pm25')?.value ?? 0;
  const suggestions = buildTodaySuggestions(telemetry);

  const scrollToSection = (id: string) => {
    triggerHaptic('light');
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const getMobileAqiBannerClass = () => {
    if (tokens.isLight) {
      switch (band.key) {
        case 'optimal':
          return 'bg-emerald-50/95 border-emerald-300/70 text-emerald-950';
        case 'cautionary':
          return 'bg-amber-50/95 border-amber-300/75 text-amber-950';
        case 'unhealthy':
          return 'bg-orange-100/95 border-orange-300/80 text-orange-950';
        case 'hazardous':
          return 'bg-rose-100/95 border-rose-300/80 text-rose-950';
      }
    }
    switch (band.key) {
      case 'optimal':
        return 'bg-emerald-950/65 border-emerald-500/35 text-emerald-50';
      case 'cautionary':
        return 'bg-amber-950/60 border-amber-500/35 text-amber-50';
      case 'unhealthy':
        return 'bg-orange-950/65 border-orange-500/40 text-orange-50';
      case 'hazardous':
        return 'bg-rose-950/75 border-rose-500/45 text-rose-50';
    }
  };

  const renderSuggestionIcon = (iconKey: TodaySuggestion['iconKey']) => {
    switch (iconKey) {
      case 'purifier':
        return <AirVent className="w-5 h-5 text-amber-400" />;
      case 'travel':
        return <Route className="w-5 h-5 text-[#38BDF8]" />;
      case 'thermo':
        return <Thermometer className="w-5 h-5 text-orange-400" />;
      case 'shield':
        return <Shield className="w-5 h-5 text-emerald-400" />;
      case 'window':
        return <Clock className="w-5 h-5 text-[#8B5CF6]" />;
    }
  };

  const handleSuggestionAction = (card: TodaySuggestion) => {
    triggerHaptic('medium');
    if (card.actionTarget === 'ai') {
      if (onAskAi) {
        onAskAi(card.aiPrompt);
      } else {
        onNavigate('ai');
      }
      return;
    }
    if (card.actionTarget === 'map') {
      onNavigate('map');
      return;
    }
    scrollToSection('full-details-meteo');
  };

  const filteredNews =
    newsFilter === 'All'
      ? telemetry.newsFeed
      : telemetry.newsFeed.filter((item) => item.category === newsFilter);

  const meteoMetrics = [
    {
      label: 'Temperature',
      value: `${met.temperatureC}°C`,
      sub: `Feels ${met.apparentTempC}°C · H:${met.tempMaxC}° L:${met.tempMinC}°`,
      icon: Thermometer,
    },
    {
      label: 'Humidity & Dew Pt',
      value: `${met.humidityPercent}%`,
      sub: `Dew Pt ${met.dewPointC}°C · VPD ${met.vapourPressureDeficitKpa} kPa`,
      icon: Droplets,
    },
    {
      label: 'Wind & Gusts',
      value: `${met.windKmh} km/h ${met.windDir}`,
      sub: `Gusts ${met.windGustKmh} km/h · ${met.windDirDeg}°`,
      icon: Wind,
    },
    {
      label: 'Barometric Pressure',
      value: `${met.pressureMslHpa} hPa`,
      sub: `Surface ${met.surfacePressureHpa} hPa · ${met.pressureTrend}`,
      icon: Gauge,
    },
    {
      label: 'Precipitation',
      value: `${met.precipitationMm} mm`,
      sub: `Prob ${met.precipProbPercent}% · Rain ${met.rainMm} · Snow ${met.snowfallCm} cm`,
      icon: CloudRain,
    },
    {
      label: 'Cloud & Visibility',
      value: `${met.cloudCoverPercent}% · ${met.visibilityKm} km`,
      sub: `Layers L:${met.cloudLowPercent}% M:${met.cloudMidPercent}% H:${met.cloudHighPercent}%`,
      icon: Cloud,
    },
    {
      label: 'UV & Solar Flux',
      value: `UV ${met.uvIndex} · ${met.solarWm2} W/m²`,
      sub: `Clear UV ${met.uvClearSky} · Dir ${met.directRadiationWm2} / Diff ${met.diffuseRadiationWm2}`,
      icon: Sun,
    },
    {
      label: 'Dispersion & Soil',
      value: `${met.boundaryLayerM} m PBL`,
      sub: `Vent ${met.ventilationCoeffM2s} m²/s · Soil ${met.soilTempC}°C (${met.soilMoistureM3} m³/m³)`,
      icon: Compass,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Clean Location Header — NO preset city buttons */}
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${tokens.divider}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={`font-display text-2xl font-bold tracking-tight ${tokens.textPrimary}`}>
              {telemetry.name}
            </h1>
            <span className={`text-xs font-medium ${tokens.textMuted}`}>
              {telemetry.region}
            </span>
          </div>
          <div className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${tokens.textMuted}`}>
            <span className="font-mono-tabular">
              {telemetry.coords.lat.toFixed(3)}°, {telemetry.coords.lon.toFixed(3)}° · Elev {telemetry.elevationM} m
            </span>
            <span aria-hidden="true">·</span>
            <span>{telemetry.timezone}</span>
            <span aria-hidden="true">·</span>
            <span>{telemetry.updatedAtLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenLocationGate}
            data-testid="dashboard-change-location-btn"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${tokens.btnSecondary}`}
          >
            <MapPin className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>{locationState.status === 'granted' ? 'GPS Active · Change' : 'Change Location'}</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            data-testid="dashboard-refresh-btn"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer ${tokens.btnSecondary}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#38BDF8] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Mobile-Only Top Fold: AQI + Temp Cards -> Middle Scrollable Today's Suggestions -> Bottom Full Details */}
      <section className="md:hidden space-y-5" data-testid="mobile-dashboard-overview">
        {/* Up Top: AQI Status Banner + Temperature Summary */}
        <div className="space-y-3" data-testid="mobile-top-summary">
          <ScrollRevealCard immediate>
            <button
              type="button"
              onClick={() => scrollToSection('full-details-aqi')}
              data-testid="mobile-aqi-card"
              className={`vayu-glass-panel w-full rounded-2xl border p-4 text-left transition-transform active:scale-[0.99] cursor-pointer ${getMobileAqiBannerClass()}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-medium opacity-80">Air Quality</p>
                  <p className="font-display text-lg font-bold tracking-tight tabular-nums">
                    {band.label} (AQI {telemetry.compositeAqi})
                  </p>
                  <p className="text-[11px] opacity-80 tabular-nums truncate">
                    PM2.5 {pm25Value} µg/m³ · {telemetry.dominantPollutant} dominant · EU AQI {telemetry.europeanAqi}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 shrink-0 opacity-80" style={{ color: band.color }} />
              </div>
            </button>
          </ScrollRevealCard>

          <ScrollRevealCard immediate delay={0.05}>
            <button
              type="button"
              onClick={() => scrollToSection('full-details-meteo')}
              data-testid="mobile-temp-card"
              className={`vayu-glass-panel w-full rounded-2xl border p-4 text-left transition-transform active:scale-[0.99] cursor-pointer ${tokens.surface}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${tokens.surfaceSubtle}`}>
                    <Thermometer className="w-5 h-5 text-[#38BDF8]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`font-display text-2xl font-bold tabular-nums ${tokens.textPrimary}`}>
                        {met.temperatureC}°C
                      </span>
                      <span className={`text-xs font-medium truncate ${tokens.textSecondary}`}>
                        {met.weatherLabel}
                      </span>
                    </div>
                    <p className={`text-[11px] tabular-nums truncate ${tokens.textMuted}`}>
                      Feels {met.apparentTempC}°C · H:{met.tempMaxC}° L:{met.tempMinC}° · Wind {met.windKmh} km/h
                    </p>
                  </div>
                </div>
                <ChevronRight className={`w-5 h-5 shrink-0 ${tokens.textMuted}`} />
              </div>
            </button>
          </ScrollRevealCard>
        </div>

        {/* Middle: Scrollable Today's Suggestions Cards */}
        <div className="space-y-3" data-testid="mobile-suggestions-section">
          <div className="flex items-center justify-between gap-2">
            <h2 className={`font-display text-lg font-bold tracking-tight ${tokens.textPrimary}`}>
              Today&apos;s Suggestions
            </h2>
            <button
              type="button"
              onClick={() => scrollToSection('mobile-full-details')}
              className={`inline-flex items-center gap-1 text-xs font-medium cursor-pointer ${tokens.accentText}`}
            >
              <span>Full details</span>
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <div
            data-testid="mobile-suggestions-deck"
            className="space-y-2.5 max-h-[340px] overflow-y-auto pr-0.5 overscroll-y-contain"
          >
            {suggestions.map((card) => {
              const isOpen = expandedSuggestionId === card.id;
              return (
                <div
                  key={card.id}
                  data-testid={`mobile-suggestion-card-${card.id}`}
                  className={`vayu-glass-panel rounded-2xl border transition-colors ${tokens.surface}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setExpandedSuggestionId(isOpen ? null : card.id);
                    }}
                    aria-expanded={isOpen}
                    className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${tokens.surfaceSubtle}`}>
                        {renderSuggestionIcon(card.iconKey)}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold leading-snug ${tokens.textPrimary}`}>
                          {card.title}
                        </p>
                        <p className={`text-[11px] tabular-nums truncate ${tokens.textMuted}`}>
                          {card.subtitle}
                        </p>
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronDown className={`w-4 h-4 shrink-0 ${tokens.textMuted}`} />
                    ) : (
                      <ChevronRight className={`w-4 h-4 shrink-0 ${tokens.textMuted}`} />
                    )}
                  </button>

                  {isOpen && (
                    <div className={`border-t px-4 py-3 space-y-2.5 text-xs ${tokens.divider}`}>
                      <p className={`leading-relaxed ${tokens.textSecondary}`}>{card.detail}</p>
                      <button
                        type="button"
                        onClick={() => handleSuggestionAction(card)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#38BDF8] to-[#8B5CF6] px-4 text-xs font-semibold text-[#060609] cursor-pointer"
                      >
                        <span>{card.actionLabel}</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Full Details Scroll Transition Anchor on Mobile */}
        <div
          id="mobile-full-details"
          className={`flex items-center justify-between border-t pt-4 ${tokens.divider}`}
        >
          <span className={`font-display text-sm font-semibold ${tokens.textPrimary}`}>
            Full Atmospheric &amp; Weather Details
          </span>
          <span className={`text-[11px] tabular-nums ${tokens.textMuted}`}>
            Cig Eq {cigEq}/day · UV {met.uvIndex}
          </span>
        </div>
      </section>

      {/* Top Row: AQI + Weather Hero Card & Complete 8-Card Meteorological Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 4-Column AQI & Primary Weather Dial */}
        <div id="full-details-aqi" className="lg:col-span-4 space-y-5 scroll-mt-24">
          <ScrollRevealCard>
            <div className={`vayu-glass-panel rounded-2xl border p-5 ${tokens.surface}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold ${tokens.textSecondary}`}>
                  {met.weatherLabel} · {met.temperatureC}°C
                </span>
                <span className="text-xs font-medium" style={{ color: band.color }}>
                  {band.advisory}
                </span>
              </div>

              <AqiRadialGauge aqi={telemetry.compositeAqi} cityName={telemetry.name} isLight={tokens.isLight} />

              {/* Sub-dial AQI, EAQI, Dominant Pollutant & Sun Times */}
              <div className={`mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center tabular-nums ${tokens.divider}`}>
                <div>
                  <span className={`block text-[10px] ${tokens.textMuted}`}>EU AQI</span>
                  <span className={`mt-0.5 block font-mono-tabular text-sm font-semibold ${tokens.textPrimary}`}>
                    {telemetry.europeanAqi}
                  </span>
                </div>
                <div>
                  <span className={`block text-[10px] ${tokens.textMuted}`}>Dominant</span>
                  <span className={`mt-0.5 block font-mono-tabular text-sm font-semibold ${tokens.accentText}`}>
                    {telemetry.dominantPollutant}
                  </span>
                </div>
                <div>
                  <span className={`block text-[10px] ${tokens.textMuted}`}>Cigarette Eq</span>
                  <span className={`mt-0.5 block font-mono-tabular text-sm font-semibold ${tokens.textPrimary}`}>
                    {cigEq}/day
                  </span>
                </div>
              </div>

              <div className={`mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center text-xs tabular-nums ${tokens.divider}`}>
                <div>
                  <span className={`flex items-center justify-center gap-1 text-[10px] ${tokens.textMuted}`}>
                    <Sunrise className="w-3 h-3 text-amber-400" /> Sunrise
                  </span>
                  <span className={`mt-0.5 block font-mono-tabular font-semibold ${tokens.textPrimary}`}>
                    {met.sunriseTime}
                  </span>
                </div>
                <div>
                  <span className={`flex items-center justify-center gap-1 text-[10px] ${tokens.textMuted}`}>
                    <Sunset className="w-3 h-3 text-orange-400" /> Sunset
                  </span>
                  <span className={`mt-0.5 block font-mono-tabular font-semibold ${tokens.textPrimary}`}>
                    {met.sunsetTime}
                  </span>
                </div>
                <div>
                  <span className={`flex items-center justify-center gap-1 text-[10px] ${tokens.textMuted}`}>
                    <Eye className="w-3 h-3 text-[#38BDF8]" /> Daylight
                  </span>
                  <span className={`mt-0.5 block font-mono-tabular font-semibold ${tokens.textPrimary}`}>
                    {met.daylightHours}h
                  </span>
                </div>
              </div>
            </div>
          </ScrollRevealCard>

          {/* Action Card */}
          <ScrollRevealCard delay={0.05}>
            <div className={`vayu-glass-panel rounded-2xl border p-5 space-y-3 ${tokens.surface}`}>
              <div className="flex items-center justify-between">
                <h2 className={`font-display text-sm font-semibold ${tokens.textPrimary}`}>
                  Localized Resilience Coach
                </h2>
                {authMode === 'guest-free' && (
                  <span className={`font-mono-tabular text-xs font-semibold ${tokens.accentText}`}>
                    {quotaStatus.remaining}/{quotaStatus.limit} left
                  </span>
                )}
              </div>
              <p className={`text-xs leading-relaxed ${tokens.textSecondary}`}>
                Ask Gemini 3.8 Flash for commute, ventilation, and exposure adjustments tailored to{' '}
                {telemetry.name}&apos;s live {telemetry.pollutants[0]?.value} µg/m³ PM2.5 and{' '}
                {met.temperatureC}°C weather.
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate('ai')}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#38BDF8] to-[#8B5CF6] text-xs font-semibold text-[#060609] hover:brightness-110 transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Ask Vayu AI Coach</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('map')}
                  className={`flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${tokens.btnSecondary}`}
                >
                  <span>Open Dispersion Map</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </ScrollRevealCard>
        </div>

        {/* Right 8-Column Full Meteorological Suite + 6 Particulate/Gas Cards */}
        <div id="full-details-meteo" className="lg:col-span-8 space-y-6 scroll-mt-24">
          {/* Complete Meteorological Diagnostics Grid (8 Cards) */}
          <ScrollRevealCard delay={0.04}>
            <section
              aria-labelledby="meteo-suite-heading"
              data-testid="dashboard-meteorology-grid"
              className={`vayu-glass-panel rounded-2xl border p-5 space-y-4 ${tokens.surface}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="meteo-suite-heading" className={`font-display text-base font-semibold ${tokens.textPrimary}`}>
                  Complete Meteorological &amp; Boundary-Layer Suite
                </h2>
                <span className={`font-mono-tabular text-xs ${tokens.textMuted}`}>
                  AOD {met.aerosolOpticalDepth} · Dust {met.dustUgM3} µg/m³
                  {met.ammoniaUgM3 !== null ? ` · NH₃ ${met.ammoniaUgM3} µg/m³` : ''}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {meteoMetrics.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className={`rounded-xl border p-3.5 space-y-1 ${tokens.surfaceSubtle}`}
                    >
                      <div className={`flex items-center justify-between text-[11px] ${tokens.textMuted}`}>
                        <span>{item.label}</span>
                        <Icon className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                      </div>
                      <p className={`font-mono-tabular text-sm font-bold ${tokens.textPrimary}`}>
                        {item.value}
                      </p>
                      <p className={`text-[10px] leading-snug tabular-nums ${tokens.textMuted}`}>
                        {item.sub}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          </ScrollRevealCard>

          {/* 6 Live Pollutant Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="dashboard-pollutants-grid">
            {telemetry.pollutants.map((pollutant: PollutantMetric, pIdx: number) => {
              const pBand = getPollutantBand(pollutant.value, pollutant.safeLimit);
              return (
                <ScrollRevealCard key={pollutant.id} delay={(pIdx % 3) * 0.04}>
                  <div
                    className={`vayu-glass-panel h-full rounded-2xl border p-4 flex flex-col justify-between ${tokens.surface}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold tracking-wide ${tokens.textSecondary}`}>
                        {pollutant.name}
                      </span>
                      <span className="text-[11px] font-semibold" style={{ color: pBand.color }}>
                        {pBand.label}
                      </span>
                    </div>

                    <div className="my-2.5 flex items-baseline gap-2">
                      <span className={`font-display text-2xl font-bold tabular-nums ${tokens.textPrimary}`}>
                        {pollutant.value}
                      </span>
                      <span className={`text-xs ${tokens.textMuted}`}>{pollutant.unit}</span>
                    </div>

                    <Sparkline data={pollutant.sparkline} color={pBand.color} />

                    <div className={`mt-2 flex items-center justify-between text-[11px] tabular-nums ${tokens.textMuted}`}>
                      <span>WHO ref {pollutant.safeLimit} {pollutant.unit}</span>
                      <span
                        className={
                          pollutant.deltaPercent <= 0 ? 'text-emerald-500 font-medium' : 'text-amber-500 font-medium'
                        }
                      >
                        {pollutant.deltaPercent > 0 ? `+${pollutant.deltaPercent}%` : `${pollutant.deltaPercent}%`} 6h
                      </span>
                    </div>
                  </div>
                </ScrollRevealCard>
              );
            })}
          </div>
        </div>
      </div>

      {/* 24-Hour Combined Forecast + 7-Day Meteorological Forecast */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 24-Hour Combined Weather & AQI Timeline */}
        <ScrollRevealCard className="lg:col-span-7">
          <div className={`vayu-glass-panel h-full rounded-2xl border p-5 ${tokens.surface}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={`font-display text-base font-semibold ${tokens.textPrimary}`}>
                  24-Hour AQI, Temperature &amp; Precip Forecast
                </h2>
                <p className={`text-xs ${tokens.textMuted}`}>
                  Hourly dispersion bars paired with ambient temperature, rain chance, and surface wind
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-8 items-end gap-2 sm:gap-3 h-48 pt-4">
              {telemetry.hourlyForecast.map((slot) => {
                const heightPct = Math.max(18, Math.round((slot.aqi / maxHourlyAqi) * 100));
                const slotBand = getAqiBand(slot.aqi);
                return (
                  <div key={slot.hour} className="flex h-full flex-col items-center justify-end gap-1">
                    <span className={`font-mono-tabular text-[11px] font-semibold ${tokens.textPrimary}`}>
                      {slot.aqi}
                    </span>
                    <div
                      className="w-full max-w-[36px] rounded-t-md transition-all duration-300"
                      style={{
                        height: `${heightPct}%`,
                        background: slot.windowSafe
                          ? 'linear-gradient(180deg, #38BDF8 0%, rgba(56,189,248,0.28) 100%)'
                          : `linear-gradient(180deg, ${slotBand.color} 0%, rgba(148,163,184,0.16) 100%)`,
                      }}
                    />
                    <span className={`font-mono-tabular text-[10px] ${tokens.textSecondary}`}>
                      {slot.tempC}° · {slot.precipProb}%
                    </span>
                    <span className={`font-mono-tabular text-[10px] ${tokens.textMuted}`}>
                      {slot.hour}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollRevealCard>

        {/* 7-Day Meteorological Forecast */}
        <ScrollRevealCard className="lg:col-span-5" delay={0.05}>
          <div className={`vayu-glass-panel h-full rounded-2xl border p-5 ${tokens.surface}`} data-testid="dashboard-7day-forecast">
            <h2 className={`font-display text-base font-semibold ${tokens.textPrimary}`}>
              7-Day Weather &amp; UV Outlook
            </h2>
            <p className={`text-xs ${tokens.textMuted}`}>
              Daily min/max temperatures, rain probability, peak wind, and UV max
            </p>

            <div className={`mt-4 divide-y text-xs ${tokens.divider}`}>
              {telemetry.dailyForecast.map((day) => (
                <div key={day.date} className="flex items-center justify-between gap-2 py-2.5 tabular-nums">
                  <div className="w-14 font-semibold shrink-0">{day.day}</div>
                  <div className={`flex-1 truncate ${tokens.textSecondary}`}>{day.weatherLabel}</div>
                  <div className="text-[11px] text-[#38BDF8] font-mono-tabular w-12 text-right shrink-0">
                    {day.precipProbMax}%
                  </div>
                  <div className={`text-[11px] font-mono-tabular w-14 text-right shrink-0 ${tokens.textMuted}`}>
                    UV {day.uvMax}
                  </div>
                  <div className={`font-mono-tabular font-semibold w-20 text-right shrink-0 ${tokens.textPrimary}`}>
                    {day.tempMinC}° / {day.tempMaxC}°
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollRevealCard>
      </div>

      {/* Upcoming Cyclones & News Feed Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <ScrollRevealCard className="lg:col-span-5">
          <section
            aria-labelledby="cyclones-heading"
            data-testid="dashboard-cyclones-section"
            className={`vayu-glass-panel h-full rounded-2xl border p-5 space-y-4 ${tokens.surface}`}
          >
            <div>
              <h2 id="cyclones-heading" className={`font-display text-base font-semibold flex items-center gap-2 ${tokens.textPrimary}`}>
                <Tornado className="w-4 h-4 text-[#38BDF8]" />
                <span>Upcoming Cyclones &amp; Synoptic Systems</span>
              </h2>
              <p className={`text-xs ${tokens.textMuted}`}>
                Live GDACS global storm feeds ranked by distance from {telemetry.name}
              </p>
            </div>

            <div className="space-y-3">
              {telemetry.cyclones.length === 0 ? (
                <div className={`rounded-xl border p-4 text-xs ${tokens.surfaceSubtle} ${tokens.textSecondary}`}>
                  No active tropical cyclones or severe low-pressure troughs detected near your calibrated coordinates.
                </div>
              ) : (
                telemetry.cyclones.map((cyc) => {
                  const sevColor =
                    cyc.severity === 'warning'
                      ? 'text-red-400'
                      : cyc.severity === 'watch'
                        ? 'text-amber-400'
                        : 'text-[#38BDF8]';
                  return (
                    <div
                      key={cyc.id}
                      className={`rounded-xl border p-4 space-y-2.5 ${tokens.surfaceSubtle}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className={`font-display text-sm font-semibold ${tokens.textPrimary}`}>
                            {cyc.name}
                          </h3>
                          <p className={`text-[11px] ${tokens.textMuted}`}>
                            {cyc.basin} · {cyc.category}
                          </p>
                        </div>
                        <span className={`font-mono-tabular text-xs font-semibold uppercase ${sevColor}`}>
                          {cyc.distanceKm === 0
                            ? 'LOCAL'
                            : cyc.etaHours !== null
                              ? `ETA ${cyc.etaHours}h`
                              : `${cyc.distanceKm.toLocaleString()} km`}
                        </span>
                      </div>

                      <div className={`grid grid-cols-3 gap-2 border-y py-2 text-xs tabular-nums ${tokens.divider}`}>
                        <div>
                          <span className={`block text-[10px] ${tokens.textMuted}`}>Sustained</span>
                          <span className={`font-mono-tabular font-semibold ${tokens.textPrimary}`}>
                            {cyc.windKmh} km/h
                          </span>
                        </div>
                        <div>
                          <span className={`block text-[10px] ${tokens.textMuted}`}>Pressure</span>
                          <span className={`font-mono-tabular font-semibold flex items-center gap-1 ${tokens.textPrimary}`}>
                            <Gauge className="w-3 h-3 text-[#38BDF8]" />
                            {cyc.pressureHpa} hPa
                          </span>
                        </div>
                        <div>
                          <span className={`block text-[10px] ${tokens.textMuted}`}>Distance</span>
                          <span className={`font-mono-tabular font-semibold ${tokens.textPrimary}`}>
                            {cyc.distanceKm.toLocaleString()} km
                          </span>
                        </div>
                      </div>

                      <p className={`text-xs ${tokens.textSecondary}`}>{cyc.trackSummary}</p>
                      <p className={`text-xs font-medium ${tokens.accentText}`}>{cyc.aqiImpact}</p>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </ScrollRevealCard>

        {/* Atmospheric & Climate News Feed */}
        <ScrollRevealCard className="lg:col-span-7" delay={0.05}>
          <section
            aria-labelledby="news-feed-heading"
            data-testid="dashboard-news-section"
            className={`vayu-glass-panel h-full rounded-2xl border p-5 space-y-4 ${tokens.surface}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="news-feed-heading" className={`font-display text-base font-semibold flex items-center gap-2 ${tokens.textPrimary}`}>
                  <Newspaper className="w-4 h-4 text-[#8B5CF6]" />
                  <span>Atmospheric &amp; Cyclone News Feed</span>
                </h2>
                <p className={`text-xs ${tokens.textMuted}`}>
                  Live regional weather dispatches and telemetry advisories for {telemetry.name}
                </p>
              </div>

              <div className={`flex flex-wrap items-center gap-1 rounded-lg border p-1 ${tokens.surfaceSubtle}`}>
                {(['All', 'Cyclones & Weather', 'Air Policy', 'Health Advisory'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setNewsFilter(cat)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      newsFilter === cat
                        ? 'bg-[#38BDF8] text-[#060609] font-semibold'
                        : `${tokens.textMuted}`
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              {filteredNews.map((item) => {
                const isExpanded = expandedNewsId === item.id;
                return (
                  <article
                    key={item.id}
                    className={`rounded-xl border transition-colors ${tokens.surfaceSubtle}`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedNewsId(isExpanded ? null : item.id)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-start justify-between gap-3 p-4 text-left cursor-pointer"
                    >
                      <div className="space-y-1">
                        <div className={`flex flex-wrap items-center gap-2 text-[11px] ${tokens.textMuted}`}>
                          <span className={`font-semibold ${tokens.accentText}`}>{item.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.source}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.publishedAgo}</span>
                        </div>
                        <h3 className={`text-sm font-semibold leading-snug ${tokens.textPrimary}`}>
                          {item.title}
                        </h3>
                        <p className={`text-xs leading-relaxed ${tokens.textSecondary}`}>
                          {item.summary}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className={`w-4 h-4 shrink-0 mt-1 ${tokens.textMuted}`} />
                      ) : (
                        <ChevronDown className={`w-4 h-4 shrink-0 mt-1 ${tokens.textMuted}`} />
                      )}
                    </button>

                    {isExpanded && (
                      <div className={`border-t px-4 py-3 text-xs ${tokens.divider} ${tokens.textSecondary}`}>
                        <span className={`font-semibold ${tokens.textPrimary}`}>Telemetry Context: </span>
                        {item.impactDetail}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </ScrollRevealCard>
      </div>
    </div>
  );
};

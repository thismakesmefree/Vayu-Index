import React, { useState } from 'react';
import { BarChart3, Gauge, Layers, TrendingDown } from 'lucide-react';
import { ResolvedTheme } from '../types';
import {
  calculateCigaretteEquivalence,
  calculateVentilationIndex,
  CityTelemetry,
  getAqiBand,
  getPollutantBand,
} from '../utils/airQuality';
import { getThemeTokens } from '../utils/theme';
import { ScrollRevealCard } from './ScrollRevealCard';

interface StatisticsViewProps {
  resolvedTheme: ResolvedTheme;
  city: CityTelemetry;
}

export const StatisticsView: React.FC<StatisticsViewProps> = ({ resolvedTheme, city }) => {
  const history = city.weeklyHistory.length > 0
    ? city.weeklyHistory
    : [{ day: 'Today', avgAqi: city.compositeAqi, peakAqi: city.compositeAqi, pm25: city.pollutants[0]?.value ?? 0, no2: city.pollutants[2]?.value ?? 0 }];
  const [selectedDayIndex, setSelectedDayIndex] = useState(history.length - 1);
  const [chartMetric, setChartMetric] = useState<'aqi' | 'pm25'>('aqi');
  const tokens = getThemeTokens(resolvedTheme);

  const safeIdx = Math.min(selectedDayIndex, history.length - 1);
  const activeDay = history[safeIdx] ?? history[0];
  const weeklyMeanAqi = Math.round(
    history.reduce((acc, d) => acc + d.avgAqi, 0) / history.length
  );
  const weeklyPeakAqi = Math.max(...history.map((d) => d.peakAqi));
  const pm25Val = city.pollutants[0]?.value ?? 0;
  const pm10Val = city.pollutants[1]?.value ?? 1;
  const fineFractionPct = Math.round((pm25Val / Math.max(1, pm10Val)) * 100);
  const cigEq = calculateCigaretteEquivalence(pm25Val);
  const ventIndex = calculateVentilationIndex(city.windKmh, city.inversionCeilingM);

  const maxSeriesVal =
    chartMetric === 'aqi'
      ? Math.max(...history.map((d) => d.peakAqi), 100)
      : Math.max(...history.map((d) => d.pm25), 50);

  const chartPoints = history.map((day, idx) => {
    const x = history.length === 1 ? 300 : 40 + (idx / (history.length - 1)) * 520;
    const primaryVal = chartMetric === 'aqi' ? day.avgAqi : day.pm25;
    const y = 170 - (primaryVal / maxSeriesVal) * 140;
    return { x, y, day };
  });

  const linePath = chartPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `40,170 ${linePath} 560,170`;

  return (
    <div className="space-y-6">
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${tokens.divider}`}>
        <div>
          <h1 className={`font-display text-2xl font-bold tracking-tight ${tokens.textPrimary}`}>
            Dense Atmospheric Statistics &amp; Telemetry Matrix
          </h1>
          <p className={`mt-0.5 text-xs ${tokens.textMuted}`}>
            Multi-pollutant WHO 2021 exceedance ratios, synoptic dispersion indices, and 7-day trend telemetry for {city.name}
          </p>
        </div>

        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tokens.accentText}`}>
          <TrendingDown className="w-4 h-4" />
          EU AQI {city.europeanAqi} · Dominant {city.dominantPollutant}
        </span>
      </div>

      {/* 6-Metric Dense Executive Strip */}
      <ScrollRevealCard immediate>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="stats-dense-kpis">
          <div className={`vayu-glass-panel rounded-xl border p-3.5 ${tokens.surface}`}>
            <span className={`block text-[11px] ${tokens.textMuted}`}>7D Mean AQI</span>
            <span className={`mt-1 block font-mono-tabular text-xl font-bold ${tokens.textPrimary}`}>
              {weeklyMeanAqi}
            </span>
            <span className={`text-[11px] ${tokens.accentText}`}>US AQI</span>
          </div>

          <div className={`vayu-glass-panel rounded-xl border p-3.5 ${tokens.surface}`}>
            <span className={`block text-[11px] ${tokens.textMuted}`}>7D Peak AQI</span>
            <span className={`mt-1 block font-mono-tabular text-xl font-bold ${tokens.textPrimary}`}>
              {weeklyPeakAqi}
            </span>
            <span className="text-[11px] text-violet-400">7-Day Max</span>
          </div>

          <div className={`vayu-glass-panel rounded-xl border p-3.5 ${tokens.surface}`}>
            <span className={`block text-[11px] ${tokens.textMuted}`}>Cigarette Eq.</span>
            <span className={`mt-1 block font-mono-tabular text-xl font-bold ${tokens.textPrimary}`}>
              {cigEq} / day
            </span>
            <span className={`text-[11px] ${tokens.textMuted}`}>22 µg/m³ = 1/d</span>
          </div>

          <div className={`vayu-glass-panel rounded-xl border p-3.5 ${tokens.surface}`}>
            <span className={`block text-[11px] ${tokens.textMuted}`}>PM2.5 / PM10</span>
            <span className={`mt-1 block font-mono-tabular text-xl font-bold ${tokens.textPrimary}`}>
              {fineFractionPct}%
            </span>
            <span className={`text-[11px] ${tokens.textMuted}`}>Fine Aerosol Share</span>
          </div>

          <div className={`vayu-glass-panel rounded-xl border p-3.5 ${tokens.surface}`}>
            <span className={`block text-[11px] ${tokens.textMuted}`}>Ventilation Coeff</span>
            <span className={`mt-1 block font-mono-tabular text-xl font-bold ${tokens.textPrimary}`}>
              {ventIndex} m²/s
            </span>
            <span className="text-[11px] text-amber-400">
              {ventIndex < 1500 ? 'Stagnant Trap' : 'Active Mixing'}
            </span>
          </div>

          <div className={`vayu-glass-panel rounded-xl border p-3.5 ${tokens.surface}`}>
            <span className={`block text-[11px] ${tokens.textMuted}`}>Barometric (MSL)</span>
            <span className={`mt-1 block font-mono-tabular text-xl font-bold ${tokens.textPrimary}`}>
              {city.meteorology.pressureMslHpa} hPa
            </span>
            <span className={`text-[11px] ${tokens.textMuted}`}>
              {city.meteorology.pressureTrend} · Vis {city.meteorology.visibilityKm} km
            </span>
          </div>
        </div>
      </ScrollRevealCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 8-Column 7-Day Trend Area & Peak Chart */}
        <ScrollRevealCard className="lg:col-span-8">
        <div className={`vayu-glass-panel h-full rounded-2xl border p-6 ${tokens.surface}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className={`font-display text-base font-semibold flex items-center gap-2 ${tokens.textPrimary}`}>
                <BarChart3 className="w-4 h-4 text-[#38BDF8]" />
                <span>7-Day Particulate &amp; Inversion Trajectory</span>
              </h2>
              <p className={`text-xs ${tokens.textMuted}`}>
                Select any day node to inspect daily mean, inversion peak, PM2.5, and NO₂
              </p>
            </div>

            <div className={`flex items-center gap-1 rounded-lg border p-1 ${tokens.surfaceSubtle}`}>
              <button
                type="button"
                onClick={() => setChartMetric('aqi')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                  chartMetric === 'aqi' ? 'bg-[#38BDF8] text-[#060609] font-semibold' : tokens.textMuted
                }`}
              >
                AQI (Mean &amp; Peak)
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('pm25')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                  chartMetric === 'pm25' ? 'bg-[#38BDF8] text-[#060609] font-semibold' : tokens.textMuted
                }`}
              >
                PM2.5 (µg/m³)
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-6 text-xs tabular-nums">
            <div>
              <span className={`${tokens.textMuted} mr-1.5`}>Selected:</span>
              <span className={`font-semibold ${tokens.textPrimary}`}>{activeDay.day}</span>
            </div>
            <div>
              <span className={`${tokens.textMuted} mr-1.5`}>Mean AQI:</span>
              <span className={`font-mono-tabular font-semibold ${tokens.accentText}`}>{activeDay.avgAqi}</span>
            </div>
            <div>
              <span className={`${tokens.textMuted} mr-1.5`}>Peak AQI:</span>
              <span className="font-mono-tabular font-semibold text-violet-400">{activeDay.peakAqi}</span>
            </div>
            <div>
              <span className={`${tokens.textMuted} mr-1.5`}>PM2.5:</span>
              <span className={`font-mono-tabular font-semibold ${tokens.textPrimary}`}>{activeDay.pm25} µg/m³</span>
            </div>
            <div>
              <span className={`${tokens.textMuted} mr-1.5`}>NO₂:</span>
              <span className={`font-mono-tabular font-semibold ${tokens.textPrimary}`}>{activeDay.no2} µg/m³</span>
            </div>
          </div>

          <div className="mt-5">
            <svg viewBox="0 0 600 205" className="w-full h-56 overflow-visible" role="img" aria-label="7-Day Trajectory Chart">
              <defs>
                <linearGradient id="statsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {[0, 1, 2, 3].map((step) => {
                const y = 30 + step * 46;
                return (
                  <line
                    key={step}
                    x1="30"
                    y1={y}
                    x2="570"
                    y2={y}
                    stroke={tokens.gridStroke}
                    strokeWidth="1"
                  />
                );
              })}

              {chartMetric === 'aqi' &&
                chartPoints.map((pt, idx) => {
                  const peakY = 170 - (pt.day.peakAqi / maxSeriesVal) * 140;
                  const isSelected = idx === selectedDayIndex;
                  return (
                    <rect
                      key={`bar-${pt.day.day}`}
                      x={pt.x - 10}
                      y={peakY}
                      width="20"
                      height={170 - peakY}
                      rx="4"
                      fill={
                        isSelected
                          ? 'rgba(139, 92, 246, 0.38)'
                          : tokens.isLight
                            ? 'rgba(15, 23, 42, 0.08)'
                            : 'rgba(255,255,255,0.06)'
                      }
                      className="cursor-pointer transition-colors"
                      onClick={() => setSelectedDayIndex(idx)}
                    />
                  );
                })}

              <polygon points={areaPath} fill="url(#statsAreaGrad)" />
              <polyline
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={linePath}
              />

              {chartPoints.map((pt, idx) => {
                const isSelected = idx === selectedDayIndex;
                const band = getAqiBand(pt.day.avgAqi);
                return (
                  <g
                    key={`node-${pt.day.day}`}
                    className="cursor-pointer"
                    onClick={() => setSelectedDayIndex(idx)}
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isSelected ? 6.5 : 4.5}
                      fill={isSelected ? (tokens.isLight ? '#0F172A' : '#F8FAFC') : band.color}
                      stroke={tokens.isLight ? '#FFFFFF' : '#060609'}
                      strokeWidth="2"
                    />
                    <text
                      x={pt.x}
                      y="194"
                      textAnchor="middle"
                      fill={isSelected ? '#0284C7' : tokens.isLight ? '#475569' : '#94A3B8'}
                      fontSize="11"
                      fontWeight={isSelected ? '700' : '500'}
                    >
                      {pt.day.day}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
        </ScrollRevealCard>

        {/* 4-Column Boundary-Layer & Meteorology Panel */}
        <ScrollRevealCard className="lg:col-span-4" delay={0.05}>
        <div className={`vayu-glass-panel h-full rounded-2xl border p-5 space-y-4 ${tokens.surface}`}>
          <h2 className={`font-display text-base font-semibold flex items-center gap-2 ${tokens.textPrimary}`}>
            <Gauge className="w-4 h-4 text-[#38BDF8]" />
            <span>Boundary Layer &amp; Meteorology</span>
          </h2>

          <div className="grid grid-cols-2 gap-3 text-xs tabular-nums">
            <div className={`rounded-xl border p-3 ${tokens.surfaceSubtle}`}>
              <span className={`block ${tokens.textMuted}`}>Mixing Height (PBL)</span>
              <span className={`mt-1 block font-mono-tabular text-base font-bold ${tokens.textPrimary}`}>
                {city.meteorology.boundaryLayerM} m
              </span>
            </div>
            <div className={`rounded-xl border p-3 ${tokens.surfaceSubtle}`}>
              <span className={`block ${tokens.textMuted}`}>Dew Point</span>
              <span className={`mt-1 block font-mono-tabular text-base font-bold ${tokens.textPrimary}`}>
                {city.meteorology.dewPointC}°C
              </span>
            </div>
            <div className={`rounded-xl border p-3 ${tokens.surfaceSubtle}`}>
              <span className={`block ${tokens.textMuted}`}>Solar Flux</span>
              <span className={`mt-1 block font-mono-tabular text-base font-bold ${tokens.textPrimary}`}>
                {city.meteorology.solarWm2} W/m²
              </span>
            </div>
            <div className={`rounded-xl border p-3 ${tokens.surfaceSubtle}`}>
              <span className={`block ${tokens.textMuted}`}>UV / Clear-Sky</span>
              <span className={`mt-1 block font-mono-tabular text-base font-bold ${tokens.textPrimary}`}>
                {city.meteorology.uvIndex} / {city.meteorology.uvClearSky}
              </span>
            </div>
            <div className={`rounded-xl border p-3 ${tokens.surfaceSubtle}`}>
              <span className={`block ${tokens.textMuted}`}>Temp / Feels Like</span>
              <span className={`mt-1 block font-mono-tabular text-base font-bold ${tokens.textPrimary}`}>
                {city.temperatureC}° / {city.meteorology.apparentTempC}°C
              </span>
            </div>
            <div className={`rounded-xl border p-3 ${tokens.surfaceSubtle}`}>
              <span className={`block ${tokens.textMuted}`}>Visibility / Cloud</span>
              <span className={`mt-1 block font-mono-tabular text-base font-bold ${tokens.textPrimary}`}>
                {city.meteorology.visibilityKm} km · {city.meteorology.cloudCoverPercent}%
              </span>
            </div>
            <div className={`rounded-xl border p-3 ${tokens.surfaceSubtle}`}>
              <span className={`block ${tokens.textMuted}`}>Vapour Pressure Def</span>
              <span className={`mt-1 block font-mono-tabular text-base font-bold ${tokens.textPrimary}`}>
                {city.meteorology.vapourPressureDeficitKpa} kPa
              </span>
            </div>
            <div className={`rounded-xl border p-3 ${tokens.surfaceSubtle}`}>
              <span className={`block ${tokens.textMuted}`}>Soil Temp (0 cm)</span>
              <span className={`mt-1 block font-mono-tabular text-base font-bold ${tokens.textPrimary}`}>
                {city.meteorology.soilTempC}°C
              </span>
            </div>
          </div>
        </div>
        </ScrollRevealCard>
      </div>

      {/* Dense 8-Pollutant Telemetry Matrix Table */}
      <ScrollRevealCard delay={0.04}>
      <div className={`vayu-glass-panel rounded-2xl border p-5 ${tokens.surface}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className={`font-display text-base font-semibold flex items-center gap-2 ${tokens.textPrimary}`}>
            <Layers className="w-4 h-4 text-[#8B5CF6]" />
            <span>8-Pollutant Concentration &amp; WHO Exceedance Matrix</span>
          </h2>
          <span className={`text-xs ${tokens.textMuted}`}>
            All numeric columns aligned in tabular figures
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs" data-testid="stats-pollutant-table">
            <thead>
              <tr className={`border-b ${tokens.divider} ${tokens.textMuted}`}>
                <th className="py-2.5 pr-4 font-semibold">Pollutant</th>
                <th className="py-2.5 px-3 text-right font-semibold">Current</th>
                <th className="py-2.5 px-3 text-right font-semibold">24h Mean</th>
                <th className="py-2.5 px-3 text-right font-semibold">24h Peak</th>
                <th className="py-2.5 px-3 text-right font-semibold">WHO 2021 Limit</th>
                <th className="py-2.5 px-3 text-right font-semibold">Exceedance</th>
                <th className="py-2.5 pl-3 text-right font-semibold">6h Trend</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${tokens.divider}`}>
              {city.extendedPollutants.map((row) => {
                const band = getPollutantBand(row.current, row.whoLimit);
                const mult = (row.current / Math.max(0.1, row.whoLimit)).toFixed(1);
                return (
                  <tr key={row.code} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 pr-4">
                      <span className={`font-semibold ${tokens.textPrimary}`}>{row.code}</span>
                      <span className={`ml-2 ${tokens.textMuted}`}>{row.name}</span>
                    </td>
                    <td className={`py-2.5 px-3 text-right font-mono-tabular font-semibold ${tokens.textPrimary}`}>
                      {row.current} {row.unit}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-mono-tabular ${tokens.textSecondary}`}>
                      {row.mean24h} {row.unit}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-mono-tabular ${tokens.textSecondary}`}>
                      {row.peak24h} {row.unit}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-mono-tabular ${tokens.textMuted}`}>
                      {row.whoLimit} {row.unit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-tabular font-semibold" style={{ color: band.color }}>
                      {mult}×
                    </td>
                    <td
                      className={`py-2.5 pl-3 text-right font-mono-tabular font-medium ${
                        row.delta6h <= 0 ? 'text-emerald-500' : 'text-amber-500'
                      }`}
                    >
                      {row.delta6h > 0 ? `+${row.delta6h}%` : `${row.delta6h}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </ScrollRevealCard>
    </div>
  );
};

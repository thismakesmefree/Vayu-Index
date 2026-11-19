export type AqiBandKey = 'optimal' | 'cautionary' | 'unhealthy' | 'hazardous';

export interface AqiBand {
  key: AqiBandKey;
  label: string;
  advisory: string;
  color: string;
  ambientGlow: string;
  bgTintClass: string;
  textClass: string;
}

export interface PollutantMetric {
  id: 'pm25' | 'pm10' | 'no2' | 'o3' | 'so2' | 'co';
  name: string;
  value: number;
  unit: string;
  safeLimit: number;
  deltaPercent: number;
  sparkline: number[];
}

export interface ExtendedPollutantRow {
  code: string;
  name: string;
  current: number;
  mean24h: number;
  peak24h: number;
  whoLimit: number;
  unit: string;
  delta6h: number;
}

export interface MeteorologySnapshot {
  temperatureC: number;
  apparentTempC: number;
  tempMaxC: number;
  tempMinC: number;
  dewPointC: number;
  humidityPercent: number;
  vapourPressureDeficitKpa: number;
  windKmh: number;
  windGustKmh: number;
  windDirDeg: number;
  windDir: string;
  pressureMslHpa: number;
  surfacePressureHpa: number;
  pressureTrend: 'Rising' | 'Steady' | 'Falling';
  precipitationMm: number;
  rainMm: number;
  snowfallCm: number;
  precipProbPercent: number;
  cloudCoverPercent: number;
  cloudLowPercent: number;
  cloudMidPercent: number;
  cloudHighPercent: number;
  visibilityKm: number;
  uvIndex: number;
  uvClearSky: number;
  solarWm2: number;
  directRadiationWm2: number;
  diffuseRadiationWm2: number;
  boundaryLayerM: number;
  ventilationCoeffM2s: number;
  soilTempC: number;
  soilMoistureM3: number;
  aerosolOpticalDepth: number;
  dustUgM3: number;
  ammoniaUgM3: number | null;
  sunriseTime: string;
  sunsetTime: string;
  daylightHours: number;
  weatherCode: number;
  weatherLabel: string;
  isDay: boolean;
}

export interface CycloneSystem {
  id: string;
  name: string;
  basin: string;
  category: string;
  severity: 'watch' | 'warning' | 'advisory';
  windKmh: number;
  gustKmh: number;
  pressureHpa: number;
  etaHours: number | null;
  distanceKm: number;
  trackSummary: string;
  aqiImpact: string;
  reportUrl?: string;
}

export interface NewsFeedItem {
  id: string;
  category: 'Cyclones & Weather' | 'Air Policy' | 'Health Advisory';
  title: string;
  source: string;
  publishedAgo: string;
  summary: string;
  impactDetail: string;
  url?: string;
}

export interface SectorNode {
  id: string;
  name: string;
  zone: string;
  lat: number;
  lon: number;
  aqi: number;
  pm25: number;
  x: number;
  y: number;
  windKmh: number;
  humidityPercent: number;
}

export interface HourlyTelemetrySlot {
  hour: string;
  aqi: number;
  pm25: number;
  tempC: number;
  precipProb: number;
  windKmh: number;
  weatherCode: number;
  windowSafe: boolean;
}

export interface DailyForecastSlot {
  day: string;
  date: string;
  weatherCode: number;
  weatherLabel: string;
  tempMaxC: number;
  tempMinC: number;
  precipProbMax: number;
  precipSumMm: number;
  windMaxKmh: number;
  uvMax: number;
}

export interface LocationTelemetry {
  id: string;
  name: string;
  region: string;
  country: string;
  coords: { lat: number; lon: number };
  timezone: string;
  elevationM: number;
  compositeAqi: number;
  europeanAqi: number;
  dominantPollutant: string;
  temperatureC: number;
  humidityPercent: number;
  windKmh: number;
  windDir: string;
  inversionCeilingM: number;
  updatedAtLabel: string;
  pollutants: PollutantMetric[];
  extendedPollutants: ExtendedPollutantRow[];
  meteorology: MeteorologySnapshot;
  cyclones: CycloneSystem[];
  newsFeed: NewsFeedItem[];
  hourlyForecast: HourlyTelemetrySlot[];
  dailyForecast: DailyForecastSlot[];
  weeklyHistory: { day: string; avgAqi: number; peakAqi: number; pm25: number; no2: number }[];
  sectors: SectorNode[];
}

export type CityTelemetry = LocationTelemetry;

export type TransitMode =
  | 'drive'
  | 'transit'
  | 'two_wheeler'
  | 'walk'
  | 'cycle'
  | 'ev_shuttle'
  | 'metro_hybrid';

export interface RouteComparison {
  originName: string;
  destinationName: string;
  mode: TransitMode;
  distanceKm: number;
  standardDurationMin: number;
  greenDurationMin: number;
  standardAvgAqi: number;
  greenAvgAqi: number;
  standardInhaledUg: number;
  greenInhaledUg: number;
  exposureReductionPercent: number;
  co2SavedGrams: number;
  corridorPoints: { x: number; y: number }[];
  directPoints: { x: number; y: number }[];
  waypoints: string[];
}

export function getAqiBand(aqi: number): AqiBand {
  if (aqi <= 50) {
    return {
      key: 'optimal',
      label: 'Optimal',
      advisory: 'Optimal · Clear Airflow',
      color: '#10B981',
      ambientGlow: 'rgba(16, 185, 129, 0.25)',
      bgTintClass: 'bg-emerald-500/15',
      textClass: 'text-emerald-400',
    };
  }
  if (aqi <= 100) {
    return {
      key: 'cautionary',
      label: 'Cautionary',
      advisory: 'Cautionary · Sensitive Caution',
      color: '#F59E0B',
      ambientGlow: 'rgba(245, 158, 11, 0.25)',
      bgTintClass: 'bg-amber-500/15',
      textClass: 'text-amber-400',
    };
  }
  if (aqi <= 200) {
    return {
      key: 'unhealthy',
      label: 'Unhealthy',
      advisory: 'Unhealthy · Limit Outdoor Exertion',
      color: '#EF4444',
      ambientGlow: 'rgba(239, 68, 68, 0.3)',
      bgTintClass: 'bg-red-500/15',
      textClass: 'text-red-400',
    };
  }
  return {
    key: 'hazardous',
    label: 'Hazardous',
    advisory: 'Hazardous · Seal & Filter Indoors',
    color: '#8B5CF6',
    ambientGlow: 'rgba(139, 92, 246, 0.4)',
    bgTintClass: 'bg-violet-500/15',
    textClass: 'text-violet-300',
  };
}

export function getPollutantBand(value: number, safeLimit: number): AqiBand {
  const ratio = value / Math.max(0.1, safeLimit);
  if (ratio <= 1) return getAqiBand(35);
  if (ratio <= 1.8) return getAqiBand(80);
  if (ratio <= 3.2) return getAqiBand(160);
  return getAqiBand(260);
}

/** Berkeley Earth approximation: 22 µg/m³ PM2.5 over 24h ≈ 1 cigarette/day */
export function calculateCigaretteEquivalence(pm25UgM3: number): number {
  return Number((Math.max(0, pm25UgM3) / 22).toFixed(1));
}

export function calculateVentilationIndex(windKmh: number, inversionCeilingM: number): number {
  const windMs = windKmh / 3.6;
  return Math.round(windMs * inversionCeilingM);
}

export function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const normalized = ((deg % 360) + 360) % 360;
  return dirs[Math.round(normalized / 22.5) % 16];
}

export function getWmoWeatherLabel(code: number): string {
  if (code === 0) return 'Clear Sky';
  if (code === 1) return 'Mainly Clear';
  if (code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog / Riming';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code === 56 || code === 57) return 'Freezing Drizzle';
  if (code >= 61 && code <= 65) return code === 65 ? 'Heavy Rain' : 'Rain';
  if (code === 66 || code === 67) return 'Freezing Rain';
  if (code >= 71 && code <= 77) return 'Snowfall';
  if (code >= 80 && code <= 82) return 'Rain Showers';
  if (code === 85 || code === 86) return 'Snow Showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Severe Thunderstorm';
  return 'Variable Conditions';
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateRouteExposure(
  telemetry: LocationTelemetry,
  originId: string,
  destinationId: string,
  mode: TransitMode
): RouteComparison {
  const origin = telemetry.sectors.find((s) => s.id === originId) ?? telemetry.sectors[0];
  const dest =
    telemetry.sectors.find((s) => s.id === destinationId && s.id !== origin.id) ??
    telemetry.sectors[1] ??
    origin;

  const geoDist = haversineKm(origin.lat, origin.lon, dest.lat, dest.lon);
  const pixelDist = Math.hypot(dest.x - origin.x, dest.y - origin.y);
  const distanceKm = Number(Math.max(1.8, geoDist > 0.5 ? geoDist : (pixelDist / 12) * 1.45).toFixed(1));

  const modeParams: Record<
    TransitMode,
    { speedKmh: number; ventilationLMin: number; filtrationFactor: number; co2PerKmSavedVsCar: number }
  > = {
    walk: { speedKmh: 4.8, ventilationLMin: 18, filtrationFactor: 1.0, co2PerKmSavedVsCar: 168 },
    cycle: { speedKmh: 15.5, ventilationLMin: 34, filtrationFactor: 0.95, co2PerKmSavedVsCar: 168 },
    two_wheeler: { speedKmh: 30, ventilationLMin: 14, filtrationFactor: 0.92, co2PerKmSavedVsCar: 88 },
    drive: { speedKmh: 36, ventilationLMin: 9, filtrationFactor: 0.45, co2PerKmSavedVsCar: 22 },
    transit: { speedKmh: 34, ventilationLMin: 11, filtrationFactor: 0.52, co2PerKmSavedVsCar: 146 },
    ev_shuttle: { speedKmh: 24, ventilationLMin: 9, filtrationFactor: 0.42, co2PerKmSavedVsCar: 118 },
    metro_hybrid: { speedKmh: 28, ventilationLMin: 11, filtrationFactor: 0.5, co2PerKmSavedVsCar: 142 },
  };

  const params = modeParams[mode];
  const standardDurationMin = Math.max(8, Math.round((distanceKm / params.speedKmh) * 60));
  const greenDurationMin = Math.round(standardDurationMin * 1.12) + 2;

  const others = telemetry.sectors.filter((s) => s.id !== origin.id && s.id !== dest.id);
  const greenCandidate = [...others].sort((a, b) => a.aqi - b.aqi)[0] ?? origin;
  const arterialCandidate = [...others].sort((a, b) => b.aqi - a.aqi)[0] ?? dest;

  const standardAvgAqi = Math.round((origin.aqi + arterialCandidate.aqi * 1.1 + dest.aqi) / 3.1);
  const greenAvgAqi = Math.round((origin.aqi + greenCandidate.aqi * 1.35 + dest.aqi) / 3.35);

  const standardPm25 = Math.max(
    1,
    Math.round((origin.pm25 + arterialCandidate.pm25 * 1.1 + dest.pm25) / 3.1)
  );
  const greenPm25 = Math.max(
    1,
    Math.round((origin.pm25 + greenCandidate.pm25 * 1.35 + dest.pm25) / 3.35)
  );

  const standardInhaledUg = Number(
    (standardPm25 * (params.ventilationLMin / 1000) * standardDurationMin * params.filtrationFactor).toFixed(1)
  );
  const greenInhaledUg = Number(
    (greenPm25 * (params.ventilationLMin / 1000) * greenDurationMin * params.filtrationFactor * 0.72).toFixed(1)
  );

  const rawReduction = Math.round(
    ((standardInhaledUg - greenInhaledUg) / Math.max(0.1, standardInhaledUg)) * 100
  );
  const exposureReductionPercent = Math.max(8, Math.min(68, rawReduction));

  const co2SavedGrams = Math.round(distanceKm * params.co2PerKmSavedVsCar);

  const midX = (origin.x + dest.x) / 2;
  const midY = (origin.y + dest.y) / 2;

  return {
    originName: origin.name,
    destinationName: dest.name,
    mode,
    distanceKm,
    standardDurationMin,
    greenDurationMin,
    standardAvgAqi,
    greenAvgAqi,
    standardInhaledUg,
    greenInhaledUg,
    exposureReductionPercent,
    co2SavedGrams,
    corridorPoints: [
      { x: origin.x, y: origin.y },
      { x: (origin.x + greenCandidate.x) / 2, y: (origin.y + greenCandidate.y) / 2 },
      { x: greenCandidate.x, y: greenCandidate.y },
      { x: (greenCandidate.x + dest.x) / 2, y: (greenCandidate.y + dest.y) / 2 },
      { x: dest.x, y: dest.y },
    ],
    directPoints: [
      { x: origin.x, y: origin.y },
      {
        x: midX + (arterialCandidate.x - midX) * 0.45,
        y: midY + (arterialCandidate.y - midY) * 0.45,
      },
      { x: dest.x, y: dest.y },
    ],
    waypoints: [origin.name, `${greenCandidate.name} (${greenCandidate.zone})`, dest.name],
  };
}

export interface TodaySuggestion {
  id: string;
  iconKey: 'purifier' | 'travel' | 'thermo' | 'shield' | 'window';
  title: string;
  subtitle: string;
  detail: string;
  actionTarget: 'ai' | 'map' | 'details';
  actionLabel: string;
  aiPrompt: string;
}

export function buildTodaySuggestions(telemetry: LocationTelemetry): TodaySuggestion[] {
  const met = telemetry.meteorology;
  const pm25 = telemetry.pollutants.find((p) => p.id === 'pm25')?.value ?? 0;
  const aqi = telemetry.compositeAqi;
  const band = getAqiBand(aqi);

  const purifierCard: TodaySuggestion =
    aqi > 100 || pm25 > 35
      ? {
          id: 'iaq-purifier',
          iconKey: 'purifier',
          title: 'Use an air purifier',
          subtitle: `PM2.5 ${pm25} µg/m³ · Seal roadside windows`,
          detail: `Running a HEPA purifier on medium-high cuts indoor PM2.5 by ~60–80% in ${telemetry.name} (${band.label} AQI ${aqi}).`,
          actionTarget: 'ai',
          actionLabel: 'Ask AI Coach',
          aiPrompt: `In ${telemetry.name} with US AQI ${aqi} and PM2.5 at ${pm25} µg/m³, give me the best indoor air purifier placement and room-sealing routine with quantified PM2.5 reduction.`,
        }
      : aqi > 50
        ? {
            id: 'iaq-purifier',
            iconKey: 'purifier',
            title: 'Filter indoor air during peak traffic',
            subtitle: `PM2.5 ${pm25} µg/m³ · Vent ${met.ventilationCoeffM2s} m²/s`,
            detail: `Air quality is ${band.label} (${aqi}). Run recirculation filtration near busy streets and ventilate only outside rush-hour spikes.`,
            actionTarget: 'ai',
            actionLabel: 'Ask AI Coach',
            aiPrompt: `Give me an indoor air quality plan for ${telemetry.name} today at AQI ${aqi} and PM2.5 ${pm25} µg/m³.`,
          }
        : {
            id: 'iaq-purifier',
            iconKey: 'purifier',
            title: 'Open windows for fresh airflow',
            subtitle: `Optimal PM2.5 ${pm25} µg/m³ · PBL ${met.boundaryLayerM} m`,
            detail: `Outdoor air in ${telemetry.name} is clean (AQI ${aqi}). Cross-ventilate indoor rooms for 20 minutes to purge indoor CO₂ and VOCs.`,
            actionTarget: 'ai',
            actionLabel: 'Ask AI Coach',
            aiPrompt: `With clean air in ${telemetry.name} (AQI ${aqi}, PM2.5 ${pm25} µg/m³), how can I optimize indoor ventilation while conserving energy at ${met.temperatureC}°C?`,
          };

  const travelCard: TodaySuggestion =
    aqi > 150
      ? {
          id: 'travel-plan',
          iconKey: 'travel',
          title: 'Wear N95 & minimize outdoor travel',
          subtitle: `AQI ${aqi} · Use green-corridor routes`,
          detail: `Avoid prolonged exertion outdoors in ${telemetry.name}. If commuting, choose park/low-traffic corridors and a well-fitted N95/FFP2 respirator.`,
          actionTarget: 'map',
          actionLabel: 'Open Green Route Map',
          aiPrompt: `Plan a low-exposure commute in ${telemetry.name} while AQI is ${aqi}.`,
        }
      : aqi > 50
        ? {
            id: 'travel-plan',
            iconKey: 'travel',
            title: 'Plan low-exposure green travel',
            subtitle: `AQI ${aqi} · Wind ${met.windKmh} km/h ${met.windDir}`,
            detail: `Prefer off-arterial parkways or transit corridors to reduce inhaled PM2.5 dose during your ${telemetry.name} commute.`,
            actionTarget: 'map',
            actionLabel: 'Open Green Route Map',
            aiPrompt: `Suggest low-emission commute alternatives in ${telemetry.name} at AQI ${aqi}.`,
          }
        : {
            id: 'travel-plan',
            iconKey: 'travel',
            title: 'Walk or cycle green corridors',
            subtitle: `AQI ${aqi} · Crisp ${met.visibilityKm} km visibility`,
            detail: `Dispersion is favorable (${met.windKmh} km/h ${met.windDir}). Active transit saves ~168 g CO₂/km with minimal particulate dose.`,
            actionTarget: 'map',
            actionLabel: 'Open Route Map',
            aiPrompt: `Recommend the healthiest active transit timing in ${telemetry.name} today.`,
          };

  const thermoCard: TodaySuggestion =
    met.apparentTempC <= 8
      ? {
          id: 'thermal-comfort',
          iconKey: 'thermo',
          title: `Layer up for ${met.apparentTempC}°C wind chill`,
          subtitle: `${met.temperatureC}°C ambient · ${met.humidityPercent}% humidity`,
          detail: `High ${met.tempMaxC}°C / Low ${met.tempMinC}°C with ${met.windKmh} km/h ${met.windDir} winds. Dress in breathable windproof layers.`,
          actionTarget: 'details',
          actionLabel: 'View Weather Suite',
          aiPrompt: `How should I pace outdoor exercise in ${telemetry.name} at ${met.apparentTempC}°C feels-like and AQI ${aqi}?`,
        }
      : met.apparentTempC >= 30
        ? {
            id: 'thermal-comfort',
            iconKey: 'thermo',
            title: `Stay cool & hydrate (${met.apparentTempC}°C)`,
            subtitle: `Heat index ${met.apparentTempC}°C · Dew pt ${met.dewPointC}°C`,
            detail: `High thermal stress with VPD ${met.vapourPressureDeficitKpa} kPa. Shift heavy exertion to early morning or evening.`,
            actionTarget: 'details',
            actionLabel: 'View Weather Suite',
            aiPrompt: `Give hydration and heat-safety advice for ${telemetry.name} at ${met.apparentTempC}°C feels-like.`,
          }
        : {
            id: 'thermal-comfort',
            iconKey: 'thermo',
            title: `Mild ${met.temperatureC}°C (${met.weatherLabel})`,
            subtitle: `Feels ${met.apparentTempC}°C · H:${met.tempMaxC}° L:${met.tempMinC}°`,
            detail: `Dew point ${met.dewPointC}°C and ${met.humidityPercent}% RH provide comfortable outdoor thermal conditions in ${telemetry.name}.`,
            actionTarget: 'details',
            actionLabel: 'View Weather Suite',
            aiPrompt: `Suggest a low-emission daily routine for ${telemetry.name} in ${met.temperatureC}°C ${met.weatherLabel} weather.`,
          };

  const nearbyCyclone = telemetry.cyclones.find((c) => c.distanceKm <= 1000);
  const shieldCard: TodaySuggestion = nearbyCyclone
    ? {
        id: 'weather-shield',
        iconKey: 'shield',
        title: `Track ${nearbyCyclone.name} advisory`,
        subtitle: `${nearbyCyclone.distanceKm.toLocaleString()} km · ${nearbyCyclone.windKmh} km/h`,
        detail: `${nearbyCyclone.trackSummary}. ${nearbyCyclone.aqiImpact}`,
        actionTarget: 'details',
        actionLabel: 'View Cyclone Feed',
        aiPrompt: `Summarize how ${nearbyCyclone.name} (${nearbyCyclone.distanceKm} km away) affects weather and air quality in ${telemetry.name}.`,
      }
    : met.precipProbPercent >= 40 || met.precipitationMm > 0
      ? {
          id: 'weather-shield',
          iconKey: 'shield',
          title: 'Carry rain gear today',
          subtitle: `${met.precipProbPercent}% precip chance · ${met.precipitationMm} mm`,
          detail: `Expected precipitation helps wash out airborne PM10/dust particles, while ${met.windGustKmh} km/h gusts may briefly affect commutes.`,
          actionTarget: 'details',
          actionLabel: 'View Forecast',
          aiPrompt: `How will rain (${met.precipProbPercent}% chance) impact air quality and commuting in ${telemetry.name} today?`,
        }
      : met.uvIndex >= 6
        ? {
            id: 'weather-shield',
            iconKey: 'shield',
            title: `Use SPF & shade (UV ${met.uvIndex})`,
            subtitle: `Solar flux ${met.solarWm2} W/m² · Clear UV ${met.uvClearSky}`,
            detail: `High ultraviolet irradiance and solar energy can accelerate afternoon ground-level ozone (O₃) formation.`,
            actionTarget: 'details',
            actionLabel: 'View UV & Solar',
            aiPrompt: `Explain afternoon ozone and UV risks in ${telemetry.name} at UV ${met.uvIndex}.`,
          }
        : {
            id: 'weather-shield',
            iconKey: 'shield',
            title: `Calm skies · ${met.pressureTrend.toLowerCase()} pressure`,
            subtitle: `${met.pressureMslHpa} hPa · UV ${met.uvIndex} · ${met.precipProbPercent}% rain`,
            detail: `No active storm warnings near ${telemetry.name}; barometric pressure is ${met.pressureTrend.toLowerCase()} at ${met.pressureMslHpa} hPa.`,
            actionTarget: 'details',
            actionLabel: 'View Diagnostics',
            aiPrompt: `How does ${met.pressureMslHpa} hPa (${met.pressureTrend}) pressure influence smog dispersion in ${telemetry.name}?`,
          };

  const bestHourly =
    telemetry.hourlyForecast.length > 0
      ? [...telemetry.hourlyForecast].sort((a, b) => a.aqi - b.aqi)[0]
      : null;

  const windowCard: TodaySuggestion = bestHourly
    ? {
        id: 'best-window',
        iconKey: 'window',
        title: `Best outdoor window: ${bestHourly.hour}`,
        subtitle: `Forecast AQI ${bestHourly.aqi} · ${bestHourly.tempC}°C`,
        detail: `Lowest projected hourly particulate load in the next 24h for ${telemetry.name} (${bestHourly.windKmh} km/h wind, ${bestHourly.precipProb}% rain chance).`,
        actionTarget: 'details',
        actionLabel: 'View 24h Timeline',
        aiPrompt: `Help me schedule outdoor errands around ${bestHourly.hour} in ${telemetry.name} when forecast AQI drops to ${bestHourly.aqi}.`,
      }
    : {
        id: 'best-window',
        iconKey: 'window',
        title: `Sunlight window: ${met.sunriseTime} – ${met.sunsetTime}`,
        subtitle: `${met.daylightHours}h daylight · Dust ${met.dustUgM3} µg/m³`,
        detail: `Plan outdoor tasks while daytime thermal mixing elevates the planetary boundary layer (${met.boundaryLayerM} m).`,
        actionTarget: 'details',
        actionLabel: 'View Full Details',
        aiPrompt: `When is the best boundary-layer dispersion window in ${telemetry.name} today?`,
      };

  return [purifierCard, travelCard, thermoCard, shieldCard, windowCard];
}


import { haversineKm } from './airQuality.ts';
import type { TransitMode } from './airQuality.ts';
import type { JourneyExplanationPoint, RouteStepSegment } from '../types.ts';

export const SYNC_ROUTE_MAX_KM = 100;

export type GoogleTravelMode = 'DRIVE' | 'TRANSIT' | 'TWO_WHEELER' | 'BICYCLE' | 'WALK';

export interface LatLngPoint {
  lat: number;
  lon: number;
}

export interface RouteSampleTelemetry extends LatLngPoint {
  aqi: number;
  pm25: number;
  temperatureC: number;
  windKmh: number;
  windDirDeg: number;
  precipMm: number;
}

export interface RouteCandidateInput {
  id: string;
  label: string;
  isDefaultArterial?: boolean;
  isRoadSnapped?: boolean;
  distanceKm: number;
  durationMin: number;
  encodedPolyline?: string;
  path: LatLngPoint[];
  steps?: RouteStepSegment[];
  samples: RouteSampleTelemetry[];
}

export interface ScoredRouteCandidate extends RouteCandidateInput {
  avgAqi: number;
  peakAqi: number;
  avgPm25: number;
  inhaledUg: number;
  co2SavedGrams: number;
  compositeScore: number;
  isOptimal: boolean;
}

export interface RouteOptimizationSummary {
  optimalRoute: ScoredRouteCandidate;
  baselineRoute: ScoredRouteCandidate;
  candidates: ScoredRouteCandidate[];
  aqiReductionPercent: number;
  pm25ReductionPercent: number;
  exposureReductionPercent: number;
  timeDeltaMin: number;
  summaryText: string;
}

export function isBackgroundTaskRequired(distanceKm: number): boolean {
  return Number.isFinite(distanceKm) && distanceKm > SYNC_ROUTE_MAX_KM;
}

export function mapTransitModeToGoogleTravelMode(mode: TransitMode): GoogleTravelMode {
  switch (mode) {
    case 'walk':
      return 'WALK';
    case 'cycle':
      return 'BICYCLE';
    case 'two_wheeler':
      return 'TWO_WHEELER';
    case 'transit':
    case 'metro_hybrid':
      return 'TRANSIT';
    case 'drive':
    case 'ev_shuttle':
    default:
      return 'DRIVE';
  }
}

export function isBetaGoogleTravelMode(mode: TransitMode): boolean {
  const gm = mapTransitModeToGoogleTravelMode(mode);
  return gm === 'WALK' || gm === 'BICYCLE' || gm === 'TWO_WHEELER';
}

/** Standard Google Encoded Polyline Algorithm Decoder */
export function decodeEncodedPolyline(encoded: string): LatLngPoint[] {
  if (!encoded || typeof encoded !== 'string') return [];
  const points: LatLngPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < encoded.length);
    const dLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dLat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < encoded.length);
    const dLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dLng;

    points.push({
      lat: Number((lat / 1e5).toFixed(5)),
      lon: Number((lng / 1e5).toFixed(5)),
    });
  }

  return points;
}

export function samplePathCoordinates(path: LatLngPoint[], count = 7): LatLngPoint[] {
  if (path.length === 0) return [];
  if (path.length <= count) return path;

  const sampled: LatLngPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.min(path.length - 1, Math.round((i / (count - 1)) * (path.length - 1)));
    sampled.push(path[idx]);
  }
  return sampled;
}

/**
 * Computes an upwind intermediate waypoint for Google Routes API `via: true`
 * so alternate corridors stay snapped to real highways/arterials rather than straight lines.
 */
export function computeUpwindViaWaypoint(
  origin: LatLngPoint,
  destination: LatLngPoint,
  windDirDeg = 0,
  sideSign: 1 | -1 = 1
): LatLngPoint {
  const midLat = (origin.lat + destination.lat) / 2;
  const midLon = (origin.lon + destination.lon) / 2;
  const dLat = destination.lat - origin.lat;
  const dLon = destination.lon - origin.lon;
  const chordLen = Math.hypot(dLat, dLon) || 0.02;

  const perpLat = -dLon / chordLen;
  const perpLon = dLat / chordLen;
  const offsetMag = Math.min(0.28, Math.max(0.015, chordLen * 0.18));
  const windBias = Math.cos(((windDirDeg % 360) * Math.PI) / 180) >= 0 ? 1 : -1;
  const sign = windBias * sideSign;

  return {
    lat: Number((midLat + perpLat * offsetMag * sign).toFixed(5)),
    lon: Number((midLon + perpLon * offsetMag * sign).toFixed(5)),
  };
}

/**
 * Generates deterministic clean-corridor candidate polylines between origin and destination
 * (Direct, Upwind Arc, Downwind Buffer Arc) for fallback when no road/rail router is reachable.
 */
export function buildCorridorCandidatePaths(
  origin: LatLngPoint,
  destination: LatLngPoint,
  windDirDeg = 0
): Array<{ id: string; label: string; isDefaultArterial?: boolean; path: LatLngPoint[]; detourFactor: number }> {
  const midLat = (origin.lat + destination.lat) / 2;
  const midLon = (origin.lon + destination.lon) / 2;
  const dLat = destination.lat - origin.lat;
  const dLon = destination.lon - origin.lon;
  const chordLen = Math.hypot(dLat, dLon) || 0.02;

  const perpLat = -dLon / chordLen;
  const perpLon = dLat / chordLen;
  const offsetMag = Math.min(0.45, Math.max(0.012, chordLen * 0.22));
  const windBias = Math.cos(((windDirDeg % 360) * Math.PI) / 180) >= 0 ? 1 : -1;

  const buildArc = (sign: number): LatLngPoint[] => [
    origin,
    {
      lat: Number((origin.lat + dLat * 0.32 + perpLat * offsetMag * 0.8 * sign).toFixed(5)),
      lon: Number((origin.lon + dLon * 0.32 + perpLon * offsetMag * 0.8 * sign).toFixed(5)),
    },
    {
      lat: Number((midLat + perpLat * offsetMag * sign).toFixed(5)),
      lon: Number((midLon + perpLon * offsetMag * sign).toFixed(5)),
    },
    {
      lat: Number((origin.lat + dLat * 0.68 + perpLat * offsetMag * 0.8 * sign).toFixed(5)),
      lon: Number((origin.lon + dLon * 0.68 + perpLon * offsetMag * 0.8 * sign).toFixed(5)),
    },
    destination,
  ];

  return [
    {
      id: 'direct-arterial',
      label: 'Direct Arterial Corridor',
      isDefaultArterial: true,
      detourFactor: 1.08,
      path: [
        origin,
        { lat: Number((origin.lat + dLat * 0.33).toFixed(5)), lon: Number((origin.lon + dLon * 0.33).toFixed(5)) },
        { lat: Number((origin.lat + dLat * 0.66).toFixed(5)), lon: Number((origin.lon + dLon * 0.66).toFixed(5)) },
        destination,
      ],
    },
    {
      id: 'upwind-bypass',
      label: 'Upwind Clean-Air Bypass',
      detourFactor: 1.16,
      path: buildArc(windBias),
    },
    {
      id: 'canopy-corridor',
      label: 'Alternate Dispersion Corridor',
      detourFactor: 1.19,
      path: buildArc(-windBias),
    },
  ];
}

export function estimateTransitDurationMin(distanceKm: number, mode: TransitMode): number {
  const speedMap: Record<TransitMode, number> = {
    drive: 42,
    transit: 38,
    two_wheeler: 34,
    walk: 4.8,
    cycle: 16.5,
    ev_shuttle: 32,
    metro_hybrid: 36,
  };
  const speed = speedMap[mode] ?? 32;
  return Math.max(4, Math.round((distanceKm / speed) * 60));
}

export function scoreRouteCandidate(
  candidate: RouteCandidateInput,
  mode: TransitMode
): ScoredRouteCandidate {
  const modeProfile: Record<
    TransitMode,
    { ventilationLMin: number; filtrationFactor: number; co2SavedPerKm: number }
  > = {
    drive: { ventilationLMin: 9, filtrationFactor: 0.45, co2SavedPerKm: 28 },
    transit: { ventilationLMin: 11, filtrationFactor: 0.48, co2SavedPerKm: 146 },
    two_wheeler: { ventilationLMin: 15, filtrationFactor: 0.92, co2SavedPerKm: 92 },
    walk: { ventilationLMin: 18, filtrationFactor: 1.0, co2SavedPerKm: 168 },
    cycle: { ventilationLMin: 34, filtrationFactor: 0.95, co2SavedPerKm: 168 },
    ev_shuttle: { ventilationLMin: 9, filtrationFactor: 0.42, co2SavedPerKm: 118 },
    metro_hybrid: { ventilationLMin: 11, filtrationFactor: 0.5, co2SavedPerKm: 142 },
  };
  const prof = modeProfile[mode] ?? modeProfile.drive;

  const samples =
    candidate.samples.length > 0
      ? candidate.samples
      : [{ lat: 0, lon: 0, aqi: 35, pm25: 10, temperatureC: 20, windKmh: 10, windDirDeg: 0, precipMm: 0 }];

  const avgAqi = Math.round(samples.reduce((sum, s) => sum + s.aqi, 0) / samples.length);
  const peakAqi = Math.round(Math.max(...samples.map((s) => s.aqi)));
  const avgPm25 = Number((samples.reduce((sum, s) => sum + s.pm25, 0) / samples.length).toFixed(1));

  const inhaledUg = Number(
    (avgPm25 * (prof.ventilationLMin / 1000) * candidate.durationMin * prof.filtrationFactor).toFixed(1)
  );
  const co2SavedGrams = Math.round(candidate.distanceKm * prof.co2SavedPerKm);

  const compositeScore = Number(
    (avgAqi * 0.65 + peakAqi * 0.2 + candidate.durationMin * 0.65 + inhaledUg * 0.25).toFixed(2)
  );

  return {
    ...candidate,
    avgAqi,
    peakAqi,
    avgPm25,
    inhaledUg,
    co2SavedGrams,
    compositeScore,
    isOptimal: false,
  };
}

export function selectOptimalLowSmogRoute(
  candidates: RouteCandidateInput[],
  mode: TransitMode
): RouteOptimizationSummary {
  const scored = candidates.map((c) => scoreRouteCandidate(c, mode));
  const sortedByScore = [...scored].sort((a, b) => a.compositeScore - b.compositeScore);
  const winnerId = sortedByScore[0]?.id;

  const marked = scored.map((item) => ({
    ...item,
    isOptimal: item.id === winnerId,
  }));

  const optimalRoute = marked.find((c) => c.isOptimal) ?? marked[0];
  const baselineRoute =
    marked.find((c) => c.isDefaultArterial && c.id !== optimalRoute.id) ??
    [...marked].sort((a, b) => a.durationMin - b.durationMin)[0] ??
    optimalRoute;

  const aqiReductionPercent =
    baselineRoute.avgAqi > 0
      ? Math.max(0, Math.round(((baselineRoute.avgAqi - optimalRoute.avgAqi) / baselineRoute.avgAqi) * 100))
      : 0;
  const pm25ReductionPercent =
    baselineRoute.avgPm25 > 0
      ? Math.max(0, Math.round(((baselineRoute.avgPm25 - optimalRoute.avgPm25) / baselineRoute.avgPm25) * 100))
      : 0;
  const exposureReductionPercent =
    baselineRoute.inhaledUg > 0
      ? Math.max(0, Math.round(((baselineRoute.inhaledUg - optimalRoute.inhaledUg) / baselineRoute.inhaledUg) * 100))
      : 0;
  const timeDeltaMin = optimalRoute.durationMin - baselineRoute.durationMin;

  const summaryText =
    optimalRoute.id === baselineRoute.id
      ? `${optimalRoute.label} is both the fastest (${optimalRoute.durationMin}m) and lowest-exposure corridor (${optimalRoute.avgAqi} avg AQI).`
      : `${optimalRoute.label} trims average AQI by ${aqiReductionPercent}% (${optimalRoute.avgAqi} vs ${baselineRoute.avgAqi}) with only ${timeDeltaMin >= 0 ? `+${timeDeltaMin}` : timeDeltaMin} min travel delta.`;

  return {
    optimalRoute,
    baselineRoute,
    candidates: marked,
    aqiReductionPercent,
    pm25ReductionPercent,
    exposureReductionPercent,
    timeDeltaMin,
    summaryText,
  };
}

export function measurePathDistanceKm(path: LatLngPoint[]): number {
  if (path.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += haversineKm(path[i - 1].lat, path[i - 1].lon, path[i].lat, path[i].lon);
  }
  return Number(total.toFixed(1));
}

function findNearestSample(pt: LatLngPoint, samples: RouteSampleTelemetry[]): RouteSampleTelemetry {
  if (samples.length === 0) {
    return {
      lat: pt.lat,
      lon: pt.lon,
      aqi: 45,
      pm25: 12,
      temperatureC: 24,
      windKmh: 8,
      windDirDeg: 0,
      precipMm: 0,
    };
  }
  let best = samples[0];
  let bestDist = Infinity;
  for (const s of samples) {
    const d = haversineKm(pt.lat, pt.lon, s.lat, s.lon);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

function minDistanceToPathKm(pt: LatLngPoint, path: LatLngPoint[]): number {
  if (path.length === 0) return 0;
  let best = Infinity;
  const stride = Math.max(1, Math.floor(path.length / 60));
  for (let i = 0; i < path.length; i += stride) {
    const d = haversineKm(pt.lat, pt.lon, path[i].lat, path[i].lon);
    if (d < best) best = d;
  }
  const last = path[path.length - 1];
  const dLast = haversineKm(pt.lat, pt.lon, last.lat, last.lon);
  return Math.min(best, dLast);
}

/**
 * Generates chronological Journey Points along the optimal route and detects
 * exact points where the path was modified/diverted away from the baseline arterial
 * or shifted onto cleaner transit / upwind highways.
 */
export function buildJourneyPointsFromRoute(
  optimal: ScoredRouteCandidate,
  baseline: ScoredRouteCandidate,
  originLabel: string,
  destinationLabel: string
): JourneyExplanationPoint[] {
  const isDifferentRoute = optimal.id !== baseline.id;
  const steps = Array.isArray(optimal.steps) ? optimal.steps : [];
  const totalKm = Math.max(0.5, optimal.distanceKm);
  const points: JourneyExplanationPoint[] = [];

  if (steps.length >= 2) {
    // Pick up to 6 representative steps including departure, key turns/transit legs, and arrival
    const chosenIndices = new Set<number>([0, steps.length - 1]);
    // Prioritize transit legs first
    steps.forEach((st, idx) => {
      if (st.transitInfo && chosenIndices.size < 6) {
        chosenIndices.add(idx);
      }
    });
    // Fill remaining slots evenly by cumulative distance
    const targetCount = Math.min(6, steps.length);
    for (let k = 1; k < targetCount - 1; k += 1) {
      const idx = Math.round((k / (targetCount - 1)) * (steps.length - 1));
      chosenIndices.add(idx);
    }

    const sortedIdx = Array.from(chosenIndices).sort((a, b) => a - b);
    let cumulativeMeters = 0;
    const stepStartKm: number[] = steps.map((st) => {
      const km = Number((cumulativeMeters / 1000).toFixed(1));
      cumulativeMeters += st.distanceMeters || 0;
      return km;
    });

    sortedIdx.forEach((stepIdx, outIdx) => {
      const st = steps[stepIdx];
      const pt = outIdx === sortedIdx.length - 1 ? st.endLocation : st.startLocation;
      const optSample = findNearestSample(pt, optimal.samples);
      const baseSample = findNearestSample(pt, baseline.samples);
      const distFromBaselineKm = isDifferentRoute ? minDistanceToPathKm(pt, baseline.path) : 0;
      const aqiDelta = baseSample.aqi - optSample.aqi;

      const isDeparture = outIdx === 0;
      const isArrival = outIdx === sortedIdx.length - 1;
      const isTransitLeg = Boolean(st.transitInfo);
      const isModified =
        !isDeparture &&
        !isArrival &&
        ((isDifferentRoute && distFromBaselineKm >= 0.35) || aqiDelta >= 10 || isTransitLeg);

      const kmFromStart = isArrival
        ? Number(totalKm.toFixed(1))
        : Math.min(totalKm, stepStartKm[stepIdx] ?? Number(((outIdx / Math.max(1, sortedIdx.length - 1)) * totalKm).toFixed(1)));

      const title = isDeparture
        ? `Departure: ${originLabel}`
        : isArrival
          ? `Arrival: ${destinationLabel}`
          : st.transitInfo
            ? `${st.transitInfo.vehicleType}: ${st.transitInfo.shortName || st.transitInfo.lineName} (${st.transitInfo.departureStop} → ${st.transitInfo.arrivalStop})`
            : st.instruction || `Corridor Checkpoint ${outIdx + 1}`;

      const segmentType = st.transitInfo
        ? st.transitInfo.vehicleType
        : st.travelMode || 'ROAD';

      const modificationBadge = isTransitLeg
        ? 'Rail / Transit Corridor'
        : isModified
          ? distFromBaselineKm >= 0.35
            ? `Diverted ${distFromBaselineKm.toFixed(1)} km`
            : `-${aqiDelta} AQI Pocket`
          : undefined;

      const explanation = isDeparture
        ? `Starts at ${originLabel} (US AQI ${optSample.aqi}, PM2.5 ${optSample.pm25} µg/m³, wind ${optSample.windKmh} km/h).`
        : isArrival
          ? `Completes ${optimal.label} at ${destinationLabel} with ${optimal.avgAqi} avg AQI (${optimal.durationMin} min total).`
          : isTransitLeg && st.transitInfo
            ? `Uses ${st.transitInfo.lineName} across ${st.transitInfo.stopCount ?? 'multiple'} stops to bypass surface exhaust corridors (AQI ${optSample.aqi}).`
            : isModified
              ? `Path modified ${distFromBaselineKm >= 0.35 ? `${distFromBaselineKm.toFixed(1)} km away from the congested arterial` : 'into a cleaner dispersion pocket'} — AQI ${optSample.aqi} vs ${baseSample.aqi} baseline (${st.instruction || 'upwind highway segment'}).`
              : `Follows ${st.instruction || 'verified highway alignment'} where air dispersion holds steady at US AQI ${optSample.aqi} (PM2.5 ${optSample.pm25} µg/m³).`;

      points.push({
        pointIndex: outIdx + 1,
        title: title.slice(0, 88),
        kmFromStart,
        lat: pt.lat,
        lon: pt.lon,
        segmentType,
        aqi: optSample.aqi,
        pm25: optSample.pm25,
        baselineAqi: baseSample.aqi,
        isModified,
        modificationBadge,
        explanation,
      });
    });

    return points;
  }

  // Fallback when route steps aren't populated: sample 5 points along road polyline
  const sampledPts = samplePathCoordinates(optimal.path, Math.min(5, Math.max(2, optimal.path.length)));
  sampledPts.forEach((pt, idx) => {
    const isDeparture = idx === 0;
    const isArrival = idx === sampledPts.length - 1;
    const frac = sampledPts.length > 1 ? idx / (sampledPts.length - 1) : 0;
    const kmFromStart = Number((totalKm * frac).toFixed(1));
    const optSample = findNearestSample(pt, optimal.samples);
    const baseSample = findNearestSample(pt, baseline.samples);
    const distFromBaselineKm = isDifferentRoute ? minDistanceToPathKm(pt, baseline.path) : 0;
    const aqiDelta = baseSample.aqi - optSample.aqi;
    const isModified =
      !isDeparture && !isArrival && ((isDifferentRoute && distFromBaselineKm >= 0.35) || aqiDelta >= 10);

    points.push({
      pointIndex: idx + 1,
      title: isDeparture
        ? `Departure: ${originLabel}`
        : isArrival
          ? `Arrival: ${destinationLabel}`
          : `Journey Point ${idx + 1} (${kmFromStart} km)`,
      kmFromStart,
      lat: pt.lat,
      lon: pt.lon,
      segmentType: 'HIGHWAY',
      aqi: optSample.aqi,
      pm25: optSample.pm25,
      baselineAqi: baseSample.aqi,
      isModified,
      modificationBadge: isModified
        ? distFromBaselineKm >= 0.35
          ? `Diverted ${distFromBaselineKm.toFixed(1)} km`
          : `-${aqiDelta} AQI Shift`
        : undefined,
      explanation: isDeparture
        ? `Origin departure from ${originLabel} at US AQI ${optSample.aqi} and PM2.5 ${optSample.pm25} µg/m³.`
        : isArrival
          ? `Destination arrival at ${destinationLabel} along ${optimal.label}.`
          : isModified
            ? `Modified ${distFromBaselineKm.toFixed(1)} km off the default arterial to cut exposure (AQI ${optSample.aqi} vs ${baseSample.aqi} baseline).`
            : `Maintains time-efficient corridor alignment with US AQI ${optSample.aqi} and ${optSample.windKmh} km/h crosswind dispersion.`,
    });
  });

  return points;
}

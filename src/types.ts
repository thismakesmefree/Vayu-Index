import { TransitMode } from './utils/airQuality';

export type AppRoute = 'landing' | 'dashboard' | 'ai' | 'map' | 'stats' | 'settings';

export type ThemeMode = 'light' | 'dark' | 'oled' | 'auto';
export type DefaultDarkVariant = 'dark' | 'oled';
export type ResolvedTheme = 'light' | 'dark' | 'oled';

export type DockOrientation = 'vertical' | 'horizontal';

export type LocationPermissionStatus = 'pending' | 'granted' | 'denied' | 'manual';

export interface UserLocationState {
  status: LocationPermissionStatus;
  label: string;
  region: string;
  country?: string;
  timezone?: string;
  coords?: { lat: number; lon: number };
  source?: 'gps' | 'search' | 'coords';
}

export interface LocationSearchResult {
  id: string;
  name: string;
  admin1?: string;
  country?: string;
  countryCode?: string;
  lat: number;
  lon: number;
  timezone?: string;
  elevation?: number;
  displayLabel: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  isError?: boolean;
}

export interface MapLayerNode {
  id: string;
  name?: string;
  state?: string;
  region?: string;
  isIndiaWide?: boolean;
  lat: number;
  lon: number;
  aqi: number;
  pm25: number;
  no2: number;
  o3: number;
  temperatureC: number;
  windKmh: number;
  windDirDeg: number;
  windDir: string;
  precipMm: number;
  cloudCoverPercent: number;
  weatherLabel: string;
}

export interface RouteStepSegment {
  stepIndex: number;
  instruction: string;
  maneuver?: string;
  travelMode: string;
  distanceMeters: number;
  durationSec: number;
  startLocation: { lat: number; lon: number };
  endLocation: { lat: number; lon: number };
  path: Array<{ lat: number; lon: number }>;
  transitInfo?: {
    lineName: string;
    shortName?: string;
    vehicleType: string;
    color?: string;
    departureStop: string;
    arrivalStop: string;
    stopCount?: number;
    headsign?: string;
  };
}

export interface JourneyExplanationPoint {
  pointIndex: number;
  title: string;
  kmFromStart: number;
  lat: number;
  lon: number;
  segmentType: string;
  aqi: number;
  pm25: number;
  baselineAqi?: number;
  isModified: boolean;
  modificationBadge?: string;
  explanation: string;
}

export interface JourneyExplanationPayload {
  overallRationale: string;
  modificationSummary: string;
  points: JourneyExplanationPoint[];
  modelUsed?: string;
}

export interface GeminiOptimizedRoutePayload {
  distanceKm: number;
  transitMode: TransitMode;
  routingProfile?: 'driving' | 'bike' | 'foot';
  routingSource?: 'osrm';
  optimalRouteId: string;
  baselineRouteId: string;
  aqiReductionPercent: number;
  pm25ReductionPercent: number;
  exposureReductionPercent: number;
  timeDeltaMin: number;
  summaryText: string;
  geminiAdvisory: string;
  recommendedWaypoints: string[];
  journeyPoints?: JourneyExplanationPoint[];
  candidates: Array<{
    id: string;
    label: string;
    isDefaultArterial?: boolean;
    isRoadSnapped?: boolean;
    distanceKm: number;
    durationMin: number;
    avgAqi: number;
    peakAqi: number;
    avgPm25: number;
    inhaledUg: number;
    co2SavedGrams: number;
    compositeScore: number;
    isOptimal: boolean;
    path: Array<{ lat: number; lon: number }>;
    steps?: RouteStepSegment[];
    samples: Array<{
      lat: number;
      lon: number;
      aqi: number;
      pm25: number;
      temperatureC: number;
      windKmh: number;
      windDirDeg: number;
      precipMm: number;
    }>;
  }>;
  computedAt: string;
}

export interface BackgroundRouteTask {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  stage: string;
  originLabel: string;
  destinationLabel: string;
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  distanceKm: number;
  transitMode: TransitMode;
  createdAt: string;
  completedAt?: string;
  error?: string;
  result?: GeminiOptimizedRoutePayload;
}

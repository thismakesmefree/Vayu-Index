import type { RouteStepSegment } from '../types';
import type { TransitMode } from './airQuality';
import { decodeEncodedPolyline, measurePathDistanceKm } from './routeOptimizer';
import type { LatLngPoint } from './routeOptimizer';

export type OsrmProfile = 'driving' | 'bike' | 'foot';

export interface OpenRouteCandidate {
  id: string;
  label: string;
  isDefaultArterial: boolean;
  isRoadSnapped: true;
  distanceKm: number;
  durationMin: number;
  encodedPolyline: string;
  path: LatLngPoint[];
  steps: RouteStepSegment[];
}

export function getOsrmProfile(mode: TransitMode): OsrmProfile | null {
  switch (mode) {
    case 'drive':
    case 'two_wheeler':
    case 'ev_shuttle':
      return 'driving';
    case 'cycle':
      return 'bike';
    case 'walk':
      return 'foot';
    case 'transit':
    case 'metro_hybrid':
      return null;
  }
}

export function buildOsrmRouteUrl(
  baseUrl: string,
  profile: OsrmProfile,
  origin: LatLngPoint,
  destination: LatLngPoint
): string {
  const provider = new URL(baseUrl);
  if (provider.protocol !== 'https:' && provider.protocol !== 'http:') {
    throw new Error('The routing provider URL must use HTTP or HTTPS.');
  }
  if (provider.search || provider.hash) {
    throw new Error('The routing provider URL cannot include a query or fragment.');
  }
  const root = provider.href.replace(/\/+$/, '');
  const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  return `${root}/route/v1/${profile}/${coordinates}?overview=full&geometries=polyline&alternatives=true&steps=true`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSteps(value: unknown): RouteStepSegment[] {
  if (!Array.isArray(value)) return [];
  const steps: RouteStepSegment[] = [];

  for (const leg of value) {
    if (!isRecord(leg) || !Array.isArray(leg.steps)) continue;
    for (const rawStep of leg.steps) {
      if (!isRecord(rawStep)) continue;
      const stepPath =
        typeof rawStep.geometry === 'string' ? decodeEncodedPolyline(rawStep.geometry) : [];
      if (stepPath.length < 2) continue;

      const distanceMeters = asFiniteNumber(rawStep.distance);
      const durationSec = asFiniteNumber(rawStep.duration);
      const name = typeof rawStep.name === 'string' && rawStep.name.trim() ? rawStep.name.trim() : 'road';
      const maneuver = isRecord(rawStep.maneuver) ? rawStep.maneuver : {};
      const action = typeof maneuver.type === 'string' ? maneuver.type : 'Continue';
      const modifier = typeof maneuver.modifier === 'string' ? ` ${maneuver.modifier}` : '';
      steps.push({
        stepIndex: steps.length,
        instruction: `${action}${modifier} onto ${name}`,
        maneuver: typeof maneuver.type === 'string' ? maneuver.type : undefined,
        travelMode: 'OSRM',
        distanceMeters: distanceMeters ?? 0,
        durationSec: durationSec ?? 0,
        startLocation: stepPath[0],
        endLocation: stepPath[stepPath.length - 1],
        path: stepPath,
      });
    }
  }

  return steps;
}

export function parseOsrmRouteCandidates(
  response: unknown
): OpenRouteCandidate[] {
  if (!isRecord(response) || response.code !== 'Ok' || !Array.isArray(response.routes)) return [];

  const candidates: OpenRouteCandidate[] = [];
  for (const [index, rawRoute] of response.routes.entries()) {
    if (!isRecord(rawRoute) || typeof rawRoute.geometry !== 'string') continue;
    const path = decodeEncodedPolyline(rawRoute.geometry);
    const distanceMeters = asFiniteNumber(rawRoute.distance);
    const durationSeconds = asFiniteNumber(rawRoute.duration);
    if (path.length < 2 || !distanceMeters || distanceMeters <= 0 || !durationSeconds || durationSeconds <= 0) {
      continue;
    }

    const firstLeg = Array.isArray(rawRoute.legs) ? rawRoute.legs[0] : null;
    const summary =
      isRecord(firstLeg) && typeof firstLeg.summary === 'string' ? firstLeg.summary.trim() : '';
    const defaultRoute = index === 0;
    candidates.push({
      id: `osrm-${index + 1}`,
      label: summary
        ? `${defaultRoute ? 'Primary' : 'Alternate'} via ${summary}`
        : defaultRoute
          ? 'Primary OpenStreetMap route'
          : `Alternate OpenStreetMap route ${index}`,
      isDefaultArterial: defaultRoute,
      isRoadSnapped: true,
      distanceKm: Number((distanceMeters / 1000).toFixed(1)) || measurePathDistanceKm(path),
      durationMin: Math.max(1, Math.round(durationSeconds / 60)),
      encodedPolyline: rawRoute.geometry,
      path,
      steps: parseSteps(rawRoute.legs),
    });
  }

  return candidates;
}

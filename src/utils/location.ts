import { LocationSearchResult, UserLocationState } from '../types';
import { LocationTelemetry } from './airQuality';

export const LOCATION_STORAGE_KEY = 'vayu_user_location_v2';

export function parseCoordinateInput(raw: string): { lat: number; lon: number } | null {
  const match = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export async function searchGlobalLocations(query: string): Promise<LocationSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(`/api/location/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) {
    throw new Error('Unable to search global locations right now.');
  }
  const data = (await res.json()) as { results?: LocationSearchResult[] };
  return Array.isArray(data.results) ? data.results : [];
}

export async function reverseGeocodeCoords(
  lat: number,
  lon: number
): Promise<{ label: string; region: string; country?: string }> {
  try {
    const res = await fetch(`/api/location/reverse?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error('Reverse geocoding failed');
    const data = (await res.json()) as { label?: string; region?: string; country?: string };
    return {
      label: data.label || `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
      region: data.region || 'Calibrated Coordinates',
      country: data.country,
    };
  } catch {
    return {
      label: `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
      region: 'GPS Coordinates',
    };
  }
}

export async function fetchLocationTelemetry(
  location: UserLocationState
): Promise<LocationTelemetry> {
  if (!location.coords) {
    throw new Error('Coordinates are required to load live telemetry.');
  }
  const params = new URLSearchParams({
    lat: String(location.coords.lat),
    lon: String(location.coords.lon),
    label: location.label,
    region: location.region || '',
    country: location.country || '',
  });
  const res = await fetch(`/api/telemetry?${params.toString()}`);
  const data = (await res.json()) as LocationTelemetry & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Failed to fetch live meteorological and AQI telemetry.');
  }
  return data;
}

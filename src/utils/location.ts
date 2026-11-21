import { LocationSearchResult, UserLocationState } from '../types';
import { LocationTelemetry } from './airQuality';

export const LOCATION_STORAGE_KEY = 'vayu_user_location_v2';

export interface GeocodingLocationResult {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  elevation?: number;
}

export function normalizeLocationSearchResults(
  items: GeocodingLocationResult[],
  requiredCountryCode?: string
): LocationSearchResult[] {
  const countryCode = requiredCountryCode?.toUpperCase();
  return items
    .filter(
      (item) =>
        Boolean(item.name?.trim()) &&
        Number.isFinite(item.latitude) &&
        Number.isFinite(item.longitude) &&
        (!countryCode || item.country_code?.toUpperCase() === countryCode)
    )
    .map((item) => ({
      id: String(item.id),
      name: item.name,
      admin1: item.admin1,
      country: item.country || (item.country_code?.toUpperCase() === 'IN' ? 'India' : undefined),
      countryCode: item.country_code,
      lat: item.latitude,
      lon: item.longitude,
      timezone: item.timezone,
      elevation: item.elevation,
      displayLabel: [
        item.name,
        item.admin1,
        item.country || (item.country_code?.toUpperCase() === 'IN' ? 'India' : undefined),
      ]
        .filter(Boolean)
        .join(', '),
    }));
}

async function searchLocations(
  query: string,
  countryCode?: string
): Promise<LocationSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q });
  if (countryCode) params.set('countryCode', countryCode);
  const res = await fetch(`/api/location/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Unable to search locations right now.');
  }
  const data = (await res.json()) as { results?: LocationSearchResult[] };
  if (!Array.isArray(data.results)) return [];
  return countryCode
    ? data.results.filter((item) => item.countryCode?.toUpperCase() === countryCode.toUpperCase())
    : data.results;
}

export function searchGlobalLocations(query: string): Promise<LocationSearchResult[]> {
  return searchLocations(query);
}

export function searchIndianLocations(query: string): Promise<LocationSearchResult[]> {
  return searchLocations(query, 'IN');
}

export function isCoordinateLocationLabel(label: string): boolean {
  return /^-?\d+(?:\.\d+)?°?,\s*-?\d+(?:\.\d+)?°?$/.test(label.trim());
}

export function getReadableLocationLabel(label: string): string {
  return isCoordinateLocationLabel(label) ? 'Resolving location name...' : label;
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
      label: data.label || 'Nearby location',
      region: data.region || 'Location name unavailable',
      country: data.country,
    };
  } catch {
    return {
      label: 'Nearby location',
      region: 'Location name unavailable',
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

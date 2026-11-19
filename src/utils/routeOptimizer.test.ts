import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCorridorCandidatePaths,
  buildJourneyPointsFromRoute,
  computeUpwindViaWaypoint,
  decodeEncodedPolyline,
  isBackgroundTaskRequired,
  isBetaGoogleTravelMode,
  mapTransitModeToGoogleTravelMode,
  samplePathCoordinates,
  selectOptimalLowSmogRoute,
  SYNC_ROUTE_MAX_KM,
} from './routeOptimizer';
import { PAN_INDIA_AQI_STATIONS } from './indiaGrid';

test('isBackgroundTaskRequired triggers strictly above 100 km', () => {
  assert.equal(SYNC_ROUTE_MAX_KM, 100);
  assert.equal(isBackgroundTaskRequired(45.2), false);
  assert.equal(isBackgroundTaskRequired(100), false);
  assert.equal(isBackgroundTaskRequired(100.1), true);
  assert.equal(isBackgroundTaskRequired(350), true);
});

test('mapTransitModeToGoogleTravelMode & isBetaGoogleTravelMode cover all 5 Google travel modes', () => {
  assert.equal(mapTransitModeToGoogleTravelMode('drive'), 'DRIVE');
  assert.equal(mapTransitModeToGoogleTravelMode('transit'), 'TRANSIT');
  assert.equal(mapTransitModeToGoogleTravelMode('two_wheeler'), 'TWO_WHEELER');
  assert.equal(mapTransitModeToGoogleTravelMode('cycle'), 'BICYCLE');
  assert.equal(mapTransitModeToGoogleTravelMode('walk'), 'WALK');

  assert.equal(isBetaGoogleTravelMode('drive'), false);
  assert.equal(isBetaGoogleTravelMode('transit'), false);
  assert.equal(isBetaGoogleTravelMode('two_wheeler'), true);
  assert.equal(isBetaGoogleTravelMode('cycle'), true);
  assert.equal(isBetaGoogleTravelMode('walk'), true);
});

test('decodeEncodedPolyline decodes Google Routes encoded polyline strings accurately', () => {
  const decoded = decodeEncodedPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.equal(decoded.length, 3);
  assert.ok(Math.abs(decoded[0].lat - 38.5) < 0.001);
  assert.ok(Math.abs(decoded[0].lon - -120.2) < 0.001);
  assert.ok(Math.abs(decoded[2].lat - 43.252) < 0.001);
});

test('selectOptimalLowSmogRoute & buildJourneyPointsFromRoute flag diverted/modified checkpoints', () => {
  const summary = selectOptimalLowSmogRoute(
    [
      {
        id: 'fast-smoggy',
        label: 'Highway Arterial',
        isDefaultArterial: true,
        distanceKm: 18,
        durationMin: 24,
        path: [
          { lat: 28.6, lon: 77.2 },
          { lat: 28.65, lon: 77.25 },
          { lat: 28.7, lon: 77.3 },
        ],
        samples: [
          { lat: 28.6, lon: 77.2, aqi: 210, pm25: 95, temperatureC: 22, windKmh: 6, windDirDeg: 90, precipMm: 0 },
          { lat: 28.65, lon: 77.25, aqi: 225, pm25: 108, temperatureC: 22, windKmh: 6, windDirDeg: 90, precipMm: 0 },
          { lat: 28.7, lon: 77.3, aqi: 220, pm25: 102, temperatureC: 22, windKmh: 6, windDirDeg: 90, precipMm: 0 },
        ],
      },
      {
        id: 'clean-fast',
        label: 'Parkway Green Corridor',
        distanceKm: 19.5,
        durationMin: 27,
        path: [
          { lat: 28.6, lon: 77.2 },
          { lat: 28.67, lon: 77.21 },
          { lat: 28.7, lon: 77.3 },
        ],
        samples: [
          { lat: 28.6, lon: 77.2, aqi: 68, pm25: 20, temperatureC: 21, windKmh: 14, windDirDeg: 45, precipMm: 0 },
          { lat: 28.67, lon: 77.21, aqi: 62, pm25: 18, temperatureC: 21, windKmh: 14, windDirDeg: 45, precipMm: 0 },
          { lat: 28.7, lon: 77.3, aqi: 72, pm25: 22, temperatureC: 21, windKmh: 14, windDirDeg: 45, precipMm: 0 },
        ],
      },
      {
        id: 'clean-too-slow',
        label: 'Ultra Long Detour',
        distanceKm: 95,
        durationMin: 240,
        path: [
          { lat: 28.6, lon: 77.2 },
          { lat: 28.7, lon: 77.3 },
        ],
        samples: [
          { lat: 28.6, lon: 77.2, aqi: 55, pm25: 15, temperatureC: 20, windKmh: 16, windDirDeg: 45, precipMm: 0 },
        ],
      },
    ],
    'drive'
  );

  assert.equal(summary.optimalRoute.id, 'clean-fast');
  assert.ok(summary.aqiReductionPercent >= 60);
  assert.equal(summary.timeDeltaMin, 3);

  const journeyPoints = buildJourneyPointsFromRoute(
    summary.optimalRoute,
    summary.baselineRoute,
    'Connaught Place',
    'Rohini'
  );
  assert.ok(journeyPoints.length >= 3);
  assert.equal(journeyPoints[0].isModified, false);
  assert.equal(journeyPoints[journeyPoints.length - 1].isModified, false);
  assert.ok(journeyPoints.some((pt) => pt.isModified), 'Expected midpoint diversion to be marked modified');
});

test('computeUpwindViaWaypoint & buildCorridorCandidatePaths produce valid bounded waypoints', () => {
  const via = computeUpwindViaWaypoint({ lat: 28.61, lon: 77.21 }, { lat: 28.46, lon: 77.03 }, 120);
  assert.ok(Number.isFinite(via.lat) && Number.isFinite(via.lon));
  const candidates = buildCorridorCandidatePaths({ lat: 37.77, lon: -122.41 }, { lat: 37.87, lon: -122.27 }, 180);
  assert.equal(candidates.length, 3);
  const sampled = samplePathCoordinates(candidates[1].path, 4);
  assert.equal(sampled.length, 4);
});

test('PAN_INDIA_AQI_STATIONS covers all macro-regions across whole India', () => {
  assert.ok(PAN_INDIA_AQI_STATIONS.length >= 50, `Expected >=50 stations, got ${PAN_INDIA_AQI_STATIONS.length}`);
  const regions = new Set(PAN_INDIA_AQI_STATIONS.map((s) => s.region));
  for (const required of ['North', 'West', 'Central', 'East', 'Northeast', 'South', 'Islands']) {
    assert.ok(regions.has(required as any), `Missing India region: ${required}`);
  }
  const lats = PAN_INDIA_AQI_STATIONS.map((s) => s.lat);
  const lons = PAN_INDIA_AQI_STATIONS.map((s) => s.lon);
  assert.ok(Math.max(...lats) > 33, 'Should reach Ladakh/J&K in the North');
  assert.ok(Math.min(...lats) < 10, 'Should reach Kerala/Tamil Nadu in the South');
  assert.ok(Math.min(...lons) < 71, 'Should reach Gujarat/Rajasthan in the West');
  assert.ok(Math.max(...lons) > 93, 'Should reach Assam/Arunachal/Nagaland in the Northeast');
});

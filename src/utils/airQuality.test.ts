import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTodaySuggestions,
  calculateCigaretteEquivalence,
  calculateRouteExposure,
  calculateVentilationIndex,
  degreesToCardinal,
  getAqiBand,
  getPollutantBand,
  getWmoWeatherLabel,
  haversineKm,
  LocationTelemetry,
} from './airQuality';

function buildSampleTelemetry(): LocationTelemetry {
  return {
    id: 'test-loc',
    name: 'Test Sector',
    region: 'Test Region',
    country: 'Test Country',
    coords: { lat: 37.7749, lon: -122.4194 },
    timezone: 'America/Los_Angeles',
    elevationM: 16,
    compositeAqi: 84,
    europeanAqi: 46,
    dominantPollutant: 'PM2.5',
    temperatureC: 14,
    humidityPercent: 68,
    windKmh: 16,
    windDir: 'WNW',
    inversionCeilingM: 480,
    updatedAtLabel: 'Just now',
    pollutants: [
      { id: 'pm25', name: 'PM2.5', value: 28, unit: 'µg/m³', safeLimit: 15, deltaPercent: -4, sparkline: [32, 30, 29, 28] },
      { id: 'pm10', name: 'PM10', value: 44, unit: 'µg/m³', safeLimit: 45, deltaPercent: -2, sparkline: [48, 46, 45, 44] },
      { id: 'no2', name: 'NO₂', value: 22, unit: 'µg/m³', safeLimit: 25, deltaPercent: 1, sparkline: [20, 21, 22, 22] },
      { id: 'o3', name: 'O₃', value: 58, unit: 'µg/m³', safeLimit: 100, deltaPercent: 2, sparkline: [54, 56, 57, 58] },
      { id: 'so2', name: 'SO₂', value: 6, unit: 'µg/m³', safeLimit: 40, deltaPercent: 0, sparkline: [6, 6, 6, 6] },
      { id: 'co', name: 'CO', value: 0.4, unit: 'mg/m³', safeLimit: 4, deltaPercent: -1, sparkline: [0.5, 0.4, 0.4, 0.4] },
    ],
    extendedPollutants: [
      { code: 'PM2.5', name: 'Fine Particulate Matter', current: 28, mean24h: 30, peak24h: 36, whoLimit: 15, unit: 'µg/m³', delta6h: -4 },
      { code: 'PM10', name: 'Coarse Particulate Matter', current: 44, mean24h: 46, peak24h: 55, whoLimit: 45, unit: 'µg/m³', delta6h: -2 },
      { code: 'NO₂', name: 'Nitrogen Dioxide', current: 22, mean24h: 21, peak24h: 29, whoLimit: 25, unit: 'µg/m³', delta6h: 1 },
      { code: 'SO₂', name: 'Sulfur Dioxide', current: 6, mean24h: 6, peak24h: 9, whoLimit: 40, unit: 'µg/m³', delta6h: 0 },
      { code: 'CO', name: 'Carbon Monoxide', current: 0.4, mean24h: 0.4, peak24h: 0.6, whoLimit: 4, unit: 'mg/m³', delta6h: -1 },
      { code: 'O₃', name: 'Ground-Level Ozone', current: 58, mean24h: 55, peak24h: 70, whoLimit: 100, unit: 'µg/m³', delta6h: 2 },
      { code: 'DUST', name: 'Mineral Dust Aerosol', current: 8, mean24h: 9, peak24h: 14, whoLimit: 50, unit: 'µg/m³', delta6h: -1 },
      { code: 'AOD', name: 'Aerosol Optical Depth (×100)', current: 16, mean24h: 17, peak24h: 22, whoLimit: 25, unit: 'idx', delta6h: -2 },
    ],
    meteorology: {
      temperatureC: 14,
      apparentTempC: 12.5,
      tempMaxC: 17,
      tempMinC: 9,
      dewPointC: 8.2,
      humidityPercent: 68,
      vapourPressureDeficitKpa: 0.51,
      windKmh: 16,
      windGustKmh: 28,
      windDirDeg: 292,
      windDir: 'WNW',
      pressureMslHpa: 1014.2,
      surfacePressureHpa: 1012.1,
      pressureTrend: 'Steady',
      precipitationMm: 0,
      rainMm: 0,
      snowfallCm: 0,
      precipProbPercent: 10,
      cloudCoverPercent: 25,
      cloudLowPercent: 15,
      cloudMidPercent: 10,
      cloudHighPercent: 5,
      visibilityKm: 16.0,
      uvIndex: 3.2,
      uvClearSky: 4.1,
      solarWm2: 410,
      directRadiationWm2: 295,
      diffuseRadiationWm2: 115,
      boundaryLayerM: 480,
      ventilationCoeffM2s: 2133,
      soilTempC: 12.4,
      soilMoistureM3: 0.24,
      aerosolOpticalDepth: 0.16,
      dustUgM3: 8,
      ammoniaUgM3: null,
      sunriseTime: '06:54',
      sunsetTime: '17:02',
      daylightHours: 10.1,
      weatherCode: 2,
      weatherLabel: 'Partly Cloudy',
      isDay: true,
    },
    cyclones: [],
    newsFeed: [],
    hourlyForecast: [],
    dailyForecast: [],
    weeklyHistory: [],
    sectors: [
      { id: 'center', name: 'Central Node', zone: 'Calibrated Point', lat: 37.7749, lon: -122.4194, aqi: 84, pm25: 28, x: 50, y: 50, windKmh: 16, humidityPercent: 68 },
      { id: 'north', name: 'North Sector (+8 km)', zone: 'Upwind Ridge', lat: 37.846, lon: -122.4194, aqi: 42, pm25: 10, x: 50, y: 18, windKmh: 22, humidityPercent: 62 },
      { id: 'east', name: 'East Sector (+8 km)', zone: 'Corridor', lat: 37.7749, lon: -122.329, aqi: 128, pm25: 52, x: 80, y: 50, windKmh: 9, humidityPercent: 72 },
      { id: 'south', name: 'South Sector (+8 km)', zone: 'Valley Floor', lat: 37.703, lon: -122.4194, aqi: 96, pm25: 34, x: 50, y: 82, windKmh: 12, humidityPercent: 70 },
    ],
  };
}

test('getAqiBand maps AQI ranges to Atmospheric Obsidian harmonic tiers', () => {
  assert.equal(getAqiBand(32).key, 'optimal');
  assert.equal(getAqiBand(75).key, 'cautionary');
  assert.equal(getAqiBand(165).key, 'unhealthy');
  assert.equal(getAqiBand(248).key, 'hazardous');
});

test('getPollutantBand evaluates concentration relative to safe limit', () => {
  assert.equal(getPollutantBand(12, 15).key, 'optimal');
  assert.equal(getPollutantBand(22, 15).key, 'cautionary');
  assert.equal(getPollutantBand(60, 15).key, 'hazardous');
});

test('calculateRouteExposure produces lower inhaled PM2.5 on green corridor than standard arterial', () => {
  const sample = buildSampleTelemetry();
  const result = calculateRouteExposure(sample, 'center', 'south', 'cycle');

  assert.ok(result.distanceKm >= 1.8);
  assert.ok(result.greenInhaledUg < result.standardInhaledUg);
  assert.ok(result.exposureReductionPercent >= 8);
  assert.ok(result.co2SavedGrams > 0);
  assert.equal(result.corridorPoints.length, 5);
  assert.equal(result.waypoints.length, 3);
});

test('dense health & meteorology helpers compute cigarette equivalence, ventilation, cardinal wind, WMO & distance', () => {
  assert.equal(calculateCigaretteEquivalence(44), 2.0);
  assert.equal(calculateCigaretteEquivalence(168), 7.6);
  assert.equal(calculateVentilationIndex(18, 500), 2500);
  assert.equal(degreesToCardinal(0), 'N');
  assert.equal(degreesToCardinal(270), 'W');
  assert.equal(getWmoWeatherLabel(0), 'Clear Sky');
  assert.equal(getWmoWeatherLabel(95), 'Thunderstorm');
  assert.ok(haversineKm(37.7749, -122.4194, 34.0522, -118.2437) > 500);
});

test('buildTodaySuggestions adapts action cards dynamically to live AQI and meteorology', () => {
  const cautionary = buildSampleTelemetry();
  const cautionaryCards = buildTodaySuggestions(cautionary);
  assert.equal(cautionaryCards.length, 5);
  assert.equal(cautionaryCards[0].id, 'iaq-purifier');
  assert.ok(cautionaryCards[1].title.includes('green travel'));

  const hazardous = { ...cautionary, compositeAqi: 312 };
  const hazardousCards = buildTodaySuggestions(hazardous);
  assert.equal(hazardousCards[0].title, 'Use an air purifier');
  assert.ok(hazardousCards[1].title.includes('N95'));
});


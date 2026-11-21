import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getReadableLocationLabel,
  isCoordinateLocationLabel,
  normalizeLocationSearchResults,
  reverseGeocodeCoords,
  searchIndianLocations,
} from './location';

test('India location search filters other countries and returns readable locality labels', () => {
  const results = normalizeLocationSearchResults(
    [
      {
        id: 1,
        name: 'Warangal',
        admin1: 'Telangana',
        country: 'India',
        country_code: 'IN',
        latitude: 17.9689,
        longitude: 79.5941,
      },
      {
        id: 2,
        name: 'Warangal',
        admin1: 'Other Region',
        country: 'Another Country',
        country_code: 'XX',
        latitude: 10,
        longitude: 20,
      },
    ],
    'IN'
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Warangal');
  assert.equal(results[0].displayLabel, 'Warangal, Telangana, India');
  assert.equal(results[0].countryCode, 'IN');
});

test('India autocomplete requests a dense India-only result set and filters unexpected responses', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestUrl = String(input);
    return new Response(
      JSON.stringify({
        results: [
          {
            id: 'in-1',
            name: 'Hyderabad',
            country: 'India',
            countryCode: 'IN',
            lat: 17.385,
            lon: 78.4867,
            displayLabel: 'Hyderabad, Telangana, India',
          },
          {
            id: 'other-1',
            name: 'Hyderabad',
            country: 'Other Country',
            countryCode: 'XX',
            lat: 0,
            lon: 0,
            displayLabel: 'Hyderabad, Other Country',
          },
        ],
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const results = await searchIndianLocations('Hyderabad');
    assert.match(requestUrl, /countryCode=IN/);
    assert.deepEqual(results.map((result) => result.name), ['Hyderabad']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reverse geocoding GPS coordinates keeps a locality name for display', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        label: 'Warangal, Telangana',
        region: 'Telangana, India',
        country: 'India',
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  try {
    const location = await reverseGeocodeCoords(17.9689, 79.5941);
    assert.equal(location.label, 'Warangal, Telangana');
    assert.equal(location.region, 'Telangana, India');
    assert.equal(isCoordinateLocationLabel(location.label), false);
    assert.equal(isCoordinateLocationLabel('17.969°, 79.594°'), true);
    assert.equal(getReadableLocationLabel('17.969°, 79.594°'), 'Resolving location name...');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiApp } from '../../server';
import { reverseGeocodeCoords, searchIndianLocations } from './location';

async function withApiServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createApiApp().listen(0);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not bind to a TCP port.');
    }
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('location endpoint asks Open-Meteo for up to 100 India-only matches', async () => {
  await withApiServer(async (baseUrl) => {
    const originalFetch = globalThis.fetch;
    let geocodingCountryCode = '';
    let geocodingCount = '';
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      if (requestUrl.startsWith('/api/location/search')) {
        return originalFetch(`${baseUrl}${requestUrl}`, init);
      }
      if (requestUrl.startsWith('https://geocoding-api.open-meteo.com/')) {
        const geocodingUrl = new URL(requestUrl);
        geocodingCountryCode = geocodingUrl.searchParams.get('countryCode') || '';
        geocodingCount = geocodingUrl.searchParams.get('count') || '';
        return new Response(
          JSON.stringify({
            results: [
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
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    try {
      const results = await searchIndianLocations('Warangal');
      assert.equal(geocodingCountryCode, 'IN');
      assert.equal(geocodingCount, '100');
      assert.equal(results.length, 1);
      assert.equal(results[0].displayLabel, 'Warangal, Telangana, India');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('reverse geocoding returns an explicit unknown label when its provider is unavailable', async () => {
  await withApiServer(async (baseUrl) => {
    const originalFetch = globalThis.fetch;
    const providerRequests: string[] = [];
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      if (requestUrl.startsWith('/api/location/reverse')) {
        return originalFetch(`${baseUrl}${requestUrl}`, init);
      }
      providerRequests.push(requestUrl);
      if (requestUrl.startsWith('https://photon.komoot.io/reverse')) {
        return new Response('', { status: 503 });
      }
      return originalFetch(input, init);
    };

    try {
      const location = await reverseGeocodeCoords(17.5902, 78.9554);
      assert.equal(location.label, 'Nearby location');
      assert.equal(location.region, 'Location name unavailable');
      assert.equal(/\d/.test(location.label), false);
      assert.deepEqual(providerRequests, ['https://photon.komoot.io/reverse?lat=17.5902&lon=78.9554']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

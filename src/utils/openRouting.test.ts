import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOsrmRouteUrl, getOsrmProfile, parseOsrmRouteCandidates } from './openRouting';

test('open routing selects only supported OpenStreetMap profiles', () => {
  assert.equal(getOsrmProfile('drive'), 'driving');
  assert.equal(getOsrmProfile('two_wheeler'), 'driving');
  assert.equal(getOsrmProfile('cycle'), 'bike');
  assert.equal(getOsrmProfile('walk'), 'foot');
  assert.equal(getOsrmProfile('transit'), null);
  assert.equal(getOsrmProfile('metro_hybrid'), null);
});

test('OSRM route URLs preserve coordinate order and use the configured provider', () => {
  assert.equal(
    buildOsrmRouteUrl('https://router.example.test/', 'driving', { lat: 28.6, lon: 77.2 }, { lat: 19, lon: 72.8 }),
    'https://router.example.test/route/v1/driving/77.2,28.6;72.8,19?overview=full&geometries=polyline&alternatives=true&steps=true'
  );
  assert.throws(() => buildOsrmRouteUrl('file:///tmp/router', 'driving', { lat: 0, lon: 0 }, { lat: 1, lon: 1 }));
  assert.throws(() =>
    buildOsrmRouteUrl('https://router.example.test?key=secret', 'driving', { lat: 0, lon: 0 }, { lat: 1, lon: 1 })
  );
});

test('OSRM parser keeps only actual routes with geometry and measured distance and duration', () => {
  const routes = parseOsrmRouteCandidates(
    {
      code: 'Ok',
      routes: [
        {
          geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
          distance: 1000,
          duration: 300,
          legs: [{ summary: 'NH 48', steps: [] }],
        },
        { geometry: 'invalid', distance: 500, duration: 100 },
        { geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', distance: 500, duration: 0 },
      ],
    }
  );

  assert.equal(routes.length, 1);
  assert.equal(routes[0].label, 'Primary via NH 48');
  assert.equal(routes[0].distanceKm, 1);
  assert.equal(routes[0].durationMin, 5);
  assert.equal(routes[0].isRoadSnapped, true);
  assert.deepEqual(routes[0].path[0], { lat: 38.5, lon: -120.2 });
  assert.deepEqual(parseOsrmRouteCandidates({ code: 'NoRoute', routes: [] }), []);
});

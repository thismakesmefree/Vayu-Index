import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiApp } from '../../server';

test('Gemini endpoints require a personal key even if a server key is configured', async () => {
  process.env.GEMINI_API_KEY = 'server-only-test-key-that-must-not-be-used';
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
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthResponse.headers.get('cache-control'), 'private, no-store');
    const health = (await healthResponse.json()) as Record<string, unknown>;
    assert.equal(health.ok, true);
    assert.equal('hasMapsBrowserKey' in health, false);
    assert.equal('hasMapsServerKey' in health, false);
    assert.equal('hasServerGeminiKey' in health, false);

    const geminiResponse = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });
    assert.equal(geminiResponse.status, 400);
    const geminiError = (await geminiResponse.json()) as { error: string };
    assert.match(geminiError.error, /personal Gemini API key/i);
    assert.doesNotMatch(geminiError.error, /server-only-test-key/);

    const optimizeResponse = await fetch(`${baseUrl}/api/maps/optimize-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(optimizeResponse.status, 400);

    const transitResponse = await fetch(`${baseUrl}/api/maps/directions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { lat: 28.6, lon: 77.2 },
        destination: { lat: 19, lon: 72.8 },
        transitMode: 'transit',
      }),
    });
    assert.equal(transitResponse.status, 502);
    const transitError = (await transitResponse.json()) as { error: string };
    assert.match(transitError.error, /GTFS transit feed/i);

    const previousRoutingUrl = process.env.OSRM_ROUTING_URL;
    process.env.OSRM_ROUTING_URL = 'file:///not-a-routing-service';
    try {
      const noRouteResponse = await fetch(`${baseUrl}/api/maps/directions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat: 28.6, lon: 77.2 },
          destination: { lat: 19, lon: 72.8 },
          transitMode: 'drive',
        }),
      });
      assert.equal(noRouteResponse.status, 502);
      const noRoute = (await noRouteResponse.json()) as { result?: unknown; error: string };
      assert.equal(noRoute.result, undefined);
      assert.match(noRoute.error, /must use HTTP or HTTPS/i);
    } finally {
      if (previousRoutingUrl === undefined) delete process.env.OSRM_ROUTING_URL;
      else process.env.OSRM_ROUTING_URL = previousRoutingUrl;
    }

    const backgroundResponse = await fetch(`${baseUrl}/api/routes/background-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(backgroundResponse.status, 400);

    const oauthStatusResponse = await fetch(`${baseUrl}/api/auth/status`);
    assert.equal(oauthStatusResponse.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    delete process.env.GEMINI_API_KEY;
  }
});

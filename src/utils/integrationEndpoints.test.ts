import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiApp } from '../../server';

test('health and integration endpoints diagnose missing server keys without contacting providers', async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const previousMapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const previousBrowserMapsKey = process.env.GOOGLE_MAPS_BROWSER_API_KEY;
  const previousServerMapsKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_MAPS_BROWSER_API_KEY;
  delete process.env.GOOGLE_MAPS_SERVER_API_KEY;

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
    assert.deepEqual(await healthResponse.json(), {
      ok: true,
      hasServerGeminiKey: false,
      hasMapsBrowserKey: false,
      hasMapsServerKey: false,
    });

    const mapsResponse = await fetch(`${baseUrl}/api/maps/config`);
    assert.equal(mapsResponse.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await mapsResponse.json(), { configured: false, apiKey: '' });

    const geminiResponse = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });
    assert.equal(geminiResponse.status, 400);
    assert.match((await geminiResponse.json()).error, /GEMINI_API_KEY/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiKey;
    if (previousMapsKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = previousMapsKey;
    if (previousBrowserMapsKey === undefined) delete process.env.GOOGLE_MAPS_BROWSER_API_KEY;
    else process.env.GOOGLE_MAPS_BROWSER_API_KEY = previousBrowserMapsKey;
    if (previousServerMapsKey === undefined) delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
    else process.env.GOOGLE_MAPS_SERVER_API_KEY = previousServerMapsKey;
  }
});

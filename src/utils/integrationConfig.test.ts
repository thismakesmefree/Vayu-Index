import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GEMINI_FLASH_LITE_MODEL,
  GEMINI_FLASH_MODEL,
  getGoogleMapsBrowserApiKey,
  getGoogleMapsServerApiKey,
  resolveGeminiModel,
} from './integrationConfig';

test('resolveGeminiModel accepts both supported model IDs', () => {
  assert.equal(resolveGeminiModel(GEMINI_FLASH_MODEL), GEMINI_FLASH_MODEL);
  assert.equal(resolveGeminiModel(GEMINI_FLASH_LITE_MODEL), GEMINI_FLASH_LITE_MODEL);
});

test('resolveGeminiModel safely falls back for unknown or missing models', () => {
  assert.equal(resolveGeminiModel(undefined), GEMINI_FLASH_MODEL);
  assert.equal(resolveGeminiModel('unknown-model'), GEMINI_FLASH_MODEL);
});

test('Maps key resolution requires the documented variables and ignores unsupported aliases', () => {
  assert.equal(getGoogleMapsBrowserApiKey({}), '');
  assert.equal(getGoogleMapsServerApiKey({}), '');
  assert.equal(
    getGoogleMapsBrowserApiKey({ VITE_GOOGLE_MAPS_API_KEY: 'legacy', MAPS_API_KEY: 'legacy' }),
    ''
  );
  assert.equal(
    getGoogleMapsServerApiKey({ VITE_GOOGLE_MAPS_API_KEY: 'legacy', MAPS_API_KEY: 'legacy' }),
    ''
  );
  assert.equal(getGoogleMapsBrowserApiKey({ GOOGLE_MAPS_BROWSER_API_KEY: '  ' }), '');
  assert.equal(getGoogleMapsServerApiKey({ GOOGLE_MAPS_SERVER_API_KEY: '  ' }), '');
});

test('Maps key resolution falls back to the legacy key when a dedicated key is blank', () => {
  const env = {
    GOOGLE_MAPS_BROWSER_API_KEY: '  ',
    GOOGLE_MAPS_SERVER_API_KEY: '',
    GOOGLE_MAPS_API_KEY: ' legacy-key ',
  };
  assert.equal(getGoogleMapsBrowserApiKey(env), 'legacy-key');
  assert.equal(getGoogleMapsServerApiKey(env), 'legacy-key');

  assert.equal(
    getGoogleMapsBrowserApiKey({ ...env, GOOGLE_MAPS_BROWSER_API_KEY: ' browser-key ' }),
    'browser-key'
  );
});

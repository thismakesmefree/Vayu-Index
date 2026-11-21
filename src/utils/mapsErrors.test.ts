import test from 'node:test';
import assert from 'node:assert/strict';
import { isMapsQuotaConsoleError } from './mapsErrors';

test('Maps quota detection does not attribute generic Gemini resource exhaustion to Maps', () => {
  assert.equal(isMapsQuotaConsoleError('GoogleGenAI RESOURCE_EXHAUSTED: quota exceeded'), false);
  assert.equal(isMapsQuotaConsoleError('Google Maps JavaScript API error: OverQuotaMapError'), true);
  assert.equal(isMapsQuotaConsoleError('Google Maps Platform RESOURCE_EXHAUSTED'), true);
});

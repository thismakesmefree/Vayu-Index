import test from 'node:test';
import assert from 'node:assert/strict';
import { getGeminiErrorHttpStatus } from './geminiErrors';

test('preserves Gemini SDK HTTP statuses for authentication, billing, and model errors', () => {
  assert.equal(getGeminiErrorHttpStatus(Object.assign(new Error('Unauthorized'), { status: 401 })), 401);
  assert.equal(getGeminiErrorHttpStatus(Object.assign(new Error('Payment required'), { status: 402 })), 402);
  assert.equal(getGeminiErrorHttpStatus(Object.assign(new Error('Model not found'), { status: 404 })), 404);
});

test('preserves quota status and falls back for errors without an HTTP status', () => {
  assert.equal(
    getGeminiErrorHttpStatus(Object.assign(new Error('Resource exhausted'), { status: 429 })),
    429
  );
  assert.equal(getGeminiErrorHttpStatus(new Error('API_KEY_INVALID')), 400);
  assert.equal(getGeminiErrorHttpStatus(new Error('Unexpected transport failure')), 500);
});

test('ignores invalid error status values and preserves legacy message classification', () => {
  assert.equal(
    getGeminiErrorHttpStatus(Object.assign(new Error('PERMISSION_DENIED'), { status: 200 })),
    403
  );
  assert.equal(getGeminiErrorHttpStatus({ status: '401' }), 500);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GEMINI_FLASH_LITE_MODEL,
  GEMINI_FLASH_MODEL,
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

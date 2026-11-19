import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FREE_PROMPTS_PER_DAY,
  QUOTA_STORAGE_KEY,
  consumeFreeTierPrompt,
  getLocalDateKey,
  readDailyQuota,
  type StorageLike,
} from './quota';

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

test('Free Tier quota starts at 10 prompts remaining and decrements strictly to 0', () => {
  const storage = createMemoryStorage();
  const day1 = new Date('2026-11-18T08:00:00');

  const initial = readDailyQuota(storage, day1);
  assert.equal(initial.remaining, MAX_FREE_PROMPTS_PER_DAY);
  assert.equal(initial.usedCount, 0);
  assert.equal(initial.isExhausted, false);

  for (let i = 1; i <= 10; i++) {
    const res = consumeFreeTierPrompt(storage, day1);
    assert.equal(res.allowed, true);
    assert.equal(res.status.usedCount, i);
    assert.equal(res.status.remaining, 10 - i);
  }

  const eleventh = consumeFreeTierPrompt(storage, day1);
  assert.equal(eleventh.allowed, false);
  assert.equal(eleventh.status.remaining, 0);
  assert.equal(eleventh.status.isExhausted, true);
});

test('Free Tier quota automatically resets on the next calendar day (24h reset)', () => {
  const storage = createMemoryStorage();
  const day1 = new Date('2026-11-18T23:50:00');
  const day2 = new Date('2026-11-19T00:05:00');

  // Exhaust day 1
  for (let i = 0; i < 10; i++) {
    consumeFreeTierPrompt(storage, day1);
  }
  assert.equal(readDailyQuota(storage, day1).isExhausted, true);

  // Next calendar date automatically resets remaining back to 10
  const resetStatus = readDailyQuota(storage, day2);
  assert.equal(resetStatus.dateKey, getLocalDateKey(day2));
  assert.equal(resetStatus.usedCount, 0);
  assert.equal(resetStatus.remaining, 10);
  assert.equal(resetStatus.isExhausted, false);

  const persisted = JSON.parse(storage.getItem(QUOTA_STORAGE_KEY) || '{}');
  assert.equal(persisted.usedCount, 0);
});

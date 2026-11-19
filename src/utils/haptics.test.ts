import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMobileDevice,
  HAPTIC_PATTERNS,
  isHapticsEnabled,
  setHapticsEnabled,
  triggerHaptic,
} from './haptics';

test('detectMobileDevice identifies mobile UA and coarse pointer devices', () => {
  assert.equal(detectMobileDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), true);
  assert.equal(detectMobileDevice({ coarsePointer: true, userAgent: 'Mozilla/5.0' }), true);
  assert.equal(detectMobileDevice({ maxTouchPoints: 5, narrowViewport: true, userAgent: 'Mozilla/5.0' }), true);
  assert.equal(
    detectMobileDevice({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', coarsePointer: false, maxTouchPoints: 0 }),
    false
  );
});

test('triggerHaptic vibrates only on mobile devices when enabled', () => {
  const calls: Array<number | number[]> = [];
  const mockVibrate = (pattern: number | number[]) => {
    calls.push(pattern);
    return true;
  };

  const desktopRes = triggerHaptic('medium', { isMobile: false, enabled: true, vibrate: mockVibrate });
  assert.equal(desktopRes.triggered, false);
  assert.equal(desktopRes.reason, 'desktop');
  assert.equal(calls.length, 0);

  const disabledRes = triggerHaptic('medium', { isMobile: true, enabled: false, vibrate: mockVibrate });
  assert.equal(disabledRes.triggered, false);
  assert.equal(disabledRes.reason, 'disabled');
  assert.equal(calls.length, 0);

  const mobileRes = triggerHaptic('success', { isMobile: true, enabled: true, vibrate: mockVibrate });
  assert.equal(mobileRes.triggered, true);
  assert.deepEqual(calls[0], HAPTIC_PATTERNS.success);
});

test('haptics preference persists via storage helper', () => {
  const mem = new globalThis.Map<string, string>();
  const store = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };
  assert.equal(isHapticsEnabled(store), true);
  setHapticsEnabled(false, store);
  assert.equal(isHapticsEnabled(store), false);
  setHapticsEnabled(true, store);
  assert.equal(isHapticsEnabled(store), true);
});
